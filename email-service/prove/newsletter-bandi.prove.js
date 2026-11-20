/* ============================================================
   PROVE - la newsletter dei bandi (lib/newsletter-bandi.js)
   ------------------------------------------------------------
       node prove/newsletter-bandi.prove.js

   Niente da installare: Firestore, la posta, Brevo, Cloudflare e
   il sito sono finti e stanno qui dentro. Esce con 1 se qualcosa e'
   rosso.

   COSA DIMOSTRANO.
     - Il file dei bandi si legge senza eseguirlo, ed e' la stessa
       lettura del browser (sul file vero del sito).
     - L'iscrizione: scheda in attesa e mail con il pulsante di
       conferma; i freni (campo nascosto, tempo, Turnstile di QUESTO
       modulo, tre mail al giorno per indirizzo, il freno per IP); a
       chi e' gia' iscritto la mail "sei gia' iscritto", con la
       stessa risposta al modulo.
     - La conferma: firmata, scade, non riporta dentro chi si e'
       disiscritto dopo, e la seconda volta non sposta la data.
     - La disiscrizione tocca solo i bandi (e non newsletterDisiscritti),
       anche con l'"un clic"; legge prima di scrivere; si torna
       indietro con "riattiva"; le firme delle due liste non si
       scambiano.
     - Il giro: la prima volta non annuncia niente; un bando nuovo
       aspetta un'ora di quiete e l'ora del giorno; i chiusi e
       quelli spariti non partono; parte una mail sola per tutti i
       bandi nuovi, una per iscritto attivo, con i collegamenti dei
       bandi; chi ha detto "niente piu'" alla newsletter dello studio
       DOPO la conferma e' saltato, chi l'ha detto prima no; il
       resoconto a chi segue i bandi; il giro dopo non rimanda niente.
     - Con Brevo: un lotto in una richiesta, i collegamenti personali
       dei bandi nei parametri; un rifiuto non perde e non raddoppia
       niente; otto rifiuti di fila fermano il giro e lo si dice.
     - Un lotto dall'esito ignoto non si ritenta; un giro interrotto
       per il tempo riprende da dove era; un giro alla volta.
     - Il lavoro programmato vuole il segreto.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

// ---------- orologio ----------
let orologio = Date.parse('2026-11-20T10:00:00+01:00');
const DateVera = Date;
global.Date = class extends DateVera {
    constructor(...a) { if (a.length) super(...a); else super(orologio); }
    static now() { return orologio; }
};
function avanza(ms) { orologio += ms; }
function alle(iso) { orologio = Date.parse(iso); }

// ---------- Firestore finto (con le regole di set/merge e update di quello vero) ----------
const dati = new Map();
let scritture = 0;
const clona = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const eMappa = x => !!x && typeof x === 'object' && !Array.isArray(x);
// set con merge: le mappe si fondono campo per campo, come in Firestore
function fondi(vecchio, patch) {
    const out = eMappa(vecchio) ? Object.assign({}, vecchio) : {};
    for (const k of Object.keys(patch)) {
        const v = patch[k];
        out[k] = (eMappa(v) && eMappa(out[k])) ? fondi(out[k], v) : clona(v);
    }
    return out;
}
function istantanea(chiave) {
    const v = dati.get(chiave);
    const [coll, id] = chiave.split('/');
    return { exists: dati.has(chiave), id: id, data: () => clona(v), ref: doc(coll, id) };
}
function doc(coll, id) {
    const chiave = coll + '/' + id;
    return {
        id: id,
        get: async () => istantanea(chiave),
        set: async (patch, opz) => { scritture++; dati.set(chiave, (opz && opz.merge) ? fondi(dati.get(chiave), patch) : clona(patch)); },
        // update: sostituisce i campi indicati (interi), e la scheda deve esserci
        update: async (patch) => {
            if (!dati.has(chiave)) throw new Error('update su scheda inesistente: ' + chiave);
            scritture++;
            const v = Object.assign({}, dati.get(chiave));
            for (const k of Object.keys(patch)) v[k] = clona(patch[k]);
            dati.set(chiave, v);
        },
        delete: async () => { scritture++; dati.delete(chiave); }
    };
}
function interroga(coll, filtri, ordine, dopo, max, verso) {
    return {
        where: (c, op, v) => interroga(coll, filtri.concat([[c, op, v]]), ordine, dopo, max, verso),
        orderBy: (campo, dir) => interroga(coll, filtri, campo, dopo, max, dir),
        startAfter: (v) => interroga(coll, filtri, ordine, v, max, verso),
        limit: (n) => interroga(coll, filtri, ordine, dopo, n, verso),
        // la proiezione: qui si restituisce tutto, ma la catena deve reggere
        select: () => interroga(coll, filtri, ordine, dopo, max, verso),
        async get() {
            let chiavi = [...dati.keys()].filter(k => k.startsWith(coll + '/') && k.split('/').length === 2)
                .filter(k => filtri.every(([c, op, v]) => op === '==' && (dati.get(k) || {})[c] === v))
                .sort();
            if (ordine && ordine !== '__name__') {
                const val = k => (dati.get(k) || {})[ordine];
                chiavi.sort((a, b) => (val(a) < val(b) ? -1 : (val(a) > val(b) ? 1 : 0)) * (verso === 'desc' ? -1 : 1));
            }
            if (dopo != null) {
                if (ordine !== '__name__') throw new Error('startAfter senza orderBy');
                chiavi = chiavi.filter(k => k.split('/')[1] > dopo);
            }
            if (max) chiavi = chiavi.slice(0, max);
            const docs = chiavi.map(istantanea);
            return { docs: docs, empty: !docs.length, size: docs.length, forEach: f => docs.forEach(f) };
        }
    };
}
const db = {
    collection: (coll) => Object.assign(interroga(coll, [], null, null, 0), { doc: id => doc(coll, id) }),
    async runTransaction(fn) {
        const fare = [];
        const tx = {
            get: async r => r.get(),
            set: (r, p, o) => fare.push(() => r.set(p, o)),
            update: (r, p) => fare.push(() => r.update(p))
        };
        const esito = await fn(tx);
        for (const f of fare) await f();
        return esito;
    }
};
const admin = {
    initializeApp() { }, credential: { cert: () => ({}) }, apps: [], firestore: () => db,
    auth: () => ({ verifyIdToken: async t => { if (!/^token-/.test(String(t))) throw new Error('token non valido'); return { email: String(t).slice(6) }; } })
};
admin.firestore.FieldPath = { documentId: () => '__name__' };
admin.firestore.FieldValue = { serverTimestamp: () => orologio, increment: n => n, arrayUnion: (...a) => a, delete: () => null };

// ---------- posta, Brevo, Cloudflare e il sito, finti ----------
let spedite = [];          // la casella SMTP
let mailGuasta = 0;
let alSpedire = null;      // per far passare il tempo mentre si spedisce
let brevo = [];            // le richieste a Brevo
let brevoRifiuta = 0;
let sito = '';
let sitoGiu = false;
const BASE = 'https://nextgenerationbusiness.it';
global.fetch = async (url, opz) => {
    const u = String(url);
    if (u.startsWith(BASE + '/bandi/dati.js?v=')) {
        if (sitoGiu) return { ok: false, status: 503, text: async () => '' };
        return { ok: true, status: 200, text: async () => sito };
    }
    if (/turnstile\/v0\/siteverify/.test(u)) {
        const q = new URLSearchParams(opz.body);
        const g = q.get('response');
        const buono = q.get('secret') === 'segreto-turnstile' && (g === 'gettone-buono' || g === 'gettone-bando');
        return { ok: true, status: 200, json: async () => ({ success: buono, action: g === 'gettone-bando' ? 'richiesta-bando' : 'bandi-newsletter', 'error-codes': [] }) };
    }
    if (u === 'https://api.brevo.com/v3/smtp/email') {
        if (brevoRifiuta > 0) {
            brevoRifiuta--;
            return { ok: false, status: 402, text: async () => '{"code":"not_enough_credits","message":"crediti finiti"}' };
        }
        brevo.push(JSON.parse(opz.body));
        return { ok: true, status: 201, text: async () => '{"messageId":"x"}' };
    }
    throw new Error('rete non prevista: ' + u);
};
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return {
        createTransport: () => ({
            sendMail: async m => {
                if (alSpedire) alSpedire(m);
                if (mailGuasta > 0) { mailGuasta--; throw new Error('server di posta non raggiungibile'); }
                spedite.push(m); return {};
            },
            close() { }
        })
    };
    if (nome === 'imapflow') return { ImapFlow: function () { } };
    if (nome === 'google-auth-library') return { JWT: function () { }, GoogleAuth: function () { } };
    return veroRequire.apply(this, arguments);
};
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ client_email: 'servizio@esempio.iam.gserviceaccount.com', private_key: 'chiave-finta' });
process.env.SMTP_HOST = 'smtp.esempio.it';
process.env.SMTP_USER = 'utente';
process.env.SMTP_PASS = 'parola';
process.env.SMTP_FROM_EMAIL = 'noreply@esempio.it';
process.env.NEWSLETTER_FROM_EMAIL = 'revilaw@esempio.it';
process.env.CRON_SECRET = 'segreto-cron';
delete process.env.BREVO_API_KEY;
delete process.env.BANDI_DESTINATARI;

const RADICE = path.join(__dirname, '..');
const N = require(path.join(RADICE, 'lib/newsletter.js'));
const NB = require(path.join(RADICE, 'lib/newsletter-bandi.js'));
const DATI = require(path.join(RADICE, 'lib/dati-bandi.js'));
const servizio = require(path.join(RADICE, 'api/iscrizione-nuova.js'));
const disiscrizione = require(path.join(RADICE, 'api/disiscrizione.js'));
const cron = require(path.join(RADICE, 'api/newsletter-bandi.js'));
const sezione = require(path.join(RADICE, 'api/newsletter.js'));

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
async function zitto(fn) {
    const e = console.error, w = console.warn, l = console.log;
    console.error = () => { }; console.warn = () => { }; console.log = () => { };
    try { return await fn(); } finally { console.error = e; console.warn = w; console.log = l; }
}
function risposta() {
    const r = { stato: 0, corpo: null, intestazioni: {} };
    r.res = {
        setHeader() { }, status(s) { r.stato = s; return r.res; }, json(c) { r.corpo = c; return r.res; }, end() { return r.res; },
        writeHead(s, h) { r.stato = s; r.intestazioni = h || {}; return r.res; }
    };
    return r;
}
let ipProgressivo = 0;
async function chiama(corpo, ip) {
    const r = risposta();
    await zitto(() => servizio({ method: 'POST', headers: { 'x-forwarded-for': ip || ('10.7.' + (ipProgressivo++ % 250) + '.1') }, body: JSON.stringify(corpo) }, r.res));
    return { stato: r.stato, corpo: r.corpo || {} };
}
async function chiamaDis(metodo, query, corpo) {
    const r = risposta();
    await zitto(() => disiscrizione({ method: metodo, headers: { 'x-forwarded-for': '10.8.' + (ipProgressivo++ % 250) + '.1' }, query: query || {}, body: corpo == null ? undefined : (typeof corpo === 'string' ? corpo : corpo) }, r.res));
    return { stato: r.stato, corpo: r.corpo || {}, intestazioni: r.intestazioni };
}
function modulo(campi) {
    return Object.assign({ azione: 'bandi-newsletter', email: 'Lucia@Officine.it', nome: 'Lucia', cognome: 'Bianchi', azienda: 'Officine Bianchi Srl', privacy: true, captcha: '', sito: '', ms: 9000, origine: 'bandi' }, campi || {});
}
async function chiamaSezione(corpo) {
    const r = risposta();
    await zitto(() => sezione({ method: 'POST', headers: {}, body: JSON.stringify(corpo) }, r.res));
    return { stato: r.stato, corpo: r.corpo || {} };
}
const scheda = email => dati.get(NB.COLL + '/' + NB.idIscritto(email));
const parametri = url => new URL(url.replace(/&amp;/g, '&')).searchParams;
function linkDaMail(m, re) {
    const h = String((m && m.html) || '');
    const x = re.exec(h);
    return x ? x[1].replace(/&amp;/g, '&') : '';
}
const giro = (opz) => zitto(() => NB.giro(db, Object.assign({ pausaLotti: 0 }, opz || {})));
const metaBandi = () => dati.get('meta/bandiNewsletter') || {};
const giri = () => [...dati.keys()].filter(k => k.startsWith(NB.COLL_GIRI + '/')).map(k => Object.assign({ id: k.split('/')[1] }, dati.get(k)));
function attivo(email, confermata, extra) {
    dati.set(NB.COLL + '/' + NB.idIscritto(email), Object.assign({ email: email, stato: 'attiva', confermata: confermata || orologio, privacy: true }, extra || {}));
}
function bando(id, extra) {
    return Object.assign({
        id: id, titolo: 'Bando ' + id.toUpperCase(), ente: 'Regione di prova', regione: 'Lazio',
        tipologie: ['fondo-perduto'], finalita: [], beneficiari: 'PMI del Lazio', importo: 'Fino a 10.000 €',
        sintesi: 'La sintesi del bando ' + id + '.', scadenza: 'Fino a esaurimento risorse', pdf: id + '.pdf'
    }, extra || {});
}
function sitoCon(bandi) {
    // le istruzioni in testa nominano var BANDI = [...]: la lettura non si deve fermare li'
    return '/* Per aggiungere un bando: un blocco in fondo a var BANDI = [ ... ] */\n(function () {\n'
        + '    \'use strict\';\n    var TIPOLOGIE = { \'fondo-perduto\': \'Contributo a fondo perduto\', voucher: \'Voucher\' };\n'
        + '    var BANDI = ' + JSON.stringify(bandi, null, 4) + ';\n'
        + '    window.NGB_BANDI = { TIPOLOGIE: TIPOLOGIE, BANDI: BANDI };\n})();\n';
}
const STAFF = 'a.missori@emvas.tax, dott.venturasara@gmail.com';

const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

prova('Il file dei bandi del sito si legge senza eseguirlo, come lo legge il browser', async () => {
    const src = fs.readFileSync(path.join(RADICE, '..', 'bandi', 'dati.js'), 'utf8');
    const r = DATI.leggiFile(src);
    const w = {};
    vm.runInNewContext(src, { window: w });
    esigi(r.bandi.length === w.NGB_BANDI.BANDI.length && r.bandi.length > 0 && !r.avvisi.length, 'tutte le schede, senza avvisi', r.bandi.length + ' / ' + JSON.stringify(r.avvisi));
    esigi(JSON.stringify(r.grezzi) === JSON.stringify(w.NGB_BANDI.BANDI) && JSON.stringify(r.tipologie) === JSON.stringify(w.NGB_BANDI.TIPOLOGIE), 'la stessa lettura del browser, campo per campo');
    let errore = '';
    try { DATI.leggiFile('var BANDI = [ { id: "a", titolo: process.env.X } ];'); } catch (e) { errore = e.message; }
    esigi(/valore non ammesso/.test(errore) && /riga 1/.test(errore), 'un nome o un calcolo ferma la lettura, con la riga', errore);
});

prova('L\'iscrizione: scheda in attesa e mail con il pulsante di conferma', async () => {
    dati.clear(); spedite = [];
    const r = await chiama(modulo());
    esigi(r.stato === 200 && JSON.stringify(r.corpo) === '{"ok":true}', 'risposta: ok, e nient\'altro', JSON.stringify(r.corpo));
    const s = scheda('lucia@officine.it') || {};
    esigi(s.stato === 'attesa' && s.email === 'lucia@officine.it' && s.nome === 'Lucia' && s.cognome === 'Bianchi' && s.azienda === 'Officine Bianchi Srl'
        && s.privacy === true && s.consenso && s.consenso.versione === 'bandi-newsletter-1',
        'scheda in attesa: nome, cognome, azienda, con il consenso e la sua versione', JSON.stringify(s));
    esigi(s.mailConferma && s.mailConferma.ok === true, 'e con l\'esito della mail');
    const m = spedite[0] || {};
    esigi(spedite.length === 1 && m.to === 'lucia@officine.it' && /^Conferma l'iscrizione/.test(m.subject) && m.replyTo === STAFF, 'una mail a Lucia, con le risposte a chi segue i bandi', m.subject + ' / ' + m.replyTo);
    const link = linkDaMail(m, /href="([^"]*\/bandi\/newsletter\/\?d=[^"]+)"/);
    const p = link ? parametri(link) : new URLSearchParams();
    esigi(link.startsWith(BASE + '/bandi/newsletter/?d=') && N.firmaBandiConfermaValida(p.get('d'), p.get('q'), p.get('t')), 'il pulsante apre /bandi/newsletter/ con la scheda, il momento e la firma', link);
    esigi(/Buongiorno Lucia/.test(m.text) && /trenta giorni/.test(m.text), 'saluta per nome e dice quanto vale il pulsante');
    esigi(![...dati.keys()].some(k => k.startsWith('iscrizioni/')), 'e nessuna riga fra le iscrizioni agli eventi');
});

prova('I freni del modulo', async () => {
    dati.clear(); spedite = [];
    const robot = await chiama(modulo({ sito: 'https://spam.example', email: 'robot@spam.it' }));
    esigi(robot.stato === 200 && robot.corpo.ok === true && !scheda('robot@spam.it') && !spedite.length, 'campo nascosto pieno: "ok", e non succede niente');
    const veloce = await chiama(modulo({ ms: 900 }));
    esigi(veloce.stato === 400 && /premi di nuovo/.test(veloce.corpo.msg) && !spedite.length, 'troppo presto: lo si dice, e non parte niente');
    const casi = [[{ nome: ' ' }, 'nome'], [{ cognome: '' }, 'cognome'], [{ azienda: undefined }, 'azienda'],
        [{ email: 'lucia@' }, 'email'], [{ email: 'testo<vittima@altro.it>' }, 'email'], [{ privacy: false }, 'privacy'], [{ privacy: undefined }, 'privacy']];
    for (const [campi, campo] of casi) {
        const r = await chiama(modulo(campi));
        esigi(r.stato === 400 && r.corpo.campo === campo, JSON.stringify(campi) + ' -> errore sul campo ' + campo, JSON.stringify(r.corpo));
    }
    const strano = await chiama(modulo({ nome: 'Compra su www.truffa.example', email: 'vittima@altro.it' }));
    esigi(strano.corpo.ok && spedite.length === 1 && !/truffa/.test(spedite[0].html + spedite[0].text + spedite[0].subject) && /^Buongiorno,/.test(spedite[0].text), 'un "nome" che non e\' un nome non finisce nella mail');
    process.env.TURNSTILE_SECRET = 'segreto-turnstile';
    try {
        dati.clear(); spedite = [];
        const senza = await chiama(modulo());
        const altro = await chiama(modulo({ captcha: 'gettone-bando' }));
        esigi(senza.corpo.captchaKo && altro.corpo.captchaKo && !spedite.length, 'con TURNSTILE_SECRET serve il gettone, e di QUESTO modulo (non quello delle richieste)');
        const buono = await chiama(modulo({ captcha: 'gettone-buono' }));
        esigi(buono.corpo.ok && spedite.length === 1, 'con il gettone buono passa');
    } finally { delete process.env.TURNSTILE_SECRET; }
    dati.clear(); spedite = [];
    let passate = 0;
    for (let i = 0; i < 3; i++) { if ((await chiama(modulo({ email: 'tre+' + i + '@officine.it' }))).corpo.ok) passate++; }
    const quarta = await chiama(modulo({ email: 'tre@officine.it' }));
    esigi(passate === 3 && quarta.stato === 429 && spedite.length === 3, 'tre mail al giorno per indirizzo (le varianti con il + contano insieme)', JSON.stringify(quarta.corpo));
    avanza(24 * 60 * 60 * 1000);
    esigi((await chiama(modulo({ email: 'tre@officine.it' }))).corpo.ok, 'il giorno dopo si\'');
    dati.clear(); spedite = [];
    let respinte = 0;
    for (let i = 0; i < 10; i++) { if ((await chiama(modulo({ email: 'ip' + i + '@officine.it' }), '172.16.9.9')).stato === 429) respinte++; }
    esigi(respinte === 2, 'il freno per indirizzo IP dei moduli aperti: otto in dieci minuti', String(respinte));
});

prova('Chi e\' gia\' iscritto riceve "sei gia\' iscritto", e il modulo risponde allo stesso modo', async () => {
    dati.clear(); spedite = [];
    attivo('gia@officine.it', orologio - 1000, { nome: 'Marco' });
    const r = await chiama(modulo({ email: 'gia@officine.it', nome: 'Qualcuno', cognome: 'Altro', azienda: 'Altra Srl' }));
    esigi(r.stato === 200 && JSON.stringify(r.corpo) === '{"ok":true}', 'stessa risposta di un\'iscrizione nuova');
    const m = spedite[0] || {};
    esigi(/^Sei già iscritto/.test(m.subject) && /Buongiorno Marco/.test(m.text) && !/Qualcuno/.test(m.html + m.text), 'la mail dice che e\' gia\' iscritto, con il nome della scheda e non quello scritto nel modulo', m.subject);
    const link = linkDaMail(m, /href="([^"]*\/bandi\/newsletter\/\?e=[^"]+)"/);
    const p = link ? parametri(link) : new URLSearchParams();
    esigi(N.firmaBandiDisiscrizioneValida(p.get('e'), p.get('t')), 'con il collegamento per disiscriversi dai bandi', link);
    esigi(scheda('gia@officine.it').stato === 'attiva' && !scheda('gia@officine.it').richiesta && scheda('gia@officine.it').nome === 'Marco' && !scheda('gia@officine.it').azienda, 'e la scheda resta com\'era: il modulo non riscrive i dati di un iscritto');
});

prova('La conferma: firmata, una volta sola, scade, e non riporta dentro chi si e\' disiscritto dopo', async () => {
    dati.clear(); spedite = [];
    await chiama(modulo());
    const p = parametri(linkDaMail(spedite[0], /href="([^"]*\/bandi\/newsletter\/\?d=[^"]+)"/));
    const corpo = { azione: 'bandi-newsletter-conferma', d: p.get('d'), q: p.get('q'), t: p.get('t') };
    const finta = await chiama(Object.assign({}, corpo, { t: corpo.t.slice(0, -2) + 'xx' }));
    esigi(finta.stato === 403 && scheda('lucia@officine.it').stato === 'attesa', 'firma storta: 403, e niente cambia');
    avanza(60 * 1000);
    const r = await chiama(corpo);
    const s = scheda('lucia@officine.it');
    esigi(r.stato === 200 && r.corpo.ok && r.corpo.email === 'lucia@officine.it' && s.stato === 'attiva' && s.confermata === orologio, 'confermata, con la data', JSON.stringify(r.corpo));
    const quando = s.confermata;
    avanza(60 * 1000);
    const ancora = await chiama(corpo);
    esigi(ancora.corpo.ok && ancora.corpo.gia === true && scheda('lucia@officine.it').confermata === quando, 'la seconda volta: "gia\' confermata", e la data non si sposta');
    // scaduto
    dati.clear(); spedite = [];
    await chiama(modulo({ email: 'tardi@officine.it' }));
    const p2 = parametri(linkDaMail(spedite[0], /href="([^"]*\/bandi\/newsletter\/\?d=[^"]+)"/));
    avanza(NB.VALIDITA_CONFERMA_MS + 60 * 1000);
    const scad = await chiama({ azione: 'bandi-newsletter-conferma', d: p2.get('d'), q: p2.get('q'), t: p2.get('t') });
    esigi(scad.stato === 410 && scad.corpo.scaduto && scheda('tardi@officine.it').stato === 'attesa', 'dopo trenta giorni il collegamento e\' scaduto');
    // disiscritto dopo la richiesta: il vecchio pulsante non lo riporta dentro
    dati.clear(); spedite = [];
    await chiama(modulo({ email: 'ripensa@officine.it' }));
    const p3 = parametri(linkDaMail(spedite[0], /href="([^"]*\/bandi\/newsletter\/\?d=[^"]+)"/));
    const c3 = { azione: 'bandi-newsletter-conferma', d: p3.get('d'), q: p3.get('q'), t: p3.get('t') };
    await chiama(c3);
    avanza(60 * 1000);
    await chiamaDis('POST', {}, { email: 'ripensa@officine.it', token: N.firmaBandiDisiscrizione('ripensa@officine.it'), l: 'bandi' });
    const dopo = await chiama(c3);
    esigi(dopo.stato === 410 && scheda('ripensa@officine.it').stato === 'disiscritta', 'chi si e\' disiscritto dopo la richiesta non torna dentro con il vecchio pulsante');
    spedite = [];
    avanza(60 * 1000);
    await chiama(modulo({ email: 'ripensa@officine.it' }));
    const p4 = parametri(linkDaMail(spedite[0], /href="([^"]*\/bandi\/newsletter\/\?d=[^"]+)"/));
    const nuova = await chiama({ azione: 'bandi-newsletter-conferma', d: p4.get('d'), q: p4.get('q'), t: p4.get('t') });
    esigi(nuova.corpo.ok && scheda('ripensa@officine.it').stato === 'attiva', 'con un\'iscrizione nuova si', JSON.stringify(nuova.corpo));
});

prova('La disiscrizione tocca solo i bandi, anche con l\'"un clic", e si puo\' tornare indietro', async () => {
    dati.clear();
    attivo('anna@officine.it', orologio - 5000);
    const t = N.firmaBandiDisiscrizione('anna@officine.it');
    const r = await chiamaDis('POST', {}, { email: 'anna@officine.it', token: t, l: 'bandi', azione: 'disiscrivi' });
    const s = scheda('anna@officine.it');
    esigi(r.stato === 200 && r.corpo.stato === 'disiscritto' && s.stato === 'disiscritta' && s.comeDisiscritta === 'pagina', 'disiscritta dai bandi, dalla pagina', JSON.stringify(r.corpo));
    esigi(![...dati.keys()].some(k => k.startsWith('newsletterDisiscritti/')), 'e la newsletter dello studio non si tocca');
    const prima = scritture;
    await chiamaDis('POST', {}, { email: 'anna@officine.it', token: t, l: 'bandi' });
    esigi(scritture === prima, 'riaperto: si legge e non si scrive niente');
    const ri = await chiamaDis('POST', {}, { email: 'anna@officine.it', token: t, l: 'bandi', azione: 'riattiva' });
    esigi(ri.corpo.stato === 'iscritto' && scheda('anna@officine.it').stato === 'attiva' && scheda('anna@officine.it').confermata === orologio, '"ho cambiato idea": di nuovo iscritta, da adesso');
    const unclic = await chiamaDis('POST', { l: 'bandi', e: 'anna@officine.it', t: t }, { 'List-Unsubscribe': 'One-Click' });
    esigi(unclic.stato === 200 && scheda('anna@officine.it').stato === 'disiscritta' && scheda('anna@officine.it').comeDisiscritta === 'un-clic', 'l\'"un clic" del programma di posta (RFC 8058)');
    const get = await chiamaDis('GET', { l: 'bandi', e: 'anna@officine.it', t: t });
    esigi(get.stato === 302 && String(get.intestazioni.Location).startsWith(BASE + '/bandi/newsletter/?e=anna%40officine.it&t='), 'la GET non disiscrive: rimanda alla pagina dei bandi', JSON.stringify(get.intestazioni));
    const scambio1 = await chiamaDis('POST', {}, { email: 'anna@officine.it', token: N.firma('anna@officine.it'), l: 'bandi' });
    const scambio2 = await chiamaDis('POST', {}, { email: 'anna@officine.it', token: t });
    esigi(scambio1.stato === 403 && scambio2.stato === 403, 'la firma della newsletter dello studio non vale per i bandi, e viceversa');
    const studio = await chiamaDis('POST', {}, { email: 'anna@officine.it', token: N.firma('anna@officine.it') });
    esigi(studio.stato === 200 && dati.has('newsletterDisiscritti/anna@officine.it'), 'e la disiscrizione dalla newsletter dello studio funziona come prima');
});

prova('Il giro: la prima volta non annuncia niente, poi solo i bandi nuovi, dopo un\'ora di quiete', async () => {
    dati.clear(); spedite = []; brevo = [];
    alle('2026-11-20T10:00:00+01:00');
    sito = sitoCon([bando('a'), bando('b'), bando('c')]);
    let c = await giro();
    esigi(c.seminati === 3 && !spedite.length && JSON.stringify(metaBandi().annunciati) === '["a","b","c"]', 'prima volta: i tre bandi diventano gia\' annunciati, nessuna mail', JSON.stringify(c));
    c = await giro();
    esigi(c.nuovi === 0 && !giri().length, 'nessun bando nuovo: niente', JSON.stringify(c));
    // gli iscritti
    for (let i = 0; i < 25; i++) attivo('iscritto' + String(i).padStart(2, '0') + '@officine.it', orologio - 100000);
    dati.set(NB.COLL + '/' + NB.idIscritto('attesa@officine.it'), { email: 'attesa@officine.it', stato: 'attesa' });
    dati.set(NB.COLL + '/' + NB.idIscritto('via@officine.it'), { email: 'via@officine.it', stato: 'disiscritta', confermata: orologio - 900000 });
    attivo('dopo@officine.it', orologio - 100000);
    dati.set('newsletterDisiscritti/dopo@officine.it', { email: 'dopo@officine.it', quando: orologio - 50000, origine: 'pagina' });
    attivo('prima@officine.it', orologio - 100000);
    dati.set('newsletterDisiscritti/prima@officine.it', { email: 'prima@officine.it', quando: orologio - 200000, origine: 'pagina' });

    avanza(10 * 60 * 1000);
    sito = sitoCon([bando('a'), bando('b'), bando('c'), bando('d', { titolo: 'Voucher per l\'export {email}', regione: 'Nazionale', revisore: true, tipologie: ['voucher'] }),
        bando('e', { chiusura: '2026-11-19' })]);
    c = await giro();
    esigi(c.nuovi === 1 && c.attesa === 'quiete' && !giri().length && Object.keys(metaBandi().visti || {}).join() === 'd', 'un bando nuovo (il chiuso non conta): si aspetta un\'ora di quiete', JSON.stringify(c));
    avanza(40 * 60 * 1000);
    sito = sitoCon([bando('a'), bando('b'), bando('c'), bando('d', { titolo: 'Voucher per l\'export {email}', regione: 'Nazionale', revisore: true, tipologie: ['voucher'] }),
        bando('e', { chiusura: '2026-11-19' }), bando('f', { regione: 'Veneto' }), bando('g')]);
    c = await giro();
    esigi(c.nuovi === 3 && c.attesa === 'quiete', 'altri due bandi: la quiete riparte dall\'ultimo', JSON.stringify(c));
    avanza(30 * 60 * 1000);
    sito = sitoCon([bando('a'), bando('b'), bando('c'), bando('d', { titolo: 'Voucher per l\'export {email}', regione: 'Nazionale', revisore: true, tipologie: ['voucher'] }),
        bando('e', { chiusura: '2026-11-19' }), bando('f', { regione: 'Veneto' })]);
    c = await giro();
    esigi(c.nuovi === 2 && c.attesa === 'quiete' && Object.keys(metaBandi().visti).sort().join() === 'd,f', 'il bando tolto prima della spedizione esce anche dall\'attesa', JSON.stringify(c));
    avanza(31 * 60 * 1000);
    spedite = [];
    c = await giro();
    const g = giri()[0] || {};
    esigi(c.giroCreato && c.finito && g.stato === 'finito' && JSON.stringify(g.bandi.map(b => b.id)) === '["d","f"]', 'un\'ora dopo l\'ultimo: un giro con i due bandi, finito', JSON.stringify(c));
    const agg = spedite.filter(m => /nuovi bandi per le imprese/.test(m.subject));
    const a = new Set(agg.map(m => m.to));
    esigi(agg.length === 26 && a.size === 26, 'una mail per iscritto attivo: i 25, piu\' chi ha detto "niente" PRIMA della conferma', agg.length + ' mail');
    esigi(!a.has('attesa@officine.it') && !a.has('via@officine.it') && !a.has('dopo@officine.it') && a.has('prima@officine.it'), 'non chi aspetta la conferma, non chi si e\' disiscritto, non chi ha detto "niente" DOPO la conferma');
    esigi(g.conti.inviati === 26 && g.conti.saltati === 1 && g.conti.lotti === 2, 'i conti sul giro: 26 consegnate, 1 saltata, due lotti da 20', JSON.stringify(g.conti));
    const m = agg[0] || {};
    esigi(m.subject === '2 nuovi bandi per le imprese' && /Voucher per l&#39;export &#123;email&#125;/.test(m.html) && /Bando F/.test(m.html) && !/Bando E/.test(m.html), 'oggetto e contenuto: i due bandi, non il chiuso, con le graffe neutralizzate', m.subject);
    esigi(m.html.indexOf('Voucher per l') < m.html.indexOf('Bando F') && /Certificazione del revisore/.test(m.html) && /Bando nazionale/.test(m.html), 'prima il nazionale, con il bollo del revisore');
    const dis = linkDaMail(m, /href="([^"]*\/bandi\/newsletter\/\?e=[^"]+)"/);
    const pd = dis ? parametri(dis) : new URLSearchParams();
    esigi(pd.get('e') === m.to && N.firmaBandiDisiscrizioneValida(pd.get('e'), pd.get('t')) && !/newsletter\/disiscriviti\.html/.test(m.html), 'in fondo il collegamento personale per disiscriversi dai BANDI', dis);
    esigi(/\/api\/disiscrizione\?l=bandi&e=/.test(m.headers['List-Unsubscribe']) && /Disiscrizione%20aggiornamenti%20bandi/.test(m.headers['List-Unsubscribe']), 'e l\'"un clic" dei programmi di posta va ai bandi', m.headers['List-Unsubscribe']);
    esigi(m.replyTo === STAFF && m.from.address === 'revilaw@esempio.it', 'risposte a chi segue i bandi, mittente quello della newsletter');
    esigi(/\/bandi\/\?bando=d#richiesta/.test(m.html) && /\/bandi\/schede\/d\.pdf/.test(m.html) && /\/bandi\/#d"/.test(m.html), 'per ogni bando: scheda, PDF e "chiedi informazioni" con il bando gia\' scelto');
    esigi(!/\{\{|\{email\}/.test(m.text) && /Scheda: https:\/\/nextgenerationbusiness\.it\/bandi\/#f/.test(m.text), 'e la versione di solo testo, senza segnaposto rimasti');
    const res = spedite.filter(x => /^Newsletter bandi: aggiornamento inviato a 26 iscritti$/.test(x.subject));
    esigi(res.length === 1 && res[0].to === STAFF && /Bando F/.test(res[0].html), 'il resoconto a chi segue i bandi', spedite.map(x => x.subject).filter(x => /^Newsletter/.test(x)).join(' | '));
    esigi(JSON.stringify(metaBandi().annunciati) === '["a","b","c","d","f"]' && !Object.keys(metaBandi().visti || {}).length, 'i due bandi passano fra gli annunciati');
    spedite = [];
    avanza(15 * 60 * 1000);
    c = await giro();
    esigi(c.nuovi === 0 && !spedite.length && giri().length === 1, 'il giro dopo: niente da rimandare', JSON.stringify(c));
    esigi(metaBandi().ultimoGiro && metaBandi().ultimoGiro.quando === orologio && metaBandi().lucchettoFino === 0, 'il battito resta, e il lucchetto e\' mollato');
});

prova('Di sera si aspetta il mattino; il sito che non risponde non cambia niente', async () => {
    dati.clear(); spedite = [];
    alle('2026-11-20T20:30:00+01:00');
    sito = sitoCon([bando('a')]);
    await giro();
    attivo('sera@officine.it', orologio - 1000);
    sito = sitoCon([bando('a'), bando('h')]);
    let c = await giro();
    avanza(70 * 60 * 1000);
    c = await giro();
    esigi(c.attesa === 'fuori orario' && !giri().length && !spedite.length, 'alle 21:40 un bando pronto aspetta', JSON.stringify(c));
    alle('2026-11-21T07:50:00+01:00');
    c = await giro();
    esigi(c.attesa === 'fuori orario', 'alle 7:50 ancora no');
    alle('2026-11-21T08:04:00+01:00');
    c = await giro();
    esigi(c.finito && spedite.some(m => m.to === 'sera@officine.it' && /^Nuovo bando: Bando H$/.test(m.subject)), 'alle 8:04 parte (con un bando solo, l\'oggetto e\' il suo titolo)', JSON.stringify(c));
    const prima = JSON.stringify([...dati.entries()].filter(([k]) => k !== 'meta/bandiNewsletter'));
    sitoGiu = true;
    c = await giro();
    sitoGiu = false;
    esigi(/503/.test(c.erroreSito || '') && JSON.stringify([...dati.entries()].filter(([k]) => k !== 'meta/bandiNewsletter')) === prima, 'il sito non risponde: lo si scrive nel battito, e nient\'altro cambia', JSON.stringify(c));
    dati.clear();
    sito = sitoCon([]);
    c = await giro();
    esigi(c.attesa === 'elenco vuoto' && !Array.isArray(metaBandi().annunciati), 'un elenco vuoto non diventa la base di partenza', JSON.stringify(c));
    sito = sitoCon([bando('a'), { id: 'Non Valido', titolo: 'x' }, bando('a')]);
    c = await giro();
    esigi(c.seminati === 1 && c.avvisi && c.avvisi.length === 2, 'le schede storte o ripetute restano fuori, e lo si dice', JSON.stringify(c));
});

prova('Con Brevo: un lotto in una richiesta, i collegamenti dei bandi nei parametri; un rifiuto non perde e non raddoppia niente', async () => {
    dati.clear(); spedite = []; brevo = [];
    process.env.BREVO_API_KEY = 'chiave-brevo-finta';
    try {
        alle('2026-11-23T10:00:00+01:00');
        sito = sitoCon([bando('a')]);
        await giro();
        for (let i = 0; i < 230; i++) attivo('b' + String(i).padStart(3, '0') + '@officine.it', orologio - 1000);
        sito = sitoCon([bando('a'), bando('k', { regione: 'Toscana' })]);
        await giro();
        avanza(61 * 60 * 1000);
        brevoRifiuta = 1;
        let c = await giro();
        let g = giri()[0] || {};
        esigi(!c.finito && c.errore && g.stato === 'in-corso' && g.errori === 1 && g.cursore === '' && !brevo.length, 'Brevo rifiuta: il giro resta in corso, da capo, con l\'errore', JSON.stringify(c));
        esigi(!spedite.some(m => /^Newsletter bandi/.test(m.subject)), 'e nessun resoconto');
        avanza(15 * 60 * 1000);
        c = await giro();
        g = giri()[0] || {};
        esigi(c.finito && g.stato === 'finito' && brevo.length === 2 && g.conti.inviati === 230, 'al giro dopo riparte e finisce: due richieste (200 + 30)', JSON.stringify(g.conti));
        const tutti = brevo.flatMap(b => b.messageVersions.map(v => v.to[0].email));
        esigi(tutti.length === 230 && new Set(tutti).size === 230, 'ognuno una volta sola');
        const v = brevo[0].messageVersions[0];
        const p = parametri(v.params.disiscriviti);
        esigi(v.params.disiscriviti.startsWith(BASE + '/bandi/newsletter/?e=') && N.firmaBandiDisiscrizioneValida(p.get('e'), p.get('t')) && p.get('e') === v.to[0].email, 'nei parametri di ciascuno il SUO collegamento ai bandi');
        esigi(/\{\{params\.disiscriviti\}\}/.test(brevo[0].htmlContent) && brevo[0].tags[0] === 'newsletter-bandi' && brevo[0].replyTo.email === 'a.missori@emvas.tax'
            && brevo[0].sender.email === 'revilaw@esempio.it' && brevo[0].subject === 'Nuovo bando: Bando K', 'segnaposto, etichetta, risposte e mittente', JSON.stringify(brevo[0].tags));
        esigi(spedite.filter(m => /^Newsletter bandi: aggiornamento inviato a 230 iscritti$/.test(m.subject)).length === 1, 'e il resoconto, una volta');
        // otto rifiuti di fila: il giro si ferma e lo si dice
        dati.clear(); spedite = []; brevo = [];
        sito = sitoCon([bando('a')]);
        await giro();
        attivo('uno@officine.it', orologio - 1000);
        sito = sitoCon([bando('a'), bando('z')]);
        await giro();
        avanza(61 * 60 * 1000);
        brevoRifiuta = 100;
        for (let i = 0; i < NB.MAX_ERRORI; i++) { c = await giro(); avanza(15 * 60 * 1000); }
        brevoRifiuta = 0;
        g = giri()[0] || {};
        const avviso = spedite.filter(m => m.subject === 'Newsletter bandi: invio fermo');
        esigi(g.stato === 'fermo' && g.errori === NB.MAX_ERRORI && avviso.length === 1 && avviso[0].to === STAFF && avviso[0].html.indexOf(g.id) >= 0, 'otto rifiuti di fila: giro fermo, e a chi segue i bandi arriva come farlo ripartire', g.stato + ' ' + g.errori);
        c = await giro();
        esigi(!brevo.length && c.nuovi === 0, 'fermo resta fermo: non riparte da solo e non si riannuncia');
    } finally { delete process.env.BREVO_API_KEY; brevoRifiuta = 0; }
});

prova('Un lotto dall\'esito ignoto non si ritenta; un giro interrotto per il tempo riprende da dove era; un giro alla volta', async () => {
    dati.clear(); spedite = [];
    alle('2026-11-24T10:00:00+01:00');
    sito = sitoCon([bando('a')]);
    await giro();
    for (let i = 0; i < 30; i++) attivo('x' + String(i).padStart(2, '0') + '@officine.it', orologio - 1000);
    sito = sitoCon([bando('a'), bando('m')]);
    await giro();
    avanza(61 * 60 * 1000);
    // la casella SMTP lenta: ogni mail costa 15 secondi, il lotto si ferma a meta'
    alSpedire = () => { orologio += 15000; };
    let c = await giro();
    alSpedire = null;
    let g = giri()[0] || {};
    const primaTornata = spedite.filter(m => /^Nuovo bando/.test(m.subject)).length;
    esigi(!c.finito && g.stato === 'in-corso' && primaTornata > 0 && primaTornata < 30 && g.conti.inviati === primaTornata, 'il tempo finisce a meta\': in corso, con i conti di quelle partite', primaTornata + ' / ' + JSON.stringify(g.conti));
    avanza(15 * 60 * 1000);
    c = await giro();
    g = giri()[0] || {};
    const tutte = spedite.filter(m => /^Nuovo bando/.test(m.subject)).map(m => m.to);
    esigi(c.finito && tutte.length === 30 && new Set(tutte).size === 30 && g.conti.inviati === 30, 'il giro dopo riprende da li\': trenta mail, nessuna doppia', tutte.length + ' / ' + new Set(tutte).size);
    // il lotto dall'esito ignoto
    dati.clear(); spedite = [];
    sito = sitoCon([bando('a')]);
    await giro();
    for (let i = 0; i < 25; i++) attivo('y' + String(i).padStart(2, '0') + '@officine.it', orologio - 1000);
    sito = sitoCon([bando('a'), bando('n')]);
    await giro();
    avanza(61 * 60 * 1000);
    /* il giro nasce, ma la funzione "muore" al primo lotto: lo si simula con
       un giro senza tempo (crea il giro e non spedisce), poi il segno del
       lotto a meta' come lo lascerebbe una funzione interrotta */
    const id = (await zitto(() => NB.giro(db, { pausaLotti: 0, budget: -1 }))).giroCreato;
    esigi(id && !spedite.length && (giri()[0] || {}).stato === 'in-corso', 'senza tempo: il giro nasce e aspetta');
    g = giri()[0] || {};
    const ordinati = [...dati.keys()].filter(k => k.startsWith(NB.COLL + '/')).map(k => k.split('/')[1]).sort();
    await db.collection(NB.COLL_GIRI).doc(g.id).update({ lottoInCorso: { ultimo: ordinati[19], n: 20, quando: orologio } });
    avanza(15 * 60 * 1000);
    spedite = [];
    c = await giro();
    g = giri()[0] || {};
    const dopo = spedite.filter(m => /^Nuovo bando/.test(m.subject)).map(m => m.to);
    esigi(id && c.finito && g.conti.incerti === 20 && dopo.length === 5, 'il lotto rimasto a meta\' non si rispedisce: 20 incerti, partono solo gli altri 5', JSON.stringify(g.conti) + ' / ' + dopo.length);
    // il lucchetto
    await db.collection('meta').doc('bandiNewsletter').set({ lucchettoFino: orologio + 60000, lucchettoGiro: 'un-altro' }, { merge: true });
    c = await giro();
    esigi(c.occupato === true, 'un altro giro al lavoro: questo non fa niente');
});

prova('Nell\'area riservata: l\'elenco degli iscritti e i giri, e la gestione a mano', async () => {
    dati.clear(); spedite = [];
    dati.set('utenti/staff@revilaw.it', { attivo: true, ruolo: 'admin' });
    dati.set('utenti/collega@revilaw.it', { attivo: true, ruolo: 'staff' });
    attivo('zeta@officine.it', orologio - 9000, { nome: 'Anna', cognome: 'Zeta', azienda: 'Zeta Srl', creata: orologio - 10000 });
    attivo('alfa@officine.it', orologio - 9000, { nome: 'Bruno', cognome: 'Alfa', azienda: 'Alfa Spa' });
    attivo('escluso@officine.it', orologio - 9000, { nome: 'Carla', cognome: 'Esclusa', azienda: 'Esse Srl' });
    dati.set('newsletterDisiscritti/escluso@officine.it', { email: 'escluso@officine.it', quando: orologio - 100 });
    dati.set(NB.COLL + '/' + NB.idIscritto('attesa@officine.it'), { email: 'attesa@officine.it', nome: 'Dario', cognome: 'Attesa', azienda: 'Di Srl', stato: 'attesa', mailConferma: { quando: orologio, ok: false, errore: 'casella piena' } });
    dati.set(NB.COLL_GIRI + '/vecchio', { creato: orologio - 7 * 86400000, stato: 'finito', oggetto: 'Nuovo bando: X', bandi: [{ id: 'x', titolo: 'X', regione: 'Lazio' }], conti: { inviati: 3 }, html: '<p>lungo</p>' });
    dati.set(NB.COLL_GIRI + '/nuovo', { creato: orologio - 86400000, stato: 'finito', oggetto: '2 nuovi bandi per le imprese', bandi: [], conti: { inviati: 5 }, html: '<p>lungo</p>' });

    const senza = await chiamaSezione({ azione: 'bandi', idToken: 'sbagliato' });
    const altro = await chiamaSezione({ azione: 'bandi', idToken: 'token-collega@revilaw.it' });
    esigi(senza.stato === 401 && altro.stato === 403 && !senza.corpo.iscritti && !altro.corpo.iscritti, 'senza sessione 401, senza il permesso della sezione 403: niente dati');
    const r = await chiamaSezione({ azione: 'bandi', idToken: 'token-staff@revilaw.it' });
    const el = r.corpo.iscritti || [];
    esigi(r.stato === 200 && el.length === 4 && el.map(x => x.cognome).join() === 'Alfa,Attesa,Esclusa,Zeta', 'l\'elenco, in ordine di cognome', el.map(x => x.cognome).join());
    const z = el.find(x => x.email === 'zeta@officine.it') || {};
    esigi(z.nome === 'Anna' && z.azienda === 'Zeta Srl' && z.stato === 'attiva' && z.creata === orologio - 10000 && z.confermata === orologio - 9000, 'con nome, cognome, azienda, stato e date', JSON.stringify(z));
    const e = el.find(x => x.email === 'escluso@officine.it') || {};
    const a = el.find(x => x.email === 'attesa@officine.it') || {};
    esigi(e.escluso === true && z.escluso === false && a.stato === 'attesa' && a.mailConferma && a.mailConferma.ok === false && a.mailConferma.errore === 'casella piena',
        'chi e\' escluso dalla newsletter dello studio lo si vede, e cosi\' una mail di conferma non partita');
    esigi(JSON.stringify(r.corpo.conti) === '{"attivi":3,"attesa":1,"disiscritti":0,"esclusi":1}', 'i conti', JSON.stringify(r.corpo.conti));
    const gi = r.corpo.giri || [];
    esigi(gi.length === 2 && gi[0].id === 'nuovo' && gi[1].conti.inviati === 3 && !('html' in gi[0]), 'gli ultimi giri, dal piu\' recente, senza il contenuto della mail', JSON.stringify(gi.map(x => x.id)));

    const dis = await chiamaSezione({ azione: 'bandi-disiscrivi', email: 'Zeta@Officine.it', idToken: 'token-staff@revilaw.it' });
    const sz = scheda('zeta@officine.it');
    esigi(dis.corpo.ok && sz.stato === 'disiscritta' && sz.comeDisiscritta === 'a mano (staff@revilaw.it)'.slice(0, 20), 'disiscritta a mano, con chi l\'ha fatto', JSON.stringify(sz));
    esigi(!dati.has('newsletterDisiscritti/zeta@officine.it'), 'e la newsletter dello studio non si tocca');
    avanza(1000);
    const ri = await chiamaSezione({ azione: 'bandi-riattiva', email: 'zeta@officine.it', idToken: 'token-staff@revilaw.it' });
    esigi(ri.corpo.ok && scheda('zeta@officine.it').stato === 'attiva' && scheda('zeta@officine.it').confermata === orologio && /staff@revilaw\.it/.test(scheda('zeta@officine.it').riattivataDa),
        'riattivata a mano: aveva gia\' confermato una volta');
    const no = await chiamaSezione({ azione: 'bandi-riattiva', email: 'attesa@officine.it', idToken: 'token-staff@revilaw.it' });
    esigi(no.stato === 409 && scheda('attesa@officine.it').stato === 'attesa', 'chi non ha mai confermato non si attiva a mano: il consenso lo da\' la persona', JSON.stringify(no.corpo));
    const ignoto = await chiamaSezione({ azione: 'bandi-riattiva', email: 'mai@officine.it', idToken: 'token-staff@revilaw.it' });
    esigi(ignoto.stato === 404, 'un indirizzo che non c\'e\': 404');
});

prova('Il lavoro programmato vuole il segreto', async () => {
    dati.clear(); spedite = [];
    sito = sitoCon([bando('a')]);
    const senza = risposta();
    await zitto(() => cron({ method: 'GET', headers: {} }, senza.res));
    const sbagliato = risposta();
    await zitto(() => cron({ method: 'GET', headers: { authorization: 'Bearer altro' } }, sbagliato.res));
    esigi(senza.stato === 401 && sbagliato.stato === 401 && !dati.size, 'senza il segreto: 401, e non si legge niente');
    const giusto = risposta();
    await zitto(() => cron({ method: 'GET', headers: { authorization: 'Bearer segreto-cron' } }, giusto.res));
    esigi(giusto.stato === 200 && giusto.corpo.ok && giusto.corpo.seminati === 1, 'con il segreto: il giro', JSON.stringify(giusto.corpo));
});

(async () => {
    for (const p of prove) { console.log('\n' + p.titolo); await p.fn(); }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
