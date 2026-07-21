/* ============================================================
   Importazione una tantum delle iscrizioni gia raccolte
   ------------------------------------------------------------
   Porta dentro Firestore le iscrizioni che stanno ancora solo sul
   foglio, cosi da li in avanti il foglio non serve piu: le nuove
   arrivano dal form direttamente su Firestore.

   Due strade, perche' una delle due puo' non essere disponibile:
     1. lettura diretta del foglio con l'API Google (se il foglio e'
        condiviso con l'account di servizio);
     2. contenuto CSV inviato dall'amministratore (File > Scarica >
        Valori separati da virgole), che non richiede nulla.

   Riservato all'AMMINISTRATORE: verifica l'ID token e il ruolo.
   L'identificativo del documento e' lo stesso usato dal form, quindi
   reimportare non crea duplicati e non perde note e presenze gia
   collegate.
   ============================================================ */

const admin = require('firebase-admin');
const { JWT } = require('google-auth-library');

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

async function tokenSheets(cred) {
    const client = new JWT({
        email: cred.client_email,
        key: cred.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const t = await client.getAccessToken();
    const token = t && typeof t === 'object' ? t.token : t;
    if (!token) throw new Error('Token Google non ottenuto');
    return token;
}

function chiave(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function idDocumento(email, data, nome, cognome) {
    const base = (email || (chiave(nome) + '.' + chiave(cognome))) + '|' + data;
    return base.replace(/[\/\\.#$\[\]]/g, '-').slice(0, 300) || 'senza-identificativo';
}

/* Lettore CSV completo: gestisce virgolette, virgole e a capo dentro i campi,
   che nei messaggi liberi capitano spesso. Restituisce un elenco di righe. */
function leggiCsv(testoCsv) {
    const righe = [];
    let riga = [], campo = '', dentroVirgolette = false;
    const s = String(testoCsv || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (dentroVirgolette) {
            if (c === '"') {
                if (s[i + 1] === '"') { campo += '"'; i++; }
                else dentroVirgolette = false;
            } else campo += c;
        } else if (c === '"') {
            dentroVirgolette = true;
        } else if (c === ',') {
            riga.push(campo); campo = '';
        } else if (c === '\n') {
            riga.push(campo); campo = '';
            if (riga.some(x => x !== '')) righe.push(riga);
            riga = [];
        } else campo += c;
    }
    riga.push(campo);
    if (riga.some(x => x !== '')) righe.push(riga);
    return righe;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito' }); return; }

    try {
        const cred = leggiServiceAccount();
        initAdmin(cred);
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

        // 1) solo amministratore
        const idToken = String(body.idToken || '');
        if (!idToken) { res.status(401).json({ ok: false, msg: 'Autenticazione mancante' }); return; }
        let decoded;
        try { decoded = await admin.auth().verifyIdToken(idToken); }
        catch (e) { res.status(401).json({ ok: false, msg: 'Sessione non valida: rientra e riprova.' }); return; }
        const email = String(decoded.email || '').toLowerCase();
        const uDoc = await admin.firestore().collection('utenti').doc(email).get();
        if (!uDoc.exists || uDoc.data().attivo === false) { res.status(403).json({ ok: false, msg: 'Utenza non abilitata.' }); return; }
        if (String(uDoc.data().ruolo || '') !== 'admin') {
            res.status(403).json({ ok: false, msg: 'Solo l\'amministratore puo importare le iscrizioni.' });
            return;
        }

        // 2) le righe: dal CSV inviato, oppure dal foglio
        let righe = [];
        let fonte = '';
        const csv = typeof body.csv === 'string' ? body.csv : '';
        if (csv.trim()) {
            righe = leggiCsv(csv);
            fonte = 'file';
        } else {
            const sheetId = process.env.EVENTI_SHEET_ID || '';
            if (!sheetId) { res.status(400).json({ ok: false, msg: 'Nessun file inviato e foglio non configurato (EVENTI_SHEET_ID).' }); return; }
            const range = process.env.EVENTI_SHEET_RANGE || 'A:K';
            const token = await tokenSheets(cred);
            const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId)
                + '/values/' + encodeURIComponent(range) + '?majorDimension=ROWS';
            const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
            if (!r.ok) {
                const msg = r.status === 403
                    ? 'Il foglio non e condiviso con l\'account di servizio, oppure l\'API Google Sheets non e abilitata. Puoi importare il file CSV al suo posto.'
                    : (r.status === 404 ? 'Foglio non trovato: controlla EVENTI_SHEET_ID.' : 'Lettura del foglio non riuscita (' + r.status + ').');
                res.status(502).json({ ok: false, msg: msg });
                return;
            }
            const dati = await r.json();
            righe = Array.isArray(dati.values) ? dati.values : [];
            fonte = 'foglio';
        }
        if (righe.length < 2) { res.status(200).json({ ok: true, lette: 0, importate: 0, fonte: fonte, msg: 'Nessuna riga da importare.' }); return; }

        // 3) colonne per NOME, come nella lettura normale
        const intest = righe[0].map(chiave);
        const col = n => intest.indexOf(n);
        const iData = col('data'), iPagina = col('pagina'), iNome = col('nome'), iCognome = col('cognome');
        const iEmail = col('email'), iAzienda = col('azienda'), iRuolo = col('ruolo');
        const iTel = col('telefono'), iMsg = col('messaggio');
        if (iPagina < 0 && iEmail < 0) {
            res.status(400).json({ ok: false, msg: 'Intestazioni non riconosciute: servono almeno le colonne Pagina ed Email.' });
            return;
        }
        const cella = (riga, i) => (i >= 0 && riga[i] != null) ? testo(riga[i], 2000) : '';

        // 4) scrittura a blocchi (il limite di un batch Firestore e 500 operazioni)
        const db = admin.firestore();
        let importate = 0, saltate = 0;
        let batch = db.batch(), nelBatch = 0;
        for (let i = 1; i < righe.length; i++) {
            const riga = righe[i];
            if (!riga || !riga.length) continue;
            const em = cella(riga, iEmail).toLowerCase();
            const nome = cella(riga, iNome), cognome = cella(riga, iCognome);
            const pagina = cella(riga, iPagina);
            if (!em && !nome && !cognome) { saltate++; continue; }
            const data = cella(riga, iData);
            const rif = db.collection('iscrizioni').doc(idDocumento(em, data, nome, cognome));
            batch.set(rif, {
                data: data, pagina: pagina, nome: testo(nome, 120), cognome: testo(cognome, 120),
                email: em, azienda: cella(riga, iAzienda), ruolo: cella(riga, iRuolo),
                telefono: cella(riga, iTel), messaggio: cella(riga, iMsg),
                importato: true
            }, { merge: true });
            nelBatch++; importate++;
            if (nelBatch >= 400) { await batch.commit(); batch = db.batch(); nelBatch = 0; }
        }
        if (nelBatch) await batch.commit();

        res.status(200).json({ ok: true, lette: righe.length - 1, importate: importate, saltate: saltate, fonte: fonte });
    } catch (e) {
        const motivo = String((e && e.message) || 'errore').slice(0, 200);
        console.error('Importazione iscrizioni non riuscita:', motivo);
        res.status(500).json({ ok: false, msg: 'Importazione non riuscita: ' + motivo });
    }
};
