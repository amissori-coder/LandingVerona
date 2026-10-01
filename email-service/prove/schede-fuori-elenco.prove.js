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
    + ritaglia(APP, 'function inSala(', '{', '}') + '\n'
    + ritaglia(APP, 'function fuoriElenco(', '{', '}') + '\n'
    + ritaglia(APP, 'function invitoB2BDi(', '{', '}') + '\n'
    + ritaglia(APP, 'function esitoMailB2B(', '{', '}')
    + '\nreturn {'
    + '  fuori: (ev, lista) => lista.filter(r => fuoriElenco(modalitaDi(ev, r))),'
    /* Le due righe che decidono chi entra nella scheda degli incontri e chi
       e' segnato "non in sala": ricopiate da modaleIncontriB2B, che e' dentro
       una funzione troppo grande per ritagliarla da sola. */
    + '  aiTavoli: (ev, lista) => lista.filter(r => invitoB2BDi(r, ev.id)'
    + '      || !!String((r.extra || {})["B2B prenotati"] || "").trim()),'
    + '  inSala: (ev, r) => inSala(modalitaDi(ev, r)),'
    + '  esito: esitoMailB2B'
    + '};'
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
    const fuori = SCHERMO.fuori({ id: 'napoli' }, lista);
    esigi(fuori.length === 1, 'ce n e uno solo', fuori.map(r => r.azienda).join(' | '));
    esigi(fuori[0].azienda === 'Capri Relax Srl', 'ed e l impresa invitata ai soli tavoli');
    /* Chi segue ONLINE non ha un posto in sala e resta comunque un iscritto:
       e' l altra meta della regola, e confonderle vorrebbe dire far sparire
       gli online dall elenco. */
    esigi(!fuori.some(r => r.modalita === 'online'), 'chi segue online non finisce qui: e iscritto');
    esigi(!fuori.some(r => r.modalita === 'aderenti'), 'ne un aderente Revilaw, che in sala ci sta');
});

/* ------------------------------------------------------------
   CHI VIENE AI TAVOLI E IN SALA NON SI SIEDE
   ------------------------------------------------------------
   La scheda degli incontri porta TUTTI quelli che hanno a che fare con i
   tavoli, invitati e prenotati, e dice per ciascuno se in sala ci va. Prima
   portava i soli non-in-sala, e la distinzione aveva righe da una parte
   sola: chi la apriva per sapere chi non viene al convegno non aveva niente
   da confrontare. */
const AI_TAVOLI = [
    /* invitata e iscritta in presenza: viene a tutti e due */
    { id: '1', nome: 'Mario', cognome: 'Rossi', azienda: 'Alfa Srl', email: 'mario@alfa.it',
      aziendaB2B: { id: 'alfa', evento: 'napoli', quando: 1758400000000 }, extra: { 'B2B prenotati': 'Merito creditizio' } },
    /* invitata ma NON in sala: e' la riga per cui la scheda si apre */
    { id: '2', nome: 'Giovanni', cognome: 'Albanese', azienda: 'Capri Relax Srl', email: 'info@caprirelaxboats.com',
      modalita: 'b2b', soloB2B: true, aziendaB2B: { id: 'capri', evento: 'napoli', quando: 1758500000000 },
      extra: { 'B2B prenotati': 'Finanza agevolata' } },
    /* iscritta in presenza ma mai invitata ai tavoli: fuori da questa scheda */
    { id: '3', nome: 'Ida', cognome: 'Neri', azienda: 'Beta Srl', email: 'ida@beta.it' },
    /* invitata per un ALTRO evento: non e' di questa giornata */
    { id: '4', nome: 'Ugo', cognome: 'Verdi', azienda: 'Delta Srl', email: 'ugo@delta.it',
      aziendaB2B: { id: 'delta', evento: 'verona', quando: 1750000000000 } },
    /* segue online: in sala non si siede nemmeno lei, e va detto */
    { id: '5', nome: 'Lia', cognome: 'Blu', azienda: 'Gamma Srl', email: 'lia@gamma.it', modalita: 'online',
      aziendaB2B: { id: 'gamma', evento: 'napoli', quando: 1758600000000 } }
];
const EV = { id: 'napoli' };

prova('Nella scheda entra chi ha a che fare con i tavoli, e nessun altro', () => {
    const r = SCHERMO.aiTavoli(EV, AI_TAVOLI).map(x => x.azienda);
    esigi(r.length === 3, 'le tre invitate di questa giornata', r.join(' | '));
    esigi(r.indexOf('Beta Srl') < 0, 'chi non e stato invitato ai tavoli non c e');
    esigi(r.indexOf('Delta Srl') < 0, 'e nemmeno chi e stato invitato a un altro convegno');
});

prova('Si vede chi, fra quelli dei tavoli, in sala non si siede', () => {
    const tavoli = SCHERMO.aiTavoli(EV, AI_TAVOLI);
    const fuori = tavoli.filter(r => !SCHERMO.inSala(EV, r)).map(r => r.azienda);
    esigi(fuori.length === 2, 'due non sono iscritti in presenza', fuori.join(' | '));
    esigi(fuori.indexOf('Capri Relax Srl') >= 0, 'l invitata ai soli incontri');
    /* Chi segue ONLINE in sala non ci va nemmeno lui: e' un iscritto, ma il
       posto non lo occupa, e alla domanda "chi non viene in sala?" la
       risposta lo comprende. */
    esigi(fuori.indexOf('Gamma Srl') >= 0, 'e chi segue online, che in sala non si siede');
    esigi(SCHERMO.inSala(EV, tavoli[0]) === true, 'mentre chi e iscritto in presenza risulta in sala');
});

/* ------------------------------------------------------------
   VERIFICA DELLE MAIL: chi ha ricevuto e chi no
   ------------------------------------------------------------
   "Inviata" vuol dire soltanto che il relay ha preso in carico il messaggio.
   Gli esiti veri li conosce Brevo, e la scheda li legge a richiesta. */
prova('Ogni esito ha la sua frase, e il rimbalzo si vede rosso', () => {
    const E = {
        'rimbalzo@x.it': { rimbalzo: 1, motivo: 'mailbox unavailable' },
        'spam@x.it': { spam: 1, consegnata: 1 },
        'clic@x.it': { clic: 1, aperta: 1, consegnata: 1 },
        'aperta@x.it': { aperta: 1, consegnata: 1 },
        'consegnata@x.it': { consegnata: 1 }
    };
    esigi(SCHERMO.esito(E, 'rimbalzo@x.it').classe === 'rosso', 'la mail non arrivata si vede rossa');
    esigi(/NON arrivata/.test(SCHERMO.esito(E, 'rimbalzo@x.it').testo), 'e lo dice senza giri di parole');
    esigi(SCHERMO.esito(E, 'rimbalzo@x.it').nota === 'mailbox unavailable',
        'con il motivo scritto dal server del destinatario');
    esigi(SCHERMO.esito(E, 'spam@x.it').classe === 'rosso', 'la segnalazione di spam pesa quanto un rimbalzo');
    esigi(SCHERMO.esito(E, 'clic@x.it').classe === 'verde', 'chi ha premuto il pulsante e verde');
    esigi(SCHERMO.esito(E, 'aperta@x.it').classe === 'verde', 'e cosi chi ha aperto');
    /* Consegnata ma non aperta e' il caso ambiguo per cui si telefona: la
       mail c'e', nessuno l'ha guardata. Ne verde ne rosso. */
    esigi(SCHERMO.esito(E, 'consegnata@x.it').classe === 'ambra', 'consegnata ma non aperta resta in mezzo');
});

prova('Non sapere non e "non arrivata"', () => {
    /* L assenza della riga vuol dire che Brevo non riporta niente per quell
       indirizzo: guarda indietro novanta giorni e non garantisce di avere
       tutto. Leggerlo come "non e arrivata" farebbe richiamare gente a cui la
       mail e arrivata benissimo. */
    const e = SCHERMO.esito({}, 'ignoto@x.it');
    esigi(e.classe === 'neutro', 'un indirizzo di cui non si sa niente non e un errore');
    esigi(!/NON arrivata/.test(e.testo), 'e non si dice che la mail non e arrivata', e.testo);
    esigi(SCHERMO.esito(null, 'ignoto@x.it').classe === 'neutro', 'e senza nessuna lettura vale lo stesso');
    /* Le maiuscole degli indirizzi non devono perdere l esito: Brevo li
       scrive in minuscolo, le schede no. */
    esigi(SCHERMO.esito({ 'x@y.it': { consegnata: 1 } }, '  X@Y.IT ').classe === 'ambra',
        'e l indirizzo si confronta senza maiuscole ne spazi');
});

/* ------------------------------------------------------------
   IL MONTAGGIO: che le due schede siano davvero raggiungibili
   ------------------------------------------------------------ */
prova('Le due schede si aprono dal riquadro delle iscrizioni', () => {
    esigi(/id="ev-cancellati"/.test(APP), 'il pulsante dei cancellati c e');
    esigi(/id="ev-solo-b2b"/.test(APP), 'e quello degli invitati ai soli incontri');
    esigi(/bCan\.addEventListener\('click', \(\) => modaleCancellati\(ev\)\)/.test(APP), 'il primo apre la sua scheda');
    esigi(/bSb2b\.addEventListener\('click', \(\) => modaleIncontriB2B\(ev\)\)/.test(APP), 'e il secondo la sua');
    /* I cancellati li vede solo chi puo' cancellare: la scheda dice chi ha
       tolto chi, ed e' una traccia di chi lavora, non un elenco di ospiti. */
    const sched = APP.slice(APP.indexOf('function modaleCancellati('), APP.indexOf('function confermaCancellaIscrizione('));
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
