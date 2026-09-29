/* ============================================================
   PROVE - il riepilogo degli incontri B2B (area riservata)
   ------------------------------------------------------------
       node prove/riepilogo-b2b.prove.js

   Niente da installare: le funzioni si ritagliano dal sorgente VERO
   di app.js e si fanno girare con un DOM finto, che raccoglie l'HTML
   invece di disegnarlo. Cosi' la prova collauda la schermata che si
   apre davvero, non una copia.

   COSA DIMOSTRANO. Il riepilogo e' il foglio su cui si lavora il
   giorno prima del convegno, e ogni riga chiede una decisione: questo
   incontro lo posso spostare? questa preferenza la assegno?

   Per deciderlo bisogna sapere DA DOVE viene la riga, e prima non si
   poteva:
     - la PRIMA scelta non aveva contrassegno. Si riconosceva per
       esclusione, cioe' ricordandosi che le altre ce l'hanno;
     - l'incontro nato da un'ALTRA ESIGENZA vale 4, e finiva nel ramo
       dell'else: si leggeva "2a scelta". Una riga che dichiarava una
       cosa falsa, e sulla base della quale si sarebbe spostato un
       orario pensando di toccare una preferenza che l'azienda non
       aveva mai indicato.

   E si aggiunge la vista PER AZIENDA: la domanda piu' frequente non
   e' "com'e' fatto questo tavolo" ma "questa impresa che cosa ha", e
   per rispondere toccava scorrere nove tavoli cercando lo stesso nome.

   Qui si verifica che:
     - tutte e quattro le provenienze abbiano un nome proprio, diverso
       l'uno dall'altro, e che compaia su ogni riga;
     - la vista per azienda mostri gli incontri, le preferenze in
       attesa e le domande di QUELLA impresa, e nient'altro;
     - le due viste disegnino le righe con le stesse funzioni, cosi'
       da una si fa quello che si fa dall'altra.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'app.js'), 'utf8');

/* Il ritaglio per nome: si cerca l'inizio e si contano le parentesi fino alla
   chiusura. Lo stesso mestiere di prove/elenco-definitivo.prove.js. */
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
    ritaglia('const SCELTE_B2B = {', '{', '}') + ';',
    ritaglia('function sceltaB2B(', '{', '}'),
    ritaglia('function bolloScelta(', '{', '}'),
    ritaglia('function bolloCoda(', '{', '}'),
    ritaglia('function liberiDi(', '{', '}'),
    ritaglia('function capofilaRb(', '{', '}'),
    /* L'etichetta del tavolo la scrive il sito quando la conosce: senza
       questi due pezzi il riepilogo non si disegna nemmeno. */
    ritaglia('function areeB2BDef(', '{', '}'),
    ritaglia('function etichettaTavoloB2B(', '{', '}'),
    ritaglia('function tavoliVietatiPer(', '{', '}'),
    ritaglia('function vietatiSenzaQuesto(', '{', '}'),
    ritaglia('function tendinaDove(', '{', '}'),
    /* I doppioni d'orario: il riepilogo li disegna in cima e il foglio
       stampato li porta in capitolo. */
    ritaglia('function chiaveNominativo(', '{', '}'),
    ritaglia('function conflittiOrarioB2B(', '{', '}'),
    ritaglia('function disegnaRiepilogoB2B(', '{', '}'),
    ritaglia('function nomeAreaB2B(', '{', '}'),
    ritaglia('function stampaRiepilogoB2B(', '{', '}')
].join('\n');

/* Il DOM finto: la funzione scrive in #rb-corpo e poi chiama chi collega i
   pulsanti. Qui si raccoglie l'HTML e basta - i pulsanti li prova il browser,
   queste righe provano che cosa c'e' scritto. */
let scritto = '';
const elemento = { set innerHTML(v) { scritto = v; }, get innerHTML() { return scritto; } };
const documentoFinto = { getElementById: () => elemento };
function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/* Chi guarda: per queste prove e' l'amministratore, che e' l'unico a cui la
   vista per azienda mostra il comando per toglierla dagli incontri. */
const Auth = { eAdmin: () => true };
/* I due tavoli gemelli sono un tavolo solo, e chi lo sa e' il formato delle
   mail: nell'app si legge da window.RV_NEWSLETTER, qui si prende il modulo
   vero invece di ricopiarne la tabella. */
const window = { RV_NEWSLETTER: require(path.join(__dirname, '..', '..', 'area-riservata', 'newsletter-format.js')) };
const AMBIENTE = new Function('esc', 'document', 'puoAggiungereIscrizioni', 'collegaRiepilogoB2B', 'Auth', 'window',
    'let _rb = null, _rbAperto = "", _rbVista = "tavoli", _rbAzienda = "";\n'
    + 'let apriStampa = () => {}; const toast = () => {}; const STAMPA_EVENTI_CSS = "";\n'
    + pezzi
    + '\nreturn {'
    + '  disegna: (rb, vista, az, aperto) => { _rb = rb; _rbVista = vista || "tavoli"; _rbAzienda = az || ""; _rbAperto = aperto || ""; '
    + '    disegnaRiepilogoB2B({ id: "napoli-2026-10-02" }); return document.getElementById("rb-corpo").innerHTML; },'
    + '  sceltaB2B: sceltaB2B, SCELTE_B2B: SCELTE_B2B,'
    + '  conflitti: conflittiOrarioB2B,'
    /* La STAMPA: si compone il foglio e si restituisce, invece di aprire una
       finestra che qui non c'e'. */
    + '  stampa: rb => { _rb = rb; let uscita = ""; apriStampa = h => { uscita = h; };'
    + '    stampaRiepilogoB2B({ id: "napoli-2026-10-02", titolo: "Napoli", quando: "2 ottobre 2026" }); return uscita; }'
    + '};'
)(esc, documentoFinto, () => true, () => { }, Auth, window);

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

/* Un riepilogo come lo manda il servizio: due tavoli, quattro incontri (uno
   per provenienza), due preferenze in attesa e due domande. */
const slot = (ora, chi) => ({
    ora: ora, fine: ora.replace(':00', ':30'), chiave: ora.replace(':', ''),
    stato: chi ? 'occupato' : 'libero', chi: chi || null
});
const chi = (azienda, aziendaId, scelta, perChi, extra) => Object.assign({
    aziendaNome: azienda, aziendaId: aziendaId, scelta: scelta, perChi: perChi,
    email: 'info@' + aziendaId + '.it', telefono: ''
}, extra || {});
const RB = {
    ok: true,
    conti: { aziende: 2, occupati: 4, codaDaAssegnare: 2, esigenzeAperte: 1, senzaIncontro: 0, liberi: 5, richiesteAperte: 1 },
    desk: [
        {
            id: 'merito-creditizio', nome: 'Merito creditizio', attiva: true, interno: false, nota: '',
            referenti: [{ nome: 'Ida Neri', ruolo: 'Partner' }], liberi: 3, occupati: 2,
            slot: [
                slot('10:00', chi('Alfa Srl', 'alfa', 1, 'Mario Rossi')),
                slot('10:30', chi('Beta Srl', 'beta', 2, 'Gino Verdi')),
                slot('11:00', null)
            ],
            coda: [{ id: 'c1', pos: 2, aziendaId: 'alfa', aziendaNome: 'Alfa Srl', perChi: 'Mario Rossi', haGiaUnIncontro: true, quando: 1 }]
        },
        {
            id: 'desk-revilaw', nome: 'Desk Revilaw', attiva: true, interno: true, nota: '',
            referenti: [], liberi: 2, occupati: 2,
            slot: [
                slot('12:00', chi('Alfa Srl', 'alfa', 4, 'Anna Neri', { nota: 'Una posizione a Bagnoli.' })),
                slot('12:30', chi('Beta Srl', 'beta', 3, 'Gino Verdi'))
            ],
            coda: [{ id: 'c2', pos: 3, aziendaId: 'beta', aziendaNome: 'Beta Srl', perChi: '', haGiaUnIncontro: true, quando: 2 }]
        }
    ],
    esigenze: [
        { id: 'e1', aziendaId: 'alfa', aziendaNome: 'Alfa Srl', perChi: 'Anna Neri', testo: 'Come si apre una posizione a Bagnoli?', stato: 'aperta' },
        { id: 'e2', aziendaId: 'beta', aziendaNome: 'Beta Srl', perChi: '', testo: 'Ci serve un contatto per il rating.', stato: 'gestita' }
    ],
    /* Chi ha trovato tutto prenotato e ha chiesto un incontro lo stesso: sono
       parole scritte da qualcuno, e il foglio del riepilogo deve portarle. */
    richieste: [
        { doc: 'd1', nome: 'Rita Gialli', azienda: 'Gamma Srl', aziendaNome: 'Gamma Srl', email: 'rita@gamma.it',
          telefono: '349', area: 'merito-creditizio', nota: 'Siamo in trattativa con due banche: ci servirebbe mezz ora.',
          quando: 20, stato: 'aperta' },
        { doc: 'd2', nome: 'Nino Blu', azienda: 'Delta Srl', aziendaNome: 'Delta Srl', email: 'nino@delta.it',
          telefono: '', area: '', nota: 'Va bene anche dopo i lavori.', quando: 30, stato: 'gestita' }
    ],
    aziende: [
        { id: 'beta', nome: 'Beta Srl', piva: '07307010632', referenti: [{ nome: 'Gino Verdi', email: 'gino@beta.it', telefono: '333' }], incontri: 2, coda: 1, esigenze: 1, link: 'https://ngb.it/b2b?a=beta' },
        { id: 'alfa', nome: 'Alfa Srl', piva: '09302991212', referenti: [{ nome: 'Mario Rossi', email: 'mario@alfa.it', telefono: '' }], incontri: 2, coda: 1, esigenze: 1, link: 'https://ngb.it/b2b?a=alfa' }
    ]
};
const perTavolo = () => AMBIENTE.disegna(RB, 'tavoli', '');
const perAzienda = id => AMBIENTE.disegna(RB, 'aziende', id);

/* ------------------------------------------------------------
   OGNI RIGA DICE DA DOVE VIENE
   ------------------------------------------------------------ */

prova('Le quattro provenienze hanno quattro nomi diversi', () => {
    const nomi = [1, 2, 3, 4].map(n => AMBIENTE.sceltaB2B(n).breve);
    esigi(new Set(nomi).size === 4, 'nessuna si chiama come un\'altra', nomi.join(' | '));
    esigi(/1/.test(nomi[0]) && /2/.test(nomi[1]) && /3/.test(nomi[2]),
        'le tre scelte si chiamano con il loro numero', nomi.join(' | '));
    esigi(!/^[123]/.test(nomi[3]), 'e quella nata da un\'esigenza non si spaccia per una delle tre', nomi[3]);
    esigi(AMBIENTE.sceltaB2B(0).breve === nomi[0] && AMBIENTE.sceltaB2B(undefined).breve === nomi[0],
        'senza numero vale la prima, come in tutto il resto del sistema');
});

prova('L incontro nato da un esigenza NON si legge "2a scelta"', () => {
    /* E' il punto per cui questa prova esiste: il valore 4 finiva nel ramo
       dell'else di un ternario, e la riga dichiarava una cosa falsa. */
    const h = perTavolo();
    esigi(h.indexOf(AMBIENTE.sceltaB2B(4).breve) >= 0, 'in elenco c\'e\' il suo contrassegno');
    const riga = h.split('Anna Neri')[0].split('<div class="rb-riga"').pop();
    esigi(riga.indexOf(AMBIENTE.sceltaB2B(2).breve) < 0,
        'e sulla sua riga non compare quello della seconda scelta');
});

prova('Anche la prima scelta ha il suo contrassegno', () => {
    const h = perTavolo();
    esigi(h.indexOf(AMBIENTE.sceltaB2B(1).breve) >= 0,
        'non si riconosce piu\' per esclusione: c\'e\' scritto');
    esigi((h.match(/rb-pos/g) || []).length >= 6,
        'e ce n\'e\' uno su ogni riga, incontri e preferenze in attesa');
});

prova('La legenda spiega i contrassegni senza doverli indovinare', () => {
    const h = perTavolo();
    esigi(h.indexOf('rb-legenda') >= 0, 'la legenda c\'e\'');
    esigi([1, 2, 3, 4].every(n => h.indexOf(esc(AMBIENTE.sceltaB2B(n).spiega)) >= 0),
        'e spiega tutte e quattro le provenienze');
});

/* ------------------------------------------------------------
   LA VISTA PER AZIENDA
   ------------------------------------------------------------ */

prova('Senza azienda scelta si vede l elenco, non il vuoto', () => {
    const h = perAzienda('');
    esigi(h.indexOf('rb-az-scelta') >= 0, 'c\'e\' l\'elenco delle aziende');
    esigi(h.indexOf('Alfa Srl') >= 0 && h.indexOf('Beta Srl') >= 0, 'con dentro tutte quelle invitate');
    esigi(h.indexOf('2 incontri') >= 0, 'e accanto al nome quanto ha in mano gia\' li\'');
    esigi(h.indexOf('Scegli un\'azienda') >= 0 || h.indexOf('Scegli un&#39;azienda') >= 0
        || h.indexOf('rb-vuoto') >= 0, 'e la riga che dice che cosa fare');
});

prova('Scelta un azienda si vede tutto quello che la riguarda', () => {
    const h = perAzienda('alfa');
    esigi(h.indexOf('Incontri fissati') >= 0 && h.indexOf('Preferenze in attesa di un orario') >= 0
        && h.indexOf('Altre esigenze segnalate') >= 0, 'i tre blocchi ci sono tutti');
    esigi(h.indexOf('Merito creditizio') >= 0 && h.indexOf('Desk Revilaw') >= 0,
        'gli incontri portano il nome del tavolo, che qui non e\' piu\' l\'intestazione');
    esigi(h.indexOf('Bagnoli') >= 0, 'e la domanda che ha scritto');
    esigi(h.indexOf('mario@alfa.it') >= 0, 'con i suoi referenti, che al telefono servono');
    esigi(h.indexOf('https://ngb.it/b2b?a=alfa') >= 0, 'e il collegamento al modulo che vede lei');
});

prova('E si vede QUELLA azienda, non le altre', () => {
    /* Si guarda quello che viene DOPO l'elenco a tendina: dentro la tendina
       le altre aziende ci sono tutte, ed e' il suo mestiere. */
    const h = perAzienda('alfa').split('</select>').pop();
    esigi(h.indexOf('Beta Srl') < 0, 'di Beta non c\'e\' traccia', 'ne resta qualcosa');
    esigi(h.indexOf('Gino Verdi') < 0, 'nemmeno dei suoi nominativi');
    esigi(h.indexOf('rating') < 0, 'nemmeno delle sue domande');
});

prova('Non si propone un tavolo dove quell azienda ha gia qualcosa', () => {
    /* A un tavolo un'impresa ci va una volta sola. Il servizio rifiuta
       comunque, ma una tendina che offre una destinazione impossibile fa
       perdere un giro a chi assegna - e il giro lo fa mentre ha al telefono
       l'impresa. */
    const h = AMBIENTE.disegna(RB, 'tavoli', '', 'coda|c1');
    const dentro = h.split('rb-dove-area')[1].split('</select>')[0];
    esigi(dentro.indexOf('Merito creditizio') < 0,
        'il tavolo dove Alfa ha gia la prima preferenza non e in elenco', dentro.slice(0, 200));
    esigi(dentro.indexOf('Desk Revilaw') >= 0,
        'il desk interno invece si: non e una delle sue preferenze');
});

prova('Da qui si toglie un azienda dagli incontri', () => {
    /* Un'azienda che non viene piu' - o che e' stata cancellata dagli
       iscritti - restava negli incontri con i suoi orari impegnati: la si
       poteva togliere solo dalla finestra degli inviti, e solo se la sua
       scheda portava ancora l'identificativo. Qui l'identificativo c'e' di
       sicuro, perche' e' quello che si sta guardando. */
    const h = perAzienda('alfa');
    esigi(h.indexOf('rb-az-elimina') >= 0, 'il comando c\'e\'');
    esigi(h.indexOf('data-az="alfa"') >= 0, 'e sa quale azienda togliere');
});

prova('Le righe sono le stesse delle due viste', () => {
    /* Se un domani la vista per azienda si ridisegnasse per conto suo, i
       comandi di una delle due smetterebbero di funzionare senza dirlo: qui
       si verifica che le righe portino gli stessi appigli. */
    const h = perAzienda('alfa');
    esigi(h.indexOf('rb-sposta') >= 0, 'da qui si sposta un incontro');
    esigi(h.indexOf('rb-libera') >= 0, 'e lo si annulla');
    esigi(h.indexOf('rb-assegna') >= 0, 'e si assegna una preferenza in attesa');
    esigi(h.indexOf('rb-esig-porta') >= 0, 'e si porta una domanda a un tavolo');
});

prova('Un azienda senza niente lo dice, invece di mostrare tre blocchi vuoti', () => {
    const vuota = Object.assign({}, RB, {
        aziende: RB.aziende.concat([{ id: 'gamma', nome: 'Gamma Srl', piva: '', referenti: [], incontri: 0, coda: 0, esigenze: 0, link: '' }])
    });
    const h = AMBIENTE.disegna(vuota, 'aziende', 'gamma');
    esigi(h.indexOf('Nessun incontro fissato per questa azienda.') >= 0, 'lo dice per gli incontri');
    esigi(h.indexOf('Nessuna preferenza in attesa.') >= 0, 'e per le preferenze');
    esigi(h.indexOf('Nessuna domanda da questa azienda.') >= 0, 'e per le domande');
});

prova('Il foglio stampato porta tutto quello che le imprese hanno scritto', () => {
    /* Il riepilogo si stampa e ci si lavora sopra il giorno prima. Le altre
       esigenze c'erano gia'; le RICHIESTE A ORARI ESAURITI no, e sono persone
       che hanno bussato: hanno trovato tutto prenotato e hanno scritto lo
       stesso. Se restano solo a video, con il foglio in mano non se ne ricorda
       nessuno. */
    const foglio = AMBIENTE.stampa(RB);
    esigi(foglio.indexOf('Richieste a orari esauriti') > 0, 'il capitolo c e', foglio.slice(0, 80));
    esigi(foglio.indexOf('Siamo in trattativa con due banche') > 0,
        'e dentro c e per intero quello che l impresa ha scritto');
    esigi(foglio.indexOf('Gamma Srl') > 0 && foglio.indexOf('rita@gamma.it') > 0 && foglio.indexOf('349') > 0,
        'con l azienda e i contatti per richiamarla');
    esigi(foglio.indexOf('Merito creditizio') > 0, 'e il tavolo che aveva chiesto');
    /* Le GESTITE si stampano lo stesso, marcate: servono a non richiamare due
       volte la stessa persona. */
    esigi(foglio.indexOf('Va bene anche dopo i lavori') > 0 && /gestita/.test(foglio),
        'anche quelle gia gestite, marcate come tali');
    /* In testa al foglio si dice quante aspettano: e' il numero che si guarda
       per primo. */
    esigi(/1 richieste da guardare/.test(foglio), 'e in testa si dice quante ne aspettano una risposta');
    /* Le altre esigenze restano dov erano: il capitolo nuovo si aggiunge, non
       sostituisce. */
    esigi(foglio.indexOf('Altre esigenze segnalate') > 0 && foglio.indexOf('Bagnoli') > 0,
        'e le altre esigenze sono ancora al loro posto');
    /* Senza richieste il capitolo non compare vuoto. */
    const senza = AMBIENTE.stampa(Object.assign({}, RB, { richieste: [], conti: Object.assign({}, RB.conti, { richiesteAperte: 0 }) }));
    esigi(senza.indexOf('Richieste a orari esauriti') < 0, 'e senza richieste il capitolo non compare');
    esigi(!/richieste da guardare/.test(senza), 'ne il numero in testa');
});

/* ------------------------------------------------------------
   DUE INCONTRI ALLA STESSA ORA
   ------------------------------------------------------------
   Il servizio impedisce due incontri allo STESSO tavolo, non due
   incontri a tavoli DIVERSI alla stessa ora: la prima preferenza se
   la prende l'azienda, la seconda e la terza gliele assegniamo noi, e
   chi assegna guarda il tavolo, non l'agenda dell'impresa. Il giorno
   del convegno quell'incontro salta. */

/* Un riepilogo con dentro un doppione: si parte da quello buono e si
   sposta un incontro all'ora di un altro. */
function conDoppione(chiSecondo) {
    const copia = JSON.parse(JSON.stringify(RB));
    copia.desk[1].slot[0].ora = '10:00';
    copia.desk[1].slot[0].chi = chi('Alfa Srl', 'alfa', 2, chiSecondo);
    return copia;
}

prova('Due incontri alla stessa ora si vedono, distinti nei due casi', () => {
    /* La STESSA PERSONA in due posti e' impossibile; la stessa AZIENDA con
       due persone diverse si puo' fare, ma solo se viene davvero in due. */
    const stessa = AMBIENTE.conflitti(conDoppione('Mario Rossi'));
    esigi(stessa.length === 1, 'la stessa persona in due posti viene trovata', JSON.stringify(stessa));
    esigi(stessa[0] && stessa[0].stessaPersona === true, 'ed e\' segnata come il caso grave');
    esigi(stessa[0] && stessa[0].ora === '10:00' && stessa[0].aziendaNome === 'Alfa Srl',
        'con l\'ora e l\'azienda da chiamare');
    esigi(stessa[0] && stessa[0].incontri.length === 2
        && stessa[0].incontri.map(i => i.tavolo).join('|').indexOf('Merito creditizio') >= 0,
        'e i due posti in cui e\' attesa');

    const due = AMBIENTE.conflitti(conDoppione('Anna Neri'));
    esigi(due.length === 1, 'due persone della stessa impresa si vedono lo stesso');
    esigi(due[0] && due[0].stessaPersona === false, 'ma non sono il caso grave: puo\' darsi che vengano in due');
});

prova('Un riepilogo senza doppioni non ne inventa', () => {
    esigi(AMBIENTE.conflitti(RB).length === 0, 'nessun avviso quando non c\'e\' niente da sistemare');
    esigi(AMBIENTE.conflitti({}).length === 0, 'e nemmeno su un riepilogo vuoto');
    /* Due AZIENDE DIVERSE alla stessa ora sono la normalita': i tavoli
       ricevono in parallelo, ed e' il senso della giornata. */
    const altra = JSON.parse(JSON.stringify(RB));
    altra.desk[1].slot[0].ora = '10:00';
    altra.desk[1].slot[0].chi = chi('Gamma Srl', 'gamma', 2, 'Rita Gialli');
    esigi(AMBIENTE.conflitti(altra).length === 0, 'due imprese diverse alla stessa ora non sono un doppione');
    /* Un orario libero non ha nessuno dentro, anche se porta ancora chi
       c'era prima. */
    const libero = JSON.parse(JSON.stringify(RB));
    libero.desk[1].slot[0].ora = '10:00';
    libero.desk[1].slot[0].chi = chi('Alfa Srl', 'alfa', 2, 'Mario Rossi');
    libero.desk[1].slot[0].stato = 'libero';
    esigi(AMBIENTE.conflitti(libero).length === 0, 'e un orario libero non conta come incontro');
});

prova('Lo stesso nome scritto in due modi resta la stessa persona', () => {
    /* "Andrea  Missori" e "andrea missori" sono la stessa persona: se il
       confronto fosse letterale, il doppione grave passerebbe per il caso
       leggero e nessuno telefonerebbe. */
    const c = AMBIENTE.conflitti(conDoppione('  mario   ROSSI '));
    esigi(c.length === 1 && c[0].stessaPersona === true, 'spazi e maiuscole non fanno due persone', JSON.stringify(c));
    /* Un incontro senza nominativo non si puo' escludere che sia la stessa
       persona: meglio un avviso in piu' che una persona in due stanze. */
    const senza = AMBIENTE.conflitti(conDoppione(''));
    esigi(senza.length === 1 && senza[0].stessaPersona === true,
        'e un incontro senza nominativo si tratta come il caso grave');
});

prova('Il caso grave si legge per primo, a video e sul foglio', () => {
    const misto = JSON.parse(JSON.stringify(RB));
    /* Alfa: due persone diverse alle 10:00. Beta: la stessa persona alle
       10:30. Il grave arriva dopo, ma deve leggersi per primo. */
    misto.desk[1].slot[0].ora = '10:00';
    misto.desk[1].slot[0].chi = chi('Alfa Srl', 'alfa', 2, 'Anna Neri');
    misto.desk[1].slot[1].ora = '10:30';
    misto.desk[1].slot[1].chi = chi('Beta Srl', 'beta', 3, 'Gino Verdi');
    const c = AMBIENTE.conflitti(misto);
    esigi(c.length === 2, 'tutti e due i doppioni vengono trovati', JSON.stringify(c.map(x => x.ora)));
    esigi(c[0] && c[0].stessaPersona === true, 'e quello grave sta in cima');

    const h = AMBIENTE.disegna(misto, 'tavoli', '');
    esigi(h.indexOf('rb-conflitti') >= 0, 'a video c\'e\' il riquadro');
    esigi(h.indexOf('2 aziende attese in due posti alla stessa ora') >= 0,
        'che dice quante sono', h.slice(h.indexOf('rb-conflitti-testa'), h.indexOf('rb-conflitti-testa') + 120));
    esigi(h.indexOf('stessa persona') >= 0 && h.indexOf('due persone') >= 0, 'e distingue i due casi');
    esigi(h.indexOf('rb-conflitto grave') >= 0, 'marcando il grave, che si vede rosso');
    esigi(h.indexOf('rb-conflitti') < h.indexOf('rb-conti') || h.indexOf('rb-conflitti') < h.indexOf('rb-legenda'),
        'e sta in cima, prima della legenda: non e\' un dato da consultare, e\' una cosa da sistemare');

    const foglio = AMBIENTE.stampa(misto);
    esigi(foglio.indexOf('attese in due posti alla stessa ora') > 0, 'sul foglio stampato c\'e\' il capitolo');
    esigi(foglio.indexOf('info@alfa.it') > 0, 'con i contatti, perche\' sul foglio l\'unica cosa da fare e\' telefonare');
    esigi(foglio.indexOf('2 da sistemare') > 0, 'e il numero in testa al foglio');
    esigi(foglio.indexOf('attese in due posti') < foglio.indexOf('Merito creditizio'),
        'prima dei tavoli');
});

prova('Senza doppioni non compare niente, ne a video ne sul foglio', () => {
    const h = perTavolo();
    esigi(h.indexOf('rb-conflitti') < 0, 'niente riquadro quando va tutto bene');
    const foglio = AMBIENTE.stampa(RB);
    esigi(foglio.indexOf('attese in due posti') < 0, 'e niente capitolo sul foglio');
    esigi(foglio.indexOf('da sistemare') < 0, 'ne il numero in testa');
});

console.log('\nIl riepilogo degli incontri B2B\n');
for (const p of prove) {
    console.log('\n' + p.titolo);
    try { p.fn(); } catch (e) { ko++; console.log('  ROSSO  eccezione: ' + (e && e.stack || e)); }
}
console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
