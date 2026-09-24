# Deploying Agent V

Agent V ships as one image that serves both the API and the web app, plus the cloud browser
worker. It needs Postgres 16+ with the pgvector extension. Pick one of:

- **One machine:** Docker Compose with automatic HTTPS (`deploy/compose`). Right for a
  private deployment or a small service.
- **Kubernetes:** the Helm chart (`deploy/helm/agent-v`). Use it for several replicas,
  autoscaling and managed Postgres.

The phone apps (Expo/EAS) and the desktop app (`apps/desktop`) connect to the same server.

## One machine with Docker Compose

```sh
cd deploy/compose
cp .env.example .env        # fill in DOMAIN, the secrets and at least one model provider
docker compose up -d --build
```

- **HTTPS:** Caddy fetches the certificate for `DOMAIN`, so point its DNS at the machine
  first.
- **Migrations:** the server runs them on start.
- **Admins:** anyone who signs up with an email listed in `ADMIN_EMAILS` gets the Admin
  screen.

| Service | What it does |
|---|---|
| `caddy` | HTTPS, HTTP/3, compression; streams replies and the live browser view unbuffered |
| `server` | API + web app. Read-only filesystem, no Linux capabilities. Uploaded files are stored in the `files` volume |
| `browser` | Chromium worker for the cloud browser, locked down (no capabilities, memory and process limits) |
| `postgres` | pgvector/pgvector:pg18 |
| `backup` | `pg_dump` plus a file archive every `BACKUP_INTERVAL_HOURS` into the `backups` volume, keeping `BACKUP_KEEP_DAYS` |
| `otel-collector`, `jaeger` | Only with `--profile observability`: receives OTLP and shows traces on `localhost:16686` |

**Per-user Linux computers** (`COMPUTER_PROVIDER=docker`) are off by default. They need the
server to reach a Docker daemon (the image includes the Docker CLI). Mounting the host's
Docker socket gives the API root on the host. Prefer a separate, dedicated Docker host
(`DOCKER_HOST=tcp://…` with TLS), with gVisor (`COMPUTER_RUNTIME=runsc`).

## Kubernetes with Helm

```sh
helm install agent-v deploy/helm/agent-v \
  --set publicUrl=https://agent.example.com \
  --set image.repository=ghcr.io/you/agent-v --set browser.image.repository=ghcr.io/you/agent-v-browser \
  --set existingSecret=agent-v   # a Secret with BETTER_AUTH_SECRET, TOKEN_ENCRYPTION_KEY,
                                 # BROWSER_TOKEN, DATABASE_URL and provider keys
```

- **Replicas:** `replicaCount` (default 2) or `autoscaling.enabled`. With more than one
  replica, the chart sets `RATE_LIMIT_STORE=postgres` so rate limits are shared. The per-chat
  lease and the migration lock already live in Postgres.
- **Files:** uploads are stored on a volume. With several replicas it must be `ReadWriteMany`
  (NFS, EFS, Filestore, CephFS), or run one replica.
- **Database:** use a managed Postgres with pgvector and put its URL in `DATABASE_URL`.
  `postgresql.enabled=true` starts a single in-cluster Postgres, for trials only.
- **Ingress:** replies stream over server-sent events. With ingress-nginx, turn proxy
  buffering off and raise the read timeout (see `values.yaml`).
- **Backups:** a nightly CronJob writes `pg_dump` and a file archive to the `-backups` volume.
- **Browser worker:** a NetworkPolicy lets only the API reach it.

Build and push the images:

```sh
docker build -t ghcr.io/you/agent-v:0.7.0 .
docker build -f apps/browser/Dockerfile -t ghcr.io/you/agent-v-browser:0.7.0 .
```

## Settings that matter in production

The full list is in `.env.example`. The ones to decide on:

- **Secrets:** `BETTER_AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` (32 random bytes, base64).
  Changing the encryption key makes stored Google and connector tokens unreadable.
- **Email:** `SMTP_URL` and `EMAIL_FROM` are needed for password resets, email verification
  and invitations. With email configured, an invitation only works for someone who has
  confirmed that address.
- **Plans:** leave `PLANS` unset for a private deployment with no limits. `PLANS=default`
  gives Free, Pro and Team; a JSON array defines your own plans. The first plan in the list is
  where everyone starts.
- **Billing:**
  - Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and a price per paid plan in
    `STRIPE_PRICES`.
  - In Stripe, add a webhook to `https://<domain>/api/billing/stripe/webhook` for
    `checkout.session.completed` and `customer.subscription.*`.
  - Enable the customer portal.
  - Team plans are billed per member, and the seat count follows the team automatically.
- **Push:** Web Push VAPID keys (`npx web-push generate-vapid-keys`). For phones, an EAS
  project and `EXPO_ACCESS_TOKEN` if you turn on push security.
- **Observability:**
  - `OTEL_EXPORTER_OTLP_ENDPOINT` sends traces and metrics to any OTLP/HTTP backend.
  - Prompts and replies stay out of traces unless `OTEL_RECORD_CONTENT=true`.
  - `LOG_FORMAT=json` writes one JSON object per line, with trace ids.
- **Desktop app:** allow its origins, `tauri://localhost` and `http://tauri.localhost`, in
  `ALLOWED_ORIGINS`. The Compose file and the chart already do.

## Backups and restore

`deploy/backup/backup.sh` writes `agentv-<time>.dump` (pg_dump custom format, which includes
the workflow history) and `files-<time>.tar.gz`. Copy the backups volume off the machine,
for example with restic or rclone, or use your provider's volume snapshots.

To restore:

1. Stop the server.
2. Run the restore:
   ```sh
   docker compose run --rm --entrypoint sh backup /scripts/restore.sh \
     /backups/agentv-20260101T031700Z.dump /backups/files-20260101T031700Z.tar.gz
   ```
   The files volume is mounted read-only in the `backup` service. To restore files too,
   run the same command with `-v agent-v_files:/data`.
3. Start the server again.

The restore replaces database objects in one transaction (`--clean --single-transaction`),
so a failed restore leaves the database as it was.

## Upgrading

Pull or build the new image and roll it out. Migrations run on start, one replica at a time,
behind an advisory lock. Durable tasks survive restarts and continue on another replica. A
chat reply still streaming when its server stops gets 10 seconds to finish; after that the
person sends the message again (the chat's lease frees itself within a minute).
