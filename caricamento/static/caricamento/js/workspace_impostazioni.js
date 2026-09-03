/**
 * Workspace Carico 3D — Impostazioni Module
 *
 * Gestione impostazioni ottimizzatore (strategia, performance, output).
 *
 * Depends on: workspace_core.js
 */

/** Helper: lookup traduzione per le impostazioni. */
function _tImp(key, fallback) {
    var lingua = (window.CARICO3D_LANGUAGE === 'en') ? 'en' : 'it';
    var d = window.DIZIONARIO && window.DIZIONARIO[lingua];
    return (d && d[key]) || fallback || key;
}

function getImpostazioniDefault() {
    return {
        strategia_ottimizzazione: {
            algoritmo_base: 'Algoritmo 3D Semplificato',
            distribuzione_pesi_attiva: false,
            ordinamento_casuale: false,
            compattazione_aggressiva: false,
            backtracking_avanzato: false
        },
        output_ottimizzazione: {
            mostra_griglia: false,
            azzera_grafico_pesi_nei_vuoti: false,
            mostra_etichette_oggetti: true,
            mostra_etichetta_contenitore: true,
            modalita_rotazione: 'baricentrica'
        },
        manuale: {
            strategia_piazzamento: 'muro',
            massima_sporgenza_pct: 100,
            snap_step_cm: 10,
        },
        panel_widths: {}
    };
}

// Stato impostazioni
var IMPOSTAZIONI = getImpostazioniDefault();
var _impostazioniDirty = false;
var _strategiaSaveTimer = null;

function _stageStrategiaCorrente() {
    var strategia = IMPOSTAZIONI.strategia_ottimizzazione || {};
    var mc = strategia.ordinamento_casuale === true;
    var v3 = strategia.backtracking_avanzato === true;
    if (v3 && mc) return 3;
    if (v3) return 2;
    if (mc) return 1;
    return 0;
}

function _aggiornaIndicatoreStrategia() {
    var slider = document.getElementById('strategia-slider');
    if (!slider) return;
    var stage = _stageStrategiaCorrente();
    var labels = ['Algoritmo 3D', 'Algoritmo 3D + MC', 'Algoritmo 3D + V3', 'Algoritmo 3D + V3 + MC'];
    slider.value = String(stage);
    slider.setAttribute('aria-valuenow', String(stage + 1));
    slider.setAttribute('aria-valuetext', labels[stage]);
    slider.classList.remove('strategia-stage-0', 'strategia-stage-1', 'strategia-stage-2', 'strategia-stage-3');
    slider.classList.add('strategia-stage-' + stage);
}

function _sincronizzaFormStrategia() {
    var strategia = IMPOSTAZIONI.strategia_ottimizzazione || {};
    var casuale = document.getElementById('imp-ordinamento-casuale');
    var backtracking = document.getElementById('imp-backtracking-avanzato');
    if (casuale) {
        casuale.checked = strategia.ordinamento_casuale === true;
        var casualeBg = casuale.parentElement.querySelector('.toggle-bg');
        var casualeDot = casuale.parentElement.querySelector('.toggle-dot');
        if (casualeBg) casualeBg.style.background = casuale.checked ? '#27AE60' : '#ccc';
        if (casualeDot) casualeDot.style.left = casuale.checked ? '20px' : '2px';
    }
    if (backtracking) backtracking.checked = strategia.backtracking_avanzato === true;
}

function _impostaStadioStrategia(stage) {
    var strategia = IMPOSTAZIONI.strategia_ottimizzazione;
    var stadio = Math.max(0, Math.min(3, Number(stage) || 0));
    strategia.ordinamento_casuale = stadio === 1 || stadio === 3;
    strategia.backtracking_avanzato = stadio === 2 || stadio === 3;
    _impostazioniDirty = true;
    _aggiornaIndicatoreStrategia();
    _sincronizzaFormStrategia();
    // La scelta dello step è una modifica completa delle impostazioni:
    // persiste sia nel browser sia nel profilo dell'utente. Durante il drag
    // accorpiamo i click ravvicinati in un solo salvataggio.
    if (_strategiaSaveTimer) clearTimeout(_strategiaSaveTimer);
    _strategiaSaveTimer = setTimeout(function () {
        _strategiaSaveTimer = null;
        salvaImpostazioni();
    }, 250);
}

function _inizializzaIndicatoreStrategia() {
    var slider = document.getElementById('strategia-slider');
    if (!slider || slider._listenerAttached) {
        _aggiornaIndicatoreStrategia();
        return;
    }
    slider._listenerAttached = true;
    slider.addEventListener('input', function () {
        _impostaStadioStrategia(this.value);
    });
    _aggiornaIndicatoreStrategia();
}

function _unisciImpostazioni(source) {
    var defaults = getImpostazioniDefault();
    var parsed = (source && typeof source === 'object') ? source : {};
    Object.keys(defaults).forEach(function (sezione) {
        if (!parsed[sezione] || typeof parsed[sezione] !== 'object') {
            parsed[sezione] = JSON.parse(JSON.stringify(defaults[sezione]));
        } else {
            Object.keys(defaults[sezione]).forEach(function (campo) {
                if (parsed[sezione][campo] === undefined || parsed[sezione][campo] === null) {
                    parsed[sezione][campo] = defaults[sezione][campo];
                }
            });
        }
    });
    return parsed;
}

function _applicaImpostazioniManuali() {
    var manuale = IMPOSTAZIONI.manuale || {};
    if (typeof _strategiaPiazzamento !== 'undefined') {
        _strategiaPiazzamento = manuale.strategia_piazzamento || 'muro';
    }
    if (typeof _massimaSporgenzaPct !== 'undefined') {
        _massimaSporgenzaPct = Number.isFinite(Number(manuale.massima_sporgenza_pct))
            ? Number(manuale.massima_sporgenza_pct) : 100;
    }
    var snapStep = [1, 5, 10, 50].indexOf(Number(manuale.snap_step_cm)) >= 0
        ? Number(manuale.snap_step_cm) : 10;
    if (typeof STATE !== 'undefined') STATE.snapStepCm = snapStep;
    var snapSelect = document.getElementById('manuale-snap-step');
    if (snapSelect) snapSelect.value = String(snapStep);

    // Applica larghezze pannelli lista dal server
    var pw = IMPOSTAZIONI.panel_widths || {};
    Object.keys(pw).forEach(function (view) {
        if (typeof _applicaPanelWidth === 'function') _applicaPanelWidth(view, pw[view]);
    });
}

function _impostazioniPayloadPulito(source) {
    var defaults = getImpostazioniDefault();
    var payload = {};
    Object.keys(defaults).forEach(function (sezione) {
        if (source[sezione] && typeof source[sezione] === 'object') {
            payload[sezione] = {};
            Object.keys(defaults[sezione]).forEach(function (campo) {
                if (source[sezione][campo] !== undefined) {
                    payload[sezione][campo] = source[sezione][campo];
                }
            });
        }
    });
    return payload;
}

function _salvaImpostazioniLocale() {
    localStorage.setItem('carico3d_impostazioni', JSON.stringify(IMPOSTAZIONI));
    localStorage.setItem('carico3d_impostazioni_version', IMPOSTAZIONI_VERSION);
}

// Elenco sezioni per la navigazione laterale
var SEZIONI_IMPOSTAZIONI = [
    { id: 'strategia', icon: '<i class="bi bi-bullseye settings-strategia-icon"></i>', label: function () { return _tImp('settings.strategia.titolo', 'Strategia di Ottimizzazione'); } },
    { id: 'output', icon: '<i class="bi bi-bar-chart settings-output-icon"></i>', label: function () { return _tImp('settings.output.titolo', 'Output'); } },
    { id: 'manuale', icon: '<i class="bi bi-hand-index-thumb settings-manuale-icon"></i>', label: function () { return _tImp('settings.manuale.titolo', 'Parametri Modalità Manuale'); } },
];

// Carica prima localStorage per un avvio immediato, poi sincronizza dal server.
function caricaImpostazioni() {
    var candidateLocale = null;
    try {
        var salvate = localStorage.getItem('carico3d_impostazioni');
        var versioneSalvata = localStorage.getItem('carico3d_impostazioni_version');

        if (versioneSalvata == IMPOSTAZIONI_VERSION && salvate) {
            candidateLocale = _unisciImpostazioni(JSON.parse(salvate));
            IMPOSTAZIONI = candidateLocale;
        } else {
            IMPOSTAZIONI = getImpostazioniDefault();
            _salvaImpostazioniLocale();
        }
    } catch (e) {
        console.warn('Errore caricamento impostazioni locali:', e);
        IMPOSTAZIONI = getImpostazioniDefault();
        _salvaImpostazioniLocale();
    }
    _applicaImpostazioniManuali();
    _aggiornaIndicatoreStrategia();

    // Il server è la fonte persistente. Se il profilo è ancora vuoto,
    // migra automaticamente la configurazione locale già esistente.
    fetch('/api/impostazioni_ottimizzatore/', { headers: { 'Accept': 'application/json' } })
        .then(function (resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.json();
        })
        .then(function (data) {
            var serverSettings = data && data.impostazioni;
            if (serverSettings && Object.keys(serverSettings).length > 0 && !_impostazioniDirty) {
                IMPOSTAZIONI = _unisciImpostazioni(serverSettings);
                _salvaImpostazioniLocale();
                _applicaImpostazioniManuali();
                _aggiornaIndicatoreStrategia();
                if (WS.impostazioniSezione && typeof renderImpostazioniForm === 'function' &&
                    DOM.pvFormBody && DOM.pvFormBody.closest('#panel-view')) {
                    renderImpostazioniForm(WS.impostazioniSezione);
                }
            } else if (candidateLocale) {
                return fetch('/api/impostazioni_ottimizzatore/', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                    body: JSON.stringify(_impostazioniPayloadPulito(candidateLocale))
                }).then(function (migrationResponse) {
                    if (!migrationResponse.ok) throw new Error('Migrazione HTTP ' + migrationResponse.status);
                });
            }
            return null;
        })
        .catch(function (e) {
            // Il fallback localStorage resta valido anche senza backend.
            console.info('Impostazioni server non disponibili: ' + e.message);
        });
}

// Salva impostazioni (localStorage + API)
async function salvaImpostazioni() {
    _impostazioniDirty = true;
    setStatus('busy', _tImp('settings.salvataggio-status', 'Salvataggio impostazioni...'));
    try {
        // Salva in locale
        _salvaImpostazioniLocale();

        // Salva su server (API endpoint per impostazioni dell'ottimizzatore)
        try {
            var resp = await fetch('/api/impostazioni_ottimizzatore/', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                body: JSON.stringify(_impostazioniPayloadPulito(IMPOSTAZIONI))
            });
            if (!resp.ok) {
                console.warn('Salvataggio server fallito (HTTP ' + resp.status + '). Solo locale.');
                showToast(_tImp('settings.salvataggio-solo-locale', '⚠️ Impostazioni salvate solo in questo browser.'), 'warning');
            } else {
                _impostazioniDirty = false;
            }
        } catch (e) {
            console.warn('Salvataggio server non disponibile. Salvato solo localmente.');
            showToast(_tImp('settings.salvataggio-solo-locale', '⚠️ Impostazioni salvate solo in questo browser.'), 'warning');
        }

        showToast(_tImp('settings.salvataggio-ok', '✅ Impostazioni salvate con successo!'), 'success');
        setStatus('idle', _tImp('settings.salvataggio-idle', 'Impostazioni salvate'));
    } catch (err) {
        showToast(_tImp('settings.salvataggio-errore', '❌ Errore salvataggio impostazioni: ') + err.message, 'error');
        setStatus('error', _tImp('settings.salvataggio-errore-status', 'Errore salvataggio'));
    }
}

// Ripristina valori di default
function ripristinaImpostazioniDefault() {
    if (!confirm(_tImp('settings.ripristina-confirm', 'Ripristinare tutte le impostazioni ai valori predefiniti?'))) return;
    IMPOSTAZIONI = getImpostazioniDefault();
    _impostazioniDirty = true;
    _salvaImpostazioniLocale();
    _applicaImpostazioniManuali();
    renderImpostazioniForm(WS.impostazioniSezione);
    showToast(_tImp('settings.ripristina-ok', '🔄 Impostazioni ripristinate ai valori predefiniti.'), 'info');
    // Persisti anche il ripristino sul profilo, senza perdere il fallback locale.
    salvaImpostazioni();
}

// =============================================================================
// PANEL IMPOSTAZIONI
// =============================================================================

function renderImpostazioniPanel() {
    if (typeof _panelViewPronto === 'function' && !_panelViewPronto('impostazioni')) return;
    DOM.pvListTitle.innerHTML = '<i class="bi bi-gear settings-impostazioni-icon"></i> ' + _tImp('settings.titolo', 'Impostazioni');
    DOM.pvListCount.textContent = SEZIONI_IMPOSTAZIONI.length;
    // Rimuovi checkbox残留 (select-all, archiviati) da viste precedenti
    var listHeader = document.querySelector('#panel-view-list .pv-list-header');
    if (listHeader) {
        var oldSelAll = listHeader.querySelector('.pv-list-select-all');
        if (oldSelAll) oldSelAll.remove();
        var oldArchCheck = listHeader.querySelector('.pv-list-archiviati');
        if (oldArchCheck) oldArchCheck.remove();
    }

    // Lista sezioni a sinistra
    var listHtml = '';
    SEZIONI_IMPOSTAZIONI.forEach(function (s) {
        listHtml += '<div class="pv-list-item" data-sezione="' + s.id + '">' +
            '<div class="pv-list-item-info">' +
                '<strong>' + s.icon + ' ' + (typeof s.label === 'function' ? s.label() : s.label) + '</strong>' +
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

    // Notifica il resizer che il pannello è pronto
    document.dispatchEvent(new CustomEvent('carico3d:panel-rendered'));
}

function getDescrizioneSezione(id) {
    var descrizioni = {
        strategia: function () { return _tImp('settings.strategia.desc-breve', 'Ordinamento, algoritmo, compattazione, distribuzione pesi'); },
        output: function () { return _tImp('settings.output.desc-breve', 'Etichette, rotazione, grafico pesi'); },
        manuale: function () { return _tImp('settings.manuale.desc-breve', 'Strategia piazzamento, sporgenza massima'); },
    };
    var fn = descrizioni[id];
    return fn ? fn() : '';
}

function renderImpostazioniForm(sezione) {
    if (typeof _panelViewPronto === 'function' && !_panelViewPronto('form impostazioni')) return;
    if (!sezione) {
        DOM.pvFormTitle.innerHTML = '<i class="bi bi-gear settings-impostazioni-icon"></i> ' + _tImp('settings.seleziona-sezione', 'Seleziona una sezione');
        DOM.pvFormBody.innerHTML = '<p style="color:#999;text-align:center;padding:40px;">' + _tImp('settings.seleziona-sezione-desc', 'Seleziona una sezione dalla lista a sinistra per configurare le impostazioni.') + '</p>';
        return;
    }

    var sezioneData = SEZIONI_IMPOSTAZIONI.find(function (s) { return s.id === sezione; });
    DOM.pvFormTitle.innerHTML = sezioneData ? sezioneData.icon + ' ' + (typeof sezioneData.label === 'function' ? sezioneData.label() : sezioneData.label) : '<i class="bi bi-gear settings-impostazioni-icon"></i> ' + _tImp('settings.titolo', 'Impostazioni');

    // Barra azioni: viene renderizzata in fondo al form (sotto le card)
    var actionsBar =
        '<div class="settings-actions-bar">' +
            '<button class="btn btn-success" id="btn-save-impostazioni"><i class="bi bi-save"></i> ' + _tImp('settings.salva', 'Salva') + '</button>' +
            '<button class="btn btn-sm" id="btn-reset-impostazioni" style="color:#888;"><i class="bi bi-arrow-counterclockwise settings-reset-icon"></i> ' + _tImp('settings.ripristina', 'Ripristina default') + '</button>' +
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

    // I bottoni azione in fondo al form, sotto le card (non più in cima).
    DOM.pvFormBody.innerHTML = cardsHtml + actionsBar;

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
            '<h4 class="settings-card-title"><i class="bi bi-bullseye settings-strategia-icon"></i> ' + _tImp('settings.strategia.titolo', 'Strategia di Ottimizzazione') + '</h4>' +
            '<p class="settings-card-desc">' + _tImp('settings.strategia.desc', "Configura come l'algoritmo di 3D packing lavora per ottimizzare il carico.") + '</p>' +
        '</div>' +
        '<div class="settings-card-body">' +
            '<div class="field-group" style="background:#f0f4f8;padding:12px;border-radius:var(--radius-sm);border:1px solid #d0d8e0;">' +
                '<label class="field-label">' + _tImp('settings.strategia.algoritmo', 'Algoritmo') + '</label>' +
                '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">' +
                    '<div style="flex:1;">' +
                        '<p style="margin:4px 0 0;font-weight:600;color:#2c3e50;"><i class="bi bi-tools settings-algoritmo-icon"></i> ' + _tImp('settings.strategia.algoritmo-3d', 'Algoritmo 3D Semplificato') + '</p>' +
                        '<span class="field-hint" style="margin-top:2px;">' + _tImp('settings.strategia.algoritmo-3d-hint', 'Skyline + stacking + backtracking con distribuzione pesi automatica sulle sezioni.') + '</span>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;padding-top:2px;">' +
                        '<label for="imp-ordinamento-casuale" style="font-size:12px;color:#666;white-space:nowrap;font-weight:500;cursor:pointer;">' + _tImp('settings.strategia.casuale', '🎲 Casuale') + '</label>' +
                        '<label style="position:relative;display:inline-block;width:42px;min-width:42px;height:24px;cursor:pointer;margin:0;">' +
                            '<input type="checkbox" id="imp-ordinamento-casuale" ' + (s.ordinamento_casuale ? 'checked' : '') + ' aria-label="' + _tImp('settings.strategia.casuale-aria', 'Ordinamento casuale Monte Carlo') + '" style="opacity:0;width:0;height:0;position:absolute;">' +
                            '<span class="toggle-bg" style="position:absolute;top:0;left:0;right:0;bottom:0;background:' + (s.ordinamento_casuale ? '#27AE60' : '#ccc') + ';border-radius:24px;transition:background 0.25s;"></span>' +
                            '<span class="toggle-dot" style="position:absolute;top:2px;left:' + (s.ordinamento_casuale ? '20px' : '2px') + ';width:20px;height:20px;background:#fff;border-radius:50%;transition:left 0.25s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>' +
                        '</label>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div class="field-group checkbox-group">' +
                '<label class="checkbox-label">' +
                    '<input type="checkbox" id="imp-compattazione-aggressiva" ' + (s.compattazione_aggressiva ? 'checked' : '') + '> ' +
                    '<i class="bi bi-boxes settings-compattazione-icon"></i> ' + _tImp('settings.strategia.compattazione', 'Compattazione aggressiva (incastro sotto sbalzi)') + '</label>' +
                '<span class="field-hint">' + _tImp('settings.strategia.compattazione-hint', "Se attivo, l'algoritmo può incastrare oggetti sotto lo sbalzo di oggetti impilati (massima saturazione). Se disattivato, ogni oggetto ha la sua colonna libera (consigliato per carichi multi-drop).") + '</span>' +
            '</div>' +

            '<div class="field-group checkbox-group">' +
                '<label class="checkbox-label">' +
                    '<input type="checkbox" id="imp-backtracking-avanzato" ' + (s.backtracking_avanzato ? 'checked' : '') + '> ' +
                    '<i class="bi bi-lightning-charge settings-backtracking-icon"></i> ' + _tImp('settings.strategia.backtracking', 'Backtracking avanzato v3 (a blocchi)') + '</label>' +
                '<span class="field-hint">' + _tImp('settings.strategia.backtracking-hint', "Se attivo, l'algoritmo esegue 5 iterazioni mirate di backtracking a blocchi con early termination (~0.8s). Migliora la disposizione rispetto al deterministico base. Disattivalo se preferisci la velocità massima.") + '</span>' +
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
        { id: 'imp-mostra-griglia', campo: 'mostra_griglia', icon: '<i class="bi bi-grid-3x3"></i>', label: _tImp('settings.output.griglia', 'Mostra griglia e assi'), desc: _tImp('settings.output.griglia-hint', 'Mostra la griglia di riferimento e gli assi XYZ nella vista 3D.') },
        { id: 'imp-etichette-ogg', campo: 'mostra_etichette_oggetti', icon: '<i class="bi bi-tags settings-output-etichette-icon"></i>', label: _tImp('settings.output.etichette-ogg', 'Mostra etichette oggetti'), desc: _tImp('settings.output.etichette-ogg-hint', 'Visualizza il codice di ogni oggetto direttamente sulle facce nella vista 3D.') },
        { id: 'imp-etichetta-cont', campo: 'mostra_etichetta_contenitore', icon: '<i class="bi bi-box settings-output-contenitore-icon"></i>', label: _tImp('settings.output.etichetta-cont', 'Mostra etichetta contenitore'), desc: _tImp('settings.output.etichetta-cont-hint', 'Visualizza il nome e le dimensioni del contenitore nella vista 3D.') },
        { id: 'imp-azzera-vuoti', campo: 'azzera_grafico_pesi_nei_vuoti', icon: '<i class="bi bi-graph-down settings-output-vuoti-icon"></i>', label: _tImp('settings.output.azzera-vuoti', 'Azzera il grafico pesi nei vuoti'), desc: _tImp('settings.output.azzera-vuoti-hint', 'Nel grafico distribuzione pesi per sezione, la linea scende a zero dove non ci sono sezioni cariche.') },
    ];

    var rotazioneAttuale = o.modalita_rotazione || 'baricentrica';

    var checkboxesHtml = checkboxFields.map(function (f) {
        var checked = o[f.campo] ? 'checked' : '';
        return '<div class="settings-checkbox-row">' +
            '<label class="checkbox-label"><input type="checkbox" id="' + f.id + '" ' + checked + '> ' + (f.icon || '') + ' ' + f.label + '</label>' +
        '</div>';
    }).join('');

    return '<div class="settings-card">' +
        '<div class="settings-card-header">' +
            '<h4 class="settings-card-title"><i class="bi bi-bar-chart settings-output-icon"></i> ' + _tImp('settings.output.titolo', "Output dell'Ottimizzazione") + '</h4>' +
            '<p class="settings-card-desc">' + _tImp('settings.output.desc', "Configura cosa viene mostrato all'utente dopo l'ottimizzazione.") + '</p>' +
        '</div>' +
        '<div class="settings-card-body">' +
            checkboxesHtml +
            '<div class="settings-separator"></div>' +
            '<div class="field-group">' +
                '<label class="field-label"><i class="bi bi-arrow-repeat settings-output-rotazione-icon"></i> ' + _tImp('settings.output.rotazione-label', 'Modalità Rotazione Manuale') + '</label>' +
                '<div class="radio-group" id="imp-rotazione-modalita">' +
                    '<label class="radio-label"><input type="radio" name="rotazione-modalita" value="baricentrica" ' + (rotazioneAttuale === 'baricentrica' ? 'checked' : '') + '> ' + _tImp('settings.output.rotazione-baricentrica', 'Baricentrica (attuale)') + '</label>' +
                    '<label class="radio-label"><input type="radio" name="rotazione-modalita" value="eccentrica" ' + (rotazioneAttuale === 'eccentrica' ? 'checked' : '') + '> ' + _tImp('settings.output.rotazione-eccentrica', 'Eccentrica (perno su lato corto)') + '</label>' +
                '</div>' +
                '<span class="field-hint">' + _tImp('settings.output.rotazione-hint', "Baricentrica: Shift+click ruota attorno al centro (sempre). Eccentrica: Shift+tasto sinistro = rotazione antioraria, Shift+tasto destro = rotazione oraria, con perno sullo spigolo del lato corto. La rotazione eccentrica si applica solo alle rotazioni orizzontali (LxPxH ↔ PxLxH); i ribaltamenti che coinvolgono l'altezza usano sempre la modalità baricentrica.") + '</span>' +            '</div>' +
        '</div>' +
    '</div>';
}


// =============================================================================

// CARD: PARAMETRI MODALITÀ MANUALE
// =============================================================================

function renderCardManuale() {
    var manuale = IMPOSTAZIONI.manuale || {};
    var strategia = manuale.strategia_piazzamento || ((typeof _strategiaPiazzamento !== 'undefined') ? _strategiaPiazzamento : 'muro');
    var sporgenza = manuale.massima_sporgenza_pct !== undefined
        ? manuale.massima_sporgenza_pct
        : ((typeof _massimaSporgenzaPct !== 'undefined') ? _massimaSporgenzaPct : 100);
    var snapStep = [1, 5, 10, 50].indexOf(Number(manuale.snap_step_cm)) >= 0
        ? Number(manuale.snap_step_cm) : 10;

    return '<div class="settings-card">' +
        '<div class="settings-card-header">' +
            '<h4 class="settings-card-title"><i class="bi bi-hand-index-thumb settings-manuale-icon"></i> ' + _tImp('settings.manuale.titolo', 'Parametri Modalità Manuale') + '</h4>' +
            '<p class="settings-card-desc">' + _tImp('settings.manuale.desc', 'Configura il comportamento del piazzamento manuale con il bottone "Aggiungi alla scena".') + '</p>' +
        '</div>' +
        '<div class="settings-card-body">' +
            '<div class="field-group">' +
                '<label class="field-label"><i class="bi bi-box-arrow-in-down settings-manuale-strategia-icon"></i> ' + _tImp('settings.manuale.strategia', 'Strategia di Piazzamento') + '</label>' +
                '<select class="form-select" id="manuale-strategia-piazzamento">' +
                    '<option value="colonne" ' + (strategia === 'colonne' ? 'selected' : '') + '>' + _tImp('settings.manuale.colonne', '🏗️ Colonne immediate (X→Z→Y) — impila subito') + '</option>' +
                    '<option value="muro" ' + (strategia === 'muro' ? 'selected' : '') + '>' + _tImp('settings.manuale.muro', '🧱 Muro completo (Z→Y→X) — riempi fetta') + '</option>' +
                '</select>' +
                '<span class="field-hint"><strong>' + _tImp('settings.manuale.colonne', '🏗️ Colonne immediate (X→Z→Y) — impila subito').split(' —')[0] + ':</strong> ' + _tImp('settings.manuale.colonne-hint', 'Colonne: per ogni X, riempi larghezza al pavimento poi impila. Stacking dopo 2-3 oggetti.') + '<br><strong>' + _tImp('settings.manuale.muro', '🧱 Muro completo (Z→Y→X) — riempi fetta').split(' —')[0] + ':</strong> ' + _tImp('settings.manuale.muro-hint', 'Muro: riempi una fetta di larghezza completa (pavimento+stack), poi avanza in lunghezza.') + '</span>' +
            '</div>' +
            '<div class="field-group" style="margin-top:14px;">' +
                '<label class="field-label"><i class="bi bi-magnet settings-manuale-snap-icon"></i> ' + _tImp('settings.manuale.snap', 'Snap griglia') + '</label>' +
                '<select class="form-select" id="manuale-snap-step">' +
                    '<option value="1" ' + (snapStep === 1 ? 'selected' : '') + '>1 cm</option>' +
                    '<option value="5" ' + (snapStep === 5 ? 'selected' : '') + '>5 cm</option>' +
                    '<option value="10" ' + (snapStep === 10 ? 'selected' : '') + '>10 cm</option>' +
                    '<option value="50" ' + (snapStep === 50 ? 'selected' : '') + '>50 cm</option>' +
                '</select>' +
                '<span class="field-hint">' + _tImp('settings.manuale.snap-hint', "Scegli l'intervallo usato per agganciare gli oggetti alla griglia durante trascinamento e piazzamento.") + '</span>' +
            '</div>' +
            '<div class="field-group" style="margin-top:14px;">' +
                '<label class="field-label"><i class="bi bi-arrows-expand-vertical settings-manuale-sporgenza-icon"></i> ' + _tImp('settings.manuale.sporgenza', 'Sporgenza Massima:') + ' <strong id="manuale-sporgenza-valore">' + sporgenza + '%</strong></label>' +
                '<input type="range" id="manuale-sporgenza" class="form-range" min="0" max="100" value="' + sporgenza + '" step="5" style="width:100%; margin-top:4px;">' +
                '<div style="display:flex; justify-content:space-between; font-size:10px; color:#999;">' +
                    '<span>' + _tImp('settings.manuale.sporgenza-0', '0% (nessuno sbalzo)') + '</span>' +
                    '<span>50%</span>' +
                    '<span>' + _tImp('settings.manuale.sporgenza-100', '100% (libero)') + '</span>' +
                '</div>' +
                '<span class="field-hint">' + _tImp('settings.manuale.sporgenza-hint', 'Percentuale massima di sbalzo consentita in X e Z. A 30%, un oggetto sopra deve avere almeno il 70% di supporto dal singolo oggetto sotto (no "ponte" tra due oggetti).') + '</span>' +
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
                _impostazioniDirty = true;
                IMPOSTAZIONI.strategia_ottimizzazione.ordinamento_casuale = this.checked;
                _aggiornaIndicatoreStrategia();
                // Aggiorna colore toggle inline
                var bg = this.parentElement.querySelector('.toggle-bg');
                var dot = this.parentElement.querySelector('.toggle-dot');
                if (bg) bg.style.background = this.checked ? '#27AE60' : '#ccc';
                if (dot) dot.style.left = this.checked ? '20px' : '2px';
            });
        }

        // Toggle compattazione aggressiva
        var compAggr = document.getElementById('imp-compattazione-aggressiva');
        if (compAggr) compAggr.addEventListener('change', function () {
            _impostazioniDirty = true;
            IMPOSTAZIONI.strategia_ottimizzazione.compattazione_aggressiva = this.checked;
        });

        // Toggle backtracking avanzato v3
        var backAdv = document.getElementById('imp-backtracking-avanzato');
        if (backAdv) backAdv.addEventListener('change', function () {
            _impostazioniDirty = true;
            IMPOSTAZIONI.strategia_ottimizzazione.backtracking_avanzato = this.checked;
            _aggiornaIndicatoreStrategia();
        });

    }

    if (sezione === 'manuale') {
        // Select strategia piazzamento
        var selStrategia = document.getElementById('manuale-strategia-piazzamento');
        if (selStrategia && !selStrategia._listenerAttached) {
            selStrategia._listenerAttached = true;
            selStrategia.addEventListener('change', function () {
                _impostazioniDirty = true;
                IMPOSTAZIONI.manuale.strategia_piazzamento = this.value;
                if (typeof _strategiaPiazzamento !== 'undefined') {
                    _strategiaPiazzamento = this.value;
                }
            });
        }

        // Snap griglia: il controllo ora vive nei Parametri Modalità Manuale.
        var snapSelect = document.getElementById('manuale-snap-step');
        if (snapSelect && !snapSelect._listenerAttached) {
            snapSelect._listenerAttached = true;
            snapSelect.addEventListener('change', function () {
                var valore = [1, 5, 10, 50].indexOf(Number(this.value)) >= 0
                    ? Number(this.value) : 10;
                _impostazioniDirty = true;
                IMPOSTAZIONI.manuale.snap_step_cm = valore;
                if (typeof STATE !== 'undefined') STATE.snapStepCm = valore;
                this.blur();
            });
        }

        // Slider sporgenza massima
        var sliderSporgenza = document.getElementById('manuale-sporgenza');
        var lblSporgenza = document.getElementById('manuale-sporgenza-valore');
        if (sliderSporgenza && !sliderSporgenza._listenerAttached) {
            sliderSporgenza._listenerAttached = true;            sliderSporgenza.addEventListener('input', function () {
                _impostazioniDirty = true;
                IMPOSTAZIONI.manuale.massima_sporgenza_pct = parseInt(this.value) || 100;
                if (typeof _massimaSporgenzaPct !== 'undefined') {
                    _massimaSporgenzaPct = IMPOSTAZIONI.manuale.massima_sporgenza_pct;
                }
                if (lblSporgenza) lblSporgenza.textContent = IMPOSTAZIONI.manuale.massima_sporgenza_pct + '%';
            });
        }

        // --- Colori e Stili rapidi ---
    }


    if (sezione === 'output') {
        // Toggle griglia e assi
        var grigliaToggle = document.getElementById('imp-mostra-griglia');
        if (grigliaToggle) grigliaToggle.addEventListener('change', function () {
            _impostazioniDirty = true;
            IMPOSTAZIONI.output_ottimizzazione.mostra_griglia = this.checked;
            if (STATE.grigliaMesh) STATE.grigliaMesh.visible = this.checked;
            if (STATE.axesMesh) STATE.axesMesh.visible = this.checked;
        });

        // Checkbox output
        var etichetteOgg = document.getElementById('imp-etichette-ogg');
        if (etichetteOgg) etichetteOgg.addEventListener('change', function () {
            _impostazioniDirty = true;
            IMPOSTAZIONI.output_ottimizzazione.mostra_etichette_oggetti = this.checked;
            if (typeof impostaVisibilitaEtichetteOggetti === 'function') {
                impostaVisibilitaEtichetteOggetti(this.checked);
            }
        });

        var etichettaCont = document.getElementById('imp-etichetta-cont');
        if (etichettaCont) etichettaCont.addEventListener('change', function () {
            _impostazioniDirty = true;
            IMPOSTAZIONI.output_ottimizzazione.mostra_etichetta_contenitore = this.checked;
            if (typeof impostaVisibilitaEtichettaContenitore === 'function') {
                impostaVisibilitaEtichettaContenitore(this.checked);
            }
        });

        var azzeraVuoti = document.getElementById('imp-azzera-vuoti');
        if (azzeraVuoti) azzeraVuoti.addEventListener('change', function () {
            _impostazioniDirty = true;
            IMPOSTAZIONI.output_ottimizzazione.azzera_grafico_pesi_nei_vuoti = this.checked;
            _aggiornaGraficoPesiSeVisibile();
        });

        // Radio modalità rotazione manuale
        var rotRadios = document.querySelectorAll('input[name="rotazione-modalita"]');
        rotRadios.forEach(function (r) {
            r.addEventListener('change', function () {
                if (this.checked) {
                    _impostazioniDirty = true;
                    IMPOSTAZIONI.output_ottimizzazione.modalita_rotazione = this.value;
                }
            });
        });
    }
}

// =============================================================================

// =============================================================================
// INIT + LANGUAGE CHANGE
// =============================================================================

// Quando l'utente cambia lingua, ridisegna l'intero pannello impostazioni
// (sezioni, card, campi, etichette) per riflettere la nuova lingua.
document.addEventListener('carico3d:language-change', function () {
    if (WS.viewAttiva !== 'impostazioni') return;
    renderImpostazioniPanel();
});
