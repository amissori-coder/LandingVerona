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
       modalita', annullata, nome, cognome, azienda, email, e se
       l'indirizzo e' stato confermato con il pulsante della mail).
   Senza FIREBASE_SERVICE_ACCOUNT (configurato() falso) la
   riconciliazione salta, in silenzio: la diretta continua come prima.

   LE QUERY. Sempre un solo filtro, su un solo campo, ordinato per quel
   campo: basta l'indice automatico di un campo, non c'e' nessun indice
   composto da creare nel progetto dello studio. Tutto il resto
   (modalita' online, pagina dell'evento, scheda annullata, conferma con
   il clic o d'ufficio) lo filtra la diretta nel codice.
     - schedeDal: le schede RICEVUTE, intervallo su `ricevuto` (il
       momento in cui il modulo ha salvato la scheda: serverTimestamp,
       con i microsecondi);
     - confermateDal e confermateIl: le schede CONFERMATE, intervallo o
       uguaglianza su `emailConfermata.quando` (un numero, i millisecondi
       del clic: lib/conferma-email.js). La password della diretta parte
       dopo il clic su «Conferma il tuo indirizzo email»: se in quel
       momento il servizio della diretta non risponde, la
       riconciliazione ritrova qui il clic.
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

/* I campi che passano alla diretta. confermata: l'indirizzo e' stato
   confermato DALLA PERSONA, con il pulsante della mail (come: 'mail');
   la conferma d'ufficio dell'amministratore ('pregresso') non conta.
   quandoConferma: i millisecondi della conferma (qualunque), o null. */
function campi(doc) {
    const d = doc.data() || {};
    const c = d.emailConfermata && typeof d.emailConfermata === 'object' ? d.emailConfermata : null;
    const quando = c && Number.isFinite(Number(c.quando)) ? Number(c.quando) : null;
    return {
        id: doc.id,
        ricevuto: d.ricevuto,
        pagina: testo(d.pagina, 300),
        modalita: testo(d.modalita, 20).toLowerCase(),
        annullata: !!d.annullato,
        email: testo(d.email, 254),
        nome: testo(d.nome, 120),
        cognome: testo(d.cognome, 120),
        azienda: testo(d.azienda, 200),
        confermata: !!(c && quando != null && c.come === 'mail'),
        quandoConferma: quando
    };
}

/* Le schede ricevute da `dal` (un Timestamp di Firestore, compreso) in
   poi, dalla piu' vecchia, al massimo `quante`.
   -> [{ id, ricevuto (Timestamp), pagina, modalita, annullata, email,
         nome, cognome, azienda, confermata, quandoConferma }]
   Le schede senza `ricevuto` (importate dal foglio, per esempio) la
   query non le vede: non sono iscrizioni arrivate dal modulo. */
async function schedeDal(dal, quante) {
    const n = Math.max(1, Math.min(MAX_LOTTO, Number(quante) || 100));
    const snap = await appSito().firestore().collection('iscrizioni')
        .where('ricevuto', '>=', dal).orderBy('ricevuto').limit(n).get();
    return snap.docs.map(campi);
}

/* Le schede CONFERMATE da `dalMs` (millisecondi, compreso) in poi, dalla
   conferma piu' vecchia, al massimo `quante`. Anche quelle confermate
   d'ufficio (confermata: false): le scarta la riconciliazione. */
async function confermateDal(dalMs, quante) {
    const n = Math.max(1, Math.min(MAX_LOTTO, Number(quante) || 100));
    const snap = await appSito().firestore().collection('iscrizioni')
        .where('emailConfermata.quando', '>=', Number(dalMs) || 0).orderBy('emailConfermata.quando').limit(n).get();
    return snap.docs.map(campi);
}
/* Tutte le schede confermate nello stesso millisecondo `ms` (la conferma
   d'ufficio ne segna tante con lo stesso istante): la riconciliazione le
   legge insieme, cosi' il suo segno (un numero) puo' andare oltre. Al
   massimo MAX_GRUPPO. */
const MAX_GRUPPO = 2000;
async function confermateIl(ms) {
    const snap = await appSito().firestore().collection('iscrizioni')
        .where('emailConfermata.quando', '==', Number(ms)).limit(MAX_GRUPPO).get();
    return snap.docs.map(campi);
}

module.exports = { configurato, schedeDal, confermateDal, confermateIl, NOME_APP, MAX_LOTTO };
