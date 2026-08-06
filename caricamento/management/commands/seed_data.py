"""
Management command per popolare il database con dati di esempio
per testare il sistema di ottimizzazione carico 3D.

Usage:
    python manage.py seed_data
    python manage.py seed_data --ottimizza   # esegue anche l'ottimizzazione
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from caricamento.models import (
    Contenitore,
    Oggetto,
    PianoDiCarico,
    SezioneCarico,
    StatoPiano,
    TipoMezzo,
    VincoloOggetto,
)


class Command(BaseCommand):
    help = "Popola il database con dati di esempio per il 3D Bin Packing"

    def add_arguments(self, parser):
        parser.add_argument(
            "--ottimizza",
            action="store_true",
            help="Esegue anche l'ottimizzazione 3D dopo il seed.",
        )

    def handle(self, *args, **options):
        self._cancella_dati_esistenti()
        contenitori = self._crea_contenitori()
        self._crea_sezioni(contenitori)
        oggetti = self._crea_oggetti()
        piani = self._crea_piani(contenitori, oggetti)

        self.stdout.write(self.style.SUCCESS(
            f"\n[OK] Seed completato: {len(contenitori)} contenitori, "
            f"{len(oggetti)} oggetti, {len(piani)} piani di carico.\n"
        ))

        if options["ottimizza"]:
            self._esegui_ottimizzazione(piani)

    def _cancella_dati_esistenti(self):
        from caricamento.models import OggettoPosizionato
        OggettoPosizionato.objects.all().delete()
        PianoDiCarico.objects.all().delete()
        Oggetto.objects.all().delete()
        Contenitore.objects.all().delete()
        self.stdout.write("Dati esistenti cancellati.")

    def _crea_contenitori(self):
        contenitori = [
            Contenitore.objects.create(
                nome="Container ISO 20' Standard",
                tipo_mezzo=TipoMezzo.CONTAINER_20,
                lunghezza_mm=5860,
                larghezza_mm=2350,
                altezza_mm=2390,
                carico_massimo_kg=Decimal("28200"),
                tara_kg=Decimal("2200"),
                note="Container standard 20 piedi. Porta posteriore.",
            ),
            Contenitore.objects.create(
                nome="Container ISO 40' High Cube",
                tipo_mezzo=TipoMezzo.CONTAINER_40_HC,
                lunghezza_mm=12030,
                larghezza_mm=2350,
                altezza_mm=2690,
                carico_massimo_kg=Decimal("30500"),
                tara_kg=Decimal("3900"),
                note="Container 40 piedi High Cube. Maggiore altezza interna.",
            ),
            Contenitore.objects.create(
                nome="Camion Bilico 13.6m",
                tipo_mezzo=TipoMezzo.BILICO,
                lunghezza_mm=13600,
                larghezza_mm=2480,
                altezza_mm=2700,
                carico_massimo_kg=Decimal("24000"),
                tara_kg=Decimal("14000"),
                note="Bilico con telaio. Dimensioni pianale.",
            ),
            Contenitore.objects.create(
                nome="Furgone Ducato 3.5t",
                tipo_mezzo=TipoMezzo.FURGONE,
                lunghezza_mm=3700,
                larghezza_mm=1800,
                altezza_mm=1900,
                carico_massimo_kg=Decimal("3500"),
                tara_kg=Decimal("1800"),
                note="Furgone allestimento merci.",
            ),
        ]
        self.stdout.write(f"  [OK] {len(contenitori)} contenitori creati")
        return contenitori

    def _crea_sezioni(self, contenitori):
        """Crea le sezioni di carico (zone assi) per i mezzi con assi."""
        # Mappa: nome contenitore -> lista di (nome, inizio, fine, carico_max)
        sezioni_data = {
            "Camion Bilico 13.6m": [
                ("Zona 1 - Anteriore", 0, 10000, Decimal("9000")),
                ("Zona 2 - Centrale", 10000, 11500, Decimal("9000")),
                ("Zona 3 - Tridem posteriore", 11500, 13600, Decimal("9000")),
            ],
            "Furgone Ducato 3.5t": [
                ("Zona unica", 0, 3700, Decimal("8000")),
            ],
        }

        create = 0
        for c in contenitori:
            if c.nome in sezioni_data:
                for nome, inizio, fine, carico_max in sezioni_data[c.nome]:
                    SezioneCarico.objects.create(
                        contenitore=c,
                        nome=nome,
                        inizio_x_mm=inizio,
                        fine_x_mm=fine,
                        carico_massimo_kg=carico_max,
                    )
                    create += 1

        self.stdout.write(f"  [OK] {create} sezioni di carico create")

    def _crea_oggetti(self):
        oggetti_data = [
            # (codice, descrizione, X, Y, Z, peso, qta, vincoli)
            ("SCAT-A01", "Scatola ricambi auto grandi", 600, 400, 300, 35.0, 6, {}),
            ("SCAT-A02", "Scatola ricambi auto medi", 400, 300, 250, 18.0, 8, {}),
            ("SCAT-A03", "Scatola ricambi auto piccoli", 300, 200, 150, 8.0, 12, {}),
            ("ELET-B01", "Armadio elettrico industriale", 800, 600, 1200, 120.0, 2, {
                "rotazione_consentita": False,
                "sovrapponibile": False,
                "solo_su_piano": True,
            }),
            ("ELET-B02", "Quadro elettrico medio", 500, 400, 600, 65.0, 3, {
                "sovrapponibile": False,
                "solo_su_piano": True,
            }),
            ("TUBI-C01", "Banco tubi in PVC", 2000, 200, 200, 45.0, 4, {
                "rotazione_su_y": False,
                "rotazione_su_z": False,
                "sovrapponibile": False,
            }),
            ("TUBI-C02", "Banco tubi in rame", 1500, 150, 150, 30.0, 3, {
                "rotazione_su_y": False,
                "rotazione_su_z": False,
                "sovrapponibile": False,
            }),
            ("FRAG-D01", "Vetro temperato 100x80", 1000, 800, 50, 25.0, 5, {
                "rotazione_consentita": False,
                "sovrapponibile": False,
                "fragile": True,
                "solo_su_piano": True,
            }),
            ("FRAG-D02", "Vetro temperato 80x60", 800, 600, 50, 18.0, 4, {
                "rotazione_consentita": False,
                "sovrapponibile": False,
                "fragile": True,
                "solo_su_piano": True,
            }),
            ("BOTT-E01", "Bottiglie vetro (cassa)", 400, 300, 250, 15.0, 10, {
                "sovrapponibile": True,
                "peso_massimo_tetto_kg": Decimal("30"),
            }),
            ("BOTT-E02", "Bottiglie PET (cassa)", 400, 300, 350, 8.0, 15, {
                "sovrapponibile": True,
                "peso_massimo_tetto_kg": Decimal("40"),
            }),
            ("LEGN-F01", "Pallet legno vuoto", 1200, 800, 150, 25.0, 10, {
                "sovrapponibile": True,
                "peso_massimo_tetto_kg": Decimal("500"),
            }),
            ("LEGN-F02", "Pallet legno carico", 1200, 800, 1000, 250.0, 4, {
                "sovrapponibile": False,
            }),
            ("METAL-G01", "Lastre acciaio impilabili", 1200, 800, 100, 150.0, 6, {
                "sovrapponibile": True,
                "peso_massimo_tetto_kg": Decimal("300"),
            }),
            ("METAL-G02", "Trave acciaio HEA 200", 3000, 200, 200, 180.0, 3, {
                "rotazione_su_y": False,
                "rotazione_su_z": False,
                "sovrapponibile": False,
            }),
            ("GOMM-H01", "Rotolo gomma industriale", 1200, 300, 300, 60.0, 4, {
                "rotazione_su_y": False,
                "rotazione_su_z": False,
            }),
            ("CART-I01", "Cartoni vuoti (balla)", 1000, 800, 500, 12.0, 8, {
                "sovrapponibile": True,
                "peso_massimo_tetto_kg": Decimal("100"),
            }),
            ("CART-I02", "Scatole cartone medie", 500, 400, 300, 5.0, 20, {
                "sovrapponibile": True,
                "peso_massimo_tetto_kg": Decimal("50"),
            }),
        ]

        oggetti_creati = []
        for codice, desc, lx, ly, lz, peso, qta, vincoli_kw in oggetti_data:
            oggetto = Oggetto.objects.create(
                codice=codice,
                descrizione=desc,
                lunghezza_mm=lx,
                larghezza_mm=ly,
                altezza_mm=lz,
                peso_kg=Decimal(str(peso)),
                quantita_disponibile=qta,
            )
            # Aggiorna i vincoli se specificati
            if vincoli_kw:
                vincolo, _ = VincoloOggetto.objects.get_or_create(oggetto=oggetto)
                for key, val in vincoli_kw.items():
                    setattr(vincolo, key, val)
                vincolo.save()

            oggetti_creati.append(oggetto)

        self.stdout.write(f"  [OK] {len(oggetti_creati)} oggetti creati con vincoli")
        return oggetti_creati

    def _crea_piani(self, contenitori, oggetti):
        piani = [
            PianoDiCarico.objects.create(
                nome="Spedizione Container 20' — Ricambi Auto",
                contenitore=contenitori[0],  # Container 20'
                stato=StatoPiano.COMPLETATO,
                peso_totale_kg=Decimal("280.00"),
                completato_at=timezone.now(),
            ),
            PianoDiCarico.objects.create(
                nome="Carico Misto — Furgone 3.5t",
                contenitore=contenitori[3],  # Furgone
                stato=StatoPiano.COMPLETATO,
                peso_totale_kg=Decimal("1850.00"),
                completato_at=timezone.now(),
            ),
            PianoDiCarico.objects.create(
                nome="Spedizione Container 40' HC — Materiali Edili",
                contenitore=contenitori[1],  # Container 40' HC
                stato=StatoPiano.BOZZA,
            ),
            PianoDiCarico.objects.create(
                nome="Carico Completo — Bilico 13.6m",
                contenitore=contenitori[2],  # Bilico
                stato=StatoPiano.COMPLETATO,
                peso_totale_kg=Decimal("12000.00"),
                completato_at=timezone.now(),
            ),
        ]
        self.stdout.write(f"  [OK] {len(piani)} piani di carico creati")
        return piani

    def _esegui_ottimizzazione(self, piani):
        self.stdout.write("\nEsecuzione ottimizzazione 3D...")
        from caricamento.engine import esegui_ottimizzazione_tre_d

        for piano in piani:
            if piano.stato == StatoPiano.BOZZA:
                risultato = esegui_ottimizzazione_tre_d(piano.id)
                stato = "OK" if risultato.successo else "ERR"
                self.stdout.write(
                    f"  [{stato}] Piano #{piano.id} '{piano.nome}': "
                    f"{len(risultato.oggetti_posizionati)} oggetti posizionati, "
                    f"{len(risultato.oggetti_non_posizionati)} non posizionati, "
                    f"saturazione {risultato.saturazione_percentuale:.1f}%"
                )
