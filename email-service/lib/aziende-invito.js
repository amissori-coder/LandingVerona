/* ============================================================
   Aziende da invitare a un evento, e invio dell'invito
   ------------------------------------------------------------
   Sono aziende che NON si sono iscritte: e' un elenco di
   marketing, tenuto separato dalle iscrizioni (collezione
   "aziendeInvito", una scheda per azienda per evento). Si carica
   da un file CSV nella sezione Eventi dell'area riservata.

   PERCHE' QUESTO NON E' UN ENDPOINT A SE'. Il piano Hobby di
   Vercel ammette 12 funzioni serverless per rilascio, e in api/
   ce n'erano gia' 12: la tredicesima faceva fallire la
   distribuzione con "No more than 12 Serverless Functions can be
   added to a Deployment on the Hobby plan". Quindi la logica vive
   qui in lib/, che non conta come funzione, e api/presenze.js le
   passa le richieste che portano sezione: 'aziende'. E' la stessa
   strada che il repository usa gia' per il giro della newsletter,
   che bussa a un endpoint esistente invece di averne uno suo.

   Di conseguenza qui NON ci sono: intestazioni CORS, avvio
   dell'Admin SDK, verifica dell'ID token, controllo del permesso
   sugli Eventi. Li ha gia' fatti presenze.js, e i suoi esiti
   arrivano dentro il contesto.

   Due canali, si sceglie al momento dell'invio (lib/canali-invito.js):
     - EMAIL ORDINARIA da Brevo: quello normale per un invito.
       Nessuna configurazione nuova, e ogni mail porta il
       collegamento di disiscrizione;
     - PEC dalla casella del gestore: per l'invito formale. Se le
       credenziali PEC non ci sono, quel canale resta spento e il
       servizio lo dice, invece di spedire posta ordinaria facendola
       passare per certificata.

   L'invio va a lotti perche' la funzione ha 60 secondi: l'area
   riservata richiama il servizio finche' l'elenco non e' finito, e
   ogni scheda porta con se' il proprio esito, cosi' una ripresa non
   rispedisce a chi ha gia' ricevuto.

   Azioni, tutte con sezione: 'aziende':
     elenco, importa, aggiungi, modifica, cancella, segna, invia,
     configurazione, stato-lettore, ricevute, non-riconosciute,
     messaggi, leggi-messaggio.
   ============================================================ */

const admin = require('firebase-admin');
const CANALI = require('./canali-invito');
const NL = require('./newsletter');
const LETTORE = require('./lettore-pec');
const CODICI = require('./codici-invito');

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function chiave(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function indirizzoValido(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
}
/* Identificativo della scheda: evento + recapito principale (la PEC se c'e',
   altrimenti la mail ordinaria). Cosi' ricaricare lo stesso elenco NON crea
   doppioni e non azzera gli invii gia' fatti. */
function chiaveContatto(a) {
    return String((a && a.pec) || (a && a.email) || '').toLowerCase();
}
function idDoc(evento, contatto) {
    return (evento + '~' + String(contatto || '').toLowerCase()).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 400);
}

const STATI = ['da-invitare', 'inviata', 'errore', 'esclusa', 'disiscritta', 'risposta', 'iscritta'];
const MAX_AZIENDE_EVENTO = 5000;

/* Equity o founding partner: stessa regola di api/presenze.js (conta il RUOLO
   DI ACCESSO, non la spunta in anagrafica). In caso di dubbio si risponde no. */
const RE_PARTNER = /equity|found/i;
async function ePartner(db, ruolo) {
    if (!ruolo) return false;
    if (RE_PARTNER.test(ruolo)) return true;
    try {
        const rd = await db.collection('archivio').doc('ruoli').get();
        if (!rd.exists || typeof rd.data().json !== 'string') return false;
        const lista = JSON.parse(rd.data().json) || [];
        const r = (Array.isArray(lista) ? lista : []).find(x => x && x.id === ruolo);
        return !!(r && RE_PARTNER.test(String(r.nome || '')));
    } catch (_) { return false; }
}

/* Lettore CSV completo (virgolette, separatori dentro i campi, a capo nel
   testo). Riconosce da solo virgola e punto e virgola: gli elenchi scaricati
   in Italia usano quasi sempre il punto e virgola. */
function separatore(s) {
    const prima = String(s || '').split('\n')[0] || '';
    const pv = (prima.match(/;/g) || []).length;
    const vg = (prima.match(/,/g) || []).length;
    return pv > vg ? ';' : ',';
}
function leggiCsv(testoCsv) {
    const sep = separatore(testoCsv);
    const righe = [];
    let riga = [], campo = '', dentroVirgolette = false;
    const s = String(testoCsv || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (dentroVirgolette) {
            if (c === '"') {
                if (s[i + 1] === '"') { campo += '"'; i++; }
                else dentroVirgolette = false;
            } else campo += c;
        } else if (c === '"') {
            dentroVirgolette = true;
        } else if (c === sep) {
            riga.push(campo); campo = '';
        } else if (c === '\n') {
            riga.push(campo); campo = '';
            if (riga.some(x => x !== '')) righe.push(riga);
            riga = [];
        } else campo += c;
    }
    riga.push(campo);
    if (riga.some(x => x !== '')) righe.push(riga);
    return righe;
}

/* Intestazioni riconosciute. Gli elenchi arrivano dai posti piu' diversi
   (visure, gestionali, fogli fatti a mano): si accettano le varianti piu'
   comuni, e tutte le colonne NON riconosciute restano lo stesso nella
   scheda, cosi' non si perde niente di quello che e' stato caricato. */
const ALIAS = {
    'ragione sociale': 'ragioneSociale', 'ragione_sociale': 'ragioneSociale', 'ragionesociale': 'ragioneSociale',
    'denominazione': 'ragioneSociale', 'azienda': 'ragioneSociale', 'societa': 'ragioneSociale',
    'impresa': 'ragioneSociale', 'nome azienda': 'ragioneSociale', 'nome impresa': 'ragioneSociale', 'nome': 'ragioneSociale',
    'pec': 'pec', 'indirizzo pec': 'pec', 'email pec': 'pec', 'e-mail pec': 'pec', 'pec impresa': 'pec',
    'posta elettronica certificata': 'pec', 'pec_impresa': 'pec', 'indirizzo_pec': 'pec', 'domicilio digitale': 'pec',
    'partita iva': 'piva', 'partita_iva': 'piva', 'piva': 'piva', 'p.iva': 'piva', 'p iva': 'piva', 'vat': 'piva',
    'codice fiscale': 'cf', 'codice_fiscale': 'cf', 'cf': 'cf', 'cod. fiscale': 'cf',
    'referente': 'referente', 'contatto': 'referente', 'nome referente': 'referente', 'persona di riferimento': 'referente',
    'citta': 'citta', 'comune': 'citta', 'sede': 'citta', 'comune sede': 'citta',
    'provincia': 'provincia', 'prov': 'provincia', 'sigla provincia': 'provincia',
    'telefono': 'telefono', 'tel': 'telefono', 'cellulare': 'telefono',
    'email': 'email', 'e-mail': 'email', 'mail': 'email', 'email ordinaria': 'email', 'posta elettronica': 'email',
    'note': 'note', 'nota': 'note', 'settore': 'settore', 'ateco': 'settore', 'attivita': 'settore'
};

/* Freno agli invii, per utente e per canale. Il conteggio sta su Firestore
   (non in memoria) perche' ogni chiamata puo' finire su una macchina diversa,
   e una transazione regge anche le richieste in parallelo. */
const ORA_MS = 60 * 60 * 1000;
async function consumaGettoni(db, chi, canale, quanti) {
    const tetto = CANALI.maxOra(canale);
    const rif = db.collection('invito_throttle').doc(chi + '~' + canale);
    return db.runTransaction(async tx => {
        const snap = await tx.get(rif);
        const ora = Date.now();
        const d = snap.exists ? (snap.data() || {}) : {};
        const stessaFinestra = (ora - (d.inizioFinestra || 0)) < ORA_MS;
        const fatti = stessaFinestra ? (d.conteggio || 0) : 0;
        const disponibili = Math.max(0, tetto - fatti);
        const concessi = Math.min(quanti, disponibili);
        if (concessi > 0) {
            tx.set(rif, {
                inizioFinestra: stessaFinestra ? d.inizioFinestra : ora,
                conteggio: fatti + concessi, ultimo: ora
            }, { merge: true });
        }
        return { concessi: concessi, disponibili: disponibili, tetto: tetto };
    });
}

/* La scheda come la vede l'area riservata: fuori restano solo i campi
   che servono a video, non l'intero documento. */
function inChiaro(id, d) {
    d = d || {};
    return {
        id: id,
        ragioneSociale: d.ragioneSociale || '', pec: d.pec || '', email: d.email || '',
        piva: d.piva || '', cf: d.cf || '', referente: d.referente || '',
        citta: d.citta || '', provincia: d.provincia || '', telefono: d.telefono || '',
        settore: d.settore || '', note: d.note || '',
        stato: d.stato || 'da-invitare', extra: d.extra || {},
        codice: d.codice || '',
        iscritti: Array.isArray(d.iscritti) ? d.iscritti.slice(0, 20) : [],
        invio: d.invio || null, errore: d.errore || null, aggiunta: d.aggiunta || null,
        /* Gli esiti letti dalla casella PEC. Si espone il riepilogo, non la
           storia completa: alla tabella servono l'esito, quando e perche',
           e ogni campo in piu' viaggia moltiplicato per tutte le schede. */
        ricevute: d.ricevute ? {
            esito: d.ricevute.esito || 'attesa',
            accettata: d.ricevute.accettata || null,
            consegnata: d.ricevute.consegnata || null,
            problema: d.ricevute.problema || null,
            risposta: d.ricevute.risposta || null,
            aggiornato: d.ricevute.aggiornato || 0
        } : null
    };
}

/* Riconosce le richieste che riguardano questa sezione. presenze.js chiama
   questa prima del proprio smistamento: i nomi delle azioni si somigliano
   (aggiungi, modifica, cancella stanno da entrambe le parti) e senza un
   discriminante esplicito finirebbero nel posto sbagliato. */
function gestisce(body) {
    return !!(body && String(body.sezione || '') === 'aziende');
}

/* Un giro di lettura della casella PEC senza passare da un utente: lo usa
   la deviazione per lo scheduler in presenze.js. */
async function giroLettore(db, da) {
    return LETTORE.giro(db, { da: da || 'scheduler' });
}

/* L'esecuzione vera. Riceve dal chiamante cio' che ha gia' accertato
   (chi e', se e' amministratore, che ruolo ha) e restituisce lo stato HTTP
   con il corpo, senza toccare la risposta: e' presenze.js a scriverla.

   Il piccolo raccoglitore "res" qui sotto tiene il corpo di questa funzione
   IDENTICO a quando era un endpoint: era gia' provato riga per riga, e
   riscriverne duecento righe di uscite solo per cambiare la forma della
   risposta sarebbe stato un rischio senza vantaggio. */
async function esegui(ctx) {
    const db = ctx.db;
    const body = ctx.body || {};
    const email = ctx.email;
    const ruolo = ctx.ruolo || '';
    const eAdmin = !!ctx.eAdmin;
    let esito = null;
    const res = {
        _stato: 200,
        status(s) { this._stato = s; return this; },
        json(v) { esito = { stato: this._stato, corpo: v }; return this; }
    };
    /* Il corpo sta dentro una funzione sua perche' conserva i "return" del
       codice originale: senza, quei return uscirebbero da esegui() prima che
       possa restituire l'esito raccolto qui sopra. */
    try {
        await (async () => {
        const azione = String(body.azione || 'elenco');
        const evento = testo(body.evento, 80);

        /* Chi puo' TOCCARE l'elenco e spedire: amministratore, equity e founding
           partner. Consultarlo lo puo' chiunque veda la sezione Eventi. */
        let puoGestire = eAdmin;
        if (!puoGestire && azione !== 'elenco' && azione !== 'configurazione') puoGestire = await ePartner(db, ruolo);
        const negato = () => res.status(403).json({ ok: false, msg: 'Possono gestire le aziende da invitare l\'amministratore, gli equity partner e i founding partner.' });

        if (azione === 'configurazione') {
            const canale = c => {
                const pronto = CANALI.configurato(c);
                const cfg = CANALI.configurazione(c);
                return {
                    pronto: pronto, mittente: pronto ? cfg.mittente : '', host: pronto ? cfg.host : '',
                    separato: !!cfg.separato, rispondiA: cfg.rispondiA || '',
                    maxLotto: CANALI.maxLotto(c), maxOra: CANALI.maxOra(c)
                };
            };
            res.status(200).json({
                ok: true, canali: { email: canale('email'), pec: canale('pec') },
                lettore: await LETTORE.stato(db)
            });
            return;
        }

        /* Com'e' messa la lettura della casella PEC: la vede chiunque apra la
           sezione, perche' serve a capire se la colonna delle ricevute e'
           aggiornata o se il controllo e' fermo da giorni. */
        if (azione === 'stato-lettore') {
            res.status(200).json(Object.assign({ ok: true }, await LETTORE.stato(db)));
            return;
        }

        /* Un giro di lettura della casella PEC. Lo fa partire chi gestisce gli
           inviti: apre una connessione a un servizio esterno e non e' una cosa
           da lasciare a chiunque passi di li'. */
        if (azione === 'ricevute') {
            if (!puoGestire) { negato(); return; }
            const r = await LETTORE.giro(db, { da: email, forza: body.forza === true });
            res.status(200).json({
                ok: !!r.ok, esito: r.esito || '', msg: r.msg || '',
                restanti: !!r.restanti, ultimoGiro: r.ultimoGiro || null,
                // solo le schede toccate da questo giro: l'area riservata
                // aggiorna le righe che ha gia' a video
                aggiornate: r.aggiornate || {}
            });
            return;
        }

        /* La posta che il lettore non sa a chi attribuire. Non e' un errore da
           nascondere: e' l'elenco delle cose da guardare a mano nella casella,
           ed e' anche il modo per accorgersi se la correlazione sta zoppicando. */
        if (azione === 'non-riconosciute') {
            if (!puoGestire) { negato(); return; }
            const snap = await db.collection('pecNonRiconosciute').orderBy('quando', 'desc').limit(50).get()
                .catch(() => db.collection('pecNonRiconosciute').limit(50).get());
            const elenco = [];
            snap.forEach(d => {
                const v = d.data() || {};
                elenco.push({
                    id: d.id, quando: v.quando || 0, genere: v.genere || '', motivo: v.motivo || '',
                    oggetto: v.oggetto || '', da: v.da || ''
                });
            });
            elenco.sort((a, b) => (b.quando || 0) - (a.quando || 0));
            res.status(200).json({ ok: true, messaggi: elenco });
            return;
        }

        if (!evento) { res.status(400).json({ ok: false, msg: 'Evento mancante.' }); return; }

        if (azione === 'elenco') {
            const snap = await db.collection('aziendeInvito').where('evento', '==', evento).limit(MAX_AZIENDE_EVENTO).get();
            const aziende = [];
            snap.forEach(d => aziende.push(inChiaro(d.id, d.data())));
            aziende.sort((a, b) => String(a.ragioneSociale).localeCompare(String(b.ragioneSociale), 'it'));
            res.status(200).json({ ok: true, aziende: aziende, aggiornato: Date.now() });
            return;
        }

        /* I messaggi PEC che riguardano UNA azienda: ricevute del gestore e
           risposte. Qui viaggiano solo le coordinate (quale messaggio, di che
           tipo, quando), non il contenuto. */
        if (azione === 'messaggi') {
            if (!puoGestire) { negato(); return; }
            const id = testo(body.id, 400);
            if (!id) { res.status(400).json({ ok: false, msg: 'Azienda non indicata.' }); return; }
            const snap = await db.collection('aziendeInvito').doc(id).get();
            if (!snap.exists || String((snap.data() || {}).evento || '') !== evento) {
                res.status(404).json({ ok: false, msg: 'Scheda non trovata.' }); return;
            }
            const r = (snap.data() || {}).ricevute || {};
            res.status(200).json({ ok: true, messaggi: Array.isArray(r.messaggi) ? r.messaggi : [] });
            return;
        }

        /* Il TESTO di un messaggio, letto dalla casella al momento e non
           conservato da nessuna parte.

           Il controllo che conta e' quello qui sotto: si accetta solo un uid
           che risulta gia' annotato SU QUELLA scheda. Senza, questo endpoint
           diventerebbe "leggimi qualunque messaggio della PEC dello studio",
           cioe' la corrispondenza dei clienti, a chiunque sappia indovinare
           un numero. */
        if (azione === 'leggi-messaggio') {
            if (!puoGestire) { negato(); return; }
            const id = testo(body.id, 400);
            const uid = Number(body.uid) || 0;
            if (!id || !uid) { res.status(400).json({ ok: false, msg: 'Messaggio non indicato.' }); return; }
            const snap = await db.collection('aziendeInvito').doc(id).get();
            if (!snap.exists || String((snap.data() || {}).evento || '') !== evento) {
                res.status(404).json({ ok: false, msg: 'Scheda non trovata.' }); return;
            }
            const elenco = ((snap.data() || {}).ricevute || {}).messaggi || [];
            const suo = elenco.find(x => Number(x.uid) === uid);
            if (!suo) { res.status(403).json({ ok: false, msg: 'Quel messaggio non risulta collegato a questa azienda.' }); return; }
            const letto = await LETTORE.leggiMessaggio(db, { uid: uid, uidValidity: suo.uidValidity });
            res.status(letto.ok ? 200 : 400).json(letto);
            return;
        }

        if (azione === 'importa') {
            if (!puoGestire) { negato(); return; }
            const righe = leggiCsv(typeof body.csv === 'string' ? body.csv : '');
            if (righe.length < 2) { res.status(400).json({ ok: false, msg: 'Il file non contiene righe da importare: la prima riga sono le intestazioni, dalla seconda in poi le aziende.' }); return; }

            /* L'asterisco del modello segna le colonne obbligatorie a chi apre
               il foglio; qui non significa niente e si toglie, cosi' chi lo
               cancella e chi lo lascia ottengono lo stesso risultato. */
            const intest = righe[0].map(h => chiave(h).replace(/\*/g, '').replace(/\s+/g, ' ').trim());
            const campoDi = {};
            const presi = {};
            intest.forEach((h, i) => {
                const campo = ALIAS[h];
                // la prima colonna che vale per un campo vince: se il file ha sia
                // "Denominazione" sia "Nome", la ragione sociale resta una sola
                if (campo && !presi[campo]) { campoDi[i] = campo; presi[campo] = true; }
            });
            const col = n => { for (const i in campoDi) { if (campoDi[i] === n) return +i; } return -1; };
            const iPec = col('pec'), iMail = col('email'), iRag = col('ragioneSociale');
            if (iPec < 0 && iMail < 0) {
                res.status(400).json({ ok: false, msg: 'Nella prima riga non trovo ne la colonna PEC ne quella Email: scarica il modello, oppure chiama "PEC" la colonna degli indirizzi.' });
                return;
            }
            const cella = (riga, i) => (i >= 0 && riga[i] != null) ? testo(riga[i], 300) : '';

            // quante ce ne sono gia': l'elenco non deve crescere all'infinito
            let gia = 0;
            try { gia = (await db.collection('aziendeInvito').where('evento', '==', evento).count().get()).data().count || 0; }
            catch (_) { gia = 0; }

            let importate = 0, senzaRecapito = 0, doppie = 0, oltreIlLimite = 0, senzaDenominazione = 0;
            const viste = {};
            let batch = db.batch(), nel = 0;
            const nuoviId = [];
            for (let r = 1; r < righe.length; r++) {
                const riga = righe[r];
                if (!riga || !riga.length) continue;
                const pec = cella(riga, iPec).toLowerCase();
                const mail = cella(riga, iMail).toLowerCase();
                const pecOk = indirizzoValido(pec) ? pec : '';
                const mailOk = indirizzoValido(mail) ? mail : '';
                const contatto = pecOk || mailOk;
                if (!contatto) { senzaRecapito++; continue; }
                /* Senza denominazione la scheda non serve a niente: non si sa a
                   chi si sta scrivendo, l'invito non si puo' intestare e in
                   elenco resta una riga muta. Si scarta e si dice quante. */
                if (!cella(riga, iRag)) { senzaDenominazione++; continue; }
                if (viste[contatto]) { doppie++; continue; }
                viste[contatto] = true;
                if (gia + importate >= MAX_AZIENDE_EVENTO) { oltreIlLimite++; continue; }

                // colonne non riconosciute: restano con la loro intestazione
                const extra = {};
                for (let c = 0; c < riga.length; c++) {
                    if (campoDi[c]) continue;
                    const et = String(righe[0][c] == null ? '' : righe[0][c]).trim();
                    const val = cella(riga, c);
                    if (!et || !val) continue;
                    extra[et.slice(0, 60)] = val.slice(0, 300);
                }
                const id = idDoc(evento, contatto);
                nuoviId.push(id);
                /* merge: ricaricare lo stesso elenco aggiorna i dati anagrafici
                   e NON tocca stato ed esito dell'invio gia' fatto. Lo stato
                   iniziale si scrive solo alla creazione della scheda. */
                batch.set(db.collection('aziendeInvito').doc(id), {
                    evento: evento, pec: pecOk, email: mailOk,
                    ragioneSociale: cella(riga, iRag) || contatto.split('@')[0],
                    piva: cella(riga, col('piva')), cf: cella(riga, col('cf')),
                    referente: cella(riga, col('referente')), citta: cella(riga, col('citta')),
                    provincia: cella(riga, col('provincia')).slice(0, 4), telefono: cella(riga, col('telefono')),
                    settore: cella(riga, col('settore')), note: cella(riga, col('note')), extra: extra,
                    aggiornata: { quando: Date.now(), da: email }
                }, { merge: true });
                nel++; importate++;
                if (nel >= 300) { await batch.commit(); batch = db.batch(); nel = 0; }
            }
            if (nel) await batch.commit();

            /* Lo stato iniziale va messo SOLO alle schede nuove: si rileggono e
               si completa chi non ce l'ha, invece di sovrascrivere gli invii. */
            let nuove = 0;
            for (let i = 0; i < nuoviId.length; i += 200) {
                const fetta = nuoviId.slice(i, i + 200).map(x => db.collection('aziendeInvito').doc(x));
                const doc = await db.getAll.apply(db, fetta);
                let b = db.batch(), n = 0;
                doc.forEach(d => {
                    if (!d.exists) return;
                    const v = d.data() || {};
                    if (v.stato) return;
                    b.set(d.ref, { stato: 'da-invitare', aggiunta: { quando: Date.now(), da: email } }, { merge: true });
                    n++; nuove++;
                });
                if (n) await b.commit();
            }

            res.status(200).json({
                ok: true, lette: righe.length - 1, importate: importate, nuove: nuove,
                aggiornate: importate - nuove, senzaRecapito: senzaRecapito, doppie: doppie,
                oltreIlLimite: oltreIlLimite, senzaDenominazione: senzaDenominazione
            });
            return;
        }

        if (azione === 'aggiungi' || azione === 'modifica') {
            if (!puoGestire) { negato(); return; }
            const a = (body.azienda && typeof body.azienda === 'object') ? body.azienda : {};
            const pec = testo(a.pec, 200).toLowerCase();
            const mail = testo(a.email, 200).toLowerCase();
            if (pec && !indirizzoValido(pec)) { res.status(400).json({ ok: false, msg: 'Indirizzo PEC non valido.' }); return; }
            if (mail && !indirizzoValido(mail)) { res.status(400).json({ ok: false, msg: 'Indirizzo email non valido.' }); return; }
            if (!pec && !mail) { res.status(400).json({ ok: false, msg: 'Serve almeno un recapito: PEC o email.' }); return; }
            const rag = testo(a.ragioneSociale, 200);
            if (!rag) { res.status(400).json({ ok: false, msg: 'Ragione sociale mancante.' }); return; }
            const campi = {
                evento: evento, pec: pec, email: mail, ragioneSociale: rag,
                piva: testo(a.piva, 30), cf: testo(a.cf, 30), referente: testo(a.referente, 120),
                citta: testo(a.citta, 80), provincia: testo(a.provincia, 4), telefono: testo(a.telefono, 40),
                settore: testo(a.settore, 120), note: testo(a.note, 500),
                aggiornata: { quando: Date.now(), da: email }
            };
            const id = idDoc(evento, chiaveContatto(campi));
            const rif = db.collection('aziendeInvito').doc(id);
            const prima = await rif.get();
            if (!prima.exists) {
                campi.stato = 'da-invitare';
                campi.aggiunta = { quando: Date.now(), da: email };
            }
            /* Cambiare il recapito principale vuol dire cambiare identificativo:
               la scheda vecchia va tolta, altrimenti resterebbe un doppione con
               l'indirizzo sbagliato ancora da invitare. Si porta con se' lo
               stato, cosi' una correzione di battitura non fa ripartire un
               invito gia' spedito. */
            const idVecchio = testo(body.id, 400);
            if (azione === 'modifica' && idVecchio && idVecchio !== id) {
                const vecchia = await db.collection('aziendeInvito').doc(idVecchio).get();
                if (vecchia.exists) {
                    const v = vecchia.data() || {};
                    if (!prima.exists && v.stato) {
                        campi.stato = v.stato;
                        if (v.invio) campi.invio = v.invio;
                        if (v.errore) campi.errore = v.errore;
                        if (v.aggiunta) campi.aggiunta = v.aggiunta;
                    }
                    await vecchia.ref.delete().catch(() => { });
                }
            }
            await rif.set(campi, { merge: true });
            const dopo = await rif.get();
            res.status(200).json({ ok: true, azienda: inChiaro(id, dopo.data()) });
            return;
        }

        if (azione === 'cancella') {
            if (!puoGestire) { negato(); return; }
            const ids = (Array.isArray(body.ids) ? body.ids : []).map(x => testo(x, 400)).filter(Boolean);
            if (!ids.length) { res.status(400).json({ ok: false, msg: 'Nessuna azienda indicata.' }); return; }
            if (ids.length > 500) { res.status(400).json({ ok: false, msg: 'Troppe aziende in una volta sola.' }); return; }
            let batch = db.batch(), n = 0;
            for (const id of ids) {
                const rif = db.collection('aziendeInvito').doc(id);
                /* I riferimenti delle ricevute se ne vanno con la scheda:
                   dentro ci sono l'indirizzo PEC dell'azienda e il legame con
                   l'evento, e una cancellazione fatta a meta' non e' una
                   cancellazione. */
                try {
                    const snap = await rif.get();
                    if (snap.exists) n += LETTORE.dimenticaRiferimenti(batch, db, snap.data());
                } catch (_) { /* la scheda si toglie comunque */ }
                batch.delete(rif);
                n++;
                if (n >= 300) { await batch.commit(); batch = db.batch(); n = 0; }
            }
            if (n) await batch.commit();
            res.status(200).json({ ok: true, tolte: ids.length });
            return;
        }

        if (azione === 'segna') {
            if (!puoGestire) { negato(); return; }
            const ids = (Array.isArray(body.ids) ? body.ids : []).map(x => testo(x, 400)).filter(Boolean).slice(0, 500);
            const stato = testo(body.stato, 30);
            if (!ids.length) { res.status(400).json({ ok: false, msg: 'Nessuna azienda indicata.' }); return; }
            if (STATI.indexOf(stato) < 0) { res.status(400).json({ ok: false, msg: 'Stato non riconosciuto.' }); return; }
            let batch = db.batch(), n = 0;
            for (const id of ids) {
                batch.set(db.collection('aziendeInvito').doc(id), { stato: stato, aggiornata: { quando: Date.now(), da: email } }, { merge: true });
                n++;
                if (n >= 300) { await batch.commit(); batch = db.batch(); n = 0; }
            }
            if (n) await batch.commit();
            res.status(200).json({ ok: true, segnate: ids.length });
            return;
        }

        if (azione === 'invia') {
            if (!puoGestire) { negato(); return; }
            const canale = String(body.canale || 'email') === 'pec' ? 'pec' : 'email';
            if (!CANALI.configurato(canale)) {
                res.status(400).json({
                    ok: false, nonConfigurato: true, canale: canale,
                    msg: canale === 'pec'
                        ? 'La casella PEC non e configurata sul servizio: senza quelle credenziali l\'invito non sarebbe una PEC. Vanno impostate le variabili PEC_SMTP_USER, PEC_SMTP_PASS e PEC_FROM_EMAIL su Vercel.'
                        : 'Il server di posta non e configurato sul servizio (variabili SMTP_USER e SMTP_PASS su Vercel).'
                });
                return;
            }
            const maxLotto = CANALI.maxLotto(canale);
            const ids = (Array.isArray(body.ids) ? body.ids : []).map(x => testo(x, 400)).filter(Boolean).slice(0, maxLotto);
            if (!ids.length) { res.status(400).json({ ok: false, msg: 'Nessuna azienda indicata.' }); return; }
            const mail = (body.mail && typeof body.mail === 'object') ? body.mail : {};
            const oggetto = testo(mail.oggetto, 250);
            const html = String(mail.html || '').slice(0, 300000);
            if (!oggetto) { res.status(400).json({ ok: false, msg: 'Oggetto dell\'invito mancante.' }); return; }
            if (!html.trim()) { res.status(400).json({ ok: false, msg: 'Testo dell\'invito mancante.' }); return; }
            const forza = body.forza === true;
            const campagna = ('invito-' + evento).slice(0, 60);

            /* Chi ha gia' chiesto di non ricevere piu' nulla non lo si tocca,
               qualunque sia la lista da cui e' rispuntato. Si legge una volta
               sola per lotto: e' lo stesso elenco che usa la newsletter. */
            let fuori = {};
            try { fuori = await NL.disiscritti(db); }
            catch (_) { fuori = {}; }

            // gettoni: si prenotano PRIMA, per non spedire oltre il tetto orario
            let gettoni;
            try { gettoni = await consumaGettoni(db, email, canale, ids.length); }
            catch (_) { gettoni = { concessi: ids.length, disponibili: ids.length, tetto: CANALI.maxOra(canale) }; }
            if (!gettoni.concessi) {
                res.status(429).json({ ok: false, msg: 'Hai raggiunto il tetto di ' + gettoni.tetto + ' invii in un\'ora su questo canale: riprendi fra un po\', l\'elenco si ricorda a che punto era.' });
                return;
            }
            const daFare = ids.slice(0, gettoni.concessi);
            const tettoRaggiunto = gettoni.concessi < ids.length;

            const trans = CANALI.trasporto(canale);
            const pausa = CANALI.pausaFra(canale);
            const partite = Date.now();
            let inviate = 0, saltate = 0, senzaRecapito = 0, disiscritte = 0;
            const falliti = [];
            const esiti = {};
            /* Quando il server di posta rifiuta NOI e non il destinatario
               (IP bloccato, tetto superato, credenziali), il lotto si ferma
               qui: le schede rimaste restano "da invitare" e si riprendera'
               piu' tardi da dove si era arrivati. Insistere non serve a
               niente e fa due danni - allunga il blocco, e marca "errore"
               decine di aziende che non hanno nessun problema. */
            let bloccato = null;
            let primo = true;
            for (const id of daFare) {
                // oltre i 45 secondi si smette: il resto lo fa la chiamata dopo
                if (Date.now() - partite > 45000) break;
                const rif = db.collection('aziendeInvito').doc(id);
                const snap = await rif.get();
                if (!snap.exists) { saltate++; continue; }
                const a = snap.data() || {};
                if (String(a.evento || '') !== evento) { saltate++; continue; }
                if (a.stato === 'esclusa' || a.stato === 'disiscritta') { saltate++; continue; }
                if (a.invio && a.invio.quando && !forza) { saltate++; continue; }
                const dest = CANALI.destinatarioDi(canale, a);
                if (!indirizzoValido(dest)) { senzaRecapito++; continue; }
                if (fuori[dest.toLowerCase()]) {
                    await rif.set({ stato: 'disiscritta' }, { merge: true });
                    esiti[id] = { stato: 'disiscritta' };
                    disiscritte++;
                    continue;
                }
                /* Il filo per ritrovare le ricevute. Si genera un Message-ID
                   nostro e lo si annota PRIMA di spedire: se la funzione
                   morisse fra l'invio e la scrittura dell'esito, la ricevuta
                   arriverebbe comunque e troverebbe il filo gia' teso. */
                /* Il codice riservato all'azienda, creato PRIMA di spedire e
                   subito scritto in archivio. L'ordine conta: se partisse la
                   mail e poi fallisse la scrittura, l'azienda avrebbe in mano
                   un codice che qui non risulta, e al momento di registrarsi
                   si sentirebbe dire di no. Una scheda gia' col suo codice lo
                   tiene: un secondo invito deve ripetere lo stesso, altrimenti
                   il primo smette di valere senza che nessuno lo sappia. */
                let codice = String(a.codice || '');
                if (!codice) {
                    try {
                        codice = await CODICI.assegna(db, {
                            scheda: id, evento: evento, ragioneSociale: a.ragioneSociale,
                            pagina: testo(body.pagina, 200)
                        });
                        await rif.set({ codice: codice }, { merge: true });
                        a.codice = codice;
                    } catch (e) {
                        const motivo = 'Codice invito non assegnato: ' + String((e && e.message) || e).slice(0, 120);
                        const errore = { quando: Date.now(), da: email, canale: canale, motivo: motivo };
                        await rif.set({ stato: 'errore', errore: errore }, { merge: true });
                        esiti[id] = { stato: 'errore', errore: errore };
                        falliti.push({ id: id, indirizzo: dest, motivo: motivo });
                        continue;
                    }
                }
                const riferimento = CANALI.riferimentoNuovo(canale);
                if (!primo) await CANALI.aspetta(pausa);
                primo = false;
                try {
                    if (canale === 'pec') {
                        await LETTORE.registraRiferimento(db, riferimento, { scheda: id, evento: evento, destinatario: dest });
                    }
                    const info = await trans.sendMail(CANALI.messaggio(canale, a, { oggetto: oggetto, html: html }, {
                        campagna: campagna, rispondiA: email, riferimento: riferimento
                    }));
                    const invio = {
                        quando: Date.now(), da: email, canale: canale, destinatario: dest,
                        codice: codice,
                        riferimento: riferimento,
                        oggetto: CANALI.applica(oggetto, a).slice(0, 250),
                        messageId: String((info && info.messageId) || '').slice(0, 300),
                        risposta: String((info && info.response) || '').slice(0, 200)
                    };
                    await rif.set({ stato: 'inviata', invio: invio, errore: null }, { merge: true });
                    esiti[id] = { stato: 'inviata', invio: invio, codice: codice };
                    inviate++;
                } catch (e) {
                    const motivo = String((e && e.message) || 'errore del server di posta').slice(0, 200);
                    const errore = { quando: Date.now(), da: email, canale: canale, motivo: motivo };
                    await rif.set({ stato: 'errore', errore: errore }, { merge: true });
                    esiti[id] = { stato: 'errore', errore: errore };
                    falliti.push({ id: id, indirizzo: dest, motivo: motivo });
                    if (CANALI.fermaTutto(e)) { bloccato = motivo; break; }
                }
            }
            try { trans.close(); } catch (_) { /* niente da chiudere */ }

            /* Gettoni prenotati e non usati (tempo scaduto, schede saltate):
               si restituiscono, altrimenti il tetto orario si consumerebbe
               anche per gli invii che non sono mai partiti. */
            const nonUsati = daFare.length - inviate - falliti.length;
            if (nonUsati > 0) {
                try {
                    await db.collection('invito_throttle').doc(email + '~' + canale)
                        .set({ conteggio: admin.firestore.FieldValue.increment(-nonUsati) }, { merge: true });
                } catch (_) { /* il tetto si riazzera comunque a fine finestra */ }
            }

            res.status(200).json({
                ok: true, canale: canale, inviate: inviate, saltate: saltate,
                senzaRecapito: senzaRecapito, disiscritte: disiscritte,
                falliti: falliti.slice(0, 50), esiti: esiti,
                tettoRaggiunto: tettoRaggiunto, maxLotto: maxLotto,
                bloccato: bloccato || ''
            });
            return;
        }

        res.status(400).json({ ok: false, msg: 'Azione non riconosciuta.' });
        })();
    } catch (e) {
        const motivo = String((e && e.message) || 'errore').slice(0, 200);
        console.error('Aziende invito:', motivo);
        return { stato: 500, corpo: { ok: false, msg: 'Operazione non riuscita: ' + motivo } };
    }
    return esito || { stato: 500, corpo: { ok: false, msg: 'Nessuna risposta prodotta.' } };
}

module.exports = { gestisce, esegui, giroLettore };
