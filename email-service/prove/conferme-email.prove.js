/* ============================================================
   PROVE - api/conferme-email.js e lib/giro-conferme.js
   ------------------------------------------------------------
       node prove/conferme-email.prove.js

   Niente da installare: Firestore, la posta e Brevo sono finti e
   stanno qui dentro, e l'orologio lo muovono le prove. Esce con 1 se
   qualcosa e' rosso.

   COSA DIMOSTRANO. Il giro automatico delle mail di conferma (Milano
   2027) deve riparare da solo i tre guasti, e non disturbare nessuno
   oltre:
     - senza CRON_SECRET, o con il segreto sbagliato, non parte niente;
     - una mail MAI PARTITA (la funzione si e' chiusa prima) parte
       dopo cinque minuti dall'iscrizione, con il suo SMS, e non prima;
     - una mail NON PARTITA si riprova dopo 5 minuti, 30 minuti, 2 ore
       e 12 ore: cinque tentativi in tutto, poi la scheda esce dal giro;
     - una mail PARTITA e non cliccata riceve a UN'ORA il sollecito
       personale di Andrea Missori: solo testo, dal suo indirizzo, con
       "Rispondi" verso di lui, senza collegamenti, personalizzato (nome,
       azienda, in sala o online); una volta; di giorno; se la posta dice
       no si riprova dopo mezz'ora, tre volte; spento non parte; chi
       conferma prima non lo riceve;
     - e dopo un giorno UN promemoria, mail ("Promemoria:" nell'oggetto)
       e SMS, e mai un secondo, nemmeno se la bandiera tornasse;
     - una scheda confermata, annullata, inserita a mano, importata,
       arrivata da un portale o di un evento che non chiede la conferma
       esce dal giro senza che parta niente;
     - le iscrizioni di prima della bandiera si recuperano, una volta;
     - un giro alla volta: due giri insieme spediscono una volta sola, e
       il lucchetto di un giro morto scade da solo;
     - la scheda si rilegge prima di lavorarla: una cancellata nel
       frattempo non rinasce, una confermata non riceve niente;
     - chi e' segnato "presente" e, a evento finito, tutti escono dal
       giro senza mail ne' SMS;
     - il promemoria parte solo dalle 8 alle 21 ora di Milano;
     - prima i guasti: una mail da riprovare in fondo alla fila parte
       prima dei promemoria, e il limite delle schede lette si vede.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- orologio ----------
const INIZIO = Date.parse('2027-01-15T10:00:00+01:00');
let orologio = INIZIO;
const DateVera = Date;
global.Date = class extends DateVera {
    constructor(...a) { if (a.length) super(...a); else super(orologio); }
    static now() { return orologio; }
};
function avanza(ms) { orologio += ms; }
const MIN = 60 * 1000, ORA = 60 * MIN, GIORNO = 24 * ORA;

// ---------- Firestore finto (transazioni, lotti, ricerche per uguaglianza) ----------
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
        get: async () => {
            const s = istantanea(chiave, self);
            // quello che succede subito dopo questa lettura (una prova lo mette, e vale una volta)
            if (alLeggere[chiave]) { const f = alLeggere[chiave]; delete alLeggere[chiave]; await f(); }
            return s;
        },
        set: async (patch, opz) => { dati.set(chiave, applica(dati.get(chiave), patch, !!(opz && opz.merge))); },
        // come Firestore: su un documento che non c'e' update fallisce (NOT_FOUND, codice 5) e non lo crea
        update: async (patch) => {
            if (!dati.has(chiave)) { const e = new Error('5 NOT_FOUND: No document to update: ' + chiave); e.code = 5; throw e; }
            // una scrittura che non riesce (una prova lo mette, e vale una volta): Firestore giu' per un attimo
            if (rompiUpdate[chiave]) { delete rompiUpdate[chiave]; const e = new Error('14 UNAVAILABLE'); e.code = 14; throw e; }
            dati.set(chiave, applica(dati.get(chiave), patch, true));
        }
    };
    return self;
}
/* Un momento fra la ricerca e il lavoro sulla scheda: le prove ci mettono
   quello che succede nel frattempo (una cancellazione, una conferma). */
let fraRicercaELavoro = null;
let alLeggere = {};
let rompiUpdate = {};
let letture = 0;
function interroga(coll, filtri, max) {
    return {
        where(campo, op, val) { return interroga(coll, filtri.concat([[campo, val]]), max); },
        limit(n) { return interroga(coll, filtri, n); },
        async get() {
            letture++;
            // in ordine di nome, come Firestore senza orderBy
            const docs = [...dati.keys()].filter(k => k.startsWith(coll + '/') && k.split('/').length === 2)
                .filter(k => filtri.every(([c, v]) => (dati.get(k) || {})[c] === v))
                .sort()
                .slice(0, max || 1e9)
                .map(k => istantanea(k, doc(coll, k.split('/')[1])));
            if (coll === 'iscrizioni' && filtri.length && fraRicercaELavoro) { const f = fraRicercaELavoro; fraRicercaELavoro = null; await f(); }
            return { docs: docs, forEach: f => docs.forEach(f), size: docs.length };
        }
    };
}
/* Le transazioni una alla volta, come le vede chi le usa in Firestore: due
   giri che prendono il lucchetto insieme non lo prendono tutti e due. */
let codaTransazioni = Promise.resolve();
const db = {
    collection(coll) { return Object.assign(interroga(coll, [], 0), { doc: id => doc(coll, id) }); },
    batch() {
        const op = [];
        return { set: (r, patch, opz) => op.push(() => r.set(patch, opz)), commit: async () => { for (const f of op) await f(); } };
    },
    runTransaction(fn) {
        const giro = codaTransazioni.then(async () => {
            const scritture = [];
            const esito = await fn({ get: async r => r.get(), set: (r, patch, opz) => { scritture.push([r, patch, opz]); } });
            for (const [r, patch, opz] of scritture) await r.set(patch, opz);
            return esito;
        });
        codaTransazioni = giro.catch(() => { });
        return giro;
    }
};
const admin = {
    initializeApp() { }, credential: { cert: () => ({}) }, apps: [],
    firestore: () => db
};
admin.firestore.FieldValue = { delete: () => ({ __del: true }), increment: n => ({ __inc: n }), serverTimestamp: () => orologio };

// ---------- posta e SMS finti ----------
let spedite = [];
let mailGuasta = 0;
let chiamateSmtp = 0;
// quanto dura una mail, sull'orologio delle prove (di norma niente)
let passoMail = 0;
// l'errore del server finto: di norma uno che non passa
let erroreMail = () => new Error('550 casella inesistente');
let durantePosta = null;
let sms = [];
// i mittenti e i domini che Brevo dice di avere (il sollecito personale li chiede prima di spedire)
let mittentiBrevo = [{ email: 'andreamissori@revilaw.it', name: 'Andrea Missori', active: true }];
let dominiBrevo = [];
let chiamateBrevo = 0;
let brevoGiu = false;
global.fetch = async (url, opz) => {
    if (/transactionalSMS/.test(String(url))) {
        sms.push(JSON.parse(opz.body));
        return { ok: true, status: 201, text: async () => '{"messageId":42}' };
    }
    if (/\/v3\/senders\/domains/.test(String(url))) {
        chiamateBrevo++;
        if (brevoGiu) throw new Error('fetch failed');
        return { ok: true, status: 200, text: async () => JSON.stringify({ domains: dominiBrevo }) };
    }
    if (/\/v3\/senders/.test(String(url))) {
        chiamateBrevo++;
        if (brevoGiu) throw new Error('fetch failed');
        return { ok: true, status: 200, text: async () => JSON.stringify({ senders: mittentiBrevo }) };
    }
    throw new Error('rete non prevista: ' + url);
};
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return { createTransport: () => ({ sendMail: async m => {
        chiamateSmtp++;
        // quello che succede mentre la mail sta partendo (una prova lo mette, e vale una volta)
        if (durantePosta) { const f = durantePosta; durantePosta = null; await f(); }
        orologio += passoMail;
        if (mailGuasta > 0) { mailGuasta--; throw erroreMail(); }
        spedite.push(m); return {};
    } }) };
    return veroRequire.apply(this, arguments);
};
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ client_email: 'servizio@esempio.iam.gserviceaccount.com', private_key: 'chiave-finta' });
process.env.SMTP_FROM_EMAIL = 'noreply@esempio.it';
process.env.BREVO_API_KEY = 'chiave-brevo-finta';
process.env.CRON_SECRET = 'segreto-cron';

const RADICE = path.join(__dirname, '..');
const cron = require(path.join(RADICE, 'api/conferme-email.js'));
const GIRO = require(path.join(RADICE, 'lib/giro-conferme.js'));
const V = require(path.join(RADICE, 'lib/iscrizione-verificata.js'));
const CONF = require(path.join(RADICE, 'lib/conferma-email.js'));
const SOLL = require(path.join(RADICE, 'lib/sollecito-conferma.js'));

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
async function giro(intestazioni) {
    let stato = 0, risposta = null;
    const res = { status(s) { stato = s; return res; }, json(c) { risposta = c; return res; } };
    const errVero = console.error, logVero = console.log, avvVero = console.warn;
    console.error = () => { }; console.log = () => { }; console.warn = () => { };
    try {
        await cron({ method: 'GET', headers: intestazioni === undefined ? { authorization: 'Bearer segreto-cron' } : intestazioni, query: {} }, res);
    } finally { console.error = errVero; console.log = logVero; console.warn = avvVero; }
    return { stato: stato, corpo: risposta || {} };
}
// la stessa cosa senza l'endpoint: per i giri che si sovrappongono
async function zitti(fn) {
    const errVero = console.error, logVero = console.log, avvVero = console.warn;
    console.error = () => { }; console.log = () => { }; console.warn = () => { };
    try { return await fn(); } finally { console.error = errVero; console.log = logVero; console.warn = avvVero; }
}
const MILANO = 'Milano 26 Febbraio 2027 - Iscrizione';
/* Una scheda con la mail gia' partita ha, salvo che la prova dica
   altrimenti, anche il sollecito personale gia' partito: le prove del
   promemoria del giorno dopo guardano quello, non il sollecito (che ha la
   sua prova, e passa `sollecitoConferma: undefined`). */
function iscritto(id, campi) {
    campi = campi || {};
    const m = campi.mailConferma;
    const sollecito = m && m.ok === true && !('sollecitoConferma' in campi)
        ? { sollecitoConferma: { quando: Number(m.quando) || orologio, ok: true, tentativi: 1, a: id + '@studio.it' } } : {};
    dati.set('iscrizioni/' + id, Object.assign({
        pagina: MILANO, data: '15/01/2027 10:00:00', nome: 'Pia', cognome: id, email: id + '@studio.it',
        telefono: '+39 333 000 0000', telefonoNumero: '+393330000000', telefonoVerificato: { quando: 1, come: 'sms' },
        ricevuto: orologio, confermaInAttesa: true
    }, sollecito, campi));
}
function scheda(id) { return dati.get('iscrizioni/' + id) || {}; }
function azzera() {
    dati.clear(); spedite = []; sms = []; mailGuasta = 0; chiamateSmtp = 0; orologio = INIZIO; fraRicercaELavoro = null; alLeggere = {}; rompiUpdate = {}; passoMail = 0; durantePosta = null;
    mittentiBrevo = [{ email: 'andreamissori@revilaw.it', name: 'Andrea Missori', active: true }]; dominiBrevo = []; chiamateBrevo = 0; brevoGiu = false; SOLL.azzeraVerifica();
    erroreMail = () => new Error('550 casella inesistente');
    // i recuperi una tantum (la bandiera, il sollecito agli arretrati) li provano le loro prove: qui risultano gia' fatti
    dati.set('meta/confermeEmail', { recupero: 1, sollecitoArretrati: 1 });
}

const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

prova('Solo con il segreto giusto', async () => {
    azzera();
    iscritto('mai', { ricevuto: orologio - GIORNO });
    const senza = await giro({});
    const sbagliato = await giro({ authorization: 'Bearer altro' });
    esigi(senza.stato === 401 && sbagliato.stato === 401 && spedite.length === 0, 'senza intestazione o con il segreto sbagliato: 401, e niente parte');
    const segreto = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    const vuoto = await giro({ authorization: 'Bearer undefined' });
    process.env.CRON_SECRET = segreto;
    esigi(vuoto.stato === 401 && spedite.length === 0, 'senza CRON_SECRET non parte nessuno, nemmeno con "Bearer undefined"');
    const buono = await giro();
    esigi(buono.stato === 200 && buono.corpo.ok === true, 'con il segreto giusto il giro lavora', JSON.stringify(buono.corpo));
});

prova('Mai partita: dopo cinque minuti dall\'iscrizione parte, con il suo SMS', async () => {
    azzera();
    iscritto('mai', { ricevuto: orologio - 2 * MIN });
    let r = await giro();
    esigi(spedite.length === 0 && r.corpo.aspettano === 1, 'a due minuti dall\'iscrizione aspetta (il modulo potrebbe star spedendo)');
    avanza(3 * MIN);
    r = await giro();
    const s = scheda('mai');
    esigi(spedite.length === 1 && spedite[0].to === 'mai@studio.it' && /^Richiesta di conferma/.test(spedite[0].subject) && r.corpo.inviate === 1,
        'a cinque minuti parte la mail con il pulsante', JSON.stringify(r.corpo));
    esigi(s.mailConferma && s.mailConferma.ok === true && s.mailConferma.via === 'automatico' && s.confermaInAttesa === true,
        'sulla scheda: partita dal giro, che la tiene per il promemoria');
    esigi(sms.length === 1 && sms[0].tag === 'conferma-email' && /inviata a mai@studio\.it/.test(sms[0].content), 'e l\'SMS che non era partito con lei');
    await giro();
    esigi(spedite.length === 1 && sms.length === 1, 'al giro dopo non riparte niente');
    // una scheda con il momento di Firestore (Timestamp)
    esigi(GIRO.cosaFare(Object.assign({}, scheda('mai'), { mailConferma: undefined, ricevuto: { toMillis: () => orologio - MIN } }), orologio).fare === 'aspetta'
        && GIRO.registrataIl({ ricevuto: { _seconds: 100 } }) === 100000, 'il momento dell\'iscrizione si legge anche dal Timestamp di Firestore');
});

prova('Non partita: si riprova dopo 5 minuti, 30 minuti, 2 ore e 12 ore, poi basta', async () => {
    azzera();
    const t0 = orologio;
    iscritto('rotta', {
        ricevuto: t0, mailConferma: { quando: t0, ok: false, errore: 'tempo scaduto', via: 'iscrizione', a: 'rotta@studio.it' },
        invioConferma: { a: 'rotta@studio.it', tentativi: 1, falliti: 1, ultimo: t0 }, smsConferma: { quando: t0, ok: true, tipo: 'non-inviata' }
    });
    let tentativi = 0;
    const passi = [[4 * MIN, false], [MIN, true], [29 * MIN, false], [MIN, true], [119 * MIN, false], [MIN, true], [11 * ORA + 59 * MIN, false], [MIN, true]];
    let giusto = true;
    for (const [passo, atteso] of passi) {
        avanza(passo);
        mailGuasta = 1;
        const prima = scheda('rotta').invioConferma.tentativi;
        await giro();
        const partito = scheda('rotta').invioConferma.tentativi > prima;
        if (partito) tentativi++;
        if (partito !== atteso) giusto = false;
    }
    mailGuasta = 0;
    const s = scheda('rotta');
    esigi(giusto && tentativi === 4, 'riprovata esattamente dopo 5 min, 30 min, 2 ore e 12 ore', String(tentativi));
    esigi(s.invioConferma.tentativi === 5 && s.invioConferma.falliti === 5 && s.mailConferma.ok === false && s.mailConferma.via === 'automatico',
        'cinque tentativi in tutto, tutti falliti', JSON.stringify(s.invioConferma));
    esigi(sms.length === 0, 'nessun SMS in piu\': quello della mail non partita c\'era gia\'');
    avanza(GIORNO);
    const r = await giro();
    esigi(!('confermaInAttesa' in scheda('rotta')) && r.corpo.tolte === 1 && scheda('rotta').invioConferma.tentativi === 5,
        'finiti i tentativi la scheda esce dal giro (resta allo staff: "mail non inviata")');
    // e se un tentativo riesce, dopo si aspetta il promemoria
    azzera();
    iscritto('ripresa', { ricevuto: orologio, mailConferma: { quando: orologio, ok: false, errore: 'x', a: 'ripresa@studio.it' },
        invioConferma: { a: 'ripresa@studio.it', tentativi: 1, falliti: 1, ultimo: orologio } });
    avanza(5 * MIN);
    await giro();
    esigi(scheda('ripresa').mailConferma.ok === true && scheda('ripresa').invioConferma.falliti === 0 && scheda('ripresa').confermaInAttesa === true,
        'riprovata e partita: i fallimenti si azzerano, e la scheda resta per il promemoria');
    // un errore che passa (tempo scaduto): il giro non fa il secondo tentativo subito, riprova lui
    azzera();
    iscritto('lento', { ricevuto: orologio - 10 * MIN });
    erroreMail = () => Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' });
    mailGuasta = 1;
    await giro();
    esigi(chiamateSmtp === 1 && scheda('lento').mailConferma.ok === false && scheda('lento').invioConferma.falliti === 1,
        'tempo scaduto nel giro: un tentativo solo, e la pausa di cinque minuti', String(chiamateSmtp));
    // una scheda di prima del conto, con la sola mailConferma fallita
    azzera();
    iscritto('vecchia', { ricevuto: orologio - 3 * GIORNO, mailConferma: { quando: orologio - 3 * GIORNO, ok: false, errore: 'x' } });
    await giro();
    esigi(spedite.length === 1 && scheda('vecchia').invioConferma.tentativi === 2, 'una scheda di prima del conto: il fallimento vecchio conta come primo tentativo');
});

prova('Partita e non cliccata: a un\'ora il sollecito personale, solo testo', async () => {
    azzera();
    const t0 = orologio;
    const partita = id => ({ ricevuto: t0, mailConferma: { quando: t0, ok: true, errore: '', via: 'iscrizione', a: id + '@studio.it' },
        invioConferma: { a: id + '@studio.it', tentativi: 1, falliti: 0, ultimo: t0 }, smsConferma: { quando: t0, ok: true, tipo: 'inviata' }, sollecitoConferma: undefined });
    iscritto('luca', Object.assign(partita('luca'), { nome: 'Luca', cognome: 'Mereghetti', azienda: 'Aresys S.r.l.' }));
    avanza(59 * MIN);
    await giro();
    esigi(spedite.length === 0, 'a 59 minuti: niente');
    avanza(MIN);
    let r = await giro();
    const m = spedite[0] || {};
    esigi(spedite.length === 1 && r.corpo.solleciti === 1 && m.to === 'luca@studio.it', 'a un\'ora: la mail del sollecito', JSON.stringify(r.corpo));
    esigi(m.from === '"Andrea Missori - Revilaw" <andreamissori@revilaw.it>' && m.replyTo === 'andreamissori@revilaw.it', 'dal suo indirizzo, e "Rispondi" torna a lui', m.from);
    esigi(!m.html && typeof m.text === 'string' && !/https?:\/\/|<a |www\./.test(m.text) && !m.list && !(m.headers || {})['List-Unsubscribe'],
        'solo testo: niente HTML, niente collegamenti, niente intestazioni da invio di massa');
    esigi(m.subject === 'Next Generation Business Milano, 26 febbraio 2027 – conferma della sua iscrizione', 'l\'oggetto', m.subject);
    esigi(/^Gentile Luca Mereghetti,\n/.test(m.text) && /La richiesta per Aresys S\.r\.l\. risulta registrata, ma l'iscrizione non è ancora completa/.test(m.text)
        && /una mail da noreply@esempio\.it con il pulsante «Conferma il tuo indirizzo email»/.test(m.text)
        && /posta indesiderata \(spam\) o nelle cartelle Promozioni e Aggiornamenti/.test(m.text)
        && /riceverà l'invito personale in PDF da presentare all'accreditamento/.test(m.text)
        && /mi risponda pure a questa email/.test(m.text) && /\n\nAndrea Missori\nEquity Partner e Procuratore di Revilaw S\.p\.A\.\n/.test(m.text)
        && /venerdì 26 febbraio 2027 presso l'Excelsior Hotel Gallia/.test(m.text),
        'personalizzata: nome, azienda, la mail da cercare, l\'invito in PDF, la firma', m.text);
    esigi((m.headers || {})['X-Mailin-Tag'] === 'sollecito-conferma', 'con il tag per i log di Brevo');
    let sc = scheda('luca');
    esigi(sc.sollecitoConferma && sc.sollecitoConferma.ok === true && sc.sollecitoConferma.tentativi === 1 && sc.sollecitoConferma.a === 'luca@studio.it'
        && sc.confermaInAttesa === true && sms.length === 0, 'sulla scheda il segno; resta nel giro per il promemoria; niente SMS', JSON.stringify(sc.sollecitoConferma));
    avanza(ORA);
    await giro();
    esigi(spedite.length === 1, 'un\'ora dopo: non si ripete');
    avanza(22 * ORA);
    await giro();
    esigi(spedite.length === 2 && /^Promemoria:/.test(spedite[1].subject) && sms.length === 1, 'e a un giorno il promemoria di sempre, con l\'SMS');

    // online, senza azienda: quello che arriva dopo il clic e' il collegamento
    azzera();
    iscritto('online', Object.assign(partita('online'), { nome: 'Ada', cognome: 'Rossi', azienda: '', modalita: 'online' }));
    avanza(ORA);
    await giro();
    esigi(spedite.length === 1 && /La sua richiesta risulta registrata/.test(spedite[0].text) && /le istruzioni per seguire i lavori online le arriveranno con un'email a parte/.test(spedite[0].text)
        && !/invito personale in PDF/.test(spedite[0].text) && !/collegamento/.test(spedite[0].text), 'online e senza azienda: il testo lo sa, e non promette un collegamento che non c\'e\'', spedite[0] && spedite[0].text.slice(0, 400));

    // di notte aspetta: la mail parte alle 23, il sollecito alle 8
    azzera();
    orologio = DateVera.parse('2027-01-15T23:00:00+01:00');
    iscritto('notte', partita('notte'));
    dati.set('iscrizioni/notte', Object.assign({}, scheda('notte'), { ricevuto: orologio, mailConferma: Object.assign({}, scheda('notte').mailConferma, { quando: orologio }) }));
    avanza(ORA);
    await giro();
    esigi(spedite.length === 0 && GIRO.cosaFare(scheda('notte'), orologio).perche === 'notte', 'a mezzanotte aspetta');
    avanza(7 * ORA + 59 * MIN);
    await giro();
    esigi(spedite.length === 0, 'alle 7:59 ancora niente');
    avanza(MIN);
    await giro();
    esigi(spedite.length === 1 && spedite[0].to === 'notte@studio.it', 'alle 8 parte');

    // la posta dice no: si riprova dopo mezz'ora, tre volte, poi resta il promemoria
    azzera();
    erroreMail = () => Object.assign(new Error('550 casella inesistente'), { responseCode: 550 });
    iscritto('giu', partita('giu'));
    avanza(ORA);
    mailGuasta = 1;
    r = await giro();
    sc = scheda('giu');
    esigi(spedite.length === 0 && r.corpo.solleciti === 1 && r.corpo.errori === 1 && sc.sollecitoConferma.ok === false && sc.sollecitoConferma.incerto === false && sc.sollecitoConferma.tentativi === 1 && /550/.test(sc.sollecitoConferma.errore),
        'la posta dice no (con il suo codice): resta il tentativo con l\'errore', JSON.stringify(sc.sollecitoConferma));
    avanza(10 * MIN);
    await giro();
    esigi(chiamateSmtp === 1, 'dieci minuti dopo non si riprova ancora');
    avanza(20 * MIN);
    mailGuasta = 1;
    await giro();
    esigi(chiamateSmtp === 2 && scheda('giu').sollecitoConferma.tentativi === 2, 'a mezz\'ora si riprova');
    avanza(30 * MIN);
    mailGuasta = 1;
    await giro();
    esigi(chiamateSmtp === 3 && scheda('giu').sollecitoConferma.tentativi === 3 && scheda('giu').sollecitoConferma.ok === false, 'il terzo no');
    avanza(30 * MIN);
    await giro();
    esigi(chiamateSmtp === 3 && spedite.length === 0 && scheda('giu').confermaInAttesa === true, 'poi basta: la scheda resta nel giro');
    avanza(22 * ORA);
    await giro();
    esigi(spedite.length === 1 && /^Promemoria:/.test(spedite[0].subject), 'e il promemoria del giorno dopo parte lo stesso');

    // la posta non risponde (tempo scaduto, senza un codice): esito incerto, e non si riprova
    azzera();
    erroreMail = () => Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT', command: 'CONN' });
    iscritto('muto', partita('muto'));
    avanza(ORA);
    mailGuasta = 1;
    r = await giro();
    sc = scheda('muto');
    esigi(r.corpo.solleciti === 1 && r.corpo.errori === 1 && sc.sollecitoConferma.ok === false && sc.sollecitoConferma.incerto === true && /timeout/i.test(sc.sollecitoConferma.errore),
        'la posta non risponde: esito incerto', JSON.stringify(sc.sollecitoConferma));
    avanza(ORA);
    await giro();
    esigi(chiamateSmtp === 1 && spedite.length === 0, 'e non si riprova: meglio una lettera in meno che due uguali');
    avanza(22 * ORA);
    await giro();
    esigi(spedite.length === 1 && /^Promemoria:/.test(spedite[0].subject), 'il promemoria del giorno dopo arriva lo stesso');

    // la mail e' partita ma la traccia non si e' scritta (Firestore giu' un attimo): non si rimanda
    azzera();
    iscritto('traccia', partita('traccia'));
    avanza(ORA);
    rompiUpdate['iscrizioni/traccia'] = true;
    r = await giro();
    sc = scheda('traccia');
    esigi(spedite.length === 1 && r.corpo.solleciti === 1 && sc.sollecitoConferma.incerto === true && sc.sollecitoConferma.errore === 'in corso' && sc.sollecitoConferma.tentativi === 1,
        'partita, traccia non scritta: resta la presa, "in corso" e incerta', JSON.stringify(sc.sollecitoConferma));
    avanza(ORA);
    await giro();
    esigi(spedite.length === 1, 'un\'ora dopo non riparte: la stessa lettera due volte sarebbe peggio');
    avanza(22 * ORA);
    await giro();
    esigi(spedite.length === 2 && /^Promemoria:/.test(spedite[1].subject), 'e il promemoria arriva');

    // una scheda vecchia (il rilascio, un recupero): a ventidue ore e oltre tocca al promemoria, non a tutti e due
    azzera();
    const partitaDa = (id, ore) => Object.assign(partita(id), { ricevuto: orologio - ore * ORA, mailConferma: { quando: orologio - ore * ORA, ok: true, errore: '', via: 'iscrizione', a: id + '@studio.it' } });
    iscritto('vecchia', partitaDa('vecchia', 23));
    iscritto('vecchissima', partitaDa('vecchissima', 48));
    iscritto('recente', partitaDa('recente', 21));
    r = await giro();
    const aChi = (m) => m.to.split('@')[0] + (/^Promemoria:/.test(m.subject) ? ':promemoria' : ':sollecito');
    esigi(spedite.length === 2 && spedite.map(aChi).sort().join(' ') === 'recente:sollecito vecchissima:promemoria'
        && !scheda('vecchia').sollecitoConferma && !scheda('vecchissima').sollecitoConferma,
        'a ventuno ore il sollecito; a due giorni il promemoria e basta; a ventitre ore niente, per ora', JSON.stringify(spedite.map(aChi)));
    await giro();
    esigi(spedite.length === 2, 'il giro dopo non aggiunge niente');
    avanza(ORA + 10 * MIN);
    await giro();
    esigi(spedite.length === 3 && aChi(spedite[2]) === 'vecchia:promemoria' && !scheda('vecchia').sollecitoConferma, 'a un giorno il promemoria a chi aveva ventitre ore, senza sollecito');
    avanza(2 * ORA);
    await giro();
    esigi(spedite.length === 4 && aChi(spedite[3]) === 'recente:promemoria', 'e a chi ha avuto il sollecito, tre ore dopo, il promemoria');

    // spento: si salta, e il promemoria resta
    azzera();
    process.env.SOLLECITO_CONFERMA = 'no';
    iscritto('spento', partita('spento'));
    avanza(2 * ORA);
    await giro();
    esigi(spedite.length === 0 && !scheda('spento').sollecitoConferma, 'spento: niente sollecito');
    avanza(23 * ORA);
    await giro();
    esigi(spedite.length === 1 && /^Promemoria:/.test(spedite[0].subject), 'ma il promemoria si\'');
    delete process.env.SOLLECITO_CONFERMA;

    // chi conferma prima dell'ora, o e' gia' in sala, non lo riceve
    azzera();
    iscritto('pronta', partita('pronta'));
    iscritto('insala', partita('insala'));
    dati.set('presenze/' + GIRO.idPresenza(V.eventoDi(MILANO), scheda('insala')), { stato: 'presente' });
    avanza(30 * MIN);
    dati.set('iscrizioni/pronta', Object.assign({}, scheda('pronta'), { emailConfermata: { quando: orologio, come: 'mail' } }));
    avanza(ORA);
    await giro();
    esigi(spedite.length === 0 && !('confermaInAttesa' in scheda('pronta')) && !('confermaInAttesa' in scheda('insala')), 'confermata, o presente in sala: niente, e fuori dal giro');

    // il mittente si cambia dalle variabili
    azzera();
    process.env.SOLLECITO_FROM_EMAIL = 'segreteria@revilaw.it'; process.env.SOLLECITO_FROM_NAME = 'Segreteria NGB';
    mittentiBrevo.push({ email: 'segreteria@revilaw.it', active: true });
    iscritto('altro', partita('altro'));
    avanza(ORA);
    await giro();
    esigi(spedite.length === 1 && spedite[0].from === '"Segreteria NGB" <segreteria@revilaw.it>' && spedite[0].replyTo === 'segreteria@revilaw.it', 'il mittente dalle variabili', spedite[0] && spedite[0].from);
    delete process.env.SOLLECITO_FROM_EMAIL; delete process.env.SOLLECITO_FROM_NAME;
});

prova('Il sollecito agli arretrati, una volta: anche a chi ha gia\' avuto il promemoria', async () => {
    azzera();
    dati.set('meta/confermeEmail', { recupero: 1 });
    const giorni = n => orologio - n * GIORNO;
    const vecchia = (id, n, altro) => iscritto(id, Object.assign({ confermaInAttesa: undefined, sollecitoConferma: undefined, ricevuto: giorni(n),
        mailConferma: { quando: giorni(n), ok: true, errore: '', via: 'iscrizione', a: id + '@studio.it' } }, altro || {}));
    vecchia('arr', 3, { promemoriaConferma: { quando: giorni(2), mail: true, sms: true } });          // promemoria gia' avuto, fuori dal giro
    vecchia('arr2', 2, {});                                                                           // fuori dal giro senza promemoria (caso raro)
    iscritto('fresca', { ricevuto: orologio - 2 * ORA, sollecitoConferma: undefined, mailConferma: { quando: orologio - 2 * ORA, ok: true, a: 'fresca@studio.it' } }); // nel giro, due ore
    vecchia('fatta', 3, { promemoriaConferma: { quando: giorni(2) }, emailConfermata: { quando: giorni(1), come: 'mail' } });
    vecchia('annullata', 3, { annullato: { quando: giorni(2), da: 'intestatario' } });
    vecchia('manuale', 3, { inserito: { da: 'x', quando: 1 } });
    vecchia('giafatto', 3, { sollecitoConferma: { quando: giorni(1), ok: true, tentativi: 1 } });
    vecchia('maipartita', 3, { mailConferma: { quando: giorni(3), ok: false, errore: 'x', a: 'maipartita@studio.it' } });
    vecchia('insala', 3, { promemoriaConferma: { quando: giorni(2) } });
    dati.set('presenze/' + GIRO.idPresenza(V.eventoDi(MILANO), scheda('insala')), { stato: 'presente' });
    vecchia('napoli', 3, { pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse' });
    let r = await giro();
    const m = dati.get('meta/confermeEmail') || {};
    esigi(r.corpo.arretrati === 3 && m.sollecitoArretrati === 1 && m.sollecitiArretrati === 3, 'segnate le tre fuori dal giro che aspettano ancora con la mail partita, e scritto che e\' fatto', JSON.stringify(r.corpo));
    esigi(['arr', 'arr2', 'insala'].every(id => scheda(id).sollecitoArretrato === true) && !scheda('fresca').sollecitoArretrato && scheda('fresca').confermaInAttesa === true
        && ['fatta', 'annullata', 'manuale', 'giafatto', 'maipartita', 'napoli'].every(id => !scheda(id).sollecitoArretrato),
        'quali: non chi e\' gia\' nel giro (segue la strada di tutti), ne\' le confermate, annullate, inserite a mano, gia\' sollecitate, senza mail partita, di Napoli');
    const aChi = x => x.to.split('@')[0];
    esigi(spedite.length === 3 && spedite.map(aChi).sort().join(' ') === 'arr arr2 fresca' && spedite.every(x => /andreamissori@revilaw\.it/.test(x.from) && !x.html),
        'nello stesso giro, di giorno, il sollecito alle tre (a chi e\' in sala no: la presenza si rilegge)', JSON.stringify(spedite.map(aChi)));
    esigi(scheda('arr').sollecitoConferma.ok === true && !('confermaInAttesa' in scheda('insala')), 'sulla scheda il segno; chi e\' in sala esce dal giro');
    r = await giro();
    esigi(spedite.length === 3 && r.corpo.arretrati === 0 && !('confermaInAttesa' in scheda('arr')) && !('confermaInAttesa' in scheda('arr2')) && scheda('fresca').confermaInAttesa === true,
        'il giro dopo: niente di nuovo, il recupero non si ripete, gli arretrati escono (niente promemoria dopo la lettera), chi era nel giro ci resta');
    avanza(GIORNO);
    await giro();
    esigi(spedite.length === 4 && spedite[3].to === 'fresca@studio.it' && /^Promemoria:/.test(spedite[3].subject), 'nessuno riceve il sollecito due volte; a chi era nel giro, a un giorno, il promemoria di sempre');
    // di notte il recupero segna, e il sollecito aspetta il mattino
    azzera();
    dati.set('meta/confermeEmail', { recupero: 1 });
    orologio = DateVera.parse('2027-01-15T23:00:00+01:00');
    vecchia('notturna', 3, { promemoriaConferma: { quando: giorni(2) } });
    r = await giro();
    esigi(r.corpo.arretrati === 1 && spedite.length === 0 && r.corpo.aspettano === 1, 'alle 23 si segna e si aspetta');
    orologio = DateVera.parse('2027-01-16T09:00:00+01:00');
    await giro();
    esigi(spedite.length === 1 && spedite[0].to === 'notturna@studio.it', 'alle 9 parte');
    // spento: il recupero non segna niente, e non si consuma
    azzera();
    dati.set('meta/confermeEmail', { recupero: 1 });
    process.env.SOLLECITO_CONFERMA = 'no';
    vecchia('spenta', 3, { promemoriaConferma: { quando: giorni(2) } });
    r = await giro();
    esigi(r.corpo.arretrati === 0 && !(dati.get('meta/confermeEmail') || {}).sollecitoArretrati && !scheda('spenta').sollecitoArretrato, 'spento: niente, e il recupero resta da fare');
    delete process.env.SOLLECITO_CONFERMA;
    // spento DOPO il recupero: gli arretrati aspettano, e riacceso ripartono
    azzera();
    dati.set('meta/confermeEmail', { recupero: 1 });
    orologio = DateVera.parse('2027-01-15T23:00:00+01:00');
    vecchia('pausa', 3, { promemoriaConferma: { quando: giorni(2) } });
    await giro();
    process.env.SOLLECITO_CONFERMA = 'no';
    orologio = DateVera.parse('2027-01-16T09:00:00+01:00');
    r = await giro();
    esigi(spedite.length === 0 && scheda('pausa').confermaInAttesa === true && scheda('pausa').sollecitoArretrato === true && r.corpo.aspettano === 1, 'spento dopo il recupero: l\'arretrato aspetta, con la bandiera');
    delete process.env.SOLLECITO_CONFERMA;
    await giro();
    esigi(spedite.length === 1 && spedite[0].to === 'pausa@studio.it', 'riacceso: parte');
    // un rinvio della mail con il pulsante prima della lettera: anche l'arretrato aspetta l'ora di tutti
    azzera();
    dati.set('meta/confermeEmail', { recupero: 1 });
    orologio = DateVera.parse('2027-01-15T23:00:00+01:00');
    vecchia('rinviata', 3, { promemoriaConferma: { quando: giorni(2) } });
    await giro();
    orologio = DateVera.parse('2027-01-16T07:55:00+01:00');
    dati.set('iscrizioni/rinviata', Object.assign({}, scheda('rinviata'), { mailConferma: { quando: orologio, ok: true, a: 'rinviata@studio.it', via: 'staff' } }));
    orologio = DateVera.parse('2027-01-16T08:00:00+01:00');
    await giro();
    esigi(spedite.length === 0, 'la mail con il pulsante e\' ripartita cinque minuti fa: la lettera aspetta');
    orologio = DateVera.parse('2027-01-16T08:56:00+01:00');
    await giro();
    esigi(spedite.length === 1 && spedite[0].to === 'rinviata@studio.it', 'e parte a un\'ora dal rinvio');
    // dopo la lettera un rinvio dello staff: e' una scheda come le altre, con il promemoria a un giorno
    // (qui il promemoria non l'aveva ancora avuto: chi l'ha gia' avuto esce lo stesso, mai un secondo)
    const quandoLettera = orologio;
    avanza(2 * ORA);
    dati.set('iscrizioni/rinviata', Object.assign({}, scheda('rinviata'), { confermaInAttesa: true, promemoriaConferma: undefined, mailConferma: { quando: orologio, ok: true, a: 'rinviata@studio.it', via: 'staff' } }));
    await giro();
    esigi(spedite.length === 1 && scheda('rinviata').confermaInAttesa === true, 'rimandata dopo la lettera: resta nel giro, senza una seconda lettera');
    avanza(GIORNO);
    await giro();
    esigi(spedite.length === 2 && /^Promemoria:/.test(spedite[1].subject) && scheda('rinviata').sollecitoConferma.quando === quandoLettera, 'e a un giorno dal rinvio il promemoria, una lettera sola');
});

prova('Il mittente non verificato su Brevo: le lettere aspettano, senza consumare niente', async () => {
    azzera();
    const t0 = orologio;
    const partita = id => ({ ricevuto: t0, sollecitoConferma: undefined, mailConferma: { quando: t0, ok: true, errore: '', via: 'iscrizione', a: id + '@studio.it' } });
    ['uno', 'due'].forEach(id => iscritto(id, partita(id)));
    mittentiBrevo = [{ email: 'noreply@esempio.it', active: true }];
    avanza(ORA);
    let r = await giro();
    esigi(spedite.length === 0 && chiamateSmtp === 0 && r.corpo.sollecitoBloccato === true && /andreamissori@revilaw\.it non è fra i mittenti verificati/.test(r.corpo.sollecitoMotivo) && r.corpo.aspettano === 2,
        'Brevo non ha il mittente: nessuna lettera parte, e il motivo e\' nei conti', JSON.stringify(r.corpo.sollecitoMotivo));
    esigi(['uno', 'due'].every(id => !scheda(id).sollecitoConferma && scheda(id).confermaInAttesa === true), 'e sulle schede nessun tentativo');
    const nota = (dati.get('meta/confermeEmail') || {}).sollecitoMittente || {};
    esigi(nota.ok === false && /non è fra i mittenti verificati/.test(nota.motivo) && nota.mittente === 'andreamissori@revilaw.it', 'lo stato del mittente sta anche su meta', JSON.stringify(nota));
    esigi(chiamateBrevo === 2, 'si e\' chiesto a Brevo una volta sola per giro (i mittenti, poi i domini)');
    avanza(10 * MIN);
    await giro();
    esigi(spedite.length === 0 && chiamateBrevo === 4, 'al giro dopo si richiede, e si aspetta ancora');
    // il mittente viene verificato: partono tutte, e per un'ora non si richiede
    mittentiBrevo.push({ email: 'AndreaMissori@revilaw.it', active: true });
    avanza(10 * MIN);
    r = await giro();
    esigi(spedite.length === 2 && r.corpo.sollecitoBloccato === false && r.corpo.mittenteOk === true && (dati.get('meta/confermeEmail') || {}).sollecitoMittente.ok === true,
        'verificato (anche con le maiuscole diverse): partono tutte e due', JSON.stringify(r.corpo));
    const prima = chiamateBrevo;
    iscritto('tre', Object.assign(partita('tre'), { mailConferma: { quando: orologio - 30 * MIN, ok: true, a: 'tre@studio.it' } }));
    avanza(30 * MIN);
    await giro();
    esigi(spedite.length === 3 && chiamateBrevo === prima, 'entro un\'ora dal si\' non si richiede');
    iscritto('quattro', partita('quattro'));
    avanza(ORA);
    await giro();
    esigi(spedite.length === 4 && chiamateBrevo === prima + 1, 'dopo un\'ora si richiede, una volta');
    // il dominio autenticato vale per tutti i suoi indirizzi
    azzera();
    mittentiBrevo = [];
    dominiBrevo = [{ domain_name: 'revilaw.it', authenticated: true, verified: true }];
    iscritto('dominio', partita('dominio'));
    avanza(ORA);
    await giro();
    esigi(spedite.length === 1, 'senza il mittente ma con il dominio revilaw.it autenticato: parte');
    // Brevo risponde male sui domini: e' una verifica non riuscita, non un dominio senza autenticazione
    azzera();
    mittentiBrevo = [];
    const fetchVero = global.fetch;
    global.fetch = async (url, opz) => /senders\/domains/.test(String(url)) ? { ok: false, status: 503, text: async () => 'Service Unavailable' } : fetchVero(url, opz);
    iscritto('domini503', partita('domini503'));
    avanza(ORA);
    r = await giro();
    global.fetch = fetchVero;
    esigi(spedite.length === 0 && /verifica del mittente .* non riuscita: Brevo 503/.test(r.corpo.sollecitoMotivo), 'un 503 sui domini: "verifica non riuscita", non "dominio non autenticato"', r.corpo.sollecitoMotivo);
    // Brevo non risponde: si aspetta, senza consumare
    azzera();
    brevoGiu = true;
    iscritto('rete', partita('rete'));
    avanza(ORA);
    r = await giro();
    esigi(spedite.length === 0 && r.corpo.sollecitoBloccato === true && /verifica del mittente .* non riuscita/.test(r.corpo.sollecitoMotivo) && !scheda('rete').sollecitoConferma, 'Brevo non risponde: si aspetta', r.corpo.sollecitoMotivo);
    brevoGiu = false;
    avanza(10 * MIN);
    await giro();
    esigi(spedite.length === 1, 'tornato, parte');
    // senza la chiave di Brevo non si puo' verificare: si aspetta
    azzera();
    const chiave = process.env.BREVO_API_KEY;
    delete process.env.BREVO_API_KEY;
    iscritto('senzachiave', partita('senzachiave'));
    avanza(ORA);
    r = await giro();
    esigi(spedite.length === 0 && /BREVO_API_KEY mancante/.test(r.corpo.sollecitoMotivo), 'senza BREVO_API_KEY: si aspetta, e il motivo lo dice');
    process.env.BREVO_API_KEY = chiave;
    // il promemoria del giorno dopo non aspetta il mittente
    avanza(23 * ORA);
    await giro();
    esigi(spedite.length === 1 && /^Promemoria:/.test(spedite[0].subject), 'e il promemoria di sempre parte lo stesso');
});

prova('Il mittente rifiutato da Brevo (non verificato) e\' un guasto del canale: non brucia i tentativi', async () => {
    azzera();
    const t0 = orologio;
    const partita = id => ({ ricevuto: t0, sollecitoConferma: undefined, mailConferma: { quando: t0, ok: true, errore: '', via: 'iscrizione', a: id + '@studio.it' } });
    ['uno', 'due', 'tre'].forEach(id => iscritto(id, partita(id)));
    avanza(ORA);
    erroreMail = () => Object.assign(new Error('550 Sender not valid'), { responseCode: 550, command: 'MAIL FROM' });
    mailGuasta = 99;
    let r = await giro();
    const provate = () => ['uno', 'due', 'tre'].filter(id => scheda(id).sollecitoConferma);
    esigi(chiamateSmtp === 1 && r.corpo.solleciti === 1 && r.corpo.sollecitoBloccato === true && r.corpo.aspettano === 2 && provate().length === 1,
        'al primo no sul mittente il giro si ferma: una lettera provata, le altre aspettano', JSON.stringify(r.corpo));
    const s1 = scheda(provate()[0]);
    esigi(s1.sollecitoConferma.ok === false && s1.sollecitoConferma.canale === true && s1.sollecitoConferma.tentativi === 0 && /Sender not valid/.test(s1.sollecitoConferma.errore),
        'e il tentativo non si conta', JSON.stringify(s1.sollecitoConferma));
    avanza(10 * MIN);
    r = await giro();
    esigi(chiamateSmtp === 2 && provate().length === 2, 'dieci minuti dopo si prova un\'altra (la prima aspetta la sua mezz\'ora)');
    for (let k = 0; k < 12; k++) { avanza(30 * MIN); await giro(); }
    esigi(['uno', 'due', 'tre'].every(id => (!scheda(id).sollecitoConferma || scheda(id).sollecitoConferma.tentativi === 0) && scheda(id).confermaInAttesa === true) && spedite.length === 0,
        'dopo sei ore di guasto nessuno ha consumato un tentativo, e tutte aspettano', JSON.stringify(['uno', 'due', 'tre'].map(id => scheda(id).sollecitoConferma)));
    // il mittente viene verificato: partono tutte
    mailGuasta = 0;
    avanza(30 * MIN);
    r = await giro();
    esigi(spedite.length === 3 && ['uno', 'due', 'tre'].every(id => scheda(id).sollecitoConferma.ok === true && scheda(id).sollecitoConferma.tentativi === 1) && r.corpo.sollecitoBloccato === false,
        'sistemato il mittente, al giro dopo partono tutte e tre', JSON.stringify(r.corpo));
    // un no sul DESTINATARIO invece conta, e non ferma gli altri
    azzera();
    ['quattro', 'cinque'].forEach(id => iscritto(id, partita(id)));
    avanza(ORA);
    erroreMail = () => Object.assign(new Error('550 5.1.1 casella inesistente'), { responseCode: 550, command: 'RCPT TO' });
    mailGuasta = 1;
    r = await giro();
    esigi(chiamateSmtp === 2 && spedite.length === 1 && r.corpo.sollecitoBloccato === false
        && ['quattro', 'cinque'].some(id => scheda(id).sollecitoConferma.ok === false && scheda(id).sollecitoConferma.canale === false && scheda(id).sollecitoConferma.tentativi === 1),
        'un no alla casella: conta per quella persona, e l\'altra parte lo stesso', JSON.stringify(r.corpo));
});

prova('Partita e mai cliccata: dopo un giorno UN promemoria, mail e SMS', async () => {
    azzera();
    const t0 = orologio;
    iscritto('lenta', { ricevuto: t0, mailConferma: { quando: t0, ok: true, errore: '', via: 'iscrizione', a: 'lenta@studio.it' },
        invioConferma: { a: 'lenta@studio.it', tentativi: 1, falliti: 0, ultimo: t0 }, smsConferma: { quando: t0, ok: true, tipo: 'inviata' } });
    avanza(23 * ORA);
    await giro();
    esigi(spedite.length === 0 && sms.length === 0, 'a ventitre ore: niente');
    avanza(ORA);
    const r = await giro();
    const s = scheda('lenta');
    esigi(spedite.length === 1 && spedite[0].subject.indexOf('Promemoria: Richiesta di conferma') === 0 && r.corpo.promemoria === 1,
        'a un giorno: la mail con "Promemoria:" nell\'oggetto', spedite[0] && spedite[0].subject);
    const t = String((sms[0] || {}).content || '');
    esigi(sms.length === 1 && sms[0].tag === 'conferma-email' && /non ancora confermata/.test(t) && /inviata a lenta@studio\.it/.test(t)
        && /nello Spam/.test(t) && /info@nextgenerationbusiness\.it/.test(t) && /modulo contatti del sito/.test(t) && !/https?:|www\./.test(t),
        'e l\'SMS del promemoria', t);
    esigi(V.caratteriSms(t) > 0 && V.caratteriSms(t) <= 306 && !/#\d{6}/.test(t), 'GSM-7, due SMS al massimo, senza codice');
    esigi(s.promemoriaConferma && s.promemoriaConferma.quando === orologio && s.promemoriaConferma.mail === true && s.promemoriaConferma.sms === true,
        'sulla scheda: promemoria mandato, mail e SMS', JSON.stringify(s.promemoriaConferma));
    esigi(!('confermaInAttesa' in s) && s.mailConferma.via === 'promemoria' && s.smsConferma.tipo === 'promemoria', 'e la scheda esce dal giro');
    avanza(2 * GIORNO);
    await giro();
    esigi(spedite.length === 1 && sms.length === 1, 'due giorni dopo: niente');
    // anche se la bandiera tornasse (un rinvio dallo staff), il promemoria non si ripete
    dati.set('iscrizioni/lenta', Object.assign({}, scheda('lenta'), { confermaInAttesa: true }));
    avanza(2 * GIORNO);
    await giro();
    esigi(spedite.length === 1 && sms.length === 1 && !('confermaInAttesa' in scheda('lenta')), 'mai un secondo promemoria');
    // senza cellulare verificato: la mail si', l'SMS no
    azzera();
    iscritto('senzatel', { telefonoNumero: undefined, ricevuto: orologio - 2 * GIORNO,
        mailConferma: { quando: orologio - 2 * GIORNO, ok: true, a: 'senzatel@studio.it' } });
    await giro();
    esigi(spedite.length === 1 && sms.length === 0 && scheda('senzatel').promemoriaConferma.sms === null, 'senza cellulare verificato: solo la mail');
    // il promemoria che non parte: si riprova come gli altri, ma non diventa un secondo promemoria
    azzera();
    iscritto('pgiu', { ricevuto: orologio - 2 * GIORNO, mailConferma: { quando: orologio - 2 * GIORNO, ok: true, a: 'pgiu@studio.it' } });
    mailGuasta = 1;
    await giro();
    let p = scheda('pgiu');
    esigi(p.promemoriaConferma.mail === false && p.confermaInAttesa === true && p.mailConferma.ok === false, 'promemoria non partito: la scheda resta nel giro');
    avanza(5 * MIN);
    await giro();
    p = scheda('pgiu');
    esigi(spedite.length === 1 && /^Richiesta di conferma/.test(spedite[0].subject) && p.mailConferma.ok === true && p.mailConferma.via === 'automatico',
        'dopo cinque minuti la mail riparte (un tentativo, non un secondo promemoria)');
    await giro();
    esigi(!('confermaInAttesa' in scheda('pgiu')) && spedite.length === 1 && sms.length === 1, 'e poi la scheda esce dal giro');
});

prova('Chi non aspetta piu\' niente esce dal giro, senza che parta niente', async () => {
    azzera();
    const vecchia = orologio - 3 * GIORNO;
    const partita = { quando: vecchia, ok: true };
    iscritto('confermata', { mailConferma: partita, emailConfermata: { quando: vecchia + 1, come: 'mail' } });
    iscritto('annullata', { mailConferma: partita, annullato: { quando: vecchia + 1, da: 'intestatario' } });
    iscritto('amano', { ricevuto: vecchia, inserito: { da: 'admin@revilaw.it', quando: vecchia } });
    iscritto('importata', { ricevuto: vecchia, importato: true });
    iscritto('portale', { ricevuto: vecchia, extra: { Portale: 'Desk Revilaw' } });
    iscritto('napoli', { pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', ricevuto: vecchia });
    iscritto('pregresso', { mailConferma: partita, emailConfermata: { quando: vecchia, come: 'pregresso' } });
    const r = await giro();
    const ids = ['confermata', 'annullata', 'amano', 'importata', 'portale', 'napoli', 'pregresso'];
    esigi(ids.every(id => !('confermaInAttesa' in scheda(id))) && r.corpo.tolte === ids.length, 'la bandiera se ne va da tutte', JSON.stringify(r.corpo));
    esigi(spedite.length === 0 && sms.length === 0, 'e non parte nessuna mail ne\' SMS');
    esigi(ids.every(id => !scheda(id).promemoriaConferma && !scheda(id).invioConferma), 'e non si scrive nient\'altro');
});

prova('Le iscrizioni di prima della bandiera si recuperano, una volta', async () => {
    azzera();
    dati.delete('meta/confermeEmail');
    const vecchia = orologio - 5 * GIORNO;
    // Ombretta: iscritta, mail "partita", mai cliccata, nessuna bandiera
    iscritto('ombretta', { confermaInAttesa: undefined, ricevuto: vecchia, mailConferma: { quando: vecchia, ok: true, errore: '' } });
    // una con la mail mai partita
    iscritto('persa', { confermaInAttesa: undefined, ricevuto: vecchia });
    iscritto('fatta', { confermaInAttesa: undefined, ricevuto: vecchia, mailConferma: { quando: vecchia, ok: true }, emailConfermata: { quando: vecchia, come: 'mail' } });
    iscritto('napoli', { confermaInAttesa: undefined, pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', ricevuto: vecchia });
    ['ombretta', 'persa', 'fatta', 'napoli'].forEach(id => { const x = scheda(id); delete x.confermaInAttesa; dati.set('iscrizioni/' + id, x); });
    const r = await giro();
    esigi(r.corpo.recuperate === 2 && (dati.get('meta/confermeEmail') || {}).recupero === 1, 'recuperate le due che aspettano ancora, e segnato che e\' fatto', JSON.stringify(r.corpo));
    const a = spedite.map(m => m.to + ' ' + m.subject.slice(0, 11)).sort();
    esigi(a.length === 2 && /^ombretta@studio\.it Promemoria/.test(a[0]) && /^persa@studio\.it Richiesta d/.test(a[1]),
        'Ombretta riceve il promemoria, chi non l\'aveva mai avuta la mail', JSON.stringify(a));
    esigi(!scheda('fatta').confermaInAttesa && !scheda('napoli').confermaInAttesa, 'la confermata e Napoli non entrano nel giro');
    iscritto('dopo', { ricevuto: vecchia, mailConferma: { quando: vecchia, ok: true } });
    const x = scheda('dopo'); delete x.confermaInAttesa; dati.set('iscrizioni/dopo', x);
    const letturePrima = letture;
    await giro();
    esigi(!scheda('dopo').confermaInAttesa && letture === letturePrima + 1, 'il recupero non si ripete: un\'altra scheda senza bandiera resta fuori, e si legge solo la ricerca');
});

const EV = 'milano-2027-02-26';
// il documento delle presenze, con lo stesso nome che gli danno /api/presenze e l'area riservata
function idPresenza(id) { return (EV + '~' + id + '@studio.it|15/01/2027 10:00:00').replace(/[\/\\.#$\[\]]/g, '-').slice(0, 400); }

prova('Un giro alla volta: due giri insieme spediscono una volta sola', async () => {
    azzera();
    iscritto('mai', { ricevuto: orologio - 10 * MIN });
    iscritto('rotta', { ricevuto: orologio - 10 * MIN, mailConferma: { quando: orologio - 10 * MIN, ok: false, errore: 'x', a: 'rotta@studio.it' },
        invioConferma: { a: 'rotta@studio.it', tentativi: 1, falliti: 1, ultimo: orologio - 10 * MIN }, smsConferma: { quando: 1, ok: true, tipo: 'non-inviata' } });
    const [a, b] = await zitti(() => Promise.all([GIRO.giro(db), GIRO.giro(db)]));
    const lavoro = [a, b].filter(c => !c.occupato);
    esigi(lavoro.length === 1 && [a, b].some(c => c.occupato === true && c.esaminate === 0 && c.inviate === 0),
        'uno lavora, l\'altro trova il lucchetto e si ferma senza fare niente', JSON.stringify([a, b]));
    esigi(spedite.length === 2 && spedite.filter(m => m.to === 'mai@studio.it').length === 1 && spedite.filter(m => m.to === 'rotta@studio.it').length === 1,
        'una mail per scheda, non due', spedite.map(m => m.to).join(', '));
    esigi(sms.length === 1 && scheda('rotta').invioConferma.tentativi === 2, 'un SMS solo, e il conto dei tentativi giusto');
    const meta = dati.get('meta/confermeEmail') || {};
    esigi(meta.lucchettoFino === 0 && meta.lucchettoGiro === null, 'alla fine il lucchetto e\' mollato', JSON.stringify(meta));
    // un giro morto lascia il lucchetto: scade da solo
    dati.set('meta/confermeEmail', Object.assign({}, meta, { lucchettoFino: orologio + GIRO.LUCCHETTO_MS, lucchettoGiro: 'morto' }));
    iscritto('dopo', { ricevuto: orologio - 10 * MIN });
    let r = await giro();
    esigi(r.corpo.ok === true && r.corpo.occupato === true && !scheda('dopo').mailConferma, 'con il lucchetto di un giro morto: si aspetta', JSON.stringify(r.corpo));
    avanza(GIRO.LUCCHETTO_MS + 1000);
    r = await giro();
    esigi(r.corpo.occupato === false && scheda('dopo').mailConferma && scheda('dopo').mailConferma.ok === true, 'scaduto il lucchetto, il giro lavora');
    // il lucchetto di un altro giro non si molla: lo scaduto ripreso da un altro resta suo
    iscritto('ancora', { ricevuto: orologio - 10 * MIN });
    fraRicercaELavoro = async () => {
        dati.set('meta/confermeEmail', Object.assign({}, dati.get('meta/confermeEmail'), { lucchettoFino: orologio + GIRO.LUCCHETTO_MS, lucchettoGiro: 'altro' }));
    };
    await giro();
    esigi((dati.get('meta/confermeEmail') || {}).lucchettoGiro === 'altro', 'il lucchetto preso da un altro giro resta a lui');
});

prova('La scheda di adesso: cancellata o confermata fra la ricerca e il lavoro, non riparte niente e non rinasce niente', async () => {
    azzera();
    iscritto('cancellata', { ricevuto: orologio - 10 * MIN });
    iscritto('importata', { ricevuto: orologio - GIORNO, importato: true });
    iscritto('cliccata', { ricevuto: orologio - 10 * MIN });
    iscritto('promemoria', { ricevuto: orologio - 2 * GIORNO, mailConferma: { quando: orologio - 2 * GIORNO, ok: true, a: 'promemoria@studio.it' } });
    fraRicercaELavoro = async () => {
        dati.delete('iscrizioni/cancellata');
        dati.delete('iscrizioni/importata');
        dati.delete('iscrizioni/promemoria');
        const c = scheda('cliccata');
        c.emailConfermata = { quando: orologio, come: 'mail' };
        delete c.confermaInAttesa;
        dati.set('iscrizioni/cliccata', c);
    };
    const r = await giro();
    esigi(spedite.length === 0 && sms.length === 0, 'nessuna mail e nessun SMS', spedite.map(m => m.to).join(', '));
    esigi(!dati.has('iscrizioni/cancellata') && !dati.has('iscrizioni/importata') && !dati.has('iscrizioni/promemoria'),
        'le schede cancellate restano cancellate: niente documenti rinati vuoti');
    esigi(!scheda('cliccata').mailConferma && r.corpo.cambiate === 4 && r.corpo.errori === 0, 'chi ha confermato nel frattempo non riceve la richiesta', JSON.stringify(r.corpo));
    // cancellata subito dopo la rilettura: la bandiera si toglie con update, che non la ricrea
    azzera();
    iscritto('portale', { ricevuto: orologio - GIORNO, extra: { Portale: 'Eventbrite' } });
    alLeggere['iscrizioni/portale'] = async () => { dati.delete('iscrizioni/portale'); };
    const r2 = await giro();
    esigi(!dati.has('iscrizioni/portale') && r2.corpo.errori === 0, 'togliere la bandiera a una scheda appena cancellata non la fa rinascere', JSON.stringify(r2.corpo));
});

prova('Chi e\' segnato "presente" esce dal giro, senza mail ne\' SMS', async () => {
    azzera();
    const vecchia = orologio - 2 * GIORNO;
    iscritto('sala', { ricevuto: vecchia, mailConferma: { quando: vecchia, ok: true, a: 'sala@studio.it' } });
    iscritto('salamai', { ricevuto: orologio - 10 * MIN });
    iscritto('salarotta', { ricevuto: orologio - 10 * MIN, mailConferma: { quando: orologio - 10 * MIN, ok: false, errore: 'x', a: 'salarotta@studio.it' } });
    iscritto('confermato', { ricevuto: vecchia, mailConferma: { quando: vecchia, ok: true, a: 'confermato@studio.it' } });
    ['sala', 'salamai', 'salarotta'].forEach(id => dati.set('presenze/' + idPresenza(id), { evento: EV, idIscritto: id + '@studio.it|15/01/2027 10:00:00', stato: 'presente' }));
    dati.set('presenze/' + idPresenza('confermato'), { evento: EV, idIscritto: 'confermato@studio.it|15/01/2027 10:00:00', stato: 'confermato' });
    esigi(GIRO.idPresenza({ chiave: EV }, scheda('sala')) === idPresenza('sala'), 'il documento delle presenze ha il nome che gli da\' l\'area riservata', GIRO.idPresenza({ chiave: EV }, scheda('sala')));
    const r = await giro();
    esigi(['sala', 'salamai', 'salarotta'].every(id => !('confermaInAttesa' in scheda(id)) && !scheda(id).promemoriaConferma && !(scheda(id).invioConferma)),
        'presente: la bandiera se ne va, e non si scrive nient\'altro');
    esigi(spedite.length === 1 && spedite[0].to === 'confermato@studio.it' && sms.length === 1, 'nessuna mail a chi era in sala; "confermato" (deciso prima dall\'organizzazione) riceve il promemoria',
        spedite.map(m => m.to).join(', '));
    esigi(r.corpo.tolte === 3 && r.corpo.promemoria === 1, 'i conti lo dicono', JSON.stringify(r.corpo));
});

prova('Dopo la fine dell\'evento non si riprova e non si ricorda piu\' niente', async () => {
    azzera();
    const fine = V.eventoDi(MILANO).fine;
    esigi(fine === Date.parse('2027-02-26T18:00:00+01:00'), 'Milano finisce il 26 febbraio 2027 alle 18 (ora di Milano)');
    orologio = fine - 10 * MIN;
    const vecchia = orologio - 2 * GIORNO;
    iscritto('tardi', { ricevuto: vecchia, mailConferma: { quando: vecchia, ok: true, a: 'tardi@studio.it' } });
    iscritto('rottatardi', { ricevuto: orologio - 20 * MIN, mailConferma: { quando: orologio - 20 * MIN, ok: false, errore: 'x', a: 'rottatardi@studio.it' } });
    iscritto('maitardi', { ricevuto: orologio - 20 * MIN });
    esigi(['tardi', 'rottatardi', 'maitardi'].map(id => GIRO.cosaFare(scheda(id), orologio).fare).join(',') === 'promemoria,riprova,invia',
        'dieci minuti prima della fine: promemoria, riprova, invio');
    esigi(GIRO.cosaFare(scheda('tardi'), fine).perche === 'evento finito', 'alla fine: "evento finito"');
    orologio = fine;
    const r = await giro();
    esigi(spedite.length === 0 && sms.length === 0 && r.corpo.tolte === 3, 'a evento finito: nessuna mail, nessun SMS', JSON.stringify(r.corpo));
    esigi(['tardi', 'rottatardi', 'maitardi'].every(id => !('confermaInAttesa' in scheda(id))), 'e la bandiera se ne va da tutte');
});

prova('Il promemoria di notte aspetta il mattino', async () => {
    azzera();
    orologio = Date.parse('2027-01-15T23:00:00+01:00');
    const vecchia = orologio - 2 * GIORNO;
    iscritto('notte', { ricevuto: vecchia, mailConferma: { quando: vecchia, ok: true, a: 'notte@studio.it' } });
    iscritto('nottemai', { ricevuto: orologio - 10 * MIN });
    let r = await giro();
    esigi(!spedite.some(m => m.to === 'notte@studio.it') && !scheda('notte').promemoriaConferma && scheda('notte').confermaInAttesa === true && r.corpo.aspettano === 1,
        'alle 23 il promemoria non parte, e la scheda resta nel giro', JSON.stringify(r.corpo));
    esigi(GIRO.cosaFare(scheda('notte'), orologio).perche === 'notte', 'perche\': "notte"');
    esigi(spedite.length === 1 && spedite[0].to === 'nottemai@studio.it', 'la mail mai partita a chi si e\' appena iscritto parte anche di notte');
    esigi(GIRO.cosaFare(scheda('notte'), Date.parse('2027-01-16T07:59:00+01:00')).fare === 'aspetta'
        && GIRO.cosaFare(scheda('notte'), Date.parse('2027-01-16T08:00:00+01:00')).fare === 'promemoria'
        && GIRO.cosaFare(scheda('notte'), Date.parse('2027-01-16T20:59:00+01:00')).fare === 'promemoria'
        && GIRO.cosaFare(scheda('notte'), Date.parse('2027-01-16T21:00:00+01:00')).fare === 'aspetta', 'dalle 8 alle 21, ora di Milano');
    esigi(GIRO.oraRoma(Date.parse('2027-07-01T06:30:00Z')) === 8 && GIRO.oraRoma(Date.parse('2027-01-15T06:30:00Z')) === 7, 'con l\'ora legale d\'estate e quella solare d\'inverno');
    sms = []; spedite = [];
    orologio = Date.parse('2027-01-16T07:50:00+01:00');
    await giro();
    esigi(spedite.length === 0 && sms.length === 0, 'alle 7.50 ancora niente');
    orologio = Date.parse('2027-01-16T10:00:00+01:00');
    r = await giro();
    esigi(spedite.some(m => /^Promemoria:/.test(m.subject) && m.to === 'notte@studio.it') && sms.length === 1 && r.corpo.promemoria === 1,
        'alle 10 parte: mail e SMS', JSON.stringify(r.corpo));
    // e a chi si era iscritto alle 23, con la mail partita subito, al mattino arriva il sollecito personale
    esigi(spedite.length === 2 && spedite.some(m => m.to === 'nottemai@studio.it' && /andreamissori@revilaw\.it/.test(m.from)) && r.corpo.solleciti === 1,
        'e il sollecito di un\'ora dopo, rimasto ad aspettare la notte, parte con lui');
});

prova('Prima i guasti: una mail da riprovare in fondo alla fila non aspetta i promemoria', async () => {
    azzera();
    // 250 schede che aspettano (mail partita un'ora fa), 30 promemoria dovuti, e in fondo (per nome) una mail fallita
    for (let i = 0; i < 250; i++) iscritto('a' + String(i).padStart(3, '0'), { ricevuto: orologio - ORA, mailConferma: { quando: orologio - ORA, ok: true, a: 'a' + String(i).padStart(3, '0') + '@studio.it' } });
    for (let i = 0; i < 30; i++) iscritto('b' + String(i).padStart(2, '0'), { ricevuto: orologio - 2 * GIORNO, mailConferma: { quando: orologio - 2 * GIORNO, ok: true, a: 'b' + String(i).padStart(2, '0') + '@studio.it' } });
    iscritto('zeta', { ricevuto: orologio - 10 * MIN, mailConferma: { quando: orologio - 10 * MIN, ok: false, errore: 'x', a: 'zeta@studio.it' },
        invioConferma: { a: 'zeta@studio.it', tentativi: 1, falliti: 1, ultimo: orologio - 10 * MIN }, smsConferma: { quando: 1, ok: true, tipo: 'non-inviata' } });
    passoMail = 3000;   // ogni mail tre secondi: il tempo del giro finisce prima dei promemoria
    const r = await giro();
    const z = scheda('zeta');
    esigi(z.invioConferma.tentativi === 2 && z.mailConferma.ok === true && r.corpo.riprovate === 1, 'la mail fallita e\' riprovata in questo giro', JSON.stringify(r.corpo));
    esigi(spedite[0] && spedite[0].to === 'zeta@studio.it', 'ed e\' la prima a partire');
    esigi(r.corpo.lette === 281 && r.corpo.aspettano === 250 && r.corpo.promemoria > 0 && r.corpo.promemoria < 30 && r.corpo.rimaste === 30 - r.corpo.promemoria,
        'poi i promemoria finche\' c\'e\' tempo; gli altri al giro dopo, e i conti lo dicono', JSON.stringify(r.corpo));
    esigi(r.corpo.limitePieno === false, 'sotto il limite: nessun avviso');
});

prova('Al limite delle schede lette il giro lo dice', async () => {
    azzera();
    for (let i = 0; i < GIRO.LIMITE; i++) iscritto('l' + String(i).padStart(4, '0'), { ricevuto: orologio - ORA, mailConferma: { quando: orologio - ORA, ok: true, a: 'l' + String(i).padStart(4, '0') + '@studio.it' } });
    const avvisi = [];
    const avvVero = console.warn;
    console.warn = (...x) => avvisi.push(x.join(' '));
    let c;
    try { c = await GIRO.giro(db); } finally { console.warn = avvVero; }
    esigi(GIRO.LIMITE >= 2000 && c.lette === GIRO.LIMITE && c.limitePieno === true, 'limitePieno nei conti', JSON.stringify(c));
    esigi(avvisi.some(x => /il limite del giro/.test(x)), 'e un avviso nel log', avvisi.join(' | '));
});

prova('Un invio alla volta: il giro e il "Rimandala" della pagina non spediscono due mail', async () => {
    // la mail non e' partita all'iscrizione; il giro la riprova mentre la persona preme "Rimandala"
    azzera();
    const t0 = orologio;
    const riprova = () => iscritto('doppia', {
        ricevuto: t0, mailConferma: { quando: t0, ok: false, errore: 'tempo scaduto', via: 'iscrizione', a: 'doppia@studio.it' },
        invioConferma: { a: 'doppia@studio.it', tentativi: 1, falliti: 1, ultimo: t0 }, smsConferma: { quando: t0, ok: true, tipo: 'non-inviata' }
    });
    riprova();
    avanza(6 * MIN);
    let rimanda = null;
    durantePosta = async () => { rimanda = await zitti(() => CONF.rimandaConferma(db, 'doppia')); };
    await giro();
    esigi(spedite.length === 1, 'parte una mail sola', String(spedite.length));
    esigi(rimanda && rimanda.esito === 'attesa', '"Rimandala" premuto mentre il giro spedisce: aspetta', JSON.stringify(rimanda));
    esigi(scheda('doppia').invioConferma.tentativi === 2 && !(scheda('doppia').invioInCorsoFino > orologio), 'la traccia del giro resta giusta, e il segno dell\'invio in corso e\' chiuso');
    // e il contrario: un rinvio della pagina in corso, il giro la lascia stare
    azzera();
    riprova();
    avanza(6 * MIN);
    dati.set('iscrizioni/doppia', Object.assign({}, scheda('doppia'), { invioInCorsoFino: orologio + 30 * 1000 }));
    const r = await giro();
    esigi(spedite.length === 0 && r.corpo.cambiate >= 1, 'con un rinvio in corso il giro non spedisce', JSON.stringify(r.corpo));
    // un segno rimasto da un invio interrotto scade da solo
    avanza(2 * MIN);
    await giro();
    esigi(spedite.length === 1, 'scaduto il segno, il giro riprova');
});

prova('Cancellata mentre la mail parte: la scheda non rinasce', async () => {
    azzera();
    const t0 = orologio;
    iscritto('via', {
        ricevuto: t0, mailConferma: { quando: t0, ok: false, errore: 'tempo scaduto', via: 'iscrizione', a: 'via@studio.it' },
        invioConferma: { a: 'via@studio.it', tentativi: 1, falliti: 1, ultimo: t0 }, smsConferma: { quando: t0, ok: true }
    });
    avanza(6 * MIN);
    durantePosta = async () => { dati.delete('iscrizioni/via'); };
    await giro();
    esigi(!dati.has('iscrizioni/via'), 'riprova: la scheda cancellata durante l\'invio resta cancellata');
    // il promemoria, con mail e SMS
    azzera();
    iscritto('prom', { ricevuto: orologio - 2 * GIORNO, mailConferma: { quando: orologio - 2 * GIORNO, ok: true, a: 'prom@studio.it' },
        invioConferma: { a: 'prom@studio.it', tentativi: 1, falliti: 0, ultimo: orologio - 2 * GIORNO }, smsConferma: { quando: 1, ok: true } });
    durantePosta = async () => { dati.delete('iscrizioni/prom'); };
    await giro();
    esigi(spedite.length === 1 && !dati.has('iscrizioni/prom'), 'promemoria: mail partita, e la scheda cancellata non rinasce (nemmeno con l\'SMS)');
    // e nel caso normale la traccia si scrive come sempre
    azzera();
    iscritto('mai', { ricevuto: orologio - 10 * MIN });
    await giro();
    const s = scheda('mai');
    esigi(s.mailConferma && s.mailConferma.via === 'automatico' && s.smsConferma && s.smsConferma.ok === true, 'senza cancellazioni la traccia di mail e SMS c\'e\'');
});

(async () => {
    for (const p of prove) { console.log('\n' + p.titolo); await p.fn(); }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
