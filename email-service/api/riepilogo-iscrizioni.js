/* ============================================================
   Riepilogo serale delle iscrizioni agli organizzatori
   ------------------------------------------------------------
   Lavoro programmato (vercel.json). I cron di Vercel contano in UTC
   e mezzanotte a Milano e' alle 23 UTC d'inverno e alle 22 d'estate:
   il lavoro gira a TUTTE E DUE le ore e fa qualcosa solo quando a
   Milano e' mezzanotte. Riepiloga il giorno appena finito.

   Per ogni evento di lib/iscrizione-verificata.js (oggi Milano 2027):
   UNA mail ai destinatari di lib/riepilogo-iscrizioni.js, con insieme
     - le AZIENDE: le iscrizioni confermate nel giorno (email confermata)
       e chi e' ancora in attesa di confermare;
     - gli ADERENTI di ogni quota dell'evento (lib/iscrizioni-aderenti.js,
       la cena e il meeting di Milano): le iscrizioni arrivate nel giorno
       con i dati per la fattura, e quelle corrette. Gli aderenti non
       confermano l'email, e a ogni iscrizione non parte piu' nessun
       avviso: e' questo riepilogo a dirlo;
     - i due totali dell'evento (aziende, e aziende + aderenti).
   La mail parte se almeno una delle due parti ha qualcosa di nuovo; se
   non c'e' niente, niente mail. Fino a ottobre 2026 erano due mail.
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
        // le righe tolte dall'elenco dall'area riservata: fuori anche dai totali
        let cancellate = null;
        try {
            const snapC = await db.collection('iscrizioniCancellate').get();
            cancellate = new Set();
            snapC.forEach(d => { const v = d.data() || {}; if (v.evento && v.idIscritto) cancellate.add(v.evento + '~' + v.idIscritto); });
        } catch (e) {
            console.error('Riepilogo iscrizioni, cancellate non lette (niente totali con gli aderenti):', String((e && e.message) || e).slice(0, 200));
        }
        const totaliDi = ev => {
            if (!ev || !schede || !aderenti || !presenze || !cancellate) return null;
            try { return R.totali(schede, presenze, ev, aderenti, cancellate); }
            catch (e) { console.error('Riepilogo, totali non calcolati:', String((e && e.message) || e).slice(0, 200)); return null; }
        };
        /* UNA MAIL PER EVENTO, con le aziende e gli aderenti insieme
           (MNGB.riepilogoSerale). Ogni parte tiene il suo modo di non
           spedire due volte e di non perdere niente:
             AZIENDE   il giorno si prenota (prenota) solo se c'e' qualcosa da
                       dire, e se la mail non parte si rimette com'era;
             ADERENTI  il periodo si apre (apriAderenti) e si chiude
                       (chiudiAderenti) DOPO che la mail e' partita: se non
                       parte, la notte dopo copre anche i giorni rimasti
                       indietro.
           La mail parte se almeno una delle due parti ha qualcosa di nuovo;
           l'altra c'e' lo stesso, con i suoi numeri. Se una lettura fallisce
           la mail parte con l'altra parte e una riga che lo dice: un errore
           sulle aziende non ferma le fatture degli aderenti, e viceversa. */
        const senzaListe = c => Object.assign({}, c, { nuove: [], inAttesa: [] });
        const senzaPersone = c => Object.assign({}, c, { nuove: [], aggiornate: [] });
        for (const ev of R.EVENTI) {
            const esito = { evento: ev.chiave };
            esiti.push(esito);
            const nomeAz = 'riepilogoIscrizioni-' + ev.chiave;
            let azPrenotata = false;
            const aperti = [];
            try {
                // LE AZIENDE
                let az = null, azNota = '';
                if (!schede) {
                    azNota = 'Le iscrizioni delle aziende non si sono potute leggere stanotte: le trovi nell\'area riservata.';
                    esito.aziende = { errore: true };
                } else {
                    const c = R.conti(schede, ev, giorno, presenze);
                    esito.aziende = { nuove: c.nuove.length, inAttesa: c.inAttesa.length, totale: c.totale };
                    if (!R.daSpedire(c)) az = c;
                    else if (anteprima) az = c;
                    else if (await prenota(db, nomeAz, giorno, forza)) { az = c; azPrenotata = true; }
                    else {
                        az = senzaListe(c);
                        azNota = 'Le iscrizioni delle aziende di questo giorno sono già state mandate.';
                        esito.aziende.gia = true;
                    }
                }
                // GLI ADERENTI, quota per quota
                const ad = [];
                let adNota = '';
                esito.aderenti = [];
                for (const q of R.QUOTE_ADERENTI.filter(x => x.evento === ev.chiave)) {
                    if (!aderenti) {
                        adNota = 'Le iscrizioni degli aderenti non si sono potute leggere stanotte: arrivano nel riepilogo di domani, con i giorni rimasti indietro.';
                        esito.aderenti.push({ quota: q.id, errore: true });
                        continue;
                    }
                    if (anteprima) {
                        const c = R.contiAderenti(aderenti, q, giorno);
                        ad.push({ c: c, dalTesto: null, nuovo: R.daSpedireAderenti(c) });
                        esito.aderenti.push({ quota: q.id, nuove: c.nuove.length, aggiornate: c.aggiornate.length, anteprima: true });
                        continue;
                    }
                    const p = await apriAderenti(db, 'riepilogoAderenti-' + q.id, giorno, forza, q.riepilogoDal);
                    if (!p) {
                        // gia' spedito, o un altro giro in corso: nella mail solo i numeri, senza le persone
                        ad.push({ c: senzaPersone(R.contiAderenti(aderenti, q, giorno)), dalTesto: null, nuovo: false });
                        adNota = 'Le iscrizioni degli aderenti di questo periodo sono già state mandate.';
                        esito.aderenti.push({ quota: q.id, gia: true });
                        continue;
                    }
                    aperti.push({ nome: 'riepilogoAderenti-' + q.id, id: p.id });
                    const c = R.contiAderenti(aderenti, q, giorno, p.dal);
                    ad.push({ c: c, dalTesto: R.giornoLeggibile(c.dal), nuovo: R.daSpedireAderenti(c) });
                    esito.aderenti.push({ quota: q.id, dal: c.dal, nuove: c.nuove.length, aggiornate: c.aggiornate.length, totale: c.totale });
                }
                const daDire = (!!az && R.daSpedire(az)) || ad.some(x => x.nuovo);
                if (!daDire) {
                    // niente di nuovo: il periodo degli aderenti e' coperto lo stesso, e domani si riparte da li'
                    for (const x of aperti) await chiudiAderenti(db, x.nome, giorno, true, x.id);
                    aperti.length = 0;
                    esito.vuota = true;
                    continue;
                }
                const m = MNGB.riepilogoSerale({
                    giornoTesto: R.giornoLeggibile(giorno), ev: ev, az: az, azNota: azNota,
                    ad: ad.map(x => ({ c: x.c, dalTesto: x.dalTesto })), adNota: adNota, t: totaliDi(ev)
                }, LINK_AREA);
                const inviata = await spedisci(nomeAz, conAnteprima(m),
                    azPrenotata ? () => db.collection('meta').doc(nomeAz).set({ ultimoGiorno: null }, { merge: true }) : null);
                // il periodo degli aderenti si segna solo se la mail e' partita; se no resta da spedire
                for (const x of aperti) await chiudiAderenti(db, x.nome, giorno, !!inviata, x.id);
                aperti.length = 0;
                if (inviata) esito.inviata = inviata;
                else esito.errore = true;
                if (anteprima) esito.anteprima = true;
            } catch (e) {
                // niente si segna come spedito: si tolgono gli "in corso", e la notte dopo recupera
                for (const x of aperti) { try { await chiudiAderenti(db, x.nome, giorno, false, x.id); } catch (_) { } }
                if (azPrenotata) { try { await db.collection('meta').doc(nomeAz).set({ ultimoGiorno: null }, { merge: true }); } catch (_) { } }
                console.error('Riepilogo iscrizioni (' + ev.chiave + '):', String((e && e.message) || e).slice(0, 200));
                esito.errore = true;
            }
        }
        res.status(200).json({ ok: true, giorno: giorno, anteprima: anteprima || undefined, esiti: esiti });
    } catch (e) {
        console.error('Riepilogo iscrizioni:', String((e && e.message) || e).slice(0, 200));
        res.status(500).json({ ok: false });
    }
};
