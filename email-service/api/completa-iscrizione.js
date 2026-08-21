/* ============================================================
   Completamento dei dati di un'iscrizione manuale (endpoint PUBBLICO)
   ------------------------------------------------------------
   Un'iscrizione inserita a mano (arrivata da Eventbrite o da un'altra
   piattaforma) spesso ha i soli dati dell'intestatario, e puo' coprire
   piu' posti. L'area riservata manda all'intestatario una mail con un
   collegamento personale:

     https://nextgenerationbusiness.it/completa_iscrizione/?d=<idDoc>&t=<firma>

   La firma "t" e' un HMAC dell'identificativo del documento, calcolato
   con lo stesso segreto della disiscrizione ma con un contesto diverso:
   il collegamento apre SOLO quella scheda, e nessuno puo' fabbricarne
   uno per le altre. A firma sbagliata si risponde sempre allo stesso
   modo, senza far capire se la scheda esiste.

   Azioni (POST JSON):
     - "leggi": restituisce evento, numero di posti e i dati gia' noti
       dell'intestatario, per precompilare il modulo;
     - "salva": riceve un elenco di partecipanti. Il PRIMO aggiorna la
       scheda originale (mai l'email, che e' l'identita' della scheda e
       l'indirizzo a cui e' arrivato il collegamento); gli altri
       diventano SCHEDE PROPRIE con documenti dal nome fisso
       (<idDoc>~p2, ~p3...), cosi' un secondo invio sovrascrive invece
       di duplicare. I posti si RIPARTISCONO senza mai cambiare il
       totale: la scheda originale tiene i posti non ancora nominati
       (ordine da 3, un solo nome in piu' -> originale 2, nuova 1), e i
       figli oltre l'ultimo invio vengono tolti. Nessun doppio conteggio,
       qualunque cosa faccia chi compila.
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

const MSG_LINK = 'Collegamento non valido o scaduto. Scrivi a info@nextgenerationbusiness.it e provvediamo noi.';
const MAX_PART = 99;

function pulisci(p) {
    const t = (v, max) => N.testo(v, max);
    return {
        nome: t(p.nome, 120), cognome: t(p.cognome, 120),
        email: t(p.email, 200).toLowerCase(),
        azienda: t(p.azienda, 200), ruolo: t(p.ruolo, 200), telefono: t(p.telefono, 60)
    };
}
function vuoto(p) { return !p.nome && !p.cognome && !p.email && !p.azienda && !p.telefono; }

/* La lettura confronta questo numero per capire se rileggere l'archivio. */
async function segnaCambiamento(db) {
    try {
        await db.collection('meta').doc('iscrizioni')
            .set({ rev: N.admin.firestore.FieldValue.increment(1), quando: Date.now() }, { merge: true });
    } catch (e) { /* non e' grave: la lettura ha comunque una scadenza a tempo */ }
}

module.exports = async (req, res) => {
    // pagina pubblica: la puo' chiamare qualunque origine
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito' }); return; }

    try {
        const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
        if (troppi(ip)) { res.status(429).json({ ok: false, msg: 'Troppe richieste ravvicinate: riprova fra qualche minuto.' }); return; }

        const corpo = typeof req.body === 'string'
            ? (() => { try { return JSON.parse(req.body || '{}'); } catch (_) { return {}; } })()
            : (req.body || {});
        const idDoc = String(corpo.d || '').slice(0, 400);
        const token = String(corpo.t || '').trim();
        if (!idDoc || !token || !N.firmaCompletaValida(idDoc, token)) {
            res.status(403).json({ ok: false, msg: MSG_LINK });
            return;
        }

        N.initAdmin();
        const db = N.admin.firestore();
        const rif = db.collection('iscrizioni').doc(idDoc);
        const snap = await rif.get();
        // scheda sparita (cancellata dall'area riservata): stessa risposta del
        // collegamento sbagliato, per non dire niente a chi tira a indovinare
        if (!snap.exists) { res.status(403).json({ ok: false, msg: MSG_LINK }); return; }
        const scheda = snap.data() || {};
        // il totale dei posti dell'ordine NON cambia mai: alla prima ripartizione
        // si mette da parte, perche' "partecipanti" della scheda da li' in poi
        // conta solo i posti non ancora nominati
        const nOrdine = Math.min(MAX_PART, Math.max(1,
            parseInt(scheda.partecipantiOrdine, 10) || parseInt(scheda.partecipanti, 10) || 1));

        const azione = String(corpo.azione || 'leggi');

        if (azione === 'leggi') {
            res.status(200).json({
                ok: true,
                pagina: String(scheda.pagina || ''),
                partecipanti: nOrdine,
                completato: !!scheda.completato,
                capofila: {
                    nome: String(scheda.nome || ''), cognome: String(scheda.cognome || ''),
                    email: String(scheda.email || ''),
                    azienda: String(scheda.azienda || ''), ruolo: String(scheda.ruolo || ''),
                    telefono: String(scheda.telefono || '')
                }
            });
            return;
        }

        if (azione !== 'salva') { res.status(400).json({ ok: false, msg: 'Azione non riconosciuta.' }); return; }

        // al massimo i posti dell'ordine: i partecipanti in piu' non entrano,
        // perche' e' cosi' che il totale non puo' crescere da questo modulo
        const grezzi = Array.isArray(corpo.partecipanti) ? corpo.partecipanti.slice(0, nOrdine) : [];
        const lista = grezzi.map(p => pulisci(p && typeof p === 'object' ? p : {})).filter(p => !vuoto(p));
        if (!lista.length) { res.status(400).json({ ok: false, msg: 'Compila almeno i dati di un partecipante.' }); return; }
        for (const p of lista) {
            if (p.email && !N.EMAIL_RE.test(p.email)) {
                res.status(400).json({ ok: false, msg: 'Uno degli indirizzi email non sembra valido: ' + p.email }); return;
            }
            if (!p.nome && !p.cognome && !p.email) {
                res.status(400).json({ ok: false, msg: 'Per ogni partecipante servono almeno nome e cognome, oppure l\'email.' }); return;
            }
        }

        /* Il primo della lista e' l'intestatario: aggiorna la scheda originale.
           L'email NON si tocca: e' l'identita' della scheda (le presenze sono
           agganciate li') e l'indirizzo a cui e' arrivato questo collegamento. */
        const primo = lista[0];
        const figli = lista.slice(1);
        // la scheda originale tiene i posti non ancora nominati: mai sotto 1
        const restanti = Math.max(1, nOrdine - figli.length);
        await rif.set({
            nome: primo.nome, cognome: primo.cognome,
            azienda: primo.azienda, ruolo: primo.ruolo, telefono: primo.telefono,
            partecipanti: restanti,
            partecipantiOrdine: nOrdine,
            extra: { Partecipanti: String(restanti) },
            completato: { quando: Date.now(), partecipanti: lista.length }
        }, { merge: true });

        // ogni altro partecipante diventa una scheda propria, con un posto solo.
        // I nomi dei documenti sono FISSI (idDoc~p2, ~p3...): rimandare il modulo
        // sovrascrive le stesse schede invece di crearne di nuove.
        const etichettaPortale = (scheda.extra && scheda.extra.Portale) || scheda.portaleNome || '';
        let batch = db.batch();
        figli.forEach((p, i) => {
            batch.set(db.collection('iscrizioni').doc(idDoc + '~p' + (i + 2)), {
                data: String(scheda.data || ''),
                pagina: String(scheda.pagina || ''),
                nome: p.nome, cognome: p.cognome, email: p.email,
                azienda: p.azienda, ruolo: p.ruolo, telefono: p.telefono,
                messaggio: '',
                portale: String(scheda.portale || ''),
                portaleNome: etichettaPortale,
                partecipanti: 1,
                extra: Object.assign({ Partecipanti: '1' }, etichettaPortale ? { Portale: etichettaPortale } : {}),
                origine: 'partecipante',
                gruppo: idDoc,
                ricevuto: N.admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
        // i figli oltre l'ultimo invio si tolgono: se prima erano stati indicati
        // tre nomi e ora due, il terzo non deve restare a gonfiare l'elenco
        for (let i = figli.length + 2; i <= nOrdine; i++) {
            batch.delete(db.collection('iscrizioni').doc(idDoc + '~p' + i));
        }
        await batch.commit();
        await segnaCambiamento(db);

        res.status(200).json({ ok: true, salvati: lista.length, posti: nOrdine });
    } catch (e) {
        console.error('Completamento iscrizione non riuscito:', String((e && e.message) || e).slice(0, 200));
        res.status(500).json({ ok: false, msg: 'Operazione non riuscita. Riprova o scrivi a info@nextgenerationbusiness.it' });
    }
};
