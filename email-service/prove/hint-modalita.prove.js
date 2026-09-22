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
const righeDaAvvisare = daAppJs('righeDaAvvisare');
const hintMailModalita = daAppJs('hintMailModalita');
const inSala = daAppJs('inSala');
const fuoriElenco = daAppJs('fuoriElenco');
const soloIscritti = daAppJs('soloIscritti');
const daInvitareB2B = daAppJs('daInvitareB2B');
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

prova('Gli invitati ai soli incontri B2B non stanno nell\'elenco degli iscritti', () => {
    /* Sono aziende aggiunte a mano dalla finestra degli inviti: vengono al
       desk per il loro appuntamento e in sala non si siedono. Tenerle in
       elenco vorrebbe dire trovarsele in mezzo agli ospiti a ogni ricerca,
       in ogni esportazione e in ogni conto degli indirizzi doppi. */
    presenze = {};
    const elenco = [
        { id: 'a', email: 'ospite@alfa.it' },
        { id: 'b', email: 'online@beta.it', modalita: 'online' },
        { id: 'c', email: 'desk@gamma.it', modalita: 'b2b' }
    ];
    esigi(modalitaDi(EV, elenco[2]) === 'b2b', 'la sezione esiste e si legge dalla scheda');
    esigi(inSala('b2b') === false, 'non occupa un posto in sala');
    esigi(fuoriElenco('b2b') === true && fuoriElenco('online') === false && fuoriElenco('presenza') === false,
        'ed e\' l\'unica sezione che dall\'elenco resta fuori');
    const visti = soloIscritti(EV, elenco).map(r => r.id);
    esigi(visti.join(' ') === 'a b',
        'l\'elenco mostra l\'ospite e chi segue online, e non l\'invitato ai soli incontri', visti.join(' '));
    esigi(daInvitareB2B('b2b') === true,
        'agli incontri pero\' ci va: e\' proprio per quelli che e\' stato aggiunto');
    esigi(soloIscritti(EV, null).length === 0, 'e senza elenco non si sbaglia');
});

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

/* ------------------------------------------------------------
   GLI AVVISI RIMASTI DA MANDARE
   ------------------------------------------------------------
   Il pulsante "Avvisi da mandare" raccoglie le righe che l'elenco segna
   in arancio. E' la stessa domanda della colonna, e deve dare la stessa
   risposta: se le due si allontanano, il pulsante scrive a qualcuno a
   cui la colonna non stava chiedendo di scrivere - e su un invio in piu'
   passate non se ne accorgerebbe nessuno.
   ------------------------------------------------------------ */

/* Le righe come le vede righeDaAvvisare: la scheda piu' la sua presenza,
   messa nella tabella che EventiPresenze finge. */
function rigaVera(id, scheda, presenza) {
    presenze[id] = presenza || null;
    return Object.assign({ id: id, email: id + '@esempio.it' }, scheda || {});
}

prova('Si prende chi e online per una vostra decisione e non e stato avvisato', () => {
    presenze = {};
    const spostato = rigaVera('spostato', {}, { modalita: 'online' });
    const fuori = righeDaAvvisare(EV, [spostato]);
    esigi(fuori.length === 1 && fuori[0] === spostato, 'e la riga che chiede la mail', String(fuori.length));
});

prova('Chi si e iscritto online dal modulo NON si avvisa mai', () => {
    presenze = {};
    /* E' il danno vero di questo pulsante: a quella persona la pagina
       aveva gia' detto che i posti erano finiti, e la conferma gliel'ha
       ripetuto. Riceverebbe l'annuncio di un passaggio mai avvenuto. */
    const dalModulo = rigaVera('dalmodulo', { modalita: 'online' }, null);
    esigi(righeDaAvvisare(EV, [dalModulo]).length === 0, 'resta fuori dalla raccolta');
    /* E la colonna dice la stessa cosa: nessun arancio sulla sua riga. */
    const html = hintModalitaHtml(EV, dalModulo, 'online');
    esigi(html.indexOf('ev-da-avvisare') < 0, 'come dice la sua riga in elenco', html);
});

prova('Chi ha gia ricevuto l avviso non lo riceve due volte', () => {
    presenze = {};
    const gia = rigaVera('gia', {}, { modalita: 'online', avvisoModalita: { modalita: 'online', quando: QUANDO } });
    esigi(righeDaAvvisare(EV, [gia]).length === 0, 'una passata dopo l altra non raddoppia le mail');
});

prova('L avviso di un altra sezione non vale come avviso dell online', () => {
    presenze = {};
    /* Spostato online, avvisato, riportato in sala, rispostato online: la
       notizia e' cambiata due volte e va ridetta. */
    const r = rigaVera('rientrato', {}, { modalita: 'online', avvisoModalita: { modalita: 'presenza', quando: QUANDO } });
    esigi(righeDaAvvisare(EV, [r]).length === 1, 'torna fra quelli da avvisare');
});

prova('Chi non ha indirizzo non e un avviso in ritardo', () => {
    presenze = {};
    /* Non partira' mai: metterlo nel conto terrebbe il pulsante acceso
       per sempre, e l'elenco lo dice gia' con "nessuna email". */
    const muto = rigaVera('muto', { email: '' }, { modalita: 'online' });
    const vuoto = rigaVera('vuoto', { email: '   ' }, { modalita: 'online' });
    esigi(righeDaAvvisare(EV, [muto, vuoto]).length === 0, 'resta fuori dal conto');
});

prova('Chi e in sala non aspetta nessun avviso', () => {
    presenze = {};
    const inSala = rigaVera('insala', {}, { modalita: 'presenza' });
    const aderente = rigaVera('aderente', {}, { modalita: 'aderenti' });
    const relatore = rigaVera('relatore', {}, { modalita: 'sponsor' });
    const senzaSezione = rigaVera('nuovo', {}, null);
    esigi(righeDaAvvisare(EV, [inSala, aderente, relatore, senzaSezione]).length === 0,
        'nessuna delle sezioni in sala entra nella raccolta');
});

prova('La raccolta e la colonna dicono la stessa cosa', () => {
    presenze = {};
    /* La prova che conta: su un elenco misto, le righe raccolte sono
       ESATTAMENTE quelle che l'elenco segna in arancio. */
    const tutte = [
        rigaVera('a', {}, { modalita: 'online' }),
        rigaVera('b', { modalita: 'online' }, null),
        rigaVera('c', {}, { modalita: 'online', avvisoModalita: { modalita: 'online', quando: QUANDO } }),
        rigaVera('d', { email: '' }, { modalita: 'online' }),
        rigaVera('e', {}, { modalita: 'presenza' }),
        rigaVera('f', {}, { modalita: 'online', avvisoModalita: { modalita: 'presenza', quando: QUANDO } })
    ];
    const raccolte = righeDaAvvisare(EV, tutte).map(r => r.id).sort().join('');
    const arancio = tutte.filter(r => hintModalitaHtml(EV, r, modalitaDi(EV, r)).indexOf('ev-da-avvisare') >= 0)
        .map(r => r.id).sort().join('');
    esigi(raccolte === arancio, 'le due risposte combaciano', 'raccolte=' + raccolte + ' arancio=' + arancio);
    esigi(raccolte === 'af', 'e sono le due che devono ricevere la mail', raccolte);
});

prova('Nel riepilogo di tutti gli eventi non si avvisa nessuno', () => {
    presenze = {};
    /* Li' le presenze non si caricano: non si sa chi e' stato spostato ne'
       chi e' gia' stato avvisato, e mandare mail al buio e' irreversibile. */
    const TUTTI = { id: 'tutti', tutti: true };
    esigi(righeDaAvvisare(TUTTI, [rigaVera('x', { modalita: 'online' }, { modalita: 'online' })]).length === 0,
        'la raccolta resta vuota');
});

console.log('\nLa scritta sotto la modalita\', nella sezione Online\n');
for (const p of prove) { console.log('\n' + p.titolo); p.fn(); }
console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
