/* ============================================================
   PROVE - i due totali con gli aderenti (Milano)
   ------------------------------------------------------------
       node prove/totali-aderenti.prove.js

   "Totale aziende" e "totale aziende + aderenti" si contano in due
   posti: nei riquadri dell'area riservata (area-riservata/app.js,
   totaliConAderenti) e nelle mail di mezzanotte
   (lib/riepilogo-iscrizioni.js, totaliConAderenti). Se le due regole
   si allontanano, chi legge la mail la mattina e poi apre l'area
   riservata trova due numeri diversi per la stessa cosa.

   Qui si verifica che:
     - la funzione dell'area riservata, ritagliata dal sorgente VERO di
       app.js, e quella del servizio diano lo stesso risultato su mille
       elenchi a caso (doppi, maiuscole, gruppi, senza email);
     - aziende + aderenti = il totale di tutti, sempre;
     - chi e' al convegno e alla cena si conta una volta, con la cena;
     - i casi di confine: niente aderenti, niente iscritti, righe
       senza indirizzo.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'app.js'), 'utf8');
function ritaglia(apertura) {
    const inizio = APP.indexOf(apertura);
    if (inizio < 0) throw new Error('non trovato in app.js: ' + apertura);
    let i = APP.indexOf('{', inizio), aperte = 0, fine = -1;
    for (; i < APP.length; i++) {
        if (APP[i] === '{') aperte++;
        else if (APP[i] === '}') { aperte--; if (!aperte) { fine = i + 1; break; } }
    }
    return APP.slice(inizio, fine);
}
const daApp = new Function(ritaglia('function totaliConAderenti(convegno, cena)') + '\nreturn totaliConAderenti;')();
const R = require(path.join(__dirname, '..', 'lib', 'riepilogo-iscrizioni.js'));

let ok = 0, ko = 0;
function esigi(c, cosa, extra) { if (c) { ok++; console.log('  verde  ' + cosa); } else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); } }

console.log('\nI casi scritti a mano');
let t = R.totaliConAderenti([], []);
esigi(t.aziende === 0 && t.aderenti === 0 && t.tutti === 0, 'niente iscritti: tutto a zero');
t = R.totaliConAderenti([{ email: 'a@x.it', persone: 1 }, { email: 'b@x.it', persone: 2 }], []);
esigi(t.aziende === 3 && t.aderenti === 0 && t.tutti === 3, 'senza aderenti il totale con gli aderenti e\' quello delle aziende');
t = R.totaliConAderenti([{ email: 'A@X.it ', persone: 1 }, { email: 'c@x.it', persone: 1, aderente: true }, { email: '', persone: 1 }], [{ email: 'a@x.it' }, { email: 'd@x.it' }]);
esigi(t.aziende === 1 && t.cena === 2 && t.soloConvegno === 1 && t.anche === 1 && t.tutti === 4,
    'chi e\' al convegno e alla cena (maiuscole e spazi a parte) si conta una volta, con la cena', JSON.stringify(t));
t = R.totaliConAderenti([{ email: 'a@x.it', persone: 1 }, { email: 'a@x.it', persone: 1 }], [{ email: 'a@x.it' }]);
esigi(t.aziende === 0 && t.anche === 1 && t.tutti === 1, 'anche se e\' su due righe del convegno');

console.log('\nL\'area riservata e il servizio contano allo stesso modo');
let seme = 7;
const caso = () => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme / 2147483648; };
const indirizzi = ['a@x.it', 'B@x.it', 'b@x.it', 'c@y.it', ' d@y.it', '', 'e@z.it', 'F@z.it'];
let uguali = 0, somme = 0;
for (let k = 0; k < 1000; k++) {
    const conv = Array.from({ length: Math.floor(caso() * 12) }, () => ({
        email: indirizzi[Math.floor(caso() * indirizzi.length)],
        persone: 1 + Math.floor(caso() * 3),
        aderente: caso() < 0.2
    }));
    const cena = Array.from({ length: Math.floor(caso() * 5) }, () => ({ email: indirizzi[Math.floor(caso() * indirizzi.length)] }));
    const a = daApp(conv, cena), b = R.totaliConAderenti(conv, cena);
    if (JSON.stringify(a) === JSON.stringify(b)) uguali++;
    if (b.aziende + b.aderenti === b.tutti) somme++;
}
esigi(uguali === 1000, 'mille elenchi a caso: stesso risultato', uguali + '/1000');
esigi(somme === 1000, 'e sempre aziende + aderenti = il totale di tutti', somme + '/1000');

console.log('\nNelle due parti ci sono le stesse parole');
esigi(/'totale aziende'/.test(APP) && /'totale aziende \+ aderenti'/.test(APP), 'l\'area riservata dice "totale aziende" e "totale aziende + aderenti"');
const MNGB = fs.readFileSync(path.join(__dirname, '..', 'lib', 'mail-ngb.js'), 'utf8');
esigi(/'Totale aziende'/.test(MNGB) && /'Totale aziende \+ aderenti'/.test(MNGB), 'e le mail di mezzanotte lo stesso');

console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
