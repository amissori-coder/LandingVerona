/* ============================================================
   PROVE - la diretta e l'area riservata dello studio non si toccano
   ------------------------------------------------------------
       FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node separazione.prova.js

   COSA DIMOSTRANO.
   1. Sul codice: la diretta non nomina mai il progetto Firebase
      dell'area riservata (revilaw-incarichi), non carica i suoi file
      e non usa la sua chiave di servizio (FIREBASE_SERVICE_ACCOUNT);
      le funzioni della diretta aprono un'app firebase-admin con un
      NOME proprio e la loro chiave (DIRETTA_FIREBASE_SERVICE_ACCOUNT).
      E, al contrario, l'area riservata non nomina la diretta.
   2. Sui token (con l'emulatore di Auth): un partecipante che ha fatto
      l'accesso alla diretta riceve un token del progetto della
      diretta; presentato a un server che verifica i token del
      progetto dell'area riservata, viene RIFIUTATO ("aud" sbagliato).
      E le sue credenziali non esistono nel progetto dello studio.
   Esce con 1 se qualcosa e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const RADICE = path.resolve(__dirname, '../..');
let rossi = 0, verdi = 0;
function vero(cond, descrizione) {
    if (cond) { verdi++; console.log('  ok  ' + descrizione); }
    else { rossi++; console.log('ROSSO ' + descrizione); }
}

function fileDi(cartella, filtro) {
    const out = [];
    (function giro(c) {
        for (const f of fs.readdirSync(c)) {
            if (f === 'node_modules' || f === 'risultati' || f.startsWith('.')) continue;
            const p = path.join(c, f);
            if (fs.statSync(p).isDirectory()) giro(p);
            else if (!filtro || filtro(p)) out.push(p);
        }
    })(cartella);
    return out;
}

/* ---------- 1. il codice ---------- */
const codiceDiretta = fileDi(path.join(RADICE, 'diretta'), p => /\.(js|html|json|rules)$/.test(p) && !/\/prove\//.test(p))
    .concat(fileDi(path.join(RADICE, 'email-service'), p => /\/(api|lib)\/diretta-[^/]+\.js$/.test(p)));
vero(codiceDiretta.length > 0, 'trovati ' + codiceDiretta.length + ' file della diretta da controllare');
const vietati = [
    [/revilaw-incarichi/, 'il progetto Firebase dell\'area riservata'],
    [/area-riservata\//, 'i file dell\'area riservata'],
    [/\bFIREBASE_SERVICE_ACCOUNT\b/, 'la chiave di servizio dell\'area riservata'],
    [/RV_FIREBASE_CONFIG/, 'la configurazione web dell\'area riservata'],
    [/collection\(\s*['"]utenti['"]\s*\)/, 'la raccolta "utenti" dell\'area riservata']
];
for (const [re, cosa] of vietati) {
    const colpevoli = codiceDiretta.filter(f => {
        const testo = fs.readFileSync(f, 'utf8')
            // i commenti possono spiegare la separazione nominando l'altro progetto
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
            // l'unico uso ammesso: il controllo che la chiave della diretta NON sia
            // quella dello studio (lib/diretta-firebase.js, controllaProgetto)
            .replace(/progettoDi\(process\.env\.FIREBASE_SERVICE_ACCOUNT\)/g, '');
        return re.test(testo);
    });
    vero(colpevoli.length === 0, 'la diretta non usa ' + cosa + (colpevoli.length ? ': ' + colpevoli.map(f => path.relative(RADICE, f)).join(', ') : ''));
}
const fb = fs.readFileSync(path.join(RADICE, 'email-service/lib/diretta-firebase.js'), 'utf8');
vero(/DIRETTA_FIREBASE_SERVICE_ACCOUNT/.test(fb) && /NOME_APP\s*=\s*'diretta'/.test(fb), 'le funzioni della diretta usano un\'app firebase-admin con nome proprio e la loro chiave');
const apiDiretta = fileDi(path.join(RADICE, 'email-service/api'), p => /diretta-[^/]+\.js$/.test(p));
vero(apiDiretta.every(f => !/admin\.initializeApp\(/.test(fs.readFileSync(f, 'utf8'))), 'nessuna funzione della diretta apre l\'app predefinita di firebase-admin');
const configDiretta = path.join(RADICE, 'diretta/config.js');
if (fs.existsSync(configDiretta)) {
    const c = fs.readFileSync(configDiretta, 'utf8');
    const progetto = (/projectId:\s*'([^']+)'/.exec(c) || [])[1];
    const rv = fs.readFileSync(path.join(RADICE, 'area-riservata/firebase-config.js'), 'utf8');
    const progettoRv = (/projectId:\s*"([^"]+)"/.exec(rv) || [])[1];
    vero(progetto && progettoRv && progetto !== progettoRv, 'progetti Firebase diversi: diretta "' + progetto + '", area riservata "' + progettoRv + '"');
}
const codiceArea = fileDi(path.join(RADICE, 'area-riservata'), p => /\.(js|html)$/.test(p));
vero(codiceArea.every(f => !/ngb-eventi|\/diretta\/|NGB_DIRETTA/.test(fs.readFileSync(f, 'utf8'))), 'l\'area riservata non nomina la diretta');

/* ---------- 2. i token ---------- */
(async () => {
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        console.log('\n(prova dei token saltata: manca FIREBASE_AUTH_EMULATOR_HOST)');
    } else {
        const admin = require(path.join(RADICE, 'email-service/node_modules/firebase-admin'));
        const diretta = admin.initializeApp({ projectId: 'demo-ngb-eventi' }, 'prova-diretta');
        const studio = admin.initializeApp({ projectId: 'demo-revilaw-incarichi' }, 'prova-studio');
        const host = 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST;
        const email = 'separazione' + Date.now() + '@utenti.diretta.nextgenerationbusiness.it';
        const u = await diretta.auth().createUser({ email: email, password: 'Prova2345xy' });
        await diretta.auth().setCustomUserClaims(u.uid, { eventi: ['napoli-2026'] });
        const token = await diretta.auth().createCustomToken(u.uid);
        const r = await fetch(host + '/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=finta', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: token, returnSecureToken: true })
        });
        const idToken = (await r.json()).idToken;
        vero(!!idToken, 'il partecipante ottiene il suo token della diretta');
        const d = await diretta.auth().verifyIdToken(idToken).catch(() => null);
        vero(d && d.uid === u.uid, 'il token vale per il progetto della diretta');
        let rifiutato = false, motivo = '';
        try { await studio.auth().verifyIdToken(idToken); } catch (e) { rifiutato = true; motivo = e.message; }
        vero(rifiutato && /aud/.test(motivo), 'lo stesso token e\' RIFIUTATO dal progetto dell\'area riservata (' + motivo.split('.')[0] + ')');
        const nelloStudio = await studio.auth().getUserByEmail(email).catch(() => null);
        vero(!nelloStudio, 'le credenziali del partecipante non esistono nel progetto dello studio');
        await diretta.auth().deleteUser(u.uid);
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
    process.exit(rossi ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
