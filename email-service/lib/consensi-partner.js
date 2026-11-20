/* ============================================================
   IL CONSENSO PARTNER, CHIESTO A CHI SI E' GIA' ISCRITTO
   ------------------------------------------------------------
   Il modulo di Milano ha una casella in piu', facoltativa: la
   comunicazione dei dati ai Partner dell'evento. Chi si e' iscritto
   prima non l'ha vista. Qui c'e' tutto quello che serve a
   chiederglielo dopo:

     invia   (da api/presenze.js, azione "consenso-partner-invia")
             manda la mail agli iscritti indicati dall'area riservata.
             Il testo arriva composto (formato NGB) con due segnaposti:
             {{NOME}} e {{CONSENSI}}, il collegamento personale firmato.
             Si salta chi il consenso lo ha gia' dato, chi ha annullato,
             chi non e' di questo evento e - salvo `forza` - chi la mail
             l'ha gia' ricevuta: cosi' un invio interrotto si riprende
             senza doppioni. Sulla scheda resta `mailConsensoPartner`.

     leggi   (pagina /consensi/, azione "consensi-leggi") rende i
             consensi gia' espressi e quello che manca. Il minimo: nome,
             evento e i consensi, perche' la pagina la apre chiunque
             abbia il collegamento.

     salva   (azione "consensi-salva") scrive il consenso partner con
             il momento. Parte da un clic sulla pagina, non aprendola:
             gli antispam visitano i collegamenti delle mail, e un
             consenso non lo da' un robot. Gli altri consensi da qui non
             si toccano.

   La firma (lib/newsletter.js, firmaConsensi) vale per quella sola
   scheda.
   ============================================================ */
'use strict';
const NL = require('./newsletter');
const VERIFICATA = require('./iscrizione-verificata');

const PAGINA = NL.BASE + '/consensi/';
function link(idDoc) {
    return PAGINA + '?d=' + encodeURIComponent(String(idDoc || '')) + '&t=' + encodeURIComponent(NL.firmaConsensi(idDoc));
}
function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function emailValida(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '')); }
const NON_VALIDO = 'Questo collegamento non è valido o non è più attivo.';

// la scheda del collegamento: firma buona, scheda che esiste e non annullata
async function schedaDelCollegamento(db, body) {
    const id = String((body && body.d) || '').slice(0, 400);
    if (!id || !NL.firmaConsensiValida(id, (body && body.t))) return { no: 403 };
    const rif = db.collection('iscrizioni').doc(id);
    const s = await rif.get();
    if (!s.exists) return { no: 404 };
    const v = s.data() || {};
    if (v.annullato) return { no: 404 };
    return { rif: rif, v: v };
}
function consensiDi(v) {
    const quando = x => (x && typeof x === 'object' && x.quando) ? { quando: Number(x.quando) || 0 } : null;
    return {
        privacy: v.privacy === true ? true : (v.privacy === false ? false : null),
        marketing: v.marketing === true ? true : (v.marketing === false ? false : null),
        riprese: quando(v.consensoRiprese),
        partner: quando(v.consensoPartner)
    };
}
function perLaPagina(v) {
    const ev = VERIFICATA.eventoDi(v.pagina);
    return {
        ok: true,
        nome: ((String(v.nome || '') + ' ' + String(v.cognome || '')).trim()),
        evento: ev ? ev.pagina : '',
        // gli eventi senza riprese (il webinar) non hanno quella casella
        conRiprese: !(ev && ev.riprese === false),
        data: String(v.data || ''),
        consensi: consensiDi(v)
    };
}
async function leggi(db, body) {
    const sc = await schedaDelCollegamento(db, body);
    if (sc.no) return { stato: sc.no, corpo: { ok: false, msg: NON_VALIDO } };
    return { stato: 200, corpo: perLaPagina(sc.v) };
}
async function salva(db, body) {
    const sc = await schedaDelCollegamento(db, body);
    if (sc.no) return { stato: sc.no, corpo: { ok: false, msg: NON_VALIDO } };
    if (body.partner !== true) return { stato: 400, corpo: { ok: false, msg: 'Per esprimere il consenso spunta la casella.' } };
    const gia = !!(sc.v.consensoPartner && sc.v.consensoPartner.quando);
    if (!gia) {
        sc.v.consensoPartner = { quando: Date.now(), come: 'collegamento' };
        await sc.rif.set({ consensoPartner: sc.v.consensoPartner }, { merge: true });
    }
    return { stato: 200, corpo: Object.assign(perLaPagina(sc.v), { gia: gia }) };
}

/* L'INVIO. `opz`: evento (la chiave dell'evento), destinatari [{id, doc}],
   mail {oggetto, html, testo}, forza, scadenza, trasporto, da (mittente
   "Nome <indirizzo>"), rispondiA, bcc(dest) -> copia nascosta, idScheda(id)
   -> nome del documento quando la riga non lo porta, chi {email, collab}. */
async function invia(db, opz) {
    const out = { inviate: 0, giaConsenso: 0, giaChieste: 0, senzaScheda: 0, senzaEmail: 0, doppie: 0, falliti: [], restanti: [] };
    const visti = {};
    const oggetto = testo(opz.mail && opz.mail.oggetto, 250).replace(/[\r\n]/g, ' ');
    const html = String((opz.mail && opz.mail.html) || '');
    const txt = String((opz.mail && opz.mail.testo) || '');
    for (const d of opz.destinatari || []) {
        if (Date.now() > opz.scadenza) { out.restanti.push({ id: d.id, doc: d.doc }); continue; }
        const docId = d.doc || opz.idScheda(d.id);
        const rif = db.collection('iscrizioni').doc(docId);
        let v;
        try { const s = await rif.get(); v = s.exists ? (s.data() || {}) : null; }
        catch (e) { out.restanti.push({ id: d.id, doc: d.doc }); continue; }
        const ev = v ? VERIFICATA.eventoDi(v.pagina) : null;
        if (!v || v.annullato || !ev || ev.chiave !== opz.evento) { out.senzaScheda++; continue; }
        const a = String(v.email || '').trim().toLowerCase();
        // chi lo ha gia' dato non riceve niente, nemmeno per un'altra iscrizione con lo stesso indirizzo
        if (v.consensoPartner && v.consensoPartner.quando) { out.giaConsenso++; if (a) visti[a] = true; continue; }
        if (!emailValida(a)) { out.senzaEmail++; continue; }
        if (visti[a]) { out.doppie++; continue; }
        visti[a] = true;
        if (!opz.forza && v.mailConsensoPartner && v.mailConsensoPartner.ok && v.mailConsensoPartner.quando) { out.giaChieste++; continue; }
        const nome = testo(v.nome, 80) || 'ospite';
        const collegamento = link(docId);
        const metti = (t, e) => t.split('{{NOME}}').join(e ? esc(nome) : nome).split('{{CONSENSI}}').join(e ? esc(collegamento) : collegamento);
        try {
            await opz.trasporto.sendMail({
                from: opz.da, replyTo: opz.rispondiA, to: a, bcc: opz.bcc ? opz.bcc(a) : undefined,
                subject: metti(oggetto, false), html: metti(html, true), text: txt ? metti(txt, false) : undefined
            });
            out.inviate++;
            await rif.set({ mailConsensoPartner: { quando: Date.now(), ok: true, a: a, da: opz.chi.email, collab: opz.chi.collab || '' } }, { merge: true });
        } catch (e) {
            const motivo = String((e && e.message) || 'errore del server di posta').slice(0, 150);
            out.falliti.push({ email: a, motivo: motivo });
            try { await rif.set({ mailConsensoPartner: { quando: Date.now(), ok: false, a: a, errore: motivo, da: opz.chi.email } }, { merge: true }); } catch (_) { /* resta da rifare */ }
        }
    }
    return out;
}

module.exports = { PAGINA, link, leggi, salva, invia, consensiDi };
