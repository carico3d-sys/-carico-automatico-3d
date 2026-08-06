"""
Test stacking: testa load_truck isolato e l'integrazione con esegui_ottimizzazione_tre_d.
"""
from collections import defaultdict
from django.core.management.base import BaseCommand

from caricamento.engine.tre_d.packer_3d_v2 import load_truck, Obj
from caricamento.engine.orchestratore_tre_d import esegui_ottimizzazione_tre_d
from caricamento.engine.common import ConfigurazioneOttimizzazione


class Command(BaseCommand):
    help = "Test stacking"

    def add_arguments(self, parser):
        parser.add_argument("piano_id", nargs="?", type=int, default=None)

    def handle(self, *args, **options):
        piano_id = options["piano_id"]

        if piano_id:
            self._test_con_escape(piano_id)
        else:
            self._test_isolato()

    def _stampa_distribuzione(self, risultati, unita="cm"):
        """Stampa distribuzione Y, Z, X degli oggetti."""
        n_tot = len(risultati)

        # Distribuzione Y
        per_y = defaultdict(list)
        for o in risultati:
            y_val = o.y if hasattr(o, 'y') else o.coordinata_y_mm
            per_y[y_val].append(o)
        self.stdout.write(f"Distribuzione Y ({unita}):")
        for y in sorted(per_y.keys()):
            items = per_y[y]
            tipi = defaultdict(int)
            for item in items:
                codice = item.id.split("-")[0] if hasattr(item, 'id') else item.codice
                tipi[codice] += 1
            desc = ", ".join(f"{k}={v}" for k, v in sorted(tipi.items()))
            self.stdout.write(f"  y={y:>5}{unita}: {len(items)} items [{desc}]")
        self.stdout.write(f"  Y uniche: {len(per_y)} su {n_tot} oggetti")

        # Distribuzione Z
        per_z = defaultdict(list)
        for o in risultati:
            z_val = o.z if hasattr(o, 'z') else o.coordinata_z_mm
            per_z[z_val].append(o)
        self.stdout.write(f"Distribuzione Z ({unita}):")
        n_z = sum(len(items) for items in per_z.values())
        for z in sorted(per_z.keys()):
            items = per_z[z]
            tipi = defaultdict(int)
            for item in items:
                codice = item.id.split("-")[0] if hasattr(item, 'id') else item.codice
                tipi[codice] += 1
            desc = ", ".join(f"{k}={v}" for k, v in sorted(tipi.items()))
            self.stdout.write(f"  z={z:>5}{unita}: {len(items)} items [{desc}]")
        self.stdout.write(f"  Z uniche: {len(per_z)} su {n_z} oggetti")

        # Estremi X
        if n_tot > 0:
            if hasattr(risultati[0], 'x'):
                max_x = max(o.x + o.width for o in risultati)
            else:
                max_x = max(o.coordinata_x_mm + o.dimensione_x_mm for o in risultati)
            self.stdout.write(f"X max: {max_x} {unita}")

    def _test_isolato(self):
        self.stdout.write("=== TEST ISOLATO (load_truck diretto) ===")
        objs = []
        for i in range(4):
            objs.append(Obj(f"CART-I01-{i}", 120, 100, 100,
                            oggetto_id=1, sovrapponibile=True))
        for i in range(19):
            objs.append(Obj(f"CART-I02-{i}", 120, 80, 100,
                            oggetto_id=2, sovrapponibile=True))

        container_dim = (1360, 248, 270)  # container reale in cm
        self.stdout.write(f"\nOggetti: {len(objs)}  Container: {container_dim[0]}x{container_dim[1]}x{container_dim[2]} cm")
        self.stdout.write(f"\n--- CONTAINER LIMITI ---")
        risultati = load_truck(objs, {}, container_dim=container_dim)
        self._stampa_distribuzione(risultati)

        posizionati, non_pos = [], []
        for o in risultati:
            if o.z == -1:
                non_pos.append(o)
            else:
                posizionati.append(o)
        self.stdout.write(f"Posizionati: {len(posizionati)}  Non caricati: {len(non_pos)}")

        self.stdout.write(f"\n--- SENZA LIMITI (libera espansione) ---")
        risultati2 = load_truck(objs, {})
        self._stampa_distribuzione(risultati2)
        max_x = max(o.x + o.width for o in risultati2)
        self.stdout.write(f"Posizionati: {len(risultati2)}")

    def _test_con_escape(self, piano_id):
        self.stdout.write(f"\n=== TEST INTEGRAZIONE (esegui_ottimizzazione_tre_d piano {piano_id}) ===")
        cfg = ConfigurazioneOttimizzazione(algoritmo_base="Algoritmo 3D Semplificato")
        r = esegui_ottimizzazione_tre_d(piano_id, config=cfg)
        self.stdout.write(f"Successo: {r.successo}  Oggetti: {len(r.oggetti_posizionati)}")
        self._stampa_distribuzione(r.oggetti_posizionati, unita="mm")
        if len(r.oggetti_posizionati) > 0:
            self.stdout.write(self.style.SUCCESS("Test completato!"))
