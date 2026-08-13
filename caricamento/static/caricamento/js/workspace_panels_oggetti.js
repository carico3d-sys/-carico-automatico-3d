/**
 * Workspace Carico 3D — Panel Anagrafica Oggetti + Vincoli
 *
 * Lista oggetti con vincoli, form creazione/modifica, selezione multipla,
 * batch delete/vincoli, anteprima 3D oggetto.
 *
 * Depends on: workspace_panels.js (mostraPanelView), workspace_core.js (WS, DOM),
 *             preview_oggetto_3d.js (PreviewOggetto3D)
 */

// Stato per il filtro archiviati oggetti
var _oggettiMostraArchiviati = false;

// =============================================================================
// SELEZIONE MULTIPLA OGGETTI — Stato e funzioni
// =============================================================================

var _multiSelState = {
    oggettiSelezionati: [],  // array di ID
    ultimoCliccato: null,    // ID dell'ultimo oggetto cliccato (per Shift)
};

function _pulisciSelezioneMultipla() {
    _multiSelState.oggettiSelezionati = [];
    _multiSelState.ultimoCliccato = null;
    // Rimuovi classe selected-multi da tutti gli item
    var items = document.querySelectorAll('#pv-list-body .pv-list-item');
    items.forEach(function (el) { el.classList.remove('selected-multi'); });
    // Deseleziona checkbox select-all
    var selAll = document.getElementById('pv-select-all');
    if (selAll) selAll.checked = false;
    _aggiornaBatchToolbar();
}

function _aggiornaBatchToolbar() {
    var toolbar = document.getElementById('pv-batch-toolbar');
    if (!toolbar) return;
    var count = _multiSelState.oggettiSelezionati.length;
    if (count >= 2) {
        toolbar.classList.add('visible');
        var countEl = toolbar.querySelector('.pv-batch-count');
        if (countEl) countEl.textContent = count + ' selezionati';
        var delBtn = document.getElementById('pv-batch-delete');
        if (delBtn) delBtn.textContent = '🗑 Elimina ' + count;
        var vincBtn = document.getElementById('pv-batch-vincoli');
        if (vincBtn) vincBtn.textContent = '🔧 Vincoli ' + count;
    } else {
        toolbar.classList.remove('visible');
    }
}

function _toggleSelezioneMultipla(oggettoId, ctrlKey, shiftKey) {
    var items = Array.from(document.querySelectorAll('#pv-list-body .pv-list-item'));
    var currentItem = items.find(function (el) { return parseInt(el.dataset.oggettoId) == oggettoId; });
    if (!currentItem) return;

    if (shiftKey && _multiSelState.ultimoCliccato !== null) {
        // Shift+click: seleziona intervallo tra ultimoCliccato e quello corrente
        var startIdx = items.findIndex(function (el) { return parseInt(el.dataset.oggettoId) == _multiSelState.ultimoCliccato; });
        var endIdx = items.findIndex(function (el) { return el === currentItem; });
        if (startIdx >= 0 && endIdx >= 0) {
            var minIdx = Math.min(startIdx, endIdx);
            var maxIdx = Math.max(startIdx, endIdx);
            for (var i = minIdx; i <= maxIdx; i++) {
                var id = parseInt(items[i].dataset.oggettoId);
                if (_multiSelState.oggettiSelezionati.indexOf(id) === -1) {
                    _multiSelState.oggettiSelezionati.push(id);
                }
                items[i].classList.add('selected-multi');
            }
        }
    } else if (ctrlKey) {
        // Ctrl+click: toggle singolo
        var idx = _multiSelState.oggettiSelezionati.indexOf(oggettoId);
        if (idx >= 0) {
            _multiSelState.oggettiSelezionati.splice(idx, 1);
            currentItem.classList.remove('selected-multi');
        } else {
            _multiSelState.oggettiSelezionati.push(oggettoId);
            currentItem.classList.add('selected-multi');
        }
    } else {
        // Click semplice: deseleziona tutto e seleziona solo questo
        _pulisciSelezioneMultipla();
        _multiSelState.oggettiSelezionati.push(oggettoId);
        currentItem.classList.add('selected-multi');
    }

    _multiSelState.ultimoCliccato = oggettoId;
    _aggiornaBatchToolbar();
}

// =============================================================================
// OPERAZIONI BATCH
// =============================================================================

async function _eseguiEliminazioneBatch() {
    var ids = _multiSelState.oggettiSelezionati;
    if (ids.length === 0) return;

    // Ottieni i codici per il messaggio di conferma
    var oggetti = ids.map(function (id) {
        return trovaOggetto(id);
    }).filter(Boolean);
    var codici = oggetti.map(function (o) { return o.codice; }).join(', ');

    if (!confirm('Eliminare ' + ids.length + ' oggetti?\n\n' + codici + '\n\nNota: gli oggetti posizionati in piani di carico ottimizzati non saranno eliminati.')) return;

    try {
        setStatus('busy', 'Eliminazione batch...');
        var resp = await fetch('/api/oggetti/bulk_delete/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify({ ids: ids }),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();

        // Rimuovi dal WS locale
        ids.forEach(function (id) {
            var idx = WS.oggettiDisponibili.findIndex(function (x) { return x.id == id; });
            if (idx >= 0) WS.oggettiDisponibili.splice(idx, 1);
            // Sincronizza anche il catalogo
            if (WS.oggettiCatalog) {
                var catIdx = WS.oggettiCatalog.findIndex(function (x) { return x.id == id; });
                if (catIdx >= 0) WS.oggettiCatalog.splice(catIdx, 1);
            }
            // Rimuovi anche da vincoli locali
            var vIdx = WS.vincoli.findIndex(function (v) { return v.oggetto_id == id; });
            if (vIdx >= 0) WS.vincoli.splice(vIdx, 1);
        });

        _pulisciSelezioneMultipla();
        aggiornaSelectOggetti();
        renderOggettiPanel();
        showToast('🗑 Eliminati ' + (data.eliminati || ids.length) + ' oggetti!', 'success');
        setStatus('idle', 'Eliminati');
    } catch (err) {
        showToast('❌ Errore eliminazione batch: ' + err.message, 'error');
        setStatus('error', 'Errore');
    }
}

function _apriModaleBatchVincoli() {
    var ids = _multiSelState.oggettiSelezionati;
    if (ids.length === 0) return;

    // Ottieni i codici
    var oggetti = ids.map(function (id) {
        return trovaOggetto(id);
    }).filter(Boolean);

    // Prendi i vincoli del primo oggetto come default
    var primoVincolo = WS.vincoli.find(function (v) { return v.oggetto_id == ids[0]; }) || {};

    // Crea il modale
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
        '<div class="modal-container" style="width:520px;">' +
            '<div class="modal-header">' +
                '<span class="modal-title">🔧 Modifica Vincoli Batch</span>' +
                '<button class="modal-close" id="modal-batch-close">&times;</button>' +
            '</div>' +
            '<div class="modal-body">' +
                '<div class="field-group">' +
                    '<label class="field-label">Oggetti selezionati (' + oggetti.length + ')</label>' +
                    '<div class="batch-oggetti-lista">' +
                        oggetti.map(function (o) {
                            var col = (typeof coloreOggetto === 'function') ? coloreOggetto(o) : (o.colore || '#447e9b');
                            return '<span class="batch-oggetti-tag"><span class="tag-color" style="background:' + col + ';"></span>' + escapeHtml(o.codice) + '</span>';
                        }).join('') +
                    '</div>' +
                '</div>' +
                '<hr style="border:none;border-top:1px solid #eee;margin:4px 0;">' +
                '<div class="field-group"><label class="field-label">Orientamento</label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="batch-vinc-rot-x" ' + (primoVincolo.rotazione_su_x !== false ? 'checked' : '') + '> Rotazione su X</label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="batch-vinc-rot-y" ' + (primoVincolo.rotazione_su_y !== false ? 'checked' : '') + '> Rotazione su Y</label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="batch-vinc-rot-z" ' + (primoVincolo.rotazione_su_z !== false ? 'checked' : '') + '> Rotazione su Z</label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="batch-vinc-nocap" ' + (primoVincolo.rotazione_consentita === false ? 'checked' : '') + '> Non capovolgere</label>' +
                '</div>' +
                '<div class="field-group"><label class="field-label">Impilabilità</label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="batch-vinc-sovrapp" ' + (primoVincolo.sovrapponibile !== false ? 'checked' : '') + '> Può sostenere altri oggetti</label>' +
                '</div>' +
                '<div class="field-group"><label class="field-label">Peso max sul tetto (kg)</label>' +
                    '<input type="number" class="form-input" id="batch-vinc-pesomax" value="' + (primoVincolo.peso_massimo_tetto_kg || 0) + '" min="0" step="0.5">' +
                '</div>' +
                '<div class="field-group">' +
                    '<label class="checkbox-label"><input type="checkbox" id="batch-vinc-piano" ' + (primoVincolo.solo_su_piano === true ? 'checked' : '') + '> Solo su pavimento</label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="batch-vinc-fragile" ' + (primoVincolo.fragile === true ? 'checked' : '') + '> ⚠️ Oggetto fragile</label>' +
                '</div>' +
            '</div>' +
            '<div class="modal-footer">' +
                '<button class="btn" id="modal-batch-cancel">Annulla</button>' +
                '<button class="btn btn-primary" id="modal-batch-save">💾 Applica a ' + oggetti.length + ' oggetti</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    // Eventi chiusura
    var close = function () { overlay.remove(); };
    document.getElementById('modal-batch-close').addEventListener('click', close);
    document.getElementById('modal-batch-cancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    // Salva
    document.getElementById('modal-batch-save').addEventListener('click', async function () {
        var payload = {
            rotazione_consentita: !document.getElementById('batch-vinc-nocap').checked,
            rotazione_su_x: document.getElementById('batch-vinc-rot-x').checked,
            rotazione_su_y: document.getElementById('batch-vinc-rot-y').checked,
            rotazione_su_z: document.getElementById('batch-vinc-rot-z').checked,
            sovrapponibile: document.getElementById('batch-vinc-sovrapp').checked,
            peso_massimo_tetto_kg: parseFloat(document.getElementById('batch-vinc-pesomax').value) || 0,
            solo_su_piano: document.getElementById('batch-vinc-piano').checked,
            fragile: document.getElementById('batch-vinc-fragile').checked,
        };

        try {
            setStatus('busy', 'Salvataggio vincoli batch...');
            var resp = await fetch('/api/oggetti/bulk_vincoli/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify({ ids: ids, vincoli: payload }),
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var data = await resp.json();

            // Aggiorna WS locale
            ids.forEach(function (id) {
                var idx = WS.vincoli.findIndex(function (v) { return v.oggetto_id == id; });
                var entry = Object.assign({ oggetto_id: id }, payload);
                if (idx >= 0) WS.vincoli[idx] = entry; else WS.vincoli.push(entry);
            });

            close();
            _pulisciSelezioneMultipla();
            // Riapri la vista per aggiornare i badge nella lista
            renderOggettiPanel();
            showToast('✅ Vincoli aggiornati per ' + (data.aggiornati || ids.length) + ' oggetti!', 'success');
            setStatus('idle', 'Vincoli salvati');
        } catch (err) {
            showToast('❌ Errore: ' + err.message, 'error');
            setStatus('error', 'Errore');
        }
    });
}

// --- Anagrafica Oggetti ---

// Helper: costruisce l'HTML della lista oggetti (usato da renderOggettiPanel e _aggiornaListaOggettiESeleziona)
function _buildOggettiListHtml() {
    var listHtml = '';
    WS.oggettiDisponibili.forEach(function (o) {
        // Filtro esclusivo: default mostra solo attivi, con checkbox mostra solo archiviati
        if (!!o.archiviato !== _oggettiMostraArchiviati) return;
        var coloreDisplay = (typeof coloreOggetto === 'function') ? coloreOggetto(o) : (o.colore || '#447e9b');
        var v = WS.vincoli.find(function (x) { return x.oggetto_id == o.id; });
        var vincInfo = v ? ((v.fragile ? '⚠️ Fragile ' : '') + (!v.sovrapponibile ? '📦 No impil ' : '') + (v.solo_su_piano ? '⬇️ Pavimento' : '')) : '';
        if (vincInfo) vincInfo = ' · ' + vincInfo.trim();
        var archBadge = o.archiviato ? ' <span style="font-size:10px;color:#999;">📁 archiviato</span>' : '';
        listHtml += '<div class="pv-list-item" data-oggetto-id="' + o.id + '">' +
            '<div style="width:4px;height:28px;border-radius:2px;background:' + coloreDisplay + ';flex-shrink:0;"></div>' +
            '<div class="pv-list-item-info">' +
                '<strong>' + escapeHtml(o.codice) + '</strong>' +
                '<span>' + escapeHtml((o.descrizione || '').substring(0, 35)) + ' · ' + formatCm(o.lunghezza_mm) + '×' + formatCm(o.larghezza_mm) + '×' + formatCm(o.altezza_mm) + ' cm · ' + o.peso_kg + ' kg' + vincInfo + archBadge + '</span>' +
            '</div>' +
        '</div>';
    });
    return listHtml || '<div class="pv-empty"><span class="pv-empty-icon">📦</span><span>Nessun oggetto censito</span></div>';
}

// Helper: wiring click sugli item della lista (usato da renderOggettiPanel e _aggiornaListaOggettiESeleziona)
function _wireOggettiListClickHandlers() {
    DOM.pvListBody.querySelectorAll('.pv-list-item').forEach(function (item) {
        item.addEventListener('click', function (e) {
            var oid = parseInt(item.dataset.oggettoId) || 0;
            if (!oid) return;
            if (e.ctrlKey || e.shiftKey) {
                _toggleSelezioneMultipla(oid, e.ctrlKey, e.shiftKey);
            } else {
                _pulisciSelezioneMultipla();
                _multiSelState.oggettiSelezionati.push(oid);
                _multiSelState.ultimoCliccato = oid;
                item.classList.add('selected-multi');
                _aggiornaBatchToolbar();
                DOM.pvListBody.querySelectorAll('.pv-list-item').forEach(function (el) { el.classList.remove('selected'); });
                item.classList.add('selected');
                renderOggettiForm(oid);
                _aggiornaPreview3D(oid);
            }
        });
    });
}

function renderOggettiPanel() {
    if (typeof _panelViewPronto === 'function' && !_panelViewPronto('oggetti')) return;
    DOM.pvListTitle.innerHTML = '<i class="bi bi-box-seam"></i> Anagrafica Oggetti + Vincoli';
    DOM.pvListCount.textContent = WS.oggettiDisponibili.filter(function (o) { return !!o.archiviato === _oggettiMostraArchiviati; }).length;

    // Mostra paginazione oggetti (nascosta nelle altre viste)
    var oggettiPagEl = document.getElementById('oggetti-pagination');
    if (oggettiPagEl) oggettiPagEl.style.display = '';
    
    // Reset stato selezione multipla
    _multiSelState.oggettiSelezionati = [];
    _multiSelState.ultimoCliccato = null;
    
    // Save original form structure for restoration
    var formEl = document.getElementById('panel-view-form');
    var listEl = document.getElementById('panel-view-list');
    if (!formEl || !listEl) {
        console.error('[Oggetti] Contenitori del pannello mancanti.');
        return;
    }
    _origFormInnerHTML = formEl.innerHTML;
    
    // Set list to 30%
    listEl.style.flex = '0 0 30%';
    
    // Rebuild form area as 2-column (object form + vincoli) + 3D preview below
    formEl.innerHTML = 
        '<div class="pv-oggetti-split">' +
            '<div class="pv-oggetti-form-col">' +
                '<div class="pv-form-header"><h4 id="pv-oggetti-form-title">➕ Nuovo Oggetto</h4></div>' +
                '<div class="pv-form-body" id="pv-oggetti-form-body"></div>' +
            '</div>' +
            '<div class="pv-vincoli-col">' +
                '<div class="pv-form-header"><h4 id="pv-vincoli-title">🔧 Vincoli</h4></div>' +
                '<div class="pv-vincoli-body" id="pv-vincoli-body">' +
                    '<p style="color:#999;text-align:center;padding:40px;">Seleziona un oggetto per configurare i vincoli.</p>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div id="pv-oggetti-actions" style="padding:0 8px;"></div>' +
        '<div class="pv-3d-preview">' +
            '<div class="pv-3d-header">' +
                '<span class="pv-3d-title">🎯 Anteprima 3D Oggetto</span>' +
                '<span class="pv-3d-hint" title="Trascina per ruotare su X e Y • Trascina in diagonale per ruotare anche Z • Shift+trascina per Z puro • Destro per spostare la vista • Scroll per zoom">🖱️ Trascina=X,Y | Shift+Trascina=Z | Diagonale=XYZ | Destro=Pan | Scroll=Zoom</span>' +
                '<span class="pv-3d-axis-status" id="pv3d-axis-status">' +
                    '<span class="axis-dot" data-axis="x" style="background:#ff4444;"></span>' +
                    '<span class="axis-dot" data-axis="y" style="background:#44ff44;"></span>' +
                    '<span class="axis-dot" data-axis="z" style="background:#4444ff;"></span>' +
                '</span>' +
                '<span class="pv-3d-badge" id="pv3d-rot-badge">🔄 Tutti gli assi abilitati</span>' +
                '<button class="btn btn-sm" id="pv3d-btn-reset-vista" title="Resetta camera">🏠 Reset vista</button>' +
                '<button class="btn btn-sm" id="pv3d-btn-reset-oggetto" title="Resetta rotazione/posizione">↺ Reset oggetto</button>' +
            '</div>' +
            '<div class="pv-3d-canvas-wrap" id="pv-3d-canvas-wrap">' +
                '<div class="pv-3d-placeholder" id="pv-3d-placeholder">' +
                    '<span class="pv-3d-placeholder-icon">📦</span>' +
                    '<span>Seleziona un oggetto per visualizzarlo in 3D</span>' +
                '</div>' +
            '</div>' +
            '<div class="pv-3d-controls">' +
                '<div class="pv-3d-controls-row pv-3d-rot-row">' +
                    '<span class="pv-3d-rot-status">🖱️ Trascina sul canvas per ruotare</span>' +
                    '<span class="pv-3d-rot-angles">' +
                        '<span class="pv-3d-rot-axis"><span style="color:#ff4444;">X</span> <span class="pv-3d-rot-angle" id="pv3d-rot-x-angle">0°</span></span>' +
                        '<span style="margin:0 4px;color:#ccc;">|</span>' +
                        '<span class="pv-3d-rot-axis"><span style="color:#44ff44;">Y</span> <span class="pv-3d-rot-angle" id="pv3d-rot-y-angle">0°</span></span>' +
                        '<span style="margin:0 4px;color:#ccc;">|</span>' +
                        '<span class="pv-3d-rot-axis"><span style="color:#4444ff;">Z</span> <span class="pv-3d-rot-angle" id="pv3d-rot-z-angle">0°</span></span>' +
                    '</span>' +
                '</div>' +

            '</div>' +
        '</div>';
    
    // Reassign DOM refs so renderOggettiForm() writes to the new form column
    DOM.pvFormTitle = document.getElementById('pv-oggetti-form-title');
    DOM.pvFormBody = document.getElementById('pv-oggetti-form-body');
    
    // ---- HEADER: Rimuovi vecchi e aggiungi select-all + batch toolbar ----
    var listHeader = document.querySelector('#panel-view-list .pv-list-header');
    if (listHeader) {
        // Rimuovi select-all esistente per evitare duplicati
        var oldSelAll = listHeader.querySelector('.pv-list-select-all');
        if (oldSelAll) oldSelAll.remove();
        var oldArchCheck = listHeader.querySelector('.pv-list-archiviati');
        if (oldArchCheck) oldArchCheck.remove();
        
        // Aggiungi checkbox select-all
        var selectAllHtml = '<label class="pv-list-select-all" title="Seleziona/Deseleziona tutti">' +
            '<input type="checkbox" id="pv-select-all" autocomplete="off"> Seleziona tutti</label>';
        listHeader.insertAdjacentHTML('afterbegin', selectAllHtml);

        // Checkbox "Archiviati" — creato via DOM per evitare autofill browser
        var archLabel = document.createElement('label');
        archLabel.className = 'pv-list-select-all pv-list-archiviati';
        archLabel.title = 'Mostra/Nascondi oggetti archiviati';
        archLabel.style.marginLeft = 'auto';
        var archCheck = document.createElement('input');
        archCheck.type = 'checkbox';
        archCheck.id = 'pv-show-archiviati-oggetti';
        archCheck.checked = _oggettiMostraArchiviati;
        archLabel.appendChild(archCheck);
        archLabel.appendChild(document.createTextNode(' Archiviati'));
        listHeader.appendChild(archLabel);
        
        // Evento select-all
        var selAll = document.getElementById('pv-select-all');
        if (selAll) {
            selAll.addEventListener('change', function () {
                if (this.checked) {
                    // Seleziona tutti
                    var items = document.querySelectorAll('#pv-list-body .pv-list-item');
                    items.forEach(function (item) {
                        var id = parseInt(item.dataset.oggettoId);
                        if (_multiSelState.oggettiSelezionati.indexOf(id) === -1) {
                            _multiSelState.oggettiSelezionati.push(id);
                        }
                        item.classList.add('selected-multi');
                    });
                } else {
                    // Deseleziona tutti
                    _pulisciSelezioneMultipla();
                }
                _aggiornaBatchToolbar();
            });
        }
        // Difesa da autofill browser: se il browser ha auto-compilato, ripristina
        if (archCheck.checked !== _oggettiMostraArchiviati) {
            archCheck.checked = _oggettiMostraArchiviati;
        }
        archCheck.addEventListener('change', function () {
            _pulisciSelezioneMultipla();
            _oggettiMostraArchiviati = this.checked;
            DOM.pvListCount.textContent = WS.oggettiDisponibili.filter(function (o) {
                return !!o.archiviato === _oggettiMostraArchiviati;
            }).length;
            DOM.pvListBody.innerHTML = _buildOggettiListHtml();
            _wireOggettiListClickHandlers();
        });
    }
    
    // ---- BATCH TOOLBAR (rimuovi vecchie per evitare duplicati) ----
    var oldToolbar = document.getElementById('pv-batch-toolbar');
    if (oldToolbar) oldToolbar.remove();
    var oldMezziToolbar = document.getElementById('pv-batch-toolbar-mezzi');
    if (oldMezziToolbar) oldMezziToolbar.remove();
    var oldPianiToolbar = document.getElementById('pv-batch-toolbar-piani');
    if (oldPianiToolbar) oldPianiToolbar.remove();
    
    var batchToolbarHtml = 
        '<div class="pv-batch-toolbar" id="pv-batch-toolbar">' +
            '<span class="pv-batch-count">0 selezionati</span>' +
            '<button class="btn btn-danger" id="pv-batch-delete">🗑 Elimina</button>' +
            '<button class="btn btn-primary" id="pv-batch-vincoli">🔧 Vincoli</button>' +
            '<button class="btn btn-sm" id="pv-batch-clear" title="Cancella selezione">✕</button>' +
        '</div>';
    
    // Inserisci toolbar dopo l'header
    if (listHeader && listHeader.parentNode) {
        listHeader.parentNode.insertBefore(
            (function () { var d = document.createElement('div'); d.innerHTML = batchToolbarHtml; return d.firstElementChild; })(),
            listHeader.nextSibling
        );
    }
    
    // Wire batch buttons
    var batchDel = document.getElementById('pv-batch-delete');
    if (batchDel) batchDel.addEventListener('click', _eseguiEliminazioneBatch);
    var batchVinc = document.getElementById('pv-batch-vincoli');
    if (batchVinc) batchVinc.addEventListener('click', _apriModaleBatchVincoli);
    var batchClear = document.getElementById('pv-batch-clear');
    if (batchClear) batchClear.addEventListener('click', _pulisciSelezioneMultipla);
    
    // Build list with vincoli summary + checkbox
    DOM.pvListBody.innerHTML = _buildOggettiListHtml();
    _wireOggettiListClickHandlers();
    
    // Default: new object form (mostra vincoli default internamente)
    renderOggettiForm(null);
    
    // Init 3D preview scene
    if (typeof PreviewOggetto3D !== 'undefined') {
        var wrap = document.getElementById('pv-3d-canvas-wrap');
        if (wrap) {
            var ph = document.getElementById('pv-3d-placeholder');
            if (ph) ph.style.display = 'flex';
            PreviewOggetto3D.init('pv-3d-canvas-wrap');
        }
    }
    
    // Wire up 3D preview controls
    _wiringPreview3D();
}

function _aggiornaPreview3D(oggettoId) {
    if (typeof PreviewOggetto3D === 'undefined') return;
    var o = trovaOggetto(oggettoId);
    if (!o) return;
    var v = WS.vincoli.find(function (x) { return x.oggetto_id == oggettoId; }) || {};
    
    // Hide placeholder, show canvas
    var placeholder = document.getElementById('pv-3d-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    
    // Enable sliders
    ['x', 'y', 'z'].forEach(function (axis) {
        var rotS = document.getElementById('pv3d-rot-' + axis);
        if (rotS) rotS.disabled = false;
        var transS = document.getElementById('pv3d-trans-' + axis);
        if (transS) transS.disabled = false;
    });
    
    PreviewOggetto3D.aggiorna(o, v);
}    function _wiringPreview3D() {
        function _preview3dSafe(fn) {
            return function () {
                if (typeof PreviewOggetto3D === 'undefined') return;
                fn.apply(this, arguments);
            };
        }
    
    // Translation sliders
    ['x', 'y', 'z'].forEach(function (axis) {
        var slider = document.getElementById('pv3d-trans-' + axis);
        if (slider) {
            slider.addEventListener('input', _preview3dSafe(function () {
                PreviewOggetto3D.setTraslazione(axis, this.value);
                var valEl = document.getElementById('pv3d-trans-' + axis + '-val');
                if (valEl) valEl.textContent = this.value;
            }));
        }
    });
    
    // Reset vista
    var resetVistaBtn = document.getElementById('pv3d-btn-reset-vista');
    if (resetVistaBtn) {
        resetVistaBtn.addEventListener('click', _preview3dSafe(function () {
            PreviewOggetto3D.resetVista();
        }));
    }
    
    // Reset oggetto (rot/trans)
    var resetOggettoBtn = document.getElementById('pv3d-btn-reset-oggetto');
    if (resetOggettoBtn) {
        resetOggettoBtn.addEventListener('click', _preview3dSafe(function () {
            PreviewOggetto3D.resettaOggetto();
        }));
    }
}

function renderOggettiForm(oggettoId) {
    if (!DOM.pvFormTitle || !DOM.pvFormBody ||
        !DOM.pvFormTitle.isConnected || !DOM.pvFormBody.isConnected) {
        console.error('[Oggetti] Form dinamico non disponibile.');
        return;
    }
    var o = oggettoId ? trovaOggetto(oggettoId) : null;
    var isEdit = !!o;
    var coloreVal = o ? ((typeof coloreOggetto === 'function') ? coloreOggetto(o) : (o.colore || '#447e9b')) : '#447e9b';
    var hasColor = !!(o && o.colore && o.colore.trim());

    // Controlla se l'oggetto ha VincoloTraOggetti attivi → blocca modifica dimensioni
    var hasVincoliAnagrafica = isEdit && WS.vincoliTra.some(function (v) {
        return v.attivo && (v.oggetto_a === oggettoId || v.oggetto_b === oggettoId);
    });

    DOM.pvFormTitle.innerHTML = isEdit ? '<i class="bi bi-pencil"></i> Modifica: ' + escapeHtml(o.codice) : '<i class="bi bi-plus-circle"></i> Nuovo Oggetto';

    // Deseleziona lista se in modalità creazione e mostra vincoli default
    if (!isEdit) {
        _pulisciSelezioneMultipla();
        DOM.pvListBody.querySelectorAll('.pv-list-item.selected').forEach(function (el) { el.classList.remove('selected'); });
    }

    var formHtml =
        '<div class="field-row">' +
            '<div class="field-group" style="flex:0 0 130px;"><label class="field-label">Codice</label><input type="text" class="form-input" id="pv-ogg-codice" value="' + (o ? escapeHtml(o.codice) : '') + '" placeholder="Es. CART-102"></div>' +
            '<div class="field-group flex-grow"><label class="field-label">Descrizione</label><input type="text" class="form-input" id="pv-ogg-desc" value="' + (o ? escapeHtml(o.descrizione || '') : '') + '" placeholder="Scatole cartone"></div>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-group flex-grow"><label class="field-label">L (cm)' + (hasVincoliAnagrafica ? ' 🔒' : '') + '</label><input type="number" class="form-input" id="pv-ogg-lungh" value="' + (o ? formatCm(o.lunghezza_mm) : '') + '" placeholder="Lunghezza in cm" step="0.1" min="0.1"' + (hasVincoliAnagrafica ? ' disabled title="Dimensioni bloccate: l\'oggetto ha vincoli sopra attivi"' : '') + '></div>' +
            '<div class="field-group flex-grow"><label class="field-label">P (cm)' + (hasVincoliAnagrafica ? ' 🔒' : '') + '</label><input type="number" class="form-input" id="pv-ogg-larg" value="' + (o ? formatCm(o.larghezza_mm) : '') + '" placeholder="Larghezza in cm" step="0.1" min="0.1"' + (hasVincoliAnagrafica ? ' disabled title="Dimensioni bloccate: l\'oggetto ha vincoli sopra attivi"' : '') + '></div>' +
            '<div class="field-group flex-grow"><label class="field-label">H (cm)' + (hasVincoliAnagrafica ? ' 🔒' : '') + '</label><input type="number" class="form-input" id="pv-ogg-alt" value="' + (o ? formatCm(o.altezza_mm) : '') + '" placeholder="Altezza in cm" step="0.1" min="0.1"' + (hasVincoliAnagrafica ? ' disabled title="Dimensioni bloccate: l\'oggetto ha vincoli sopra attivi"' : '') + '></div>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-group flex-grow"><label class="field-label">Peso (kg)</label><input type="number" class="form-input" id="pv-ogg-peso" value="' + (o ? o.peso_kg : '') + '" placeholder="Peso in kg" step="0.01" min="0.01"></div>' +
            '<div class="field-group flex-grow"><label class="field-label">Q.tà Disp.</label><input type="number" class="form-input" id="pv-ogg-qty" value="' + (o ? (o.quantita || 1) : 1) + '" min="1" step="1"></div>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-group" style="flex:0 0 70px;"><label class="field-label">Colore</label><input type="color" class="form-input" id="pv-ogg-colore" value="' + coloreVal + '" style="height:36px;padding:2px 4px;cursor:pointer;"' + (!isEdit && !hasColor ? ' disabled' : '') + '></div>' +
            '<div class="field-group flex-grow" style="flex-direction:row;justify-content:flex-end;align-items:flex-end;gap:12px;"><label class="checkbox-label" style="margin-top:0;"><input type="checkbox" id="pv-ogg-colore-enable" ' + (hasColor ? 'checked' : '') + '> 🎨 Colore personalizzato</label><label class="checkbox-label" style="margin-top:0;"><input type="checkbox" id="pv-ogg-archiviato"' + (o && o.archiviato ? ' checked' : '') + '> Archivia</label></div>' +
        '</div>';
    DOM.pvFormBody.innerHTML = formHtml;

    // --- Bottoni azione sopra la preview 3D (spostati fuori dal form) ---
    var actionsEl = document.getElementById('pv-oggetti-actions');
    if (actionsEl) {
        var lockMsg = (hasVincoliAnagrafica ? '<div class="field-row"><div class="field-note" style="color:#e67e22;font-size:11px;margin-bottom:4px;">🔒 Oggetto bloccato: ha vincoli "sopra" attivi con altri oggetti. Dimensioni, orientamento e impilabilità non sono modificabili. Rimuovi i vincoli in 🔗 Vincoli tra Oggetti per sbloccare.</div></div>' : '');
        if (isEdit) {
            actionsEl.innerHTML = lockMsg +
                '<div class="field-row" style="gap:8px;padding:4px 0;">' +
                    '<button class="btn" id="pv-ogg-nuovo">➕ Nuovo</button>' +
                    '<button class="btn btn-primary" style="flex:1;" id="pv-ogg-save">💾 Aggiorna</button>' +
                    '<button class="btn btn-danger" id="pv-ogg-delete">🗑 Elimina</button>' +
                '</div>';
        } else {
            actionsEl.innerHTML = lockMsg +
                '<div class="field-row" style="gap:8px;padding:4px 0;">' +
                    '<button class="btn btn-primary" style="flex:1;" id="pv-ogg-save">➕ Crea Oggetto</button>' +
                '</div>';
        }
    }

    // Toggle colore
    setTimeout(function () {
        var toggle = document.getElementById('pv-ogg-colore-enable');
        var picker = document.getElementById('pv-ogg-colore');
        if (toggle && picker) {
            toggle.addEventListener('change', function () { picker.disabled = !this.checked; });
        }
    }, 50);

    // Pulsante Nuovo (solo in modifica)
    var nuovoBtn = document.getElementById('pv-ogg-nuovo');
    if (nuovoBtn) {
        nuovoBtn.addEventListener('click', function () { renderOggettiForm(null); });
    }

    // --- Render vincoli nella colonna destra (unificato con il form oggetto) ---
    if (!isEdit) {
        _mostraVincoliDefault();
    } else {
        renderVincoliInOggetti(oggettoId);
    }

    document.getElementById('pv-ogg-save').addEventListener('click', async function () {
        var codice = document.getElementById('pv-ogg-codice').value.trim();
        var desc = document.getElementById('pv-ogg-desc').value.trim();
        var lungh = parseFloat(document.getElementById('pv-ogg-lungh').value);
        var larg = parseFloat(document.getElementById('pv-ogg-larg').value);
        var alt = parseFloat(document.getElementById('pv-ogg-alt').value);
        var peso = parseFloat(document.getElementById('pv-ogg-peso').value);
        var qty = parseInt(document.getElementById('pv-ogg-qty').value) || 1;
        var coloreEn = document.getElementById('pv-ogg-colore-enable').checked;
        var colore = coloreEn ? document.getElementById('pv-ogg-colore').value.trim() : '';
        if (!codice || !lungh || !larg || !alt || !peso) { showToast('Compila tutti i campi.', 'warning'); return; }

        // Controllo vincoli: blocca se dimensioni cambiate e oggetto ha vincoli attivi
        if (isEdit && o) {
            var nuoveDims = {
                l: Math.round(lungh * 10),
                p: Math.round(larg * 10),
                h: Math.round(alt * 10),
            };
            var dimsCambiateAnagrafica = (nuoveDims.l !== o.lunghezza_mm || nuoveDims.p !== o.larghezza_mm || nuoveDims.h !== o.altezza_mm);
            if (dimsCambiateAnagrafica) {
                var haVincoli = WS.vincoliTra.some(function (v) {
                    return v.attivo && (v.oggetto_a === oggettoId || v.oggetto_b === oggettoId);
                });
                if (haVincoli) {
                    showToast('🔒 Impossibile modificare le dimensioni: questo oggetto ha vincoli "sopra" attivi con altri oggetti. Rimuovili in 🔗 Vincoli tra Oggetti.', 'error');
                    return;
                }
            }
        }

        try {
            setStatus('busy', 'Salvataggio...');
            var url = isEdit ? '/api/oggetti/' + oggettoId + '/' : '/api/oggetti/';
            var method = isEdit ? 'PATCH' : 'POST';
            var archiviato = document.getElementById('pv-ogg-archiviato')?.checked || false;
            var body = isEdit
                ? JSON.stringify({ codice: codice, descrizione: desc, lunghezza_mm: Math.round(lungh * 10), larghezza_mm: Math.round(larg * 10), altezza_mm: Math.round(alt * 10), peso_kg: peso, quantita_disponibile: qty, colore: colore, archiviato: archiviato })
                : JSON.stringify({ codice: codice, descrizione: desc, lunghezza_cm: lungh, larghezza_cm: larg, altezza_cm: alt, peso_kg: peso, quantita_disponibile: qty, colore: colore, archiviato: archiviato });

            var resp = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() }, body: body });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var data = await resp.json();
            var serverId = Number(data.id);

            if (isEdit) {
                // Salva il vecchio codice prima di aggiornare (i mesh 3D hanno ancora quello)
                var vecchioCodice = (trovaOggetto(oggettoId) || {}).codice;
                var idx = WS.oggettiDisponibili.findIndex(function (x) { return x.id == oggettoId; });
                if (idx >= 0) {
                    WS.oggettiDisponibili[idx] = { id: serverId, codice: data.codice, descrizione: data.descrizione, lunghezza_mm: data.lunghezza_mm, larghezza_mm: data.larghezza_mm, altezza_mm: data.altezza_mm, peso_kg: data.peso_kg, quantita: data.quantita_disponibile, colore: data.colore || '', archiviato: archiviato };
                }
                // Aggiorna colore nei panel items del carico attuale (se presenti)
                if (typeof aggiornaColoreNeiPanelItems === 'function') {
                    aggiornaColoreNeiPanelItems(oggettoId, colore || '#447e9b');
                }
                // Aggiorna colore nella scena 3D — usa il vecchio codice (i mesh hanno ancora quello)
                if (typeof aggiornaColoreOggettoInScena === 'function' && (vecchioCodice || codice)) {
                    aggiornaColoreOggettoInScena(vecchioCodice || codice, colore || '#447e9b');
                }
            } else {
                WS.oggettiDisponibili.push({ id: serverId, codice: data.codice, descrizione: data.descrizione, lunghezza_mm: data.lunghezza_mm, larghezza_mm: data.larghezza_mm, altezza_mm: data.altezza_mm, peso_kg: data.peso_kg, quantita: data.quantita_disponibile, colore: data.colore || '', archiviato: archiviato });
                // Sincronizza anche il catalogo
                if (WS.oggettiCatalog) {
                    WS.oggettiCatalog.push({ id: serverId, codice: data.codice, descrizione: data.descrizione, lunghezza_mm: data.lunghezza_mm, larghezza_mm: data.larghezza_mm, altezza_mm: data.altezza_mm, peso_kg: data.peso_kg, quantita: data.quantita_disponibile, colore: data.colore || '', archiviato: archiviato });
                }
            }
            aggiornaSelectOggetti();
            // Aggiorna la lista mantenendo il form sull'oggetto salvato
            // Salva anche i vincoli (unificato con il salvataggio oggetto)
            var targetId = isEdit ? oggettoId : serverId;
            try {
                var vincPayload = {
                    rotazione_consentita: !document.getElementById('pv-vinc-nocap').checked,
                    rotazione_su_x: document.getElementById('pv-vinc-rot-x').checked,
                    rotazione_su_y: document.getElementById('pv-vinc-rot-y').checked,
                    rotazione_su_z: document.getElementById('pv-vinc-rot-z').checked,
                    sovrapponibile: document.getElementById('pv-vinc-sovrapp').checked,
                    peso_massimo_tetto_kg: parseFloat(document.getElementById('pv-vinc-pesomax').value) || 0,
                    solo_su_piano: document.getElementById('pv-vinc-piano').checked,
                    fragile: document.getElementById('pv-vinc-fragile').checked,
                };
                var vincResp = await fetch('/api/oggetti/' + targetId + '/vincoli/', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                    body: JSON.stringify(vincPayload),
                });
                if (vincResp.ok) {
                    var vincIdx = WS.vincoli.findIndex(function (x) { return x.oggetto_id == targetId; });
                    var entry = Object.assign({ oggetto_id: targetId }, vincPayload);
                    if (vincIdx >= 0) WS.vincoli[vincIdx] = entry; else WS.vincoli.push(entry);
                }
            } catch (_) { /* vincoli save fallito silenziosamente, non bloccare il flusso */ }

            _aggiornaListaOggettiESeleziona(isEdit ? oggettoId : serverId);
            showToast(isEdit ? '✅ Oggetto aggiornato!' : '✅ Oggetto creato!', 'success');
            setStatus('idle', 'Salvato');
        } catch (err) { showToast('❌ Errore: ' + err.message, 'error'); setStatus('error', 'Errore'); }
    });

    // Delete oggetto (solo in modifica)
    var deleteBtn = document.getElementById('pv-ogg-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async function (e) {
            e.stopPropagation();
            if (!confirm('Eliminare l\'oggetto "' + (o ? escapeHtml(o.codice) : '') + '"?\n\nNota: se l\'oggetto è posizionato in un piano di carico ottimizzato, l\'eliminazione sarà bloccata.')) return;
            try {
                setStatus('busy', 'Eliminazione...');
                var resp = await fetch('/api/oggetti/' + oggettoId + '/', {
                    method: 'DELETE',
                    headers: { 'X-CSRFToken': getCSRFToken() },
                });
                if (!resp.ok) throw new Error(await _parseDeleteError(resp));
                var idx = WS.oggettiDisponibili.findIndex(function (x) { return x.id == oggettoId; });
                if (idx >= 0) WS.oggettiDisponibili.splice(idx, 1);
                // Sincronizza catalogo
                if (WS.oggettiCatalog) {
                    var catIdx = WS.oggettiCatalog.findIndex(function (x) { return x.id == oggettoId; });
                    if (catIdx >= 0) WS.oggettiCatalog.splice(catIdx, 1);
                }
                aggiornaSelectOggetti();
                renderOggettiPanel();
                showToast('🗑 Oggetto eliminato!', 'success');
                setStatus('idle', 'Eliminato');
            } catch (err) {
                showToast('❌ Errore eliminazione: ' + err.message, 'error');
                setStatus('error', 'Errore');
            }
        });
    }
}

// --- Helper: aggiorna la lista oggetti e mantiene il form in edit mode ---

function _aggiornaListaOggettiESeleziona(oggettoId) {
    DOM.pvListCount.textContent = WS.oggettiDisponibili.filter(function (o) { return !!o.archiviato === _oggettiMostraArchiviati; }).length;
    DOM.pvListBody.innerHTML = _buildOggettiListHtml();
    _wireOggettiListClickHandlers();

    // Se l'oggetto non è più visibile nel filtro corrente (cambiato stato archivio),
    // resetta il form a "Nuovo Oggetto" invece di tenerlo in edit mode
    var o = WS.oggettiDisponibili.find(function (x) { return x.id == oggettoId; });
    if (!o || !!o.archiviato !== _oggettiMostraArchiviati) {
        renderOggettiForm(null);
        return;
    }

    // Seleziona l'oggetto salvato e mostra il form in edit mode
    var targetItem = DOM.pvListBody.querySelector('[data-oggetto-id="' + oggettoId + '"]');
    if (targetItem) {
        targetItem.classList.add('selected');
        targetItem.classList.add('selected-multi');
        _multiSelState.oggettiSelezionati = [oggettoId];
        _multiSelState.ultimoCliccato = oggettoId;
        _aggiornaBatchToolbar();
    }
    renderOggettiForm(oggettoId);
    _aggiornaPreview3D(oggettoId);
}

// --- Vincoli: mostra form con valori di default (per nuovo oggetto) ---

function _mostraVincoliDefault() {
    var vincTitle = document.getElementById('pv-vincoli-title');
    if (vincTitle) vincTitle.textContent = '🔧 Vincoli (default)';
    var vincBody = document.getElementById('pv-vincoli-body');
    if (!vincBody) return;
    vincBody.innerHTML =
        '<div class="field-group"><label class="field-label">Orientamento</label>' +
            '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-rot-x" checked> Rotazione su X</label>' +
            '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-rot-y" checked> Rotazione su Y</label>' +
            '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-rot-z" checked> Rotazione su Z</label>' +
            '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-nocap"> Non capovolgere</label>' +
        '</div>' +
        '<div class="field-group"><label class="field-label">Impilabilità</label>' +
            '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-sovrapp" checked> Può sostenere altri oggetti</label>' +
        '</div>' +
        '<div class="field-group"><label class="field-label">Peso max sul tetto (kg)</label>' +
            '<input type="number" class="form-input" id="pv-vinc-pesomax" value="0" min="0" step="0.5">' +
        '</div>' +
        '<div class="field-group">' +
            '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-piano"> Solo su pavimento</label>' +
            '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-fragile"> ⚠️ Oggetto fragile</label>' +
        '</div>';
}

// --- Vincoli nella vista unificata Anagrafica Oggetti ---

function renderVincoliInOggetti(oggettoId) {
    var o = trovaOggetto(oggettoId);
    if (!o) return;

    // Controlla se l'oggetto ha VincoloTraOggetti attivi → blocca orientamento/impilabilità
    var hasVincoliLockVincoli = WS.vincoliTra.some(function (v) {
        return v.attivo && (v.oggetto_a === oggettoId || v.oggetto_b === oggettoId);
    });
    var lockAttr = hasVincoliLockVincoli ? ' disabled' : '';
    var lockIcon = hasVincoliLockVincoli ? ' 🔒' : '';
    var lockTitle = hasVincoliLockVincoli ? ' title="Bloccato: l\'oggetto ha vincoli sopra attivi. Rimuovili in 🔗 Vincoli tra Oggetti per sbloccare."' : '';

    document.getElementById('pv-vincoli-title').textContent = '🔧 Vincoli: ' + o.codice;
    
    fetch('/api/oggetti/' + oggettoId + '/vincoli/')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (v) {
            v = v || {};
            var formHtml =
                '<div class="field-group"><label class="field-label">Orientamento' + lockIcon + '</label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-rot-x" ' + (v.rotazione_su_x !== false ? 'checked' : '') + lockAttr + lockTitle + '> Rotazione su X</label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-rot-y" ' + (v.rotazione_su_y !== false ? 'checked' : '') + lockAttr + lockTitle + '> Rotazione su Y</label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-rot-z" ' + (v.rotazione_su_z !== false ? 'checked' : '') + lockAttr + lockTitle + '> Rotazione su Z</label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-nocap" ' + (v.rotazione_consentita === false ? 'checked' : '') + lockAttr + lockTitle + '> Non capovolgere</label>' +
                '</div>' +
                '<div class="field-group"><label class="field-label">Impilabilità' + lockIcon + '</label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-sovrapp" ' + (v.sovrapponibile !== false ? 'checked' : '') + lockAttr + lockTitle + '> Può sostenere altri oggetti</label>' +
                '</div>' +
                '<div class="field-group"><label class="field-label">Peso max sul tetto (kg)</label>' +
                    '<input type="number" class="form-input" id="pv-vinc-pesomax" value="' + (v.peso_massimo_tetto_kg || 0) + '" min="0" step="0.5">' +
                '</div>' +
                '<div class="field-group">' +
                    '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-piano" ' + (v.solo_su_piano === true ? 'checked' : '') + '> Solo su pavimento</label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-fragile" ' + (v.fragile === true ? 'checked' : '') + '> ⚠️ Oggetto fragile</label>' +
                '</div>';
            document.getElementById('pv-vincoli-body').innerHTML = formHtml;
        })
        .catch(function () {
            document.getElementById('pv-vincoli-body').innerHTML = '<p style="color:#c0392b;text-align:center;padding:40px;">Errore caricamento vincoli.</p>';
        });
}

// --- Vincoli tra Oggetti ---

var TIPI_RELAZIONE_VT = [
    {value: 'sopra', label: 'A deve stare sopra B', desc: "A sarà sempre impilato sopra B (stessa impronta XY)."},
];

