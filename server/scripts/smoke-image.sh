#!/bin/sh
# Starts the built server image the way it is deployed and checks each process works:
# migrate applies the schema, the API reports ready, the egress gateway refuses private
# addresses, and each stops cleanly on SIGTERM. Needs Docker, curl and a Postgres server.
#   server/scripts/smoke-image.sh <image> <postgres url of a server where databases can be made>
set -eu
IMAGE=$1
ADMIN=$2
DB="smoke_$(date +%s)"
URL="${ADMIN%/*}/$DB"
fail() { echo "FAIL: $*"; docker logs smoke-api 2>&1 || true; docker logs smoke-egress 2>&1 || true; exit 1; }
cleanup() {
  docker rm -f smoke-api smoke-egress >/dev/null 2>&1 || true
  psql "$ADMIN" -qc "drop database if exists $DB with (force)" >/dev/null 2>&1 || true
}
trap cleanup EXIT
psql "$ADMIN" -qc "create database $DB"

docker run --rm --network host -e DATABASE_URL="$URL" "$IMAGE" node src/migrate/main.ts \
  | grep -q '"message":"migrate.done"' || fail "migrate did not finish"

docker run -d --name smoke-api --network host -e DATABASE_URL="$URL" -e PORT=18080 "$IMAGE" >/dev/null
docker run -d --name smoke-egress --network host -e PORT=13128 "$IMAGE" node src/egress/main.ts >/dev/null
for _ in $(seq 1 50); do
  curl -sf http://127.0.0.1:18080/readyz >/dev/null && curl -sf http://127.0.0.1:13128/healthz >/dev/null && break
  sleep 0.2
done
[ "$(curl -s http://127.0.0.1:18080/readyz)" = '{"status":"ready"}' ] || fail "the API is not ready"

for target in http://169.254.169.254/computeMetadata/v1/ https://10.0.0.1/ https://127.0.0.1:18080/ http://[::1]/; do
  code=$(curl -s -o /dev/null --noproxy '' -x http://127.0.0.1:13128 -w '%{http_code}' "$target" || true)
  refused=$(curl -s -D - -o /dev/null --noproxy '' -x http://127.0.0.1:13128 "$target" 2>/dev/null \
    | tr -d '\r' | grep -i '^x-egress-refused:' || true)
  case "$refused" in *private-address*) ;; *) fail "$target was not refused (status $code)" ;; esac
done

docker stop smoke-api smoke-egress >/dev/null
for c in smoke-api smoke-egress; do
  [ "$(docker inspect -f '{{.State.ExitCode}}' $c)" = 0 ] || fail "$c did not stop cleanly"
  docker logs "$c" 2>&1 | grep -q '"message":"process.stop"' || fail "$c did not log its stop"
  if docker logs "$c" 2>&1 | grep -v '^{"severity":' | grep -q .; then fail "$c printed a line that is not a log line"; fi
done
echo "The server image works: migrate, API ready, private addresses refused, clean stops."
