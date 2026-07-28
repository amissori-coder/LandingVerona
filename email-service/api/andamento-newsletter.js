/* ============================================================
   Come e' andato un invio della newsletter
   ------------------------------------------------------------
   Restituisce, per una o piu' etichette di invio, quante mail Brevo
   ha accettato, consegnate, aperte e cliccate.

   Due scelte che vale la pena spiegare, perche' non sono ovvie.

   1) Si interroga l'AGGREGATO (/smtp/statistics/aggregatedReport) e non
      l'elenco degli eventi (/smtp/statistics/events). L'elenco degli
      eventi restituisce una riga per evento, e ogni riga contiene
      l'indirizzo del destinatario: sarebbe l'elenco di chi apre le
      nostre mail, che non serve a nessuno qui dentro e che questo
      servizio non deve nemmeno maneggiare. L'aggregato risponde con una
      riga di soli numeri. In cambio si rinuncia a contare a parte le
      aperture fatte dai filtri antispam (loadedByProxy), che l'aggregato
      non espone: per questo i numeri delle aperture NON vanno mai
      presentati come "persone che hanno letto".

   2) Si tiene una cache a due livelli. Gli endpoint /v3/smtp/... di Brevo
      hanno una quota di 300 chiamate l'ORA, condivisa con la lettura
      della blocklist che la sezione Newsletter fa gia' per conto suo. Una
      pagina che interroga Brevo a ogni apertura brucerebbe la quota e
      farebbe smettere di funzionare anche il resto. Quindi: memoria della
      singola istanza + collezione Firestore (le istanze su Vercel sono
      piu' d'una e non condividono la memoria), scadenza 10 minuti, e al
      massimo 3 letture fresche per richiesta.

   La risposta contiene SOLO numeri, stati e date. Nessun indirizzo, in
   nessun ramo, nemmeno in caso di errore.
   ============================================================ */

const N = require('../lib/newsletter');

const TTL_MS = 10 * 60 * 1000;        // quanto vale una lettura prima di rifarla
const PAUSA_ERRORE_MS = 60 * 1000;    // dopo un errore, silenzio su quel tag
const MAX_BLOCCHI = 8;                // quanti invii per richiesta
const MAX_FRESCHE = 3;                // quante letture vere a Brevo per richiesta
const FINESTRA_GIORNI = 90;           // quanto indietro guarda Brevo
const GIORNO_MS = 24 * 60 * 60 * 1000;

/* Data in forma AAAA-MM-GG. Brevo aggrega per giornate nel fuso del conto,
   non nel nostro: per questo la finestra parte dal giorno PRECEDENTE a quello
   di partenza, altrimenti un invio delle 23:40 rischia di restarne fuori. */
function giorno(ms) {
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}

/* Dalla risposta di Brevo ai nostri nomi. Ogni campo passa da Number(...)||0:
   la forma esatta della risposta non e' verificabile da qui, e un campo che
   arriva come stringa o non arriva affatto non deve produrre NaN a video. */
function numeri(d) {
    const n = k => Number(d && d[k]) || 0;
    return {
        richieste: n('requests'),
        consegnate: n('delivered'),
        rimbalziDuri: n('hardBounces'),
        rimbalziMorbidi: n('softBounces'),
        bloccate: n('blocked'),
        nonValide: n('invalid'),
        aperture: n('opens'),
        apertureUniche: n('uniqueOpens'),
        clic: n('clicks'),
        clicUnici: n('uniqueClicks'),
        spam: n('spamReports'),
        disiscritti: n('unsubscribed')
    };
}

// memoria della singola istanza: primo livello, gratis
let _mem = {};

async function daFirestore(db, tag) {
    try {
        const s = await db.collection('newsletterEsiti').doc(tag).get();
        return s.exists ? (s.data() || null) : null;
    } catch (e) { return null; }
}
async function inFirestore(db, tag, dati) {
    try { await db.collection('newsletterEsiti').doc(tag).set(dati, { merge: true }); }
    catch (e) { /* la cache che non si scrive non e' un guasto: si rilegge da Brevo */ }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito' }); return; }

    try {
        N.initAdmin();
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const aut = await N.autorizza(body.idToken);
        if (!aut.ok) { res.status(aut.stato).json({ ok: false, msg: aut.msg }); return; }

        const grezzi = Array.isArray(body.blocchi) ? body.blocchi.slice(0, MAX_BLOCCHI) : [];
        const richiesti = grezzi.map(b => ({
            // la chiave finisce in una richiesta a Brevo: si ripulisce, non ci si fida
            chiave: String((b && b.chiave) || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60),
            per: (b && b.per === 'campagna') ? 'campagna' : 'invio',
            dal: Number(b && b.dal) || 0
        })).filter(b => b.chiave);

        if (!richiesti.length) { res.status(400).json({ ok: false, msg: 'Nessun invio da guardare.' }); return; }

        /* Brevo spento: si dice, non si finge. Meglio "non disponibile" che una
           schermata di zeri, che chi legge scambierebbe per "non ha aperto nessuno". */
        if (!N.brevoAttivo()) {
            res.status(200).json({
                ok: true, fonte: 'nessuna', aggiornato: Date.now(), parziale: false,
                blocchi: richiesti.map(b => ({ chiave: b.chiave, per: b.per, stato: 'non-disponibile', msg: 'Brevo non e attivo per questo servizio.' }))
            });
            return;
        }

        const db = N.admin.firestore();
        const ora = Date.now();
        const oggi = giorno(ora);
        let fresche = 0, parziale = false, avviso = '';
        const blocchi = [];

        for (const b of richiesti) {
            const base = { chiave: b.chiave, per: b.per };

            // fuori dalla finestra interrogabile: Brevo non guarda oltre 90 giorni
            const inizio = (b.dal || ora) - GIORNO_MS;
            if ((ora - inizio) / GIORNO_MS > FINESTRA_GIORNI) {
                blocchi.push({ ...base, stato: 'fuori-finestra', msg: 'Brevo conserva ' + FINESTRA_GIORNI + ' giorni: gli esiti di questo invio non sono piu interrogabili.' });
                continue;
            }

            // 1) memoria dell'istanza
            let cache = _mem[b.chiave] || null;
            // 2) memoria condivisa su Firestore
            if (!cache || (ora - cache.quando) >= TTL_MS) {
                const f = await daFirestore(db, b.chiave);
                if (f && f.n && Number(f.quando)) cache = { quando: Number(f.quando), n: f.n, ultimoTentativo: Number(f.ultimoTentativo) || 0 };
            }
            const fresca = cache && (ora - cache.quando) < TTL_MS;
            const inPausa = cache && cache.ultimoTentativo && (ora - cache.ultimoTentativo) < PAUSA_ERRORE_MS;

            if (fresca || inPausa || fresche >= MAX_FRESCHE) {
                if (cache && cache.n) {
                    if (!fresca) parziale = true;
                    blocchi.push({ ...base, stato: 'ok', aggiornato: cache.quando, dal: giorno(inizio), al: oggi, n: cache.n });
                } else {
                    // niente in cache e non si puo' chiedere adesso: lo si dice
                    parziale = true;
                    blocchi.push({ ...base, stato: 'attesa', msg: 'Non ancora letto: riprova fra poco.' });
                }
                continue;
            }

            // 3) lettura vera
            fresche++;
            let r;
            try {
                r = await N.chiamataBrevo('/smtp/statistics/aggregatedReport'
                    + '?startDate=' + encodeURIComponent(giorno(inizio))
                    + '&endDate=' + encodeURIComponent(oggi)
                    + '&tag=' + encodeURIComponent(b.chiave));
            } catch (e) {
                r = { ok: false, stato: 0, testo: String((e && e.message) || e) };
            }

            if (!r.ok) {
                const quota = r.stato === 429;
                if (quota && !avviso) avviso = 'Limite di frequenza di Brevo raggiunto: i numeri sono quelli dell\'ultima lettura riuscita.';
                await inFirestore(db, b.chiave, { tag: b.chiave, ultimoTentativo: ora, ultimoErrore: String(r.stato || 'rete') });
                if (cache && cache.n) {
                    parziale = true;
                    blocchi.push({ ...base, stato: 'ok', aggiornato: cache.quando, dal: giorno(inizio), al: oggi, n: cache.n });
                } else {
                    blocchi.push({ ...base, stato: 'errore', msg: quota ? 'Brevo ha risposto che sono troppe richieste: riprova fra qualche minuto.' : 'Brevo non ha risposto (' + (r.stato || 'rete') + ').' });
                }
                continue;
            }

            /* La forma della risposta non e' verificabile da qui: puo' essere un
               oggetto o un elenco con dentro un oggetto. Se non e' ne' l'uno ne'
               l'altro si dichiara errore, invece di leggere zeri da un oggetto
               che non c'e' e mostrarli come se fossero un risultato. */
            const d = Array.isArray(r.dati) ? r.dati[0] : r.dati;
            if (!d || typeof d !== 'object') {
                blocchi.push({ ...base, stato: 'errore', msg: 'Risposta di Brevo non riconosciuta.' });
                continue;
            }
            const n = numeri(d);
            _mem[b.chiave] = { quando: ora, n: n, ultimoTentativo: 0 };
            await inFirestore(db, b.chiave, { tag: b.chiave, quando: ora, n: n, ultimoTentativo: 0, ultimoErrore: '' });

            /* Zero richieste non vuol dire "non ha ricevuto nessuno": vuol dire che
               Brevo non ha ancora niente su quell'etichetta. Sono due cose diverse
               e vanno dette in modo diverso, altrimenti subito dopo un invio la
               sezione annuncia un disastro che non c'e'. */
            if (!n.richieste) {
                blocchi.push({ ...base, stato: 'attesa', aggiornato: ora, dal: giorno(inizio), al: oggi, msg: 'Brevo non riporta ancora nulla per questo invio.' });
                continue;
            }
            blocchi.push({ ...base, stato: 'ok', aggiornato: ora, dal: giorno(inizio), al: oggi, n: n });
        }

        // la memoria dell'istanza non deve crescere all'infinito
        const chiavi = Object.keys(_mem);
        if (chiavi.length > 200) {
            chiavi.forEach(k => { if ((ora - (_mem[k].quando || 0)) > TTL_MS * 6) delete _mem[k]; });
        }

        const risposta = {
            ok: true, fonte: 'brevo', aggiornato: ora,
            finestraGiorni: FINESTRA_GIORNI, parziale: parziale, blocchi: blocchi
        };
        if (avviso) risposta.avviso = avviso;
        res.status(200).json(risposta);
    } catch (e) {
        const motivo = String((e && e.message) || 'errore').slice(0, 200);
        console.error('Andamento newsletter: lettura non riuscita:', motivo);
        res.status(500).json({ ok: false, msg: motivo });
    }
};
