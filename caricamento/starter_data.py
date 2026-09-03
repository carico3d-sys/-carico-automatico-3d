"""Creazione dell'anagrafica iniziale per i nuovi utenti."""

import json
from decimal import Decimal
from pathlib import Path

from django.db import transaction
from django.utils import timezone

from .models import (
    Contenitore,
    Oggetto,
    OggettoDaCaricare,
    OggettoPosizionato,
    PianoDiCarico,
    SezioneCarico,
    StatoPiano,
    VincoloOggetto,
    VincoloTraOggetti,
)


CATALOG_PATH = Path(__file__).with_name("starter_catalog.json")


def _decimal(value, default="0"):
    """Converte i numeri del JSON in Decimal senza perdere precisione."""
    if value is None:
        value = default
    return Decimal(str(value))


def _load_catalog():
    with CATALOG_PATH.open("r", encoding="utf-8") as catalog_file:
        return json.load(catalog_file)


def _create_objects(user, catalog):
    objects_by_code = {}
    for data in catalog.get("objects", []):
        code = data["code"]
        if code in objects_by_code:
            raise ValueError(f"Codice oggetto duplicato nel catalogo: {code}")

        obj = Oggetto.objects.create(
            owner=user,
            codice=code,
            descrizione=data.get("description", ""),
            lunghezza_mm=data["length_mm"],
            larghezza_mm=data["width_mm"],
            altezza_mm=data["height_mm"],
            peso_kg=_decimal(data["weight_kg"]),
            quantita_disponibile=data.get("available_quantity", 1),
            colore=data.get("color", ""),
            archiviato=data.get("archived", False),
        )

        # Ogni Oggetto ne riceve già uno dal segnale del modello. Il JSON
        # sovrascrive soltanto i campi eventualmente personalizzati.
        constraint_data = data.get("constraints") or {}
        if constraint_data:
            VincoloOggetto.objects.filter(oggetto=obj).update(**constraint_data)
        objects_by_code[code] = obj

    return objects_by_code


def _create_vehicles(user, catalog):
    vehicles_by_key = {}
    for data in catalog.get("vehicles", []):
        key = data["key"]
        if key in vehicles_by_key:
            raise ValueError(f"Chiave mezzo duplicata nel catalogo: {key}")

        vehicle = Contenitore.objects.create(
            owner=user,
            nome=data["name"],
            tipo_mezzo=data["type"],
            lunghezza_mm=data["length_mm"],
            larghezza_mm=data["width_mm"],
            altezza_mm=data["height_mm"],
            carico_massimo_kg=_decimal(data["maximum_load_kg"]),
            tara_kg=_decimal(data.get("tare_kg")),
            note=data.get("note", ""),
            archiviato=data.get("archived", False),
        )
        for section in data.get("sections", []):
            SezioneCarico.objects.create(
                contenitore=vehicle,
                nome=section["name"],
                inizio_x_mm=section["start_x_mm"],
                fine_x_mm=section["end_x_mm"],
                carico_massimo_kg=_decimal(section["maximum_load_kg"]),
            )
        vehicles_by_key[key] = vehicle

    return vehicles_by_key


def _create_relationships(catalog, objects_by_code):
    for data in catalog.get("object_relationships", []):
        VincoloTraOggetti.objects.create(
            oggetto_a=objects_by_code[data["object_a"]],
            oggetto_b=objects_by_code[data["object_b"]],
            tipo_relazione=data["type"],
            attivo=data.get("active", True),
            dettagli_posizionamento=data.get("details"),
            note=data.get("note", ""),
        )


def _create_plans(user, catalog, objects_by_code, vehicles_by_key):
    plans = []
    for data in catalog.get("plans", []):
        status = data.get("status", StatoPiano.BOZZA)
        plan = PianoDiCarico.objects.create(
            owner=user,
            nome=data["name"],
            contenitore=vehicles_by_key[data["vehicle"]],
            stato=status,
            peso_totale_kg=(
                _decimal(data["total_weight_kg"])
                if data.get("total_weight_kg") is not None else None
            ),
            volume_utilizzato_mm3=data.get("volume_used_mm3"),
            algoritmo=data.get("algorithm", ""),
            completato_at=(timezone.now() if status != StatoPiano.BOZZA else None),
        )

        items_by_key = {}
        for item in data.get("items", []):
            item_key = item["key"]
            if item_key in items_by_key:
                raise ValueError(f"Chiave riga duplicata nel catalogo: {item_key}")
            items_by_key[item_key] = OggettoDaCaricare.objects.create(
                piano_di_carico=plan,
                oggetto=objects_by_code[item["object"]],
                quantita=item.get("quantity", 1),
                priorita=item.get("priority", 0),
                note=item.get("note", ""),
                colore=item.get("color", ""),
            )

        for positioned in data.get("positioned_items", []):
            source_item = items_by_key.get(positioned.get("item"))
            OggettoPosizionato.objects.create(
                piano_di_carico=plan,
                oggetto=objects_by_code[positioned["object"]],
                riga_origine=source_item,
                coordinata_x_mm=positioned["x_mm"],
                coordinata_y_mm=positioned["y_mm"],
                coordinata_z_mm=positioned["z_mm"],
                dimensione_x_mm=positioned["width_mm"],
                dimensione_y_mm=positioned["depth_mm"],
                dimensione_z_mm=positioned["height_mm"],
                rotazione_applicata=positioned.get("rotation", "XYZ"),
                colore=positioned.get("color", "#4488ff"),
                peso_posato_sopra_kg=_decimal(positioned.get("weight_above_kg")),
            )
        plans.append(plan)

    return plans


def crea_dati_iniziali(user):
    """Crea l'anagrafica e il piano iniziali per ``user``.

    Il database assegna normalmente tutti gli ID. I riferimenti del JSON sono
    codici/chiavi leggibili e vengono risolti mentre i record vengono creati.
    La transazione impedisce di lasciare un workspace parzialmente popolato.
    """
    catalog = _load_catalog()
    with transaction.atomic():
        objects_by_code = _create_objects(user, catalog)
        vehicles_by_key = _create_vehicles(user, catalog)
        _create_relationships(catalog, objects_by_code)
        plans = _create_plans(user, catalog, objects_by_code, vehicles_by_key)
    return plans
