#!/usr/bin/env bash
# ============================================================================
# ops/dev.sh — Gestione lineare dei processi di sviluppo (Windows / Git Bash)
#
# Regola: un solo runserver + un solo qcluster alla volta, avviati da questo
# script e fermati da questo script. Nessun avvio manuale con nohup/& fuori
# da qui, altrimenti si accumulano processi con codice vecchio che continuano
# a processare task dalla coda Django-Q.
#
# Uso:
#   ops/dev.sh start          Avvia runserver (porta 8000) + qcluster
#   ops/dev.sh stop           Ferma TUTTI i processi del progetto (idempotente)
#   ops/dev.sh restart        stop + start
#   ops/dev.sh status         Mostra i processi python e chi ascolta su 8000
#
# Il kill è ricorsivo (taskkill //T //F) e termina anche i figli spawn_main
# orfani: su Windows uccidere solo il master lascia vivi i worker figli, che
# continuano a processare task con il codice caricato al loro avvio.
# ============================================================================
set -u
cd "$(dirname "$0")/.."

PY=".venv/Scripts/python.exe"
PIDFILE="ops/.dev_pids"
LOGDIR="ops/logs"
mkdir -p "$LOGDIR"

PORT="${PORT:-8000}"
RUNSERVER_LOG="$LOGDIR/runserver.log"
QCLUSTER_LOG="$LOGDIR/qcluster.log"
MARKER="carico_aut_man7"

cmd="${1:-status}"

# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

# Tutti i processi python: "PID parent_pid command_line"
# Nota: wmic ordina le colonne alfabeticamente, quindi il PID è l'ULTIMO
# campo e il parent il penultimo (il command line occupa i primi campi).
_python_procs() {
  wmic process where "name='python.exe'" get ProcessId,ParentProcessId,CommandLine 2>/dev/null \
    | tr -d '\r' \
    | awk '{
        if (NF >= 2) {
          pid = $(NF);
          parent = $(NF-1);
          # ricostruisci il command line senza gli ultimi due campi
          cmd = "";
          for (i = 1; i <= NF-2; i++) cmd = cmd " " $i;
          sub(/^ /, "", cmd);
          if (pid ~ /^[0-9]+$/) print pid, parent, cmd;
        }
      }'
}

# PID dei processi il cui command line matcha un pattern (grep -E)
_pids_by_cmdline() {
  local pattern="$1"
  _python_procs | grep -iE "$pattern" | awk '{print $1}' | sort -un
}

# Kill di un singolo PID con tutto l'albero (figli + nipoti)
_kill_tree() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
}

# Kill di una lista di PID (spazio-separati)
_kill_pids() {
  local pid
  for pid in $1; do
    _kill_tree "$pid"
  done
}

# Uccide i figli spawn_main ORFANI: spawn_main il cui processo padre non è
# più vivo. Su Windows sono i worker/figli rimasti dopo la morte del master.
_kill_orphan_spawn() {
  local alive
  alive=$(_python_procs | awk '{print $1}' | sort -un)
  local orphans
  orphans=$(_python_procs | grep -i "spawn_main" \
    | awk -v alive="$alive" '
        {
          pid = $1; parent = $2;
          # spawn_main non deve avere genitore vivo
          if (index(" " alive " ", " " parent " ") == 0) print pid;
        }')
  _kill_pids "$orphans"
}

# ---------------------------------------------------------------------------
# Comandi
# ---------------------------------------------------------------------------

stop() {
  echo "==> Stop processi progetto ($MARKER)"

  # 0) PID registrati in precedenza (difensivo: il cmdline potrebbe non
  #    matchare per quoting o percorsi diversi)
  if [ -f "$PIDFILE" ]; then
    _kill_pids "$(cat "$PIDFILE" | tr '\n' ' ')"
  fi

  sleep 1

  # 1) Master: runserver e qcluster (il command line contiene "manage.py")
  local masters
  masters=$(_pids_by_cmdline "manage\.py (runserver|qcluster)")
  _kill_pids "$masters"

  sleep 1

  # 2) Figli spawn_main orfani (parent morto) — i veri "zombie"
  _kill_orphan_spawn

  sleep 1

  # 3) Pulizia finale: qualsiasi python del progetto ancora vivo
  local residui
  residui=$(_python_procs | grep -i "$MARKER" | awk '{print $1}' | sort -un)
  if [ -n "$residui" ]; then
    echo "==> Residui non ancora terminati: $residui — kill forzato"
    _kill_pids "$residui"
  fi

  rm -f "$PIDFILE"
  echo "==> Stop completato"
}

start() {
  echo "==> Start runserver (porta $PORT) + qcluster"

  # Prima di avviare, stato pulito: niente processi residui con codice vecchio
  stop

  # Riavvio pulito
  rm -f "$RUNSERVER_LOG" "$QCLUSTER_LOG" "$PIDFILE"

  # NB: su Git Bash $! è il PID del subshell, non del processo python reale.
  # Per questo i PID veri vengono rilevati dal command line dopo l'avvio;
  # stop comunque uccide per command line, il file è solo informativo/difensivo.
  nohup "$PY" manage.py runserver "$PORT" >> "$RUNSERVER_LOG" 2>&1 &
  nohup "$PY" manage.py qcluster >> "$QCLUSTER_LOG" 2>&1 &

  sleep 4

  # Registra i PID python REALI (runserver master + figli autoreload,
  # qcluster master) trovati dal command line.
  _pids_by_cmdline "manage\.py runserver" > "$PIDFILE"
  _pids_by_cmdline "manage\.py qcluster" >> "$PIDFILE"

  echo ""
  status
  echo ""
  echo "==> Log:"
  echo "    runserver: $RUNSERVER_LOG"
  echo "    qcluster : $QCLUSTER_LOG"
  echo ""
  echo "==> Per fermare tutto: ops/dev.sh stop"
}

status() {
  echo "==> Processi python in esecuzione"
  local procs
  procs=$(_python_procs)
  if [ -z "$procs" ]; then
    echo "    (nessuno)"
  else
    echo "$procs" | grep -iE "manage\.py|spawn_main" \
      | awk '{ cmd = $0; sub(/^[0-9]+ [0-9]+ /, "", cmd);
               printf "    PID %-8s parent %-8s %s\n", $1, $2, cmd }'
  fi

  echo ""
  echo "==> Porta $PORT (runserver)"
  local listener
  listener=$(netstat -ano 2>/dev/null | grep "LISTENING" | grep ":$PORT " | awk '{print $NF}' | sort -un)
  if [ -n "$listener" ]; then
    for pid in $listener; do
      echo "    PID $pid in ascolto su porta $PORT"
    done
  else
    echo "    nessun processo in ascolto"
  fi

  echo ""
  echo "==> PID registrati in $PIDFILE"
  if [ -f "$PIDFILE" ]; then
    while read -r pid; do
      if tasklist //FI "PID eq $pid" 2>/dev/null | grep -q "$pid"; then
        echo "    PID $pid (attivo)"
      else
        echo "    PID $pid (NON più attivo)"
      fi
    done < "$PIDFILE"
  else
    echo "    (nessun PID registrato)"
  fi
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

case "$cmd" in
  start)   start ;;
  stop)    stop ;;
  restart) stop && start ;;
  status)  status ;;
  *)
    echo "Uso: ops/dev.sh {start|stop|restart|status}" >&2
    exit 1
    ;;
esac
