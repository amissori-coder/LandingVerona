/* ============================================================
   Comunicazioni programmate: a che punto era arrivato l'invio
   ------------------------------------------------------------
   Serve a una cosa sola, ed e' quella che permette al cron di
   girare piu' di una volta al giorno senza spedire due volte.

   IL PROBLEMA. api/cron-comunicazioni.js invia e POI registra
   l'avanzamento in archivio/comunicazioni. Se la funzione muore
   fra le due cose - timeout, riavvio, errore del gestore di
   posta - il giro successivo trova la comunicazione ancora
   "dovuta" e rispedisce a TUTTI. Con un giro al giorno era una
   rispedizione; con un giro ogni ora sarebbero tredici.

   LA SOLUZIONE, che e' quella gia' in uso per le newsletter
   (lib/programmate.js): si scrive DURANTE l'invio, non solo alla
   fine. Qui vive un documento per comunicazione, con l'elenco di
   chi e' gia' stato servito. Il giro dopo lo legge e salta quelli.

   DOVE STANNO GLI INDIRIZZI, che e' la domanda importante. Non
   qui: di ogni destinatario servito si tiene solo l'IMPRONTA, la
   stessa funzione che usano la newsletter e l'area riservata
   (improntaEmail). Non e' reversibile e basta allo scopo, che e'
   rispondere a "questo l'ho gia' fatto?". Gli indirizzi in chiaro
   compaiono solo fra i FALLITI, perche' quelli devono finire nello
   storico leggibile della comunicazione: sono pochi e il documento
   si cancella appena l'invio si conclude (chiudi).

   PERCHE' IL DOCUMENTO PORTA "quando". Una comunicazione
   ricorrente rispedisce ogni mese con lo STESSO identificativo:
   senza l'istante dell'occorrenza servita, l'invio di settembre
   troverebbe l'elenco di agosto e salterebbe tutti. Se "quando"
   non combacia, l'avanzamento e' di un'altra occorrenza e si
   riparte da zero.
   ============================================================ */

const admin = require('firebase-admin');

const COLL = 'comunicazioniInvio';

/* L'impronta si prende in prestito, non si ricopia. Ne esistono gia' due
   copie che DEVONO dare lo stesso risultato (lib/invio-newsletter.js e
   l'area riservata): una terza sarebbe un terzo posto in cui sbagliare.
   Il require e' pigro perche' quel modulo serve solo qui dentro. */
let _impronta = null;
function impronta(email) {
    if (!_impronta) _impronta = require('./invio-newsletter').improntaEmail;
    return _impronta(email);
}

function rif(db, id) { return db.collection(COLL).doc(String(id)); }

/* Quello che si sa gia' di questa occorrenza. Un documento di un'altra
   occorrenza vale come se non ci fosse. */
async function apri(db, id, occorrenza) {
    const vuoto = { serviti: new Set(), inviati: 0, falliti: [] };
    try {
        const s = await rif(db, id).get();
        if (!s.exists) return vuoto;
        const d = s.data() || {};
        if (Number(d.quando || 0) !== Number(occorrenza || 0)) return vuoto;
        return {
            serviti: new Set(Array.isArray(d.serviti) ? d.serviti : []),
            inviati: Number(d.inviati || 0),
            falliti: Array.isArray(d.falliti) ? d.falliti : []
        };
    } catch (e) {
        /* Non sapere a che punto si era e' un motivo per FERMARSI, non per
           ricominciare: ripartire da zero qui vuol dire rispedire a tutti. */
        throw new Error('avanzamento non leggibile: ' + String((e && e.message) || e).slice(0, 120));
    }
}

/* Registra un pezzo di lavoro fatto. Niente lettura prima: arrayUnion e
   increment si fondono da soli, quindi due scritture ravvicinate non si
   sovrascrivono a vicenda. */
async function segna(db, id, occorrenza, impronte, delta) {
    const F = admin.firestore.FieldValue;
    const patch = { quando: Number(occorrenza || 0), aggiornato: Date.now() };
    if (impronte && impronte.length) patch.serviti = F.arrayUnion(...impronte);
    if (delta && delta.inviati) patch.inviati = F.increment(delta.inviati);
    if (delta && delta.falliti && delta.falliti.length) {
        patch.falliti = F.arrayUnion(...delta.falliti.slice(0, 50));
    }
    await rif(db, id).set(patch, { merge: true });
}

/* Invio concluso: l'avanzamento non serve piu' e non deve diventare un
   secondo archivio che nessuno ricorda. */
async function chiudi(db, id) {
    try { await rif(db, id).delete(); }
    catch (e) { console.error('Avanzamento comunicazioni, pulizia non riuscita:', String((e && e.message) || e).slice(0, 200)); }
}

/* Il lucchetto impedisce che due giri lavorino la stessa comunicazione. Con
   il cron da solo non capiterebbe (la funzione dura al massimo 300 secondi e
   i giri distano un'ora), ma un'esecuzione lanciata a mano dalla dashboard
   mentre il cron sta girando basterebbe a spedire due volte. */
async function prendiLucchetto(db, id, giro, durataMs) {
    let preso = false;
    try {
        await db.runTransaction(async (tx) => {
            const s = await tx.get(rif(db, id));
            const d = s.exists ? (s.data() || {}) : {};
            const l = d.lucchetto || null;
            if (l && Number(l.fino) > Date.now()) return;     // qualcun altro ci sta lavorando
            tx.set(rif(db, id), { lucchetto: { giro: giro, fino: Date.now() + durataMs } }, { merge: true });
            preso = true;
        });
    } catch (e) {
        console.error('Avanzamento comunicazioni, lucchetto non preso:', String((e && e.message) || e).slice(0, 200));
        return false;
    }
    return preso;
}

/* update e non set(merge): il lucchetto si molla anche DOPO chiudi(), e un
   set ricreerebbe il documento appena cancellato lasciando in giro un
   avanzamento vuoto per sempre. Su un documento che non c'e' piu' update
   fallisce, ed e' esattamente quello che si vuole. */
async function mollaLucchetto(db, id) {
    try { await rif(db, id).update({ lucchetto: null }); }
    catch (e) { /* gia' cancellato, oppure scade da solo: non vale un giro fallito */ }
}

module.exports = { COLL, rif, impronta, apri, segna, chiudi, prendiLucchetto, mollaLucchetto };
