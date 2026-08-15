"""
Test suite per il sistema di ottimizzazione carico 3D (Algoritmo 3D Semplificato).

Copre:
- VincoloOggetto: rotazioni, sovrapponibilità, peso massimo tetto, solo su piano
- VincoloTraOggetti: sopra
- ConfigurazioneOttimizzazione
- Rotazioni TreDPacker
"""

import copy
import random
import tempfile
from datetime import timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import RequestFactory, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from caricamento.client_ip import get_client_ip
from caricamento.views import _check_demo_abuse, _save_demo_fingerprints

from caricamento.engine.common import (
    ConfigurazioneOttimizzazione,
    ItemPacked,
    _build_lookup_vincoli_tra,
)
from caricamento.models import (
    Contenitore,
    ImpostazioniSistema,
    Oggetto,
    OggettoDaCaricare,
    PianoDiCarico,
    UserProfile,
    VincoloOggetto,
    VincoloTraOggetti,
)

from caricamento.engine.tre_d.packer_3d_v2 import (
    Obj,
    _prova_tutte_orientazioni,
    _trova_singoli_interni,
    _piazza_deferiti_in_coda,
    load_truck_v2,
)
from caricamento.engine.orchestratore_tre_d import (
    _piano_e_parziale,
    esegui_ottimizzazione_tre_d,
)
from caricamento.engine.tre_d.data_adapter import _carica_vincoli_sopra
from caricamento.engine.tre_d.geometry import (
    center_of_mass,
    compute_overhang,
    intersection_area,
    point_inside,
    rect,
)
from caricamento.engine.tre_d.placement_rules import (
    can_stack,
    check_z_collision,
)
from caricamento.engine.tre_d.postprocessing import (
    defer_singles,
    find_internal_singles,
    has_object_above,
    has_object_ahead,
    place_singles_at_end,
)
from caricamento.engine.tre_d.constraints import (
    column_contains,
    evaluate_relational_constraint,
)
from caricamento.engine.tre_d.strategies import (
    BacktrackingStrategy,
    DeterministicStrategy,
    HybridStrategy,
    MonteCarloStrategy,
    strategy_for_config,
)
from caricamento.engine.tre_d.group_optimizer import (
    _compactness_key,
    _score,
    _group_is_relational,
    _relational_block_valid,
    _relational_blocks,
    candidate_rotation_counts,
)
from caricamento.engine.tre_d.tre_d_packer import TreDPacker
from caricamento.engine.tre_d.random_packer import run_packing_random


# =============================================================================
# TEST: FACTORY STRATEGIE
# =============================================================================

class TestStrategyFactory(TestCase):
    def test_seleziona_deterministica(self):
        config = ConfigurazioneOttimizzazione()
        self.assertIsInstance(strategy_for_config(config), DeterministicStrategy)

    def test_seleziona_monte_carlo(self):
        config = ConfigurazioneOttimizzazione(ordinamento_casuale=True)
        strategia = strategy_for_config(config)
        self.assertIsInstance(strategia, MonteCarloStrategy)
        self.assertEqual(strategia.num_restarts, 20)

    def test_seleziona_backtracking(self):
        config = ConfigurazioneOttimizzazione(backtracking_avanzato=True)
        self.assertIsInstance(strategy_for_config(config), BacktrackingStrategy)

    def test_seleziona_ibrida(self):
        config = ConfigurazioneOttimizzazione(
            ordinamento_casuale=True,
            backtracking_avanzato=True,
        )
        self.assertIsInstance(strategy_for_config(config), HybridStrategy)

    def test_tredpacker_delega_alla_strategy_selezionata(self):
        oggetto = Oggetto.objects.create(
            owner=User.objects.create_user(username="strategy-owner"),
            codice="STRATEGY-TEST",
            lunghezza_mm=800,
            larghezza_mm=800,
            altezza_mm=800,
            peso_kg=Decimal("10"),
            quantita_disponibile=1,
        )
        config = ConfigurazioneOttimizzazione(
            ordinamento_casuale=True,
            backtracking_avanzato=True,
            compattazione_aggressiva=True,
        )
        risultato_obj = Obj(
            "STRATEGY-TEST-0", 80, 80, 80, oggetto_id=oggetto.pk
        )
        risultato_obj._peso_kg = 10.0
        strategia = Mock()
        strategia.execute.return_value = [risultato_obj]

        packer = TreDPacker(
            bin_dimensioni=(2000, 2000, 2000),
            peso_max_kg=1000,
            configurazione=config,
        )
        packer.aggiungi_oggetto(oggetto)

        with patch(
            "caricamento.engine.tre_d.tre_d_packer.strategy_for_config",
            return_value=strategia,
        ) as factory:
            packer.esegui()

        factory.assert_called_once_with(config)
        strategia.execute.assert_called_once()
        args, kwargs = strategia.execute.call_args
        self.assertEqual(args[1], {})
        self.assertEqual(args[2], (200, 200, 200))
        self.assertIs(kwargs["tracker"], None)
        self.assertTrue(kwargs["compattazione_aggressiva"])
        self.assertEqual(len(packer.results), 1)
        self.assertEqual(packer.results[0].codice, oggetto.codice)

    def test_adattatori_eseguono_e_non_duplicano_istanze(self):
        def make_objects():
            return [
                Obj("A-0", 80, 80, 80, oggetto_id=1),
                Obj("B-0", 70, 70, 70, oggetto_id=2),
            ]

        strategie = [
            DeterministicStrategy(),
            MonteCarloStrategy(num_restarts=1),
            BacktrackingStrategy(iterations=1),
            HybridStrategy(iterations=1, num_restarts=1),
        ]
        for strategia in strategie:
            with self.subTest(strategy=strategia.name):
                risultato = strategia.execute(
                    make_objects(),
                    {},
                    (500, 500, 500),
                )
                ids = [obj.id for obj in risultato if obj.z >= 0]
                self.assertIsInstance(risultato, list)
                self.assertEqual(len(ids), len(set(ids)))
                self.assertGreaterEqual(len(ids), 1)


class TestGroupOptimizer(TestCase):
    """Verifica le configurazioni locali senza coinvolgere MC o v3."""

    def test_piano_parziale_dipende_solo_dalle_istanze_mancanti(self):
        self.assertFalse(_piano_e_parziale(10, 10))
        self.assertTrue(_piano_e_parziale(10, 9))

    def test_vincoli_o_priorita_non_rendono_parziale_un_piano_completo(self):
        # La validazione dei vincoli/priorità è un report separato: con tutte
        # le istanze posizionate il piano non è parziale.
        self.assertFalse(_piano_e_parziale(4, 4))

    def test_configurazioni_dipendono_dalla_capacita_y(self):
        # I05: 3 pezzi originali per Y, 4 dopo la rotazione.
        self.assertEqual(
            candidate_rotation_counts(19, 60, 80, (1360, 248, 270)),
            [4, 8],
        )
        # I02: 2 pezzi originali per Y, 3 dopo la rotazione.
        self.assertEqual(
            candidate_rotation_counts(18, 80, 120, (1360, 248, 270)),
            [3, 6],
        )
        # I01: la rotazione non aumenta le righe Y, quindi nessuna variante.
        self.assertEqual(
            candidate_rotation_counts(13, 100, 120, (1360, 248, 270)),
            [],
        )

    def test_quantita_piccola_non_forza_un_blocco_completo(self):
        self.assertEqual(
            candidate_rotation_counts(2, 60, 80, (1360, 248, 270)),
            [2],
        )

    def test_auto_vincolo_non_esclude_il_gruppo_ma_vincolo_tra_codici_si(self):
        self.assertFalse(
            _group_is_relational((7,), {7: {7: None}})
        )
        self.assertTrue(
            _group_is_relational((7,), {7: {8: None}})
        )
        self.assertTrue(
            _group_is_relational((8,), {7: {8: None}})
        )

    def test_deterministica_usa_il_modulo_dei_gruppi(self):
        objects = [
            Obj("GROUP-0", 60, 80, 100, oggetto_id=1),
            Obj("GROUP-1", 60, 80, 100, oggetto_id=1),
        ]
        with patch(
            "caricamento.engine.tre_d.strategies.deterministic.optimize_deterministic_groups",
            return_value=objects,
        ) as optimizer:
            result = DeterministicStrategy().execute(
                objects, {}, (1360, 248, 270)
            )

        optimizer.assert_called_once()
        self.assertIs(result, objects)

    def test_auto_vincolo_consente_blocco_ruotato_validato(self):
        objects = [
            Obj(
                f"SELF-{index}",
                60,
                80,
                100,
                oggetto_id=7,
                rotazione_su_x=False,
                rotazione_su_y=False,
                rotazione_su_z=True,
            )
            for index in range(4)
        ]
        result = DeterministicStrategy().execute(
            objects, {7: {7: None}}, (500, 120, 200)
        )
        fitted = [obj for obj in result if obj.z >= 0]

        self.assertEqual(len(fitted), 4)
        self.assertLessEqual(max(obj.x + obj.width for obj in fitted), 160)
        self.assertTrue(
            any((obj.width, obj.depth) == (80, 60) for obj in fitted)
        )
        self.assertTrue(
            any(obj.z == 100 for obj in fitted),
            "L'auto-vincolo deve lasciare almeno una coppia impilata.",
        )

    def test_colonna_cross_ruotata_mantiene_allineamento_e_vincolo(self):
        base = Obj(
            "BASE-0", 100, 120, 100, oggetto_id=1,
            rotazione_su_x=False, rotazione_su_y=False, rotazione_su_z=True,
        )
        top = Obj(
            "TOP-0", 80, 120, 100, oggetto_id=2,
            rotazione_su_x=False, rotazione_su_y=False, rotazione_su_z=True,
        )
        base.x = top.x = 0
        base.y = top.y = 0
        base.z = 0
        top.z = 100
        self.assertTrue(
            _relational_block_valid(
                [base, top],
                (base.id, top.id),
                {2: {1: None}},
            )
        )

        top.y = 10
        self.assertFalse(
            _relational_block_valid(
                [base, top],
                (base.id, top.id),
                {2: {1: None}},
            )
        )

    def test_compattezza_preferisce_fasce_y_regolari(self):
        ordinato = [
            Obj(f"O-{index}", 60, 80, 100, oggetto_id=1)
            for index in range(3)
        ]
        frammentato = [
            Obj(f"F-{index}", 60, 80, 100, oggetto_id=1)
            for index in range(3)
        ]
        for obj, y in zip(ordinato, (0, 80, 160)):
            obj.x, obj.y, obj.z = 0, y, 0
        for obj, y in zip(frammentato, (0, 60, 160)):
            obj.x, obj.y, obj.z = 0, y, 0

        self.assertLess(
            _compactness_key(ordinato),
            _compactness_key(frammentato),
        )

    def test_score_completo_preferisce_layout_compatto(self):
        ordinato = [
            Obj(f"S-{index}", 60, 80, 100, oggetto_id=1)
            for index in range(2)
        ]
        frammentato = [
            Obj("T-0", 80, 60, 100, oggetto_id=1),
            Obj("T-1", 60, 80, 100, oggetto_id=1),
        ]
        for obj, y in zip(ordinato, (0, 80)):
            obj.x, obj.y, obj.z = 0, y, 0
        for obj, y in zip(frammentato, (0, 60)):
            obj.x, obj.y, obj.z = 0, y, 0

        self.assertGreater(
            _score(ordinato, (500, 200, 200), ordinato),
            _score(frammentato, (500, 200, 200), frammentato),
        )

    def test_compattezza_penalizza_orientamenti_misti(self):
        uniforme = [
            Obj(f"U-{index}", 60, 80, 100, oggetto_id=1)
            for index in range(2)
        ]
        misto = [
            Obj("M-0", 80, 60, 100, oggetto_id=1),
            Obj("M-1", 60, 80, 100, oggetto_id=1),
        ]
        for obj, y in zip(uniforme, (0, 80)):
            obj.x, obj.y, obj.z = 0, y, 0
        for obj, y in zip(misto, (0, 60)):
            obj.x, obj.y, obj.z = 0, y, 0

        self.assertLess(
            _compactness_key(uniforme),
            _compactness_key(misto),
        )

    def test_blocco_cross_reale_viene_rilevato_dalla_colonna(self):
        base = Obj(
            "BASE-0", 100, 120, 100, oggetto_id=1,
            rotazione_su_x=False, rotazione_su_y=False, rotazione_su_z=True,
        )
        top = Obj(
            "TOP-0", 80, 120, 100, oggetto_id=2,
            rotazione_su_x=False, rotazione_su_y=False, rotazione_su_z=True,
        )
        base.x = top.x = 0
        base.y = top.y = 0
        base.z = 0
        top.z = 100
        blocks = _relational_blocks([base, top], {2: {1: None}})
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0][0], ("BASE-0", "TOP-0"))

    def test_blocco_ruotato_viene_accettato_solo_se_migliora_x(self):
        # Con Y=120 l'orientamento 60x80 crea una sola riga, mentre 80x60
        # ne crea due: quattro pezzi passano da quattro colonne a due.
        objects = [
            Obj(
                f"BLOCK-{index}",
                60,
                80,
                100,
                oggetto_id=7,
                rotazione_su_x=False,
                rotazione_su_y=False,
                rotazione_su_z=True,
            )
            for index in range(4)
        ]
        result = DeterministicStrategy().execute(
            objects, {}, (500, 120, 100)
        )
        fitted = [obj for obj in result if obj.z >= 0]

        self.assertEqual(len(fitted), 4)
        self.assertLessEqual(max(obj.x + obj.width for obj in fitted), 160)
        self.assertTrue(
            all((obj.width, obj.depth) == (80, 60) for obj in fitted)
        )


class TestRiempimentoFasce(TestCase):
    """Regressione sul riempimento Y/Z prima dell'avanzamento su X."""

    def test_carico_reale_trova_una_disposizione_compatta(self):
        """Il carico del piano reale non deve terminare con una coda lunga.

        Le dimensioni sono quelle del piano 348, espresse in cm. Con tutti
        gli oggetti richiesti e 20 restart, la soluzione deve caricare tutto
        e chiudere la lunghezza entro 12,20 m nel caso deterministico.
        """
        dati = [
            ("CART-I03", 160, 70, 100, 9, 3),
            ("CART-I01", 120, 100, 100, 13, 1),
            ("CART-I02", 120, 80, 100, 18, 2),
            ("cart-i05", 60, 80, 100, 17, 5),
        ]
        objects = []
        for codice, width, depth, height, quantita, oggetto_id in dati:
            for indice in range(quantita):
                objects.append(
                    Obj(
                        f"{codice}-{indice}",
                        width,
                        depth,
                        height,
                        oggetto_id=oggetto_id,
                        orientation_allowed=True,
                        rotazione_su_x=False,
                        rotazione_su_y=False,
                        rotazione_su_z=True,
                    )
                )

        # I vincoli auto-referenziali riproducono il coinvolgimento dei codici
        # nei vincoli relazionali del piano senza imporre coppie tra tipi.
        vincoli_sopra = {
            oggetto_id: {oggetto_id: None}
            for oggetto_id in (1, 2, 3, 5)
        }
        stato_random = random.getstate()
        try:
            random.seed(0)
            risultato = run_packing_random(
                objects,
                vincoli_sopra=vincoli_sopra,
                num_restarts=20,
                container_dim=(1360, 248, 270),
            )
        finally:
            random.setstate(stato_random)

        posizionati = [obj for obj in risultato if obj.z >= 0]
        self.assertEqual(len(posizionati), 57)
        self.assertEqual(len([obj for obj in risultato if obj.z < 0]), 0)
        self.assertLessEqual(
            max(obj.x + obj.width for obj in posizionati),
            1220,
            "Il riempimento Y/Z deve evitare una coda X inutilmente lunga.",
        )


# =============================================================================
# TEST: GEOMETRIA PURA
# =============================================================================

class TestGeometry(TestCase):
    """Regressioni per le primitive geometriche indipendenti dal packer."""

    def test_rettangolo_intersezione_e_centro(self):
        obj = Obj("A", 80, 120, 100, oggetto_id=1)
        obj.x, obj.y = 10, 20
        base = Obj("B", 70, 160, 100, oggetto_id=2)
        base.x, base.y = 0, 0

        self.assertEqual(
            rect(obj),
            {"x1": 10, "x2": 90, "y1": 20, "y2": 140},
        )
        self.assertEqual(intersection_area(rect(obj), rect(base)), 60 * 120)
        self.assertEqual(center_of_mass(obj), (50, 80))

    def test_sbalzo_e_punto_nel_rettangolo(self):
        obj = Obj("A", 80, 120, 100, oggetto_id=1)
        obj.x, obj.y = 10, 0
        base = Obj("B", 70, 160, 100, oggetto_id=2)
        base.x, base.y = 0, 0

        self.assertEqual(compute_overhang(rect(obj), rect(base)), 20)
        self.assertTrue(point_inside(50, 60, rect(base)))
        self.assertFalse(point_inside(80, 60, rect(base)))


# =============================================================================
# TEST: REGOLE DI POSIZIONAMENTO PURE
# =============================================================================

class TestPlacementRules(TestCase):
    """Regressioni per stacking e collisione indipendenti dalla strategia."""

    def test_can_stack_rispetta_area_e_supporto(self):
        base = Obj("BASE", 100, 100, 100, oggetto_id=1)
        base.x = base.y = base.z = 0
        sopra = Obj("SOPRA", 80, 80, 100, oggetto_id=2)
        sopra.x = sopra.y = 0
        sopra.z = 100

        self.assertTrue(can_stack(sopra, base))
        self.assertEqual(sopra.support_ratio, 1.0)

        troppo_grande = Obj("GRANDE", 120, 100, 100, oggetto_id=3)
        troppo_grande.x = troppo_grande.y = 0
        self.assertFalse(can_stack(troppo_grande, base))

    def test_can_stack_rispetta_fragilita_e_sovrapponibilita(self):
        base = Obj("BASE", 100, 100, 100, oggetto_id=1, fragile=True)
        sopra = Obj("SOPRA", 80, 80, 100, oggetto_id=2)
        self.assertFalse(can_stack(sopra, base))

        base.fragile = False
        base.sovrapponibile = False
        self.assertFalse(can_stack(sopra, base))

    def test_collisione_3d_distinta_dal_contatto_sovrapposto(self):
        base = Obj("BASE", 100, 100, 100, oggetto_id=1)
        base.x = base.y = base.z = 0
        sovrapposto = Obj("SOVRAPPOSTO", 50, 50, 50, oggetto_id=2)
        sovrapposto.x = sovrapposto.y = 10
        sovrapposto.z = 50
        self.assertTrue(check_z_collision(sovrapposto, [base]))

        affiancato = Obj("AFFIANCATO", 50, 50, 50, oggetto_id=3)
        affiancato.x, affiancato.y, affiancato.z = 100, 0, 0
        self.assertFalse(check_z_collision(affiancato, [base]))


# =============================================================================
# TEST: VINCOLI RELAZIONALI ISOLATI
# =============================================================================

class TestPostprocessingRules(TestCase):
    """Regressioni per il rilevamento dei singoli e delle fasce terminali."""

    def test_rileva_singolo_interno_indipendentemente_dai_vincoli(self):
        interno = Obj("INTERNO", 100, 100, 100, oggetto_id=1)
        interno.x = interno.y = interno.z = 0
        terminale = Obj("TERMINALE", 100, 100, 100, oggetto_id=2)
        terminale.x, terminale.y, terminale.z = 200, 0, 0

        self.assertFalse(has_object_above([interno, terminale], interno, 270))
        self.assertTrue(has_object_ahead([interno, terminale], interno))
        self.assertEqual(
            find_internal_singles([interno, terminale], 270, {1: {1: set()}}),
            ["INTERNO"],
        )

    def test_oggetto_nella_fascia_terminale_non_e_interno(self):
        primo = Obj("PRIMO", 100, 100, 100, oggetto_id=1)
        primo.x = primo.y = primo.z = 0
        affiancato = Obj("AFFIANCATO", 100, 100, 100, oggetto_id=2)
        affiancato.x, affiancato.y, affiancato.z = 200, 100, 0

        self.assertFalse(has_object_ahead([primo, affiancato], affiancato))
        self.assertEqual(find_internal_singles([primo, affiancato], 270), ["PRIMO"])

    def test_piazzamento_singoli_usa_callback_e_preserva_integrita(self):
        terminale = Obj("TERMINALE", 100, 100, 100, oggetto_id=1)
        terminale.x = terminale.y = terminale.z = 200
        singolo = Obj("SINGOLO", 80, 80, 100, oggetto_id=2)
        singolo.x = singolo.y = singolo.z = 0
        for obj in (terminale, singolo):
            obj._peso_kg = 1

        def try_orientations(obj, x, y, z, placed, container_dim, constraints, **kwargs):
            obj.x, obj.y, obj.z = x, y, z
            return True

        placed = [terminale, singolo]
        place_singles_at_end(
            placed,
            (500, 500, 270),
            {},
            None,
            try_orientations,
        )
        self.assertEqual({obj.id for obj in placed}, {"TERMINALE", "SINGOLO"})
        self.assertEqual(len({obj.id for obj in placed}), 2)

    def test_piazzamento_singoli_non_scarta_rotazione_valida(self):
        terminale = Obj("TERMINALE-ROT", 40, 100, 100, oggetto_id=1)
        terminale.x, terminale.y, terminale.z = 200, 0, 0
        singolo = Obj("SINGOLO-ROT", 100, 40, 100, oggetto_id=2)
        singolo.x = singolo.y = singolo.z = 0

        def try_orientations(obj, x, y, z, placed, container_dim, constraints, **kwargs):
            # Il callback simula il controllo reale: solo l'orientamento
            # ruotato 40x100 entra nella fascia terminale disponibile.
            if x + obj.width > container_dim[0] or y + obj.depth > container_dim[1]:
                if obj.width == 100 and obj.depth == 40:
                    obj.width, obj.depth = 40, 100
                else:
                    return False
            if x + obj.width <= container_dim[0] and y + obj.depth <= container_dim[1]:
                obj.x, obj.y, obj.z = x, y, z
                return True
            return False

        placed = [terminale, singolo]
        self.assertTrue(
            place_singles_at_end(
                placed, (280, 100, 270), {}, None, try_orientations
            )
        )
        self.assertEqual({obj.id for obj in placed}, {"TERMINALE-ROT", "SINGOLO-ROT"})

    def test_postprocessing_peggiorativo_viene_ripristinato(self):
        """Una riparazione che allunga X non deve sostituire il packing base."""
        oggetti = [
            Obj("BASE-0", 100, 100, 100, oggetto_id=1),
            Obj("BASE-1", 100, 100, 100, oggetto_id=2),
        ]
        risultato_base = load_truck_v2(
            copy.deepcopy(oggetti),
            vincoli_sopra={},
            container_dim=(500, 500, 270),
            preserve_order=True,
            _run_postprocessing=False,
        )
        coordinate_base = {
            obj.id: (obj.x, obj.y, obj.z, obj.width, obj.depth, obj.height)
            for obj in risultato_base
        }

        def peggiora_x(placed, *args, **kwargs):
            placed[0].x += 1000

        with patch(
            "caricamento.engine.tre_d.packer_3d_v2._deferral_pass",
            side_effect=peggiora_x,
        ), patch(
            "caricamento.engine.tre_d.packer_3d_v2._riempi_buchi_sicuro",
            return_value=True,
        ):
            risultato = load_truck_v2(
                copy.deepcopy(oggetti),
                vincoli_sopra={},
                container_dim=(500, 500, 270),
                preserve_order=True,
            )

        self.assertEqual(
            {
                obj.id: (obj.x, obj.y, obj.z, obj.width, obj.depth, obj.height)
                for obj in risultato
            },
            coordinate_base,
        )


class TestConstraintRules(TestCase):
    """Verifica gli stati assente, valido, escluso e in colonna."""

    def _base_pair(self):
        base = Obj("BASE", 70, 160, 100, oggetto_id=3)
        base.x = base.y = base.z = 0
        sopra = Obj("SOPRA", 80, 120, 100, oggetto_id=2)
        sopra.x = sopra.y = 0
        sopra.z = 100
        return sopra, base

    def test_relazione_assente_lascia_regole_standard(self):
        sopra, base = self._base_pair()
        self.assertEqual(
            evaluate_relational_constraint(sopra, base, [base], {}),
            (True, False, None),
        )

    def test_configurazione_valida_autorizza_solo_match(self):
        sopra, base = self._base_pair()
        validi = {((80, 120, 100), (70, 160, 100))}
        self.assertEqual(
            evaluate_relational_constraint(
                sopra, base, [base], {2: {3: validi}}
            ),
            (True, True, validi),
        )

    def test_configurazione_esclusa_blocca(self):
        sopra, base = self._base_pair()
        self.assertEqual(
            evaluate_relational_constraint(
                sopra, base, [base], {2: {3: set()}}
            ),
            (False, False, None),
        )

    def test_relazione_valida_trovata_nella_colonna(self):
        fondo = Obj("FONDO", 100, 100, 100, oggetto_id=1)
        fondo.x = fondo.y = fondo.z = 0
        base = Obj("BASE", 100, 100, 100, oggetto_id=3)
        base.x = base.y = 0
        base.z = 100
        sopra = Obj("SOPRA", 80, 80, 100, oggetto_id=2)
        sopra.x = sopra.y = 0
        sopra.z = 200

        self.assertTrue(column_contains([fondo, base], base, 1))
        allowed, relational, _ = evaluate_relational_constraint(
            sopra, base, [fondo, base], {2: {1: None}}
        )
        self.assertTrue(allowed)
        self.assertTrue(relational)

    def test_configurazione_in_colonna_confronta_la_base_richiesta(self):
        fondo = Obj("FONDO", 70, 160, 100, oggetto_id=1)
        fondo.x = fondo.y = fondo.z = 0
        intermedio = Obj("INTERMEDIO", 100, 100, 100, oggetto_id=3)
        intermedio.x = intermedio.y = 0
        intermedio.z = 100
        sopra = Obj("SOPRA", 80, 120, 100, oggetto_id=2)
        sopra.x = sopra.y = 0
        sopra.z = 200
        validi = {((80, 120, 100), (70, 160, 100))}

        allowed, relational, details = evaluate_relational_constraint(
            sopra, intermedio, [fondo, intermedio], {2: {1: validi}}
        )
        self.assertTrue(allowed)
        self.assertTrue(relational)
        self.assertEqual(details, validi)

        vietati = {((80, 120, 100), (80, 120, 100))}
        self.assertEqual(
            evaluate_relational_constraint(
                sopra, intermedio, [fondo, intermedio], {2: {1: vietati}}
            ),
            (False, False, None),
        )


# =============================================================================
# HELPERS per i test
# =============================================================================

class TestCaseBase(TestCase):
    """Base con metodi helper per creare dati di test rapidamente."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="owner-{}".format(self._testMethodName),
            password="test-password",
        )

    def crea_contenitore(self, nome="Test Box", x=2000, y=2000, z=2000, peso=5000):
        return Contenitore.objects.create(
            owner=self.user,
            nome=nome,
            lunghezza_mm=x,
            larghezza_mm=y,
            altezza_mm=z,
            carico_massimo_kg=Decimal(str(peso)),
        )

    def crea_oggetto(self, codice, x=500, y=400, z=300, peso=20, qta=1):
        return Oggetto.objects.create(
            owner=self.user,
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
            owner=self.user,
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

class TestDeferimentoSingoliInterni(TestCase):
    """Verifica che un singolo interno liberi lo spazio per il ripacking."""

    def test_singolo_interno_viene_identificato_e_messo_in_coda(self):
        singolo = Obj("SINGOLO-0", 100, 100, 100, oggetto_id=1)
        altro = Obj("ALTRO-0", 100, 100, 100, oggetto_id=2)
        singolo.x, singolo.y, singolo.z = 0, 0, 0
        altro.x, altro.y, altro.z = 200, 0, 0

        self.assertEqual(
            _trova_singoli_interni([singolo, altro], 200, {}),
            ["SINGOLO-0"],
        )

        deferred = Obj("SINGOLO-0", 100, 100, 100, oggetto_id=1)
        deferred._peso_kg = 1
        placed = [copy.deepcopy(altro)]
        self.assertTrue(
            _piazza_deferiti_in_coda(
                placed,
                [deferred],
                (1000, 1000, 200),
                {},
            )
        )
        self.assertEqual(placed[-1].x, 200)

    def test_carico_reale_deferisce_il_singolo_i05_in_coda(self):
        """Il caso 20/8/13/19 non deve lasciare un singolo I05 interno."""
        dati = [
            ("CART-I03", 70, 160, 20, 3),
            ("CART-I01", 100, 120, 8, 1),
            ("CART-I02", 80, 120, 13, 2),
            ("cart-i05", 60, 80, 19, 5),
        ]
        objects = []
        for codice, width, depth, quantita, oggetto_id in dati:
            for indice in range(quantita):
                objects.append(
                    Obj(
                        f"{codice}-{indice}",
                        width,
                        depth,
                        100,
                        oggetto_id=oggetto_id,
                    )
                )

        risultato = load_truck_v2(
            objects,
            vincoli_sopra={},
            container_dim=(1360, 248, 270),
            preserve_order=True,
        )
        posizionati, non_posizionati = (
            [obj for obj in risultato if obj.z >= 0],
            [obj for obj in risultato if obj.z < 0],
        )

        self.assertEqual(len(posizionati), 60)
        self.assertEqual(non_posizionati, [])
        self.assertEqual(_trova_singoli_interni(posizionati, 270, {}), [])

        singolo_i05 = next(obj for obj in posizionati if obj.id == "cart-i05-18")
        max_x_iniziale = max(obj.x for obj in posizionati)
        self.assertEqual(
            singolo_i05.x,
            max_x_iniziale,
            "Il singolo I05 deve stare nella fascia X terminale, non nel mezzo.",
        )
        # Nel caso reale il singolo viene affiancato in Y alla fascia finale;
        # quindi non deve essere semplicemente accodato dopo la fine del
        # rettangolo più largo.
        self.assertEqual(singolo_i05.y, 0)

    def test_vincoli_tra_tutti_i_tipi_non_bloccano_il_deferimento(self):
        """Regressione: con vincoli 'sopra' su TUTTI i tipi (caso reale),
        il singolo interno deve essere comunque rilevato e deferito.

        In precedenza _trova_singoli_interni escludeva ogni oggetto
        coinvolto in vincoli tra oggetti: nel caso reale tutti i tipi
        hanno almeno un vincolo 'sopra', quindi il deferimento non
        partiva mai e il buco restava nel mezzo del carico.
        """
        dati = [
            ("CART-I03", 70, 160, 20, 3),
            ("CART-I01", 100, 120, 8, 1),
            ("CART-I02", 80, 120, 13, 2),
            ("cart-i05", 60, 80, 19, 5),
        ]
        objects = []
        for codice, width, depth, quantita, oggetto_id in dati:
            for indice in range(quantita):
                objects.append(
                    Obj(
                        f"{codice}-{indice}",
                        width,
                        depth,
                        100,
                        oggetto_id=oggetto_id,
                    )
                )

        # Come nel caso reale: ogni tipo è coinvolto in un vincolo 'sopra'
        # (auto-riferito con dettagli validi). Tutti gli oggetto_id quindi
        # finivano in ids_con_vincoli e il vecchio codice non deferiva nulla.
        # Struttura dettagli: set di coppie ((dimsA), (dimsB)).
        vincoli_sopra = {}
        for o_id, dims in [(3, (70, 160, 100)), (1, (100, 120, 100)),
                           (2, (80, 120, 100)), (5, (60, 80, 100))]:
            w, d, h = dims
            vincoli_sopra[o_id] = {
                o_id: {((w, d, h), (w, d, h)), ((d, w, h), (d, w, h))}
            }

        # Anche con vincoli non vuoti, il singolo deve essere rilevato
        singolo_test = Obj("S-0", 60, 80, 100, oggetto_id=5)
        singolo_test.x, singolo_test.y, singolo_test.z = 0, 0, 0
        altro_test = Obj("A-0", 100, 120, 100, oggetto_id=1)
        altro_test.x, altro_test.y, altro_test.z = 200, 0, 0
        self.assertNotEqual(
            _trova_singoli_interni(
                [singolo_test, altro_test],
                270,
                vincoli_sopra,
            ),
            [],
        )

        risultato = load_truck_v2(
            objects,
            vincoli_sopra=vincoli_sopra,
            container_dim=(1360, 248, 270),
            preserve_order=True,
        )
        posizionati = [obj for obj in risultato if obj.z >= 0]

        self.assertEqual(len(posizionati), 60)
        self.assertEqual(
            _trova_singoli_interni(posizionati, 270, vincoli_sopra),
            [],
            "Nessun singolo deve restare interno anche con vincoli su tutti i tipi",
        )

        singolo_i05 = next(obj for obj in posizionati if obj.id == "cart-i05-18")
        max_x_iniziale = max(obj.x for obj in posizionati)
        self.assertEqual(
            singolo_i05.x,
            max_x_iniziale,
            "Il singolo I05 deve stare nella fascia X terminale anche con vincoli.",
        )
        # Il deferimento non deve violare il vincolo 'sopra': il singolo
        # resta a pavimento (z=0) nella coda.
        self.assertEqual(singolo_i05.z, 0)

    def test_deferimento_sequenziale_isolato_riempie_con_codice_successivo(self):
        """Un isolato viene accodato dopo aver ricomposto il suffisso."""
        oggetti = [
            Obj("A-0", 100, 100, 100, oggetto_id=1, sovrapponibile=False),
            Obj("B-0", 100, 100, 100, oggetto_id=2),
            Obj("B-1", 100, 100, 100, oggetto_id=2),
        ]
        risultato = load_truck_v2(
            oggetti,
            vincoli_sopra={},
            container_dim=(500, 100, 200),
            preserve_order=True,
        )
        posizionati = [obj for obj in risultato if obj.z >= 0]
        isolato = next(obj for obj in posizionati if obj.id == "A-0")
        successivi = [obj for obj in posizionati if obj.oggetto_id == 2]

        self.assertEqual(len(posizionati), 3)
        self.assertGreaterEqual(
            isolato.x,
            max(obj.x for obj in successivi),
            "L'isolato deve essere rimesso dopo il codice che ha riempito il buco.",
        )
        self.assertEqual(max(obj.x + obj.width for obj in posizionati), 200)

    def test_deferimento_fallito_continua_con_il_singolo_successivo(self):
        """Il rollback di A non deve impedire di tentare B."""
        a = Obj("A-0", 100, 100, 100, oggetto_id=1)
        b = Obj("B-0", 100, 100, 100, oggetto_id=2)
        c = Obj("C-0", 100, 100, 100, oggetto_id=3)
        a.x, a.y, a.z = 0, 0, 0
        b.x, b.y, b.z = 200, 0, 0
        c.x, c.y, c.z = 400, 0, 0
        placed = [a, b, c]

        def try_orientations(obj, x, y, z, current, container, constraints, **kwargs):
            if obj.id == "A-0" or z > 0:
                return False
            if any(
                other.z == 0
                and other.x < x + obj.width
                and x < other.x + other.width
                and other.y < y + obj.depth
                and y < other.y + other.depth
                for other in current
            ):
                return False
            obj.x, obj.y, obj.z = x, y, z
            return True

        def columns_info(current):
            return {
                (obj.x, obj.y): {
                    "z_top": obj.z + obj.height,
                    "top_item": obj,
                }
                for obj in current
            }

        def y_candidates(current, try_x, container_d):
            return [0]

        defer_singles(
            placed,
            [a, b, c],
            (600, 100, 200),
            {},
            None,
            try_orientations,
            columns_info,
            y_candidates,
            lambda current, obj: True,
        )

        self.assertEqual({obj.id for obj in placed}, {"A-0", "B-0", "C-0"})
        self.assertEqual(a.x, 0)
        self.assertEqual(len({obj.id for obj in placed}), 3)


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
        self.assertGreaterEqual(a_pos.coordinata_z_mm, b_top)
        overlaps_x = not (
            a_pos.coordinata_x_mm >= b_pos.coordinata_x_mm + b_pos.dimensione_x_mm
            or b_pos.coordinata_x_mm >= a_pos.coordinata_x_mm + a_pos.dimensione_x_mm
        )
        overlaps_y = not (
            a_pos.coordinata_y_mm >= b_pos.coordinata_y_mm + b_pos.dimensione_y_mm
            or b_pos.coordinata_y_mm >= a_pos.coordinata_y_mm + a_pos.dimensione_y_mm
        )
        self.assertTrue(overlaps_x and overlaps_y)

    def test_vincolo_sopra_deroga_area_e_sbalzo(self):
        """Un vincolo valido consente A sopra B anche se A ha area maggiore."""
        base = Obj("B-0", 120, 80, 100, oggetto_id=2)
        sopra = Obj("A-0", 120, 100, 100, oggetto_id=1)
        base.x, base.y, base.z = 0, 0, 0

        self.assertTrue(
            _prova_tutte_orientazioni(
                sopra,
                0,
                0,
                100,
                [base],
                (500, 500, 500),
                {1: {2: None}},
            ),
            "Il vincolo A sopra B deve prevalere sulla regola dell'area.",
        )

    def test_configurazione_esclusa_vieta_stacking_diretto(self):
        """Una configurazione esclusa non può ricadere nella regola area."""
        base = Obj("I03-0", 70, 160, 100, oggetto_id=3)
        sopra = Obj("I02-0", 80, 120, 100, oggetto_id=2)
        base.x, base.y, base.z = 0, 0, 0

        vincoli = {2: {3: set()}}
        self.assertFalse(
            _prova_tutte_orientazioni(
                sopra,
                0,
                0,
                100,
                [base],
                (500, 500, 500),
                vincoli,
            ),
            "Una coppia esplicitamente esclusa deve essere vietata.",
        )
        from caricamento.engine.tre_d.priority_policy import valida_vincoli_sopra
        sopra.x, sopra.y, sopra.z = 0, 0, 100
        self.assertFalse(
            valida_vincoli_sopra([sopra, base], [sopra, base], vincoli)["vincoli_completi"]
        )

    def test_configurazione_valida_e_esclusiva(self):
        """Con un vincolo dimensionale si accetta solo la combinazione valida."""
        base = Obj("I03-0", 70, 160, 100, oggetto_id=3)
        sopra = Obj("I02-0", 80, 120, 100, oggetto_id=2)
        base.x, base.y, base.z = 0, 0, 0
        vincoli = {
            2: {
                3: {
                    ((80, 120, 100), (70, 160, 100)),
                },
            },
        }

        self.assertTrue(
            _prova_tutte_orientazioni(
                sopra, 0, 0, 100, [base],
                (500, 500, 500), vincoli,
            )
        )

        altra_base = Obj("I03-1", 80, 120, 100, oggetto_id=3)
        altra_base.x, altra_base.y, altra_base.z = 0, 0, 0
        altro_sopra = Obj("I02-1", 70, 160, 100, oggetto_id=2)
        self.assertFalse(
            _prova_tutte_orientazioni(
                altro_sopra, 0, 0, 100, [altra_base],
                (500, 500, 500), vincoli,
            ),
            "Una dimensione non elencata nel vincolo non è autorizzata.",
        )
        from caricamento.engine.tre_d.priority_policy import valida_vincoli_sopra
        altro_sopra.x, altro_sopra.y, altro_sopra.z = 0, 0, 100
        self.assertFalse(
            valida_vincoli_sopra(
                [altro_sopra, altra_base],
                [altro_sopra, altra_base],
                vincoli,
            )["vincoli_completi"]
        )

    def test_assenza_vincolo_usa_regole_standard(self):
        """Senza relazione tra i codici resta attiva la regola dell'area."""
        base = Obj("I03-0", 70, 160, 100, oggetto_id=3)
        sopra = Obj("I02-0", 80, 120, 100, oggetto_id=2)
        base.x, base.y, base.z = 0, 0, 0

        self.assertTrue(
            _prova_tutte_orientazioni(
                sopra, 0, 0, 100, [base],
                (500, 500, 500), {},
            ),
            "In assenza di vincolo devono valere le regole geometriche standard.",
        )

    def test_z_positiva_senza_supporto_viene_rifiutata(self):
        """Nessuna modalità può accettare un oggetto volante."""
        volante = Obj("VOLANTE-0", 100, 100, 100, oggetto_id=1)

        for aggressiva in (False, True):
            self.assertFalse(
                _prova_tutte_orientazioni(
                    volante,
                    0,
                    0,
                    100,
                    [],
                    (500, 500, 500),
                    {},
                    compattazione_aggressiva=aggressiva,
                ),
                f"Un oggetto senza supporto non può essere accettato in modalità aggressiva={aggressiva}",
            )

    def test_compattazione_aggressiva_consente_stacking_traslato_con_80_percento(self):
        """Un vincolo A sopra A consente lo scostamento solo in aggressiva.

        Il caso riproduce n.11 sopra n.7: la traslazione lascia l'80% della
        base di A appoggiata su B e non collide con l'oggetto adiacente.
        """
        adiacente = Obj("I01-4", 100, 120, 100, oggetto_id=1)
        base = Obj("I01-7", 100, 120, 100, oggetto_id=1)
        sopra = Obj("I01-11", 100, 120, 100, oggetto_id=1)
        adiacente.x, adiacente.y, adiacente.z = 0, 0, 100
        base.x, base.y, base.z = 80, 0, 0

        vincoli = {1: {1: None}}
        self.assertFalse(
            _prova_tutte_orientazioni(
                sopra, 100, 0, 100, [adiacente, base],
                (500, 500, 500), vincoli,
                compattazione_aggressiva=False,
            )
        )
        self.assertTrue(
            _prova_tutte_orientazioni(
                sopra, 100, 0, 100, [adiacente, base],
                (500, 500, 500), vincoli,
                compattazione_aggressiva=True,
            )
        )
        self.assertEqual((sopra.x, sopra.y, sopra.z), (100, 0, 100))

    def test_compattazione_aggressiva_rifiuta_contatto_inferiore_al_50_percento(self):
        """La modalità aggressiva non accetta un appoggio relazionale del 49%."""
        base = Obj("I01-7", 100, 120, 100, oggetto_id=1)
        sopra = Obj("I01-11", 100, 120, 100, oggetto_id=1)
        base.x, base.y, base.z = 49, 0, 0

        self.assertFalse(
            _prova_tutte_orientazioni(
                sopra, 100, 0, 100, [base],
                (500, 500, 500), {1: {1: None}},
                compattazione_aggressiva=True,
            )
        )

    def test_stacking_senza_vincolo_rispetta_area(self):
        """Senza vincolo, un oggetto con area maggiore non può stare sopra."""
        base = Obj("B-0", 120, 80, 100, oggetto_id=2)
        sopra = Obj("A-0", 120, 100, 100, oggetto_id=1)
        base.x, base.y, base.z = 0, 0, 0

        self.assertFalse(
            _prova_tutte_orientazioni(
                sopra,
                0,
                0,
                100,
                [base],
                (500, 500, 500),
                {},
            )
        )


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

    def test_quantita_richiesta_superiore_alle_istanze_posizionate_rende_parziale(self):
        """Con quantita=2, una sola istanza salvata è un piano parziale."""
        contenitore = self.crea_contenitore()
        oggetto = self.crea_oggetto("REPORT-PARZIALE", 500, 400, 300, peso=10)
        piano = PianoDiCarico.objects.create(
            owner=self.user,
            nome="Quantita parziale",
            contenitore=contenitore,
        )
        OggettoDaCaricare.objects.create(
            piano_di_carico=piano,
            oggetto=oggetto,
            quantita=2,
        )

        item = ItemPacked(
            oggetto_id=oggetto.id,
            codice=oggetto.codice,
            coordinata_x_mm=0,
            coordinata_y_mm=0,
            coordinata_z_mm=0,
            dimensione_x_mm=500,
            dimensione_y_mm=400,
            dimensione_z_mm=300,
            rotazione_applicata="XYZ",
            peso_kg=Decimal("10"),
            colore="#4488ff",
        )
        packer = Mock()
        packer.results = [item]
        packer.unfitted_codes = [f"{oggetto.codice}-1"]
        packer.priority_report = {
            "priorita_completa": True,
            "vincoli": {"vincoli_completi": True},
        }
        packer.genera_metriche.return_value = {}

        with patch(
            "caricamento.engine.orchestratore_tre_d.TreDPacker",
            return_value=packer,
        ):
            risultato = esegui_ottimizzazione_tre_d(piano.id)

        piano.refresh_from_db()
        self.assertFalse(risultato.successo)
        self.assertEqual(piano.stato, "parziale")
        self.assertEqual(
            risultato.messaggio,
            "Piano parziale: 1 di 2 oggetti posizionati.",
        )

    def test_report_incompleto_non_rende_parziale_un_piano_completo(self):
        """Lo stato dipende dalle istanze, non dai report diagnostici."""
        contenitore = self.crea_contenitore()
        oggetto = self.crea_oggetto("REPORT-COMPLETO", 500, 400, 300, peso=10)
        piano = PianoDiCarico.objects.create(
            owner=self.user,
            nome="Report completo",
            contenitore=contenitore,
        )
        OggettoDaCaricare.objects.create(
            piano_di_carico=piano,
            oggetto=oggetto,
            quantita=1,
        )

        item = ItemPacked(
            oggetto_id=oggetto.id,
            codice=oggetto.codice,
            coordinata_x_mm=0,
            coordinata_y_mm=0,
            coordinata_z_mm=0,
            dimensione_x_mm=500,
            dimensione_y_mm=400,
            dimensione_z_mm=300,
            rotazione_applicata="XYZ",
            peso_kg=Decimal("10"),
            colore="#4488ff",
        )
        packer = Mock()
        packer.results = [item]
        packer.unfitted_codes = []
        packer.priority_report = {
            "priorita_completa": False,
            "vincoli": {"vincoli_completi": False},
        }
        packer.genera_metriche.return_value = {}

        with patch(
            "caricamento.engine.orchestratore_tre_d.TreDPacker",
            return_value=packer,
        ):
            risultato = esegui_ottimizzazione_tre_d(piano.id)

        piano.refresh_from_db()
        self.assertTrue(risultato.successo)
        self.assertEqual(piano.stato, "completato")
        self.assertEqual(
            risultato.messaggio,
            "Completato: 1 oggetti posizionati.",
        )


class TestBuildLookupVincoliTra(TestCaseBase):
    """Test per _build_lookup_vincoli_tra."""

    def test_lookup_filtra_entrambi_gli_estremi_presenti(self):
        a = self.crea_oggetto("L-F-A")
        b = self.crea_oggetto("L-F-B")
        c = self.crea_oggetto("L-F-C")
        vincolo_valido = self.crea_vincolo_tra(a, b, "sopra")
        vincolo_esterno = self.crea_vincolo_tra(a, c, "sopra")

        queryset = VincoloTraOggetti.objects.filter(
            id__in=[vincolo_valido.id, vincolo_esterno.id]
        )
        lookup = _build_lookup_vincoli_tra(queryset, oggetto_ids={a.id, b.id})

        self.assertEqual([entry[0] for entry in lookup[a.id]], [b.id])

    def test_lookup_direzionale_per_sopra(self):
        a = self.crea_oggetto("L-A")
        b = self.crea_oggetto("L-B")
        self.crea_vincolo_tra(a, b, "sopra")

        lookup = _build_lookup_vincoli_tra(VincoloTraOggetti.objects.filter(attivo=True))

        targets_a = [t[0] for t in lookup.get(a.id, [])]
        self.assertIn(b.id, targets_a)
        self.assertNotIn(a.id, [t[0] for t in lookup.get(b.id, [])])

    def test_carica_vincoli_sopra_filtra_oggetti_fuori_piano(self):
        contenitore = self.crea_contenitore()
        a = self.crea_oggetto("L-PIANO-A")
        b = self.crea_oggetto("L-PIANO-B")
        c = self.crea_oggetto("L-FUORI")
        piano = PianoDiCarico.objects.create(
            owner=self.user,
            nome="Piano filtro vincoli",
            contenitore=contenitore,
        )
        OggettoDaCaricare.objects.create(piano_di_carico=piano, oggetto=a)
        OggettoDaCaricare.objects.create(piano_di_carico=piano, oggetto=b)
        self.crea_vincolo_tra(a, b, "sopra")
        self.crea_vincolo_tra(a, c, "sopra")

        lookup = _carica_vincoli_sopra(piano)

        self.assertEqual(list(lookup[a.id]), [b.id])

    def test_lookup_solo_vincoli_attivi(self):
        a = self.crea_oggetto("L-C")
        b = self.crea_oggetto("L-D")
        self.crea_vincolo_tra(a, b, "sopra", attivo=False)

        lookup = _build_lookup_vincoli_tra(VincoloTraOggetti.objects.filter(attivo=True))
        self.assertEqual(len(lookup), 0)


class TestOrigineSalvataggioPosizioni(TestCaseBase):
    """La sincronizzazione della lista non deve falsare l'origine del piano."""

    def _salva_posizioni(self, piano, origine):
        client = APIClient()
        client.force_authenticate(user=self.user)
        return client.post(
            "/api/piani/{}/salva_posizioni_manuali/".format(piano.id),
            {
                "origine": origine,
                "oggetti": [{
                    "oggetto_id": piano.oggetti_da_caricare.first().oggetto_id,
                    "codice": piano.oggetti_da_caricare.first().oggetto.codice,
                    "posizione_cm": {"x": 0, "y": 0, "z": 0},
                    "dimensioni_cm": {"x": 50, "y": 40, "z": 30},
                    "colore": "#4488ff",
                    "rotazione": "XYZ",
                }],
            },
            format="json",
        )

    def test_sincronizzazione_non_sovrascrive_algoritmo_automatico(self):
        contenitore = self.crea_contenitore()
        oggetto = self.crea_oggetto("ORIG-A", 500, 400, 300)
        piano = PianoDiCarico.objects.create(
            owner=self.user,
            nome="Piano automatico",
            contenitore=contenitore,
            algoritmo="Algoritmo 3D Semplificato",
        )
        OggettoDaCaricare.objects.create(piano_di_carico=piano, oggetto=oggetto)

        response = self._salva_posizioni(piano, "sincronizzazione")

        self.assertEqual(response.status_code, 200)
        piano.refresh_from_db()
        self.assertEqual(piano.algoritmo, "Algoritmo 3D Semplificato")

    def test_sincronizzazione_preserva_piano_parziale(self):
        contenitore = self.crea_contenitore()
        oggetto = self.crea_oggetto("ORIG-P", 500, 400, 300)
        piano = PianoDiCarico.objects.create(
            owner=self.user,
            nome="Piano parziale",
            contenitore=contenitore,
            stato="parziale",
            algoritmo="Algoritmo 3D Semplificato",
        )
        OggettoDaCaricare.objects.create(piano_di_carico=piano, oggetto=oggetto)

        response = self._salva_posizioni(piano, "sincronizzazione")

        self.assertEqual(response.status_code, 200)
        piano.refresh_from_db()
        self.assertEqual(piano.stato, "parziale")
        self.assertEqual(piano.algoritmo, "Algoritmo 3D Semplificato")

    def test_salvataggio_manuale_marca_piano_manuale(self):
        contenitore = self.crea_contenitore()
        oggetto = self.crea_oggetto("ORIG-M", 500, 400, 300)
        piano = PianoDiCarico.objects.create(
            owner=self.user,
            nome="Piano da modificare",
            contenitore=contenitore,
            algoritmo="Algoritmo 3D Semplificato",
        )
        OggettoDaCaricare.objects.create(piano_di_carico=piano, oggetto=oggetto)

        response = self._salva_posizioni(piano, "manuale")

        self.assertEqual(response.status_code, 200)
        piano.refresh_from_db()
        self.assertEqual(piano.algoritmo, "manuale")

    def test_salva_persiste_tutte_le_posizioni_visibili(self):
        """La quantità richiesta non elimina posizioni già visibili nella scena."""
        contenitore = self.crea_contenitore(x=2000, y=2000, z=2000)
        oggetto = self.crea_oggetto("VISIBLE-A", 500, 400, 300)
        piano = PianoDiCarico.objects.create(
            owner=self.user,
            nome="Piano scena visibile",
            contenitore=contenitore,
            stato="parziale",
            algoritmo="Algoritmo 3D Semplificato",
        )
        # Una sola unità richiesta, ma due istanze sono già presenti nella
        # scena visualizzata. Entrambe sono valide e devono essere persistite.
        OggettoDaCaricare.objects.create(
            piano_di_carico=piano,
            oggetto=oggetto,
            quantita=1,
        )

        response = self._salva_posizioni_payload(piano, [
            {
                "oggetto_id": oggetto.id,
                "codice": oggetto.codice,
                "posizione_cm": {"x": 0, "y": 0, "z": 0},
                "dimensioni_cm": {"x": 50, "y": 40, "z": 30},
            },
            {
                "oggetto_id": oggetto.id,
                "codice": oggetto.codice,
                "posizione_cm": {"x": 100, "y": 100, "z": 0},
                "dimensioni_cm": {"x": 50, "y": 40, "z": 30},
            },
        ], "sincronizzazione")

        self.assertEqual(response.status_code, 200)
        posizioni = list(piano.oggetti_posizionati.order_by("coordinata_x_mm"))
        self.assertEqual(len(posizioni), 2)
        self.assertEqual(
            [(p.coordinata_x_mm, p.coordinata_y_mm, p.coordinata_z_mm)
             for p in posizioni],
            [(0, 0, 0), (1000, 1000, 0)],
        )
        self.assertEqual(
            [(p.dimensione_x_mm, p.dimensione_y_mm, p.dimensione_z_mm)
             for p in posizioni],
            [(500, 400, 300), (500, 400, 300)],
        )

    def _salva_posizioni_payload(self, piano, oggetti, origine):
        client = APIClient()
        client.force_authenticate(user=self.user)
        return client.post(
            "/api/piani/{}/salva_posizioni_manuali/".format(piano.id),
            {"origine": origine, "oggetti": oggetti},
            format="json",
        )


class TestImpostazioniOttimizzatoreAPI(TestCase):
    """Le preferenze dell'ottimizzatore sono persistenti e isolate per utente."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="settings-user",
            password="test-password",
        )
        self.altro_user = User.objects.create_user(
            username="settings-other-user",
            password="test-password",
        )
        self.client = APIClient()

    def test_get_autenticato_restituisce_configurazione_vuota(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get("/api/impostazioni_ottimizzatore/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"impostazioni": {}})

    def test_put_persist_get_e_isola_per_utente(self):
        payload = {
            "strategia_ottimizzazione": {
                "ordinamento_casuale": True,
                "compattazione_aggressiva": True,
            },
            "output_ottimizzazione": {
                "modalita_rotazione": "eccentrica",
            },
            "manuale": {
                "strategia_piazzamento": "colonne",
                "massima_sporgenza_pct": 50,
            },
        }
        self.client.force_authenticate(user=self.user)

        put_response = self.client.put(
            "/api/impostazioni_ottimizzatore/",
            payload,
            format="json",
        )
        get_response = self.client.get("/api/impostazioni_ottimizzatore/")

        self.assertEqual(put_response.status_code, 200)
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.data["impostazioni"], payload)
        self.assertEqual(
            UserProfile.objects.get(user=self.user).impostazioni_ottimizzatore,
            payload,
        )

        self.client.force_authenticate(user=self.altro_user)
        altro_response = self.client.get("/api/impostazioni_ottimizzatore/")
        self.assertEqual(altro_response.status_code, 200)
        self.assertEqual(altro_response.data, {"impostazioni": {}})

    def test_put_rifiuta_sezioni_non_previste(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.put(
            "/api/impostazioni_ottimizzatore/",
            {"impostazioni_sistema": {"debug": True}},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("sezioni", response.data)


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


class TestPrioritaContenitoreVariabile(TestCase):
    """La priorità resta esplicita e il limite Z dipende dal contenitore."""

    def test_vincolo_non_promuove_la_base_e_prioritario_viene_prima(self):
        """I02 p1 deve essere processato prima di I01 p0 anche con
        il vincolo I02 sopra I01; il vincolo non promuove tutte le basi.
        """
        from caricamento.engine.tre_d.priority_policy import (
            priorita_effettive,
            riordina_per_fasi,
        )

        oggetti = [
            *(
                Obj(
                    f"I01-{indice}",
                    120,
                    100,
                    100,
                    oggetto_id=1,
                    priorita=0,
                )
                for indice in range(15)
            ),
            *(
                Obj(
                    f"I02-{indice}",
                    120,
                    80,
                    100,
                    oggetto_id=2,
                    priorita=1,
                )
                for indice in range(5)
            ),
        ]
        vincoli = {2: {1: None}}

        self.assertEqual(priorita_effettive(oggetti, vincoli), {1: 0, 2: 1})
        riordina_per_fasi(oggetti, vincoli, preserve_inner_order=False)
        self.assertTrue(all(obj.oggetto_id == 2 for obj in oggetti[:5]))
        self.assertTrue(all(obj.oggetto_id == 1 for obj in oggetti[5:]))

        posizionati = load_truck_v2(
            oggetti,
            vincoli_sopra=vincoli,
            container_dim=(1360, 248, 270),
        )
        self.assertEqual(len(posizionati), 20)
        self.assertEqual(sum(obj.oggetto_id == 2 for obj in posizionati), 5)
        self.assertEqual(sum(obj.oggetto_id == 1 for obj in posizionati), 15)
        i02 = [obj for obj in posizionati if obj.oggetto_id == 2]
        i01 = [obj for obj in posizionati if obj.oggetto_id == 1]
        self.assertLessEqual(
            max(obj.x for obj in i02),
            min(obj.x for obj in i01),
            "Il singolo I02 deve restare nella fase I02, prima degli I01.",
        )

    def test_altezza_del_contenitore_e_dinamica(self):
        """Lo stesso carico usa il limite Z del camion/cassa selezionato."""
        for altezza, secondo_deve_entrare in ((270, False), (370, True)):
            oggetti = [
                Obj("PRIORITARIO-0", 100, 100, 200, oggetto_id=1, priorita=1),
                Obj("SUCCESSIVO-0", 100, 100, 100, oggetto_id=2, priorita=0),
            ]
            posizionati = load_truck_v2(
                oggetti,
                container_dim=(100, 100, altezza),
                preserve_order=True,
            )
            self.assertEqual(len(posizionati), 2 if secondo_deve_entrare else 1)
            if secondo_deve_entrare:
                secondo = next(obj for obj in posizionati if obj.oggetto_id == 2)
                self.assertEqual(secondo.z, 200)
            else:
                self.assertEqual(oggetti[1].z, -1)


class TestStrategieEndToEnd(TestCase):
    """Matrice comune per le quattro strategie automatiche."""

    def _make_objects(self):
        return [
            *(
                Obj(
                    f"I01-{index}",
                    120,
                    100,
                    100,
                    oggetto_id=1,
                    priorita=0,
                )
                for index in range(15)
            ),
            *(
                Obj(
                    f"I02-{index}",
                    120,
                    80,
                    100,
                    oggetto_id=2,
                    priorita=1,
                )
                for index in range(5)
            ),
        ]

    def _run(self, config, container_dim=(1360, 248, 270)):
        objects = self._make_objects()
        result = strategy_for_config(config).execute(
            objects,
            {2: {1: None}},
            container_dim,
        )
        fitted = [obj for obj in result if obj.z >= 0]
        return objects, result, fitted

    def test_tutte_le_strategie_rispettano_priorita_e_integrita(self):
        configs = {
            "deterministica": ConfigurazioneOttimizzazione(),
            "monte_carlo": ConfigurazioneOttimizzazione(
                ordinamento_casuale=True,
            ),
            "backtracking": ConfigurazioneOttimizzazione(
                backtracking_avanzato=True,
            ),
            "ibrida": ConfigurazioneOttimizzazione(
                ordinamento_casuale=True,
                backtracking_avanzato=True,
            ),
        }

        for name, config in configs.items():
            with self.subTest(strategy=name):
                objects, result, fitted = self._run(config)
                i02 = [obj for obj in fitted if obj.oggetto_id == 2]
                i01 = [obj for obj in fitted if obj.oggetto_id == 1]

                requested_ids = {obj.id for obj in objects}
                fitted_ids = {obj.id for obj in fitted}
                self.assertEqual(len(result), 20)
                self.assertEqual(len(fitted), 20)
                self.assertEqual(len(fitted_ids), len(fitted))
                self.assertEqual(fitted_ids, requested_ids)
                self.assertEqual(len(i02), 5)
                self.assertEqual(len(i01), 15)
                self.assertLessEqual(
                    max(obj.x for obj in i02),
                    min(obj.x for obj in i01),
                )
                self.assertTrue(all(obj.z >= 0 for obj in fitted))

    def test_tutte_le_strategie_rispettano_limiti_e_collisioni(self):
        configs = (
            ConfigurazioneOttimizzazione(),
            ConfigurazioneOttimizzazione(ordinamento_casuale=True),
            ConfigurazioneOttimizzazione(backtracking_avanzato=True),
            ConfigurazioneOttimizzazione(
                ordinamento_casuale=True,
                backtracking_avanzato=True,
            ),
        )
        containers = {
            "camion": (1360, 248, 270),
            "cassa": (1360, 248, 370),
        }

        for container_name, container in containers.items():
            for config in configs:
                with self.subTest(
                    container=container_name,
                    strategy=type(strategy_for_config(config)).__name__,
                ):
                    objects, _, fitted = self._run(config, container)
                    requested_ids = {obj.id for obj in objects}
                    fitted_ids = {obj.id for obj in fitted}
                    i02 = [obj for obj in fitted if obj.oggetto_id == 2]
                    i01 = [obj for obj in fitted if obj.oggetto_id == 1]
                    self.assertEqual(fitted_ids, requested_ids)
                    self.assertEqual(len(fitted_ids), len(fitted))
                    self.assertTrue(i02 and i01)
                    self.assertLessEqual(
                        max(obj.x for obj in i02),
                        min(obj.x for obj in i01),
                    )
                    for obj in fitted:
                        self.assertGreaterEqual(obj.x, 0)
                        self.assertGreaterEqual(obj.y, 0)
                        self.assertGreaterEqual(obj.z, 0)
                        self.assertLessEqual(obj.x + obj.width, container[0])
                        self.assertLessEqual(obj.y + obj.depth, container[1])
                        self.assertLessEqual(obj.z + obj.height, container[2])

                    for index, first in enumerate(fitted):
                        for second in fitted[index + 1:]:
                            overlap_xy = (
                                first.x < second.x + second.width
                                and first.x + first.width > second.x
                                and first.y < second.y + second.depth
                                and first.y + first.depth > second.y
                            )
                            overlap_z = (
                                first.z < second.z + second.height
                                and first.z + first.height > second.z
                            )
                            self.assertFalse(
                                overlap_xy and overlap_z,
                                f"Collisione tra {first.id} e {second.id}",
                            )


class TestOwnershipIsolation(TestCase):
    """Gli endpoint REST non devono esporre i dati di un altro utente."""

    def setUp(self):
        self.user = User.objects.create_user(username="isolation-a", password="test-password")
        self.other = User.objects.create_user(username="isolation-b", password="test-password")
        self.client = APIClient()
        self.container = Contenitore.objects.create(
            owner=self.other,
            nome="Other container",
            lunghezza_mm=2000,
            larghezza_mm=2000,
            altezza_mm=2000,
            carico_massimo_kg=Decimal("1000"),
        )
        self.item = Oggetto.objects.create(
            owner=self.other,
            codice="OTHER-ITEM",
            lunghezza_mm=500,
            larghezza_mm=400,
            altezza_mm=300,
            peso_kg=Decimal("10"),
            quantita_disponibile=1,
        )
        self.plan = PianoDiCarico.objects.create(
            owner=self.other,
            nome="Other plan",
            contenitore=self.container,
        )

    def test_other_user_resources_are_not_listed_or_retrievable(self):
        self.client.force_authenticate(user=self.user)

        self.assertEqual(self.client.get("/api/contenitori/").status_code, 200)
        self.assertEqual(self.client.get("/api/contenitori/").data["count"], 0)
        self.assertEqual(self.client.get(f"/api/contenitori/{self.container.id}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/oggetti/{self.item.id}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/piani/{self.plan.id}/").status_code, 404)

    def test_other_user_resources_cannot_be_used_in_nested_actions(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            f"/api/piani/{self.plan.id}/oggetti_da_caricare/",
            {"oggetto_id": self.item.id, "quantita": 1},
            format="json",
        )
        self.assertEqual(response.status_code, 404)


class TestApiErrorHandling(TestCase):
    """Le API restituiscono errori leggibili senza perdere i dettagli legacy."""

    def setUp(self):
        self.user = User.objects.create_user(username="errors-user", password="test-password")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_validation_error_has_standard_envelope_and_request_id(self):
        response = self.client.put(
            "/api/impostazioni_ottimizzatore/",
            {"sezione_non_valida": {}},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["error"]["code"], "validation_error")
        self.assertTrue(response.data["error"]["request_id"])
        self.assertEqual(response["X-Request-ID"], response.data["error"]["request_id"])
        # Compatibilità con i client che usavano il campo DRF originale.
        self.assertIn("sezioni", response.data)


class TestDemoTrialFingerprint(TestCase):
    """Un fingerprint impedisce di assegnare trial demo aggiuntivi."""

    def setUp(self):
        self.factory = RequestFactory()
        self.ip = "203.0.113.10"
        self.browser = "browser-hash-demo"
        self.cookie = "cookie-token-demo"
        impostazioni = ImpostazioniSistema.get()
        impostazioni.demo_attiva = True
        impostazioni.soglia_controlli_demo = 1
        impostazioni.save()

    def _request(self):
        request = self.factory.post("/")
        request.META["HTTP_X_REAL_IP"] = self.ip
        request.COOKIES["cb_fp"] = self.browser
        request.COOKIES["cb_demo"] = self.cookie
        return request

    def _active_user(self, username):
        user = User.objects.create_user(username=username, password="password-demo")
        profile = user.profile
        profile.trial_start = timezone.now()
        profile.trial_end = timezone.now() + timedelta(days=7)
        profile.save(update_fields=["trial_start", "trial_end"])
        return user

    def test_used_fingerprint_blocks_second_trial_while_first_is_active(self):
        user = self._active_user("first-demo")
        _save_demo_fingerprints(self._request(), user)

        self.assertTrue(_check_demo_abuse(self._request()))

    def test_admin_can_disable_anti_abuse_checks_for_testing(self):
        user = self._active_user("first-demo-disabled-checks")
        _save_demo_fingerprints(self._request(), user)
        impostazioni = ImpostazioniSistema.get()
        impostazioni.controlli_demo_attivi = False
        impostazioni.save()

        self.assertFalse(_check_demo_abuse(self._request()))

    def test_staff_fingerprint_does_not_block_demo_trials(self):
        user = User.objects.create_user(
            username="staff-fingerprint", password="password-demo", is_staff=True
        )
        _save_demo_fingerprints(self._request(), user)

        self.assertFalse(_check_demo_abuse(self._request()))

    def test_existing_account_can_login_from_a_matching_device(self):
        user = self._active_user("portable-demo")
        _save_demo_fingerprints(self._request(), user)

        self.client.cookies["cb_fp"] = self.browser
        self.client.cookies["cb_demo"] = self.cookie
        response = self.client.post(
            "/",
            {"username": user.username, "password": "password-demo"},
            REMOTE_ADDR="127.0.0.1",
            HTTP_X_REAL_IP=self.ip,
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/workspace/")

    def test_new_account_requires_matching_password_confirmation(self):
        response = self.client.post(
            "/",
            {"username": "new-demo-confirm", "password": "password-demo"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "inserisci due volte la stessa password")
        self.assertFalse(User.objects.filter(username="new-demo-confirm").exists())

        response = self.client.post(
            "/",
            {
                "username": "new-demo-confirm",
                "password": "password-demo",
                "password_confirm": "password-demo",
            },
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/workspace/")
        self.assertTrue(User.objects.filter(username="new-demo-confirm").exists())

    def test_existing_account_can_login_when_new_demo_signups_are_disabled(self):
        user = self._active_user("existing-demo-disabled-signups")
        impostazioni = ImpostazioniSistema.get()
        impostazioni.demo_attiva = False
        impostazioni.save()

        response = self.client.post(
            "/",
            {"username": user.username, "password": "password-demo"},
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/workspace/")

    def test_expired_trial_api_returns_json_403(self):
        user = User.objects.create_user(username="expired-demo", password="password-demo")
        profile = user.profile
        profile.trial_start = timezone.now() - timedelta(days=15)
        profile.trial_end = timezone.now() - timedelta(days=1)
        profile.save(update_fields=["trial_start", "trial_end"])
        self.client.force_login(user)

        response = self.client.get("/api/contenitori/")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"]["code"], "trial_expired")

    def test_disactivated_user_cannot_reuse_an_existing_session(self):
        user = self._active_user("disabled-demo")
        self.client.force_login(user)
        user.is_active = False
        user.save(update_fields=["is_active"])

        response = self.client.get("/workspace/")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/?next=/workspace/")

    def test_new_google_identity_is_blocked_by_used_fingerprint(self):
        from types import SimpleNamespace

        from allauth.core.exceptions import ImmediateHttpResponse
        from caricamento.adapter import DynamicGoogleAdapter

        user = self._active_user("google-demo")
        _save_demo_fingerprints(self._request(), user)
        request = self._request()

        with self.assertRaises(ImmediateHttpResponse) as raised:
            with patch("caricamento.views._check_demo_abuse", return_value=True):
                DynamicGoogleAdapter().pre_social_login(
                    request,
                    SimpleNamespace(is_existing=False),
                )

        self.assertEqual(raised.exception.response.status_code, 302)
        self.assertEqual(raised.exception.response["Location"], "/?trial=used")

    def test_disabled_local_account_shows_disabled_message_instead_of_recreating(self):
        user = self._active_user("disabled-login")
        user.is_active = False
        user.save(update_fields=["is_active"])

        response = self.client.post(
            "/",
            {"username": user.username, "password": "password-demo"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Questo account è stato disattivato")
        self.assertEqual(User.objects.filter(username=user.username).count(), 1)

    def test_google_new_identity_is_blocked_when_demo_is_disabled(self):
        from types import SimpleNamespace

        from allauth.core.exceptions import ImmediateHttpResponse
        from caricamento.adapter import DynamicGoogleAdapter

        impostazioni = ImpostazioniSistema.get()
        impostazioni.demo_attiva = False
        impostazioni.save()

        with self.assertRaises(ImmediateHttpResponse) as raised:
            DynamicGoogleAdapter().pre_social_login(
                self._request(),
                SimpleNamespace(is_existing=False),
            )

        self.assertEqual(raised.exception.response.status_code, 302)
        self.assertEqual(raised.exception.response["Location"], "/?demo=disabled")

    def test_demo_threshold_cannot_exceed_available_signals(self):
        impostazioni = ImpostazioniSistema.get()
        impostazioni.soglia_controlli_demo = 4

        with self.assertRaises(ValidationError):
            impostazioni.full_clean()


class TestSecurityHardening(TestCase):
    """Test delle correzioni di sicurezza (IP reale, magic bytes PNG, XSS)."""

    def setUp(self):
        self.factory = RequestFactory()

    def test_client_ip_prefers_x_real_ip_over_forwarded(self):
        request = self.factory.get("/")
        request.META["REMOTE_ADDR"] = "10.0.0.5"
        request.META["HTTP_X_FORWARDED_FOR"] = "1.2.3.4, 10.0.0.5"
        request.META["HTTP_X_REAL_IP"] = "203.0.113.9"

        self.assertEqual(get_client_ip(request), "203.0.113.9")

    def test_client_ip_ignores_spoofed_forwarded_and_uses_remote_addr(self):
        request = self.factory.get("/")
        request.META["REMOTE_ADDR"] = "10.0.0.5"
        request.META["HTTP_X_FORWARDED_FOR"] = "1.2.3.4"

        self.assertEqual(get_client_ip(request), "10.0.0.5")

    def test_icon_upload_rejects_non_png_content(self):
        staff = User.objects.create_user(
            username="staff-icons", password="password-demo", is_staff=True
        )
        self.client.force_login(staff)

        fake = SimpleUploadedFile(
            "finto.png", b"MZ not a real png", content_type="image/png"
        )
        response = self.client.post("/api/icone-upload/", {"file": fake})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "invalid_file_type")

    def test_icon_upload_accepts_real_png_signature(self):
        staff = User.objects.create_user(
            username="staff-icons-ok", password="password-demo", is_staff=True
        )
        self.client.force_login(staff)

        png = SimpleUploadedFile(
            "ok.png",
            b"\x89PNG\r\n\x1a\n" + b"payload",
            content_type="image/png",
        )
        with tempfile.TemporaryDirectory() as tmp, patch(
            "caricamento.views.ICON_UPLOAD_DIR", tmp
        ):
            response = self.client.post("/api/icone-upload/", {"file": png})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["success"], True)
        self.assertEqual(response.json()["filename"], "ok.png")

    def test_workspace_escapes_dettagli_posizionamento(self):
        user = User.objects.create_user(username="xss-user", password="password-demo")
        self.client.force_login(user)

        a = Oggetto.objects.create(
            owner=user, codice="XSS-A", lunghezza_mm=10, larghezza_mm=10,
            altezza_mm=10, peso_kg=Decimal("1.00"),
        )
        b = Oggetto.objects.create(
            owner=user, codice="XSS-B", lunghezza_mm=10, larghezza_mm=10,
            altezza_mm=10, peso_kg=Decimal("1.00"),
        )
        payload = "</script><script>alert('XSS-SEC')</script>"
        VincoloTraOggetti.objects.create(
            oggetto_a=a,
            oggetto_b=b,
            tipo_relazione="sopra",
            dettagli_posizionamento={"note": payload},
        )

        response = self.client.get("/workspace/")

        self.assertEqual(response.status_code, 200)
        content = response.content.decode()
        self.assertNotIn(payload, content)
        # escapejs trasforma '<' e '>' in \u003C / \u003E: niente breakout dello script.
        self.assertIn("\\u003C/script\\u003E", content)

    def test_client_ip_rejects_spoofed_x_real_ip_from_public_peer(self):
        request = self.factory.get("/")
        request.META["REMOTE_ADDR"] = "203.0.113.50"  # IP pubblico: peer non fidato
        request.META["HTTP_X_REAL_IP"] = "10.0.0.7"

        self.assertEqual(get_client_ip(request), "203.0.113.50")

    def test_bulk_vincoli_ignores_structural_fields(self):
        user = User.objects.create_user(username="bulk-user", password="password-demo")
        other = User.objects.create_user(username="bulk-other", password="password-demo")

        o1 = Oggetto.objects.create(
            owner=user, codice="BULK-1", lunghezza_mm=10, larghezza_mm=10,
            altezza_mm=10, peso_kg=Decimal("1.00"),
        )
        o2 = Oggetto.objects.create(
            owner=other, codice="BULK-2", lunghezza_mm=10, larghezza_mm=10,
            altezza_mm=10, peso_kg=Decimal("1.00"),
        )

        client = APIClient()
        client.force_authenticate(user=user)
        response = client.post(
            "/api/oggetti/bulk_vincoli/",
            {"ids": [o1.id], "vincoli": {"oggetto_id": o2.id, "fragile": True}},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        vincolo = VincoloOggetto.objects.get(oggetto=o1)
        # Il campo strutturale oggetto_id è ignorato: nessuna riassegnazione cross-tenant.
        self.assertEqual(vincolo.oggetto_id, o1.id)
        # Il campo della whitelist viene comunque applicato.
        self.assertTrue(vincolo.fragile)
