#!/usr/bin/env bash
# =============================================================================
# ops/installa_cleanup.sh — Installa il servizio systemd di pulizia processi
#
# Da eseguire UNA SOLA VOLTA sulla VM Ubuntu:
#   sudo bash ops/installa_cleanup.sh
#
# Cosa fa:
#   1. Copia vm_cleanup.sh in /home/gianni/carico3d/ops/
#   2. Copia carico3d-cleanup.service in /etc/systemd/system/
#   3. Abilita il servizio al boot
#   4. Lo testa subito (dry run)
#
# Dopo l'installazione, al boot della VM:
#   1. carico3d-cleanup.service pulisce processi orfani
#   2. docker.service avvia i container
#   3. cloudflared.service avvia il tunnel
# =============================================================================
set -euo pipefail

APP_DIR="/home/gianni/carico3d"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[ERRORE]${NC} $*"; exit 1; }

# Verifica che siamo root
if [ "$EUID" -ne 0 ]; then
    err "Esegui con sudo: sudo bash ops/installa_cleanup.sh"
fi

echo ""
echo "=== Installazione servizio di pulizia processi Carico 3D ==="
echo ""

# 1. Copia vm_cleanup.sh
echo "[1/4] Copio vm_cleanup.sh..."
cp "$SCRIPT_DIR/vm_cleanup.sh" "$APP_DIR/ops/vm_cleanup.sh"
chmod +x "$APP_DIR/ops/vm_cleanup.sh"
log "vm_cleanup.sh copiato in $APP_DIR/ops/"

# 2. Copia il servizio systemd
echo "[2/4] Copio carico3d-cleanup.service..."
cp "$SCRIPT_DIR/carico3d-cleanup.service" /etc/systemd/system/carico3d-cleanup.service
log "Servizio copiato in /etc/systemd/system/"

# 3. Ricarica systemd e abilita il servizio
echo "[3/4] Abilito il servizio al boot..."
systemctl daemon-reload
systemctl enable carico3d-cleanup.service
log "Servizio abilitato: partirà automaticamente al boot"

# 4. Test (dry run)
echo "[4/4] Test rapido..."
echo ""
echo "--- Status attuale ---"
"$APP_DIR/ops/vm_cleanup.sh" status
echo ""
echo "--- Test pulizia (dry run) ---"
"$APP_DIR/ops/vm_cleanup.sh" cleanup
echo ""
echo "=== Installazione completata ==="
echo ""
echo "Ordine di avvio al boot:"
echo "  1. carico3d-cleanup.service (pulisce processi orfani)"
echo "  2. docker.service (avvia container)"
echo "  3. cloudflared.service (avvia tunnel)"
echo ""
echo "Per verificare:"
echo "  sudo systemctl status carico3d-cleanup"
echo "  sudo journalctl -u carico3d-cleanup --no-pager"
echo ""
echo "Per disabilitare:"
echo "  sudo systemctl disable carico3d-cleanup"
echo ""
