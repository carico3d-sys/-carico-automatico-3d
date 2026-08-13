"""
Middleware per il controllo del periodo di prova (trial).

Verifica che l'utente abbia un trial attivo o sia pagante.
Se il trial è scaduto, reindirizza alla landing page con un messaggio.
"""

import re
import secrets
import uuid

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import reverse


class RequestIDMiddleware:
    """Aggiunge un identificatore per correlare risposta e log server."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = uuid.uuid4().hex
        response = self.get_response(request)
        response["X-Request-ID"] = request.request_id

        # Prepara il token anche se l'utente entra direttamente nel flusso
        # Google senza passare prima dalla landing page.
        if (
            not request.COOKIES.get("cb_demo")
            and (request.path_info == "/" or request.path_info.startswith("/accounts/"))
        ):
            token = getattr(request, "_cb_demo_token", "") or secrets.token_urlsafe(32)
            response.set_cookie(
                "cb_demo",
                token,
                max_age=365 * 24 * 60 * 60,
                httponly=True,
                secure=request.is_secure(),
                samesite="Lax",
            )
        return response


class TrialRequiredMiddleware:
    """Middleware che blocca l'accesso alle pagine protette se il trial è scaduto.

    Non si applica a:
    - Utenti anonimi
    - Utenti staff (admin)
    - Utenti paganti (profile.is_paying)
    - URL esenti (landing, login, logout, admin, accounts)
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Un utente disattivato non deve poter riutilizzare una sessione
        # aperta: revoca subito la sessione al primo request successivo.
        if request.user.is_authenticated and not request.user.is_active:
            from django.contrib.auth import logout
            logout(request)
            if request.path_info.startswith("/api/"):
                return JsonResponse(
                    {
                        "error": {
                            "code": "account_disabled",
                            "message": "L'account è stato disattivato.",
                        },
                    },
                    status=403,
                )
            return redirect(reverse("caricamento:homepage") + "?account=disabled")

        # Salta se l'utente non è autenticato
        if not request.user.is_authenticated:
            return self.get_response(request)

        # Salta se l'utente è staff (admin)
        if request.user.is_staff:
            return self.get_response(request)

        # Salta se il path è nella lista esenti
        path = request.path_info
        for exempt in settings.TRIAL_EXEMPT_PATHS:
            if path.startswith(exempt):
                return self.get_response(request)

        # Verifica se il path è protetto
        is_protected = False
        for required in settings.TRIAL_REQUIRED_PATHS:
            if path.startswith(required):
                is_protected = True
                break

        if not is_protected:
            return self.get_response(request)

        # Controlla il profilo utente
        from .models import UserProfile

        try:
            profile = request.user.profile
        except UserProfile.DoesNotExist:
            # Nessun profilo: crealo e lascia passare
            from .models import ImpostazioniSistema
            from django.utils import timezone
            from datetime import timedelta

            imp = ImpostazioniSistema.get()
            UserProfile.objects.get_or_create(
                user=request.user,
                defaults={
                    "trial_start": timezone.now(),
                    "trial_end": timezone.now() + timedelta(days=imp.giorni_prova),
                },
            )
            return self.get_response(request)

        # Verifica trial
        if not profile.is_trial_active:
            # Revoca la sessione anche sulle API. Per le chiamate AJAX restituisce
            # JSON invece di un redirect HTML alla landing.
            from django.contrib.auth import logout
            logout(request)

            if path.startswith("/api/"):
                return JsonResponse(
                    {
                        "error": {
                            "code": "trial_expired",
                            "message": "Il periodo di prova è scaduto.",
                        },
                    },
                    status=403,
                )

            landing_url = reverse("caricamento:homepage") + "?trial=expired"
            return redirect(landing_url)

        return self.get_response(request)
