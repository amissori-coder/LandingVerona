/* ============================================================
   Impaginazione delle mail di Revilaw
   ------------------------------------------------------------
   Un solo posto per la struttura HTML di TUTTE le mail che escono
   dall'area riservata (comunicazioni ai teams, invii programmati,
   annunci di aggiornamento, avvisi delle richieste di correzione).

   Le mail non si leggono in un browser: si leggono in Outlook, in
   Gmail, su iPhone, in Thunderbird, in webmail vecchie. Quindi:
   - documento HTML COMPLETO (doctype, head, body): senza, alcuni
     client - Outlook in testa - inventano margini e caratteri;
   - impaginazione a TABELLE con larghezza in attributo, non in CSS:
     Outlook usa il motore di Word e ignora max-width sui div;
   - stili IN LINEA su ogni elemento: Gmail e diverse app tolgono i
     fogli di stile, che qui restano solo per i ritocchi (larghezza
     su schermo piccolo), mai per cose essenziali;
   - testo GIUSTIFICATO: sta sul contenitore (text-align si eredita)
     e nella regola di stile, cosi' vale anche per il testo scritto
     nell'editor, che non porta con se' alcun allineamento;
   - nessuna immagine indispensabile: il logo della firma e' l'unica,
     e se il client la blocca resta comunque tutto leggibile.
   ============================================================ */

// Firma con logo Revilaw, in fondo a ogni mail (uguale all'anteprima nell'app)
const FIRMA = '<table role="presentation" class="rv-firma" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-top:1px solid #E2E8F0;"><tr>'
    + '<td style="padding:16px 14px 0 0;vertical-align:middle;"><img src="https://nextgenerationbusiness.it/zls_zes/img/logo-revilaw.png" alt="Revilaw" width="120" height="42" style="height:42px;width:auto;display:block;border:0;"></td>'
    + '<td style="padding-top:16px;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;color:#0A2844;font-size:13px;line-height:1.5;text-align:left;">'
    + '<div style="font-size:16px;font-weight:bold;color:#0A2844;">Revilaw <span style="color:#8bb8d4;">S.p.A.</span></div>'
    + '<div style="color:#475569;">Revisione legale &middot; Next Generation Business</div>'
    + '<a href="https://nextgenerationbusiness.it" style="color:#164068;text-decoration:none;">nextgenerationbusiness.it</a>'
    + '</td></tr></table>';

/* Via i trattini lunghi (– —) e le loro entita': nelle mail di Revilaw non ci
   vanno. Arrivano quasi sempre per copia-incolla da Word o dal web, dove certi
   programmi di posta li rendono male o li spezzano a fine riga; al loro posto un
   trattino normale. Si applica a oggetto e testo di OGNI mail, quindi copre anche
   quello che viene scritto a mano nell'editor. */
function senzaTrattiniLunghi(s) {
    return String(s == null ? '' : s)
        .replace(/&[mn]dash;/gi, '-')
        .replace(/&#(8211|8212|8213|8210);/g, '-')
        .replace(/[‒–—―]/g, '-');
}

/* Avvolge il contenuto del messaggio nella pagina completa della mail.
   `inner` e' l'HTML del messaggio (editor o composto dall'applicazione). */
function avvolgi(inner) {
    return '<!doctype html>\n'
        + '<html lang="it" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">\n'
        + '<head>\n'
        + '<meta charset="utf-8">\n'
        + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        + '<meta http-equiv="X-UA-Compatible" content="IE=edge">\n'
        + '<meta name="x-apple-disable-message-reformatting">\n'
        + '<meta name="color-scheme" content="light only">\n'
        + '<meta name="supported-color-schemes" content="light only">\n'
        + '<title>Revilaw S.p.A.</title>\n'
        + '<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->\n'
        + '<style type="text/css">\n'
        + 'body{margin:0 !important;padding:0 !important;width:100% !important;background-color:#F1F5F9;}\n'
        + 'table{border-collapse:collapse;}\n'
        + 'img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;max-width:100%;height:auto;}\n'
        + 'a{color:#164068;}\n'
        /* il testo va giustificato anche quando lo scrive l'editor, che non mette
           alcun allineamento sui suoi paragrafi */
        + '.rv-corpo p,.rv-corpo div,.rv-corpo li,.rv-corpo blockquote{text-align:justify;}\n'
        + '.rv-corpo h1,.rv-corpo h2,.rv-corpo h3,.rv-corpo h4{text-align:left;}\n'
        /* la firma non si giustifica: e' un blocco di righe corte, verrebbe sparpagliata */
        + '.rv-firma td,.rv-firma div,.rv-firma p{text-align:left !important;}\n'
        + '@media only screen and (max-width:620px){\n'
        + '  .rv-contenitore{width:100% !important;}\n'
        + '  .rv-pad{padding-left:18px !important;padding-right:18px !important;}\n'
        + '}\n'
        + '</style>\n'
        + '</head>\n'
        + '<body style="margin:0;padding:0;background-color:#F1F5F9;">\n'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9;">\n'
        + '<tr><td align="center" style="padding:24px 12px;">\n'
        + '<table role="presentation" class="rv-contenitore" width="620" cellpadding="0" cellspacing="0" border="0" align="center" style="width:620px;max-width:620px;background-color:#ffffff;border:1px solid #E2E8F0;border-radius:8px;">\n'
        + '<tr><td class="rv-pad rv-corpo" style="padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1E293B;text-align:justify;">\n'
        + inner
        + FIRMA
        + '\n</td></tr></table>\n'
        + '</td></tr></table>\n'
        + '</body></html>';
}

module.exports = { FIRMA, avvolgi, senzaTrattiniLunghi };
