#!/usr/bin/env bash
# Installazione e aggiornamento Carico 3D su un server Linux.
# Uso: bash deploy/installa_produzione.sh [opzioni]
set -Eeuo pipefail

APP_DIR="/opt/carico3d"
REPO_URL=""
RELEASE_DIR=""
DOMAIN=""
SERVER_IP=""

usage() {
    cat <<'EOF'
Uso:
  bash deploy/installa_produzione.sh [opzioni]

Opzioni:
  --dir CARTELLA       Cartella del progetto (default: /opt/carico3d)
  --repo URL            Repository Git da clonare al primo avvio
  --release CARTELLA   Backup preparato con prepara_rilascio.py
  --domain HOST        Dominio principale, ad esempio app.example.com
  --server-ip IP       IP pubblico, usato per stampare il record DNS
  -h, --help           Mostra questo aiuto

Le password vengono richieste in modo interattivo e non sono parametri CLI.
Il certificato HTTPS e il record DNS richiedono ancora la configurazione del
provider del dominio; lo script non pubblica automaticamente modifiche DNS.
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --dir)
            APP_DIR="$2"
            shift 2
            ;;
        --repo)
            REPO_URL="$2"
            shift 2
            ;;
        --release)
            RELEASE_DIR="$2"
            shift 2
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --server-ip)
            SERVER_IP="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Opzione non riconosciuta: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

require_command() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "Comando richiesto non trovato: $1" >&2
        exit 1
    }
}

require_command git
require_command docker
require_command sha256sum

docker compose version >/dev/null 2>&1 || {
    echo "Il Docker Compose Plugin non è disponibile." >&2
    exit 1
}

if [ -z "$DOMAIN" ]; then
    read -r -p "Dominio principale (es. app.example.com): " DOMAIN
fi
if [ -z "$DOMAIN" ] || [[ "$DOMAIN" == *[[:space:]/]* ]]; then
    echo "Dominio non valido: $DOMAIN" >&2
    exit 1
fi

if [ -z "$SERVER_IP" ]; then
    read -r -p "IP pubblico del server (solo per il riepilogo DNS): " SERVER_IP
fi
if [ -z "$SERVER_IP" ] || [[ "$SERVER_IP" == *[[:space:]]* ]]; then
    echo "IP server non valido: $SERVER_IP" >&2
    exit 1
fi

if [ -d "$APP_DIR/.git" ]; then
    echo "[1/7] Repository già presente: $APP_DIR"
    if [ -n "$(git -C "$APP_DIR" status --porcelain)" ]; then
        echo "La working tree del server contiene modifiche locali: interrompo." >&2
        exit 1
    fi
    git -C "$APP_DIR" pull --ff-only
else
    if [ -z "$REPO_URL" ]; then
        read -r -p "URL repository GitHub: " REPO_URL
    fi
    [ -n "$REPO_URL" ] || { echo "Repository mancante." >&2; exit 1; }
    echo "[1/7] Clono il repository in $APP_DIR"
    mkdir -p "$(dirname "$APP_DIR")"
    git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

if [ -f .env ]; then
    read -r -p "Esiste già .env. Mantenerlo? [S/n] " KEEP_ENV
    KEEP_ENV="${KEEP_ENV:-S}"
else
    KEEP_ENV="N"
fi

if [[ "$KEEP_ENV" =~ ^[SsYy]$ ]]; then
    echo "[2/7] Uso il .env esistente."
else
    echo "[2/7] Creo il .env di produzione."
    read -r -p "Nome database [carico_3d]: " DB_NAME
    DB_NAME="${DB_NAME:-carico_3d}"
    read -r -p "Utente database [carico]: " DB_USER
    DB_USER="${DB_USER:-carico}"
    read -r -s -p "Password PostgreSQL: " DB_PASSWORD
    printf '\n'
    [ -n "$DB_PASSWORD" ] || { echo "Password database obbligatoria." >&2; exit 1; }

    read -r -s -p "SECRET_KEY Django (invio per generarne una): " SECRET_KEY
    printf '\n'
    if [ -z "$SECRET_KEY" ]; then
        require_command openssl
        SECRET_KEY="$(openssl rand -hex 48)"
    fi

    read -r -p "HTTPS già configurato e certificato attivo? [s/N] " HTTPS_READY
    if [[ "${HTTPS_READY:-N}" =~ ^[SsYy]$ ]]; then
        SECURE_SSL_REDIRECT=True
        SESSION_COOKIE_SECURE=True
        CSRF_COOKIE_SECURE=True
        SECURE_HSTS_SECONDS=31536000
    else
        SECURE_SSL_REDIRECT=False
        SESSION_COOKIE_SECURE=False
        CSRF_COOKIE_SECURE=False
        SECURE_HSTS_SECONDS=0
        echo "HTTPS non ancora attivo: il sito parte in HTTP fino alla configurazione del certificato."
    fi

    umask 077
    {
        printf 'DB_NAME=%s\n' "$DB_NAME"
        printf 'DB_USER=%s\n' "$DB_USER"
        printf 'DB_PASSWORD=%s\n' "$DB_PASSWORD"
        printf 'DB_HOST=postgres\nDB_PORT=5432\n'
        printf 'SECRET_KEY=%s\nDEBUG=False\n' "$SECRET_KEY"
        printf 'ALLOWED_HOSTS=%s\n' "$DOMAIN"
        printf 'CSRF_TRUSTED_ORIGINS=https://%s\n' "$DOMAIN"
        printf 'CORS_ALLOW_ALL_ORIGINS=False\nCORS_ALLOWED_ORIGINS=https://%s\n' "$DOMAIN"
        printf 'SECURE_SSL_REDIRECT=%s\n' "$SECURE_SSL_REDIRECT"
        printf 'SESSION_COOKIE_SECURE=%s\n' "$SESSION_COOKIE_SECURE"
        printf 'CSRF_COOKIE_SECURE=%s\n' "$CSRF_COOKIE_SECURE"
        printf 'SECURE_HSTS_SECONDS=%s\n' "$SECURE_HSTS_SECONDS"
        printf 'SECURE_HSTS_INCLUDE_SUBDOMAINS=False\nSECURE_HSTS_PRELOAD=False\nLOG_LEVEL=INFO\n'
    } > .env
    chmod 600 .env
fi

if [ -n "$RELEASE_DIR" ]; then
    RELEASE_DIR="$(cd "$RELEASE_DIR" && pwd)"
    for required_file in postgres.dump icon_config.json img_uploads.tar.gz SHA256SUMS; do
        [ -f "$RELEASE_DIR/$required_file" ] || {
            echo "Artefatto mancante nel rilascio: $required_file" >&2
            exit 1
        }
    done
    echo "[3/7] Verifico l'integrità del rilascio"
    (cd "$RELEASE_DIR" && sha256sum -c SHA256SUMS)
else
    echo "[3/7] Nessun backup da ripristinare: verrà usato un database nuovo."
fi

echo "[4/7] Costruisco e avvio PostgreSQL e Django"
docker compose up -d --build postgres web

if [ -n "$RELEASE_DIR" ]; then
    echo "[5/7] Ripristino configurazione e immagini icone"
    docker compose cp "$RELEASE_DIR/icon_config.json" web:/tmp/icon_config.json
    docker compose cp "$RELEASE_DIR/img_uploads.tar.gz" web:/tmp/img_uploads.tar.gz
    docker compose exec -T web sh -c \
        'cp /tmp/icon_config.json /data/icon_config.json && \
         rm -rf /data/img_uploads && mkdir -p /data/img_uploads && \
         tar -xzf /tmp/img_uploads.tar.gz -C /data'

    echo "[6/7] Ripristino database PostgreSQL"
    docker compose stop web worker >/dev/null 2>&1 || true
    docker compose exec -T postgres sh -c \
        'pg_restore --clean --if-exists --no-owner --no-privileges \
         -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
        < "$RELEASE_DIR/postgres.dump"
else
    echo "[6/7] Nessun database da ripristinare"
fi

echo "[7/7] Avvio stack completo e applico le migrazioni"
docker compose up -d --build web worker nginx

echo
echo "Installazione completata."
echo "DNS da configurare: $DOMAIN -> $SERVER_IP"
echo
echo "Stato servizi:"
docker compose ps

echo
echo "Health check locale:"
docker compose exec -T web python manage.py check

echo
echo "Se il database era nuovo, crea l'amministratore con:"
echo "  docker compose exec web python manage.py createsuperuser"
echo
echo "Prima del go-live configura il certificato HTTPS e poi imposta i cookie secure nel .env."
