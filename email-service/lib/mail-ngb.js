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

/* I DUE TOTALI, nella mail di mezzanotte (riepilogoSerale): `t` viene
   da lib/riepilogo-iscrizioni.js (totali) ed e' null se le iscrizioni degli
   aderenti o le presenze non si sono potute leggere - allora la mail resta
   com'era, senza un totale a meta'. Le righe del riquadro e la frase che dice
   che cosa conta ciascun numero: "aziende" e "aziende + aderenti" non si
   devono poter confondere. */
function aderentiTesto(t) {
    return String(t.aderenti) + (t.soloConvegno ? ' (' + t.cena + ' cena e meeting, ' + t.soloConvegno + ' solo convegno)' : '');
}
function righeTotali(t) {
    return rigaBox('Totale aziende', String(t.aziende), 330)
        + rigaBox('Aderenti', aderentiTesto(t), 330)
        + rigaBox('Totale aziende + aderenti', String(t.tutti), 330);
}
function spiegaTotali(t) {
    return 'Totale aziende: le persone iscritte al convegno, in sala e online, senza gli aderenti e senza chi aspetta di confermare l\'email. '
        + 'Totale aziende + aderenti: in più gli aderenti, cioè gli iscritti alla cena e al meeting'
        + (t.soloConvegno ? ' e quelli iscritti al solo convegno' : '') + '.'
        + (t.anche ? ' ' + (t.anche === 1 ? 'Un aderente è iscritto' : t.anche + ' aderenti sono iscritti') + ' anche al convegno: si conta una volta sola.' : '');
}
function testoTotali(t) {
    return 'Totale aziende: ' + t.aziende + '\nAderenti: ' + aderentiTesto(t) + '\nTotale aziende + aderenti: ' + t.tutti;
}
function notaTotali(t) {
    return '<tr><td class="par" style="' + FONTE + 'font-size:13px;line-height:20px;color:' + C.tenue + ';padding:10px 0 0;text-align:justify;">' + esc(spiegaTotali(t)) + '</td></tr>';
}

/* ============================================================
   IL RIEPILOGO DI MEZZANOTTE, UNO SOLO per aziende e aderenti
   ------------------------------------------------------------
   Una mail interna agli organizzatori per evento (oggi Milano): prima
   erano due, una per le aziende del convegno e una per gli aderenti della
   cena e del meeting, e si leggevano insieme - con i totali dell'evento a
   cavallo fra le due. Dentro, in quest'ordine:
     - LA GIORNATA in numeri (nuove conferme e attese delle aziende,
       iscrizioni nuove e corrette degli aderenti, fatture da emettere);
     - I DUE TOTALI dell'evento, aziende e aziende + aderenti, con la frase
       che dice che cosa conta ciascuno (righeTotali);
     - GLI ADERENTI: per ogni quota le iscrizioni nuove (primaVolta) e quelle
       corrette (con i campi della fatturazione cambiati), con recapiti, dati
       per la fattura, quota e note per la cena. Per loro non c'e' una
       conferma dell'email; il periodo puo' essere piu' di un giorno, quando
       una notte la mail non e' partita e la notte dopo recupera. Vengono
       PRIMA delle aziende: i dati per la fattura stanno solo qui;
     - LE AZIENDE: le iscrizioni completate nella giornata (l'email
       confermata quel giorno, `ora` = l'ora della conferma) e chi aspetta
       ancora di confermare (`iscritto` = giorno, `ora` = ora del modulo),
       che torna ogni notte finche' non conferma (gli ultimi
       MAX_IN_ATTESA_MAIL arrivati, i piu' vecchi contati). Se con gli
       aderenti la mail passerebbe LIMITE_MAIL, gli elenchi delle aziende si
       accorciano (prima gli in attesa, poi le confermate) e la mail dice
       quante ne mancano: i numeri restano tutti nel riquadro in cima. Se non
       basta (anche senza aziende la mail passa il taglio vero di Gmail) le
       aziende restano intere e in cima un avviso dice come leggerla tutta;
   OGNI PERSONA E' UN BLOCCO SOLO, una cella con le righe separate da <br>:
   con una riga di tabella per campo una giornata con venti aderenti
   superava i 102 KB oltre i quali Gmail tronca il messaggio. Niente colonne
   fisse e niente "nowrap" nei blocchi degli aderenti: sul telefono non
   escono dallo schermo.
   d: {
     giornoTesto  il giorno raccontato ("15/01/2027");
     ev           l'evento (VERIFICATA.EVENTI);
     az           i conti delle aziende (lib/riepilogo-iscrizioni.js, conti):
                  { nuove, inAttesa, totale }, o null se non si sono letti;
     azNota       una riga da dire sulle aziende (lettura fallita...), o '';
     ad           [{ c, dalTesto }]: i conti di ogni quota (contiAderenti) e
                  l'inizio del periodo, se diverso dal giorno;
     adNota       come azNota, per gli aderenti;
     t            i due totali (lib/riepilogo-iscrizioni.js, totali), o null
   }
   `link` porta alle iscrizioni nell'area riservata. */
function euroIt(n) {
    return Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
const ET_NOTE_CENA = 'Note (allergie, intolleranze, altre indicazioni)';
const MAIL_KO_ADERENTE = 'La mail all\'iscritto con quota e dati di fatturazione NON è partita: scrivigli tu.';
function fatturaRighe(f) {
    f = f || {};
    return [
        ['Intestatario', f.intestatario], ['Partita IVA', f.partitaIva], ['Codice fiscale', f.codiceFiscale],
        ['Sede', f.sede], ['Codice destinatario', f.codiceDestinatario], ['PEC', f.pec], ['Email per la fattura', f.emailFatture]
    ].filter(x => x[1]);
}
/* Una persona delle aziende: un blocco solo, come gli aderenti (la tabella
   per riga di prima pesava il doppio, e la mail ha un tetto). */
function rigaAzienda(p, nota) {
    return '<tr><td style="' + FONTE + 'font-size:14px;line-height:21px;color:' + C.tenue + ';padding:12px 0;border-bottom:1px solid ' + C.bordo + ';word-wrap:break-word;overflow-wrap:anywhere;word-break:break-word;">'
        + '<b style="font-size:16px;line-height:22px;color:' + C.scuro + ';">' + esc(p.nome) + '</b>'
        + (nota ? ' <span style="font-size:13px;">&middot; ' + esc(nota) + '</span>' : '')
        + ((p.azienda || p.ruolo) ? '<br><span style="font-size:15px;color:' + C.testo + ';">' + esc([p.azienda, p.ruolo].filter(Boolean).join(' · ')) + '</span>' : '')
        + '<br>' + [p.email ? '<a href="mailto:' + esc(p.email) + '" style="color:' + C.tenue + ';text-decoration:underline;">' + esc(p.email) + '</a>' : '', esc(p.telefono)].filter(Boolean).join(' &middot; ')
        + (p.invito ? '<br><span style="font-size:13px;color:' + C.accento + ';">Azienda invitata: ' + esc(p.invito) + '</span>' : '')
        + '</td></tr>';
}
/* Quanti "in attesa" si elencano: la lista torna ogni notte finche' non
   confermano, e cresce per tutto il periodo delle iscrizioni. Si elencano
   gli ultimi arrivati (chi aspetta da settimane non e' una notizia); i piu'
   vecchi si contano, e l'elenco completo sta nell'area riservata. */
const MAX_IN_ATTESA_MAIL = 40;
/* Il tetto del riepilogo: Gmail tronca un messaggio oltre i 102 KB. La
   parte HTML si misura come viaggia, in quoted-printable (la codifica che
   nodemailer sceglie per un testo quasi tutto latino): ogni byte fuori
   dall'ASCII stampabile, e ogni "=", diventa tre caratteri, e ogni riga di
   76 ne aggiunge tre per l'a capo. Per un testo italiano e' il 7% in piu'
   dei byte; per dei nomi in cirillico anche il triplo. */
const LIMITE_MAIL = 98 * 1024;
const TAGLIO_GMAIL = 102 * 1024;
function pesoInPosta(x) {
    let n = 0;
    for (const c of Buffer.from(String(x), 'utf8')) n += (c === 0x3d || c > 0x7e || (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d)) ? 3 : 1;
    return n + Math.ceil(n / 73) * 3;
}
const AVVISO_MAIL_LUNGA = 'Stanotte la mail è molto lunga e Gmail potrebbe accorciarla: se in fondo vedi «[Messaggio troncato]», apri «Visualizza intero messaggio» per leggerla tutta. Gli aderenti, con i dati per la fattura, sono anche nell\'area riservata, in «Aderenti» › «Apri le iscrizioni».';
function testoAzienda(p, nota) {
    return '- ' + p.nome + (nota ? ' (' + nota + ')' : '')
        + ([p.azienda, p.ruolo].filter(Boolean).length ? '\n  ' + [p.azienda, p.ruolo].filter(Boolean).join(' - ') : '')
        + '\n  ' + [p.email, p.telefono].filter(Boolean).join(' - ')
        + (p.invito ? '\n  Azienda invitata: ' + p.invito : '');
}
// una persona degli aderenti: un blocco solo (vedi sopra); gli indirizzi lunghi (una PEC di studio) vanno a capo
function bloccoAderente(p, nota, cambiati) {
    const et = t => '<span style="color:' + C.tenue + ';">' + esc(t) + ':</span> ';
    return '<tr><td style="' + FONTE + 'font-size:14px;line-height:21px;color:' + C.scuro + ';padding:14px 0;border-bottom:1px solid ' + C.bordo + ';word-wrap:break-word;overflow-wrap:anywhere;word-break:break-word;">'
        + '<b style="font-size:16px;line-height:22px;">' + esc(p.nome) + '</b>'
        + (nota ? ' <span style="font-size:13px;color:' + C.tenue + ';">&middot; ' + esc(nota) + '</span>' : '')
        + ((p.studio || p.citta) ? '<br><span style="font-size:15px;color:' + C.testo + ';">' + esc([p.studio, p.citta].filter(Boolean).join(' · ')) + '</span>' : '')
        + '<br><span style="color:' + C.tenue + ';">' + [p.email ? '<a href="mailto:' + esc(p.email) + '" style="color:' + C.tenue + ';text-decoration:underline;">' + esc(p.email) + '</a>' : '', esc(p.telefono)].filter(Boolean).join(' &middot; ') + '</span>'
        + (cambiati ? '<br><span style="color:' + C.accento + ';">' + esc(cambiati) + '</span>' : '')
        + (p.mailNonPartita ? '<br><b style="color:#B42318;">' + esc(MAIL_KO_ADERENTE) + '</b>' : '')
        + '<br><br><span style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:' + C.accento + ';font-weight:bold;">Dati per la fattura</span>'
        + fatturaRighe(p.fatturazione).map(x => '<br>' + et(x[0]) + '<b>' + esc(x[1]) + '</b>').join('')
        + '<br>' + et('Quota') + '<b>' + esc(euroIt(p.totale)) + ' IVA inclusa</b>' + (p.fatturaEmessa ? ' &middot; fattura già emessa' : '')
        + '<br>' + et(ET_NOTE_CENA) + (p.note ? '<b>' + esc(p.note) + '</b>' : '<span style="color:' + C.tenue + ';">nessuna</span>')
        + '</td></tr>';
}
function testoAderente(p, nota, cambiati) {
    return '- ' + p.nome + (nota ? ' (' + nota + ')' : '')
        + ([p.studio, p.citta].filter(Boolean).length ? '\n  ' + [p.studio, p.citta].filter(Boolean).join(' - ') : '')
        + '\n  ' + [p.email, p.telefono].filter(Boolean).join(' - ')
        + (cambiati ? '\n  ' + cambiati : '')
        + (p.mailNonPartita ? '\n  ' + MAIL_KO_ADERENTE : '')
        + '\n  Fattura: ' + fatturaRighe(p.fatturazione).map(x => x[0] + ' ' + x[1]).join('; ')
        + '\n  Quota: ' + euroIt(p.totale) + ' IVA inclusa' + (p.fatturaEmessa ? ' (fattura già emessa)' : '')
        + '\n  ' + ET_NOTE_CENA + ': ' + (p.note || 'nessuna');
}
function cosaCambiaAderente(p) {
    return p.cambiati == null ? 'Dati di fatturazione: confrontali con quelli che avevi.'
        : (p.cambiati.length ? 'Cambiati: ' + p.cambiati.join(', ') + '.' : 'Dati di fatturazione invariati.');
}
function riepilogoSerale(d, link) {
    const ev = d.ev || {};
    const giornoTesto = d.giornoTesto;
    const pagina = (ev.nome || 'Milano') + ' 26 Febbraio 2027';
    const t = d.t || null;
    const az = d.az || null;
    const ads = (d.ad || []).filter(x => x && x.c);
    const n = az ? az.nuove.length : 0;
    const a = az ? az.inAttesa.length : 0;
    const somma = f => ads.reduce((x, y) => x + f(y.c), 0);
    const nA = somma(c => c.nuove.length);
    const uA = somma(c => c.aggiornate.length);
    const daFatt = somma(c => c.daFatturare || 0);
    const daFattEuro = Math.round(somma(c => c.totaleDaFatturare || 0) * 100) / 100;
    const vuoto = x => '<tr><td class="par" style="' + FONTE + 'font-size:15px;line-height:24px;color:' + C.tenue + ';padding:14px 0;border-bottom:1px solid ' + C.bordo + ';">' + esc(x) + '</td></tr>';
    const piccolo = x => '<tr><td class="par" style="' + FONTE + 'font-size:14px;line-height:22px;color:' + C.tenue + ';padding:10px 0 2px;text-align:justify;">' + esc(x) + '</td></tr>';
    const maiuscola = x => String(x || '').charAt(0).toUpperCase() + String(x || '').slice(1);

    const pezzi = [];
    if (az) pezzi.push('aziende: ' + n + (n === 1 ? ' confermata' : ' confermate') + (a ? ', ' + a + ' in attesa' : ''));
    // una notte recuperata: il periodo degli aderenti si dice gia' nell'oggetto
    const periodoAd = ads.length && ads[0].dalTesto && ads[0].dalTesto !== giornoTesto ? ' dal ' + ads[0].dalTesto + ' al ' + giornoTesto : '';
    if (ads.length) pezzi.push('aderenti' + periodoAd + ': ' + nA + (nA === 1 ? ' nuova' : ' nuove') + (uA ? ', ' + uA + (uA === 1 ? ' aggiornata' : ' aggiornate') : ''));
    const oggetto = 'Iscrizioni ' + (ev.nome || '') + ' del ' + giornoTesto + (pezzi.length ? ' - ' + pezzi.join('; ') : '')
        + (t ? ' (aziende ' + t.aziende + ', con gli aderenti ' + t.tutti + ')' : (az ? ' (aziende confermate in tutto ' + az.totale + ')' : ''));
    const fraseAz = az ? 'Aziende: ' + (n
        ? (n === 1 ? 'una persona ha completato l\'iscrizione' : n + ' persone hanno completato l\'iscrizione') + ' confermando l\'email'
        : 'nessuna nuova iscrizione confermata')
        + (a ? '; ' + (a === 1 ? 'una persona attende' : a + ' persone attendono') + ' ancora di confermare l\'email' : '') + '.' : '';
    const fraseAd = ads.length ? 'Aderenti' + periodoAd + ': ' + (nA
        ? (nA === 1 ? 'una nuova iscrizione' : nA + ' nuove iscrizioni') + ' alla cena e al meeting'
        : 'nessuna nuova iscrizione alla cena e al meeting')
        + (uA ? ', ' + (uA === 1 ? 'una aggiornata' : uA + ' aggiornate') : '')
        + (daFatt ? '; fatture da emettere: ' + daFatt + ' (' + euroIt(daFattEuro) + ' IVA inclusa)' : '; nessuna fattura da emettere') + '.' : '';
    const fraseT = t ? 'Totale aziende: ' + t.aziende + '; totale aziende + aderenti: ' + t.tutti + '.' : '';
    const sommario = [fraseAz, fraseAd, fraseT].filter(Boolean).join(' ');

    /* LE AZIENDE: nell'HTML le prime kN confermate e gli ultimi kA in attesa
       (vedi LIMITE_MAIL); il testo semplice ha tutte le confermate e gli
       ultimi MAX_IN_ATTESA_MAIL in attesa. inAttesa e' in ordine di arrivo. */
    const ultimiA = az ? az.inAttesa.slice(-MAX_IN_ATTESA_MAIL) : [];
    const altriA = k => (a - k === 1 ? 'E un altro, iscritto' : 'E altri ' + (a - k) + ', iscritti') + ' prima di questi: l\'elenco completo è nell\'area riservata';
    const righeN = az ? az.nuove.map(p => rigaAzienda(p, p.ora ? 'confermata alle ' + p.ora : '')) : [];
    const righeA = ultimiA.map(p => rigaAzienda(p, 'iscritto il ' + p.iscritto + (p.ora ? ' alle ' + p.ora : '')));
    const htmlAziende = (kN, kA) => {
        let h = '';
        if (az) {
            h = occhiello('Aziende: iscrizioni confermate il ' + giornoTesto)
                + (n && !kN ? '' : '<tr><td>' + tabella(n ? righeN.slice(0, kN).join('') : vuoto('Nessuna nuova conferma nella giornata.')) + '</td></tr>')
                + (kN < n ? piccolo((kN ? (n - kN === 1 ? 'E un\'altra conferma' : 'E altre ' + (n - kN) + ' conferme') + ': l\'elenco completo è' : 'Stanotte la mail non ha posto per l\'elenco delle conferme: lo trovi')
                    + ' nell\'area riservata, alla voce «Iscrizioni Eventi NGB».') : '')
                + (a ? spazio(24) + occhiello('Aziende: in attesa di conferma email')
                    + piccolo('Hanno inviato il modulo e verificato il cellulare, ma non hanno ancora premuto il pulsante nella mail di conferma. Restano in attesa finché non confermano; quel giorno passano fra le confermate.')
                    + (kA ? '<tr><td>' + tabella(righeA.slice(righeA.length - kA).join('')) + '</td></tr>' : '')
                    + (kA < a ? piccolo((kA ? altriA(kA) : 'Stanotte la mail non ha posto per l\'elenco: lo trovi nell\'area riservata')
                        + ', nella sezione «In attesa di conferma mail».') : '')
                    : '');
        }
        if (d.azNota) h += (h ? spazio(16) : occhiello('Aziende')) + piccolo(d.azNota);
        return h;
    };
    let testoAz = '';
    if (az) {
        testoAz = 'AZIENDE: ISCRIZIONI CONFERMATE IL ' + giornoTesto + '\n'
            + (n ? az.nuove.map(p => testoAzienda(p, p.ora ? 'confermata alle ' + p.ora : '')).join('\n') : 'Nessuna nuova conferma nella giornata.')
            + (a ? '\n\nAZIENDE: IN ATTESA DI CONFERMA EMAIL\n' + ultimiA.map(p => testoAzienda(p, 'iscritto il ' + p.iscritto + (p.ora ? ' alle ' + p.ora : ''))).join('\n')
                + (a > ultimiA.length ? '\n' + altriA(ultimiA.length) + '.' : '') : '');
    }
    if (d.azNota) testoAz += (testoAz ? '\n' : 'AZIENDE\n') + d.azNota;

    // GLI ADERENTI, quota per quota
    const notaNuova = p => p.arrivata ? 'iscrizione ' + p.arrivata + (p.corretta ? ', corretta ' + p.corretta : '') : '';
    const notaAggiornata = p => 'aggiornata ' + p.corretta;
    let htmlAd = '', testoAd = '';
    ads.forEach((x, i) => {
        const c = x.c, q = c.quota || {};
        const periodo = x.dalTesto && x.dalTesto !== giornoTesto;
        const quando = periodo ? 'dal ' + x.dalTesto + ' al ' + giornoTesto : 'del ' + giornoTesto;
        const datiQuota = (q.voci || []).slice(0, 2).map(v => [v.cosa, maiuscola(v.quando)])
            .concat(q.imponibile ? [['Quota', euroIt(q.imponibile).replace(',00', '') + ' + IVA']] : []);
        const titolo = q.titolo || 'Cena e meeting degli aderenti Revilaw';
        const nn = c.nuove.length, uu = c.aggiornate.length;
        htmlAd += (i ? spazio(30) : '')
            + occhiello('Aderenti: nuove iscrizioni ' + quando)
            + piccolo(titolo + (datiQuota.length ? ' - ' + datiQuota.map(v => v[0] + ': ' + v[1]).join(' - ') : '') + '. Iscritti: ' + c.totale + '.')
            + '<tr><td>' + tabella(nn ? c.nuove.map(p => bloccoAderente(p, notaNuova(p))).join('') : vuoto('Nessuna nuova iscrizione.')) + '</td></tr>'
            + (uu ? spazio(24) + occhiello('Aderenti: iscrizioni aggiornate')
                + piccolo('Iscrizioni arrivate nei giorni scorsi per le quali è stato inviato di nuovo il modulo con lo stesso indirizzo email: valgono questi dati, che sostituiscono i precedenti.')
                + '<tr><td>' + tabella(c.aggiornate.map(p => bloccoAderente(p, notaAggiornata(p), cosaCambiaAderente(p))).join('')) + '</td></tr>'
                : '');
        testoAd += (i ? '\n\n' : '') + 'ADERENTI: NUOVE ISCRIZIONI ' + quando.toUpperCase() + '\n'
            + titolo + (datiQuota.length ? '\n' + datiQuota.map(v => v[0] + ': ' + v[1]).join(' - ') : '') + '\nIscritti: ' + c.totale + '\n'
            + (nn ? c.nuove.map(p => testoAderente(p, notaNuova(p))).join('\n') : 'Nessuna nuova iscrizione.')
            + (uu ? '\n\nADERENTI: ISCRIZIONI AGGIORNATE\n' + c.aggiornate.map(p => testoAderente(p, notaAggiornata(p), cosaCambiaAderente(p))).join('\n') : '');
    });
    if (d.adNota) {
        htmlAd += (htmlAd ? spazio(16) : occhiello('Aderenti')) + piccolo(d.adNota);
        testoAd += (testoAd ? '\n' : 'ADERENTI\n') + d.adNota;
    }

    const CHIUSURA = 'Per le aziende l\'iscrizione vale dopo la conferma dell\'email; per gli aderenti non c\'è la conferma dell\'email: l\'iscrizione vale dall\'invio del modulo, e all\'iscritto parte subito la mail con la quota e i dati di fatturazione (se non è partita, lo trovi scritto sotto il suo nome).';
    const DOVE = 'Nell\'area riservata, alla voce «Iscrizioni Eventi NGB», evento di ' + (ev.nome || 'Milano') + ', trovi l\'elenco completo delle aziende (da lì si rimanda la mail di conferma a chi è in attesa) e, in «Aderenti» › «Apri le iscrizioni», gli aderenti, dove si segnano le fatture emesse.';
    const MOTIVO = 'Riepilogo automatico per gli organizzatori: parte a mezzanotte quando ci sono conferme nuove o iscrizioni in attesa delle aziende, o iscrizioni nuove o corrette degli aderenti.';

    // una parte che non c'e' (non letta, gia' mandata) non ha numeri: niente zeri che direbbero il falso
    const giornata = (az ? rigaBox('Aziende: nuove conferme', String(n), 330)
        + rigaBox('Aziende: in attesa di conferma mail', String(a), 330) : '')
        + (ads.length ? rigaBox('Aderenti: nuove iscrizioni' + periodoAd, String(nA), 330)
            + (uA ? rigaBox('Aderenti: iscrizioni aggiornate', String(uA), 330) : '')
            + rigaBox('Aderenti: fatture da emettere', daFatt ? daFatt + ' (' + euroIt(daFattEuro) + ')' : '0', 330) : '');
    const componi = (htmlAz, lunga) => involucro(oggetto, sommario,
        testataPer(pagina, 'Riepilogo iscrizioni del ' + giornoTesto, sommario)
        + corpo(
            '<tr><td>' + box(giornata) + '</td></tr>'
            + (lunga ? '<tr><td class="par" style="' + FONTE + 'font-size:15px;line-height:23px;color:#B42318;font-weight:bold;padding:14px 0 0;text-align:justify;">' + esc(AVVISO_MAIL_LUNGA) + '</td></tr>' : '')
            + (t
                ? spazio(24) + occhiello('Totali dell\'evento') + '<tr><td>' + box(righeTotali(t)) + '</td></tr>' + notaTotali(t)
                : (az ? spazio(24) + '<tr><td>' + box(rigaBox('Aziende: iscrizioni confermate in tutto', String(az.totale), 330)) + '</td></tr>' : ''))
            /* PRIMA GLI ADERENTI: i loro dati per la fattura stanno solo qui, e
               oltre i 102 KB Gmail taglia la coda della mail. Se non c'e' posto
               si accorciano gli elenchi delle aziende (sotto), che sono
               comunque tutti nell'area riservata (vedi LIMITE_MAIL). */
            + (htmlAd ? spazio(30) + htmlAd : '')
            + (htmlAz ? spazio(30) + htmlAz : '')
            + spazio(30)
            + bottone('Apri le iscrizioni nell\'area riservata', link)
            + spazio(16)
            + '<tr><td class="par" style="' + FONTE + 'font-size:14px;line-height:22px;color:' + C.tenue + ';text-align:justify;">' + esc(CHIUSURA + ' ' + DOVE) + '</td></tr>'
        )
        + piedePer(pagina, MOTIVO));
    /* Troppo pesante: via le righe delle aziende (prima gli in attesa piu'
       vecchi, poi le ultime confermate), e si ricompone con le righe "E
       altri...". Se nemmeno senza aziende sta sotto il taglio vero di Gmail,
       toglierle non serve: restano intere, e l'avviso in cima dice come
       leggere la mail tutta. Fra LIMITE_MAIL e il taglio resta accorciata. */
    let kN = righeN.length, kA = righeA.length;
    let html = componi(htmlAziende(kN, kA));
    while (pesoInPosta(html) > LIMITE_MAIL && (kN || kA)) {
        let troppo = pesoInPosta(html) - LIMITE_MAIL;
        while (troppo > 0 && kA) { troppo -= pesoInPosta(righeA[righeA.length - kA]); kA--; }
        while (troppo > 0 && kN) troppo -= pesoInPosta(righeN[--kN]);
        html = componi(htmlAziende(kN, kA));
    }
    if (pesoInPosta(html) > TAGLIO_GMAIL) html = componi(htmlAziende(righeN.length, righeA.length), true);
    const testo = ['RIEPILOGO ISCRIZIONI DEL ' + giornoTesto, sommario,
        [az ? 'Aziende: nuove conferme: ' + n + '\nAziende: in attesa di conferma mail: ' + a : '',
            ads.length ? 'Aderenti: nuove iscrizioni' + periodoAd + ': ' + nA + (uA ? '\nAderenti: iscrizioni aggiornate: ' + uA : '')
                + '\nAderenti: fatture da emettere: ' + (daFatt ? daFatt + ' (' + euroIt(daFattEuro) + ')' : '0') : ''].filter(Boolean).join('\n'),
        t ? 'TOTALI DELL\'EVENTO\n' + testoTotali(t) + '\n' + spiegaTotali(t) : (az ? 'Aziende: iscrizioni confermate in tutto: ' + az.totale : ''),
        testoAd, testoAz,
        CHIUSURA + '\n' + DOVE,
        'Tutte le iscrizioni nell\'area riservata: ' + link,
        '--', MOTIVO].filter(Boolean).join('\n\n');
    return { oggetto: oggetto, html: html, testo: testo };
}

/* LA RISPOSTA DI UN'AZIENDA ALLA PEC DELL'INVITO, inoltrata ad
   Andrea Missori per posta ordinaria (lib/inoltro-risposte-pec.js). La
   casella PEC dello studio non la apre nessuno tutti i giorni: questa mail
   porta il messaggio dove lo si legge davvero.
   `d`: { azienda, da, oggetto, quandoTesto, certificata, pagina, eventoNome,
   sponsor, codice, testo, troncato, nonLetto, allegati: [{ nome, dimensione,
   allegato, motivo }], casella, rispondiA } - rispondiA e' l'indirizzo
   ORDINARIO a cui porta "Rispondi", se c'e' (quello da cui l'azienda ha
   scritto, se non era una PEC, o l'email della scheda); `motivo` dice
   perche' un allegato non e' allegato ('grande', 'troppi', altro).
   Il testo del messaggio va a capo dove
   andava a capo l'originale, e non si giustifica: e' una citazione, non una
   lettera nostra. */
function kb(n) {
    const v = Number(n || 0);
    return v >= 1024 * 1024 ? (v / (1024 * 1024)).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(v / 1024)) + ' KB';
}
function rispostaPec(d, link) {
    const azienda = String(d.azienda || '').trim() || String(d.da || '').trim() || 'Un\'azienda';
    const cosa = d.sponsor ? 'alla PEC con la richiesta di sponsorizzazione' : 'alla PEC dell\'invito';
    const oggetto = 'Risposta ' + (d.sponsor ? 'alla PEC di sponsorizzazione' : 'alla PEC dell\'invito') + ' - ' + azienda;
    const allegati = Array.isArray(d.allegati) ? d.allegati : [];
    const conAllegati = allegati.some(a => a.allegato);
    const sommario = azienda + ' ha risposto ' + cosa + (d.eventoNome ? ' (' + d.eventoNome + ')' : '') + '. '
        + (d.nonLetto ? 'Il testo non si è potuto leggere dalla casella: cercalo nella casella PEC.' : 'Il messaggio è qui sotto' + (conAllegati ? ', con i suoi allegati.' : '.'));
    const tipo = d.certificata ? 'PEC' : 'Email ordinaria arrivata nella casella PEC (senza valore di PEC)';
    const righeTesto = String(d.testo || '').split('\n').map(r => esc(r)).join('<br>');
    const dallaPec = 'dalla casella ' + (d.casella || 'PEC dello studio') + (d.da ? ' all\'indirizzo ' + d.da : '');
    const nota = !d.certificata && d.rispondiA
        ? 'L\'azienda ha scritto da un indirizzo email ordinario: rispondendo a questa email le scrivi lì (' + d.rispondiA + ').'
        : d.rispondiA
            ? 'Rispondendo a questa email scrivi all\'indirizzo email ordinario dell\'azienda (' + d.rispondiA + '). Per una risposta con valore di PEC scrivi ' + dallaPec + '.'
            : 'Per rispondere scrivi ' + dallaPec + ': una casella PEC di norma non accetta la posta ordinaria.';
    const perche = a => a.motivo === 'grande' ? 'Troppo grande per questa email: è nella casella PEC.'
        : a.motivo === 'troppi' ? 'Oltre il numero di allegati che questa email porta: è nella casella PEC.'
            : 'Non allegato a questa email: è nella casella PEC.';
    const rigaAllegato = a => '<tr><td style="' + FONTE + 'font-size:15px;line-height:22px;color:' + C.testo + ';padding:10px 0;border-bottom:1px solid ' + C.bordo + ';word-break:break-word;overflow-wrap:anywhere;">'
        + '<b>' + esc(a.nome) + '</b> <span style="color:' + C.tenue + ';">(' + esc(kb(a.dimensione)) + ')</span>'
        + (a.allegato ? '' : '<br><span style="font-size:13px;color:' + C.tenue + ';">' + esc(perche(a)) + '</span>')
        + '</td></tr>';
    const piccolo = t => '<tr><td class="par" style="' + FONTE + 'font-size:14px;line-height:22px;color:' + C.tenue + ';text-align:justify;">' + esc(t) + '</td></tr>';
    const html = involucro(oggetto, sommario,
        testataPer(d.pagina, d.sponsor ? 'Risposta alla PEC di sponsorizzazione' : 'Risposta alla PEC dell\'invito', sommario)
        + corpo(
            '<tr><td>' + box(
                rigaBox('Azienda', azienda, 150)
                + rigaBox('Da', d.da, 150)
                + rigaBox('Arrivata il', d.quandoTesto, 150)
                + rigaBox('Oggetto', d.oggetto, 150)
                + rigaBox('Tipo', tipo, 150)
                + rigaBox('Codice invito', d.codice, 150)
            ) + '</td></tr>'
            + spazio(30)
            + occhiello('Il messaggio')
            + (d.nonLetto
                ? '<tr><td class="par" style="' + FONTE + 'font-size:15px;line-height:24px;color:' + C.tenue + ';padding:14px 0;">'
                + esc('Il testo non si è potuto leggere (' + d.nonLetto + '). Cercalo nella casella PEC ' + (d.casella || 'dello studio') + '; nell\'area riservata, nella scheda dell\'azienda, ci sono la data e l\'oggetto.') + '</td></tr>'
                : '<tr><td bgcolor="' + C.chiaro + '" style="' + FONTE + 'font-size:15px;line-height:23px;color:' + C.testo + ';background-color:' + C.chiaro + ';padding:16px 18px;word-break:break-word;overflow-wrap:anywhere;">'
                + (righeTesto || '<i>(messaggio senza testo)</i>') + '</td></tr>'
                + (d.troncato ? spazio(8) + piccolo('Il messaggio è lungo: qui c\'è la prima parte, il resto è nella casella PEC.') : ''))
            + (allegati.length
                ? spazio(30) + occhiello('Allegati') + '<tr><td>' + tabella(allegati.map(rigaAllegato).join('')) + '</td></tr>'
                : '')
            + spazio(24)
            + piccolo(nota)
            + spazio(24)
            + bottone('Apri gli inviti nell\'area riservata', link)
        )
        + piedePer(d.pagina, 'Avviso automatico: parte quando un\'azienda risponde alla PEC dell\'invito.'));
    const testo = [oggetto.toUpperCase(), sommario,
        ['Azienda: ' + azienda, d.da ? 'Da: ' + d.da : '', d.quandoTesto ? 'Arrivata il: ' + d.quandoTesto : '',
            d.oggetto ? 'Oggetto: ' + d.oggetto : '', 'Tipo: ' + tipo, d.codice ? 'Codice invito: ' + d.codice : ''].filter(Boolean).join('\n'),
        'IL MESSAGGIO\n' + (d.nonLetto
            ? 'Il testo non si è potuto leggere (' + d.nonLetto + '): cercalo nella casella PEC.'
            : (String(d.testo || '') || '(messaggio senza testo)') + (d.troncato ? '\n\n[Il messaggio è lungo: il resto è nella casella PEC.]' : '')),
        allegati.length ? 'ALLEGATI\n' + allegati.map(a => '- ' + a.nome + ' (' + kb(a.dimensione) + ')' + (a.allegato ? '' : ' - ' + perche(a))).join('\n') : '',
        nota,
        'Gli inviti nell\'area riservata: ' + link,
        '--', 'Avviso automatico: parte quando un\'azienda risponde alla PEC dell\'invito.'].filter(Boolean).join('\n\n');
    return { oggetto: oggetto, html: html, testo: testo };
}

/* --- "L'invito vale per due persone" (lib/promemoria-seconda-persona.js) ---
   A chi si e' iscritto con il codice riservato alla sua azienda quando con
   quel codice e' iscritta una persona sola. SOLO TESTO, senza HTML: l'ha
   chiesto chi organizza, ed e' una lettera breve fra persone, non una
   comunicazione con la grafica dell'evento. Il codice sta da solo sulla sua
   riga, perche' si copi senza portarsi dietro la frase.
   d: { nome, cognome, azienda, codice, pagina, evento: { quando, luogo,
   indirizzo, url }, contatto } */
function secondaPersona(d) {
    const ev = d.evento || {};
    const evento = nomeEvento(d.pagina);
    const nomeCompleto = ((d.nome || '') + ' ' + (d.cognome || '')).trim();
    const dove = [ev.luogo, ev.indirizzo].filter(Boolean).join(', ');
    const quando = ev.quando ? String(ev.quando).charAt(0).toLowerCase() + String(ev.quando).slice(1) : '';
    const azienda = String(d.azienda || '').trim();
    const contatto = String(d.contatto || 'info@nextgenerationbusiness.it');
    const modulo = ev.url ? String(ev.url).replace(/#.*$/, '') + '#iscrizioni' : SITO;
    const oggetto = 'L\'invito vale per due persone - Next Generation Business, ' + evento;
    const testo = [
        'Gentile ' + (nomeCompleto || 'ospite') + ',',
        'grazie per la tua iscrizione a Next Generation Business'
            + (quando ? ', il convegno di ' + quando : '') + (dove ? ' (' + dove + ')' : '') + '.',
        'L\'invito riservato ' + (azienda ? 'a ' + azienda : 'alla tua azienda') + ' vale per due persone, e finora il codice '
            + 'dell\'azienda è stato usato solo per la tua iscrizione. Se un collega vuole partecipare, ti invitiamo a farlo '
            + 'registrare al più presto, prima che i posti si esauriscano.',
        'Il codice riservato alla tua azienda è:\n\n' + d.codice,
        'Il collega si registra dal modulo della pagina dell\'evento, con il proprio nome, il proprio indirizzo email e il '
            + 'proprio cellulare, e scrive il codice nel campo "Codice invito":\n' + modulo,
        'Se un collega si è già iscritto, puoi ignorare questa email. Per qualunque informazione scrivici a ' + contatto + '.',
        'A presto,\nla segreteria di Next Generation Business',
        '--\n' + MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf + '\n'
            + 'Ricevi questa email per la tua iscrizione all\'evento con il codice riservato alla tua azienda: non è una comunicazione promozionale.\n'
            + 'Informativa privacy: ' + PRIVACY
    ].join('\n\n');
    return { oggetto: oggetto, testo: testo };
}

module.exports = { riepilogoSerale, rispostaPec, confermaSito, invitoIngresso, confermaVariazioni, confermaB2B, confermaB2BAzienda, invitoB2BAnnullato, secondaPersona, nomeEvento };
