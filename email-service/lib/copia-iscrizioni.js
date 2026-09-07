/* ============================================================
   COPIA CONDIVISA DELL'ARCHIVIO ISCRIZIONI
   ------------------------------------------------------------
   Le sezioni Eventi e Newsletter leggono l'INTERO archivio delle
   iscrizioni (piu' stati, note e cancellazioni). Prima ogni funzione
   su Vercel se lo teneva in memoria per conto suo: ma Vercel accende e
   spegne istanze di continuo, e ogni istanza nuova rileggeva da capo
   centinaia di documenti. Con nove persone che interrogano la sezione
   ogni pochi minuti si superavano le 50.000 letture al giorno del
   piano gratuito di Firebase, e la sezione mostrava a tutti
   "RESOURCE_EXHAUSTED: Quota exceeded".

   Qui la copia dell'archivio sta in UN documento di Firestore
   (meta/iscrizioniCopia, compresso), condiviso da tutte le istanze:
     - meta/iscrizioni.rev dice se qualcosa e' cambiato (1 lettura);
     - se la copia ha lo stesso numero, si usa lei (1 lettura);
     - solo quando qualcuno ha scritto si rileggono le collezioni
       (una volta sola per tutti) e la copia viene riscritta.
   Una richiesta che prima costava "tutti i documenti" ne costa due.

   La memoria di processo resta come primo livello: a parita' di
   numero di revisione non si legge nemmeno la copia.

   Se Firebase rifiuta le letture per quota esaurita, si risponde con
   l'ultima copia in memoria (segnalandolo) invece che con l'errore
   grezzo; senza niente in memoria si alza ErroreQuota, che le API
   traducono in un messaggio comprensibile.
   ============================================================ */
'use strict';

const zlib = require('zlib');

const META = ['meta', 'iscrizioni'];          // { rev, quando }: lo alza chi scrive
const COPIA = ['meta', 'iscrizioniCopia'];    // la copia: intestazione + prima parte
const PARTI = 'iscrizioniCopiaParti';         // le parti oltre la prima (p2, p3...)
const MAX_PARTE = 900 * 1024;                 // sotto il limite di 1 MiB per documento
const COLLEZIONI = ['iscrizioni', 'presenze', 'iscrizioniCancellate'];

/* Una copia con lo stesso numero di revisione vale anche se e' vecchia. Ma una
   scrittura fatta fuori dalle API (dalla console di Firebase, da uno script) non
   alza il numero: dopo qualche ora la si rilegge comunque, per sicurezza.
   Quattro rilettura al giorno al massimo: niente rispetto a prima. */
const ETA_MAX_MS = 6 * 60 * 60 * 1000;
/* "Aggiorna adesso" rilegge davvero le collezioni, ma non piu' di una volta al
   minuto per TUTTE le istanze insieme: e' l'unico freno a chi preme a raffica. */
const FORZA_MIN_MS = 60 * 1000;
/* Senza numero di revisione (non leggibile) la memoria di processo vale poco. */
const MEMORIA_SENZA_REV_MS = 45 * 1000;

const MSG_QUOTA = 'Il database (Firebase) ha esaurito le letture disponibili per oggi e non risponde. '
    + 'Con il piano Blaze il limite si sblocca da solo entro qualche ora; in ogni caso si azzera alle 9 del mattino. '
    + 'La sezione riprende automaticamente: non serve fare niente.';

class ErroreQuota extends Error {
    constructor() { super(MSG_QUOTA); this.quota = true; }
}

function eQuota(e) {
    if (!e) return false;
    if (e.quota === true) return true;
    if (e.code === 8 || e.code === 'resource-exhausted') return true;
    return /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(e.message || e));
}

// ultima copia buona vista da QUESTA istanza: { rev, quando, dati }
let _mem = null;
// rilettura delle collezioni in corso in questa istanza: chi arriva nel frattempo
// aspetta quella invece di farne un'altra (con il tempo reale, dopo una scrittura
// le richieste arrivano tutte insieme)
let _rilettura = null;

/* I documenti passano da JSON: i Timestamp di Firestore (che JSON non conosce)
   diventano millisecondi, come tutti gli altri "quando" dell'archivio. */
function semplifica(v) {
    if (v == null) return v;
    if (Array.isArray(v)) return v.map(semplifica);
    if (typeof v === 'object') {
        if (typeof v.toMillis === 'function') return v.toMillis();
        if (Buffer.isBuffer(v) || (v.constructor && v.constructor.name === 'Uint8Array')) return null;
        const out = {};
        Object.keys(v).forEach(k => { out[k] = semplifica(v[k]); });
        return out;
    }
    return v;
}

async function leggiRev(db) {
    const d = await db.collection(META[0]).doc(META[1]).get();
    return (d.exists && typeof d.data().rev === 'number') ? d.data().rev : 0;
}

async function leggiCopia(db) {
    const d = await db.collection(COPIA[0]).doc(COPIA[1]).get();
    if (!d.exists) return null;
    const v = d.data() || {};
    if (typeof v.rev !== 'number' || !v.dati) return null;
    let pezzi = [Buffer.from(v.dati)];
    const n = typeof v.parti === 'number' ? v.parti : 1;
    if (n > 1) {
        const rif = [];
        for (let i = 2; i <= n; i++) rif.push(db.collection(PARTI).doc('p' + i));
        const altri = await db.getAll.apply(db, rif);
        for (let i = 0; i < altri.length; i++) {
            const p = altri[i];
            if (!p.exists || !p.data().dati || p.data().rev !== v.rev) return null;   // copia incompleta o mista
            pezzi.push(Buffer.from(p.data().dati));
        }
    }
    let dati;
    try { dati = JSON.parse(zlib.gunzipSync(Buffer.concat(pezzi)).toString('utf8')); }
    catch (_) { return null; }
    if (!dati || !Array.isArray(dati.iscrizioni)) return null;
    return { rev: v.rev, quando: typeof v.quando === 'number' ? v.quando : 0, dati: dati };
}

async function scriviCopia(db, rev, quando, dati) {
    const tutto = zlib.gzipSync(Buffer.from(JSON.stringify(dati), 'utf8'));
    const parti = [];
    for (let i = 0; i < tutto.length; i += MAX_PARTE) parti.push(tutto.subarray(i, i + MAX_PARTE));
    if (!parti.length) parti.push(Buffer.alloc(0));
    const b = db.batch();
    b.set(db.collection(COPIA[0]).doc(COPIA[1]), {
        rev: rev, quando: quando, parti: parti.length, byte: tutto.length,
        documenti: dati.iscrizioni.length + dati.presenze.length + dati.cancellate.length,
        dati: parti[0]
    });
    for (let i = 1; i < parti.length; i++) {
        b.set(db.collection(PARTI).doc('p' + (i + 1)), { rev: rev, dati: parti[i] });
    }
    await b.commit();
}

async function leggiCollezioni(db) {
    const [si, sp, sc] = await Promise.all(COLLEZIONI.map(c => db.collection(c).get()));
    const righe = (snap, conId) => {
        const out = [];
        snap.forEach(d => {
            const v = semplifica(d.data() || {});
            out.push(conId ? Object.assign({ _doc: d.id }, v) : v);
        });
        return out;
    };
    // il NOME DEL DOCUMENTO viaggia con l'iscrizione: per le schede-partecipante
    // (idDoc~p2...) non si ricava dai campi, e serve alle azioni sul documento giusto
    return { iscrizioni: righe(si, true), presenze: righe(sp, false), cancellate: righe(sc, false) };
}

function risposta(m, come) {
    return Object.assign({ rev: m.rev, quando: m.quando }, m.dati, come);
}

/* L'archivio completo: { rev, quando, iscrizioni, presenze, cancellate, daMemoria,
   daCopia, avviso }. Con { forza: true } si rileggono le collezioni (nei limiti
   del freno di un minuto). */
async function archivio(db, opz) {
    const forza = !!(opz && opz.forza);
    const adesso = Date.now();
    let rev = -1;
    try { rev = await leggiRev(db); }
    catch (e) {
        if (!eQuota(e)) throw e;
        if (_mem) return risposta(_mem, { daMemoria: true, avviso: MSG_QUOTA });
        throw new ErroreQuota();
    }
    try {
        if (!forza && _mem) {
            const fresca = (adesso - _mem.quando) < ETA_MAX_MS;
            if (rev >= 0 ? (_mem.rev === rev && fresca) : (adesso - _mem.quando) < MEMORIA_SENZA_REV_MS) {
                return risposta(_mem, { daMemoria: true });
            }
        }
        const copia = await leggiCopia(db);
        if (copia) {
            const stessaRev = rev >= 0 && copia.rev === rev;
            const eta = adesso - copia.quando;
            const buona = stessaRev && eta < ETA_MAX_MS;
            // forzando si rilegge davvero, ma non se qualcuno l'ha appena fatto
            if ((!forza && buona) || (forza && eta < FORZA_MIN_MS && (stessaRev || rev < 0))) {
                _mem = copia;
                return risposta(copia, { daCopia: true });
            }
        }
        if (!_rilettura) {
            _rilettura = (async () => {
                const dati = await leggiCollezioni(db);
                const m = { rev: rev < 0 ? (copia ? copia.rev : 0) : rev, quando: Date.now(), dati: dati };
                _mem = m;
                try { await scriviCopia(db, m.rev, m.quando, dati); }
                catch (e) { console.error('Copia iscrizioni non scritta:', String((e && e.message) || e).slice(0, 200)); }
                return m;
            })();
            _rilettura.finally(() => { _rilettura = null; }).catch(() => { });
        }
        const m = await _rilettura;
        return risposta(m, { daMemoria: false });
    } catch (e) {
        if (!eQuota(e)) throw e;
        if (_mem) return risposta(_mem, { daMemoria: true, avviso: MSG_QUOTA });
        throw new ErroreQuota();
    }
}

module.exports = { archivio, eQuota, ErroreQuota, MSG_QUOTA };
