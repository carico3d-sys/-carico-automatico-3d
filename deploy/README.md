# Script di deploy

La cartella contiene due script, senza segreti incorporati:

- `prepara_rilascio.py`: da eseguire sul PC del progetto;
- `installa_produzione.sh`: da eseguire sul server Linux.

## 1. PC: prepara codice e dati

Prerequisiti: Python, Git e Docker Compose se si vuole creare anche il backup
con lo stack locale avviato.

```bash
python deploy/prepara_rilascio.py --start-docker \
  --commit "Prepara rilascio produzione" --push
```

Lo script esegue:

- `check` e controllo migrazioni;
- test automatici, salvo `--skip-tests`;
- validazione di Docker Compose;
- commit/push solo se richiesti esplicitamente;
- backup di PostgreSQL, `icon_config.json` e immagini PNG;
- creazione di `RELEASE.json` con la revisione Git.

Il risultato viene creato in `backups/release-<timestamp>/`. La cartella è
ignorata da Git e va trasferita separatamente al server con SCP/SFTP.

Se i container locali sono già avviati, si può omettere `--start-docker`.
Se si vuole solo validare il codice senza dati, usare `--skip-backup`.

## 2. Server Linux: installa o aggiorna

Copiare prima la cartella di rilascio sul server, poi eseguire dalla root del
progetto oppure usando il percorso assoluto dello script:

```bash
bash deploy/installa_produzione.sh \
  --repo https://github.com/ORGANIZZAZIONE/REPOSITORY.git \
  --domain app.example.com \
  --server-ip 203.0.113.50 \
  --release /opt/carico3d/backups/release-<timestamp>
```

Lo script:

- clona il repository oppure esegue `git pull --ff-only`;
- chiede in modo nascosto password PostgreSQL e `SECRET_KEY`;
- crea `.env` con permessi `600`;
- avvia i container Docker;
- verifica il backup;
- ripristina database, configurazione e immagini;
- riavvia `web`, `worker` e `nginx`;
- stampa il record DNS da creare.

Se si vuole partire con un database vuoto, omettere `--release`.

## HTTPS e DNS

Lo script non può modificare automaticamente il pannello DNS e non genera un
certificato senza sapere quale provider DNS/TLS viene utilizzato. Il record da
creare è quello stampato alla fine, ad esempio:

```text
app.example.com  A  203.0.113.50
```

L’esempio Nginx HTTPS è in `nginx/nginx-https.conf.example`. Dopo aver creato
il certificato, sostituire `example.com` con il dominio reale, attivare la
configurazione e solo dopo abilitare `SECURE_SSL_REDIRECT=True` e i cookie
secure nel `.env`.

## Sicurezza

- Non passare password come argomenti della shell.
- Non copiare `.env` o i backup su GitHub.
- Conservare il backup anche fuori dal server.
- Eseguire il restore prima su staging quando i dati sono importanti.
- Il record DNS e il certificato HTTPS restano passaggi esterni allo script.
