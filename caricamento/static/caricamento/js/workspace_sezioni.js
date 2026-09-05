/**
 * Gestione Sezioni di Carico (Assi) nel form Mezzi di Trasporto.
 *
 * Funzioni per renderizzare, raccogliere, salvare e validare
 * le zone di carico configurabili dall'utente in 🚛 Mezzi di Trasporto.
 *
 * I valori vengono mostrati in cm (o in in imperiale) ma salvati in mm.
 *
 * Dipendenze: workspace.js (WS, DOM, getCSRFToken, showToast, escapeHtml, formatCm,
 *             unitaDimensione, unitaPeso, unitaLineari, getUnitaMisura)
 */

// --- Inizializzazione event delegation (chiamata una sola volta) ---
var _sezioniDelegationReady = false;

function _initSezioniDelegation() {
    if (_sezioniDelegationReady) return;
    _sezioniDelegationReady = true;
    document.body.addEventListener('click', function (e) {
        var removeBtn = e.target.closest('.pv-sez-remove');
        if (removeBtn) {
            var row = removeBtn.closest('tr');
            if (row) {
                e.stopPropagation();
                row.remove();
                _aggiornaCoperturaSezioni();
            }
            return;
        }
        if (e.target.closest('#pv-sez-add')) {
            e.stopPropagation();
            _aggiungiRigaSezione();
        }
    });
}

_initSezioniDelegation();

function _traduciSezione(key, fallback) {
    var lingua = window.CARICO3D_LANGUAGE === 'en' ? 'en' : 'it';
    return (window.DIZIONARIO && window.DIZIONARIO[lingua] && window.DIZIONARIO[lingua][key]) || fallback;
}

// --- Conversione mm ↔ display (cm o in) ---

/** mm → valore display (cm o in) */
function _sezMmToDisplay(mm) {
    if (getUnitaMisura() === 'imperiale') {
        return (mm / 25.4).toFixed(1);
    }
    return (mm / 10).toFixed(0);
}

/** valore display (cm o in) → mm */
function _sezDisplayToMm(displayVal) {
    var val = parseFloat(displayVal) || 0;
    if (getUnitaMisura() === 'imperiale') {
        return Math.round(val * 25.4);
    }
    return Math.round(val * 10);
}

function _renderSezioniTable(sezioni, lunghezzaMm) {
    sezioni = sezioni || [];
    var u = unitaDimensione();
    var righe = '';
    sezioni.forEach(function (s, i) {
        righe +=
            '<tr class="pv-sezione-row">' +
                '<td><input type="text" class="form-input form-input-sm pv-sez-nome" value="' + escapeHtml(s.nome || '') + '" placeholder="Zona ' + (i + 1) + '"></td>' +
                '<td><input type="number" class="form-input form-input-sm pv-sez-inizio" value="' + _sezMmToDisplay(s.inizio_x_mm || 0) + '" min="0" step="10"></td>' +
                '<td><input type="number" class="form-input form-input-sm pv-sez-fine" value="' + _sezMmToDisplay(s.fine_x_mm || 0) + '" min="0.1" step="10"></td>' +
                '<td><input type="number" class="form-input form-input-sm pv-sez-carico" value="' + parseFloat(s.carico_massimo_kg || 0) + '" min="0.01" step="100"></td>' +
                '<td class="pv-sez-info">' + (s.baricentro_x_mm ? '<span class="language-label" data-translation-key="vehicles.sezioni.cg" data-italiano="CG">CG</span> @ ' + _sezMmToDisplay(s.baricentro_x_mm) + ' ' + u : '—') + '</td>' +
                '<td><button type="button" class="btn-item-action pv-sez-remove" data-translation-key="vehicles.sezioni.rimuovi" data-italiano="Rimuovi" title="Rimuovi">✕</button></td>' +
            '</tr>';
    });

    var coperturaHtml = '';
    if (lunghezzaMm && sezioni.length > 0) {
        var primo = sezioni[0];
        var ultimo = sezioni[sezioni.length - 1];
        var coperturaTotale = primo.inizio_x_mm === 0 && ultimo.fine_x_mm === lunghezzaMm;
        coperturaHtml =
            '<div class="pv-sez-copertura" style="color:' + (coperturaTotale ? '#27ae60' : '#f39c12') + ';">' +
                _traduciSezione('vehicles.sezioni.copertura', 'Copertura') + ': ' + _sezMmToDisplay(primo.inizio_x_mm || 0) + ' → ' + _sezMmToDisplay(ultimo.fine_x_mm || 0) + ' ' + u +
                (coperturaTotale ? ' ' + _traduciSezione('vehicles.sezioni.completa', '✅ Completa') : ' <span class="language-label" data-translation-key="vehicles.sezioni.parziale" data-italiano="⚡ Parziale">⚡ Parziale</span> (max ' + _sezMmToDisplay(lunghezzaMm) + ' ' + u + ') — <span class="language-label" data-translation-key="vehicles.sezioni.consentito" data-italiano="consentito">consentito</span>') +
            '</div>';
    }

    return '' +
        '<div class="pv-sezioni-section">' +
            '<div class="pv-sezioni-header">' +
                '<strong>🔧 ' + _traduciSezione('vehicles.sezioni.titolo', 'Sezioni di Carico (Assi)').replace(/^🔧\s*/, '') + '</strong>' +
                '<button class="btn btn-sm" id="pv-sez-add" type="button">' + _traduciSezione('vehicles.sezioni.aggiungi', '+ Aggiungi') + '</button>' +
            '</div>' +
            '<table class="pv-sezioni-table">' +
                '<thead><tr>' +
                    '<th>' + _traduciSezione('vehicles.sezioni.nome', 'Nome') + '</th><th>' + _traduciSezione('vehicles.sezioni.inizio', 'Inizio') + ' (' + u + ')</th><th>' + _traduciSezione('vehicles.sezioni.fine', 'Fine') + ' (' + u + ')</th><th>' + _traduciSezione('vehicles.sezioni.carico-max', 'Carico max (' + unitaPeso() + ')') + '</th><th>' + _traduciSezione('vehicles.sezioni.baricentro', 'Baricentro') + '</th><th></th>' +
                '</tr></thead>' +
                '<tbody id="pv-sezioni-tbody">' + (righe || '<tr><td colspan="6" style="color:#999;text-align:center;padding:12px;"><span class="language-label" data-translation-key="vehicles.sezioni.nessuna" data-italiano="Nessuna sezione configurata. Clicca \"+ Aggiungi\".">Nessuna sezione configurata. Clicca "+ Aggiungi".</span></td></tr>') + '</tbody>' +
            '</table>' +
            coperturaHtml +
        '</div>';
}

function _raccogliSezioniDaForm() {
    var rows = document.querySelectorAll('.pv-sezione-row');
    var sezioni = [];
    var avvisi = [];
    rows.forEach(function (row, i) {
        var nome = row.querySelector('.pv-sez-nome').value.trim();
        var inizioMm = _sezDisplayToMm(row.querySelector('.pv-sez-inizio').value);
        var fineMm = _sezDisplayToMm(row.querySelector('.pv-sez-fine').value);
        var carico = parseFloat(row.querySelector('.pv-sez-carico').value) || 0;
        if (!nome) { avvisi.push('Riga ' + (i+1) + ': nome mancante'); return; }
        if (fineMm <= inizioMm) { avvisi.push('Riga ' + (i+1) + ': fine deve essere > inizio'); return; }
        if (carico <= 0) { avvisi.push('Riga ' + (i+1) + ': carico max mancante'); return; }
        sezioni.push({ nome: nome, inizio_x_mm: inizioMm, fine_x_mm: fineMm, carico_massimo_kg: carico });
    });
    if (avvisi.length > 0 && rows.length > 0) {
        showToast('⚠️ Alcune righe non sono valide: ' + avvisi.join('; '), 'warning');
    }
    return sezioni;
}

async function _salvaSezioni(mezzoId) {
    var sezioni = _raccogliSezioniDaForm();
    try {
        var resp = await fetch('/api/contenitori/' + mezzoId + '/sezioni/', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify(sezioni),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        var idx = WS.contenitori.findIndex(function (c) { return c.id == mezzoId; });
        if (idx >= 0) {
            WS.contenitori[idx].sezioni = data;
        }
        return { success: true, data: data };
    } catch (err) {
        console.error('Errore salvataggio sezioni:', err);
        return { success: false, error: err.message };
    }
}

function _aggiornaCoperturaSezioni() {
    var rows = document.querySelectorAll('.pv-sezione-row');
    var el = document.querySelector('.pv-sez-copertura');
    if (!el) return;
    var u = unitaDimensione();
    var sezioni = [];
    rows.forEach(function (row) {
        var inizioMm = _sezDisplayToMm(row.querySelector('.pv-sez-inizio').value);
        var fineMm = _sezDisplayToMm(row.querySelector('.pv-sez-fine').value);
        if (fineMm > inizioMm) sezioni.push({ inizio_x_mm: inizioMm, fine_x_mm: fineMm });
    });
    if (sezioni.length === 0) { el.innerHTML = ''; return; }
    sezioni.sort(function (a, b) { return a.inizio_x_mm - b.inizio_x_mm; });
    var primo = sezioni[0];
    var ultimo = sezioni[sezioni.length - 1];
    var lunghCm = parseFloat(document.getElementById('pv-mezzo-lungh') && document.getElementById('pv-mezzo-lungh').value) || 0;
    var lunghMm = _sezDisplayToMm(lunghCm);
    var coperturaTotale = primo.inizio_x_mm === 0 && ultimo.fine_x_mm === lunghMm;
    el.style.color = coperturaTotale ? '#27ae60' : '#f39c12';
    el.innerHTML = _traduciSezione('vehicles.sezioni.copertura', 'Copertura') + ': ' + _sezMmToDisplay(primo.inizio_x_mm) + ' → ' + _sezMmToDisplay(ultimo.fine_x_mm) + ' ' + u +
        (coperturaTotale ? ' ' + _traduciSezione('vehicles.sezioni.completa', '✅ Completa') : ' <span class="language-label" data-translation-key="vehicles.sezioni.parziale" data-italiano="⚡ Parziale">⚡ Parziale</span> (max ' + _sezMmToDisplay(lunghMm) + ' ' + u + ') — <span class="language-label" data-translation-key="vehicles.sezioni.consentito" data-italiano="consentito">consentito</span>');
}

var _counterSezioni = 0;
function _aggiungiRigaSezione(inizio, fine, carico, nome) {
    _counterSezioni++;
    var tbody = document.getElementById('pv-sezioni-tbody');
    if (!tbody) return;
    var emptyRow = tbody.querySelector('td[colspan]');
    if (emptyRow) emptyRow.closest('tr').remove();

    var row = document.createElement('tr');
    row.className = 'pv-sezione-row';
    row.innerHTML =
        '<td><input type="text" class="form-input form-input-sm pv-sez-nome" value="' + escapeHtml(nome || '') + '" placeholder="Zona ' + _counterSezioni + '"></td>' +
        '<td><input type="number" class="form-input form-input-sm pv-sez-inizio" value="' + (inizio ? _sezMmToDisplay(inizio) : '0') + '" min="0" step="10" oninput="_aggiornaCoperturaSezioni()"></td>' +
        '<td><input type="number" class="form-input form-input-sm pv-sez-fine" value="' + (fine ? _sezMmToDisplay(fine) : '') + '" min="0.1" step="10" oninput="_aggiornaCoperturaSezioni()"></td>' +
        '<td><input type="number" class="form-input form-input-sm pv-sez-carico" value="' + (carico || '') + '" min="0.01" step="100"></td>' +
        '<td class="pv-sez-info">—</td>' +
        '<td><button type="button" class="btn-item-action pv-sez-remove" data-translation-key="vehicles.sezioni.rimuovi" data-italiano="Rimuovi" title="Rimuovi">✕</button></td>';
    tbody.appendChild(row);
    _aggiornaCoperturaSezioni();
}
