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

/* IL PROSSIMO GIRO del lavoro automatico. Vercel lo fa partire allo scoccare
   di ogni passo (vercel.json, ogni dieci minuti: alle :00, :10, :20... dell'ora UTC,
   che per i minuti e' la stessa di Roma): il primo multiplo del passo DOPO
   l'istante dato. Puo' arrivare con qualche decina di secondi di ritardo,
   percio' a video si dice "verso le". */
function prossimoGiro(adesso, passoMin) {
    const passo = (Number(passoMin) || RITMI.passoCronMin()) * 60000;
    const ora = Number(adesso) || Date.now();
    return Math.floor(ora / passo) * passo + passo;
}

/* Quanto ci mette un messaggio dentro un giro: la pausa fra una PEC e
   l'altra (lib/canali-invito.js, 1,5 secondi) piu' la consegna. E' il valore
   di partenza: appena il giro ha spedito qualcosa, si usa quello misurato
   (velocita.msPerMessaggio, scritto da lib/giro-inviti.js). */
const SECONDI_PER_MESSAGGIO = { pec: 2, email: 0.5 };
/* Il tempo che il giro concede a una programmazione (BUDGET_UNA_MS in
   lib/giro-inviti.js, che lo esporta: le prove controllano che coincidano).
   Con un server lento e' questo, non il ritmo, a dire quanti partono per
   giro. */
const BUDGET_GIRO_MS = 150 * 1000;
/* Il giro allo scoccare dei dieci minuti parte con qualche secondo di
   ritardo, e un blocco si riapre qualche secondo dopo uno scoccare (lo ha
   aperto il primo messaggio di un giro). Se la riapertura cade entro questo
   margine da uno scoccare, quel giro puo' trovarlo gia' riaperto oppure no:
   dipende da quale dei due ritardi e' piu' lungo. Non si sceglie a caso: si
   dicono le due ore. */
const MARGINE_RIAPERTURA_MS = 2 * 60 * 1000;

/* LA PREVISIONE, per chi guarda l'invio partire: quando parte il prossimo
   gruppo di messaggi, quanti sono, e a che ora finisce tutto. Non e' una
   stima a occhio: si rifanno i giri del lavoro automatico con le sue stesse
   regole - lo stesso passo, la stessa quota per giro (RITMI.perGiro), la
   stessa finestra che si riapre a multipli interi della sua durata
   (finestraDi) - finche' l'elenco non e' finito.

   E' un tetto, non una promessa al minuto: le aziende saltate (gia'
   servite, escluse, senza recapito) non consumano il ritmo, quindi l'invio
   puo' finire prima; un server di posta lento, o un giro saltato, dopo.
   Per una programmazione ferma (in pausa, in preparazione, finita, o
   annullata e in attesa che il giro in corso se ne accorga) non si prevede
   niente: dipende da una persona, non dall'orologio.

   Cosa torna: prossimoGiro (lo scoccare prossimo), prossimoInvio e
   quantiProssimo (il primo giro che spedira' davvero), forseAlle (un giro
   prima, se il blocco si riapre proprio a ridosso di uno scoccare: vedi
   MARGINE_RIAPERTURA_MS), inPartenza (quanti sta spedendo adesso il giro in
   corso), fine e restano. */
function previsione(dati, adesso, passoMin) {
    const d = dati || {};
    if (!daLavorare(d.stato) || d.annullaRichiesto === true) return null;
    const ora = Number(adesso) || Date.now();
    const passoM = Number(passoMin) || RITMI.passoCronMin();
    const passo = passoM * 60000;
    const ritmo = RITMI.normalizza(d.canale, d.ritmo);
    const durata = ritmo.ogniMin * 60000;
    const misurati = Number(d.velocita && d.velocita.msPerMessaggio) || 0;
    const msMessaggio = misurati > 0 ? misurati : SECONDI_PER_MESSAGGIO[RITMI.canaleValido(d.canale)] * 1000;
    // quanti ne fa davvero un giro: la quota del ritmo, ma non piu' di quanti ne stanno nel suo tempo
    const perGiro = Math.max(1, Math.min(RITMI.perGiro(ritmo, passoM), Math.floor(BUDGET_GIRO_MS / msMessaggio)));
    const secondi = msMessaggio / 1000;
    const c = d.conti || {};
    const fatte = ['inviate', 'falliti', 'saltate', 'senzaRecapito', 'disiscritte', 'incerte']
        .reduce((s, k) => s + (Number(c[k]) || 0), 0);
    let resto = Math.max(0, (Number(d.totale) || 0) - fatte);
    /* Quelli che il giro in corso sta spedendo adesso: sono gia' nel blocco
       (prenotati) ma non ancora nei conti. Solo finche' il giro tiene il
       lucchetto: un "in volo" rimasto da un giro morto non vale piu'. */
    const giroAdesso = !!(d.lucchetto && Number(d.lucchetto.fino) > ora);
    const volo = giroAdesso ? Math.max(0, Math.min(resto, Number(d.inVolo) || 0)) : 0;
    resto -= volo;
    const fuori = {
        prossimoGiro: prossimoGiro(ora, passoM), prossimoInvio: 0, quantiProssimo: 0, forseAlle: 0,
        inPartenza: volo, fine: 0, restano: resto + volo, perGiro: perGiro
    };
    if (!resto) {
        // l'ultimo gruppo sta partendo adesso: finisce con lui
        if (volo) fuori.fine = ora + Math.round(volo * secondi * 1000);
        return fuori;
    }

    // il primo giro che puo' spedire: non prima dell'ora scelta per la partenza
    const parte = Number(d.quando) || 0;
    let t = parte > ora ? prossimoGiro(parte - 1, passoM) : prossimoGiro(ora, passoM);
    const f = d.finestra || {};
    let inizio = Number(f.inizio) || 0;
    let usati = Number(f.usati) || 0;
    // un tetto ai giri simulati: cento giorni di invio, ben oltre qualunque elenco
    for (let i = 0; i < 20000 && resto > 0; i++) {
        if (inizio && t - inizio >= durata) {
            inizio += Math.floor((t - inizio) / durata) * durata;
            usati = 0;
        }
        const liberi = ritmo.quanti - usati;
        if (liberi <= 0) {
            // finestra piena: si salta al primo giro dentro la prossima
            const riapre = inizio + durata;
            t = prossimoGiro(riapre - 1, passoM);
            /* ...ma se si riapre a ridosso di uno scoccare, quel giro potrebbe
               gia' trovarla aperta: si dice anche lui (solo per il primo invio). */
            const giroPrima = t - passo;
            if (!fuori.prossimoInvio && giroPrima > ora && riapre - giroPrima <= MARGINE_RIAPERTURA_MS) fuori.forseAlle = giroPrima;
            continue;
        }
        const n = Math.min(resto, perGiro, liberi);
        if (!inizio) inizio = t;   // la finestra la apre il primo messaggio
        usati += n;
        resto -= n;
        if (!fuori.prossimoInvio) { fuori.prossimoInvio = t; fuori.quantiProssimo = n; }
        if (!resto) fuori.fine = t + Math.round(n * secondi * 1000);
        t += passo;
    }
    return fuori;
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
        /* La finestra in corso con il suo inizio e la sua fine: e' "il blocco
           di quest'ora" che si vede nel riquadro (quanti ne sono partiti e
           quando comincia il prossimo). */
        finestra: {
            usati: f.usati, disponibili: f.disponibili, riprendeAlle: f.riprendeAlle,
            inizio: f.inizio, fine: f.inizio ? f.inizio + f.durata : 0
        },
        previsione: previsione(d, Date.now()),
        oggetto: String(d.mail && d.mail.oggetto || '').slice(0, 250),
        forza: d.forza === true,
        soloNonIscritte: d.soloNonIscritte === true,
        creato: d.creato || null, avviato: d.avviato || null, concluso: d.concluso || null,
        sospesa: d.sospesa || null, annullato: d.annullato || null,
        ultimoErrore: String(d.ultimoErrore || '').slice(0, 300),
        ultimoGiro: d.ultimoGiro || 0
    };
}

/* IL TESTO DELL'INVITO, per il secondo invio. Il secondo invio deve essere
   IDENTICO al primo - stesso oggetto, stesso testo, stessa versione - e il
   testo vive nella finestra dell'area riservata, che di suo lo riscrive da
   capo a ogni apertura. Percio' gli inviti "normali" (non un rinvio, non un
   secondo invio) portano anche il testo com'era scritto nella finestra, e lo
   si tiene, uno per evento e campagna: il secondo invio lo ripropone tale e
   quale. Si scrive SOLO quando qualcosa e' partito davvero - dopo l'invio a
   mano, e nel giro della programmazione dopo un lotto con messaggi spediti -
   cosi' non diventa "il testo del primo invio" un testo che nessuna azienda
   ha ricevuto (una programmazione annullata, un invio tutto saltato o
   fermato dal tetto). Sta qui e non in aziende-invito.js perche' lo usano
   tutti e due: l'invio a mano e il giro (lib/giro-inviti.js). */
function rifTestoInvito(db, evento, campagna) {
    return db.collection('meta').doc(('testoInvito-' + evento + '~' + campagna).replace(/\//g, '%2F').slice(0, 400));
}
async function ricordaTesto(db, evento, campagna, dati, oggetto, chi) {
    const t = String((dati && dati.testo) || '').slice(0, 100000);
    if (!t.trim()) return;
    try {
        await rifTestoInvito(db, evento, campagna).set({
            evento: evento, campagna: campagna, oggetto: String(oggetto || '').slice(0, 250), testo: t,
            versione: String((dati && dati.versione) || '').replace(/[^a-z]/g, '').slice(0, 20),
            quando: Date.now(), da: String(chi || '').slice(0, 200)
        }, { merge: true });
    } catch (e) {
        console.error('Testo dell\'invito non ricordato:', String((e && e.message) || e).slice(0, 200));
    }
}

module.exports = {
    COLL, META, ATTIVI, DA_LAVORARE, IN_PREPARAZIONE, PER_LOTTO, SCADE_PREPARAZIONE_MS,
    eAttiva, daLavorare, idDi, rif, rifLotti, nomeLotto,
    finestraDi, quantiOra, prossimoGiro, previsione, BUDGET_GIRO_MS, battito, leggiBattito, cancellaLotti, perVideo,
    rifTestoInvito, ricordaTesto
};
