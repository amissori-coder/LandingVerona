/* ============================================================
   PROVE - lo spostamento fra gli aderenti Revilaw o fra sponsor e
   relatori: la mail di avviso (area-riservata/newsletter-format.js,
   passaggioSezione) e la finestra che la propone (app.js,
   modaleSpostaModalita)
   ------------------------------------------------------------
       node prove/avviso-sezione.prove.js

   Niente da installare: la mail si compone con il modulo vero, la
   finestra si ritaglia dal sorgente VERO di app.js e gira con intorno
   il minimo finto (apriModale, document, l'esecuzione dello spostamento
   che qui si registra e basta). Il servizio ha le sue prove in
   prove/sposta-modalita.prove.js.

   COSA DIMOSTRANO:
     - la mail dice dove e' stata registrata l'iscrizione, che il posto
       in sala resta, che la conferma dell'indirizzo non serve piu'; porta
       i due segnaposti che il servizio sostituisce e nessun altro, e non
       parla di cena, quota o lista d'attesa;
     - la finestra, per aderenti e sponsor, propone l'avviso (spuntato)
       con la sua anteprima, e lo manda con lo spostamento; senza spunta
       sposta e basta;
     - chi aspetta ancora di confermare l'email si conta, e la finestra
       dice prima di premere che la conferma non serve piu' e che parte
       l'invito in PDF;
     - verso gli ospiti in sala l'avviso non c'e', e verso l'online resta
       quello di sempre.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const RADICE = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(RADICE, 'area-riservata', 'app.js'), 'utf8');
const RV_NEWSLETTER = require(path.join(RADICE, 'area-riservata', 'newsletter-format.js'));

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

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  ok  ' + cosa); }
    else { ko++; console.log('  NO  ' + cosa + (extra !== undefined ? '\n      ' + String(extra).slice(0, 400) : '')); }
}
const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

const EVENTO = { titolo: 'Milano', quando: '26 febbraio 2027', luogo: 'Excelsior Hotel Gallia', indirizzo: 'Piazza Duca d\'Aosta 9, Milano' };

prova('La mail: dove, cosa resta, e che la conferma non serve piu\'', () => {
    [['aderenti', 'fra gli aderenti Revilaw'], ['sponsor', 'fra sponsor e relatori']].forEach(([verso, dove]) => {
        const m = RV_NEWSLETTER.passaggioSezione({ verso: verso, evento: EVENTO });
        esigi(m && m.oggetto.indexOf(verso === 'aderenti' ? 'aderenti Revilaw' : 'sponsor e relatori') >= 0 && /Milano, 26 febbraio 2027/.test(m.oggetto),
            verso + ': l\'oggetto dice la sezione e l\'evento', m && m.oggetto);
        esigi(m.testo.indexOf('registrata ' + dove) >= 0 && m.testo.indexOf('Partecipazione: In sala, ' + dove) >= 0,
            verso + ': dove e\' registrata l\'iscrizione, in sala');
        esigi(/il Suo posto in sala è riservato/.test(m.testo) && /Confermata, nessuna azione richiesta/.test(m.testo), verso + ': ha un posto in sala e non c\'e\' niente da fare');
        // la stessa mail va anche a chi arriva dall'online o dall'attesa: niente "resta", niente "non cambia nulla"
        esigi(!/resta riservato|non cambia nulla/.test(m.testo + m.html), verso + ': vera anche per chi arriva dall\'online');
        esigi(/La presente comunicazione è inviata agli iscritti/.test(m.testo) && !/Ricevi questa email/.test(m.testo), verso + ': il piede al Lei, come la lettera');
        esigi(/confermare il Suo indirizzo email, non è più necessario/.test(m.testo), verso + ': la conferma dell\'indirizzo non serve piu\'');
        esigi(/Sede: Excelsior Hotel Gallia, Piazza Duca d'Aosta 9, Milano/.test(m.testo), verso + ': con la sede, perche\' in sala ci viene');
        esigi(m.html.indexOf('{{NOME}}') >= 0 && m.html.indexOf('{{COMPLETA}}') >= 0, verso + ': i due segnaposti che il servizio sostituisce');
        esigi(!/\{\{(?!NOME\}\}|COMPLETA\}\})[A-Z_]+\}\}/.test(m.html + m.testo), verso + ': e nessun altro (il servizio lo spedirebbe tale e quale)');
        esigi(!/cena|meeting|quota|200|lista d'attesa|In attesa/i.test(m.testo), verso + ': senza la quota, niente cena, quota o lista d\'attesa', m.testo);
    });
    const ad = RV_NEWSLETTER.passaggioSezione({ verso: 'aderenti', evento: EVENTO, cenaMeeting: CENA });
    esigi(/Cena: venerdì 26 febbraio 2027/.test(ad.testo) && /Meeting degli aderenti: sabato 27 febbraio 2027/.test(ad.testo)
        && /Quota: 200,00 € \+ IVA \(244,00 € IVA inclusa\)/.test(ad.testo), 'aderenti: la cena del 26, il meeting del 27 e la quota', ad.testo);
    esigi(/comprende anche la cena e il meeting degli aderenti/.test(ad.testo) && /riceverà la fattura/.test(ad.testo), 'aderenti: sono compresi, e arriva la fattura');
    esigi(/dati per la fattura/.test(ad.testo) && ad.testo.indexOf(CENA.url) >= 0 && ad.html.indexOf(CENA.url) >= 0
        && /Completa i dati per la fattura/.test(ad.html), 'aderenti: il collegamento per i dati della fattura, con il pulsante');
    esigi(!/nessuna azione richiesta|né segnalarci altro/.test(ad.testo), 'aderenti: una cosa da fare c\'e\', e non si dice il contrario');
    const sp = RV_NEWSLETTER.passaggioSezione({ verso: 'sponsor', evento: EVENTO, cenaMeeting: CENA });
    esigi(!/cena|meeting|Quota/.test(sp.testo), 'sponsor: la cena degli aderenti non c\'entra, anche se arriva');
    esigi(RV_NEWSLETTER.passaggioSezione({ verso: 'online', evento: EVENTO }) === null
        && RV_NEWSLETTER.passaggioSezione({ verso: 'presenza', evento: EVENTO }) === null, 'per le altre sezioni non c\'e\'');
});

/* ---------- la finestra, con intorno il minimo finto ---------- */
function finestra(righe, verso, attese, opz) {
    opz = opz || {};
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let html = '';
    const el = {};
    const elemento = id => el[id] || (el[id] = {
        id: id, checked: id === 'sm-avvisa', disabled: false, textContent: '', innerHTML: '', style: { display: '' },
        ascolti: {}, addEventListener(t, f) { this.ascolti[t] = f; }
    });
    const chiamate = [];
    const ambiente = {
        esc: esc, window: { RV_NEWSLETTER: RV_NEWSLETTER }, RV_NEWSLETTER: RV_NEWSLETTER,
        document: { getElementById: id => (html.indexOf('id="' + id + '"') >= 0 ? elemento(id) : null) },
        apriModale: h => { html = h; }, chiudiModale: () => { },
        // l'anteprima come la legge chi guarda: senza i trattini di sillabazione invisibili
        anteprimaMail: (dove, componi) => { ambiente.anteprima = String(componi() || '').replace(/\u00AD|&shy;/g, ''); return { apri() { }, aggiorna() { } }; },
        eseguiSpostaModalita: (ev, elenco, v, opz) => { chiamate.push({ elenco: elenco, verso: v, opz: opz }); return Promise.resolve({ ok: true }); },
        puoAggiungereIscrizioni: () => true,
        modalitaDi: (ev, r) => r.md || 'presenza', partecipantiDi: () => 1,
        sezioneDalModulo: () => false, avvisoModalitaDi: r => opz.avviso || null,
        // la regola per scheda (schedaDaConfermare) ha le sue prove nel servizio: qui decide lo scenario
        schedaDaConfermare: (ev, r) => (attese || []).indexOf(r.id) >= 0,
        eventoPassato: () => !!opz.passato,
        // cena e meeting: la quota come la legge il servizio, chi e' gia' iscritto, chi lo e' per spostamento
        evHaAderenti: () => opz.cena !== false,
        aderentiDi: () => opz.cenaNonLetta ? null : [{ conti: {}, righe: [] }],
        quotaCenaMeeting: () => (opz.cena === false || opz.cenaNonLetta) ? null : CENA,
        allaCena: (ev, r) => (opz.giaCena || []).indexOf(r.id) >= 0,
        cenaDaSpostamento: (ev, r) => (opz.cenaSpostati || []).indexOf(r.id) >= 0 ? {} : null,
        caricaAderenti: () => { },
        SITO_PUBBLICO: 'https://nextgenerationbusiness.it'
    };
    const COSTANTI = ritaglia('const SEZIONI_MODALITA = [', '[', ']') + ';\n' + ritaglia('const SEZIONE_ATTESA = {', '{', '}') + ';\n';
    const corpo = COSTANTI + ritaglia('function sezioneDef(', '{', '}') + '\n' + ritaglia('function modaleSpostaModalita(', '{', '}')
        + '\nreturn modaleSpostaModalita;';
    const nomi = Object.keys(ambiente);
    const crea = new Function(nomi.join(','), corpo);
    const modale = crea.apply(null, nomi.map(n => ambiente[n]));
    modale({ id: 'milano-2027-02-26', titolo: 'Milano', quando: '26 febbraio 2027', luogo: EVENTO.luogo, indirizzo: EVENTO.indirizzo, confermaEmail: true },
        righe, verso, {});
    return { html: () => html, el: elemento, chiamate: chiamate, ambiente: ambiente };
}
const CENA = {
    voci: [{ cosa: 'Cena', quando: 'venerdì 26 febbraio 2027' }, { cosa: 'Meeting degli aderenti', quando: 'sabato 27 febbraio 2027' }],
    importi: { imponibile: 200, totale: 244 },
    url: 'https://nextgenerationbusiness.it/milano_febbraio_2027/aderenti/'
};
const R = [
    { id: 'a', nome: 'Alda', cognome: 'Attesa', email: 'alda@attesa.it', doc: 'a' },
    { id: 'b', nome: 'Bruno', cognome: 'Bianchi', email: 'bruno@b.it', doc: 'b' }
];

prova('Fra gli aderenti: avviso spuntato, anteprima, e la mail parte con lo spostamento', async () => {
    const f = finestra(R, 'aderenti', []);
    const h = f.html();
    esigi(/<h2>Sposta fra gli aderenti Revilaw 2 iscrizioni<\/h2>/.test(h), 'il titolo e\' il comando', h.slice(0, 120));
    esigi(/id="sm-avvisa" checked/.test(h) && /Invia anche l'avviso/.test(h), 'la casella dell\'avviso c\'e\', spuntata');
    esigi(/id="sm-frame" title="Anteprima della mail di avviso"/.test(h) && /registrata fra gli aderenti Revilaw/.test(f.ambiente.anteprima || ''),
        'con l\'anteprima della mail giusta');
    esigi(!/Nessuna mail parte/.test(h), 'e non dice piu\' "nessuna mail parte"');
    esigi(!/conferma non serve più/.test(h), 'nessuno in attesa: nessuna nota sulla conferma');
    f.el('sm-si').ascolti.click();
    await Promise.resolve();
    const c = f.chiamate[0] || {};
    esigi(c.verso === 'aderenti' && c.opz && c.opz.mail && /aderenti Revilaw/.test(c.opz.mail.oggetto),
        'premendo, lo spostamento porta la mail degli aderenti', JSON.stringify(c.opz && c.opz.mail && c.opz.mail.oggetto));
});

prova('Fra gli aderenti: cena e meeting si annunciano prima, e l\'avviso li porta', async () => {
    const f = finestra(R, 'aderenti', [], { giaCena: ['b'] });
    const h = f.html();
    esigi(/<b>1<\/b> viene iscritto anche alla <b>cena del 26 e al meeting del 27<\/b> \(244,00 € IVA inclusa\)/.test(h), 'quanti vengono iscritti, e la quota', h);
    esigi(/riquadro «Aderenti», con la fattura da emettere/.test(h) && /completa dalla pagina riservata/.test(h), 'dove si vedono, e i dati della fattura');
    esigi(/<b>1<\/b> è già iscritto: la sua iscrizione resta com'è/.test(h), 'chi c\'e\' gia\' resta com\'e\'');
    esigi(/Quota: 200,00 €/.test(f.ambiente.anteprima || '') || /200,00/.test(f.ambiente.anteprima || ''), 'e l\'anteprima ha la quota');
    f.el('sm-si').ascolti.click();
    await Promise.resolve();
    esigi(f.chiamate[0] && /Completa i dati per la fattura/.test(f.chiamate[0].opz.mail.html), 'la mail che parte e\' quella con cena e meeting');
    const nl = finestra([R[0]], 'aderenti', [], { cenaNonLetta: true });
    nl.el('sm-si').ascolti.click();
    await Promise.resolve();
    esigi(nl.chiamate.length === 0 && /non ancora letti/.test(nl.el('sm-esito').innerHTML), 'senza la quota letta l\'avviso non parte monco');
    const esce = finestra([{ id: 'x', nome: 'X', cognome: 'Y', email: 'x@y.it', doc: 'x', md: 'aderenti' }], 'presenza', [], { cenaSpostati: ['x'] }).html();
    esigi(/<b>1<\/b> era iscritto a cena e meeting con lo spostamento fra gli aderenti, fattura non ancora emessa: quell'iscrizione si toglie/.test(esce),
        'uscendo dagli aderenti si dice che l\'iscrizione a cena e meeting si toglie', esce);
    const sponsor = finestra(R, 'sponsor', []).html();
    esigi(!/cena del 26/.test(sponsor), 'fra sponsor e relatori la cena non c\'entra');
});

prova('Fra sponsor e relatori, senza la spunta: si sposta e basta', async () => {
    const f = finestra(R, 'sponsor', []);
    esigi(/Sposta fra sponsor e relatori/.test(f.html()) && /registrata fra sponsor e relatori/.test(f.ambiente.anteprima || ''), 'la mail e\' quella di sponsor e relatori');
    f.el('sm-avvisa').checked = false;
    f.el('sm-si').ascolti.click();
    await Promise.resolve();
    const c = f.chiamate[0] || {};
    esigi(c.verso === 'sponsor' && c.opz && c.opz.mail === null, 'senza spunta niente mail', JSON.stringify(c.opz));
});

prova('Chi aspetta di confermare l\'email: la finestra lo dice prima', () => {
    const uno = finestra(R, 'aderenti', ['a']).html();
    esigi(/<b>1<\/b> non aveva ancora confermato l'email: con lo spostamento <b>la conferma non serve più<\/b>/.test(uno),
        'uno: la conferma non serve piu\'', uno);
    esigi(/Esce dall'attesa ed entra nei conteggi della sala, e riceve subito l'invito in PDF da esibire all'ingresso/.test(uno),
        'esce dall\'attesa e riceve l\'invito in PDF');
    esigi(/questa mail parte anche senza l'avviso, e torna in copia nascosta anche a te/.test(uno), 'e quella mail parte comunque, in copia a chi sposta');
    const due = finestra(R, 'sponsor', ['a', 'b']).html();
    esigi(/<b>2<\/b> non avevano ancora/.test(due) && /Escono dall'attesa ed entrano/.test(due) && /ricevono subito/.test(due), 'due: al plurale');
    const dopo = finestra(R, 'aderenti', ['a'], { passato: true }).html();
    esigi(/la conferma non serve più/.test(dopo) && !/invito in PDF/.test(dopo), 'a evento passato non promette l\'invito', dopo);
});

prova('La spiegazione vale per chi era in sala, in attesa o online', () => {
    const da = finestra([{ id: 'o', nome: 'Olga', cognome: 'Online', email: 'olga@o.it', doc: 'o', md: 'online' }, R[1]], 'sponsor', []).html();
    esigi(/passano nella sezione <b>Sponsor e relatori<\/b>: in sala, con i loro posti contati nel totale in sala/.test(da), 'sponsor: in sala, nel totale', da);
    esigi(/<b>1<\/b> seguiva online: entra in sala ed esce dalla lista d'attesa/.test(da), 'chi era online: entra in sala');
    esigi(!/resta in sala|restano in sala|come prima|resta riservato/.test(da), 'niente "resta" ne\' "come prima"');
    const ad = finestra([R[0]], 'aderenti', ['a']).html();
    esigi(/passa nella sezione <b>Aderenti Revilaw<\/b>: in sala, con il suo posto contato a parte, non fra quelli degli ospiti/.test(ad), 'aderenti: contato a parte', ad);
});

prova('Fra aderenti e sponsor non si rimanda a una voce di menu che non c\'e\'', () => {
    const av = { modalita: 'aderenti', quando: 1 };
    const ad = finestra([R[0]], 'aderenti', [], { avviso: av }).html();
    esigi(/già ricevuto questo avviso e viene saltato\./.test(ad) && !/Invia di nuovo l'avviso/.test(ad), 'aderenti: saltato, e basta', ad);
    const on = finestra([R[0]], 'online', [], { avviso: { modalita: 'online', quando: 1 } }).html();
    esigi(/Invia di nuovo l'avviso/.test(on), 'online: la voce di reinvio c\'e\' e si nomina');
});

prova('Verso gli ospiti l\'avviso non c\'e\', verso l\'online resta quello di sempre', async () => {
    const sala = finestra(R, 'presenza', ['a']);
    esigi(!/sm-avvisa/.test(sala.html()) && !/sm-frame/.test(sala.html()), 'riportando fra gli ospiti: niente avviso');
    esigi(!/conferma non serve più/.test(sala.html()), 'e la conferma resta da dare');
    sala.el('sm-si').ascolti.click();
    await Promise.resolve();
    esigi(sala.chiamate[0] && sala.chiamate[0].opz.mail === null, 'si sposta senza mail');
    const online = finestra(R, 'online', ['a']);
    esigi(/Posti in sala esauriti/.test((online.ambiente.anteprima || '')) || /La seguiremo online/.test(online.ambiente.anteprima || ''),
        'l\'online propone il suo avviso');
    esigi(!/conferma non serve più/.test(online.html()), 'e non tocca la conferma');
});

prova('Dopo lo spostamento la riga confermata esce subito dall\'attesa', () => {
    const f = ritaglia('function eseguiSpostaModalita(', '{', '}');
    esigi(/r\.emailConfermata = \{ quando: Date\.now\(\), come: 'spostamento' \}/.test(f) && /_evConfCache = \{ lista: null, mappa: null \};/.test(f),
        'la conferma arriva sulle righe e la mappa degli indirizzi si rifa\'');
    esigi(/conferma dell\\'email non più richiesta/.test(f) && /invito in PDF inviato/.test(f) && /invito in PDF non partito/.test(f),
        'e il riassunto dice conferme e inviti');
    esigi(/Rimanda l\\'invito in PDF/.test(f) && !/parte solo quello/.test(f), 'e l\'invito non partito si rimanda dal menu della riga');
});

prova('Il menu della riga: la sezione in cui gia\' sta, e "Rimanda l\'invito in PDF"', () => {
    const cella = ritaglia('function cellaAzioniHtml(', '{', '}');
    esigi(/x\.id !== md \|\| \(\(x\.id === 'aderenti' \|\| x\.id === 'sponsor'\) && schedaDaConfermare\(ev, r\)\)/.test(cella),
        'chi aspetta la conferma ed e\' gia\' fra aderenti o sponsor puo\' esservi "spostato": e\' quello che toglie la conferma');
    esigi(/ev-invito-pdf/.test(cella) && /invitoDaRimandare\(ev, r\)/.test(cella), 'e a chi l\'invito non e\' arrivato si offre di rimandarlo');
    esigi(/data-doc="' \+ esc\(r\.doc \|\| ''\)/.test(cella), 'i bottoni portano la scheda');
    const fn = new Function('EventiPresenze', 'dalModuloDelSito', 'eventoPassato',
        ritaglia('function schedaDaConfermare(', '{', '}') + ritaglia('function invitoDaRimandare(', '{', '}')
        + 'return { schedaDaConfermare: schedaDaConfermare, invitoDaRimandare: invitoDaRimandare };');
    const P = {};
    const A = fn({ di: (e, id) => P[id] || null }, r => !r.inserito, () => false);
    const MI = { id: 'milano-2027-02-26', confermaEmail: true };
    esigi(A.schedaDaConfermare(MI, { id: 'x', doc: 'x', email: 'x@x.it' }) === true, 'scheda del sito senza conferma: da confermare');
    esigi(A.schedaDaConfermare(MI, { id: 'x', doc: 'x', email: 'x@x.it', emailConfermata: { quando: 1, come: 'mail' } }) === false, 'confermata: no');
    esigi(A.schedaDaConfermare(MI, { id: 'x', doc: 'x', email: 'x@x.it', inserito: true }) === false, 'inserita a mano: no');
    esigi(A.schedaDaConfermare({ id: 'napoli', confermaEmail: false }, { id: 'x', doc: 'x', email: 'x@x.it' }) === false, 'evento senza conferma: no');
    P.p = { stato: 'presente' };
    esigi(A.schedaDaConfermare(MI, { id: 'p', doc: 'p', email: 'p@x.it' }) === false, 'segnata presente: no');
    const sp = { id: 's', doc: 's', email: 'S@x.it', emailConfermata: { quando: 1, come: 'spostamento' } };
    esigi(A.invitoDaRimandare(MI, sp) === true, 'confermata con lo spostamento e senza invito: da rimandare');
    esigi(A.invitoDaRimandare(MI, Object.assign({}, sp, { mailInvito: { ok: true, a: 's@x.it' } })) === false, 'invito partito: no');
    esigi(A.invitoDaRimandare(MI, Object.assign({}, sp, { mailInvito: { ok: true, a: 'vecchio@x.it' } })) === true, 'partito a un indirizzo vecchio: da rimandare');
    esigi(A.invitoDaRimandare(MI, Object.assign({}, sp, { emailConfermata: { quando: 1, come: 'mail' } })) === false, 'confermata col clic: l\'invito lo manda il clic');
});

(async () => {
    console.log('\nLo spostamento fra aderenti e sponsor: la mail e la finestra\n');
    for (const p of prove) { console.log('\n' + p.titolo); await p.fn(); }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
