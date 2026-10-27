/* ============================================================
   PROVE - api/presenze.js, azione "modifica" (Modifica iscrizione)
   ------------------------------------------------------------
       node prove/modifica-iscrizione.prove.js

   Niente da installare: Firestore, l'autenticazione e il server di
   posta sono finti e stanno qui dentro. Esce con 1 se qualcosa e'
   rosso, cosi' si puo' appendere a un controllo automatico.

   COSA DIMOSTRANO. Il nome del documento di una scheda nasce da email
   e data: l'amministratore che corregge l'una o l'altra la sposta su un
   documento nuovo. Il documento nuovo deve essere la STESSA iscrizione,
   non una nata adesso dal sito. Qui si verifica che:
     - la scheda si porti dietro da dove viene e cosa le e' gia'
       successo: il codice invito con l'azienda e le colonne del file, il
       cellulare verificato, i consensi, le mail partite (Milano 2027);
       chi l'ha inserita a mano e da quale portale (Eventbrite);
       l'importazione; l'annullamento;
     - la conferma dell'email la segua solo se l'indirizzo e' lo stesso:
       un indirizzo nuovo e' "in attesa di conferma", e dal menu della
       riga la mail si rimanda subito al nuovo indirizzo, con il
       collegamento del documento nuovo;
     - un'iscrizione inserita a mano o importata non diventi "in attesa"
       per una lettera corretta nell'email;
     - il codice invito continui a contare la scheda fra le sue due (una
       terza iscrizione resta fuori), e il cellulare verificato resti
       occupato; l'email vecchia invece torni libera;
     - a Napoli, dove il codice non tiene il conto, non si scriva niente
       sul codice; un codice che non c'e' piu' non rinasca;
     - senza trasloco (si corregge il nome) non cambi niente del resto;
     - rifare il trasloco non cambi niente: e' quello che serve se la
       modifica va ripetuta;
     - il giro automatico delle mail di conferma: con lo stesso
       indirizzo la bandiera e i conti seguono la scheda; con un
       indirizzo nuovo, a Milano e per una scheda del sito, la bandiera
       si accende e la mail partita resta scritta con l'indirizzo
       vecchio (per il nuovo non vale: il giro gliela manda);
     - "Rimanda la mail di conferma" (richiedi-conferma-email) riscrive
       la traccia della mail - un "mail non inviata" vecchio sparisce - e
       a Milano manda l'SMS "conferma la tua email" al cellulare
       verificato; a Napoli niente SMS. A una scheda che non viene dal
       modulo del sito (importata, inserita a mano) la mail parte, ma
       senza la traccia del sito, la bandiera e l'SMS: non diventa "in
       attesa di conferma", nemmeno al secondo rinvio.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- Firestore finto (con transazioni e cancellazioni) ----------
const dati = new Map();
function applica(vecchio, patch, merge) {
    const base = (merge && vecchio) ? Object.assign({}, vecchio) : {};
    for (const k of Object.keys(patch)) {
        const v = patch[k];
        if (v && v.__inc) base[k] = (base[k] || 0) + v.__inc;
        else if (v && v.__del) delete base[k];
        else if (v && v.__union) base[k] = (base[k] || []).concat(v.__union);
        else if (v && v.__ts) base[k] = 0;
        else if (v !== undefined) base[k] = v;
    }
    return base;
}
let transazioni = 0;
function doc(coll, id) {
    const chiave = coll + '/' + id;
    const self = {
        id: id, _chiave: chiave,
        get: async () => {
            const v = dati.get(chiave);
            return { exists: dati.has(chiave), id: id, ref: self, data: () => (v ? JSON.parse(JSON.stringify(v)) : undefined) };
        },
        set: async (patch, opz) => { dati.set(chiave, applica(dati.get(chiave), patch, !!(opz && opz.merge))); },
        delete: async () => { dati.delete(chiave); }
    };
    return self;
}
/* Le ricerche per uguaglianza (anche con il punto nel campo), come Firestore:
   servono ai riferimenti della PEC di sollecito, che seguono la scheda che
   trasloca (lib/lettore-pec.js, ripuntaIscrizione). */
function interroga(coll, filtri, max) {
    return {
        where(campo, op, val) { return interroga(coll, filtri.concat([[campo, val]]), max); },
        limit(n) { return interroga(coll, filtri, n); },
        async get() {
            const docs = [...dati.keys()].filter(k => k.startsWith(coll + '/') && k.split('/').length === 2)
                .filter(k => filtri.every(([c, v]) => c.split('.').reduce((o, parte) => (o && typeof o === 'object') ? o[parte] : undefined, dati.get(k) || {}) === v))
                .sort().slice(0, max || 1e9)
                .map(k => ({ id: k.split('/')[1], ref: doc(coll, k.split('/')[1]), data: () => JSON.parse(JSON.stringify(dati.get(k))) }));
            return { docs: docs, forEach: f => docs.forEach(f), size: docs.length };
        }
    };
}
const db = {
    collection(coll) { return Object.assign(interroga(coll, [], 0), { doc: id => doc(coll, id) }); },
    async getAll(...rif) { return Promise.all(rif.map(r => r.get())); },
    batch() {
        const op = [];
        return {
            set: (r, patch, opz) => op.push(() => r.set(patch, opz)),
            delete: r => op.push(() => r.delete()),
            commit: async () => { for (const f of op) await f(); }
        };
    },
    async runTransaction(fn) {
        transazioni++;
        // le scritture si applicano alla fine, come in Firestore
        const scritture = [];
        const tx = {
            get: async r => r.get(),
            set: (r, patch, opz) => { scritture.push([r, patch, opz]); }
        };
        const esito = await fn(tx);
        for (const [r, patch, opz] of scritture) await r.set(patch, opz);
        return esito;
    }
};
const admin = {
    initializeApp() { }, credential: { cert: () => ({}) }, apps: [],
    auth: () => ({ verifyIdToken: async () => ({ email: 'admin@esempio.it' }) }),
    firestore: () => db
};
admin.firestore.FieldValue = {
    serverTimestamp: () => ({ __ts: true }), increment: n => ({ __inc: n }),
    arrayUnion: (...a) => ({ __union: a }), delete: () => ({ __del: true })
};

// ---------- server di posta e SMS finti ----------
let spedite = [];
let mailGuasta = 0;
let sms = [];
global.fetch = async (url, opz) => {
    if (/transactionalSMS/.test(String(url))) {
        sms.push(JSON.parse(opz.body));
        return { ok: true, status: 201, text: async () => '{"messageId":7}' };
    }
    throw new Error('rete non prevista: ' + url);
};
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return { createTransport: () => ({ sendMail: async m => {
        if (mailGuasta > 0) { mailGuasta--; throw new Error('552 casella piena'); }
        spedite.push(m); return {};
    } }) };
    if (nome === 'imapflow') return { ImapFlow: function () { } };
    if (nome === 'google-auth-library') return { JWT: function () { }, GoogleAuth: function () { } };
    return veroRequire.apply(this, arguments);
};

process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    client_email: 'servizio@esempio.iam.gserviceaccount.com', private_key: 'chiave-finta-per-le-prove'
});
process.env.SMTP_FROM_EMAIL = 'noreply@esempio.it';
process.env.SMTP_FROM_NAME = 'Revilaw S.p.A.';
process.env.BREVO_API_KEY = 'chiave-brevo-finta';

const RADICE = path.join(__dirname, '..');
const presenze = require(path.join(RADICE, 'api/presenze.js'));
const V = require(path.join(RADICE, 'lib/iscrizione-verificata.js'));
const CONF = require(path.join(RADICE, 'lib/conferma-email.js'));
const NL = require(path.join(RADICE, 'lib/newsletter.js'));
const GIRO = require(path.join(RADICE, 'lib/giro-conferme.js'));

// ---------- utilita' ----------
let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
// gli stessi nomi di documento che costruisce il servizio
function idScheda(id) { return String(id).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 300); }
function idPresenza(evento, id) { return (evento + '~' + id).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 400); }
function scheda(id) { return dati.get('iscrizioni/' + idScheda(id)); }
function unico(campo, valore) { return dati.get('iscrizioniUniche/' + ('milano-2027-02-26|' + campo + '|' + valore).replace(/\//g, '%2F')); }

async function chiama(corpo) {
    let stato = 0, risposta = null;
    const res = {
        setHeader() { }, status(s) { stato = s; return res; },
        json(c) { risposta = c; return res; }, end() { return res; }
    };
    await presenze({ method: 'POST', headers: {}, body: Object.assign({ idToken: 'finto' }, corpo) }, res);
    return { stato: stato, corpo: risposta || {} };
}
const EV = 'milano-2027-02-26';
const MILANO = 'Milano 26 Febbraio 2027 - Iscrizione';
function modifica(idIscritto, campi) {
    const s = scheda(idIscritto) || {};
    // la finestra dell'area riservata manda sempre tutti i campi, come li ha letti
    return chiama({
        azione: 'modifica', evento: EV, idIscritto: idIscritto, pagina: s.pagina,
        campi: Object.assign({
            nome: s.nome || '', cognome: s.cognome || '', email: s.email || '', telefono: s.telefono || '',
            azienda: s.azienda || '', ruolo: s.ruolo || '', data: s.data || '', messaggio: s.messaggio || ''
        }, campi)
    });
}

/* Lo scenario, Milano: Anna e Bruno si sono registrati dal sito con lo
   stesso codice (i due posti), Anna ha confermato l'email; Elio e' stato
   inserito a mano da Eventbrite; Ida e' arrivata con "Importa"; Olga ha
   annullato. A Napoli Nino si e' registrato con un codice. */
const A = 'anna@alfa.it|10/01/2027 10:00:00';
const B = 'bruno@alfa.it|10/01/2027 11:00:00';
const E = 'elio@beta.it|11/01/2027 09:00:00';
const I = 'ida@gamma.it|11/01/2027 10:00:00';
const O = 'olga@alfa.it|09/01/2027 08:00:00';
const N = 'nino@delta.it|01/09/2026 10:00:00';
const DATI_FILE = [{ c: 'Ragione sociale (file)', v: 'ALFA S.P.A.' }, { c: 'Partita IVA', v: '01234567890' }, { c: 'Ricavi (EUR)', v: '100674810' }];
function scenario() {
    dati.clear(); spedite = []; transazioni = 0; sms = []; mailGuasta = 0;
    dati.set('utenti/admin@esempio.it', { nome: 'Anna Admin', ruolo: 'admin', attivo: true, eventi: true });
    dati.set('iscrizioni/' + idScheda(A), {
        data: '10/01/2027 10:00:00', pagina: MILANO, nome: 'Anna', cognome: 'Alfa', email: 'anna@alfa.it',
        azienda: 'ALFA S.P.A.', ruolo: 'CFO', telefono: '+39 333 111 2222', messaggio: '',
        privacy: true, marketing: false, ricevuto: { _seconds: 1789000000, _nanoseconds: 0 },
        invitoCodice: 'K7M3P', invitoAzienda: 'ALFA S.P.A.', invitoScheda: 'milano~alfa@pec-it', selezionata: true, datiInvito: DATI_FILE,
        consensoRiprese: { quando: 1, come: 'modulo' },
        telefonoNumero: '+393331112222', telefonoVerificato: { quando: 2, come: 'sms' },
        modalita: 'presenza',
        mailConferma: { quando: 3, ok: true, errore: '' },
        emailConfermata: { quando: 4, come: 'mail' },
        mailInvito: { quando: 5, ok: true, errore: '' },
        emailConfermaRimandata: { da: 'admin@esempio.it', quando: Date.now() }
    });
    dati.set('iscrizioni/' + idScheda(B), {
        data: '10/01/2027 11:00:00', pagina: MILANO, nome: 'Bruno', cognome: 'Alfa', email: 'bruno@alfa.it', azienda: 'ALFA S.P.A.',
        invitoCodice: 'K7M3P', invitoAzienda: 'ALFA S.P.A.', invitoScheda: 'milano~alfa@pec-it', selezionata: true,
        telefonoNumero: '+393331113333', telefonoVerificato: { quando: 2, come: 'sms' }, mailConferma: { quando: 3, ok: true, errore: '' }
    });
    dati.set('codiciInvito/K7M3P', { codice: 'K7M3P', evento: 'milano', pagina: 'Milano 26 Febbraio 2027', ragioneSociale: 'ALFA S.P.A.', iscrizioniUsate: [idScheda(A), idScheda(B)] });
    dati.set('iscrizioniUniche/' + EV + '|email|anna@alfa.it', { evento: EV, campo: 'email', iscrizione: idScheda(A) });
    dati.set('iscrizioniUniche/' + EV + '|tel|+393331112222', { evento: EV, campo: 'telefono', iscrizione: idScheda(A) });
    dati.set('iscrizioniUniche/' + EV + '|email|bruno@alfa.it', { evento: EV, campo: 'email', iscrizione: idScheda(B) });
    dati.set('presenze/' + idPresenza(EV, A), { evento: EV, idIscritto: A, stato: 'confermato', nota: 'tavolo 3' });
    dati.set('iscrizioni/' + idScheda(E), {
        data: '11/01/2027 09:00:00', pagina: 'Milano 26 Febbraio 2027', nome: 'Elio', cognome: 'Beta', email: 'elio@beta.it', azienda: 'Beta srl',
        portale: 'eventbrite', portaleNome: 'Eventbrite', partecipanti: 2, origine: 'manuale',
        extra: { Portale: 'Eventbrite', Partecipanti: '2' }, inserito: { da: 'admin@esempio.it', daNome: 'Anna Admin', quando: 6 }
    });
    dati.set('iscrizioni/' + idScheda(I), {
        data: '11/01/2027 10:00:00', pagina: 'Milano 26 Febbraio 2027', nome: 'Ida', cognome: 'Gamma', email: 'ida@gamma.it', azienda: 'Gamma',
        extra: { Ruolo: 'CEO' }, importato: true
    });
    dati.set('iscrizioni/' + idScheda(O), {
        data: '09/01/2027 08:00:00', pagina: MILANO, nome: 'Olga', cognome: 'Alfa', email: 'olga@alfa.it',
        invitoCodice: 'K7M3P', annullato: { quando: 7, da: 'intestatario' }, mailConferma: { quando: 3, ok: true, errore: '' }
    });
    dati.set('iscrizioni/' + idScheda(N), {
        data: '01/09/2026 10:00:00', pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', nome: 'Nino', cognome: 'Delta', email: 'nino@delta.it',
        azienda: 'Delta', invitoCodice: 'N4P6R', invitoAzienda: 'DELTA SRL', selezionata: true
    });
    dati.set('codiciInvito/N4P6R', { codice: 'N4P6R', evento: 'napoli', pagina: 'Napoli 2 Ottobre 2026', ragioneSociale: 'DELTA SRL', usi: 1 });
}

const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

prova('Email corretta a chi si e\' registrato con il codice: la scheda trasloca intera', async () => {
    scenario();
    const r = await modifica(A, { email: 'Anna@Alfa.com' });
    const nuovoId = 'anna@alfa.com|10/01/2027 10:00:00';
    esigi(r.stato === 200 && r.corpo.ok && r.corpo.id === nuovoId, 'la modifica riesce, con l\'identificativo nuovo', JSON.stringify(r.corpo).slice(0, 160));
    const s = scheda(nuovoId) || {};
    esigi(!scheda(A) && !!scheda(nuovoId), 'il documento vecchio non c\'e\' piu\', quello nuovo si');
    esigi(s.email === 'anna@alfa.com' && s.nome === 'Anna' && s.pagina === MILANO, 'con l\'indirizzo corretto e il resto dei dati');
    esigi(s.invitoCodice === 'K7M3P' && s.invitoAzienda === 'ALFA S.P.A.' && s.invitoScheda === 'milano~alfa@pec-it' && s.selezionata === true,
        'il codice invito e l\'azienda dell\'invito');
    esigi(JSON.stringify(s.datiInvito) === JSON.stringify(DATI_FILE), 'le colonne del file dell\'azienda', JSON.stringify(s.datiInvito));
    esigi(s.telefonoNumero === '+393331112222' && s.telefonoVerificato && s.telefonoVerificato.come === 'sms', 'il cellulare verificato');
    esigi(s.consensoRiprese && s.privacy === true && s.marketing === false && s.ricevuto && s.ricevuto._seconds === 1789000000,
        'i consensi e il momento dell\'iscrizione');
    esigi(s.mailConferma && s.mailConferma.ok === true && s.mailInvito && s.mailInvito.ok === true && s.modalita === 'presenza',
        'le mail partite e la sezione');
    const p = dati.get('presenze/' + idPresenza(EV, nuovoId)) || {};
    esigi(p.stato === 'confermato' && p.nota === 'tavolo 3' && p.idIscritto === nuovoId && !dati.has('presenze/' + idPresenza(EV, A)),
        'stato e nota la seguono, come prima');
});

prova('Un indirizzo nuovo non e\' confermato: in attesa, e la mail si rimanda subito', async () => {
    scenario();
    await modifica(A, { email: 'anna@alfa.com' });
    const nuovoId = 'anna@alfa.com|10/01/2027 10:00:00';
    const s = scheda(nuovoId) || {};
    esigi(!('emailConfermata' in s), 'la conferma era del vecchio indirizzo: non segue la scheda');
    esigi(CONF.inAttesaDiConferma(s) === true, 'a Milano la riga e\' "in attesa di conferma mail"');
    esigi(!('emailConfermaRimandata' in s), 'e la pausa di dieci minuti del vecchio indirizzo non vale per il nuovo');
    spedite = [];
    const r = await chiama({ azione: 'richiedi-conferma-email', evento: EV, idIscritto: nuovoId });
    esigi(r.stato === 200 && r.corpo.ok && r.corpo.mail && r.corpo.mail.inviata, '"Rimanda la mail di conferma" funziona sulla scheda spostata', JSON.stringify(r.corpo));
    const m = spedite[0] || {};
    esigi(m.to === 'anna@alfa.com', 'la mail va al nuovo indirizzo', m.to);
    esigi(String(m.html || '').indexOf(NL.linkConfermaEmail(idScheda(nuovoId)).replace(/&/g, '&amp;')) >= 0
        || String(m.html || '').indexOf(NL.linkConfermaEmail(idScheda(nuovoId))) >= 0,
        'con il pulsante firmato sul documento nuovo');
    const c = await CONF.conferma(db, { d: idScheda(nuovoId), t: NL.firmaConfermaEmail(idScheda(nuovoId)) }, {});
    esigi(c.stato === 200 && c.corpo.ok && CONF.inAttesaDiConferma(scheda(nuovoId)) === false, 'e premuto il pulsante la scheda esce dall\'attesa');
});

prova('Il codice invito continua a contarla, il cellulare resta occupato, l\'email vecchia si libera', async () => {
    scenario();
    await modifica(A, { email: 'anna@alfa.com' });
    const nuovoDoc = idScheda('anna@alfa.com|10/01/2027 10:00:00');
    const usate = (dati.get('codiciInvito/K7M3P').iscrizioniUsate || []).slice().sort();
    esigi(JSON.stringify(usate) === JSON.stringify([idScheda(B), nuovoDoc].sort()), 'iscrizioniUsate: il nome vecchio diventa quello nuovo', JSON.stringify(usate));
    const posti = await V.usiCodice(db, 'K7M3P');
    esigi(posti.attive.length === 2, 'il codice ha ancora due iscrizioni attive', JSON.stringify(posti.attive));
    const terza = await V.registra(db, {
        ev: V.eventoDi(MILANO), idDoc: 'carla@alfa-it|12-01-2027 10:00:00', email: 'carla@alfa.it', numero: '+393334445555', codice: 'K7M3P',
        scheda: { pagina: MILANO, email: 'carla@alfa.it', nome: 'Carla' }
    });
    esigi(!terza.ok && terza.campo === 'codice', 'una terza iscrizione con lo stesso codice resta fuori', JSON.stringify(terza));
    esigi((unico('tel', '+393331112222') || {}).iscrizione === nuovoDoc, 'il cellulare verificato punta alla scheda nuova: resta occupato');
    esigi((unico('email', 'anna@alfa.it') || {}).iscrizione === idScheda(A), 'il documento dell\'email vecchia non si tocca: punta a una scheda che non c\'e\' piu\', ed e\' libera');
    const giaPreso = await V.registra(db, {
        ev: V.eventoDi(MILANO), idDoc: 'zeta@x-it|12-01-2027 11:00:00', email: 'zeta@x.it', numero: '+393331112222', codice: '',
        scheda: { pagina: MILANO, email: 'zeta@x.it', nome: 'Zeta' }
    });
    esigi(!giaPreso.ok && giaPreso.campo === 'telefono', 'un\'altra persona con lo stesso cellulare viene respinta', JSON.stringify(giaPreso));
    const vecchiaLibera = await V.registra(db, {
        ev: V.eventoDi(MILANO), idDoc: 'anna@alfa-it|12-01-2027 12:00:00', email: 'anna@alfa.it', numero: '+393336667777', codice: '',
        scheda: { pagina: MILANO, email: 'anna@alfa.it', nome: 'Anna' }
    });
    esigi(vecchiaLibera.ok, 'e l\'indirizzo vecchio si puo\' usare di nuovo', JSON.stringify(vecchiaLibera));
});

prova('Si corregge solo la data: la conferma resta, e anche il documento dell\'email', async () => {
    scenario();
    const r = await modifica(A, { data: '10/01/2027 10:05:00' });
    const nuovoId = 'anna@alfa.it|10/01/2027 10:05:00';
    const s = scheda(nuovoId) || {};
    esigi(r.corpo.ok && !scheda(A) && s.email === 'anna@alfa.it', 'la scheda trasloca sul documento con la data nuova');
    esigi(s.emailConfermata && s.emailConfermata.come === 'mail' && s.emailConfermata.quando === 4, 'stesso indirizzo: la conferma la segue');
    esigi(s.emailConfermaRimandata && s.emailConfermaRimandata.da === 'admin@esempio.it', 'e la pausa del rinvio, che e\' di quell\'indirizzo');
    esigi(CONF.inAttesaDiConferma(s) === false, 'non finisce "in attesa"');
    esigi((unico('email', 'anna@alfa.it') || {}).iscrizione === idScheda(nuovoId) && (unico('tel', '+393331112222') || {}).iscrizione === idScheda(nuovoId),
        'email e cellulare puntano alla scheda nuova');
});

prova('Un\'iscrizione da Eventbrite o importata non diventa "in attesa" per una lettera corretta', async () => {
    scenario();
    await modifica(E, { email: 'elio@beta.com' });
    const e = scheda('elio@beta.com|11/01/2027 09:00:00') || {};
    esigi(e.inserito && e.inserito.daNome === 'Anna Admin' && e.extra && e.extra.Portale === 'Eventbrite' && e.extra.Partecipanti === '2',
        'chi l\'ha inserita, il portale e i posti (colonne aggiuntive)', JSON.stringify(e.extra));
    esigi(e.portale === 'eventbrite' && e.portaleNome === 'Eventbrite' && e.partecipanti === 2 && e.origine === 'manuale', 'e gli stessi dati sulla scheda');
    esigi(CONF.inAttesaDiConferma(e) === false, 'non e\' in attesa: non ha mai avuto una mail da confermare');
    await modifica(I, { email: 'ida@gamma.com' });
    const i = scheda('ida@gamma.com|11/01/2027 10:00:00') || {};
    esigi(i.importato === true && i.extra && i.extra.Ruolo === 'CEO', 'l\'importata resta importata, con le sue colonne');
    esigi(CONF.inAttesaDiConferma(i) === false, 'e non e\' in attesa');
});

prova('Un ordine con piu\' posti: i partecipanti con un nome seguono la scheda', async () => {
    /* Elio aveva 3 posti e dal suo collegamento ha dato il nome a Fabio e
       Gina (i documenti "~p2" e "~p3"): la sua riga conta ormai 1. Corretta la
       sua email, il collegamento nuovo deve ritrovarli - non vederli vuoti,
       contarli due volte o annullare dei segnaposto al posto loro. */
    scenario();
    const vecchio = idScheda(E);
    dati.set('iscrizioni/' + vecchio, Object.assign({}, scheda(E), {
        partecipanti: 1, partecipantiOrdine: 3, extra: { Portale: 'Eventbrite', Partecipanti: '1' },
        completato: { quando: 8, partecipanti: 3 }, compilato: { daNome: 'Elio Beta', quando: 8 }
    }));
    const figlio = (n, nome) => ({ data: '11/01/2027 09:00:00', pagina: 'Milano 26 Febbraio 2027', nome: nome, email: nome.toLowerCase() + '@beta.it',
        partecipanti: 1, extra: { Partecipanti: '1', Portale: 'Eventbrite' }, origine: 'partecipante', gruppo: vecchio, compilato: { daNome: 'Elio Beta', quando: 8 } });
    dati.set('iscrizioni/' + vecchio + '~p2', figlio(2, 'Fabio'));
    dati.set('iscrizioni/' + vecchio + '~p3', figlio(3, 'Gina'));
    const r = await modifica(E, { email: 'elio@beta.com' });
    const nuovo = idScheda('elio@beta.com|11/01/2027 09:00:00');
    esigi(r.corpo.ok && !!scheda('elio@beta.com|11/01/2027 09:00:00'), 'la scheda trasloca');
    const p2 = dati.get('iscrizioni/' + nuovo + '~p2') || {}, p3 = dati.get('iscrizioni/' + nuovo + '~p3') || {};
    esigi(p2.nome === 'Fabio' && p3.nome === 'Gina' && p2.gruppo === nuovo && p3.gruppo === nuovo,
        'Fabio e Gina stanno sotto il nome nuovo, legati alla scheda nuova', JSON.stringify([p2.gruppo, p3.gruppo]));
    esigi(!dati.has('iscrizioni/' + vecchio + '~p2') && !dati.has('iscrizioni/' + vecchio + '~p3'), 'e sotto il nome vecchio non restano copie');
    esigi(p2.data === '11/01/2027 09:00:00' && p2.email === 'fabio@beta.it', 'con i loro dati, data compresa (la loro presenza si ritrova)');
    // un ordine senza partecipanti con il nome: non si crea niente
    scenario();
    await modifica(E, { email: 'elio@beta.org' });
    esigi(![...dati.keys()].some(k => /~p\d+$/.test(k)), 'senza partecipanti con il nome non nasce nessun "~p"');
});

prova('Un\'annullata resta annullata, e il codice non la conta', async () => {
    scenario();
    dati.set('codiciInvito/K7M3P', Object.assign({}, dati.get('codiciInvito/K7M3P'), { iscrizioniUsate: [idScheda(O), idScheda(A), idScheda(B)] }));
    await modifica(O, { email: 'olga@alfa.com' });
    const o = scheda('olga@alfa.com|09/01/2027 08:00:00') || {};
    esigi(o.annullato && o.annullato.da === 'intestatario', 'spostarla non la riattiva (riattivarla passa dal conto del codice)');
    const posti = await V.usiCodice(db, 'K7M3P');
    esigi(posti.attive.length === 2 && posti.attive.indexOf(idScheda('olga@alfa.com|09/01/2027 08:00:00')) < 0, 'il codice conta sempre Anna e Bruno', JSON.stringify(posti.attive));
});

prova('Napoli: il codice non tiene il conto, e non si scrive niente', async () => {
    scenario();
    const prima = JSON.stringify(dati.get('codiciInvito/N4P6R'));
    const r = await modifica(N, { email: 'nino@delta.com' });
    const n = scheda('nino@delta.com|01/09/2026 10:00:00') || {};
    esigi(r.corpo.ok && n.invitoCodice === 'N4P6R' && n.invitoAzienda === 'DELTA SRL' && n.selezionata === true, 'il codice segue la scheda');
    esigi(JSON.stringify(dati.get('codiciInvito/N4P6R')) === prima, 'il documento del codice resta com\'era (nessun iscrizioniUsate inventato)');
    esigi([...dati.keys()].filter(k => k.startsWith('iscrizioniUniche/') && k.indexOf(EV) < 0).length === 0,
        'e nessun documento di unicita\' per Napoli');
    // un codice che non c'e' piu': non rinasce vuoto
    dati.set('iscrizioni/' + idScheda(B), Object.assign({}, scheda(B), { invitoCodice: 'Z9Z9Z' }));
    const r2 = await modifica(B, { email: 'bruno@alfa.com' });
    esigi(r2.corpo.ok && !dati.has('codiciInvito/Z9Z9Z'), 'un codice sparito non si ricrea (varrebbe ovunque)');
});

prova('Sponsor o relatore dalla pagina riservata: il trasloco si porta dietro la dichiarazione e il ruolo', async () => {
    scenario();
    const R = 'rita@gamma.it|12/01/2027 09:00:00';
    const SP = 'Milano 26 Febbraio 2027 - Sponsor e relatori';
    dati.set('iscrizioni/' + idScheda(R), {
        data: '12/01/2027 09:00:00', pagina: SP, nome: 'Rita', cognome: 'Relatrice', email: 'rita@gamma.it', azienda: 'Gamma',
        modalita: 'sponsor', sponsor: true, ruoloEvento: 'relatore', mailConferma: { quando: 3, ok: true, errore: '' }
    });
    const r = await modifica(R, { email: 'rita@gamma.com' });
    const n = scheda('rita@gamma.com|12/01/2027 09:00:00') || {};
    esigi(r.corpo.ok && n.modalita === 'sponsor' && n.sponsor === true && n.ruoloEvento === 'relatore' && n.pagina === SP,
        'email corretta: la scheda nuova resta fra sponsor e relatori, con la dichiarazione e il ruolo', JSON.stringify({ modalita: n.modalita, sponsor: n.sponsor, ruoloEvento: n.ruoloEvento }));
    const r2 = await modifica('rita@gamma.com|12/01/2027 09:00:00', { data: '12/01/2027 09:30:00' });
    const n2 = scheda('rita@gamma.com|12/01/2027 09:30:00') || {};
    esigi(r2.corpo.ok && n2.sponsor === true && n2.ruoloEvento === 'relatore', 'e cosi\' correggendo solo la data', JSON.stringify({ sponsor: n2.sponsor, ruoloEvento: n2.ruoloEvento }));
    // chi non l'aveva non la riceve: un campo assente resta assente
    const r3 = await modifica(B, { email: 'bruno@alfa.com' });
    const n3 = scheda('bruno@alfa.com|10/01/2027 11:00:00') || {};
    esigi(r3.corpo.ok && n3.sponsor === undefined && n3.ruoloEvento === undefined, 'e a chi non le aveva non si scrivono', JSON.stringify(n3));
});

prova('Senza trasloco non cambia niente del resto', async () => {
    scenario();
    const primaCodice = JSON.stringify(dati.get('codiciInvito/K7M3P'));
    transazioni = 0;
    const r = await modifica(A, { nome: 'Annamaria', ruolo: 'Direttrice finanziaria' });
    const s = scheda(A) || {};
    esigi(r.corpo.ok && r.corpo.id === A && s.nome === 'Annamaria' && s.ruolo === 'Direttrice finanziaria', 'si corregge il nome sullo stesso documento');
    esigi(s.emailConfermata && s.emailConfermata.quando === 4 && JSON.stringify(s.datiInvito) === JSON.stringify(DATI_FILE) && s.invitoCodice === 'K7M3P',
        'la conferma e il resto restano dov\'erano');
    esigi(transazioni === 0 && JSON.stringify(dati.get('codiciInvito/K7M3P')) === primaCodice, 'nessuna transazione sul codice');
});

prova('Il giro delle mail di conferma: la bandiera segue la scheda, e un indirizzo nuovo la accende', async () => {
    scenario();
    const conti = { confermaInAttesa: true, invioConferma: { a: 'bruno@alfa.it', tentativi: 1, falliti: 0, ultimo: 3 },
        smsConferma: { quando: 3, ok: true, tipo: 'inviata' }, rimandaConferma: { invii: [3], ultimo: 3 } };
    dati.set('iscrizioni/' + idScheda(B), Object.assign({}, scheda(B), conti));
    await modifica(B, { data: '10/01/2027 11:05:00' });
    let s = scheda('bruno@alfa.it|10/01/2027 11:05:00') || {};
    esigi(s.confermaInAttesa === true && JSON.stringify(s.invioConferma) === JSON.stringify(conti.invioConferma)
        && s.smsConferma && s.smsConferma.ok === true && s.rimandaConferma && s.rimandaConferma.ultimo === 3,
        'stesso indirizzo (si e\' corretta la data): la bandiera e i conti seguono la scheda');

    scenario();
    dati.set('iscrizioni/' + idScheda(B), Object.assign({}, scheda(B), conti));
    await modifica(B, { email: 'Bruno@Alfa.com' });
    s = scheda('bruno@alfa.com|10/01/2027 11:00:00') || {};
    esigi(s.confermaInAttesa === true, 'indirizzo nuovo, a Milano: la scheda entra (o resta) nel giro automatico');
    esigi(s.mailConferma && s.mailConferma.ok === true && s.mailConferma.a === 'bruno@alfa.it', 'la mail partita resta scritta, con l\'indirizzo vecchio', JSON.stringify(s.mailConferma));
    esigi(!('invioConferma' in s) && !('smsConferma' in s) && !('rimandaConferma' in s), 'i conti dell\'indirizzo vecchio restano indietro');
    // un momento fisso prima dell'evento: dopo la sua fine il giro non manda piu' niente
    esigi(CONF.statoMail(s) === 'in-attesa' && GIRO.cosaFare(s, Date.parse('2027-01-20T10:00:00+01:00')).fare === 'invia', 'per il nuovo indirizzo non e\' partito niente: il giro la manda');

    // Anna aveva confermato: il nuovo indirizzo no, e la bandiera si accende anche senza esserci prima
    scenario();
    await modifica(A, { email: 'anna@alfa.com' });
    s = scheda('anna@alfa.com|10/01/2027 10:00:00') || {};
    esigi(s.confermaInAttesa === true && s.mailConferma.a === 'anna@alfa.it', 'Anna, confermata con l\'indirizzo vecchio: in attesa con il nuovo, nel giro');

    // chi la mail con il pulsante non la deve ricevere: niente bandiera
    scenario();
    await modifica(E, { email: 'elio@beta.com' });
    await modifica(I, { email: 'ida@gamma.com' });
    await modifica(O, { email: 'olga@alfa.com' });
    await modifica(N, { email: 'nino@delta.com' });
    const senza = ['elio@beta.com|11/01/2027 09:00:00', 'ida@gamma.com|11/01/2027 10:00:00', 'olga@alfa.com|09/01/2027 08:00:00', 'nino@delta.com|01/09/2026 10:00:00']
        .map(id => scheda(id) || {});
    esigi(senza.every(x => x.email && !('confermaInAttesa' in x)), 'Eventbrite, importata, annullata, Napoli: nessuna bandiera',
        JSON.stringify(senza.map(x => x.confermaInAttesa)));
});

prova('"Rimanda la mail di conferma" dall\'area riservata: la traccia si aggiorna, e a Milano parte l\'SMS', async () => {
    scenario();
    // la mail dell'iscrizione era fallita: l'elenco diceva "mail non inviata"
    dati.set('iscrizioni/' + idScheda(B), Object.assign({}, scheda(B), { mailConferma: { quando: 3, ok: false, errore: 'casella piena' } }));
    const r = await chiama({ azione: 'richiedi-conferma-email', evento: EV, idIscritto: B });
    esigi(r.stato === 200 && r.corpo.ok && r.corpo.mail && r.corpo.mail.inviata && r.corpo.sms && r.corpo.sms.inviato === true,
        'rimandata, e la risposta dice anche dell\'SMS', JSON.stringify(r.corpo));
    let s = scheda(B);
    esigi(s.mailConferma.ok === true && s.mailConferma.errore === '' && s.mailConferma.via === 'staff' && s.mailConferma.a === 'bruno@alfa.it',
        'il "mail non inviata" vecchio sparisce: la traccia e\' quella del rinvio', JSON.stringify(s.mailConferma));
    esigi(s.emailConfermaRimandata && s.emailConfermaRimandata.da === 'admin@esempio.it', 'chi l\'ha rimandata, come prima');
    esigi(s.confermaInAttesa === true, 'e la scheda e\' nel giro automatico (il promemoria del giorno dopo)');
    const m = spedite[0] || {};
    esigi(spedite.length === 1 && m.to === 'bruno@alfa.it' && m.replyTo === 'info@nextgenerationbusiness.it' && Array.isArray(m.bcc) && m.bcc[0] === 'admin@esempio.it',
        'la mail va a Bruno, con "Rispondi" verso info@ e la copia nascosta a chi l\'ha rimandata');
    esigi(sms.length === 1 && sms[0].tag === 'conferma-email' && sms[0].recipient === '393331113333' && /inviata a bruno@alfa\.it/.test(sms[0].content)
        && /modulo contatti del sito/.test(sms[0].content) && !/https?:/.test(sms[0].content), 'l\'SMS "conferma la tua email" al cellulare verificato', JSON.stringify(sms[0]));
    esigi(s.smsConferma && s.smsConferma.ok === true && s.smsConferma.tipo === 'inviata', 'e resta scritto sulla scheda');

    // il rinvio che non parte: 502, e la traccia dice il motivo nuovo
    scenario();
    mailGuasta = 1;
    const errVero = console.error;
    console.error = () => { };
    let k;
    try { k = await chiama({ azione: 'richiedi-conferma-email', evento: EV, idIscritto: B }); } finally { console.error = errVero; }
    s = scheda(B);
    esigi(k.stato === 502 && /casella piena/.test(k.corpo.msg) && s.mailConferma.ok === false && /casella piena/.test(s.mailConferma.errore) && sms.length === 0,
        'posta giu\': 502, la traccia lo dice, e niente SMS', JSON.stringify(k.corpo));

    // Napoli: la mail si', l'SMS no
    scenario();
    const n = await chiama({ azione: 'richiedi-conferma-email', evento: 'napoli', idIscritto: N });
    esigi(n.corpo.ok && n.corpo.sms && n.corpo.sms.inviato === false && sms.length === 0 && spedite.length === 1, 'a Napoli la mail riparte, senza SMS', JSON.stringify(n.corpo));
    esigi(!('confermaInAttesa' in (scheda(N) || {})), 'e niente giro automatico');
});

prova('"Rimanda la mail di conferma" a un\'importata o a un\'inserita a mano: la mail parte, ma la scheda non diventa "in attesa"', async () => {
    scenario();
    // Ida, caricata con "Importa" (e un cellulare, per vedere che l'SMS non parte)
    dati.set('iscrizioni/' + idScheda(I), Object.assign({}, scheda(I), { telefonoNumero: '+393339998888' }));
    esigi(CONF.dalModuloDelSito(scheda(I)) === false && CONF.inAttesaDiConferma(scheda(I)) === false, 'prima: importata, non in attesa');
    const r = await chiama({ azione: 'richiedi-conferma-email', evento: EV, idIscritto: I });
    let i = scheda(I);
    esigi(r.stato === 200 && r.corpo.ok && spedite.length === 1 && spedite[0].to === 'ida@gamma.it' && /Richiesta di conferma/.test(spedite[0].subject),
        'la mail con il pulsante parte', JSON.stringify(r.corpo));
    esigi(!('mailConferma' in i) && !('invioConferma' in i) && !('confermaInAttesa' in i), 'ma la scheda non prende la traccia del sito, ne\' la bandiera', JSON.stringify(Object.keys(i)));
    esigi(i.mailConfermaStaff && i.mailConfermaStaff.ok === true && i.mailConfermaStaff.via === 'staff' && i.mailConfermaStaff.a === 'ida@gamma.it',
        'com\'e\' andata resta scritto a parte', JSON.stringify(i.mailConfermaStaff));
    esigi(CONF.inAttesaDiConferma(i) === false && CONF.dalModuloDelSito(i) === false, 'dopo: ancora non in attesa (conta in sala, riceve i promemoria)');
    esigi(sms.length === 0 && r.corpo.sms && r.corpo.sms.inviato === false, 'e nessun SMS "conferma la tua email": non ha niente da confermare');
    // il secondo rinvio, dopo i dieci minuti: e' quello che prima accendeva la bandiera
    dati.set('iscrizioni/' + idScheda(I), Object.assign({}, scheda(I), { emailConfermaRimandata: { da: 'admin@esempio.it', quando: Date.now() - 11 * 60 * 1000 } }));
    const r2 = await chiama({ azione: 'richiedi-conferma-email', evento: EV, idIscritto: I });
    i = scheda(I);
    esigi(r2.corpo.ok && spedite.length === 2 && !('confermaInAttesa' in i) && !('mailConferma' in i) && CONF.inAttesaDiConferma(i) === false,
        'anche al secondo rinvio: niente bandiera, niente "in attesa"', JSON.stringify(r2.corpo));
    esigi(GIRO.cosaFare(Object.assign({}, i, { confermaInAttesa: true }), Date.parse('2027-01-20T10:00:00+01:00')).fare === 'togli',
        'e il giro automatico, se la trovasse, non avrebbe niente da mandarle');
    // la posta giu': 502 come sempre, e la traccia resta a parte
    mailGuasta = 1;
    dati.set('iscrizioni/' + idScheda(I), Object.assign({}, scheda(I), { emailConfermaRimandata: { da: 'admin@esempio.it', quando: Date.now() - 11 * 60 * 1000 } }));
    const errVero = console.error;
    console.error = () => { };
    let k;
    try { k = await chiama({ azione: 'richiedi-conferma-email', evento: EV, idIscritto: I }); } finally { console.error = errVero; mailGuasta = 0; }
    i = scheda(I);
    esigi(k.stato === 502 && i.mailConfermaStaff.ok === false && /casella piena/.test(i.mailConfermaStaff.errore) && !('mailConferma' in i),
        'posta giu\': 502, e il motivo resta nella traccia dello staff', JSON.stringify(i.mailConfermaStaff));
    // Elio, inserito a mano da Eventbrite: lo stesso
    const re = await chiama({ azione: 'richiedi-conferma-email', evento: EV, idIscritto: E });
    const e = scheda(E);
    esigi(re.corpo.ok && !('mailConferma' in e) && !('confermaInAttesa' in e) && e.mailConfermaStaff && e.mailConfermaStaff.ok === true && CONF.inAttesaDiConferma(e) === false,
        'lo stesso per chi e\' stato inserito a mano (Eventbrite)', JSON.stringify(re.corpo));
    // una scheda del sito invece si', come prima (la prova qui sopra): Bruno torna nel giro
    const rb = await chiama({ azione: 'richiedi-conferma-email', evento: EV, idIscritto: B });
    esigi(rb.corpo.ok && scheda(B).mailConferma.via === 'staff' && scheda(B).confermaInAttesa === true && !scheda(B).mailConfermaStaff, 'Bruno, dal sito: traccia del sito e bandiera');
});

prova('Rifare il trasloco non cambia niente', async () => {
    scenario();
    const da = idScheda(A), a = idScheda('anna@alfa.com|10/01/2027 10:00:00');
    const ev = V.eventoDi(MILANO);
    const uno = await V.trasloca(db, { da: da, a: a, codice: 'K7M3P', ev: ev, email: '', numero: '+393331112222' });
    const dopoUno = JSON.stringify([dati.get('codiciInvito/K7M3P'), unico('tel', '+393331112222')]);
    const due = await V.trasloca(db, { da: da, a: a, codice: 'k7m3p', ev: ev, email: '', numero: '+393331112222' });
    esigi(uno.codice === true && uno.unici === 1, 'la prima volta: codice e cellulare', JSON.stringify(uno));
    esigi(due.codice === false && due.unici === 0 && JSON.stringify([dati.get('codiciInvito/K7M3P'), unico('tel', '+393331112222')]) === dopoUno,
        'la seconda non trova piu\' il nome vecchio e non scrive niente', JSON.stringify(due));
    // un nome gia' presente non si raddoppia
    dati.set('codiciInvito/K7M3P', Object.assign({}, dati.get('codiciInvito/K7M3P'), { iscrizioniUsate: [da, a, idScheda(B)] }));
    await V.trasloca(db, { da: da, a: a, codice: 'K7M3P' });
    esigi(JSON.stringify(dati.get('codiciInvito/K7M3P').iscrizioniUsate) === JSON.stringify([a, idScheda(B)]), 'e un nome gia\' presente non si conta due volte',
        JSON.stringify(dati.get('codiciInvito/K7M3P').iscrizioniUsate));
    // un documento di unicita' che punta a un'altra scheda non si tocca
    dati.set('iscrizioniUniche/' + EV + '|tel|+393339990000', { evento: EV, iscrizione: 'altra' });
    const tre = await V.trasloca(db, { da: da, a: a, ev: ev, numero: '+393339990000' });
    esigi(tre.unici === 0 && unico('tel', '+393339990000').iscrizione === 'altra', 'il cellulare di un\'altra scheda resta suo');
});

(async () => {
    for (const p of prove) { console.log('\n' + p.titolo); await p.fn(); }
    console.log('\nLa PEC di sollecito segue la scheda che trasloca');
    {
        scenario();
        dati.set('iscrizioni/' + idScheda(A), Object.assign({}, scheda(A), { pecSollecito: { quando: 7, ok: true, a: 'alfa@pec.alfa.it', riferimento: 'sol-abc@pec.it' } }));
        dati.set('pecRiferimenti/m~sol-abc@pec.it', { msgid: 'sol-abc@pec.it', scheda: 'milano~alfa@pec-it', tipo: 'sollecito', iscrizione: idScheda(A) });
        dati.set('pecRiferimenti/lp~sol-abc', { msgid: 'sol-abc@pec.it', scheda: 'milano~alfa@pec-it', tipo: 'sollecito', iscrizione: idScheda(A) });
        dati.set('pecRiferimenti/m~altra', { msgid: 'altra', scheda: 'milano~alfa@pec-it', tipo: 'sollecito', iscrizione: 'un-altro' });
        const r = await modifica(A, { data: '10/01/2027 10:00:01' });
        const A2 = 'anna@alfa.it|10/01/2027 10:00:01';
        esigi(r.stato === 200 && scheda(A2) && scheda(A2).pecSollecito && scheda(A2).pecSollecito.riferimento === 'sol-abc@pec.it' && !scheda(A), 'la scheda trasloca con la traccia della PEC');
        esigi(dati.get('pecRiferimenti/m~sol-abc@pec.it').iscrizione === idScheda(A2) && dati.get('pecRiferimenti/lp~sol-abc').iscrizione === idScheda(A2) && dati.get('pecRiferimenti/m~altra').iscrizione === 'un-altro',
            'e i riferimenti della sua PEC puntano al nome nuovo (gli altri no)');
    }

    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
