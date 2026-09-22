/* ============================================================
   PROVE - area-riservata/app.js, l'avviso delle nuove iscrizioni
   ------------------------------------------------------------
       node prove/avviso-iscritti.prove.js

   Niente da installare: le funzioni si ritagliano dal sorgente VERO
   di app.js, cosi' la prova non collauda una copia che puo'
   divergere.

   COSA DIMOSTRANO. Entrando nell'area riservata si apre una finestra
   con le iscrizioni arrivate dal sito da quando si e' guardato
   l'ultima volta. E' un avviso utile finche' annuncia PERSONE CHE SI
   SONO ISCRITTE.

   Le aziende della finestra degli inviti B2B non sono quelle. Sono
   imprese gia' note - quasi sempre gia' iscritte - riscritte a mano in
   forma di impresa da abbinare ai tavoli: una lista a parte, che serve
   solo a preparare gli incontri. Chi prepara gli inviti ne aggiunge
   dieci di fila, e senza questo setaccio si ritrova dieci finestre da
   chiudere, ognuna che annuncia come "nuova iscrizione dal sito" una
   riga che ha appena digitato lui.

   Qui si verifica che:
     - l'azienda nata per gli inviti non compaia, riconosciuta dalla
       bandiera sulla scheda, dalla sezione "Solo incontri B2B" o -
       per quelle scritte prima che la bandiera esistesse - dall'essere
       stata inserita a mano e segnata per gli inviti;
     - chi si e' iscritto DAVVERO compaia sempre, anche quando il
       foglio importato lo segna per gli inviti: quella colonna si mette
       anche agli iscritti veri, e da sola farebbe sparire dall'avviso
       proprio le iscrizioni per cui l'avviso esiste;
     - l'azienda non rientri dalla porta di servizio: lo stesso
       indirizzo arriva anche dall'elenco della newsletter, che di
       bandiere non ne porta, e li' si riconosce solo perche' e' la
       stessa iscrizione (indirizzo piu' data).
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'app.js'), 'utf8');

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
/* Le funzioni ritagliate si chiamano fra loro (senzaInvitiB2B usa
   natoPerInvitiB2B e chiaveIscrizione, che usa normalizzaTesto): si
   dichiarano tutte nello stesso giro, cosi' i nomi si vedono. */
const NOMI = ['normalizzaTesto', 'segnatoInvitoB2B', 'natoPerInvitiB2B',
    'chiaveIscrizione', 'unisciIscrizioni', 'senzaInvitiB2B'];
/* Il nome della colonna e' una riga sola: qui il conto delle parentesi non
   serve (un apice si apre e si chiude con lo stesso segno). */
function rigaDaAppJs(inizio) {
    const riga = APP.split('\n').filter(r => r.trim().indexOf(inizio) === 0);
    if (riga.length !== 1) throw new Error('in app.js non c\'e\' una sola riga che comincia con: ' + inizio);
    return riga[0].trim();
}
const COL_INVITO_B2B = eval(rigaDaAppJs('const COL_INVITO_B2B =')
    .replace(/^const COL_INVITO_B2B =\s*/, '').replace(/;\s*$/, ''));
const sorgente = NOMI.map(n => ritaglia('function ' + n + '(', '{', '}')).join('\n');
/* Si dichiarano dentro una funzione sola, che poi le restituisce: cosi' si
   vedono fra loro come si vedono dentro app.js, che e' una chiusura sola. */
const RITAGLIO = new Function('COL_INVITO_B2B',
    sorgente + '\nreturn { ' + NOMI.join(', ') + ' };')(COL_INVITO_B2B);
const normalizzaTesto = RITAGLIO.normalizzaTesto;
const segnatoInvitoB2B = RITAGLIO.segnatoInvitoB2B;
const natoPerInvitiB2B = RITAGLIO.natoPerInvitiB2B;
const chiaveIscrizione = RITAGLIO.chiaveIscrizione;
const unisciIscrizioni = RITAGLIO.unisciIscrizioni;
const senzaInvitiB2B = RITAGLIO.senzaInvitiB2B;

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

/* Una riga dell'elenco iscrizioni, ridotta a quello che l'avviso guarda. */
let seq = 0;
function riga(campi) {
    return Object.assign({
        id: 'i' + (++seq), nome: 'Tizio', cognome: 'Caio',
        data: '2026-09-20 10:00', pagina: 'Napoli 2 Ottobre 2026'
    }, campi || {});
}
// come la scrive presenze.js quando si aggiunge un'azienda dalla finestra inviti
function aziendaInvito(email, extra) {
    return riga(Object.assign({
        email: email, azienda: 'Alfa', soloB2B: true,
        inserito: { da: 'admin@revilaw.it', quando: Date.now() },
        extra: { Portale: 'Aggiunta per il B2B', 'Invito B2B': 'si', 'P.IVA': '01234567890' }
    }, extra || {}));
}

/* ------------------------------------------------------------
   CHI E' NATO PER GLI INVITI
   ------------------------------------------------------------ */

prova('La bandiera sulla scheda basta da sola', () => {
    esigi(natoPerInvitiB2B(riga({ email: 'a@alfa.it', soloB2B: true })), 'soloB2B la riconosce');
    esigi(!natoPerInvitiB2B(riga({ email: 'a@alfa.it' })), 'senza bandiera e senza altro e un iscritto');
});

prova('La sezione "Solo incontri B2B" dichiarata sulla scheda', () => {
    esigi(natoPerInvitiB2B(riga({ email: 'a@alfa.it', modalita: 'b2b' })), 'la sezione b2b la riconosce');
    esigi(natoPerInvitiB2B(riga({ email: 'a@alfa.it', modalita: 'B2B' })), 'anche scritta in maiuscolo');
    esigi(!natoPerInvitiB2B(riga({ email: 'a@alfa.it', modalita: 'presenza' })), 'chi e in presenza no');
    esigi(!natoPerInvitiB2B(riga({ email: 'a@alfa.it', modalita: 'online' })), 'chi segue online nemmeno');
});

prova('Le schede scritte prima che la bandiera esistesse', () => {
    /* Nascevano uguali, ma senza "soloB2B": si riconoscono dall'essere state
       inserite a mano (le iscrizioni dai moduli non hanno "inserito") e
       segnate per gli inviti. Senza questo l'avviso continuerebbe ad
       annunciare le aziende messe in elenco nei giorni scorsi. */
    const vecchia = aziendaInvito('a@alfa.it');
    delete vecchia.soloB2B;
    esigi(natoPerInvitiB2B(vecchia), 'inserita a mano e segnata: e un invito B2B');
});

prova('L ISCRITTO VERO segnato nel foglio resta un iscritto', () => {
    /* La colonna "Invito B2B" si mette anche agli iscritti veri importando il
       foglio: e' proprio cosi' che si scelgono le aziende da invitare. Se
       bastasse quella, l'avviso smetterebbe di annunciare le iscrizioni
       arrivate dal sito il giorno in cui si importa l'elenco. */
    const vero = riga({ email: 'mario@beta.it', extra: { 'Invito B2B': 'si' } });
    esigi(!natoPerInvitiB2B(vero), 'senza "inserito" e senza bandiera resta fra le nuove iscrizioni');
    esigi(segnatoInvitoB2B(vero), 'pur essendo segnato per gli inviti');
});

prova('La colonna si chiama come l app la chiama', () => {
    // se il nome cambiasse, il riconoscimento delle schede vecchie tacerebbe
    esigi(COL_INVITO_B2B === 'Invito B2B', 'la colonna e "Invito B2B"', COL_INVITO_B2B);
});

/* ------------------------------------------------------------
   L'ELENCO CHE L'AVVISO GUARDA
   ------------------------------------------------------------ */

prova('Le aziende degli inviti escono dall elenco, gli iscritti restano', () => {
    seq = 0;
    const eventi = [
        riga({ email: 'mario@beta.it' }),
        aziendaInvito('info@alfa.it'),
        riga({ email: 'lucia@gamma.it' })
    ];
    const r = senzaInvitiB2B(unisciIscrizioni([eventi]), eventi);
    esigi(r.length === 2, 'ne restano due', String(r.length));
    esigi(!r.some(x => x.email === 'info@alfa.it'), 'l azienda aggiunta per gli inviti non c e');
    esigi(r.some(x => x.email === 'mario@beta.it') && r.some(x => x.email === 'lucia@gamma.it'),
        'i due iscritti ci sono tutti e due');
});

prova('Non rientra dall elenco della newsletter', () => {
    /* L'elenco dei destinatari porta le stesse persone senza le bandiere:
       riga per riga quella dell'azienda sembrerebbe un'iscrizione qualunque,
       e senza il confronto per chiave di iscrizione l'avviso la mostrerebbe
       lo stesso. */
    seq = 0;
    const eventi = [aziendaInvito('info@alfa.it'), riga({ email: 'mario@beta.it' })];
    const sito = [
        { email: 'INFO@alfa.it', data: eventi[0].data, nome: 'Tizio', pagina: 'Napoli 2 Ottobre 2026' },
        { email: 'lucia@gamma.it', data: '2026-09-21 09:00', nome: 'Lucia', pagina: 'Napoli 2 Ottobre 2026' }
    ];
    const r = senzaInvitiB2B(unisciIscrizioni([eventi, sito]), eventi);
    esigi(!r.some(x => String(x.email).toLowerCase() === 'info@alfa.it'),
        'l azienda non c e nemmeno arrivando dalla newsletter');
    esigi(r.length === 2, 'restano i due iscritti veri', r.map(x => x.email).join('|'));
});

prova('La bandiera vale anche sulle righe della newsletter', () => {
    /* Chi vede solo la Newsletter non ha l'elenco degli eventi da cui
       riconoscerle: per lui conta la bandiera, che il servizio mette anche
       li'. Senza, l'avviso gli aprirebbe una finestra per un'azienda che lui
       negli inviti non vedra' mai. */
    const sito = [
        { email: 'info@alfa.it', data: '2026-09-20 10:00', soloB2B: true },
        { email: 'mario@beta.it', data: '2026-09-20 11:00' }
    ];
    const r = senzaInvitiB2B(unisciIscrizioni([sito]), []);
    esigi(r.length === 1 && r[0].email === 'mario@beta.it',
        'resta solo l iscritto vero', r.map(x => x.email).join('|'));
});

prova('Un elenco di sole aziende non apre nessun avviso', () => {
    seq = 0;
    const eventi = [aziendaInvito('info@alfa.it'), aziendaInvito('info@delta.it')];
    const r = senzaInvitiB2B(unisciIscrizioni([eventi]), eventi);
    esigi(r.length === 0, 'non resta niente da annunciare', String(r.length));
});

console.log('\nL\'avviso delle nuove iscrizioni\n');
for (const p of prove) { console.log('\n' + p.titolo); p.fn(); }
console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
