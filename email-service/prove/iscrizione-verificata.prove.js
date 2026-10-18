/* ============================================================
   PROVE - lib/iscrizione-verificata.js e il modulo di Milano
   ------------------------------------------------------------
       node prove/iscrizione-verificata.prove.js

   Niente da installare: Firestore, la posta e Brevo sono finti e
   stanno qui dentro. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Le tre regole di Milano devono reggere anche a
   chi chiama il servizio a mano, senza passare dal modulo:
     - passa solo un cellulare italiano, nella forma in cui lo scrive
       una persona; un fisso o un numero estero no;
     - senza il codice SMS giusto non c'e' iscrizione: la firma resa
       dalla verifica vale per quel numero e per quell'evento, e il
       codice si sbaglia cinque volte al massimo;
     - un SMS al minuto per numero, e nessun SMS per un'iscrizione che
       non si potrebbe fare;
     - una sola iscrizione per email e per numero; un'iscrizione
       annullata li libera;
     - un codice invito vale per due iscrizioni, e il modulo lo sa gia'
       dalla verifica del codice; l'azienda e' quella del codice;
     - il codice SMS non viaggia mai nella risposta, e Napoli resta
       com'era.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- orologio ----------
let orologio = Date.parse('2027-01-10T10:00:00+01:00');
const DateVera = Date;
global.Date = class extends DateVera {
    constructor(...a) { if (a.length) super(...a); else super(orologio); }
    static now() { return orologio; }
};
function avanza(ms) { orologio += ms; }

// ---------- Firestore finto (con transazioni e ricerche per uguaglianza) ----------
const dati = new Map();
const SERVER_TS = { __ts: true };
function applica(vecchio, patch, merge) {
    const base = (merge && vecchio) ? Object.assign({}, vecchio) : {};
    for (const k of Object.keys(patch)) {
        const v = patch[k];
        if (v && v.__inc) base[k] = (base[k] || 0) + v.__inc;
        else if (v && v.__del) delete base[k];
        else if (v && v.__union) base[k] = (base[k] || []).concat(v.__union);
        else if (v === SERVER_TS) base[k] = orologio;
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
        set: async (patch, opz) => { dati.set(chiave, applica(dati.get(chiave), patch, !!(opz && opz.merge))); },
        create: async (patch) => {
            if (dati.has(chiave)) { const e = new Error('already exists'); e.code = 6; throw e; }
            dati.set(chiave, applica(null, patch, false));
        }
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
    collection(coll) {
        return Object.assign(interroga(coll, [], 0), { doc: id => doc(coll, id) });
    },
    async getAll(...rif) { return Promise.all(rif.map(r => r.get())); },
    batch() {
        const op = [];
        return {
            set: (r, patch, opz) => op.push(() => r.set(patch, opz)),
            delete: r => op.push(async () => { dati.delete(r._chiave); }),
            commit: async () => { for (const f of op) await f(); }
        };
    },
    async runTransaction(fn) {
        // le scritture si applicano alla fine, come in Firestore
        const scritture = [];
        const tx = {
            get: async r => r.get(),
            set: (r, patch, opz) => { scritture.push([r, patch, opz]); }
        };
        const esito = await fn(tx);
        for (const [r, patch, opz] of scritture) await r.set(patch, opz);
        return esito;
    }
};
const admin = {
    initializeApp() { }, credential: { cert: () => ({}) }, apps: [],
    firestore: () => db
};
admin.firestore.FieldValue = {
    serverTimestamp: () => SERVER_TS, increment: n => ({ __inc: n }),
    arrayUnion: (...a) => ({ __union: a }), delete: () => ({ __del: true })
};

// ---------- posta e SMS finti ----------
let spedite = [];
let sms = [];
let smsGuasto = false;
let turnstileGiu = false;
global.fetch = async (url, opz) => {
    if (/turnstile\/v0\/siteverify/.test(String(url))) {
        if (turnstileGiu) throw new Error('rete giu');
        const q = new URLSearchParams(opz.body);
        const buono = q.get('secret') === 'segreto-turnstile' && q.get('response') === 'gettone-buono';
        return { ok: true, status: 200, json: async () => ({ success: buono, 'error-codes': buono ? [] : ['invalid-input-response'] }) };
    }
    if (/transactionalSMS/.test(String(url))) {
        const corpo = JSON.parse(opz.body);
        if (smsGuasto) return { ok: false, status: 402, text: async () => '{"code":"not_enough_credits"}' };
        sms.push(corpo);
        return { ok: true, status: 201, text: async () => '{"messageId":1}' };
    }
    throw new Error('rete non prevista: ' + url);
};

const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return { createTransport: () => ({ sendMail: async m => { spedite.push(m); return {}; } }) };
    if (nome === 'imapflow') return { ImapFlow: function () { } };
    if (nome === 'google-auth-library') return { JWT: function () { }, GoogleAuth: function () { } };
    return veroRequire.apply(this, arguments);
};

process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    client_email: 'servizio@esempio.iam.gserviceaccount.com', private_key: 'chiave-finta'
});
process.env.SMTP_FROM_EMAIL = 'noreply@esempio.it';
process.env.BREVO_API_KEY = 'chiave-brevo-finta';

const RADICE = path.join(__dirname, '..');
const servizio = require(path.join(RADICE, 'api/iscrizione-nuova.js'));
const V = require(path.join(RADICE, 'lib/iscrizione-verificata.js'));

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
const PAGINA = 'Milano 26 Febbraio 2027 - Iscrizione';
let ipProgressivo = 0;
async function chiama(corpo) {
    let stato = 0, risposta = null;
    const res = {
        setHeader() { }, status(s) { stato = s; return res; },
        json(c) { risposta = c; return res; }, end() { return res; }
    };
    // un IP diverso a ogni chiamata: qui non si prova il freno per IP
    await servizio({ method: 'POST', headers: { 'x-forwarded-for': '10.0.' + (ipProgressivo++ % 250) + '.1' }, body: corpo }, res);
    return { stato: stato, corpo: risposta || {} };
}
function ultimoCodice() {
    const m = /^(\d{6})/.exec(sms.length ? sms[sms.length - 1].content : '');
    return m ? m[1] : '';
}
async function verificaNumero(telefono, email) {
    const a = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: telefono, email: email });
    if (!a.corpo.ok) return { invio: a };
    const b = await chiama({ azione: 'sms-verifica', pagina: PAGINA, telefono: telefono, codice: ultimoCodice() });
    avanza(61 * 1000);   // il freno di un minuto per numero non c'entra con le prove che seguono
    return { invio: a, verifica: b, token: b.corpo.token };
}
async function iscrivi(campi) {
    spedite = [];
    avanza(1000);   // l'identificativo della scheda porta data e ora
    const r = await chiama(Object.assign({
        pagina: PAGINA, nome: 'Mario', cognome: 'Rossi', privacy: true, marketing: true, riprese: true, modalita: 'presenza'
    }, campi));
    return r;
}
function schede() {
    return [...dati.keys()].filter(k => k.indexOf('iscrizioni/') === 0).map(k => dati.get(k));
}

const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

prova('Il numero: solo cellulari italiani, scritti come capita', async () => {
    esigi(V.cellulare('333 123 4567') === '+393331234567', 'con gli spazi');
    esigi(V.cellulare('+39 333-123.4567') === '+393331234567', 'con prefisso, trattini e punti');
    esigi(V.cellulare('0039 3331234567') === '+393331234567', 'con 0039');
    esigi(V.cellulare('393331234567') === '+393331234567', 'con 39 davanti senza il +');
    esigi(V.cellulare('3931234567') === '+393931234567', 'un cellulare nazionale che comincia con 393 resta com\'e\'');
    esigi(V.cellulare('333123456') === '+39333123456', 'i vecchi numeri di nove cifre');
    esigi(V.cellulare('02 1234 5678') === '', 'un fisso no');
    esigi(V.cellulare('+41 79 123 45 67') === '', 'un numero estero no');
    esigi(V.cellulare('33312') === '', 'un numero troppo corto no');
    esigi(V.leggibile('+393331234567') === '+39 333 123 4567', 'la forma che si legge nell\'elenco');
});

prova('Il codice SMS parte, non torna nella risposta, e si verifica', async () => {
    sms = [];
    const a = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '333 111 2222', email: 'anna@studio.it' });
    esigi(a.stato === 200 && a.corpo.ok, 'l\'SMS parte', JSON.stringify(a.corpo));
    esigi(sms.length === 1 && sms[0].recipient === '393331112222', 'al numero giusto, senza il +', JSON.stringify(sms[0]));
    esigi(/Next Generation Business\./.test(sms[0].content) && !/Milano/.test(sms[0].content) && /10 minuti/.test(sms[0].content), 'il testo dice evento e scadenza, senza la citta\'', sms[0].content);
    esigi(/\n\n@nextgenerationbusiness\.it #\d{6}$/.test(sms[0].content), 'l\'ultima riga lega il codice al sito (lettura automatica su Android e iPhone)', JSON.stringify(sms[0].content.slice(-40)));
    esigi(sms[0].content.length <= 160, 'e il messaggio sta in un SMS solo', String(sms[0].content.length));
    const codice = ultimoCodice();
    esigi(!JSON.stringify(a.corpo).includes(codice), 'la risposta non contiene il codice');
    esigi(a.corpo.numero === '+39 333 ••• 2222', 'e il numero torna mascherato', a.corpo.numero);
    const salvato = JSON.stringify([...dati.entries()].filter(([k]) => k.startsWith('verificheSms/')));
    esigi(!salvato.includes('"' + codice + '"') && !salvato.includes(':' + codice), 'in archivio il codice non c\'e\' in chiaro');

    const sbagliato = await chiama({ azione: 'sms-verifica', pagina: PAGINA, telefono: '3331112222', codice: codice === '000000' ? '111111' : '000000' });
    esigi(!sbagliato.corpo.ok && /tentativi rimasti: 4/.test(sbagliato.corpo.msg), 'un codice sbagliato dice quanti tentativi restano', sbagliato.corpo.msg);
    const giusto = await chiama({ azione: 'sms-verifica', pagina: PAGINA, telefono: '+39 333 111 2222', codice: codice });
    esigi(giusto.corpo.ok && giusto.corpo.token, 'quello giusto rende la firma del numero');
    const ancora = await chiama({ azione: 'sms-verifica', pagina: PAGINA, telefono: '3331112222', codice: codice });
    esigi(!ancora.corpo.ok, 'e il codice non si usa due volte');
    avanza(61 * 1000);
});

prova('Un SMS al minuto per numero', async () => {
    sms = [];
    await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3334445555' });
    const subito = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3334445555' });
    esigi(subito.stato === 429 && subito.corpo.attesa > 0, 'il secondo subito dopo aspetta', JSON.stringify(subito.corpo));
    esigi(sms.length === 1, 'e non parte');
    avanza(61 * 1000);
    const dopo = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3334445555' });
    esigi(dopo.corpo.ok && sms.length === 2, 'dopo un minuto si', JSON.stringify(dopo.corpo));
    avanza(61 * 1000);
});

prova('Cinque sbagli, poi serve un codice nuovo', async () => {
    sms = [];
    await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3336667777' });
    const giusto = ultimoCodice();
    const altro = giusto === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) await chiama({ azione: 'sms-verifica', pagina: PAGINA, telefono: '3336667777', codice: altro });
    const r = await chiama({ azione: 'sms-verifica', pagina: PAGINA, telefono: '3336667777', codice: giusto });
    esigi(!r.corpo.ok && r.corpo.esito === 'troppi', 'al sesto tentativo neanche quello giusto passa', JSON.stringify(r.corpo));
    avanza(61 * 1000);
});

prova('Il codice scade dopo dieci minuti', async () => {
    sms = [];
    await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3338889999' });
    avanza(11 * 60 * 1000);
    const r = await chiama({ azione: 'sms-verifica', pagina: PAGINA, telefono: '3338889999', codice: ultimoCodice() });
    esigi(!r.corpo.ok && r.corpo.esito === 'scaduto', 'scaduto', JSON.stringify(r.corpo));
});

prova('Un SMS che Brevo rifiuta non fa aspettare un minuto', async () => {
    sms = []; smsGuasto = true;
    const r = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3471234567' });
    esigi(r.stato === 502 && !r.corpo.ok, 'la pagina sa che non e\' partito', JSON.stringify(r.corpo));
    smsGuasto = false;
    const ancora = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3471234567' });
    esigi(ancora.corpo.ok, 'e si puo\' riprovare subito', JSON.stringify(ancora.corpo));
    avanza(61 * 1000);
});

prova('Senza numero verificato non c\'e\' iscrizione', async () => {
    const senza = await iscrivi({ email: 'luca@studio.it', telefono: '3401234567' });
    esigi(senza.stato === 400 && senza.corpo.smsKo, 'senza firma no', JSON.stringify(senza.corpo));
    const fisso = await iscrivi({ email: 'luca@studio.it', telefono: '0612345678', smsToken: 'x' });
    esigi(fisso.corpo.smsKo && /cellulare/.test(fisso.corpo.msg), 'un fisso no, e il messaggio lo dice');
    const v = await verificaNumero('3401234567', 'luca@studio.it');
    const altroNumero = await iscrivi({ email: 'luca@studio.it', telefono: '3409999999', smsToken: v.token });
    esigi(altroNumero.corpo.smsKo, 'la firma di un numero non vale per un altro');
    const inventata = await iscrivi({ email: 'luca@studio.it', telefono: '3401234567', smsToken: v.token.replace(/.$/, c => c === 'A' ? 'B' : 'A') });
    esigi(inventata.corpo.smsKo, 'una firma ritoccata non vale');
    avanza(3 * 60 * 60 * 1000);
    const scaduta = await iscrivi({ email: 'luca@studio.it', telefono: '3401234567', smsToken: v.token });
    esigi(scaduta.corpo.smsKo, 'e dopo due ore la verifica e\' scaduta');
    esigi(!schede().some(s => s.email === 'luca@studio.it'), 'nessuna scheda scritta');
});

prova('Con il numero verificato l\'iscrizione passa, e la conferma email parte', async () => {
    const v = await verificaNumero('348 765 4321', 'giulia@studio.it');
    esigi(v.verifica && v.verifica.corpo.ok, 'numero verificato');
    const r = await iscrivi({ email: 'Giulia@Studio.it', telefono: '+39 348 765 4321', smsToken: v.token, azienda: 'Beta srl' });
    esigi(r.stato === 200 && r.corpo.ok, 'iscritta', JSON.stringify(r.corpo));
    const s = schede().find(x => x.email === 'giulia@studio.it');
    esigi(s && s.telefono === '+39 348 765 4321' && s.telefonoNumero === '+393487654321', 'la scheda tiene il numero nelle due forme');
    esigi(s && s.telefonoVerificato && s.telefonoVerificato.come === 'sms', 'e sa che e\' verificato per SMS');
    esigi(s && s.modalita === 'presenza', 'in presenza');
    esigi(spedite.length === 1 && /conferma/i.test(spedite[0].subject), 'parte la mail con il pulsante di conferma', spedite[0] && spedite[0].subject);
});

prova('Una sola iscrizione per email e per numero', async () => {
    const v1 = await verificaNumero('349 000 1111', 'paolo@studio.it');
    const r1 = await iscrivi({ email: 'paolo@studio.it', telefono: '3490001111', smsToken: v1.token });
    esigi(r1.corpo.ok, 'la prima passa');

    sms = [];
    const smsEmail = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3490002222', email: 'PAOLO@studio.it' });
    esigi(smsEmail.stato === 409 && smsEmail.corpo.campo === 'email', 'con la stessa email l\'SMS non parte nemmeno', JSON.stringify(smsEmail.corpo));
    const smsNumero = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '+39 349 000 1111', email: 'altro@studio.it' });
    esigi(smsNumero.stato === 409 && smsNumero.corpo.campo === 'telefono', 'con lo stesso numero neanche', JSON.stringify(smsNumero.corpo));
    esigi(sms.length === 0, 'nessun SMS speso');

    /* Chi chiama a mano con la firma ancora buona: la regola la tiene la
       transazione, non il modulo. */
    const stessoNumero = await iscrivi({ email: 'altro@studio.it', telefono: '3490001111', smsToken: v1.token });
    esigi(stessoNumero.stato === 409 && stessoNumero.corpo.campo === 'telefono', 'la scrittura rifiuta lo stesso numero', JSON.stringify(stessoNumero.corpo));
    const v2 = await verificaNumero('3490003333', 'nuovo@studio.it');
    const stessaEmail = await iscrivi({ email: 'paolo@studio.it', telefono: '3490003333', smsToken: v2.token });
    esigi(stessaEmail.stato === 409 && stessaEmail.corpo.campo === 'email', 'e la stessa email', JSON.stringify(stessaEmail.corpo));
    esigi(schede().filter(s => s.email === 'paolo@studio.it').length === 1, 'resta una scheda sola');
});

prova('Un\'iscrizione annullata libera email e numero', async () => {
    const v = await verificaNumero('3201112222', 'sara@studio.it');
    await iscrivi({ email: 'sara@studio.it', telefono: '3201112222', smsToken: v.token });
    const k = [...dati.keys()].find(x => x.startsWith('iscrizioni/') && dati.get(x).email === 'sara@studio.it');
    dati.set(k, Object.assign({}, dati.get(k), { annullato: { quando: orologio, da: 'intestatario' } }));
    const di = await verificaNumero('3201112222', 'sara@studio.it');
    esigi(di.verifica && di.verifica.corpo.ok, 'si puo\' richiedere il codice', JSON.stringify(di.invio.corpo));
    const r = await iscrivi({ email: 'sara@studio.it', telefono: '3201112222', smsToken: di.token });
    esigi(r.corpo.ok, 'e iscriversi di nuovo', JSON.stringify(r.corpo));
});

prova('Le iscrizioni inserite a mano contano per l\'email', async () => {
    dati.set('iscrizioni/a-mano', { pagina: 'Milano 26 Febbraio 2027', email: 'eventbrite@studio.it', nome: 'Ugo' });
    const r = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3209998888', email: 'eventbrite@studio.it' });
    esigi(r.stato === 409 && r.corpo.campo === 'email', 'gia\' iscritto da Eventbrite', JSON.stringify(r.corpo));
    dati.set('iscrizioni/napoli', { pagina: 'Napoli 2 Ottobre 2026', email: 'napoli@studio.it' });
    const n = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3209998888', email: 'napoli@studio.it' });
    esigi(n.corpo.ok, 'un\'iscrizione a Napoli invece non conta', JSON.stringify(n.corpo));
    avanza(61 * 1000);
});

prova('Un codice invito vale per due iscrizioni, e porta l\'azienda', async () => {
    dati.set('codiciInvito/A7K2M', { codice: 'A7K2M', evento: 'milano', scheda: 'az1', pagina: 'Milano 26 Febbraio 2027', ragioneSociale: 'Alfa S.p.A.', usato: null });
    const c0 = await chiama({ azione: 'verifica-codice', pagina: PAGINA, codice: 'a7k2m' });
    esigi(c0.corpo.ok && c0.corpo.azienda === 'Alfa S.p.A.', 'il codice e\' riconosciuto, con l\'azienda', JSON.stringify(c0.corpo));
    for (const [i, tel] of [['1', '3311111111'], ['2', '3312222222']]) {
        const v = await verificaNumero(tel, 'alfa' + i + '@alfa.it');
        const r = await iscrivi({ email: 'alfa' + i + '@alfa.it', telefono: tel, smsToken: v.token, codiceInvito: 'A7K2M', azienda: 'scritta a mano' });
        esigi(r.corpo.ok, 'iscrizione ' + i + ' con il codice', JSON.stringify(r.corpo));
        const s = schede().find(x => x.email === 'alfa' + i + '@alfa.it');
        esigi(s && s.azienda === 'Alfa S.p.A.' && s.selezionata === true, 'l\'azienda e\' quella del codice', s && s.azienda);
    }
    const c3 = await chiama({ azione: 'verifica-codice', pagina: PAGINA, codice: 'A7K2M' });
    esigi(!c3.corpo.ok && c3.corpo.motivo === 'esaurito', 'la verifica del codice lo dice esaurito', JSON.stringify(c3.corpo));
    const v3 = await verificaNumero('3313333333', 'alfa3@alfa.it');
    const r3 = await iscrivi({ email: 'alfa3@alfa.it', telefono: '3313333333', smsToken: v3.token, codiceInvito: 'A7K2M' });
    esigi(r3.stato === 409 && r3.corpo.codiceKo, 'la terza con il codice no', JSON.stringify(r3.corpo));
    esigi(!schede().some(s => s.email === 'alfa3@alfa.it'), 'e non scrive niente');
    const senzaCodice = await iscrivi({ email: 'alfa3@alfa.it', telefono: '3313333333', smsToken: v3.token });
    esigi(senzaCodice.corpo.ok, 'senza codice si', JSON.stringify(senzaCodice.corpo));
    // un posto si libera se una delle due si annulla
    const k = [...dati.keys()].find(x => x.startsWith('iscrizioni/') && dati.get(x).email === 'alfa1@alfa.it');
    dati.set(k, Object.assign({}, dati.get(k), { annullato: { quando: orologio } }));
    const c4 = await chiama({ azione: 'verifica-codice', pagina: PAGINA, codice: 'A7K2M' });
    esigi(c4.corpo.ok, 'annullata una, il codice torna buono', JSON.stringify(c4.corpo));
});

prova('Con TURNSTILE_SECRET l\'SMS vuole la casella "non sono un robot"', async () => {
    process.env.TURNSTILE_SECRET = 'segreto-turnstile';
    sms = [];
    const senza = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3505550001' });
    esigi(senza.stato === 400 && senza.corpo.captchaKo, 'senza gettone non parte', JSON.stringify(senza.corpo));
    const cattivo = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3505550001', captcha: 'inventato' });
    esigi(cattivo.corpo.captchaKo, 'con un gettone falso neanche');
    turnstileGiu = true;
    const giu = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3505550001', captcha: 'gettone-buono' });
    esigi(giu.corpo.captchaKo && /riprova/.test(giu.corpo.msg), 'Cloudflare irraggiungibile: non parte, e si dice di riprovare');
    turnstileGiu = false;
    esigi(sms.length === 0, 'nessun SMS speso');
    const buono = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3505550001', captcha: 'gettone-buono' });
    esigi(buono.corpo.ok && sms.length === 1, 'con il gettone buono parte', JSON.stringify(buono.corpo));
    const v = await chiama({ azione: 'sms-verifica', pagina: PAGINA, telefono: '3505550001', codice: ultimoCodice() });
    esigi(v.corpo.ok, 'la verifica del codice non lo chiede');
    delete process.env.TURNSTILE_SECRET;
    avanza(61 * 1000);
});

prova('Il freno per IP di Milano e\' piu\' largo di quello degli altri moduli', async () => {
    let stato = 0;
    const res = { setHeader() { }, status(s) { stato = s; return res; }, json() { return res; }, end() { return res; } };
    const stessoIp = { 'x-forwarded-for': '192.168.7.7' };
    let respinte = 0;
    for (let i = 0; i < 12; i++) {
        await servizio({ method: 'POST', headers: stessoIp, body: { azione: 'verifica-codice', pagina: PAGINA, codice: 'QQQQQ' } }, res);
        if (stato === 429) respinte++;
    }
    esigi(respinte === 0, 'dodici richieste dallo stesso ufficio passano tutte');
    const altroIp = { 'x-forwarded-for': '192.168.8.8' };
    respinte = 0;
    for (let i = 0; i < 12; i++) {
        await servizio({ method: 'POST', headers: altroIp, body: { azione: 'verifica-codice', pagina: 'Napoli 2 Ottobre 2026', codice: 'QQQQQ' } }, res);
        if (stato === 429) respinte++;
    }
    esigi(respinte === 4, 'per gli altri moduli restano otto', String(respinte));
});

prova('Dopo l\'iscrizione email e cellulare non si cambiano dal collegamento personale', async () => {
    const NL = require(path.join(RADICE, 'lib/newsletter.js'));
    const v = await verificaNumero('3456781234', 'fissa@studio.it');
    const r = await iscrivi({ email: 'fissa@studio.it', telefono: '3456781234', smsToken: v.token, azienda: 'Gamma' });
    esigi(r.corpo.ok, 'iscritto');
    const k = [...dati.keys()].find(x => x.startsWith('iscrizioni/') && dati.get(x).email === 'fissa@studio.it');
    const idDoc = k.slice('iscrizioni/'.length);
    const t = NL.firmaCompleta(idDoc);
    const leggi = await chiama({ azione: 'completa-leggi', d: idDoc, t: t });
    esigi(leggi.corpo.ok && leggi.corpo.capofila.telefonoBloccato === true, 'la pagina sa che il cellulare e\' bloccato', JSON.stringify(leggi.corpo.capofila));
    const salva = await chiama({ azione: 'completa-salva', d: idDoc, t: t, partecipanti: [
        { nome: 'Mario', cognome: 'Fisso', email: 'altra@studio.it', azienda: 'Gamma', ruolo: 'CFO', telefono: '3999999999' }] });
    esigi(salva.corpo.ok, 'il salvataggio degli altri dati riesce', JSON.stringify(salva.corpo));
    const dopo = dati.get(k);
    esigi(dopo.email === 'fissa@studio.it', 'l\'email resta quella dell\'iscrizione', dopo.email);
    esigi(dopo.telefono === '+39 345 678 1234', 'il cellulare resta quello verificato', dopo.telefono);
    esigi(dopo.cognome === 'Fisso' && dopo.ruolo === 'CFO', 'gli altri dati invece si aggiornano');
});

prova('La pagina si accorge della conferma, e l\'invito porta il calendario', async () => {
    const NL = require(path.join(RADICE, 'lib/newsletter.js'));
    const v = await verificaNumero('3471112233', 'stato@studio.it');
    const r = await iscrivi({ email: 'stato@studio.it', telefono: '3471112233', smsToken: v.token, nome: 'Lia', cognome: 'Verdi', azienda: 'Delta' });
    esigi(r.corpo.ok && r.corpo.stato && r.corpo.stato.d && r.corpo.stato.t, 'l\'invio rende la firma per rileggere lo stato', JSON.stringify(r.corpo));
    const st = r.corpo.stato;
    const prima = await chiama({ azione: 'stato-iscrizione', d: st.d, t: st.t });
    esigi(prima.corpo.ok && prima.corpo.emailConfermata === false && prima.corpo.invito === false, 'prima della conferma: non confermata', JSON.stringify(prima.corpo));
    esigi(Object.keys(prima.corpo).sort().join(',') === 'annullato,emailConfermata,invito,ok', 'e la risposta non porta dati personali');
    const falsa = await chiama({ azione: 'stato-iscrizione', d: st.d, t: 'x' + st.t.slice(1) });
    esigi(falsa.stato === 403, 'con una firma sbagliata non si legge niente');
    const altra = await chiama({ azione: 'stato-iscrizione', d: st.d, t: NL.firmaCompleta(st.d) });
    esigi(altra.stato === 403, 'e la firma del collegamento "modifica" non vale qui');

    spedite = [];
    const c = await chiama({ azione: 'conferma-email', d: st.d, t: NL.firmaConfermaEmail(st.d) });
    esigi(c.corpo.ok && c.corpo.invito === true, 'la conferma dell\'email spedisce l\'invito', JSON.stringify(c.corpo));
    const dopo = await chiama({ azione: 'stato-iscrizione', d: st.d, t: st.t });
    esigi(dopo.corpo.emailConfermata === true && dopo.corpo.invito === true, 'dopo la conferma la pagina legge: confermata, invito partito', JSON.stringify(dopo.corpo));

    const mail = spedite[spedite.length - 1] || {};
    const allegati = (mail.attachments || []).map(a => a.filename);
    esigi(allegati.some(n => /\.pdf$/.test(n)), 'l\'invito ha il PDF', allegati.join(', '));
    const ics = (mail.attachments || []).find(a => /\.ics$/.test(a.filename));
    esigi(!!ics, 'e il file .ics per il calendario');
    esigi(ics && /DTSTART:20270226T073000Z/.test(ics.content) && /DTEND:20270226T170000Z/.test(ics.content), 'dalle 8.30 alle 18.00 ora di Milano');
    esigi(/calendar\.google\.com/.test(mail.html) && /outlook\.live\.com/.test(mail.html), 'nella mail i collegamenti per Google Calendar e Outlook');
    esigi(/Google Calendar: https/.test(mail.text), 'anche nella versione senza formattazione');
});

prova('Senza il consenso alle riprese non ci si iscrive', async () => {
    const v = await verificaNumero('3477778888', 'riprese@studio.it');
    const no = await iscrivi({ email: 'riprese@studio.it', telefono: '3477778888', smsToken: v.token, riprese: false });
    esigi(no.stato === 400 && no.corpo.campo === 'riprese', 'senza consenso: rifiutata, e si dice perche\'', JSON.stringify(no.corpo));
    esigi(!schede().some(s => s.email === 'riprese@studio.it'), 'e non si scrive niente');
    const si = await iscrivi({ email: 'riprese@studio.it', telefono: '3477778888', smsToken: v.token });
    const s = schede().find(x => x.email === 'riprese@studio.it');
    esigi(si.corpo.ok && s && s.consensoRiprese && s.consensoRiprese.come === 'modulo', 'con il consenso passa, e il consenso resta sulla scheda');
});

prova('Napoli resta com\'era', async () => {
    const r = await chiama({
        pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', nome: 'Ada', cognome: 'Neri',
        email: 'ada@studio.it', telefono: '06 1234567', privacy: true, marketing: true
    });
    esigi(r.corpo.ok, 'senza SMS e con un fisso', JSON.stringify(r.corpo));
    const r2 = await chiama({
        pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', nome: 'Ada', cognome: 'Neri',
        email: 'ada@studio.it', privacy: true, marketing: true, data: '01/01/2026 10:00:00'
    });
    esigi(r2.corpo.ok, 'e senza la regola dell\'email unica');
    const sbagliato = await chiama({ azione: 'sms-invia', pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', telefono: '3331234567' });
    esigi(sbagliato.stato === 400, 'e l\'SMS per Napoli non parte');
});

(async () => {
    for (const p of prove) { console.log('\n' + p.titolo); await p.fn(); }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
