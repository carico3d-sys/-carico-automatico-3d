/* Selettore lingua dell'interfaccia. */
(function () {
    'use strict';

    var linguaSalvata = window.localStorage.getItem('carico3d-language') || 'it';
    var linguaCorrente = 'it';

    function traduci(key, fallback, lingua) {
        var dizionario = window.DIZIONARIO && window.DIZIONARIO[lingua];
        return (dizionario && dizionario[key]) || fallback;
    }

    function aggiornaHeader(lingua) {
        var labels = document.querySelectorAll('#header-categories .header-cat-btn');
        labels.forEach(function (button) {
            var label = button.querySelector('.header-cat-label');
            if (!label) return;
            var cat = button.dataset.cat;
            var key = 'header.' + ({
                documenti: 'documenti',
                anagrafica: 'anagrafica',
                'goto-manuale': 'manuale',
                'goto-automatica': 'auto',
                'toggle-vista': 'vista',
                report: 'report',
                sistema: 'sistema'
            }[cat] || cat);
            label.textContent = traduci(key, label.dataset.italiano || label.textContent, lingua);
        });

        [['#header-logout', 'header.esci'], ['#header-logout-full', 'header.logout']].forEach(function (entry) {
            var link = document.querySelector(entry[0]);
            if (!link) return;
            var testo = link.querySelector('.language-label');
            if (!testo) return;
            testo.textContent = traduci(entry[1], testo.dataset.italiano || testo.textContent, lingua);
        });
    }

    function aggiornaSidebar(lingua) {
        var mappa = {
            documenti: 'sidebar.documenti',
            anagrafica: 'sidebar.anagrafica',
            manuale: 'sidebar.manuale',
            automatica: 'sidebar.automatica'
        };
        document.querySelectorAll('#sidebar-tabs .sidebar-tab').forEach(function (tab) {
            var label = tab.querySelector('.sidebar-tab-label');
            if (!label) return;
            var key = mappa[tab.dataset.tab];
            if (key) label.textContent = traduci(key, label.dataset.italiano || label.textContent, lingua);
        });
    }

    function aggiornaElementiTraducibili(root, lingua) {
        var base = root || document;
        base.querySelectorAll('[data-translation-key]').forEach(function (element) {
            var fallback = element.dataset.italiano || element.textContent.trim();
            var testo = traduci(element.dataset.translationKey, fallback, lingua);
            if (element.tagName === 'INPUT') element.placeholder = testo;
            else if (element.tagName === 'OPTION') element.textContent = testo;
            else element.textContent = testo;
        });
    }

    function aggiornaPannelloDestro(lingua) {
        document.querySelectorAll('#panel-destro [data-translation-key]').forEach(function (element) {
            var testo = element.dataset.italiano || element.textContent;
            var tradotto = traduci(element.dataset.translationKey, testo, lingua);
            if (element.tagName === 'INPUT') element.placeholder = tradotto;
            else if (element.tagName === 'OPTION') element.textContent = tradotto;
            else element.textContent = tradotto;
        });
    }

    function aggiornaRiepilogo(lingua) {
        document.querySelectorAll('#sidebar-riepilogo [data-translation-key]').forEach(function (element) {
            element.textContent = traduci(element.dataset.translationKey, element.dataset.italiano || element.textContent, lingua);
        });
    }

    function aggiornaTestiAuto(lingua) {
        document.querySelectorAll('#sidebar-auto-panel [data-translation-key]').forEach(function (element) {
            element.textContent = traduci(element.dataset.translationKey, element.dataset.italiano || element.textContent.trim(), lingua);
        });
    }

    function aggiornaMenuSidebar(lingua) {
        document.querySelectorAll('#sidebar-nav-dynamic [data-translation-key], #sidebar-anagrafica-dynamic [data-translation-key], #sidebar-nav-dynamic [data-view="impostazioni"]').forEach(function (item) {
            var label = item.querySelector('.language-label');
            if (!label) return;
            var key = item.dataset.translationKey || 'sidebar.impostazioni';
            label.textContent = traduci(key, label.dataset.italiano || label.textContent, lingua);
        });
        var mappa = {
            oggetti: 'sidebar.oggetti',
            vincoli: 'sidebar.vincoli',
            mezzi: 'sidebar.trasporti'
        };
        document.querySelectorAll('#sidebar-anagrafica-dynamic [data-view]').forEach(function (item) {
            var label = item.querySelector('.language-label');
            var key = mappa[item.dataset.view];
            if (label && key) label.textContent = traduci(key, label.dataset.italiano || label.textContent, lingua);
        });
    }

    function aggiornaMenuDocumenti(lingua) {
        aggiornaMenuSidebar(lingua);
    }

    function aggiornaLingua(lingua) {
        linguaCorrente = lingua === 'en' ? 'en' : 'it';
        document.querySelectorAll('.language-btn').forEach(function (button) {
            var attivo = button.dataset.language === linguaCorrente;
            button.classList.toggle('active', attivo);
            button.setAttribute('aria-pressed', attivo ? 'true' : 'false');
        });
        document.documentElement.lang = linguaCorrente;
        window.CARICO3D_LANGUAGE = linguaCorrente;
        window.localStorage.setItem('carico3d-language', linguaCorrente);
        aggiornaHeader(linguaCorrente);
        aggiornaSidebar(linguaCorrente);
        aggiornaMenuSidebar(linguaCorrente);
        aggiornaTestiAuto(linguaCorrente);
        aggiornaRiepilogo(linguaCorrente);
        aggiornaElementiTraducibili(document.getElementById('panel-view'), linguaCorrente);
        aggiornaPannelloDestro(linguaCorrente);
        aggiornaElementiTraducibili(document.getElementById('panel-view'), linguaCorrente);
        if (typeof _applyButtonConfig === 'function') _applyButtonConfig(true);
        document.dispatchEvent(new CustomEvent('carico3d:language-change', {
            detail: { language: linguaCorrente }
        }));
    }

    document.addEventListener('carico3d:sidebar-rendered', function () {
        aggiornaMenuSidebar(linguaCorrente);
        aggiornaTestiAuto(linguaCorrente);
        aggiornaRiepilogo(linguaCorrente);
        aggiornaElementiTraducibili(document.getElementById('panel-view'), linguaCorrente);
        aggiornaPannelloDestro(linguaCorrente);
        aggiornaElementiTraducibili(document.getElementById('panel-view'), linguaCorrente);
    });

    document.addEventListener('carico3d:panel-rendered', function () {
        aggiornaElementiTraducibili(document.getElementById('panel-view'), linguaCorrente);
        aggiornaMenuSidebar(linguaCorrente);
        aggiornaTestiAuto(linguaCorrente);
        aggiornaPannelloDestro(linguaCorrente);
    });

    document.addEventListener('click', function (event) {
        var button = event.target.closest('.language-btn');
        if (button) aggiornaLingua(button.dataset.language);
    });

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('#header-categories .header-cat-label, #sidebar-tabs .sidebar-tab-label').forEach(function (label) {
            label.dataset.italiano = label.textContent.trim();
        });
        aggiornaLingua(linguaSalvata);
    });
})();
