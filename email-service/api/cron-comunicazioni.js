/* ============================================================
   Cron: invio delle comunicazioni programmate (Area riservata)
   ------------------------------------------------------------
   Vercel richiama questo endpoint una volta al giorno (vedi vercel.json).
   Legge le comunicazioni in archivio/comunicazioni, invia quelle in stato
   "programmata" la cui data di invio e' arrivata, e aggiorna la programmazione
   (unica -> inviata; ricorrente -> sposta al periodo successivo).

   Protezione: solo Vercel puo' chiamarlo, tramite l'header Authorization con
   il segreto CRON_SECRET (da impostare nelle variabili d'ambiente Vercel).
   Nessuna credenziale nel codice.
   ============================================================ */

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

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
    return String(s == null ? '' : s)
        .replace(/\{nome_completo\}/g, nc).replace(/\{nome\}/g, d.nome || '').replace(/\{cognome\}/g, d.cognome || '')
        .replace(/\{email\}/g, d.email || '').replace(/\{incarichi\}/g, d.incarichi || '');
}
function dividiNomi(testo) { return String(testo || '').split(/[,;]|\s+-\s*|\s*-\s+/).map(t => t.trim()).filter(Boolean); }
// clienti degli incarichi in cui la persona (per cognome) compare come team,
// responsabile incarico o referente (NON come responsabile della qualita)
function incarichiDiCognome(cognome, incarichi) {
    const cg = String(cognome || '').trim().toLowerCase();
    if (!cg) return [];
    const out = [];
    (incarichi || []).forEach(inc => {
        const tok = [];
        [inc.team, inc.respIncarico, inc.referente].forEach(f => { if (f) dividiNomi(String(f)).forEach(t => tok.push(t.trim().toLowerCase())); });
        if (tok.indexOf(cg) >= 0 && inc.cliente) out.push(inc.cliente);
    });
    return Array.from(new Set(out));
}

// Firma con logo Revilaw (uguale a invia-comunicazione e all'anteprima)
const FIRMA = '<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px;border-top:1px solid #E2E8F0;padding-top:16px;"><tr>'
    + '<td style="padding-right:14px;vertical-align:middle;"><img src="https://nextgenerationbusiness.it/zls_zes/img/logo-revilaw.png" alt="Revilaw" height="42" style="height:42px;width:auto;display:block;"></td>'
    + '<td style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;color:#0A2844;font-size:13px;line-height:1.5;">'
    + '<div style="font-size:16px;font-weight:bold;color:#0A2844;">Revilaw <span style="color:#8bb8d4;">S.p.A.</span></div>'
    + '<div style="color:#475569;">Revisione legale &middot; Next Generation Business</div>'
    + '<a href="https://nextgenerationbusiness.it" style="color:#164068;text-decoration:none;">nextgenerationbusiness.it</a>'
    + '</td></tr></table>';

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
    const byEmail = {};
    const add = (email, nome, cognome, inc) => {
        const k = String(email || '').trim().toLowerCase();
        if (!reEmail.test(k) || byEmail[k]) return;
        byEmail[k] = { email: k, nome: nome || '', cognome: cognome || '', incarichi: inc || '' };
    };
    if (g.has('utenti')) (utenti || []).forEach(u => { if (u.email && u.attivo !== false) add(u.email, u.nome || '', '', ''); });
    (persone || []).forEach(p => {
        if (!p || !p.attivo || !p.email) return;
        if ((g.has('qualita') && p.qualita) || (g.has('procuratori') && p.respIncarico) || (g.has('team') && p.team)) {
            const cognome = p.nome || '';
            add(p.email, p.nomeProprio || cognome, cognome, incarichiDiCognome(cognome, incarichi).join(', '));
        }
    });
    const manuali = com.destinatariManuali || (g.size ? [] : (com.destinatari || []));
    manuali.forEach(e => {
        const k = String(e || '').trim().toLowerCase();
        if (!reEmail.test(k) || byEmail[k]) return;
        const pers = (persone || []).find(p => p.email && String(p.email).toLowerCase() === k);
        if (pers) { const cognome = pers.nome || ''; add(k, pers.nomeProprio || cognome, cognome, incarichiDiCognome(cognome, incarichi).join(', ')); return; }
        const inc = (incarichi || []).find(i => [i.email1, i.email2].some(x => x && String(x).toLowerCase() === k));
        add(k, inc ? (inc.cliente || '') : '', '', '');
    });
    return Object.keys(byEmail).map(k => byEmail[k]);
}

async function inviaUna(trans, com, destinatari) {
    const seen = {}, dd = [];
    (destinatari || []).forEach(d => {
        const k = String((d && d.email) || '').trim().toLowerCase();
        if (!reEmail.test(k) || seen[k]) return;
        seen[k] = 1; dd.push(Object.assign({}, d, { email: k }));
    });
    if (!dd.length) throw new Error('nessun destinatario valido');
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const fromName = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.');
    const from = '"' + fromName + '" <' + fromEmail + '>';
    const replyTo = (com.creato && com.creato.da) || fromEmail;
    // periodo di riferimento di QUESTO invio (dalla frequenza + data): sostituisce {periodo}
    const p = com.programmazione || {};
    const periodo = (p.frequenza && p.frequenza !== 'unica') ? etichettaPeriodo(p.frequenza, p.prossimoInvio) : '';
    let oggBase = com.oggetto || '(senza oggetto)';
    if (p.periodoNelOggetto && periodo) oggBase = oggBase + ' - ' + periodo; // retrocompatibilita vecchi record (casella "periodo nell'oggetto")
    oggBase = oggBase.replace(/\{periodo\}/g, periodo);
    let testoBase = (com.testo || '').replace(/\{periodo\}/g, periodo);
    const htmlDi = (txt) => '<div style="font-family:Arial,Helvetica,sans-serif;color:#1E293B;font-size:14px;line-height:1.6;max-width:620px;">' + esc(txt).replace(/\n/g, '<br>') + FIRMA + '</div>';

    // testo/oggetto con variabili -> una mail personalizzata per destinatario; altrimenti BCC
    if (haVariabili(oggBase) || haVariabili(testoBase)) {
        let inviati = 0;
        for (const d of dd) {
            const ogg = applicaVariabili(oggBase, d).trim() || '(senza oggetto)';
            const txt = applicaVariabili(testoBase, d);
            try { await trans.sendMail({ from: from, replyTo: replyTo, to: d.email, subject: ogg, text: txt, html: htmlDi(txt) }); inviati++; }
            catch (e) { console.error('Invio programmato personalizzato a', d.email, 'non riuscito:', e && e.message); }
        }
        if (!inviati) throw new Error('nessuna mail inviata');
        return inviati;
    }
    const emails = dd.map(d => d.email);
    const msg = { from: from, replyTo: replyTo, subject: oggBase, text: testoBase, html: htmlDi(testoBase) };
    if (emails.length === 1) msg.to = emails[0];
    else { msg.to = replyTo; msg.bcc = emails; }
    await trans.sendMail(msg);
    return emails.length;
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

    try {
        initAdmin();
        const rif = admin.firestore().collection('archivio').doc('comunicazioni');
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
        let inviate = 0;
        for (const com of dovute) {
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
                const n = await inviaUna(trans, com, destinatari);
                inviate++;
                const voce = { il: ora, n, da: 'programmato' };
                const patch = (next == null)
                    ? { stato: 'inviata', prog: { attiva: false }, inviata: { da: 'programmato', il: ora, n }, voce } // unica: completata
                    : { prog: avanza(), voce };
                // Persistenza incrementale: registra subito l'avanzamento, cosi un
                // timeout/crash successivo non re-invia le comunicazioni gia spedite.
                await applicaPatch(rif, com.id, patch);
            } catch (e) {
                console.error('Comunicazione programmata non inviata (' + (com.id || '?') + '):', e && e.message);
            }
        }
        res.status(200).json({ ok: true, inviate });
    } catch (e) {
        console.error('Cron comunicazioni: errore', e);
        res.status(500).json({ ok: false, msg: 'Errore interno' });
    }
};
