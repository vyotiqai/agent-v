# Agent V

A personal AI agent for iPhone and Android. You hand it outcomes; it plans, works in the
background around the clock, and only interrupts you when it needs you.

**Status: building slice 0 (foundations).** All seven design stages are agreed. Building follows
the [build plan](docs/design/07-build-plan.md): small slices, each working end to end and verified
before the next. Start with the [design overview](docs/design/README.md); progress is in
[docs/build](docs/build/README.md).

## The repository

| Folder | What it holds |
|---|---|
| [`server/`](server/README.md) | The API, the workers and the egress gateway: one TypeScript codebase |
| [`docs/design/`](docs/design/README.md) | The agreed design, stages 1 to 7 |
| [`docs/build/`](docs/build/README.md) | Each build slice: what it delivers, how it was verified, the decisions made |

The app (`app/`), shared types (`shared/`), the browser image (`browser/`), the cloud setup
(`infra/`) and support tools (`tools/`) are added by the slices that need them (stage 7, D123).

Checks, from the root with Node 24: `npm ci`, then `npm run check` (lint, types, unit tests);
integration tests need a Postgres (see [server/README.md](server/README.md)).
