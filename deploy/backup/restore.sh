#!/bin/sh
# Restore Agent V from a backup made by backup.sh. Stop the server first.
#   restore.sh /backups/agentv-20260101T000000Z.dump [/backups/files-20260101T000000Z.tar.gz]
# The database is replaced object by object (--clean); the files directory is replaced.
set -eu

dump=${1:?usage: restore.sh DUMP [FILES_TAR]}
files=${2:-}
DATA_DIR=${DATA_DIR:-/data}

pg_restore --dbname="${DATABASE_URL:-${PGDATABASE:?set DATABASE_URL or PGDATABASE}}" --clean --if-exists --no-owner \
  --single-transaction --exit-on-error "$dump"
echo "database restored from $dump"

if [ -n "$files" ]; then
  mkdir -p "$DATA_DIR"
  find "$DATA_DIR" -mindepth 1 -delete
  tar -C "$DATA_DIR" -xzf "$files"
  echo "files restored from $files"
fi
