/* ============================================================
   Il lettore della casella PEC: ricevute, errori e risposte
   ------------------------------------------------------------
   Dopo un invio PEC il gestore risponde nella casella del mittente:
   accettazione, avvenuta consegna, mancata consegna. E, se l'azienda
   scrive, arriva anche la sua risposta. Tutto quello che serve per
   dire "consegnata / non consegnata / ha risposto" e' li' dentro:
   qui c'e' il pezzo che va a prenderlo e lo riporta sulla scheda
   dell'azienda giusta.

   TRE SCELTE CHE VALE LA PENA SPIEGARE

   1. SOLA LETTURA, sempre. Non si segna niente come letto, non si
      sposta e non si cancella nulla. Quella casella e' l'archivio con
      valore legale dello studio, e il contrassegno "letto" e' condiviso
      con la webmail: se il lettore ci si appoggiasse, basterebbe che
      qualcuno aprisse la posta dal browser per mandarlo fuori strada.
      Il segnaposto sta su Firestore, ed e' l'unico a decidere.

   2. INCREMENTALE E RIPRENDIBILE. La funzione ha 60 secondi e la
      casella puo' avere anni di posta dentro: si legge una finestra
      di messaggi per volta, sempre delimitata in alto e in basso, e
      si riprende esattamente da dove si era arrivati. Un giro che
      finisce il tempo non e' un errore: risponde "restanti: si" e il
      giro dopo continua.

   3. FATTI MONOTONI, non uno stato che si sovrascrive. Sulla scheda si
      scrivono tre fatti indipendenti (accettata, consegnata, problema
      con la sua gravita') e l'esito e' una funzione di quei tre. Cosi'
      rileggere due volte la stessa ricevuta non cambia niente, e un
      preavviso che arriva in ritardo non puo' cancellare una consegna
      gia' registrata.

   COSA QUESTO LETTORE NON FA: non verifica la firma S/MIME con cui il
   gestore sigilla le ricevute. Per un cruscotto interno va bene; se un
   domani questi dati dovessero valere in una contestazione, la prova
   resta il messaggio nella casella PEC, non la riga sullo schermo.
   ============================================================ */

/* imapflow si carica alla prima connessione, non all'avvio del file.
   Si porta dietro pino e thread-stream, e thread-stream chiede Node 20 o
   piu': se la macchina che ospita il servizio non ce la fa, con un require
   in cima moriva l'intero endpoint che ci passa attraverso, prima di
   qualunque risposta. Cosi' invece cade solo la lettura della casella, e lo
   dice. Elenco, importazione e invio degli inviti non usano IMAP e non
   devono dipendere da lui. */
let _ImapFlow = null;
function ImapFlowClasse() {
    if (!_ImapFlow) _ImapFlow = require('imapflow').ImapFlow;
    return _ImapFlow;
}
const D = require('./daticert');

const s = v => String(v == null ? '' : v).trim();

function configurazione() {
    return {
        host: s(process.env.PEC_IMAP_HOST) || 'imaps.pec.aruba.it',
        porta: Number(process.env.PEC_IMAP_PORT) || 993,
        // di solito sono le stesse credenziali dell'invio; restano
        // separabili perche' con la verifica in due passaggi attiva Aruba
        // vuole una password dedicata ai programmi di posta
        utente: s(process.env.PEC_IMAP_USER) || s(process.env.PEC_SMTP_USER),
        password: String(process.env.PEC_IMAP_PASS || process.env.PEC_SMTP_PASS || ''),
        cartella: s(process.env.PEC_IMAP_CARTELLA) || 'INBOX'
    };
}
function configurato() {
    const c = configurazione();
    return !!(c.host && c.utente && c.password);
}

/* I numeri si muovono insieme, come in lib/giro-newsletter.js.
   BUDGET_MS sta dentro il maxDuration di vercel.json (60 s) con venti
   secondi di margine per chiudere la connessione e rispondere. */
const BUDGET_MS = 40000;
const MAX_MESSAGGI = Number(process.env.PEC_LETTORE_MAX) || 40;
const FINESTRA_UID = MAX_MESSAGGI * 5;      // quanti UID si chiedono al server per giro
const MAX_DATICERT = 64 * 1024;             // un daticert.xml vero sta in pochi kB
const MAX_TESTO = 200 * 1024;               // il testo di un messaggio che si apre a video
const LUCCHETTO_MS = 3 * 60 * 1000;
const PAUSA_ERRORE_MS = 10 * 60 * 1000;     // dopo un guasto non si ribatte subito
const MAX_ERRORI_AUTH = 3;                  // poi ci si ferma: e' una password da rifare
/* Prima accensione: quanti messaggi guardare all'indietro. Si parte dalla
   posta RECENTE, non dalla piu' vecchia: le ricevute che interessano sono
   quelle degli invii appena fatti, e una casella in uso da anni non si
   finirebbe mai di risalire. */
const RECUPERO = Number(process.env.PEC_LETTORE_RECUPERO) || 200;

const META = ['meta', 'pecLettore'];
const RIF = 'pecRiferimenti';
const VISTI = 'pecMessaggi';
const ORFANE = 'pecNonRiconosciute';
const SCHEDE = 'aziendeInvito';

function docMeta(db) { return db.collection(META[0]).doc(META[1]); }

/* ---------- l'indice dei riferimenti ----------
   Correlare una ricevuta deve costare UNA lettura, non una ricerca:
   per ogni invio si scrivono due piccoli documenti la cui chiave e' il
   Message-ID, e che puntano alla scheda. Il secondo (parte locale) non
   e' pignoleria: su due messaggi veri dello stesso invio il gestore
   riscrive il DOMINIO del riferimento, e senza quell'alias la ricevuta
   di consegna non si aggancerebbe piu'. */
function chiaviInvio(riferimento) {
    return ['m~' + D.chiaveMsgId(riferimento), 'lp~' + D.parteLocale(riferimento)];
}
async function registraRiferimento(db, riferimento, dati) {
    if (!riferimento) return;
    const base = {
        msgid: String(riferimento).slice(0, 400),
        scheda: String(dati.scheda || ''), evento: String(dati.evento || ''),
        destinatario: String(dati.destinatario || '').toLowerCase().slice(0, 200),
        quando: Date.now()
    };
    const b = db.batch();
    chiaviInvio(riferimento).forEach(k => b.set(db.collection(RIF).doc(k), base, { merge: true }));
    await b.commit();
}
/* Il ponte per le RISPOSTE. Il gestore sostituisce il nostro Message-ID
   con uno suo, e quando l'azienda risponde il suo "In-Reply-To" punta a
   quello, non al nostro: senza questo alias, una risposta non si
   riaggancia all'invito. L'identificativo si scopre solo leggendo la
   ricevuta di accettazione, quindi si registra li'. */
async function registraIdentificativo(db, identificativo, dati) {
    if (!identificativo) return;
    await db.collection(RIF).doc('m~' + D.chiaveMsgId(identificativo)).set({
        msgid: String(identificativo).slice(0, 400),
        scheda: String(dati.scheda || ''), evento: String(dati.evento || ''),
        destinatario: String(dati.destinatario || '').toLowerCase().slice(0, 200),
        gestore: true, quando: Date.now()
    }, { merge: true });
}
/* Quando una scheda viene eliminata, i suoi riferimenti se ne vanno con
   lei: dentro ci sono l'indirizzo PEC dell'azienda e il legame con
   l'evento, e una cancellazione fatta a meta' non e' una cancellazione. */
function dimenticaRiferimenti(batch, db, azienda) {
    const inv = (azienda && azienda.invio) || {};
    const chiavi = [];
    if (inv.riferimento) chiavi.push.apply(chiavi, chiaviInvio(inv.riferimento));
    if (inv.pecMsgId) chiavi.push('m~' + D.chiaveMsgId(inv.pecMsgId));
    chiavi.forEach(k => batch.delete(db.collection(RIF).doc(k)));
    return chiavi.length;
}

/* La scheda a cui appartiene un messaggio. Si provano le chiavi in
   ordine di attendibilita' e ci si ferma alla prima che risponde.
   Se il documento trovato porta un msgid diverso da quello cercato, la
   normalizzazione ha fatto collidere due valori: meglio dichiarare il
   messaggio non riconosciuto che attribuirlo alla scheda sbagliata. */
async function trovaScheda(db, candidati) {
    for (const c of candidati) {
        if (!c || !c.chiave || c.chiave.length < 4) continue;
        let snap;
        try { snap = await db.collection(RIF).doc(c.chiave).get(); }
        catch (_) { continue; }
        if (!snap.exists) continue;
        const d = snap.data() || {};
        if (!d.scheda) continue;
        // controllo anti-collisione, fatto sulla stessa forma della chiave
        const atteso = c.chiave.slice(0, 3) === 'lp~' ? D.parteLocale(d.msgid) : D.chiaveMsgId(d.msgid);
        if (atteso && ('lp~' + atteso !== c.chiave && 'm~' + atteso !== c.chiave)) continue;
        return { scheda: d.scheda, evento: d.evento || '', destinatario: d.destinatario || '', via: c.via };
    }
    return null;
}

/* ---------- la scrittura sulla scheda ----------
   Transazione, e tre fatti che possono solo migliorare la conoscenza:
   una consegna non si disfa, un problema piu' grave sostituisce uno
   meno grave e non viceversa. E' questo che rende innocuo rileggere
   due volte la stessa ricevuta. */
async function applicaRicevuta(db, idScheda, fatto) {
    const rif = db.collection(SCHEDE).doc(idScheda);
    return db.runTransaction(async tx => {
        const snap = await tx.get(rif);
        if (!snap.exists) return { ok: false, motivo: 'scheda sparita' };
        const dati = snap.data() || {};
        const r = Object.assign({ accettata: null, consegnata: null, problema: null, risposta: null }, dati.ricevute || {});
        const invio = dati.invio || {};
        const patch = {};
        let cambiato = false;

        if (fatto.genere === 'accettata') {
            if (!r.accettata || (fatto.quando && fatto.quando < r.accettata.quando)) {
                r.accettata = { quando: fatto.quando, gestore: fatto.gestore || '' };
                cambiato = true;
            }
            // l'identificativo del gestore serve ad agganciare le risposte:
            // si conserva sull'invio, dove sta gia' il nostro riferimento
            if (fatto.identificativo && invio.pecMsgId !== fatto.identificativo) {
                /* Mappa annidata, NON la chiave "invio.pecMsgId": dentro set()
                   un punto nel nome del campo non e' un percorso, e si
                   ritroverebbe un campo chiamato per davvero "invio.pecMsgId"
                   accanto a invio. Con merge la mappa si fonde in profondita',
                   quindi gli altri campi dell'invio restano dove sono. */
                patch.invio = Object.assign({}, patch.invio, { pecMsgId: String(fatto.identificativo).slice(0, 250) });
                cambiato = true;
            }
        } else if (fatto.genere === 'consegnata') {
            if (!r.consegnata) {
                r.consegnata = {
                    quando: fatto.quando, destinatario: fatto.destinatario || '',
                    gestore: fatto.gestore || '', tipo: fatto.tipoRicevuta || ''
                };
                cambiato = true;
            }
        } else if (fatto.genere === 'problema') {
            const prima = r.problema;
            /* Solo un problema PIU' grave sostituisce quello che c'e' gia'.
               Non ">=": a parita' di gravita' si riscriverebbe la stessa cosa
               a ogni rilettura, e "l'ultimo aggiornamento" continuerebbe a
               spostarsi senza che sia successo niente di nuovo. */
            if (!prima || (fatto.gravita || 0) > (prima.gravita || 0)) {
                r.problema = {
                    quando: fatto.quando, tipo: fatto.tipo || '', errore: fatto.errore || '',
                    motivo: String(fatto.motivo || '').slice(0, 300),
                    definitivo: !!fatto.definitivo, gravita: fatto.gravita || 1
                };
                cambiato = true;
            }
        } else if (fatto.genere === 'risposta') {
            if (!r.risposta || (fatto.quando || 0) > (r.risposta.quando || 0)) {
                r.risposta = {
                    quando: fatto.quando, da: fatto.da || '',
                    oggetto: String(fatto.oggetto || '').slice(0, 250),
                    certificata: !!fatto.certificata
                };
                cambiato = true;
            }
            /* La sola transizione automatica di stato. Non si tocca chi e'
               gia' segnato come iscritto, escluso o disiscritto: quelle sono
               decisioni di una persona, e una risposta non le annulla. */
            if (dati.stato === 'inviata') patch.stato = 'risposta';
        }

        /* Una scheda rimasta a meta' (il messaggio e' partito ma la funzione
           e' morta prima di scrivere l'esito) si sana qui: il destinatario
           lo sappiamo dalla ricevuta, ed e' il momento giusto per rimetterlo. */
        if (!invio.destinatario && fatto.destinatario) {
            patch.invio = Object.assign({}, patch.invio, { destinatario: fatto.destinatario });
        }

        /* Le coordinate dei messaggi che riguardano questa azienda. NON il
           testo: quello resta nella casella e si va a prendere quando
           qualcuno lo apre davvero. Qui bastano poche decine di byte per
           messaggio, e sono cio' che permette all'area riservata di
           chiederne uno preciso senza poter chiedere gli altri. */
        if (fatto.uid) {
            const elenco = Array.isArray(r.messaggi) ? r.messaggi.slice() : [];
            const chiave = fatto.uidValidity + '_' + fatto.uid;
            if (!elenco.some(x => (x.uidValidity + '_' + x.uid) === chiave)) {
                elenco.push({
                    uid: Number(fatto.uid), uidValidity: String(fatto.uidValidity || ''),
                    tipo: String(fatto.etichetta || fatto.tipo || fatto.genere || '').slice(0, 40),
                    quando: fatto.quando || Date.now(),
                    oggetto: String(fatto.oggetto || '').slice(0, 200)
                });
                elenco.sort((x, y) => (y.quando || 0) - (x.quando || 0));
                r.messaggi = elenco.slice(0, 12);
                cambiato = true;
            }
        }

        if (!cambiato && !Object.keys(patch).length) return { ok: true, cambiato: false };
        r.esito = D.esitoDa(r);
        r.aggiornato = Date.now();
        patch.ricevute = r;
        tx.set(rif, patch, { merge: true });
        return { ok: true, cambiato: true, esito: r.esito };
    });
}

/* ---------- la sessione IMAP ---------- */

function leggiStream(stream, max) {
    return new Promise((risolvi, rifiuta) => {
        let dati = '', letti = 0, finito = false;
        const chiudi = v => { if (!finito) { finito = true; risolvi(v); } };
        stream.on('data', pezzo => {
            letti += pezzo.length;
            if (letti > max) { dati += pezzo.toString('utf8'); stream.destroy(); chiudi(dati.slice(0, max)); return; }
            dati += pezzo.toString('utf8');
        });
        stream.on('end', () => chiudi(dati));
        stream.on('error', e => { if (!finito) { finito = true; rifiuta(e); } });
    });
}

/* Dove sta daticert.xml dentro il messaggio. Le ricevute sono firmate
   S/MIME, quindi l'allegato e' annidato: si scende l'albero delle parti
   invece di indovinare un numero. Si torna anche la dimensione
   dichiarata, per non scaricare mai una parte enorme che qualcuno abbia
   chiamato daticert.xml. */
function trovaParte(nodo, nome) {
    if (!nodo) return null;
    const p = nodo.parameters || {};
    const dp = nodo.dispositionParameters || {};
    const suo = String(dp.filename || p.name || '').toLowerCase();
    if (suo === nome) return { parte: nodo.part || '1', dimensione: Number(nodo.size) || 0 };
    for (const figlio of (nodo.childNodes || [])) {
        const t = trovaParte(figlio, nome);
        if (t) return t;
    }
    return null;
}

/* Il lucchetto: due giri che leggessero insieme la stessa casella
   scriverebbero due volte le stesse cose e si ruberebbero il tempo a
   vicenda. Transazione, cosi' regge anche le richieste in parallelo. */
async function prendiLucchetto(db, chi) {
    return db.runTransaction(async tx => {
        const snap = await tx.get(docMeta(db));
        const d = snap.exists ? (snap.data() || {}) : {};
        const ora = Date.now();
        if (d.lucchetto && d.lucchetto.fino > ora) return { preso: false, fino: d.lucchetto.fino };
        tx.set(docMeta(db), { lucchetto: { fino: ora + LUCCHETTO_MS, chi: String(chi).slice(0, 120) } }, { merge: true });
        return { preso: true, stato: d };
    });
}
async function mollaLucchetto(db, riepilogo) {
    try {
        await docMeta(db).set(Object.assign({ lucchetto: null }, riepilogo || {}), { merge: true });
    } catch (_) { /* al massimo il lucchetto scade da solo fra tre minuti */ }
}

async function stato(db) {
    let d = {};
    try { const snap = await docMeta(db).get(); d = snap.exists ? (snap.data() || {}) : {}; }
    catch (_) { d = {}; }
    const c = configurazione();
    return {
        configurato: configurato(),
        casella: configurato() ? c.utente : '',
        cartella: c.cartella,
        ultimoGiro: d.ultimoGiro || null,
        erroriAuth: d.erroriAuth || 0,
        // la password per i programmi di posta di Aruba scade ogni sei mesi:
        // quando succede il lettore si ferma qui, invece di ribattere all'infinito
        fermoPerCredenziali: (d.erroriAuth || 0) >= MAX_ERRORI_AUTH,
        inCorso: !!(d.lucchetto && d.lucchetto.fino > Date.now())
    };
}

/* Un giro di lettura. Torna sempre un riepilogo, anche quando non fa
   nulla: e' quello che l'area riservata mostra come "ultimo controllo". */
async function giro(db, opz) {
    opz = opz || {};
    const inizio = Date.now();
    if (!configurato()) {
        return { ok: false, esito: 'non-configurato', msg: 'La casella PEC non e configurata per la lettura (PEC_IMAP_USER e PEC_IMAP_PASS, oppure le stesse dell\'invio).' };
    }

    const preso = await prendiLucchetto(db, opz.da || 'area riservata');
    if (!preso.preso) return { ok: false, esito: 'occupato', msg: 'Un altro controllo e gia in corso: riprova fra un minuto.' };
    const prima = preso.stato || {};

    // dopo un guasto non si ribatte subito, e dopo tre errori di password
    // ci si ferma del tutto: un login sbagliato ripetuto fa scattare le
    // protezioni del gestore, e quelle bloccano anche l'INVIO delle PEC
    const ultimo = prima.ultimoGiro || {};
    if (!opz.forza) {
        if ((prima.erroriAuth || 0) >= MAX_ERRORI_AUTH) {
            await mollaLucchetto(db);
            return {
                ok: false, esito: 'credenziali',
                msg: 'Il controllo e fermo: la casella PEC ha rifiutato la password tre volte. Con la verifica in due passaggi attiva serve la "password per i programmi di posta" di Aruba, che scade ogni sei mesi e va rigenerata.'
            };
        }
        if (ultimo.esito === 'errore' && (Date.now() - (ultimo.quando || 0)) < PAUSA_ERRORE_MS) {
            await mollaLucchetto(db);
            return { ok: false, esito: 'in-pausa', msg: 'Il controllo precedente non e riuscito: si riprova fra qualche minuto.', ultimoGiro: ultimo };
        }
    }

    const c = configurazione();
    const client = new (ImapFlowClasse())({
        host: c.host, port: c.porta, secure: true,
        auth: { user: c.utente, pass: c.password },
        logger: false, emitLogs: false,
        socketTimeout: 25000, greetingTimeout: 15000, connectionTimeout: 15000
    });
    // ImapFlow segnala gli errori anche come evento: senza un ascoltatore
    // un guasto di rete farebbe cadere l'intera funzione
    client.on('error', () => { });

    const conto = { letti: 0, ricevute: 0, risposte: 0, estranei: 0, nonRiconosciute: 0 };
    const toccate = {};      // scheda -> esito aggiornato, per l'area riservata
    const nonRiconosciute = [];
    let restanti = false, uidValidity = '', ultimoUid = 0, esito = 'ok', motivo = '';

    try {
        await client.connect();
        const mb = await client.mailboxOpen(c.cartella, { readOnly: true });
        uidValidity = String(mb.uidValidity);
        const uidNext = Number(mb.uidNext) || 1;

        /* Da dove ripartire. Se l'identificativo della cartella e' cambiato
           (il gestore l'ha rigenerata) gli UID salvati non valgono piu': si
           riparte dalla posta RECENTE, non dalla piu' vecchia, perche' le
           ricevute che interessano sono quelle degli invii appena fatti. */
        const stessaCartella = prima.uidValidity === uidValidity && prima.cartella === c.cartella;
        ultimoUid = stessaCartella ? (Number(prima.ultimoUid) || 0) : Math.max(0, uidNext - 1 - RECUPERO);

        const daUid = ultimoUid + 1;
        const aUid = Math.min(uidNext - 1, ultimoUid + FINESTRA_UID);
        if (aUid >= daUid) {
            /* Intervallo SEMPRE chiuso ai due estremi. Con "N:*" il server
               restituisce comunque l'ultimo messaggio anche quando non ce n'e'
               di nuovi, ed e' l'errore classico dei lettori incrementali. */
            const messaggi = [];
            for await (const m of client.fetch({ uid: daUid + ':' + aUid },
                { uid: true, internalDate: true, bodyStructure: true, headers: D.INTESTAZIONI },
                { uid: true })) {
                if (Number(m.uid) <= ultimoUid) continue;
                messaggi.push(m);
                if (messaggi.length >= MAX_MESSAGGI) break;
            }
            messaggi.sort((a, b) => Number(a.uid) - Number(b.uid));

            for (const m of messaggi) {
                if (Date.now() - inizio > BUDGET_MS) { restanti = true; break; }
                const uid = Number(m.uid);
                const chiaveVisto = uidValidity + '_' + uid;
                const rifVisto = db.collection(VISTI).doc(chiaveVisto);
                let gia = false;
                try { gia = (await rifVisto.get()).exists; } catch (_) { gia = false; }
                if (gia) { ultimoUid = uid; continue; }

                let annotato = null;
                try {
                    annotato = await lavoraMessaggio(db, client, m, uidValidity, conto, toccate, nonRiconosciute);
                } catch (e) {
                    /* Un guasto della CONNESSIONE non e' un messaggio storto:
                       se si continuasse, il giro finirebbe dicendo "tutto bene"
                       dopo aver saltato tutto il resto. */
                    if (!client.usable) throw e;
                    annotato = { genere: 'illeggibile', motivo: String((e && e.message) || 'errore').slice(0, 150) };
                    nonRiconosciute.push({ chiave: chiaveVisto, genere: 'illeggibile', motivo: annotato.motivo, oggetto: '', da: '' });
                    conto.nonRiconosciute++;
                }
                /* Il segnaposto si scrive DOPO il lavoro: se si scrivesse prima
                   e qualcosa andasse storto a meta', quella ricevuta risulterebbe
                   gia' vista e non verrebbe mai piu' letta. */
                try {
                    await rifVisto.set({
                        quando: Date.now(), uid: uid, uidValidity: uidValidity,
                        genere: annotato.genere || 'ignorato',
                        /* Dei messaggi che non ci riguardano non si conserva
                           NIENTE, nemmeno l'oggetto: quella e' la PEC dello
                           studio, ci arriva la corrispondenza dei clienti, e
                           per non rileggerli basta sapere che sono passati. */
                        tipo: annotato.tipo || '', scheda: annotato.scheda || null
                    });
                } catch (_) { /* al massimo si rilegge: le scritture sono idempotenti */ }
                conto.letti++;
                ultimoUid = uid;
            }
            if (!restanti && aUid < uidNext - 1) restanti = true;
        }
    } catch (e) {
        const testo = String((e && (e.responseText || e.message)) || 'errore').slice(0, 200);
        const auth = /auth|login|credential|invalid user|password/i.test(testo) || (e && e.authenticationFailed);
        esito = 'errore';
        motivo = auth
            ? 'La casella PEC ha rifiutato le credenziali: ' + testo
            : testo;
        try {
            await docMeta(db).set({
                erroriAuth: auth ? (Number(prima.erroriAuth) || 0) + 1 : 0
            }, { merge: true });
        } catch (_) { /* niente da fare */ }
    } finally {
        try { await client.logout(); } catch (_) { try { client.close(); } catch (_) { } }
    }

    // le non riconosciute si scrivono fuori dal ciclo: sono poche e non
    // devono rubare tempo alla lettura
    if (nonRiconosciute.length) {
        try {
            const b = db.batch();
            nonRiconosciute.slice(0, 50).forEach(x => b.set(db.collection(ORFANE).doc(x.chiave), {
                quando: Date.now(), genere: x.genere || '', motivo: x.motivo || '',
                oggetto: String(x.oggetto || '').slice(0, 250), da: String(x.da || '').slice(0, 200),
                riferimento: String(x.riferimento || '').slice(0, 400), smistata: null
            }, { merge: true }));
            await b.commit();
        } catch (_) { /* non e' grave: il messaggio resta nella casella */ }
    }

    const riepilogo = {
        quando: Date.now(), esito: esito, motivo: motivo,
        durataMs: Date.now() - inizio, restanti: restanti,
        letti: conto.letti, ricevute: conto.ricevute, risposte: conto.risposte,
        estranei: conto.estranei, nonRiconosciute: conto.nonRiconosciute
    };
    const daSalvare = { ultimoGiro: riepilogo };
    if (esito === 'ok') {
        daSalvare.uidValidity = uidValidity;
        daSalvare.cartella = configurazione().cartella;
        daSalvare.ultimoUid = ultimoUid;
        daSalvare.erroriAuth = 0;
    }
    await mollaLucchetto(db, daSalvare);

    return {
        ok: esito === 'ok', esito: esito, msg: motivo,
        ultimoGiro: riepilogo, restanti: restanti,
        // solo le schede toccate da QUESTO giro: l'area riservata aggiorna
        // le righe che ha gia' a video, senza rileggere l'intero elenco
        aggiornate: toccate
    };
}

/* Un singolo messaggio: che cos'e', a chi appartiene, cosa se ne scrive. */
async function lavoraMessaggio(db, client, m, uidValidity, conto, toccate, nonRiconosciute) {
    const h = D.intestazioni(m.headers);
    const g = D.genere(h);
    const chiaveVisto = uidValidity + '_' + Number(m.uid);
    const quandoMsg = m.internalDate ? new Date(m.internalDate).getTime() : Date.now();

    if (g.genere === 'estraneo') { conto.estranei++; return { genere: 'ignorato' }; }

    const riferimento = h['x-riferimento-message-id'] || '';
    const candidati = [];
    if (riferimento) {
        candidati.push({ chiave: 'm~' + D.chiaveMsgId(riferimento), via: 'riferimento' });
        candidati.push({ chiave: 'lp~' + D.parteLocale(riferimento), via: 'riferimento-locale' });
    }
    // per le risposte: il gestore riscrive il nostro Message-ID, quindi
    // l'azienda risponde all'identificativo suo, non al nostro
    [h['in-reply-to'], (h['references'] || '').split(/\s+/).filter(Boolean).pop()].forEach(v => {
        if (v) candidati.push({ chiave: 'm~' + D.chiaveMsgId(v), via: 'risposta' });
    });

    let dc = null;
    if (g.genere === 'ricevuta') {
        const parte = trovaParte(m.bodyStructure, 'daticert.xml');
        if (parte && parte.dimensione <= MAX_DATICERT) {
            try {
                const scaricato = await client.download(m.uid, parte.parte, { uid: true, maxBytes: MAX_DATICERT });
                if (scaricato && scaricato.content) dc = D.leggiDaticert(await leggiStream(scaricato.content, MAX_DATICERT));
            } catch (e) {
                if (!client.usable) throw e;   // connessione caduta: non e' colpa del messaggio
                dc = null;
            }
        }
        if (dc && dc.msgid) candidati.unshift({ chiave: 'm~' + D.chiaveMsgId(dc.msgid), via: 'daticert' });
    }

    const trovata = await trovaScheda(db, candidati);
    if (!trovata) {
        conto.nonRiconosciute++;
        nonRiconosciute.push({
            chiave: chiaveVisto, genere: g.genere,
            motivo: riferimento ? 'riferimento sconosciuto' : 'nessun riferimento',
            oggetto: D.oggettoPulito(h['subject']), da: D.soloIndirizzo(h['from']),
            riferimento: riferimento
        });
        return { genere: 'non-riconosciuto', tipo: g.tipo };
    }

    let fatto = null;
    const coordinate = {
        uid: Number(m.uid), uidValidity: uidValidity,
        oggetto: D.oggettoPulito(h['subject'])
    };
    if (g.genere === 'ricevuta') {
        conto.ricevute++;
        const tipo = (dc && dc.tipo) || g.tipo;
        const quando = (dc && dc.quando) || quandoMsg;
        if (tipo === 'accettazione') {
            fatto = { genere: 'accettata', quando: quando, gestore: dc ? dc.gestore : '', identificativo: dc ? dc.identificativo : '' };
        } else if (tipo === 'avvenuta-consegna') {
            /* Il destinatario dichiarato nella ricevuta deve essere quello a
               cui abbiamo scritto. Si controlla solo quando entrambi si
               conoscono: una scheda rimasta a meta' non ha il destinatario,
               e scartare la sua consegna vorrebbe dire perdere proprio il
               dato che serve. */
            const atteso = String(trovata.destinatario || '').toLowerCase();
            const dichiarato = dc ? String(dc.consegna || '').toLowerCase() : '';
            if (atteso && dichiarato && atteso !== dichiarato) {
                conto.nonRiconosciute++;
                nonRiconosciute.push({
                    chiave: chiaveVisto, genere: 'ricevuta', motivo: 'destinatario non combacia',
                    oggetto: D.oggettoPulito(h['subject']), da: D.soloIndirizzo(h['from']), riferimento: riferimento
                });
                return { genere: 'non-riconosciuto', tipo: tipo };
            }
            fatto = {
                genere: 'consegnata', quando: quando, destinatario: dichiarato || atteso,
                gestore: dc ? dc.gestore : '', tipoRicevuta: dc ? dc.tipoRicevuta : ''
            };
        } else if (tipo === 'presa-in-carico' || tipo === 'sconosciuta') {
            // comunicazioni fra gestori: si prende atto e non si cambia nulla
            return { genere: 'ricevuta', tipo: tipo, scheda: trovata.scheda };
        } else {
            const gr = D.gravitaProblema(tipo, dc ? dc.erroreEsteso : '');
            fatto = {
                genere: 'problema', quando: quando, tipo: tipo,
                errore: dc ? dc.errore : '',
                motivo: (dc && dc.erroreEsteso) || D.oggettoPulito(h['subject']),
                definitivo: gr.definitivo, gravita: gr.gravita
            };
        }
    } else {
        // risposta vera o messaggio non certificato arrivato per posta ordinaria
        if (D.automatica(h)) {
            return { genere: 'ignorato', tipo: 'automatica', scheda: trovata.scheda };
        }
        conto.risposte++;
        fatto = {
            genere: 'risposta', quando: quandoMsg,
            da: D.soloIndirizzo(h['reply-to']) || D.soloIndirizzo(h['from']),
            oggetto: D.oggettoPulito(h['subject']),
            certificata: g.genere === 'risposta'
        };
    }

    // l'etichetta e' quella che si legge nell'elenco dei messaggi
    fatto.etichetta = g.genere === 'ricevuta' ? (dc && dc.tipo ? dc.tipo : g.tipo) : (g.genere === 'anomalia' ? 'risposta non certificata' : 'risposta');
    const scritto = await applicaRicevuta(db, trovata.scheda, Object.assign(fatto, coordinate, { quando: fatto.quando }));
    if (scritto && scritto.cambiato) toccate[trovata.scheda] = scritto.esito || '';
    // l'identificativo del gestore diventa il ponte per le risposte future
    if (fatto.genere === 'accettata' && fatto.identificativo) {
        try { await registraIdentificativo(db, fatto.identificativo, trovata); } catch (_) { }
    }
    return { genere: g.genere, tipo: fatto.genere, scheda: trovata.scheda };
}

/* Il testo di UN messaggio, letto dalla casella al momento.
   Perche' non si conserva su Firestore: quella casella e' la PEC dello
   studio, il contenuto e' corrispondenza, e copiarne il testo in un
   archivio di marketing (che finisce anche nei backup) sarebbe tenere dati
   che non servono a nessuno finche' nessuno li apre. Quando invece
   qualcuno li apre, si vanno a prendere: la casella e' li'.

   Chi chiama DEVE aver gia' verificato che questo uid appartenga alla
   scheda che l'utente sta guardando: qui non c'e' modo di saperlo, e
   senza quel controllo questa funzione diventerebbe "leggi qualunque
   messaggio della PEC dello studio". */
async function leggiMessaggio(db, opz) {
    opz = opz || {};
    if (!configurato()) return { ok: false, msg: 'Casella PEC non configurata per la lettura.' };
    const uid = Number(opz.uid) || 0;
    if (!uid) return { ok: false, msg: 'Messaggio non indicato.' };
    const c = configurazione();
    const client = new (ImapFlowClasse())({
        host: c.host, port: c.porta, secure: true,
        auth: { user: c.utente, pass: c.password },
        logger: false, emitLogs: false,
        socketTimeout: 25000, greetingTimeout: 15000, connectionTimeout: 15000
    });
    client.on('error', () => { });
    try {
        await client.connect();
        const mb = await client.mailboxOpen(c.cartella, { readOnly: true });
        /* Se la cartella e' stata rigenerata, quell'uid non indica piu' lo
           stesso messaggio: meglio dire che non c'e' piuttosto che mostrare
           il messaggio sbagliato a chi si fida di quello che legge. */
        if (opz.uidValidity && String(mb.uidValidity) !== String(opz.uidValidity)) {
            return { ok: false, msg: 'Il messaggio non e piu rintracciabile con lo stesso riferimento: apri la casella PEC.' };
        }
        let trovato = null;
        for await (const m of client.fetch({ uid: uid + ':' + uid },
            { uid: true, internalDate: true, bodyStructure: true, headers: D.INTESTAZIONI }, { uid: true })) {
            if (Number(m.uid) === uid) trovato = m;
        }
        if (!trovato) return { ok: false, msg: 'Messaggio non trovato nella casella.' };

        const h = D.intestazioni(trovato.headers);
        const parte = D.trovaTesto(trovato.bodyStructure);
        let testo = '';
        if (parte && parte.dimensione <= MAX_TESTO) {
            try {
                const scaricato = await client.download(uid, parte.parte, { uid: true, maxBytes: MAX_TESTO });
                if (scaricato && scaricato.content) {
                    testo = D.decodificaTesto(await leggiBuffer(scaricato.content, MAX_TESTO), parte.gioco);
                }
            } catch (_) { testo = ''; }
        }
        const g = D.genere(h);
        return {
            ok: true,
            genere: g.genere, tipo: g.tipo,
            oggetto: D.oggettoPulito(h['subject']),
            da: D.soloIndirizzo(h['reply-to']) || D.soloIndirizzo(h['from']),
            quando: trovato.internalDate ? new Date(trovato.internalDate).getTime() : 0,
            testo: String(testo || '').slice(0, MAX_TESTO),
            troncato: !!(parte && parte.dimensione > MAX_TESTO),
            allegati: D.trovaAllegati(trovato.bodyStructure)
        };
    } catch (e) {
        const testo = String((e && (e.responseText || e.message)) || 'errore').slice(0, 200);
        return { ok: false, msg: 'Lettura non riuscita: ' + testo };
    } finally {
        try { await client.logout(); } catch (_) { try { client.close(); } catch (_) { } }
    }
}
function leggiBuffer(stream, max) {
    return new Promise((risolvi, rifiuta) => {
        const pezzi = []; let letti = 0, finito = false;
        stream.on('data', p => {
            letti += p.length;
            pezzi.push(p);
            if (letti > max) { stream.destroy(); if (!finito) { finito = true; risolvi(Buffer.concat(pezzi).slice(0, max)); } }
        });
        stream.on('end', () => { if (!finito) { finito = true; risolvi(Buffer.concat(pezzi)); } });
        stream.on('error', e => { if (!finito) { finito = true; rifiuta(e); } });
    });
}

module.exports = {
    configurato, configurazione, stato, giro, leggiMessaggio,
    registraRiferimento, registraIdentificativo, dimenticaRiferimenti, chiaviInvio,
    MAX_MESSAGGI, RECUPERO,
    /* Esposti per le prove: il pezzo che decide a chi appartiene un messaggio
       e quello che scrive sulla scheda vanno potuti provare sui messaggi PEC
       veri, senza una casella e senza rete. */
    _interni: { trovaScheda, applicaRicevuta, lavoraMessaggio, trovaParte }
};
