/* ============================================================
   PROVE - api/promemoria-seconda-persona.js e
           lib/promemoria-seconda-persona.js
   ------------------------------------------------------------
       node prove/seconda-persona.prove.js

   Niente da installare: Firestore e la posta sono finti e stanno qui
   dentro, e l'orologio lo muovono le prove. Esce con 1 se qualcosa e'
   rosso.

   COSA DIMOSTRANO. La mail "l'invito vale per due persone" deve
   arrivare a chi e' l'unica persona iscritta della sua azienda con il
   codice della PEC, all'indirizzo verificato, una volta, e a nessun
   altro:
     - senza CRON_SECRET non parte niente; spento, o fuori orario
       (sabato, domenica, prima delle 9, dalle 19), non legge niente;
     - parte a un giorno dalla conferma dell'email, non prima e non
       senza conferma; solo testo, con il codice su una riga sua, la
       ragione sociale dell'invito e il modulo della pagina;
     - una volta per azienda: il giro dopo non la rimanda, nemmeno se
       la persona annulla e se ne iscrive un'altra;
     - due iscritte attive: niente; una delle due annullata: si';
     - invito per email ordinaria, codice di sponsor, evento senza
       tetto: niente, e l'esclusa non si rilegge ai giri dopo;
     - la rilettura: un secondo iscritto arrivato fra la ricerca e
       l'invio ferma la mail;
     - il server dice no: si riprova dopo 30 minuti e 3 ore, poi basta;
       non risponde: 'incerta', e non si riprova; una funzione morta a
       meta' non fa partire la stessa mail due volte;
     - un giro alla volta, al piu' PER_GIRO mail, e le escluse in testa
       alla fila non tengono indietro le altre;
     - a un giorno dalla fine dell'evento non parte piu' niente;
     - una scheda cancellata mentre la mail parte non rinasce; Modifica
       si porta dietro il segno.
   ============================================================ */
'use strict';
const Module = require('module');
const fs = require('fs');
const path = require('path');

// ---------- orologio: lunedi' 16 novembre 2026, 10:00 a Milano ----------
const INIZIO = Date.parse('2026-11-16T10:00:00+01:00');
let orologio = INIZIO;
const DateVera = Date;
global.Date = class extends DateVera {
    constructor(...a) { if (a.length) super(...a); else super(orologio); }
    static now() { return orologio; }
};
const MIN = 60 * 1000, ORA = 60 * MIN, GIORNO = 24 * ORA;

// ---------- Firestore finto ----------
const dati = new Map();
function applica(vecchio, patch, merge) {
    const base = (merge && vecchio) ? JSON.parse(JSON.stringify(vecchio)) : {};
    for (const k of Object.keys(patch)) {
        const v = patch[k];
        if (v && v.__del) delete base[k];
        // come Firestore: set con merge fonde anche le mappe dentro
        else if (merge && v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) base[k] = applica(base[k], v, true);
        else base[k] = JSON.parse(JSON.stringify(v));
    }
    return base;
}
let letture = 0;
function istantanea(chiave, ref, campi) {
    const v = dati.get(chiave);
    let copia = v ? JSON.parse(JSON.stringify(v)) : undefined;
    if (copia && campi) { const p = {}; campi.forEach(c => { if (c in copia) p[c] = copia[c]; }); copia = p; }
    return { exists: dati.has(chiave), id: chiave.split('/').pop(), data: () => copia, ref: ref };
}
let alLeggere = {};
function doc(coll, id) {
    const chiave = coll + '/' + id;
    const self = {
        id: id, _chiave: chiave,
        get: async () => {
            letture++;
            const s = istantanea(chiave, self);
            if (alLeggere[chiave]) { const f = alLeggere[chiave]; delete alLeggere[chiave]; await f(); }
            return s;
        },
        set: async (patch, opz) => { dati.set(chiave, applica(dati.get(chiave), patch, !!(opz && opz.merge))); },
        // come Firestore: update sostituisce i campi nominati (anche le mappe intere) e su un documento che non c'e' fallisce
        update: async (patch) => {
            if (!dati.has(chiave)) { const e = new Error('5 NOT_FOUND: No document to update: ' + chiave); e.code = 5; throw e; }
            const base = JSON.parse(JSON.stringify(dati.get(chiave)));
            for (const k of Object.keys(patch)) base[k] = JSON.parse(JSON.stringify(patch[k]));
            dati.set(chiave, base);
        }
    };
    return self;
}
let dopoRicerca = null;
let ricerche = 0;
function interroga(coll, filtri, campi, max) {
    return {
        where(campo, op, val) { return interroga(coll, filtri.concat([[campo, val]]), campi, max); },
        select(...c) { return interroga(coll, filtri, c, max); },
        limit(n) { return interroga(coll, filtri, campi, n); },
        async get() {
            ricerche++;
            const docs = [...dati.keys()].filter(k => k.startsWith(coll + '/') && k.split('/').length === 2)
                // come Firestore: "invio.codice" e' il campo codice dentro invio
                .filter(k => filtri.every(([c, v]) => c.split('.').reduce((o, p) => (o == null ? undefined : o[p]), dati.get(k) || {}) === v))
                .sort()
                .slice(0, max || 1e9)
                .map(k => istantanea(k, doc(coll, k.split('/')[1]), campi));
            letture += docs.length;
            if (dopoRicerca) { const f = dopoRicerca; dopoRicerca = null; await f(); }
            return { docs: docs, forEach: f => docs.forEach(f), size: docs.length };
        }
    };
}
let codaTransazioni = Promise.resolve();
const db = {
    collection(coll) { return Object.assign(interroga(coll, [], null), { doc: id => doc(coll, id) }); },
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
admin.firestore.FieldValue = { delete: () => ({ __del: true }), serverTimestamp: () => orologio };

// ---------- posta finta ----------
let spedite = [];
let guasti = 0;
let durantePosta = null;
const veroRequire = Module.prototype.require;
/* La posta VERA (nodemailer com'e', verso un server finto su questa
   macchina): solo nelle prove che la accendono, per vedere che cosa
   dice davvero nodemailer quando il server si chiude a meta'. */
let postaVera = null;
const nodemailerVero = veroRequire.call(module, path.join(__dirname, '..', 'node_modules', 'nodemailer'));
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return { createTransport: opz => postaVera
        ? nodemailerVero.createTransport(Object.assign({}, opz, { host: '127.0.0.1', port: postaVera.porta, secure: false, ignoreTLS: true }))
        : ({ sendMail: async m => {
        if (durantePosta) { const f = durantePosta; durantePosta = null; await f(); }
        if (guasti > 0) { guasti--; const e = new Error('550 5.1.1 casella inesistente'); e.responseCode = 550; throw e; }
        spedite.push(m); return {};
    } }) };
    return veroRequire.apply(this, arguments);
};
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ client_email: 'servizio@esempio.iam.gserviceaccount.com', private_key: 'chiave-finta' });
process.env.SMTP_FROM_EMAIL = 'noreply@esempio.it';
process.env.CRON_SECRET = 'segreto-cron';
delete process.env.PROMEMORIA_SECONDA_PERSONA;
delete process.env.CONFERMA_RISPONDI_A;

const RADICE = path.join(__dirname, '..');
const cron = require(path.join(RADICE, 'api/promemoria-seconda-persona.js'));
const P2 = require(path.join(RADICE, 'lib/promemoria-seconda-persona.js'));
const V = require(path.join(RADICE, 'lib/iscrizione-verificata.js'));
const CODICI = require(path.join(RADICE, 'lib/codici-invito.js'));

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
/* Zitti anche uno dentro l'altro (due giri insieme): la console vera la
   rimette solo l'ultimo che finisce, altrimenti il primo a finire la
   rimetterebbe muta e i verdetti dopo non si vedrebbero. */
const consoleVera = { error: console.error, log: console.log, warn: console.warn };
let zittiAperti = 0;
async function zitti(fn) {
    if (!zittiAperti++) { console.error = () => { }; console.log = () => { }; console.warn = () => { }; }
    try { return await fn(); }
    finally { if (!--zittiAperti) { console.error = consoleVera.error; console.log = consoleVera.log; console.warn = consoleVera.warn; } }
}
async function giro(intestazioni) {
    let stato = 0, risposta = null;
    const res = { status(s) { stato = s; return res; }, json(c) { risposta = c; return res; } };
    await zitti(() => cron({ method: 'GET', headers: intestazioni === undefined ? { authorization: 'Bearer segreto-cron' } : intestazioni, query: {} }, res));
    return { stato: stato, corpo: risposta || {} };
}
function pulisci() { dati.clear(); spedite = []; guasti = 0; durantePosta = null; dopoRicerca = null; alLeggere = {}; orologio = INIZIO; }

const MILANO = 'Milano 26 Febbraio 2027 - Iscrizione';
let prog = 0;
/* Un'azienda invitata con il suo codice e le sue iscritte.
   opz: { canale, secondoInvio, campagna, persone: [{ confermata (ms fa), annullato, pagina }] } */
function azienda(codice, opz) {
    // un codice con I, L, O o U si leggerebbe diverso (CODICI.normalizza) e la prova passerebbe per sbaglio
    if (CODICI.normalizza(codice) !== codice || !CODICI.valido(codice)) throw new Error('codice di prova non valido: ' + codice);
    opz = opz || {};
    const idAz = 'az' + (++prog);
    const iscritte = [];
    (opz.persone || [{}]).forEach((p, k) => {
        const id = codice.toLowerCase() + '-' + k + '@ditta.it|16-11-2026';
        iscritte.push(id);
        const x = {
            pagina: p.pagina || MILANO, data: '16/11/2026', nome: 'Pia', cognome: 'Rossi' + k, email: codice.toLowerCase() + '-' + k + '@ditta.it',
            azienda: 'Scritta a mano', invitoCodice: codice, invitoAzienda: 'Alfa ' + codice + ' S.r.l.', invitoScheda: idAz, selezionata: true
        };
        if (p.confermata !== null) x.emailConfermata = { quando: orologio - (p.confermata === undefined ? 2 * GIORNO : p.confermata), come: 'mail' };
        if (p.annullato) x.annullato = true;
        dati.set('iscrizioni/' + id, x);
    });
    dati.set('codiciInvito/' + codice, {
        codice: codice, evento: 'milano-2027-02-26', scheda: idAz, campagna: opz.campagna || 'invito',
        ragioneSociale: 'Alfa ' + codice + ' S.r.l.', pagina: 'Milano 26 Febbraio 2027', creato: 1, usato: null,
        iscrizioniUsate: iscritte.slice()
    });
    const a = { ragioneSociale: 'Alfa ' + codice + ' S.r.l.', codice: codice, invio: { canale: opz.canale || 'pec', codice: codice, quando: 1 } };
    if (opz.secondoInvio) a.secondoInvio = { canale: opz.secondoInvio, quando: 2 };
    dati.set('aziendeInvito/' + idAz, a);
    return { idAz: idAz, iscritte: iscritte };
}
const codice = c => dati.get('codiciInvito/' + c) || {};
const scheda = id => dati.get('iscrizioni/' + id) || {};

(async () => {
    console.log('\nL\'orario');
    esigi(P2.inOrario(Date.parse('2026-11-16T09:00:00+01:00')), 'lunedi\' alle 9 si lavora');
    esigi(P2.inOrario(Date.parse('2026-11-20T18:59:00+01:00')), 'venerdi\' alle 18:59 si lavora');
    esigi(!P2.inOrario(Date.parse('2026-11-16T08:59:00+01:00')), 'prima delle 9 no');
    esigi(!P2.inOrario(Date.parse('2026-11-16T19:00:00+01:00')), 'dalle 19 no');
    esigi(!P2.inOrario(Date.parse('2026-11-21T11:00:00+01:00')), 'sabato no');
    esigi(!P2.inOrario(Date.parse('2026-11-22T11:00:00+01:00')), 'domenica no');
    // venerdi' 23 ottobre 2026 e' ancora ora legale: le 9 di Milano sono le 7 UTC
    esigi(P2.inOrario(Date.parse('2026-10-23T07:00:00Z')) && !P2.inOrario(Date.parse('2026-10-23T06:59:00Z')), 'con l\'ora legale le 9 di Milano sono le 7 UTC');
    const cronSorgente = JSON.parse(fs.readFileSync(path.join(RADICE, 'vercel.json'), 'utf8'));
    const voce = cronSorgente.crons.find(c => c.path === '/api/promemoria-seconda-persona');
    esigi(voce && /\* \* 1-5$/.test(voce.schedule) && /7-18/.test(voce.schedule), 'il cron gira nei giorni feriali, e le ore UTC coprono le 9-19 di Milano con l\'ora legale e con la solare', voce && voce.schedule);
    esigi(cronSorgente.functions['api/promemoria-seconda-persona.js'] && cronSorgente.functions['api/promemoria-seconda-persona.js'].maxDuration === 60, 'la funzione ha 60 secondi');

    console.log('\nLa protezione, l\'interruttore, l\'orario');
    pulisci();
    azienda('A1111');
    let r = await giro({});
    esigi(r.stato === 401 && !spedite.length, 'senza il segreto: 401 e niente posta');
    r = await giro({ authorization: 'Bearer sbagliato' });
    esigi(r.stato === 401, 'con il segreto sbagliato: 401');
    process.env.PROMEMORIA_SECONDA_PERSONA = 'no';
    letture = 0;
    r = await giro();
    esigi(r.stato === 200 && r.corpo.spento === true && !spedite.length && letture === 0, 'spento: risponde spento, non legge e non spedisce');
    delete process.env.PROMEMORIA_SECONDA_PERSONA;
    orologio = Date.parse('2026-11-21T11:00:00+01:00');
    letture = 0;
    r = await giro();
    esigi(r.corpo.fuoriOrario === true && !spedite.length && letture === 0, 'sabato: fuori orario, non legge niente');

    console.log('\nL\'azienda con una persona sola');
    pulisci();
    const a1 = azienda('A1111');
    r = await giro();
    esigi(r.stato === 200 && r.corpo.inviate === 1 && spedite.length === 1, 'parte una mail', JSON.stringify(r.corpo));
    const m = spedite[0] || {};
    esigi(m.to === 'a1111-0@ditta.it', 'all\'indirizzo verificato della persona', m.to);
    esigi(typeof m.text === 'string' && m.html === undefined && !m.attachments, 'solo testo: niente HTML, niente allegati');
    esigi(/\n\nA1111\n\n/.test(m.text || ''), 'il codice riservato sta da solo sulla sua riga');
    esigi(/Alfa A1111 S\.r\.l\./.test(m.text || '') && !/Scritta a mano/.test(m.text || ''), 'la ragione sociale e\' quella dell\'invito');
    esigi(/due persone/.test(m.text || '') && /prima che i posti si esauriscano/.test(m.text || ''), 'dice che l\'invito e\' per due e di registrare la seconda prima che finiscano i posti');
    esigi(/https:\/\/nextgenerationbusiness\.it\/milano_febbraio_2027\/#iscrizioni/.test(m.text || ''), 'porta al modulo della pagina di Milano');
    esigi(/^Gentile Pia Rossi0,/.test(m.text || ''), 'si apre con il nome della persona');
    esigi(/venerdì 26 febbraio 2027/.test(m.text || '') && /Excelsior Hotel Gallia/.test(m.text || ''), 'dice giorno e sede');
    esigi(/due persone/.test(m.subject || '') && /Milano 26 Febbraio 2027/.test(m.subject || ''), 'l\'oggetto lo dice', m.subject);
    esigi(m.replyTo === 'info@nextgenerationbusiness.it' && /noreply@esempio\.it/.test(m.from || ''), 'mittente delle conferme, "Rispondi" a info@');
    esigi(m.headers && m.headers['X-Mailin-Tag'] === 'seconda-persona', 'il tag per i log di Brevo');
    const sp = codice('A1111').secondaPersona || {};
    esigi(sp.stato === 'inviata' && sp.iscrizione === a1.iscritte[0] && sp.a === 'a1111-0@ditta.it' && sp.tentativi === 1 && !sp.errore, 'sul codice resta il segno "inviata"', JSON.stringify(sp));
    esigi(scheda(a1.iscritte[0]).promemoriaSecondaPersona && scheda(a1.iscritte[0]).promemoriaSecondaPersona.ok === true, 'e sulla scheda');
    letture = 0;
    r = await giro();
    esigi(r.corpo.inviate === 0 && spedite.length === 1 && r.corpo.candidate === 0, 'il giro dopo non la rimanda');
    esigi(letture <= 3, 'e legge solo la ricerca e il lucchetto', String(letture));
    // la persona annulla e se ne iscrive un'altra, da sola
    dati.get('iscrizioni/' + a1.iscritte[0]).annullato = true;
    dati.set('iscrizioni/nuova@ditta.it|17-11-2026', { pagina: MILANO, nome: 'Ugo', cognome: 'Neri', email: 'nuova@ditta.it', invitoCodice: 'A1111', selezionata: true, emailConfermata: { quando: orologio - 2 * GIORNO } });
    codice('A1111').iscrizioniUsate.push('nuova@ditta.it|17-11-2026');
    r = await giro();
    esigi(spedite.length === 1, 'una per azienda: annullata la prima, la nuova iscritta da sola non la riceve');

    console.log('\nQuando non parte');
    pulisci();
    azienda('B2222', { persone: [{}, {}] });
    azienda('C3333', { persone: [{}, { annullato: true }] });
    azienda('D4444', { persone: [{ confermata: null }] });
    azienda('E5555', { persone: [{ confermata: 23 * ORA }] });
    azienda('F6666', { canale: 'email' });
    azienda('G7777', { campagna: 'sponsor' });
    azienda('H8888', { persone: [{ pagina: 'Napoli 2 Ottobre 2026 - Iscrizione' }] });
    azienda('J9999', { canale: 'email', secondoInvio: 'pec' });
    r = await giro();
    const a = spedite.map(x => x.to).sort();
    esigi(a.length === 2 && a[0] === 'c3333-0@ditta.it' && a[1] === 'j9999-0@ditta.it', 'partono solo C (una delle due annullata) e J (secondo invio per PEC)', a.join(', '));
    esigi(!codice('B2222').secondaPersona, 'due iscritte attive: niente');
    esigi(!codice('D4444').secondaPersona && !codice('E5555').secondaPersona, 'email non confermata, o confermata da meno di un giorno: niente (e nessun segno)');
    esigi(r.corpo.escluse === 2, 'per email ordinaria e sponsor: escluse', JSON.stringify(r.corpo));
    esigi(scheda('f6666-0@ditta.it|16-11-2026').promemoriaSecondaPersona && scheda('f6666-0@ditta.it|16-11-2026').promemoriaSecondaPersona.escluso === 'pec', 'l\'esclusa per l\'email ordinaria resta segnata sulla scheda');
    esigi(scheda('g7777-0@ditta.it|16-11-2026').promemoriaSecondaPersona && scheda('g7777-0@ditta.it|16-11-2026').promemoriaSecondaPersona.escluso === 'campagna', 'quella dello sponsor pure');
    esigi(!codice('H8888').secondaPersona && !scheda('h8888-0@ditta.it|16-11-2026').promemoriaSecondaPersona, 'Napoli (senza tetto per codice): non la guarda nemmeno');
    r = await giro();
    esigi(r.corpo.candidate === 0 && spedite.length === 2, 'il giro dopo le escluse non si rileggono', JSON.stringify(r.corpo));
    // un'ora dopo E ha passato il giorno dalla conferma
    orologio += ORA + MIN;
    r = await giro();
    esigi(spedite.length === 3 && spedite[2].to === 'e5555-0@ditta.it', 'passato il giorno dalla conferma, parte');
    // D conferma adesso: aspetta un giorno
    dati.get('iscrizioni/d4444-0@ditta.it|16-11-2026').emailConfermata = { quando: orologio, come: 'mail' };
    orologio += GIORNO - MIN;
    await giro();
    esigi(spedite.length === 3, 'confermata da poco: ancora niente');
    orologio += 2 * MIN;
    await giro();
    esigi(spedite.length === 4 && spedite[3].to === 'd4444-0@ditta.it', 'e a un giorno dalla conferma parte');

    console.log('\nLa rilettura');
    pulisci();
    azienda('K1111');
    dopoRicerca = async () => {
        // fra la ricerca e l'invio si iscrive il collega
        dati.set('iscrizioni/collega@ditta.it|16-11-2026', { pagina: MILANO, nome: 'Leo', cognome: 'Bo', email: 'collega@ditta.it', invitoCodice: 'K1111', selezionata: true });
        codice('K1111').iscrizioniUsate.push('collega@ditta.it|16-11-2026');
    };
    r = await giro();
    esigi(!spedite.length && r.corpo.saltate === 1 && !codice('K1111').secondaPersona, 'un secondo iscritto arrivato nel frattempo ferma la mail, senza segni');
    pulisci();
    const w1 = azienda('W1111');
    dopoRicerca = async () => { dati.get('iscrizioni/' + w1.iscritte[0]).annullato = true; };
    r = await giro();
    esigi(!spedite.length && !codice('W1111').secondaPersona, 'annullata nel frattempo: niente');
    pulisci();
    const w2 = azienda('W2222');
    durantePosta = async () => { dati.delete('iscrizioni/' + w2.iscritte[0]); };
    r = await giro();
    esigi(spedite.length === 1 && !dati.has('iscrizioni/' + w2.iscritte[0]), 'cancellata mentre la mail parte: la scheda non rinasce', JSON.stringify(r.corpo) + ' ' + JSON.stringify(codice('W2222').secondaPersona));
    esigi(codice('W2222').secondaPersona && codice('W2222').secondaPersona.stato === 'inviata', 'e il segno sul codice c\'e\'');

    console.log('\nIl server di posta');
    pulisci();
    azienda('M1111');
    guasti = 1;
    r = await giro();
    let s = codice('M1111').secondaPersona || {};
    esigi(!spedite.length && s.stato === 'errore' && s.tentativi === 1 && s.prossimo === orologio + 30 * MIN && /550/.test(s.errore), 'un no: "errore", si riprova fra mezz\'ora', JSON.stringify(s));
    esigi(!scheda('m1111-0@ditta.it|16-11-2026').promemoriaSecondaPersona, 'la scheda resta senza segno: il giro la ritrova');
    orologio += 29 * MIN;
    r = await giro();
    esigi(!spedite.length && r.corpo.aspettano === 1, 'prima della mezz\'ora aspetta', JSON.stringify(r.corpo));
    orologio += 2 * MIN;
    guasti = 1;
    await giro();
    s = codice('M1111').secondaPersona || {};
    esigi(s.stato === 'errore' && s.tentativi === 2 && s.prossimo === orologio + 3 * ORA, 'il secondo no: si riprova fra tre ore');
    esigi(!s.fino, 'e la presa non resta attaccata al segno');
    orologio += 3 * ORA;
    guasti = 1;
    await giro();
    s = codice('M1111').secondaPersona || {};
    esigi(s.stato === 'non-partita' && s.tentativi === 3, 'il terzo no: "non-partita"');
    esigi(scheda('m1111-0@ditta.it|16-11-2026').promemoriaSecondaPersona && scheda('m1111-0@ditta.it|16-11-2026').promemoriaSecondaPersona.ok === false, 'e sulla scheda il segno con ok falso');
    orologio += GIORNO;
    await giro();
    esigi(!spedite.length, 'poi basta');
    pulisci();
    azienda('M2222');
    guasti = 1;
    await giro();
    orologio += 31 * MIN;
    await giro();
    s = codice('M2222').secondaPersona || {};
    esigi(spedite.length === 1 && s.stato === 'inviata' && s.tentativi === 2 && !s.errore && !s.prossimo, 'riprovata e partita: "inviata", senza l\'errore di prima', JSON.stringify(s));

    console.log('\nL\'esito incerto');
    pulisci();
    azienda('N1111');
    let conti = await zitti(() => P2.giro(db, { spedisci: () => new Promise(() => { }), limiteInvio: 50 }));
    s = codice('N1111').secondaPersona || {};
    esigi(conti.incerte === 1 && s.stato === 'incerta', 'il server non risponde: "incerta"', JSON.stringify(conti));
    conti = await zitti(() => P2.giro(db, { spedisci: async x => { spedite.push(x); } }));
    esigi(!spedite.length, 'e non si riprova');
    pulisci();
    azienda('N2222');
    // la funzione si e' chiusa dopo aver preso il codice e prima di scrivere com'e' andata
    codice('N2222').secondaPersona = { stato: 'in-corso', quando: orologio, iscrizione: 'n2222-0@ditta.it|16-11-2026', a: 'n2222-0@ditta.it', tentativi: 0, errore: '', prossimo: 0, fino: orologio + P2.IN_CORSO_MS };
    r = await giro();
    esigi(!spedite.length && codice('N2222').secondaPersona.stato === 'in-corso', 'una presa ancora valida: si lascia stare');
    orologio += P2.IN_CORSO_MS + 1;
    r = await giro();
    esigi(!spedite.length && codice('N2222').secondaPersona.stato === 'incerta' && r.corpo.incerte === 1, 'scaduta: diventa "incerta", senza spedire');
    esigi(scheda('n2222-0@ditta.it|16-11-2026').promemoriaSecondaPersona, 'e la scheda esce dal giro');

    console.log('\nUn giro alla volta, e quanti per giro');
    pulisci();
    azienda('P1111');
    let lenta = null;
    const g1 = zitti(() => P2.giro(db, { spedisci: x => new Promise(ok => { lenta = () => { spedite.push(x); ok(); }; }) }));
    await new Promise(t => setTimeout(t, 20));
    const c2 = await zitti(() => P2.giro(db, { spedisci: async x => { spedite.push(x); } }));
    lenta && lenta();
    await g1;
    esigi(c2.occupato === true, 'un secondo giro trova il lucchetto e non fa niente');
    esigi(spedite.length === 1, 'una mail sola');
    pulisci();
    for (let k = 0; k < 20; k++) azienda('Q' + String(1000 + k));
    r = await giro();
    esigi(r.corpo.inviate === P2.PER_GIRO && r.corpo.rimaste === 20 - P2.PER_GIRO, 'al piu\' ' + P2.PER_GIRO + ' mail a giro, le altre rimaste', JSON.stringify(r.corpo));
    r = await giro();
    esigi(spedite.length === 20 && r.corpo.inviate === 5, 'le altre al giro dopo');
    esigi(new Set(spedite.map(x => x.to)).size === 20, 'nessuna due volte');
    pulisci();
    // venti escluse confermate prima (in testa alla fila) e una buona confermata dopo
    for (let k = 0; k < 20; k++) azienda('R' + String(1000 + k), { canale: 'email', persone: [{ confermata: 5 * GIORNO }] });
    azienda('S1111');
    r = await giro();
    esigi(spedite.length === 1 && spedite[0].to === 's1111-0@ditta.it' && r.corpo.escluse === 20, 'le escluse in testa non tengono indietro le altre', JSON.stringify(r.corpo));
    pulisci();
    azienda('T1111');
    // la ricerca ha preso piu' del tempo concesso
    dopoRicerca = async () => { orologio += 10; };
    r = await zitti(() => P2.giro(db, { budget: 5, spedisci: async x => { spedite.push(x); } }));
    esigi(r.rimaste === 1 && !spedite.length, 'a tempo finito non comincia niente');

    console.log('\nLa fine dell\'evento');
    pulisci();
    orologio = Date.parse('2027-02-25T17:59:00+01:00');
    azienda('V1111');
    r = await giro();
    esigi(spedite.length === 1, 'fino a un giorno prima della fine parte', JSON.stringify(r.corpo));
    pulisci();
    orologio = Date.parse('2027-02-25T18:00:00+01:00');
    azienda('V2222');
    await giro();
    esigi(!spedite.length, 'dopo, non parte piu\'');

    console.log('\nUna per azienda: il segno sul codice');
    pulisci();
    const x1 = azienda('X1111');
    await giro();
    esigi(spedite.length === 1, 'partita la prima');
    // la segreteria cancella la prima iscritta (presenze, 'cancella'): il segno sulla scheda se ne va con lei
    dati.delete('iscrizioni/' + x1.iscritte[0]);
    dati.set('iscrizioni/sola@ditta.it|18-11-2026', { pagina: MILANO, nome: 'Eva', cognome: 'Sola', email: 'sola@ditta.it', invitoCodice: 'X1111', selezionata: true, emailConfermata: { quando: orologio - 2 * GIORNO } });
    codice('X1111').iscrizioniUsate = ['sola@ditta.it|18-11-2026'];
    r = await giro();
    esigi(spedite.length === 1 && r.corpo.inviate === 0, 'la nuova iscritta da sola non la riceve: la ferma il segno sul codice', JSON.stringify(r.corpo));
    esigi(scheda('sola@ditta.it|18-11-2026').promemoriaSecondaPersona && scheda('sola@ditta.it|18-11-2026').promemoriaSecondaPersona.ok === true, 'e la nuova scheda prende il segno dal codice');
    letture = 0;
    await giro();
    esigi(letture <= 3, 'e dal giro dopo non si rilegge piu\' il codice', String(letture));

    console.log('\nLa scheda dell\'azienda');
    pulisci();
    {
        // Modifica del recapito: la scheda cambia nome, il codice la segue, l'iscrizione resta con il nome vecchio
        const sp = azienda('K2345');
        const v = dati.get('aziendeInvito/' + sp.idAz);
        dati.delete('aziendeInvito/' + sp.idAz);
        dati.set('aziendeInvito/nuovo-id', v);
        dati.get('codiciInvito/K2345').scheda = 'nuovo-id';
        r = await giro();
        esigi(spedite.length === 1 && spedite[0].to === 'k2345-0@ditta.it', 'scheda spostata: la ritrova dal codice', JSON.stringify(r.corpo));
    }
    pulisci();
    {
        // il codice punta a una scheda che non c'e' piu', l'iscrizione a quella giusta
        const sp = azienda('K3456');
        dati.get('codiciInvito/K3456').scheda = 'sparita';
        r = await giro();
        esigi(spedite.length === 1, 'il codice punta nel vuoto: la ritrova dall\'iscrizione', JSON.stringify(r.corpo));
    }
    pulisci();
    {
        // nessuno dei due nomi porta alla scheda: la si cerca per codice
        const sp = azienda('K4567');
        const v = dati.get('aziendeInvito/' + sp.idAz);
        dati.delete('aziendeInvito/' + sp.idAz);
        dati.set('aziendeInvito/altro-nome', v);
        // il guscio che l'iscrizione riscrive sul nome vecchio non e' una scheda di invito
        dati.set('aziendeInvito/' + sp.idAz, { stato: 'iscritta', iscritti: [{ quando: 1 }] });
        r = await giro();
        esigi(spedite.length === 1, 'la ritrova per codice, e il guscio senza invio non conta', JSON.stringify(r.corpo));
    }
    pulisci();
    {
        const sp = azienda('K5678');
        const v = dati.get('aziendeInvito/' + sp.idAz);
        dati.delete('aziendeInvito/' + sp.idAz);
        r = await giro();
        esigi(!spedite.length && r.corpo.saltate === 1 && r.corpo.escluse === 0, 'nessuna scheda: si salta', JSON.stringify(r.corpo));
        esigi(!scheda(sp.iscritte[0]).promemoriaSecondaPersona && !codice('K5678').secondaPersona, 'senza segnare niente');
        dati.set('aziendeInvito/' + sp.idAz, v);
        r = await giro();
        esigi(spedite.length === 1, 'tornata la scheda, parte');
    }
    pulisci();
    {
        // spostata prima del 22 ottobre 2026: sulla scheda nuova il codice c'e' solo dentro l'invio
        const sp = azienda('K6789');
        const v = dati.get('aziendeInvito/' + sp.idAz);
        delete v.codice;
        dati.delete('aziendeInvito/' + sp.idAz);
        dati.set('aziendeInvito/spostata', v);
        dati.set('aziendeInvito/' + sp.idAz, { stato: 'iscritta', iscritti: [{ quando: 1 }] });
        r = await giro();
        esigi(spedite.length === 1, 'la ritrova anche dal codice dell\'invio', JSON.stringify(r.corpo));
    }
    pulisci();
    {
        // il nome vecchio rinato dal file e invitato per email con un codice NUOVO: non dice niente di questo codice
        const sp = azienda('K7890');
        const v = dati.get('aziendeInvito/' + sp.idAz);
        delete v.codice;
        dati.set('aziendeInvito/spostata', v);
        dati.set('aziendeInvito/' + sp.idAz, { ragioneSociale: 'Alfa', codice: 'M9999', invio: { canale: 'email', codice: 'M9999' } });
        r = await giro();
        esigi(spedite.length === 1 && !scheda(sp.iscritte[0]).promemoriaSecondaPersona.escluso, 'una scheda con un altro codice non conta: vale quella con questo', JSON.stringify(r.corpo));
    }

    console.log('\nL\'invito partito per PEC');
    pulisci();
    {
        // PEC consegnata, poi un nuovo invio forzato per email ordinaria: invio.canale e' 'email'
        const sp = azienda('Y1111', { canale: 'email' });
        dati.get('aziendeInvito/' + sp.idAz).ricevute = { accettata: { quando: 1 }, consegnata: { quando: 2 }, problema: null, risposta: null };
        // PEC dall'esito mai scritto, poi sistemata dalle ricevute: un invio senza canale
        const sq = azienda('Y2222');
        dati.get('aziendeInvito/' + sq.idAz).invio = { destinatario: 'pec@ditta.it', pecMsgId: 'x' };
        dati.get('aziendeInvito/' + sq.idAz).errore = { quando: 1, canale: 'pec', incerto: true };
        // solo accettata, e il codice mandato per email: fuori
        const sr = azienda('Y3333', { canale: 'email' });
        dati.get('aziendeInvito/' + sr.idAz).ricevute = { accettata: { quando: 1 }, consegnata: null };
        r = await giro();
        const a2 = spedite.map(x => x.to).sort();
        esigi(a2.length === 2 && a2[0] === 'y1111-0@ditta.it' && a2[1] === 'y2222-0@ditta.it', 'la consegna della PEC e la PEC dall\'esito ignoto valgono; la sola accettazione no', a2.join(', '));
    }
    esigi(P2.invitataPerPec({ tentativo: { canale: 'pec' } }) && !P2.invitataPerPec({ invio: { canale: 'email' }, tentativo: { canale: 'pec' } }), 'il tentativo PEC rimasto vale solo senza un invio dopo');
    esigi(!P2.invitataPerPec({ invio: { canale: 'email' }, errore: { canale: 'pec', incerto: true } }), 'e cosi\' l\'errore incerto');

    console.log('\nGli errori del server di posta');
    const err = (msg, campi) => Object.assign(new Error(msg), campi || {});
    esigi(P2.esitoErrore(err('Timeout', { code: 'ETIMEDOUT', command: 'CONN' })) === 'incerta', 'tempo scaduto a connessione aperta: incerta');
    esigi(P2.esitoErrore(err('Connection closed unexpectedly', { code: 'ECONNECTION', command: 'CONN' })) === 'incerta', 'connessione caduta: incerta');
    esigi(P2.esitoErrore(err('qualcosa')) === 'incerta', 'un errore senza risposta del server: incerta');
    esigi(P2.esitoErrore(err('Invalid login: 535 Authentication failed', { code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 535 })) === 'nostro', 'credenziali: guasto nostro');
    esigi(P2.esitoErrore(err('Connection timeout', { code: 'ETIMEDOUT', command: 'CONN' })) === 'nostro', 'server irraggiungibile: guasto nostro');
    esigi(P2.esitoErrore(err('421 Service not available', { code: 'EPROTOCOL', command: 'CONN', responseCode: 421 })) === 'nostro', '421: guasto nostro');
    esigi(P2.esitoErrore(err('554 5.7.1 message rejected as spam', { code: 'EMESSAGE', command: 'DATA', responseCode: 554 })) === 'nostro', 'rifiutata come spam: guasto nostro');
    esigi(P2.esitoErrore(err('550 5.1.1 user unknown', { code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 })) === 'conta', 'destinatario rifiutato: un tentativo');
    esigi(P2.esitoErrore(err('452 4.2.2 mailbox full', { code: 'EENVELOPE', command: 'RCPT TO', responseCode: 452 })) === 'conta', 'casella piena del destinatario: un tentativo');
    pulisci();
    azienda('Z1111');
    azienda('Z2222', { persone: [{ confermata: GIORNO + ORA }] });
    // il server riceve il messaggio, poi non risponde piu': nodemailer dice 'Timeout'
    const consegnaPoiTimeout = async x => { spedite.push(x); throw err('Timeout', { code: 'ETIMEDOUT', command: 'CONN' }); };
    conti = await zitti(() => P2.giro(db, { spedisci: consegnaPoiTimeout }));
    esigi(spedite.length === 1 && codice('Z1111').secondaPersona.stato === 'incerta' && conti.incerte === 1, 'consegnata e poi tempo scaduto: incerta', JSON.stringify(conti));
    esigi(conti.bloccato && conti.rimaste === 1 && !codice('Z2222').secondaPersona, 'e il giro si ferma: l\'altra azienda aspetta il giro dopo', JSON.stringify(conti));
    orologio += 4 * ORA;
    conti = await zitti(() => P2.giro(db, { spedisci: async x => { spedite.push(x); } }));
    const zz = spedite.map(x => x.to);
    esigi(zz.filter(t => t === 'z1111-0@ditta.it').length === 1 && zz.indexOf('z2222-0@ditta.it') >= 0, 'la prima non si rimanda, l\'altra parte', zz.join(', '));
    pulisci();
    for (let k = 0; k < 4; k++) azienda('AA' + String(100 + k));
    const auth = async () => { throw err('Invalid login: 535 Authentication failed', { code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 535 }); };
    let prove = 0, piuDiUna = 0;
    for (let k = 0; k < 12; k++) {
        let qui = 0;
        conti = await zitti(() => P2.giro(db, { spedisci: x => { prove++; qui++; return auth(x); } }));
        if (qui > 1) piuDiUna++;
        orologio += 20 * MIN;
    }
    const stati = ['AA100', 'AA101', 'AA102', 'AA103'].map(c => codice(c).secondaPersona || {});
    esigi(stati.every(x => !x.stato || (x.stato === 'errore' && x.tentativi === 0)) && stati.filter(x => x.stato).length >= 2, 'credenziali sbagliate per quattro ore: nessuna azienda consuma i tentativi', JSON.stringify(stati.map(x => x.stato + '/' + x.tentativi + '/' + x.rinvii)));
    esigi(!piuDiUna && prove >= 4, 'al piu\' una prova per giro', prove + ' prove');
    esigi(stati.some(x => x.rinvii >= 2 && x.prossimo - x.quando > 30 * MIN), 'e la stessa azienda riprova sempre piu\' di rado', JSON.stringify(stati.map(x => x.rinvii + ':' + Math.round((x.prossimo - x.quando) / MIN))));
    esigi(/535/.test(conti.bloccato) || conti.candidate > 0, 'i conti dicono perche\' il giro si e\' fermato', conti.bloccato);
    // sistemato il guasto: il mattino dopo partono tutte
    orologio = Date.parse('2026-11-17T10:00:00+01:00');
    await giro();
    esigi(spedite.length === 4, 'sistemato il guasto, partono tutte', String(spedite.length));
    esigi(P2.pausaGuasto(0) === 30 * MIN && P2.pausaGuasto(1) === ORA && P2.pausaGuasto(10) === GIORNO, 'le pause del guasto: mezz\'ora, un\'ora, ... fino a un giorno');

    console.log('\nGli errori che dicono "guasto nostro" anche sul destinatario');
    const rcpt = (cod, testo) => err('Can\'t send mail - all recipients were rejected: ' + cod + ' ' + testo, { code: 'EENVELOPE', command: 'RCPT TO', responseCode: Number(cod) });
    esigi(P2.esitoErrore(err('Missing credentials for "PLAIN"', { code: 'EAUTH', command: 'API' })) === 'nostro', 'credenziali mancanti su Vercel: guasto nostro');
    esigi(P2.esitoErrore(rcpt(421, '4.7.0 Service not available, closing transmission channel')) === 'nostro', '421 sul destinatario: guasto nostro');
    esigi(P2.esitoErrore(rcpt(450, '4.7.1 <a@b.it>: Recipient address rejected: Rate limit exceeded')) === 'nostro', 'tetto di invio sul destinatario: guasto nostro');
    esigi(P2.esitoErrore(rcpt(452, '4.5.3 Too many recipients')) === 'nostro', 'troppi destinatari: guasto nostro');
    esigi(P2.esitoErrore(rcpt(550, '5.4.5 Daily user sending quota exceeded')) === 'nostro', 'quota del giorno: guasto nostro');
    esigi(P2.esitoErrore(rcpt(554, '5.7.1 <a@b.it>: Relay access denied')) === 'nostro', 'relay negato: guasto nostro');
    esigi(P2.esitoErrore(rcpt(550, '5.1.1 <a@b.it>: user unknown')) === 'conta' && P2.esitoErrore(rcpt(452, '4.2.2 mailbox full')) === 'conta', 'casella inesistente o piena: un tentativo');
    esigi(P2.esitoErrore(err('Empty message', { code: 'EMESSAGE', command: 'API' })) === 'nostro' && P2.esitoErrore(err('Invalid recipient', { code: 'EENVELOPE', command: 'API' })) === 'conta', 'gli errori di nodemailer prima del server: del canale, salvo l\'indirizzo malformato');
    esigi(P2.esitoErrore(err('self-signed certificate', { code: 'ESOCKET', command: 'CONN' })) === 'nostro', 'certificato TLS rifiutato: guasto nostro');
    esigi(P2.esitoErrore(err('connect ECONNRESET 1.2.3.4:465', { code: 'ESOCKET', command: 'CONN', syscall: 'connect' })) === 'nostro', 'connessione azzerata all\'apertura: guasto nostro');
    esigi(P2.esitoErrore(err('Unexpected socket close')) === 'nostro', 'chiusa prima del saluto: guasto nostro');
    esigi(P2.esitoErrore(err('read ECONNRESET', { code: 'ESOCKET', command: 'CONN', syscall: 'read' })) === 'incerta', 'azzerata a sessione aperta, senza sapere a che punto: incerta');
    esigi(P2.esitoErrore(err('Timeout', { code: 'ETIMEDOUT', command: 'CONN' }), { seguita: true, data: false, corpo: false }) === 'nostro', 'tempo scaduto prima di DATA (lo dice la posta del giro): guasto nostro');
    esigi(P2.esitoErrore(err('Timeout', { code: 'ETIMEDOUT', command: 'CONN' }), { seguita: true, data: true, corpo: false }) === 'nostro', 'tempo scaduto dopo DATA ma prima del via al testo: guasto nostro');
    esigi(P2.esitoErrore(err('Timeout', { code: 'ETIMEDOUT', command: 'CONN' }), { seguita: true, data: true, corpo: true }) === 'incerta', 'tempo scaduto dopo il via al testo: incerta');
    esigi(P2.esitoErrore(Object.assign(err('tempo scaduto'), { limite: true, primaDelCorpo: true })) === 'nostro' && P2.esitoErrore(Object.assign(err('tempo scaduto'), { limite: true })) === 'incerta', 'il tempo massimo: nostro solo se ha chiuso prima del testo');
    esigi(P2.esitoErrore(rcpt(450, '4.1.8 <noreply@esempio.it>: Sender address rejected: Domain not found')) === 'nostro', 'mittente rifiutato sul destinatario: guasto nostro');
    esigi(P2.esitoErrore(rcpt(553, '5.1.8 <noreply@esempio.it>: Sender address rejected')) === 'nostro', 'mittente rifiutato (5.1.8): guasto nostro');
    esigi(P2.esitoErrore(rcpt(454, '4.7.1 <a@b.it>: Relay access denied')) === 'nostro', '454 sul destinatario: guasto nostro');

    console.log('\nCon il vero nodemailer, contro un server finto');
    /* Un server SMTP di poche righe: saluta, risponde a EHLO, MAIL, RCPT e
       DATA, e chiude la connessione nel punto che la prova sceglie. */
    const net = require('net');
    let modo = 'ok', corpi = 0, comandiData = 0, ritardo = 0;
    const aperte = new Set();
    const server = net.createServer(sock => {
        aperte.add(sock);
        sock.on('close', () => aperte.delete(sock));
        let buf = '', inCorpo = false;
        // le risposte, con il ritardo che la prova sceglie
        const w = sock.write.bind(sock);
        sock.write = t => { if (!ritardo) return w(t); setTimeout(() => { if (!sock.destroyed) w(t); }, ritardo); return true; };
        sock.write('220 finto ESMTP\r\n');
        sock.on('data', d => {
            buf += d.toString('latin1');
            for (;;) {
                if (inCorpo) {
                    const i = buf.indexOf('\r\n.\r\n');
                    if (i < 0) return;
                    buf = buf.slice(i + 5); inCorpo = false; corpi++;
                    if (modo === 'chiudiDopoCorpo') { sock.destroy(); return; }
                    if (modo === 'mutoDopoCorpo') return;
                    sock.write('250 2.0.0 Ok: queued\r\n');
                    continue;
                }
                const i = buf.indexOf('\r\n');
                if (i < 0) return;
                const riga = buf.slice(0, i).toUpperCase(); buf = buf.slice(i + 2);
                if (/^(EHLO|HELO)/.test(riga)) sock.write('250-finto\r\n250 8BITMIME\r\n');
                else if (/^MAIL FROM/.test(riga)) { if (modo === 'mutoSuMail') return; sock.write('250 2.1.0 Ok\r\n'); }
                else if (/^RCPT TO/.test(riga)) {
                    if (modo === 'chiudiDopoRcpt') { sock.destroy(); return; }
                    if (modo === 'rcpt421') { sock.write('421 4.7.0 Service not available, closing transmission channel\r\n'); sock.end(); return; }
                    sock.write('250 2.1.5 Ok\r\n');
                } else if (/^DATA/.test(riga)) {
                    comandiData++;
                    if (modo === 'chiudiSuData') { sock.destroy(); return; }
                    if (modo === 'mutoSuData') return;
                    sock.write('354 End data with <CR><LF>.<CR><LF>\r\n'); inCorpo = true;
                }
                else if (/^QUIT/.test(riga)) { sock.write('221 Bye\r\n'); sock.end(); }
                else sock.write('250 Ok\r\n');
            }
        });
        sock.on('error', () => { });
    });
    await new Promise(ok => server.listen(0, '127.0.0.1', ok));
    postaVera = { porta: server.address().port };
    try {
        pulisci();
        azienda('BB111');
        modo = 'chiudiDopoRcpt';
        conti = await zitti(() => P2.giro(db, {}));
        let s1 = codice('BB111').secondaPersona || {};
        esigi(s1.stato === 'errore' && s1.tentativi === 0 && corpi === 0 && conti.bloccato, 'chiusa dopo RCPT, prima di DATA: guasto nostro, il tentativo non conta', JSON.stringify(s1) + ' ' + JSON.stringify(conti));
        pulisci(); corpi = 0;
        azienda('BB222');
        modo = 'rcpt421';
        conti = await zitti(() => P2.giro(db, {}));
        s1 = codice('BB222').secondaPersona || {};
        esigi(s1.stato === 'errore' && s1.tentativi === 0 && conti.bloccato, '421 sul destinatario: guasto nostro', JSON.stringify(s1));
        pulisci(); corpi = 0;
        azienda('BB333');
        modo = 'chiudiDopoCorpo';
        conti = await zitti(() => P2.giro(db, {}));
        s1 = codice('BB333').secondaPersona || {};
        esigi(s1.stato === 'incerta' && corpi === 1, 'chiusa dopo aver ricevuto il messaggio: incerta', JSON.stringify(s1));
        modo = 'ok';
        orologio += 4 * ORA;
        await zitti(() => P2.giro(db, {}));
        esigi(corpi === 1, 'e non si rimanda');
        pulisci(); corpi = 0;
        azienda('BB444');
        modo = 'ok';
        conti = await zitti(() => P2.giro(db, {}));
        esigi(conti.inviate === 1 && corpi === 1 && (codice('BB444').secondaPersona || {}).stato === 'inviata', 'e quando il server risponde, parte', JSON.stringify(conti));

        pulisci(); corpi = 0;
        azienda('BB555');
        modo = 'chiudiSuData';
        conti = await zitti(() => P2.giro(db, {}));
        s1 = codice('BB555').secondaPersona || {};
        esigi(s1.stato === 'errore' && s1.tentativi === 0 && corpi === 0 && conti.bloccato, 'chiusa sul comando DATA, prima del via al testo: guasto nostro', JSON.stringify(s1));

        // lento ma vivo, poi muto: il tempo massimo del giro arriva prima di quelli di nodemailer
        pulisci(); corpi = 0; comandiData = 0;
        azienda('BB666');
        modo = 'mutoSuMail'; ritardo = 300;
        conti = await zitti(() => P2.giro(db, { limiteInvio: 1500 }));
        s1 = codice('BB666').secondaPersona || {};
        await new Promise(t => setTimeout(t, 400));
        esigi(s1.stato === 'errore' && s1.tentativi === 0 && conti.bloccato, 'tempo massimo prima di DATA: guasto nostro, il tentativo non conta', JSON.stringify(s1) + ' ' + JSON.stringify(conti));
        esigi(aperte.size === 0, 'e la connessione e\' chiusa subito', String(aperte.size));
        // il server si riprende: la conversazione orfana non c'e', e la mail parte una volta sola, dal giro dopo
        modo = 'ok'; ritardo = 0;
        await new Promise(t => setTimeout(t, 300));
        esigi(corpi === 0 && comandiData === 0, 'niente e\' partito dopo il tempo massimo');
        orologio += ORA;
        await zitti(() => P2.giro(db, {}));
        esigi(corpi === 1 && (codice('BB666').secondaPersona || {}).stato === 'inviata', 'e il giro dopo la manda, una volta');

        pulisci(); corpi = 0; comandiData = 0;
        azienda('BB777');
        modo = 'mutoSuData';
        conti = await zitti(() => P2.giro(db, { limiteInvio: 1500 }));
        s1 = codice('BB777').secondaPersona || {};
        esigi(s1.stato === 'errore' && s1.tentativi === 0 && comandiData === 1 && corpi === 0, 'DATA senza risposta fino al tempo massimo: chiusa, guasto nostro', JSON.stringify(s1));

        pulisci(); corpi = 0;
        azienda('BB888');
        modo = 'mutoDopoCorpo';
        conti = await zitti(() => P2.giro(db, { limiteInvio: 1500 }));
        s1 = codice('BB888').secondaPersona || {};
        esigi(s1.stato === 'incerta' && corpi === 1, 'testo ricevuto e poi nessuna risposta fino al tempo massimo: incerta', JSON.stringify(s1));
        modo = 'ok';

        // nessuno in ascolto: la connessione non si apre
        pulisci(); corpi = 0;
        azienda('BB999');
        const chiusa = net.createServer();
        await new Promise(ok => chiusa.listen(0, '127.0.0.1', ok));
        const portaChiusa = chiusa.address().port;
        await new Promise(ok => chiusa.close(ok));
        postaVera = { porta: portaChiusa };
        conti = await zitti(() => P2.giro(db, {}));
        s1 = codice('BB999').secondaPersona || {};
        esigi(s1.stato === 'errore' && s1.tentativi === 0 && conti.bloccato && /ECONNREFUSED/.test(conti.bloccato), 'connessione rifiutata: guasto nostro', JSON.stringify(s1) + ' ' + conti.bloccato);
    } finally {
        postaVera = null; ritardo = 0;
        aperte.forEach(x => x.destroy());
        await new Promise(ok => server.close(ok));
    }

    console.log('\nLe regole pure');
    orologio = INIZIO;
    esigi(P2.puoPartire(null, 0).si && P2.puoPartire({ stato: 'errore', prossimo: 5 }, 10).si, 'nessun segno, o un errore scaduto: puo\' partire');
    esigi(!P2.puoPartire({ stato: 'inviata' }, 0).si && !P2.puoPartire({ stato: 'incerta' }, 0).si && !P2.puoPartire({ stato: 'non-partita' }, 0).si, 'inviata, incerta, non-partita: mai piu\'');
    esigi(P2.invitataPerPec({ invio: { canale: 'pec' } }) && P2.invitataPerPec({ invio: { canale: 'email' }, secondoInvio: { canale: 'pec' } }) && !P2.invitataPerPec({ invio: { canale: 'email' } }) && !P2.invitataPerPec({}), 'la PEC dall\'ultimo invio o dal secondo invio');
    esigi(V.MAX_PER_CODICE === 2, 'il tetto del codice e\' due, come dice la mail');
    const presenze = fs.readFileSync(path.join(RADICE, 'api/presenze.js'), 'utf8');
    esigi(/'mailInvito', 'promemoriaSecondaPersona'/.test(presenze), 'Modifica (trasloco della scheda) si porta dietro il segno');
    const campiUsati = ['pagina', 'invitoCodice', 'annullato', 'email', 'emailConfermata', 'promemoriaSecondaPersona'];
    esigi(campiUsati.every(c => P2.CAMPI.indexOf(c) >= 0), 'la ricerca legge tutti i campi che servono');

    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
