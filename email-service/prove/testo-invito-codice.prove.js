/* ============================================================
   PROVE - area-riservata/app.js, il codice nella PEC di invito
   ------------------------------------------------------------
       node prove/testo-invito-codice.prove.js

   Niente da installare e niente di finto: le funzioni che scrivono
   l'invito si ritagliano dal sorgente VERO di app.js, e da li' si
   leggono anche l'evento di Milano (EVENTI_DEF) e l'indirizzo del
   sito (SITO_PUBBLICO), cosi' la prova non collauda una copia che
   puo' divergere. Il tetto del servizio si legge dal sorgente di
   lib/iscrizione-verificata.js.

   PERCHE' ESISTONO. A Milano un codice invito vale per DUE
   iscrizioni: il servizio lo fa rispettare
   (lib/iscrizione-verificata.js, MAX_PER_CODICE) e la PEC che porta
   il codice lo deve dire. Altrimenti la regola si scopre al modulo,
   quando la terza persona dell'azienda si vede rifiutare il codice,
   e a quel punto e' una telefonata in segreteria. La lettera parte
   verso migliaia di aziende in una volta: una frase che manca, o
   che dice un numero diverso da quello del servizio, non si
   corregge dopo.

   Qui si verifica che:
     - con il tetto (Milano) la frase "due iscrizioni" ci sia, in
       tutte e due le versioni (sala e diretta), in lettere, nel
       capoverso che segue il codice;
     - il codice resti da solo nel suo capoverso: e' quello che lo
       fa diventare il riquadro nella mail;
     - il numero scritto sull'evento sia lo stesso del servizio;
     - senza tetto (Napoli e ogni altro evento) il testo resti
       quello di prima, parola per parola;
     - il pulsante "Programma e registrazione" porti alla pagina di
       Milano e l'apertura dica sede e indirizzo.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'app.js'), 'utf8');
const VERIFICATA = fs.readFileSync(path.join(__dirname, '..', 'lib', 'iscrizione-verificata.js'), 'utf8');

/* Il ritaglio per nome: si cerca l'inizio e si contano le parentesi fino
   alla chiusura. Lo stesso mestiere di prove/elenco-definitivo.prove.js. */
function ritaglia(apertura, apre, chiude) {
    const inizio = APP.indexOf(apertura);
    if (inizio < 0) throw new Error('non trovato in app.js: ' + apertura);
    let i = APP.indexOf(apre, inizio), aperte = 0, fine = -1;
    for (; i < APP.length; i++) {
        if (APP[i] === apre) aperte++;
        else if (APP[i] === chiude) { aperte--; if (!aperte) { fine = i + 1; break; } }
    }
    if (fine < 0) throw new Error('chiusura non trovata per: ' + apertura);
    return APP.slice(inizio, fine);
}
/* Le regex e le costanti di una riga si prendono intere: il ritaglio a
   parentesi non serve. */
function rigaDaAppJs(inizio) {
    const riga = APP.split('\n').filter(r => r.trim().indexOf(inizio) === 0);
    if (riga.length !== 1) throw new Error('in app.js non c\'e\' una sola riga che comincia con: ' + inizio);
    return riga[0].trim();
}

const pezzi = [
    rigaDaAppJs('const SITO_PUBBLICO ='),
    rigaDaAppJs('const INV_URL ='),
    ritaglia('const EVENTI_DEF = [', '[', ']') + ';',
    ritaglia('function esc(', '{', '}'),
    ritaglia('function invEtichettaUrl(', '{', '}'),
    ritaglia('function invCentrato(', '{', '}'),
    ritaglia('function invRiquadroCodice(', '{', '}'),
    ritaglia('function invPulsante(', '{', '}'),
    ritaglia('function invTestoInHtml(', '{', '}'),
    ritaglia('function invAperturaInvito(', '{', '}'),
    ritaglia('function invPaginaEvento(', '{', '}'),
    ritaglia('function invIscrizioniPerCodice(', '{', '}'),
    ritaglia('function invInLettere(', '{', '}'),
    ritaglia('function invParagrafoCodice(', '{', '}'),
    ritaglia('function invTestoSala(', '{', '}'),
    ritaglia('function invTestoDiretta(', '{', '}')
].join('\n');
const APPJS = new Function(pezzi + '\nreturn {'
    + ' EVENTI_DEF, SITO_PUBBLICO, invTestoSala, invTestoDiretta, invTestoInHtml,'
    + ' invParagrafoCodice, invIscrizioniPerCodice, invInLettere };')();

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

const capoversi = t => String(t).split('\n\n');
const MILANO = APPJS.EVENTI_DEF.find(e => e.id === 'milano-2027-02-26');
const NAPOLI = APPJS.EVENTI_DEF.find(e => e.id === 'napoli-2026-10-02');
/* Un evento qualunque, senza tetto e senza niente di suo: il caso di
   Verona e Roma, e di ogni evento futuro che non lo fissi. */
const QUALUNQUE = { id: 'x', titolo: 'Torino', quando: '1 marzo 2027', luogo: 'Lingotto', urlPagina: '/torino/' };

/* Le frasi di prima, copiate dal testo com'era: sono quelle che a ogni
   evento senza tetto devono arrivare uguali. */
const VECCHIO_SALA = 'Il codice è nominativo, vale per la sola azienda a cui questo messaggio è indirizzato '
    + 'e va indicato nel modulo di registrazione, nel campo dedicato: è quello che ci permette '
    + 'di riconoscere le aziende selezionate e di tenere il posto riservato.';
const VECCHIO_DIRETTA = 'Il codice è nominativo, vale per la sola azienda a cui questo messaggio è indirizzato e va '
    + 'indicato nel modulo di iscrizione, nel campo dedicato: è quello che ci permette di riconoscere '
    + 'le aziende selezionate e di darVi la precedenza sulla lista d\'attesa per la sala.';
const DUE_SALA = 'Lo stesso codice consente al massimo due iscrizioni: possono utilizzarlo fino a due persone '
    + 'della Vostra azienda, ciascuna registrandosi con il proprio nome, il proprio indirizzo email e il '
    + 'proprio numero di cellulare.';
const DUE_DIRETTA = DUE_SALA.replace('registrandosi', 'iscrivendosi');

/* ------------------------------------------------------------
   MILANO: IL CODICE VALE PER DUE ISCRIZIONI
   ------------------------------------------------------------ */

prova('L evento di Milano e il servizio dicono lo stesso numero', () => {
    esigi(!!MILANO, 'Milano c e in EVENTI_DEF');
    const m = /const MAX_PER_CODICE = (\d+);/.exec(VERIFICATA);
    esigi(!!m, 'il servizio fissa MAX_PER_CODICE');
    esigi(m && MILANO.iscrizioniPerCodice === Number(m[1]),
        'iscrizioniPerCodice di Milano = MAX_PER_CODICE del servizio', MILANO.iscrizioniPerCodice + ' / ' + (m && m[1]));
});

prova('Versione sala: il codice da solo, poi la frase delle due iscrizioni', () => {
    const p = capoversi(APPJS.invTestoSala(MILANO));
    const i = p.indexOf('{codice}');
    esigi(i > 0, 'il codice sta da solo nel suo capoverso');
    esigi(p.filter(x => x.indexOf('{codice}') >= 0).length === 1, 'e compare una volta sola');
    esigi(p[i - 1] === 'Alla Vostra azienda è riservato il seguente codice di accesso:', 'preceduto dalla riga che lo annuncia');
    esigi(p[i + 1] === VECCHIO_SALA, 'seguito dalla spiegazione di sempre', p[i + 1]);
    esigi(p[i + 2] === DUE_SALA, 'e subito dopo la frase delle due iscrizioni', p[i + 2]);
    esigi(/due iscrizioni/.test(p[i + 2]) && !/2 iscrizioni/.test(p.join('\n\n')), 'il numero e scritto in lettere');
    esigi(/^La partecipazione è gratuita/.test(p[i + 3]), 'poi la lettera riprende come prima');
});

prova('Versione diretta: la stessa frase, con "iscriversi"', () => {
    const p = capoversi(APPJS.invTestoDiretta(MILANO));
    const i = p.indexOf('{codice}');
    esigi(i > 0, 'il codice sta da solo nel suo capoverso');
    esigi(p[i + 1] === VECCHIO_DIRETTA, 'seguito dalla spiegazione di sempre della diretta', p[i + 1]);
    esigi(p[i + 2] === DUE_DIRETTA, 'e dalla frase delle due iscrizioni', p[i + 2]);
    esigi(/^Nei giorni precedenti/.test(p[i + 3]), 'poi la lettera riprende come prima');
});

prova('Nella mail il codice diventa il riquadro e la frase resta un capoverso', () => {
    const html = APPJS.invTestoInHtml(APPJS.invTestoSala(MILANO));
    esigi((html.match(/Codice riservato/g) || []).length === 1, 'un riquadro "Codice riservato"');
    esigi((html.match(/\{codice\}/g) || []).length === 1, 'il segnaposto sta solo dentro il riquadro');
    esigi(html.indexOf('<p style="margin:0 0 14px;line-height:1.6;">Lo stesso codice consente al massimo due iscrizioni') >= 0,
        'la frase delle due iscrizioni e un capoverso della lettera');
});

prova('Il pulsante porta alla pagina di Milano, l apertura dice dove', () => {
    const atteso = 'https://nextgenerationbusiness.it/milano_febbraio_2027/';
    esigi(APPJS.SITO_PUBBLICO + MILANO.urlPagina === atteso, 'la pagina dell evento e quella di Milano');
    const t = APPJS.invTestoSala(MILANO);
    esigi(capoversi(t).indexOf(atteso) >= 0, 'l indirizzo sta da solo su una riga');
    const html = APPJS.invTestoInHtml(t);
    esigi(html.indexOf('href="' + atteso + '"') >= 0 && html.indexOf('>Programma e registrazione</a>') >= 0,
        'e diventa il pulsante "Programma e registrazione"');
    esigi(t.indexOf('in programma il 26 febbraio 2027 presso Excelsior Hotel Gallia, Piazza Duca d\'Aosta 9, Milano.') >= 0,
        'l apertura dice sede e indirizzo');
    esigi(capoversi(APPJS.invTestoDiretta(MILANO)).indexOf(atteso) >= 0, 'anche nella versione diretta');
});

/* ------------------------------------------------------------
   SENZA TETTO: IL TESTO DI SEMPRE
   ------------------------------------------------------------ */

prova('Un evento senza tetto riceve la lettera di prima, parola per parola', () => {
    esigi(!!NAPOLI && NAPOLI.iscrizioniPerCodice === undefined, 'Napoli non fissa un tetto');
    for (const ev of [NAPOLI, QUALUNQUE]) {
        const sala = capoversi(APPJS.invTestoSala(ev));
        const i = sala.indexOf('{codice}');
        esigi(sala[i + 1] === VECCHIO_SALA, ev.titolo + ', sala: la frase di sempre', sala[i + 1]);
        esigi(/^La partecipazione è gratuita/.test(sala[i + 2]), ev.titolo + ', sala: nessun capoverso in piu');
        const dir = capoversi(APPJS.invTestoDiretta(ev));
        const j = dir.indexOf('{codice}');
        esigi(dir[j + 1] === VECCHIO_DIRETTA, ev.titolo + ', diretta: la frase di sempre', dir[j + 1]);
        esigi(/^Nei giorni precedenti/.test(dir[j + 2]), ev.titolo + ', diretta: nessun capoverso in piu');
        esigi(!/iscrizion[ei]:/.test(sala.join(' ') + dir.join(' ')), ev.titolo + ': nessuna frase sul tetto');
    }
});

/* ------------------------------------------------------------
   IL NUMERO, COMUNQUE SIA SCRITTO
   ------------------------------------------------------------ */

prova('Il tetto si legge con prudenza e si scrive in lettere', () => {
    const n = v => APPJS.invIscrizioniPerCodice({ iscrizioniPerCodice: v });
    esigi(n(2) === 2 && n('2') === 2, 'due, anche scritto come testo');
    esigi(n(undefined) === 0 && n(0) === 0 && n(-1) === 0 && n('tanti') === 0 && APPJS.invIscrizioniPerCodice(null) === 0,
        'mancante, zero, negativo o non numerico: nessun tetto');
    esigi(n(2.7) === 2, 'un decimale si arrotonda per difetto');
    esigi(APPJS.invInLettere(2) === 'due' && APPJS.invInLettere(10) === 'dieci' && APPJS.invInLettere(12) === '12',
        'fino a dieci in lettere, poi in cifre');
});

prova('Una sola iscrizione, o piu di due: la frase si adatta', () => {
    const uno = capoversi(APPJS.invParagrafoCodice(Object.assign({}, MILANO, { iscrizioniPerCodice: 1 }), 'sala'));
    esigi(uno.some(x => x.indexOf('Il codice consente una sola iscrizione: può utilizzarlo una persona della Vostra azienda, registrandosi') === 0),
        'uno: "una sola iscrizione", al singolare', uno.join(' | '));
    const tre = capoversi(APPJS.invParagrafoCodice(Object.assign({}, MILANO, { iscrizioniPerCodice: 3 }), 'diretta'));
    esigi(tre.some(x => x.indexOf('Lo stesso codice consente al massimo tre iscrizioni: possono utilizzarlo fino a tre persone') === 0),
        'tre: in lettere, al plurale', tre.join(' | '));
    const tutto = APPJS.invParagrafoCodice(MILANO, 'sala');
    esigi(/\n\n$/.test(tutto) && !/\n\n\n/.test(tutto), 'il blocco chiude con un solo a capo doppio, come gli altri capoversi');
    esigi(!/[–—]/.test(APPJS.invTestoSala(MILANO) + APPJS.invTestoDiretta(MILANO)), 'nessuna lineetta lunga');
});

console.log('\nIl codice nella PEC di invito\n');
for (const p of prove) { console.log('\n' + p.titolo); p.fn(); }
console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
