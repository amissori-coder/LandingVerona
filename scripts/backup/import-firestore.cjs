#!/usr/bin/env node
/* ============================================================
   RIMETTERE I DATI DENTRO FIRESTORE
   ------------------------------------------------------------
   Rilegge firestore-data.json prodotto dal backup notturno e lo riscrive su
   Firestore, sottocollezioni comprese.

   Uso:
       npm install firebase-admin
       node import-firestore.cjs <chiave-service-account.json> firestore-data.json

   Lanciato cosi' fa solo una PROVA A VUOTO: dice cosa scriverebbe e non tocca
   niente. Per scrivere davvero:

       node import-firestore.cjs <chiave.json> firestore-data.json --conferma

   ATTENZIONE: sovrascrive i documenti con lo stesso percorso. Non cancella
   quelli che nel backup non ci sono.

   Questo file e' AUTONOMO di proposito: viene copiato dentro ogni cartella di
   backup e deve funzionare anche senza il resto del repository.
   ============================================================ */

const fs = require('fs');
const admin = require('firebase-admin');

const argomenti = process.argv.slice(2);
const conferma = argomenti.includes('--conferma');
const [percorsoChiave, percorsoDati] = argomenti.filter(a => !a.startsWith('--'));

if (!percorsoChiave || !percorsoDati) {
    console.error('Uso: node import-firestore.cjs <chiave-service-account.json> <firestore-data.json> [--conferma]');
    process.exit(2);
}
for (const f of [percorsoChiave, percorsoDati]) {
    if (!fs.existsSync(f)) { console.error('File non trovato: ' + f); process.exit(2); }
}

const chiave = JSON.parse(fs.readFileSync(percorsoChiave, 'utf8'));
if (chiave.private_key && chiave.private_key.includes('\\n')) chiave.private_key = chiave.private_key.replace(/\\n/g, '\n');
const backup = JSON.parse(fs.readFileSync(percorsoDati, 'utf8'));

if (backup.formato && backup.formato !== 'ngb-firestore-export-v1') {
    console.error('Formato non riconosciuto: ' + backup.formato);
    console.error('I backup piu\' vecchi hanno accanto il loro import-firestore.cjs: usa quello.');
    process.exit(2);
}

admin.initializeApp({ credential: admin.credential.cert(chiave) });
const db = admin.firestore();

/* --- ricostruisce i tipi che JSON non sa rappresentare --- */
function deserializza(valore) {
    if (valore === null || valore === undefined) return null;
    if (Array.isArray(valore)) return valore.map(deserializza);
    if (typeof valore === 'object') {
        switch (valore.__tipo__) {
            case 'timestamp': return admin.firestore.Timestamp.fromDate(new Date(valore.valore));
            case 'geopoint': return new admin.firestore.GeoPoint(valore.latitudine, valore.longitudine);
            case 'riferimento': return db.doc(valore.percorso);
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

/* --- appiattisce l'albero del backup in un elenco di scritture --- */
function raccogli(documenti, percorsoCollezione, elenco) {
    for (const [id, voce] of Object.entries(documenti || {})) {
        const percorso = percorsoCollezione + '/' + id;
        elenco.push({ percorso, dati: deserializza(voce.dati || {}) });
        for (const [nome, figli] of Object.entries(voce.sottocollezioni || {})) {
            raccogli(figli, percorso + '/' + nome, elenco);
        }
    }
}

async function principale() {
    const elenco = [];
    for (const [nome, documenti] of Object.entries(backup.collezioni || {})) {
        raccogli(documenti, nome, elenco);
    }

    console.log('Backup:    ' + percorsoDati);
    console.log('Progetto:  ' + (backup.progetto || '?') + '  ->  destinazione: ' + chiave.project_id);
    console.log('Esportato: ' + (backup.esportato || '?'));
    console.log('Documenti: ' + elenco.length);
    if (backup.progetto && backup.progetto !== chiave.project_id) {
        console.log('NOTA: stai scrivendo su un progetto DIVERSO da quello di origine.');
    }
    console.log('');

    const perCollezione = {};
    for (const v of elenco) {
        const radice = v.percorso.split('/')[0];
        perCollezione[radice] = (perCollezione[radice] || 0) + 1;
    }
    for (const [nome, quanti] of Object.entries(perCollezione).sort()) {
        console.log('  ' + nome.padEnd(24) + quanti + ' documenti');
    }
    console.log('');

    if (!conferma) {
        console.log('PROVA A VUOTO: non e\' stato scritto niente.');
        console.log('Per scrivere davvero rilancia aggiungendo   --conferma');
        return;
    }

    let scritti = 0;
    const DIMENSIONE_LOTTO = 400;
    for (let i = 0; i < elenco.length; i += DIMENSIONE_LOTTO) {
        const lotto = db.batch();
        for (const v of elenco.slice(i, i + DIMENSIONE_LOTTO)) {
            lotto.set(db.doc(v.percorso), v.dati);
        }
        await lotto.commit();
        scritti += Math.min(DIMENSIONE_LOTTO, elenco.length - i);
        console.log('  scritti ' + scritti + '/' + elenco.length);
    }
    console.log('');
    console.log('Fatto: ' + scritti + ' documenti scritti su ' + chiave.project_id + '.');
    console.log('Ricorda che utenti e password si reimportano a parte, con auth-parametri-hash.txt.');
}

principale().catch(e => { console.error(e); process.exit(1); });
