/* ============================================================
   Riepilogo serale delle iscrizioni agli organizzatori
   ------------------------------------------------------------
   Lavoro programmato (vercel.json). I cron di Vercel contano in UTC
   e mezzanotte a Milano e' alle 23 UTC d'inverno e alle 22 d'estate:
   il lavoro gira a TUTTE E DUE le ore e fa qualcosa solo quando a
   Milano e' mezzanotte. Riepiloga il giorno appena finito.

   Per ogni evento di lib/iscrizione-verificata.js (oggi Milano 2027):
   una mail ai destinatari di lib/riepilogo-iscrizioni.js con le
   iscrizioni confermate nel giorno (email confermata), chi e' ancora in
   attesa di confermare e il totale. Se non c'e' niente, niente mail.

   UNA VOLTA SOLA PER GIORNO: prima di spedire si scrive il giorno sul
   documento meta/riepilogoIscrizioni-<evento> (in una transazione),
   cosi' un secondo giro - un riavvio, una chiamata a mano - non
   rispedisce.

   Chiamata a mano (per provare o recuperare un giorno): con il segreto
   CRON_SECRET e ?giorno=aaaa-mm-gg; &forza=1 rispedisce anche se quel
   giorno risulta gia' mandato.
   ============================================================ */

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const R = require('../lib/riepilogo-iscrizioni');
const MNGB = require('../lib/mail-ngb');

const BASE = String(process.env.APP_BASE_URL || 'https://nextgenerationbusiness.it').replace(/\/+$/, '');
const LINK_AREA = BASE + '/area-riservata/#eventi';

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
function mittente() {
    const ind = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const nome = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
    return '"' + nome + '" <' + ind + '>';
}

// segna il giorno come spedito; false se lo era gia'
async function prenota(db, ev, giorno, forza) {
    const rif = db.collection('meta').doc('riepilogoIscrizioni-' + ev.chiave);
    return db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const d = s.exists ? (s.data() || {}) : {};
        if (!forza && d.ultimoGiorno === giorno) return false;
        tx.set(rif, { ultimoGiorno: giorno, quando: Date.now() }, { merge: true });
        return true;
    });
}

module.exports = async (req, res) => {
    const segreto = String(process.env.CRON_SECRET || '').trim();
    const auth = String((req.headers || {})['authorization'] || '');
    if (!segreto || auth !== 'Bearer ' + segreto) { res.status(401).json({ ok: false, msg: 'Non autorizzato' }); return; }

    const q = req.query || {};
    const ora = Date.now();
    const chiesto = /^\d{4}-\d{2}-\d{2}$/.test(String(q.giorno || '')) ? String(q.giorno) : '';
    // il giro automatico lavora solo a mezzanotte di Milano (vedi in cima)
    if (!chiesto && R.oraRoma(ora) !== 0) { res.status(200).json({ ok: true, saltato: 'non e\' mezzanotte a Milano' }); return; }
    const giorno = chiesto || R.giornoPrima(R.giornoRoma(ora));
    const forza = String(q.forza || '') === '1';

    try {
        initAdmin();
        const db = admin.firestore();
        const snap = await db.collection('iscrizioni').get();
        const schede = [];
        snap.forEach(d => schede.push({ id: d.id, dati: d.data() || {} }));
        const esiti = [];
        for (const ev of R.EVENTI) {
            const c = R.conti(schede, ev, giorno);
            if (!R.daSpedire(c)) { esiti.push({ evento: ev.chiave, nuove: 0, inAttesa: 0 }); continue; }
            if (!await prenota(db, ev, giorno, forza)) { esiti.push({ evento: ev.chiave, nuove: c.nuove.length, gia: true }); continue; }
            const m = MNGB.riepilogoIscrizioni(c, LINK_AREA, R.giornoLeggibile(giorno));
            const a = R.destinatari();
            try {
                await trasporto().sendMail({ from: mittente(), to: a.join(', '), subject: m.oggetto, text: m.testo, html: m.html });
                esiti.push({ evento: ev.chiave, nuove: c.nuove.length, inAttesa: c.inAttesa.length, totale: c.totale, inviata: a.length });
            } catch (e) {
                // la mail non e' partita: si libera il giorno, cosi' un nuovo giro (o una chiamata a mano) ci riprova
                try { await db.collection('meta').doc('riepilogoIscrizioni-' + ev.chiave).set({ ultimoGiorno: null }, { merge: true }); } catch (_) { }
                console.error('Riepilogo iscrizioni non inviato:', String((e && e.message) || e).slice(0, 200));
                esiti.push({ evento: ev.chiave, nuove: c.nuove.length, errore: true });
            }
        }
        res.status(200).json({ ok: true, giorno: giorno, esiti: esiti });
    } catch (e) {
        console.error('Riepilogo iscrizioni:', String((e && e.message) || e).slice(0, 200));
        res.status(500).json({ ok: false });
    }
};
