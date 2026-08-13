# Report — Passaggio in Produzione

**Target:** server Linux · Docker · PostgreSQL · nginx
**Data report:** agosto 2026 (aggiornato dopo l'implementazione del pacchetto deploy)

---

## ✅ GIÀ FATTO (validato)

### 0. Preparazione app
- [x] Sganciamento completo da SQLite: `settings.py` usa solo PostgreSQL (env `DB_*` obbligatorie, fail-fast); `db.sqlite3` eliminato (PG aveva tutti i dati).
- [x] `DEBUG` default `False` (si attiva solo con `DEBUG=True` esplicito).
- [x] `DEFAULT_AUTO_FIELD = AutoField` → `makemigrations --check` pulito.
- [x] Config icone dal server (json_script inline): niente flash, niente cache localStorage.
- [x] Anti-flash icone via CSS (`icons-not-ready`) con fallback noscript.
- [x] **94 test verdi su PostgreSQL**.

### 1. Web server
- [x] `gunicorn==23.0.0` in `requirements.txt` (versioni pinnate).
- [x] Comando gunicorn documentato: `gunicorn config.wsgi:application --workers 3 --timeout 300 --bind 0.0.0.0:8000`.
- [x] **Verificato con container reale**: gunicorn 23.0.0 avvia, `/` → 200, `/admin/login/` → 200 con `DEBUG=False`.

### 2. File statici e percorsi scrivibili
- [x] `STATIC_ROOT = BASE_DIR / "staticfiles"` in `settings.py` (la cartella è in `.gitignore`).
- [x] `collectstatic` validato: 207 file raccolti (CSS, JS, PNG).
- [x] `views.py`: `ICON_CONFIG_PATH` e `ICON_UPLOAD_DIR` sovrascrivibili via env (per i volumi Docker).
- [x] `nginx/nginx.conf`: serve `/static/` (collectstatic) e `/static/caricamento/img/` (upload admin) + reverse proxy con `X-Forwarded-Proto`.
- [x] CSP iniziale in modalità `Content-Security-Policy-Report-Only`: monitora script inline e sorgenti esterne senza bloccare la webapp.

### 3. Docker (creato e validato)
- [x] `Dockerfile` (python:3.13-slim + gunicorn) — **build OK**.
- [x] `docker-entrypoint.sh`: seed volumi (config icone + PNG upload) + migrate + collectstatic; `SKIP_MIGRATE=1` per il worker.
- [x] `docker-compose.yml` — **`docker compose config` OK**: servizi `postgres`, `web`, `worker` (Django Q2), `nginx`; volumi `pgdata`, `staticfiles`, `appdata`.
- [x] `.dockerignore` e `.env.example`.

### 4. Configurazione e sicurezza (env-driven in settings.py)
- [x] Ownership per utente su contenitori, oggetti e piani: le API filtrano per `request.user`; le relazioni cross-user vengono rifiutate.
- [x] Endpoint `/healthz/` con verifica connessione PostgreSQL.
- [x] Logging applicativo esplicito su stdout, configurabile con `LOG_LEVEL`.
- [x] `CORS_ALLOW_ALL_ORIGINS` ora **default False** (configurabile).
- [x] `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_PROXY_SSL_HEADER` tutti configurabili via env (default sicuri per lo sviluppo).
- [x] `python manage.py check` e `makemigrations --check` puliti.
- [x] `check --deploy` esaminato: i warning W004/W008/W009/W012/W016/W018 sono **attesi in locale** (DEBUG=True, no HTTPS) e si risolvono in produzione con le env del compose.
- [x] `SECRET_KEY` senza fallback: se manca dall'ambiente, l'applicazione fallisce all'avvio invece di usare un valore noto.
- [x] Guide Docker ripulite: nessuna password PostgreSQL in chiaro e PostgreSQL non viene più esposto direttamente dall'esempio di avvio.

---

## 🔴 DA FARE PRIMA DEL DEPLOY (manuale)

- [ ] **0. ROTAZIONE CREDENZIALI** (bloccante): la password PostgreSQL precedentemente presente nella guida va revocata/rigenerata. Se il repository è stato pubblicato, valutare anche la bonifica della storia Git e dei cloni/cache.
- [ ] **1. COMMIT E PUSH DI TUTTO** (bloccante): `git add -A && git commit && git push`.
  Verificare che il checkout contenga tutti i moduli `engine/tre_d/`, le migrazioni `0017_*.py` e `0018_aggiunto_owner_dati.py`, oltre alle immagini nuove.
  - Eliminare `packer_prima_della_modifica.py` (residuo legacy).
- [ ] **2. .env di produzione**: copiare `.env.example` → valorizzare `SECRET_KEY`, `DB_PASSWORD`, `ALLOWED_HOSTS` (dominio reale), `CSRF_TRUSTED_ORIGINS`, cookie secure.
- [ ] **3. Primo avvio**: `docker compose up -d --build`, poi:
  - `docker compose exec web python manage.py createsuperuser`
  - ImpostazioniSistema (giorni prova, demo, google_oauth_attivo)
  - SocialApp Google (Admin → Social applications) se usi il login Google
  - Utenti/articoli/mezzi/piani (o dump/restore da ambiente esistente)
- [ ] **4. HTTPS**: configurare certificato e blocco TLS in `nginx/nginx.conf` (il file attuale ascolta ancora solo su HTTP), poi impostare `SECURE_SSL_REDIRECT=True`, `SESSION_COOKIE_SECURE=True`, `CSRF_COOKIE_SECURE=True`, `SECURE_HSTS_SECONDS`.
- [ ] **4a. CSP**: osservare le violazioni `Report-Only` in ambiente di staging/produzione, sistemare gli script inline e passare a `Content-Security-Policy` effettiva senza `unsafe-inline` per gli script.
- [ ] **4b. Dati legacy**: assegnare i record con `owner IS NULL` a un tenant/utente deciso dall'amministratore, oppure esportarli per una riconciliazione; restano intenzionalmente invisibili agli utenti finché non assegnati. Verificare anche il comando `seed_data --username <utente>`: in produzione richiede esplicitamente `--force` ed è limitato al proprietario scelto.
- [ ] **5. Backup programmati**: usare `sh ops/backup.sh` via cron, conservando separatamente `postgres.dump`, `icon_config.json` e `img_uploads.tar.gz`; verificare periodicamente anche il restore descritto in `ops/RESTORE.md`.

---

## Backup e restore

Il repository contiene `ops/backup.sh`, che crea un dump PostgreSQL in formato custom, una copia di `icon_config.json` e un archivio separato delle immagini persistenti. La directory `backups/` è esclusa da Git.

```bash
sh ops/backup.sh
# Eseguire il test di ripristino seguendo ops/RESTORE.md su un ambiente separato
```

Il backup non sostituisce una policy di retention esterna: copiare gli artefatti su storage separato dal server e verificare periodicamente che siano leggibili.

## Verifiche finali pre-lancio

```bash
git status --porcelain | wc -l        # deve essere 0
python manage.py check --deploy       # in produzione: niente warning bloccanti
docker compose config --quiet         # OK
docker compose up -d --build
docker compose ps                     # 4 servizi UP (worker incluso!)
curl -I https://tuodominio/                       # 200 + HTTPS + CSP Report-Only
curl -I https://tuodominio/static/caricamento/css/base.css   # 200
# Ottimizzazione: crea piano → Elabora (async) → verifica task completato
```

---

## Note e rischi residui (non bloccanti)

| Rischio | Nota |
|---|---|
| **Worker Q2** | Il servizio `worker` è obbligatorio: senza, le ottimizzazioni asincrone restano in coda. Heartbeat e healthcheck Docker coprono il processo di servizio; aggiungere comunque alert sul backlog/task bloccati. |
| **Three.js 0.128** (2021) | Funziona; valutare aggiornamento futuro (breaking changes nel codice viewport). |
| **Rate limiting** | `ottimizza` 10/min per utente: volutamente prudente. |
| **Django Q2 su DB** | Semplice (no Redis) ma le code sono nel DB; per alta concorrenza valutare broker dedicato. |
| **Logging/monitoring** | Logging stdout configurato; restano da collegare raccolta centralizzata e alert operativi. |
| **`staticfiles/` locale** | Creata dal collectstatic di verifica: è in `.gitignore`, innocua. |
| **Proxy e HTTPS** | Se il TLS è terminato da un proxy diverso dal nginx fornito, deve inoltrare `X-Forwarded-Proto: https` (altrimenti, con `SECURE_SSL_REDIRECT=True`, redirect loop). L'attuale nginx incluso nel repository non contiene ancora i certificati/blocco `listen 443 ssl`. |
| **Container come root** | Il Dockerfile non definisce un utente non-root: accettabile per il primo deploy; per hardening futuro aggiungere `USER` (gestendo i permessi dei volumi). |
