/* ============================================================
   PROVE - il ruolo "Vice amministratore" (viceadmin)
   ------------------------------------------------------------
       node prove/vice-amministratore.prove.js

   Firestore, l'autenticazione e la posta sono finti e stanno qui
   dentro: non serve niente di installato.

   COSA DIMOSTRANO. Il vice amministratore puo' fare tutto quello
   che puo' fare l'amministratore. Il permesso si decide in tre
   posti - l'app (area-riservata/app.js), le regole Firestore
   (area-riservata/FIREBASE-SETUP.md) e questo servizio
   (lib/utente-effettivo.js) - e basta che uno dei tre resti
   indietro perche' il vice veda un comando che poi il server gli
   rifiuta. Qui si controlla che:
     - eRuoloAdmin() riconosca 'admin' e 'viceadmin', e nessun altro;
     - un collaboratore NON possa lavorare a nome di un vice
       amministratore, come gia' non puo' a nome dell'amministratore
       (i poteri su utenti, ruoli e dati non si delegano);
     - ogni porta del servizio riservata all'amministratore dia al
       vice LA STESSA risposta che da' all'amministratore, e a un
       altro ruolo continui a dire di no;
     - app, regole e servizio usino lo stesso identificativo e la
       stessa regola, e che nel servizio nessuno confronti piu' il
       ruolo con 'admin' a mano.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');
const fs = require('fs');

const RADICE = path.join(__dirname, '..');

// ---------- Firestore finto ----------
const dati = new Map();
function istantanea(coll, id) {
    const k = coll + '/' + id;
    return { id: id, exists: dati.has(k), data: () => dati.get(k), ref: documento(coll, id) };
}
function documento(coll, id) {
    const k = coll + '/' + id;
    return {
        id: id,
        get: async () => istantanea(coll, id),
        set: async (v, opz) => { dati.set(k, (opz && opz.merge) ? Object.assign({}, dati.get(k) || {}, v) : v); },
        update: async v => { dati.set(k, Object.assign({}, dati.get(k) || {}, v)); },
        delete: async () => { dati.delete(k); }
    };
}
function elenco(coll, filtri) {
    const docs = [...dati.keys()].filter(k => k.indexOf(coll + '/') === 0)
        .map(k => istantanea(coll, k.slice(coll.length + 1)))
        .filter(s => filtri.every(f => (s.data() || {})[f[0]] === f[1]));
    return { docs: docs, empty: !docs.length, size: docs.length, forEach: f => docs.forEach(f) };
}
/* Un'interrogazione: where() con l'uguaglianza filtra davvero, tutto il resto
   (orderBy, limit, select...) si lascia passare senza cambiare niente. */
function interrogazione(coll, filtri) {
    return new Proxy({}, {
        get(_, nome) {
            if (nome === 'then') return undefined;
            if (nome === 'get') return async () => elenco(coll, filtri);
            if (nome === 'doc') return id => documento(coll, String(id));
            if (nome === 'where') return (campo, op, valore) => interrogazione(coll, op === '==' ? filtri.concat([[campo, valore]]) : filtri);
            return () => interrogazione(coll, filtri);
        }
    });
}
const db = {
    collection: coll => interrogazione(coll, []),
    runTransaction: async f => f({
        get: rif => rif.get(),
        set: (rif, v, opz) => rif.set(v, opz),
        update: (rif, v) => rif.update(v),
        delete: rif => rif.delete()
    }),
    batch: () => ({ set() { }, update() { }, delete() { }, commit: async () => { } })
};
/* Il gettone di prova porta l'indirizzo: 'token-anna@esempio.it'. */
const admin = {
    apps: [],
    initializeApp() { },
    credential: { cert: c => c },
    firestore: () => db,
    auth: () => ({
        verifyIdToken: async t => {
            if (!/^token-/.test(String(t))) throw new Error('gettone non valido');
            return { email: String(t).slice(6) };
        }
    })
};
admin.firestore.FieldValue = { increment: n => n, serverTimestamp: () => 0, delete: () => null, arrayUnion: (...a) => a };

const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return { createTransport: () => ({ sendMail: async () => ({}) }) };
    if (nome === 'google-auth-library') return { JWT: function () { } };
    return veroRequire.apply(this, arguments);
};
process.env.FIREBASE_SERVICE_ACCOUNT = '{"client_email":"x@y.z","private_key":"k"}';
process.env.NEWSLETTER_SECRET = 'segreto-di-prova';
delete process.env.EVENTI_SHEET_ID;

const UE = require(path.join(RADICE, 'lib', 'utente-effettivo.js'));
const NL = require(path.join(RADICE, 'lib', 'newsletter.js'));
const CIRC = require(path.join(RADICE, 'lib', 'circ-dati.js'));
const IMPORTA = require(path.join(RADICE, 'api', 'importa-iscrizioni.js'));
const ISCRIZIONI = require(path.join(RADICE, 'api', 'iscrizioni.js'));
const PRESENZE = require(path.join(RADICE, 'api', 'presenze.js'));
const SBLOCCO = require(path.join(RADICE, 'api', 'sblocco-incarico.js'));

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
async function chiama(porta, body) {
    const r = { _stato: 0, _j: null };
    r.setHeader = () => { };
    r.status = s => { r._stato = s; return r; };
    r.json = j => { r._j = j; return r; };
    r.end = () => r;
    await porta({ method: 'POST', headers: {}, body: body }, r);
    return { stato: r._stato, corpo: r._j || {} };
}
const uguali = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const ADMIN = 'anna@esempio.it', VICE = 'vito@esempio.it', ALTRO = 'piero@esempio.it';
function scenario() {
    dati.clear();
    dati.set('utenti/' + ADMIN, { nome: 'Anna Admin', ruolo: 'admin', attivo: true });
    dati.set('utenti/' + VICE, { nome: 'Vito Vice', ruolo: 'viceadmin', attivo: true });
    dati.set('utenti/' + ALTRO, { nome: 'Piero Procuratore', ruolo: 'procuratore', attivo: true });
}

(async () => {
    // ------------------------------------------------------------
    console.log('\nChi e\' amministratore');
    esigi(UE.RUOLO_VICE_ADMIN === 'viceadmin', 'l\'identificativo del ruolo e\' "viceadmin"');
    esigi(UE.eRuoloAdmin('admin') && UE.eRuoloAdmin('viceadmin'), 'amministratore e vice amministratore: tutti e due');
    esigi(['', null, undefined, 'procuratore', 'qualita', 'coordinatore', 'vicecoordinatore', 'marketing', 'collaboratore',
        'sondaggio_compila', 'Admin', 'VICEADMIN', 'vice-admin', 'viceadmin ', 'admin2'].every(r => !UE.eRuoloAdmin(r)),
        'nessun altro ruolo, e nessuna scrittura che gli somigli');

    // ------------------------------------------------------------
    console.log('\nChi chiama: il vice e i collaboratori');
    scenario();
    dati.set('utenti/c1@esempio.it', { nome: 'Carla', ruolo: 'collaboratore', collaboratoreDi: VICE, attivo: true });
    dati.set('utenti/c2@esempio.it', { nome: 'Dino', ruolo: 'collaboratore', collaboratoreDi: ADMIN, attivo: true });
    dati.set('utenti/c3@esempio.it', { nome: 'Elsa', ruolo: 'collaboratore', collaboratoreDi: ALTRO, attivo: true });
    const v = await UE.utenteEffettivo(db, VICE);
    esigi(v.ok && v.email === VICE && v.ruolo === 'viceadmin' && v.collaboratore === false, 'il vice amministratore entra con la sua scheda e il suo ruolo');
    const c1 = await UE.utenteEffettivo(db, 'c1@esempio.it'), c2 = await UE.utenteEffettivo(db, 'c2@esempio.it'), c3 = await UE.utenteEffettivo(db, 'c3@esempio.it');
    esigi(c1.ok === false && /non può avere collaboratori/.test(c1.msg), 'un collaboratore del vice amministratore non entra: quei poteri non si delegano', JSON.stringify(c1));
    esigi(c2.ok === false && c2.msg === c1.msg, 'esattamente come un collaboratore dell\'amministratore');
    esigi(c3.ok && c3.email === ALTRO && c3.collaboratore === true, 'mentre il collaboratore di un altro utente continua a entrare a nome suo');
    dati.set('utenti/' + VICE, { nome: 'Vito Vice', ruolo: 'viceadmin', attivo: false });
    esigi((await UE.utenteEffettivo(db, VICE)).ok === false, 'un vice amministratore disabilitato resta fuori come chiunque');

    // ------------------------------------------------------------
    console.log('\nImportazione delle iscrizioni (solo amministratore)');
    scenario();
    const iA = await chiama(IMPORTA, { idToken: 'token-' + ADMIN }), iV = await chiama(IMPORTA, { idToken: 'token-' + VICE }), iP = await chiama(IMPORTA, { idToken: 'token-' + ALTRO });
    esigi(iP.stato === 403 && /Solo l'amministratore/.test(iP.corpo.msg), 'un altro ruolo: 403', JSON.stringify(iP));
    esigi(iA.stato !== 403 && iA.stato !== 401, 'l\'amministratore passa la porta', JSON.stringify(iA));
    esigi(uguali(iV, iA), 'il vice riceve la stessa risposta dell\'amministratore', JSON.stringify(iV));

    // ------------------------------------------------------------
    console.log('\nNewsletter');
    scenario();
    const nA = await NL.autorizza('token-' + ADMIN), nV = await NL.autorizza('token-' + VICE), nP = await NL.autorizza('token-' + ALTRO);
    esigi(nP.ok === false && nP.stato === 403, 'un altro ruolo senza il contrassegno: 403');
    esigi(nA.ok === true && nA.admin === true, 'l\'amministratore entra, da amministratore');
    esigi(nV.ok === true && nV.admin === true && nV.email === VICE && nV.ruolo === 'viceadmin', 'il vice entra senza contrassegno, da amministratore', JSON.stringify(nV));
    dati.set('utenti/' + ALTRO, { nome: 'Piero Procuratore', ruolo: 'procuratore', attivo: true, newsletter: true });
    const nP2 = await NL.autorizza('token-' + ALTRO);
    esigi(nP2.ok === true && nP2.admin === false, 'chi entra per contrassegno non diventa amministratore');

    // ------------------------------------------------------------
    console.log('\nCircolarizzazioni via PEC');
    scenario();
    const base = () => Promise.resolve({ imp: { supervisori: [] }, incarichi: [{ id: 'i1', cliente: 'Alfa Srl', stato: 'attivo' }], persone: [] });
    const profilo = async email => CIRC.profilo(db, await UE.utenteEffettivo(db, email), base());
    const pA = await profilo(ADMIN), pV = await profilo(VICE), pP = await profilo(ALTRO);
    esigi(pA.admin === true && pA.vedeTutto === true && pA.incarichi.length === 1, 'l\'amministratore vede tutti gli incarichi e ha i comandi riservati');
    esigi(pV.admin === true && pV.vedeTutto === true && pV.incarichi.length === 1, 'il vice anche', JSON.stringify({ admin: pV.admin, vedeTutto: pV.vedeTutto, n: pV.incarichi.length }));
    esigi(pP.admin === false && pP.vedeTutto === false && pP.incarichi.length === 0, 'un altro ruolo, fuori dal team, non vede niente');

    // ------------------------------------------------------------
    console.log('\nSezione Eventi: lettura delle iscrizioni');
    scenario();
    const eP = await chiama(ISCRIZIONI, { idToken: 'token-' + ALTRO, evento: 'napoli' });
    const eA = await chiama(ISCRIZIONI, { idToken: 'token-' + ADMIN, evento: 'napoli' }), eV = await chiama(ISCRIZIONI, { idToken: 'token-' + VICE, evento: 'napoli' });
    esigi(eP.stato === 403 && /Non sei abilitato alla sezione Eventi/.test(eP.corpo.msg), 'un altro ruolo non abilitato: 403', JSON.stringify(eP).slice(0, 200));
    esigi(eA.stato === 200 && eA.corpo.ok === true, 'l\'amministratore legge senza essere nell\'elenco degli abilitati', JSON.stringify(eA).slice(0, 200));
    const senzaOra = r => Object.assign({}, r, { corpo: Object.assign({}, r.corpo, { aggiornato: 0 }) });
    esigi(eV.stato === 200 && uguali(senzaOra(eV), senzaOra(eA)), 'il vice riceve la stessa risposta dell\'amministratore', JSON.stringify(eV).slice(0, 200));

    // ------------------------------------------------------------
    console.log('\nSezione Eventi: scrittura (presenze, iscrizioni a mano)');
    scenario();
    const corpoP = t => ({ idToken: t, azione: 'una-che-non-esiste' });
    const sP = await chiama(PRESENZE, corpoP('token-' + ALTRO));
    const sA = await chiama(PRESENZE, corpoP('token-' + ADMIN)), sV = await chiama(PRESENZE, corpoP('token-' + VICE));
    esigi(sP.stato === 403 && /Non sei abilitato alla sezione Eventi/.test(sP.corpo.msg), 'un altro ruolo non abilitato: 403', JSON.stringify(sP).slice(0, 200));
    esigi(sA.stato !== 403 && sA.stato !== 401 && sA.stato !== 500, 'l\'amministratore passa la porta', JSON.stringify(sA).slice(0, 200));
    esigi(uguali(sV, sA), 'il vice riceve la stessa risposta dell\'amministratore', JSON.stringify(sV).slice(0, 200));

    // ------------------------------------------------------------
    console.log('\nSblocco del calcolo: ritirare la richiesta di un altro');
    const richiesta = () => {
        scenario();
        dati.set('sbloccoIncarichi/gettone1', { incaricoId: 'i1', stato: 'attesa', richiedenteEmail: 'qualcuno@esempio.it', cliente: 'Alfa Srl' });
        dati.set('archivio/incarichi', { json: JSON.stringify([{ id: 'i1', cliente: 'Alfa Srl', sbloccoRichiesto: { da: 'qualcuno@esempio.it' } }]) });
    };
    const ritira = t => chiama(SBLOCCO, { azione: 'annulla', idToken: t, incaricoId: 'i1' });
    richiesta();
    const rP = await ritira('token-' + ALTRO);
    esigi(rP.stato === 403 && dati.get('sbloccoIncarichi/gettone1').stato === 'attesa', 'un altro ruolo non puo\' ritirare la richiesta di qualcun altro', JSON.stringify(rP));
    richiesta();
    const rA = await ritira('token-' + ADMIN);
    esigi(rA.stato === 200 && dati.get('sbloccoIncarichi/gettone1').stato === 'annullata', 'l\'amministratore si\'', JSON.stringify(rA));
    richiesta();
    const rV = await ritira('token-' + VICE);
    const dopo = dati.get('sbloccoIncarichi/gettone1');
    esigi(rV.stato === 200 && dopo.stato === 'annullata' && dopo.annullataDa === VICE, 'e anche il vice: la richiesta risulta ritirata da lui', JSON.stringify(rV) + ' ' + JSON.stringify(dopo));
    esigi(!JSON.parse(dati.get('archivio/incarichi').json)[0].sbloccoRichiesto, 'e l\'incarico non resta in attesa');

    // ------------------------------------------------------------
    console.log('\nI tre posti restano allineati: app, regole Firestore, servizio');
    const APP = fs.readFileSync(path.join(RADICE, '..', 'area-riservata', 'app.js'), 'utf8');
    const REGOLE = fs.readFileSync(path.join(RADICE, '..', 'area-riservata', 'FIREBASE-SETUP.md'), 'utf8');
    const idApp = (/const RUOLO_VICE_ADMIN = '([^']+)';/.exec(APP) || [])[1];
    esigi(idApp === UE.RUOLO_VICE_ADMIN, 'l\'app usa lo stesso identificativo del servizio', String(idApp));
    function ritaglia(apertura) {
        const inizio = APP.indexOf(apertura);
        if (inizio < 0) throw new Error('non trovato in app.js: ' + apertura);
        let i = APP.indexOf('{', inizio), aperte = 0;
        for (; i < APP.length; i++) {
            if (APP[i] === '{') aperte++;
            else if (APP[i] === '}') { aperte--; if (!aperte) return APP.slice(inizio, i + 1); }
        }
        throw new Error('chiusura non trovata per: ' + apertura);
    }
    // le funzioni VERE dell'app, con le loro costanti
    const app = new Function(
        'const PROPRIETARIO = "a.missori@emvas.tax";'
        + 'const RUOLO_VICE_ADMIN = ' + JSON.stringify(idApp) + ';'
        + 'const RUOLO_COLLABORATORE = "collaboratore";'
        + 'const RUOLI_SOND = { compila: "sondaggio_compila", risultati: "sondaggio_risultati" };'
        + ritaglia('function eRuoloAdmin(') + ritaglia('function eRuoloCollaboratore(') + ritaglia('function eRuoloSoloSondaggio(')
        + ritaglia('function puoAvereCollaboratori(')
        + 'return { eRuoloAdmin: eRuoloAdmin, puoAvereCollaboratori: puoAvereCollaboratori };')();
    const ruoliProva = ['admin', 'viceadmin', 'procuratore', 'qualita', 'coordinatore', 'marketing', 'collaboratore', '', 'Admin', 'vice-admin'];
    esigi(ruoliProva.every(r => app.eRuoloAdmin(r) === UE.eRuoloAdmin(r)), 'eRuoloAdmin dell\'app risponde come quella del servizio, ruolo per ruolo');
    esigi(!app.puoAvereCollaboratori({ ruolo: 'viceadmin', attivo: true, email: VICE }) && !app.puoAvereCollaboratori({ ruolo: 'admin', attivo: true, email: ADMIN })
        && app.puoAvereCollaboratori({ ruolo: 'procuratore', attivo: true, email: ALTRO }), 'nell\'app il vice, come l\'amministratore, non puo\' avere collaboratori');
    esigi(/eAdmin\(\) \{ return this\.utenteCorrente && eRuoloAdmin\(this\.utenteCorrente\.ruolo\); \}/.test(APP), 'nell\'app "e\' amministratore?" passa da eRuoloAdmin');
    esigi(/function admin\(\) \{\s*return abilitato\(\) && ruoloUtente\(\) in \['admin', 'viceadmin'\];\s*\}/.test(REGOLE), 'nelle regole Firestore admin() accetta amministratore e vice');
    esigi(/get\('ruolo', ''\) in \['admin', 'viceadmin', 'collaboratore', 'sondaggio_compila', 'sondaggio_risultati'\]/.test(REGOLE), 'e un collaboratore non puo\' avere per riferimento un vice amministratore');
    esigi(!/ruoloUtente\(\) == 'admin'/.test(REGOLE), 'nelle regole non resta un confronto con il solo \'admin\'');
    // nel servizio il confronto a mano con 'admin' non deve tornare: taglierebbe fuori il vice
    const aMano = [];
    ['api', 'lib'].forEach(cartella => fs.readdirSync(path.join(RADICE, cartella)).filter(f => /\.js$/.test(f)).forEach(f => {
        if (cartella === 'lib' && f === 'utente-effettivo.js') return;
        fs.readFileSync(path.join(RADICE, cartella, f), 'utf8').split('\n').forEach((riga, n) => {
            if (/[!=]==?\s*'admin'|'admin'\s*[!=]==?/.test(riga)) aMano.push(cartella + '/' + f + ':' + (n + 1));
        });
    }));
    esigi(aMano.length === 0, 'nel servizio nessuno confronta il ruolo con \'admin\' a mano: si chiede a eRuoloAdmin', aMano.join(', '));

    console.log('\n' + ok + ' verde, ' + ko + ' ROSSO');
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
