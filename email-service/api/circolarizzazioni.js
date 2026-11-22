/* ============================================================
   Circolarizzazioni via PEC (Strumenti di revisione)
   ------------------------------------------------------------
   La porta unica della funzione con cui i team di revisione
   mandano le lettere di circolarizzazione dall'area riservata:
   una PEC per destinatario dalla casella dedicata (CIRC_PEC_*),
   la lettera in PDF, fino a due solleciti programmati, le
   ricevute del gestore e le risposte dei terzi.

   POST (area riservata): { azione, idToken, ... }. Chi chiama si
   riconosce dal gettone Firebase; che cosa puo' vedere lo decide
   lib/circ-dati.js (profilo): i propri incarichi per chi e' nel
   team, responsabile dell'incarico o della qualita'; tutto per
   l'amministratore, il titolare e i supervisori che lui indica.
   OGNI azione su una lettera ricontrolla che il suo incarico sia
   fra quelli di chi chiama.

   GET (solo Vercel, con CRON_SECRET, ogni cinque minuti): legge
   la casella (ricevute e risposte), poi spedisce quello che e'
   dovuto - lettere in coda e solleciti arrivati alla data - e fa
   le pulizie. In quest'ordine: un sollecito non deve partire se
   la risposta e' gia' nella casella.

   Il lavoro vero sta in lib/circ-*.js; qui ci sono i permessi e
   la forma delle risposte. Variabili d'ambiente: quelle di sempre
   (FIREBASE_SERVICE_ACCOUNT, ALLOWED_ORIGIN, CRON_SECRET) piu'
   CIRC_PEC_USER, CIRC_PEC_PASS e le facoltative descritte nel
   README ("Circolarizzazioni via PEC").
   ============================================================ */
'use strict';

const admin = require('firebase-admin');
const { utenteEffettivo } = require('../lib/utente-effettivo');
const C = require('../lib/circ-comune');
const DATI = require('../lib/circ-dati');
const GIRO = require('../lib/circ-giro');
const LETTORE = require('../lib/circ-lettore');
const ERRORI = require('../lib/circ-errori');
const AVVISI = require('../lib/circ-avvisi');

function leggiServiceAccount() {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT mancante');
    let testo = raw;
    if (testo[0] !== '{') {
        try { const dec = Buffer.from(testo, 'base64').toString('utf8').trim(); if (dec[0] === '{') testo = dec; } catch (_) { /* lo dira' JSON.parse */ }
    }
    let cred;
    try { cred = JSON.parse(testo); } catch (_) { throw new Error('FIREBASE_SERVICE_ACCOUNT non valido'); }
    if (cred.private_key && cred.private_key.includes('\\n')) cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    return cred;
}
function initAdmin() {
    if (admin.apps && admin.apps.length) return;
    admin.initializeApp({ credential: admin.credential.cert(leggiServiceAccount()) });
}

class Rifiuto extends Error {
    constructor(stato, msg, extra) { super(msg); this.stato = stato; this.extra = extra || null; }
}
function esci(stato, msg, extra) { throw new Rifiuto(stato, msg, extra); }
function daEsito(r) { if (r && r.ok === false) esci(r.stato || 400, r.msg || 'Operazione non riuscita.', r.doppione ? { doppione: true } : null); return r; }

/* La scheda come la vede l'area riservata: senza i campi che servono solo al giro. */
function perArea(inv) {
    const passo = p => {
        if (!p) return { stato: 'non-previsto' };
        const o = {
            stato: p.stato, data: p.data || '', scadenza: p.scadenza || '', previsto: p.previsto || 0,
            inviatoIl: p.inviatoIl || 0, esito: p.esito || '', errore: p.errore || '', motivo: p.motivo || '', per: p.per || '',
            tentativi: p.tentativi || 0
        };
        if (p.accettata) o.accettata = p.accettata.quando || 0;
        if (p.consegnata) o.consegnata = p.consegnata.quando || 0;
        if (p.problema) o.problema = { tipo: p.problema.tipo, motivo: p.problema.motivo, definitivo: !!p.problema.definitivo, quando: p.problema.quando || 0 };
        return o;
    };
    const passi = inv.passi || {};
    return {
        id: inv.id, incaricoId: inv.incaricoId, cliente: inv.cliente, destinatario: inv.destinatario, pec: inv.pec,
        categoria: inv.categoria, ambito: C.ambitoDi(inv.categoria), saldo: inv.saldo == null ? null : inv.saldo, nota: inv.nota || '',
        bilancio: inv.bilancio, scadenza: inv.scadenza, codice: inv.codice, stato: inv.stato,
        allegato: inv.allegato ? { nome: inv.allegato.nome, dimensione: inv.allegato.dimensione, tolto: !!inv.allegato.tolto } : null,
        creato: inv.creato || null, annullato: inv.annullato || null,
        passi: { primo: passo(passi.primo), sollecito1: passo(passi.sollecito1), sollecito2: passo(passi.sollecito2) },
        risposta: inv.risposta || null,
        risposte: (inv.risposte || []).map(r => ({
            chiave: r.chiave, quando: r.quando, da: r.da, oggetto: r.oggetto, certificata: !!r.certificata, automatica: !!r.automatica,
            via: r.via || '', dimensione: r.dimensione || 0, associataDa: r.associataDa || null,
            allegati: (r.allegati || []).map(a => ({ nome: a.nome, dimensione: a.dimensione, parte: a.parte, tipo: a.tipo }))
        })),
        messaggi: (inv.messaggi || []).map(m => ({ chiave: m.chiave, quando: m.quando, tipo: m.tipo, passo: m.passo, dimensione: m.dimensione || 0 })),
        storico: inv.storico || []
    };
}

/* La lettera indicata, se chi chiama puo' vederla. */
async function letteraDi(db, prof, id) {
    const inv = await DATI.leggi(db, String(id || ''));
    if (!inv || inv.stato === 'bozza') esci(404, 'Lettera non trovata.');
    if (!DATI.incaricoDi(prof, inv.incaricoId)) esci(403, 'Questa lettera è di un incarico che non segui.');
    return inv;
}
function soloAdmin(prof) { if (!prof.admin) esci(403, 'Solo l\'amministratore può farlo.'); }
function soloChiVedeTutto(prof) { if (!prof.vedeTutto) esci(403, 'Solo l\'amministratore e i supervisori possono farlo.'); }

/* Il messaggio della casella che si vuole aprire deve stare su quella
   lettera: e' l'unico controllo che impedisce di leggere, con un numero a
   caso, la posta di un altro incarico. Torna le coordinate IMAP. */
function messaggioDi(inv, chiave, parte) {
    const k = String(chiave || '');
    const r = (inv.risposte || []).find(x => x.chiave === k);
    const m = r || (inv.messaggi || []).find(x => x.chiave === k);
    if (!m) esci(404, 'Messaggio non trovato su questa lettera.');
    let allegato = null;
    if (parte) {
        allegato = r ? (r.allegati || []).find(a => String(a.parte) === String(parte)) : null;
        if (!allegato) esci(404, 'Allegato non trovato su questo messaggio.');
        if (allegato.dimensione > C.LIMITI.rispostaMaxByte * 1.4) esci(413, 'Questo allegato supera ' + C.megabyte(C.LIMITI.rispostaMaxByte) + ': aprilo dalla casella PEC.');
    }
    return { uid: m.uid, uidValidity: m.uidValidity, allegato: allegato, risposta: !!r };
}

const AZIONI = {
    /* Che cosa vede chi entra: la casella, i limiti, i suoi incarichi con i conteggi. */
    async stato(db, prof) {
        const conDati = await DATI.riepiloghi(db, prof.vedeTutto ? null : prof.incarichi.map(i => i.id));
        const incarichi = prof.incarichi.map(i => Object.assign({}, i, { conteggi: conDati[i.id] ? conDati[i.id].conteggi : null, perAmbito: conDati[i.id] ? conDati[i.id].perAmbito : null }));
        const cfg = C.configurazione();
        const out = {
            ok: true,
            configurato: C.configurato(), casella: C.configurato() ? cfg.mittente : '',
            profilo: { nome: prof.nome, email: prof.email, admin: prof.admin, supervisore: prof.supervisore, vedeTutto: prof.vedeTutto },
            limiti: { pdfMaxByte: C.LIMITI.pdfMaxByte, pezzoByte: C.LIMITI.pezzoByte, rispostaMaxByte: C.LIMITI.rispostaMaxByte, perOra: C.LIMITI.perOra, pdfGiorni: C.LIMITI.pdfGiorni },
            ambiti: Object.keys(C.AMBITI).map(k => ({ id: k, nome: C.AMBITI[k] })),
            categorie: Object.keys(C.CATEGORIE).map(k => ({ id: k, nome: C.CATEGORIE[k].nome, uno: C.CATEGORIE[k].uno, ambito: C.ambitoDi(k), saldo: !!C.CATEGORIE[k].saldo })),
            oggi: C.giornoRoma(), incarichi: incarichi,
            giro: await GIRO.stato(db), lettore: await LETTORE.stato(db)
        };
        if (prof.vedeTutto) {
            out.errori = await ERRORI.conta(db);
            out.nonAssociate = (await DATI.nonAssociate(db)).length;
            // incarichi con lettere ma non piu' in elenco (cancellati dall'anagrafica): l'amministratore li vede lo stesso
            out.orfani = Object.keys(conDati).filter(id => !incarichi.some(i => i.id === id)).map(id => ({ id: id, cliente: conDati[id].cliente, conteggi: conDati[id].conteggi, perAmbito: conDati[id].perAmbito }));
        }
        if (prof.admin) {
            out.supervisori = (await DATI.impostazioni(db)).supervisori;
            const av = await ERRORI.destinatari(db);
            out.avvisiErrori = { destinatari: av.lista, supervisori: av.supervisori, posta: ERRORI.postaConfigurata() };
        }
        return out;
    },
    async elenco(db, prof, b) {
        const inc = DATI.incaricoDi(prof, b.incaricoId) || (prof.vedeTutto ? { id: String(b.incaricoId || ''), cliente: '', ruoli: [] } : null);
        if (!inc || !inc.id) esci(403, 'Non segui questo incarico.');
        const schede = await DATI.schedeIncarico(db, inc.id);
        return { ok: true, incarico: inc, schede: schede.map(perArea), conteggi: DATI.conteggi(schede, C.giornoRoma()), perAmbito: DATI.conteggiPerAmbito(schede, C.giornoRoma()), oggi: C.giornoRoma() };
    },
    async dettaglio(db, prof, b) {
        return { ok: true, scheda: perArea(await letteraDi(db, prof, b.id)) };
    },
    /* Il testo esatto che partira', per mostrarlo prima dell'invio. */
    async anteprima(db, prof, b) {
        const inc = DATI.incaricoDi(prof, b.incaricoId);
        if (!inc) esci(403, 'Non segui questo incarico.');
        const passo = C.PASSI.indexOf(String(b.passo)) >= 0 ? String(b.passo) : 'primo';
        const oggi = C.giornoRoma();
        const d = {
            cliente: inc.cliente, destinatario: C.unaRiga(b.destinatario, 160) || 'Denominazione del destinatario',
            categoria: Object.prototype.hasOwnProperty.call(C.CATEGORIE, String(b.categoria)) ? String(b.categoria) : 'altro',
            bilancio: C.giornoValido(b.bilancio) ? b.bilancio : oggi, codice: 'RVL-XXXXXX', casella: C.configurazione().mittente || 'la casella PEC di Revilaw',
            scadenza: C.giornoValido(b.scadenza) ? b.scadenza : C.aggiungiGiorni(oggi, 10),
            scadenzaPrima: C.giornoValido(b.scadenzaPrima) ? b.scadenzaPrima : '', inviatoIl: oggi,
            sollecito1Il: passo === 'sollecito2' && C.giornoValido(b.sollecito1Il) ? b.sollecito1Il : ''
        };
        return { ok: true, oggetto: C.oggetto(passo, d), html: C.html(passo, d), testo: C.testoSemplice(passo, d) };
    },
    /* Una lettera nuova: la scheda nasce in bozza, poi arriva il PDF a pezzi. */
    async crea(db, prof, b) {
        if (!C.configurato()) esci(503, 'La casella PEC delle circolarizzazioni non è ancora configurata: avvisa l\'amministratore.');
        const inc = DATI.incaricoDi(prof, b.incaricoId);
        if (!inc) esci(403, 'Non segui questo incarico.');
        const c = daEsito(C.controllaRichiesta(b, C.giornoRoma()));
        return daEsito(await DATI.crea(db, prof, inc, c.dati, { forza: b.forza === true }));
    },
    async allegato(db, prof, b) {
        const r = daEsito(await DATI.caricaPezzo(db, prof, b.id, b.n, b.dati));
        return r;
    },
    /* Fa partire subito quello che e' in coda, per poco: il resto lo prende il giro programmato. */
    async avvia(db, prof) {
        const r = await GIRO.giro(db, { da: prof.firma, budgetMs: 40000, max: 25 });
        return Object.assign({}, r, { ok: true, inviato: r.ok, inAttesa: await GIRO.inAttesa(db, 200) });
    },
    /* "Aggiorna ricevute e risposte": una lettura della casella a richiesta. */
    async controlla(db, prof) {
        const r = await LETTORE.giro(db, { da: prof.firma, budgetMs: 40000 });
        return Object.assign({}, r, { ok: true, letto: r.ok });
    },
    async solleciti(db, prof, b) {
        await letteraDi(db, prof, b.id);
        const r = daEsito(await DATI.modificaSolleciti(db, b.id, { sollecito1: b.sollecito1, sollecito2: b.sollecito2 }, prof));
        return { ok: true, scheda: perArea(r.invio) };
    },
    async annulla(db, prof, b) {
        await letteraDi(db, prof, b.id);
        const r = daEsito(await DATI.annulla(db, b.id, prof));
        return { ok: true, cosa: r.cosa, scheda: perArea(r.invio) };
    },
    async 'risposta-manuale'(db, prof, b) {
        await letteraDi(db, prof, b.id);
        const r = daEsito(b.togli ? await DATI.togliRispostaManuale(db, b.id) : await DATI.rispostaManuale(db, b.id, b.nota, prof));
        return { ok: true, scheda: perArea(r.invio) };
    },
    async reinvia(db, prof, b) {
        if (!C.configurato()) esci(503, 'La casella PEC delle circolarizzazioni non è configurata.');
        await letteraDi(db, prof, b.id);
        const r = daEsito(await DATI.reinvia(db, b.id, b.pec, prof));
        return { ok: true, scheda: perArea(r.invio) };
    },
    /* Il testo di una ricevuta o di una risposta, letto dalla casella. */
    async leggi(db, prof, b) {
        let coord;
        if (b.id) coord = messaggioDi(await letteraDi(db, prof, b.id), b.chiave);
        else coord = await nonAssociata(db, prof, b.chiave);
        return daEsito(await LETTORE.leggiTesto(coord));
    },
    /* Un tratto del messaggio (.eml) o di un allegato, da ricomporre nell'area riservata. */
    async scarica(db, prof, b) {
        let coord;
        if (b.id) coord = messaggioDi(await letteraDi(db, prof, b.id), b.chiave, b.parte);
        else coord = await nonAssociata(db, prof, b.chiave, b.parte);
        const r = daEsito(await LETTORE.scarica({ uid: coord.uid, uidValidity: coord.uidValidity, parte: b.parte ? String(b.parte) : '', da: b.da, totale: coord.allegato ? coord.allegato.dimensione : 0 }));
        if (coord.allegato) Object.assign(r, { codifica: coord.allegato.codifica || '', tipo: coord.allegato.tipo || '', nome: coord.allegato.nome });
        return r;
    },

    /* ---------- chi vede tutto ---------- */
    async 'non-associate'(db, prof) {
        soloChiVedeTutto(prof);
        const lista = await DATI.nonAssociate(db);
        return {
            ok: true,
            messaggi: lista.map(m => ({
                chiave: m.id, quando: m.quando, da: m.da || '', oggetto: m.oggetto || '', certificata: !!m.certificata, dimensione: m.dimensione || 0,
                allegati: (m.allegati || []).map(a => ({ nome: a.nome, dimensione: a.dimensione, parte: a.parte, tipo: a.tipo })),
                candidati: m.candidati || []
            }))
        };
    },
    async 'per-codice'(db, prof, b) {
        soloChiVedeTutto(prof);
        const codice = C.codiceDa(b.codice);
        if (!codice) esci(400, 'Scrivi il riferimento nella forma RVL-XXXXXX.');
        const dove = await DATI.trovaRiferimento(db, ['c~' + codice]);
        const inv = dove ? await DATI.leggi(db, dove.invio) : null;
        if (!inv || inv.stato === 'bozza') esci(404, 'Nessuna lettera con il riferimento ' + codice + '.');
        return { ok: true, scheda: perArea(inv) };
    },
    async associa(db, prof, b) {
        soloChiVedeTutto(prof);
        const inv = await DATI.leggi(db, String(b.id || ''));
        if (!inv || inv.stato === 'bozza') esci(404, 'Lettera non trovata.');
        return daEsito(await DATI.associa(db, String(b.chiave || ''), inv.id, prof));
    },
    async scarta(db, prof, b) {
        soloChiVedeTutto(prof);
        return daEsito(await DATI.scarta(db, String(b.chiave || ''), prof));
    },
    /* Il registro degli errori: lo vede chi vede tutto, e spunta quelli risolti. */
    async errori(db, prof) {
        soloChiVedeTutto(prof);
        const e = await ERRORI.elenco(db);
        const perArea = x => ({
            id: x.id, tipo: x.tipo, gravita: x.gravita, titolo: x.titolo, dettaglio: x.dettaglio, incaricoId: x.incaricoId, cliente: x.cliente,
            invio: x.invio, destinatario: x.destinatario, pec: x.pec, codice: x.codice, passo: x.passo,
            primo: x.primo || 0, ultimo: x.ultimo || 0, volte: x.volte || 1, avvisato: x.avvisato || 0, riaperto: x.riaperto || 0, risolto: x.risolto || null
        });
        return { ok: true, aperti: e.aperti.map(perArea), risolti: e.risolti.map(perArea) };
    },
    async 'errore-risolvi'(db, prof, b) {
        soloChiVedeTutto(prof);
        const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(x => String(x || '')).filter(Boolean);
        if (!ids.length) esci(400, 'Errore non indicato.');
        return ERRORI.risolvi(db, ids, b.nota, prof);
    },
    async 'errore-riapri'(db, prof, b) {
        soloChiVedeTutto(prof);
        return daEsito(await ERRORI.riapri(db, b.id));
    },
    /* A chi arriva l'email degli errori: sempre al titolare; ai supervisori se l'amministratore lo vuole. */
    async 'avvisi-errori'(db, prof, b) {
        soloAdmin(prof);
        await DATI.docImpostazioni(db).set({ avvisaSupervisori: b.supervisori === true, aggiornato: Date.now(), da: prof.firma }, { merge: true });
        const av = await ERRORI.destinatari(db);
        return { ok: true, avvisiErrori: { destinatari: av.lista, supervisori: av.supervisori, posta: ERRORI.postaConfigurata() } };
    },
    async supervisori(db, prof, b) {
        soloAdmin(prof);
        const lista = (Array.isArray(b.supervisori) ? b.supervisori : []).map(x => String(x || '').trim().toLowerCase()).filter(Boolean);
        const sbagliato = lista.find(x => !C.EMAIL_RE.test(x));
        if (sbagliato) esci(400, 'Indirizzo non valido: ' + sbagliato);
        const unici = lista.filter((x, i) => lista.indexOf(x) === i).slice(0, 40);
        for (const e of unici) {
            const u = await db.collection('utenti').doc(e).get();
            if (!u.exists || (u.data() || {}).attivo === false) esci(400, e + ' non ha un accesso attivo all\'area riservata.');
        }
        await DATI.docImpostazioni(db).set({ supervisori: unici, aggiornato: Date.now(), da: prof.firma }, { merge: true });
        return { ok: true, supervisori: unici };
    },
    /* I dati di un incarico si tolgono dal portale a lavoro finito: ricevute e
       risposte restano nella casella PEC e nelle carte di lavoro del team. */
    async 'cancella-incarico'(db, prof, b) {
        soloAdmin(prof);
        if (String(b.conferma || '') !== 'CANCELLA') esci(400, 'Conferma mancante.');
        if (!String(b.incaricoId || '')) esci(400, 'Incarico non indicato.');
        return DATI.cancellaIncarico(db, String(b.incaricoId));
    }
};
async function nonAssociata(db, prof, chiave, parte) {
    soloChiVedeTutto(prof);
    const s = await db.collection(DATI.MSG).doc(String(chiave || '')).get();
    const m = s.exists ? (s.data() || {}) : null;
    if (!m || m.stato !== 'non-associato') esci(404, 'Messaggio non trovato.');
    let allegato = null;
    if (parte) {
        allegato = (m.allegati || []).find(a => String(a.parte) === String(parte));
        if (!allegato) esci(404, 'Allegato non trovato su questo messaggio.');
        if (allegato.dimensione > C.LIMITI.rispostaMaxByte * 1.4) esci(413, 'Questo allegato supera ' + C.megabyte(C.LIMITI.rispostaMaxByte) + ': aprilo dalla casella PEC.');
    }
    return { uid: m.uid, uidValidity: m.uidValidity, allegato: allegato };
}

/* Il giro programmato: casella, invii, pulizie. */
/* La casella si legge sempre prima di spedire qualcosa (un sollecito non deve
   partire se la risposta e' gia' arrivata). Quando invece non c'e' niente da
   spedire basta leggerla ogni dieci minuti (ogni cinque finche' qualche
   lettera aspetta le ricevute), e se nessun incarico ha lettere non si legge
   affatto: ogni lettura e' un accesso alla casella PEC, e il
   gestore li conta. */
async function giroProgrammato(db) {
    const out = { ok: true };
    const dovute = await GIRO.inAttesa(db, 1);
    const sl = await LETTORE.stato(db);
    const haLettere = dovute > 0 || (await db.collection(DATI.INC).limit(1).get()).docs.length > 0;
    const appenaLetta = sl.ultimoGiro && sl.ultimoGiro.esito === 'ok' && !sl.ultimoGiro.restanti && Date.now() - (sl.ultimoGiro.quando || 0) < 9 * 60 * 1000;
    // lettere partite che aspettano ancora le ricevute: si legge a ogni giro, chi ha inviato vuole vedere "consegnata"
    const inAttesaDiRicevute = haLettere && appenaLetta && dovute === 0
        ? (await db.collection(DATI.INVII).where('stato', '==', 'inviata').limit(1).get()).docs.length > 0 : false;
    if (haLettere && (dovute > 0 || !appenaLetta || inAttesaDiRicevute)) out.lettore = await LETTORE.giro(db, { da: 'giro programmato', budgetMs: 45000 });
    else out.lettore = { ok: true, esito: haLettere ? 'letta da poco' : 'nessuna lettera' };
    /* Senza niente di dovuto il giro degli invii non parte nemmeno, e le
       pulizie si fanno una volta all'ora: a riposo il giro programmato costa
       a Firestore poche letture e nessuna scrittura. */
    out.invii = dovute > 0 ? await GIRO.giro(db, { da: 'giro programmato', budgetMs: 190000 }) : { ok: true, esito: 'niente da spedire', inviate: 0 };
    if (new Date().getUTCMinutes() < 5) {
        try { out.pulizie = await DATI.pulizia(db, Date.now(), 40); } catch (e) { out.pulizie = 0; console.error('Circolarizzazioni, pulizie:', String((e && e.message) || e).slice(0, 200)); }
    }
    // gli errori nuovi, tutti in una sola email
    out.avvisi = await ERRORI.avvisa(db);
    // e a chi ha preparato le lettere: risposte arrivate e PEC non consegnate, una email a testa
    out.avvisiUtenti = await AVVISI.spedisci(db);
    return out;
}

module.exports = async (req, res) => {
    const origin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    if (req.method === 'GET') {
        // solo Vercel: senza il controllo sul segreto vuoto varrebbe 'Bearer undefined'
        const segreto = String(process.env.CRON_SECRET || '').trim();
        const auth = String((req.headers || {})['authorization'] || '');
        if (!segreto || auth !== 'Bearer ' + segreto) { res.status(401).json({ ok: false, msg: 'Non autorizzato' }); return; }
        try {
            initAdmin();
            res.status(200).json(await giroProgrammato(admin.firestore()));
        } catch (e) {
            console.error('Circolarizzazioni, giro:', String((e && e.stack) || e).slice(0, 400));
            try { await ERRORI.segna(admin.firestore(), { chiave: 'servizio~giro~' + String((e && e.message) || e).slice(0, 80), tipo: 'servizio', titolo: 'Il giro programmato si è interrotto', dettaglio: String((e && e.message) || e).slice(0, 400) }); } catch (_) { /* gia' scritto nei log */ }
            res.status(500).json({ ok: false, msg: 'Giro non riuscito.' });
        }
        return;
    }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito.' }); return; }

    const body = typeof req.body === 'string'
        ? (() => { try { return JSON.parse(req.body || '{}'); } catch (_) { return {}; } })()
        : (req.body || {});
    const azione = String(body.azione || '').trim();
    try {
        initAdmin();
        const idToken = String(body.idToken || '');
        if (!idToken) { res.status(401).json({ ok: false, msg: 'Autenticazione mancante.' }); return; }
        let decoded;
        try { decoded = await admin.auth().verifyIdToken(idToken); }
        catch (_) { res.status(401).json({ ok: false, msg: 'Sessione non valida: rientra e riprova.' }); return; }
        const db = admin.firestore();
        const ue = await utenteEffettivo(db, String(decoded.email || '').toLowerCase());
        if (!ue.ok) { res.status(403).json({ ok: false, msg: ue.msg || 'Utenza non abilitata.' }); return; }
        if (/^sondaggio_/.test(String(ue.ruolo || ''))) { res.status(403).json({ ok: false, msg: 'Il tuo accesso non comprende questa sezione.' }); return; }
        if (!Object.prototype.hasOwnProperty.call(AZIONI, azione)) { res.status(400).json({ ok: false, msg: 'Azione non riconosciuta.' }); return; }
        const prof = await DATI.profilo(db, ue);
        res.status(200).json(await AZIONI[azione](db, prof, body));
    } catch (e) {
        if (e instanceof Rifiuto) { res.status(e.stato).json(Object.assign({ ok: false, msg: e.message }, e.extra || {})); return; }
        console.error('circolarizzazioni (' + azione + '):', String((e && e.stack) || e).slice(0, 600));
        // un errore che non doveva succedere: nel registro, cosi' chi amministra lo viene a sapere
        try { await ERRORI.segna(admin.firestore(), { chiave: 'servizio~' + azione + '~' + String((e && e.message) || e).slice(0, 80), tipo: 'servizio', titolo: 'Errore imprevisto del servizio', dettaglio: 'Azione «' + azione + '»: ' + String((e && e.message) || e).slice(0, 400) }); } catch (_) { /* gia' scritto nei log */ }
        res.status(500).json({ ok: false, msg: 'Servizio non disponibile: riprova tra poco.' });
    }
};
module.exports._interni = { AZIONI, perArea, giroProgrammato, Rifiuto };
