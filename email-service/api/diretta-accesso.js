/* ============================================================
   Diretta degli eventi: l'accesso (funzione PUBBLICA)
   ------------------------------------------------------------
   POST JSON, un'azione per chiamata:
     { azione: 'entra', nomeUtente, password, idEvento? }
         -> { ok, token, sessione, idEvento, nome, cognome, nomeUtente }
            (la pagina entra in Firebase con signInWithCustomToken)
            errori: 401 'credenziali' (con i tentativi rimasti),
                    429 'attendi' (con attesaSecondi), 403 'disattivato',
                    503 'riprova'
     { azione: 'password-dimenticata', identificativo }  (nome utente o email)
         -> sempre { ok, msg } uguale, dopo lo stesso tempo
     { azione: 'gestore-accesso', email }
         -> sempre { ok, msg } uguale, dopo lo stesso tempo
     { azione: 'aggiorna-permessi' }  con Authorization: Bearer <idToken>
         -> { ok, aggiornati }

   La logica sta in lib/diretta-accesso.js: qui solo la porta (CORS,
   metodo, lettura del corpo, risposta). Nessuna risposta si salva nelle
   cache: contengono token o dicono qualcosa di un account.
   ============================================================ */
'use strict';
const C = require('../lib/diretta-comune');
const D = require('../lib/diretta-dati');
const A = require('../lib/diretta-accesso');
const { contesto } = require('../lib/diretta-firebase');

module.exports = async (req, res) => {
    if (C.cors(req, res, 'POST')) return;
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.status(405).json({ ok: false, codice: 'metodo', msg: 'Metodo non consentito' }); return; }
    const b = C.corpo(req);
    const azione = String(b.azione || '');
    try {
        const ctx = contesto();
        const ip = C.ipDi(req);
        let risposta;
        if (azione === 'entra') {
            risposta = await A.entra(ctx, {
                nomeUtente: b.nomeUtente, password: b.password, idEvento: b.idEvento,
                ip: ip, userAgent: (req.headers || {})['user-agent']
            });
        } else if (azione === 'password-dimenticata') {
            risposta = await A.passwordDimenticata(ctx, { identificativo: b.identificativo, ip: ip });
        } else if (azione === 'gestore-accesso') {
            risposta = await A.gestoreAccesso(ctx, { email: b.email, ip: ip });
        } else if (azione === 'aggiorna-permessi') {
            risposta = await A.aggiornaPermessi(ctx, req);
        } else {
            throw C.errore(400, 'Azione sconosciuta', 'azione');
        }
        res.status(200).json(Object.assign({ ok: true }, risposta));
    } catch (e) {
        D.rispondi(res, e, 'accesso ' + azione.slice(0, 30));
    }
};
