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
       permessi, l'avviso solo se chi sposta lo chiede - e diversamente
       dove devono: a Milano chi ci entra mentre aspetta ancora di
       confermare l'email e' confermato d'ufficio e riceve subito l'invito
       in PDF, come dopo il clic (con o senza avviso);
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
    // i campi annidati scritti con il punto ("daSpostamento.righe"), come li intende Firestore
    const piatto = {};
    Object.keys(patch || {}).forEach(c => {
        if (c.indexOf('.') < 0) { piatto[c] = patch[c]; return; }
        const [a, b] = c.split('.');
        piatto[a] = Object.assign({}, (dati[k] || {})[a] || {}, piatto[a] || {}, { [b]: patch[c] });
    });
    patch = piatto;
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
                    async set(patch) { fondi(coll, id, patch); },
                    async delete() { delete dati[chiave(coll, id)]; ordine.push({ tipo: 'cancellazione', coll: coll, id: id }); },
                    // come Firestore: update su un documento che non c'e' e' un errore
                    async update(patch) {
                        if (!Object.prototype.hasOwnProperty.call(dati, chiave(coll, id))) throw new Error('documento inesistente: ' + id);
                        fondi(coll, id, patch);
                    }
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
    },
    /* Una transazione alla buona: si legge, e le scritture si applicano alla
       fine. Una alla volta, in fila: e' l'effetto che Firestore ottiene
       ritentando quelle in conflitto, ed e' quello che serve alle prove di due
       spostamenti insieme. `rompiTransazione` fa fallire la prossima. */
    runTransaction(fn) {
        const giro = codaTransazioni.then(async () => {
            if (rompiTransazione) { rompiTransazione = false; throw new Error('10 ABORTED: Too much contention'); }
            const ops = [];
            const t = {
                get: rif => rif.get(),
                update(rif, patch) { ops.push(() => rif.update(patch)); },
                set(rif, patch) { ops.push(() => rif.set(patch)); }
            };
            const r = await fn(t);
            for (const op of ops) await op();
            return r;
        });
        codaTransazioni = giro.catch(() => { });
        return giro;
    }
};
let codaTransazioni = Promise.resolve();
let rompiTransazione = false;
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
let lentezzaPosta = 0;   // millisecondi per mail: per far sovrapporre due spostamenti

// ---------- intercetta i require ----------
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') {
        return {
            createTransport: () => ({
                sendMail: async m => {
                    if (lentezzaPosta) await new Promise(r => setTimeout(r, lentezzaPosta));
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
    spedite = []; ordine.length = 0; cadeLaPosta = false; lentezzaPosta = 0; rompiTransazione = false; sessione = 'admin@esempio.it';
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
    esigi(spedite.length === 0, 'senza la mail nella richiesta non parte nessun avviso');
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

prova('Sponsor e relatori: una quarta sezione, in sala', async () => {
    /* Sponsor e relatori occupano un posto come tutti gli altri: la sezione
       serve a chi organizza per sapere quali posti sono gia' impegnati da chi
       l'evento lo fa. L'avviso parte solo se chi sposta lo chiede (la mail
       nella richiesta): qui non lo chiede, e non parte niente. */
    scenario();
    const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'sponsor', destinatari: [TUTTI[2]] });
    esigi(r.stato === 200 && r.corpo.ok === true && r.corpo.modalita === 'sponsor',
        'la quarta sezione si accetta', JSON.stringify(r.corpo).slice(0, 160));
    esigi((presenzaDi('napoli-2026-10-02', TUTTI[2].id) || {}).modalita === 'sponsor', 'la sezione e scritta sulle presenze');
    esigi(spedite.length === 0, 'senza la mail nella richiesta non parte niente');
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

prova('Dal modulo pubblico dell\'evento non ci si mette fra sponsor e relatori', async () => {
    /* Stessa regola degli aderenti: nella sezione di chi l'evento lo fa non ci
       si mette da soli dal modulo dell'evento. Fra sponsor e relatori si entra
       da UNA pagina sola, quella riservata a loro (PAGINA_SPONSOR, la coda
       "- Sponsor e relatori" del nome della pagina). Le righe di codice che
       fanno da confine stanno in un altro endpoint, e qui le si tiene ferme. */
    scenario();
    const fs = require('fs');
    const src = fs.readFileSync(path.join(RADICE, 'api/iscrizione-nuova.js'), 'utf8');
    const riga = (src.match(/if \(modalita === [^\n]*\) scheda\.modalita = modalita;/) || [''])[0];
    esigi(!/sponsor/.test(riga), 'il campo "modalita" del modulo dell\'evento non accetta sponsor', riga);
    esigi(/if \(modalita === 'sponsor' && PAGINA_SPONSOR\.test\(pagina\)\)/.test(src) && /const PAGINA_SPONSOR = \/\\s-\\s\*sponsor e relatori\\s\*\$\/i;/.test(src),
        'sponsor entra solo con la coda della pagina riservata a sponsor e relatori (PAGINA_SPONSOR)');
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


/* ---------- MILANO: CHI ENTRA FRA ADERENTI O SPONSOR NON CONFERMA PIU' ----------
   A Milano l'iscrizione dal sito vale dopo la conferma dell'email. Chi
   organizza puo' spostare fra gli aderenti Revilaw o fra sponsor e relatori
   anche chi la conferma non l'ha ancora data: da li' non gli si chiede piu'.
   La scheda si conferma d'ufficio (come: 'spostamento'), esce dal giro dei
   solleciti (confermaInAttesa tolta) e riceve subito l'invito in PDF, come
   dopo il clic - con o senza avviso dello spostamento. */
const MI = 'milano-2027-02-26';
const PAGINA_MI = 'Milano 26 Febbraio 2027 - Iscrizione';
const MI_ATTESA = { id: 'alda@attesa.it|10/01/2027 10:00' };
const MI_CLIC = { id: 'carlo@clic.it|10/01/2027 11:00' };
const MI_MANO = { id: 'mara@mano.it|10/01/2027 12:00' };
const MI_ANNULLATA = { id: 'anna@annullata.it|10/01/2027 13:00' };
const MI_PRESENTE = { id: 'pia@presente.it|10/01/2027 14:00' };
const NA_ATTESA = { id: 'nello@napoli.it|10/09/2026 10:00' };
const MI_PARTECIPANTE = { id: 'capo@ordine.it|10/01/2027 15:00', doc: 'capo@ordine.it|10-01-2027 15:00~p2' };
/* Un amministratore suo: il servizio tiene un freno di 60 richieste al
   minuto per utente, e le prove qui sopra lo hanno gia' quasi consumato per
   admin@esempio.it. */
function scenarioMilano() {
    scenario();
    dati['utenti/milano@esempio.it'] = { nome: 'Mila Admin', ruolo: 'admin', attivo: true, eventi: true };
    sessione = 'milano@esempio.it';
    const attesa = { pagina: PAGINA_MI, confermaInAttesa: true, mailConferma: { quando: 1, ok: true }, modalita: 'presenza' };
    dati[chiave('iscrizioni', idScheda(MI_ATTESA.id))] = Object.assign({ nome: 'Alda', cognome: 'Attesa', email: 'alda@attesa.it', azienda: 'Alfa S.p.A.' }, attesa);
    dati[chiave('iscrizioni', idScheda(MI_CLIC.id))] = { nome: 'Carlo', cognome: 'Clic', email: 'carlo@clic.it', pagina: PAGINA_MI,
        emailConfermata: { quando: 111, come: 'mail' }, mailInvito: { quando: 112, ok: true } };
    dati[chiave('iscrizioni', idScheda(MI_MANO.id))] = { nome: 'Mara', cognome: 'Mano', email: 'mara@mano.it', pagina: 'Milano 26 Febbraio 2027', inserito: true };
    dati[chiave('iscrizioni', idScheda(MI_ANNULLATA.id))] = Object.assign({ nome: 'Anna', cognome: 'Annullata', email: 'anna@annullata.it', annullato: true }, attesa);
    dati[chiave('iscrizioni', idScheda(MI_PRESENTE.id))] = Object.assign({ nome: 'Pia', cognome: 'Presente', email: 'pia@presente.it' }, attesa);
    dati[chiave('presenze', idPresenza(MI, MI_PRESENTE.id))] = { evento: MI, idIscritto: MI_PRESENTE.id, stato: 'presente' };
    dati[chiave('iscrizioni', idScheda(NA_ATTESA.id))] = { nome: 'Nello', cognome: 'Napoli', email: 'nello@napoli.it', pagina: 'Napoli 2 Ottobre 2026', confermaInAttesa: true, mailConferma: { quando: 1, ok: true } };
    // la scheda di un partecipante: il documento non e' quello che si ricava dall'id
    dati[chiave('iscrizioni', MI_PARTECIPANTE.doc)] = Object.assign({ nome: 'Paolo', cognome: 'Partecipante', email: 'paolo@ordine.it' }, attesa);
}
const schedaDi = id => dati[chiave('iscrizioni', idScheda(id))] || {};
const invitiA = a => spedite.filter(m => m.to === a && (m.attachments || []).some(x => /\.pdf$/.test(x.filename)));

prova('Milano: chi aspetta la conferma ed entra fra gli aderenti e confermato d\'ufficio', async () => {
    scenarioMilano();
    const r = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA] });
    esigi(r.stato === 200 && r.corpo.ok === true, 'lo spostamento va a buon fine', JSON.stringify(r.corpo).slice(0, 200));
    const s = schedaDi(MI_ATTESA.id);
    const c = s.emailConfermata || {};
    esigi(c.quando > 0 && c.come === 'spostamento' && c.verso === 'aderenti' && c.da === 'milano@esempio.it',
        'sulla scheda: confermata con lo spostamento, da chi e verso dove', JSON.stringify(c));
    esigi(!('confermaInAttesa' in s), 'il giro dei solleciti non la cerca piu\'');
    esigi(r.corpo.conferme && r.corpo.conferme.confermate === 1 && r.corpo.conferme.righe[0].id === MI_ATTESA.id,
        'la risposta dice chi e\' stato confermato', JSON.stringify(r.corpo.conferme));
    const inv = invitiA('alda@attesa.it');
    esigi(inv.length === 1 && r.corpo.conferme.inviti === 1, 'parte l\'invito in PDF, come dopo il clic', spedite.map(m => m.to + ' ' + m.subject).join(' | '));
    esigi(inv.length === 1 && /Il tuo invito/.test(inv[0].subject) && /In sala/.test(inv[0].text), 'e dice "in sala"', inv[0] && inv[0].subject);
    esigi((s.mailInvito || {}).ok === true && s.mailInvito.da === 'spostamento' && s.mailInvito.a === 'alda@attesa.it' && !s.mailInvito.inCorsoFino,
        'l\'invito resta segnato sulla scheda, con l\'indirizzo', JSON.stringify(s.mailInvito));
    esigi(String(inv[0] && inv[0].bcc) === 'milano@esempio.it', 'e torna in copia nascosta a chi ha spostato', JSON.stringify(inv[0] && inv[0].bcc));
    esigi(spedite.length === 1 && !(presenzaDi(MI, MI_ATTESA.id) || {}).avvisoModalita, 'senza avviso richiesto parte solo l\'invito');
    esigi((presenzaDi(MI, MI_ATTESA.id) || {}).modalita === 'aderenti', 'e la sezione e\' quella nuova');
});

prova('Milano: fra sponsor e relatori, con l\'avviso, partono invito e avviso', async () => {
    scenarioMilano();
    const r = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'sponsor', destinatari: [MI_ATTESA, MI_CLIC], mail: MAIL });
    esigi(r.corpo.ok === true && (schedaDi(MI_ATTESA.id).emailConfermata || {}).verso === 'sponsor', 'confermata verso sponsor e relatori');
    esigi(r.corpo.conferme.confermate === 1, 'una sola conferma: l\'altro aveva gia\' confermato');
    esigi(invitiA('alda@attesa.it').length === 1 && invitiA('carlo@clic.it').length === 0, 'l\'invito solo a chi e\' confermato adesso');
    const avvisi = spedite.filter(m => /i posti sono esauriti/.test(m.html || ''));
    esigi(avvisi.length === 2 && avvisi.every(m => m.bcc), 'l\'avviso parte a tutti e due, con la copia nascosta', String(avvisi.length));
    esigi((presenzaDi(MI, MI_ATTESA.id) || {}).avvisoModalita.modalita === 'sponsor', 'e resta scritto per la sezione nuova');
    // una mail sola a chi aspettava la conferma: l'avviso, con l'invito allegato
    const adAlda = spedite.filter(m => m.to === 'alda@attesa.it');
    esigi(adAlda.length === 1 && /i posti sono esauriti/.test(adAlda[0].html) && (adAlda[0].attachments || []).some(x => /\.pdf$/.test(x.filename)),
        'una mail sola: l\'avviso con l\'invito in PDF allegato', adAlda.map(m => m.subject).join(' | '));
    const adCarlo = spedite.filter(m => m.to === 'carlo@clic.it');
    esigi(adCarlo.length === 1 && !adCarlo[0].attachments, 'chi aveva gia\' confermato riceve l\'avviso senza allegati');
    esigi((schedaDi(MI_ATTESA.id).mailInvito || {}).ok === true && schedaDi(MI_ATTESA.id).mailInvito.con === 'avviso', 'e l\'invito risulta partito, dentro l\'avviso');
});

prova('Milano: chi ha gia\' confermato con il clic non si tocca', async () => {
    scenarioMilano();
    await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_CLIC] });
    const c = schedaDi(MI_CLIC.id).emailConfermata || {};
    esigi(c.quando === 111 && c.come === 'mail' && !c.verso, 'la sua conferma resta quella del clic', JSON.stringify(c));
    esigi(spedite.length === 0, 'e nessun invito: lo ha gia\'');
});

prova('Milano: niente da confermare per chi non e\' in attesa', async () => {
    scenarioMilano();
    const r = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_MANO, MI_ANNULLATA, MI_PRESENTE, { id: 'solo.foglio@m.it|10/01/2027 16:00' }] });
    esigi(r.corpo.ok === true && r.corpo.conferme.confermate === 0, 'nessuna conferma', JSON.stringify(r.corpo.conferme));
    esigi(!schedaDi(MI_MANO.id).emailConfermata, 'inserita a mano: l\'indirizzo l\'ha scritto chi organizza');
    esigi(!schedaDi(MI_ANNULLATA.id).emailConfermata && schedaDi(MI_ANNULLATA.id).confermaInAttesa === true, 'annullata: non si tocca');
    esigi(!schedaDi(MI_PRESENTE.id).emailConfermata, 'segnata presente: in attesa non e\'');
    esigi(!Object.prototype.hasOwnProperty.call(dati, chiave('iscrizioni', idScheda('solo.foglio@m.it|10/01/2027 16:00'))),
        'senza scheda: non ne nasce una vuota');
    esigi(spedite.length === 0, 'e nessun invito');
});

prova('Milano: verso l\'online o fra gli ospiti la conferma resta da dare', async () => {
    scenarioMilano();
    for (const verso of ['online', 'presenza']) {
        const r = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: verso, destinatari: [MI_ATTESA] });
        esigi(r.corpo.ok === true && r.corpo.conferme === null, 'verso "' + verso + '": nessuna conferma', JSON.stringify(r.corpo.conferme));
    }
    esigi(!schedaDi(MI_ATTESA.id).emailConfermata && schedaDi(MI_ATTESA.id).confermaInAttesa === true, 'la scheda aspetta ancora');
    esigi(spedite.length === 0, 'e nessun invito');
});

prova('Napoli non chiede la conferma: niente da confermare', async () => {
    scenarioMilano();
    const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'aderenti', destinatari: [NA_ATTESA] });
    esigi(r.corpo.ok === true && r.corpo.conferme.confermate === 0 && !schedaDi(NA_ATTESA.id).emailConfermata,
        'la scheda di un evento senza conferma non si tocca');
});

prova('Milano: la scheda del partecipante si conferma sul suo documento', async () => {
    scenarioMilano();
    await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_PARTECIPANTE] });
    const s = dati[chiave('iscrizioni', MI_PARTECIPANTE.doc)] || {};
    esigi((s.emailConfermata || {}).come === 'spostamento', 'confermata la scheda indicata dalla riga', JSON.stringify(s.emailConfermata));
    esigi(invitiA('paolo@ordine.it').length === 1, 'e l\'invito va al suo indirizzo');
});

prova('Milano: l\'invito che non parte si rimanda spostando di nuovo', async () => {
    scenarioMilano();
    cadeLaPosta = true;
    const r1 = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA] });
    esigi(r1.corpo.ok === true && (schedaDi(MI_ATTESA.id).emailConfermata || {}).come === 'spostamento',
        'la posta ferma non ferma la conferma');
    esigi(r1.corpo.conferme.inviti === 0 && r1.corpo.conferme.invitiFalliti.length === 1 && schedaDi(MI_ATTESA.id).mailInvito.ok === false,
        'l\'invito non partito si dice, e resta scritto', JSON.stringify(r1.corpo.conferme));
    cadeLaPosta = false;
    const r2 = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'sponsor', destinatari: [MI_ATTESA] });
    esigi(r2.corpo.conferme.confermate === 0 && r2.corpo.conferme.inviti === 1 && invitiA('alda@attesa.it').length === 1,
        'allo spostamento dopo l\'invito parte, senza una seconda conferma', JSON.stringify(r2.corpo.conferme));
    esigi((schedaDi(MI_ATTESA.id).emailConfermata || {}).verso === 'aderenti', 'la conferma resta quella della prima volta');
    const r3 = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA] });
    esigi(r3.corpo.conferme.inviti === 0 && invitiA('alda@attesa.it').length === 1, 'e non riparte una seconda volta');
});

prova('Milano: un clic arrivato prima vince sullo spostamento', async () => {
    /* La conferma si scrive in transazione, rileggendo la scheda: se la
       persona ha cliccato fra la lettura dell'elenco e lo spostamento, la sua
       conferma resta quella del clic. Qui il clic arriva dentro la lettura
       in blocco delle schede, l'ultima cosa che il servizio legge prima. */
    scenarioMilano();
    const veroGetAll = db.getAll;
    db.getAll = async function () {
        // la lettura vede la scheda com'era: ancora in attesa
        const letti = (await veroGetAll.apply(db, arguments)).map(x => {
            const d = JSON.parse(JSON.stringify(x.data()));
            return { id: x.id, exists: x.exists, data: () => d };
        });
        const k = chiave('iscrizioni', idScheda(MI_ATTESA.id));
        if (letti.some(x => x.id === idScheda(MI_ATTESA.id))) {
            // e subito dopo la persona clicca
            dati[k] = Object.assign({}, dati[k], { emailConfermata: { quando: 222, come: 'mail' } });
            delete dati[k].confermaInAttesa;
        }
        return letti;
    };
    try {
        const r = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA] });
        const c = schedaDi(MI_ATTESA.id).emailConfermata || {};
        esigi(r.corpo.ok === true && c.come === 'mail' && c.quando === 222, 'resta la conferma del clic', JSON.stringify(c));
        esigi(r.corpo.conferme.confermate === 0 && invitiA('alda@attesa.it').length === 0, 'e l\'invito non parte da qui: lo manda il clic');
    } finally { db.getAll = veroGetAll; }
});

prova('Milano: due spostamenti insieme sulle stesse righe, un invito a testa', async () => {
    /* Due persone che lavorano sull'evento, o una finestra chiusa e
       ripremuta mentre la prima chiamata spedisce ancora: l'invito si prenota
       in transazione prima di partire, e chi lo trova prenotato salta. */
    scenarioMilano();
    const altre = [];
    for (let k = 0; k < 4; k++) {
        const id = 'persona' + k + '@m.it|11/01/2027 10:0' + k;
        dati[chiave('iscrizioni', idScheda(id))] = { nome: 'P' + k, cognome: 'Rossi', email: 'persona' + k + '@m.it', pagina: PAGINA_MI, confermaInAttesa: true, mailConferma: { quando: 1, ok: true } };
        altre.push({ id: id });
    }
    dati['utenti/milano2@esempio.it'] = { nome: 'Mila Due', ruolo: 'admin', attivo: true, eventi: true };
    lentezzaPosta = 30;
    const primo = chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: altre });
    await new Promise(r => setTimeout(r, 45));
    sessione = 'milano2@esempio.it';
    const secondo = chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: altre });
    const [r1, r2] = await Promise.all([primo, secondo]);
    lentezzaPosta = 0;
    const perIndirizzo = altre.map((x, k) => invitiA('persona' + k + '@m.it').length);
    esigi(perIndirizzo.every(n => n === 1), 'ognuno riceve un invito solo', perIndirizzo.join(','));
    esigi(r1.corpo.conferme.inviti + r2.corpo.conferme.inviti === 4 && r1.corpo.conferme.confermate + r2.corpo.conferme.confermate === 4,
        'quattro conferme e quattro inviti in tutto', JSON.stringify([r1.corpo.conferme, r2.corpo.conferme]));
});

prova('Milano: una conferma che non riesce non ferma il resto', async () => {
    scenarioMilano();
    const altra = { id: 'bea@m.it|11/01/2027 11:00' };
    dati[chiave('iscrizioni', idScheda(altra.id))] = { nome: 'Bea', cognome: 'Bianchi', email: 'bea@m.it', pagina: PAGINA_MI, confermaInAttesa: true, mailConferma: { quando: 1, ok: true } };
    rompiTransazione = true;   // la prima conferma trova la contesa
    const r = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA, altra], mail: MAIL });
    esigi(r.stato === 200 && r.corpo.ok === true, 'la risposta e\' quella di uno spostamento riuscito', JSON.stringify(r.corpo).slice(0, 200));
    esigi(r.corpo.conferme.nonConfermate === 1 && r.corpo.conferme.confermate === 1, 'una conferma non registrata si conta', JSON.stringify(r.corpo.conferme));
    esigi(schedaDi(MI_ATTESA.id).confermaInAttesa === true && !schedaDi(MI_ATTESA.id).emailConfermata, 'quella scheda resta in attesa');
    esigi((schedaDi(altra.id).emailConfermata || {}).come === 'spostamento' && invitiA('bea@m.it').length === 1, 'l\'altra e\' confermata e ha il suo invito');
    esigi((r.corpo.mail || {}).inviate === 2, 'e gli avvisi partono a tutti e due', JSON.stringify(r.corpo.mail));
    esigi(ordine.some(o => o.tipo === 'scrittura' && o.coll === 'meta'), 'e l\'elenco sa che qualcosa e\' cambiato');
    const r2 = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA] });
    esigi(r2.corpo.conferme.confermate === 1 && (schedaDi(MI_ATTESA.id).emailConfermata || {}).come === 'spostamento', 'ripetendo lo spostamento, la conferma si registra');
});

prova('Milano: a evento finito la conferma si', async () => {
    /* La conferma toglie la riga dall'attesa, e serve anche dopo; l'invito e'
       "da esibire all'ingresso": a evento finito non parte. */
    scenarioMilano();
    const veroNow = Date.now;
    Date.now = () => Date.parse('2027-02-27T10:00:00+01:00');
    try {
        const r = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA] });
        esigi(r.corpo.conferme.confermate === 1 && r.corpo.conferme.inviti === 0 && spedite.length === 0, 'confermata, ma nessun invito', JSON.stringify(r.corpo.conferme));
    } finally { Date.now = veroNow; }
});

prova('Milano: l\'invito partito a un indirizzo vecchio non vale per quello nuovo', async () => {
    scenarioMilano();
    const k = chiave('iscrizioni', idScheda(MI_ATTESA.id));
    dati[k] = Object.assign({}, dati[k], { email: 'nuovo@attesa.it', mailInvito: { quando: 5, ok: true, a: 'alda@attesa.it' } });
    await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'sponsor', destinatari: [MI_ATTESA] });
    esigi(invitiA('nuovo@attesa.it').length === 1, 'l\'invito parte al nuovo indirizzo');
    const prima = { quando: 5, ok: true };   // scritto prima che ci fosse `a`: vale per l'indirizzo della scheda
    dati[k] = Object.assign({}, dati[k], { emailConfermata: { quando: 9, come: 'spostamento' }, mailInvito: prima });
    spedite = [];
    await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA] });
    esigi(spedite.length === 0, 'un invito senza indirizzo vale per quello della scheda: non riparte');
});

/* ---------- CENA E MEETING: CHI ENTRA FRA GLI ADERENTI CI VIENE ISCRITTO ----------
   A Milano gli aderenti hanno la cena del 26 e il meeting del 27, a
   pagamento (lib/iscrizioni-aderenti.js). Lo spostamento fra gli aderenti
   iscrive anche li', con la fattura da emettere e i dati per la fattura da
   chiedere; uscendo, l'iscrizione nata dallo spostamento si toglie se la
   fattura non e' emessa. */
const CENA_DI = email => dati[chiave('iscrizioniAderenti', ('milano-2027-aderenti~' + email).replace(/[\/\\.#$\[\]]/g, '-'))] || null;

prova('Milano: fra gli aderenti si e\' iscritti anche a cena e meeting', async () => {
    scenarioMilano();
    const r = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA, MI_CLIC] });
    esigi(r.corpo.ok === true && r.corpo.cena && r.corpo.cena.iscritti === 2, 'due iscrizioni a cena e meeting', JSON.stringify(r.corpo.cena));
    const c = CENA_DI('alda@attesa.it') || {};
    esigi(c.quota === 'milano-2027-aderenti' && c.origine === 'spostamento' && c.nome === 'Alda' && c.cognome === 'Attesa' && c.studio === 'Alfa S.p.A.',
        'con i dati della persona e l\'azienda', JSON.stringify(c).slice(0, 200));
    esigi((c.importi || {}).totale === 244 && !(c.fatturazione || {}).intestatario && c.daSpostamento && c.daSpostamento.da === 'milano@esempio.it',
        'la quota, la fattura da emettere, i dati per la fattura da chiedere, e chi l\'ha fatto');
    esigi(!spedite.some(m => /Iscrizione registrata/.test(m.subject || '')), 'nessuna mail di "iscrizione registrata": lo dice l\'avviso dello spostamento');
    const r2 = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA] });
    esigi(r2.corpo.cena.iscritti === 0, 'spostando di nuovo non nasce una seconda iscrizione', JSON.stringify(r2.corpo.cena));
});

prova('Milano: chi e\' gia\' fra gli aderenti non si iscrive di nuovo, e "rimanda l\'invito" non iscrive', async () => {
    scenarioMilano();
    await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA] });
    const k = chiave('iscrizioniAderenti', 'milano-2027-aderenti~alda@attesa-it');
    delete dati[k];   // tolta a mano dal riquadro Aderenti: alla cena non viene
    await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA], soloInvito: true });
    esigi(!dati[k], '"Rimanda l\'invito in PDF" non la reiscrive');
    await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA] });
    esigi(!dati[k], 'e nemmeno rispostarla nella stessa sezione');
    // chi e' aderente dal modulo (casella "sono un aderente"): la cena se la sceglie dalla sua pagina
    const ka = chiave('iscrizioni', idScheda(MI_CLIC.id));
    dati[ka] = Object.assign({}, dati[ka], { modalita: 'aderenti', aderente: true });
    const r = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_CLIC] });
    esigi(r.corpo.cena.iscritti === 0 && !CENA_DI('carlo@clic.it'), 'l\'aderente dal modulo non viene iscritto d\'ufficio');
});

prova('Milano: i dati per la fattura arrivano dalla pagina, e la scheda resta "dello spostamento"', async () => {
    scenarioMilano();
    await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA] });
    const AD = require(path.join(RADICE, 'lib/iscrizioni-aderenti.js'));
    const r = await AD.ricevi(db, {
        quota: 'milano-2027-aderenti', nome: 'Alda', cognome: 'Attesa', email: 'alda@attesa.it', telefono: '3331234567',
        studio: 'Alfa', privacy: true, accettaQuota: true, origine: '/milano_febbraio_2027/aderenti/',
        fatturazione: { intestatario: 'Alfa S.p.A.', partitaIva: '01234567897', codiceFiscale: '01234567897', indirizzo: 'Via Roma 1',
            cap: '20100', comune: 'Milano', provincia: 'MI', codiceDestinatario: 'ABC1234', emailFatture: 'fatture@alfa.it' }
    });
    const c = CENA_DI('alda@attesa.it') || {};
    esigi(r.corpo.ok === true && r.corpo.aggiornata === false, 'e\' il primo invio dei dati, non una correzione', JSON.stringify(r.corpo));
    esigi(c.fatturazione.intestatario === 'Alfa S.p.A.' && c.daSpostamento && c.origine === 'spostamento' && (c.storia || []).length === 0,
        'i dati ci sono, e la scheda resta segnata come nata dallo spostamento', JSON.stringify(c).slice(0, 300));
    const via = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'presenza', destinatari: [MI_ATTESA] });
    esigi(via.corpo.cena.tolti === 1 && !CENA_DI('alda@attesa.it'), 'uscendo dagli aderenti, non fatturata, si toglie lo stesso');
});

prova('Milano: chi ha annullato il convegno, uscendo dagli aderenti, perde anche la cena', async () => {
    scenarioMilano();
    await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA] });
    const ks = chiave('iscrizioni', idScheda(MI_ATTESA.id));
    dati[ks] = Object.assign({}, dati[ks], { annullato: { quando: 1, da: 'intestatario' } });
    const r = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'presenza', destinatari: [MI_ATTESA] });
    esigi(r.corpo.cena.tolti === 1 && !CENA_DI('alda@attesa.it'), 'la scheda di cena e meeting si toglie');
});

prova('Milano: chi a cena e meeting si era iscritto da se\' non si tocca', async () => {
    scenarioMilano();
    const k = chiave('iscrizioniAderenti', 'milano-2027-aderenti~alda@attesa-it');
    dati[k] = { quota: 'milano-2027-aderenti', email: 'alda@attesa.it', nome: 'Alda', origine: '', fatturazione: { intestatario: 'Studio Alda' } };
    const r = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA] });
    esigi(r.corpo.cena.gia === 1 && dati[k].fatturazione.intestatario === 'Studio Alda' && !dati[k].daSpostamento, 'la sua iscrizione resta com\'era');
    await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'sponsor', destinatari: [MI_ATTESA] });
    esigi(!!dati[k], 'e uscendo dagli aderenti non si toglie: l\'aveva chiesta lui');
});

prova('Milano: uscendo dagli aderenti l\'iscrizione dello spostamento si toglie, se non fatturata', async () => {
    scenarioMilano();
    await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA, MI_CLIC] });
    // a Carlo la fattura e' gia' stata emessa
    const kc = chiave('iscrizioniAderenti', 'milano-2027-aderenti~carlo@clic-it');
    dati[kc] = Object.assign({}, dati[kc], { fattura: { emessa: true, numero: '12' } });
    const r = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'sponsor', destinatari: [MI_ATTESA, MI_CLIC] });
    esigi(r.corpo.cena && r.corpo.cena.tolti === 1 && r.corpo.cena.tenuti === 1, 'una tolta, una tenuta', JSON.stringify(r.corpo.cena));
    esigi(!CENA_DI('alda@attesa.it') && !!CENA_DI('carlo@clic.it'), 'si toglie quella non fatturata; una fattura emessa non si cancella con uno spostamento');
});

prova('Milano: il paragrafo dell\'invito allegato resta solo a chi ha l\'allegato', async () => {
    scenarioMilano();
    const conBlocco = { oggetto: 'Avviso', html: '<p>Ciao {{NOME}}{{SE_INVITO}}<b>ALLEGATO</b>{{/SE_INVITO}} fine</p>', testo: 'Ciao {{NOME}}{{SE_INVITO}} ALLEGATO{{/SE_INVITO}} fine' };
    await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA, MI_CLIC], mail: conBlocco });
    const a = spedite.find(m => m.to === 'alda@attesa.it') || {}, c = spedite.find(m => m.to === 'carlo@clic.it') || {};
    esigi(/<b>ALLEGATO<\/b>/.test(a.html) && / ALLEGATO fine/.test(a.text) && !/SE_INVITO/.test(a.html + a.text), 'chi ha l\'invito legge il paragrafo, senza i segni');
    esigi(!/ALLEGATO|SE_INVITO/.test(c.html + c.text) && /Ciao Carlo Clic fine/.test(c.text), 'chi non ce l\'ha non lo legge');
});

prova('Milano: senza avviso, l\'invito parte da solo; se l\'avviso non parte, anche', async () => {
    scenarioMilano();
    await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA] });
    esigi(invitiA('alda@attesa.it').length === 1 && /Il tuo invito/.test(invitiA('alda@attesa.it')[0].subject), 'senza avviso chiesto: la mail dell\'invito');
});

prova('Milano: due righe con la stessa email, ne esce una: la cena resta all\'altra', async () => {
    scenarioMilano();
    // la referente e un secondo posto dello stesso ordine, con lo stesso indirizzo
    const secondo = { id: 'alda@attesa.it|10/01/2027 10:00~p2', doc: 'alda@attesa-it|10-01-2027 10:00~p2' };
    dati[chiave('iscrizioni', secondo.doc)] = { nome: 'Alda', cognome: 'Bis', email: 'alda@attesa.it', pagina: PAGINA_MI };
    const r = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'aderenti', destinatari: [MI_ATTESA, secondo] });
    esigi(r.corpo.cena.iscritti === 1, 'una scheda sola per l\'indirizzo', JSON.stringify(r.corpo.cena));
    esigi(((CENA_DI('alda@attesa.it') || {}).daSpostamento || {}).righe.length === 2, 'che ricorda le due righe', JSON.stringify((CENA_DI('alda@attesa.it') || {}).daSpostamento));
    const u1 = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'presenza', destinatari: [MI_ATTESA] });
    esigi(u1.corpo.cena.tolti === 0 && !!CENA_DI('alda@attesa.it'), 'ne esce una: la scheda resta per l\'altra', JSON.stringify(u1.corpo.cena));
    const u2 = await chiama({ azione: 'sposta-modalita', evento: MI, modalita: 'presenza', destinatari: [secondo] });
    esigi(u2.corpo.cena.tolti === 1 && !CENA_DI('alda@attesa.it'), 'esce anche l\'altra: la scheda si toglie');
});

prova('Fuori da Milano non c\'e\' nessuna cena', async () => {
    scenarioMilano();
    const r = await chiama({ azione: 'sposta-modalita', evento: 'napoli-2026-10-02', modalita: 'aderenti', destinatari: [NA_ATTESA] });
    esigi(r.corpo.ok === true && r.corpo.cena === null, 'l\'evento senza quota non iscrive a niente');
});

(async () => {
    for (const p of prove) {
        console.log('\n' + p.titolo);
        await p.fn();
    }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
