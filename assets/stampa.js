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
 *
 * Aggiunge inoltre un pulsante fisso "Scarica il PDF" in basso a sinistra,
 * solo sulle pagine di articolo (og:type "article").
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

    // ---- Pulsante "Scarica il PDF" sulle pagine di articolo ----
    // Compare solo sulle pagine marcate come articolo (meta og:type "article"):
    // gli approfondimenti. Non compare su home, chi siamo, eventi, interviste,
    // mappa degli approfondimenti e pagine di servizio. Una pagina puo' forzare
    // la scelta con <meta name="ngb-pdf" content="si"> oppure content="no".
    function pulsanteAmmesso() {
        var scelta = document.querySelector('meta[name="ngb-pdf"]');
        if (scelta) return (scelta.getAttribute('content') || '').toLowerCase() !== 'no';
        return meta('meta[property="og:type"]').toLowerCase() === 'article';
    }

    function aggiungiPulsante() {
        if (!pulsanteAmmesso() || document.querySelector('.ngb-pdf-pulsante')) return;
        var stile = el('style');
        stile.textContent = [
            '.ngb-pdf-pulsante{position:fixed;left:20px;bottom:20px;z-index:9990;',
            'display:inline-flex;align-items:center;gap:9px;padding:11px 18px 11px 15px;',
            'border:1.5px solid rgba(255,255,255,.55);border-radius:999px;background:#164068;color:#fff;',
            "font:600 14px/1.1 'Inter',-apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.1px;",
            'cursor:pointer;box-shadow:0 10px 26px rgba(10,25,45,.28),0 2px 6px rgba(10,25,45,.18);',
            'transition:background .15s,transform .15s,box-shadow .15s;}',
            '.ngb-pdf-pulsante:hover{background:#0f2f4f;transform:translateY(-1px);',
            'box-shadow:0 14px 30px rgba(10,25,45,.32),0 3px 8px rgba(10,25,45,.2);}',
            '.ngb-pdf-pulsante:focus-visible{outline:2px solid #8bb8d4;outline-offset:3px;}',
            '.ngb-pdf-pulsante svg{width:18px;height:18px;flex:none;}',
            '@media (max-width:640px){.ngb-pdf-pulsante{left:14px;bottom:14px;width:48px;height:48px;',
            'padding:0;justify-content:center;}.ngb-pdf-pulsante span{position:absolute;width:1px;height:1px;',
            'overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}}',
            '@media print{.ngb-pdf-pulsante{display:none!important;}}'
        ].join('');
        document.head.appendChild(stile);

        var b = el('button', 'ngb-pdf-pulsante');
        b.type = 'button';
        b.setAttribute('data-stampa', '');
        b.setAttribute('aria-label', 'Scarica questa pagina in PDF');
        b.title = 'Scarica questa pagina in PDF: nella finestra di stampa scegli "Salva come PDF"';
        b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/>' +
            '<path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
        b.appendChild(el('span', '', 'Scarica il PDF'));
        document.body.appendChild(b);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aggiungiPulsante);
    else aggiungiPulsante();

    window.NGBStampa = { prepara: prepara, ripristina: ripristina };
})();
