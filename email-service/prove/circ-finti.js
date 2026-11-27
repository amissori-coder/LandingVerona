/* ============================================================
   I FINTI delle circolarizzazioni: Firestore, server di posta e
   casella PEC, quanto basta al codice vero di lib/circ-*.js.
   ------------------------------------------------------------
   Li usano le prove (prove/circolarizzazioni.prove.js) e il banco
   di prova per l'area riservata (prove/circolarizzazioni.banco.js).
   Chi li carica deve farlo PRIMA di caricare api/ e lib/: i
   require di firebase-admin, nodemailer e imapflow vengono
   deviati qui.
   ============================================================ */
'use strict';
const Module = require('module');
const { Readable } = require('stream');

// ---------- orologio (finto solo se lo si chiede) ----------
const DateVera = Date;
let orologio = 0;
function orologioFinto(iso) {
    orologio = DateVera.parse(iso);
    global.Date = class extends DateVera {
        constructor(...a) { if (a.length) super(...a); else super(orologio); }
        static now() { return orologio; }
    };
}
const avanti = ms => { orologio += ms; };
const alle = iso => { orologio = DateVera.parse(iso); };
const adesso = () => (orologio || DateVera.now());

// ---------- Firestore finto ----------
const dati = new Map();
function clona(v) {
    if (Buffer.isBuffer(v)) return Buffer.from(v);
    if (Array.isArray(v)) return v.map(clona);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { if (v[k] !== undefined) o[k] = clona(v[k]); }); return o; }
    return v;
}
function fondi(base, patch) {       // come Firestore con merge: le mappe si fondono, il resto si sostituisce
    const out = base && typeof base === 'object' && !Array.isArray(base) && !Buffer.isBuffer(base) ? Object.assign({}, base) : {};
    Object.keys(patch).forEach(k => {
        const v = patch[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && !Buffer.isBuffer(v)) out[k] = fondi(out[k], v);
        else out[k] = clona(v);
    });
    return out;
}
let contatoreId = 0;
// quante letture fa il codice: ogni get() di un documento o di una raccolta e' un viaggio fino a Firestore
const letture = { documenti: 0, raccolte: 0, azzera() { this.documenti = 0; this.raccolte = 0; } };
function docRef(percorso) {
    const self = {
        id: percorso.split('/').pop(), percorso: percorso,
        get: async () => { letture.documenti++; return { exists: dati.has(percorso), id: self.id, data: () => clona(dati.get(percorso)), ref: self }; },
        set: async (patch, opz) => { dati.set(percorso, opz && opz.merge ? fondi(dati.get(percorso), patch) : clona(patch)); },
        delete: async () => { dati.delete(percorso); },
        collection: nome => collRef(percorso + '/' + nome)
    };
    return self;
}
function collRef(percorso, filtri, ordine, tetto) {
    filtri = filtri || [];
    const figli = () => [...dati.keys()].filter(k => k.startsWith(percorso + '/') && k.slice(percorso.length + 1).indexOf('/') < 0);
    return {
        doc: id => docRef(percorso + '/' + (id || ('auto' + (++contatoreId)))),
        where: (campo, op, valore) => collRef(percorso, filtri.concat([[campo, op, valore]]), ordine, tetto),
        orderBy: (campo, verso) => collRef(percorso, filtri, [campo, verso === 'desc' ? -1 : 1], tetto),
        limit: n => collRef(percorso, filtri, ordine, n),
        get: async () => {
            letture.raccolte++;
            let ds = figli().map(k => ({ k: k, v: dati.get(k) })).filter(x => filtri.every(([c, op, val]) => {
                const a = x.v[c];
                if (op === '==') return a === val;
                if (op === '<=') return typeof a === 'number' && a <= val;
                throw new Error('operatore non previsto: ' + op);
            }));
            if (ordine) ds.sort((a, b) => (a.v[ordine[0]] - b.v[ordine[0]]) * ordine[1]);
            if (tetto) ds = ds.slice(0, tetto);
            const docs = ds.map(x => ({ id: x.k.split('/').pop(), data: () => clona(x.v), ref: docRef(x.k) }));
            return { docs: docs, size: docs.length, forEach: f => docs.forEach(f) };
        }
    };
}
let codaTx = Promise.resolve();
const db = {
    collection: nome => collRef(nome),
    // una transazione per volta, come garantisce Firestore: le scritture alla fine
    runTransaction: fn => {
        const esegui = async () => {
            const scritture = [];
            const esito = await fn({ get: r => r.get(), set: (r, p, o) => { scritture.push([r, p, o]); }, delete: r => { scritture.push([r, null, 'via']); } });
            for (const [r, p, o] of scritture) { if (o === 'via') await r.delete(); else await r.set(p, o); }
            return esito;
        };
        const p = codaTx.then(esegui, esegui);
        codaTx = p.catch(() => { });
        return p;
    }
};
const adminFinto = {
    apps: [{}], initializeApp: () => { }, credential: { cert: () => ({}) },
    // il gettone finto e' l'indirizzo (il banco di prova lo manda come 'demo:<indirizzo>')
    auth: () => ({ verifyIdToken: async t => { if (!t || t === 'scaduto') throw new Error('no'); return { email: String(t).replace(/^demo:/, '') }; } }),
    firestore: () => db
};

// ---------- server di posta finto ----------
const posta = [];
const stato = { rifiuta: null, prossimoUid: 1 };       // rifiuta: funzione (msg) -> Error | null
const avvisi = [];         // le email ordinarie degli errori (alla casella dello studio): partono dal server SMTP_HOST, non dalla PEC
const notizie = [];        // le email ordinarie a chi ha preparato le lettere (ricevute, risposte arrivate, PEC non partite)
const associare = [];      // le email ordinarie "c'e' una PEC da associare" (alla casella dello studio)
const inoltri = [];        // le email ordinarie che inoltrano le risposte a chi ha la revisione legale
const trasporti = [];       // le opzioni con cui il codice ha aperto ogni collegamento di posta
const nodemailerFinto = {
    createTransport: o => (trasporti.push(o), {
        sendMail: async msg => {
            if (o && o.host === process.env.SMTP_HOST) {
                if (stato.rifiutaAvvisi) throw new Error('posta ordinaria giu\'');
                // rifiutaPosta: funzione (msg) -> Error | null, per respingere solo certe email ordinarie
                const no = stato.rifiutaPosta ? stato.rifiutaPosta(msg) : null; if (no) throw no;
                const quale = msg.headers && msg.headers['X-Circolarizzazioni'];
                (quale === 'avviso-utente' ? notizie : quale === 'da-associare' ? associare : quale === 'inoltro' ? inoltri : avvisi).push(msg);
                return { response: '250 ok' };
            }
            // da quale casella PEC parte (le caselle in piu' degli incarichi "per conto di")
            msg._casella = o && o.auth ? o.auth.user : '';
            const e = stato.rifiuta ? stato.rifiuta(msg) : null; if (e) throw e; posta.push(msg); return { response: '250 ok' };
        },
        close: () => { }
    })
};

// ---------- casella PEC finta ----------
const casella = [];        // { uid, internalDate, size, headers, bodyStructure, parti: {chiave: Buffer}, sorgente }
/* Le caselle in piu' (incarichi "per conto di"), per indirizzo: ognuna e' un
   elenco come `casella`. Chi si collega con un indirizzo che non e' qui legge
   la casella dello studio. Le caselle danno numeri propri ai messaggi
   (`numeri`), e tutte hanno lo stesso uidValidity, come puo' succedere
   davvero con lo stesso gestore. */
const altreCaselle = {};
const numeri = {};
const aperture = [];       // chi ha aperto quale casella (per vedere che si legge quella giusta)
class ImapFinto {
    constructor(opz) { this.usable = true; this.utente = (opz && opz.auth && opz.auth.user) || ''; this.box = altreCaselle[this.utente] || casella; }
    on() { }
    async connect() { if (stato.rompiImap) throw stato.rompiImap(this.utente); }
    async logout() { }
    close() { }
    async mailboxOpen() { aperture.push(this.utente); return { uidValidity: 777, uidNext: this.box === casella ? stato.prossimoUid : (numeri[this.utente] || 1) }; }
    async *fetch(intervallo) {
        const [da, a] = String(intervallo.uid).split(':').map(Number);
        for (const m of this.box) if (m.uid >= da && m.uid <= a) yield m;
    }
    async fetchOne(uid, cosa) {
        const m = this.box.find(x => x.uid === Number(uid));
        if (!m) return null;
        if (cosa.source) return { size: m.sorgente.length, source: m.sorgente.slice(cosa.source.start, cosa.source.start + cosa.source.maxLength) };
        const parti = new Map();
        (cosa.bodyParts || []).forEach(p => { const b = m.parti[p.key]; if (b) parti.set(String(p.key).toLowerCase(), b.slice(p.start || 0, (p.start || 0) + p.maxLength)); });
        return { bodyParts: parti };
    }
    async download(uid, parte) {
        const m = this.box.find(x => x.uid === Number(uid));
        return { content: Readable.from([m.parti[parte]]) };
    }
}
/* `dove`: l'indirizzo della casella in cui mettere il messaggio (vuoto: quella dello studio). */
function metti(intestazioni, struttura, parti, dove) {
    const grezze = Object.keys(intestazioni).map(k => k + ': ' + intestazioni[k]).join('\r\n') + '\r\n\r\n';
    const sorgente = Buffer.from(grezze + 'corpo del messaggio');
    const box = dove ? (altreCaselle[dove] = altreCaselle[dove] || []) : casella;
    const uid = dove ? (numeri[dove] = (numeri[dove] || 1) + 1) - 1 : stato.prossimoUid++;
    const m = { uid: uid, internalDate: new DateVera(adesso()), size: sorgente.length, headers: Buffer.from(grezze), bodyStructure: struttura, parti: parti || {}, sorgente: sorgente };
    box.push(m);
    return m;
}
function ricevuta(tipo, msgid, extra) {
    extra = extra || {};
    const xml = '<?xml version="1.0" encoding="UTF-8"?><postacert tipo="' + tipo + '" errore="' + (extra.errore || 'nessuno') + '"><intestazione><mittente>circolarizzazionirevilaw@pec.it</mittente>'
        + '<destinatari tipo="certificato">' + (extra.consegna || 'x@pec.it') + '</destinatari><oggetto>x</oggetto></intestazione><dati><gestore-emittente>ARUBA PEC S.p.A.</gestore-emittente>'
        + '<data zona="+0100"><giorno>' + new DateVera(adesso()).toISOString().slice(8, 10) + '/' + new DateVera(adesso()).toISOString().slice(5, 7) + '/' + new DateVera(adesso()).toISOString().slice(0, 4) + '</giorno><ora>10:00:05</ora></data>'
        + '<identificativo>' + (extra.identificativo || 'opec-' + msgid) + '</identificativo><msgid>&lt;' + msgid + '&gt;</msgid>'
        + (extra.consegna ? '<consegna>' + extra.consegna + '</consegna>' : '') + (extra.erroreEsteso ? '<errore-esteso>' + extra.erroreEsteso + '</errore-esteso>' : '') + '</dati></postacert>';
    return metti({ 'X-Ricevuta': tipo, 'X-Riferimento-Message-ID': '<' + msgid + '>', From: 'posta-certificata@pec.aruba.it', Subject: (tipo === 'accettazione' ? 'ACCETTAZIONE: ' : tipo === 'avvenuta-consegna' ? 'CONSEGNA: ' : 'AVVISO DI MANCATA CONSEGNA: ') + 'x' },
        { type: 'multipart/mixed', childNodes: [{ type: 'text/plain', part: '1' }, { type: 'application/xml', part: '2', size: xml.length, dispositionParameters: { filename: 'daticert.xml' } }] },
        { '2': Buffer.from(xml) }, extra.casella);
}
function risposta(o) {
    const dentro = ['From: ' + o.da, 'Subject: ' + (o.oggettoDentro || o.oggetto)].concat(o.inRisposta ? ['In-Reply-To: <' + o.inRisposta + '>'] : []).concat(o.automatica ? ['Auto-Submitted: auto-replied'] : []).join('\r\n') + '\r\n\r\n';
    const pdf = Buffer.from('%PDF-1.4 risposta ' + 'x'.repeat(o.pdfByte || 300));
    const pdfB64 = Buffer.from(pdf.toString('base64').replace(/(.{76})/g, '$1\r\n'));
    const intest = { 'X-Trasporto': o.ordinaria ? 'errore' : 'posta-certificata', From: '"Per conto di: ' + o.da + '" <posta-certificata@pec.aruba.it>', 'Reply-To': o.da, Subject: (o.ordinaria ? 'ANOMALIA MESSAGGIO: ' : 'POSTA CERTIFICATA: ') + o.oggetto };
    const m = metti(intest, {
        type: 'multipart/mixed', childNodes: [
            { type: 'text/plain', part: '1' },
            { type: 'message/rfc822', part: '2', dispositionParameters: { filename: 'postacert.eml' }, childNodes: [{ type: 'multipart/mixed', childNodes: [
                { type: 'text/plain', part: '2.1', encoding: '7bit', parameters: { charset: 'utf-8' }, size: 40 },
                { type: 'application/pdf', part: '2.2', encoding: 'base64', size: pdfB64.length, disposition: 'attachment', dispositionParameters: { filename: 'Risposta firmata.pdf' } }] }] }
        ]
    }, { '2.HEADER': Buffer.from(dentro), '2.1': Buffer.from(o.testo || 'Confermiamo il saldo indicato.'), '2.2': pdfB64 }, o.casella);
    m.pdf = pdf;
    return m;
}

// ---------- intercetta i require ----------
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return adminFinto;
    if (nome === 'nodemailer') return nodemailerFinto;
    if (nome === 'imapflow') return { ImapFlow: ImapFinto };
    return veroRequire.apply(this, arguments);
};
Object.assign(process.env, { CIRC_IP_SERVIZI: process.env.CIRC_IP_SERVIZI || '', CIRC_PEC_USER: 'circolarizzazionirevilaw@pec.it', CIRC_PEC_PASS: 'segreta', CIRC_PAUSA_MS: '0', CRON_SECRET: 'cron', FIREBASE_SERVICE_ACCOUNT: '{}',
    SMTP_HOST: 'posta-ordinaria.finta', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_FROM_EMAIL: 'noreply@nextgenerationbusiness.it', APP_BASE_URL: 'https://nextgenerationbusiness.it' });

module.exports = { dati, db, posta, trasporti, avvisi, notizie, associare, inoltri, casella, altreCaselle, aperture, stato, letture, ricevuta, risposta, metti, orologioFinto, avanti, alle, adesso, DateVera };

