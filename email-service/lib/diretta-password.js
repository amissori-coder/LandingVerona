/* ============================================================
   Diretta degli eventi: le password
   ------------------------------------------------------------
   La password la generiamo noi: 10 caratteri, senza quelli che si
   confondono leggendo o dettando al telefono (0/O/o, 1/l/I/i). Resta
   un alfabeto di 54 simboli: 54^10 = circa 2 x 10^17 combinazioni.
   Almeno una maiuscola, una minuscola e una cifra, cosi' nessuno
   riceve una password "tutta lettere" che sembra una parola qualsiasi.

   La password non si salva MAI: ne' in Firestore, ne' nei log, ne' in
   un file. Esiste solo nel momento in cui la si imposta sull'account
   Firebase e la si mette nell'email (o la si mostra una volta sola in
   gestione). Per questo "reinviare" le credenziali vuol dire
   generarne una nuova: quella vecchia non la conosce piu' nessuno.
   ============================================================ */
'use strict';
const crypto = require('crypto');

const MAIUSCOLE = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // senza I, L (per coerenza con l), O
const MINUSCOLE = 'abcdefghjkmnpqrstuvwxyz'; // senza i, l, o
const CIFRE = '23456789';                    // senza 0 e 1
const ALFABETO = MAIUSCOLE + MINUSCOLE + CIFRE;
const CONFONDIBILI = '0Oo1lIi';

function scegli(insieme) {
    return insieme[crypto.randomInt(insieme.length)];
}

// mescolamento di Fisher-Yates con numeri casuali crittografici
function mescola(lettere) {
    for (let i = lettere.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        const t = lettere[i]; lettere[i] = lettere[j]; lettere[j] = t;
    }
    return lettere;
}

function generaPassword(lunghezza) {
    const n = Math.max(8, Number(lunghezza) || 10);
    const lettere = [scegli(MAIUSCOLE), scegli(MINUSCOLE), scegli(CIFRE)];
    while (lettere.length < n) lettere.push(scegli(ALFABETO));
    return mescola(lettere).join('');
}

/* Una password che non viene mai comunicata a nessuno: serve a creare
   l'account prima dell'invio delle credenziali, cosi' che nel frattempo
   nessuno possa entrarci. */
function passwordSegreta() {
    return crypto.randomBytes(24).toString('base64');
}

module.exports = { generaPassword, passwordSegreta, ALFABETO, CONFONDIBILI };
