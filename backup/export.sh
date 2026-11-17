#!/bin/sh
# Regenerates backup/dump.sql and backup/data.tar.gz from a running stack,
# so the next `git push` carries the current data forward.
#
# Usage: ./backup/export.sh
set -eu
cd "$(dirname "$0")/.."

echo "Dumping database to backup/dump.sql..."
docker compose -f compose.production.yml -f compose.override.yml exec -T db pg_dump -U dossier -d dossier --no-owner --no-acl --clean --if-exists > backup/dump.sql

echo "Archiving /data to backup/data.tar.gz..."
docker compose -f compose.production.yml -f compose.override.yml exec -T app tar czf - -C /data . > backup/data.tar.gz

echo "Done. Review with 'git status', then commit and push."
