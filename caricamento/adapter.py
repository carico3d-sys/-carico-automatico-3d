"""
Adapter personalizzato per django-allauth.

- Popola automaticamente UserProfile.google_id dopo il login Google.
- Le credenziali Google vanno configurate nella sezione
  'Social applications' del pannello admin.
"""

import logging

from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.dispatch import receiver
from django.shortcuts import redirect
from allauth.socialaccount.signals import social_account_added

logger = logging.getLogger(__name__)


@receiver(social_account_added)
def _popola_google_id(sender, request, sociallogin, **kwargs):
    """Quando un utente collega un account Google, salva l'ID nel UserProfile
    e imposta il periodo di prova."""
    account = sociallogin.account
    if account.provider != "google":
        return

    from datetime import timedelta
    from django.utils import timezone
    from .models import ImpostazioniSistema, UserProfile

    imp = ImpostazioniSistema.get()
    profile, _ = UserProfile.objects.get_or_create(user=sociallogin.user)

    updated_fields = []
    if not profile.google_id:
        profile.google_id = account.uid  # Il 'sub' di Google
        updated_fields.append("google_id")

    if profile.trial_start is None:
        profile.trial_start = timezone.now()
        profile.trial_end = timezone.now() + timedelta(days=imp.giorni_prova)
        updated_fields.extend(["trial_start", "trial_end"])

    if updated_fields:
        profile.save(update_fields=updated_fields)
        logger.info(
            "Google login: user=%s google_id=%s trial=%dgg",
            sociallogin.user.username, account.uid, imp.giorni_prova,
        )

    # Salva i segnali anche per Google: un nuovo account Google non deve
    # ottenere un secondo trial dallo stesso browser/rete.
    from .views import _save_demo_fingerprints
    _save_demo_fingerprints(request, sociallogin.user)


class DynamicGoogleAdapter(DefaultSocialAccountAdapter):
    """Adapter personalizzato per Google OAuth2.

    - Le credenziali Google si configurano in Admin > Social applications.
    - Inoltra il parametro 'prompt' dall'URL di login a Google (es. prompt=select_account).
    """

    def pre_social_login(self, request, sociallogin):
        # Un account Google già collegato resta indipendente dal dispositivo:
        # il controllo anti-abuso vale solo quando si tenta di creare una nuova
        # identità. Le nuove identità devono però rispettare anche il comando
        # globale che disabilita le demo, inclusi gli accessi URL diretti.
        if not sociallogin.is_existing:
            from .models import ImpostazioniSistema
            from .views import _attach_demo_cookie, _check_demo_abuse

            if not ImpostazioniSistema.get().demo_attiva:
                response = redirect("/?demo=disabled")
                raise ImmediateHttpResponse(_attach_demo_cookie(request, response))

            if _check_demo_abuse(request):
                response = redirect("/?trial=used")
                raise ImmediateHttpResponse(_attach_demo_cookie(request, response))
        return super().pre_social_login(request, sociallogin)

    def get_auth_params(self, request, action):
        params = super().get_auth_params(request, action)
        prompt = request.GET.get("prompt", "")
        if prompt:
            params["prompt"] = prompt
        return params
