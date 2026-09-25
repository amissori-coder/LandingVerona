/* ============================================================
   Il video della diretta: da dove arriva. UNA sola funzione.
   ------------------------------------------------------------
   Il video arriva SOLO dalla web TV Azoto Solutions, in una delle due
   modalita' che la gestione sceglie per ogni evento (tipoPlayer):
     A) 'azoto'  il PLAYER DI AZOTO dentro un iframe della nostra
                 pagina (la modalita' predefinita, da usare ora): con i
                 comandi (e l'eventuale logo) di Azoto;
     B) 'flusso' il FLUSSO DIRETTO (.m3u8, o .mpd) riprodotto dal
                 NOSTRO player, con i nostri comandi e senza loghi:
                 quando Azoto ci dara' il link.
   Il gestore incolla nella gestione quello che gli da' Azoto: questo
   file capisce che cos'e' e lo trasforma nel valore che il player sa
   usare. Lo usano:
     - la gestione (diretta/gestione/), per controllare il link prima
       di provarlo e salvarlo, e per i messaggi d'errore;
     - i player (diretta/player-azoto.js e diretta/player-webtv.js), per
       ricontrollare il valore ricevuto e scegliere come riprodurre;
     - il servizio su Vercel (email-service/lib/diretta-sorgente-video.js),
       che ne tiene una COPIA IDENTICA, come per nome-utente.js: la
       prova email-service/prove/diretta-video.prove.js confronta i due
       file e diventa rossa se divergono. Si modifica QUI e si ricopia.

   COSA SI ACCETTA (sempre e solo indirizzi https):
     - il flusso HLS, il link che finisce con .m3u8 (anche con
       ?token=... dopo): lo riproduce il NOSTRO player    -> 'hls'
     - il flusso DASH, il link che finisce con .mpd: idem  -> 'dash'
     - il player di Azoto: l'indirizzo della sua pagina oppure tutto il
       codice che Azoto da' da incollare nel sito, per esempio
         <div class='azoto-player-container'>
         <iframe src='https://cdn.azotosolutions.com/cloudtv/livetvNN/player' ...></iframe>
         </div>
         <script src='https://azotosolutions.com/videojs/azoto-player.js'></script>
       Dal codice si prende SOLO l'indirizzo (src) del PRIMO <iframe>:
       tutto il resto (script, onload=, style, altri tag) si butta via,
       e l'iframe lo costruisce il nostro codice. L'indirizzo vale solo
       se e' di un server in HOST_AZOTO (cdn.azotosolutions.com, porta
       https normale): una pagina di qualunque altro sito non si
       incorpora, perche' dentro la nostra pagina si vedrebbe quello che
       quel sito decide.                                   -> 'incorporato'
   Non si accettano, con il motivo: indirizzi http (il browser li
   bloccherebbe in una pagina https), indirizzi con nome utente e
   password dentro, i link RTMP/RTSP/SRT (sono per trasmettere, non
   per guardare), i file video e i segmenti (.mp4, .ts...: non sono
   una diretta), le pagine che non sono il player di Azoto, i link
   troppo lunghi e il testo che non e' un link (anche javascript:,
   data: e simili).

   leggi(testo)    -> { tipo, valore } | { errore } | null (vuoto): tutti
                      e tre i tipi (e' la regola della prova del link);
   perAzoto(testo) -> il campo «Player Azoto»: solo 'incorporato' (un
                      flusso qui e' l'errore 'e-flusso');
   perFlusso(testo)-> il campo «Flusso diretto (.m3u8)»: solo 'hls' e
                      'dash' (il player di Azoto qui e' l'errore 'e-azoto');
   eAzoto(url)     -> true se url e' l'indirizzo di un player di Azoto
                      (un indirizzo, non il codice da incollare).
   Il valore e' quello che si salva e che il player riceve: l'indirizzo
   https normalizzato (per HLS e DASH senza il #...).

   Niente dipendenze: gira uguale nel browser (window.NGBSorgenteVideo)
   e in Node (require).
   ============================================================ */
(function (radice, fabbrica) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.NGBSorgenteVideo = fabbrica();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var LUNGHEZZA_MASSIMA = 1000;
    var TIPI = ['hls', 'dash', 'incorporato'];
    // i server del player di Azoto che si possono incorporare: SOLO qui
    var HOST_AZOTO = Object.freeze(['cdn.azotosolutions.com']);
    // file video e segmenti: si possono scaricare, ma non sono una diretta
    var RE_FILE = /\.(mp4|m4v|mov|webm|mkv|avi|flv|ts|m4s)$/;

    var AVVISO_INCORPORATO = 'Con il player Azoto restano i comandi (e l\'eventuale logo) di Azoto: per usare i nostri comandi serve il link .m3u8 del flusso diretto, da chiedere ad Azoto.';

    /* Dal codice incollato si prende l'indirizzo (src) del PRIMO <iframe>,
       e nient'altro. Si leggono gli attributi del tag uno per uno, come
       fa il browser: il valore fra virgolette doppie, singole o senza
       virgolette (allora fino allo spazio o a '>'); un '>' dentro le
       virgolette non chiude il tag; conta solo l'attributo che si chiama
       proprio src (non data-src, non srcdoc). Nel valore &amp; torna '&'.
       Restituisce '' se il primo iframe non ha src. Quello che esce e'
       solo un testo: leggi() lo controlla poi come ogni link incollato. */
    function srcDelPrimoIframe(s) {
        var i = s.search(/<iframe\b/i);
        if (i < 0) return '';
        var re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?|(>)|[\s\S]/g;
        var resto = s.slice(i + 7);
        var m;
        while ((m = re.exec(resto))) {
            if (m[5]) return '';                        // fine del tag, senza src
            if (m[1] && m[1].toLowerCase() === 'src') {
                var v = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
                return String(v || '').replace(/&amp;/gi, '&').trim();
            }
        }
        return '';
    }

    /* Il nome del server: un nome con almeno un punto e un dominio di
       primo livello di lettere (webtv.esempio.it), oppure un indirizzo
       IP scritto per intero. localhost e i nomi senza punto no. Se un
       indirizzo IP e' pubblico lo controlla il servizio. */
    function hostValido(h) {
        if (/^\[[0-9a-f:.]+\]$/i.test(h)) return true;
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return h.split('.').every(function (n) { return +n <= 255; });
        return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+(xn--[a-z0-9-]+|[a-z]{2,})$/i.test(h);
    }

    /* L'indirizzo (gia' letto da URL) e' del player di Azoto? Il nome del
       server esattamente uno di HOST_AZOTO (non un sottodominio, non un
       nome che lo contiene) e la porta https normale (URL toglie gia'
       :443, quindi port e' ''); un'altra porta no. */
    function hostAzoto(u) {
        return HOST_AZOTO.indexOf(u.hostname.toLowerCase()) >= 0 && u.port === '';
    }

    function leggi(v) {
        var s = String(v == null ? '' : v).trim();
        if (!s) return null;
        // codice da incollare (c'e' almeno un tag): se ne prende solo l'indirizzo del primo iframe
        if (/<[a-z!\/]/i.test(s)) {
            s = srcDelPrimoIframe(s);
            if (!s) return { errore: 'codice' };
        }
        if (/^(rtmp[set]?|rtsp|srt):/i.test(s)) return { errore: 'rtmp' };
        if (/^http:\/\//i.test(s)) return { errore: 'https' };
        if (!/^https:\/\//i.test(s)) return { errore: 'formato' };
        if (s.length > LUNGHEZZA_MASSIMA) return { errore: 'lungo' };
        if (/[\s<>"'`\\]/.test(s)) return { errore: 'formato' };
        var u;
        try { u = new URL(s); } catch (e) { return { errore: 'formato' }; }
        if (u.protocol !== 'https:') return { errore: 'https' };
        if (u.username || u.password) return { errore: 'credenziali' };
        if (!hostValido(u.hostname)) return { errore: 'formato' };
        var percorso = u.pathname.toLowerCase();
        if (/\.m3u8$/.test(percorso)) { u.hash = ''; return { tipo: 'hls', valore: u.href }; }
        if (/\.mpd$/.test(percorso)) { u.hash = ''; return { tipo: 'dash', valore: u.href }; }
        if (RE_FILE.test(percorso)) return { errore: 'file' };
        // una pagina da incorporare: SOLO il player di Azoto
        if (!hostAzoto(u)) return { errore: 'non-azoto' };
        return { tipo: 'incorporato', valore: u.href };
    }

    /* Il campo «Player Azoto» della gestione: il codice di Azoto o
       l'indirizzo del suo player. Un flusso .m3u8/.mpd incollato qui va
       nell'altro campo (e lo si dice). */
    function perAzoto(v) {
        var s = leggi(v);
        if (!s || s.errore) return s;
        if (s.tipo !== 'incorporato') return { errore: 'e-flusso' };
        return s;
    }

    /* Il campo «Flusso diretto (.m3u8)»: solo HLS o DASH. Il player di
       Azoto incollato qui va nell'altro campo (e lo si dice); una pagina
       di un altro sito qui non e' un flusso. */
    function perFlusso(v) {
        var s = leggi(v);
        if (!s) return s;
        if (s.errore === 'non-azoto') return { errore: 'non-flusso' };
        if (s.errore) return s;
        if (s.tipo === 'incorporato') return { errore: 'e-azoto' };
        return s;
    }

    /* Un valore gia' salvato e' l'indirizzo di un player di Azoto? Solo
       un indirizzo (il codice da incollare non vale: il player mette il
       valore nell'iframe cosi' com'e'). */
    function eAzoto(valore) {
        if (typeof valore !== 'string' || valore.indexOf('<') >= 0) return false;
        var s = leggi(valore);
        return !!s && s.tipo === 'incorporato';
    }

    // il tipo di un valore gia' salvato (quello che riceve il player)
    function tipoDi(valore) {
        var s = leggi(valore);
        return s && !s.errore ? s.tipo : '';
    }

    var DESCRIZIONI = {
        hls: 'Flusso HLS (.m3u8): lo riproduce il nostro player, con i nostri comandi e senza loghi.',
        dash: 'Flusso DASH (.mpd): lo riproduce il nostro player.',
        incorporato: 'Player Azoto: si vede dentro la nostra pagina con i comandi di Azoto.'
    };
    function descrizione(tipo) {
        return DESCRIZIONI[tipo] || '';
    }

    var MESSAGGI = {
        vuoto: 'Incolla il link della diretta.',
        codice: 'Nel codice incollato non trovo l\'indirizzo del player (<iframe src="https://…">): incolla tutto il codice che vi ha dato Azoto, oppure solo l\'indirizzo del player.',
        rtmp: 'Questo è l\'indirizzo per trasmettere (RTMP/RTSP/SRT), non per guardare: chiedi alla web TV il link HLS (.m3u8) in https.',
        https: 'Serve un indirizzo che comincia con https:// (con http:// il browser non mostra il video in una pagina sicura): chiedi alla web TV il link in https.',
        formato: 'Non riconosco un link valido: incolla il codice o l\'indirizzo del player Azoto (https://' + HOST_AZOTO[0] + '/…) oppure il link del flusso diretto (…/playlist.m3u8).',
        lungo: 'Il link è troppo lungo (più di ' + LUNGHEZZA_MASSIMA + ' caratteri).',
        credenziali: 'Il link contiene un nome utente e una password: non va usato in una pagina pubblica. Chiedi alla web TV un link senza credenziali.',
        file: 'Questo è un file video (o un pezzo del flusso), non una diretta: chiedi alla web TV il link HLS (.m3u8) del canale.',
        'non-azoto': 'Per il player Azoto si accetta solo un indirizzo https di ' + HOST_AZOTO.join(' o ') + ' (quello nel codice che vi ha dato Azoto).',
        'non-flusso': 'Questo non è il link di un flusso diretto: serve il link che finisce con .m3u8 (HLS) o .mpd (DASH), da chiedere ad Azoto.',
        'e-flusso': 'Questo è il link di un flusso diretto: va nel campo «Flusso diretto (.m3u8)».',
        'e-azoto': 'Questo è l\'indirizzo del player Azoto: va nel campo «Player Azoto».'
    };
    function messaggio(esito) {
        if (!esito) return MESSAGGI.vuoto;
        if (!esito.errore && DESCRIZIONI[esito.tipo]) return DESCRIZIONI[esito.tipo];
        return MESSAGGI[esito.errore] || MESSAGGI.formato;
    }

    return {
        LUNGHEZZA_MASSIMA: LUNGHEZZA_MASSIMA,
        TIPI: TIPI,
        HOST_AZOTO: HOST_AZOTO,
        AVVISO_INCORPORATO: AVVISO_INCORPORATO,
        leggi: leggi,
        perAzoto: perAzoto,
        perFlusso: perFlusso,
        eAzoto: eAzoto,
        tipoDi: tipoDi,
        messaggio: messaggio,
        descrizione: descrizione
    };
}));
