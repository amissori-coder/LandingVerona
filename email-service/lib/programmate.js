/* ============================================================
   Newsletter programmate: parti condivise
   ------------------------------------------------------------
   Le usano in due: l'endpoint che programma e annulla
   (api/programma-newsletter.js) e il lavoro automatico che a ogni
   giro spedisce quelle dovute (api/cron-newsletter.js).

   DOVE STANNO GLI INDIRIZZI, che e' la domanda importante.
   Il documento padre newsletterProgrammate/{idNewsletter} contiene
   il contenuto della mail e dei contatori: nessun indirizzo.
   Gli indirizzi stanno SOLO nella sottocollezione "lotti", scritta
   e letta unicamente dall'account di servizio, e cancellata appena
   l'invio si conclude o si annulla. Non finiscono mai in
   archivio/newsletter, che tutto lo staff abilitato puo' leggere:
   li' vanno solo impronte non reversibili, come gia' oggi.

   PERCHE' L'IDENTIFICATIVO DEL DOCUMENTO E' QUELLO DELLA
   NEWSLETTER e non un progressivo: cosi' "una sola programmazione
   attiva per newsletter" e' vero per costruzione. Due persone che
   programmano la stessa newsletter dallo stesso o da due browser
   finiscono sullo stesso documento, e la seconda viene respinta
   dalla transazione invece di creare un doppione che spedirebbe
   tutto due volte.
   ============================================================ */

const N = require('./newsletter');

const COLL = 'newsletterProgrammate';
const META = 'cronNewsletter';

// stati in cui la programmazione e' ancora "viva"
const ATTIVI = ['programmata', 'in-corso'];
function eAttiva(stato) { return ATTIVI.indexOf(String(stato || '')) >= 0; }

function rif(db, id) { return db.collection(COLL).doc(String(id)); }
function rifLotti(db, id) { return rif(db, id).collection('lotti'); }
function nomeLotto(i) { return ('000' + i).slice(-4); }

/* Battito del lavoro automatico. Serve a una cosa sola ma importante: accorgersi
   che il cron NON e' partito. Vercel non ritenta le esecuzioni fallite, quindi
   senza questo un invio che non parte non lo scopre nessuno finche' qualcuno non
   chiede "ma la newsletter di lunedi'?". */
async function battito(db, dati) {
    try {
        await db.collection('meta').doc(META).set(
            Object.assign({ quando: Date.now() }, dati || {}), { merge: true });
    } catch (e) { /* il battito che non si scrive non deve fermare l'invio */ }
}
async function leggiBattito(db) {
    try {
        const s = await db.collection('meta').doc(META).get();
        return s.exists ? (s.data() || null) : null;
    } catch (e) { return null; }
}

/* Aggiorna UNA newsletter dentro archivio/newsletter, in transazione e
   rileggendo il documento fresco: cosi' non si sovrascrive quello che nel
   frattempo ha scritto qualcuno dal browser. Stessa tecnica gia' in uso per le
   comunicazioni (api/cron-comunicazioni.js), non un secondo modo di fare la
   stessa cosa. */
async function applicaPatchNewsletter(db, id, patch) {
    const rifArchivio = db.collection('archivio').doc('newsletter');
    await db.runTransaction(async (tx) => {
        const s = await tx.get(rifArchivio);
        let arr = [];
        if (s.exists && typeof s.data().json === 'string') {
            try { arr = JSON.parse(s.data().json) || []; } catch (_) { arr = []; }
        }
        let trovata = false;
        arr = arr.map(n => {
            if (!n || n.id !== id) return n;
            trovata = true;
            const m = Object.assign({}, n);
            if (patch.stato) m.stato = patch.stato;
            if (patch.programmazione !== undefined) m.programmazione = patch.programmazione;
            if (patch.voce) {
                // stessa chiave di fusione usata dal browser: data + autore
                const chiave = v => (v && v.il || 0) + '|' + (v && v.da || '');
                const visti = new Set(), uniti = [];
                [patch.voce].concat(n.invii || []).forEach(v => {
                    const k = chiave(v);
                    if (!visti.has(k)) { visti.add(k); uniti.push(v); }
                });
                m.invii = uniti;
            }
            return m;
        });
        if (!trovata) return;   // la newsletter non c'e' piu' in archivio: non si inventa
        tx.set(rifArchivio, {
            json: JSON.stringify(arr),
            aggiornato: N.admin.firestore.FieldValue.serverTimestamp(),
            da: 'cron-newsletter'
        });
    });
}

/* Ripulisce gli indirizzi appena non servono piu'. Non e' igiene formale: la
   sottocollezione dei lotti e' l'unico posto nuovo in cui vivono indirizzi in
   chiaro, e non deve diventare un secondo archivio che nessuno ricorda. */
async function cancellaLotti(db, id) {
    try {
        const q = await rifLotti(db, id).get();
        let batch = db.batch(), n = 0;
        for (const d of q.docs) {
            batch.delete(d.ref); n++;
            if (n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
        }
        if (n) await batch.commit();
        return q.size;
    } catch (e) {
        console.error('Programmate: pulizia dei lotti non riuscita:', String((e && e.message) || e).slice(0, 200));
        return -1;
    }
}

module.exports = {
    COLL, META, ATTIVI, eAttiva,
    rif, rifLotti, nomeLotto,
    battito, leggiBattito,
    applicaPatchNewsletter, cancellaLotti
};
