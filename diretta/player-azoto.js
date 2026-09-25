/* ============================================================
   IL PLAYER AZOTO (modalita' A della diretta): la pagina del player
   della web TV Azoto Solutions, dentro un iframe
   ------------------------------------------------------------
   La diretta ha due modalita', scelte dalla regia per ogni evento
   (eventi.tipoPlayer, vedi diretta.js):
     A) 'azoto'  -> QUESTO file: il player di Azoto in un iframe, con i
                    SUOI comandi (play, volume, qualita') e l'eventuale
                    logo nel video. E' la modalita' predefinita.
     B) 'flusso' -> player-webtv.js: il flusso diretto (.m3u8) nel
                    NOSTRO <video>, con i nostri comandi.
   La pagina dei partecipanti e l'anteprima della gestione parlano con
   questa interfaccia:

       window.NGBPlayerAzoto = { nome: 'azoto', crea(contenitore, opzioni), eAzoto(url) }

   opzioni (facoltative):
       onPronto()                        l'iframe ha caricato la pagina di Azoto
                                         (evento load). Vuol dire che la pagina del
                                         player e' arrivata, NON che il video va:
                                         Azoto non comunica con la pagina che lo
                                         ospita (nessun postMessage)
       onErrore({ codice, messaggio })   'lento': in 15 s nessun load (contati solo con
                                                  la pagina in vista); l'iframe RESTA,
                                                  e se il load arriva dopo arriva anche
                                                  onPronto
                                         'link':  l'indirizzo non e' un player Azoto
                                                  (NGBSorgenteVideo.eAzoto): niente
                                                  iframe, quello di prima si toglie

   istanza:
       carica(url, { titolo })  crea l'iframe DA ZERO (quello di prima si butta) con
                                l'indirizzo del player; titolo: il titolo dell'evento,
                                per il titolo accessibile «Diretta: <titolo>»
       ricarica()               ricrea SOLO l'iframe, con lo stesso indirizzo: il resto
                                della pagina resta com'e' (e' «Ricarica il video»)
       aggiornaTitolo(titolo)   cambia il titolo accessibile senza ricaricare
       mostra(bool)             mostra(false) TOGLIE l'iframe (da fuori l'audio di
                                Azoto non si puo' spegnere: si toglie la pagina);
                                mostra(true) lo ricrea, se c'e' un indirizzo
       distruggi()              toglie tutto; l'istanza non si usa piu'
       stato()                  'vuoto' (nessun indirizzo) | 'caricamento' | 'pronto'
                                | 'lento' | 'link' | 'nascosto'
       capacita()               { comandi: false, qualita: false, dvr: false }: i
                                comandi sono tutti di Azoto

   L'IFRAME. Lo costruisce questo codice con document.createElement:
   nella pagina non entra MAI HTML incollato dalla gestione, e nemmeno
   il codice che ha dato Azoto (div + iframe + script). Dal loro codice
   si tiene solo l'indirizzo (lo estrae e lo controlla il servizio,
   sorgente-video.js), e qui lo si ricontrolla: solo https e solo gli
   host di Azoto (HOST_AZOTO). Gli attributi:
     - allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
       e allowfullscreen: il player di Azoto puo' partire da solo (se il
       browser lo concede), andare a schermo intero, in picture-in-picture
       e leggere flussi protetti;
     - referrerpolicy="strict-origin-when-cross-origin": ad Azoto arriva
       solo il nostro dominio, mai l'indirizzo completo della pagina;
     - scrolling="no": la pagina di Azoto puo' essere piu' alta di
       qualche pixel del riquadro, e comparirebbe una barra di
       scorrimento;
     - title="Diretta: <titolo dell'evento>", per i lettori di schermo;
     - classe .player-azoto, senza bordo, 100% x 100% del contenitore.
   Nessun livello sopra l'iframe, MAI: bloccherebbe i comandi di Azoto,
   che in questa modalita' sono gli unici. Il riquadro 16:9 (senza bande
   ne' barre) lo fa il CSS della pagina (diretta.css), non uno script.

   PERCHE' NIENTE azoto-player.js. Lo script che Azoto mette nel suo
   codice (https://azotosolutions.com/videojs/azoto-player.js) fa solo
   due cose: ridimensiona .azoto-player-container in 16:9 (lo fa gia' il
   nostro CSS) e mette alla pagina che lo carica body { margin: 0;
   background: #000 } (rovinerebbe la nostra grafica). Niente
   postMessage, niente altro: non si carica, e azotosolutions.com non
   entra nella Content-Security-Policy.

   COSA FA LA PAGINA DI AZOTO (per chi legge i messaggi delle persone):
   parte da sola con l'audio se il browser lo permette, altrimenti
   aspetta un tocco sul suo tasto play (su iPhone sempre); in errore si
   ricarica da sola dopo un secondo. Per questo qui non si riprova
   niente: «lento» lo dice la pagina alla persona, con «Ricarica il
   video», e la persona decide.
   ============================================================ */
(function () {
    'use strict';

    var ATTESA_PRONTO_MS = 15000;     // 'lento': nessun load entro questo tempo
    // gli host del player Azoto, se sorgente-video.js non li dice (un solo posto: HOST_AZOTO li')
    var HOST_RIPIEGO = ['cdn.azotosolutions.com'];
    var PERMESSI = 'autoplay; fullscreen; picture-in-picture; encrypted-media';

    /* L'indirizzo e' di un player Azoto? Lo decide sorgente-video.js (lo
       stesso file della gestione e del servizio); senza, le stesse regole
       qui: https, porta standard, niente credenziali, host di Azoto. */
    function eAzoto(url) {
        var V = window.NGBSorgenteVideo;
        if (V && typeof V.eAzoto === 'function') {
            try { return V.eAzoto(url) === true; } catch (e) { return false; }
        }
        var host = V && Array.isArray(V.HOST_AZOTO) && V.HOST_AZOTO.length ? V.HOST_AZOTO : HOST_RIPIEGO;
        var u;
        try { u = new URL(String(url == null ? '' : url).trim()); } catch (e) { return false; }
        return u.protocol === 'https:' && !u.username && !u.password && (u.port === '' || u.port === '443')
            && host.indexOf(u.hostname.toLowerCase()) >= 0;
    }

    /* ============================================================
       UN'ISTANZA DEL PLAYER
       ============================================================ */
    function crea(contenitore, opzioni) {
        opzioni = opzioni || {};
        var el = null;              // l'iframe (uno solo alla volta)
        var url = '';               // l'indirizzo del player, normalizzato
        var titolo = '';
        var statoCorrente = 'vuoto';
        var visibile = true;
        var distrutto = false;
        var timerPronto = null;
        var generazione = 0;        // ogni iframe nuovo invalida i load e i timer di quello prima

        function avvisa(nome, dati) {
            var f = opzioni[nome];
            if (typeof f !== 'function') return;
            try { f(dati); } catch (e) { setTimeout(function () { throw e; }); }
        }
        function titoloAccessibile() { return 'Diretta: ' + (titolo || 'Next Generation Business'); }
        function fermaTimer() { clearTimeout(timerPronto); timerPronto = null; }

        /* Toglie l'iframe: prima svuotato (about:blank: il suo audio si
           ferma subito, anche se il browser tarda a buttare la pagina),
           poi tolto dal riquadro. */
        function togli() {
            fermaTimer();
            generazione++;
            if (el) {
                try { el.setAttribute('src', 'about:blank'); } catch (e) { /* niente */ }
                if (el.parentNode) el.parentNode.removeChild(el);
            }
            el = null;
        }

        /* L'iframe, da zero. L'indirizzo si mette PRIMA di inserirlo nella
           pagina: cosi' il primo (e unico) load e' quello della pagina di
           Azoto, non quello di una pagina vuota iniziale. */
        function monta() {
            togli();
            var gen = generazione;
            var f = document.createElement('iframe');
            f.className = 'player-azoto';
            f.setAttribute('title', titoloAccessibile());
            f.setAttribute('allow', PERMESSI);
            f.setAttribute('allowfullscreen', '');
            f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            f.setAttribute('scrolling', 'no');
            f.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:0;display:block;background:#000;';
            f.addEventListener('load', function () {
                if (distrutto || el !== f || gen !== generazione) return;
                fermaTimer();
                statoCorrente = 'pronto';
                avvisa('onPronto');
            });
            f.setAttribute('src', url);
            el = f;
            statoCorrente = 'caricamento';
            contenitore.appendChild(f);
            attendiPronto(gen);
        }

        /* 'lento': 15 secondi senza load. Una scheda in secondo piano (il
           browser rallenta richieste e timer) non e' un player lento: si
           riguarda tra 5 secondi. */
        function attendiPronto(gen) {
            fermaTimer();
            timerPronto = setTimeout(function controlla() {
                timerPronto = null;
                if (distrutto || gen !== generazione || statoCorrente !== 'caricamento') return;
                if (document.visibilityState === 'hidden') { timerPronto = setTimeout(controlla, 5000); return; }
                statoCorrente = 'lento';
                avvisa('onErrore', { codice: 'lento', messaggio: 'Il player della diretta non risponde.' });
            }, ATTESA_PRONTO_MS);
        }

        /* ============================================================
           L'INTERFACCIA
           ============================================================ */
        function carica(indirizzo, opz) {
            if (distrutto) return;
            var testo = String(indirizzo == null ? '' : indirizzo).trim();
            if (opz && opz.titolo != null) titolo = String(opz.titolo).trim().slice(0, 200);
            if (!eAzoto(testo)) {
                /* Non e' un player Azoto (un valore che il servizio non
                   salverebbe): niente iframe, e quello di prima non resta
                   acceso di nascosto. La pagina mette la sua schermata. */
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
        // «Ricarica il video»: solo l'iframe, con lo stesso indirizzo
        function ricarica() {
            if (distrutto || !url) return;
            if (visibile) monta();
        }
        function aggiornaTitolo(t) {
            titolo = String(t == null ? '' : t).trim().slice(0, 200);
            if (el) el.setAttribute('title', titoloAccessibile());
        }
        function mostra(si) {
            si = !!si;
            if (distrutto || si === visibile) return;
            visibile = si;
            if (!si) {
                togli();
                if (url) statoCorrente = 'nascosto';
                return;
            }
            if (url) monta();
        }
        function distruggi() {
            distrutto = true;
            togli();
            url = '';
            statoCorrente = 'vuoto';
        }
        function stato() { return statoCorrente; }
        function capacita() { return { comandi: false, qualita: false, dvr: false }; }

        return {
            carica: carica, ricarica: ricarica, aggiornaTitolo: aggiornaTitolo,
            mostra: mostra, distruggi: distruggi, stato: stato, capacita: capacita
        };
    }

    window.NGBPlayerAzoto = { nome: 'azoto', crea: crea, eAzoto: eAzoto };
})();
