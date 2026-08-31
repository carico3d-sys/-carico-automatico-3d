/* Ridimensionamento pannelli lista/form dell'anagrafica. */
(function () {
    'use strict';

    var STORAGE_PREFIX = 'carico3d-pv-list-width-';
    var MIN_LIST_PX = 220;
    var MIN_FORM_PX = 360;
    var split;
    var list;
    var resizer;
    var currentView = '';
    var dragging = false;
    var dragOriginX = 0;
    var dragOriginWidth = 0;

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

    function stop() {
        if (!dragging) return;
        dragging = false;
        resizer.classList.remove('dragging');
        document.body.classList.remove('pv-resizing');
        localStorage.setItem(STORAGE_PREFIX + currentView, String(Math.round(list.getBoundingClientRect().width)));
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
        var saved = parseFloat(localStorage.getItem(STORAGE_PREFIX + currentView));
        if (Number.isFinite(saved)) applyWidth(saved);

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
            localStorage.setItem(STORAGE_PREFIX + currentView, String(Math.round(list.getBoundingClientRect().width)));
        });

        window.addEventListener('resize', function () {
            if (!dragging) applyWidth(list.getBoundingClientRect().width);
        });
    }

    document.addEventListener('DOMContentLoaded', init);
    document.addEventListener('carico3d:panel-rendered', init);
})();
