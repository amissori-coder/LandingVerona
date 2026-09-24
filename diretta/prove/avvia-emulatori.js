/* ============================================================
   PROVE - avvio degli emulatori Firebase (Auth + Firestore)
   ------------------------------------------------------------
       node avvia-emulatori.js [--firestore 8080] [--auth 9099]
                               [--progetto demo-ngb-eventi]

   Prepara una cartella temporanea con il firebase.json e le regole
   VERE della diretta (diretta/firebase/firestore.rules), fa partire
   gli emulatori e resta in primo piano finche' non lo si ferma.
   Scrive "EMULATORI PRONTI" quando si puo' cominciare.

   Porte diverse = istanze indipendenti: piu' prove possono girare
   insieme senza pestarsi i dati. Il progetto "demo-..." non esiste
   su Google: gli emulatori non chiamano niente fuori da qui.
   ============================================================ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function argomento(nome, predefinito) {
    const i = process.argv.indexOf('--' + nome);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : predefinito;
}

const portaFirestore = Number(argomento('firestore', 8080));
const portaAuth = Number(argomento('auth', 9099));
const progetto = argomento('progetto', 'demo-ngb-eventi');
const regole = path.resolve(__dirname, '../firebase/firestore.rules');
const indici = path.resolve(__dirname, '../firebase/firestore.indexes.json');

const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'ngb-emulatori-'));
if (fs.existsSync(regole)) fs.copyFileSync(regole, path.join(cartella, 'firestore.rules'));
else fs.writeFileSync(path.join(cartella, 'firestore.rules'),
    'rules_version = "2";\nservice cloud.firestore { match /databases/{database}/documents { match /{d=**} { allow read, write: if false; } } }\n');
if (fs.existsSync(indici)) fs.copyFileSync(indici, path.join(cartella, 'firestore.indexes.json'));

// le porte "di servizio" (hub, log, websocket) si ricavano da quella di Firestore,
// in tre fasce separate: due istanze con porte Firestore diverse non si
// scontrano mai (prima hub e log stavano nella stessa fascia e si sovrapponevano)
const scarto = portaFirestore - 8080;
fs.writeFileSync(path.join(cartella, 'firebase.json'), JSON.stringify({
    firestore: { rules: 'firestore.rules' },
    emulators: {
        auth: { port: portaAuth, host: '127.0.0.1' },
        firestore: { port: portaFirestore, host: '127.0.0.1', websocketPort: 16400 + scarto },
        hub: { port: 14400 + scarto, host: '127.0.0.1' },
        logging: { port: 15400 + scarto, host: '127.0.0.1' },
        ui: { enabled: false }
    }
}, null, 2));

// il firebase della cartella prove, altrimenti quello di sistema
const locale = path.resolve(__dirname, 'node_modules/.bin/firebase');
const comando = fs.existsSync(locale) ? locale : 'firebase';
const figlio = spawn(comando, ['emulators:start', '--only', 'auth,firestore', '--project', progetto], {
    cwd: cartella, stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { FORCE_COLOR: '0' })
});
let pronto = false;
function leggi(dati) {
    const s = dati.toString();
    if (process.env.EMULATORI_VERBOSI) process.stdout.write(s);
    if (!pronto && /All emulators ready/.test(s)) {
        pronto = true;
        console.log('EMULATORI PRONTI firestore=127.0.0.1:' + portaFirestore + ' auth=127.0.0.1:' + portaAuth + ' progetto=' + progetto);
    }
    if (/Error:|could not start|port taken/i.test(s)) process.stderr.write(s);
}
figlio.stdout.on('data', leggi);
figlio.stderr.on('data', leggi);
figlio.on('exit', code => { console.log('emulatori fermati (' + code + ')'); process.exit(code || 0); });
const ferma = () => { try { figlio.kill('SIGINT'); } catch (_) { /* gia' fermo */ } };
process.on('SIGINT', ferma);
process.on('SIGTERM', ferma);
