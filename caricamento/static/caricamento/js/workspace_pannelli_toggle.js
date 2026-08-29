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

    function posizionaManiglie() {
        var sidebar = document.getElementById('sidebar');
        var panel = document.getElementById('panel-destro');
        var left = document.getElementById('toggle-sidebar-btn');
        var right = document.getElementById('toggle-panel-destro-btn');
        if (!sidebar || !panel || !left || !right) return;

        var sidebarRect = sidebar.getBoundingClientRect();
        var panelRect = panel.getBoundingClientRect();
        // Ancoriamo direttamente le maniglie ai bordi reali delle colonne.
        left.style.left = sidebarRect.right + 'px';
        right.style.left = 'auto';
        right.style.right = (window.innerWidth - panelRect.left) + 'px';

    }

    function ridimensionaViewport() {
        posizionaManiglie();
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(posizionaManiglie);
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
            event.stopImmediatePropagation();
            ultimoPointerTouch = Date.now();
            gestisciToggle(button, classe, target, lato);
        }

        left.addEventListener('pointerup', function (event) {
            gestisciPointer(left, 'sidebar-collapsed', sidebar, 'sinistra', event);
        });
        left.addEventListener('touchend', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            ultimoPointerTouch = Date.now();
            gestisciToggle(left, 'sidebar-collapsed', sidebar, 'sinistra');
        }, { passive: false });
        left.addEventListener('pointerdown', function (event) {
            gestisciPointer(left, 'sidebar-collapsed', sidebar, 'sinistra', event);
        });
        left.addEventListener('click', function (event) {
            event.preventDefault();
            if (Date.now() - ultimoPointerTouch < 700) return;
            gestisciToggle(left, 'sidebar-collapsed', sidebar, 'sinistra');
        });


        right.addEventListener('pointerup', function (event) {
            gestisciPointer(right, 'panel-destro-collapsed', panel, 'destra', event);
        });
        right.addEventListener('touchend', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            ultimoPointerTouch = Date.now();
            gestisciToggle(right, 'panel-destro-collapsed', panel, 'destra');
        }, { passive: false });
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
        posizionaManiglie();
        window.addEventListener('resize', posizionaManiglie);
        window.addEventListener('orientationchange', function () {
            setTimeout(posizionaManiglie, 50);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inizializza);
    } else {
        inizializza();
    }
}());
