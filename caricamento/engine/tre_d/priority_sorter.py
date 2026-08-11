"""Compatibilità per l'ordinamento degli oggetti per priorità."""

from .priority_policy import (
    priorita_esplicita,
    priorita_effettive,
    riordina_per_fasi,
)


def ordina_per_priorita(objects, vincoli_sopra=None) -> None:
    """Ordina per priorità, mantenendo le dipendenze dei vincoli."""
    riordina_per_fasi(
        objects,
        vincoli_sopra=vincoli_sopra,
        preserve_inner_order=False,
    )


def ha_priorita_esplicita(objects) -> bool:
    """True se almeno un'istanza ha priorità esplicita."""
    return any(priorita_esplicita(obj) > 0 for obj in objects)


__all__ = [
    "ordina_per_priorita",
    "ha_priorita_esplicita",
    "priorita_esplicita",
    "priorita_effettive",
    "riordina_per_fasi",
]
