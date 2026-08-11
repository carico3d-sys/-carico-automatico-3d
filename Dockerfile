# =============================================================================
# Dockerfile — Carico 3D (Django + gunicorn)
# Uso: docker compose up --build
# =============================================================================
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dipendenze prima del codice (migliore caching dei layer)
COPY requirements.txt .
RUN pip install -r requirements.txt

# Codice applicativo
COPY . .

# Salva gli originali di config icone e PNG: servono al seed dei volumi
# al primo avvio (vedi docker-entrypoint.sh), perché i volumi Docker
# partono vuoti e "nasconderebbero" i file dell'immagine.
RUN mkdir -p /opt && \
    cp -a caricamento/static/caricamento/img /opt/img_original && \
    cp icon_config.json /opt/icon_config.json.default

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--workers", "3", "--timeout", "300", "--bind", "0.0.0.0:8000"]
