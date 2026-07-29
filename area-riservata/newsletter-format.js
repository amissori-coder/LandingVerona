/* ============================================================
   FORMATO NEWSLETTER — email leggibile in TUTTI i lettori di posta
   ------------------------------------------------------------
   Perche' un file a parte: qui non c'e' niente dell'applicazione
   (nessun accesso ai dati, nessun DOM obbligatorio). Sono funzioni
   pure che, da una newsletter, producono l'HTML della mail e la
   versione in solo testo. Cosi' si possono collaudare da sole e
   l'HTML resta uno solo, in un posto solo.

   Regole del formato (sono quelle che rendono una mail "sicura"
   anche su Outlook, Gmail, Apple Mail, Yahoo, Libero, Thunderbird):
     - impaginazione a TABELLE, non con div e float: Outlook usa il
       motore di Word e ignora larghezze, flex, grid e position;
     - stili SEMPRE in linea (attributo style): molti client tolgono
       il foglio di stile; il blocco <style> serve solo per i
       miglioramenti su schermo piccolo, e se sparisce non cambia nulla;
     - larghezza fissa 600px con tabella "condizionale" per Outlook e
       max-width per gli altri: sotto i 600px si adatta;
     - pulsanti "a prova di client" (VML per Outlook, link normale
       per tutti gli altri): un <a> con padding su Outlook non
       diventerebbe un rettangolo cliccabile;
     - font di sistema (Arial/Helvetica): i font scaricati non
       arrivano quasi mai;
     - immagini con width/height e alt, e display:block per non
       lasciare la riga vuota sotto;
     - testo di anteprima (preheader) nascosto in cima, quello che
       il client mostra accanto all'oggetto;
     - in fondo, SEMPRE il collegamento per disiscriversi: e' un
       obbligo di legge per le comunicazioni promozionali e serve
       anche alla reputazione del mittente.

   Il collegamento di disiscrizione non si conosce qui: e' diverso
   per ogni destinatario. Nell'HTML resta il segnaposto
   {{DISISCRIVITI}}, che il servizio di invio sostituisce con
   l'indirizzo firmato di quella persona.
   ============================================================ */
(function (radice, fabbrica) {
    const api = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else radice.RV_NEWSLETTER = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* --- costanti grafiche: gli stessi colori del sito Revilaw --- */
    const C = {
        scuro: '#0A2844',
        blu: '#164068',
        azzurro: '#8bb8d4',
        testo: '#1E293B',
        tenue: '#475569',
        bordo: '#E2E8F0',
        sfondo: '#F1F5F9',
        chiaro: '#F4F8FB',
        bianco: '#FFFFFF',
        oro: '#C9A227'
    };
    const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
    const LARGHEZZA = 600;
    /* Marchio per esteso (simbolo + scritta), su fondo bianco incorporato: e' l'unico
       dei tre che porta anche il nome, ed e' il motivo per cui la testata e' bianca. */
    const LOGO = 'https://nextgenerationbusiness.it/assets/logo-revilaw.png';
    const SITO = 'https://nextgenerationbusiness.it';
    // la stessa informativa collegata in fondo al sito (iubenda)
    const PRIVACY = 'https://www.iubenda.com/privacy-policy/40996386';
    const SEGNAPOSTO_DISISCRIVI = '{{DISISCRIVITI}}';
    const SEGNAPOSTO_WEB = '{{VEDI_ONLINE}}';
    /* Testi del piede in chiaro: finiscono sia nell'HTML (protetti con esc) sia
       nella versione in solo testo, dove un'entita' HTML resterebbe scritta cosi'. */
    const MITTENTE = {
        nome: 'Revilaw S.p.A.',
        indirizzo: 'Via XX Settembre 9 - 37129 Verona',
        cf: 'C.F. 04641610235'
    };
    /* Questo testo lo legge il destinatario, non e' un commento nel codice: gli
       accenti ci vanno. Il file e' UTF-8 e la mail dichiara lo stesso charset. */
    const MOTIVO_PREDEFINITO = 'Ricevi questa email perché hai chiesto di essere aggiornato'
        + ' sulle iniziative di Next Generation Business.';

    /* --- tipi di blocco riconosciuti dal compositore --- */
    const TIPI_BLOCCO = [
        { id: 'testo', nome: 'Testo', desc: 'Titolo e paragrafo' },
        { id: 'evidenza', nome: 'Riquadro in evidenza', desc: 'Box azzurro per una notizia o una scadenza' },
        { id: 'immagine', nome: 'Immagine', desc: 'Immagine a tutta larghezza, con collegamento' },
        { id: 'bottone', nome: 'Pulsante', desc: 'Invito all\'azione (leggi, iscriviti, scarica)' },
        { id: 'elenco', nome: 'Elenco puntato', desc: 'Punti brevi, uno per riga' },
        { id: 'duo', nome: 'Due schede affiancate', desc: 'Due notizie brevi una accanto all\'altra' },
        { id: 'spalla', nome: 'Immagine di fianco al testo', desc: 'Immagine a lato, testo accanto: da ritmo alla pagina' },
        { id: 'numero', nome: 'Numero in grande', desc: 'Una cifra sola su fondo scuro: ferma l\'occhio' },
        { id: 'separatore', nome: 'Linea di separazione', desc: 'Divide due parti della newsletter' }
    ];

    /* =========================================================
       UTILITA' DI BASE
    ========================================================= */
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
    /* Un indirizzo si usa solo se e' http/https/mailto: cosi' un "javascript:"
       incollato per sbaglio (o arrivato da una pagina) non diventa un link attivo. */
    function urlSicuro(u) {
        const s = String(u == null ? '' : u).trim();
        if (!s) return '';
        if (/^(https?:|mailto:)/i.test(s)) return s;
        if (/^\/\//.test(s)) return 'https:' + s;
        if (/^\//.test(s)) return SITO + s;
        if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '';   // altri schemi: scartati
        return 'https://' + s;
    }
    /* Rende assoluto un indirizzo trovato in una pagina (per le immagini).
       Il risultato deve essere http/https: le immagini si scaricano, quindi
       niente "javascript:" o "data:" (che i client bloccano comunque). */
    function assoluto(u, base) {
        const s = String(u == null ? '' : u).trim();
        if (!s) return '';
        if (/^https?:/i.test(s)) return s;
        let esteso = '';
        try { esteso = new URL(s, base || SITO).href; } catch (e) { esteso = urlSicuro(s); }
        return /^https?:/i.test(esteso) ? esteso : '';
    }

    /* --- ripulitura del testo formattato ---
       Il messaggio arriva dall'editor (o da una pagina del sito): si tengono
       solo i tag utili in una mail e si buttano attributi ed eventi. */
    const TAG_OK = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a', 'h3', 'h4'];
    function ripulisci(html) {
        let s = String(html == null ? '' : html);
        s = s.replace(/<!--[\s\S]*?-->/g, '');
        s = s.replace(/<(script|style|iframe|object|embed|form|input|button|svg|math|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
        s = s.replace(/<\/?(script|style|iframe|object|embed|form|input|button|svg|math|noscript)\b[^>]*>/gi, '');
        // div e span diventano interruzioni di paragrafo: in mail non servono
        s = s.replace(/<\/(div|section|article|h1|h2|h5|h6)\s*>/gi, '</p>').replace(/<(div|section|article|h1|h2|h5|h6)\b[^>]*>/gi, '<p>');
        s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:"[^"]*"|'[^']*'|[^<>])*)>/g, (tutto, chiusura, tag, attr) => {
            const t = String(tag).toLowerCase();
            if (TAG_OK.indexOf(t) < 0) return '';
            if (chiusura) return '</' + t + '>';
            if (t === 'br') return '<br>';
            if (t === 'a') {
                const m = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attr || '');
                const href = urlSicuro(m ? (m[1] || m[2] || m[3] || '') : '');
                return href ? '<a href="' + esc(href) + '">' : '<a>';
            }
            return '<' + t + '>';
        });
        // paragrafi vuoti lasciati dall'editor
        s = s.replace(/<p>\s*(<br>\s*)*<\/p>/gi, '');
        return s.trim();
    }
    /* Stili in linea sui tag del testo: senza questi, i client che tolgono il
       foglio di stile mostrerebbero il messaggio con i margini di default. */
    function stilizza(html, opz) {
        /* Il testo di lettura e' GIUSTIFICATO: su una colonna da 520px da' il
           blocco compatto di una circolare. La classe "par" serve alla media
           query, che sotto i 620px lo riporta a sinistra: senza sillabazione,
           su uno schermo stretto il giustificato aprirebbe buchi bianchi fra le
           parole proprio dove serve leggere meglio.
           Nelle colonne strette (blocchi affiancati) il giustificato si toglie
           per lo stesso motivo, ma sempre: 250px non bastano mai. */
        const stretto = opz && opz.stretto;
        const pStile = 'margin:0 0 ' + (stretto ? 12 : 16) + 'px 0;font-family:' + FONT
            + ';font-size:' + (stretto ? 15 : 16) + 'px;line-height:' + (stretto ? 24 : 27) + 'px;color:' + C.testo + ';'
            + (stretto ? '' : 'text-align:justify;');
        return String(html || '')
            .replace(/<p>/g, '<p' + (stretto ? '' : ' class="par"') + ' style="' + pStile + '">')
            .replace(/<h3>/g, '<h3 style="margin:26px 0 10px 0;font-family:' + FONT + ';font-size:18px;line-height:25px;color:' + C.scuro + ';">')
            .replace(/<h4>/g, '<h4 style="margin:20px 0 8px 0;font-family:' + FONT + ';font-size:16px;line-height:23px;color:' + C.scuro + ';">')
            .replace(/<ul>/g, '<ul style="margin:0 0 16px 0;padding-left:22px;">')
            .replace(/<ol>/g, '<ol style="margin:0 0 16px 0;padding-left:22px;">')
            .replace(/<li>/g, '<li style="margin:0 0 8px 0;font-family:' + FONT + ';font-size:16px;line-height:26px;color:' + C.testo + ';">')
            .replace(/<a href=/g, '<a style="color:' + C.blu + ';text-decoration:underline;" href=');
    }
    /* --- testo scritto a mano -> HTML ---
       Nel compositore i blocchi si scrivono in una casella normale, senza
       barra di formattazione: e' l'unico modo perche' l'HTML della mail
       resti quello previsto dal formato. Tre regole, tutte spiegate a video:
         riga vuota  = nuovo paragrafo
         **testo**   = grassetto
         [testo](indirizzo) = collegamento
       Tutto il resto viene protetto: quello che si scrive non puo' rompere
       l'impaginazione della mail. */
    function formatta(txt) {
        const grezzo = String(txt == null ? '' : txt).replace(/\r\n?/g, '\n').trim();
        if (!grezzo) return '';
        return grezzo.split(/\n{2,}/).map(par => {
            let s = esc(par.trim()).replace(/\n/g, '<br>');
            s = s.replace(/\[([^\]]{1,120})\]\(([^)\s]{1,400})\)/g, (t, testo, url) => {
                // l'indirizzo e' gia' passato da esc() poche righe sopra, insieme al
                // resto del paragrafo: qui si riporta com'era prima di validarlo,
                // altrimenti la "&" verrebbe protetta due volte e un indirizzo con
                // piu' parametri (le utm, per esempio) arriverebbe rotto
                const u = urlSicuro(String(url).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
                return u ? '<a href="' + esc(u) + '">' + testo + '</a>' : testo;
            });
            s = s.replace(/\*\*([^*]{1,300})\*\*/g, '<strong>$1</strong>');
            return '<p>' + s + '</p>';
        }).join('');
    }
    /* Il percorso inverso, per riaprire in modifica un blocco creato dalla pagina. */
    function sformatta(html) {
        return testoDaHtml(String(html || '')
            .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
            .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
            .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
            .replace(/<a[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)'));
    }

    /* Testo formattato -> testo semplice, per la parte text/plain della mail
       (i lettori che non mostrano HTML, e i filtri antispam che la cercano). */
    function testoDaHtml(html) {
        return String(html || '')
            .replace(/<\s*br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
            .replace(/<li[^>]*>/gi, '- ')
            // i collegamenti scritti nel testo devono restare raggiungibili anche da
            // chi legge la mail in solo testo: l'indirizzo si mette accanto alla scritta
            .replace(/<a[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
            .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    /* Il testo scritto a mano nei campi semplici (titoli, sommari) puo' contenere
       a capo: diventano <br>, il resto viene protetto. */
    function testoHtml(s) { return esc(s).replace(/\n/g, '<br>'); }

    /* =========================================================
       PEZZI DELLA MAIL
       ---------------------------------------------------------
       Impaginazione da bollettino professionale, non da campagna:
       testata scura col solo marchio, filo d'oro, e da li' in giu' e' la
       tipografia a fare il lavoro. Tre livelli e non uno di piu':

         titolo della newsletter   30px / 38px   blu scuro
         titolo di sezione         20px / 28px   blu scuro
         testo                     16px / 27px   grigio scuro

       Fra un livello e l'altro c'e' un salto vero: si legge la gerarchia
       prima ancora delle parole. Le scatole colorate sono sostituite da
       filetti da 1px, e l'oro compare poche volte - filo sotto la testata,
       trattino sopra ogni sezione, quadratini dell'elenco, costola
       dell'avviso - cosi resta un segnale e non diventa carta da parati.
    ========================================================= */
    const SCALA = {
        titolo: 'font-size:30px;line-height:38px;',
        sezione: 'font-size:20px;line-height:28px;',
        sommario: 'font-size:18px;line-height:29px;',
        corpo: 'font-size:16px;line-height:27px;',
        etichetta: 'font-size:12px;line-height:17px;letter-spacing:1.6px;text-transform:uppercase;',
        occhiello: 'font-size:12px;line-height:17px;letter-spacing:2px;text-transform:uppercase;',
        piede: 'font-size:12px;line-height:20px;'
    };
    const LATO = 40;                 // margine laterale: lascia 520px di colonna di testo
    // "mso-line-height-rule:exactly" serve a Outlook: senza, ignora l'interlinea
    const FONTE = 'font-family:' + FONT + ';mso-line-height-rule:exactly;';

    /* Riga vuota di altezza fissa: in una mail lo spazio si fa cosi', non con
       i margini (Outlook li ignora quasi tutti). */
    function spazio(h) {
        return '<tr><td height="' + h + '" style="font-size:0;line-height:0;height:' + h + 'px;">&nbsp;</td></tr>';
    }
    function filetto(colore, alto) {
        return '<tr><td bgcolor="' + (colore || C.bordo) + '" height="' + (alto || 1) + '" style="background-color:' + (colore || C.bordo)
            + ';font-size:0;line-height:0;height:' + (alto || 1) + 'px;">&nbsp;</td></tr>';
    }
    /* Cella del corpo, con i margini laterali. La classe "px" la usa la media
       query per stringere i margini sui telefoni. */
    function cella(contenuto, padding) {
        return '<tr><td class="px" style="padding:' + (padding || ('0 ' + LATO + 'px')) + ';' + FONTE + '">' + contenuto + '</td></tr>';
    }
    function tabellaInterna(righe) {
        return '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">' + righe + '</table>';
    }
    /* --- due elementi affiancati, che reggono anche Outlook ---
       In una mail non esistono le colonne CSS: float, flex e grid non arrivano
       da nessuna parte. La tecnica che funziona davvero e' doppia.
       Per Outlook si scrive una TABELLA vera dentro un commento condizionale:
       lui la vede, tutti gli altri la ignorano perche' per loro e' un commento.
       Per tutti gli altri si scrivono dei riquadri affiancati con
       display:inline-block, che sotto i 620px diventano larghi quanto lo schermo
       e quindi si impilano da soli, senza bisogno di sapere quanti sono.
       Il font-size:0 sul contenitore toglie lo spazio bianco che l'HTML mette
       fra due elementi in linea scritti su righe diverse: senza, la seconda
       colonna scivola sotto anche quando ci starebbe. */
    function colonne(pezzi, pesi, gap) {
        pezzi = pezzi.filter(p => p != null && p !== '');
        if (!pezzi.length) return '';
        if (pezzi.length === 1) return pezzi[0];
        gap = gap == null ? 20 : gap;
        const utile = LARGHEZZA - LATO * 2;
        const tot = (pesi || pezzi.map(() => 1)).reduce((a, b) => a + b, 0);
        const disponibile = utile - gap * (pezzi.length - 1);
        const larghezze = (pesi || pezzi.map(() => 1)).map(p => Math.floor(disponibile * p / tot));
        const vuoto = '<div class="gap" style="display:inline-block;width:' + gap + 'px;font-size:0;line-height:0;">&nbsp;</div>';
        let mso = '<!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="' + utile + '" style="width:' + utile + 'px;"><tr><![endif]-->';
        let html = '';
        pezzi.forEach((p, i) => {
            if (i) {
                html += '<!--[if mso]></td><td width="' + gap + '" style="width:' + gap + 'px;">&nbsp;</td><![endif]-->' + vuoto;
            }
            html += '<!--[if mso]><td width="' + larghezze[i] + '" valign="top" style="width:' + larghezze[i] + 'px;"><![endif]-->'
                + '<div class="col" style="display:inline-block;width:100%;max-width:' + larghezze[i] + 'px;vertical-align:top;font-size:0;line-height:0;">'
                + tabellaInterna('<tr><td valign="top" style="' + FONTE + '">' + p + '</td></tr>')
                + '</div>';
        });
        return '<div style="font-size:0;line-height:0;">' + mso + html + '<!--[if mso]></td></tr></table><![endif]--></div>';
    }

    /* Trattino d'oro sopra il titolo di sezione: e' l'elemento che si ripete e
       che fa riconoscere l'inizio di un blocco senza doverlo leggere. */
    function segnoSezione() {
        return '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="34" style="border-collapse:collapse;">'
            + '<tr><td bgcolor="' + C.oro + '" width="34" height="2" style="background-color:' + C.oro
            + ';width:34px;height:2px;font-size:0;line-height:0;">&nbsp;</td></tr></table>';
    }
    function titoloSezione(testo) {
        return tabellaInterna(
            '<tr><td>' + segnoSezione() + '</td></tr>'
            + spazio(14)
            + '<tr><td style="' + FONTE + SCALA.sezione + 'color:' + C.scuro + ';font-weight:bold;">' + testoHtml(testo) + '</td></tr>'
            + spazio(12)
        );
    }
    function etichetta(testo) {
        return '<div style="' + FONTE + SCALA.etichetta + 'color:' + C.blu + ';font-weight:bold;">' + testoHtml(testo) + '</div>';
    }

    /* Pulsante che funziona anche su Outlook: la parte VML disegna un
       rettangolo cliccabile, gli altri client vedono il link normale. */
    function pulsante(testo, url, opz) {
        opz = opz || {};
        const u = urlSicuro(url);
        if (!u || !String(testo || '').trim()) return '';
        const sfondo = opz.colore || C.scuro;
        const larghezza = Math.max(180, Math.min(420, 40 + String(testo).length * 9));
        return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">'
            + '<tr><td align="center" bgcolor="' + sfondo + '" style="background-color:' + sfondo + ';">'
            + '<!--[if mso]>'
            + '<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="' + esc(u) + '" '
            + 'style="height:46px;v-text-anchor:middle;width:' + larghezza + 'px;" arcsize="0%" stroke="f" fillcolor="' + sfondo + '">'
            + '<w:anchorlock/><center style="color:#ffffff;font-family:' + FONT + ';font-size:16px;font-weight:bold;letter-spacing:0.3px;">' + esc(testo) + '</center>'
            + '</v:roundrect>'
            + '<![endif]-->'
            + '<!--[if !mso]><!-- -->'
            + '<a href="' + esc(u) + '" class="btnlink" style="display:inline-block;padding:14px 30px;font-family:' + FONT
            + ';font-size:16px;font-weight:bold;letter-spacing:0.3px;color:#ffffff;text-decoration:none;background-color:' + sfondo + ';mso-hide:all;">' + esc(testo) + '</a>'
            + '<!--<![endif]-->'
            + '</td></tr></table>';
    }

    /* Corpo di un blocco: "html" se arriva gia' formattato (bozza generata da una
       pagina del sito), altrimenti il testo scritto a mano con le tre regole. */
    function contenuto(b, opz) {
        return b && b.html ? stilizza(ripulisci(b.html), opz) : stilizza(formatta(b && b.testo), opz);
    }

    /* Un blocco del corpo -> le righe di tabella corrispondenti. */
    function blocco(b, base) {
        if (!b || !b.tipo) return '';
        const tipo = String(b.tipo);
        if (tipo === 'separatore') {
            return cella(tabellaInterna(filetto(C.bordo, 1)), '18px ' + LATO + 'px 4px');
        }
        if (tipo === 'immagine') {
            const src = assoluto(b.src, base);
            if (!src) return '';
            const img = '<img src="' + esc(src) + '" width="' + (LARGHEZZA - LATO * 2) + '" alt="' + esc(b.alt || '') + '" '
                + 'style="display:block;width:100%;max-width:' + (LARGHEZZA - LATO * 2) + 'px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;' + FONTE + SCALA.corpo + 'color:' + C.tenue + ';">';
            const link = urlSicuro(b.link);
            return cella(link ? '<a href="' + esc(link) + '" style="text-decoration:none;">' + img + '</a>' : img, '28px ' + LATO + 'px 4px');
        }
        if (tipo === 'bottone') {
            const p = pulsante(b.testo, b.url);
            // al centro salvo richiesta contraria: un invito all'azione allineato
            // a sinistra si perde nella colonna di testo invece di staccarsene
            const dove = b.allineamento === 'sinistra' ? 'left' : 'center';
            return p ? cella(tabellaInterna('<tr><td align="' + dove + '" style="text-align:' + dove + ';">'
                + (dove === 'center' ? '<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin:0 auto;"><tr><td align="center">' + p + '</td></tr></table>' : p)
                + '</td></tr>'), '28px ' + LATO + 'px 4px') : '';
        }
        if (tipo === 'elenco') {
            const voci = (Array.isArray(b.voci) ? b.voci : String(b.voci || '').split('\n'))
                .map(v => String(v || '').trim()).filter(Boolean);
            if (!voci.length && !b.titolo) return '';
            /* L'elenco e' trattato come una tabellina di dati: filetto sopra,
               etichetta piccola, quadratini d'oro. Nessuno sfondo colorato: e'
               quello che lo fa sembrare un documento e non un riquadro pubblicitario. */
            const righe = voci.map(v => '<tr><td style="padding:0 0 11px 0;">'
                + tabellaInterna('<tr>'
                    + '<td valign="top" width="20" style="width:20px;padding:9px 0 0 0;">'
                    + '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="7" style="border-collapse:collapse;"><tr>'
                    + '<td bgcolor="' + C.oro + '" width="7" height="7" style="background-color:' + C.oro + ';width:7px;height:7px;font-size:0;line-height:0;">&nbsp;</td>'
                    + '</tr></table></td>'
                    + '<td valign="top" style="' + FONTE + SCALA.corpo + 'color:' + C.testo + ';">' + testoHtml(v) + '</td>'
                    + '</tr>')
                + '</td></tr>').join('');
            return cella(tabellaInterna(
                filetto(C.bordo, 1)
                + (b.titolo ? '<tr><td style="padding:20px 0 14px 0;">' + etichetta(b.titolo) + '</td></tr>' : spazio(20))
                + righe
            ), '30px ' + LATO + 'px 4px');
        }
        if (tipo === 'evidenza') {
            /* L'avviso e' l'unico blocco marcato del corpo: costola d'oro e
               campitura tenue. Marcarne di piu' toglierebbe forza a questo. */
            const dentro = (b.titolo ? '<tr><td style="padding:0 0 8px 0;">' + etichetta(b.titolo) + '</td></tr>' : '')
                + '<tr><td style="' + FONTE + SCALA.corpo + 'color:' + C.testo + ';">' + contenuto(b) + '</td></tr>';
            return cella(
                '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:' + C.chiaro + ';"><tr>'
                + '<td width="4" bgcolor="' + C.oro + '" style="width:4px;background-color:' + C.oro + ';font-size:0;line-height:0;">&nbsp;</td>'
                + '<td style="padding:18px 20px;">' + tabellaInterna(dentro) + '</td>'
                + '</tr></table>', '30px ' + LATO + 'px 4px');
        }
        if (tipo === 'duo') {
            /* Due schede affiancate. Serve a spezzare il ritmo di una colonna
               unica: due notizie brevi, o due facce della stessa cosa, si leggono
               a colpo d'occhio invece di diventare due paragrafi uno sotto
               l'altro. Sotto i 620px si impilano da sole. */
            const scheda = (tit, txt) => {
                if (!String(tit || '').trim() && !String(txt || '').trim()) return '';
                return '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:' + C.chiaro + ';">'
                    + '<tr><td bgcolor="' + C.oro + '" height="3" style="background-color:' + C.oro + ';height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>'
                    + '<tr><td style="padding:15px 17px 17px;' + FONTE + '">'
                    + (tit ? '<div style="' + FONTE + 'font-size:17px;line-height:24px;color:' + C.scuro + ';font-weight:bold;padding-bottom:7px;">' + testoHtml(tit) + '</div>' : '')
                    + '<div style="' + FONTE + 'font-size:15px;line-height:24px;color:' + C.testo + ';">' + testoHtml(txt) + '</div>'
                    + '</td></tr></table>';
            };
            const uno = scheda(b.titolo, b.testo), due = scheda(b.titolo2, b.testo2);
            if (!uno && !due) return '';
            return cella(colonne([uno, due].filter(Boolean)), '30px ' + LATO + 'px 4px');
        }
        if (tipo === 'spalla') {
            /* Immagine di fianco al testo, non sopra. E' il blocco che da' il
               ritmo: alternandone il lato, la mail smette di essere una colonna
               e diventa una pagina. */
            const src = assoluto(b.src, base);
            const testoDentro = (b.titolo
                ? '<div style="' + FONTE + 'font-size:18px;line-height:25px;color:' + C.scuro + ';font-weight:bold;padding-bottom:8px;">' + testoHtml(b.titolo) + '</div>'
                : '') + contenuto(b, { stretto: true });
            if (!src) return cella(testoDentro, '30px ' + LATO + 'px 4px');
            const img = '<img src="' + esc(src) + '" width="210" alt="' + esc(b.alt || '') + '" '
                + 'style="display:block;width:100%;max-width:210px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;'
                + FONTE + 'font-size:13px;line-height:18px;color:' + C.tenue + ';">';
            const conLink = urlSicuro(b.link) ? '<a href="' + esc(urlSicuro(b.link)) + '" style="text-decoration:none;">' + img + '</a>' : img;
            const aDestra = b.lato === 'destra';
            return cella(colonne(
                aDestra ? [testoDentro, conLink] : [conLink, testoDentro],
                aDestra ? [3, 2] : [2, 3]
            ), '30px ' + LATO + 'px 4px');
        }
        if (tipo === 'numero') {
            /* Il numero grande. E' l'elemento che ferma l'occhio mentre si scorre:
               una cifra sola, grande, su fondo scuro. Se ce n'e' piu' d'uno per
               newsletter smette di funzionare, e va detto a chi scrive. */
            const cifra = String(b.numero || '').trim();
            if (!cifra) return '';
            return cella(
                '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="' + C.scuro + '" style="border-collapse:collapse;background-color:' + C.scuro + ';">'
                + '<tr><td align="center" style="padding:26px 22px 24px;text-align:center;' + FONTE + '">'
                + '<div style="' + FONTE + 'font-size:44px;line-height:50px;color:' + C.oro + ';font-weight:bold;letter-spacing:-1px;">' + testoHtml(cifra) + '</div>'
                + (b.etichetta ? '<div style="' + FONTE + SCALA.etichetta + 'color:#9DB8D2;font-weight:bold;padding-top:6px;">' + testoHtml(b.etichetta) + '</div>' : '')
                + (b.testo ? '<div style="' + FONTE + 'font-size:15px;line-height:24px;color:#D7E3EF;padding-top:12px;">' + testoHtml(b.testo) + '</div>' : '')
                + '</td></tr></table>', '30px ' + LATO + 'px 4px');
        }
        // testo (predefinito)
        const corpo = contenuto(b);
        if (!b.titolo && !corpo) return '';
        return cella((b.titolo ? titoloSezione(b.titolo) : '') + corpo, '32px ' + LATO + 'px 4px');
    }

    /* Lo stesso blocco in solo testo. */
    function bloccoTesto(b) {
        if (!b || !b.tipo) return '';
        const t = String(b.tipo);
        if (t === 'separatore') return '--------------------------------------';
        if (t === 'immagine') return '';
        if (t === 'bottone') return (b.testo ? String(b.testo).toUpperCase() + ': ' : '') + urlSicuro(b.url);
        if (t === 'duo') {
            // affiancate a video, una sotto l'altra nel testo semplice: il senso
            // resta, e l'ordine di lettura pure
            return [b.titolo, b.testo, b.titolo2, b.testo2].map(x => String(x || '').trim()).filter(Boolean).join('\n');
        }
        if (t === 'numero') {
            return [b.numero, b.etichetta, b.testo].map(x => String(x || '').trim()).filter(Boolean).join(' - ');
        }
        if (t === 'spalla') {
            return (b.titolo ? b.titolo + '\n' : '') + testoDaHtml(b.html ? ripulisci(b.html) : formatta(b.testo));
        }
        if (t === 'elenco') {
            const voci = (Array.isArray(b.voci) ? b.voci : String(b.voci || '').split('\n')).map(v => String(v || '').trim()).filter(Boolean);
            return (b.titolo ? b.titolo + '\n' : '') + voci.map(v => '- ' + v).join('\n');
        }
        return (b.titolo ? b.titolo + '\n' : '') + testoDaHtml(b.html ? ripulisci(b.html) : formatta(b.testo));
    }

    /* =========================================================
       COSTRUZIONE DELLA MAIL COMPLETA
       nl = { oggetto, preheader, occhiello, titolo, sommario,
              immagine, blocchi[], cta:{testo,url}, fonte:{url} }
    ========================================================= */
    function costruisci(nl, opz) {
        nl = nl || {}; opz = opz || {};
        const base = (nl.fonte && nl.fonte.url) || SITO;
        const blocchi = (Array.isArray(nl.blocchi) ? nl.blocchi : []).map(b => blocco(b, base)).join('');
        const anno = opz.anno || new Date().getFullYear();

        /* Testata BIANCA con il marchio per esteso e un filo d'oro sotto: una
           carta intestata, non una fascia colorata.
           Il fondo bianco non e' una scelta estetica ma tecnica: dei tre file
           del marchio, l'unico che porta anche la scritta "Revilaw" ha il fondo
           bianco incorporato (nessuna trasparenza), quindi su fondo scuro
           comparirebbe come un rettangolo bianco. Gli altri due sono il solo
           simbolo: uno blu, illeggibile sullo scuro, e uno bianco, illeggibile
           sul chiaro. Su bianco il marchio completo si legge e si riconosce.
           Se le immagini sono bloccate resta il testo alternativo, vestito per
           essere leggibile lo stesso. */
        const testa = '<tr><td bgcolor="' + C.bianco + '" class="px" style="background-color:' + C.bianco + ';padding:28px ' + LATO + 'px 24px;">'
            + '<a href="' + esc(SITO) + '" style="text-decoration:none;">'
            + '<img src="' + esc(LOGO) + '" width="170" alt="Revilaw - Revisione legale" '
            + 'style="display:block;width:170px;max-width:170px;height:auto;border:0;outline:none;text-decoration:none;'
            + 'font-family:' + FONT + ';font-size:19px;line-height:25px;font-weight:bold;color:' + C.scuro + ';">'
            + '</a></td></tr>'
            + filetto(C.oro, 3);

        /* Apertura: occhiello minuscolo, titolo grande, sommario in corpo
           maggiore. E' qui che si decide se la mail viene letta. */
        const occhiello = nl.occhiello
            ? '<tr><td style="' + FONTE + SCALA.occhiello + 'color:' + C.blu + ';font-weight:bold;">' + testoHtml(nl.occhiello) + '</td></tr>' + spazio(14)
            : '';
        const titolo = nl.titolo
            ? '<tr><td class="h1" style="' + FONTE + SCALA.titolo + 'color:' + C.scuro + ';font-weight:bold;letter-spacing:-0.3px;">' + testoHtml(nl.titolo) + '</td></tr>'
            : '';
        const sommario = nl.sommario
            ? (titolo ? spazio(18) : '') + '<tr><td class="lead" style="' + FONTE + SCALA.sommario + 'color:' + C.tenue + ';">' + testoHtml(nl.sommario) + '</td></tr>'
            : '';
        const apertura = (occhiello || titolo || sommario)
            ? cella(tabellaInterna(occhiello + titolo + sommario), '42px ' + LATO + 'px 0')
            : '';

        // l'immagine di apertura va a tutta larghezza, senza margini: e' la foto di apertura
        const copertina = nl.immagine && assoluto(nl.immagine, base)
            ? '<tr><td style="font-size:0;line-height:0;padding-top:34px;">'
            + '<img src="' + esc(assoluto(nl.immagine, base)) + '" width="' + LARGHEZZA + '" alt="' + esc(nl.titolo || '') + '" '
            + 'style="display:block;width:100%;max-width:' + LARGHEZZA + 'px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;">'
            + '</td></tr>'
            : '';

        /* Il pulsante finale sta al centro: e' l'unica cosa che si chiede al
           lettore, e al centro si vede da sola senza cercarla. Il centraggio si
           fa con align sul TD, non con margin:auto, che meta' dei programmi di
           posta ignora. */
        const ctaFinale = (nl.cta && nl.cta.url && nl.cta.testo)
            ? cella(tabellaInterna(filetto(C.bordo, 1) + spazio(28)
                + '<tr><td align="center" style="text-align:center;">'
                + '<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin:0 auto;"><tr><td align="center">'
                + pulsante(nl.cta.testo, nl.cta.url, { colore: C.blu })
                + '</td></tr></table></td></tr>'), '34px ' + LATO + 'px 0')
            : '';

        /* Piede: mittente, motivo dell'invio, disiscrizione (obbligatoria).
           Sta su fondo tenue e staccato dal corpo, come il colophon di un
           documento. I testi sono in chiaro: servono uguali alla versione in
           solo testo, dove un'entita' HTML resterebbe scritta cosi'. */
        const motivo = nl.motivo || MOTIVO_PREDEFINITO;
        const linkPiede = () => 'color:' + C.tenue + ';text-decoration:underline;';
        /* Piede CENTRATO e stretto: quattro righe e basta. Prima era allineato a
           sinistra e occupava sei righe, e a fine lettura sembrava un secondo
           corpo del testo invece della firma. Il centraggio va messo sia con
           l'attributo align sia con text-align: i programmi di posta piu' vecchi
           guardano l'uno, quelli nuovi l'altro. */
        const rigaPiede = (stile, dentro) => '<tr><td align="center" style="' + FONTE + SCALA.piede + stile + 'text-align:center;">' + dentro + '</td></tr>';
        const piede = '<tr><td class="px" bgcolor="' + C.sfondo + '" align="center" style="background-color:' + C.sfondo + ';padding:24px ' + LATO + 'px 26px;border-top:1px solid ' + C.bordo + ';text-align:center;">'
            + tabellaInterna(
                rigaPiede('color:' + C.scuro + ';font-weight:bold;', esc(MITTENTE.nome))
                + rigaPiede('color:' + C.tenue + ';', esc(MITTENTE.indirizzo) + ' &middot; ' + esc(MITTENTE.cf))
                + spazio(10)
                + rigaPiede('color:' + C.tenue + ';',
                    '<a href="' + SEGNAPOSTO_DISISCRIVI + '" style="' + linkPiede() + '">Annulla l\'iscrizione</a>'
                    + ' &nbsp;&middot;&nbsp; <a href="' + esc(PRIVACY) + '" style="' + linkPiede() + '">Informativa privacy</a>'
                    + ' &nbsp;&middot;&nbsp; <a href="' + esc(SITO) + '" style="' + linkPiede() + '">nextgenerationbusiness.it</a>')
                + spazio(8)
                + rigaPiede('color:#94A3B8;', esc(motivo) + ' &nbsp;&middot;&nbsp; &copy; ' + anno)
            )
            + '</td></tr>';

        /* Testo di anteprima: lo mostra il client accanto all'oggetto. I caratteri
           invisibili in coda impediscono che ci finisca dentro l'inizio del corpo. */
        const preheader = '<div style="display:none;font-size:1px;color:' + C.sfondo + ';line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">'
            + esc(nl.preheader || nl.sommario || '') + '&#8199;&#65279;&#847; '.repeat(30) + '</div>';

        const corpoInterno = testa + apertura + copertina + blocchi + ctaFinale + spazio(36) + piede;

        const html = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n'
            + '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" lang="it" xml:lang="it">\n<head>\n'
            + '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />\n'
            + '<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
            + '<meta http-equiv="X-UA-Compatible" content="IE=edge" />\n'
            + '<meta name="x-apple-disable-message-reformatting" content="" />\n'
            + '<meta name="format-detection" content="telephone=no,address=no,email=no,date=no" />\n'
            + '<meta name="color-scheme" content="light" />\n'
            + '<meta name="supported-color-schemes" content="light" />\n'
            + '<title>' + esc(nl.oggetto || nl.titolo || 'Newsletter') + '</title>\n'
            + '<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->\n'
            + '<style type="text/css">\n'
            + 'body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}\n'
            + 'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;}\n'
            + 'img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}\n'
            + 'body{margin:0!important;padding:0!important;width:100%!important;}\n'
            + 'a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}\n'
            + '.ExternalClass{width:100%;}\n'
            + '.ExternalClass,.ExternalClass p,.ExternalClass td,.ExternalClass div{line-height:100%;}\n'
            + '@media only screen and (max-width:620px){\n'
            + '  .wrap{width:100%!important;max-width:100%!important;}\n'
            + '  .px{padding-left:24px!important;padding-right:24px!important;}\n'
            + '  .h1{font-size:24px!important;line-height:31px!important;}\n'
            + '  .lead{font-size:16px!important;line-height:26px!important;}\n'
            + '  .btnlink{display:block!important;text-align:center!important;}\n'
            /* Il giustificato vive bene sui 520px della colonna desktop; su un
               telefono, senza sillabazione, aprirebbe buchi bianchi fra le parole
               proprio dove serve leggere meglio. Sotto i 620px si torna a sinistra. */
            + '  .par{text-align:left!important;}\n'
            /* Blocchi affiancati: sotto i 620px ciascuno prende tutta la larghezza
               e si impilano da soli, senza dover sapere quanti sono. Lo spazio fra
               le colonne sparisce e diventa uno spazio sotto ciascuna, altrimenti
               impilandosi si toccherebbero. */
            + '  .col{max-width:100%!important;width:100%!important;padding-bottom:16px!important;}\n'
            + '  .gap{display:none!important;width:0!important;}\n'
            + '}\n'
            + '</style>\n</head>\n'
            + '<body style="margin:0;padding:0;background-color:' + C.sfondo + ';">\n'
            + preheader
            + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:' + C.sfondo + ';">'
            + '<tr><td align="center" style="padding:24px 12px;">'
            + '<!--[if mso]><table role="presentation" align="center" width="' + LARGHEZZA + '" cellpadding="0" cellspacing="0" border="0"><tr><td width="' + LARGHEZZA + '"><![endif]-->'
            + '<table role="presentation" class="wrap" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" '
            + 'style="border-collapse:collapse;width:100%;max-width:' + LARGHEZZA + 'px;margin:0 auto;background-color:' + C.bianco + ';">'
            + corpoInterno
            + '</table>'
            + '<!--[if mso]></td></tr></table><![endif]-->'
            + '</td></tr></table>\n</body>\n</html>';

        /* --- versione in solo testo --- */
        const parti = [];
        if (nl.occhiello) parti.push(String(nl.occhiello).toUpperCase());
        if (nl.titolo) parti.push(nl.titolo);
        if (nl.sommario) parti.push(nl.sommario);
        (Array.isArray(nl.blocchi) ? nl.blocchi : []).forEach(b => { const t = bloccoTesto(b); if (t && t.trim()) parti.push(t.trim()); });
        if (nl.cta && nl.cta.url) parti.push((nl.cta.testo ? nl.cta.testo + ': ' : '') + urlSicuro(nl.cta.url));
        parti.push('--');
        parti.push(MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf);
        parti.push(motivo);
        parti.push('Informativa privacy: ' + PRIVACY);
        parti.push('Per non ricevere piu\' queste email: ' + SEGNAPOSTO_DISISCRIVI);
        const testo = parti.join('\n\n');

        return { html: html, testo: testo };
    }


    /* =========================================================
       DALLA PAGINA DEL SITO ALLA NEWSLETTER
       ---------------------------------------------------------
       Riceve il documento gia' letto (DOMParser) e ne ricava titolo,
       sommario, immagine e le sezioni principali. E' una lettura
       "a naso": si prendono i titoli di sezione e il primo paragrafo
       vero di ciascuna, saltando menu, moduli e piede pagina.
       Il risultato e' una BOZZA: chi scrive la corregge nel compositore.
    ========================================================= */
    const SALTA_ID = /(cookie|privacy|footer|nav|menu|form|iscriv|contatt|simulator|wizard|faq)/i;
    function pulisciTesto(s) {
        return String(s || '').replace(/\s+/g, ' ').trim();
    }
    function meta(doc, nome) {
        const el = doc.querySelector('meta[property="' + nome + '"]') || doc.querySelector('meta[name="' + nome + '"]');
        return el ? pulisciTesto(el.getAttribute('content')) : '';
    }
    /* Testo di un elemento, con gli a-capo trattati come spazi: nei titoli del
       sito c'e' spesso un <br> per andare a capo, e leggendo il solo testo le
       due parti si attaccherebbero ("manifatturierecontro"). */
    function testoDi(el) {
        if (!el) return '';
        const copia = el.cloneNode(true);
        const br = copia.querySelectorAll ? copia.querySelectorAll('br') : [];
        for (let i = 0; i < br.length; i++) {
            br[i].parentNode.replaceChild(copia.ownerDocument.createTextNode(' '), br[i]);
        }
        return pulisciTesto(copia.textContent);
    }
    function estraiDaPagina(doc, url, opz) {
        opz = opz || {};
        const maxSezioni = opz.maxSezioni || 5;
        const ogTitolo = meta(doc, 'og:title');
        const ogDesc = meta(doc, 'og:description') || meta(doc, 'description');
        const ogImg = meta(doc, 'og:image');
        const h1 = doc.querySelector('h1');
        // il titolo della pagina finisce con " | Revilaw S.p.A.": in una mail non serve
        const titolo = testoDi(h1) || pulisciTesto((ogTitolo || '').split('|')[0]);
        const badge = doc.querySelector('.hero-badge, .badge-hero, .eyebrow');
        const sub = doc.querySelector('.hero-subtitle, .hero p, .hero-text p');

        const blocchi = [];
        const sezioni = Array.from(doc.querySelectorAll('section[id], section.section'));
        for (const sez of sezioni) {
            if (blocchi.length >= maxSezioni) break;
            const id = sez.getAttribute('id') || '';
            const classi = sez.getAttribute('class') || '';
            if (/hero/.test(id) || /hero/.test(classi)) continue;
            if (id && SALTA_ID.test(id)) continue;
            if (sez.querySelector('form')) continue;
            const h = sez.querySelector('h2');
            if (!h) continue;
            const tit = testoDi(h);
            if (!tit) continue;
            // primo paragrafo con un minimo di sostanza
            let testo = '';
            const paragrafi = Array.from(sez.querySelectorAll('p'));
            for (const p of paragrafi) {
                const t = testoDi(p);
                if (t.length >= 60) { testo = t; break; }
            }
            if (!testo && paragrafi.length) testo = testoDi(paragrafi[0]);
            if (!testo) continue;
            if (testo.length > 420) testo = testo.slice(0, 417).replace(/\s+\S*$/, '') + '...';
            blocchi.push({
                tipo: 'testo', titolo: tit, html: '<p>' + esc(testo) + '</p>',
                ancora: id ? (String(url || '').split('#')[0] + '#' + id) : ''
            });
        }

        return {
            titolo: titolo,
            occhiello: testoDi(badge),
            sommario: testoDi(sub) || ogDesc,
            immagine: ogImg ? assoluto(ogImg, url) : '',
            oggetto: titolo || pulisciTesto((ogTitolo || '').split('|')[0]),
            preheader: ogDesc,
            blocchi: blocchi,
            cta: { testo: 'Leggi l\'approfondimento', url: String(url || '') }
        };
    }

    return {
        COLORI: C, LARGHEZZA: LARGHEZZA, TIPI_BLOCCO: TIPI_BLOCCO,
        SEGNAPOSTO_DISISCRIVI: SEGNAPOSTO_DISISCRIVI, SEGNAPOSTO_WEB: SEGNAPOSTO_WEB,
        costruisci: costruisci, estraiDaPagina: estraiDaPagina,
        ripulisci: ripulisci, stilizza: stilizza, testoDaHtml: testoDaHtml, formatta: formatta, sformatta: sformatta,
        urlSicuro: urlSicuro, esc: esc, pulsante: pulsante
    };
});
