/**
 * Workspace Carico 3D — Soluzioni Alternative Module
 *
 * Gestisce la visualizzazione e l'anteprima delle soluzioni alternative
 * generate dal Simulated Annealing (SA).
 */

// Stato locale per le alternative ricevute
window.WS = window.WS || {};
WS.soluzioniAlternative = [];

/**
 * Mostra il pannello con le soluzioni alternative generate da SA.
 */
function mostraSoluzioniAlternative(soluzioni) {
    WS.soluzioniAlternative = soluzioni || [];
    var panel = document.getElementById('soluzioni-alternative-panel');
    var list = document.getElementById('soluzioni-alternative-list');
    if (!panel || !list) return;

    if (!WS.soluzioniAlternative.length) {
        list.innerHTML = '<p style="color:#888;padding:8px 0;">Nessuna soluzione alternativa trovata.</p>' +
            '<p style="color:#888;font-size:11px;margin:0;">Prova ad aumentare la profondit&agrave; di ricerca o a cambiare l\'algoritmo/mix di oggetti.</p>';
        panel.style.display = 'block';
        return;
    }

    var html = '';
    WS.soluzioniAlternative.forEach(function (sol, idx) {
        var oggetti = sol.oggetti || [];
        var nonPos = sol.oggetti_non_posizionati || [];
        html += '<div class="soluzione-alt-item">' +
            '<div class="soluzione-alt-info">' +
                '<strong>Alternativa #' + (idx + 1) + '</strong>' +
                '<span>' + oggetti.length + ' pz' +
                    (nonPos.length ? ' · ' + nonPos.length + ' non pos.' : '') +
                    ' · Sat ' + (sol.saturazione || 0).toFixed(1) + '%' +
                    ' · ' + (sol.peso_totale_kg || 0).toFixed(0) + ' kg' +
                '</span>' +
            '</div>' +
            '<button class="btn btn-sm btn-primary soluzione-alt-preview" data-idx="' + idx + '">👁 Anteprima</button>' +
        '</div>';
    });

    list.innerHTML = html;
    panel.style.display = 'block';

    list.querySelectorAll('.soluzione-alt-preview').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var idx = parseInt(this.dataset.idx);
            visualizzaSoluzioneAlternativa(idx);
        });
    });
}

/**
 * Nasconde il pannello delle soluzioni alternative.
 */
function nascondiSoluzioniAlternative() {
    var panel = document.getElementById('soluzioni-alternative-panel');
    if (panel) panel.style.display = 'none';
    WS.soluzioniAlternative = [];
}

/**
 * Costruisce i dati 3D per una soluzione alternativa.
 */
function _costruisciDati3DdaSoluzione(soluzione) {
    var contenitore = null;
    if (WS.contenitori && WS.activeMezzoId) {
        contenitore = WS.contenitori.find(function (c) { return c.id == WS.activeMezzoId; });
    }
    if (!contenitore && WS.piani) {
        var piano = WS.piani.find(function (p) { return p.id == WS.activePianoId; });
        if (piano && piano.container && WS.contenitori) {
            contenitore = WS.contenitori.find(function (c) { return c.nome === piano.container; });
        }
    }
    if (!contenitore) {
        // Fallback a dimensioni nulle (non dovrebbe accadere)
        contenitore = { nome: 'Contenitore', lunghezza_mm: 0, larghezza_mm: 0, altezza_mm: 0 };
    }

    var oggetti3d = (soluzione.oggetti || []).map(function (o) {
        var descr = '';
        if (WS.oggettiDisponibili) {
            var info = trovaOggettoPerCodice(o.codice);
            if (info) descr = info.descrizione || '';
        }
        return {
            codice: o.codice,
            descrizione: descr,
            posizione_cm: {
                x: (o.coordinata_x_mm || 0) / 10,
                y: (o.coordinata_y_mm || 0) / 10,
                z: (o.coordinata_z_mm || 0) / 10,
            },
            dimensioni_cm: {
                x: (o.dimensione_x_mm || 0) / 10,
                y: (o.dimensione_y_mm || 0) / 10,
                z: (o.dimensione_z_mm || 0) / 10,
            },
            rotazione: o.rotazione_applicata || 'XYZ',
            colore: o.colore || '#4488ff',
            peso_kg: o.peso_kg || 0,
            peso_sopra_kg: 0,
        };
    });

    return {
        piano: {
            id: WS.activePianoId || null,
            nome: 'Soluzione alternativa',
            stato: 'completato'
        },
        contenitore: {
            nome: contenitore.nome,
            dimensioni_mm: {
                x: contenitore.lunghezza_mm,
                y: contenitore.larghezza_mm,
                z: contenitore.altezza_mm,
            },
            dimensioni_cm: {
                x: contenitore.lunghezza_mm / 10,
                y: contenitore.larghezza_mm / 10,
                z: contenitore.altezza_mm / 10,
            }
        },
        oggetti: oggetti3d,
        metriche: {
            peso_totale_kg: soluzione.peso_totale_kg || 0,
            saturazione: soluzione.saturazione || 0,
            oggetti_posizionati: oggetti3d.length,
        }
    };
}

/**
 * Mostra in anteprima una soluzione alternativa nel viewport 3D.
 */
function visualizzaSoluzioneAlternativa(idx) {
    if (!WS.soluzioniAlternative || WS.soluzioniAlternative.length <= idx) return;
    var soluzione = WS.soluzioniAlternative[idx];
    var dati = _costruisciDati3DdaSoluzione(soluzione);
    if (typeof renderizzaDati3D === 'function') {
        renderizzaDati3D(dati);
        var label = document.getElementById('viewport-toolbar-label');
        if (label) label.textContent = 'Anteprima alternativa #' + (idx + 1);
        _setHeaderCaricoLabel('Anteprima alternativa #' + (idx + 1));
        showToast('Anteprima alternativa #' + (idx + 1), 'info');
    } else {
        showToast('Modulo 3D non disponibile per l\'anteprima.', 'error');
    }
}

// Aggancia il listener del pulsante di chiusura una sola volta all'avvio.
(function () {
    var chiudi = document.getElementById('btn-chiudi-alternative');
    if (chiudi) {
        chiudi.addEventListener('click', function () { nascondiSoluzioniAlternative(); });
    }
})();
