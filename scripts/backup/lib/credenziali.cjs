/* ============================================================
   Credenziali e chiamate alle API Google
   ------------------------------------------------------------
   Le chiavi arrivano SOLO dalle variabili d'ambiente (i segreti del
   repository): nel codice non finisce mai niente di riservato.

   FIREBASE_SERVICE_ACCOUNT  chiave del service account del progetto Firebase
   GDRIVE_SERVICE_ACCOUNT    chiave per scrivere su Google Drive (facoltativa:
                             se manca si riusa quella di Firebase)
   ============================================================ */

const { GoogleAuth, OAuth2Client } = require('google-auth-library');

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

/* Un token che agisce PER CONTO DI UNA PERSONA, non del service account.
   Serve per scrivere dentro "Il mio Drive": un service account non ha spazio
   proprio, quindi li' i caricamenti fallirebbero per quota esaurita. Con questo
   i file risultano di chi ha dato il consenso e occupano il suo spazio. */
async function tokenPersona(clientId, clientSecret, refreshToken) {
    const client = new OAuth2Client(clientId, clientSecret);
    client.setCredentials({ refresh_token: refreshToken });
    const t = await client.getAccessToken();
    const valore = typeof t === 'string' ? t : (t && t.token);
    if (!valore) throw new Error('token utente non ottenuto: il consenso e\' stato revocato o e\' scaduto');
    return valore;
}

/* Quale strada verra' presa verso Drive, SENZA chiamare la rete.
     - con le tre variabili GDRIVE_CLIENT_ID / _SECRET / _REFRESH_TOKEN si
       agisce per conto della persona (unica strada per "Il mio Drive");
     - altrimenti si usa il service account (va bene per i Drive condivisi).
   Si sceglie e si annuncia prima di autenticarsi: se le credenziali sono
   sbagliate, il report dice comunque quale strada stava tentando. Senza questo
   un "invalid_client" non lascia capire di quale client si stia parlando. */
function modoDrive(credRipiego) {
    const id = (process.env.GDRIVE_CLIENT_ID || '').trim();
    const segreto = (process.env.GDRIVE_CLIENT_SECRET || '').trim();
    const aggiornamento = (process.env.GDRIVE_REFRESH_TOKEN || '').trim();
    if (id && segreto && aggiornamento) {
        return { tipo: 'utente', id, segreto, aggiornamento, descrizione: "per conto dell'utente, client " + id };
    }
    const cred = leggiServiceAccount('GDRIVE_SERVICE_ACCOUNT', false) || credRipiego;
    return { tipo: 'servizio', cred, descrizione: 'service account ' + cred.client_email };
}

/* Il token vero e proprio, per la strada gia' scelta da modoDrive. */
async function tokenDrive(scelta, ambiti) {
    return scelta.tipo === 'utente'
        ? tokenPersona(scelta.id, scelta.segreto, scelta.aggiornamento)
        : token(scelta.cred, ambiti);
}

/* GET su un'API Google che risponde in JSON. Restituisce null sui 403/404
   (servizio non abilitato o risorsa assente): sono casi previsti, non errori. */
async function leggiJson(tok, url) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok } });
    if (r.status === 403 || r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status + ' su ' + url + ': ' + (await r.text()).slice(0, 300));
    return r.json();
}

module.exports = { leggiServiceAccount, token, modoDrive, tokenDrive, leggiJson };
