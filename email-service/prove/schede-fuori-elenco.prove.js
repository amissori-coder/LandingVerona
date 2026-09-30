/* ============================================================
   PROVE - le due schede di chi in elenco non c'e'
   ------------------------------------------------------------
       node prove/schede-fuori-elenco.prove.js

   Niente da installare: `rispondi` si ritaglia dal sorgente vero di
   api/iscrizioni.js, e le funzioni della schermata dal sorgente vero
   di area-riservata/app.js.

   PERCHE' ESISTONO. L'elenco degli iscritti mostra chi viene al
   convegno, e per farlo deve lasciare fuori due gruppi di persone.
   Sono scelte giuste, e tutte e due lasciavano chi guarda senza una
   risposta:

     - CHI E' STATO CANCELLATO. La riga sparisce per tutti, e con lei
       la domanda "chi l'ha tolta, e quando?". La traccia sul server
       c'era da sempre; quello che mancava era un posto dove leggerla,
       e una cancellazione per sbaglio restava invisibile finche'
       qualcuno non chiedeva di quella persona.

     - CHI E' INVITATO AI SOLI INCONTRI B2B. Viene al desk e in sala
       non si siede: in elenco conterebbe come un posto da preparare.

   Qui si verifica che le due schede dicano la verita': chi c'e', da
   dove viene il dato, e che cosa resta quando non resta niente.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const API = fs.readFileSync(path.join(__dirname, '..', 'api', 'iscrizioni.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'app.js'), 'utf8');

function ritaglia(testo, apertura, apre, chiude) {
    const inizio = testo.indexOf(apertura);
    if (inizio < 0) throw new Error('non trovato: ' + apertura);
    let i = testo.indexOf(apre, inizio), aperte = 0, fine = -1;
    for (; i < testo.length; i++) {
        if (testo[i] === apre) aperte++;
        else if (testo[i] === chiude) { aperte--; if (!aperte) { fine = i + 1; break; } }
    }
    if (fine < 0) throw new Error('chiusura non trovata per: ' + apertura);
    return testo.slice(inizio, fine);
}

/* --- il servizio: `rispondi`, con la sua `ordina` --- */
const SERVIZIO = new Function('res',
    ritaglia(API, 'function quando(', '{', '}') + '\n'
    + ritaglia(API, 'function ordina(', '{', '}') + '\n'
    + ritaglia(API, 'function rispondi(', '{', '}')
    + '\nreturn rispondi;'
);
function risposta(lista, cancellate) {
    let uscita = null;
    const res = { status: () => ({ json: o => { uscita = o; } }) };
    SERVIZIO(res)(res, lista, ['firestore'], {}, cancellate, '', 3);
    return uscita;
}

/* --- la schermata: chi resta fuori dall'elenco --- */
const SCHERMO = new Function('EventiPresenze',
    ritaglia(APP, 'const SEZIONI_MODALITA = [', '[', ']') + ';\n'
    + ritaglia(APP, 'function modalitaDi(', '{', '}') + '\n'
    + ritaglia(APP, 'function fuoriElenco(', '{', '}')
    + '\nreturn (ev, lista) => lista.filter(r => fuoriElenco(modalitaDi(ev, r)));'
)({ di: () => ({}) });

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

const RIGHE = [
    { id: 'mario@alfa.it|01/09/2026', data: '01/09/2026', nome: 'Mario', cognome: 'Rossi', email: 'mario@alfa.it', azienda: 'Alfa Srl', telefono: '333' },
    { id: 'ida@beta.it|02/09/2026', data: '02/09/2026', nome: 'Ida', cognome: 'Neri', email: 'ida@beta.it', azienda: 'Beta Srl', telefono: '' },
    { id: 'lia@gamma.it|03/09/2026', data: '03/09/2026', nome: 'Lia', cognome: 'Blu', email: 'lia@gamma.it', azienda: 'Gamma Srl', telefono: '' }
];
const FIRMA = { da: 'a.missori@emvas.tax', daNome: 'Andrea Missori', collab: '', quando: 1759000000000 };

prova('I cancellati escono dall elenco e finiscono nella loro scheda', () => {
    const r = risposta(RIGHE, { 'ida@beta.it|02/09/2026': FIRMA });
    esigi(r.iscrizioni.length === 2, 'l elenco degli iscritti resta senza di lei', String(r.iscrizioni.length));
    esigi(!r.iscrizioni.some(x => x.email === 'ida@beta.it'), 'e non ricompare nemmeno se torna dal foglio');
    esigi(Array.isArray(r.cancellati) && r.cancellati.length === 1, 'la scheda dei cancellati la porta', JSON.stringify(r.cancellati));
    const c = r.cancellati[0];
    esigi(c.nome === 'Ida' && c.azienda === 'Beta Srl', 'per intero: nome e azienda ci sono ancora');
    esigi(c.tolta && c.tolta.daNome === 'Andrea Missori', 'con chi l ha cancellata');
    esigi(c.tolta && c.tolta.quando === FIRMA.quando, 'e quando');
    esigi(c.sparita !== true, 'e non si dichiara sparita, perche la riga c e ancora');
});

prova('Di chi non ha piu nessuna riga restano indirizzo e data', () => {
    /* Cancellata la scheda E tolta la riga dal foglio, non resta niente da
       leggere: l identificativo pero e' "email|data", e quei due dati bastano
       a riconoscere la persona. Meglio una riga magra che una persona che
       non risulta cancellata da nessuno. */
    const r = risposta(RIGHE, { 'zoe@delta.it|10/09/2026': FIRMA });
    esigi(r.cancellati.length === 1, 'la cancellazione si vede lo stesso');
    const c = r.cancellati[0];
    esigi(c.email === 'zoe@delta.it', 'con l indirizzo ricavato dall identificativo', c.email);
    esigi(c.data === '10/09/2026', 'e la data di iscrizione', c.data);
    esigi(c.sparita === true, 'marcata: cosi una riga mezza vuota non sembra un errore di lettura');
    esigi(r.iscrizioni.length === 3, 'e nessuno degli iscritti sparisce per sbaglio');
});

prova('Senza cancellazioni la scheda e vuota, non assente', () => {
    const r = risposta(RIGHE, {});
    esigi(Array.isArray(r.cancellati), 'il campo c e sempre');
    esigi(r.cancellati.length === 0, 'e non contiene niente');
    /* La differenza fra "elenco vuoto" e "campo assente" e' quella fra "nessuno
       e' stato cancellato" e "il servizio e' indietro e non lo sa": la
       schermata le distingue, e per farlo le deve ricevere diverse. */
    esigi(risposta(RIGHE, {}).cancellati.length === 0 && r.iscrizioni.length === 3,
        'mentre gli iscritti restano tutti');
});

prova('Piu cancellazioni si leggono dalla piu recente', () => {
    const r = risposta(RIGHE, {
        'mario@alfa.it|01/09/2026': FIRMA,
        'lia@gamma.it|03/09/2026': FIRMA
    });
    esigi(r.cancellati.length === 2, 'ci sono tutte e due');
    esigi(r.cancellati[0].data === '03/09/2026', 'e in cima sta l iscrizione piu recente, come nell elenco',
        r.cancellati.map(x => x.data).join(' | '));
    esigi(r.iscrizioni.length === 1, 'l elenco resta con chi non e stato toccato');
});

prova('Gli invitati ai soli incontri stanno nella scheda, non in elenco', () => {
    const lista = [
        { id: '1', nome: 'Giovanni', cognome: 'Albanese', azienda: 'Capri Relax Srl', modalita: 'b2b', soloB2B: true },
        { id: '2', nome: 'Mario', cognome: 'Rossi', azienda: 'Alfa Srl' },
        { id: '3', nome: 'Ida', cognome: 'Neri', azienda: 'Beta Srl', modalita: 'online' },
        { id: '4', nome: 'Ugo', cognome: 'Verdi', azienda: 'Delta Srl', modalita: 'aderenti' }
    ];
    const fuori = SCHERMO({ id: 'napoli' }, lista);
    esigi(fuori.length === 1, 'ce n e uno solo', fuori.map(r => r.azienda).join(' | '));
    esigi(fuori[0].azienda === 'Capri Relax Srl', 'ed e l impresa invitata ai soli tavoli');
    /* Chi segue ONLINE non ha un posto in sala e resta comunque un iscritto:
       e' l altra meta della regola, e confonderle vorrebbe dire far sparire
       gli online dall elenco. */
    esigi(!fuori.some(r => r.modalita === 'online'), 'chi segue online non finisce qui: e iscritto');
    esigi(!fuori.some(r => r.modalita === 'aderenti'), 'ne un aderente Revilaw, che in sala ci sta');
});

/* ------------------------------------------------------------
   IL MONTAGGIO: che le due schede siano davvero raggiungibili
   ------------------------------------------------------------ */
prova('Le due schede si aprono dal riquadro delle iscrizioni', () => {
    esigi(/id="ev-cancellati"/.test(APP), 'il pulsante dei cancellati c e');
    esigi(/id="ev-solo-b2b"/.test(APP), 'e quello degli invitati ai soli incontri');
    esigi(/bCan\.addEventListener\('click', \(\) => modaleCancellati\(ev\)\)/.test(APP), 'il primo apre la sua scheda');
    esigi(/bSb2b\.addEventListener\('click', \(\) => modaleSoloB2B\(ev\)\)/.test(APP), 'e il secondo la sua');
    /* I cancellati li vede solo chi puo' cancellare: la scheda dice chi ha
       tolto chi, ed e' una traccia di chi lavora, non un elenco di ospiti. */
    const sched = APP.slice(APP.indexOf('function modaleCancellati('), APP.indexOf('function modaleSoloB2B('));
    esigi(/Auth\.eAdmin\(\) \|\| Auth\.eProprietario\(\)/.test(sched), 'e la scheda dei cancellati resta all amministratore');
    /* Il servizio indietro non deve far dire "nessun cancellato": e' la
       differenza fra una risposta vera e una rassicurazione falsa. */
    esigi(/_evCancellati === null/.test(sched), 'e un servizio indietro si riconosce, invece di annunciare zero');
    esigi(/_evCancellati = Array\.isArray\(r\.cancellati\) \? r\.cancellati : null/.test(APP),
        'perche chi legge distingue "nessuno" da "non me l ha mandato"');
});

console.log('\nLe due schede di chi in elenco non c e\n');
for (const p of prove) {
    console.log('\n' + p.titolo);
    try { p.fn(); } catch (e) { ko++; console.log('  ROSSO  eccezione: ' + (e && e.stack || e)); }
}
console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
