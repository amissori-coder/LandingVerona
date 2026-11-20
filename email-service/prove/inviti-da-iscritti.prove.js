/* ============================================================
   PROVE - area-riservata/app.js, gli iscritti di un evento come
   elenco da invitare a un altro (righeDaIscritti)
   ------------------------------------------------------------
       node prove/inviti-da-iscritti.prove.js

   La funzione si ritaglia dal sorgente VERO di app.js.

   COSA DIMOSTRANO. Chi e' venuto a Napoli si invita al webinar
   senza passare da un file: entrano le aziende in presenza e
   online, una riga per indirizzo; restano fuori aderenti, sponsor
   e relatori, i soli incontri B2B e chi non ha un'email. La
   sezione decisa da chi organizza (presenze) vince su quella
   dichiarata iscrivendosi, e vuota vale in presenza.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'app.js'), 'utf8');
const inizio = APP.indexOf('function righeDaIscritti(');
let i = APP.indexOf('{', inizio), aperte = 0, fine = -1;
for (; i < APP.length; i++) {
    if (APP[i] === '{') aperte++;
    else if (APP[i] === '}') { aperte--; if (!aperte) { fine = i + 1; break; } }
}
const SEZIONI_MODALITA = ['presenza', 'aderenti', 'sponsor', 'online', 'b2b'].map(id => ({ id: id }));
const righeDaIscritti = new Function('SEZIONI_MODALITA', APP.slice(inizio, fine) + '; return righeDaIscritti;')(SEZIONI_MODALITA);

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}

const NAPOLI = { id: 'napoli-2026-10-02', titolo: 'Napoli' };
const ISCRITTI = [
    { id: 'a', nome: 'Anna', cognome: 'Alfa', email: 'Anna@Alfa.it', azienda: 'Alfa S.p.A.', telefono: '333' },
    { id: 'b', nome: 'Bruno', cognome: 'Beta', email: 'bruno@beta.it', azienda: 'Beta S.r.l.', modalita: 'online' },
    { id: 'c', nome: 'Carla', cognome: 'Gamma', email: 'carla@gamma.it', azienda: 'Gamma', modalita: 'presenza' },   // spostata online
    { id: 'd', nome: 'Dino', cognome: 'Delta', email: 'dino@studio.it', azienda: 'Studio Delta', modalita: 'aderenti' },
    { id: 'e', nome: 'Elsa', cognome: 'Eta', email: 'elsa@sponsor.it', azienda: 'Sponsor' },                          // spostata fra gli sponsor
    { id: 'f', nome: 'Furio', cognome: 'Zeta', email: '', azienda: 'Zeta' },
    { id: 'g', nome: 'Anna', cognome: 'Alfa', email: 'anna@alfa.it', azienda: 'Alfa S.p.A.' },                        // stessa casella
    { id: 'h', nome: 'Ida', cognome: 'Iota', email: 'ida@iota.it', azienda: '' },
    { id: 'i', nome: 'Luca', cognome: 'B2B', email: 'luca@b2b.it', azienda: 'B2B', modalita: 'b2b' }
];
const PRESENZE = { c: { modalita: 'online' }, e: { modalita: 'sponsor' } };

console.log('\nGli iscritti di Napoli come elenco da invitare');
const x = righeDaIscritti(NAPOLI, ISCRITTI, PRESENZE);
const dati = x.righe.slice(1);
esigi(x.righe[0].join('|') === 'Azienda|Email|Referente|Telefono|Note', 'le intestazioni sono quelle che il caricamento riconosce', x.righe[0].join('|'));
esigi(dati.map(r => r[1]).join(',') === 'anna@alfa.it,bruno@beta.it,carla@gamma.it,ida@iota.it', 'entrano le aziende in presenza e online, con l\'email in minuscolo', dati.map(r => r[1]).join(','));
esigi(x.conta.presenza === 2 && x.conta.online === 2, 'due in presenza e due online: la sezione di chi organizza vince', JSON.stringify(x.conta));
esigi(x.conta.altreSezioni === 3, 'aderenti, sponsor e soli B2B restano fuori');
esigi(x.conta.senzaEmail === 1 && x.conta.doppie === 1, 'chi non ha email e la stessa casella due volte restano fuori, e si contano');
esigi(dati[0][0] === 'Alfa S.p.A.' && dati[0][2] === 'Anna Alfa' && dati[0][3] === '333', 'azienda, referente e telefono al loro posto');
esigi(dati[3][0] === 'Ida Iota', 'senza azienda la riga porta il nome della persona');
esigi(dati[0][4] === 'Iscritto a Napoli (in presenza)' && dati[2][4] === 'Iscritto a Napoli (online)', 'la nota dice da dove arriva', dati[2][4]);
esigi(righeDaIscritti(NAPOLI, [], {}).righe.length === 1, 'nessun iscritto: solo le intestazioni');

console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
