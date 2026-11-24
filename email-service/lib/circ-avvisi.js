/* ============================================================
   Circolarizzazioni via PEC: le email di servizio
   ------------------------------------------------------------
   A CHI HA INVIATO LA LETTERA arrivano per email, senza dover
   tornare a guardare la tabella:

     - OGNI RICEVUTA della sua PEC, buona o cattiva: accettazione,
       non accettazione, consegna, mancata consegna, preavviso. Con
       il file della ricevuta ALLEGATO, cosi' com'e' nella casella
       PEC (firma del gestore compresa): e' la prova da tenere nelle
       carte di lavoro;
     - la notizia che la PEC non e' partita (c'e' da correggere
       l'indirizzo e reinviare);
     - la notizia che e' arrivata la risposta (da scaricare e
       salvare nelle carte).

   ALLA CASELLA DELLO STUDIO (la stessa degli errori del portale,
   lib/circ-errori.js) arrivano le PEC che il portale non ha saputo
   associare a una lettera, con il messaggio allegato: finche' una
   risposta non e' associata, i solleciti di quella lettera partono
   lo stesso.

   Le notizie si mettono in coda (raccolta circAvvisi) e le spedisce
   il giro programmato: UNA email per persona a ogni giro, con tutte
   le sue novita'. Trenta ricevute lette insieme dalla casella non
   devono diventare trenta messaggi. Quando i file allegati pesano
   troppo per una email sola, le email diventano due o piu'.

   I FILE si vanno a prendere nella casella PEC al momento di
   spedire (nel database non c'e' il testo dei messaggi). Se la
   casella in quel momento non risponde, la notizia aspetta fino a
   mezz'ora; poi parte senza il file, dicendo dove scaricarlo.

   accoda() non lancia mai: un avviso mancato non deve far fallire
   la lettura della casella o l'invio.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const ERRORI = require('./circ-errori');

const AVV = 'circAvvisi';
const MSG = 'circMessaggi';                 // lo stesso nome di DATI.MSG: non lo si importa, perche' circ-dati importa questo file
const MAX_PER_EMAIL = 40;                   // notizie in una email
const MAX_ALLEGATI = 25;                    // file in una email
const ASPETTA_MS = 30 * 60 * 1000;          // quanto si aspetta la casella PEC prima di spedire senza il file
const MAX_PROVE = 3;                        // email con il file respinte per il peso: poi parte senza
const VECCHIO_MS = 30 * 24 * 3600 * 1000;   // una PEC da associare piu' vecchia di cosi' non si segnala piu'
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const riga = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
/* Quanti MB di file, al massimo, in una email (CIRC_EMAIL_ALLEGATI_MB, di base
   10): allegati, in base64, pesano un terzo in piu', e i server di posta di
   norma si fermano a 20-25 MB. */
function tettoByte() {
    const n = Number(process.env.CIRC_EMAIL_ALLEGATI_MB);
    return Math.round((Number.isFinite(n) && n >= 1 && n <= 18 ? n : 10) * 1024 * 1024);
}

/* Come si chiama ogni ricevuta, nell'email e nel nome del file. */
const RICEVUTE = {
    'accettazione': 'Ricevuta di accettazione',
    'avvenuta-consegna': 'Ricevuta di consegna',
    'non-accettazione': 'Avviso di non accettazione',
    'errore-consegna': 'Avviso di mancata consegna',
    'mancata-consegna': 'Avviso di mancata consegna',
    'preavviso-errore-consegna': 'Preavviso di mancata consegna',
    'rilevazione-virus': 'Avviso di rilevazione virus'
};
const nomeRicevuta = v => RICEVUTE[v.ricevuta] || 'Ricevuta';
const PASSI = { sollecito1: 'primo sollecito', sollecito2: 'secondo sollecito' };
const coordinate = m => (m && Number(m.uid) ? { chiave: riga(m.chiave, 80), uid: Number(m.uid), uidValidity: riga(m.uidValidity, 40), dimensione: Number(m.dimensione) || 0 } : null);

/* Una notizia per chi ha preparato la lettera `inv` (scheda di circInvii).
   `voce`: { tipo: 'ricevuta' | 'risposta' | 'invio', chiave, passo, titolo,
   dettaglio; per le ricevute: ricevuta (il tipo), definitivo, msg (dove sta
   il messaggio nella casella: { chiave, uid, uidValidity, dimensione }); per
   le risposte: da, oggetto, allegati, quando, certificata }. */
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
            ricevuta: riga(voce.ricevuta, 40), definitivo: !!voce.definitivo, msg: coordinate(voce.msg), provato: 0,
            da: riga(voce.da, 200), oggetto: riga(voce.oggetto, 250), allegati: (voce.allegati || []).map(x => riga(x, 120)).filter(Boolean).slice(0, 10),
            certificata: !!voce.certificata, quando: Number(voce.quando) || Date.now(), messo: Date.now()
        });
        return true;
    } catch (x) {
        console.error('Circolarizzazioni, avviso a chi ha inviato non accodato:', String((x && x.message) || x).slice(0, 200));
        return false;
    }
}

/* ---------- i file presi dalla casella PEC ---------- */
/* Un nome di file che ogni programma di posta e ogni disco accettano. */
function nomeFile(testo) {
    return riga(testo, 140).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '').slice(0, 110) + '.eml';
}
function fileRicevuta(v) {
    return nomeFile(nomeRicevuta(v) + (PASSI[v.passo] ? ' (' + PASSI[v.passo] + ')' : '') + ' - ' + (v.codice || 'lettera') + ' - ' + (v.destinatario || v.pec || ''));
}
/* La casella si apre una volta sola, e solo se serve davvero un file.
   `apri` e' LETTORE.sessione (lo passa chi chiama: il lettore importa
   circ-dati, che importa questo file). */
function cassetto(apri) {
    let s = null, provata = false;
    return {
        async prendi(dove, max) {
            if (!apri) return { ok: false, perche: 'assente' };
            if (!provata) { provata = true; try { s = await apri(); } catch (_) { s = null; } }
            if (!s) return { ok: false, perche: 'guasto' };
            try { return await s.sorgente(dove, max); } catch (_) { return { ok: false, perche: 'guasto' }; }
        },
        async chiudi() { if (s) { try { await s.chiudi(); } catch (_) { /* si chiude da sola */ } } }
    };
}
/* Mette il file su una notizia (v.file) o annota perche' non c'e'
   (v.senzaFile). Torna 'aspetta' quando conviene riprovare al giro dopo. */
async function allega(casella, v, nome, tetto, ora) {
    delete v.file; v.senzaFile = '';
    if (!v.msg) return 'niente';
    if ((Number(v.provato) || 0) >= MAX_PROVE) { v.senzaFile = 'peso'; return 'senza'; }
    if (v.msg.dimensione > tetto) { v.senzaFile = 'peso'; return 'senza'; }
    const r = await casella.prendi(v.msg, tetto);
    if (r && r.ok) { v.file = { filename: nome, content: r.dati, contentType: 'application/octet-stream' }; return 'file'; }
    const perche = (r && r.perche) || 'guasto';
    if (perche === 'guasto' && ora - (Number(v.messo) || 0) < ASPETTA_MS) return 'aspetta';
    v.senzaFile = perche === 'grande' ? 'peso' : 'assente';
    return 'senza';
}
/* Divide le notizie in email: ognuna con al massimo MAX_PER_EMAIL notizie,
   MAX_ALLEGATI file e `tetto` byte di file. */
function lotti(voci, tetto) {
    const out = [];
    let lotto = [], peso = 0, file = 0;
    for (const v of voci) {
        const p = v.msg && (Number(v.provato) || 0) < MAX_PROVE && v.msg.dimensione <= tetto ? Math.max(v.msg.dimensione, 1) : 0;
        if (lotto.length && (lotto.length >= MAX_PER_EMAIL || (p && (file >= MAX_ALLEGATI || peso + p > tetto)))) { out.push(lotto); lotto = []; peso = 0; file = 0; }
        lotto.push(v);
        if (p) { peso += p; file++; }
    }
    if (lotto.length) out.push(lotto);
    return out;
}
const troppoPesante = errore => /\b552\b|message size|size limit|too (?:large|big)|exceeds?|troppo grande/i.test(String(errore || ''));

/* ---------- l'email a chi ha inviato ---------- */
function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function quando(ms) {
    return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}
const P = 'margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0A2844;';
const H = 'margin:22px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#475569;text-align:left;';
const TD = 'padding:8px 10px;border-bottom:1px solid #E2E8F0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#1E293B;vertical-align:top;text-align:left;';
const GRIGIO = 'color:#475569;';
const tabella = righe => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;border-top:2px solid #0A2844;">' + righe + '</table>';
const indirizzoArea = () => String(process.env.APP_BASE_URL || 'https://nextgenerationbusiness.it').replace(/\/+$/, '') + '/area-riservata/';
const pulsante = () => '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr><td style="background:#164068;border-radius:6px;">'
    + '<a href="' + esc(indirizzoArea()) + '" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Apri l\'area riservata</a></td></tr></table>';
/* che cosa dire del file di una ricevuta */
function delFile(v) {
    if (v.file) return 'In allegato: ' + v.file.filename;
    if (v.senzaFile === 'peso') return 'Il file è troppo pesante per l\'email: scaricalo dall\'area riservata.';
    if (v.senzaFile === 'assente') return 'Il file non è allegato: scaricalo dall\'area riservata.';
    return '';
}
const guasto = v => v.tipo === 'invio' || v.tipo === 'recapito' || (v.tipo === 'ricevuta' && v.definitivo);
function messaggio(nome, voci) {
    const perTempo = (a, b) => a.quando - b.quando;
    const risposte = voci.filter(v => v.tipo === 'risposta').sort(perTempo);
    const guasti = voci.filter(guasto).sort(perTempo);
    const ricevute = voci.filter(v => v.tipo === 'ricevuta' && !v.definitivo).sort(perTempo);
    const lettera = v => '<strong>' + esc(v.destinatario) + '</strong><br>' + esc(v.cliente) + ' &middot; ' + esc(v.codice);
    const diSollecito = v => (PASSI[v.passo] ? ' (' + PASSI[v.passo] + ')' : '');
    const oltre = n => n > MAX_PER_EMAIL ? '<p style="' + P + 'font-size:13px;' + GRIGIO + '">E altre ' + (n - MAX_PER_EMAIL) + ': le trovi tutte nell\'area riservata.</p>' : '';
    const quantiFile = voci.filter(v => v.file).length, conFile = quantiFile > 0;
    let html = '<p style="' + P + '">' + (nome ? 'Ciao ' + esc(nome.split(' ')[0]) + ',' : 'Buongiorno,') + '</p>'
        + '<p style="' + P + '">ci sono novità sulle lettere di circolarizzazione che hai inviato a mezzo PEC.</p>';
    if (risposte.length) {
        html += '<p style="' + H + '">' + (risposte.length === 1 ? 'È arrivata una risposta' : 'Sono arrivate ' + risposte.length + ' risposte') + '</p>'
            + tabella(risposte.slice(0, MAX_PER_EMAIL).map(v => '<tr><td style="' + TD + '">' + lettera(v) + '</td>'
                + '<td style="' + TD + '">' + esc(quando(v.quando)) + '<br><span style="' + GRIGIO + '">da ' + esc(v.da || 'mittente non indicato') + (v.certificata ? '' : ' (posta ordinaria)') + '</span>'
                + (v.allegati.length ? '<br><span style="' + GRIGIO + '">Allegati: ' + esc(v.allegati.join(', ')) + '</span>' : '') + '</td></tr>').join(''))
            + oltre(risposte.length)
            + '<p style="' + P + '">Aprile dall\'area riservata, scarica il messaggio e gli allegati e <strong>salvali nelle carte di lavoro</strong>. I solleciti in programma per queste lettere sono stati fermati.</p>';
    }
    if (guasti.length) {
        html += '<p style="' + H + '">' + (guasti.length === 1 ? 'Una PEC non è arrivata' : guasti.length + ' PEC non sono arrivate') + '</p>'
            + tabella(guasti.slice(0, MAX_PER_EMAIL).map(v => '<tr><td style="' + TD + '">' + lettera(v) + '<br><span style="' + GRIGIO + '">' + esc(v.pec) + '</span></td>'
                + '<td style="' + TD + '"><strong style="color:#8F1D15;">' + esc(v.titolo) + '</strong>' + (v.dettaglio ? '<br><span style="' + GRIGIO + '">' + esc(v.dettaglio) + '</span>' : '')
                + (v.tipo === 'ricevuta' ? '<br><span style="' + GRIGIO + '">' + esc(nomeRicevuta(v) + ' del ' + quando(v.quando)) + (delFile(v) ? '. ' + esc(delFile(v)) : '') + '</span>' : '') + '</td></tr>').join(''))
            + oltre(guasti.length)
            + '<p style="' + P + '">Controlla l\'indirizzo su INI-PEC, poi apri la lettera nell\'area riservata e premi <strong>«Correggi la PEC e reinvia»</strong>. Finché la lettera non è consegnata, i solleciti restano fermi.</p>';
    }
    if (ricevute.length) {
        html += '<p style="' + H + '">' + (ricevute.length === 1 ? 'Una ricevuta' : ricevute.length + ' ricevute') + '</p>'
            + tabella(ricevute.slice(0, MAX_PER_EMAIL).map(v => '<tr><td style="' + TD + '">' + lettera(v) + '<br><span style="' + GRIGIO + '">' + esc(v.pec) + '</span></td>'
                + '<td style="' + TD + '"><strong' + (v.ricevuta === 'preavviso-errore-consegna' ? ' style="color:#8A5A00;"' : '') + '>' + esc(nomeRicevuta(v) + diSollecito(v)) + '</strong><br>' + esc(quando(v.quando))
                + (v.dettaglio ? '<br><span style="' + GRIGIO + '">' + esc(v.dettaglio) + '</span>' : '')
                + (delFile(v) ? '<br><span style="' + GRIGIO + '">' + esc(delFile(v)) + '</span>' : '') + '</td></tr>').join(''))
            + oltre(ricevute.length);
    }
    if (conFile) {
        html += quantiFile === 1
            ? '<p style="' + P + '">La ricevuta è <strong>allegata a questa email</strong> così com\'è arrivata nella casella PEC, con la firma del gestore: è un file .eml, si apre con il programma di posta. <strong>Salvala nelle carte di lavoro.</strong></p>'
            : '<p style="' + P + '">Le ricevute sono <strong>allegate a questa email</strong> così come sono arrivate nella casella PEC, con la firma del gestore: sono file .eml, si aprono con il programma di posta. <strong>Salvale nelle carte di lavoro.</strong></p>';
    }
    html += pulsante()
        + '<p style="' + P + 'font-size:13px;' + GRIGIO + '">Le trovi in Strumenti di revisione, Circolarizzazioni via PEC, nella pagina della società. Ricevi questo messaggio perché hai preparato tu queste lettere.</p>';
    const rigaTesto = v => '- ' + v.destinatario + ' (' + v.cliente + ', ' + v.codice + ', ' + v.pec + '): ';
    const testo = (nome ? 'Ciao ' + nome.split(' ')[0] + ',' : 'Buongiorno,') + '\n\nci sono novità sulle lettere di circolarizzazione che hai inviato a mezzo PEC.\n'
        + (risposte.length ? '\nRISPOSTE ARRIVATE\n' + risposte.slice(0, MAX_PER_EMAIL).map(v => '- ' + v.destinatario + ' (' + v.cliente + ', ' + v.codice + '): ' + quando(v.quando) + ', da ' + (v.da || 'mittente non indicato')
            + (v.allegati.length ? ', allegati: ' + v.allegati.join(', ') : '')).join('\n') + '\nScarica il messaggio e gli allegati dall\'area riservata e salvali nelle carte di lavoro. I solleciti per queste lettere sono fermi.\n' : '')
        + (guasti.length ? '\nPEC NON ARRIVATE\n' + guasti.slice(0, MAX_PER_EMAIL).map(v => rigaTesto(v) + v.titolo + (v.dettaglio ? ' - ' + v.dettaglio : '') + (v.tipo === 'ricevuta' && delFile(v) ? ' [' + delFile(v) + ']' : '')).join('\n')
            + '\nControlla l\'indirizzo su INI-PEC, apri la lettera e premi "Correggi la PEC e reinvia".\n' : '')
        + (ricevute.length ? '\nRICEVUTE\n' + ricevute.slice(0, MAX_PER_EMAIL).map(v => rigaTesto(v) + nomeRicevuta(v) + diSollecito(v) + ', ' + quando(v.quando) + (v.dettaglio ? ' - ' + v.dettaglio : '') + (delFile(v) ? ' [' + delFile(v) + ']' : '')).join('\n') + '\n' : '')
        + (conFile ? (quantiFile === 1 ? '\nLa ricevuta è allegata a questa email così com\'è arrivata nella casella PEC (file .eml): salvala nelle carte di lavoro.\n'
            : '\nLe ricevute sono allegate a questa email così come sono arrivate nella casella PEC (file .eml): salvale nelle carte di lavoro.\n') : '')
        + '\n' + indirizzoArea();
    const minuscola = t => t.charAt(0).toLowerCase() + t.slice(1);
    let oggetto;
    if (voci.length === 1 && risposte.length === 1) oggetto = 'risposta di ' + risposte[0].destinatario + ' (' + risposte[0].cliente + ')';
    else if (voci.length === 1 && guasti.length === 1) oggetto = minuscola(guasti[0].titolo) + ': ' + guasti[0].destinatario + ' (' + guasti[0].cliente + ')';
    else if (voci.length === 1) oggetto = minuscola(nomeRicevuta(ricevute[0]) + diSollecito(ricevute[0])) + ': ' + ricevute[0].destinatario + ' (' + ricevute[0].cliente + ')';
    else if (ricevute.length === voci.length) oggetto = voci.length + ' ricevute delle tue lettere';
    else oggetto = voci.length + ' novità sulle tue lettere';
    return { oggetto: 'Circolarizzazioni PEC: ' + oggetto, html: html, testo: testo };
}

/* Spedisce quello che e' in coda, una email per persona (piu' d'una se i file
   pesano troppo), e toglie dalla coda solo quello che e' partito: il resto ci
   riprova al giro dopo. `opz`: { casella (un cassetto() gia' aperto da chi
   chiama) oppure sessione (LETTORE.sessione), scadenza (ms: oltre non si
   cominciano altre email) }. */
async function spedisci(db, opz) {
    opz = opz || {};
    let docs;
    try { docs = (await db.collection(AVV).get()).docs; } catch (_) { return { ok: false, inviate: 0 }; }
    if (!docs.length) return { ok: true, inviate: 0 };
    if (!ERRORI.postaConfigurata()) return { ok: false, inviate: 0, msg: 'posta non configurata' };
    const perPersona = new Map();
    for (const s of docs) {
        const v = Object.assign({ id: s.id }, s.data() || {});
        v.allegati = Array.isArray(v.allegati) ? v.allegati : [];
        v.msg = coordinate(v.msg);
        if (!perPersona.has(v.a)) perPersona.set(v.a, []);
        perPersona.get(v.a).push(v);
    }
    const casella = opz.casella || cassetto(opz.sessione);
    const tetto = tettoByte(), ora = Date.now();
    let inviate = 0, fallite = 0, rimandate = 0, file = 0, fuoriTempo = false;
    try {
        for (const [a, tutte] of perPersona) {
            tutte.sort((x, y) => (x.quando - y.quando) || (x.id < y.id ? -1 : 1));
            for (const lotto of lotti(tutte, tetto)) {
                if (opz.scadenza && Date.now() > opz.scadenza) { fuoriTempo = true; break; }
                const voci = [];
                for (const v of lotto) {
                    if ((await allega(casella, v, fileRicevuta(v), tetto, ora)) === 'aspetta') { rimandate++; continue; }
                    voci.push(v);
                }
                if (!voci.length) continue;
                const allegati = voci.filter(v => v.file).map(v => v.file);
                const m = messaggio(voci[0].nome, voci);
                const esito = await ERRORI.mandaConEsito(a, m.oggetto, m.html, m.testo, 'avviso-utente', allegati);
                if (!esito.ok) {
                    fallite++;
                    // respinta per il peso: dopo qualche tentativo la notizia parte senza i file
                    if (allegati.length && troppoPesante(esito.errore)) {
                        for (const v of voci.filter(x => x.file)) { try { await db.collection(AVV).doc(v.id).set({ provato: (Number(v.provato) || 0) + 1 }, { merge: true }); } catch (_) { /* si riprova */ } }
                    }
                    continue;
                }
                inviate++; file += allegati.length;
                for (const v of voci) { try { await db.collection(AVV).doc(v.id).delete(); } catch (_) { /* al massimo arriva due volte */ } }
            }
            if (fuoriTempo) break;
        }
    } finally {
        if (!opz.casella) await casella.chiudi();
    }
    return { ok: !fallite, inviate: inviate, fallite: fallite, rimandate: rimandate, allegati: file, restanti: fuoriTempo };
}

/* ---------- le PEC da associare, alla casella dello studio ---------- */
function messaggioDaAssociare(voci) {
    const n = voci.length;
    const quantiFile = voci.filter(v => v.file).length;
    const candidate = v => (Array.isArray(v.candidati) ? v.candidati : []).slice(0, 6).map(c => [c.cliente, c.destinatario, c.codice].filter(Boolean).join(' · '));
    const tipo = v => (v.certificata ? 'PEC' : 'posta ordinaria');
    const nomi = v => (Array.isArray(v.allegati) ? v.allegati : []).map(x => riga(x && x.nome ? x.nome : x, 120)).filter(Boolean).slice(0, 10);
    const html = '<p style="' + P + '">' + (n === 1
        ? 'Nella casella PEC delle circolarizzazioni è arrivato <strong>un messaggio che il portale non è riuscito ad associare a una lettera</strong>.'
        : 'Nella casella PEC delle circolarizzazioni sono arrivati <strong>' + n + ' messaggi che il portale non è riuscito ad associare a una lettera</strong>.') + '</p>'
        + tabella(voci.map(v => '<tr><td style="' + TD + 'white-space:nowrap;">' + esc(quando(v.quando)) + '</td>'
            + '<td style="' + TD + '"><strong>' + esc(v.da || 'mittente non indicato') + '</strong> <span style="' + GRIGIO + '">(' + tipo(v) + ')</span><br>' + esc(v.oggetto || '(senza oggetto)')
            + (nomi(v).length ? '<br><span style="' + GRIGIO + '">Allegati: ' + esc(nomi(v).join(', ')) + '</span>' : '')
            + '<br><span style="' + GRIGIO + '">' + (candidate(v).length ? 'Lettere a cui potrebbe riferirsi: ' + esc(candidate(v).join('; ')) : 'Nessuna lettera è stata inviata a questo indirizzo.') + '</span>'
            + (delFile(v) ? '<br><span style="' + GRIGIO + '">' + esc(delFile(v)) + '</span>' : '') + '</td></tr>').join(''))
        + (quantiFile ? '<p style="' + P + '">' + (quantiFile === 1 ? 'Il messaggio è allegato a questa email così com\'è arrivato nella casella PEC (un file .eml, si apre con il programma di posta).' : 'I messaggi sono allegati a questa email così come sono arrivati nella casella PEC (file .eml, si aprono con il programma di posta).') + '</p>' : '')
        + '<p style="' + P + '">' + (n === 1
            ? '<strong>Va associato alla sua lettera</strong>: finché una risposta non è associata, per il portale quella lettera è ancora senza risposta e i solleciti partono lo stesso. Se non è la risposta a una circolarizzazione, si scarta.'
            : '<strong>Vanno associati alla loro lettera</strong>: finché una risposta non è associata, per il portale quella lettera è ancora senza risposta e i solleciti partono lo stesso. Se non sono risposte a una circolarizzazione, si scartano.') + '</p>'
        + '<p style="' + P + '">Si fa dall\'area riservata, in <strong>Strumenti di revisione, Circolarizzazioni via PEC, scheda «Risposte non associate»</strong>: lo può fare l\'amministratore o un supervisore.</p>'
        + pulsante()
        + '<p style="' + P + 'font-size:13px;' + GRIGIO + '">Questo messaggio arriva alla casella che segue le circolarizzazioni. Per lo stesso messaggio non arriva un secondo avviso.</p>';
    const testo = (n === 1 ? 'Nella casella PEC delle circolarizzazioni è arrivato un messaggio che il portale non è riuscito ad associare a una lettera.' : 'Nella casella PEC delle circolarizzazioni sono arrivati ' + n + ' messaggi che il portale non è riuscito ad associare a una lettera.') + '\n\n'
        + voci.map(v => '- ' + quando(v.quando) + ' | da ' + (v.da || 'mittente non indicato') + ' (' + tipo(v) + ') | ' + (v.oggetto || '(senza oggetto)')
            + (nomi(v).length ? '\n  Allegati: ' + nomi(v).join(', ') : '')
            + '\n  ' + (candidate(v).length ? 'Lettere a cui potrebbe riferirsi: ' + candidate(v).join('; ') : 'Nessuna lettera è stata inviata a questo indirizzo.')
            + (delFile(v) ? '\n  ' + delFile(v) : '')).join('\n')
        + '\n\n' + (n === 1 ? 'Va associato alla sua lettera: finché una risposta non è associata, i solleciti di quella lettera partono lo stesso. Se non è la risposta a una circolarizzazione, si scarta.'
            : 'Vanno associati alla loro lettera: finché una risposta non è associata, i solleciti di quella lettera partono lo stesso. Se non sono risposte a una circolarizzazione, si scartano.')
        + '\nArea riservata: Strumenti di revisione, Circolarizzazioni via PEC, scheda "Risposte non associate" (amministratore o supervisori).\n' + indirizzoArea();
    return {
        oggetto: 'Circolarizzazioni PEC: ' + (n === 1 ? 'una ' + tipo(voci[0]) + ' da associare, da ' + (voci[0].da || 'mittente non indicato') : n + ' messaggi da associare'),
        html: html, testo: testo
    };
}
/* Una email alla casella dello studio (e ai supervisori, se ricevono anche gli
   errori) con i messaggi arrivati e non associati, non ancora segnalati. Si
   segnano come avvisati solo quelli partiti. `opz` come per spedisci(). */
async function spedisciDaAssociare(db, opz) {
    opz = opz || {};
    let docs;
    try { docs = (await db.collection(MSG).where('stato', '==', 'non-associato').get()).docs; } catch (_) { return { ok: false, inviate: 0, messaggi: 0 }; }
    const ora = Date.now();
    const nuovi = docs.map(s => Object.assign({ id: s.id }, s.data() || {}))
        .filter(m => !m.avvisato && (Number(m.quando) || Number(m.letto) || ora) > ora - VECCHIO_MS)
        .map(m => Object.assign(m, { quando: Number(m.quando) || Number(m.letto) || ora, messo: Number(m.letto) || Number(m.quando) || ora, msg: coordinate({ chiave: m.id, uid: m.uid, uidValidity: m.uidValidity, dimensione: m.dimensione }) }))
        .sort((x, y) => (x.quando - y.quando) || (x.id < y.id ? -1 : 1));
    if (!nuovi.length) return { ok: true, inviate: 0, messaggi: 0 };
    if (!ERRORI.postaConfigurata()) return { ok: false, inviate: 0, messaggi: 0, msg: 'posta non configurata' };
    const a = (await ERRORI.destinatari(db)).lista;
    const casella = opz.casella || cassetto(opz.sessione);
    const tetto = tettoByte();
    let inviate = 0, fallite = 0, rimandate = 0, segnalati = 0, fuoriTempo = false;
    try {
        for (const lotto of lotti(nuovi, tetto)) {
            if (opz.scadenza && Date.now() > opz.scadenza) { fuoriTempo = true; break; }
            const voci = [];
            for (const v of lotto) {
                const nome = nomeFile((v.certificata ? 'PEC' : 'Messaggio') + ' da associare - ' + (v.da || 'mittente non indicato') + ' - ' + quando(v.quando).replace(/\//g, '-').replace(',', '').replace(':', '.'));
                if ((await allega(casella, v, nome, tetto, ora)) === 'aspetta') { rimandate++; continue; }
                voci.push(v);
            }
            if (!voci.length) continue;
            const allegati = voci.filter(v => v.file).map(v => v.file);
            const m = messaggioDaAssociare(voci);
            const esito = await ERRORI.mandaConEsito(a.join(', '), m.oggetto, m.html, m.testo, 'da-associare', allegati);
            if (!esito.ok) {
                fallite++;
                if (allegati.length && troppoPesante(esito.errore)) {
                    for (const v of voci.filter(x => x.file)) { try { await db.collection(MSG).doc(v.id).set({ provato: (Number(v.provato) || 0) + 1 }, { merge: true }); } catch (_) { /* si riprova */ } }
                }
                continue;
            }
            inviate++; segnalati += voci.length;
            for (const v of voci) { try { await db.collection(MSG).doc(v.id).set({ avvisato: Date.now() }, { merge: true }); } catch (_) { /* al massimo arriva due volte */ } }
        }
    } finally {
        if (!opz.casella) await casella.chiudi();
    }
    return { ok: !fallite, inviate: inviate, messaggi: segnalati, fallite: fallite, rimandate: rimandate, restanti: fuoriTempo, a: a };
}

module.exports = { AVV, accoda, spedisci, spedisciDaAssociare, cassetto, _interni: { messaggio, messaggioDaAssociare, lotti, nomeFile, fileRicevuta, tettoByte, ASPETTA_MS, MAX_PROVE } };
