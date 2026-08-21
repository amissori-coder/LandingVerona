/* ============================================================
   Presenze, note e cancellazione di un'iscrizione
   ------------------------------------------------------------
   Stato ("confermato / presente / assente") e nota di ogni iscritto
   vivono sul server, nella collezione "presenze". Prima stavano in un
   archivio condiviso che il server riserva allo staff: chi era
   invitato alla sola sezione Eventi non riusciva a salvare nulla, e
   con un ruolo "solo sondaggio" nemmeno a leggerli.

   Qui la decisione la prende il servizio, con la stessa regola della
   lettura delle iscrizioni: amministratore, oppure utente presente
   nell'elenco degli abilitati agli Eventi. Le scritture avvengono con
   l'account di servizio, quindi non dipendono dalle regole di Firestore.

   Azioni:
     - "imposta"  : stato e/o nota di un iscritto (tutti gli abilitati)
     - "cancella" : rimuove un'iscrizione (SOLO amministratore)
     - "modifica" : corregge i dati di un'iscrizione (SOLO amministratore)
     - "aggiungi" : registra un'iscrizione A MANO (amministratore,
       equity partner e founding partner: conta SOLO il RUOLO DI
       ACCESSO dell'utente, non la spunta in anagrafica),
       per chi si e' iscritto da un portale esterno (Eventbrite): il
       portale di provenienza resta sulla scheda e, se richiesto, parte
       la mail di conferma in formato NGB gia' composta dall'area
       riservata (stesso schema dell'invio newsletter: l'HTML arriva
       pronto, qui si verifica chi chiede e si spedisce SOLO
       all'indirizzo dell'iscritto appena registrato).
   La cancellazione lascia una traccia in "iscrizioniCancellate", cosi'
   la persona non ricompare se la sua riga esiste ancora sul foglio.
   ============================================================ */

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
// firma e indirizzo del collegamento "completa i dati" (lib condivisa con la
// newsletter: stesso segreto della disiscrizione, contesto diverso)
const NL = require('../lib/newsletter');

function leggiServiceAccount() {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT mancante');
    let testo = raw;
    if (testo[0] !== '{') {
        try {
            const dec = Buffer.from(testo, 'base64').toString('utf8').trim();
            if (dec[0] === '{') testo = dec;
        } catch (_) { /* lo segnala JSON.parse */ }
    }
    let cred;
    try { cred = JSON.parse(testo); }
    catch (_) { throw new Error('FIREBASE_SERVICE_ACCOUNT non valido'); }
    if (cred.private_key && cred.private_key.includes('\\n')) {
        cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    }
    return cred;
}

let appPronta = false;
function initAdmin(cred) {
    if (appPronta) return;
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    appPronta = true;
}

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
// l'identificativo dell'iscritto contiene "@", "|" e barre: nel nome di un documento no
function idDoc(evento, idIscritto) {
    return (evento + '~' + idIscritto).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 400);
}
// stessa normalizzazione usata nella lettura: serve a ricostruire l'identificativo
// di chi non ha email (nome.cognome), altrimenti la scheda cambierebbe identita'
function chiaveTesto(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
// stessa regola usata dal form e dall'importazione, per colpire la scheda giusta
function idIscrizione(idIscritto) {
    return String(idIscritto).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 300) || 'senza-identificativo';
}
const STATI = ['', 'confermato', 'presente', 'assente'];
/* Portali da cui puo' arrivare un'iscrizione inserita a mano. Per le voci
   fisse l'etichetta la decide il servizio, non chi chiama: cosi' la colonna
   "Portale" resta confrontabile. Con "altro" il nome della piattaforma lo
   scrive chi inserisce (LinkedIn, Meetup...), ripulito e accorciato qui. */
const PORTALI = {
    eventbrite: 'Eventbrite',
    sito: 'Sito NGB',
    email: 'Email o segreteria',
    telefono: 'Telefono o di persona',
    altro: 'Altra piattaforma'
};
function emailValida(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}
// per i valori che entrano nell'HTML della mail (il nome del destinatario)
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
/* Tratto "preferenze gia' indicate" dell'invito B2B: il testo fra {{SE_TEMI}}
   e {{/SE_TEMI}} resta solo se il destinatario ha gia' dei temi, con {{TEMI}}
   al loro posto. Specchio di conTemiB2B in newsletter-format.js. */
function conTemi(s, temi) {
    s = String(s == null ? '' : s);
    const i = s.indexOf('{{SE_TEMI}}');
    if (i < 0) return s;
    const j = s.indexOf('{{/SE_TEMI}}');
    if (j < 0) return s;
    const pre = s.slice(0, i);
    const dentro = s.slice(i + '{{SE_TEMI}}'.length, j);
    const dopo = s.slice(j + '{{/SE_TEMI}}'.length);
    return temi ? pre + dentro.split('{{TEMI}}').join(temi) + dopo : pre + dopo;
}
/* Data di iscrizione in formato italiano, fuso di Roma: la stessa regola del
   form pubblico (iscrizione-nuova), perche' la data entra nell'identificativo
   della scheda e dev'essere fatta allo stesso modo. */
function adesso() {
    const f = new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const p = {};
    f.formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
    return p.day + '/' + p.month + '/' + p.year + ' ' + p.hour + ':' + p.minute + ':' + p.second;
}
/* Equity o founding partner: conta SOLO il RUOLO DI ACCESSO dell'utente
   (utenti/<email>.ruolo). Un ruolo il cui id o nome dice "equity" oppure
   "founding/founder" abilita; l'id dei ruoli su misura e' lo slug del nome,
   quindi di solito basta senza nemmeno leggere l'archivio ruoli. La spunta
   Equity/Founding partner in anagrafica qui NON vale: il permesso si governa
   dalla sezione Utenti. In caso di dubbio (archivio ruoli illeggibile) si
   risponde no: il permesso largo resta all'amministratore. */
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

// stesso trasporto SMTP delle altre mail dell'area riservata
function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}

/* Segna che i dati sono cambiati: la lettura confronta questo numero e rilegge
   l'archivio SOLO quando serve davvero. Se fallisce non e' grave: la lettura ha
   comunque una scadenza a tempo. */
async function segnaCambiamento(db) {
    try {
        await db.collection('meta').doc('iscrizioni')
            .set({ rev: admin.firestore.FieldValue.increment(1), quando: Date.now() }, { merge: true });
    } catch (e) {
        console.error('Revisione non aggiornata:', String((e && e.message) || e).slice(0, 120));
    }
}

/* Freno agli invii per utente: serve a contenere i danni se qualcuno usasse il
   proprio accesso per gonfiare il database con scritture ripetute. Il lavoro
   normale (segnare una tavolata di presenze) resta ampiamente sotto il limite. */
const RL_FINESTRA_MS = 60 * 1000;
const RL_MAX = 60;
const invii = new Map();
function troppiInvii(chi) {
    if (!chi) return false;
    const ora = Date.now();
    const elenco = (invii.get(chi) || []).filter(t => ora - t < RL_FINESTRA_MS);
    if (elenco.length >= RL_MAX) { invii.set(chi, elenco); return true; }
    elenco.push(ora);
    invii.set(chi, elenco);
    if (invii.size > 300) {
        for (const [k, v] of invii) {
            if (!v.length || ora - v[v.length - 1] > RL_FINESTRA_MS) invii.delete(k);
        }
    }
    return false;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito' }); return; }

    try {
        const cred = leggiServiceAccount();
        initAdmin(cred);
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

        // 1) chi sta scrivendo
        const idToken = String(body.idToken || '');
        if (!idToken) { res.status(401).json({ ok: false, msg: 'Autenticazione mancante' }); return; }
        let decoded;
        try { decoded = await admin.auth().verifyIdToken(idToken); }
        catch (e) { res.status(401).json({ ok: false, msg: 'Sessione non valida: rientra e riprova.' }); return; }
        const email = String(decoded.email || '').toLowerCase();
        if (!email) { res.status(401).json({ ok: false, msg: 'Utente non valido' }); return; }

        const db = admin.firestore();
        const uDoc = await db.collection('utenti').doc(email).get();
        if (!uDoc.exists || uDoc.data().attivo === false) { res.status(403).json({ ok: false, msg: 'Utenza non abilitata.' }); return; }
        const dati = uDoc.data() || {};
        const ruolo = String(dati.ruolo || '');
        const eAdmin = ruolo === 'admin';

        // 2) abilitato agli Eventi: amministratore, contrassegno sulla scheda, o elenco condiviso
        let abilitati = [];
        try {
            const cfgDoc = await db.collection('archivio').doc('eventiConfig').get();
            if (cfgDoc.exists) {
                const cfg = JSON.parse(cfgDoc.data().json || '{}');
                abilitati = Array.isArray(cfg.abilitati) ? cfg.abilitati.map(x => String(x).toLowerCase()) : [];
            }
        } catch (_) { abilitati = []; }
        if (!eAdmin && dati.eventi !== true && abilitati.indexOf(email) < 0) {
            res.status(403).json({ ok: false, msg: 'Non sei abilitato alla sezione Eventi.' });
            return;
        }

        if (troppiInvii(email)) { res.status(429).json({ ok: false, msg: 'Troppe modifiche ravvicinate: attendi qualche istante.' }); return; }

        const evento = testo(body.evento, 80);
        const azione = String(body.azione || 'imposta');
        // una sola persona o piu' insieme: la cancellazione accetta entrambe le forme
        const elencoId = Array.isArray(body.idIscritti)
            ? body.idIscritti.map(x => testo(x, 300)).filter(Boolean)
            : [];
        const idIscritto = testo(body.idIscritto, 300);
        if (!evento) { res.status(400).json({ ok: false, msg: 'Evento mancante.' }); return; }
        // "aggiungi" crea la scheda e "invita-b2b" porta il proprio elenco di
        // destinatari: sono le sole azioni senza un iscritto da indicare qui
        if (azione !== 'aggiungi' && azione !== 'invita-b2b' && !idIscritto && !elencoId.length) { res.status(400).json({ ok: false, msg: 'Nessun iscritto indicato.' }); return; }

        if (azione === 'aggiungi') {
            // oltre all'amministratore, TUTTI gli equity e founding partner:
            // l'iscrizione da Eventbrite la riporta chi segue l'evento
            if (!eAdmin && !(await ePartner(db, ruolo))) {
                res.status(403).json({ ok: false, msg: 'Possono aggiungere un\'iscrizione l\'amministratore, gli equity partner e i founding partner.' });
                return;
            }
            const c = body.campi || {};
            const pagina = testo(body.pagina, 200);
            if (!pagina) { res.status(400).json({ ok: false, msg: 'Pagina dell\'evento mancante.' }); return; }
            const portaleId = testo((body.portale || {}).id, 40).toLowerCase();
            if (!PORTALI[portaleId]) { res.status(400).json({ ok: false, msg: 'Portale di provenienza non riconosciuto.' }); return; }
            const portaleNome = portaleId === 'altro'
                ? (testo((body.portale || {}).nome, 40) || PORTALI.altro)
                : PORTALI[portaleId];
            // quante persone copre l'iscrizione (da Eventbrite un ordine puo' valere
            // per piu' posti): fuori misura o mancante diventa 1, mai zero
            const partecipanti = Math.min(99, Math.max(1, parseInt(testo(c.partecipanti, 6), 10) || 1));
            const scheda = {
                data: testo(c.data, 40) || adesso(),
                pagina: pagina,
                nome: testo(c.nome, 120),
                cognome: testo(c.cognome, 120),
                email: testo(c.email, 200).toLowerCase(),
                azienda: testo(c.azienda, 200),
                ruolo: testo(c.ruolo, 200),
                telefono: testo(c.telefono, 60),
                messaggio: testo(c.messaggio, 2000),
                /* portale e partecipanti stanno in DUE posti: come campi sulla
                   scheda, e come colonne "Portale" e "Partecipanti" fra le
                   aggiuntive, che l'elenco mostra gia' da se' senza toccare
                   la lettura */
                portale: portaleId,
                portaleNome: portaleNome,
                partecipanti: partecipanti,
                extra: { Portale: portaleNome, Partecipanti: String(partecipanti) },
                origine: 'manuale',
                inserito: { da: email, daNome: testo(dati.nome, 120) || email, quando: Date.now() },
                ricevuto: admin.firestore.FieldValue.serverTimestamp()
            };
            if (!scheda.email && !scheda.nome && !scheda.cognome) {
                res.status(400).json({ ok: false, msg: 'Servono almeno un nome o un indirizzo email.' }); return;
            }
            if (scheda.email && !emailValida(scheda.email)) {
                res.status(400).json({ ok: false, msg: 'Indirizzo email non valido.' }); return;
            }
            // stesso identificativo del form del sito: un doppio salvataggio della
            // stessa persona nello stesso istante aggiorna la scheda, non la duplica
            const idNuovo = (scheda.email || (chiaveTesto(scheda.nome) + '.' + chiaveTesto(scheda.cognome))) + '|' + scheda.data;
            await db.collection('iscrizioni').doc(idIscrizione(idNuovo)).set(scheda, { merge: true });
            await segnaCambiamento(db);

            /* Mail di conferma: arriva GIA' COMPOSTA dall'area riservata (formato
               NGB), come per la newsletter. Qui si decide solo il destinatario,
               che e' SEMPRE l'iscritto appena registrato: questo endpoint non
               deve poter spedire ad altri. Se l'invio fallisce l'iscrizione
               resta valida: si risponde com'e' andata, senza disfare nulla. */
            let mailEsito = null;
            const m = body.mail && typeof body.mail === 'object' ? body.mail : null;
            if (m) {
                if (!scheda.email) {
                    mailEsito = { inviata: false, msg: 'Nessun indirizzo email sulla scheda.' };
                } else {
                    const oggetto = testo(m.oggetto, 250) || 'Iscrizione confermata - Next Generation Business';
                    const html = String(m.html || '').slice(0, 300000);
                    const testoMail = String(m.testo || '').slice(0, 20000);
                    if (!html.trim()) {
                        mailEsito = { inviata: false, msg: 'Contenuto della mail mancante.' };
                    } else {
                        try {
                            const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
                            const fromName = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
                            // il segnaposto {{COMPLETA}} diventa il collegamento personale
                            // FIRMATO della scheda appena creata: da li' l'iscritto
                            // modifica i dati o annulla l'iscrizione
                            const linkGestione = NL.linkCompleta(idIscrizione(idNuovo));
                            const messaggio = {
                                from: '"' + fromName + '" <' + fromEmail + '>',
                                replyTo: email,
                                to: scheda.email,
                                subject: oggetto.replace(/[\r\n]/g, ' '),
                                text: (testoMail ? testoMail.split('{{COMPLETA}}').join(linkGestione) : undefined),
                                html: html.split('{{COMPLETA}}').join(linkGestione)
                            };
                            /* copia nascosta a chi ha inserito la scheda: cosi' ha
                               agli atti la conferma partita, senza comparire
                               all'iscritto. Se sta iscrivendo se stesso la copia
                               non serve: riceverebbe la stessa mail due volte. */
                            if (email !== scheda.email) messaggio.bcc = email;
                            await trasporto().sendMail(messaggio);
                            mailEsito = { inviata: true };
                        } catch (e) {
                            const motivo = String((e && e.message) || 'errore del server di posta').slice(0, 200);
                            console.error('Conferma iscrizione a', scheda.email, 'non inviata:', motivo);
                            mailEsito = { inviata: false, msg: motivo };
                        }
                    }
                }
            }
            res.status(200).json({ ok: true, id: idNuovo, mail: mailEsito });
            return;
        }

        /* Chiede all'intestatario di un'iscrizione manuale i dati mancanti (suoi
           e degli altri partecipanti). La mail arriva gia' composta dall'area
           riservata con il segnaposto {{COMPLETA}}: qui si genera il
           collegamento personale FIRMATO per quella sola scheda, lo si mette al
           posto del segnaposto e si spedisce all'email della scheda, con copia
           nascosta a chi chiede. Stessi permessi dell'inserimento manuale. */
        if (azione === 'richiedi-dati') {
            if (!eAdmin && !(await ePartner(db, ruolo))) {
                res.status(403).json({ ok: false, msg: 'Possono chiedere i dati l\'amministratore, gli equity partner e i founding partner.' });
                return;
            }
            // il nome del documento arriva con la riga quando c'e' (serve per le
            // schede-partecipante, il cui nome non si ricava dai campi)
            const rif = db.collection('iscrizioni').doc(testo(body.doc, 400) || idIscrizione(idIscritto));
            const snap = await rif.get();
            if (!snap.exists) { res.status(404).json({ ok: false, msg: 'Scheda non trovata: aggiorna l\'elenco e riprova.' }); return; }
            const scheda = snap.data() || {};
            if (!scheda.email) { res.status(400).json({ ok: false, msg: 'La scheda non ha un indirizzo email: aggiungilo con Modifica, poi riprova.' }); return; }
            const m = body.mail && typeof body.mail === 'object' ? body.mail : {};
            const link = NL.linkCompleta(rif.id);
            const oggetto = (testo(m.oggetto, 250) || 'Completa la tua iscrizione - Next Generation Business').replace(/[\r\n]/g, ' ');
            const html = String(m.html || '').slice(0, 300000).split('{{COMPLETA}}').join(link);
            const testoMail = String(m.testo || '').slice(0, 20000).split('{{COMPLETA}}').join(link);
            if (!html.trim()) { res.status(400).json({ ok: false, msg: 'Contenuto della mail mancante.' }); return; }
            try {
                const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
                const fromName = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
                const messaggio = {
                    from: '"' + fromName + '" <' + fromEmail + '>',
                    replyTo: email,
                    to: scheda.email,
                    subject: oggetto,
                    text: testoMail || undefined,
                    html: html
                };
                if (email !== scheda.email) messaggio.bcc = email;
                await trasporto().sendMail(messaggio);
            } catch (e) {
                const motivo = String((e && e.message) || 'errore del server di posta').slice(0, 200);
                console.error('Richiesta dati a', scheda.email, 'non inviata:', motivo);
                res.status(502).json({ ok: false, msg: 'Mail non inviata: ' + motivo });
                return;
            }
            // sulla scheda resta scritto che i dati sono stati chiesti, e da chi:
            // non cambia i conteggi e non tocca la colonna delle firme
            await rif.set({ datiRichiesti: { da: email, daNome: testo(dati.nome, 120) || email, quando: Date.now() } }, { merge: true });
            res.status(200).json({ ok: true, mail: { inviata: true } });
            return;
        }

        /* Invito massivo agli incontri B2B. La mail arriva gia' composta (formato
           NGB) con due segnaposti: {{NOME}} (il destinatario) e {{B2B}} (il suo
           collegamento personale FIRMATO al modulo dei temi). Qui si spedisce una
           mail per destinatario, in sequenza, a lotti che il client manda uno
           dopo l'altro. Chi ha gia' ricevuto l'invito viene saltato (b2bInvito
           sulla scheda), salvo richiesta esplicita di reinvio. Stessi permessi
           dell'inserimento manuale. */
        if (azione === 'invita-b2b') {
            if (!eAdmin && !(await ePartner(db, ruolo))) {
                res.status(403).json({ ok: false, msg: 'Possono invitare l\'amministratore, gli equity partner e i founding partner.' });
                return;
            }
            const dest = (Array.isArray(body.destinatari) ? body.destinatari : []).slice(0, 50)
                .map(x => (x && typeof x === 'object') ? { id: testo(x.id, 300), doc: testo(x.doc, 400) } : null)
                .filter(x => x && (x.id || x.doc));
            if (!dest.length) { res.status(400).json({ ok: false, msg: 'Nessun destinatario indicato.' }); return; }
            const m = body.mail && typeof body.mail === 'object' ? body.mail : {};
            const oggettoBase = (testo(m.oggetto, 250) || 'Incontri B2B riservati - Next Generation Business').replace(/[\r\n]/g, ' ');
            const htmlBase = String(m.html || '').slice(0, 300000);
            const testoBase = String(m.testo || '').slice(0, 20000);
            if (!htmlBase.trim()) { res.status(400).json({ ok: false, msg: 'Contenuto della mail mancante.' }); return; }
            const forza = body.forza === true;
            const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
            const fromName = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
            const trans = trasporto();
            let inviate = 0, senzaScheda = 0, senzaEmail = 0, giaInvitate = 0;
            const falliti = [];
            const visti = {};   // per non spedire due volte allo stesso indirizzo nel lotto
            for (const d of dest) {
                const docId = d.doc || idIscrizione(d.id);
                const rif = db.collection('iscrizioni').doc(docId);
                const snap = await rif.get();
                if (!snap.exists) { senzaScheda++; continue; }
                const s = snap.data() || {};
                const a = String(s.email || '').toLowerCase();
                if (!a || !emailValida(a)) { senzaEmail++; continue; }
                if (visti[a]) { giaInvitate++; continue; }
                if (s.annullato) { senzaScheda++; continue; }
                if (s.b2bInvito && !forza) { giaInvitate++; continue; }
                visti[a] = true;
                const nomeDest = ((String(s.nome || '') + ' ' + String(s.cognome || '')).trim()) || 'ospite';
                const link = NL.linkB2B(docId);
                // chi ha gia' espresso preferenze se le ritrova scritte nella mail,
                // con l'invito a confermarle o modificarle dal modulo
                const temiAttuali = String(s.interessi || '').split(',').map(x => x.trim()).filter(Boolean).join(', ');
                try {
                    await trans.sendMail({
                        from: '"' + fromName + '" <' + fromEmail + '>',
                        replyTo: email,
                        to: a,
                        subject: oggettoBase,
                        text: testoBase ? conTemi(testoBase, temiAttuali).split('{{NOME}}').join(nomeDest).split('{{B2B}}').join(link) : undefined,
                        html: conTemi(htmlBase, esc(temiAttuali)).split('{{NOME}}').join(esc(nomeDest)).split('{{B2B}}').join(link)
                    });
                    inviate++;
                    await rif.set({ b2bInvito: { quando: Date.now(), da: email } }, { merge: true });
                } catch (e) {
                    const motivo = String((e && e.message) || 'errore del server di posta').slice(0, 150);
                    falliti.push({ email: a, motivo: motivo });
                }
            }
            res.status(200).json({ ok: true, inviate: inviate, senzaScheda: senzaScheda, senzaEmail: senzaEmail, giaInvitate: giaInvitate, falliti: falliti.slice(0, 50) });
            return;
        }

        if (azione === 'cancella') {
            if (!eAdmin) { res.status(403).json({ ok: false, msg: 'Solo l\'amministratore puo cancellare un\'iscrizione.' }); return; }
            const daCancellare = elencoId.length ? elencoId : [idIscritto];
            if (daCancellare.length > 300) { res.status(400).json({ ok: false, msg: 'Troppe iscrizioni in una volta sola.' }); return; }
            const firma = { da: email, daNome: testo(dati.nome, 120) || email, quando: Date.now() };
            // Traccia PRIMA, cancellazione poi: se qualcosa va storto a meta' strada la
            // persona resta comunque fuori dall'elenco, invece di ricomparire dal foglio.
            let batch = db.batch(), nel = 0;
            for (const id of daCancellare) {
                batch.set(db.collection('iscrizioniCancellate').doc(idDoc(evento, id)), { evento: evento, idIscritto: id, ...firma });
                nel++;
                if (nel >= 400) { await batch.commit(); batch = db.batch(); nel = 0; }
            }
            if (nel) await batch.commit();
            // Dal RIEPILOGO ("tutti") si toglie solo dall'elenco riepilogativo: la
            // scheda e la sua presenza restano intatte nel singolo evento. La traccia
            // scritta sopra vale infatti solo per l'elenco "tutti".
            if (evento === 'tutti') {
                await segnaCambiamento(db);
                res.status(200).json({ ok: true, cancellate: daCancellare.length, soloRiepilogo: true });
                return;
            }
            // La scheda vera e propria: il nome del documento si ricava dallo stesso
            // identificativo usato dal form ("email|data"), quindi si cancella SOLO
            // quella persona per quell'evento, non tutte le sue iscrizioni.
            batch = db.batch(); nel = 0;
            for (const id of daCancellare) {
                batch.delete(db.collection('iscrizioni').doc(idIscrizione(id)));
                batch.delete(db.collection('presenze').doc(idDoc(evento, id)));
                nel += 2;
                if (nel >= 400) { await batch.commit(); batch = db.batch(); nel = 0; }
            }
            if (nel) await batch.commit();
            await segnaCambiamento(db);
            res.status(200).json({ ok: true, cancellate: daCancellare.length });
            return;
        }

        if (azione === 'modifica') {
            if (!eAdmin) { res.status(403).json({ ok: false, msg: 'Solo l\'amministratore puo modificare un\'iscrizione.' }); return; }
            const c = body.campi || {};
            const rifVecchio = db.collection('iscrizioni').doc(idIscrizione(idIscritto));
            const snap = await rifVecchio.get();
            // se la scheda esisteva solo sul foglio, la modifica la crea su Firestore
            const attuale = (snap.exists && snap.data()) || {};
            const nuovo = {
                data: c.data !== undefined ? testo(c.data, 40) : String(attuale.data || idIscritto.split('|')[1] || ''),
                pagina: String(attuale.pagina || testo(body.pagina, 200) || ''),
                nome: c.nome !== undefined ? testo(c.nome, 120) : String(attuale.nome || ''),
                cognome: c.cognome !== undefined ? testo(c.cognome, 120) : String(attuale.cognome || ''),
                email: c.email !== undefined ? testo(c.email, 200).toLowerCase() : String(attuale.email || ''),
                azienda: c.azienda !== undefined ? testo(c.azienda, 200) : String(attuale.azienda || ''),
                ruolo: c.ruolo !== undefined ? testo(c.ruolo, 200) : String(attuale.ruolo || ''),
                telefono: c.telefono !== undefined ? testo(c.telefono, 60) : String(attuale.telefono || ''),
                messaggio: c.messaggio !== undefined ? testo(c.messaggio, 2000) : String(attuale.messaggio || ''),
                modificato: { da: email, daNome: testo(dati.nome, 120) || email, quando: Date.now() }
            };
            if (nuovo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(nuovo.email)) {
                res.status(400).json({ ok: false, msg: 'Indirizzo email non valido.' }); return;
            }
            if (!nuovo.email && !nuovo.nome && !nuovo.cognome) {
                res.status(400).json({ ok: false, msg: 'Servono almeno un nome o un indirizzo email.' }); return;
            }
            if (!nuovo.pagina) nuovo.pagina = String(attuale.pagina || '');
            // L'identificativo nasce da email e data: se cambiano, la scheda TRASLOCA su
            // un nuovo documento e con lei lo stato e la nota gia' registrati.
            const idNuovo = (nuovo.email || (chiaveTesto(nuovo.nome) + '.' + chiaveTesto(nuovo.cognome))) + '|' + nuovo.data;
            const rifNuovo = db.collection('iscrizioni').doc(idIscrizione(idNuovo));
            await rifNuovo.set(nuovo, { merge: true });
            if (idIscrizione(idNuovo) !== idIscrizione(idIscritto)) {
                const pVecchia = await db.collection('presenze').doc(idDoc(evento, idIscritto)).get();
                if (pVecchia.exists) {
                    const pd = pVecchia.data() || {};
                    await db.collection('presenze').doc(idDoc(evento, idNuovo))
                        .set({ ...pd, idIscritto: idNuovo }, { merge: true });
                }
                const b = db.batch();
                b.delete(rifVecchio);
                b.delete(db.collection('presenze').doc(idDoc(evento, idIscritto)));
                await b.commit();
            }
            await segnaCambiamento(db);
            res.status(200).json({ ok: true, id: idNuovo, iscrizione: { id: idNuovo, ...nuovo, modificato: undefined } });
            return;
        }

        // 3) stato e nota
        const patch = {
            evento: evento, idIscritto: idIscritto,
            da: email, daNome: testo(dati.nome, 120) || email, quando: Date.now()
        };
        if (Object.prototype.hasOwnProperty.call(body, 'stato')) {
            const st = testo(body.stato, 20);
            if (STATI.indexOf(st) < 0) { res.status(400).json({ ok: false, msg: 'Stato non valido.' }); return; }
            patch.stato = st;
        }
        if (Object.prototype.hasOwnProperty.call(body, 'nota')) patch.nota = testo(body.nota, 500);
        if (patch.stato === undefined && patch.nota === undefined) {
            res.status(400).json({ ok: false, msg: 'Niente da salvare.' });
            return;
        }
        await db.collection('presenze').doc(idDoc(evento, idIscritto)).set(patch, { merge: true });
        // si risponde con cio' che risulta ORA sul server, non con la sola modifica:
        // altrimenti chi ha salvato la sola nota si vedrebbe azzerare lo stato
        await segnaCambiamento(db);
        const dopo = await db.collection('presenze').doc(idDoc(evento, idIscritto)).get();
        const v = (dopo.exists && dopo.data()) || patch;
        res.status(200).json({
            ok: true,
            presenza: {
                stato: String(v.stato || ''), nota: String(v.nota || ''),
                da: String(v.da || ''), daNome: String(v.daNome || ''),
                quando: typeof v.quando === 'number' ? v.quando : Date.now()
            }
        });
    } catch (e) {
        const motivo = String((e && e.message) || 'errore').slice(0, 200);
        console.error('Presenze: operazione non riuscita:', motivo);
        res.status(500).json({ ok: false, msg: motivo });
    }
};
