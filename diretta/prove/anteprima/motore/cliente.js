/* ============================================================
   ANTEPRIMA - l'SDK di Firebase del browser, finto
   ------------------------------------------------------------
   Le pagine vere (diretta.js, gestione.js) caricano con import() i
   moduli firebase-app, firebase-auth e firebase-firestore. Nell'anteprima
   quei moduli (anteprima/sdk/*.js) passano tutto a questo file, che
   lavora sullo stesso archivio del servizio.

   Accesso: ogni "dispositivo" dell'anteprima (il telefono del
   partecipante, il computer della regia...) ha la SUA sessione, come
   due browser diversi. La sessione resta anche ricaricando.

   Firestore: getDoc, onSnapshot, setDoc, updateDoc con le REGOLE VERE
   di diretta/firebase/firestore.rules riscritte in JavaScript: un
   partecipante legge solo il suo profilo e il suo evento (e solo se
   l'account e' attivo), le presenze si scrivono solo nelle due forme
   previste, non piu' di una ogni 50 secondi, e il minuto in piu'
   vale solo se l'evento e' in onda.
   ============================================================ */
'use strict';
const A = require('./archivio');
const adm = require('./admin');

let archivio = null;
function usa(a) { archivio = a; ripristinaSessioni(); }

const ritardo = (min, max) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)));

function erroreFirebase(codice, messaggio) {
    const e = new Error(messaggio || codice);
    e.code = codice;
    e.name = 'FirebaseError';
    return e;
}

/* ============================================================
   ACCESSO (firebase/auth)
   ============================================================ */
const CHIAVE_SESSIONI = 'ngbAnteprimaSessioni.v1';
const sessioni = new Map();      // dispositivo -> { uid, provider, authTime, extra, token, scade }
const osservatori = new Map();   // dispositivo -> Set(fn)
const utentiInCache = new Map(); // dispositivo -> oggetto utente (stesso oggetto finche' non cambia la sessione)

function salvaSessioni() {
    try {
        const o = {};
        sessioni.forEach((s, d) => { o[d] = s; });
        sessionStorage.setItem(CHIAVE_SESSIONI, JSON.stringify(o));
    } catch (e) { /* senza sessionStorage le sessioni durano quanto la pagina */ }
}
function ripristinaSessioni() {
    try {
        const o = JSON.parse(sessionStorage.getItem(CHIAVE_SESSIONI) || '{}');
        Object.keys(o).forEach(d => { if (archivio.utenti.has(o[d].uid)) sessioni.set(d, o[d]); });
    } catch (e) { /* niente da ripristinare */ }
}

function avvisaOsservatori(dispositivo) {
    utentiInCache.delete(dispositivo);
    const u = utenteDi(dispositivo);
    const s = osservatori.get(dispositivo);
    if (s) Array.from(s).forEach(o => setTimeout(() => { try { o.fn(u); } catch (e) { s.delete(o); } }, 0));
    salvaSessioni();
    // le regole dipendono da chi e' collegato: gli ascolti di quel dispositivo si ricontrollano
    ricontrollaAscolti(dispositivo);
}

function apriSessione(dispositivo, uid, provider, extra) {
    sessioni.set(dispositivo, { uid, provider, authTime: Date.now(), extra: extra || null, token: '', scade: 0 });
    avvisaOsservatori(dispositivo);
}
function chiudiSessione(dispositivo) {
    if (!sessioni.has(dispositivo)) return;
    sessioni.delete(dispositivo);
    avvisaOsservatori(dispositivo);
}

/* Il token si rinnova quando lo si chiede (force) o quando sta per
   scadere: e' li' che un account disattivato, o con la password
   cambiata, viene scollegato, come con Firebase. */
async function ottieniToken(dispositivo, forza) {
    const s = sessioni.get(dispositivo);
    if (!s) throw erroreFirebase('auth/no-current-user', 'Nessun utente collegato.');
    if (!forza && s.token && s.scade - Date.now() > 5 * 60000) return s;
    await ritardo(30, 90);
    const u = archivio.utenti.get(s.uid);
    if (!u) { chiudiSessione(dispositivo); throw erroreFirebase('auth/user-token-expired', 'Firebase: Error (auth/user-token-expired).'); }
    if (u.disabled) { chiudiSessione(dispositivo); throw erroreFirebase('auth/user-disabled', 'Firebase: Error (auth/user-disabled).'); }
    if (u.validiDopo && s.authTime < u.validiDopo - 999) { chiudiSessione(dispositivo); throw erroreFirebase('auth/user-token-expired', 'Firebase: Error (auth/user-token-expired).'); }
    const conExtra = Object.assign({}, u, { customClaims: Object.assign({}, s.extra || {}, u.customClaims || {}) });
    s.token = adm.tokenIdentita(conExtra, s.provider, s.authTime);
    s.scade = Date.now() + 3600000;
    salvaSessioni();
    return s;
}

function utenteDi(dispositivo) {
    const s = sessioni.get(dispositivo);
    if (!s) return null;
    if (utentiInCache.has(dispositivo)) return utentiInCache.get(dispositivo);
    const u = archivio.utenti.get(s.uid) || {};
    const utente = {
        uid: s.uid, email: u.email || null, emailVerified: !!u.emailVerified, isAnonymous: false,
        displayName: u.displayName || null, providerId: 'firebase',
        async getIdToken(forza) { return (await ottieniToken(dispositivo, !!forza)).token; },
        async getIdTokenResult(forza) {
            const t = await ottieniToken(dispositivo, !!forza);
            const claims = adm.leggiJwt(t.token) || {};
            return {
                token: t.token, claims: claims, signInProvider: s.provider,
                authTime: new Date(t.authTime).toUTCString(), issuedAtTime: new Date().toUTCString(),
                expirationTime: new Date(t.scade).toUTCString()
            };
        },
        async reload() { /* niente */ },
        toJSON() { return { uid: s.uid, email: u.email }; }
    };
    utentiInCache.set(dispositivo, utente);
    return utente;
}

function creaAuth(app) {
    const dispositivo = (app && app._dispositivo) || 'questo';
    const auth = {
        app: app, name: app && app.name, languageCode: 'it', _dispositivo: dispositivo,
        get currentUser() { return utenteDi(dispositivo); },
        setPersistence: async () => {},
        useDeviceLanguage() {}
    };
    if (app) app._auth = auth;
    return auth;
}

function onAuthStateChanged(auth, fn, errore) {
    const d = auth._dispositivo;
    const cb = typeof fn === 'function' ? fn : (fn && fn.next ? fn.next.bind(fn) : () => {});
    if (!osservatori.has(d)) osservatori.set(d, new Set());
    const o = { fn: cb, finestra: auth.app && auth.app._finestra };
    osservatori.get(d).add(o);
    // come l'SDK: la prima chiamata arriva dopo aver riletto la sessione salvata
    setTimeout(() => { try { cb(utenteDi(d)); } catch (e) { /* pagina chiusa */ } }, 30);
    return () => { const s = osservatori.get(d); if (s) s.delete(o); };
}

async function signInWithCustomToken(auth, token) {
    await ritardo(80, 200);
    const t = adm.leggiJwt(token);
    if (!t || t.tipo !== 'custom' || !t.uid) throw erroreFirebase('auth/invalid-custom-token', 'Firebase: Error (auth/invalid-custom-token).');
    const u = archivio.utenti.get(t.uid);
    if (!u) throw erroreFirebase('auth/user-not-found', 'Firebase: Error (auth/user-not-found).');
    if (u.disabled) throw erroreFirebase('auth/user-disabled', 'Firebase: Error (auth/user-disabled).');
    apriSessione(auth._dispositivo, t.uid, 'custom', t.claims);
    await ottieniToken(auth._dispositivo, true);
    return { user: utenteDi(auth._dispositivo), providerId: null, operationType: 'signIn' };
}

async function signInWithEmailAndPassword(auth, email, password) {
    await ritardo(150, 350);
    const u = adm.perEmail(email);
    const giusta = !!(u && u.hash && adm.impronta(String(password || ''), u.sale) === u.hash);
    if (!giusta) throw erroreFirebase('auth/invalid-credential', 'Firebase: Error (auth/invalid-credential).');
    if (u.disabled) throw erroreFirebase('auth/user-disabled', 'Firebase: Error (auth/user-disabled).');
    u.ultimoAccesso = Date.now();
    adm.salvaUtente(u);
    apriSessione(auth._dispositivo, u.uid, 'password', null);
    await ottieniToken(auth._dispositivo, true);
    return { user: utenteDi(auth._dispositivo), providerId: 'password', operationType: 'signIn' };
}

async function signOut(auth) {
    await ritardo(10, 40);
    chiudiSessione(auth._dispositivo);
}

function codiceValido(codice) {
    const c = archivio.codici.get(String(codice || ''));
    if (!c || c.usato) throw erroreFirebase('auth/invalid-action-code', 'Firebase: Error (auth/invalid-action-code).');
    if (c.scade < Date.now()) throw erroreFirebase('auth/expired-action-code', 'Firebase: Error (auth/expired-action-code).');
    const u = archivio.utenti.get(c.uid);
    if (!u) throw erroreFirebase('auth/user-not-found', 'Firebase: Error (auth/user-not-found).');
    return { c, u };
}
async function verifyPasswordResetCode(auth, codice) {
    await ritardo(80, 200);
    return codiceValido(codice).u.email;
}
async function confirmPasswordReset(auth, codice, password) {
    await ritardo(120, 300);
    const { c, u } = codiceValido(codice);
    if (String(password || '').length < 6) throw erroreFirebase('auth/weak-password', 'Firebase: Password should be at least 6 characters (auth/weak-password).');
    adm.impostaPassword(u, String(password));
    u.validiDopo = Date.now();
    u.emailVerified = true;
    adm.salvaUtente(u);
    c.usato = true;
    archivio.salvaPiuTardi();
}

/* ============================================================
   FIRESTORE (firebase/firestore) E LE REGOLE
   ============================================================ */
function negato() { return erroreFirebase('permission-denied', 'Missing or insufficient permissions.'); }

// chi scrive o legge, visto dalle regole: request.auth
function richiestaAuth(db) {
    const app = db && db._app;
    const d = (app && app._auth && app._auth._dispositivo) || (app && app._dispositivo);
    const s = d ? sessioni.get(d) : null;
    if (!s || !s.token) return null;
    const token = adm.leggiJwt(s.token) || {};
    return { uid: s.uid, token: token };
}
function daArchivio(percorso) { const r = archivio.leggi(percorso); return r ? r.dati : null; }

function iscrittoA(auth, idEvento) {
    return !!auth && Array.isArray(auth.token.eventi) && auth.token.eventi.indexOf(idEvento) >= 0;
}
function gestore(auth) { return !!auth && auth.token.gestore === true; }
function sessioneDi(auth) { return daArchivio('sessioni/' + auth.uid); }
function accountAttivo(auth) { const s = sessioneDi(auth); return !!s && s.stato === 'attivo'; }

function puoLeggere(auth, percorso) {
    const [coll, id] = percorso.split('/');
    if (!auth) return false;
    if (coll === 'eventi') return (iscrittoA(auth, id) && accountAttivo(auth)) || gestore(auth);
    if (coll === 'partecipanti') return auth.uid === id;
    return false;
}

const CAMPI_PRESENZA = ['uid', 'idEvento', 'primo', 'ultimo', 'secondi', 'collegamenti', 'sessione'];
function ms(v) { return v && typeof v.toMillis === 'function' ? v.toMillis() : NaN; }
function sessioneBenFatta(s) { return typeof s === 'string' && s.length > 0 && s.length <= 40; }
function sessioneValida(auth, id) {
    const s = sessioneDi(auth);
    return !!s && s.stato === 'attivo' && (s.sessioneAttiva == null || s.sessioneAttiva === id);
}
function inOnda(idEvento) { const e = daArchivio('eventi/' + idEvento); return !!e && e.stato === 'in_onda'; }

function puoScrivere(auth, percorso, prima, dopo, ora) {
    const [coll, id] = percorso.split('/');
    if (!auth || coll !== 'presenze' || !dopo) return false;
    const r = dopo;
    const chiavi = Object.keys(r);
    if (!prima) {
        return chiavi.every(k => CAMPI_PRESENZA.indexOf(k) >= 0) && CAMPI_PRESENZA.every(k => k in r)
            && r.uid === auth.uid && typeof r.idEvento === 'string'
            && id === r.idEvento + '_' + auth.uid
            && iscrittoA(auth, r.idEvento)
            && ms(r.primo) === ora && ms(r.ultimo) === ora
            && r.secondi === 0 && r.collegamenti === 1
            && sessioneBenFatta(r.sessione) && sessioneValida(auth, r.sessione);
    }
    const cambiati = new Set();
    new Set(Object.keys(prima).concat(chiavi)).forEach(k => { if (!A.uguali(prima[k], r[k])) cambiati.add(k); });
    const ultimoPrima = ms(prima.ultimo);
    return prima.uid === auth.uid
        && iscrittoA(auth, prima.idEvento)
        && Array.from(cambiati).every(k => ['ultimo', 'secondi', 'collegamenti', 'sessione'].indexOf(k) >= 0)
        && ms(r.ultimo) === ora
        && ora >= ultimoPrima + 50000
        && sessioneBenFatta(r.sessione)
        && (
            (r.collegamenti === prima.collegamenti && r.sessione === prima.sessione && ora <= ultimoPrima + 150000
                && (r.secondi === prima.secondi || (r.secondi === prima.secondi + 60 && ora >= ultimoPrima + 58000 && inOnda(prima.idEvento))))
            || (r.collegamenti === prima.collegamenti + 1 && r.secondi === prima.secondi)
        )
        && sessioneValida(auth, r.sessione);
}

/* ---------- riferimenti e istantanee ---------- */
function creaDb(app) { return { type: 'firestore', app: app, _app: app, toJSON() { return {}; } }; }
function doc(db, ...segmenti) {
    const percorso = segmenti.join('/').replace(/^\/+|\/+$/g, '');
    return { type: 'document', firestore: db, path: percorso, id: percorso.split('/').pop() };
}
function istantanea(ref, dati) {
    const copia = dati ? A.clona(dati) : undefined;
    return {
        id: ref.id, ref: ref,
        exists: () => copia !== undefined,
        data: () => (copia === undefined ? undefined : A.clona(copia)),
        get: campo => (copia === undefined ? undefined : A.clona(A.valoreCampo(copia, ref.id, campo))),
        metadata: { fromCache: false, hasPendingWrites: false, isEqual: () => false }
    };
}

async function getDoc(ref) {
    await ritardo(40, 120);
    if (!puoLeggere(richiestaAuth(ref.firestore), ref.path)) throw negato();
    return istantanea(ref, daArchivio(ref.path));
}

async function scrivi(ref, calcola) {
    await ritardo(40, 120);
    const ora = Date.now();
    const prima = daArchivio(ref.path);
    const dopo = calcola(prima, ora);
    if (!puoScrivere(richiestaAuth(ref.firestore), ref.path, prima, dopo, ora)) throw negato();
    archivio.scrivi(ref.path, dopo, ora);
}
function setDoc(ref, dati, opz) {
    return scrivi(ref, (prima, ora) => (opz && opz.merge)
        ? A.fondi(prima || {}, A.clona(dati) || {}, ora)
        : A.risolvi(A.clona(dati) || {}, undefined, ora));
}
function updateDoc(ref, dati) {
    return scrivi(ref, (prima, ora) => {
        if (!prima) throw erroreFirebase('not-found', 'No document to update: ' + ref.path);
        let d = prima;
        Object.keys(dati).forEach(k => { d = A.applicaPercorso(d, k.split('.'), A.clona(dati[k]), ora); });
        return d;
    });
}

/* ---------- l'ascolto continuo di un documento ---------- */
const ascolti = new Set();   // { ref, dispositivo, controlla() }

function onSnapshot(ref, ...resto) {
    let opz = null, succ, err;
    if (resto[0] && typeof resto[0] === 'object' && typeof resto[0].next !== 'function') opz = resto.shift();
    if (resto[0] && typeof resto[0] === 'object') { succ = resto[0].next && resto[0].next.bind(resto[0]); err = resto[0].error && resto[0].error.bind(resto[0]); }
    else { succ = resto[0]; err = resto[1]; }
    void opz;
    const app = ref.firestore && ref.firestore._app;
    const dispositivo = (app && app._auth && app._auth._dispositivo) || (app && app._dispositivo) || '';
    let chiuso = false;
    const togli = [];
    const ascolto = {
        dispositivo,
        finestra: app && app._finestra,
        ferma: () => ferma(),
        controlla(emetti) {
            if (chiuso) return;
            if (!puoLeggere(richiestaAuth(ref.firestore), ref.path)) {
                ferma();
                if (typeof err === 'function') { try { err(negato()); } catch (e) { /* pagina chiusa */ } }
                return;
            }
            if (emetti && typeof succ === 'function') {
                try { succ(istantanea(ref, daArchivio(ref.path))); } catch (e) { ferma(); }
            }
        }
    };
    function ferma() {
        if (chiuso) return;
        chiuso = true;
        togli.forEach(f => f());
        ascolti.delete(ascolto);
    }
    ascolti.add(ascolto);
    // il documento ascoltato, e quello che le regole rileggono (la sessione dell'account)
    togli.push(archivio.ascolta(ref.path, () => ascolto.controlla(true)));
    const auth = richiestaAuth(ref.firestore);
    if (auth) togli.push(archivio.ascolta('sessioni/' + auth.uid, () => ascolto.controlla(false)));
    setTimeout(() => ascolto.controlla(true), 60 + Math.random() * 120);
    return ferma;
}
/* Una pagina dell'anteprima si chiude o si ricarica: i suoi ascolti e
   i suoi osservatori dell'accesso smettono di esistere con lei. */
function dimenticaFinestra(finestra) {
    Array.from(ascolti).forEach(a => { if (a.finestra === finestra) a.ferma(); });
    osservatori.forEach(s => Array.from(s).forEach(o => { if (o.finestra === finestra) s.delete(o); }));
}
function ricontrollaAscolti(dispositivo) {
    Array.from(ascolti).forEach(a => { if (a.dispositivo === dispositivo) setTimeout(() => a.controlla(false), 0); });
}

module.exports = {
    usa, creaAuth, onAuthStateChanged, signInWithCustomToken, signInWithEmailAndPassword, signOut,
    verifyPasswordResetCode, confirmPasswordReset,
    creaDb, doc, getDoc, setDoc, updateDoc, onSnapshot,
    serverTimestamp: A.FieldValue.serverTimestamp, increment: A.FieldValue.increment,
    Timestamp: A.Timestamp,
    sessioni, chiudiSessione, utenteDi, dimenticaFinestra
};
