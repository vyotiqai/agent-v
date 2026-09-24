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
| Auth | Better Auth 1.7 (email/password, bearer tokens for mobile; passkeys, OAuth, orgs later) | Self-hosted, TypeScript-native, grows from one user to SaaS. |
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

### Realtime

Mutations call `publish(userId, event)`, which runs `pg_notify`. Every server process listens
on one connection and forwards events to that user's open SSE streams. Clients refetch what
changed; nothing polls.

## Security notes

- Server-side fetches resolve DNS once, reject private, loopback, link-local, CGNAT and
  metadata ranges, and connect to the pinned address, so DNS rebinding cannot reach internal
  hosts.
- Model output, page text and email content are treated as data. System prompts say so, and
  no tool lets the model approve its own actions.
- Provider keys never leave the server.

## Known limits of the foundation (phase 1)

- One chat run per thread is enforced per process. Horizontally scaled APIs need sticky
  routing or a Postgres advisory lock for that guarantee.
- Chat Markdown is a small built-in subset; streaming Markdown with code highlighting
  (react-native-enriched-markdown / streamdown) arrives with phase 6.
- Email verification, password reset, passkeys and OAuth sign-in are Better Auth plugins that
  are not switched on yet.
- `web_fetch` (used only without a browser worker) reads static HTML.
- One worker process serves every user's sessions; hard per-user isolation (a container per
  user) and WebRTC take-over are next steps.
- The demo model follows fixed rules so the product can be exercised offline; it is not a
  substitute for a real model.
