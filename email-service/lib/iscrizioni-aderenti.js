/* ============================================================
   Le iscrizioni a pagamento degli aderenti Revilaw
   ------------------------------------------------------------
   Milano, febbraio 2027: la cena di venerdi' 26 e il meeting
   di sabato 27 sono riservati agli aderenti Revilaw e costano
   200 euro piu' IVA. Chi e' invitato riceve il collegamento
   alla pagina (/milano_febbraio_2027/aderenti/), che sta fuori
   dalla sitemap e con "noindex" come le pagine delle cene di
   Napoli: l'indirizzo e' l'invito.

   PERCHE' I DATI DI FATTURAZIONE. Dopo l'iscrizione si emette
   la fattura: servono intestatario, partita IVA o codice
   fiscale, sede e il canale dello SDI (codice destinatario o
   PEC). Chiederli nel modulo evita il giro di mail "ci manda i
   dati per la fattura?" con ciascun iscritto.

   DUE MAIL, COME LE RICHIESTE DI CONTATTO:

     A NOI   tutti i dati, agli indirizzi di AVVISA qui sotto,
             con "rispondi a" l'iscritto. Da li' parte la
             fattura.
     A LORO  il riepilogo: cosa si sono iscritti a fare, quanto
             costa e che la fattura arrivera' all'indirizzo di
             fatturazione indicato.

   L'ORDINE CONTA. Prima si scrive in archivio (collezione
   "iscrizioniAderenti"), poi si spedisce: se la posta non
   risponde l'iscrizione resta registrata e si recupera da li'.

   UN INDIRIZZO, UNA SCHEDA. Chi compila due volte - per
   correggere un dato di fatturazione, per esempio - aggiorna la
   sua scheda invece di crearne una seconda: due righe sarebbero
   due fatture. L'avviso interno riparte e dice che e' una
   correzione, cosi' chi fattura usa i dati nuovi.
   ============================================================ */

const nodemailer = require('nodemailer');
const { avvolgi, senzaTrattiniLunghi } = require('./mail-layout');

const COLLEZIONE = 'iscrizioniAderenti';

/* --- LE QUOTE ---
   Restano qui e non nella pagina: importo, date e destinatari degli avvisi
   li decide il servizio. Se arrivassero dal browser basterebbe cambiarli
   per iscriversi a un altro prezzo o far partire l'avviso altrove. */
const QUOTE = [
    {
        id: 'milano-2027-aderenti',
        evento: 'milano-2027-02-26',
        titolo: 'Cena e meeting degli aderenti Revilaw',
        luogo: 'Milano',
        voci: [
            { cosa: 'Cena', quando: 'venerdì 26 febbraio 2027' },
            { cosa: 'Meeting degli aderenti', quando: 'sabato 27 febbraio 2027' }
        ],
        imponibile: 200,
        aliquotaIva: 22,
        pagina: '/milano_febbraio_2027/aderenti/',
        avvisa: ['pierluigisterzi@revilaw.it', 'andreamissori@revilaw.it'],
        // nessun termine per ora: quando si fissa, un istante con il fuso
        scadenza: 0
    }
];

function definizione(id) {
    return QUOTE.find(q => q.id === String(id || '')) || null;
}
function importi(q) {
    const iva = Math.round(q.imponibile * q.aliquotaIva) / 100;
    return { imponibile: q.imponibile, iva: iva, totale: Math.round((q.imponibile + iva) * 100) / 100 };
}
function euro(n) {
    return Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function chiusa(q) { return !!q.scadenza && Date.now() > q.scadenza; }

/* Quello che la pagina puo' sapere: la quota, non chi si e' gia' iscritto. */
function perLaPagina(q) {
    if (!q) return null;
    return {
        id: q.id, titolo: q.titolo, luogo: q.luogo, voci: q.voci,
        importi: importi(q), aliquotaIva: q.aliquotaIva, chiusa: chiusa(q)
    };
}

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200);
}
function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function indirizzoValido(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
}
function idScheda(quota, email) {
    return (String(quota) + '~' + String(email)).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 400);
}

/* --- i controlli sui dati fiscali ---
   Si controlla la forma, non l'esistenza: una partita IVA con la cifra di
   controllo sbagliata e' quasi sempre un errore di battitura, e scoprirlo
   adesso costa meno che scoprirlo con la fattura scartata dallo SDI. */
function partitaIvaValida(p) {
    if (!/^\d{11}$/.test(p)) return false;
    let s = 0;
    for (let i = 0; i < 11; i++) {
        let n = Number(p[i]);
        if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
        s += n;
    }
    return s % 10 === 0;
}
// sedici caratteri per le persone, undici cifre per le societa'
function codiceFiscaleValido(c) {
    return /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(c) || partitaIvaValida(c);
}

/* --- i campi di un'iscrizione ---
   Quello che arriva qui lo scrive chiunque abbia il collegamento, e va
   trattato come tale: ogni campo ha un tetto e una forma. */
function leggiCampi(q, c) {
    const a = {
        nome: testo(c.nome, 80),
        cognome: testo(c.cognome, 80),
        email: testo(c.email, 200).toLowerCase(),
        telefono: testo(c.telefono, 40),
        studio: testo(c.studio, 160),
        citta: testo(c.citta, 80)
    };
    if (!a.nome || !a.cognome) return { ok: false, msg: 'Nome e cognome sono obbligatori.' };
    if (!indirizzoValido(a.email)) return { ok: false, msg: 'L\'indirizzo email non sembra valido.' };
    if (a.telefono.replace(/\D/g, '').length < 6) {
        return { ok: false, msg: 'Indichi un numero di telefono.' };
    }

    const f = c.fatturazione || {};
    const fat = {
        intestatario: testo(f.intestatario, 160),
        partitaIva: testo(f.partitaIva, 20).replace(/\s+/g, '').replace(/^IT/i, ''),
        codiceFiscale: testo(f.codiceFiscale, 20).replace(/\s+/g, '').toUpperCase(),
        indirizzo: testo(f.indirizzo, 160),
        cap: testo(f.cap, 10).replace(/\s+/g, ''),
        comune: testo(f.comune, 80),
        provincia: testo(f.provincia, 40).toUpperCase(),
        codiceDestinatario: testo(f.codiceDestinatario, 40).replace(/\s+/g, '').toUpperCase(),
        pec: testo(f.pec, 200).toLowerCase(),
        emailFatture: testo(f.emailFatture, 200).toLowerCase()
    };
    if (!fat.intestatario) return { ok: false, msg: 'Indichi l\'intestatario della fattura.' };
    /* Tutti e due, partita IVA e codice fiscale: chi fattura li vuole entrambi
       sulla scheda (per una societa' il codice fiscale e' spesso uguale alla
       partita IVA, e allora si scrive due volte). */
    if (!fat.partitaIva) return { ok: false, msg: 'Indichi la partita IVA dell\'intestatario.' };
    if (!partitaIvaValida(fat.partitaIva)) {
        return { ok: false, msg: 'La partita IVA non sembra corretta: sono 11 cifre, controlli di non averne scambiata qualcuna.' };
    }
    if (!fat.codiceFiscale) return { ok: false, msg: 'Indichi il codice fiscale dell\'intestatario.' };
    if (!codiceFiscaleValido(fat.codiceFiscale)) {
        return { ok: false, msg: 'Il codice fiscale non sembra corretto.' };
    }
    if (!fat.indirizzo || !fat.comune) return { ok: false, msg: 'Indichi l\'indirizzo della sede di fatturazione.' };
    if (!/^\d{5}$/.test(fat.cap)) return { ok: false, msg: 'Il CAP è di 5 cifre.' };
    if (!/^[A-Z]{2}$/.test(fat.provincia)) return { ok: false, msg: 'Indichi la sigla della provincia (per esempio MI).' };
    if (fat.codiceDestinatario && !/^[A-Z0-9]{6,7}$/.test(fat.codiceDestinatario)) {
        return { ok: false, msg: 'Il codice destinatario SDI è di 7 caratteri, lettere e numeri.' };
    }
    if (fat.pec && !indirizzoValido(fat.pec)) return { ok: false, msg: 'L\'indirizzo PEC non sembra valido.' };
    // la fattura elettronica deve sapere dove andare: almeno uno dei due
    if (!fat.codiceDestinatario && !fat.pec) {
        return { ok: false, msg: 'Indichi il codice destinatario SDI o la PEC (almeno uno dei due).' };
    }
    if (!fat.emailFatture) return { ok: false, msg: 'Indichi l\'indirizzo email a cui inviare la fattura.' };
    if (!indirizzoValido(fat.emailFatture)) {
        return { ok: false, msg: 'L\'indirizzo email per la fattura non sembra valido.' };
    }

    if (c.privacy !== true) return { ok: false, msg: 'Per iscriversi serve il consenso al trattamento dei dati.' };
    if (c.accettaQuota !== true) return { ok: false, msg: 'Confermi di aver letto la quota di partecipazione.' };

    return {
        ok: true,
        r: Object.assign(a, {
            quota: q.id, evento: q.evento,
            fatturazione: fat,
            importi: importi(q),
            note: testo(c.note, 600),
            quando: Date.now(),
            origine: testo(c.origine, 200)
        })
    };
}

/* --- le due mail --- */
function righeTabella(righe) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;font-size:14px;">'
        + righe.filter(x => x[1]).map(x =>
            '<tr><td style="padding:4px 14px 4px 0;color:#475569;white-space:nowrap;vertical-align:top;">' + esc(x[0]) + '</td>'
            + '<td style="padding:4px 0;font-weight:600;">' + esc(x[1]) + '</td></tr>').join('')
        + '</table>';
}
function righeFatturazione(f) {
    return [
        ['Intestatario', f.intestatario],
        ['Partita IVA', f.partitaIva],
        ['Codice fiscale', f.codiceFiscale],
        ['Sede', f.indirizzo + ', ' + f.cap + ' ' + f.comune + ' (' + f.provincia + ')'],
        ['Codice destinatario', f.codiceDestinatario],
        ['PEC', f.pec],
        ['Email per la fattura', f.emailFatture]
    ];
}
function cosaQuando(q) {
    return q.voci.map(v => v.cosa + ' - ' + v.quando);
}

function mailInterna(q, r, correzione) {
    const imp = r.importi;
    const dentro = '<p style="margin:0 0 14px;">'
        + (correzione
            ? '<b>Iscrizione aggiornata.</b> ' + esc(r.nome + ' ' + r.cognome) + ' ha inviato di nuovo il modulo: valgono i dati qui sotto, che sostituiscono quelli ricevuti prima.'
            : 'Nuova iscrizione dalla pagina riservata agli aderenti.')
        + '</p>'
        + '<p style="margin:0 0 6px;"><b>' + esc(q.titolo) + ' · ' + esc(q.luogo) + '</b><br>'
        + cosaQuando(q).map(esc).join('<br>') + '</p>'
        + '<p style="margin:0 0 16px;">Quota: ' + euro(imp.imponibile) + ' + IVA ' + q.aliquotaIva + '% (' + euro(imp.iva)
        + ') = <b>' + euro(imp.totale) + '</b>. Da fatturare.</p>'
        + '<p style="margin:0 0 4px;color:#164068;font-weight:700;">Partecipante</p>'
        + righeTabella([
            ['Nome', r.nome + ' ' + r.cognome],
            ['Email', r.email],
            ['Telefono', r.telefono],
            ['Studio / società', r.studio],
            ['Città', r.citta]
        ])
        + '<p style="margin:0 0 4px;color:#164068;font-weight:700;">Dati di fatturazione</p>'
        + righeTabella(righeFatturazione(r.fatturazione))
        /* Le note le scrive l'iscritto sotto la domanda "allergie o intolleranze
           per la cena, altre indicazioni": l'avviso lo ripete, cosi' chi lo
           legge sa che cosa sta leggendo, e dice anche quando sono vuote. */
        + '<p style="margin:0 0 14px;"><b>Note (allergie o intolleranze per la cena, altre indicazioni)</b><br>'
        + (r.note ? esc(r.note) : '<span style="color:#475569;">nessuna</span>') + '</p>'
        + '<p style="margin:0;font-size:13px;color:#475569;">Rispondendo a questo messaggio si scrive direttamente a '
        + esc(r.email) + '.</p>';
    return {
        oggetto: senzaTrattiniLunghi((correzione ? 'Iscrizione aggiornata' : 'Nuova iscrizione') + ' aderenti Milano - '
            + r.nome + ' ' + r.cognome + (r.fatturazione.intestatario ? ' (' + r.fatturazione.intestatario + ')' : '')),
        html: avvolgi(dentro)
    };
}

function mailConferma(q, r, correzione) {
    const imp = r.importi;
    const dentro = '<p style="margin:0 0 14px;">Gentile ' + esc(r.nome) + ' ' + esc(r.cognome) + ',</p>'
        + '<p style="margin:0 0 14px;">'
        + (correzione ? 'abbiamo aggiornato la Sua iscrizione' : 'abbiamo registrato la Sua iscrizione')
        + ' alla <b>' + esc(q.titolo) + '</b> di ' + esc(q.luogo) + ':</p>'
        + '<p style="margin:0 0 14px;">' + cosaQuando(q).map(esc).join('<br>') + '</p>'
        + '<p style="margin:0 0 14px;">La quota di partecipazione è di <b>' + euro(imp.imponibile) + ' + IVA</b> ('
        + euro(imp.totale) + ' IVA inclusa). Nei prossimi giorni riceverà la fattura, intestata come indicato nel modulo.</p>'
        + '<p style="margin:0 0 4px;font-size:13px;color:#475569;">Dati di fatturazione che ci ha comunicato:</p>'
        + righeTabella(righeFatturazione(r.fatturazione))
        + '<p style="margin:0 0 14px;font-size:13px;color:#475569;">Se un dato non è corretto può tornare sulla stessa '
        + 'pagina e inviare di nuovo il modulo con lo stesso indirizzo email: vale l\'ultimo invio. Per qualunque '
        + 'necessità scriva a info@nextgenerationbusiness.it.</p>'
        + '<p style="margin:0;">Cordiali saluti.</p>';
    return {
        oggetto: senzaTrattiniLunghi((correzione ? 'Iscrizione aggiornata - ' : 'Iscrizione registrata - ') + q.titolo + ', ' + q.luogo),
        html: avvolgi(dentro)
    };
}

function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}
function mittente() {
    const ind = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const nome = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
    return '"' + nome + '" <' + ind + '>';
}
function configurato() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/* --- l'arrivo di un'iscrizione --- */
async function ricevi(db, corpo) {
    const c = corpo || {};
    const q = definizione(c.quota);
    if (!q) return { stato: 400, corpo: { ok: false, msg: 'Iscrizione non riconosciuta.' } };
    if (chiusa(q)) {
        return { stato: 403, corpo: { ok: false, chiusa: true, msg: 'Le iscrizioni sono chiuse. Scriva a info@nextgenerationbusiness.it' } };
    }
    const v = leggiCampi(q, c);
    if (!v.ok) return { stato: 400, corpo: { ok: false, msg: v.msg } };
    const r = v.r;

    const rif = db.collection(COLLEZIONE).doc(idScheda(q.id, r.email));
    let prima = null;
    try {
        const s = await rif.get();
        prima = s.exists ? (s.data() || {}) : null;
    } catch (_) { prima = null; }

    // le versioni precedenti dei dati, per sapere che cosa e' cambiato
    const storia = Array.isArray(prima && prima.storia) ? prima.storia.slice(-4) : [];
    if (prima) storia.push({ quando: Number(prima.quando) || 0, fatturazione: prima.fatturazione || null });
    r.storia = storia;
    r.primaVolta = (prima && prima.primaVolta) || r.quando;

    try {
        await rif.set(r, { merge: true });
    } catch (e) {
        console.error('Iscrizione aderente non registrata:', String((e && e.message) || e).slice(0, 200));
        return { stato: 500, corpo: { ok: false, msg: 'Non siamo riusciti a registrare l\'iscrizione: riprovi fra poco.' } };
    }

    // le mail sono una conseguenza, non una condizione: l'iscrizione e' gia' salva
    let avvisati = false, confermata = false;
    if (configurato()) {
        const trans = trasporto();
        const interna = mailInterna(q, r, !!prima);
        try {
            await trans.sendMail({
                from: mittente(), to: q.avvisa.join(', '), replyTo: r.email,
                subject: interna.oggetto, html: interna.html
            });
            avvisati = true;
        } catch (e) {
            console.error('Iscrizione aderente, avviso interno non partito:', String((e && e.message) || e).slice(0, 200));
        }
        const conferma = mailConferma(q, r, !!prima);
        try {
            await trans.sendMail({ from: mittente(), to: r.email, subject: conferma.oggetto, html: conferma.html });
            confermata = true;
        } catch (e) {
            console.error('Iscrizione aderente, conferma non partita:', String((e && e.message) || e).slice(0, 200));
        }
        try { trans.close(); } catch (_) { /* niente da chiudere */ }
    }
    try { await rif.set({ avvisati: avvisati, mail: confermata }, { merge: true }); }
    catch (_) { /* dato di servizio */ }

    return { stato: 200, corpo: { ok: true, aggiornata: !!prima, mail: confermata, importi: r.importi } };
}

/* =========================================================
   QUELLO CHE VEDE CHI ORGANIZZA (area riservata, sezione Eventi)
   ---------------------------------------------------------
   Arriva da api/presenze.js con sezione: 'aderenti', dopo che il
   servizio ha gia' controllato chi sta guardando. Tre cose:

     elenco   chi si e' iscritto, con i dati per la fattura e i
              conti fatti qui (iscritti, fatture da emettere, totale);
              lo legge chi vede gli Eventi;
     fattura  segnare che la fattura e' stata emessa (o toglierlo, se
              lo si e' segnato per sbaglio): e' il lavoro che si fa su
              questo elenco, e chi lo fa lo fanno gli stessi che
              possono aggiungere un'iscrizione a un evento;
     cancella togliere un'iscrizione sbagliata o di prova: solo
              l'amministratore, come per le cene.
========================================================= */
function rigaElenco(id, v) {
    const f = v.fatturazione || {};
    const fat = v.fattura || {};
    return {
        id: id,
        quando: Number(v.quando) || 0, primaVolta: Number(v.primaVolta) || 0,
        nome: v.nome || '', cognome: v.cognome || '', email: v.email || '',
        telefono: v.telefono || '', studio: v.studio || '', citta: v.citta || '',
        fatturazione: {
            intestatario: f.intestatario || '', partitaIva: f.partitaIva || '', codiceFiscale: f.codiceFiscale || '',
            indirizzo: f.indirizzo || '', cap: f.cap || '', comune: f.comune || '', provincia: f.provincia || '',
            codiceDestinatario: f.codiceDestinatario || '', pec: f.pec || '', emailFatture: f.emailFatture || ''
        },
        totale: Number((v.importi || {}).totale) || 0,
        imponibile: Number((v.importi || {}).imponibile) || 0,
        note: v.note || '',
        mail: !!v.mail, avvisati: !!v.avvisati,
        cambiata: Array.isArray(v.storia) && v.storia.length > 0,
        fattura: {
            emessa: !!fat.emessa,
            numero: fat.numero || '',
            quando: Number(fat.quando) || 0,
            da: fat.da || ''
        }
    };
}

async function elenco(db, quotaId) {
    const q = definizione(quotaId);
    if (!q) return null;
    let snap;
    try {
        snap = await db.collection(COLLEZIONE).where('quota', '==', q.id).limit(1000).get();
    } catch (e) {
        console.error('Elenco aderenti non letto:', String((e && e.message) || e).slice(0, 200));
        return null;
    }
    const righe = [];
    snap.forEach(d => righe.push(rigaElenco(d.id, d.data() || {})));
    righe.sort((a, b) => (a.primaVolta || a.quando) - (b.primaVolta || b.quando));
    const emesse = righe.filter(r => r.fattura.emessa);
    const daEmettere = righe.filter(r => !r.fattura.emessa);
    const somma = rr => Math.round(rr.reduce((t, r) => t + (r.totale || 0), 0) * 100) / 100;
    return {
        quota: Object.assign(perLaPagina(q), { pagina: q.pagina, evento: q.evento }),
        righe: righe,
        conti: {
            iscritti: righe.length,
            fattureEmesse: emesse.length,
            daFatturare: daEmettere.length,
            totale: somma(righe),
            totaleDaFatturare: somma(daEmettere)
        }
    };
}

async function segnaFattura(db, corpo, chi) {
    const c = corpo || {};
    const q = definizione(c.quota);
    if (!q) return { stato: 400, corpo: { ok: false, msg: 'Iscrizione non riconosciuta.' } };
    const id = testo(c.id, 400);
    if (!id) return { stato: 400, corpo: { ok: false, msg: 'Iscrizione non indicata.' } };
    const rif = db.collection(COLLEZIONE).doc(id);
    let prima = null;
    try {
        const sn = await rif.get();
        if (sn.exists) prima = sn.data() || {};
    } catch (_) { prima = null; }
    if (!prima) return { stato: 404, corpo: { ok: false, msg: 'Questa iscrizione non c\'è più: aggiorna l\'elenco.' } };
    // l'identificativo arriva dalla rete: si tocca solo un'iscrizione di questa quota
    if (String(prima.quota || '') !== q.id) return { stato: 400, corpo: { ok: false, msg: 'L\'iscrizione appartiene a un altro evento.' } };

    const fattura = c.emessa === true
        ? { emessa: true, numero: testo(c.numero, 40), quando: Date.now(), da: String(chi || '').slice(0, 200) }
        : { emessa: false, numero: '', quando: Date.now(), da: String(chi || '').slice(0, 200) };
    try { await rif.set({ fattura: fattura }, { merge: true }); }
    catch (e) {
        console.error('Fattura aderente non segnata:', String((e && e.message) || e).slice(0, 200));
        return { stato: 500, corpo: { ok: false, msg: 'Non sono riuscito a salvare: riprova fra poco.' } };
    }
    return { stato: 200, corpo: { ok: true, fattura: fattura } };
}

async function elimina(db, quotaId, ids) {
    const q = definizione(quotaId);
    if (!q) return { tolte: 0 };
    const chiesti = (Array.isArray(ids) ? ids : []).map(x => testo(x, 400)).filter(Boolean).slice(0, 100);
    let tolte = 0;
    for (const id of chiesti) {
        const rif = db.collection(COLLEZIONE).doc(id);
        try {
            const s = await rif.get();
            if (!s.exists || String((s.data() || {}).quota || '') !== q.id) continue;
            await rif.delete();
            tolte++;
        } catch (e) {
            console.error('Iscrizione aderente non tolta:', String((e && e.message) || e).slice(0, 200));
        }
    }
    return { tolte: tolte };
}

async function esegui(ctx) {
    const { db, body, eAdmin, email } = ctx;
    const b = body || {};
    const azione = String(b.azione || 'elenco');
    if (azione === 'elenco') {
        const quali = QUOTE.filter(q => !b.evento || q.evento === String(b.evento));
        const fuori = [];
        for (const q of quali) {
            const e = await elenco(db, q.id);
            fuori.push(e || { quota: Object.assign(perLaPagina(q), { pagina: q.pagina, evento: q.evento }), righe: [], conti: null, errore: true });
        }
        return { stato: 200, corpo: { ok: true, quote: fuori } };
    }
    if (azione === 'fattura') {
        if (!(eAdmin || ctx.ePartner)) return { stato: 403, corpo: { ok: false, msg: 'Non hai il permesso di segnare le fatture.' } };
        return segnaFattura(db, b, email);
    }
    if (azione === 'cancella') {
        if (!eAdmin) return { stato: 403, corpo: { ok: false, msg: 'Solo l\'amministratore può togliere un\'iscrizione.' } };
        const r = await elimina(db, b.quota, b.ids);
        return { stato: 200, corpo: { ok: true, tolte: r.tolte } };
    }
    return { stato: 400, corpo: { ok: false, msg: 'Azione non riconosciuta.' } };
}
function gestisce(body) { return !!(body && String(body.sezione || '') === 'aderenti'); }

module.exports = {
    QUOTE, COLLEZIONE, definizione, perLaPagina, importi, ricevi,
    elenco, segnaFattura, elimina, esegui, gestisce,
    partitaIvaValida, codiceFiscaleValido, indirizzoValido, configurato
};
