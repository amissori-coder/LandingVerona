/* ============================================================
   Programmare (o annullare) l'invio di una newsletter
   ------------------------------------------------------------
   Qui NON si spedisce niente: si mette in coda. A spedire ci pensa
   api/cron-newsletter.js, che a ogni giro guarda se e' arrivato il
   momento di qualcosa.

   Due scelte che vanno spiegate, perche' sono le uniche cose che
   l'utente puo' trovare sorprendenti.

   1) IL CONTENUTO SI CONGELA. Quello che partira' e' l'HTML che
      l'area riservata ha costruito e mostrato al momento della
      programmazione. Se la newsletter viene modificata dopo, la
      modifica NON entra: si annulla e si riprogramma. E' l'unica
      semantica onesta, perche' altrimenti partirebbe una cosa che
      nessuno ha riletto.

   2) I DESTINATARI SI CONGELANO, i disiscritti no. L'elenco e'
      quello di quando si e' premuto il pulsante: chi si iscrive nel
      frattempo non la riceve. Ma chi si DISISCRIVE viene tolto fino
      all'ultimo istante, perche' quel controllo lo rifa' il motore
      di invio sul server al momento di spedire. Le due cose non
      sono in contraddizione: la prima e' una scelta editoriale, la
      seconda e' un obbligo.
   ============================================================ */

const N = require('../lib/newsletter');
const M = require('../lib/invio-newsletter');
const P = require('../lib/programmate');

const GIORNO_MS = 24 * 60 * 60 * 1000;
const ORIZZONTE_GIORNI = 60;     // oltre, la fotografia del contenuto invecchia troppo
const MAX_DESTINATARI = 20000;

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito' }); return; }

    try {
        N.initAdmin();
        const db = N.admin.firestore();
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const aut = await N.autorizza(body.idToken);
        if (!aut.ok) { res.status(aut.stato).json({ ok: false, msg: aut.msg }); return; }

        const azione = String(body.azione || 'stato');
        const id = String(body.campagna || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);

        /* --- stato: cosa c'e' in coda --- */
        if (azione === 'stato') {
            const ids = Array.isArray(body.campagne) ? body.campagne.slice(0, 50) : (id ? [id] : []);
            const fuori = {};
            for (const c of ids) {
                const k = String(c).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
                if (!k) continue;
                const s = await P.rif(db, k).get();
                if (!s.exists) continue;
                const d = s.data() || {};
                // niente indirizzi nella risposta: solo stato e numeri
                fuori[k] = {
                    stato: d.stato || '', quando: d.quando || 0, quandoTesto: d.quandoTesto || '',
                    previsti: d.previsti || 0, lotti: d.lotti || 0,
                    creato: d.creato || null, annullato: d.annullato || null,
                    avviato: d.avviato || null, concluso: d.concluso || null,
                    conti: d.conti || null, ultimoErrore: d.ultimoErrore || ''
                };
            }
            const b = await P.leggiBattito(db);
            res.status(200).json({ ok: true, programmate: fuori, cron: b || null, passo: process.env.NEWSLETTER_PASSO_CRON || 'giornaliero' });
            return;
        }

        if (!id) { res.status(400).json({ ok: false, msg: 'Newsletter non indicata.' }); return; }

        /* --- annulla --- */
        if (azione === 'annulla') {
            let esito = null;
            await db.runTransaction(async (tx) => {
                const s = await tx.get(P.rif(db, id));
                if (!s.exists) { esito = { ok: false, msg: 'Questa newsletter non risulta programmata.' }; return; }
                const d = s.data() || {};
                if (!P.eAttiva(d.stato)) { esito = { ok: false, msg: 'Questa programmazione non e piu attiva (stato: ' + (d.stato || 'ignoto') + ').' }; return; }
                /* Se l'invio e' gia' partito non si puo' richiamare quello che e'
                   uscito: si ferma il gruppo SUCCESSIVO. Va detto con parole
                   diverse, altrimenti chi annulla crede di aver fermato tutto. */
                const inCorso = d.stato === 'in-corso';
                tx.set(P.rif(db, id), {
                    annullaRichiesto: true,
                    stato: inCorso ? 'in-corso' : 'annullata',
                    annullato: { da: aut.email, il: Date.now() }
                }, { merge: true });
                esito = {
                    ok: true, inCorso: inCorso,
                    msg: inCorso
                        ? 'Invio gia in corso: i gruppi non ancora partiti non partiranno, ma le mail gia uscite non si possono richiamare.'
                        : 'Programmazione annullata: non partira niente.'
                };
            });
            if (!esito.ok) { res.status(409).json(esito); return; }
            if (!esito.inCorso) {
                await P.cancellaLotti(db, id);
                await P.applicaPatchNewsletter(db, id, { stato: 'bozza', programmazione: null });
            }
            res.status(200).json(esito);
            return;
        }

        /* --- programma --- */
        if (azione !== 'programma') { res.status(400).json({ ok: false, msg: 'Azione non riconosciuta.' }); return; }

        const quando = Number(body.quando) || 0;
        const quandoTesto = String(body.quandoTesto || '').slice(0, 40);
        const ora = Date.now();
        if (!quando || quando < ora + 60000) {
            res.status(400).json({ ok: false, msg: 'La data deve essere nel futuro.' });
            return;
        }
        if (quando > ora + ORIZZONTE_GIORNI * GIORNO_MS) {
            res.status(400).json({ ok: false, msg: 'Non si puo programmare oltre ' + ORIZZONTE_GIORNI + ' giorni: il testo invecchierebbe.' });
            return;
        }

        const destinatari = M.normalizzaDestinatari(body.destinatari);
        if (!destinatari.length) { res.status(400).json({ ok: false, msg: 'Nessun destinatario valido.' }); return; }
        if (destinatari.length > MAX_DESTINATARI) { res.status(400).json({ ok: false, msg: 'Troppi destinatari (massimo ' + MAX_DESTINATARI + ').' }); return; }

        /* Il controllo sul collegamento di disiscrizione si fa ADESSO, non solo al
           momento di spedire: scoprire alle sette di mattina del giorno scelto che
           la mail non poteva partire e' il modo peggiore di scoprirlo. Il motore
           lo rifara' comunque prima di ogni lotto. */
        const html = String(body.html || '');
        if (!html || html.indexOf(M.SEGNAPOSTO) < 0) {
            res.status(400).json({ ok: false, msg: 'La newsletter non contiene il collegamento per disiscriversi: non puo essere programmata.' });
            return;
        }
        if (!N.brevoAttivo() && destinatari.length > 200) {
            res.status(400).json({
                ok: false,
                msg: 'Senza Brevo si spedisce una mail per volta: un invio programmato a ' + destinatari.length
                    + ' destinatari non starebbe nei tempi. Configura Brevo, oppure invia a mano.'
            });
            return;
        }

        const perLotto = M.maxLotto();
        const lotti = [];
        for (let i = 0; i < destinatari.length; i += perLotto) lotti.push(destinatari.slice(i, i + perLotto));

        // una sola programmazione attiva per newsletter: lo garantisce la transazione
        let conflitto = null;
        await db.runTransaction(async (tx) => {
            const s = await tx.get(P.rif(db, id));
            if (s.exists && P.eAttiva((s.data() || {}).stato)) {
                conflitto = (s.data() || {}).quandoTesto || '';
                return;
            }
            tx.set(P.rif(db, id), {
                campagna: id,
                tagInvio: String(body.invio || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) || ('inv-' + Date.now().toString(36)),
                stato: 'programmata',
                quando: quando, quandoTesto: quandoTesto,
                oggetto: String(body.oggetto || '').slice(0, 300),
                html: html,
                testo: String(body.testo || ''),
                mittenteNome: String(body.mittenteNome || '').slice(0, 80),
                previsti: destinatari.length, lotti: lotti.length,
                creato: { da: aut.email, il: ora },
                annullaRichiesto: false,
                lucchetto: null, avviato: null, concluso: null, ultimoErrore: '',
                conti: { inviati: 0, saltati: 0, falliti: 0, giaAccettati: 0, incerti: 0 },
                serviti: []
            });
        });
        if (conflitto !== null) {
            res.status(409).json({ ok: false, msg: 'Questa newsletter e gia programmata' + (conflitto ? ' per ' + conflitto : '') + '. Annulla la programmazione prima di rifarla.' });
            return;
        }

        // i lotti, con gli indirizzi: solo qui, e cancellati a fine corsa
        let batch = db.batch(), n = 0;
        for (let i = 0; i < lotti.length; i++) {
            batch.set(P.rifLotti(db, id).doc(P.nomeLotto(i + 1)), {
                n: i + 1, stato: 'attesa', destinatari: lotti[i], quando: 0
            });
            n++;
            if (n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
        }
        if (n) await batch.commit();

        await P.applicaPatchNewsletter(db, id, {
            stato: 'programmata',
            programmazione: {
                quando: quando, quandoTesto: quandoTesto,
                previsti: destinatari.length, da: aut.email, il: ora
            }
        });

        res.status(200).json({
            ok: true, previsti: destinatari.length, lotti: lotti.length,
            quando: quando, quandoTesto: quandoTesto,
            passo: process.env.NEWSLETTER_PASSO_CRON || 'giornaliero'
        });
    } catch (e) {
        const motivo = String((e && e.message) || 'errore').slice(0, 200);
        console.error('Programmazione newsletter non riuscita:', motivo);
        res.status(500).json({ ok: false, msg: motivo });
    }
};
