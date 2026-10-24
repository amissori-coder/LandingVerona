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
function interroga(coll, filtri, campi) {
    return {
        where(campo, op, val) { return interroga(coll, filtri.concat([[campo, val]]), campi); },
        select(...c) { return interroga(coll, filtri, c); },
        async get() {
            ricerche++;
            const docs = [...dati.keys()].filter(k => k.startsWith(coll + '/') && k.split('/').length === 2)
                .filter(k => filtri.every(([c, v]) => (dati.get(k) || {})[c] === v))
                .sort()
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
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return { createTransport: () => ({ sendMail: async m => {
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
async function zitti(fn) {
    const e = console.error, l = console.log, w = console.warn;
    console.error = () => { }; console.log = () => { }; console.warn = () => { };
    try { return await fn(); } finally { console.error = e; console.log = l; console.warn = w; }
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
    esigi(c2.occupato === true, 'un secondo giro trova il lucchetto e non fa niente');
    lenta && lenta();
    await g1;
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
