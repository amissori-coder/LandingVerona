/* ============================================================
   Diretta degli eventi: la gestione (solo GESTORI)
   ------------------------------------------------------------
   POST JSON con Authorization: Bearer <idToken del gestore>. Passa
   solo un account con l'email nell'elenco DIRETTA_ADMIN_EMAILS,
   verificata, con il claim "gestore" (lo mette solo 'gestore-accesso'
   di diretta-accesso) e un token non revocato: vedi verificaGestore in
   lib/diretta-comune.js.

   Le azioni (campo `azione`) e dove sta la logica:
     chi-sono, eventi, evento-salva, evento-stato, evento-video,
     evento-sorgente, evento-avviso, link-firmato, anteprima, crea,
     partecipanti, partecipante, connessi, esporta
                                               -> lib/diretta-dati.js
     prova-link                                -> lib/diretta-prova-link.js
     email-prova, email-accoda, email-avanza,
     email-stato, email-esiti                  -> lib/diretta-invio.js

   Il video (arriva SOLO dalla web TV):
     evento-salva     evento: { ..., videoUrl, riservaUrl, firma }
                      (riservaUrl '' toglie la riserva, assente la
                      lascia; firma { schema, segreto?, durataOre?,
                      parametri? }: la chiave non torna MAI indietro,
                      la risposta dice solo firma.segretoImpostato)
     evento-video     { idEvento, videoUrl, videoId?, riservaUrl? }
     evento-sorgente  { idEvento, sorgente: 'principale'|'riserva' }
                      la regia sceglie per tutti quale link usare
     prova-link       { link, idEvento? } -> { esito, tipo, valore,
                      titolo, righe, problemi, info, urlProva }: la
                      prova del link prima di salvarlo (al massimo 30
                      al minuto per gestore; con idEvento si prova il
                      link firmato come lo ricevera' chi guarda)
     link-firmato     { idEvento, sorgente } -> { url, scade }
                      per l'anteprima della regia
   Il modulo delle email si carica solo quando serve (e' un file a parte:
   se mancasse, il resto della gestione funziona lo stesso).
   ============================================================ */
'use strict';
const C = require('../lib/diretta-comune');
const D = require('../lib/diretta-dati');
const F = require('../lib/diretta-firma');
const PL = require('../lib/diretta-prova-link');
const { contesto } = require('../lib/diretta-firebase');

const TIPI_PROVA = ['credenziali', 'promemoria-giorno', 'promemoria-ora'];
const CHI_ACCODA = ['da-inviare', 'non-ricevuta'];
const PROVE_LINK_MINUTO = 30;

function invio() {
    try {
        return require('../lib/diretta-invio');
    } catch (e) {
        if (e && e.code === 'MODULE_NOT_FOUND' && /diretta-invio/.test(String(e.message))) {
            throw C.errore(503, 'L\'invio delle email non è ancora disponibile.', 'invio-assente');
        }
        throw e;
    }
}

/* verificaGestore, con un messaggio utile quando l'email e' giusta ma
   l'account di gestione non e' ancora stato attivato (niente claim o
   email non verificata: per esempio chi si e' registrato da solo). Il
   token in quel punto e' gia' stato verificato: leggerne il contenuto
   serve solo a scegliere la frase. */
async function gestore(ctx, req) {
    try {
        return await C.verificaGestore(ctx, req);
    } catch (e) {
        if (e && e.stato === 403) {
            const m = /^Bearer\s+(.+)$/i.exec(String((req.headers || {}).authorization || ''));
            let t = {};
            try { t = JSON.parse(Buffer.from(String(m && m[1]).split('.')[1] || '', 'base64url').toString('utf8')) || {}; } catch (_) { /* niente */ }
            if (C.eGestore(t.email) && (t.gestore !== true || t.email_verified !== true)) {
                throw C.errore(403, 'Usa «Primo accesso o password dimenticata» per attivare l\'account di gestione.', 'da-attivare');
            }
            throw C.errore(403, 'Questo account non è tra i gestori della diretta.', 'non-gestore');
        }
        throw e;
    }
}

/* prova-link: il servizio scarica il link e dice che cosa ha capito.
   Con idEvento, se l'evento usa i link firmati, si prova il link
   firmato (come lo ricevera' chi guarda). Un tetto per gestore: ogni
   prova sono fino a qualche richiesta verso l'esterno. */
async function provaLink(ctx, b, g) {
    if (!await C.consumaGettone(ctx, 'limiti', 'provalink_' + g.uid, { maxFinestra: PROVE_LINK_MINUTO, finestraMs: 60 * 1000 })) {
        throw D.errorePubblico(429, 'attendi', 'Troppe prove di link in un minuto: riprova tra poco.', { attesaSecondi: 60 });
    }
    let firma = null;
    if (b.idEvento) {
        const id = D.controllaIdEvento(b.idEvento);
        const ris = await ctx.db.collection('eventiRiservati').doc(id).get();
        const f = F.pulita(ris.exists ? ris.data().firma : null);
        if (F.attiva(f)) firma = url => F.firma(url, f, ctx.adesso()).url;
    }
    return PL.provaLink(b.link, { firma: firma || undefined });
}

const AZIONI = {
    'chi-sono': async (ctx, b, g) => ({ email: g.email }),
    'eventi': async ctx => ({ eventi: await D.elencoEventi(ctx) }),
    'evento-salva': async (ctx, b) => ({ evento: await D.salvaEvento(ctx, b.evento) }),
    'evento-stato': async (ctx, b) => ({ evento: await D.cambiaStato(ctx, { idEvento: b.idEvento, stato: b.stato, ripresa: b.ripresa }) }),
    'evento-video': async (ctx, b) => ({ evento: await D.cambiaVideo(ctx, { idEvento: b.idEvento, videoUrl: b.videoUrl, videoId: b.videoId, riservaUrl: b.riservaUrl }) }),
    'evento-sorgente': async (ctx, b) => ({ evento: await D.cambiaSorgente(ctx, { idEvento: b.idEvento, sorgente: b.sorgente }) }),
    'link-firmato': async (ctx, b) => D.linkVideo(ctx, { idEvento: b.idEvento, sorgente: b.sorgente, soloInOnda: false }),
    'prova-link': async (ctx, b, g) => provaLink(ctx, b, g),
    'evento-avviso': async (ctx, b) => ({ evento: await D.cambiaAvviso(ctx, { idEvento: b.idEvento, avviso: b.avviso }) }),
    'anteprima': async (ctx, b) => D.anteprima(ctx, { idEvento: b.idEvento, emails: b.emails, basi: b.basi, nomi: b.nomi }),
    'crea': async (ctx, b) => D.crea(ctx, { idEvento: b.idEvento, righe: b.righe }),
    'partecipanti': async (ctx, b) => ({ partecipanti: await D.elencoPartecipanti(ctx, b.idEvento) }),
    'partecipante': async (ctx, b) => D.operazionePartecipante(ctx, b),
    'connessi': async (ctx, b) => D.connessi(ctx, b.idEvento),
    'esporta': async (ctx, b) => D.esporta(ctx, b.idEvento),

    'email-prova': async (ctx, b, g) => {
        const idEvento = D.controllaIdEvento(b.idEvento);
        const tipo = TIPI_PROVA.indexOf(b.tipo) >= 0 ? b.tipo : 'credenziali';
        return invio().inviaProva(ctx, { a: g.email, idEvento: idEvento, tipo: tipo });
    },
    'email-accoda': async (ctx, b) => {
        const idEvento = D.controllaIdEvento(b.idEvento);
        if (CHI_ACCODA.indexOf(b.chi) < 0) throw C.errore(400, 'A chi mandare le credenziali?', 'chi');
        return invio().accoda(ctx, { idEvento: idEvento, chi: b.chi });
    },
    'email-avanza': async (ctx, b) => invio().avanzaCoda(ctx, { idEvento: D.controllaIdEvento(b.idEvento), budgetMs: 40000 }),
    'email-stato': async (ctx, b) => invio().statoCoda(ctx, { idEvento: D.controllaIdEvento(b.idEvento) }),
    'email-esiti': async (ctx, b) => invio().aggiornaEsiti(ctx, { idEvento: D.controllaIdEvento(b.idEvento) })
};

module.exports = async (req, res) => {
    if (C.cors(req, res, 'POST')) return;
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.status(405).json({ ok: false, codice: 'metodo', msg: 'Metodo non consentito' }); return; }
    const b = C.corpo(req);
    const azione = String(b.azione || '');
    try {
        const ctx = contesto();
        const g = await gestore(ctx, req);
        const fn = Object.prototype.hasOwnProperty.call(AZIONI, azione) ? AZIONI[azione] : null;
        if (!fn) throw C.errore(400, 'Azione sconosciuta', 'azione');
        const r = (await fn(ctx, b, g)) || {};
        // l'invio delle email puo' rispondere { ok: false, ... }: passa cosi' com'e'
        if (r.ok === false) { res.status(502).json(Object.assign({ codice: 'invio', msg: 'Invio non riuscito.' }, r)); return; }
        res.status(200).json(Object.assign({}, r, { ok: true }));
    } catch (e) {
        // i gestori vedono anche il motivo degli errori previsti del servizio (per esempio dell'invio)
        D.rispondi(res, e, 'gestione ' + azione.slice(0, 30), true);
    }
};
