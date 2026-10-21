/* ============================================================
   PROVE - chi ha risposto al richiamo, e chi no
   ------------------------------------------------------------
       node prove/richiamo-risposte.prove.js

   Niente da installare: le funzioni si ritagliano dal sorgente
   VERO di area-riservata/app.js e girano con un DOM che non
   serve. Cosi' la prova collauda quello che gira davvero.

   COSA DIMOSTRANO. Dopo il convegno si scrive a chi non ha
   fatto il suo incontro B2B, e chi riceve puo' rispondere da una
   pagina firmata. Le due meta' del fatto vivono in due archivi
   diversi - "a questa persona ho scritto" sta sulla sua scheda,
   "questa persona ha scritto a noi" sta fra le richieste della
   giornata - e si uniscono per `doc`.

   Il rischio non e' che il conto sia sbagliato di uno: e' che
   l'area dica "nessuna risposta" accanto a chi ha risposto. Da
   li' si preme "Solo chi non ha ancora risposto" e parte una
   seconda mail a chi aveva gia' scritto. Quindi qui si verifica
   soprattutto quando NON si deve dire niente:

     - finche' le richieste non sono state lette non si sa, e
       "non lo so" non e' "non ha risposto";
     - una richiesta a orari esauriti non e' una risposta a
       questa mail: nasce da un'altra pagina e per un'altra cosa;
     - una richiesta TOLTA dallo staff non vale piu';
     - "nessuna risposta" si dice solo a chi la mail e' partita.
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
    ritaglia('function eNuovoIncontro(', '{', '}'),
    ritaglia('function rispostaRichiamo(', '{', '}'),
    ritaglia('function giaRichiamato(', '{', '}'),
    ritaglia('function contiRichiamo(', '{', '}'),
    ritaglia('function risposteRichiamoHtml(', '{', '}'),
    ritaglia('function daRichiamareB2B(', '{', '}'),
    /* chi e' online si decide con la sezione in cui la riga si guarda: vere
       anche queste, perche' chi non ha mai confermato l'email non e' online */
    ritaglia('function indirizziConfermati(', '{', '}'),
    ritaglia('function confermaEmailDi(', '{', '}'),
    ritaglia('function dalModuloDelSito(', '{', '}'),
    ritaglia('function inAttesaConfermaMail(', '{', '}'),
    ritaglia('function sezioneVista(', '{', '}')
].join('\n');

/* Gli appigli che le funzioni ritagliate cercano intorno a se'. Sono gli
   stessi dell'app, ridotti all'osso: qui si prova la REGOLA, non il disegno. */
const AMBIENTE = new Function('dammi',
    'let _evIscrizioni = [], _AG = null, _evConfCache = { lista: null, mappa: null };\n'
    + 'const COL_B2B_PRENOTATI = "B2B prenotati";\n'
    + 'const SEZIONI_MODALITA = [{ id: "presenza" }, { id: "online" }, { id: "b2b", fuoriElenco: true }];\n'
    + 'function fuoriElenco(m) { return !!(SEZIONI_MODALITA.find(x => x.id === m) || {}).fuoriElenco; }\n'
    + 'function soloIscritti(ev, lista) { return (lista || []).filter(r => !fuoriElenco(modalitaDi(ev, r))); }\n'
    + 'function modalitaDi(ev, r) { return String((r && r.modalita) || "presenza"); }\n'
    + 'function invitoB2BDi(r, evId) { return (r && r.b2bInvito && r.b2bInvito.eventoId === evId) ? r.b2bInvito : null; }\n'
    + 'function agendaDi(ev) { return _AG; }\n'
    // le presenze: qui nessuno e' segnato (l'attesa della conferma le guarda per chi e' presente)
    + 'const EventiPresenze = { di() { return null; } };\n'
    + pezzi
    + '\nreturn {'
    + '  metti: (righe, agenda) => { _evIscrizioni = righe || []; _AG = agenda === undefined ? null : agenda; },'
    + '  risposta: rispostaRichiamo, conti: contiRichiamo, html: risposteRichiamoHtml,'
    + '  platee: daRichiamareB2B, richiamato: giaRichiamato };')();

const EV = { id: 'napoli-2026-10-02' };
let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra !== undefined ? '   ' + JSON.stringify(extra) : '')); }
}
function prova(titolo, fn) {
    console.log('\n' + titolo);
    try { fn(); } catch (e) { ko++; console.log('  ROSSO  eccezione: ' + (e && e.stack || e)); }
}
/* Una persona invitata ai tavoli di questo convegno. `scritto` e' il momento
   in cui le abbiamo mandato il richiamo; senza, non le e' stato mandato. */
const tizio = (id, scritto, extra) => Object.assign({
    id: id, doc: id, nome: id, cognome: 'Rossi', email: id + '@esempio.it', azienda: id + ' Srl',
    extra: { 'B2B prenotati': 'ESG 10:00' },
    nuovoIncontroInvito: scritto ? { quando: scritto, eventoId: EV.id } : null
}, extra || {});
const risp = (doc, quando, extra) => Object.assign({
    doc: doc, tipo: 'nuovo-incontro', aree: ['esg'], quando: quando, stato: 'aperta'
}, extra || {});

prova('1) Ha risposto, non ha risposto, non lo sappiamo', () => {
    const righe = [tizio('uno', 1000), tizio('due', 1000)];
    AMBIENTE.metti(righe, { richieste: [risp('uno', 2000)] });
    esigi(!!AMBIENTE.risposta(righe[0], EV), 'chi ha scritto risulta');
    esigi(AMBIENTE.risposta(righe[1], EV) === null, 'chi non ha scritto risulta senza risposta');
    /* LA DISTINZIONE CHE CONTA. Senza le richieste in mano non si sa, e
       "non lo so" non e' "non ha risposto": da quel contrassegno si preme
       "solo chi non ha ancora risposto" e parte una seconda mail. */
    AMBIENTE.metti(righe, null);
    esigi(AMBIENTE.risposta(righe[0], EV) === undefined, 'senza le richieste lette non si sa');
    esigi(AMBIENTE.risposta(righe[1], EV) === undefined, 'per nessuno, nemmeno per chi davvero non ha scritto');
});

prova('2) Che cosa NON e una risposta a questa mail', () => {
    const righe = [tizio('uno', 1000), tizio('due', 1000), tizio('tre', 1000)];
    AMBIENTE.metti(righe, { richieste: [
        /* una richiesta a orari esauriti: niente tipo, nasce dal modulo della
           giornata e chiede un posto a un tavolo che si sta riempiendo */
        { doc: 'uno', area: 'merito-creditizio', quando: 500, stato: 'aperta' },
        /* una risposta TOLTA dallo staff: per chi guarda non esiste piu' */
        risp('due', 2000, { stato: 'tolta' }),
        risp('tre', 2000, { stato: 'gestita' })
    ] });
    esigi(AMBIENTE.risposta(righe[0], EV) === null, 'una richiesta a orari esauriti non e una risposta');
    esigi(AMBIENTE.risposta(righe[1], EV) === null, 'e nemmeno una tolta dallo staff');
    const g = AMBIENTE.risposta(righe[2], EV);
    esigi(g && g.stato === 'gestita', 'mentre una gestita resta una risposta: e stata letta, non cancellata');
});

prova('3) I conti del riquadro', () => {
    const righe = [tizio('uno', 1000), tizio('due', 1000), tizio('tre', 0)];
    AMBIENTE.metti(righe, { richieste: [risp('uno', 2000)] });
    const c = AMBIENTE.conti(EV);
    esigi(c.platea === 3, 'la platea sono tutti quelli a cui si puo scrivere', c.platea);
    esigi(c.scritti === 2, 'gli scritti sono quelli con il richiamo partito', c.scritti);
    esigi(c.risposte === 1, 'e le risposte si contano', c.risposte);
    esigi(c.note === true, 'e si sa di saperlo');
    /* I due numeri non sono una frazione: il timbro del richiamo e' uno per
       scheda e un convegno successivo lo riscrive, mentre la risposta resta.
       Scrivendoli come frazione usciva "2 su 1 richiamati hanno risposto". */
    AMBIENTE.metti([tizio('uno', 0), tizio('due', 1000)], { richieste: [risp('uno', 2000), risp('due', 2000)] });
    const c2 = AMBIENTE.conti(EV);
    esigi(c2.risposte === 2 && c2.scritti === 1,
        'le risposte possono superare i richiamati, ed e giusto', JSON.stringify(c2));
});

prova('4) Il pezzo di riga del riquadro Iscrizioni', () => {
    const righe = [tizio('uno', 1000), tizio('due', 1000)];
    AMBIENTE.metti(righe, { richieste: [risp('uno', 2000)] });
    esigi(/<b>1<\/b> ha risposto/.test(AMBIENTE.html(EV)), 'con una risposta si dice al singolare', AMBIENTE.html(EV));
    AMBIENTE.metti(righe, { richieste: [risp('uno', 2000), risp('due', 2000)] });
    esigi(/<b>2<\/b> hanno risposto/.test(AMBIENTE.html(EV)), 'e con due al plurale', AMBIENTE.html(EV));
    AMBIENTE.metti(righe, { richieste: [] });
    esigi(/<b>0<\/b> hanno risposto/.test(AMBIENTE.html(EV)), 'nessuna risposta e un dato, e si scrive', AMBIENTE.html(EV));
    /* Ma "nessuna richiesta letta" NON si scrive come zero: zero e' un numero,
       e quello che abbiamo e' nessun dato. */
    AMBIENTE.metti(righe, null);
    esigi(/risposte non lette/.test(AMBIENTE.html(EV)), 'mentre senza le richieste si dice che non si sa', AMBIENTE.html(EV));
    esigi(!/<b>0<\/b>/.test(AMBIENTE.html(EV)), 'e non si scrive zero');
    /* Se non e stato richiamato nessuno non c e niente da raccontare. */
    AMBIENTE.metti([tizio('uno', 0)], { richieste: [] });
    esigi(AMBIENTE.html(EV) === '', 'e prima di avere scritto a qualcuno la riga non compare');
});

prova('5) Una riga senza doc non si appaia per sbaglio', () => {
    /* Senza identificativo non si puo' dire niente: appaiarla per indirizzo
       accoppierebbe due schede diverse della stessa persona. */
    const senza = Object.assign(tizio('uno', 1000), { doc: '' });
    AMBIENTE.metti([senza], { richieste: [risp('', 2000)] });
    esigi(AMBIENTE.risposta(senza, EV) === null, 'una riga senza doc non risulta avere risposto');
});

prova('6) Le platee e chi resta fuori', () => {
    const righe = [
        tizio('uno', 1000),
        Object.assign(tizio('due', 0), { extra: {}, modalita: 'online' }),
        /* in presenza, nessun tavolo: non e in nessuna delle due platee */
        Object.assign(tizio('tre', 0), { extra: {} }),
        /* iscritto ai soli incontri B2B: l elenco non lo porta, e nemmeno il conto */
        Object.assign(tizio('quattro', 0), { extra: {}, modalita: 'b2b' })
    ];
    AMBIENTE.metti(righe, { richieste: [] });
    const g = AMBIENTE.platee(EV);
    esigi(g.tavoli.length === 1 && g.tavoli[0].doc === 'uno', 'ai tavoli chi ha una prenotazione', g.tavoli.length);
    esigi(g.online.length === 1 && g.online[0].doc === 'due', 'online chi risulta nella sezione online', g.online.length);
    esigi(g.fuori.length === 1 && g.fuori[0].doc === 'tre',
        'e fuori chi era in sala senza un tavolo', g.fuori.map(r => r.doc));
});

prova('7) Dove la conferma email e\' chiesta, chi non ha confermato non e\' online', () => {
    const MI = { id: 'milano-2027-02-26', confermaEmail: true };
    const righe = [
        Object.assign(tizio('cinque', 0), { extra: {}, modalita: 'online', emailConfermata: { quando: 5, come: 'mail' } }),
        /* iscritto dal sito per la diretta, l'email mai confermata: per l'elenco
           e' "in attesa di conferma mail", e la proposta non gli si scrive */
        Object.assign(tizio('sei', 0), { extra: {}, modalita: 'online' })
    ];
    AMBIENTE.metti(righe, { richieste: [] });
    const g = AMBIENTE.platee(MI);
    esigi(g.online.length === 1 && g.online[0].doc === 'cinque', 'online solo chi ha confermato', g.online.map(r => r.doc));
    esigi(g.fuori.length === 1 && g.fuori[0].doc === 'sei', 'e chi non ha confermato si conta fra quelli fuori', g.fuori.map(r => r.doc));
});

console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
