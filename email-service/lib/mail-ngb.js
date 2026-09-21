/* ============================================================
   Mail NGB composte DAL SERVIZIO (formato Next Generation Business)
   ------------------------------------------------------------
   Le mail che partono dall'area riservata arrivano gia' composte dal
   browser (newsletter-format.js). Qui stanno invece le mail che il
   servizio deve comporre DA SOLO, perche' le innesca un endpoint
   PUBBLICO che non puo' accettare HTML gia' pronto (chiunque potrebbe
   usarlo per spedire qualunque cosa a nome dello studio):

     - conferma di un'iscrizione arrivata dal FORM del sito, con il
       collegamento personale per modificarla o annullarla;
     - conferma delle VARIAZIONI dopo il modulo "completa i dati",
       con il riepilogo dei partecipanti e lo stesso collegamento.

   E' una copia RIDOTTA del formato di newsletter-format.js (stessa
   testata blu con il marchio, stessa fascia, stesso riquadro e piede):
   se di la' cambia l'impostazione, va aggiornata anche qui.
   ============================================================ */

// gli orari letti dalla frase: servono a mettere gli incontri in fila
const ORARI = require('./orari-b2b');

const C = {
    scuro: '#0A2844', blu: '#164068', accento: '#2A5A85', chiaroBlu: '#5B89B8',
    suScuro: '#C8DAEA', testo: '#1E293B', tenue: '#475569',
    bordo: '#E2E8F0', sfondo: '#F1F5F9', chiaro: '#F4F8FB', bianco: '#FFFFFF'
};
const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
const FONTE = 'font-family:' + FONT + ';mso-line-height-rule:exactly;';
const LARGHEZZA = 600;
const LATO = 40;
const LOGO_BIANCO = 'https://nextgenerationbusiness.it/assets/logo-revilaw-bianco.png';
const FASCIA = 'https://nextgenerationbusiness.it/assets/newsletter/fascia-filigrana.png';
const SITO = 'https://nextgenerationbusiness.it';
const PRIVACY = 'https://www.iubenda.com/privacy-policy/40996386';
const MITTENTE = { nome: 'Revilaw S.p.A.', indirizzo: 'Via XX Settembre 9 - 37129 Verona', cf: 'C.F. 04641610235' };

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function spazio(h) {
    return '<tr><td height="' + h + '" style="font-size:0;line-height:0;height:' + h + 'px;">&nbsp;</td></tr>';
}
function tabella(righe) {
    return '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">' + righe + '</table>';
}

/* Il nome dell'evento dal titolo del modulo ("Napoli 2 Ottobre 2026 -
   Manifestazione di interesse" -> "Napoli 2 Ottobre 2026"). */
function nomeEvento(pagina) {
    const p = String(pagina || '').split(' - ')[0].trim();
    return p || 'Next Generation Business';
}

function involucro(oggetto, anteprima, corpoInterno) {
    const preheader = '<div style="display:none;font-size:1px;color:' + C.sfondo + ';line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">'
        + esc(anteprima || '') + '&#8199;&#65279;&#847; '.repeat(30) + '</div>';
    return '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n'
        + '<html xmlns="http://www.w3.org/1999/xhtml" lang="it" xml:lang="it">\n<head>\n'
        + '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />\n'
        + '<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
        + '<meta name="x-apple-disable-message-reformatting" content="" />\n'
        + '<meta name="color-scheme" content="light" />\n<meta name="supported-color-schemes" content="light" />\n'
        + '<title>' + esc(oggetto) + '</title>\n'
        + '<style type="text/css">\n'
        + 'body{margin:0!important;padding:0!important;width:100%!important;}\n'
        + 'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;}\n'
        + 'img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}\n'
        + '@media only screen and (max-width:620px){.wrap{width:100%!important;max-width:100%!important;}'
        + '.px{padding-left:24px!important;padding-right:24px!important;}'
        + '.h1{font-size:24px!important;line-height:31px!important;}'
        + '.lead{font-size:16px!important;line-height:26px!important;}'
        /* Il giustificato resta anche sul telefono: i messaggi vanno sempre a
           bandiera doppia. La sillabazione, dove il lettore la applica, evita i
           buchi bianchi sulla colonna stretta. */
        + '.par{-webkit-hyphens:auto;-ms-hyphens:auto;hyphens:auto;}'
        /* le righe del riquadro si impilano: etichetta sopra, valore sotto */
        + '.bxet{display:block!important;width:100%!important;padding:6px 0 1px!important;line-height:18px!important;}'
        + '.bxv{display:block!important;width:100%!important;padding:0 0 4px!important;}}\n'
        + '</style>\n</head>\n'
        + '<body style="margin:0;padding:0;background-color:' + C.sfondo + ';">\n'
        + preheader
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:' + C.sfondo + ';">'
        + '<tr><td align="center" style="padding:24px 12px;">'
        + '<table role="presentation" class="wrap" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" '
        + 'style="border-collapse:collapse;width:100%;max-width:' + LARGHEZZA + 'px;margin:0 auto;background-color:' + C.bianco + ';">'
        + corpoInterno
        + '</table></td></tr></table>\n</body>\n</html>';
}

function testata(titolo, sommario) {
    return '<tr><td bgcolor="' + C.scuro + '" class="px" style="background-color:' + C.scuro + ';padding:30px ' + LATO + 'px 30px;">'
        + tabella(
            '<tr><td><a href="' + SITO + '" style="text-decoration:none;">'
            + '<img src="' + LOGO_BIANCO + '" width="150" alt="Revilaw - Revisione legale" '
            + 'style="display:block;width:150px;max-width:150px;height:auto;border:0;font-family:' + FONT + ';font-size:18px;font-weight:bold;color:' + C.bianco + ';"></a></td></tr>'
            + spazio(24)
            + '<tr><td style="' + FONTE + 'font-size:12px;line-height:17px;letter-spacing:2px;text-transform:uppercase;color:' + C.chiaroBlu + ';font-weight:bold;">Next Generation Business</td></tr>'
            + spazio(12)
            + '<tr><td class="h1" style="' + FONTE + 'font-size:30px;line-height:38px;color:' + C.bianco + ';font-weight:bold;letter-spacing:-0.3px;">' + esc(titolo) + '</td></tr>'
            + spazio(16)
            + '<tr><td class="lead par" style="' + FONTE + 'font-size:18px;line-height:29px;color:' + C.suScuro + ';text-align:justify;">' + esc(sommario) + '</td></tr>'
        )
        + '</td></tr>'
        + '<tr><td bgcolor="' + C.scuro + '" style="background-color:' + C.scuro + ';font-size:0;line-height:0;">'
        + '<img src="' + FASCIA + '" width="' + LARGHEZZA + '" alt="" style="display:block;width:100%;max-width:' + LARGHEZZA + 'px;height:auto;border:0;"></td></tr>';
}

/* Una riga del riquadro: etichetta a sinistra, valore a destra. Sul telefono
   le due celle si impilano (classi bxet/bxv nel foglio di stile): con la
   colonna dell'etichetta larga 150px su 400 di schermo, un indirizzo finiva su
   quattro righe strette. */
function rigaBox(et, val) {
    if (!val) return '';
    return '<tr><td class="bxet" width="150" valign="top" style="' + FONTE + 'font-size:12px;line-height:24px;letter-spacing:1px;text-transform:uppercase;color:' + C.blu + ';font-weight:bold;padding:5px 12px 5px 0;">' + esc(et) + '</td>'
        + '<td class="bxv" valign="top" style="' + FONTE + 'font-size:16px;line-height:27px;color:' + C.testo + ';padding:5px 0;">' + esc(val) + '</td></tr>';
}
function box(righe) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        + 'style="border-collapse:collapse;background-color:' + C.chiaro + ';border:1px solid ' + C.bordo + ';border-left:3px solid ' + C.accento + ';">'
        + '<tr><td style="padding:16px 22px;">' + tabella(righe) + '</td></tr></table>';
}
function paragrafo(t) {
    return '<tr><td class="par" style="' + FONTE + 'font-size:16px;line-height:27px;color:' + C.testo + ';text-align:justify;">' + esc(t) + '</td></tr>';
}
function bottone(testoBtn, url) {
    return '<tr><td align="center" style="text-align:center;">'
        + '<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin:0 auto;"><tr>'
        + '<td align="center" bgcolor="' + C.blu + '" style="background-color:' + C.blu + ';">'
        + '<a href="' + esc(url) + '" style="display:inline-block;padding:14px 30px;font-family:' + FONT
        + ';font-size:16px;font-weight:bold;letter-spacing:0.3px;color:#ffffff;text-decoration:none;background-color:' + C.blu + ';">' + esc(testoBtn) + '</a>'
        + '</td></tr></table></td></tr>';
}
/* Un'etichetta di sezione: piccola, maiuscola, con il filetto sotto. Serve a
   staccare "i Suoi incontri" dai dati dell'evento, che sono due cose diverse e
   in un riquadro solo si leggevano come una lista sola. */
function occhiello(t) {
    return '<tr><td style="' + FONTE + 'font-size:12px;line-height:18px;letter-spacing:1.6px;text-transform:uppercase;'
        + 'color:' + C.accento + ';font-weight:bold;padding-bottom:8px;border-bottom:1px solid ' + C.bordo + ';">' + esc(t) + '</td></tr>';
}
/* Gli incontri come un orario: a sinistra l'ora, a destra l'argomento. E'
   la stessa forma del foglio da presentare al desk, ed e' quella in cui si
   legge un programma - "INCONTRO 1, INCONTRO 2" numerava le righe senza dire
   niente che l'ora non dicesse gia'. */
function tabellaIncontri(voci) {
    const riga = v => '<tr>'
        + '<td width="110" valign="top" style="' + FONTE + 'font-size:16px;line-height:26px;color:' + C.blu
        + ';white-space:nowrap;font-weight:bold;padding:7px 14px 7px 0;border-bottom:1px solid ' + C.bordo + ';">'
        + esc(v.ora || '&nbsp;').replace('&amp;nbsp;', '&nbsp;') + '</td>'
        + '<td valign="top" style="' + FONTE + 'font-size:16px;line-height:26px;color:' + C.scuro
        + ';font-weight:bold;padding:7px 0;border-bottom:1px solid ' + C.bordo + ';">' + esc(v.nome)
        // chi tiene il tavolo, quando lo sappiamo: e' la persona che l'ospite
        // trovera' seduta di la', e cercarla per nome e' piu' facile che
        // cercare "il tavolo del merito creditizio"
        + (v.con ? '<br><span style="' + FONTE + 'font-size:14px;line-height:22px;color:' + C.tenue
            + ';font-weight:normal;">con ' + esc(v.con) + '</span>' : '')
        /* CHI VIENE per l'impresa: e' un'altra cosa da "chi tiene il tavolo",
           e con l'invito per azienda e' l'informazione che al desk serve di
           piu' - a quel tavolo, a quell'ora, si presenta questa persona. */
        + (v.per ? '<br><span style="' + FONTE + 'font-size:14px;line-height:22px;color:' + C.scuro
            + ';font-weight:normal;">per ' + esc(v.per) + '</span>' : '')
        + '</td></tr>';
    return '<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        + 'style="border-collapse:collapse;">' + voci.map(riga).join('') + '</table></td></tr>';
}
function corpo(righe) {
    return '<tr><td class="px" style="padding:0 ' + LATO + 'px;' + FONTE + '">' + tabella(spazio(30) + righe) + '</td></tr>';
}
function piede(motivo) {
    const riga = (stile, dentro) => '<tr><td align="center" style="' + FONTE + 'font-size:12px;line-height:20px;' + stile + 'text-align:center;">' + dentro + '</td></tr>';
    const link = 'color:' + C.tenue + ';text-decoration:underline;';
    return spazio(36) + '<tr><td class="px" bgcolor="' + C.sfondo + '" align="center" style="background-color:' + C.sfondo + ';padding:24px ' + LATO + 'px 26px;border-top:1px solid ' + C.bordo + ';text-align:center;">'
        + tabella(
            riga('color:' + C.scuro + ';font-weight:bold;', esc(MITTENTE.nome))
            + riga('color:' + C.tenue + ';', esc(MITTENTE.indirizzo) + ' &middot; ' + esc(MITTENTE.cf))
            + spazio(10)
            + riga('color:' + C.tenue + ';', '<a href="' + PRIVACY + '" style="' + link + '">Informativa privacy</a>'
                + ' &nbsp;&middot;&nbsp; <a href="' + SITO + '" style="' + link + '">nextgenerationbusiness.it</a>')
            + spazio(8)
            + riga('color:#94A3B8;', esc(motivo) + ' &nbsp;&middot;&nbsp; &copy; ' + new Date().getFullYear())
        )
        + '</td></tr>';
}
const MOTIVO = 'Ricevi questa email come conferma della tua iscrizione all\'evento: non è una comunicazione promozionale.';

/* --- Conferma di un'iscrizione arrivata dal form del sito ---
   `dati`: { nome, cognome, email, azienda, pagina, data, modalita }; `link` e'
   il collegamento personale firmato per modificare o annullare.
   `modalita` vale 'online' quando il modulo la chiede e la persona ha scelto
   di seguire da remoto: allora non c'e' nessun posto in sala da riservare, e
   la mail non deve dire il contrario. Assente o 'presenza' = in sala, com'era
   ogni iscrizione fino a Napoli.
   `listaAttesa` aggiunge il perche': non e' una preferenza, e' una sala piena.
   Chi si e' iscritto online resta in coda per un posto in presenza, e la mail
   lo dice - altrimenti la coda esiste solo per chi organizza, e chi aspetta
   non sa di aspettare. Vale solo accanto a 'online': a un evento che si segue
   solo da remoto non c'e' nessuna coda, e la riga non compare. */
function confermaSito(dati, link) {
    const evento = nomeEvento(dati.pagina);
    const nomeCompleto = ((dati.nome || '') + ' ' + (dati.cognome || '')).trim();
    const online = String((dati && dati.modalita) || '').toLowerCase() === 'online';
    const oggetto = 'Iscrizione ricevuta - Next Generation Business, ' + evento;
    const saluto = 'Gentile ' + (nomeCompleto || 'ospite') + ',';
    const sommario = saluto + ' la tua iscrizione al convegno Next Generation Business di ' + evento + ' è stata registrata'
        + (online ? ' per la partecipazione online' : '') + '.';
    const attesa = online && dati && dati.listaAttesa === true;
    const apertura = online
        ? 'La tua partecipazione online è registrata. Qualche giorno prima dell\'evento ti invieremo il collegamento e le istruzioni per seguirlo.'
            + (attesa ? ' I posti in sala sono esauriti, ma ti abbiamo inserito in lista d\'attesa: se se ne libera uno ti scriviamo, e decidi tu se venire di persona.' : '')
            + ' Qui sotto trovi il riepilogo: se qualcosa cambia, dal pulsante puoi correggere i tuoi dati o annullare l\'iscrizione, senza scriverci.'
        : 'Il tuo posto è riservato. Qui sotto trovi il riepilogo: se qualcosa cambia, dal pulsante puoi correggere i tuoi dati o annullare l\'iscrizione, senza scriverci.';
    const html = involucro(oggetto, 'La tua iscrizione a ' + evento + ' è registrata: ecco il riepilogo.',
        testata('Iscrizione ricevuta', sommario)
        + corpo(
            paragrafo(apertura)
            + spazio(22)
            + '<tr><td>' + box(
                rigaBox('Evento', 'Next Generation Business - ' + evento)
                + rigaBox('Partecipazione', online ? (attesa ? 'Online - in lista d\'attesa per la sala' : 'Online') : '')
                + rigaBox('Iscritto', nomeCompleto)
                + rigaBox('Azienda', dati.azienda)
                + rigaBox('Registrata il', String(dati.data || '').slice(0, 16))
            ) + '</td></tr>'
            + spazio(28)
            + bottone('Modifica o annulla l\'iscrizione', link)
            + spazio(24)
            + '<tr><td class="par" style="' + FONTE + 'font-size:13px;line-height:21px;color:' + C.tenue + ';text-align:justify;">Il collegamento è personale e vale solo per questa iscrizione: ti chiediamo di non inoltrarlo. '
            + (online ? 'Ci colleghiamo insieme.' : 'Ti aspettiamo a ' + esc(evento.split(' ')[0]) + '.') + '</td></tr>'
        )
        + piede(MOTIVO));
    const testo = ['ISCRIZIONE RICEVUTA', sommario, apertura,
        'Evento: Next Generation Business - ' + evento
        + (online ? '\nPartecipazione: Online' + (attesa ? ' - in lista d\'attesa per la sala' : '') : '')
        + (nomeCompleto ? '\nIscritto: ' + nomeCompleto : '')
        + (dati.azienda ? '\nAzienda: ' + dati.azienda : ''),
        'Modifica o annulla l\'iscrizione: ' + link,
        'Il collegamento è personale e vale solo per questa iscrizione: ti chiediamo di non inoltrarlo.',
        '--', MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf, MOTIVO,
        'Informativa privacy: ' + PRIVACY].join('\n\n');
    return { oggetto: oggetto, html: html, testo: testo };
}

/* --- Conferma delle variazioni dopo il modulo "completa i dati" ---
   `dati`: { pagina, intestatario, attivi: [{nome, cognome, azienda}],
   postiAttivi, senzaNome, annullati }; `link` come sopra. */
function confermaVariazioni(dati, link) {
    const evento = nomeEvento(dati.pagina);
    const oggetto = 'Iscrizione aggiornata - Next Generation Business, ' + evento;
    const saluto = 'Gentile ' + (dati.intestatario || 'ospite') + ',';
    const sommario = saluto + ' abbiamo ricevuto i dati e aggiornato la tua iscrizione al convegno di ' + evento + '. Ecco come risulta adesso.';
    const partecipanti = (dati.attivi || []).map((p, i) => {
        const chi = ((p.nome || '') + ' ' + (p.cognome || '')).trim() || 'partecipante ' + (i + 1);
        return rigaBox('Partecipante ' + (i + 1), chi + (p.azienda ? ' - ' + p.azienda : ''));
    }).join('');
    const html = involucro(oggetto, 'Iscrizione aggiornata: ' + dati.postiAttivi + (dati.postiAttivi === 1 ? ' posto' : ' posti') + ' per ' + evento + '.',
        testata('Iscrizione aggiornata', sommario)
        + corpo(
            '<tr><td>' + box(
                rigaBox('Evento', 'Next Generation Business - ' + evento)
                + rigaBox('Posti attivi', String(dati.postiAttivi))
                + partecipanti
                + (dati.senzaNome > 0 ? rigaBox('Da nominare', String(dati.senzaNome) + (dati.senzaNome === 1 ? ' posto' : ' posti')) : '')
                + (dati.annullati > 0 ? rigaBox('Annullati', String(dati.annullati) + (dati.annullati === 1 ? ' posto' : ' posti')) : '')
            ) + '</td></tr>'
            + spazio(24)
            + paragrafo('Se qualcosa cambia ancora, dal pulsante qui sotto puoi correggere i dati, nominare i posti rimasti o annullare la partecipazione di chi non potrà esserci.')
            + spazio(24)
            + bottone('Modifica o annulla', link)
        )
        + piede(MOTIVO));
    const testo = ['ISCRIZIONE AGGIORNATA', sommario,
        'Posti attivi: ' + dati.postiAttivi + '\n'
        + (dati.attivi || []).map((p, i) => 'Partecipante ' + (i + 1) + ': ' + (((p.nome || '') + ' ' + (p.cognome || '')).trim() || '-') + (p.azienda ? ' - ' + p.azienda : '')).join('\n')
        + (dati.senzaNome > 0 ? '\nDa nominare: ' + dati.senzaNome : '')
        + (dati.annullati > 0 ? '\nAnnullati: ' + dati.annullati : ''),
        'Modifica o annulla: ' + link,
        '--', MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf, MOTIVO,
        'Informativa privacy: ' + PRIVACY].join('\n\n');
    return { oggetto: oggetto, html: html, testo: testo };
}

/* --- Conferma della prenotazione agli incontri B2B ---
   Parte appena l'ospite sceglie i suoi tavoli dalla pagina dell'invito, e
   riparte uguale a ogni modifica: e' la ricevuta di quello che ha scelto,
   con in allegato il foglio da presentare al desk. Il collegamento e' lo
   stesso della pagina, cosi' cambiare idea costa un clic.
   `dati`: { nome, azienda, pagina, evento: {titolo, quando, luogo, indirizzo},
   tavoli: [{nome, orario}] }; `link` e' il collegamento personale firmato.
   Ogni tavolo porta il SUO orario: gli incontri non si tengono tutti insieme,
   e una riga sola per tutti direbbe all'ospite di presentarsi all'ora
   sbagliata. */
function confermaB2B(dati, link) {
    const d = dati || {};
    const ev = d.evento || {};
    const evNome = [ev.titolo, ev.quando].filter(Boolean).join(', ') || nomeEvento(d.pagina);
    /* I tavoli in ORDINE DI ORARIO: e' l'ordine in cui la giornata succede, ed
       e' quello in cui vanno letti. Arrivano come oggetti {nome, orario}; si
       accettano anche stringhe, per non rompersi se un chiamante vecchio resta
       in giro. */
    const tavoli = ORARI.ordinaPerOrario(ORARI.normalizzaTavoli(d.tavoli));
    const quanti = tavoli.length;
    const conOrario = t => {
        const ore = ORARI.oreDaFrase(t.orario);
        // con un'ora vera si scrive prima l'ora, come su un programma; con una
        // frase scritta a mano si scrive prima l'incontro, e la frase di seguito
        const chi = t.con ? ' (con ' + t.con + ')' : '';
        if (ore.inizio && ore.fine) return ore.inizio + ' - ' + ore.fine + ', ' + t.nome + chi;
        return t.nome + (t.orario ? ' - ' + t.orario : '') + chi;
    };
    /* Se sappiamo gia' chi tiene il tavolo, non si puo' continuare a
       promettere che "Le saranno confermati sul posto": il nome e' scritto
       due righe sopra. */
    const conReferente = tavoli.some(t => t.con);
    const fraseDesk = 'In allegato trova il foglio della prenotazione, con gli orari di ciascun incontro: lo presenti al desk '
        + '"Incontri B2B" all\'ingresso, stampato oppure dal telefono. '
        + (conReferente
            ? 'Al tavolo La attende il professionista indicato qui sopra.'
            : 'Gli specialisti a Sua disposizione Le saranno confermati sul posto.');
    const oggetto = 'Prenotazione confermata - Incontri B2B, Next Generation Business' + (evNome ? ', ' + evNome : '');
    const saluto = 'Gentile ' + (d.nome || 'ospite') + ',';
    const sommario = saluto + ' la Sua prenotazione agli incontri B2B'
        + (evNome ? ' del convegno di ' + evNome : '') + ' è registrata: '
        + (quanti === 1 ? 'un incontro' : quanti + ' incontri') + ', qui sotto il riepilogo con gli orari.';
    const dove = [ev.luogo, ev.indirizzo].filter(Boolean).join(' - ');
    /* Gli incontri stanno in una sezione loro, come un orario: nel riquadro dei
       dati dell'evento si leggevano come una riga qualunque, e sono invece la
       cosa per cui questa mail esiste. */
    const vociIncontri = tavoli.map(t => {
        const ore = ORARI.oreDaFrase(t.orario);
        return {
            ora: (ore.inizio && ore.fine) ? ore.inizio + ' - ' + ore.fine : '',
            nome: t.nome + ((!ore.inizio && t.orario) ? ' - ' + t.orario : ''),
            con: t.con || ''
        };
    });
    const html = involucro(oggetto, 'La Sua prenotazione agli incontri B2B è registrata: in allegato il foglio per il desk.',
        testata('Prenotazione confermata', sommario)
        + corpo(
            '<tr><td>' + box(
                // il giorno ha una riga sua: ripeterlo accanto al nome del convegno
                // fa leggere due volte la stessa cosa
                rigaBox('Convegno', 'Next Generation Business' + (ev.titolo ? ' - ' + ev.titolo : (evNome ? ' - ' + evNome : '')))
                + rigaBox('Giorno', String(ev.quando || ''))
                + rigaBox('Dove', dove)
                + rigaBox('Partecipante', [d.nome, d.azienda].filter(Boolean).join(' - '))
            ) + '</td></tr>'
            + spazio(30)
            + occhiello(quanti === 1 ? 'Il Suo incontro' : 'I Suoi incontri')
            + spazio(4)
            + tabellaIncontri(vociIncontri)
            + spazio(28)
            + paragrafo(fraseDesk)
            + spazio(22)
            + paragrafo('Se cambia idea può modificare la scelta quando vuole, dal pulsante qui sotto: '
                + 'riceverà subito una nuova mail con il foglio aggiornato, e vale sempre l\'ultimo emesso.')
            + spazio(28)
            + bottone('Modifica la prenotazione', link)
            + spazio(24)
            + '<tr><td class="par" style="' + FONTE + 'font-size:13px;line-height:21px;color:' + C.tenue + ';text-align:justify;">Il collegamento è personale e vale solo per la Sua iscrizione: Le chiediamo di non inoltrarlo.</td></tr>'
        )
        + piede(MOTIVO));
    const testo = ['PRENOTAZIONE CONFERMATA', sommario,
        'Convegno: Next Generation Business' + (ev.titolo ? ' - ' + ev.titolo : (evNome ? ' - ' + evNome : ''))
        + (ev.quando ? '\nGiorno: ' + ev.quando : '')
        + (dove ? '\nDove: ' + dove : '')
        + ([d.nome, d.azienda].filter(Boolean).length ? '\nPartecipante: ' + [d.nome, d.azienda].filter(Boolean).join(' - ') : ''),
        (quanti === 1 ? 'Il Suo incontro:' : 'I Suoi incontri:') + '\n' + tavoli.map(t => '- ' + conOrario(t)).join('\n'),
        fraseDesk,
        'Modifica la prenotazione: ' + link,
        'Il collegamento è personale e vale solo per la Sua iscrizione: Le chiediamo di non inoltrarlo.',
        '--', MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf, MOTIVO,
        'Informativa privacy: ' + PRIVACY].join('\n\n');
    return { oggetto: oggetto, html: html, testo: testo };
}

/* ============================================================
   LA CONFERMA ALL'AZIENDA
   ------------------------------------------------------------
   Gli incontri B2B sono dell'impresa: un invito, un collegamento,
   una prenotazione per azienda. Questa mail va a TUTTI i
   referenti insieme - non una copia a testa - e dice tre cose che
   la conferma personale non poteva dire:
     - gli incontri PRENOTATI, ciascuno con chi lo tiene e con il
       nominativo di chi ci va per l'azienda;
     - le preferenze IN ATTESA di orario, con la frase che toglie
       ogni dubbio: finche' non arriva la nostra mail, al desk non
       risulta nessun incontro;
     - le altre esigenze che l'azienda ci ha segnalato.
   E il collegamento non e' piu' personale: vale per l'azienda, e
   lo dice, perche' la riga di prima ("non lo inoltri") sarebbe
   una bugia stampata - quel collegamento e' proprio da condividere
   fra i referenti.
   `motivo`: 'prenotazione' | 'spostamento' | 'assegnazione' | 'disdetta'.
============================================================ */
const TITOLI_B2B = {
    prenotazione: 'Prenotazione confermata',
    spostamento: 'Incontro spostato',
    assegnazione: 'Nuovo incontro assegnato',
    disdetta: 'Incontro annullato'
};
function confermaB2BAzienda(dati, link) {
    const d = dati || {};
    const ev = d.evento || {};
    const motivo = TITOLI_B2B[String(d.motivo || '')] ? String(d.motivo) : 'prenotazione';
    const titolo = TITOLI_B2B[motivo];
    const evNome = [ev.titolo, ev.quando].filter(Boolean).join(', ') || nomeEvento(d.pagina);
    const tavoli = ORARI.ordinaPerOrario(ORARI.normalizzaTavoli(d.tavoli));
    const quanti = tavoli.length;
    const coda = Array.isArray(d.coda) ? d.coda : [];
    const esigenze = Array.isArray(d.esigenze) ? d.esigenze : [];
    const azienda = String(d.azienda || d.nome || '');
    const referenti = Array.isArray(d.referenti) ? d.referenti : [];
    const dove = [ev.luogo, ev.indirizzo].filter(Boolean).join(' - ');
    const oggetto = titolo + ' - Incontri B2B, Next Generation Business' + (evNome ? ', ' + evNome : '');
    const saluto = 'Gentile ' + (azienda || 'ospite') + ',';
    const sommario = saluto + ' ' + (motivo === 'disdetta'
        ? 'uno degli incontri B2B prenotati non è più in programma. Qui sotto trova la situazione aggiornata.'
        : (motivo === 'assegnazione'
            ? 'abbiamo trovato posto per una delle Vostre preferenze: qui sotto gli incontri, con gli orari.'
            : (motivo === 'spostamento'
                ? 'abbiamo dovuto spostare un incontro: qui sotto gli orari aggiornati.'
                : 'la prenotazione agli incontri B2B'
                + (evNome ? ' del convegno di ' + evNome : '') + ' è registrata: '
                + (quanti === 1 ? 'un incontro' : quanti + ' incontri') + ', qui sotto il riepilogo con gli orari.')));
    const vociIncontri = tavoli.map(t => {
        const ore = ORARI.oreDaFrase(t.orario);
        return {
            ora: (ore.inizio && ore.fine) ? ore.inizio + ' - ' + ore.fine : '',
            nome: t.nome + ((!ore.inizio && t.orario) ? ' - ' + t.orario : ''),
            con: t.con || '', per: t.perChi || ''
        };
    });
    const fraseDesk = quanti
        ? 'In allegato trova il foglio della prenotazione, con gli orari di ciascun incontro: lo presenti al desk '
        + '"Incontri B2B" all\'ingresso, stampato oppure dal telefono. Al tavolo La attende il professionista indicato qui sopra.'
        : 'Al momento non risulta nessun incontro prenotato per la Vostra azienda: può sceglierne uno dal pulsante qui sotto.';
    const fraseCoda = 'Non sono prenotazioni: finché non arriva una nostra mail con l\'orario, al desk non risulta '
        + 'nessun incontro a questi tavoli.';
    const vociCoda = coda.map(c => (c.pos === 3 ? 'terza' : 'seconda') + ' preferenza: ' + c.nome
        + (c.perChi ? ' - per ' + c.perChi : ''));
    const vociEsigenze = esigenze.map(e => (e.perChi ? e.perChi + ': ' : '') + e.testo);
    const elencoSemplice = voci => '<tr><td style="' + FONTE + 'font-size:15px;line-height:24px;color:' + C.scuro + ';">'
        + voci.map(v => '&bull;&nbsp; ' + esc(v)).join('<br>') + '</td></tr>';
    const html = involucro(oggetto, titolo + ': in allegato il foglio per il desk.',
        testata(titolo, sommario)
        + corpo(
            '<tr><td>' + box(
                rigaBox('Convegno', 'Next Generation Business' + (ev.titolo ? ' - ' + ev.titolo : (evNome ? ' - ' + evNome : '')))
                + rigaBox('Giorno', String(ev.quando || ''))
                + rigaBox('Dove', dove)
                + rigaBox('Azienda', azienda)
                + (referenti.length ? rigaBox(referenti.length === 1 ? 'Referente' : 'Referenti', referenti.join(', ')) : '')
            ) + '</td></tr>'
            + spazio(30)
            + (quanti
                ? occhiello(quanti === 1 ? 'L\'incontro prenotato' : 'Gli incontri prenotati')
                + spazio(4) + tabellaIncontri(vociIncontri) + spazio(28)
                : '')
            + (vociCoda.length
                ? occhiello('In attesa di un orario') + spazio(4) + elencoSemplice(vociCoda)
                + spazio(10) + paragrafo(fraseCoda) + spazio(28)
                : '')
            + (vociEsigenze.length
                ? occhiello('Ci avete segnalato') + spazio(4) + elencoSemplice(vociEsigenze) + spazio(28)
                : '')
            + paragrafo(fraseDesk)
            + spazio(22)
            + paragrafo('Potete cambiare le scelte quando volete, dal pulsante qui sotto: '
                + 'a ogni modifica arriva una mail nuova con il foglio aggiornato, e vale sempre l\'ultimo emesso.')
            + spazio(28)
            + bottone(quanti ? 'Rivedi le prenotazioni' : 'Scegli un incontro', link)
            + spazio(24)
            + '<tr><td class="par" style="' + FONTE + 'font-size:13px;line-height:21px;color:' + C.tenue
            + ';text-align:justify;">Il collegamento vale per tutta ' + esc(azienda || 'l\'azienda')
            + ': lo può usare anche un Suo collega, e le scelte sono le stesse per tutti. '
            + 'Le chiediamo di non diffonderlo fuori dall\'azienda.</td></tr>'
        )
        + piede(MOTIVO));
    const testo = [titolo.toUpperCase(), sommario,
        'Convegno: Next Generation Business' + (ev.titolo ? ' - ' + ev.titolo : (evNome ? ' - ' + evNome : ''))
        + (ev.quando ? '\nGiorno: ' + ev.quando : '')
        + (dove ? '\nDove: ' + dove : '')
        + (azienda ? '\nAzienda: ' + azienda : '')
        + (referenti.length ? '\nReferenti: ' + referenti.join(', ') : ''),
        quanti ? ((quanti === 1 ? 'Incontro prenotato:' : 'Incontri prenotati:') + '\n'
            + tavoli.map(t => {
                const ore = ORARI.oreDaFrase(t.orario);
                const quando = (ore.inizio && ore.fine) ? ore.inizio + ' - ' + ore.fine : (t.orario || '');
                return '- ' + (quando ? quando + ', ' : '') + t.nome
                    + (t.con ? ' (con ' + t.con + ')' : '') + (t.perChi ? ' - per ' + t.perChi : '');
            }).join('\n')) : 'Nessun incontro prenotato.',
        vociCoda.length ? ('In attesa di un orario:\n' + vociCoda.map(v => '- ' + v).join('\n') + '\n' + fraseCoda) : '',
        vociEsigenze.length ? ('Ci avete segnalato:\n' + vociEsigenze.map(v => '- ' + v).join('\n')) : '',
        fraseDesk,
        'Rivedi le prenotazioni: ' + link,
        'Il collegamento vale per tutta ' + (azienda || 'l\'azienda') + ': lo può usare anche un Suo collega. '
        + 'Le chiediamo di non diffonderlo fuori dall\'azienda.',
        '--', MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf, MOTIVO,
        'Informativa privacy: ' + PRIVACY].filter(Boolean).join('\n\n');
    return { oggetto: oggetto, html: html, testo: testo };
}

module.exports = { confermaSito, confermaVariazioni, confermaB2B, confermaB2BAzienda, nomeEvento };
