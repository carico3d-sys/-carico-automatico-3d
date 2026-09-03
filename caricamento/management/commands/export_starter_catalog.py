"""Esporta il catalogo di un utente in formato starter_catalog.json.

Esempio:
    python manage.py export_starter_catalog --username admin \
        --plan-name "Carico 03/09/2026 16:06"
"""

import json
import re
from pathlib import Path

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError

from caricamento.models import (
    Contenitore,
    Oggetto,
    PianoDiCarico,
    VincoloTraOggetti,
)


CONSTRAINT_FIELDS = (
    "rotazione_consentita",
    "rotazione_su_x",
    "rotazione_su_y",
    "rotazione_su_z",
    "sovrapponibile",
    "peso_massimo_tetto_kg",
    "fragile",
    "merce_pericolosa",
    "solo_su_piano",
    "aggancio_forche",
    "note",
)


def _slug(value):
    value = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return value or "item"


def _unique_key(value, used):
    base = _slug(value)
    key = base
    counter = 2
    while key in used:
        key = f"{base}_{counter}"
        counter += 1
    used.add(key)
    return key


def _decimal(value):
    return str(value) if value is not None else None


class Command(BaseCommand):
    help = "Esporta oggetti, vincoli, mezzi e piano in un catalogo JSON senza ID."

    def add_arguments(self, parser):
        parser.add_argument("--username", default="admin")
        parser.add_argument(
            "--plan-name",
            default="Carico 03/09/2026 16:06",
            help="Nome del piano ottimizzato da esportare.",
        )
        parser.add_argument(
            "--output",
            default=str(Path(__file__).resolve().parents[2] / "starter_catalog.json"),
            help="Percorso del file JSON di destinazione.",
        )

    def handle(self, *args, **options):
        try:
            user = User.objects.get(username=options["username"])
        except User.DoesNotExist as exc:
            raise CommandError(f"Utente non trovato: {options['username']}") from exc

        plans = list(
            PianoDiCarico.objects.filter(
                owner=user,
                nome__iexact=options["plan_name"],
            ).select_related("contenitore").prefetch_related(
                "oggetti_da_caricare__oggetto",
                "oggetti_posizionati__oggetto",
            )
        )
        if len(plans) != 1:
            raise CommandError(
                f"Atteso un solo piano '{options['plan_name']}' per {user.username}; "
                f"trovati {len(plans)}."
            )
        plan = plans[0]

        objects = list(Oggetto.objects.filter(owner=user).select_related("vincoli").order_by("id"))
        object_codes = {obj.pk: obj.codice for obj in objects}
        if len(object_codes) != len(objects):
            raise CommandError("Il catalogo admin contiene codici oggetto duplicati.")

        vehicles = list(Contenitore.objects.filter(owner=user).prefetch_related("sezioni").order_by("id"))
        vehicle_keys = {}
        used_vehicle_keys = set()
        for vehicle in vehicles:
            vehicle_keys[vehicle.pk] = _unique_key(vehicle.nome, used_vehicle_keys)

        catalog = {
            "version": 2,
            "objects": [self._object_data(obj) for obj in objects],
            "vehicles": [self._vehicle_data(vehicle, vehicle_keys[vehicle.pk]) for vehicle in vehicles],
            "object_relationships": [
                self._relationship_data(relation, object_codes)
                for relation in VincoloTraOggetti.objects.filter(
                    oggetto_a__owner=user,
                    oggetto_b__owner=user,
                ).select_related("oggetto_a", "oggetto_b").order_by("id")
            ],
            "plans": [self._plan_data(plan, vehicle_keys[plan.contenitore_id])],
        }

        output = Path(options["output"])
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        self.stdout.write(self.style.SUCCESS(
            f"Catalogo esportato in {output}: "
            f"{len(catalog['objects'])} oggetti, "
            f"{len(catalog['object_relationships'])} vincoli tra oggetti, "
            f"{len(catalog['vehicles'])} mezzi, "
            f"{len(plan.oggetti_da_caricare.all())} righe e "
            f"{len(plan.oggetti_posizionati.all())} posizioni."
        ))

    def _object_data(self, obj):
        constraints = obj.vincoli
        constraint_data = {}
        for field in CONSTRAINT_FIELDS:
            value = getattr(constraints, field)
            constraint_data[field] = _decimal(value) if field == "peso_massimo_tetto_kg" else value
        return {
            "code": obj.codice,
            "description": obj.descrizione,
            "length_mm": obj.lunghezza_mm,
            "width_mm": obj.larghezza_mm,
            "height_mm": obj.altezza_mm,
            "weight_kg": _decimal(obj.peso_kg),
            "available_quantity": obj.quantita_disponibile,
            "color": obj.colore,
            "archived": obj.archiviato,
            "constraints": constraint_data,
        }

    def _vehicle_data(self, vehicle, key):
        return {
            "key": key,
            "name": vehicle.nome,
            "type": vehicle.tipo_mezzo,
            "length_mm": vehicle.lunghezza_mm,
            "width_mm": vehicle.larghezza_mm,
            "height_mm": vehicle.altezza_mm,
            "maximum_load_kg": _decimal(vehicle.carico_massimo_kg),
            "tare_kg": _decimal(vehicle.tara_kg),
            "note": vehicle.note,
            "archived": vehicle.archiviato,
            "sections": [
                {
                    "name": section.nome,
                    "start_x_mm": section.inizio_x_mm,
                    "end_x_mm": section.fine_x_mm,
                    "maximum_load_kg": _decimal(section.carico_massimo_kg),
                }
                for section in vehicle.sezioni.all()
            ],
        }

    def _relationship_data(self, relation, object_codes):
        return {
            "object_a": object_codes[relation.oggetto_a_id],
            "object_b": object_codes[relation.oggetto_b_id],
            "type": relation.tipo_relazione,
            "active": relation.attivo,
            "details": relation.dettagli_posizionamento,
            "note": relation.note,
        }

    def _plan_data(self, plan, vehicle_key):
        rows = list(plan.oggetti_da_caricare.all())
        row_keys = {row.pk: f"item_{index:03d}" for index, row in enumerate(rows, start=1)}
        return {
            "key": _slug(plan.nome),
            "name": plan.nome,
            "vehicle": vehicle_key,
            "status": plan.stato,
            "total_weight_kg": _decimal(plan.peso_totale_kg),
            "volume_used_mm3": plan.volume_utilizzato_mm3,
            "algorithm": plan.algoritmo,
            "items": [
                {
                    "key": row_keys[row.pk],
                    "object": row.oggetto.codice,
                    "quantity": row.quantita,
                    "priority": row.priorita,
                    "note": row.note,
                    "color": row.colore,
                }
                for row in rows
            ],
            "positioned_items": [
                {
                    "object": positioned.oggetto.codice,
                    "item": row_keys.get(positioned.riga_origine_id),
                    "x_mm": positioned.coordinata_x_mm,
                    "y_mm": positioned.coordinata_y_mm,
                    "z_mm": positioned.coordinata_z_mm,
                    "width_mm": positioned.dimensione_x_mm,
                    "depth_mm": positioned.dimensione_y_mm,
                    "height_mm": positioned.dimensione_z_mm,
                    "rotation": positioned.rotazione_applicata,
                    "color": positioned.colore,
                    "weight_above_kg": _decimal(positioned.peso_posato_sopra_kg),
                }
                for positioned in plan.oggetti_posizionati.all()
            ],
        }
