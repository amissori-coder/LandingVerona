/* ============================================================
   PROVE - lib/accredito-desk.js (accredito dal QR al desk)
   ------------------------------------------------------------
       node prove/accredito-desk.prove.js

   Niente da installare: Firestore e firebase-admin sono finti e
   stanno qui dentro. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Il 2 ottobre al desk ci sara' una fila, e chi la
   gestisce deve potersi fidare di quello che dice il telefono:

     - senza la chiave del cartello il servizio risponde "non
       trovato" e non scrive NIENTE: ne' da casa ne' provando
       indirizzi a caso;
     - fuori dai giorni dell'evento vale lo stesso;
     - chi e' iscritto viene trovato per email, e per nome se
       l'email non combacia - e in quel caso lo si dice;
     - la risposta porta nome, cognome e azienda: mai l'email, mai
       il telefono, mai l'identificativo (che l'email la contiene);
     - "segnami presente" scrive la presenza con il NOME DI
       DOCUMENTO che legge l'area riservata, stato "presente";
     - chi era iscritto online passa in sala, e la coda finisce;
     - chi organizza aveva cancellato una scheda: non si ritrova;
     - l'iscrizione nuova dal desk e' in presenza, con il portale
       che si legge nell'elenco, e la presenza e' scritta subito.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- orologio: venerdi 2 ottobre 2026, ore 9 a Napoli ----------
let orologio = Date.parse('2026-10-02T09:00:00+02:00');
const DateVera = Date;
global.Date = class extends DateVera {
    constructor(...a) { if (a.length) super(...a); else super(orologio); }
    static now() { return orologio; }
};

// ---------- Firestore finto ----------
const dati = new Map();
const ELIMINA = { __elimina: true };
function applica(vecchio, patch, merge) {
    const base = (merge && vecchio) ? Object.assign({}, vecchio) : {};
    for (const k of Object.keys(patch)) {
        if (patch[k] === ELIMINA) delete base[k];
        else if (patch[k] && patch[k].__incrementa) base[k] = (base[k] || 0) + patch[k].__incrementa;
        else base[k] = patch[k];
    }
    return base;
}
function doc(chiave) {
    const self = {
        get: async () => ({ exists: dati.has(chiave), id: chiave.split('/').pop(), data: () => dati.get(chiave), ref: self }),
        set: async (patch, opz) => { dati.set(chiave, applica(dati.get(chiave), patch, !!(opz && opz.merge))); },
        delete: async () => { dati.delete(chiave); }
    };
    return self;
}
function collection(nome) {
    const elenco = () => [...dati.keys()].filter(k => k.startsWith(nome + '/'))
        .map(k => ({ id: k.slice(nome.length + 1), data: () => dati.get(k), exists: true }));
    return {
        doc: (id) => doc(nome + '/' + id),
        get: async () => { const ds = elenco(); return { forEach: f => ds.forEach(f), docs: ds, size: ds.length, empty: !ds.length }; }
    };
}
const db = {
    collection: collection,
    batch: () => { const ops = []; return { set: (r, p, o) => ops.push(() => r.set(p, o)), delete: r => ops.push(() => r.delete()), commit: async () => { for (const f of ops) await f(); } }; }
};

// ---------- firebase-admin finto ----------
const adminFinto = { firestore: { FieldValue: { delete: () => ELIMINA, increment: n => ({ __incrementa: n }) } } };

// ---------- SMTP finto ----------
const posta = [];
let rompiInvio = 0;
const nodemailerFinto = { createTransport: () => ({ sendMail: async (msg) => {
    if (rompiInvio > 0) { rompiInvio--; throw new Error('server di posta non raggiungibile'); }
    posta.push(msg); return { response: '250 ok' };
} }) };

// ---------- intercetta i require ----------
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return adminFinto;
    if (nome === 'nodemailer') return nodemailerFinto;
    return veroRequire.apply(this, arguments);
};
process.env.NEWSLETTER_SECRET = 'segreto-di-prova';
process.env.SMTP_HOST = 'smtp.prova'; process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 'p';

const RADICE = path.join(__dirname, '..');
const DESK = require(path.join(RADICE, 'lib/accredito-desk.js'));
const EVENTO = 'napoli-2026-10-02';
const PAGINA = 'Napoli 2 Ottobre 2026 - Manifestazione di interesse';
const CHIAVE = 'ProvaCartello2026';

// ---------- impalcatura ----------
let ok = 0, ko = 0;
function esigi(cond, che) {
    if (cond) { ok++; console.log('  ok   ' + che); }
    else { ko++; console.log('  KO   ' + che); }
}
async function prova(titolo, fn) {
    console.log('\n' + titolo);
    try { await fn(); }
    catch (e) { ko++; console.log('  KO   eccezione: ' + (e && e.stack)); }
}
function azzera() {
    dati.clear();
    posta.length = 0; rompiInvio = 0;
    orologio = Date.parse('2026-10-02T09:00:00+02:00');
    process.env.PRESENZA_NAPOLI_CHIAVE = CHIAVE;
    // l'archivio condiviso tiene una memoria per istanza: si rilegge alzando la revisione
    dati.set('meta/iscrizioni', { rev: Math.floor(Math.random() * 1e9), quando: Date.now() });
}
function iscrivi(id, scheda) { dati.set('iscrizioni/' + id, Object.assign({ pagina: PAGINA }, scheda)); }
function presenze() { return [...dati.entries()].filter(([k]) => k.startsWith('presenze/')).map(([k, v]) => Object.assign({ _doc: k.slice(9) }, v)); }
const corpo = (extra) => Object.assign({ chiave: CHIAVE, evento: EVENTO, pagina: PAGINA }, extra);

const ROSSI = { data: '20/09/2026 10:00:00', nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@esempio.it', azienda: 'Rossi Srl', telefono: '333', modalita: 'online', listaAttesa: true };
const BIANCHI = { data: '21/09/2026 11:00:00', nome: 'Anna', cognome: 'Bianchi', email: 'anna@bianchi.it', azienda: 'Bianchi SpA', modalita: 'presenza' };

(async () => {

    await prova('Senza chiave: "non trovato", e nessuna scrittura', async () => {
        azzera();
        iscrivi('a', ROSSI);
        const r1 = await DESK.cerca(db, { evento: EVENTO, email: ROSSI.email });
        esigi(r1.stato === 200 && r1.corpo.ok && r1.corpo.trovato === false, 'senza chiave la ricerca non trova nessuno');
        const r2 = await DESK.cerca(db, corpo({ chiave: 'sbagliata', email: ROSSI.email }));
        esigi(r2.corpo.trovato === false && !('nome' in r2.corpo), 'con la chiave sbagliata nemmeno, e non dice perche\'');
        const r3 = await DESK.invito(db, corpo({ chiave: 'sbagliata', rif: DESK.impronta(DESK.idIscrittoDi(ROSSI)) }));
        esigi(r3.corpo.trovato === false && presenze().length === 0 && posta.length === 0, 'senza chiave non si sposta e non si invita nessuno');
        delete process.env.PRESENZA_NAPOLI_CHIAVE;
        const r4 = await DESK.cerca(db, corpo({ chiave: '', email: ROSSI.email }));
        esigi(r4.corpo.trovato === false, 'senza variabile impostata non esiste una chiave buona (chiave vuota non passa)');
    });

    await prova('Fuori dai giorni dell\'evento: tutto chiuso', async () => {
        azzera();
        iscrivi('a', ROSSI);
        orologio = Date.parse('2026-09-20T10:00:00+02:00');
        const r = await DESK.cerca(db, corpo({ email: ROSSI.email }));
        esigi(r.corpo.trovato === false, 'il 20 settembre la ricerca non risponde');
        orologio = Date.parse('2026-10-01T00:30:00+02:00');
        esigi(DESK.aperto(Object.assign({ id: EVENTO }, DESK.EVENTI[EVENTO])), 'il 1 ottobre alle 0.30 di Roma e\' aperto (a UTC e\' ancora il 30 settembre)');
        orologio = Date.parse('2026-10-04T08:00:00+02:00');
        esigi(!DESK.aperto(Object.assign({ id: EVENTO }, DESK.EVENTI[EVENTO])), 'il 4 ottobre e\' chiuso');
    });

    await prova('Chi e\' iscritto si trova per email, e la risposta e\' il minimo', async () => {
        azzera();
        iscrivi('a', ROSSI);
        iscrivi('b', BIANCHI);
        const r = await DESK.cerca(db, corpo({ email: ' Mario.Rossi@esempio.it ' }));
        esigi(r.corpo.trovato === true && r.corpo.nome === 'Mario' && r.corpo.cognome === 'Rossi' && r.corpo.azienda === 'Rossi Srl', 'trovato per email, maiuscole e spazi non contano');
        esigi(r.corpo.perNome === false && r.corpo.giaPresente === false && r.corpo.modalita === 'online', 'dice che era online e non ancora presente');
        esigi(!('email' in r.corpo) && !('telefono' in r.corpo) && !('id' in r.corpo), 'niente email, telefono o identificativo nella risposta');
        esigi(typeof r.corpo.rif === 'string' && r.corpo.rif.indexOf('@') < 0 && r.corpo.rif.length === 24, 'il riferimento e\' cieco: non contiene l\'indirizzo');
        const n = await DESK.cerca(db, corpo({ email: 'nessuno@esempio.it' }));
        esigi(n.corpo.trovato === false, 'un indirizzo sconosciuto non si trova');
        const v = await DESK.cerca(db, corpo({}));
        esigi(v.stato === 400, 'senza email ne\' nome la richiesta e\' rifiutata');
    });

    await prova('Per nome quando l\'email non combacia, e lo si dice', async () => {
        azzera();
        iscrivi('a', ROSSI);
        const r = await DESK.cerca(db, corpo({ email: 'altro@esempio.it', nome: 'mario', cognome: 'ROSSI ' }));
        esigi(r.corpo.trovato === true && r.corpo.perNome === true, 'trovato per nome e cognome, segnalato come tale');
        const s = await DESK.cerca(db, corpo({ nome: 'Mario', cognome: 'Verdi' }));
        esigi(s.corpo.trovato === false, 'un cognome diverso non basta');
    });

    await prova('Chi era ONLINE passa in sala e riceve l\'invito; la presenza non si tocca', async () => {
        azzera();
        iscrivi('a', ROSSI);
        const c = await DESK.cerca(db, corpo({ email: ROSSI.email }));
        const s = await DESK.invito(db, corpo({ rif: c.corpo.rif }));
        esigi(s.corpo.ok && s.corpo.trovato && s.corpo.spostato === true && s.corpo.invito === true && s.corpo.nome === 'Mario', 'spostato e invitato, con il nome per la schermata finale');
        const p = presenze();
        const idAtteso = DESK.idDocPresenza(EVENTO, 'mario.rossi@esempio.it|20/09/2026 10:00:00');
        esigi(p.length === 1 && p[0]._doc === idAtteso, 'un documento solo, con il nome "evento~email|data" ripulito');
        esigi(p[0].modalita === 'presenza' && p[0].evento === EVENTO && p[0].idIscritto === 'mario.rossi@esempio.it|20/09/2026 10:00:00', 'in sala, evento e identificativo per esteso');
        esigi(!('stato' in p[0]), 'lo stato "presente" NON si scrive: lo mette lo staff all\'ingresso');
        esigi(/In sala dal QR 02\/10 09:00/.test(p[0].nota) && p[0].da === 'qr-desk' && p[0].daNome === 'Accredito QR', 'la nota e la firma dicono da dove viene');
        esigi(posta.length === 1 && posta[0].to === ROSSI.email && /Il tuo invito/.test(posta[0].subject), 'una mail: l\'invito');
        esigi(/In sala/.test(posta[0].html) && (posta[0].attachments || []).length === 1 && posta[0].attachments[0].contentType === 'application/pdf', 'dice "in sala" e porta il PDF');
        esigi((dati.get('iscrizioni/a') || {}).mailInvito && dati.get('iscrizioni/a').mailInvito.ok === true, 'sulla scheda: invito partito');
        const c2 = await DESK.cerca(db, corpo({ email: ROSSI.email }));
        esigi(c2.corpo.modalita === 'presenza' && c2.corpo.giaPresente === false, 'ricercando, risulta in sala e non ancora presente');
        const s2 = await DESK.invito(db, corpo({ rif: c.corpo.rif }));
        esigi(s2.corpo.spostato === false && s2.corpo.invito === true && posta.length === 2 && presenze().length === 1, 'la seconda volta e\' solo una copia dell\'invito');
        const f = await DESK.invito(db, corpo({ rif: 'x'.repeat(24) }));
        esigi(f.corpo.trovato === false && posta.length === 2, 'un riferimento inventato non manda niente');
    });

    await prova('La coda per la sala finisce quando la persona passa in sala', async () => {
        azzera();
        iscrivi('a', ROSSI);
        // chi organizza lo aveva spostato online mettendolo in coda
        const idP = DESK.idDocPresenza(EVENTO, DESK.idIscrittoDi(ROSSI));
        dati.set('presenze/' + idP, { evento: EVENTO, idIscritto: DESK.idIscrittoDi(ROSSI), modalita: 'online', listaAttesa: true, nota: 'spostato a sala piena' });
        const c = await DESK.cerca(db, corpo({ rif: '', email: ROSSI.email }));
        await DESK.invito(db, corpo({ rif: c.corpo.rif }));
        const p = dati.get('presenze/' + idP);
        esigi(p.modalita === 'presenza' && !('listaAttesa' in p), 'in presenza, e la coda e\' cancellata');
        esigi(p.nota.indexOf('spostato a sala piena') === 0 && /In sala dal QR/.test(p.nota), 'la nota di chi organizza resta, con il passaggio accodato');
    });

    await prova('Chi e\' gia\' in sala (aderente, sponsor) riceve solo la copia dell\'invito', async () => {
        azzera();
        iscrivi('b', Object.assign({}, BIANCHI, { modalita: 'aderenti' }));
        const c = await DESK.cerca(db, corpo({ email: BIANCHI.email }));
        const s = await DESK.invito(db, corpo({ rif: c.corpo.rif }));
        esigi(s.corpo.spostato === false && s.corpo.invito === true && presenze().length === 0, 'niente da spostare, niente fra le presenze, invito partito');
        esigi(posta.length === 1 && posta[0].to === BIANCHI.email && (posta[0].attachments || []).length === 1, 'la mail con il PDF');
        azzera();
        iscrivi('b', BIANCHI);
        rompiInvio = 1;
        const c2 = await DESK.cerca(db, corpo({ email: BIANCHI.email }));
        const k = await DESK.invito(db, corpo({ rif: c2.corpo.rif }));
        esigi(k.corpo.ok && k.corpo.trovato && k.corpo.invito === false, 'posta giu\': lo dice, e la pagina manda al desk');
        esigi(dati.get('iscrizioni/b').mailInvito.ok === false && /non raggiungibile/.test(dati.get('iscrizioni/b').mailInvito.errore), 'sulla scheda: invito non partito, con il motivo');
    });

    await prova('Una scheda cancellata da chi organizza non si ritrova', async () => {
        azzera();
        iscrivi('a', ROSSI);
        dati.set('iscrizioniCancellate/x', { evento: EVENTO, idIscritto: DESK.idIscrittoDi(ROSSI) });
        const r = await DESK.cerca(db, corpo({ email: ROSSI.email }));
        esigi(r.corpo.trovato === false, 'cancellata: come se non ci fosse');
    });

    await prova('Una scheda ANNULLATA dall\'intestatario non si ritrova', async () => {
        azzera();
        // il modulo "completa i dati" scrive `annullato: true` (con la o): e' il
        // campo che l'area riservata usa per nasconderla, e il desk fa lo stesso
        iscrivi('a', Object.assign({}, ROSSI, { annullato: true }));
        const r = await DESK.cerca(db, corpo({ email: ROSSI.email }));
        esigi(r.corpo.trovato === false, 'annullata: il desk non la propone (era il caso di un indirizzo che risultava di un altro)');
        const n = await DESK.cerca(db, corpo({ nome: 'Mario', cognome: 'Rossi' }));
        esigi(n.corpo.trovato === false, 'nemmeno per nome');
    });

    await prova('Chi sta in "Solo incontri B2B" non e\' un iscritto: il desk non lo propone', async () => {
        azzera();
        iscrivi('a', Object.assign({}, ROSSI, { soloB2B: true }));
        const r = await DESK.cerca(db, corpo({ email: ROSSI.email }));
        esigi(r.corpo.trovato === false, 'la scheda nata dagli inviti B2B non si trova');
        azzera();
        iscrivi('b', BIANCHI);
        dati.set('presenze/' + DESK.idDocPresenza(EVENTO, DESK.idIscrittoDi(BIANCHI)), { evento: EVENTO, idIscritto: DESK.idIscrittoDi(BIANCHI), modalita: 'b2b' });
        const s = await DESK.cerca(db, corpo({ email: BIANCHI.email }));
        esigi(s.corpo.trovato === false, 'nemmeno chi organizza ha spostato fra gli invitati ai soli incontri');
    });

    await prova('Le schede inserite a mano (pagina corta) si trovano lo stesso', async () => {
        azzera();
        iscrivi('m', Object.assign({}, BIANCHI, { pagina: 'Napoli 2 Ottobre 2026' }));
        iscrivi('v', Object.assign({}, ROSSI, { pagina: 'Verona 20 Marzo 2026' }));
        const r = await DESK.cerca(db, corpo({ email: BIANCHI.email }));
        esigi(r.corpo.trovato === true, 'la pagina "Napoli 2 Ottobre 2026" senza coda vale');
        const v = await DESK.cerca(db, corpo({ email: ROSSI.email }));
        esigi(v.corpo.trovato === false, 'un iscritto a Verona non e\' un iscritto a Napoli');
    });

    await prova('L\'iscrizione nuova dal desk: in presenza, con il portale, senza segnarla presente', async () => {
        azzera();
        const body = corpo({ origine: 'qr-desk' });
        esigi(DESK.dalDesk(body) === true, 'con chiave e origine e\' un\'iscrizione dal desk');
        esigi(DESK.dalDesk(corpo({ origine: 'qr-desk', chiave: 'no' })) === false, 'senza la chiave e\' un modulo come un altro');
        esigi(DESK.dalDesk(corpo({})) === false, 'senza origine non e\' dal desk anche con la chiave');
        const scheda = { data: '02/10/2026 09:10:00', nome: 'Luca', cognome: 'Verdi', email: 'luca@verdi.it', azienda: 'Verdi Snc', modalita: 'online', listaAttesa: true, pagina: PAGINA };
        DESK.completaScheda(scheda);
        esigi(scheda.modalita === 'presenza' && !('listaAttesa' in scheda) && scheda.origine === 'qr-desk', 'in presenza, senza coda, con l\'origine');
        esigi(scheda.extra && scheda.extra.Portale === DESK.PORTALE_DESK, 'la colonna Portale dice "' + DESK.PORTALE_DESK + '"');
        esigi(typeof DESK.segnaNuova === 'undefined' && presenze().length === 0, 'nessuna presenza scritta: la segna lo staff all\'ingresso');
    });

    console.log('\n' + ok + ' ok, ' + ko + ' ko');
    process.exit(ko ? 1 : 0);
})();
