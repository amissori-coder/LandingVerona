/* ============================================================
   PROVE - area-riservata/app.js, l'elenco definitivo di chi resta in sala
   ------------------------------------------------------------
       node prove/elenco-definitivo.prove.js

   Niente da installare: le funzioni si ritagliano dal sorgente VERO
   di app.js, cosi' la prova non collauda una copia che puo'
   divergere. L'unica cosa finta e' EventiPresenze, che nell'app
   legge una variabile di chiusura.

   COSA DIMOSTRANO. Quando le adesioni superano la capienza, chi entra
   in sala si sceglie fuori di qui e si torna con un elenco definitivo.
   Il confronto fra quell'elenco e l'elenco vero e' un lavoro da
   centinaia di righe, dove un errore non si vede: una riga di troppo
   e' una persona mandata online che doveva restare in sala, una di
   meno e' un posto che non si libera. E ogni riga spostata e' una mail
   che parte, quindi non si torna indietro.

   Qui si verifica che:
     - dal testo incollato si peschino gli indirizzi e basta, comunque
       sia scritto (una colonna, "Nome <mail>,", una frase), in
       minuscolo e senza doppioni;
     - il confronto tocchi SOLO gli ospiti in sala: aderenti Revilaw,
       sponsor e relatori non finiscano mai fra quelli da spostare -
       in un elenco di imprese ospiti non ci sono mai, e mandare online
       i relatori e' il danno che un confronto automatico fa in un clic;
     - chi e' nell'elenco resti in sala e chi non c'e' sia proposto;
     - gli ospiti SENZA INDIRIZZO stiano a parte: sul solo dato del
       confronto non si possono giudicare;
     - si contino gli indirizzi dell'elenco che in sala NON si trovano,
       dicendo per ognuno se sta in un'altra sezione o se non risulta
       iscritto: e' la domanda opposta, ed e' quella che scopre il
       foglio vecchio e l'indirizzo scritto male;
     - chi aspetta ancora la conferma dell'email (Milano), ha chiesto la
       sala e nell'elenco non c'e' non sfugga: non e' un ospite in sala da
       spostare, ma torna in un gruppo suo (daConfermare), perche' il
       giorno che conferma entrerebbe in sala scavalcando l'elenco;
     - la sezione VUOTA valga "in presenza", come ovunque nell'app.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'app.js'), 'utf8');

/* Il ritaglio per nome: si cerca l'inizio e si contano le parentesi fino
   alla chiusura. Lo stesso mestiere di prove/hint-modalita.prove.js. */
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

/* L'unica finzione: nell'app EventiPresenze.di legge _evPresenze, che vive
   dentro la chiusura. Qui e' una tabella che ogni scenario riempie. */
let presenze = {};
const EventiPresenze = { di(evento, idIscritto) { return presenze[idIscritto] || null; } };

/* La regex sta nel sorgente e non si ricopia: e' il pezzo che decide che
   cosa e' un indirizzo, ed e' proprio quello da collaudare. Qui il ritaglio a
   parentesi non serve (una regex si apre e si chiude con lo stesso segno): si
   prende la riga intera, che e' una sola. */
function rigaDaAppJs(inizio) {
    const riga = APP.split('\n').filter(r => r.trim().indexOf(inizio) === 0);
    if (riga.length !== 1) throw new Error('in app.js non c\'e\' una sola riga che comincia con: ' + inizio);
    return riga[0].trim();
}
const RE_INDIRIZZO = eval(rigaDaAppJs('const RE_INDIRIZZO =')
    .replace(/^const RE_INDIRIZZO =\s*/, '').replace(/;\s*$/, ''));
const SEZIONI_MODALITA = costanteDaAppJs('SEZIONI_MODALITA');
const modalitaDi = daAppJs('modalitaDi');
const indirizziIncollati = daAppJs('indirizziIncollati');
const confrontoElencoDefinitivo = daAppJs('confrontoElencoDefinitivo');
/* Chi e' "ospite in sala" lo dice la sezione in cui la riga si guarda: dove la
   conferma email e' chiesta (Milano), chi non ha confermato sta nell'attesa e
   non in presenza. Anche queste vere, con la cache delle conferme che
   nell'app vive accanto. */
let _evIscrizioni = null;
let _evConfCache = { lista: null, mappa: null };
const indirizziConfermati = daAppJs('indirizziConfermati');
const confermaEmailDi = daAppJs('confermaEmailDi');
const dalModuloDelSito = daAppJs('dalModuloDelSito');
const inAttesaConfermaMail = daAppJs('inAttesaConfermaMail');
const sezioneVista = daAppJs('sezioneVista');
const SEZIONE_ATTESA = eval('(' + ritaglia('const SEZIONE_ATTESA = {', '{', '}')
    .slice('const SEZIONE_ATTESA = '.length) + ')');
/* La sezione in cui una riga si MOSTRA (sezioneElenco): fra gli aderenti chi
   e' iscritto alla cena e al meeting degli aderenti (solo Milano, quando le
   loro iscrizioni sono lette). Vere, dall'app; qui la cena non c'e', quindi
   decide la sezione in cui la riga si guarda, come prima. */
let _aderenti = null, _aderentiEv = '', _cenaIndirizzi = { quote: null, set: new Set() };
const EVENTI_CON_ADERENTI = eval('(' + ritaglia('const EVENTI_CON_ADERENTI = [', '[', ']').slice('const EVENTI_CON_ADERENTI = '.length) + ')');
const inSala = daAppJs('inSala');
const partecipantiDi = daAppJs('partecipantiDi');
const fuoriElenco = daAppJs('fuoriElenco');
const soloIscritti = daAppJs('soloIscritti');
const evHaAderenti = daAppJs('evHaAderenti');
const aderentiDi = daAppJs('aderentiDi');
const indirizziCena = daAppJs('indirizziCena');
const allaCena = daAppJs('allaCena');
const rigaDellaCena = daAppJs('rigaDellaCena');
const sezioneElenco = daAppJs('sezioneElenco');

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}

const EV = { id: 'napoli-2026-10-02' };
const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

/* Una riga dell'elenco iscrizioni, ridotta a quello che il confronto
   guarda: identificativo, indirizzo e la sezione in cui si trova. */
let seq = 0;
function riga(email, sezione, extra) {
    const id = 'i' + (++seq);
    if (sezione !== undefined) presenze[id] = { modalita: sezione };
    return Object.assign({ id: id, email: email, nome: 'Tizio', cognome: 'Caio', azienda: 'Alfa' }, extra || {});
}

/* ------------------------------------------------------------
   GLI INDIRIZZI DENTRO UN TESTO INCOLLATO
   ------------------------------------------------------------ */

prova('Una colonna di indirizzi, uno per riga', () => {
    const r = indirizziIncollati('mario@alfa.it\nlucia@beta.it\n\ngino@gamma.co.uk\n');
    esigi(r.length === 3, 'ne legge tre', JSON.stringify(r));
    esigi(r[0] === 'mario@alfa.it' && r[2] === 'gino@gamma.co.uk', 'nell ordine in cui stanno', JSON.stringify(r));
});

prova('Lo stesso elenco scritto in tutti gli altri modi', () => {
    esigi(indirizziIncollati('Mario Rossi <mario@alfa.it>, Lucia Bianchi <lucia@beta.it>').join('|')
        === 'mario@alfa.it|lucia@beta.it', 'Nome <mail> separati da virgola');
    esigi(indirizziIncollati('mario@alfa.it; lucia@beta.it;').join('|')
        === 'mario@alfa.it|lucia@beta.it', 'separati da punto e virgola');
    esigi(indirizziIncollati('Mario Rossi - CFO\tmario@alfa.it\nLucia Bianchi - CEO\tlucia@beta.it').join('|')
        === 'mario@alfa.it|lucia@beta.it', 'due colonne di Excel, con nome e ruolo davanti');
    esigi(indirizziIncollati('Confermati: mario@alfa.it. Anche lucia@beta.it, grazie.').join('|')
        === 'mario@alfa.it|lucia@beta.it', 'dentro una frase, con la punteggiatura attaccata');
});

prova('Maiuscole, spazi e doppioni non fanno differenza', () => {
    const r = indirizziIncollati('  MARIO@ALFA.IT  \nmario@alfa.it\nMario@Alfa.it\nlucia@beta.it');
    esigi(r.length === 2, 'lo stesso indirizzo si conta una volta sola', JSON.stringify(r));
    esigi(r[0] === 'mario@alfa.it', 'e si scrive in minuscolo', r[0]);
});

prova('Quello che non e un indirizzo resta fuori', () => {
    esigi(indirizziIncollati('nessun indirizzo qui, solo testo e una chiocciola a@b').length === 0,
        'una chiocciola senza dominio non basta');
    esigi(indirizziIncollati('').length === 0, 'la casella vuota non da niente');
    esigi(indirizziIncollati(null).length === 0, 'e nemmeno il nulla');
});

/* ------------------------------------------------------------
   IL CONFRONTO CON L'ELENCO VERO
   ------------------------------------------------------------ */

prova('Chi e nell elenco resta in sala, chi non c e si propone', () => {
    presenze = {}; seq = 0;
    const resta = riga('mario@alfa.it', 'presenza');
    const esce = riga('gino@gamma.it', 'presenza');
    const c = confrontoElencoDefinitivo(EV, [resta, esce], ['mario@alfa.it']);
    esigi(c.fuori.length === 1 && c.fuori[0].riga === esce, 'da spostare c e solo chi manca dall elenco',
        JSON.stringify(c.fuori.map(x => x.email)));
    esigi(c.fuori[0].motivo === 'fuori elenco', 'e il perche e scritto sulla riga', c.fuori[0].motivo);
    esigi(c.trovati === 1, 'un indirizzo dell elenco ha trovato il suo ospite', String(c.trovati));
    esigi(c.mancanti.length === 0, 'e nessun indirizzo dell elenco resta scoperto');
});

prova('Aderenti, sponsor e relatori non si toccano mai', () => {
    presenze = {}; seq = 0;
    /* E' il danno peggiore che questo confronto sa fare: l'elenco definitivo
       e' un elenco di IMPRESE OSPITI, i relatori non ci sono mai, e mandarli
       online e' un clic. */
    const ospite = riga('gino@gamma.it', 'presenza');
    const aderente = riga('socio@revilaw.it', 'aderenti');
    const relatore = riga('relatore@palco.it', 'sponsor');
    const online = riga('remoto@delta.it', 'online');
    const c = confrontoElencoDefinitivo(EV, [ospite, aderente, relatore, online], ['mario@alfa.it']);
    esigi(c.fuori.length === 1 && c.fuori[0].riga === ospite,
        'fra i proposti c e il solo ospite in sala', JSON.stringify(c.fuori.map(x => x.email)));
    esigi(c.senzaIndirizzo.length === 0, 'e nessuno degli altri finisce fra quelli senza indirizzo');
});

prova('La sezione vuota vale in presenza, come ovunque nell app', () => {
    presenze = {}; seq = 0;
    /* Fino a Napoli il modulo non chiedeva la modalita': un iscritto senza
       sezione e' un ospite in sala, e il confronto deve vederlo. */
    const senzaSezione = riga('gino@gamma.it');
    const presenzaVuota = riga('nino@delta.it', '');
    esigi(modalitaDi(EV, senzaSezione) === 'presenza', 'senza presenza scritta e in presenza');
    const c = confrontoElencoDefinitivo(EV, [senzaSezione, presenzaVuota], ['mario@alfa.it']);
    esigi(c.fuori.length === 2, 'e tutti e due si propongono per lo spostamento', String(c.fuori.length));
});

prova('Gli ospiti senza indirizzo stanno a parte', () => {
    presenze = {}; seq = 0;
    /* Non sono "fuori elenco": sono fuori CONFRONTO. Il dato su cui si
       confronta non ce l'hanno, e potrebbero essere nell'elenco senza che
       si possa saperlo. Nella finestra partono senza spunta. */
    const muto = riga('', 'presenza');
    const vuoto = riga('   ', 'presenza');
    const fuori = riga('gino@gamma.it', 'presenza');
    const c = confrontoElencoDefinitivo(EV, [muto, vuoto, fuori], ['mario@alfa.it']);
    esigi(c.senzaIndirizzo.length === 2, 'i due senza indirizzo stanno nel loro elenco', String(c.senzaIndirizzo.length));
    esigi(c.fuori.length === 1, 'e non si mescolano a quelli fuori elenco', String(c.fuori.length));
    esigi(c.senzaIndirizzo[0].motivo === 'senza indirizzo', 'con il loro perche', c.senzaIndirizzo[0].motivo);
});

prova('La domanda opposta: gli indirizzi dell elenco che in sala non ci sono', () => {
    presenze = {}; seq = 0;
    const inSala = riga('mario@alfa.it', 'presenza');
    const giaOnline = riga('lucia@beta.it', 'online');
    const aderente = riga('socio@revilaw.it', 'aderenti');
    const c = confrontoElencoDefinitivo(EV, [inSala, giaOnline, aderente],
        ['mario@alfa.it', 'lucia@beta.it', 'socio@revilaw.it', 'sconosciuto@zeta.it']);
    esigi(c.trovati === 1, 'un solo indirizzo dell elenco e davvero in sala', String(c.trovati));
    esigi(c.mancanti.length === 3, 'gli altri tre si contano', JSON.stringify(c.mancanti));
    const dove = {};
    c.mancanti.forEach(m => { dove[m.email] = m.dove; });
    esigi(dove['lucia@beta.it'] === 'online', 'e di chi sta altrove si dice dove', dove['lucia@beta.it']);
    esigi(dove['socio@revilaw.it'] === 'aderenti', 'anche quando e un aderente', dove['socio@revilaw.it']);
    esigi(dove['sconosciuto@zeta.it'] === '', 'chi non risulta iscritto non ha sezione',
        JSON.stringify(dove['sconosciuto@zeta.it']));
});

prova('I mancanti restano nell ordine in cui sono stati incollati', () => {
    presenze = {}; seq = 0;
    /* E' l'ordine del foglio da cui arrivano, ed e' li' che chi guarda
       andra' a cercarli. */
    const c = confrontoElencoDefinitivo(EV, [riga('mario@alfa.it', 'presenza')],
        ['zeta@zeta.it', 'mario@alfa.it', 'alfa@alfa.it']);
    esigi(c.mancanti.map(m => m.email).join('|') === 'zeta@zeta.it|alfa@alfa.it',
        'zeta prima di alfa, come nell elenco incollato', JSON.stringify(c.mancanti.map(m => m.email)));
});

prova('Il confronto non guarda le maiuscole della scheda', () => {
    presenze = {}; seq = 0;
    /* L'indirizzo incollato arriva gia' in minuscolo da indirizziIncollati;
       quello sulla scheda arriva come l'ha scritto chi si e' iscritto. */
    const r = riga('  Mario@Alfa.IT ', 'presenza');
    const c = confrontoElencoDefinitivo(EV, [r], ['mario@alfa.it']);
    esigi(c.fuori.length === 0, 'Mario@Alfa.IT e mario@alfa.it sono la stessa persona');
    esigi(c.trovati === 1, 'e l indirizzo dell elenco risulta trovato', String(c.trovati));
});

prova('Due colleghi sulla stessa casella restano due righe', () => {
    presenze = {}; seq = 0;
    /* Nel foglio definitivo capita: due persone della stessa impresa con un
       indirizzo solo. Sono due iscrizioni, due posti, e l'unico indirizzo le
       tiene dentro tutte e due. */
    const a = riga('ufficio@alfa.it', 'presenza');
    const b = riga('ufficio@alfa.it', 'presenza');
    const c = confrontoElencoDefinitivo(EV, [a, b], ['ufficio@alfa.it']);
    esigi(c.fuori.length === 0, 'nessuna delle due si sposta', String(c.fuori.length));
    esigi(c.trovati === 1, 'e l indirizzo si conta una volta sola', String(c.trovati));
});

prova('Un elenco vuoto non e un elenco', () => {
    presenze = {}; seq = 0;
    /* La finestra non lascia arrivare qui con zero indirizzi (il pulsante
       "Confronta" resta spento), ma se ci si arrivasse la risposta dev'essere
       quella giusta: tutti fuori elenco, e nessun mancante da inseguire. */
    const c = confrontoElencoDefinitivo(EV, [riga('mario@alfa.it', 'presenza')], []);
    esigi(c.fuori.length === 1, 'senza elenco nessuno risulta confermato in sala');
    esigi(c.mancanti.length === 0, 'e non c e nessun indirizzo da cercare');
});

prova('Chi aspetta di confermare l email non e un ospite in sala', () => {
    presenze = {}; seq = 0;
    /* Milano: l'iscrizione vale dopo la conferma dell'email. Chi non ha
       ancora premuto il pulsante non si propone fra quelli da spostare - in
       sala non c'e' - e se il suo indirizzo e' nell'elenco si dice dove sta. */
    const MI = { id: 'milano-2027-02-26', confermaEmail: true };
    const confermato = riga('mario@alfa.it', 'presenza', { doc: 'd1', emailConfermata: { quando: 1, come: 'mail' } });
    const inAttesa = riga('lucia@beta.it', 'presenza', { doc: 'd2' });
    const nonInElenco = riga('gino@gamma.it', 'presenza', { doc: 'd3' });
    const lista = [confermato, inAttesa, nonInElenco];
    const c = confrontoElencoDefinitivo(MI, lista, ['mario@alfa.it', 'lucia@beta.it']);
    esigi(c.trovati === 1, 'in sala combacia solo chi ha confermato', String(c.trovati));
    esigi(c.fuori.length === 0, 'e chi non ha confermato non e fra quelli da spostare', JSON.stringify(c.fuori.map(x => x.email)));
    esigi(c.mancanti.length === 1 && c.mancanti[0].dove === 'attesa',
        'l indirizzo in attesa risulta nella sua sezione', JSON.stringify(c.mancanti));
    // e senza la conferma chiesta (Napoli) tutto resta come prima
    const n = confrontoElencoDefinitivo(EV, lista, ['mario@alfa.it', 'lucia@beta.it']);
    esigi(n.trovati === 2 && n.fuori.length === 1, 'dove la conferma non e chiesta sono ospiti come gli altri',
        JSON.stringify({ trovati: n.trovati, fuori: n.fuori.length }));
    esigi(n.daConfermare.length === 0, 'e nessuno aspetta la conferma', String(n.daConfermare.length));
});

prova('Chi aspetta la conferma, chiede la sala e non e nell elenco non sfugge', () => {
    presenze = {}; seq = 0;
    /* Il buco che questa risposta chiude: chi non ha ancora confermato oggi
       in sala non conta, quindi non e' fra i "fuori"; ma se non lo si dice
       a nessuno, il giorno che preme il pulsante entra in sala e scavalca
       l'elenco definitivo. Torna in un gruppo suo, daConfermare. */
    const MI = { id: 'milano-2027-02-26', confermaEmail: true };
    const ospite = riga('mario@alfa.it', 'presenza', { doc: 'd1', emailConfermata: { quando: 1, come: 'mail' } });
    const fuoriConf = riga('gino@gamma.it', 'presenza', { doc: 'd2', emailConfermata: { quando: 1, come: 'mail' } });
    const attesaFuori = riga('lucia@beta.it', 'presenza', { doc: 'd3', extra: { Partecipanti: '3' } });
    const attesaDentro = riga('nino@delta.it', 'presenza', { doc: 'd4' });
    const attesaOnline = riga('remoto@zeta.it', 'online', { doc: 'd5' });
    const attesaAderente = riga('socio@revilaw.it', 'aderenti', { doc: 'd6' });
    const lista = [ospite, fuoriConf, attesaFuori, attesaDentro, attesaOnline, attesaAderente];
    const c = confrontoElencoDefinitivo(MI, lista, ['mario@alfa.it', 'nino@delta.it']);
    esigi(c.daConfermare.length === 1 && c.daConfermare[0].riga === attesaFuori,
        'in attesa, in presenza e fuori elenco: torna fra quelli da confermare', JSON.stringify(c.daConfermare.map(x => x.email)));
    esigi(c.daConfermare[0].motivo === 'email da confermare' && c.daConfermare[0].sezione === SEZIONE_ATTESA.id,
        'con il suo perche e la sua sezione', JSON.stringify([c.daConfermare[0].motivo, c.daConfermare[0].sezione]));
    /* Non e' un ospite in sala: non sta fra i "fuori", e i posti che si
       liberano (contati sui "fuori") non lo comprendono. */
    esigi(c.fuori.length === 1 && c.fuori[0].riga === fuoriConf, 'fra i fuori resta il solo ospite in sala',
        JSON.stringify(c.fuori.map(x => x.email)));
    esigi(c.trovati === 1, 'e fra i trovati in sala solo chi ha confermato', String(c.trovati));
    // chi aspetta ed e' nell'elenco non e' da confermare: si dice dove sta
    esigi(c.mancanti.length === 1 && c.mancanti[0].email === 'nino@delta.it' && c.mancanti[0].dove === SEZIONE_ATTESA.id,
        'chi aspetta ed e nell elenco risulta nella sezione dell attesa', JSON.stringify(c.mancanti));
    /* Chi aspetta ma ha chiesto l'online, o e' fra gli aderenti: in sala non
       entra da ospite nemmeno confermando, e l'elenco degli ospiti non lo
       riguarda. */
    esigi(!c.daConfermare.some(x => x.riga === attesaOnline || x.riga === attesaAderente),
        'chi aspetta per l online o fra gli aderenti non e da confermare qui');
    // senza indirizzo non si aspetta nessuna conferma: resta fra quelli senza indirizzo
    const muto = riga('', 'presenza', { doc: 'd7' });
    const m = confrontoElencoDefinitivo(MI, [muto], ['mario@alfa.it']);
    esigi(m.daConfermare.length === 0 && m.senzaIndirizzo.length === 1, 'chi non ha indirizzo resta fra quelli senza');
});

prova('Chi e segnato presente non aspetta piu la conferma', () => {
    presenze = {}; seq = 0;
    /* E' entrato in sala, l'ha visto chi lo ha accolto: e' un ospite in sala
       come gli altri, e il confronto lo tratta da ospite. */
    const MI = { id: 'milano-2027-02-26', confermaEmail: true };
    const r = riga('lucia@beta.it', 'presenza', { doc: 'd1' });
    presenze[r.id].stato = 'presente';
    const c = confrontoElencoDefinitivo(MI, [r], ['mario@alfa.it']);
    esigi(c.daConfermare.length === 0 && c.fuori.length === 1 && c.fuori[0].riga === r,
        'segnato presente e fuori elenco: e fra i fuori, non fra quelli da confermare',
        JSON.stringify({ fuori: c.fuori.length, daConfermare: c.daConfermare.length }));
});

prova('Le sezioni collaudate sono quelle vere dell app', () => {
    /* Se un domani ne nascesse una quinta IN SALA, questa prova si accorge
       che il confronto guarda ancora solo 'presenza' e va riletto. */
    const inSala = SEZIONI_MODALITA.filter(x => x.sala).map(x => x.id).join('|');
    esigi(inSala === 'presenza|aderenti|sponsor', 'in sala ci sono tre sezioni', inSala);
});

console.log('\nL\'elenco definitivo di chi resta in sala\n');
for (const p of prove) { console.log('\n' + p.titolo); p.fn(); }
console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
