# Agent V roadmap

Each phase ends with working software, tests, and CI green. Scope targets parity with
OpenMuse plus multi-user SaaS, MCP connectors, push notifications and voice.

## Phase 1 — Foundation (done)

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

## Phase 2 — Agent browser (done)

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

## Phase 3 — Google workspace and documents (done)

- [x] Google OAuth per user: PKCE, single-use state bound to the user, read or read+send scopes,
      refresh tokens sealed with AES-256-GCM (bound to owner), revoke on disconnect, automatic
      removal when access is revoked.
- [x] Mail/calendar provider layer: Gmail search, full threads (HTML converted to text, odd
      charsets tolerated, one bad message never breaks a list), attachments; Calendar list.
- [x] Writes only through approvals: `email.send` (MIME with CRLF, RFC 2047 subjects, reply
      threading, attachments, header-injection checks), `calendar.create`, `calendar.delete`
      (ETag `If-Match`). Each is pinned to the reviewed account; uncertain Google failures end
      as `outcome_unknown`. Proposals made outside tasks run as soon as they are approved.
- [x] Demo workspace: a fictional inbox (with a real fillable permission slip) and calendar,
      so everything works offline and in tests.
- [x] Files: PDF upload (10 MB), signed downloads, integrity check, viewer (web: in app; native:
      system viewer), form fill into a new copy with scripts stripped, browser PDF downloads.
- [x] Agent tools in chat and tasks: `search_mail`, `read_email_thread`, `list_events`,
      `import_attachment`, `inspect_pdf`, `fill_pdf`, `propose_email`, `propose_event`.
- [x] App: Inbox (mail + calendar), email threads with reply-for-review, Files, file detail
      with form filling, approval cards in chat and tasks, Accounts in Settings.
- [x] The permission-slip flow end to end.
- [ ] Next: S3-compatible storage (Garage/R2), embedded native PDF renderer (expo-pdf, dev
      build), calendar edits and recurrence, Gmail drafts, more PDF field types and OCR.

## Phase 4 — Linux computer (done)

- [x] Docker provider (optional gVisor runtime): one container and volume per user, named from a
      hash of the user id; `--network none`, read-only root, all capabilities dropped,
      no-new-privileges, non-root user, memory/CPU/PID limits, `--init` to reap processes,
      images never pulled at runtime. Existing containers are inspected and refused unless they
      match these settings.
- [x] Commands with saved records: one at a time per computer, time limit, output cap,
      operation ids so a retried request returns the original result, and commands left
      running by a crash are marked interrupted (never re-run). Cancel restarts the container to
      end every process.
- [x] Workspace files: list, read, write, mkdir, delete; links cannot lead outside
      `/workspace`; PDFs copy to and from Files.
- [x] Agent tools in chat and durable tasks (`computer_run`, `computer_list`,
      `computer_read_file`, `computer_write_file`, `computer_import_file`,
      `computer_export_pdf`).
- [x] App: Computer screen with terminal, file browser and editor; entry from chat and
      Settings; command rows in chat.
- [x] Tests against real containers (isolation, persistence, limits, running each operation
      once, link escapes, PDF transfer, agent use); CI builds the images.
- [ ] Next: interactive PTY terminal over WebSocket, allowlisted network egress, disk quotas,
      microVM provider (microsandbox / Firecracker) where KVM is available, desktop apps.

## Phase 5 — Goals, tracking, ideas, finance (done)

- [x] Goals with milestones (edit, reorder by replacing, check off); tasks and watches link to a
      goal. A task started for a milestone checks it off on success; other finished goal tasks
      are added as done milestones. Planning tasks add milestones with `add_goal_milestones`.
- [x] Watches on a DBOS schedule: every minute, each due watch gets one check workflow per due
      time (exactly once across servers). Change (with a before/after summary), text appears,
      price below a threshold (multi-currency, ignores "over $50"-style amounts). Exponential
      backoff from the interval, pause after five failures, alerts deduplicated per state
      change, bounded history, check now / pause / resume / stop. Demo pages for trying offline.
- [x] Ideas with evidence from mail (forms to fill, unanswered questions plus that day's
      calendar), goals without a plan, recurring charges, and paused watches. Dismissed ideas
      stay dismissed; handled ones retire; accepting is idempotent and the prompt is editable.
- [x] Finance: CSV import (delimiters, BOM, quotes, debit/credit, European and US formats, sign
      detection), categories, months, merchants, recurring charges, a savings goal from a report,
      and `finance_summary` for the agent.
- [x] Agent tools in chat and tasks: `create_goal`, `add_goal_milestones`, `goal_status`,
      `watch_page`, `finance_summary`. The demo model runs every flow offline.
- [x] App: Goals tab (Ideas, Goals, Watches, Money), goal, watch and spending screens,
      notifications that open what they are about.
- [ ] Next: watches through the cloud browser for pages that need JavaScript, CSS selectors
      for a part of a page, model-written ideas, bank connections (Plaid/GoCardless), budgets.

## Phase 6 — Connectors, memory and reach (done)

- [x] MCP client (official TypeScript SDK): Streamable HTTP, bearer tokens, and OAuth 2.1 per the
      MCP authorization spec (protected-resource and authorization-server discovery, dynamic
      client registration, PKCE, resource indicators, refresh), with single-use state and
      credentials sealed with AES-256-GCM. Connections go through the network guard.
- [x] Connector tools in chat and durable tasks; per-tool run / ask first / off (read-only tools
      run by default); approvals through `mcp.call` actions; lost calls end as `outcome_unknown`.
      A built-in sample server (in-memory transport) for trying it.
- [x] pgvector memory: embeddings from OpenAI, Google, any OpenAI-compatible provider, or an
      offline hashing embedder; relevant-plus-recent memories in prompts; `recall_memory`;
      duplicate detection; re-embedding after a model change; learning from chat turns (model
      extraction, or rules for the demo model) with an off switch.
- [x] Push: Expo (APNs/FCM) and Web Push (VAPID, RFC 8291 encryption, sent through the network
      guard), categories and preferences, a durable delivery workflow with retries and dead-device
      cleanup, devices that move between accounts, a service worker that opens the right screen.
- [x] Voice: dictation (expo-audio on phones, MediaRecorder or the browser's recognition on web),
      server transcription (`TRANSCRIPTION_MODEL`), read-aloud (expo-speech), hands-free voice mode
      with silence detection.
- [x] Streaming Markdown: a tested parser in `@agent-v/shared` that closes unfinished syntax while
      streaming, block memoization, tables, strikethrough and rules.
- [x] Work can be queued from inside workflow steps (DBOS client), which also fixes starting a
      watch from a background task.
- [ ] Next: speech-to-speech realtime sessions (OpenAI Realtime / Gemini Live over WebRTC) with the
      agent's tools, on-device recognition on phones (expo-speech-recognition, dev builds),
      MCP resources and prompts, remote MCP servers over the legacy SSE transport, an HNSW index
      once memories per user grow large, push receipts.

## Phase 7 — SaaS hardening

- Organisations, roles, admin (Better Auth plugins); per-user quotas and rate limits.
- Usage metering and billing hooks; data export and deletion.
- Observability (OpenTelemetry), backups, Helm chart / Compose production profile.
- Desktop app via Tauri 2 wrapping the web build.
