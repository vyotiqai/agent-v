# Agent V roadmap

Each phase ends with working software, tests, and CI green. Scope targets parity with
OpenMuse plus multi-user SaaS, MCP connectors, push notifications and voice.

## Phase 1 — Foundation (this change)

- [x] Monorepo: pnpm, Turborepo, Biome, TypeScript 7, Vitest, CI.
- [x] Server: Hono, config validation, Postgres + Drizzle migrations.
- [x] Multi-user auth with Better Auth (email/password, bearer tokens for mobile).
- [x] Model registry: OpenAI, Anthropic, Google, any OpenAI-compatible endpoint, and a built-in
      demo model so the app runs with no keys.
- [x] Chat threads stored in Postgres; runs stream AG-UI 1.0 over SSE.
- [x] Durable tasks on DBOS: plan, checkpointed steps, `ask_user`, cancel, resume.
- [x] Approval-gated actions with content hashes, expiry and `outcome_unknown`.
- [x] Memory (explicit facts), notifications, realtime SSE fan-out via LISTEN/NOTIFY.
- [x] `web_fetch` tool with DNS-pinned SSRF protection.
- [x] Expo app (iOS, Android, web): sign-in, streaming chat with tool activity and a
      follow-up queue, chat history, tasks with plan/answer/approve/cancel/retry, notifications,
      model choice, personality and memory.

## Phase 2 — Agent browser (this change)

- [x] Browser worker (`apps/browser`): persistent Chromium profiles per session, Playwright,
      token-protected HTTP + WebSocket API, idle recycling, one view per session (popups load in
      place), dialogs dismissed, service workers blocked.
- [x] Egress proxy: every request resolved once, checked against the shared network guard and
      pinned to the checked IP; Chromium cannot resolve or connect on its own. Ports 80/443 only.
- [x] Live view with CDP screencast over WebSocket; take control with taps, typing, keys,
      scrolling, address bar, back/forward/reload. Signed one-minute links, proxied by the API.
- [x] Agent tools `browse`, `click_link` (links only, never forms) and `read_page` in chat and in
      durable tasks; one browser per chat and per task, private to its owner.
- [x] Inline browser card in chat with a signed live screenshot and **Take control**; browser
      sessions in Settings (open, resume, delete with profile).
- [x] Docker image and hardened Compose service for the worker.
- [ ] Next: WebRTC take-over (native dialogs, clipboard), one container per user for hard
      isolation, and agent form-filling behind approvals.

## Phase 3 — Google workspace and documents

- Google OAuth per user (PKCE, encrypted refresh tokens, incremental scopes).
- Gmail search/read/draft/send and Calendar CRUD, all writes through approvals.
- PDF import, form fill (pdf-lib), viewer (expo-pdf native, pdf.js on web).
- Browser PDF downloads captured into Files.
- S3-compatible storage (local FS → Garage/R2).
- The permission-slip flow end to end.

## Phase 4 — Linux computer

- `SandboxProvider` interface; Docker + gVisor default, microsandbox when KVM is present.
- Per-user persistent workspace volume, command receipts, file editor, PDF transfer.
- Optional allowlisted egress; interactive PTY terminal over WebSocket.

## Phase 5 — Goals, tracking, ideas, finance

- Goals and milestones linked to tasks.
- Page monitors as DBOS scheduled workflows (change, contains, price below), backoff, dedupe.
- Ideas with evidence from mail, calendar and tasks.
- CSV finance import and spending artifacts.

## Phase 6 — Connectors, memory and reach

- MCP client: users add any MCP server (OAuth 2.1), tools appear to the agent.
- pgvector semantic memory with extraction after turns.
- Expo push (APNs/FCM) and Web Push; notification preferences.
- Voice: on-device speech input, realtime voice conversations (OpenAI Realtime / Gemini Live).
- Streaming markdown (react-native-enriched-markdown + streamdown).

## Phase 7 — SaaS hardening

- Organisations, roles, admin (Better Auth plugins); per-user quotas and rate limits.
- Usage metering and billing hooks; data export and deletion.
- Observability (OpenTelemetry), backups, Helm chart / Compose production profile.
- Desktop app via Tauri 2 wrapping the web build.
