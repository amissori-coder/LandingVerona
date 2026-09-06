/* ============================================================
   Freno alle richieste ripetute (endpoint pubblici)
   ------------------------------------------------------------
   Gli endpoint aperti del servizio (iscrizione dal sito, ebook,
   disiscrizione, decisioni di sblocco) limitano quante richieste
   accettano da uno stesso indirizzo IP in dieci minuti. Fino a oggi
   il conteggio stava in una Map in memoria: su Vercel ogni istanza
   della funzione ha la sua memoria e viene riciclata di continuo,
   quindi la Map fermava solo chi ricapitava sulla stessa istanza e
   un tentativo a tappeto passava quasi sempre. Qui il conteggio sta
   su Firestore, nella collezione `richieste_throttle`, e vale per
   tutte le istanze insieme.

   Stessa finestra SCORREVOLE dei vecchi troppi()/troppiInvii(): si
   tiene l'elenco degli istanti entro la finestra e si blocca quando
   sono gia' `massimo`. Le soglie restano quelle di ciascun endpoint:
   cambia solo dove vive il conteggio. Una richiesta bloccata non
   scrive nulla (costa una sola lettura), quindi sotto una raffica il
   database lavora meno di prima, non di piu'.

   Riceve `db` e NON inizializza firebase-admin, come gli altri moduli
   di lib/ (utente-effettivo.js, codici-invito.js): ogni endpoint ha il
   suo initAdmin, e una seconda inizializzazione farebbe errore.

   La collezione non compare nelle regole Firestore, ed e' voluto: ci
   scrive solo l'account di servizio e dal browser non ci arriva
   nessuno (vedi area-riservata/FIREBASE-SETUP.md). Il campo `scade`
   e' un Timestamp: serve ad agganciare, un domani, una policy TTL
   dalla console per far sparire da soli i documenti vecchi.

   Se Firestore non risponde si LASCIA PASSARE e si scrive nel log.
   Il freno e' un rafforzamento: i confini veri restano le firme HMAC,
   l'ID token, l'Admin SDK e le risposte minime, e un modulo di
   iscrizione non deve cadere perche' il contatore e' irraggiungibile
   (le scritture successive dell'endpoint fallirebbero comunque). Una
   sola eccezione: la contesa sullo stesso documento, cioe' troppe
   transazioni insieme dallo stesso indirizzo. Quella E' la raffica,
   e si frena.
   ============================================================ */
'use strict';

const COLLEZIONE = 'richieste_throttle';
const GRPC_ABORTED = 10;   // codice gRPC: troppa contesa sullo stesso documento

/* Un id Firestore non puo' contenere '/'. Gli altri caratteri sostituiti
   sarebbero ammessi, ma si usa lo stesso filtro degli altri id del
   servizio (idDocumento delle schede, presenze, ebookScaricati), cosi' in
   console si leggono allo stesso modo: 93.184.216.34 -> "ebook~93-184-216-34".
   Il ':' degli indirizzi IPv6 resta com'e'. */
function idDocumento(ambito, chiave) {
    const a = String(ambito || 'x').replace(/[\/\\.#$\[\]~]/g, '-').slice(0, 40);
    const c = String(chiave || '').replace(/[\/\\.#$\[\]]/g, '-').slice(0, 400);
    return a + '~' + c;
}

/* true = TROPPE richieste (rispondere 429); false = passa, e l'istante
   viene registrato. Stesso verso di troppi()/troppiInvii(): negli
   endpoint si sostituisce la chiamata e i messaggi restano quelli. */
async function troppeRichieste(db, ambito, chiave, opzioni) {
    const finestraMs = Number(opzioni && opzioni.finestraMs) || 10 * 60 * 1000;
    const massimo = Number(opzioni && opzioni.massimo) || 10;
    // senza chiave (intestazione dell'IP assente) non si frena, come prima,
    // e non si tocca Firestore
    if (!chiave) return false;
    const rif = db.collection(COLLEZIONE).doc(idDocumento(ambito, chiave));
    try {
        return await db.runTransaction(async (tx) => {
            const snap = await tx.get(rif);
            const ora = Date.now();
            const dati = (snap.exists && snap.data()) || {};
            // si tengono gli istanti entro la finestra; un istante "nel futuro"
            // puo' venire da un'istanza con l'orologio un po' avanti e conta,
            // ma oltre una finestra e' un dato sporco e si scarta
            const recenti = (Array.isArray(dati.colpi) ? dati.colpi : [])
                .map(Number)
                .filter(t => t > 0 && ora - t < finestraMs && t - ora < finestraMs);
            // bloccato: niente scrittura, costa una sola lettura
            if (recenti.length >= massimo) return true;
            recenti.push(ora);
            tx.set(rif, {
                ambito: String(ambito || ''),
                chiave: String(chiave).slice(0, 400),
                colpi: recenti.slice(-massimo),
                ultimo: ora,
                scade: new Date(ora + finestraMs)
            });
            return false;
        }, { maxAttempts: 3 });
    } catch (e) {
        if (e && e.code === GRPC_ABORTED) {
            console.error('frequenza: contesa su', ambito, '- richiesta frenata');
            return true;
        }
        console.error('frequenza: Firestore non raggiungibile, si lascia passare:',
            String((e && e.message) || e).slice(0, 200));
        return false;
    }
}

module.exports = { troppeRichieste, idDocumento, COLLEZIONE };
