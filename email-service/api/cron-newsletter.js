/* ============================================================
   Il lavoro automatico che spedisce le newsletter programmate
   ------------------------------------------------------------
   Lo chiama Vercel a intervalli (vedi vercel.json). A ogni giro:
   guarda se c'e' qualcosa di dovuto, lo spedisce a gruppi finche'
   ha tempo, e scrive man mano a che punto e' arrivato.

   Le tre regole che contano, tutte contro lo stesso incubo -
   mandare la stessa newsletter due volte alle stesse persone.

   1) LUCCHETTO. Prima di toccare una newsletter si prende un
      lucchetto in transazione. Vercel dichiara che una stessa
      esecuzione puo' partire due volte: senza lucchetto due
      istanze spedirebbero in parallelo lo stesso elenco.

   2) UN LOTTO DALL'ESITO IGNOTO NON SI RITENTA. Se la funzione
      muore dopo aver spedito ma prima di aver scritto che l'ha
      fatto, al giro dopo quel lotto risulta "in-corso" da troppo
      tempo. Si conta fra gli incerti e si SALTA. E' una scelta,
      non una svista: una copia in meno e' meglio di una in piu',
      e la stessa scelta e' gia' presa dal browser per l'invio a
      mano.

   3) SI SCRIVE DOPO OGNI LOTTO, non alla fine. Un timeout a
      meta' non deve far ricominciare da capo.

   Il battito su meta/cronNewsletter si scrive sempre, all'inizio e
   alla fine. Serve ad accorgersi che il lavoro NON e' partito:
   Vercel non ritenta le esecuzioni fallite, quindi senza battito
   una newsletter che non parte non la scopre nessuno.
   ============================================================ */

const N = require('../lib/newsletter');
const M = require('../lib/invio-newsletter');
const P = require('../lib/programmate');

const BUDGET_MS = 260 * 1000;         // la funzione ha 300s: si esce con margine
const PAUSA_LOTTI_MS = 2500;          // gentilezza verso Brevo, come fa il browser
const LUCCHETTO_MS = 6 * 60 * 1000;   // piu' della durata massima della funzione
const INCERTO_DOPO_MS = 10 * 60 * 1000;
const MAX_NEWSLETTER = 3;             // per giro: meglio finirne una che iniziarne cinque

const attendi = ms => new Promise(r => setTimeout(r, ms));

/* Prende il lucchetto solo se libero. Restituisce l'identificativo del giro se
   l'ha preso, altrimenti null: chi non lo prende esce subito, senza aspettare. */
async function prendiLucchetto(db, id, giro) {
    let preso = false;
    await db.runTransaction(async (tx) => {
        const s = await tx.get(P.rif(db, id));
        if (!s.exists) return;
        const d = s.data() || {};
        if (!P.eAttiva(d.stato)) return;
        const l = d.lucchetto || null;
        if (l && Number(l.fino) > Date.now()) return;     // qualcun altro ci sta lavorando
        tx.set(P.rif(db, id), {
            lucchetto: { fino: Date.now() + LUCCHETTO_MS, giro: giro },
            stato: 'in-corso',
            avviato: d.avviato || { il: Date.now() }
        }, { merge: true });
        preso = true;
    });
    return preso;
}

async function concludi(db, id, dati, stato, conti, serviti) {
    const ora = Date.now();
    await P.rif(db, id).set({
        stato: stato, concluso: { il: ora }, lucchetto: null,
        conti: conti, serviti: serviti.slice(0, 20000)
    }, { merge: true });
    /* La voce di invio nell'archivio condiviso ha la stessa forma di quelle
       scritte dal browser, cosi' la sezione le mostra senza sapere chi le ha
       create, e "Com'e andato l'invio" funziona anche per i programmati. */
    await P.applicaPatchNewsletter(db, id, {
        stato: stato === 'inviata' ? 'inviata' : 'interrotta',
        programmazione: null,
        voce: {
            il: ora, da: (dati.creato && dati.creato.da) || 'invio programmato',
            n: conti.inviati, saltati: conti.saltati, falliti: conti.falliti,
            dettaglioFalliti: [], interrotto: stato === 'inviata' ? '' : 'invio programmato interrotto',
            incerti: conti.incerti, previsti: dati.previsti || 0,
            nonServiti: Math.max(0, (dati.previsti || 0) - conti.inviati - conti.saltati - conti.falliti - conti.incerti),
            trasporto: conti.trasporto || (N.brevoAttivo() ? 'brevo' : 'smtp'),
            tagInvio: dati.tagInvio || '', iniziato: (dati.avviato && dati.avviato.il) || ora,
            giaAccettati: conti.giaAccettati || 0,
            programmato: true,
            serviti: serviti.slice(0, 20000)
        }
    });
    if (stato === 'inviata') await P.cancellaLotti(db, id);
}

async function lavora(db, id, dati, scadenza, giro) {
    const conti = Object.assign({ inviati: 0, saltati: 0, falliti: 0, giaAccettati: 0, incerti: 0 }, dati.conti || {});
    const serviti = Array.isArray(dati.serviti) ? dati.serviti.slice() : [];
    let interrotto = '';

    const q = await P.rifLotti(db, id).orderBy('n').get();
    for (const doc of q.docs) {
        const l = doc.data() || {};
        if (l.stato === 'fatto' || l.stato === 'saltato') continue;

        // qualcuno ha chiesto di annullare mentre eravamo in mezzo: ci si ferma qui
        const fresco = await P.rif(db, id).get();
        if (fresco.exists && (fresco.data() || {}).annullaRichiesto === true) { interrotto = 'annullato mentre era in corso'; break; }

        if (Date.now() > scadenza) { interrotto = 'tempo esaurito: riprende al prossimo giro'; break; }

        /* Lotto rimasto "in corso" da un giro precedente: NON si ritenta.
           Non si sa se le mail siano partite, e nel dubbio non si spedisce
           due volte alle stesse persone. */
        if (l.stato === 'in-corso' && Number(l.quando) && (Date.now() - Number(l.quando)) > INCERTO_DOPO_MS) {
            conti.incerti += (l.destinatari || []).length;
            await doc.ref.set({ stato: 'saltato', motivo: 'esito ignoto: non ritentato' }, { merge: true });
            await P.rif(db, id).set({ conti: conti }, { merge: true });
            continue;
        }

        await doc.ref.set({ stato: 'in-corso', quando: Date.now() }, { merge: true });
        const r = await M.inviaLotto({
            oggetto: dati.oggetto, html: dati.html, testo: dati.testo,
            destinatari: l.destinatari || [],
            campagna: dati.campagna, invio: dati.tagInvio,
            mittenteNome: dati.mittenteNome,
            scadenza: Math.min(scadenza, Date.now() + 50000)
        });

        if (r.ok) {
            conti.inviati += r.inviati || 0;
            conti.saltati += (r.saltati || []).length;
            conti.falliti += (r.falliti || []).length;
            if (r.giaAccettato) conti.giaAccettati += (r.inviati || 0);
            conti.trasporto = r.trasporto || conti.trasporto;
            const rimasti = new Set((r.rimasti || []).map(x => String((x && x.email) || x).toLowerCase()));
            (l.destinatari || []).forEach(d => { if (!rimasti.has(d.email)) serviti.push(M.improntaEmail(d.email)); });
            if (rimasti.size) {
                // non trattati: restano in attesa, ci riprova il giro dopo
                await doc.ref.set({ stato: 'attesa', destinatari: (l.destinatari || []).filter(d => rimasti.has(d.email)) }, { merge: true });
            } else {
                await doc.ref.set({ stato: 'fatto', quando: Date.now() }, { merge: true });
            }
        } else {
            conti.falliti += (l.destinatari || []).length;
            await doc.ref.set({ stato: 'saltato', motivo: String(r.msg || 'errore').slice(0, 200) }, { merge: true });
            interrotto = String(r.msg || 'errore durante l\'invio').slice(0, 200);
            await P.rif(db, id).set({ conti: conti, ultimoErrore: interrotto }, { merge: true });
            break;
        }

        // si scrive DOPO OGNI LOTTO: un timeout non deve far ricominciare da capo
        await P.rif(db, id).set({ conti: conti, serviti: serviti.slice(0, 20000) }, { merge: true });
        if (Date.now() < scadenza) await attendi(PAUSA_LOTTI_MS);
    }

    // restano lotti da fare?
    const rimanenti = await P.rifLotti(db, id).where('stato', '==', 'attesa').limit(1).get();
    if (rimanenti.empty && !interrotto) {
        await concludi(db, id, dati, 'inviata', conti, serviti);
        return { finita: true, conti: conti };
    }
    const annullata = (await P.rif(db, id).get()).data() || {};
    if (annullata.annullaRichiesto === true) {
        await concludi(db, id, dati, 'interrotta', conti, serviti);
        await P.cancellaLotti(db, id);
        return { finita: true, annullata: true, conti: conti };
    }
    // si lascia in corso e si molla il lucchetto: riprende al giro successivo
    await P.rif(db, id).set({ conti: conti, serviti: serviti.slice(0, 20000), lucchetto: null, ultimoErrore: interrotto }, { merge: true });
    return { finita: false, conti: conti, interrotto: interrotto };
}

module.exports = async (req, res) => {
    // sicurezza: solo il lavoro programmato di Vercel (intestazione con CRON_SECRET)
    const segreto = process.env.CRON_SECRET;
    const auth = req.headers['authorization'] || '';
    if (!segreto || auth !== 'Bearer ' + segreto) { res.status(401).json({ ok: false, msg: 'Non autorizzato' }); return; }

    const partito = Date.now();
    const giro = 'run-' + partito.toString(36);
    try {
        N.initAdmin();
        const db = N.admin.firestore();
        await P.battito(db, { inizio: partito, giro: giro, esito: 'in corso' });

        const scadenza = partito + BUDGET_MS;
        const q = await db.collection(P.COLL).where('quando', '<=', Date.now()).limit(20).get();
        const dovute = q.docs.filter(d => P.eAttiva((d.data() || {}).stato)).slice(0, MAX_NEWSLETTER);

        const fatte = [];
        for (const doc of dovute) {
            if (Date.now() > scadenza) break;
            const id = doc.id;
            const preso = await prendiLucchetto(db, id, giro);
            if (!preso) { fatte.push({ id: id, saltata: 'gia in lavorazione' }); continue; }
            // si rilegge dopo il lucchetto: fra la query e adesso puo' essere cambiato
            const fresco = await P.rif(db, id).get();
            const dati = fresco.data() || {};
            if (!P.eAttiva(dati.stato)) { fatte.push({ id: id, saltata: 'non piu attiva' }); continue; }
            try {
                const r = await lavora(db, id, dati, scadenza, giro);
                fatte.push({ id: id, finita: r.finita, inviati: r.conti.inviati, interrotto: r.interrotto || '' });
            } catch (e) {
                const motivo = String((e && e.message) || e).slice(0, 200);
                console.error('Cron newsletter, invio non riuscito per', id, motivo);
                await P.rif(db, id).set({ lucchetto: null, ultimoErrore: motivo }, { merge: true });
                fatte.push({ id: id, errore: motivo });
            }
        }

        await P.battito(db, {
            fine: Date.now(), giro: giro, esito: 'ok',
            durataMs: Date.now() - partito, trattate: fatte.length, dettaglio: fatte.slice(0, 10)
        });
        res.status(200).json({ ok: true, trattate: fatte.length, dettaglio: fatte });
    } catch (e) {
        const motivo = String((e && e.message) || 'errore').slice(0, 300);
        console.error('Cron newsletter non riuscito:', motivo);
        try { await P.battito(N.admin.firestore(), { fine: Date.now(), giro: giro, esito: 'errore', errore: motivo }); } catch (_) { }
        res.status(500).json({ ok: false, msg: motivo });
    }
};
