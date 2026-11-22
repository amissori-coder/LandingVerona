/* ============================================================
   Circolarizzazioni via PEC: gli avvisi a chi ha inviato la lettera
   ------------------------------------------------------------
   Chi prepara una lettera non deve tornare a guardare la tabella
   per sapere com'e' andata: gli arriva un'email quando

     - la PEC non e' stata accettata, non e' stata consegnata o non
       e' partita (c'e' da correggere l'indirizzo e reinviare);
     - e' arrivata la risposta (da scaricare e salvare nelle carte).

   Come per gli errori di chi amministra (lib/circ-errori.js), le
   notizie si mettono in coda (raccolta circAvvisi) e le spedisce
   il giro programmato: UNA email per persona a ogni giro, con
   tutte le sue novita'. Trenta risposte lette insieme dalla
   casella non devono diventare trenta messaggi.

   Chi riceve gia' l'email degli errori (il titolare, i supervisori
   se scelti) non riceve una seconda volta la stessa PEC non
   consegnata: per lui qui passano solo le risposte.

   accoda() non lancia mai: un avviso mancato non deve far fallire
   la lettura della casella o l'invio.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const ERRORI = require('./circ-errori');

const AVV = 'circAvvisi';
const MAX_PER_EMAIL = 40;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const riga = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/* Una notizia per chi ha preparato la lettera `inv` (scheda di circInvii).
   `voce`: { tipo: 'risposta' | 'recapito' | 'invio', chiave, passo, titolo,
   dettaglio, e per le risposte da, oggetto, allegati, quando, certificata }. */
async function accoda(db, inv, idInvio, voce) {
    try {
        const a = riga((inv.creato || {}).da, 200).toLowerCase();
        if (!EMAIL_RE.test(a)) return false;
        const id = crypto.createHash('sha1').update(a + '~' + voce.chiave).digest('hex').slice(0, 28);
        await db.collection(AVV).doc(id).set({
            a: a, nome: riga((inv.creato || {}).nome, 120), tipo: voce.tipo, passo: riga(voce.passo, 20),
            incaricoId: riga(inv.incaricoId, 120), cliente: riga(inv.cliente, 200), invio: String(idInvio),
            destinatario: riga(inv.destinatario, 200), pec: riga(inv.pec, 200), codice: riga(inv.codice, 20),
            titolo: riga(voce.titolo, 200), dettaglio: riga(voce.dettaglio, 400),
            da: riga(voce.da, 200), oggetto: riga(voce.oggetto, 250), allegati: (voce.allegati || []).map(x => riga(x, 120)).filter(Boolean).slice(0, 10),
            certificata: !!voce.certificata, quando: Number(voce.quando) || Date.now(), messo: Date.now()
        });
        return true;
    } catch (x) {
        console.error('Circolarizzazioni, avviso a chi ha inviato non accodato:', String((x && x.message) || x).slice(0, 200));
        return false;
    }
}

function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function quando(ms) {
    return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}
function messaggio(nome, voci) {
    const risposte = voci.filter(v => v.tipo === 'risposta').sort((a, b) => a.quando - b.quando);
    const guasti = voci.filter(v => v.tipo !== 'risposta').sort((a, b) => a.quando - b.quando);
    const P = 'margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0A2844;';
    const H = 'margin:22px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#475569;text-align:left;';
    const TD = 'padding:8px 10px;border-bottom:1px solid #E2E8F0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#1E293B;vertical-align:top;text-align:left;';
    const base = String(process.env.APP_BASE_URL || 'https://nextgenerationbusiness.it').replace(/\/+$/, '');
    const tabella = righe => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;border-top:2px solid #0A2844;">' + righe + '</table>';
    const lettera = v => '<strong>' + esc(v.destinatario) + '</strong><br>' + esc(v.cliente) + ' &middot; ' + esc(v.codice);
    const oltre = n => n > MAX_PER_EMAIL ? '<p style="' + P + 'font-size:13px;color:#475569;">E altre ' + (n - MAX_PER_EMAIL) + ': le trovi tutte nell\'area riservata.</p>' : '';
    let html = '<p style="' + P + '">' + (nome ? 'Ciao ' + esc(nome.split(' ')[0]) + ',' : 'Buongiorno,') + '</p>'
        + '<p style="' + P + '">ci sono novità sulle lettere di circolarizzazione che hai inviato a mezzo PEC.</p>';
    if (risposte.length) {
        html += '<p style="' + H + '">' + (risposte.length === 1 ? 'È arrivata una risposta' : 'Sono arrivate ' + risposte.length + ' risposte') + '</p>'
            + tabella(risposte.slice(0, MAX_PER_EMAIL).map(v => '<tr><td style="' + TD + '">' + lettera(v) + '</td>'
                + '<td style="' + TD + '">' + esc(quando(v.quando)) + '<br><span style="color:#475569;">da ' + esc(v.da || 'mittente non indicato') + (v.certificata ? '' : ' (posta ordinaria)') + '</span>'
                + (v.allegati.length ? '<br><span style="color:#475569;">Allegati: ' + esc(v.allegati.join(', ')) + '</span>' : '') + '</td></tr>').join(''))
            + oltre(risposte.length)
            + '<p style="' + P + '">Aprile dall\'area riservata, scarica il messaggio e gli allegati e <strong>salvali nelle carte di lavoro</strong>. I solleciti in programma per queste lettere sono stati fermati.</p>';
    }
    if (guasti.length) {
        html += '<p style="' + H + '">' + (guasti.length === 1 ? 'Una PEC non è arrivata' : guasti.length + ' PEC non sono arrivate') + '</p>'
            + tabella(guasti.slice(0, MAX_PER_EMAIL).map(v => '<tr><td style="' + TD + '">' + lettera(v) + '<br><span style="color:#475569;">' + esc(v.pec) + '</span></td>'
                + '<td style="' + TD + '"><strong style="color:#8F1D15;">' + esc(v.titolo) + '</strong>' + (v.dettaglio ? '<br><span style="color:#475569;">' + esc(v.dettaglio) + '</span>' : '') + '</td></tr>').join(''))
            + oltre(guasti.length)
            + '<p style="' + P + '">Controlla l\'indirizzo su INI-PEC, poi apri la lettera nell\'area riservata e premi <strong>«Correggi la PEC e reinvia»</strong>. Finché la lettera non è consegnata, i solleciti restano fermi.</p>';
    }
    html += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr><td style="background:#164068;border-radius:6px;">'
        + '<a href="' + esc(base + '/area-riservata/') + '" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Apri l\'area riservata</a></td></tr></table>'
        + '<p style="' + P + 'font-size:13px;color:#475569;">Le trovi in Strumenti di revisione, Circolarizzazioni via PEC, nella pagina della società. Ricevi questo messaggio perché hai preparato tu queste lettere.</p>';
    const testo = (nome ? 'Ciao ' + nome.split(' ')[0] + ',' : 'Buongiorno,') + '\n\nci sono novità sulle lettere di circolarizzazione che hai inviato a mezzo PEC.\n'
        + (risposte.length ? '\nRISPOSTE ARRIVATE\n' + risposte.slice(0, MAX_PER_EMAIL).map(v => '- ' + v.destinatario + ' (' + v.cliente + ', ' + v.codice + '): ' + quando(v.quando) + ', da ' + (v.da || 'mittente non indicato')
            + (v.allegati.length ? ', allegati: ' + v.allegati.join(', ') : '')).join('\n') + '\nScarica il messaggio e gli allegati dall\'area riservata e salvali nelle carte di lavoro. I solleciti per queste lettere sono fermi.\n' : '')
        + (guasti.length ? '\nPEC NON ARRIVATE\n' + guasti.slice(0, MAX_PER_EMAIL).map(v => '- ' + v.destinatario + ' (' + v.cliente + ', ' + v.codice + ', ' + v.pec + '): ' + v.titolo + (v.dettaglio ? ' - ' + v.dettaglio : '')).join('\n')
            + '\nControlla l\'indirizzo su INI-PEC, apri la lettera e premi "Correggi la PEC e reinvia".\n' : '')
        + '\n' + base + '/area-riservata/';
    let oggetto;
    if (voci.length === 1 && risposte.length === 1) oggetto = 'risposta di ' + risposte[0].destinatario + ' (' + risposte[0].cliente + ')';
    else if (voci.length === 1) oggetto = guasti[0].titolo.charAt(0).toLowerCase() + guasti[0].titolo.slice(1) + ': ' + guasti[0].destinatario + ' (' + guasti[0].cliente + ')';
    else oggetto = voci.length + ' novità sulle tue lettere';
    return { oggetto: 'Circolarizzazioni PEC: ' + oggetto, html: html, testo: testo };
}

/* Spedisce quello che e' in coda, una email per persona, e toglie dalla coda
   solo quello che e' partito: il resto ci riprova al giro dopo. */
async function spedisci(db) {
    let docs;
    try { docs = (await db.collection(AVV).get()).docs; } catch (_) { return { ok: false, inviate: 0 }; }
    if (!docs.length) return { ok: true, inviate: 0 };
    if (!ERRORI.postaConfigurata()) return { ok: false, inviate: 0, msg: 'posta non configurata' };
    const amministratori = (await ERRORI.destinatari(db)).lista;
    const perPersona = new Map();
    for (const s of docs) {
        const v = Object.assign({ id: s.id }, s.data() || {});
        v.allegati = Array.isArray(v.allegati) ? v.allegati : [];
        // la PEC non consegnata e' gia' nell'email degli errori di chi amministra
        if (v.tipo !== 'risposta' && amministratori.indexOf(v.a) >= 0) { try { await db.collection(AVV).doc(s.id).delete(); } catch (_) { } continue; }
        if (!perPersona.has(v.a)) perPersona.set(v.a, []);
        perPersona.get(v.a).push(v);
    }
    let inviate = 0, fallite = 0;
    for (const [a, voci] of perPersona) {
        const m = messaggio(voci[0].nome, voci);
        const partita = await ERRORI.manda(a, m.oggetto, m.html, m.testo, 'avviso-utente');
        if (!partita) { fallite++; continue; }
        inviate++;
        for (const v of voci) { try { await db.collection(AVV).doc(v.id).delete(); } catch (_) { /* al massimo arriva due volte */ } }
    }
    return { ok: !fallite, inviate: inviate, fallite: fallite };
}

module.exports = { AVV, accoda, spedisci, _interni: { messaggio } };
