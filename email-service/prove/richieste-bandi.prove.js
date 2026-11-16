/* ============================================================
   PROVE - lib/richieste-bandi.js (il modulo dell'area /bandi/)
   ------------------------------------------------------------
       node prove/richieste-bandi.prove.js

   Niente da installare: Firestore, la posta e Cloudflare sono finti
   e stanno qui dentro. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Una richiesta dall'area bandi deve arrivare a chi
   segue i bandi, e il modulo non deve diventare un modo per spedire
   mail per conto nostro:
     - la richiesta si salva (`richiesteBandi`) e arriva ai DUE
       destinatari (a.missori@emvas.tax e dott.venturasara@gmail.com, o
       agli indirizzi di BANDI_DESTINATARI), con il bando nell'oggetto
       e "Rispondi" verso chi ha scritto;
     - a chi ha scritto parte una ricevuta che NON ripete ne' il
       messaggio ne' il titolo del bando;
     - una richiesta senza bando e' una richiesta generica, e vale;
     - il campo nascosto pieno: "ok" e niente; un modulo spedito in
       meno di tre secondi: 400 con "premi di nuovo";
     - i campi obbligatori, l'indirizzo che e' solo un indirizzo, il
       consenso, la lunghezza del messaggio;
     - con TURNSTILE_SECRET serve il gettone, e di QUESTO modulo;
     - con la posta giu' la richiesta e' salva e la risposta e' "ok";
     - nessuna riga fra le iscrizioni, nemmeno con una `pagina`;
     - cinque richieste al giorno per indirizzo, e il freno per IP.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- orologio ----------
let orologio = Date.parse('2026-11-20T11:00:00+01:00');
const DateVera = Date;
global.Date = class extends DateVera {
    constructor(...a) { if (a.length) super(...a); else super(orologio); }
    static now() { return orologio; }
};
function avanza(ms) { orologio += ms; }

// ---------- Firestore finto ----------
const dati = new Map();
function applica(vecchio, patch, merge) {
    const base = (merge && vecchio) ? Object.assign({}, vecchio) : {};
    for (const k of Object.keys(patch)) base[k] = patch[k];
    return base;
}
function istantanea(chiave, ref) {
    const v = dati.get(chiave);
    return { exists: dati.has(chiave), id: chiave.split('/').pop(), data: () => (v ? JSON.parse(JSON.stringify(v)) : undefined), ref: ref };
}
function doc(coll, id) {
    const chiave = coll + '/' + id;
    const self = {
        id: id,
        get: async () => istantanea(chiave, self),
        set: async (patch, opz) => { dati.set(chiave, applica(dati.get(chiave), patch, !!(opz && opz.merge))); }
    };
    return self;
}
function interroga(coll, filtri, max) {
    return {
        where(campo, op, val) { return interroga(coll, filtri.concat([[campo, val]]), max); },
        limit(n) { return interroga(coll, filtri, n); },
        async get() {
            const docs = [...dati.keys()].filter(k => k.startsWith(coll + '/'))
                .filter(k => filtri.every(([c, v]) => (dati.get(k) || {})[c] === v))
                .slice(0, max || 1e9)
                .map(k => istantanea(k, doc(coll, k.split('/')[1])));
            return { docs: docs, forEach: f => docs.forEach(f), size: docs.length };
        }
    };
}
const db = {
    collection(coll) { return Object.assign(interroga(coll, [], 0), { doc: id => doc(coll, id) }); },
    async runTransaction(fn) {
        const scritture = [];
        const esito = await fn({ get: async r => r.get(), set: (r, patch, opz) => { scritture.push([r, patch, opz]); } });
        for (const [r, patch, opz] of scritture) await r.set(patch, opz);
        return esito;
    }
};
const admin = { initializeApp() { }, credential: { cert: () => ({}) }, apps: [], firestore: () => db };
admin.firestore.FieldValue = { serverTimestamp: () => orologio, increment: n => n, arrayUnion: (...a) => a, delete: () => null };

// ---------- posta e Cloudflare finti ----------
let spedite = [];
let mailGuasta = 0;
global.fetch = async (url, opz) => {
    if (/turnstile\/v0\/siteverify/.test(String(url))) {
        const q = new URLSearchParams(opz.body);
        const g = q.get('response');
        const buono = q.get('secret') === 'segreto-turnstile' && (g === 'gettone-buono' || g === 'gettone-domande');
        // Cloudflare rimanda l'azione del widget che ha preparato il gettone
        return { ok: true, status: 200, json: async () => ({ success: buono, action: g === 'gettone-domande' ? 'domanda-sito' : 'richiesta-bando', 'error-codes': buono ? [] : ['invalid-input-response'] }) };
    }
    throw new Error('rete non prevista: ' + url);
};
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return { createTransport: () => ({ sendMail: async m => {
        if (mailGuasta > 0) { mailGuasta--; throw new Error('server di posta non raggiungibile'); }
        spedite.push(m); return {};
    }, close() { } }) };
    if (nome === 'imapflow') return { ImapFlow: function () { } };
    if (nome === 'google-auth-library') return { JWT: function () { }, GoogleAuth: function () { } };
    return veroRequire.apply(this, arguments);
};
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ client_email: 'servizio@esempio.iam.gserviceaccount.com', private_key: 'chiave-finta' });
process.env.SMTP_FROM_EMAIL = 'noreply@esempio.it';

const RADICE = path.join(__dirname, '..');
const servizio = require(path.join(RADICE, 'api/iscrizione-nuova.js'));

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
let ipProgressivo = 0;
async function chiama(corpo, ip) {
    let stato = 0, risposta = null;
    const res = { setHeader() { }, status(s) { stato = s; return res; }, json(c) { risposta = c; return res; }, end() { return res; } };
    const errVero = console.error, avvVero = console.warn;
    console.error = () => { }; console.warn = () => { };
    try {
        await servizio({ method: 'POST', headers: { 'x-forwarded-for': ip || ('10.8.' + (ipProgressivo++ % 250) + '.1') }, body: JSON.stringify(corpo) }, res);
    } finally { console.error = errVero; console.warn = avvVero; }
    return { stato: stato, corpo: risposta || {} };
}
function richiesta(campi) {
    return Object.assign({
        azione: 'richiesta-bando', nome: 'Lucia', cognome: 'Bianchi', azienda: 'Officine Bianchi Srl', email: 'Lucia@Officine.it',
        telefono: '333 1234567', sede: 'Veneto',
        bando: 'mimit-brevetti-piu', bandoTitolo: 'MIMIT - Brevetti+', bandoRegione: 'Nazionale', bandoTipologia: 'Contributo a fondo perduto',
        messaggio: 'Abbiamo un brevetto concesso nel 2025.\nGrazie <b>mille</b>', privacy: true, marketing: false,
        captcha: '', sito: '', ms: 15000
    }, campi || {});
}
const conta = coll => [...dati.keys()].filter(k => k.startsWith(coll + '/')).length;
const richieste = () => [...dati.keys()].filter(k => k.startsWith('richiesteBandi/')).map(k => dati.get(k));
function azzera() { dati.clear(); spedite = []; mailGuasta = 0; }
const DUE = 'a.missori@emvas.tax, dott.venturasara@gmail.com';

const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

prova('La richiesta arriva ai due destinatari, con "Rispondi" verso chi scrive, e la ricevuta non ripete niente', async () => {
    azzera();
    const r = await chiama(richiesta());
    esigi(r.stato === 200 && JSON.stringify(r.corpo) === '{"ok":true}', 'risposta: ok, e nient\'altro', JSON.stringify(r.corpo));
    const d = richieste();
    esigi(d.length === 1 && d[0].email === 'lucia@officine.it' && d[0].bando === 'mimit-brevetti-piu' && d[0].bandoTitolo === 'MIMIT - Brevetti+'
        && d[0].privacy === true && d[0].marketing === false && /\nGrazie/.test(d[0].messaggio), 'salvata in richiesteBandi, con il bando e gli a capo del messaggio', JSON.stringify(d[0]));
    esigi(d[0].avvisati === 2 && d[0].confermato === true, 'con l\'esito delle due mail');
    const interna = spedite.find(m => m.to === DUE) || {};
    esigi(spedite.length === 2 && interna.replyTo === 'lucia@officine.it', 'a a.missori@emvas.tax e dott.venturasara@gmail.com, e "Rispondi" scrive a Lucia', spedite.map(m => m.to).join(' | '));
    esigi(interna.subject === 'Richiesta bando - MIMIT - Brevetti+ - Officine Bianchi Srl', 'oggetto: bando e azienda', interna.subject);
    esigi(/Abbiamo un brevetto concesso/.test(interna.html) && /Grazie &lt;b&gt;mille&lt;\/b&gt;/.test(interna.html) && /<br>Grazie/.test(interna.html)
        && /^<!doctype html>/.test(interna.html), 'il messaggio c\'e\', con l\'HTML neutralizzato e gli a capo, nella pagina delle mail');
    esigi(/Officine Bianchi Srl/.test(interna.html) && /333 1234567/.test(interna.html) && /Veneto/.test(interna.html) && /Nazionale/.test(interna.html)
        && /Contributo a fondo perduto/.test(interna.text), 'con azienda, telefono, sede, regione e tipologia del bando');
    const ric = spedite.find(m => m.to === 'lucia@officine.it') || {};
    esigi(/^Abbiamo ricevuto la tua richiesta sui bandi/.test(ric.subject) && ric.replyTo === DUE, 'la ricevuta a Lucia, con "Rispondi" verso chi segue i bandi');
    esigi(!/brevetto|mille|Officine|333 1234567|Brevetti/.test(ric.html + ric.text + ric.subject), 'la ricevuta NON ripete il messaggio, il bando ne\' gli altri dati scritti');
    esigi(/Buongiorno Lucia/.test(ric.text) && /Spam/.test(ric.text), 'saluta per nome e dice di guardare nello spam');
    esigi(conta('iscrizioni') === 0, 'e nessuna riga fra le iscrizioni');
});

prova('Senza bando e\' una richiesta generica; i testi del bando sono ripuliti; BANDI_DESTINATARI cambia i destinatari', async () => {
    azzera();
    const r = await chiama(richiesta({ bando: '', bandoTitolo: '', bandoRegione: '', bandoTipologia: '', telefono: '', messaggio: '', email: 'gen@officine.it' }));
    esigi(r.corpo.ok === true && richieste().length === 1, 'senza bando, telefono e messaggio passa lo stesso');
    let interna = spedite.find(m => m.to === DUE) || {};
    esigi(interna.subject === 'Richiesta bando - richiesta generica - Officine Bianchi Srl' && /Richiesta generica/.test(interna.html), 'e l\'oggetto lo dice', interna.subject);
    spedite = [];
    await chiama(richiesta({ bando: 'Lazio/../<script>', bandoTitolo: 'Titolo\r\nBcc: altri@altro.it ' + 'x'.repeat(400), email: 'pul@officine.it', nome: 'Compra su www.truffa.example', pagina: 'Milano 26 Febbraio 2027 - Iscrizione' }));
    const d = richieste().find(x => x.email === 'pul@officine.it') || {};
    interna = spedite.find(m => m.to === DUE) || {};
    esigi(d.bando === 'lazioscript', 'l\'identificativo del bando: solo lettere minuscole, cifre e trattini', d.bando);
    esigi(d.bandoTitolo.length === 200 && !/[\r\n]/.test(interna.subject) && interna.subject.length <= 250, 'il titolo accorciato, e nessun a capo nell\'oggetto');
    const ric = spedite.find(m => m.to === 'pul@officine.it') || {};
    esigi(/^Buongiorno,/.test(ric.text) && !/truffa/.test(ric.html + ric.text + ric.subject), 'un "nome" che non e\' un nome non finisce nella ricevuta');
    esigi(conta('iscrizioni') === 0, 'nemmeno con una `pagina` di Milano diventa un\'iscrizione');
    process.env.BANDI_DESTINATARI = 'Bandi@Revilaw.it; altra@revilaw.it, non-valido';
    spedite = [];
    await chiama(richiesta({ email: 'dest@officine.it' }));
    delete process.env.BANDI_DESTINATARI;
    esigi(spedite.some(m => m.to === 'bandi@revilaw.it, altra@revilaw.it' && m.replyTo === 'dest@officine.it'), 'BANDI_DESTINATARI: piu\' indirizzi, quelli validi');
});

prova('Il campo nascosto pieno: "ok", e niente; un modulo troppo veloce: lo si dice', async () => {
    azzera();
    const robot = await chiama(richiesta({ sito: 'https://spam.example' }));
    esigi(robot.stato === 200 && JSON.stringify(robot.corpo) === '{"ok":true}', 'campo nascosto pieno: la risposta e\' la stessa di una richiesta vera');
    const veloce = await chiama(richiesta({ ms: 1200 }));
    const senzaTempo = await chiama(richiesta({ ms: undefined }));
    esigi([veloce, senzaTempo].every(r => r.stato === 400 && r.corpo.ok === false && /premi di nuovo/.test(r.corpo.msg) && !r.corpo.campo), 'troppo presto (o senza tempo): 400, e il modulo dice di premere di nuovo', JSON.stringify(veloce.corpo));
    esigi(richieste().length === 0 && spedite.length === 0, 'e non si salva ne\' si spedisce niente');
});

prova('I campi obbligatori, l\'indirizzo, il consenso, la lunghezza', async () => {
    azzera();
    const casi = [
        [{ nome: ' ' }, 'nome'], [{ cognome: '' }, 'cognome'], [{ azienda: '' }, 'azienda'],
        [{ email: 'lucia@' }, 'email'], [{ email: 'testo<vittima@altro.it>' }, 'email'], [{ email: 'a@b.it, c@d.it' }, 'email'],
        [{ telefono: '12' }, 'telefono'], [{ messaggio: 'x'.repeat(2001) }, 'messaggio'],
        [{ privacy: false }, 'privacy'], [{ privacy: undefined }, 'privacy']
    ];
    for (const [campi, campo] of casi) {
        const r = await chiama(richiesta(campi));
        esigi(r.stato === 400 && r.corpo.ok === false && r.corpo.campo === campo, JSON.stringify(campi).slice(0, 60) + ' -> errore sul campo ' + campo, JSON.stringify(r.corpo));
    }
    esigi(richieste().length === 0 && spedite.length === 0, 'niente salvato, niente spedito');
});

prova('Con TURNSTILE_SECRET serve il gettone, e di questo modulo', async () => {
    azzera();
    process.env.TURNSTILE_SECRET = 'segreto-turnstile';
    try {
        const senza = await chiama(richiesta());
        esigi(senza.stato === 400 && senza.corpo.captchaKo === true, 'senza gettone: captchaKo');
        const altro = await chiama(richiesta({ captcha: 'gettone-domande' }));
        esigi(altro.stato === 400 && altro.corpo.captchaKo === true, 'con il gettone del modulo delle domande: captchaKo');
        esigi(richieste().length === 0, 'e niente si salva');
        const buono = await chiama(richiesta({ captcha: 'gettone-buono' }));
        esigi(buono.corpo.ok === true && richieste().length === 1, 'con il gettone buono passa');
    } finally { delete process.env.TURNSTILE_SECRET; }
});

prova('Con la posta giu\' la richiesta e\' salva e la risposta e\' "ok"', async () => {
    azzera();
    mailGuasta = 2;
    const r = await chiama(richiesta());
    const d = richieste();
    esigi(r.corpo.ok === true && d.length === 1 && d[0].avvisati === 0 && d[0].confermato === false, 'salvata, con scritto che le mail non sono partite', JSON.stringify(d[0] || {}));
});

prova('Cinque richieste al giorno per indirizzo (le varianti contano insieme)', async () => {
    azzera();
    let passate = 0;
    for (let i = 0; i < 5; i++) { if ((await chiama(richiesta({ email: 'cinque+' + i + '@officine.it' }))).corpo.ok) passate++; }
    const sesta = await chiama(richiesta({ email: 'cinque@officine.it' }));
    esigi(passate === 5 && sesta.stato === 429 && sesta.corpo.ok === false, 'cinque passano, la sesta no', JSON.stringify(sesta.corpo));
    esigi(richieste().length === 5, 'la sesta non si salva');
    esigi((await chiama(richiesta({ email: 'altra@officine.it' }))).corpo.ok, 'un altro indirizzo passa');
    esigi(![...dati.keys()].some(k => k.startsWith('richiesteBandiLimiti/') && /cinque/.test(k)), 'il contatore non ha l\'indirizzo nel nome');
    avanza(24 * 60 * 60 * 1000);
    esigi((await chiama(richiesta({ email: 'cinque@officine.it' }))).corpo.ok, 'il giorno dopo si\'');
});

prova('Il freno per indirizzo IP: otto in dieci minuti, anche con una pagina di Milano', async () => {
    azzera();
    let respinte = 0;
    for (let i = 0; i < 10; i++) {
        const r = await chiama(richiesta({ email: 'ip' + i + '@officine.it', pagina: 'Milano 26 Febbraio 2027 - Iscrizione' }), '172.16.7.7');
        if (r.stato === 429) respinte++;
    }
    esigi(respinte === 2 && richieste().length === 8, 'dalla nona in poi 429, e non si salvano', String(respinte));
});

(async () => {
    for (const p of prove) { console.log('\n' + p.titolo); await p.fn(); }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
