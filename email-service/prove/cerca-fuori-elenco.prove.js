/* ============================================================
   PROVE - cercare un'azienda che non e' fra gli iscritti
   ------------------------------------------------------------
       node prove/cerca-fuori-elenco.prove.js

   Niente da installare: le funzioni si ritagliano dal sorgente
   VERO di area-riservata/app.js.

   PERCHE' ESISTONO. Gli invitati ai SOLI incontri B2B non stanno
   nell'elenco degli iscritti, ed e' una scelta: non hanno un posto
   in sala, non si contano, e tenerli in mezzo agli ospiti
   vorrebbe dire ritrovarseli in ogni ricerca e in ogni
   esportazione.

   Ma da fuori quella scelta non si vede. Si vede solo che
   l'azienda non c'e', e chi la cerca conclude che e' stata
   dimenticata - mentre e' li', invitata ai tavoli, un pannello
   piu' in la'. Succede spesso, perche' un referente che ha
   prenotato un incontro esiste per forza da qualche parte: se la
   sua impresa non risulta iscritta, e' quasi sempre questo.

   Qui si verifica che la ricerca a vuoto sappia dirlo: chi c'e',
   con che nome, e di quale persona si tratta.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'app.js'), 'utf8');

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
const pezzi = [
    ritaglia('const SEZIONI_MODALITA = [', '[', ']') + ';',
    ritaglia('function modalitaDi(', '{', '}'),
    ritaglia('function fuoriElenco(', '{', '}'),
    ritaglia('function soloIscritti(', '{', '}'),
    ritaglia('function invitatiFuoriElenco(', '{', '}')
].join('\n');

/* Le presenze non entrano in queste prove: la sezione si legge dalla scheda.
   `window` senza RV_PROMEMORIA fa ricadere nome e azienda su come sono
   scritti, che e' quello che si vuole verificare qui. */
const AMBIENTE = new Function('EventiPresenze', 'window', 'nomePersonaVisto', 'aziendaVista',
    'let _evIscrizioni = null;\n' + pezzi
    + '\nreturn {'
    + '  cerca: (lista, q) => { _evIscrizioni = lista; return invitatiFuoriElenco({ id: "napoli" }, q); },'
    + '  inElenco: lista => soloIscritti({ id: "napoli" }, lista)'
    + '};'
)({ di: () => ({}) }, {},
    r => String((r.nome || '') + ' ' + (r.cognome || '')).trim(),
    a => String(a || ''));

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

/* Tre imprese invitate ai soli incontri e due iscritte davvero. Le prime non
   stanno in elenco: e' il caso che si vuole spiegare a chi cerca. */
const LISTA = [
    { id: '1', nome: 'Giovanni', cognome: 'Albanese', email: 'info@caprirelaxboats.com', azienda: 'Capri Relax Srl', soloB2B: true, modalita: 'b2b' },
    { id: '2', nome: 'Maurizio', cognome: 'Stanzione', email: 'maustan80@gmail.com', azienda: 'Stanartis Srl', soloB2B: true, modalita: 'b2b' },
    { id: '3', nome: 'Francesco', cognome: 'Schettino', email: 'francesco@stoffall.it', azienda: 'Stoffall 2.0 S.r.l.', soloB2B: true, modalita: 'b2b' },
    /* due referenti della stessa impresa: una voce sola, non due */
    { id: '4', nome: 'Anna', cognome: 'Albanese', email: 'anna@caprirelaxboats.com', azienda: 'Capri Relax Srl', soloB2B: true, modalita: 'b2b' },
    { id: '5', nome: 'Mario', cognome: 'Rossi', email: 'mario@alfa.it', azienda: 'Alfa Srl' },
    { id: '6', nome: 'Ida', cognome: 'Neri', email: 'ida@beta.it', azienda: 'Beta Srl', modalita: 'online' }
];

prova('L elenco degli iscritti non porta gli invitati ai soli incontri', () => {
    const dentro = AMBIENTE.inElenco(LISTA).map(r => r.azienda);
    esigi(dentro.length === 2, 'restano solo le due iscritte', dentro.join(' | '));
    esigi(dentro.indexOf('Capri Relax Srl') < 0, 'e chi viene solo ai tavoli non c e');
    /* Chi segue ONLINE e' un iscritto: non ha un posto in sala, ma l elenco
       lo porta. E' l altra meta della regola, e confonderle vorrebbe dire
       far sparire gli online. */
    esigi(dentro.indexOf('Beta Srl') >= 0, 'mentre chi segue online resta, perche e iscritto');
});

prova('Cercata un impresa che non e in elenco, si dice dov e', () => {
    const r = AMBIENTE.cerca(LISTA, 'capri');
    esigi(r.length === 1, 'la si trova fra gli invitati ai soli incontri', JSON.stringify(r));
    esigi(r[0] && r[0].azienda === 'Capri Relax Srl', 'con la sua ragione sociale');
    esigi(r[0] && r[0].persone.length === 2, 'e i due referenti insieme, sotto un unica voce');
    esigi(r[0] && r[0].persone.map(p => p.nome).join(' ').indexOf('Giovanni Albanese') >= 0,
        'con il nominativo per intero');
    esigi(r[0] && r[0].persone[0].email === 'info@caprirelaxboats.com', 'e l indirizzo a cui e arrivato l invito');
});

prova('Si trova da tutto quello che si ha in mano', () => {
    /* Chi cerca ha in mano quello che gli ha scritto il desk: a volte la
       ragione sociale, a volte solo il nome della persona, a volte
       l indirizzo di posta. */
    esigi(AMBIENTE.cerca(LISTA, 'Stanzione').length === 1, 'dal cognome del referente');
    esigi(AMBIENTE.cerca(LISTA, 'francesco@stoffall.it').length === 1, 'dall indirizzo');
    esigi(AMBIENTE.cerca(LISTA, 'STANARTIS').length === 1, 'e le maiuscole non contano');
    esigi(AMBIENTE.cerca(LISTA, '  stoffall  ').length === 1, 'ne gli spazi intorno');
});

prova('Non si dice niente quando non c e niente da dire', () => {
    esigi(AMBIENTE.cerca(LISTA, 'gamma').length === 0, 'un nome che non esiste non inventa una voce');
    esigi(AMBIENTE.cerca(LISTA, '').length === 0, 'la ricerca vuota non elenca tutti');
    esigi(AMBIENTE.cerca(LISTA, '   ').length === 0, 'e nemmeno una ricerca di soli spazi');
    esigi(AMBIENTE.cerca(null, 'capri').length === 0, 'senza iscrizioni caricate non si risponde a caso');
    /* Un ISCRITTO non finisce qui: per lui la tabella non e vuota, e dirgli
       "e fra gli invitati B2B" sarebbe una risposta sbagliata a una domanda
       che nessuno ha fatto. */
    esigi(AMBIENTE.cerca(LISTA, 'alfa').length === 0, 'e chi e iscritto davvero non compare in questo avviso');
});

/* ------------------------------------------------------------
   IL MONTAGGIO: che l avviso sia davvero attaccato all elenco
   ------------------------------------------------------------
   Le funzioni sopra possono essere giuste e non servire a nessuno, se
   nessuno le chiama. Qui si legge il sorgente e si verifica che i tre
   pezzi siano collegati. */
prova('L avviso e attaccato all elenco degli iscritti, e porta alla finestra giusta', () => {
    const tratto = APP.slice(APP.indexOf("nomeFile: 'iscrizioni-'"), APP.indexOf("nomeFile: 'iscrizioni-'") + 2600);
    esigi(/seVuoto:/.test(tratto), 'la tabella delle iscrizioni passa `seVuoto`');
    esigi(/invitatiFuoriElenco\(ev, q\)/.test(tratto), 'che guarda fra gli invitati ai soli incontri');
    esigi(/data-vai-inviti/.test(tratto), 'e offre il pulsante per aprirli');
    esigi(/modaleInvitoB2B\(ev, null, /.test(tratto), 'che apre la finestra degli inviti');
    /* Il testo cercato viaggia fino alla finestra: arrivarci e dover
       ricominciare la ricerca a mano vanificherebbe il pulsante. */
    esigi(/function modaleInvitoB2B\(ev, unica, cercaSubito\)/.test(APP), 'la finestra accetta una ricerca gia fatta');
    esigi(/let filtroAz = String\(cercaSubito \|\| ''\)/.test(APP), 'e la usa come filtro appena si apre');
    /* Il riquadro compare SOLO quando la ricerca non lascia righe: se
       comparisse sempre, si leggerebbe "non e fra gli iscritti" accanto a
       una tabella piena. */
    esigi(/if \(!visibili && q\) \{ try \{ dire = opts\.seVuoto\(q\)/.test(APP),
        'e si legge solo quando la ricerca non ha lasciato niente');
});

console.log('\nCercare un azienda che non e fra gli iscritti\n');
for (const p of prove) {
    console.log('\n' + p.titolo);
    try { p.fn(); } catch (e) { ko++; console.log('  ROSSO  eccezione: ' + (e && e.stack || e)); }
}
console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
