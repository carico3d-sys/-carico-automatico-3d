/**
 * Workspace Carico 3D — Abbonamento Module
 *
 * Vista "Abbonamento" integrata nel main view (mostraPanelView).
 * Due card piani (Mensile / Annuale) con selettore utenti e checkout Lemon Squeezy.
 *
 * Depends on: workspace_core.js
 */

// =============================================================================
// CONFIGURAZIONE PIANI (prezzi in USD)
// =============================================================================

var ABBONAMENTO_PIANI = [
    { nome: 'Mensile', tipo: 'mensile', prezzoUnitario: 19, periodo: '/mese', variantId: '' },
    { nome: 'Annuale', tipo: 'annuale', prezzoUnitario: 190, periodo: '/anno', variantId: '' }
];

// Carica i variant ID dal server (iniettati nel template)
if (typeof WORKSPACE_CONFIG !== 'undefined' && WORKSPACE_CONFIG.lsVariantIds) {
    ABBONAMENTO_PIANI.forEach(function (p) {
        if (WORKSPACE_CONFIG.lsVariantIds[p.tipo]) {
            p.variantId = WORKSPACE_CONFIG.lsVariantIds[p.tipo];
        }
    });
}

var _abbonamentoStatus = null;  // cache dello stato pagamenti
var _abbonamentoRichiesta = 0;  // sequencer per evitare risposte race-condition
var _checkoutInCorso = false;   // evita doppi click sul checkout


// =============================================================================
// LEMON.JS: Setup event handler (Checkout.Success)
// =============================================================================

function _initLemonSqueezy() {
    if (typeof LemonSqueezy === 'undefined') return;
    try {
        LemonSqueezy.Setup({
            eventHandler: function (data) {
                if (!data || !data.event) return;
                if (data.event === 'Checkout.Success') {
                    _checkoutInCorso = false;
                    if (typeof setStatus === 'function') setStatus('idle', '');
                    if (typeof showToast === 'function') {
                        showToast('Pagamento completato! Aggiornamento stato...', 'success');
                    }
                    // L'overlay si chiude: ricarica lo stato abbonamento
                    renderAbbonamentoPanel();
                }
            }
        });
    } catch (e) {
        // Lemon.js non disponibile o Setup non supportato: nessun handler
    }
}

// Inizializza Lemon.js appena possibile (se lo script è già caricato)
if (typeof LemonSqueezy !== 'undefined') {
    _initLemonSqueezy();
}


// =============================================================================
// RENDER: Vista Abbonamento
// =============================================================================

function renderAbbonamentoPanel() {
    if (typeof _panelViewPronto !== 'function' || !_panelViewPronto('abbonamento')) return;

    DOM.pvListTitle.innerHTML = '<i class="bi bi-credit-card"></i> Abbonamento';
    DOM.pvListCount.textContent = '';
    DOM.pvFormTitle.textContent = 'Il tuo piano';
    DOM.pvListBody.innerHTML = '';

    // Mostra loader mentre fetcha lo stato
    DOM.pvFormBody.innerHTML = '<p style="color:#999;text-align:center;padding:40px;">Caricamento stato abbonamento...</p>';

    ++_abbonamentoRichiesta;
    var richiesta = _abbonamentoRichiesta;

    fetch('/api/payments/status/', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) {
            if (richiesta !== _abbonamentoRichiesta) return;
            _abbonamentoStatus = data;
            _renderAbbonamentoContent(data);
        })
        .catch(function () {
            if (richiesta !== _abbonamentoRichiesta) return;
            if (DOM.pvFormBody && DOM.pvFormBody.isConnected) {
                DOM.pvFormBody.innerHTML = '<p style="color:#c0392b;text-align:center;padding:40px;">Errore caricamento stato pagamenti.</p>';
            }
        });
}


function _renderAbbonamentoContent(data) {
    var isPaying = data.is_paying;
    var trialActive = data.trial_active;
    var trialDaysLeft = data.trial_days_left;
    var plan = data.plan || '';
    var quantity = data.quantity || 0;
    var trialEnd = data.trial_end;

    // --- Banner stato ---
    var bannerHtml = '';
    if (isPaying) {
        bannerHtml = '<div class="abbonamento-banner abbonamento-banner--active">' +
            '<i class="bi bi-check-circle-fill"></i> ' +
            '<strong>Piano attivo: ' + _escapeHtml(plan) + ' × ' + quantity + ' utent' + (quantity === 1 ? 'e' : 'i') + '</strong>' +
            '</div>';
    } else if (trialDaysLeft !== null && trialDaysLeft > 0) {
        bannerHtml = '<div class="abbonamento-banner abbonamento-banner--trial">' +
            '<i class="bi bi-hourglass-split"></i> ' +
            '<strong>Trial: ' + trialDaysLeft + ' giorn' + (trialDaysLeft === 1 ? 'o' : 'i') + ' rimanent' + (trialDaysLeft === 1 ? 'e' : 'i') + '</strong>' +
            '</div>';
    } else if (!trialActive) {
        bannerHtml = '<div class="abbonamento-banner abbonamento-banner--expired">' +
            '<i class="bi bi-exclamation-triangle-fill"></i> ' +
            '<strong>Trial scaduto — Sottoscrivi un abbonamento per continuare</strong>' +
            '</div>';
    }

    // --- Formatta data trial_end ---
    var trialEndStr = '';
    if (trialEnd) {
        var d = new Date(trialEnd);
        if (!isNaN(d.getTime())) {
            var mesi = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
            trialEndStr = d.getDate() + ' ' + mesi[d.getMonth()] + ' ' + d.getFullYear();
        }
    }

    // --- Card piani ---
    var cardsHtml = '';
    if (!isPaying) {
        ABBONAMENTO_PIANI.forEach(function (piano) {
            var checked = '';
            // Pre-seleziona mensile
            if (piano.tipo === 'mensile') checked = 'checked';
            cardsHtml +=
                '<label class="abbonamento-card' + checked + '" data-tipo="' + piano.tipo + '">' +
                    '<input type="radio" name="abbonamento-piano" value="' + piano.tipo + '" ' + checked + '>' +
                    '<div class="abbonamento-card-header">' +
                        '<span class="abbonamento-card-nome">' + _escapeHtml(piano.nome) + '</span>' +
                        '<span class="abbonamento-card-badge">' + _escapeHtml(piano.periodo) + '</span>' +
                    '</div>' +
                    '<div class="abbonamento-card-prezzo" id="abbonamento-prezzo-' + piano.tipo + '">' +
                        '$' + piano.prezzoUnitario +
                    '</div>' +
                '</label>';
        });
    } else {
        // Se pagante: mostra solo riepilogo
        cardsHtml = '<p style="text-align:center;color:#666;padding:20px;">Gestisci il tuo abbonamento dal portale cliente Lemon Squeezy.</p>';
    }

    // --- Selettore utenti ---
    var selettoreHtml = '';
    if (!isPaying) {
        selettoreHtml =
            '<div class="abbonamento-selettore">' +
                '<label class="field-label">Numero utenti (seat)</label>' +
                '<div class="abbonamento-quantity-row">' +
                    '<button class="btn btn-sm abbonamento-qty-btn" id="abbonamento-qty-minus">−</button>' +
                    '<span class="abbonamento-qty-value" id="abbonamento-qty-value">1</span>' +
                    '<button class="btn btn-sm abbonamento-qty-btn" id="abbonamento-qty-plus">+</button>' +
                '</div>' +
                '<p class="abbonamento-totale" id="abbonamento-totale">Totale: <strong>$19</strong>/mese</p>' +
                '<button class="btn btn-primary btn-block btn-lg" id="abbonamento-btn-checkout">' +
                    '<i class="bi bi-credit-card"></i> Abbonati ora' +
                '</button>' +
            '</div>';
    } else {
        selettoreHtml =
            '<div class="abbonamento-selettore">' +
                '<a class="btn btn-primary btn-block btn-lg" ' +
                   'href="https://app.lemonsqueezy.com/my-orders" target="_blank" rel="noopener">' +
                    '<i class="bi bi-box-arrow-up-right"></i> Gestisci abbonamento' +
                '</a>' +
                '<p class="abbonamento-hint" style="margin-top:12px;">' +
                    'Accedi al Customer Portal per cambiare piano, aggiornare il numero di utenti, ' +
                    'scaricare fatture o cancellare l\'abbonamento.' +
                '</p>' +
            '</div>';
    }

    // --- Assembla layout ---
    DOM.pvFormBody.innerHTML =
        bannerHtml +
        '<div class="abbonamento-info">' +
            (trialEndStr ? '<p class="abbonamento-trial-end">Scadenza trial: ' + trialEndStr + '</p>' : '') +
        '</div>' +
        '<div class="abbonamento-cards">' +
            cardsHtml +
        '</div>' +
        selettoreHtml;

    // --- Wiring ---
    if (!isPaying) {
        _wireAbbonamentoSelettore();
    }
}


// =============================================================================
// WIRING: Selettore utenti, aggiornamento prezzo, checkout
// =============================================================================

function _wireAbbonamentoSelettore() {
    var quantity = 1;
    var pianoSelezionato = 'mensile';

    var qtyValue = document.getElementById('abbonamento-qty-value');
    var totaleEl = document.getElementById('abbonamento-totale');
    var btnCheckout = document.getElementById('abbonamento-btn-checkout');

    // --- Piano radio buttons ---
    document.querySelectorAll('input[name="abbonamento-piano"]').forEach(function (radio) {
        radio.addEventListener('change', function () {
            pianoSelezionato = this.value;
            _aggiornaPrezzoAbbonamento(pianoSelezionato, quantity);
            // Aggiorna classe selected sulle card
            document.querySelectorAll('.abbonamento-card').forEach(function (c) {
                c.classList.remove('abbonamento-card--selected');
            });
            this.closest('.abbonamento-card').classList.add('abbonamento-card--selected');
        });
    });

    // --- Quantity +/- ---
    document.getElementById('abbonamento-qty-minus').addEventListener('click', function () {
        if (quantity > 1) {
            quantity--;
            qtyValue.textContent = quantity;
            _aggiornaPrezzoAbbonamento(pianoSelezionato, quantity);
        }
    });

    document.getElementById('abbonamento-qty-plus').addEventListener('click', function () {
        quantity++;
        qtyValue.textContent = quantity;
        _aggiornaPrezzoAbbonamento(pianoSelezionato, quantity);
    });

    // --- Checkout button ---
    btnCheckout.addEventListener('click', function () {
        _avviaCheckout(pianoSelezionato, quantity);
    });
}


function _aggiornaPrezzoAbbonamento(tipo, quantity) {
    var piano = ABBONAMENTO_PIANI.find(function (p) { return p.tipo === tipo; });
    if (!piano) return;

    var totale = piano.prezzoUnitario * quantity;
    var periodicita = piano.periodo;

    // Aggiorna prezzo nella card
    var prezzoCard = document.getElementById('abbonamento-prezzo-' + tipo);
    if (prezzoCard) {
        prezzoCard.innerHTML = '$' + totale + '<small>' + periodicita + '</small>';
    }

    // Aggiorna totale sotto il selettore
    var totaleEl = document.getElementById('abbonamento-totale');
    if (totaleEl) {
        totaleEl.innerHTML = 'Totale: <strong>$' + totale + '</strong>' + periodicita +
            (quantity > 1 ? ' × ' + quantity + ' utenti' : '');
    }
}


function _avviaCheckout(tipo, quantity) {
    var piano = ABBONAMENTO_PIANI.find(function (p) { return p.tipo === tipo; });
    if (!piano || !piano.variantId) {
        showToast('Configurazione pagamenti incompleta. Contatta il supporto.', 'error');
        return;
    }

    if (_checkoutInCorso) return;
    _checkoutInCorso = true;

    // Assicurati che Lemon.js sia inizializzato (script potrebbe caricarsi dopo)
    if (typeof LemonSqueezy !== 'undefined') {
        _initLemonSqueezy();
    }

    if (typeof showToast === 'function') showToast('Preparazione checkout...', 'info');
    if (typeof setStatus === 'function') setStatus('busy', 'Checkout...');

    // Redirect post-pagamento (fallback se l'overlay non è disponibile)
    var redirectUrl = window.location.origin + '/workspace/?view=abbonamento';

    fetch('/api/payments/checkout/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': typeof getCSRFToken === 'function' ? getCSRFToken() : '',
        },
        body: JSON.stringify({ variant_id: piano.variantId, quantity: quantity, redirect_url: redirectUrl }),
    })
    .then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e.error || 'HTTP ' + r.status); }); })
    .then(function (data) {
        if (!data.url) {
            _checkoutInCorso = false;
            if (typeof setStatus === 'function') setStatus('idle', '');
            showToast('Errore: nessun URL checkout ricevuto.', 'error');
            return;
        }
        // Apri il checkout in un nuovo tab (evita problemi iframe/overlay)
        window.open(data.url, '_blank');
        _checkoutInCorso = false;
        if (typeof setStatus === 'function') setStatus('idle', '');
    })
    .catch(function (err) {
        _checkoutInCorso = false;
        if (typeof setStatus === 'function') setStatus('idle', '');
        showToast('❌ ' + err.message, 'error');
    });
}


// =============================================================================
// HELPER
// =============================================================================

function _escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}


// API pubbliche
window.renderAbbonamentoPanel = renderAbbonamentoPanel;