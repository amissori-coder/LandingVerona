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
const BOZZE = require('../lib/circ-bozze');
const REGISTRO = require('../lib/circ-registro');

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
            stato: p.stato, data: p.data || '', ora: p.ora || '', scadenza: p.scadenza || '', previsto: p.previsto || 0,
            inviatoIl: p.inviatoIl || 0, esito: p.esito || '', errore: p.errore || '', motivo: p.motivo || '', per: p.per || '',
            tentativi: p.tentativi || 0, propria: !!p.propria
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
/* La bozza delle nuove lettere e' di chi chiama, per un incarico che segue e
   per una delle due aree. */
function bozzaDi(prof, b) {
    const inc = DATI.incaricoDi(prof, b.incaricoId);
    if (!inc) esci(403, 'Non segui questo incarico.');
    const ambito = String(b.ambito || '');
    if (!Object.prototype.hasOwnProperty.call(C.AMBITI, ambito)) esci(400, 'Area non indicata.');
    return { inc: inc, ambito: ambito };
}
/* ---------- il registro: chi ha fatto che cosa ----------
   Ogni azione che cambia qualcosa lascia una voce (lib/circ-registro.js). Se
   la voce non si scrive l'azione e' comunque avvenuta: lo si segnala fra gli
   errori, cosi' chi amministra viene a saperlo. */
async function traccia(db, prof, azione, voce) {
    const ok = await REGISTRO.scrivi(db, prof, Object.assign({ azione: azione }, voce));
    if (!ok) {
        try { await ERRORI.segna(db, { chiave: 'servizio~registro', tipo: 'servizio', titolo: 'Un\'operazione non è stata scritta nel registro', dettaglio: 'Azione «' + azione + '» di ' + ((prof && prof.email) || 'servizio') + (voce && voce.codice ? ', lettera ' + voce.codice : '') + '.' }); } catch (_) { /* gia' nei log */ }
    }
    return ok;
}
const giornoDetto = g => (g ? C.dataBreve(g) : '');
/* Un sollecito in parole, per dire nel registro che cosa e' cambiato. */
function sollecitoDetto(p) {
    if (!p || !p.stato || p.stato === 'non-previsto') return 'non previsto';
    if (p.stato === 'programmato') return 'il ' + giornoDetto(p.data) + ' alle ' + (p.ora || C.LIMITI.oraSollecito) + ', risposta entro il ' + giornoDetto(p.scadenza);
    if (p.stato === 'inviato') return 'inviato';
    if (p.stato === 'annullato') return 'annullato' + (p.data ? ' (era per il ' + giornoDetto(p.data) + ')' : '');
    if (p.stato === 'bloccato') return 'fermo' + (p.data ? ' (era per il ' + giornoDetto(p.data) + ')' : '');
    return p.stato;
}
function diffSolleciti(prima, dopo) {
    return [['sollecito1', 'Primo sollecito'], ['sollecito2', 'Secondo sollecito']].map(([k, nome]) => {
        const a = sollecitoDetto((prima.passi || {})[k]), b = sollecitoDetto((dopo.passi || {})[k]);
        return a === b ? null : { campo: nome, prima: a, dopo: b };
    }).filter(Boolean);
}
/* La lettera appena entrata in coda: chi l'ha preparata, per chi, con quali date e quale PDF. */
async function tracciaInCoda(db, prof, id, come) {
    const inv = await DATI.leggi(db, String(id));
    if (!inv) return;
    const p = inv.passi || {}, a = inv.allegato || {};
    const sol = (x, nome) => x && x.stato === 'programmato' ? '; ' + nome + ' il ' + giornoDetto(x.data) + ' alle ' + (x.ora || C.LIMITI.oraSollecito) + ' (risposta entro il ' + giornoDetto(x.scadenza) + ')' : '';
    await traccia(db, prof, 'lettera-in-coda', Object.assign(REGISTRO.diLettera(inv), {
        dettaglio: ((C.CATEGORIE[inv.categoria] || {}).uno || inv.categoria) + ', bilancio al ' + giornoDetto(inv.bilancio) + '; rispondere entro il ' + giornoDetto(inv.scadenza)
            + sol(p.sollecito1, 'primo sollecito') + sol(p.sollecito2, 'secondo sollecito')
            + (inv.saldo != null ? '; saldo ' + String(inv.saldo).replace('.', ',') + ' €' : '') + (inv.nota ? '; nota: ' + inv.nota : '')
            + '. Allegato «' + (a.nome || '') + '» (' + (a.dimensione || 0) + ' byte), ' + come + '.',
        dati: { allegato: a.nome || '', byte: a.dimensione || 0, sha256: a.sha256 || '', scadenza: inv.scadenza || '', bilancio: inv.bilancio || '' }
    }));
}
async function messaggioDetto(db, chiave) {
    try {
        const s = await db.collection(DATI.MSG).doc(String(chiave || '')).get();
        const m = s.exists ? (s.data() || {}) : null;
        return m ? 'Messaggio di ' + (m.da || 'mittente sconosciuto') + (m.quando ? ' del ' + giornoDetto(C.giornoRoma(m.quando)) : '') + (m.oggetto ? ', oggetto «' + C.unaRiga(m.oggetto, 160) + '»' : '') + '.' : '';
    } catch (_) { return ''; }
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
        /* Le letture non dipendono l'una dall'altra: partono insieme. In fila,
           la pagina aspettava una mezza dozzina di viaggi fino a Firestore. */
        const [conDati, giro, lettore, errori, nonAssociate, impAdmin, avvisi] = await Promise.all([
            DATI.riepiloghi(db, prof.vedeTutto ? null : prof.incarichi.map(i => i.id)),
            GIRO.stato(db), LETTORE.stato(db),
            prof.vedeTutto ? ERRORI.conta(db) : null,
            prof.vedeTutto ? DATI.nonAssociate(db) : null,
            prof.admin ? DATI.impostazioni(db) : null,
            prof.admin ? ERRORI.destinatari(db) : null
        ]);
        const incarichi = prof.incarichi.map(i => Object.assign({}, i, { conteggi: conDati[i.id] ? conDati[i.id].conteggi : null, perAmbito: conDati[i.id] ? conDati[i.id].perAmbito : null }));
        const cfg = C.configurazione();
        const out = {
            ok: true,
            configurato: C.configurato(), casella: C.configurato() ? cfg.mittente : '',
            // da dove partono gli invii: dal ponte italiano (a chi vede tutto anche il suo indirizzo, mai le credenziali) o direttamente
            ponte: cfg.proxyErrato ? 'errato' : (cfg.proxy ? 'attivo' : ''), ponteDove: prof.vedeTutto ? cfg.proxyDove : '',
            profilo: { nome: prof.nome, email: prof.email, admin: prof.admin, supervisore: prof.supervisore, vedeTutto: prof.vedeTutto },
            limiti: { pdfMaxByte: C.LIMITI.pdfMaxByte, pezzoByte: C.LIMITI.pezzoByte, rispostaMaxByte: C.LIMITI.rispostaMaxByte, perOra: C.LIMITI.perOra, pdfGiorni: C.LIMITI.pdfGiorni, bozzaGiorni: C.LIMITI.bozzaGiorni, bozzaRighe: BOZZE.MAX_RIGHE },
            ambiti: Object.keys(C.AMBITI).map(k => ({ id: k, nome: C.AMBITI[k] })),
            categorie: Object.keys(C.CATEGORIE).map(k => ({ id: k, nome: C.CATEGORIE[k].nome, uno: C.CATEGORIE[k].uno, ambito: C.ambitoDi(k), saldo: !!C.CATEGORIE[k].saldo })),
            oggi: C.giornoRoma(), incarichi: incarichi,
            giro: giro, lettore: lettore
        };
        // l'indirizzo di rete da cui e' uscito il servizio serve a chi parla con l'assistenza del gestore: agli altri non si manda
        if (!prof.vedeTutto && giro.rifiuto) out.giro = Object.assign({}, giro, { rifiuto: Object.assign({}, giro.rifiuto, { ip: '', regione: '' }) });
        if (prof.vedeTutto) {
            out.errori = errori;
            out.nonAssociate = nonAssociate.length;
            // incarichi con lettere ma non piu' in elenco (cancellati dall'anagrafica): l'amministratore li vede lo stesso
            out.orfani = Object.keys(conDati).filter(id => !incarichi.some(i => i.id === id)).map(id => ({ id: id, cliente: conDati[id].cliente, conteggi: conDati[id].conteggi, perAmbito: conDati[id].perAmbito }));
        }
        if (prof.admin) {
            out.supervisori = impAdmin.supervisori;
            out.avvisiErrori = { destinatari: avvisi.lista, supervisori: avvisi.supervisori, posta: ERRORI.postaConfigurata() };
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
        if (r.completo) await tracciaInCoda(db, prof, r.id, 'caricato dal computer');
        return r;
    },
    /* ---------- la bozza delle nuove lettere, salvata sul portale ---------- */
    async 'bozza-leggi'(db, prof, b) {
        const d = bozzaDi(prof, b);
        return { ok: true, bozza: await BOZZE.leggi(db, prof, d.inc.id, d.ambito) };
    },
    /* Torna anche il conflitto (un altro computer ha salvato nel frattempo): non e' un errore, e' una domanda per chi scrive. */
    async 'bozza-salva'(db, prof, b) {
        const d = bozzaDi(prof, b);
        const r = await BOZZE.salva(db, prof, d.inc, d.ambito, b.bozza, b.base);
        if (r.ok && r.svuotate) await traccia(db, prof, 'bozza-svuotata', { incaricoId: d.inc.id, cliente: d.inc.cliente, ambito: d.ambito, dettaglio: r.svuotate + (r.svuotate === 1 ? ' riga non inviata tolta' : ' righe non inviate tolte') + ', con i PDF allegati.' });
        return r.conflitto ? r : daEsito(r);
    },
    async 'bozza-pdf'(db, prof, b) {
        const d = bozzaDi(prof, b);
        return daEsito(await BOZZE.caricaPdf(db, prof, d.inc, d.ambito, b));
    },
    async 'bozza-pdf-leggi'(db, prof, b) {
        const d = bozzaDi(prof, b);
        return daEsito(await BOZZE.leggiPdf(db, prof, d.inc.id, d.ambito, b.riga, b.n));
    },
    async 'bozza-togli'(db, prof, b) {
        const d = bozzaDi(prof, b);
        const r = await BOZZE.togli(db, prof, d.inc.id, d.ambito);
        if (r.svuotate) await traccia(db, prof, 'bozza-svuotata', { incaricoId: d.inc.id, cliente: d.inc.cliente, ambito: d.ambito, dettaglio: r.svuotate + (r.svuotate === 1 ? ' riga non inviata tolta' : ' righe non inviate tolte') + ', con i PDF allegati.' });
        return r;
    },
    /* L'allegato di una lettera appena creata, preso dal PDF che la sua riga
       ha gia' nella bozza: non risale dal browser. La riga esce dalla bozza. */
    async 'allegato-da-bozza'(db, prof, b) {
        const d = bozzaDi(prof, b);
        const pdf = await BOZZE.pdfDiRiga(db, prof, d.inc.id, d.ambito, b.riga);
        if (!pdf) esci(404, 'Il PDF di questa riga non è più nella bozza: allegalo di nuovo.');
        const r = daEsito(await DATI.caricaIntero(db, prof, b.id, pdf.buf));
        await tracciaInCoda(db, prof, r.id, 'preso dalla bozza salvata sul portale');
        const dopo = await BOZZE.consuma(db, prof, d.inc.id, d.ambito, b.riga);
        return Object.assign(r, { versione: dopo.versione });
    },
    /* Fa partire subito quello che e' in coda, per poco: il resto lo prende il giro programmato. */
    async avvia(db, prof) {
        // `nuove`: se gli invii sono in pausa per un rifiuto, le lettere appena preparate si provano lo stesso
        const r = await GIRO.giro(db, { da: prof.firma, budgetMs: 40000, max: 25, nuove: true });
        return Object.assign({}, r, { ok: true, inviato: r.ok, inAttesa: await GIRO.inAttesa(db, 200) });
    },
    /* Gli invii sono fermi perche' il gestore ha respinto il servizio: chi vede
       tutto puo' riprovare subito, senza aspettare la fine della pausa (per
       esempio dopo aver sentito l'assistenza del gestore). */
    async 'riprova-invii'(db, prof) {
        soloChiVedeTutto(prof);
        const r = await GIRO.giro(db, { da: prof.firma, budgetMs: 40000, max: 25, forza: true });
        await traccia(db, prof, 'invii-riprovati', { dettaglio: r.ok ? 'Invii ripresi a mano: ' + (r.inviate || 0) + (r.inviate === 1 ? ' PEC partita.' : ' PEC partite.') : 'Tentativo a mano non riuscito: ' + (r.fermato || r.msg || 'il gestore rifiuta ancora') + '.' });
        return Object.assign({}, r, { ok: true, inviato: r.ok, inAttesa: await GIRO.inAttesa(db, 200) });
    },
    /* "Aggiorna ricevute e risposte": una lettura della casella a richiesta. */
    async controlla(db, prof) {
        const r = await LETTORE.giro(db, { da: prof.firma, budgetMs: 40000 });
        return Object.assign({}, r, { ok: true, letto: r.ok });
    },
    async solleciti(db, prof, b) {
        const prima = await letteraDi(db, prof, b.id);
        const r = daEsito(await DATI.modificaSolleciti(db, b.id, { sollecito1: b.sollecito1, sollecito2: b.sollecito2 }, prof));
        const campi = diffSolleciti(prima, r.invio);
        if (campi.length) await traccia(db, prof, 'solleciti-modificati', Object.assign(REGISTRO.diLettera(r.invio), { campi: campi }));
        return { ok: true, scheda: perArea(r.invio) };
    },
    async annulla(db, prof, b) {
        const prima = await letteraDi(db, prof, b.id);
        const r = daEsito(await DATI.annulla(db, b.id, prof));
        if (r.cosa === 'lettera') await traccia(db, prof, 'lettera-annullata', Object.assign(REGISTRO.diLettera(r.invio), { dettaglio: 'La PEC non era ancora partita: non partirà.' }));
        else await traccia(db, prof, 'solleciti-annullati', Object.assign(REGISTRO.diLettera(r.invio), { campi: diffSolleciti(prima, r.invio) }));
        return { ok: true, cosa: r.cosa, scheda: perArea(r.invio) };
    },
    async 'risposta-manuale'(db, prof, b) {
        const prima = await letteraDi(db, prof, b.id);
        const r = daEsito(b.togli ? await DATI.togliRispostaManuale(db, b.id) : await DATI.rispostaManuale(db, b.id, b.nota, prof));
        if (b.togli) await traccia(db, prof, 'risposta-manuale-tolta', Object.assign(REGISTRO.diLettera(r.invio), { dettaglio: 'Era stata segnata da ' + ((prima.risposta || {}).da || '?') + ((prima.risposta || {}).nota ? ' con la nota «' + prima.risposta.nota + '»' : '') + '. I solleciti fermi tornano in programma.', campi: diffSolleciti(prima, r.invio) }));
        else await traccia(db, prof, 'risposta-manuale', Object.assign(REGISTRO.diLettera(r.invio), { dettaglio: 'Risposta arrivata fuori dalla casella PEC' + ((r.invio.risposta || {}).nota ? ': «' + r.invio.risposta.nota + '»' : '') + '. I solleciti in programma si fermano.', campi: diffSolleciti(prima, r.invio) }));
        return { ok: true, scheda: perArea(r.invio) };
    },
    async reinvia(db, prof, b) {
        if (!C.configurato()) esci(503, 'La casella PEC delle circolarizzazioni non è configurata.');
        const prima = await letteraDi(db, prof, b.id);
        const r = daEsito(await DATI.reinvia(db, b.id, b.pec, prof));
        await traccia(db, prof, 'lettera-reinviata', Object.assign(REGISTRO.diLettera(r.invio), {
            dettaglio: 'La prima PEC non era arrivata: la lettera torna in coda con lo stesso PDF.',
            campi: (prima.pec !== r.invio.pec ? [{ campo: 'PEC', prima: prima.pec, dopo: r.invio.pec }] : []).concat(diffSolleciti(prima, r.invio))
        }));
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
        const messaggio = await messaggioDetto(db, b.chiave);
        const r = daEsito(await DATI.associa(db, String(b.chiave || ''), inv.id, prof));
        await traccia(db, prof, 'risposta-associata', Object.assign(REGISTRO.diLettera(inv), { dettaglio: messaggio + ' Associato a mano: i solleciti in programma per questa lettera si fermano.' }));
        return r;
    },
    async scarta(db, prof, b) {
        soloChiVedeTutto(prof);
        const messaggio = await messaggioDetto(db, b.chiave);
        const r = daEsito(await DATI.scarta(db, String(b.chiave || ''), prof));
        await traccia(db, prof, 'messaggio-scartato', { dettaglio: messaggio + ' Non riguarda nessuna lettera: resta nella casella PEC.' });
        return r;
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
        const titoli = await titoliErrori(db, ids);
        const r = await ERRORI.risolvi(db, ids, b.nota, prof);
        if (r.risolti) await traccia(db, prof, 'errore-risolto', { dettaglio: r.risolti + (r.risolti === 1 ? ' errore spuntato' : ' errori spuntati') + (titoli ? ': ' + titoli : '') + '.' + (C.unaRiga(b.nota, 300) ? ' Nota: «' + C.unaRiga(b.nota, 300) + '».' : '') });
        return r;
    },
    async 'errore-riapri'(db, prof, b) {
        soloChiVedeTutto(prof);
        const titoli = await titoliErrori(db, [b.id]);
        const r = daEsito(await ERRORI.riapri(db, b.id));
        await traccia(db, prof, 'errore-riaperto', { dettaglio: (titoli || 'Errore') + '.' });
        return r;
    },
    /* A chi arriva l'email degli errori: sempre al titolare; ai supervisori se l'amministratore lo vuole. */
    async 'avvisi-errori'(db, prof, b) {
        soloAdmin(prof);
        const primaAv = await ERRORI.destinatari(db);
        await DATI.docImpostazioni(db).set({ avvisaSupervisori: b.supervisori === true, aggiornato: Date.now(), da: prof.firma }, { merge: true });
        const av = await ERRORI.destinatari(db);
        if (!!primaAv.supervisori !== !!av.supervisori) await traccia(db, prof, 'avvisi-errori', { campi: [{ campo: 'Email degli errori anche ai supervisori', prima: primaAv.supervisori ? 'sì' : 'no', dopo: av.supervisori ? 'sì' : 'no' }] });
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
        const primaSup = (await DATI.impostazioni(db)).supervisori;
        await DATI.docImpostazioni(db).set({ supervisori: unici, aggiornato: Date.now(), da: prof.firma }, { merge: true });
        if (primaSup.slice().sort().join() !== unici.slice().sort().join()) await traccia(db, prof, 'supervisori', { campi: [{ campo: 'Supervisori', prima: primaSup.join(', ') || 'nessuno', dopo: unici.join(', ') || 'nessuno' }] });
        return { ok: true, supervisori: unici };
    },
    /* I dati di un incarico si tolgono dal portale a lavoro finito: ricevute e
       risposte restano nella casella PEC e nelle carte di lavoro del team. */
    async 'cancella-incarico'(db, prof, b) {
        soloAdmin(prof);
        if (String(b.conferma || '') !== 'CANCELLA') esci(400, 'Conferma mancante.');
        if (!String(b.incaricoId || '')) esci(400, 'Incarico non indicato.');
        // prima di togliere: le lettere come stanno adesso, perche' nel registro resti che cosa c'era
        const id = String(b.incaricoId);
        const schede = await DATI.schedeIncarico(db, id);
        const inc = DATI.incaricoDi(prof, id) || { id: id, cliente: (schede[0] || {}).cliente || '' };
        const r = await DATI.cancellaIncarico(db, id);
        await REGISTRO.scriviCancellazione(db, prof, inc, schede, { bozze: r.bozze || 0 });
        return r;
    },
    /* Il registro delle operazioni. Di un incarico lo legge chi lo segue;
       quello generale (tutti gli incarichi, impostazioni, errori) chi vede tutto. */
    async registro(db, prof, b) {
        if (String(b.incaricoId || '')) {
            if (!DATI.incaricoDi(prof, b.incaricoId) && !prof.vedeTutto) esci(403, 'Non segui questo incarico.');
            const r = await REGISTRO.elenco(db, { incaricoId: String(b.incaricoId) });
            return { ok: true, voci: r.voci.map(REGISTRO.perArea), totale: r.totale, altre: false, prima: 0 };
        }
        soloChiVedeTutto(prof);
        const r = await REGISTRO.elenco(db, { prima: b.prima, limite: b.limite });
        return { ok: true, voci: r.voci.map(REGISTRO.perArea), altre: r.altre, prima: r.prima };
    }
};
/* I titoli di qualche errore, per dire nel registro quali sono stati spuntati. */
async function titoliErrori(db, ids) {
    const titoli = [];
    for (const id of ids.slice(0, 8)) {
        try {
            const s = await db.collection(ERRORI.ERR).doc(String(id)).get();
            const e = s.exists ? (s.data() || {}) : null;
            if (e) titoli.push((e.titolo || 'errore') + (e.codice ? ' (' + e.codice + ')' : (e.cliente ? ' (' + e.cliente + ')' : '')));
        } catch (_) { /* il titolo e' un di piu' */ }
    }
    return titoli.join('; ') + (ids.length > 8 ? ' e altri ' + (ids.length - 8) : '');
}
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
    const [inCoda, sg] = await Promise.all([GIRO.inAttesa(db, 1), GIRO.stato(db)]);
    /* Il gestore ha appena respinto il servizio: fino alla fine della pausa non
       c'e' niente da spedire, e quindi nemmeno da leggere in fretta la casella.
       Ogni connessione in piu' da un indirizzo respinto allunga il blocco. */
    const inPausa = sg.sospesoFino > Date.now();
    const dovute = inPausa ? 0 : inCoda;
    const sl = await LETTORE.stato(db);
    const haLettere = inCoda > 0 || (await db.collection(DATI.INC).limit(1).get()).docs.length > 0;
    const appenaLetta = sl.ultimoGiro && sl.ultimoGiro.esito === 'ok' && !sl.ultimoGiro.restanti && Date.now() - (sl.ultimoGiro.quando || 0) < 9 * 60 * 1000;
    // lettere partite che aspettano ancora le ricevute: si legge a ogni giro, chi ha inviato vuole vedere "consegnata"
    const inAttesaDiRicevute = haLettere && appenaLetta && dovute === 0
        ? (await db.collection(DATI.INVII).where('stato', '==', 'inviata').limit(1).get()).docs.length > 0 : false;
    if (haLettere && (dovute > 0 || !appenaLetta || inAttesaDiRicevute)) out.lettore = await LETTORE.giro(db, { da: 'giro programmato', budgetMs: 45000 });
    else out.lettore = { ok: true, esito: haLettere ? 'letta da poco' : 'nessuna lettera' };
    /* Senza niente di dovuto il giro degli invii non parte nemmeno, e le
       pulizie si fanno una volta all'ora: a riposo il giro programmato costa
       a Firestore poche letture e nessuna scrittura. */
    out.invii = dovute > 0 ? await GIRO.giro(db, { da: 'giro programmato', budgetMs: 190000 })
        : (inPausa && inCoda > 0 ? { ok: true, esito: 'sospeso', sospesoFino: sg.sospesoFino, inviate: 0 } : { ok: true, esito: 'niente da spedire', inviate: 0 });
    if (new Date().getUTCMinutes() < 5) {
        try { out.pulizie = await DATI.pulizia(db, Date.now(), 40); } catch (e) { out.pulizie = 0; console.error('Circolarizzazioni, pulizie:', String((e && e.message) || e).slice(0, 200)); }
        try { out.bozzeTolte = await BOZZE.pulizia(db, Date.now(), 20); } catch (e) { out.bozzeTolte = 0; console.error('Circolarizzazioni, bozze:', String((e && e.message) || e).slice(0, 200)); }
        // le pulizie tolgono dei dati: quando tolgono qualcosa resta scritto nel registro
        if (out.pulizie || out.bozzeTolte) {
            await traccia(db, null, 'pulizie', { dettaglio: [out.pulizie ? out.pulizie + ' fra PDF di lettere preparate da più di ' + C.LIMITI.pdfGiorni + ' giorni e lettere rimaste senza allegato' : '', out.bozzeTolte ? out.bozzeTolte + (out.bozzeTolte === 1 ? ' bozza ferma' : ' bozze ferme') + ' da più di ' + C.LIMITI.bozzaGiorni + ' giorni' : ''].filter(Boolean).join('; ') + '.' });
        }
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
        if (!Object.prototype.hasOwnProperty.call(AZIONI, azione)) { res.status(400).json({ ok: false, msg: 'Azione non riconosciuta.' }); return; }
        /* Il gettone e' buono: mentre si controlla l'utenza partono gia' le
           letture che servono per sapere che cosa vede (un viaggio fino a
           Firestore invece di due). Se l'utenza non passa, non si usano. */
        const base = DATI.leggiBase(db).catch(() => null);
        const ue = await utenteEffettivo(db, String(decoded.email || '').toLowerCase());
        if (!ue.ok) { res.status(403).json({ ok: false, msg: ue.msg || 'Utenza non abilitata.' }); return; }
        if (/^sondaggio_/.test(String(ue.ruolo || ''))) { res.status(403).json({ ok: false, msg: 'Il tuo accesso non comprende questa sezione.' }); return; }
        const prof = await DATI.profilo(db, ue, base);
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
