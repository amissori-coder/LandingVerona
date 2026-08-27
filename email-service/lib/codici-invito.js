/* ============================================================
   Codici di invito
   ------------------------------------------------------------
   Cinque caratteri che dicono "questa azienda l'abbiamo scelta noi".
   Partono dentro la PEC di invito, tornano indietro scritti nel modulo
   di registrazione, e sono il filo che lega le due tabelle: l'elenco
   delle aziende invitate e quello degli iscritti. Senza, le due liste
   restano estranee e l'unico modo di incrociarle e' guardare i nomi a
   occhio, che con "Alfa S.r.l." e "ALFA SRL" non funziona.

   L'ALFABETO non e' casuale. E' quello di Crockford: niente I, L, O, U.
   Le prime tre perche' si confondono con 1 e 0 quando il codice viene
   letto al telefono o ricopiato da una stampa; la U perche' e' l'unica
   lettera che, insieme alle altre, permetterebbe di formare per caso
   parole sconvenienti. In lettura I e L diventano 1 e O diventa 0, cosi'
   chi trascrive male viene comunque riconosciuto invece di ricevere un
   "codice non valido" che non sa come correggere.

   32 caratteri su 5 posizioni sono 33 milioni di combinazioni: per
   qualche migliaio di inviti la probabilita' di uno scontro e'
   trascurabile, ma non si tira a indovinare - l'unicita' la garantisce
   Firestore, perche' il codice E' l'identificativo del documento e
   create() fallisce se esiste gia'.
   ============================================================ */

const crypto = require('crypto');

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LUNGHEZZA = 5;
const TENTATIVI = 10;

/* Si sorteggia con crypto e non con Math.random: non e' un segreto da
   difendere, ma un codice indovinabile vale quanto nessun codice, e la
   differenza di costo qui e' zero. */
function sorteggia() {
    const b = crypto.randomBytes(LUNGHEZZA * 2);
    let s = '';
    for (let i = 0; i < b.length && s.length < LUNGHEZZA; i++) {
        // si scartano i valori che sbilancerebbero il sorteggio
        if (b[i] < 256 - (256 % ALFABETO.length)) s += ALFABETO[b[i] % ALFABETO.length];
    }
    return s.length === LUNGHEZZA ? s : sorteggia();
}

/* Da come l'ha scritto una persona a come lo conosciamo noi.
   Spazi, trattini e minuscole vanno via; le confusioni tipiche si
   correggono invece di far fallire la verifica. */
function normalizza(v) {
    return String(v == null ? '' : v)
        .toUpperCase()
        .replace(/[^0-9A-Z]/g, '')
        .replace(/[IL]/g, '1')
        .replace(/O/g, '0')
        .slice(0, LUNGHEZZA);
}
function valido(v) {
    const c = normalizza(v);
    if (c.length !== LUNGHEZZA) return false;
    for (const ch of c) { if (ALFABETO.indexOf(ch) < 0) return false; }
    return true;
}

/* Il codice di una scheda, creandolo se non ce l'ha ancora.
   Si chiama PRIMA di spedire, non dopo: se la mail parte e la scrittura
   non riesce, l'azienda si ritrova in mano un codice che qui non
   risulta, e quando prova a registrarsi le si dice di no. L'ordine
   giusto e' quello inverso, e uno scarto in piu' nell'archivio non fa
   danno a nessuno.

   Chiamarla due volte sulla stessa scheda restituisce lo stesso codice:
   un secondo invito allo stesso indirizzo deve ripetere il codice, non
   crearne un altro, altrimenti quello ricevuto per primo smette di
   valere senza che nessuno lo sappia. */
async function assegna(db, dati) {
    const scheda = String((dati && dati.scheda) || '');
    const evento = String((dati && dati.evento) || '');
    if (!scheda || !evento) throw new Error('Codice invito: scheda o evento mancanti.');

    for (let k = 0; k < TENTATIVI; k++) {
        const codice = sorteggia();
        try {
            await db.collection('codiciInvito').doc(codice).create({
                codice: codice,
                evento: evento,
                scheda: scheda,
                ragioneSociale: String((dati && dati.ragioneSociale) || '').slice(0, 200),
                /* Il nome della pagina di iscrizione dell'evento. Il modulo
                   pubblico non conosce l'identificativo interno dell'evento,
                   conosce solo questo: senza, un codice di Verona aprirebbe
                   Napoli e il conto dei selezionati non vorrebbe dire niente. */
                pagina: String((dati && dati.pagina) || '').slice(0, 200),
                creato: Date.now(),
                usato: null
            });
            return codice;
        } catch (e) {
            // gia' preso: si risorteggia. Qualunque altro errore risale.
            const m = String((e && e.message) || '');
            if (!/already exists/i.test(m) && !(e && e.code === 6)) throw e;
        }
    }
    throw new Error('Non riesco a generare un codice invito libero.');
}

/* Verifica per il modulo pubblico. Torna il minimo indispensabile: che
   il codice esista, per quale evento, e la ragione sociale, che serve a
   far vedere a chi si registra "risulta l'invito a Alfa S.r.l." e a
   fargli capire subito se ha sbagliato codice. Niente altro: e' un
   endpoint aperto, e ogni campo in piu' sarebbe un campo che chiunque
   puo' leggere provando codici a caso. */
async function verifica(db, codiceGrezzo, evento, pagina) {
    const codice = normalizza(codiceGrezzo);
    if (!valido(codice)) return { ok: false, motivo: 'formato' };
    let snap;
    try { snap = await db.collection('codiciInvito').doc(codice).get(); }
    catch (_) { return { ok: false, motivo: 'lettura' }; }
    if (!snap.exists) return { ok: false, motivo: 'inesistente' };
    const d = snap.data() || {};
    /* Un codice di un altro evento non e' valido qui. Non e' pignoleria:
       gli eventi si susseguono e un codice di Verona che apre Napoli
       renderebbe il conteggio dei selezionati privo di senso. */
    if (evento && String(d.evento || '') !== String(evento)) return { ok: false, motivo: 'altro-evento' };
    /* Dal modulo pubblico arriva il nome lungo della pagina ("Napoli 2 Ottobre
       2026 - Manifestazione di interesse") e sul codice c'e' quello corto:
       si confronta l'inizio. Un codice senza pagina e' di prima di questa
       regola e passa, perche' rifiutare i codici gia' spediti sarebbe un
       danno peggiore del problema che si vuole evitare. */
    const suaPagina = String(d.pagina || '');
    if (pagina && suaPagina && String(pagina).indexOf(suaPagina) !== 0) {
        return { ok: false, motivo: 'altro-evento' };
    }
    return { ok: true, codice: codice, ragioneSociale: String(d.ragioneSociale || ''), scheda: String(d.scheda || ''), evento: String(d.evento || '') };
}

/* Il codice e' stato usato per iscriversi.
   NON si "consuma": resta valido. Un'azienda selezionata puo' mandare
   due persone, e rifiutare la seconda perche' il codice risulta gia'
   speso sarebbe una porta chiusa in faccia a un invitato. Si annota
   solo il primo uso, che e' l'informazione utile, e si contano gli usi.
   Se la scrittura non riesce, l'iscrizione resta valida: e' un dato di
   servizio, non una condizione. */
async function segnaUso(db, codice, chi) {
    const c = normalizza(codice);
    if (!valido(c)) return;
    const rif = db.collection('codiciInvito').doc(c);
    try {
        await db.runTransaction(async tx => {
            const s = await tx.get(rif);
            if (!s.exists) return;
            const d = s.data() || {};
            const patch = { usi: (Number(d.usi) || 0) + 1 };
            if (!d.usato) {
                patch.usato = {
                    quando: Date.now(),
                    email: String((chi && chi.email) || '').slice(0, 200),
                    iscrizione: String((chi && chi.iscrizione) || '').slice(0, 400)
                };
            }
            tx.set(rif, patch, { merge: true });
        });
    } catch (e) {
        console.error('Codice invito, uso non annotato:', String((e && e.message) || e).slice(0, 200));
    }
}

module.exports = { ALFABETO, LUNGHEZZA, sorteggia, normalizza, valido, assegna, verifica, segnaUso };
