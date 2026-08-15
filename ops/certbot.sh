#!/bin/sh
# =============================================================================
# ops/certbot.sh — Ottiene/rinnova il certificato Let's Encrypt (webroot)
#
# Uso:  CERTBOT_EMAIL=tua@mail.com sh ops/certbot.sh tuodominio.com [www.tuodominio.com]
#
# Requisiti:
#   - dominio con DNS già puntato all'IP del server;
#   - porta 80 raggiungibile e nginx in esecuzione (il location
#     /.well-known/acme-challenge/ è già configurato in nginx.conf);
#   - directory host /var/www/certbot creata e montata nel servizio nginx
#     (vedi docker-compose.yml).
#
# Il certificato finisce in /etc/letsencrypt/live/<dominio>/; il rinnovo è
# automatico ogni 60 giorni tramite lo stesso comando (basta rieseguirlo via
# cron, es. due volte al mese).
# =============================================================================
set -e

DOMAIN="${1:?Uso: sh ops/certbot.sh tuodominio.com [www.tuodominio.com]}"
EMAIL="${CERTBOT_EMAIL:?Imposta CERTBOT_EMAIL=tua@mail.com}"

# Il webroot deve esistere sull'host: è condiviso tra il container certbot
# (scrittura) e il container nginx (lettura, readonly).
mkdir -p /var/www/certbot /etc/letsencrypt

if [ "$#" -gt 1 ]; then
    ALT_DOMAIN="-d $2"
else
    ALT_DOMAIN=""
fi

docker run --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/www/certbot:/var/www/certbot \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  --email "$EMAIL" --agree-tos --no-eff-email \
  -d "$DOMAIN" $ALT_DOMAIN

echo ""
echo "Certificato pronto in /etc/letsencrypt/live/$DOMAIN/"
echo "Ora:"
echo "  1. cp nginx/nginx-https.conf.example nginx/nginx.conf   (e sostituisci example.com)"
echo "  2. scommenta i mount TLS nel servizio nginx di docker-compose.yml"
echo "  3. nel .env: SECURE_SSL_REDIRECT=True, SESSION_COOKIE_SECURE=True,"
echo "     CSRF_COOKIE_SECURE=True, SECURE_HSTS_SECONDS=31536000"
echo "  4. docker compose up -d && docker compose exec web python manage.py check --deploy"
echo ""
echo "Rinnovo (via cron, due volte al mese):"
echo "  CERTBOT_EMAIL=$EMAIL sh ops/certbot.sh $DOMAIN $2 && docker compose exec nginx nginx -s reload"
