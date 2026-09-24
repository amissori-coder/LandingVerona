/* ============================================================
   IL PLAYER DELLA DIRETTA: la web TV (e YouTube, se serve)
   ------------------------------------------------------------
   Stessa interfaccia di player-youtube.js, che la pagina della diretta
   e la regia usano senza sapere da dove arriva il video:

       window.NGBPlayer = { nome, crea(contenitore, opzioni), idDa(url) }

   Il valore che riceve carica() e' quello salvato dalla gestione
   (vedi sorgente-video.js) e decide come si riproduce:
     - 'hls'  (link .m3u8 della web TV) e 'file' (.mp4, .webm): un
       elemento <video> NOSTRO, con i NOSTRI comandi. Su Safari (iPhone,
       iPad, Mac) l'HLS lo legge il browser da solo; sugli altri si usa
       hls.js (diretta/hls.min.js, nel sito, scaricato solo quando
       serve). Qui, a differenza di YouTube, niente marchi e niente
       suggerimenti: la qualita' si puo' scegliere, e "Torna in diretta"
       salta al punto piu' recente.
     - 'incorporato' (il link del player della web TV o il suo codice
       da incorporare): il player della web TV dentro il nostro
       riquadro. Audio, pausa e qualita' si regolano con i SUOI comandi
       (una pagina non puo' comandare il player di un altro sito):
       capacita().comandi e' false e la pagina lascia solo lo schermo
       intero.
     - 'youtube': lo fa player-youtube.js (caricato prima di questo
       file), come prima.
   In piu' rispetto a player-youtube.js: capacita() -> { comandi, qualita }.

   LA WEB TV DEVE: dare un link https; per l'HLS, permettere la lettura
   da nextgenerationbusiness.it (intestazione CORS
   Access-Control-Allow-Origin, quasi sempre gia' attiva sui CDN); per
   il player incorporato, permettere l'incorporamento nel nostro sito.
   ============================================================ */
(function () {
    'use strict';

    var V = window.NGBSorgenteVideo;
    // il player di YouTube, se la pagina l'ha caricato prima di questo file
    var YT = window.NGBPlayer && window.NGBPlayer.nome === 'youtube' ? window.NGBPlayer : null;
    var qui = (document.currentScript && document.currentScript.src) || location.href;
    var URL_HLS = new URL('hls.min.js', qui).href;
    // se il video non si presenta entro questo tempo, lo si dice alla pagina
    var ATTESA_PRONTO_MS = 12000;

    /* ---------- hls.js, una volta sola e solo se serve ---------- */
    var promessaHls = null;
    function caricaHls() {
        if (window.Hls) return Promise.resolve(window.Hls);
        if (promessaHls) return promessaHls;
        promessaHls = new Promise(function (risolvi, rifiuta) {
            var s = document.createElement('script');
            s.src = URL_HLS;
            s.async = true;
            s.onload = function () { if (window.Hls) risolvi(window.Hls); else { promessaHls = null; rifiuta(new Error('hls.js')); } };
            s.onerror = function () { promessaHls = null; rifiuta(new Error('hls.js')); };
            document.head.appendChild(s);
        });
        return promessaHls;
    }

    function idDa(testo) {
        var s = V ? V.leggi(testo) : null;
        return s && !s.errore ? s.valore : '';
    }

    /* ============================================================
       LA WEB TV: <video> oppure iframe
       ============================================================ */
    function creaWebTv(contenitore, opzioni) {
        var el = null;            // il <video> o l'iframe
        var hls = null;
        var modo = '';            // 'video' | 'iframe'
        var tipo = '';
        var valore = '';
        var statoCorrente = 'non-avviato';
        var visibile = true;
        var distrutto = false;
        var mutoNostro = true;
        var volumeNostro = 100;
        var timerPronto = null;
        var tentativi = 0;
        var livelli = [];

        function avvisa(nome, dati) {
            var f = opzioni[nome];
            if (typeof f !== 'function') return;
            try { f(dati); } catch (e) { setTimeout(function () { throw e; }); }
        }
        function avvisaVolume() { avvisa('onVolume', { volume: volumeNostro, muto: mutoNostro }); }
        function imposta(s) { if (statoCorrente !== s) { statoCorrente = s; avvisa('onStato', s); } }
        function errore(codice, messaggio) {
            clearTimeout(timerPronto);
            avvisa('onErrore', { codice: codice, messaggio: messaggio });
        }
        function applicaVisibilita() {
            if (!el) return;
            // visibility e non display: il video resta vivo, ma non si vede ne' si raggiunge con Tab
            el.style.visibility = visibile ? '' : 'hidden';
            if (visibile) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', 'true');
        }

        function smonta() {
            clearTimeout(timerPronto);
            if (hls) { try { hls.destroy(); } catch (e) { /* gia' distrutto */ } }
            hls = null;
            if (el) {
                if (modo === 'video') { try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { /* niente */ } }
                if (el.parentNode) el.parentNode.removeChild(el);
            }
            el = null;
            modo = '';
            livelli = [];
        }

        function pronto() {
            clearTimeout(timerPronto);
            tentativi = 0;
            avvisa('onPronto');
            parti();
        }
        // autoplay muto: se il browser non lo concede, lo stato resta "non-avviato"
        // e la pagina, dopo 3 secondi, mostra «Avvia la diretta»
        function parti() {
            if (!el || modo !== 'video') return;
            el.muted = mutoNostro;
            var p;
            try { p = el.play(); } catch (e) { p = null; }
            if (p && typeof p.catch === 'function') p.catch(function () { if (el && el.paused) imposta('non-avviato'); });
        }

        function nuovoVideo() {
            var v = document.createElement('video');
            v.className = 'ngb-player-video';
            v.setAttribute('playsinline', '');
            v.setAttribute('webkit-playsinline', '');
            v.setAttribute('aria-label', 'Video della diretta');
            v.muted = true;
            v.defaultMuted = true;
            v.autoplay = true;
            v.preload = 'auto';
            v.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:#000;object-fit:contain;display:block;';
            v.addEventListener('playing', function () { imposta('riproduzione'); });
            v.addEventListener('pause', function () { if (!v.ended) imposta('pausa'); });
            v.addEventListener('waiting', function () { if (!v.paused) imposta('buffering'); });
            v.addEventListener('ended', function () { imposta('fine'); });
            v.addEventListener('loadedmetadata', function () { if (!hls) pronto(); });
            v.addEventListener('volumechange', function () {
                // il browser (o un tocco sul video su iPhone) ha cambiato l'audio: la pagina lo deve sapere
                var m = v.muted || v.volume === 0;
                if (m !== mutoNostro) { mutoNostro = m; avvisaVolume(); }
            });
            v.addEventListener('error', function () {
                if (hls || el !== v) return;   // con hls.js gli errori arrivano da lui
                var c = v.error && v.error.code;
                errore('media', c === 4
                    ? 'La diretta non è raggiungibile o il formato non è leggibile da questo browser.'
                    : 'Errore del video (' + (c || '?') + ').');
            });
            return v;
        }

        function monta(t, val) {
            smonta();
            tipo = t;
            valore = val;
            statoCorrente = 'non-avviato';
            // un player nuovo parte sempre muto (autoplay): la pagina lo sa e mostra «Attiva l'audio»
            if (!mutoNostro) { mutoNostro = true; avvisaVolume(); }
            timerPronto = setTimeout(function () {
                if (!distrutto && valore === val) errore('lento', 'La diretta non risponde.');
            }, ATTESA_PRONTO_MS);

            if (t === 'incorporato') {
                var f = document.createElement('iframe');
                modo = 'iframe';
                f.title = 'Video della diretta';
                f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
                f.setAttribute('allowfullscreen', '');
                f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                f.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:0;background:#000;display:block;';
                f.addEventListener('load', function () {
                    if (el !== f) return;
                    clearTimeout(timerPronto);
                    avvisa('onPronto');
                    imposta('riproduzione');
                });
                f.src = val;
                el = f;
                contenitore.appendChild(f);
                applicaVisibilita();
                return;
            }

            modo = 'video';
            var v = nuovoVideo();
            el = v;
            contenitore.appendChild(v);
            applicaVisibilita();
            try { v.volume = volumeNostro / 100; } catch (e) { /* iPhone: il volume e' dei tasti */ }
            // un file, oppure l'HLS su Safari (iPhone, iPad, Mac): lo legge il browser
            if (t === 'file' || v.canPlayType('application/vnd.apple.mpegurl')) { v.src = val; return; }

            caricaHls().then(function (Hls) {
                if (distrutto || el !== v) return;
                if (!Hls.isSupported()) {
                    errore('browser', 'Questo browser non riesce a riprodurre la diretta: prova con Chrome, Safari, Edge o Firefox aggiornati.');
                    return;
                }
                var h = new Hls({ liveSyncDurationCount: 3, backBufferLength: 60, capLevelToPlayerSize: true });
                hls = h;
                h.on(Hls.Events.MANIFEST_PARSED, function (ev, d) {
                    if (hls !== h) return;
                    livelli = (d && d.levels) || h.levels || [];
                    pronto();
                });
                h.on(Hls.Events.ERROR, function (ev, d) {
                    if (hls !== h || !d || !d.fatal) return;
                    /* La playlist non c'e' (la web TV non trasmette ancora, o il link e'
                       sbagliato): hls.js ha gia' riprovato, lo si dice subito alla pagina,
                       che riprova da sola ogni 20-30 secondi. */
                    var manifesto = /manifest/i.test(String(d.details || ''));
                    // un intoppo di rete o di decodifica a diretta avviata: qualche tentativo, poi lo si dice alla pagina
                    if (!manifesto && d.type === Hls.ErrorTypes.NETWORK_ERROR && tentativi < 3) {
                        tentativi++;
                        setTimeout(function () { if (hls === h) h.startLoad(); }, 1500 * tentativi);
                        return;
                    }
                    if (d.type === Hls.ErrorTypes.MEDIA_ERROR && tentativi < 2) {
                        tentativi++;
                        h.recoverMediaError();
                        return;
                    }
                    errore(d.type === Hls.ErrorTypes.NETWORK_ERROR ? 'rete' : 'media', manifesto
                        ? 'La diretta non è raggiungibile: forse non è ancora partita.'
                        : 'La diretta si è interrotta.');
                });
                h.loadSource(val);
                h.attachMedia(v);
            }, function () {
                if (!distrutto && el === v) errore('api', 'Il componente video non si è caricato.');
            });
        }

        /* Carica (o cambia) il video: sempre da capo, cosi' un nuovo link della
           regia (o un nuovo tentativo dopo un errore) riparte pulito. */
        function carica(val) {
            if (distrutto || !val) return;
            var t = V ? V.tipoDi(val) : '';
            if (!t || t === 'youtube') { errore('link', 'Il link del video non è valido.'); return; }
            monta(t, val);
        }
        function play() {
            if (modo !== 'video' || !el) return;
            var p = el.play();
            if (p && typeof p.catch === 'function') p.catch(function () { /* il browser ha detto di no: resta in pausa */ });
        }
        function pausa() { if (modo === 'video' && el) el.pause(); }
        function alterna() { if (statoCorrente === 'riproduzione' || statoCorrente === 'buffering') pausa(); else play(); }
        function muto() { mutoNostro = true; if (modo === 'video' && el) el.muted = true; avvisaVolume(); }
        function smuto() {
            mutoNostro = false;
            if (modo === 'video' && el) {
                el.muted = false;
                if (el.volume === 0) try { el.volume = (volumeNostro || 100) / 100; } catch (e) { /* niente */ }
                if (el.paused) play();
            }
            avvisaVolume();
        }
        // lo stato VERO del <video> (il browser puo' aver rifiutato l'audio)
        function eMuto() {
            if (modo === 'video' && el) return !!el.muted;
            return modo === 'iframe' ? false : mutoNostro;
        }
        function volume(n) {
            n = Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
            volumeNostro = n;
            if (modo === 'video' && el) { try { el.volume = n / 100; } catch (e) { /* iPhone */ } }
            avvisaVolume();
        }
        function leggiVolume() { return volumeNostro; }
        // "Torna in diretta": il punto piu' recente della diretta
        function vaiAlLive() {
            if (modo !== 'video' || !el) return;
            try {
                if (hls && isFinite(hls.liveSyncPosition) && hls.liveSyncPosition > 0) el.currentTime = hls.liveSyncPosition;
                else if (tipo === 'hls' && el.seekable && el.seekable.length) el.currentTime = Math.max(0, el.seekable.end(el.seekable.length - 1) - 2);
            } catch (e) { /* niente da saltare */ }
            play();
        }
        // la qualita': con hls.js e piu' livelli si sceglie; "Automatica" la decide la rete
        function livelliQualita() {
            if (!hls || livelli.length < 2) return [];
            var voci = livelli.map(function (l, i) {
                return { valore: String(i), etichetta: l.height ? l.height + 'p' : Math.round((l.bitrate || 0) / 1000) + ' kbps', ordine: l.height || l.bitrate || 0 };
            }).sort(function (a, b) { return b.ordine - a.ordine; });
            return [{ valore: '-1', etichetta: 'Automatica' }].concat(voci.map(function (x) { return { valore: x.valore, etichetta: x.etichetta }; }));
        }
        function impostaQualita(v) {
            if (!hls) return;
            var n = Number(v);
            hls.currentLevel = isFinite(n) ? n : -1;
        }
        function stato() { return statoCorrente; }
        function mostra(si) { visibile = !!si; applicaVisibilita(); }
        function distruggi() { distrutto = true; smonta(); }
        function capacita() { return { comandi: modo !== 'iframe', qualita: !!hls && livelli.length > 1 }; }

        return {
            carica: carica, play: play, pausa: pausa, alterna: alterna,
            muto: muto, smuto: smuto, eMuto: eMuto, volume: volume, leggiVolume: leggiVolume,
            vaiAlLive: vaiAlLive, livelliQualita: livelliQualita, impostaQualita: impostaQualita,
            stato: stato, mostra: mostra, distruggi: distruggi, capacita: capacita
        };
    }

    /* ============================================================
       L'ISTANZA VISTA DALLA PAGINA: web TV o YouTube, secondo il video
       ============================================================ */
    function crea(contenitore, opzioni) {
        opzioni = opzioni || {};
        var attuale = null;
        var famiglia = '';
        var visibile = true;

        function carica(valore) {
            var t = V ? V.tipoDi(valore) : '';
            if (!t) {
                var f = opzioni.onErrore;
                if (typeof f === 'function') { try { f({ codice: 'link', messaggio: 'Il link del video non è valido.' }); } catch (e) { /* niente */ } }
                return;
            }
            var serve = t === 'youtube' ? 'youtube' : 'webtv';
            if (!attuale || serve !== famiglia) {
                if (attuale) { try { attuale.distruggi(); } catch (e) { /* gia' distrutto */ } }
                attuale = null;
                famiglia = serve;
                if (serve === 'youtube') {
                    if (!YT) {
                        var g = opzioni.onErrore;
                        if (typeof g === 'function') { try { g({ codice: 'player', messaggio: 'Il player di YouTube non è disponibile.' }); } catch (e) { /* niente */ } }
                        return;
                    }
                    attuale = YT.crea(contenitore, opzioni);
                } else {
                    attuale = creaWebTv(contenitore, opzioni);
                }
                if (!visibile) attuale.mostra(false);
            }
            attuale.carica(valore);
        }
        function inoltra(nome, predefinito) {
            return function () {
                if (!attuale || typeof attuale[nome] !== 'function') return predefinito;
                return attuale[nome].apply(attuale, arguments);
            };
        }
        return {
            carica: carica,
            play: inoltra('play'), pausa: inoltra('pausa'), alterna: inoltra('alterna'),
            muto: inoltra('muto'), smuto: inoltra('smuto'), eMuto: inoltra('eMuto', true),
            volume: inoltra('volume'), leggiVolume: inoltra('leggiVolume', 100),
            vaiAlLive: inoltra('vaiAlLive'), livelliQualita: inoltra('livelliQualita', []), impostaQualita: inoltra('impostaQualita'),
            stato: inoltra('stato', 'non-avviato'),
            mostra: function (si) { visibile = !!si; if (attuale) attuale.mostra(si); },
            distruggi: function () { if (attuale) { try { attuale.distruggi(); } catch (e) { /* niente */ } } attuale = null; famiglia = ''; },
            capacita: function () {
                if (attuale && typeof attuale.capacita === 'function') return attuale.capacita();
                return { comandi: true, qualita: false };
            }
        };
    }

    window.NGBPlayer = { nome: 'webtv', crea: crea, idDa: idDa };
})();
