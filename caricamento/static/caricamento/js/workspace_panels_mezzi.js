/**
 * Workspace Carico 3D — Panel Mezzi di Trasporto
 *
 * Lista, form creazione/modifica, selezione multipla e batch delete mezzi.
 *
 * Depends on: workspace_panels.js (mostraPanelView), workspace_core.js (WS, DOM)
 */

// --- Mezzi di Trasporto ---

// Stato per il filtro archiviati
var _mezziMostraArchiviati = false;

// Helper: costruisce l'HTML della lista mezzi
function _buildMezziListHtml() {
    var listHtml = '';
    WS.contenitori.forEach(function (c) {
        // Filtro esclusivo: default mostra solo attivi, con checkbox mostra solo archiviati
        // !!c.archiviato: tratta undefined come false (robustezza per dati pre-migration)
        if (!!c.archiviato !== _mezziMostraArchiviati) return;
        var volM3 = (c.lunghezza_mm * c.larghezza_mm * c.altezza_mm) / 1000000000;
        var archBadge = c.archiviato ? ' <span style="font-size:10px;color:#999;">📁 archiviato</span>' : '';
        listHtml += '<div class="pv-list-item" data-mezzo-id="' + c.id + '">' +
            '<div class="pv-list-item-info">' +
                '<strong>' + escapeHtml(c.nome) + '</strong>' +
                '<span>' + (c.tipo_display || c.tipo || '') + ' · ' + formatCm(c.lunghezza_mm) + '×' + formatCm(c.larghezza_mm) + '×' + formatCm(c.altezza_mm) + ' cm · ' + volM3.toFixed(2) + ' m³ · ' + parseFloat(c.carico_massimo_kg).toFixed(0) + ' kg' + archBadge + '</span>' +
            '</div>' +
        '</div>';
    });
    return listHtml || '<div class="pv-empty"><span class="pv-empty-icon">🚛</span><span>Nessun mezzo censito</span></div>';
}

// Helper: wiring click sugli item della lista mezzi (con multi-selezione Ctrl/Shift)
function _wireMezziListClickHandlers() {
    DOM.pvListBody.querySelectorAll('.pv-list-item').forEach(function (item) {
        item.addEventListener('click', function (e) {
            var mid = parseInt(item.dataset.mezzoId) || 0;
            if (!mid) return;
            if (e.ctrlKey || e.shiftKey) {
                _toggleSelezioneMultiplaMezzi(mid, e.ctrlKey, e.shiftKey);
            } else {
                // Click semplice: seleziona il mezzo e apri in modifica
                _pulisciSelezioneMultiplaMezzi();
                _mezziSelState.mezziSelezionati.push(mid);
                _mezziSelState.ultimoCliccato = mid;
                item.classList.add('selected-multi');
                _aggiornaBatchToolbarMezzi();
                DOM.pvListBody.querySelectorAll('.pv-list-item').forEach(function (el) { el.classList.remove('selected'); });
                item.classList.add('selected');
                renderMezziForm(mid);
            }
        });
    });
}

function renderMezziPanel() {
    DOM.pvListTitle.textContent = '🚛 Mezzi di Trasporto';
    DOM.pvFormTitle.textContent = 'Nuovo Mezzo';
    DOM.pvListCount.textContent = WS.contenitori.filter(function (c) { return !!c.archiviato === _mezziMostraArchiviati; }).length;

    // Reset stato selezione multipla mezzi
    _mezziSelState.mezziSelezionati = [];
    _mezziSelState.ultimoCliccato = null;

    // ---- HEADER: select-all + archiviati checkbox ----
    var listHeader = document.querySelector('#panel-view-list .pv-list-header');
    if (listHeader) {
        var oldSelAll = listHeader.querySelector('.pv-list-select-all');
        if (oldSelAll) oldSelAll.remove();
        var oldArchCheck = listHeader.querySelector('.pv-list-archiviati');
        if (oldArchCheck) oldArchCheck.remove();
        var selectAllHtml = '<label class="pv-list-select-all" title="Seleziona/Deseleziona tutti">' +
            '<input type="checkbox" id="pv-select-all-mezzi" autocomplete="off"> Seleziona tutti</label>';
        listHeader.insertAdjacentHTML('afterbegin', selectAllHtml);

        // Checkbox "Archiviati" — creato via DOM per evitare autofill browser
        var archLabel = document.createElement('label');
        archLabel.className = 'pv-list-select-all pv-list-archiviati';
        archLabel.title = 'Mostra/Nascondi mezzi archiviati';
        archLabel.style.marginLeft = 'auto';
        var archCheck = document.createElement('input');
        archCheck.type = 'checkbox';
        archCheck.id = 'pv-show-archiviati';
        archCheck.checked = _mezziMostraArchiviati;
        archLabel.appendChild(archCheck);
        archLabel.appendChild(document.createTextNode(' Archiviati'));
        listHeader.appendChild(archLabel);

        var selAll = document.getElementById('pv-select-all-mezzi');
        if (selAll) {
            selAll.addEventListener('change', function () {
                if (this.checked) {
                    var items = document.querySelectorAll('#pv-list-body .pv-list-item');
                    items.forEach(function (item) {
                        var id = parseInt(item.dataset.mezzoId);
                        if (_mezziSelState.mezziSelezionati.indexOf(id) === -1) {
                            _mezziSelState.mezziSelezionati.push(id);
                        }
                        item.classList.add('selected-multi');
                    });
                } else {
                    _pulisciSelezioneMultiplaMezzi();
                }
                _aggiornaBatchToolbarMezzi();
            });
        }
        // Difesa da autofill browser: se il browser ha auto-compilato, ripristina
        if (archCheck.checked !== _mezziMostraArchiviati) {
            archCheck.checked = _mezziMostraArchiviati;
        }
        archCheck.addEventListener('change', function () {
            _mezziMostraArchiviati = this.checked;
            DOM.pvListCount.textContent = WS.contenitori.filter(function (c) {
                return !!c.archiviato === _mezziMostraArchiviati;
            }).length;
            DOM.pvListBody.innerHTML = _buildMezziListHtml();
            _wireMezziListClickHandlers();
        });
    }

    // ---- BATCH TOOLBAR (rimuovi vecchie per evitare duplicati) ----
    var oldToolbar = document.getElementById('pv-batch-toolbar-mezzi');
    if (oldToolbar) oldToolbar.remove();
    var oldOggettiToolbar = document.getElementById('pv-batch-toolbar');
    if (oldOggettiToolbar) oldOggettiToolbar.remove();
    var oldPianiToolbar = document.getElementById('pv-batch-toolbar-piani');
    if (oldPianiToolbar) oldPianiToolbar.remove();
    var batchToolbarHtml =
        '<div class="pv-batch-toolbar" id="pv-batch-toolbar-mezzi">' +
            '<span class="pv-batch-count">0 selezionati</span>' +
            '<button class="btn btn-danger" id="pv-batch-delete-mezzi">🗑 Elimina</button>' +
            '<button class="btn btn-sm" id="pv-batch-clear-mezzi" title="Cancella selezione">✕</button>' +
        '</div>';
    if (listHeader && listHeader.parentNode) {
        listHeader.parentNode.insertBefore(
            (function () { var d = document.createElement('div'); d.innerHTML = batchToolbarHtml; return d.firstElementChild; })(),
            listHeader.nextSibling
        );
    }
    var batchDelM = document.getElementById('pv-batch-delete-mezzi');
    if (batchDelM) batchDelM.addEventListener('click', _eseguiEliminazioneBatchMezzi);
    var batchClearM = document.getElementById('pv-batch-clear-mezzi');
    if (batchClearM) batchClearM.addEventListener('click', _pulisciSelezioneMultiplaMezzi);

    DOM.pvListBody.innerHTML = _buildMezziListHtml();
    _wireMezziListClickHandlers();

    // Form default: nuovo
    renderMezziForm(null);
}

function renderMezziForm(mezzoId) {
    var m = mezzoId ? WS.contenitori.find(function (c) { return c.id == mezzoId; }) : null;
    var isEdit = !!m;
    DOM.pvFormTitle.textContent = isEdit ? '✏️ Modifica: ' + m.nome : '➕ Nuovo Mezzo';

    // Deseleziona lista se in modalità creazione
    if (!isEdit) {
        DOM.pvListBody.querySelectorAll('.pv-list-item.selected').forEach(function (el) { el.classList.remove('selected'); });
    }

    var tipoOptions = ['bilico','autocarro','autotreno','furgone','container_20','container_40','container_40_hc','nave','treno','altro'];
    var tipoLabels = ['Autoarticolato','Autocarro','Autotreno','Furgone','Container 20\'','Container 40\'','Container 40\' HC','Nave','Treno','Altro'];
    var tipoHtml = tipoOptions.map(function (v, i) {
        return '<option value="' + v + '" ' + (m && m.tipo === v ? 'selected' : (v === 'container_40_hc' && !m ? 'selected' : '')) + '>' + tipoLabels[i] + '</option>';
    }).join('');

    var formHtml =
        '<div class="field-group">' +
            '<label class="field-label">Nome / Modello</label>' +
            '<input type="text" class="form-input" id="pv-mezzo-nome" value="' + (m ? escapeHtml(m.nome) : '') + '" placeholder="Es. Camion Bilico 13.6m">' +
        '</div>' +
        '<div class="field-group">' +
            '<label class="field-label">Tipo Mezzo</label>' +
            '<select class="form-select" id="pv-mezzo-tipo">' + tipoHtml + '</select>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-group flex-grow"><label class="field-label">L (cm)</label><input type="number" class="form-input" id="pv-mezzo-lungh" value="' + (m ? formatCm(m.lunghezza_mm) : '') + '" placeholder="Lunghezza in cm" step="0.1" min="1"></div>' +
            '<div class="field-group flex-grow"><label class="field-label">P (cm)</label><input type="number" class="form-input" id="pv-mezzo-larg" value="' + (m ? formatCm(m.larghezza_mm) : '') + '" placeholder="Larghezza in cm" step="0.1" min="1"></div>' +
            '<div class="field-group flex-grow"><label class="field-label">H (cm)</label><input type="number" class="form-input" id="pv-mezzo-alt" value="' + (m ? formatCm(m.altezza_mm) : '') + '" placeholder="Altezza in cm" step="0.1" min="1"></div>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-group" style="flex:0 0 180px;"><label class="field-label">Portata (kg)</label><input type="number" class="form-input" id="pv-mezzo-peso" value="' + (m ? parseFloat(m.carico_massimo_kg).toFixed(1) : '') + '" placeholder="Portata in kg" step="0.1" min="1"></div>' +
            '<div class="field-group flex-grow" style="flex-direction:row;align-items:flex-end;justify-content:flex-end;gap:12px;"><label class="checkbox-label" style="margin-top:0;"><input type="checkbox" id="pv-mezzo-archiviato"' + (m && m.archiviato ? ' checked' : '') + '> Archivia</label></div>' +
        '</div>' +
        _renderSezioniTable(m ? m.sezioni || [] : [], m ? m.lunghezza_mm : null) +
        (isEdit
            ? '<div class="field-row" style="gap:8px;">' +
                '<button class="btn" id="pv-mezzo-nuovo">➕ Nuovo</button>' +
                '<button class="btn btn-primary" style="flex:1;" id="pv-mezzo-save">💾 Aggiorna</button>' +
                '<button class="btn btn-danger" id="pv-mezzo-delete">🗑 Elimina</button>' +
              '</div>'
            : '<div class="field-row" style="gap:8px;">' +
                '<button class="btn btn-primary" style="flex:1;" id="pv-mezzo-save">➕ Crea Mezzo</button>' +
              '</div>'
        );

    DOM.pvFormBody.innerHTML = formHtml;

    // Pulsante Nuovo (solo in modifica)
    var nuovoBtn = document.getElementById('pv-mezzo-nuovo');
    if (nuovoBtn) {
        nuovoBtn.addEventListener('click', function () { renderMezziForm(null); });
    }

    // Save
    document.getElementById('pv-mezzo-save').addEventListener('click', async function () {
        var nome = document.getElementById('pv-mezzo-nome').value.trim();
        var tipo = document.getElementById('pv-mezzo-tipo').value;
        var lungh = parseFloat(document.getElementById('pv-mezzo-lungh').value);
        var larg = parseFloat(document.getElementById('pv-mezzo-larg').value);
        var alt = parseFloat(document.getElementById('pv-mezzo-alt').value);
        var peso = parseFloat(document.getElementById('pv-mezzo-peso').value);
        if (!nome || !lungh || !larg || !alt || !peso) { showToast('Compila tutti i campi.', 'warning'); return; }

        try {
            setStatus('busy', 'Salvataggio...');
            var url = isEdit ? '/api/contenitori/' + mezzoId + '/' : '/api/contenitori/';
            var method = isEdit ? 'PATCH' : 'POST';
            var archiviato = document.getElementById('pv-mezzo-archiviato')?.checked || false;
            var body = isEdit
                ? JSON.stringify({ nome: nome, tipo_mezzo: tipo, lunghezza_mm: Math.round(lungh * 10), larghezza_mm: Math.round(larg * 10), altezza_mm: Math.round(alt * 10), carico_massimo_kg: peso, archiviato: archiviato })
                : JSON.stringify({ nome: nome, tipo_mezzo: tipo, lunghezza_cm: lungh, larghezza_cm: larg, altezza_cm: alt, carico_massimo_kg: peso, archiviato: archiviato });

            var resp = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() }, body: body });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var data = await resp.json();
            var serverId = Number(data.id);

            if (isEdit) {
                var idx = WS.contenitori.findIndex(function (c) { return c.id == mezzoId; });
                if (idx >= 0) {
                    // Aggiorna i campi del mezzo ma NON toccare sezioni:
                    // _salvaSezioni() le aggiornerà dalla response del server.
                    // Se _salvaSezioni() fallisce, le sezioni rimangono come erano
                    // prima dell'apertura del form (non quelle obsolete del DB).
                    // Usa il valore locale archiviato (più affidabile del response)
                    WS.contenitori[idx] = { id: serverId, nome: data.nome, tipo: data.tipo_mezzo, tipo_display: data.tipo_mezzo_display || data.tipo_mezzo, lunghezza_mm: data.lunghezza_mm, larghezza_mm: data.larghezza_mm, altezza_mm: data.altezza_mm, carico_massimo_kg: data.carico_massimo_kg, archiviato: archiviato, sezioni: WS.contenitori[idx].sezioni };
                }
            } else {
                WS.contenitori.push({ id: serverId, nome: data.nome, tipo: data.tipo_mezzo, tipo_display: '', lunghezza_mm: Math.round(lungh * 10), larghezza_mm: Math.round(larg * 10), altezza_mm: Math.round(alt * 10), carico_massimo_kg: data.carico_massimo_kg, archiviato: archiviato, sezioni: [] });
            }
            aggiornaSelectMezzi();

            // Salva anche le sezioni (sempre, anche se vuote per cancellarle tutte)
            var targetId = isEdit ? mezzoId : serverId;
            var risultatoSezioni = await _salvaSezioni(targetId);
            if (!risultatoSezioni.success) {
                showToast('⚠️ Mezzo salvato ma sezioni non aggiornate: ' + (risultatoSezioni.error || 'errore'), 'warning');
            }

            // Aggiorna la lista mantenendo il form sul mezzo salvato
            _aggiornaListaMezziESeleziona(isEdit ? mezzoId : serverId);
            showToast(isEdit ? '✅ Mezzo aggiornato!' : '✅ Mezzo creato!', 'success');
            setStatus('idle', 'Salvato');
        } catch (err) { showToast('❌ Errore: ' + err.message, 'error'); setStatus('error', 'Errore'); }
    });

    // Delete mezzo (solo in modifica)
    var deleteBtn = document.getElementById('pv-mezzo-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async function (e) {
            e.stopPropagation();
            if (!confirm('Eliminare il mezzo "' + (m ? escapeHtml(m.nome) : '') + '"?\n\nNota: se il mezzo è usato in piani di carico, l\'eliminazione sarà bloccata.')) return;
            try {
                setStatus('busy', 'Eliminazione...');
                var resp = await fetch('/api/contenitori/' + mezzoId + '/', {
                    method: 'DELETE',
                    headers: { 'X-CSRFToken': getCSRFToken() },
                });
                if (!resp.ok) throw new Error(await _parseDeleteError(resp));
                var idx = WS.contenitori.findIndex(function (c) { return c.id == mezzoId; });
                if (idx >= 0) WS.contenitori.splice(idx, 1);
                aggiornaSelectMezzi();
                renderMezziPanel();
                showToast('🗑 Mezzo eliminato!', 'success');
                setStatus('idle', 'Eliminato');
            } catch (err) {
                showToast('❌ Errore eliminazione: ' + err.message, 'error');
                setStatus('error', 'Errore');
            }
        });
    }
}

// Helper: aggiorna la lista mezzi e mantiene il form in edit mode
function _aggiornaListaMezziESeleziona(mezzoId) {
    DOM.pvListCount.textContent = WS.contenitori.filter(function (c) { return !!c.archiviato === _mezziMostraArchiviati; }).length;
    DOM.pvListBody.innerHTML = _buildMezziListHtml();
    _wireMezziListClickHandlers();

    // Se il mezzo non è più visibile nel filtro corrente (cambiato stato archivio),
    // resetta il form a "Nuovo Mezzo" invece di tenerlo in edit mode
    var m = WS.contenitori.find(function (c) { return c.id == mezzoId; });
    if (!m || !!m.archiviato !== _mezziMostraArchiviati) {
        renderMezziForm(null);
        return;
    }

    // Seleziona il mezzo salvato e mostra il form in edit mode
    _mezziSelState.mezziSelezionati = [mezzoId];
    _mezziSelState.ultimoCliccato = mezzoId;
    var targetItem = DOM.pvListBody.querySelector('[data-mezzo-id="' + mezzoId + '"]');
    if (targetItem) {
        targetItem.classList.add('selected');
        targetItem.classList.add('selected-multi');
    }
    _aggiornaBatchToolbarMezzi();
    renderMezziForm(mezzoId);
}

// =============================================================================
// SELEZIONE MULTIPLA MEZZI — Stato e funzioni
// =============================================================================

var _mezziSelState = {
    mezziSelezionati: [],
    ultimoCliccato: null,
};

function _pulisciSelezioneMultiplaMezzi() {
    _mezziSelState.mezziSelezionati = [];
    _mezziSelState.ultimoCliccato = null;
    var items = document.querySelectorAll('#pv-list-body .pv-list-item');
    items.forEach(function (el) { el.classList.remove('selected-multi'); });
    var selAll = document.getElementById('pv-select-all-mezzi');
    if (selAll) selAll.checked = false;
    _aggiornaBatchToolbarMezzi();
}

function _aggiornaBatchToolbarMezzi() {
    var toolbar = document.getElementById('pv-batch-toolbar-mezzi');
    if (!toolbar) return;
    var count = _mezziSelState.mezziSelezionati.length;
    if (count >= 2) {
        toolbar.classList.add('visible');
        var countEl = toolbar.querySelector('.pv-batch-count');
        if (countEl) countEl.textContent = count + ' selezionati';
        var delBtn = document.getElementById('pv-batch-delete-mezzi');
        if (delBtn) delBtn.textContent = '🗑 Elimina ' + count;
    } else {
        toolbar.classList.remove('visible');
    }
}

function _toggleSelezioneMultiplaMezzi(mezzoId, ctrlKey, shiftKey) {
    var items = Array.from(document.querySelectorAll('#pv-list-body .pv-list-item'));
    var currentItem = items.find(function (el) { return parseInt(el.dataset.mezzoId) == mezzoId; });
    if (!currentItem) return;

    if (shiftKey && _mezziSelState.ultimoCliccato !== null) {
        var startIdx = items.findIndex(function (el) { return parseInt(el.dataset.mezzoId) == _mezziSelState.ultimoCliccato; });
        var endIdx = items.findIndex(function (el) { return el === currentItem; });
        if (startIdx >= 0 && endIdx >= 0) {
            var minIdx = Math.min(startIdx, endIdx);
            var maxIdx = Math.max(startIdx, endIdx);
            for (var i = minIdx; i <= maxIdx; i++) {
                var id = parseInt(items[i].dataset.mezzoId);
                if (_mezziSelState.mezziSelezionati.indexOf(id) === -1) {
                    _mezziSelState.mezziSelezionati.push(id);
                }
                items[i].classList.add('selected-multi');
            }
        }
    } else if (ctrlKey) {
        var idx = _mezziSelState.mezziSelezionati.indexOf(mezzoId);
        if (idx >= 0) {
            _mezziSelState.mezziSelezionati.splice(idx, 1);
            currentItem.classList.remove('selected-multi');
        } else {
            _mezziSelState.mezziSelezionati.push(mezzoId);
            currentItem.classList.add('selected-multi');
        }
    } else {
        _pulisciSelezioneMultiplaMezzi();
        _mezziSelState.mezziSelezionati.push(mezzoId);
        currentItem.classList.add('selected-multi');
    }

    _mezziSelState.ultimoCliccato = mezzoId;
    _aggiornaBatchToolbarMezzi();
}

async function _eseguiEliminazioneBatchMezzi() {
    var ids = _mezziSelState.mezziSelezionati;
    if (ids.length === 0) return;

    var mezzi = ids.map(function (id) {
        return WS.contenitori.find(function (c) { return c.id == id; });
    }).filter(Boolean);
    var nomi = mezzi.map(function (m) { return m.nome; }).join(', ');

    if (!confirm('Eliminare ' + ids.length + ' mezzi?\n\n' + nomi + '\n\nNota: i mezzi usati in piani di carico non saranno eliminati.')) return;

    try {
        setStatus('busy', 'Eliminazione batch mezzi...');
        var eliminati = 0;
        for (var i = 0; i < ids.length; i++) {
            var resp = await fetch('/api/contenitori/' + ids[i] + '/', {
                method: 'DELETE',
                headers: { 'X-CSRFToken': getCSRFToken() },
            });
            if (resp.ok) {
                var idx = WS.contenitori.findIndex(function (c) { return c.id == ids[i]; });
                if (idx >= 0) WS.contenitori.splice(idx, 1);
                eliminati++;
            }
        }
        _pulisciSelezioneMultiplaMezzi();
        aggiornaSelectMezzi();
        renderMezziPanel();
        showToast('🗑 Eliminati ' + eliminati + ' mezzi!', 'success');
        setStatus('idle', 'Eliminati');
    } catch (err) {
        showToast('❌ Errore eliminazione batch: ' + err.message, 'error');
        setStatus('error', 'Errore');
    }
}

