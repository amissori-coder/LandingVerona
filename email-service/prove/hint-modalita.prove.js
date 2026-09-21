/* ============================================================
   PROVE - area-riservata/app.js, la scritta sotto la modalita'
   ------------------------------------------------------------
       node prove/hint-modalita.prove.js

   Niente da installare: le funzioni si ritagliano dal sorgente
   VERO di app.js, cosi' la prova non collauda una copia che puo'
   divergere. L'unica cosa finta e' EventiPresenze, che nell'app
   legge una variabile di chiusura.

   COSA DIMOSTRANO. Nella sezione "Online" dell'elenco iscritti ogni
   riga dice a che punto sta la posta. Quella scritta nasce per chi e'
   stato SPOSTATO all'online da chi organizza: a quella persona si
   toglie il posto in sala, e va avvisata.

   Da quando la sala di Napoli si e' riempita il modulo del sito iscrive
   direttamente per la diretta. Chi arriva da li' un passaggio non lo ha
   mai fatto: la pagina glielo ha detto prima di iscriversi e la conferma
   automatica gliel'ha ripetuto. Per lui "mail da inviare" e' una cosa da
   fare che non va fatta.

   Qui si verifica che:
     - chi si e' iscritto online dal modulo non porti nessuno stato della
       posta, ma la provenienza ("dal modulo");
     - chi e' stato spostato continui a portare l'arancio "mail da
       inviare" - e' il caso per cui la scritta esiste;
     - la conferma verde "mail inviata il ..." resti a chiunque sia stato
       avvisato davvero, compreso chi era arrivato dal modulo;
     - basti che chi organizza tocchi la sezione perche' la riga torni a
       chiedere la mail: da quel momento la decisione e' sua;
     - la scritta "dal modulo" degli ADERENTI, che esisteva prima di
       questa modifica, continui a funzionare come faceva.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'app.js'), 'utf8');

/* Il ritaglio per nome: si cerca l'inizio e si contano le parentesi fino
   alla chiusura. Lo stesso mestiere di prove/aziende-invito.prove.js, con
   due bocche: le funzioni e le costanti (SEZIONI_MODALITA e' un elenco, non
   una funzione, e ricopiarne i quattro nomi nella prova vorrebbe dire
   collaudarli contro se stessi). */
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
const daAppJs = nome => eval('(' + ritaglia('function ' + nome + '(', '{', '}') + ')');
const costanteDaAppJs = nome => eval('(' + ritaglia('const ' + nome + ' = [', '[', ']')
    .slice(('const ' + nome + ' = ').length) + ')');
const oggettoDaAppJs = nome => eval('(' + ritaglia('const ' + nome + ' = {', '{', '}')
    .slice(('const ' + nome + ' = ').length) + ')');
/* La terza bocca: una costante-stringa, che puo' stare su piu' righe unite dal
   piu'. Si taglia al primo punto e virgola a fine riga. */
const stringaDaAppJs = nome => {
    const inizio = APP.indexOf('const ' + nome + ' = ');
    if (inizio < 0) throw new Error('non trovato in app.js: const ' + nome);
    const fine = APP.indexOf(';\n', inizio);
    if (fine < 0) throw new Error('chiusura non trovata per: const ' + nome);
    return eval('(' + APP.slice(inizio + ('const ' + nome + ' = ').length, fine) + ')');
};

/* L'unica finzione: nell'app EventiPresenze.di legge _evPresenze, che vive
   dentro la chiusura. Qui e' una tabella che ogni scenario riempie. */
let presenze = {};
const EventiPresenze = { di(evento, idIscritto) { return presenze[idIscritto] || null; } };

/* Tutto il resto viene dal sorgente vero. L'ordine conta per le const, non
   per i nomi: l'eval e' diretto, quindi le funzioni ritagliate risolvono
   esc, EventiPresenze e le altre su questo file al momento della chiamata. */
const SEZIONI_MODALITA = costanteDaAppJs('SEZIONI_MODALITA');
const TITOLO_DAL_MODULO = oggettoDaAppJs('TITOLO_DAL_MODULO');
const TITOLO_LISTA_ATTESA = stringaDaAppJs('TITOLO_LISTA_ATTESA');
const esc = daAppJs('esc');
const avvisoBreve = daAppJs('avvisoBreve');
const avvisoTitolo = daAppJs('avvisoTitolo');
const avvisoModalitaDi = daAppJs('avvisoModalitaDi');
const modalitaDi = daAppJs('modalitaDi');
const sezioneDalModulo = daAppJs('sezioneDalModulo');
const inListaAttesa = daAppJs('inListaAttesa');
const hintMailModalita = daAppJs('hintMailModalita');
const hintModalitaHtml = daAppJs('hintModalitaHtml');

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}

const EV = { id: 'napoli-2026-10-02' };
/* Un momento fisso invece dell'orologio: la data che esce nella conferma
   verde dev'essere sempre la stessa, altrimenti la prova cambia risposta a
   seconda del giorno in cui la si lancia. */
const QUANDO = new Date(2026, 8, 15, 10, 30).getTime();   // 15/09/2026, 10:30

/* Uno scenario = una riga dell'elenco piu' l'eventuale presenza che chi
   organizza le ha messo addosso. La modalita' si CALCOLA con modalitaDi,
   mai a mano: e' proprio la funzione che fonde le due provenienze, e
   scavalcarla vorrebbe dire non provare niente. */
function riga(r, presenza, ev) {
    presenze = {};
    const scheda = Object.assign({ id: 'i1', nome: 'Mario', cognome: 'Rossi', email: 'mario@studio.it' }, r);
    if (presenza) presenze[scheda.id] = presenza;
    const evento = ev || EV;
    const md = modalitaDi(evento, scheda);
    return { md: md, html: hintModalitaHtml(evento, scheda, md) };
}

const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

prova('Chi si iscrive online dal modulo non ha nessuna mail da ricevere', () => {
    const r = riga({ modalita: 'online' });
    esigi(r.md === 'online', 'sta nella sezione Online', r.md);
    esigi(r.html.indexOf('ev-da-avvisare') < 0, 'e nessuno gli chiede di mandargli l\'avviso', r.html);
    esigi(r.html.indexOf('ev-dal-modulo') >= 0, 'al suo posto la riga dice da dove viene');
    esigi(/sa gi/i.test(r.html), 'e il suggerimento spiega perche\' non serve', r.html);
});

prova('Chi ci e stato spostato continua a portare l\'arancio', () => {
    /* Il caso per cui la scritta esiste: a costui il posto in sala e' stato
       tolto da qualcuno, e finche' non gliela si manda la riga lo ricorda. */
    const r = riga({}, { modalita: 'online' });
    esigi(r.md === 'online', 'sta nella sezione Online', r.md);
    esigi(r.html.indexOf('ev-da-avvisare') >= 0, 'la riga chiede ancora la mail', r.html);
    esigi(r.html.indexOf('ev-dal-modulo') < 0, 'e non dice "dal modulo", perche\' dal modulo non viene');
});

prova('La conferma di un avviso partito resta a tutti e due', () => {
    const spostato = riga({}, {
        modalita: 'online',
        avvisoModalita: { modalita: 'online', quando: QUANDO, daNome: 'Anna Bianchi' }
    });
    esigi(spostato.html.indexOf('ev-avvisato') >= 0, 'lo spostato vede la conferma verde');
    esigi(spostato.html.indexOf('15/09') >= 0, 'con il giorno in cui e partita', spostato.html);
    esigi(/Anna Bianchi/.test(spostato.html), 'e nel suggerimento chi l\'ha mandata');
    /* L'ORDINE DELLE GUARDIE, messo alla prova davvero: la presenza porta
       l'avviso ma NON la sezione. Cosi' sezioneDalModulo direbbe ancora "viene
       dal modulo", e se la guardia stesse PRIMA del ramo verde la conferma di
       una mail partita sparirebbe. Con una presenza che ha anche la modalita'
       questa prova sarebbe verde per il motivo sbagliato. */
    const dalModulo = riga({ modalita: 'online' }, {
        avvisoModalita: { modalita: 'online', quando: QUANDO, daNome: 'Anna Bianchi' }
    });
    esigi(dalModulo.html.indexOf('ev-avvisato') >= 0, 'e una mail partita non si nasconde mai', dalModulo.html);
    esigi(dalModulo.html.indexOf('ev-dal-modulo') >= 0, 'la provenienza resta, perche nessuno lo ha spostato');
});

prova('Appena chi organizza tocca la sezione, la decisione diventa sua', () => {
    /* Stessa persona, stesso modulo: basta che qualcuno di qui scriva la
       sezione perche' la riga torni a comportarsi come per chiunque altro.
       E' il perno `!p.modalita`, lo stesso degli aderenti. */
    const r = riga({ modalita: 'online' }, { modalita: 'online' });
    esigi(r.html.indexOf('ev-dal-modulo') < 0, 'la provenienza sparisce');
    esigi(r.html.indexOf('ev-da-avvisare') >= 0, 'e la mail torna a essere una cosa da fare', r.html);
});

prova('Senza indirizzo: manca il recapito o non serve la comunicazione?', () => {
    /* Due assenze diverse. A chi e' stato spostato manca il RECAPITO, e va
       avvisato a voce: la riga lo segnala. A chi si e' iscritto online dal
       modulo non manca niente - non c'e' proprio niente da comunicargli. */
    const spostato = riga({ email: '' }, { modalita: 'online' });
    esigi(spostato.html.indexOf('ev-senza-mail') >= 0, 'lo spostato senza indirizzo resta segnalato', spostato.html);
    const dalModulo = riga({ modalita: 'online', email: '' });
    esigi(dalModulo.html.indexOf('ev-senza-mail') < 0, 'chi viene dal modulo no: non e un recapito che manca');
    esigi(dalModulo.html.indexOf('ev-dal-modulo') >= 0, 'e porta la provenienza come gli altri');
});

prova('Gli aderenti continuano a funzionare come prima', () => {
    /* La rete di sicurezza: "dal modulo" esisteva per loro prima di questa
       modifica, e la regola nuova non deve averli cambiati di una virgola. */
    const r = riga({ aderente: true, modalita: 'aderenti' });
    esigi(r.md === 'aderenti', 'sta fra gli aderenti', r.md);
    esigi(r.html.indexOf('ev-dal-modulo') >= 0, 'con la scritta "dal modulo"');
    esigi(r.html.indexOf('ev-da-avvisare') < 0, 'e nessuna mail da mandare: gli aderenti non si annunciano');
    const spostato = riga({ aderente: true }, { modalita: 'aderenti' });
    esigi(spostato.html.indexOf('ev-dal-modulo') < 0, 'e chi ce l\'ha messo qualcuno di qui non la porta');
});

prova('Nelle altre sezioni non si annuncia niente, come sempre', () => {
    esigi(riga({ modalita: 'presenza' }).html === '', 'in presenza la riga tace');
    esigi(riga({}).html === '', 'e anche senza modalita, che vale "in presenza"');
    esigi(riga({}, { modalita: 'sponsor' }).html === '', 'fra sponsor e relatori pure');
});

prova('"dal modulo" non si puo dichiarare per le sezioni che non si scelgono', () => {
    /* Il confine: il modulo pubblico puo' dichiarare solo "presenza" e
       "online" (lo fa rispettare il servizio). Se un valore inventato
       arrivasse comunque fino a qui, non deve diventare una provenienza. */
    esigi(sezioneDalModulo(EV, { id: 'i1', modalita: 'sponsor' }, 'sponsor') === false,
        'un "sponsor" dichiarato non vale');
    presenze = {};
    esigi(sezioneDalModulo(EV, { id: 'i1', modalita: 'online' }, 'presenza') === false,
        'e la provenienza vale solo per la sezione in cui si e finiti');
});

prova('Una presenza senza sezione non e una decisione', () => {
    /* Il caso piu' frequente in sala, e quello che il perno deve reggere:
       l'API manda SEMPRE modalita: '' per ogni documento di presenze, quindi
       basta che qualcuno segni lo stato al desk o scriva una nota perche' la
       presenza esista. Esistere non e' decidere: la stringa vuota non deve
       valere come "l'ho spostato io". */
    const r = riga({ modalita: 'online' }, { stato: 'presente', nota: 'arriva alle 10', modalita: '' });
    esigi(r.md === 'online', 'resta nella sezione Online', r.md);
    esigi(r.html.indexOf('ev-dal-modulo') >= 0, 'e continua a venire dal modulo', r.html);
    esigi(r.html.indexOf('ev-da-avvisare') < 0, 'quindi nessuna mail da mandargli');
});

prova('Nel riepilogo di tutti gli eventi la colonna tace', () => {
    /* Li' le presenze non si caricano: non si sa se un avviso e' partito ne'
       se qualcuno lo ha spostato. Dire "dal modulo" sarebbe affermare una cosa
       che non si puo' sapere, e dire "mail da inviare" pure. */
    const TUTTI = { id: 'tutti', tutti: true };
    esigi(riga({ modalita: 'online' }, null, TUTTI).html === '', 'chi viene dal modulo non porta la provenienza');
    esigi(riga({}, { modalita: 'online' }, TUTTI).html === '', 'e non si chiede nessuna mail a nessuno');
});

/* ------------------------------------------------------------
   LA CODA PER UN POSTO IN SALA
   ------------------------------------------------------------
   Chi viene spostato all'online a sala piena riceve una mail che gli
   promette per iscritto la lista d'attesa. Quella promessa dev'essere
   scritta anche nei dati, o quando un posto si libera non si sa chi
   chiamare - ed e' questa riga che lo dice a chi guarda l'elenco.
   ------------------------------------------------------------ */

prova('La coda si legge da tutte e due le strade', () => {
    /* Ci si entra in due modi e la parola e' la stessa: spostato da chi
       organizza (sta fra le presenze) oppure iscritto dal modulo a sala
       gia' piena (sta sulla scheda). */
    const spostato = riga({}, { modalita: 'online', listaAttesa: true });
    esigi(spostato.html.indexOf('ev-in-coda') >= 0, 'chi e stato spostato e in coda', spostato.html);
    const dalModulo = riga({ modalita: 'online', listaAttesa: true }, null);
    esigi(dalModulo.html.indexOf('ev-in-coda') >= 0, 'e anche chi ci e entrato dal modulo', dalModulo.html);
    esigi(inListaAttesa(EV, { id: 'i1', listaAttesa: true }, 'online') === true, 'il lettore risponde di si');
});

prova('Chi in sala c e gia non aspetta nessun posto', () => {
    /* La coda vale per la sola sezione online: una scheda che si porta
       dietro listaAttesa da un passaggio precedente non deve far comparire
       la scritta su chi in sala e' tornato. */
    const inSala = riga({ listaAttesa: true }, { modalita: 'presenza', listaAttesa: true });
    esigi(inSala.html.indexOf('ev-in-coda') < 0, 'in presenza la scritta non compare', inSala.html);
    esigi(inListaAttesa(EV, { id: 'i1', listaAttesa: true }, 'presenza') === false, 'e il lettore risponde di no');
    esigi(inListaAttesa(EV, { id: 'i1', listaAttesa: true }, 'aderenti') === false, 'nemmeno fra gli aderenti');
});

prova('Online senza coda resta senza scritta', () => {
    const r = riga({ modalita: 'online' }, null);
    esigi(r.html.indexOf('ev-in-coda') < 0, 'chi non risulta in coda non la porta', r.html);
});

prova('La coda si dice per ultima, sotto la posta e la provenienza', () => {
    /* Non e' una cosa da fare: e' lo stato in cui quella persona e'
       rimasta, e va letta dopo quelle che chiedono qualcosa. */
    const r = riga({ modalita: 'online', listaAttesa: true }, null);
    const iModulo = r.html.indexOf('ev-dal-modulo');
    const iCoda = r.html.indexOf('ev-in-coda');
    esigi(iModulo >= 0 && iCoda > iModulo, 'prima "dal modulo", poi "in lista d attesa"', r.html);
});

prova('Nel riepilogo di tutti gli eventi anche la coda tace', () => {
    /* Li' le presenze non si caricano: dire "in lista d'attesa" sulla sola
       scheda direbbe una cosa che da quella vista non si puo' sapere. */
    const TUTTI = { id: 'tutti', tutti: true };
    esigi(riga({ modalita: 'online', listaAttesa: true }, null, TUTTI).html === '', 'la colonna resta muta');
    esigi(inListaAttesa(TUTTI, { id: 'i1', listaAttesa: true }, 'online') === false, 'e il lettore non si sbilancia');
});

prova('Il titolo della coda dice a che cosa serve', () => {
    esigi(TITOLO_LISTA_ATTESA.indexOf('posto in sala') >= 0, 'nomina il posto in sala', TITOLO_LISTA_ATTESA);
    esigi(riga({ modalita: 'online', listaAttesa: true }, null).html.indexOf('title="') >= 0,
        'e arriva sulla riga come suggerimento');
});

console.log('\nLa scritta sotto la modalita\', nella sezione Online\n');
for (const p of prove) { console.log('\n' + p.titolo); p.fn(); }
console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
