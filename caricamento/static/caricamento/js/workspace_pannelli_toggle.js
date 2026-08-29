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

        var ultimoPointerTouch = 0;

        function gestisciToggle(button, classe, target, lato) {
            var aperta = !page.classList.contains(classe);
            page.classList.toggle(classe, aperta);
            target.classList.toggle(classe, aperta);
            aggiornaManiglia(button, !aperta, lato);
            ridimensionaViewport();
        }

        function gestisciPointer(button, classe, target, lato, event) {
            if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
            event.preventDefault();
            event.stopPropagation();
            ultimoPointerTouch = Date.now();
            gestisciToggle(button, classe, target, lato);
        }

        left.addEventListener('pointerdown', function (event) {
            gestisciPointer(left, 'sidebar-collapsed', sidebar, 'sinistra', event);
        });
        left.addEventListener('click', function (event) {
            event.preventDefault();
            if (Date.now() - ultimoPointerTouch < 700) return;
            gestisciToggle(left, 'sidebar-collapsed', sidebar, 'sinistra');
        });


        right.addEventListener('pointerdown', function (event) {
            gestisciPointer(right, 'panel-destro-collapsed', panel, 'destra', event);
        });
        right.addEventListener('click', function (event) {
            event.preventDefault();
            if (Date.now() - ultimoPointerTouch < 700) return;
            gestisciToggle(right, 'panel-destro-collapsed', panel, 'destra');
        });


        /* Il click resta l'evento unico: evita il doppio toggle su touch. */

        aggiornaManiglia(left, true, 'sinistra');
        aggiornaManiglia(right, true, 'destra');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inizializza);
    } else {
        inizializza();
    }
}());
