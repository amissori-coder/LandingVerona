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

   Per ogni quota degli aderenti (lib/iscrizioni-aderenti.js, la cena e il
   meeting di Milano): una mail a parte, agli stessi destinatari, con le
   iscrizioni arrivate nel giorno e i dati per la fattura, quelle corrette
   e i totali. Gli aderenti non confermano l'email, e a ogni iscrizione non
   parte piu' nessun avviso: e' questo riepilogo a dirlo. Anche qui, se non
   c'e' niente di nuovo, niente mail.

   UNA VOLTA SOLA PER GIORNO: prima di spedire si scrive il giorno sul
   documento meta/riepilogoIscrizioni-<evento> (per gli aderenti
   meta/riepilogoAderenti-<quota>), in una transazione,
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

// segna il giorno come spedito sul documento `nome` di meta; false se lo era gia'
async function prenota(db, nome, giorno, forza) {
    const rif = db.collection('meta').doc(nome);
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
        /* Una mail: si prenota il giorno, si spedisce, e se la posta non
           risponde si libera il giorno, cosi' un nuovo giro (o una chiamata a
           mano) ci riprova. */
        const spedisci = async (nome, m) => {
            const a = R.destinatari();
            try {
                await trasporto().sendMail({ from: mittente(), to: a.join(', '), subject: m.oggetto, text: m.testo, html: m.html });
                return a.length;
            } catch (e) {
                try { await db.collection('meta').doc(nome).set({ ultimoGiorno: null }, { merge: true }); } catch (_) { }
                console.error('Riepilogo ' + nome + ' non inviato:', String((e && e.message) || e).slice(0, 200));
                return 0;
            }
        };
        const esiti = [];
        for (const ev of R.EVENTI) {
            const c = R.conti(schede, ev, giorno);
            const nome = 'riepilogoIscrizioni-' + ev.chiave;
            if (!R.daSpedire(c)) { esiti.push({ evento: ev.chiave, nuove: 0, inAttesa: 0 }); continue; }
            if (!await prenota(db, nome, giorno, forza)) { esiti.push({ evento: ev.chiave, nuove: c.nuove.length, gia: true }); continue; }
            const inviata = await spedisci(nome, MNGB.riepilogoIscrizioni(c, LINK_AREA, R.giornoLeggibile(giorno)));
            esiti.push(inviata
                ? { evento: ev.chiave, nuove: c.nuove.length, inAttesa: c.inAttesa.length, totale: c.totale, inviata: inviata }
                : { evento: ev.chiave, nuove: c.nuove.length, errore: true });
        }
        /* Gli aderenti: un'altra collezione, e una lettura sua. Se non riesce,
           il riepilogo delle aziende e' gia' partito e resta valido. */
        let aderenti = null;
        try {
            const snapA = await db.collection(R.COLLEZIONE_ADERENTI).get();
            aderenti = [];
            snapA.forEach(d => aderenti.push({ id: d.id, dati: d.data() || {} }));
        } catch (e) {
            console.error('Riepilogo aderenti, iscrizioni non lette:', String((e && e.message) || e).slice(0, 200));
        }
        for (const q of R.QUOTE_ADERENTI) {
            if (!aderenti) { esiti.push({ quota: q.id, errore: true }); continue; }
            const c = R.contiAderenti(aderenti, q, giorno);
            const nome = 'riepilogoAderenti-' + q.id;
            if (!R.daSpedireAderenti(c)) { esiti.push({ quota: q.id, nuove: 0, aggiornate: 0 }); continue; }
            if (!await prenota(db, nome, giorno, forza)) { esiti.push({ quota: q.id, nuove: c.nuove.length, gia: true }); continue; }
            const inviata = await spedisci(nome, MNGB.riepilogoAderenti(c, LINK_AREA, R.giornoLeggibile(giorno)));
            esiti.push(inviata
                ? { quota: q.id, nuove: c.nuove.length, aggiornate: c.aggiornate.length, totale: c.totale, inviata: inviata }
                : { quota: q.id, nuove: c.nuove.length, errore: true });
        }
        res.status(200).json({ ok: true, giorno: giorno, esiti: esiti });
    } catch (e) {
        console.error('Riepilogo iscrizioni:', String((e && e.message) || e).slice(0, 200));
        res.status(500).json({ ok: false });
    }
};
