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
    /* Tavolozza: quella del SITO, che e' una sola scala di blu e non ha un secondo
       colore. L'oro che c'era prima non veniva dal marchio, veniva dallo stile
       interno dell'area riservata, dove serve a segnalare gli avvisi: su una
       comunicazione dello studio stonava e non era riconducibile a niente.
       Un solo colore, molti toni: e' quello che fa sembrare la cosa di qualcuno. */
    const C = {
        scuro: '#0A2844',       // navy-dark del sito
        blu: '#164068',         // navy
        accento: '#2A5A85',     // navy-light: filetti e segni
        chiaroBlu: '#5B89B8',   // navy-glow: segni su fondo scuro
        suScuro: '#C8DAEA',     // testo tenue sopra il blu
        azzurro: '#8bb8d4',
        testo: '#1E293B',
        tenue: '#475569',
        bordo: '#E2E8F0',
        sfondo: '#F1F5F9',
        chiaro: '#F4F8FB',
        bianco: '#FFFFFF'
    };
    const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
    const LARGHEZZA = 600;
    /* Marchio per esteso (simbolo + scritta), su fondo bianco incorporato: e' l'unico
       dei tre che porta anche il nome, ed e' il motivo per cui la testata e' bianca. */
    const LOGO = 'https://nextgenerationbusiness.it/assets/logo-revilaw.png';
    /* Marchio in bianco su trasparenza, ricavato da quello con la scritta: serve
       perche' la testata ora e' blu. Senza, l'unico file con il nome esteso
       porterebbe con se' il suo fondo bianco e comparirebbe come un rettangolo. */
    const LOGO_BIANCO = 'https://nextgenerationbusiness.it/assets/logo-revilaw-bianco.png';
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

    /* I tre momenti in cui si articola una comunicazione che si fa capire.
       L'ordine non e' un vezzo: chi comincia dalla norma invece che dal motivo
       scrive qualcosa che il destinatario non finisce di leggere, perche' non
       ha ancora capito se lo riguarda. */
    const FASI = {
        perche: { n: '01', etichetta: 'Perché', aiuto: 'Perché questa cosa riguarda chi legge. Il problema, il rischio, l\'occasione. Niente riferimenti normativi qui.' },
        come: { n: '02', etichetta: 'Come', aiuto: 'Come funziona: il meccanismo, le condizioni, i passaggi. Qui ci stanno i riferimenti.' },
        cosa: { n: '03', etichetta: 'Che cosa', aiuto: 'Che cosa fare adesso, e che cosa facciamo noi. Concreto e con una scadenza, se c\'e.' }
    };

    /* La newsletter ha una struttura FISSA: perche', come, che cosa. Non e' una
       scelta di stile ed e' il motivo per cui qui non si compongono blocchi:
       l'impaginazione la decide questo file, chi scrive porta i tre testi.
       Non si aggiungono immagini. L'unica che c'e' e' la fascia della testata,
       che fa parte del formato e non e' una scelta da fare ogni volta: una mail
       dello studio si riconosce perche' e' sempre uguale, non perche' ogni volta
       si sceglie qualcosa di diverso. */
    const ORDINE_FASI = ['perche', 'come', 'cosa'];
    const FASCIA = 'https://nextgenerationbusiness.it/assets/newsletter/fascia-filigrana.png';

    /* --- tipi di blocco: restano solo per le bozze vecchie, gia' salvate come
       elenco di blocchi. Il compositore non li offre piu'. --- */
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
        /* Sul fondo blu OGNI colore va dichiarato, nessuno ereditato: la modalita'
           scura di Gmail e Outlook.com ribalta il testo che non ha un colore
           proprio, e il grassetto senza regola erediterebbe il tenue e sparirebbe.
           Il giustificato qui non si usa: su fondo scuro i canali bianchi fra le
           parole si vedono il doppio. */
        const scuro = opz && opz.scuro;
        const cTesto = scuro ? C.suScuro : C.testo;
        const cTitoli = scuro ? C.bianco : C.scuro;
        const cLink = scuro ? C.bianco : C.blu;
        /* GIUSTIFICATO OVUNQUE. Vale in tutti e tre i momenti, perche' tutti e tre
           hanno una colonna da 520px: e' la misura su cui il giustificato da' il
           blocco compatto di una circolare invece di una frangia a destra.
           Non vale nelle schede affiancate (250px) e nelle voci di elenco, che
           non passano di qui: la' i buchi bianchi fra le parole si aprirebbero
           davvero, e sotto i 620px ci pensa la classe "par" a riportare tutto a
           sinistra su ogni schermo stretto. */
        const pStile = 'margin:0 0 ' + (scuro ? 14 : (stretto ? 12 : 16)) + 'px 0;font-family:' + FONT
            + ';font-size:' + (stretto ? 15 : 16) + 'px;line-height:' + (scuro ? 26 : (stretto ? 24 : 27)) + 'px;color:' + cTesto + ';'
            + 'text-align:justify;';
        return String(html || '')
            .replace(/<p>/g, '<p class="par" style="' + pStile + '">')
            .replace(/<h3>/g, '<h3 style="margin:26px 0 10px 0;font-family:' + FONT + ';font-size:18px;line-height:25px;color:' + cTitoli + ';">')
            .replace(/<h4>/g, '<h4 style="margin:20px 0 8px 0;font-family:' + FONT + ';font-size:16px;line-height:23px;color:' + cTitoli + ';">')
            .replace(/<ul>/g, '<ul style="margin:0 0 16px 0;padding-left:22px;">')
            .replace(/<ol>/g, '<ol style="margin:0 0 16px 0;padding-left:22px;">')
            .replace(/<li>/g, '<li style="margin:0 0 8px 0;font-family:' + FONT + ';font-size:16px;line-height:26px;color:' + cTesto + ';">')
            .replace(/<strong>/g, '<strong style="color:' + cTitoli + ';">')
            .replace(/<b>/g, '<b style="color:' + cTitoli + ';">')
            .replace(/<a href=/g, '<a style="color:' + cLink + ';text-decoration:underline;" href=');
    }
    /* Per i testi che NON passano da stilizza (schede, voci, azioni): senza
       questo i collegamenti restano del blu di default del browser, che e'
       fuori tavolozza e stona su qualunque fondo. */
    function stilizzaInline(html, cLink, cForte) {
        return String(html || '')
            .replace(/<a href=/g, '<a style="color:' + (cLink || C.blu) + ';text-decoration:underline;" href=')
            .replace(/<strong>/g, '<strong style="color:' + (cForte || C.scuro) + ';">')
            .replace(/<b>/g, '<b style="color:' + (cForte || C.scuro) + ';">');
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
        /* Le righe che cominciano con un trattino diventano un elenco puntato.
           Serve a poter fare un elenco senza doverlo scegliere da un menu: la
           struttura della mail e' fissa, e chi scrive deve poter dare ritmo al
           testo con quello che ha gia' sotto le dita. */
        const arricchisci = s => s.replace(/\*\*([^*]{1,300})\*\*/g, '<strong>$1</strong>');
        return grezzo.split(/\n{2,}/).map(par => {
            const righe = par.trim().split('\n');
            const tuttePunti = righe.length > 0 && righe.every(r => /^\s*[-–•]\s+\S/.test(r));
            if (tuttePunti) {
                const voci = righe.map(r => {
                    let v = esc(r.replace(/^\s*[-–•]\s+/, ''));
                    v = v.replace(/\[([^\]]{1,120})\]\(([^)\s]{1,400})\)/g, (t, testo, url) => {
                        const u = urlSicuro(String(url).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
                        return u ? '<a href="' + esc(u) + '">' + testo + '</a>' : testo;
                    });
                    return '<li>' + arricchisci(v) + '</li>';
                }).join('');
                return '<ul>' + voci + '</ul>';
            }
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
                /* il font-size:0 del contenitore serve a togliere lo spazio fra i
                   riquadri in linea, ma la cella dentro lo EREDITA: senza
                   rimetterlo qui, qualunque testo privo di misura propria
                   diventa invisibile. Non e' teoria: e' successo. */
                + tabellaInterna('<tr><td valign="top" style="' + FONTE + 'font-size:15px;line-height:24px;">' + p + '</td></tr>')
                + '</div>';
        });
        return '<div style="font-size:0;line-height:0;">' + mso + html + '<!--[if mso]></td></tr></table><![endif]--></div>';
    }

    /* Trattino d'oro sopra il titolo di sezione: e' l'elemento che si ripete e
       che fa riconoscere l'inizio di un blocco senza doverlo leggere. */
    function segnoSezione() {
        return '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="34" style="border-collapse:collapse;">'
            + '<tr><td bgcolor="' + C.accento + '" width="34" height="2" style="background-color:' + C.accento
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

    /* Uno dei tre momenti della mail: PERCHE' la cosa riguarda chi legge, COME
       funziona, CHE COSA fare. Saltare il primo e' il modo piu' rapido di
       scrivere una circolare che nessuno finisce: si comincia dalla norma invece
       che dal motivo, e chi legge non arriva mai a capire se lo riguarda.
       Il numero grande e tenue non e' un ornamento: fa vedere a colpo d'occhio
       che i momenti sono tre e a quale si e' arrivati. */
    /* Le soglie stanno tutte qui: sono le uniche cose da toccare per cambiare il
       comportamento, e averle sparse nel codice le renderebbe impossibili da
       ritrovare. Contano CARATTERI di testo vero, non di HTML. */
    const SOGLIE = { ATT_MIN: 18, ATT_MAX: 400, SCHEDA_MAX: 120, SCHEDE_MAX_V: 8, AZIONE_MAX: 140, LASTRA: 700, LASTRA_UNICO: 900 };

    /* --- normalizzazione ---
       Il testo di una sezione puo' arrivare in due forme: scritto a mano
       (d.testo) oppure generato da una pagina del sito (d.html). Tutte le regole
       che seguono contano caratteri e cercano elenchi: se girassero solo su
       d.testo si spegnerebbero in silenzio sulle bozze generate, che e' il caso
       in cui servono di piu'. Quindi prima si porta tutto alla stessa forma. */
    function blocchiSezione(d) {
        d = d || {};
        let pezzi = [];
        if (d.html) {
            const ripulito = ripulisci(d.html);
            const re = /<(p|ul|ol|h3|h4)\b[^>]*>[\s\S]*?<\/\1>/gi;
            let m, ultimo = 0, fuori = '';
            while ((m = re.exec(ripulito)) !== null) {
                fuori += ripulito.slice(ultimo, m.index);
                pezzi.push(m[0]);
                ultimo = m.index + m[0].length;
            }
            fuori += ripulito.slice(ultimo);
            if (fuori.replace(/<[^>]*>/g, '').trim()) pezzi.push('<p>' + fuori + '</p>');
        } else {
            // formatta spezza sullo stesso confine e unisce senza separatore:
            // passare i pezzi uno per uno da' esattamente lo stesso risultato
            pezzi = String(d.testo || '').replace(/\r\n?/g, '\n').trim()
                .split(/\n{2,}/).map(p => formatta(p)).filter(Boolean);
        }
        return pezzi.map(h => ({ tipo: /^<(ul|ol)\b/i.test(h) ? 'ul' : 'p', html: h }));
    }
    function lung(html) { return testoDaHtml(String(html || '')).replace(/\s+/g, ' ').trim().length; }
    function vociDi(html) {
        const out = [];
        const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        let m;
        while ((m = re.exec(String(html || ''))) !== null) out.push(m[1]);
        return out;
    }
    /* L'etichetta si emette GIA' maiuscola invece di usare text-transform, che il
       motore di Word non conosce: su Outlook resterebbe minuscola. */
    const ETI = 'font-size:12px;line-height:17px;letter-spacing:1.6px;';
    function etichettaFase(f, colore) {
        return '<div style="' + FONTE + ETI + 'color:' + colore + ';font-weight:bold;">' + esc(f.etichetta.toUpperCase()) + '</div>';
    }
    function haContenuto(d) {
        d = d || {};
        return !!(String(d.titolo || '').trim() || String(d.testo || '').trim() || d.html);
    }

    /* --- 01 PERCHE': la colonna di lettura ---
       L'unica sezione a misura piena, senza campo di colore e senza colonne.
       Deve sembrare SCRITTA, non impaginata: e' il momento in cui chi legge
       decide se la cosa lo riguarda, e un riquadro colorato qui allontana. */
    function sezionePerche(d) {
        d = d || {};
        if (!haContenuto(d)) return '';
        const f = FASI.perche;
        const bl = blocchiSezione(d);
        const primo = bl[0];
        const L0 = primo ? lung(primo.html) : 0;
        /* Le bozze generate da una pagina incollano il titolo della sezione come
           primo paragrafo tutto in grassetto: quello non e' un attacco. */
        const soloForte = primo && /^<p>\s*<strong>[\s\S]*<\/strong>\s*<\/p>$/i.test(primo.html.trim());
        const attacco = primo && primo.tipo === 'p' && !soloForte
            && L0 >= SOGLIE.ATT_MIN && L0 <= SOGLIE.ATT_MAX;
        const apreConElenco = primo && primo.tipo === 'ul';
        const corpo = attacco
            ? '<div class="att par" style="' + FONTE + 'font-size:20px;line-height:31px;color:' + C.scuro + ';margin:0 0 18px 0;text-align:justify;">'
              + stilizzaInline(primo.html.replace(/^<p>/i, '').replace(/<\/p>$/i, ''), C.blu, C.scuro) + '</div>'
              + stilizza(bl.slice(1).map(b => b.html).join(''))
            : stilizza(bl.map(b => b.html).join(''));
        return cella(tabellaInterna(
            '<tr><td class="n1" style="' + FONTE + 'font-size:46px;line-height:40px;font-weight:bold;letter-spacing:-1px;color:' + C.bordo + ';">' + f.n + '</td></tr>'
            + spazio(10)
            + '<tr><td>' + etichettaFase(f, C.accento) + '</td></tr>'
            + spazio(8)
            + (d.titolo
                ? '<tr><td class="t1" style="' + FONTE + 'font-size:' + (apreConElenco ? 26 : 24) + 'px;line-height:' + (apreConElenco ? 34 : 32) + 'px;font-weight:bold;color:' + C.scuro + ';">' + testoHtml(d.titolo) + '</td></tr>' + spazio(14)
                : '')
            + '<tr><td>' + corpo + '</td></tr>'
        ), '36px ' + LATO + 'px 0');
    }

    /* --- 02 COME: il pannello e le schede ---
       Campo tenue a tutta larghezza, corpo piccolo, numero piccolo e solido. Se
       chi scrive ha messo un elenco, le voci diventano schede affiancate: e'
       l'unica leva, e ce l'ha gia' sotto le dita (il trattino). Non e' una
       scelta di impaginazione, e' una scelta di scrittura. */
    function schedaCome(n, voce) {
        return '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="' + C.bianco + '" style="border-collapse:collapse;background-color:' + C.bianco + ';border:1px solid ' + C.bordo + ';">'
            + '<tr><td bgcolor="' + C.accento + '" height="3" style="background-color:' + C.accento + ';height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>'
            + '<tr><td style="padding:14px 16px 16px;' + FONTE + '">'
            + '<div style="' + FONTE + ETI + 'color:' + C.accento + ';font-weight:bold;padding-bottom:6px;">' + (n < 10 ? '0' + n : String(n)) + '</div>'
            + '<div style="' + FONTE + 'font-size:15px;line-height:23px;color:' + C.testo + ';">' + stilizzaInline(voce, C.blu, C.scuro) + '</div>'
            + '</td></tr></table>';
    }
    function righeElencate(voci, colSegno, colTesto, conFiletto) {
        return voci.map((v, i) => '<tr><td style="padding:' + (i ? '12px' : '0') + ' 0 12px 0;'
            + (conFiletto && i ? 'border-top:1px solid ' + C.bordo + ';' : '') + '">'
            + tabellaInterna('<tr>'
                + '<td valign="top" width="26" style="width:26px;' + FONTE + ETI + 'color:' + colSegno + ';font-weight:bold;padding-top:3px;">' + (i + 1 < 10 ? '0' + (i + 1) : String(i + 1)) + '</td>'
                + '<td valign="top" style="' + FONTE + 'font-size:15px;line-height:23px;color:' + colTesto + ';">' + stilizzaInline(v, C.blu, C.scuro) + '</td>'
                + '</tr>')
            + '</td></tr>').join('');
    }
    function sezioneCome(d) {
        d = d || {};
        if (!haContenuto(d)) return '';
        const f = FASI.come;
        const bl = blocchiSezione(d);
        let usateSchede = false;
        const pezzi = bl.map(b => {
            if (b.tipo !== 'ul') return stilizza(b.html, { stretto: true });
            const voci = vociDi(b.html);
            // le schede sono l'elemento forte della sezione: compaiono una volta sola
            const puo = !usateSchede && voci.length >= 2 && voci.length <= SOGLIE.SCHEDE_MAX_V
                && voci.every(v => lung(v) <= SOGLIE.SCHEDA_MAX);
            if (voci.length === 1) return stilizza('<p>' + voci[0] + '</p>', { stretto: true });
            if (!puo) return tabellaInterna(righeElencate(voci, C.accento, C.testo, true));
            usateSchede = true;
            /* Una chiamata a "colonne" PER RIGA, non una sola per tutta la griglia:
               con una sola, su Outlook le colonne diventano due celle affiancate e
               l'ordine di lettura per righe salterebbe da 1 a meta' elenco. */
            const righe = [];
            for (let i = 0; i < voci.length; i += 2) {
                const coppia = [schedaCome(i + 1, voci[i])];
                if (voci[i + 1] != null) coppia.push(schedaCome(i + 2, voci[i + 1]));
                righe.push('<tr><td style="padding:' + (i ? '16px' : '6px') + ' 0 0 0;">' + colonne(coppia, null, 20) + '</td></tr>');
            }
            return tabellaInterna(righe.join('') + spazio(18));
        }).join('');
        return '<tr><td class="px" bgcolor="' + C.chiaro + '" style="background-color:' + C.chiaro + ';padding:30px ' + LATO + 'px 32px;' + FONTE + '">'
            + tabellaInterna(
                '<tr><td>' + tabellaInterna('<tr>'
                    + '<td valign="top" width="50" style="width:50px;">'
                    + '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="34" style="border-collapse:collapse;"><tr>'
                    + '<td bgcolor="' + C.accento + '" align="center" width="34" height="34" style="background-color:' + C.accento + ';width:34px;height:34px;' + FONTE
                    + 'font-size:15px;line-height:34px;font-weight:bold;color:' + C.bianco + ';text-align:center;">' + f.n + '</td>'
                    + '</tr></table></td>'
                    + '<td valign="top" style="padding-top:2px;' + FONTE + '">'
                    + '<div style="padding-bottom:6px;">' + etichettaFase(f, C.accento) + '</div>'
                    + (d.titolo ? '<div style="' + FONTE + 'font-size:20px;line-height:28px;font-weight:bold;color:' + C.scuro + ';">' + testoHtml(d.titolo) + '</div>' : '')
                    + '</td></tr>')
                + '</td></tr>'
                + spazio(16)
                + '<tr><td>' + pezzi + '</td></tr>'
            )
            + '</td></tr>';
    }

    /* --- 03 CHE COSA: la lastra ---
       L'unica sezione in negativo, e la chiusura del giro aperto dalla testata
       blu. Il numero grande in blu appena piu' chiaro del fondo si legge come un
       rilievo, non come una scritta: nessuna informazione dipende da lui, ed e'
       voluto. Se il testo e' troppo lungo tracima su bianco, perche' un muro di
       testo in negativo non lo legge nessuno. */
    function sezioneCosa(d) {
        d = d || {};
        if (!haContenuto(d)) return { lastra: '', coda: '' };
        const f = FASI.cosa;
        const bl = blocchiSezione(d);
        const L0 = bl.length ? lung(bl[0].html) : 0;
        let dentro = [], fuori = [];
        if (L0 > SOGLIE.LASTRA_UNICO) {
            fuori = bl;                       // sulla lastra restano solo testatina e titolo
        } else {
            let somma = 0;
            for (let i = 0; i < bl.length; i++) {
                const l = lung(bl[i].html);
                // il primo entra sempre; poi ci si ferma al primo che non ci sta,
                // senza saltarlo: l'ordine di lettura non si tocca mai
                if (i === 0 || somma + l <= SOGLIE.LASTRA) { dentro.push(bl[i]); somma += l; }
                else { fuori = bl.slice(i); break; }
            }
        }
        let usateAzioni = false;
        const corpo = dentro.map(b => {
            if (b.tipo !== 'ul') return stilizza(b.html, { scuro: true });
            const voci = vociDi(b.html);
            if (voci.length === 2 && !usateAzioni && voci.every(v => lung(v) <= SOGLIE.AZIONE_MAX)) {
                usateAzioni = true;
                const col = v => '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">'
                    + '<tr><td bgcolor="' + C.chiaroBlu + '" height="2" style="background-color:' + C.chiaroBlu + ';height:2px;font-size:0;line-height:0;">&nbsp;</td></tr>'
                    + '<tr><td style="padding-top:12px;' + FONTE + 'font-size:16px;line-height:25px;color:' + C.bianco + ';">' + stilizzaInline(v, C.bianco, C.bianco) + '</td></tr></table>';
                return colonne([col(voci[0]), col(voci[1])], null, 20);
            }
            return tabellaInterna(voci.map((v, i) => '<tr><td style="padding:0 0 11px 0;">'
                + tabellaInterna('<tr>'
                    + '<td valign="top" width="20" style="width:20px;padding:9px 0 0 0;">'
                    + '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="7" style="border-collapse:collapse;"><tr>'
                    + '<td bgcolor="' + C.chiaroBlu + '" width="7" height="7" style="background-color:' + C.chiaroBlu + ';width:7px;height:7px;font-size:0;line-height:0;">&nbsp;</td>'
                    + '</tr></table></td>'
                    + '<td valign="top" style="' + FONTE + 'font-size:16px;line-height:26px;color:' + C.suScuro + ';">' + stilizzaInline(v, C.bianco, C.bianco) + '</td>'
                    + '</tr>')
                + '</td></tr>').join(''));
        }).join('');
        const lastra = '<tr><td class="px" bgcolor="' + C.scuro + '" style="background-color:' + C.scuro + ';padding:34px ' + LATO + 'px 36px;' + FONTE + '">'
            + tabellaInterna(
                '<tr><td>' + tabellaInterna('<tr>'
                    + '<td valign="top" width="86" class="n3" style="width:86px;' + FONTE
                    + 'font-size:64px;line-height:56px;font-weight:bold;letter-spacing:-2px;color:' + C.accento + ';">' + f.n + '</td>'
                    + '<td valign="top" style="padding-top:6px;' + FONTE + '">'
                    + '<div style="padding-bottom:8px;">' + etichettaFase(f, C.suScuro) + '</div>'
                    + (d.titolo ? '<div style="' + FONTE + 'font-size:22px;line-height:30px;font-weight:bold;color:' + C.bianco + ';">' + testoHtml(d.titolo) + '</div>' : '')
                    + '</td></tr>')
                + '</td></tr>'
                + (corpo ? spazio(16) + '<tr><td>' + corpo + '</td></tr>' : '')
            )
            + '</td></tr>';
        const coda = fuori.length ? cella(stilizza(fuori.map(b => b.html).join('')), '26px ' + LATO + 'px 0') : '';
        return { lastra: lastra, coda: coda };
    }

    // resta per le bozze salvate con il formato a blocchi
    function sezioneFase(chiave, dati) {
        if (chiave === 'come') return sezioneCome(dati);
        if (chiave === 'cosa') { const r = sezioneCosa(dati); return r.lastra + r.coda; }
        return sezionePerche(dati);
    }
    function sezioneFaseTesto(chiave, dati) {
        const f = FASI[chiave] || FASI.perche;
        const d = dati || {};
        const corpo = testoDaHtml(d.html ? ripulisci(d.html) : formatta(d.testo));
        if (!String(d.titolo || '').trim() && !corpo.trim()) return '';
        return f.etichetta.toUpperCase() + (d.titolo ? ' - ' + d.titolo : '') + '\n' + corpo;
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
                    + '<td bgcolor="' + C.accento + '" width="7" height="7" style="background-color:' + C.accento + ';width:7px;height:7px;font-size:0;line-height:0;">&nbsp;</td>'
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
                + '<td width="4" bgcolor="' + C.accento + '" style="width:4px;background-color:' + C.accento + ';font-size:0;line-height:0;">&nbsp;</td>'
                + '<td style="padding:18px 20px;">' + tabellaInterna(dentro) + '</td>'
                + '</tr></table>', '30px ' + LATO + 'px 4px');
        }
        if (tipo === 'passo') return sezioneFase(String(b.fase || 'perche'), b);
        if (tipo === 'duo') {
            /* Due schede affiancate. Serve a spezzare il ritmo di una colonna
               unica: due notizie brevi, o due facce della stessa cosa, si leggono
               a colpo d'occhio invece di diventare due paragrafi uno sotto
               l'altro. Sotto i 620px si impilano da sole. */
            const scheda = (tit, txt) => {
                if (!String(tit || '').trim() && !String(txt || '').trim()) return '';
                return '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:' + C.chiaro + ';">'
                    + '<tr><td bgcolor="' + C.accento + '" height="3" style="background-color:' + C.accento + ';height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>'
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
                // sul blu la cifra va in bianco: l'accento e' un blu piu' chiaro,
                // ma su fondo blu scuro resterebbe troppo poco leggibile
                + '<div style="' + FONTE + 'font-size:44px;line-height:50px;color:' + C.bianco + ';font-weight:bold;letter-spacing:-1px;">' + testoHtml(cifra) + '</div>'
                + (b.etichetta ? '<div style="' + FONTE + SCALA.etichetta + 'color:' + C.chiaroBlu + ';font-weight:bold;padding-top:6px;">' + testoHtml(b.etichetta) + '</div>' : '')
                + (b.testo ? '<div style="' + FONTE + 'font-size:15px;line-height:24px;color:' + C.suScuro + ';padding-top:12px;">' + testoHtml(b.testo) + '</div>' : '')
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
        if (t === 'passo') {
            const f = FASI[String(b.fase || 'perche')] || FASI.perche;
            return f.etichetta.toUpperCase() + (b.titolo ? ' - ' + b.titolo : '') + '\n'
                + testoDaHtml(b.html ? ripulisci(b.html) : formatta(b.testo));
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
    /* La pagina completa della mail: doctype, head con gli stili per i telefoni,
       corpo su fondo tenue e colonna centrale bianca. E' la stessa per la
       newsletter e per la conferma di iscrizione: la mail cambia dentro, non
       fuori, ed e' cosi' che si riconosce da chi arriva. */
    function involucro(oggetto, anteprima, corpoInterno) {
        /* Testo di anteprima: lo mostra il client accanto all'oggetto. I caratteri
           invisibili in coda impediscono che ci finisca dentro l'inizio del corpo. */
        const preheader = '<div style="display:none;font-size:1px;color:' + C.sfondo + ';line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">'
            + esc(anteprima || '') + '&#8199;&#65279;&#847; '.repeat(30) + '</div>';
        return '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n'
            + '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" lang="it" xml:lang="it">\n<head>\n'
            + '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />\n'
            + '<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
            + '<meta http-equiv="X-UA-Compatible" content="IE=edge" />\n'
            + '<meta name="x-apple-disable-message-reformatting" content="" />\n'
            + '<meta name="format-detection" content="telephone=no,address=no,email=no,date=no" />\n'
            + '<meta name="color-scheme" content="light" />\n'
            + '<meta name="supported-color-schemes" content="light" />\n'
            + '<title>' + esc(oggetto || '') + '</title>\n'
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
            /* I tre momenti hanno corpi diversi anche sul telefono, altrimenti la
               differenza fra loro sparisce proprio dove lo spazio e' poco.
               ".lead" NON si tocca: e' del sommario nella testata. */
            + '  .att{font-size:18px!important;line-height:28px!important;}\n'
            + '  .t1{font-size:21px!important;line-height:29px!important;}\n'
            + '  .n1{font-size:38px!important;line-height:34px!important;}\n'
            + '  .n3{width:64px!important;font-size:48px!important;line-height:44px!important;}\n'
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
    }

    function costruisci(nl, opz) {
        nl = nl || {}; opz = opz || {};
        const base = (nl.fonte && nl.fonte.url) || SITO;
        /* Il corpo sono i tre momenti, sempre in quest'ordine. L'elenco di
           blocchi resta letto solo per le bozze salvate con il formato di prima:
           il compositore non ne produce piu'. */
        const sPerche = sezionePerche(nl.perche);
        const sCome = sezioneCome(nl.come);
        const sCosa = sezioneCosa(nl.cosa);
        const conSezioni = !!(sPerche || sCome || sCosa.lastra);
        /* Lo stacco superiore appartiene alla sezione che segue, e c'e' solo se
           qualcosa la precede: cosi' una sezione vuota non lascia il suo buco. */
        const sezioni = conSezioni
            ? sPerche
            + (sCome ? (sPerche ? spazio(34) : '') + sCome : '')
            + (sCosa.lastra ? ((sPerche || sCome) ? spazio(28) : '') + sCosa.lastra : '')
            + sCosa.coda
            : '';
        const blocchi = sezioni
            || (Array.isArray(nl.blocchi) ? nl.blocchi : []).map(b => blocco(b, base)).join('');
        /* Il filetto sopra il pulsante serve a staccarlo dal testo. Se pero' la
           mail chiude con la lastra blu, il bordo della lastra stacca gia': un
           filetto in piu' sarebbe una riga per niente. */
        const chiudeInBlu = conSezioni && !!sCosa.lastra && !sCosa.coda;
        const anno = opz.anno || new Date().getFullYear();

        /* TESTATA E APERTURA SONO UN BLOCCO SOLO, sul blu del marchio.
           Prima erano tre pezzi separati: testata bianca, apertura bianca,
           immagine sotto. Si vedevano le giunture, e l'immagine sembrava
           incollata sopra la mail invece di farne parte. Ora il marchio,
           l'occhiello, il titolo e il sommario stanno dentro lo stesso campo
           blu, e la fascia che segue e' dello stesso blu senza spazio in mezzo:
           dove finisce la scrittura e comincia l'immagine non si vede.
           Il marchio e' quello in bianco su trasparenza: quello con il fondo
           bianco incorporato, qui, comparirebbe come un rettangolo. */
        const occhiello = nl.occhiello
            ? '<tr><td style="' + FONTE + SCALA.occhiello + 'color:' + C.chiaroBlu + ';font-weight:bold;">' + testoHtml(nl.occhiello) + '</td></tr>' + spazio(12)
            : '';
        const titolo = nl.titolo
            ? '<tr><td class="h1" style="' + FONTE + SCALA.titolo + 'color:' + C.bianco + ';font-weight:bold;letter-spacing:-0.3px;">' + testoHtml(nl.titolo) + '</td></tr>'
            : '';
        const sommario = nl.sommario
            /* Giustificato anche qui: e' l'unico testo di lettura della testata, e
               lasciarlo a bandiera mentre tutto il resto della mail e' giustificato
               si vede. Porta anche la classe "par", quella che sotto i 620px
               riporta a sinistra: due classi, due lavori diversi. */
            ? (titolo ? spazio(16) : '') + '<tr><td class="lead par" style="' + FONTE + SCALA.sommario + 'color:' + C.suScuro + ';text-align:justify;">' + testoHtml(nl.sommario) + '</td></tr>'
            : '';
        const testa = '<tr><td bgcolor="' + C.scuro + '" class="px" style="background-color:' + C.scuro + ';padding:30px ' + LATO + 'px 30px;">'
            + tabellaInterna(
                '<tr><td><a href="' + esc(SITO) + '" style="text-decoration:none;">'
                + '<img src="' + esc(LOGO_BIANCO) + '" width="150" alt="Revilaw - Revisione legale" '
                + 'style="display:block;width:150px;max-width:150px;height:auto;border:0;outline:none;text-decoration:none;'
                + 'font-family:' + FONT + ';font-size:18px;line-height:24px;font-weight:bold;color:' + C.bianco + ';">'
                + '</a></td></tr>'
                + ((occhiello || titolo || sommario) ? spazio(24) : '')
                + occhiello + titolo + sommario
            )
            + '</td></tr>';
        const apertura = '';

        /* La fascia CONTINUA la testata: stesso fondo blu, nessuno spazio in
           mezzo, e nessun secondo marchio dentro (il marchio sta gia' sopra).
           Senza immagine si chiude comunque con lo stesso filo che le fasce
           hanno in fondo, cosi' lo stacco verso il corpo bianco e' identico
           nei due casi. */
        const copertina = '<tr><td bgcolor="' + C.scuro + '" style="background-color:' + C.scuro + ';font-size:0;line-height:0;">'
            + '<img src="' + esc(FASCIA) + '" width="' + LARGHEZZA + '" alt="" '
            + 'style="display:block;width:100%;max-width:' + LARGHEZZA + 'px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;">'
            + '</td></tr>';

        /* Il pulsante finale sta al centro: e' l'unica cosa che si chiede al
           lettore, e al centro si vede da sola senza cercarla. Il centraggio si
           fa con align sul TD, non con margin:auto, che meta' dei programmi di
           posta ignora. */
        const ctaFinale = (nl.cta && nl.cta.url && nl.cta.testo)
            ? cella(tabellaInterna((chiudeInBlu ? spazio(4) : filetto(C.bordo, 1)) + spazio(28)
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

        const corpoInterno = testa + apertura + copertina + blocchi + ctaFinale + spazio(36) + piede;
        const html = involucro(nl.oggetto || nl.titolo || 'Newsletter', nl.preheader || nl.sommario || '', corpoInterno);

        /* --- versione in solo testo --- */
        const parti = [];
        if (nl.occhiello) parti.push(String(nl.occhiello).toUpperCase());
        if (nl.titolo) parti.push(nl.titolo);
        if (nl.sommario) parti.push(nl.sommario);
        const sezioniTesto = ORDINE_FASI.map(k => sezioneFaseTesto(k, nl[k])).filter(t => t && t.trim());
        if (sezioniTesto.length) sezioniTesto.forEach(t => parti.push(t.trim()));
        else (Array.isArray(nl.blocchi) ? nl.blocchi : []).forEach(b => { const t = bloccoTesto(b); if (t && t.trim()) parti.push(t.trim()); });
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
       MAIL DI CONFERMA ISCRIZIONE A UN EVENTO
       ---------------------------------------------------------
       La manda l'area riservata quando un'iscrizione viene registrata
       A MANO: chi si iscrive da un portale esterno (Eventbrite) riceve
       la conferma di quel portale, non la nostra. Questa mail e' il
       benvenuto di Next Generation Business, nello stesso formato
       della newsletter: stessa testata, stessa fascia, stesso piede.
       Due differenze volute:
         - niente collegamento di disiscrizione: e' una conferma di
           servizio verso chi si e' appena iscritto, non una
           comunicazione promozionale ricorrente;
         - il riepilogo dice DA DOVE risulta arrivata l'iscrizione
           (il portale), cosi' chi riceve capisce perche' gli
           scriviamo noi e non solo Eventbrite.
       `dati`: nome, cognome, evento {titolo, quando, luogo, indirizzo,
       url}, portale (etichetta leggibile), partecipanti (numero di
       persone coperte dall'iscrizione: sopra 1 la mail lo dice, a 1
       tace perche' e' il caso normale), dataIscrizione (facolt.).
       Restituisce { oggetto, html, testo }: l'HTML e' la mail INTERA,
       il servizio la spedisce cosi' com'e'.
    ========================================================= */
    const MOTIVO_CONFERMA = 'Ricevi questa email come conferma della tua iscrizione all\'evento: non è una comunicazione promozionale.';
    function confermaEvento(dati) {
        dati = dati || {};
        const ev = dati.evento || {};
        const nomeCompleto = ((dati.nome || '') + ' ' + (dati.cognome || '')).trim();
        const nPart = Math.floor(Number(dati.partecipanti)) || 0;
        const dove = [ev.luogo, ev.indirizzo].filter(Boolean).join(' - ');
        const quandoEv = [ev.titolo, ev.quando].filter(Boolean).join(', ');
        const oggetto = 'Iscrizione confermata - Next Generation Business' + (quandoEv ? ', ' + quandoEv : '');
        const urlEvento = ev.url ? urlSicuro(ev.url) : '';
        const anteprima = 'La tua iscrizione' + (quandoEv ? ' al convegno di ' + quandoEv : '') + ' è registrata: ecco il riepilogo.';

        /* Testata: identica a quella della newsletter (marchio bianco sul blu),
           con l'esito al posto del titolo editoriale. */
        const saluto = 'Gentile ' + (nomeCompleto || 'ospite') + ',';
        const sommario = 'la tua iscrizione' + (quandoEv ? ' al convegno Next Generation Business di ' + quandoEv : '') + ' è stata registrata.';
        const testa = '<tr><td bgcolor="' + C.scuro + '" class="px" style="background-color:' + C.scuro + ';padding:30px ' + LATO + 'px 30px;">'
            + tabellaInterna(
                '<tr><td><a href="' + esc(SITO) + '" style="text-decoration:none;">'
                + '<img src="' + esc(LOGO_BIANCO) + '" width="150" alt="Revilaw - Revisione legale" '
                + 'style="display:block;width:150px;max-width:150px;height:auto;border:0;outline:none;text-decoration:none;'
                + 'font-family:' + FONT + ';font-size:18px;line-height:24px;font-weight:bold;color:' + C.bianco + ';">'
                + '</a></td></tr>'
                + spazio(24)
                + '<tr><td style="' + FONTE + SCALA.occhiello + 'color:' + C.chiaroBlu + ';font-weight:bold;">Next Generation Business</td></tr>'
                + spazio(12)
                + '<tr><td class="h1" style="' + FONTE + SCALA.titolo + 'color:' + C.bianco + ';font-weight:bold;letter-spacing:-0.3px;">Iscrizione confermata</td></tr>'
                + spazio(16)
                + '<tr><td class="lead par" style="' + FONTE + SCALA.sommario + 'color:' + C.suScuro + ';text-align:justify;">' + testoHtml(saluto + ' ' + sommario) + '</td></tr>'
            )
            + '</td></tr>';
        const copertina = '<tr><td bgcolor="' + C.scuro + '" style="background-color:' + C.scuro + ';font-size:0;line-height:0;">'
            + '<img src="' + esc(FASCIA) + '" width="' + LARGHEZZA + '" alt="" '
            + 'style="display:block;width:100%;max-width:' + LARGHEZZA + 'px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;">'
            + '</td></tr>';

        /* Il riepilogo: etichetta e valore, una riga per dato. Solo le righe che
           hanno un valore: una cella vuota fa credere che manchi qualcosa. */
        const riga = (et, val) => val
            ? '<tr><td width="150" valign="top" style="' + FONTE + 'font-size:12px;line-height:24px;letter-spacing:1px;text-transform:uppercase;color:' + C.blu + ';font-weight:bold;padding:5px 12px 5px 0;">' + testoHtml(et) + '</td>'
            + '<td valign="top" style="' + FONTE + SCALA.corpo + 'color:' + C.testo + ';padding:5px 0;">' + testoHtml(val) + '</td></tr>'
            : '';
        const righe = riga('Evento', ev.titolo ? 'Next Generation Business - ' + ev.titolo : 'Next Generation Business')
            + riga('Data', ev.quando)
            + riga('Sede', dove)
            + riga('Iscritto', nomeCompleto)
            + riga('Partecipanti', nPart > 1 ? String(nPart) : '')
            + riga('Iscrizione da', dati.portale)
            + riga('Registrata il', dati.dataIscrizione);
        const box = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            + 'style="border-collapse:collapse;background-color:' + C.chiaro + ';border:1px solid ' + C.bordo + ';border-left:3px solid ' + C.accento + ';">'
            + '<tr><td style="padding:16px 22px;">' + tabellaInterna(righe) + '</td></tr></table>';

        const par = t => '<tr><td class="par" style="' + FONTE + SCALA.corpo + 'color:' + C.testo + ';text-align:justify;">' + testoHtml(t) + '</td></tr>';
        const posto = nPart > 1
            ? 'I tuoi ' + nPart + ' posti sono riservati.'
            : 'Il tuo posto è riservato.';
        const corpo = cella(tabellaInterna(
            spazio(30)
            + par(posto + ' Qui sotto trovi il riepilogo della tua iscrizione: se qualcosa non è corretto, rispondi a questa email e lo sistemiamo noi.')
            + spazio(22)
            + '<tr><td>' + box + '</td></tr>'
            + (urlEvento
                ? spazio(28)
                + '<tr><td align="center" style="text-align:center;">'
                + '<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin:0 auto;"><tr><td align="center">'
                + pulsante('Programma e dettagli dell\'evento', urlEvento, { colore: C.blu })
                + '</td></tr></table></td></tr>'
                : '')
            + spazio(28)
            + par('Ti aspettiamo' + (ev.titolo ? ' a ' + ev.titolo : '') + '.')
            /* Il collegamento personale per modificare o annullare: qui resta il
               segnaposto {{COMPLETA}}, che il servizio sostituisce con
               l'indirizzo firmato al momento dell'invio. */
            + spazio(24)
            + '<tr><td class="par" style="' + FONTE + 'font-size:13px;line-height:21px;color:' + C.tenue + ';text-align:justify;">Devi correggere qualcosa o annullare l\'iscrizione? '
            + '<a href="' + SEGNAPOSTO_COMPLETA + '" style="color:' + C.blu + ';text-decoration:underline;">Fallo dal tuo collegamento personale</a>, senza scriverci.</td></tr>'
        ));

        /* Piede: come la newsletter, ma SENZA "Annulla l'iscrizione": qui non
           c'e' una lista da cui uscire, c'e' una conferma di servizio. */
        const rigaPiede = (stile, dentro) => '<tr><td align="center" style="' + FONTE + SCALA.piede + stile + 'text-align:center;">' + dentro + '</td></tr>';
        const linkPiede = 'color:' + C.tenue + ';text-decoration:underline;';
        const piede = '<tr><td class="px" bgcolor="' + C.sfondo + '" align="center" style="background-color:' + C.sfondo + ';padding:24px ' + LATO + 'px 26px;border-top:1px solid ' + C.bordo + ';text-align:center;">'
            + tabellaInterna(
                rigaPiede('color:' + C.scuro + ';font-weight:bold;', esc(MITTENTE.nome))
                + rigaPiede('color:' + C.tenue + ';', esc(MITTENTE.indirizzo) + ' &middot; ' + esc(MITTENTE.cf))
                + spazio(10)
                + rigaPiede('color:' + C.tenue + ';',
                    '<a href="' + esc(PRIVACY) + '" style="' + linkPiede + '">Informativa privacy</a>'
                    + ' &nbsp;&middot;&nbsp; <a href="' + esc(SITO) + '" style="' + linkPiede + '">nextgenerationbusiness.it</a>')
                + spazio(8)
                + rigaPiede('color:#94A3B8;', esc(MOTIVO_CONFERMA) + ' &nbsp;&middot;&nbsp; &copy; ' + new Date().getFullYear())
            )
            + '</td></tr>';

        const html = involucro(oggetto, anteprima, testa + copertina + corpo + spazio(36) + piede);

        /* --- versione in solo testo --- */
        const parti = ['ISCRIZIONE CONFERMATA', saluto + ' ' + sommario];
        const rt = (et, val) => val ? et + ': ' + val : '';
        parti.push([
            rt('Evento', ev.titolo ? 'Next Generation Business - ' + ev.titolo : 'Next Generation Business'),
            rt('Data', ev.quando), rt('Sede', dove), rt('Iscritto', nomeCompleto),
            rt('Partecipanti', nPart > 1 ? String(nPart) : ''),
            rt('Iscrizione da', dati.portale), rt('Registrata il', dati.dataIscrizione)
        ].filter(Boolean).join('\n'));
        parti.push(posto + ' Se qualcosa non è corretto, rispondi a questa email e lo sistemiamo noi.');
        if (urlEvento) parti.push('Programma e dettagli dell\'evento: ' + urlEvento);
        parti.push('Modifica o annulla l\'iscrizione: ' + SEGNAPOSTO_COMPLETA);
        parti.push('--');
        parti.push(MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf);
        parti.push(MOTIVO_CONFERMA);
        parti.push('Informativa privacy: ' + PRIVACY);

        return { oggetto: oggetto, html: html, testo: parti.join('\n\n') };
    }

    /* =========================================================
       MAIL "COMPLETA I DATI DEI PARTECIPANTI"
       ---------------------------------------------------------
       Per le iscrizioni inserite a mano che non hanno tutti i dati,
       o che coprono piu' posti con i soli dati dell'intestatario.
       Stesso formato NGB della conferma; il pulsante porta a una
       pagina del sito con un modulo per ciascun partecipante.
       Il collegamento e' PERSONALE e firmato: qui resta il segnaposto
       {{COMPLETA}}, che il servizio sostituisce al momento dell'invio
       (come per la disiscrizione della newsletter). L'anteprima
       nell'area riservata lo sostituisce con l'indirizzo della pagina,
       senza firma. `dati`: nome, cognome, evento {titolo, quando,
       luogo, indirizzo}, portale, partecipanti.
    ========================================================= */
    const SEGNAPOSTO_COMPLETA = '{{COMPLETA}}';
    const MOTIVO_RICHIESTA = 'Ricevi questa email per completare i dati della tua iscrizione all\'evento: non è una comunicazione promozionale.';
    function richiestaDati(dati) {
        dati = dati || {};
        const ev = dati.evento || {};
        const nomeCompleto = ((dati.nome || '') + ' ' + (dati.cognome || '')).trim();
        const nPart = Math.floor(Number(dati.partecipanti)) || 1;
        const dove = [ev.luogo, ev.indirizzo].filter(Boolean).join(' - ');
        const quandoEv = [ev.titolo, ev.quando].filter(Boolean).join(', ');
        const oggetto = 'Completa la tua iscrizione - Next Generation Business' + (quandoEv ? ', ' + quandoEv : '');
        const anteprima = nPart > 1
            ? 'Ci servono i dati dei ' + nPart + ' partecipanti: bastano due minuti.'
            : 'Ci servono ancora alcuni dati della tua iscrizione: bastano due minuti.';

        const saluto = 'Gentile ' + (nomeCompleto || 'ospite') + ',';
        const sommario = 'la tua iscrizione' + (quandoEv ? ' al convegno Next Generation Business di ' + quandoEv : '')
            + (nPart > 1 ? ' copre ' + nPart + ' posti' : ' è registrata')
            + ': per accoglierti al meglio ci servono ancora alcuni dati.';
        const testa = '<tr><td bgcolor="' + C.scuro + '" class="px" style="background-color:' + C.scuro + ';padding:30px ' + LATO + 'px 30px;">'
            + tabellaInterna(
                '<tr><td><a href="' + esc(SITO) + '" style="text-decoration:none;">'
                + '<img src="' + esc(LOGO_BIANCO) + '" width="150" alt="Revilaw - Revisione legale" '
                + 'style="display:block;width:150px;max-width:150px;height:auto;border:0;outline:none;text-decoration:none;'
                + 'font-family:' + FONT + ';font-size:18px;line-height:24px;font-weight:bold;color:' + C.bianco + ';">'
                + '</a></td></tr>'
                + spazio(24)
                + '<tr><td style="' + FONTE + SCALA.occhiello + 'color:' + C.chiaroBlu + ';font-weight:bold;">Next Generation Business</td></tr>'
                + spazio(12)
                + '<tr><td class="h1" style="' + FONTE + SCALA.titolo + 'color:' + C.bianco + ';font-weight:bold;letter-spacing:-0.3px;">Completa la tua iscrizione</td></tr>'
                + spazio(16)
                + '<tr><td class="lead par" style="' + FONTE + SCALA.sommario + 'color:' + C.suScuro + ';text-align:justify;">' + testoHtml(saluto + ' ' + sommario) + '</td></tr>'
            )
            + '</td></tr>';
        const copertina = '<tr><td bgcolor="' + C.scuro + '" style="background-color:' + C.scuro + ';font-size:0;line-height:0;">'
            + '<img src="' + esc(FASCIA) + '" width="' + LARGHEZZA + '" alt="" '
            + 'style="display:block;width:100%;max-width:' + LARGHEZZA + 'px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;">'
            + '</td></tr>';

        const riga = (et, val) => val
            ? '<tr><td width="150" valign="top" style="' + FONTE + 'font-size:12px;line-height:24px;letter-spacing:1px;text-transform:uppercase;color:' + C.blu + ';font-weight:bold;padding:5px 12px 5px 0;">' + testoHtml(et) + '</td>'
            + '<td valign="top" style="' + FONTE + SCALA.corpo + 'color:' + C.testo + ';padding:5px 0;">' + testoHtml(val) + '</td></tr>'
            : '';
        const box = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            + 'style="border-collapse:collapse;background-color:' + C.chiaro + ';border:1px solid ' + C.bordo + ';border-left:3px solid ' + C.accento + ';">'
            + '<tr><td style="padding:16px 22px;">' + tabellaInterna(
                riga('Evento', ev.titolo ? 'Next Generation Business - ' + ev.titolo : 'Next Generation Business')
                + riga('Data', ev.quando)
                + riga('Sede', dove)
                + riga('Posti riservati', String(nPart))
                + riga('Iscrizione da', dati.portale)
            ) + '</td></tr></table>';

        /* Il pulsante non passa da pulsante(): li' l'indirizzo viene ripulito, e
           il segnaposto (che un indirizzo non e') sparirebbe. Stessa struttura
           a prova di Outlook, con il segnaposto scritto tale e quale. */
        const bottone = '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">'
            + '<tr><td align="center" bgcolor="' + C.blu + '" style="background-color:' + C.blu + ';">'
            + '<!--[if mso]>'
            + '<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="' + SEGNAPOSTO_COMPLETA + '" '
            + 'style="height:46px;v-text-anchor:middle;width:260px;" arcsize="0%" stroke="f" fillcolor="' + C.blu + '">'
            + '<w:anchorlock/><center style="color:#ffffff;font-family:' + FONT + ';font-size:16px;font-weight:bold;letter-spacing:0.3px;">Completa i dati</center>'
            + '</v:roundrect>'
            + '<![endif]-->'
            + '<!--[if !mso]><!-- -->'
            + '<a href="' + SEGNAPOSTO_COMPLETA + '" class="btnlink" style="display:inline-block;padding:14px 30px;font-family:' + FONT
            + ';font-size:16px;font-weight:bold;letter-spacing:0.3px;color:#ffffff;text-decoration:none;background-color:' + C.blu + ';mso-hide:all;">Completa i dati</a>'
            + '<!--<![endif]-->'
            + '</td></tr></table>';

        const par = t => '<tr><td class="par" style="' + FONTE + SCALA.corpo + 'color:' + C.testo + ';text-align:justify;">' + testoHtml(t) + '</td></tr>';
        const spiegazione = nPart > 1
            ? 'Al momento abbiamo i dati del solo intestatario. Dal pulsante qui sotto puoi indicare nome, cognome, email e azienda di ciascuno dei ' + nPart + ' partecipanti, e correggere i tuoi se serve: così prepariamo i badge e l\'accoglienza per tutti. Dallo stesso modulo puoi anche annullare il posto di chi non potrà esserci.'
            : 'Dal pulsante qui sotto puoi completare o correggere i dati della tua iscrizione (azienda, ruolo, telefono): così prepariamo il badge e l\'accoglienza. Dallo stesso modulo puoi anche annullare l\'iscrizione, se non potrai esserci.';
        const corpo = cella(tabellaInterna(
            spazio(30)
            + par(spiegazione)
            + spazio(22)
            + '<tr><td>' + box + '</td></tr>'
            + spazio(28)
            + '<tr><td align="center" style="text-align:center;">'
            + '<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin:0 auto;"><tr><td align="center">'
            + bottone
            + '</td></tr></table></td></tr>'
            + spazio(24)
            + '<tr><td class="par" style="' + FONTE + 'font-size:13px;line-height:21px;color:' + C.tenue + ';text-align:justify;">Il collegamento è personale e vale solo per questa iscrizione: ti chiediamo di non inoltrarlo. Se qualcosa non torna, rispondi a questa email.</td></tr>'
        ));

        const rigaPiede = (stile, dentro) => '<tr><td align="center" style="' + FONTE + SCALA.piede + stile + 'text-align:center;">' + dentro + '</td></tr>';
        const linkPiede = 'color:' + C.tenue + ';text-decoration:underline;';
        const piede = '<tr><td class="px" bgcolor="' + C.sfondo + '" align="center" style="background-color:' + C.sfondo + ';padding:24px ' + LATO + 'px 26px;border-top:1px solid ' + C.bordo + ';text-align:center;">'
            + tabellaInterna(
                rigaPiede('color:' + C.scuro + ';font-weight:bold;', esc(MITTENTE.nome))
                + rigaPiede('color:' + C.tenue + ';', esc(MITTENTE.indirizzo) + ' &middot; ' + esc(MITTENTE.cf))
                + spazio(10)
                + rigaPiede('color:' + C.tenue + ';',
                    '<a href="' + esc(PRIVACY) + '" style="' + linkPiede + '">Informativa privacy</a>'
                    + ' &nbsp;&middot;&nbsp; <a href="' + esc(SITO) + '" style="' + linkPiede + '">nextgenerationbusiness.it</a>')
                + spazio(8)
                + rigaPiede('color:#94A3B8;', esc(MOTIVO_RICHIESTA) + ' &nbsp;&middot;&nbsp; &copy; ' + new Date().getFullYear())
            )
            + '</td></tr>';

        const html = involucro(oggetto, anteprima, testa + copertina + corpo + spazio(36) + piede);

        const rt = (et, val) => val ? et + ': ' + val : '';
        const parti = ['COMPLETA LA TUA ISCRIZIONE', saluto + ' ' + sommario, spiegazione];
        parti.push([
            rt('Evento', ev.titolo ? 'Next Generation Business - ' + ev.titolo : 'Next Generation Business'),
            rt('Data', ev.quando), rt('Sede', dove),
            rt('Posti riservati', String(nPart)), rt('Iscrizione da', dati.portale)
        ].filter(Boolean).join('\n'));
        parti.push('Completa i dati: ' + SEGNAPOSTO_COMPLETA);
        parti.push('Il collegamento è personale e vale solo per questa iscrizione: ti chiediamo di non inoltrarlo.');
        parti.push('--');
        parti.push(MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf);
        parti.push(MOTIVO_RICHIESTA);
        parti.push('Informativa privacy: ' + PRIVACY);

        return { oggetto: oggetto, html: html, testo: parti.join('\n\n') };
    }

    /* =========================================================
       MAIL DI INVITO AGLI INCONTRI B2B
       ---------------------------------------------------------
       L'invito che parte a TUTTI i referenti delle aziende scelte:
       spiega l'occasione, elenca gli incontri (uno per argomento del
       convegno) e porta alla pagina dove ognuno PRENOTA i suoi - e
       vede quelli gia' scelti dai colleghi della sua impresa. Le
       scelte tornano nell'elenco e nel riepilogo per argomento
       dell'area riservata.
       Due segnaposti, sostituiti dal servizio PER DESTINATARIO:
         {{NOME}} - nome e cognome dell'iscritto;
         {{B2B}}  - il suo collegamento personale firmato al modulo.
       Il tono e' formale (Lei): e' un invito personale, non una
       circolare. `dati.evento`: titolo, quando, sottotitolo.
       `dati.orario` (facoltativo) e' la finestra in cui si svolgono gli
       incontri ("dalle 14:30 alle 18:00"): quando c'e', la mail lo dice
       in un riquadro in evidenza e nel testo, cosi' chi legge sa gia'
       quando presentarsi invece di aspettare una seconda mail.
    ========================================================= */
    const SEGNAPOSTO_B2B = '{{B2B}}';
    const SEGNAPOSTO_NOME = '{{NOME}}';
    /* I temi proposti: la DESCRIZIONE lunga va nella mail e nel modulo,
       l'etichetta corta e' quella che finisce in tabella (le stesse voci
       del modulo di iscrizione di Napoli, dove esistono gia'). */
    const TEMI_B2B = [
        { nome: 'Merito creditizio', descrizione: 'miglioramento del merito creditizio e accesso ai finanziamenti' },
        { nome: 'Governance e controllo di gestione', descrizione: 'controllo di gestione e pianificazione finanziaria' },
        { nome: 'Adeguati assetti', descrizione: 'adeguati assetti organizzativi, amministrativi e contabili' },
        { nome: 'ESG e sostenibilita', descrizione: 'sostenibilità ed ESG' },
        { nome: 'Modello 231 e Rating di Legalita', descrizione: 'Modello 231 e rating di legalità' },
        { nome: 'Finanza agevolata', descrizione: 'finanza agevolata e sostegno agli investimenti' },
        { nome: 'Tax Control Framework', descrizione: 'Tax Control Framework' },
        { nome: "Bagnoli e America's Cup 2027", descrizione: 'opportunità connesse allo sviluppo di Bagnoli e all\'America\'s Cup' },
        { nome: 'Altre esigenze', descrizione: 'altre esigenze specifiche della Sua impresa' }
    ];
    function invitoB2B(dati) {
        dati = dati || {};
        const ev = dati.evento || {};
        const orario = String(dati.orario == null ? '' : dati.orario).trim();
        const quandoEv = [ev.titolo, ev.quando].filter(Boolean).join(', ');
        const nomeConvegno = 'Next Generation Business' + (ev.sottotitolo ? ' - ' + ev.sottotitolo : '');
        const oggetto = 'Il Suo incontro B2B al convegno - Next Generation Business' + (quandoEv ? ', ' + quandoEv : '');
        const anteprima = 'Scelga a quali tavoli sedersi: un incontro riservato con i nostri specialisti.';

        const sommario = 'Gentile ' + SEGNAPOSTO_NOME + ', La ringraziamo per essersi iscritto al convegno "' + nomeConvegno + '"'
            + (quandoEv ? ' di ' + quandoEv : '') + ': nel corso della giornata potrà partecipare a un incontro B2B riservato.';
        const testa = '<tr><td bgcolor="' + C.scuro + '" class="px" style="background-color:' + C.scuro + ';padding:30px ' + LATO + 'px 30px;">'
            + tabellaInterna(
                '<tr><td><a href="' + esc(SITO) + '" style="text-decoration:none;">'
                + '<img src="' + esc(LOGO_BIANCO) + '" width="150" alt="Revilaw - Revisione legale" '
                + 'style="display:block;width:150px;max-width:150px;height:auto;border:0;outline:none;text-decoration:none;'
                + 'font-family:' + FONT + ';font-size:18px;line-height:24px;font-weight:bold;color:' + C.bianco + ';">'
                + '</a></td></tr>'
                + spazio(24)
                + '<tr><td style="' + FONTE + SCALA.occhiello + 'color:' + C.chiaroBlu + ';font-weight:bold;">Next Generation Business</td></tr>'
                + spazio(12)
                + '<tr><td class="h1" style="' + FONTE + SCALA.titolo + 'color:' + C.bianco + ';font-weight:bold;letter-spacing:-0.3px;">Un incontro riservato per la Sua impresa</td></tr>'
                + spazio(16)
                + '<tr><td class="lead par" style="' + FONTE + SCALA.sommario + 'color:' + C.suScuro + ';text-align:justify;">' + testoHtml(sommario) + '</td></tr>'
            )
            + '</td></tr>';
        const copertina = '<tr><td bgcolor="' + C.scuro + '" style="background-color:' + C.scuro + ';font-size:0;line-height:0;">'
            + '<img src="' + esc(FASCIA) + '" width="' + LARGHEZZA + '" alt="" '
            + 'style="display:block;width:100%;max-width:' + LARGHEZZA + 'px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;">'
            + '</td></tr>';

        const par = t => '<tr><td class="par" style="' + FONTE + SCALA.corpo + 'color:' + C.testo + ';text-align:justify;">' + testoHtml(t) + '</td></tr>';
        // l'elenco dei temi, con il quadratino blu del formato newsletter
        const voceTema = t => '<tr><td width="18" valign="top" style="' + FONTE + 'font-size:16px;line-height:27px;">'
            + '<span style="display:inline-block;width:8px;height:8px;background-color:' + C.accento + ';"></span></td>'
            + '<td style="' + FONTE + SCALA.corpo + 'color:' + C.testo + ';padding-bottom:7px;">' + testoHtml(t.descrizione) + '</td></tr>';
        const elencoTemi = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">'
            + TEMI_B2B.map(voceTema).join('') + '</table>';

        const bottone = '<tr><td align="center" style="text-align:center;">'
            + '<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin:0 auto;"><tr>'
            + '<td align="center" bgcolor="' + C.blu + '" style="background-color:' + C.blu + ';">'
            + '<a href="' + SEGNAPOSTO_B2B + '" class="btnlink" style="display:inline-block;padding:14px 30px;font-family:' + FONT
            + ';font-size:16px;font-weight:bold;letter-spacing:0.3px;color:#ffffff;text-decoration:none;background-color:' + C.blu + ';">Scelga i Suoi incontri B2B</a>'
            + '</td></tr></table></td></tr>';

        /* La chiusura cambia con l'orario: senza, si promette di comunicarlo;
           con, resta da confermare solo il turno preciso dentro la fascia. */
        const chiusura = (orario
            ? 'Gli incontri si terranno ' + orario + ': sarà nostra cura ricontattarLa per confermare il turno preciso e gli specialisti che saranno a Sua disposizione.'
            : 'Sarà nostra cura ricontattarLa per confermare l\'orario dell\'incontro e gli specialisti che saranno a Sua disposizione.')
            + ' Nell\'attesa di incontrarLa' + (ev.titolo ? ' a ' + ev.titolo : '') + ', Le porgiamo i nostri più cordiali saluti.';

        /* Quando gli incontri si svolgono: sta in evidenza subito dopo
           l'annuncio dell'incontro, perche' e' la prima cosa che chi legge
           vuole sapere (e quella che, senza, costringe a chiedere). Compare
           solo se l'orario e' stato indicato al momento dell'invio. */
        const riquadroOrario = '<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            + 'style="border-collapse:collapse;background-color:' + C.chiaro + ';border:1px solid ' + C.bordo + ';border-left:3px solid ' + C.blu + ';">'
            + '<tr><td style="padding:14px 20px;">'
            + '<span style="' + FONTE + 'font-size:12px;line-height:20px;letter-spacing:1px;text-transform:uppercase;color:' + C.blu + ';font-weight:bold;">Quando si svolgono gli incontri B2B</span><br>'
            + '<span style="' + FONTE + SCALA.corpo + 'color:' + C.scuro + ';font-weight:bold;">'
            + (ev.quando ? esc(ev.quando) + ', ' : '') + esc(orario) + '</span>'
            + (ev.luogo ? '<br><span style="' + FONTE + 'font-size:13px;line-height:21px;color:' + C.tenue + ';">' + esc(ev.luogo) + (ev.indirizzo ? ' - ' + esc(ev.indirizzo) : '') + '</span>' : '')
            + '</td></tr></table></td></tr>';

        const corpo = cella(tabellaInterna(
            spazio(30)
            + par('L\'iniziativa è stata pensata non soltanto come un momento di approfondimento, ma anche come un\'occasione concreta di confronto sulle esigenze e sui programmi di sviluppo delle imprese partecipanti.')
            + spazio(14)
            + par('Per questo desideriamo offrirLe la possibilità di partecipare, nel corso della giornata, a un incontro B2B riservato con professionisti e specialisti delle materie trattate durante il convegno.')
            + (orario ? spazio(18) + riquadroOrario : '')
            + spazio(14)
            + par('Ogni incontro è dedicato a un argomento del convegno, con i professionisti e gli specialisti della materia. La invitiamo a scegliere a quale, o a quali, desidera partecipare:')
            + spazio(16)
            + '<tr><td style="padding-left:6px;">' + elencoTemi + '</td></tr>'
            /* Chi ha GIA' espresso preferenze (dal form del sito o da un invio
               precedente) se le ritrova scritte qui: il tratto fra {{SE_TEMI}} e
               {{/SE_TEMI}} resta solo per loro, con l'elenco al posto di {{TEMI}}.
               La sostituzione la fa il servizio, destinatario per destinatario. */
            + '{{SE_TEMI}}'
            + spazio(18)
            + '<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            + 'style="border-collapse:collapse;background-color:' + C.chiaro + ';border:1px solid ' + C.bordo + ';border-left:3px solid ' + C.accento + ';">'
            + '<tr><td style="padding:14px 20px;">'
            + '<span style="' + FONTE + 'font-size:12px;line-height:20px;letter-spacing:1px;text-transform:uppercase;color:' + C.blu + ';font-weight:bold;">La Sua scelta attuale</span><br>'
            + '<span style="' + FONTE + SCALA.corpo + 'color:' + C.scuro + ';font-weight:bold;">{{TEMI}}</span><br>'
            + '<span style="' + FONTE + 'font-size:13px;line-height:21px;color:' + C.tenue + ';">Dalla pagina può confermarla, aggiungere un incontro o toglierne uno quando vuole.</span>'
            + '</td></tr></table></td></tr>'
            + '{{/SE_TEMI}}'
            + spazio(18)
            + par('Basta un minuto: dal pulsante qui sotto trova la pagina con gli incontri da spuntare, dove può anche anticiparci brevemente il progetto o l\'esigenza aziendale su cui vorrebbe confrontarsi. Nella stessa pagina vede le scelte degli altri referenti della Sua azienda, così potete dividervi i tavoli invece di sovrapporvi.')
            + spazio(26)
            + bottone
            + spazio(26)
            + par(chiusura)
            + spazio(24)
            + '<tr><td class="par" style="' + FONTE + 'font-size:13px;line-height:21px;color:' + C.tenue + ';text-align:justify;">Il collegamento è personale e vale solo per la Sua iscrizione: Le chiediamo di non inoltrarlo.</td></tr>'
        ));

        const rigaPiede = (stile, dentro) => '<tr><td align="center" style="' + FONTE + SCALA.piede + stile + 'text-align:center;">' + dentro + '</td></tr>';
        const linkPiede = 'color:' + C.tenue + ';text-decoration:underline;';
        const piede = '<tr><td class="px" bgcolor="' + C.sfondo + '" align="center" style="background-color:' + C.sfondo + ';padding:24px ' + LATO + 'px 26px;border-top:1px solid ' + C.bordo + ';text-align:center;">'
            + tabellaInterna(
                rigaPiede('color:' + C.scuro + ';font-weight:bold;', esc(MITTENTE.nome))
                + rigaPiede('color:' + C.tenue + ';', esc(MITTENTE.indirizzo) + ' &middot; ' + esc(MITTENTE.cf))
                + spazio(10)
                + rigaPiede('color:' + C.tenue + ';',
                    '<a href="' + esc(PRIVACY) + '" style="' + linkPiede + '">Informativa privacy</a>'
                    + ' &nbsp;&middot;&nbsp; <a href="' + esc(SITO) + '" style="' + linkPiede + '">nextgenerationbusiness.it</a>')
                + spazio(8)
                + rigaPiede('color:#94A3B8;', esc(MOTIVO_CONFERMA) + ' &nbsp;&middot;&nbsp; &copy; ' + new Date().getFullYear())
            )
            + '</td></tr>';

        const html = involucro(oggetto, anteprima, testa + copertina + corpo + spazio(36) + piede);

        const testo = ['UN INCONTRO RISERVATO PER LA SUA IMPRESA', sommario,
            'L\'iniziativa è stata pensata non soltanto come un momento di approfondimento, ma anche come un\'occasione concreta di confronto sulle esigenze e sui programmi di sviluppo delle imprese partecipanti. Per questo desideriamo offrirLe la possibilità di partecipare, nel corso della giornata, a un incontro B2B riservato con professionisti e specialisti delle materie trattate durante il convegno.',
            (orario ? 'Quando si svolgono gli incontri B2B: ' + (ev.quando ? ev.quando + ', ' : '') + orario
                + (ev.luogo ? ' - ' + ev.luogo + (ev.indirizzo ? ', ' + ev.indirizzo : '') : '') : ''),
            'Gli incontri in programma, uno per argomento del convegno:\n' + TEMI_B2B.map(t => '- ' + t.descrizione).join('\n'),
            '{{SE_TEMI}}La Sua scelta attuale: {{TEMI}}. Dalla pagina può confermarla, aggiungere un incontro o toglierne uno quando vuole.{{/SE_TEMI}}',
            'Scelga i Suoi incontri B2B (e, se vuole, ci racconti il progetto su cui confrontarsi): ' + SEGNAPOSTO_B2B
                + '\nNella stessa pagina vede le scelte degli altri referenti della Sua azienda.',
            chiusura,
            'Il collegamento è personale e vale solo per la Sua iscrizione: Le chiediamo di non inoltrarlo.',
            '--', MITTENTE.nome + ' - ' + MITTENTE.indirizzo + ' - ' + MITTENTE.cf, MOTIVO_CONFERMA,
            'Informativa privacy: ' + PRIVACY].filter(Boolean).join('\n\n');

        return { oggetto: oggetto, html: html, testo: testo };
    }
    /* Applica (o toglie) il tratto "preferenze gia' indicate" dell'invito B2B:
       il testo fra {{SE_TEMI}} e {{/SE_TEMI}} resta solo se `temi` c'e', con
       {{TEMI}} sostituito. Il servizio lo fa per destinatario; l'anteprima
       nell'area riservata usa la stessa funzione. */
    function conTemiB2B(s, temi) {
        s = String(s == null ? '' : s);
        const i = s.indexOf('{{SE_TEMI}}');
        if (i < 0) return s;
        const j = s.indexOf('{{/SE_TEMI}}');
        if (j < 0) return s;
        const pre = s.slice(0, i);
        const dentro = s.slice(i + '{{SE_TEMI}}'.length, j);
        const dopo = s.slice(j + '{{/SE_TEMI}}'.length);
        return temi ? pre + dentro.split('{{TEMI}}').join(temi) + dopo : pre + dopo;
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

        /* Le sezioni della pagina si distribuiscono sui tre momenti: la prima
           dice perche' la cosa esiste, quelle di mezzo come funziona, l'ultima
           che cosa fare. E' una prima stesura da correggere, non un risultato:
           una pagina web non e' scritta in quest'ordine, e chi rivede la bozza
           dovra' quasi sempre riscrivere il "perche'", che e' la parte che una
           pagina istituzionale di solito non ha. */
        const unisci = (elenco) => ({
            titolo: elenco.length === 1 ? elenco[0].titolo : '',
            html: elenco.map(b => (elenco.length > 1 && b.titolo ? '<p><strong>' + esc(b.titolo) + '</strong></p>' : '') + b.html).join('')
        });
        const vuota = { titolo: '', testo: '' };
        let perche = vuota, come = vuota, cosa = vuota;
        if (blocchi.length === 1) { come = unisci(blocchi); }
        else if (blocchi.length === 2) { perche = unisci([blocchi[0]]); come = unisci([blocchi[1]]); }
        else if (blocchi.length >= 3) {
            perche = unisci([blocchi[0]]);
            come = unisci(blocchi.slice(1, blocchi.length - 1));
            cosa = unisci([blocchi[blocchi.length - 1]]);
        }

        return {
            titolo: titolo,
            occhiello: testoDi(badge),
            sommario: testoDi(sub) || ogDesc,
            oggetto: titolo || pulisciTesto((ogTitolo || '').split('|')[0]),
            preheader: ogDesc,
            perche: perche, come: come, cosa: cosa,
            cta: { testo: 'Leggi l\'approfondimento', url: String(url || '') }
        };
    }

    return {
        COLORI: C, LARGHEZZA: LARGHEZZA, TIPI_BLOCCO: TIPI_BLOCCO, FASI: FASI, ORDINE_FASI: ORDINE_FASI,
        SEGNAPOSTO_DISISCRIVI: SEGNAPOSTO_DISISCRIVI, SEGNAPOSTO_WEB: SEGNAPOSTO_WEB, SEGNAPOSTO_COMPLETA: SEGNAPOSTO_COMPLETA,
        SEGNAPOSTO_B2B: SEGNAPOSTO_B2B, SEGNAPOSTO_NOME: SEGNAPOSTO_NOME, TEMI_B2B: TEMI_B2B,
        costruisci: costruisci, confermaEvento: confermaEvento, richiestaDati: richiestaDati, invitoB2B: invitoB2B, conTemiB2B: conTemiB2B, estraiDaPagina: estraiDaPagina,
        ripulisci: ripulisci, stilizza: stilizza, testoDaHtml: testoDaHtml, formatta: formatta, sformatta: sformatta,
        urlSicuro: urlSicuro, esc: esc, pulsante: pulsante
    };
});
