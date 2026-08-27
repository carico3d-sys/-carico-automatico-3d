#!/usr/bin/env bash
# =============================================================================
# ops/vm_cleanup.sh — Pulizia processi orfani sulla VM Ubuntu
#
# Uso:
#   bash ops/vm_cleanup.sh          # Pulizia completa (stop + kill odfani)
#   bash ops/vm_cleanup.sh start    # Pulizia + avvio stack
#   bash ops/vm_cleanup.sh status   # Mostra processi sospetti
#
# Da eseguire:
#   - All'avvio della VM (in /etc/rc.local o systemd service)
#   - Prima di docker compose up
#   - Se qualcosa non funziona e sospetti processi orfani
#
# Cosa pulisce:
#   1. Container Docker orfani (web, postgres, worker, nginx)
#   2. Processi cloudflared (tunnel Cloudflare) fuori da Docker
#   3. Processi Python/gunicorn/qcluster orfani
#   4. Porte 8000/5432 bloccate da processi fantasma
# =============================================================================
set -u

APP_DIR="/home/gianni/carico3d"
cd "$APP_DIR" 2>/dev/null || cd "$(dirname "$0")/.."

# Colori
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[CLEANUP]${NC} $*"; }
warn() { echo -e "${YELLOW}[ATTENZIONE]${NC} $*"; }
err()  { echo -e "${RED}[ERRORE]${NC} $*"; }

# =============================================================================
# 1. Ferma container Docker orfani
# =============================================================================
stop_docker() {
    log "Ferma container Docker..."
    if docker compose ps --status running 2>/dev/null | grep -q "Up"; then
        docker compose down --timeout 10 2>/dev/null || true
        log "Container Docker fermati."
    else
        log "Nessun container Docker attivo."
    fi

    # Forza stop se restano container zombie
    local zombie_containers
    zombie_containers=$(docker ps -q --filter "name=carico3d" 2>/dev/null || true)
    if [ -n "$zombie_containers" ]; then
        warn "Container zombie trovati: $zombie_containers"
        echo "$zombie_containers" | xargs docker rm -f 2>/dev/null || true
        log "Container zombie rimossi."
    fi
}

# =============================================================================
# 2. Uccidi processi cloudflared orfani
# =============================================================================
kill_cloudflared() {
    log "Cerco processi cloudflared orfani..."
    local pids
    pids=$(pgrep -f "cloudflared" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        warn "Trovati $pids processi cloudflared: $(echo $pids | tr '\n' ' ')"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
        # Verifica che siano morti
        pids=$(pgrep -f "cloudflared" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            err "Impossibile uccidere cloudflared: $pids"
        else
            log "Processi cloudflared terminati."
        fi
    else
        log "Nessun processo cloudflared trovato."
    fi
}

# =============================================================================
# 3. Uccidi processi Python/gunicorn/qcluster orfani
# =============================================================================
kill_python_orphans() {
    log "Cerco processi Python orfani (gunicorn, qcluster, runserver)..."

    # Processi manage.py (runserver o qcluster)
    local manage_pids
    manage_pids=$(pgrep -f "manage.py" 2>/dev/null || true)
    if [ -n "$manage_pids" ]; then
        warn "Trovati processi manage.py: $(echo $manage_pids | tr '\n' ' ')"
        echo "$manage_pids" | xargs kill -9 2>/dev/null || true
    fi

    # Processi gunicorn orfani (fuori da Docker)
    local gunicorn_pids
    gunicorn_pids=$(pgrep -f "gunicorn" 2>/dev/null || true)
    if [ -n "$gunicorn_pids" ]; then
        warn "Trovati processi gunicorn: $(echo $gunicorn_pids | tr '\n' ' ')"
        echo "$gunicorn_pids" | xargs kill -9 2>/dev/null || true
    fi

    # Processi qcluster orfani
    local qcluster_pids
    qcluster_pids=$(pgrep -f "qcluster" 2>/dev/null || true)
    if [ -n "$qcluster_pids" ]; then
        warn "Trovati processi qcluster: $(echo $qcluster_pids | tr '\n' ' ')"
        echo "$qcluster_pids" | xargs kill -9 2>/dev/null || true
    fi

    sleep 1
    log "Pulizia processi Python completata."
}

# =============================================================================
# 4. Libera porte bloccate
# =============================================================================
free_ports() {
    log "Verifico porte 8000 e 5432..."

    for port in 8000 5432; do
        local pids
        pids=$(lsof -ti :"$port" 2>/dev/null || ss -tlnp 2>/dev/null | grep ":$port " | awk '{print $NF}' | grep -oP '\d+' || true)
        if [ -n "$pids" ]; then
            warn "Porta $port occupata da PID: $(echo $pids | tr '\n' ' ')"
            echo "$pids" | xargs kill -9 2>/dev/null || true
            sleep 1
            # Verifica
            pids=$(lsof -ti :"$port" 2>/dev/null || true)
            if [ -n "$pids" ]; then
                err "Porta $port ancora occupata dopo kill"
            else
                log "Porta $port libera."
            fi
        else
            log "Porta $port libera."
        fi
    done
}

# =============================================================================
# 5. Avvia stack Docker
# =============================================================================
start_stack() {
    log "Avvio stack Docker..."
    cd "$APP_DIR"
    docker compose up -d --build
    sleep 3
    docker compose ps
    log "Stack avviato."
}

# =============================================================================
# 6. Status
# =============================================================================
show_status() {
    echo ""
    echo "=== CONTAINER DOCKER ==="
    docker compose ps 2>/dev/null || echo "(nessun container)"

    echo ""
    echo "=== PROCESSI CLOUDFLARED ==="
    pgrep -fa "cloudflared" 2>/dev/null || echo "(nessuno)"

    echo ""
    echo "=== PROCESSI PYTHON ORFANI ==="
    pgrep -fa "manage.py\|gunicorn\|qcluster" 2>/dev/null || echo "(nessuno)"

    echo ""
    echo "=== PORTE IN ASCOLTO ==="
    ss -tlnp 2>/dev/null | grep -E ":(8000|5432|80|443) " || echo "(nessuna porta rilevante)"

    echo ""
}

# =============================================================================
# DISPATCH
# =============================================================================
cmd="${1:-cleanup}"

case "$cmd" in
    cleanup)
        echo ""
        log "=== PULIZIA PROCESSI ORFANI VM ==="
        echo ""
        stop_docker
        kill_cloudflared
        kill_python_orphans
        free_ports
        echo ""
        log "=== PULIZIA COMPLETATA ==="
        echo ""
        show_status
        ;;
    start)
        echo ""
        log "=== PULIZIA + AVVIO ==="
        echo ""
        stop_docker
        kill_cloudflared
        kill_python_orphans
        free_ports
        echo ""
        start_stack
        ;;
    status)
        show_status
        ;;
    stop)
        stop_docker
        kill_cloudflared
        kill_python_orphans
        free_ports
        ;;
    *)
        echo "Uso: $0 {cleanup|start|stop|status}" >&2
        exit 1
        ;;
esac
