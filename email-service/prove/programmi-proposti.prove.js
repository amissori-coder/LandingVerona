/* ============================================================
   PROVE - area-riservata/programmi-proposti.js
   ------------------------------------------------------------
       node prove/programmi-proposti.prove.js

   Le bozze dei programmi sono DATI scritti a mano, ricopiati da
   una tabella: e' il genere di cosa che si rompe in silenzio - un
   tipo di voce che non esiste piu', un'ora con il punto al posto
   dei due punti, due interventi che si accavallano perche' uno si
   e' allungato e l'altro no. Nessuno di questi errori si vede
   finche' qualcuno non apre la giornata di quell'evento, e a quel
   punto la bozza che doveva far risparmiare tempo lo fa perdere.

   Qui ogni bozza passa dalle STESSE regole della scaletta vera:
     - il servizio (lib/programma-evento.js) la normalizza come se
       arrivasse da un salvataggio: se un tipo non esiste o un'ora
       e' scritta male, la normalizzazione lo fa vedere;
     - la giornata (area-riservata/programma-giornata.js) dice
       cosa non torna: ore mancanti, voci in contemporanea, una
       tavola rotonda senza moderatore.

   L'unico avviso AMMESSO e' "manca il moderatore": nella tabella
   di partenza il moderatore non c'e', e va scelto fra gli
   iscritti quando si compone la giornata. Ogni altro avviso e'
   un errore di ricopiatura.
   ============================================================ */
'use strict';
const path = require('path');
const PROP = require(path.join(__dirname, '..', '..', 'area-riservata', 'programmi-proposti.js'));
const G = require(path.join(__dirname, '..', '..', 'area-riservata', 'programma-giornata.js'));
const PRG = require(path.join(__dirname, '..', 'lib', 'programma-evento.js'));

let ok = 0, ko = 0;
function esigi(cond, testo) { if (cond) { ok++; console.log('  ok   ' + testo); } else { ko++; console.log('  KO   ' + testo); } }
function prova(nome, fn) {
    console.log('\n' + nome);
    try { fn(); } catch (e) { ko++; console.log('  KO   eccezione: ' + (e && e.stack || e)); }
}

const eventi = Object.keys(PROP.PROPOSTE);

prova('1) Le bozze ci sono, e si riconoscono dal loro evento', () => {
    esigi(eventi.length > 0, 'c\'e almeno una bozza (' + eventi.join(', ') + ')');
    eventi.forEach(id => {
        esigi(PROP.esiste(id), id + ': esiste');
        esigi(PROP.quante(id) === PROP.PROPOSTE[id].voci.length, id + ': il conto delle voci torna');
        esigi(!!PROP.fonte(id), id + ': dice da dove arriva');
    });
    esigi(!PROP.esiste('evento-che-non-c-e'), 'un evento senza bozza non ne inventa una');
    esigi(PROP.di('evento-che-non-c-e').length === 0, 'e non restituisce voci');
});

prova('2) Ogni bozza esce dalla normalizzazione del servizio com\'era entrata', () => {
    eventi.forEach(id => {
        const voci = PROP.di(id);
        const p = PRG.normalizzaProgramma({ evento: id, voci: voci }, id);
        esigi(p.voci.length === voci.length, id + ': non si perde nessuna voce');
        p.voci.forEach((v, i) => {
            const prima = voci[i];
            esigi(v.tipo === prima.tipo, id + ' - "' + prima.titolo + '": il tipo "' + prima.tipo + '" esiste nel servizio');
            esigi(v.titolo === prima.titolo, id + ' - "' + prima.titolo + '": il titolo resta intero (max 200)');
            esigi(v.nota === prima.nota, id + ' - "' + prima.titolo + '": la nota resta intera (max 500)');
            esigi(v.dalle === prima.dalle && v.alle === prima.alle,
                id + ' - "' + prima.titolo + '": le ore ' + prima.dalle + '-' + prima.alle + ' sono valide e in ordine');
        });
    });
});

prova('3) Una bozza sta in piedi da sola: niente buchi, niente contemporanee', () => {
    eventi.forEach(id => {
        const voci = PROP.di(id);
        const avvisi = G.avvisi(voci, PRG.TIPI).map(a => a.testo);
        const restanti = avvisi.filter(t => !/manca il moderatore$/.test(t));
        esigi(restanti.length === 0, id + ': nessun avviso oltre ai moderatori da scegliere'
            + (restanti.length ? ' - invece: ' + restanti.join(' | ') : ''));
        // le voci sono gia' in ordine di orario: si legge come succede la giornata
        const ordinate = G.ordina(voci).map(v => v.dalle).join(' ');
        esigi(ordinate === voci.map(v => v.dalle).join(' '), id + ': le voci sono gia in ordine di orario');
        // e la giornata ha due meta': una bozza tutta di mattina sarebbe una bozza a meta'
        const fasce = G.dividi(voci, G.confine(voci, {}));
        esigi(fasce.mattina.length > 0 && fasce.pomeriggio.length > 0 && fasce.senzaOra.length === 0,
            id + ': ' + fasce.mattina.length + ' voci di mattina, ' + fasce.pomeriggio.length + ' di pomeriggio, nessuna senza ora');
    });
});

prova('4) La bozza non manda nessuno sul palco da sola', () => {
    eventi.forEach(id => {
        const voci = PROP.di(id);
        const conNomi = voci.filter(v => (v.moderatore && v.moderatore.nome) || (v.partecipanti || []).length);
        esigi(conNomi.length === 0, id + ': nessun relatore scritto a mano (si scelgono fra gli iscritti)');
        /* La nota e' dove la bozza mette il contenuto e i relatori previsti,
           ed e' la ragione per cui esiste. Ma NON e' obbligatoria: una voce
           come "Lunch buffet e networking" si spiega da sola, e una nota
           messa per forza diventa una riga in piu' da leggere sul foglio del
           leggio. Si pretende che la bozza serva a qualcosa - la maggior
           parte delle voci porta il suo contenuto - non che ogni riga abbia
           una didascalia. */
        const conNota = voci.filter(v => v.nota);
        esigi(conNota.length >= Math.ceil(voci.length * 0.7),
            id + ': ' + conNota.length + ' voci su ' + voci.length + ' portano con se il contenuto, nella nota');
    });
});

prova('5) Riportare la bozza due volte da due copie indipendenti', () => {
    const id = eventi[0];
    const a = PROP.di(id), b = PROP.di(id);
    a[0].titolo = 'corretto a mano';
    esigi(b[0].titolo !== 'corretto a mano', 'correggere una copia non tocca l\'altra');
    esigi(PROP.PROPOSTE[id].voci[0].titolo !== 'corretto a mano', 'ne tocca la bozza di partenza');
    esigi(a.every(v => v.id) && new Set(a.map(v => v.id)).size === a.length, 'ogni voce ha il suo identificativo, tutti diversi');
});

console.log('\n' + ok + ' ok, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
