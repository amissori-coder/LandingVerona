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

// ---------- intercetta i require ----------
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return adminFinto;
    return veroRequire.apply(this, arguments);
};

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
        const r3 = await DESK.segna(db, corpo({ chiave: 'sbagliata', rif: DESK.impronta(DESK.idIscrittoDi(ROSSI)) }));
        esigi(r3.corpo.trovato === false && presenze().length === 0, 'senza chiave non si segna nessuno');
        delete process.env.PRESENZA_NAPOLI_CHIAVE;
        const r4 = await DESK.cerca(db, corpo({ chiave: '', email: ROSSI.email }));
        esigi(r4.corpo.trovato === false, 'senza variabile impostata non esiste una chiave buona (chiave vuota non passa)');
    });

    await prova('Fuori dai giorni dell\'evento: tutto chiuso', async () => {
        azzera();
        iscrivi('a', ROSSI);
        orologio = Date.parse('2026-09-28T10:00:00+02:00');
        const r = await DESK.cerca(db, corpo({ email: ROSSI.email }));
        esigi(r.corpo.trovato === false, 'il 28 settembre la ricerca non risponde');
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

    await prova('"Segnami presente": la presenza com\'e\' scritta la legge l\'area riservata', async () => {
        azzera();
        iscrivi('a', ROSSI);
        const c = await DESK.cerca(db, corpo({ email: ROSSI.email }));
        const s = await DESK.segna(db, corpo({ rif: c.corpo.rif }));
        esigi(s.corpo.ok && s.corpo.trovato && s.corpo.presente === true && s.corpo.nome === 'Mario', 'segnato, con il nome per la schermata finale');
        const p = presenze();
        const idAtteso = DESK.idDocPresenza(EVENTO, 'mario.rossi@esempio.it|20/09/2026 10:00:00');
        esigi(p.length === 1 && p[0]._doc === idAtteso, 'un documento solo, con il nome "evento~email|data" ripulito');
        esigi(p[0].stato === 'presente' && p[0].evento === EVENTO && p[0].idIscritto === 'mario.rossi@esempio.it|20/09/2026 10:00:00', 'stato presente, evento e identificativo per esteso');
        esigi(/Accredito QR 02\/10 09:00/.test(p[0].nota) && p[0].da === 'qr-desk' && p[0].daNome === 'Accredito QR', 'la nota e la firma dicono da dove viene');
        esigi(p[0].modalita === 'presenza', 'era online: adesso e\' in sala');
        const c2 = await DESK.cerca(db, corpo({ email: ROSSI.email }));
        esigi(c2.corpo.giaPresente === true && c2.corpo.modalita === 'presenza', 'ricercando, risulta gia\' presente e in sala');
        const s2 = await DESK.segna(db, corpo({ rif: c.corpo.rif }));
        esigi(s2.corpo.presente === true && presenze().length === 1, 'segnare due volte non crea due presenze');
        const f = await DESK.segna(db, corpo({ rif: 'x'.repeat(24) }));
        esigi(f.corpo.trovato === false, 'un riferimento inventato non segna nessuno');
    });

    await prova('La coda per la sala finisce quando la persona e\' in sala', async () => {
        azzera();
        iscrivi('a', ROSSI);
        // chi organizza lo aveva spostato online mettendolo in coda
        const idP = DESK.idDocPresenza(EVENTO, DESK.idIscrittoDi(ROSSI));
        dati.set('presenze/' + idP, { evento: EVENTO, idIscritto: DESK.idIscrittoDi(ROSSI), modalita: 'online', listaAttesa: true, nota: 'spostato a sala piena' });
        const c = await DESK.cerca(db, corpo({ email: ROSSI.email }));
        await DESK.segna(db, corpo({ rif: c.corpo.rif }));
        const p = dati.get('presenze/' + idP);
        esigi(p.modalita === 'presenza' && !('listaAttesa' in p), 'in presenza, e la coda e\' cancellata');
        esigi(p.nota.indexOf('spostato a sala piena') === 0 && /Accredito QR/.test(p.nota), 'la nota di chi organizza resta, con l\'accredito accodato');
    });

    await prova('Chi e\' gia\' in sala (aderente) resta nella sua sezione', async () => {
        azzera();
        iscrivi('b', Object.assign({}, BIANCHI, { modalita: 'aderenti' }));
        const c = await DESK.cerca(db, corpo({ email: BIANCHI.email }));
        await DESK.segna(db, corpo({ rif: c.corpo.rif }));
        const p = presenze()[0];
        esigi(p.stato === 'presente' && !('modalita' in p), 'presente, senza toccare la sezione');
    });

    await prova('Una scheda cancellata da chi organizza non si ritrova', async () => {
        azzera();
        iscrivi('a', ROSSI);
        dati.set('iscrizioniCancellate/x', { evento: EVENTO, idIscritto: DESK.idIscrittoDi(ROSSI) });
        const r = await DESK.cerca(db, corpo({ email: ROSSI.email }));
        esigi(r.corpo.trovato === false, 'cancellata: come se non ci fosse');
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

    await prova('L\'iscrizione nuova dal desk: in presenza, con il portale, e gia\' presente', async () => {
        azzera();
        const body = corpo({ origine: 'qr-desk' });
        esigi(DESK.dalDesk(body) === true, 'con chiave e origine e\' un\'iscrizione dal desk');
        esigi(DESK.dalDesk(corpo({ origine: 'qr-desk', chiave: 'no' })) === false, 'senza la chiave e\' un modulo come un altro');
        esigi(DESK.dalDesk(corpo({})) === false, 'senza origine non e\' dal desk anche con la chiave');
        const scheda = { data: '02/10/2026 09:10:00', nome: 'Luca', cognome: 'Verdi', email: 'luca@verdi.it', azienda: 'Verdi Snc', modalita: 'online', listaAttesa: true, pagina: PAGINA };
        DESK.completaScheda(scheda);
        esigi(scheda.modalita === 'presenza' && !('listaAttesa' in scheda) && scheda.origine === 'qr-desk', 'in presenza, senza coda, con l\'origine');
        esigi(scheda.extra && scheda.extra.Portale === DESK.PORTALE_DESK, 'la colonna Portale dice "' + DESK.PORTALE_DESK + '"');
        const fatto = await DESK.segnaNuova(db, body, scheda);
        const p = presenze();
        esigi(fatto === true && p.length === 1 && p[0].stato === 'presente' && p[0].idIscritto === 'luca@verdi.it|02/10/2026 09:10:00', 'presenza scritta subito, con l\'identificativo della scheda');
        esigi(!('modalita' in p[0]), 'la sezione la dice la scheda (presenza): fra le presenze non serve');
        esigi((dati.get('meta/iscrizioni') || {}).quando === Date.now(), 'la revisione dell\'archivio e\' stata alzata: l\'area riservata rilegge');
    });

    console.log('\n' + ok + ' ok, ' + ko + ' ko');
    process.exit(ko ? 1 : 0);
})();
