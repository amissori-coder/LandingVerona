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
   PER GLI ADERENTI NON SI PERDE UN GIORNO. Questa mail e' l'unico avviso di
   un'iscrizione da fatturare, e il lavoro gira davvero una volta sola per
   notte: se una notte la posta non risponde, la notte dopo la mail copre
   anche il giorno rimasto indietro (fino a una settimana), perche' sul
   documento meta l'ultimo giorno si segna SOLO DOPO che la mail e' partita
   (apriAderenti / chiudiAderenti): una funzione interrotta a meta' - una
   posta che non risponde oltre il tempo massimo di Vercel - lascia il
   giorno da spedire. E un errore nella parte delle aziende non ferma
   quella degli aderenti.

   UNA VOLTA SOLA PER GIORNO: prima di spedire si scrive il giorno sul
   documento meta/riepilogoIscrizioni-<evento> (per gli aderenti
   meta/riepilogoAderenti-<quota>), in una transazione,
   cosi' un secondo giro - un riavvio, una chiamata a mano - non
   rispedisce.

   Chiamata a mano (per provare o recuperare un giorno): con il segreto
   CRON_SECRET e ?giorno=aaaa-mm-gg; &forza=1 rispedisce anche se quel
   giorno risulta gia' mandato. Con il giorno di oggi (o uno futuro) e'
   un'ANTEPRIMA: la mail parte con "Anteprima:" nell'oggetto e il giorno
   non si segna, cosi' a mezzanotte la mail vera parte lo stesso, con chi
   si iscrive dopo la prova.
   ============================================================ */

const crypto = require('crypto');
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
/* Tempi massimi sotto il minuto di Vercel (vercel.json): con quelli di
   nodemailer (due minuti per collegarsi, dieci di silenzio) una posta che
   non risponde farebbe chiudere la funzione prima dell'errore. */
function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 10000, greetingTimeout: 8000, socketTimeout: 15000
    });
}
function mittente() {
    const ind = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const nome = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
    return '"' + nome + '" <' + ind + '>';
}

/* Gli aderenti: quali giorni coprire, da `dal` a `giorno`. Sul documento
   meta c'e' `ultimoGiorno`, l'ultimo giorno spedito DAVVERO: si copre dal
   giorno dopo (al massimo una settimana indietro). Il giorno si segna in
   due tempi:
     apriAderenti   prima di spedire scrive solo `inCorso` (giorno e ora):
                    un secondo giro della stessa notte - una chiamata a mano
                    mentre il lavoro sta spedendo - lo trova e non rispedisce;
     chiudiAderenti dopo che la mail e' partita sposta `ultimoGiorno` in
                    avanti (mai indietro) e toglie `inCorso`.
   Se la posta non risponde, o la funzione si interrompe a meta',
   `ultimoGiorno` resta quello di prima e la notte dopo recupera. Un
   `inCorso` di piu' di dieci minuti e' un giro morto e non ferma nessuno.
   L'`inCorso` vale per QUALUNQUE giorno: una chiamata a mano per un altro
   giorno mentre il lavoro spedisce manderebbe le stesse persone due volte;
   cosi' aspetta (e il giorno del lavoro, se resta indietro, lo recupera la
   notte dopo). Ogni giro lo toglie solo se e' ancora il suo (`id`).
   Senza `ultimoGiorno` (la prima notte, o se la prima e' fallita prima di
   scrivere qualcosa) si parte da `inizio`, il giorno da cui il riepilogo
   ha preso il posto degli avvisi (QUOTE[].riepilogoDal), sempre entro la
   settimana; senza nemmeno quello, dal giorno stesso. E la prima notte si
   segna subito il giorno PRIMA del periodo, cosi' una mail che non parte
   la notte dopo si recupera da li'.
   Con forza: un giorno gia' coperto si rispedisce da solo; uno non ancora
   coperto si copre come di solito, dal giorno dopo l'ultimo spedito, cosi'
   forza aggiunge e non salta mai. null: gia' spedito (o in corso). */
const MAX_GIORNI_RECUPERO = 7;
const IN_CORSO_MS = 10 * 60 * 1000;
async function apriAderenti(db, nome, giorno, forza, inizio) {
    const rif = db.collection('meta').doc(nome);
    const id = crypto.randomBytes(6).toString('hex');
    return db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const d = s.exists ? (s.data() || {}) : {};
        const prima = String(d.ultimoGiorno || '');
        const ic = d.inCorso || null;
        if (ic && Date.now() - (Number(ic.da) || 0) < IN_CORSO_MS) return null;
        let dal;
        const limite = R.giorniPrima(giorno, MAX_GIORNI_RECUPERO - 1);
        if (prima && prima >= giorno) {
            if (!forza) return null;
            dal = giorno;
        } else if (prima) {
            dal = R.giornoDopo(prima) > limite ? R.giornoDopo(prima) : limite;
        } else {
            dal = inizio && inizio < giorno ? (inizio > limite ? inizio : limite) : giorno;
        }
        const patch = { inCorso: { giorno: giorno, da: Date.now(), id: id } };
        if (!prima) patch.ultimoGiorno = R.giornoPrima(dal);
        tx.set(rif, patch, { merge: true });
        return { dal: dal, id: id };
    });
}
async function chiudiAderenti(db, nome, giorno, spedita, id) {
    const rif = db.collection('meta').doc(nome);
    return db.runTransaction(async tx => {
        const s = await tx.get(rif);
        const d = s.exists ? (s.data() || {}) : {};
        const prima = String(d.ultimoGiorno || '');
        const patch = {};
        // l'"in corso" si toglie solo se e' ancora quello di questo giro
        if (d.inCorso && d.inCorso.id === id) patch.inCorso = null;
        if (spedita) Object.assign(patch, { ultimoGiorno: prima > giorno ? prima : giorno, quando: Date.now() });
        if (Object.keys(patch).length) tx.set(rif, patch, { merge: true });
    });
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
    // un giorno non ancora finito si guarda, non si segna come spedito (vedi in cima)
    const anteprima = !!chiesto && chiesto >= R.giornoRoma(ora);
    const conAnteprima = m => anteprima ? Object.assign({}, m, { oggetto: 'Anteprima: ' + m.oggetto }) : m;

    try {
        initAdmin();
        const db = admin.firestore();
        /* Una mail: si spedisce, e se la posta non risponde `annulla` rimette
           il documento meta com'era, cosi' un nuovo giro (o una chiamata a
           mano) ci riprova. */
        const spedisci = async (nome, m, annulla) => {
            const a = R.destinatari();
            try {
                await trasporto().sendMail({ from: mittente(), to: a.join(', '), subject: m.oggetto, text: m.testo, html: m.html });
                return a.length;
            } catch (e) {
                if (annulla) { try { await annulla(); } catch (_) { } }
                console.error('Riepilogo ' + nome + ' non inviato:', String((e && e.message) || e).slice(0, 200));
                return 0;
            }
        };
        const esiti = [];
        /* Le tre letture, ognuna per conto suo: un guasto in una non ferma le
           altre mail. Gli aderenti e le presenze servono anche ai due totali
           (aziende, aziende + aderenti) che stanno in TUTTE E DUE le mail;
           se uno dei due manca le mail partono come prima, senza i totali. */
        let schede = null;
        try {
            const snap = await db.collection('iscrizioni').get();
            schede = [];
            snap.forEach(d => schede.push({ id: d.id, dati: d.data() || {} }));
        } catch (e) {
            console.error('Riepilogo iscrizioni, iscrizioni non lette:', String((e && e.message) || e).slice(0, 200));
        }
        let aderenti = null;
        try {
            const snapA = await db.collection(R.COLLEZIONE_ADERENTI).get();
            aderenti = [];
            snapA.forEach(d => aderenti.push({ id: d.id, dati: d.data() || {} }));
        } catch (e) {
            console.error('Riepilogo aderenti, iscrizioni non lette:', String((e && e.message) || e).slice(0, 200));
        }
        // le presenze dicono chi chi organizza ha messo fra gli aderenti (e chi era gia' in sala)
        let presenze = null;
        try {
            const snapP = await db.collection('presenze').get();
            presenze = new Map();
            snapP.forEach(d => presenze.set(d.id, d.data() || {}));
        } catch (e) {
            console.error('Riepilogo iscrizioni, presenze non lette (niente totali con gli aderenti):', String((e && e.message) || e).slice(0, 200));
        }
        const totaliDi = ev => {
            if (!ev || !schede || !aderenti || !presenze) return null;
            try { return R.totali(schede, presenze, ev, aderenti); }
            catch (e) { console.error('Riepilogo, totali non calcolati:', String((e && e.message) || e).slice(0, 200)); return null; }
        };
        // le aziende: se qualcosa si rompe qui, gli aderenti partono lo stesso
        try {
            if (!schede) throw new Error('iscrizioni non lette');
            for (const ev of R.EVENTI) {
                const c = R.conti(schede, ev, giorno);
                const nome = 'riepilogoIscrizioni-' + ev.chiave;
                if (!R.daSpedire(c)) { esiti.push({ evento: ev.chiave, nuove: 0, inAttesa: 0 }); continue; }
                if (!anteprima && !await prenota(db, nome, giorno, forza)) { esiti.push({ evento: ev.chiave, nuove: c.nuove.length, gia: true }); continue; }
                const inviata = await spedisci(nome, conAnteprima(MNGB.riepilogoIscrizioni(c, LINK_AREA, R.giornoLeggibile(giorno), totaliDi(ev))),
                    anteprima ? null : () => db.collection('meta').doc(nome).set({ ultimoGiorno: null }, { merge: true }));
                esiti.push(inviata
                    ? { evento: ev.chiave, nuove: c.nuove.length, inAttesa: c.inAttesa.length, totale: c.totale, inviata: inviata }
                    : { evento: ev.chiave, nuove: c.nuove.length, errore: true });
            }
        } catch (e) {
            console.error('Riepilogo iscrizioni (aziende):', String((e && e.message) || e).slice(0, 200));
            esiti.push({ evento: '', errore: true });
        }
        /* Gli aderenti: un'altra collezione, letta qui sopra. Se non si e'
           letta, il riepilogo delle aziende e' gia' partito e resta valido; il
           giorno resta da spedire, e lo recupera la notte dopo. */
        for (const q of R.QUOTE_ADERENTI) {
            const evQ = R.EVENTI.find(e => e.chiave === q.evento) || null;
            if (!aderenti) { esiti.push({ quota: q.id, errore: true }); continue; }
            const nome = 'riepilogoAderenti-' + q.id;
            let aperto = null;
            try {
                if (anteprima) {
                    const c = R.contiAderenti(aderenti, q, giorno);
                    if (!R.daSpedireAderenti(c)) { esiti.push({ quota: q.id, nuove: 0, aggiornate: 0, anteprima: true }); continue; }
                    const inviata = await spedisci(nome, conAnteprima(MNGB.riepilogoAderenti(c, LINK_AREA, R.giornoLeggibile(giorno), null, totaliDi(evQ))), null);
                    esiti.push({ quota: q.id, nuove: c.nuove.length, aggiornate: c.aggiornate.length, anteprima: true, inviata: inviata, errore: !inviata || undefined });
                    continue;
                }
                const p = await apriAderenti(db, nome, giorno, forza, q.riepilogoDal);
                if (!p) { esiti.push({ quota: q.id, gia: true }); continue; }
                aperto = p.id;
                const c = R.contiAderenti(aderenti, q, giorno, p.dal);
                // niente di nuovo: il periodo e' coperto lo stesso, e domani si riparte da li'
                if (!R.daSpedireAderenti(c)) {
                    await chiudiAderenti(db, nome, giorno, true, p.id);
                    aperto = null;
                    esiti.push({ quota: q.id, nuove: 0, aggiornate: 0, dal: c.dal });
                    continue;
                }
                const inviata = await spedisci(nome, MNGB.riepilogoAderenti(c, LINK_AREA, R.giornoLeggibile(giorno), R.giornoLeggibile(c.dal), totaliDi(evQ)), null);
                // il giorno si segna solo se la mail e' partita; se no resta da spedire
                await chiudiAderenti(db, nome, giorno, !!inviata, p.id);
                aperto = null;
                esiti.push(inviata
                    ? { quota: q.id, dal: c.dal, nuove: c.nuove.length, aggiornate: c.aggiornate.length, totale: c.totale, inviata: inviata }
                    : { quota: q.id, dal: c.dal, nuove: c.nuove.length, errore: true });
            } catch (e) {
                // il giorno non e' stato segnato: si toglie solo l'"in corso", e la notte dopo recupera
                if (aperto) { try { await chiudiAderenti(db, nome, giorno, false, aperto); } catch (_) { } }
                console.error('Riepilogo aderenti:', String((e && e.message) || e).slice(0, 200));
                esiti.push({ quota: q.id, errore: true });
            }
        }
        res.status(200).json({ ok: true, giorno: giorno, anteprima: anteprima || undefined, esiti: esiti });
    } catch (e) {
        console.error('Riepilogo iscrizioni:', String((e && e.message) || e).slice(0, 200));
        res.status(500).json({ ok: false });
    }
};
