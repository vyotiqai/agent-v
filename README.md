# Agent V

A personal agent you hand outcomes to. It plans, works in the background, reads the web, and
stops for your input or approval before anything leaves the system. One codebase for iOS,
Android and web; a small, fast, self-hostable server; any model provider.

Agent V is a from-scratch rebuild of the ideas in
[CopilotKit/OpenMuse](https://github.com/CopilotKit/openmuse), designed for many users and with
no required hosted service apart from your model provider.

> **Status: phases 1–2 of 7.** Chat, durable background tasks, approvals, memory, live updates
> and a cloud browser you can watch and take over work end to end. Gmail/Calendar, documents,
> the Linux computer, goals/tracking, MCP connectors, push and voice follow; see the
> [roadmap](docs/ROADMAP.md).

## What works today

| Area | Details |
| --- | --- |
| **Accounts** | Multi-user email/password sign-in (Better Auth). Bearer tokens on mobile. Every row is scoped to its owner. |
| **Chat** | Streams [AG-UI 1.0](https://docs.ag-ui.com) events over SSE. Tool activity shows inline. Send becomes Stop while a reply streams, and typed follow-ups queue. Chats are stored, renamable and archivable. |
| **Models** | OpenAI, Anthropic, Google, and any OpenAI-compatible endpoint (Ollama, vLLM, LM Studio, OpenRouter…). An offline demo model makes everything work with no key. |
| **Background tasks** | Durable DBOS workflows. Every model call and tool call is checkpointed, so restarts resume. Tasks have plans, progress, questions for you, cancel, resume, and retry from the failed step. |
| **Approvals** | External writes (webhooks today; mail and calendar next) run only after you approve that exact payload (hash-bound, expiring, run at most once, `outcome_unknown` on crashes). |
| **Cloud browser** | Real Chromium per chat and per task (`apps/browser`). The agent can `browse`, `click_link` and `read_page`. You watch it live in chat and **Take control** by tapping, typing, scrolling or using the address bar. Logins persist per session. All traffic goes through an egress proxy that blocks private networks. |
| **Web reading** | Without a browser worker, `web_fetch` reads static pages. It pins DNS and blocks private, loopback, link-local and metadata addresses, including after redirects. |
| **Memory and inbox** | Facts you ask the agent to remember, and notifications for results, questions and reviews. |
| **Live updates** | One SSE stream per device, fed by Postgres LISTEN/NOTIFY. No polling. |

## Quick start

Requirements: Node 22.12+ (24 LTS recommended), pnpm 10+, and Postgres 16+ (or Docker).

```sh
git clone https://github.com/vyotiqai/agent-v.git && cd agent-v
pnpm install
docker compose up -d                  # Postgres 18 on 127.0.0.1:5432
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
| `apps/server` | Hono API, Better Auth, Drizzle schema and migrations, AI SDK agent, DBOS tasks, approvals, realtime. |
| `apps/browser` | Cloud browser worker: Chromium sessions, egress proxy, live view and take-control. |
| `packages/net` | Network guard shared by the API and the browser (public addresses only, DNS pinning). |
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
