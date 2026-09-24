/* ============================================================
   Diretta degli eventi: la prova del link della web TV
   ------------------------------------------------------------
   Prima di salvare un link, la gestione lo fa provare al servizio
   (azione 'prova-link' di diretta-gestione): qui si scarica quello che
   c'e' dietro e si dice, in italiano, che cosa si e' capito e che cosa
   non va, con il testo pronto da girare alla web TV quando tocca a
   loro sistemare qualcosa.

   - HLS (.m3u8): playlist principale (master) o di una sola qualita'
     (media); le qualita' con RESOLUTION, BANDWIDTH e CODECS; diretta o
     registrazione (#EXT-X-ENDLIST, PLAYLIST-TYPE:VOD); la finestra per
     tornare indietro (somma degli #EXTINF); la durata dei segmenti; il
     CORS sulla playlist e su un segmento (richiesta Range piccola).
   - DASH (.mpd): type dynamic/static, timeShiftBufferDepth, le altezze
     delle Representation, il CORS sul manifest.
   - Pagina da incorporare: risposta 200, text/html, X-Frame-Options e
     Content-Security-Policy frame-ancestors confrontati con il nostro
     sito (https://nextgenerationbusiness.it).

   SICUREZZA (SSRF). La prova la chiede un gestore, ma a scaricare e'
   il nostro server: non deve poter diventare una porta verso la rete
   interna di Vercel o del fornitore. Quindi:
   - solo https, senza credenziali nel link;
   - il nome del server si risolve (DNS) e si rifiuta se anche UNO
     degli indirizzi e' privato, di loopback, link-local (169.254.x.x,
     i metadati dei cloud), CGNAT, multicast, riservato o IPv6 locale;
   - con il trasporto predefinito lo stesso controllo si ripete AL
     MOMENTO DELLA CONNESSIONE (lookup controllato di https.request):
     un DNS che cambia risposta fra il controllo e la connessione (DNS
     rebinding) non passa;
   - i reindirizzamenti si seguono a mano, al massimo 3, e ognuno si
     ricontrolla da capo (https, DNS, indirizzi);
   - ogni richiesta ha 8 secondi, tutta la prova al massimo 25; di ogni
     risposta si leggono al massimo 256 KB.
   Per le prove si possono passare `fetch` e `lookup` finti (opzioni).

   provaLink(link, opzioni) ->
     { esito: 'ok'|'avviso'|'errore', tipo, valore, titolo, righe,
       problemi: [{ codice, grave, messaggio, testoWebTv }], info, urlProva }
   `grave` vuol dire: il link non si salva (esito 'errore'). Gli altri
   problemi sono avvisi: si puo' salvare dopo una conferma (per esempio
   un 404 prima che la diretta cominci e' normale).
   ============================================================ */
'use strict';
const net = require('net');
const dns = require('dns');
const https = require('https');
const zlib = require('zlib');
const { Readable } = require('stream');
const V = require('./diretta-sorgente-video');

const ORIGINE_SITO = 'https://nextgenerationbusiness.it';
const PREDEFINITE = {
    origine: ORIGINE_SITO,
    timeoutMs: 8000,
    budgetMs: 25000,
    maxByte: 256 * 1024,
    maxRedirect: 3
};
const UA = 'NGB-ProvaLink/1.0 (+' + ORIGINE_SITO + ')';

// i problemi che impediscono di salvare il link
const GRAVI = new Set(['https', 'formato', 'file', 'rtmp', 'credenziali', 'non-pubblico', 'non-incorporabile', 'non-html', 'non-e-hls', 'non-e-dash']);

/* ============================================================
   GLI INDIRIZZI PUBBLICI
   ============================================================ */

function ipv4Numero(ip) {
    const p = String(ip).split('.').map(Number);
    if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
const RETI_V4_NON_PUBBLICHE = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
].map(([base, bit]) => ({ base: ipv4Numero(base), maschera: bit === 0 ? 0 : (~0 << (32 - bit)) >>> 0 }));

function ipv4Pubblico(ip) {
    const n = ipv4Numero(ip);
    if (n === null) return false;
    return !RETI_V4_NON_PUBBLICHE.some(r => ((n & r.maschera) >>> 0) === r.base);
}

// '2001:db8::1' -> 8 gruppi da 16 bit (null se non e' IPv6)
function gruppiIpv6(ip) {
    let s = String(ip).toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
    let coda4 = [];
    const m = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (m) {
        const n = ipv4Numero(m[2]);
        if (n === null) return null;
        coda4 = [(n >>> 16) & 0xffff, n & 0xffff];
        s = m[1].endsWith('::') ? m[1] : m[1].replace(/:$/, '');
    }
    const parti = s.split('::');
    if (parti.length > 2) return null;
    const leggi = t => (t ? t.split(':') : []).map(g => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
    const testa = leggi(parti[0]);
    const coda = parti.length === 2 ? leggi(parti[1]) : [];
    const mancano = 8 - testa.length - coda.length - coda4.length;
    if (parti.length === 1 && mancano !== 0) return null;
    if (mancano < 0) return null;
    const g = testa.concat(new Array(parti.length === 2 ? mancano : 0).fill(0), coda, coda4);
    return g.length === 8 && g.every(x => Number.isInteger(x)) ? g : null;
}
function ipv4Da(g, i) {
    return [g[i] >>> 8, g[i] & 255, g[i + 1] >>> 8, g[i + 1] & 255].join('.');
}
function ipv6Pubblico(ip) {
    const g = gruppiIpv6(ip);
    if (!g) return false;
    // ::ffff:a.b.c.d (IPv4 dentro IPv6) e 64:ff9b::a.b.c.d (NAT64): conta l'IPv4
    if (g.slice(0, 5).every(x => x === 0) && g[5] === 0xffff) return ipv4Pubblico(ipv4Da(g, 6));
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every(x => x === 0)) return ipv4Pubblico(ipv4Da(g, 6));
    // 6to4: 2002:AABB:CCDD::/48 porta dentro l'IPv4 AA.BB.CC.DD
    if (g[0] === 0x2002) return ipv4Pubblico(ipv4Da(g, 1));
    // pubblici solo i 2000::/3 (unicast globale), meno documentazione e Teredo
    if ((g[0] & 0xe000) !== 0x2000) return false;
    if (g[0] === 0x2001 && g[1] === 0x0db8) return false;
    if (g[0] === 0x2001 && g[1] === 0x0000) return false;
    return true;
}
function indirizzoPubblico(ip) {
    const s = String(ip || '').replace(/^\[|\]$/g, '');
    const tipo = net.isIP(s.replace(/%.*$/, ''));
    if (tipo === 4) return ipv4Pubblico(s);
    if (tipo === 6) return ipv6Pubblico(s);
    return false;
}
// il nome del server e' un indirizzo IP scritto per intero?
function eIndirizzoIp(host) {
    return net.isIP(String(host || '').replace(/^\[|\]$/g, '')) !== 0;
}

/* ============================================================
   LE RICHIESTE
   ============================================================ */

// un errore della prova, gia' tradotto in un problema
function intoppo(codice, dettaglio, extra) {
    const e = new Error(codice + ': ' + (dettaglio || ''));
    e.intoppo = Object.assign({ codice: codice, dettaglio: dettaglio || '' }, extra || {});
    return e;
}

/* Il trasporto predefinito: https.request con il lookup controllato
   (gli indirizzi si ricontrollano alla connessione), e una Response
   come quella di fetch. I contenuti compressi si decomprimono. */
function lookupControllato(host, opzioni, cb) {
    dns.lookup(host, opzioni, (err, indirizzo, famiglia) => {
        if (err) return cb(err);
        const elenco = Array.isArray(indirizzo) ? indirizzo : [{ address: indirizzo, family: famiglia }];
        const cattivo = elenco.find(a => !indirizzoPubblico(a.address));
        if (cattivo || !elenco.length) {
            const e = new Error('indirizzo non pubblico');
            e.code = 'NGB_NON_PUBBLICO';
            return cb(e);
        }
        if (Array.isArray(indirizzo)) cb(null, indirizzo);
        else cb(null, indirizzo, famiglia);
    });
}
function fetchSicuro(indirizzo, init) {
    const o = init || {};
    return new Promise((risolvi, rifiuta) => {
        let u;
        try { u = new URL(indirizzo); } catch (e) { rifiuta(e); return; }
        if (u.protocol !== 'https:') { rifiuta(new Error('solo https')); return; }
        const host = u.hostname.replace(/^\[|\]$/g, '');
        if (eIndirizzoIp(host) && !indirizzoPubblico(host)) {
            const e = new Error('indirizzo non pubblico'); e.code = 'NGB_NON_PUBBLICO'; rifiuta(e); return;
        }
        const metodo = o.method || 'GET';
        const req = https.request({
            protocol: 'https:', hostname: host, port: u.port || 443, path: u.pathname + u.search, method: metodo,
            headers: o.headers || {}, lookup: lookupControllato, agent: false, signal: o.signal,
            servername: eIndirizzoIp(host) ? undefined : host
        }, res => {
            const intestazioni = new Headers();
            Object.keys(res.headers).forEach(k => {
                const v = res.headers[k];
                try { (Array.isArray(v) ? v : [v]).forEach(x => intestazioni.append(k, String(x))); } catch (_) { /* valore illeggibile: si salta */ }
            });
            const senzaCorpo = metodo === 'HEAD' || [204, 205, 304].indexOf(res.statusCode) >= 0;
            let flusso = res;
            const codifica = String(res.headers['content-encoding'] || '').toLowerCase().trim();
            if (!senzaCorpo && /^(x-)?gzip$|^deflate$/.test(codifica)) flusso = res.pipe(zlib.createUnzip());
            else if (!senzaCorpo && codifica === 'br') flusso = res.pipe(zlib.createBrotliDecompress());
            if (flusso !== res) {
                intestazioni.delete('content-encoding');
                intestazioni.delete('content-length');
                res.on('error', e => flusso.destroy(e));
            }
            if (senzaCorpo) res.resume();
            try {
                risolvi(new Response(senzaCorpo ? null : Readable.toWeb(flusso), { status: res.statusCode, headers: intestazioni }));
            } catch (e) {
                res.destroy();
                rifiuta(e);
            }
        });
        req.on('error', rifiuta);
        req.end();
    });
}
function lookupPredefinito(host) {
    return dns.promises.lookup(host, { all: true, verbatim: true });
}

// il nome del server e' pubblico? (IP scritto per intero oppure DNS)
async function controllaHost(ctx, host) {
    const h = String(host || '').replace(/^\[|\]$/g, '');
    if (eIndirizzoIp(h)) {
        if (!indirizzoPubblico(h)) throw intoppo('non-pubblico', h);
        return;
    }
    let elenco;
    try {
        elenco = await Promise.race([
            ctx.lookup(h, { all: true, verbatim: true }),
            new Promise((_, no) => setTimeout(() => no(Object.assign(new Error('dns lento'), { code: 'ETIMEOUT' })), Math.min(ctx.timeoutMs, 5000)).unref())
        ]);
    } catch (e) {
        throw intoppo('non-risponde', 'dns', { codiceRete: String((e && e.code) || '') });
    }
    const indirizzi = (Array.isArray(elenco) ? elenco : [elenco]).map(a => (a && typeof a === 'object' ? a.address : a)).filter(Boolean);
    if (!indirizzi.length) throw intoppo('non-risponde', 'dns');
    const cattivo = indirizzi.find(a => !indirizzoPubblico(a));
    if (cattivo) throw intoppo('non-pubblico', h);
}

/* Legge al massimo `massimo` byte del corpo. Allo scadere del tempo
   (segnale) la lettura si interrompe anche se il server manda i byte a
   goccia a goccia: e' un "non risponde", non un corpo a meta'. */
async function leggiCorpo(risposta, massimo, segnale) {
    if (!risposta.body) return { buffer: Buffer.alloc(0), troncato: false };
    const lettore = risposta.body.getReader();
    const interrompi = () => { lettore.cancel().catch(() => {}); };
    if (segnale) {
        if (segnale.aborted) interrompi();
        else segnale.addEventListener('abort', interrompi, { once: true });
    }
    const pezzi = [];
    let totale = 0, troncato = false;
    for (;;) {
        const { done, value } = await lettore.read();
        if (segnale && segnale.aborted) throw Object.assign(new Error('lettura interrotta'), { name: 'AbortError' });
        if (done) break;
        const b = Buffer.from(value);
        if (totale + b.length > massimo) {
            pezzi.push(b.subarray(0, massimo - totale));
            totale = massimo;
            troncato = true;
            break;
        }
        pezzi.push(b);
        totale += b.length;
    }
    if (segnale) segnale.removeEventListener('abort', interrompi);
    if (troncato) lettore.cancel().catch(() => {});
    return { buffer: Buffer.concat(pezzi), troncato: troncato };
}
function lasciaCorpo(risposta) {
    try { if (risposta && risposta.body) risposta.body.cancel().catch(() => {}); } catch (_) { /* gia' chiuso */ }
}

/* Una richiesta con tutte le protezioni. opz: { intestazioni, senzaCorpo }
   -> { stato, intestazioni (Headers), testo, buffer, troncato, url, redirect: [url...] }
   Lancia un intoppo (vedi problemaDa) se non si arriva a una risposta. */
async function richiesta(ctx, indirizzo, opz) {
    const o = opz || {};
    let attuale = indirizzo;
    const redirect = [];
    for (let salto = 0; ; salto++) {
        let u;
        try { u = new URL(attuale); } catch (_) { throw intoppo('non-risponde', 'redirect-non-valido'); }
        if (u.protocol !== 'https:') throw intoppo('https', 'redirect', { verso: attuale });
        if (u.username || u.password) throw intoppo('credenziali', 'redirect');
        await controllaHost(ctx, u.hostname);
        const rimasto = ctx.fine - Date.now();
        if (rimasto <= 0) throw intoppo('non-risponde', 'timeout');
        const tempo = Math.min(ctx.timeoutMs, rimasto);
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), tempo);
        try {
            let r;
            try {
                r = await ctx.fetch(attuale, {
                    method: 'GET', redirect: 'manual', signal: ac.signal,
                    headers: Object.assign({ 'user-agent': UA, accept: '*/*', origin: ctx.origine }, o.intestazioni || {})
                });
            } catch (e) {
                throw problemaDiRete(e, ac.signal.aborted);
            }
            const dove = r.headers.get('location');
            if (r.status >= 300 && r.status < 400 && dove) {
                lasciaCorpo(r);
                if (salto >= ctx.maxRedirect) throw intoppo('non-risponde', 'troppi-redirect');
                try { attuale = new URL(dove, attuale).href; } catch (_) { throw intoppo('non-risponde', 'redirect-non-valido'); }
                redirect.push(attuale);
                continue;
            }
            let letto = { buffer: Buffer.alloc(0), troncato: false };
            if (o.senzaCorpo) lasciaCorpo(r);
            else {
                try { letto = await leggiCorpo(r, ctx.maxByte, ac.signal); } catch (e) { throw problemaDiRete(e, ac.signal.aborted); }
            }
            return {
                stato: r.status, intestazioni: r.headers, buffer: letto.buffer, testo: letto.buffer.toString('utf8'),
                troncato: letto.troncato, url: attuale, redirect: redirect
            };
        } finally {
            clearTimeout(timer);
        }
    }
}
function problemaDiRete(e, scaduto) {
    if (e && e.intoppo) return e;
    const codice = String((e && (e.code || (e.cause && e.cause.code))) || '');
    if (codice === 'NGB_NON_PUBBLICO') return intoppo('non-pubblico', 'connessione');
    if (scaduto || (e && e.name === 'AbortError')) return intoppo('non-risponde', 'timeout');
    if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/i.test(codice + ' ' + String((e && e.message) || ''))) return intoppo('non-risponde', 'certificato', { codiceRete: codice });
    return intoppo('non-risponde', 'rete', { codiceRete: codice });
}

/* ============================================================
   IL RISULTATO
   ============================================================ */

function nuovoRisultato() {
    return {
        esito: 'ok', tipo: '', valore: '', titolo: '', righe: [], problemi: [],
        info: { diretta: null, qualita: [], dvrSecondi: null, durataSegmento: null, codec: [], corsOk: null, incorporabile: null, raggiungibile: false },
        urlProva: ''
    };
}
function aggiungi(r, codice, messaggio, testoWebTv) {
    if (r.problemi.some(p => p.codice === codice && p.messaggio === messaggio)) return;
    r.problemi.push({ codice: codice, grave: GRAVI.has(codice), messaggio: messaggio, testoWebTv: testoWebTv || '' });
}
function chiudi(r) {
    r.esito = r.problemi.some(p => p.grave) ? 'errore' : (r.problemi.length ? 'avviso' : 'ok');
    if (r.esito === 'errore') r.urlProva = '';
    return r;
}

/* ---------- i testi per la web TV (pronti da inoltrare) ---------- */
function lettera(corpo) {
    return 'Buongiorno,\n' + corpo + '\nGrazie e buona giornata.';
}
function perSito(ctx) {
    return 'per la diretta del nostro evento sul sito ' + ctx.origine;
}
const TESTI = {
    https: (ctx, link) => lettera(perSito(ctx) + ' ci serve il link del flusso in https. Il link che abbiamo (' + link + ') è in http (o rimanda a un indirizzo http) e i browser lo bloccano in una pagina sicura. Ci potete dare lo stesso flusso in https, possibilmente il link HLS (.m3u8)?'),
    rtmp: ctx => lettera(perSito(ctx) + ' ci avete dato l\'indirizzo per trasmettere (RTMP/RTSP/SRT). Per mostrare la diretta nel nostro player ci serve invece il link per guardarla: il flusso HLS (.m3u8) in https, con le intestazioni CORS che consentono la riproduzione dal dominio ' + ctx.origine + '. Ce lo potete mandare?'),
    file: (ctx, link) => lettera(perSito(ctx) + ' il link che abbiamo (' + link + ') è un file video (o un pezzo del flusso), non il canale in diretta. Ci serve il link HLS (.m3u8) in https del canale della diretta.'),
    credenziali: ctx => lettera(perSito(ctx) + ' il link che ci avete dato contiene nome utente e password: in una pagina pubblica non possiamo usarlo. Ci potete dare un link senza credenziali (se serve, firmato a tempo o limitato al nostro dominio ' + ctx.origine + ')?'),
    'non-risponde': (ctx, link, dettaglio) => lettera(perSito(ctx) + ' stiamo provando il link ' + link + ', ma ' + dettaglio + '. Ci confermate che il link è giusto e raggiungibile da internet? Se la diretta non è ancora partita, da quando sarà attivo? Possiamo fare una prova con il flusso vero qualche giorno prima?'),
    'non-trovato': (ctx, link, stato) => lettera(perSito(ctx) + ' stiamo provando il link ' + link + ', ma il vostro server risponde «non trovato» (errore ' + stato + '). È perché la diretta non è ancora partita? Da quando il link sarà attivo? Possiamo fare una prova con il flusso vero qualche giorno prima?'),
    rifiutato: (ctx, link, stato) => lettera(perSito(ctx) + ' stiamo provando il link ' + link + ', ma il vostro server risponde «accesso negato» (errore ' + stato + '). Il link è limitato (token a tempo, dominio di provenienza, paese)? Ci serve un link che i browser dei partecipanti possano riprodurre dal nostro sito; se usate link firmati, ci mandate le istruzioni (schema, chiave e parametri)?'),
    'non-e-hls': (ctx, link) => lettera(perSito(ctx) + ' il link ' + link + ' finisce con .m3u8 ma non restituisce una playlist HLS valida (dovrebbe cominciare con #EXTM3U). Ci confermate il link diretto del flusso HLS?'),
    'non-e-dash': (ctx, link) => lettera(perSito(ctx) + ' il link ' + link + ' finisce con .mpd ma non restituisce un manifest DASH valido. Ci confermate il link del flusso? Se possibile, ci date il link HLS (.m3u8)?'),
    cors: (ctx, link) => lettera(perSito(ctx) + ' riproduciamo il vostro flusso con il nostro player. Il link ' + link + ' non consente la riproduzione dal nostro sito: mancano le intestazioni CORS. Potete abilitare, per la playlist e per i segmenti video, l\'intestazione «Access-Control-Allow-Origin: ' + ctx.origine + '» (oppure «*»)?'),
    'cors-segmenti': (ctx, link) => lettera(perSito(ctx) + ' riproduciamo il vostro flusso con il nostro player. La playlist ' + link + ' consente la riproduzione dal nostro sito, ma i segmenti video no: manca l\'intestazione CORS sui segmenti (.ts/.m4s). Potete aggiungere anche lì «Access-Control-Allow-Origin: ' + ctx.origine + '» (oppure «*»)?'),
    'solo-hevc': (ctx, link) => lettera(perSito(ctx) + ' il flusso ' + link + ' è solo in HEVC (H.265), che molti computer con Chrome e Firefox non riproducono. Potete aggiungere le stesse qualità in H.264 (AVC), con l\'audio in AAC?'),
    registrazione: (ctx, link) => lettera(perSito(ctx) + ' il link ' + link + ' risulta una registrazione (VOD) e non il canale in diretta. È un link di prova? Ci mandate il link della diretta, quello che useremo il giorno dell\'evento?'),
    incorporato: (ctx, link) => lettera(perSito(ctx) + ' vorremmo usare il nostro player, senza loghi e con i nostri comandi. Oltre alla pagina da incorporare (' + link + '), ci potete dare il link diretto del flusso HLS (.m3u8) in https, con le intestazioni CORS che consentono la riproduzione dal dominio ' + ctx.origine + '?'),
    'non-incorporabile': (ctx, link, motivo) => lettera(perSito(ctx) + ' la pagina ' + link + ' non si può incorporare nel nostro sito perché il vostro server lo vieta (' + motivo + '). Ci potete dare il link HLS (.m3u8) in https, oppure consentire l\'incorporamento dal nostro dominio (Content-Security-Policy: frame-ancestors ' + ctx.origine + ')?'),
    'non-html': (ctx, link) => lettera(perSito(ctx) + ' il link ' + link + ' non apre né un flusso HLS (.m3u8) né una pagina da incorporare. Ci mandate il link HLS (.m3u8) in https della diretta?')
};

// un intoppo della richiesta -> il problema per la persona
function problemaDa(ctx, r, e, link, cosa) {
    const i = e.intoppo || { codice: 'non-risponde', dettaglio: 'rete' };
    const chi = cosa || 'Il server della web TV';
    if (i.codice === 'non-pubblico') {
        aggiungi(r, 'non-pubblico', 'Il link porta a un indirizzo interno o privato (' + (i.dettaglio === 'connessione' ? 'scoperto alla connessione' : i.dettaglio) + '): non si può usare né provare. Serve l\'indirizzo pubblico della web TV.');
        return;
    }
    if (i.codice === 'https') {
        aggiungi(r, 'https', 'Il link rimanda (redirect) a un indirizzo http:// (' + String(i.verso || '').slice(0, 200) + '): il browser lo bloccherebbe in una pagina sicura.', TESTI.https(ctx, link));
        return;
    }
    if (i.codice === 'credenziali') {
        aggiungi(r, 'credenziali', 'Il link rimanda a un indirizzo con nome utente e password: non si può usare in una pagina pubblica.', TESTI.credenziali(ctx));
        return;
    }
    const dettagli = {
        dns: ['il nome del server non si trova (DNS): controlla di aver copiato bene il link', 'il nome del server non risulta (DNS)'],
        timeout: ['non risponde entro ' + Math.round(ctx.timeoutMs / 1000) + ' secondi', 'non risponde entro ' + Math.round(ctx.timeoutMs / 1000) + ' secondi'],
        certificato: ['il certificato https del server non è valido (anche i browser lo rifiuterebbero)', 'il certificato https del server non risulta valido'],
        'troppi-redirect': ['rimanda ad altri indirizzi troppe volte (più di ' + ctx.maxRedirect + ')', 'il link rimanda ad altri indirizzi troppe volte'],
        'redirect-non-valido': ['rimanda a un indirizzo non valido', 'il link rimanda a un indirizzo non valido'],
        rete: ['non risponde (connessione non riuscita' + (i.codiceRete ? ': ' + i.codiceRete : '') + ')', 'la connessione al server non riesce']
    };
    const d = dettagli[i.dettaglio] || dettagli.rete;
    aggiungi(r, 'non-risponde', chi + ' ' + d[0] + '.', TESTI['non-risponde'](ctx, link, d[1]));
}

// una risposta con uno stato che non e' 2xx -> il problema per la persona
function problemaStato(ctx, r, stato, link, cosa) {
    const chi = cosa || 'Il server della web TV';
    if (stato === 404 || stato === 410) {
        aggiungi(r, 'non-trovato', chi + ' risponde ma il flusso non c\'è (errore ' + stato + '): se la diretta non è ancora cominciata è normale, altrimenti il link è sbagliato.', TESTI['non-trovato'](ctx, link, stato));
    } else if (stato === 401 || stato === 403 || stato === 451 || stato === 407) {
        const firma = ctx.firmaAttiva ? ' Il link è stato provato con la firma impostata per l\'evento: controlla la chiave segreta e i parametri dei link firmati.' : '';
        aggiungi(r, 'rifiutato', chi + ' rifiuta la richiesta (errore ' + stato + '): il link potrebbe richiedere un token, essere scaduto o essere limitato a certi siti o paesi.' + firma, TESTI.rifiutato(ctx, link, stato));
    } else {
        aggiungi(r, 'non-risponde', chi + ' risponde con un errore (' + stato + ').', TESTI['non-risponde'](ctx, link, 'il server risponde con l\'errore ' + stato));
    }
}

/* ---------- CORS ---------- */
function corsConsente(intestazioni, origine) {
    const v = String(intestazioni.get('access-control-allow-origin') || '').trim();
    if (!v) return false;
    if (v === '*') return true;
    return v.toLowerCase().replace(/\/+$/, '') === origine.toLowerCase();
}
function descriviCors(intestazioni) {
    const v = String(intestazioni.get('access-control-allow-origin') || '').trim();
    return v ? 'Access-Control-Allow-Origin: ' + v.slice(0, 120) : 'nessuna intestazione Access-Control-Allow-Origin';
}

/* ---------- testi ---------- */
function minuti(secondi) {
    if (secondi < 120) return Math.round(secondi) + ' secondi';
    const m = Math.round(secondi / 60);
    return m + ' minuti';
}
function mbit(banda) {
    return (banda / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' Mbit/s';
}
function elencoQualita(qualita) {
    const altezze = [];
    qualita.forEach(q => { if (q.altezza && altezze.indexOf(q.altezza) < 0) altezze.push(q.altezza); });
    return altezze;
}
function fraseQualita(qualita, varianti) {
    const altezze = elencoQualita(qualita);
    const n = Math.max(altezze.length, varianti || 0);
    if (n <= 1) return 'una sola qualità' + (altezze.length ? ' (' + altezze[0] + 'p)' : '');
    return n + ' qualità' + (altezze.length ? ' (' + altezze.map(a => a + 'p').join(', ') + ')' : '');
}

/* ============================================================
   HLS
   ============================================================ */

function attributiHls(s) {
    const o = {};
    const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
    let m;
    while ((m = re.exec(s))) o[m[1]] = m[2].replace(/^"|"$/g, '');
    return o;
}
function leggiPlaylist(testo) {
    const righe = String(testo || '').replace(/^﻿/, '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (!/^#EXTM3U/.test(righe[0] || '')) return null;
    const p = { varianti: [], segmenti: [], target: null, fine: false, tipo: '', durata: 0 };
    let variante = null, extinf = null;
    for (const r of righe) {
        if (r.indexOf('#EXT-X-STREAM-INF:') === 0) { variante = attributiHls(r.slice(18)); continue; }
        if (r.indexOf('#EXT-X-TARGETDURATION:') === 0) { p.target = parseFloat(r.slice(22)) || null; continue; }
        if (r.indexOf('#EXTINF:') === 0) { extinf = parseFloat(r.slice(8)); continue; }
        if (r.indexOf('#EXT-X-PLAYLIST-TYPE:') === 0) { p.tipo = r.slice(21).trim().toUpperCase(); continue; }
        if (r === '#EXT-X-ENDLIST') { p.fine = true; continue; }
        if (r[0] === '#') continue;
        if (variante) { p.varianti.push({ uri: r, attr: variante }); variante = null; }
        else if (extinf !== null) {
            const d = Number.isFinite(extinf) && extinf > 0 ? extinf : 0;
            p.segmenti.push({ uri: r, durata: d });
            p.durata += d;
            extinf = null;
        }
    }
    return p;
}
const RE_AUDIO = /^(mp4a|ac-3|ec-3|ac-4|opus|flac|mp3|alac|dtsc|dtse|dtsh|dtsl)\b/i;
const RE_HEVC = /^(hvc1|hev1|dvh1|dvhe)\b/i;
function codecDi(attr) {
    return String(attr.CODECS || '').split(',').map(x => x.trim()).filter(Boolean);
}
function soloAudio(v) {
    const c = codecDi(v.attr);
    return !v.attr.RESOLUTION && c.length > 0 && c.every(x => RE_AUDIO.test(x));
}

async function provaHls(ctx, r, url, link) {
    let risp;
    try { risp = await richiesta(ctx, url); } catch (e) { problemaDa(ctx, r, e, link); r.titolo = titoloIntoppo(r); return; }
    r.info.raggiungibile = true;
    if (risp.redirect.length) r.righe.push('Il link rimanda a ' + risp.url.slice(0, 200) + ' (va bene: il player segue il reindirizzamento).');
    if (risp.stato < 200 || risp.stato >= 300) { problemaStato(ctx, r, risp.stato, link); r.titolo = titoloIntoppo(r); return; }
    const pl = leggiPlaylist(risp.testo);
    if (!pl) {
        const html = /^\s*(<!doctype html|<html)/i.test(risp.testo);
        aggiungi(r, 'non-e-hls', 'Il link finisce con .m3u8 ma la risposta non è una playlist HLS' + (html ? ': è una pagina web.' : ' (non comincia con #EXTM3U).'), TESTI['non-e-hls'](ctx, link));
        r.titolo = 'Non è un flusso HLS';
        return;
    }
    r.info.corsOk = corsConsente(risp.intestazioni, ctx.origine);
    if (!r.info.corsOk) {
        aggiungi(r, 'cors', 'Il server della web TV non consente la riproduzione dal nostro sito (' + descriviCors(risp.intestazioni) + ' per ' + ctx.origine + '): con Chrome, Edge, Firefox e Android il video non partirebbe; su iPhone, iPad e Safari sì.', TESTI.cors(ctx, link));
    }

    let media = pl, urlMedia = risp.url, nVarianti = 0;
    if (pl.varianti.length) {
        const video = pl.varianti.filter(v => !soloAudio(v));
        nVarianti = video.length;
        const codec = [];
        pl.varianti.forEach(v => codecDi(v.attr).forEach(c => { if (codec.indexOf(c) < 0) codec.push(c); }));
        r.info.codec = codec;
        r.info.qualita = video.map(v => {
            const m = /^(\d+)x(\d+)$/i.exec(String(v.attr.RESOLUTION || ''));
            return { altezza: m ? +m[2] : null, banda: Number(v.attr.BANDWIDTH) || null };
        }).sort((a, b) => (b.altezza || 0) - (a.altezza || 0) || (b.banda || 0) - (a.banda || 0));
        const conCodec = video.filter(v => codecDi(v.attr).some(c => !RE_AUDIO.test(c)));
        const hevc = conCodec.length > 0 && conCodec.length === video.length && conCodec.every(v => codecDi(v.attr).filter(c => !RE_AUDIO.test(c)).every(c => RE_HEVC.test(c)));
        if (hevc) aggiungi(r, 'solo-hevc', 'Il flusso è solo in HEVC (H.265): molti computer con Chrome e Firefox non lo riproducono. Chiedete alla web TV anche una versione in H.264 (AVC).', TESTI['solo-hevc'](ctx, link));
        else if (conCodec.some(v => codecDi(v.attr).some(c => RE_HEVC.test(c)))) r.righe.push('Alcune qualità sono in HEVC (H.265): chi non lo riproduce usa le altre.');
        if (r.info.qualita.length) {
            r.righe.push('Qualità: ' + r.info.qualita.map(q => (q.altezza ? q.altezza + 'p' : 'risoluzione non dichiarata') + (q.banda ? ' (' + mbit(q.banda) + ')' : '')).join(', ') + '.');
        }
        if (codec.length) r.righe.push('Codec: ' + codec.join(', ') + '.');
        // si analizza la qualita' piu' leggera (fra quelle che non sono solo HEVC, se ci sono)
        const scelte = video.length ? video : pl.varianti;
        const leggibili = scelte.filter(v => !codecDi(v.attr).some(c => RE_HEVC.test(c)));
        const scelta = (leggibili.length ? leggibili : scelte).slice().sort((a, b) => (Number(a.attr.BANDWIDTH) || 0) - (Number(b.attr.BANDWIDTH) || 0))[0];
        try { urlMedia = new URL(scelta.uri, risp.url).href; } catch (_) { urlMedia = ''; }
        media = null;
        const quale = (() => { const m = /x(\d+)$/i.exec(String(scelta.attr.RESOLUTION || '')); return m ? 'della qualità ' + m[1] + 'p' : 'di una qualità'; })();
        if (!urlMedia) {
            aggiungi(r, 'non-e-hls', 'La playlist principale contiene un indirizzo non valido per le qualità.', TESTI['non-e-hls'](ctx, link));
        } else {
            try {
                const rm = await richiesta(ctx, urlMedia);
                if (rm.stato < 200 || rm.stato >= 300) problemaStato(ctx, r, rm.stato, link, 'La playlist ' + quale);
                else {
                    media = leggiPlaylist(rm.testo);
                    urlMedia = rm.url;
                    if (!media) aggiungi(r, 'non-e-hls', 'La playlist ' + quale + ' non è una playlist HLS valida.', TESTI['non-e-hls'](ctx, link));
                    else if (r.info.corsOk && !corsConsente(rm.intestazioni, ctx.origine)) {
                        aggiungi(r, 'cors', 'La playlist principale consente la riproduzione dal nostro sito, ma quella ' + quale + ' no (' + descriviCors(rm.intestazioni) + ').', TESTI.cors(ctx, link));
                        r.info.corsOk = false;
                    }
                }
            } catch (e) {
                problemaDa(ctx, r, e, link, 'La playlist ' + quale);
            }
        }
    } else {
        r.righe.push('Il link è di una sola qualità (niente playlist principale con più qualità): chi ha una connessione lenta non può scendere a una qualità più bassa. Se possibile, chiedete alla web TV il link «master» con più qualità.');
    }

    if (media) {
        const vod = media.fine || media.tipo === 'VOD';
        r.info.diretta = !vod;
        r.info.durataSegmento = media.target || (media.segmenti.length ? Math.round(media.durata / media.segmenti.length * 10) / 10 : null);
        if (vod) {
            aggiungi(r, 'registrazione', 'Questo link è una registrazione (il video ha una fine), non una diretta: va bene per una prova, non per il giorno dell\'evento.', TESTI.registrazione(ctx, link));
            r.info.dvrSecondi = null;
        } else {
            r.info.dvrSecondi = Math.round(media.durata);
            if (media.tipo === 'EVENT') r.righe.push('La finestra cresce durante la diretta (playlist di tipo EVENT): si può tornare fino all\'inizio.');
        }
        if (r.info.durataSegmento) {
            r.righe.push('Segmenti da ' + r.info.durataSegmento + ' secondi' + (vod ? '.' : ': la diretta arriva con circa ' + Math.round(r.info.durataSegmento * 3) + ' secondi di ritardo sul vivo (più il ritardo della web TV).'));
        }
        if (!media.segmenti.length && !vod) r.righe.push('La playlist non contiene ancora segmenti: la diretta forse non è ancora partita.');
        // un segmento: risponde? ha il CORS?
        const ultimo = media.segmenti[media.segmenti.length - 1];
        if (ultimo) {
            let urlSeg = '';
            try { urlSeg = new URL(ultimo.uri, urlMedia).href; } catch (_) { urlSeg = ''; }
            if (urlSeg) {
                try {
                    const rs = await richiesta(ctx, urlSeg, { intestazioni: { range: 'bytes=0-1023' }, senzaCorpo: true });
                    if (rs.stato < 200 || rs.stato >= 300) problemaStato(ctx, r, rs.stato, link, 'Il segmento video');
                    else if (r.info.corsOk && !corsConsente(rs.intestazioni, ctx.origine)) {
                        aggiungi(r, 'cors-segmenti', 'La playlist si può leggere dal nostro sito, ma i segmenti video no (' + descriviCors(rs.intestazioni) + '): con Chrome, Edge, Firefox e Android il video non partirebbe.', TESTI['cors-segmenti'](ctx, link));
                        r.info.corsOk = false;
                    }
                } catch (e) {
                    problemaDa(ctx, r, e, link, 'Il segmento video');
                }
            }
        }
    }
    r.titolo = titoloFlusso('HLS', r, nVarianti, media);
}

function titoloFlusso(nome, r, nVarianti, media) {
    const qualita = fraseQualita(r.info.qualita, nVarianti);
    if (r.info.diretta === false) {
        const durata = media && media.durata ? ', durata ' + minuti(media.durata) : '';
        return 'Registrazione ' + nome + ' (non è una diretta), ' + qualita + durata;
    }
    if (r.info.diretta === null) return 'Flusso ' + nome + ', ' + qualita + ': non è stato possibile leggerlo tutto';
    const dvr = r.info.dvrSecondi;
    const indietro = dvr >= 60 ? 'si può tornare indietro di ' + minuti(dvr) : 'non si può tornare indietro';
    return 'Flusso ' + nome + ' in diretta, ' + qualita + ', ' + indietro;
}
function titoloIntoppo(r, pagina) {
    const p = r.problemi.find(x => x.codice !== 'incorporato');
    if (!p) return '';
    if (pagina) {
        return {
            'non-pubblico': 'Indirizzo non pubblico: non si può usare',
            'https': 'La pagina rimanda a un indirizzo http',
            'credenziali': 'La pagina rimanda a un indirizzo con credenziali',
            'non-trovato': 'Pagina della web TV da incorporare (ripiego): non trovata',
            'rifiutato': 'Pagina della web TV da incorporare (ripiego): accesso negato',
            'non-risponde': 'Pagina della web TV da incorporare (ripiego): non risponde'
        }[p.codice] || 'La pagina della web TV non si può provare';
    }
    return {
        'non-pubblico': 'Indirizzo non pubblico: non si può usare',
        'https': 'Il link rimanda a un indirizzo http',
        'credenziali': 'Il link rimanda a un indirizzo con credenziali',
        'non-trovato': 'Flusso non trovato (il server della web TV risponde 404)',
        'rifiutato': 'Il server della web TV rifiuta la richiesta',
        'non-risponde': 'Il server della web TV non risponde'
    }[p.codice] || 'Il link non si può provare';
}

/* ============================================================
   DASH
   ============================================================ */

function attributiXml(s) {
    const o = {};
    const re = /([A-Za-z_][-A-Za-z0-9_.:]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(s))) o[m[1]] = m[3] !== undefined ? m[3] : m[4];
    return o;
}
// "PT1H30M", "PT59.9S", "P1DT2H" -> secondi
function durataIso(s) {
    const m = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(String(s || '').trim());
    if (!m || String(s).trim() === 'P' || String(s).trim() === 'PT') return null;
    const n = i => Number(m[i] || 0);
    return n(1) * 31536000 + n(2) * 2592000 + n(3) * 604800 + n(4) * 86400 + n(5) * 3600 + n(6) * 60 + n(7);
}
function leggiMpd(testo) {
    const t = String(testo || '').replace(/^﻿/, '');
    const m = /<(?:[A-Za-z0-9_]+:)?MPD\b([^>]*)>/.exec(t);
    if (!m) return null;
    const a = attributiXml(m[1]);
    const out = {
        dinamico: String(a.type || 'static').toLowerCase() === 'dynamic',
        dvr: durataIso(a.timeShiftBufferDepth),
        durata: durataIso(a.mediaPresentationDuration),
        durataSegmento: durataIso(a.maxSegmentDuration),
        qualita: [], codec: []
    };
    const reAs = /<(?:[A-Za-z0-9_]+:)?AdaptationSet\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?AdaptationSet>/g;
    let as;
    while ((as = reAs.exec(t))) {
        const aa = attributiXml(as[1]);
        const reR = /<(?:[A-Za-z0-9_]+:)?Representation\b([^>]*?)\/?>/g;
        let rr;
        while ((rr = reR.exec(as[2]))) {
            const ra = Object.assign({}, aa, attributiXml(rr[1]));
            const video = /video/i.test(String(ra.mimeType || ra.contentType || '')) || !!ra.height;
            String(ra.codecs || '').split(',').map(x => x.trim()).filter(Boolean).forEach(c => { if (out.codec.indexOf(c) < 0) out.codec.push(c); });
            if (video) out.qualita.push({ altezza: Number(ra.height) || null, banda: Number(ra.bandwidth) || null, hevc: RE_HEVC.test(String(ra.codecs || '')), conCodec: !!ra.codecs });
        }
        // durata dei segmenti dal SegmentTemplate (duration/timescale)
        if (!out.durataSegmento) {
            const st = /<(?:[A-Za-z0-9_]+:)?SegmentTemplate\b([^>]*)>/.exec(as[2]) || /<(?:[A-Za-z0-9_]+:)?SegmentTemplate\b([^>]*)>/.exec(as[1]);
            const sa = st ? attributiXml(st[1]) : {};
            if (sa.duration) out.durataSegmento = Math.round(Number(sa.duration) / (Number(sa.timescale) || 1) * 10) / 10 || null;
        }
    }
    out.qualita.sort((x, y) => (y.altezza || 0) - (x.altezza || 0) || (y.banda || 0) - (x.banda || 0));
    return out;
}

async function provaDash(ctx, r, url, link) {
    let risp;
    try { risp = await richiesta(ctx, url); } catch (e) { problemaDa(ctx, r, e, link); r.titolo = titoloIntoppo(r); return; }
    r.info.raggiungibile = true;
    if (risp.redirect.length) r.righe.push('Il link rimanda a ' + risp.url.slice(0, 200) + ' (va bene: il player segue il reindirizzamento).');
    if (risp.stato < 200 || risp.stato >= 300) { problemaStato(ctx, r, risp.stato, link); r.titolo = titoloIntoppo(r); return; }
    const mpd = leggiMpd(risp.testo);
    if (!mpd) {
        aggiungi(r, 'non-e-dash', 'Il link finisce con .mpd ma la risposta non è un manifest DASH (manca <MPD>).', TESTI['non-e-dash'](ctx, link));
        r.titolo = 'Non è un flusso DASH';
        return;
    }
    r.info.corsOk = corsConsente(risp.intestazioni, ctx.origine);
    if (!r.info.corsOk) {
        aggiungi(r, 'cors', 'Il server della web TV non consente la riproduzione dal nostro sito (' + descriviCors(risp.intestazioni) + ' per ' + ctx.origine + '): il video non partirebbe.', TESTI.cors(ctx, link));
    }
    r.info.diretta = mpd.dinamico;
    r.info.qualita = mpd.qualita.map(q => ({ altezza: q.altezza, banda: q.banda }));
    r.info.codec = mpd.codec;
    r.info.durataSegmento = mpd.durataSegmento;
    const conCodec = mpd.qualita.filter(q => q.conCodec);
    if (conCodec.length && conCodec.length === mpd.qualita.length && conCodec.every(q => q.hevc)) {
        aggiungi(r, 'solo-hevc', 'Il flusso è solo in HEVC (H.265): molti computer con Chrome e Firefox non lo riproducono. Chiedete alla web TV anche una versione in H.264 (AVC).', TESTI['solo-hevc'](ctx, link));
    }
    if (!mpd.dinamico) {
        aggiungi(r, 'registrazione', 'Questo link è una registrazione (manifest «static»), non una diretta: va bene per una prova, non per il giorno dell\'evento.', TESTI.registrazione(ctx, link));
    } else {
        r.info.dvrSecondi = mpd.dvr === null ? null : Math.round(mpd.dvr);
        if (mpd.dvr === null) r.righe.push('Il manifest non dichiara una finestra per tornare indietro (timeShiftBufferDepth).');
    }
    if (r.info.qualita.length) r.righe.push('Qualità: ' + r.info.qualita.map(q => (q.altezza ? q.altezza + 'p' : 'risoluzione non dichiarata') + (q.banda ? ' (' + mbit(q.banda) + ')' : '')).join(', ') + '.');
    if (mpd.codec.length) r.righe.push('Codec: ' + mpd.codec.join(', ') + '.');
    if (r.info.durataSegmento) r.righe.push('Segmenti da ' + r.info.durataSegmento + ' secondi.');
    r.titolo = titoloFlusso('DASH', r, r.info.qualita.length, { durata: mpd.durata || 0 });
}

/* ============================================================
   LA PAGINA DA INCORPORARE
   ============================================================ */

// le liste frame-ancestors di tutte le politiche CSP (null se nessuna le ha)
function frameAncestors(intestazioni) {
    const csp = intestazioni.get('content-security-policy');
    if (!csp) return null;
    const liste = [];
    String(csp).split(',').forEach(politica => politica.split(';').forEach(direttiva => {
        const t = direttiva.trim().split(/\s+/).filter(Boolean);
        if (t.length && t[0].toLowerCase() === 'frame-ancestors') liste.push(t.slice(1));
    }));
    return liste.length ? liste : null;
}
// una lista di sorgenti CSP ammette la nostra origine?
function sorgentiAmmettono(sorgenti, origine, originePagina) {
    const o = new URL(origine);
    const schemaNostro = o.protocol.replace(/:$/, '');
    const portaNostra = o.port || (schemaNostro === 'https' ? '443' : '80');
    return sorgenti.some(s => {
        const x = s.toLowerCase();
        if (x === '\'none\'') return false;
        if (x === '*') return true;
        if (x === '\'self\'') return originePagina === o.origin;
        if (/^[a-z][a-z0-9+.-]*:$/.test(x)) return x === o.protocol || (x === 'http:' && o.protocol === 'https:');
        const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?(\*|[a-z0-9.-]+)(?::(\d+|\*))?(\/.*)?$/.exec(x);
        if (!m) return false;
        if (m[1] && m[1] !== schemaNostro && !(m[1] === 'http' && schemaNostro === 'https')) return false;
        if (m[4] && m[4] !== '*' && m[4] !== portaNostra) return false;
        if (m[2]) return o.hostname.endsWith('.' + m[3]);
        return m[3] === '*' || m[3] === o.hostname;
    });
}
// X-Frame-Options come lo legge il browser (regole dello standard HTML)
function xfoConsente(intestazioni) {
    const grezzo = intestazioni.get('x-frame-options');
    if (!grezzo) return { ok: true, motivo: '' };
    const valori = new Set(String(grezzo).split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
    if (valori.size > 1 && (valori.has('deny') || valori.has('allowall') || valori.has('sameorigin'))) return { ok: false, motivo: 'X-Frame-Options: ' + grezzo };
    if (valori.size > 1) return { ok: true, motivo: '' };
    const v = Array.from(valori)[0];
    if (v === 'deny' || v === 'sameorigin') return { ok: false, motivo: 'X-Frame-Options: ' + v.toUpperCase() };
    return { ok: true, motivo: '' };
}

async function provaIncorporato(ctx, r, url, link) {
    aggiungi(r, 'incorporato', V.AVVISO_INCORPORATO, TESTI.incorporato(ctx, link));
    let risp;
    try { risp = await richiesta(ctx, url, { intestazioni: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' } }); } catch (e) {
        problemaDa(ctx, r, e, link, 'La pagina della web TV');
        r.titolo = titoloIntoppo(r, true);
        return;
    }
    r.info.raggiungibile = true;
    if (risp.redirect.length) r.righe.push('Il link rimanda a ' + risp.url.slice(0, 200) + '.');
    if (risp.stato < 200 || risp.stato >= 300) {
        problemaStato(ctx, r, risp.stato, link, 'La pagina della web TV');
        r.titolo = titoloIntoppo(r, true) + ' (errore ' + risp.stato + ')';
        return;
    }
    const tipo = String(risp.intestazioni.get('content-type') || '').toLowerCase();
    const inizio = risp.testo.replace(/^﻿/, '').trimStart().slice(0, 200);
    const html = /text\/html|application\/xhtml\+xml/.test(tipo) || (!tipo && /^(<!doctype html|<html)/i.test(inizio));
    if (!html) {
        let motivo = 'Il link non apre una pagina web da incorporare' + (tipo ? ' (tipo: ' + tipo.split(';')[0].slice(0, 60) + ')' : '') + '.';
        if (/^#EXTM3U/.test(inizio)) motivo = 'La risposta è un flusso HLS, ma il link non finisce con .m3u8: il player non lo riconoscerebbe. Chiedete alla web TV il link che finisce con .m3u8.';
        else if (/<(?:[A-Za-z0-9_]+:)?MPD\b/.test(inizio) || /dash\+xml/.test(tipo)) motivo = 'La risposta è un flusso DASH, ma il link non finisce con .mpd: il player non lo riconoscerebbe. Chiedete alla web TV il link che finisce con .mpd (o meglio il link .m3u8).';
        else if (/^video\/|mpegurl|mp2t/.test(tipo)) motivo = 'Il link è un file video o un flusso, non una pagina da incorporare: chiedete alla web TV il link che finisce con .m3u8.';
        aggiungi(r, 'non-html', motivo, TESTI['non-html'](ctx, link));
        r.info.incorporabile = false;
        r.titolo = 'Non è una pagina da incorporare';
        return;
    }
    let originePagina = '';
    try { originePagina = new URL(risp.url).origin; } catch (_) { /* resta vuota */ }
    const liste = frameAncestors(risp.intestazioni);
    let ok, motivo = '';
    if (liste) {
        const bloccante = liste.find(l => !sorgentiAmmettono(l, ctx.origine, originePagina));
        ok = !bloccante;
        if (bloccante) motivo = 'Content-Security-Policy: frame-ancestors ' + (bloccante.join(' ') || '(vuoto)').slice(0, 200);
        if (risp.intestazioni.get('x-frame-options')) r.righe.push('La pagina ha anche X-Frame-Options, ma i browser seguono frame-ancestors.');
    } else {
        const x = xfoConsente(risp.intestazioni);
        ok = x.ok;
        motivo = x.motivo;
    }
    r.info.incorporabile = ok;
    if (!ok) {
        aggiungi(r, 'non-incorporabile', 'La pagina della web TV non si può incorporare nel nostro sito: il loro server lo vieta (' + motivo + ').', TESTI['non-incorporabile'](ctx, link, motivo));
        r.titolo = 'La pagina della web TV non si può incorporare';
    } else {
        r.titolo = 'Pagina della web TV da incorporare (ripiego): si può incorporare';
        r.righe.push('La pagina si può incorporare nel nostro sito, ma con i comandi e i loghi della web TV.');
    }
    // un link .m3u8 dentro la pagina: forse e' il flusso diretto
    const trovati = [];
    const reM3u8 = /https:\/\/[^\s"'<>\\]+?\.m3u8(?:\?[^\s"'<>\\]*)?/gi;
    const sorgente = risp.testo.replace(/\\\//g, '/');
    let m;
    while ((m = reM3u8.exec(sorgente)) && trovati.length < 2) { if (trovati.indexOf(m[0]) < 0) trovati.push(m[0].slice(0, 300)); }
    trovati.forEach(t => r.righe.push('Nella pagina c\'è un link .m3u8 che potrebbe essere il flusso diretto: ' + t + ' (provalo con «Prova il link»: se funziona è meglio del ripiego).'));
}

/* ============================================================
   LA PROVA
   ============================================================ */

/* opzioni: { fetch, lookup, origine, timeoutMs, budgetMs, maxByte,
   maxRedirect, firma: url -> url firmato (la firma dell'evento) } */
async function provaLink(link, opzioni) {
    const o = Object.assign({}, PREDEFINITE, opzioni || {});
    const r = nuovoRisultato();
    const incollato = String(link == null ? '' : link).trim().slice(0, 4000);
    const ctx = {
        fetch: o.fetch || fetchSicuro, lookup: o.lookup || lookupPredefinito,
        origine: String(o.origine || ORIGINE_SITO).replace(/\/+$/, ''), timeoutMs: o.timeoutMs, maxByte: o.maxByte,
        maxRedirect: o.maxRedirect, fine: Date.now() + o.budgetMs, firmaAttiva: typeof o.firma === 'function'
    };
    const s = V.leggi(incollato);
    if (!s || s.errore) {
        const codice = !s ? 'formato' : ({ codice: 'formato', lungo: 'formato' }[s.errore] || s.errore);
        let pulito = incollato;
        try { const u = new URL(incollato); if (u.protocol === 'http:') pulito = u.href; } catch (_) { /* resta com'e' */ }
        const testi = {
            https: TESTI.https(ctx, pulito.slice(0, 300)), rtmp: TESTI.rtmp(ctx), credenziali: TESTI.credenziali(ctx),
            file: TESTI.file(ctx, pulito.slice(0, 300))
        };
        aggiungi(r, codice, V.messaggio(s), testi[codice] || '');
        r.titolo = {
            https: 'Link in http: serve https', rtmp: 'Link per trasmettere, non per guardare', credenziali: 'Link con nome utente e password',
            file: 'È un file video, non una diretta'
        }[codice] || (s ? 'Link non valido' : 'Nessun link');
        return chiudi(r);
    }
    r.tipo = s.tipo;
    r.valore = s.valore;
    let daProvare = s.valore;
    if (ctx.firmaAttiva) {
        try { daProvare = String(o.firma(s.valore) || s.valore); } catch (_) { daProvare = s.valore; }
    }
    r.urlProva = daProvare;
    // prima di tutto: un indirizzo interno o privato non si prova nemmeno
    try { await controllaHost(ctx, new URL(daProvare).hostname); } catch (e) {
        if (e.intoppo && e.intoppo.codice === 'non-pubblico') {
            problemaDa(ctx, r, e, s.valore);
            r.titolo = titoloIntoppo(r);
            return chiudi(r);
        }
        // gli altri intoppi (DNS) li racconta la richiesta vera e propria
    }
    r.righe.push(V.descrizione(s.tipo));
    if (s.tipo === 'hls') await provaHls(ctx, r, daProvare, s.valore);
    else if (s.tipo === 'dash') await provaDash(ctx, r, daProvare, s.valore);
    else await provaIncorporato(ctx, r, daProvare, s.valore);
    if (ctx.firmaAttiva && r.info.raggiungibile) r.righe.push('Provato con la firma impostata per l\'evento (link firmato a tempo).');
    return chiudi(r);
}

module.exports = {
    provaLink, indirizzoPubblico, eIndirizzoIp, leggiPlaylist, leggiMpd, durataIso, frameAncestors, sorgentiAmmettono,
    xfoConsente, corsConsente, fetchSicuro, ORIGINE_SITO, GRAVI
};
