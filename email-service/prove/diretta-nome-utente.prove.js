/* ============================================================
   PROVE - il nome utente della diretta (diretta/nome-utente.js)
   ------------------------------------------------------------
       node prove/diretta-nome-utente.prove.js

   Niente da installare. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Che nome e cognome diventano il nome utente con
   le regole scritte nella richiesta, uguali ovunque: accenti,
   apostrofi (dritti e tipografici), trattini, punti e spazi via,
   solo a-z e numeri; cognomi composti e doppi nomi attaccati;
   maiuscole e spazi in piu' ininfluenti; lettere straniere ridotte
   o traslitterate; che il campo di accesso ripulisce allo stesso
   modo; che la stessa email scritta in modi diversi e' la stessa
   persona; che l'anteprima del caricamento numera gli omonimi,
   riconosce i doppioni del file e le persone gia' presenti, e non
   da' mai lo stesso nome utente a due persone. E che la copia usata
   dal servizio e' IDENTICA a quella del sito.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const FILE_SITO = path.resolve(__dirname, '../../diretta/nome-utente.js');
const FILE_SERVIZIO = path.resolve(__dirname, '../lib/diretta-nome-utente.js');
const N = require(FILE_SERVIZIO);

let rossi = 0, verdi = 0;
function uguale(ottenuto, atteso, descrizione) {
    const ok = JSON.stringify(ottenuto) === JSON.stringify(atteso);
    if (ok) verdi++;
    else { rossi++; console.log('ROSSO  ' + descrizione + '\n       atteso:   ' + JSON.stringify(atteso) + '\n       ottenuto: ' + JSON.stringify(ottenuto)); }
}
function vero(cond, descrizione) { uguale(!!cond, true, descrizione); }

/* ---------- la copia del servizio e' la stessa del sito ---------- */
uguale(fs.readFileSync(FILE_SERVIZIO, 'utf8'), fs.readFileSync(FILE_SITO, 'utf8'),
    'email-service/lib/diretta-nome-utente.js e\' identica a diretta/nome-utente.js (si modifica il sito e si ricopia)');

/* ---------- gli esempi della richiesta ---------- */
uguale(N.nomeUtenteBase('Mario', 'Rossi'), 'mariorossi', 'Mario Rossi');
uguale(N.nomeUtenteBase('Anna Maria', 'De Luca'), 'annamariadeluca', 'Anna Maria De Luca');
uguale(N.nomeUtenteBase('Nicolò', "D'Angelo"), 'nicolodangelo', "Nicolò D'Angelo");

/* ---------- accenti ---------- */
uguale(N.nomeUtenteBase('Nicolò', 'Fò'), 'nicolofo', 'accento grave');
uguale(N.nomeUtenteBase('José', 'Pérez'), 'joseperez', 'accento acuto');
uguale(N.nomeUtenteBase('Zoë', 'Müller'), 'zoemuller', 'dieresi');
uguale(N.nomeUtenteBase('François', 'Façade'), 'francoisfacade', 'cediglia');
uguale(N.nomeUtenteBase('Ñuño', 'Ibáñez'), 'nunoibanez', 'tilde');
uguale(N.nomeUtenteBase('Ângelo', 'Ångström'), 'angeloangstrom', 'circonflesso e anello');
uguale(N.nomeUtenteBase('NICOLÒ', 'CANTÙ'), 'nicolocantu', 'accenti sulle maiuscole');
// la stessa lettera accentata scritta "scomposta" (lettera + segno a parte)
uguale(N.nomeUtenteBase('Nicolò', 'Cantù'), 'nicolocantu', 'accento come carattere combinante');

/* ---------- apostrofi, trattini, punti ---------- */
uguale(N.nomeUtenteBase('Nicolò', 'D’Angelo'), 'nicolodangelo', 'apostrofo tipografico ’');
uguale(N.nomeUtenteBase('Nicolò', 'D‘Angelo'), 'nicolodangelo', 'apostrofo tipografico ‘');
uguale(N.nomeUtenteBase('Nicolò', 'D`Angelo'), 'nicolodangelo', 'accento grave usato come apostrofo');
uguale(N.nomeUtenteBase('Sean', "O'Neill"), 'seanoneill', "O'Neill");
uguale(N.nomeUtenteBase('Jean-Luc', 'Picard'), 'jeanlucpicard', 'nome con trattino');
uguale(N.nomeUtenteBase('Anna', 'Rossi-Bianchi'), 'annarossibianchi', 'cognome con trattino');
uguale(N.nomeUtenteBase('Anna', 'Rossi – Bianchi'), 'annarossibianchi', 'trattino lungo con spazi');
uguale(N.nomeUtenteBase('J.R.R.', 'Tolkien'), 'jrrtolkien', 'iniziali puntate');
uguale(N.nomeUtenteBase('Maria', 'Dell’Acqua'), 'mariadellacqua', "Dell'Acqua");

/* ---------- cognomi composti e doppi nomi ---------- */
uguale(N.nomeUtenteBase('Anna Maria', 'De Luca'), 'annamariadeluca', 'doppio nome e cognome composto');
uguale(N.nomeUtenteBase('Gian Luca', 'Della Valle'), 'gianlucadellavalle', 'Gian Luca Della Valle');
uguale(N.nomeUtenteBase('Maria Grazia Rita', 'Lo Russo Di Stefano'), 'mariagraziaritalorussodistefano', 'tre nomi e cognome con tre particelle');
uguale(N.nomeUtenteBase('Pier Paolo', 'di Giovanni'), 'pierpaolodigiovanni', 'particella minuscola');

/* ---------- maiuscole e spazi ---------- */
uguale(N.nomeUtenteBase('  MARIO  ', '  ROSSI  '), 'mariorossi', 'maiuscole e spazi ai lati');
uguale(N.nomeUtenteBase('Mario\t', ' Rossi\n'), 'mariorossi', 'tabulazione, spazio unificatore, a capo');
uguale(N.nomeUtenteBase('mArIo', 'rOsSi'), 'mariorossi', 'maiuscole a caso');
uguale(N.nomeUtenteBase('Anna   Maria', 'De    Luca'), 'annamariadeluca', 'spazi doppi in mezzo');

/* ---------- caratteri stranieri ---------- */
uguale(N.nomeUtenteBase('Łukasz', 'Żółć'), 'lukaszzolc', 'polacco (ł non si scompone)');
uguale(N.nomeUtenteBase('Søren', 'Kierkegaard'), 'sorenkierkegaard', 'danese ø');
uguale(N.nomeUtenteBase('Jürgen', 'Straße'), 'jurgenstrasse', 'tedesco ß -> ss');
uguale(N.nomeUtenteBase('Æsa', 'Œuvre'), 'aesaoeuvre', 'legature æ œ');
uguale(N.nomeUtenteBase('Đorđe', 'Đoković'), 'dordedokovic', 'serbo-croato đ');
uguale(N.nomeUtenteBase('Þór', 'Guðmundsson'), 'thorgudmundsson', 'islandese þ ð');
uguale(N.nomeUtenteBase('Иван', 'Петров'), 'ivanpetrov', 'cirillico traslitterato');
uguale(N.nomeUtenteBase('Юлия', 'Щукина'), 'iuliiashchukina', 'cirillico con lettere composte');
uguale(N.nomeUtenteBase('Γιώργος', 'Παπαδόπουλος'), 'giorgospapadopoulos', 'greco traslitterato (ou)');
uguale(N.nomeUtenteBase('Ömer', 'Çelik'), 'omercelik', 'turco');
uguale(N.nomeUtenteBase('Nguyễn', 'Văn An'), 'nguyenvanan', 'vietnamita (accenti doppi)');
uguale(N.nomeUtenteBase('李', '小龙'), '', 'ideogrammi: non resta niente (l\'anteprima chiede di scriverlo a mano)');
uguale(N.nomeUtenteBase('Mario 2', 'Rossi'), 'mario2rossi', 'i numeri restano');
uguale(N.nomeUtenteBase('Mario', 'Rossi 😀'), 'mariorossi', 'emoji via');

/* ---------- lunghezza ---------- */
uguale(N.nomeUtenteBase('A'.repeat(30), 'B'.repeat(30)).length, N.LUNGHEZZA_MASSIMA, 'base tagliata alla lunghezza massima');

/* ---------- il campo di accesso ---------- */
uguale(N.pulisciAccesso('Mario Rossi'), 'mariorossi', 'accesso: "Mario Rossi"');
uguale(N.pulisciAccesso('  MarioRossi '), 'mariorossi', 'accesso: maiuscole e spazi');
uguale(N.pulisciAccesso('mario.rossi'), 'mariorossi', 'accesso: punto');
uguale(N.pulisciAccesso('Mario Rossi 2'), 'mariorossi2', 'accesso: omonimo con numero');
uguale(N.pulisciAccesso("Nicolò D'Angelo"), 'nicolodangelo', 'accesso: accento e apostrofo');

/* ---------- email ---------- */
uguale(N.emailNormalizzata('  Mario.Rossi@Example.COM '), 'mario.rossi@example.com', 'email: maiuscole e spazi');
uguale(N.emailNormalizzata('mario.rossi @ example.com'), 'mario.rossi@example.com', 'email: spazi in mezzo');
uguale(N.emailNormalizzata('mario​.rossi@example.com﻿'), 'mario.rossi@example.com', 'email: caratteri invisibili da Excel');
uguale(N.emailNormalizzata('mailto:Mario@X.it'), 'mario@x.it', 'email: mailto:');
vero(N.emailValida('mario.rossi+eventi@example.co.uk'), 'email valida con + e dominio a due livelli');
vero(!N.emailValida('mario.rossi@example'), 'email senza dominio di primo livello');
vero(!N.emailValida('mario..rossi@example.com'), 'email con due punti di fila');
vero(!N.emailValida('mario/rossi@example.com'), 'email con barra (sarebbe un percorso di Firestore)');
vero(!N.emailValida(''), 'email vuota');
vero(!N.emailValida('mario rossi'), 'testo senza chiocciola');

/* ---------- anteprima del caricamento ---------- */
function analisi(righe, esistenti) {
    return N.analizzaRighe(righe, esistenti || { perEmail: {}, occupati: [] }, 'napoli-2026');
}
{
    // omonimi dentro il file: il primo prende la base, il secondo il 2, il terzo il 3
    const r = analisi([
        { nome: 'Mario', cognome: 'Rossi', email: 'mario1@x.it' },
        { nome: 'Mario', cognome: 'Rossi', email: 'mario2@x.it' },
        { nome: 'MARIO', cognome: ' rossi ', email: 'mario3@x.it' }
    ]);
    uguale(r.righe.map(x => x.nomeUtente), ['mariorossi', 'mariorossi2', 'mariorossi3'], 'omonimi nel file numerati');
    uguale(r.righe.map(x => x.omonimo), [true, true, true], 'tutto il gruppo di omonimi evidenziato');
    uguale(r.righe.map(x => x.daConfermare), [false, true, true], 'da confermare solo i numerati');
    vero(!r.pronto, 'con omonimi da confermare l\'invio non parte');
    const c = analisi([
        { nome: 'Mario', cognome: 'Rossi', email: 'mario1@x.it' },
        { nome: 'Mario', cognome: 'Rossi', email: 'mario2@x.it', confermaOmonimo: true },
        { nome: 'Mario', cognome: 'Rossi', email: 'mario3@x.it', confermaOmonimo: true }
    ]);
    vero(c.pronto, 'confermati gli omonimi, l\'invio puo\' partire');
}
{
    // omonimo di una persona gia' registrata (email diversa): parte dal 2
    const r = analisi([{ nome: 'Mario', cognome: 'Rossi', email: 'nuovo@x.it' }],
        { perEmail: {}, occupati: ['mariorossi'] });
    uguale(r.righe[0].nomeUtente, 'mariorossi2', 'omonimo di un nome gia\' occupato');
    vero(r.righe[0].daConfermare, 'omonimo di un nome occupato da confermare');
    // buchi nella numerazione: si prende il primo libero
    const b = analisi([{ nome: 'Mario', cognome: 'Rossi', email: 'nuovo@x.it' }],
        { perEmail: {}, occupati: ['mariorossi', 'mariorossi2', 'mariorossi4'] });
    uguale(b.righe[0].nomeUtente, 'mariorossi3', 'primo numero libero');
}
{
    // stessa email scritta in modi diversi = stessa persona = un solo account
    const r = analisi([
        { nome: 'Mario', cognome: 'Rossi', email: 'Mario.Rossi@Example.com' },
        { nome: 'Mario', cognome: 'Rossi', email: '  mario.rossi@example.COM ' },
        { nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi @example.com' }
    ]);
    uguale(r.righe.map(x => x.esito), ['nuovo', 'doppione', 'doppione'], 'doppioni nel file riconosciuti per email');
    uguale(r.righe.map(x => x.nomeUtente), ['mariorossi', '', ''], 'nessun nome utente per i doppioni');
    uguale(r.conteggi.nuovi, 1, 'un solo account da creare');
    vero(r.pronto, 'i doppioni non bloccano: la riga semplicemente non crea niente');
}
{
    // persona gia' presente per email: nessun nuovo account, solo l'aggiunta all'evento
    const esistenti = { perEmail: { 'mario@x.it': { uid: 'u1', nomeUtente: 'mariorossi', nome: 'Mario', cognome: 'Rossi', eventi: ['milano-2026'] } }, occupati: ['mariorossi'] };
    const r = analisi([{ nome: 'Mario', cognome: 'Rossi', email: 'MARIO@x.it' }], esistenti);
    uguale([r.righe[0].esito, r.righe[0].nomeUtente, r.righe[0].uidEsistente], ['esistente', 'mariorossi', 'u1'], 'gia\' presente: tiene il suo nome utente');
    const g = analisi([{ nome: 'Mario', cognome: 'Rossi', email: 'mario@x.it' }],
        { perEmail: { 'mario@x.it': { uid: 'u1', nomeUtente: 'mariorossi', nome: 'Mario', cognome: 'Rossi', eventi: ['napoli-2026'] } }, occupati: ['mariorossi'] });
    uguale(g.righe[0].esito, 'gia-nell-evento', 'gia\' iscritta a questo evento');
    const d = analisi([{ nome: 'Marco', cognome: 'Rossi', email: 'mario@x.it' }], esistenti);
    vero(d.righe[0].problemi.some(p => p.codice === 'nome-diverso'), 'stessa email con un nome diverso: segnalato');
    // un nuovo "Mario Rossi" con email diversa, nello stesso file di quello gia' presente
    const o = analisi([
        { nome: 'Mario', cognome: 'Rossi', email: 'mario@x.it' },
        { nome: 'Mario', cognome: 'Rossi', email: 'altro@x.it' }
    ], esistenti);
    uguale(o.righe.map(x => x.nomeUtente), ['mariorossi', 'mariorossi2'], 'omonimo di chi e\' gia\' presente');
}
{
    // controlli sulle righe
    const r = analisi([
        { nome: 'Mario', cognome: 'Rossi', email: '' },
        { nome: 'Mario', cognome: 'Rossi', email: 'non-valida' },
        { nome: '', cognome: 'Rossi', email: 'a@x.it' },
        { nome: 'Mario', cognome: '', email: 'b@x.it' },
        { nome: '李', cognome: '小龙', email: 'c@x.it' }
    ]);
    uguale(r.righe.map(x => x.problemi.map(p => p.codice)[0]),
        ['email-mancante', 'email-non-valida', 'nome-vuoto', 'cognome-vuoto', 'nome-utente-vuoto'], 'problemi delle righe');
    uguale(r.righe.map(x => x.esito), ['errore', 'errore', 'errore', 'errore', 'errore'], 'righe in errore');
    vero(!r.pronto, 'con righe in errore l\'invio non parte');
    // escludere le righe sbagliate sblocca il caricamento
    const e = analisi([
        { nome: 'Mario', cognome: 'Rossi', email: '', escludi: true },
        { nome: 'Anna', cognome: 'Bianchi', email: 'anna@x.it' }
    ]);
    uguale(e.righe.map(x => x.esito), ['escluso', 'nuovo'], 'riga esclusa a mano');
    vero(e.pronto, 'esclusa la riga sbagliata, si puo\' procedere');
}
{
    // correzione a mano del nome utente in anteprima
    const r = analisi([
        { nome: 'Mario', cognome: 'Rossi', email: 'a@x.it' },
        { nome: 'Mario', cognome: 'Rossi', email: 'b@x.it', nomeUtente: 'Mario Rossi Napoli' }
    ], { perEmail: {}, occupati: [] });
    uguale(r.righe.map(x => x.nomeUtente), ['mariorossi', 'mariorossinapoli'], 'nome utente scritto a mano e ripulito');
    vero(r.pronto, 'con la correzione a mano l\'omonimo non va confermato');
    const occ = analisi([{ nome: 'Luca', cognome: 'Verdi', email: 'l@x.it', nomeUtente: 'mariorossi' }],
        { perEmail: {}, occupati: ['mariorossi'] });
    uguale(occ.righe[0].problemi[0].codice, 'nome-utente-occupato', 'nome scritto a mano gia\' occupato');
}
{
    // mai due volte lo stesso nome utente, anche in un file grande con molti omonimi
    const righe = [];
    for (let i = 0; i < 300; i++) righe.push({ nome: ['Mario', 'MARIO', ' mario '][i % 3], cognome: ['Rossi', 'Bianchi'][i % 2], email: 'p' + i + '@x.it', confermaOmonimo: true });
    const r = analisi(righe, { perEmail: {}, occupati: ['mariorossi', 'mariobianchi5'] });
    const nomi = r.righe.map(x => x.nomeUtente);
    uguale(new Set(nomi).size, nomi.length, '300 righe: nessun nome utente ripetuto');
    vero(nomi.indexOf('mariorossi') < 0 && nomi.indexOf('mariobianchi5') < 0, 'i nomi gia\' occupati non vengono riassegnati');
}

{
    // indirizzo condiviso: stessa email, persone diverse -> va confermato, non sparisce in silenzio
    const r = analisi([
        { nome: 'Mario', cognome: 'Rossi', email: 'info@acme.it' },
        { nome: 'Luca', cognome: 'Bianchi', email: 'INFO@acme.it' },
        { nome: 'MARIO', cognome: 'rossi', email: 'info@acme.it ' }
    ]);
    uguale(r.righe.map(x => x.esito), ['nuovo', 'doppione', 'doppione'], 'indirizzo condiviso: le righe successive sono doppioni');
    vero(r.righe[1].problemi.some(p => p.codice === 'doppione-nome-diverso') && r.righe[1].daConfermare, 'stessa email con un nome diverso: da confermare');
    vero(!r.righe[2].problemi.some(p => p.codice === 'doppione-nome-diverso') && !r.righe[2].daConfermare, 'stessa email con lo stesso nome scritto diverso: nessuna conferma');
    vero(!r.pronto, 'con un indirizzo condiviso da confermare l\'invio non parte');
    const c = analisi([
        { nome: 'Mario', cognome: 'Rossi', email: 'info@acme.it' },
        { nome: 'Luca', cognome: 'Bianchi', email: 'INFO@acme.it', confermaDoppione: true }
    ]);
    vero(c.pronto, 'confermato che e\' la stessa persona, si procede');
}
{
    // chi usa gia' il nome, nel messaggio dell'omonimo
    const r = analisi([{ nome: 'Mario', cognome: 'Rossi', email: 'nuovo@x.it' }],
        { perEmail: {}, occupati: ['mariorossi'], dettagliOccupati: { mariorossi: { nome: 'Mario', cognome: 'Rossi', azienda: 'ACME srl', emailMascherata: 'm***@acme.it' } } });
    vero(/ACME srl/.test(r.righe[0].problemi[0].testo) && /m\*\*\*@acme\.it/.test(r.righe[0].problemi[0].testo), 'l\'omonimo dice chi usa gia\' il nome');
}

console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
process.exit(rossi ? 1 : 0);
