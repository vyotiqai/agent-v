# Agent V architecture

Agent V is a personal agent you give outcomes to. It plans, works in the background, uses a
browser, a sandboxed Linux computer, your mail and calendar, and files, and stops for your input
or approval before anything leaves the system. It is a ground-up rebuild of the ideas in
[CopilotKit/OpenMuse](https://github.com/CopilotKit/openmuse), designed from the start for many
users, fully self-hostable, and with no required hosted service apart from a model provider.

## Principles

1. **One database.** Postgres holds users, chats, tasks, durable workflow state, queues,
   memory (pgvector) and realtime fan-out (LISTEN/NOTIFY). No Redis, no separate orchestrator.
2. **Open protocols at the edges.** Chat streams as [AG-UI 1.0](https://docs.ag-ui.com) events,
   so any AG-UI client or agent can plug in. Tools can come from any MCP server.
3. **Durable by default.** Anything longer than a chat reply is a workflow whose every model
   call and tool call is checkpointed. Restarts resume, they never repeat a finished step.
4. **Nothing external without review.** Tools that write to the outside world create an action
   record bound to a content hash. It runs only after the owner approves that exact hash.
5. **Push, not poll.** Clients hold one SSE stream for workspace changes.
6. **Tenant isolation everywhere.** Every row carries `user_id`; every query is scoped by the
   authenticated user; browsers and sandboxes are per user.

## Stack (September 2026)

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | Node 24 LTS (22.12+ works), native TypeScript type stripping | No build step for the server; Playwright and `pg` are first-class. |
| HTTP | Hono 4.13 | Tiny, fast, web-standard, portable to Bun or edge later. |
| Auth | Better Auth 1.7 (email/password, bearer tokens, organization and admin plugins) | Self-hosted, TypeScript-native, grows from one user to SaaS. |
| Database | Postgres 18 (16+ works) with Drizzle ORM 0.45 | Typed SQL, zero runtime overhead, generated migrations. |
| Durable work | DBOS Transact 5 | Library, Postgres-only, MIT. Steps, `recv` waits, cancel/resume/fork, queues, cron. |
| Agent loop | Vercel AI SDK 7 | Widest provider support: OpenAI, Anthropic, Google, any OpenAI-compatible endpoint. |
| Wire protocol | AG-UI 1.0 over SSE | Open standard with interrupts; clients stay framework-independent. |
| Client | Expo SDK 57 (→ 58) + Expo Router, one codebase for iOS, Android and web | Native navigation on phones, real URLs on web. |
| Styling | Uniwind (Tailwind 4) | Fastest Tailwind for React Native; shared tokens across platforms. |
| Lists | Legend List 3 | Virtualised chat that stays pinned to the bottom on native and web. |
| Tooling | pnpm, Turborepo, Biome 2, TypeScript 7 (Go `tsc`), Vitest 5 | Fast feedback loops. |

Later phases add: Playwright driving per-user Chromium containers (kernel-images, CDP
screencast and WebRTC takeover), a `SandboxProvider` (Docker + gVisor by default, microVMs when
KVM is present, hosted providers optional), S3-compatible storage (Garage or R2), pgvector
memory, MCP client, Expo push, and realtime voice.

## Components

```
apps/app  (Expo: iOS, Android, web)
   │  AG-UI SSE (chat runs)        SSE /api/events (workspace changes)
   │  REST /api/*                  Better Auth /api/auth/*
   ▼
apps/server  (Hono on Node)
   ├─ auth         Better Auth; bearer tokens; session → user id
   ├─ chat         AI SDK streamText → AG-UI mapper; history in Postgres
   ├─ tasks        DBOS workflows: plan, steps, ask_user, approvals, cancel/resume
   ├─ actions      approval records bound to hashes; executors per action kind
   ├─ realtime     pg NOTIFY → per-user SSE fan-out
   ├─ models       provider registry (openai, anthropic, google, compat, demo)
   └─ tools        web_fetch (SSRF-guarded), memory, tasks … later mail, browser, sandbox, MCP
   ▼
Postgres  (app schema + dbos schema)
```

### Chat run

1. The client posts a user message to `POST /api/threads/:id/runs`.
2. The server stores it, loads the thread history, and calls `streamText` with the chat tools.
3. AI SDK stream parts are mapped to AG-UI events (`RUN_STARTED`, `TEXT_MESSAGE_*`,
   `TOOL_CALL_*`, `RUN_FINISHED` / `RUN_ERROR`) and streamed as SSE.
4. When the run ends, the assistant and tool messages are saved in AG-UI message form, so any
   device can replay the thread.

Long jobs are handed to `delegate_task`, which starts a durable workflow and returns at once.

### Durable task

Each task is one DBOS workflow whose id is the task id. The loop:

1. Ask the model for the next step (`generateText` without executable tools). This call is a
   DBOS step, so after a crash its recorded result is reused rather than re-requested.
2. Execute each requested tool call as its own DBOS step, then append the results.
3. `ask_user` and approval-gated tools write a waiting state, notify the owner, and block on
   `DBOS.recv` until the app sends an answer or decision (days if needed).
4. `finish_task` records the result and notifies the owner.

Cancel maps to `DBOS.cancelWorkflow`; resume and retry map to `DBOS.resumeWorkflow`.

### Actions and approvals

An external write (for example posting to a webhook, later sending mail) is proposed as an
action with a SHA-256 hash of its exact content and an expiry. Approval must quote that hash,
so a changed proposal cannot be approved by a stale screen. A claim step moves the action from
`awaiting_review` to `executing` atomically, and a crash during execution leaves
`outcome_unknown` instead of retrying.

### Cloud browser

`apps/browser` is a separate process (or container) holding persistent Chromium sessions. The
API owns which user owns which session (`browser_sessions`), and it is the only client of the
worker, authenticated with a shared token.

```
app ──signed WS──▶ API /api/browsers/:id/live ──token WS──▶ worker ──CDP screencast──▶ Chromium
                                                                                │
                                              egress proxy (resolve once, check, pin IP) ◀─┘
```

- Chromium is launched with `--host-resolver-rules=MAP * ~NOTFOUND` and a proxy, so it cannot
  resolve or connect by itself. The proxy resolves each host once, rejects private, reserved
  and metadata addresses, and connects to the checked IP. Only ports 80 and 443 are allowed.
- Live view uses `Page.startScreencast`; frames go out only while someone watches, and slow
  viewers drop frames instead of buffering. Input (tap, type, keys, scroll, navigate) comes back
  over the same socket, and every URL is validated again.
- Images and WebSockets cannot carry a bearer header, so the API issues HMAC-signed links bound
  to user, path and expiry (15 minutes for screenshots, one minute to open a live view).
- Each chat and each task gets its own session; profiles persist until deleted, and the worker
  recycles idle browsers.

### Mail, calendar and documents

`providers/` exposes one `WorkspaceProvider` per user: Google when connected, otherwise the
demo workspace. Reads go straight through; every write is an action. An action records the
account it was prepared for, so an approval can never send from a different account than the
one reviewed. Google errors that leave the outcome uncertain (network drops, 5xx after a
send) are recorded as `outcome_unknown` and are never retried automatically.

Files are stored under `DATA_DIR` by server-generated ids, with a SHA-256 checked on every
read, and are served through signed, 15-minute links (framing allowed only for the app's own
origins). Filling a PDF always produces a new file and removes document, page and field
scripts from the copy.

### Linux computer

`computer/` drives the Docker CLI with argument lists only (never a shell). Each user has one
container plus one volume, both named from a hash of the user id and the deployment id, and
labelled with their owner. The container runs with no network, a read-only root filesystem,
no capabilities and no-new-privileges, as a non-root user, under memory, CPU and PID limits,
with `--init` so leftover processes are reaped. Before every use the server inspects the
container and refuses one that does not match these settings.

Commands go through `docker exec … timeout … bash -c`, one at a time per user (a partial
unique index on running commands), and every run leaves a saved record of its status, exit
code and output. An operation id makes a retried request return the original record instead
of running the command again; a durable task uses its tool-call id, so a replayed step never
runs a command twice. Commands that were running when the server stopped are marked
`interrupted` at startup.

### Goals, watches, ideas and money

`goals/` stores goals with their milestones in one JSON column, changed under a row lock so a
person editing and a task finishing never overwrite each other. Tasks carry an optional
`goal_id` and `milestone_id`; the step that finishes a task records progress on its goal.

`monitors/` runs watches without a workflow per watch. A DBOS schedule fires every minute on
every server. It reads the watches that are due and starts one `monitor-check` workflow per
watch and due time, with the workflow id `monitor:<id>:<due time>`, so each check runs once no
matter how many servers fire. A check reads the page through the network guard, then records
the result only if the watch is still active and still due at that time. A check that
finishes after the owner paused or re-checked the watch changes nothing. Alerts are keyed by
watch and state change (the new page hash, or the moment a condition became true), so a
notification is never sent twice.

`ideas/` recomputes suggestions from the mail provider, goals, spending reports and paused
watches. Each idea's id is derived from its source, so inserting is idempotent and a
dismissed idea stays dismissed. Open ideas whose source no longer asks for them (answered,
planned) are retired, but only for sources that were read successfully. Accepting claims the
idea and creates its task under an id derived from the idea, so a double tap starts one task.

`finance/` parses CSV (RFC 4180, delimiter and date-order detection, European numbers,
debit/credit columns) into integer cents. It infers the sign convention and says which one it
used, categorizes by keyword when the file has no categories, and finds recurring charges
(one charge a month at a steady amount).

### Connectors (MCP)

`mcp/` uses the official MCP TypeScript SDK as a client. Each operation opens a short-lived
Streamable HTTP session through `guardedFetch` (DNS pinned, private networks refused, redirects
refused) and closes it; nothing is shared between users. OAuth follows the MCP authorization
spec through the SDK's `auth()` with a provider backed by the database: the client registration,
tokens and PKCE verifier are sealed in the connector row, and the redirect's `state` is a
single-use row bound to the user and connector. Tools are listed once and cached on the row with
their read-only and destructive hints. The agent sees them as `mcp_<connector>_<tool>`: read-only
tools run directly; others become `mcp.call` actions that the owner approves (in a task, the
workflow waits for the decision like any other action). Once a call has been sent, only an
answer from the server settles it; a dropped connection is an unknown outcome.

### Memory

Memories carry a pgvector embedding and the id of the model that made it, so vectors from
different models are never compared; after a model change, older rows are re-embedded lazily.
Retrieval is an exact cosine scan of one user's rows (small sets; an HNSW index can come later),
returning the closest few plus the newest few. After each chat turn a `learn-memories` workflow
extracts durable facts from the owner's own message (the model, or rules for the demo model),
drops near-duplicates, and saves the rest as learned memories.

### Push

`notify()` stores a notification and enqueues `push-notification:<id>` for owners with devices.
The workflow checks the category preference, sends to Expo (batched tickets) and Web Push
(payload encrypted by `web-push`, then posted through the network guard), removes devices the
services report as gone, and retries only the devices that hit a transient failure. Work is
enqueued with the DBOS client rather than `startWorkflow`, because DBOS refuses to start
workflows from inside a step, and notifications are usually created inside steps.

### Voice and streaming Markdown

`POST /api/voice/transcribe` takes a recording (10 MB) and runs the configured transcription
model through the AI SDK. The app records with expo-audio (phones) or MediaRecorder (web), falls
back to the browser's speech recognition when the server has no model, and speaks replies with
expo-speech. Chat Markdown is parsed by `@agent-v/shared/markdown`: while a reply streams, the
last block's unfinished syntax is closed, and blocks are memoized by source so only the growing
block re-renders.

### Realtime

Mutations call `publish(userId, event)`, which runs `pg_notify`. Every server process listens
on one connection and forwards events to that user's open SSE streams. Clients refetch what
changed; nothing polls.

### Plans, metering and billing

Every model call goes through `meteredModel` (AI SDK middleware), which adds the provider's
token counts to `usage_counters` (user, month, metric). If a stream ends without the provider's
usage report, because the person stopped it or closed the app, it records an estimate instead.
Tasks, browser actions, computer seconds and voice seconds are counted where they happen.
Storage, connectors and watches are counted live.

`assertQuota` runs before the work starts:

- It returns HTTP 402 with a message saying which limit was reached and when it resets.
- Only the plan's limits are cached (30 s), never the counters.
- Learning from chat skips quietly instead of failing.

A person's plan is the best of three:

- their own Stripe subscription
- a grant from an operator
- their team's subscription

Stripe webhooks are verified with HMAC over timestamp and body, with a 5-minute tolerance.
They are handled by fetching the subscription from Stripe rather than trusting the event, so
replays and out-of-order delivery converge. A late event about an old, ended subscription
never overrides a live one. Team seats follow membership through a `billing-seats` workflow
that retries and uses Stripe idempotency keys.

### Teams and operators

**Teams** are Better Auth organizations. The app reaches them only through `/api/team`,
which enforces:

- one team per person
- who may do what (owners, admins, members)
- invitation delivery: email, plus a notification in the app for existing accounts

Better Auth's own `/organization/*`, `/admin/*` and `/delete-user` endpoints are closed to
clients. When email is really delivered, invitations require a confirmed address.

**Operators** (`ADMIN_EMAILS`) have a narrowed admin role: list, get and ban users, and list
and revoke sessions. There is no impersonation, password setting or account editing.

### Export and deletion

**Export** streams a ZIP (fflate) of JSON per area plus the files. Tokens, sealed secrets,
push addresses and embeddings are left out. Phones and the desktop app download through a
5-minute signed link.

**Deletion** requires the password and runs in two stages:

1. **Before the rows go:**
   - refuse if the person owns a team with other members
   - cancel Stripe
   - cancel running workflows
   - remove browser sessions, the Linux computer and files
2. **After the rows go:** erase the workflow history. Every workflow records its owner as the
   DBOS `authenticatedUser`, which is how it is found.

### Operations

**Telemetry:**

- OpenTelemetry is enabled by `OTEL_EXPORTER_OTLP_ENDPOINT`.
- Every request gets a server span named by its route. It continues the caller's
  `traceparent`, and AI SDK spans (via `@ai-sdk/otel`) nest inside it.
- AI spans carry model and token counts but no prompt or reply text unless
  `OTEL_RECORD_CONTENT=true`.
- Metrics: `http.server.request.duration` and `agent_v.tokens`.

**Several replicas:**

- A chat reply holds a 60-second lease on its thread row, renewed while it streams and
  released after the reply is saved.
- Migrations run behind `pg_advisory_lock`.
- Rate limits can live in Postgres (`RATE_LIMIT_STORE=postgres`), one upsert per request;
  Better Auth's sign-in limits use the same store.

## Security notes

- Server-side fetches resolve DNS once, reject private, loopback, link-local, CGNAT and
  metadata ranges, and connect to the pinned address, so DNS rebinding cannot reach internal
  hosts.
- Model output, page text and email content are treated as data. System prompts say so, and
  no tool lets the model approve its own actions.
- Provider keys never leave the server.

## Known limits

- Passkeys, social sign-in and SSO for teams are not switched on yet.
- Uploaded files live on a volume. Several replicas need a ReadWriteMany volume until
  S3-compatible storage lands.
- `web_fetch` (used only without a browser worker) reads static HTML.
- One worker process serves every user's sessions; hard per-user isolation (a container per
  user) and WebRTC take-over are next steps.
- The demo model follows fixed rules so the product can be exercised offline; it is not a
  substitute for a real model.
