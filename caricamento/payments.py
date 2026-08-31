"""Endpoint pagamenti per Fungies.io (Merchant of Record)."""

import hashlib
import hmac
import json
import logging

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import FungiesWebhookEvent, UserProfile

logger = logging.getLogger(__name__)
SUPPORTED_EVENTS = {
    "payment_success",
    "payment_refunded",
    "payment_failed",
    "subscription_created",
    "subscription_interval",
    "subscription_updated",
    "subscription_cancelled",
}


def _verify_fungies_webhook(payload_bytes, signature_header):
    """Verifica x-fngs-signature: sha256_<digest> con HMAC-SHA256."""
    secret = getattr(settings, "FUNGIES_WEBHOOK_SECRET", "")
    if not secret or not signature_header:
        logger.warning("Webhook Fungies ricevuto senza secret o firma.")
        return False
    provided = signature_header.strip()
    if provided.startswith("sha256_"):
        provided = provided[len("sha256_"):]
    computed = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, provided)


def _offer_setting_for_plan(plan):
    return getattr(settings, {
        "mensile": "FUNGIES_OFFER_MENSILE_ID",
        "annuale": "FUNGIES_OFFER_ANNUALE_ID",
    }.get(str(plan or "").lower(), ""), "")


def _plan_name_from_offer(offer_id):
    if not offer_id:
        return ""
    if str(offer_id) == str(getattr(settings, "FUNGIES_OFFER_MENSILE_ID", "")):
        return "Mensile"
    if str(offer_id) == str(getattr(settings, "FUNGIES_OFFER_ANNUALE_ID", "")):
        return "Annuale"
    return "Sconosciuto"


def _checkout_element_url(element_id):
    store_url = getattr(settings, "FUNGIES_STORE_URL", "").strip().rstrip("/")
    return f"{store_url}/checkout-element/{element_id}" if store_url and element_id else ""


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def checkout(request):
    """Restituisce l'URL del Checkout Element Fungies per piano e seat."""
    plan = str(request.data.get("plan", "")).lower()
    if plan not in ("mensile", "annuale"):
        raise ValidationError({"plan": "Deve essere 'mensile' oppure 'annuale'."})
    try:
        quantity = int(request.data.get("quantity", 1))
    except (TypeError, ValueError):
        raise ValidationError({"quantity": "Deve essere un numero intero."})
    if quantity < 1:
        raise ValidationError({"quantity": "Deve essere almeno 1."})

    offer_id = _offer_setting_for_plan(plan)
    if not offer_id or not getattr(settings, "FUNGIES_STORE_URL", "").strip():
        logger.error("Configurazione Fungies incompleta: offer=%s store=%s", bool(offer_id), bool(getattr(settings, "FUNGIES_STORE_URL", "")))
        return Response({"error": "Configurazione pagamenti incompleta. Contatta il supporto."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    element_setting = "FUNGIES_CHECKOUT_ELEMENT_MENSILE_ID" if plan == "mensile" else "FUNGIES_CHECKOUT_ELEMENT_ANNUALE_ID"
    element_id = getattr(settings, element_setting, "")
    if not element_id:
        logger.error("Checkout Element Fungies non configurato: %s", element_setting)
        return Response({"error": "Configurazione checkout incompleta. Contatta il supporto."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    checkout_url = _checkout_element_url(element_id)
    if not checkout_url:
        return Response({"error": "Impossibile creare il checkout. Riprova."}, status=status.HTTP_502_BAD_GATEWAY)

    return Response({
        "url": checkout_url,
        "plan": plan,
        "quantity": quantity,
        "offer_id": str(offer_id),
        "custom_fields": {"carico3d_user_id": str(request.user.id)},
    })


def _profile_for_event(data):
    """Collega il pagamento tramite custom field, con fallback email."""
    user_data = data.get("user") or data.get("customer") or {}
    email = (user_data.get("email") or "").strip()
    custom_user_id = ""
    for item in data.get("items") or []:
        fields = item.get("customFields") or {}
        custom_user_id = fields.get("carico3d_user_id") or fields.get("user_id") or ""
        if custom_user_id:
            break

    profile = None
    if str(custom_user_id).isdigit():
        profile = UserProfile.objects.select_related("user").filter(user_id=int(custom_user_id)).first()
        if profile and email and profile.user.email.lower() != email.lower():
            logger.warning("Evento Fungies con user_id/email discordanti: user_id=%s", custom_user_id)
            profile = None
    if not profile and email:
        profile = UserProfile.objects.select_related("user").filter(user__email__iexact=email).first()
    return profile, user_data


def _event_values(data):
    items = data.get("items") or []
    item = items[0] if items else {}
    offer = item.get("offer") or {}
    subscription = data.get("subscription") or {}
    last_payment = data.get("lastPayment") or {}
    payment = data.get("payment") or {}
    return {
        "customer_id": str((data.get("user") or data.get("customer") or {}).get("id") or ""),
        "subscription_id": str(subscription.get("id") or ""),
        "offer_id": str(offer.get("id") or ""),
        "quantity": max(1, int(item.get("quantity") or 1)),
        "plan": _plan_name_from_offer(offer.get("id")),
        "subscription_status": str(subscription.get("status") or "").lower(),
        "cancel_at_interval_end": bool(subscription.get("cancelAtIntervalEnd")),
        "last_payment_status": str(last_payment.get("status") or payment.get("status") or "").upper(),
    }


def _handle_fungies_event(event_type, data):
    profile, user_data = _profile_for_event(data)
    if not profile:
        logger.warning("Evento Fungies senza profilo: email=%s", user_data.get("email", ""))
        return

    values = _event_values(data)
    if values["customer_id"]:
        profile.fungies_customer_id = values["customer_id"]
    if values["subscription_id"]:
        profile.fungies_subscription_id = values["subscription_id"]
    if values["offer_id"]:
        profile.fungies_offer_id = values["offer_id"]
    profile.fungies_quantity = values["quantity"]
    if values["plan"] and values["plan"] != "Sconosciuto":
        profile.fungies_plan = values["plan"]

    if event_type == "payment_success":
        profile.is_paying = True
    elif event_type == "payment_refunded":
        # Un rimborso parziale non deve revocare automaticamente un abbonamento
        # ancora attivo; la revoca viene fatta solo da uno stato subscription terminale.
        if values["subscription_status"] in ("canceled", "unpaid", "incomplete_expired"):
            profile.is_paying = False
    elif event_type == "payment_failed":
        # past_due può essere ritentato da Fungies: non revocare subito l'accesso.
        if values["subscription_status"] in ("unpaid", "incomplete_expired", "canceled"):
            profile.is_paying = False
    elif event_type == "subscription_created":
        # Può arrivare prima del payment_success, quando lastPayment è PENDING.
        if values["last_payment_status"] == "PAID" or values["subscription_status"] in ("active", "trialing"):
            profile.is_paying = True
    elif event_type == "subscription_interval":
        if values["subscription_status"] in ("active", "trialing"):
            profile.is_paying = True
    elif event_type == "subscription_cancelled":
        # La cancellazione a fine intervallo mantiene l'accesso fino alla scadenza.
        if not values["cancel_at_interval_end"]:
            profile.is_paying = False
    elif event_type == "subscription_updated":
        if values["subscription_status"] in ("active", "trialing"):
            profile.is_paying = True
        elif values["subscription_status"] in ("unpaid", "incomplete_expired", "canceled"):
            profile.is_paying = False

    profile.save()
    logger.info("Evento Fungies processato: event=%s user=%s paying=%s", event_type, profile.user.username, profile.is_paying)


@api_view(["POST"])
def webhook(request):
    """Riceve eventi Fungies firmati e li deduplica con idempotencyKey."""
    payload_bytes = request.body
    if not _verify_fungies_webhook(payload_bytes, request.META.get("HTTP_X_FNGS_SIGNATURE", "")):
        return Response({"error": "Firma non valida."}, status=status.HTTP_401_UNAUTHORIZED)
    try:
        body = json.loads(payload_bytes)
    except json.JSONDecodeError:
        return Response({"error": "Payload JSON non valido."}, status=status.HTTP_400_BAD_REQUEST)

    event_id = str(body.get("idempotencyKey") or body.get("id") or hashlib.sha256(payload_bytes).hexdigest())
    event_type = str(body.get("type") or "")
    try:
        with transaction.atomic():
            _, created = FungiesWebhookEvent.objects.get_or_create(event_id=event_id)
            if not created:
                return Response({"received": True, "duplicate": True})
            if event_type in SUPPORTED_EVENTS:
                _handle_fungies_event(event_type, body.get("data") or {})
            else:
                logger.info("Evento Fungies ignorato: type=%s", event_type)
    except Exception:
        logger.exception("Errore durante il processing del webhook Fungies: event=%s", event_id)
        return Response({"error": "Errore temporaneo nel webhook."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    return Response({"received": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def status_(request):
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    return Response({
        "is_paying": profile.is_paying,
        "trial_active": profile.is_trial_active,
        "trial_days_left": profile.trial_days_left,
        "trial_end": profile.trial_end,
        "plan": profile.fungies_plan or "",
        "quantity": profile.fungies_quantity if profile.is_paying else 0,
        "fungies_customer_id": profile.fungies_customer_id,
        "fungies_subscription_id": profile.fungies_subscription_id,
    })
