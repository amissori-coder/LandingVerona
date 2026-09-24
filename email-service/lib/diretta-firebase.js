/* ============================================================
   Diretta degli eventi: il collegamento al SUO progetto Firebase
   ------------------------------------------------------------
   La diretta vive in un progetto Firebase separato ("ngb-eventi"),
   con i suoi account e il suo Firestore: chi segue una diretta non
   ha nessun account nel progetto dell'area riservata, e viceversa.

   Per questo qui non si usa l'app predefinita di firebase-admin
   (quella che le altre funzioni aprono con FIREBASE_SERVICE_ACCOUNT)
   ma un'app con un NOME proprio, "diretta", aperta con una chiave di
   servizio diversa: DIRETTA_FIREBASE_SERVICE_ACCOUNT. Le due app
   convivono nella stessa istanza senza vedersi.

   Prove locali: con DIRETTA_EMULATORE=1 l'app parla con gli
   emulatori di Firebase (FIRESTORE_EMULATOR_HOST e
   FIREBASE_AUTH_EMULATOR_HOST) e non ha bisogno di nessuna chiave.
   Senza quelle due variabili l'avvio si rifiuta: non deve mai
   succedere che una funzione in produzione creda di essere in prova.
   ============================================================ */
'use strict';
const admin = require('firebase-admin');

const NOME_APP = 'diretta';

/* Stessa lettura tollerante della chiave usata da invia-email.js: JSON
   grezzo oppure lo stesso JSON in base64 (una riga sola, comoda da
   incollare su Vercel). */
function leggiChiave() {
    const raw = String(process.env.DIRETTA_FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) throw new Error('DIRETTA_FIREBASE_SERVICE_ACCOUNT mancante');
    let testo = raw;
    if (testo[0] !== '{') {
        try {
            const decodificato = Buffer.from(testo, 'base64').toString('utf8').trim();
            if (decodificato[0] === '{') testo = decodificato;
        } catch (_) { /* ci pensa JSON.parse a dire che non va */ }
    }
    let cred;
    try { cred = JSON.parse(testo); } catch (_) {
        throw new Error('DIRETTA_FIREBASE_SERVICE_ACCOUNT non valido: atteso il JSON della chiave o lo stesso JSON in base64');
    }
    if (cred.private_key && cred.private_key.includes('\\n')) cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    return cred;
}

/* La separazione dall'area riservata non deve dipendere da un incolla
   fatto bene su Vercel: se in DIRETTA_FIREBASE_SERVICE_ACCOUNT finisse
   per errore la chiave dell'area riservata, la diretta creerebbe mille
   account nel progetto dello studio. Quindi la chiave deve essere del
   progetto atteso (DIRETTA_PROGETTO_ATTESO, predefinito "ngb-eventi")
   e comunque MAI dello stesso progetto di FIREBASE_SERVICE_ACCOUNT. */
function progettoDi(raw) {
    let t = String(raw || '').trim();
    if (!t) return '';
    if (t[0] !== '{') { try { t = Buffer.from(t, 'base64').toString('utf8').trim(); } catch (_) { return ''; } }
    try { return String(JSON.parse(t).project_id || ''); } catch (_) { return ''; }
}
function controllaProgetto(cred) {
    const atteso = String(process.env.DIRETTA_PROGETTO_ATTESO || 'ngb-eventi').trim();
    const progetto = String((cred && cred.project_id) || '');
    if (progetto !== atteso) {
        throw new Error('DIRETTA_FIREBASE_SERVICE_ACCOUNT e\' del progetto "' + progetto + '", non di "' + atteso + '"');
    }
    const studio = progettoDi(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (studio && studio === progetto) {
        throw new Error('DIRETTA_FIREBASE_SERVICE_ACCOUNT e\' la chiave dell\'area riservata: serve quella del progetto della diretta');
    }
}

function inEmulatore() {
    return String(process.env.DIRETTA_EMULATORE || '') === '1';
}

let app = null;
function appDiretta() {
    if (app) return app;
    const gia = admin.apps.find(a => a && a.name === NOME_APP);
    if (gia) { app = gia; return app; }
    if (inEmulatore()) {
        if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
            throw new Error('DIRETTA_EMULATORE=1 senza FIRESTORE_EMULATOR_HOST e FIREBASE_AUTH_EMULATOR_HOST');
        }
        app = admin.initializeApp({ projectId: process.env.DIRETTA_PROGETTO || 'demo-ngb-eventi' }, NOME_APP);
    } else {
        const cred = leggiChiave();
        controllaProgetto(cred);
        app = admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id }, NOME_APP);
    }
    // i campi lasciati undefined si saltano invece di far fallire la scrittura
    try { app.firestore().settings({ ignoreUndefinedProperties: true }); } catch (_) { /* gia' impostato */ }
    return app;
}

/* Tutto quello che serve a una funzione, in un oggetto solo. `adesso` e'
   una funzione e non Date.now diretto: le prove possono spostare
   l'orologio. */
function contesto() {
    const a = appDiretta();
    return {
        admin: admin,
        app: a,
        db: a.firestore(),
        auth: a.auth(),
        FieldValue: admin.firestore.FieldValue,
        FieldPath: admin.firestore.FieldPath,
        Timestamp: admin.firestore.Timestamp,
        adesso: () => Date.now(),
        emulatore: inEmulatore()
    };
}

module.exports = { contesto, appDiretta, inEmulatore, leggiChiave, controllaProgetto, NOME_APP };
