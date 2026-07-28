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
    const LOGO = 'https://nextgenerationbusiness.it/zls_zes/img/logo-revilaw.png';
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
    const MOTIVO_PREDEFINITO = 'Ricevi questa email perche hai chiesto di essere aggiornato'
        + ' sulle iniziative di Next Generation Business.';

    /* --- tipi di blocco riconosciuti dal compositore --- */
    const TIPI_BLOCCO = [
        { id: 'testo', nome: 'Testo', desc: 'Titolo e paragrafo' },
        { id: 'evidenza', nome: 'Riquadro in evidenza', desc: 'Box azzurro per una notizia o una scadenza' },
        { id: 'immagine', nome: 'Immagine', desc: 'Immagine a tutta larghezza, con collegamento' },
        { id: 'bottone', nome: 'Pulsante', desc: 'Invito all\'azione (leggi, iscriviti, scarica)' },
        { id: 'elenco', nome: 'Elenco puntato', desc: 'Punti brevi, uno per riga' },
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
    function stilizza(html) {
        const pStile = 'margin:0 0 14px 0;font-family:' + FONT + ';font-size:15px;line-height:1.65;color:' + C.testo + ';';
        return String(html || '')
            .replace(/<p>/g, '<p style="' + pStile + '">')
            .replace(/<h3>/g, '<h3 style="margin:22px 0 8px 0;font-family:' + FONT + ';font-size:18px;line-height:1.35;color:' + C.scuro + ';">')
            .replace(/<h4>/g, '<h4 style="margin:18px 0 6px 0;font-family:' + FONT + ';font-size:16px;line-height:1.35;color:' + C.scuro + ';">')
            .replace(/<ul>/g, '<ul style="margin:0 0 14px 0;padding-left:22px;">')
            .replace(/<ol>/g, '<ol style="margin:0 0 14px 0;padding-left:22px;">')
            .replace(/<li>/g, '<li style="margin:0 0 7px 0;font-family:' + FONT + ';font-size:15px;line-height:1.6;color:' + C.testo + ';">')
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
    ========================================================= */
    function apriTabella(stile) {
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;' + (stile || '') + '">';
    }
    function cella(contenuto, padding) {
        return '<tr><td style="padding:' + (padding || '0 32px') + ';font-family:' + FONT + ';">' + contenuto + '</td></tr>';
    }

    /* Pulsante che funziona anche su Outlook: la parte VML disegna un
       rettangolo cliccabile, gli altri client vedono il link normale. */
    function pulsante(testo, url, opz) {
        opz = opz || {};
        const u = urlSicuro(url);
        if (!u || !String(testo || '').trim()) return '';
        const sfondo = opz.colore || C.blu;
        const larghezza = Math.max(160, Math.min(420, 24 + String(testo).length * 10));
        return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">'
            + '<tr><td align="center" bgcolor="' + sfondo + '" style="border-radius:4px;">'
            + '<!--[if mso]>'
            + '<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="' + esc(u) + '" '
            + 'style="height:44px;v-text-anchor:middle;width:' + larghezza + 'px;" arcsize="9%" stroke="f" fillcolor="' + sfondo + '">'
            + '<w:anchorlock/><center style="color:#ffffff;font-family:' + FONT + ';font-size:15px;font-weight:bold;">' + esc(testo) + '</center>'
            + '</v:roundrect>'
            + '<![endif]-->'
            + '<!--[if !mso]><!-- -->'
            + '<a href="' + esc(u) + '" style="display:inline-block;padding:13px 28px;font-family:' + FONT + ';font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:4px;background-color:' + sfondo + ';mso-hide:all;">' + esc(testo) + '</a>'
            + '<!--<![endif]-->'
            + '</td></tr></table>';
    }

    /* Corpo di un blocco: "html" se arriva gia' formattato (bozza generata da una
       pagina del sito), altrimenti il testo scritto a mano con le tre regole. */
    function contenuto(b) {
        return b && b.html ? stilizza(ripulisci(b.html)) : stilizza(formatta(b && b.testo));
    }

    /* Un blocco del corpo -> le righe di tabella corrispondenti. */
    function blocco(b, base) {
        if (!b || !b.tipo) return '';
        const tipo = String(b.tipo);
        if (tipo === 'separatore') {
            return cella('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>'
                + '<td height="1" style="height:1px;line-height:1px;font-size:0;background-color:' + C.bordo + ';">&nbsp;</td></tr></table>', '10px 32px 22px');
        }
        if (tipo === 'immagine') {
            const src = assoluto(b.src, base);
            if (!src) return '';
            const img = '<img src="' + esc(src) + '" width="' + (LARGHEZZA - 64) + '" alt="' + esc(b.alt || '') + '" '
                + 'style="display:block;width:100%;max-width:' + (LARGHEZZA - 64) + 'px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;border-radius:4px;">';
            const link = urlSicuro(b.link);
            return cella(link ? '<a href="' + esc(link) + '" style="text-decoration:none;">' + img + '</a>' : img, '4px 32px 22px');
        }
        if (tipo === 'bottone') {
            const p = pulsante(b.testo, b.url);
            return p ? cella('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td align="' + (b.allineamento === 'sinistra' ? 'left' : 'center') + '">' + p + '</td></tr></table>', '6px 32px 26px') : '';
        }
        if (tipo === 'elenco') {
            const voci = (Array.isArray(b.voci) ? b.voci : String(b.voci || '').split('\n'))
                .map(v => String(v || '').trim()).filter(Boolean);
            if (!voci.length && !b.titolo) return '';
            const tit = b.titolo ? '<h3 style="margin:0 0 10px 0;font-family:' + FONT + ';font-size:18px;line-height:1.35;color:' + C.scuro + ';">' + testoHtml(b.titolo) + '</h3>' : '';
            // niente <ul>: su Outlook i punti si spostano. Una riga di tabella per voce,
            // col trattino in una colonna sua: identico ovunque.
            const righe = voci.map(v => '<tr>'
                + '<td valign="top" width="16" style="padding:0 8px 8px 0;font-family:' + FONT + ';font-size:15px;line-height:1.6;color:' + C.azzurro + ';">&bull;</td>'
                + '<td valign="top" style="padding:0 0 8px 0;font-family:' + FONT + ';font-size:15px;line-height:1.6;color:' + C.testo + ';">' + testoHtml(v) + '</td>'
                + '</tr>').join('');
            return cella(tit + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">' + righe + '</table>', '4px 32px 18px');
        }
        if (tipo === 'evidenza') {
            const tit = b.titolo ? '<div style="font-family:' + FONT + ';font-size:16px;font-weight:bold;color:' + C.scuro + ';margin:0 0 8px 0;">' + testoHtml(b.titolo) + '</div>' : '';
            const corpo = contenuto(b);
            return cella('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:' + C.chiaro + ';border-left:3px solid ' + C.azzurro + ';">'
                + '<tr><td style="padding:16px 18px;">' + tit + corpo + '</td></tr></table>', '4px 32px 22px');
        }
        // testo (predefinito)
        const tit = b.titolo ? '<h3 style="margin:0 0 10px 0;font-family:' + FONT + ';font-size:19px;line-height:1.35;color:' + C.scuro + ';">' + testoHtml(b.titolo) + '</h3>' : '';
        const corpo = contenuto(b);
        if (!tit && !corpo) return '';
        return cella(tit + corpo, '4px 32px 10px');
    }

    /* Lo stesso blocco in solo testo. */
    function bloccoTesto(b) {
        if (!b || !b.tipo) return '';
        const t = String(b.tipo);
        if (t === 'separatore') return '--------------------------------------';
        if (t === 'immagine') return '';
        if (t === 'bottone') return (b.testo ? String(b.testo).toUpperCase() + ': ' : '') + urlSicuro(b.url);
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

        /* testa: logo su fondo scuro. Il logo del sito e' chiaro, quindi va su
           fondo scuro (su bianco sarebbe invisibile). */
        const testa = '<tr><td align="center" bgcolor="' + C.scuro + '" style="padding:26px 32px;background-color:' + C.scuro + ';">'
            + '<a href="' + esc(SITO) + '" style="text-decoration:none;">'
            + '<img src="' + esc(LOGO) + '" width="150" alt="Revilaw" style="display:block;width:150px;max-width:150px;height:auto;border:0;outline:none;text-decoration:none;">'
            + '</a></td></tr>';

        /* apertura: occhiello, titolo, sommario, immagine di apertura */
        const occhiello = nl.occhiello
            ? '<div style="font-family:' + FONT + ';font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:' + C.azzurro + ';font-weight:bold;margin:0 0 10px 0;">' + testoHtml(nl.occhiello) + '</div>'
            : '';
        const titolo = nl.titolo
            ? '<h1 style="margin:0 0 12px 0;font-family:' + FONT + ';font-size:26px;line-height:1.25;color:' + C.scuro + ';font-weight:bold;">' + testoHtml(nl.titolo) + '</h1>'
            : '';
        const sommario = nl.sommario
            ? '<p style="margin:0;font-family:' + FONT + ';font-size:16px;line-height:1.6;color:' + C.tenue + ';">' + testoHtml(nl.sommario) + '</p>'
            : '';
        const apertura = (occhiello || titolo || sommario) ? cella(occhiello + titolo + sommario, '30px 32px 18px') : '';
        const copertina = nl.immagine
            ? blocco({ tipo: 'immagine', src: nl.immagine, alt: nl.titolo || '', link: (nl.fonte && nl.fonte.url) || '' }, base)
            : '';

        const ctaFinale = (nl.cta && nl.cta.url && nl.cta.testo)
            ? blocco({ tipo: 'bottone', testo: nl.cta.testo, url: nl.cta.url }, base)
            : '';

        /* piede: mittente, motivo dell'invio, disiscrizione (obbligatoria).
           I testi sono in chiaro (niente entita' HTML): servono uguali anche alla
           versione in solo testo, dove un "&middot;" resterebbe scritto cosi'. */
        const motivo = nl.motivo || MOTIVO_PREDEFINITO;
        const piede = '<tr><td style="padding:24px 32px 30px;background-color:' + C.sfondo + ';border-top:1px solid ' + C.bordo + ';">'
            + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="font-family:' + FONT + ';font-size:12px;line-height:1.6;color:' + C.tenue + ';">'
            + '<div style="font-weight:bold;color:' + C.scuro + ';font-size:13px;">' + esc(MITTENTE.nome) + '</div>'
            + '<div>' + esc(MITTENTE.indirizzo) + ' &middot; ' + esc(MITTENTE.cf) + '</div>'
            + '<div style="margin-top:10px;">' + esc(motivo) + '</div>'
            + '<div style="margin-top:12px;">'
            + '<a href="' + SEGNAPOSTO_DISISCRIVI + '" style="color:' + C.tenue + ';text-decoration:underline;">Annulla l\'iscrizione</a>'
            + ' &nbsp;&middot;&nbsp; <a href="' + esc(PRIVACY) + '" style="color:' + C.tenue + ';text-decoration:underline;">Informativa privacy</a>'
            + ' &nbsp;&middot;&nbsp; <a href="' + esc(SITO) + '" style="color:' + C.tenue + ';text-decoration:underline;">nextgenerationbusiness.it</a>'
            + '</div>'
            + '<div style="margin-top:10px;color:#94A3B8;">&copy; ' + anno + ' ' + esc(MITTENTE.nome) + '</div>'
            + '</td></tr></table></td></tr>';

        /* testo di anteprima: lo mostra il client accanto all'oggetto. I caratteri
           invisibili in coda impediscono che ci finisca dentro l'inizio del corpo. */
        const preheader = '<div style="display:none;font-size:1px;color:' + C.sfondo + ';line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">'
            + esc(nl.preheader || nl.sommario || '') + '&#8199;&#65279;&#847; '.repeat(30) + '</div>';

        const corpoInterno = testa + apertura + copertina + blocchi + ctaFinale + piede;

        const html = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n'
            + '<html xmlns="http://www.w3.org/1999/xhtml" lang="it" xml:lang="it">\n<head>\n'
            + '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />\n'
            + '<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
            + '<meta http-equiv="X-UA-Compatible" content="IE=edge" />\n'
            + '<meta name="x-apple-disable-message-reformatting" />\n'
            + '<meta name="format-detection" content="telephone=no,address=no,email=no,date=no" />\n'
            + '<meta name="color-scheme" content="light" />\n'
            + '<meta name="supported-color-schemes" content="light" />\n'
            + '<title>' + esc(nl.oggetto || nl.titolo || 'Newsletter') + '</title>\n'
            + '<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->\n'
            + '<style type="text/css">\n'
            + 'body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}\n'
            + 'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}\n'
            + 'img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}\n'
            + 'body{margin:0!important;padding:0!important;width:100%!important;}\n'
            + 'a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}\n'
            + '.corpo-mail{width:' + LARGHEZZA + 'px;}\n'
            + '@media only screen and (max-width:620px){\n'
            + '  .corpo-mail{width:100%!important;}\n'
            + '  .corpo-mail td{padding-left:20px!important;padding-right:20px!important;}\n'
            + '  h1{font-size:22px!important;line-height:1.3!important;}\n'
            + '}\n'
            + '</style>\n</head>\n'
            + '<body style="margin:0;padding:0;background-color:' + C.sfondo + ';">\n'
            + preheader
            + apiTabellaEsterna()
            + '<tr><td align="center" style="padding:22px 10px;">'
            + '<!--[if mso]><table role="presentation" align="center" width="' + LARGHEZZA + '" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->'
            + '<table role="presentation" class="corpo-mail" align="center" width="' + LARGHEZZA + '" cellpadding="0" cellspacing="0" border="0" '
            + 'style="border-collapse:collapse;width:' + LARGHEZZA + 'px;max-width:' + LARGHEZZA + 'px;background-color:' + C.bianco + ';border:1px solid ' + C.bordo + ';">'
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
    function apiTabellaEsterna() {
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:' + C.sfondo + ';">';
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
