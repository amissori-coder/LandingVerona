/* ============================================================
   Diretta degli eventi: tornare alla fase iniziale dopo una prova
   ------------------------------------------------------------
   Nella regia «Riporta in attesa» cambia solo lo stato: i minuti visti
   (che vanno negli attestati), gli accessi, il grafico degli ascolti
   restano quelli della prova. «Torna alla fase iniziale» riporta
   l'evento com'era prima del primo «Vai in onda»:
     - stato 'programmato' (la pagina dei partecipanti torna da sola
       all'attesa con il conto alla rovescia), niente avviso a tutti,
       niente ora di ripresa, il link principale, il video fuori dal
       documento pubblico (come a ogni ritorno in attesa: campiVideo);
     - via i documenti di presenza dell'evento (minuti e collegamenti),
       il grafico e la cache degli ascolti e, se il gestore non toglie la
       spunta, l'elenco degli accessi.
   NON tocca partecipanti, account, password, credenziali e stato delle
   email, promemoria, dati dell'evento (titolo, orari, programma, player),
   interruttore delle iscrizioni dal modulo.

   SOLO PRIMA DELL'ORARIO DI INIZIO. Dopo, i dati sono quelli veri della
   giornata (gli attestati): il servizio rifiuta (409 'iniziato') e resta
   solo «Riporta in attesa», che non cancella niente. Lo controlla il
   servizio con il suo orologio, non la pagina.

   Le pagine gia' aperte non si rompono: il segnale di presenza che trova
   il suo documento cancellato riceve un rifiuto, e al giro dopo lo ricrea
   da zero come "nuovo collegamento" (diretta.js, nuovoCollegamento). La
   fotografia degli ascolti del minuto dopo ricomincia un documento nuovo.

   Ogni azzeramento resta annotato in azzeramenti/{auto} (chi, quando,
   quanti documenti tolti): collezione chiusa ai browser come tutto quello
   che le regole non aprono.
   ============================================================ */
'use strict';
const C = require('./diretta-comune');
const D = require('./diretta-dati');

// la parola da scrivere per confermare (la pagina la mostra, il servizio la esige)
const PAROLA = 'AZZERA';
// documenti cancellati per ogni scrittura in blocco (Firestore: al massimo 500)
const LOTTO = 400;

/* Che cosa c'e' da togliere. Una prova si riconosce dai MINUTI VISTI (che
   crescono solo in onda) e dal grafico degli ascolti con minuti in onda o in
   pausa: un documento di presenza con zero minuti e' solo qualcuno che
   aspetta con la pagina aperta (vicino all'orario la pagina manda il segnale
   anche in attesa), e un grafico con la sola attesa non dice niente.
   -> { presenze (documenti), conMinuti (persone con minuti visti), accessi,
   ascolti (c'e' il grafico), inOnda (il grafico ha minuti in onda o in
   pausa) }. Si legge solo prima dell'inizio (vedi situazione): le presenze
   sono quelle della prova, poche. */
async function conteggi(ctx, id) {
    const [presenze, accessi, ascolti] = await Promise.all([
        ctx.db.collection('presenze').where('idEvento', '==', id).select('secondi').get(),
        ctx.db.collection('accessi').where('idEvento', '==', id).count().get(),
        ctx.db.collection('ascolti').doc(id).get()
    ]);
    let inOnda = false;
    if (ascolti.exists) {
        try { inOnda = JSON.parse(ascolti.get('curva') || '[]').some(p => p && (p[2] === 'o' || p[2] === 'p')); } catch (_) { inOnda = true; }
    }
    return {
        presenze: presenze.size,
        conMinuti: presenze.docs.filter(d => Number(d.get('secondi')) > 0).length,
        accessi: accessi.data().count,
        ascolti: ascolti.exists,
        inOnda: inOnda
    };
}

/* Quello che la regia mostra prima di chiedere conferma (e nella riga
   dello stato): si puo' ancora azzerare? che cosa c'e' da togliere?
   -> { idEvento, stato, inizio, possibile, conteggi, parola }. Dopo
   l'orario di inizio niente conteggi (null): non si puo' azzerare, e le
   presenze vere della giornata non si rileggono per niente. */
async function situazione(ctx, idEvento) {
    const id = D.controllaIdEvento(idEvento);
    const ev = await D.leggiEvento(ctx, id);
    const inizio = D.ms(ev.dati.inizio);
    const possibile = inizio != null && ctx.adesso() < inizio;
    return {
        idEvento: id,
        stato: ev.dati.stato || 'programmato',
        inizio: inizio,
        possibile: possibile,
        conteggi: possibile ? await conteggi(ctx, id) : null,
        parola: PAROLA
    };
}

/* Cancella tutti i documenti di una query, a blocchi. Si rilegge dall'inizio
   a ogni blocco (i cancellati non tornano); ci si ferma al primo blocco non
   pieno, cosi' anche se nel frattempo una pagina aperta ricrea il suo
   documento di presenza il giro finisce. -> quanti ne ha tolti */
async function cancellaTutti(ctx, query) {
    let tolti = 0;
    for (;;) {
        const snap = await query.limit(LOTTO).get();
        if (snap.empty) break;
        const b = ctx.db.batch();
        snap.docs.forEach(d => b.delete(d.ref));
        await b.commit();
        tolti += snap.size;
        if (snap.size < LOTTO) break;
    }
    return tolti;
}

function oraItaliana(t) {
    try {
        return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
    } catch (_) { return new Date(t).toISOString(); }
}

/* L'azzeramento. { idEvento, conferma (la parola), accessi (false = tieni
   l'elenco degli accessi; di base si toglie) }, chi = l'email del gestore
   (per il registro). -> { evento, tolti: { presenze, accessi, ascolti } }.
   Prima lo stato (le pagine aperte tornano subito all'attesa), poi i dati. */
async function azzera(ctx, { idEvento, conferma, accessi }, chi) {
    const id = D.controllaIdEvento(idEvento);
    if (String(conferma == null ? '' : conferma).trim().toUpperCase() !== PAROLA) {
        throw C.errore(400, 'Per confermare scrivi ' + PAROLA + '.', 'conferma');
    }
    const togliAccessi = accessi !== false;
    const rif = ctx.db.collection('eventi').doc(id);
    const rifRis = ctx.db.collection('eventiRiservati').doc(id);
    let statoPrima = 'programmato';
    const ts = D.adessoTs(ctx);
    await D.transazione(ctx, async tx => {
        const [snap, snapRis] = await tx.getAll(rif, rifRis);
        if (!snap.exists) throw C.errore(404, 'Evento inesistente.', 'evento');
        const v = snap.data();
        const inizio = D.ms(v.inizio);
        if (inizio == null || ctx.adesso() >= inizio) {
            throw C.errore(409, 'L\'evento è già cominciato' + (inizio != null ? ' (' + oraItaliana(inizio) + ')' : '')
                + ': i dati sono quelli veri e non si cancellano. Puoi solo riportarlo in attesa.', 'iniziato');
        }
        statoPrima = v.stato || 'programmato';
        const video = D.campiVideo(v, snapRis.exists ? snapRis.data() : {}, 'programmato');
        const agg = Object.assign({ stato: 'programmato', statoAggiornato: ts, avviso: '', ripresa: '', aggiornato: ts }, video);
        if (v.sorgente === 'riserva') agg.sorgente = 'principale';
        if (Object.keys(video).length || agg.sorgente) agg.videoAggiornato = ts;
        tx.update(rif, agg);
    });

    const presenze = await cancellaTutti(ctx, ctx.db.collection('presenze').where('idEvento', '==', id));
    const accessiTolti = togliAccessi ? await cancellaTutti(ctx, ctx.db.collection('accessi').where('idEvento', '==', id)) : 0;
    const rifAscolti = ctx.db.collection('ascolti').doc(id);
    const ascolti = (await rifAscolti.get()).exists;
    await Promise.all([rifAscolti.delete(), ctx.db.collection('ascoltiCache').doc(id).delete()]);

    await ctx.db.collection('azzeramenti').add({
        idEvento: id, chi: String(chi || ''), quando: ts, statoPrima: statoPrima,
        presenze: presenze, accessi: accessiTolti, accessiTenuti: !togliAccessi, ascolti: ascolti
    });
    // solo numeri nei log
    console.log('[diretta-azzera] ' + JSON.stringify({ idEvento: id, statoPrima: statoPrima, presenze: presenze, accessi: accessiTolti, ascolti: ascolti }));
    return { evento: (await D.leggiEvento(ctx, id)).json, tolti: { presenze: presenze, accessi: accessiTolti, ascolti: ascolti } };
}

module.exports = { situazione, azzera, conteggi, PAROLA, LOTTO };
