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

async function inviaUna(trans, com) {
    const destinatari = Array.from(new Set((com.destinatari || []).map(e => String(e || '').trim().toLowerCase()).filter(e => reEmail.test(e))));
    if (!destinatari.length) throw new Error('nessun destinatario valido');
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const fromName = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.');
    const replyTo = (com.creato && com.creato.da) || fromEmail;
    const html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1E293B;font-size:14px;line-height:1.6;">'
        + esc(com.testo || '').replace(/\n/g, '<br>') + '</div>';
    const msg = { from: '"' + fromName + '" <' + fromEmail + '>', replyTo, subject: com.oggetto || '(senza oggetto)', text: com.testo || '', html };
    if (destinatari.length === 1) msg.to = destinatari[0];
    else { msg.to = replyTo; msg.bcc = destinatari; }
    await trans.sendMail(msg);
    return destinatari.length;
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

        const trans = trasporto();
        const aggiornamenti = {}; // id -> patch
        let inviate = 0;
        for (const com of dovute) {
            try {
                const n = await inviaUna(trans, com);
                inviate++;
                const p = com.programmazione;
                let prossimo = p.prossimoInvio;
                // avanza fino a superare "ora" (recupera eventuali periodi saltati con un solo invio)
                let next = prossimaData(prossimo, p.frequenza);
                const storia = (com.invii || []).concat([{ il: ora, n, da: 'programmato' }]);
                if (next == null) {
                    // frequenza unica: completata
                    aggiornamenti[com.id] = { stato: 'inviata', programmazione: Object.assign({}, p, { attiva: false }), inviata: { da: 'programmato', il: ora, n }, invii: storia };
                } else {
                    while (next <= ora) next = prossimaData(next, p.frequenza);
                    aggiornamenti[com.id] = { programmazione: Object.assign({}, p, { prossimoInvio: next, ultimoInvio: ora }), invii: storia };
                }
            } catch (e) {
                console.error('Comunicazione programmata non inviata (' + (com.id || '?') + '):', e && e.message);
            }
        }

        // scrittura a fusione: rileggo e applico le patch per id, senza sovrascrivere modifiche altrui
        if (Object.keys(aggiornamenti).length) {
            await admin.firestore().runTransaction(async (tx) => {
                const s = await tx.get(rif);
                let arr = [];
                if (s.exists && typeof s.data().json === 'string') { try { arr = JSON.parse(s.data().json) || []; } catch (_) { arr = []; } }
                arr = arr.map(c => (c && aggiornamenti[c.id]) ? Object.assign({}, c, aggiornamenti[c.id]) : c);
                tx.set(rif, { json: JSON.stringify(arr), aggiornato: admin.firestore.FieldValue.serverTimestamp(), da: 'cron' });
            });
        }
        res.status(200).json({ ok: true, inviate });
    } catch (e) {
        console.error('Cron comunicazioni: errore', e);
        res.status(500).json({ ok: false, msg: 'Errore interno' });
    }
};
