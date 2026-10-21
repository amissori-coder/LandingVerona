/* ============================================================
   PROVE - lib/domande-sito.js (il modulo /contatti/ del sito)
   ------------------------------------------------------------
       node prove/domande-sito.prove.js

   Niente da installare: Firestore, la posta, Brevo e Cloudflare sono
   finti e stanno qui dentro. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Una domanda dal sito deve arrivare a chi risponde,
   e il modulo non deve diventare un modo per spedire mail per conto
   nostro:
     - la domanda si salva (`domandeSito`) e arriva a info@ (o agli
       indirizzi di DOMANDE_DESTINATARI), con "Rispondi" verso chi ha
       scritto; a chi ha scritto parte una ricevuta che NON ripete il
       messaggio;
     - il campo nascosto pieno, o un modulo spedito in meno di tre
       secondi: "ok", e non si salva ne' si spedisce niente;
     - i campi obbligatori, il consenso, la lunghezza del messaggio;
     - con TURNSTILE_SECRET serve il gettone, e di QUESTO modulo;
     - con la posta giu' la domanda e' salva e la risposta e' "ok";
     - "non ho ricevuto la mail di conferma": cosa risulta delle
       iscrizioni sta SOLO nella mail a noi, la mail di conferma riparte
       all'iscrizione in attesa (con il suo freno), e la risposta e la
       ricevuta sono le stesse per un indirizzo iscritto e per uno no;
     - nessuna riga fra le iscrizioni, nemmeno con una `pagina`;
     - cinque domande al giorno per indirizzo, e il freno per IP.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- orologio ----------
let orologio = Date.parse('2027-01-20T11:00:00+01:00');
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
    for (const k of Object.keys(patch)) {
        const v = patch[k];
        if (v && v.__del) delete base[k];
        else if (v && v.__inc) base[k] = (base[k] || 0) + v.__inc;
        else base[k] = v;
    }
    return base;
}
function istantanea(chiave, ref) {
    const v = dati.get(chiave);
    return { exists: dati.has(chiave), id: chiave.split('/').pop(), data: () => (v ? JSON.parse(JSON.stringify(v)) : undefined), ref: ref };
}
function doc(coll, id) {
    const chiave = coll + '/' + id;
    const self = {
        id: id, _chiave: chiave,
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
            const docs = [...dati.keys()].filter(k => k.startsWith(coll + '/') && k.split('/').length === 2)
                .filter(k => filtri.every(([c, v]) => (dati.get(k) || {})[c] === v))
                .slice(0, max || 1e9)
                .map(k => istantanea(k, doc(coll, k.split('/')[1])));
            return { docs: docs, forEach: f => docs.forEach(f), size: docs.length };
        }
    };
}
const db = {
    collection(coll) { return Object.assign(interroga(coll, [], 0), { doc: id => doc(coll, id) }); },
    batch() {
        const op = [];
        return { set: (r, patch, opz) => op.push(() => r.set(patch, opz)), commit: async () => { for (const f of op) await f(); } };
    },
    async runTransaction(fn) {
        const scritture = [];
        const esito = await fn({ get: async r => r.get(), set: (r, patch, opz) => { scritture.push([r, patch, opz]); } });
        for (const [r, patch, opz] of scritture) await r.set(patch, opz);
        return esito;
    }
};
const admin = { initializeApp() { }, credential: { cert: () => ({}) }, apps: [], firestore: () => db };
admin.firestore.FieldValue = {
    serverTimestamp: () => orologio, increment: n => ({ __inc: n }),
    arrayUnion: (...a) => a, delete: () => ({ __del: true })
};

// ---------- posta, SMS e Cloudflare finti ----------
let spedite = [];
let mailGuasta = 0;
let sms = [];
let turnstileGiu = false;
global.fetch = async (url, opz) => {
    if (/turnstile\/v0\/siteverify/.test(String(url))) {
        if (turnstileGiu) throw new Error('rete giu');
        const q = new URLSearchParams(opz.body);
        const g = q.get('response');
        const buono = q.get('secret') === 'segreto-turnstile' && (g === 'gettone-buono' || g === 'gettone-sms');
        // Cloudflare rimanda l'azione del widget che ha preparato il gettone
        return { ok: true, status: 200, json: async () => ({ success: buono, action: g === 'gettone-sms' ? 'sms-iscrizione' : 'domanda-sito', 'error-codes': buono ? [] : ['invalid-input-response'] }) };
    }
    if (/transactionalSMS/.test(String(url))) {
        sms.push(JSON.parse(opz.body));
        return { ok: true, status: 201, text: async () => '{"messageId":1}' };
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
process.env.BREVO_API_KEY = 'chiave-brevo-finta';

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
        await servizio({ method: 'POST', headers: { 'x-forwarded-for': ip || ('10.9.' + (ipProgressivo++ % 250) + '.1') }, body: JSON.stringify(corpo) }, res);
    } finally { console.error = errVero; console.warn = avvVero; }
    return { stato: stato, corpo: risposta || {} };
}
function domanda(campi) {
    return Object.assign({
        azione: 'domanda-sito', nome: 'Lucia', cognome: 'Bianchi', email: 'Lucia@Studio.it', telefono: '333 1234567',
        azienda: 'Studio Bianchi', tema: 'modello-231', evento: '', motivo: '',
        messaggio: 'Vorrei sapere come si aggiorna il Modello 231.\nGrazie <b>mille</b>', privacy: true, marketing: false,
        captcha: '', sito: '', ms: 15000
    }, campi || {});
}
const conta = coll => [...dati.keys()].filter(k => k.startsWith(coll + '/')).length;
const domande = () => [...dati.keys()].filter(k => k.startsWith('domandeSito/')).map(k => dati.get(k));
function azzera() { dati.clear(); spedite = []; sms = []; mailGuasta = 0; }
const MILANO = 'Milano 26 Febbraio 2027 - Iscrizione';

const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

prova('La domanda arriva a info@, con "Rispondi" verso chi scrive, e la ricevuta non ripete il messaggio', async () => {
    azzera();
    const r = await chiama(domanda());
    esigi(r.stato === 200 && JSON.stringify(r.corpo) === '{"ok":true}', 'risposta: ok, e nient\'altro', JSON.stringify(r.corpo));
    const d = domande();
    esigi(d.length === 1 && d[0].email === 'lucia@studio.it' && d[0].tema === 'modello-231' && d[0].privacy === true && d[0].marketing === false
        && /\nGrazie/.test(d[0].messaggio), 'salvata in domandeSito, con gli a capo del messaggio', JSON.stringify(d[0]));
    esigi(d[0].avvisati === 1 && d[0].confermato === true, 'con l\'esito delle due mail');
    const interna = spedite.find(m => m.to === 'info@nextgenerationbusiness.it') || {};
    esigi(spedite.length === 2 && interna.replyTo === 'lucia@studio.it', 'a info@nextgenerationbusiness.it, e "Rispondi" scrive a Lucia');
    esigi(interna.subject === 'Domanda dal sito - Modello 231 - Lucia Bianchi', 'oggetto: argomento e nome', interna.subject);
    esigi(/Vorrei sapere come si aggiorna/.test(interna.html) && /Grazie &lt;b&gt;mille&lt;\/b&gt;/.test(interna.html) && /<br>Grazie/.test(interna.html)
        && /^<!doctype html>/.test(interna.html), 'il messaggio c\'e\', con l\'HTML neutralizzato e gli a capo, nella pagina delle mail');
    esigi(/Studio Bianchi/.test(interna.html) && /333 1234567/.test(interna.html) && /Vorrei sapere/.test(interna.text), 'con azienda e telefono, anche nella versione testo');
    const ric = spedite.find(m => m.to === 'lucia@studio.it') || {};
    esigi(/^Abbiamo ricevuto la tua domanda/.test(ric.subject) && ric.replyTo === 'info@nextgenerationbusiness.it', 'la ricevuta a Lucia, con "Rispondi" verso info@');
    esigi(!/Vorrei sapere|mille|Studio Bianchi|333 1234567/.test(ric.html + ric.text), 'la ricevuta NON ripete il messaggio ne\' gli altri dati scritti');
    esigi(/Buongiorno Lucia/.test(ric.text) && /Modello 231/.test(ric.text) && /Spam/.test(ric.text), 'saluta per nome, dice l\'argomento e di guardare nello spam');
    esigi(conta('iscrizioni') === 0, 'e nessuna riga fra le iscrizioni');
});

prova('Il nome nella ricevuta solo se e\' un nome; argomenti, eventi e motivi solo dall\'elenco', async () => {
    azzera();
    await chiama(domanda({ nome: 'Compra ora su www.truffa.example', email: 'vittima@altro.it' }));
    const ric = spedite.find(m => m.to === 'vittima@altro.it') || {};
    esigi(/^Buongiorno,/.test(ric.text) && !/truffa/.test(ric.html + ric.text + ric.subject), 'un "nome" che non e\' un nome non finisce nella ricevuta');
    spedite = [];
    await chiama(domanda({ tema: 'eventi', evento: 'napoli-2026', motivo: 'diretta', email: 'ev@studio.it' }));
    let interna = spedite.find(m => /^Domanda dal sito/.test(m.subject)) || {};
    esigi(interna.subject === 'Domanda dal sito - Eventi e convegni · Napoli, 1-2 ottobre 2026 · Diretta online - Lucia Bianchi', 'eventi: evento e motivo nell\'oggetto', interna.subject);
    spedite = [];
    await chiama(domanda({ tema: 'inventato', evento: 'milano-2027', motivo: 'info', email: 'altro@studio.it' }));
    interna = spedite.find(m => /^Domanda dal sito/.test(m.subject)) || {};
    const d = domande().find(x => x.email === 'altro@studio.it') || {};
    esigi(interna.subject === 'Domanda dal sito - Altro - Lucia Bianchi' && d.tema === 'altro' && d.evento === '' && d.motivo === '',
        'un argomento sconosciuto vale "altro", e fuori dagli eventi evento e motivo non contano', interna.subject);
    spedite = [];
    await chiama(domanda({ tema: 'eventi', evento: 'parigi', motivo: 'boh', email: 'sconosciuti@studio.it' }));
    const e = domande().find(x => x.email === 'sconosciuti@studio.it') || {};
    esigi(e.evento === 'altro' && e.motivo === 'altro', 'evento e motivo sconosciuti valgono "altro"');
    process.env.DOMANDE_DESTINATARI = 'Segreteria@Revilaw.it; eventi@revilaw.it, non-valido';
    spedite = [];
    await chiama(domanda({ email: 'dest@studio.it' }));
    delete process.env.DOMANDE_DESTINATARI;
    esigi(spedite.some(m => m.to === 'segreteria@revilaw.it, eventi@revilaw.it' && m.replyTo === 'dest@studio.it'), 'DOMANDE_DESTINATARI: piu\' indirizzi, quelli validi');
    const ricDest = spedite.find(m => m.to === 'dest@studio.it') || {};
    esigi(ricDest.replyTo === 'segreteria@revilaw.it', 'e la ricevuta risponde al primo');
});

prova('Il campo nascosto pieno, o un modulo troppo veloce: "ok", e niente', async () => {
    azzera();
    const robot = await chiama(domanda({ sito: 'https://spam.example' }));
    const veloce = await chiama(domanda({ ms: 1200 }));
    const senzaTempo = await chiama(domanda({ ms: undefined }));
    esigi([robot, veloce, senzaTempo].every(r => r.stato === 200 && JSON.stringify(r.corpo) === '{"ok":true}'), 'la risposta e\' la stessa di una domanda vera');
    esigi(domande().length === 0 && spedite.length === 0, 'e non si salva ne\' si spedisce niente');
});

prova('I campi: nome, cognome, email, argomento, messaggio e consenso', async () => {
    azzera();
    const casi = [
        [{ nome: '' }, 'nome'], [{ cognome: ' ' }, 'cognome'], [{ email: 'non-una-mail' }, 'email'], [{ tema: '' }, 'tema'],
        [{ messaggio: '   ' }, 'messaggio'], [{ messaggio: 'x'.repeat(2001) }, 'messaggio'], [{ privacy: false }, 'privacy'], [{ privacy: undefined }, 'privacy']
    ];
    let giusti = 0;
    for (const [campi, campo] of casi) {
        const r = await chiama(domanda(campi));
        if (r.stato === 400 && r.corpo.ok === false && r.corpo.campo === campo && r.corpo.msg) giusti++;
        else console.log('    caso', JSON.stringify(campi).slice(0, 60), JSON.stringify(r.corpo));
    }
    esigi(giusti === casi.length, 'ogni campo mancante o sbagliato e\' respinto, e il modulo sa quale', giusti + '/' + casi.length);
    const lungo = await chiama(domanda({ messaggio: 'x'.repeat(2001) }));
    esigi(/2000 caratteri/.test(lungo.corpo.msg), 'il messaggio troppo lungo dice il limite');
    esigi(domande().length === 0 && spedite.length === 0, 'e non si salva niente');
    const due = await chiama(domanda({ messaggio: 'x'.repeat(2000) }));
    esigi(due.corpo.ok, 'duemila caratteri passano');
});

prova('Con TURNSTILE_SECRET serve il gettone, e di questo modulo', async () => {
    azzera();
    process.env.TURNSTILE_SECRET = 'segreto-turnstile';
    try {
        const senza = await chiama(domanda());
        esigi(senza.stato === 400 && senza.corpo.captchaKo === true, 'senza gettone: respinta, con captchaKo', JSON.stringify(senza.corpo));
        const falso = await chiama(domanda({ captcha: 'inventato' }));
        esigi(falso.corpo.captchaKo === true, 'con un gettone falso neanche');
        const sms = await chiama(domanda({ captcha: 'gettone-sms' }));
        esigi(sms.corpo.captchaKo === true, 'un gettone buono ma del modulo dell\'SMS non vale qui');
        turnstileGiu = true;
        const giu = await chiama(domanda({ captcha: 'gettone-buono' }));
        turnstileGiu = false;
        esigi(giu.corpo.captchaKo === true && /riprova/.test(giu.corpo.msg), 'Cloudflare irraggiungibile: respinta, e si dice di riprovare');
        esigi(domande().length === 0 && spedite.length === 0, 'fin qui nessuna domanda salvata, nessuna mail');
        const buono = await chiama(domanda({ captcha: 'gettone-buono' }));
        esigi(buono.corpo.ok === true && domande().length === 1, 'con il gettone buono passa');
        const campoVuoto = await chiama(domanda({ captcha: 'gettone-buono', nome: '' }));
        esigi(campoVuoto.corpo.campo === 'nome' && !campoVuoto.corpo.captchaKo, 'i campi si controllano prima del gettone (che vale una volta sola)');
    } finally { delete process.env.TURNSTILE_SECRET; }
});

prova('Con la posta giu\' la domanda e\' salva, e la risposta e\' ok', async () => {
    azzera();
    mailGuasta = 2;
    const r = await chiama(domanda({ email: 'posta@studio.it' }));
    const d = domande()[0] || {};
    esigi(r.stato === 200 && r.corpo.ok === true, 'risposta ok');
    esigi(d.email === 'posta@studio.it' && d.avvisati === 0 && d.confermato === false, 'salvata, con le due mail non partite', JSON.stringify(d));
});

prova('"Non ho ricevuto la mail di conferma": la diagnosi solo a noi, la mail riparte, la risposta e\' uguale per tutti', async () => {
    azzera();
    const due = 2 * 24 * 60 * 60 * 1000;
    dati.set('iscrizioni/ombretta', {
        pagina: MILANO, data: '18/01/2027 09:30:00', nome: 'Ombretta', cognome: 'Verdi', email: 'ombretta@studio.it',
        telefonoNumero: '+393331234567', telefonoVerificato: { quando: 1, come: 'sms' }, ricevuto: orologio - due,
        mailConferma: { quando: orologio - due, ok: true, errore: '' }, smsConferma: { quando: orologio - due, ok: true, tipo: 'inviata' }
    });
    dati.set('iscrizioni/ombretta-napoli', { pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', data: '01/09/2026 10:00:00', email: 'ombretta@studio.it', nome: 'Ombretta' });
    const quante = conta('iscrizioni');
    const base = { tema: 'eventi', evento: 'milano-2027', motivo: 'mail-non-ricevuta', messaggio: '' };
    const r = await chiama(domanda(Object.assign({}, base, { nome: 'Ombretta', cognome: 'Verdi', email: 'Ombretta@Studio.it' })));
    esigi(r.stato === 200 && JSON.stringify(r.corpo) === '{"ok":true}', 'risposta: ok e nient\'altro (anche senza testo: basta il motivo)', JSON.stringify(r.corpo));
    const conferma = spedite.find(m => /^Richiesta di conferma/.test(m.subject)) || {};
    esigi(conferma.to === 'ombretta@studio.it', 'la mail di conferma riparte, all\'iscrizione in attesa');
    const s = dati.get('iscrizioni/ombretta');
    esigi(s.mailConferma.via === 'rimanda' && s.mailConferma.ok === true && s.confermaInAttesa === true && s.rimandaConferma && s.rimandaConferma.invii.length === 1,
        'sulla scheda: rimandata, e di nuovo nel giro automatico', JSON.stringify(s.mailConferma));
    const interna = spedite.find(m => /^Domanda dal sito/.test(m.subject)) || {};
    esigi(interna.subject === 'Domanda dal sito - Eventi e convegni · Milano, 26 febbraio 2027 · Mail di conferma non ricevuta - Ombretta Verdi', 'l\'oggetto dice di cosa si tratta', interna.subject);
    esigi(/Solo per noi/.test(interna.html) && /iscrizioni trovate: 2/.test(interna.html) && /Milano 26 Febbraio 2027/.test(interna.html) && /Napoli 2 Ottobre 2026/.test(interna.html),
        'nella mail a noi: le due iscrizioni con quell\'indirizzo');
    esigi(/Email confermata/.test(interna.text) && /NO/.test(interna.text) && /Mail di conferma: inviata il 18\/01\/2027/.test(interna.text)
        && /SMS "conferma la tua email": inviato il/.test(interna.text) && /RIMANDATA ADESSO in automatico a ombretta@studio\.it/.test(interna.text),
        'con lo stato della conferma, della mail e dell\'SMS, e il rinvio appena fatto', interna.text);
    const ric = spedite.find(m => /^Abbiamo ricevuto/.test(m.subject)) || {};
    esigi(/Se risulta un'iscrizione in attesa di conferma con questo indirizzo, ti abbiamo rimandato la mail/.test(ric.text) && /Spam/.test(ric.text),
        'la ricevuta lo dice al condizionale, e dice di guardare nello spam');
    esigi(!/Milano 26|RIMANDATA|Solo per noi|iscrizioni trovate|18\/01\/2027/.test(ric.html + ric.text), 'e non dice niente di cosa risulta');
    esigi(conta('iscrizioni') === quante && sms.length === 0, 'nessuna riga nuova fra le iscrizioni, nessun SMS');

    // un indirizzo che non e' iscritto: stessa risposta, stessa ricevuta
    spedite = [];
    const n = await chiama(domanda(Object.assign({}, base, { nome: 'Ombretta', cognome: 'Verdi', email: 'nessuno@studio.it' })));
    const ricN = spedite.find(m => /^Abbiamo ricevuto/.test(m.subject)) || {};
    const internaN = spedite.find(m => /^Domanda dal sito/.test(m.subject)) || {};
    esigi(JSON.stringify(n.corpo) === JSON.stringify(r.corpo) && n.stato === r.stato, 'un indirizzo non iscritto: la stessa risposta');
    esigi(ricN.text === ric.text && ricN.subject === ric.subject, 'e la stessa ricevuta, parola per parola');
    esigi(spedite.length === 2 && /Nessuna iscrizione con questo indirizzo/.test(internaN.text), 'a noi invece: nessuna iscrizione, forse un errore di battitura');

    // di nuovo subito: la mail non riparte (due minuti), e la mail a noi lo dice
    spedite = [];
    await chiama(domanda(Object.assign({}, base, { nome: 'Ombretta', cognome: 'Verdi', email: 'ombretta@studio.it', messaggio: 'Ancora niente' })));
    const internaD = spedite.find(m => /^Domanda dal sito/.test(m.subject)) || {};
    esigi(!spedite.some(m => /^Richiesta di conferma/.test(m.subject)) && /non rimandata adesso: era appena partita/.test(internaD.text),
        'scritta di nuovo subito: la mail non riparte, e a noi si dice perche\'');
    // chi ha gia' confermato: nessun rinvio, e la diagnosi lo dice
    dati.set('iscrizioni/ombretta', Object.assign({}, dati.get('iscrizioni/ombretta'), { emailConfermata: { quando: orologio, come: 'mail' } }));
    avanza(5 * 60 * 1000);
    spedite = [];
    await chiama(domanda(Object.assign({}, base, { nome: 'Ombretta', cognome: 'Verdi', email: 'ombretta@studio.it', messaggio: 'Fatto?' })));
    const internaC = spedite.find(m => /^Domanda dal sito/.test(m.subject)) || {};
    esigi(!spedite.some(m => /^Richiesta di conferma/.test(m.subject)) && /Email confermata: sì/.test(internaC.text) && !/Rinvio/.test(internaC.text),
        'gia\' confermata: nessun rinvio, e la diagnosi dice "confermata"');
    const reg = domande().find(x => x.email === 'ombretta@studio.it' && x.controllo) || {};
    esigi(reg.controllo && reg.controllo.trovate === 2 && reg.controllo.rimandate.length === 1, 'e la domanda salvata tiene il riassunto del controllo', JSON.stringify(reg.controllo));
});

prova('Una "pagina" spedita con la domanda non fa nascere un\'iscrizione', async () => {
    azzera();
    const r = await chiama(domanda({ pagina: MILANO, email: 'furbo@studio.it' }));
    esigi(r.corpo.ok && conta('iscrizioni') === 0 && !spedite.some(m => /Richiesta di conferma/.test(m.subject)), 'nessuna iscrizione, nessuna mail di conferma');
});

prova('Cinque domande al giorno per indirizzo', async () => {
    azzera();
    let passate = 0;
    for (let i = 0; i < 5; i++) { const r = await chiama(domanda({ email: i % 2 ? 'CINQUE@studio.it' : 'cinque@studio.it' })); if (r.corpo.ok) passate++; }
    const sesta = await chiama(domanda({ email: 'cinque@studio.it' }));
    esigi(passate === 5 && sesta.stato === 429 && sesta.corpo.ok === false && /info@nextgenerationbusiness\.it/.test(sesta.corpo.msg), 'cinque passano, la sesta no', JSON.stringify(sesta.corpo));
    esigi(domande().length === 5, 'la sesta non si salva');
    const altra = await chiama(domanda({ email: 'altra@studio.it' }));
    esigi(altra.corpo.ok, 'un altro indirizzo passa');
    esigi(![...dati.keys()].some(k => k.startsWith('domandeSitoLimiti/') && /cinque/.test(k)), 'il contatore non ha l\'indirizzo nel nome');
    avanza(24 * 60 * 60 * 1000);
    const domani = await chiama(domanda({ email: 'cinque@studio.it' }));
    esigi(domani.corpo.ok, 'il giorno dopo si\'');
});

prova('Il freno per indirizzo IP: otto in dieci minuti, anche con una pagina di Milano', async () => {
    azzera();
    let respinte = 0;
    for (let i = 0; i < 10; i++) {
        const r = await chiama(domanda({ email: 'ip' + i + '@studio.it', pagina: MILANO }), '172.16.5.5');
        if (r.stato === 429) respinte++;
    }
    esigi(respinte === 2 && domande().length === 8, 'dalla nona in poi 429, e non si salvano', String(respinte));
});

(async () => {
    for (const p of prove) { console.log('\n' + p.titolo); await p.fn(); }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
