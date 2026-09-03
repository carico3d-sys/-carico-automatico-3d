/* Ridimensionamento pannelli lista/form dell'anagrafica.
   Le larghezze vengono salvate sia in localStorage (fallback) sia
   nel profilo utente (impostazioni_ottimizzatore.panel_widths) per
   essere persistenti tra sessioni e dispositivi. */
(function () {
    'use strict';

    var STORAGE_PREFIX = 'carico3d-pv-list-width-';
    var MIN_LIST_PX = 220;
    var MIN_FORM_PX = 360;
    var SAVE_DEBOUNCE_MS = 500;
    var split;
    var list;
    var resizer;
    var currentView = '';
    var dragging = false;
    var dragOriginX = 0;
    var dragOriginWidth = 0;
    var _saveTimer = null;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function applyWidth(width) {
        if (!split || !list) return;
        var total = split.getBoundingClientRect().width;
        var max = Math.max(MIN_LIST_PX, total - MIN_FORM_PX);
        var px = clamp(width, MIN_LIST_PX, max);
        split.classList.add('pv-resizable');
        split.style.setProperty('--pv-list-width', px + 'px');
    }

    function move(clientX) {
        if (!dragging) return;
        applyWidth(dragOriginWidth + clientX - dragOriginX);
    }

    /* Salva la larghezza: localStorage immediato + server debounce */
    function saveWidth() {
        if (!list || !currentView) return;
        var px = Math.round(list.getBoundingClientRect().width);
        localStorage.setItem(STORAGE_PREFIX + currentView, String(px));
        // Aggiorna IMPOSTAZIONI in memoria
        if (typeof IMPOSTAZIONI !== 'undefined') {
            if (!IMPOSTAZIONI.panel_widths) IMPOSTAZIONI.panel_widths = {};
            IMPOSTAZIONI.panel_widths[currentView] = px;
        }
        // Salva sul server (debounce)
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(_salvaLarghezzeServer, SAVE_DEBOUNCE_MS);
    }

    function _salvaLarghezzeServer() {
        if (typeof IMPOSTAZIONI === 'undefined' || !IMPOSTAZIONI.panel_widths) return;
        try {
            var payload = { panel_widths: IMPOSTAZIONI.panel_widths };
            fetch('/api/impostazioni_ottimizzatore/', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': _getCSRF() },
                body: JSON.stringify(payload)
            }).catch(function () {});
        } catch (e) { /* silent */ }
    }

    function _getCSRF() {
        var v = '';
        document.cookie.split(';').forEach(function (c) {
            c = c.trim();
            if (c.startsWith('csrftoken=')) v = c.substring(10);
        });
        return v;
    }

    function stop() {
        if (!dragging) return;
        dragging = false;
        resizer.classList.remove('dragging');
        document.body.classList.remove('pv-resizing');
        saveWidth();
    }

    function init() {
        split = document.getElementById('panel-view-split');
        list = document.getElementById('panel-view-list');
        resizer = document.getElementById('pv-panel-resizer');
        if (!split || !list || !resizer) return;
        currentView = split.closest('#panel-view')?.dataset.view || 'default';
        if (resizer.dataset.ready === currentView) return;
        resizer.dataset.ready = currentView;

        currentView = split.closest('#panel-view')?.dataset.view || 'default';
        // Priorità: server (IMPOSTAZIONI) > localStorage > default
        var saved = null;
        if (typeof IMPOSTAZIONI !== 'undefined' && IMPOSTAZIONI.panel_widths && IMPOSTAZIONI.panel_widths[currentView]) {
            saved = IMPOSTAZIONI.panel_widths[currentView];
        } else {
            saved = parseFloat(localStorage.getItem(STORAGE_PREFIX + currentView));
        }
        if (Number.isFinite(saved)) {
            applyWidth(saved);
            requestAnimationFrame(function () { applyWidth(saved); });
        }

        resizer.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            dragging = true;
            resizer.classList.add('dragging');
            document.body.classList.add('pv-resizing');
            dragOriginX = e.clientX;
            dragOriginWidth = list.getBoundingClientRect().width;
            resizer.setPointerCapture && resizer.setPointerCapture(e.pointerId);
        });
        resizer.addEventListener('pointermove', function (e) { move(e.clientX); });
        resizer.addEventListener('pointerup', stop);
        resizer.addEventListener('pointercancel', stop);
        resizer.addEventListener('keydown', function (e) {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            applyWidth(list.getBoundingClientRect().width + (e.key === 'ArrowRight' ? 20 : -20));
            saveWidth();
        });

        window.addEventListener('resize', function () {
            if (!dragging) applyWidth(list.getBoundingClientRect().width);
        });
    }

    /* Funzione globale per applicare la larghezza dal server */
    window._applicaPanelWidth = function (view, px) {
        if (currentView !== view || !Number.isFinite(px)) return;
        applyWidth(px);
        requestAnimationFrame(function () { applyWidth(px); });
    };

    document.addEventListener('DOMContentLoaded', init);
    document.addEventListener('carico3d:panel-rendered', init);
})();
