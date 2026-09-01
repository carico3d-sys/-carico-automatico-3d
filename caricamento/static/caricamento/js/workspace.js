/**
 * Workspace Carico 3D — Init & Bootstrap (v4.0)
 *
 * Inizializzazione e bootstrap dell applicazione.
 * Tutti i moduli sono caricati separatamente prima di questo file.
 *
 * Load order: LAST — all other workspace_*.js files must load before this.
 */

/**
 * Apre il modale di aiuto contestuale del Mouse (Modifica Manuale).
 * Stesso pattern dell'help della toolbar Vista: modale chiudibile
 * con la X (footer nascosto) e larghezza adattata al contenuto.
 */
function apriModaleAiutoMouse() {
    var html =
        '<div class="vp-help-section">' +
            '<div class="vp-help-section-title"><i class="bi bi-mouse"></i> Mouse</div>' +
            '<div class="vp-help-row"><kbd>Sx</kbd> + trascina &rarr; muovi <b>(XY)</b></div>' +
            '<div class="vp-help-row"><kbd>Sx</kbd> + <kbd>Ctrl</kbd> &rarr; alza/abbassa <b>(Z)</b></div>' +
            '<div class="vp-help-row"><kbd>Sx</kbd>/<kbd>Dx</kbd> + <kbd>Shift</kbd> &rarr; ruota 90&deg; ↺↻</div>' +
        '</div>';
    apriModale('Aiuto — Mouse', html, null, { noFooter: true, modalClass: 'modal-auto', overlayClass: 'modal-overlay-clean' });
}

/**
 * Apre il modale di aiuto contestuale della Tastiera (Modifica Manuale).
 */
function apriModaleAiutoTastiera() {
    var html =
        '<div class="vp-help-section">' +
            '<div class="vp-help-section-title"><i class="bi bi-keyboard"></i> Tastiera</div>' +
            '<div class="vp-help-row"><kbd>&larr;</kbd><kbd>&rarr;</kbd><kbd>&uarr;</kbd><kbd>&darr;</kbd> &rarr; sposta <b>(XY)</b></div>' +
            '<div class="vp-help-row"><kbd>Ctrl</kbd> + <kbd>&larr;</kbd><kbd>&rarr;</kbd> &rarr; ruota 90&deg; ↺↻</div>' +
            '<div class="vp-help-row"><kbd>Ctrl</kbd> + <kbd>&uarr;</kbd><kbd>&darr;</kbd> &rarr; alza/abbassa <b>(Z)</b></div>' +
            '<div class="vp-help-row"><kbd>Invio</kbd> &rarr; conferma posizione</div>' +
        '</div>';
    apriModale('Aiuto — Tastiera', html, null, { noFooter: true, modalClass: 'modal-auto', overlayClass: 'modal-overlay-clean' });
}

function inizializza() {
    cacheDom();
    inizializzaGestioneErroriGlobale();
    caricaImpostazioni(); // Carica impostazioni ottimizzatore da localStorage
    _inizializzaIndicatoreStrategia();

    // Chiudi modale cliccando fuori
    DOM.modalOverlay.addEventListener('click', function (e) {
        if (e.target === DOM.modalOverlay) chiudiModale();
    });

    // --- Sidebar tabs ---
    DOM.sidebarTabs.forEach(function (tab) {
        tab.addEventListener('click', function (e) {
            e.preventDefault();
            var tabName = this.dataset.tab;
            switchSidebarTab(tabName);
        });
    });

    // --- Header: category buttons ---
    DOM.headerCatBtns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            var cat = this.dataset.cat;
            _attivaHeaderCategory(cat);
        });
    });

    // --- Header: selezione mezzo ---
    DOM.headerVehicleSelect.addEventListener('change', function () {
        selezionaMezzo(this.value);
    });

    if (DOM.headerExportBtn) {
        DOM.headerExportBtn.addEventListener('click', function () {
            esportaPosizioni();
        });
    }

    // --- Header: gestione icone (solo admin) ---
    var iconeBtn = document.getElementById('header-icone-btn');
    if (iconeBtn) {
        iconeBtn.addEventListener('click', function () {
            if (typeof apriModaleIcone === 'function') {
                apriModaleIcone();
            } else {
                showToast('Modulo gestione icone non caricato.', 'error');
            }
        });
    }

    // --- Panel destro: inizializza autocomplete "Aggiungi oggetto" ---
    if (typeof _initPanelAutocomplete === 'function') {
        _initPanelAutocomplete();
    }
    // --- Cestino batch nel pannello destro ---
    var trashBtn = document.getElementById('panel-header-trash');
    if (trashBtn) {
        trashBtn.addEventListener('click', function () {
            if (typeof _eliminaPanelItemsBatch === 'function') {
                _eliminaPanelItemsBatch();
            }
        });
    }
    // --- Deseleziona item selezionati al click ovunque tranne che su item, form anagrafica, modali o help popover ---
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.panel-item') && !e.target.closest('.pv-list-item') && !e.target.closest('#panel-view-form') && !e.target.closest('#modal-overlay') && !e.target.closest('#vpf-help-popover')) {
            _deselezionaTuttiItemSelezionati();
        }
    });
    // Il pulsante '+' è gestito dall'autocomplete, resta visibile
    if (DOM.btnPanelAdd) {
        DOM.btnPanelAdd.style.display = '';
    }

    // --- Azioni ottimizzazione automatica ---
    // Nota: il flusso è unico — ELABORA genera l'anteprima (piano temporaneo)
    // e SALVA la conferma sul piano reale. Il vecchio "OTTIMIZZA E SALVA"
    // (elaboraOttimizzazione(true)) è stato rimosso per semplificare la UI.
    if (DOM.btnSalvaAuto) {
        DOM.btnSalvaAuto.addEventListener('click', function () {
            if (typeof salvaPianoDB === 'function') salvaPianoDB();
        });
    }
    if (DOM.btnElaboraAuto) {
        DOM.btnElaboraAuto.addEventListener('click', function () {
            elaboraOttimizzazione(false);
        });
    }

    // --- Snap step manuale ---
    var snapSelect = document.getElementById('manuale-snap-step');
    if (snapSelect) {
        snapSelect.addEventListener('change', function () {
            if (typeof STATE !== 'undefined') {
                STATE.snapStepCm = parseInt(this.value) || 10;
            }
            // Il cambio dello snap non deve lasciare il focus sulla combo:
            // subito dopo la scelta le frecce devono muovere l'oggetto
            // selezionato, non cambiare nuovamente l'opzione del select.
            this.blur();
        });
    }

    // --- Pulsanti Distribuzione Pesi nei tab Manuale e Automatica ---
    var manualeBtnPesi = document.getElementById('manuale-btn-pesi');
    if (manualeBtnPesi) {
        manualeBtnPesi.addEventListener('click', function () {
            _eseguiAzioneRapida('grafico-pesi');
        });
    }
    var autoBtnPesi = document.getElementById('auto-btn-pesi');
    if (autoBtnPesi) {
        autoBtnPesi.addEventListener('click', function () {
            _eseguiAzioneRapida('grafico-pesi');
        });
    }

    // --- Bottone Salva (tab Manuale) ---
    var manualeBtnSalva = document.getElementById('manuale-btn-salva');
    if (manualeBtnSalva) {
        manualeBtnSalva.addEventListener('click', function () {
            if (typeof salvaPianoDB === 'function') {
                salvaPianoDB();
            } else {
                showToast('Modulo salvataggio non caricato.', 'error');
            }
        });
    }

    // --- Help contestuale: Mouse / Tastiera → 2 modali (tab Manuale) ---
    var manualeBtnHelpMouse = document.getElementById('manuale-btn-help-mouse');
    var manualeBtnHelpTastiera = document.getElementById('manuale-btn-help-tastiera');
    if (manualeBtnHelpMouse) {
        manualeBtnHelpMouse.addEventListener('click', apriModaleAiutoMouse);
    }
    if (manualeBtnHelpTastiera) {
        manualeBtnHelpTastiera.addEventListener('click', apriModaleAiutoTastiera);
    }
    var manualeBtnImpostazioni = document.getElementById('manuale-btn-impostazioni');
    if (manualeBtnImpostazioni) {
        manualeBtnImpostazioni.addEventListener('click', function () {
            if (typeof apriImpostazioniDaSidebar === 'function') {
                apriImpostazioniDaSidebar();
            } else {
                showToast('Modulo impostazioni non caricato.', 'error');
            }
        });
    }

    // --- Camera controls ---
    setupCameraControls();

    // --- Tastiera: shortcut scena 3D ---
    document.addEventListener('keydown', function (e) {
        // Ignora se l'utente sta scrivendo in un input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        // Log diagnostico solo per gli shortcut gestiti: F12 e gli altri tasti
        // del browser non devono produrre falsi allarmi "controls: MISSING".
        var cameraShortcut = ['+', '=', '-', 'f', 'F', 'r', 'R', '[', ']', '\\'].indexOf(e.key) !== -1;
        if (cameraShortcut) {
            console.log('[KEY]', e.key, '| treSceneLoaded:', WS.treSceneLoaded, '| controls:', typeof STATE !== 'undefined' && STATE.controls ? 'OK' : 'MISSING');
        }

        switch (e.key) {
            case '+':
            case '=':
                e.preventDefault();
                console.log('[KEY] cameraZoom(-1)');
                cameraZoom(-1);
                break;
            case '-':
                e.preventDefault();
                console.log('[KEY] cameraZoom(1)');
                cameraZoom(1);
                break;
            case 'f':
            case 'F':
            case 'r':
            case 'R':
                if (e.key === 'r' || e.key === 'R') {
                    if (e.ctrlKey || e.metaKey) break; // non bloccare Ctrl+R / Cmd+R
                }
                e.preventDefault();
                console.log('[KEY] impostaVistaCamera reset, treSceneLoaded:', WS.treSceneLoaded);
                impostaVistaCamera('reset');
                break;
            case '[':
                e.preventDefault();
                if (typeof _applicaSpaziatura === 'function') {
                    _applicaSpaziatura(Math.max(30, STATE.spaziatura - 5));
                }
                break;
            case ']':
                e.preventDefault();
                if (typeof _applicaSpaziatura === 'function') {
                    _applicaSpaziatura(Math.min(100, STATE.spaziatura + 5));
                }
                break;
            case '\\':
                e.preventDefault();
                if (typeof _applicaSpaziatura === 'function') {
                    _applicaSpaziatura(100);
                }
                break;
        }
    });

    // Chiudi popover aiuto cliccando fuori
    document.addEventListener('click', function (e) {
        if (DOM.vpfHelpPopover && DOM.vpfHelpPopover.style.display === 'block') {
            var clickedInside = DOM.vpfHelpPopover.contains(e.target) || (DOM.vpfBtnHelp && DOM.vpfBtnHelp.contains(e.target));
            if (!clickedInside) {
                DOM.vpfHelpPopover.style.display = 'none';
                if (DOM.vpfBtnHelp) DOM.vpfBtnHelp.classList.remove('active');
            }
        }
    });

    // --- Deep-link: se l'URL contiene ?view=abbonamento (es. dal pricing della
    //     landing page), apri direttamente il pannello abbonamento.
    var urlParams = new URLSearchParams(window.location.search);
    var deepView = urlParams.get('view');
    if (deepView && typeof mostraPanelView === 'function') {
        mostraPanelView(deepView);
        // Pulisci l'URL per evitare che un refresh riapra il pannello
        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, '', window.location.pathname);
        }
    }

    // --- Avvio con piano pre-caricato ---
    if (WS.activePianoId) {
        caricaScena3D(WS.activePianoId);
    }

    // --- Se mezzo pre-selezionato ---
    if (DOM.headerVehicleSelect.value) {
        selezionaMezzo(DOM.headerVehicleSelect.value);
    }

    // --- Aggiorna select oggetti ---
    aggiornaSelectOggetti();
    aggiornaSelectMezzi();

    // --- Render iniziale sidebar Documenti (categoria default)
    _renderSidebarNavigazione('documenti');

    // --- Applica configurazione icone (PNG al posto di Bootstrap dove configurato)
    if (typeof initIconManager === 'function') {
        initIconManager();
    }
    // Riapplica dopo che la sidebar è stata renderizzata dinamicamente
    if (typeof _applyIconConfig === 'function') {
        setTimeout(function () { _applyIconConfig(); }, 200);
    }

    setStatus('idle', 'Pronto');
    console.log('🏗️ Workspace Carico 3D v4 inizializzato (layout 3 colonne, header categorie)');

}

// --- Avvio ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inizializza);
} else {
    inizializza();
}
