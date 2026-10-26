/* ============================================================
   PROVE - api/presenze.js, azione "assegna-codice" (Assegna codice invito)
   ------------------------------------------------------------
       node prove/assegna-codice.prove.js

   Niente da installare: Firestore, l'autenticazione e la posta sono
   finti e stanno qui dentro. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Chi si iscrive dal sito senza scrivere il codice
   riservato della sua azienda e' in elenco come uno qualsiasi, e il
   promemoria "l'invito vale per due persone" non lo vede.
   L'amministratore glielo assegna dal menu della riga, e qui si verifica
   che:
     - solo l'amministratore; una scheda che non c'e' da' 404;
     - un codice malformato, inesistente o di un altro evento si rifiuta,
       e la scheda resta com'e';
     - il codice si scrive come si legge: minuscole, O e I al posto di 0 e
       1 (l'alfabeto di Crockford);
     - a Milano si scrive quello che avrebbe scritto il modulo: codice,
       ragione sociale e scheda dell'invito, l'azienda del codice, le
       colonne del file, la firma di chi l'ha assegnato; il posto nel
       conto del codice (iscrizioniUsate), l'uso sul codice, "iscritta"
       sull'azienda; e la revisione dell'elenco;
     - rifarlo non cambia niente (gia'), un altro codice sulla scheda non
       si cambia, un'annullata non lo prende;
     - un codice gia' pieno (due attive) dice di no e non scrive niente;
     - a Napoli, dove il codice non tiene il conto, sul codice non si
       scrive il posto;
     - e da li' il promemoria della seconda persona vede l'azienda: a un
       giorno dalla conferma dell'email, invitata per PEC.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- Firestore finto (con transazioni) ----------
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
function doc(coll, id) {
    const chiave = coll + '/' + id;
    const self = {
        id: id, _chiave: chiave,
        get: async () => {
            const v = dati.get(chiave);
            return { exists: dati.has(chiave), id: id, ref: self, data: () => (v ? JSON.parse(JSON.stringify(v)) : undefined) };
        },
        set: async (patch, opz) => { dati.set(chiave, applica(dati.get(chiave), patch, !!(opz && opz.merge))); },
        update: async patch => { dati.set(chiave, applica(dati.get(chiave), patch, true)); },
        delete: async () => { dati.delete(chiave); }
    };
    return self;
}
const db = {
    collection(coll) { return { doc: id => doc(coll, id) }; },
    async getAll(...rif) { return Promise.all(rif.map(r => r.get())); },
    batch() {
        const op = [];
        return {
            set: (r, patch, opz) => op.push(() => r.set(patch, opz)),
            delete: r => op.push(() => r.delete()),
            commit: async () => { for (const f of op) await f(); }
        };
    },
    /* Come Firestore: se un documento letto nella transazione e' cambiato
       prima della scrittura, la transazione riparte da capo. Senza questo
       due richieste insieme passerebbero tutte e due anche qui, e la prova
       dei doppioni non proverebbe niente. */
    async runTransaction(fn) {
        for (let giro = 0; giro < 5; giro++) {
            const letti = new Map();
            const scritture = [];
            const tx = {
                get: async r => { const s = await r.get(); letti.set(r._chiave, JSON.stringify(dati.get(r._chiave) || null)); return s; },
                set: (r, patch, opz) => { scritture.push([r, patch, opz]); }
            };
            const esito = await fn(tx);
            // la scrittura avviene "dopo": un'altra richiesta puo' essere passata nel frattempo
            await new Promise(res => setImmediate(res));
            let cambiato = false;
            for (const [k, v] of letti) if (JSON.stringify(dati.get(k) || null) !== v) cambiato = true;
            if (cambiato) continue;
            for (const [r, patch, opz] of scritture) await r.set(patch, opz);
            return esito;
        }
        throw new Error('transazione mai riuscita');
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
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return { createTransport: () => ({ sendMail: async () => ({}) }) };
    if (nome === 'imapflow') return { ImapFlow: function () { } };
    if (nome === 'google-auth-library') return { JWT: function () { }, GoogleAuth: function () { } };
    return veroRequire.apply(this, arguments);
};
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    client_email: 'servizio@esempio.iam.gserviceaccount.com', private_key: 'chiave-finta-per-le-prove'
});
process.env.SMTP_FROM_EMAIL = 'noreply@esempio.it';

const RADICE = path.join(__dirname, '..');
const presenze = require(path.join(RADICE, 'api/presenze.js'));
const P2 = require(path.join(RADICE, 'lib/promemoria-seconda-persona.js'));

// ---------- utilita' ----------
let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
function idScheda(id) { return String(id).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 300); }
function scheda(id) { return dati.get('iscrizioni/' + idScheda(id)); }
async function chiama(corpo) {
    let stato = 0, risposta = null;
    const res = { setHeader() { }, status(s) { stato = s; return res; }, json(c) { risposta = c; return res; }, end() { return res; } };
    await presenze({ method: 'POST', headers: {}, body: Object.assign({ idToken: 'finto' }, corpo) }, res);
    return { stato: stato, corpo: risposta || {} };
}
const EV = 'milano-2027-02-26';
const MILANO = 'Milano 26 Febbraio 2027 - Iscrizione';
const assegna = (id, codice, extra) => chiama(Object.assign({ azione: 'assegna-codice', evento: EV, idIscritto: id, doc: idScheda(id), codice: codice }, extra || {}));

/* Lo scenario: Guna si e' iscritta dal sito senza il codice P0Y1M della sua
   PEC; Alfa ha gia' due persone con il codice K7M3P; Olga ha annullato; a
   Napoli Nino si e' iscritto senza il codice NAP01. */
const G = 'a.antonini@guna.it|26/10/2026 09:16:07';
const A = 'anna@alfa.it|10/01/2027 10:00:00';
const B = 'bruno@alfa.it|10/01/2027 11:00:00';
const O = 'olga@omega.it|09/01/2027 08:00:00';
const T = 'tina@theta.it|12/01/2027 08:00:00';
const N = 'nino@delta.it|01/09/2026 10:00:00';
const ORA_CONFERMA = Date.UTC(2026, 9, 26, 10, 0, 0);
function scenario() {
    dati.clear();
    dati.set('utenti/admin@esempio.it', { nome: 'Anna Admin', ruolo: 'admin', attivo: true, eventi: true });
    dati.set('iscrizioni/' + idScheda(G), {
        data: '26/10/2026 09:16:07', pagina: MILANO, nome: 'Andrea', cognome: 'Antonini', email: 'a.antonini@guna.it',
        azienda: 'Guna S.p.A.', ruolo: 'Direttore amministrativo e finanziario / CFO', telefono: '+39 346 669 7671',
        telefonoNumero: '+393466697671', telefonoVerificato: { quando: 1, come: 'sms' },
        mailConferma: { quando: 2, ok: true, errore: '' }, emailConfermata: { quando: ORA_CONFERMA, come: 'mail' }
    });
    dati.set('codiciInvito/P0Y1M', { codice: 'P0Y1M', evento: 'milano', pagina: 'Milano 26 Febbraio 2027', campagna: 'invito', ragioneSociale: 'GUNA S.P.A.', scheda: 'milano~guna@pec-it' });
    dati.set('aziendeInvito/milano~guna@pec-it', {
        ragioneSociale: 'GUNA S.P.A.', codice: 'P0Y1M', pec: 'guna@pec.it', stato: 'invitata',
        invio: { canale: 'pec', codice: 'P0Y1M', quando: 1 },
        datiFile: [{ c: 'Ragione sociale (file)', v: 'GUNA S.P.A.' }, { c: 'Partita IVA', v: '06435100157' }]
    });
    for (const [id, nome, em] of [[A, 'Anna', 'anna@alfa.it'], [B, 'Bruno', 'bruno@alfa.it']]) {
        dati.set('iscrizioni/' + idScheda(id), { data: id.split('|')[1], pagina: MILANO, nome: nome, cognome: 'Alfa', email: em, azienda: 'ALFA S.P.A.', invitoCodice: 'K7M3P', invitoAzienda: 'ALFA S.P.A.', selezionata: true });
    }
    dati.set('codiciInvito/K7M3P', { codice: 'K7M3P', evento: 'milano', pagina: 'Milano 26 Febbraio 2027', campagna: 'invito', ragioneSociale: 'ALFA S.P.A.', iscrizioniUsate: [idScheda(A), idScheda(B)] });
    dati.set('iscrizioni/' + idScheda(T), { data: '12/01/2027 08:00:00', pagina: MILANO, nome: 'Tina', cognome: 'Theta', email: 'tina@theta.it', azienda: 'Theta' });
    dati.set('iscrizioni/' + idScheda(O), { data: '09/01/2027 08:00:00', pagina: MILANO, nome: 'Olga', cognome: 'Omega', email: 'olga@omega.it', annullato: { quando: 7, da: 'intestatario' } });
    dati.set('codiciInvito/Q2W3E', { codice: 'Q2W3E', evento: 'milano', pagina: 'Milano 26 Febbraio 2027', campagna: 'invito', ragioneSociale: 'OMEGA S.R.L.' });
    dati.set('codiciInvito/NAP01', { codice: 'NAP01', evento: 'napoli', pagina: 'Napoli 2 Ottobre 2026', campagna: 'invito', ragioneSociale: 'DELTA S.R.L.' });
    // il posto 2 di un ordine di Tina: ha il suo stesso indirizzo e la sua data
    dati.set('iscrizioni/' + idScheda(T) + '~p2', { data: '12/01/2027 08:00:00', pagina: MILANO, nome: 'Tino', cognome: 'Theta', email: 'tina@theta.it', azienda: 'Theta', gruppo: idScheda(T), origine: 'partecipante', partecipanti: 1 });
    dati.set('iscrizioni/' + idScheda(N), { data: '01/09/2026 10:00:00', pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse', nome: 'Nino', cognome: 'Delta', email: 'nino@delta.it', azienda: 'Delta' });
}

(async () => {
    console.log('\nChi puo\', e che cosa si rifiuta');
    scenario();
    dati.set('utenti/admin@esempio.it', { nome: 'Pino Partner', ruolo: 'partner', attivo: true, eventi: true });
    let r = await assegna(G, 'P0Y1M');
    esigi(r.stato === 403 && !scheda(G).invitoCodice, 'un non amministratore non assegna codici', r.stato + ' ' + JSON.stringify(r.corpo));
    scenario();
    r = await assegna('nessuno@x.it|01/01/2027 10:00:00', 'P0Y1M');
    esigi(r.stato === 404, 'una scheda che non c\'e\': 404', String(r.stato));
    r = await assegna(G, 'P0Y');
    esigi(r.stato === 400 && /forma giusta/.test(r.corpo.msg) && !scheda(G).invitoCodice, 'un codice troppo corto si rifiuta', r.corpo.msg);
    r = await assegna(G, 'ZZZZ9');
    esigi(r.stato === 400 && /ZZZZ9 non risulta fra quelli inviati/.test(r.corpo.msg) && !scheda(G).invitoCodice, 'un codice che non esiste si rifiuta, dicendolo', r.corpo.msg);
    r = await assegna(G, 'NAP01');
    esigi(r.stato === 400 && /di un altro evento/.test(r.corpo.msg) && !scheda(G).invitoCodice, 'il codice di Napoli non vale a Milano', r.corpo.msg);
    r = await assegna(O, 'Q2W3E');
    esigi(r.stato === 400 && /annullata/.test(r.corpo.msg) && !scheda(O).invitoCodice, 'un\'iscrizione annullata non prende il codice', r.corpo.msg);
    const revPrima = (dati.get('meta/iscrizioni') || {}).rev || 0;

    console.log('\nGuna prende il suo codice, scritto come si legge');
    r = await assegna(G, ' poyim ');
    const g = scheda(G);
    esigi(r.stato === 200 && r.corpo.ok && !r.corpo.gia && r.corpo.invito.codice === 'P0Y1M' && r.corpo.invito.azienda === 'GUNA S.P.A.',
        '"poyim" (minuscole, O e I) e\' P0Y1M: assegnato', JSON.stringify(r.corpo));
    esigi(g.invitoCodice === 'P0Y1M' && g.invitoAzienda === 'GUNA S.P.A.' && g.invitoScheda === 'milano~guna@pec-it' && g.selezionata === true,
        'sulla scheda: codice, ragione sociale e scheda dell\'invito, "azienda selezionata"', JSON.stringify(g));
    esigi(g.azienda === 'GUNA S.P.A.' && g.codiceAssegnato && g.codiceAssegnato.aziendaPrima === 'Guna S.p.A.' && g.codiceAssegnato.da === 'admin@esempio.it' && g.codiceAssegnato.codice === 'P0Y1M',
        'l\'azienda e\' quella del codice, e resta scritto chi l\'ha assegnato e com\'era prima', JSON.stringify(g.codiceAssegnato));
    esigi(Array.isArray(g.datiInvito) && g.datiInvito.length === 2 && g.datiInvito[1].v === '06435100157', 'le colonne del file dell\'azienda sono copiate', JSON.stringify(g.datiInvito));
    esigi(g.nome === 'Andrea' && g.email === 'a.antonini@guna.it' && g.emailConfermata && g.emailConfermata.quando === ORA_CONFERMA && g.telefonoNumero === '+393466697671',
        'il resto della scheda e\' com\'era: nome, email confermata, cellulare');
    const c = dati.get('codiciInvito/P0Y1M');
    esigi(Array.isArray(c.iscrizioniUsate) && c.iscrizioniUsate.length === 1 && c.iscrizioniUsate[0] === idScheda(G), 'il codice conta la scheda fra i suoi due posti', JSON.stringify(c.iscrizioniUsate));
    esigi(c.usi === 1 && c.usato && c.usato.email === 'a.antonini@guna.it' && c.usato.iscrizione === idScheda(G), 'e segna l\'uso', JSON.stringify(c.usato));
    const az = dati.get('aziendeInvito/milano~guna@pec-it');
    esigi(az.stato === 'iscritta' && Array.isArray(az.iscritti) && az.iscritti.length === 1 && az.iscritti[0].email === 'a.antonini@guna.it' && az.iscritti[0].nome === 'Andrea Antonini',
        'l\'azienda invitata passa a "iscritta", con chi si e\' registrato', JSON.stringify(az.iscritti));
    esigi(((dati.get('meta/iscrizioni') || {}).rev || 0) === revPrima + 1, 'l\'elenco sa che e\' cambiato qualcosa');

    console.log('\nRifarlo, cambiarlo, un codice pieno');
    r = await assegna(G, 'P0Y1M');
    esigi(r.stato === 200 && r.corpo.gia === true && dati.get('codiciInvito/P0Y1M').iscrizioniUsate.length === 1 && dati.get('codiciInvito/P0Y1M').usi === 1,
        'rifarlo con lo stesso codice: "gia\'", e niente si conta due volte', JSON.stringify(r.corpo));
    r = await assegna(G, 'Q2W3E');
    esigi(r.stato === 400 && /ha già il codice P0Y1M/.test(r.corpo.msg) && scheda(G).invitoCodice === 'P0Y1M', 'un altro codice su una scheda che ne ha uno: no', r.corpo.msg);
    r = await assegna(T, 'K7M3P');
    const t = scheda(T);
    esigi(r.stato === 409 && /due iscrizioni attive/.test(r.corpo.msg) && !t.invitoCodice && !t.selezionata && t.azienda === 'Theta'
        && dati.get('codiciInvito/K7M3P').iscrizioniUsate.length === 2 && !dati.get('codiciInvito/K7M3P').usi,
        'il codice di Alfa e\' pieno: no, e la scheda di Tina resta com\'e\'', r.corpo.msg);
    // Bruno annulla: il posto si libera, e Tina entra
    dati.set('iscrizioni/' + idScheda(B), Object.assign({}, scheda(B), { annullato: { quando: 9, da: 'intestatario' } }));
    r = await assegna(T, 'k7m3p');
    esigi(r.stato === 200 && scheda(T).invitoCodice === 'K7M3P' && JSON.stringify(dati.get('codiciInvito/K7M3P').iscrizioniUsate) === JSON.stringify([idScheda(A), idScheda(T)]),
        'con un posto libero (Bruno ha annullato) Tina entra, e il conto tiene le due attive', JSON.stringify(dati.get('codiciInvito/K7M3P').iscrizioniUsate));

    console.log('\nI posti 2..N di un ordine, e due richieste insieme');
    r = await chiama({ azione: 'assegna-codice', evento: EV, idIscritto: T, doc: idScheda(T) + '~p2', codice: 'Q2W3E' });
    esigi(r.stato === 400 && /intestatario/.test(r.corpo.msg) && !dati.get('iscrizioni/' + idScheda(T) + '~p2').invitoCodice && !dati.get('codiciInvito/Q2W3E').iscrizioniUsate,
        'il posto 2 di un ordine non prende il codice: e\' dell\'intestatario', r.corpo.msg);
    scenario();
    let due = await Promise.all([assegna(G, 'P0Y1M'), assegna(G, 'P0Y1M')]);
    esigi(due.every(x => x.stato === 200 && x.corpo.ok) && due.filter(x => x.corpo.gia).length === 1,
        'lo stesso codice due volte insieme (un doppio clic): una scrive, l\'altra dice "gia\'"', JSON.stringify(due.map(x => x.corpo)));
    esigi(dati.get('aziendeInvito/milano~guna@pec-it').iscritti.length === 1 && dati.get('codiciInvito/P0Y1M').usi === 1 && dati.get('codiciInvito/P0Y1M').iscrizioniUsate.length === 1,
        'e niente si conta due volte: un iscritto sull\'azienda, un uso, un posto');
    scenario();
    due = await Promise.all([assegna(G, 'P0Y1M'), assegna(G, 'Q2W3E')]);
    const vinto = scheda(G).invitoCodice;
    const perso = vinto === 'P0Y1M' ? 'Q2W3E' : 'P0Y1M';
    esigi(due.filter(x => x.stato === 200).length === 1 && due.some(x => x.stato === 400 && new RegExp('ha già il codice ' + vinto).test(x.corpo.msg)),
        'due codici diversi insieme: uno passa, l\'altro dice quale c\'e\' gia\'', JSON.stringify(due.map(x => x.stato + ' ' + (x.corpo.msg || 'ok'))));
    esigi(JSON.stringify(dati.get('codiciInvito/' + vinto).iscrizioniUsate) === JSON.stringify([idScheda(G)]) && !dati.get('codiciInvito/' + perso).iscrizioniUsate && !dati.get('codiciInvito/' + perso).usi,
        'la scheda occupa un posto solo, in un codice solo', vinto);
    esigi(scheda(G).invitoAzienda === dati.get('codiciInvito/' + vinto).ragioneSociale && scheda(G).codiceAssegnato.codice === vinto, 'e azienda e firma sono quelle del codice scritto');

    console.log('\nModifica si porta dietro la firma');
    scenario();
    await assegna(G, 'P0Y1M');
    const sG = scheda(G);
    r = await chiama({ azione: 'modifica', evento: EV, idIscritto: G, pagina: sG.pagina, campi: { nome: sG.nome, cognome: sG.cognome, email: sG.email, telefono: sG.telefono, azienda: sG.azienda, ruolo: sG.ruolo, data: '26/10/2026 09:16:08', messaggio: '' } });
    const G2 = 'a.antonini@guna.it|26/10/2026 09:16:08';
    esigi(r.stato === 200 && !scheda(G) && scheda(G2) && scheda(G2).invitoCodice === 'P0Y1M' && scheda(G2).codiceAssegnato && scheda(G2).codiceAssegnato.aziendaPrima === 'Guna S.p.A.',
        'corretta l\'ora dell\'iscrizione, la scheda trasloca con il codice e con chi l\'ha assegnato', JSON.stringify(r.corpo).slice(0, 200));
    esigi(JSON.stringify(dati.get('codiciInvito/P0Y1M').iscrizioniUsate) === JSON.stringify([idScheda(G2)]), 'e il posto nel codice segue la scheda');

    console.log('\nNapoli: il codice si scrive, il conto no');
    scenario();
    r = await chiama({ azione: 'assegna-codice', evento: 'napoli-2026-10-02', idIscritto: N, doc: idScheda(N), codice: 'NAP01' });
    const n = scheda(N);
    esigi(r.stato === 200 && n.invitoCodice === 'NAP01' && n.invitoAzienda === 'DELTA S.R.L.' && n.selezionata === true, 'a Napoli la scheda prende il codice', JSON.stringify(r.corpo));
    esigi(n.azienda === 'Delta' && !dati.get('codiciInvito/NAP01').iscrizioniUsate && dati.get('codiciInvito/NAP01').usi === 1,
        'ma l\'azienda scritta resta, e sul codice c\'e\' l\'uso, non il posto (a Napoli il codice non tiene il conto)');

    console.log('\nE il promemoria della seconda persona la vede');
    await assegna(G, 'P0Y1M');
    await assegna(T, 'K7M3P');
    const schedeP2 = [G, A, T].map(id => ({ id: idScheda(id), x: scheda(id) }));
    const unGiornoMeno = ORA_CONFERMA + P2.DOPO_CONFERMA_MS - 60000;
    const unGiorno = ORA_CONFERMA + P2.DOPO_CONFERMA_MS;
    esigi(!P2.candidati(schedeP2, unGiornoMeno).some(x => x.codice === 'P0Y1M'), 'prima di un giorno dalla conferma dell\'email: non ancora');
    const cand = P2.candidati(schedeP2, unGiorno);
    esigi(cand.length === 1 && cand[0].codice === 'P0Y1M' && cand[0].id === idScheda(G), 'a un giorno dalla conferma Guna e\' candidata, sola con il suo codice (Alfa e Tina sono in due)', JSON.stringify(cand));
    esigi(P2.invitataPerPec(dati.get('aziendeInvito/milano~guna@pec-it')), 'e l\'invito a Guna e\' partito per PEC: la mail partira\'');

    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
