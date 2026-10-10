/**
 * Formato di stampa e PDF comune a tutte le pagine del sito.
 * ----------------------------------------------------------------------
 * Si attiva quando si stampa o si salva in PDF (Ctrl+P, menu del browser
 * o un pulsante con l'attributo data-stampa). Al momento della stampa:
 *
 *  - avvolge la pagina in una tabella la cui intestazione (logo Revilaw e
 *    titolo della pagina) il browser ripete in cima a ogni foglio;
 *  - scrive nel margine in basso l'indirizzo della pagina (il numero di
 *    pagina lo mette assets/stampa.css);
 *  - aggiunge in fondo un blocco di chiusura con i recapiti di Revilaw e
 *    la data di stampa.
 *
 * Finita la stampa rimette la pagina com'era. Gli stili sono in
 * assets/stampa.css, caricato con media="print".
 */
(function () {
    'use strict';

    var LOGO = '/assets/logo-revilaw.png';
    var preparata = false;
    var tabella = null;
    var corpo = null;
    var stileMargini = null;

    function meta(sel) {
        var el = document.querySelector(sel);
        return el ? (el.getAttribute('content') || el.getAttribute('href') || '') : '';
    }

    function titolo() {
        var t = meta('meta[property="og:title"]') || document.title || '';
        t = t.replace(/\s*\|\s*Revilaw\s*$/i, '').trim();
        return t.length > 95 ? t.slice(0, 92).replace(/\s+\S*$/, '') + '...' : t;
    }

    function indirizzo() {
        var u = meta('link[rel="canonical"]') || location.href;
        return u.replace(/^https?:\/\//, '').replace(/[?#].*$/, '').replace(/\/$/, '');
    }

    function oggi() {
        try {
            return new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
        } catch (e) {
            return new Date().toISOString().slice(0, 10);
        }
    }

    function cssStringa(s) {
        return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    }

    function el(tag, cls, testo) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (testo) e.textContent = testo;
        return e;
    }

    function prepara() {
        if (preparata || !document.body) return;
        preparata = true;
        document.documentElement.classList.add('in-stampa');

        stileMargini = el('style');
        stileMargini.textContent = '@page { @bottom-left { content: ' + cssStringa(indirizzo()) + '; } }';
        document.head.appendChild(stileMargini);

        // Intestazione ripetuta su ogni foglio
        tabella = el('table', 'stampa-impaginato');
        var thead = el('thead');
        var trH = el('tr');
        var tdH = el('td');
        var testata = el('div', 'stampa-testata');
        var logo = el('img');
        logo.src = LOGO;
        logo.alt = 'Revilaw S.p.A.';
        testata.appendChild(logo);
        testata.appendChild(el('span', 'stampa-testata-titolo', titolo()));
        tdH.appendChild(testata);
        trH.appendChild(tdH);
        thead.appendChild(trH);

        var tbody = el('tbody');
        var trB = el('tr');
        corpo = el('td', 'stampa-corpo');
        trB.appendChild(corpo);
        tbody.appendChild(trB);
        tabella.appendChild(thead);
        tabella.appendChild(tbody);

        // Sposta il contenuto della pagina dentro la tabella
        while (document.body.firstChild) corpo.appendChild(document.body.firstChild);

        // Chiusura con recapiti e data di stampa
        var chiusura = el('div', 'stampa-chiusura');
        var logoC = el('img');
        logoC.src = LOGO;
        logoC.alt = '';
        chiusura.appendChild(logoC);
        var testo = el('div', 'stampa-chiusura-testo');
        testo.appendChild(el('strong', '', 'Revilaw S.p.A., società di revisione legale'));
        testo.appendChild(el('span', '', 'Via XX Settembre, 9, 37129 Verona. Telefono 045 8010734. info@nextgenerationbusiness.it'));
        testo.appendChild(el('span', '', 'Documento stampato il ' + oggi() + ' dalla pagina ' + indirizzo() + '. Contenuti a scopo informativo, che non sostituiscono un parere professionale.'));
        chiusura.appendChild(testo);
        corpo.appendChild(chiusura);

        document.body.appendChild(tabella);
    }

    function ripristina() {
        if (!preparata) return;
        preparata = false;
        var chiusura = corpo && corpo.querySelector('.stampa-chiusura');
        if (chiusura) chiusura.parentNode.removeChild(chiusura);
        if (corpo) {
            while (corpo.firstChild) document.body.insertBefore(corpo.firstChild, tabella);
        }
        if (tabella && tabella.parentNode) tabella.parentNode.removeChild(tabella);
        if (stileMargini && stileMargini.parentNode) stileMargini.parentNode.removeChild(stileMargini);
        tabella = corpo = stileMargini = null;
        document.documentElement.classList.remove('in-stampa');
    }

    window.addEventListener('beforeprint', prepara);
    window.addEventListener('afterprint', ripristina);
    // Safari non sempre invia beforeprint: segue anche il cambio di media.
    if (window.matchMedia) {
        var mql = window.matchMedia('print');
        var segui = function (e) { if (e.matches) prepara(); else ripristina(); };
        if (mql.addEventListener) mql.addEventListener('change', segui);
        else if (mql.addListener) mql.addListener(segui);
    }

    // Qualunque pulsante con data-stampa apre la stampa nel formato del sito.
    document.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-stampa]') : null;
        if (!b) return;
        e.preventDefault();
        prepara();
        window.print();
    });

    window.NGBStampa = { prepara: prepara, ripristina: ripristina };
})();
