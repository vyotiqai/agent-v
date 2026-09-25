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
| The app shell with the theme generated from `tokens.py` | `app/`, `tools/theme/` | Done: bundles for Android and iPhone; theme generated and checked; contrast checked |
| The 24 components, to the stage 5 specification | `app/src/components/` | Done: matched against the design system's previews in both themes, and their behaviour tested, in a browser. On real Android phones with the rest of the slice, in Google's device lab |
| Staging and production on Google Cloud as code; budget alerts; Cloud KMS; the release pipeline to staging | `infra/` | Waits for the billing account |

## How it was verified

| Check | Result (2026-09-25) |
|---|---|
| `npm run lint`, `npm run typecheck` | Clean |
| Unit tests (`npm test`) | 32 passing: ids; logging (content in any field is dropped, error messages never appear, a message line shaped like a stack frame is not taken for one); the public-address rule (47 refused and 14 allowed addresses, names with any private address, DNS failures, numeric tricks through the real resolver); the gateway (private CONNECT and plain HTTP refused before any connection, tunnels and forwarding work, redirects passed back and never followed, proxy credentials never passed on, nothing about destinations logged); envelope encryption (wrong key, context or any byte fails; one key per person even when made at once by several processes; a destroyed key opens nothing; one person's wrapped key can't pass as another's) |
| Integration tests (`npm run test:integration`), PostgreSQL 17.10 | 14 passing: migrations (in order and once; a failed one leaves nothing; an edited or unknown one stops the runner; two runners at once apply each once); the API (liveness, readiness, not ready when the schema is behind or the database is down, 404 and 405, trace ids read, nothing from a path logged); the three processes started from their entry points (migrate exits 0 or 1, the API serves and stops on SIGTERM, a missing setting stops a process with only a crash line, the gateway refuses the metadata server) |
| The server image (`server/scripts/smoke-image.sh`) | Builds with no tests inside, runs as a non-root user; migrate, API and gateway each work from the image and stop cleanly, printing only log lines |
| The app's theme (`tools/theme/generate.py --check`, `app/src/theme/contrast.test.ts`) | The generated theme, icons and contrast pairs are exactly what the design's source makes; all 30 text and control pairs meet WCAG 2.2 AA in both themes, computed independently of the design tooling, and the published stage 5 figures are reproduced |
| The app compiles (`expo export --platform android --platform ios`) | Production bundles for both phones, with the four font files |
| The components against the design system (`tools/gallery/compare.ts`) | 48 comparisons (24 components, light and dark), all match; 22 components identical to the pixel. ChoiceCard's radio (the browser's own control there, ours here) and StepChart's digits (tabular on phones; the web renderer used for this check draws them proportional) differ by under 0.5%. See [tools/gallery](../../tools/gallery/README.md), which also lists what the comparison found and fixed |
| The components' behaviour (`tools/gallery/interact.ts`) | 6 passing: holding to sign signs after 0.9 s, letting go early signs nothing, holding Space signs; a switch turns on and off and tells screen readers; filters choose one; the keyboard focus ring is 2px, 2px away |
| The design prototype (`docs/design/prototype/check.sh`) | Still passes in full after the changes here (see below) |

Not yet verifiable here, and verified on staging in the cloud part: the gateway reaching a real
public site (this build machine has no direct internet access), Cloud KMS and the key bucket, and
deploys. The components on real phones are checked when a development build can be made (see the
questions below).

Found and fixed on the way: setting `"type": "module"` in the root `package.json` made Node read
the design prototype's check scripts as ES modules, and they stopped loading; the root has no
JavaScript of its own, so the setting was removed there (the server and the gallery set it for
themselves).

## Decisions made in this slice

| ID | Decision | Why |
|---|---|---|
| D126 | Wrapped data keys are kept outside the database, one per person, in a Cloud Storage bucket with soft delete and versioning turned off. **Refines D107** | Database backups are kept 7 days (D113). If wrapped data keys were in the database, a backup could still unwrap a deleted person's secrets; in the bucket, deleting the key is final at once, which is what D107 and J10 promise |
| D127 | The tools: npm workspaces; TypeScript 6.0, strict; Node 24 LTS, running the server's TypeScript directly with no build step; Biome to lint and format; Node's own test runner for the server; the `postgres` driver (no dependencies of its own); PostgreSQL 17 in Cloud SQL, CI and local tests | Few, general-purpose tools (rule 6, D107); one less build step to go wrong; tests run against the same database version as production |
| D128 | Integration tests run against a real Postgres, each in a fresh database, and fail when no database is given rather than skipping | A run can't look green without having run (rule 3) |
| D129 | Slice 0 ships no tables: each slice adds the tables it needs. Migrations are numbered SQL files, never edited once applied (checksums enforce it), each in one transaction, one runner at a time, schema changes in two steps | The schema grows with the features that use it; the rules make deploys safe (D113) |
| D130 | CI on GitHub Actions for every change: lint, types, unit tests, integration tests on PostgreSQL 17, and the server image built and smoke-tested. GitHub's own actions are used by version; container images are pinned by digest | Nothing merges unless everything passes (stage 6, section 23) |
| D131 | A log line may hold only an event from a fixed list, ids, numbers, values from fixed lists, a SQLSTATE code and stack frames; anything else is dropped and the field named | Makes D112 true by construction, and shows when code tries to log something it shouldn't |
| D132 | The app's components take line heights exactly as the design system's component CSS has them: the type style's where the design sets one, the font's own (about 1.3 times the size) for single-line labels where it doesn't | The design system's previews are what was agreed; this makes the app match them to the pixel instead of sitting 1px off on every label |
| D133 | A component gallery in `tools/gallery`, never in the app, draws the app's components as the design system's previews do. It compares the two pixel by pixel (locally, since the previews need the canvas runtime) and tests the components' behaviour in a browser (in CI) | "Components match the design system's previews in both themes" (stage 7) becomes a measurement, repeatable after any change |
| D134 | The design system's Tile preview now lays out the watch tile's figure and note as the agreed Today screen does: a column with a 2px gap | The preview put the note on an inline line, 4px taller than on the agreed screen; the design system should show what was agreed |
| D135 | The components tell screen readers their state with `role` and `aria-*` props (`aria-checked`, `aria-selected`, `aria-disabled`) | Both React Native and its web renderer read them; the older `accessibilityState` isn't read on the web, which the behaviour check caught |

## Open for the cloud part

| Question | Notes |
|---|---|
| Where the egress gateway runs | Browsers and workers must reach it, and nothing else. Cloud Run services are reached through Google's HTTP front end, which may not carry CONNECT tunnels; the choice (for example next to each browser on GKE, and inside the worker) is made and tested when the cloud setup is built |
| The Cloud KMS and key-bucket clients | Our own small REST clients (rule 6), tested against the real services on staging |

## Questions for the owner, before the first build on a phone

| Question | Why it's needed |
|---|---|
| The app's store identity: its Android package name and iPhone bundle id, usually the domain reversed (`com.example.agentv`) | A development build on a phone, and Google's device lab, need it; it can never change once the app is on Google Play. It follows the domain (D124) |
| The app icon | The V mark is the only logo (stage 5); which way round it goes on the icon (dark V on light, or light V on dark) is the owner's choice |

## Known and accepted

| What | Why it's accepted for now |
|---|---|
| `npm audit` reports 10 moderate findings, all one advisory in an old `uuid` inside Expo's build-time config tools | That code never ships in the app, and the advisory is about a use (writing into a caller's buffer) those tools don't make. Taken with Expo's own update rather than by forcing a version under Expo's tools |

## The owner's steps for this slice

| Step | Status |
|---|---|
| Create the Google Cloud billing account, with budget alerts | Waiting |
| Allow GitHub Actions to deploy without keys (workload identity federation): a few clicks, with written steps | After the billing account |
