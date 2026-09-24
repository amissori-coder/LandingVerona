/* ============================================================
   Diretta degli eventi: gli attrezzi comuni alle funzioni
   ------------------------------------------------------------
   Tutto quello che le funzioni api/diretta-*.js usano in piu' di un
   posto: la risposta alle chiamate del browser (CORS), la lettura del
   corpo, l'ora di Roma, l'email tecnica dietro il nome utente, il
   collegamento alla pagina della diretta, il riconoscimento dei
   gestori e il limite anti-abuso degli endpoint pubblici.

   Non tocca niente delle altre funzioni del servizio: legge alcune
   variabili d'ambiente che esistono gia' (ALLOWED_ORIGIN,
   APP_BASE_URL) e le sue, che cominciano tutte con DIRETTA_.
   ============================================================ */
'use strict';
const crypto = require('crypto');

/* ---------- errori con lo stato HTTP ---------- */
function errore(stato, msg, codice) {
    const e = new Error(msg);
    e.stato = stato;
    e.codice = codice || '';
    return e;
}

/* ---------- risposta al browser ---------- */
// ALLOWED_ORIGIN puo' contenere piu' origini separate da virgola (serve
// alle prove locali): si rimanda quella da cui arriva la chiamata, se c'e'.
function cors(req, res, metodi) {
    const ammesse = String(process.env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean);
    const origine = String((req.headers || {}).origin || '');
    const scelta = ammesse.indexOf('*') >= 0 ? '*' : (ammesse.indexOf(origine) >= 0 ? origine : ammesse[0]);
    res.setHeader('Access-Control-Allow-Origin', scelta);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', (metodi || 'POST') + ', OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
    return false;
}

function corpo(req) {
    const b = req.body;
    if (!b) return {};
    if (typeof b === 'string') { try { return JSON.parse(b || '{}'); } catch (_) { return {}; } }
    if (Buffer.isBuffer(b)) { try { return JSON.parse(b.toString('utf8') || '{}'); } catch (_) { return {}; } }
    return b;
}

/* Risposta di errore uniforme. Il motivo tecnico finisce nei log (mai
   dati personali, mai password), al browser va la frase per le persone. */
function rispondiErrore(res, e, contesto) {
    const stato = (e && e.stato) || 500;
    if (stato >= 500) console.error('[diretta] ' + (contesto || '') + ':', String((e && e.message) || e).slice(0, 300));
    res.status(stato).json({ ok: false, codice: (e && e.codice) || 'errore', msg: stato >= 500 ? 'Errore del servizio: riprova tra poco.' : String(e.message || 'Richiesta non valida') });
}

function testo(v, max) {
    return String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, max || 200);
}

function ipDi(req) {
    const h = req.headers || {};
    const inoltro = String(h['x-forwarded-for'] || '').split(',')[0].trim();
    return inoltro || String(h['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'sconosciuto');
}

// impronta breve e non reversibile (per gli indirizzi IP nelle chiavi)
function impronta(s) {
    return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32);
}
/* L'impronta di un indirizzo IP per i limiti anti-abuso. Per IPv6 conta
   la rete /64 (i primi quattro gruppi): a una sola casa o a un solo
   server ne tocca una intera, e contare i singoli indirizzi lascerebbe
   a chi prova le password miliardi di "IP diversi". */
function improntaIp(ip) {
    let s = String(ip || '').trim().toLowerCase().replace(/^::ffff:/, '');
    if (s.indexOf(':') >= 0) {
        const pieni = s.split('::');
        const testa = pieni[0] ? pieni[0].split(':') : [];
        const coda = pieni.length > 1 && pieni[1] ? pieni[1].split(':') : [];
        const gruppi = testa.concat(new Array(Math.max(0, 8 - testa.length - coda.length)).fill('0'), coda);
        s = gruppi.slice(0, 4).map(g => (g || '0').replace(/^0+(?=.)/, '')).join(':') + '::/64';
    }
    return impronta('ip|' + s);
}

function intero(nome, predefinito) {
    const v = Number(process.env[nome]);
    return Number.isFinite(v) && v >= 0 ? v : predefinito;
}

/* ---------- l'ora di Roma ----------
   Le date degli eventi si scrivono come le scrive chi organizza ("2 ottobre,
   dalle 9.00 alle 17.30") e sono sempre ora di Roma, ora legale compresa. */
const FORMATO_ROMA = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
});
function partiRoma(ms) {
    const p = {};
    FORMATO_ROMA.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
    return { anno: +p.year, mese: +p.month, giorno: +p.day, ora: +p.hour % 24, minuto: +p.minute, secondo: +p.second };
}
// scarto di Roma rispetto a UTC in quell'istante, in millisecondi
function scartoRoma(ms) {
    const p = partiRoma(ms);
    return Date.UTC(p.anno, p.mese - 1, p.giorno, p.ora, p.minuto, p.secondo) - Math.floor(ms / 1000) * 1000;
}
// "2026-10-02" + "09:00" (ora di Roma) -> millisecondi UTC
function istanteRoma(data, ora) {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data || ''));
    const o = /^(\d{1,2})[:.](\d{2})$/.exec(String(ora || '').trim());
    if (!d || !o) return NaN;
    const comeUtc = Date.UTC(+d[1], +d[2] - 1, +d[3], +o[1], +o[2]);
    let t = comeUtc - scartoRoma(comeUtc);
    t = comeUtc - scartoRoma(t); // secondo passaggio: giusto anche a cavallo del cambio d'ora
    return t;
}
function dataRoma(ms) {
    const p = partiRoma(ms);
    return p.anno + '-' + String(p.mese).padStart(2, '0') + '-' + String(p.giorno).padStart(2, '0');
}
function oraRoma(ms) {
    const p = partiRoma(ms);
    return String(p.ora).padStart(2, '0') + ':' + String(p.minuto).padStart(2, '0');
}
// "venerdì 2 ottobre 2026"
function dataEstesa(ms) {
    return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms));
}
// "9.00", "17.30": come le scrive il sito
function oraLeggibile(ms) {
    const p = partiRoma(ms);
    return p.ora + '.' + String(p.minuto).padStart(2, '0');
}

/* ---------- nome utente ed email tecnica ----------
   La persona scrive solo il nome utente. Dietro, l'account Firebase ha
   un'email tecnica che nessuno vede e a cui non arriva niente:
   mariorossi@utenti.diretta.nextgenerationbusiness.it */
function dominioTecnico() {
    return String(process.env.DIRETTA_DOMINIO_TECNICO || 'utenti.diretta.nextgenerationbusiness.it').trim().toLowerCase();
}
function emailTecnica(nomeUtente) {
    return String(nomeUtente) + '@' + dominioTecnico();
}
function eEmailTecnica(email) {
    return String(email || '').toLowerCase().endsWith('@' + dominioTecnico());
}

function baseSito() {
    return String(process.env.APP_BASE_URL || 'https://nextgenerationbusiness.it').replace(/\/+$/, '');
}
// il collegamento dell'email: porta il nome utente, cosi' il campo e' gia' scritto
function linkDiretta(nomeUtente) {
    return baseSito() + '/diretta/' + (nomeUtente ? '?u=' + encodeURIComponent(nomeUtente) : '');
}
function assistenza() {
    return {
        email: String(process.env.DIRETTA_ASSISTENZA_EMAIL || 'info@nextgenerationbusiness.it').trim(),
        telefono: String(process.env.DIRETTA_ASSISTENZA_TELEFONO || '').trim()
    };
}

/* ---------- i gestori ----------
   Nessun ruolo: un elenco fisso di email nella variabile
   DIRETTA_ADMIN_EMAILS (separate da virgola, spazio o a capo). Ogni
   chiamata della gestione porta il token di Firebase, e passa solo se
   TUTTE queste cose sono vere nello stesso momento:
   - il token e' valido e non revocato (verifyIdToken con il controllo
     delle revoche: un gestore tolto o con la password cambiata non
     resta dentro per un'ora);
   - l'email e' nell'elenco ADESSO: togliere un'email dalla variabile
     basta a chiudere la porta;
   - l'email e' verificata e l'account ha il claim "gestore". Entrambe
     le cose le mette SOLO il servizio (diretta-accesso, azione
     'gestore-accesso'), che crea o rimette in ordine l'account del
     gestore prima di mandargli il collegamento per la password. Senza
     questo controllo chiunque, con la chiave pubblica del progetto,
     potrebbe registrarsi da solo con l'email di un gestore e
     presentarsi con un token "valido";
   - l'accesso e' avvenuto con email e password. */
function gestori() {
    return new Set(String(process.env.DIRETTA_ADMIN_EMAILS || '').toLowerCase().split(/[\s,;]+/).map(s => s.trim()).filter(Boolean));
}
function eGestore(email) {
    const e = String(email || '').trim().toLowerCase();
    return !!e && !eEmailTecnica(e) && gestori().has(e);
}
/* Perche' verifyIdToken ha rifiutato il token? Un token scaduto, revocato
   o sbagliato (true) fa uscire la persona; un intoppo di Google (false:
   rete, chiavi pubbliche non scaricate, errore interno) no, si riprova.
   Attenzione: firebase-admin da' 'auth/argument-error' sia a un token
   sbagliato sia alle chiavi pubbliche che non si scaricano (in quel caso
   il messaggio e' quello dell'errore di rete): si distinguono dal testo. */
function tokenNonValido(e) {
    const c = String((e && (e.code || (e.errorInfo && e.errorInfo.code))) || '');
    const msg = String((e && e.message) || '');
    if (c === 'auth/argument-error' && /making request|fetching|socket|ECONN|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|timeout|network/i.test(msg)) return false;
    return /^auth\/(id-token-expired|id-token-revoked|argument-error|invalid-id-token|user-disabled|user-not-found)$/.test(c);
}
async function verificaGestore(ctx, req) {
    const h = String((req.headers || {}).authorization || '');
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (!m) throw errore(401, 'Accesso richiesto', 'non-autenticato');
    let tok;
    try { tok = await ctx.auth.verifyIdToken(m[1], true); } catch (e) {
        if (tokenNonValido(e)) throw errore(401, 'Sessione scaduta: accedi di nuovo', 'non-autenticato');
        throw errore(503, 'Servizio di accesso momentaneamente non disponibile: riprova tra qualche secondo.', 'riprova');
    }
    const email = String(tok.email || '').toLowerCase();
    const provider = tok.firebase && tok.firebase.sign_in_provider;
    if (!eGestore(email) || tok.email_verified !== true || tok.gestore !== true || provider !== 'password') {
        // un ex gestore non conserva nemmeno la lettura degli eventi
        if (tok.gestore && !eGestore(email)) { try { await ctx.auth.setCustomUserClaims(tok.uid, null); } catch (_) { /* pazienza */ } }
        throw errore(403, 'Questo account non e\' tra i gestori della diretta', 'non-gestore');
    }
    return { uid: tok.uid, email: email, token: tok };
}

/* ---------- limite anti-abuso ----------
   Stesso schema di invia-email.js: una pausa minima fra due usi e un
   tetto per finestra, in una transazione (regge anche le chiamate
   contemporanee). Restituisce true se l'uso e' consentito. */
async function consumaGettone(ctx, collezione, chiave, opz) {
    const pausaMs = (opz && opz.pausaMs) || 0;
    const maxFinestra = (opz && opz.maxFinestra) || 5;
    const finestraMs = (opz && opz.finestraMs) || 60 * 60 * 1000;
    const ref = ctx.db.collection(collezione).doc(String(chiave).slice(0, 700));
    return ctx.db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const ora = ctx.adesso();
        const d = snap.exists ? snap.data() : {};
        const stessa = (ora - (d.inizioFinestra || 0)) < finestraMs;
        const conteggio = stessa ? (d.conteggio || 0) : 0;
        if ((ora - (d.ultimo || 0)) < pausaMs || conteggio >= maxFinestra) return false;
        tx.set(ref, { ultimo: ora, inizioFinestra: stessa ? d.inizioFinestra : ora, conteggio: conteggio + 1 }, { merge: true });
        return true;
    });
}

// tanti elementi in gruppi da n (letture getAll, query "in", scritture a blocchi)
function aGruppi(elenco, n) {
    const out = [];
    for (let i = 0; i < elenco.length; i += n) out.push(elenco.slice(i, i + n));
    return out;
}

const pausa = ms => new Promise(r => setTimeout(r, ms));

module.exports = {
    errore, cors, corpo, rispondiErrore, testo, ipDi, impronta, improntaIp, intero,
    istanteRoma, dataRoma, oraRoma, dataEstesa, oraLeggibile, scartoRoma,
    dominioTecnico, emailTecnica, eEmailTecnica, baseSito, linkDiretta, assistenza,
    gestori, eGestore, tokenNonValido, verificaGestore, consumaGettone, aGruppi, pausa
};
