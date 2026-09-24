/* ============================================================
   Diretta degli eventi: lo stato pubblico di un evento
   ------------------------------------------------------------
   GET /api/diretta-stato?evento=napoli-2026
     -> { ok, id, titolo, stato, inizio, fine, paginaEvento }
        (inizio e fine in millisecondi; MAI il video)

   La leggono il pulsante "Diretta" della pagina di Napoli e il popup
   della home (assets/diretta-stato.js), solo nel giorno dell'evento.
   Anche cosi' sono tante persone: la risposta si fa tenere in cache,
   dal browser (20 s) e dalla rete di Vercel (30 s, poi ancora un
   minuto mentre si aggiorna in sottofondo), e la funzione stessa tiene
   in memoria l'ultima lettura per 15 secondi. Una lettura di Firestore
   ogni tanto, qualunque sia il numero dei visitatori. Il rovescio: il
   bollino IN DIRETTA puo' arrivare con uno o due minuti di ritardo.

   Pubblica e senza credenziali: nessun CORS ristretto (chiunque puo'
   leggere uno stato che e' gia' pubblico), nessun dato personale. Gli
   altri parametri della richiesta si ignorano.
   ============================================================ */
'use strict';
const { contesto } = require('../lib/diretta-firebase');

const RE_ID = /^[a-z0-9-]{3,41}$/;
const MEMORIA_MS = 15 * 1000;
const MAX_MEMORIA = 100;
const CACHE_OK = 'public, max-age=20, s-maxage=30, stale-while-revalidate=60';
const CACHE_ASSENTE = 'public, max-age=60, s-maxage=60';

// idEvento -> { quando, stato HTTP, corpo }
const memoria = new Map();

function ms(v) {
    return v && typeof v.toMillis === 'function' ? v.toMillis() : (typeof v === 'number' ? v : null);
}

async function leggi(idEvento) {
    const ora = Date.now();
    const gia = memoria.get(idEvento);
    if (gia && ora - gia.quando < MEMORIA_MS) return gia;
    const snap = await contesto().db.collection('eventi').doc(idEvento).get();
    let voce;
    if (!snap.exists) {
        voce = { quando: ora, codice: 404, corpo: { ok: false, codice: 'non-trovato' } };
    } else {
        const d = snap.data();
        voce = {
            quando: ora, codice: 200,
            corpo: {
                ok: true, id: idEvento, titolo: String(d.titolo || ''), stato: String(d.stato || 'programmato'),
                inizio: ms(d.inizio), fine: ms(d.fine), paginaEvento: String(d.paginaEvento || '')
            }
        };
    }
    // la memoria non cresce senza limite (gli identificativi li sceglie chi chiama)
    if (memoria.size >= MAX_MEMORIA) memoria.delete(memoria.keys().next().value);
    memoria.set(idEvento, voce);
    return voce;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Max-Age', '600'); res.status(204).end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Cache-Control', 'no-store');
        res.status(405).json({ ok: false, codice: 'metodo', msg: 'Metodo non consentito' });
        return;
    }
    const idEvento = String((req.query || {}).evento || '').trim();
    if (!RE_ID.test(idEvento)) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(400).json({ ok: false, codice: 'evento', msg: 'Evento non valido' });
        return;
    }
    try {
        const voce = await leggi(idEvento);
        res.setHeader('Cache-Control', voce.codice === 200 ? CACHE_OK : CACHE_ASSENTE);
        res.status(voce.codice).json(voce.corpo);
    } catch (e) {
        console.error('[diretta] stato: ' + String((e && e.message) || e).slice(0, 200));
        res.setHeader('Cache-Control', 'no-store');
        res.status(500).json({ ok: false, codice: 'errore', msg: 'Stato non disponibile' });
    }
};
