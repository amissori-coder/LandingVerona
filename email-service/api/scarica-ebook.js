/* ============================================================
   Download dell'ebook riservato agli iscritti alla newsletter
   ------------------------------------------------------------
   Lo chiamano le pagine pubbliche degli ebook
   (/responsabilita_amministratori/, /tax_control_framework/):
   il visitatore scrive il suo indirizzo e la pagina chiede qui
   se puo' scaricare.

   La regola e' quella chiesta dallo studio: l'ebook si scarica
   solo se l'indirizzo e' GIA' fra gli iscritti alla newsletter.
   "Iscritto" qui significa: l'indirizzo compare fra le iscrizioni
   raccolte dai moduli del sito (Firestore `iscrizioni`, qualunque
   pagina: e' lo stesso perimetro che l'area riservata mostra nella
   sezione Newsletter) oppure nel foglio storico, e non risulta una
   disiscrizione POSTERIORE all'ultima iscrizione. Chi si era
   disiscritto e poi si riscrive dal modulo della pagina torna
   quindi "iscritto", perche' la nuova iscrizione e' piu' recente
   della disiscrizione: senza questo confronto di date resterebbe
   bloccato per sempre, dato che la disiscrizione registrata non
   viene cancellata da una nuova iscrizione.

   L'endpoint e' PUBBLICO per forza (lo chiama il visitatore),
   quindi risponde il minimo indispensabile - iscritto si'/no - e
   limita i tentativi per indirizzo IP: senza il freno diventerebbe
   un oracolo con cui scoprire chi e' in rubrica provando indirizzi
   a caso. Non restituisce MAI altri dati della scheda.

   A download concesso si tiene traccia (best effort) in
   `ebookScaricati`: serve allo studio per sapere chi ha scaricato
   cosa; se la scrittura fallisce il download parte lo stesso.
   ============================================================ */

const N = require('../lib/newsletter');
const { JWT } = require('google-auth-library');

/* --- limite per indirizzo IP: l'endpoint e' pubblico --- */
const RL_FINESTRA_MS = 10 * 60 * 1000;
const RL_MAX = 12;
const colpi = new Map();
function troppi(ip) {
    if (!ip) return false;
    const ora = Date.now();
    const elenco = (colpi.get(ip) || []).filter(t => ora - t < RL_FINESTRA_MS);
    if (elenco.length >= RL_MAX) { colpi.set(ip, elenco); return true; }
    elenco.push(ora); colpi.set(ip, elenco);
    if (colpi.size > 500) {
        for (const [k, v] of colpi) { if (!v.length || ora - v[v.length - 1] > RL_FINESTRA_MS) colpi.delete(k); }
    }
    return false;
}

/* "gg/mm/aaaa hh:mm:ss" -> millisecondi (0 se manca o non si legge).
   E' il formato con cui tutti i moduli del sito scrivono il campo `data`. */
function quando(txt) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(txt || '').trim());
    if (!m) return 0;
    return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

/* L'iscrizione piu' recente di un indirizzo su Firestore.
   -1 = mai visto; 0 = presente ma senza data leggibile (righe importate
   molto vecchie): presente e' comunque presente. */
async function ultimaIscrizioneFirestore(db, email) {
    const snap = await db.collection('iscrizioni').where('email', '==', email).get();
    if (snap.empty) return -1;
    let vive = 0;
    let max = 0;
    snap.forEach(d => {
        const v = d.data() || {};
        if (v.annullato) return;   // iscrizione annullata dall'intestatario: non conta
        vive++;
        const t = quando(v.data);
        if (t > max) max = t;
    });
    return vive ? max : -1;
}

/* --- il foglio storico, per gli iscritti raccolti prima di Firestore ---
   Stessa lettura (e stessa memoria di 5 minuti) di api/newsletter.js: si
   interroga SOLO quando l'indirizzo non risulta su Firestore, che e' il
   caso raro. Se il foglio non e' configurato o non risponde si prosegue
   con il solo esito di Firestore, invece di negare il download a chi
   magari e' iscritto da anni. */
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
async function ultimaIscrizioneFoglio(email) {
    const sheetId = process.env.EVENTI_SHEET_ID || '';
    if (!sheetId) return -1;
    if (!_cacheFoglio.righe || (Date.now() - _cacheFoglio.quando) >= FOGLIO_MS) {
        const cred = N.leggiServiceAccount();
        const range = process.env.EVENTI_SHEET_RANGE || 'A:Z';
        const token = await tokenSheets(cred);
        const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId)
            + '/values/' + encodeURIComponent(range) + '?majorDimension=ROWS';
        const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
        if (!r.ok) throw new Error('foglio non leggibile (' + r.status + ')');
        const dati = await r.json();
        const griglia = Array.isArray(dati.values) ? dati.values : [];
        // si tiene solo indirizzo e data: all'ebook non serve altro
        const righe = {};
        if (griglia.length) {
            const intest = griglia[0].map(intestazione);
            const iEmail = intest.indexOf('email');
            const iData = intest.indexOf('data');
            for (let i = 1; i < griglia.length; i++) {
                const riga = griglia[i];
                if (!riga || !riga.length) continue;
                const em = (iEmail >= 0 && riga[iEmail] != null) ? String(riga[iEmail]).trim().toLowerCase() : '';
                if (!N.EMAIL_RE.test(em)) continue;
                const t = quando((iData >= 0 && riga[iData] != null) ? String(riga[iData]) : '');
                if (righe[em] === undefined || t > righe[em]) righe[em] = t;
            }
        }
        _cacheFoglio = { quando: Date.now(), righe: righe };
    }
    const t = _cacheFoglio.righe[email];
    return t === undefined ? -1 : t;
}

// gli ebook scaricabili: la pagina manda una chiave, mai un percorso
const EBOOK = {
    'responsabilita-amministratori': 'Ebook - La responsabilita degli amministratori di societa',
    'tax-control-framework': 'Ebook - Tax Control Framework'
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito' }); return; }

    try {
        const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
        if (troppi(ip)) {
            res.status(429).json({ ok: false, msg: 'Troppi tentativi ravvicinati: attendi qualche minuto e riprova.' });
            return;
        }

        const body = typeof req.body === 'string'
            ? (() => { try { return JSON.parse(req.body || '{}'); } catch (_) { return {}; } })()
            : (req.body || {});
        const email = String(body.email || '').trim().toLowerCase();
        const ebook = String(body.ebook || '').trim();
        if (!N.EMAIL_RE.test(email)) { res.status(400).json({ ok: false, msg: 'Indirizzo email non valido.' }); return; }
        if (!EBOOK[ebook]) { res.status(400).json({ ok: false, msg: 'Ebook non riconosciuto.' }); return; }

        N.initAdmin();
        const db = N.admin.firestore();

        // 1) l'iscrizione piu' recente: prima Firestore, poi (solo se serve) il foglio storico
        let iscrittoIl = await ultimaIscrizioneFirestore(db, email);
        if (iscrittoIl < 0) {
            try { iscrittoIl = await ultimaIscrizioneFoglio(email); }
            catch (e) {
                console.error('Ebook: foglio storico non letto:', String((e && e.message) || e).slice(0, 200));
            }
        }

        if (iscrittoIl < 0) { res.status(200).json({ ok: true, iscritto: false }); return; }

        // 2) una disiscrizione POSTERIORE all'ultima iscrizione toglie il diritto:
        //    chi si riscrive dopo essersi disiscritto torna iscritto da se'
        try {
            const dis = await db.collection('newsletterDisiscritti').doc(email).get();
            if (dis.exists) {
                const quandoDis = Number((dis.data() || {}).quando) || 0;
                if (quandoDis >= iscrittoIl) { res.status(200).json({ ok: true, iscritto: false }); return; }
            }
        } catch (e) {
            // in caso di dubbio si concede: l'iscrizione c'e', ed e' quella la regola chiesta
            console.error('Ebook: disiscritti non letti:', String((e && e.message) || e).slice(0, 200));
        }

        // 3) traccia del download: informazione di servizio, non una condizione
        try {
            await db.collection('ebookScaricati')
                .doc((email + '|' + ebook).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 300))
                .set({
                    email: email,
                    ebook: EBOOK[ebook],
                    volte: N.admin.firestore.FieldValue.increment(1),
                    ultimoIl: Date.now()
                }, { merge: true });
        } catch (e) {
            console.error('Ebook: download non registrato:', String((e && e.message) || e).slice(0, 200));
        }

        res.status(200).json({ ok: true, iscritto: true });
    } catch (e) {
        console.error('Ebook: verifica non riuscita:', String((e && e.message) || e).slice(0, 200));
        res.status(500).json({ ok: false, msg: 'Verifica non riuscita in questo momento: riprova fra poco.' });
    }
};
