/* ============================================================
   Le schede del modulo del SITO, in SOLA LETTURA, per la diretta
   ------------------------------------------------------------
   L'unico punto in cui la diretta guarda dentro il progetto Firebase
   dello studio (quello del modulo del sito e dell'area riservata).
   Serve alla riconciliazione (lib/diretta-riconcilia.js, nel lavoro
   programmato della diretta): chi si iscrive "online" dal modulo del
   sito ha la sua scheda nella raccolta `iscrizioni` del progetto dello
   studio, salvata da api/iscrizione-nuova.js PRIMA di chiamare la
   diretta. Se in quel momento il servizio della diretta non risponde
   (Firestore della diretta irraggiungibile, un errore, la funzione
   fermata a meta'), la scheda c'e' comunque, e il lavoro programmato
   della diretta la ritrova qui: nessuna iscrizione online resta senza
   password perche' il servizio non ha risposto.

   PERCHE' IN UN FILE A PARTE (e non in un file diretta-*). I file della
   diretta non usano MAI la chiave del progetto dello studio: lo
   controlla diretta/prove/separazione.prova.js. Questo file la usa, ma
   solo per LEGGERE, ed e' l'unico:
     - una query sulla raccolta `iscrizioni` e basta: nessuna scrittura,
       nessun account, nessun'altra raccolta (separazione.prova.js
       controlla anche questo, sul testo del file);
     - con un'app firebase-admin con un NOME proprio, "sito-lettura",
       aperta con la stessa chiave e la stessa lettura della chiave di
       tutte le altre funzioni dello studio (FIREBASE_SERVICE_ACCOUNT,
       JSON o base64: leggiServiceAccount di lib/newsletter.js, identica
       a quella di api/iscrizione-nuova.js). Non e' l'app predefinita
       (quella di api/iscrizione-nuova.js: nello stesso processo, il
       server locale o le prove, le due non si pestano i piedi) e non e'
       l'app "diretta" (lib/diretta-firebase.js, la chiave della
       diretta): i due progetti restano separati, nessun dato della
       diretta finisce nel progetto dello studio e nessun browser legge
       l'uno dall'altro;
     - alla diretta passano solo i campi che le servono (pagina,
       modalita', annullata, nome, cognome, azienda, email).
   Senza FIREBASE_SERVICE_ACCOUNT (configurato() falso) la
   riconciliazione salta, in silenzio: la diretta continua come prima.

   LA QUERY. Un solo filtro di intervallo, su `ricevuto` (il momento in
   cui il modulo ha salvato la scheda: serverTimestamp, con i
   microsecondi), ordinato per `ricevuto`: basta l'indice automatico di
   un campo, non c'e' nessun indice composto da creare nel progetto dello
   studio. Tutto il resto (modalita' online, pagina dell'evento, scheda
   annullata) lo filtra la diretta nel codice.
   ============================================================ */
'use strict';
const admin = require('firebase-admin');
const NL = require('./newsletter');

const NOME_APP = 'sito-lettura';
const MAX_LOTTO = 300;

// c'e' la chiave del progetto dello studio?
function configurato() {
    return !!String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
}

let app = null;
function appSito() {
    if (app) return app;
    const gia = admin.apps.find(a => a && a.name === NOME_APP);
    if (gia) { app = gia; return app; }
    const cred = NL.leggiServiceAccount();
    app = admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id }, NOME_APP);
    return app;
}

function testo(v, max) {
    return String(v == null ? '' : v).slice(0, max).trim();
}

/* Le schede ricevute da `dal` (un Timestamp di Firestore, compreso) in
   poi, dalla piu' vecchia, al massimo `quante`.
   -> [{ id, ricevuto (Timestamp), pagina, modalita, annullata, email,
         nome, cognome, azienda }]
   Le schede senza `ricevuto` (importate dal foglio, per esempio) la
   query non le vede: non sono iscrizioni arrivate dal modulo. */
async function schedeDal(dal, quante) {
    const n = Math.max(1, Math.min(MAX_LOTTO, Number(quante) || 100));
    const snap = await appSito().firestore().collection('iscrizioni')
        .where('ricevuto', '>=', dal).orderBy('ricevuto').limit(n).get();
    return snap.docs.map(doc => {
        const d = doc.data() || {};
        return {
            id: doc.id,
            ricevuto: d.ricevuto,
            pagina: testo(d.pagina, 300),
            modalita: testo(d.modalita, 20).toLowerCase(),
            annullata: !!d.annullato,
            email: testo(d.email, 254),
            nome: testo(d.nome, 120),
            cognome: testo(d.cognome, 120),
            azienda: testo(d.azienda, 200)
        };
    });
}

module.exports = { configurato, schedeDal, NOME_APP };
