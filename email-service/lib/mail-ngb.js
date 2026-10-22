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
    // chiaroBlu schiarito per il contrasto sul fondo scuro (gemello di newsletter-format.js)
    scuro: '#0A2844', blu: '#164068', accento: '#2A5A85', chiaroBlu: '#7FA8CE',
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

/* ============================================================
   LA GRAFICA DELLA PAGINA DELL'EVENTO
   Le mail dell'iscrizione a un evento con la sua pagina "nuova" (oggi
   Milano 2027) si vestono come la pagina: testata blu notte con il logo
   bianco, "Next Generation Business" con la seconda parola in azzurro, il
   tema della giornata, la fascia con data, sede e partecipazione, e il piede
   scuro con il nome dell'evento - gli stessi colori e lo stesso carattere
   (Montserrat, dove il programma di posta lo carica; altrimenti Arial) di
   milano_febbraio_2027/styles.css. Chi apre la mail dopo la pagina deve
   riconoscerla al primo sguardo.
   Vale per le tre mail dell'iscrizione dal sito: richiesta di conferma,
   invito, variazioni. Le altre (incontri B2B, eventi senza tema) restano
   con la testata di sempre.
   ============================================================ */
const TEMI_EVENTO = [
    {
        se: /milano/i,
        notte: '#08213A', filetto: '#2B4560', azzurro: '#7DB8EE', azzurroChiaro: '#B9DAF7', suNotte: '#C9D6E3',
        occhiello: 'Milano &middot; 26 febbraio 2027',
        tema: 'Merito creditizio, crescita e competitività delle imprese',
        dati: [['Data', 'Venerdì 26 febbraio 2027'], ['Orario', '8.30 - 18.00'], ['Sede', 'Excelsior Hotel Gallia, Milano']],
        piede: 'Milano &middot; 26 febbraio 2027 &middot; Excelsior Hotel Gallia',
        pagina: 'https://nextgenerationbusiness.it/milano_febbraio_2027/'
    }
];
function temaEvento(pagina) {
    return TEMI_EVENTO.find(t => t.se.test(String(pagina || ''))) || null;
}
const TITOLI = "Montserrat, Arial, 'Helvetica Neue', Helvetica, sans-serif";

function testataEvento(t, titolo, sommario) {
    const occh = 'font-family:' + TITOLI + ';mso-line-height-rule:exactly;font-size:13px;line-height:18px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;';
    // niente <div>: Outlook li impagina a modo suo. Etichetta e valore sono due righe di tabella.
    const cella = (et, val, primo) => '<td class="hd" valign="top" width="33%" bgcolor="' + t.notte + '" style="padding:14px 14px 14px ' + (primo ? '0' : '16px') + ';'
        + 'background-color:' + t.notte + ';' + (primo ? '' : 'border-left:1px solid ' + t.filetto + ';') + '">'
        + tabella('<tr><td style="' + FONTE + 'font-size:13px;line-height:18px;letter-spacing:1.2px;text-transform:uppercase;color:' + t.azzurro + ';font-weight:bold;">' + esc(et) + '</td></tr>'
            + '<tr><td style="font-family:' + TITOLI + ';mso-line-height-rule:exactly;font-size:14px;line-height:20px;color:' + C.bianco + ';font-weight:bold;padding-top:4px;">' + esc(val) + '</td></tr>')
        + '</td>';
    // un filetto che regge in Outlook: una cella alta un pixel con il colore di fondo
    const filetto = '<tr><td height="1" bgcolor="' + t.filetto + '" style="mso-line-height-rule:exactly;font-size:1px;line-height:1px;height:1px;background-color:' + t.filetto + ';">&nbsp;</td></tr>';
    return '<tr><td bgcolor="' + t.notte + '" class="px" style="background-color:' + t.notte + ';padding:26px ' + LATO + 'px 30px;">'
        + tabella(
            '<tr><td>' + tabella('<tr>'
                + '<td valign="middle"><a href="' + t.pagina + '" style="text-decoration:none;"><img src="' + LOGO_BIANCO + '" width="130" alt="Revilaw - Revisione legale" '
                + 'style="display:block;width:130px;max-width:130px;height:auto;border:0;font-family:' + FONT + ';font-size:16px;font-weight:bold;color:' + C.bianco + ';"></a></td>'
                + '<td valign="middle" align="right" style="' + occh + 'color:' + t.azzurroChiaro + ';text-align:right;font-size:13px;letter-spacing:1.2px;">' + t.occhiello + '</td>'
                + '</tr>') + '</td></tr>'
            + spazio(26) + filetto + spazio(22)
            + '<tr><td style="' + occh + 'color:' + t.azzurro + ';">' + esc(titolo) + '</td></tr>'
            + spazio(10)
            + '<tr><td class="h1" style="font-family:' + TITOLI + ';mso-line-height-rule:exactly;font-size:32px;line-height:38px;color:' + C.bianco + ';font-weight:800;letter-spacing:-0.5px;">'
            + 'Next Generation <span style="color:' + t.azzurro + ';">Business</span></td></tr>'
            + spazio(8)
            + '<tr><td style="' + FONTE + 'font-size:16px;line-height:24px;color:' + t.azzurroChiaro + ';">' + esc(t.tema) + '</td></tr>'
            + spazio(20)
            + filetto
            + '<tr><td>' + tabella('<tr>' + t.dati.map((d, i) => cella(d[0], d[1], i === 0)).join('') + '</tr>') + '</td></tr>'
            + filetto
            + spazio(22)
            + '<tr><td class="lead par" style="' + FONTE + 'font-size:17px;line-height:28px;color:' + t.suNotte + ';text-align:justify;-webkit-hyphens:auto;hyphens:auto;">' + esc(sommario) + '</td></tr>'
        )
        + '</td></tr>';
}
/* L'indirizzo e il codice fiscale dello studio, NON cliccabili. Gmail, Apple
   Mail e Outlook riconoscono da soli indirizzi e numeri e li trasformano in
   collegamenti con il LORO colore (il blu di sistema), che nel piede scuro
   stona. Uno spazio di larghezza zero fra le cifre e prima della citta' li
   rende irriconoscibili senza cambiare cio' che si legge. */
function senzaCollegamenti(s) {
    return esc(s).replace(/(\d{3})(?=\d)/g, '$1&#8203;').replace(/ - /g, ' -&#8203; ');
}
function piedeEvento(t, motivo) {
    /* Sotto il filetto UN colore solo, anche per i collegamenti (sottolineati):
       il bianco del titolo e l'azzurro del nome dell'evento bastano. */
    const riga = (dentro) => '<tr><td align="center" style="' + FONTE + 'font-size:13px;line-height:21px;color:' + t.suNotte + ';text-align:center;">' + dentro + '</td></tr>';
    const link = 'color:' + t.suNotte + ';text-decoration:underline;';
    return spazio(36) + '<tr><td class="px" bgcolor="' + t.notte + '" align="center" style="background-color:' + t.notte + ';padding:28px ' + LATO + 'px 28px;text-align:center;">'
        + tabella(
            '<tr><td align="center" style="font-family:' + TITOLI + ';mso-line-height-rule:exactly;font-size:16px;line-height:22px;color:' + C.bianco + ';font-weight:800;text-align:center;">Next Generation Business</td></tr>'
            + '<tr><td align="center" style="' + FONTE + 'font-size:13px;line-height:21px;color:' + t.azzurro + ';font-weight:bold;letter-spacing:1px;text-align:center;">' + t.piede + '</td></tr>'
            + spazio(14)
            + '<tr><td height="1" bgcolor="' + t.filetto + '" style="mso-line-height-rule:exactly;font-size:1px;line-height:1px;height:1px;background-color:' + t.filetto + ';">&nbsp;</td></tr>'
            + spazio(12)
            + riga(esc(MITTENTE.nome) + ' &middot; ' + senzaCollegamenti(MITTENTE.indirizzo) + ' &middot; ' + senzaCollegamenti(MITTENTE.cf))
            + riga('<a href="' + PRIVACY + '" style="' + link + '">Informativa privacy</a>'
                + ' &nbsp;&middot;&nbsp; <a href="' + t.pagina + '" style="' + link + '">Pagina dell\'evento</a>')
            + spazio(6)
            + riga(esc(motivo) + ' &nbsp;&middot;&nbsp; &copy; ' + new Date().getFullYear())
        )
        + '</td></tr>';
}
// la testata e il piede giusti per la pagina: quelli dell'evento quando ce l'ha
function testataPer(pagina, titolo, sommario) {
    const t = temaEvento(pagina);
    return t ? testataEvento(t, titolo, sommario) : testata(titolo, sommario);
}
function piedePer(pagina, motivo) {
    const t = temaEvento(pagina);
    return t ? piedeEvento(t, motivo) : piede(motivo);
}

function involucro(oggetto, anteprima, corpoInterno) {
    const preheader = '<div style="display:none;font-size:1px;color:' + C.sfondo + ';line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">'
        + esc(anteprima || '') + '&#8199;&#65279;&#847; '.repeat(30) + '</div>';
    return '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n'
        + '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="it" xml:lang="it">\n<head>\n'
        + '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />\n'
        + '<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
        + '<meta name="x-apple-disable-message-reformatting" content="" />\n'
        // niente collegamenti automatici su numeri, indirizzi e date (iPhone, Android)
        + '<meta name="format-detection" content="telephone=no, address=no, email=no, date=no" />\n'
        + '<meta name="color-scheme" content="light" />\n<meta name="supported-color-schemes" content="light" />\n'
        + '<title>' + esc(oggetto) + '</title>\n'
        /* Montserrat, il carattere dei titoli della pagina dell'evento: chi non lo
           carica usa Arial. Ma OUTLOOK per Windows, davanti a un carattere web,
           non passa al secondo della lista: scrive tutto in Times New Roman.
           Percio' il collegamento a Montserrat e' nascosto a Outlook (commento
           condizionale), e per Outlook c'e' una regola che impone Arial. */
        + '<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&display=swap" rel="stylesheet" type="text/css" /><!--<![endif]-->\n'
        /* Outlook per Windows impagina con Word: a 120 dpi ingrandisce le
           immagini se non gli si dice che il foglio e' a 96. */
        + '<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>'
        + '<style type="text/css">body,table,td,a,span,p{font-family:Arial,Helvetica,sans-serif!important;}</style><![endif]-->\n'
        + '<style type="text/css">\n'
        /* I telefoni ingrandiscono da se' il testo che giudicano piccolo, e
           nel farlo scompaginano la colonna: qui si dice di non farlo, perche'
           le misure le abbiamo gia' scelte noi (e nessuna scende sotto i 13px).
           Manca a questo involucro da sempre: quello dell'area riservata ce
           l'ha, e le mail si vedevano diverse a seconda di chi le aveva
           composte. */
        + 'body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}\n'
        + 'body{margin:0!important;padding:0!important;width:100%!important;}\n'
        + 'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;}\n'
        + 'img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}\n'
        /* Se Apple Mail trasforma comunque qualcosa in collegamento, che prenda
           il colore del testo intorno e non il blu di sistema. SOLO per i
           collegamenti che aggiunge lui (x-apple-data-detectors): una regola
           su tutti i collegamenti, come quelle che si trovano in giro per
           Gmail, fa prendere al testo dei PULSANTI il colore scuro del
           paragrafo, e la scritta sparisce sul blu (successo). */
        + 'a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important;}\n'
        + '@media only screen and (max-width:620px){.wrap{width:100%!important;max-width:100%!important;}'
        + '.px{padding-left:24px!important;padding-right:24px!important;}'
        + '.h1{font-size:24px!important;line-height:31px!important;}'
        + '.lead{font-size:16px!important;line-height:26px!important;}'
        /* Il giustificato resta anche sul telefono: i messaggi vanno sempre a
           bandiera doppia. La sillabazione, dove il lettore la applica, evita i
           buchi bianchi sulla colonna stretta. */
        + '.par{-webkit-hyphens:auto;-ms-hyphens:auto;hyphens:auto;}'
        /* le righe del riquadro si impilano: etichetta sopra, valore sotto */
        // sul telefono il filetto sta solo sotto il valore, non fra etichetta e valore
        + '.bxet{display:block!important;width:100%!important;padding:12px 0 2px!important;line-height:18px!important;border-bottom:0!important;}'
        + '.bxv{display:block!important;width:100%!important;padding:0 0 12px!important;}'
        // la fascia data / orario / sede della testata dell'evento: una sotto l'altra
        + '.hd{display:block!important;width:100%!important;border-left:0!important;padding:10px 0!important;}}\n'
        /* IL TESTO RESTA GIUSTIFICATO ANCHE SUL TELEFONO, come nelle mail
           composte dall'area riservata: e' una scelta di chi firma le lettere.
           Qui sotto resta solo la colonna dell'ora, che e' una larghezza e non
           un allineamento. */
        + '@media only screen and (max-width:480px){'
        + '.ora{width:62px!important;white-space:normal!important;padding-right:10px!important;}}\n'
        + '</style>\n</head>\n'
        + '<body id="corpo" style="margin:0;padding:0;background-color:' + C.sfondo + ';">\n'
        + preheader
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.sfondo + '" style="border-collapse:collapse;background-color:' + C.sfondo + ';">'
        + '<tr><td align="center" bgcolor="' + C.sfondo + '" style="padding:24px 12px;background-color:' + C.sfondo + ';">'
        /* LA COLONNA DA 600. Outlook per Windows non conosce max-width: senza
           questa tabella "fantasma", visibile solo a lui, la mail si allarga
           a tutta la finestra. Gli altri la ignorano e usano max-width, che
           sul telefono lascia stringere la colonna. Tutto il resto e' scritto
           DENTRO gli elementi (stili in linea, bgcolor sulle celle): inoltrando,
           molti programmi buttano il <style> dell'intestazione, e la mail deve
           restare la stessa anche senza. */
        + '<!--[if mso]><table role="presentation" width="' + LARGHEZZA + '" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->'
        + '<table role="presentation" class="wrap" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.bianco + '" '
        + 'style="border-collapse:collapse;width:100%;max-width:' + LARGHEZZA + 'px;margin:0 auto;background-color:' + C.bianco + ';">'
        + corpoInterno
        + '</table>'
        + '<!--[if mso]></td></tr></table><![endif]-->'
        + '</td></tr></table>\n</body>\n</html>';
}

function testata(titolo, sommario) {
    return '<tr><td bgcolor="' + C.scuro + '" class="px" style="background-color:' + C.scuro + ';padding:30px ' + LATO + 'px 30px;">'
        + tabella(
            '<tr><td><a href="' + SITO + '" style="text-decoration:none;">'
            + '<img src="' + LOGO_BIANCO + '" width="150" alt="Revilaw - Revisione legale" '
            + 'style="display:block;width:150px;max-width:150px;height:auto;border:0;font-family:' + FONT + ';font-size:18px;font-weight:bold;color:' + C.bianco + ';"></a></td></tr>'
            + spazio(24)
            + '<tr><td style="' + FONTE + 'font-size:13px;line-height:19px;letter-spacing:1.8px;text-transform:uppercase;color:' + C.chiaroBlu + ';font-weight:bold;">Next Generation Business</td></tr>'
            + spazio(12)
            + '<tr><td class="h1" style="' + FONTE + 'font-size:30px;line-height:38px;color:' + C.bianco + ';font-weight:bold;letter-spacing:-0.3px;">' + esc(titolo) + '</td></tr>'
            + spazio(16)
            + '<tr><td class="lead par" style="' + FONTE + 'font-size:18px;line-height:29px;color:' + C.suScuro + ';text-align:justify;-webkit-hyphens:auto;hyphens:auto;">' + esc(sommario) + '</td></tr>'
        )
        + '</td></tr>'
        + '<tr><td bgcolor="' + C.scuro + '" style="background-color:' + C.scuro + ';font-size:0;line-height:0;">'
        + '<img src="' + FASCIA + '" width="' + LARGHEZZA + '" alt="" style="display:block;width:100%;max-width:' + LARGHEZZA + 'px;height:auto;border:0;"></td></tr>';
}

/* Una riga del riquadro: etichetta a sinistra, valore a destra. Sul telefono
   le due celle si impilano (classi bxet/bxv nel foglio di stile): con la
   colonna dell'etichetta larga 150px su 400 di schermo, un indirizzo finiva su
   quattro righe strette. */
/* IL RIQUADRO DEI DATI e' una tabella da documento, come quella dell'invito
   in PDF: un filetto blu notte in testa, le righe separate da un filetto
   sottile, l'etichetta piccola in maiuscolo e il valore in grassetto. Niente
   fondo e niente barra laterale: si legge come un modulo dello studio, non
   come un avviso. Le linee sono bordi delle CELLE, che Outlook disegna. */
function rigaBox(et, val, larga) {
    if (!val) return '';
    const riga = 'border-bottom:1px solid ' + C.bordo + ';';
    return '<tr><td class="bxet" width="' + (larga || 140) + '" valign="top" style="' + FONTE + 'font-size:13px;line-height:22px;letter-spacing:1px;text-transform:uppercase;color:' + C.tenue + ';font-weight:bold;padding:12px 14px 12px 0;' + riga + '">' + esc(et) + '</td>'
        + '<td class="bxv" valign="top" style="' + FONTE + 'font-size:16px;line-height:22px;color:' + C.scuro + ';font-weight:bold;padding:12px 0;' + riga + '">' + esc(val) + '</td></tr>';
}
function box(righe) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">'
        + '<tr><td colspan="2" height="2" bgcolor="' + C.scuro + '" style="mso-line-height-rule:exactly;font-size:1px;line-height:2px;height:2px;background-color:' + C.scuro + ';">&nbsp;</td></tr>'
        + righe + '</table>';
}
/* GIUSTIFICATO, con la sillabazione richiesta: e' il modo in cui questo studio
   scrive. Senza sillabazione giustificare allarga gli spazi fra le parole
   finche' la riga arriva in fondo, e su una colonna stretta si vedono i "fiumi"
   bianchi: dove il programma di posta sa spezzare le parole non succede, dove
   non lo sa fare e' il prezzo del giustificato. Stessa scelta negli inviti
   (area-riservata/newsletter-format.js, ALLINEA). */
function paragrafo(t) {
    return '<tr><td class="par" style="' + FONTE + 'font-size:16px;line-height:27px;color:' + C.testo + ';text-align:justify;-webkit-hyphens:auto;hyphens:auto;">' + esc(t) + '</td></tr>';
}
function bottone(testoBtn, url) {
    return '<tr><td align="center" style="text-align:center;">'
        + '<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin:0 auto;"><tr>'
        /* Outlook non applica il padding a un collegamento: lo prende dalla
           cella (mso-padding-alt, che gli altri ignorano). Gli altri lo
           applicano al collegamento, e tutto il pulsante resta cliccabile. */
        + '<td align="center" bgcolor="' + C.blu + '" style="background-color:' + C.blu + ';mso-padding-alt:14px 30px;">'
        + '<a href="' + esc(url) + '" style="display:inline-block;padding:14px 30px;mso-padding-alt:0;font-family:' + FONT
        + ';font-size:16px;font-weight:bold;letter-spacing:0.3px;color:#ffffff;text-decoration:none;background-color:' + C.blu + ';"><span style="color:#ffffff;text-decoration:none;">' + esc(testoBtn) + '</span></a>'
        + '</td></tr></table></td></tr>';
}
/* IL BLOCCO "CONFERMA IL TUO INDIRIZZO", in cima alla conferma di iscrizione.
   Il pulsante e' "a prova di Outlook": la cella di tabella porta sfondo e
   bordo (Outlook ignora il padding del link), il link dentro e' a blocco
   pieno e alto almeno 44px (il dito su un telefono), e sotto c'e'
   l'indirizzo in chiaro per chi non puo' cliccare - Outlook blocca i link
   finche' non ci si fida del mittente, e certe Gmail su Android li aprono
   solo con il tocco lungo. Colori sempre espliciti su ogni cella: Gmail e
   Apple Mail invertono quelli lasciati al default, e un pulsante blu con il
   testo bianco diventerebbe illeggibile.
   Il PDF da esibire all'ingresso e' SOLO per chi viene in sala: a chi segue
   online (`online`) il blocco non lo nomina, e ricorda che quell'indirizzo e'
   quello con cui entrera' nella diretta. */
function bloccoConferma(url, online) {
    return '<tr><td style="' + FONTE + '">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        + 'bgcolor="' + C.chiaro + '" style="border-collapse:collapse;background-color:' + C.chiaro + ';border:1px solid ' + C.bordo + ';">'
        + '<tr><td class="par" bgcolor="' + C.chiaro + '" style="' + FONTE + 'padding:18px 22px 14px;font-size:16px;line-height:26px;color:' + C.testo
        + ';background-color:' + C.chiaro + ';text-align:justify;-webkit-hyphens:auto;hyphens:auto;">'
        + '<b style="color:' + C.scuro + ';">Un tocco per confermare il tuo indirizzo.</b> '
        + (online
            ? 'È l\'indirizzo con cui entrerai nella diretta: senza la conferma l\'iscrizione non è completa.</td></tr>'
            : 'Subito dopo ti mandiamo una seconda email con l\'invito in PDF da esibire all\'ingresso: senza la conferma l\'iscrizione non è completa.</td></tr>')
        + '<tr><td bgcolor="' + C.chiaro + '" style="padding:0 22px 8px;background-color:' + C.chiaro + ';">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>'
        + '<td align="center" valign="middle" bgcolor="' + C.blu + '" height="48" style="background-color:' + C.blu + ';border:1px solid ' + C.blu + ';height:48px;text-align:center;mso-padding-alt:13px 16px;">'
        /* Il testo bianco sta anche in uno <span> suo: se un programma di posta
           ricolora i collegamenti, lo span tiene il bianco sul blu. */
        + '<a href="' + esc(url) + '" style="display:block;padding:14px 16px;mso-padding-alt:0;font-family:' + FONT
        + ';font-size:17px;line-height:22px;font-weight:bold;letter-spacing:0.3px;color:#ffffff;text-decoration:none;background-color:' + C.blu + ';">'
        + '<span style="color:#ffffff;text-decoration:none;">Conferma il tuo indirizzo email</span></a>'
        + '</td></tr></table></td></tr>'
        /* Niente piu' l'indirizzo lungo da copiare sotto il pulsante: illeggibile
           sul telefono. Chi non puo' toccare il pulsante lo trova nella versione
           di solo testo della mail, e c'e' sempre info@. */
        + spazio(14).replace('<tr><td ', '<tr><td bgcolor="' + C.chiaro + '" ')
        + '</table></td></tr>';
}
/* Un'etichetta di sezione: piccola, maiuscola, con il filetto sotto. Serve a
   staccare "i Suoi incontri" dai dati dell'evento, che sono due cose diverse e
   in un riquadro solo si leggevano come una lista sola. */
function occhiello(t) {
    return '<tr><td style="' + FONTE + 'font-size:13px;line-height:20px;letter-spacing:1.4px;text-transform:uppercase;'
        + 'color:' + C.accento + ';font-weight:bold;padding-bottom:8px;border-bottom:1px solid ' + C.bordo + ';">' + esc(t) + '</td></tr>';
}
/* Gli incontri come un orario: a sinistra l'ora, a destra l'argomento. E'
   la stessa forma del foglio da presentare al desk, ed e' quella in cui si
   legge un programma - "INCONTRO 1, INCONTRO 2" numerava le righe senza dire
   niente che l'ora non dicesse gia'. */
function tabellaIncontri(voci) {
    const riga = v => '<tr>'
        /* La colonna dell'ora ha una larghezza fissa perche' le ore si devono
           leggere incolonnate: su 600px 110 pixel sono il posto che serve.
           Su un telefono da 320 diventano il 39% della riga, e il nome del
           tavolo - "Modello 231 e Tax Control Framework" - si spezza in tre
           righe per fare posto a "10:00 - 10:30". Da li' in giu' la colonna
           si stringe e l'ora puo' andare a capo fra le due: "10:00 -" sopra e
           "10:30" sotto si leggono benissimo, e il nome del tavolo riprende
           la larghezza che gli serve. Senza togliere il "a capo" la colonna
           non si stringerebbe comunque, perche' a tenerla larga e' il testo. */
        + '<td width="110" class="ora" valign="top" style="' + FONTE + 'font-size:16px;line-height:26px;color:' + C.blu
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
    const riga = (stile, dentro) => '<tr><td align="center" style="' + FONTE + 'font-size:14px;line-height:22px;' + stile + 'text-align:center;">' + dentro + '</td></tr>';
    const link = 'color:' + C.tenue + ';text-decoration:underline;';
    return spazio(36) + '<tr><td class="px" bgcolor="' + C.sfondo + '" align="center" style="background-color:' + C.sfondo + ';padding:24px ' + LATO + 'px 26px;border-top:1px solid ' + C.bordo + ';text-align:center;">'
        + tabella(
            riga('color:' + C.scuro + ';font-weight:bold;', esc(MITTENTE.nome))
            + riga('color:' + C.tenue + ';', senzaCollegamenti(MITTENTE.indirizzo) + ' &middot; ' + senzaCollegamenti(MITTENTE.cf))
            + spazio(10)
            + riga('color:' + C.tenue + ';', '<a href="' + PRIVACY + '" style="' + link + '">Informativa privacy</a>'
                + ' &nbsp;&middot;&nbsp; <a href="' + SITO + '" style="' + link + '">nextgenerationbusiness.it</a>')
            + spazio(8)
            + riga('color:' + C.tenue + ';', esc(motivo) + ' &nbsp;&middot;&nbsp; &copy; ' + new Date().getFullYear())
        )
        + '</td></tr>';
}
/* La frase della diretta per chi segue online, nella conferma
   dell'iscrizione: la password arriva con un'email a parte, senza date
   promesse (vedi confermaSito). Con il pulsante di conferma la frase
   chiede prima il clic: con l'invio automatico acceso la password parte
   DOPO la conferma dell'indirizzo (lib/diretta-iscrizione.js), a
   interruttore spento la manda il gestore prima dell'evento; la frase e'
   vera in tutti e due i casi. */
const FRASE_DIRETTA_ONLINE = 'Per seguire la diretta riceverai un\'email con la password per entrare (se non è già arrivata, arriverà prima dell\'evento). Non trovi l\'email? Controlla nella cartella Spam o Promozioni e segna il mittente come sicuro.';
const FRASE_DIRETTA_ONLINE_CONFERMA = 'Conferma il tuo indirizzo dal pulsante qui sopra: la password per entrare nella diretta arriva con un\'email a parte, dopo la conferma o comunque prima dell\'evento (se non è già arrivata). Non trovi l\'email? Controlla nella cartella Spam o Promozioni e segna il mittente come sicuro.';
const MOTIVO = 'Ricevi questa email come conferma della tua iscrizione all\'evento: non è una comunicazione promozionale.';
/* IL MOTIVO IN CODA, per le mail del B2B. Quella riga in fondo dice a chi
   legge perche' gli e' arrivata questa email, e sotto un invito agli incontri
   diceva "conferma della tua iscrizione": una cosa che non era vera - l'invito
   non conferma niente - e per giunta detta del tu in una lettera che da' del
   Lei o del Voi. Questa e' impersonale apposta: la stessa riga va bene sotto
   la lettera all'impresa e sotto quella alla singola persona. */
const MOTIVO_B2B = 'Questa email riguarda gli incontri B2B del convegno Next Generation Business: non è una comunicazione promozionale.';

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
function confermaSito(dati, link, linkConferma) {
    const evento = nomeEvento(dati.pagina);
    const nomeCompleto = ((dati.nome || '') + ' ' + (dati.cognome || '')).trim();
    const online = String((dati && dati.modalita) || '').toLowerCase() === 'online';
    /* L'oggetto dice cosa si chiede: con il pulsante di conferma questa mail
       e' una richiesta, e chi la vede in elenco deve capire che c'e' da fare
       un clic. Senza collegamento (le mail composte prima) resta com'era. */
    const oggetto = (linkConferma ? 'Richiesta di conferma - ' : 'Iscrizione ricevuta - ') + 'Next Generation Business, ' + evento;
    const saluto = 'Gentile ' + (nomeCompleto || 'ospite') + ',';
    const sommario = saluto + ' la tua iscrizione al convegno Next Generation Business di ' + evento + ' è stata registrata'
        + (online ? ' per la partecipazione online' : '') + '.';
    const attesa = online && dati && dati.listaAttesa === true;
    /* Con il collegamento di conferma la mail e' il PRIMO passo: la richiesta
       e' ricevuta, il posto arriva con l'invito dopo la conferma. Senza (le
       mail composte prima di questa modifica) resta la frase di sempre.
       Online: la password della diretta arriva con un'email a parte (dal
       servizio della diretta, dopo la conferma dell'indirizzo se l'invio
       automatico e' acceso, altrimenti quando il gestore la manda). Qui
       niente date promesse: la conferma non sa quale dei due casi e', e non
       deve contraddire una password magari gia' arrivata. */
    const apertura = online
        ? 'La tua richiesta di partecipazione online è registrata. ' + (linkConferma ? FRASE_DIRETTA_ONLINE_CONFERMA : FRASE_DIRETTA_ONLINE)
            + (attesa ? ' I posti in sala sono esauriti, ma ti abbiamo inserito in lista d\'attesa: se se ne libera uno ti scriviamo, e decidi tu se venire di persona.' : '')
            + ' Qui sotto trovi il riepilogo: se qualcosa cambia, dal pulsante puoi correggere i tuoi dati o annullare l\'iscrizione, senza scriverci.'
        : (linkConferma
            ? 'La tua richiesta è registrata. Conferma il tuo indirizzo dal pulsante qui sopra: riceverai subito l\'invito in PDF da esibire all\'ingresso. Qui sotto trovi il riepilogo: se qualcosa cambia, dal pulsante in fondo puoi correggere i tuoi dati o annullare l\'iscrizione, senza scriverci.'
            : 'Il tuo posto è riservato. Qui sotto trovi il riepilogo: se qualcosa cambia, dal pulsante puoi correggere i tuoi dati o annullare l\'iscrizione, senza scriverci.');
    const html = involucro(oggetto, 'La tua iscrizione a ' + evento + ' è registrata: ecco il riepilogo.',
        testataPer(dati.pagina, linkConferma ? 'Richiesta di conferma' : 'Iscrizione ricevuta', sommario)
        + corpo(
            /* Prima di tutto la conferma dell'indirizzo, quando c'e' il
               collegamento: e' l'unica cosa che chiediamo di fare, e sta
               sopra il riepilogo perche' e' li' che si legge sul telefono
               senza scorrere. Le mail composte prima di questa modifica non
               lo passano e restano come erano. */
            (linkConferma ? bloccoConferma(linkConferma, online) + spazio(26) : '')
            + paragrafo(apertura)
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
            + '<tr><td class="par" style="' + FONTE + 'font-size:14px;line-height:22px;color:' + C.tenue + ';text-align:justify;-webkit-hyphens:auto;hyphens:auto;">Il collegamento è personale e vale solo per questa iscrizione: ti chiediamo di non inoltrarlo. '
            + (online ? 'Ci colleghiamo insieme.' : 'Ti aspettiamo a ' + esc(evento.split(' ')[0]) + '.') + '</td></tr>'
        )
        + piedePer(dati.pagina, MOTIVO));
    const testo = [linkConferma ? 'RICHIESTA DI CONFERMA' : 'ISCRIZIONE RICEVUTA', sommario,
        // nella versione testo il collegamento di conferma sta sulla prima riga utile
        linkConferma ? 'Conferma il tuo indirizzo email (un clic): ' + linkConferma : '',
        apertura,
        'Evento: Next Generation Business - ' + evento
        + (online ? '\nPartecipazione: Online' + (attesa ? ' - in lista d\'attesa per la sala' : '') : '')
        + (nomeCompleto ? '\nIscritto: ' + nomeCompleto : '')
        + (dati.azienda ? '\nAzienda: ' + dati.azienda : ''),
        'Modifica o annulla l\'iscrizione: ' + link,
        'Il collegamento è personale e vale solo per questa iscrizione: ti chiediamo di non inoltrarlo.',
        '--', MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf, MOTIVO,
        'Informativa privacy: ' + PRIVACY].filter(Boolean).join('\n\n');
    return { oggetto: oggetto, html: html, testo: testo };
}

/* --- L'invito, dopo la conferma dell'indirizzo ---
   La seconda mail: l'indirizzo e' confermato, e in allegato c'e' l'invito
   in PDF da esibire all'ingresso (per chi segue online, il promemoria che
   il collegamento arriva prima dell'evento). `dati`: { nome, cognome,
   azienda, pagina, evento: {quando, luogo, indirizzo, orario}, modalita };
   `link` e' il collegamento per modificare o annullare. */
function invitoIngresso(dati, link) {
    const evento = nomeEvento(dati.pagina);
    const ev = dati.evento || {};
    const nomeCompleto = ((dati.nome || '') + ' ' + (dati.cognome || '')).trim();
    const online = String(dati.modalita || '').toLowerCase() === 'online';
    const oggetto = (online ? 'Indirizzo confermato' : 'Il tuo invito') + ' - Next Generation Business, ' + evento;
    const saluto = 'Gentile ' + (nomeCompleto || 'ospite') + ',';
    const sommario = saluto + ' il tuo indirizzo è confermato'
        + (online ? ': la tua partecipazione online a ' + evento + ' è registrata.' : ' e la tua iscrizione a ' + evento + ' è completa.');
    const apertura = online
        ? 'Nella diretta si entra con questo indirizzo email e con la password che riceverai con un\'email a parte (se non è già arrivata, arriverà prima dell\'evento). Non trovi l\'email? Controlla nella cartella Spam o Promozioni e segna il mittente come sicuro.'
        : 'In allegato trovi il tuo invito in PDF: esibiscilo al desk all\'ingresso, anche dal telefono, e ti consegniamo il badge. Se qualcosa cambia, dal pulsante qui sotto puoi correggere i tuoi dati o annullare la partecipazione, senza scriverci.';
    const dove = [ev.luogo, ev.indirizzo].filter(Boolean).join(' - ');
    const html = involucro(oggetto, online ? 'Indirizzo confermato: la tua partecipazione online è registrata.' : 'Il tuo invito a ' + evento + ' è in allegato: esibiscilo all\'ingresso.',
        testataPer(dati.pagina, online ? 'Indirizzo confermato' : 'Il tuo invito', sommario)
        + corpo(
            paragrafo(apertura)
            + spazio(22)
            + '<tr><td>' + box(
                rigaBox('Evento', 'Next Generation Business - ' + evento)
                + rigaBox('Giorno', ev.quando)
                + rigaBox('Orario', ev.orario)
                + rigaBox('Dove', dove)
                + rigaBox('Partecipazione', online ? 'Online, in diretta' : 'In sala')
                + rigaBox('Iscritto', nomeCompleto)
                + rigaBox('Azienda', dati.azienda)
            ) + '</td></tr>'
            + (dati.agenda ? spazio(24) + bloccoAgenda(dati.agenda) : '')
            + spazio(28)
            + bottone('Modifica o annulla l\'iscrizione', link)
            + spazio(24)
            + '<tr><td class="par" style="' + FONTE + 'font-size:14px;line-height:22px;color:' + C.tenue + ';text-align:justify;-webkit-hyphens:auto;hyphens:auto;">Il collegamento è personale e vale solo per questa iscrizione: ti chiediamo di non inoltrarlo. '
            + (online ? 'Ci colleghiamo insieme.' : 'Ti aspettiamo a ' + esc(evento.split(' ')[0]) + '.') + '</td></tr>'
        )
        + piedePer(dati.pagina, MOTIVO));
    const testo = [online ? 'INDIRIZZO CONFERMATO' : 'IL TUO INVITO', sommario, apertura,
        'Evento: Next Generation Business - ' + evento
        + (ev.quando ? '\nGiorno: ' + ev.quando : '') + (ev.orario ? '\nOrario: ' + ev.orario : '') + (dove ? '\nDove: ' + dove : '')
        + '\nPartecipazione: ' + (online ? 'Online, in diretta' : 'In sala')
        + (nomeCompleto ? '\nIscritto: ' + nomeCompleto : '') + (dati.azienda ? '\nAzienda: ' + dati.azienda : ''),
        dati.agenda ? 'Aggiungi la giornata al calendario:\nGoogle Calendar: ' + dati.agenda.google + '\nOutlook: ' + dati.agenda.outlook
            + '\nApple Calendar e altre agende: apri il file .ics in allegato.' : '',
        'Modifica o annulla l\'iscrizione: ' + link,
        '--', MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf, MOTIVO,
        'Informativa privacy: ' + PRIVACY].filter(Boolean).join('\n\n');
    return { oggetto: oggetto, html: html, testo: testo };
}
/* "Aggiungi al calendario" nell'invito: Google e Outlook come collegamenti,
   Apple e le altre agende con il file .ics in allegato. Collegamenti di
   testo dentro un riquadro chiaro, non pulsanti: il pulsante della mail resta
   uno solo, quello per modificare o annullare. */
function bloccoAgenda(a) {
    const link = (t, u) => '<a href="' + esc(u) + '" style="color:' + C.blu + ';font-weight:bold;text-decoration:underline;">' + esc(t) + '</a>';
    return '<tr><td style="' + FONTE + '">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        + 'bgcolor="' + C.chiaro + '" style="border-collapse:collapse;background-color:' + C.chiaro + ';border:1px solid ' + C.bordo + ';">'
        + '<tr><td class="par" bgcolor="' + C.chiaro + '" style="' + FONTE + 'padding:16px 20px;font-size:15px;line-height:25px;color:' + C.testo + ';text-align:justify;">'
        + '<strong>Aggiungi la giornata al calendario:</strong> ' + link('Google Calendar', a.google) + ' &middot; ' + link('Outlook', a.outlook)
        + ' &middot; per Apple Calendar e le altre agende apri il file .ics in allegato.'
        + '</td></tr></table></td></tr>';
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
        testataPer(dati.pagina, 'Iscrizione aggiornata', sommario)
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
        + piedePer(dati.pagina, MOTIVO));
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
            + '<tr><td class="par" style="' + FONTE + 'font-size:14px;line-height:22px;color:' + C.tenue + ';text-align:justify;-webkit-hyphens:auto;hyphens:auto;">Il collegamento è personale e vale solo per la Sua iscrizione: Le chiediamo di non inoltrarlo.</td></tr>'
        )
        + piede(MOTIVO_B2B));
    const testo = ['PRENOTAZIONE CONFERMATA', sommario,
        'Convegno: Next Generation Business' + (ev.titolo ? ' - ' + ev.titolo : (evNome ? ' - ' + evNome : ''))
        + (ev.quando ? '\nGiorno: ' + ev.quando : '')
        + (dove ? '\nDove: ' + dove : '')
        + ([d.nome, d.azienda].filter(Boolean).length ? '\nPartecipante: ' + [d.nome, d.azienda].filter(Boolean).join(' - ') : ''),
        (quanti === 1 ? 'Il Suo incontro:' : 'I Suoi incontri:') + '\n' + tavoli.map(t => '- ' + conOrario(t)).join('\n'),
        fraseDesk,
        'Modifica la prenotazione: ' + link,
        'Il collegamento è personale e vale solo per la Sua iscrizione: Le chiediamo di non inoltrarlo.',
        '--', MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf, MOTIVO_B2B,
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
    /* IL DESK REVILAW. Ha un titolo suo perche' e' la sola cosa che
       l'azienda non ha chiesto: nel suo modulo quel tavolo non c'e', e
       questa mail - con il foglio allegato - e' l'unico posto dove legge
       l'ora e il punto in cui presentarsi. */
    desk: 'Appuntamento al desk Revilaw',
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
    /* LA QUESTIONE CHE HA FATTO NASCERE L'APPUNTAMENTO. "Per la questione che
       ci avete segnalato" non basta: un'impresa che ce ne ha scritte tre non
       sa quale, e chi si presenta al desk nemmeno. Si riporta per intero, con
       il nominativo di chi l'ha posta. */
    const questione = (d.questione && String(d.questione.testo || '').trim())
        ? { testo: String(d.questione.testo || '').trim(), perChi: String(d.questione.perChi || '').trim() }
        : null;
    const azienda = String(d.azienda || d.nome || '');
    const referenti = Array.isArray(d.referenti) ? d.referenti : [];
    const dove = [ev.luogo, ev.indirizzo].filter(Boolean).join(' - ');
    // entro quando si sceglie: arriva con i dati dell'evento, e se non c'e'
    // le frasi che la nominano si tolgono da sole invece di inventarla
    const entro = String(ev.scadenzaB2B || '').trim();
    const oggetto = titolo + ' - Incontri B2B, Next Generation Business' + (evNome ? ', ' + evNome : '');
    const saluto = 'Gentile ' + (azienda || 'ospite') + ',';
    const sommario = saluto + ' ' + (motivo === 'disdetta'
        ? 'uno degli incontri B2B prenotati non è più in programma. Di seguito la situazione aggiornata.'
        : (motivo === 'desk'
            ? 'in merito alla questione che ci avete segnalato Vi attendiamo al desk Revilaw: di seguito la '
            + 'questione e l\'orario, e in allegato il foglio da presentare.'
            : (motivo === 'assegnazione'
            ? 'a quel tavolo si è reso disponibile un posto e lo abbiamo assegnato a una delle Vostre '
            + 'preferenze, con l\'orario scelto fra quelli rimasti. Di seguito gli incontri, con i relativi orari.'
            : (motivo === 'spostamento'
                ? 'abbiamo dovuto spostare un incontro: di seguito gli orari aggiornati.'
                : 'la prenotazione agli incontri B2B'
                + (evNome ? ' del convegno di ' + evNome : '') + ' è registrata: '
                + (quanti === 1 ? 'un incontro' : quanti + ' incontri') + ', di seguito il riepilogo con gli orari.'))));
    const vociIncontri = tavoli.map(t => {
        const ore = ORARI.oreDaFrase(t.orario);
        return {
            ora: (ore.inizio && ore.fine) ? ore.inizio + ' - ' + ore.fine : '',
            nome: t.nome + ((!ore.inizio && t.orario) ? ' - ' + t.orario : ''),
            con: '', per: t.perChi || ''
        };
    });
    const fraseDesk = quanti
        ? 'In allegato trovate il foglio della prenotazione, con gli orari di ciascun incontro: è sufficiente '
        + 'presentarlo al desk "Incontri B2B" all\'ingresso, stampato oppure dal telefono. Ai tavoli Vi attendono '
        + 'i nostri professionisti.'
        : 'Al momento non risulta alcun incontro prenotato per la Vostra azienda: potete sceglierne uno dal '
        + 'pulsante qui sotto.';
    /* CHE COSA NE SARA', e non solo che cosa non sono. "Non sono
       prenotazioni" lasciava in sospeso la domanda vera - qualcuno ci
       pensera'? - e la risposta c'e': se al tavolo restano posti l'orario lo
       assegniamo noi. Stessa frase sulla pagina, dopo il salvataggio: e' la
       stessa cosa detta nello stesso momento, e due versioni diverse la
       farebbero sembrare una regola incerta. */
    const fraseCoda = 'Non sono prenotazioni, ma preferenze: diventano un incontro solo se a quel tavolo restano '
        + 'posti dopo le prime preferenze di tutte le imprese, e l\'orario lo assegniamo noi fra quelli rimasti, '
        + 'anche distante da quello del primo incontro. Ve lo comunichiamo con una email come questa: fino a quel '
        + 'momento al desk non risulta alcun incontro a questi tavoli.';
    /* CHE COSA SI PUO' FARE DI UN ORARIO CHE NON VA BENE. L'orario delle
       preferenze lo scegliamo noi, quindi puo' cadere quando quella persona
       non c'e': dirlo soltanto qui sarebbe inutile se poi non si potesse fare
       niente, e infatti adesso dalla pagina si annulla - il posto torna
       libero per un'altra impresa e la preferenza resta in lista. */
    const fraseAnnulla = 'Gli orari assegnati da noi - quelli derivanti dalla seconda o dalla terza preferenza - '
        + 'sono confermati: dalla pagina non possono essere spostati né sostituiti. Qualora uno di essi non fosse '
        + 'compatibile con i Vostri impegni, potete annullarlo: l\'orario torna disponibile per un\'altra impresa e '
        + 'la Vostra preferenza resta in lista per un orario diverso. La prima preferenza, invece, si sposta da sé: '
        + 'è sufficiente scegliere un altro orario dalla pagina, senza annullare nulla.';
    const fraseModifica = 'Potete modificare le scelte dal pulsante qui sotto: a ogni modifica riceverete una email '
        + 'con il foglio aggiornato, e vale sempre l\'ultimo emesso.';
    const fraseEntro = entro
        ? 'Potete scegliere e modificare le Vostre preferenze entro il ' + entro + ': dopo tale data chiudiamo '
        + 'gli abbinamenti e assegniamo gli orari rimanenti.'
        : '';
    /* L'ETICHETTA DEL PULSANTE, scritta una volta per la mail e per la
       versione a solo testo. Diceva "Rivedi" e "Scegli" - del tu - dentro una
       lettera che da' del Voi dalla prima riga all'ultima: un'incoerenza che
       si nota proprio dove l'occhio si ferma. */
    const etichettaPulsante = quanti ? 'Rivedete le prenotazioni' : 'Scegliete un incontro';
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
            /* Subito sotto l'incontro, non in fondo: chi apre questa mail
               vuole sapere l'ora e di che cosa si parlera', e le due cose si
               leggono insieme o non si leggono. */
            + (questione
                ? occhiello('La questione che ci avete segnalato') + spazio(6)
                + paragrafo('\u00ab' + questione.testo + '\u00bb')
                + (questione.perChi ? spazio(4) + '<tr><td style="' + FONTE + 'font-size:14px;line-height:22px;color:'
                    + C.tenue + ';">' + esc('Posta da ' + questione.perChi) + '</td></tr>' : '')
                + spazio(28)
                : '')
            + (vociCoda.length
                ? occhiello('Preferenze in attesa di un orario') + spazio(4) + elencoSemplice(vociCoda)
                + spazio(10) + paragrafo(fraseCoda) + spazio(28)
                : '')
            + (vociEsigenze.length
                ? occhiello('Ci avete segnalato') + spazio(4) + elencoSemplice(vociEsigenze) + spazio(28)
                : '')
            + paragrafo(fraseDesk)
            + spazio(22)
            + paragrafo(fraseModifica)
            + spazio(16)
            + paragrafo(fraseAnnulla)
            + (fraseEntro ? spazio(16) + paragrafo(fraseEntro) : '')
            + spazio(28)
            + bottone(etichettaPulsante, link)
            + spazio(24)
            + '<tr><td class="par" style="' + FONTE + 'font-size:14px;line-height:22px;color:' + C.tenue
            + ';text-align:justify;-webkit-hyphens:auto;hyphens:auto;">Il collegamento vale per l\'intera '
            + esc(azienda || 'azienda') + ': può essere utilizzato anche da un Vostro collega, e le scelte sono '
            + 'le stesse per tutti. Vi chiediamo di non diffonderlo all\'esterno.</td></tr>'
        )
        + piede(MOTIVO_B2B));
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
                    + (t.perChi ? ' - per ' + t.perChi : '');
            }).join('\n')) : 'Nessun incontro prenotato.',
        questione ? ('La questione che ci avete segnalato:\n\u00ab' + questione.testo + '\u00bb'
            + (questione.perChi ? '\nPosta da ' + questione.perChi : '')) : '',
        vociCoda.length ? ('Preferenze in attesa di un orario:\n' + vociCoda.map(v => '- ' + v).join('\n') + '\n' + fraseCoda) : '',
        vociEsigenze.length ? ('Ci avete segnalato:\n' + vociEsigenze.map(v => '- ' + v).join('\n')) : '',
        fraseDesk,
        fraseModifica,
        fraseAnnulla,
        fraseEntro,
        etichettaPulsante + ': ' + link,
        'Il collegamento vale per l\'intera ' + (azienda || 'azienda') + ': può essere utilizzato anche da un '
        + 'Vostro collega. Vi chiediamo di non diffonderlo all\'esterno.',
        '--', MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf, MOTIVO_B2B,
        'Informativa privacy: ' + PRIVACY].filter(Boolean).join('\n\n');
    return { oggetto: oggetto, html: html, testo: testo };
}

/* ============================================================
   L'INVITO AGLI INCONTRI B2B, ANNULLATO
   ------------------------------------------------------------
   Quando togliamo un'azienda dagli incontri - perche' non viene
   piu', perche' era un doppione, perche' l'abbiamo invitata per
   sbaglio - dall'altra parte c'e' chi quel collegamento ce l'ha
   in casella, e magari un foglio con un'ora sopra.
   Senza una riga da noi succede la cosa peggiore: si presenta al
   desk a un'ora che per noi non esiste piu', oppure apre il
   collegamento il giorno prima, legge "non valido" e pensa a un
   guasto nostro. Questa mail dice le due cose che servono - gli
   incontri che aveva non ci sono piu' (elencati, cosi' sa quali) e
   il collegamento non apre piu' - e a chi scrivere se e' un errore.
   Nessun pulsante: non c'e' piu' niente da aprire, e un pulsante
   che porta a una pagina che rifiuta sarebbe una beffa.
   `dati`: { azienda, evento:{titolo,quando,luogo,indirizzo},
   pagina, tavoli:[{nome,orario,perChi}] }.
============================================================ */
function invitoB2BAnnullato(dati) {
    const d = dati || {};
    const ev = d.evento || {};
    const evNome = [ev.titolo, ev.quando].filter(Boolean).join(', ') || nomeEvento(d.pagina);
    const azienda = String(d.azienda || d.nome || '');
    const tavoli = ORARI.ordinaPerOrario(ORARI.normalizzaTavoli(d.tavoli));
    const quanti = tavoli.length;
    const titolo = quanti ? 'Incontri B2B annullati' : 'Invito agli incontri B2B annullato';
    const oggetto = titolo + ' - Next Generation Business' + (evNome ? ', ' + evNome : '');
    const saluto = 'Gentile ' + (azienda || 'ospite') + ',';
    const sommario = saluto + ' ' + (quanti
        ? 'gli incontri B2B che avevate prenotato sono stati annullati e il collegamento per prenotare non '
        + 'è più valido.'
        : 'l\'invito agli incontri B2B è stato annullato: il collegamento per prenotare non è più valido.');
    /* LE FRASI, scritte una volta sola. Le legge sia chi riceve l'HTML sia
       chi riceve il solo testo, e scriverle due volte vuol dire che al primo
       ritocco una delle due resta indietro senza che nessuno se ne accorga. */
    const fraseOrari = 'Questi orari non sono più a Vostro nome: il ' + (ev.quando || 'giorno del convegno')
        + ' al desk non risulterà alcun appuntamento, e il foglio che avete ricevuto non è più valido.';
    const fraseCollegamento = 'Anche il collegamento con cui sceglievate gli incontri non è più attivo.';
    const fraseIscrizione = 'Il presente annullamento riguarda soltanto gli incontri B2B: l\'eventuale '
        + 'iscrizione al convegno resta invariata, e non occorre alcun adempimento da parte Vostra.';
    const fraseErrore = 'Qualora si trattasse di un errore, o desideraste essere reinseriti, Vi preghiamo di '
        + 'scrivere a info@nextgenerationbusiness.it: provvederemo noi.';
    const vociIncontri = tavoli.map(t => {
        const ore = ORARI.oreDaFrase(t.orario);
        return {
            ora: (ore.inizio && ore.fine) ? ore.inizio + ' - ' + ore.fine : '',
            nome: t.nome + ((!ore.inizio && t.orario) ? ' - ' + t.orario : ''),
            con: '', per: t.perChi || ''
        };
    });
    const html = involucro(oggetto, titolo + (evNome ? ' - ' + evNome : ''),
        testata(titolo, sommario)
        + corpo(
            (quanti
                ? occhiello(quanti === 1 ? 'L\'incontro annullato' : 'Gli incontri annullati')
                + spazio(4) + tabellaIncontri(vociIncontri) + spazio(10)
                + paragrafo(fraseOrari)
                + spazio(28)
                /* "Anche il collegamento" solo se prima si e' parlato
                   d'altro: a chi non aveva prenotato niente lo ha gia' detto
                   il sommario, e ripeterlo da solo suona come un secondo
                   annuncio di una cosa sola. */
                + paragrafo(fraseCollegamento)
                + spazio(22)
                : '')
            /* L'ISCRIZIONE AL CONVEGNO NON C'ENTRA, e va detto: chi legge
               "annullato" pensa di essere stato tolto dall'evento, e magari
               non si presenta. Gli incontri B2B sono una cosa a parte. */
            + paragrafo(fraseIscrizione)
            + spazio(22)
            + paragrafo(fraseErrore)
        )
        + piede(MOTIVO_B2B));
    const testo = [titolo.toUpperCase(), sommario,
        quanti ? ((quanti === 1 ? 'Incontro annullato:' : 'Incontri annullati:') + '\n'
            + tavoli.map(t => {
                const ore = ORARI.oreDaFrase(t.orario);
                const quando = (ore.inizio && ore.fine) ? ore.inizio + ' - ' + ore.fine : (t.orario || '');
                return '- ' + (quando ? quando + ', ' : '') + t.nome + (t.perChi ? ' - per ' + t.perChi : '');
            }).join('\n')) : '',
        quanti ? fraseOrari : '',
        quanti ? fraseCollegamento : '',
        fraseIscrizione,
        fraseErrore,
        '--', MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf, MOTIVO_B2B,
        'Informativa privacy: ' + PRIVACY].filter(Boolean).join('\n\n');
    return { oggetto: oggetto, html: html, testo: testo };
}

/* --- Il riepilogo serale per gli organizzatori ---
   `c` viene da lib/riepilogo-iscrizioni.js (conti): { evento, giorno,
   nuove: [...], inAttesa: [...], totale }. Ogni persona: { nome, azienda,
   ruolo, email, telefono, ora, iscritto, invito }. Le NUOVE sono le
   iscrizioni completate nel giorno (email confermata, `ora` = ora della
   conferma); quelle IN ATTESA hanno inviato il modulo ma non hanno ancora
   confermato l'email (`iscritto` = giorno, `ora` = ora del modulo) e
   tornano ogni notte finche' non confermano. `link` porta alle iscrizioni
   nell'area riservata. Si veste come le mail dell'evento, ma e' una mail
   interna: niente collegamenti personali, e i dati di contatto ci sono. */
function riepilogoIscrizioni(c, link, giornoTesto) {
    const pagina = (c.evento && c.evento.nome ? c.evento.nome : '') + ' 26 Febbraio 2027';
    const n = c.nuove.length;
    const a = c.inAttesa.length;
    const oggetto = 'Iscrizioni ' + (c.evento ? c.evento.nome : '') + ' - ' + n + (n === 1 ? ' confermata' : ' confermate') + ' il ' + giornoTesto
        + ' (totale ' + c.totale + (a ? ', ' + a + ' in attesa' : '') + ')';
    const sommario = (n
        ? 'Il ' + giornoTesto + ' ' + (n === 1 ? 'una persona ha completato l\'iscrizione' : n + ' persone hanno completato l\'iscrizione') + ' confermando l\'email.'
        : 'Il ' + giornoTesto + ' nessuna nuova iscrizione confermata.')
        + ' Le iscrizioni confermate sono ' + c.totale
        + (a ? '; ' + (a === 1 ? 'una persona attende' : a + ' persone attendono') + ' ancora di confermare l\'email.' : '.');
    const riga = (p, nota) => '<tr><td style="padding:14px 0;border-bottom:1px solid ' + C.bordo + ';">' + tabella(
        '<tr><td style="' + FONTE + 'font-size:16px;line-height:22px;font-weight:bold;color:' + C.scuro + ';">' + esc(p.nome) + '</td>'
        + '<td align="right" valign="top" style="' + FONTE + 'font-size:13px;line-height:22px;color:' + C.tenue + ';text-align:right;white-space:nowrap;">' + esc(nota) + '</td></tr>'
        + ((p.azienda || p.ruolo) ? '<tr><td colspan="2" style="' + FONTE + 'font-size:15px;line-height:22px;color:' + C.testo + ';padding-top:2px;">' + esc([p.azienda, p.ruolo].filter(Boolean).join(' · ')) + '</td></tr>' : '')
        + '<tr><td colspan="2" style="' + FONTE + 'font-size:14px;line-height:21px;color:' + C.tenue + ';padding-top:2px;">'
        + [p.email ? '<a href="mailto:' + esc(p.email) + '" style="color:' + C.tenue + ';text-decoration:underline;">' + esc(p.email) + '</a>' : '', esc(p.telefono)].filter(Boolean).join(' &middot; ') + '</td></tr>'
        + (p.invito ? '<tr><td colspan="2" style="' + FONTE + 'font-size:13px;line-height:20px;color:' + C.accento + ';padding-top:4px;">Azienda invitata: ' + esc(p.invito) + '</td></tr>' : '')
    ) + '</td></tr>';
    const vuoto = (t) => '<tr><td class="par" style="' + FONTE + 'font-size:15px;line-height:24px;color:' + C.tenue + ';padding:14px 0;border-bottom:1px solid ' + C.bordo + ';">' + esc(t) + '</td></tr>';
    const html = involucro(oggetto, sommario,
        testataPer(pagina, 'Riepilogo iscrizioni del ' + giornoTesto, sommario)
        + corpo(
            '<tr><td>' + box(
                rigaBox('Iscrizioni di oggi', String(n), 330)
                + rigaBox('Iscrizioni totali', String(c.totale), 330)
                + rigaBox('Iscrizioni in attesa di conferma mail', String(a), 330)
            ) + '</td></tr>'
            + spazio(30)
            + occhiello('Iscrizioni confermate il ' + giornoTesto)
            + '<tr><td>' + tabella(n ? c.nuove.map(p => riga(p, p.ora ? 'confermata alle ' + p.ora : '')).join('') : vuoto('Nessuna nuova conferma nella giornata.')) + '</td></tr>'
            + (a ? spazio(30)
                + occhiello('In attesa di conferma email')
                + '<tr><td class="par" style="' + FONTE + 'font-size:14px;line-height:22px;color:' + C.tenue + ';padding:10px 0 2px;text-align:justify;">Hanno inviato il modulo e verificato il cellulare, ma non hanno ancora premuto il pulsante nella mail di conferma. Restano in questo elenco finché non confermano; quel giorno passano fra le confermate.</td></tr>'
                + '<tr><td>' + tabella(c.inAttesa.map(p => riga(p, 'iscritto il ' + p.iscritto + (p.ora ? ' alle ' + p.ora : ''))).join('')) + '</td></tr>'
                : '')
            + spazio(30)
            + bottone('Apri le iscrizioni nell\'area riservata', link)
            + spazio(16)
            + '<tr><td class="par" style="' + FONTE + 'font-size:14px;line-height:22px;color:' + C.tenue + ';text-align:justify;">Nell\'area riservata, alla voce «Iscrizioni Eventi NGB», trovi l\'elenco completo; da lì si può anche rimandare a chi è in attesa la mail di conferma.</td></tr>'
        )
        + piedePer(pagina, 'Riepilogo automatico per gli organizzatori: parte a mezzanotte quando ci sono conferme nuove o iscrizioni in attesa.'));
    const txtPersona = (p, nota) => '- ' + p.nome + (nota ? ' (' + nota + ')' : '')
        + ([p.azienda, p.ruolo].filter(Boolean).length ? '\n  ' + [p.azienda, p.ruolo].filter(Boolean).join(' - ') : '')
        + '\n  ' + [p.email, p.telefono].filter(Boolean).join(' - ')
        + (p.invito ? '\n  Azienda invitata: ' + p.invito : '');
    const testo = ['RIEPILOGO ISCRIZIONI DEL ' + giornoTesto, sommario,
        'Iscrizioni di oggi: ' + n + '\nIscrizioni totali: ' + c.totale + '\nIscrizioni in attesa di conferma mail: ' + a,
        'ISCRIZIONI CONFERMATE IL ' + giornoTesto + '\n' + (n ? c.nuove.map(p => txtPersona(p, p.ora ? 'confermata alle ' + p.ora : '')).join('\n') : 'Nessuna nuova conferma nella giornata.'),
        a ? 'IN ATTESA DI CONFERMA EMAIL\n' + c.inAttesa.map(p => txtPersona(p, 'iscritto il ' + p.iscritto + (p.ora ? ' alle ' + p.ora : ''))).join('\n') : '',
        'Tutte le iscrizioni nell\'area riservata: ' + link,
        '--', 'Riepilogo automatico per gli organizzatori: parte a mezzanotte quando ci sono conferme nuove o iscrizioni in attesa.'].filter(Boolean).join('\n\n');
    return { oggetto: oggetto, html: html, testo: testo };
}

/* IL RIEPILOGO DI MEZZANOTTE DEGLI ADERENTI (cena e meeting di Milano).
   E' il gemello di riepilogoIscrizioni, con due differenze che vengono dal
   modulo degli aderenti: non c'e' una conferma dell'email (l'iscrizione vale
   da quando arriva, e all'iscritto e' gia' partita la mail con quota e dati
   di fatturazione), e da ogni iscrizione parte una fattura. Percio' niente
   "in attesa di conferma" e niente "confermata alle": per ogni persona i
   recapiti, i dati per la fattura, la quota e le note per la cena; chi ha
   inviato di nuovo il modulo sta in un elenco suo, con i campi cambiati.
   `c` e' quello che restituisce contiAderenti (lib/riepilogo-iscrizioni.js). */
function euroIt(n) {
    return Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function riepilogoAderenti(c, link, giornoTesto) {
    const q = c.quota || {};
    const pagina = (q.luogo || 'Milano') + ' 26 Febbraio 2027';
    const titolo = q.titolo || 'Cena e meeting degli aderenti Revilaw';
    const n = c.nuove.length;
    const u = c.aggiornate.length;
    const oggetto = 'Iscrizioni aderenti ' + (q.luogo || '') + ' - ' + n + (n === 1 ? ' nuova' : ' nuove')
        + (u ? ', ' + u + (u === 1 ? ' aggiornata' : ' aggiornate') : '') + ' il ' + giornoTesto
        + ' (totale ' + c.totale + ')';
    const sommario = (n
        ? 'Il ' + giornoTesto + ' ' + (n === 1 ? 'si è iscritto un aderente' : 'si sono iscritti ' + n + ' aderenti') + ' a «' + titolo + '».'
        : 'Il ' + giornoTesto + ' nessuna nuova iscrizione degli aderenti.')
        + (u ? ' ' + (u === 1 ? 'Un iscritto ha' : u + ' iscritti hanno') + ' inviato di nuovo il modulo: valgono i dati qui sotto.' : '')
        + ' Gli iscritti sono ' + c.totale + ' in tutto; '
        + (c.daFatturare ? 'fatture da emettere: ' + c.daFatturare + ' (' + euroIt(c.totaleDaFatturare) + ' IVA inclusa).' : 'nessuna fattura da emettere.');
    const fatturaRighe = f => [
        ['Intestatario', f.intestatario], ['Partita IVA', f.partitaIva], ['Codice fiscale', f.codiceFiscale],
        ['Sede', f.sede], ['Codice destinatario', f.codiceDestinatario], ['PEC', f.pec], ['Email per la fattura', f.emailFatture]
    ].filter(x => x[1]);
    const voce = (p, nota, cambiati) => {
        const piccolo = (t, colore) => '<tr><td colspan="2" style="' + FONTE + 'font-size:14px;line-height:21px;color:' + (colore || C.tenue) + ';padding-top:2px;">' + t + '</td></tr>';
        return '<tr><td style="padding:14px 0;border-bottom:1px solid ' + C.bordo + ';">' + tabella(
            '<tr><td style="' + FONTE + 'font-size:16px;line-height:22px;font-weight:bold;color:' + C.scuro + ';">' + esc(p.nome) + '</td>'
            + '<td align="right" valign="top" style="' + FONTE + 'font-size:13px;line-height:22px;color:' + C.tenue + ';text-align:right;white-space:nowrap;">' + esc(nota) + '</td></tr>'
            + ((p.studio || p.citta) ? '<tr><td colspan="2" style="' + FONTE + 'font-size:15px;line-height:22px;color:' + C.testo + ';padding-top:2px;">' + esc([p.studio, p.citta].filter(Boolean).join(' · ')) + '</td></tr>' : '')
            + piccolo([p.email ? '<a href="mailto:' + esc(p.email) + '" style="color:' + C.tenue + ';text-decoration:underline;">' + esc(p.email) + '</a>' : '', esc(p.telefono)].filter(Boolean).join(' &middot; '))
            + (cambiati ? piccolo(esc(cambiati), C.accento) : '')
            + '<tr><td colspan="2" style="' + FONTE + 'font-size:13px;line-height:20px;letter-spacing:1px;text-transform:uppercase;color:' + C.accento + ';font-weight:bold;padding-top:10px;">Dati per la fattura</td></tr>'
            + fatturaRighe(p.fatturazione).map(x => '<tr><td width="150" valign="top" style="' + FONTE + 'font-size:14px;line-height:21px;color:' + C.tenue + ';padding:2px 12px 0 0;white-space:nowrap;">' + esc(x[0]) + '</td>'
                + '<td valign="top" style="' + FONTE + 'font-size:14px;line-height:21px;color:' + C.scuro + ';font-weight:bold;padding-top:2px;">' + esc(x[1]) + '</td></tr>').join('')
            + '<tr><td width="150" valign="top" style="' + FONTE + 'font-size:14px;line-height:21px;color:' + C.tenue + ';padding:2px 12px 0 0;white-space:nowrap;">Quota</td>'
            + '<td valign="top" style="' + FONTE + 'font-size:14px;line-height:21px;color:' + C.scuro + ';font-weight:bold;padding-top:2px;">' + esc(euroIt(p.totale)) + ' IVA inclusa' + (p.fatturaEmessa ? ' · fattura già emessa' : '') + '</td></tr>'
            + '<tr><td width="150" valign="top" style="' + FONTE + 'font-size:14px;line-height:21px;color:' + C.tenue + ';padding:2px 12px 0 0;">Note per la cena</td>'
            + '<td valign="top" style="' + FONTE + 'font-size:14px;line-height:21px;color:' + (p.note ? C.scuro : C.tenue) + ';padding-top:2px;">' + esc(p.note || 'nessuna') + '</td></tr>'
        ) + '</td></tr>';
    };
    const cosaCambia = p => p.cambiati == null ? 'Dati di fatturazione: confrontali con quelli che avevi.'
        : (p.cambiati.length ? 'Cambiati: ' + p.cambiati.join(', ') + '.' : 'Dati di fatturazione invariati.');
    const notaNuova = p => p.ora ? 'iscritto alle ' + p.ora + (p.aggiornataAlle ? ', corretto alle ' + p.aggiornataAlle : '') : '';
    const vuoto = (t) => '<tr><td class="par" style="' + FONTE + 'font-size:15px;line-height:24px;color:' + C.tenue + ';padding:14px 0;border-bottom:1px solid ' + C.bordo + ';">' + esc(t) + '</td></tr>';
    /* La fascia della testata dice quello a cui si iscrivono gli aderenti -
       la cena, il meeting e la quota - e non la data e l'orario del
       convegno, che qui non c'entrano. */
    const tema = temaEvento(pagina);
    const maiuscola = x => String(x || '').charAt(0).toUpperCase() + String(x || '').slice(1);
    const datiQuota = (q.voci || []).slice(0, 2).map(v => [v.cosa, maiuscola(v.quando)])
        .concat(q.imponibile ? [['Quota', euroIt(q.imponibile).replace(',00', '') + ' + IVA']] : []);
    const titoloTestata = 'Riepilogo iscrizioni aderenti del ' + giornoTesto;
    const html = involucro(oggetto, sommario,
        (tema ? testataEvento(Object.assign({}, tema, datiQuota.length ? { dati: datiQuota } : {}), titoloTestata, sommario) : testata(titoloTestata, sommario))
        + corpo(
            '<tr><td>' + box(
                rigaBox('Iscrizioni di oggi', String(n), 330)
                + (u ? rigaBox('Iscrizioni aggiornate oggi', String(u), 330) : '')
                + rigaBox('Iscrizioni totali', String(c.totale), 330)
                + rigaBox('Fatture da emettere', c.daFatturare ? c.daFatturare + ' (' + euroIt(c.totaleDaFatturare) + ')' : '0', 330)
            ) + '</td></tr>'
            + spazio(30)
            + occhiello('Nuove iscrizioni del ' + giornoTesto)
            + '<tr><td>' + tabella(n ? c.nuove.map(p => voce(p, notaNuova(p))).join('') : vuoto('Nessuna nuova iscrizione nella giornata.')) + '</td></tr>'
            + (u ? spazio(30)
                + occhiello('Iscrizioni aggiornate')
                + '<tr><td class="par" style="' + FONTE + 'font-size:14px;line-height:22px;color:' + C.tenue + ';padding:10px 0 2px;text-align:justify;">Iscritti nei giorni scorsi che oggi hanno inviato di nuovo il modulo con lo stesso indirizzo email: valgono questi dati, che sostituiscono i precedenti.</td></tr>'
                + '<tr><td>' + tabella(c.aggiornate.map(p => voce(p, 'aggiornato alle ' + p.aggiornataAlle, cosaCambia(p))).join('')) + '</td></tr>'
                : '')
            + spazio(30)
            + bottone('Apri le iscrizioni nell\'area riservata', link)
            + spazio(16)
            + '<tr><td class="par" style="' + FONTE + 'font-size:14px;line-height:22px;color:' + C.tenue + ';text-align:justify;">Per gli aderenti non c\'è la conferma dell\'email: l\'iscrizione vale dall\'invio del modulo, e all\'iscritto è già arrivata la mail con la quota e i dati di fatturazione. Nell\'area riservata, alla voce «Iscrizioni Eventi NGB», evento di Milano, «Aderenti» › «Apri le iscrizioni», trovi l\'elenco completo e segni le fatture emesse.</td></tr>'
        )
        + piedePer(pagina, 'Riepilogo automatico per gli organizzatori: parte a mezzanotte quando ci sono iscrizioni degli aderenti nuove o aggiornate.'));
    const txtPersona = (p, nota, cambiati) => '- ' + p.nome + (nota ? ' (' + nota + ')' : '')
        + ([p.studio, p.citta].filter(Boolean).length ? '\n  ' + [p.studio, p.citta].filter(Boolean).join(' - ') : '')
        + '\n  ' + [p.email, p.telefono].filter(Boolean).join(' - ')
        + (cambiati ? '\n  ' + cambiati : '')
        + '\n  Fattura: ' + fatturaRighe(p.fatturazione).map(x => x[0] + ' ' + x[1]).join('; ')
        + '\n  Quota: ' + euroIt(p.totale) + ' IVA inclusa' + (p.fatturaEmessa ? ' (fattura già emessa)' : '')
        + '\n  Note per la cena: ' + (p.note || 'nessuna');
    const testo = ['RIEPILOGO ISCRIZIONI ADERENTI DEL ' + giornoTesto, titolo, sommario,
        'Iscrizioni di oggi: ' + n + (u ? '\nIscrizioni aggiornate oggi: ' + u : '') + '\nIscrizioni totali: ' + c.totale
            + '\nFatture da emettere: ' + (c.daFatturare ? c.daFatturare + ' (' + euroIt(c.totaleDaFatturare) + ')' : '0'),
        'NUOVE ISCRIZIONI DEL ' + giornoTesto + '\n' + (n ? c.nuove.map(p => txtPersona(p, notaNuova(p))).join('\n') : 'Nessuna nuova iscrizione nella giornata.'),
        u ? 'ISCRIZIONI AGGIORNATE\n' + c.aggiornate.map(p => txtPersona(p, 'aggiornato alle ' + p.aggiornataAlle, cosaCambia(p))).join('\n') : '',
        'Tutte le iscrizioni nell\'area riservata: ' + link,
        '--', 'Riepilogo automatico per gli organizzatori: parte a mezzanotte quando ci sono iscrizioni degli aderenti nuove o aggiornate.'].filter(Boolean).join('\n\n');
    return { oggetto: oggetto, html: html, testo: testo };
}

module.exports = { riepilogoIscrizioni, riepilogoAderenti, confermaSito, invitoIngresso, confermaVariazioni, confermaB2B, confermaB2BAzienda, invitoB2BAnnullato, nomeEvento };
