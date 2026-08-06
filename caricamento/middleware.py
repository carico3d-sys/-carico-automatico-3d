"""
Middleware per il controllo del periodo di prova (trial).

Verifica che l'utente abbia un trial attivo o sia pagante.
Se il trial è scaduto, reindirizza alla landing page con un messaggio.
"""

import re

from django.conf import settings
from django.shortcuts import redirect
from django.urls import reverse


class TrialRequiredMiddleware:
    """Middleware che blocca l'accesso alle pagine protette se il trial è scaduto.

    Non si applica a:
    - Utenti anonimi
    - Utenti staff (admin)
    - Utenti paganti (profile.is_paying)
    - URL esenti (landing, login, logout, admin, accounts, api)
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
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
            # Logout e redirect alla landing con messaggio
            from django.contrib.auth import logout
            logout(request)

            landing_url = reverse("caricamento:homepage") + "?trial=expired"
            response = redirect(landing_url)
            return response

        return self.get_response(request)
