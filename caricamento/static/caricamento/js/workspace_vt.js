/**
 * Workspace Carico 3D — Vincoli Tra Oggetti (Orchestratore)
 *
 * Stato globale, popolamento liste oggetti, CRUD vincoli (salva/elimina),
 * event wiring e gestione UI del pannello vincoli tra oggetti.
 *
 * Depends on: workspace_vt_rotazioni.js, workspace_vt_canvas.js
 *             workspace_core.js (WS, DOM, escapeHtml, showToast, getCSRFToken, setStatus)
 */

// =============================================================================
// VINCOLI TRA OGGETTI v6 — 1 card per posizione estrema
// =============================================================================
// Ogni configurazione = una posizione specifica (sx, dx, dietro, avanti, centro)
// Relazione unica: "A sopra B"
// =============================================================================

var _vtState = {
    oggettoAId: 0,
    oggettoBId: 0,
    configurazioni: [],  // [{ id, rotA, dimsA, rotB, dimsB, offsetX, offsetZ, posizione_label, valida }]
    editingVincoloId: null,
    editingVincolo: null,
};

var _vtRotazioniCache = {};
var _vtCanvases = [];       // [{ canvas, renderer, scene, camera }] — per cleanup

// =============================================================================
// POPOLAMENTO LISTE OGGETTI
// =============================================================================

function _vtPopolaListeOggetti(filterA, filterB) {
    filterA = (filterA || '').toLowerCase();
    filterB = (filterB || '').toLowerCase();

    var listA = document.getElementById('vt-list-a');
    var listB = document.getElementById('vt-list-b');
    if (!listA || !listB) return;

    var htmlA = '', htmlB = '';
    var catalog = (WS.oggettiCatalog && WS.oggettiCatalog.length > 0) ? WS.oggettiCatalog : WS.oggettiDisponibili;
    catalog.forEach(function (o) {
        var codice = (o.codice || '').toLowerCase();
        var matchA = !filterA || codice.indexOf(filterA) >= 0;
        var matchB = !filterB || codice.indexOf(filterB) >= 0;

        var itemHtml = '<div class="vt-obj-item" data-oggetto-id="' + o.id + '">' +
            '<span>' + escapeHtml(o.codice) + '</span>' +
        '</div>';

        if (matchA) htmlA += itemHtml;
        if (matchB) htmlB += itemHtml;
    });

    listA.innerHTML = htmlA || '<div class="vt-obj-empty">Nessun oggetto</div>';
    listB.innerHTML = htmlB || '<div class="vt-obj-empty">Nessun oggetto</div>';

    if (_vtState.oggettoAId) {
        var selA = listA.querySelector('[data-oggetto-id="' + _vtState.oggettoAId + '"]');
        if (selA) selA.classList.add('selected');
    }
    if (_vtState.oggettoBId) {
        var selB = listB.querySelector('[data-oggetto-id="' + _vtState.oggettoBId + '"]');
        if (selB) selB.classList.add('selected');
    }
}

// =============================================================================
// HELPER CONDIVISO: Build opzioni per la select "Carica vincolo"
// =============================================================================

function _vtBuildLoadSelectOptions() {
    var opts = '<option value="">— Carica vincolo (' + WS.vincoliTra.length + ') —</option>';
    WS.vincoliTra.forEach(function (v) {
        opts += '<option value="' + v.id + '">' + escapeHtml(v.oggetto_a_codice) + ' ↑ ' + escapeHtml(v.oggetto_b_codice) + '</option>';
    });
    return opts;
}

// =============================================================================
// VINCOLI ESISTENTI
// =============================================================================

function _vtPopolaVincoliEsistenti() {
    var container = document.getElementById('vt-existing-list');
    var count = document.getElementById('vt-existing-count');
    if (!container) return;
    if (count) count.textContent = WS.vincoliTra.length;

    // Aggiorna anche la select "Carica vincolo" nell'header
    var loadSelect = document.getElementById('vt-load-select');
    if (loadSelect) {
        loadSelect.innerHTML = _vtBuildLoadSelectOptions();
    }

    var html = '';
    WS.vincoliTra.forEach(function (v) {
        var isLegacy = v.tipo_relazione !== 'sopra';
        var legacyBadge = isLegacy ? ' <span class="vt-legacy-badge">legacy</span>' : '';
        var dettagli = v.dettagli_posizionamento;
        var configInfo = '';
        if (dettagli && dettagli.configurazioni) {
            var tot = dettagli.configurazioni.length;
            var valide = dettagli.configurazioni.filter(function (c) { return c.valida; }).length;
            configInfo = ' \u00b7 ' + tot + ' config';
            if (valide < tot) configInfo += ' (' + valide + ' valide)';
            else configInfo += ' (tutte)';
        } else if (dettagli && dettagli.configurazioni_valide) {
            // Legacy format v2
            var tot = dettagli.configurazioni_valide.length;
            var sl = dettagli.configurazione_selezionata;
            configInfo = ' \u00b7 ' + tot + ' config';
            if (sl !== null && sl !== undefined) configInfo += ' (#' + (sl + 1) + ')';
            else configInfo += ' (tutte)';
        }

        var tagClass = isLegacy ? 'vt-tag-legacy' : 'vt-tag-sopra';
        html += '<div class="vt-existing-item' + (isLegacy ? ' vt-legacy-item' : '') + '" data-vincolo-id="' + v.id + '">' +
            '<div class="vt-existing-item-info">' +
                '<strong>' + escapeHtml(v.oggetto_a_codice) + ' \u2191 ' + escapeHtml(v.oggetto_b_codice) + legacyBadge + '</strong>' +
                '<span>' + escapeHtml(v.tipo_relazione_display || v.tipo_relazione) + configInfo + '</span>' +
            '</div>' +
            '<span class="vt-existing-tag ' + tagClass + '">' + (v.attivo ? 'attivo' : 'disattivo') + '</span>' +
        '</div>';
    });
    container.innerHTML = html || '<div class="vt-obj-empty">Nessun vincolo definito</div>';

    container.querySelectorAll('.vt-existing-item').forEach(function (item) {
        item.addEventListener('click', function () {
            container.querySelectorAll('.vt-existing-item').forEach(function (el) { el.classList.remove('selected'); });
            item.classList.add('selected');
            var vid = parseInt(item.dataset.vincoloId) || 0;
            if (vid) _vtCaricaVincolo(vid);
        });
    });
}

function _vtCaricaVincolo(vincoloId) {
    var v = WS.vincoliTra.find(function (x) { return x.id == vincoloId; });
    if (!v) return;

    if (v.tipo_relazione !== 'sopra') {
        showToast('\u26a0\ufe0f Vincolo legacy (' + (v.tipo_relazione_display || v.tipo_relazione) + '). Eliminalo e ricrealo come "A sopra B".', 'warning');
        var el = document.getElementById('vt-existing-list');
        if (el) el.querySelectorAll('.vt-existing-item.selected').forEach(function (x) { x.classList.remove('selected'); });
        _vtResettaForm();
        return;
    }

    _vtState.editingVincoloId = v.id;
    _vtState.editingVincolo = v;
    _vtState.oggettoAId = v.oggetto_a;
    _vtState.oggettoBId = v.oggetto_b;
    _vtCalcolaConfigurazioni();

    var dettagli = v.dettagli_posizionamento;
    if (dettagli && dettagli.configurazioni) {
        dettagli.configurazioni.forEach(function (dc) {
            if (dc.posizioni && dc.posizioni.length > 0) {
                // Backward compat: old format with posizioni array — flatten
                dc.posizioni.forEach(function (pos) {
                    var matched = _vtMatchConfig({ rotA: dc.rotA, rotB: dc.rotB, offsetX: pos.offsetX, offsetZ: pos.offsetZ });
                    if (matched) matched.valida = (dc.valida !== false);
                });
            } else {
                // New format: scalar offsetX/offsetZ
                var matched = _vtMatchConfig(dc);
                if (matched) matched.valida = (dc.valida !== false);
            }
        });
    } else if (dettagli && dettagli.configurazioni_valide) {
        // v2 legacy: single configSelezionata -> convert to per-config
        var sl = dettagli.configurazione_selezionata;
        _vtState.configurazioni.forEach(function (c, i) {
            c.valida = (sl === null || sl === undefined || i === sl);
        });
    }
    // else: all valide (default)

    _vtPopolaListeOggetti();
    _vtPopolaGrigliaConfigurazioni();

    var btnCreate = document.getElementById('vt-btn-create');
    var btnUpdate = document.getElementById('vt-btn-update');
    var btnDelete = document.getElementById('vt-btn-delete');
    if (btnCreate) btnCreate.style.display = 'none';
    if (btnUpdate) btnUpdate.style.display = '';
    if (btnDelete) btnDelete.style.display = '';
}

/**
 * Escludi tutte le configurazioni del vincolo caricato.
 * Imposta valida = false per tutte e ri-renderizza la griglia.
 */
function _vtEscludiTutti() {
    if (_vtState.configurazioni.length === 0) {
        showToast('⚠️ Nessuna configurazione da escludere. Carica prima un vincolo.', 'warning');
        return;
    }

    _vtState.configurazioni.forEach(function (c) { c.valida = false; });
    _vtPopolaGrigliaConfigurazioni();
    showToast('🚫 Tutte le configurazioni escluse. Seleziona manualmente quelle valide.', 'info');
}

function _vtResettaForm() {
    _vtDistruggiCanvases();

    _vtState.editingVincoloId = null;
    _vtState.editingVincolo = null;
    _vtState.oggettoAId = 0;
    _vtState.oggettoBId = 0;
    _vtState.configurazioni = [];
    _vtRotazioniCache = {};

    var el = document.getElementById('vt-existing-list');
    if (el) el.querySelectorAll('.vt-existing-item.selected').forEach(function (x) { x.classList.remove('selected'); });

    var btnCreate = document.getElementById('vt-btn-create');
    var btnUpdate = document.getElementById('vt-btn-update');
    var btnDelete = document.getElementById('vt-btn-delete');
    if (btnCreate) btnCreate.style.display = '';
    if (btnUpdate) btnUpdate.style.display = 'none';
    if (btnDelete) btnDelete.style.display = 'none';

    _vtPopolaListeOggetti();
    _vtPopolaGrigliaConfigurazioni();

    if (typeof distruggiMiniViewportVincolo === 'function') distruggiMiniViewportVincolo();
    if (typeof resetEvidenziaVincolo === 'function') resetEvidenziaVincolo();
    _vtAggiornaValidazione();
}

function _vtAggiornaValidazione() {
    var btnCreate = document.getElementById('vt-btn-create');
    var btnUpdate = document.getElementById('vt-btn-update');
    var btnEscludi = document.getElementById('vt-btn-escludi');
    var valido = _vtState.oggettoAId > 0 && _vtState.oggettoBId > 0
        && _vtState.configurazioni.length > 0;
    if (btnCreate) btnCreate.disabled = !valido;
    if (btnUpdate) btnUpdate.disabled = !valido;
    if (btnEscludi) btnEscludi.disabled = !valido;
}

// =============================================================================
// EVENT LISTENERS
// =============================================================================

function _vtWireEvents() {
    var searchA = document.getElementById('vt-search-a');
    if (searchA) searchA.addEventListener('input', function () {
        _vtPopolaListeOggetti(this.value, (document.getElementById('vt-search-b') || {}).value || '');
    });

    var searchB = document.getElementById('vt-search-b');
    if (searchB) searchB.addEventListener('input', function () {
        _vtPopolaListeOggetti((document.getElementById('vt-search-a') || {}).value || '', this.value);
    });

    var listA = document.getElementById('vt-list-a');
    if (listA) listA.addEventListener('click', function (e) {
        var item = e.target.closest('.vt-obj-item');
        if (!item) return;
        var oid = parseInt(item.dataset.oggettoId) || 0;
        _vtDistruggiCanvases();
        // Resetta editingVincoloId prima — verrà ripristinato se esiste vincolo
        _vtState.editingVincoloId = null;
        _vtState.editingVincolo = null;
        _vtState.oggettoAId = oid;
        _vtRotazioniCache = {};
        _vtPopolaListeOggetti(
            (document.getElementById('vt-search-a') || {}).value || '',
            (document.getElementById('vt-search-b') || {}).value || ''
        );
        _vtCalcolaConfigurazioni();
        _vtControllaVincoloEsistente();
        _vtPopolaGrigliaConfigurazioni();
    });

    var listB = document.getElementById('vt-list-b');
    if (listB) listB.addEventListener('click', function (e) {
        var item = e.target.closest('.vt-obj-item');
        if (!item) return;
        var oid = parseInt(item.dataset.oggettoId) || 0;
        _vtDistruggiCanvases();
        // Resetta editingVincoloId prima — verrà ripristinato se esiste vincolo
        _vtState.editingVincoloId = null;
        _vtState.editingVincolo = null;
        _vtState.oggettoBId = oid;
        _vtRotazioniCache = {};
        _vtPopolaListeOggetti(
            (document.getElementById('vt-search-a') || {}).value || '',
            (document.getElementById('vt-search-b') || {}).value || ''
        );
        _vtCalcolaConfigurazioni();
        _vtControllaVincoloEsistente();
        _vtPopolaGrigliaConfigurazioni();
    });

    // Dropdown carica vincolo esistente
    var loadSel = document.getElementById('vt-load-select');
    if (loadSel) loadSel.addEventListener('change', function () {
        var vid = parseInt(this.value) || 0;
        if (vid) { _vtCaricaVincolo(vid); this.value = ''; }
    });

    var btnEscludi = document.getElementById('vt-btn-escludi');
    if (btnEscludi) btnEscludi.addEventListener('click', function () { _vtEscludiTutti(); });

    var btnNew = document.getElementById('vt-btn-new');
    if (btnNew) btnNew.addEventListener('click', function () { _vtResettaForm(); });

    var btnCreate = document.getElementById('vt-btn-create');
    if (btnCreate) btnCreate.addEventListener('click', function () { _vtSalvaVincolo(); });

    var btnUpdate = document.getElementById('vt-btn-update');
    if (btnUpdate) btnUpdate.addEventListener('click', function () { _vtSalvaVincolo(); });

    var btnDelete = document.getElementById('vt-btn-delete');
    if (btnDelete) btnDelete.addEventListener('click', function () { _vtEliminaVincolo(); });

    _vtAggiornaValidazione();
}

// =============================================================================
// SALVA / ELIMINA VINCOLO
// =============================================================================

async function _vtSalvaVincolo() {
    var oggettoA = _vtState.oggettoAId;
    var oggettoB = _vtState.oggettoBId;

    if (!oggettoA || !oggettoB) {
        showToast('\u26a0\ufe0f Seleziona Oggetto A e Oggetto B.', 'warning');
        return;
    }
    if (_vtState.configurazioni.length === 0) {
        showToast('\u26a0\ufe0f Calcola prima le configurazioni.', 'warning');
        return;
    }

    var dettagli = {
        configurazioni: _vtState.configurazioni.map(function (c) {
            return { id: c.id, rotA: c.rotA, dimsA: c.dimsA, rotB: c.rotB, dimsB: c.dimsB, offsetX: c.offsetX, offsetZ: c.offsetZ, posizione_label: c.posizione_label, valida: c.valida };
        }),
    };

    var payload = {
        oggetto_a: oggettoA,
        oggetto_b: oggettoB,
        tipo_relazione: 'sopra',
        attivo: true,
        dettagli_posizionamento: dettagli,
    };

    // Se non siamo già in modifica ma esiste un vincolo tra A e B, passa a modifica
    var isEdit = !!_vtState.editingVincoloId;
    var vincoloId = _vtState.editingVincoloId;
    if (!isEdit) {
        var esistente = _vtTrovaVincoloEsistente(oggettoA, oggettoB);
        if (esistente) {
            isEdit = true;
            vincoloId = esistente.id;
        }
    }

    try {
        setStatus('busy', 'Salvataggio...');
        var url = '/api/vincoli-tra-oggetti/' + (isEdit ? vincoloId + '/' : '');
        var method = isEdit ? 'PATCH' : 'POST';
        var resp = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) {
            var errData = await resp.json().catch(function () { return {}; });
            throw new Error(errData.detail || Object.values(errData)[0] || 'HTTP ' + resp.status);
        }

        var data = await resp.json();
        var serverId = Number(data.id);

        if (isEdit) {
            var idx = WS.vincoliTra.findIndex(function (x) { return x.id == vincoloId; });
            if (idx >= 0) {
                WS.vincoliTra[idx] = Object.assign({}, WS.vincoliTra[idx], {
                    oggetto_a: data.oggetto_a, oggetto_b: data.oggetto_b,
                    oggetto_a_codice: data.oggetto_a_codice, oggetto_b_codice: data.oggetto_b_codice,
                    tipo_relazione: data.tipo_relazione, tipo_relazione_display: data.tipo_relazione_display,
                    dettagli_posizionamento: data.dettagli_posizionamento, attivo: data.attivo,
                });
            }
        } else {
            WS.vincoliTra.push({
                id: serverId, oggetto_a: data.oggetto_a, oggetto_b: data.oggetto_b,
                oggetto_a_codice: data.oggetto_a_codice, oggetto_b_codice: data.oggetto_b_codice,
                tipo_relazione: data.tipo_relazione, tipo_relazione_display: data.tipo_relazione_display,
                dettagli_posizionamento: data.dettagli_posizionamento, attivo: data.attivo,
            });
        }

        var badge = document.getElementById('vt-count-badge');
        if (badge) badge.textContent = WS.vincoliTra.length;

        _vtPopolaVincoliEsistenti();

        if (isEdit) {
            // Dopo l'aggiornamento, mantieni il form con le configurazioni caricate
            _vtState.editingVincoloId = serverId || vincoloId;
            // Sincronizza editingVincolo con i dati aggiornati (Object.assign sopra)
            if (idx >= 0) {
                _vtState.editingVincolo = WS.vincoliTra[idx];
            }
            _vtPopolaGrigliaConfigurazioni();

            var btnCreate = document.getElementById('vt-btn-create');
            var btnUpdate = document.getElementById('vt-btn-update');
            var btnDelete = document.getElementById('vt-btn-delete');
            if (btnCreate) btnCreate.style.display = 'none';
            if (btnUpdate) btnUpdate.style.display = '';
            if (btnDelete) btnDelete.style.display = '';
        } else {
            _vtResettaForm();
        }

        showToast(isEdit ? '\u2705 Vincolo aggiornato!' : '\u2705 Vincolo creato!', 'success');
        setStatus('idle', 'Salvato');
    } catch (err) {
        showToast('\u274c Errore: ' + err.message, 'error');
        setStatus('error', 'Errore');
    }
}

async function _vtEliminaVincolo() {
    if (!_vtState.editingVincoloId) return;
    if (!confirm('Eliminare questo vincolo?')) return;

    var vincoloId = _vtState.editingVincoloId;
    try {
        setStatus('busy', 'Eliminazione...');
        var resp = await fetch('/api/vincoli-tra-oggetti/' + vincoloId + '/', {
            method: 'DELETE', headers: { 'X-CSRFToken': getCSRFToken() }
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        WS.vincoliTra = WS.vincoliTra.filter(function (x) { return x.id != vincoloId; });

        var badge = document.getElementById('vt-count-badge');
        if (badge) badge.textContent = WS.vincoliTra.length;

        _vtPopolaVincoliEsistenti();
        _vtResettaForm();
        showToast('\u{1F5D1}\uFE0F Vincolo eliminato.', 'info');
        setStatus('idle', 'Eliminato');
    } catch (err) {
        showToast('\u274c Errore: ' + err.message, 'error');
        setStatus('error', 'Errore');
    }
}
