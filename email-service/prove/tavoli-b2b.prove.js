/* ============================================================
   PROVE - i tavoli B2B sono gli stessi in tutti e tre i posti
   ------------------------------------------------------------
       node prove/tavoli-b2b.prove.js

   L'elenco dei tavoli vive in TRE file che non condividono
   moduli, perche' sono tre pezzi diversi del sistema:

     - email-service/lib/temi-b2b.js        (il servizio)
     - area-riservata/newsletter-format.js  (le mail e il modulo)
     - incontri_b2b/index.html              (la pagina dell'ospite)

   E viaggiano per INDICE: la prenotazione a caselle manda i numeri
   delle voci scelte, non i nomi. Basta quindi una riga aggiunta in
   due file su tre perche' un'impresa che chiede il rating di
   legalita' si ritrovi prenotata alla revisione, e nessuno se ne
   accorga finche' non arriva il foglio del desk.

   Qui si mettono i tre elenchi uno accanto all'altro: stessa
   lunghezza, stesso ordine, stesse etichette. E' l'unica prova che
   puo' vedere quello che una modifica a meta' lascia indietro.
   ============================================================ */
'use strict';
const path = require('path');
const fs = require('fs');

const RADICE = path.join(__dirname, '..', '..');
const SERVIZIO = require(path.join(__dirname, '..', 'lib', 'temi-b2b.js'));
const AREA = require(path.join(RADICE, 'area-riservata', 'newsletter-format.js'));

/* Le descrizioni lunghe della pagina dell'ospite: sono un pezzo di
   JavaScript dentro l'HTML, e si leggono da li' invece che ricopiarle -
   una copia in piu' sarebbe un quarto posto da tenere allineato. */
function temiDellaPagina() {
    const html = fs.readFileSync(path.join(RADICE, 'incontri_b2b', 'index.html'), 'utf8');
    const da = html.indexOf('var TEMI = [');
    if (da < 0) throw new Error('la pagina non ha piu un elenco TEMI: e cambiata di forma');
    const a = html.indexOf('];', da);
    const dentro = html.slice(html.indexOf('[', da), a + 1);
    // eslint-disable-next-line no-eval
    return eval(dentro);
}

let ok = 0, ko = 0;
function esigi(cond, testo) { if (cond) { ok++; console.log('  ok   ' + testo); } else { ko++; console.log('  KO   ' + testo); } }
function prova(nome, fn) {
    console.log('\n' + nome);
    try { fn(); }
    catch (e) { ko++; console.log('  KO   eccezione: ' + (e && e.stack || e)); }
}

prova('1) Gli identificativi e le etichette: servizio e area riservata', () => {
    const qui = SERVIZIO.AREE_B2B, la = AREA.AREE_B2B;
    esigi(qui.length === la.length, 'i tavoli sono tanti quanti (' + qui.length + ' e ' + la.length + ')');
    const diversi = qui.filter((a, i) => !la[i] || la[i].id !== a.id);
    esigi(!diversi.length, 'e nello stesso ordine, con gli stessi identificativi'
        + (diversi.length ? ' - non torna: ' + diversi.map(x => x.id).join(', ') : ''));
    const etichette = qui.filter((a, i) => la[i] && la[i].nome !== a.nome);
    esigi(!etichette.length, 'e con la stessa etichetta corta'
        + (etichette.length ? ' - non torna: ' + etichette.map(x => x.nome).join(', ') : ''));
});

prova('2) Le descrizioni lunghe: area riservata e pagina dell\'ospite', () => {
    const pagina = temiDellaPagina();
    esigi(pagina.length === AREA.TEMI_B2B.length,
        'la pagina ne descrive tanti quanti ne propone la mail (' + pagina.length + ' e ' + AREA.TEMI_B2B.length + ')');
    const diverse = AREA.TEMI_B2B.filter((t, i) => pagina[i] !== t.descrizione);
    esigi(!diverse.length, 'e la descrizione di ciascun tavolo e la stessa, alla lettera'
        + (diverse.length ? ' - non torna: ' + diverse.map(x => x.nome).join(', ') : ''));
});

prova('3) Gli alias del modulo del sito portano su tavoli che esistono', () => {
    const n = SERVIZIO.TEMI_B2B.length;
    const fuori = [];
    Object.keys(SERVIZIO.ALIAS_B2B).forEach(k => {
        SERVIZIO.ALIAS_B2B[k].forEach(i => { if (!(i >= 0 && i < n)) fuori.push(k + ' -> ' + i); });
    });
    esigi(!fuori.length, 'nessun alias punta fuori dall\'elenco' + (fuori.length ? ': ' + fuori.join(', ') : ''));
    esigi(SERVIZIO.TEMI_B2B[SERVIZIO.ALIAS_B2B['rating di legalita'][0]] === 'Rating di legalita',
        'chi dal sito ha chiesto il rating di legalita finisce sul tavolo del rating di legalita');
    esigi(SERVIZIO.TEMI_B2B[SERVIZIO.ALIAS_B2B['modello 231 e tax control framework'][0]] === 'Modello 231 e Tax Control Framework',
        'e chi ha chiesto 231 e TCF sul tavolo del 231 e TCF');
    esigi(SERVIZIO.idArea('Modello 231 e Rating di Legalita') === 'modello-231',
        'un invito partito quando il tavolo si chiamava ancora cosi trova lo stesso il suo tavolo');
});

prova('4) Le regole della prenotazione: servizio e mail dicono la stessa cosa', () => {
    /* Le cinque frasi vivono in due posti: il servizio le manda alla pagina di
       chi prenota, l'area riservata le scrive nella mail d'invito - che parte
       prima che qualcuno apra la pagina. Se si allontanassero, l'impresa
       leggerebbe una regola nella mail e ne troverebbe un'altra sul modulo, e
       quella che ha letto quando ha deciso e' la prima. */
    const MODELLO = require(path.join(__dirname, '..', 'lib', 'agenda-modello.js'));
    const giornate = [
        { inizio: '10:00', fine: '17:00', pranzoDa: '13:30', pranzoA: '14:30', durata: 30 },
        { inizio: '09:30', fine: '18:00', pranzoDa: '', pranzoA: '', durata: 45 }
    ];
    giornate.forEach(g => {
        const servizio = MODELLO.regoleB2B(g);
        const mail = AREA.regoleB2B(g);
        esigi(servizio.length === 5 && mail.length === 5, 'sono cinque frasi da tutte e due le parti (' + g.durata + ' minuti)');
        const diverse = servizio.filter((x, i) => x !== mail[i]);
        esigi(!diverse.length, 'e sono identiche alla lettera' + (diverse.length ? ': ' + diverse[0] : ''));
    });
});

console.log('\n' + ok + ' ok, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
