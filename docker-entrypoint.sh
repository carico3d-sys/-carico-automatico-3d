#!/bin/sh
# =============================================================================
# docker-entrypoint.sh — inizializzazione container
# - seed dei volumi (config icone + PNG upload) al primo avvio
# - migrazioni + collectstatic (saltabili sul worker con SKIP_MIGRATE=1)
# - esecuzione del comando finale (gunicorn o qcluster)
# =============================================================================
set -e

echo "[entrypoint] Avvio container ($(hostname))"

# ---------------------------------------------------------------------------
# Seed volumi icone (solo se i percorsi env sono impostati)
# ---------------------------------------------------------------------------
# Guardia anti volume-over-file: se il percorso è una directory (volume
# montato sul file invece che sulla cartella), abortire con messaggio chiaro
# invece di far fallire il cp più sotto.
if [ -n "$ICON_CONFIG_PATH" ] && [ -d "$ICON_CONFIG_PATH" ]; then
    echo "[entrypoint] ERRORE: $ICON_CONFIG_PATH è una directory, non un file." >&2
    echo "[entrypoint] Il volume va montato sulla CARTELLA (es. /data), non sul file." >&2
    exit 1
fi
if [ -n "$ICON_UPLOAD_DIR" ] && [ -f "$ICON_UPLOAD_DIR" ]; then
    echo "[entrypoint] ERRORE: $ICON_UPLOAD_DIR è un file, non una directory." >&2
    exit 1
fi

if [ -n "$ICON_CONFIG_PATH" ] && [ ! -f "$ICON_CONFIG_PATH" ]; then
    mkdir -p "$(dirname "$ICON_CONFIG_PATH")"
    cp /opt/icon_config.json.default "$ICON_CONFIG_PATH"
    echo "[entrypoint] Config icone inizializzata in $ICON_CONFIG_PATH"
fi

if [ -n "$ICON_UPLOAD_DIR" ]; then
    if [ ! -d "$ICON_UPLOAD_DIR" ]; then
        mkdir -p "$ICON_UPLOAD_DIR"
    fi
    if [ -z "$(ls -A "$ICON_UPLOAD_DIR" 2>/dev/null)" ]; then
        cp -a /opt/img_original/. "$ICON_UPLOAD_DIR"
        echo "[entrypoint] Upload PNG inizializzati in $ICON_UPLOAD_DIR"
    fi
fi

# ---------------------------------------------------------------------------
# Migrazioni + collectstatic (solo sul servizio web)
# ---------------------------------------------------------------------------
if [ "$SKIP_MIGRATE" != "1" ]; then
    echo "[entrypoint] migrate + collectstatic..."
    python manage.py migrate --noinput
    python manage.py collectstatic --noinput
fi

exec "$@"
