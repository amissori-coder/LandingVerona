/* ============================================================
   IL PLAYER YOUTUBE: una registrazione che sembra una diretta
   ------------------------------------------------------------
   Con un video di YouTube (modalita' A, tipoPlayer 'azoto' con il link
   di YouTube: lo dice sorgente-video.js, eYouTube) la pagina usa QUESTO
   player al posto di player-azoto.js. Il video di solito e' una
   registrazione, ma deve sembrare una diretta:
     - TUTTI ALLO STESSO PUNTO: quello che la pagina chiede con
       opzioni.posizione(), i secondi della registrazione in cui "si e'"
       adesso (diretta.js lo ricava dall'evento: onda e inizioVideo, vedi
       email-service/lib/diretta-dati.js, ondaDopo). Chi arriva tardi
       entra al punto giusto; chi resta indietro (il browser ha fermato il
       video, la rete ha rallentato) ci torna da solo. Con una diretta vera
       di YouTube (videoData.isLive) il punto lo decide YouTube.
     - NIENTE DI YOUTUBE: niente barra, durata, titolo, logo, video
       consigliati, menu del tasto destro, e nessun clic che porti a
       YouTube o al link del video. L'iframe e' quello di youtube-nocookie
       con controls=0 e senza tasti; non riceve ne' mouse ne' tocchi
       (pointer-events: none, e sopra c'e' lo SCUDO, un livello
       trasparente nostro); e' piu' alto del riquadro (BANDA sopra e
       sotto, fuori vista): il video resta intero, e il titolo e il logo
       che YouTube disegna in alto e in basso restano fuori. Quando
       YouTube mostrerebbe qualcosa di suo (prima di partire, in pausa,
       alla fine) davanti c'e' il SIPARIO, una nostra schermata.
     - I COMANDI SONO NOSTRI: la pagina usa attivaAudio(), muto(),
       smuto(), volume() con gli stessi pulsanti del flusso diretto
       (diretta.js), e «Schermo intero» e' quello del nostro riquadro.
   COME PARLA CON YOUTUBE. Nessuno script di YouTube nella nostra pagina
   (vedrebbe la sessione delle persone): l'iframe si comanda con i
   messaggi (postMessage) che il player di YouTube accetta con
   enablejsapi=1, gli stessi dell'API ufficiale:
     -> { event: 'listening', id, channel: 'widget' }, ripetuto finche'
        YouTube risponde;
     -> { event: 'command', func, args, id, channel: 'widget' }:
        playVideo, pauseVideo, seekTo [secondi, true], mute, unMute,
        setVolume [0-100], addEventListener ['onStateChange'|'onError'];
     <- { event: 'onReady' | 'initialDelivery' | 'infoDelivery' |
        'onStateChange' | 'onError', info }: lo stato (playerState: -1
        non partito, 0 finito, 1 in riproduzione, 2 in pausa, 3 in
        caricamento, 5 pronto), currentTime, duration, muted, volume,
        videoData.isLive.
   Si ascoltano solo i messaggi che arrivano DALL'iframe di questo player
   (event.source) con l'origine di youtube-nocookie, e solo JSON.
   SE YOUTUBE NON RISPONDE ai messaggi (in ATTESA_API_MS, e da almeno
   ATTESA_DOPO_CARICO_MS dopo che l'iframe si e' caricato: su una rete
   lenta si aspetta, fino ad ATTESA_API_MAX_MS) l'iframe si ricrea
   "semplice", con i comandi di YouTube e senza scudo: la diretta si vede
   lo stesso (meglio il logo di YouTube che uno schermo nero), e lo si
   dice alla pagina (onStato 'semplice'). Non dovrebbe succedere mai: e'
   la riserva per un cambio del modo in cui YouTube parla con le pagine.
   L'AUDIO. Il video parte senza audio (i browser lo permettono solo
   cosi'); «Attiva l'audio» manda unMute e setVolume. Se il browser non
   lo concede (succede su iPhone: il gesto della persona e' nella nostra
   pagina, non in quella di YouTube) lo scudo si toglie per un attimo e
   il sipario chiede di toccare il video: il tocco arriva a YouTube, che
   riparte con l'audio, e lo scudo torna.

   window.NGBPlayerYouTube = { nome: 'youtube', crea(contenitore, opzioni) }

   opzioni (facoltative):
     posizione()          -> i secondi della registrazione in cui si e'
                             adesso, o null se non si sa (si parte da
                             dove parte il video)
     onPronto()           il video si vede (il sipario si e' tolto)
     onStato(s)           'caricamento' | 'video' | 'avvia' | 'tocca' |
                          'fine' | 'semplice'
     onAudio({ muto, volume })   quando cambia l'audio del player
     onErrore({ codice, messaggio })   'link' (non e' un video di
                          YouTube), 'video' (YouTube non lo mostra:
                          privato, tolto, non incorporabile), 'lento' (in
                          ATTESA_PRONTO_MS non e' partito)
     tempi                SOLO per le prove: { attesaApi, dopoCarico,
                          attesaApiMax, attesaPronto, attesaAvvio, rivela,
                          controllo, pausaSalti, verificaAudio } in
                          millisecondi, al posto di quelli qui sotto
   istanza: carica(url, { titolo }), ricarica(), aggiornaTitolo(t),
     mostra(bool), distruggi(), stato(), capacita()  (come player-azoto.js)
     e in piu': attivaAudio() (nello stesso gestore del clic), muto(),
     smuto(), volume(n), eMuto(), volumeAttuale(), avvia(),
     sincronizza() (la pagina la chiama quando cambia il punto atteso).
   ============================================================ */
(function () {
    'use strict';

    var ORIGINE_YT = 'https://www.youtube-nocookie.com';
    var PERMESSI = 'autoplay; encrypted-media; picture-in-picture';
    var BANDA = 72;                   // px fuori vista sopra e sotto: titolo e logo di YouTube
    var ATTESA_API_MS = 12000;        // nessuna risposta ai messaggi: iframe "semplice"...
    var ATTESA_DOPO_CARICO_MS = 8000; // ...ma solo dopo che l'iframe si e' caricato da almeno 8 secondi
    var ATTESA_API_MAX_MS = 45000;    // (su una rete lenta si aspetta il caricamento fino a qui)
    var ATTESA_PRONTO_MS = 20000;     // 'lento': il video non e' partito
    var ATTESA_AVVIO_MS = 5000;       // partito niente da solo: serve un tocco
    var RIVELA_MS = 2500;             // il sipario si toglie dopo questi secondi di riproduzione
    var CONTROLLO_MS = 2000;          // ogni quanto si guarda se si e' al punto giusto
    var SOGLIA_SCARTO = 8;            // secondi di differenza oltre i quali si salta al punto giusto
    var PAUSA_SALTI_MS = 10000;       // fra un salto e l'altro, il tempo di ripartire
    var VERIFICA_AUDIO_MS = 1200;     // dopo «Attiva l'audio»: il browser l'ha concesso?

    var TESTI = {
        caricamento: { titolo: 'La diretta sta arrivando…', testo: '' },
        avvia: { titolo: 'La diretta è pronta', testo: 'Premi il pulsante per guardarla.' },
        tocca: { titolo: 'Tocca il video', testo: 'Il browser vuole un tocco sul video per l\'audio (se serve, toccalo due volte).' },
        fine: { titolo: 'La diretta si è conclusa', testo: 'Grazie per averla seguita.' }
    };

    function idDi(url) {
        var V = window.NGBSorgenteVideo;
        if (!V || typeof V.idYouTube !== 'function') return '';
        try { return V.idYouTube(url) || ''; } catch (e) { return ''; }
    }
    function el(tag, classe, attr) {
        var e = document.createElement(tag);
        if (classe) e.className = classe;
        Object.keys(attr || {}).forEach(function (k) { e.setAttribute(k, attr[k]); });
        return e;
    }

    /* ============================================================
       UN'ISTANZA DEL PLAYER
       ============================================================ */
    function crea(contenitore, opzioni) {
        opzioni = opzioni || {};
        var t0 = opzioni.tempi && typeof opzioni.tempi === 'object' ? opzioni.tempi : {};
        var tempo = function (nome, base) { var v = Number(t0[nome]); return v > 0 ? v : base; };
        var ATTESA_API = tempo('attesaApi', ATTESA_API_MS), ATTESA_PRONTO = tempo('attesaPronto', ATTESA_PRONTO_MS);
        var ATTESA_AVVIO = tempo('attesaAvvio', ATTESA_AVVIO_MS), RIVELA = tempo('rivela', RIVELA_MS);
        var CONTROLLO = tempo('controllo', CONTROLLO_MS), PAUSA_SALTI = tempo('pausaSalti', PAUSA_SALTI_MS);
        var VERIFICA_AUDIO = tempo('verificaAudio', VERIFICA_AUDIO_MS);
        var ATTESA_DOPO_CARICO = tempo('dopoCarico', ATTESA_DOPO_CARICO_MS), ATTESA_API_MAX = tempo('attesaApiMax', ATTESA_API_MAX_MS);
        var idVideo = '';
        var titolo = '';
        var statoCorrente = 'vuoto';
        var visibile = true;
        var distrutto = false;
        var semplice = false;          // l'iframe con i comandi di YouTube (YouTube non risponde ai messaggi)
        var generazione = 0;           // ogni iframe nuovo invalida messaggi e timer di quello prima
        var palco = null, iframe = null, scudo = null, sipario = null;
        var timer = { ascolto: null, api: null, pronto: null, avvio: null, rivela: null, controllo: null, audio: null };
        var yt = null;                 // quello che dice YouTube (si azzera a ogni iframe)
        var ultimoSalto = 0;
        var audioChiesto = false;      // la persona ha chiesto l'audio: va tenuto anche dopo un salto
        var scenaSipario = '';

        function avvisa(nome, dati) {
            var f = opzioni[nome];
            if (typeof f !== 'function') return;
            try { f(dati); } catch (e) { setTimeout(function () { throw e; }); }
        }
        function titoloAccessibile() { return 'Diretta: ' + (titolo || 'Next Generation Business'); }
        function fermaTimer() {
            Object.keys(timer).forEach(function (k) { clearTimeout(timer[k]); clearInterval(timer[k]); timer[k] = null; });
        }
        function cambiaStato(s) {
            if (statoCorrente === s) return;
            statoCorrente = s;
            avvisa('onStato', s);
        }

        /* Il punto atteso, dentro la registrazione: mai prima dell'inizio. */
        function atteso() {
            var f = opzioni.posizione;
            if (typeof f !== 'function') return null;
            var p;
            try { p = f(); } catch (e) { p = null; }
            return typeof p === 'number' && isFinite(p) ? Math.max(0, p) : null;
        }
        // dove sta YouTube adesso, contando il tempo passato dall'ultimo messaggio
        function tempoAdesso() {
            if (!yt) return 0;
            var t = yt.tempo;
            if (yt.stato === 1) t += (Date.now() - yt.quando) / 1000;
            return t;
        }

        /* ---------- i messaggi ---------- */
        function manda(evento, func, args) {
            if (!iframe || !iframe.contentWindow) return;
            var m = { event: evento, id: 1, channel: 'widget' };
            if (func) { m.func = func; m.args = args || []; }
            try { iframe.contentWindow.postMessage(JSON.stringify(m), ORIGINE_YT); } catch (e) { /* iframe gia' via */ }
        }
        function comando(func, args) { manda('command', func, args); }

        function suMessaggio(e) {
            if (distrutto || !iframe || e.source !== iframe.contentWindow || e.origin !== ORIGINE_YT) return;
            var d = e.data;
            if (typeof d === 'string') { try { d = JSON.parse(d); } catch (err) { return; } }
            if (!d || typeof d !== 'object' || typeof d.event !== 'string') return;
            if (!yt.risponde) {
                yt.risponde = true;
                clearInterval(timer.ascolto); timer.ascolto = null;
                clearTimeout(timer.api); timer.api = null;
                comando('addEventListener', ['onStateChange']);
                comando('addEventListener', ['onError']);
            }
            if (d.event === 'onReady') {
                // di solito le informazioni arrivano insieme: si parte da li' (leggi); se no, fra poco
                setTimeout(function () { if (yt && !yt.pronto) pronto(); }, 600);
            }
            else if (d.event === 'initialDelivery' || d.event === 'infoDelivery') leggi(d.info);
            else if (d.event === 'onStateChange') leggi({ playerState: d.info });
            else if (d.event === 'onError') erroreYouTube(d.info);
        }

        function leggi(info) {
            if (!info || typeof info !== 'object') return;
            var prima = { muto: yt.muto, volume: yt.volume, stato: yt.stato };
            if (typeof info.playerState === 'number') yt.stato = info.playerState;
            if (typeof info.currentTime === 'number' && isFinite(info.currentTime)) { yt.tempo = info.currentTime; yt.quando = Date.now(); }
            if (typeof info.duration === 'number' && isFinite(info.duration) && info.duration > 0) yt.durata = info.duration;
            if (typeof info.muted === 'boolean') yt.muto = info.muted;
            if (typeof info.volume === 'number') yt.volume = Math.max(0, Math.min(100, Math.round(info.volume)));
            if (info.videoData && typeof info.videoData === 'object' && info.videoData.isLive === true) yt.live = true;
            if (!yt.pronto && (typeof info.playerState === 'number' || typeof info.currentTime === 'number')) pronto();
            if (prima.muto !== yt.muto || prima.volume !== yt.volume) avvisa('onAudio', { muto: yt.muto, volume: yt.volume });
            valuta();
            // il tocco sul video l'ha fermato o fatto partire: adesso YouTube ha il gesto della persona, si riprova subito
            if (scenaSipario === 'tocca' && prima.stato !== yt.stato) riprovaTocco();
        }

        function pronto() {
            if (yt.pronto) return;
            yt.pronto = true;
            // al punto giusto (lo start dell'indirizzo vale solo a secondi interi) e via
            vaiAlPunto(true);
            comando('playVideo');
            if (audioChiesto) { comando('unMute'); comando('setVolume', [100]); }
            clearInterval(timer.controllo);
            timer.controllo = setInterval(controlla, CONTROLLO);
            clearTimeout(timer.avvio);
            timer.avvio = setTimeout(function () {
                if (!yt || yt.errore || yt.stato === 1 || yt.stato === 3 || scenaSipario === 'fine') return;
                mostraSipario('avvia');
                cambiaStato('avvia');
            }, ATTESA_AVVIO);
        }

        function vaiAlPunto(sempre) {
            if (!yt || yt.live) return;
            var p = atteso();
            if (p == null) return;
            if (yt.durata && p >= yt.durata - 1) { finita(); return; }
            if (sempre || Math.abs(tempoAdesso() - p) > SOGLIA_SCARTO) {
                ultimoSalto = Date.now();
                comando('seekTo', [p, true]);
                yt.tempo = p;
                yt.quando = Date.now();
            }
        }

        // ogni CONTROLLO_MS: si e' al punto giusto? il browser ha fermato il video?
        function controlla() {
            if (distrutto || !yt || !yt.pronto || yt.errore || semplice || scenaSipario === 'fine') return;
            // con la scena 'tocca' si aspetta il tocco della persona sul video: intanto si riprova, senza salti
            if (scenaSipario === 'tocca') { riprovaTocco(); return; }
            var p = atteso();
            if (!yt.live && p != null && yt.durata && p >= yt.durata - 1) { finita(); return; }
            if (yt.stato === 2) {
                // fermato dal browser (scheda in secondo piano, telefono bloccato): si riprende dal punto giusto
                vaiAlPunto(false);
                comando('playVideo');
                return;
            }
            if ((yt.stato === 1 || yt.stato === 3) && Date.now() - ultimoSalto > PAUSA_SALTI) vaiAlPunto(false);
        }

        function valuta() {
            if (!yt || yt.errore || semplice) return;
            if (yt.stato === 0) { finita(); return; }
            // finita la registrazione non riparte (la fa ripartire solo sincronizza, se il punto atteso torna indietro)
            if (scenaSipario === 'fine') { if (yt.stato === 1) comando('pauseVideo'); return; }
            if (scenaSipario === 'tocca') {
                // risolto quando il video va, e con l'audio se la persona l'ha chiesto
                if (yt.stato === 1 && (!audioChiesto || !yt.muto)) rivela();
                return;
            }
            if (yt.stato === 1) {
                clearTimeout(timer.pronto); timer.pronto = null;
                clearTimeout(timer.avvio); timer.avvio = null;
                // il sipario si toglie dopo RIVELA_MS di riproduzione: YouTube ha finito di mostrare le sue cose
                if (scenaSipario && !timer.rivela) {
                    timer.rivela = setTimeout(function () {
                        timer.rivela = null;
                        if (!yt || yt.stato !== 1 || scenaSipario === 'fine' || scenaSipario === 'tocca') return;
                        rivela();
                    }, RIVELA);
                }
            } else if (timer.rivela && yt.stato !== 3) {
                clearTimeout(timer.rivela); timer.rivela = null;
            }
        }
        function rivela() {
            clearTimeout(timer.pronto); timer.pronto = null;
            clearTimeout(timer.avvio); timer.avvio = null;
            clearTimeout(timer.rivela); timer.rivela = null;
            nascondiSipario();
            cambiaStato('video');
            avvisa('onPronto');
        }
        /* Scena 'tocca': dopo il tocco della persona sul video YouTube accetta
           i comandi che prima il browser rifiutava (audio, partenza). Il
           tocco su YouTube senza comandi mette anche in pausa: si riparte. */
        function riprovaTocco() {
            if (!yt || yt.errore || semplice) return;
            if (audioChiesto && yt.muto) { comando('unMute'); comando('setVolume', [100]); }
            if (yt.stato !== 1 && yt.stato !== 3) comando('playVideo');
        }

        function finita() {
            if (scenaSipario === 'fine') return;
            comando('pauseVideo');
            mostraSipario('fine');
            cambiaStato('fine');
        }

        function erroreYouTube(codice) {
            var c = Number(codice);
            // 2: video non valido; 5: errore del player HTML5; 100: tolto o privato; 101/150/153: non incorporabile
            yt.errore = true;
            clearTimeout(timer.avvio); timer.avvio = null;
            clearTimeout(timer.rivela); timer.rivela = null;
            clearTimeout(timer.audio); timer.audio = null;
            clearInterval(timer.controllo); timer.controllo = null;
            mostraSipario('caricamento');
            cambiaStato('errore');
            avvisa('onErrore', { codice: 'video', messaggio: 'YouTube non mostra il video (codice ' + (isFinite(c) ? c : '?') + ').' });
        }

        /* ---------- sipario e scudo ---------- */
        function mostraSipario(scena) {
            if (!sipario) return;
            scenaSipario = scena;
            var t = TESTI[scena] || TESTI.caricamento;
            sipario.setAttribute('data-scena', scena);
            sipario.querySelector('.yt-sipario-titolo').textContent = t.titolo;
            sipario.querySelector('.yt-sipario-testo').textContent = t.testo;
            sipario.querySelector('.yt-avvia').hidden = scena !== 'avvia';
            sipario.hidden = false;
            if (scena === 'tocca') togliScudo(); else rimettiScudo();
        }
        function nascondiSipario() {
            if (!sipario) return;
            scenaSipario = '';
            sipario.hidden = true;
            rimettiScudo();
        }
        /* Lo scudo si toglie solo per il tocco che il browser vuole sul video
           (scena 'tocca'): il sipario allora non copre il video, che si vede
           sotto, e il tocco arriva a YouTube. */
        function togliScudo() {
            if (!scudo || !iframe) return;
            scudo.hidden = true;
            iframe.style.pointerEvents = 'auto';
            sipario.classList.add('yt-sipario-trasparente');
        }
        function rimettiScudo() {
            if (!scudo || !iframe || semplice) return;
            scudo.hidden = false;
            iframe.style.pointerEvents = 'none';
            if (sipario) sipario.classList.remove('yt-sipario-trasparente');
        }

        /* ---------- l'iframe ---------- */
        function indirizzo(inizio) {
            var parametri = semplice
                ? ['autoplay=1', 'mute=1', 'playsinline=1', 'rel=0']
                : ['autoplay=1', 'mute=1', 'controls=0', 'disablekb=1', 'fs=0', 'iv_load_policy=3', 'rel=0', 'playsinline=1',
                    'cc_load_policy=0', 'enablejsapi=1', 'origin=' + encodeURIComponent(location.origin)];
            if (inizio > 0) parametri.push('start=' + Math.floor(inizio));
            return ORIGINE_YT + '/embed/' + idVideo + '?' + parametri.join('&');
        }

        function togli() {
            fermaTimer();
            generazione++;
            if (iframe) { try { iframe.setAttribute('src', 'about:blank'); } catch (e) { /* niente */ } }
            if (palco && palco.parentNode) palco.parentNode.removeChild(palco);
            palco = iframe = scudo = sipario = null;
            yt = null;
            scenaSipario = '';
        }

        function monta() {
            togli();
            var gen = generazione;
            yt = { risponde: false, pronto: false, errore: false, stato: -1, tempo: 0, quando: Date.now(), durata: 0, muto: true, volume: 100, live: false, creato: Date.now(), caricato: 0 };
            palco = el('div', 'yt-palco' + (semplice ? ' yt-semplice' : ''));
            palco.style.setProperty('--yt-banda', (semplice ? 0 : BANDA) + 'px');
            iframe = el('iframe', 'player-youtube', {
                title: titoloAccessibile(), allow: PERMESSI, referrerpolicy: 'strict-origin-when-cross-origin', tabindex: semplice ? '0' : '-1'
            });
            if (!semplice) iframe.style.pointerEvents = 'none';
            var p = atteso();
            iframe.setAttribute('src', indirizzo(p == null ? 0 : p));
            iframe.addEventListener('load', function () {
                if (distrutto || gen !== generazione || semplice) return;
                if (yt && !yt.caricato) yt.caricato = Date.now();
                // finche' YouTube non risponde si ripete 'listening'
                clearInterval(timer.ascolto);
                manda('listening');
                timer.ascolto = setInterval(function () {
                    if (gen !== generazione || !yt || yt.risponde) { clearInterval(timer.ascolto); return; }
                    manda('listening');
                }, 250);
            });
            palco.appendChild(iframe);
            if (!semplice) {
                // lo scudo: niente clic, tocchi, menu o passaggi del mouse arrivano a YouTube
                scudo = el('div', 'yt-scudo', { 'aria-hidden': 'true' });
                scudo.addEventListener('contextmenu', function (e) { e.preventDefault(); });
                palco.appendChild(scudo);
                sipario = el('div', 'yt-sipario');
                sipario.innerHTML = '<span class="yt-rotella" aria-hidden="true"></span>'
                    + '<p class="yt-sipario-titolo"></p><p class="yt-sipario-testo"></p>'
                    + '<button type="button" class="yt-avvia btn btn-chiaro" hidden><svg class="icona" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span>Guarda la diretta</span></button>';
                sipario.querySelector('.yt-avvia').addEventListener('click', avvia);
                sipario.addEventListener('contextmenu', function (e) { e.preventDefault(); });
                palco.appendChild(sipario);
                mostraSipario('caricamento');
            }
            contenitore.appendChild(palco);
            cambiaStato(semplice ? 'semplice' : 'caricamento');
            if (semplice) return;
            // YouTube non risponde ai messaggi: l'iframe semplice, con i suoi comandi
            timer.api = setTimeout(function senzaRisposta() {
                timer.api = null;
                if (distrutto || gen !== generazione || !yt || yt.risponde) return;
                if (document.visibilityState === 'hidden') { timer.api = setTimeout(senzaRisposta, 5000); return; }
                // l'iframe si sta ancora caricando (rete lenta), o si e' caricato da poco: si aspetta ancora
                var attesa = Date.now() - yt.creato < ATTESA_API_MAX
                    ? (yt.caricato ? yt.caricato + ATTESA_DOPO_CARICO - Date.now() : 3000) : 0;
                if (attesa > 0) { timer.api = setTimeout(senzaRisposta, attesa); return; }
                semplice = true;
                monta();
            }, ATTESA_API);
            // 'lento': il player di YouTube non e' nemmeno arrivato (se aspetta solo un tocco, lo dice il sipario)
            timer.pronto = setTimeout(function attendi() {
                timer.pronto = null;
                if (distrutto || gen !== generazione || !yt || yt.pronto || semplice) return;
                if (document.visibilityState === 'hidden') { timer.pronto = setTimeout(attendi, 5000); return; }
                avvisa('onErrore', { codice: 'lento', messaggio: 'Il video della diretta non parte.' });
            }, ATTESA_PRONTO);
        }

        /* ============================================================
           L'INTERFACCIA
           ============================================================ */
        function carica(indirizzoVideo, opz) {
            if (distrutto) return;
            if (opz && opz.titolo != null) titolo = String(opz.titolo).trim().slice(0, 200);
            var id = idDi(String(indirizzoVideo == null ? '' : indirizzoVideo).trim());
            if (!id) {
                togli();
                idVideo = '';
                statoCorrente = 'link';
                avvisa('onErrore', { codice: 'link', messaggio: 'L\'indirizzo non è un video di YouTube.' });
                return;
            }
            idVideo = id;
            semplice = false;
            if (visibile) { monta(); return; }
            togli();
            statoCorrente = 'nascosto';
        }
        function ricarica() {
            if (distrutto || !idVideo) return;
            if (visibile) monta();
        }
        function aggiornaTitolo(t) {
            titolo = String(t == null ? '' : t).trim().slice(0, 200);
            if (iframe) iframe.setAttribute('title', titoloAccessibile());
        }
        function mostra(si) {
            si = !!si;
            if (distrutto || si === visibile) return;
            visibile = si;
            if (!si) {
                togli();
                if (idVideo) statoCorrente = 'nascosto';
                return;
            }
            if (idVideo) monta();
        }
        function distruggi() {
            distrutto = true;
            window.removeEventListener('message', suMessaggio);
            togli();
            idVideo = '';
            statoCorrente = 'vuoto';
        }
        function stato() { return statoCorrente; }
        function capacita() { return { comandi: !semplice, qualita: false, dvr: false, audio: !semplice }; }

        /* «Attiva l'audio»: nello stesso gestore del clic della persona. Se
           dopo VERIFICA_AUDIO_MS YouTube dice ancora "muto" (o si e'
           fermato), il browser vuole un tocco sul video: scena 'tocca'. */
        function attivaAudio() {
            if (!yt || yt.errore || semplice) return;
            audioChiesto = true;
            comando('unMute');
            comando('setVolume', [100]);
            comando('playVideo');
            clearTimeout(timer.audio);
            timer.audio = setTimeout(function () {
                timer.audio = null;
                if (!yt || yt.errore || semplice || scenaSipario === 'fine') return;
                if (yt.muto || (yt.stato !== 1 && yt.stato !== 3)) {
                    mostraSipario('tocca');
                    cambiaStato('tocca');
                }
            }, VERIFICA_AUDIO);
        }
        function muto() {
            if (!yt || semplice) return;
            audioChiesto = false;
            clearTimeout(timer.audio); timer.audio = null;
            comando('mute');
            yt.muto = true;
            avvisa('onAudio', { muto: true, volume: yt.volume });
            valuta();
        }
        function smuto() {
            if (!yt || semplice) return;
            attivaAudio();
        }
        function volume(n) {
            if (!yt || semplice) return;
            var v = Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
            comando('setVolume', [v]);
            yt.volume = v;
            avvisa('onAudio', { muto: yt.muto, volume: v });
        }
        function eMuto() { return !yt || yt.muto; }
        function volumeAttuale() { return yt ? yt.volume : 100; }
        // «Guarda la diretta» sul sipario: il browser non l'ha fatta partire da sola
        function avvia() {
            if (!yt || yt.errore || semplice) return;
            vaiAlPunto(true);
            comando('playVideo');
            clearTimeout(timer.avvio);
            timer.avvio = setTimeout(function () {
                if (!yt || yt.errore || yt.stato === 1 || yt.stato === 3) return;
                mostraSipario('tocca');
                cambiaStato('tocca');
            }, ATTESA_AVVIO);
        }
        function sincronizza() {
            if (!yt || !yt.pronto || yt.errore || semplice) return;
            ultimoSalto = 0;
            if (scenaSipario === 'fine') {
                var p = atteso();
                if (p == null || !yt.durata || p < yt.durata - 1) { mostraSipario('caricamento'); cambiaStato('caricamento'); }
            }
            vaiAlPunto(false);
            comando('playVideo');
        }

        window.addEventListener('message', suMessaggio);

        return {
            carica: carica, ricarica: ricarica, aggiornaTitolo: aggiornaTitolo,
            mostra: mostra, distruggi: distruggi, stato: stato, capacita: capacita,
            attivaAudio: attivaAudio, muto: muto, smuto: smuto, volume: volume, eMuto: eMuto,
            volumeAttuale: volumeAttuale, avvia: avvia, sincronizza: sincronizza
        };
    }

    window.NGBPlayerYouTube = { nome: 'youtube', crea: crea };
})();
