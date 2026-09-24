# Agent V

A personal agent you hand outcomes to. It plans, works in the background, reads the web, and
stops for your input or approval before anything leaves the system. One codebase for iOS,
Android and web; a small, fast, self-hostable server; any model provider.

Agent V is a from-scratch rebuild of the ideas in
[CopilotKit/OpenMuse](https://github.com/CopilotKit/openmuse), designed for many users and with
no required hosted service apart from your model provider.

> **Status: phases 1–6 of 7.** Chat, durable background tasks, approvals, a cloud browser you can
> take over, Gmail/Calendar, PDF documents, a private Linux computer, goals, page watches, ideas,
> spending, MCP connectors, semantic memory, push notifications and voice work end to end.
> SaaS hardening (organisations, quotas, billing, observability) is next; see the
> [roadmap](docs/ROADMAP.md).

## What works today

| Area | Details |
| --- | --- |
| **Accounts** | Multi-user email/password sign-in (Better Auth). Bearer tokens on mobile. Every row is scoped to its owner. |
| **Chat** | Streams [AG-UI 1.0](https://docs.ag-ui.com) events over SSE, rendered as Markdown (tables, code, lists) that never flashes half-written syntax and re-renders only the block that is still growing. Tool activity shows inline. Send becomes Stop while a reply streams, and typed follow-ups queue. Chats are stored, renamable and archivable. |
| **Models** | OpenAI, Anthropic, Google, and any OpenAI-compatible endpoint (Ollama, vLLM, LM Studio, OpenRouter…). An offline demo model makes everything work with no key. |
| **Background tasks** | Durable DBOS workflows. Every model call and tool call is checkpointed, so restarts resume. Tasks have plans, progress, questions for you, cancel, resume, and retry from the failed step. |
| **Approvals** | External writes (emails, calendar events, webhooks) run only after you approve that exact payload (hash-bound, expiring, run at most once, `outcome_unknown` on crashes). |
| **Cloud browser** | Real Chromium per chat and per task (`apps/browser`). The agent can `browse`, `click_link` and `read_page`. You watch it live in chat and **Take control** by tapping, typing, scrolling or using the address bar. Logins persist per session. All traffic goes through an egress proxy that blocks private networks. |
| **Mail and calendar** | Connect Google per user (OAuth with PKCE; refresh tokens encrypted with AES-256-GCM). The agent searches and reads mail, checks the calendar, and *proposes* emails and events. You approve the exact message, and it is sent from the account you reviewed. Without Google, a fictional demo mailbox lets you try everything. |
| **Documents** | Upload PDFs, save email attachments or browser downloads to Files, view them in the app, and fill supported forms into a new copy with scripts removed. The permission-slip flow works end to end: find the email, fill the form with your answers, then reply with it attached after your review. |
| **Linux computer** | Each person gets a private Docker container (optionally gVisor) with bash, Node and Python. It has no network, a read-only system, no capabilities and runs as a non-root user; only `/workspace` persists. There is a terminal with a saved record of every command and its output, plus a file browser and editor, and PDF transfer to and from Files. The agent runs commands through the same record. Retries return the original result instead of running twice, and interrupted commands are never re-run automatically. |
| **Goals** | Outcomes with milestones. Start a task for any milestone and it is checked off when the task succeeds; other finished tasks for the goal are added as done milestones. A goal without a plan gets one from a background task. |
| **Watches** | Recurring checks of a public page: any change (with what changed), text appearing, or a price dropping below a threshold in a chosen currency. One scheduler per minute enqueues each due check exactly once, even with several servers. Failures back off exponentially and pause the watch after five in a row. You get one alert per change, not one per check. Built-in demo pages let you try it offline. |
| **Ideas** | Suggestions with their evidence: forms to fill from your mail, questions waiting for a reply (with your calendar for that day), goals without a plan, recurring charges, broken watches. Edit what the agent will do, then accept (one task, however often you tap) or dismiss (it never comes back). Suggestions retire themselves once handled. |
| **Money** | Import a bank or card CSV: comma, semicolon or tab; debit/credit or signed amounts; US, European and ISO dates and numbers. Get spending by category and month, top merchants and recurring charges, and turn a report into a savings goal with a plan. The agent answers spending questions from it. |
| **Connectors (MCP)** | Add any MCP server (Streamable HTTP) with no auth, a token, or sign-in (the MCP authorization spec: discovery, dynamic client registration, PKCE, resource indicators, refresh). Its tools become the agent's tools in chat and in background tasks. Per tool: run, ask first, or off; read-only tools run by default and everything else asks, through the same hash-bound approvals as email. A call whose connection drops mid-flight is reported as an unknown outcome, never retried. Built-in sample tools to try it. |
| **Memory** | Memories are embedded (any embedding model, or an offline one) and stored in pgvector. Each reply sees the memories relevant to the message plus the newest few, not everything; `recall_memory` searches the rest. After a chat turn, lasting facts you state ("I'm vegetarian", "my sister's name is Ana") are learned in the background and shown in Settings, where you can delete them or turn learning off. Repeats are recognised and not saved twice. |
| **Push notifications** | Phones through Expo (APNs/FCM) and browsers through Web Push (VAPID, encrypted per browser). Choose categories: questions and approvals, finished tasks, watch alerts. Delivery is a durable workflow that retries outages and removes devices the push services no longer know. Tapping opens what it is about. |
| **Voice** | Tap the mic to dictate (recorded on the device, transcribed on your server by any OpenAI-compatible speech model, or by the browser's own recognition when none is set). Voice mode is hands-free: it listens, stops when you pause, sends, reads the reply aloud with the device's voice, and listens again. Any reply can be read aloud. |
| **Web reading** | Without a browser worker, `web_fetch` reads static pages. It pins DNS and blocks private, loopback, link-local and metadata addresses, including after redirects. |
| **Memory and inbox** | Facts you ask the agent to remember, and notifications for results, questions, reviews and watch alerts (each opens what it is about). |
| **Live updates** | One SSE stream per device, fed by Postgres LISTEN/NOTIFY. No polling. |

## Quick start

Requirements: Node 22.12+ (24 LTS recommended), pnpm 10+, and Postgres 16+ with the pgvector extension (or Docker).

```sh
git clone https://github.com/vyotiqai/agent-v.git && cd agent-v
pnpm install
docker compose up -d                  # Postgres 18 with pgvector on 127.0.0.1:5432
cp .env.example .env
# Set BETTER_AUTH_SECRET (openssl rand -base64 32). Add provider keys if you have them.
pnpm dev:server                       # API on http://localhost:8787 (runs migrations on start)
pnpm dev:app                          # Expo: press w for web, i for iOS, a for Android
```

Cloud browser (optional): set `BROWSER_URL=http://127.0.0.1:8790` and a random
`BROWSER_TOKEN` (32+ characters) in `.env`, then run it locally or in Docker:

```sh
pnpm --filter @agent-v/browser exec playwright-core install chromium
pnpm dev:browser
# or: docker compose up -d browser
```

Open http://localhost:8081, create an account, and try:

- **Plan a weekend trip to Lisbon.** A background task starts; follow it in Tasks.
- **Remember that I prefer window seats.** This saves a memory.
- **Summarize https://example.com.** The agent reads the page.
- In Tasks, **"Book a table and ask me first about the budget"**. The task pauses for your answer.
- **Complete the permission slip.** The agent finds the form, asks for your details, fills the PDF and prepares the reply for you to approve.
- **Reply to Sam: count me in!** An approval card appears in chat, and nothing is sent until you approve.

Linux computer (optional, needs Docker):

```sh
docker build -t agent-v-computer:local apps/computer
# in .env: COMPUTER_PROVIDER=docker
```

To use your real Gmail and Calendar, add a Google OAuth client and an encryption key (see
`.env.example`), then open **Settings → Accounts → Connect Google**.

For a real model, set for example `DEFAULT_MODEL=anthropic/claude-sonnet-5` and
`ANTHROPIC_API_KEY=…`, and list extra choices in `ALLOWED_MODELS`. Local models:

```sh
OPENAI_COMPATIBLE_PROVIDERS=[{"name":"ollama","baseURL":"http://127.0.0.1:11434/v1","models":["qwen3:32b"]}]
```

On a phone, set `EXPO_PUBLIC_API_URL` to an address the device can reach, and add the app
origin to `ALLOWED_ORIGINS`.

## Layout

| Path | What it is |
| --- | --- |
| `apps/server` | Hono API, Better Auth, Drizzle schema and migrations, AI SDK agent, DBOS tasks and schedules, approvals, goals, watches, ideas, finance, realtime. |
| `apps/browser` | Cloud browser worker: Chromium sessions, egress proxy, live view and take-control. |
| `packages/net` | Network guard shared by the API and the browser (public addresses only, DNS pinning). |
| `apps/computer` | Image for the per-user Linux computer and its workspace file helper. |
| `apps/app` | Expo SDK 57 + Expo Router app for iOS, Android and web; Uniwind (Tailwind 4) styling; Legend List chat. |
| `packages/shared` | Domain types, request schemas and the SSE reader, shared by server and app. |
| `docs` | [Architecture](docs/ARCHITECTURE.md) and [roadmap](docs/ROADMAP.md). |

## Development

```sh
pnpm lint          # Biome
pnpm typecheck     # TypeScript 7 across all packages
pnpm test          # Vitest; server tests need Postgres (TEST_DATABASE_URL)
pnpm --filter @agent-v/app build:web
```

The server tests run against a real Postgres. They cover auth, tenant isolation, AG-UI
streaming, durable tasks (pause for input, cancel, resume, retry after failure), the approval
gate, SSRF protection and live events. CI runs lint, types, tests and web/iOS/Android bundle
exports.
