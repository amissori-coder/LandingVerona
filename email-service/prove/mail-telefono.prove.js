/* ============================================================
   PROVE - le mail si leggono sul telefono
   ------------------------------------------------------------
       node prove/mail-telefono.prove.js

   COSA DIMOSTRANO. Quasi tutti aprono la posta dal telefono, e una
   mail composta su una colonna da 600 pixel li' ci arriva stretta a
   320. Le cose che si rompono sono sempre le stesse, e nessuna si
   vede rileggendo il testo:
     - il CORPO TROPPO PICCOLO. Sotto i 14px una frase intera, su un
       telefono, si legge storcendo gli occhi; le etichette - corte,
       maiuscole, spaziate, in grassetto - reggono i 13, non meno.
     - il CONTRASTO. Un grigio chiaro su fondo chiaro sparisce al
       sole. La soglia e' quella delle linee guida, 4,5 a 1.
     - il GIUSTIFICATO su colonna stretta. Giustificare vuol dire
       allargare gli spazi finche' la riga arriva in fondo: a una
       quarantina di caratteri basta una ragione sociale in maiuscolo
       che non si spezza perche' la riga si apra in voragini. Sotto i
       480px si va a bandiera.
     - le LARGHEZZE FISSE. La colonna dell'ora, 110px comodi su 600,
       su 320 si prende il 39% della riga e spezza in tre il nome del
       tavolo.
   Qui si legge l'HTML vero delle mail e si controllano queste cose
   senza aprire un browser: le misure stanno scritte nel foglio di
   stile e negli stili delle celle, e da li' si leggono.
   La prova con il browser vero esiste ed e' un'altra: apre le mail a
   320 e a 375 pixel e misura quello che il foglio di stile non dice
   (se la pagina scorre in orizzontale, quanto e' alto un pulsante).
   ============================================================ */
'use strict';
const path = require('path');
const NL = require(path.join(__dirname, '..', '..', 'area-riservata', 'newsletter-format.js'));
const MNGB = require(path.join(__dirname, '..', 'lib', 'mail-ngb.js'));
const MODELLO = require(path.join(__dirname, '..', 'lib', 'agenda-modello.js'));

let ok = 0, ko = 0;
function esigi(cond, testo, extra) {
    if (cond) { ok++; console.log('  verde  ' + testo); }
    else { ko++; console.log('  ROSSO  ' + testo + (extra ? '   ' + extra : '')); }
}
const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

const GIORNATA = { inizio: '10:00', fine: '17:30', pranzoDa: '13:30', pranzoA: '14:30', durata: 30 };
const EVENTO = {
    titolo: 'Napoli', quando: '2 ottobre 2026', sottotitolo: 'Costruire l\'impresa del futuro',
    luogo: 'Hotel Eurostars Excelsior', indirizzo: 'Via Partenope 48, Napoli',
    scadenzaB2B: '30 settembre', url: 'https://nextgenerationbusiness.it/napoli_ottobre_2026/'
};
const AREE = ['Merito creditizio', 'Adeguati assetti', 'Modello 231 e Tax Control Framework']
    .map((n, i) => ({ id: 'a' + i, nome: n, descrizione: n }));
const DATI = { evento: EVENTO, aree: AREE, giornata: GIORNATA, regole: MODELLO.regoleB2B(GIORNATA, '30 settembre') };
const TAVOLI = [{ nome: 'Modello 231 e Tax Control Framework', orario: 'dalle 15:30 alle 16:00', perChi: 'Andrea Missori' }];
const AZIENDA = 'COMPAGNIA UNICA LAVORATORI PORTUALI';
function tutte() {
    return [
        ['invito (lettera)', NL.invitoB2BAzienda(DATI).html],
        ['invito (breve)', NL.invitoB2BAziendaBreve(DATI).html],
        ['conferma', MNGB.confermaB2BAzienda({ evento: EVENTO, azienda: AZIENDA, tavoli: TAVOLI }, 'https://x/').html],
        ['annullamento', MNGB.invitoB2BAnnullato({ evento: EVENTO, azienda: AZIENDA, tavoli: TAVOLI }).html]
    ];
}
/* Gli stili del foglio in testa NON sono misure del testo: li' dentro ci sono
   le regole per il telefono, che sono l'opposto del problema. Si guardano
   quindi solo le misure scritte sulle celle, cioe' il documento dopo </style>. */
function corpoSolo(html) {
    /* Via anche il testo NASCOSTO dell'anteprima (quello che il client mostra
       accanto all'oggetto): sta a 1px apposta, e non lo legge nessuno. */
    return String(html).slice(String(html).indexOf('</style>'))
        .replace(/<div style="display:none[^>]*>[\s\S]*?<\/div>/g, '');
}

prova('Niente testo sotto i 13px, e niente prosa sotto i 14', () => {
    tutte().forEach(([nome, html]) => {
        const corpo = corpoSolo(html);
        const misure = (corpo.match(/font-size:(\d+)px/g) || []).map(x => parseInt(x.replace(/\D/g, ''), 10));
        const minimo = Math.min.apply(null, misure);
        esigi(minimo >= 13, nome + ': la misura piu' + '­' + ' piccola e ' + minimo + 'px', 'misure: ' + Array.from(new Set(misure)).sort((a, b) => a - b).join(' '));
        /* La PROSA e' quella che porta la classe "par": frasi intere,
           giustificate. Sotto i 14px non ci va. */
        const prosa = (corpo.match(/class="[^"]*par[^"]*"[^>]*style="[^"]*font-size:(\d+)px/g) || [])
            .map(x => parseInt(x.slice(x.lastIndexOf(':') + 1), 10));
        const minProsa = prosa.length ? Math.min.apply(null, prosa) : 99;
        esigi(minProsa >= 14, nome + ': e la prosa non scende sotto i 14px (' + minProsa + ')');
    });
});

prova('Il foglio di stile dice al telefono che cosa fare', () => {
    tutte().forEach(([nome, html]) => {
        esigi(/<meta name="viewport" content="width=device-width/.test(html), nome + ': dichiara la larghezza del dispositivo');
        esigi(/-webkit-text-size-adjust:100%/.test(html) || /text-size-adjust/.test(html),
            nome + ': impedisce al telefono di ingrandire il testo da se');
        esigi(/max-width:620px/.test(html), nome + ': ha la regola per la colonna stretta');
        /* SOTTO I 480px SI VA A BANDIERA: e' la riga che salva le lettere
           indirizzate alle imprese dal nome lungo. */
        esigi(/max-width:480px\)\{[^}]*text-align:left!important/.test(html),
            nome + ': e sotto i 480px il testo va a bandiera');
        esigi(/\.btnlink\{display:block!important/.test(html) || !/btnlink/.test(html),
            nome + ': il pulsante prende tutta la riga');
    });
});

prova('Il riquadro degli incontri si stringe con lo schermo', () => {
    /* La colonna dell'ora ha una larghezza fissa perche' le ore si leggano
       incolonnate. Su 320px pero' quei 110 pixel sono il 39% della riga. */
    [['conferma', MNGB.confermaB2BAzienda({ evento: EVENTO, azienda: AZIENDA, tavoli: TAVOLI }, 'https://x/').html],
     ['annullamento', MNGB.invitoB2BAnnullato({ evento: EVENTO, azienda: AZIENDA, tavoli: TAVOLI }).html]]
        .forEach(([nome, html]) => {
            esigi(/<td width="110" class="ora"/.test(html), nome + ': la colonna dell ora si riconosce');
            esigi(/\.ora\{width:62px!important;white-space:normal!important/.test(html),
                nome + ': e sul telefono si stringe, lasciando andare a capo l ora');
        });
    /* I riquadri a due colonne (etichetta e valore) si impilano invece di
       restringere il valore a una parola per riga. */
    const conf = MNGB.confermaB2BAzienda({ evento: EVENTO, azienda: AZIENDA, tavoli: TAVOLI }, 'https://x/').html;
    esigi(/\.bxet\{display:block!important;width:100%!important/.test(conf),
        'e le righe del riquadro si impilano, etichetta sopra e valore sotto');
});

prova('Le due copie del foglio di stile dicono la stessa cosa', () => {
    /* Le mail nascono in due posti - l'area riservata le compone, il servizio
       le manda - e ognuno ha il suo involucro. Le regole per il telefono sono
       la stessa cosa detta due volte: se una delle due resta indietro, meta'
       delle mail si legge bene e meta' no, e non lo scopre nessuno. */
    const area = NL.invitoB2BAziendaBreve(DATI).html;
    const servizio = MNGB.confermaB2BAzienda({ evento: EVENTO, azienda: AZIENDA, tavoli: TAVOLI }, 'https://x/').html;
    ['max-width:620px', 'max-width:480px', 'text-align:left!important', '.px{padding-left:24px!important'].forEach(regola => {
        esigi(area.indexOf(regola) >= 0 && servizio.indexOf(regola) >= 0,
            'tutte e due hanno "' + regola + '"');
    });
});

console.log('\nLe mail sul telefono\n');
for (const p of prove) {
    console.log('\n' + p.titolo);
    try { p.fn(); } catch (e) { ko++; console.log('  ROSSO  eccezione: ' + (e && e.stack || e)); }
}
console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
