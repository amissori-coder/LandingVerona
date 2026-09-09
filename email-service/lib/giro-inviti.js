/* ============================================================
   Il lavoro automatico che manda avanti gli inviti programmati
   ------------------------------------------------------------
   Lo chiama Vercel a intervalli (vedi vercel.json: ogni dieci minuti).
   A ogni giro guarda quali programmazioni sono dovute, e per ognuna
   spedisce quanti messaggi il RITMO concede adesso, non uno di piu'.

   Le regole che contano, e il guaio che ciascuna evita.

   1) LUCCHETTO. Prima di toccare una programmazione se ne prende uno,
      in transazione. Vercel dichiara che una stessa esecuzione puo'
      partire due volte: senza lucchetto due istanze spedirebbero in
      parallelo alle stesse aziende, e il ritmo verrebbe contato due
      volte a meta'. Il lucchetto dura PIU' della funzione, altrimenti
      il secondo giro entrerebbe mentre il primo sta ancora spedendo.

   2) IL RITMO SI PRENOTA PRIMA DI SPEDIRE, e quello che avanza si
      restituisce dopo. Se si contasse alla fine, una funzione uccisa a
      meta' lascerebbe la finestra a zero e il giro dopo spedirebbe di
      nuovo la stessa quota: il ritmo promesso sarebbe il doppio proprio
      nel momento in cui qualcosa sta gia' andando storto.

   3) UNA RIPRESA NON RISPEDISCE. Non serve nessun segnalibro: l'esito
      sta sulla scheda dell'azienda, e il motore salta chi ha gia'
      ricevuto (lib/invio-inviti.js). Un lotto ripassato per intero
      dopo un'interruzione costa qualche lettura, non un doppione.

   4) SI SCRIVE DOPO OGNI LOTTO, non alla fine. Un timeout a meta' non
      deve far perdere il conto di quello che e' partito.

   Il battito su meta/cronInviti si scrive sempre, all'inizio e alla
   fine: e' l'unico modo per accorgersi che il giro non e' partito
   affatto, che e' diverso dal non aver avuto niente da fare.
   ============================================================ */

const P = require('./programmazione-inviti');
const RITMI = require('./ritmi-invito');
const CANALI = require('./canali-invito');
const MOTORE = require('./invio-inviti');
const NL = require('./newsletter');

/* I tre numeri che si muovono insieme, come per gli altri lavori
   programmati del servizio: il budget sta DENTRO il maxDuration
   dichiarato in vercel.json (300 s), con margine per scrivere i conti
   prima di essere interrotti; il lucchetto dura PIU' del maxDuration,
   o un secondo giro entrerebbe mentre il primo sta ancora spedendo.
   Toccarne uno solo fa perdere l'ultimo lotto oppure lascia entrare
   due giri insieme: si toccano tutti e tre o nessuno. */
const BUDGET_MS = 240 * 1000;
const LUCCHETTO_MS = 6 * 60 * 1000;
/* Quante programmazioni per giro. Meglio finirne una che iniziarne
   cinque: sono elenchi lunghi, e il ritmo di ognuna e' comunque il suo. */
const MAX_PROGRAMMAZIONI = 3;
/* Quanto si lascia a una sola programmazione, cosi' la seconda in coda
   non resta ferma per un'ora perche' la prima ha un elenco enorme. */
const BUDGET_UNA_MS = 150 * 1000;

/* Prende il lucchetto solo se libero, e solo se c'e' ancora qualcosa da
   fare: fra la ricerca e adesso la programmazione puo' essere stata
   sospesa o annullata da chi la segue. Restituisce i dati freschi se
   l'ha preso, altrimenti null. */
async function prendiLucchetto(db, id, giro) {
    let dati = null;
    await db.runTransaction(async (tx) => {
        const s = await tx.get(P.rif(db, id));
        if (!s.exists) return;
        const d = s.data() || {};
        if (!P.daLavorare(d.stato)) return;
        if (Number(d.quando || 0) > Date.now()) return;    // non e' ancora la sua ora
        const l = d.lucchetto || null;
        if (l && Number(l.fino) > Date.now()) return;      // qualcun altro ci sta lavorando
        const avviato = d.avviato || { il: Date.now() };
        tx.set(P.rif(db, id), {
            lucchetto: { fino: Date.now() + LUCCHETTO_MS, giro: giro },
            stato: 'in-corso', avviato: avviato
        }, { merge: true });
        dati = Object.assign({}, d, { stato: 'in-corso', avviato: avviato });
    });
    return dati;
}

/* PRENOTA i messaggi della finestra. Si scrive prima di spedire (vedi
   la regola 2 in cima) e si restituisce quello che non e' servito. La
   transazione serve perche' due giri sovrapposti - il lucchetto li
   esclude, ma un lucchetto scaduto per un giro morto no - non devono
   poter prenotare due volte la stessa quota. */
async function prenota(db, id, quanti) {
    let esito = { concessi: 0, inizio: 0 };
    await db.runTransaction(async (tx) => {
        const s = await tx.get(P.rif(db, id));
        if (!s.exists) return;
        const d = s.data() || {};
        const f = P.finestraDi(d);
        const concessi = Math.min(quanti, f.disponibili);
        if (concessi <= 0) return;
        // la finestra si apre adesso se non era mai partita: la apre il primo messaggio
        const inizio = f.inizio || Date.now();
        tx.set(P.rif(db, id), {
            finestra: { inizio: inizio, usati: f.usati + concessi }
        }, { merge: true });
        esito = { concessi: concessi, inizio: inizio };
    });
    return esito;
}
/* Quello che non e' stato speso torna nella finestra, ma SOLO se e'
   ancora la finestra in cui era stato prenotato. Un lotto puo' cominciare
   a fine finestra e finire dentro quella dopo: un decremento secco si
   mangerebbe dei messaggi della finestra nuova, che nessuno ha speso, e
   il ritmo del giro seguente sarebbe piu' lento di quello scelto senza
   che si capisca perche'. */
async function restituisci(db, id, quanti, inizio) {
    if (!(quanti > 0)) return;
    try {
        await db.runTransaction(async (tx) => {
            const s = await tx.get(P.rif(db, id));
            if (!s.exists) return;
            const f = (s.data() || {}).finestra || {};
            if (Number(f.inizio || 0) !== Number(inizio || 0)) return;
            tx.set(P.rif(db, id), {
                finestra: { inizio: Number(f.inizio) || 0, usati: Math.max(0, (Number(f.usati) || 0) - quanti) }
            }, { merge: true });
        });
    } catch (_) { /* la finestra si riazzera comunque quando scade */ }
}

/* I lotti da guardare in questo giro, in ordine e A PARTIRE DAL SEGNALIBRO.
   Un lotto e' "fatto" quando lo si e' percorso tutto: non vuol dire che
   tutte le sue aziende hanno ricevuto (alcune erano escluse, disiscritte,
   senza recapito), vuol dire che non c'e' piu' niente da chiedersi su
   quegli identificativi.

   IL SEGNALIBRO NON E' UN'OTTIMIZZAZIONE, e' quello che tiene in piedi gli
   elenchi lunghi. Prima si leggevano i primi trenta lotti e si scartavano
   quelli gia' fatti: su cinquantamila aziende i lotti sono cento, e appena
   i primi trenta erano finiti la lettura tornava vuota - il giro concludeva
   "elenco finito" e le settanta migliaia rimanenti sparivano senza che
   niente lo dicesse. Con startAt sul numero del lotto la finestra di lettura
   avanza insieme al lavoro, e "finito" lo decide il conto dei lotti, non
   l'assenza di risultati. */
async function lottiDaFare(db, id, quanti, da) {
    let q = P.rifLotti(db, id).orderBy('n');
    if (da > 1) q = q.startAt(da);
    const s = await q.limit(quanti || 20).get();
    return s.docs;
}

const CONTI_ZERO = { inviate: 0, saltate: 0, senzaRecapito: 0, disiscritte: 0, incerte: 0, falliti: 0 };
function sommaConti(vecchi, nuovi) {
    const c = Object.assign({}, CONTI_ZERO, vecchi || {});
    c.inviate += nuovi.inviate || 0;
    c.saltate += nuovi.saltate || 0;
    c.senzaRecapito += nuovi.senzaRecapito || 0;
    c.disiscritte += nuovi.disiscritte || 0;
    c.incerte += nuovi.incerte || 0;
    c.falliti += (nuovi.falliti || []).length;
    return c;
}

async function concludi(db, id, stato, conti, motivo) {
    await P.rif(db, id).set({
        stato: stato, concluso: { il: Date.now(), motivo: String(motivo || '').slice(0, 300) },
        // fuori scena: il giro non deve piu' nemmeno leggerla
        attiva: false,
        lucchetto: null, conti: conti
    }, { merge: true });
    /* Gli identificativi se ne vanno con la conclusione: hanno finito il
       loro lavoro, e sono l'unico posto nuovo in cui vivevano dei
       recapiti. I conti restano, perche' servono a chi legge dopo. */
    await P.cancellaLotti(db, id);
}

/* Un turno su UNA programmazione: prenota la quota, spedisce, scrive. */
async function lavora(db, id, dati, scadenza, fuori) {
    /* L'annullamento si guarda PRIMA di ogni altra cosa. Stava solo dentro il
       ciclo dei lotti, quindi una programmazione annullata mentre il canale
       era spento, o mentre la finestra era piena, usciva di qui per l'altra
       porta e restava aperta per sempre - con i suoi identificativi, cioe' con
       i recapiti delle aziende, in archivio. */
    if (dati.annullaRichiesto === true) {
        await concludi(db, id, 'annullata', dati.conti || {}, 'annullata mentre era in corso');
        return { annullata: true };
    }

    const canale = String(dati.canale || 'email') === 'pec' ? 'pec' : 'email';
    /* Il canale puo' essere stato spento dopo la programmazione (le
       credenziali PEC tolte da Vercel, per dire). Spedire lo stesso
       vorrebbe dire mandare posta ordinaria facendola passare per
       certificata: si ferma e lo si dice. */
    if (!CANALI.configurato(canale)) {
        await P.rif(db, id).set({
            stato: 'sospesa', lucchetto: null,
            sospesa: { il: Date.now(), da: 'servizio' },
            ultimoErrore: canale === 'pec'
                ? 'Casella PEC non configurata sul servizio: l\'invio programmato e in pausa.'
                : 'Server di posta non configurato sul servizio: l\'invio programmato e in pausa.'
        }, { merge: true });
        return { fermata: 'canale non configurato' };
    }

    const voluti = P.quantiOra(dati);
    if (voluti <= 0) {
        // finestra piena: si molla tutto e si riprende al giro che sta dentro la prossima
        await P.rif(db, id).set({ lucchetto: null, ultimoGiro: Date.now() }, { merge: true });
        return { attesa: 'ritmo' };
    }

    /* Quanti lotti in tutto, e da quale ripartire. Sono due numeri sul
       documento, non una deduzione: "finito" deve essere una cosa che si
       conta, non l'assenza di risultati in una lettura. */
    const totLotti = Math.max(0, Number(dati.lotti) || 0);
    let cursore = Math.max(1, Number(dati.daLotto) || 1);
    if (totLotti && cursore > totLotti) {
        await concludi(db, id, 'conclusa', dati.conti || {}, 'elenco finito');
        return { finita: true };
    }
    /* Quanti lotti chiedere per volta: quelli che la quota di questo giro puo'
       toccare se sono pieni, piu' uno di margine. Trenta fissi volevano dire
       scaricare fino a trenta documenti da centinaia di kilobyte per usarne
       uno.

       "Se sono pieni" e' il punto: un lotto puo' contenerne anche uno solo -
       l'ultimo di un elenco, o uno caricato a pezzetti - e allora questa stima
       e' troppo bassa. Percio' non e' una stima definitiva: quando i lotti
       letti finiscono e la quota c'e' ancora, se ne rileggono altri (il ciclo
       piu' sotto). Cosi' il caso normale costa due letture e quello storto non
       si blocca a meta'. */
    const quantiLotti = Math.min(30, Math.ceil(voluti / P.PER_LOTTO) + 1);
    if (!(await lottiDaFare(db, id, 1, cursore)).length) {
        await concludi(db, id, 'conclusa', dati.conti || {}, 'elenco finito');
        return { finita: true };
    }

    let conti = Object.assign({}, CONTI_ZERO, dati.conti || {});
    let restaQuota = voluti;
    let bloccato = '';
    let fermato = '';

    /* Si legge un gruppo di lotti, li si lavora, e se la quota non e' finita
       se ne rilegge un altro dal punto in cui si e' arrivati. Si smette
       quando il cursore non si muove piu': rileggere gli stessi documenti non
       produrrebbe niente di nuovo, e senza questa condizione il ciclo
       girerebbe a vuoto. */
    let altriLotti = true;
    while (altriLotti && restaQuota > 0 && !bloccato && !fermato && Date.now() <= scadenza) {
    const cursorePrima = cursore;
    const lotti = await lottiDaFare(db, id, quantiLotti, cursore);
    if (!lotti.length) break;
    for (const doc of lotti) {
        if (restaQuota <= 0) break;
        if (Date.now() > scadenza) { fermato = 'tempo del giro esaurito'; break; }

        /* Qualcuno ha chiesto di fermare mentre eravamo in mezzo: si
           smette qui. Si rilegge il documento invece di fidarsi di quello
           di partenza, perche' fra un lotto e l'altro possono passare
           minuti. */
        const fresco = await P.rif(db, id).get();
        const df = fresco.exists ? (fresco.data() || {}) : {};
        if (df.annullaRichiesto === true) { fermato = 'annullata mentre era in corso'; break; }
        if (!P.daLavorare(df.stato)) { fermato = 'non piu attiva'; break; }

        const dl = doc.data() || {};
        const nLotto = Number(dl.n) || 0;
        // gia' passato in un giro precedente: si sposta solo il segnalibro
        /* Il cursore avanza solo di un passo alla volta, dalla testa. Con
           ">=" un lotto piu' avanti gia' fatto lo avrebbe spinto OLTRE un lotto
           precedente rimasto aperto, e quello non sarebbe stato riletto mai
           piu'. */
        if (dl.stato === 'fatto') {
            if (nLotto === cursore) cursore = nLotto + 1;
            continue;
        }
        const ids = (dl.ids || []).slice(0);
        if (!ids.length) {
            await doc.ref.set({ stato: 'fatto' }, { merge: true });
            if (nLotto === cursore) cursore = nLotto + 1;
            continue;
        }

        /* IL SEGNALIBRO DENTRO IL LOTTO, e perche' non se ne puo' fare a meno.
           Un lotto tiene fino a cinquecento identificativi, il ritmo ne
           concede molti meno per giro: quindi un lotto si attraversa in piu'
           giri. Senza segnalibro ogni giro ripartirebbe dalla testa, e la
           testa e' fatta di aziende gia' servite: il motore le salterebbe
           una per una, la quota resterebbe intatta (giustamente: le saltate
           non consumano ritmo) e l'invio non avanzerebbe di un millimetro.
           E' esattamente il difetto che questo segnalibro ripara.

           Attenzione a cosa NON e': non e' la difesa contro i doppioni -
           quella resta l'esito scritto sulla scheda. Percio' un segnalibro
           rimasto indietro dopo un'interruzione costa qualche lettura in
           piu', non un messaggio in piu'. */
        let fatti = Math.min(Number(dl.fatti) || 0, ids.length);

        while (fatti < ids.length && restaQuota > 0) {
            if (Date.now() > scadenza) { fermato = 'tempo del giro esaurito'; break; }

            /* Si prenota la quota PRIMA, e si prende solo la fetta di
               identificativi che ci sta dentro: cosi' non si comincia un
               messaggio che il ritmo non consentiva. */
            const fetta = ids.slice(fatti, fatti + restaQuota);
            const p = await prenota(db, id, fetta.length);
            if (p.concessi <= 0) { fermato = 'ritmo esaurito'; break; }
            const daFare = fetta.slice(0, p.concessi);

            let r;
            try {
                r = await MOTORE.inviaSchede(db, {
                    evento: dati.evento, campagna: dati.campagna, canale: canale,
                    ids: daFare,
                    mail: (dati.mail || {}),
                    /* La chiave della CORSA, non quella dell'elenco: e' cosi'
                       che un sollecito programmato riconosce il proprio timbro
                       invece di trovare quello della campagna precedente e
                       saltare tutte le aziende. Le programmazioni scritte prima
                       che questa chiave esistesse non ce l'hanno: li' si ricade
                       sull'identificativo, che e' quello che facevano gia'. */
                    forza: dati.forza === true, prog: dati.corsa ? (id + '#' + dati.corsa) : id,
                    email: (dati.creato && dati.creato.da) || '',
                    collab: (dati.creato && dati.creato.collab) || '',
                    pagina: dati.pagina || '',
                    rispondiA: (dati.creato && dati.creato.da) || '',
                    /* La scadenza della fetta e' quella del giro, non un
                       numero suo: con due minuti fissi, un server di posta
                       lento faceva uscire il ciclo al primo finite:false e la
                       meta' del budget restava inutilizzata - il ritmo reale
                       scendeva sotto quello promesso senza che si vedesse. */
                    scadenza: scadenza,
                    fuori: fuori, esiti: false
                });
            } catch (e) {
                /* Il motore non dovrebbe uscire per eccezione, ma se succede la
                   quota prenotata non deve restare bruciata: senza questa rete
                   la finestra risulterebbe consumata da messaggi mai partiti, e
                   l'ora chiuderebbe molto sotto quanto promesso. */
                await restituisci(db, id, p.concessi, p.inizio);
                fermato = String((e && e.message) || e).slice(0, 200);
                break;
            }

            /* Quello che non e' stato speso torna nella finestra: le schede
               saltate, quelle senza recapito e quelle mai raggiunte perche' il
               tempo e' finito non devono consumare il ritmo. Contarle
               vorrebbe dire che un elenco con molte escluse spedisce ogni ora
               molto meno di quanto e' stato chiesto, senza che si capisca
               perche'. */
            await restituisci(db, id, p.concessi - r.trattate, p.inizio);
            restaQuota -= r.trattate;
            conti = sommaConti(conti, r);
            /* Il segnalibro si sposta solo fin dove le schede sono DEFINITE.
               Una rimandata - qualcuno ci sta lavorando adesso, o e' appena
               morto lasciandola a meta' - non lo e': facendola scavalcare, il
               lotto sarebbe arrivato a "fatto" e quell'azienda non sarebbe
               stata guardata mai piu', contata fra le saltate insieme alle
               escluse. Con avanzabili il segnalibro si ferma su di lei e la
               ritrova al giro dopo, quando il timbro sara' abbastanza vecchio
               da mandarla in "Con errore", sotto gli occhi di una persona. */
            const passo = Math.max(0, Math.min(Number(r.avanzabili), Number(r.viste) || 0));
            fatti = Math.min(ids.length, fatti + passo);

            // si scrive DOPO OGNI FETTA: un timeout non deve far perdere il conto
            await doc.ref.set({
                fatti: fatti, quando: Date.now(),
                stato: fatti >= ids.length ? 'fatto' : 'attesa'
            }, { merge: true });
            await P.rif(db, id).set({ conti: conti, ultimoGiro: Date.now() }, { merge: true });

            if (r.bloccato) { bloccato = r.bloccato; break; }
            if (r.errore) { fermato = r.errore; break; }
            /* Il segnalibro non si e' mosso: o non si e' guardato niente, o la
               prima scheda della fetta e' rimandata. In tutti e due i casi
               insistere qui vorrebbe dire girare a vuoto per sempre sulla
               stessa fetta - si passa al lotto seguente e si torna al giro
               dopo, quando il timbro sara' scaduto. */
            if (!passo) { fermato = r.rimandate ? 'in attesa di un esito' : 'nessuna scheda trattata'; break; }
            if (!r.finite) { fermato = 'tempo del giro esaurito'; break; }
        }
        /* Il segnalibro avanza SOLO su un lotto percorso fino in fondo. Su
           uno lasciato a meta' (quota finita, tempo finito, blocco) resta
           dov'e', e il giro dopo riprende da qui. */
        if (fatti >= ids.length && nLotto === cursore) cursore = nLotto + 1;
        if (bloccato || fermato) break;
    }
    altriLotti = cursore > cursorePrima;
    }

    /* Il gestore ha rifiutato NOI, non un destinatario: continuare
       domani con gli stessi lotti li farebbe rifiutare allo stesso modo.
       Si mette in pausa e si scrive il motivo, cosi' chi guarda sa che
       c'e' da fare qualcosa e non che l'invio e' lento. */
    if (bloccato) {
        await P.rif(db, id).set({
            stato: 'sospesa', lucchetto: null,
            sospesa: { il: Date.now(), da: 'servizio' },
            conti: conti,
            ultimoErrore: 'Il server di posta ha bloccato l\'invio: "' + String(bloccato).slice(0, 200)
                + '". L\'invio programmato e in pausa: quando il blocco e passato, riprendilo da qui.'
        }, { merge: true });
        return { bloccato: bloccato, conti: conti };
    }

    // richiesta di annullamento arrivata mentre spedivamo
    const dopo = (await P.rif(db, id).get()).data() || {};
    if (dopo.annullaRichiesto === true) {
        await concludi(db, id, 'annullata', conti, 'annullata mentre era in corso');
        return { annullata: true, conti: conti };
    }

    // e' rimasto qualcosa? Lo dice il conto dei lotti, non una lettura vuota
    const finiti = totLotti ? (cursore > totLotti) : !(await lottiDaFare(db, id, 1, cursore))
        .filter(d => (d.data() || {}).stato !== 'fatto').length;
    if (finiti) {
        await concludi(db, id, 'conclusa', conti, 'elenco finito');
        return { finita: true, conti: conti };
    }

    await P.rif(db, id).set({
        conti: conti, daLotto: cursore, lucchetto: null, ultimoGiro: Date.now(),
        ultimoErrore: fermato === 'tempo del giro esaurito' ? '' : String(fermato || '').slice(0, 300)
    }, { merge: true });
    return { conti: conti, interrotto: fermato };
}

/* Un giro completo. NON e' un endpoint: lo chiama api/invii-programmati.js
   quando riceve il segreto del lavoro programmato. Sta in lib/ come gli
   altri giri del servizio, cosi' domani lo si puo' far entrare anche da
   un altro indirizzo senza spostare il codice. */
async function eseguiGiro(db) {
    const partito = Date.now();
    const giro = 'inv-' + partito.toString(36);
    try {
        await P.battito(db, { inizio: partito, giro: giro, esito: 'in corso' });
        const scadenza = partito + BUDGET_MS;

        /* SI CERCA PER "ATTIVA", NON PER DATA, e la differenza e' fra
           funzionare e smettere in silenzio. La query di prima era
           where('quando','<=',adesso).limit(50): su Firestore una
           disuguaglianza impone l'ordinamento crescente su quel campo, quindi
           tornavano le cinquanta programmazioni piu' VECCHIE. Le concluse e le
           annullate non si cancellano - i conti servono a chi legge dopo - e
           conservano il loro "quando" nel passato: dopo una cinquantina di
           programmazioni nella vita del sito, quella pagina sarebbe stata
           tutta storia, una programmazione nuova non ci sarebbe piu' entrata,
           e il giro avrebbe scritto "trattate: 0" per sempre senza che niente
           lo dicesse.

           Con un contrassegno che si spegne quando la programmazione esce di
           scena, la pagina contiene solo quelle vive - che sono poche - e la
           data si guarda in memoria. Nessun indice composto da creare a mano. */
        const q = await db.collection(P.COLL).where('attiva', '==', true).limit(50).get();

        /* Le preparazioni abbandonate. Se il browser muore fra "programma" e
           "programma-avvia" nessuno cancella gli identificativi, e quelli
           contengono i recapiti delle aziende: senza questa spazzata
           resterebbero in archivio per sempre, su un evento che magari e' gia'
           passato. Si fa qui perche' il giro questa collezione la legge
           comunque. */
        for (const d of q.docs) {
            const dd = d.data() || {};
            if (dd.stato !== P.IN_PREPARAZIONE) continue;
            const nata = Number((dd.creato && dd.creato.il) || 0);
            if (!nata || (Date.now() - nata) < P.SCADE_PREPARAZIONE_MS) continue;
            try {
                await P.cancellaLotti(db, d.id);
                await P.rif(db, d.id).set({
                    stato: 'annullata', attiva: false,
                    concluso: { il: Date.now(), motivo: 'preparazione mai avviata' }
                }, { merge: true });
            } catch (e) {
                console.error('Giro inviti, preparazione abbandonata non ripulita:', d.id,
                    String((e && e.message) || e).slice(0, 160));
            }
        }
        /* CHI SERVIRE PER PRIMO, quando ce n'e' piu' di quante ne stiano in un
           giro. Non le prime tre che capitano: Firestore le ordina per
           'quando', che non cambia mai, quindi con quattro programmazioni
           attive le stesse tre sarebbero servite per sempre e la quarta non
           partirebbe mai - e nessuno saprebbe perche'.

           Due criteri, in quest'ordine:
             - prima chi puo' davvero spedire adesso. Una con la finestra
               piena occuperebbe uno dei tre posti per poi non fare niente;
             - poi chi e' stato servito meno di recente. E' il giro di
               rotazione: nessuna resta indietro, anche se sono cinque. */
        const dovute = q.docs
            .filter(d => P.daLavorare((d.data() || {}).stato))
            .filter(d => Number((d.data() || {}).quando || 0) <= Date.now())
            .map(d => ({ doc: d, puo: P.quantiOra(d.data() || {}) > 0, ultimo: Number((d.data() || {}).ultimoGiro) || 0 }))
            .sort((x, y) => (y.puo - x.puo) || (x.ultimo - y.ultimo))
            .slice(0, MAX_PROGRAMMAZIONI)
            .map(x => x.doc);

        /* I DISISCRITTI SI LEGGONO UNA VOLTA PER GIRO, non una per
           programmazione. E' un .get() sull'intera collezione: con tremila
           disiscritti e tre programmazioni attive erano novemila letture ogni
           dieci minuti, cioe' molte piu' letture dell'invio vero. E' lo stesso
           elenco che usa la newsletter e non cambia in due minuti. */
        let fuori = {};
        if (dovute.length) {
            try { fuori = await NL.disiscritti(db); }
            catch (_) { fuori = {}; }
        }

        const fatte = [];
        for (const doc of dovute) {
            if (Date.now() > scadenza) break;
            const id = doc.id;
            const dati = await prendiLucchetto(db, id, giro);
            if (!dati) { fatte.push({ id: id, saltata: 'gia in lavorazione o non piu attiva' }); continue; }
            try {
                const r = await lavora(db, id, dati, Math.min(scadenza, Date.now() + BUDGET_UNA_MS), fuori);
                fatte.push(Object.assign({ id: id }, {
                    finita: !!r.finita, attesa: r.attesa || '', bloccato: r.bloccato || '',
                    interrotto: r.interrotto || '', inviate: (r.conti && r.conti.inviate) || 0
                }));
            } catch (e) {
                const motivo = String((e && e.message) || e).slice(0, 200);
                console.error('Giro inviti, programmazione', id, 'non riuscita:', motivo);
                try { await P.rif(db, id).set({ lucchetto: null, ultimoErrore: motivo }, { merge: true }); }
                catch (_) { /* il lucchetto scade da se' */ }
                fatte.push({ id: id, errore: motivo });
            }
        }

        await P.battito(db, {
            fine: Date.now(), giro: giro, esito: 'ok',
            durataMs: Date.now() - partito, trattate: fatte.length, dettaglio: fatte.slice(0, 10)
        });
        return { ok: true, trattate: fatte.length, dettaglio: fatte };
    } catch (e) {
        const motivo = String((e && e.message) || 'errore').slice(0, 300);
        console.error('Giro inviti programmati non riuscito:', motivo);
        try { await P.battito(db, { fine: Date.now(), giro: giro, esito: 'errore', errore: motivo }); } catch (_) { }
        return { ok: false, stato: 500, msg: motivo };
    }
}

module.exports = { eseguiGiro, BUDGET_MS, LUCCHETTO_MS, RITMI };
