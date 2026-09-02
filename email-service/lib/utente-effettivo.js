/* ============================================================
   CHI CHIAMA, CON I PERMESSI CHE CONTANO
   ------------------------------------------------------------
   L'area riservata ha il profilo "collaboratore": un utente
   (utenti/<email> con ruolo 'collaboratore' e collaboratoreDi =
   l'indirizzo di un altro utente) che lavora A NOME di quell'altro
   utente, con i suoi stessi permessi. Qui si risolve la scheda che
   conta: per un utente normale la sua; per un collaboratore quella del
   suo utente di riferimento, purche' esista, sia attiva e non sia a sua
   volta un collaboratore o un invitato "solo sondaggio". Sono le stesse
   regole dell'app (area-riservata/app.js) e delle regole Firestore
   (area-riservata/FIREBASE-SETUP.md).

   Risultato, se va bene:
     { ok: true, email, dati, ruolo, sessione: { email, nome }, collaboratore }
     - email, dati, ruolo: l'utente EFFETTIVO (per un collaboratore, il
       suo riferimento). Su questi si decidono admin, Eventi, Newsletter,
       a chi tornano le risposte e con quale nome si firma;
     - sessione: chi ha davvero fatto la chiamata (per rate limit e log);
     - collaboratore: true se chi chiama e' un collaboratore.
   Altrimenti { ok: false, msg } con il motivo, da restituire con 403.
   ============================================================ */
'use strict';

const RUOLO_COLLABORATORE = 'collaboratore';
const RUOLI_SOLO_SONDAGGIO = ['sondaggio_compila', 'sondaggio_risultati'];

async function utenteEffettivo(db, email) {
    const e = String(email || '').toLowerCase();
    if (!e) return { ok: false, msg: 'Utente non valido.' };
    const doc = await db.collection('utenti').doc(e).get();
    if (!doc.exists || doc.data().attivo === false) return { ok: false, msg: 'Utenza non abilitata.' };
    const dati = doc.data() || {};
    const sessione = { email: e, nome: String(dati.nome || '') };
    if (String(dati.ruolo || '') !== RUOLO_COLLABORATORE) {
        return { ok: true, email: e, dati: dati, ruolo: String(dati.ruolo || ''), sessione: sessione, collaboratore: false };
    }
    const di = String(dati.collaboratoreDi || '').trim().toLowerCase();
    if (!di || di === e) return { ok: false, msg: 'Il tuo accesso da collaboratore non indica l\'utente di riferimento: chiedi all\'amministratore.' };
    const pDoc = await db.collection('utenti').doc(di).get();
    if (!pDoc.exists || pDoc.data().attivo === false) return { ok: false, msg: 'L\'utente a cui il tuo accesso è associato non risulta abilitato: chiedi all\'amministratore.' };
    const p = pDoc.data() || {};
    const ruoloP = String(p.ruolo || '');
    if (ruoloP === RUOLO_COLLABORATORE || RUOLI_SOLO_SONDAGGIO.indexOf(ruoloP) >= 0) {
        return { ok: false, msg: 'L\'utente a cui il tuo accesso è associato non può avere collaboratori: chiedi all\'amministratore.' };
    }
    return { ok: true, email: di, dati: p, ruolo: ruoloP, sessione: sessione, collaboratore: true };
}

/* La firma del collaboratore reale da mettere nei timbri accanto a "da": 'Nome <email>',
   lo stesso formato che usa l'area riservata (firmaCollaboratore in app.js), cosi'
   a video si estraggono nome ed email allo stesso modo. Vuota se non e' un collaboratore. */
function firmaCollaboratore(ue) {
    if (!ue || !ue.ok || !ue.collaboratore) return '';
    const s = ue.sessione || {};
    return (s.nome || s.email || '') + (s.email ? ' <' + s.email + '>' : '');
}

module.exports = { utenteEffettivo, firmaCollaboratore, RUOLO_COLLABORATORE };
