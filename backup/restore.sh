#!/bin/sh
# Manually (re-)applies this folder's backup to a running stack.
# Normal case: you don't need this — `docker compose -f compose.production.yml [-f compose.override.yml]
# up -d` restores automatically into empty volumes on first start (see the
# `db` and `restore-data` services there). Use this script only to force a
# restore into a stack that already has data, e.g. after `docker compose down -v`.
#
# Usage: ./backup/restore.sh [compose project dir, default: repo root]
set -eu
cd "$(dirname "$0")/.."

echo "Restoring database from backup/dump.sql..."
docker compose -f compose.production.yml -f compose.override.yml exec -T db psql -U dossier -d dossier < backup/dump.sql

echo "Restoring /data from backup/data.tar.gz..."
docker compose -f compose.production.yml -f compose.override.yml exec -T app sh -c 'rm -rf /data/* /data/.[!.]* 2>/dev/null; cat > /tmp/data.tar.gz && tar xzf /tmp/data.tar.gz -C /data && rm /tmp/data.tar.gz' < backup/data.tar.gz

echo "Restarting app..."
docker compose -f compose.production.yml -f compose.override.yml restart app

echo "Done."
