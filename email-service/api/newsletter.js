/* ============================================================
   Destinatari della newsletter (Area riservata Revilaw)
   ------------------------------------------------------------
   Restituisce in una sola richiesta tutto cio' che serve alla sezione:
     - le iscrizioni raccolte dai moduli del sito (TUTTE le pagine, non
       solo gli eventi: newsletter del sito, ZLS/ZES, FCD, bandi Lazio...),
       con l'indicazione della pagina di provenienza;
     - gli indirizzi che hanno chiesto di non ricevere piu' nulla.
   L'area riservata li raggruppa da sola (eventi / sezioni del sito) e ci
   aggiunge gli aderenti, che sono gia' nella sua anagrafica.

   Sono dati personali: l'endpoint NON e' pubblico. Chi chiama deve essere
   autenticato e abilitato alla sezione Newsletter (vedi lib/newsletter.js).

   L'amministratore puo' anche disiscrivere o riattivare un indirizzo a
   mano ("azione"), per gestire le richieste che arrivano per telefono o
   per email invece che dal collegamento in fondo alla newsletter.
   ============================================================ */

const N = require('../lib/newsletter');
const { JWT } = require('google-auth-library');

/* --- seconda fonte: il foglio Google ---
   Tutti i moduli del sito scrivono da sempre sullo stesso foglio; su Firestore
   arrivano solo le iscrizioni piu' recenti (le pagine che sono state aggiornate).
   Per la newsletter servono TUTTI, quindi si leggono anche le righe del foglio e
   si uniscono per indirizzo. Se il foglio non e' configurato o non risponde si
   prosegue con le sole iscrizioni di Firestore. */
async function tokenSheets(cred) {
    const client = new JWT({
        email: cred.client_email, key: cred.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const t = await client.getAccessToken();
    const token = t && typeof t === 'object' ? t.token : t;
    if (!token) throw new Error('Token Google non ottenuto');
    return token;
}
function intestazione(s) {
    return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
let _cacheFoglio = { quando: 0, righe: null };
const FOGLIO_MS = 5 * 60 * 1000;
async function leggiFoglio(forza) {
    const sheetId = process.env.EVENTI_SHEET_ID || '';
    if (!sheetId) return [];
    if (!forza && _cacheFoglio.righe && (Date.now() - _cacheFoglio.quando) < FOGLIO_MS) return _cacheFoglio.righe;
    const cred = N.leggiServiceAccount();
    const range = process.env.EVENTI_SHEET_RANGE || 'A:K';
    const token = await tokenSheets(cred);
    const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId)
        + '/values/' + encodeURIComponent(range) + '?majorDimension=ROWS';
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('foglio non leggibile (' + r.status + ')');
    const dati = await r.json();
    const griglia = Array.isArray(dati.values) ? dati.values : [];
    if (!griglia.length) { _cacheFoglio = { quando: Date.now(), righe: [] }; return []; }
    // colonne mappate per NOME: il foglio puo' cambiare ordine
    const intest = griglia[0].map(intestazione);
    const col = n => intest.indexOf(n);
    const iData = col('data'), iPagina = col('pagina'), iNome = col('nome'), iCognome = col('cognome');
    const iEmail = col('email'), iAzienda = col('azienda'), iRuolo = col('ruolo'), iTel = col('telefono');
    const iMkt = col('marketing');
    const cella = (riga, i) => (i >= 0 && riga[i] != null) ? String(riga[i]).trim() : '';
    /* Consenso alle comunicazioni promozionali. Se la colonna non c'e' nel foglio
       si risponde null = "non risultante": l'area riservata NON mette quelle righe
       fra i destinatari, ma le mostra a parte, cosi' la decisione resta di chi
       sa come sono state raccolte. */
    const consenso = (riga) => {
        if (iMkt < 0) return null;
        const v = cella(riga, iMkt);
        if (!v) return false;
        return VERO.test(v);
    };
    const righe = [];
    for (let i = 1; i < griglia.length; i++) {
        const riga = griglia[i];
        if (!riga || !riga.length) continue;
        const email = cella(riga, iEmail).toLowerCase();
        if (!N.EMAIL_RE.test(email)) continue;
        righe.push({
            id: 'foglio|' + email + '|' + cella(riga, iData),
            email: email, nome: cella(riga, iNome), cognome: cella(riga, iCognome),
            azienda: cella(riga, iAzienda), ruolo: cella(riga, iRuolo), telefono: cella(riga, iTel),
            pagina: cella(riga, iPagina), data: cella(riga, iData), marketing: consenso(riga)
        });
    }
    _cacheFoglio = { quando: Date.now(), righe: righe };
    return righe;
}

/* --- memoria di breve durata ---
   Come per le iscrizioni agli eventi: rileggere centinaia di documenti a
   ogni apertura della sezione brucia la quota giornaliera di letture.
   Il numero di revisione (un solo documento) dice se qualcosa e' cambiato. */
const CACHE_MS = 60 * 1000;
let _cache = { quando: 0, righe: null, revI: -1 };

async function revisioneIscrizioni(db) {
    try {
        const d = await db.collection('meta').doc('iscrizioni').get();
        return (d.exists && typeof d.data().rev === 'number') ? d.data().rev : 0;
    } catch (_) { return -1; }
}

/* Consenso alle comunicazioni promozionali di una scheda su Firestore.
   true/false quando il modulo l'ha registrato; null quando non risulta
   (schede importate da elenchi vecchi, dove la colonna poteva non esserci). */
const VERO = /^(si|s|true|vero|1|x|yes)$/i;
function consensoScheda(v) {
    if (v.marketing === true) return true;
    if (v.marketing === false) return false;
    // l'importazione conserva le colonne non riconosciute dentro "extra"
    const ex = (v.extra && typeof v.extra === 'object') ? v.extra : {};
    const chiavi = Object.keys(ex);
    for (let i = 0; i < chiavi.length; i++) {
        if (/market|consens|newsletter/i.test(chiavi[i])) {
            const s = String(ex[chiavi[i]] == null ? '' : ex[chiavi[i]]).trim();
            return s ? VERO.test(s) : false;
        }
    }
    return null;
}

async function leggiIscrizioni(db, forza, rev) {
    if (!forza && _cache.righe) {
        if (rev >= 0) { if (rev === _cache.revI) return _cache.righe; }
        else if ((Date.now() - _cache.quando) < CACHE_MS) return _cache.righe;
    }
    const snap = await db.collection('iscrizioni').get();
    const righe = [];
    snap.forEach(d => {
        const v = d.data() || {};
        const email = String(v.email || '').trim().toLowerCase();
        if (!N.EMAIL_RE.test(email)) return;   // senza indirizzo non e' un destinatario
        righe.push({
            id: d.id,
            email: email,
            nome: String(v.nome || ''),
            cognome: String(v.cognome || ''),
            azienda: String(v.azienda || ''),
            ruolo: String(v.ruolo || ''),
            telefono: String(v.telefono || ''),
            pagina: String(v.pagina || ''),
            data: String(v.data || ''),
            marketing: consensoScheda(v)
        });
    });
    _cache = { quando: Date.now(), righe: righe, revI: rev };
    return righe;
}

module.exports = async (req, res) => {
    const origin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito' }); return; }

    try {
        N.initAdmin();
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

        const aut = await N.autorizza(body.idToken);
        if (!aut.ok) { res.status(aut.stato).json({ ok: false, msg: aut.msg }); return; }

        const db = N.admin.firestore();
        const azione = String(body.azione || 'elenco');

        // --- disiscrizione/riattivazione fatta a mano dalla sezione ---
        if (azione === 'disiscrivi' || azione === 'riattiva') {
            const email = String(body.email || '').trim().toLowerCase();
            if (!N.EMAIL_RE.test(email)) { res.status(400).json({ ok: false, msg: 'Indirizzo non valido.' }); return; }
            const ref = db.collection('newsletterDisiscritti').doc(email);
            if (azione === 'riattiva') await ref.delete();
            else await ref.set({ email: email, quando: Date.now(), origine: 'a mano (' + aut.email + ')' }, { merge: true });
            res.status(200).json({ ok: true, stato: azione === 'riattiva' ? 'iscritto' : 'disiscritto' });
            return;
        }

        // --- elenco ---
        const revI = await revisioneIscrizioni(db);
        const [righe, fuori] = await Promise.all([
            leggiIscrizioni(db, body.forza === true, revI),
            N.disiscritti(db)
        ]);
        // il foglio e' la fonte storica: un indirizzo gia' su Firestore vince (e' piu' aggiornato)
        let avviso = '';
        let daFoglio = [];
        try { daFoglio = await leggiFoglio(body.forza === true); }
        catch (e) {
            avviso = 'Le iscrizioni raccolte prima del passaggio al nuovo archivio non sono leggibili in questo momento.';
            console.error('Newsletter: foglio non letto:', String((e && e.message) || e).slice(0, 200));
        }
        const perEmail = {};
        daFoglio.forEach(x => { if (!perEmail[x.email]) perEmail[x.email] = x; });
        righe.forEach(x => {
            // il consenso non si perde nell'unione: se la scheda su Firestore non lo
            // registra (import di elenchi vecchi) ma il foglio si', vale quello del foglio
            const prima = perEmail[x.email];
            if (x.marketing == null && prima && prima.marketing != null) x = { ...x, marketing: prima.marketing };
            perEmail[x.email] = x;
        });
        const iscritti = Object.keys(perEmail).map(k => perEmail[k]);

        const risposta = { ok: true, iscritti: iscritti, disiscritti: fuori, aggiornato: Date.now() };
        if (avviso) risposta.avviso = avviso;
        res.status(200).json(risposta);
    } catch (e) {
        const motivo = String((e && e.message) || 'errore').slice(0, 200);
        console.error('Newsletter: lettura non riuscita:', motivo);
        res.status(500).json({ ok: false, msg: motivo });
    }
};
