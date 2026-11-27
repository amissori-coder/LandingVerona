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

   PIU' CASELLE. Ogni lettera parte dalla casella su cui e' nata (lib/
   circ-comune.js, caselle): quella dello studio, o quella di chi ha la
   revisione legale negli incarichi "per conto di". Ogni casella ha il
   suo collegamento e la sua pausa dopo un rifiuto del gestore: una
   casella bloccata non ferma le lettere delle altre. Lo stato della
   casella dello studio sta dove e' sempre stato (meta/circGiro), quello
   delle altre sotto `caselle`. Il lucchetto e il tetto orario sono uno
   solo per tutte.
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
function spiegaRifiuto(testo, cfg) {
    const t = String(testo || '').toLowerCase();
    const conPonte = !!(cfg || C.configurazione()).proxy;
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
/* Da quale indirizzo di rete e' uscito il servizio. Lo chiede l'assistenza del
   gestore per autorizzare la casella, e una funzione non ha un indirizzo suo:
   lo si domanda a un servizio che lo restituisce (una lettura: non esce nessun
   dato). Si chiede subito dopo il rifiuto, dalla stessa esecuzione. Senza
   risposta in tre secondi si fa a meno. CIRC_IP_SERVIZI: gli indirizzi a cui
   chiedere, separati da virgola (vuota: non si chiede). */
const IP_SERVIZI = ['https://checkip.amazonaws.com/', 'https://api.ipify.org/'];
async function indirizzoUscita() {
    const elenco = process.env.CIRC_IP_SERVIZI == null ? IP_SERVIZI : String(process.env.CIRC_IP_SERVIZI).split(',').map(x => x.trim()).filter(Boolean);
    for (const u of elenco) {
        try {
            const r = await fetch(u, { signal: AbortSignal.timeout(3000) });
            const t = String(await r.text()).trim();
            if (/^[0-9a-f.:]{7,45}$/i.test(t)) return t;
        } catch (_) { /* si prova il successivo */ }
    }
    return '';
}
function docGiro(db) { return db.collection('meta').doc('circGiro'); }
function aspetta(ms) { return ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve(); }

function trasporto(casella) {
    const c = C.configurazione(casella);
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
    // le altre caselle: la loro pausa e il loro ultimo rifiuto
    const altre = {};
    C.caselle().filter(k => k.id !== C.STUDIO).forEach(k => {
        const x = (d.caselle || {})[k.id] || {};
        altre[k.id] = {
            sospesoFino: (Number(x.sospesoFino) || 0) > Date.now() ? Number(x.sospesoFino) : 0, rifiuti: Number(x.rifiuti) || 0,
            rifiuto: x.rifiuto && x.rifiuto.testo ? x.rifiuto : null, ultimoOk: Number(x.ultimoOk) || 0
        };
    });
    return {
        caselle: altre,
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
    const configurate = C.caselle().filter(k => C.configurato(k.id)).map(k => k.id);
    if (!configurate.length) {
        return { ok: false, esito: 'non-configurato', msg: 'La casella PEC delle circolarizzazioni non è configurata (CIRC_PEC_USER e CIRC_PEC_PASS).' };
    }
    // con la sola casella dello studio il giro fa esattamente quello che ha sempre fatto
    const soloStudio = configurate.length === 1 && configurate[0] === C.STUDIO;
    if (C.configurato() && C.configurazione().proxyErrato) {
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
    let restanti = false, incarichi = {};

    /* Ogni casella con il suo stato: il collegamento, la pausa dopo un
       rifiuto, le lettere "in dubbio". Quella dello studio si legge dai campi
       di sempre, le altre da `caselle`. */
    const ctx = {};
    const casellaDi = id => {
        id = C.idCasella(id);
        if (ctx[id]) return ctx[id];
        const st = id === C.STUDIO ? prima : (((prima.caselle || {})[id]) || {});
        const sospesoFino = Number(st.sospesoFino) || 0;
        const inPausa = !opz.forza && sospesoFino > inizio;
        ctx[id] = {
            id: id, cfg: C.configurazione(id), st: st, posta: null, inviate: 0, tentate: 0,
            fermato: '', rifiutato: false, inDubbio: [], ultimoDubbio: '',
            ultimoOk: Number(st.ultimoOk) || 0,         // l'ultima volta che una PEC e' partita da questa casella
            sospesoFino: sospesoFino, inPausa: inPausa,
            soloNuove: inPausa,                          // in pausa, ma qualcuno ha appena premuto Invia: si provano solo le lettere mai respinte
            lettoreOk: null, bloccata: ''
        };
        if (!C.configurato(id)) ctx[id].bloccata = 'La casella PEC «' + ctx[id].cfg.etichetta + '» non è configurata sul servizio.';
        else if (id !== C.STUDIO && ctx[id].cfg.proxyErrato) ctx[id].bloccata = 'Il ponte della casella «' + ctx[id].cfg.etichetta + '» non è un indirizzo valido.';
        return ctx[id];
    };
    const studio = casellaDi(C.STUDIO);
    const sospeso = () => ({ ok: false, esito: 'sospeso', sospesoFino: studio.sospesoFino, msg: 'Il gestore della PEC ha sospeso gli invii: le lettere restano in coda e si riprova alle ' + C.oraBreve(studio.sospesoFino) + '.', inviate: 0, errori: 0, restanti: true });
    if (soloStudio && studio.inPausa && !opz.nuove) {
        await mollaLucchetto(db);
        return sospeso();
    }

    if (disponibili <= 0) {
        await mollaLucchetto(db);
        return { ok: true, esito: 'tetto', msg: 'Raggiunto il tetto di ' + C.LIMITI.perOra + ' PEC all\'ora: le altre partono nell\'ora successiva.', inviate: 0, errori: 0, restanti: true };
    }

    /* Prima di spedire la prima PEC da una casella, la casella si legge: fissa
       il punto da cui il lettore partira' (lib/circ-lettore.js) e verifica che
       la lettura funzioni. Spedire senza poter leggere le ricevute vorrebbe
       dire non sapere mai se le lettere sono arrivate. Torna '' se si puo'
       spedire, altrimenti il motivo. */
    const LETTORE = require('./circ-lettore');
    const pronta = async x => {
        if (x.lettoreOk !== null) return x.bloccata;
        let mai = true;
        try {
            const s0 = await db.collection('meta').doc(LETTORE.nomeMeta(x.id)).get();
            const dl = s0.exists ? (s0.data() || {}) : {};
            x.lettoreOk = Number(dl.ultimoOk) || 0;
            mai = !dl.uidValidity;
        } catch (_) { x.lettoreOk = 0; }
        if (mai && !x.bloccata) {
            const primo = await LETTORE.giro(db, { da: 'primo avvio', forza: true, budgetMs: 20000, casella: x.id });
            if (!primo.ok) {
                const quale = x.id === C.STUDIO ? '' : ' («' + x.cfg.etichetta + '»)';
                await ERRORI.segna(db, { chiave: 'casella~primo-avvio' + (x.id === C.STUDIO ? '' : '~' + x.id), tipo: 'casella', titolo: 'Le lettere restano in coda: la casella PEC' + quale + ' non si legge', dettaglio: primo.msg || 'Prima di spedire la prima PEC va letta la casella, e la lettura non è riuscita.' });
                x.bloccata = 'Le lettere restano in coda: prima di spedire va letta la casella PEC' + quale + ', e la lettura non è riuscita' + (primo.msg ? ' (' + primo.msg + ')' : '') + '.';
            } else x.lettoreOk = Number(primo.quando) || Date.now();
        }
        return x.bloccata;
    };
    if (C.configurato()) {
        const no = await pronta(studio);
        if (no && soloStudio) {
            await mollaLucchetto(db);
            return { ok: false, esito: 'casella', msg: no, inviate: 0, errori: 0, restanti: true };
        }
    }

    try {
        // qualcuna in piu' di quante se ne possono spedire: alcune si saltano (risposta arrivata, in verifica)
        const dovute = await db.collection(DATI.INVII).where('prossimo', '<=', inizio).orderBy('prossimo').limit(disponibili + 25).get();
        for (const doc of dovute.docs) {
            if (conto.inviate >= disponibili || Date.now() - inizio > budget) { restanti = true; break; }
            const x = casellaDi((doc.data() || {}).casella);
            // questa casella e' ferma (rifiuto del gestore in questo giro, pausa, casella non pronta): la lettera aspetta
            if (x.fermato || (x.inPausa && !opz.nuove)) { restanti = true; continue; }
            if (await pronta(x)) { restanti = true; continue; }
            if (x.soloNuove && DATI.respintaInAttesa(doc.data() || {}, Date.now())) { restanti = true; continue; }     // gia' respinta: aspetta la fine della pausa
            const lavoro = await DATI.prendi(db, doc.id, Date.now(), x.lettoreOk);
            if (lavoro.saltato) { conto.saltate++; continue; }
            const inv = lavoro.invio;
            const allegato = await DATI.leggiAllegato(db, inv.id, (inv.allegato || {}).pezzi || 0);
            if (!allegato || allegato.length !== inv.allegato.dimensione) {
                await DATI.esitoInvio(db, inv.id, lavoro.passo, lavoro.riferimento, { ok: false, msg: 'Il PDF della lettera non si legge più: prepara una nuova lettera.' });
                conto.errori++;
                continue;
            }
            const m = C.messaggio(inv, lavoro.passo);
            if (!x.posta) x.posta = trasporto(x.id);
            x.tentate++;
            // a nome di chi: chi ha la revisione legale, negli incarichi "per conto di"
            const nome = String((inv.committente && inv.committente.nome) || x.cfg.nome).replace(/[\r\n"]/g, ' ').slice(0, 80);
            try {
                await x.posta.sendMail({
                    from: '"' + nome + '" <' + x.cfg.mittente + '>',
                    to: inv.pec,
                    subject: m.oggetto, text: m.testo, html: m.html,
                    // il filo per ritrovare le ricevute: il gestore lo ricopia in ognuna
                    messageId: '<' + lavoro.riferimento + '>',
                    headers: { 'X-Circolarizzazione': inv.codice },
                    attachments: [{ filename: inv.allegato.nome, content: allegato, contentType: 'application/pdf' }]
                });
                await DATI.esitoInvio(db, inv.id, lavoro.passo, lavoro.riferimento, { ok: true });
                conto.inviate++; x.inviate++;
                if (lavoro.passo !== 'primo') conto.solleciti++;
                incarichi[inv.incaricoId] = 1;
                // una PEC e' partita da questa casella: funziona, quindi la lettera respinta poco fa ha un problema suo
                for (const d of x.inDubbio.splice(0)) { if (await DATI.rifiutoProprio(db, d.id, d.passo, Date.now())) conto.respinte++; }
            } catch (e) {
                let testo = String((e && (e.response || e.message)) || 'errore').replace(/\s+/g, ' ').slice(0, 250);
                // l'indirizzo del ponte non va in giro: l'avviso lo leggono tutti quelli dell'incarico
                const hostPonte = (x.cfg.proxyDove || '').replace(/:\d+$/, '');
                if (hostPonte) testo = testo.split(hostPonte).join('[ponte]');
                if (fermaTutto(e)) {
                    const certo = bloccoCerto(e);
                    const p0 = (inv.passi || {})[lavoro.passo] || {};
                    /* Il problema e' di QUESTA lettera se intanto le altre della
                       stessa casella partono: in questo giro, o fra un suo
                       rifiuto e l'altro. Si ritenta da sola, e le altre vanno avanti. */
                    if (!certo && (p0.propria || x.inviate > 0 || (p0.respintaIl && x.ultimoOk > p0.respintaIl))) {
                        await DATI.esitoInvio(db, inv.id, lavoro.passo, lavoro.riferimento, { ok: false, riprova: true, propria: true, msg: testo });
                        conto.respinte++;
                        await aspetta(C.LIMITI.pausaMs);
                        continue;
                    }
                    await DATI.esitoInvio(db, inv.id, lavoro.passo, lavoro.riferimento, { ok: false, riprova: true, msg: testo });
                    x.ultimoDubbio = testo;
                    /* Una PEC bloccata non tiene ferme le altre: prima di
                       fermare la casella si prova la lettera dopo. Se parte, il
                       problema era di questa; se viene respinta anche lei, e'
                       la casella a essere bloccata. */
                    if (!certo && !x.soloNuove && !x.inDubbio.length) {
                        x.inDubbio.push({ id: inv.id, passo: lavoro.passo });
                        await aspetta(C.LIMITI.pausaMs);
                        continue;
                    }
                    x.fermato = testo;
                    x.rifiutato = true;
                    restanti = true;
                    // con una casella sola non c'e' altro da provare
                    if (soloStudio) break;
                    continue;
                }
                await DATI.esitoInvio(db, inv.id, lavoro.passo, lavoro.riferimento, { ok: false, msg: 'Il server PEC ha rifiutato il messaggio: ' + testo });
                conto.errori++;
            }
            await aspetta(C.LIMITI.pausaMs);
        }
        if (!restanti && dovute.docs.length >= disponibili + 25) restanti = true;
        // l'unica lettera tentata e' stata respinta e nessun'altra della casella e' partita: non si puo' dire che il problema sia suo
        Object.values(ctx).forEach(x => { if (!x.fermato && x.inDubbio.length) { x.fermato = x.ultimoDubbio; x.rifiutato = true; restanti = true; } });
    } catch (e) {
        studio.fermato = studio.fermato || String((e && e.message) || 'errore').slice(0, 250);
    } finally {
        Object.values(ctx).forEach(x => { if (x.posta) { try { x.posta.close(); } catch (_) { /* gia' chiusa */ } } });
    }

    /* Il gestore ha respinto una casella: i suoi invii si fermano per un po',
       ogni volta di piu' se si ripete. Un giro che ha spedito almeno una PEC
       senza rifiuti azzera la conta. */
    const fine = Date.now();
    // in pausa non c'era nessuna lettera nuova da provare: resta tutto com'e'
    if (soloStudio && studio.soloNuove && !studio.tentate && !studio.fermato) {
        await mollaLucchetto(db);
        return sospeso();
    }
    const chiudiCasella = async x => {
        const st = x.st;
        /* Una lettera nuova provata durante la pausa e respinta conferma il blocco,
           ma non allunga la pausa: altrimenti ogni Invia la sposterebbe in avanti. */
        const conferma = x.rifiutato && x.soloNuove;
        const rifiuti = conferma ? (Number(st.rifiuti) || 0) : (x.rifiutato ? (Number(st.rifiuti) || 0) + 1 : (x.inviate ? 0 : (Number(st.rifiuti) || 0)));
        const finoA = conferma ? x.sospesoFino : (x.rifiutato ? fine + pausaDopo(rifiuti) : (x.inviate ? 0 : Math.max(0, x.sospesoFino > fine ? x.sospesoFino : 0)));
        /* L'ultimo rifiuto resta scritto finche' una PEC non parte davvero: un giro
           che non ha trovato niente da spedire non dimostra che il blocco e' finito. */
        // `ip` e `regione` ci sono sempre: il documento si scrive unendo i campi, e quelli di un rifiuto vecchio resterebbero li'
        let rifiuto = x.rifiutato ? { quando: fine, testo: x.fermato, spiegazione: spiegaRifiuto(x.fermato, x.cfg), ip: '', regione: '' } : (x.inviate ? null : (st.rifiuto || null));
        /* Il gestore ha respinto l'indirizzo di rete: per autorizzare la casella la
           sua assistenza chiede da quale indirizzo ci si e' collegati e quando.
           Con il ponte l'indirizzo e' il suo, e non serve chiederlo. */
        if (x.rifiutato && !x.cfg.proxy && /bloccat|blocked|abus|5\.7\.\d/i.test(x.fermato)) {
            rifiuto = Object.assign(rifiuto, { ip: await indirizzoUscita(), regione: String(process.env.VERCEL_REGION || '').slice(0, 20) });
        }
        // il giro si e' fermato per un rifiuto che riguarda la casella (tetto, blocco, password) o per un guasto
        if (x.fermato) {
            const quale = x.id === C.STUDIO ? '' : ' («' + x.cfg.etichetta + '»)';
            await ERRORI.segna(db, {
                chiave: 'server~invii-sospesi' + (x.id === C.STUDIO ? '' : '~' + x.id), tipo: 'server', titolo: 'Il server PEC ha sospeso gli invii' + quale,
                // prima che cosa succede adesso, poi il perche' (il registro tiene 600 caratteri)
                dettaglio: x.fermato.slice(0, 170) + '. ' + (x.rifiutato ? 'Le lettere restano in coda: il servizio riprova da solo alle ' + C.oraBreve(finoA) + (rifiuti > 1 ? ' (è il ' + rifiuti + '° rifiuto di fila)' : '') + '. ' + spiegaRifiuto(x.fermato, x.cfg) : 'Le lettere restano in coda e ripartono da sole al prossimo giro.')
            });
        }
        return { rifiuti: rifiuti, sospesoFino: finoA, rifiuto: rifiuto, ultimoOk: x.inviate ? fine : x.ultimoOk };
    };
    const esiti = {};
    for (const x of Object.values(ctx)) esiti[x.id] = await chiudiCasella(x);
    const fermate = Object.values(ctx).filter(x => x.fermato);
    const primaFerma = fermate[0] || null;
    const detto = x => (x.id === C.STUDIO || soloStudio ? '' : '«' + x.cfg.etichetta + '»: ') + x.fermato;
    const fermato = fermate.map(detto).join(' · ');
    const riepilogo = {
        quando: fine, durataMs: fine - inizio, da: String(opz.da || 'giro').slice(0, 120),
        inviate: conto.inviate, solleciti: conto.solleciti, errori: conto.errori, saltate: conto.saltate,
        // lettere respinte dal gestore mentre le altre partivano: si ritentano da sole
        respinte: conto.respinte,
        restanti: restanti, fermato: fermato, spiegazione: primaFerma && primaFerma.rifiutato ? spiegaRifiuto(primaFerma.fermato, primaFerma.cfg) : ''
    };
    const campi = Object.assign({ ora: oraChiave, inviati: giaNellOra + conto.inviate, ultimoGiro: riepilogo }, esiti[C.STUDIO]);
    const altre = Object.keys(esiti).filter(id => id !== C.STUDIO);
    if (altre.length) campi.caselle = altre.reduce((o, id) => { o[id] = esiti[id]; return o; }, {});
    await mollaLucchetto(db, campi);
    const rifiutata = fermate.some(x => x.rifiutato);
    const finoA = esiti[C.STUDIO].sospesoFino;
    const quandoRiprova = primaFerma && primaFerma.rifiutato ? C.oraBreve(esiti[primaFerma.id].sospesoFino) : '';
    return Object.assign({
        ok: !fermato, esito: fermato ? 'fermato' : 'ok', incarichi: Object.keys(incarichi), sospesoFino: finoA,
        msg: fermato ? 'Invio sospeso dal server PEC: ' + fermato + '. Le lettere restano in coda' + (rifiutata ? ': si riprova alle ' + quandoRiprova + '.' : ' e ripartono da sole.') : '',
        caselle: altre.length ? altre.reduce((o, id) => { o[id] = { inviate: ctx[id].inviate, fermato: ctx[id].fermato || ctx[id].bloccata, sospesoFino: esiti[id].sospesoFino }; return o; }, {}) : undefined
    }, riepilogo);
}

module.exports = { giro, stato, inAttesa, _interni: { fermaTutto, bloccoCerto, docGiro, pausaDopo, spiegaRifiuto, indirizzoUscita } };
