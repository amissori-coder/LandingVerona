/* ============================================================
   IL PLAYER DELLA DIRETTA: il canale streaming della web TV
   ------------------------------------------------------------
   L'UNICO player della diretta. La pagina dei partecipanti
   (diretta.js) e l'anteprima della regia (gestione/) parlano solo con
   questa interfaccia, senza sapere come arriva il video:

       window.NGBPlayer = { nome: 'webtv', crea(contenitore, opzioni), idDa(testo) }

   opzioni (tutte facoltative):
       onPronto()                        il video si presenta (metadati letti)
       onStato(s)                        'non-avviato' | 'riproduzione' | 'pausa' | 'buffering' | 'fine'
       onErrore({ codice, messaggio })   vedi CODICI D'ERRORE
       onVolume({ volume, muto })
       onTempo({ posizione, inizio, fine, ritardo, dvr, diretta })   circa una volta al secondo
       onQualita(livelli)                l'elenco delle qualita' e' cambiato (come livelliQualita())

   istanza:
       carica(url, { firmato })
                          il link: sempre da capo, dal punto live. firmato: true se e' un
                          link firmato a tempo (vedi LINK FIRMATI)
       play() pausa() alterna() muto() smuto() eMuto() volume(0-100) leggiVolume()
       vaiAlLive()        il punto live, e riparte
       cerca(secondi)     va a quel punto, nella STESSA scala di finestra() (fra inizio e fine)
       finestra()         { posizione, inizio, fine, ritardo, dvr, diretta }
                            posizione: dove si e' (secondi, la scala del video)
                            inizio:    il punto piu' vecchio a cui si puo' tornare
                            fine:      il punto live (dove porta vaiAlLive)
                            ritardo:   secondi dietro il punto live (0 = in diretta)
                            dvr:       si puo' tornare indietro: e' una diretta e fine-inizio >= 60 s
                            diretta:   e' una diretta (non una registrazione)
       livelliQualita()   [{ valore: '-1', etichetta: 'Automatica' }, { valore, etichetta: '720p' }, ...]
                          una voce per altezza, senza doppioni; [] se c'e' una qualita' sola
       impostaQualita(valore)
       stato()  mostra(bool)  distruggi()
       capacita()         { comandi, qualita, dvr }

   CODICI D'ERRORE (onErrore): 'rete' (la web TV non risponde, dopo i
   tentativi previsti dalla libreria), 'media' (il video non si
   decodifica), 'segnale' (fermo da piu' di 12 s mentre dovrebbe andare),
   'lento' (non pronto in 15 s), 'libreria' (hls.js o dash.js non
   scaricati), 'browser' (questo browser non riproduce il flusso),
   'link' (il link non e' un flusso). Il player NON riprova da solo
   dopo un errore: il ricollegamento (attese crescenti e casuali, link di
   riserva) lo decide la pagina, che chiama di nuovo carica().

   COME SI RIPRODUCE (il tipo lo dice sorgente-video.js):
     - 'hls' (.m3u8), IL CASO PRINCIPALE. Su Safari (iPhone, iPad, Mac)
       lo legge il browser da solo. Altrove hls.js (diretta/hls.min.js,
       scaricato solo quando serve): parte dalla qualita' che sta in
       0,5 Mbit/s (quasi sempre la piu' bassa) e sale da sola (ABR); un
       errore di rete si recupera con startLoad(), uno dei file video con
       recoverMediaError() e poi swapAudioCodec() + recoverMediaError(),
       come prevede la libreria, prima di dirlo alla pagina.
     - 'dash' (.mpd): dash.js 5.2.1 (diretta/dash.all.min.js, scaricato
       solo quando serve), bitrate iniziale basso e ABR.
     - 'incorporato': la pagina del player della web TV in un iframe. E'
       il ripiego: audio, pausa e qualita' si regolano con i SUOI comandi
       (una pagina non puo' comandare il player di un altro sito), e i
       suoi loghi restano. capacita().comandi e' false.
   Il <video> e' nostro, senza comandi del browser (li disegna la
   pagina), senza "scarica", senza picture-in-picture ne' trasmissione ad
   altri schermi, senza menu del tasto destro. Parte muto (i browser
   bloccano l'audio automatico) e resta lo stesso elemento fra un
   carica() e l'altro: chi ha gia' attivato l'audio lo ritrova dopo un
   ricollegamento (su iPhone l'audio vale per l'elemento, non per la
   pagina).

   LINK FIRMATI (carica(url, { firmato: true })). La firma della web
   TV (per esempio ?md5=...&expires=... di nginx, ?hdnts=... di Akamai)
   sta nella query della playlist, ma le playlist delle singole
   qualita' e i segmenti la libreria li chiede con i loro indirizzi,
   SENZA quella query: se la web TV protegge anche quelli, non
   partirebbero. Allora a ogni richiesta verso lo STESSO server si
   aggiungono i parametri della firma che mancano (hls.js: xhrSetup;
   dash.js: addRequestInterceptor), cosi' come sono scritti (senza
   ricodificarli); le richieste verso altri server restano com'erano.
   Safari da solo non lo permette: con un link firmato anche su Safari
   (iPhone da iOS 17.1, iPad, Mac) si usa hls.js, se il browser ha
   MediaSource o ManagedMediaSource; senza, resta il browser (e la web
   TV deve mettere la firma negli indirizzi dentro le playlist).

   LA WEB TV DEVE: dare un link https; permettere la lettura del flusso
   da nextgenerationbusiness.it (intestazione CORS
   Access-Control-Allow-Origin su playlist e segmenti); per il player
   incorporato, permettere l'incorporamento nel nostro sito.
   ============================================================ */
(function () {
    'use strict';

    var qui = (document.currentScript && document.currentScript.src) || location.href;
    var URL_HLS = new URL('hls.min.js', qui).href;
    var URL_DASH = new URL('dash.all.min.js', qui).href;

    var ATTESA_PRONTO_MS = 15000;     // 'lento': il video non si presenta entro questo tempo
    var SEGNALE_FERMO_MS = 12000;     // 'segnale': fermo per piu' di cosi', mentre dovrebbe andare
    var FINESTRA_DVR_MINIMA = 60;     // secondi: sotto, niente barra per tornare indietro
    var TIPI = { hls: 1, dash: 1, incorporato: 1 };

    /* ---------- le librerie, una volta sola e solo se servono ---------- */
    var promesse = {};
    function caricaScript(url, globale) {
        if (window[globale]) return Promise.resolve(window[globale]);
        if (promesse[url]) return promesse[url];
        promesse[url] = new Promise(function (risolvi, rifiuta) {
            var s = document.createElement('script');
            s.src = url;
            s.async = true;
            s.onload = function () {
                if (window[globale]) { risolvi(window[globale]); return; }
                delete promesse[url];
                rifiuta(new Error(globale));
            };
            s.onerror = function () {
                // si potra' riprovare: la prossima richiesta riscarica il file
                delete promesse[url];
                if (s.parentNode) s.parentNode.removeChild(s);
                rifiuta(new Error(globale));
            };
            document.head.appendChild(s);
        });
        return promesse[url];
    }

    /* Il tipo del link: lo decide sorgente-video.js (lo stesso file della
       gestione e del servizio); senza, lo si deduce dal percorso. */
    function tipoDi(url) {
        var V = window.NGBSorgenteVideo;
        if (V && typeof V.tipoDi === 'function') return String(V.tipoDi(url) || '');
        try {
            var u = new URL(url);
            if (u.protocol !== 'https:') return '';
            var p = u.pathname.toLowerCase();
            if (/\.m3u8$/.test(p)) return 'hls';
            if (/\.mpd$/.test(p)) return 'dash';
            return 'incorporato';
        } catch (e) { return ''; }
    }

    function idDa(testo) {
        var V = window.NGBSorgenteVideo;
        if (V && typeof V.leggi === 'function') {
            var s = V.leggi(testo);
            return s && !s.errore ? s.valore : '';
        }
        var t = String(testo == null ? '' : testo).trim();
        return tipoDi(t) ? new URL(t).href : '';
    }

    /* Su Safari (iPhone, iPad, Mac) l'HLS lo legge il browser. Chrome e Edge
       (anche su Android) oggi dicono "forse" a canPlayType per l'HLS: li'
       si preferisce hls.js, che da' la scelta della qualita' e la finestra
       per tornare indietro. Senza MediaSource resta comunque il browser. */
    function hlsNativo(v) {
        var puo = false;
        try { puo = !!v.canPlayType('application/vnd.apple.mpegurl'); } catch (e) { puo = false; }
        if (!puo) return false;
        var ua = navigator.userAgent || '';
        var apple = /iPhone|iPad|iPod/.test(ua)
            || (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR/.test(ua));
        return apple || !(window.MediaSource || window.ManagedMediaSource);
    }

    function numero(x) { return typeof x === 'number' && isFinite(x) ? x : NaN; }

    /* La firma di un link: una funzione che, per un indirizzo dello stesso
       server (https), aggiunge i parametri della query del link firmato
       che mancano, scritti com'erano. null se il link non ha query. */
    function firmaDi(urlFirmato) {
        var base;
        try { base = new URL(urlFirmato); } catch (e) { return null; }
        var grezza = base.search ? base.search.slice(1) : '';
        if (!grezza) return null;
        var coppie = grezza.split('&').filter(Boolean).map(function (x) {
            return { chiave: chiaveDi(x), grezza: x };
        });
        return function (indirizzo) {
            var u;
            try { u = new URL(indirizzo, base.href); } catch (e) { return indirizzo; }
            if (u.protocol !== 'https:' || u.host !== base.host) return indirizzo;
            var q = u.search ? u.search.slice(1) : '';
            var presenti = q ? q.split('&').map(chiaveDi) : [];
            var mancano = coppie.filter(function (c) { return presenti.indexOf(c.chiave) < 0; });
            if (!mancano.length) return indirizzo;
            return u.origin + u.pathname + '?' + (q ? q + '&' : '') + mancano.map(function (c) { return c.grezza; }).join('&');
        };
    }
    function chiaveDi(coppia) {
        var k = String(coppia).split('=')[0];
        try { return decodeURIComponent(k.replace(/\+/g, ' ')); } catch (e) { return k; }
    }

    /* ============================================================
       UN'ISTANZA DEL PLAYER
       ============================================================ */
    function crea(contenitore, opzioni) {
        opzioni = opzioni || {};
        var el = null;              // il <video> (riusato fra un carica() e l'altro) o l'iframe
        var modo = '';              // 'video' | 'iframe' | ''
        var motore = '';            // 'nativo' | 'hls' | 'dash' | '' (con modo 'video')
        var hls = null;
        var dash = null;
        var HlsC = null;            // la classe Hls (per le costanti)
        var generazione = 0;        // ogni carica() invalida i lavori del precedente
        var statoCorrente = 'non-avviato';
        var visibile = true;
        var distrutto = false;
        var mutoNostro = true;
        var volumeNostro = 100;
        var timerPronto = null;
        var timerTempo = null;
        var pronto = false;
        // recupero di hls.js
        var tentRete = 0;
        var recuperoMedia = 0;      // quando si e' fatto l'ultimo recoverMediaError
        var scambioAudio = 0;       // quando si e' fatto l'ultimo swapAudioCodec
        var recuperiMedia = 0;
        // la diretta vista da hls.js: e' una diretta? quanto dura un segmento?
        var hlsLive = null;
        var durataSegmento = NaN;
        // HLS di Safari: quanto sta dietro il bordo della finestra il punto in cui il browser gioca "in diretta"
        var margineNativo = NaN;
        var misuraMargine = false;
        // segnale fermo
        var ultimaPosizione = -1;
        var fermoDa = 0;
        var segnalato = false;
        // qualita': l'ultimo elenco dato alla pagina
        var firmaQualita = '';
        // link firmato: aggiunge la firma alle richieste verso lo stesso server (null = link non firmato)
        var conFirma = null;

        function avvisa(nome, dati) {
            var f = opzioni[nome];
            if (typeof f !== 'function') return;
            try { f(dati); } catch (e) { setTimeout(function () { throw e; }); }
        }
        function avvisaVolume() { avvisa('onVolume', { volume: volumeNostro, muto: mutoNostro }); }
        function imposta(s) { if (statoCorrente !== s) { statoCorrente = s; avvisa('onStato', s); } }
        function errore(codice, messaggio) {
            clearTimeout(timerPronto);
            timerPronto = null;
            avvisa('onErrore', { codice: codice, messaggio: messaggio });
        }
        function annulla(e) { e.preventDefault(); }
        // niente menu del tasto destro sul riquadro del video (ne' "salva video con nome")
        contenitore.addEventListener('contextmenu', annulla);

        function applicaVisibilita() {
            if (!el) return;
            // visibility e non display: il video resta vivo, ma non si vede ne' si raggiunge con Tab
            el.style.visibility = visibile ? '' : 'hidden';
            if (visibile) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', 'true');
        }

        /* ---------- il motore (hls.js, dash.js o il browser) ---------- */
        function fermaMotore() {
            clearTimeout(timerPronto);
            timerPronto = null;
            if (hls) { try { hls.destroy(); } catch (e) { /* gia' distrutto */ } }
            hls = null;
            if (dash) { try { dash.destroy(); } catch (e) { /* gia' distrutto */ } }
            dash = null;
            motore = '';
            hlsLive = null;
            durataSegmento = NaN;
            margineNativo = NaN;
            misuraMargine = false;
            pronto = false;
            tentRete = 0;
            recuperoMedia = 0;
            scambioAudio = 0;
            recuperiMedia = 0;
            ultimaPosizione = -1;
            fermoDa = 0;
            segnalato = false;
            if (el && modo === 'video') {
                try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { /* niente */ }
            }
        }
        function togliElemento() {
            fermaMotore();
            clearInterval(timerTempo);
            timerTempo = null;
            if (el && el.parentNode) el.parentNode.removeChild(el);
            el = null;
            modo = '';
        }

        function nuovoVideo() {
            var v = document.createElement('video');
            v.className = 'ngb-player-video';
            v.setAttribute('playsinline', '');
            v.setAttribute('webkit-playsinline', '');
            v.setAttribute('aria-label', 'Video della diretta');
            v.setAttribute('controlslist', 'nodownload noplaybackrate noremoteplayback');
            v.setAttribute('disablepictureinpicture', '');
            v.setAttribute('disableremoteplayback', '');
            v.setAttribute('x-webkit-airplay', 'deny');
            try { v.disablePictureInPicture = true; } catch (e) { /* browser vecchio */ }
            try { v.disableRemotePlayback = true; } catch (e) { /* browser vecchio */ }
            v.controls = false;
            v.muted = true;
            v.defaultMuted = true;
            v.setAttribute('muted', '');
            v.autoplay = true;
            v.preload = 'auto';
            v.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:#000;object-fit:contain;display:block;';
            v.addEventListener('contextmenu', annulla);
            v.addEventListener('play', function () { if (v.readyState < 3) imposta('buffering'); });
            v.addEventListener('playing', function () {
                imposta('riproduzione');
                if (misuraMargine) {
                    misuraMargine = false;
                    var b = bordo();
                    if (isFinite(b)) margineNativo = Math.max(0, Math.min(40, b - v.currentTime));
                }
                tempo();
            });
            // le pause dovute a un cambio di link (fermaMotore) arrivano quando lo stato e' gia' "non-avviato"
            v.addEventListener('pause', function () {
                if (v.ended || el !== v || !v.paused || (!pronto && statoCorrente === 'non-avviato')) return;
                imposta('pausa');
                tempo();
            });
            v.addEventListener('waiting', function () { if (!v.paused) imposta('buffering'); });
            v.addEventListener('ended', function () { imposta('fine'); });
            v.addEventListener('seeked', tempo);
            v.addEventListener('loadedmetadata', function () {
                if (el !== v || pronto || !motore) return;
                pronto = true;
                clearTimeout(timerPronto);
                timerPronto = null;
                if (motore === 'nativo') misuraMargine = true;
                avvisa('onPronto');
                aggiornaQualita();
                tempo();
            });
            v.addEventListener('volumechange', function () {
                // il browser (o un tocco sul video su iPhone) ha cambiato l'audio: la pagina lo deve sapere
                var m = v.muted || v.volume === 0;
                if (m !== mutoNostro) { mutoNostro = m; avvisaVolume(); }
            });
            v.addEventListener('error', function () {
                // con hls.js e dash.js gli errori arrivano dalla libreria, che prima prova a recuperare
                if (el !== v || motore !== 'nativo') return;
                var c = v.error && v.error.code;
                if (c === 3) errore('media', 'Il video della diretta non si riesce a decodificare.');
                else if (c === 4 || c === 2) errore('rete', 'La diretta non è raggiungibile: forse non è ancora partita.');
                else errore('media', 'Errore del video (' + (c || '?') + ').');
            });
            return v;
        }
        function assicuraVideo() {
            if (el && modo === 'video') return el;
            togliElemento();
            modo = 'video';
            el = nuovoVideo();
            contenitore.appendChild(el);
            applicaVisibilita();
            try { el.volume = volumeNostro / 100; } catch (e) { /* iPhone: il volume e' dei tasti */ }
            clearInterval(timerTempo);
            timerTempo = setInterval(giro, 1000);
            return el;
        }

        /* Autoplay: muto parte quasi sempre. Con l'audio gia' attivato (un
           ricollegamento) si prova con l'audio; se il browser non lo concede
           si riparte muti e la pagina rimette «Attiva l'audio». Se il browser
           rifiuta anche muto (iPhone in risparmio energetico) lo stato resta
           "non-avviato" e la pagina mostra «Avvia la diretta». */
        function parti(gen) {
            var v = el;
            if (!v || modo !== 'video') return;
            v.muted = mutoNostro;
            var p;
            try { p = v.play(); } catch (e) { p = null; }
            if (!p || typeof p.catch !== 'function') return;
            p.catch(function (e) {
                if (gen !== generazione || el !== v || !v.paused) return;
                if (e && e.name === 'AbortError') return;       // un nuovo carica() ha interrotto questo
                if (!v.muted) {
                    v.muted = true;
                    mutoNostro = true;
                    avvisaVolume();
                    var p2;
                    try { p2 = v.play(); } catch (e2) { p2 = null; }
                    if (p2 && typeof p2.catch === 'function') p2.catch(function () { if (gen === generazione && el === v && v.paused) imposta('non-avviato'); });
                    return;
                }
                imposta('non-avviato');
            });
        }

        /* ---------- HLS con hls.js ---------- */
        function avviaHls(Hls, v, url, gen) {
            HlsC = Hls;
            if (!Hls.isSupported()) {
                // niente MediaSource: se il browser legge l'HLS da solo, lo fa lui
                if (v.canPlayType('application/vnd.apple.mpegurl')) { avviaNativo(v, url, gen); return; }
                errore('browser', 'Questo browser non riesce a riprodurre la diretta: prova con Chrome, Safari, Edge o Firefox aggiornati.');
                return;
            }
            var firma = conFirma;
            var h = new Hls({
                // link firmato: la firma anche sulle playlist delle qualita' e sui segmenti dello stesso server
                xhrSetup: firma ? function (xhr, indirizzo) { xhr.open('GET', firma(indirizzo), true); } : undefined,
                // si parte dalla qualita' che sta in 0,5 Mbit/s, poi sale da sola secondo la rete
                startLevel: -1,
                abrEwmaDefaultEstimate: 500000,
                testBandwidth: true,
                // mai piu' righe di quelle che il riquadro mostra (meno dati sul telefono)
                capLevelToPlayerSize: true,
                // il punto live: 3 segmenti dal bordo
                liveSyncDurationCount: 3,
                // quanto video gia' visto si tiene (per tornare indietro senza riscaricare)
                backBufferLength: 90,
                maxBufferLength: 30,
                enableWorker: true,
                lowLatencyMode: false
            });
            hls = h;
            motore = 'hls';
            var E = Hls.Events;
            h.on(E.MANIFEST_PARSED, function () {
                if (hls !== h) return;
                aggiornaQualita();
                parti(gen);
            });
            h.on(E.LEVEL_LOADED, function (ev, d) {
                if (hls !== h || !d || !d.details) return;
                hlsLive = !!d.details.live;
                durataSegmento = numero(d.details.targetduration);
            });
            // la qualita' in uso e' cambiata: l'elenco segue i codec del livello nuovo
            h.on(E.LEVEL_SWITCHED, function () { if (hls === h) aggiornaQualita(); });
            // un segmento arrivato: la rete va di nuovo, i tentativi ripartono da zero
            h.on(E.FRAG_BUFFERED, function () { if (hls === h) tentRete = 0; });
            h.on(E.ERROR, function (ev, d) { erroreHls(h, d); });
            h.attachMedia(v);
            h.loadSource(url);
        }

        /* Il recupero previsto da hls.js. Gli errori non "fatali" li risolve
           la libreria da sola (con i suoi tentativi). Per quelli fatali:
           - rete: startLoad() (due volte, a 1 e 2 secondi); la playlist
             principale che non arriva (diretta non partita, link sbagliato)
             si dice subito alla pagina: hls.js l'ha gia' richiesta piu' volte;
           - file video: recoverMediaError(), poi swapAudioCodec() +
             recoverMediaError() se l'errore torna entro 3 secondi;
           - il resto: alla pagina. */
        function erroreHls(h, d) {
            if (hls !== h || !d || !d.fatal) return;
            var T = HlsC.ErrorTypes;
            var dettaglio = String(d.details || '');
            if (dettaglio === 'manifestIncompatibleCodecsError') {
                errore('browser', 'Questo browser non riesce a riprodurre il formato della diretta: prova con Chrome, Safari, Edge o Firefox aggiornati.');
                return;
            }
            if (d.type === T.NETWORK_ERROR) {
                var manifesto = /^manifest/i.test(dettaglio);
                if (!manifesto && tentRete < 2) {
                    tentRete++;
                    setTimeout(function () { if (hls === h) { try { h.startLoad(); } catch (e) { /* distrutto */ } } }, 1000 * tentRete);
                    return;
                }
                errore('rete', manifesto
                    ? 'La diretta non è raggiungibile: forse non è ancora partita.'
                    : 'La diretta si è interrotta.');
                return;
            }
            if (d.type === T.MEDIA_ERROR && recuperiMedia < 4) {
                var adesso = Date.now();
                recuperiMedia++;
                if (adesso - recuperoMedia > 3000) {
                    recuperoMedia = adesso;
                    h.recoverMediaError();
                    return;
                }
                if (adesso - scambioAudio > 3000) {
                    scambioAudio = adesso;
                    recuperoMedia = adesso;
                    h.swapAudioCodec();
                    h.recoverMediaError();
                    return;
                }
            }
            errore('media', 'Il video della diretta non si riesce a decodificare.');
        }

        /* ---------- DASH con dash.js ---------- */
        function avviaDash(dashjs, v, url, gen) {
            var supporta = true;
            try { supporta = typeof dashjs.supportsMediaSource !== 'function' || dashjs.supportsMediaSource(); } catch (e) { supporta = true; }
            if (!supporta) { errore('browser', 'Questo browser non riesce a riprodurre la diretta: prova con Chrome, Edge o Firefox aggiornati.'); return; }
            var p = dashjs.MediaPlayer().create();
            p.updateSettings({
                debug: { logLevel: dashjs.Debug.LOG_LEVEL_NONE },
                streaming: {
                    abr: {
                        // si parte basso (kbit/s), poi sale da sola; mai piu' righe di quelle del riquadro
                        initialBitrate: { video: 500 },
                        autoSwitchBitrate: { video: true, audio: true },
                        limitBitrateByPortal: true
                    },
                    // niente ricordo della qualita' dell'ultima volta: si riparte sempre bassi
                    lastBitrateCachingInfo: { enabled: false },
                    lastMediaSettingsCachingInfo: { enabled: false }
                }
            });
            if (conFirma) {
                // link firmato: la firma anche sui segmenti (e sugli aggiornamenti del .mpd) dello stesso server
                var firma = conFirma;
                p.addRequestInterceptor(function (richiesta) {
                    if (richiesta && richiesta.url) richiesta.url = firma(richiesta.url);
                    return Promise.resolve(richiesta);
                });
            }
            dash = p;
            motore = 'dash';
            var E = dashjs.MediaPlayer.events;
            p.on(E.STREAM_INITIALIZED, function () { if (dash === p) { aggiornaQualita(); parti(gen); } });
            p.on(E.QUALITY_CHANGE_RENDERED, function () { if (dash === p) aggiornaQualita(); });
            p.on(E.ERROR, function (e) { erroreDash(p, e); });
            p.on(E.PLAYBACK_ERROR, function () { if (dash === p) errore('media', 'Il video della diretta non si riesce a decodificare.'); });
            p.initialize(v, url, true);
        }
        /* dash.js riprova da solo (retryAttempts); quello che arriva qui e' gia'
           un errore vero. Tranne la sincronizzazione dell'ora con il server
           (codice 16) e i sottotitoli (33): non fermano il video. */
        function erroreDash(p, e) {
            if (dash !== p) return;
            var c = Number(e && e.error && e.error.code);
            if (c === 16 || c === 33) return;
            if ([10, 11, 12, 15, 17, 18, 19, 25, 26, 27, 28, 29, 31].indexOf(c) >= 0) {
                errore('rete', c === 10 || c === 11 || c === 25
                    ? 'La diretta non è raggiungibile: forse non è ancora partita.'
                    : 'La diretta si è interrotta.');
                return;
            }
            if (c === 23 || c === 32 || c === 35) { errore('browser', 'Questo browser non riesce a riprodurre la diretta: prova con Chrome, Edge o Firefox aggiornati.'); return; }
            errore('media', 'Il video della diretta non si riesce a decodificare.');
        }

        /* ---------- HLS letto dal browser (Safari) ---------- */
        function avviaNativo(v, url, gen) {
            motore = 'nativo';
            v.src = url;
            parti(gen);
        }

        /* ---------- la pagina della web TV, incorporata ---------- */
        function montaIframe(url, gen) {
            togliElemento();
            var f = document.createElement('iframe');
            modo = 'iframe';
            f.title = 'Video della diretta (player della web TV)';
            f.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
            f.setAttribute('allowfullscreen', '');
            f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            f.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:0;background:#000;display:block;';
            f.addEventListener('load', function () {
                if (el !== f || gen !== generazione) return;
                clearTimeout(timerPronto);
                timerPronto = null;
                pronto = true;
                avvisa('onPronto');
                imposta('riproduzione');
            });
            f.src = url;
            el = f;
            contenitore.appendChild(f);
            applicaVisibilita();
        }

        /* ============================================================
           IL TEMPO: dove si e', la finestra, il punto live
           ============================================================ */
        function bordo() {
            if (!el || modo !== 'video') return NaN;
            var s = el.seekable;
            try { return s && s.length ? s.end(s.length - 1) : NaN; } catch (e) { return NaN; }
        }
        function eDiretta() {
            if (!el || modo !== 'video' || !pronto) return false;
            if (motore === 'hls') return hlsLive === true;
            if (motore === 'dash') { try { return !!dash && dash.isDynamic(); } catch (e) { return false; } }
            return el.duration === Infinity;
        }
        function finestra() {
            var vuota = { posizione: 0, inizio: 0, fine: 0, ritardo: 0, dvr: false, diretta: false };
            if (!el || modo !== 'video' || !pronto) return vuota;
            var posizione = numero(el.currentTime) || 0;
            var s = el.seekable;
            var inizio = NaN;
            try { inizio = s && s.length ? s.start(0) : NaN; } catch (e) { inizio = NaN; }
            var b = bordo();
            var fine = NaN;
            var diretta = eDiretta();
            if (motore === 'hls' && hls) {
                fine = numero(hls.liveSyncPosition);
            } else if (motore === 'dash' && dash) {
                try {
                    var w = dash.getDvrWindow();
                    if (w && isFinite(w.start) && isFinite(w.end)) { inizio = w.start; b = w.end; }
                    var obiettivo = numero(dash.getTargetLiveDelay());
                    if (isFinite(obiettivo) && isFinite(b)) fine = b - obiettivo;
                } catch (e) { /* dash.js non ancora pronto */ }
            } else if (motore === 'nativo' && isFinite(b)) {
                fine = b - (isFinite(margineNativo) ? margineNativo : 0);
            }
            if (!diretta) {
                // una registrazione: la finestra e' tutto il video
                if (!isFinite(inizio)) inizio = 0;
                var d = numero(el.duration);
                return { posizione: posizione, inizio: inizio, fine: isFinite(d) ? d : (isFinite(b) ? b : posizione), ritardo: 0, dvr: false, diretta: false };
            }
            // senza un punto live dalla libreria: 3 segmenti dal bordo
            if (!isFinite(fine) && isFinite(b)) fine = b - 3 * (isFinite(durataSegmento) && durataSegmento > 0 ? durataSegmento : 4);
            if (!isFinite(fine)) fine = posizione;
            if (!isFinite(inizio) || inizio > fine) inizio = Math.min(fine, posizione);
            var ritardo = Math.max(0, fine - posizione);
            return {
                posizione: posizione,
                inizio: inizio,
                fine: fine,
                ritardo: ritardo,
                dvr: fine - inizio >= FINESTRA_DVR_MINIMA,
                diretta: true
            };
        }
        function tempo() { if (el && modo === 'video' && pronto) avvisa('onTempo', finestra()); }

        /* Ogni secondo: il tempo alla pagina, e il controllo del segnale.
           "Fermo" vuol dire: dovrebbe andare (non in pausa, pagina in vista),
           non ha dati (in attesa) e la posizione non si muove da 12 s.
           Con i dati in mano e la posizione ferma e' il browser che lo
           trattiene (per esempio un video muto fuori dallo schermo): non e'
           un guasto. */
        function giro() {
            if (distrutto || !el || modo !== 'video') return;
            tempo();
            if (!pronto) return;
            var t = el.currentTime;
            var nascosta = document.visibilityState === 'hidden';
            var inAttesa = statoCorrente === 'buffering' || el.readyState < 3;
            if (el.paused || el.ended || nascosta || !inAttesa || t !== ultimaPosizione) {
                ultimaPosizione = t;
                fermoDa = 0;
                segnalato = false;
                return;
            }
            if (!fermoDa) fermoDa = Date.now();
            if (!segnalato && Date.now() - fermoDa >= SEGNALE_FERMO_MS) {
                segnalato = true;
                errore('segnale', 'Il segnale della diretta si è fermato.');
            }
        }

        /* ============================================================
           LA QUALITA'
           ============================================================ */
        // i livelli della libreria in una forma sola: { valore, altezza, banda, codec }
        function livelliGrezzi() {
            var out = [];
            if (hls && hls.levels) {
                hls.levels.forEach(function (l, i) {
                    out.push({ valore: String(i), altezza: l.height || 0, banda: l.bitrate || 0, codec: codecDi(l.videoCodec, l.audioCodec) });
                });
            } else if (dash) {
                var r = [];
                try { r = dash.getRepresentationsByType('video') || []; } catch (e) { r = []; }
                r.forEach(function (x, i) { out.push({ valore: String(i), altezza: x.height || 0, banda: x.bandwidth || 0, codec: codecDi(x.codecs, '') }); });
            }
            return out;
        }
        function codecDi(video, audio) {
            return String(video || '').split('.')[0].toLowerCase() + '|' + String(audio || '').split('.')[0].toLowerCase();
        }
        function codecInUso(grezzi) {
            if (hls) {
                var i = hls.currentLevel >= 0 ? hls.currentLevel : (hls.loadLevel >= 0 ? hls.loadLevel : hls.nextLoadLevel);
                var l = hls.levels && hls.levels[i];
                return l ? codecDi(l.videoCodec, l.audioCodec) : (grezzi[0] ? grezzi[0].codec : '');
            }
            if (dash) {
                try { var r = dash.getCurrentRepresentationForType('video'); if (r) return codecDi(r.codecs, ''); } catch (e) { /* niente */ }
            }
            return grezzi[0] ? grezzi[0].codec : '';
        }
        /* Una voce per altezza. Lo stesso flusso puo' avere la stessa altezza
           in piu' codec (per esempio H.264, VP9 e AV1): si prende il livello
           con gli stessi codec di quello in uso (cambiare codec a meta'
           diretta costringe a ricominciare il video), e fra quelli il piu'
           ricco. */
        function livelliQualita() {
            if (modo !== 'video' || (!hls && !dash)) return [];
            var grezzi = livelliGrezzi();
            var attuale = codecInUso(grezzi);
            var perAltezza = {};
            grezzi.forEach(function (l) {
                var k = l.altezza ? String(l.altezza) : 'b' + Math.round(l.banda / 1000);
                var pari = l.codec === attuale;
                var c = perAltezza[k];
                if (!c || (pari && !c.pari) || (pari === c.pari && l.banda > c.banda)) {
                    perAltezza[k] = { valore: l.valore, altezza: l.altezza, banda: l.banda, pari: pari };
                }
            });
            var voci = Object.keys(perAltezza).map(function (k) { return perAltezza[k]; })
                .sort(function (a, b) { return (b.altezza - a.altezza) || (b.banda - a.banda); });
            if (voci.length < 2) return [];
            return [{ valore: '-1', etichetta: 'Automatica' }].concat(voci.map(function (x) {
                return { valore: x.valore, etichetta: x.altezza ? x.altezza + 'p' : Math.round(x.banda / 1000) + ' kbps' };
            }));
        }
        function aggiornaQualita() {
            var l = livelliQualita();
            var f = JSON.stringify(l);
            if (f === firmaQualita) return;
            firmaQualita = f;
            avvisa('onQualita', l);
        }
        function impostaQualita(valore) {
            var n = Number(valore);
            if (!isFinite(n)) n = -1;
            if (hls) {
                // "Automatica" senza svuotare quello che e' gia' scaricato; una scelta precisa subito
                if (n < 0) hls.nextLevel = -1;
                else hls.currentLevel = n;
                return;
            }
            if (dash) {
                try {
                    if (n < 0) {
                        dash.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true } } } });
                    } else {
                        dash.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false } } } });
                        dash.setRepresentationForTypeByIndex('video', n, true);
                    }
                } catch (e) { /* dash.js non ancora pronto */ }
            }
        }

        /* ============================================================
           L'INTERFACCIA
           ============================================================ */
        /* Carica (o cambia) il video: sempre da capo e dal punto live, cosi'
           un nuovo link della regia, il passaggio alla riserva o un nuovo
           tentativo dopo un errore ripartono puliti. Il <video> resta lo
           stesso (con il suo audio). */
        function carica(url, opz) {
            if (distrutto) return;
            url = String(url == null ? '' : url).trim();
            var t = url ? tipoDi(url) : '';
            if (!TIPI[t]) { errore('link', 'Il link del video non è valido.'); return; }
            var gen = ++generazione;
            fermaMotore();
            conFirma = opz && opz.firmato === true ? firmaDi(url) : null;
            firmaQualita = '';
            statoCorrente = '';
            imposta('non-avviato');

            if (t === 'incorporato') { montaIframe(url, gen); attendiPronto(gen); return; }

            var v = assicuraVideo();
            attendiPronto(gen);
            v.muted = mutoNostro;
            // con un link firmato anche Safari passa da hls.js, se puo' (vedi LINK FIRMATI)
            if (t === 'hls' && hlsNativo(v) && !(conFirma && (window.ManagedMediaSource || window.MediaSource))) { avviaNativo(v, url, gen); return; }
            var libreria = t === 'hls' ? caricaScript(URL_HLS, 'Hls') : caricaScript(URL_DASH, 'dashjs');
            libreria.then(function (L) {
                if (distrutto || gen !== generazione || el !== v) return;
                if (t === 'hls') avviaHls(L, v, url, gen); else avviaDash(L, v, url, gen);
            }, function () {
                if (!distrutto && gen === generazione) errore('libreria', 'Il componente video non si è caricato.');
            });
        }
        function attendiPronto(gen) {
            clearTimeout(timerPronto);
            timerPronto = setTimeout(function () {
                if (!distrutto && gen === generazione && !pronto) errore('lento', 'La diretta non risponde.');
            }, ATTESA_PRONTO_MS);
        }
        function play() {
            if (modo !== 'video' || !el) return;
            var p;
            try { p = el.play(); } catch (e) { p = null; }
            if (p && typeof p.catch === 'function') p.catch(function () { /* il browser ha detto di no: resta in pausa */ });
        }
        function pausa() { if (modo === 'video' && el) el.pause(); }
        function alterna() { if (statoCorrente === 'riproduzione' || statoCorrente === 'buffering') pausa(); else play(); }
        function muto() { mutoNostro = true; if (modo === 'video' && el) el.muted = true; avvisaVolume(); }
        function smuto() {
            mutoNostro = false;
            if (modo === 'video' && el) {
                el.muted = false;
                if (el.volume === 0) { try { el.volume = (volumeNostro || 100) / 100; } catch (e) { /* niente */ } }
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

        // "Torna in diretta": il punto live, e si riparte
        function vaiAlLive() {
            if (modo !== 'video' || !el) return;
            try {
                if (motore === 'dash' && dash) {
                    dash.seekToOriginalLive();
                } else {
                    var f = finestra();
                    if (f.diretta && isFinite(f.fine) && Math.abs(f.fine - el.currentTime) > 1) el.currentTime = f.fine;
                }
            } catch (e) { /* niente da saltare */ }
            play();
            setTimeout(tempo, 300);
        }
        // va a un punto della finestra (secondi nella scala di finestra())
        function cerca(secondi) {
            if (modo !== 'video' || !el) return;
            var f = finestra();
            var s = Number(secondi);
            if (!isFinite(s) || !f.diretta && !isFinite(f.fine)) return;
            if (f.diretta && s >= f.fine - 1) { vaiAlLive(); return; }
            s = Math.max(f.inizio, Math.min(f.fine, s));
            try {
                if (motore === 'dash' && dash) dash.seekToPresentationTime(s);
                else el.currentTime = s;
            } catch (e) { /* fuori finestra */ }
            setTimeout(tempo, 300);
        }

        function stato() { return statoCorrente; }
        function mostra(si) { visibile = !!si; applicaVisibilita(); }
        function distruggi() {
            distrutto = true;
            generazione++;
            togliElemento();
            contenitore.removeEventListener('contextmenu', annulla);
        }
        function capacita() {
            return {
                comandi: modo !== 'iframe',
                qualita: livelliQualita().length > 0,
                dvr: finestra().dvr
            };
        }

        return {
            carica: carica, play: play, pausa: pausa, alterna: alterna,
            muto: muto, smuto: smuto, eMuto: eMuto, volume: volume, leggiVolume: leggiVolume,
            vaiAlLive: vaiAlLive, cerca: cerca, finestra: finestra,
            livelliQualita: livelliQualita, impostaQualita: impostaQualita,
            stato: stato, mostra: mostra, distruggi: distruggi, capacita: capacita
        };
    }

    window.NGBPlayer = { nome: 'webtv', crea: crea, idDa: idDa };
})();
