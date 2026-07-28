/* ============================================================
   Disiscrizione dalla newsletter (endpoint PUBBLICO)
   ------------------------------------------------------------
   Ogni newsletter porta in fondo un collegamento personale:
     https://nextgenerationbusiness.it/newsletter/disiscriviti.html?e=<email>&t=<firma>
   La firma "t" e' un HMAC dell'indirizzo calcolato con un segreto che sta
   solo sul server: senza quello nessuno puo' disiscrivere gli altri e
   nessuno puo' provare indirizzi a caso per scoprire chi e' iscritto
   (a firma sbagliata si risponde sempre allo stesso modo).

   Accetta:
     - POST JSON {email, token, azione:'disiscrivi'|'riattiva'} -> la pagina pubblica;
     - POST "List-Unsubscribe=One-Click" con i parametri nell'indirizzo ->
       il pulsante "Annulla iscrizione" di Gmail/Apple Mail, che invia da solo
       una POST senza aprire niente (RFC 8058);
     - GET con e/t -> rimanda alla pagina di conferma. Una GET non disiscrive
       mai da sola: i controlli antivirus dei client aprono i collegamenti.

   Scrive con l'account di servizio (Admin SDK): le regole di Firestore non
   entrano in gioco e dal browser nessuno puo' toccare la collezione a mano.
   ============================================================ */

const N = require('../lib/newsletter');

/* --- limite per indirizzo IP: l'endpoint e' pubblico --- */
const RL_FINESTRA_MS = 10 * 60 * 1000;
const RL_MAX = 30;
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

module.exports = async (req, res) => {
    // pagina pubblica: la puo' chiamare qualunque origine
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    const q = req.query || {};
    const corpo = typeof req.body === 'string'
        ? (() => { try { return JSON.parse(req.body || '{}'); } catch (_) { return {}; } })()
        : (req.body || {});

    // GET: nessuna disiscrizione automatica, si manda alla pagina di conferma
    if (req.method === 'GET') {
        const e = encodeURIComponent(String(q.e || q.email || ''));
        const t = encodeURIComponent(String(q.t || q.token || ''));
        const c = q.c ? '&c=' + encodeURIComponent(String(q.c)) : '';
        res.writeHead(302, { Location: N.PAGINA_DISISCRIZIONE + '?e=' + e + '&t=' + t + c });
        res.end();
        return;
    }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito' }); return; }

    try {
        const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
        if (troppi(ip)) { res.status(429).json({ ok: false, msg: 'Troppe richieste ravvicinate.' }); return; }

        const email = String(corpo.email || corpo.e || q.e || q.email || '').trim().toLowerCase();
        const token = String(corpo.token || corpo.t || q.t || q.token || '').trim();
        // il pulsante dei client di posta manda "List-Unsubscribe=One-Click": e' sempre una disiscrizione
        const unClic = String(corpo['List-Unsubscribe'] || '') === 'One-Click';
        const azione = unClic ? 'disiscrivi' : (String(corpo.azione || 'disiscrivi') === 'riattiva' ? 'riattiva' : 'disiscrivi');

        if (!N.EMAIL_RE.test(email) || !token) { res.status(400).json({ ok: false, msg: 'Richiesta incompleta.' }); return; }
        if (!N.firmaValida(email, token)) {
            // messaggio unico: non fa capire se l'indirizzo esiste
            res.status(403).json({ ok: false, msg: 'Collegamento non valido o scaduto. Scrivi a info@nextgenerationbusiness.it e provvediamo noi.' });
            return;
        }

        N.initAdmin();
        const db = N.admin.firestore();
        const ref = db.collection('newsletterDisiscritti').doc(email);

        /* Si LEGGE prima di scrivere. Il collegamento non scade e ce l'ha ogni
           destinatario: se ogni richiesta scrivesse (anche solo per aggiornare
           l'ora), riaprire lo stesso collegamento a ripetizione consumerebbe la
           quota giornaliera di scritture del database e bloccherebbe tutta
           l'area riservata. Una lettura costa molto meno e nel caso normale
           (gia' disiscritto, oppure mai iscritto e si chiede la riattivazione)
           non si scrive niente del tutto. */
        const attuale = await ref.get();

        if (azione === 'riattiva') {
            if (attuale.exists) await ref.delete();
            res.status(200).json({ ok: true, stato: 'iscritto' });
            return;
        }

        if (attuale.exists) { res.status(200).json({ ok: true, stato: 'disiscritto' }); return; }
        await ref.set({
            email: email,
            quando: Date.now(),
            campagna: String(corpo.campagna || q.c || '').slice(0, 120),
            origine: unClic ? 'un-clic' : 'pagina'
        });
        res.status(200).json({ ok: true, stato: 'disiscritto' });
    } catch (e) {
        console.error('Disiscrizione non riuscita:', String((e && e.message) || e).slice(0, 200));
        res.status(500).json({ ok: false, msg: 'Operazione non riuscita. Riprova o scrivi a info@nextgenerationbusiness.it' });
    }
};
