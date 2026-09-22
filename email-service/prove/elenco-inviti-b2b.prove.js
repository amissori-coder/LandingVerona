/* ============================================================
   PROVE - api/presenze.js, l'elenco delle aziende da invitare
   ------------------------------------------------------------
       node prove/elenco-inviti-b2b.prove.js

   Niente da installare: Firestore, l'autenticazione e il server di
   posta sono finti e stanno qui dentro.

   COSA DIMOSTRANO. L'elenco delle aziende da invitare agli incontri
   B2B si fa nel foglio che si importa, ma si ritocca dalla finestra
   degli inviti: si toglie un'azienda che non deve riceverlo, se ne
   aggiunge una che nel foglio non c'era. Sono due scritture piccole
   con due modi precisi di fare danno:

     - TOGLIERE non e' cancellare. Si spegne una colonna aggiuntiva,
       e tutto il resto della scheda - nome, indirizzo, azienda, le
       altre colonne - deve restare dov'e': chi non riceve l'invito
       e' comunque iscritto all'evento;
     - la scrittura e' a SOVRAPPOSIZIONE, e una sovrapposizione su un
       documento che non esiste lo CREA. Un identificativo vecchio,
       rimasto in una pagina aperta da ieri, farebbe nascere una
       scheda fatta di una colonna sola, senza nome ne' indirizzo,
       che poi comparirebbe fra gli iscritti dell'evento;
     - l'AZIENDA AGGIUNTA A MANO deve nascere gia' scelta - altrimenti
       sparisce dall'elenco da cui la si sta aggiungendo - e con la
       sua partita IVA, che e' la chiave con cui la si riconosce al
       momento di spedire. E non deve ricevere nessuna mail adesso:
       l'unica che le arrivera' e' l'invito.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- Firestore finto ----------
/* La sovrapposizione di Firestore e' PROFONDA: su un campo che e' una mappa
   (qui "extra") unisce le chiavi invece di sostituire la mappa intera. E'
   quello che permette di spegnere una colonna sola senza toccare le altre,
   quindi la finzione deve rifarlo. */
function fondiProfondo(vecchio, nuovo) {
    const fuori = Object.assign({}, vecchio || {});
    Object.keys(nuovo || {}).forEach(k => {
        const v = nuovo[k];
        const mappa = v && typeof v === 'object' && !Array.isArray(v) && !v.__incremento && !v.__unione;
        fuori[k] = mappa ? fondiProfondo(fuori[k], v) : v;
    });
    return fuori;
}
let dati = {};
function chiave(coll, id) { return coll + '/' + id; }
function fondi(coll, id, patch, merge) {
    const k = chiave(coll, id);
    dati[k] = merge === false ? patch : fondiProfondo(dati[k], patch);
}
const admin = {
    initializeApp() { },
    credential: { cert: () => ({}) },
    apps: [],
    auth: () => ({ verifyIdToken: async () => ({ email: sessione }) }),
    firestore: () => db
};
admin.firestore.FieldValue = {
    serverTimestamp: () => 0,
    increment: n => ({ __incremento: n }),
    delete: () => ({ __cancella: true }),
    arrayUnion: function () { return { __unione: Array.prototype.slice.call(arguments) }; }
};
const db = {
    collection(coll) {
        return {
            doc(id) {
                const rif = {
                    id: id, _coll: coll,
                    async get() {
                        return {
                            exists: Object.prototype.hasOwnProperty.call(dati, chiave(coll, id)),
                            data: () => dati[chiave(coll, id)] || {}
                        };
                    },
                    async set(patch, opz) { fondi(coll, id, patch, !!(opz && opz.merge)); }
                };
                return rif;
            }
        };
    },
    /* getAll restituisce anche il RIFERIMENTO, come Firestore: il servizio ci
       scrive sopra senza ricostruirlo, ed e' proprio il riferimento a dire su
       quale documento sta scrivendo. */
    async getAll() {
        return Array.prototype.slice.call(arguments).map(r => ({
            id: r.id, ref: r,
            exists: Object.prototype.hasOwnProperty.call(dati, chiave(r._coll, r.id)),
            data: () => dati[chiave(r._coll, r.id)] || {}
        }));
    },
    batch() {
        const ops = [];
        return {
            set(rif, patch, opz) { ops.push({ rif: rif, patch: patch, merge: !!(opz && opz.merge) }); },
            commit: async () => { ops.forEach(o => fondi(o.rif._coll, o.rif.id, o.patch, o.merge)); }
        };
    }
};

// ---------- server di posta finto ----------
let spedite = [];

// ---------- intercetta i require ----------
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
const presenze = require(path.join(__dirname, '..', 'api', 'presenze.js'));

// ---------- utilita' ----------
let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
let sessione = 'admin@esempio.it';
function idScheda(id) { return String(id).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 300); }
function scheda(id) { return dati[chiave('iscrizioni', idScheda(id))] || null; }
async function chiama(corpo) {
    let stato = 0, risposta = null;
    const res = {
        setHeader() { }, status(s) { stato = s; return res; },
        json(c) { risposta = c; return res; }, end() { return res; }
    };
    await presenze({ method: 'POST', headers: {}, body: Object.assign({ idToken: 'finto' }, corpo) }, res);
    return { stato: stato, corpo: risposta || {} };
}
const EV = 'napoli-2026-10-02';
const DOC_MARIO = idScheda('mario@alfa.it|01/09/2026 10:00');
const DOC_LUISA = idScheda('luisa@alfa.it|01/09/2026 10:00');
function scenario() {
    dati = {
        'utenti/admin@esempio.it': { nome: 'Anna Admin', ruolo: 'admin', attivo: true, eventi: true },
        'utenti/socio@esempio.it': { nome: 'Enzo Equity', ruolo: 'equity-partner', attivo: true, eventi: true },
        'utenti/desk@esempio.it': { nome: 'Dina Desk', ruolo: 'staff', attivo: true, eventi: true }
    };
    dati[chiave('iscrizioni', DOC_MARIO)] = {
        nome: 'Mario', cognome: 'Rossi', email: 'mario@alfa.it', azienda: 'Alfa Srl', telefono: '333',
        extra: { 'P.IVA': '09302991212', 'Citta': 'Napoli', 'Invito B2B': 'si' }
    };
    dati[chiave('iscrizioni', DOC_LUISA)] = {
        nome: 'Luisa', cognome: 'Bianchi', email: 'luisa@alfa.it', azienda: 'Alfa Srl',
        extra: { 'P.IVA': '09302991212', 'Invito B2B': 'si' }
    };
    spedite = []; sessione = 'admin@esempio.it';
}

const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

prova('Togliere un\'azienda: si spegne la scelta, non si cancella nessuno', async () => {
    scenario();
    const r = await chiama({ azione: 'invito-b2b-segna', evento: EV, docs: [DOC_MARIO, DOC_LUISA], valore: '' });
    esigi(r.stato === 200 && r.corpo.ok === true, 'la richiesta va a buon fine', JSON.stringify(r.corpo).slice(0, 160));
    esigi(r.corpo.scritte === 2, 'toccate tutte e due le schede dei referenti', 'scritte=' + r.corpo.scritte);
    esigi(scheda('mario@alfa.it|01/09/2026 10:00').extra['Invito B2B'] === '',
        'la scelta e\' spenta');
    esigi(scheda('mario@alfa.it|01/09/2026 10:00').email === 'mario@alfa.it'
        && scheda('mario@alfa.it|01/09/2026 10:00').telefono === '333',
        'la scheda resta: nome, indirizzo e telefono dove stavano');
    esigi(scheda('mario@alfa.it|01/09/2026 10:00').extra['P.IVA'] === '09302991212'
        && scheda('mario@alfa.it|01/09/2026 10:00').extra['Citta'] === 'Napoli',
        'e le altre colonne aggiuntive nemmeno le sfiora');
    esigi(!spedite.length, 'e non parte nessuna mail: non e\' successo niente da raccontare');
});

prova('Rimetterla: la stessa riga, dall\'altra parte', async () => {
    const r = await chiama({ azione: 'invito-b2b-segna', evento: EV, docs: [DOC_MARIO, DOC_LUISA], valore: 'si' });
    esigi(r.stato === 200 && r.corpo.valore === 'si', 'la scelta torna scritta', JSON.stringify(r.corpo).slice(0, 120));
    esigi(scheda('mario@alfa.it|01/09/2026 10:00').extra['Invito B2B'] === 'si'
        && scheda('luisa@alfa.it|01/09/2026 10:00').extra['Invito B2B'] === 'si',
        'tutti e due i referenti tornano fra gli invitati: l\'azienda si invita intera');
});

prova('Una parola qualunque non diventa una scelta', async () => {
    scenario();
    await chiama({ azione: 'invito-b2b-segna', evento: EV, docs: [DOC_MARIO], valore: 'forse' });
    esigi(scheda('mario@alfa.it|01/09/2026 10:00').extra['Invito B2B'] === '',
        'solo "si" vale si: tutto il resto spegne, invece di scrivere qualcosa che poi nessuno sa rileggere');
});

prova('Un identificativo che non esiste non fa nascere una scheda fantasma', async () => {
    scenario();
    // si contano le SCHEDE: il segnale "i dati sono cambiati" e' un altro
    // documento, e c'entra sempre
    const schede = () => Object.keys(dati).filter(k => k.indexOf('iscrizioni/') === 0).length;
    const quante = schede();
    const r = await chiama({ azione: 'invito-b2b-segna', evento: EV, docs: [DOC_MARIO, 'scheda-di-ieri'], valore: 'si' });
    esigi(r.stato === 200 && r.corpo.scritte === 1, 'scrive su quella che c\'e\'', 'scritte=' + r.corpo.scritte);
    esigi(r.corpo.nonTrovate === 1, 'e conta quella che non c\'e\'', 'nonTrovate=' + r.corpo.nonTrovate);
    esigi(schede() === quante, 'nessuna scheda nuova: la scheda fantasma non nasce', 'prima ' + quante + ', dopo ' + schede());
    esigi(!dati[chiave('iscrizioni', 'scheda-di-ieri')], 'e in particolare non nasce quella');
});

prova('Se non ne esiste nessuna lo dice, invece di rispondere "fatto"', async () => {
    scenario();
    const r = await chiama({ azione: 'invito-b2b-segna', evento: EV, docs: ['una', 'altra'], valore: 'si' });
    esigi(r.stato === 400 && !r.corpo.ok, 'la richiesta viene respinta', JSON.stringify(r.corpo).slice(0, 160));
    esigi(/ricarica/i.test(r.corpo.msg || ''), 'e dice cosa fare: ricaricare l\'elenco');
});

prova('Chi non manda gli inviti non tocca l\'elenco', async () => {
    scenario();
    sessione = 'desk@esempio.it';
    const r = await chiama({ azione: 'invito-b2b-segna', evento: EV, docs: [DOC_MARIO], valore: '' });
    esigi(r.stato === 403, 'lo staff viene respinto', 'stato=' + r.stato);
    esigi(scheda('mario@alfa.it|01/09/2026 10:00').extra['Invito B2B'] === 'si', 'e la scelta resta com\'era');
    sessione = 'socio@esempio.it';
    const r2 = await chiama({ azione: 'invito-b2b-segna', evento: EV, docs: [DOC_MARIO], valore: '' });
    esigi(r2.stato === 200, 'l\'equity partner invece puo\': manda lui gli inviti', 'stato=' + r2.stato);
});

prova('L\'azienda aggiunta a mano nasce scelta, con la sua partita IVA e senza mail', async () => {
    scenario();
    const r = await chiama({
        azione: 'aggiungi', evento: EV, pagina: 'Napoli 2 Ottobre 2026', modalita: 'presenza',
        portale: { id: 'altro', nome: 'Aggiunta per il B2B' }, invitoB2B: true,
        campi: { nome: 'Gino', cognome: 'Verdi', email: 'gino@beta.it', azienda: 'Beta Srl', piva: 'IT 073.070.10632', partecipanti: '1' }
    });
    esigi(r.stato === 200 && r.corpo.ok === true, 'la scheda si crea', JSON.stringify(r.corpo).slice(0, 160));
    const nuova = dati[chiave('iscrizioni', idScheda(r.corpo.id))] || {};
    esigi(nuova.extra && nuova.extra['Invito B2B'] === 'si',
        'nasce gia\' fra le aziende da invitare: altrimenti sparirebbe dall\'elenco da cui la si aggiunge');
    esigi(nuova.extra && nuova.extra['P.IVA'] === '07307010632',
        'la partita IVA entra ridotta alle sole cifre, come quella che arriva dal foglio', JSON.stringify(nuova.extra));
    esigi(nuova.extra && nuova.extra.Portale === 'Aggiunta per il B2B' && nuova.extra.Partecipanti === '1',
        'e le colonne di sempre restano al loro posto');
    esigi(!spedite.length, 'nessuna mail adesso: la prima che ricevera\' e\' l\'invito');
});

prova('Una scheda aggiunta come si faceva prima non diventa un invitato', async () => {
    scenario();
    const r = await chiama({
        azione: 'aggiungi', evento: EV, pagina: 'Napoli 2 Ottobre 2026',
        portale: { id: 'eventbrite' },
        campi: { nome: 'Rita', cognome: 'Neri', email: 'rita@gamma.it', azienda: 'Gamma Srl' }
    });
    const nuova = dati[chiave('iscrizioni', idScheda(r.corpo.id))] || {};
    esigi(r.stato === 200 && nuova.extra && nuova.extra['Invito B2B'] === undefined,
        'chi aggiunge un\'iscrizione dall\'elenco non sta scegliendo nessuna azienda');
    esigi(nuova.extra && nuova.extra['P.IVA'] === undefined,
        'e senza partita IVA la colonna non si scrive vuota');
});

(async () => {
    for (const p of prove) {
        console.log('\n' + p.titolo);
        try { await p.fn(); }
        catch (e) { ko++; console.log('  ROSSO  eccezione: ' + (e && e.stack || e)); }
    }
    console.log('\n' + ok + ' verde, ' + ko + ' ROSSO');
    process.exit(ko ? 1 : 0);
})();
