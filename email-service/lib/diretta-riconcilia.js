/* ============================================================
   Diretta degli eventi: la RICONCILIAZIONE delle iscrizioni dal sito
   ------------------------------------------------------------
   Nessuna iscrizione online deve restare senza password perche' il
   servizio non ha risposto. Chi si iscrive "online" dal modulo del sito
   passa da api/iscrizione-nuova.js, che salva la scheda nel progetto
   dello studio e POI chiama la diretta (lib/diretta-iscrizione.js,
   dalModulo). Se la diretta in quel momento non risponde (il suo
   Firestore irraggiungibile, un errore, la funzione fermata a meta'), la
   scheda c'e' ma l'account no. Il modulo di Napoli ripete da solo la
   chiamata al servizio (tre tentativi in tutto), ma una pagina chiusa
   subito dopo la conferma non ripete niente: qui c'e' la rete di
   sicurezza che non dipende dal browser.

   OGNI 5 MINUTI (giroCron in lib/diretta-invio.js, PRIMA delle code:
   cosi' le password che nascono qui partono nello stesso giro), per ogni
   evento della diretta con l'interruttore iscrizioniAutomatiche acceso,
   non terminato e non ancora finito:
     1. si leggono dal progetto dello STUDIO, in sola lettura
        (lib/sito-iscrizioni.js: la chiave del sito, un'app firebase-admin
        a parte, una query con un solo filtro di intervallo su `ricevuto`),
        le schede ricevute da quando l'interruttore e' acceso
        (eventiRiservati.iscrizioniAutomaticheDa, scritto da evento-salva
        ed evento-iscrizioni quando passa da spento ad acceso): quelle di
        prima non contano, a interruttore spento il gestore ha deciso
        altrimenti;
     2. si tengono solo quelle "online", con un'email, NON annullate, la
        cui pagina porta a questo evento con la stessa regola di dalModulo
        (paginaCorrisponde; nella scheda c'e' solo l'etichetta `pagina`,
        non il percorso: un'etichetta sbagliata su una pagina copiata
        porterebbe qui all'evento dell'etichetta) e a nessun altro evento
        acceso;
     3. per ognuna iscriviDaModulo con `riconcilia`: chi e' gia'
        nell'evento non riceve niente (e la sua voce non si tocca, anche
        se aspetta il gestore); chi non c'e' ha l'account e le credenziali
        'in coda', o l'avviso «anche»: le manda la coda dello stesso giro,
        dentro la parte del tetto giornaliero del modulo (60%);
     4. si ricorda fino a dove si e' arrivati (riconciliazioni/{idEvento}:
        cursore = il `ricevuto` dell'ultima scheda letta, con le impronte
        degli id delle schede con quello stesso istante: l'id di una scheda
        contiene l'email, e nel progetto della diretta non si copia): il
        giro dopo riparte da li', e un secondo giro non rilegge niente.
   LE CONFERME (la seconda passata, riconciliaConferme). La password parte
   al clic su «Conferma il tuo indirizzo email» (lib/conferma-email.js ->
   daConferma di lib/diretta-iscrizione.js): la prima passata qui sopra,
   come il modulo, crea l'account con la voce 'da confermare' (o, se la
   scheda e' gia' confermata con il clic, direttamente in coda). Se
   l'avviso del clic non e' arrivato alla diretta, la seconda passata lo
   ritrova: rilegge le schede CONFERMATE da quando l'interruttore e'
   acceso (S.confermateDal, intervallo su emailConfermata.quando) e per
   quelle confermate dalla persona (non d'ufficio: 'pregresso'), online,
   non annullate, di questa pagina, arrivate dopo l'accensione, chiama
   iscriviDaModulo con `confermata`: la voce 'da confermare' passa in
   coda (o l'account nasce gia' in coda) e la manda la coda dello stesso
   giro. Chi e' gia' in coda o ha gia' ricevuto: niente. Il segno e' un
   numero, i millisecondi della conferma (niente identificativi di
   schede, che contengono l'email): le conferme dello stesso millisecondo
   si leggono tutte insieme (S.confermateIl: la conferma d'ufficio ne
   segna tante nello stesso istante), poi il segno passa al millisecondo
   dopo. Rileggere una scheda gia' fatta non fa niente, e non conta nei
   limiti. Anche qui le conferme piu' recenti di
   DIRETTA_RICONCILIA_ATTESA_MS si lasciano al clic, che le sta ancora
   lavorando.
   I LIMITI sono quelli del modulo (la riconciliazione conta come il
   modulo): il 60% del tetto giornaliero (la coda) e il limite orario
   complessivo DIRETTA_MODULO_ORA (quello per rete no: la scheda del sito
   non tiene l'IP). Oltre il limite orario la riconciliazione di
   quell'evento si FERMA prima della scheda (il cursore non la passa):
   ci riprova il giro dopo, e dopo l'ora riparte. Cosi' nessuno perde la
   password, e nessuno la riceve oltre i limiti.
   IL TEMPO. Le schede ricevute da meno di DIRETTA_RICONCILIA_ATTESA_MS
   (2 minuti) si lasciano al modulo, che le sta ancora lavorando (su
   Vercel finisce dopo la risposta, con waitUntil): ci si ferma li' e si
   riprende al giro dopo. E un budget: al massimo un minuto per giro (o
   quello che resta del giro del cron), poi il cursore si salva e si
   continua al giro dopo.
   SE IL SITO NON C'E'. Senza FIREBASE_SERVICE_ACCOUNT la riconciliazione
   salta (lo dice il log una volta); se la lettura fallisce, salta
   quell'evento per questo giro (log senza dati personali). La diretta
   continua come prima: il resto del cron gira lo stesso.
   Nei log solo l'evento e i numeri: niente email, niente nomi.
   ============================================================ */
'use strict';
const C = require('./diretta-comune');
const D = require('./diretta-dati');
const I = require('./diretta-iscrizione');
const S = require('./sito-iscrizioni');

const LOTTO = 100;
const BUDGET_MAX_MS = 60 * 1000;
const MAX_ID_CURSORE = 50;

function attesaMs() { return C.intero('DIRETTA_RICONCILIA_ATTESA_MS', 2 * 60 * 1000); }

// due Timestamp di Firestore: -1, 0, 1 (al microsecondo, non al millisecondo)
function confronta(a, b) {
    if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
    if (a.nanoseconds !== b.nanoseconds) return a.nanoseconds < b.nanoseconds ? -1 : 1;
    return 0;
}
/* L'identificativo di una scheda del sito contiene l'email di chi si e'
   iscritto: nel cursore (progetto della diretta) se ne tiene solo
   l'impronta. */
function impronta(id) {
    return C.impronta('scheda|' + id);
}
function eTimestamp(v) {
    return !!(v && typeof v.toMillis === 'function' && typeof v.seconds === 'number');
}

/* Gli eventi con l'interruttore acceso, non terminati e non finiti, con
   una pagina: sono quelli fra cui dalModulo sceglie. -> [{ id, dati, riservati }] */
async function eventiAccesi(ctx) {
    const accesi = await ctx.db.collection('eventiRiservati').where('iscrizioniAutomatiche', '==', true).get();
    if (accesi.empty) return [];
    const pubblici = await ctx.db.getAll(...accesi.docs.map(d => ctx.db.collection('eventi').doc(d.id)));
    const ora = ctx.adesso();
    const out = [];
    pubblici.forEach((s, i) => {
        if (!s.exists) return;
        const d = s.data();
        const fine = D.ms(d.fine);
        if (d.stato === 'terminato' || (fine != null && fine < ora) || !D.percorsoPagina(d.paginaEvento)) return;
        out.push({ id: s.id, dati: d, riservati: accesi.docs[i].data() });
    });
    return out;
}

/* Una scheda del sito: e' di questo evento? -> '' (si') o il motivo per
   cui si lascia stare */
function perche(scheda, evento, accesi) {
    if (scheda.modalita !== 'online') return 'modalita';
    if (!scheda.email) return 'senza-email';
    if (scheda.annullata) return 'annullata';
    // la regola di dalModulo: un evento solo fra quelli accesi, ed e' questo
    const suoi = accesi.filter(e => I.paginaCorrisponde(scheda.pagina, e.dati.paginaEvento));
    if (suoi.length !== 1 || suoi[0].id !== evento.id) return 'altra-pagina';
    return '';
}

/* Un evento. -> { idEvento, lette, iscritte, gia, daVerificare, ignorate,
   limite, finito, conferme: { lette, inCoda, gia, ignorate } } */
async function riconciliaEvento(ctx, evento, accesi, scadenza) {
    const r = { idEvento: evento.id, lette: 0, iscritte: 0, gia: 0, daVerificare: 0, ignorate: 0, limite: '', finito: false,
        conferme: { lette: 0, inCoda: 0, gia: 0, ignorate: 0 } };
    const rif = ctx.db.collection('riconciliazioni').doc(evento.id);
    const snap = await rif.get();
    const st = snap.exists ? snap.data() : {};
    /* Da quando: il momento dell'accensione. Un evento acceso prima che lo
       si salvasse (niente iscrizioniAutomaticheDa) parte dal primo giro
       della riconciliazione, e quel momento si tiene qui. */
    let da = eTimestamp(evento.riservati.iscrizioniAutomaticheDa) ? evento.riservati.iscrizioniAutomaticheDa : null;
    if (!da) da = eTimestamp(st.da) ? st.da : ctx.Timestamp.fromMillis(ctx.adesso());
    // il cursore vale solo per la stessa accensione (spento e riacceso: si riparte dal nuovo momento)
    let cursore = null, ids = [];
    if (eTimestamp(st.da) && confronta(st.da, da) === 0 && eTimestamp(st.cursore) && confronta(st.cursore, da) >= 0) {
        cursore = st.cursore;
        ids = Array.isArray(st.idsCursore) ? st.idsCursore.slice(-MAX_ID_CURSORE) : [];
    }
    const recente = ctx.adesso() - attesaMs();
    let fermo = false;
    try {
        while (!fermo) {
            if (Date.now() >= scadenza) break;
            // le schede con lo stesso istante del cursore gia' lette tornano nella query (>=): se ne chiedono tante in piu'
            const quante = LOTTO + ids.length;
            const schede = await S.schedeDal(cursore || da, quante);
            let nuove = 0;
            for (const sc of schede) {
                if (!eTimestamp(sc.ricevuto)) continue;
                const chiave = impronta(sc.id);
                if (cursore && confronta(sc.ricevuto, cursore) === 0 && ids.indexOf(chiave) >= 0) continue;
                // troppo recente: la sta ancora lavorando il modulo, si riprende al giro dopo
                if (sc.ricevuto.toMillis() > recente || Date.now() >= scadenza) { fermo = true; break; }
                nuove++;
                const motivo = perche(sc, evento, accesi);
                if (motivo) {
                    r.ignorate++;
                } else {
                    // gia' confermata con il clic: l'account nasce in coda; altrimenti 'da confermare'
                    const x = await I.iscriviDaModulo(ctx, { email: sc.email, nome: sc.nome, cognome: sc.cognome, azienda: sc.azienda, pagina: sc.pagina },
                        { evento: evento, riconcilia: true, confermata: sc.confermata === true });
                    if (x.esito === 'limite') {
                        // oltre il limite orario: ci si ferma PRIMA di questa scheda (il cursore non la passa)
                        r.limite = x.trattenuta || 'totale';
                        fermo = true;
                        break;
                    }
                    if (x.esito === 'creato' || x.esito === 'aggiunto') r.iscritte++;
                    else if (x.esito === 'gia-iscritto') r.gia++;
                    else if (x.daVerificare) r.daVerificare++;
                    else r.ignorate++;
                }
                r.lette++;
                // il cursore passa questa scheda
                if (cursore && confronta(sc.ricevuto, cursore) === 0) ids.push(chiave);
                else { cursore = sc.ricevuto; ids = [chiave]; }
                if (ids.length > MAX_ID_CURSORE) ids = ids.slice(-MAX_ID_CURSORE);
            }
            if (fermo) break;
            // finite le schede (o una pagina tutta gia' vista: niente di nuovo da leggere)
            if (schede.length < quante || !nuove) { r.finito = true; break; }
        }
    } finally {
        await rif.set({
            da: da, cursore: cursore, idsCursore: ids, aggiornato: ctx.adesso(),
            ultimoGiro: { quando: ctx.adesso(), lette: r.lette, iscritte: r.iscritte, gia: r.gia, daVerificare: r.daVerificare, ignorate: r.ignorate, limite: r.limite }
        }, { merge: true });
    }
    // la seconda passata: i clic il cui avviso non e' arrivato (se il limite non ha gia' fermato la prima)
    if (!r.limite) {
        const finiteRicevute = r.finito;
        r.finito = false;
        const daMs = da.toMillis();
        let segno = daMs;
        if (st.daConferme === daMs && Number.isFinite(Number(st.segnoConferme)) && Number(st.segnoConferme) >= daMs) segno = Number(st.segnoConferme);
        try {
            const fatto = await riconciliaConferme(ctx, evento, accesi, r, segno, daMs, scadenza);
            segno = fatto.segno;
            r.finito = finiteRicevute && fatto.finito;
        } finally {
            await rif.set({
                daConferme: daMs, segnoConferme: segno,
                ultimoGiroConferme: { quando: ctx.adesso(), lette: r.conferme.lette, inCoda: r.conferme.inCoda, gia: r.conferme.gia, ignorate: r.conferme.ignorate, limite: r.limite }
            }, { merge: true });
        }
    }
    return r;
}

/* La seconda passata (vedi LE CONFERME). `segno`: il primo millisecondo
   di conferma ancora da leggere. -> { segno, finito } */
async function riconciliaConferme(ctx, evento, accesi, r, segno, daMs, scadenza) {
    const recente = ctx.adesso() - attesaMs();
    for (;;) {
        if (Date.now() >= scadenza) return { segno: segno, finito: false };
        const pagina = await S.confermateDal(segno, LOTTO);
        if (!pagina.length) return { segno: segno, finito: true };
        const piena = pagina.length >= LOTTO;
        const valori = [];
        pagina.forEach(sc => { if (sc.quandoConferma != null && valori.indexOf(sc.quandoConferma) < 0) valori.push(sc.quandoConferma); });
        for (const v of valori) {
            // troppo recente: la sta ancora lavorando il clic, si riprende al giro dopo
            if (v > recente) return { segno: segno, finito: false };
            // l'ultimo millisecondo di una pagina piena puo' continuare nella pagina dopo: lo si legge tutto
            const gruppo = piena && v === valori[valori.length - 1] ? await S.confermateIl(v) : pagina.filter(sc => sc.quandoConferma === v);
            for (const sc of gruppo) {
                // a meta' gruppo il segno non si sposta: il gruppo si rilegge (senza effetti) al giro dopo
                if (Date.now() >= scadenza) return { segno: segno, finito: false };
                r.conferme.lette++;
                const arrivata = sc.ricevuto && typeof sc.ricevuto.toMillis === 'function' ? sc.ricevuto.toMillis() : null;
                // solo il clic della persona, e solo le schede arrivate dopo l'accensione (le altre le carica il gestore)
                const motivo = !sc.confermata ? 'd-ufficio' : (arrivata == null || arrivata < daMs ? 'prima-accensione' : perche(sc, evento, accesi));
                if (motivo) { r.conferme.ignorate++; continue; }
                const x = await I.iscriviDaModulo(ctx, { email: sc.email, nome: sc.nome, cognome: sc.cognome, azienda: sc.azienda, pagina: sc.pagina, ricevutoMs: arrivata },
                    { evento: evento, riconcilia: true, confermata: true });
                if (x.esito === 'limite') {
                    // oltre il limite orario: ci si ferma a questo millisecondo, che si rilegge al giro dopo
                    r.limite = x.trattenuta || 'totale';
                    return { segno: segno, finito: false };
                }
                // chi aspettava il clic passa in coda (anche se era gia' nell'evento): prima di tutto
                if (x.invio && x.invio.stato === 'in coda') r.conferme.inCoda++;
                else if (x.esito === 'gia-iscritto') r.conferme.gia++;
                else r.conferme.ignorate++;
            }
            segno = v + 1;
        }
        if (!piena) return { segno: segno, finito: true };
    }
}

/* ============================================================
   riconcilia(ctx, { budgetMs }) -> { eventi: [ ...riconciliaEvento ],
   saltata: '' | 'sito-non-configurato' }
   Non lancia per un evento: il suo errore finisce nel log (e in
   eventi[].errore) e si passa al successivo.
   ============================================================ */
let avvisoSito = false;
async function riconcilia(ctx, opz) {
    const scadenza = Date.now() + Math.max(1000, Math.min(BUDGET_MAX_MS, Number(opz && opz.budgetMs) || BUDGET_MAX_MS));
    const out = { eventi: [], saltata: '' };
    if (!S.configurato()) {
        if (!avvisoSito) {
            avvisoSito = true;
            // (il nome della variabile non si scrive qui: i file della diretta non la nominano, vedi separazione.prova.js)
            console.log('[diretta] riconciliazione: manca la chiave del progetto del sito: le schede del modulo non si rileggono');
        }
        out.saltata = 'sito-non-configurato';
        return out;
    }
    const accesi = await eventiAccesi(ctx);
    for (const ev of accesi) {
        if (Date.now() >= scadenza) break;
        let r;
        try {
            r = await riconciliaEvento(ctx, ev, accesi, scadenza);
        } catch (e) {
            console.error('[diretta] riconciliazione di ' + ev.id + ' non riuscita (si riprova al giro dopo): ' + D.perLog(e));
            r = { idEvento: ev.id, errore: true };
        }
        if (r.lette || r.limite || r.errore || (r.conferme && r.conferme.lette)) {
            // solo l'evento e i numeri
            console.log('[diretta] riconciliazione: ' + JSON.stringify(r));
            if (r.limite) console.log('[diretta] riconciliazione: limite orario delle password automatiche raggiunto, si riprende al giro dopo (' + ev.id + ')');
        }
        out.eventi.push(r);
    }
    return out;
}

module.exports = { riconcilia, _interni: { confronta, perche, eventiAccesi } };
