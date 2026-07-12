#!/bin/sh
# Restore a backup into the running production database.
#
#   ./scripts/pg-restore.sh backups/nexora-20260612-020000.sql.gz
#
# DESTRUCTIVE: replaces the current database contents. The API container is
# stopped during the restore so nothing writes mid-way.
set -eu

FILE="${1:?usage: pg-restore.sh <backup-file.sql.gz>}"
COMPOSE="docker compose -f docker-compose.prod.yml"

[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }

echo "This will REPLACE the database with $FILE. Type 'restore' to continue:"
read -r CONFIRM
[ "$CONFIRM" = "restore" ] || { echo "Aborted."; exit 1; }

echo "[restore] stopping api…"
$COMPOSE stop api

echo "[restore] dropping and recreating schema…"
$COMPOSE exec -T postgres psql -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}" \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

echo "[restore] loading dump…"
gunzip -c "$FILE" | $COMPOSE exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "[restore] starting api…"
$COMPOSE start api
echo "[restore] done. Verify with: curl -s http://localhost/api/v1/health"
