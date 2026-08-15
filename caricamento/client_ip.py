"""Risoluzione dell'IP reale del client dietro il reverse proxy nginx.

Condivisa tra l'anti-abuso demo (``caricamento.views``) e django-axes
(``AXES_CLIENT_IP_CALLABLE``) affinché entrambi i controlli vedano lo stesso
indirizzo.

Perché ``X-Real-IP`` e non ``X-Forwarded-For``:

- nginx sovrascrive ``X-Real-IP`` con ``$remote_addr``, cioè il peer TCP della
  connessione: un valore che il client NON può falsificare.
- ``X-Forwarded-For`` viene invece costruito da nginx con
  ``$proxy_add_x_forwarded_for``, che *accoda* l'IP reale all'eventuale header
  già inviato dal client. La parte sinistra della lista resta quindi
  controllabile dall'attaccante e non va usata come fonte primaria.

Fiducia condizionata:

``X-Real-IP`` viene onorato SOLO quando ``REMOTE_ADDR`` è un proxy fidato.
I proxy fidati sono gli indirizzi elencati in ``settings.TRUSTED_PROXY_IPS``
(IP o CIDR) oppure, in mancanza, qualunque peer privato/loopback (es. nginx
sul bridge Docker). Un client che arriva direttamente da Internet ha un
``REMOTE_ADDR`` pubblico e quindi non può iniettare un ``X-Real-IP`` arbitrario
per aggirare il lockout di django-axes o l'anti-abuso demo.
"""

import ipaddress

from django.conf import settings

# Reti non pubblicamente routabili accettate come proxy nel fallback
# (nginx sul bridge Docker). NOTA: escludiamo volutamente le reti di
# documentazione (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24) che
# ``ipaddress.is_private`` invece considera: non vanno fidate.
_PRIVATE_NETWORKS = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),       # IPv4 loopback
    ipaddress.ip_network("169.254.0.0/16"),    # IPv4 link-local
    ipaddress.ip_network("::1/128"),           # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),          # IPv6 unique-local
    ipaddress.ip_network("fe80::/10"),         # IPv6 link-local
)


def _is_trusted_proxy(remote_addr):
    """True se ``REMOTE_ADDR`` è un proxy da cui accettare ``X-Real-IP``."""
    if not remote_addr:
        return False
    try:
        ip = ipaddress.ip_address(remote_addr)
    except ValueError:
        return False

    # Proxy espliciti via TRUSTED_PROXY_IPS (IP o CIDR, separati da virgola).
    for entry in settings.TRUSTED_PROXY_IPS:
        try:
            network = ipaddress.ip_network(entry, strict=False)
        except ValueError:
            continue
        if ip in network:
            return True

    # Fallback: accetta solo peer su rete privata/loopback/link-local
    # (nginx sul bridge Docker).
    return any(ip in network for network in _PRIVATE_NETWORKS)


def get_client_ip(request):
    """Restituisce l'IP reale del client come stringa ('' se assente)."""
    real_ip = request.META.get("HTTP_X_REAL_IP", "").strip()
    remote_addr = request.META.get("REMOTE_ADDR", "").strip()
    if real_ip and _is_trusted_proxy(remote_addr):
        return real_ip
    return remote_addr
