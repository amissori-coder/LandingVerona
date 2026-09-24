/* ============================================================
   IL PLAYER DELLA DIRETTA: YouTube (API IFrame ufficiale)
   ------------------------------------------------------------
   Tutto quello che sa di YouTube sta in questo file. La pagina
   della diretta (diretta.js) e l'anteprima della regia in gestione
   parlano solo con l'interfaccia qui sotto, che e' la stessa per
   qualunque fornitore: per passare a Vimeo, Mux o Cloudflare Stream
   si scrive un player-<nome>.js con le stesse funzioni e si cambia
   la riga <script> nelle due pagine. Niente altro.

       window.NGBPlayer = { nome, crea(contenitore, opzioni), idDa(url) }

   crea() restituisce un'istanza con:
       carica(idVideo)  play()  pausa()  alterna()
       muto()  smuto()  eMuto()  volume(n)  leggiVolume()
       vaiAlLive()  livelliQualita()  impostaQualita(v)
       stato()  -> 'non-avviato' | 'riproduzione' | 'pausa' | 'buffering' | 'fine'
       mostra(bool)  distruggi()
   opzioni: { onPronto(), onStato(stato), onErrore({codice, messaggio}),
              onVolume({volume, muto}), livelloTrasparente: false }

   L'API di YouTube (https://www.youtube.com/iframe_api) si scarica
   una volta sola e solo quando serve davvero un video: chi resta
   nella schermata di attesa non la carica mai.

   I LIMITI DI YOUTUBE, DETTI CHIARAMENTE.
   - I termini di YouTube (Required Minimum Functionality) vietano di
     mettere qualunque cosa DAVANTI al player o di oscurarlo, compresi
     i nostri comandi. Per questo la barra dei comandi sta SOTTO il
     video e, in pausa o a fine diretta, il player si nasconde
     (mostra(false)) e al suo posto, non sopra, compare la nostra
     schermata.
   - Il "livello trasparente che blocca i clic" chiesto per la pagina
     c'e' (opzione livelloTrasparente) ma e' SPENTO: coprire il player,
     anche con un velo invisibile, viola la stessa regola.
   - Alcuni segni di YouTube non si possono togliere: il logo o il
     titolo che compaiono all'avvio e al passaggio del mouse, la
     scritta "Guarda su YouTube", la schermata d'errore di YouTube.
     modestbranding e' ancora nei parametri ma YouTube lo ignora
     dall'agosto 2023; rel=0 limita i suggerimenti al solo canale.
   - La qualita' la sceglie YouTube (vedi livelliQualita).
   ============================================================ */
(function () {
    'use strict';

    var URL_API = 'https://www.youtube.com/iframe_api';
    // il dominio "senza cookie" di YouTube: niente cookie di profilazione
    // finche' la persona non preme play (e con autoplay muto, al minimo)
    var HOST = 'https://www.youtube-nocookie.com';
    // se il player non si presenta entro questo tempo, lo si dice alla pagina
    var ATTESA_PRONTO_MS = 10000;

    var STATI = { '-1': 'non-avviato', '0': 'fine', '1': 'riproduzione', '2': 'pausa', '3': 'buffering', '5': 'non-avviato' };
    var ERRORI = {
        2: 'Il collegamento al video non è valido.',
        5: 'Il video non si può riprodurre in questo browser.',
        100: 'Il video non esiste più o è privato.',
        101: 'Il proprietario del video non ne consente la visione in altri siti.',
        150: 'Il proprietario del video non ne consente la visione in altri siti.',
        153: 'YouTube non ha ricevuto l\'indirizzo della pagina (impostazioni del browser).'
    };

    /* ---------- l'API di YouTube, una volta sola ---------- */
    var promessaApi = null;
    function caricaApi() {
        if (window.YT && typeof window.YT.Player === 'function') return Promise.resolve(window.YT);
        if (promessaApi) return promessaApi;
        promessaApi = new Promise(function (risolvi, rifiuta) {
            // YouTube chiama questa funzione globale quando e' pronta: si
            // conserva quella eventualmente gia' definita da altro codice
            var precedente = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = function () {
                if (typeof precedente === 'function') { try { precedente(); } catch (e) { /* non e' nostra */ } }
                risolvi(window.YT);
            };
            var s = document.createElement('script');
            s.src = URL_API;
            s.async = true;
            s.onerror = function () {
                // si potra' riprovare: la prossima richiesta riscarica il file
                promessaApi = null;
                if (s.parentNode) s.parentNode.removeChild(s);
                rifiuta(new Error('api-youtube'));
            };
            document.head.appendChild(s);
        });
        return promessaApi;
    }

    /* L'identificativo di un video YouTube da quello che il gestore incolla:
       youtu.be/ID, youtube.com/watch?v=ID, /live/ID, /embed/ID, /shorts/ID,
       il dominio nocookie, oppure l'identificativo da solo. Stesse regole di
       idYouTube() nel servizio. '' se non si riconosce niente. */
    function idDa(indirizzo) {
        var s = String(indirizzo == null ? '' : indirizzo).trim();
        if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
        var u;
        try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { return ''; }
        var host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
        var id = '';
        if (host === 'youtu.be') id = u.pathname.split('/')[1] || '';
        else if (/(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
            if (u.searchParams.get('v')) id = u.searchParams.get('v');
            else {
                var m = /^\/(embed|live|shorts|v)\/([^/?#]+)/.exec(u.pathname);
                if (m) id = m[2];
            }
        }
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
    }

    /* ---------- un'istanza del player ---------- */
    function crea(contenitore, opzioni) {
        opzioni = opzioni || {};
        var yt = null;              // il YT.Player
        var ospite = null;          // il segnaposto che YouTube sostituisce con l'iframe
        var livello = null;         // il velo trasparente (spento, vedi sopra)
        var pronto = false;
        var attesaScaduta = false;  // onReady non e' arrivato in tempo, o l'API non si e' caricata
        var distrutto = false;
        var idCorrente = '';
        var idInSospeso = '';       // chiesto prima che il player fosse pronto
        var statoCorrente = 'non-avviato';
        var visibile = true;
        // Il nostro ricordo dell'audio. YouTube aggiorna isMuted() e
        // getVolume() con un attimo di ritardo dopo i comandi: la pagina
        // ha bisogno di sapere subito che cosa ha chiesto.
        var mutoNostro = true;
        var volumeNostro = 100;
        var timerPronto = null;
        var timerLive = null;

        function avvisa(nome, dati) {
            var f = opzioni[nome];
            if (typeof f !== 'function') return;
            try { f(dati); } catch (e) { setTimeout(function () { throw e; }); }
        }
        function avvisaVolume() { avvisa('onVolume', { volume: volumeNostro, muto: mutoNostro }); }
        function comando(fn) {
            if (!yt || !pronto) return;
            try { fn(yt); } catch (e) { /* il player si sta ricaricando: il comando si perde, come un clic a vuoto */ }
        }
        function iframe() {
            var f = null;
            try { f = yt && typeof yt.getIframe === 'function' ? yt.getIframe() : null; } catch (e) { f = null; }
            return f || contenitore.querySelector('iframe');
        }
        function applicaVisibilita() {
            var f = iframe();
            if (f) {
                // visibility e non display: l'iframe resta vivo e pronto a
                // ripartire, ma non si vede ne' si raggiunge con il tasto Tab
                f.style.visibility = visibile ? '' : 'hidden';
                if (visibile) f.removeAttribute('aria-hidden');
                else f.setAttribute('aria-hidden', 'true');
            }
            if (livello) livello.hidden = !visibile;
        }

        /* Il velo trasparente sopra il video: RICHIESTO, IMPLEMENTATO,
           SPENTO. Bloccherebbe i clic diretti su YouTube (e quindi i
           suggerimenti e il logo cliccabile), ma i termini di YouTube
           vietano di coprire il player: attivarlo esporrebbe il canale
           al blocco dell'incorporamento. Resta qui per un eventuale
           fornitore diverso che lo consenta. */
        if (opzioni.livelloTrasparente === true) {
            livello = document.createElement('div');
            livello.className = 'ngb-player-livello';
            livello.setAttribute('aria-hidden', 'true');
            livello.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:2;background:transparent;';
            contenitore.appendChild(livello);
        }

        function smonta() {
            clearTimeout(timerPronto);
            clearTimeout(timerLive);
            if (yt) { try { yt.destroy(); } catch (e) { /* gia' smontato */ } }
            yt = null;
            pronto = false;
            if (ospite && ospite.parentNode) ospite.parentNode.removeChild(ospite);
            ospite = null;
            // l'iframe, se destroy() non l'ha tolto (o se l'API non e' mai arrivata)
            Array.prototype.slice.call(contenitore.querySelectorAll('iframe')).forEach(function (f) {
                if (f.parentNode) f.parentNode.removeChild(f);
            });
        }

        function monta(id) {
            smonta();
            idCorrente = id;
            idInSospeso = '';
            attesaScaduta = false;
            statoCorrente = 'non-avviato';
            // un player nuovo parte sempre muto (autoplay): la pagina lo sa
            // e rimette in vista il pulsante "Attiva l'audio"
            if (!mutoNostro) { mutoNostro = true; avvisaVolume(); }
            var mio = document.createElement('div');
            mio.className = 'ngb-player-ospite';
            mio.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
            ospite = mio;
            contenitore.insertBefore(mio, livello);

            timerPronto = setTimeout(function () {
                if (distrutto || ospite !== mio || pronto) return;
                attesaScaduta = true;
                avvisa('onErrore', { codice: 'lento', messaggio: 'Il video non risponde.' });
            }, ATTESA_PRONTO_MS);

            caricaApi().then(function (YT) {
                if (distrutto || ospite !== mio) return;
                yt = new YT.Player(mio, {
                    host: HOST,
                    videoId: id,
                    width: '100%',
                    height: '100%',
                    playerVars: {
                        autoplay: 1,        // parte da solo...
                        mute: 1,            // ...ma muto: i browser bloccano l'audio automatico
                        controls: 0,        // i comandi sono i nostri, sotto il video
                        rel: 0,             // a fine video, suggerimenti solo dello stesso canale
                        modestbranding: 1,  // ignorato da YouTube dal 2023: resta per i player vecchi
                        playsinline: 1,     // su iPhone il video resta nella pagina
                        disablekb: 1,       // la tastiera la gestisce la pagina
                        iv_load_policy: 3,  // niente annotazioni
                        fs: 0,              // lo schermo intero e' il nostro (con i nostri comandi)
                        cc_load_policy: 0,
                        enablejsapi: 1,
                        origin: location.origin
                    },
                    events: {
                        onReady: function (e) {
                            if (distrutto || ospite !== mio) return;
                            if (e && e.target) yt = e.target;
                            pronto = true;
                            attesaScaduta = false;
                            clearTimeout(timerPronto);
                            var f = iframe();
                            if (f) f.setAttribute('title', 'Video della diretta');
                            applicaVisibilita();
                            // quello che la pagina ha chiesto mentre il player nasceva
                            if (!mutoNostro) comando(function (p) { p.unMute(); });
                            if (volumeNostro !== 100) comando(function (p) { p.setVolume(volumeNostro); });
                            avvisa('onPronto');
                            if (idInSospeso && idInSospeso !== idCorrente) {
                                var d = idInSospeso;
                                idInSospeso = '';
                                carica(d);
                            }
                        },
                        onStateChange: function (e) {
                            if (distrutto || ospite !== mio) return;
                            var s = STATI[String(e && e.data)];
                            if (!s) return;
                            statoCorrente = s;
                            avvisa('onStato', s);
                        },
                        onError: function (e) {
                            if (distrutto || ospite !== mio) return;
                            var c = Number(e && e.data);
                            avvisa('onErrore', { codice: c, messaggio: ERRORI[c] || ('Errore del video (' + c + ').') });
                        }
                    }
                });
                /* L'iframe nasce adesso (YouTube lo mette al posto del
                   segnaposto), ma onReady arriva piu' tardi. Se intanto la
                   pagina ha chiesto di nasconderlo (una nostra schermata al
                   suo posto: errore, nuovo tentativo, pausa), deve nascere
                   gia' nascosto: mai un video visibile SOTTO una nostra
                   schermata. */
                applicaVisibilita();
            }, function () {
                if (distrutto || ospite !== mio) return;
                attesaScaduta = true;
                clearTimeout(timerPronto);
                avvisa('onErrore', { codice: 'api', messaggio: 'Il servizio video non è raggiungibile.' });
            });
        }

        /* Carica (o cambia) il video. Il primo carica() crea il player; i
           successivi cambiano video SENZA ricreare niente: e' cosi' che chi
           e' collegato passa al nuovo link della regia senza ricaricare. */
        function carica(id) {
            id = String(id == null ? '' : id);
            if (distrutto || !id) return;
            if (yt && pronto) {
                idCorrente = id;
                clearTimeout(timerLive);
                comando(function (p) { p.loadVideoById(id); });
                return;
            }
            // player assente, bloccato o mai arrivato: si riparte da capo
            if (!ospite || attesaScaduta) { monta(id); return; }
            // sta nascendo: il video giusto lo carica appena e' pronto
            if (id !== idCorrente) idInSospeso = id;
        }

        function play() { comando(function (p) { p.playVideo(); }); }
        function pausa() { comando(function (p) { p.pauseVideo(); }); }
        function alterna() {
            if (statoCorrente === 'riproduzione' || statoCorrente === 'buffering') pausa();
            else play();
        }
        function muto() { mutoNostro = true; comando(function (p) { p.mute(); }); avvisaVolume(); }
        function smuto() { mutoNostro = false; comando(function (p) { p.unMute(); }); avvisaVolume(); }
        /* Lo stato VERO riferito da YouTube (serve per capire se il browser
           ha davvero concesso l'audio); prima che il player sia pronto, quello
           chiesto dalla pagina. */
        function eMuto() {
            if (yt && pronto && typeof yt.isMuted === 'function') {
                try { return !!yt.isMuted(); } catch (e) { /* ripiego sotto */ }
            }
            return mutoNostro;
        }
        function volume(n) {
            n = Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
            volumeNostro = n;
            comando(function (p) { p.setVolume(n); });
            avvisaVolume();
        }
        function leggiVolume() { return volumeNostro; }

        /* "Torna in diretta": la diretta di YouTube si puo' riavvolgere; qui si
           salta alla fine (il momento piu' recente). Se dopo 2 secondi si e'
           ancora indietro di piu' di 30 s (succede dopo una lunga pausa), si
           ricarica il video, che riparte dal vivo. */
        function vaiAlLive() {
            comando(function (p) {
                var d = Number(p.getDuration()) || 0;
                if (d > 0) p.seekTo(d, true);
                p.playVideo();
            });
            clearTimeout(timerLive);
            timerLive = setTimeout(function () {
                comando(function (p) {
                    if ((Number(p.getDuration()) || 0) - (Number(p.getCurrentTime()) || 0) > 30) p.loadVideoById(idCorrente);
                });
            }, 2000);
        }

        /* La qualita' la sceglie YouTube: setPlaybackQuality() non fa piu'
           niente dal 2019 e getAvailableQualityLevels() non dice il vero.
           Offrire un menu che non funziona confonderebbe: la pagina nasconde
           il selettore. Con un fornitore che la consente (Vimeo, Mux,
           Cloudflare) qui si restituiranno i livelli veri. */
        function livelliQualita() { return []; }
        function impostaQualita() { /* vedi livelliQualita */ }

        function stato() { return statoCorrente; }
        function mostra(si) { visibile = !!si; applicaVisibilita(); }
        function distruggi() {
            distrutto = true;
            smonta();
            if (livello && livello.parentNode) livello.parentNode.removeChild(livello);
            livello = null;
        }

        return {
            carica: carica, play: play, pausa: pausa, alterna: alterna,
            muto: muto, smuto: smuto, eMuto: eMuto, volume: volume, leggiVolume: leggiVolume,
            vaiAlLive: vaiAlLive, livelliQualita: livelliQualita, impostaQualita: impostaQualita,
            stato: stato, mostra: mostra, distruggi: distruggi
        };
    }

    window.NGBPlayer = { nome: 'youtube', crea: crea, idDa: idDa };
})();
