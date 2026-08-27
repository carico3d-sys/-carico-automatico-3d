#!/usr/bin/env bash
# =============================================================================
# ops/installa_tunnel.sh — Installa i servizi systemd dei tunnel Cloudflare
#
# Da eseguire UNA SOLA VOLTA sulla VM Ubuntu:
#   sudo bash ops/installa_tunnel.sh
#
# Cosa fa:
#   1. Verifica che cloudflared sia installato (/usr/local/bin/cloudflared)
#   2. Copia cloudflared.service e quicktunnel.service in /etc/systemd/system/
#   3. Crea /etc/default/cloudflared con il placeholder TUNNEL_TOKEN
#   4. Abilita entrambi i servizi al boot (senza avviarli subito:
#      prima va inserito il token del tunnel persistente)
#
# Dopo l'installazione:
#   1. Inserire il token del tunnel persistente:
#        sudo nano /etc/default/cloudflared
#      (riga: TUNNEL_TOKEN=eyJ...)
#   2. Avviare i servizi:
#        sudo systemctl start cloudflared.service
#        sudo systemctl start quicktunnel.service
#   3. Verificare:
#        sudo systemctl status cloudflared.service
#        sudo journalctl -u quicktunnel.service --no-pager -n 20
# =============================================================================
set -euo pipefail

APP_DIR="/home/gianni/carico3d"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLOUDFLARED_BIN="/usr/local/bin/cloudflared"
ENV_FILE="/etc/default/cloudflared"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[ERRORE]${NC} $*"; exit 1; }

# Verifica che siamo root
if [ "$EUID" -ne 0 ]; then
    err "Esegui con sudo: sudo bash ops/installa_tunnel.sh"
fi

echo ""
echo "=== Installazione servizi tunnel Cloudflare Carico 3D ==="
echo ""

# 1. Verifica cloudflared
echo "[1/4] Verifico cloudflared..."
if [ ! -x "$CLOUDFLARED_BIN" ]; then
    warn "cloudflared non trovato in $CLOUDFLARED_BIN"
    warn "Installalo prima: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    warn "Es. per amd64:"
    warn "  curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
    warn "  sudo dpkg -i cloudflared.deb"
    err "cloudflared mancante: installalo e riesegui questo script"
fi
log "cloudflared trovato: $CLOUDFLARED_BIN ($("$CLOUDFLARED_BIN" --version 2>/dev/null | head -1))"

# 2. Copia i file unit
echo "[2/4] Copio i file unit..."
cp "$SCRIPT_DIR/cloudflared.service" /etc/systemd/system/cloudflared.service
cp "$SCRIPT_DIR/quicktunnel.service" /etc/systemd/system/quicktunnel.service
log "Unit copiate in /etc/systemd/system/"

# 3. Crea /etc/default/cloudflared (solo se assente)
echo "[3/4] Preparo $ENV_FILE..."
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" <<'EOF'
# Token del tunnel Cloudflare persistente (URL stabile).
# Generarlo con: cloudflared tunnel token --credential-file <file>
# oppure copiarlo dal pannello Zero Trust di Cloudflare.
# Lasciare vuoto se si usa solo il quicktunnel.
TUNNEL_TOKEN=
EOF
    chmod 600 "$ENV_FILE"
    log "Creato $ENV_FILE (compilare TUNNEL_TOKEN prima di avviare cloudflared.service)"
else
    warn "$ENV_FILE esiste gia': non sovrascritto"
fi

# 4. Abilita al boot
echo "[4/4] Abilito i servizi al boot..."
systemctl daemon-reload
systemctl enable cloudflared.service
systemctl enable quicktunnel.service
log "Servizi abilitati: partiranno automaticamente al boot"

echo ""
echo "=== Installazione completata ==="
echo ""
echo "Prossimi passi:"
echo "  1. Inserisci il token del tunnel persistente:"
echo "       sudo nano /etc/default/cloudflared"
echo "     (riga: TUNNEL_TOKEN=...) — se usi solo il quicktunnel lascialo vuoto"
echo "  2. Avvia i servizi:"
echo "       sudo systemctl start cloudflared.service"
echo "       sudo systemctl start quicktunnel.service"
echo "  3. Verifica:"
echo "       sudo systemctl status cloudflared.service"
echo "       sudo journalctl -u quicktunnel.service --no-pager -n 20"
echo ""
echo "Per disabilitare:"
echo "  sudo systemctl disable cloudflared.service quicktunnel.service"
echo ""
