/* ============================================================
   Credenziali e chiamate alle API Google
   ------------------------------------------------------------
   Le chiavi arrivano SOLO dalle variabili d'ambiente (i segreti del
   repository): nel codice non finisce mai niente di riservato.

   FIREBASE_SERVICE_ACCOUNT  chiave del service account del progetto Firebase
   GDRIVE_SERVICE_ACCOUNT    chiave per scrivere su Google Drive (facoltativa:
                             se manca si riusa quella di Firebase)
   ============================================================ */

const { GoogleAuth } = require('google-auth-library');

/* Accetta sia il JSON in chiaro sia lo stesso JSON codificato in base64
   (comodo da incollare nei segreti senza preoccuparsi degli a capo). */
function leggiServiceAccount(nomeVariabile, obbligatoria = true) {
    const raw = (process.env[nomeVariabile] || '').trim();
    if (!raw) {
        if (obbligatoria) throw new Error(nomeVariabile + ' mancante');
        return null;
    }
    let testo = raw;
    if (testo[0] !== '{') {
        try {
            const dec = Buffer.from(testo, 'base64').toString('utf8').trim();
            if (dec[0] === '{') testo = dec;
        } catch (_) { }
    }
    let cred;
    try { cred = JSON.parse(testo); } catch (_) { throw new Error(nomeVariabile + ' non valido (non e\' JSON)'); }
    if (cred.private_key && cred.private_key.includes('\\n')) cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    if (!cred.client_email || !cred.private_key) throw new Error(nomeVariabile + ' incompleto (mancano client_email o private_key)');
    return cred;
}

/* Un token di accesso per gli ambiti richiesti, a partire dalla chiave. */
async function token(cred, ambiti) {
    const auth = new GoogleAuth({ credentials: cred, scopes: ambiti });
    const client = await auth.getClient();
    const t = await client.getAccessToken();
    const valore = typeof t === 'string' ? t : (t && t.token);
    if (!valore) throw new Error('token di accesso non ottenuto per ' + cred.client_email);
    return valore;
}

/* GET su un'API Google che risponde in JSON. Restituisce null sui 403/404
   (servizio non abilitato o risorsa assente): sono casi previsti, non errori. */
async function leggiJson(tok, url) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok } });
    if (r.status === 403 || r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status + ' su ' + url + ': ' + (await r.text()).slice(0, 300));
    return r.json();
}

module.exports = { leggiServiceAccount, token, leggiJson };
