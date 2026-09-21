/* ============================================================
   PROVE - api/presenze.js, azione "sposta-modalita"
   ------------------------------------------------------------
       node prove/sposta-modalita.prove.js

   Niente da installare: Firestore, l'autenticazione e il server di
   posta sono finti e stanno qui dentro. Esce con 1 se qualcosa e'
   rosso, cosi' si puo' appendere a un controllo automatico.

   COSA DIMOSTRANO. L'elenco di un evento ha QUATTRO sezioni - ospiti in
   sala, aderenti Revilaw in sala, sponsor e relatori in sala, online - e
   una persona sta in una sola. Quando i posti in sala finiscono, chi resta fuori non si
   cancella: si sposta all'online e lo si avvisa. E' un'azione
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
     - la modalita' sbagliata e chi non ha il ruolo vengano respinti;
     - le sezioni in sala (aderenti Revilaw, sponsor e relatori) si
       comportino come le altre DOVE devono - stesso spostamento, stessi
       permessi - e diversamente dove devono: nessun avviso automatico,
       perche' entrarci non toglie niente a nessuno e non va annunciato;
     - la copia nascosta a chi sta facendo l'operazione parta su OGNI
       mail, mai in chiaro, e mai al destinatario stesso.
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
    const fuso = Object.assign({}, dati[k] || {}, patch);
    // la sentinella di cancellazione toglie il campo, come fa Firestore
    Object.keys(fuso).forEach(c => { if (fuso[c] && fuso[c].__cancella) delete fuso[c]; });
    dati[k] = fuso;
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
    // lettura in blocco, come quella che serve a conoscere lo stato di partenza
    async getAll() {
        return Array.prototype.slice.call(arguments).map(r => ({
            id: r.id,
            exists: Object.prototype.hasOwnProperty.call(dati, chiave(r._coll, r.id)),
            data: () => dati[chiave(r._coll, r.id)] || {}
        }));
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
        'utenti/desk@esempio.it': { nome: 'Dina Desk', ruolo: 'staff', attivo: true, eventi: true },
        // un collaboratore dell'equity partner: opera a nome suo, ma chi preme e lui
        'utenti/aiuto@esempio.it': { nome: 'Ada Aiuto', ruolo: 'collaboratore', attivo: true, collaboratoreDi: 'socio@esempio.it' }
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
    /* Il riepilogo "Tutte" non e' un evento: le presenze stanno per evento, e
       una sezione scritta sotto 'tutti' sarebbe un documento che non si vede da
       nessuna parte. */
    const dalRiepilogo = await chiama({ azione: 'sposta-modalita', evento: 'tutti', modalita: 'aderenti', destinatari: [TUTTI[0]] });
    esigi(dalRiepilogo.stato === 400, 'dal riepilogo non si sposta nessuno', JSON.stringify(dalRiepilogo.corpo));
    esigi(!presenzaDi('tutti', TUTTI[0].id), 'e non resta nessuna presenza orfana');
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

prova('Chi ha gia ricevuto l\'avviso viene saltato, e il rilancio non duplica', async () => {
    scenario();
    const primo = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: TUTTI, mail: MAIL });
    esigi((primo.corpo.mail || {}).inviate === 2, 'il primo giro avvisa i due indirizzi');
    spedite = [];
    // stesso elenco, stesso comando: e' il gesto di chi completa un invio
    // rimasto a meta', e non deve costare una mail doppia a chi era gia' a posto
    const secondo = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: TUTTI, mail: MAIL });
    esigi((secondo.corpo.mail || {}).inviate === 0, 'il secondo giro non manda niente', JSON.stringify(secondo.corpo.mail));
    esigi((secondo.corpo.mail || {}).giaAvvisati === 2, 'e li conta fra i gia avvisati');
    esigi(spedite.length === 0, 'nessuna mail doppia');
    // il reinvio esplicito, invece, riscrive
    const terzo = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[2]], mail: MAIL, forza: true });
    esigi((terzo.corpo.mail || {}).inviate === 1 && spedite.length === 1, 'con "forza" l\'avviso riparte', JSON.stringify(terzo.corpo.mail));
});

prova('Chi rientra in sala e riesce va avvisato di nuovo', async () => {
    scenario();
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[2]], mail: MAIL });
    esigi(spedite.length === 1, 'il primo avviso parte');
    /* Si libera un posto e lo si riporta in sala: l'avviso di prima non vale
       piu', perche' parlava di una sezione in cui non sta piu'. */
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'presenza', destinatari: [TUTTI[2]] });
    esigi(!(presenzaDi('napoli-2026-10-02', TUTTI[2].id) || {}).avvisoModalita,
        'lo spostamento cancella l\'avviso della sezione lasciata');
    // la sala si riempie di nuovo: deve ricevere l'avviso una seconda volta,
    // o si presenterebbe a un evento in cui non ha piu' un posto
    spedite = [];
    const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[2]], mail: MAIL });
    esigi((r.corpo.mail || {}).inviate === 1 && spedite.length === 1,
        'e il secondo passaggio online lo avvisa di nuovo', JSON.stringify(r.corpo.mail));
    esigi((r.corpo.mail || {}).giaAvvisati === 0, 'senza contarlo fra i gia avvisati');
});

prova('Anche la tendina fa decadere l\'avviso della sezione lasciata', async () => {
    scenario();
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[2]], mail: MAIL });
    esigi(!!(presenzaDi('napoli-2026-10-02', TUTTI[2].id) || {}).avvisoModalita, 'l\'avviso c\'e');
    sessione = 'desk@esempio.it';
    const r = await chiama({ azione: 'imposta', evento: 'napoli-2026-10-02', idIscritto: TUTTI[2].id, modalita: 'presenza' });
    esigi(!(presenzaDi('napoli-2026-10-02', TUTTI[2].id) || {}).avvisoModalita,
        'cambiando sezione dalla tendina, l\'avviso vecchio sparisce');
    esigi((r.corpo.presenza || {}).avvisoModalita === null, 'e la risposta lo dice a chi guarda', JSON.stringify(r.corpo.presenza));
    // la nota, che con la sezione non c'entra, non deve toccare l'avviso
    sessione = 'admin@esempio.it';
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[2]], mail: MAIL });
    await chiama({ azione: 'imposta', evento: 'napoli-2026-10-02', idIscritto: TUTTI[2].id, nota: 'richiamare' });
    esigi(!!(presenzaDi('napoli-2026-10-02', TUTTI[2].id) || {}).avvisoModalita, 'scrivere una nota non cancella l\'avviso');
});

prova('Passare fra le sezioni non lascia avvisi vecchi in giro', async () => {
    scenario();
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[2]], mail: MAIL });
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'aderenti', destinatari: [TUTTI[2]] });
    const p = presenzaDi('napoli-2026-10-02', TUTTI[2].id) || {};
    esigi(p.modalita === 'aderenti' && !p.avvisoModalita,
        'fra gli aderenti non resta scritto un avviso che parlava dell\'online', JSON.stringify(p));
});

prova('La terza sezione: aderenti Revilaw', async () => {
    scenario();
    const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'aderenti', destinatari: [TUTTI[0], TUTTI[2]] });
    esigi(r.stato === 200 && r.corpo.ok === true && r.corpo.modalita === 'aderenti',
        'gli aderenti sono una destinazione valida', JSON.stringify(r.corpo).slice(0, 160));
    esigi((presenzaDi('napoli-2026-10-02', TUTTI[0].id) || {}).modalita === 'aderenti'
        && (presenzaDi('napoli-2026-10-02', TUTTI[2].id) || {}).modalita === 'aderenti',
        'la sezione e scritta sulle presenze');
    esigi(spedite.length === 0, 'nessun avviso parte: entrare fra gli aderenti non si annuncia');
    esigi(!(presenzaDi('napoli-2026-10-02', TUTTI[0].id) || {}).avvisoModalita, 'e non resta nessun avviso registrato');
});

prova('Si passa da una sezione all\'altra senza scale', async () => {
    scenario();
    const dove = ['online', 'aderenti', 'presenza', 'online'];
    for (const verso of dove) {
        const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: verso, destinatari: [TUTTI[2]] });
        esigi(r.corpo.ok === true && (presenzaDi('napoli-2026-10-02', TUTTI[2].id) || {}).modalita === verso,
            'da qualunque sezione si arriva a "' + verso + '"');
    }
    // l'ultimo passaggio all'online, con avviso: la sezione di partenza non conta
    const conMail = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[2]], mail: MAIL });
    esigi((conMail.corpo.mail || {}).inviate === 1, 'l\'avviso parte anche a chi era gia online');
});

prova('Un aderente che passa online viene avvisato come tutti', async () => {
    scenario();
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'aderenti', destinatari: [TUTTI[2]] });
    const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[2]], mail: MAIL });
    esigi((r.corpo.mail || {}).inviate === 1 && spedite[0].to === 'lucia@beta.it', 'la mail arriva al suo indirizzo');
    const p = presenzaDi('napoli-2026-10-02', TUTTI[2].id) || {};
    esigi(p.modalita === 'online' && p.avvisoModalita && p.avvisoModalita.modalita === 'online',
        'la sezione e l\'avviso dicono la stessa cosa');
});

prova('La tendina della riga accetta la terza sezione', async () => {
    scenario();
    sessione = 'desk@esempio.it';
    const r = await chiama({ azione: 'imposta', evento: 'napoli-2026-10-02', idIscritto: TUTTI[2].id, modalita: 'aderenti' });
    esigi(r.corpo.ok === true && (r.corpo.presenza || {}).modalita === 'aderenti',
        'chi e abilitato agli Eventi puo classificare un aderente', JSON.stringify(r.corpo).slice(0, 160));
    esigi(spedite.length === 0, 'e non parte nessuna mail');
});

prova('Dal modulo la sezione non si sceglie scrivendo un campo', async () => {
    /* Le iscrizioni dal sito non passano da qui (e' un altro endpoint, con le
       sue prove in iscrizione-aderente.prove.js): qui si tiene ferma la riga di
       codice che fa da confine, cosi' se qualcuno la allarga per sbaglio se ne
       accorge. La CASELLA "sono un aderente" mette nella sezione - quella e' una
       dichiarazione consapevole - ma un "modalita" spedito a mano no: le sole
       che il modulo puo' dichiarare restano presenza e online. */
    const fs = require('fs');
    const src = fs.readFileSync(path.join(RADICE, 'api/iscrizione-nuova.js'), 'utf8');
    const riga = (src.match(/if \(modalita === [^\n]*\) scheda\.modalita = modalita;/) || [''])[0];
    esigi(/'presenza'/.test(riga) && /'online'/.test(riga) && !/aderenti/.test(riga),
        'il campo "modalita" accetta solo presenza e online', riga);
});

prova('Sponsor e relatori: una quarta sezione, in sala e senza mail', async () => {
    /* Sponsor e relatori occupano un posto come tutti gli altri: la sezione
       serve a chi organizza per sapere quali posti sono gia' impegnati da chi
       l'evento lo fa. Per la persona non cambia niente, e infatti non parte
       nessuna mail - annunciare "ti ho messo fra i relatori" a chi relatore
       lo e' gia' non direbbe niente a nessuno. */
    scenario();
    const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'sponsor', destinatari: [TUTTI[2]] });
    esigi(r.stato === 200 && r.corpo.ok === true && r.corpo.modalita === 'sponsor',
        'la quarta sezione si accetta', JSON.stringify(r.corpo).slice(0, 160));
    esigi((presenzaDi('napoli-2026-10-02', TUTTI[2].id) || {}).modalita === 'sponsor', 'la sezione e scritta sulle presenze');
    esigi(spedite.length === 0, 'nessuna mail parte: e una divisione a uso interno');
    esigi(!(presenzaDi('napoli-2026-10-02', TUTTI[2].id) || {}).avvisoModalita, 'e non resta nessun avviso registrato');
});

prova('Da sponsor si esce come da qualunque altra sezione', async () => {
    scenario();
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'sponsor', destinatari: [TUTTI[2]] });
    for (const verso of ['aderenti', 'presenza', 'sponsor']) {
        const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: verso, destinatari: [TUTTI[2]] });
        esigi(r.corpo.ok === true && (presenzaDi('napoli-2026-10-02', TUTTI[2].id) || {}).modalita === verso,
            'da sponsor si passa a "' + verso + '"');
    }
    // e da sponsor all'online l'avviso parte come per chiunque altro
    const online = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[2]], mail: MAIL });
    esigi((online.corpo.mail || {}).inviate === 1, 'e passando all\'online l\'avviso parte lo stesso');
});

prova('La tendina della riga accetta anche sponsor', async () => {
    scenario();
    sessione = 'desk@esempio.it';   // chi e' abilitato agli Eventi puo' cambiarla
    const r = await chiama({ azione: 'imposta', evento: 'napoli-2026-10-02', idIscritto: TUTTI[2].id, modalita: 'sponsor' });
    esigi(r.corpo.ok === true && (r.corpo.presenza || {}).modalita === 'sponsor',
        'la quarta sezione passa anche dalla tendina', JSON.stringify(r.corpo).slice(0, 160));
    esigi(spedite.length === 0, 'e non parte nessuna mail');
});

prova('Dal modulo pubblico non ci si mette fra sponsor e relatori', async () => {
    /* Stessa regola degli aderenti: nella sezione di chi l'evento lo fa non ci
       si mette da soli. La riga di codice che fa da confine sta in un altro
       endpoint, e qui la si tiene ferma. */
    scenario();
    const fs = require('fs');
    const src = fs.readFileSync(path.join(RADICE, 'api/iscrizione-nuova.js'), 'utf8');
    const riga = (src.match(/if \(modalita === [^\n]*\) scheda\.modalita = modalita;/) || [''])[0];
    esigi(!/sponsor/.test(riga), 'il campo "modalita" del modulo non accetta sponsor', riga);
    const no = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'sponsorizzato', destinatari: [TUTTI[0]] });
    esigi(no.stato === 400, 'e una sezione inventata resta respinta', JSON.stringify(no.corpo));
});

prova('Inserendo a mano si sceglie anche la sezione', async () => {
    /* Chi riporta un'iscrizione da Eventbrite o dal telefono sa gia' se quella
       persona viene in sala, e' un aderente, e' uno sponsor o seguira' da
       remoto: la sezione si sceglie li', e finisce dove finiscono tutte le
       decisioni di chi organizza (la collezione "presenze"), non sulla scheda -
       la scheda dice quello che la persona ha dichiarato, e qui non ha
       dichiarato niente. */
    scenario();
    const r = await chiama({
        azione: 'aggiungi', evento: 'napoli-2026-10-02', pagina: 'Napoli 2 Ottobre 2026',
        portale: { id: 'eventbrite' }, modalita: 'sponsor',
        campi: { nome: 'Sonia', cognome: 'Sponsor', email: 'sonia@zeta.it', data: '07/09/2026 09:00' }
    });
    esigi(r.corpo.ok === true && r.corpo.modalita === 'sponsor', 'la sezione torna nella risposta', JSON.stringify(r.corpo).slice(0, 160));
    esigi((presenzaDi('napoli-2026-10-02', r.corpo.id) || {}).modalita === 'sponsor',
        'ed e scritta sulle presenze, non sulla scheda');
    const scheda = dati[chiave('iscrizioni', idScheda(r.corpo.id))] || {};
    esigi(scheda.modalita === undefined, 'la scheda non porta nessuna modalita dichiarata');
});

prova('"In presenza" non lascia documenti inutili', async () => {
    /* Il documento che dice "presenza" e il documento che non c'e' raccontano
       la stessa cosa: il secondo non va scritto. Serve anche a non far
       sembrare "gia' deciso da qualcuno" cio' che e' solo il caso normale. */
    scenario();
    const r = await chiama({
        azione: 'aggiungi', evento: 'napoli-2026-10-02', pagina: 'Napoli 2 Ottobre 2026',
        portale: { id: 'telefono' }, modalita: 'presenza',
        campi: { nome: 'Piero', cognome: 'Presenza', email: 'piero@eta.it', data: '08/09/2026 09:00' }
    });
    esigi(r.corpo.ok === true && r.corpo.modalita === 'presenza', 'la risposta dice "presenza"', JSON.stringify(r.corpo).slice(0, 160));
    esigi(presenzaDi('napoli-2026-10-02', r.corpo.id) === null, 'e nessuna presenza viene scritta');
    // e senza indicarla proprio, si comporta come prima
    const senza = await chiama({
        azione: 'aggiungi', evento: 'napoli-2026-10-02', pagina: 'Napoli 2 Ottobre 2026',
        portale: { id: 'telefono' }, campi: { nome: 'Vuota', cognome: 'Modalita', email: 'vuota@eta.it', data: '09/09/2026 09:00' }
    });
    esigi(senza.corpo.ok === true && senza.corpo.modalita === 'presenza' && presenzaDi('napoli-2026-10-02', senza.corpo.id) === null,
        'anche senza indicarla: vale "in presenza"', JSON.stringify(senza.corpo).slice(0, 160));
});

prova('Inserendo a mano una sezione inventata si viene respinti', async () => {
    /* Prima si controlla, poi si scrive: una sezione sbagliata non deve
       lasciare in giro la scheda senza la sua presenza (o viceversa). */
    scenario();
    const r = await chiama({
        azione: 'aggiungi', evento: 'napoli-2026-10-02', pagina: 'Napoli 2 Ottobre 2026',
        portale: { id: 'eventbrite' }, modalita: 'vip',
        campi: { nome: 'Vito', cognome: 'Vip', email: 'vito@theta.it', data: '10/09/2026 09:00' }
    });
    esigi(r.stato === 400 && !r.corpo.ok, 'la richiesta viene respinta', JSON.stringify(r.corpo));
    esigi(!dati[chiave('iscrizioni', idScheda('vito@theta.it|10/09/2026 09:00'))], 'e nessuna scheda resta scritta a meta');
});

prova('La conferma dell\'inserimento a mano cambia SOLO per l\'online', async () => {
    /* Le sezioni sono quattro, ma questa mail ne distingue due: chi segue da
       remoto non ha un posto riservato e la mail non deve dirgli il contrario;
       aderenti Revilaw e sponsor in sala ci vanno come gli ospiti, e quelle
       due sezioni sono divisioni interne di chi organizza - scriverle a chi si
       iscrive non direbbe niente di utile.
       Il formato vive nel browser (area-riservata/newsletter-format.js) ma si
       lascia caricare anche qui: e' la stessa funzione che compone la mail
       vera, quindi si prova quella e non una copia. */
    const NF = require(path.join(RADICE, '..', 'area-riservata', 'newsletter-format.js'));
    const base = {
        nome: 'Sonia', cognome: 'Sponsor', portale: 'Eventbrite', partecipanti: 1,
        dataIscrizione: '12/09/2026 16:40',
        evento: { titolo: 'Napoli', quando: '2 ottobre 2026', luogo: 'Hotel Excelsior', indirizzo: 'Via Partenope 48' }
    };
    const inSala = NF.confermaEvento(base);
    esigi(NF.confermaEvento(Object.assign({}, base, { modalita: 'presenza' })).html === inSala.html,
        '"presenza" e la mail di sempre');
    esigi(NF.confermaEvento(Object.assign({}, base, { modalita: 'aderenti' })).html === inSala.html,
        'e "aderenti" non cambia una virgola');
    esigi(NF.confermaEvento(Object.assign({}, base, { modalita: 'sponsor' })).html === inSala.html,
        'e nemmeno "sponsor"');
    esigi(/Il tuo posto è riservato/.test(inSala.testo) && /Sede: /.test(inSala.testo),
        'in sala si promette il posto, e si dice dove');

    const online = NF.confermaEvento(Object.assign({}, base, { modalita: 'online' }));
    esigi(!/posto è riservato/.test(online.testo), 'online NON promette nessun posto in sala');
    esigi(/partecipazione online è registrata/.test(online.testo) && /Partecipazione: Online/.test(online.testo),
        'lo dice nel testo e nel riepilogo');
    esigi(!/Sede: /.test(online.testo), 'e non elenca la sede, che a chi segue da casa non serve');
    esigi(/Le tue 3 partecipazioni online sono registrate/.test(
        NF.confermaEvento(Object.assign({}, base, { modalita: 'online', partecipanti: 3 })).testo),
        'e al plurale regge anche piu di una partecipazione');
});

prova('Ogni avviso torna in copia nascosta a chi lo manda', async () => {
    /* La copia nascosta e' la PROVA che la mail e' partita, e con che testo: chi
       sposta cinquanta persone deve poterlo dimostrare senza chiedere niente a
       nessuno. Va su ogni avviso, non su uno solo, e non deve mai comparire al
       destinatario (che leggerebbe l'indirizzo di chi lo ha spostato). */
    scenario();
    const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: TUTTI, mail: MAIL });
    esigi((r.corpo.mail || {}).inviate === 2, 'partono i due avvisi dello scenario', JSON.stringify(r.corpo.mail));
    esigi(spedite.length === 2 && spedite.every(m => Array.isArray(m.bcc) && m.bcc.length === 1 && m.bcc[0] === 'admin@esempio.it'),
        'su ogni avviso c\'e la copia nascosta a chi sposta', JSON.stringify(spedite.map(m => m.bcc)));
    esigi(spedite.every(m => !m.cc), 'e non e una copia in chiaro: il destinatario non la vede');
});

prova('Con un collaboratore la copia va a lui e al suo riferimento', async () => {
    /* "Chi sta facendo l'operazione" sono due persone insieme: il collaboratore
       che premi, e l'utente a nome del quale opera - quello che firma la scheda
       e a cui tornano le risposte. La conferma serve a entrambi, e servono
       entrambi gli indirizzi perche' nessuno dei due la cerchi nella casella
       dell'altro. */
    scenario();
    sessione = 'aiuto@esempio.it';
    const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[2]], mail: MAIL });
    esigi((r.corpo.mail || {}).inviate === 1, 'il collaboratore sposta e avvisa come il suo riferimento', JSON.stringify(r.corpo));
    const bcc = (spedite[0] || {}).bcc || [];
    esigi(bcc.length === 2 && bcc.indexOf('socio@esempio.it') >= 0 && bcc.indexOf('aiuto@esempio.it') >= 0,
        'in copia nascosta ci sono il riferimento e il collaboratore', JSON.stringify(bcc));
});

prova('Chi sposta se stesso non riceve la mail due volte', async () => {
    /* Un indirizzo che e' insieme destinatario e operatore: la copia nascosta
       gli farebbe arrivare la stessa mail due volte, e la seconda non
       dimostrerebbe niente che non dica la prima. */
    scenario();
    dati[chiave('iscrizioni', idScheda('admin@esempio.it|07/09/2026 09:00'))] = { nome: 'Anna', cognome: 'Admin', email: 'admin@esempio.it' };
    const r = await chiama({
        azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online',
        destinatari: [{ id: 'admin@esempio.it|07/09/2026 09:00' }], mail: MAIL
    });
    esigi((r.corpo.mail || {}).inviate === 1 && spedite[0].to === 'admin@esempio.it', 'la mail parte al suo indirizzo');
    esigi(spedite[0].bcc === undefined, 'e senza copia nascosta, che sarebbe la stessa mail due volte', JSON.stringify(spedite[0].bcc));
});

prova('Anche la conferma a mano e la richiesta dati tornano in copia', async () => {
    /* Le due mail che partono UNA alla volta la copia nascosta ce l'avevano gia'
       da prima: qui si tiene ferma, perche' ora la compone la stessa funzione
       degli invii in blocco e una svista la toglierebbe a tutt'e quattro. */
    scenario();
    const agg = await chiama({
        azione: 'aggiungi', evento: 'napoli-2026-10-02', pagina: 'Napoli 2 Ottobre 2026',
        portale: { id: 'eventbrite' }, campi: { nome: 'Furio', cognome: 'Fuori', email: 'furio@eta.it' },
        mail: { oggetto: 'Iscrizione registrata', html: '<p>Gentile Furio, <a href="{{COMPLETA}}">modifica</a></p>' }
    });
    esigi(agg.corpo.ok === true && (agg.corpo.mail || {}).inviata === true, 'la conferma parte', JSON.stringify(agg.corpo).slice(0, 160));
    esigi(JSON.stringify((spedite[0] || {}).bcc) === '["admin@esempio.it"]', 'con la copia a chi ha inserito la scheda', JSON.stringify((spedite[0] || {}).bcc));

    spedite = [];
    const req = await chiama({
        azione: 'richiedi-dati', evento: 'napoli-2026-10-02', idIscritto: TUTTI[2].id,
        mail: { oggetto: 'Completa l\'iscrizione', html: '<p><a href="{{COMPLETA}}">completa</a></p>' }
    });
    esigi(req.corpo.ok === true, 'la richiesta dati parte', JSON.stringify(req.corpo).slice(0, 160));
    esigi(JSON.stringify((spedite[0] || {}).bcc) === '["admin@esempio.it"]', 'con la copia a chi chiede', JSON.stringify((spedite[0] || {}).bcc));
});

prova('Anche l\'invito B2B torna in copia a chi lo manda', async () => {
    scenario();
    const r = await chiama({
        azione: 'invita-b2b', evento: 'napoli-2026-10-02', destinatari: [TUTTI[2]],
        mail: { oggetto: 'Incontri B2B', html: '<p>Gentile {{NOME}}, <a href="{{B2B}}">prenota</a></p>' }
    });
    esigi(r.corpo.ok === true && r.corpo.inviate === 1, 'l\'invito parte', JSON.stringify(r.corpo).slice(0, 160));
    const bcc = (spedite[0] || {}).bcc || [];
    esigi(bcc.length === 1 && bcc[0] === 'admin@esempio.it', 'con la copia nascosta a chi invita', JSON.stringify(bcc));
});

/* ------------------------------------------------------------
   LA CODA PER UN POSTO IN SALA
   ------------------------------------------------------------
   La mail del passaggio online promette per iscritto che il nominativo
   resta in lista d'attesa e che se un posto si libera gli si scrive.
   Una promessa che non si scrive anche nei dati non e' una promessa:
   quando il posto si libera nessuno sa piu' chi chiamare. Qui si
   verifica che lo spostamento la scriva, che la scriva anche quando la
   mail non parte - e' lo SPOSTAMENTO a mettere in coda, non l'avviso -
   e che tornando in sala la coda finisca.
   ------------------------------------------------------------ */

prova('Chi passa online entra in lista d attesa', async () => {
    scenario();
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: TUTTI, mail: MAIL });
    esigi(TUTTI.every(d => (presenzaDi('napoli-2026-10-02', d.id) || {}).listaAttesa === true),
        'la coda e scritta su tutte e sei le presenze',
        JSON.stringify(TUTTI.map(d => (presenzaDi('napoli-2026-10-02', d.id) || {}).listaAttesa)));
    /* Anche su chi la mail non l'ha ricevuta: chi non ha indirizzo, chi ha
       annullato, chi su Firestore una scheda non ce l'ha. In coda ci sono
       lo stesso - il posto in sala lo hanno perso come gli altri. */
    esigi((presenzaDi('napoli-2026-10-02', 'nino.senzamail|04/09/2026 09:00') || {}).listaAttesa === true,
        'compreso chi non ha un indirizzo a cui scrivere');
    esigi((presenzaDi('napoli-2026-10-02', 'solo.sul.foglio@delta.it|06/09/2026 09:00') || {}).listaAttesa === true,
        'e chi su Firestore non ha nessuna scheda');
});

prova('E in coda lo mette lo spostamento, non l avviso', async () => {
    scenario();
    /* Senza `mail` non parte niente, ma il posto in sala lo ha perso lo
       stesso: la coda e' una conseguenza dello spostamento. */
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[0]] });
    esigi(spedite.length === 0, 'senza mail non parte nessun avviso');
    esigi((presenzaDi('napoli-2026-10-02', TUTTI[0].id) || {}).listaAttesa === true, 'ma la coda e scritta');
});

prova('Anche se la posta si ferma, la coda resta scritta', async () => {
    scenario();
    cadeLaPosta = true;
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[0]], mail: MAIL });
    esigi((presenzaDi('napoli-2026-10-02', TUTTI[0].id) || {}).listaAttesa === true,
        'lo spostamento viene prima delle mail, e la coda con lui');
});

prova('Tornando in sala la coda finisce', async () => {
    scenario();
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'online', destinatari: [TUTTI[0]], mail: MAIL });
    esigi((presenzaDi('napoli-2026-10-02', TUTTI[0].id) || {}).listaAttesa === true, 'prima era in coda');
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'presenza', destinatari: [TUTTI[0]] });
    const p = presenzaDi('napoli-2026-10-02', TUTTI[0].id) || {};
    esigi(p.listaAttesa === undefined, 'riportato in sala la coda si cancella: il posto lo ha avuto',
        JSON.stringify(p.listaAttesa));
    esigi(p.modalita === 'presenza', 'e la sezione e quella giusta', p.modalita);
});

prova('Le altre sezioni in sala non mettono in coda nessuno', async () => {
    scenario();
    /* Aderenti e sponsor sono in sala: non aspettano nessun posto, e la
       cancellazione non si scrive dove non c'era niente da togliere. */
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'aderenti', destinatari: [TUTTI[0]] });
    esigi((presenzaDi('napoli-2026-10-02', TUTTI[0].id) || {}).listaAttesa === undefined,
        'fra gli aderenti nessuna coda');
    await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'sponsor', destinatari: [TUTTI[1]] });
    esigi((presenzaDi('napoli-2026-10-02', TUTTI[1].id) || {}).listaAttesa === undefined,
        'e nemmeno fra sponsor e relatori');
});

(async () => {
    for (const p of prove) {
        console.log('\n' + p.titolo);
        await p.fn();
    }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
