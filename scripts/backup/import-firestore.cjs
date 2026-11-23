#!/usr/bin/env node
/* ============================================================
   RIMETTERE I DATI DENTRO FIRESTORE
   ------------------------------------------------------------
   Rilegge il file dei dati prodotto dal backup notturno e lo riscrive su
   Firestore, sottocollezioni comprese.

   Uso:
       npm install firebase-admin
       node import-firestore.cjs <chiave-service-account.json> firestore-data.jsonl.gz

   Lanciato cosi' fa solo una PROVA A VUOTO: dice cosa scriverebbe e non tocca
   niente. Per scrivere davvero:

       node import-firestore.cjs <chiave.json> firestore-data.jsonl.gz --conferma

   ATTENZIONE: sovrascrive i documenti con lo stesso percorso. Non cancella
   quelli che nel backup non ci sono.

   Legge tutti e due i formati del backup:
     - firestore-data.jsonl.gz   (dal 23/11/2026) una riga per documento,
                                 compresso; va bene anche gia' decompresso
                                 (firestore-data.jsonl). Si legge una riga per
                                 volta: non c'e' limite alla grandezza;
     - firestore-data.json       (fino al 01/09/2026) un unico JSON.

   Questo file e' AUTONOMO di proposito: viene copiato dentro ogni cartella di
   backup e deve funzionare anche senza il resto del repository.
   ============================================================ */

const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');
const admin = require('firebase-admin');

const argomenti = process.argv.slice(2);
const conferma = argomenti.includes('--conferma');
const [percorsoChiave, percorsoDati] = argomenti.filter(a => !a.startsWith('--'));

if (!percorsoChiave || !percorsoDati) {
    console.error('Uso: node import-firestore.cjs <chiave-service-account.json> <firestore-data.jsonl.gz> [--conferma]');
    process.exit(2);
}
for (const f of [percorsoChiave, percorsoDati]) {
    if (!fs.existsSync(f)) { console.error('File non trovato: ' + f); process.exit(2); }
}

const chiave = JSON.parse(fs.readFileSync(percorsoChiave, 'utf8'));
if (chiave.private_key && chiave.private_key.includes('\\n')) chiave.private_key = chiave.private_key.replace(/\\n/g, '\n');

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
            case 'intero-grande': return BigInt(valore.valore);
            default: {
                const out = {};
                for (const [k, v] of Object.entries(valore)) out[k] = deserializza(v);
                return out;
            }
        }
    }
    return valore;
}

/* --- i documenti del backup, uno per volta: { percorso, dati, peso } ---
   `peso` e' la lunghezza della riga: serve a non superare, in una scrittura
   di gruppo, i 10 MB che Firestore accetta per richiesta. */
const gzip = () => { const b = Buffer.alloc(2); const fd = fs.openSync(percorsoDati, 'r'); fs.readSync(fd, b, 0, 2, 0); fs.closeSync(fd); return b[0] === 0x1f && b[1] === 0x8b; };
const aRighe = /\.jsonl(\.gz)?$/i.test(percorsoDati) || gzip();
const intestazione = { formato: '', progetto: '', esportato: '' };

async function* documentiRighe() {
    let flusso = fs.createReadStream(percorsoDati);
    if (gzip()) flusso = flusso.pipe(zlib.createGunzip());
    const righe = readline.createInterface({ input: flusso, crlfDelay: Infinity });
    let prima = true, chiusa = null, n = 0;
    for await (const riga of righe) {
        if (!riga) continue;
        const o = JSON.parse(riga);
        if (prima) {
            prima = false;
            if (o.formato !== 'ngb-firestore-export-v2') throw new Error('Formato non riconosciuto: ' + o.formato);
            Object.assign(intestazione, o);
            continue;
        }
        if (o.fine) { chiusa = o; continue; }
        n++;
        yield { percorso: o.p, dati: o.d || {}, peso: riga.length };
    }
    if (!chiusa) throw new Error('Il file e\' troncato: manca la riga di chiusura. Non usarlo per un ripristino completo.');
    if (chiusa.documenti !== n) throw new Error('Il file dichiara ' + chiusa.documenti + ' documenti ma ne contiene ' + n + '.');
}
/* il formato di prima: un unico JSON ad albero */
async function* documentiAlbero() {
    const backup = JSON.parse(fs.readFileSync(percorsoDati, 'utf8'));
    if (backup.formato && backup.formato !== 'ngb-firestore-export-v1') {
        throw new Error('Formato non riconosciuto: ' + backup.formato + '. I backup piu\' vecchi hanno accanto il loro import-firestore.cjs: usa quello.');
    }
    Object.assign(intestazione, { formato: backup.formato || 'ngb-firestore-export-v1', progetto: backup.progetto || '', esportato: backup.esportato || '' });
    function* raccogli(documenti, percorsoCollezione) {
        for (const [id, voce] of Object.entries(documenti || {})) {
            const percorso = percorsoCollezione + '/' + id;
            yield { percorso, dati: voce.dati || {}, peso: JSON.stringify(voce.dati || {}).length };
            for (const [nome, figli] of Object.entries(voce.sottocollezioni || {})) yield* raccogli(figli, percorso + '/' + nome);
        }
    }
    for (const [nome, documenti] of Object.entries(backup.collezioni || {})) yield* raccogli(documenti, nome);
}
const documenti = () => (aRighe ? documentiRighe() : documentiAlbero());

async function principale() {
    /* primo passaggio: si conta e si controlla tutto il file, senza scrivere */
    const perCollezione = {};
    let totale = 0;
    for await (const v of documenti()) {
        const radice = v.percorso.split('/')[0];
        perCollezione[radice] = (perCollezione[radice] || 0) + 1;
        totale++;
    }

    console.log('Backup:    ' + percorsoDati);
    console.log('Progetto:  ' + (intestazione.progetto || '?') + '  ->  destinazione: ' + chiave.project_id);
    console.log('Esportato: ' + (intestazione.esportato || '?'));
    console.log('Documenti: ' + totale);
    if (intestazione.progetto && intestazione.progetto !== chiave.project_id) {
        console.log('NOTA: stai scrivendo su un progetto DIVERSO da quello di origine.');
    }
    console.log('');
    for (const [nome, quanti] of Object.entries(perCollezione).sort()) {
        console.log('  ' + nome.padEnd(24) + quanti + ' documenti');
    }
    console.log('');

    if (!conferma) {
        console.log('PROVA A VUOTO: non e\' stato scritto niente.');
        console.log('Per scrivere davvero rilancia aggiungendo   --conferma');
        return;
    }

    /* secondo passaggio: si scrive a gruppi. Un gruppo si chiude a 300
       documenti o a 5 MB, quello che arriva prima: Firestore accetta al
       massimo 500 scritture e 10 MB per richiesta, e i pezzi dei PDF delle
       circolarizzazioni pesano piu' di mezzo MB l'uno. */
    const MAX_DOCUMENTI = 300, MAX_PESO = 5 * 1024 * 1024;
    let scritti = 0, lotto = db.batch(), nelLotto = 0, pesoLotto = 0;
    const chiudi = async () => {
        if (!nelLotto) return;
        await lotto.commit();
        scritti += nelLotto;
        console.log('  scritti ' + scritti + '/' + totale);
        lotto = db.batch(); nelLotto = 0; pesoLotto = 0;
    };
    for await (const v of documenti()) {
        if (nelLotto && (nelLotto >= MAX_DOCUMENTI || pesoLotto + v.peso > MAX_PESO)) await chiudi();
        lotto.set(db.doc(v.percorso), deserializza(v.dati));
        nelLotto++; pesoLotto += v.peso;
    }
    await chiudi();
    console.log('');
    console.log('Fatto: ' + scritti + ' documenti scritti su ' + chiave.project_id + '.');
    console.log('Ricorda che utenti e password si reimportano a parte, con auth-parametri-hash.txt.');
}

principale().catch(e => { console.error(e && e.message ? 'ERRORE: ' + e.message : e); process.exit(1); });
