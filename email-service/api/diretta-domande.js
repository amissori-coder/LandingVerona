/* ============================================================
   Diretta degli eventi: le DOMANDE AL RELATORE
   ------------------------------------------------------------
   POST JSON con Authorization: Bearer <idToken>, un'azione per chiamata.

   Dalla pagina della diretta (il PARTECIPANTE, con il suo token):
     { azione: 'invia', idEvento, testo, sessione }
         -> { ok, domanda: { id, testo, quando, risposta }, aperte }
            errori: 400 'testo' (vuota, troppo lunga, troppe righe),
                    401, 403 'non-iscritto'/'disattivato'/'altro-dispositivo',
                    409 'domande-chiuse' (dopo «Termina»),
                    429 'attendi' (una ogni 8 secondi, 20 all'ora)
     { azione: 'mie', idEvento, sessione }
         -> { ok, domande: [{ id, testo, quando, risposta }], aperte }

   Dalla pagina del relatore (/diretta/relatore/: un partecipante segnato
   come RELATORE di quell'evento, con il suo token della diretta, oppure
   un gestore):
     { azione: 'eventi' }
         -> { ok, eventi: [{ id, titolo, data, oraInizio, oraFine, stato, ... }], ruolo, email }
     { azione: 'elenco', idEvento }
         -> { ok, evento, domande: [{ id, testo, quando, nome, cognome,
              azienda, risposta, rispostaQuando }], conteggi, aggiornato }
     { azione: 'segna', idEvento, idDomanda, risposta: true|false }
         -> { ok, domanda }
     { azione: 'partecipanti', idEvento }
         -> { ok, partecipanti: [{ nome, cognome, azienda, collegato }],
              conteggi: { iscritti, collegati }, aggiornato }
     errori: 401, 403 'non-relatore'/'disattivato', 404 'evento'/'domanda'

   La regia vede e segna le stesse domande dalla gestione (azioni
   'domande' e 'domanda-segna' di api/diretta-gestione.js). La logica sta
   in lib/diretta-domande.js; qui solo la porta. Nessuna risposta si
   salva nelle cache.
   ============================================================ */
'use strict';
const C = require('../lib/diretta-comune');
const D = require('../lib/diretta-dati');
const Q = require('../lib/diretta-domande');
const { contesto } = require('../lib/diretta-firebase');

const AZIONI = {
    'invia': (ctx, req, b) => Q.invia(ctx, req, b),
    'mie': (ctx, req, b) => Q.mie(ctx, req, b),
    'eventi': async (ctx, req) => Q.eventiDi(ctx, await Q.relatore(ctx, req, null)),
    'elenco': async (ctx, req, b) => Q.elenco(ctx, b.idEvento, await Q.relatore(ctx, req, D.controllaIdEvento(b.idEvento))),
    'segna': async (ctx, req, b) => Q.segna(ctx, { idEvento: b.idEvento, idDomanda: b.idDomanda, risposta: b.risposta },
        await Q.relatore(ctx, req, D.controllaIdEvento(b.idEvento))),
    'partecipanti': async (ctx, req, b) => Q.partecipanti(ctx, b.idEvento, await Q.relatore(ctx, req, D.controllaIdEvento(b.idEvento)))
};

module.exports = async (req, res) => {
    if (C.cors(req, res, 'POST')) return;
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.status(405).json({ ok: false, codice: 'metodo', msg: 'Metodo non consentito' }); return; }
    const b = C.corpo(req);
    const azione = String(b.azione || '');
    try {
        const fn = Object.prototype.hasOwnProperty.call(AZIONI, azione) ? AZIONI[azione] : null;
        if (!fn) throw C.errore(400, 'Azione sconosciuta', 'azione');
        const r = (await fn(contesto(), req, b)) || {};
        res.status(200).json(Object.assign({}, r, { ok: true }));
    } catch (e) {
        D.rispondi(res, e, 'domande ' + azione.slice(0, 30));
    }
};
