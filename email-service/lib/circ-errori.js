/* ============================================================
   Circolarizzazioni via PEC: il registro degli errori
   ------------------------------------------------------------
   Tutto quello che va storto finisce qui, in un posto solo, e
   chi amministra viene avvisato per email:

     recapito   la PEC non e' stata accettata o consegnata
     invio      la lettera non e' partita (rifiuto del server per
                quel destinatario, PDF non piu' leggibile, troppi
                tentativi)
     server     il server PEC ha sospeso gli invii (tetto, blocco,
                password)
     casella    la casella non si legge (password rifiutata,
                collegamento caduto piu' volte, messaggio illeggibile)
     servizio   un errore imprevisto del servizio

   UNA RIGA PER PROBLEMA, non una per volta che si ripresenta: ogni
   errore ha una chiave (la lettera e il passo, oppure "casella",
   "server"...) e se torna mentre la riga e' aperta si aggiorna il
   conteggio e la data, senza un'altra email. Chi amministra spunta
   la riga quando ha risolto; se lo stesso problema si ripresenta
   DOPO la spunta, la riga si riapre e l'avviso riparte.

   L'EMAIL parte dal giro programmato (ogni cinque minuti), una
   sola per tutti gli errori nuovi: cinquanta lettere non consegnate
   non devono diventare cinquanta messaggi. Usa la posta ordinaria
   dello studio (SMTP_*), non la casella PEC.

   segna() non lancia mai: un registro che fa fallire l'operazione
   che sta registrando sarebbe peggio del problema.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { avvolgi, senzaTrattiniLunghi } = require('./mail-layout');

const ERR = 'circErrori';
const PROPRIETARIO = 'a.missori@emvas.tax';
const TIPI = { recapito: 'Recapito', invio: 'Invio', server: 'Server PEC', casella: 'Casella PEC', servizio: 'Servizio' };
const PASSI = { primo: 'invio', sollecito1: 'primo sollecito', sollecito2: 'secondo sollecito' };
const MAX_PER_EMAIL = 40;

const riga = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
function idDa(chiave) { return crypto.createHash('sha1').update(String(chiave)).digest('hex').slice(0, 28); }

/* Annota un errore. `e`: { chiave, tipo, gravita ('errore' | 'avviso'),
   titolo, dettaglio, e - quando riguarda una lettera - incaricoId, cliente,
   invio, destinatario, pec, codice, passo }. */
async function segna(db, e) {
    try {
        const chiave = riga(e.chiave, 300);
        if (!chiave) return null;
        const rif = db.collection(ERR).doc(idDa(chiave));
        const ora = Date.now();
        const campi = {
            chiave: chiave, tipo: TIPI[e.tipo] ? e.tipo : 'servizio', gravita: e.gravita === 'avviso' ? 'avviso' : 'errore',
            titolo: riga(e.titolo, 200), dettaglio: riga(e.dettaglio, 600),
            incaricoId: riga(e.incaricoId, 120), cliente: riga(e.cliente, 200), invio: riga(e.invio, 120),
            destinatario: riga(e.destinatario, 200), pec: riga(e.pec, 200), codice: riga(e.codice, 20), passo: PASSI[e.passo] ? e.passo : ''
        };
        return await db.runTransaction(async tx => {
            const s = await tx.get(rif);
            const v = s.exists ? (s.data() || {}) : null;
            if (!v) { tx.set(rif, Object.assign(campi, { stato: 'aperto', primo: ora, ultimo: ora, volte: 1, avvisato: null, risolto: null })); return 'nuovo'; }
            const agg = Object.assign({}, v, campi, { ultimo: ora, volte: (Number(v.volte) || 1) + 1 });
            // si ripresenta dopo essere stato spuntato: si riapre, e l'avviso riparte
            if (v.stato === 'risolto') Object.assign(agg, { stato: 'aperto', riaperto: ora, avvisato: null });
            tx.set(rif, agg);
            return v.stato === 'risolto' ? 'riaperto' : 'ripetuto';
        });
    } catch (x) {
        console.error('Circolarizzazioni, errore non annotato:', riga(e && e.titolo, 120), '-', String((x && x.message) || x).slice(0, 200));
        return null;
    }
}
/* L'errore di una lettera: i dati per ritrovarla vengono dalla scheda. */
function diLettera(db, inv, id, passo, e) {
    return segna(db, Object.assign({
        incaricoId: inv.incaricoId, cliente: inv.cliente, invio: id, destinatario: inv.destinatario, pec: inv.pec, codice: inv.codice, passo: passo
    }, e));
}

function conId(s) { return Object.assign({ id: s.id }, s.data() || {}); }
async function aperti(db) {
    const q = await db.collection(ERR).where('stato', '==', 'aperto').get();
    return q.docs.map(conId).sort((a, b) => (b.ultimo || 0) - (a.ultimo || 0));
}
async function elenco(db) {
    const r = await db.collection(ERR).where('stato', '==', 'risolto').get();
    return {
        aperti: await aperti(db),
        risolti: r.docs.map(conId).sort((a, b) => (((b.risolto || {}).il) || 0) - (((a.risolto || {}).il) || 0)).slice(0, 200)
    };
}
async function conta(db) {
    try { return (await db.collection(ERR).where('stato', '==', 'aperto').get()).docs.length; } catch (_) { return 0; }
}
async function risolvi(db, ids, nota, prof) {
    let fatti = 0;
    for (const id of (Array.isArray(ids) ? ids : [ids]).slice(0, 200)) {
        const rif = db.collection(ERR).doc(String(id || ''));
        const ok = await db.runTransaction(async tx => {
            const s = await tx.get(rif);
            if (!s.exists || (s.data() || {}).stato !== 'aperto') return false;
            tx.set(rif, { stato: 'risolto', risolto: { il: Date.now(), da: prof.firma, nota: riga(nota, 300) } }, { merge: true });
            return true;
        });
        if (ok) fatti++;
    }
    return { ok: true, risolti: fatti };
}
async function riapri(db, id) {
    const rif = db.collection(ERR).doc(String(id || ''));
    const s = await rif.get();
    if (!s.exists) return { ok: false, stato: 404, msg: 'Errore non trovato.' };
    if ((s.data() || {}).stato === 'aperto') return { ok: true };
    // lo si riapre a mano: l'avviso e' gia' partito a suo tempo, non serve un'altra email
    await rif.set({ stato: 'aperto', risolto: null, riaperto: Date.now() }, { merge: true });
    return { ok: true };
}
/* Con i dati di un incarico se ne vanno anche i suoi errori. */
async function dimenticaIncarico(db, incaricoId) {
    try {
        const q = await db.collection(ERR).where('incaricoId', '==', String(incaricoId)).get();
        for (const s of q.docs) await db.collection(ERR).doc(s.id).delete();
    } catch (_) { /* restano righe che non portano piu' da nessuna parte: si spuntano a mano */ }
}

/* ---------- l'avviso per email ---------- */
function postaConfigurata() {
    return !!(String(process.env.SMTP_HOST || '').trim() && String(process.env.SMTP_USER || '').trim() && String(process.env.SMTP_PASS || ''));
}
function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function quando(ms) {
    return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}
function dove(e) {
    // il passo si dice solo per i solleciti: "invio" accanto a una lettera non aggiunge niente
    const parti = [e.cliente, e.destinatario && (e.destinatario + (e.pec ? ' (' + e.pec + ')' : '')), e.codice, e.passo && e.passo !== 'primo' && PASSI[e.passo]].filter(Boolean);
    return parti.join(' · ');
}
async function destinatari(db) {
    let imp = {};
    try { const s = await db.collection('meta').doc('circolarizzazioni').get(); imp = s.exists ? (s.data() || {}) : {}; } catch (_) { imp = {}; }
    const lista = [PROPRIETARIO];
    if (imp.avvisaSupervisori && Array.isArray(imp.supervisori)) imp.supervisori.forEach(x => { const m = String(x || '').toLowerCase(); if (m && lista.indexOf(m) < 0) lista.push(m); });
    return { lista: lista, supervisori: !!imp.avvisaSupervisori };
}
function messaggio(nuovi, totaleAperti) {
    const n = nuovi.length;
    const P = 'margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0A2844;';
    const TD = 'padding:8px 10px;border-bottom:1px solid #E2E8F0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#1E293B;vertical-align:top;text-align:left;';
    const base = String(process.env.APP_BASE_URL || 'https://nextgenerationbusiness.it').replace(/\/+$/, '');
    const mostrati = nuovi.slice(0, MAX_PER_EMAIL);
    const righe = mostrati.map(e => '<tr>'
        + '<td style="' + TD + 'white-space:nowrap;">' + esc(quando(e.ultimo || e.primo)) + '</td>'
        + '<td style="' + TD + 'white-space:nowrap;"><strong>' + esc(TIPI[e.tipo] || e.tipo) + '</strong>' + (e.gravita === 'avviso' ? '<br><span style="color:#8A5A00;">da tenere d\'occhio</span>' : '') + '</td>'
        + '<td style="' + TD + '"><strong>' + esc(e.titolo) + '</strong>' + (dove(e) ? '<br>' + esc(dove(e)) : '') + (e.dettaglio ? '<br><span style="color:#475569;">' + esc(e.dettaglio) + '</span>' : '')
        + (e.riaperto && e.volte > 1 ? '<br><span style="color:#8F1D15;">Si è ripresentato dopo essere stato segnato come risolto.</span>' : '') + '</td></tr>').join('');
    const html = '<p style="' + P + '">' + (n === 1 ? 'Nelle circolarizzazioni via PEC c\'è <strong>un errore nuovo</strong> da controllare.' : 'Nelle circolarizzazioni via PEC ci sono <strong>' + n + ' errori nuovi</strong> da controllare.') + '</p>'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-top:2px solid #0A2844;">' + righe + '</table>'
        + (n > mostrati.length ? '<p style="' + P + 'font-size:13px;color:#475569;">E altri ' + (n - mostrati.length) + ': l\'elenco completo è nell\'area riservata.</p>' : '')
        + '<p style="' + P + '">Li trovi tutti nell\'area riservata, in <strong>Strumenti di revisione, Circolarizzazioni via PEC, scheda «Errori»</strong>' + (totaleAperti > n ? ' (in tutto ' + totaleAperti + ' aperti)' : '') + ': quando un errore è risolto, spuntalo.</p>'
        + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr><td style="background:#164068;border-radius:6px;">'
        + '<a href="' + esc(base + '/area-riservata/') + '" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Apri l\'area riservata</a></td></tr></table>'
        + '<p style="' + P + 'font-size:13px;color:#475569;">Ricevi questo messaggio perché amministri le circolarizzazioni. Per lo stesso errore non arriva un secondo avviso finché resta aperto.</p>';
    const testo = (n === 1 ? 'Nelle circolarizzazioni via PEC c\'è un errore nuovo da controllare.' : 'Nelle circolarizzazioni via PEC ci sono ' + n + ' errori nuovi da controllare.') + '\n\n'
        + mostrati.map(e => '- ' + quando(e.ultimo || e.primo) + ' | ' + (TIPI[e.tipo] || e.tipo) + ' | ' + e.titolo + (dove(e) ? ' | ' + dove(e) : '') + (e.dettaglio ? '\n  ' + e.dettaglio : '')).join('\n')
        + '\n\nLi trovi nell\'area riservata: Strumenti di revisione, Circolarizzazioni via PEC, scheda "Errori". Quando un errore è risolto, spuntalo.\n' + base + '/area-riservata/';
    return {
        oggetto: 'Circolarizzazioni PEC: ' + (n === 1 ? nuovi[0].titolo : n + ' errori da controllare'),
        html: avvolgi(senzaTrattiniLunghi(html)), testo: senzaTrattiniLunghi(testo)
    };
}
/* Manda UNA email con gli errori aperti non ancora avvisati, e li segna come
   avvisati solo se e' partita: altrimenti ci riprova il giro dopo. */
async function avvisa(db) {
    let tutti;
    try { tutti = await aperti(db); } catch (_) { return { ok: false, avvisati: 0 }; }
    const nuovi = tutti.filter(e => !e.avvisato).sort((a, b) => (a.primo || 0) - (b.primo || 0));
    if (!nuovi.length) return { ok: true, avvisati: 0 };
    if (!postaConfigurata()) return { ok: false, avvisati: 0, msg: 'posta non configurata' };
    const d = await destinatari(db);
    const m = messaggio(nuovi, tutti.length);
    try {
        const porta = Number(process.env.SMTP_PORT) || 465;
        const posta = nodemailer.createTransport({
            host: process.env.SMTP_HOST, port: porta, secure: porta === 465,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000
        });
        await posta.sendMail({
            from: '"' + String(process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n"]/g, ' ') + '" <' + (process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER) + '>',
            to: d.lista.join(', '), subject: m.oggetto.replace(/[\r\n]/g, ' ').slice(0, 200), text: m.testo, html: m.html
        });
    } catch (x) {
        console.error('Circolarizzazioni, avviso degli errori non partito:', String((x && x.message) || x).slice(0, 200));
        return { ok: false, avvisati: 0, msg: 'email non partita' };
    }
    const ora = Date.now();
    for (const e of nuovi) { try { await db.collection(ERR).doc(e.id).set({ avvisato: ora }, { merge: true }); } catch (_) { /* al massimo arriva due volte */ } }
    return { ok: true, avvisati: nuovi.length, a: d.lista };
}

module.exports = { ERR, TIPI, segna, diLettera, aperti, elenco, conta, risolvi, riapri, dimenticaIncarico, avvisa, destinatari, postaConfigurata, _interni: { messaggio, idDa } };
