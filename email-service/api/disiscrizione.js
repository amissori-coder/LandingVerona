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
const F = require('../lib/frequenza');

/* --- limiti: l'endpoint e' pubblico ---
   Per indirizzo IP sulle richieste senza una firma valida; per indirizzo
   email su quelle firmate (vedi nel gestore). */
const RL_FINESTRA_MS = 10 * 60 * 1000;
const RL_MAX = 30;          // richieste non firmate per IP
const RL_FIRMATE_MAX = 12;  // richieste firmate per indirizzo email
// il conteggio sta su Firestore, uguale per tutte le istanze: vedi lib/frequenza.js

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
        // admin serve al freno e alla scrittura: pronto una volta per tutte
        N.initAdmin();
        const db = N.admin.firestore();

        const email = String(corpo.email || corpo.e || q.e || q.email || '').trim().toLowerCase();
        const token = String(corpo.token || corpo.t || q.t || q.token || '').trim();
        // il pulsante dei client di posta manda "List-Unsubscribe=One-Click": e' sempre una disiscrizione
        const unClic = String(corpo['List-Unsubscribe'] || '') === 'One-Click';
        const azione = unClic ? 'disiscrivi' : (String(corpo.azione || 'disiscrivi') === 'riattiva' ? 'riattiva' : 'disiscrivi');

        /* Il freno per IP (lib/frequenza.js, conteggio su Firestore) vale per le
           richieste SENZA una firma valida: e' li' che serve, contro chi prova
           indirizzi o firme a tappeto. Una richiesta con la firma giusta e' gia'
           autenticata e non va contata: il pulsante "Annulla iscrizione" dei
           programmi di posta (One-Click, RFC 8058) parte dai server del provider,
           con un indirizzo IP condiviso fra migliaia di destinatari; contando
           anche quelle, dopo una newsletter la trentunesima disiscrizione
           legittima in dieci minuti verrebbe rifiutata senza che nessuno se ne
           accorga. Le richieste firmate si contano invece per INDIRIZZO EMAIL:
           chi ha la firma agisce solo sul proprio indirizzo, e dodici cambi
           d'idea in dieci minuti bastano a chiunque. Senza questo conto, un solo
           collegamento valido basterebbe per far scrivere il database senza
           limite alternando disiscrivi e riattiva, e consumare la quota
           giornaliera che tiene in piedi l'area riservata. */
        const firmaOk = N.EMAIL_RE.test(email) && !!token && N.firmaValida(email, token);
        if (!firmaOk) {
            if (await F.troppeRichieste(db, 'disiscrizione', ip, { finestraMs: RL_FINESTRA_MS, massimo: RL_MAX })) {
                res.status(429).json({ ok: false, msg: 'Troppe richieste ravvicinate.' }); return;
            }
            if (!N.EMAIL_RE.test(email) || !token) { res.status(400).json({ ok: false, msg: 'Richiesta incompleta.' }); return; }
            // messaggio unico: non fa capire se l'indirizzo esiste
            res.status(403).json({ ok: false, msg: 'Collegamento non valido o scaduto. Scrivi a info@nextgenerationbusiness.it e provvediamo noi.' });
            return;
        }
        if (await F.troppeRichieste(db, 'disiscrizione-firmata', email, { finestraMs: RL_FINESTRA_MS, massimo: RL_FIRMATE_MAX })) {
            res.status(429).json({ ok: false, msg: 'Troppe richieste ravvicinate.' }); return;
        }

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
