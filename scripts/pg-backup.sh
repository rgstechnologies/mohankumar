#!/bin/sh
# Nightly Postgres backup loop — runs inside the `backup` sidecar container.
# Dumps once on startup (so a fresh deployment is covered immediately),
# then every BACKUP_INTERVAL_HOURS, keeping BACKUP_RETENTION_DAYS of history.
set -eu

: "${PGHOST:=postgres}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_INTERVAL_HOURS:=24}"
: "${BACKUP_RETENTION_DAYS:=14}"

export PGPASSWORD="$POSTGRES_PASSWORD"
mkdir -p "$BACKUP_DIR"

while true; do
  STAMP=$(date +%Y%m%d-%H%M%S)
  FILE="$BACKUP_DIR/nexora-$STAMP.sql.gz"
  echo "[backup] dumping $POSTGRES_DB to $FILE"
  if pg_dump -h "$PGHOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      --no-owner --no-privileges | gzip > "$FILE.partial"; then
    mv "$FILE.partial" "$FILE"
    echo "[backup] done: $(du -h "$FILE" | cut -f1)"
  else
    rm -f "$FILE.partial"
    echo "[backup] FAILED — keeping previous backups" >&2
  fi

  # Retention: drop dumps older than the window.
  find "$BACKUP_DIR" -name 'nexora-*.sql.gz' -mtime "+$BACKUP_RETENTION_DAYS" -delete

  echo "[backup] sleeping ${BACKUP_INTERVAL_HOURS}h"
  sleep $(( BACKUP_INTERVAL_HOURS * 3600 ))
done
