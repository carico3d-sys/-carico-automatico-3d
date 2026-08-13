# Restore di un backup

La procedura di restore è distruttiva. Eseguirla prima su un ambiente separato e
verificare il contenuto prima di sostituire il database di produzione.

## 1. Verifica degli artefatti

```bash
cd backups/<timestamp>
sha256sum -c SHA256SUMS
```

## 2. Ripristino dei dati persistenti delle icone

Con i servizi avviati e il backup disponibile sul server:

```bash
docker compose cp backups/<timestamp>/icon_config.json web:/tmp/icon_config.json
docker compose cp backups/<timestamp>/img_uploads.tar.gz web:/tmp/img_uploads.tar.gz
docker compose exec -T web sh -c \
  'cp /tmp/icon_config.json /data/icon_config.json && \
   rm -rf /data/img_uploads && mkdir -p /data/img_uploads && \
   tar -xzf /tmp/img_uploads.tar.gz -C /data'
```

## 3. Ripristino PostgreSQL

Il restore sostituisce i dati presenti nel database indicato dal container.
Fermare prima `web` e `worker` per impedire scritture concorrenti:

```bash
docker compose stop web worker

docker compose exec -T postgres sh -c \
  'pg_restore --clean --if-exists --no-owner --no-privileges \
   -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < backups/<timestamp>/postgres.dump

docker compose up -d web worker nginx
```

Dopo il restore controllare:

```bash
docker compose ps
curl -fsS http://127.0.0.1/healthz/
docker compose logs --tail=100 web worker nginx
```

Il restore va testato periodicamente su una copia del database, senza usare
l'unica istanza di produzione come ambiente di prova.
