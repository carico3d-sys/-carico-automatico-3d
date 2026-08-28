/**
 * Workspace Carico 3D — Panel Mezzi di Trasporto
 *
 * Lista e form creazione/modifica dei mezzi.
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

// Helper: wiring click sugli item della lista mezzi
function _wireMezziListClickHandlers() {
    DOM.pvListBody.querySelectorAll('.pv-list-item').forEach(function (item) {
        item.addEventListener('click', function () {
            var mid = parseInt(item.dataset.mezzoId) || 0;
            if (!mid) return;
            DOM.pvListBody.querySelectorAll('.pv-list-item').forEach(function (el) { el.classList.remove('selected'); });
            item.classList.add('selected');
            renderMezziForm(mid);
        });
    });
}

function renderMezziPanel() {
    if (typeof _panelViewPronto === 'function' && !_panelViewPronto('mezzi')) return;
    DOM.pvListTitle.innerHTML = '<i class="bi bi-truck"></i> <span class="language-label" data-translation-key="vehicles.titolo" data-italiano="Mezzi di Trasporto">Mezzi di Trasporto</span>';
    DOM.pvFormTitle.innerHTML = '<span class="language-label" data-translation-key="vehicles.nuovo" data-italiano="Nuovo Mezzo">Nuovo Mezzo</span>';
    DOM.pvListCount.textContent = WS.contenitori.filter(function (c) { return !!c.archiviato === _mezziMostraArchiviati; }).length;

    // ---- HEADER: filtro mezzi archiviati ----
    var listHeader = document.querySelector('#panel-view-list .pv-list-header');
    if (listHeader) {
        var oldSelAll = listHeader.querySelector('.pv-list-select-all');
        if (oldSelAll) oldSelAll.remove();
        var oldArchCheck = listHeader.querySelector('.pv-list-archiviati');
        if (oldArchCheck) oldArchCheck.remove();
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
        archLabel.appendChild(document.createTextNode(' '));
        var archivedText = document.createElement('span');
        archivedText.className = 'language-label';
        archivedText.dataset.translationKey = 'vehicles.archiviati';
        archivedText.dataset.italiano = 'Archiviati';
        archivedText.textContent = 'Archiviati';
        archLabel.appendChild(archivedText);
        listHeader.appendChild(archLabel);

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

    DOM.pvListBody.innerHTML = _buildMezziListHtml();
    _wireMezziListClickHandlers();

    // Form default: nuovo
    renderMezziForm(null);
    document.dispatchEvent(new CustomEvent('carico3d:panel-rendered'));
}

function renderMezziForm(mezzoId) {
    if (typeof _panelViewPronto === 'function' && !_panelViewPronto('form mezzo')) return;
    var m = mezzoId ? WS.contenitori.find(function (c) { return c.id == mezzoId; }) : null;
    var isEdit = !!m;
    DOM.pvFormTitle.innerHTML = isEdit ? '<i class="bi bi-pencil"></i> Modifica: ' + escapeHtml(m.nome) : '<i class="bi bi-plus-circle"></i> Nuovo Mezzo';

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
            '<label class="field-label"><span class="language-label" data-translation-key="vehicles.nome" data-italiano="Nome / Modello">Nome / Modello</span></label>' +
            '<input type="text" class="form-input" id="pv-mezzo-nome" value="' + (m ? escapeHtml(m.nome) : '') + '" placeholder="Es. Camion Bilico 13.6m">' +
        '</div>' +
        '<div class="field-group">' +
            '<label class="field-label language-label" data-translation-key="vehicles.tipo" data-italiano="Tipo Mezzo">Tipo Mezzo</label>' +
            '<select class="form-select" id="pv-mezzo-tipo">' + tipoHtml + '</select>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-group flex-grow"><label class="field-label">L (cm)</label><input type="number" class="form-input" id="pv-mezzo-lungh" value="' + (m ? formatCm(m.lunghezza_mm) : '') + '" placeholder="Lunghezza in cm" data-translation-key="vehicles.lunghezza" data-italiano="Lunghezza in cm" step="0.1" min="1"></div>' +
            '<div class="field-group flex-grow"><label class="field-label">W (cm)</label><input type="number" class="form-input" id="pv-mezzo-larg" value="' + (m ? formatCm(m.larghezza_mm) : '') + '" placeholder="Larghezza in cm" data-translation-key="vehicles.larghezza" data-italiano="Larghezza in cm" step="0.1" min="1"></div>' +
            '<div class="field-group flex-grow"><label class="field-label">H (cm)</label><input type="number" class="form-input" id="pv-mezzo-alt" value="' + (m ? formatCm(m.altezza_mm) : '') + '" placeholder="Altezza in cm" data-translation-key="vehicles.altezza" data-italiano="Altezza in cm" step="0.1" min="1"></div>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-group" style="flex:0 0 180px;"><label class="field-label"><span class="language-label" data-translation-key="vehicles.portata" data-italiano="Portata (kg)">Portata (kg)</span></label><input type="number" class="form-input" id="pv-mezzo-peso" value="' + (m ? parseFloat(m.carico_massimo_kg).toFixed(1) : '') + '" placeholder="Portata in kg" data-translation-key="vehicles.portata-placeholder" data-italiano="Portata in kg" step="0.1" min="1"></div>' +
            '<div class="field-group flex-grow" style="flex-direction:row;align-items:flex-end;justify-content:flex-end;gap:12px;"><label class="checkbox-label" style="margin-top:0;"><input type="checkbox" id="pv-mezzo-archiviato"' + (m && m.archiviato ? ' checked' : '') + '> <span class="language-label" data-translation-key="vehicles.archivia" data-italiano="Archivia">Archivia</span></label></div>' +
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
    var targetItem = DOM.pvListBody.querySelector('[data-mezzo-id="' + mezzoId + '"]');
    if (targetItem) targetItem.classList.add('selected');
    renderMezziForm(mezzoId);
}

