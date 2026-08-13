#!/bin/sh
# Backup produzione Carico 3D.
# Uso: sh ops/backup.sh [directory-destinazione]
# Richiede che i servizi Docker Compose siano avviati.
set -eu

BACKUP_DIR="${1:-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$BACKUP_DIR"

printf '[backup] PostgreSQL...\n'
docker compose exec -T postgres sh -c \
    'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' \
    > "$BACKUP_DIR/postgres.dump"

printf '[backup] Configurazione icone...\n'
docker compose exec -T web sh -c \
    'cat /data/icon_config.json' \
    > "$BACKUP_DIR/icon_config.json"

printf '[backup] Immagini icone...\n'
docker compose exec -T web sh -c \
    'tar -czf - -C /data img_uploads' \
    > "$BACKUP_DIR/img_uploads.tar.gz"

(
    cd "$BACKUP_DIR"
    sha256sum postgres.dump icon_config.json img_uploads.tar.gz > SHA256SUMS
)

printf '[backup] Completato: %s\n' "$BACKUP_DIR"
