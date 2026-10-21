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
     - chi ha annullato e ricompila dal collegamento personale riprende
       il posto del codice solo se e' ancora libero, e l'azienda
       dell'invito da li' non si cambia (a Napoli, dove il codice non
       tocca l'azienda scritta, invece si');
     - la risposta all'iscrizione dice l'azienda scritta sulla scheda;
     - con il codice la scheda porta le colonne del file da cui e'
       stata caricata l'azienda (datiInvito), anche per le aziende
       caricate prima, e se la lettura non riesce l'iscrizione passa;
     - il codice SMS non viaggia mai nella risposta, e Napoli resta
       com'era;
     - dopo la mail di conferma parte UN SMS "conferma la tua email"
       (tag conferma-email, alfabeto GSM-7, due SMS al massimo, con il
       pulsante, lo spam, l'indirizzo e il modulo /contatti/?t=mail, mai
       la riga del codice); se la mail non parte l'SMS lo dice, se l'SMS
       non parte o il tetto e' pieno l'iscrizione passa lo stesso; la
       scheda entra nel giro automatico (confermaInAttesa), ne esce
       annullando e ci torna riattivandosi senza conferma; la risposta
       al modulo dice se l'SMS e' partito (`sms`) e quale (`smsTipo`:
       'inviata' o 'non-inviata', come la mail);
     - "rimanda-conferma": firmata come lo stato, due minuti fra un
       invio e l'altro, cinque al giorno, niente a chi ha confermato;
       dentro i due minuti da un invio fallito non dice "ti abbiamo
       appena mandato la mail";
     - "stato-iscrizione" dice com'e' andata la mail, e fra quanti
       secondi il pulsante "rimandala" puo' chiederne un'altra
       (`attesaRimanda`, lo stesso freno di "rimanda-conferma");
     - chi si riscrive mentre la sua iscrizione aspetta la conferma
       legge dove cercare la mail e dove scriverci, e la mail riparte;
       a chi ha confermato resta il messaggio di sempre.
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
// quante delle prossime mail il server di posta finto rifiuta (con un errore che non passa)
let mailGuasta = 0;
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
    if (nome === 'nodemailer') return { createTransport: () => ({ sendMail: async m => {
        if (mailGuasta > 0) { mailGuasta--; throw new Error('550 casella inesistente'); }
        spedite.push(m); return {};
    } }) };
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
        /* La conferma a video la legge dalla risposta: con il campo rimasto
           libero (una verifica del codice andata a vuoto) mostrerebbe quella
           scritta a mano, che sulla scheda non c'e'. */
        esigi(r.corpo.azienda === 'Alfa S.p.A.', 'e la risposta dice quella scritta sulla scheda, non quella del campo', r.corpo.azienda);
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
    esigi(Object.keys(r.corpo).sort().join(',') === 'azienda,ok,sms,smsTipo,stato' && r.corpo.azienda === 'Delta',
        'e l\'azienda scritta (senza codice, quella del modulo) e com\'e\' andato l\'SMS: nient\'altro', JSON.stringify(r.corpo));
    const st = r.corpo.stato;
    const prima = await chiama({ azione: 'stato-iscrizione', d: st.d, t: st.t });
    esigi(prima.corpo.ok && prima.corpo.emailConfermata === false && prima.corpo.invito === false, 'prima della conferma: non confermata', JSON.stringify(prima.corpo));
    esigi(prima.corpo.mail === 'inviata', 'e la mail di conferma risulta partita', JSON.stringify(prima.corpo));
    esigi(Object.keys(prima.corpo).sort().join(',') === 'annullato,attesaRimanda,emailConfermata,invito,mail,ok', 'e la risposta non porta dati personali', Object.keys(prima.corpo).join(','));
    esigi(prima.corpo.attesaRimanda > 110 && prima.corpo.attesaRimanda <= 120, 'mail appena partita: il pulsante "rimandala" aspetta i suoi due minuti', String(prima.corpo.attesaRimanda));
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

/* Le colonne del file da cui e' stata caricata l'azienda invitata passano,
   con il codice, sulla scheda di chi si registra: l'elenco degli iscritti
   le mostra senza andare a cercare l'azienda riga per riga. */
function schedaDi(email) {
    const k = [...dati.keys()].find(x => x.startsWith('iscrizioni/') && dati.get(x).email === email);
    return k ? { id: k.slice('iscrizioni/'.length), s: dati.get(k) } : { id: '', s: null };
}
prova('Con il codice la scheda porta le colonne del file dell\'azienda invitata', async () => {
    const DATI_FILE = [
        { c: '#', v: '1' }, { c: 'Ragione sociale (file)', v: 'AVAS PHARMACEUTICALS S.R.L.' }, { c: 'Ricavi (EUR)', v: '100674810' },
        { c: 'Totale attivo (EUR)', v: '' }, { c: 'Revisore o societa di revisione', v: 'Sig. Alessandro Ballardini' }
    ];
    dati.set('aziendeInvito/milano~info@pec-avaspharma-com', {
        evento: 'milano', ragioneSociale: 'AVAS PHARMACEUTICALS S.R.L.', pec: 'info@pec.avaspharma.com', stato: 'inviata',
        datiFile: DATI_FILE, extra: { 'Ricavi (EUR)': '100674810' }
    });
    dati.set('codiciInvito/B8N3P', { codice: 'B8N3P', evento: 'milano', scheda: 'milano~info@pec-avaspharma-com', pagina: 'Milano 26 Febbraio 2027', ragioneSociale: 'AVAS PHARMACEUTICALS S.R.L.', usato: null });
    let v = await verificaNumero('3661110001', 'ballardini@avas.it');
    let r = await iscrivi({ email: 'ballardini@avas.it', telefono: '3661110001', smsToken: v.token, codiceInvito: 'B8N3P', azienda: 'scritta a mano' });
    let s = schedaDi('ballardini@avas.it').s;
    esigi(r.corpo.ok && s && JSON.stringify(s.datiInvito) === JSON.stringify(DATI_FILE),
        'la scheda ha datiInvito: le colonne del file, nell\'ordine del file, celle vuote comprese', s && JSON.stringify(s.datiInvito));
    esigi(s && s.azienda === 'AVAS PHARMACEUTICALS S.R.L.' && dati.get('aziendeInvito/milano~info@pec-avaspharma-com').stato === 'iscritta',
        'e il resto come prima: azienda dell\'invito, scheda dell\'azienda "iscritta"');

    /* Una scheda caricata prima di datiFile: l'elenco si ricostruisce dai
       campi riconosciuti (solo quelli pieni) e dalle colonne in extra. */
    dati.set('aziendeInvito/milano~vecchia@pec-it', {
        evento: 'milano', ragioneSociale: 'Vecchia Srl', pec: 'vecchia@pec.it', email: '', piva: '01234567890', provincia: '',
        citta: 'Lodi', extra: { 'Ricavi (EUR)': '5000', '#': '9' }
    });
    dati.set('codiciInvito/C9P4Q', { codice: 'C9P4Q', evento: 'milano', scheda: 'milano~vecchia@pec-it', pagina: 'Milano 26 Febbraio 2027', ragioneSociale: 'Vecchia Srl', usato: null });
    v = await verificaNumero('3661110002', 'uno@vecchia.it');
    r = await iscrivi({ email: 'uno@vecchia.it', telefono: '3661110002', smsToken: v.token, codiceInvito: 'C9P4Q' });
    s = schedaDi('uno@vecchia.it').s;
    const atteso = [{ c: 'Ragione sociale', v: 'Vecchia Srl' }, { c: 'PEC', v: 'vecchia@pec.it' }, { c: 'Partita IVA', v: '01234567890' },
        { c: 'Citta', v: 'Lodi' }, { c: '#', v: '9' }, { c: 'Ricavi (EUR)', v: '5000' }];
    esigi(r.corpo.ok && s && JSON.stringify(s.datiInvito) === JSON.stringify(atteso),
        'scheda caricata prima di datiFile: i campi pieni, poi le colonne di extra in ordine', s && JSON.stringify(s.datiInvito));

    // l'azienda del codice non c'e' piu', o la lettura non riesce: l'iscrizione passa lo stesso
    dati.set('codiciInvito/D7R5S', { codice: 'D7R5S', evento: 'milano', scheda: 'milano~sparita@pec-it', pagina: 'Milano 26 Febbraio 2027', ragioneSociale: 'Sparita Srl', usato: null });
    v = await verificaNumero('3661110003', 'chi@sparita.it');
    r = await iscrivi({ email: 'chi@sparita.it', telefono: '3661110003', smsToken: v.token, codiceInvito: 'D7R5S' });
    s = schedaDi('chi@sparita.it').s;
    esigi(r.corpo.ok && s && !('datiInvito' in s) && s.invitoCodice === 'D7R5S', 'azienda sparita: iscritto, con il codice, senza datiInvito');
    dati.set('codiciInvito/E6T2V', { codice: 'E6T2V', evento: 'milano', scheda: 'milano~guasta', pagina: 'Milano 26 Febbraio 2027', ragioneSociale: 'Guasta Srl', usato: null });
    const veraCollection = db.collection;
    db.collection = c => c === 'aziendeInvito'
        ? { doc: () => ({ get: async () => { throw new Error('lettura non riuscita'); }, set: async () => { throw new Error('scrittura non riuscita'); } }) }
        : veraCollection.call(db, c);
    const errori = [];
    const errVero = console.error;
    console.error = (...x) => errori.push(x.join(' '));
    try {
        v = await verificaNumero('3661110004', 'chi@guasta.it');
        r = await iscrivi({ email: 'chi@guasta.it', telefono: '3661110004', smsToken: v.token, codiceInvito: 'E6T2V' });
    } finally { db.collection = veraCollection; console.error = errVero; }
    s = schedaDi('chi@guasta.it').s;
    esigi(r.corpo.ok && s && !('datiInvito' in s), 'lettura dell\'azienda in errore: l\'iscrizione passa lo stesso', JSON.stringify(r.corpo));
    esigi(errori.some(x => /Dati dell'azienda invitata non copiati/.test(x)), 'e il log lo dice');

    v = await verificaNumero('3661110005', 'senza@codice.it');
    r = await iscrivi({ email: 'senza@codice.it', telefono: '3661110005', smsToken: v.token });
    s = schedaDi('senza@codice.it').s;
    esigi(r.corpo.ok && s && !('datiInvito' in s), 'senza codice niente datiInvito');

    // non solo Milano: vale per ogni evento che usa i codici
    dati.set('codiciInvito/F5V8W', { codice: 'F5V8W', evento: 'napoli', scheda: 'milano~info@pec-avaspharma-com', pagina: 'Napoli 2 Ottobre 2026', ragioneSociale: 'AVAS PHARMACEUTICALS S.R.L.', usato: null });
    r = await chiama({ pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', nome: 'Ugo', cognome: 'Napoletano', email: 'ugo@avas.it', privacy: true, marketing: true, codiceInvito: 'F5V8W' });
    s = schedaDi('ugo@avas.it').s;
    esigi(r.corpo.ok && s && JSON.stringify(s.datiInvito) === JSON.stringify(DATI_FILE), 'anche a Napoli, con il codice, la scheda porta le colonne del file');
});

prova('Dal collegamento personale l\'azienda dell\'invito non si cambia', async () => {
    const NL = require(path.join(RADICE, 'lib/newsletter.js'));
    const inv = schedaDi('ballardini@avas.it');
    const t = NL.firmaCompleta(inv.id);
    const leggi = await chiama({ azione: 'completa-leggi', d: inv.id, t: t });
    esigi(leggi.corpo.ok && leggi.corpo.capofila.aziendaBloccata === true, 'con il codice la pagina sa che l\'azienda e\' bloccata', JSON.stringify(leggi.corpo.capofila));
    spedite = [];
    const salva = await chiama({ azione: 'completa-salva', d: inv.id, t: t, partecipanti: [
        { nome: 'Alessandro', cognome: 'Ballardini', email: 'ballardini@avas.it', azienda: 'Altra Srl', ruolo: 'Revisore', telefono: '3661110001' }] });
    const dopo = dati.get('iscrizioni/' + inv.id);
    esigi(salva.corpo.ok && dopo.azienda === 'AVAS PHARMACEUTICALS S.R.L.' && dopo.ruolo === 'Revisore',
        'il salvataggio riesce, ma l\'azienda resta quella dell\'invito', dopo.azienda);
    esigi(spedite.length === 1 && /AVAS PHARMACEUTICALS/.test(spedite[0].text) && !/Altra Srl/.test(spedite[0].html + spedite[0].text),
        'e la mail di riepilogo nomina quella dell\'invito, non quella scritta nel modulo');

    const libero = schedaDi('giulia@studio.it');
    const t2 = NL.firmaCompleta(libero.id);
    const leggi2 = await chiama({ azione: 'completa-leggi', d: libero.id, t: t2 });
    esigi(leggi2.corpo.ok && leggi2.corpo.capofila.aziendaBloccata === false, 'senza codice l\'azienda non e\' bloccata');
    const salva2 = await chiama({ azione: 'completa-salva', d: libero.id, t: t2, partecipanti: [
        { nome: 'Giulia', cognome: 'Rossi', email: 'giulia@studio.it', azienda: 'Beta Due srl', ruolo: '', telefono: '' }] });
    esigi(salva2.corpo.ok && dati.get('iscrizioni/' + libero.id).azienda === 'Beta Due srl', 'e si cambia come prima');

    /* A Napoli il codice non tocca l'azienda: la registrazione tiene quella
       scritta nel modulo, errori di battitura compresi. Bloccarla vorrebbe
       dire non poterla piu' correggere, con la scritta "viene dal codice
       invito" che non e' vera. */
    const rN = await chiama({ pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', nome: 'Rino', cognome: 'Rossi', email: 'rino@rossi.it',
        azienda: 'Rosssi srl', privacy: true, marketing: true, codiceInvito: 'F5V8W' });
    const nap = schedaDi('rino@rossi.it');
    esigi(rN.corpo.ok && nap.s && nap.s.invitoCodice === 'F5V8W' && nap.s.azienda === 'Rosssi srl',
        'Napoli con il codice: la scheda ha il codice e l\'azienda scritta nel modulo', nap.s && nap.s.azienda);
    const tN = NL.firmaCompleta(nap.id);
    const leggiN = await chiama({ azione: 'completa-leggi', d: nap.id, t: tN });
    esigi(leggiN.corpo.ok && leggiN.corpo.capofila.aziendaBloccata === false, 'a Napoli l\'azienda non e\' bloccata, anche con il codice', JSON.stringify(leggiN.corpo.capofila));
    const salvaN = await chiama({ azione: 'completa-salva', d: nap.id, t: tN, partecipanti: [
        { nome: 'Rino', cognome: 'Rossi', email: 'rino@rossi.it', azienda: 'Rossi srl', ruolo: '', telefono: '' }] });
    esigi(salvaN.corpo.ok && dati.get('iscrizioni/' + nap.id).azienda === 'Rossi srl', 'e chi l\'ha scritta la corregge', dati.get('iscrizioni/' + nap.id).azienda);
});

prova('Chi ha annullato riprende il posto del codice solo se e\' ancora libero', async () => {
    const NL = require(path.join(RADICE, 'lib/newsletter.js'));
    dati.set('codiciInvito/G4X7Y', { codice: 'G4X7Y', evento: 'milano', scheda: 'az-g', pagina: 'Milano 26 Febbraio 2027', ragioneSociale: 'Gi Srl', usato: null });
    const iscrittoConCodice = async (email, tel) => {
        const v = await verificaNumero(tel, email);
        const r = await iscrivi({ email: email, telefono: tel, smsToken: v.token, codiceInvito: 'G4X7Y', nome: 'Pino', cognome: email.split('@')[0] });
        const x = schedaDi(email);
        return { ok: r.corpo.ok, id: x.id, t: NL.firmaCompleta(x.id) };
    };
    const salva = (x, partecipanti) => chiama({ azione: 'completa-salva', d: x.id, t: x.t, partecipanti: partecipanti });
    const ricompila = x => salva(x, [{ nome: 'Pino', cognome: 'Ripensato', email: '', azienda: 'Altro', ruolo: '', telefono: '' }]);
    const a = await iscrittoConCodice('a@gi.it', '3681110001');
    const b = await iscrittoConCodice('b@gi.it', '3681110002');
    esigi(a.ok && b.ok, 'A e B si iscrivono con il codice');
    esigi(dati.get('iscrizioni/' + a.id).confermaInAttesa === true, 'A aspetta la conferma: e\' nel giro automatico');
    const ann = await salva(a, [{ annulla: true }]);
    esigi(ann.corpo.ok && !!dati.get('iscrizioni/' + a.id).annullato, 'A annulla dal collegamento personale');
    esigi(!('confermaInAttesa' in dati.get('iscrizioni/' + a.id)), 'e annullando esce dal giro automatico delle mail di conferma');
    const c = await iscrittoConCodice('c@gi.it', '3681110003');
    esigi(c.ok, 'il posto di A va a C');
    const no = await ricompila(a);
    esigi(no.stato === 409 && no.corpo.codiceKo === true && /due iscrizioni/.test(no.corpo.msg || ''),
        'A ricompila: rifiutato, e il messaggio dice perche\'', JSON.stringify(no.corpo));
    esigi(!!dati.get('iscrizioni/' + a.id).annullato && dati.get('iscrizioni/' + a.id).cognome === 'a',
        'e non si e\' scritto niente: A resta annullata, con i dati di prima');
    const usate = () => (dati.get('codiciInvito/G4X7Y').iscrizioniUsate || []).slice().sort().join(',');
    esigi(usate() === [b.id, c.id].sort().join(','), 'il codice conta B e C', usate());
    const cAnn = await salva(c, [{ annulla: true }]);
    esigi(cAnn.corpo.ok, 'C annulla');
    const si = await ricompila(a);
    const sa = dati.get('iscrizioni/' + a.id);
    esigi(si.corpo.ok && !sa.annullato && sa.cognome === 'Ripensato', 'con il posto libero A si riattiva', JSON.stringify(si.corpo));
    esigi(sa.confermaInAttesa === true, 'e, senza aver confermato l\'indirizzo, torna nel giro automatico');
    esigi(sa.azienda === 'Gi Srl', 'con l\'azienda dell\'invito, non quella scritta nel modulo', sa.azienda);
    esigi(usate() === [a.id, b.id].sort().join(','), 'e il codice torna a contare A e B', usate());
    const ver = await chiama({ azione: 'verifica-codice', pagina: PAGINA, codice: 'G4X7Y' });
    esigi(!ver.corpo.ok && ver.corpo.motivo === 'esaurito', 'il codice e\' di nuovo esaurito', JSON.stringify(ver.corpo));
    // un secondo invio della stessa riattivazione non si conta da solo
    const ancora = await V.riattiva(db, { idDoc: a.id, codice: 'G4X7Y', patch: {} });
    esigi(ancora.ok && usate() === [a.id, b.id].sort().join(','), 'la scheda stessa non occupa il posto che sta riprendendo');
    // un codice che non esiste piu' non si ricrea
    const senza = await V.riattiva(db, { idDoc: a.id, codice: 'H3Z9K', patch: {} });
    esigi(senza.ok && !dati.has('codiciInvito/H3Z9K'), 'un codice sparito non rinasce vuoto (varrebbe ovunque)');
});

prova('Con l\'iscrizione parte l\'SMS "conferma la tua email", e la scheda entra nel giro automatico', async () => {
    const v = await verificaNumero('347 123 0001', 'sms2@studio.it');
    const prima = sms.length;
    const r = await iscrivi({ email: 'sms2@studio.it', telefono: '347 123 0001', smsToken: v.token });
    const nuovi = sms.slice(prima);
    esigi(r.stato === 200 && r.corpo.ok && nuovi.length === 1, 'iscritto, e parte un SMS solo', String(nuovi.length));
    const m = nuovi[0] || {};
    const t = String(m.content || '');
    esigi(m.tag === 'conferma-email' && m.recipient === '393471230001' && m.unicodeEnabled === false && m.sender === 'Revilaw',
        'con il tag suo, al numero verificato, dal mittente di sempre', JSON.stringify(Object.assign({}, m, { content: undefined })));
    const n = V.caratteriSms(t);
    esigi(n > 0 && n <= 306 && t.length <= 306, 'nell\'alfabeto GSM-7, in due SMS al massimo', String(n));
    esigi(!/[«»’‘“”–—…]/.test(t) && !/[ÀÈÉÌÒÙ]/.test(t), 'niente virgolette tipografiche, trattini lunghi o maiuscole accentate');
    esigi(/"Conferma il tuo indirizzo email"/.test(t) && /Spam\/Posta indesiderata/.test(t), 'dice quale pulsante premere e di guardare nello spam', t);
    esigi(t.indexOf('https://nextgenerationbusiness.it/contatti/?t=mail') > 0 && t.indexOf('inviata a sms2@studio.it') > 0,
        'con l\'indirizzo a cui e\' partita la mail e il modulo per chi non la riceve');
    esigi(!/#\d{6}/.test(t) && !/@nextgenerationbusiness\.it #/.test(t) && !/^\d{6}/.test(t), 'nessun codice e nessuna riga da incollare');
    const s = schedaDi('sms2@studio.it').s;
    esigi(s && s.smsConferma && s.smsConferma.ok === true && s.smsConferma.tipo === 'inviata' && s.smsConferma.id === '1',
        'sulla scheda: SMS partito', JSON.stringify(s && s.smsConferma));
    esigi(s && s.confermaInAttesa === true, 'la scheda ha la bandiera del giro automatico');
    esigi(s && s.mailConferma && s.mailConferma.ok === true && s.mailConferma.via === 'iscrizione' && s.mailConferma.a === 'sms2@studio.it',
        'e la traccia della mail: partita dall\'iscrizione, a quell\'indirizzo');
    esigi(spedite.length === 1 && spedite[0].replyTo === 'info@nextgenerationbusiness.it' && spedite[0].headers && spedite[0].headers['X-Mailin-Tag'] === 'conferma-iscrizione',
        'la mail ha "Rispondi" verso info@ e il tag per i log di Brevo');
    esigi(JSON.stringify(Object.keys(r.corpo).sort()) === '["azienda","ok","sms","smsTipo","stato"]' && r.corpo.sms === true && r.corpo.smsTipo === 'inviata',
        'la risposta al modulo dice anche che l\'SMS e\' partito, ed e\' quello della mail partita', JSON.stringify(r.corpo));
});

prova('Se la mail non parte: l\'SMS lo dice, la scheda e la pagina lo sanno', async () => {
    const v = await verificaNumero('3471230002', 'guasta@studio.it');
    const prima = sms.length;
    mailGuasta = 1;
    const errVero = console.error;
    const errori = [];
    console.error = (...x) => errori.push(x.join(' '));
    let r;
    try { r = await iscrivi({ email: 'guasta@studio.it', telefono: '3471230002', smsToken: v.token }); }
    finally { console.error = errVero; mailGuasta = 0; }
    esigi(r.stato === 200 && r.corpo.ok, 'l\'iscrizione passa lo stesso', JSON.stringify(r.corpo));
    const s = schedaDi('guasta@studio.it').s;
    esigi(s && s.mailConferma && s.mailConferma.ok === false && /casella inesistente/.test(s.mailConferma.errore), 'sulla scheda: mail non partita, con il motivo');
    const t = String((sms[prima] || {}).content || '');
    esigi(sms.length === prima + 1 && /non è ancora partita/.test(t) && /riproviamo in automatico/.test(t) && /Spam/.test(t)
        && t.indexOf('/contatti/?t=mail') > 0, 'l\'SMS dice che la mail non e\' ancora partita e che si riprova da soli', t);
    esigi(V.caratteriSms(t) > 0 && V.caratteriSms(t) <= 306, 'anche questo in due SMS al massimo, GSM-7');
    esigi(s && s.smsConferma && s.smsConferma.tipo === 'non-inviata' && s.confermaInAttesa === true, 'e la scheda resta nel giro automatico, che riprova');
    esigi(r.corpo.sms === true && r.corpo.smsTipo === 'non-inviata', 'la risposta al modulo: SMS partito, quello della mail non partita', JSON.stringify(r.corpo));
    const st = await chiama({ azione: 'stato-iscrizione', d: r.corpo.stato.d, t: r.corpo.stato.t });
    esigi(st.corpo.mail === 'errore', 'la pagina legge "errore"', JSON.stringify(st.corpo));
    esigi(st.corpo.attesaRimanda > 110 && st.corpo.attesaRimanda <= 120, 'e anche dopo un invio fallito il pulsante aspetta i due minuti dal tentativo', String(st.corpo.attesaRimanda));
    esigi(errori.some(x => /Mail di conferma \(iscrizione\) non inviata/.test(x)), 'e il log lo dice');
    /* chi preme "rimandala" dentro i due minuti: il messaggio non dice "ti
       abbiamo appena mandato la mail", perche' non e' partita */
    spedite = [];
    avanza(30 * 1000);
    const presto = await chiama({ azione: 'rimanda-conferma', d: r.corpo.stato.d, t: r.corpo.stato.t });
    esigi(presto.stato === 429 && /^Abbiamo appena provato a spedirti la mail e riproviamo in automatico: per chiederne un'altra aspetta \d+ secondi\.$/.test(presto.corpo.msg)
        && !/Ti abbiamo appena mandato/.test(presto.corpo.msg) && spedite.length === 0, 'premuto presto: "abbiamo appena provato... riproviamo in automatico"', presto.corpo.msg);
    const st2 = await chiama({ azione: 'stato-iscrizione', d: r.corpo.stato.d, t: r.corpo.stato.t });
    esigi(presto.corpo.attesa === st2.corpo.attesaRimanda && st2.corpo.attesaRimanda > 80 && st2.corpo.attesaRimanda <= 90,
        'e i secondi sono gli stessi che la pagina legge nello stato', presto.corpo.attesa + ' / ' + st2.corpo.attesaRimanda);
    avanza(91 * 1000);
    const st3 = await chiama({ azione: 'stato-iscrizione', d: r.corpo.stato.d, t: r.corpo.stato.t });
    const ora = await chiama({ azione: 'rimanda-conferma', d: r.corpo.stato.d, t: r.corpo.stato.t });
    esigi(st3.corpo.attesaRimanda === 0 && ora.stato === 200 && ora.corpo.inviata === true, 'a due minuti dal tentativo: 0, e il rinvio parte', JSON.stringify(ora.corpo));
});

prova('Se l\'SMS non parte, o il tetto del giorno e\' pieno, l\'iscrizione passa lo stesso', async () => {
    let v = await verificaNumero('3471230003', 'smsrotto@studio.it');
    smsGuasto = true;
    const errVero = console.error;
    console.error = () => { };
    let r;
    try { r = await iscrivi({ email: 'smsrotto@studio.it', telefono: '3471230003', smsToken: v.token }); }
    finally { console.error = errVero; smsGuasto = false; }
    let s = schedaDi('smsrotto@studio.it').s;
    esigi(r.stato === 200 && r.corpo.ok && s && s.mailConferma.ok === true, 'iscritto, con la mail partita', JSON.stringify(r.corpo));
    esigi(s && s.smsConferma && s.smsConferma.ok === false && /402/.test(s.smsConferma.errore) && !/347/.test(s.smsConferma.errore),
        'sulla scheda: SMS non partito, con il motivo e senza il numero', JSON.stringify(s && s.smsConferma));
    esigi(r.corpo.sms === false && r.corpo.smsTipo === 'inviata', 'e la pagina lo sa: niente "ti abbiamo mandato anche un SMS"', JSON.stringify(r.corpo));

    v = await verificaNumero('3471230004', 'tetto@studio.it');
    const conto = dati.get('meta/smsVerifica') || {};
    process.env.SMS_MAX_GIORNO = String(conto.inviati);
    const prima = sms.length;
    console.error = () => { };
    try { r = await iscrivi({ email: 'tetto@studio.it', telefono: '3471230004', smsToken: v.token }); }
    finally { console.error = errVero; delete process.env.SMS_MAX_GIORNO; }
    s = schedaDi('tetto@studio.it').s;
    esigi(r.corpo.ok && sms.length === prima && r.corpo.sms === false, 'tetto del giorno pieno: iscritto, nessun SMS speso, e la risposta lo dice', JSON.stringify(r.corpo));
    esigi(s && s.smsConferma && s.smsConferma.ok === false && /tetto/.test(s.smsConferma.errore), 'e la scheda lo dice');
});

prova('"Non e\' arrivata? Rimandala": firmata, due minuti fra un invio e l\'altro, cinque al giorno', async () => {
    const NL = require(path.join(RADICE, 'lib/newsletter.js'));
    const v = await verificaNumero('3401010101', 'rimanda@studio.it');
    const r = await iscrivi({ email: 'rimanda@studio.it', telefono: '3401010101', smsToken: v.token });
    const st = r.corpo.stato;
    const rimanda = () => chiama({ azione: 'rimanda-conferma', d: st.d, t: st.t });
    const falsa = await chiama({ azione: 'rimanda-conferma', d: st.d, t: 'x' + st.t.slice(1) });
    esigi(falsa.stato === 403 && !falsa.corpo.msg, 'firma sbagliata: 403, e nient\'altro');
    const altra = await chiama({ azione: 'rimanda-conferma', d: st.d, t: NL.firmaConfermaEmail(st.d) });
    esigi(altra.stato === 403, 'la firma del pulsante di conferma non vale qui');
    spedite = [];
    const subito = await rimanda();
    esigi(subito.stato === 429 && subito.corpo.attesa > 0 && subito.corpo.attesa <= 120 && /^Ti abbiamo appena mandato la mail/.test(subito.corpo.msg)
        && /Spam/.test(subito.corpo.msg) && spedite.length === 0,
        'appena iscritto: aspetta i due minuti dalla mail dell\'iscrizione (partita: "ti abbiamo appena mandato")', JSON.stringify(subito.corpo));
    const statoSubito = await chiama({ azione: 'stato-iscrizione', d: st.d, t: st.t });
    esigi(statoSubito.corpo.attesaRimanda === subito.corpo.attesa, 'lo stato dice gli stessi secondi', statoSubito.corpo.attesaRimanda + ' / ' + subito.corpo.attesa);
    avanza(121 * 1000);
    esigi((await chiama({ azione: 'stato-iscrizione', d: st.d, t: st.t })).corpo.attesaRimanda === 0, 'passati i due minuti lo stato dice 0');
    const uno = await rimanda();
    esigi(uno.stato === 200 && uno.corpo.ok && uno.corpo.inviata === true && uno.corpo.a === 'rimanda@studio.it', 'dopo due minuti riparte, e la risposta dice a quale indirizzo', JSON.stringify(uno.corpo));
    esigi(spedite.length === 1 && spedite[0].to === 'rimanda@studio.it' && /Richiesta di conferma/.test(spedite[0].subject), 'ed e\' la mail con il pulsante');
    let s = schedaDi('rimanda@studio.it').s;
    esigi(s.mailConferma.via === 'rimanda' && s.invioConferma.tentativi === 2 && s.rimandaConferma.invii.length === 1, 'sulla scheda: rimandata, secondo invio');
    const ancora = await rimanda();
    esigi(ancora.stato === 429 && ancora.corpo.attesa > 100 && spedite.length === 1, 'subito dopo no: due minuti fra un invio e l\'altro');
    for (let i = 0; i < 4; i++) { avanza(121 * 1000); await rimanda(); }
    esigi(spedite.length === 5, 'cinque rinvii in tutto', String(spedite.length));
    avanza(121 * 1000);
    const sesta = await rimanda();
    esigi(sesta.stato === 429 && sesta.corpo.attesa > 0 && /più volte/.test(sesta.corpo.msg) && sesta.corpo.msg.indexOf('/contatti/?t=mail') > 0 && spedite.length === 5,
        'il sesto nello stesso giorno no: dice quanto aspettare e dove scriverci', JSON.stringify(sesta.corpo));
    const statoTetto = await chiama({ azione: 'stato-iscrizione', d: st.d, t: st.t });
    esigi(statoTetto.corpo.attesaRimanda === sesta.corpo.attesa && statoTetto.corpo.attesaRimanda > 20 * 60 * 60,
        'e lo stato conta anche il tetto del giorno: i secondi fino al primo rinvio che scade', statoTetto.corpo.attesaRimanda + ' / ' + sesta.corpo.attesa);
    avanza(24 * 60 * 60 * 1000);
    const domani = await rimanda();
    esigi(domani.corpo.ok && spedite.length === 6, 'il giorno dopo si\'', JSON.stringify(domani.corpo));
    await chiama({ azione: 'conferma-email', d: st.d, t: NL.firmaConfermaEmail(st.d) });
    avanza(121 * 1000);
    spedite = [];
    const conf = await rimanda();
    esigi(conf.corpo.ok === false && conf.corpo.confermata === true && spedite.length === 0, 'a chi ha confermato non riparte niente', JSON.stringify(conf.corpo));
    s = schedaDi('rimanda@studio.it').s;
    esigi(!('confermaInAttesa' in s), 'e la bandiera del giro automatico non c\'e\' piu\'');
    const ign = await chiama({ azione: 'rimanda-conferma', d: 'non-esiste', t: NL.firmaStato('non-esiste') });
    esigi(ign.stato === 404, 'una scheda che non c\'e\': 404');
});

prova('Chi si riscrive mentre la sua iscrizione aspetta la conferma: dove cercare la mail, e la mail riparte', async () => {
    const v1 = await verificaNumero('3402020202', 'riscrive@studio.it');
    const r1 = await iscrivi({ email: 'riscrive@studio.it', telefono: '3402020202', smsToken: v1.token });
    esigi(r1.corpo.ok, 'la prima iscrizione passa');
    sms = [];
    const pre = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3402020303', email: 'Riscrive@studio.it' });
    esigi(pre.stato === 409 && pre.corpo.campo === 'email' && /non è ancora confermato/.test(pre.corpo.msg) && /Spam/.test(pre.corpo.msg)
        && pre.corpo.msg.indexOf('https://nextgenerationbusiness.it/contatti/?t=mail') > 0 && !/rimandato/.test(pre.corpo.msg) && sms.length === 0,
        'gia\' alla richiesta dell\'SMS: manca la conferma, dove cercare, dove scrivere (e niente SMS speso)', pre.corpo.msg);
    const v2 = await verificaNumero('3402020303', 'per-il-codice@studio.it');
    avanza(2 * 60 * 1000);   // i due minuti dalla mail dell'iscrizione
    const r2 = await iscrivi({ email: 'riscrive@studio.it', telefono: '3402020303', smsToken: v2.token });
    esigi(r2.stato === 409 && r2.corpo.campo === 'email' && /ti abbiamo appena rimandato la mail di conferma/.test(r2.corpo.msg),
        'riscrivendosi con il numero verificato: la mail riparte, e il messaggio lo dice', r2.corpo.msg);
    esigi(spedite.length === 1 && spedite[0].to === 'riscrive@studio.it' && /Richiesta di conferma/.test(spedite[0].subject), 'all\'indirizzo dell\'iscrizione');
    const r3 = await iscrivi({ email: 'diverso@studio.it', telefono: '3402020202', smsToken: v1.token });
    esigi(r3.stato === 409 && r3.corpo.campo === 'telefono' && /numero di cellulare/.test(r3.corpo.msg) && /non è ancora confermato/.test(r3.corpo.msg)
        && r3.corpo.msg.indexOf('riscrive@') < 0, 'con lo stesso numero: lo stesso aiuto, senza l\'indirizzo dell\'altra iscrizione', r3.corpo.msg);
    esigi(spedite.length === 0 && !/rimandato/.test(r3.corpo.msg), 'appena rimandata: non riparte una seconda volta');
    // chi ha confermato: il messaggio di sempre
    const conf = await chiama({ azione: 'sms-invia', pagina: PAGINA, telefono: '3402020404', email: 'stato@studio.it' });
    esigi(conf.stato === 409 && conf.corpo.msg === V.MSG.email, 'a un indirizzo gia\' confermato il messaggio di sempre', conf.corpo.msg);
});

prova('Napoli resta com\'era', async () => {
    const smsPrima = sms.length;
    const r = await chiama({
        pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', nome: 'Ada', cognome: 'Neri',
        email: 'ada@studio.it', telefono: '06 1234567', privacy: true, marketing: true
    });
    esigi(r.corpo.ok, 'senza SMS e con un fisso', JSON.stringify(r.corpo));
    esigi(JSON.stringify(r.corpo) === '{"ok":true}', 'e la risposta e\' quella di sempre, senza stato ne\' azienda', JSON.stringify(r.corpo));
    const r2 = await chiama({
        pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', nome: 'Ada', cognome: 'Neri',
        email: 'ada@studio.it', privacy: true, marketing: true, data: '01/01/2026 10:00:00'
    });
    esigi(r2.corpo.ok, 'e senza la regola dell\'email unica');
    esigi(sms.length === smsPrima, 'nessun SMS "conferma la tua email" per Napoli');
    const napoli = schede().filter(x => x.email === 'ada@studio.it');
    esigi(napoli.length && napoli.every(x => !('confermaInAttesa' in x) && x.mailConferma && x.mailConferma.ok === true),
        'ne\' la bandiera del giro automatico (la mail parte come prima)');
    const sbagliato = await chiama({ azione: 'sms-invia', pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', telefono: '3331234567' });
    esigi(sbagliato.stato === 400, 'e l\'SMS per Napoli non parte');
});

(async () => {
    for (const p of prove) { console.log('\n' + p.titolo); await p.fn(); }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
