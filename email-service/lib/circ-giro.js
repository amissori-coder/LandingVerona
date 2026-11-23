/* ============================================================
   Circolarizzazioni via PEC: il giro che spedisce
   ------------------------------------------------------------
   Le lettere non partono dal clic di chi le prepara: entrano in
   una coda, e da li' le prende UN giro per volta. E' questo che
   regge piu' persone che inviano nello stesso momento: ognuno
   aggiunge le sue schede, e chi spedisce e' sempre uno solo, con
   una sola connessione alla casella, al ritmo che il gestore PEC
   tollera.

   Il giro parte ogni cinque minuti (vercel.json) e, subito, quando
   qualcuno preme "Invia" nell'area riservata. Prende le schede che
   hanno qualcosa di dovuto ADESSO - la lettera appena caricata, o
   un sollecito arrivato alla sua data - le blocca una per una in
   transazione (lib/circ-dati.js: prendi) e le spedisce.

   TRE FRENI
     - il lucchetto: un giro per volta;
     - il tetto orario (CIRC_MAX_ORA): la casella non e' fatta per
       le raffiche, e un blocco antiabuso fermerebbe tutti;
     - il rifiuto che riguarda noi (tetto superato, IP bloccato,
       password): il giro si ferma e le schede tornano in coda,
       invece di marcarle "errore" una dopo l'altra. Ma UNA PEC
       BLOCCATA NON TIENE FERME LE ALTRE: se il rifiuto puo'
       riguardare la sola lettera si prova la successiva, e ci si
       ferma solo se viene respinta anche quella.

   Un sollecito non parte se nel frattempo e' arrivata la risposta:
   lo controlla `prendi`, nella stessa transazione che lo blocca.
   Per questo, quando il giro e' quello programmato, PRIMA si legge
   la casella (api/circolarizzazioni.js) e poi si spedisce.
   ============================================================ */
'use strict';

const nodemailer = require('nodemailer');
const C = require('./circ-comune');
const DATI = require('./circ-dati');
const ERRORI = require('./circ-errori');

const LUCCHETTO_MS = 6 * 60 * 1000;
/* Dopo un rifiuto che riguarda NOI (indirizzo bloccato, troppi invii,
   password) non si ritenta al giro dopo: ogni tentativo e' un'altra
   connessione alla casella da un indirizzo che il gestore ha appena respinto,
   e insistere allunga il blocco. Si aspetta, ogni volta di piu' se il rifiuto
   si ripete: dieci minuti, poi venti, quaranta, un'ora. Il primo invio
   riuscito azzera tutto. Chi vede tutto puo' riprovare subito a mano. */
const PAUSE_MIN = [10, 20, 40, 60];
function pausaDopo(rifiuti) { return PAUSE_MIN[Math.min(Math.max(1, rifiuti), PAUSE_MIN.length) - 1] * 60 * 1000; }
/* Che cosa vuol dire, in parole, il rifiuto del gestore: sta nell'avviso e nel
   registro degli errori, perche' il testo del server da solo non dice che
   fare. */
function spiegaRifiuto(testo) {
    const t = String(testo || '').toLowerCase();
    const conPonte = !!C.configurazione().proxy;
    if (/proxy|econnrefused|ehostunreach|enetunreach|enotfound|eai_again/.test(t)) {
        return conPonte ? 'Non risponde il ponte, cioè il server con indirizzo italiano da cui passano gli invii (CIRC_PEC_PROXY): va controllato che sia acceso, che la porta sia aperta e che utente e password siano quelli giusti.'
            : 'Il servizio non è riuscito a collegarsi al server di posta: non dipende dalle lettere.';
    }
    if (/password|autentic|authentication|credential|535|eauth/.test(t)) return 'La casella non accetta le credenziali del servizio: va controllata la password per i programmi di posta (su Aruba scade ogni sei mesi).';
    if (/ip|host|client|bloccat|blocked|blacklist|abus/.test(t)) {
        return conPonte ? 'Il gestore ha respinto l\'indirizzo di rete da cui arriva l\'invio, anche passando dal ponte: va controllato che l\'indirizzo del ponte sia italiano, oppure va sentita l\'assistenza del gestore. Non dipende dalle lettere né dalla password.'
            : 'Il gestore respinge gli invii che arrivano da un indirizzo di rete fuori dall\'Italia, e il servizio si collega dall\'estero: non dipende dalle lettere né dalla password, e riprovare non basta. Serve che il gestore autorizzi questa casella, oppure far passare gli invii da un indirizzo italiano: se ne occupa l\'amministratore (il «ponte», variabile CIRC_PEC_PROXY).';
    }
    if (/too many|troppi|rate|quota|421|45[0-2]/.test(t)) return 'Il gestore ha chiesto di rallentare: troppi messaggi o troppe connessioni in poco tempo.';
    return 'Il rifiuto riguarda la casella o il collegamento, non le lettere.';
}
function docGiro(db) { return db.collection('meta').doc('circGiro'); }
function aspetta(ms) { return ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve(); }

function trasporto() {
    const c = C.configurazione();
    const opz = {
        host: c.smtpHost, port: c.smtpPorta, secure: c.smtpPorta === 465,
        auth: { user: c.utente, pass: c.password },
        // una sola connessione per tutto il giro: i gestori PEC contano le connessioni al minuto
        pool: true, maxConnections: 1, maxMessages: 200,
        connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 45000
    };
    /* Il ponte: la connessione al gestore parte dal suo indirizzo, italiano.
       Dentro il passaggio la connessione resta cifrata e verificata contro il
       nome del server del gestore: il ponte non legge niente. */
    if (c.proxy) opz.proxy = c.proxy;
    return nodemailer.createTransport(opz);
}
/* Un rifiuto che riguarda NOI e non il destinatario (stessa regola di
   lib/canali-invito.js): insistere non lo migliora, e brucerebbe il resto
   della coda. */
function fermaTutto(e) {
    const testo = String((e && e.message) || '').toLowerCase();
    const codice = String((e && e.responseCode) || '');
    if (/bloccat|blocked|blacklist|spam|abus|too many|rate limit|troppi|quota|not allowed to send|sender denied/.test(testo)) return true;
    if (/^(421|450|451|452)$/.test(codice)) return true;
    if (/(^|[\s:])(421|45[0-2])([\s-]|$)/.test(testo)) return true;
    if (/5\.7\.\d/.test(testo) && /ip|host|client/.test(testo)) return true;
    // il collegamento non si apre (anche verso il ponte, che non lascia un codice di nodemailer)
    if (/invalid response from proxy|proxy/.test(testo)) return true;
    if (e && /^(EAUTH|ECONNECTION|ETIMEDOUT|ESOCKET|EDNS|ETLS|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN|EPIPE)$/.test(String(e.code || ''))) return true;
    return false;
}

/* Fra i rifiuti che riguardano noi, quelli che riguardano DI CERTO tutto il
   servizio: il collegamento non si apre, le credenziali non passano, il
   gestore chiede di rallentare, il ponte non risponde. Per questi non ha senso
   provare la lettera dopo. Gli altri (un "bloccato", un "abuso" detto su un
   messaggio) possono riguardare la sola lettera: lo dice la lettera dopo. */
function bloccoCerto(e) {
    const testo = String((e && e.message) || '').toLowerCase();
    const codice = String((e && e.responseCode) || '');
    const comando = String((e && e.command) || '').toUpperCase();
    if (e && /^(EAUTH|ECONNECTION|ETIMEDOUT|ESOCKET|EDNS|ETLS|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN|EPIPE)$/.test(String(e.code || ''))) return true;
    if (comando === 'CONN' || /^AUTH/.test(comando)) return true;
    if (/proxy|too many|rate limit|troppi/.test(testo)) return true;
    if (/^(421|450|451|452)$/.test(codice) || /(^|[\s:])(421|45[0-2])([\s-]|$)/.test(testo)) return true;
    return false;
}

async function prendiLucchetto(db, chi) {
    return db.runTransaction(async tx => {
        const snap = await tx.get(docGiro(db));
        const d = snap.exists ? (snap.data() || {}) : {};
        const ora = Date.now();
        if (d.lucchetto && d.lucchetto.fino > ora) return { preso: false };
        tx.set(docGiro(db), { lucchetto: { fino: ora + LUCCHETTO_MS, chi: String(chi || '').slice(0, 120) } }, { merge: true });
        return { preso: true, stato: d };
    });
}
async function mollaLucchetto(db, campi) {
    const dati = Object.assign({ lucchetto: null }, campi || {});
    try { await docGiro(db).set(dati, { merge: true }); }
    catch (_) {
        // con i campi c'e' anche la pausa dopo un rifiuto: un secondo tentativo, poi al massimo il lucchetto scade da solo
        if (campi) { try { await docGiro(db).set(dati, { merge: true }); } catch (e) { console.error('Circolarizzazioni, esito del giro non scritto:', String((e && e.message) || e).slice(0, 200)); } }
    }
}
function chiaveOra(ms) { return new Date(ms).toISOString().slice(0, 13); }

async function stato(db) {
    let d = {};
    try { const s = await docGiro(db).get(); d = s.exists ? (s.data() || {}) : {}; } catch (_) { d = {}; }
    const adesso = chiaveOra(Date.now());
    return {
        ultimoGiro: d.ultimoGiro || null,
        // gli invii sono fermi fino a questo istante (0: non sono fermi), dopo quanti rifiuti di fila
        sospesoFino: (Number(d.sospesoFino) || 0) > Date.now() ? Number(d.sospesoFino) : 0, rifiuti: Number(d.rifiuti) || 0,
        // l'ultimo rifiuto del gestore, finche' una PEC non riparte davvero: { quando, testo, spiegazione }
        rifiuto: d.rifiuto && d.rifiuto.testo ? d.rifiuto : null,
        inCorso: !!(d.lucchetto && d.lucchetto.fino > Date.now()),
        inviateNellOra: d.ora === adesso ? (Number(d.inviati) || 0) : 0,
        tettoOrario: C.LIMITI.perOra
    };
}

/* Quante schede hanno qualcosa di dovuto adesso (al massimo `max`). */
async function inAttesa(db, max) {
    const q = await db.collection(DATI.INVII).where('prossimo', '<=', Date.now()).orderBy('prossimo').limit(max || 50).get();
    return q.docs.length;
}

/* Un giro. `opz`: { budgetMs, max, da, forza, nuove }. Torna sempre un
   riepilogo. `forza`: si spedisce anche se gli invii sono in pausa dopo un
   rifiuto. `nuove`: in pausa si provano comunque le lettere mai respinte
   (qualcuno ha appena premuto Invia): se partono, il blocco non era di tutti. */
async function giro(db, opz) {
    opz = opz || {};
    const inizio = Date.now();
    if (!C.configurato()) {
        return { ok: false, esito: 'non-configurato', msg: 'La casella PEC delle circolarizzazioni non è configurata (CIRC_PEC_USER e CIRC_PEC_PASS).' };
    }
    if (C.configurazione().proxyErrato) {
        // la variabile c'e' ma non si legge: spedire senza ponte darebbe di nuovo il rifiuto del gestore, e non si capirebbe perche'
        const msg = 'La variabile CIRC_PEC_PROXY non è un indirizzo valido: deve avere la forma http://utente:password@indirizzo:porta. Le lettere restano in coda.';
        await ERRORI.segna(db, { chiave: 'server~ponte', tipo: 'server', titolo: 'Il ponte per gli invii non è configurato bene', dettaglio: msg });
        return { ok: false, esito: 'non-configurato', msg: msg, inviate: 0, errori: 0, restanti: true };
    }
    const preso = await prendiLucchetto(db, opz.da || 'giro');
    if (!preso.preso) return { ok: true, esito: 'occupato', msg: 'Un invio è già in corso.', inviate: 0, errori: 0 };
    const prima = preso.stato || {};
    const oraChiave = chiaveOra(inizio);
    const giaNellOra = prima.ora === oraChiave ? (Number(prima.inviati) || 0) : 0;
    const budget = Number(opz.budgetMs) || 200000;
    const disponibili = Math.min(Number(opz.max) || C.LIMITI.perGiro, C.LIMITI.perOra - giaNellOra);
    const conto = { inviate: 0, errori: 0, saltate: 0, solleciti: 0, respinte: 0 };
    let fermato = '', rifiutato = false, restanti = false, incarichi = {};
    let tentate = 0, ultimoDubbio = '';
    const inDubbio = [];            // respinte in questo giro senza sapere ancora se il problema e' loro o del servizio
    const ultimoOk = Number(prima.ultimoOk) || 0;       // l'ultima volta che una PEC e' partita

    // il gestore ha appena respinto il servizio: fino alla fine della pausa non si riprova (salvo chi lo chiede a mano)
    const sospesoFino = Number(prima.sospesoFino) || 0;
    const inPausa = !opz.forza && sospesoFino > inizio;
    const sospeso = () => ({ ok: false, esito: 'sospeso', sospesoFino: sospesoFino, msg: 'Il gestore della PEC ha sospeso gli invii: le lettere restano in coda e si riprova alle ' + C.oraBreve(sospesoFino) + '.', inviate: 0, errori: 0, restanti: true });
    if (inPausa && !opz.nuove) {
        await mollaLucchetto(db);
        return sospeso();
    }
    // in pausa, ma qualcuno ha appena premuto Invia: si provano solo le lettere mai respinte
    const soloNuove = inPausa;

    if (disponibili <= 0) {
        await mollaLucchetto(db);
        return { ok: true, esito: 'tetto', msg: 'Raggiunto il tetto di ' + C.LIMITI.perOra + ' PEC all\'ora: le altre partono nell\'ora successiva.', inviate: 0, errori: 0, restanti: true };
    }

    let posta = null;
    try {
        let lettoreOk = 0, mai = true;
        try {
            const s = await db.collection('meta').doc('circLettore').get();
            const dl = s.exists ? (s.data() || {}) : {};
            lettoreOk = Number(dl.ultimoOk) || 0;
            mai = !dl.uidValidity;
        } catch (_) { lettoreOk = 0; }
        /* La casella non e' mai stata letta: lo si fa adesso, PRIMA di spedire
           la prima PEC. Fissa il punto da cui il lettore partira' (lib/
           circ-lettore.js), e verifica che la lettura funzioni: spedire senza
           poter leggere le ricevute vorrebbe dire non sapere mai se le lettere
           sono arrivate. */
        if (mai) {
            const primo = await require('./circ-lettore').giro(db, { da: 'primo avvio', forza: true, budgetMs: 20000 });
            if (!primo.ok) {
                await mollaLucchetto(db);
                await ERRORI.segna(db, { chiave: 'casella~primo-avvio', tipo: 'casella', titolo: 'Le lettere restano in coda: la casella PEC non si legge', dettaglio: primo.msg || 'Prima di spedire la prima PEC va letta la casella, e la lettura non è riuscita.' });
                return { ok: false, esito: 'casella', msg: 'Le lettere restano in coda: prima di spedire va letta la casella PEC, e la lettura non è riuscita' + (primo.msg ? ' (' + primo.msg + ')' : '') + '.', inviate: 0, errori: 0, restanti: true };
            }
            lettoreOk = Number(primo.quando) || Date.now();
        }
        // qualcuna in piu' di quante se ne possono spedire: alcune si saltano (risposta arrivata, in verifica)
        const dovute = await db.collection(DATI.INVII).where('prossimo', '<=', inizio).orderBy('prossimo').limit(disponibili + 25).get();
        const mitt = C.configurazione();
        for (const doc of dovute.docs) {
            if (conto.inviate >= disponibili || Date.now() - inizio > budget) { restanti = true; break; }
            if (soloNuove && DATI.respintaInAttesa(doc.data() || {}, Date.now())) { restanti = true; continue; }     // gia' respinta: aspetta la fine della pausa
            const lavoro = await DATI.prendi(db, doc.id, Date.now(), lettoreOk);
            if (lavoro.saltato) { conto.saltate++; continue; }
            const inv = lavoro.invio;
            const allegato = await DATI.leggiAllegato(db, inv.id, (inv.allegato || {}).pezzi || 0);
            if (!allegato || allegato.length !== inv.allegato.dimensione) {
                await DATI.esitoInvio(db, inv.id, lavoro.passo, lavoro.riferimento, { ok: false, msg: 'Il PDF della lettera non si legge più: prepara una nuova lettera.' });
                conto.errori++;
                continue;
            }
            const m = C.messaggio(inv, lavoro.passo);
            if (!posta) posta = trasporto();
            tentate++;
            try {
                await posta.sendMail({
                    from: '"' + mitt.nome + '" <' + mitt.mittente + '>',
                    to: inv.pec,
                    subject: m.oggetto, text: m.testo, html: m.html,
                    // il filo per ritrovare le ricevute: il gestore lo ricopia in ognuna
                    messageId: '<' + lavoro.riferimento + '>',
                    headers: { 'X-Circolarizzazione': inv.codice },
                    attachments: [{ filename: inv.allegato.nome, content: allegato, contentType: 'application/pdf' }]
                });
                await DATI.esitoInvio(db, inv.id, lavoro.passo, lavoro.riferimento, { ok: true });
                conto.inviate++;
                if (lavoro.passo !== 'primo') conto.solleciti++;
                incarichi[inv.incaricoId] = 1;
                // una PEC e' partita: il servizio funziona, quindi la lettera respinta poco fa ha un problema suo
                for (const d of inDubbio.splice(0)) { if (await DATI.rifiutoProprio(db, d.id, d.passo, Date.now())) conto.respinte++; }
            } catch (e) {
                let testo = String((e && (e.response || e.message)) || 'errore').replace(/\s+/g, ' ').slice(0, 250);
                // l'indirizzo del ponte non va in giro: l'avviso lo leggono tutti quelli dell'incarico
                const hostPonte = (mitt.proxyDove || '').replace(/:\d+$/, '');
                if (hostPonte) testo = testo.split(hostPonte).join('[ponte]');
                if (fermaTutto(e)) {
                    const certo = bloccoCerto(e);
                    const p0 = (inv.passi || {})[lavoro.passo] || {};
                    /* Il problema e' di QUESTA lettera se intanto le altre
                       partono: in questo giro, o fra un suo rifiuto e l'altro.
                       Si ritenta da sola, e le altre vanno avanti. */
                    if (!certo && (p0.propria || conto.inviate > 0 || (p0.respintaIl && ultimoOk > p0.respintaIl))) {
                        await DATI.esitoInvio(db, inv.id, lavoro.passo, lavoro.riferimento, { ok: false, riprova: true, propria: true, msg: testo });
                        conto.respinte++;
                        await aspetta(C.LIMITI.pausaMs);
                        continue;
                    }
                    await DATI.esitoInvio(db, inv.id, lavoro.passo, lavoro.riferimento, { ok: false, riprova: true, msg: testo });
                    ultimoDubbio = testo;
                    /* Una PEC bloccata non tiene ferme le altre: prima di
                       fermare tutto si prova la lettera dopo. Se parte, il
                       problema era di questa; se viene respinta anche lei, e'
                       il servizio a essere bloccato. */
                    if (!certo && !soloNuove && !inDubbio.length) {
                        inDubbio.push({ id: inv.id, passo: lavoro.passo });
                        await aspetta(C.LIMITI.pausaMs);
                        continue;
                    }
                    fermato = testo;
                    rifiutato = true;
                    restanti = true;
                    break;
                }
                await DATI.esitoInvio(db, inv.id, lavoro.passo, lavoro.riferimento, { ok: false, msg: 'Il server PEC ha rifiutato il messaggio: ' + testo });
                conto.errori++;
            }
            await aspetta(C.LIMITI.pausaMs);
        }
        if (!restanti && dovute.docs.length >= disponibili + 25) restanti = true;
        // l'unica lettera tentata e' stata respinta e nessun'altra e' partita: non si puo' dire che il problema sia suo
        if (!fermato && inDubbio.length) { fermato = ultimoDubbio; rifiutato = true; restanti = true; }
    } catch (e) {
        fermato = fermato || String((e && e.message) || 'errore').slice(0, 250);
    } finally {
        if (posta) { try { posta.close(); } catch (_) { /* gia' chiusa */ } }
    }

    /* Il gestore ha respinto il servizio: gli invii si fermano per un po', ogni
       volta di piu' se si ripete. Un giro che ha spedito almeno una PEC senza
       rifiuti azzera la conta. */
    const fine = Date.now();
    // in pausa non c'era nessuna lettera nuova da provare: resta tutto com'e'
    if (soloNuove && !tentate && !fermato) {
        await mollaLucchetto(db);
        return sospeso();
    }
    /* Una lettera nuova provata durante la pausa e respinta conferma il blocco,
       ma non allunga la pausa: altrimenti ogni Invia la sposterebbe in avanti. */
    const conferma = rifiutato && soloNuove;
    const rifiuti = conferma ? (Number(prima.rifiuti) || 0) : (rifiutato ? (Number(prima.rifiuti) || 0) + 1 : (conto.inviate ? 0 : (Number(prima.rifiuti) || 0)));
    const finoA = conferma ? sospesoFino : (rifiutato ? fine + pausaDopo(rifiuti) : (conto.inviate ? 0 : Math.max(0, sospesoFino > fine ? sospesoFino : 0)));
    /* L'ultimo rifiuto resta scritto finche' una PEC non parte davvero: un giro
       che non ha trovato niente da spedire non dimostra che il blocco e' finito. */
    const rifiuto = rifiutato ? { quando: fine, testo: fermato, spiegazione: spiegaRifiuto(fermato) } : (conto.inviate ? null : (prima.rifiuto || null));
    // il giro si e' fermato per un rifiuto che riguarda la casella (tetto, blocco, password) o per un guasto
    if (fermato) {
        await ERRORI.segna(db, {
            chiave: 'server~invii-sospesi', tipo: 'server', titolo: 'Il server PEC ha sospeso gli invii',
            // prima che cosa succede adesso, poi il perche' (il registro tiene 600 caratteri)
            dettaglio: fermato.slice(0, 170) + '. ' + (rifiutato ? 'Le lettere restano in coda: il servizio riprova da solo alle ' + C.oraBreve(finoA) + (rifiuti > 1 ? ' (è il ' + rifiuti + '° rifiuto di fila)' : '') + '. ' + spiegaRifiuto(fermato) : 'Le lettere restano in coda e ripartono da sole al prossimo giro.')
        });
    }
    const riepilogo = {
        quando: fine, durataMs: fine - inizio, da: String(opz.da || 'giro').slice(0, 120),
        inviate: conto.inviate, solleciti: conto.solleciti, errori: conto.errori, saltate: conto.saltate,
        // lettere respinte dal gestore mentre le altre partivano: si ritentano da sole
        respinte: conto.respinte,
        restanti: restanti, fermato: fermato, spiegazione: rifiutato ? spiegaRifiuto(fermato) : ''
    };
    await mollaLucchetto(db, { ora: oraChiave, inviati: giaNellOra + conto.inviate, ultimoGiro: riepilogo, rifiuti: rifiuti, sospesoFino: finoA, rifiuto: rifiuto, ultimoOk: conto.inviate ? fine : ultimoOk });
    return Object.assign({
        ok: !fermato, esito: fermato ? 'fermato' : 'ok', incarichi: Object.keys(incarichi), sospesoFino: finoA,
        msg: fermato ? 'Invio sospeso dal server PEC: ' + fermato + '. Le lettere restano in coda' + (rifiutato ? ': si riprova alle ' + C.oraBreve(finoA) + '.' : ' e ripartono da sole.') : ''
    }, riepilogo);
}

module.exports = { giro, stato, inAttesa, _interni: { fermaTutto, bloccoCerto, docGiro, pausaDopo, spiegaRifiuto } };
