/* ============================================================
   ANTEPRIMA - firebase-admin finto, per il codice VERO del servizio
   ------------------------------------------------------------
   Prende il posto di email-service/lib/diretta-firebase.js (esbuild
   lo sostituisce): contesto() restituisce lo stesso oggetto
   { db, auth, FieldValue, FieldPath, Timestamp, adesso, emulatore },
   ma db e auth lavorano sull'archivio dell'anteprima.

   Firestore: collection/doc, get/set/update/create/delete, where,
   limit, startAfter (un documento: si riparte dopo il suo id, come fa
   Firestore senza orderBy), select, count, getAll, batch, runTransaction (ottimistica:
   se un documento letto cambia prima del commit si riprova, come
   fa Firestore quando c'e' contesa), precondizioni lastUpdateTime.
   Auth: createUser, updateUser, getUser, getUserByEmail,
   setCustomUserClaims, revokeRefreshTokens, createCustomToken,
   verifyIdToken, generatePasswordResetLink; e la verifica della
   password che il servizio chiede a Google (Identity Toolkit).
   Le password degli account di prova stanno nell'archivio solo come
   impronta (SHA-256 con sale), come farebbe Firebase.
   ============================================================ */
'use strict';
const A = require('./archivio');
const { sha256 } = require('./shim-crypto');
const { Buffer } = require('./shim-globali');

let archivio = null;
function usa(a) { archivio = a; }

const attesa = () => new Promise(r => setTimeout(r, Math.floor(Math.random() * 3)));

function erroreFirestore(codice, nome, messaggio) {
    const e = new Error(nome + ': ' + messaggio);
    e.code = codice;
    e.details = messaggio;
    return e;
}

/* ============================================================
   FIRESTORE
   ============================================================ */
class DocumentSnapshot {
    constructor(ref, rec) {
        this.ref = ref;
        this.id = ref.id;
        this.exists = !!(rec && rec.dati);
        this._dati = this.exists ? A.clona(rec.dati) : undefined;
        this.createTime = this.exists ? A.Timestamp.fromMillis(rec.creato) : undefined;
        this.updateTime = this.exists ? A.Timestamp.fromMillis(rec.aggiornato) : undefined;
        this.readTime = A.Timestamp.now();
    }
    data() { return this._dati === undefined ? undefined : A.clona(this._dati); }
    get(campo) { return this.exists ? A.clona(A.valoreCampo(this._dati, this.id, campo)) : undefined; }
}

class QuerySnapshot {
    constructor(docs) { this.docs = docs; this.size = docs.length; this.empty = docs.length === 0; this.readTime = A.Timestamp.now(); }
    forEach(fn) { this.docs.forEach(fn); }
}

class Query {
    constructor(db, collezione, filtri, limite, dopo) {
        this.firestore = db;
        this._collezione = collezione;
        this._filtri = filtri || [];
        this._limite = limite == null ? null : limite;
        this._dopo = dopo == null ? null : dopo;
    }
    where(campo, op, valore) {
        if (campo && typeof campo === 'object' && !(campo instanceof A.FieldPath) && !Array.isArray(campo.segmenti)) throw new Error('filtri composti non previsti nell\'anteprima');
        return new Query(this.firestore, this._collezione, this._filtri.concat([{ campo, op, valore }]), this._limite, this._dopo);
    }
    limit(n) { return new Query(this.firestore, this._collezione, this._filtri, n, this._dopo); }
    // l'ordine e' quello degli id (archivio.elenco): si riparte dal documento dopo quello dato
    startAfter(documento) { return new Query(this.firestore, this._collezione, this._filtri, this._limite, String((documento && documento.id) || documento || '')); }
    select() { return this; }
    orderBy() { return this; }
    count() {
        const q = this;
        return { get: async () => { const s = await q.get(); return { data: () => ({ count: s.size }) }; } };
    }
    _esegui() {
        let righe = archivio.elenco(this._collezione).filter(r => (this._dopo == null || r.id > this._dopo)
            && this._filtri.every(f => A.soddisfa(A.valoreCampo(r.rec.dati, r.id, f.campo), f.op, f.valore)));
        if (this._limite != null) righe = righe.slice(0, this._limite);
        return new QuerySnapshot(righe.map(r => new DocumentSnapshot(this.firestore.collection(this._collezione).doc(r.id), r.rec)));
    }
    async get() { await attesa(); return this._esegui(); }
}

class CollectionReference extends Query {
    constructor(db, percorso) {
        super(db, percorso);
        this.id = percorso.split('/').pop();
        this.path = percorso;
    }
    doc(id) {
        if (id === undefined) id = idCasuale();
        return new DocumentReference(this.firestore, this.path + '/' + String(id));
    }
    async add(dati) { const r = this.doc(); await r.set(dati); return r; }
}

function idCasuale() {
    const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    const a = new Uint8Array(20);
    globalThis.crypto.getRandomValues(a);
    a.forEach(b => { s += c[b % c.length]; });
    return s;
}

class DocumentReference {
    constructor(db, percorso) {
        this.firestore = db;
        this.path = percorso;
        this.id = percorso.split('/').pop();
    }
    get parent() { return new CollectionReference(this.firestore, this.path.split('/').slice(0, -1).join('/')); }
    collection(nome) { return new CollectionReference(this.firestore, this.path + '/' + nome); }
    isEqual(o) { return !!o && o.path === this.path; }
    async get() { await attesa(); return new DocumentSnapshot(this, archivio.leggi(this.path)); }
    async set(dati, opz) { await attesa(); applica([operazione('set', this, [dati, opz])]); return risultatoScrittura(); }
    async update(...argomenti) { await attesa(); applica([operazione('update', this, argomenti)]); return risultatoScrittura(); }
    async create(dati) { await attesa(); applica([operazione('create', this, [dati])]); return risultatoScrittura(); }
    async delete(pre) { await attesa(); applica([operazione('delete', this, [pre])]); return risultatoScrittura(); }
}
function risultatoScrittura() { return { writeTime: A.Timestamp.now() }; }

/* ---------------- le scritture ---------------- */
function operazione(tipo, ref, argomenti) { return { tipo, ref, argomenti }; }

function ePrecondizione(x) {
    return !!x && typeof x === 'object' && !(x instanceof A.FieldPath) && !Array.isArray(x)
        && Object.keys(x).length > 0 && Object.keys(x).every(k => k === 'lastUpdateTime' || k === 'exists');
}

// il campo della update: coppie (campo, valore) oppure un oggetto con i percorsi a punti
function coppieUpdate(argomenti) {
    const args = argomenti.slice();
    let pre = null;
    if (A.eOggettoSemplice(args[0]) && !(args[0] instanceof A.FieldPath) && !Array.isArray(args[0].segmenti)) {
        if (args[1]) pre = args[1];
        return { coppie: Object.keys(args[0]).map(k => [k.split('.'), args[0][k]]), pre };
    }
    if (args.length % 2 === 1 && ePrecondizione(args[args.length - 1])) pre = args.pop();
    const coppie = [];
    for (let i = 0; i < args.length; i += 2) coppie.push([A.segmentiDi(args[i]), args[i + 1]]);
    return { coppie, pre };
}

function controllaPrecondizione(pre, rec, percorso) {
    if (!pre) return;
    if (pre.exists === true && !rec) throw erroreFirestore(5, 'NOT_FOUND', 'No document to update: ' + percorso);
    if (pre.exists === false && rec) throw erroreFirestore(6, 'ALREADY_EXISTS', 'Document already exists: ' + percorso);
    if (pre.lastUpdateTime) {
        const atteso = typeof pre.lastUpdateTime.toMillis === 'function' ? pre.lastUpdateTime.toMillis() : Number(pre.lastUpdateTime);
        if (!rec || rec.aggiornato !== atteso) throw erroreFirestore(9, 'FAILED_PRECONDITION', 'the stored version does not match the required base version');
    }
}

/* Calcola il nuovo contenuto di ogni documento e scrive tutto insieme:
   o tutte le scritture, o nessuna (batch e transazioni). */
function applica(ops) {
    const ora = Date.now();
    const nuovi = new Map();
    ops.forEach(op => {
        const p = op.ref.path;
        const attuale = nuovi.has(p) ? nuovi.get(p) : (archivio.leggi(p) ? { dati: archivio.leggi(p).dati, rec: archivio.leggi(p) } : null);
        let dati = attuale ? attuale.dati : null;
        if (op.tipo === 'set') {
            const [d, opz] = op.argomenti;
            if (opz && (opz.merge || opz.mergeFields)) dati = A.fondi(dati || {}, A.clona(d) || {}, ora);
            else dati = A.risolvi(A.clona(d) || {}, undefined, ora);
        } else if (op.tipo === 'create') {
            if (dati) throw erroreFirestore(6, 'ALREADY_EXISTS', 'Document already exists: ' + p);
            dati = A.risolvi(A.clona(op.argomenti[0]) || {}, undefined, ora);
        } else if (op.tipo === 'update') {
            const { coppie, pre } = coppieUpdate(op.argomenti);
            if (!dati) throw erroreFirestore(5, 'NOT_FOUND', 'No document to update: ' + p);
            controllaPrecondizione(pre, attuale && attuale.rec, p);
            coppie.forEach(([seg, v]) => { dati = A.applicaPercorso(dati, seg, A.clona(v), ora); });
        } else if (op.tipo === 'delete') {
            controllaPrecondizione(op.argomenti[0], attuale && attuale.rec, p);
            dati = null;
        }
        nuovi.set(p, { dati, rec: attuale && attuale.rec });
    });
    nuovi.forEach((v, p) => archivio.scrivi(p, v.dati, ora));
}

class WriteBatch {
    constructor() { this.ops = []; }
    set(ref, dati, opz) { this.ops.push(operazione('set', ref, [dati, opz])); return this; }
    update(ref, ...argomenti) { this.ops.push(operazione('update', ref, argomenti)); return this; }
    create(ref, dati) { this.ops.push(operazione('create', ref, [dati])); return this; }
    delete(ref, pre) { this.ops.push(operazione('delete', ref, [pre])); return this; }
    async commit() { await attesa(); applica(this.ops); return this.ops.map(risultatoScrittura); }
}

class Transaction extends WriteBatch {
    constructor() { super(); this.letti = new Map(); }
    _ricorda(p) { if (!this.letti.has(p)) this.letti.set(p, archivio.versione(p)); }
    async get(x) {
        await attesa();
        if (x instanceof DocumentReference) { this._ricorda(x.path); return new DocumentSnapshot(x, archivio.leggi(x.path)); }
        const s = x._esegui();
        s.docs.forEach(d => this._ricorda(d.ref.path));
        return s;
    }
    async getAll(...refs) {
        await attesa();
        return refs.filter(r => r instanceof DocumentReference).map(r => { this._ricorda(r.path); return new DocumentSnapshot(r, archivio.leggi(r.path)); });
    }
}

class Firestore {
    collection(nome) { return new CollectionReference(this, nome); }
    doc(percorso) { return new DocumentReference(this, percorso); }
    batch() { return new WriteBatch(); }
    settings() { /* ignoreUndefinedProperties: sempre, qui */ }
    async getAll(...refs) {
        await attesa();
        return refs.filter(r => r instanceof DocumentReference).map(r => new DocumentSnapshot(r, archivio.leggi(r.path)));
    }
    async runTransaction(fn) {
        for (let tentativo = 0; tentativo < 8; tentativo++) {
            const tx = new Transaction();
            const risultato = await fn(tx);
            // tra le letture e il commit non deve essere cambiato niente di quello che si e' letto
            let cambiato = false;
            tx.letti.forEach((v, p) => { if (archivio.versione(p) !== v) cambiato = true; });
            if (!cambiato) { applica(tx.ops); return risultato; }
            await new Promise(r => setTimeout(r, 5 + Math.random() * 20 * (tentativo + 1)));
        }
        throw erroreFirestore(10, 'ABORTED', 'Too much contention on these documents. Please try again.');
    }
}

/* ============================================================
   AUTH
   ============================================================ */
function erroreAuth(codice, messaggio) {
    const e = new Error(messaggio || codice);
    e.code = codice;
    e.errorInfo = { code: codice, message: e.message };
    return e;
}

function impronta(password, sale) {
    return Buffer.from(sha256(new TextEncoder().encode(sale + ':' + password))).toString('hex');
}
function casuale(n) {
    const a = new Uint8Array(n);
    globalThis.crypto.getRandomValues(a);
    return Buffer.from(a).toString('hex');
}

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
function creaJwt(contenuto) { return b64url({ alg: 'none', typ: 'JWT', kid: 'anteprima' }) + '.' + b64url(contenuto) + '.anteprima'; }
function leggiJwt(t) {
    try { return JSON.parse(Buffer.from(String(t || '').split('.')[1] || '', 'base64url').toString('utf8')); } catch (e) { return null; }
}

function perEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    let trovato = null;
    archivio.utenti.forEach(u => { if (u.email === e) trovato = u; });
    return trovato;
}

function record(u) {
    return {
        uid: u.uid, email: u.email, emailVerified: !!u.emailVerified, disabled: !!u.disabled,
        displayName: u.displayName || undefined,
        customClaims: u.customClaims ? JSON.parse(JSON.stringify(u.customClaims)) : undefined,
        tokensValidAfterTime: u.validiDopo ? new Date(u.validiDopo).toUTCString() : undefined,
        metadata: { creationTime: new Date(u.creato).toUTCString(), lastSignInTime: u.ultimoAccesso ? new Date(u.ultimoAccesso).toUTCString() : null },
        providerData: [{ providerId: 'password', uid: u.email, email: u.email }]
    };
}

function salvaUtente(u) { archivio.utenti.set(u.uid, u); archivio.salvaPiuTardi(); }

function impostaPassword(u, password) {
    u.sale = casuale(8);
    u.hash = impronta(password, u.sale);
}

/* Il token d'identita' (ID token) dell'anteprima: stessa forma di un JWT
   di Firebase (il servizio ne legge il contenuto), firma finta. */
function tokenIdentita(u, provider, authTime) {
    const ora = Math.floor(Date.now() / 1000);
    return creaJwt(Object.assign({}, u.customClaims || {}, {
        iss: 'https://securetoken.google.com/ngb-eventi', aud: 'ngb-eventi',
        auth_time: Math.floor((authTime || Date.now()) / 1000), user_id: u.uid, sub: u.uid,
        iat: ora, exp: ora + 3600, email: u.email, email_verified: !!u.emailVerified,
        firebase: { sign_in_provider: provider || 'password', identities: {} }
    }));
}

const auth = {
    async createUser(p) {
        await attesa();
        const email = String(p.email || '').trim().toLowerCase();
        const uid = p.uid ? String(p.uid) : idCasuale().slice(0, 28);
        if (archivio.utenti.has(uid)) throw erroreAuth('auth/uid-already-exists', 'The user with the provided uid already exists.');
        if (email && perEmail(email)) throw erroreAuth('auth/email-already-exists', 'The email address is already in use by another account.');
        const u = { uid, email, emailVerified: !!p.emailVerified, disabled: !!p.disabled, displayName: p.displayName || '', customClaims: null, creato: Date.now(), validiDopo: Date.now() - 1000 };
        if (p.password) impostaPassword(u, p.password);
        salvaUtente(u);
        return record(u);
    },
    async updateUser(uid, p) {
        await attesa();
        const u = archivio.utenti.get(String(uid));
        if (!u) throw erroreAuth('auth/user-not-found', 'There is no user record corresponding to the provided identifier.');
        if (p.email !== undefined) {
            const e = String(p.email || '').trim().toLowerCase();
            const altro = perEmail(e);
            if (altro && altro.uid !== u.uid) throw erroreAuth('auth/email-already-exists', 'The email address is already in use by another account.');
            u.email = e;
        }
        if (p.password !== undefined) { impostaPassword(u, p.password); u.validiDopo = Date.now(); }
        if (p.emailVerified !== undefined) u.emailVerified = !!p.emailVerified;
        if (p.disabled !== undefined) u.disabled = !!p.disabled;
        if (p.displayName !== undefined) u.displayName = p.displayName || '';
        salvaUtente(u);
        return record(u);
    },
    async getUser(uid) {
        await attesa();
        const u = archivio.utenti.get(String(uid));
        if (!u) throw erroreAuth('auth/user-not-found', 'There is no user record corresponding to the provided identifier.');
        return record(u);
    },
    async getUserByEmail(email) {
        await attesa();
        const u = perEmail(email);
        if (!u) throw erroreAuth('auth/user-not-found', 'There is no user record corresponding to the provided identifier.');
        return record(u);
    },
    async setCustomUserClaims(uid, claims) {
        await attesa();
        const u = archivio.utenti.get(String(uid));
        if (!u) throw erroreAuth('auth/user-not-found', 'There is no user record corresponding to the provided identifier.');
        u.customClaims = claims ? JSON.parse(JSON.stringify(claims)) : null;
        salvaUtente(u);
    },
    async revokeRefreshTokens(uid) {
        await attesa();
        const u = archivio.utenti.get(String(uid));
        if (!u) throw erroreAuth('auth/user-not-found', 'There is no user record corresponding to the provided identifier.');
        u.validiDopo = Math.floor(Date.now() / 1000) * 1000;
        salvaUtente(u);
    },
    async createCustomToken(uid, claims) {
        await attesa();
        return creaJwt({ tipo: 'custom', uid: String(uid), claims: claims || null, iat: Math.floor(Date.now() / 1000) });
    },
    async verifyIdToken(token, controllaRevoca) {
        await attesa();
        const t = leggiJwt(token);
        if (!t || !t.sub || !t.exp) throw erroreAuth('auth/argument-error', 'Decoding Firebase ID token failed. Make sure you passed the entire string JWT which represents an ID token.');
        if (t.exp * 1000 < Date.now()) throw erroreAuth('auth/id-token-expired', 'Firebase ID token has expired.');
        const u = archivio.utenti.get(t.sub);
        if (controllaRevoca) {
            if (!u) throw erroreAuth('auth/user-not-found', 'There is no user record corresponding to the provided identifier.');
            if (u.disabled) throw erroreAuth('auth/user-disabled', 'The user record is disabled.');
            if (u.validiDopo && t.auth_time * 1000 < u.validiDopo - 999) throw erroreAuth('auth/id-token-revoked', 'The Firebase ID token has been revoked.');
        }
        return Object.assign({}, t, { uid: t.sub });
    },
    async generatePasswordResetLink(email) {
        await attesa();
        const u = perEmail(email);
        if (!u) throw erroreAuth('auth/email-not-found', 'There is no user record corresponding to the provided email.');
        const codice = casuale(16);
        archivio.codici.set(codice, { uid: u.uid, scade: Date.now() + 3600000, usato: false });
        archivio.salvaPiuTardi();
        return 'https://ngb-eventi.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=' + codice + '&apiKey=anteprima&lang=it';
    }
};

/* La verifica della password che il servizio chiede a Google
   (accounts:signInWithPassword di Identity Toolkit), con le stesse
   risposte: 200 con localId e idToken, oppure 400 con il codice. */
function verificaPasswordGoogle(corpo) {
    const u = perEmail(corpo && corpo.email);
    const giusta = !!(u && u.hash && impronta(String((corpo && corpo.password) || ''), u.sale) === u.hash);
    if (!giusta) return { stato: 400, json: { error: { code: 400, message: 'INVALID_LOGIN_CREDENTIALS' } } };
    if (u.disabled) return { stato: 400, json: { error: { code: 400, message: 'USER_DISABLED' } } };
    u.ultimoAccesso = Date.now();
    salvaUtente(u);
    return { stato: 200, json: { localId: u.uid, email: u.email, idToken: tokenIdentita(u, 'password'), registered: true } };
}

/* ============================================================
   IL CONTESTO (al posto di lib/diretta-firebase.js)
   ============================================================ */
const db = new Firestore();
function contesto() {
    return {
        admin: null, app: { name: 'diretta' }, db, auth,
        FieldValue: A.FieldValue, FieldPath: A.FieldPath, Timestamp: A.Timestamp,
        adesso: () => Date.now(),
        emulatore: true
    };
}
function appDiretta() { return contesto().app; }
function inEmulatore() { return true; }
function leggiChiave() { return {}; }
function controllaProgetto() { /* nell'anteprima non c'e' nessuna chiave */ }

module.exports = {
    usa, contesto, appDiretta, inEmulatore, leggiChiave, controllaProgetto, NOME_APP: 'diretta',
    // per il resto dell'anteprima
    db, auth, perEmail, impronta, impostaPassword, salvaUtente, tokenIdentita, leggiJwt, creaJwt, verificaPasswordGoogle, erroreAuth, record
};
