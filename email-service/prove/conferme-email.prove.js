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
     - una mail PARTITA e mai cliccata riceve dopo un giorno UN
       promemoria, mail ("Promemoria:" nell'oggetto) e SMS, e mai un
       secondo, nemmeno se la bandiera tornasse;
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
            dati.set(chiave, applica(dati.get(chiave), patch, true));
        }
    };
    return self;
}
/* Un momento fra la ricerca e il lavoro sulla scheda: le prove ci mettono
   quello che succede nel frattempo (una cancellazione, una conferma). */
let fraRicercaELavoro = null;
let alLeggere = {};
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
let sms = [];
global.fetch = async (url, opz) => {
    if (/transactionalSMS/.test(String(url))) {
        sms.push(JSON.parse(opz.body));
        return { ok: true, status: 201, text: async () => '{"messageId":42}' };
    }
    throw new Error('rete non prevista: ' + url);
};
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return { createTransport: () => ({ sendMail: async m => {
        chiamateSmtp++;
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
function iscritto(id, campi) {
    dati.set('iscrizioni/' + id, Object.assign({
        pagina: MILANO, data: '15/01/2027 10:00:00', nome: 'Pia', cognome: id, email: id + '@studio.it',
        telefono: '+39 333 000 0000', telefonoNumero: '+393330000000', telefonoVerificato: { quando: 1, come: 'sms' },
        ricevuto: orologio, confermaInAttesa: true
    }, campi || {}));
}
function scheda(id) { return dati.get('iscrizioni/' + id) || {}; }
function azzera() {
    dati.clear(); spedite = []; sms = []; mailGuasta = 0; chiamateSmtp = 0; orologio = INIZIO; fraRicercaELavoro = null; alLeggere = {}; passoMail = 0;
    erroreMail = () => new Error('550 casella inesistente');
    // il recupero una tantum lo prova la sua prova: qui risulta gia' fatto
    dati.set('meta/confermeEmail', { recupero: 1 });
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
    esigi(sms.length === 1 && sms[0].tag === 'conferma-email' && /non è ancora confermata/.test(t) && /inviata a lenta@studio\.it/.test(t)
        && /Spam\/Posta indesiderata/.test(t) && t.indexOf('https://nextgenerationbusiness.it/contatti/?t=mail') > 0, 'e l\'SMS del promemoria', t);
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
    esigi(spedite.length === 1 && /^Promemoria:/.test(spedite[0].subject) && spedite[0].to === 'notte@studio.it' && sms.length === 1 && r.corpo.promemoria === 1,
        'alle 10 parte: mail e SMS', JSON.stringify(r.corpo));
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

(async () => {
    for (const p of prove) { console.log('\n' + p.titolo); await p.fn(); }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
