/**
 * Workspace Spaziatura Bar — Slider per regolare la spaziatura visiva tra oggetti.
 *
 * Comportamento:
 *  1° click sul pulsante 📏 della palette → la barra slider appare nella sidebar
 *      sopra il quadrante camion. Lo slider controlla la % (70–100) in tempo reale.
 *  2° click → la barra scompare E la spaziatura torna al 100%.
 *
 * Depends on: _applicaSpaziatura() definita in visualizzatore_3d.js,
 *              STATE.spaziatura definito in visualizzatore_3d_core.js.
 */

var SPZ = (function () {

    var attivo = false;
    var _initialized = false;

    function _getBar()     { return document.getElementById('sidebar-spaziatura-bar'); }
    function _getSlider()  { return document.getElementById('spaziatura-slider'); }
    function _getPct()     { return document.getElementById('spaziatura-pct'); }
    function _getBtn()     { return document.getElementById('vpf-btn-spaziatura'); }

    /**
     * Inizializza la barra slider (chiamata una volta al DOM ready).
     */
    function init() {
        if (_initialized) return;
        _initialized = true;

        var slider = _getSlider();
        if (!slider) return;

        slider.addEventListener('input', function () {
            var val = parseInt(slider.value, 10);
            _aggiornaLabel(val);
            if (typeof _applicaSpaziatura === 'function') {
                _applicaSpaziatura(val);
            }
        });
    }

    function _aggiornaLabel(val) {
        var pct = _getPct();
        if (pct) {
            pct.textContent = val + '%';
            pct.style.color = val === 100 ? '#447e9b' : '#f39c12';
        }
    }

    /**
     * Sincronizza lo slider con STATE.spaziatura corrente (chiamato dall'esterno
     * quando la spaziatura cambia via tastiera/rotella).
     */
    function sync() {
        if (!attivo) return;
        var slider = _getSlider();
        if (!slider) return;
        var val = (typeof STATE !== 'undefined') ? STATE.spaziatura : 100;
        slider.value = val;
        _aggiornaLabel(val);
    }

    /**
     * Mostra la barra slider.
     */
    function _mostra() {
        var bar = _getBar();
        var slider = _getSlider();
        if (!bar || !slider) return;

        var val = (typeof STATE !== 'undefined') ? STATE.spaziatura : 100;
        slider.value = val;
        _aggiornaLabel(val);

        bar.classList.add('visible');
        attivo = true;

        var btn = _getBtn();
        if (btn) btn.classList.add('active');
    }

    /**
     * Nasconde la barra slider e resetta la spaziatura al 100%.
     */
    function _nascondi() {
        var bar = _getBar();
        if (bar) bar.classList.remove('visible');

        // Reset spaziatura al 100% PRIMA di cambiare attivo
        if (typeof _applicaSpaziatura === 'function') {
            _applicaSpaziatura(100);
        }

        attivo = false;

        var btn = _getBtn();
        if (btn) btn.classList.remove('active');
    }

    /**
     * Toggle: chiamato dal click sul pulsante 📏 della palette.
     */
    function toggle() {
        if (attivo) {
            _nascondi();
        } else {
            _mostra();
        }
    }

    return {
        init: init,
        toggle: toggle,
        sync: sync,
        get attivo() { return attivo; }
    };

})();
