/**
 * Workspace Carico 3D — Modali Module
 *
 * Modali per creazione mezzi, oggetti, vincoli, piani.
 * Funzioni di aggiornamento select.
 *
 * Depends on: workspace_core.js
 */

// =============================================================================
// MODAL: Nuovo Mezzo
// =============================================================================

function apriModaleNuovoMezzo() {
    var bodyHtml =
        '<div class="field-group">' +
            '<label class="field-label">Nome / Modello</label>' +
            '<input type="text" class="form-input" id="modal-mezzo-nome" placeholder="Es. Camion Bilico 13.6m">' +
        '</div>' +
        '<div class="field-group">' +
            '<label class="field-label">Tipo Mezzo</label>' +
            '<select class="form-select" id="modal-mezzo-tipo">' +
                '<option value="" disabled selected></option>' +
                '<option value="bilico">Autoarticolato (Bilico)</option>' +
                '<option value="autocarro">Autocarro</option>' +
                '<option value="autotreno">Autotreno</option>' +
                '<option value="furgone">Furgone</option>' +
                '<option value="container_20">Container ISO 20\'</option>' +
                '<option value="container_40">Container ISO 40\'</option>' +
                '<option value="container_40_hc">Container ISO 40\' High Cube</option>' +
                '<option value="nave">Nave</option>' +
                '<option value="treno">Treno</option>' +
                '<option value="altro">Altro</option>' +
            '</select>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-group flex-grow"><label class="field-label">Lunghezza (cm)</label><input type="number" class="form-input" id="modal-mezzo-lungh" placeholder="1360" step="0.1" min="1"></div>' +
            '<div class="field-group flex-grow"><label class="field-label">Larghezza (cm)</label><input type="number" class="form-input" id="modal-mezzo-larg" placeholder="248" step="0.1" min="1"></div>' +
            '<div class="field-group flex-grow"><label class="field-label">Altezza (cm)</label><input type="number" class="form-input" id="modal-mezzo-alt" placeholder="270" step="0.1" min="1"></div>' +
        '</div>' +
        '<div class="field-group">' +
            '<label class="field-label">Portata Massima (kg)</label>' +
            '<input type="number" class="form-input" id="modal-mezzo-peso" placeholder="24000" step="0.1" min="1">' +
        '</div>' +
        '<div class="field-group">' +
            '<label class="field-label">Note (opzionali)</label>' +
            '<input type="text" class="form-input" id="modal-mezzo-note" placeholder="Es. Portellone posteriore">' +
        '</div>';

    apriModale('Nuovo Mezzo / Contenitore', bodyHtml, async function () {
        var nome = document.getElementById('modal-mezzo-nome').value.trim();
        var tipo = document.getElementById('modal-mezzo-tipo').value;
        var lungh = parseFloat(document.getElementById('modal-mezzo-lungh').value);
        var larg = parseFloat(document.getElementById('modal-mezzo-larg').value);
        var alt = parseFloat(document.getElementById('modal-mezzo-alt').value);
        var peso = parseFloat(document.getElementById('modal-mezzo-peso').value);
        var note = document.getElementById('modal-mezzo-note').value.trim();

        if (!nome || !lungh || !larg || !alt || !peso) {
            showToast('Compila tutti i campi obbligatori.', 'warning');
            return;
        }

        var lunghMm = Math.round(lungh * 10);
        var largMm = Math.round(larg * 10);
        var altMm = Math.round(alt * 10);

        try {
            setStatus('busy', 'Creazione mezzo...');
            var resp = await fetch('/api/contenitori/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify({ nome: nome, tipo_mezzo: tipo, lunghezza_cm: lungh, larghezza_cm: larg, altezza_cm: alt, carico_massimo_kg: peso, note: note }),
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var data = await resp.json();

            var nuovo = {
                id: data.id, nome: data.nome, tipo: data.tipo_mezzo, tipo_display: '',
                lunghezza_mm: lunghMm, larghezza_mm: largMm, altezza_mm: altMm,
                carico_massimo_kg: data.carico_massimo_kg, note: note, archiviato: false,
            };
            WS.contenitori.push(nuovo);
            aggiornaSelectMezzi();
            showToast('✅ Mezzo "' + nome + '" creato!', 'success');
            setStatus('idle', 'Mezzo creato');
            selezionaMezzo(data.id);
            chiudiModale();
        } catch (err) {
            showToast('❌ Errore: ' + err.message, 'error');
            setStatus('error', 'Errore');
        }
    });
}

function aggiornaSelectMezzi() {
    var opts = WS.contenitori.filter(function (c) { return !c.archiviato; }).map(function (c) {
        return '<option value="' + c.id + '">' + escapeHtml(c.nome) + '</option>';
    }).join('');
    DOM.headerVehicleSelect.innerHTML = '<option value="" class="language-label" data-translation-key="panel.seleziona-mezzo" data-italiano="— Seleziona mezzo —">— Seleziona mezzo —</option>' + opts;
    if (typeof window.CARICO3D_LANGUAGE === 'string') {
        var placeholder = DOM.headerVehicleSelect.querySelector('[data-translation-key="panel.seleziona-mezzo"]');
        if (placeholder && window.DIZIONARIO && window.DIZIONARIO[window.CARICO3D_LANGUAGE]) {
            placeholder.textContent = window.DIZIONARIO[window.CARICO3D_LANGUAGE]['panel.seleziona-mezzo'] || placeholder.dataset.italiano;
        }
    }
}

// =============================================================================
// MODAL: Nuovo Oggetto (Anagrafica)
// =============================================================================

function apriModaleNuovoOggetto() {
    var bodyHtml =
        '<div class="field-row">' +
            '<div class="field-group" style="flex:0 0 130px;"><label class="field-label">Codice</label><input type="text" class="form-input" id="modal-ogg-codice" placeholder="CART-102"></div>' +
            '<div class="field-group flex-grow"><label class="field-label">Descrizione</label><input type="text" class="form-input" id="modal-ogg-desc" placeholder="Scatole cartone medie"></div>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-group flex-grow"><label class="field-label">Lunghezza (cm)</label><input type="number" class="form-input" id="modal-ogg-lungh" placeholder="40" step="0.1" min="0.1"></div>' +
            '<div class="field-group flex-grow"><label class="field-label">Larghezza (cm)</label><input type="number" class="form-input" id="modal-ogg-larg" placeholder="30" step="0.1" min="0.1"></div>' +
            '<div class="field-group flex-grow"><label class="field-label">Altezza (cm)</label><input type="number" class="form-input" id="modal-ogg-alt" placeholder="25" step="0.1" min="0.1"></div>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-group flex-grow"><label class="field-label">Peso (kg)</label><input type="number" class="form-input" id="modal-ogg-peso" placeholder="12.5" step="0.01" min="0.01"></div>' +
            '<div class="field-group flex-grow"><label class="field-label">Q.tà Disponibile</label><input type="number" class="form-input" id="modal-ogg-qty" placeholder="1" min="1" step="1"></div>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-group" style="flex:0 0 70px;">' +
                '<label class="field-label">Colore</label>' +
                '<input type="color" class="form-input" id="modal-ogg-colore" value="#1f4c7a" style="height:36px;padding:2px 4px;cursor:pointer;" disabled>' +
            '</div>' +
            '<div class="field-group flex-grow" style="justify-content:flex-end;">' +
                '<label class="checkbox-label" style="margin-top:18px;">' +
                    '<input type="checkbox" id="modal-ogg-colore-enable"> 🎨 Colore personalizzato' +
                '</label>' +
            '</div>' +
        '</div>';

    apriModale('Nuovo Oggetto', bodyHtml, async function () {
        var codice = document.getElementById('modal-ogg-codice').value.trim();
        var desc = document.getElementById('modal-ogg-desc').value.trim();
        var lungh = parseFloat(document.getElementById('modal-ogg-lungh').value);
        var larg = parseFloat(document.getElementById('modal-ogg-larg').value);
        var alt = parseFloat(document.getElementById('modal-ogg-alt').value);
        var peso = parseFloat(document.getElementById('modal-ogg-peso').value);
        var qty = parseInt(document.getElementById('modal-ogg-qty').value) || 1;
        var colorePersonalizzato = document.getElementById('modal-ogg-colore-enable').checked;
        var colore = colorePersonalizzato ? document.getElementById('modal-ogg-colore').value.trim() : '';

        if (!codice || !lungh || !larg || !alt || !peso) {
            showToast('Compila tutti i campi obbligatori.', 'warning');
            return;
        }

        try {
            setStatus('busy', 'Creazione oggetto...');
            var resp = await fetch('/api/oggetti/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify({ codice: codice, descrizione: desc, lunghezza_cm: lungh, larghezza_cm: larg, altezza_cm: alt, peso_kg: peso, quantita_disponibile: qty, colore: colore }),
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var data = await resp.json();

            var nuovo = {
                id: data.id, codice: data.codice, descrizione: data.descrizione,
                lunghezza_mm: data.lunghezza_mm, larghezza_mm: data.larghezza_mm,
                altezza_mm: data.altezza_mm, peso_kg: data.peso_kg, quantita: data.quantita_disponibile,
                colore: data.colore || '',
            };
            WS.oggettiDisponibili.push(nuovo);
            // Sincronizza anche il catalogo
            if (WS.oggettiCatalog) {
                WS.oggettiCatalog.push({ id: nuovo.id, codice: nuovo.codice, descrizione: nuovo.descrizione, lunghezza_mm: nuovo.lunghezza_mm, larghezza_mm: nuovo.larghezza_mm, altezza_mm: nuovo.altezza_mm, peso_kg: nuovo.peso_kg, quantita: nuovo.quantita, colore: nuovo.colore || '' });
            }
            aggiornaSelectOggetti();
            showToast('✅ Oggetto "' + codice + '" creato!', 'success');
            setStatus('idle', 'Oggetto creato');
            chiudiModale();
        } catch (err) {
            showToast('❌ Errore: ' + err.message, 'error');
            setStatus('error', 'Errore');
        }
    });

    // Attiva il toggle colore (dopo che innerHTML è stato impostato)
    setTimeout(function () {
        var toggle = document.getElementById('modal-ogg-colore-enable');
        var picker = document.getElementById('modal-ogg-colore');
        if (toggle && picker) {
            toggle.addEventListener('change', function () {
                picker.disabled = !this.checked;
                if (!this.checked) picker.value = '#447e9b';
            });
        }
    }, 50);
}

function aggiornaSelectOggetti() {
    var catalog = (WS.oggettiCatalog && WS.oggettiCatalog.length > 0) ? WS.oggettiCatalog : WS.oggettiDisponibili;
    var opts = catalog.map(function (o) {
        return '<option value="' + o.id + '">' + escapeHtml(o.codice) + '</option>';
    }).join('');
    DOM.panelSelectOggetto.innerHTML = '<option value="">— Aggiungi oggetto —</option>' + opts;
}

// =============================================================================
// MODAL: Vincoli
// =============================================================================

function apriModaleVincoli() {
    var catalog = (WS.oggettiCatalog && WS.oggettiCatalog.length > 0) ? WS.oggettiCatalog : WS.oggettiDisponibili;
    var oggettiOpts = catalog.map(function (o) {
        return '<option value="' + o.id + '">' + escapeHtml(o.codice) + ' — ' + escapeHtml((o.descrizione || '').substring(0, 30)) + '</option>';
    }).join('');

    var bodyHtml =
        '<div class="field-group">' +
            '<label class="field-label">Oggetto</label>' +
            '<select class="form-select" id="vinc-oggetto-select"><option value="">— Seleziona —</option>' + oggettiOpts + '</select>' +
        '</div>' +
        '<div class="field-group">' +
            '<label class="field-label">Orientamento</label>' +
            '<label class="checkbox-label"><input type="checkbox" id="vinc-rot-x" checked> Rotazione su X</label>' +
            '<label class="checkbox-label"><input type="checkbox" id="vinc-rot-y" checked> Rotazione su Y</label>' +
            '<label class="checkbox-label"><input type="checkbox" id="vinc-rot-z" checked> Rotazione su Z</label>' +
            '<label class="checkbox-label"><input type="checkbox" id="vinc-non-capovolgere"> Non capovolgere</label>' +
        '</div>' +
        '<div class="field-group">' +
            '<label class="field-label">Impilabilità</label>' +
            '<label class="checkbox-label"><input type="checkbox" id="vinc-sovrapp" checked> Può sostenere altri oggetti</label>' +
            '<label class="field-label" style="margin-top:8px;">Peso max sul tetto (kg)</label>' +
            '<input type="number" class="form-input" id="vinc-peso-max" value="0" min="0" step="0.5">' +
        '</div>' +
        '<div class="field-group">' +
            '<label class="checkbox-label"><input type="checkbox" id="vinc-solo-piano"> Solo su pavimento</label>' +
            '<label class="checkbox-label"><input type="checkbox" id="vinc-fragile"> Oggetto fragile</label>' +
        '</div>';

    apriModale('Vincoli e Regole', bodyHtml, async function () {
        var oggettoId = parseInt(document.getElementById('vinc-oggetto-select').value);
        if (!oggettoId) { showToast('Seleziona un oggetto.', 'warning'); return; }

        var payload = {
            rotazione_consentita: !document.getElementById('vinc-non-capovolgere').checked,
            rotazione_su_x: document.getElementById('vinc-rot-x').checked,
            rotazione_su_y: document.getElementById('vinc-rot-y').checked,
            rotazione_su_z: document.getElementById('vinc-rot-z').checked,
            sovrapponibile: document.getElementById('vinc-sovrapp').checked,
            peso_massimo_tetto_kg: parseFloat(document.getElementById('vinc-peso-max').value) || 0,
            solo_su_piano: document.getElementById('vinc-solo-piano').checked,
            fragile: document.getElementById('vinc-fragile').checked,
        };

        try {
            setStatus('busy', 'Salvataggio vincoli...');
            var resp = await fetch('/api/oggetti/' + oggettoId + '/vincoli/', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify(payload),
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            // Aggiorna cache locale
            var idx = WS.vincoli.findIndex(function (x) { return x.oggetto_id === oggettoId; });
            var entry = Object.assign({ oggetto_id: oggettoId }, payload);
            if (idx >= 0) WS.vincoli[idx] = entry; else WS.vincoli.push(entry);
            showToast('✅ Vincoli salvati!', 'success');
            setStatus('idle', 'Vincoli salvati');
            chiudiModale();
        } catch (err) {
            showToast('❌ Errore: ' + err.message, 'error');
            setStatus('error', 'Errore');
        }
    });

    // Carica vincoli quando si seleziona un oggetto
    setTimeout(function () {
        var sel = document.getElementById('vinc-oggetto-select');
        if (sel) {
            sel.addEventListener('change', async function () {
                var oid = parseInt(this.value);
                if (!oid) return;
                var v = WS.vincoli.find(function (x) { return x.oggetto_id == oid; });
                if (!v) {
                    try {
                        var r = await fetch('/api/oggetti/' + oid + '/vincoli/');
                        if (r.ok) v = await r.json();
                    } catch (e) { return; }
                }
                if (!v) return;
                document.getElementById('vinc-rot-x').checked = v.rotazione_su_x !== false;
                document.getElementById('vinc-rot-y').checked = v.rotazione_su_y !== false;
                document.getElementById('vinc-rot-z').checked = v.rotazione_su_z !== false;
                document.getElementById('vinc-non-capovolgere').checked = v.rotazione_consentita === false;
                document.getElementById('vinc-sovrapp').checked = v.sovrapponibile !== false;
                document.getElementById('vinc-peso-max').value = v.peso_massimo_tetto_kg || 0;
                document.getElementById('vinc-solo-piano').checked = v.solo_su_piano === true;
                document.getElementById('vinc-fragile').checked = v.fragile === true;
            });
        }
    }, 100);
}

// =============================================================================
// MODAL: Piani Recenti
// =============================================================================

function apriModalePiani() {
    var cardsHtml = WS.piani.length === 0
        ? '<p style="text-align:center;color:#999;padding:20px;">Nessun piano salvato.</p>'
        : WS.piani.slice(0, 20).map(function (p) {
            return '<div class="panel-item" data-piano-id="' + p.id + '" style="margin-bottom:4px;">' +
                '<div class="panel-item-info">' +
                    '<strong>' + escapeHtml(p.nome) + '</strong>' +
                '</div>' +
            '</div>';
        }).join('');

    apriModale('Piani Recenti',
        '<div style="max-height:400px;overflow-y:auto;">' + cardsHtml + '</div>',
        function () { chiudiModale(); }
    );

    // Click su piano = carica
    setTimeout(function () {
        var cards = document.querySelectorAll('#modal-body .panel-item[data-piano-id]');
        cards.forEach(function (card) {
            card.addEventListener('click', async function () {
                var pid = parseInt(card.dataset.pianoId);
                WS.activePianoId = pid;
                if (typeof WS !== 'undefined') WS._autoPreviewPosizioni = null;
                if (DOM.headerExportBtn) DOM.headerExportBtn.disabled = false;
                // Invalida i dati del grafico in modo che vengano scaricati per il piano appena caricato
                _ultimaDistribuzionePesi = null;
                _distribuzionePesiPianoId = null;
                if (window.distribuzionePesoChart) {
                    window.distribuzionePesoChart.destroy();
                    window.distribuzionePesoChart = null;
                }
                // Pulisce anche il contenuto della lista sezioni-pesi per evitare dati visivi obsoleti
                var listPesi = document.getElementById('sezioni-pesi-list');
                if (listPesi) listPesi.innerHTML = '';
                var piano = WS.piani.find(function (p) { return p.id == pid; });
                if (piano) {
                    // true = non invalidare il piano attivo, stiamo caricando un piano salvato
                    selezionaMezzo(WS.contenitori.find(function (c) { return c.nome === piano.container; })?.id || null, true);
                }
                await caricaScena3D(pid);
                // Se il pannello distribuzione pesi è già aperto, aggiornalo con i dati del piano caricato
                var panel = document.getElementById('sezioni-pesi-panel');
                if (panel && panel.style.display === 'block') {
                    await caricaEDisegnaDistribuzionePesi();
                }
                showToast('Piano #' + pid + ' caricato.', 'info');
                setActiveView('carico');
                chiudiModale();
            });
        });
    }, 100);
}

// =============================================================================
// IMPOSTAZIONI OTTIMIZZATORE CARICHI
// =============================================================================

// Valori di default per le impostazioni dell'ottimizzatore
// Versione impostazioni: incrementa quando i default cambiano
// per forzare l'aggiornamento della cache localStorage
var IMPOSTAZIONI_VERSION = 8;

