/* ============================================================
   Parti in comune dei tre endpoint della newsletter
   ------------------------------------------------------------
   Sta qui (e non copiato in ogni file) quello che DEVE restare
   identico ovunque: la firma del collegamento di disiscrizione.
   Se il calcolo divergesse fra chi invia e chi riceve, i
   collegamenti smetterebbero di funzionare senza che nessuno se
   ne accorga fino alla prima segnalazione.

   Non e' una funzione Vercel: la cartella delle funzioni e' solo
   "api/". Qui non c'e' nessun dato, solo codice.
   ============================================================ */

const crypto = require('crypto');
const admin = require('firebase-admin');

function leggiServiceAccount() {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT mancante');
    let testo = raw;
    if (testo[0] !== '{') {
        try {
            const dec = Buffer.from(testo, 'base64').toString('utf8').trim();
            if (dec[0] === '{') testo = dec;
        } catch (_) { /* lo segnala JSON.parse */ }
    }
    let cred;
    try { cred = JSON.parse(testo); }
    catch (_) { throw new Error('FIREBASE_SERVICE_ACCOUNT non valido'); }
    if (cred.private_key && cred.private_key.includes('\\n')) {
        cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    }
    return cred;
}

let appPronta = false;
function initAdmin() {
    if (appPronta) return;
    admin.initializeApp({ credential: admin.credential.cert(leggiServiceAccount()) });
    appPronta = true;
}

/* --- segreto della firma ---
   Variabile dedicata NEWSLETTER_SECRET se c'e'; altrimenti si ricava dalla
   chiave privata dell'account di servizio, che e' gia' segreta e gia'
   configurata: la disiscrizione funziona senza aggiungere configurazione.
   ATTENZIONE: cambiando l'una o l'altra, i collegamenti gia' spediti
   smettono di funzionare (chi ci clicca vede il messaggio di errore con
   l'indirizzo a cui scrivere). */
let _segreto = null;
function segreto() {
    if (_segreto) return _segreto;
    const esplicito = String(process.env.NEWSLETTER_SECRET || '').trim();
    if (esplicito) { _segreto = esplicito; return _segreto; }
    const cred = leggiServiceAccount();
    _segreto = crypto.createHash('sha256').update('newsletter|' + String(cred.private_key || '')).digest('hex');
    return _segreto;
}
function firma(email) {
    return crypto.createHmac('sha256', segreto())
        .update('disiscrizione|' + String(email || '').trim().toLowerCase())
        .digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}
// confronto a tempo costante: non lascia capire quanto della firma era giusto
function firmaValida(email, token) {
    const attesa = Buffer.from(firma(email));
    const data = Buffer.from(String(token || ''));
    if (attesa.length !== data.length) return false;
    return crypto.timingSafeEqual(attesa, data);
}

const BASE = String(process.env.APP_BASE_URL || 'https://nextgenerationbusiness.it').replace(/\/+$/, '');
const PAGINA_DISISCRIZIONE = BASE + '/newsletter/disiscriviti.html';
/* Collegamento personale mostrato in fondo alla mail (pagina di conferma). */
function linkDisiscrizione(email, campagna) {
    return PAGINA_DISISCRIZIONE + '?e=' + encodeURIComponent(email) + '&t=' + encodeURIComponent(firma(email))
        + (campagna ? '&c=' + encodeURIComponent(String(campagna).slice(0, 60)) : '');
}
/* Indirizzo che i client di posta chiamano da soli (un clic, senza aprire nulla). */
function linkUnClic(email, campagna) {
    const api = String(process.env.NEWSLETTER_API_BASE || (BASE.indexOf('nextgenerationbusiness') >= 0 ? 'https://revilaw-email.vercel.app' : BASE)).replace(/\/+$/, '');
    return api + '/api/disiscrizione?e=' + encodeURIComponent(email) + '&t=' + encodeURIComponent(firma(email))
        + (campagna ? '&c=' + encodeURIComponent(String(campagna).slice(0, 60)) : '');
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* --- chi puo' usare la sezione Newsletter ---
   Amministratore, oppure contrassegno "newsletter" sulla scheda utente.
   NON si guarda l'elenco condiviso `archivio/newsletterConfig`, che pure
   esiste e pilota il menu dell'area riservata: quel documento, per le regole
   di Firestore, e' scrivibile da qualunque utente dello staff, quindi
   chiunque potrebbe aggiungerci il proprio indirizzo e concedersi da solo
   la rubrica completa e l'invio a nome dello studio. La scheda in `utenti`
   la scrive invece solo l'amministratore: e' l'unico permesso di cui fidarsi.
   L'area riservata scrive comunque entrambi (elenco + scheda), quindi per chi
   usa l'interfaccia non cambia nulla. */
async function autorizza(idToken) {
    if (!idToken) return { ok: false, stato: 401, msg: 'Autenticazione mancante' };
    let decoded;
    try { decoded = await admin.auth().verifyIdToken(String(idToken)); }
    catch (e) { return { ok: false, stato: 401, msg: 'Sessione non valida: rientra e riprova.' }; }
    const email = String(decoded.email || '').toLowerCase();
    if (!EMAIL_RE.test(email)) return { ok: false, stato: 401, msg: 'Utente non valido' };

    const uDoc = await admin.firestore().collection('utenti').doc(email).get();
    if (!uDoc.exists || uDoc.data().attivo === false) return { ok: false, stato: 403, msg: 'Utenza non abilitata.' };
    const dati = uDoc.data() || {};
    const ruolo = String(dati.ruolo || '');
    if (ruolo === 'admin' || dati.newsletter === true) return { ok: true, email: email, ruolo: ruolo, admin: ruolo === 'admin' };
    return {
        ok: false, stato: 403,
        msg: 'Non sei abilitato alla sezione Newsletter. Chiedi all\'amministratore di abilitarti da "Gestisci accessi".'
    };
}

/* Elenco degli indirizzi che hanno chiesto di non ricevere piu' nulla.
   Lo consultano sia la sezione (per mostrarli) sia l'invio (per saltarli). */
async function disiscritti(db) {
    const out = {};
    const snap = await db.collection('newsletterDisiscritti').get();
    snap.forEach(d => {
        const v = d.data() || {};
        const em = String(v.email || d.id || '').toLowerCase();
        if (em) out[em] = { quando: v.quando || 0, origine: v.origine || '' };
    });
    return out;
}

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}

module.exports = {
    leggiServiceAccount, initAdmin, admin,
    firma, firmaValida, linkDisiscrizione, linkUnClic,
    PAGINA_DISISCRIZIONE, BASE,
    EMAIL_RE, autorizza, disiscritti, testo
};
