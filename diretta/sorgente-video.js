/* ============================================================
   Il video della diretta: da dove arriva. UNA sola funzione.
   ------------------------------------------------------------
   Il video arriva SOLO dal canale streaming di una web TV. Il gestore
   incolla nella gestione il link che gli da' la web TV: questo file
   capisce che cos'e' e lo trasforma nel valore che il player sa
   riprodurre. Lo usano:
     - la gestione (diretta/gestione/), per controllare il link prima
       di provarlo e salvarlo, e per i messaggi d'errore;
     - il player (diretta/player-webtv.js), per scegliere come
       riprodurre;
     - il servizio su Vercel (email-service/lib/diretta-sorgente-video.js),
       che ne tiene una COPIA IDENTICA, come per nome-utente.js: la
       prova email-service/prove/diretta-video.prove.js confronta i due
       file e diventa rossa se divergono. Si modifica QUI e si ricopia.

   COSA SI ACCETTA (sempre e solo indirizzi https):
     - il flusso HLS della web TV, il link che finisce con .m3u8
       (anche con ?token=... dopo): e' il CASO PRINCIPALE, lo
       riproduce il NOSTRO player, con i nostri comandi e senza
       loghi;                                                -> 'hls'
     - il flusso DASH, il link che finisce con .mpd: idem, con la
       libreria adatta;                                      -> 'dash'
     - la pagina del player della web TV, oppure tutto il codice da
       incorporare (<iframe src="...">): si mostra il player della
       web TV dentro la nostra pagina, con i SUOI comandi e i SUOI
       loghi. E' solo un ripiego (vedi AVVISO_INCORPORATO); se la
       pagina si puo' davvero incorporare lo dice la prova del link
       (azione 'prova-link' del servizio).                   -> 'incorporato'
   Non si accettano, con il motivo: indirizzi http (il browser li
   bloccherebbe in una pagina https), indirizzi con nome utente e
   password dentro, i link RTMP/RTSP/SRT (sono per trasmettere, non
   per guardare), i file video e i segmenti (.mp4, .ts...: non sono
   una diretta), i link troppo lunghi e il testo che non e' un link.

   leggi(testo) -> { tipo, valore } oppure { errore } oppure null (vuoto).
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
    // file video e segmenti: si possono scaricare, ma non sono una diretta
    var RE_FILE = /\.(mp4|m4v|mov|webm|mkv|avi|flv|ts|m4s)$/;

    var AVVISO_INCORPORATO = 'Con questo tipo di link non possiamo togliere il logo della web TV né usare i nostri comandi: chiedete alla web TV il link .m3u8';

    // dal codice da incorporare si prende l'indirizzo del player
    function daCodiceIncorporato(s) {
        var m = /<iframe\b[^>]*?\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(s);
        if (!m) return '';
        return String(m[2] || m[3] || m[4] || '').replace(/&amp;/g, '&').trim();
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

    function leggi(v) {
        var s = String(v == null ? '' : v).trim();
        if (!s) return null;
        if (/<iframe\b/i.test(s)) {
            s = daCodiceIncorporato(s);
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
        return { tipo: 'incorporato', valore: u.href };
    }

    // il tipo di un valore gia' salvato (quello che riceve il player)
    function tipoDi(valore) {
        var s = leggi(valore);
        return s && !s.errore ? s.tipo : '';
    }

    var DESCRIZIONI = {
        hls: 'Flusso HLS (.m3u8): lo riproduce il nostro player, con i nostri comandi e senza loghi.',
        dash: 'Flusso DASH (.mpd): lo riproduce il nostro player.',
        incorporato: 'Pagina della web TV da incorporare: è un ripiego (vedi avviso).'
    };
    function descrizione(tipo) {
        return DESCRIZIONI[tipo] || '';
    }

    var MESSAGGI = {
        vuoto: 'Incolla il link della diretta.',
        codice: 'Nel codice da incorporare non trovo l\'indirizzo del player (src="https://…").',
        rtmp: 'Questo è l\'indirizzo per trasmettere (RTMP/RTSP/SRT), non per guardare: chiedi alla web TV il link HLS (.m3u8) in https.',
        https: 'Serve un indirizzo che comincia con https:// (con http:// il browser non mostra il video in una pagina sicura): chiedi alla web TV il link in https.',
        formato: 'Non riconosco un link valido: incolla il link HLS della web TV (…/playlist.m3u8), il link DASH (…/manifest.mpd) oppure, come ripiego, il link del suo player o il codice da incorporare.',
        lungo: 'Il link è troppo lungo (più di ' + LUNGHEZZA_MASSIMA + ' caratteri).',
        credenziali: 'Il link contiene un nome utente e una password: non va usato in una pagina pubblica. Chiedi alla web TV un link senza credenziali.',
        file: 'Questo è un file video (o un pezzo del flusso), non una diretta: chiedi alla web TV il link HLS (.m3u8) del canale.'
    };
    function messaggio(esito) {
        if (!esito) return MESSAGGI.vuoto;
        if (!esito.errore && DESCRIZIONI[esito.tipo]) return DESCRIZIONI[esito.tipo];
        return MESSAGGI[esito.errore] || MESSAGGI.formato;
    }

    return {
        LUNGHEZZA_MASSIMA: LUNGHEZZA_MASSIMA,
        TIPI: TIPI,
        AVVISO_INCORPORATO: AVVISO_INCORPORATO,
        leggi: leggi,
        tipoDi: tipoDi,
        messaggio: messaggio,
        descrizione: descrizione
    };
}));
