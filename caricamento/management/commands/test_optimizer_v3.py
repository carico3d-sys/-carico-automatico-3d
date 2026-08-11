"""
Management command: test_optimizer_v3

Testa direttamente optimizer_v3 su un piano, stampando TUTTI i dettagli
per verificare se il codice gira e cosa produce.

Utilizzo:
    python manage.py test_optimizer_v3 <piano_id>
"""

from django.core.management.base import BaseCommand

from caricamento.engine.common import ConfigurazioneOttimizzazione
from caricamento.engine.tre_d.data_adapter import _mm_to_cm
from caricamento.engine.tre_d.packer_3d_v2 import Obj, filter_unfitted, load_truck_v2
from caricamento.engine.tre_d.optimizer_v3 import (
    optimize_solution_v3,
    _estrai_tipo,
    _raggruppa_per_tipo,
    _mescola_testa_coda,
    _valuta_soluzione,
)
from caricamento.models import (
    PianoDiCarico,
    OggettoDaCaricare,
    VincoloTraOggetti,
    VincoloOggetto,
)


class Command(BaseCommand):
    help = "Testa optimizer_v3 su un PianoDiCarico stampando tutti i dettagli."

    def add_arguments(self, parser):
        parser.add_argument("piano_id", type=int)

    def handle(self, *args, **options):
        piano_id = options["piano_id"]

        try:
            piano = PianoDiCarico.objects.select_related("contenitore").get(pk=piano_id)
        except PianoDiCarico.DoesNotExist:
            self.stderr.write(f"Piano #{piano_id} non trovato.")
            return

        contenitore = piano.contenitore
        container_dim = (
            contenitore.lunghezza_mm / 10.0,
            contenitore.larghezza_mm / 10.0,
            contenitore.altezza_mm / 10.0,
        )

        # Carica oggetti
        oggetti_dc = OggettoDaCaricare.objects.filter(piano_di_carico=piano).select_related("oggetto")
        objs = []
        for idx, odc in enumerate(oggetti_dc):
            for n in range(odc.quantita):
                o = odc.oggetto
                try:
                    vincoli = VincoloOggetto.objects.get(oggetto=o)
                except VincoloOggetto.DoesNotExist:
                    vincoli = None

                obj = Obj(
                    id=f"{o.codice}-{idx * 1000 + n}",
                    w=_mm_to_cm(o.lunghezza_mm),
                    d=_mm_to_cm(o.larghezza_mm),
                    h=_mm_to_cm(o.altezza_mm),
                    oggetto_id=o.pk,
                    orientation_allowed=vincoli.rotazione_consentita if vincoli else True,
                    rotazione_su_x=vincoli.rotazione_su_x if vincoli else True,
                    rotazione_su_y=vincoli.rotazione_su_y if vincoli else True,
                    rotazione_su_z=vincoli.rotazione_su_z if vincoli else True,
                    sovrapponibile=vincoli.sovrapponibile if vincoli else True,
                    solo_su_piano=vincoli.solo_su_piano if vincoli else False,
                    fragile=vincoli.fragile if vincoli else False,
                    priorita=odc.priorita or 0,
                )
                obj._peso_kg = float(o.peso_kg)
                obj._colore = o.colore or "#4488ff"
                objs.append(obj)

        # Vincoli tra oggetti
        vincoli_sopra = {}
        for vt in VincoloTraOggetti.objects.filter(attivo=True).select_related("oggetto_a", "oggetto_b"):
            if vt.tipo_relazione == "sopra":
                a_id = vt.oggetto_a_id
                b_id = vt.oggetto_b_id
                if a_id not in vincoli_sopra:
                    vincoli_sopra[a_id] = {}
                vincoli_sopra[a_id][b_id] = None

        self.stdout.write(f"\n=== TEST OPTIMIZER V3 su Piano #{piano_id} ===")
        self.stdout.write(f"Contenitore: {contenitore.nome} ({container_dim[0]:.0f}×{container_dim[1]:.0f}×{container_dim[2]:.0f} cm)")
        self.stdout.write(f"Oggetti totali: {len(objs)}")

        # Mostra tipi
        gruppi = _raggruppa_per_tipo(objs)
        self.stdout.write(f"Tipi: {len(gruppi)}")
        for tipo, blocco in sorted(gruppi.items(), key=lambda x: -len(x[1])):
            self.stdout.write(f"  {tipo}: {len(blocco)} pezzi")

        # ---- TEST 1: Base deterministico ----
        self.stdout.write("\n--- TEST 1: Ordine standard (deterministico) ---")
        import copy
        fresh = copy.deepcopy(objs)
        sol1 = load_truck_v2(fresh, vincoli_sopra, container_dim=container_dim, preserve_order=False)
        s1 = _valuta_soluzione(sol1)
        self.stdout.write(f"  Score: {s1[0]} oggetti, X_max={-s1[1]:.0f} cm")

        # ---- TEST 2: Mescola testa/coda take=3 ----
        self.stdout.write("\n--- TEST 2: Mescola testa/coda take=3 ---")
        fresh = copy.deepcopy(objs)
        candidate = _mescola_testa_coda(fresh, take=3)
        primi = [_estrai_tipo(o) for o in candidate[:20]]
        ultimi = [_estrai_tipo(o) for o in candidate[-20:]]
        self.stdout.write(f"  Primi 20: {primi}")
        self.stdout.write(f"  Ultimi 20: {ultimi}")
        sol2 = load_truck_v2(candidate, vincoli_sopra, container_dim=container_dim, preserve_order=True)
        s2 = _valuta_soluzione(sol2)
        self.stdout.write(f"  Score: {s2[0]} oggetti, X_max={-s2[1]:.0f} cm")
        self.stdout.write(f"  Migliora? {'SI' if s2 > s1 else 'NO'}")

        # ---- TEST 3: Mescola testa/coda take=4 ----
        self.stdout.write("\n--- TEST 3: Mescola testa/coda take=4 ---")
        fresh = copy.deepcopy(objs)
        candidate = _mescola_testa_coda(fresh, take=4)
        primi = [_estrai_tipo(o) for o in candidate[:20]]
        ultimi = [_estrai_tipo(o) for o in candidate[-20:]]
        self.stdout.write(f"  Primi 20: {primi}")
        self.stdout.write(f"  Ultimi 20: {ultimi}")
        sol3 = load_truck_v2(candidate, vincoli_sopra, container_dim=container_dim, preserve_order=True)
        s3 = _valuta_soluzione(sol3)
        self.stdout.write(f"  Score: {s3[0]} oggetti, X_max={-s3[1]:.0f} cm")
        self.stdout.write(f"  Migliora? {'SI' if s3 > s1 else 'NO'}")

        # ---- TEST 4: optimize_solution_v3 completo ----
        self.stdout.write("\n--- TEST 4: optimize_solution_v3() completo ---")
        config = ConfigurazioneOttimizzazione(backtracking_avanzato=True)
        sol4 = optimize_solution_v3(
            objs, vincoli_sopra=vincoli_sopra,
            iterations=3, container_dim=container_dim,
            compattazione_aggressiva=False,
        )
        s4 = _valuta_soluzione(sol4)
        self.stdout.write(f"  Score finale: {s4[0]} oggetti, X_max={-s4[1]:.0f} cm")
        self.stdout.write(f"  Migliora su base? {'SI' if s4 > s1 else 'NO (o uguale)'}")

        # Mostra la sequenza tipi della soluzione finale
        placed4, _ = filter_unfitted(sol4)
        tipi_ordinati = [_estrai_tipo(o) for o in placed4]
        # Raggruppa consecutivi
        gruppi_seq = []
        prev = None
        count = 0
        for t in tipi_ordinati:
            if t == prev:
                count += 1
            else:
                if prev is not None:
                    gruppi_seq.append(f"{prev}×{count}")
                prev = t
                count = 1
        if prev:
            gruppi_seq.append(f"{prev}×{count}")
        self.stdout.write(f"  Sequenza tipi: {' -> '.join(gruppi_seq)}")

        self.stdout.write("\n=== FINE TEST ===\n")
