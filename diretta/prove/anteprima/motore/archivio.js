/* ============================================================
   ANTEPRIMA - l'archivio: i dati di Firestore e gli account, in memoria
   ------------------------------------------------------------
   Al posto del progetto Firebase "ngb-eventi", un archivio dentro la
   pagina dell'anteprima. Lo usano sia il servizio (come farebbe
   firebase-admin) sia le pagine (come farebbe l'SDK del browser):
   i documenti sono gli stessi, quindi quando la regia manda in onda
   l'evento, la pagina del partecipante lo vede subito.

   Qui ci sono i mattoni comuni: Timestamp, FieldValue, FieldPath, la
   copia dei valori, l'applicazione delle scritture (set, merge,
   update con i percorsi a punti), il confronto dei filtri delle
   query e la versione di ogni documento (per le transazioni). Tutto
   si salva nel browser (localStorage, se c'e'), cosi' ricaricando
   l'anteprima si ritrova quello che si era fatto.
   ============================================================ */
'use strict';

/* ---------------- Timestamp, FieldValue, FieldPath ---------------- */
class Timestamp {
    constructor(seconds, nanoseconds) {
        this.seconds = seconds;
        this.nanoseconds = nanoseconds || 0;
        Object.freeze(this);
    }
    static fromMillis(ms) {
        const s = Math.floor(ms / 1000);
        return new Timestamp(s, Math.round((ms - s * 1000) * 1e6));
    }
    static fromDate(d) { return Timestamp.fromMillis(d.getTime()); }
    static now() { return Timestamp.fromMillis(Date.now()); }
    toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
    toDate() { return new Date(this.toMillis()); }
    isEqual(o) { return !!o && o.seconds === this.seconds && o.nanoseconds === this.nanoseconds; }
    valueOf() { return String(this.seconds + 1e12).padStart(20, '0') + '.' + String(this.nanoseconds).padStart(9, '0'); }
    toJSON() { return { seconds: this.seconds, nanoseconds: this.nanoseconds }; }
    get _seconds() { return this.seconds; }
    get _nanoseconds() { return this.nanoseconds; }
}

class Sentinella {
    constructor(tipo, valore) { this.tipo = tipo; this.valore = valore; }
    isEqual(o) { return o instanceof Sentinella && o.tipo === this.tipo; }
}
const FieldValue = {
    serverTimestamp: () => new Sentinella('ora'),
    increment: n => new Sentinella('incr', Number(n)),
    arrayUnion: (...v) => new Sentinella('unisci', v),
    arrayRemove: (...v) => new Sentinella('togli', v),
    delete: () => new Sentinella('cancella')
};

class FieldPath {
    constructor(...segmenti) { this.segmenti = segmenti.map(String); }
    static documentId() { return ID_DOCUMENTO; }
    isEqual(o) { return o instanceof FieldPath && o.segmenti.join('\u0000') === this.segmenti.join('\u0000'); }
    toString() { return this.segmenti.join('.'); }
}
const ID_DOCUMENTO = new FieldPath('__name__');

function segmentiDi(campo) {
    if (campo instanceof FieldPath) return campo.segmenti;
    if (campo && Array.isArray(campo.segmenti)) return campo.segmenti;
    return String(campo).split('.');
}

/* ---------------- valori ---------------- */
// anche una Date nata in un'altra finestra (le pagine dell'anteprima sono iframe)
function eData(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
function eOggettoSemplice(v) {
    if (!v || typeof v !== 'object') return false;
    if (Array.isArray(v) || v instanceof Timestamp || v instanceof Sentinella || eData(v)) return false;
    if (typeof v.toMillis === 'function' && typeof v.seconds === 'number') return false;
    return true;
}

// copia profonda; le date diventano Timestamp; undefined si salta (ignoreUndefinedProperties)
function clona(v) {
    if (v === undefined) return undefined;
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Timestamp || v instanceof Sentinella) return v;
    if (typeof v.toMillis === 'function' && typeof v.seconds === 'number') return Timestamp.fromMillis(v.toMillis());
    if (eData(v)) return Timestamp.fromMillis(v.getTime());
    if (Array.isArray(v)) return v.filter(x => x !== undefined).map(clona);
    const o = {};
    Object.keys(v).forEach(k => { if (v[k] !== undefined) o[k] = clona(v[k]); });
    return o;
}

function uguali(a, b) {
    if (a === b) return true;
    if (a instanceof Timestamp || b instanceof Timestamp) return a instanceof Timestamp && a.isEqual(b);
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => uguali(x, b[i]));
    if (eOggettoSemplice(a) && eOggettoSemplice(b)) {
        const ka = Object.keys(a), kb = Object.keys(b);
        return ka.length === kb.length && ka.every(k => uguali(a[k], b[k]));
    }
    return false;
}

// il valore di una sentinella, dato quello che c'era prima e l'ora della scrittura
function risolvi(v, prima, ora) {
    if (v instanceof Sentinella) {
        switch (v.tipo) {
            case 'ora': return Timestamp.fromMillis(ora);
            case 'incr': return (typeof prima === 'number' ? prima : 0) + v.valore;
            case 'unisci': {
                const base = Array.isArray(prima) ? prima.slice() : [];
                v.valore.forEach(x => { if (!base.some(y => uguali(x, y))) base.push(clona(x)); });
                return base;
            }
            case 'togli': return (Array.isArray(prima) ? prima : []).filter(y => !v.valore.some(x => uguali(x, y)));
            default: return undefined;
        }
    }
    if (eOggettoSemplice(v)) {
        const o = {};
        Object.keys(v).forEach(k => {
            const r = risolvi(v[k], undefined, ora);
            if (r !== undefined && !(v[k] instanceof Sentinella && v[k].tipo === 'cancella')) o[k] = r;
        });
        return o;
    }
    if (Array.isArray(v)) return v.map(x => risolvi(x, undefined, ora));
    return clona(v);
}

// set con merge: gli oggetti si fondono, il resto si sostituisce
function fondi(base, nuovi, ora) {
    const out = eOggettoSemplice(base) ? Object.assign({}, base) : {};
    Object.keys(nuovi).forEach(k => {
        const v = nuovi[k];
        if (v === undefined) return;
        if (v instanceof Sentinella && v.tipo === 'cancella') { delete out[k]; return; }
        if (eOggettoSemplice(v)) { out[k] = fondi(out[k], v, ora); return; }
        out[k] = risolvi(v, out[k], ora);
    });
    return out;
}

// update: ogni campo e' un percorso (a punti o FieldPath); il valore sostituisce quello che c'era
function applicaPercorso(dati, segmenti, v, ora) {
    const radice = eOggettoSemplice(dati) ? Object.assign({}, dati) : {};
    let nodo = radice;
    for (let i = 0; i < segmenti.length - 1; i++) {
        const k = segmenti[i];
        nodo[k] = eOggettoSemplice(nodo[k]) ? Object.assign({}, nodo[k]) : {};
        nodo = nodo[k];
    }
    const ultimo = segmenti[segmenti.length - 1];
    if (v instanceof Sentinella && v.tipo === 'cancella') delete nodo[ultimo];
    else if (v !== undefined) nodo[ultimo] = risolvi(v, nodo[ultimo], ora);
    return radice;
}

function valoreCampo(dati, id, campo) {
    const seg = segmentiDi(campo);
    if (seg.length === 1 && seg[0] === '__name__') return id;
    let v = dati;
    for (const k of seg) {
        if (!eOggettoSemplice(v) || !(k in v)) return undefined;
        v = v[k];
    }
    return v;
}

function confrontabile(v) {
    if (v instanceof Timestamp || (v && typeof v.toMillis === 'function' && typeof v.seconds === 'number')) return { t: 'ts', v: v.toMillis() };
    if (typeof v === 'number') return { t: 'n', v: v };
    if (typeof v === 'string') return { t: 's', v: v };
    if (typeof v === 'boolean') return { t: 'b', v: v ? 1 : 0 };
    return null;
}
function soddisfa(valore, op, atteso) {
    switch (op) {
        case '==': return valore !== undefined && uguali(valore, atteso);
        case '!=': return valore !== undefined && !uguali(valore, atteso);
        case 'in': return valore !== undefined && (atteso || []).some(x => uguali(valore, x));
        case 'not-in': return valore !== undefined && !(atteso || []).some(x => uguali(valore, x));
        case 'array-contains': return Array.isArray(valore) && valore.some(x => uguali(x, atteso));
        case 'array-contains-any': return Array.isArray(valore) && valore.some(x => (atteso || []).some(y => uguali(x, y)));
        default: {
            const a = confrontabile(valore), b = confrontabile(atteso);
            if (!a || !b || a.t !== b.t) return false;
            if (op === '<') return a.v < b.v;
            if (op === '<=') return a.v <= b.v;
            if (op === '>') return a.v > b.v;
            if (op === '>=') return a.v >= b.v;
            return false;
        }
    }
}

/* ---------------- l'archivio ---------------- */
const CHIAVE_SALVATAGGIO = 'ngbAnteprimaDiretta.v5';   // v5: si entra con l'email (v4: tipo di player)

function inJson(v) {
    if (v instanceof Timestamp) return { __ts: v.toMillis() };
    if (Array.isArray(v)) return v.map(inJson);
    if (eOggettoSemplice(v)) { const o = {}; Object.keys(v).forEach(k => { o[k] = inJson(v[k]); }); return o; }
    return v;
}
function daJson(v) {
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v.__ts === 'number') return Timestamp.fromMillis(v.__ts);
    if (Array.isArray(v)) return v.map(daJson);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = daJson(v[k]); }); return o; }
    return v;
}

class Archivio {
    constructor() {
        this.documenti = new Map();   // percorso -> { dati, creato, aggiornato, versione }
        this.utenti = new Map();      // uid -> account (vedi admin.js)
        this.codici = new Map();      // codice di reimpostazione -> { uid, scade, usato }
        this.extra = {};              // la semina ci scrive quando e' stata fatta
        this.ascoltatori = new Map(); // percorso -> Set(fn)
        this.generali = new Set();    // fn(percorso) per ogni cambiamento
        this.timerSalva = null;
    }

    leggi(percorso) {
        const r = this.documenti.get(percorso);
        return r && r.dati ? r : null;
    }
    versione(percorso) {
        const r = this.documenti.get(percorso);
        return r ? r.versione : 0;
    }
    /* L'unica porta per cambiare un documento: nuovo contenuto (gia'
       risolto) oppure null per cancellarlo. */
    scrivi(percorso, dati, ora) {
        const prima = this.documenti.get(percorso);
        const t = ora || Date.now();
        const rec = {
            dati: dati ? clona(dati) : null,
            creato: prima && prima.dati && dati ? prima.creato : t,
            aggiornato: t,
            versione: (prima ? prima.versione : 0) + 1
        };
        this.documenti.set(percorso, rec);
        this.avvisa(percorso);
        return rec;
    }
    elenco(collezione) {
        const out = [];
        const pref = collezione + '/';
        this.documenti.forEach((r, p) => {
            if (r.dati && p.startsWith(pref) && p.indexOf('/', pref.length) < 0) out.push({ id: p.slice(pref.length), percorso: p, rec: r });
        });
        out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return out;
    }

    ascolta(percorso, fn) {
        if (!this.ascoltatori.has(percorso)) this.ascoltatori.set(percorso, new Set());
        this.ascoltatori.get(percorso).add(fn);
        return () => { const s = this.ascoltatori.get(percorso); if (s) s.delete(fn); };
    }
    ascoltaTutto(fn) {
        this.generali.add(fn);
        return () => this.generali.delete(fn);
    }
    avvisa(percorso) {
        const s = this.ascoltatori.get(percorso);
        setTimeout(() => {
            if (s) Array.from(s).forEach(fn => { try { fn(percorso); } catch (e) { s.delete(fn); } });
            Array.from(this.generali).forEach(fn => { try { fn(percorso); } catch (e) { this.generali.delete(fn); } });
        }, 0);
        this.salvaPiuTardi();
    }

    /* ---------- salvataggio nel browser ---------- */
    salvaPiuTardi() {
        clearTimeout(this.timerSalva);
        this.timerSalva = setTimeout(() => this.salva(), 400);
    }
    salva() {
        try {
            const doc = {};
            this.documenti.forEach((r, p) => { if (r.dati) doc[p] = { d: inJson(r.dati), c: r.creato, a: r.aggiornato, v: r.versione }; });
            const utenti = {};
            this.utenti.forEach((u, uid) => { utenti[uid] = u; });
            const codici = {};
            this.codici.forEach((c, k) => { codici[k] = c; });
            localStorage.setItem(CHIAVE_SALVATAGGIO, JSON.stringify({ doc, utenti, codici, extra: this.extra }));
        } catch (e) { /* senza localStorage l'anteprima vive finche' la pagina resta aperta */ }
    }
    carica() {
        let grezzo = null;
        try { grezzo = JSON.parse(localStorage.getItem(CHIAVE_SALVATAGGIO) || 'null'); } catch (e) { grezzo = null; }
        if (!grezzo || !grezzo.doc) return false;
        Object.keys(grezzo.doc).forEach(p => {
            const r = grezzo.doc[p];
            this.documenti.set(p, { dati: daJson(r.d), creato: r.c, aggiornato: r.a, versione: r.v || 1 });
        });
        Object.keys(grezzo.utenti || {}).forEach(uid => this.utenti.set(uid, grezzo.utenti[uid]));
        Object.keys(grezzo.codici || {}).forEach(k => this.codici.set(k, grezzo.codici[k]));
        this.extra = grezzo.extra || {};
        return true;
    }
    svuota() {
        this.documenti.clear();
        this.utenti.clear();
        this.codici.clear();
        this.extra = {};
        try { localStorage.removeItem(CHIAVE_SALVATAGGIO); } catch (e) { /* niente */ }
    }
}

module.exports = {
    Archivio, Timestamp, Sentinella, FieldValue, FieldPath, ID_DOCUMENTO,
    clona, uguali, risolvi, fondi, applicaPercorso, valoreCampo, soddisfa, segmentiDi, eOggettoSemplice
};
