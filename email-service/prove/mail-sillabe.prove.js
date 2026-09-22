/* ============================================================
   PROVE - la sillabazione delle mail
   ------------------------------------------------------------
       node prove/mail-sillabe.prove.js

   Niente da installare: si legge il formato vero delle mail
   (area-riservata/newsletter-format.js) e gli si guardano dentro
   i trattini.

   COSA DIMOSTRANO. Il testo di queste mail e' GIUSTIFICATO, ed e'
   una scelta di chi le firma. Giustificare pero' vuol dire allargare
   gli spazi fra le parole finche' la riga arriva in fondo: in una
   mail non c'e' niente che spezzi le parole a fine riga - i
   programmi di posta non sillabano, e `hyphens:auto` lo capiscono in
   pochi - e su una colonna stretta vengono i "fiumi" bianchi che
   attraversano il paragrafo.
   Allora i punti di sillabazione ce li mettiamo noi, con il trattino
   morbido: e' un carattere, non uno stile, quindi lo capiscono tutti,
   e se la riga non si spezza li' non si vede niente.

   Qui si verifica che le parole si spezzino DOVE VUOLE L'ITALIANO -
   as-set-ti e non a-sset-ti, tra-spor-ti e non tras-por-ti - e
   soprattutto le due cose che, sbagliate, fanno danno:
     - i SEGNAPOSTO ({{REFERENTI}}, {{AZIENDA}}, {{B2B}}) non si
       toccano. Sono parole lunghe fatte di sole lettere: sillabarle
       vorrebbe dire infilarci dentro un carattere invisibile, e chi
       poi sostituisce non le riconosce piu' - al destinatario
       arriverebbe la mail con "{{REFERENTI}}" stampato dentro;
     - il TESTO SEMPLICE resta pulito: li' un carattere invisibile
       non serve a nessuno e certi programmi lo stampano.
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
function prova(nome, fn) {
    console.log('\n' + nome);
    try { fn(); }
    catch (e) { ko++; console.log('  ROSSO  eccezione: ' + (e && e.stack || e)); }
}
const MORBIDO = '\u00ad';
const GIORNATA = { inizio: '10:00', fine: '17:30', pranzoDa: '13:30', pranzoA: '14:30', durata: 30 };
/* La sillabazione non si chiama da fuori: si guarda quello che ESCE dalla
   mail, che poi e' l'unica cosa che conta. Le parole si infilano nella
   descrizione di un tavolo dell'invito e si rileggono con i trattini in
   chiaro. */
function comeEscono(parole) {
    const m = NL.invitoB2BAzienda({
        evento: { titolo: 'Napoli', quando: '2 ottobre 2026' },
        giornata: GIORNATA, regole: MODELLO.regoleB2B(GIORNATA),
        aree: [{ id: 'esg', nome: 'ESG', descrizione: parole.join(' ') }]
    });
    const t = m.html.split(MORBIDO).join('-');
    const da = t.indexOf('color:' + NL.COLORI.tenue + ';"> - ');
    if (da < 0) throw new Error('la descrizione del tavolo non e nella mail');
    return t.slice(da).split('">')[1].split('</span>')[0].replace(/^ - /, '').split(' ');
}

prova('1) Le parole si spezzano dove vuole l\'italiano', () => {
    /* A sinistra la parola, a destra come dev'essere spezzata. Sono i punti
       dell'italiano - as-set-ti e non a-sset-ti, tra-spor-ti e non
       tras-por-ti - passati poi al setaccio della regola tipografica: mai
       una o due lettere da sole a fine o a capo riga, perche' "a-zienda" si
       legge come un errore di stampa. E' per questo che "assetti" non si
       spezza affatto: i suoi due punti lascerebbero due lettere sole. */
    const attese = {
        approfondimento: 'appro-fon-di-mento',
        assetti: 'assetti',
        azienda: 'azienda',
        professionisti: 'pro-fes-sio-ni-sti',
        trasporti: 'tra-sporti',
        contratto: 'con-tratto',
        sciogliere: 'scio-gliere',
        finanziamenti: 'finan-zia-menti',
        collegamento: 'col-le-ga-mento',
        prenotazione: 'pre-no-ta-zione',
        amministrativi: 'ammi-ni-stra-tivi',
        acquacoltura: 'acqua-col-tura'
    };
    const parole = Object.keys(attese);
    const uscite = comeEscono(parole);
    parole.forEach((p, i) => esigi(uscite[i] === attese[p],
        p + ' si spezza ' + attese[p], 'avuto: ' + (uscite[i] || '(niente)')));
});

prova('2) I segnaposto restano interi', () => {
    const g = { inizio: '10:00', fine: '17:30', pranzoDa: '13:30', pranzoA: '14:30', durata: 30 };
    const dati = {
        evento: { titolo: 'Napoli', quando: '2 ottobre 2026', luogo: 'Hotel', indirizzo: 'Via Partenope 48' },
        nome: 'Mario', azienda: 'Alfa S.r.l.', pagina: 'Napoli 2 Ottobre 2026',
        aree: [{ id: 'esg', nome: 'ESG e sostenibilita', descrizione: 'sostenibilita ed ESG' }],
        giornata: g, regole: MODELLO.regoleB2B(g), temi: [], tavoli: []
    };
    const chiavi = ['{{NOME}}', '{{AZIENDA}}', '{{REFERENTI}}', '{{COMPLETA}}', '{{B2B}}', '{{SE_COLLEGHI}}', '{{/SE_COLLEGHI}}'];
    ['confermaEvento', 'richiestaDati', 'invitoB2B', 'invitoB2BArea', 'passaggioOnline', 'promemoriaEvento', 'invitoB2BAzienda']
        .forEach(nome => {
            const m = NL[nome](dati, 'https://esempio.it/collegamento');
            /* Un segnaposto che sta nel testo semplice e non nell'HTML vuol
               dire che nell'HTML si e' rotto: e' li' che la sillabazione
               passa. */
            const rotti = chiavi.filter(k => m.testo.indexOf(k) >= 0 && m.html.indexOf(k) < 0);
            esigi(!rotti.length, nome + ': i segnaposto arrivano interi all\'HTML',
                rotti.length ? 'rotti: ' + rotti.join(' ') : '');
        });
});

prova('3) Il testo semplice non porta trattini invisibili', () => {
    const g = { inizio: '10:00', fine: '17:30', pranzoDa: '13:30', pranzoA: '14:30', durata: 30 };
    const m = NL.invitoB2BAzienda({
        evento: { titolo: 'Napoli', quando: '2 ottobre 2026' },
        aree: [{ id: 'esg', nome: 'ESG', descrizione: 'approfondimento della sostenibilita' }],
        giornata: g, regole: MODELLO.regoleB2B(g)
    });
    esigi(m.testo.indexOf(MORBIDO) < 0, 'nel testo semplice non ce n\'e\' nemmeno uno');
    esigi(m.html.indexOf(MORBIDO) > 0, 'nell\'HTML invece si');
    esigi(m.oggetto.indexOf(MORBIDO) < 0, 'e nemmeno nell\'oggetto, che si legge in elenco');
});

prova('4) Indirizzi e collegamenti non si toccano', () => {
    /* Un indirizzo si seleziona, si incolla e deve funzionare: un carattere
       invisibile in mezzo lo rende inutile, e nessuno capirebbe perche'. */
    const uscite = comeEscono(['segreteria@nextgenerationbusiness.it', 'nextgenerationbusiness.it/incontri']);
    esigi(uscite[0] === 'segreteria@nextgenerationbusiness.it',
        'un indirizzo email resta intero', 'avuto: ' + uscite[0]);
    esigi(uscite[1] === 'nextgenerationbusiness.it/incontri',
        'e cosi un indirizzo web', 'avuto: ' + uscite[1]);
});

console.log('\n' + ok + ' verde, ' + ko + ' ROSSO');
process.exit(ko ? 1 : 0);
