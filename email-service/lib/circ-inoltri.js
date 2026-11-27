/* ============================================================
   Circolarizzazioni via PEC: le risposte inoltrate a chi ha la
   revisione legale
   ------------------------------------------------------------
   Negli incarichi "per conto di" (lo studio lavora per il collegio
   sindacale, il sindaco unico o un'altra societa' di revisione) chi
   ha la revisione legale vuole le risposte dei terzi anche alla sua
   email. Per questi incarichi l'amministratore indica fino a cinque
   indirizzi (lib/circ-dati.js, impostaCommittente): quando una
   risposta viene abbinata a una lettera, gli si inoltra per posta
   ordinaria, con il testo e gli allegati.

   IN DUE TEMPI, come gli altri avvisi:
     accoda    quando la risposta entra sulla lettera (dal lettore della
               casella, o associata a mano) si scrive una riga in
               circInoltri. La chiave e' lettera + messaggio: la stessa
               risposta non si inoltra due volte;
     spedisci  il giro programmato prende le righe in attesa, va a
               prendere testo e allegati nella casella PEC (nel database
               non ci sono) e spedisce.

   GLI ALLEGATI. Quelli della risposta, decodificati, cosi' come il
   terzo li ha mandati, piu' il messaggio originale (.eml, con la firma
   del gestore) quando ci sta. Il peso di una email ha un tetto
   (CIRC_EMAIL_ALLEGATI_MB, di base 10 MB): se gli allegati pesano di
   piu' le email diventano due o piu'; un file che da solo supera il
   tetto non parte, l'email lo dice e lo studio lo viene a sapere dal
   registro degli errori.

   SE LA CASELLA O LA POSTA NON RISPONDONO si riprova al giro dopo. Dopo
   due ore di tentativi l'inoltro finisce fra gli errori (lo studio lo
   viene a sapere per email), e si continua a provare fino a tre giorni.

   Ogni inoltro fatto resta scritto sulla risposta (a chi, quando, con
   quanti file) e nel registro delle operazioni.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const ERRORI = require('./circ-errori');
const REGISTRO = require('./circ-registro');

const COLL = 'circInoltri';
const INVII = 'circInvii';          // lo stesso nome di DATI.INVII: circ-dati importa questo file
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const ERRORE_DOPO_MS = 2 * 3600 * 1000;
const SMETTI_DOPO_MS = 3 * 24 * 3600 * 1000;
const RIPROVA_MS = 10 * 60 * 1000;
const riga = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
function tettoByte() {
    const n = Number(process.env.CIRC_EMAIL_ALLEGATI_MB);
    return Math.round((Number.isFinite(n) && n >= 1 && n <= 18 ? n : 10) * 1024 * 1024);
}

/* Chi ha la revisione legale di un incarico, e a chi inoltrare: dalle
   impostazioni della sezione (meta/circolarizzazioni). */
async function committenteDi(db, incaricoId) {
    try {
        const s = await db.collection('meta').doc('circolarizzazioni').get();
        const x = (((s.exists ? s.data() : {}) || {}).committenti || {})[String(incaricoId)];
        return x && x.nome ? x : null;
    } catch (_) { return null; }
}

/* Una risposta appena abbinata alla lettera `inv` (scheda di circInvii). `r`:
   la risposta come la scrive il lettore ({ chiave, uid, uidValidity, casella,
   quando, da, oggetto, certificata, automatica, allegati, dimensione }). Non
   lancia mai: un inoltro mancato non deve far fallire la lettura della
   casella. Torna true se l'ha messa in coda. */
async function accoda(db, inv, idInvio, r) {
    try {
        if (!inv || !r || r.automatica || !Number(r.uid)) return false;
        const com = await committenteDi(db, inv.incaricoId);
        const a = ((com && com.inoltro) || []).map(x => String(x || '').toLowerCase()).filter(x => EMAIL_RE.test(x));
        if (!a.length) return false;
        const id = crypto.createHash('sha1').update(String(idInvio) + '~' + String(r.chiave)).digest('hex').slice(0, 28);
        const rif = db.collection(COLL).doc(id);
        // gia' in coda, o gia' inoltrata: la stessa risposta non parte due volte
        if ((await rif.get()).exists) return false;
        await rif.set({
            stato: 'attesa', a: a, committente: riga(com.nome, 160),
            incaricoId: riga(inv.incaricoId, 120), cliente: riga(inv.cliente, 200), invio: String(idInvio),
            destinatario: riga(inv.destinatario, 200), pec: riga(inv.pec, 200), codice: riga(inv.codice, 20), categoria: riga(inv.categoria, 40),
            bilancio: riga(inv.bilancio, 10),
            preparataDa: riga((inv.creato || {}).da, 200).toLowerCase(), preparataDaNome: riga((inv.creato || {}).nome, 120),
            msg: Object.assign({ chiave: riga(r.chiave, 80), uid: Number(r.uid), uidValidity: riga(r.uidValidity, 40), dimensione: Number(r.dimensione) || 0 },
                /^pec[2-9]$/.test(String(r.casella || '')) ? { casella: String(r.casella) } : {}),
            quando: Number(r.quando) || Date.now(), da: riga(r.da, 200), oggetto: riga(r.oggetto, 250), certificata: !!r.certificata,
            allegati: (r.allegati || []).map(x => riga(x && x.nome, 120)).filter(Boolean).slice(0, 20),
            messo: Date.now(), prossimo: Date.now(), tentativi: 0
        });
        return true;
    } catch (x) {
        console.error('Circolarizzazioni, inoltro non accodato:', String((x && x.message) || x).slice(0, 200));
        return false;
    }
}

/* ---------- l'email ---------- */
function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function quando(ms) {
    return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}
function dataBreve(g) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(g || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
function peso(n) { const mb = n / (1024 * 1024); return mb >= 1 ? (Math.round(mb * 10) / 10).toString().replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' kB'; }
const P = 'margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0A2844;text-align:justify;';
const TD = 'padding:7px 10px;border-bottom:1px solid #E2E8F0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#1E293B;vertical-align:top;text-align:left;';
const TH = TD + 'color:#475569;width:34%;';
/* `v`: la riga di circInoltri; `testo`: il testo della risposta; `file`: gli
   allegati di QUESTA email; `mancanti`: quelli che non partono; `parte`,
   `parti`: quale email e' delle N in cui la risposta e' divisa. */
function messaggio(v, testo, file, mancanti, parte, parti) {
    const su = parti > 1 ? ' (' + parte + ' di ' + parti + ')' : '';
    const righe = [
        ['Società sottoposta a revisione', v.cliente + (v.bilancio ? ' (bilancio al ' + dataBreve(v.bilancio) + ')' : '')],
        ['Destinatario della richiesta', v.destinatario + (v.pec ? ' (' + v.pec + ')' : '')],
        ['Riferimento della lettera', v.codice],
        ['Risposta ricevuta il', quando(v.quando) + (v.certificata ? ' a mezzo PEC' : ' (posta ordinaria)')],
        ['Da', v.da || 'mittente non indicato'],
        ['Oggetto', v.oggetto || '(senza oggetto)']
    ];
    const elenco = f => f.map(x => esc(x.filename) + ' <span style="color:#64748B;">(' + esc(peso(x.content.length)) + ')</span>').join('<br>');
    const diMancanti = mancanti.length ? '<p style="' + P + 'color:#8F1D15;">' + (mancanti.length === 1 ? 'Un allegato non è compreso in questa email' : mancanti.length + ' allegati non sono compresi in queste email')
        + ' perché troppo pesant' + (mancanti.length === 1 ? 'e' : 'i') + ' per la posta: ' + esc(mancanti.map(x => x.nome).join(', ')) + '. Ve lo faremo avere a parte.</p>' : '';
    const html = '<p style="' + P + '">Buongiorno,</p>'
        + '<p style="' + P + '">' + (parte > 1
            ? 'segue la risposta alla richiesta di conferma esterna indicata qui sotto: in questa email gli altri allegati.'
            : 'Vi inoltriamo la risposta alla richiesta di conferma esterna inviata a mezzo PEC per conto di <strong>' + esc(v.committente) + '</strong>, arrivata nella casella da cui è partita la richiesta.') + '</p>'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-top:2px solid #0A2844;">'
        + righe.map(([a, b]) => '<tr><td style="' + TH + '">' + esc(a) + '</td><td style="' + TD + '"><strong>' + esc(b) + '</strong></td></tr>').join('')
        + '</table>'
        + (parte === 1 && testo ? '<p style="' + P + 'margin-bottom:6px;"><strong>Il testo della risposta</strong></p>'
            + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr><td width="3" style="width:3px;background-color:#8bb8d4;font-size:0;">&nbsp;</td>'
            + '<td style="padding:4px 0 4px 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1E293B;">' + esc(testo).replace(/\n/g, '<br>') + '</td></tr></table>' : '')
        + (file.length ? '<p style="' + P + '"><strong>In allegato' + su + ':</strong><br>' + elenco(file) + '</p>' : '')
        + (file.some(x => /\.eml$/i.test(x.filename)) ? '<p style="' + P + 'font-size:13px;color:#475569;">Il file .eml è il messaggio così come è arrivato nella casella PEC, con la firma del gestore: si apre con il programma di posta.</p>' : '')
        + diMancanti
        + '<p style="' + P + '">Cordiali saluti,<br>Revilaw S.p.A.</p>';
    const testoSemplice = 'Buongiorno,\n\n' + (parte > 1 ? 'segue la risposta alla richiesta di conferma esterna indicata qui sotto: in questa email gli altri allegati.'
        : 'Vi inoltriamo la risposta alla richiesta di conferma esterna inviata a mezzo PEC per conto di ' + v.committente + ', arrivata nella casella da cui è partita la richiesta.') + '\n\n'
        + righe.map(([a, b]) => a + ': ' + b).join('\n')
        + (parte === 1 && testo ? '\n\nIl testo della risposta:\n' + testo : '')
        + (file.length ? '\n\nIn allegato' + su + ':\n' + file.map(x => '- ' + x.filename + ' (' + peso(x.content.length) + ')').join('\n') : '')
        + (mancanti.length ? '\n\nNon compresi perché troppo pesanti per la posta: ' + mancanti.map(x => x.nome).join(', ') + '. Ve li faremo avere a parte.' : '')
        + '\n\nCordiali saluti,\nRevilaw S.p.A.';
    return {
        oggetto: 'Circolarizzazione ' + v.cliente + ': risposta di ' + v.destinatario + ' (rif. ' + v.codice + ')' + su,
        html: html, testo: testoSemplice
    };
}
/* Gli allegati divisi in email: ognuna con al massimo `tetto` byte. */
function gruppi(file, tetto) {
    const out = [];
    let g = [], peso0 = 0;
    for (const f of file) {
        if (g.length && peso0 + f.content.length > tetto) { out.push(g); g = []; peso0 = 0; }
        g.push(f); peso0 += f.content.length;
    }
    if (g.length || !out.length) out.push(g);
    return out;
}

/* Scrive sulla risposta della lettera che e' stata inoltrata (a chi, quando,
   con quanti file e quali no). */
async function segnaSullaLettera(db, v, fatto) {
    const rif = db.collection(INVII).doc(String(v.invio));
    try {
        await db.runTransaction(async tx => {
            const s = await tx.get(rif);
            if (!s.exists) return;
            const inv = s.data() || {};
            const risposte = Array.isArray(inv.risposte) ? inv.risposte.slice() : [];
            const i = risposte.findIndex(x => x && x.chiave === (v.msg || {}).chiave);
            if (i < 0) return;
            risposte[i] = Object.assign({}, risposte[i], { inoltrata: fatto });
            inv.risposte = risposte;
            tx.set(rif, inv);
        });
    } catch (_) { /* resta il registro */ }
}

/* Spedisce gli inoltri in attesa. `opz`: { casella: un cassetto() di
   lib/circ-avvisi.js gia' aperto da chi chiama, scadenza (ms) }. */
async function spedisci(db, opz) {
    opz = opz || {};
    let docs;
    try { docs = (await db.collection(COLL).where('stato', '==', 'attesa').get()).docs; } catch (_) { return { ok: false, inoltrate: 0 }; }
    const ora = Date.now();
    const dovuti = docs.map(s => Object.assign({ id: s.id }, s.data() || {})).filter(v => (Number(v.prossimo) || 0) <= ora)
        .sort((x, y) => (x.messo - y.messo) || (x.id < y.id ? -1 : 1));
    if (!dovuti.length) return { ok: true, inoltrate: 0 };
    if (!ERRORI.postaConfigurata()) return { ok: false, inoltrate: 0, msg: 'posta non configurata' };
    const tetto = tettoByte();
    let inoltrate = 0, rimandate = 0, email = 0;
    for (const v of dovuti) {
        if (opz.scadenza && Date.now() > opz.scadenza) break;
        const rif = db.collection(COLL).doc(v.id);
        const riprova = async motivo => {
            rimandate++;
            const vecchio = Date.now() - (Number(v.messo) || Date.now());
            const campi = { tentativi: (Number(v.tentativi) || 0) + 1, prossimo: Date.now() + RIPROVA_MS, motivo: riga(motivo, 200) };
            if (vecchio > SMETTI_DOPO_MS) campi.stato = 'abbandonato';
            try { await rif.set(campi, { merge: true }); } catch (_) { /* si riprova */ }
            if (vecchio > ERRORE_DOPO_MS) {
                try {
                    await ERRORI.segna(db, {
                        chiave: 'inoltro~' + v.id, tipo: 'servizio', titolo: campi.stato === 'abbandonato' ? 'Risposta non inoltrata a chi ha la revisione legale' : 'Una risposta non si riesce a inoltrare a chi ha la revisione legale',
                        incaricoId: v.incaricoId, cliente: v.cliente, invio: v.invio, destinatario: v.destinatario, pec: v.pec, codice: v.codice,
                        dettaglio: 'Risposta di ' + (v.da || '?') + ' per ' + v.destinatario + ' (' + v.codice + '), da inoltrare a ' + (v.a || []).join(', ') + ': ' + motivo + (campi.stato === 'abbandonato' ? '. Dopo tre giorni di tentativi il servizio ha smesso: va inoltrata a mano.' : '. Il servizio continua a riprovare.')
                    });
                } catch (_) { /* gia' nei log */ }
            }
        };
        if (!opz.casella) { await riprova('casella non aperta'); continue; }
        const c = await opz.casella.contenuto(v.msg, tetto * 3);
        if (!c || !c.ok) {
            // il messaggio non c'e' piu' nella casella: inoltrare non si puo'
            if (c && c.perche === 'assente') { await riprova('il messaggio non è più nella casella PEC'); continue; }
            await riprova('la casella PEC non risponde'); continue;
        }
        // il messaggio originale, con la firma del gestore, se ci sta in una email
        const tutti = c.file.slice();
        const mancanti = (c.mancanti || []).slice();
        const sorg = await opz.casella.prendi(v.msg, tetto);
        const pesoFile = tutti.reduce((t, f) => t + f.content.length, 0);
        if (sorg && sorg.ok && pesoFile + sorg.dati.length <= tetto) tutti.push({ filename: 'Messaggio originale ' + riga(v.codice, 20) + '.eml', content: sorg.dati, contentType: 'message/rfc822' });
        // un file che da solo supera il tetto non parte
        const partono = tutti.filter(f => f.content.length <= tetto);
        tutti.filter(f => f.content.length > tetto).forEach(f => mancanti.push({ nome: f.filename, motivo: 'peso' }));
        const lotti = gruppi(partono, tetto);
        const pesanti = mancanti.filter(x => x.motivo === 'peso');
        let partite = 0, errore = '';
        for (let i = 0; i < lotti.length; i++) {
            const m = messaggio(v, c.testo || '', lotti[i], i === 0 ? pesanti : [], i + 1, lotti.length);
            const esito = await ERRORI.mandaConEsito((v.a || []).join(', '), m.oggetto, m.html, m.testo, 'inoltro', lotti[i], { replyTo: v.preparataDa || undefined });
            if (!esito.ok) { errore = esito.errore || 'posta non partita'; break; }
            partite++; email++;
        }
        if (!partite) { await riprova('la posta non è partita (' + errore + ')'); continue; }
        // partita (anche solo in parte: le email gia' spedite non si rimandano)
        const fatto = {
            a: v.a, il: Date.now(), file: partono.length - (partite < lotti.length ? lotti.slice(partite).reduce((t, g) => t + g.length, 0) : 0),
            email: partite, mancanti: pesanti.map(x => x.nome).slice(0, 20)
        };
        try { await rif.set({ stato: partite < lotti.length ? 'parziale' : 'inoltrata', fatto: fatto, msgFatto: errore }, { merge: true }); } catch (_) { /* al massimo riparte */ }
        await segnaSullaLettera(db, v, fatto);
        inoltrate++;
        try {
            await REGISTRO.scrivi(db, null, {
                azione: 'risposta-inoltrata', incaricoId: v.incaricoId, cliente: v.cliente, ambito: '', invio: v.invio, codice: v.codice, destinatario: v.destinatario, pec: v.pec,
                dettaglio: 'Risposta di ' + (v.da || 'mittente non indicato') + ' del ' + quando(v.quando) + ' inoltrata per email a ' + (v.a || []).join(', ') + ' (' + v.committente + '), '
                    + (fatto.file ? fatto.file + (fatto.file === 1 ? ' file allegato' : ' file allegati') : 'senza allegati') + (fatto.email > 1 ? ' in ' + fatto.email + ' email' : '') + '.'
                    + (pesanti.length ? ' Non allegati perché troppo pesanti: ' + pesanti.map(x => x.nome).join(', ') + '.' : '')
                    + (partite < lotti.length ? ' Le altre email non sono partite: ' + errore + '.' : '')
            });
        } catch (_) { /* il registro e' un di piu' */ }
        if (pesanti.length || partite < lotti.length) {
            try {
                await ERRORI.segna(db, {
                    chiave: 'inoltro-parziale~' + v.id, tipo: 'servizio', gravita: 'avviso', titolo: 'Risposta inoltrata senza qualche allegato',
                    incaricoId: v.incaricoId, cliente: v.cliente, invio: v.invio, destinatario: v.destinatario, pec: v.pec, codice: v.codice,
                    dettaglio: 'Inoltrata a ' + (v.a || []).join(', ') + ' la risposta di ' + v.destinatario + ' (' + v.codice + '), ma senza: ' + pesanti.map(x => x.nome).concat(partite < lotti.length ? ['una parte degli allegati (' + errore + ')'] : []).join(', ') + '. Vanno mandati a parte, dall\'area riservata.'
                });
            } catch (_) { /* gia' nei log */ }
        }
    }
    return { ok: true, inoltrate: inoltrate, rimandate: rimandate, email: email };
}

module.exports = { COLL, accoda, spedisci, committenteDi, _interni: { messaggio, gruppi, tettoByte } };
