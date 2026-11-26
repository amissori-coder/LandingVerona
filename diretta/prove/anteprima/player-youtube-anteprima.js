/* ============================================================
   IL PLAYER YOUTUBE DELL'ANTEPRIMA: la registrazione disegnata
   ------------------------------------------------------------
   Nell'anteprima la pagina non puo' incorporare YouTube (la pagina che
   la ospita non lo permette, e la rete verso YouTube non c'e'). Al posto
   di diretta/player-youtube.js questo riquadro «Registrazione YouTube
   (anteprima)», con la STESSA interfaccia:

       window.NGBPlayerYouTube = { nome, crea(contenitore, opzioni) }
       istanza: carica(url, { titolo }), ricarica(), aggiornaTitolo(t),
                mostra(bool), distruggi(), stato(), capacita(),
                attivaAudio(), muto(), smuto(), volume(n), eMuto(),
                volumeAttuale(), avvia(), sincronizza()

   Il riquadro mostra il PUNTO DELLA REGISTRAZIONE che chiede la pagina
   (opzioni.posizione(), lo stesso che il player vero manda a YouTube):
   aprendo due partecipanti si vede che sono allo stesso punto, che con
   «Pausa» della regia il tempo si ferma e con «In onda» riparte da li'.
   Niente link, titolo o comandi di YouTube, come sul sito.

   Come sul sito, l'indirizzo deve essere un video di YouTube (idYouTube
   di sorgente-video.js): altrimenti onErrore 'link'. Dopo un attimo
   onStato 'video' e onPronto. Il riquadro e' fatto con createElement e
   textContent: niente HTML costruito con i dati.
   ============================================================ */
(function () {
    'use strict';

    function idDi(url) {
        var V = window.NGBSorgenteVideo;
        if (!V || typeof V.idYouTube !== 'function') return '';
        try { return V.idYouTube(url) || ''; } catch (e) { return ''; }
    }
    function pezzo(tag, stile, testo) {
        var e = document.createElement(tag);
        e.style.cssText = stile;
        // come le schermate centrate della diretta: niente giustificato del sito (assets/testo.css)
        if (tag === 'p') { e.style.setProperty('text-align', 'center', 'important'); e.style.setProperty('hyphens', 'manual', 'important'); }
        if (testo != null) e.textContent = testo;
        return e;
    }
    function orologio(s) {
        s = Math.max(0, Math.floor(s));
        var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
        var dd = function (n) { return (n < 10 ? '0' : '') + n; };
        return (h ? h + ':' + dd(m) : m) + ':' + dd(x);
    }

    function crea(contenitore, opzioni) {
        opzioni = opzioni || {};
        var el = null, tempo = null, nota = null;
        var url = '', titolo = '';
        var statoCorrente = 'vuoto';
        var visibile = true, distrutto = false;
        var timer = [], giro = null, generazione = 0;
        var audio = { muto: true, volume: 100 };

        function avvisa(nome, dati) {
            var f = opzioni[nome];
            if (typeof f !== 'function') return;
            try { f(dati); } catch (e) { setTimeout(function () { throw e; }); }
        }
        function cambiaStato(s) { if (statoCorrente !== s) { statoCorrente = s; avvisa('onStato', s); } }
        function posizione() {
            var f = opzioni.posizione, p = null;
            try { p = typeof f === 'function' ? f() : null; } catch (e) { p = null; }
            return typeof p === 'number' && isFinite(p) ? Math.max(0, p) : null;
        }
        function togli() {
            timer.forEach(clearTimeout);
            timer = [];
            clearInterval(giro); giro = null;
            generazione++;
            if (el && el.parentNode) el.parentNode.removeChild(el);
            el = tempo = nota = null;
        }
        function etichetta() { return 'Diretta: ' + (titolo || 'Next Generation Business'); }
        function disegna() {
            if (!tempo) return;
            var p = posizione();
            tempo.textContent = p == null ? '–:––' : orologio(p);
            nota.textContent = audio.muto ? 'Audio disattivato (prova)' : 'Audio attivo, volume ' + audio.volume + ' (prova)';
        }

        function monta() {
            togli();
            var gen = generazione;
            var r = pezzo('div', 'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;'
                + 'padding:8px 14px;text-align:center;background:radial-gradient(ellipse at 50% 35%,#3a1f4d 0%,#1d0b33 55%,#0d0618 100%);color:#fff;'
                + 'font-family:Inter,system-ui,sans-serif;overflow:hidden;');
            r.className = 'player-youtube-anteprima';
            r.setAttribute('role', 'img');
            r.setAttribute('aria-label', etichetta() + ' (registrazione di prova)');
            r.appendChild(pezzo('p', 'margin:0;font-family:Montserrat,Inter,sans-serif;font-weight:800;font-size:clamp(15px,2.8vw,26px);', 'Registrazione YouTube (anteprima)'));
            r.appendChild(pezzo('p', 'margin:0;font-size:clamp(11px,1.5vw,14px);color:#d9c8ea;', 'Punto della registrazione, uguale per tutti:'));
            tempo = pezzo('p', 'margin:0;font-family:Montserrat,Inter,sans-serif;font-weight:800;font-size:clamp(30px,8vw,64px);font-variant-numeric:tabular-nums;letter-spacing:.02em;', '–:––');
            r.appendChild(tempo);
            nota = pezzo('p', 'margin:0;font-size:clamp(10px,1.4vw,13px);color:#c9b7dd;', '');
            r.appendChild(nota);
            r.appendChild(pezzo('p', 'margin:0;max-width:36em;font-size:clamp(10px,1.4vw,13px);color:#b7a6cc;',
                'Sul sito qui c\'è il video di YouTube senza barra, titolo, logo o link di YouTube: chi entra tardi lo vede dal punto giusto, «Pausa» della regia lo ferma.'));
            el = r;
            contenitore.appendChild(r);
            cambiaStato('caricamento');
            disegna();
            giro = setInterval(disegna, 250);
            timer.push(setTimeout(function () {
                if (distrutto || gen !== generazione) return;
                cambiaStato('video');
                avvisa('onPronto');
            }, 600));
        }

        function carica(indirizzo, opz) {
            if (distrutto) return;
            if (opz && opz.titolo != null) titolo = String(opz.titolo).trim().slice(0, 200);
            if (!idDi(String(indirizzo == null ? '' : indirizzo).trim())) {
                togli();
                url = '';
                statoCorrente = 'link';
                avvisa('onErrore', { codice: 'link', messaggio: 'L\'indirizzo non è un video di YouTube.' });
                return;
            }
            url = String(indirizzo).trim();
            if (visibile) { monta(); return; }
            togli();
            statoCorrente = 'nascosto';
        }
        function ricarica() { if (!distrutto && url && visibile) monta(); }
        function aggiornaTitolo(t) {
            titolo = String(t == null ? '' : t).trim().slice(0, 200);
            if (el) el.setAttribute('aria-label', etichetta() + ' (registrazione di prova)');
        }
        function mostra(si) {
            si = !!si;
            if (distrutto || si === visibile) return;
            visibile = si;
            if (!si) { togli(); if (url) statoCorrente = 'nascosto'; return; }
            if (url) monta();
        }
        function distruggi() { distrutto = true; togli(); url = ''; statoCorrente = 'vuoto'; }
        function cambiaAudio(muto, volume) {
            audio = { muto: !!muto, volume: Math.max(0, Math.min(100, Math.round(Number(volume) || 0))) };
            disegna();
            avvisa('onAudio', { muto: audio.muto, volume: audio.volume });
        }

        return {
            carica: carica, ricarica: ricarica, aggiornaTitolo: aggiornaTitolo, mostra: mostra, distruggi: distruggi,
            stato: function () { return statoCorrente; },
            capacita: function () { return { comandi: true, qualita: false, dvr: false, audio: true }; },
            attivaAudio: function () { if (el) cambiaAudio(false, audio.volume || 100); },
            muto: function () { if (el) cambiaAudio(true, audio.volume); },
            smuto: function () { if (el) cambiaAudio(false, audio.volume || 100); },
            volume: function (n) { if (el) cambiaAudio(audio.muto, n); },
            eMuto: function () { return audio.muto; },
            volumeAttuale: function () { return audio.volume; },
            avvia: function () { /* nell'anteprima parte sempre da sola */ },
            sincronizza: disegna
        };
    }

    window.NGBPlayerYouTube = { nome: 'youtube-anteprima', crea: crea };
})();
