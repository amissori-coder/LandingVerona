/* ============================================================
   Esportazione dei dati Firestore
   ------------------------------------------------------------
   Percorre TUTTE le collezioni, comprese le sottocollezioni, e scrive un
   unico file JSON rileggibile da import-firestore.cjs.

   Nota sulla struttura dell'Area riservata: incarichi, persone, fatture e
   registro NON sono collezioni separate. Stanno dentro la collezione
   "archivio", un documento ciascuno, con tutto il contenuto nel campo "json".
   Qui non serve saperlo (si esporta tutto alla cieca), ma serve a chi legge
   il file per ritrovare le cose.

   I tipi che JSON non conosce (date, byte, coordinate, riferimenti) vengono
   salvati con un contrassegno "__tipo__" e ricostruiti in fase di import.
   ============================================================ */

const admin = require('firebase-admin');

const FORMATO = 'ngb-firestore-export-v1';

/* --- da valore Firestore a valore JSON --- */
function serializza(valore) {
    if (valore === null || valore === undefined) return null;
    if (valore instanceof admin.firestore.Timestamp) {
        return { __tipo__: 'timestamp', valore: valore.toDate().toISOString() };
    }
    if (valore instanceof admin.firestore.GeoPoint) {
        return { __tipo__: 'geopoint', latitudine: valore.latitude, longitudine: valore.longitude };
    }
    if (valore instanceof admin.firestore.DocumentReference) {
        return { __tipo__: 'riferimento', percorso: valore.path };
    }
    if (Buffer.isBuffer(valore)) {
        return { __tipo__: 'byte', valore: valore.toString('base64') };
    }
    if (typeof valore === 'number' && !Number.isFinite(valore)) {
        // NaN e Infinity non esistono in JSON: si conservano come testo
        return { __tipo__: 'numero-speciale', valore: String(valore) };
    }
    if (Array.isArray(valore)) return valore.map(serializza);
    if (typeof valore === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(valore)) out[k] = serializza(v);
        return out;
    }
    return valore;
}

/* --- da valore JSON a valore Firestore (usato dall'import) --- */
function deserializza(valore) {
    if (valore === null || valore === undefined) return null;
    if (Array.isArray(valore)) return valore.map(deserializza);
    if (typeof valore === 'object') {
        switch (valore.__tipo__) {
            case 'timestamp': return admin.firestore.Timestamp.fromDate(new Date(valore.valore));
            case 'geopoint': return new admin.firestore.GeoPoint(valore.latitudine, valore.longitudine);
            case 'riferimento': return { __riferimento__: valore.percorso };
            case 'byte': return Buffer.from(valore.valore, 'base64');
            case 'numero-speciale': return Number(valore.valore);
            default: {
                const out = {};
                for (const [k, v] of Object.entries(valore)) out[k] = deserializza(v);
                return out;
            }
        }
    }
    return valore;
}

/* Esporta una collezione e, ricorsivamente, le sue sottocollezioni. */
async function esportaCollezione(ref, conteggi) {
    const documenti = {};
    const snap = await ref.get();
    for (const doc of snap.docs) {
        conteggi.documenti++;
        const voce = { dati: serializza(doc.data()) };
        const sotto = await doc.ref.listCollections();
        if (sotto.length) {
            voce.sottocollezioni = {};
            for (const s of sotto) {
                conteggi.collezioni++;
                voce.sottocollezioni[s.id] = await esportaCollezione(s, conteggi);
            }
        }
        documenti[doc.id] = voce;
    }
    return documenti;
}

/* Esporta l'intero database. Restituisce { contenuto, conteggi }. */
async function esportaTutto(progetto) {
    const db = admin.firestore();
    const conteggi = { collezioni: 0, documenti: 0 };
    const collezioni = {};
    for (const c of await db.listCollections()) {
        conteggi.collezioni++;
        collezioni[c.id] = await esportaCollezione(c, conteggi);
    }
    return {
        contenuto: {
            formato: FORMATO,
            progetto,
            esportato: new Date().toISOString(),
            collezioni
        },
        conteggi
    };
}

module.exports = { FORMATO, esportaTutto, serializza, deserializza };
