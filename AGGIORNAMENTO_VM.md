# Aggiornamento VM Ubuntu (VirtualBox) — Procedura Completa

**Data:** agosto 2026 | **Branch:** `auto_7_1`

---

## 1. CONNESSIONE SSH alla VM

### Prerequisiti
- VirtualBox in esecuzione con la VM Ubuntu accesa
- Port forwarding SSH configurato (host 2222 → guest 22)

### Comando di connessione (da terminale Windows)

```bash
ssh -p 2222 gianni@127.0.0.1
```

Password: `gianni` (o quella impostata durante la creazione della VM)

### Verifica funzionamento

```bash
# Verifica che sei nella cartella giusta
cd /home/gianni/carico3d
pwd
```

> **Se non trovi la cartella**, cerca:
> ```bash
> find /home -name "manage.py" -type f 2>/dev/null
> ```

---

## 2. AGGIORNAMENTO CODICE (git pull)

### Passo 1 — Entra nella cartella del progetto

```bash
cd /home/gianni/carico3d
```

### Passo 2 — Verifica branch e stato attuale

```bash
# Mostra branch corrente
git branch --show-current
# Output atteso: auto_7_1

# Mostra ultimi commit
git log --oneline -3

# Verifica che non ci siano modifiche locali
git status
```

### Passo 3 — Pull delle modifiche

```bash
git pull origin auto_7_1
```

> Se il pull riporta conflitti (`CONFLICT`), contattare prima di procedere.

---

## 3. REBUILD DOCKER (webapp + worker)

### Passo 4 — Ricostruisci e riavvia i container

```bash
cd /home/gianni/carico3d
docker compose up -d --build
```

**Cosa fa questo comando:**
- `--build` → Ricostruisce l'immagine Docker con il codice nuovo
- `-d` → Avvia in background (non blocca il terminale)

**Tempo stimato:** 2-5 minuti (dipende dai cambiamenti)

### Passo 5 — Verifica che tutti i container siano avviati

```bash
docker compose ps
```

**Output atteso (4 container tutti healthy):**

```
NAME                  STATUS
carico3d-nginx-1      Up ... (healthy)
carico3d-postgres-1   Up ... (healthy)
carico3d-web-1        Up ... (healthy)
carico3d-worker-1     Up ... (healthy)
```

> ⚠️ Se qualche container è `Restarting` o `Exited`, controlla i log:
> ```bash
> docker compose logs web --tail=50
> ```

### Passo 6 — Verifica che la webapp risponda

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1/
# Output atteso: HTTP 200
```

---

## 4. POSTGRESQL — Come funziona

### Il database è PERSISTENTE

PostgreSQL ha un **volume Docker dedicato** (`carico3d_pgdata`). Quando fai `docker compose up -d --build`:

| Cosa succede | Dati preservati? |
|---|---|
| `docker compose up -d --build` | ✅ **SÌ** — i dati del DB restano |
| `docker compose down` | ✅ **SÌ** — il volume resta |
| `docker compose down -v` | ❌ **NO** — il volume viene CANCELLATO |

### Quando serve fare migrate

Il `docker-entrypoint.sh` esegue `migrate` automaticamente al restart del container `web`. Se hai aggiunto nuovi modelli Django o modifiche al DB:

```bash
# Il migrate parte automaticamente col rebuild, ma puoi farlo anche manualmente:
docker compose exec web python manage.py migrate --noinput
```

### Backup manuale del database

```bash
# Dump del database
docker compose exec -T postgres pg_dump -U carico carico_3d > backup_$(date +%Y%m%d).sql

# Ripristino (attenzione: sovrascrive i dati!)
docker compose exec -T postgres psql -U carico carico_3d < backup_20260822.sql
```

### Verifica che PostgreSQL sia connesso

```bash
docker compose exec web python manage.py shell -c "
from django.db import connection
cursor = connection.cursor()
cursor.execute('SELECT 1')
print('PostgreSQL OK:', cursor.fetchone())
"
```

---

## 5. AGGIORNAMENTO COMPLETO — Checklist riassuntiva

```bash
# === STEP COMPLETO IN UN BLOcco ===

# 1. Connetti alla VM
ssh -p 2222 gianni@127.0.0.1

# 2. Entra nella cartella
cd /home/gianni/carico3d

# 3. Verifica branch
git branch --show-current
# Deve dire: auto_7_1

# 4. Pull del codice nuovo
git pull origin auto_7_1

# 5. Rebuild e riavvio Docker
docker compose up -d --build

# 6. Verifica che tutto funzioni
docker compose ps
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1/
```

---

## 6. TROUBLESHOOTING — Errori comuni

### Errore "Permission denied" su SSH
```bash
ssh -p 2222 gianni@127.0.0.1
# Se chiede password: gianni (o quella della VM)
```

### Errore "not a git repository"
```bash
# Sei nella cartella sbagliata
find /home -name "manage.py" -type f 2>/dev/null
cd /percorso/trovato
```

### Container non parte dopo rebuild
```bash
docker compose logs web --tail=100
# Cerca errori (solitamente manca .env o errore Python)
```

### PostgreSQL non risponde
```bash
docker compose exec web python manage.py dbshell
# Se apre la shell psql → il DB funziona
# Se dà errore → il container postgres non è healthy
docker compose ps postgres  # controlla stato
```

### Pagina non si aggiorna nel browser
```
# Pulisci cache del browser:
Ctrl + Shift + Delete → Cancella cache
Oppure Ctrl + F5 (hard refresh)
Oppure apri in finestra di navigazione in incognito
```

### .env mancante
```bash
# Copia da esempio
cp .env.example .env
# Poi edita con i valori di produzione
nano .env
```

---

## 7. ARCHITETTURA DOCKER (riepilogo)

```
┌─────────────────────────────────────────────────────────┐
│  Windows (PC locale)                                    │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  VirtualBox — Ubuntu VM                           │  │
│  │                                                   │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  Docker Compose Stack (carico3d)            │  │  │
│  │  │                                             │  │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │  │
│  │  │  │ postgres │  │   web    │  │  worker  │  │  │  │
│  │  │  │ (DB)     │  │ (Django) │  │ (Q2)     │  │  │  │
│  │  │  │ :5432*   │  │ :8000*   │  │ :8000*   │  │  │  │
│  │  │  └────┬─────┘  └────┬─────┘  └──────────┘  │  │  │
│  │  │       │              │                      │  │  │
│  │  │  ┌────┴──────────────┴────┐  ┌──────────┐  │  │  │
│  │  │  │  Volumes Docker        │  │  nginx   │  │  │  │
│  │  │  │  • pgdata (DB)         │  │  :80     │  │  │  │
│  │  │  │  • staticfiles (CSS)   │  │  :443    │  │  │  │
│  │  │  │  • appdata (icone)     │  └──────────┘  │  │  │
│  │  │  └────────────────────────┘                │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  │                                                   │  │
│  │  SSH: porta 2222 (host) → 22 (guest)              │  │
│  │  HTTP: porta 80 (host) → 80 (guest)               │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Il codice è su GitHub (branch auto_7_1)                │
│  Da Windows fai: git push → poi SSH + pull nella VM     │
└─────────────────────────────────────────────────────────┘

* = porta interna Docker, NON esposta direttamente all'host
  Solo nginx (80/443) è esposta all'esterno
```

---

## 8. FLUSSO DI LAVORO GIORNALIERO

```
Windows (sviluppo)          GitHub              Ubuntu VM (produzione)
─────────────────          ──────              ──────────────────────
Modifichi codice           git push            SSH → git pull
                             │                  │
                             ▼                  ▼
                           auto_7_1          docker compose up -d --build
                                              │
                                              ▼
                                            App aggiornata su porta 80
```

### Da Windows (terminale):
```bash
cd C:\progetti_python\carico_aut_man7
git add .
git commit -m "Descrizione modifica"
git push origin auto_7_1
```

### Da SSH nella VM:
```bash
cd /home/gianni/carico3d
git pull origin auto_7_1
docker compose up -d --build
docker compose ps  # verifica
```

### Verifica nel browser:
```
http://localhost/         → landing page
http://localhost/workspace/ → workspace
```

---

## 9. COMANDI UTILI RAPIDI

| Comando | Cosa fa |
|---|---|
| `docker compose ps` | Stato dei container |
| `docker compose logs web --tail=50` | Ultimi 50 log del web |
| `docker compose logs postgres --tail=20` | Log PostgreSQL |
| `docker compose exec web python manage.py migrate` | Applica migrazioni |
| `docker compose exec web python manage.py createsuperuser` | Crea admin |
| `docker compose restart web` | Riavvia solo il web |
| `docker compose restart` | Riavvia tutti i container |
| `docker compose down` | Ferma tutto (dati preservati) |
| `docker compose down -v` | ⚠️ Ferma tutto E CANCELLA i dati |
| `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/` | Test HTTP |
