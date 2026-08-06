/**
 * Gestione Sezioni di Carico (Assi) nel form Mezzi di Trasporto.
 *
 * Funzioni per renderizzare, raccogliere, salvare e validare
 * le zone di carico configurabili dall'utente in 🚛 Mezzi di Trasporto.
 *
 * Dipendenze: workspace.js (WS, DOM, getCSRFToken, showToast, escapeHtml, formatCm)
 */

// --- Inizializzazione event delegation (chiamata una sola volta) ---
var _sezioniDelegationReady = false;

function _initSezioniDelegation() {
    if (_sezioniDelegationReady) return;
    _sezioniDelegationReady = true;
    // Usa event delegation sul body per catturare click sui pulsanti ✕
    // delle sezioni, indipendentemente da come vengono create (innerHTML o DOM).
    document.body.addEventListener('click', function (e) {
        // Pulsante ✕ elimina riga sezione
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
        // Pulsante + Aggiungi nuova sezione
        if (e.target.closest('#pv-sez-add')) {
            e.stopPropagation();
            _aggiungiRigaSezione();
        }
    });
}

// Chiama subito all'avvio
_initSezioniDelegation();

// --- Sezioni di Carico (assi) nel form Mezzi ---

function _renderSezioniTable(sezioni, lunghezzaMm) {
    sezioni = sezioni || [];
    var righe = '';
    sezioni.forEach(function (s, i) {
        righe +=
            '<tr class="pv-sezione-row">' +
                '<td><input type="text" class="form-input form-input-sm pv-sez-nome" value="' + escapeHtml(s.nome || '') + '" placeholder="Zona ' + (i + 1) + '"></td>' +
                '<td><input type="number" class="form-input form-input-sm pv-sez-inizio" value="' + (s.inizio_x_mm || 0) + '" min="0" step="100"></td>' +
                '<td><input type="number" class="form-input form-input-sm pv-sez-fine" value="' + (s.fine_x_mm || '') + '" min="1" step="100"></td>' +
                '<td><input type="number" class="form-input form-input-sm pv-sez-carico" value="' + parseFloat(s.carico_massimo_kg || 0) + '" min="0.01" step="100"></td>' +
                '<td class="pv-sez-info">' + (s.baricentro_x_mm ? 'CG @ ' + s.baricentro_x_mm + ' mm' : '—') + '</td>' +
                '<td><button type="button" class="btn-item-action pv-sez-remove" title="Rimuovi">✕</button></td>' +
            '</tr>';
    });

    var coperturaHtml = '';
    if (lunghezzaMm && sezioni.length > 0) {
        var primo = sezioni[0];
        var ultimo = sezioni[sezioni.length - 1];
        var coperturaTotale = primo.inizio_x_mm === 0 && ultimo.fine_x_mm === lunghezzaMm;
        coperturaHtml =
            '<div class="pv-sez-copertura" style="color:' + (coperturaTotale ? '#27ae60' : '#f39c12') + ';">' +
                'Copertura: ' + (primo.inizio_x_mm || 0) + ' → ' + (ultimo.fine_x_mm || 0) + ' mm ' +
                (coperturaTotale ? '✅ Completa' : '⚡ Parziale (max ' + lunghezzaMm + ' mm) — consentito') +
            '</div>';
    }

    return '' +
        '<div class="pv-sezioni-section">' +
            '<div class="pv-sezioni-header">' +
                '<strong>🔧 Sezioni di Carico (Assi)</strong>' +
                '<button class="btn btn-sm" id="pv-sez-add" type="button">+ Aggiungi</button>' +
            '</div>' +
            '<table class="pv-sezioni-table">' +
                '<thead><tr>' +
                    '<th>Nome</th><th>Inizio (mm)</th><th>Fine (mm)</th><th>Carico max (kg)</th><th>Baricentro</th><th></th>' +
                '</tr></thead>' +
                '<tbody id="pv-sezioni-tbody">' + (righe || '<tr><td colspan="6" style="color:#999;text-align:center;padding:12px;">Nessuna sezione configurata. Clicca "+ Aggiungi".</td></tr>') + '</tbody>' +
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
        var inizio = parseInt(row.querySelector('.pv-sez-inizio').value) || 0;
        var fine = parseInt(row.querySelector('.pv-sez-fine').value) || 0;
        var carico = parseFloat(row.querySelector('.pv-sez-carico').value) || 0;
        if (!nome) { avvisi.push('Riga ' + (i+1) + ': nome mancante'); return; }
        if (fine <= inizio) { avvisi.push('Riga ' + (i+1) + ': fine deve essere > inizio'); return; }
        if (carico <= 0) { avvisi.push('Riga ' + (i+1) + ': carico max mancante'); return; }
        sezioni.push({ nome: nome, inizio_x_mm: inizio, fine_x_mm: fine, carico_massimo_kg: carico });
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
    var sezioni = [];
    rows.forEach(function (row) {
        var inizio = parseInt(row.querySelector('.pv-sez-inizio').value) || 0;
        var fine = parseInt(row.querySelector('.pv-sez-fine').value) || 0;
        if (fine > inizio) sezioni.push({ inizio_x_mm: inizio, fine_x_mm: fine });
    });
    if (sezioni.length === 0) { el.innerHTML = ''; return; }
    sezioni.sort(function (a, b) { return a.inizio_x_mm - b.inizio_x_mm; });
    var primo = sezioni[0];
    var ultimo = sezioni[sezioni.length - 1];
    var lunghCm = parseFloat(document.getElementById('pv-mezzo-lungh') && document.getElementById('pv-mezzo-lungh').value) || 0;
    var lunghMm = Math.round(lunghCm * 10);
    var coperturaTotale = primo.inizio_x_mm === 0 && ultimo.fine_x_mm === lunghMm;
    el.style.color = coperturaTotale ? '#27ae60' : '#f39c12';
    el.innerHTML = 'Copertura: ' + primo.inizio_x_mm + ' → ' + ultimo.fine_x_mm + ' mm ' +
        (coperturaTotale ? '✅ Completa' : '⚡ Parziale (max ' + lunghMm + ' mm) — consentito');
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
        '<td><input type="number" class="form-input form-input-sm pv-sez-inizio" value="' + (inizio || 0) + '" min="0" step="100" oninput="_aggiornaCoperturaSezioni()"></td>' +
        '<td><input type="number" class="form-input form-input-sm pv-sez-fine" value="' + (fine || '') + '" min="1" step="100" oninput="_aggiornaCoperturaSezioni()"></td>' +
        '<td><input type="number" class="form-input form-input-sm pv-sez-carico" value="' + (carico || '') + '" min="0.01" step="100"></td>' +
        '<td class="pv-sez-info">—</td>' +
        '<td><button type="button" class="btn-item-action pv-sez-remove" title="Rimuovi">✕</button></td>';
    tbody.appendChild(row);
    _aggiornaCoperturaSezioni();
}
