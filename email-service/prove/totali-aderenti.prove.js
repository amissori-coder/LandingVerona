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
t = R.totaliConAderenti([{ email: 'a@x.it', persone: 3 }, { email: 'b@x.it', persone: 1 }], [{ email: 'a@x.it' }]);
esigi(t.aziende === 3 && t.cena === 1 && t.anche === 1 && t.tutti === 4, 'un gruppo da tre con l\'aderente della cena: gli altri due restano fra le aziende', JSON.stringify(t));
t = R.totaliConAderenti([{ email: 'a@x.it', persone: 3, aderente: true }], [{ email: 'a@x.it' }]);
esigi(t.soloConvegno === 2 && t.tutti === 3, 'e nella sezione degli aderenti restano li\'', JSON.stringify(t));
t = R.totaliConAderenti([{ email: 'seg@studio.it', persone: 1, gruppo: 'ord1' }, { email: 'seg@studio.it', persone: 1, gruppo: 'ord1' }, { email: 'luca@x.it', persone: 1, gruppo: 'ord1' }], [{ email: 'seg@studio.it' }]);
esigi(t.aziende === 2 && t.tutti === 3, 'un compagno di gruppo con lo stesso indirizzo dell\'intestatario e\' un\'altra persona: resta fra le aziende', JSON.stringify(t));
t = R.totaliConAderenti([{ email: 'a@x.it', persone: 1, gruppo: 'doc1' }, { email: 'a@x.it', persone: 1, gruppo: 'doc2' }], [{ email: 'a@x.it' }]);
esigi(t.aziende === 0 && t.tutti === 1, 'due iscrizioni separate con lo stesso indirizzo restano un doppio', JSON.stringify(t));

console.log('\nL\'area riservata e il servizio contano allo stesso modo');
let seme = 7;
const caso = () => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme / 2147483648; };
const indirizzi = ['a@x.it', 'B@x.it', 'b@x.it', 'c@y.it', ' d@y.it', '', 'e@z.it', 'F@z.it'];
let uguali = 0, somme = 0;
for (let k = 0; k < 1000; k++) {
    const conv = Array.from({ length: Math.floor(caso() * 12) }, () => ({
        email: indirizzi[Math.floor(caso() * indirizzi.length)],
        persone: 1 + Math.floor(caso() * 3),
        aderente: caso() < 0.2,
        gruppo: caso() < 0.5 ? 'g' + Math.floor(caso() * 3) : ''
    }));
    const cena = Array.from({ length: Math.floor(caso() * 5) }, () => ({ email: indirizzi[Math.floor(caso() * indirizzi.length)] }));
    const a = daApp(conv, cena), b = R.totaliConAderenti(conv, cena);
    if (JSON.stringify(a) === JSON.stringify(b)) uguali++;
    if (b.aziende + b.aderenti === b.tutti) somme++;
}
esigi(uguali === 1000, 'mille elenchi a caso: stesso risultato', uguali + '/1000');
esigi(somme === 1000, 'e sempre aziende + aderenti = il totale di tutti', somme + '/1000');

/* I DUE RIEPILOGHI DELL'AREA RISERVATA, in presenza e online (totaliPerDove):
   la stessa regola applicata a ciascuna meta', e le due meta' insieme devono
   rifare il totale intero, quello della mail. Le righe di uno stesso ordine
   (`gruppo`) hanno la stessa modalita', come nei dati veri: un ordine da
   Eventbrite per tre posti e' tutto in sala o tutto online. */
const daAppDove = new Function(ritaglia('function totaliConAderenti(convegno, cena)') + '\n'
    + ritaglia('function totaliPerDove(convegno, cena, inAttesa)') + '\nreturn totaliPerDove;')();
console.log('\nI due riepiloghi dell\'area riservata: in presenza e online');
const S = (email, persone, extra) => Object.assign({ email: email, persone: persone, sala: true }, extra || {});
const O = (email, persone, extra) => Object.assign({ email: email, persone: persone, sala: false }, extra || {});
let d = daAppDove([S('a@x.it', 1), O('b@x.it', 2)], []);
esigi(d.presenza.aziende === 1 && d.presenza.tutti === 1 && d.online.aziende === 2 && d.online.aderenti === 0 && d.online.tutti === 2,
    'le righe del convegno vanno dove dice la loro sezione', JSON.stringify(d));
d = daAppDove([S('a@x.it', 1)], [{ email: 'c@x.it' }]);
esigi(d.presenza.cena === 1 && d.presenza.aderenti === 1 && d.presenza.tutti === 2 && d.online.cena === 0 && d.online.tutti === 0 && d.online.cenaAltrove === 1,
    'chi e\' solo alla cena viene di persona: sta in presenza', JSON.stringify(d));
d = daAppDove([O('c@x.it', 1), O('b@x.it', 1)], [{ email: 'c@x.it' }]);
esigi(d.online.cena === 1 && d.online.aziende === 1 && d.online.aderenti === 1 && d.online.tutti === 2 && d.presenza.tutti === 0 && d.presenza.cenaAltrove === 1,
    'chi e\' alla cena e segue il convegno online e\' un aderente online, una volta', JSON.stringify(d));
d = daAppDove([S('c@x.it', 1), O('c@x.it', 1)], [{ email: 'c@x.it' }]);
esigi(d.presenza.cena === 1 && d.presenza.aziende === 0 && d.presenza.tutti === 1 && d.online.cena === 0 && d.online.aziende === 0 && d.online.tutti === 0,
    'con una riga in sala e una online e\' in sala, e si conta una volta', JSON.stringify(d));
d = daAppDove([S('c@x.it', 1, { aderente: true }), S('e@x.it', 2, { aderente: true })], [{ email: 'c@x.it' }]);
esigi(d.presenza.soloConvegno === 2 && d.presenza.aderenti === 3 && d.presenza.aziende === 0 && d.presenza.tutti === 3,
    'la sezione Aderenti Revilaw e\' in presenza; chi di loro e\' anche alla cena si conta con la cena', JSON.stringify(d));
d = daAppDove([], [{ email: 'c@x.it' }], [O('c@x.it', 1)]);
esigi(d.online.cena === 1 && d.online.tutti === 1 && d.presenza.cena === 0,
    'chi aspetta la conferma dice gia\' dove sta chi e\' alla cena', JSON.stringify(d));
d = daAppDove(null, null);
esigi(d.presenza.tutti === 0 && d.online.tutti === 0, 'niente di niente: tutto a zero');
let insieme = 0, ciascuno = 0;
for (let k = 0; k < 1000; k++) {
    const conv = Array.from({ length: Math.floor(caso() * 12) }, () => {
        const gruppo = caso() < 0.5 ? 'g' + Math.floor(caso() * 3) : '';
        return {
            email: indirizzi[Math.floor(caso() * indirizzi.length)],
            persone: 1 + Math.floor(caso() * 3),
            aderente: caso() < 0.2,
            gruppo: gruppo,
            // un ordine sta tutto da una parte: la sua sorte la decide il gruppo
            sala: gruppo ? gruppo !== 'g1' : caso() < 0.6
        };
    });
    const cena = Array.from({ length: Math.floor(caso() * 5) }, () => ({ email: indirizzi[Math.floor(caso() * indirizzi.length)] }));
    const intero = R.totaliConAderenti(conv, cena), due = daAppDove(conv, cena);
    if (['aziende', 'aderenti', 'cena', 'soloConvegno', 'tutti'].every(c => due.presenza[c] + due.online[c] === intero[c])) insieme++;
    if (due.presenza.aziende + due.presenza.aderenti === due.presenza.tutti && due.online.aziende + due.online.aderenti === due.online.tutti) ciascuno++;
}
esigi(insieme === 1000, 'mille elenchi a caso: in presenza + online = il totale intero, numero per numero', insieme + '/1000');
esigi(ciascuno === 1000, 'e in ciascun riepilogo aziende + aderenti = il totale di tutti', ciascuno + '/1000');

console.log('\nNelle due parti ci sono le stesse parole');
esigi(/'totale aziende'/.test(APP) && /'totale aziende \+ aderenti'/.test(APP), 'l\'area riservata dice "totale aziende" e "totale aziende + aderenti"');
const MNGB = fs.readFileSync(path.join(__dirname, '..', 'lib', 'mail-ngb.js'), 'utf8');
esigi(/'Totale aziende'/.test(MNGB) && /'Totale aziende \+ aderenti'/.test(MNGB), 'e le mail di mezzanotte lo stesso');

console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
