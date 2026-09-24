/* ============================================================
   Il video della diretta: da dove arriva. UNA sola funzione.
   ------------------------------------------------------------
   Il gestore incolla nella gestione quello che gli da' la web TV
   (o YouTube): questo file capisce che cos'e' e lo trasforma nel
   valore che il player sa riprodurre. Lo usano:
     - la gestione (diretta/gestione/), per controllare il link prima
       di salvarlo e per i messaggi d'errore;
     - il player (diretta/player-webtv.js), per scegliere come
       riprodurre;
     - il servizio su Vercel (email-service/lib/diretta-sorgente-video.js),
       che ne tiene una COPIA IDENTICA, come per nome-utente.js: la
       prova email-service/prove/diretta-video.prove.js confronta i due
       file e diventa rossa se divergono. Si modifica QUI e si ricopia.

   COSA SI ACCETTA (sempre e solo indirizzi https):
     - il link HLS della web TV, quello che finisce con .m3u8
       (anche con ?token=... dopo): si riproduce con il NOSTRO player,
       con i nostri comandi;                                  -> 'hls'
     - un file video (.mp4, .webm, .m4v, .mov): idem;         -> 'file'
     - il link del player della web TV, oppure tutto il codice da
       incorporare (<iframe src="...">): si mostra il player della
       web TV dentro la nostra pagina, con i SUOI comandi;    -> 'incorporato'
     - un link o un identificativo di YouTube, come prima.    -> 'youtube'
   Non si accettano: indirizzi http (il browser li bloccherebbe in una
   pagina https), indirizzi con nome utente e password dentro, i link
   DASH (.mpd, che i browser non riproducono da soli) e i link RTMP/RTSP
   (sono per i programmi di trasmissione, non per i browser).

   leggi(testo) -> { tipo, valore } oppure { errore } oppure null (vuoto).
   Il valore e' quello che si salva e che il player riceve: per YouTube
   l'identificativo di 11 caratteri, per il resto l'indirizzo https.

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

    /* YouTube: il link della pagina (watch?v=), quello breve (youtu.be/),
       quello della diretta (/live/), quello da incorporare (/embed/) o il
       solo identificativo. */
    function idYouTube(v) {
        var s = String(v == null ? '' : v).trim();
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

    // dal codice da incorporare si prende l'indirizzo del player
    function daCodiceIncorporato(s) {
        var m = /<iframe\b[^>]*?\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(s);
        if (!m) return '';
        return String(m[2] || m[3] || m[4] || '').replace(/&amp;/g, '&').trim();
    }

    function leggi(v) {
        var s = String(v == null ? '' : v).trim();
        if (!s) return null;
        if (/<iframe\b/i.test(s)) {
            s = daCodiceIncorporato(s);
            if (!s) return { errore: 'codice' };
        }
        // un link di YouTube prima di tutto (anche scritto senza https://)
        if (/youtu\.?be|^[A-Za-z0-9_-]{11}$/i.test(s)) {
            var yt = idYouTube(s);
            if (yt) return { tipo: 'youtube', valore: yt };
        }
        if (/^(rtmps?|rtsp|srt):/i.test(s)) return { errore: 'rtmp' };
        if (/^http:\/\//i.test(s)) return { errore: 'https' };
        if (!/^https:\/\//i.test(s)) return { errore: 'formato' };
        if (s.length > LUNGHEZZA_MASSIMA) return { errore: 'lungo' };
        if (/[\s<>"'`\\]/.test(s)) return { errore: 'formato' };
        var u;
        try { u = new URL(s); } catch (e) { return { errore: 'formato' }; }
        if (u.protocol !== 'https:') return { errore: 'https' };
        if (u.username || u.password) return { errore: 'credenziali' };
        if (!/^[a-z0-9.-]+\.[a-z0-9-]{2,}$/i.test(u.hostname) && !/^\[[0-9a-f:]+\]$/i.test(u.hostname)) return { errore: 'formato' };
        var percorso = u.pathname.toLowerCase();
        if (/\.mpd$/.test(percorso)) return { errore: 'dash' };
        if (/\.m3u8$/.test(percorso)) { u.hash = ''; return { tipo: 'hls', valore: u.href }; }
        if (/\.(mp4|webm|m4v|mov)$/.test(percorso)) { u.hash = ''; return { tipo: 'file', valore: u.href }; }
        return { tipo: 'incorporato', valore: u.href };
    }

    // il tipo di un valore gia' salvato (quello che riceve il player)
    function tipoDi(valore) {
        var s = leggi(valore);
        return s && !s.errore ? s.tipo : '';
    }

    var MESSAGGI = {
        vuoto: 'Incolla il link della diretta.',
        codice: 'Nel codice da incorporare non trovo l\'indirizzo del player (src="https://…").',
        rtmp: 'Questo è l\'indirizzo per trasmettere (RTMP/RTSP/SRT), non per guardare: chiedi alla web TV il link HLS (.m3u8) o il codice da incorporare.',
        https: 'Serve un indirizzo che comincia con https:// (con http:// il browser non mostra il video in una pagina sicura).',
        formato: 'Non riconosco un link valido: incolla il link HLS della web TV (…/playlist.m3u8), il link del suo player, il codice da incorporare, oppure un link YouTube.',
        lungo: 'Il link è troppo lungo (più di ' + LUNGHEZZA_MASSIMA + ' caratteri).',
        credenziali: 'Il link contiene un nome utente e una password: non va usato in una pagina pubblica. Chiedi alla web TV un link senza credenziali.',
        dash: 'I link DASH (.mpd) i browser non li riproducono da soli: chiedi alla web TV il link HLS (.m3u8) o il codice da incorporare.'
    };
    function messaggio(esito) {
        if (!esito) return MESSAGGI.vuoto;
        return MESSAGGI[esito.errore] || MESSAGGI.formato;
    }

    return {
        LUNGHEZZA_MASSIMA: LUNGHEZZA_MASSIMA,
        leggi: leggi,
        tipoDi: tipoDi,
        messaggio: messaggio,
        idYouTube: idYouTube
    };
}));
