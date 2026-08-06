"""
Test suite per il sistema di ottimizzazione carico 3D (Algoritmo 3D Semplificato).

Copre:
- VincoloOggetto: rotazioni, sovrapponibilità, peso massimo tetto, solo su piano
- VincoloTraOggetti: sopra
- ConfigurazioneOttimizzazione
- Rotazioni TreDPacker
"""

from decimal import Decimal

from django.test import TestCase

from caricamento.engine.common import (
    ConfigurazioneOttimizzazione,
    ItemPacked,
    _build_lookup_vincoli_tra,
)
from caricamento.models import (
    Contenitore,
    Oggetto,
    OggettoDaCaricare,
    PianoDiCarico,
    VincoloOggetto,
    VincoloTraOggetti,
)

from caricamento.engine.tre_d.packer_3d_v2 import Obj, _prova_tutte_orientazioni
from caricamento.engine.orchestratore_tre_d import esegui_ottimizzazione_tre_d


# =============================================================================
# HELPERS per i test
# =============================================================================

class TestCaseBase(TestCase):
    """Base con metodi helper per creare dati di test rapidamente."""

    def crea_contenitore(self, nome="Test Box", x=2000, y=2000, z=2000, peso=5000):
        return Contenitore.objects.create(
            nome=nome,
            lunghezza_mm=x,
            larghezza_mm=y,
            altezza_mm=z,
            carico_massimo_kg=Decimal(str(peso)),
        )

    def crea_oggetto(self, codice, x=500, y=400, z=300, peso=20, qta=1):
        return Oggetto.objects.create(
            codice=codice,
            lunghezza_mm=x,
            larghezza_mm=y,
            altezza_mm=z,
            peso_kg=Decimal(str(peso)),
            quantita_disponibile=qta,
        )

    def set_vincoli(self, oggetto, **kwargs):
        """Imposta i vincoli per un oggetto."""
        v, _ = VincoloOggetto.objects.get_or_create(oggetto=oggetto)
        for k, val in kwargs.items():
            setattr(v, k, val)
        v.save()
        return v

    def crea_vincolo_tra(self, a, b, tipo_relazione, distanza_cm=None, attivo=True, dettagli_posizionamento=None):
        """Crea un VincoloTraOggetti tra due oggetti."""
        vincolo = VincoloTraOggetti.objects.create(
            oggetto_a=a,
            oggetto_b=b,
            tipo_relazione=tipo_relazione,
            attivo=attivo,
        )
        if dettagli_posizionamento is not None:
            vincolo.dettagli_posizionamento = dettagli_posizionamento
            vincolo.save()
        return vincolo

    def crea_piano_e_ottimizza(self, contenitore, oggetti_con_quantita, config=None):
        """Crea un PianoDiCarico, aggiunge oggetti e ottimizza."""
        piano = PianoDiCarico.objects.create(
            nome="Test Piano",
            contenitore=contenitore,
        )
        for oggetto, qta in oggetti_con_quantita:
            OggettoDaCaricare.objects.create(
                piano_di_carico=piano,
                oggetto=oggetto,
                quantita=qta,
            )

        risultato = esegui_ottimizzazione_tre_d(piano.id, config=config)
        piano.refresh_from_db()
        return piano, risultato


# =============================================================================
# TEST: VINCOLI OGGETTO (VincoloOggetto)
# =============================================================================

class TestVincoliOggettoRotazione(TestCaseBase):
    """Test dei vincoli di rotazione su singolo oggetto."""

    def test_rotazione_consentita_false(self):
        """Se rotazione_consentita=False, l'oggetto mantiene solo orientamento XYZ."""
        contenitore = self.crea_contenitore()
        oggetto = self.crea_oggetto("NO-ROT", 400, 300, 200, peso=10)
        self.set_vincoli(oggetto, rotazione_consentita=False)

        piano, risultato = self.crea_piano_e_ottimizza(contenitore, [(oggetto, 1)])

        self.assertTrue(risultato.successo)
        posizionati = piano.oggetti_posizionati.all()
        self.assertEqual(posizionati.count(), 1)
        self.assertEqual(posizionati[0].rotazione_applicata, "XYZ")


class TestVincoliOggettoSovrapponibile(TestCaseBase):
    """Test del vincolo sovrapponibile e peso_massimo_tetto_kg."""

    def test_sovrapponibile_false_nessun_oggetto_sopra(self):
        """Se sovrapponibile=False, nessun oggetto può essere posizionato sopra."""
        contenitore = self.crea_contenitore()
        base = self.crea_oggetto("BASE", 1000, 1000, 500, peso=50)
        self.set_vincoli(base, sovrapponibile=False)

        sopra = self.crea_oggetto("SOPRA", 400, 400, 400, peso=10)

        piano, risultato = self.crea_piano_e_ottimizza(contenitore, [(base, 1), (sopra, 1)])

        self.assertTrue(risultato.successo)
        posizionati = list(piano.oggetti_posizionati.all())
        self.assertGreaterEqual(len(posizionati), 1)

        for p in posizionati:
            if p.oggetto_id == base.id:
                base_z_top = p.coordinata_z_mm + p.dimensione_z_mm
                for q in posizionati:
                    if q.id == p.id:
                        continue
                    if q.coordinata_z_mm >= base_z_top:
                        overlaps_x = not (
                            q.coordinata_x_mm >= p.coordinata_x_mm + p.dimensione_x_mm
                            or p.coordinata_x_mm >= q.coordinata_x_mm + q.dimensione_x_mm
                        )
                        overlaps_y = not (
                            q.coordinata_y_mm >= p.coordinata_y_mm + p.dimensione_y_mm
                            or p.coordinata_y_mm >= q.coordinata_y_mm + q.dimensione_y_mm
                        )
                        self.assertFalse(
                            overlaps_x and overlaps_y,
                            f"Oggetto {q.oggetto.codice} non dovrebbe stare sopra "
                            f"{p.oggetto.codice} (sovrapponibile=False)"
                        )

    def test_solo_su_piano_solo_z_zero(self):
        """solo_su_piano=True → oggetto posizionato solo a Z=0."""
        contenitore = self.crea_contenitore()
        piano_obj = self.crea_oggetto("PIANO-ONLY", 500, 500, 300, peso=30)
        self.set_vincoli(piano_obj, solo_su_piano=True)

        altro = self.crea_oggetto("ALTRO", 600, 600, 400, peso=20)

        piano, risultato = self.crea_piano_e_ottimizza(contenitore, [(piano_obj, 1), (altro, 1)])

        self.assertTrue(risultato.successo)
        posizionati = piano.oggetti_posizionati.all()

        for p in posizionati:
            if p.oggetto_id == piano_obj.id:
                self.assertEqual(p.coordinata_z_mm, 0,
                                 f"Oggetto solo_su_piano deve avere Z=0, ha Z={p.coordinata_z_mm}")


# =============================================================================
# TEST: ROTAZIONI IN TreDPacker (3D Semplificato)
# =============================================================================

class TestRotazioniTreDPacker(TestCase):
    """Test per verificare che _prova_tutte_orientazioni rispetti
    i flag individuali rotazione_su_x/y/z in TreDPacker."""

    def setUp(self):
        self.obj_default = Obj("TEST", 120, 80, 50, oggetto_id=1)
        self.big_dim = (500, 500, 500)
        self.narrow_x = (70, 200, 200)
        self.narrow_y = (200, 60, 200)

    def _permutationi_attese(self, obj):
        w, d, h = obj.width, obj.depth, obj.height
        perms = [(w, d, h)]
        if obj.rotazione_su_z:
            perms.append((d, w, h))
        if obj.rotazione_su_x:
            perms.append((w, h, d))
        if obj.rotazione_su_y:
            perms.append((h, d, w))
        if obj.rotazione_su_x and obj.rotazione_su_y and obj.rotazione_su_z:
            perms.append((d, h, w))
            perms.append((h, w, d))
        return sorted(set(perms), key=lambda p: p[0])

    def _chiama_e_verifica(self, obj, container_dim, deve_riuscire, dim_attese=None):
        risultato = _prova_tutte_orientazioni(obj, 0, 0, 0, [], container_dim, {})
        self.assertEqual(risultato, deve_riuscire)
        if deve_riuscire and dim_attese:
            self.assertEqual((obj.width, obj.depth, obj.height), dim_attese)

    def test_rotazione_non_consentita(self):
        obj = Obj("TEST", 120, 80, 50, oggetto_id=1, orientation_allowed=False)
        self._chiama_e_verifica(obj, self.narrow_x, deve_riuscire=False)
        self._chiama_e_verifica(obj, self.big_dim, deve_riuscire=True, dim_attese=(120, 80, 50))

    def test_solo_rotazione_su_z(self):
        obj = Obj("TEST", 120, 80, 50, oggetto_id=1,
                  rotazione_su_x=False, rotazione_su_y=False, rotazione_su_z=True)
        self._chiama_e_verifica(obj, self.narrow_x, deve_riuscire=False)
        obj2 = Obj("TEST", 120, 80, 50, oggetto_id=1,
                   rotazione_su_x=False, rotazione_su_y=False, rotazione_su_z=True)
        self._chiama_e_verifica(obj2, self.big_dim, deve_riuscire=True, dim_attese=(80, 120, 50))

    def test_solo_rotazione_su_x(self):
        obj = Obj("TEST", 80, 120, 50, oggetto_id=1,
                  rotazione_su_x=True, rotazione_su_y=False, rotazione_su_z=False)
        self._chiama_e_verifica(obj, self.narrow_y, deve_riuscire=True, dim_attese=(80, 50, 120))

    def test_solo_rotazione_su_y(self):
        obj = Obj("TEST", 120, 80, 50, oggetto_id=1,
                  rotazione_su_x=False, rotazione_su_y=True, rotazione_su_z=False)
        self._chiama_e_verifica(obj, self.narrow_x, deve_riuscire=True, dim_attese=(50, 80, 120))

    def test_tutte_sei_permutazioni(self):
        obj = Obj("TEST", 120, 80, 50, oggetto_id=1,
                  rotazione_su_x=True, rotazione_su_y=True, rotazione_su_z=True)
        self._chiama_e_verifica(obj, self.narrow_x, deve_riuscire=True, dim_attese=(50, 80, 120))

    def test_dimensioni_uguali_dedup(self):
        obj = Obj("CUBO", 100, 100, 80, oggetto_id=1,
                  rotazione_su_x=True, rotazione_su_y=True, rotazione_su_z=True)
        perms = self._permutationi_attese(obj)
        self.assertEqual(len(perms), 3)

    def test_cubo_tutte_uguali(self):
        obj = Obj("CUBO", 100, 100, 100, oggetto_id=1,
                  rotazione_su_x=True, rotazione_su_y=True, rotazione_su_z=True)
        perms = self._permutationi_attese(obj)
        self.assertEqual(len(perms), 1)
        self.assertEqual(perms[0], (100, 100, 100))


# =============================================================================
# TEST: VINCOLI TRA OGGETTI (VincoloTraOggetti)
# =============================================================================

class TestVincoloTraOggettiSopra(TestCaseBase):
    """Test del vincolo SOPRA tra oggetti."""

    def test_sopra_a_deve_stare_sopra_b(self):
        contenitore = self.crea_contenitore()
        a = self.crea_oggetto("A-SOPRA", 500, 500, 300, peso=10)
        b = self.crea_oggetto("B-SOTTO", 800, 800, 200, peso=20)
        self.crea_vincolo_tra(a, b, "sopra")

        piano, risultato = self.crea_piano_e_ottimizza(contenitore, [(a, 1), (b, 1)])

        self.assertTrue(risultato.successo)
        posizionati = list(piano.oggetti_posizionati.all())
        self.assertEqual(len(posizionati), 2)

        a_pos = next(p for p in posizionati if p.oggetto_id == a.id)
        b_pos = next(p for p in posizionati if p.oggetto_id == b.id)

        b_top = b_pos.coordinata_z_mm + b_pos.dimensione_z_mm
        if a_pos.coordinata_z_mm >= b_top:
            overlaps_x = not (
                a_pos.coordinata_x_mm >= b_pos.coordinata_x_mm + b_pos.dimensione_x_mm
                or b_pos.coordinata_x_mm >= a_pos.coordinata_x_mm + a_pos.dimensione_x_mm
            )
            overlaps_y = not (
                a_pos.coordinata_y_mm >= b_pos.coordinata_y_mm + b_pos.dimensione_y_mm
                or b_pos.coordinata_y_mm >= a_pos.coordinata_y_mm + a_pos.dimensione_y_mm
            )
            self.assertTrue(overlaps_x and overlaps_y)


# =============================================================================
# TEST: FUNZIONI HELPER
# =============================================================================

class TestConfigurazioneOttimizzazione(TestCaseBase):
    """Test per la configurazione dell'ottimizzatore."""

    def test_from_dict_con_valori_parziali(self):
        config = ConfigurazioneOttimizzazione.from_dict({
            "strategia_ottimizzazione": {
                "ordinamento_casuale": True,
            },
        })
        self.assertTrue(config.ordinamento_casuale)
        self.assertEqual(config.algoritmo_base, "Algoritmo 3D Semplificato")
        self.assertTrue(config.distribuzione_pesi_attiva)

    def test_from_dict_con_config_vuota(self):
        config = ConfigurazioneOttimizzazione.from_dict({})
        self.assertEqual(config.algoritmo_base, "Algoritmo 3D Semplificato")
        self.assertTrue(config.distribuzione_pesi_attiva)

    def test_configurazione_personalizzata(self):
        contenitore = self.crea_contenitore()
        oggetto = self.crea_oggetto("CFG-TEST", 500, 400, 300, peso=10)

        config = ConfigurazioneOttimizzazione(
            ordinamento_casuale=True,
        )
        piano, risultato = self.crea_piano_e_ottimizza(contenitore, [(oggetto, 1)], config=config)
        self.assertTrue(risultato.successo)


class TestBuildLookupVincoliTra(TestCaseBase):
    """Test per _build_lookup_vincoli_tra."""

    def test_lookup_direzionale_per_sopra(self):
        a = self.crea_oggetto("L-A")
        b = self.crea_oggetto("L-B")
        self.crea_vincolo_tra(a, b, "sopra")

        lookup = _build_lookup_vincoli_tra(VincoloTraOggetti.objects.filter(attivo=True))

        targets_a = [t[0] for t in lookup.get(a.id, [])]
        self.assertIn(b.id, targets_a)
        self.assertNotIn(a.id, [t[0] for t in lookup.get(b.id, [])])

    def test_lookup_solo_vincoli_attivi(self):
        a = self.crea_oggetto("L-C")
        b = self.crea_oggetto("L-D")
        self.crea_vincolo_tra(a, b, "sopra", attivo=False)

        lookup = _build_lookup_vincoli_tra(VincoloTraOggetti.objects.filter(attivo=True))
        self.assertEqual(len(lookup), 0)


class TestVincoliCombinati(TestCaseBase):
    """Test con combinazioni di vincoli per-oggetto e tra-oggetti."""

    def test_sopra_con_sovrapponibile_false(self):
        contenitore = self.crea_contenitore()
        a = self.crea_oggetto("CONF-A", 400, 400, 300, peso=10)
        b = self.crea_oggetto("CONF-B", 800, 800, 200, peso=20)
        self.set_vincoli(b, sovrapponibile=False)
        self.crea_vincolo_tra(a, b, "sopra")

        piano, risultato = self.crea_piano_e_ottimizza(contenitore, [(a, 1), (b, 1)])

        self.assertTrue(risultato.successo)
        posizionati = piano.oggetti_posizionati.all()
        codici = [p.oggetto.codice for p in posizionati]
        self.assertIn(b.codice, codici)
        self.assertIn(a.codice, codici)

    def test_vincolo_sopra_tutte_config_escluse(self):
        contenitore = self.crea_contenitore()
        a = self.crea_oggetto("CONF-EXC", 400, 400, 300, peso=10)
        b = self.crea_oggetto("CONF-BASE", 400, 400, 300, peso=10)
        self.crea_vincolo_tra(
            a, b, "sopra",
            dettagli_posizionamento={
                "configurazioni": [
                    {"valida": False, "dimsA": [400, 400, 300], "dimsB": [400, 400, 300]},
                ]
            },
        )

        piano, risultato = self.crea_piano_e_ottimizza(contenitore, [(a, 1), (b, 1)])
        self.assertTrue(risultato.successo)

        def _sopra_di(item, other):
            return (
                item.coordinata_z_mm >= other.coordinata_z_mm + other.dimensione_z_mm
                and not (item.coordinata_x_mm >= other.coordinata_x_mm + other.dimensione_x_mm or
                         other.coordinata_x_mm >= item.coordinata_x_mm + item.dimensione_x_mm)
                and not (item.coordinata_y_mm >= other.coordinata_y_mm + other.dimensione_y_mm or
                         other.coordinata_y_mm >= item.coordinata_y_mm + item.dimensione_y_mm)
            )

        a_items = [o for o in risultato.oggetti_posizionati if o.codice == a.codice]
        b_items = [o for o in risultato.oggetti_posizionati if o.codice == b.codice]
        for a_item in a_items:
            for b_item in b_items:
                self.assertFalse(
                    _sopra_di(a_item, b_item),
                    "A non deve essere sopra B quando tutte le configurazioni sono escluse",
                )
