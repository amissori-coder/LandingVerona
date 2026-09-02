/* ============================================================
   Invio della newsletter (Area riservata Revilaw)
   ------------------------------------------------------------
   Questo file e' solo l'INVOLUCRO: verifica chi chiama, quanto
   spesso puo' chiamare, e passa il lavoro al motore condiviso
   (lib/invio-newsletter.js). Il motore sta fuori di qui perche'
   lo usa anche l'invio programmato, che parte da un lavoro
   automatico e non ha ne' una sessione da verificare ne' un
   utente a cui contare i gettoni.

   Differenza dalle comunicazioni: qui OGNI destinatario riceve una
   mail sua, perche' il collegamento per disiscriversi e' personale
   (firmato sul suo indirizzo). Niente copia nascosta, quindi, e
   nessuno vede gli indirizzi degli altri.

   Si invia a lotti: l'area riservata chiama piu' volte questo
   endpoint con un pezzo dell'elenco e mostra l'avanzamento. Cosi'
   nessuna richiesta resta appesa e, se qualcosa va storto a meta',
   si sa esattamente a chi era gia' partita.
   ============================================================ */

const N = require('../lib/newsletter');
const M = require('../lib/invio-newsletter');

/* Rate limit per mittente: e' un invio di massa, quindi il tetto e' sui LOTTI.
   Serve a evitare la partenza a raffica per errore, non a rallentare il lavoro.
   Resta qui e non nel motore: riguarda CHI invia, non COME si invia, e un
   lavoro programmato non deve consumare i gettoni di nessuno. */
const RL_PAUSA_MS = 2 * 1000;
const RL_MAX_ORA = 80;                // lotti/ora per utente
const RL_ORA_MS = 60 * 60 * 1000;
async function consumaGettone(email) {
    const ref = N.admin.firestore().collection('newsletter_throttle').doc(email);
    return N.admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const ora = Date.now();
        const d = snap.exists ? snap.data() : { inizioFinestra: 0, conteggio: 0, ultimo: 0 };
        const stessaFinestra = (ora - (d.inizioFinestra || 0)) < RL_ORA_MS;
        const conteggio = stessaFinestra ? (d.conteggio || 0) : 0;
        if ((ora - (d.ultimo || 0)) < RL_PAUSA_MS || conteggio >= RL_MAX_ORA) return false;
        tx.set(ref, { ultimo: ora, inizioFinestra: stessaFinestra ? d.inizioFinestra : ora, conteggio: conteggio + 1 }, { merge: true });
        return true;
    });
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

        /* prova: si manda solo a chi sta usando la sezione, con il suo collegamento
           vero (cosi' si puo' verificare anche la disiscrizione, e poi riattivarsi).
           A chi ha premuto davvero (aut.sessione): un collaboratore la prova la
           vuole nella propria casella, non in quella del suo riferimento. */
        const prova = body.prova === true;
        const destinatari = prova
            ? [{ email: aut.sessione || aut.email, nome: 'Prova', cognome: '' }]
            : (Array.isArray(body.destinatari) ? body.destinatari : []);

        /* Prima i controlli che non costano niente, POI il gettone: una richiesta
           malformata non deve consumarlo, altrimenti chi corregge l'errore si
           ritrova bloccato per qualche secondo senza capire perche'. */
        const controllo = M.verificaLotto({ html: body.html, destinatari: destinatari });
        if (!controllo.ok) { res.status(controllo.stato || 400).json(controllo); return; }

        // il tetto sui gettoni vale solo per chi ha una sessione: un lavoro
        // programmato non deve consumare i gettoni di nessuno
        // il freno e' per persona: la sessione reale, non il riferimento del collaboratore
        const consentito = await consumaGettone(aut.sessione || aut.email);
        if (!consentito) {
            res.status(429).json({
                ok: false, msg: 'Troppi invii ravvicinati: attendi qualche secondo e riprova.',
                rimasti: controllo.destinatari
            });
            return;
        }

        const r = await M.inviaLotto({
            oggetto: body.oggetto, html: body.html, testo: body.testo,
            destinatari: destinatari,
            campagna: body.campagna, invio: body.invio,
            mittenteNome: body.mittenteNome,
            sandbox: body.sandbox === true,
            // in prova i disiscritti non si saltano: chi prova vuole vedere la mail,
            // anche se si e' disiscritto lui stesso per verificare il collegamento
            saltaDisiscritti: prova,
            rispostaA: aut.email
        });

        if (!r.ok) { res.status(r.stato || 502).json(r); return; }
        res.status(200).json(r);
    } catch (e) {
        console.error('Invio newsletter non riuscito:', e);
        res.status(500).json({ ok: false, msg: 'Invio non riuscito. Riprova.' });
    }
};
