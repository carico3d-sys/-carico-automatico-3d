"""Uniform grid (spatial hashing) per accelerare le query geometriche del packer.

Il modulo e' Python puro, senza Django e senza dipendenze dal packer: lavora
sul protocollo ``Obj`` (``x``, ``y``, ``z``, ``width``, ``depth``, ``height``,
``id``).

GARANZIA NON NEGOZIABILE (over-approximation)
---------------------------------------------
La griglia e' un FILTRO DI CANDIDATI, mai un'autorita'. Le query possono
restituire candidati IN PIU' (innocui: il chiamante ri-applica il controllo
esatto) ma MAI in meno (perdere un candidato produrrebbe violazioni o risultati
diversi). La correttezza resta quindi garantita per costruzione.

ORDINE (determinismo)
---------------------
Le query restituiscono i candidati nell'ordine di inserimento nella griglia,
che coincide con l'ordine di ``placed``. I consumatori che usano "il primo
match" o "il piu' alto con tie-break d'ordine" restano cosi' bit-identici.

Indici mantenuti:
- ``_cells``:  uniform grid 3D del volume (per la collisione);
- ``_top``:   oggetti con ``z + height == quota`` (per "cosa sostiene obj");
- ``_bottom``: oggetti con ``z == quota`` (per "cosa poggia su target");
- ``_colonne``: mappa colonna (round(x), round(y)) -> oggetti (per vincoli).
"""

from .constants import (
    SPATIAL_GRID_CELL_SIZE,
    SPATIAL_GRID_EPS_Z,
)

# Scala le quote da cm a unita' intere (0.001 cm). L'epsilon di 0.001 cm
# corrisponde quindi a 1 unita': interrogando le chiavi entro +-MARGIN da
# quella cercata si copre (per eccesso) l'intervallo di tolleranza esatto.
_Z_SCALE = 1000.0
_Z_KEY_MARGIN = 2


def _cell_range(lo, hi, cell):
    """Celle intersecate dall'intervallo [lo, hi], inclusa quella finale.

    Over-inclusiva di proposito: l'intervallo [a, b] viene registrato in
    ``floor(a/cell) .. floor(b/cell)``. Due intervalli che si sovrappongono
    condividono sempre almeno una cella (mai candidati persi); l'inclusione
    della cella finale e' innocua perche' il chiamante filtra in modo esatto.
    """
    if cell <= 0:
        return [0]
    return range(int(lo // cell), int(hi // cell) + 1)


class SpatialGrid:
    """Indice spaziale uniform-grid con indici ausiliari di quota e colonna."""

    def __init__(
        self,
        cell_size=SPATIAL_GRID_CELL_SIZE,
        eps_z=SPATIAL_GRID_EPS_Z,
    ):
        self.cell_size = float(cell_size)
        self.eps_z = float(eps_z)
        self._cells = {}       # (cx, cy, cz) -> list[obj]
        self._top = {}         # key_z(obj.z + obj.height) -> list[obj]
        self._bottom = {}      # key_z(obj.z) -> list[obj]
        self._colonne = {}     # (round(x), round(y)) -> list[obj]
        self._seq = {}         # id(obj) -> ordine di inserimento
        self._counter = 0
        self.size = 0

    # ------------------------------------------------------------------
    # Manutenzione
    # ------------------------------------------------------------------

    @staticmethod
    def _key_z(z):
        return int(round(z * _Z_SCALE))

    def _register(self, obj):
        self._seq[id(obj)] = self._counter
        self._counter += 1

        x1 = obj.x + obj.width
        y1 = obj.y + obj.depth
        z1 = obj.z + obj.height

        for cx in _cell_range(obj.x, x1, self.cell_size):
            for cy in _cell_range(obj.y, y1, self.cell_size):
                for cz in _cell_range(obj.z, z1, self.cell_size):
                    self._cells.setdefault((cx, cy, cz), []).append(obj)

        self._top.setdefault(self._key_z(obj.z + obj.height), []).append(obj)
        self._bottom.setdefault(self._key_z(obj.z), []).append(obj)
        col = (round(obj.x, 3), round(obj.y, 3))
        self._colonne.setdefault(col, []).append(obj)

    def _unregister(self, obj):
        x1 = obj.x + obj.width
        y1 = obj.y + obj.depth
        z1 = obj.z + obj.height

        for cx in _cell_range(obj.x, x1, self.cell_size):
            for cy in _cell_range(obj.y, y1, self.cell_size):
                for cz in _cell_range(obj.z, z1, self.cell_size):
                    bucket = self._cells.get((cx, cy, cz))
                    if bucket and obj in bucket:
                        bucket.remove(obj)
                    if bucket == []:
                        self._cells.pop((cx, cy, cz), None)

        for index, key in ((self._top, self._key_z(obj.z + obj.height)),
                           (self._bottom, self._key_z(obj.z))):
            bucket = index.get(key)
            if bucket and obj in bucket:
                bucket.remove(obj)
            if bucket == []:
                index.pop(key, None)

        col = (round(obj.x, 3), round(obj.y, 3))
        bucket = self._colonne.get(col)
        if bucket and obj in bucket:
            bucket.remove(obj)
        if bucket == []:
            self._colonne.pop(col, None)

        self._seq.pop(id(obj), None)

    def add(self, obj):
        if id(obj) in self._seq:
            self.remove(obj)
        self._register(obj)
        self.size += 1

    def remove(self, obj):
        if id(obj) not in self._seq:
            return
        self._unregister(obj)
        self.size -= 1

    # ------------------------------------------------------------------
    # Query (over-approximation: candidati in piu', mai in meno)
    # ------------------------------------------------------------------

    def _ordered(self, objs):
        objs = list(objs)
        objs.sort(key=lambda o: self._seq.get(id(o), self._counter))
        return objs

    def query_volume(self, x0, y0, z0, x1, y1, z1):
        """Candidati che toccano l'AABB [x0,x1)x[y0,y1)x[z0,z1) a livello cella."""
        seen = set()
        out = []
        for cx in _cell_range(x0, x1, self.cell_size):
            for cy in _cell_range(y0, y1, self.cell_size):
                for cz in _cell_range(z0, z1, self.cell_size):
                    for obj in self._cells.get((cx, cy, cz), ()):
                        if id(obj) not in seen:
                            seen.add(id(obj))
                            out.append(obj)
        return self._ordered(out)

    def query_top(self, z_top):
        """Oggetti con ``z + height == z_top`` (entro l'epsilon), in ordine."""
        return self._query_quota(self._top, z_top)

    def query_bottom(self, z_bottom):
        """Oggetti con ``z == z_bottom`` (entro l'epsilon), in ordine."""
        return self._query_quota(self._bottom, z_bottom)

    def _query_quota(self, index, quota):
        key = self._key_z(quota)
        seen = set()
        out = []
        for k in range(key - _Z_KEY_MARGIN, key + _Z_KEY_MARGIN + 1):
            for obj in index.get(k, ()):
                if id(obj) not in seen:
                    seen.add(id(obj))
                    out.append(obj)
        return self._ordered(out)

    def query_colonna(self, x, y):
        """Oggetti nella colonna (round(x), round(y)), in ordine di inserimento."""
        col = (round(x, 3), round(y, 3))
        return self._ordered(self._colonne.get(col, ()))


__all__ = ["SpatialGrid"]
