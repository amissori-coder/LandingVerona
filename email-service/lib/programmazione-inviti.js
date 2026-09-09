/* ============================================================
   Inviti programmati: le parti condivise
   ------------------------------------------------------------
   Le usano in due: le azioni che programmano, sospendono e annullano
   (dentro lib/aziende-invito.js, perche' arrivano dalla stessa
   sezione dell'area riservata) e il lavoro automatico che a ogni giro
   spedisce quello che e' dovuto (lib/giro-inviti.js).

   E' la stessa idea gia' in piedi per le newsletter
   (lib/programmate.js), con due differenze che nascono dalla natura
   degli inviti e vanno dette subito.

   1) L'ESITO VIVE SULLA SCHEDA, non sul lotto. Ogni azienda ha la sua
      scheda in "aziendeInvito", e li' sta scritto se il messaggio e'
      partito, quando, da quale canale e con quale codice. Percio' qui
      non serve il segnalibro "a che punto ero": basta ripassare gli
      identificativi, e chi ha gia' ricevuto viene saltato dal motore
      (lib/invio-inviti.js, funzione giaServita). Una ripresa non
      rispedisce a nessuno per costruzione, non per attenzione.

   2) IL FRENO E' UN RITMO, non una data. Una newsletter parte tutta
      insieme a un'ora decisa; un invito a freddo a cinquemila aziende
      NON deve partire tutto insieme, ne' si potrebbe. Quindi la
      programmazione porta con se' un ritmo (250 PEC ogni novanta
      minuti, 1.000 email ogni ora) e una finestra scorrevole che dice
      quanti ne sono gia' partiti in questo giro di orologio.

   DOVE STANNO GLI INDIRIZZI. Nel documento padre non ce ne sono: c'e'
   il testo del messaggio, il ritmo e dei contatori. Gli identificativi
   delle schede - che contengono il recapito dell'azienda - stanno solo
   nella sottocollezione "lotti", scritta e letta dall'account di
   servizio, e cancellata appena l'invio finisce o viene annullato.
   Stessa regola delle newsletter programmate, per la stessa ragione:
   quel posto non deve diventare un secondo archivio che nessuno
   ricorda.

   PERCHE' L'IDENTIFICATIVO DEL DOCUMENTO E' evento~campagna. Cosi'
   "una sola programmazione attiva per elenco" e' vero per costruzione:
   due persone che programmano lo stesso elenco, anche da due browser,
   finiscono sullo stesso documento e la seconda viene respinta dalla
   transazione invece di creare un doppione che spedirebbe tutto due
   volte. Il canale NON entra nell'identificativo apposta: due
   programmazioni sullo stesso elenco, una via PEC e una via email,
   scriverebbero alle stesse aziende senza saperlo l'una dell'altra.
   ============================================================ */

const RITMI = require('./ritmi-invito');

const COLL = 'invitiProgrammati';
const META = 'cronInviti';

/* Gli stati, e cosa vuol dire ognuno.
     preparazione  il documento c'e' ma l'elenco degli identificativi sta
                   ancora arrivando dall'area riservata, a blocchi. Non
                   parte niente: una programmazione a meta' che partisse
                   scriverebbe alle prime cinquecento e basta;
     programmata   pronta, aspetta la sua ora;
     in-corso      il lavoro automatico l'ha presa in mano almeno una volta;
     sospesa       ferma per scelta di chi la segue. Occupa comunque il
                   posto dell'elenco, perche' riprendera';
     conclusa      finita l'elenco;
     annullata     fermata per sempre;
     interrotta    fermata dal servizio (il gestore ha bloccato l'invio) e
                   non ripresa. */
const IN_PREPARAZIONE = 'preparazione';
/* Occupano il posto: finche' una di queste e' li', su quell'elenco non
   se ne puo' creare un'altra. */
const ATTIVI = [IN_PREPARAZIONE, 'programmata', 'in-corso', 'sospesa'];
/* Le prende il lavoro automatico. "sospesa" no: e' ferma apposta. */
const DA_LAVORARE = ['programmata', 'in-corso'];

function eAttiva(stato) { return ATTIVI.indexOf(String(stato || '')) >= 0; }
function daLavorare(stato) { return DA_LAVORARE.indexOf(String(stato || '')) >= 0; }

/* L'identificativo: evento e campagna, ripuliti dai caratteri che
   Firestore non ammette in un nome di documento. */
function idDi(evento, campagna) {
    return (String(evento || '') + '~' + String(campagna || 'invito'))
        .replace(/[\/\\.#$\[\]]/g, '-').slice(0, 300);
}
function rif(db, id) { return db.collection(COLL).doc(String(id)); }
function rifLotti(db, id) { return rif(db, id).collection('lotti'); }
function nomeLotto(i) { return ('0000' + i).slice(-5); }

/* Quanti identificativi per documento di lotto. Non e' un numero magico:
   un identificativo e' lungo quanto un indirizzo di posta, e cinquecento
   stanno larghi dentro il tetto di un documento Firestore (1 MB) senza
   costringere a leggerne cento per ogni giro. */
const PER_LOTTO = 500;

/* Dopo quanto una preparazione mai avviata si considera persa. Serve a due
   cose che sembrano una sola e non lo sono: permettere a un'altra
   programmazione di prendere il posto su quell'elenco, e far cancellare al
   lavoro automatico gli identificativi rimasti - che contengono i recapiti
   delle aziende, e non devono restare in archivio perche' un browser e'
   morto a meta' caricamento. */
const SCADE_PREPARAZIONE_MS = 30 * 60 * 1000;

/* IL RITMO, contato su una finestra scorrevole.
   La finestra si apre al primo messaggio che parte davvero e dura
   quanto dice il ritmo. Dentro ci stanno "quanti" messaggi; finita la
   finestra, il conto riparte da zero.

   Perche' scorrevole e non ad ore piene: se le finestre fossero
   agganciate all'orologio, una programmazione avviata alle 10:58
   spedirebbe il suo lotto e poi, due minuti dopo, ne spedirebbe un
   altro intero perche' e' cambiata l'ora. Il ritmo che si e' scelto
   sarebbe stato il doppio, proprio nel momento peggiore - l'inizio,
   quando il gestore ci sta ancora guardando. */
function finestraDi(dati, adesso) {
    const ora = Number(adesso) || Date.now();
    const ritmo = RITMI.normalizza(dati && dati.canale, dati && dati.ritmo);
    const durata = ritmo.ogniMin * 60 * 1000;
    const f = (dati && dati.finestra) || {};
    const primo = Number(f.inizio) || 0;
    let inizio = primo;
    let usati = Number(f.usati) || 0;
    if (primo > 0 && (ora - primo) >= durata) {
        /* Finestra scaduta: la successiva NON comincia adesso, comincia dove
           sarebbe cominciata da sola. E' la differenza fra un ritmo e un
           ritmo che rallenta: rimettendo l'inizio all'istante in cui il
           lavoro automatico si accorge della scadenza, ogni finestra
           incasserebbe il ritardo del giro (fino a dieci minuti) e in una
           giornata di invii il ritmo reale scenderebbe parecchio sotto
           quello promesso, senza che si veda da nessuna parte.
           Si salta avanti di un numero intero di finestre, cosi' anche i
           periodi in cui non e' partito niente si recuperano senza spostare
           la cadenza - la stessa aritmetica delle comunicazioni ricorrenti. */
        inizio = primo + Math.floor((ora - primo) / durata) * durata;
        usati = 0;
    }
    const disponibili = Math.max(0, ritmo.quanti - usati);
    return {
        ritmo: ritmo, durata: durata,
        // 0 = non e' mai partita: la aprira' il primo messaggio che parte davvero
        inizio: primo > 0 ? inizio : 0,
        usati: usati, disponibili: disponibili,
        // quando si riapre: solo se e' chiusa perche' piena, non se non e' mai partita
        riprendeAlle: (primo > 0 && disponibili === 0) ? inizio + durata : 0
    };
}

/* Quanti messaggi puo' far partire QUESTO giro: quello che resta nella
   finestra, ma non piu' della quota per giro (che spalma il ritmo
   invece di scaricarlo tutto nei primi minuti: vedi lib/ritmi-invito.js). */
function quantiOra(dati, adesso) {
    const f = finestraDi(dati, adesso);
    return Math.min(f.disponibili, RITMI.perGiro(f.ritmo));
}

/* Il battito del lavoro automatico. Serve a una cosa sola ma
   importante: accorgersi che il giro NON e' partito. Vercel non
   ritenta le esecuzioni fallite, quindi senza questo un invio
   programmato che non parte non lo scopre nessuno finche' qualcuno non
   chiede "ma gli inviti di lunedi'?". */
async function battito(db, dati) {
    try {
        await db.collection('meta').doc(META).set(
            Object.assign({ quando: Date.now() }, dati || {}), { merge: true });
    } catch (e) { /* il battito che non si scrive non deve fermare l'invio */ }
}
async function leggiBattito(db) {
    try {
        const s = await db.collection('meta').doc(META).get();
        return s.exists ? (s.data() || null) : null;
    } catch (e) { return null; }
}

/* Cancella gli identificativi appena non servono piu'. Non e' igiene
   formale: la sottocollezione dei lotti e' l'unico posto nuovo in cui
   vivono dei recapiti, e non deve sopravvivere all'invio. */
async function cancellaLotti(db, id) {
    try {
        const q = await rifLotti(db, id).get();
        let batch = db.batch(), n = 0;
        for (const d of q.docs) {
            batch.delete(d.ref); n++;
            if (n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
        }
        if (n) await batch.commit();
        return q.size;
    } catch (e) {
        console.error('Inviti programmati: pulizia dei lotti non riuscita:', String((e && e.message) || e).slice(0, 200));
        return -1;
    }
}

/* Quello che si puo' raccontare di una programmazione senza tirare
   fuori ne' recapiti ne' il testo intero del messaggio. Lo legge l'area
   riservata per disegnare il riquadro dell'avanzamento. */
function perVideo(id, d) {
    if (!d) return null;
    const f = finestraDi(d);
    const conti = d.conti || {};
    const fatte = (Number(conti.inviate) || 0) + (Number(conti.falliti) || 0)
        + (Number(conti.saltate) || 0) + (Number(conti.senzaRecapito) || 0)
        + (Number(conti.disiscritte) || 0) + (Number(conti.incerte) || 0);
    return {
        id: id,
        evento: d.evento || '', campagna: d.campagna || '', canale: d.canale || 'email',
        stato: d.stato || '', quando: d.quando || 0,
        ritmo: f.ritmo, ritmoTesto: RITMI.descrizione(d.canale, f.ritmo),
        totale: d.totale || 0, lotti: d.lotti || 0,
        conti: {
            inviate: Number(conti.inviate) || 0,
            falliti: Number(conti.falliti) || 0,
            saltate: Number(conti.saltate) || 0,
            senzaRecapito: Number(conti.senzaRecapito) || 0,
            disiscritte: Number(conti.disiscritte) || 0,
            incerte: Number(conti.incerte) || 0
        },
        fatte: fatte,
        restano: Math.max(0, (d.totale || 0) - fatte),
        finestra: { usati: f.usati, disponibili: f.disponibili, riprendeAlle: f.riprendeAlle },
        oggetto: String(d.mail && d.mail.oggetto || '').slice(0, 250),
        forza: d.forza === true,
        creato: d.creato || null, avviato: d.avviato || null, concluso: d.concluso || null,
        sospesa: d.sospesa || null, annullato: d.annullato || null,
        ultimoErrore: String(d.ultimoErrore || '').slice(0, 300),
        ultimoGiro: d.ultimoGiro || 0
    };
}

module.exports = {
    COLL, META, ATTIVI, DA_LAVORARE, IN_PREPARAZIONE, PER_LOTTO, SCADE_PREPARAZIONE_MS,
    eAttiva, daLavorare, idDi, rif, rifLotti, nomeLotto,
    finestraDi, quantiOra, battito, leggiBattito, cancellaLotti, perVideo
};
