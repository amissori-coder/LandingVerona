/* ============================================================
   Nuova iscrizione a un evento (dal form pubblico del sito)
   ------------------------------------------------------------
   I form del sito continuano a scrivere sul foglio Google come
   sempre; IN PIU' mandano qui gli stessi dati, che finiscono
   direttamente su Firestore (collezione "iscrizioni").

   Perche': il foglio resta comodo per chi lo consulta, ma l'area
   riservata non deve dipendere da una catena di tre pezzi (script
   di Google, API Sheets, account di servizio condiviso). Con i
   dati anche su Firestore, se una delle due strade si rompe
   l'altra continua a funzionare.

   Questo endpoint e' PUBBLICO per forza (lo chiama il visitatore
   che si iscrive), quindi:
     - accetta solo POST e solo campi noti, con lunghezze massime;
     - scrive con l'account di servizio (Admin SDK), quindi le
       regole di sicurezza di Firestore non entrano in gioco e
       nessuno puo' scrivere a mano sul database dal browser;
     - l'identificativo del documento e' ricavato da email e data,
       quindi un doppio invio aggiorna la stessa scheda invece di
       creare un duplicato;
     - limita gli invii ripetuti dallo stesso indirizzo IP.
   Non restituisce mai dati: risponde solo ok/non ok.
   ============================================================ */

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
function initAdmin(cred) {
    if (appPronta) return;
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    appPronta = true;
}

/* --- limite invii per indirizzo IP ---
   In memoria: su serverless l'istanza puo' cambiare, quindi non e' una
   difesa assoluta, ma taglia i tentativi ripetuti dalla stessa origine. */
const RL_FINESTRA_MS = 10 * 60 * 1000;
const RL_MAX = 8;
const invii = new Map();
function troppiInvii(ip) {
    if (!ip) return false;
    const ora = Date.now();
    const elenco = (invii.get(ip) || []).filter(t => ora - t < RL_FINESTRA_MS);
    if (elenco.length >= RL_MAX) { invii.set(ip, elenco); return true; }
    elenco.push(ora);
    invii.set(ip, elenco);
    // pulizia: non lasciamo crescere la mappa all'infinito
    if (invii.size > 500) {
        for (const [k, v] of invii) {
            if (!v.length || ora - v[v.length - 1] > RL_FINESTRA_MS) invii.delete(k);
        }
    }
    return false;
}

// testo ripulito e accorciato: niente campi enormi nel database
function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function emailValida(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}
// data italiana "gg/mm/aaaa hh:mm:ss": nell'ID le barre non sono ammesse
function idDocumento(email, data, nome, cognome) {
    const base = (email || (testo(nome, 60) + '.' + testo(cognome, 60)).toLowerCase()) + '|' + data;
    return base.replace(/[\/\\.#$\[\]]/g, '-').slice(0, 300) || 'senza-identificativo';
}


/* Segna che i dati sono cambiati, cosi la lettura sa che deve rileggere. */
async function segnaCambiamento(db) {
    try {
        await db.collection('meta').doc('iscrizioni')
            .set({ rev: admin.firestore.FieldValue.increment(1), quando: Date.now() }, { merge: true });
    } catch (e) { /* non e grave: la lettura ha comunque una scadenza a tempo */ }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

    try {
        const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
        if (troppiInvii(ip)) { res.status(429).json({ ok: false, msg: 'Troppi invii ravvicinati.' }); return; }

        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const email = testo(body.email, 200).toLowerCase();
        const nome = testo(body.nome, 120);
        const cognome = testo(body.cognome, 120);
        const pagina = testo(body.pagina, 200);
        // servono almeno un recapito e l'indicazione dell'evento
        if (!pagina) { res.status(400).json({ ok: false, msg: 'Evento non indicato.' }); return; }
        if (!email && !nome && !cognome) { res.status(400).json({ ok: false, msg: 'Dati insufficienti.' }); return; }
        if (email && !emailValida(email)) { res.status(400).json({ ok: false, msg: 'Indirizzo email non valido.' }); return; }

        const cred = leggiServiceAccount();
        initAdmin(cred);

        const data = testo(body.data, 40);
        const scheda = {
            data: data,
            pagina: pagina,
            nome: nome,
            cognome: cognome,
            email: email,
            azienda: testo(body.azienda, 200),
            ruolo: testo(body.ruolo, 200),
            telefono: testo(body.telefono, 60),
            messaggio: testo(body.messaggio, 2000),
            privacy: body.privacy === true,
            marketing: body.marketing === true,
            ricevuto: admin.firestore.FieldValue.serverTimestamp()
        };

        await admin.firestore().collection('iscrizioni')
            .doc(idDocumento(email, data, nome, cognome))
            .set(scheda, { merge: true });
        await segnaCambiamento(admin.firestore());

        res.status(200).json({ ok: true });
    } catch (e) {
        // il visitatore non deve vedere dettagli tecnici: restano nei log
        console.error('Iscrizione non registrata:', String((e && e.message) || e).slice(0, 200));
        res.status(500).json({ ok: false });
    }
};
