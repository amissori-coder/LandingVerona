/* ============================================================
   PROVE - l'ordine e la ricerca negli elenchi di persone
   ------------------------------------------------------------
       node prove/elenco-persone.prove.js

   Niente da installare: le funzioni si ritagliano dal sorgente
   VERO di area-riservata/app.js. Cosi' la prova collauda quello
   che gira davvero, non una copia.

   COSA DIMOSTRANO. Gli elenchi arrivano dal servizio in ordine
   di DATA, dalla piu' recente: e' l'ordine giusto per l'elenco
   degli iscritti, dove la domanda e' "chi si e' iscritto
   adesso". Nelle finestre in cui si cerca un nome preciso fra
   duecento, invece, l'ordine di arrivo non e' nessun ordine: si
   scorre due volte la stessa lista senza sapere se il nome
   c'era. Qui si verifica che:

     - l'ordine sia quello che l'occhio si aspetta: alfabetico
       sulla stessa stringa che si legge in grassetto, con gli
       accenti e le maiuscole che non contano e i numeri letti
       da numeri ("2M Impianti" non dopo "20");
     - la lista di partenza non venga riordinata sotto i piedi
       di chi la sta leggendo altrove;
     - la chiave di ricerca si costruisca dai DATI e non dal
       testo disegnato, perche' nella riga ci sono anche i
       contrassegni ("non e' venuto", "gia' richiamato il ...")
       e cercare "venuto" risponderebbe con mezza lista.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const RADICE = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(RADICE, 'area-riservata', 'app.js'), 'utf8');

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
    ritaglia('function normalizzaTesto(', '{', '}'),
    ritaglia('function chiaveCerca(', '{', '}'),
    ritaglia('function nomePersonaVisto(', '{', '}'),
    ritaglia('function aziendaVista(', '{', '}'),
    'let _collatoreIt = null;',
    ritaglia('function confrontaIt(', '{', '}'),
    ritaglia('function etichettaRigaPersona(', '{', '}'),
    ritaglia('function inOrdineAlfabetico(', '{', '}'),
    ritaglia('function testoCercaPersona(', '{', '}')
].join('\n');

/* Le due funzioni che rimettono in forma nomi e ragioni sociali stanno nel
   modulo dei promemoria: si prende quello vero invece di ricopiarne il
   comportamento, perche' e' lui che decide come si legge "VERDI SRL". */
const RV_PROMEMORIA = require(path.join(RADICE, 'area-riservata', 'promemoria-eventi.js'));
/* IL MONTAGGIO SI FA DUE VOLTE, e la ragione e' tutta qui. `confrontaIt` usa
   `Intl.Collator` quando c'e' e ripiega su `localeCompare` quando non c'e',
   e se ne ricorda in una variabile. Montando una volta sola con un finto
   `window` senza `Intl`, le prove passavano tutte dal ramo di SCORTA: si
   poteva rompere il collatore vero - la riga che nel browser decide davvero
   l'ordine, con la lingua, gli accenti e i numeri - e la prova restava verde.
   Quindi si monta una volta con Intl e una senza, su due istanze distinte
   perche' quella variabile non si azzera, e si controlla anche QUALE dei due
   rami e' stato preso. */
function monta(conIntl) {
    const finestra = { RV_PROMEMORIA: RV_PROMEMORIA };
    if (conIntl) finestra.Intl = global.Intl;
    return new Function('window', 'Intl', 'RV_PROMEMORIA', pezzi
        + '\nreturn { confrontaIt: confrontaIt, inOrdineAlfabetico: inOrdineAlfabetico,'
        + ' etichettaRigaPersona: etichettaRigaPersona, testoCercaPersona: testoCercaPersona,'
        + ' chiaveCerca: chiaveCerca,'
        + ' nomePersonaVisto: nomePersonaVisto, aziendaVista: aziendaVista,'
        /* si espone la memoria del collatore: e' l'unico modo per dire se la
           riga che conta e' stata eseguita o saltata */
        + ' collatore: function () { return _collatoreIt; } };')(finestra, global.Intl, RV_PROMEMORIA);
}
const A = monta(true);
const SENZA = monta(false);

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  ok   ' + cosa); }
    else { ko++; console.log('  KO   ' + cosa + (extra !== undefined ? '   ' + JSON.stringify(extra) : '')); }
}
function prova(titolo, fn) {
    console.log('\n' + titolo);
    try { fn(); } catch (e) { ko++; console.log('  KO   eccezione: ' + (e && e.stack || e)); }
}
const p = (id, nome, cognome, azienda, email) => ({
    id: id, nome: nome, cognome: cognome, azienda: azienda, email: email || (id + '@esempio.it')
});
const etichette = righe => A.inOrdineAlfabetico(righe).map(A.etichettaRigaPersona);
const etichetteSenza = righe => SENZA.inOrdineAlfabetico(righe).map(SENZA.etichettaRigaPersona);

prova('1) Alfabetico su quello che si legge in grassetto', () => {
    /* In grassetto c'e' l'azienda quando c'e' e il nome quando manca: e'
       quella la riga che l'occhio segue scorrendo, e ordinare su un campo
       diverso - il cognome, per esempio - e' come non ordinare. */
    const righe = [
        p('c', 'Gino', 'Verdi', 'Omega Srl'),
        p('a', 'Mario', 'Rossi', 'Alfa S.r.l.'),
        p('b', 'Anna', 'Neri', 'Beta S.p.A.')
    ];
    /* Le ragioni sociali si leggono rimesse in forma ("Srl" diventa
       "S.r.l."): e' quello che si vede nella riga, ed e' su quello che si
       ordina - ordinare sul campo grezzo darebbe un ordine diverso da quello
       che l'occhio legge. */
    esigi(JSON.stringify(etichette(righe)) === JSON.stringify(['Alfa S.r.l.', 'Beta S.p.A.', 'Omega S.r.l.']),
        'le aziende vanno in ordine', etichette(righe));
    /* Chi l'azienda non ce l'ha si ordina per nome, in mezzo agli altri: una
       riga senza azienda non e' una riga di serie B da mandare in fondo. */
    const miste = [p('z', 'Zoe', 'Blu', 'Zeta Srl'), p('n', 'Carlo', 'Bruni', ''), p('a', 'Ida', 'Neri', 'Alfa Srl')];
    esigi(JSON.stringify(etichette(miste)) === JSON.stringify(['Alfa S.r.l.', 'Carlo Bruni', 'Zeta S.r.l.']),
        'e chi non ha azienda si ordina per nome, al suo posto', etichette(miste));
});

prova('2) Gli accenti e le maiuscole non spostano niente', () => {
    /* Un ordinamento che manda "Àcme" in fondo all'alfabeto fa concludere che
       il nome non c'e': e' il modo piu' rapido di far cercare due volte. */
    const righe = [p('z', 'A', 'B', 'Zeta Srl'), p('u', 'C', 'D', 'àcme S.p.A.'), p('m', 'E', 'F', 'Mediterranea')];
    esigi(etichette(righe)[0].toLowerCase().indexOf('cme') > 0, 'la A accentata sta in cima', etichette(righe));
    esigi(A.confrontaIt('Àcme', 'acme') === 0, 'accento e maiuscola valgono uguale');
    esigi(A.confrontaIt('ESG', 'esg') === 0, 'e lo stesso le maiuscole');
});

prova('3) I numeri si leggono da numeri', () => {
    /* "2M Impianti" dopo "20 Metri" e' il genere di ordine che fa dire
       "questo elenco non e' ordinato" e smettere di fidarsi. */
    const righe = [p('a', 'X', 'Y', '20 Metri Srl'), p('b', 'X', 'Y', '2M Impianti'), p('c', 'X', 'Y', '100 Gradi')];
    esigi(JSON.stringify(etichette(righe)) === JSON.stringify(['2M Impianti', '20 Metri S.r.l.', '100 Gradi']),
        'due, venti, cento', etichette(righe));
});

prova('4) La lista di partenza non si tocca', () => {
    /* La lista e' quella dell'evento, condivisa con tutte le altre schermate:
       riordinarla sul posto cambierebbe l'ordine anche a chi la sta leggendo
       dalla sua, che la vuole per data. */
    const righe = [p('c', 'A', 'B', 'Omega'), p('a', 'C', 'D', 'Alfa')];
    const prima = righe.map(r => r.id).join(',');
    A.inOrdineAlfabetico(righe);
    esigi(righe.map(r => r.id).join(',') === prima, 'la lista originale resta com era', righe.map(r => r.id));
});

prova('5) Un elenco vuoto, o senza niente scritto, non fa saltare niente', () => {
    esigi(A.inOrdineAlfabetico([]).length === 0, 'elenco vuoto');
    esigi(A.inOrdineAlfabetico(null).length === 0, 'elenco che non c e');
    const scarni = [{ id: 'x' }, p('a', 'Ida', 'Neri', 'Alfa Srl')];
    esigi(A.inOrdineAlfabetico(scarni).length === 2, 'e una riga senza nome ne azienda resta in elenco');
});

prova('6) A parita di azienda decide il nome, poi l indirizzo', () => {
    /* Tre colleghi della stessa impresa: senza un secondo criterio si
       ordinerebbero a caso, e chi cerca il terzo lo trova dove capita. */
    const righe = [
        p('c', 'Zoe', 'Verdi', 'Alfa Srl'),
        p('a', 'Anna', 'Neri', 'Alfa Srl'),
        p('b', 'Mario', 'Rossi', 'Alfa Srl')
    ];
    const nomi = A.inOrdineAlfabetico(righe).map(A.nomePersonaVisto);
    esigi(JSON.stringify(nomi) === JSON.stringify(['Anna Neri', 'Mario Rossi', 'Zoe Verdi']),
        'i colleghi vanno in ordine di nome', nomi);
    const stessoNome = [
        p('b', 'Anna', 'Neri', 'Alfa Srl', 'zeta@alfa.it'),
        p('a', 'Anna', 'Neri', 'Alfa Srl', 'anna@alfa.it')
    ];
    esigi(A.inOrdineAlfabetico(stessoNome)[0].email === 'anna@alfa.it',
        'e due omonimi per indirizzo, invece che a caso');
});

prova('7) La chiave di ricerca si costruisce dai dati, non dalla riga', () => {
    const r = p('a', 'Mario', 'Rossi', 'Àcme S.p.A.', 'Mario.Rossi@ACME.IT');
    const k = A.testoCercaPersona(r);
    esigi(k.indexOf('acme') >= 0, 'si trova per azienda senza accento', k);
    esigi(k.indexOf('mario') >= 0 && k.indexOf('rossi') >= 0, 'per nome e cognome', k);
    esigi(k.indexOf('mario.rossi@acme.it') >= 0, 'e per indirizzo, in minuscolo', k);
    esigi(k === k.toLowerCase(), 'tutto minuscolo: chi cerca non scrive le maiuscole');
    /* I contrassegni della riga NON ci sono: cercando "venuto" nella finestra
       del richiamo si otterrebbero tutti quelli segnati "non e' venuto", che
       non e' quello che intendeva chi scriveva. */
    esigi(k.indexOf('venuto') < 0 && k.indexOf('richiamato') < 0, 'e i contrassegni non entrano nella ricerca', k);
    /* La ragione sociale GREZZA resta cercabile: nell'elenco si legge
       "Acme S.p.A." ma chi scrive puo' benissimo digitare "ACME SPA" com'era
       scritto sul foglio. */
    esigi(A.testoCercaPersona(p('a', 'X', 'Y', 'ACME SPA')).indexOf('acme spa') >= 0,
        'e si trova anche com era scritta prima di essere rimessa in forma');
});

prova('8) Chi non ha niente scritto non fa esplodere la ricerca', () => {
    esigi(A.testoCercaPersona(null) === '', 'una riga che non c e da chiave vuota');
    esigi(A.testoCercaPersona({}) === '', 'e una riga senza campi pure');
});

prova('9) Si ordina con il collatore vero, non con quello di scorta', () => {
    /* Nel browser `Intl` c'e' sempre - l'area riservata lo usa senza nemmeno
       chiederselo, fin dalla prima riga - quindi la riga che decide l'ordine e'
       quella del collatore. Finche' le prove giravano su un finto `window`
       senza `Intl`, collaudavano il ramo che in produzione non si prende mai:
       si poteva cambiare lingua e opzioni del collatore e restavano verdi. */
    A.confrontaIt('a', 'b');
    SENZA.confrontaIt('a', 'b');
    esigi(A.collatore() instanceof Intl.Collator, 'con Intl si usa Intl.Collator', String(A.collatore()));
    const opz = A.collatore().resolvedOptions();
    esigi(String(opz.locale || '').indexOf('it') === 0, 'in italiano', opz.locale);
    esigi(opz.sensitivity === 'base', 'con accenti e maiuscole che non contano', opz.sensitivity);
    esigi(opz.numeric === true, 'e i numeri letti da numeri', String(opz.numeric));
    /* E senza Intl non ci si deve fermare: la scorta deve ordinare lo stesso,
       perche' un elenco non ordinato e' meglio di una finestra che non si
       apre. */
    esigi(SENZA.collatore() === false, 'senza Intl si ripiega sulla scorta', String(SENZA.collatore()));
    const righe = [p('c', 'A', 'B', 'Omega Srl'), p('a', 'C', 'D', 'Alfa Srl'), p('b', 'E', 'F', 'Beta Srl')];
    esigi(JSON.stringify(etichetteSenza(righe)) === JSON.stringify(['Alfa S.r.l.', 'Beta S.r.l.', 'Omega S.r.l.']),
        'e anche la scorta mette in ordine', etichetteSenza(righe));
});

prova('10) L apostrofo curvo e quello dritto sono lo stesso apostrofo', () => {
    /* Nei nostri dati convivono: il telefono e il correttore automatico
       scrivono quello curvo, la tastiera quello dritto. In italiano
       l'apostrofo sta nei cognomi e nelle ragioni sociali piu' comuni, e se i
       due non si incontrano chi cerca "dell'orto" trova il vuoto e ne conclude
       che l'iscrizione non c'e'. */
    const curvo = p('a', 'Ida', 'Dell\u2019Orto', 'L\u2019Isolante S.p.A.');
    const k = A.testoCercaPersona(curvo);
    esigi(k.indexOf(A.chiaveCerca('dell\'orto')) >= 0, 'cercato dritto, scritto curvo', k);
    esigi(k.indexOf(A.chiaveCerca('l\u2019isolante')) >= 0, 'e cercato curvo, scritto curvo', k);
    const dritto = p('b', 'Ugo', 'Dell\'Orto', 'L\'Isolante S.p.A.');
    esigi(A.testoCercaPersona(dritto).indexOf(A.chiaveCerca('dell\u2019orto')) >= 0,
        'e nell altro verso: cercato curvo, scritto dritto');
    esigi(A.chiaveCerca('D\u00b4Angelo') === A.chiaveCerca('D\'Angelo'),
        'anche l accento acuto usato come apostrofo');
});

console.log('\n' + ok + ' ok, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
