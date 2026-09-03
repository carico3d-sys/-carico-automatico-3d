"""Popola il database con il catalogo iniziale reale dell'amministratore.

Il catalogo è mantenuto in ``caricamento/starter_catalog.json``. Per
rigenerarlo dai dati presenti nell'account admin usare prima:

    python manage.py export_starter_catalog \
        --username admin \
        --plan-name "Carico 03/09/2026 16:06"

Usage:
    python manage.py seed_data
    python manage.py seed_data --username admin
    python manage.py seed_data --username admin --force
"""

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from caricamento.models import (
    Contenitore,
    Oggetto,
    OggettoPosizionato,
    PianoDiCarico,
    SezioneCarico,
    VincoloTraOggetti,
)
from caricamento.starter_data import crea_dati_iniziali


class Command(BaseCommand):
    help = "Popola un utente con il catalogo reale e il piano ottimizzato iniziale."

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            default="admin",
            help="Utente proprietario dei dati seed (deve già esistere).",
        )
        parser.add_argument(
            "--ottimizza",
            action="store_true",
            help="Compatibilità con il vecchio comando: il catalogo contiene già il piano ottimizzato.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Consente il seed distruttivo in ambiente non-debug.",
        )

    def handle(self, *args, **options):
        from django.conf import settings

        if not settings.DEBUG and not options["force"]:
            raise CommandError(
                "seed_data è distruttivo: in produzione usare --force esplicitamente."
            )

        try:
            owner = User.objects.get(username=options["username"])
        except User.DoesNotExist as exc:
            raise CommandError(
                f"Utente seed non trovato: {options['username']}. "
                "Crea prima il superuser o passa --username."
            ) from exc

        with transaction.atomic():
            self._cancella_dati_esistenti(owner)
            piani = crea_dati_iniziali(owner)

        self.stdout.write(self.style.SUCCESS(
            "Seed completato dal catalogo reale: "
            f"{Oggetto.objects.filter(owner=owner).count()} oggetti, "
            f"{VincoloTraOggetti.objects.filter(oggetto_a__owner=owner).count()} vincoli tra oggetti, "
            f"{Contenitore.objects.filter(owner=owner).count()} mezzi, "
            f"{SezioneCarico.objects.filter(contenitore__owner=owner).count()} sezioni, "
            f"{len(piani)} piano/i di carico."
        ))

        if options["ottimizza"]:
            self.stdout.write(
                "Il piano del catalogo è già ottimizzato: nessuna nuova ottimizzazione eseguita."
            )

    def _cancella_dati_esistenti(self, owner):
        """Cancella solo il workspace dell'utente indicato."""
        # Le posizioni vengono eliminate prima del piano per rendere esplicita
        # la sequenza; il piano elimina poi le righe di carico in cascata.
        OggettoPosizionato.objects.filter(piano_di_carico__owner=owner).delete()
        PianoDiCarico.objects.filter(owner=owner).delete()
        # I vincoli tra oggetti vengono eliminati esplicitamente prima degli
        # oggetti, senza toccare dati eventualmente presenti per altri utenti.
        VincoloTraOggetti.objects.filter(oggetto_a__owner=owner).delete()
        Oggetto.objects.filter(owner=owner).delete()
        # Le sezioni seguono il contenitore in cascata.
        Contenitore.objects.filter(owner=owner).delete()
        self.stdout.write("Dati esistenti dell'utente cancellati.")
