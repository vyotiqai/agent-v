# Slice 0 — Foundations

**Status:** in progress. The owner chose on 2026-09-25 to build the parts that need no cloud
account first, while the Google Cloud billing account is set up, and to deploy through GitHub
Actions with no stored keys (workload identity federation).

Slice 0 is everything the other slices stand on (stage 7, section 3).

## What it delivers

| Part | Where | Status |
|---|---|---|
| The repository and its checks: npm workspaces, TypeScript, Biome, tests, CI on every change | root, `.github/workflows/checks.yml` | Done locally; CI runs on GitHub |
| Content-free logging | `server/src/log.ts` | Done, tested |
| The database and its migrations | `server/src/db/`, `server/migrations/` | Done, tested on PostgreSQL 17 |
| Per-person data keys and envelope encryption | `server/src/crypto/envelope.ts` | Done and tested, apart from the Cloud KMS and bucket clients, which come with the cloud part |
| The egress gateway | `server/src/egress/` | Done, tested; where it runs is decided with the cloud part |
| The API, with liveness and readiness | `server/src/api/` | Done, tested |
| The server image | `server/Dockerfile` | Done; built and smoke-tested locally and in CI |
| The app shell with the theme generated from `tokens.py` | `app/`, `tools/` | Next |
| The 24 components, to the stage 5 specification | `app/` | Next |
| Staging and production on Google Cloud as code; budget alerts; Cloud KMS; the release pipeline to staging | `infra/` | Waits for the billing account |

## How it was verified

| Check | Result (2026-09-25) |
|---|---|
| `npm run lint`, `npm run typecheck` | Clean |
| Unit tests (`npm test`) | 32 passing: ids; logging (content in any field is dropped, error messages never appear, a message line shaped like a stack frame is not taken for one); the public-address rule (47 refused and 14 allowed addresses, names with any private address, DNS failures, numeric tricks through the real resolver); the gateway (private CONNECT and plain HTTP refused before any connection, tunnels and forwarding work, redirects passed back and never followed, proxy credentials never passed on, nothing about destinations logged); envelope encryption (wrong key, context or any byte fails; one key per person even when made at once by several processes; a destroyed key opens nothing; one person's wrapped key can't pass as another's) |
| Integration tests (`npm run test:integration`), PostgreSQL 17.10 | 14 passing: migrations (in order and once; a failed one leaves nothing; an edited or unknown one stops the runner; two runners at once apply each once); the API (liveness, readiness, not ready when the schema is behind or the database is down, 404 and 405, trace ids read, nothing from a path logged); the three processes started from their entry points (migrate exits 0 or 1, the API serves and stops on SIGTERM, a missing setting stops a process with only a crash line, the gateway refuses the metadata server) |
| The server image (`server/scripts/smoke-image.sh`) | Builds with no tests inside, runs as a non-root user; migrate, API and gateway each work from the image and stop cleanly, printing only log lines |

Not yet verifiable here, and verified on staging in the cloud part: the gateway reaching a real
public site (this build machine has no direct internet access), Cloud KMS and the key bucket, and
deploys.

## Decisions made in this slice

| ID | Decision | Why |
|---|---|---|
| D126 | Wrapped data keys are kept outside the database, one per person, in a Cloud Storage bucket with soft delete and versioning turned off. **Refines D107** | Database backups are kept 7 days (D113). If wrapped data keys were in the database, a backup could still unwrap a deleted person's secrets; in the bucket, deleting the key is final at once, which is what D107 and J10 promise |
| D127 | The tools: npm workspaces; TypeScript 6.0, strict; Node 24 LTS, running the server's TypeScript directly with no build step; Biome to lint and format; Node's own test runner for the server; the `postgres` driver (no dependencies of its own); PostgreSQL 17 in Cloud SQL, CI and local tests | Few, general-purpose tools (rule 6, D107); one less build step to go wrong; tests run against the same database version as production |
| D128 | Integration tests run against a real Postgres, each in a fresh database, and fail when no database is given rather than skipping | A run can't look green without having run (rule 3) |
| D129 | Slice 0 ships no tables: each slice adds the tables it needs. Migrations are numbered SQL files, never edited once applied (checksums enforce it), each in one transaction, one runner at a time, schema changes in two steps | The schema grows with the features that use it; the rules make deploys safe (D113) |
| D130 | CI on GitHub Actions for every change: lint, types, unit tests, integration tests on PostgreSQL 17, and the server image built and smoke-tested. GitHub's own actions are used by version; container images are pinned by digest | Nothing merges unless everything passes (stage 6, section 23) |
| D131 | A log line may hold only an event from a fixed list, ids, numbers, values from fixed lists, a SQLSTATE code and stack frames; anything else is dropped and the field named | Makes D112 true by construction, and shows when code tries to log something it shouldn't |

## Open for the cloud part

| Question | Notes |
|---|---|
| Where the egress gateway runs | Browsers and workers must reach it, and nothing else. Cloud Run services are reached through Google's HTTP front end, which may not carry CONNECT tunnels; the choice (for example next to each browser on GKE, and inside the worker) is made and tested when the cloud setup is built |
| The Cloud KMS and key-bucket clients | Our own small REST clients (rule 6), tested against the real services on staging |

## The owner's steps for this slice

| Step | Status |
|---|---|
| Create the Google Cloud billing account, with budget alerts | Waiting |
| Allow GitHub Actions to deploy without keys (workload identity federation): a few clicks, with written steps | After the billing account |
