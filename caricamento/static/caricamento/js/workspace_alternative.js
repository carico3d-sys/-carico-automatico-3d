/**
 * Workspace Carico 3D — Soluzioni Alternative Module
 *
 * Gestisce la visualizzazione, l'anteprima e l'applicazione delle soluzioni
 * alternative generate dal Monte Carlo. La soluzione migliore è mostrata in
 * testa al pannello, evidenziata; le alternative seguono in una griglia.
 */

// Stato locale per le soluzioni ricevute (migliore + alternative)
window.WS = window.WS || {};
WS.soluzioniAlternative = [];
WS.soluzioneAltSelezionata = 0;

/**
 * Lunghezza X massima occupata (in cm) di una soluzione.
 */
function _xMaxCm(soluzione) {
    var max = 0;
    (soluzione.oggetti || []).forEach(function (o) {
        var fine = (o.coordinata_x_mm || 0) + (o.dimensione_x_mm || 0);
        if (fine > max) max = fine;
    });
    return max / 10;
}

/**
 * Sincronizza il riepilogo della sidebar con la soluzione attualmente
 * visualizzata nel main view, invece di usare i dati del pannello di carico.
 */
function _aggiornaSidebarDaSoluzione(soluzione) {
    if (typeof _aggiornaSidebarRiepilogo !== 'function') return;
    var oggetti = Array.isArray(soluzione && soluzione.oggetti)
        ? soluzione.oggetti
        : [];
    var pesoTotale = 0;
    var codici = {};
    oggetti.forEach(function (oggetto) {
        pesoTotale += Number(oggetto.peso_kg || 0);
        if (oggetto.codice) codici[String(oggetto.codice)] = true;
    });

    // Alcune alternative possono riportare il peso solo nelle metriche.
    if (!pesoTotale && soluzione && soluzione.peso_totale_kg) {
        pesoTotale = Number(soluzione.peso_totale_kg) || 0;
    }
    _aggiornaSidebarRiepilogo(oggetti.length, pesoTotale, Object.keys(codici).length);
}

/**
 * Ridimensiona il renderer 3D dopo un cambio di layout del pannello.
 * Il pannello alternative cambia l'altezza del viewport: senza questo passo il
 * canvas resta della dimensione precedente e lascia una fascia vuota (il
 * "pannello bianco" che si nota ruotando il contenitore).
 */
function _resizeViewport3D() {
    requestAnimationFrame(function () {
        if (typeof handleResize !== 'function') return;
        if (typeof STATE === 'undefined' || !STATE.camera || !STATE.renderer) return;
        handleResize();
    });
}

/**
 * Evidenzia la card selezionata (la soluzione attualmente in anteprima).
 */
function _marcaSelezione(idx) {
    WS.soluzioneAltSelezionata = idx;
    var list = document.getElementById('soluzioni-alternative-list');
    if (!list) return;
    list.querySelectorAll('.soluzione-alt-item').forEach(function (card) {
        var cardIdx = parseInt(card.dataset.idx);
        // Il verde identifica già la migliore; il bordo blu evidenzia la
        // selezione solo sulle alternative (non sulla migliore).
        card.classList.toggle('soluzione-alt-selezionata', cardIdx === idx && cardIdx !== 0);
    });
}

/**
 * Mostra il pannello con le soluzioni (migliore in testa + alternative).
 */
function mostraSoluzioniAlternative(soluzioni) {
    WS.soluzioniAlternative = soluzioni || [];
    var panel = document.getElementById('soluzioni-alternative-panel');
    var list = document.getElementById('soluzioni-alternative-list');
    if (!panel || !list) return;

    if (!WS.soluzioniAlternative.length) {
        list.innerHTML = '<p style="color:#888;padding:8px 0;">Nessuna soluzione alternativa trovata.</p>';
        panel.style.display = 'block';
        _resizeViewport3D();
        return;
    }

    var html = '';
    WS.soluzioniAlternative.forEach(function (sol, idx) {
        var migliore = sol.e_migliore === true || idx === 0;
        var oggetti = sol.oggetti || [];
        var nonPos = sol.oggetti_non_posizionati || [];
        var sub = oggetti.length + ' pz' +
            (nonPos.length ? ' · ' + nonPos.length + ' non pos.' : '') +
            ' · L ' + _xMaxCm(sol).toFixed(0) + ' cm' +
            ' · Sat ' + ((sol.saturazione || 0) - 0).toFixed(1) + '%';

        html += '<div class="soluzione-alt-item' +
            (migliore ? ' soluzione-alt-migliore' : '') +
            '" data-idx="' + idx + '">' +
            '<div class="soluzione-alt-info">' +
                '<strong>' + (migliore ? '🏆 Migliore' : 'Alternativa #' + idx) + '</strong>' +
                '<span>' + sub + '</span>' +
            '</div>' +
            (migliore
                ? '<span class="soluzione-alt-corrente">corrente</span>'
                : '') +
        '</div>';
    });

    list.innerHTML = html;
    // Fino a 6 card su una riga; con meno card la larghezza si distribuisce
    // uniformemente su tutta la riga, poi si va a capo sulla seconda.
    list.style.gridTemplateColumns = 'repeat(' + Math.min(Math.max(WS.soluzioniAlternative.length, 1), 6) + ', 1fr)';
    panel.style.display = 'block';
    _marcaSelezione(0);
    _aggiornaSidebarDaSoluzione(WS.soluzioniAlternative[0]);
    _resizeViewport3D();

    // Click sulla card = applica solo l'anteprima nel 3D. Il salvataggio
    // definitivo avviene tramite il comando Salva della barra laterale.
    list.querySelectorAll('.soluzione-alt-item').forEach(function (card) {
        card.addEventListener('click', function () {
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
    _resizeViewport3D();
}

/**
 * Nasconde SOLO il pannello (per es. quando si apre una vista anagrafica),
 * conservando le soluzioni in memoria: tornando al main view il pannello
 * può essere ripristinato senza perdere le alternative.
 */
function nascondiPannelloAlternative() {
    var panel = document.getElementById('soluzioni-alternative-panel');
    if (panel) panel.style.display = 'none';
    _resizeViewport3D();
}

/**
 * Ripristina il pannello delle soluzioni alternative se ci sono soluzioni
 * ancora in memoria (dopo essere tornati al main view da una vista
 * anagrafica). Non rigenera la lista: la card selezionata resta quella
 * visibile.
 */
function mostraPannelloAlternativeSePresente() {
    if (!WS.soluzioniAlternative || WS.soluzioniAlternative.length === 0) return;
    var panel = document.getElementById('soluzioni-alternative-panel');
    if (!panel) return;
    panel.style.display = 'block';
    _resizeViewport3D();
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
        contenitore = { nome: 'Contenitore', lunghezza_mm: 0, larghezza_mm: 0, altezza_mm: 0 };
    }

    // Conta gli oggetti per codice nella soluzione per il fallback
    // _rigaKeyDaCodiceIndice (quando _rigaKeyDaRigaId non trova mapping).
    var contaPerCodice = {};

    var oggetti3d = (soluzione.oggetti || []).map(function (o) {
        var descr = '';
        if (WS.oggettiDisponibili) {
            var info = trovaOggettoPerCodice(o.codice);
            if (info) descr = info.descrizione || '';
        }

        // 1. Prova il mapping diretto riga_id → riga_key dallo snapshot.
        var rk = _rigaKeyDaRigaId(o.riga_id);

        // 2. Fallback: mappa per codice + indice progressivo.
        if (!rk && o.codice) {
            var idx = (contaPerCodice[o.codice] = (contaPerCodice[o.codice] || 0));
            rk = _rigaKeyDaCodiceIndice(o.codice, idx);
            contaPerCodice[o.codice]++;
        }

        return {
            oggetto_id: o.oggetto_id || null,
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
            riga_id: o.riga_id || null,
            riga_key: rk || null,
        };
    });

    var dati = {
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

    // Riapplica i colori per-riga del pannello (rete di sicurezza, stesso
    // meccanismo della preview di "Elabora"): il backend delle alternative
    // restituisce i colori automatici, ma la scena deve mostrare quelli del
    // pannello, incluse le modifiche manuali fatte dall'utente.
    if (typeof _applicaColoriRigaPosizioni === 'function') {
        _applicaColoriRigaPosizioni(dati);
    }

    return dati;
}

/**
 * Mappa un riga_id (id della riga del piano tecnico) alla riga_key del
 * pannello, usando lo snapshot della preview salvato da "Elabora"
 * (WS._autoPreviewPosizioni contiene coppie riga_id → riga_key per ogni
 * posizionamento). Serve alle alternative, che dal backend hanno solo
 * l'id della riga del piano temporaneo.
 */
function _rigaKeyDaRigaId(rigaId) {
    if (rigaId == null) return null;
    // Prima: lookup diretto nello snapshot (mappa riga_id → riga_key).
    if (typeof WS !== 'undefined' && Array.isArray(WS._autoPreviewPosizioni)) {
        var key = String(rigaId);
        for (var i = 0; i < WS._autoPreviewPosizioni.length; i++) {
            var p = WS._autoPreviewPosizioni[i];
            if (p.riga_id != null && String(p.riga_id) === key && p.riga_key) {
                return p.riga_key;
            }
        }
    }
    return null;
}

/**
 * Fallback: mappa un oggetto della soluzione alternativa alla riga del
 * pannello per CODICE + INDICE (N-esimo oggetto con lo stesso codice).
 * Usato quando _rigaKeyDaRigaId non trova il mapping (riga_id diverso
 * tra preview e alternativa, o snapshot non disponibile).
 *
 * @param {string} codice  Codice dell'oggetto (es. "CART-I01")
 * @param {number} idxInSoluzione Indice di questo oggetto tra quelli
 *   dello stesso codice NELLA SOLUZIONE alternativa (0-based)
 * @returns {string|null} La riga_key del pannello corrispondente
 */
function _rigaKeyDaCodiceIndice(codice, idxInSoluzione) {
    if (!codice || typeof DOM === 'undefined' || !DOM.panelItemsList) return null;
    var rows = DOM.panelItemsList.querySelectorAll('.panel-item[data-codice="' + codice + '"]');
    if (!rows || !rows.length) return null;
    // Ordina le righe per posizione nel DOM (stessa logica di visualizzazione).
    var rigaKeys = [];
    for (var i = 0; i < rows.length; i++) {
        var rk = rows[i].dataset.rigaKey || '';
        if (rk) rigaKeys.push(rk);
    }
    if (idxInSoluzione < rigaKeys.length) {
        return rigaKeys[idxInSoluzione];
    }
    // Se ci sono più posizioni che righe, usa l'ultima riga disponibile.
    return rigaKeys.length ? rigaKeys[rigaKeys.length - 1] : null;
}

/**
 * Mostra in anteprima una soluzione nel viewport 3D (non distruttiva).
 * L'indice 0 è la soluzione migliore.
 */
function visualizzaSoluzioneAlternativa(idx) {
    if (!WS.soluzioniAlternative || WS.soluzioniAlternative.length <= idx) return;
    var soluzione = WS.soluzioniAlternative[idx];
    var migliore = soluzione.e_migliore === true || idx === 0;
    var dati = _costruisciDati3DdaSoluzione(soluzione);
    if (typeof renderizzaDati3D === 'function') {
        renderizzaDati3D(dati);
        // Aggiorna qty piazzate nel pannello: l'input mostra i pezzi
        // reali dell'alternativa; il badge mantiene la qty originale
        // richiesta (con bordo rosse se parziale).
        if (typeof _aggiornaQtyPiazzateDaPreview === 'function') {
            _aggiornaQtyPiazzateDaPreview(dati);
        }
        _marcaSelezione(idx);
        _aggiornaSidebarDaSoluzione(soluzione);
        var label = migliore ? 'Soluzione migliore' : ('Anteprima alternativa #' + idx);
        _setHeaderCaricoLabel(label);
        showToast(label, 'info');
    } else {
        showToast('Modulo 3D non disponibile per l\'anteprima.', 'error');
    }
}

/**
 * Applica una soluzione alternativa come soluzione attiva del piano.
 * Salva le posizioni sul piano tramite l'endpoint di sincronizzazione.
 */
async function applicaSoluzioneAlternativa(idx) {
    if (!WS.soluzioniAlternative || WS.soluzioniAlternative.length <= idx) return;
    var soluzione = WS.soluzioniAlternative[idx];
    if (soluzione.e_migliore === true || idx === 0) {
        // La migliore è già la soluzione attiva del piano.
        showToast('La migliore è già la soluzione attiva del piano.', 'info');
        return;
    }
    if (!WS.activePianoId) {
        showToast('Nessun piano attivo su cui applicare la soluzione.', 'error');
        return;
    }
    var contaPerCodice = {};
    var oggetti = (soluzione.oggetti || []).map(function (o) {
        // Colore del pannello per la riga corrispondente (se presente):
        // il salvataggio deve conservare i colori per-riga del pannello,
        // non quelli automatici del backend dell'alternativa.
        var coloreSalvataggio = o.colore || '#4488ff';
        var rigaKey = _rigaKeyDaRigaId(o.riga_id);
        if (!rigaKey && o.codice) {
            var idx = (contaPerCodice[o.codice] = (contaPerCodice[o.codice] || 0));
            rigaKey = _rigaKeyDaCodiceIndice(o.codice, idx);
            contaPerCodice[o.codice]++;
        }
        if (typeof DOM !== 'undefined' && DOM.panelItemsList && rigaKey) {
            var rigaRow = DOM.panelItemsList.querySelector('.panel-item[data-riga-key="' + rigaKey + '"]');
            if (rigaRow && typeof coloreRiga === 'function') {
                var colRiga = coloreRiga(rigaRow);
                if (coloreEsadecimaleValido(colRiga)) coloreSalvataggio = colRiga;
            }
        }
        return {
            oggetto_id: o.oggetto_id || null,
            codice: o.codice,
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
            colore: coloreSalvataggio,
            rotazione: o.rotazione_applicata || 'XYZ',
            riga_id: o.riga_id || null,
        };
    });
    if (oggetti.length === 0) {
        showToast('La soluzione alternativa non contiene oggetti.', 'error');
        return;
    }
    try {
        setStatus('busy', 'Applicazione soluzione alternativa...');
        // Le alternative vengono dall'ottimizzatore: applicandone una il piano
        // torna ad essere automatico (rimuove l'etichetta "manuale" che un
        // salvataggio manuale precedente aveva impostato).
        var algoritmo = 'Algoritmo 3D Semplificato';
        if (typeof IMPOSTAZIONI !== 'undefined' && IMPOSTAZIONI &&
            IMPOSTAZIONI.strategia_ottimizzazione &&
            IMPOSTAZIONI.strategia_ottimizzazione.ordinamento_casuale) {
            algoritmo += ' 🎲 Monte Carlo';
        }
        var resp = await fetch('/api/piani/' + WS.activePianoId + '/salva_posizioni_manuali/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify({ oggetti: oggetti, origine: 'sincronizzazione', algoritmo: algoritmo }),
        });
        if (!resp.ok) {
            var err = await resp.json().catch(function () { return {}; });
            throw new Error(err.errore || err.detail || err.oggetti || ('HTTP ' + resp.status));
        }
        await caricaScena3D(WS.activePianoId);
        _marcaSelezione(idx);
        showToast('✅ Soluzione alternativa applicata e salvata.', 'success');
        setStatus('success', 'Soluzione applicata');
    } catch (e) {
        console.error('Errore applicazione alternativa:', e);
        showToast('❌ Applicazione fallita: ' + e.message, 'error');
        setStatus('error', 'Applicazione fallita');
    }
}

// Aggancia il listener del pulsante di chiusura dell'header all'avvio.
(function () {
    var chiudi = document.getElementById('btn-chiudi-alternative');
    if (chiudi) {
        chiudi.addEventListener('click', function () { nascondiSoluzioniAlternative(); });
    }
})();
