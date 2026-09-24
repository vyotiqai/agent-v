#!/bin/sh
# Back up Agent V: the database (pg_dump custom format) and the files directory.
#   backup.sh            one backup now
#   backup.sh --every N  a backup every N hours, forever (for a sidecar container)
# Needs pg_dump matching the server's major version (the pgvector image has it).
# Connection: the standard PG* variables (PGHOST, PGUSER, PGPASSWORD, PGDATABASE) or DATABASE_URL.
set -eu

BACKUP_DIR=${BACKUP_DIR:-/backups}
DATA_DIR=${DATA_DIR:-/data}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}

backup() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  mkdir -p "$BACKUP_DIR"
  # Written under a temporary name and renamed, so a partial backup never looks complete.
  pg_dump ${DATABASE_URL:+"$DATABASE_URL"} --format=custom --compress=6 --no-owner \
    --file "$BACKUP_DIR/agentv-$stamp.dump.partial"
  mv "$BACKUP_DIR/agentv-$stamp.dump.partial" "$BACKUP_DIR/agentv-$stamp.dump"
  if [ -d "$DATA_DIR" ]; then
    tar -C "$DATA_DIR" -czf "$BACKUP_DIR/files-$stamp.tar.gz.partial" .
    mv "$BACKUP_DIR/files-$stamp.tar.gz.partial" "$BACKUP_DIR/files-$stamp.tar.gz"
  fi
  find "$BACKUP_DIR" -maxdepth 1 \( -name 'agentv-*.dump' -o -name 'files-*.tar.gz' \) \
    -mtime +"$KEEP_DAYS" -delete
  find "$BACKUP_DIR" -maxdepth 1 -name '*.partial' -mmin +360 -delete
  echo "backup $stamp done: $(du -sh "$BACKUP_DIR/agentv-$stamp.dump" | cut -f1) database"
}

if [ "${1:-}" = "--every" ]; then
  hours=${2:?usage: backup.sh --every HOURS}
  while :; do
    backup || echo "backup failed; retrying next time" >&2
    sleep $((hours * 3600))
  done
else
  backup
fi
