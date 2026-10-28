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
        esigi(/resta riservato/.test(m.testo) && /Confermata, nessuna azione richiesta/.test(m.testo), verso + ': il posto resta e non c\'e\' niente da fare');
        esigi(/confermare il Suo indirizzo email, non è più necessario/.test(m.testo), verso + ': la conferma dell\'indirizzo non serve piu\'');
        esigi(/Sede: Excelsior Hotel Gallia, Piazza Duca d'Aosta 9, Milano/.test(m.testo), verso + ': con la sede, perche\' in sala ci viene');
        esigi(m.html.indexOf('{{NOME}}') >= 0 && m.html.indexOf('{{COMPLETA}}') >= 0, verso + ': i due segnaposti che il servizio sostituisce');
        esigi(!/\{\{(?!NOME\}\}|COMPLETA\}\})[A-Z_]+\}\}/.test(m.html + m.testo), verso + ': e nessun altro (il servizio lo spedirebbe tale e quale)');
        esigi(!/cena|meeting|quota|200|lista d'attesa|In attesa/i.test(m.testo), verso + ': niente cena, quota o lista d\'attesa', m.testo);
    });
    esigi(RV_NEWSLETTER.passaggioSezione({ verso: 'online', evento: EVENTO }) === null
        && RV_NEWSLETTER.passaggioSezione({ verso: 'presenza', evento: EVENTO }) === null, 'per le altre sezioni non c\'e\'');
});

/* ---------- la finestra, con intorno il minimo finto ---------- */
function finestra(righe, verso, attese) {
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
        sezioneDalModulo: () => false, avvisoModalitaDi: () => null,
        inAttesaConfermaMail: (ev, r) => (attese || []).indexOf(r.id) >= 0,
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
    esigi(/<b>1<\/b> aspettava ancora di confermare l'email: con lo spostamento <b>la conferma non serve più<\/b>/.test(uno),
        'uno: la conferma non serve piu\'', uno);
    esigi(/Esce da «Aziende in attesa di conferma mail», entra nei conteggi della sala e riceve subito l'invito in PDF/.test(uno),
        'esce dall\'attesa e riceve l\'invito in PDF');
    esigi(/questa mail parte anche senza l'avviso/.test(uno), 'e quella mail parte comunque');
    const due = finestra(R, 'sponsor', ['a', 'b']).html();
    esigi(/<b>2<\/b> aspettavano ancora/.test(due) && /Escono da/.test(due), 'due: al plurale');
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
});

(async () => {
    console.log('\nLo spostamento fra aderenti e sponsor: la mail e la finestra\n');
    for (const p of prove) { console.log('\n' + p.titolo); await p.fn(); }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
