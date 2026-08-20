/**
 * Workspace Carico 3D — Pannello Destro & Editor Module
 *
 * Selezione mezzo, gestione oggetti nel carico, editor inline,
 * esportazione posizioni, viewport 3D helpers, nuovo carico.
 *
 * Depends on: workspace_core.js (W, WS, DOM, utilities)
 */

// =============================================================================
// SELEZIONE MEZZO (header)
// =============================================================================
function selezionaMezzo(mezzoId, skipResetPianoAttivo) {
    var nuovoId = mezzoId ? parseInt(mezzoId) : null;
    var vecchioId = WS.activeMezzoId;
    WS.activeMezzoId = nuovoId;
    DOM.headerVehicleSelect.value = nuovoId || '';
    _aggiornaStatoAzioniAuto();
    // Se il mezzo è cambiato e c'era un piano attivo, invalidalo (il piano è legato al vecchio contenitore).
    // Quando carichiamo esplicitamente un piano salvato, saltiamo questo reset perché il piano resta valido.
    if (!skipResetPianoAttivo && nuovoId !== null && nuovoId !== vecchioId && WS.activePianoId && vecchioId !== null) {
        WS.activePianoId = null;
        invalidaDistribuzionePesi();
        if (DOM.headerExportBtn) DOM.headerExportBtn.disabled = true;

        // Auto-ottimizza se ci sono oggetti nel carico
        var oggettiNelCarico = raccogliOggettiDaPanel();
        if (oggettiNelCarico.length > 0) {
            mostraViewport();
            WS.treSceneLoaded = false;
            showToast('🔄 Veicolo cambiato, riottimizzazione in corso...', 'info');
            setTimeout(function() { elaboraOttimizzazione(false); }, 100);
            return;
        }

        showToast('⚠️ Contenitore cambiato. Riavvia l\'ottimizzazione per usare il nuovo mezzo.', 'warning');
    }

    if (nuovoId) {
        var m = WS.contenitori.find(function (c) { return c.id == nuovoId; });
        setStatus('idle', 'Mezzo: ' + (m ? m.nome : ''));
        // Aggiorna sidebar riepilogo: ricalcola dai dati pannello esistenti
        if (typeof _aggiornaSidebarRiepilogo === 'function') {
            var panelItems = DOM.panelItemsList.querySelectorAll('.panel-item');
            var tp = 0, tkg = 0;
            panelItems.forEach(function (d) {
                var q = parseInt(d.querySelector('.panel-qty-input')?.value) || 1;
                var p = parseFloat(d.dataset.peso) || 0;
                tp += q; tkg += q * p;
            });
            _aggiornaSidebarRiepilogo(tp, tkg, panelItems.length);
        }

        // Mostra il contenitore vuoto in 3D se non c'è un carico ottimizzato attivo
        if (!WS.activePianoId && m && typeof mostraContenitoreVuoto === 'function') {
            mostraViewport();
            var dimCm = {
                x: m.lunghezza_mm / 10,
                y: m.larghezza_mm / 10,
                z: m.altezza_mm / 10
            };
            mostraContenitoreVuoto(dimCm, '🟦 ' + m.nome);
            nascondiPlaceholder();
            WS.treSceneLoaded = true;
        }
    } else {
        setStatus('idle', 'Pronto');
        // Se deseleziono il mezzo e non c'è un carico ottimizzato, mostra il placeholder
        if (!WS.activePianoId) {
            WS.treSceneLoaded = false;
            mostraPlaceholder('Visualizzazione 3D', 'Seleziona un mezzo per vedere il contenitore vuoto, poi aggiungi oggetti e dal tab \u26a1 Automatica clicca "Elabora Ottimizzazione".');
        }
    }
}

// =============================================================================
// HELPER: SINCRONIZZA SELEZIONE PANEL → SCENA 3D + SELECT SINISTRA
// =============================================================================

/**
 * Quando l'utente clicca su una riga del pannello destro:
 *  1. Aggiorna la select sinistra (panelSelectOggetto) con l'oggettoId
 *  2. Seleziona l'ultimo oggetto di quel tipo nella scena 3D
 */
function _sincronizzaSelezionePanel(itemDiv) {
    // 1. Aggiorna la select sinistra
    if (typeof DOM !== 'undefined' && DOM.panelSelectOggetto) {
        DOM.panelSelectOggetto.value = itemDiv.dataset.oggettoId || '';
    }

    // 2. Seleziona l'ultimo oggetto di questo tipo nella scena 3D (solo in modalità manuale)
    if (typeof WS !== 'undefined' && WS.manualMode && typeof STATE !== 'undefined' && STATE.oggettiMesh && STATE.oggettiMesh.length > 0 && itemDiv.dataset.codice) {
        var codice = itemDiv.dataset.codice;
        var rigaId = itemDiv.dataset.rigaId || null;
        var rigaKey = itemDiv.dataset.rigaKey || null;
        var meshTrovato = null;
        for (var i = STATE.oggettiMesh.length - 1; i >= 0; i--) {
            var mesh = STATE.oggettiMesh[i];
            var stessoLotto = mesh.userData && (
                (rigaId && String(mesh.userData.riga_id) === String(rigaId)) ||
                (rigaKey && mesh.userData.riga_key === rigaKey)
            );
            if (mesh.userData && stessoLotto) {
                meshTrovato = mesh;
                break;
            }
        }
        // Fallback per posizionamenti legacy privi di riga origine.
        if (!meshTrovato) {
            for (var j = STATE.oggettiMesh.length - 1; j >= 0; j--) {
                if (STATE.oggettiMesh[j].userData && STATE.oggettiMesh[j].userData.codice === codice) {
                    meshTrovato = STATE.oggettiMesh[j];
                    break;
                }
            }
        }
        if (meshTrovato && typeof _selectObject === 'function') {
            _selectObject(meshTrovato);
        }
    }
}

// =============================================================================
// PANNELLO DESTRO: GESTIONE OGGETTI NEL CARICO
// =============================================================================

function _aggiornaColoreQtyOriginale(itemDiv) {
    if (!itemDiv) return;
    var badge = itemDiv.querySelector('.panel-qty-originale');
    if (!badge) return;

    var qtyOriginale = parseInt(itemDiv.dataset.qtyOriginale, 10) || 0;
    var qtyPosizionata = parseInt(itemDiv.querySelector('.panel-qty-input')?.value, 10) || 0;

    // Il campo "Qtà rich." resta sempre visibile: se non è ancora stato
    // impostato, lo allinea alla quantità piazzata invece di nasconderlo.
    if (!qtyOriginale) {
        qtyOriginale = qtyPosizionata;
        itemDiv.dataset.qtyOriginale = String(qtyPosizionata);
    }

    badge.textContent = qtyOriginale;
    var incompleta = qtyPosizionata < qtyOriginale;
    badge.classList.toggle('qty-incompleta', incompleta);
    badge.style.background = incompleta ? '#f8d7da' : '#fff3cd';
    badge.style.borderColor = incompleta ? '#dc3545' : '#ffc107';
    badge.style.color = incompleta ? '#842029' : '#856404';
    badge.title = 'Quantità richiesta: ' + qtyOriginale +
        (incompleta ? ' — quantità piazzata: ' + qtyPosizionata : '');
}

// Mantiene "Qtà rich." visibile e coerente con la quantità piazzata: quando
// l'utente modifica la quantità, la richiesta viene allineata (mai cancellata),
// così entrambe le colonne restano visibili e aggiornate.
function _allineaQtyRichiesta(itemDiv) {
    if (!itemDiv) return;
    var qtyInput = itemDiv.querySelector('.panel-qty-input');
    if (!qtyInput) return;
    var qty = parseInt(qtyInput.value, 10);
    if (isNaN(qty)) qty = 0;
    itemDiv.dataset.qtyOriginale = String(qty);
    _aggiornaColoreQtyOriginale(itemDiv);
}

function aggiungiAlCarico(oggettoId, qtyIniziale, skipInvalida, qtyOriginale, rigaId, colore) {
    if (!oggettoId) return;
    if (qtyIniziale === undefined || qtyIniziale === null) qtyIniziale = 1;

    // Una riga identificata dal DB viene aggiornata solo tramite il suo id.
    // Senza rigaId (pulsante +) non fare merge: ogni click crea un lotto nuovo.
    var esistente = rigaId
        ? document.querySelector('.panel-item[data-riga-id="' + rigaId + '"]')
        : null;
    if (esistente) {
        var qtyInput = esistente.querySelector('.panel-qty-input');
        if (qtyInput) {
            qtyInput.value = (parseInt(qtyInput.value) || 1) + qtyIniziale;
        }
        // Modifica manuale: invalida l'eventuale preview automatica, perché
        // la quantità del pannello non coincide più con il risultato elaborato.
        if (typeof WS !== 'undefined') WS._autoPreviewPosizioni = null;
        // Allinea la quantità richiesta a quella piazzata (mai nasconderla).
        _allineaQtyRichiesta(esistente);
        aggiornaRiepilogoPanel();
        aggiornaStatoPulsante();
        if (qtyIniziale === 1) showToast('Quantità incrementata.', 'info');
        DOM.panelSelectOggetto.value = '';
        if (!skipInvalida && WS.activePianoId) invalidaDistribuzionePesi();
        // Assicura che azioni header siano presenti
        _iniettaPanelHeaderActions();
        return;
    }

    // Nuovo oggetto inserito dall'utente: i dati dell'ottimizzazione precedente
    // e lo snapshot della preview non sono più validi.
    if (!skipInvalida && typeof WS !== 'undefined') WS._autoPreviewPosizioni = null;
    if (!skipInvalida && WS.activePianoId) invalidaDistribuzionePesi();

    var oggetto = trovaOggetto(oggettoId);
    if (!oggetto) return;

    var div = document.createElement('div');
    div.className = 'panel-item';
    div.dataset.oggettoId = oggettoId;
    div.dataset.rigaId = rigaId || '';
    if (typeof WS !== 'undefined') {
        WS._panelRigaCounter = (WS._panelRigaCounter || 0) + 1;
        div.dataset.rigaKey = 'riga-' + Date.now() + '-' + WS._panelRigaCounter;
    }
    div.dataset.peso = oggetto.peso_kg;
    div.dataset.lunghezza = oggetto.lunghezza_mm;
    div.dataset.larghezza = oggetto.larghezza_mm;
    div.dataset.altezza = oggetto.altezza_mm;
    div.dataset.codice = oggetto.codice;
    div.dataset.priorita = '0';
    var qtyRichiesta = qtyOriginale || qtyIniziale;
    div.dataset.qtyOriginale = String(qtyRichiesta);
    // Colore PER-RIGA: se arriva da DB/import lo conserva, altrimenti parte
    // vuoto (colore anagrafica) e viene gestito da _assegnaColoriAutomatici().
    var coloreRigaInit = (colore && coloreEsadecimaleValido(colore)) ? colore : '';
    var anagraficaCol = coloreOggetto(oggetto);
    div.dataset.colore = coloreRigaInit;
    div.dataset.coloreCustom = (coloreRigaInit && coloreRigaInit !== anagraficaCol) ? '1' : '';
    div.dataset.coloreAuto = '';
    var coloreBar = coloreRiga(div);
    div.innerHTML =
        '<div class="panel-item-color" style="background:' + coloreBar + ';"></div>' +
        '<div class="panel-item-info">' +
            '<strong>' + escapeHtml(oggetto.codice) + '</strong>' +
            '<span>' + formatCm(oggetto.lunghezza_mm) + '×' + formatCm(oggetto.larghezza_mm) + '×' + formatCm(oggetto.altezza_mm) + ' cm</span>' +
        '</div>' +
        '<div class="panel-item-qty">' +
            '<input type="number" class="panel-qty-input" value="' + qtyIniziale + '" min="' + (qtyOriginale ? '0' : '1') + '" step="1">' +
            '<span class="panel-qty-originale" title="Quantità richiesta: ' + qtyRichiesta + '">' + qtyRichiesta + '</span>' +
        '</div>' +
        '<div class="panel-item-prio">' +
            '<input type="number" class="panel-prio-input" value="0" min="0" step="1" title="Priorita carico (1 = massima)">' +
        '</div>' +
        '<div class="panel-item-actions">' +
            '<button class="btn-item-action btn-modify" title="Modifica">✏️</button>' +
        '</div>';

    // Event listeners
    var qtyInput = div.querySelector('.panel-qty-input');
    qtyInput.addEventListener('change', function () {
        _aggiornaColoreQtyOriginale(div);
        aggiornaRiepilogoPanel();
        aggiornaStatoPulsante();
        if (typeof WS !== 'undefined' && WS.manualMode && typeof _registraModificaManuale === 'function') {
            _registraModificaManuale();
        }
    });
    qtyInput.addEventListener('input', function () {
        if (typeof WS !== 'undefined') WS._autoPreviewPosizioni = null;
        // Modifica manuale: allinea la quantità richiesta a quella piazzata
        // (mai cancellarla, così entrambe le colonne restano visibili).
        _allineaQtyRichiesta(div);
        aggiornaRiepilogoPanel();
        aggiornaStatoPulsante();
        if (typeof WS !== 'undefined' && WS.manualMode && typeof _registraModificaManuale === 'function') {
            _registraModificaManuale();
        }
    });

    // Event listener per priorità
    var prioInput = div.querySelector('.panel-prio-input');
    if (prioInput) {
        prioInput.addEventListener('change', function () {
            div.dataset.priorita = this.value || '0';
            if (typeof WS !== 'undefined' && WS.manualMode && typeof _registraModificaManuale === 'function') {
                _registraModificaManuale();
            }
        });
        prioInput.addEventListener('input', function () {
            div.dataset.priorita = this.value || '0';
        });
    }

    var btnModify = div.querySelector('.btn-modify');
    if (btnModify) {
        btnModify.addEventListener('click', function (e) { e.stopPropagation(); apriEditorOggetto(div); });
    }

    // Click sulla riga = seleziona + sincronizza select sinistra e scena 3D
    // Supporta Ctrl+click (toggle), Shift+click (range), click semplice (singolo)
    div.addEventListener('click', function (e) {
        var oid = parseInt(div.dataset.oggettoId) || 0;
        if (!oid) return;

        if (e.ctrlKey || e.shiftKey) {
            _togglePanelMultiSel(oid, e.ctrlKey, e.shiftKey, div);
            // In multi-select non cambiare la selezione singola (selected)
        } else {
            // Click semplice: deseleziona multi, seleziona solo questo
            _pulisciPanelMultiSel();
            _panelMultiSelState.oggettiSelezionati.push(div.dataset.rigaId || div.dataset.rigaKey || String(oid));
            _panelMultiSelState.ultimoCliccato = div.dataset.rigaId || div.dataset.rigaKey || String(oid);
            div.classList.add('selected-multi');
            _aggiornaPanelBatchToolbar();

            if (typeof _impostaSelezionePanelManuale === 'function') {
                _impostaSelezionePanelManuale(div, div.dataset.oggettoId, div.dataset.codice);
            } else {
                document.querySelectorAll('.panel-item').forEach(function (el) { el.classList.remove('selected'); });
                div.classList.add('selected');
            }
            _sincronizzaSelezionePanel(div);
        }
    });

    DOM.panelItemsList.appendChild(div);
    // Distingue automaticamente i codici duplicati senza colore personalizzato.
    _assegnaColoriAutomatici();
    _aggiornaColoreQtyOriginale(div);
    DOM.panelEmpty.style.display = 'none';
    var panelHeader = document.getElementById('panel-items-header');
    if (panelHeader) panelHeader.style.display = 'flex';
    // Inietta azioni header alla prima aggiunta
    _iniettaPanelHeaderActions();
    DOM.panelSelectOggetto.value = '';
    aggiornaRiepilogoPanel();
    aggiornaStatoPulsante();
    return div;
}

/**
 * Assegna i colori alle righe del pannello.
 *
 * - Righe con colore personalizzato (dataset.coloreCustom === '1'): invariati.
 * - Più righe con lo stesso codice e NESSUNA personalizzazione: colori
 *   automatici distinti dalla palette (mai uguali al colore anagrafica).
 * - Una singola riga per codice senza personalizzazione: colore anagrafica.
 *
 * Il colore effettivo resta sempre in dataset.colore (hex), così viene
 * salvato con la riga e riusato da motore e modalità manuale.
 */
function _assegnaColoriAutomatici() {
    var rows = Array.prototype.slice.call(DOM.panelItemsList.querySelectorAll('.panel-item'));
    if (!rows.length) return;

    var byCodice = {};
    rows.forEach(function (row) {
        var c = row.dataset.codice || '';
        (byCodice[c] = byCodice[c] || []).push(row);
    });

    Object.keys(byCodice).forEach(function (codice) {
        var gruppo = byCodice[codice];
        var senzaCustom = gruppo.filter(function (row) {
            return row.dataset.coloreCustom !== '1';
        });

        if (senzaCustom.length <= 1) {
            // Una sola riga (o nessuna) senza personalizzazione: usa l'anagrafica.
            senzaCustom.forEach(function (row) {
                var oid = parseInt(row.dataset.oggettoId, 10) || 0;
                row.dataset.colore = coloreOggetto(trovaOggetto(oid));
                row.dataset.coloreAuto = '';
            });
            return;
        }

        // Più righe duplicate senza colore personalizzato: palette distinta,
        // evitando il colore anagrafica e quelli già usati dalle righe custom.
        var oid0 = parseInt(gruppo[0].dataset.oggettoId, 10) || 0;
        var anagraficaCol = coloreOggetto(trovaOggetto(oid0));
        var usati = {};
        gruppo.forEach(function (row) {
            if (row.dataset.coloreCustom === '1' && row.dataset.colore) {
                usati[row.dataset.colore] = true;
            }
        });
        var idx = 0;
        senzaCustom.forEach(function (row) {
            var col = null;
            for (var k = 0; k < COLORI_PACCHI.length && !col; k++) {
                var cand = COLORI_PACCHI[(idx + k) % COLORI_PACCHI.length];
                if (cand !== anagraficaCol && !usati[cand]) {
                    col = cand;
                    usati[cand] = true;
                    idx += k + 1;
                }
            }
            if (!col) col = anagraficaCol; // palette esaurita: fallback
            row.dataset.colore = col;
            row.dataset.coloreAuto = '1';
            idx++;
        });
    });

    // Aggiorna le barre colore di tutte le righe.
    rows.forEach(function (row) {
        var colorBar = row.querySelector('.panel-item-color');
        if (colorBar) colorBar.style.background = coloreRiga(row);
    });
}

function rimuoviOggettoPanel(itemDiv) {
    itemDiv.style.opacity = '0';
    itemDiv.style.transition = 'opacity 0.15s';
    setTimeout(function () {
        if (typeof WS !== 'undefined') WS._autoPreviewPosizioni = null;
        itemDiv.remove();
        _assegnaColoriAutomatici();
        aggiornaRiepilogoPanel();
        aggiornaStatoPulsante();
        if (DOM.panelItemsList.children.length === 0) {
            DOM.panelEmpty.style.display = 'flex';
            var panelHeader = document.getElementById('panel-items-header');
            if (panelHeader) panelHeader.style.display = 'none';
        }
        if (WS.activePianoId) invalidaDistribuzionePesi();
    }, 150);
}

function aggiornaRiepilogoPanel() {
    var items = DOM.panelItemsList.querySelectorAll('.panel-item');
    var totPezzi = 0, totPeso = 0;
    items.forEach(function (div) {
        var qty = parseInt(div.querySelector('.panel-qty-input').value) || 1;
        var peso = parseFloat(div.dataset.peso) || 0;
        totPezzi += qty;
        totPeso += qty * peso;
    });


    // Sincronizza anche il riepilogo nella sidebar sinistra (passa i valori già calcolati)
    if (typeof _aggiornaSidebarRiepilogo === 'function') _aggiornaSidebarRiepilogo(totPezzi, totPeso, items.length);
}

function _aggiornaStatoAzioniAuto() {
    var abilitato = !!(
        WS.activeMezzoId &&
        !WS.salvataggioInCorso &&
        DOM.panelItemsList &&
        DOM.panelItemsList.querySelectorAll('.panel-item').length > 0
    );
    if (DOM.ottimizzaBtn) DOM.ottimizzaBtn.disabled = !abilitato;
    if (DOM.btnSalvaAuto) DOM.btnSalvaAuto.disabled = !abilitato;
    if (DOM.btnElaboraAuto) DOM.btnElaboraAuto.disabled = !abilitato;
}

function aggiornaStatoPulsante() {
    _aggiornaStatoAzioniAuto();
}

function svuotaCarico() {
    if (DOM.panelItemsList.children.length === 0) return;
    if (!confirm('Svuotare tutti gli oggetti dal carico?')) return;

    // Svuota pannello destro e azzera la selezione manuale persistente.
    // Evita che un nuovo carico erediti la riga selezionata del precedente.
    if (typeof WS !== 'undefined') {
        WS._manualPanelSelectedOggettoId = null;
        WS._manualPanelSelectedCodice = null;
        WS._manualPanelSelectedRigaId = null;
        WS._manualPanelSelectedRigaKey = null;
    }
    DOM.panelItemsList.innerHTML = '';
    _pulisciPanelMultiSel();
    DOM.panelEmpty.style.display = 'flex';
    var panelHeaderSv = document.getElementById('panel-items-header');
    if (panelHeaderSv) panelHeaderSv.style.display = 'none';
    _aggiornaStatoAzioniAuto();
    if (DOM.headerExportBtn) DOM.headerExportBtn.disabled = true;
    if (typeof _aggiornaSidebarRiepilogo === 'function') _aggiornaSidebarRiepilogo(0, 0, 0);
    nascondiDistribuzionePesi();
    _ultimaDistribuzionePesi = null;
    _distribuzionePesiPianoId = null;
    // Pulisce anche il contenuto della lista sezioni-pesi
    var listPesi = document.getElementById('sezioni-pesi-list');
    if (listPesi) listPesi.innerHTML = '';

    // Reset stato piano
    WS.activePianoId = null;
    WS.treSceneLoaded = false;

    // Svuota anche la scena 3D
    if (typeof resetScene === 'function') {
        try { resetScene(); } catch (e) {}
    }
    DOM.viewport3d.querySelectorAll('canvas').forEach(function (c) { c.remove(); });
    mostraPlaceholder('Visualizzazione 3D', 'Aggiungi oggetti nel pannello di destra, seleziona un mezzo e dal tab \u26a1 Automatica clicca "Elabora Ottimizzazione" per vedere il carico in 3D.');
   _setHeaderCaricoLabel('');

   // Reset task status
    DOM.taskDot.className = 'task-dot idle';
    DOM.taskStatusText.textContent = 'Nessuna elaborazione in corso';

    showToast('Carico svuotato.', 'info');
}

function raccogliOggettiDaPanel() {
    // Garantisce che i colori auto per righe duplicate siano sempre
    // calcolati prima di leggere dataset.colore.  Chiunque chiami
    // questa funzione otterrà i colori corretti senza doversi ricordare
    // di chiamare _assegnaColoriAutomatici() prima.
    if (typeof _assegnaColoriAutomatici === 'function') _assegnaColoriAutomatici();

    var items = DOM.panelItemsList.querySelectorAll('.panel-item');
    var oggetti = [];
    items.forEach(function (div) {
        var oggettoId = parseInt(div.dataset.oggettoId);
        if (!oggettoId) return;
        var qty = parseInt(div.querySelector('.panel-qty-input').value) || 1;
        var oggetto = trovaOggetto(oggettoId);
        if (!oggetto) return;
        oggetti.push({
            oggetto_id: oggettoId,
            codice: oggetto.codice,
            lunghezza_cm: formatCm(oggetto.lunghezza_mm),
            larghezza_cm: formatCm(oggetto.larghezza_mm),
            altezza_cm: formatCm(oggetto.altezza_mm),
            peso_kg: oggetto.peso_kg,
            quantita: qty,
            priorita: parseInt(div.dataset.priorita) || 0,
            colore: div.dataset.colore || '',
            riga_id: div.dataset.rigaId || null,
            riga_key: div.dataset.rigaKey || null,
        });
    });
    return oggetti;
}

// =============================================================================
// ESPORTAZIONE POSIZIONI
// =============================================================================

async function esportaPosizioni() {
    if (!WS.activePianoId) {
        showToast('Nessun piano di carico attivo da esportare.', 'warning');
        return;
    }
    var url = '/api/piani/' + WS.activePianoId + '/export_posizioni/';
    try {
        var resp = await fetch(url);
        if (!resp.ok) {
            var errText = await resp.text().catch(function() { return 'Errore sconosciuto'; });
            throw new Error('HTTP ' + resp.status + ': ' + errText.substring(0, 200));
        }
        var blob = await resp.blob();
        var downloadUrl = window.URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = downloadUrl;
        // Estrai il filename dal Content-Disposition header, altrimenti fallback
        var disposition = resp.headers.get('Content-Disposition') || '';
        var match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        a.download = match ? match[1].replace(/['"]/g, '') : ('piano_' + WS.activePianoId + '_posizioni.txt');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        showToast('📥 File posizioni scaricato!', 'success');
    } catch (err) {
        console.error('Export error:', err);
        showToast('❌ Download fallito: ' + err.message, 'error');
    }
}

// =============================================================================
// EDITOR OGGETTO INLINE (nel pannello destro)
// =============================================================================

/**
 * Salva le modifiche fatte nell'editor inline della riga.
 *
 * I campi modificabili (quantità, priorità, colore) valgono SOLO per questa
 * riga di carico: vengono salvati su OggettoDaCaricare via PATCH, mai
 * sull'anagrafica dell'oggetto.
 *
 * Restituisce { qty, colore }.
 */
async function salvaModificheEditor(itemDiv, oggettoId) {
    var oggetto = WS.oggettiDisponibili.find(function (o) { return o.id == oggettoId; });
    if (!oggetto) return null;

    var nuovaQty = parseInt(document.getElementById('editor-qty-' + oggettoId).value) || 1;
    var nuovaPrio = parseInt(document.getElementById('editor-prio-' + oggettoId).value) || 0;
    var colorePersonalizzato = document.getElementById('editor-colore-enable-' + oggettoId).checked;
    var nuovoColore = colorePersonalizzato
        ? document.getElementById('editor-colore-' + oggettoId).value.trim()
        : '';

    // Aggiorna lo stato locale della riga (per-riga, mai l'anagrafica).
    itemDiv.dataset.priorita = String(nuovaPrio);
    if (colorePersonalizzato && coloreEsadecimaleValido(nuovoColore)) {
        itemDiv.dataset.colore = nuovoColore;
        itemDiv.dataset.coloreCustom = '1';
        itemDiv.dataset.coloreAuto = '';
    } else {
        // Colore "di anagrafica": rimuovi l'override; per i codici duplicati
        // _assegnaColoriAutomatici() riassegnerà colori distinti.
        itemDiv.dataset.colore = '';
        itemDiv.dataset.coloreCustom = '';
        itemDiv.dataset.coloreAuto = '';
    }

    // Ricostruisci l'item con i nuovi valori
    itemDiv.classList.remove('editing');
    ricostruisciItemPanel(itemDiv, oggetto, nuovaQty);
    _assegnaColoriAutomatici();
    aggiornaRiepilogoPanel();
    aggiornaStatoPulsante();

    // Salva la riga sul server (solo se già persistita).
    if (itemDiv.dataset.rigaId && WS.activePianoId) {
        try {
            var resp = await fetch('/api/piani/' + WS.activePianoId + '/oggetti_da_caricare/', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify({
                    riga_id: itemDiv.dataset.rigaId,
                    quantita: nuovaQty,
                    priorita: nuovaPrio,
                    colore: itemDiv.dataset.colore || '',
                }),
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
        } catch (e) {
            console.error('Errore salvataggio riga sul server:', e);
            showToast('⚠️ Modifiche salvate localmente ma non sul server: ' + e.message, 'warning');
        }
    }

    // La modifica rende obsoleti i dati di distribuzione dell'ottimizzazione precedente
    if (WS.activePianoId) invalidaDistribuzionePesi();

    return { qty: nuovaQty, colore: itemDiv.dataset.colore || '' };
}

/**
 * Aggiorna l'Oggetto sul server via PATCH quando l'utente modifica
 * dimensioni/peso/colore dal pannello destro.
 */
async function _patchOggettoServer(oggettoId, lunghMm, larghMm, altMm, pesoKg, colore) {
    try {
        var resp = await fetch('/api/oggetti/' + oggettoId + '/', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify({
                lunghezza_mm: lunghMm,
                larghezza_mm: larghMm,
                altezza_mm: altMm,
                peso_kg: pesoKg,
                colore: colore,
            }),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        // Aggiorna la cache locale con i dati confermati dal server
        var idx = WS.oggettiDisponibili.findIndex(function (o) { return o.id == oggettoId; });
        if (idx >= 0) {
            WS.oggettiDisponibili[idx] = {
                id: data.id,
                codice: data.codice,
                descrizione: data.descrizione,
                lunghezza_mm: data.lunghezza_mm,
                larghezza_mm: data.larghezza_mm,
                altezza_mm: data.altezza_mm,
                peso_kg: data.peso_kg,
                quantita: data.quantita_disponibile,
                colore: data.colore || '',
            };
        }
        // Sincronizza anche il catalogo
        if (WS.oggettiCatalog) {
            var catIdx = WS.oggettiCatalog.findIndex(function (o) { return o.id == oggettoId; });
            if (catIdx >= 0) {
                WS.oggettiCatalog[catIdx] = {
                    id: data.id,
                    codice: data.codice,
                    descrizione: data.descrizione,
                    lunghezza_mm: data.lunghezza_mm,
                    larghezza_mm: data.larghezza_mm,
                    altezza_mm: data.altezza_mm,
                    peso_kg: data.peso_kg,
                    quantita: data.quantita_disponibile,
                    colore: data.colore || '',
                };
            }
        }
        return true;
    } catch (e) {
        console.error('Errore aggiornamento oggetto sul server:', e);
        showToast('\u26a0\ufe0f Modifiche salvate localmente ma non sul server: ' + e.message, 'warning');
        return false;
    }
}

function apriEditorOggetto(itemDiv) {
    var oggettoId = parseInt(itemDiv.dataset.oggettoId);
    var oggetto = trovaOggetto(oggettoId);
    if (!oggetto) return;

    // Se già in modifica, non fare nulla
    if (itemDiv.classList.contains('editing')) return;

    // Salva l'HTML originale
    itemDiv._originalHTML = itemDiv.innerHTML;
    itemDiv.classList.add('editing', 'selected');

    var qty = parseInt(itemDiv.querySelector('.panel-qty-input')?.value) || 1;
    var prio = parseInt(itemDiv.dataset.priorita) || 0;
    var coloreCorrente = coloreRiga(itemDiv);
    // Il colore risulta "personalizzato" se l'utente l'ha scelto o se è stato
    // salvato diverso dall'anagrafica (incluse le assegnazioni automatiche
    // per codici duplicati, così restano visibili e modificabili).
    var hasCustomColor = !!(
        itemDiv.dataset.coloreCustom === '1' ||
        (itemDiv.dataset.colore && itemDiv.dataset.colore !== coloreOggetto(oggetto))
    );

    itemDiv.innerHTML =
        '<div class="panel-editor">' +
            '<div class="panel-editor-header">' +
                '<strong>✏️ Modifica: ' + escapeHtml(oggetto.codice) + '</strong>' +
                '<button class="btn-item-action" id="editor-close-' + oggettoId + '" title="Chiudi">✕</button>' +
            '</div>' +
            '<div class="panel-editor-fields">' +
                '<div class="field-row">' +
                    '<div class="field-group flex-grow">' +
                        '<label class="field-label">Quantità</label>' +
                        '<input type="number" class="form-input" id="editor-qty-' + oggettoId + '" value="' + qty + '" min="1" step="1">' +
                    '</div>' +
                    '<div class="field-group" style="flex:0 0 90px;">' +
                        '<label class="field-label">Priorità</label>' +
                        '<input type="number" class="form-input" id="editor-prio-' + oggettoId + '" value="' + prio + '" min="0" step="1" title="1 = massima priorità, caricato per primo">' +
                    '</div>' +
                '</div>' +
                '<div class="field-row">' +
                    '<div class="field-group" style="flex:0 0 70px;">' +
                        '<label class="field-label">Colore</label>' +
                        '<input type="color" class="form-input" id="editor-colore-' + oggettoId + '" value="' + coloreCorrente + '" style="height:36px;padding:2px 4px;cursor:pointer;"' + (hasCustomColor ? '' : ' disabled') + '>' +
                    '</div>' +
                    '<div class="field-group flex-grow" style="justify-content:flex-end;">' +
                        '<label class="checkbox-label" style="margin-top:18px;">' +
                            '<input type="checkbox" id="editor-colore-enable-' + oggettoId + '" ' + (hasCustomColor ? 'checked' : '') + '> 🎨 Colore personalizzato' +
                        '</label>' +
                    '</div>' +
                '</div>' +
                '<div class="field-note" style="font-size:11px;color:#888;margin-top:2px;">Colore e priorità valgono solo per questa riga di carico; dimensioni e peso si modificano dall\'anagrafica.</div>' +
            '</div>' +
            '<div class="panel-editor-actions">' +
                '<button class="btn btn-primary btn-sm" id="editor-update-' + oggettoId + '">✅ Aggiorna riga</button>' +
                '<button class="btn btn-sm" id="editor-recalc-' + oggettoId + '">🔄 Ricalcola carico</button>' +
            '</div>' +
        '</div>';

    // Event listeners editor
    document.getElementById('editor-close-' + oggettoId).addEventListener('click', function (e) {
        e.stopPropagation();
        chiudiEditorOggetto(itemDiv);
    });

    document.getElementById('editor-update-' + oggettoId).addEventListener('click', async function (e) {
        e.stopPropagation();
        var risultato = await salvaModificheEditor(itemDiv, oggettoId);
        if (!risultato) return;

        // Aggiorna colore nella scena 3D SOLO per le mesh di questa riga.
        // Niente fallback per codice: cambierebbe anche i mesh dell'ALTRO
        // lotto con lo stesso codice, e il colore deve valere solo per la riga.
        if (typeof aggiornaColoreRigaInScena === 'function') {
            aggiornaColoreRigaInScena(
                itemDiv.dataset.rigaId,
                itemDiv.dataset.rigaKey,
                risultato.colore || '#447e9b'
            );
        }

        showToast('Riga "' + oggetto.codice + '" aggiornata (solo per questo carico).', 'success');
    });

    document.getElementById('editor-recalc-' + oggettoId).addEventListener('click', async function (e) {
        e.stopPropagation();
        var risultato = await salvaModificheEditor(itemDiv, oggettoId);
        if (!risultato) return;

        // Le modifiche sono state salvate, ora esegui l'ottimizzazione con i nuovi valori
        elaboraOttimizzazione(false);
    });

    // Previeni la propagazione dei click interni
    itemDiv.querySelector('.panel-editor').addEventListener('click', function (e) {
        e.stopPropagation();
    });

    // Attiva il toggle colore (dopo che innerHTML è stato impostato)
    var toggleColore = document.getElementById('editor-colore-enable-' + oggettoId);
    var pickerColore = document.getElementById('editor-colore-' + oggettoId);
    if (toggleColore && pickerColore) {
        toggleColore.addEventListener('change', function () {
            pickerColore.disabled = !this.checked;
        });
    }
}

function chiudiEditorOggetto(itemDiv) {
    itemDiv.classList.remove('editing');
    if (itemDiv._originalHTML) {
        itemDiv.innerHTML = itemDiv._originalHTML;
        itemDiv._originalHTML = null;
        // Riattacca gli event listeners
        var qtyInput = itemDiv.querySelector('.panel-qty-input');
        if (qtyInput) {
            qtyInput.addEventListener('change', function () {
                aggiornaRiepilogoPanel();
                aggiornaStatoPulsante();
                if (typeof WS !== 'undefined' && WS.manualMode && typeof _registraModificaManuale === 'function') {
                    _registraModificaManuale();
                }
            });
            qtyInput.addEventListener('input', function () {
                _allineaQtyRichiesta(itemDiv);
                aggiornaRiepilogoPanel();
                aggiornaStatoPulsante();
            });
        }
        var prioInputCh = itemDiv.querySelector('.panel-prio-input');
        if (prioInputCh) {
            prioInputCh.addEventListener('change', function () {
                itemDiv.dataset.priorita = this.value || '0';
                if (typeof WS !== 'undefined' && WS.manualMode && typeof _registraModificaManuale === 'function') {
                    _registraModificaManuale();
                }
            });
        }
        var btnModifyCh = itemDiv.querySelector('.btn-modify');
        if (btnModifyCh) {
            btnModifyCh.addEventListener('click', function (e) { e.stopPropagation(); apriEditorOggetto(itemDiv); });
        }
        // Riattacca il click-to-select + sincronizza (con supporto multi-select)
        itemDiv.addEventListener('click', function (e) {
            var oidCh = parseInt(itemDiv.dataset.oggettoId) || 0;
            if (!oidCh) return;

            if (e.ctrlKey || e.shiftKey) {
                _togglePanelMultiSel(oidCh, e.ctrlKey, e.shiftKey, itemDiv);
            } else {
                _pulisciPanelMultiSel();
                _panelMultiSelState.oggettiSelezionati.push(itemDiv.dataset.rigaId || itemDiv.dataset.rigaKey || String(oidCh));
                _panelMultiSelState.ultimoCliccato = itemDiv.dataset.rigaId || itemDiv.dataset.rigaKey || String(oidCh);
                itemDiv.classList.add('selected-multi');
                _aggiornaPanelBatchToolbar();

                document.querySelectorAll('.panel-item').forEach(function (el) { el.classList.remove('selected'); });
                itemDiv.classList.add('selected');
                _sincronizzaSelezionePanel(itemDiv);
            }
        });
    }
}

function ricostruisciItemPanel(itemDiv, oggetto, qty) {
    itemDiv._originalHTML = null;
    var qtyOriginale = parseInt(itemDiv.dataset.qtyOriginale, 10) || qty;
    var priorita = parseInt(itemDiv.dataset.priorita) || 0;
    var coloreBar = coloreRiga(itemDiv);
    itemDiv.innerHTML =
        '<div class="panel-item-color" style="background:' + coloreBar + ';"></div>' +
        '<div class="panel-item-info">' +
            '<strong>' + escapeHtml(oggetto.codice) + '</strong>' +
            '<span>' + formatCm(oggetto.lunghezza_mm) + '×' + formatCm(oggetto.larghezza_mm) + '×' + formatCm(oggetto.altezza_mm) + ' cm</span>' +
        '</div>' +
        '<div class="panel-item-qty">' +
            '<input type="number" class="panel-qty-input" value="' + qty + '" min="0" step="1">' +
            '<span class="panel-qty-originale" title="Quantità richiesta: ' + qtyOriginale + '">' + qtyOriginale + '</span>' +
        '</div>' +
        '<div class="panel-item-prio">' +
            '<input type="number" class="panel-prio-input" value="' + priorita + '" min="0" step="1" title="Priorità carico (1 = massima)">' +
        '</div>' +
        '<div class="panel-item-actions">' +
            '<button class="btn-item-action btn-modify" title="Modifica">✏️</button>' +
        '</div>';

    _aggiornaColoreQtyOriginale(itemDiv);
    var qtyInput = itemDiv.querySelector('.panel-qty-input');
    qtyInput.addEventListener('change', function () {
        _aggiornaColoreQtyOriginale(itemDiv);
        aggiornaRiepilogoPanel();
        aggiornaStatoPulsante();
        if (typeof WS !== 'undefined' && WS.manualMode && typeof _registraModificaManuale === 'function') {
            _registraModificaManuale();
        }
    });
    qtyInput.addEventListener('input', function () {
        _allineaQtyRichiesta(itemDiv);
        aggiornaRiepilogoPanel();
        aggiornaStatoPulsante();
        if (typeof WS !== 'undefined' && WS.manualMode && typeof _registraModificaManuale === 'function') {
            _registraModificaManuale();
        }
    });

    // Event listener per priorità
    var prioInput2 = itemDiv.querySelector('.panel-prio-input');
    if (prioInput2) {
        prioInput2.addEventListener('change', function () {
            itemDiv.dataset.priorita = this.value || '0';
            if (typeof WS !== 'undefined' && WS.manualMode && typeof _registraModificaManuale === 'function') {
                _registraModificaManuale();
            }
        });
        prioInput2.addEventListener('input', function () {
            itemDiv.dataset.priorita = this.value || '0';
        });
    }

    var btnModify2 = itemDiv.querySelector('.btn-modify');
    if (btnModify2) {
        btnModify2.addEventListener('click', function (e) { e.stopPropagation(); apriEditorOggetto(itemDiv); });
    }

    itemDiv.addEventListener('click', function (e) {
        var oidR = parseInt(itemDiv.dataset.oggettoId) || 0;
        if (!oidR) return;

        if (e.ctrlKey || e.shiftKey) {
            _togglePanelMultiSel(oidR, e.ctrlKey, e.shiftKey, itemDiv);
        } else {
            _pulisciPanelMultiSel();
            _panelMultiSelState.oggettiSelezionati.push(itemDiv.dataset.rigaId || itemDiv.dataset.rigaKey || String(oidR));
            _panelMultiSelState.ultimoCliccato = itemDiv.dataset.rigaId || itemDiv.dataset.rigaKey || String(oidR);
            itemDiv.classList.add('selected-multi');
            _aggiornaPanelBatchToolbar();

            document.querySelectorAll('.panel-item').forEach(function (el) { el.classList.remove('selected'); });
            itemDiv.classList.add('selected');
            _sincronizzaSelezionePanel(itemDiv);
        }
    });
}

// =============================================================================
// AGGIORNAMENTO COLORE NEI PANEL ITEMS (dopo modifica da Anagrafica)
// =============================================================================

function aggiornaColoreNeiPanelItems(oggettoId, nuovoColore) {
    if (!oggettoId) return;
    // Una modifica del colore in anagrafica NON deve toccare le righe con
    // colore personalizzato: quelle valgono solo per questo carico.
    DOM.panelItemsList.querySelectorAll('.panel-item[data-oggetto-id="' + oggettoId + '"]').forEach(function (itemDiv) {
        if (itemDiv.dataset.coloreCustom === '1') return;
        itemDiv.dataset.colore = '';
        itemDiv.dataset.coloreAuto = '';
    });
    _assegnaColoriAutomatici();
}

// =============================================================================
// VIEWPORT 3D
// =============================================================================

function mostraPlaceholder(titolo, messaggio) {
    DOM.viewportPlaceholder.style.display = 'flex';
    DOM.viewportPlaceholder.querySelector('h3').textContent = titolo || 'Visualizzazione 3D';
    DOM.viewportPlaceholder.querySelector('p').textContent = messaggio || '';
   _setHeaderCaricoLabel('');
   WS.treSceneLoaded = false;
}

function nascondiPlaceholder() {
    DOM.viewportPlaceholder.style.display = 'none';
}

async function caricaScena3D(pianoId) {
    try {
        // Il caricamento di un piano persistito sostituisce completamente la
        // preview automatica: impedisci che uno snapshot precedente venga
        // riutilizzato da un successivo salvataggio.
        if (typeof WS !== 'undefined') WS._autoPreviewPosizioni = null;
        if (typeof avviaVisualizzatore !== 'function') {
            showToast('Modulo 3D non caricato.', 'error');
            return;
        }
        // Passa alla vista viewport 3D (se si era in anagrafica/mezzi/vincoli)
        mostraViewport();
        nascondiPlaceholder();
        // Se la vista 2×2 era attiva, disattivala prima di ricostruire la scena
        if (typeof MVP !== 'undefined' && MVP.attivo) {
            disattivaMultiViewport();
        }
        await avviaVisualizzatore(pianoId);
        WS.treSceneLoaded = true;
        // Resetta MVP.attivo: la vista 2×2 si attiva solo col pulsante ⊞
        if (typeof MVP !== 'undefined') MVP.attivo = false;
        // Aggiorna label toolbar e header
        var piano = WS.piani.find(function (p) { return p.id == pianoId; });
        var nomePiano = piano ? piano.nome : 'Piano #' + pianoId;
        _setHeaderCaricoLabel(nomePiano);
        // Popola il pannello destro con gli oggetti del piano
        await popolaPanelDaPiano(pianoId);
    } catch (error) {
        console.error('Errore scena 3D:', error);
        mostraPlaceholder('Errore', 'Impossibile caricare la visualizzazione 3D: ' + error.message);
    }
}

// =============================================================================
// POPOLA PANNELLO DESTRO DA PIANO SALVATO
// =============================================================================

async function popolaPanelDaPiano(pianoId) {
    try {
        var resp = await fetch('/api/piani/' + pianoId + '/dati_3d/');
        if (!resp.ok) return;
        var data = await resp.json();
        var oggetti3d = data.oggetti || [];

        // Le righe sono lotti distinti: non accorpare mai per codice.
        var odcList = data.oggetti_da_caricare || [];

        // Conta le istanze prima per riga origine e poi, solo come fallback
        // per i piani legacy, per codice.
        var conteggioPerRiga = {};
        var conteggioPerCodice = {};
        oggetti3d.forEach(function (o) {
            var codice = o.codice;
            conteggioPerCodice[codice] = (conteggioPerCodice[codice] || 0) + 1;
            if (o.riga_id !== null && o.riga_id !== undefined) {
                var key = String(o.riga_id);
                conteggioPerRiga[key] = (conteggioPerRiga[key] || 0) + 1;
            }
        });

        // Determina se il piano è stato salvato manualmente (q.tà confermate)
        // o proviene da ottimizzazione automatica (q.tà richieste vs piazzate)
        var isManuale = data.piano && data.piano.algoritmo === 'manuale';

        // Svuota panel e ripopola via aggiungiAlCarico. Il piano nuovo
        // non deve ereditare la selezione manuale del piano precedente.
        if (typeof WS !== 'undefined') {
            WS._manualPanelSelectedOggettoId = null;
            WS._manualPanelSelectedCodice = null;
            WS._manualPanelSelectedRigaId = null;
            WS._manualPanelSelectedRigaKey = null;
        }
        DOM.panelItemsList.innerHTML = '';
        if (typeof WS !== 'undefined') WS._autoPreviewPosizioni = null;

        // La lista di oggetti del piano caricato è SOLO quella del piano stesso.
        // Per i piani legacy senza riga_id viene usato il codice come fallback.
        var codiciLegacyUsati = {};
        for (var i = 0; i < odcList.length; i++) {
            var odc = odcList[i];
            var codice = odc.codice;
            var rigaKey = odc.id ? String(odc.id) : '';
            var conteggioRiga = rigaKey && conteggioPerRiga.hasOwnProperty(rigaKey)
                ? conteggioPerRiga[rigaKey]
                : null;
            // Piani con più righe dello stesso codice: se i posizionamenti NON
            // hanno il legame alla riga (piani salvati prima della funzione),
            // usare il totale del codice mostrerebbe la stessa quantità su tutte
            // le righe. Il fallback corretto è la quantità della singola riga.
            var qty = isManuale
                ? odc.quantita
                : (conteggioRiga !== null
                    ? conteggioRiga
                    : odc.quantita);
            if (!odc.oggetto_id) {
                var anagrafica = trovaOggettoPerCodice(codice);
                if (!anagrafica) continue;
                odc.oggetto_id = anagrafica.id;
            }
            var divEl = aggiungiAlCarico(odc.oggetto_id, qty, true, odc.quantita, odc.id, odc.colore || '');
            if (divEl) {
                divEl.dataset.rigaId = odc.id ? String(odc.id) : '';
                divEl.dataset.priorita = String(odc.priorita || 0);
                var prioInp = divEl.querySelector('.panel-prio-input');
                if (prioInp) prioInp.value = odc.priorita || 0;
            }
            if (!rigaKey && !codiciLegacyUsati[codice]) {
                codiciLegacyUsati[codice] = true;
            }
        }

        // Posizionamenti legacy non associati a nessuna riga: aggiungi una riga
        // di compatibilità solo se il codice non era già rappresentato.
        Object.keys(conteggioPerCodice).forEach(function (codiceLegacy) {
            if (codiciLegacyUsati[codiceLegacy] || odcList.some(function (odc) { return odc.codice === codiceLegacy; })) return;
            var oggettoLegacy = trovaOggettoPerCodice(codiceLegacy);
            if (oggettoLegacy) aggiungiAlCarico(oggettoLegacy.id, conteggioPerCodice[codiceLegacy], true);
        });

        // Riassegna i colori automatici per i codici duplicati rimasti senza
        // colore personalizzato (es. piani salvati prima di questa funzione).
        _assegnaColoriAutomatici();

        DOM.panelEmpty.style.display = DOM.panelItemsList.children.length > 0 ? 'none' : 'flex';
        if (typeof _reimpostaCronologiaManuale === 'function') _reimpostaCronologiaManuale();
        aggiornaRiepilogoPanel();
        aggiornaStatoPulsante();
    } catch (e) {
        console.error('Errore popolamento panel da piano:', e);
    }
}

// =============================================================================
// NUOVO CARICO (reset completo)
// =============================================================================

function nuovoCarico() {
    if (DOM.panelItemsList.children.length > 0 && !confirm('Creare un nuovo carico? Le modifiche non salvate andranno perse.')) return;

    // Azzera anche la selezione manuale persistente del carico precedente.
    if (typeof WS !== 'undefined') {
        WS._manualPanelSelectedOggettoId = null;
        WS._manualPanelSelectedCodice = null;
        WS._manualPanelSelectedRigaId = null;
        WS._manualPanelSelectedRigaKey = null;
    }

    // Nascondi intestazione colonne
    var panelHeader3 = document.getElementById('panel-items-header');
    if (panelHeader3) panelHeader3.style.display = 'none';

    // Disattiva vista 2×2 se era attiva
    if (typeof MVP !== 'undefined' && MVP.attivo) {
        disattivaMultiViewport();
    }

    // Reset stato
    WS.activePianoId = null;
    WS.activeMezzoId = null;
    WS.treSceneLoaded = false;
    nascondiDistribuzionePesi();
    _ultimaDistribuzionePesi = null;
    _distribuzionePesiPianoId = null;
    // Pulisce anche il contenuto della lista sezioni-pesi
    var listPesi = document.getElementById('sezioni-pesi-list');
    if (listPesi) listPesi.innerHTML = '';

    // Svuota pannello destro
    DOM.panelItemsList.innerHTML = '';
    if (typeof WS !== 'undefined') WS._autoPreviewPosizioni = null;
    _pulisciPanelMultiSel();
    DOM.panelEmpty.style.display = 'flex';

    // Reset header
    DOM.headerVehicleSelect.value = '';
    _aggiornaStatoAzioniAuto();
    if (DOM.headerExportBtn) DOM.headerExportBtn.disabled = true;
    if (typeof _aggiornaSidebarRiepilogo === 'function') _aggiornaSidebarRiepilogo(0, 0, 0);

    // Reset viewport 3D
    if (typeof resetScene === 'function') {
        try { resetScene(); } catch (e) {}
    }
    DOM.viewport3d.querySelectorAll('canvas').forEach(function (c) { c.remove(); });
    mostraPlaceholder('Visualizzazione 3D', 'Aggiungi oggetti nel pannello di destra, seleziona un mezzo e dal tab \u26a1 Automatica clicca "Elabora Ottimizzazione" per vedere il carico in 3D.');
   _setHeaderCaricoLabel('');

   // Reset task status
    DOM.taskDot.className = 'task-dot idle';
    DOM.taskStatusText.textContent = 'Nessuna elaborazione in corso';

    setStatus('idle', 'Pronto');
    setActiveView('carico');
    mostraViewport();
    showToast('🆕 Nuovo carico pronto.', 'info');
}

// =============================================================================
// SELEZIONE MULTIPLA PANEL ITEMS (Ctrl+click, Shift+click, batch delete)
// =============================================================================

var _panelMultiSelState = {
    oggettiSelezionati: [],  // chiavi univoche delle righe
    ultimoCliccato: null,    // chiave dell'ultima riga cliccata (per Shift)
};

function _pulisciPanelMultiSel() {
    _panelMultiSelState.oggettiSelezionati = [];
    _panelMultiSelState.ultimoCliccato = null;
    DOM.panelItemsList.querySelectorAll('.panel-item.selected-multi').forEach(function (el) {
        el.classList.remove('selected-multi');
    });
    _aggiornaPanelBatchToolbar();
}

function _aggiornaPanelBatchToolbar() {
    var trashBtn = document.getElementById('panel-header-trash');
    var selSpan = document.getElementById('panel-header-sel');
    if (!trashBtn || !selSpan) return;
    var count = _panelMultiSelState.oggettiSelezionati.length;
    selSpan.textContent = 'sel:' + count;
    if (count >= 1) {
        trashBtn.classList.add('active');
        trashBtn.title = 'Elimina ' + count + ' oggetti selezionati';
    } else {
        trashBtn.classList.remove('active');
        trashBtn.title = 'Elimina oggetti selezionati';
    }
}



function _togglePanelMultiSel(oggettoId, ctrlKey, shiftKey, itemArg) {
    var items = Array.from(DOM.panelItemsList.querySelectorAll('.panel-item'));
    var currentItem = itemArg || items.find(function (el) { return parseInt(el.dataset.oggettoId) == oggettoId; });
    if (!currentItem) return;
    var rowKey = currentItem.dataset.rigaId || currentItem.dataset.rigaKey || String(oggettoId);
    var rowKeyFor = function (el) { return el.dataset.rigaId || el.dataset.rigaKey || String(parseInt(el.dataset.oggettoId) || ''); };

    if (shiftKey && _panelMultiSelState.ultimoCliccato !== null) {
        // Shift+click: seleziona intervallo
        var startItem = items.find(function (el) { return rowKeyFor(el) === _panelMultiSelState.ultimoCliccato; });
        if (startItem) {
            var startIdx = items.indexOf(startItem);
            var endIdx = items.indexOf(currentItem);
            var minIdx = Math.min(startIdx, endIdx);
            var maxIdx = Math.max(startIdx, endIdx);
            for (var i = minIdx; i <= maxIdx; i++) {
                var id = rowKeyFor(items[i]);
                if (_panelMultiSelState.oggettiSelezionati.indexOf(id) === -1) {
                    _panelMultiSelState.oggettiSelezionati.push(id);
                }
                items[i].classList.add('selected-multi');
            }
        }
    } else if (ctrlKey) {
        // Ctrl+click: toggle singolo
        var idx = _panelMultiSelState.oggettiSelezionati.indexOf(rowKey);
        if (idx >= 0) {
            _panelMultiSelState.oggettiSelezionati.splice(idx, 1);
            currentItem.classList.remove('selected-multi');
        } else {
            _panelMultiSelState.oggettiSelezionati.push(rowKey);
            currentItem.classList.add('selected-multi');
        }
    } else {
        // Click semplice: deseleziona tutto e seleziona solo questo
        _pulisciPanelMultiSel();
        _panelMultiSelState.oggettiSelezionati.push(rowKey);
        currentItem.classList.add('selected-multi');
    }

    _panelMultiSelState.ultimoCliccato = rowKey;
    _aggiornaPanelBatchToolbar();
}

function _eliminaPanelItemsBatch() {
    var ids = _panelMultiSelState.oggettiSelezionati;
    if (ids.length === 0) return;

    // Raccogli le righe esatte per messaggio e rimozione.
    var righe = ids.map(function (key) {
        return DOM.panelItemsList.querySelector('.panel-item[data-riga-id="' + key + '"], .panel-item[data-riga-key="' + key + '"]') ||
            Array.from(DOM.panelItemsList.querySelectorAll('.panel-item')).find(function (item) {
                return (item.dataset.rigaId || item.dataset.rigaKey || item.dataset.oggettoId) === key;
            });
    }).filter(function (item) { return !!item; });
    var codici = righe.map(function (item) { return item.dataset.codice || ''; });

    if (!confirm('Rimuovere ' + ids.length + ' oggetti dal carico?\n\n' + codici.join(', '))) return;

    // Azzera subito lo stato logico (prima dell'animazione DOM)
    _panelMultiSelState.oggettiSelezionati = [];
    _panelMultiSelState.ultimoCliccato = null;

    righe.forEach(function (item) {
        if (item) {
            item.style.opacity = '0';
            item.style.transition = 'opacity 0.15s';
            setTimeout(function () { item.remove(); }, 150);
        }
    });

    // Dopo la rimozione, aggiorna UI
    setTimeout(function () {
        _pulisciPanelMultiSel();
        aggiornaRiepilogoPanel();
        aggiornaStatoPulsante();
        if (DOM.panelItemsList.children.length === 0) {
            DOM.panelEmpty.style.display = 'flex';
            var panelHeader2 = document.getElementById('panel-items-header');
            if (panelHeader2) panelHeader2.style.display = 'none';
        }
        if (WS.activePianoId) invalidaDistribuzionePesi();
    }, 200);

    showToast('🗑 Rimossi ' + ids.length + ' oggetti dal carico.', 'info');
}

// =============================================================================
// INIEZIONE CESTINO + CONTA-SELEZIONE NELLA BARRA TITOLO
// =============================================================================

function _iniettaPanelHeaderActions() {
    // Il cestino è ora statico nell'HTML e wired in inizializza() — nulla da fare.
}

// =============================================================================
// DESELEZIONE ITEM PANEL
// =============================================================================

/** Helper: deseleziona tutti gli item selezionati (pannello carico + viste anagrafica). */
function _deselezionaTuttiItemSelezionati() {
    // Pannello "Oggetti nel Carico"
    document.querySelectorAll('#panel-items-list .panel-item.selected, #panel-items-list .panel-item.selected-multi').forEach(function (el) {
        el.classList.remove('selected', 'selected-multi');
    });
    // Viste anagrafica (articoli, mezzi) e impostazioni
    var pvItems = document.querySelectorAll('#pv-list-body .pv-list-item.selected, #pv-list-body .pv-list-item.selected-multi');
    var avevaSelezione = pvItems.length > 0;
    pvItems.forEach(function (el) {
        el.classList.remove('selected', 'selected-multi');
    });
    // Se c'erano elementi selezionati in anagrafica, resetta il form a "Nuovo"
    if (avevaSelezione) {
        if (WS.viewAttiva === 'oggetti' && typeof renderOggettiForm === 'function') {
            renderOggettiForm(null);
        } else if (WS.viewAttiva === 'mezzi' && typeof renderMezziForm === 'function') {
            renderMezziForm(null);
        }
    }
    if (typeof _pulisciPanelMultiSel === 'function') {
        _pulisciPanelMultiSel();
    }
}

// =============================================================================
// AUTOCOMPLETE "AGGIUNGI OGGETTO"
// =============================================================================

var _autocompleteState = {
    activeIndex: -1,
    selectedId: '',
};

function _initPanelAutocomplete() {
    var input = document.getElementById('panel-input-oggetto');
    var dropdown = document.getElementById('panel-autocomplete-dropdown');
    var hiddenSelect = document.getElementById('panel-select-oggetto');
    var addBtn = document.getElementById('btn-panel-add');

    if (!input || !dropdown || !hiddenSelect) return;

    // Costruisci opzioni dal catalogo (sempre aggiornato)
    function buildOptions() {
        var opts = [];
        var catalog = (typeof WS !== 'undefined' && WS.oggettiCatalog) ? WS.oggettiCatalog : [];
        catalog.forEach(function (o) {
            opts.push({
                id: String(o.id),
                codice: o.codice,
                descrizione: o.descrizione || '',
            });
        });
        return opts;
    }

    var allOptions = buildOptions();

    function filterOptions(query) {
        if (!query) return allOptions.slice();
        var q = query.toLowerCase();
        return allOptions.filter(function (o) {
            return o.codice.toLowerCase().indexOf(q) === 0;
        });
    }

    function renderDropdown(matches) {
        dropdown.innerHTML = '';
        _autocompleteState.activeIndex = -1;
        if (matches.length === 0) {
            dropdown.classList.remove('visible');
            return;
        }
        matches.forEach(function (m, i) {
            var div = document.createElement('div');
            div.className = 'panel-autocomplete-item';
            div.dataset.index = i;
            div.dataset.id = m.id;
            div.innerHTML =
                '<span class="panel-autocomplete-item-code">' + escapeHtml(m.codice) + '</span>' +
                '<span class="panel-autocomplete-item-desc">' + escapeHtml(m.descrizione) + '</span>';
            div.addEventListener('mousedown', function (e) {
                e.preventDefault();
                selectOption(m.id, m.codice);
            });
            dropdown.appendChild(div);
        });
        dropdown.classList.add('visible');
    }

    function selectOption(id, codice) {
        _autocompleteState.selectedId = id;
        input.value = codice;
        hiddenSelect.value = id;
        dropdown.classList.remove('visible');
        setTimeout(function () { addBtn.focus(); }, 50);
    }

    function setActive(index) {
        var items = dropdown.querySelectorAll('.panel-autocomplete-item');
        items.forEach(function (item) { item.classList.remove('active'); });
        _autocompleteState.activeIndex = index;
        if (index >= 0 && index < items.length) {
            items[index].classList.add('active');
            items[index].scrollIntoView({ block: 'nearest' });
        }
    }

    // Input: filtra mentre scrivi
    input.addEventListener('input', function () {
        // L'utente sta digitando: il flag _justOpenedByFocus non ha più senso
        _autocompleteState._justOpenedByFocus = false;
        var matches = filterOptions(input.value.trim());
        renderDropdown(matches);
        _autocompleteState.selectedId = '';
        hiddenSelect.value = '';
    });

    // Focus: ricostruisci opzioni e mostra tutti i codici
    // (salta se il dropdown è stato appena chiuso da un click toggle)
    input.addEventListener('focus', function () {
        if (_autocompleteState._toggleSuppress) {
            _autocompleteState._toggleSuppress = false;
            return;
        }
        allOptions = buildOptions();
        var matches = filterOptions(input.value.trim());
        renderDropdown(matches);
        _autocompleteState._justOpenedByFocus = true;
    });

    // Click sull'input: toggle apri/chiudi dropdown
    input.addEventListener('click', function (e) {
        // Se il dropdown è stato appena aperto dal focus, non chiuderlo subito
        if (_autocompleteState._justOpenedByFocus) {
            _autocompleteState._justOpenedByFocus = false;
            return;
        }
        if (dropdown.classList.contains('visible')) {
            dropdown.classList.remove('visible');
            _autocompleteState.activeIndex = -1;
            _autocompleteState._toggleSuppress = true;
        } else {
            allOptions = buildOptions();
            var matches = filterOptions(input.value.trim());
            renderDropdown(matches);
            _autocompleteState._toggleSuppress = false;
        }
    });

    // Keyboard navigation
    input.addEventListener('keydown', function (e) {
        var items = dropdown.querySelectorAll('.panel-autocomplete-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!dropdown.classList.contains('visible')) {
                var matches = filterOptions(input.value.trim());
                renderDropdown(matches);
                setActive(0);
            } else {
                var newIdx = (_autocompleteState.activeIndex + 1) % items.length;
                setActive(newIdx);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (items.length > 0) {
                var newIdxUp = _autocompleteState.activeIndex <= 0 ? items.length - 1 : _autocompleteState.activeIndex - 1;
                setActive(newIdxUp);
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            var activeItem = dropdown.querySelector('.panel-autocomplete-item.active');
            if (activeItem) {
                selectOption(activeItem.dataset.id, activeItem.querySelector('.panel-autocomplete-item-code').textContent);
            } else if (items.length === 1) {
                selectOption(items[0].dataset.id, items[0].querySelector('.panel-autocomplete-item-code').textContent);
            }
        } else if (e.key === 'Escape') {
            dropdown.classList.remove('visible');
            _autocompleteState.activeIndex = -1;
        }
    });

    // Chiudi dropdown al blur
    input.addEventListener('blur', function () {
        setTimeout(function () {
            dropdown.classList.remove('visible');
            _autocompleteState.activeIndex = -1;
            if (_autocompleteState.selectedId) {
                var opt = allOptions.find(function (o) { return o.id == _autocompleteState.selectedId; });
                if (opt) input.value = opt.codice;
            } else {
                input.value = '';
                hiddenSelect.value = '';
            }
        }, 150);
    });

    // Click sul pulsante "+"
    addBtn.addEventListener('click', function () {
        var selId = hiddenSelect.value;
        if (!selId) {
            showToast('Seleziona un oggetto dalla lista.', 'warning');
            return;
        }
        var oggetto = trovaOggetto(parseInt(selId));
        if (!oggetto) {
            showToast('Oggetto non trovato.', 'error');
            return;
        }
        aggiungiAlCarico(parseInt(selId), 1);
        input.value = '';
        hiddenSelect.value = '';
        _autocompleteState.selectedId = '';
        // Chiudi dropdown e NON rifocalizzare l'input (il dropdown resta chiuso)
        dropdown.classList.remove('visible');
        _autocompleteState.activeIndex = -1;
        _autocompleteState._toggleSuppress = true;
    });
}

