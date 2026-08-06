"""
Management command: test_algoritmo_3d

Esegue il nuovo algoritmo 3D (skyline+stacking+backtracking) su un
PianoDiCarico esistente, ignorando tutti gli altri algoritmi del sistema.

Utilizzo:
    python manage.py test_algoritmo_3d <piano_id> [--iterazioni N]
"""

from django.core.management.base import BaseCommand, CommandError

from caricamento.engine.tre_d import esegui_ottimizzazione_3d


class Command(BaseCommand):
    help = "Testa il nuovo algoritmo 3D su un PianoDiCarico esistente."

    def add_arguments(self, parser):
        parser.add_argument(
            "piano_id",
            type=int,
            help="PK del PianoDiCarico da ottimizzare.",
        )
        parser.add_argument(
            "--iterazioni",
            type=int,
            default=10,
            help="Numero di iterazioni di backtracking (default: 10).",
        )

    def handle(self, *args, **options):
        piano_id = options["piano_id"]
        iterazioni = options["iterazioni"]

        self.stdout.write(f"\n*** Algoritmo 3D Semplificato -- Test su piano #{piano_id} ***")
        self.stdout.write(f"   Iterazioni backtracking: {iterazioni}")
        self.stdout.write("-" * 50)

        try:
            risultato = esegui_ottimizzazione_3d(
                piano_id=piano_id,
                iterazioni=iterazioni,
            )
        except Exception as e:
            raise CommandError(f"Errore durante l'esecuzione: {e}")

        if not risultato["successo"]:
            self.stderr.write(f"\nERRORE: {risultato['errore']}")
            return

        self.stdout.write("\nOK -- Ottimizzazione completata con successo!")
        self.stdout.write(f"   Piano:     {risultato['piano_nome']} (ID {risultato['piano_id']})")
        self.stdout.write(f"   Oggetti:   {risultato['oggetti_caricati']}")
        self.stdout.write(f"   Lunghezza: {risultato['lunghezza_occupata_cm']} cm / {risultato['lunghezza_contenitore_cm']} cm")
        self.stdout.write(f"   Saturazione: {risultato['saturazione_percentuale']}%")
        self.stdout.write(f"   Peso:      {risultato['peso_totale_kg']} kg")
        self.stdout.write(f"   Vincoli sopra: {risultato['vincoli_sopra_applicati']}")
        self.stdout.write(f"   Algoritmo: {risultato['algoritmo']}")

        if risultato["saturazione_percentuale"] >= 100:
            self.stdout.write(self.style.WARNING("\nAttenzione: Carico piu' lungo del contenitore -- riepilogo parziale."))
        else:
            self.stdout.write(self.style.SUCCESS("\nCarico ottimizzato e salvato nel DB!"))

        self.stdout.write("\nVai al workspace per vedere il risultato nella vista 3D.\n")
