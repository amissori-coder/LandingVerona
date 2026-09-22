/* ============================================================
   PROVE - la forma della mail d'invito B2B
   ------------------------------------------------------------
       node prove/mail-invito-forma.prove.js

   Niente da installare: si compone la mail vera e si guarda come
   viene, che e' l'unica cosa che il destinatario vede.

   COSA DIMOSTRANO. L'invito B2B e' una lettera dello studio, e una
   lettera dello studio si scrive giustificata: e' una scelta di chi
   firma, non del programma che la compone. Basta un blocco lasciato a
   bandiera - una regola dell'elenco, la riga dell'indirizzo, la nota
   in coda - perche' la pagina si veda montata da due mani diverse, e
   sono proprio i blocchi che si aggiungono dopo a dimenticarselo.

   Qui si verifica che:
     - nel CORPO non resti un solo blocco di prosa non giustificato
       (testata e piede stanno fuori: il titolo e' un titolo, e il
       piede e' centrato apposta);
     - i tavoli della giornata portino SOLO IL TITOLO. La descrizione
       dice in una riga e mezza quello che il titolo dice in tre
       parole, e ripetuta nove volte trasformava l'elenco in una
       colonna di grigio in cui non si distingueva piu' un tavolo
       dall'altro;
     - l'ordine sia quello in cui si legge: prima perche' scriviamo,
       poi quando e dove, poi che cosa si puo' scegliere, poi come si
       sceglie, e solo a quel punto il pulsante. Le note sul
       collegamento stanno in coda, non in mezzo alla strada fra le
       regole e il pulsante.
   ============================================================ */
'use strict';
const path = require('path');
const NL = require(path.join(__dirname, '..', '..', 'area-riservata', 'newsletter-format.js'));
const MODELLO = require(path.join(__dirname, '..', 'lib', 'agenda-modello.js'));

let ok = 0, ko = 0;
function esigi(cond, testo, extra) {
    if (cond) { ok++; console.log('  verde  ' + testo); }
    else { ko++; console.log('  ROSSO  ' + testo + (extra ? '   ' + extra : '')); }
}
const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

const GIORNATA = { inizio: '10:00', fine: '17:30', pranzoDa: '13:30', pranzoA: '14:30', durata: 30 };
const AREE = [
    { id: 'merito-creditizio', nome: 'Merito creditizio', descrizione: 'miglioramento del merito creditizio e accesso ai finanziamenti' },
    { id: 'adeguati-assetti', nome: 'Adeguati assetti', descrizione: 'adeguati assetti organizzativi, amministrativi e contabili' },
    { id: 'modello-231', nome: 'Modello 231 e Tax Control Framework', descrizione: 'un solo sistema di presidio dei rischi penali e fiscali' },
    { id: 'desk-revilaw', nome: 'Desk Revilaw', descrizione: 'il desk della segreteria' }
];
/* Nell'HTML le parole portano i trattini morbidi della sillabazione: sono
   invisibili a chi legge, ma una ricerca per frase non troverebbe piu' nulla.
   Si tolgono prima di cercare, e restano quelli che devono restare - la prova
   della sillabazione e' un'altra (prove/mail-sillabe.prove.js). */
const MORBIDO = '\u00ad';
const senzaTrattini = s => String(s || '').split(MORBIDO).join('');
function mail() {
    return NL.invitoB2BAzienda({
        evento: {
            titolo: 'Napoli', quando: '2 ottobre 2026', sottotitolo: 'Costruire l\'impresa del futuro',
            luogo: 'Hotel Eurostars Excelsior', indirizzo: 'Via Partenope 48, Napoli',
            scadenzaB2B: '30 settembre', url: 'https://nextgenerationbusiness.it/napoli_ottobre_2026/'
        },
        aree: AREE, giornata: GIORNATA, regole: MODELLO.regoleB2B(GIORNATA)
    });
}
/* IL CORPO, cioe' quello che sta fra la fascia della testata e il piede.
   Fuori restano il titolo (un titolo non si giustifica) e il piede
   (centrato apposta): il resto e' la lettera. */
function corpoDi(grezzo) {
    const html = senzaTrattini(grezzo);
    const da = html.lastIndexOf('-ms-interpolation-mode:bicubic;">');
    const a = html.indexOf('Revilaw S.p.A.');
    if (da < 0 || a < 0) throw new Error('la mail non ha piu la forma attesa: testata o piede non trovati');
    return html.slice(da, a);
}
/* I blocchi di PROSA: le celle e i riquadri con dentro abbastanza testo da
   andare a capo. Sotto le trenta lettere si sta su una riga sola, e li' il
   giustificato non si vede nemmeno (etichette, numeri dell'elenco, il
   pulsante): chiederlo sarebbe una regola che nessuno puo' verificare a
   occhio. */
function blocchiDiProsa(html) {
    const fuori = [];
    const re = /<(td|div)([^>]*)>([^<]{30,})</g;
    let m;
    while ((m = re.exec(html))) {
        const testo = m[3].replace(/&[a-z]+;/g, ' ').trim();
        if (testo.length < 30) continue;
        fuori.push({ stile: m[2], testo: testo });
    }
    return fuori;
}
const GIUSTIFICATO = /text-align:justify/;

prova('Nel corpo non c e un blocco lasciato a bandiera', () => {
    const m = mail();
    const blocchi = blocchiDiProsa(corpoDi(m.html));
    esigi(blocchi.length >= 8, 'i blocchi di prosa si trovano (' + blocchi.length + ')');
    const bandiera = blocchi.filter(b => !GIUSTIFICATO.test(b.stile));
    esigi(!bandiera.length, 'sono tutti giustificati',
        bandiera.map(b => b.testo.slice(0, 40)).join(' || '));
});

prova('Anche le regole e le note, che si aggiungono per ultime', () => {
    const m = mail();
    const corpo = corpoDi(m.html);
    const blocchi = blocchiDiProsa(corpo);
    const con = t => blocchi.filter(b => b.testo.indexOf(t) >= 0)[0];
    const regola = con('La prima preferenza prenota davvero');
    esigi(regola && GIUSTIFICATO.test(regola.stile), 'la regola dell elenco numerato e giustificata');
    const nota = con('Le chiediamo di non diffonderlo');
    esigi(nota && GIUSTIFICATO.test(nota.stile), 'e cosi la nota in coda sul collegamento');
    const saluti = con('Nell\'attesa di incontrarVi');
    esigi(saluti && GIUSTIFICATO.test(saluti.stile), 'e i saluti');
});

prova('I tavoli portano solo il titolo', () => {
    const m = mail();
    const html = senzaTrattini(m.html);
    AREE.forEach(a => {
        esigi(html.indexOf(a.descrizione) < 0 && m.testo.indexOf(a.descrizione) < 0,
            'la descrizione di "' + a.nome + '" non compare');
    });
    esigi(html.indexOf('Merito creditizio') > 0, 'il titolo invece si');
    esigi(m.testo.indexOf('- Merito creditizio\n') > 0
        || /- Merito creditizio$/m.test(m.testo), 'anche nel testo semplice, una riga per tavolo');
});

prova('L ordine e quello in cui si legge', () => {
    const html = senzaTrattini(mail().html);
    const dove = t => html.indexOf(t);
    const apertura = dove('iniziativa');
    const quandoDove = dove('Quando e dove');
    const tavoli = dove('I tavoli della giornata');
    const regole = dove('Come funziona');
    const bottone = dove('Scelga i Vostri incontri');
    const saluti = dove('Gli orari si assegnano');
    const note = dove('{{SE_COLLEGHI}}');
    esigi(apertura > 0 && apertura < quandoDove, 'prima si dice perche scriviamo');
    esigi(quandoDove < tavoli, 'poi quando e dove');
    esigi(tavoli < regole, 'poi che cosa si puo scegliere');
    esigi(regole < bottone, 'poi come si sceglie, e solo dopo il pulsante');
    esigi(bottone < saluti && saluti < note, 'i saluti dopo il pulsante, le note sul collegamento in coda');
});

prova('Che e un invito riservato si legge prima di aprire la mail', () => {
    /* In una casella piena l'oggetto e' spesso l'unica riga che qualcuno
       legge: se non dice che l'invito e' riservato, la mail passa per una
       comunicazione di servizio mandata a tutti e si apre la settimana dopo.
       Le tre parole stanno in TESTA, prima del taglio che i telefoni fanno
       dopo una quarantina di caratteri. */
    const m = mail();
    esigi(/^Invito riservato/.test(m.oggetto), 'l oggetto comincia da li', m.oggetto);
    esigi(m.oggetto.indexOf('Invito riservato') < 40, 'e la parte che conta sta prima del taglio');
    const html = senzaTrattini(m.html);
    esigi(/riservat/i.test(html.slice(0, html.indexOf('Revilaw S.p.A.'))),
        'e lo ripete la mail, non solo l intestazione');
    const titolo = html.indexOf('Invito riservato agli incontri B2B');
    esigi(titolo > 0 && titolo < html.indexOf('iniziativa'),
        'il titolo della testata dice la stessa cosa, e sta prima del corpo');
    esigi(/^INVITO RISERVATO/.test(m.testo), 'e anche il testo semplice', m.testo.split('\n')[0]);
});

prova('Il corpo dice perche proprio a loro, e in coda a chi resta', () => {
    const m = mail();
    const html = senzaTrattini(m.html);
    esigi(html.indexOf('non sono aperti a tutti gli iscritti') > 0
        && m.testo.indexOf('non sono aperti a tutti gli iscritti') > 0,
        'l invito non e per tutti, e si dice');
    esigi(html.indexOf('riservato a {{AZIENDA}}') > 0,
        'e la nota in coda lo ripete nominando l impresa');
});

prova('Ricorda di guardare il programma dei lavori, prima di scegliere l ora', () => {
    /* Gli incontri corrono a margine dei lavori in sala, e la scaletta si
       aggiorna fino agli ultimi giorni: chi sceglie un orario senza averla
       riletta rischia di prendersi l'incontro proprio durante l'intervento per
       cui era venuto, e a quel punto salta l'uno o salta l'altro. */
    const m = mail();
    const html = senzaTrattini(m.html);
    esigi(/programma dei lavori in sala si aggiorna/.test(html), 'la mail lo ricorda');
    esigi(/prima di scegliere l'orario/.test(html), 'e dice quando guardarlo: prima di scegliere');
    esigi(html.indexOf('https://nextgenerationbusiness.it/napoli_ottobre_2026/') > 0,
        'con il collegamento alla pagina del convegno, dove la scaletta vive');
    esigi(/programma dei lavori in sala si aggiorna/.test(m.testo)
        && m.testo.indexOf('https://nextgenerationbusiness.it/napoli_ottobre_2026/') > 0,
        'e lo stesso nel testo semplice');
    // senza indirizzo resta il consiglio, non un collegamento a vuoto
    const senzaUrl = NL.invitoB2BAzienda({
        evento: { titolo: 'Napoli', quando: '2 ottobre 2026', luogo: 'Hotel' },
        aree: AREE, giornata: GIORNATA, regole: MODELLO.regoleB2B(GIORNATA)
    });
    esigi(/programma dei lavori in sala si aggiorna/.test(senzaTrattini(senzaUrl.html)),
        'senza la pagina dell evento il consiglio resta');
    esigi(senzaUrl.html.indexOf('Il programma dei lavori</a>') < 0,
        'ma non si inventa un collegamento che non c e');
});

prova('Le sezioni hanno tutte la stessa forma', () => {
    /* Prima erano due riquadri disegnati a mano e in mezzo un titoletto nudo:
       tre pesi diversi nella stessa pagina. Qui si contano i riquadri, cioe'
       si verifica che nessuna sezione sia tornata a farsi da se'. Con la
       scadenza sono quattro - quando e dove, i tavoli, come funziona, entro
       quando - e senza sono tre. */
    const quanti = corpoDi(mail().html).split('border-left:3px solid').length - 1;
    esigi(quanti === 4, 'con la scadenza i riquadri del corpo sono quattro', 'contati: ' + quanti);
    const senzaScadenza = NL.invitoB2BAzienda({
        evento: { titolo: 'Napoli', quando: '2 ottobre 2026', luogo: 'Hotel Eurostars Excelsior' },
        aree: AREE, giornata: GIORNATA, regole: MODELLO.regoleB2B(GIORNATA)
    });
    const senza = corpoDi(senzaScadenza.html).split('border-left:3px solid').length - 1;
    esigi(senza === 3, 'e senza scadenza sono tre: quel riquadro non compare vuoto', 'contati: ' + senza);
});

console.log('\nLa forma della mail d\'invito B2B\n');
for (const p of prove) {
    console.log('\n' + p.titolo);
    try { p.fn(); } catch (e) { ko++; console.log('  ROSSO  eccezione: ' + (e && e.stack || e)); }
}
console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
