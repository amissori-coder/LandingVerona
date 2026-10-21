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
     - le iscrizioni di prima della bandiera si recuperano, una volta.
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
        get: async () => istantanea(chiave, self),
        set: async (patch, opz) => { dati.set(chiave, applica(dati.get(chiave), patch, !!(opz && opz.merge))); }
    };
    return self;
}
let letture = 0;
function interroga(coll, filtri, max) {
    return {
        where(campo, op, val) { return interroga(coll, filtri.concat([[campo, val]]), max); },
        limit(n) { return interroga(coll, filtri, n); },
        async get() {
            letture++;
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
const admin = {
    initializeApp() { }, credential: { cert: () => ({}) }, apps: [],
    firestore: () => db
};
admin.firestore.FieldValue = { delete: () => ({ __del: true }), increment: n => ({ __inc: n }), serverTimestamp: () => orologio };

// ---------- posta e SMS finti ----------
let spedite = [];
let mailGuasta = 0;
let chiamateSmtp = 0;
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
    const errVero = console.error, logVero = console.log;
    console.error = () => { }; console.log = () => { };
    try {
        await cron({ method: 'GET', headers: intestazioni === undefined ? { authorization: 'Bearer segreto-cron' } : intestazioni, query: {} }, res);
    } finally { console.error = errVero; console.log = logVero; }
    return { stato: stato, corpo: risposta || {} };
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
    dati.clear(); spedite = []; sms = []; mailGuasta = 0; chiamateSmtp = 0; orologio = INIZIO;
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

(async () => {
    for (const p of prove) { console.log('\n' + p.titolo); await p.fn(); }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
