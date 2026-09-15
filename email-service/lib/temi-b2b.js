/* ============================================================
   Le AREE degli incontri B2B (i tavoli)
   ------------------------------------------------------------
   Un tavolo per area. Le prime nove sono gli argomenti del
   convegno; le ultime due - il desk Revilaw e la revisione legale -
   non sono tappe del programma ma tavoli che ci sono lo stesso, e
   chi organizza li gestisce insieme agli altri.

   L'elenco sta qui, in un posto solo, perche' lo usano TRE pezzi del
   servizio: presenze.js (che con l'invito riceve l'area e l'orario di
   ciascun tavolo e deve poter scartare le etichette che non conosce),
   iscrizione-nuova.js (che legge e salva le prenotazioni) e
   agenda-b2b.js (che tiene referenti, slot e prenotazioni della
   giornata). Finche' erano due copie, bastava una virgola di
   differenza perche' un orario arrivasse su un tavolo e la
   prenotazione su un altro.

   DUE NOMI PER LA STESSA COSA, e servono tutti e due:
     - `id` e' la chiave STABILE con cui l'area viaggia fra invito,
       prenotazione e agenda. Non cambia mai: se un giorno si
       riscrive l'etichetta, le prenotazioni gia' prese restano
       attaccate al loro tavolo;
     - `nome` e' l'etichetta corta che si legge in tabella, nella
       mail e sul foglio del desk. Quella si puo' ritoccare.

   L'ORDINE non si cambia e le voci non si tolgono: la prenotazione
   vecchia (quella a caselle, prima che ci fossero gli slot) viaggia
   per INDICE, e spostare una riga sposterebbe le scelte gia' fatte
   da un argomento all'altro. Le voci nuove si aggiungono in fondo.

   Le stesse etichette, nello stesso ORDINE, stanno anche:
     - area-riservata/newsletter-format.js (TEMI_B2B, con la
       descrizione lunga accanto: e' quella che va nella mail);
     - incontri_b2b/index.html (le sole descrizioni lunghe).
   Sono file di un altro pezzo del sistema, che non condividono
   moduli con il servizio: se un giorno un'area cambia, vanno
   aggiornati tutti e tre.
   ============================================================ */

const AREE_B2B = [
    { id: 'merito-creditizio', nome: 'Merito creditizio' },
    { id: 'governance', nome: 'Governance e controllo di gestione' },
    { id: 'adeguati-assetti', nome: 'Adeguati assetti' },
    { id: 'esg', nome: 'ESG e sostenibilita' },
    { id: 'modello-231', nome: 'Modello 231 e Rating di Legalita' },
    { id: 'finanza-agevolata', nome: 'Finanza agevolata' },
    { id: 'tax-control-framework', nome: 'Tax Control Framework' },
    { id: 'bagnoli', nome: "Bagnoli e America's Cup 2027" },
    { id: 'altre-esigenze', nome: 'Altre esigenze' },
    /* I due tavoli che non sono tappe del programma: il desk dello studio,
       dove si chiede di Revilaw, e la revisione legale, che e' il mestiere
       di casa e non compare fra gli argomenti del convegno. */
    { id: 'desk-revilaw', nome: 'Desk Revilaw' },
    { id: 'revisione', nome: 'Revisione legale' }
];

// le sole etichette, nello stesso ordine: la forma con cui gli orari e le
// prenotazioni viaggiavano gia' prima che le aree avessero un identificativo
const TEMI_B2B = AREE_B2B.map(a => a.nome);

function areaDa(id) {
    const k = String(id == null ? '' : id).trim().toLowerCase();
    return AREE_B2B.find(a => a.id === k) || null;
}
// l'etichetta corta di un'area, oppure stringa vuota se l'identificativo non
// e' dei nostri: chi chiama non deve mai stampare quello che gli e' arrivato
function nomeArea(id) { const a = areaDa(id); return a ? a.nome : ''; }
// dall'etichetta corta all'identificativo (gli inviti vecchi parlano per nome)
function idArea(nome) {
    const k = String(nome == null ? '' : nome).trim().toLowerCase();
    const a = AREE_B2B.find(x => x.nome.toLowerCase() === k);
    return a ? a.id : '';
}

/* Etichette storiche del form del sito che non coincidono alla lettera con i
   nove temi: si riportano comunque come caselle gia' spuntate, cosi' chi ha
   scelto dal sito si ritrova le sue preferenze e puo' modificarle. Le chiavi
   sono in forma normalizzata (minuscole, senza accenti). */
const ALIAS_B2B = {
    'modello 231 e tax control framework': [4, 6],
    'rating di legalita': [4]
};

module.exports = { AREE_B2B, TEMI_B2B, ALIAS_B2B, areaDa, nomeArea, idArea };
