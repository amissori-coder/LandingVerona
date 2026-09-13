/* ============================================================
   PROVE - api/presenze.js, azione "sposta-modalita"
   ------------------------------------------------------------
       node prove/sposta-modalita.prove.js

   Niente da installare: Firestore, l'autenticazione e il server di
   posta sono finti e stanno qui dentro. Esce con 1 se qualcosa e'
   rosso, cosi' si puo' appendere a un controllo automatico.

   COSA DIMOSTRANO. Quando i posti in sala finiscono, chi resta fuori
   non si cancella: si sposta all'online e lo si avvisa. E' un'azione
   che fa due cose insieme - scrive su tante schede e spedisce tante
   mail - e sono proprio le due cose che, se vanno a meta', lasciano
   l'elenco a raccontare una bugia. Qui si verifica che:

     - lo spostamento venga PRIMA delle mail: se la posta si ferma,
       chi risulta spostato lo e' per davvero (il contrario - avvisati
       ma ancora in sala - sarebbe una bugia scritta in un posto solo);
     - un indirizzo riceva UNA mail sola anche con due iscrizioni;
     - chi non ha email, chi non ha scheda su Firestore e chi ha
       annullato non ricevano niente, e vengano contati a parte: sono
       le persone da avvisare a mano, e l'elenco deve dirlo;
     - i segnaposti {{NOME}} e {{COMPLETA}} arrivino sostituiti, con un
       collegamento DIVERSO per ciascuno (e' firmato sulla sua scheda);
     - "avvisato" resti scritto solo su chi ha ricevuto davvero;
     - senza `mail` lo spostamento si faccia in silenzio;
     - la modalita' sbagliata e chi non ha il ruolo vengano respinti.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- Firestore finto ----------
/* Tre collezioni bastano: "utenti" (chi chiama), "iscrizioni" (le schede, da
   cui il servizio prende l'indirizzo) e "presenze" (dove finisce la modalita').
   L'ordine delle scritture si registra, perche' una delle prove e' proprio
   quello: prima lo spostamento, poi le mail. */
let dati = {};
const ordine = [];
function chiave(coll, id) { return coll + '/' + id; }
function fondi(coll, id, patch) {
    const k = chiave(coll, id);
    dati[k] = Object.assign({}, dati[k] || {}, patch);
    ordine.push({ tipo: 'scrittura', coll: coll, id: id });
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
                return {
                    id: id,
                    async get() {
                        const k = chiave(coll, id);
                        return {
                            exists: Object.prototype.hasOwnProperty.call(dati, k),
                            data: () => dati[k] || {}
                        };
                    },
                    async set(patch) { fondi(coll, id, patch); }
                };
            }
        };
    },
    batch() {
        const ops = [];
        return {
            set(rif, patch) { ops.push({ rif: rif, patch: patch }); },
            commit: async () => { ops.forEach(o => fondi(o.rif._coll, o.rif.id, o.patch)); }
        };
    }
};
/* Il batch riceve il riferimento, non il nome della collezione: glielo si
   attacca al riferimento, come fa Firestore per davvero. */
const collezioneVera = db.collection;
db.collection = function (coll) {
    const c = collezioneVera.call(db, coll);
    const docVero = c.doc;
    c.doc = function (id) { const r = docVero.call(c, id); r._coll = coll; return r; };
    return c;
};

// ---------- server di posta finto ----------
let spedite = [];
let cadeLaPosta = false;

// ---------- intercetta i require ----------
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') {
        return {
            createTransport: () => ({
                sendMail: async m => {
                    if (cadeLaPosta) throw new Error('server di posta non raggiungibile');
                    spedite.push(m);
                    ordine.push({ tipo: 'mail', a: m.to });
                    return {};
                }
            })
        };
    }
    if (nome === 'imapflow') return { ImapFlow: function () { } };
    if (nome === 'google-auth-library') return { JWT: function () { }, GoogleAuth: function () { } };
    return veroRequire.apply(this, arguments);
};

process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    client_email: 'servizio@esempio.iam.gserviceaccount.com',
    private_key: 'chiave-finta-per-le-prove'
});
process.env.SMTP_FROM_EMAIL = 'noreply@esempio.it';
process.env.SMTP_FROM_NAME = 'Revilaw S.p.A.';

const RADICE = path.join(__dirname, '..');
const presenze = require(path.join(RADICE, 'api/presenze.js'));

// ---------- utilita' ----------
let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}

let sessione = 'admin@esempio.it';
// lo stesso nome di documento che costruisce il servizio (evento~iscritto)
function idPresenza(evento, id) { return (evento + '~' + id).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 400); }
function idScheda(id) { return String(id).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 300); }
function presenzaDi(evento, id) { return dati[chiave('presenze', idPresenza(evento, id))] || null; }

const MAIL = {
    oggetto: 'Posti in sala esauriti: potrà seguire online',
    html: '<p>Gentile {{NOME}}, i posti sono esauriti. <a href="{{COMPLETA}}">rinuncia</a></p>',
    testo: 'Gentile {{NOME}}, i posti sono esauriti. Rinuncia: {{COMPLETA}}'
};

async function chiama(corpo) {
    let stato = 0, risposta = null;
    const res = {
        setHeader() { },
        status(s) { stato = s; return res; },
        json(c) { risposta = c; return res; },
        end() { return res; }
    };
    await presenze({ method: 'POST', headers: {}, body: Object.assign({ idToken: 'finto' }, corpo) }, res);
    return { stato: stato, corpo: risposta || {} };
}

/* Lo scenario: quattro iscritti a Napoli, uno dei quali iscritto DUE volte con
   lo stesso indirizzo, uno senza email, uno che ha annullato, e una riga che
   su Firestore non ha nessuna scheda (arriva dal foglio storico). */
function scenario() {
    dati = {
        'utenti/admin@esempio.it': { nome: 'Anna Admin', ruolo: 'admin', attivo: true, eventi: true },
        'utenti/socio@esempio.it': { nome: 'Enzo Equity', ruolo: 'equity-partner', attivo: true, eventi: true },
        'utenti/desk@esempio.it': { nome: 'Dina Desk', ruolo: 'staff', attivo: true, eventi: true }
    };
    dati[chiave('iscrizioni', idScheda('mario@alfa.it|01/09/2026 10:00'))] = { nome: 'Mario', cognome: 'Rossi', email: 'mario@alfa.it' };
    dati[chiave('iscrizioni', idScheda('mario@alfa.it|02/09/2026 11:00'))] = { nome: 'Mario', cognome: 'Rossi', email: 'mario@alfa.it' };
    dati[chiave('iscrizioni', idScheda('lucia@beta.it|03/09/2026 09:00'))] = { nome: 'Lucia', cognome: 'Bianchi', email: 'lucia@beta.it' };
    dati[chiave('iscrizioni', idScheda('nino.senzamail|04/09/2026 09:00'))] = { nome: 'Nino', cognome: 'Senzamail', email: '' };
    dati[chiave('iscrizioni', idScheda('rinuncia@gamma.it|05/09/2026 09:00'))] = { nome: 'Ruggero', cognome: 'Rinuncia', email: 'rinuncia@gamma.it', annullato: true };
    spedite = []; ordine.length = 0; cadeLaPosta = false; sessione = 'admin@esempio.it';
}
const TUTTI = [
    { id: 'mario@alfa.it|01/09/2026 10:00' },
    { id: 'mario@alfa.it|02/09/2026 11:00' },
    { id: 'lucia@beta.it|03/09/2026 09:00' },
    { id: 'nino.senzamail|04/09/2026 09:00' },
    { id: 'rinuncia@gamma.it|05/09/2026 09:00' },
    { id: 'solo.sul.foglio@delta.it|06/09/2026 09:00' }
];

const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

prova('Spostamento con avviso: chi si sposta, chi riceve, chi resta da avvisare', async () => {
    scenario();
    const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: TUTTI, mail: MAIL });
    esigi(r.stato === 200 && r.corpo.ok === true, 'la richiesta va a buon fine', JSON.stringify(r.corpo).slice(0, 160));
    esigi(r.corpo.spostate === 6, 'spostate tutte e sei le iscrizioni indicate', 'spostate=' + r.corpo.spostate);
    esigi(TUTTI.every(d => (presenzaDi('napoli-2026-10-02', d.id) || {}).modalita === 'online'),
        'ogni presenza porta modalita "online"');
    esigi((presenzaDi('napoli-2026-10-02', TUTTI[0].id) || {}).daNome === 'Anna Admin',
        'sulla presenza resta chi ha spostato');
    const m = r.corpo.mail || {};
    esigi(m.inviate === 2, 'due mail: un indirizzo, una mail sola (Mario era iscritto due volte)', 'inviate=' + m.inviate);
    esigi(m.doppie === 1, 'la seconda iscrizione di Mario si conta fra i doppioni', 'doppie=' + m.doppie);
    esigi(m.senzaEmail === 1, 'chi non ha email si conta a parte', 'senzaEmail=' + m.senzaEmail);
    esigi(m.senzaScheda === 2, 'chi non ha scheda (foglio) e chi ha annullato non ricevono', 'senzaScheda=' + m.senzaScheda);
    esigi(spedite.map(x => x.to).sort().join(',') === 'lucia@beta.it,mario@alfa.it',
        'le mail vanno ai due indirizzi giusti', spedite.map(x => x.to).join(','));
});

prova('Prima lo spostamento, poi le mail', async () => {
    scenario();
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: TUTTI, mail: MAIL });
    const primaMail = ordine.findIndex(x => x.tipo === 'mail');
    const presenzeScritte = ordine.filter((x, i) => x.tipo === 'scrittura' && x.coll === 'presenze' && i < primaMail).length;
    esigi(primaMail > 0 && presenzeScritte === 6,
        'tutte le presenze sono scritte prima della prima mail', 'scritte prima=' + presenzeScritte);
});

prova('Segnaposti sostituiti, e un collegamento diverso per ciascuno', async () => {
    scenario();
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: TUTTI, mail: MAIL });
    const perMario = spedite.find(x => x.to === 'mario@alfa.it') || {};
    const perLucia = spedite.find(x => x.to === 'lucia@beta.it') || {};
    esigi(/Gentile Mario Rossi/.test(perMario.html || '') && /Gentile Lucia Bianchi/.test(perLucia.html || ''),
        '{{NOME}} diventa il nome del destinatario');
    esigi(!/\{\{NOME\}\}|\{\{COMPLETA\}\}/.test((perMario.html || '') + (perMario.text || '')),
        'nella mail spedita non resta nessun segnaposto');
    const link = h => (String(h).match(/completa_iscrizione\/\?d=[^"&]+&t=[^"]+/) || [''])[0];
    esigi(link(perMario.html) && link(perLucia.html) && link(perMario.html) !== link(perLucia.html),
        '{{COMPLETA}} e il collegamento firmato di quella sola scheda');
    esigi(perMario.text && /Rinuncia: https/.test(perMario.text), 'anche la versione in solo testo ha il collegamento');
});

prova('"Avvisato" resta scritto solo su chi ha ricevuto davvero', async () => {
    scenario();
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: TUTTI, mail: MAIL });
    const conAvviso = TUTTI.filter(d => (presenzaDi('napoli-2026-10-02', d.id) || {}).avvisoModalita).length;
    esigi(conAvviso === 2, 'due avvisi registrati, uno per mail partita', 'conAvviso=' + conAvviso);
    const a = (presenzaDi('napoli-2026-10-02', TUTTI[0].id) || {}).avvisoModalita || {};
    esigi(a.modalita === 'online' && a.quando > 0 && a.daNome === 'Anna Admin',
        'l\'avviso dice cosa, quando e da chi');
    esigi(!(presenzaDi('napoli-2026-10-02', TUTTI[3].id) || {}).avvisoModalita,
        'chi non ha email resta senza avviso registrato');
});

prova('La posta che cade non disfa lo spostamento', async () => {
    scenario();
    cadeLaPosta = true;
    const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: TUTTI, mail: MAIL });
    esigi(r.stato === 200 && r.corpo.ok === true, 'la risposta resta positiva: lo spostamento e fatto');
    esigi((r.corpo.mail || {}).inviate === 0 && (r.corpo.mail || {}).falliti.length === 2,
        'le due mail risultano non consegnate, con il motivo', JSON.stringify((r.corpo.mail || {}).falliti));
    esigi(TUTTI.every(d => (presenzaDi('napoli-2026-10-02', d.id) || {}).modalita === 'online'),
        'gli spostamenti ci sono tutti anche senza mail');
    esigi(!TUTTI.some(d => (presenzaDi('napoli-2026-10-02', d.id) || {}).avvisoModalita),
        'nessuno risulta avvisato');
});

prova('Senza "mail" si sposta in silenzio', async () => {
    scenario();
    const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[0]] });
    esigi(r.corpo.ok === true && r.corpo.mail === null, 'nessun esito di posta nella risposta');
    esigi(spedite.length === 0, 'non parte nessuna mail');
    esigi((presenzaDi('napoli-2026-10-02', TUTTI[0].id) || {}).modalita === 'online', 'la modalita e comunque cambiata');
});

prova('Il ritorno in sala', async () => {
    scenario();
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[0]] });
    const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'presenza', destinatari: [TUTTI[0]] });
    esigi(r.corpo.ok === true && (presenzaDi('napoli-2026-10-02', TUTTI[0].id) || {}).modalita === 'presenza',
        'la presenza torna "presenza"');
});

prova('Chi puo e chi non puo', async () => {
    scenario();
    sessione = 'desk@esempio.it';
    const no = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[0]] });
    esigi(no.stato === 403 && !no.corpo.ok, 'chi segna le presenze al desk non sposta nessuno', JSON.stringify(no.corpo));
    esigi(!presenzaDi('napoli-2026-10-02', TUTTI[0].id), 'e non lascia traccia');
    sessione = 'socio@esempio.it';
    const si = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[0]], mail: MAIL });
    esigi(si.corpo.ok === true && (si.corpo.mail || {}).inviate === 1, 'l\'equity partner sposta e avvisa');
});

prova('Richieste malfatte', async () => {
    scenario();
    const senzaModalita = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'ibrido', destinatari: [TUTTI[0]] });
    esigi(senzaModalita.stato === 400, 'una modalita inventata viene respinta', JSON.stringify(senzaModalita.corpo));
    const senzaNessuno = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [] });
    esigi(senzaNessuno.stato === 400, 'senza destinatari non si fa niente', JSON.stringify(senzaNessuno.corpo));
    const senzaHtml = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[0]], mail: { oggetto: 'x', html: '  ' } });
    esigi(senzaHtml.stato === 400, 'una mail senza contenuto viene respinta prima di spostare', JSON.stringify(senzaHtml.corpo));
    esigi(!presenzaDi('napoli-2026-10-02', TUTTI[0].id), 'e nessuno viene spostato');
});

prova('La tendina della riga: modalita da sola, senza mail', async () => {
    scenario();
    sessione = 'desk@esempio.it';   // chi e' abilitato agli Eventi puo' cambiarla
    const r = await chiama({ azione: 'imposta', evento: 'napoli-2026-10-02', idIscritto: TUTTI[2].id, modalita: 'online' });
    esigi(r.corpo.ok === true && (r.corpo.presenza || {}).modalita === 'online',
        'la risposta riporta la modalita salvata', JSON.stringify(r.corpo).slice(0, 160));
    esigi(spedite.length === 0, 'cambiare la tendina non manda mail a nessuno');
    const ko = await chiama({ azione: 'imposta', evento: 'napoli-2026-10-02', idIscritto: TUTTI[2].id, modalita: 'ibrido' });
    esigi(ko.stato === 400, 'un valore inventato viene respinto');
    const vuota = await chiama({ azione: 'imposta', evento: 'napoli-2026-10-02', idIscritto: TUTTI[2].id, modalita: '' });
    esigi(vuota.corpo.ok === true && (vuota.corpo.presenza || {}).modalita === '',
        'il valore vuoto e ammesso: vale "in presenza"');
});

(async () => {
    for (const p of prove) {
        console.log('\n' + p.titolo);
        await p.fn();
    }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
