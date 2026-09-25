# Agent V server

One TypeScript codebase for everything Agent V runs on Google Cloud (stage 6, section 3; D83). It
runs on Node 24 directly from its TypeScript source, using Node's own type stripping, so there is no
build step: the code in the image is the code in this folder.

## The processes

| Process | Entry point | What it does | Deployed as |
|---|---|---|---|
| API | `src/api/main.ts` | The app's only door: liveness (`/healthz`), readiness (`/readyz`: the database answers and holds the schema this code needs), and the routes below | A Cloud Run service |
| Egress gateway | `src/egress/main.ts` | The forward proxy every outside connection goes through; refuses anything but public addresses | Decided with the cloud setup (see [slice 0](../docs/build/slice-00-foundations.md)) |
| Migrate | `src/migrate/main.ts` | Applies database migrations, then exits | A Cloud Run job, run before each deploy |
| Workers | — | Come with slice 3, when there is work for them | A Cloud Run worker pool |

## The parts

| Part | Files | Rules it keeps |
|---|---|---|
| Logging | `src/log.ts` | Content-free by construction (D112): a line holds an event name from a fixed list, ids, numbers and values from fixed lists; error messages are never logged, only their kind, SQLSTATE code and stack frames. Anything else is dropped and the field named |
| Ids | `src/ids.ts` | Random, unguessable UUID version 7 |
| Settings | `src/config.ts` | Read from the environment; a missing setting stops the process at start |
| Database | `src/db/` | [`postgres`](https://github.com/porsager/postgres) as the driver; our own migration runner (see [migrations/README.md](migrations/README.md)) |
| Encryption | `src/crypto/envelope.ts` | A data key per person; secrets sealed with AES-256-GCM, bound to what they are; data keys kept only wrapped by Cloud KMS, in a store where deletion is final (D126) |
| Egress | `src/egress/` | Public addresses only: every address of a name is checked, the checked address is the one connected to, redirects are never followed, nothing about destinations is logged |
| Processes | `src/process.ts` | Crashes logged by kind before exiting; an orderly stop on SIGTERM |
| Accounts | `src/auth/` | Google identity tokens checked by our own code against Google's published keys (`jwt.ts`, `google.ts`); people, phones, sessions and one-time nonces (`accounts.ts`) |
| Rate limits | `src/ratelimit.ts` | Counted in Postgres per minute, so every API instance agrees; addresses kept only as hashes |

## The API's routes

Requests and responses are defined once, in [`shared/src/accounts.ts`](../shared/src/accounts.ts),
for the app and the server alike.

| Route | Needs a signed-in phone | What it does |
|---|---|---|
| `POST /v1/auth/nonce` | No | A one-time value for the next sign-in (10 minutes) |
| `POST /v1/auth/google` | No | Signs in with Google's identity token, which must carry that nonce; registers the phone and its signing key; returns the session |
| `POST /v1/auth/refresh` | No | Swaps a refresh token for a new pair. A refresh token used twice signs its phone out (`401 signed-out`) |
| `POST /v1/auth/sign-out` | Yes | Signs this phone out |
| `GET /v1/phones` | Yes | The person's signed-in phones, this one first (D137) |
| `DELETE /v1/phones/{id}` | Yes | Signs out another of the person's phones |

Nonce and sign-in requests together are limited to 20 a minute per network address, refreshes to 60.
Errors are `{ "error": kind }` with the kinds in `shared/src/accounts.ts`; the app turns them into
words.

## Settings

| Setting | Used by | Meaning |
|---|---|---|
| `DATABASE_URL` | API, migrate | The Postgres connection |
| `GOOGLE_CLIENT_ID` | API | Agent V's server client id in Google Cloud: the audience Google's identity tokens are issued for |
| `PORT` | API (8080), egress (3128) | Where to listen; Cloud Run sets it |
| `GOOGLE_CLOUD_PROJECT` | all | Links log lines to their traces in Google Cloud |

## Running the checks

From the repository root, with Node 24 (see `.nvmrc`):

```sh
npm ci
npm run lint          # Biome
npm run typecheck     # TypeScript, strict
npm test              # unit tests (node:test)
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:integration
```

The integration tests need a real PostgreSQL 17, the version production uses, and a user that
may create databases: each test makes its own database and drops it afterwards. Without
`TEST_DATABASE_URL` they fail rather than skip. One way to get one:

```sh
docker run -d --name agent-v-pg -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17.10-trixie
```

## The image

```sh
docker build -f server/Dockerfile -t agent-v-server .       # from the repository root
server/scripts/smoke-image.sh agent-v-server postgres://postgres@127.0.0.1:5432/postgres
```

The smoke check starts each process from the image the way it is deployed: migrate applies the
schema, the API reports ready, the gateway refuses the metadata server, private networks and
loopback, and each process stops cleanly on SIGTERM, having printed nothing but log lines. CI runs
the same on every change (`.github/workflows/checks.yml`).
