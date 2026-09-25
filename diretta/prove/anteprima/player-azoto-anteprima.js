/* ============================================================
   IL PLAYER AZOTO DELL'ANTEPRIMA: un riquadro al posto dell'iframe
   ------------------------------------------------------------
   Nell'anteprima la pagina non puo' incorporare pagine di altri siti
   (la pagina che la ospita non lo permette, e la rete verso Azoto non
   c'e'): niente iframe del player di Azoto. Al suo posto questo
   riquadro «Player Azoto (anteprima)», con la STESSA interfaccia di
   diretta/player-azoto.js:

       window.NGBPlayerAzoto = { nome, crea(contenitore, opzioni), eAzoto(url) }
       istanza: carica(url, { titolo }), ricarica(), aggiornaTitolo(t),
                mostra(bool), distruggi(), stato(), capacita()

   costruisci.js lo mette al posto di player-azoto.js nelle pagine
   (come player-anteprima.js al posto di player-webtv.js). Cosi' la
   pagina della diretta e la gestione si vedono come sul sito: sotto il
   riquadro «Schermo intero» e la nota, i 15 secondi con «Ricarica il
   video», lo schermo intero (anche ruotato su iPhone).

   Come sul sito, l'indirizzo deve essere di Azoto (eAzoto, la regola di
   sorgente-video.js): altrimenti onErrore 'link'. Dopo un attimo arriva
   onPronto (il "load" dell'iframe vero); un indirizzo con /lento/ nel
   percorso non arriva mai, e dopo 15 secondi da' 'lento' (per vedere
   l'avviso e «Ricarica il video»). Il riquadro e' fatto con
   createElement e textContent: niente HTML costruito con i dati.
   ============================================================ */
(function () {
    'use strict';

    var ATTESA_PRONTO_MS = 15000;
    var HOST_RIPIEGO = ['cdn.azotosolutions.com'];

    function eAzoto(url) {
        var V = window.NGBSorgenteVideo;
        if (V && typeof V.eAzoto === 'function') {
            try { return V.eAzoto(url) === true; } catch (e) { return false; }
        }
        var u;
        try { u = new URL(String(url == null ? '' : url).trim()); } catch (e) { return false; }
        return u.protocol === 'https:' && !u.username && !u.password && u.port === '' && HOST_RIPIEGO.indexOf(u.hostname.toLowerCase()) >= 0;
    }

    // un pezzo del riquadro: un elemento con il suo stile e il suo testo
    function pezzo(tag, stile, testo) {
        var e = document.createElement(tag);
        e.style.cssText = stile;
        if (testo != null) e.textContent = testo;
        return e;
    }

    function crea(contenitore, opzioni) {
        opzioni = opzioni || {};
        var el = null;
        var url = '';
        var titolo = '';
        var statoCorrente = 'vuoto';
        var visibile = true;
        var distrutto = false;
        var timer = [];
        var generazione = 0;

        function avvisa(nome, dati) {
            var f = opzioni[nome];
            if (typeof f !== 'function') return;
            try { f(dati); } catch (e) { setTimeout(function () { throw e; }); }
        }
        function dopo(ms, fn) { timer.push(setTimeout(fn, ms)); }
        function togli() {
            timer.forEach(clearTimeout);
            timer = [];
            generazione++;
            if (el && el.parentNode) el.parentNode.removeChild(el);
            el = null;
        }
        function etichetta() { return 'Diretta: ' + (titolo || 'Next Generation Business'); }

        /* Il riquadro: come la pagina del player di Azoto, un 16:9 pieno con
           la sua barra dei comandi in fondo (finta: qui non c'e' un video). */
        function monta() {
            togli();
            var gen = generazione;
            var u = new URL(url);
            var r = pezzo('div', 'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;'
                + 'background:radial-gradient(ellipse at 50% 35%,#1f4d7a 0%,#0b2440 55%,#061526 100%);color:#fff;'
                + 'font-family:Inter,system-ui,sans-serif;overflow:hidden;');
            r.className = 'player-azoto-anteprima';
            r.setAttribute('role', 'group');
            r.setAttribute('aria-label', etichetta() + ' (player Azoto di prova)');
            r.setAttribute('title', etichetta());
            var centro = pezzo('div', 'flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:8px 14px;text-align:center;');
            var stato = pezzo('p', 'margin:0;font-size:clamp(11px,1.6vw,14px);font-weight:600;color:#9fc3e6;', 'Caricamento del player…');
            centro.appendChild(pezzo('p', 'margin:0;font-family:Montserrat,Inter,sans-serif;font-weight:800;font-size:clamp(16px,3vw,28px);', 'Player Azoto (anteprima)'));
            centro.appendChild(pezzo('p', 'margin:0;font-size:clamp(11px,1.5vw,14px);color:#c8daea;word-break:break-all;', u.hostname + u.pathname));
            centro.appendChild(stato);
            centro.appendChild(pezzo('p', 'margin:0;max-width:34em;font-size:clamp(10px,1.4vw,13px);color:#9fb7cf;', 'Sul sito qui c\'è il player di Azoto, con i suoi comandi (play, volume, qualità).'));
            r.appendChild(centro);
            // la barra dei comandi di Azoto, disegnata
            var barra = pezzo('div', 'flex:0 0 auto;display:flex;align-items:center;gap:12px;height:clamp(28px,7%,42px);padding:0 12px;background:rgba(0,0,0,.55);font-size:clamp(11px,1.5vw,14px);');
            barra.setAttribute('aria-hidden', 'true');
            barra.appendChild(pezzo('span', '', '▶'));
            barra.appendChild(pezzo('span', '', '🔊'));
            barra.appendChild(pezzo('span', 'padding:1px 6px;border-radius:3px;background:#c8102e;font-weight:700;font-size:.85em;letter-spacing:.06em;', 'LIVE'));
            barra.appendChild(pezzo('span', 'flex:1 1 auto;', ''));
            barra.appendChild(pezzo('span', '', '⛶'));
            r.appendChild(barra);
            el = r;
            statoCorrente = 'caricamento';
            contenitore.appendChild(r);
            // un indirizzo con /lento/: il player non arriva mai (per provare l'avviso dei 15 secondi)
            if (!/\/lento\//.test(u.pathname)) {
                dopo(600, function () {
                    if (distrutto || gen !== generazione) return;
                    stato.textContent = 'In diretta (prova)';
                    statoCorrente = 'pronto';
                    avvisa('onPronto');
                });
            }
            dopo(ATTESA_PRONTO_MS, function () {
                if (distrutto || gen !== generazione || statoCorrente !== 'caricamento') return;
                statoCorrente = 'lento';
                stato.textContent = 'Il player non risponde (prova)';
                avvisa('onErrore', { codice: 'lento', messaggio: 'Il player della diretta non risponde.' });
            });
        }

        function carica(indirizzo, opz) {
            if (distrutto) return;
            var testo = String(indirizzo == null ? '' : indirizzo).trim();
            if (opz && opz.titolo != null) titolo = String(opz.titolo).trim().slice(0, 200);
            if (!eAzoto(testo)) {
                togli();
                url = '';
                statoCorrente = 'link';
                avvisa('onErrore', { codice: 'link', messaggio: 'L\'indirizzo del player non è quello di Azoto.' });
                return;
            }
            url = new URL(testo).href;
            if (visibile) { monta(); return; }
            togli();
            statoCorrente = 'nascosto';
        }
        function ricarica() { if (!distrutto && url && visibile) monta(); }
        function aggiornaTitolo(t) {
            titolo = String(t == null ? '' : t).trim().slice(0, 200);
            if (el) {
                el.setAttribute('aria-label', etichetta() + ' (player Azoto di prova)');
                el.setAttribute('title', etichetta());
            }
        }
        function mostra(si) {
            si = !!si;
            if (distrutto || si === visibile) return;
            visibile = si;
            if (!si) { togli(); if (url) statoCorrente = 'nascosto'; return; }
            if (url) monta();
        }
        function distruggi() { distrutto = true; togli(); url = ''; statoCorrente = 'vuoto'; }

        return {
            carica: carica, ricarica: ricarica, aggiornaTitolo: aggiornaTitolo, mostra: mostra, distruggi: distruggi,
            stato: function () { return statoCorrente; },
            capacita: function () { return { comandi: false, qualita: false, dvr: false }; }
        };
    }

    window.NGBPlayerAzoto = { nome: 'azoto-anteprima', crea: crea, eAzoto: eAzoto };
})();
