"""
Endpoint pagamenti — integrazione Lemon Squeezy (Merchant of Record).

Fornisce:
- POST /api/payments/checkout/  → crea checkout con quantity=N utenti
- POST /api/payments/webhook/   → riceve eventi da Lemon Squeezy (firma HMAC)
- GET  /api/payments/status/    → stato abbonamento per il frontend
"""

import hashlib
import hmac
import json
import logging

import requests
from django.conf import settings
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import UserProfile

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Costanti
# ---------------------------------------------------------------------------

LEMONSQUEEZY_API = "https://api.lemonsqueezy.com"


def _ls_headers():
    """Header comuni per tutte le chiamate API Lemon Squeezy (JSON:API)."""
    api_key = getattr(settings, "LEMONSQUEEZY_API_KEY", "")
    return {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
    }


def _verify_ls_webhook(payload_bytes, signature_header):
    """Verifica la firma HMAC-SHA256 del webhook Lemon Squeezy.

    Restituisce True se la firma è valida, False altrimenti.
    """
    secret = getattr(settings, "LEMONSQUEEZY_WEBHOOK_SECRET", "")
    if not secret:
        logger.warning("Webhook ricevuto ma LEMONSQUEEZY_WEBHOOK_SECRET non configurato.")
        return False
    if not signature_header:
        return False

    computed = hmac.new(
        secret.encode("utf-8"),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(computed, signature_header)


# ---------------------------------------------------------------------------
# POST /api/payments/checkout/ — Crea un checkout Lemon Squeezy
# ---------------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def checkout(request):
    """Crea un checkout Lemon Squeezy con la quantity scelta dall'utente.

    Corpo atteso (JSON):
        {
            "variant_id": "12345",       // ID variante Lemon Squeezy
            "quantity": 1,               // numero utenti (seat)
            "redirect_url": "https://..."  // (opzionale) URL post-pagamento
        }

    Risposta:
        {
            "url": "https://[store].lemonsqueezy.com/checkout/buy/..."
        }
    """
    variant_id = request.data.get("variant_id")
    quantity = int(request.data.get("quantity", 1))
    redirect_url = request.data.get("redirect_url", "")

    if not variant_id:
        raise ValidationError({"variant_id": "Campo obbligatorio."})
    if quantity < 1:
        raise ValidationError({"quantity": "Deve essere almeno 1."})

    store_id = getattr(settings, "LEMONSQUEEZY_STORE_ID", "")
    if not store_id:
        logger.error("LEMONSQUEEZY_STORE_ID non configurato")
        return Response(
            {"error": "Configurazione pagamenti incompleta (store)."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Costruisci product_options solo se redirect_url è fornito
    checkout_attributes = {
        "checkout_data": {
            "variant_quantities": [
                {
                    "variant_id": int(variant_id),
                    "quantity": quantity,
                }
            ],
            "custom": {
                "user_id": str(request.user.id),
                "user_email": request.user.email or "",
            },
            "email": request.user.email or "",
        },
    }

    if redirect_url:
        checkout_attributes["product_options"] = {
            "redirect_url": redirect_url,
        }

    body = {
        "data": {
            "type": "checkouts",
            "attributes": checkout_attributes,
            "relationships": {
                "store": {
                    "data": {
                        "type": "stores",
                        "id": str(store_id),
                    }
                },
                "variant": {
                    "data": {
                        "type": "variants",
                        "id": str(variant_id),
                    }
                },
            },
        }
    }

    try:
        resp = requests.post(
            f"{LEMONSQUEEZY_API}/v1/checkouts",
            headers=_ls_headers(),
            json=body,
            timeout=15,
        )
    except requests.RequestException as e:
        logger.error("Checkout LS request failed: %s", e)
        return Response(
            {"error": "Servizio pagamenti temporaneamente non disponibile."},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    if resp.status_code == 201:
        data = resp.json()
        checkout_url = data.get("data", {}).get("attributes", {}).get("url", "")
        logger.info("Checkout LS creato: user=%s url=%s", request.user, checkout_url[:80])
        return Response({"url": checkout_url})

    logger.error(
        "Checkout LS risposta non 201: status=%s body=%s",
        resp.status_code,
        resp.text[:500],
    )
    return Response(
        {"error": "Impossibile creare il checkout. Riprova."},
        status=status.HTTP_502_BAD_GATEWAY,
    )


# ---------------------------------------------------------------------------
# POST /api/payments/webhook/ — Riceve eventi da Lemon Squeezy
# ---------------------------------------------------------------------------

@api_view(["POST"])
def webhook(request):
    """Riceve e processa i webhook di Lemon Squeezy.

    Eventi gestiti:
    - order_created       → (nessuna azione immediata)
    - subscription_created → salva subscription_id, is_paying=True
    - subscription_updated → aggiorna quantity, plan
    - subscription_cancelled → is_paying=False (alla scadenza)
    - subscription_expired   → is_paying=False
    """
    payload_bytes = request.body
    X = request.META.get("HTTP_X_SIGNATURE", "")

    if not _verify_ls_webhook(payload_bytes, X):
        return Response({"error": "Firma non valida."}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        body = json.loads(payload_bytes)
    except json.JSONDecodeError:
        return Response({"error": "Payload JSON non valido."}, status=status.HTTP_400_BAD_REQUEST)

    event_name = body.get("meta", {}).get("event_name", "")
    data = body.get("data", {})

    logger.info("Webhook LS ricevuto: event=%s", event_name)

    if event_name in (
        "subscription_created",
        "subscription_updated",
        "subscription_cancelled",
        "subscription_expired",
    ):
        _handle_subscription_event(event_name, data)

    return Response({"received": True})


def _handle_subscription_event(event_name, data):
    """Aggiorna UserProfile in base all'evento di subscription."""

    attributes = data.get("attributes", {})
    customer_id = attributes.get("customer_id")
    subscription_id = int(data.get("id", 0))
    status_value = attributes.get("status", "")

    # Il campo variant_id è nella relazione variant, non negli attributes diretti.
    # Usa il primo subscription-item per risalire a variant e quantity.
    # Durante subscription_created, il campo ``first_subscription_item`` è
    # incluso nella risposta; per gli aggiornamenti, occorre un GET aggiuntivo.
    first_item = data.get("attributes", {}).get("first_subscription_item", {})
    # Alcune versioni dell'API includono ``first_subscription_item`` direttamente.
    if not first_item:
        # Prova anche nel payload delle relationships.
        rels = data.get("relationships", {})
        subs_items = rels.get("subscription_items", {})
        if subs_items:
            first_item = subs_items.get("data", [{}])[0] if subs_items.get("data") else {}

    variant_id = first_item.get("variant_id") if first_item else None
    quantity = int(first_item.get("quantity", 1)) if first_item else 1
    item_id = int(first_item.get("id", 0)) if first_item else None

    # Trova il profilo associato al customer_id (se presente)
    profile = None
    if customer_id:
        profile = UserProfile.objects.filter(ls_customer_id=customer_id).first()

    # Fallback: cerca per subscription_id (utile se customer_id non ancora salvato)
    if not profile and subscription_id:
        profile = UserProfile.objects.filter(ls_subscription_id=subscription_id).first()

    # Fallback: cerca per email (Lemon Squeezy include user_email nel webhook)
    if not profile:
        user_email = attributes.get("user_email", "")
        if user_email:
            from django.contrib.auth.models import User
            try:
                user = User.objects.get(email=user_email)
                profile = UserProfile.objects.filter(user=user).first()
            except User.DoesNotExist:
                pass

    if not profile:
        logger.warning(
            "Webhook subscription senza profilo: customer_id=%s subscription_id=%s",
            customer_id,
            subscription_id,
        )
        return

    # Salva il customer_id se non ancora presente (collega profilo a Lemon Squeezy)
    if customer_id and not profile.ls_customer_id:
        profile.ls_customer_id = customer_id

    if event_name == "subscription_created":
        profile.ls_subscription_id = subscription_id
        profile.ls_subscription_item_id = item_id
        profile.ls_variant_id = variant_id
        profile.ls_quantity = max(1, quantity)
        profile.is_paying = True
        profile.ls_plan = _plan_name_from_variant(variant_id)
        profile.save()
        logger.info("Abbonamento creato: user=%s plan=%s quantity=%s", profile.user.username, profile.ls_plan, profile.ls_quantity)

    elif event_name == "subscription_updated":
        profile.ls_quantity = max(1, quantity)
        profile.ls_variant_id = variant_id or profile.ls_variant_id
        profile.ls_plan = _plan_name_from_variant(profile.ls_variant_id)
        profile.save(update_fields=["ls_quantity", "ls_variant_id", "ls_plan", "updated_at"])
        logger.info("Abbonamento aggiornato: user=%s quantity=%s", profile.user.username, profile.ls_quantity)

    elif event_name == "subscription_cancelled":
        # L'abbonamento resta attivo fino alla fine del periodo pagato.
        # non cancelliamo is_paying qui; lo farà subscription_expired.
        logger.info("Abbonamento cancellato (scadrà a fine periodo): user=%s", profile.user.username)

    elif event_name == "subscription_expired":
        profile.is_paying = False
        profile.ls_subscription_id = None
        profile.ls_subscription_item_id = None
        profile.save(update_fields=["is_paying", "ls_subscription_id", "ls_subscription_item_id", "updated_at"])
        logger.info("Abbonamento scaduto: user=%s", profile.user.username)


def _plan_name_from_variant(variant_id):
    """Mappa l'ID variante a un nome leggibile (da configurare)."""
    if not variant_id:
        return ""
    mensile_id = getattr(settings, "LEMONSQUEEZY_VARIANT_MENSILE_ID", "")
    annuale_id = getattr(settings, "LEMONSQUEEZY_VARIANT_ANNUALE_ID", "")
    if str(variant_id) == str(mensile_id):
        return "Mensile"
    if str(variant_id) == str(annuale_id):
        return "Annuale"
    return "Sconosciuto"


# ---------------------------------------------------------------------------
# GET /api/payments/status/ — Stato abbonamento per il frontend
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def status_(request):
    """Restituisce lo stato dell'abbonamento per il frontend.

    Risposta:
        {
            "is_paying": true/false,
            "trial_active": true/false,
            "trial_days_left": 14 | null,
            "trial_end": "2026-09-04T...",
            "plan": "Mensile" | "Annuale" | "",
            "quantity": 1,
            "ls_customer_id": 12345 | null,
            "ls_subscription_id": 67890 | null
        }
    """
    profile, _ = UserProfile.objects.get_or_create(user=request.user)

    return Response({
        "is_paying": profile.is_paying,
        "trial_active": profile.is_trial_active,
        "trial_days_left": profile.trial_days_left,
        "trial_end": profile.trial_end,
        "plan": profile.ls_plan or "",
        "quantity": profile.ls_quantity if profile.is_paying else 0,
        "ls_customer_id": profile.ls_customer_id,
        "ls_subscription_id": profile.ls_subscription_id,
    })