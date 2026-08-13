"""Gestione coerente degli errori delle API REST.

Mantiene i dettagli di validazione utili al client, ma non espone eccezioni
interne o traceback al browser. Il request ID consente di correlare l'errore
mostrato all'utente con i log server.
"""

import logging

from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)

_STATUS_CODES = {
    400: "validation_error",
    401: "authentication_required",
    403: "permission_denied",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    429: "rate_limited",
}
_STATUS_MESSAGES = {
    400: "I dati inviati non sono validi.",
    401: "La sessione non è valida o è scaduta.",
    403: "Non hai i permessi per eseguire questa operazione.",
    404: "La risorsa richiesta non è stata trovata.",
    405: "Il metodo richiesto non è supportato.",
    409: "L'operazione non è compatibile con lo stato attuale della risorsa.",
    429: "Troppe richieste. Riprova tra poco.",
}


def _request_id(context):
    request = context.get("request")
    return getattr(request, "request_id", "-") if request else "-"


def _safe_client_message(data, status_code):
    """Estrae solo messaggi espliciti e sicuri per errori client (4xx)."""
    if status_code >= 500:
        return "Si è verificato un errore interno. Riprova più tardi."
    if isinstance(data, dict):
        detail = data.get("detail")
        if isinstance(detail, str) and detail.strip():
            return detail
        legacy = data.get("errore")
        if isinstance(legacy, str) and legacy.strip():
            return legacy
    return _STATUS_MESSAGES.get(status_code, "La richiesta non è stata completata.")


def custom_exception_handler(exc, context):
    """Normalizza gli errori DRF conservando la compatibilità dei campi legacy."""
    response = exception_handler(exc, context)
    request_id = _request_id(context)

    if response is None:
        logger.error(
            "Unhandled API exception request_id=%s",
            request_id,
            exc_info=(type(exc), exc, exc.__traceback__),
        )
        response = Response(
            {
                "success": False,
                "error": {
                    "code": "server_error",
                    "message": _STATUS_MESSAGES.get(500, "Si è verificato un errore interno. Riprova più tardi."),
                    "request_id": request_id,
                },
            },
            status=500,
        )
        response["X-Request-ID"] = request_id
        return response

    status_code = response.status_code
    original = response.data
    if isinstance(original, dict):
        payload = dict(original)
    else:
        payload = {"detail": original}

    code = _STATUS_CODES.get(status_code, "api_error" if status_code < 500 else "server_error")
    payload["success"] = False
    payload["error"] = {
        "code": code,
        "message": _safe_client_message(original, status_code),
        "request_id": request_id,
    }
    if status_code < 500 and isinstance(original, dict) and len(original) > 1:
        payload["error"]["fields"] = original

    response.data = payload
    response["X-Request-ID"] = request_id
    if status_code >= 500:
        logger.error("API error status=%s request_id=%s", status_code, request_id)
    return response
