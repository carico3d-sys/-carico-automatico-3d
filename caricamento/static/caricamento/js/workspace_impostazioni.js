/**
 * Workspace Carico 3D — Impostazioni Module
 *
 * Gestione impostazioni ottimizzatore (strategia, performance, output).
 *
 * Depends on: workspace_core.js
 */

function getImpostazioniDefault() {
    return {
        strategia_ottimizzazione: {
            algoritmo_base: 'Algoritmo 3D Semplificato',
            distribuzione_pesi_attiva: true,
            ordinamento_casuale: false
        },
        output_ottimizzazione: {
            azzera_grafico_pesi_nei_vuoti: false,
            mostra_etichette_oggetti: true,
            mostra_etichetta_contenitore: true,
            modalita_rotazione: 'baricentrica'
        }
    };
}

// Stato impostazioni
var IMPOSTAZIONI = getImpostazioniDefault();

// Elenco sezioni per la navigazione laterale
var SEZIONI_IMPOSTAZIONI = [
    { id: 'strategia', icon: '<i class="bi bi-bullseye"></i>', label: 'Strategia di Ottimizzazione' },
    { id: 'output', icon: '<i class="bi bi-bar-chart"></i>', label: 'Output' },
    { id: 'manuale', icon: '<i class="bi bi-hand-index-thumb"></i>', label: 'Parametri Modalità Manuale' },
];

// Carica impostazioni dal backend o localStorage
function caricaImpostazioni() {
    try {
        var salvate = localStorage.getItem('carico3d_impostazioni');
        var versioneSalvata = localStorage.getItem('carico3d_impostazioni_version');

        // Se la versione è cambiata, ignora la cache e usa i nuovi default
        if (versioneSalvata != IMPOSTAZIONI_VERSION) {
            IMPOSTAZIONI = getImpostazioniDefault();
            localStorage.setItem('carico3d_impostazioni', JSON.stringify(IMPOSTAZIONI));
            localStorage.setItem('carico3d_impostazioni_version', IMPOSTAZIONI_VERSION);
            return;
        }

        if (salvate) {
            var parsed = JSON.parse(salvate);
            // Merge con i default per assicurarsi tutti i campi esistano
            var defaults = getImpostazioniDefault();
            Object.keys(defaults).forEach(function (sezione) {
                if (!parsed[sezione] || parsed[sezione] === null) {
                    parsed[sezione] = JSON.parse(JSON.stringify(defaults[sezione]));
                } else {
                    Object.keys(defaults[sezione]).forEach(function (campo) {
                        if (parsed[sezione][campo] === undefined || parsed[sezione][campo] === null) {
                            parsed[sezione][campo] = defaults[sezione][campo];
                        }
                    });
                }
            });
            IMPOSTAZIONI = parsed;
        }
    } catch (e) {
        console.warn('Errore caricamento impostazioni:', e);
        IMPOSTAZIONI = getImpostazioniDefault();
    }
}

// Salva impostazioni (localStorage + API)
async function salvaImpostazioni() {
    setStatus('busy', 'Salvataggio impostazioni...');
    try {
        // Salva in locale
        localStorage.setItem('carico3d_impostazioni', JSON.stringify(IMPOSTAZIONI));
        localStorage.setItem('carico3d_impostazioni_version', IMPOSTAZIONI_VERSION);

        // Salva su server (API endpoint per impostazioni dell'ottimizzatore)
        try {
            var resp = await fetch('/api/impostazioni_ottimizzatore/', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify(IMPOSTAZIONI)
            });
            if (!resp.ok) {
                console.warn('Salvataggio server fallito (HTTP ' + resp.status + '). Solo locale.');
            }
        } catch (e) {
            console.warn('Salvataggio server non disponibile. Salvato solo localmente.');
        }

        showToast('✅ Impostazioni salvate con successo!', 'success');
        setStatus('idle', 'Impostazioni salvate');
    } catch (err) {
        showToast('❌ Errore salvataggio impostazioni: ' + err.message, 'error');
        setStatus('error', 'Errore salvataggio');
    }
}

// Ripristina valori di default
function ripristinaImpostazioniDefault() {
    if (!confirm('Ripristinare tutte le impostazioni ai valori predefiniti?')) return;
    IMPOSTAZIONI = getImpostazioniDefault();
    localStorage.setItem('carico3d_impostazioni', JSON.stringify(IMPOSTAZIONI));
    localStorage.setItem('carico3d_impostazioni_version', IMPOSTAZIONI_VERSION);
    renderImpostazioniForm(WS.impostazioniSezione);
    showToast('🔄 Impostazioni ripristinate ai valori predefiniti.', 'info');
    setStatus('idle', 'Default ripristinati');
}

// =============================================================================
// PANEL IMPOSTAZIONI
// =============================================================================

function renderImpostazioniPanel() {
    DOM.pvListTitle.innerHTML = '<i class="bi bi-gear"></i> Impostazioni';
    DOM.pvListCount.textContent = SEZIONI_IMPOSTAZIONI.length;

    // Lista sezioni a sinistra
    var listHtml = '';
    SEZIONI_IMPOSTAZIONI.forEach(function (s) {
        listHtml += '<div class="pv-list-item" data-sezione="' + s.id + '">' +
            '<div class="pv-list-item-info">' +
                '<strong>' + s.icon + ' ' + s.label + '</strong>' +
                '<span>' + getDescrizioneSezione(s.id) + '</span>' +
            '</div>' +
        '</div>';
    });
    DOM.pvListBody.innerHTML = listHtml;

    // Click su sezione = mostra form
    DOM.pvListBody.querySelectorAll('.pv-list-item').forEach(function (item) {
        item.addEventListener('click', function () {
            DOM.pvListBody.querySelectorAll('.pv-list-item').forEach(function (el) { el.classList.remove('selected'); });
            item.classList.add('selected');
            var sezione = item.dataset.sezione;
            WS.impostazioniSezione = sezione;
            renderImpostazioniForm(sezione);
        });
    });

    // Seleziona la prima sezione di default (o quella già attiva)
    var sezioneIniziale = WS.impostazioniSezione || SEZIONI_IMPOSTAZIONI[0].id;
    WS.impostazioniSezione = sezioneIniziale;
    var defaultItem = DOM.pvListBody.querySelector('[data-sezione="' + sezioneIniziale + '"]');
    if (defaultItem) defaultItem.classList.add('selected');
    renderImpostazioniForm(sezioneIniziale);
}

function getDescrizioneSezione(id) {
    var descrizioni = {
        strategia: 'Ordinamento, algoritmo, distribuzione pesi',
        output: 'Etichette, rotazione, grafico pesi',
        manuale: 'Strategia piazzamento, sporgenza massima',
    };
    return descrizioni[id] || '';
}

function renderImpostazioniForm(sezione) {
    if (!sezione) {
        DOM.pvFormTitle.innerHTML = '<i class="bi bi-gear"></i> Seleziona una sezione';
        DOM.pvFormBody.innerHTML = '<p style="color:#999;text-align:center;padding:40px;">Seleziona una sezione dalla lista a sinistra per configurare le impostazioni.</p>';
        return;
    }

    var sezioneData = SEZIONI_IMPOSTAZIONI.find(function (s) { return s.id === sezione; });
    DOM.pvFormTitle.innerHTML = sezioneData ? sezioneData.icon + ' ' + sezioneData.label : '<i class="bi bi-gear"></i> Impostazioni';

    // Barra azioni in cima al form
    var actionsBar =
        '<div class="settings-actions-bar">' +
            '<button class="btn btn-success" id="btn-save-impostazioni"><i class="bi bi-save"></i> Salva impostazioni</button>' +
            '<button class="btn btn-sm" id="btn-reset-impostazioni" style="color:#888;">↩️ Ripristina default</button>' +
        '</div>';

    var cardsHtml = '';

    if (sezione === 'strategia') {
        cardsHtml += renderCardStrategia();
    }
    if (sezione === 'output') {
        cardsHtml += renderCardOutput();
    }
    if (sezione === 'manuale') {
        cardsHtml += renderCardManuale();
    }

    DOM.pvFormBody.innerHTML = actionsBar + cardsHtml;

    // Aggancia event listener pulsanti
    document.getElementById('btn-save-impostazioni').addEventListener('click', salvaImpostazioni);
    document.getElementById('btn-reset-impostazioni').addEventListener('click', ripristinaImpostazioniDefault);

    // Aggancia event listener per i campi dinamici
    agganciaEventiImpostazioni(sezione);
}

// =============================================================================
// CARD: STRATEGIA DI OTTIMIZZAZIONE (Sezione 3)
// =============================================================================

function renderCardStrategia() {
    var s = IMPOSTAZIONI.strategia_ottimizzazione;


    return '<div class="settings-card">' +
        '<div class="settings-card-header">' +
            '<h4 class="settings-card-title">🎯 Strategia di Ottimizzazione</h4>' +
            '<p class="settings-card-desc">Configura come l\'algoritmo di 3D packing lavora per ottimizzare il carico.</p>' +
        '</div>' +
        '<div class="settings-card-body">' +
            '<div class="field-group" style="background:#f0f4f8;padding:12px;border-radius:var(--radius-sm);border:1px solid #d0d8e0;">' +
                '<label class="field-label">Algoritmo</label>' +
                '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">' +
                    '<div style="flex:1;">' +
                        '<p style="margin:4px 0 0;font-weight:600;color:#2c3e50;"><i class="bi bi-tools"></i> Algoritmo 3D Semplificato</p>' +
                        '<span class="field-hint" style="margin-top:2px;">Skyline + stacking + backtracking con distribuzione pesi automatica sulle sezioni.</span>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;padding-top:2px;">' +
                        '<label for="imp-ordinamento-casuale" style="font-size:12px;color:#666;white-space:nowrap;font-weight:500;cursor:pointer;">🎲 Casuale</label>' +
                        '<label style="position:relative;display:inline-block;width:42px;min-width:42px;height:24px;cursor:pointer;margin:0;">' +
                            '<input type="checkbox" id="imp-ordinamento-casuale" ' + (s.ordinamento_casuale ? 'checked' : '') + ' aria-label="Ordinamento casuale Monte Carlo" style="opacity:0;width:0;height:0;position:absolute;">' +
                            '<span class="toggle-bg" style="position:absolute;top:0;left:0;right:0;bottom:0;background:' + (s.ordinamento_casuale ? '#27AE60' : '#ccc') + ';border-radius:24px;transition:background 0.25s;"></span>' +
                            '<span class="toggle-dot" style="position:absolute;top:2px;left:' + (s.ordinamento_casuale ? '20px' : '2px') + ';width:20px;height:20px;background:#fff;border-radius:50%;transition:left 0.25s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>' +
                        '</label>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div class="field-group checkbox-group">' +
                '<label class="checkbox-label">' +
                    '<input type="checkbox" id="imp-distribuzione-pesi" ' + (s.distribuzione_pesi_attiva !== false ? 'checked' : '') + '> ' +
                    '<i class="bi bi-speedometer2"></i> Distribuzione pesi sulle sezioni' +
                '</label>' +
                '<span class="field-hint">Se attivo, l\'algoritmo rispetta i limiti di peso definiti per ogni sezione/asse del contenitore. Disattiva per ignorare i vincoli di peso sulle sezioni.</span>' +
            '</div>' +
        '</div>' +
    '</div>';
}

// =============================================================================
// CARD: OUTPUT DELL'OTTIMIZZAZIONE (Sezione 6)
// =============================================================================

function renderCardOutput() {
    var o = IMPOSTAZIONI.output_ottimizzazione;

    var checkboxFields = [
        { id: 'imp-etichette-ogg', campo: 'mostra_etichette_oggetti', label: 'Mostra etichette oggetti', desc: 'Visualizza il codice di ogni oggetto direttamente sulle facce nella vista 3D.' },
        { id: 'imp-etichetta-cont', campo: 'mostra_etichetta_contenitore', label: 'Mostra etichetta contenitore', desc: 'Visualizza il nome e le dimensioni del contenitore nella vista 3D.' },
        { id: 'imp-azzera-vuoti', campo: 'azzera_grafico_pesi_nei_vuoti', label: 'Azzera il grafico pesi nei vuoti', desc: 'Nel grafico distribuzione pesi per sezione, la linea scende a zero dove non ci sono sezioni cariche.' },
    ];

    var rotazioneAttuale = o.modalita_rotazione || 'baricentrica';

    var checkboxesHtml = checkboxFields.map(function (f) {
        var checked = o[f.campo] ? 'checked' : '';
        return '<div class="settings-checkbox-row">' +
            '<label class="checkbox-label"><input type="checkbox" id="' + f.id + '" ' + checked + '> ' + f.label + '</label>' +
        '</div>';
    }).join('');

    return '<div class="settings-card">' +
        '<div class="settings-card-header">' +
            '<h4 class="settings-card-title"><i class="bi bi-bar-chart"></i> Output dell\'Ottimizzazione</h4>' +
            '<p class="settings-card-desc">Configura cosa viene mostrato all\'utente dopo l\'ottimizzazione.</p>' +
        '</div>' +
        '<div class="settings-card-body">' +
            checkboxesHtml +
            '<div class="settings-separator"></div>' +
            '<div class="field-group">' +
                '<label class="field-label">🔄 Modalità Rotazione Manuale</label>' +
                '<div class="radio-group" id="imp-rotazione-modalita">' +
                    '<label class="radio-label"><input type="radio" name="rotazione-modalita" value="baricentrica" ' + (rotazioneAttuale === 'baricentrica' ? 'checked' : '') + '> Baricentrica (attuale)</label>' +
                    '<label class="radio-label"><input type="radio" name="rotazione-modalita" value="eccentrica" ' + (rotazioneAttuale === 'eccentrica' ? 'checked' : '') + '> Eccentrica (perno su lato corto)</label>' +
                '</div>' +
                '<span class="field-hint"><strong>Baricentrica:</strong> Shift+click ruota attorno al centro (sempre). <strong>Eccentrica:</strong> Shift+tasto sinistro = rotazione antioraria, Shift+tasto destro = rotazione oraria, con perno sullo spigolo del lato corto. La rotazione eccentrica si applica solo alle rotazioni orizzontali (LxPxH ↔ PxLxH); i ribaltamenti che coinvolgono l\'altezza usano sempre la modalità baricentrica.</span>' +
            '</div>' +

        '</div>' +
    '</div>';
}



// =============================================================================
// CARD: PARAMETRI MODALITÀ MANUALE
// =============================================================================

function renderCardManuale() {
    var strategia = (typeof _strategiaPiazzamento !== 'undefined') ? _strategiaPiazzamento : 'muro';
    var sporgenza = (typeof _massimaSporgenzaPct !== 'undefined') ? _massimaSporgenzaPct : 100;

    return '<div class="settings-card">' +
        '<div class="settings-card-header">' +
            '<h4 class="settings-card-title"><i class="bi bi-hand-index-thumb"></i> Parametri Modalità Manuale</h4>' +
            '<p class="settings-card-desc">Configura il comportamento del piazzamento manuale con il bottone "Aggiungi alla scena".</p>' +
        '</div>' +
        '<div class="settings-card-body">' +
            '<div class="field-group">' +
                '<label class="field-label">Strategia di Piazzamento</label>' +
                '<select class="form-select" id="manuale-strategia-piazzamento">' +
                    '<option value="colonne" ' + (strategia === 'colonne' ? 'selected' : '') + '>🏗️ Colonne immediate (X→Z→Y) — impila subito</option>' +
                    '<option value="muro" ' + (strategia === 'muro' ? 'selected' : '') + '>🧱 Muro completo (Z→Y→X) — riempi fetta</option>' +
                '</select>' +
                '<span class="field-hint"><strong>Colonne:</strong> per ogni X, riempi larghezza al pavimento poi impila. Stacking dopo 2-3 oggetti.<br><strong>Muro:</strong> riempi una fetta di larghezza completa (pavimento+stack), poi avanza in lunghezza.</span>' +
            '</div>' +
            '<div class="field-group" style="margin-top:14px;">' +
                '<label class="field-label">Sporgenza Massima: <strong id="manuale-sporgenza-valore">' + sporgenza + '%</strong></label>' +
                '<input type="range" id="manuale-sporgenza" class="form-range" min="0" max="100" value="' + sporgenza + '" step="5" style="width:100%; margin-top:4px;">' +
                '<div style="display:flex; justify-content:space-between; font-size:10px; color:#999;">' +
                    '<span>0% (nessuno sbalzo)</span>' +
                    '<span>50%</span>' +
                    '<span>100% (libero)</span>' +
                '</div>' +
                '<span class="field-hint">Percentuale massima di sbalzo consentita in X e Z. A 30%, un oggetto sopra deve avere almeno il 70% di supporto dal singolo oggetto sotto (no "ponte" tra due oggetti).</span>' +
            '</div>' +
        '</div>' +
    '</div>';
}


// =============================================================================
// AGGANCIA EVENTI IMPOSTAZIONI
// =============================================================================

function agganciaEventiImpostazioni(sezione) {
    if (sezione === 'strategia') {
        // Toggle ordinamento casuale (Monte Carlo)
        var toggleCasuale = document.getElementById('imp-ordinamento-casuale');
        if (toggleCasuale) {
            toggleCasuale.addEventListener('change', function () {
                IMPOSTAZIONI.strategia_ottimizzazione.ordinamento_casuale = this.checked;
                // Aggiorna colore toggle inline
                var bg = this.parentElement.querySelector('.toggle-bg');
                var dot = this.parentElement.querySelector('.toggle-dot');
                if (bg) bg.style.background = this.checked ? '#27AE60' : '#ccc';
                if (dot) dot.style.left = this.checked ? '20px' : '2px';
            });
        }

        // Toggle distribuzione pesi
        var distPesi = document.getElementById('imp-distribuzione-pesi');
        if (distPesi) distPesi.addEventListener('change', function () { IMPOSTAZIONI.strategia_ottimizzazione.distribuzione_pesi_attiva = this.checked; });
    }

    if (sezione === 'manuale') {
        // Select strategia piazzamento
        var selStrategia = document.getElementById('manuale-strategia-piazzamento');
        if (selStrategia && !selStrategia._listenerAttached) {
            selStrategia._listenerAttached = true;
            selStrategia.addEventListener('change', function () {
                if (typeof _strategiaPiazzamento !== 'undefined') {
                    _strategiaPiazzamento = this.value;
                }
            });
        }

        // Slider sporgenza massima
        var sliderSporgenza = document.getElementById('manuale-sporgenza');
        var lblSporgenza = document.getElementById('manuale-sporgenza-valore');
        if (sliderSporgenza && !sliderSporgenza._listenerAttached) {
            sliderSporgenza._listenerAttached = true;
            sliderSporgenza.addEventListener('input', function () {
                if (typeof _massimaSporgenzaPct !== 'undefined') {
                    _massimaSporgenzaPct = parseInt(this.value) || 100;
                }
                if (lblSporgenza) lblSporgenza.textContent = _massimaSporgenzaPct + '%';
            });
        }
    }

    if (sezione === 'output') {
        // Checkbox output
        var etichetteOgg = document.getElementById('imp-etichette-ogg');
        if (etichetteOgg) etichetteOgg.addEventListener('change', function () {
            IMPOSTAZIONI.output_ottimizzazione.mostra_etichette_oggetti = this.checked;
            if (typeof impostaVisibilitaEtichetteOggetti === 'function') {
                impostaVisibilitaEtichetteOggetti(this.checked);
            }
        });

        var etichettaCont = document.getElementById('imp-etichetta-cont');
        if (etichettaCont) etichettaCont.addEventListener('change', function () {
            IMPOSTAZIONI.output_ottimizzazione.mostra_etichetta_contenitore = this.checked;
            if (typeof impostaVisibilitaEtichettaContenitore === 'function') {
                impostaVisibilitaEtichettaContenitore(this.checked);
            }
        });

        var azzeraVuoti = document.getElementById('imp-azzera-vuoti');
        if (azzeraVuoti) azzeraVuoti.addEventListener('change', function () {
            IMPOSTAZIONI.output_ottimizzazione.azzera_grafico_pesi_nei_vuoti = this.checked;
            _aggiornaGraficoPesiSeVisibile();
        });

        // Radio modalità rotazione manuale
        var rotRadios = document.querySelectorAll('input[name="rotazione-modalita"]');
        rotRadios.forEach(function (r) {
            r.addEventListener('change', function () {
                if (this.checked) IMPOSTAZIONI.output_ottimizzazione.modalita_rotazione = this.value;
            });
        });
    }
}

// =============================================================================
// INIT
// =============================================================================

