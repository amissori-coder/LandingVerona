/* ============================================================
   Cron: i promemoria agli iscritti di un evento (sezione Eventi)
   ------------------------------------------------------------
   Vercel richiama questo endpoint UNA VOLTA AL GIORNO, alle 20 di
   Roma (vedi vercel.json: 18 UTC, che con l'ora solare diventano le
   19). Un giro solo, per scelta di chi organizza: i promemoria sono
   posta della sera, e chi si iscrive durante il giorno riceve il suo
   la sera stessa, al piu' tardi entro le ventiquattro ore.

   Legge archivio/promemoriaEventi - i promemoria che chi organizza ha
   CONFERMATO dall'area riservata, con la mail gia' composta - e per
   ognuno previsto per OGGI (o per un giorno gia' passato):

     1. risolve GLI ISCRITTI DI ADESSO dell'evento, nelle sezioni scelte
        (in sala: presenza, aderenti, sponsor; oppure online), dalla
        copia condivisa dell'archivio (lib/copia-iscrizioni.js): chi si
        e' iscritto dopo la conferma entra da solo, chi ha annullato o
        e' stato cancellato resta fuori, un indirizzo riceve una mail
        sola anche se ha due iscrizioni;
     2. personalizza {{NOME}} (il nome di battesimo) e {{COMPLETA}} (il
        collegamento personale firmato, per correggere i dati o
        rinunciare) e spedisce, una mail per destinatario;
     3. scrive l'esito sul record, che l'area riservata mostra.

   PERCHE' PIU' GIRI NON RISPEDISCONO. Come per le comunicazioni
   programmate (api/cron-comunicazioni.js): l'avanzamento si scrive
   DURANTE l'invio (lib/comunicazioni-avanzamento.js), con l'impronta
   di chi ha gia' ricevuto, e un lucchetto tiene fuori un secondo giro
   mentre il primo sta spedendo. Se il tempo finisce a meta', il record
   resta dovuto e il giro dopo riprende da chi manca.

   I GIORNI CHE MANCANO SI CONTANO LA MATTINA DELL'INVIO. I testi non
   scrivono "manca una settimana": portano segnaposti ({{MANCANO}},
   {{QUANDO}}, {{CHIUSURA_B2B}}, il blocco SE_B2B) che qui diventano le
   parole giuste per il giorno in cui la mail parte davvero
   (lib/promemoria-tempo.js). Cosi' la stessa mail e' vera sia il giorno
   per cui e' programmata sia giorni dopo, come benvenuto.

   CHI ARRIVA DOPO: IL BENVENUTO. Chi entra in una serie dopo che la
   prima mail e' partita (si e' iscritto dopo, oppure e' stato spostato
   dall'online alla sala o viceversa) e da quella serie non ha ancora
   ricevuto niente, la mattina dopo riceve la mail COMPLETA della serie -
   quella segnata `benvenuto`: programma e informazioni essenziali - con i
   giorni ricalcolati e il blocco B2B solo se le prenotazioni sono ancora
   aperte. Da li' segue il calendario di tutti. Le regole:
     - una mail al giorno a persona, mai due: se quella mattina per gli
       altri parte una mail "normale" della serie, lui riceve il benvenuto
       al suo posto (il benvenuto contiene gia' quello che serve);
     - le mail legate al loro giorno (`soloIlGiorno`: la vigilia e la
       mattina dell'evento) vincono: quel giorno arrivano a tutti, anche a
       chi si e' appena iscritto, e il benvenuto non parte;
     - le altre mail perse non si recuperano: il benvenuto le copre;
     - solo promemoria confermati con i testi nuovi (`recupera: true`), e
       mai dopo il giorno dell'evento.
   Il benvenuto parte PRIMA delle mail del giorno, cosi' chi lo riceve
   viene segnato come servito anche nella mail normale di quella mattina.

   UN PROMEMORIA VECCHIO NON PARTE. Un promemoria appartiene al SUO
   giorno: "a domani" spedito il giorno dopo e' peggio di niente. Se il
   giro trova un record previsto per un giorno gia' passato (il servizio
   era fermo, il cron non era attivo, il giorno era gia' finito quando lo
   si e' confermato) lo segna "scaduto" e non lo spedisce; dall'area
   riservata lo si riprogramma con un clic. L'unica eccezione e' un invio
   rimasto a meta' il giorno prima, che si completa.

   UN GIRO AL GIORNO VUOL DIRE CHE DEVE BASTARE. Le mail partono a
   quattro alla volta invece che una dietro l'altra: trecento iscritti
   sono un paio di minuti, dentro il budget del giro. Se il tempo finisse
   lo stesso, il resto partirebbe la mattina dopo.

   Protezione: solo Vercel puo' chiamarlo, con l'intestazione
   Authorization e il segreto CRON_SECRET. Nessuna credenziale nel
   codice.
   ============================================================ */

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const C = require('../lib/copia-iscrizioni');
const NL = require('../lib/newsletter');
const AV = require('../lib/comunicazioni-avanzamento');
const TEMPO = require('../lib/promemoria-tempo');

/* Stessi tre numeri di cron-comunicazioni: il budget sta DENTRO il
   maxDuration di vercel.json (300 s) con un minuto per scrivere l'esito;
   il lucchetto dura piu' della funzione. */
const BUDGET_MS = 240 * 1000;
const LUCCHETTO_MS = 6 * 60 * 1000;
const PASSO_SALVATAGGIO = 20;
const SEZIONI = ['presenza', 'aderenti', 'sponsor', 'online'];
// quante mail in volo insieme: con un giro al giorno il tempo del giro deve bastare
const IN_PARALLELO = 4;
const DOC = 'promemoriaEventi';
const BASE = String(process.env.APP_BASE_URL || 'https://nextgenerationbusiness.it').replace(/\/+$/, '');

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
function initAdmin() {
    if (admin.apps && admin.apps.length) return;
    admin.initializeApp({ credential: admin.credential.cert(leggiServiceAccount()) });
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
/* Le stesse due funzioni di api/iscrizioni.js: l'identificativo della riga
   deve venire uguale, perche' e' la chiave con cui presenze e cancellazioni
   la citano. */
function chiave(s) {
    return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function idRiga(v) {
    const em = String(v.email || '');
    return (em.toLowerCase() || (chiave(v.nome) + '.' + chiave(v.cognome))) + '|' + String(v.data || '');
}
/* Un nome scritto tutto maiuscolo o tutto minuscolo ("MARIO ROSSI",
   "anna d'amico") si rimette in forma; uno scritto con le maiuscole al loro
   posto ("Anna De Luca", "McArthur") si lascia com'e'. */
function formaNome(s) {
    const t = String(s || '').trim().replace(/\s+/g, ' ');
    if (!t || (t !== t.toUpperCase() && t !== t.toLowerCase())) return t;
    return t.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}
/* Il nome con cui si saluta: nome e cognome. Le mail al singolo aprono con
   "Gentile nome cognome" e danno del Lei, come la conferma dell'iscrizione;
   "Gentile Maria" da solo suonerebbe confidenziale. Se manca tutto, "ospite". */
function nomeSaluto(v) {
    return (formaNome(v.nome) + ' ' + formaNome(v.cognome)).trim() || 'ospite';
}

/* Gli iscritti a cui scrivere ADESSO: { destinatari: [{email, nome, doc}],
   senzaEmail, doppie, cancellati }. `filtro` e' la parola che la pagina
   dell'iscrizione deve contenere ("napoli"), la stessa dell'area riservata. */
function risolviDestinatari(arch, rec) {
    const filtro = chiave(rec.filtro || '');
    const sezioni = (Array.isArray(rec.sezioni) ? rec.sezioni : []).map(s => String(s).toLowerCase()).filter(s => SEZIONI.indexOf(s) >= 0);
    const out = { destinatari: [], senzaEmail: 0, doppie: 0, cancellati: 0, esclusi: 0 };
    if (!filtro || !sezioni.length) return out;
    const presenze = {};
    (arch.presenze || []).forEach(p => { if (p && p.evento === rec.evento && p.idIscritto) presenze[p.idIscritto] = p; });
    const cancellate = {};
    (arch.cancellate || []).forEach(c => { if (c && c.evento === rec.evento && c.idIscritto) cancellate[c.idIscritto] = true; });
    const visti = {};
    (arch.iscrizioni || []).forEach(v => {
        if (!v || chiave(v.pagina).indexOf(filtro) < 0) return;
        if (v.annullato) { out.cancellati++; return; }
        const id = idRiga(v);
        if (cancellate[id]) { out.cancellati++; return; }
        const p = presenze[id] || {};
        // chi e' segnato assente non viene: non gli si ricorda niente
        if (String(p.stato || '') === 'assente') { out.esclusi++; return; }
        /* La sezione: la decisione di chi organizza (presenze) vince su quella
           dichiarata iscrivendosi; vuoto o sconosciuto vale in presenza. */
        let m = String(p.modalita || v.modalita || '').toLowerCase();
        /* Gli invitati ai SOLI incontri B2B non sono iscritti al convegno: in
           sala non si siedono e la diretta non la seguono. Nessun promemoria. */
        if (m === 'b2b') { out.esclusi++; return; }
        if (SEZIONI.indexOf(m) < 0) m = 'presenza';
        if (sezioni.indexOf(m) < 0) return;
        const email = String(v.email || '').trim().toLowerCase();
        if (!email || !reEmail.test(email)) { out.senzaEmail++; return; }
        if (visti[email]) { out.doppie++; return; }
        visti[email] = true;
        out.destinatari.push({ email: email, nome: nomeSaluto(v), doc: String(v._doc || '') });
    });
    return out;
}

/* Il giorno di Roma di un istante ("2026-09-17"): e' l'unita' con cui si
   ragiona, perche' il giro e' uno al giorno. Si parte da un istante e non
   da new Date() perche' l'orologio delle prove sostituisce Date.now(). */
function giornoRoma(ts) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}
/* La fine del giorno dell'evento (ora di Roma), oltre la quale un recupero
   non ha piu' senso. Il giorno sta sul record se l'area riservata ce l'ha
   scritto, altrimenti si legge dalla coda dell'identificativo dell'evento
   ("napoli-2026-10-02"). Senza data non si recupera: nel dubbio, niente. */
function fineEvento(rec) {
    const g = String(rec.giornoEvento || '') || ((/(\d{4}-\d{2}-\d{2})$/.exec(String(rec.evento || '')) || [])[1] || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g)) return 0;
    const t = Date.parse(g + 'T23:59:59+02:00');
    return isNaN(t) ? 0 : t;
}
function serieDi(rec) { return (Array.isArray(rec.sezioni) ? rec.sezioni : []).indexOf('online') >= 0 ? 'online' : 'sala'; }

/* Il giorno dell'evento, "aaaa-mm-gg": dal record, o dalla coda dell'identificativo. */
function giornoEventoDi(rec) {
    return String(rec.giornoEvento || '') || ((/(\d{4}-\d{2}-\d{2})$/.exec(String(rec.evento || '')) || [])[1] || '');
}
function personalizza(rec, d) {
    const m = rec.mail || {};
    const link = d.doc ? NL.linkCompleta(d.doc) : (BASE + '/');
    // le parole che dipendono dal giorno in cui la mail parte DAVVERO
    const f = TEMPO.frasi(giornoRoma(Date.now()), giornoEventoDi(rec), String(rec.chiusuraB2B || ''));
    const ogg = TEMPO.applica(String(m.oggetto || 'Promemoria - Next Generation Business').replace(/[\r\n]+/g, ' '), f).split('{{NOME}}').join(d.nome);
    const html = TEMPO.applica(String(m.html || ''), f).split('{{NOME}}').join(esc(d.nome)).split('{{COMPLETA}}').join(link);
    const testo = m.testo ? TEMPO.applica(String(m.testo), f).split('{{NOME}}').join(d.nome).split('{{COMPLETA}}').join(link) : undefined;
    return { subject: ogg, html: html, text: testo };
}

/* Un promemoria: la spedizione a chi manca ancora, entro la scadenza.
   `avanz` = { serviti: Set, scadenza: ms, segna: (impronte, delta) => Promise }. */
async function inviaUno(trans, rec, destinatari, avanz, opz) {
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const fromName = String(process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
    const from = '"' + fromName + '" <' + fromEmail + '>';
    const creatoDa = String((rec.creato && rec.creato.da) || '').trim().toLowerCase();
    const replyTo = reEmail.test(creatoDa) ? creatoDa : fromEmail;
    const dd = destinatari.filter(d => !avanz.serviti.has(AV.impronta(d.email)));
    let inviati = 0, tentati = 0, restanti = false;
    const falliti = [];
    const servite = [];   // le impronte di chi e' stato provato in questo giro
    let impronte = [], delta = { inviati: 0, falliti: [] };
    const scarica = async () => {
        if (!inviati || !impronte.length) return;
        await avanz.segna(impronte, delta);
        impronte = []; delta = { inviati: 0, falliti: [] };
    };
    /* La COPIA a chi ha programmato, una volta sola, all'inizio: e' la prova
       di che cosa e' partito e con che testo, come la copia nascosta delle
       altre mail dell'area riservata - ma una sola, non una per
       destinatario. Se non parte non e' un guasto dell'invio. */
    if (opz && opz.primoGiro && reEmail.test(creatoDa)) {
        const nomeOp = formaNome((rec.creato && rec.creato.daNome) || '') || 'collega';
        const copia = personalizza(rec, { email: creatoDa, nome: nomeOp, doc: '' });
        try {
            await trans.sendMail({ from: from, replyTo: replyTo, to: creatoDa, subject: '[Copia per te] ' + copia.subject, text: copia.text, html: copia.html });
        } catch (e) { console.error('Promemoria, copia a chi ha programmato non partita:', String((e && e.message) || e).slice(0, 150)); }
    }
    /* A gruppetti di IN_PARALLELO: il tempo si guarda PRIMA di ogni
       gruppetto, mai in mezzo - una mail partita e non registrata e'
       esattamente il caso che tutto questo serve a evitare. */
    const unaMail = async (d) => {
        const msg = personalizza(rec, d);
        try {
            await trans.sendMail({ from: from, replyTo: replyTo, to: d.email, subject: msg.subject, text: msg.text, html: msg.html });
            return { d: d, ok: true };
        } catch (e) {
            const motivo = String((e && e.message) || 'errore sconosciuto').slice(0, 200);
            console.error('Promemoria a', d.email, 'non riuscito:', motivo);
            return { d: d, ok: false, motivo: motivo };
        }
    };
    for (let i = 0; i < dd.length; i += IN_PARALLELO) {
        if (Date.now() > avanz.scadenza) { restanti = true; break; }
        const gruppo = dd.slice(i, i + IN_PARALLELO);
        tentati += gruppo.length;
        const esiti = await Promise.all(gruppo.map(unaMail));
        esiti.forEach(x => {
            if (x.ok) { inviati++; delta.inviati++; }
            else { falliti.push({ email: x.d.email, motivo: x.motivo }); delta.falliti.push({ email: x.d.email, motivo: x.motivo }); }
            // servito vuol dire TENTATO: un indirizzo che da' errore non si ritenta per sempre
            impronte.push(AV.impronta(x.d.email));
            servite.push(AV.impronta(x.d.email));
        });
        if (impronte.length >= PASSO_SALVATAGGIO) await scarica();
    }
    await scarica();
    // tutto quello che si e' provato e' fallito: e' un guasto del canale, non un invio
    if (tentati && !inviati && !restanti) throw new Error('nessuna mail inviata');
    return { inviati: inviati, falliti: falliti, restanti: restanti, tentati: tentati, servite: servite };
}

/* Patch di UN record dentro archivio/promemoriaEventi, in transazione e per
   campo: l'area riservata riscrive il documento intero quando qualcuno
   programma, e qui non si deve perdere ne' la sua scrittura ne' questa. */
async function applicaPatch(db, id, patch) {
    const rif = db.collection('archivio').doc(DOC);
    await db.runTransaction(async (tx) => {
        const s = await tx.get(rif);
        let arr = [];
        if (s.exists && typeof s.data().json === 'string') { try { arr = JSON.parse(s.data().json) || []; } catch (_) { arr = []; } }
        arr = arr.map(r => {
            if (!r || r.id !== id) return r;
            const m = Object.assign({}, r);
            if (patch.stato) m.stato = patch.stato;
            if (patch.invio !== undefined) m.invio = patch.invio;
            return m;
        });
        tx.set(rif, { json: JSON.stringify(arr), aggiornato: admin.firestore.FieldValue.serverTimestamp(), da: 'cron' });
    });
}

/* IL BENVENUTO a chi entra in una serie dopo che la prima mail e' partita.
   Gira PRIMA delle mail del giorno. Per ogni evento e serie:
     - la mail di benvenuto e' il promemoria `benvenuto` gia' inviato;
     - oggi non c'e' una mail `soloIlGiorno` della serie in partenza (se
       c'e', arriva a tutti e basta);
     - si mandano a chi e' nella serie adesso e non ha ancora ricevuto
       niente da nessun promemoria della serie;
     - chi lo riceve si segna come servito anche nelle mail normali della
       serie che partono stamattina: una mail al giorno, non due.
   Restituisce { benvenuti: n }. */
async function giroBenvenuto(db, lista, ora, scadenza, giro, archDi, trasportoDi) {
    const oggi = giornoRoma(ora);
    const nuovi = lista.filter(r => r && r.recupera === true && r.mail && r.mail.html);
    const gruppi = {};
    nuovi.forEach(r => { const k = String(r.evento || '') + '|' + serieDi(r); (gruppi[k] = gruppi[k] || []).push(r); });
    let benvenuti = 0;
    for (const k of Object.keys(gruppi)) {
        if (Date.now() > scadenza) break;
        const serie = gruppi[k];
        const w = serie.filter(r => r.benvenuto === true && r.stato === 'inviato')
            .sort((a, b) => Number(a.quando) - Number(b.quando))[0];
        if (!w) continue;
        if (!fineEvento(w) || ora > fineEvento(w)) continue;
        const diOggi = serie.filter(r => r.stato === 'programmato' && Number(r.quando) > 0 && giornoRoma(Number(r.quando)) === oggi);
        if (diOggi.some(r => r.soloIlGiorno === true)) continue;
        try {
            const arch = await archDi();
            const dest = risolviDestinatari(arch, w).destinatari;
            if (!dest.length) continue;
            // chi ha gia' ricevuto qualcosa da questa serie, da qualunque suo promemoria
            const ricevuto = new Set();
            for (const r of serie) {
                const st = await AV.apri(db, 'promemoria~' + r.id, r.quando);
                st.serviti.forEach(x => ricevuto.add(x));
            }
            const daServire = dest.filter(d => !ricevuto.has(AV.impronta(d.email)));
            if (!daServire.length) continue;
            const chiaveAv = 'promemoria~' + w.id;
            const preso = await AV.prendiLucchetto(db, chiaveAv, giro, LUCCHETTO_MS);
            if (!preso) continue;
            try {
                const stato = await AV.apri(db, chiaveAv, w.quando);
                const esito = await inviaUno(trasportoDi(), w, daServire, {
                    serviti: stato.serviti, scadenza: scadenza,
                    segna: (impronte, delta) => AV.segna(db, chiaveAv, w.quando, impronte, delta)
                }, { primoGiro: false });
                // stamattina, per loro, il benvenuto prende il posto della mail normale
                if (esito.servite.length) {
                    for (const r of diOggi) {
                        await AV.segna(db, 'promemoria~' + r.id, r.quando, esito.servite, { inviati: 0, falliti: [] });
                    }
                }
                if (!esito.inviati && !esito.falliti.length) continue;
                benvenuti += esito.inviati;
                const prima = w.invio || {};
                await applicaPatch(db, w.id, {
                    invio: Object.assign({}, prima, {
                        recuperi: Number(prima.recuperi || 0) + esito.inviati,
                        ultimoRecupero: Date.now(),
                        falliti: Number(prima.falliti || 0) + (esito.falliti || []).length,
                        dettaglioFalliti: (prima.dettaglioFalliti || []).concat(esito.falliti || []).slice(0, 100)
                    })
                });
            } finally {
                await AV.mollaLucchetto(db, chiaveAv);
            }
        } catch (e) {
            console.error('Benvenuto promemoria non riuscito (' + (w.id || '?') + '):', String((e && e.message) || e).slice(0, 300));
        }
    }
    return { benvenuti: benvenuti };
}

module.exports = async (req, res) => {
    const segreto = String(process.env.CRON_SECRET || '').trim();
    const auth = String((req.headers || {})['authorization'] || '');
    if (!segreto || auth !== 'Bearer ' + segreto) { res.status(401).json({ ok: false, msg: 'Non autorizzato' }); return; }

    const inizio = Date.now();
    const scadenza = inizio + BUDGET_MS;
    const giro = 'run-' + inizio.toString(36);
    try {
        initAdmin();
        const db = admin.firestore();
        const snap = await db.collection('archivio').doc(DOC).get();
        let lista = [];
        if (snap.exists && typeof snap.data().json === 'string') { try { lista = JSON.parse(snap.data().json) || []; } catch (_) { lista = []; } }
        const ora = Date.now();
        const oggi = giornoRoma(ora);
        // dovuto = previsto per oggi, o per un giorno gia' passato (che sotto diventa scaduto)
        const dovuti = lista.filter(r => r && r.stato === 'programmato' && Number(r.quando) > 0 && giornoRoma(Number(r.quando)) <= oggi && r.mail && r.mail.html);
        let arch = null;
        let trans = null;
        let inviatiTot = 0, sospesi = 0, scaduti = 0;
        const archDi = async () => { if (!arch) arch = await C.archivio(db); return arch; };
        const trasportoDi = () => { if (!trans) trans = trasporto(); return trans; };
        /* Prima il benvenuto a chi e' arrivato dopo: cosi' viene segnato nelle
           mail normali di stamattina, che quindi non gli arrivano in doppio. */
        let recuperi = 0;
        try {
            recuperi = (await giroBenvenuto(db, lista, ora, scadenza, giro, archDi, trasportoDi)).benvenuti;
        } catch (e) {
            console.error('Cron promemoria, benvenuto:', String((e && e.message) || e).slice(0, 300));
        }
        for (const rec of dovuti) {
            if (Date.now() > scadenza) { sospesi++; continue; }
            try {
                /* Dopo il giorno dell'evento non parte niente, nemmeno il resto
                   di un invio rimasto a meta': "oggi si comincia" il giorno
                   dopo e' peggio di nessuna mail. */
                if (fineEvento(rec) && ora > fineEvento(rec)) {
                    await applicaPatch(db, rec.id, {
                        stato: 'scaduto',
                        invio: Object.assign({}, rec.invio || {}, { inCorso: false, il: ora, motivo: 'Il giorno dell\'evento era già passato: non è partito niente.' })
                    });
                    scaduti++;
                    continue;
                }
                if (giornoRoma(Number(rec.quando)) < oggi && !(rec.invio && rec.invio.inCorso)) {
                    await applicaPatch(db, rec.id, {
                        stato: 'scaduto',
                        invio: { il: ora, inviate: 0, motivo: 'Il giorno scelto era già passato quando il servizio è passato (gira una volta al giorno, alle 20): non è partito niente. Riprogrammalo con un giorno nuovo.' }
                    });
                    scaduti++;
                    continue;
                }
                if (!arch) arch = await C.archivio(db);
                const r = risolviDestinatari(arch, rec);
                if (!r.destinatari.length) {
                    await applicaPatch(db, rec.id, {
                        stato: 'inviato',
                        invio: { il: ora, inviate: 0, falliti: 0, senzaEmail: r.senzaEmail, doppie: r.doppie, destinatari: 0, motivo: 'Nessun iscritto con email nelle sezioni scelte.' }
                    });
                    continue;
                }
                const chiaveAv = 'promemoria~' + rec.id;
                const preso = await AV.prendiLucchetto(db, chiaveAv, giro, LUCCHETTO_MS);
                if (!preso) { sospesi++; continue; }
                try {
                    const stato = await AV.apri(db, chiaveAv, rec.quando);
                    if (!trans) trans = trasporto();
                    const esito = await inviaUno(trans, rec, r.destinatari, {
                        serviti: stato.serviti, scadenza: scadenza,
                        segna: (impronte, delta) => AV.segna(db, chiaveAv, rec.quando, impronte, delta)
                    /* primo giro = nessuna mail ancora partita davvero. Non conta chi e'
                       gia' segnato: il benvenuto di stamattina segna i nuovi arrivati
                       senza mandare questa mail, e la copia deve partire lo stesso. */
                    }, { primoGiro: !stato.inviati });
                    const n = stato.inviati + esito.inviati;
                    const falliti = stato.falliti.concat(esito.falliti || []);
                    if (esito.restanti) {
                        /* Tempo finito a meta': il record resta dovuto e il giro
                           dopo riprende da chi manca. Sul record si scrive solo
                           "in corso" con il conteggio, che l'area riservata mostra. */
                        await applicaPatch(db, rec.id, { invio: { inCorso: true, il: ora, inviate: n, falliti: falliti.length } });
                        sospesi++;
                        continue;
                    }
                    if (esito.inviati) inviatiTot++;
                    const invio = {
                        il: Date.now(), inviate: n, falliti: falliti.length, dettaglioFalliti: falliti.slice(0, 100),
                        senzaEmail: r.senzaEmail, doppie: r.doppie, destinatari: r.destinatari.length, inCorso: false
                    };
                    /* L'esito sul record. L'avanzamento NON si cancella: da qui in
                       poi e' la memoria di chi ha ricevuto, e serve ai recuperi. */
                    await applicaPatch(db, rec.id, { stato: 'inviato', invio: invio });
                } finally {
                    await AV.mollaLucchetto(db, chiaveAv);
                }
            } catch (e) {
                console.error('Promemoria non inviato (' + (rec.id || '?') + '):', String((e && e.message) || e).slice(0, 300));
            }
        }
        res.status(200).json({ ok: true, inviati: inviatiTot, sospesi: sospesi, scaduti: scaduti, recuperi: recuperi });
    } catch (e) {
        console.error('Cron promemoria: errore', String((e && e.message) || e).slice(0, 300));
        res.status(500).json({ ok: false, msg: 'Errore interno' });
    }
};

// esposti per le prove (prove/promemoria-eventi.prove.js)
module.exports._interni = { risolviDestinatari, personalizza, nomeSaluto, formaNome, idRiga, fineEvento, giornoRoma, giornoEventoDi, serieDi };
