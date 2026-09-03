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
}

// --- Anagrafica Oggetti ---

// Helper: costruisce l'HTML della lista oggetti (usato da renderOggettiPanel e _aggiornaListaOggettiESeleziona)
function _buildOggettiListHtml() {
    var listHtml = '';
    WS.oggettiDisponibili.slice().sort(function (a, b) {
        return (a.codice || '').localeCompare(b.codice || '');
    }).forEach(function (o) {
        // Filtro esclusivo: default mostra solo attivi, con checkbox mostra solo archiviati
        if (!!o.archiviato !== _oggettiMostraArchiviati) return;
        var coloreDisplay = (typeof coloreOggetto === 'function') ? coloreOggetto(o) : (o.colore || '#447e9b');
        var v = WS.vincoli.find(function (x) { return x.oggetto_id == o.id; });
        var vincInfo = v ? ((!v.sovrapponibile ? '📦 No impil ' : '') + (v.solo_su_piano ? '⬇️ Pavimento' : '')) : '';
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
    DOM.pvListTitle.innerHTML = 'oggetti : ';
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
    
    // Lascia la larghezza alla maniglia condivisa lista/form.
    listEl.style.flex = '';
    
    // Rebuild form area as 2-column (object form + vincoli) + 3D preview below
    formEl.innerHTML = 
        '<div class="pv-oggetti-split">' +
            '<div class="pv-oggetti-form-col">' +
                '<div class="pv-form-header"><h4 id="pv-oggetti-form-title">➕ Nuovo Oggetto</h4></div>' +
                '<div class="pv-form-body" id="pv-oggetti-form-body"></div>' +
            '</div>' +
            '<div class="pv-vincoli-col">' +
                '<div class="pv-form-header"><h4 id="pv-vincoli-title" class="language-label" data-translation-key="objects.vincoli" data-italiano="🔧 Vincoli">🔧 Vincoli</h4></div>' +
                '<div class="pv-vincoli-body" id="pv-vincoli-body">' +
                    '<p class="language-label" data-translation-key="objects.seleziona-vincoli" data-italiano="Seleziona un oggetto per configurare i vincoli." style="color:#999;text-align:center;padding:40px;">Seleziona un oggetto per configurare i vincoli.</p>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div id="pv-oggetti-actions" style="padding:0 8px;"></div>' +
        '<div class="pv-3d-preview">' +
            '<div class="pv-3d-header">' +
                '<span class="pv-3d-title language-label" data-translation-key="objects.anteprima" data-italiano="Anteprima 3D">Anteprima 3D</span>' +
            '</div>' +
            '<div class="pv-3d-canvas-wrap" id="pv-3d-canvas-wrap">' +
                '<div class="pv-3d-placeholder" id="pv-3d-placeholder">' +
                    '<span class="pv-3d-placeholder-icon">📦</span>' +
                    '<span class="language-label" data-translation-key="objects.seleziona-preview" data-italiano="Seleziona un oggetto per visualizzarlo in 3D">Seleziona un oggetto per visualizzarlo in 3D</span>' +
                '</div>' +
            '</div>' +
            '<div class="pv-3d-controls">' +
                '<div class="pv-3d-controls-row pv-3d-rot-row">' +
                    '<span class="pv-3d-rot-status language-label" data-translation-key="objects.trascina-ruota" data-italiano="🖱️ Trascina sul canvas per ruotare">🖱️ Trascina sul canvas per ruotare</span>' +
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
            '<input type="checkbox" id="pv-select-all" autocomplete="off"> <span class="language-label" data-translation-key="objects.seleziona" data-italiano="seleziona">seleziona</span></label>';
        listHeader.insertAdjacentHTML('afterbegin', selectAllHtml);
        
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
            });
        }
    }
    
    // ---- NESSUNA TOOLBAR BATCH PER GLI ARTICOLI ----
    // Il bottone Elimina è unico ed è quello accanto a Salva nel form articolo:
    // elimina tutti gli articoli selezionati oppure il singolo articolo aperto.
    // Rimuoviamo solo eventuali toolbar residue della vista piani.
    var oldPianiToolbar = document.getElementById('pv-batch-toolbar-piani');
    if (oldPianiToolbar) oldPianiToolbar.remove();
    
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

    // Il pannello e il form sono stati completati: applica la lingua attiva
    // anche agli elementi creati durante questo rendering.
    document.dispatchEvent(new CustomEvent('carico3d:panel-rendered'));
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
            '<div class="field-group" style="flex:0 0 130px;"><label class="field-label language-label" data-translation-key="objects.codice" data-italiano="Codice">Codice</label><input type="text" class="form-input" id="pv-ogg-codice" value="' + (o ? escapeHtml(o.codice) : '') + '"></div>' +
            '<div class="field-group flex-grow"><label class="field-label language-label" data-translation-key="objects.descrizione" data-italiano="Descrizione">Descrizione</label><input type="text" class="form-input" id="pv-ogg-desc" value="' + (o ? escapeHtml(o.descrizione || '') : '') + '"></div>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-group flex-grow"><label class="field-label language-label" data-translation-key="objects.lunghezza" data-italiano="L (cm)">L (cm)' + (hasVincoliAnagrafica ? ' 🔒' : '') + '</label><input type="number" class="form-input" id="pv-ogg-lungh" value="' + (o ? formatCm(o.lunghezza_mm) : '') + '" step="0.1" min="0.1"' + (hasVincoliAnagrafica ? ' disabled title="Dimensioni bloccate: l\'oggetto ha vincoli sopra attivi"' : '') + '></div>' +
            '<div class="field-group flex-grow"><label class="field-label language-label" data-translation-key="objects.larghezza" data-italiano="W (cm)">W (cm)' + (hasVincoliAnagrafica ? ' 🔒' : '') + '</label><input type="number" class="form-input" id="pv-ogg-larg" value="' + (o ? formatCm(o.larghezza_mm) : '') + '" step="0.1" min="0.1"' + (hasVincoliAnagrafica ? ' disabled title="Dimensioni bloccate: l\'oggetto ha vincoli sopra attivi"' : '') + '></div>' +
            '<div class="field-group flex-grow"><label class="field-label language-label" data-translation-key="objects.altezza" data-italiano="H (cm)">H (cm)' + (hasVincoliAnagrafica ? ' 🔒' : '') + '</label><input type="number" class="form-input" id="pv-ogg-alt" value="' + (o ? formatCm(o.altezza_mm) : '') + '" step="0.1" min="0.1"' + (hasVincoliAnagrafica ? ' disabled title="Dimensioni bloccate: l\'oggetto ha vincoli sopra attivi"' : '') + '></div>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-group flex-grow"><label class="field-label language-label" data-translation-key="objects.peso" data-italiano="Peso (kg)">Peso (kg)</label><input type="number" class="form-input" id="pv-ogg-peso" value="' + (o ? o.peso_kg : '') + '" step="0.01" min="0.01"></div>' +
            '<div class="field-group flex-grow"><label class="field-label language-label" data-translation-key="objects.quantita" data-italiano="Q.tà Disp.">Q.tà Disp.</label><input type="number" class="form-input" id="pv-ogg-qty" value="' + (o ? (o.quantita || 1) : '') + '" min="1" step="1"></div>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-group" style="flex:0 0 70px;"><label class="field-label language-label" data-translation-key="objects.colore" data-italiano="Colore">Colore</label><input type="color" class="form-input" id="pv-ogg-colore" value="' + coloreVal + '" style="height:36px;padding:2px 4px;cursor:pointer;"' + (!isEdit && !hasColor ? ' disabled' : '') + '></div>' +
            '<div class="field-group flex-grow" style="flex-direction:row;justify-content:flex-end;align-items:flex-end;gap:12px;"><label class="checkbox-label" style="margin-top:0;"><input type="checkbox" id="pv-ogg-colore-enable" ' + (hasColor ? 'checked' : '') + '> <span class="language-label" data-translation-key="objects.colore-personalizzato" data-italiano="Colore personalizzato">🎨 Colore personalizzato</span></label><label class="checkbox-label" style="margin-top:0;"><input type="checkbox" id="pv-ogg-archiviato"' + (o && o.archiviato ? ' checked' : '') + '> <span class="language-label" data-translation-key="objects.archivia" data-italiano="Archivia">Archivia</span></label></div>' +
        '</div>';
    DOM.pvFormBody.innerHTML = formHtml;
    document.dispatchEvent(new CustomEvent('carico3d:panel-rendered'));

    // --- Bottoni azione sopra la preview 3D (spostati fuori dal form) ---
    var actionsEl = document.getElementById('pv-oggetti-actions');
    if (actionsEl) {
        var lockMsg = (hasVincoliAnagrafica ? '<div class="field-row"><div class="field-note" style="color:#e67e22;font-size:11px;margin-bottom:4px;">🔒 Oggetto bloccato: ha vincoli "sopra" attivi con altri oggetti. Dimensioni, orientamento e impilabilità non sono modificabili. Rimuovi i vincoli in 🔗 Vincoli tra Oggetti per sbloccare.</div></div>' : '');
        if (isEdit) {
            actionsEl.innerHTML = lockMsg +
                '<div class="field-row" style="gap:8px;padding:4px 0;">' +
                    '<button class="btn" id="pv-ogg-nuovo">➕ Nuovo</button>' +
                    '<button class="btn" id="pv-ogg-duplica">📋 Duplica</button>' +
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

    if (typeof window.applicaTraduzioni === 'function') window.applicaTraduzioni(document.getElementById('pv-vincoli-body'));

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
                    aggiornaColoreNeiPanelItems(oggettoId, colore || data.colore || '#447e9b');
                }
                // Aggiorna colore nella scena 3D — usa il vecchio codice (i mesh hanno ancora quello)
                if (typeof aggiornaColoreOggettoInScena === 'function' && (vecchioCodice || codice)) {
                    aggiornaColoreOggettoInScena(vecchioCodice || codice, colore || data.colore || '#447e9b');
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
            rotazione_su_x: document.getElementById('pv-vinc-rot-x').checked,
            rotazione_su_y: document.getElementById('pv-vinc-rot-y').checked,
            rotazione_su_z: document.getElementById('pv-vinc-rot-z').checked,
            sovrapponibile: document.getElementById('pv-vinc-sovrapp').checked,
            peso_massimo_tetto_kg: parseFloat(document.getElementById('pv-vinc-pesomax').value) || 0,
            solo_su_piano: document.getElementById('pv-vinc-piano').checked,
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

    // Delete oggetto (solo in modifica): unico bottone Elimina (accanto a Salva).
    // Se sono selezionati più articoli li elimina tutti; altrimenti elimina quello aperto.
    var deleteBtn = document.getElementById('pv-ogg-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async function (e) {
            e.stopPropagation();
            var ids = _multiSelState.oggettiSelezionati.length >= 2
                ? _multiSelState.oggettiSelezionati.slice()
                : [oggettoId];
            var codici = ids.map(function (id) {
                var ogg = trovaOggetto(id);
                return ogg ? ogg.codice : '';
            }).filter(Boolean);
            var dettaglio = ids.length === 1
                ? 'l\'articolo "' + (codici[0] || '') + '"'
                : ids.length + ' articoli:\n\n' + codici.join(', ');
            if (!confirm('Eliminare ' + dettaglio + '?\n\nNota: gli articoli posizionati in piani di carico ottimizzati non saranno eliminati.')) return;
            try {
                setStatus('busy', 'Eliminazione...');
                var eliminati = 0;
                if (ids.length === 1) {
                    var resp = await fetch('/api/oggetti/' + oggettoId + '/', {
                        method: 'DELETE',
                        headers: { 'X-CSRFToken': getCSRFToken() },
                    });
                    if (!resp.ok) throw new Error(await _parseDeleteError(resp));
                    eliminati = 1;
                    var idx = WS.oggettiDisponibili.findIndex(function (x) { return x.id == oggettoId; });
                    if (idx >= 0) WS.oggettiDisponibili.splice(idx, 1);
                    // Sincronizza catalogo
                    if (WS.oggettiCatalog) {
                        var catIdx = WS.oggettiCatalog.findIndex(function (x) { return x.id == oggettoId; });
                        if (catIdx >= 0) WS.oggettiCatalog.splice(catIdx, 1);
                    }
                    // Rimuovi anche da vincoli locali
                    var vIdx = WS.vincoli.findIndex(function (v) { return v.oggetto_id == oggettoId; });
                    if (vIdx >= 0) WS.vincoli.splice(vIdx, 1);
                } else {
                    var respBatch = await fetch('/api/oggetti/bulk_delete/', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                        body: JSON.stringify({ ids: ids }),
                    });
                    if (!respBatch.ok) throw new Error('HTTP ' + respBatch.status);
                    var data = await respBatch.json();
                    eliminati = data.eliminati || ids.length;
                    ids.forEach(function (id) {
                        var idxB = WS.oggettiDisponibili.findIndex(function (x) { return x.id == id; });
                        if (idxB >= 0) WS.oggettiDisponibili.splice(idxB, 1);
                        if (WS.oggettiCatalog) {
                            var catIdxB = WS.oggettiCatalog.findIndex(function (x) { return x.id == id; });
                            if (catIdxB >= 0) WS.oggettiCatalog.splice(catIdxB, 1);
                        }
                        var vIdxB = WS.vincoli.findIndex(function (v) { return v.oggetto_id == id; });
                        if (vIdxB >= 0) WS.vincoli.splice(vIdxB, 1);
                    });
                }
                _pulisciSelezioneMultipla();
                aggiornaSelectOggetti();
                renderOggettiPanel();
                showToast(ids.length === 1 ? '🗑 Articolo eliminato!' : '🗑 Eliminati ' + eliminati + ' articoli!', 'success');
                setStatus('idle', 'Eliminati');
            } catch (err) {
                showToast('❌ Errore eliminazione: ' + err.message, 'error');
                setStatus('error', 'Errore');
            }
        });
    }

    // --- Duplica oggetto ---
    var duplicaBtn = document.getElementById('pv-ogg-duplica');
    if (duplicaBtn) {
        duplicaBtn.addEventListener('click', async function () {
            if (!isEdit || !o) return;
            try {
                setStatus('busy', 'Duplicazione...');
                var baseCodice = o.codice;
                var existingCodes = WS.oggettiDisponibili.map(function (x) { return x.codice; });
                var newCodice = baseCodice + '(2)';
                var counter = 3;
                while (existingCodes.indexOf(newCodice) !== -1) {
                    newCodice = baseCodice + '(' + counter + ')';
                    counter++;
                }
                var resp = await fetch('/api/oggetti/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                    body: JSON.stringify({
                        codice: newCodice,
                        descrizione: o.descrizione || '',
                        lunghezza_cm: o.lunghezza_mm / 10,
                        larghezza_cm: o.larghezza_mm / 10,
                        altezza_cm: o.altezza_mm / 10,
                        peso_kg: parseFloat(o.peso_kg) || 0,
                        quantita_disponibile: parseInt(o.quantita) || 1,
                        colore: o.colore || '',
                    }),
                });
                if (!resp.ok) {
                    var errBody = await resp.text();
                    throw new Error('HTTP ' + resp.status + ' - ' + errBody);
                }
                var data = await resp.json();
                var newId = Number(data.id);
                WS.oggettiDisponibili.push({
                    id: newId, codice: data.codice, descrizione: data.descrizione,
                    lunghezza_mm: data.lunghezza_mm, larghezza_mm: data.larghezza_mm,
                    altezza_mm: data.altezza_mm, peso_kg: data.peso_kg,
                    quantita: data.quantita_disponibile, colore: data.colore || '',
                    archiviato: false,
                });
                if (WS.oggettiCatalog) {
                    WS.oggettiCatalog.push({
                        id: newId, codice: data.codice, descrizione: data.descrizione,
                        lunghezza_mm: data.lunghezza_mm, larghezza_mm: data.larghezza_mm,
                        altezza_mm: data.altezza_mm, peso_kg: data.peso_kg,
                        quantita: data.quantita_disponibile, colore: data.colore || '',
                        archiviato: false,
                    });
                }
                // Copia vincoli dal sorgente
                var srcVinc = WS.vincoli.find(function (v) { return v.oggetto_id == o.id; });
                if (srcVinc) {
                    await fetch('/api/oggetti/' + newId + '/vincoli/', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                        body: JSON.stringify({
                            rotazione_su_x: srcVinc.rotazione_su_x,
                            rotazione_su_y: srcVinc.rotazione_su_y,
                            rotazione_su_z: srcVinc.rotazione_su_z,
                            sovrapponibile: srcVinc.sovrapponibile,
                            peso_massimo_tetto_kg: srcVinc.peso_massimo_tetto_kg || 0,
                            solo_su_piano: srcVinc.solo_su_piano,
                        }),
                    });
                    WS.vincoli.push(Object.assign({ oggetto_id: newId }, {
                        rotazione_su_x: srcVinc.rotazione_su_x,
                        rotazione_su_y: srcVinc.rotazione_su_y,
                        rotazione_su_z: srcVinc.rotazione_su_z,
                        sovrapponibile: srcVinc.sovrapponibile,
                        peso_massimo_tetto_kg: srcVinc.peso_massimo_tetto_kg || 0,
                        solo_su_piano: srcVinc.solo_su_piano,
                    }));
                }
                aggiornaSelectOggetti();
                _aggiornaListaOggettiESeleziona(newId);
                showToast('Oggetto duplicato: ' + newCodice, 'success');
                setStatus('idle', 'Duplicato');
            } catch (err) {
                showToast('Errore duplicazione: ' + err.message, 'error');
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
    }
    renderOggettiForm(oggettoId);
    _aggiornaPreview3D(oggettoId);
}

// --- Vincoli: mostra form con valori di default (per nuovo oggetto) ---

function _traduciOggetti(key, fallback) {
    var lingua = window.CARICO3D_LANGUAGE === 'en' ? 'en' : 'it';
    return (window.DIZIONARIO && window.DIZIONARIO[lingua] && window.DIZIONARIO[lingua][key]) || fallback;
}

function _mostraVincoliDefault() {
    var vincTitle = document.getElementById('pv-vincoli-title');
    if (vincTitle) vincTitle.textContent = '🔧 ' + _traduciOggetti('objects.vincoli-default', 'Vincoli (default)');
    var vincBody = document.getElementById('pv-vincoli-body');
    if (!vincBody) return;
    vincBody.innerHTML =
        '<div class="field-group"><label class="field-label language-label" data-translation-key="objects.orientamento" data-italiano="Orientamento">Orientamento</label>' +
            '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-rot-x" checked> <span class="language-label" data-translation-key="objects.rotazione-x" data-italiano="Rotazione su X">Rotazione su X</span></label>' +
            '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-rot-y" checked> <span class="language-label" data-translation-key="objects.rotazione-y" data-italiano="Rotazione su Y">Rotazione su Y</span></label>' +
            '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-rot-z" checked> <span class="language-label" data-translation-key="objects.rotazione-z" data-italiano="Rotazione su Z">Rotazione su Z</span></label>' +
        '</div>' +
        '<div class="field-group"><label class="field-label language-label" data-translation-key="objects.impilabilita" data-italiano="Impilabilità">Impilabilità</label>' +
            '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-sovrapp" checked> <span class="language-label" data-translation-key="objects.sostegno" data-italiano="Può sostenere altri oggetti">Può sostenere altri oggetti</span></label>' +
        '</div>' +
        '<div class="field-group"><label class="field-label language-label" data-translation-key="objects.peso-tetto" data-italiano="Peso max sul tetto (kg)">Peso max sul tetto (kg)</label>' +
            '<input type="number" class="form-input" id="pv-vinc-pesomax" value="0" min="0" step="0.5">' +
        '</div>' +
        '<div class="field-group">' +
            '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-piano"> <span class="language-label" data-translation-key="objects.solo-pavimento" data-italiano="Solo su pavimento">Solo su pavimento</span></label>' +
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
                '<div class="field-group"><label class="field-label language-label" data-translation-key="objects.orientamento" data-italiano="Orientamento">Orientamento' + lockIcon + '</label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-rot-x" ' + (v.rotazione_su_x !== false ? 'checked' : '') + lockAttr + lockTitle + '> <span class="language-label" data-translation-key="objects.rotazione-x" data-italiano="Rotazione su X">Rotazione su X</span></label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-rot-y" ' + (v.rotazione_su_y !== false ? 'checked' : '') + lockAttr + lockTitle + '> <span class="language-label" data-translation-key="objects.rotazione-y" data-italiano="Rotazione su Y">Rotazione su Y</span></label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-rot-z" ' + (v.rotazione_su_z !== false ? 'checked' : '') + lockAttr + lockTitle + '> <span class="language-label" data-translation-key="objects.rotazione-z" data-italiano="Rotazione su Z">Rotazione su Z</span></label>' +
                '</div>' +
                '<div class="field-group"><label class="field-label language-label" data-translation-key="objects.impilabilita" data-italiano="Impilabilità">Impilabilità' + lockIcon + '</label>' +
                    '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-sovrapp" ' + (v.sovrapponibile !== false ? 'checked' : '') + lockAttr + lockTitle + '> <span class="language-label" data-translation-key="objects.sostegno" data-italiano="Può sostenere altri oggetti">Può sostenere altri oggetti</span></label>' +
                '</div>' +
                '<div class="field-group"><label class="field-label language-label" data-translation-key="objects.peso-tetto" data-italiano="Peso max sul tetto (kg)">Peso max sul tetto (kg)</label>' +
                    '<input type="number" class="form-input" id="pv-vinc-pesomax" value="' + (v.peso_massimo_tetto_kg || 0) + '" min="0" step="0.5">' +
                '</div>' +
                '<div class="field-group">' +
                    '<label class="checkbox-label"><input type="checkbox" id="pv-vinc-piano" ' + (v.solo_su_piano === true ? 'checked' : '') + '> <span class="language-label" data-translation-key="objects.solo-pavimento" data-italiano="Solo su pavimento">Solo su pavimento</span></label>' +
                '</div>';
            document.getElementById('pv-vincoli-body').innerHTML = formHtml;
            document.dispatchEvent(new CustomEvent('carico3d:panel-rendered'));
        })
        .catch(function () {
            document.getElementById('pv-vincoli-body').innerHTML = '<p style="color:#c0392b;text-align:center;padding:40px;">Errore caricamento vincoli.</p>';
        });
}

// --- Vincoli tra Oggetti ---

var TIPI_RELAZIONE_VT = [
    {value: 'sopra', label: 'A deve stare sopra B', desc: "A sarà sempre impilato sopra B (stessa impronta XY)."},
];

