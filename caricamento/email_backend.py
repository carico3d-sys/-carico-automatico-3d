"""Custom Django email backend using Resend REST API.

Usage in settings.py:
    EMAIL_BACKEND = 'caricamento.email_backend.ResendEmailBackend'

Requires env vars:
    RESEND_API_KEY  — chiave API Resend (re_...)
    RESEND_FROM     — indirizzo mittente (es. noreply@carico3d.com)
                      finche' il dominio non e' verificato usa: onboarding@resend.dev
"""

import json
import os
import urllib.request
import urllib.error
import logging

from django.core.mail.backends.base import BaseEmailBackend
from django.core.mail.message import EmailMessage

logger = logging.getLogger("caricamento.resend")

RESEND_API_URL = "https://api.resend.com/emails"


class ResendEmailBackend(BaseEmailBackend):
    """Invia email tramite Resend REST API (urllib, zero dipendenze extra)."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.api_key = os.environ.get("RESEND_API_KEY", "")
        self.from_email = os.environ.get(
            "RESEND_FROM",
            "Carico 3D <noreply@carico3d.com>",
        )
        if not self.api_key:
            logger.warning(
                "RESEND_API_KEY non configurata: le email non saranno inviate."
            )

    def send_messages(self, messages):
        """Invia una lista di EmailMessage objects."""
        sent = 0
        for msg in messages:
            if self._send_one(msg):
                sent += 1
        return sent

    def _send_one(self, msg: EmailMessage) -> bool:
        """Invia una singola email via Resend REST API."""
        if not self.api_key:
            logger.debug("Saltata email (RESEND_API_KEY mancante): %s", msg.subject)
            return False

        # Costruisci il payload Resend
        from_email = msg.from_email or self.from_email

        # Resend accetta 'to' come lista di stringhe
        to_list = msg.to if isinstance(msg.to, list) else [msg.to]
        cc_list = msg.cc if msg.cc else []
        bcc_list = msg.bcc if msg.bcc else []

        payload = {
            "from": _strip_name(from_email),
            "to": to_list,
            "subject": msg.subject or "",
        }

        if cc_list:
            payload["cc"] = cc_list
        if bcc_list:
            payload["bcc"] = bcc_list

        # Preferisci HTML a plain text.
        # Django memorizza le alternative (HTML) in msg.alternatives;
        # msg.body contiene il plain text come fallback.
        html_body = None
        if msg.content_subtype == "html":
            html_body = msg.body
        elif hasattr(msg, 'alternatives') and msg.alternatives:
            for content, subtype in msg.alternatives:
                if subtype == 'text/html':
                    html_body = content
                    break
        if html_body:
            payload["html"] = html_body
        elif msg.body:
            payload["text"] = msg.body

        # Allegati: Resend supporta附件 via multipart, ma per semplicita'
        # se ci sono allegati, convertili in base64 e aggiungili.
        if msg.attachments:
            attachments = []
            import base64
            for att in msg.attachments:
                if isinstance(att, tuple):
                    filename, content, mimetype = att
                    if isinstance(content, str):
                        content = content.encode("utf-8")
                elif hasattr(att, "read"):
                    filename = getattr(att, "name", "attachment")
                    content = att.read()
                else:
                    continue
                attachments.append({
                    "filename": filename,
                    "content": base64.b64encode(content).decode("ascii"),
                })
            if attachments:
                payload["attachments"] = attachments

        # Invia via Resend REST API
        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                RESEND_API_URL,
                data=data,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "Carico3D-Backend/1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read().decode("utf-8"))
                logger.info(
                    "Email inviata via Resend: id=%s to=%s subject=%s",
                    body.get("id", "?"),
                    to_list,
                    msg.subject,
                )
                return True

        except urllib.error.HTTPError as e:
            error_body = ""
            try:
                error_body = e.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            logger.error(
                "Resend API errore %s: %s | payload: %s",
                e.code,
                error_body,
                _safe_log_payload(payload),
            )
            if not self.fail_silently:
                raise
            return False

        except Exception as e:
            logger.error("Resend errore imprevisto: %s", e)
            if not self.fail_silently:
                raise
            return False


def _strip_name(from_email: str) -> str:
    """Rimuove la parte di nome da 'Nome <email>' e restituisce solo l'indirizzo."""
    if "<" in from_email and ">" in from_email:
        return from_email.split("<")[1].split(">")[0].strip()
    return from_email.strip()


def _safe_log_payload(payload: dict) -> dict:
    """Restituisce il payload senza esporre chiavi API o dati sensibili."""
    safe = {}
    for k, v in payload.items():
        if k in ("from", "to", "cc", "bcc", "subject", "text", "html"):
            if k in ("text", "html") and isinstance(v, str):
                safe[k] = v[:120] + ("..." if len(v) > 120 else "")
            else:
                safe[k] = v
    return safe
