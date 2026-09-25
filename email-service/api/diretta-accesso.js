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
     { azione: 'link-video', idEvento, sorgente, sessione }  con Authorization: Bearer <idToken>
         -> { ok, url, scade, validoSecondi }   il link del flusso
            diretto (principale o 'riserva'), firmato se la web TV usa i
            link firmati; solo quando l'evento usa il flusso diretto
            (tipoPlayer 'flusso': con il player Azoto la pagina non lo
            chiede, e la risposta e' 409 'non-flusso'); scade in
            millisecondi sull'orologio del servizio,
            validoSecondi i secondi di validita' da adesso (per
            l'orologio della pagina); null tutti e due senza firma. Solo
            a chi e' iscritto, con l'account attivo, dal dispositivo
            ammesso (sessione: quella data all'accesso, se l'evento vuole
            un solo dispositivo), mentre l'evento e' in onda; 60 l'ora.
            errori: 401, 403 'non-iscritto'/'disattivato'/
                    'altro-dispositivo', 409 'non-in-onda'/'non-flusso',
                    404 'nessun-link', 429 'attendi'

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
        } else if (azione === 'link-video') {
            risposta = await A.linkVideo(ctx, req, b);
        } else {
            throw C.errore(400, 'Azione sconosciuta', 'azione');
        }
        res.status(200).json(Object.assign({ ok: true }, risposta));
    } catch (e) {
        D.rispondi(res, e, 'accesso ' + azione.slice(0, 30));
    }
};
