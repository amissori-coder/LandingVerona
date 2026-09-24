/* ============================================================
   PROVE - le password della diretta (lib/diretta-password.js)
   ------------------------------------------------------------
       node prove/diretta-password.prove.js

   Niente da installare. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Che ogni password e' lunga 10 caratteri, non
   contiene mai caratteri che si confondono (0/O/o, 1/l/I/i), ha
   sempre almeno una maiuscola, una minuscola e una cifra, e che su
   20.000 password non ne esce mai una uguale a un'altra. E che nel
   codice delle funzioni della diretta nessuna password finisce in
   un log o in una scrittura su Firestore, e nessuna chiave segreta
   dei link firmati (segreto) finisce in un log.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('../lib/diretta-password');

let rossi = 0, verdi = 0;
function vero(cond, descrizione) {
    if (cond) verdi++;
    else { rossi++; console.log('ROSSO  ' + descrizione); }
}

const viste = new Set();
let lunghezzaOk = true, confondibili = '', senzaMaiuscola = 0, senzaMinuscola = 0, senzaCifra = 0, fuoriAlfabeto = '';
for (let i = 0; i < 20000; i++) {
    const p = P.generaPassword();
    if (p.length !== 10) lunghezzaOk = false;
    for (const c of p) {
        if (P.CONFONDIBILI.indexOf(c) >= 0) confondibili += c;
        if (P.ALFABETO.indexOf(c) < 0) fuoriAlfabeto += c;
    }
    if (!/[A-Z]/.test(p)) senzaMaiuscola++;
    if (!/[a-z]/.test(p)) senzaMinuscola++;
    if (!/[0-9]/.test(p)) senzaCifra++;
    viste.add(p);
}
vero(lunghezzaOk, 'tutte le password sono di 10 caratteri');
vero(confondibili === '', 'nessun carattere che si confonde (0 O o 1 l I i): trovati "' + confondibili.slice(0, 20) + '"');
vero(fuoriAlfabeto === '', 'solo caratteri dell\'alfabeto previsto');
vero(senzaMaiuscola === 0 && senzaMinuscola === 0 && senzaCifra === 0, 'sempre almeno una maiuscola, una minuscola e una cifra');
vero(viste.size === 20000, '20.000 password tutte diverse');
vero(!/[0Oo1lIi]/.test(P.ALFABETO), 'l\'alfabeto stesso non contiene caratteri che si confondono');
vero(P.generaPassword(12).length === 12, 'lunghezza diversa su richiesta');

// la password "segreta" di creazione non si comunica: basta che sia lunga e casuale
const s1 = P.passwordSegreta(), s2 = P.passwordSegreta();
vero(s1.length >= 30 && s1 !== s2, 'password di creazione lunga e casuale');

/* Nessuna password nei log ne' in Firestore: si cerca nel codice della
   diretta ogni console.* e ogni scrittura che nomini una variabile
   "password". E' un controllo grezzo ma cattura la svista tipica. */
const cartelle = [path.resolve(__dirname, '../api'), path.resolve(__dirname, '../lib')];
const sospetti = [];
cartelle.forEach(c => fs.readdirSync(c).filter(f => /^diretta-.*\.js$/.test(f)).forEach(f => {
    const righe = fs.readFileSync(path.join(c, f), 'utf8').split('\n');
    righe.forEach((r, i) => {
        // i testi tra virgolette non contano: "verifica della password" in un log
        // e' una frase, non una password; conta una VARIABILE che finisce nel log
        const senzaTesti = r.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''").replace(/`[^`$]*`/g, "''");
        if (/console\.(log|error|warn|info)\([^)]*(password|segreto)/i.test(senzaTesti)) sospetti.push(f + ':' + (i + 1) + ' (log)');
        if (/\.(set|update|add|create)\(\{[^}]*\bpassword\s*:/i.test(r)) sospetti.push(f + ':' + (i + 1) + ' (scrittura)');
    });
}));
vero(sospetti.length === 0, 'nessuna password (o chiave dei link firmati) nei log, nessuna password nelle scritture: ' + sospetti.join(', '));

console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
process.exit(rossi ? 1 : 0);
