/* ============================================================
   ANTEPRIMA - il servizio VERO (email-service/api/diretta-*.js)
   ------------------------------------------------------------
   Le quattro funzioni di Vercel della diretta, cosi' come sono,
   chiamate con una richiesta e una risposta finte al posto di quelle
   di Vercel. Le pagine le raggiungono con fetch() verso
   https://anteprima.invalid/api/<funzione>: anteprima/pagina.js
   intercetta quelle chiamate e le porta qui.

   Qui dentro passano anche le due uscite verso l'esterno che il
   servizio farebbe: la verifica della password su Google (Identity
   Toolkit, risposta da admin.js) e l'invio delle email (posta
   finta: la "Posta di prova" dell'anteprima). Nient'altro esce dal
   browser.

   Il lavoro programmato (diretta-cron, ogni 5 minuti su Vercel) qui
   gira ogni 20 secondi: la coda delle email e i promemoria vanno
   avanti da soli.
   ============================================================ */
'use strict';
const adm = require('./admin');

const FUNZIONI = {
    'diretta-accesso': require('../../../../email-service/api/diretta-accesso.js'),
    'diretta-gestione': require('../../../../email-service/api/diretta-gestione.js'),
    'diretta-stato': require('../../../../email-service/api/diretta-stato.js'),
    'diretta-cron': require('../../../../email-service/api/diretta-cron.js')
};

const INDIRIZZO_SERVIZIO = 'https://anteprima.invalid/api';
const SEGRETO_CRON = 'anteprima-cron';

class RispostaFinta {
    constructor() {
        this.statusCode = 200;
        this.intestazioni = {};
        this.corpo = '';
        this.finita = false;
    }
    status(n) { this.statusCode = n; return this; }
    setHeader(k, v) { this.intestazioni[String(k).toLowerCase()] = v; return this; }
    getHeader(k) { return this.intestazioni[String(k).toLowerCase()]; }
    json(o) { this.setHeader('content-type', 'application/json'); this.corpo = JSON.stringify(o); this.finita = true; return this; }
    send(x) { this.corpo = typeof x === 'string' ? x : JSON.stringify(x); this.finita = true; return this; }
    end(x) { if (x !== undefined) this.corpo = String(x); this.finita = true; return this; }
}

function minuscole(h) {
    const o = {};
    if (!h) return o;
    if (typeof h.forEach === 'function' && !Array.isArray(h) && typeof h.get === 'function') { h.forEach((v, k) => { o[String(k).toLowerCase()] = v; }); return o; }
    if (Array.isArray(h)) { h.forEach(([k, v]) => { o[String(k).toLowerCase()] = v; }); return o; }
    Object.keys(h).forEach(k => { o[k.toLowerCase()] = h[k]; });
    return o;
}

async function chiama(nome, { metodo, corpo, intestazioni, query } = {}) {
    const f = FUNZIONI[nome];
    if (!f) return { stato: 404, intestazioni: {}, corpo: JSON.stringify({ ok: false, codice: 'funzione', msg: 'Funzione inesistente' }) };
    const req = { method: metodo || 'POST', headers: minuscole(intestazioni), body: corpo, query: query || {}, url: '/api/' + nome };
    const res = new RispostaFinta();
    try {
        await f(req, res);
    } catch (e) {
        console.error('[anteprima] ' + nome + ':', e);
        if (!res.finita) res.status(500).json({ ok: false, codice: 'errore', msg: 'Errore del servizio: riprova tra poco.' });
    }
    return { stato: res.statusCode, intestazioni: res.intestazioni, corpo: res.corpo };
}

/* La richiesta di una pagina (fetch verso INDIRIZZO_SERVIZIO) diventa
   una chiamata alla funzione vera; la risposta torna come oggetto
   semplice, che pagina.js trasforma in una Response della sua finestra. */
async function daPagina(url, init, chi) {
    const u = new URL(String(url));
    const nome = u.pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
    let corpo = init && init.body;
    if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch (e) { /* resta testo */ } }
    const intestazioni = Object.assign(minuscole(init && init.headers), {
        origin: chi.origine || 'https://nextgenerationbusiness.it',
        'x-forwarded-for': chi.ip || '93.44.10.20',
        'user-agent': chi.userAgent || 'Anteprima'
    });
    const query = {};
    u.searchParams.forEach((v, k) => { query[k] = v; });
    // un filo di rete: le risposte non arrivano mai nello stesso istante
    await new Promise(r => setTimeout(r, 60 + Math.random() * 140));
    return chiama(nome, { metodo: (init && init.method) || 'GET', corpo, intestazioni, query });
}

/* Le uscite del servizio verso l'esterno: qui, solo Google Identity
   Toolkit (verifica della password). Tutto il resto e' vietato. */
function installaUscite() {
    const originale = globalThis.fetch ? globalThis.fetch.bind(globalThis) : null;
    globalThis.fetch = async function (url, init) {
        const indirizzo = String((url && url.url) || url);
        if (/accounts:signInWithPassword/.test(indirizzo)) {
            await new Promise(r => setTimeout(r, 120 + Math.random() * 180));
            let corpo = {};
            try { corpo = JSON.parse((init && init.body) || '{}'); } catch (e) { corpo = {}; }
            const r = adm.verificaPasswordGoogle(corpo);
            return new Response(JSON.stringify(r.json), { status: r.stato, headers: { 'content-type': 'application/json' } });
        }
        if (/^https?:\/\/[^/]*anteprima\.invalid\//.test(indirizzo) || /api\.brevo\.com/.test(indirizzo)) {
            throw new TypeError('Nell\'anteprima il servizio non esce in rete: ' + indirizzo.slice(0, 80));
        }
        if (!originale) throw new TypeError('fetch non disponibile');
        return originale(url, init);
    };
}

let timerCron = null;
function avviaCron() {
    clearInterval(timerCron);
    const giro = () => chiama('diretta-cron', { metodo: 'GET', intestazioni: { authorization: 'Bearer ' + SEGRETO_CRON } })
        .catch(e => console.error('[anteprima] cron', e));
    timerCron = setInterval(giro, 20000);
    setTimeout(giro, 3000);
}

module.exports = { chiama, daPagina, installaUscite, avviaCron, INDIRIZZO_SERVIZIO, SEGRETO_CRON };
