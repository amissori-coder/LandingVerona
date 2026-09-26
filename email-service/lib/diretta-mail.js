/* ============================================================
   Diretta degli eventi: le email (modelli HTML + solo testo)
   ------------------------------------------------------------
   Quattro email, tutte composte QUI dal servizio e mai dal browser.
   Nella diretta non esiste un nome utente: si entra con la PROPRIA
   EMAIL e la password che generiamo noi.
     - credenziali: «Per entrare nella diretta: vai su <indirizzo>,
       scrivi la tua email <email> e questa password: <password>», il
       riquadro con email e password e il pulsante per entrare;
     - iscritto anche: «Sei iscritto anche a <evento>: entra con la tua
       email e la password che hai già; se non la ricordi usa "Password
       dimenticata?"». Per chi ha gia' una password (un solo account per
       tutti gli eventi): MAI una password;
     - promemoria: il giorno prima e un'ora prima dell'inizio, con il
       collegamento e l'email con cui si entra (MAI la password);
     - reimpostazione: il collegamento per scegliere una password
       nuova ("Password dimenticata?", e il primo accesso dei gestori).
   In ognuna: «Non trovi l'email? Controlla nella cartella Spam o
   Promozioni e segna il mittente come sicuro.» (FRASE_SPAM): serve per
   le email che arriveranno dopo (i promemoria, la prossima
   reimpostazione), che finiscono spesso proprio li'.

   LA GRAFICA E' QUELLA DELLE ALTRE EMAIL DEL SITO (lib/mail-ngb.js):
   testata blu scura con il logo bianco, la fascia in filigrana, il
   riquadro chiaro con il filetto a sinistra, il pulsante blu, il piede
   con Revilaw S.p.A. Qui ce n'e' una copia ridotta e non un require di
   mail-ngb.js: i file della diretta usano solo mail-layout.js e gli
   altri file diretta-*, cosi' la diretta resta un blocco a se' che si
   puo' leggere (e spostare) senza trascinarsi dietro il resto del
   servizio. Se di la' cambia l'impostazione, va aggiornata anche qui.

   PERCHE' OGNI VALORE PASSA DA esc(). Nomi, cognomi, aziende e titoli
   arrivano da un file caricato o da un modulo: un "<script>" nel
   cognome deve arrivare scritto, non eseguito, e un apice non deve
   poter chiudere un attributo. esc() tratta & < > " ' e gli attributi
   stanno sempre fra doppi apici. I collegamenti non si prendono mai
   cosi' come arrivano: si costruiscono QUI da baseSito(), da percorsi
   fissi e dall'identificativo dell'evento (quello eventualmente passato
   come `link` non si usa), e la pagina dell'evento deve avere la forma
   "/cartella/".

   IL COLLEGAMENTO e' /diretta/?e=<evento>: chi segue piu' eventi entra
   in quello dell'email (la pagina usa `e` come preferenza, se e'
   davvero uno dei suoi eventi). L'email della persona NON va nel
   collegamento: un indirizzo in un URL finisce nei registri e nella
   cronologia. Nella frase «vai su ...» l'indirizzo e' quello pulito
   della pagina (/diretta/), che si legge e si ricopia bene.

   PENSATE PER CHI NON E' PRATICO (spesso sul telefono): gli orari
   portano sempre "(ora italiana)"; il promemoria dice "domani" o
   "oggi" guardando l'ora in cui parte davvero; chi ha gia' ricevuto
   una password legge subito che quella vecchia non vale piu'.

   NIENTE TRATTINI LUNGHI: oggetto, HTML e testo passano tutti da
   senzaTrattiniLunghi() di mail-layout.js, come ogni email dello studio.

   LA PASSWORD in carattere a spaziatura fissa, grande e un po'
   spaziata: e' il modo in cui non si confondono una "l" con una "I" o
   uno "0" con una "O" (la password li evita comunque). La spaziatura e'
   solo grafica: chi copia, copia le lettere e basta. L'email sta nel
   carattere normale, grande, e va a capo dove serve (un indirizzo lungo
   non deve uscire dallo schermo del telefono).
   ============================================================ */
'use strict';
const C = require('./diretta-comune');
const { senzaTrattiniLunghi } = require('./mail-layout');

const COLORE = {
    scuro: '#0A2844', blu: '#164068', accento: '#2A5A85', chiaroBlu: '#5B89B8',
    suScuro: '#C8DAEA', testo: '#1E293B', tenue: '#475569',
    bordo: '#E2E8F0', sfondo: '#F1F5F9', chiaro: '#F4F8FB', bianco: '#FFFFFF',
    // la fascia "email di prova" e la nota "sostituisce le precedenti"
    ambra: '#B45309', ambraChiaro: '#FEF3C7'
};
const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
const FONTE = 'font-family:' + FONT + ';mso-line-height-rule:exactly;';
const MONO = "'Courier New', Courier, monospace";
const LARGHEZZA = 600;
const LATO = 40;
/* Le immagini puntano SEMPRE al sito pubblico, anche nelle prove: una
   email si apre sul telefono di chi la riceve, non sul nostro computer. */
const SITO = 'https://nextgenerationbusiness.it';
const LOGO_BIANCO = SITO + '/assets/logo-revilaw-bianco.png';
const FASCIA = SITO + '/assets/newsletter/fascia-filigrana.png';
const PRIVACY = 'https://www.iubenda.com/privacy-policy/40996386';
const MITTENTE = { nome: 'Revilaw S.p.A.', indirizzo: 'Via XX Settembre 9 - 37129 Verona', cf: 'C.F. 04641610235' };
const MOTIVO = 'Ricevi questa email perché sei iscritto alla partecipazione online dell\'evento: non è una comunicazione promozionale.';
const MOTIVO_GESTORE = 'Ricevi questa email perché il tuo indirizzo è tra i gestori della diretta di Next Generation Business.';
// la forma ammessa per la pagina dell'evento (la stessa che controlla il server al salvataggio)
const PAGINA_VALIDA = /^\/[a-z0-9_\/-]*\/?$/;
// l'identificativo di un evento (lo stesso controllo del server): solo cosi' entra nel collegamento
const RE_ID_EVENTO = /^[a-z0-9][a-z0-9-]{2,40}$/;
/* Accanto a ogni orario: chi si collega dall'estero, o ha il telefono
   con un altro fuso, non deve fare i conti. */
const ORA_ITALIANA = ' (ora italiana)';
const GIORNO_MS = 24 * 60 * 60 * 1000;

/* ---------- attrezzi ---------- */
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// una riga sola: l'oggetto finisce in un'intestazione, e un a capo li' dentro ne inventerebbe un'altra
function unaRiga(s) {
    return String(s == null ? '' : s).replace(/[\r\n\t\u2028\u2029]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}
function spazio(h) {
    return '<tr><td height="' + h + '" style="font-size:0;line-height:0;height:' + h + 'px;">&nbsp;</td></tr>';
}
function tabella(righe) {
    return '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">' + righe + '</table>';
}
function link(url, testo, colore) {
    return '<a href="' + esc(url) + '" style="color:' + (colore || COLORE.blu) + ';text-decoration:underline;">' + esc(testo) + '</a>';
}

/* Un istante da quello che arriva: millisecondi, Timestamp di Firestore,
   Date o testo. NaN se non si capisce. */
function istante(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return v;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (v instanceof Date) return v.getTime();
    return Date.parse(String(v));
}

/* I dati dell'evento come li scrive una persona: "venerdì 2 ottobre 2026",
   "dalle 9.00 alle 17.30". Il documento eventi/{id} ha gli istanti gia'
   calcolati; se mancassero si ricavano da data e ore (ora di Roma). */
function datiEvento(ev) {
    const e = ev || {};
    let inizio = istante(e.inizio);
    if (!Number.isFinite(inizio)) inizio = C.istanteRoma(e.data, e.oraInizio);
    let fine = istante(e.fine);
    if (!Number.isFinite(fine)) fine = C.istanteRoma(e.data, e.oraFine);
    const titolo = unaRiga(e.titolo) || 'Next Generation Business';
    const haInizio = Number.isFinite(inizio);
    return {
        titolo: titolo,
        luogo: unaRiga(e.luogo),
        inizio: haInizio ? inizio : NaN,
        fine: Number.isFinite(fine) ? fine : NaN,
        giorno: haInizio ? C.dataEstesa(inizio) : '',
        dalle: haInizio ? C.oraLeggibile(inizio) : '',
        alle: Number.isFinite(fine) ? C.oraLeggibile(fine) : ''
    };
}
// "dalle 9.00 alle 17.30 (ora italiana)"
function orario(d) {
    if (d.dalle && d.alle) return 'dalle ' + d.dalle + ' alle ' + d.alle + ORA_ITALIANA;
    return d.dalle ? 'dalle ' + d.dalle + ORA_ITALIANA : '';
}

/* Quanti giorni di calendario (a Roma) separano due istanti: 0 = stesso
   giorno, 1 = il giorno dopo. Non la differenza in ore: alle 23.30
   un evento delle 9.00 del giorno dopo e' "domani", non "oggi". */
function giorniFra(da, a) {
    const mezzanotte = ms => {
        const p = C.dataRoma(ms).split('-').map(Number);
        return Date.UTC(p[0], p[1] - 1, p[2]);
    };
    return Math.round((mezzanotte(a) - mezzanotte(da)) / GIORNO_MS);
}
/* "domani alle 9.00 (ora italiana)", "oggi alle 9.00 (ora italiana)",
   oppure con la data se manca di piu'. Calcolato sull'istante in cui
   l'email parte davvero (`adesso`), non su quello per cui era prevista:
   un promemoria "del giorno prima" partito alle 7 del mattino stesso
   deve dire "oggi". */
function quandoRelativo(ev, adesso) {
    if (!Number.isFinite(ev.inizio)) return '';
    const g = giorniFra(adesso, ev.inizio);
    return (g === 0 ? 'oggi' : g === 1 ? 'domani' : ev.giorno) + ' alle ' + ev.dalle + ORA_ITALIANA;
}

/* ---------- i collegamenti ----------
   Tutti da baseSito() e da percorsi fissi, con l'evento codificato: un
   collegamento passato da chi chiama non si usa mai (non c'e' niente
   che serva e che non si possa rifare qui). */
function idEventoDi(o) {
    const id = String((o && o.idEvento) || (o && o.evento && o.evento.id) || '');
    return RE_ID_EVENTO.test(id) ? id : '';
}
// /diretta/?e=napoli-2026 (senza un evento valido: /diretta/)
function linkAccesso(idEvento) {
    const url = C.linkDiretta();
    if (!RE_ID_EVENTO.test(String(idEvento || ''))) return url;
    return url + '?e=' + encodeURIComponent(idEvento);
}
/* /diretta/?dimenticata=1: la pagina si apre direttamente su
   "Password dimenticata?" (l'email la scrive la persona). */
function linkDimenticata() {
    return C.baseSito() + '/diretta/?dimenticata=1';
}
function linkPaginaEvento(pagina) {
    const p = String(pagina || '').trim();
    return PAGINA_VALIDA.test(p) ? C.baseSito() + p : '';
}
function linkHome() {
    return C.baseSito() + '/';
}
function linkReimpostazione(dato) {
    const s = String(dato || '');
    const base = C.baseSito() + '/diretta/reimposta.html?';
    if (s.indexOf(base) !== 0 || /[\s"'<>]/.test(s)) throw new Error('collegamento di reimpostazione non valido');
    return s;
}
// l'assistenza: quella passata, altrimenti quella del servizio
function contatti(a) {
    const b = C.assistenza();
    const email = String((a && a.email) || b.email || '').trim();
    const telefono = String((a && a.telefono) || b.telefono || '').trim();
    return { email: /^[^@\s<>"']+@[^@\s<>"']+\.[^@\s<>"']+$/.test(email) ? email : b.email, telefono: telefono.replace(/[^\d +().\/-]/g, '') };
}
function saluto(nome, cognome) {
    return 'Gentile ' + (unaRiga((nome || '') + ' ' + (cognome || '')) || 'partecipante') + ',';
}
/* L'email della persona, come si scrive per entrare: quella gia'
   normalizzata dal servizio; qui solo una riga, senza spazi. */
function emailDi(o) {
    return unaRiga(o && o.email).replace(/\s+/g, '').toLowerCase();
}

/* ---------- i pezzi della pagina (come lib/mail-ngb.js) ---------- */
function involucro(oggetto, anteprima, corpoInterno) {
    const preheader = '<div style="display:none;font-size:1px;color:' + COLORE.sfondo + ';line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">'
        + esc(anteprima || '') + '&#8199;&#65279;&#847; '.repeat(30) + '</div>';
    return '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n'
        + '<html xmlns="http://www.w3.org/1999/xhtml" lang="it" xml:lang="it">\n<head>\n'
        + '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />\n'
        + '<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
        + '<meta name="x-apple-disable-message-reformatting" content="" />\n'
        + '<meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />\n'
        + '<meta name="color-scheme" content="light" />\n<meta name="supported-color-schemes" content="light" />\n'
        + '<title>' + esc(oggetto) + '</title>\n'
        + '<style type="text/css">\n'
        + 'body{margin:0!important;padding:0!important;width:100%!important;}\n'
        + 'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;}\n'
        + 'img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}\n'
        + '@media only screen and (max-width:620px){.wrap{width:100%!important;max-width:100%!important;}'
        + '.px{padding-left:22px!important;padding-right:22px!important;}'
        + '.h1{font-size:25px!important;line-height:32px!important;}'
        + '.lead{font-size:16px!important;line-height:26px!important;}'
        + '.par{-webkit-hyphens:auto;-ms-hyphens:auto;hyphens:auto;}'
        // sul telefono le credenziali restano grandi ma non escono dallo schermo
        + '.cred{font-size:22px!important;letter-spacing:2px!important;}'
        + '.credmail{font-size:18px!important;line-height:26px!important;}'
        + '.btn a{display:block!important;padding:16px 18px!important;}'
        + '.bxet{display:block!important;width:100%!important;padding:6px 0 1px!important;line-height:18px!important;}'
        + '.bxv{display:block!important;width:100%!important;padding:0 0 4px!important;}}\n'
        + '</style>\n</head>\n'
        + '<body style="margin:0;padding:0;background-color:' + COLORE.sfondo + ';">\n'
        + preheader
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:' + COLORE.sfondo + ';">'
        + '<tr><td align="center" style="padding:24px 12px;">'
        + '<table role="presentation" class="wrap" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" '
        + 'style="border-collapse:collapse;width:100%;max-width:' + LARGHEZZA + 'px;margin:0 auto;background-color:' + COLORE.bianco + ';">'
        + corpoInterno
        + '</table></td></tr></table>\n</body>\n</html>';
}

/* La fascia gialla dell'email di prova: in testa, prima di tutto, perche'
   chi la riceve (il gestore) non la scambi per una vera. */
const FRASE_PROVA = 'Così la riceveranno i partecipanti. Nome, email e password qui sotto sono di esempio e non funzionano.';
const FRASE_PROVA_SENZA_PASSWORD = 'Così la riceveranno i partecipanti. Nome ed email qui sotto sono di esempio.';
function fasciaProva(frase) {
    return '<tr><td class="px" bgcolor="' + COLORE.ambraChiaro + '" style="background-color:' + COLORE.ambraChiaro + ';padding:14px ' + LATO + 'px;'
        + 'border-bottom:3px solid ' + COLORE.ambra + ';' + FONTE + 'font-size:14px;line-height:21px;color:' + COLORE.testo + ';">'
        + '<strong style="color:' + COLORE.ambra + ';letter-spacing:1.5px;">EMAIL DI PROVA</strong><br>'
        + esc(frase || FRASE_PROVA)
        + '</td></tr>';
}

function testata(titolo, sommario) {
    return '<tr><td bgcolor="' + COLORE.scuro + '" class="px" style="background-color:' + COLORE.scuro + ';padding:30px ' + LATO + 'px 30px;">'
        + tabella(
            '<tr><td><a href="' + SITO + '" style="text-decoration:none;">'
            + '<img src="' + LOGO_BIANCO + '" width="150" alt="Revilaw - Revisione legale" '
            + 'style="display:block;width:150px;max-width:150px;height:auto;border:0;font-family:' + FONT + ';font-size:18px;font-weight:bold;color:' + COLORE.bianco + ';"></a></td></tr>'
            + spazio(24)
            + '<tr><td style="' + FONTE + 'font-size:12px;line-height:17px;letter-spacing:2px;text-transform:uppercase;color:' + COLORE.chiaroBlu + ';font-weight:bold;">Next Generation Business &middot; Diretta</td></tr>'
            + spazio(12)
            + '<tr><td class="h1" style="' + FONTE + 'font-size:30px;line-height:38px;color:' + COLORE.bianco + ';font-weight:bold;letter-spacing:-0.3px;">' + esc(titolo) + '</td></tr>'
            + spazio(16)
            + '<tr><td class="lead par" style="' + FONTE + 'font-size:18px;line-height:29px;color:' + COLORE.suScuro + ';text-align:justify;-webkit-hyphens:auto;hyphens:auto;">' + esc(sommario) + '</td></tr>'
        )
        + '</td></tr>'
        + '<tr><td bgcolor="' + COLORE.scuro + '" style="background-color:' + COLORE.scuro + ';font-size:0;line-height:0;">'
        + '<img src="' + FASCIA + '" width="' + LARGHEZZA + '" alt="" style="display:block;width:100%;max-width:' + LARGHEZZA + 'px;height:auto;border:0;"></td></tr>';
}

function corpo(righe) {
    return '<tr><td class="px" style="padding:0 ' + LATO + 'px;' + FONTE + '">' + tabella(spazio(30) + righe) + '</td></tr>';
}
function paragrafo(t) {
    return '<tr><td class="par" style="' + FONTE + 'font-size:16px;line-height:27px;color:' + COLORE.testo + ';text-align:justify;-webkit-hyphens:auto;hyphens:auto;">' + esc(t) + '</td></tr>';
}
/* Un paragrafo con dei collegamenti dentro: `html` e' GIA' composto con
   esc() e link(). Questo NON si giustifica: un indirizzo email o un
   collegamento lungo non si spezza, e sul telefono il giustificato
   spalmerebbe le poche parole rimaste sulla riga con buchi enormi. */
function paragrafoHtml(html, piccolo) {
    return '<tr><td style="' + FONTE + (piccolo ? 'font-size:13px;line-height:21px;color:' + COLORE.tenue : 'font-size:16px;line-height:27px;color:' + COLORE.testo)
        + ';text-align:left;">' + html + '</td></tr>';
}
function notaPiccola(t) {
    return '<tr><td class="par" style="' + FONTE + 'font-size:13px;line-height:21px;color:' + COLORE.tenue + ';text-align:justify;-webkit-hyphens:auto;hyphens:auto;">' + esc(t) + '</td></tr>';
}
function occhiello(t) {
    return '<tr><td style="' + FONTE + 'font-size:12px;line-height:18px;letter-spacing:1.6px;text-transform:uppercase;'
        + 'color:' + COLORE.accento + ';font-weight:bold;padding-bottom:8px;border-bottom:1px solid ' + COLORE.bordo + ';">' + esc(t) + '</td></tr>';
}
function rigaBox(et, val, mono) {
    if (!val) return '';
    const stileValore = mono
        ? 'font-family:' + MONO + ';font-size:18px;line-height:27px;letter-spacing:1.5px;font-weight:bold;color:' + COLORE.scuro + ';'
        : FONTE + 'font-size:16px;line-height:27px;color:' + COLORE.testo + ';';
    return '<tr><td class="bxet" width="150" valign="top" style="' + FONTE + 'font-size:12px;line-height:24px;letter-spacing:1px;text-transform:uppercase;color:' + COLORE.blu + ';font-weight:bold;padding:5px 12px 5px 0;">' + esc(et) + '</td>'
        + '<td class="bxv" valign="top" style="' + stileValore + 'padding:5px 0;">'
        + (mono ? '<span style="font-family:' + MONO + ';">' + esc(val) + '</span>' : esc(val)) + '</td></tr>';
}
function box(righe) {
    return '<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        + 'style="border-collapse:collapse;background-color:' + COLORE.chiaro + ';border:1px solid ' + COLORE.bordo + ';border-left:3px solid ' + COLORE.accento + ';">'
        + '<tr><td style="padding:16px 22px;">' + tabella(righe) + '</td></tr></table></td></tr>';
}
/* Il riquadro delle credenziali: il cuore dell'email. Bordo blu pieno,
   etichetta piccola sopra, valore grande sotto: l'email nel carattere
   normale (va a capo se e' lunga), la password a spaziatura fissa. */
function etichettaRiquadro(t) {
    return '<tr><td style="' + FONTE + 'font-size:12px;line-height:18px;letter-spacing:1.6px;text-transform:uppercase;color:' + COLORE.accento + ';font-weight:bold;padding:0 0 4px;">' + esc(t) + '</td></tr>';
}
function valoreEmail(email) {
    return '<tr><td class="credmail" style="' + FONTE + 'font-size:20px;line-height:28px;font-weight:bold;color:' + COLORE.scuro + ';word-break:break-all;padding:0;">' + esc(email) + '</td></tr>';
}
function riquadroCredenziali(email, password) {
    const valorePassword = '<tr><td class="cred" style="font-family:' + MONO + ';font-size:28px;line-height:36px;letter-spacing:3px;font-weight:bold;color:' + COLORE.scuro + ';word-break:break-all;padding:0;">'
        + '<span style="font-family:' + MONO + ';">' + esc(password) + '</span></td></tr>';
    return '<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        + 'style="border-collapse:collapse;background-color:' + COLORE.chiaro + ';border:2px solid ' + COLORE.blu + ';">'
        + '<tr><td style="padding:20px 24px 16px;">' + tabella(etichettaRiquadro('La tua email') + valoreEmail(email)) + '</td></tr>'
        + '<tr><td style="padding:16px 24px 20px;border-top:1px solid ' + COLORE.bordo + ';">' + tabella(etichettaRiquadro('Password') + valorePassword) + '</td></tr>'
        + '</table></td></tr>';
}
// il riquadro con la sola email (promemoria, iscritto anche, reimpostazione)
function riquadroEmail(email) {
    return '<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        + 'style="border-collapse:collapse;background-color:' + COLORE.chiaro + ';border:2px solid ' + COLORE.blu + ';">'
        + '<tr><td style="padding:18px 24px 18px;">' + tabella(etichettaRiquadro('Per entrare, la tua email') + valoreEmail(email)) + '</td></tr>'
        + '</table></td></tr>';
}
function bottone(testoBtn, url, grande) {
    const pad = grande ? '18px 44px' : '14px 30px';
    const dim = grande ? '19px' : '16px';
    return '<tr><td align="center" class="btn" style="text-align:center;">'
        + '<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin:0 auto;"><tr>'
        + '<td align="center" bgcolor="' + COLORE.blu + '" style="background-color:' + COLORE.blu + ';border-radius:6px;">'
        + '<a href="' + esc(url) + '" style="display:inline-block;padding:' + pad + ';font-family:' + FONT
        + ';font-size:' + dim + ';font-weight:bold;letter-spacing:0.3px;color:#ffffff;text-decoration:none;background-color:' + COLORE.blu + ';border-radius:6px;">' + esc(testoBtn) + '</a>'
        + '</td></tr></table></td></tr>';
}
// se il pulsante non si apre (certi programmi di posta aziendali), l'indirizzo scritto per esteso
function indirizzoPerEsteso(url) {
    return paragrafoHtml('Se il pulsante non funziona, copia questo indirizzo nel browser:<br>'
        + '<a href="' + esc(url) + '" style="color:' + COLORE.blu + ';word-break:break-all;">' + esc(url) + '</a>', true);
}
function nota(t) {
    return '<tr><td style="' + FONTE + 'font-size:15px;line-height:24px;color:' + COLORE.testo + ';background-color:' + COLORE.ambraChiaro + ';'
        + 'border-left:3px solid ' + COLORE.ambra + ';padding:12px 16px;">' + esc(t) + '</td></tr>';
}
function elenco(voci) {
    return '<tr><td style="' + FONTE + 'font-size:15px;line-height:24px;color:' + COLORE.testo + ';">'
        + tabella(voci.map(v => '<tr><td width="18" valign="top" style="' + FONTE + 'font-size:15px;line-height:24px;color:' + COLORE.accento + ';padding:3px 0;">&bull;</td>'
            + '<td valign="top" class="par" style="' + FONTE + 'font-size:15px;line-height:24px;color:' + COLORE.testo + ';padding:3px 0;text-align:left;">' + esc(v) + '</td></tr>').join(''))
        + '</td></tr>';
}
function piede(motivo, anno) {
    const riga = (stile, dentro) => '<tr><td align="center" style="' + FONTE + 'font-size:12px;line-height:20px;' + stile + 'text-align:center;">' + dentro + '</td></tr>';
    const stileLink = 'color:' + COLORE.tenue + ';text-decoration:underline;';
    return spazio(36) + '<tr><td class="px" bgcolor="' + COLORE.sfondo + '" align="center" style="background-color:' + COLORE.sfondo + ';padding:24px ' + LATO + 'px 26px;border-top:1px solid ' + COLORE.bordo + ';text-align:center;">'
        + tabella(
            riga('color:' + COLORE.scuro + ';font-weight:bold;', esc(MITTENTE.nome))
            + riga('color:' + COLORE.tenue + ';', esc(MITTENTE.indirizzo) + ' &middot; ' + esc(MITTENTE.cf))
            + spazio(10)
            + riga('color:' + COLORE.tenue + ';', '<a href="' + PRIVACY + '" style="' + stileLink + '">Informativa privacy</a>'
                + ' &nbsp;&middot;&nbsp; <a href="' + SITO + '" style="' + stileLink + '">nextgenerationbusiness.it</a>')
            + spazio(8)
            + riga('color:#94A3B8;', esc(motivo) + ' &nbsp;&middot;&nbsp; &copy; ' + anno)
        )
        + '</td></tr>';
}

/* Le frasi dell'assistenza, uguali in tutte le email. */
function fraseAssistenza(a) {
    return 'Serve aiuto? Scrivi a ' + a.email + (a.telefono ? ' oppure chiama il ' + a.telefono : '') + ': ti rispondiamo il prima possibile.';
}
function assistenzaHtml(a) {
    return paragrafoHtml('Serve aiuto? Scrivi a ' + link('mailto:' + a.email, a.email)
        + (a.telefono ? ' oppure chiama il ' + link('tel:' + a.telefono.replace(/[^\d+]/g, ''), a.telefono) : '')
        + ': ti rispondiamo il prima possibile.');
}
/* "La diretta si raggiunge anche da...": la pagina dell'evento (se ha la
   forma giusta) e la home del sito. */
function fraseAltreStrade(paginaEvento) {
    const pag = linkPaginaEvento(paginaEvento);
    return {
        html: paragrafoHtml('La diretta si raggiunge anche dalla '
            + (pag ? link(pag, 'pagina dell\'evento') + ', con il pulsante «Diretta» nel menu, e dalla ' : '')
            + link(linkHome(), 'home del sito nextgenerationbusiness.it') + '.'),
        testo: 'La diretta si raggiunge anche dalla '
            + (pag ? 'pagina dell\'evento (' + pag + '), con il pulsante «Diretta» nel menu, e dalla ' : '')
            + 'home del sito (' + linkHome() + ').'
    };
}
/* La frase dello spam, uguale in tutte le email della diretta (vedi in
   testa al file). */
const FRASE_SPAM = 'Non trovi l\'email? Controlla nella cartella Spam o Promozioni e segna il mittente come sicuro.';
const SE_NON_ENTRI = [
    'Scrivi l\'email con cui ti sei iscritto (maiuscole e spazi prima o dopo non contano) e copia la password da questa email, senza spazi prima o dopo.',
    'Nella password maiuscole e minuscole contano: «a» e «A» sono lettere diverse.',
    'Se hai perso la password, nella pagina di accesso premi «Password dimenticata?»: ti mandiamo un collegamento per sceglierne una nuova.',
    'Prova con un altro browser aggiornato (Chrome, Safari, Edge o Firefox) o con un altro dispositivo.'
];

/* L'ultimo passaggio, uguale per tutte: niente trattini lunghi, oggetto
   su una riga sola. */
function finisci(oggetto, html, testo) {
    return {
        oggetto: senzaTrattiniLunghi(unaRiga(oggetto)),
        html: senzaTrattiniLunghi(html),
        testo: senzaTrattiniLunghi(testo)
    };
}
function piedeTesto(motivo) {
    return ['--', MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf, motivo, 'Informativa privacy: ' + PRIVACY];
}
function annoDi(adesso) {
    const t = Number(adesso);
    return new Date(Number.isFinite(t) ? t : Date.now()).getFullYear();
}

/* ============================================================
   LE CREDENZIALI
   `evento`: il documento eventi/{id} (titolo, luogo, inizio, fine,
   paginaEvento, id...). `idEvento` (o evento.id) finisce nel
   collegamento. `email`: l'indirizzo con cui si entra (quello
   normalizzato del profilo). `sostituisce` dice se la persona aveva gia'
   ricevuto una password, che adesso non vale piu' (e' un solo account,
   con una sola password): lo si scrive in testa, perche' chi trova due
   email usa quasi sempre la piu' vecchia.
     true | 'evento'  -> credenziali gia' ricevute per QUESTO evento
                          (reinvio, indirizzo corretto...);
     'altro-evento'   -> ricevute per un altro evento (succede solo con
                          il "Reinvia" del gestore: di solito chi ha gia'
                          una password riceve l'avviso «anche», senza);
     'precedente'     -> nessuna email di credenziali, ma una password
                          c'era: scelta con «Password dimenticata?», data
                          a voce dal gestore o gia' usata per entrare
                          (anche qui solo con il "Reinvia" del gestore:
                          vedi sostituzione() in lib/diretta-invio.js).
   ============================================================ */
const FRASE_SOSTITUISCE = 'Questa email sostituisce le precedenti: la password che avevi ricevuto prima non è più valida.';
const FRASE_ALTRO_EVENTO = 'Avevi già ricevuto le credenziali per un altro evento: l\'email per entrare è la stessa, '
    + 'la password è nuova e quella di prima non è più valida. Da adesso usa questa, per tutti gli eventi.';
const FRASE_PRECEDENTE = 'Questa password sostituisce quella che usavi finora (anche se l\'avevi scelta tu con «Password dimenticata?»): '
    + 'quella di prima non è più valida. Da adesso usa questa, per tutti gli eventi.';
function fraseSostituzione(v) {
    if (v === true || v === 'evento') return FRASE_SOSTITUISCE;
    if (v === 'altro-evento') return FRASE_ALTRO_EVENTO;
    if (v === 'precedente') return FRASE_PRECEDENTE;
    return '';
}
/* «Per entrare nella diretta: vai su <indirizzo>, scrivi la tua email
   <email> e questa password: <password>». Nell'HTML l'indirizzo e' un
   collegamento e la password sta a spaziatura fissa. */
function frasePerEntrare(email, password) {
    const pagina = C.linkDiretta();
    return {
        testo: 'Per entrare nella diretta: vai su ' + pagina + ', scrivi la tua email ' + email + ' e questa password: ' + password,
        html: paragrafoHtml(esc('Per entrare nella diretta: vai su ') + link(pagina, pagina) + esc(', scrivi la tua email ')
            + '<strong style="word-break:break-all;">' + esc(email) + '</strong>' + esc(' e questa password: ')
            + '<span style="font-family:' + MONO + ';font-size:18px;font-weight:bold;letter-spacing:1.5px;color:' + COLORE.scuro + ';">' + esc(password) + '</span>')
    };
}

function credenziali(opz) {
    const o = opz || {};
    const ev = datiEvento(o.evento);
    const email = emailDi(o);
    const password = String(o.password || '');
    const accedi = linkAccesso(idEventoDi(o));
    const a = contatti(o.assistenza);
    const altre = fraseAltreStrade(o.paginaEvento || (o.evento && o.evento.paginaEvento));
    const quando = [ev.giorno, orario(ev)].filter(Boolean).join(', ');
    const oggetto = (o.prova ? '[PROVA] ' : '') + 'Le tue credenziali per la diretta - ' + ev.titolo;
    const sommario = saluto(o.nome, o.cognome) + ' ecco come entrare nella diretta di ' + ev.titolo
        + (ev.giorno ? ', ' + ev.giorno + (ev.dalle ? ' dalle ' + ev.dalle + ORA_ITALIANA : '') : '') + ': la tua email e la password qui sotto.';
    const fraseSostituisce = fraseSostituzione(o.sostituisce);
    const perEntrare = frasePerEntrare(email, password);
    const fraseCopia = 'La password va scritta così com\'è: maiuscole e minuscole contano. È la stessa per tutti gli eventi a cui sei iscritto.';
    const frasePersonali = 'Le credenziali sono personali: ti chiediamo di non inoltrare questa email.';

    const html = involucro(oggetto, 'La tua email e la password per la diretta' + (ev.giorno ? ' di ' + ev.giorno : '') + '.',
        (o.prova ? fasciaProva(FRASE_PROVA) : '')
        + testata('Le tue credenziali per la diretta', sommario)
        + corpo(
            (fraseSostituisce ? nota(fraseSostituisce) + spazio(22) : '')
            + box(
                rigaBox('Evento', ev.titolo)
                + rigaBox('Data', ev.giorno)
                + rigaBox('Orario', orario(ev))
                + rigaBox('In diretta da', ev.luogo)
            )
            + spazio(26)
            + perEntrare.html
            + spazio(22)
            + occhiello('Le tue credenziali')
            + spazio(12)
            + riquadroCredenziali(email, password)
            + spazio(14)
            + notaPiccola(fraseCopia)
            + spazio(28)
            + bottone('Accedi alla diretta', accedi, true)
            + spazio(14)
            + indirizzoPerEsteso(accedi)
            + spazio(24)
            + altre.html
            + spazio(30)
            + occhiello('Se non riesci a entrare')
            + spazio(8)
            + elenco(SE_NON_ENTRI)
            + spazio(18)
            + assistenzaHtml(a)
            + spazio(18)
            + notaPiccola(FRASE_SPAM)
            + spazio(10)
            + notaPiccola(frasePersonali)
        )
        + piede(MOTIVO, annoDi(o.adesso)));

    const testo = [
        o.prova ? 'EMAIL DI PROVA: ' + FRASE_PROVA : '',
        'LE TUE CREDENZIALI PER LA DIRETTA',
        sommario,
        fraseSostituisce,
        'Evento: ' + ev.titolo + (quando ? '\nQuando: ' + quando : '') + (ev.luogo ? '\nIn diretta da: ' + ev.luogo : ''),
        perEntrare.testo,
        'La tua email: ' + email + '\nPassword: ' + password,
        fraseCopia,
        'Accedi alla diretta: ' + accedi,
        altre.testo,
        'Se non riesci a entrare:\n' + SE_NON_ENTRI.map(v => '- ' + v).join('\n'),
        fraseAssistenza(a),
        FRASE_SPAM,
        frasePersonali
    ].concat(piedeTesto(MOTIVO)).filter(Boolean).join('\n\n');
    return finisci(oggetto, html, testo);
}

/* ============================================================
   ISCRITTO ANCHE A UN ALTRO EVENTO
   Per chi ha GIA' una password (un account solo per tutti gli eventi):
   iscritto a un evento in piu' (dal modulo del sito o dal file della
   gestione), non riceve una password nuova, che cancellerebbe quella
   che ha. Riceve questa: «Sei iscritto anche a <evento>: entra con la
   tua email e la password che hai già; se non la ricordi usa "Password
   dimenticata?"». La password qui non c'e' MAI, nemmeno se qualcuno la
   passa.
   ============================================================ */
function iscrittoAnche(opz) {
    const o = opz || {};
    const ev = datiEvento(o.evento);
    const email = emailDi(o);
    const accedi = linkAccesso(idEventoDi(o));
    const dimenticata = linkDimenticata();
    const a = contatti(o.assistenza);
    const altre = fraseAltreStrade(o.paginaEvento || (o.evento && o.evento.paginaEvento));
    const quando = [ev.giorno, orario(ev)].filter(Boolean).join(', ');
    const oggetto = (o.prova ? '[PROVA] ' : '') + 'Sei iscritto anche a ' + ev.titolo;
    const sommario = saluto(o.nome, o.cognome) + ' sei iscritto anche alla diretta di ' + ev.titolo
        + (ev.giorno ? ', ' + ev.giorno + (ev.dalle ? ' dalle ' + ev.dalle + ORA_ITALIANA : '') : '') + '.';
    const inizio = 'Sei iscritto anche a ' + ev.titolo + ': entra con la tua email e la password che hai già; se non la ricordi usa ';
    const fraseStessa = 'La password è la stessa per tutti gli eventi a cui sei iscritto: non ne arriva una nuova.';

    const html = involucro(oggetto, sommario,
        (o.prova ? fasciaProva(FRASE_PROVA_SENZA_PASSWORD) : '')
        + testata('Sei iscritto anche a questa diretta', sommario)
        + corpo(
            box(
                rigaBox('Evento', ev.titolo)
                + rigaBox('Data', ev.giorno)
                + rigaBox('Orario', orario(ev))
                + rigaBox('In diretta da', ev.luogo)
            )
            + spazio(26)
            + paragrafoHtml(esc(inizio) + '"' + link(dimenticata, 'Password dimenticata?') + '".')
            + spazio(22)
            + riquadroEmail(email)
            + spazio(14)
            + notaPiccola(fraseStessa)
            + spazio(28)
            + bottone('Accedi alla diretta', accedi, true)
            + spazio(14)
            + indirizzoPerEsteso(accedi)
            + spazio(24)
            + altre.html
            + spazio(22)
            + assistenzaHtml(a)
            + spazio(18)
            + notaPiccola(FRASE_SPAM)
        )
        + piede(MOTIVO, annoDi(o.adesso)));

    const testo = [
        o.prova ? 'EMAIL DI PROVA: ' + FRASE_PROVA_SENZA_PASSWORD : '',
        'SEI ISCRITTO ANCHE A QUESTA DIRETTA',
        sommario,
        'Evento: ' + ev.titolo + (quando ? '\nQuando: ' + quando : '') + (ev.luogo ? '\nIn diretta da: ' + ev.luogo : ''),
        inizio + '"Password dimenticata?" (' + dimenticata + ').',
        'La tua email: ' + email,
        fraseStessa,
        'Accedi alla diretta: ' + accedi,
        altre.testo,
        fraseAssistenza(a),
        FRASE_SPAM
    ].concat(piedeTesto(MOTIVO)).filter(Boolean).join('\n\n');
    return finisci(oggetto, html, testo);
}

/* ============================================================
   I PROMEMORIA: 'giorno' (il giorno prima) e 'ora' (un'ora prima)
   Portano il collegamento e l'email con cui si entra, MAI la password:
   anche se chi chiama la passasse, qui non la si legge nemmeno.
   Arrivano solo a chi ha gia' ricevuto le credenziali (lo decide
   diretta-invio.js), e per chi le ha perse c'e' il collegamento diretto
   a "Password dimenticata?". Le parole ("domani", "oggi", "e'
   cominciata") si scelgono sull'istante in cui l'email parte davvero
   (`adesso`), non su quello per cui era prevista.
   ============================================================ */
function promemoria(opz) {
    const o = opz || {};
    const tipo = o.tipo === 'ora' ? 'ora' : 'giorno';
    const ev = datiEvento(o.evento);
    const adesso = Number.isFinite(Number(o.adesso)) ? Number(o.adesso) : Date.now();
    const email = emailDi(o);
    const accedi = linkAccesso(idEventoDi(o));
    const dimenticata = linkDimenticata();
    const a = contatti(o.assistenza);
    const altre = fraseAltreStrade(o.paginaEvento || (o.evento && o.evento.paginaEvento));
    const giorni = Number.isFinite(ev.inizio) ? giorniFra(adesso, ev.inizio) : NaN;
    const relativo = quandoRelativo(ev, adesso);
    const cominciata = Number.isFinite(ev.inizio) && adesso >= ev.inizio;
    const quando = [ev.giorno, orario(ev)].filter(Boolean).join(', ');
    let titolo, sommario, oggetto;
    if (tipo === 'giorno') {
        titolo = giorni === 0 ? 'Oggi la diretta' : giorni === 1 ? 'Domani la diretta' : 'Promemoria della diretta';
        oggetto = (giorni === 0 ? 'Oggi in diretta' : giorni === 1 ? 'Domani la diretta' : 'Promemoria della diretta') + ' - ' + ev.titolo;
        sommario = saluto(o.nome, o.cognome) + ' ' + (relativo ? relativo + ' comincia' : 'sta per cominciare')
            + ' la diretta di ' + ev.titolo + '. Ti ricordiamo come collegarti.';
    } else if (cominciata) {
        titolo = 'La diretta è cominciata';
        oggetto = 'In diretta adesso - ' + ev.titolo;
        sommario = saluto(o.nome, o.cognome) + ' la diretta di ' + ev.titolo + ' è in onda: puoi entrare quando vuoi.';
    } else {
        titolo = 'Tra poco si va in onda';
        oggetto = 'Tra poco in diretta - ' + ev.titolo;
        sommario = saluto(o.nome, o.cognome) + ' la diretta di ' + ev.titolo + (relativo ? ' comincia ' + relativo : ' sta per cominciare')
            + '. Puoi già entrare: la pagina ti mostra il conto alla rovescia e parte da sola.';
    }
    if (o.prova) oggetto = '[PROVA] ' + oggetto;
    const frasePassword = 'Per entrare scrivi la tua email e la password che ti abbiamo mandato con le credenziali.';
    const fraseDimenticata = 'Non trovi la password? Usa «Password dimenticata?» nella pagina di accesso';
    const dopoDimenticata = ': ti mandiamo un collegamento per sceglierne una nuova.';

    const html = involucro(oggetto, sommario,
        (o.prova ? fasciaProva(FRASE_PROVA_SENZA_PASSWORD) : '')
        + testata(titolo, sommario)
        + corpo(
            box(
                rigaBox('Evento', ev.titolo)
                + rigaBox('Data', ev.giorno)
                + rigaBox('Orario', orario(ev))
            )
            + spazio(22)
            + riquadroEmail(email)
            + spazio(28)
            + bottone('Accedi alla diretta', accedi, true)
            + spazio(14)
            + indirizzoPerEsteso(accedi)
            + spazio(24)
            + paragrafoHtml(esc(frasePassword) + ' ' + esc('Non trovi la password? Usa ')
                + link(dimenticata, '«Password dimenticata?»') + esc(' nella pagina di accesso' + dopoDimenticata))
            + spazio(16)
            + altre.html
            + spazio(22)
            + assistenzaHtml(a)
            + spazio(18)
            + notaPiccola(FRASE_SPAM)
        )
        + piede(MOTIVO, annoDi(adesso)));

    const testo = [
        o.prova ? 'EMAIL DI PROVA: ' + FRASE_PROVA_SENZA_PASSWORD : '',
        titolo.toUpperCase(),
        sommario,
        'Evento: ' + ev.titolo + (quando ? '\nQuando: ' + quando : '') + '\nLa tua email: ' + email,
        'Accedi alla diretta: ' + accedi,
        frasePassword + ' ' + fraseDimenticata + ': ' + dimenticata,
        altre.testo,
        fraseAssistenza(a),
        FRASE_SPAM
    ].concat(piedeTesto(MOTIVO)).filter(Boolean).join('\n\n');
    return finisci(oggetto, html, testo);
}

/* ============================================================
   LA REIMPOSTAZIONE DELLA PASSWORD
   Per i partecipanti ricorda l'email con cui si entra (`email`, se
   arriva); per i gestori e' l'accesso alla gestione (entrano anche loro
   con la loro email, ma il riquadro non serve).
   ============================================================ */
function reimpostazione(opz) {
    const o = opz || {};
    const collegamento = linkReimpostazione(o.link);
    const a = contatti(o.assistenza);
    const gestore = !!o.perGestore;
    const email = gestore ? '' : emailDi(o);
    const oggetto = gestore
        ? 'Accesso alla gestione della diretta - Next Generation Business'
        : 'Nuova password per la diretta - Next Generation Business';
    const titolo = gestore ? 'Accesso alla gestione della diretta' : 'Scegli una nuova password';
    const sommario = gestore
        ? (unaRiga(o.nome) ? 'Gentile ' + unaRiga(o.nome) + ', per' : 'Per') + ' entrare nella gestione della diretta di Next Generation Business scegli la tua password dal pulsante qui sotto.'
        : saluto(o.nome, o.cognome) + ' abbiamo ricevuto la richiesta di una nuova password per la diretta di Next Generation Business.';
    const fraseValidita = 'Il collegamento vale un\'ora e si può usare una volta sola.';
    const fraseIgnora = gestore
        ? 'Se non hai chiesto tu l\'accesso, ignora questa email: senza il collegamento nessuno può entrare.'
        : 'Se non hai chiesto tu una nuova password, ignora questa email: quella attuale resta valida.';
    const fraseDopo = 'Poi entri nella diretta con la tua email e la password nuova, per tutti gli eventi a cui sei iscritto.';
    const etichetta = gestore ? 'Imposta la password' : 'Scegli la nuova password';

    const html = involucro(oggetto, sommario,
        testata(titolo, sommario)
        + corpo(
            (email ? riquadroEmail(email) + spazio(28) : '')
            + bottone(etichetta, collegamento, true)
            + spazio(14)
            + indirizzoPerEsteso(collegamento)
            + spazio(24)
            + (gestore ? '' : paragrafo(fraseDopo) + spazio(14))
            + paragrafo(fraseValidita + ' ' + fraseIgnora)
            + spazio(18)
            + assistenzaHtml(a)
            + spazio(18)
            + notaPiccola(FRASE_SPAM)
        )
        + piede(gestore ? MOTIVO_GESTORE : MOTIVO, annoDi(o.adesso)));

    const testo = [
        titolo.toUpperCase(),
        sommario,
        email ? 'La tua email: ' + email : '',
        etichetta + ': ' + collegamento,
        gestore ? '' : fraseDopo,
        fraseValidita + ' ' + fraseIgnora,
        fraseAssistenza(a),
        FRASE_SPAM
    ].concat(piedeTesto(gestore ? MOTIVO_GESTORE : MOTIVO)).filter(Boolean).join('\n\n');
    return finisci(oggetto, html, testo);
}

module.exports = {
    credenziali, iscrittoAnche, promemoria, reimpostazione,
    // per le prove e per chi compone le email di prova
    esc, datiEvento, linkPaginaEvento, linkAccesso, linkDimenticata, giorniFra,
    PAGINA_VALIDA, MONO, FRASE_SOSTITUISCE, FRASE_ALTRO_EVENTO, FRASE_PRECEDENTE, FRASE_SPAM
};
