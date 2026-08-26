/* ============================================================
   Cron: invio delle comunicazioni programmate (Area riservata)
   ------------------------------------------------------------
   Vercel richiama questo endpoint ogni ora dalle 06:00 alle 18:00 UTC (vedi
   vercel.json). Legge le comunicazioni in archivio/comunicazioni, invia quelle
   in stato "programmata" la cui data di invio e' arrivata, e aggiorna la
   programmazione (unica -> inviata; ricorrente -> sposta al periodo successivo).

   PERCHE' PIU' GIRI AL GIORNO NON RISPEDISCONO. Un invio personalizzato manda
   una mail per destinatario, in fila: puo' durare minuti. Prima l'avanzamento
   si registrava solo ALLA FINE, quindi una funzione che moriva a meta' non
   lasciava traccia e il giro dopo ricominciava da capo, per tutti. Ora si
   scrive DURANTE (lib/comunicazioni-avanzamento.js): chi ha gia' ricevuto e'
   segnato, e la ripresa lo salta. E' la stessa strada del giro delle
   newsletter, che scrive dopo ogni lotto.

   Il primo giro resta quello delle 06:00 UTC, cioe' la mattina presto in
   Italia: chi programma sceglie un GIORNO e l'area riservata lo fissa a
   mezzanotte, quindi un cron che girasse anche di notte manderebbe posta di
   lavoro alle 00:30. I giri successivi servono a finire gli invii lunghi e a
   riprovare quelli andati storti, non ad anticipare.

   Protezione: solo Vercel puo' chiamarlo, tramite l'header Authorization con
   il segreto CRON_SECRET (da impostare nelle variabili d'ambiente Vercel).
   Nessuna credenziale nel codice.
   ============================================================ */

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
// Impaginazione e firma delle mail: un posto solo, cosi' quello che parte da qui
// e quello che parte dagli invii programmati e' identico (lib/mail-layout.js)
const { avvolgi, senzaTrattiniLunghi } = require('../lib/mail-layout');
// a che punto era arrivato l'invio: e' quello che rende ripetibile questo giro
const AV = require('../lib/comunicazioni-avanzamento');

/* I numeri si muovono insieme, come in lib/giro-newsletter.js e
   lib/lettore-pec.js. BUDGET_MS sta DENTRO il maxDuration dichiarato in
   vercel.json (300 s) con un minuto di margine per scrivere lo storico prima
   di essere interrotti; LUCCHETTO_MS deve durare PIU' della funzione, o un
   secondo giro entrerebbe mentre il primo sta ancora spedendo. */
const BUDGET_MS = 240 * 1000;
const LUCCHETTO_MS = 6 * 60 * 1000;
/* Ogni quanti destinatari si scrive l'avanzamento. E' il compromesso fra le
   scritture su Firestore e quanto si rispedisce nel caso peggiore: con 20, una
   funzione uccisa nell'istante sbagliato fa al massimo venti doppioni invece
   di cinquecento. */
const PASSO_SALVATAGGIO = 20;

function leggiServiceAccount() {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT mancante');
    let testo = raw;
    if (testo[0] !== '{') {
        try { const dec = Buffer.from(testo, 'base64').toString('utf8').trim(); if (dec[0] === '{') testo = dec; } catch (_) { }
    }
    let cred;
    try { cred = JSON.parse(testo); } catch (_) { throw new Error('FIREBASE_SERVICE_ACCOUNT non valido'); }
    if (cred.private_key && cred.private_key.includes('\\n')) cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    return cred;
}
let appPronta = false;
function initAdmin() {
    if (appPronta) return;
    admin.initializeApp({ credential: admin.credential.cert(leggiServiceAccount()) });
    appPronta = true;
}
function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}

const reEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// --- Variabili di personalizzazione (uguali al client) ---
const RE_VARIABILI = /\{(nome_completo|nome|cognome|email|incarichi)\}/;
function haVariabili(s) { return RE_VARIABILI.test(String(s || '')); }
function applicaVariabili(s, d) {
    d = d || {};
    const nc = (d.nome && d.cognome) ? (d.nome + ' ' + d.cognome) : (d.nome || d.cognome || '');
    // funzioni di sostituzione: valore inserito LETTERALE (un "$" nel testo non e' un riferimento speciale)
    return String(s == null ? '' : s)
        .replace(/\{nome_completo\}/g, () => nc).replace(/\{nome\}/g, () => d.nome || '').replace(/\{cognome\}/g, () => d.cognome || '')
        .replace(/\{email\}/g, () => d.email || '').replace(/\{incarichi\}/g, () => d.incarichi || '');
}
function applicaVariabiliHtml(s, d) {
    d = d || {};
    // {incarichi} e' una TABELLA HTML gia' pronta (incarichiHtml): va inserita RAW, non escaped
    return applicaVariabili(s, { nome: esc(d.nome || ''), cognome: esc(d.cognome || ''), email: esc(d.email || ''), incarichi: (d.incarichiHtml != null ? d.incarichiHtml : esc(d.incarichi || '')) });
}
function htmlToText(h) {
    return String(h || '')
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/(td|th)>/gi, '\t')
        .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
        .replace(/\n{3,}/g, '\n\n').trim();
}
function dividiNomi(testo) { return String(testo || '').split(/[,;]|\s+-\s*|\s*-\s+/).map(t => t.trim()).filter(Boolean); }
// Etichetta con cui una persona e' citata negli incarichi: solo cognome se unico, "Cognome
// Nome" se il cognome e' condiviso (allineato all'area riservata, per distinguere gli omonimi).
function etichettaPersona(p, lista) {
    const cog = String(p && p.nome || '').trim();
    if (!cog) return '';
    const np = String(p.nomeProprio || '').trim();
    if (!np) return cog;
    const condiviso = (lista || []).some(x => x && x.id !== p.id && x.attivo && !x.eliminato
        && String(x.nome || '').trim().toLowerCase() === cog.toLowerCase());
    return condiviso ? (cog + ' ' + np) : cog;
}
// risolutore etichetta->persona O(1); le persone non eliminate vengono inserite per prime,
// cosi un'eliminata omonima non "adombra" quella attiva
function risolutorePersone(lista) {
    lista = lista || [];
    const perEt = new Map(), perPieno = new Map(), perCog = new Map();
    // prima le attive (possiedono il cognome nudo), poi le disattivate, infine le eliminate
    lista.filter(p => p.attivo && !p.eliminato).concat(lista.filter(p => !p.attivo && !p.eliminato)).concat(lista.filter(p => p.eliminato)).forEach(p => {
        const et = etichettaPersona(p, lista).toLowerCase();
        if (et && !perEt.has(et)) perEt.set(et, p);
        const np = String(p.nomeProprio || '').trim();
        if (np) { const f = (String(p.nome || '').trim() + ' ' + np).toLowerCase(); if (!perPieno.has(f)) perPieno.set(f, p); }
        const cg = String(p.nome || '').trim().toLowerCase();
        if (cg && !perCog.has(cg)) perCog.set(cg, p);
    });
    return str => { const s = String(str || '').trim().toLowerCase(); return s ? (perEt.get(s) || perPieno.get(s) || perCog.get(s) || null) : null; };
}
// gli incarichi {cliente, qualita, respIncarico} in cui la PERSONA compare come team,
// responsabile incarico o referente (NON come responsabile della qualita), risolti per etichetta
function incarichiObjDiPersona(persona, incarichi, risolvi) {
    if (!persona) return [];
    const r = risolvi || risolutorePersone();
    const out = [], visti = {};
    (incarichi || []).forEach(inc => {
        const cita = [inc.team, inc.respIncarico, inc.referente].some(f =>
            f && dividiNomi(String(f)).some(t => { const x = r(t.trim()); return !!x && x.id === persona.id; }));
        if (cita && inc.cliente && !visti[inc.cliente]) { visti[inc.cliente] = 1; out.push({ cliente: inc.cliente, qualita: inc.qualita || '', respIncarico: inc.respIncarico || '' }); }
    });
    return out;
}
// tabella HTML (email-safe, stili inline) degli incarichi di una persona
function tabellaIncarichiHtml(objs) {
    if (!objs || !objs.length) return ''; // niente incarichi: {incarichi} sparisce (coerente con l'invio immediato)
    const th = 'border:1px solid #CBD5E1;padding:6px 9px;text-align:left;background:#F1F5F9;';
    const td = 'border:1px solid #CBD5E1;padding:6px 9px;';
    return '<table style="border-collapse:collapse;margin:10px 0;font-size:13px;"><tr>'
        + '<th style="' + th + '">Incarico</th><th style="' + th + '">Resp. qualita</th><th style="' + th + '">Resp. incarico</th></tr>'
        + objs.map(o => '<tr><td style="' + td + '">' + esc(o.cliente) + '</td><td style="' + td + '">' + esc(o.qualita || '-') + '</td><td style="' + td + '">' + esc(o.respIncarico || '-') + '</td></tr>').join('')
        + '</table>';
}


const MESI_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
// riferimento del periodo in base alla frequenza (per l'oggetto)
function etichettaPeriodo(freq, ts) {
    if (!ts) return '';
    const d = new Date(ts), anno = d.getFullYear(), z = n => String(n).padStart(2, '0');
    if (freq === 'trimestrale') return ['primo', 'secondo', 'terzo', 'quarto'][Math.floor(d.getMonth() / 3)] + ' trimestre ' + anno;
    if (freq === 'mensile') return MESI_IT[d.getMonth()] + ' ' + anno;
    if (freq === 'annuale') return String(anno);
    if (freq === 'settimanale') return 'settimana del ' + z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + anno;
    return '';
}

// sposta un timestamp al periodo successivo secondo la frequenza
function prossimaData(ts, freq) {
    const d = new Date(ts);
    if (freq === 'settimanale') d.setDate(d.getDate() + 7);
    else if (freq === 'mensile') d.setMonth(d.getMonth() + 1);
    else if (freq === 'trimestrale') d.setMonth(d.getMonth() + 3);
    else if (freq === 'annuale') d.setFullYear(d.getFullYear() + 1);
    else return null; // unica
    return d.getTime();
}

// Risolve i destinatari di una comunicazione ADESSO: espande i gruppi dinamici
// sui dati attuali (persone + utenti) e unisce i destinatari scelti singolarmente.
// Cosi chi e stato aggiunto dopo entra automaticamente negli invii programmati.
function risolviDestinatariCron(com, persone, utenti, incarichi) {
    const g = new Set(com.gruppi || []);
    const risolvi = risolutorePersone(persone || []);
    const byEmail = {};
    // persona = scheda del destinatario (per i suoi incarichi), oppure null
    const add = (email, nome, cognome, persona) => {
        const k = String(email || '').trim().toLowerCase();
        if (!reEmail.test(k) || byEmail[k]) return;
        const objs = persona ? incarichiObjDiPersona(persona, incarichi, risolvi) : [];
        byEmail[k] = { email: k, nome: nome || '', cognome: cognome || '', incarichi: objs.map(o => o.cliente).join(', '), incarichiHtml: tabellaIncarichiHtml(objs) };
    };
    if (g.has('utenti')) (utenti || []).forEach(u => { if (u.email && u.attivo !== false) add(u.email, u.nome || '', '', null); });
    (persone || []).forEach(p => {
        if (!p || !p.attivo || p.eliminato || !p.email) return;
        if ((g.has('qualita') && p.qualita) || (g.has('procuratori') && p.respIncarico) || g.has('team')
            || (g.has('coordinatori') && p.coordinatore) || (g.has('vicecoordinatori') && p.viceCoordinatore)
            || (g.has('equity') && p.equityPartner) || (g.has('founding') && p.foundingPartner)) {
            const cognome = p.nome || '';
            add(p.email, p.nomeProprio || cognome, cognome, p);
        }
    });
    const manuali = com.destinatariManuali || (g.size ? [] : (com.destinatari || []));
    manuali.forEach(e => {
        const k = String(e || '').trim().toLowerCase();
        if (!reEmail.test(k) || byEmail[k]) return;
        const pers = (persone || []).find(p => p.email && String(p.email).toLowerCase() === k);
        if (pers) { const cognome = pers.nome || ''; add(k, pers.nomeProprio || cognome, cognome, pers); return; }
        const inc = (incarichi || []).find(i => [i.email1, i.email2].some(x => x && String(x).toLowerCase() === k));
        add(k, inc ? (inc.cliente || '') : '', '', null);
    });
    return Object.keys(byEmail).map(k => byEmail[k]);
}

/* avanz = { serviti: Set di impronte, scadenza: istante oltre il quale non si
   comincia una mail nuova, segna: (impronte, delta) => Promise }. */
async function inviaUna(trans, com, destinatari, avanz) {
    const seen = {}, tutti = [];
    (destinatari || []).forEach(d => {
        const k = String((d && d.email) || '').trim().toLowerCase();
        if (!reEmail.test(k) || seen[k]) return;
        seen[k] = 1; tutti.push(Object.assign({}, d, { email: k }));
    });
    if (!tutti.length) throw new Error('nessun destinatario valido');

    /* Chi ha gia' ricevuto esce QUI, prima di qualunque ramo: vale per
       l'invio personalizzato come per il BCC. Se non resta nessuno, l'invio
       era gia' finito e si era interrotta solo la registrazione: si risponde
       "fatto, zero mail nuove" e il chiamante puo' finalmente far avanzare la
       programmazione invece di rispedire a tutti. */
    const dd = tutti.filter(d => !avanz.serviti.has(AV.impronta(d.email)));
    if (!dd.length) return { inviati: 0, falliti: [], restanti: false };
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const fromName = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.');
    const from = '"' + fromName + '" <' + fromEmail + '>';
    const replyTo = (com.creato && com.creato.da) || fromEmail;
    // periodo di riferimento di QUESTO invio (dalla frequenza + data): sostituisce {periodo}
    const p = com.programmazione || {};
    const periodo = (p.frequenza && p.frequenza !== 'unica') ? etichettaPeriodo(p.frequenza, p.prossimoInvio) : '';
    let oggBase = com.oggetto || '(senza oggetto)';
    if (p.periodoNelOggetto && periodo) oggBase = oggBase + ' - ' + periodo; // retrocompatibilita vecchi record (casella "periodo nell'oggetto")
    const isHtml = String(com.formato || '') === 'html';
    oggBase = senzaTrattiniLunghi(oggBase.replace(/\{periodo\}/g, periodo)); // oggetto sempre testo semplice, senza trattini lunghi
    let testoBase = senzaTrattiniLunghi((com.testo || '').replace(/\{periodo\}/g, isHtml ? esc(periodo) : periodo));
    const wrap = inner => avvolgi(inner);
    const corpoHtml = txt => isHtml ? wrap(txt) : wrap(esc(txt).replace(/\n/g, '<br>'));
    const corpoText = txt => isHtml ? htmlToText(txt) : txt;
    const sostBody = (s, d) => isHtml ? applicaVariabiliHtml(s, d) : applicaVariabili(s, d);

    // testo/oggetto con variabili -> una mail personalizzata per destinatario; altrimenti BCC
    if (haVariabili(oggBase) || haVariabili(testoBase)) {
        let inviati = 0, tentati = 0, restanti = false;
        const falliti = [];
        let impronte = [], delta = { inviati: 0, falliti: [] };
        /* Finche' non e' partita NEMMENO UNA mail non si segna niente, e non
           e' pignoleria. Se a rifiutare e' il server - irraggiungibile,
           credenziali scadute, quota finita - falliscono tutti allo stesso
           modo: segnarli come serviti vorrebbe dire non riprovare mai piu' e
           chiudere la comunicazione con "0 destinatari". Al primo invio
           riuscito invece si sa che il server c'e', e da quel momento un
           fallimento e' dell'indirizzo, non del canale. */
        const scarica = async () => {
            if (!inviati || !impronte.length) return;
            await avanz.segna(impronte, delta);
            impronte = []; delta = { inviati: 0, falliti: [] };
        };
        for (const d of dd) {
            /* Il tempo si guarda PRIMA di spedire, mai dopo: una mail partita
               e non ancora registrata e' esattamente il caso che tutto questo
               serve a evitare. */
            if (Date.now() > avanz.scadenza) { restanti = true; break; }
            const ogg = applicaVariabili(oggBase, d).trim() || '(senza oggetto)';
            const txt = sostBody(testoBase, d);
            tentati++;
            try {
                await trans.sendMail({ from: from, replyTo: replyTo, to: d.email, subject: ogg, text: corpoText(txt), html: corpoHtml(txt) });
                inviati++; delta.inviati++;
            }
            catch (e) {
                const motivo = String((e && e.message) || 'errore sconosciuto').slice(0, 200);
                console.error('Invio programmato personalizzato a', d.email, 'non riuscito:', motivo);
                falliti.push({ email: d.email, motivo: motivo });
                delta.falliti.push({ email: d.email, motivo: motivo });
            }
            /* Servito vuol dire TENTATO, riuscito o no. Un indirizzo che ha
               dato errore non si ritenta al giro dopo: se l'errore e' stabile
               (casella inesistente, casella piena) si riproverebbe a ogni
               giro per sempre, e il motivo e' comunque finito nello storico
               della comunicazione, dove qualcuno lo puo' leggere. */
            impronte.push(AV.impronta(d.email));
            if (impronte.length >= PASSO_SALVATAGGIO) await scarica();
        }
        await scarica();
        // tutto quello che si e' provato e' fallito: e' un guasto, non un invio
        if (tentati && !inviati && !restanti) throw new Error('nessuna mail inviata');
        return { inviati: inviati, falliti: falliti, restanti: restanti };
    }
    const emails = dd.map(d => d.email);
    const setEmails = new Set(emails);
    const msg = { from: from, replyTo: replyTo, subject: oggBase, text: corpoText(testoBase), html: corpoHtml(testoBase) };
    if (emails.length === 1) msg.to = emails[0];
    else { msg.to = replyTo; msg.bcc = emails; }
    let falliti = [];
    try {
        const info = await trans.sendMail(msg);
        const motivo = String((info && info.response) || 'rifiutato dal server di posta').slice(0, 200);
        falliti = ((info && info.rejected) || []).map(em => String(em).toLowerCase()).filter(em => setEmails.has(em)).map(em => ({ email: em, motivo: motivo }));
    } catch (e) {
        const motivo = String((e && e.message) || 'errore del server di posta').slice(0, 200);
        falliti = emails.map(em => ({ email: em, motivo: motivo }));
    }
    const inviati = emails.length - falliti.length;
    // niente e' partito: si esce come guasto, e senza segnare nessuno come
    // servito, cosi' il giro dopo puo' riprovare davvero
    if (!inviati) throw new Error('nessuna mail inviata');
    /* Il BCC e' UNA transazione SMTP sola: non esiste un "a meta'" da
       riprendere, o e' partita o no. Si registra subito, cosi' un guasto fra
       qui e lo storico non fa ripartire l'intero lotto. I rifiutati vanno
       segnati con gli altri, per la stessa ragione del ramo qui sopra. */
    await avanz.segna(emails.map(e => AV.impronta(e)), { inviati: inviati, falliti: falliti });
    return { inviati: inviati, falliti: falliti, restanti: false };
}

// Applica una patch a UNA sola comunicazione, fondendo per CAMPO sul record piu
// fresco letto in transazione: non sovrascrive modifiche concorrenti (invii/fine/
// frequenza) fatte da un altro utente mentre il cron era in esecuzione.
async function applicaPatch(rif, id, patch) {
    await admin.firestore().runTransaction(async (tx) => {
        const s = await tx.get(rif);
        let arr = [];
        if (s.exists && typeof s.data().json === 'string') { try { arr = JSON.parse(s.data().json) || []; } catch (_) { arr = []; } }
        arr = arr.map(c => {
            if (!c || c.id !== id) return c;
            const m = Object.assign({}, c);
            if (patch.stato) m.stato = patch.stato;
            if (patch.inviata) m.inviata = patch.inviata;
            if (patch.prog) m.programmazione = Object.assign({}, c.programmazione || {}, patch.prog);
            if (patch.voce) {
                const chiave = v => (v && v.il || 0) + '|' + (v && v.da || '') + '|' + (v && v.n || '');
                const visti = new Set(), uniti = [];
                (c.invii || []).concat([patch.voce]).forEach(v => { const k = chiave(v); if (!visti.has(k)) { visti.add(k); uniti.push(v); } });
                m.invii = uniti;
            }
            return m;
        });
        tx.set(rif, { json: JSON.stringify(arr), aggiornato: admin.firestore.FieldValue.serverTimestamp(), da: 'cron' });
    });
}

module.exports = async (req, res) => {
    // sicurezza: solo Vercel Cron (header con CRON_SECRET)
    const segreto = process.env.CRON_SECRET;
    const auth = req.headers['authorization'] || '';
    if (!segreto || auth !== 'Bearer ' + segreto) { res.status(401).json({ ok: false, msg: 'Non autorizzato' }); return; }

    const inizio = Date.now();
    const scadenza = inizio + BUDGET_MS;
    const giro = 'run-' + inizio.toString(36);

    try {
        initAdmin();
        const db = admin.firestore();
        const rif = db.collection('archivio').doc('comunicazioni');
        const snap = await rif.get();
        let lista = [];
        if (snap.exists && typeof snap.data().json === 'string') {
            try { lista = JSON.parse(snap.data().json) || []; } catch (_) { lista = []; }
        }
        const ora = Date.now();
        const dovute = lista.filter(c => c && c.stato === 'programmata' && c.programmazione && c.programmazione.attiva && c.programmazione.prossimoInvio && c.programmazione.prossimoInvio <= ora);
        if (!dovute.length) { res.status(200).json({ ok: true, inviate: 0 }); return; }

        // dati attuali per risolvere i gruppi dinamici
        let persone = [];
        try {
            const ps = await admin.firestore().collection('archivio').doc('persone').get();
            if (ps.exists && typeof ps.data().json === 'string') persone = JSON.parse(ps.data().json) || [];
        } catch (_) { persone = []; }
        let utenti = [];
        try {
            const us = await admin.firestore().collection('utenti').get();
            us.forEach(d => utenti.push(Object.assign({ email: d.id }, d.data())));
        } catch (_) { utenti = []; }
        // incarichi: servono per la variabile {incarichi} (clienti associati a una persona)
        let incarichi = [];
        try {
            const is = await admin.firestore().collection('archivio').doc('incarichi').get();
            if (is.exists && typeof is.data().json === 'string') incarichi = JSON.parse(is.data().json) || [];
        } catch (_) { incarichi = []; }

        const trans = trasporto();
        let inviate = 0, sospese = 0;
        for (const com of dovute) {
            /* Tempo finito: si smette in ordine invece di essere interrotti a
               meta'. Quel che resta lo prende il giro dopo, fra un'ora. */
            if (Date.now() > scadenza) { sospese++; continue; }
            try {
                const p = com.programmazione;
                // programmazione scaduta (oltre la data di fine): disattiva senza inviare
                if (p.fine && p.prossimoInvio > p.fine) {
                    await applicaPatch(rif, com.id, { prog: { attiva: false } });
                    continue;
                }
                // avanza la schedulazione fino a superare "ora" (recupera i periodi saltati
                // con un solo invio). Vale sia che si invii sia che si salti per 0 destinatari.
                let next = prossimaData(p.prossimoInvio, p.frequenza);
                if (next != null) { while (next <= ora) next = prossimaData(next, p.frequenza); }
                const avanza = () => {
                    if (next == null) return { attiva: false };                                    // unica: conclusa
                    if (p.fine && next > p.fine) return { attiva: false, prossimoInvio: next };     // ultima occorrenza
                    return { prossimoInvio: next, ultimoInvio: ora };
                };
                const destinatari = risolviDestinatariCron(com, persone, utenti, incarichi);
                if (!destinatari.length) {
                    // nessun destinatario risolto (gruppo vuoto e nessun indirizzo manuale):
                    // non inviare, ma avanza comunque per non ritentare ogni giorno all'infinito.
                    await applicaPatch(rif, com.id, { prog: avanza() });
                    continue;
                }
                /* Il lucchetto si prende solo ADESSO, non prima: fin qui non
                   c'era niente da proteggere, e prenderlo per poi non spedire
                   lascerebbe in giro un avanzamento vuoto. */
                const preso = await AV.prendiLucchetto(db, com.id, giro, LUCCHETTO_MS);
                if (!preso) { sospese++; continue; }
                try {
                    /* L'avanzamento e' legato all'ISTANTE dell'occorrenza: una
                       ricorrente rispedisce ogni mese con lo stesso id, e senza
                       questo l'invio di settembre salterebbe tutti quelli
                       serviti ad agosto. */
                    const stato = await AV.apri(db, com.id, p.prossimoInvio);
                    const esito = await inviaUna(trans, com, destinatari, {
                        serviti: stato.serviti,
                        scadenza: scadenza,
                        segna: (impronte, delta) => AV.segna(db, com.id, p.prossimoInvio, impronte, delta)
                    });

                    if (esito.restanti) {
                        /* Tempo esaurito a meta' invio. NON si avanza la
                           programmazione: la comunicazione resta dovuta, e il
                           giro dopo riprende da qui saltando chi ha gia'
                           ricevuto. Avanzare adesso vorrebbe dire lasciare a
                           bocca asciutta la meta' non ancora servita. */
                        sospese++;
                        continue;
                    }

                    // i conti sono di TUTTA l'occorrenza, non del solo giro corrente
                    const n = stato.inviati + esito.inviati;
                    const falliti = stato.falliti.concat(esito.falliti || []);
                    if (esito.inviati) inviate++;
                    const voce = { il: ora, n: n, da: 'programmato' };
                    if (falliti.length) { voce.falliti = falliti.length; voce.dettaglioFalliti = falliti.slice(0, 100); }
                    const inviata = { da: 'programmato', il: ora, n: n };
                    if (falliti.length) { inviata.falliti = falliti.length; inviata.dettaglioFalliti = falliti.slice(0, 100); }
                    const patch = (next == null)
                        ? { stato: 'inviata', prog: { attiva: false }, inviata: inviata, voce } // unica: completata
                        : { prog: avanza(), voce };

                    /* PRIMA lo storico, POI la pulizia dell'avanzamento. Nell'ordine
                       inverso, un guasto in mezzo cancellerebbe la memoria di chi ha
                       gia' ricevuto lasciando la comunicazione ancora dovuta: cioe'
                       esattamente il doppio invio che tutto questo evita. Cosi'
                       invece l'avanzamento sopravvive un giro di troppo, e al giro
                       dopo lo scarta da se' perche' l'occorrenza non combacia piu'. */
                    await applicaPatch(rif, com.id, patch);
                    await AV.chiudi(db, com.id);
                } finally {
                    await AV.mollaLucchetto(db, com.id);
                }
            } catch (e) {
                console.error('Comunicazione programmata non inviata (' + (com.id || '?') + '):', e && e.message);
            }
        }
        res.status(200).json({ ok: true, inviate: inviate, sospese: sospese });
    } catch (e) {
        console.error('Cron comunicazioni: errore', e);
        res.status(500).json({ ok: false, msg: 'Errore interno' });
    }
};
