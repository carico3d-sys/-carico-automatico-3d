/** Toggle delle barre laterali, con maniglie sempre nel viewport 3D. */
(function () {
    'use strict';

    function aggiornaManiglia(button, aperta, lato) {
        if (!button) return;
        button.setAttribute('aria-expanded', String(aperta));
        button.title = (aperta ? 'Nascondi' : 'Mostra') + ' barra ' + lato;
        button.setAttribute('aria-label', button.title);
        var icon = button.querySelector('i');
        if (icon) {
            icon.className = lato === 'sinistra'
                ? (aperta ? 'bi bi-chevron-left' : 'bi bi-chevron-right')
                : (aperta ? 'bi bi-chevron-right' : 'bi bi-chevron-left');
        }
    }

    function ridimensionaViewport() {
        window.dispatchEvent(new Event('resize'));
    }

    function inizializza() {
        var page = document.getElementById('page');
        var sidebar = document.getElementById('sidebar');
        var panel = document.getElementById('panel-destro');
        var left = document.getElementById('toggle-sidebar-btn');
        var right = document.getElementById('toggle-panel-destro-btn');
        if (!page || !sidebar || !panel || !left || !right) return;

        left.addEventListener('click', function () {
            var aperta = !page.classList.contains('sidebar-collapsed');
            page.classList.toggle('sidebar-collapsed', aperta);
            sidebar.classList.toggle('sidebar-collapsed', aperta);
            aggiornaManiglia(left, !aperta, 'sinistra');
            ridimensionaViewport();
        });

        right.addEventListener('click', function () {
            var aperta = !page.classList.contains('panel-destro-collapsed');
            page.classList.toggle('panel-destro-collapsed', aperta);
            panel.classList.toggle('panel-destro-collapsed', aperta);
            aggiornaManiglia(right, !aperta, 'destra');
            ridimensionaViewport();
        });

        aggiornaManiglia(left, true, 'sinistra');
        aggiornaManiglia(right, true, 'destra');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inizializza);
    } else {
        inizializza();
    }
}());
