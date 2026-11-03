/* ============================================================
   PROVE - gli accessi alla diretta dal sito (Playwright)
   ------------------------------------------------------------
       node sito.prova.js

   Avvia da solo il sito in locale (server-locale.js, porte 3690 per
   le funzioni e 8690 per il sito statico) se non e' gia' acceso, e
   lo spegne alla fine. Non servono gli emulatori: lo stato della
   diretta (api/diretta-stato) lo inventa la prova, con
   rete-prove.js/statoDiretta, e ogni richiesta viene contata.
   Date e ore si spostano con page.clock.

   L'evento in diretta e' il webinar del 10 dicembre 2026, dalle 15.00
   alle 17.00 (ora solare: +01:00), configurato in assets/diretta-stato.js:
   la finestra sul sito si apre 7 giorni prima, il 3 dicembre alle 15.00;
   lo stato si legge dalle 12.00 alle 20.00 del 10 dicembre.
   Il webinar e' SU INVITO (EVENTO.riservato: true): la sua pagina si
   raggiunge solo dal collegamento mandato per email e il sito non la
   annuncia da nessuna parte. In home niente popup ne' pillola, a nessuna
   ora; la pagina del webinar, per chi la apre, ha voce di menu, pillola e
   fascia «Segui il webinar in diretta» come prima.

   COSA DIMOSTRANO.
   0. I file: l'ordine degli script della home, le novita' nel riquadro
      «Sotto la lente» (nessuna finestra all'entrata), i testi della
      diretta senza trattini lunghi ne' "nome utente"; e l'invito:
      riservato: true in EVENTO (letto da diretta-stato.js, diretta-popup.js
      ed event-banner.js), nessuna scheda ne' collegamento al webinar nella
      home, in event-banner.js, nella sitemap, nel percorso di Milano e
      nella tendina dei contatti, Disallow in robots.txt e un solo meta
      robots nella pagina (noindex, nofollow), iscrizione vuoto in
      diretta/config.js.
   1. NGBDiretta (assets/diretta-stato.js): fasi e finestre dell'evento
      nei minuti di confine, giorno di Roma calcolato con Intl anche
      per chi visita da un altro fuso (d'inverno e con l'ora legale),
      condizione() per ogni stato (compresi 'pausa', lo sforamento oltre
      la fine e il 'terminato' letto prima dell'inizio), orario leggibile,
      una sola richiesta in volo, cache di 60 secondi, lettura fallita =
      null, lettura chiusa dopo 'terminato'. Niente di questo cambia con
      l'evento su invito: la pagina del webinar ne ha bisogno.
   2. Home: l'evento su invito non si annuncia. diretta-stato.js (con
      data-pillola) e diretta-popup.js sono caricati come prima, ma con
      EVENTO.riservato non costruiscono niente, e la home non ha agganci:
      non chiede mai lo stato.
      - 20 novembre (fuori finestra), 5 dicembre (nella finestra) e 10
        dicembre alle 8, alle 13, alle 15.30 in onda, alle 16 in pausa,
        alle 17.15 sforando, alle 18.30 e alle 21: nessun popup (#dirPromo,
        e nemmeno quelli di una volta), nessuna pillola (#dirPillola),
        nemmeno i loro fogli di stile, niente window.__dirPromoPlanned ne'
        dirPromoSeen, <html> senza data-diretta, la parola "webinar" e il
        collegamento alla sua pagina assenti; nessuna richiesta allo stato,
        nemmeno dopo due minuti il giorno dell'evento con il servizio che
        direbbe "in onda" (NGBDiretta sa la fase, ma la condizione viene dal
        solo orologio); la finestra del prossimo evento (Milano,
        assets/event-banner.js) si apre come sempre, unico dialogo della
        pagina, anche nella settimana del webinar;
      - 5 dicembre da vicino: il blocco dormiente (i tre file caricati,
        data-pillola ancora sul tag, NGBDiretta.EVENTO.riservato true,
        fase() e condizione() "prima", niente in cache, popup e pillola
        assenti dal DOM); la finestra di Milano (dialogo modale con il
        fuoco, titolo, «Scopri l'evento» verso /milano_febbraio_2027/,
        nessun banner d'angolo) chiusa con ESC si segna come vista e non
        torna ricaricando, torna in una nuova scheda (nuova sessione) e la
        X la chiude; le novita' restano nel riquadro «Sotto la lente»;
      - la finestra della diretta che si apre a pagina aperta (3 dicembre,
        14.58 -> 15.01): la fase passa a 'prima' ma in home non cambia
        niente, nemmeno ricaricando o in una nuova sessione;
      - telefono (5 dicembre e 10 dicembre in onda): niente della diretta,
        la finestra di Milano sta nello schermo, niente scorrimento
        orizzontale, la X la chiude;
      - nessun errore JavaScript, in ogni scenario.
   3. Pagina del webinar (/webinar_dicembre_2026/, costruita sulla pagina
      di Milano): voce "Diretta" per ultima nel menu, dopo "Iscrizioni"
      (anche su telefono, a menu aperto), pillola "Diretta" accanto
      all'hamburger fuori dal menu a scomparsa (fino a 960px: tablet e
      telefono, anche a 320px), sezione "Segui il webinar in diretta" dopo
      la hero con il pulsante verso /diretta/ e il testo sull'accesso (la
      propria email e la password ricevuta via email, Spam o Promozioni;
      nessun nome utente, nessuna data d'invio promessa; la frase dello
      spam anche nella conferma dell'iscrizione, il cui modulo oggi e'
      nascosto: <body data-iscrizioni="chiuse">); prima della finestra
      (20 novembre) sezione, voce e pillola restano nascoste anche con la
      diretta accesa sul sito, e compaiono da sole quando la finestra si
      apre a pagina aperta; l'indicatore IN DIRETTA solo in onda, "in
      pausa" in pausa, con ricontrollo ogni 60 s (una richiesta per
      pagina, non una per indicatore); dopo la fine "Il webinar si è
      concluso" e voce di menu e pillola nascoste, anche se si sfora e poi
      si termina; menu su una riga senza sovrapporsi al marchio da 961px
      in su, con o senza la voce Diretta; fino a 960px menu a tendina con
      la pillola nella barra.
      La pagina di Napoli, conclusa a mano (<html data-diretta="conclusa">,
      senza diretta-stato.js): nessuna sezione, voce di menu o pillola e
      nessuna richiesta, nemmeno con il webinar in onda; window.NGBDiretta
      non esiste.
   4. La diretta nascosta sul sito (PUBBLICA = false): nella pagina del
      webinar niente voce di menu e sezione, nessuna richiesta nemmeno il
      giorno dell'evento in onda; ?diretta=prova la mostra solo a quel
      browser e ?diretta=pubblico la toglie; con PUBBLICA = true tutto
      compare. In home niente in ogni modo (nascosta, prova, pubblica):
      l'evento e' su invito. E la controprova: diretta-stato.js servito con
      riservato: false fa tornare popup e pillola in home, con la finestra
      di Milano che cede loro la precedenza; i controlli "niente in home"
      non sono vuoti.
   Screenshot in risultati/screenshot-sito/.
   Esce con 1 se qualcosa e' rosso.

   Rete: i video delle pagine (mp4 dalle release di GitHub, decine di
   MB) non passano da rete-prove.js, che li consegnerebbe al browser in
   un colpo solo facendolo cadere; il banner dei cookie (iubenda) e
   Google Analytics sono spenti: non c'entrano con queste prove e il
   banner coprirebbe i clic e i tocchi sulla finestra di Milano.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { chromium, devices } = require('playwright');
const { preparaContesto } = require('./rete-prove');

const PORTA_API = Number(process.env.PORTA_API || 3690);
const PORTA_STATICO = Number(process.env.PORTA_STATICO || 8690);
const SITO = 'http://127.0.0.1:' + PORTA_STATICO;
const HOME = SITO + '/';
const WEBINAR = SITO + '/webinar_dicembre_2026/';
const NAPOLI = SITO + '/napoli_ottobre_2026/';
const SCREENSHOT = path.resolve(__dirname, 'risultati/screenshot-sito');
// il Chromium di chi ha scritto le prove; se manca, quello installato
// (il collegamento /opt/pw-browsers/chromium); altrimenti quello di Playwright
const CHROMIUM = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
const RADICE = path.resolve(__dirname, '../..');
fs.mkdirSync(SCREENSHOT, { recursive: true });

// un popup della diretta si aprirebbe a pagina carica + 900 ms e, il giorno
// dell'evento, aspetterebbe lo stato al massimo altri 2,5 s: dopo questo
// tempo "non compare" e' certo (e la finestra di Milano, a +1,2 s, e' aperta)
const QUIETE_MS = 900 + 2500 + 900;
const MINUTO = 60 * 1000;

const COMPUTER = { viewport: { width: 1440, height: 900 } };
const TELEFONO = (() => {
    const d = Object.assign({}, devices['iPhone 13']);
    delete d.defaultBrowserType;
    return d;
})();
// un telefono stretto (320 px, come iPhone SE di prima generazione)
const TELEFONO_STRETTO = { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

let rossi = 0, verdi = 0;
function vero(cond, descrizione, dettaglio) {
    if (cond) { verdi++; console.log('  ok  ' + descrizione); }
    else { rossi++; console.log('ROSSO ' + descrizione + (dettaglio ? '\n       ' + dettaglio : '')); }
}
function uguale(ottenuto, atteso, descrizione) {
    const ok = JSON.stringify(ottenuto) === JSON.stringify(atteso);
    vero(ok, descrizione + (ok ? '' : ' (atteso ' + JSON.stringify(atteso) + ', ottenuto ' + JSON.stringify(ottenuto) + ')'));
}

/* ---------- il sito in locale ---------- */
function risponde(url) {
    return new Promise(ok => {
        const req = http.get(url, res => { res.resume(); ok(res.statusCode < 500); });
        req.on('error', () => ok(false));
        req.setTimeout(1500, () => { req.destroy(); ok(false); });
    });
}
async function accendiSito() {
    if (await risponde(HOME)) return null; // gia' acceso (da chi lancia la prova)
    const figlio = spawn(process.execPath, [path.join(__dirname, 'server-locale.js'),
        '--api', String(PORTA_API), '--statico', String(PORTA_STATICO)], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((ok, ko) => {
        const t = setTimeout(() => ko(new Error('server-locale non partito')), 20000);
        figlio.stdout.on('data', d => { if (/SERVER LOCALE PRONTO/.test(String(d))) { clearTimeout(t); ok(); } });
        figlio.stderr.on('data', d => process.stderr.write(d));
        figlio.on('exit', c => { clearTimeout(t); ko(new Error('server-locale uscito con ' + c)); });
    });
    return figlio;
}

/* ---------- contesti del browser ---------- */
let browser;

// Un contesto = un visitatore (localStorage suo); ogni scheda = una sessione.
// `stato` e' lo stato della diretta che l'endpoint finto restituisce: la
// prova lo cambia a meta' per vedere la pagina che si aggiorna da sola
// (null = il servizio risponde { ok:false }); `ripresa` l'orario di ripresa
// di una pausa.
/* `diretta` (facoltativo): come si vede la diretta sul sito.
     - di base, prova: true -> questo browser la vede come accesa
       (?diretta=prova), qualunque sia PUBBLICA nel file: le prove 1-3 non
       dipendono dall'interruttore;
     - { prova: false, pubblica: true|false } -> nessuna prova in questo
       browser, e diretta-stato.js servito con PUBBLICA forzata (sezione 4);
     - { riservato: false } -> diretta-stato.js servito con l'evento non piu'
       su invito: la controprova della sezione 4. */
async function visitatore(opzioni, stato, diretta) {
    const d = Object.assign({ prova: true }, diretta || {});
    const ctx = await browser.newContext(Object.assign({ locale: 'it-IT', timezoneId: 'Europe/Rome' }, opzioni || {}));
    const v = { ctx, richieste: [], stato: stato || null, ripresa: '' };
    await preparaContesto(ctx, {
        statoDiretta: url => {
            v.richieste.push(url);
            if (!v.stato) return { ok: false };
            const r = {
                ok: true, id: 'webinar-2026-12-10', titolo: 'Webinar, 10 dicembre 2026', stato: v.stato,
                inizio: Date.parse('2026-12-10T15:00:00+01:00'), fine: Date.parse('2026-12-10T17:00:00+01:00'),
                paginaEvento: '/webinar_dicembre_2026/'
            };
            if (v.ripresa) r.ripresa = v.ripresa;
            return r;
        }
    });
    // registrata dopo: Playwright la prova per prima (vedi l'intestazione)
    await ctx.route(/\.mp4(\?|$)|cdn\.iubenda\.com|googletagmanager\.com/, r => r.abort());
    if (typeof d.pubblica === 'boolean' || typeof d.riservato === 'boolean') {
        let sorgente = fs.readFileSync(path.join(RADICE, 'assets/diretta-stato.js'), 'utf8');
        if (typeof d.pubblica === 'boolean') sorgente = sorgente.replace(/var PUBBLICA = (true|false);/, 'var PUBBLICA = ' + d.pubblica + ';');
        if (typeof d.riservato === 'boolean') sorgente = sorgente.replace(/\n(\s*)riservato: (true|false),/, '\n$1riservato: ' + d.riservato + ',');
        await ctx.route(/\/assets\/diretta-stato\.js(\?|$)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: sorgente }));
    }
    if (d.prova) await ctx.addInitScript(() => { try { localStorage.setItem('ngbDirettaProva', '1'); } catch (e) { /* niente */ } });
    v.errori = [];
    v.scheda = async (quando) => {
        const p = await ctx.newPage();
        p.on('pageerror', e => v.errori.push(String(e && e.message || e)));
        if (quando) await p.clock.install({ time: new Date(quando) });
        return p;
    };
    return v;
}

// fa passare `ms` di orologio finto e lascia arrivare le risposte di rete
async function passa(page, ms) {
    await page.clock.runFor(ms);
    await page.waitForTimeout(300);
}

/* I popup che la home NON deve aprire: quello della diretta (#dirPromo,
   assets/diretta-popup.js, che con EVENTO.riservato esce subito) e quelli
   di una volta, la finestra delle novita' (#novitaPromo) e i popup del
   bando e del FCD (#btPromo, #fcdPromo), che non devono tornare: le
   novita' stanno nel riquadro «Sotto la lente» della pagina. Le prove li
   cercano tutti; aspettaPopup serve alla controprova della sezione 4. */
const POPUP = ['dirPromo', 'novitaPromo', 'btPromo', 'fcdPromo'];
async function aspettaPopup(page, id) {
    try {
        await page.waitForSelector('#' + id + '.is-open', { timeout: 9000 });
        await page.waitForTimeout(800); // fine della transizione di entrata (screenshot puliti)
        return true;
    } catch (e) { return false; }
}
async function nelDom(page) {
    return page.evaluate(ids => ids.filter(id => !!document.getElementById(id)), POPUP);
}
// la pagina carica e ferma per il tempo in cui un popup sarebbe comparso
async function quiete(page) {
    await page.waitForLoadState('load');
    await page.waitForTimeout(QUIETE_MS);
}
// il riquadro «Sotto la lente»: i due approfondimenti, in testa alla colonna
// degli approfondimenti (#contenuti), con i link alle due pagine
async function sezioneLente(page) {
    return page.evaluate(() => {
        const s = document.getElementById('sotto-la-lente');
        if (!s || !s.closest('#contenuti')) return false;
        const link = Array.from(s.querySelectorAll('.lente-scheda .lente-banda-titolo a')).map(a => a.getAttribute('href')).join(' ');
        return link === '/bando_tipo_2026/ /cassazione_7134_2026/';
    });
}
async function premiEsc(page) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
}
async function scatta(page, nome, opz) {
    await page.screenshot(Object.assign({ path: path.join(SCREENSHOT, nome + '.png') }, opz || {}));
}
// in cima alla pagina subito (le pagine hanno lo scorrimento morbido:
// uno screenshot preso durante l'animazione verrebbe a meta')
async function inCima(page) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(150);
}
async function senzaScorrimentoOrizzontale(page) {
    return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

// La pillola fissa della diretta (#dirPillola): in home non deve nemmeno
// essere costruita (`presente`); `visibile` e il resto servono alla
// controprova della sezione 4.
async function pillola(page) {
    return page.evaluate(() => {
        const a = document.getElementById('dirPillola');
        if (!a) return { presente: false, visibile: false, testo: '', stato: null };
        return {
            presente: true,
            visibile: !a.hidden && getComputedStyle(a).display !== 'none' && a.getBoundingClientRect().width > 0,
            testo: a.textContent.replace(/\s+/g, ' ').trim(),
            stato: a.getAttribute('data-dirpl')
        };
    });
}

/* La finestra del prossimo evento (Milano) di assets/event-banner.js, in
   home: se c'e' e se e' aperta, se e' gia' stata vista in questa sessione
   (sessionStorage), quanti dialoghi ci sono nella pagina (con il popup
   della diretta sarebbero due), i banner d'angolo delle altre pagine (in
   home nessuno), lo scorrimento della pagina sotto (bloccato a finestra
   aperta); e, se c'e', cosa dice, se ha il fuoco e se sta nello schermo. */
const CHIAVE_MILANO = 'ngb-finestra-2027-02-26-Milano';
async function finestraMilano(page) {
    return page.evaluate(chiave => {
        const velo = document.querySelector('.ngb-fin-velo');
        const fin = velo && velo.querySelector('.ngb-fin');
        const r = {
            presente: !!fin,
            aperta: !!velo && velo.classList.contains('aperta'),
            vista: sessionStorage.getItem(chiave),
            dialoghi: document.querySelectorAll('[role="dialog"]').length,
            banner: document.querySelectorAll('.ngb-event-banner').length,
            scorrimento: document.documentElement.style.overflow
        };
        if (!fin) return r;
        const b = fin.getBoundingClientRect();
        const evento = fin.querySelector('.ngb-fin-btn-pieno');
        r.ruolo = fin.getAttribute('role') + '|' + fin.getAttribute('aria-modal');
        r.titolo = ((fin.querySelector('#ngb-fin-tit') || {}).textContent || '').trim();
        r.citta = ((fin.querySelector('.ngb-fin-citta') || {}).textContent || '').trim();
        r.evento = evento ? new URL(evento.getAttribute('href'), location.href).pathname : '';
        r.fuoco = fin.contains(document.activeElement);
        r.dentro = b.left >= 0 && b.right <= window.innerWidth && b.top >= 0 && b.bottom <= window.innerHeight;
        return r;
    }, CHIAVE_MILANO);
}

/* Quello che della diretta NON deve esserci in home, in un colpo solo:
   popup e pillola (nemmeno i loro fogli di stile), la prenotazione del
   popup (window.__dirPromoPlanned), il "visto" di sessione, data-diretta
   su <html> (la home non ha agganci), la parola webinar e il collegamento
   alla sua pagina; e come NGBDiretta vede il momento (fase) e cosa
   deciderebbe con quello che ha letto (condizione): la home non chiede mai
   niente, quindi la condizione viene dal solo orologio. Si confronta con
   nienteAtteso(fase, condizione). */
async function nienteDiretta(page) {
    return page.evaluate(ids => {
        const D = window.NGBDiretta;
        return {
            popup: ids.filter(id => !!document.getElementById(id)),
            stilePopup: !!document.getElementById('dirPromoStyle'),
            pillola: !!document.getElementById('dirPillola'),
            stilePillola: !!document.getElementById('dirPillolaStyle'),
            prenotato: window.__dirPromoPlanned !== undefined,
            visto: sessionStorage.getItem('dirPromoSeen'),
            attributo: document.documentElement.getAttribute('data-diretta'),
            webinarNelTesto: /webinar/i.test(document.body.innerText),
            linkWebinar: document.querySelectorAll('a[href*="webinar_dicembre_2026"]').length,
            riservato: !!(D && D.EVENTO && D.EVENTO.riservato),
            fase: D ? D.fase() : '',
            condizione: D ? D.condizione(D.ultimo()) : ''
        };
    }, POPUP);
}
function nienteAtteso(fase, condizione) {
    return { popup: [], stilePopup: false, pillola: false, stilePillola: false, prenotato: false, visto: null, attributo: null,
        webinarNelTesto: false, linkWebinar: 0, riservato: true, fase, condizione };
}

/* ============================================================ */
(async () => {
    const server = await accendiSito();
    browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
    try {
        await provaFile();
        await provaNGBDiretta();
        await provaHome();
        await provaWebinar();
        await provaNapoliConclusa();
        await provaNascosta();
    } finally {
        await browser.close();
        if (server) server.kill();
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
    console.log('screenshot in ' + path.relative(process.cwd(), SCREENSHOT) + '/');
    process.exit(rossi ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

/* ---------- 0. i file ---------- */
async function provaFile() {
    console.log('\n[file]');
    const home = fs.readFileSync(path.join(RADICE, 'index.html'), 'utf8');
    // con o senza ?v= (la versione serve alla cache di GitHub Pages)
    const ordine = [/<script src="\/assets\/diretta-stato\.js(\?v=\w+)?" data-pillola defer><\/script>/, /<script src="\/assets\/diretta-popup\.js(\?v=\w+)?" defer><\/script>/]
        .map(re => home.search(re));
    vero(ordine.every(i => i > 0) && ordine[1] > ordine[0],
        'home: stato (con data-pillola) e popup della diretta caricati in quest\'ordine, tutti e due defer');
    // le novita' sono una sezione della pagina, non piu' una finestra all'entrata
    vero(!/novita-popup\.js|bando-tipo-popup\.js|fcd-popup\.js/.test(home),
        'home: nessuna finestra delle novita\' (ne\' novita-popup.js ne\' bando-tipo-popup.js ne\' fcd-popup.js)');
    const colonna = home.indexOf('<aside class="split-rail" id="contenuti"'), lente = home.indexOf('<div class="lente-banda" id="sotto-la-lente"'),
        video = home.indexOf('<section class="video-home vc" id="video"');
    vero(colonna > 0 && lente > colonna && video > lente && /<script src="\/assets\/sotto-la-lente\.js(\?v=\w+)?" defer><\/script>/.test(home),
        'home: il riquadro «Sotto la lente» sta in testa alla colonna degli approfondimenti, con il suo script (defer)');
    const popup = fs.readFileSync(path.join(RADICE, 'assets/diretta-popup.js'), 'utf8');
    const stato = fs.readFileSync(path.join(RADICE, 'assets/diretta-stato.js'), 'utf8');
    uguale(popup.match(/\.innerHTML\s*=\s*[^;]+;/g) || [], ['.innerHTML = html;'], 'popup: innerHTML solo con il markup costante (i testi variabili con textContent)');
    uguale(stato.match(/\.innerHTML\s*=\s*[^;]+;/g) || [], ['.innerHTML = HTML_PILLOLA;'], 'pillola: innerHTML solo con il markup costante');
    // il commento di testa, senza gli asterischi e gli a capo
    const testa = stato.slice(0, stato.indexOf('(function')).replace(/\s*\n\s*\*\s*/g, ' ');
    vero(testa.includes('se cambi data o orario in Gestione, aggiorna anche qui; d\'inverno +01:00'),
        'diretta-stato.js: in cima l\'avviso "se cambi data o orario in Gestione, aggiorna anche qui; d\'inverno +01:00"');
    // l'evento configurato: il webinar, con le date in ora solare (+01:00)
    vero(/id: "webinar-2026-12-10"/.test(stato) && /inizio: "2026-12-10T15:00:00\+01:00"/.test(stato) && /fine: "2026-12-10T17:00:00\+01:00"/.test(stato),
        'diretta-stato.js: EVENTO e\' il webinar del 10 dicembre 2026, 15.00-17.00, scritto con +01:00 (ora solare)');
    vero(/timeZone: FUSO/.test(stato) && /var FUSO = "Europe\/Rome"/.test(stato), 'diretta-stato.js: il giorno di Roma con Intl (timeZone Europe/Rome)');
    vero(/#dirPillola\{[^}]*z-index:9990;/.test(stato), 'pillola: z-index 9990, sotto gli avvisi del sito (9998-9999) e sopra la barra (1000)');
    const webinar = fs.readFileSync(path.join(RADICE, 'webinar_dicembre_2026/index.html'), 'utf8');
    vero(/<section class="diretta-fascia" id="diretta"[^>]*\bdata-diretta-pubblica hidden>/.test(webinar)
        && /id="navDirettaPillola" data-diretta-aperta hidden>/.test(webinar) && /<a href="\/diretta\/" class="nav-diretta" id="navDiretta" data-diretta-aperta hidden>/.test(webinar),
        'webinar: sezione della diretta e le due voci "Diretta" del menu scritte con hidden (nascoste finche\' diretta-stato.js non le mostra)');
    vero(/<script src="\/assets\/diretta-stato\.js(\?v=\w+)?" defer><\/script>\s*<script src="script\.js(\?v=\w+)?"><\/script>\s*<\/body>/.test(webinar),
        'webinar: diretta-stato.js (defer) in fondo alla pagina, subito prima di script.js');
    // Napoli e' conclusa a mano: non legge piu' lo stato (che ora e' quello del webinar)
    const napoli = fs.readFileSync(path.join(RADICE, 'napoli_ottobre_2026/index.html'), 'utf8');
    vero(/<html lang="it" data-diretta="conclusa">/.test(napoli) && !/<script src="\/assets\/diretta-stato\.js/.test(napoli),
        'Napoli: <html data-diretta="conclusa"> scritto a mano e diretta-stato.js non piu\' caricato');
    vero(/<section class="diretta-fascia" id="diretta"[^>]*\bdata-diretta-pubblica hidden>/.test(napoli)
        && /id="navDirettaPillola" data-diretta-aperta hidden>/.test(napoli) && /<li data-diretta-aperta hidden><a href="\/diretta\/" class="nav-diretta"/.test(napoli),
        'Napoli: gli agganci della diretta restano nel markup, con hidden');
    const robots = fs.readFileSync(path.join(RADICE, 'robots.txt'), 'utf8');
    vero(/^Disallow: \/diretta\/$/m.test(robots), 'robots.txt: Disallow: /diretta/');
    const pubblica = (/var PUBBLICA = (true|false);/.exec(stato) || [])[1];
    vero(pubblica === 'true' || pubblica === 'false', 'diretta-stato.js: l\'interruttore PUBBLICA c\'e\' (oggi: ' + pubblica + (pubblica === 'false' ? ', diretta nascosta sul sito' : ', diretta accesa sul sito') + ')');
    // niente trattini lunghi nei testi scritti per la diretta
    const iSezione = webinar.indexOf('<!-- Segui il webinar in diretta'), fSezione = webinar.indexOf('<!-- Il webinar -->'),
        iBarra = webinar.indexOf('<header class="nav" id="navbar">'), fBarra = webinar.indexOf('</header>');
    vero(iSezione > 0 && fSezione > iSezione && iBarra > 0 && fBarra > iBarra, 'webinar: la sezione "Segui il webinar in diretta" e la barra di navigazione si trovano nel file');
    const sezione = webinar.slice(iSezione, fSezione);
    const barra = webinar.slice(iBarra, fBarra);
    const lunghi = [['diretta-popup.js', popup], ['diretta-stato.js', stato], ['sezione del webinar', sezione], ['barra del webinar', barra]]
        .filter(([, t]) => /[–—]/.test(t)).map(([n]) => n);
    uguale(lunghi, [], 'nessun trattino lungo nei testi della diretta (popup, pillola, sezione e menu del webinar)');
    // si entra con l'email: niente "nome utente" e nessuna data d'invio delle credenziali promessa
    const conNome = [['diretta-popup.js', popup], ['pagina del webinar', webinar]].filter(([, t]) => /nome utente/i.test(t)).map(([n]) => n);
    uguale(conNome, [], 'nessun "nome utente" nel popup e nella pagina del webinar');
    vero(!/nei giorni precedenti/i.test(webinar), 'webinar: nessuna data d\'invio delle credenziali promessa («nei giorni precedenti»)');
    // la conferma dell'iscrizione (il modulo e' nascosto finche' le iscrizioni
    // sono chiuse, ma i testi sono gia' nel file)
    const interruttore = (/<body [^>]*data-iscrizioni="(chiuse|aperte)"/.exec(webinar) || [])[1];
    vero(interruttore === 'chiuse' || interruttore === 'aperte', 'webinar: l\'interruttore delle iscrizioni <body data-iscrizioni> c\'e\' (oggi: ' + interruttore + ')');
    const intro = (/<p class="fatto-intro" id="fattoIntro"[^>]*>([\s\S]*?)<\/p>/.exec(webinar) || [])[1] || '';
    const credenziali = (/<span id="passoCredenzialiTesto">([\s\S]*?)<\/span>/.exec(webinar) || [])[1] || '';
    vero(/Per completare l'iscrizione conferma il tuo indirizzo email dal pulsante nella mail che ti abbiamo appena inviato\./.test(intro)
        && /Le credenziali per seguire la diretta arrivano per email\./.test(intro),
        'webinar: la conferma dell\'iscrizione chiede di confermare l\'indirizzo e dice che le credenziali arrivano per email, senza promettere quando');
    uguale(credenziali.trim(), 'Arrivano per email: l\'email con cui ti sei iscritto e una password personale. Non le trovi? Controlla nella cartella Spam o Promozioni.',
        'webinar: il passo delle credenziali dice come si entra (email e password) e dove cercare l\'email (Spam o Promozioni)');
    /* IL WEBINAR E' SU INVITO: la pagina si raggiunge solo dal collegamento
       mandato per email, e il sito non la annuncia da nessuna parte. */
    const evento = stato.slice(stato.indexOf('var EVENTO = {'), stato.indexOf('};', stato.indexOf('var EVENTO = {')));
    vero(/\n\s*riservato: true,/.test(evento), 'diretta-stato.js: EVENTO.riservato e\' true (evento su invito)');
    const banner = fs.readFileSync(path.join(RADICE, 'assets/event-banner.js'), 'utf8');
    vero(/!EVENTO\.riservato/.test(stato) && /if \(EVENTO\.riservato\) return;/.test(popup) && /!D\.EVENTO\.riservato/.test(banner),
        'riservato lo leggono tutti e tre: diretta-stato.js (niente pillola), diretta-popup.js (esce subito) ed event-banner.js (la finestra di Milano si apre come sempre)');
    const schede = (home.match(/<a href="([^"]+)" class="event-card[^"]*"/g) || []).map(s => /href="([^"]+)"/.exec(s)[1]);
    vero(!/webinar/i.test(home) && schede.includes('milano_febbraio_2027/'),
        'home: nessuna scheda ne\' collegamento al webinar (la parola non compare nel file); fra gli eventi c\'e\' Milano (' + schede.join(', ') + ')');
    const elenco = banner.slice(banner.indexOf('const NGB_EVENTS = ['), banner.indexOf('];', banner.indexOf('const NGB_EVENTS = [')));
    vero(elenco.length > 0 && !/webinar/i.test(elenco) && /city: 'Milano'/.test(elenco) && /finestra: \{/.test(elenco),
        'event-banner.js: nell\'elenco degli eventi c\'e\' Milano (con la finestra della home), il webinar no');
    const sitemap = fs.readFileSync(path.join(RADICE, 'sitemap.xml'), 'utf8');
    vero(!/webinar/i.test(sitemap) && /<loc>https:\/\/nextgenerationbusiness\.it\/milano_febbraio_2027\/<\/loc>/.test(sitemap), 'sitemap.xml: Milano c\'e\', il webinar no');
    vero(/^Disallow: \/webinar_dicembre_2026\/$/m.test(robots), 'robots.txt: Disallow: /webinar_dicembre_2026/');
    uguale(webinar.match(/<meta name="robots"[^>]*>/g), ['<meta name="robots" content="noindex, nofollow">'], 'webinar: un solo <meta name="robots">, noindex, nofollow');
    const milano = fs.readFileSync(path.join(RADICE, 'milano_febbraio_2027/index.html'), 'utf8');
    vero(!/webinar_dicembre_2026/.test(milano) && /<ol class="percorso"/.test(milano), 'Milano: nessun collegamento alla pagina del webinar (nemmeno nel percorso)');
    const contatti = fs.readFileSync(path.join(RADICE, 'contatti/index.html'), 'utf8');
    const contattiJs = fs.readFileSync(path.join(RADICE, 'contatti/contatti.js'), 'utf8');
    vero(!/webinar/i.test(contatti) && /EVENTI_RISERVATI = \{\s*'webinar-2026':/.test(contattiJs),
        'contatti: nessuna voce del webinar nella tendina degli eventi (contatti.js la aggiunge solo con ?evento=webinar-2026)');
    const config = fs.readFileSync(path.join(RADICE, 'diretta/config.js'), 'utf8');
    vero(/\n\s*iscrizione: '',/.test(config), 'diretta/config.js: iscrizione vuoto (la pagina di accesso alla diretta non dice dove ci si iscrive)');
}

/* ---------- 1. NGBDiretta ---------- */
async function provaNGBDiretta() {
    console.log('\n[NGBDiretta: date, finestre, condizioni, cache]');
    const v = await visitatore(COMPUTER, 'programmato');
    const p = await v.scheda('2026-12-10T15:30:00+01:00');
    await p.goto(WEBINAR);
    const esiti = await p.evaluate(() => {
        const D = window.NGBDiretta;
        const f = s => D.fase(new Date(s));
        const g = s => D.eGiorno(new Date(s));
        const c = (s, stato) => D.condizione(stato ? { stato } : null, new Date(s));
        return {
            evento: D.EVENTO,
            servizio: D.SERVIZIO,
            fasi: [f('2026-11-20T10:00:00+01:00'), f('2026-12-03T14:59:59+01:00'), f('2026-12-03T15:00:00+01:00'),
                f('2026-12-09T23:59:59+01:00'), f('2026-12-10T00:00:00+01:00'), f('2026-12-10T16:59:59+01:00'),
                f('2026-12-10T17:00:00+01:00'), f('2026-12-11T10:00:00+01:00')],
            giorno: [g('2026-12-10T11:59:59+01:00'), g('2026-12-10T12:00:00+01:00'), g('2026-12-10T19:59:59+01:00'),
                g('2026-12-10T20:00:00+01:00')],
            // stesso istante scritto in UTC: il fuso del visitatore non conta
            utc: f('2026-12-09T23:00:00Z') + '/' + f('2026-12-09T22:59:59Z'),
            // d'inverno Roma e' a +01:00: la mezzanotte e' alle 23 UTC...
            giorniRoma: [D.giornoRoma(Date.parse('2026-12-09T22:59:59Z')), D.giornoRoma(Date.parse('2026-12-09T23:00:00Z')),
                // ...e con l'ora legale (+02:00) alle 22 UTC
                D.giornoRoma(Date.parse('2026-10-01T21:59:59Z')), D.giornoRoma(Date.parse('2026-10-01T22:00:00Z'))],
            condizioni: {
                'fuori': c('2026-11-20T10:00:00+01:00', 'in_onda'),
                'prima': c('2026-12-05T10:00:00+01:00'),
                'oggi 8.00, programmato': c('2026-12-10T08:00:00+01:00', 'programmato'),
                'oggi 8.00, terminato (una prova del gestore)': c('2026-12-10T08:00:00+01:00', 'terminato'),
                'oggi 14.30, gia\' in onda': c('2026-12-10T14:30:00+01:00', 'in_onda'),
                'oggi 15.30, lettura fallita': c('2026-12-10T15:30:00+01:00', null),
                'oggi 15.30, in onda': c('2026-12-10T15:30:00+01:00', 'in_onda'),
                'oggi 16.00, pausa': c('2026-12-10T16:00:00+01:00', 'pausa'),
                'oggi 16.30, terminato': c('2026-12-10T16:30:00+01:00', 'terminato'),
                '17.15, ancora in onda': c('2026-12-10T17:15:00+01:00', 'in_onda'),
                '17.15, in pausa': c('2026-12-10T17:15:00+01:00', 'pausa'),
                '17.15, programmato': c('2026-12-10T17:15:00+01:00', 'programmato'),
                '17.15, lettura fallita': c('2026-12-10T17:15:00+01:00', null),
                '20.30, ancora in onda': c('2026-12-10T20:30:00+01:00', 'in_onda'),
                '11 dicembre': c('2026-12-11T10:00:00+01:00', null)
            },
            orario: D.orario()
        };
    });
    const e = esiti.evento;
    uguale([e.id, e.citta, e.cosa, e.invito, e.soloOnline, e.mostraDaGiorni, e.urlDiretta, e.pagina, e.urlIscrizione].join('|'),
        'webinar-2026-12-10|Webinar|Il webinar|Segui il webinar in diretta|true|7|/diretta/|/webinar_dicembre_2026/|/webinar_dicembre_2026/#iscrizioni',
        'EVENTO configurato in cima al file (id, parola corta, come si chiama nelle frasi, invito, solo online, giorni, indirizzi)');
    uguale(esiti.servizio, 'https://revilaw-email.vercel.app/api/diretta-stato', 'SERVIZIO: l\'endpoint pubblico con cache');
    uguale(esiti.fasi, ['fuori', 'fuori', 'prima', 'prima', 'oggi', 'oggi', 'dopo', 'dopo'],
        'fase(): fuori fino a 7 giorni prima delle 15.00, prima, oggi dalla mezzanotte di Roma, dopo dalle 17.00');
    uguale(esiti.giorno, [false, true, true, false], 'eGiorno(): lettura da 3 ore prima dell\'inizio (12.00) a 3 ore dopo la fine prevista (20.00)');
    uguale(esiti.utc, 'oggi/prima', 'il giorno dell\'evento comincia alla mezzanotte di Roma');
    uguale(esiti.giorniRoma, ['2026-12-09', '2026-12-10', '2026-10-01', '2026-10-02'], 'giornoRoma(): mezzanotte di Roma d\'inverno e con l\'ora legale (Intl)');
    uguale(esiti.condizioni, {
        'fuori': 'fuori',
        'prima': 'prima',
        'oggi 8.00, programmato': 'oggi',
        'oggi 8.00, terminato (una prova del gestore)': 'oggi',
        'oggi 14.30, gia\' in onda': 'in_onda',
        'oggi 15.30, lettura fallita': 'oggi',
        'oggi 15.30, in onda': 'in_onda',
        'oggi 16.00, pausa': 'pausa',
        'oggi 16.30, terminato': 'conclusa',
        '17.15, ancora in onda': 'in_onda',
        '17.15, in pausa': 'pausa',
        '17.15, programmato': 'conclusa',
        '17.15, lettura fallita': 'conclusa',
        '20.30, ancora in onda': 'conclusa',
        '11 dicembre': 'conclusa'
    }, 'condizione(): da orario e stato (pausa, sforamento, terminato prima dell\'inizio, 3 ore dopo la fine)');
    uguale(esiti.orario, { giorno: 'giovedì 10 dicembre 2026', inizio: '15.00', fine: '17.00', giornoBreve: '10 dicembre' }, 'orario() leggibile come nel resto del sito');

    await p.waitForTimeout(300);
    const primaDiLeggere = v.richieste.length;
    vero(primaDiLeggere === 1 && /\/api\/diretta-stato\?evento=webinar-2026-12-10$/.test(v.richieste[0]),
        'la pagina chiede lo stato una volta, con il solo parametro evento (' + v.richieste[0] + ')');
    // cinque letture insieme a cache vuota: una sola richiesta in volo
    const cinque = await p.evaluate(() => new Promise(ok => {
        sessionStorage.removeItem('ngbDirettaStato_webinar-2026-12-10');
        const risposte = [];
        for (let i = 0; i < 5; i++) window.NGBDiretta.leggi(d => { risposte.push(d && d.stato); if (risposte.length === 5) ok(risposte); });
    }));
    uguale(cinque, ['programmato', 'programmato', 'programmato', 'programmato', 'programmato'], 'cinque letture contemporanee ricevono tutte lo stato');
    uguale(v.richieste.length - primaDiLeggere, 1, 'cinque letture contemporanee = una sola richiesta in volo');
    const ancora = await p.evaluate(() => new Promise(ok => window.NGBDiretta.leggi(d => ok(d && d.stato))));
    uguale([ancora, v.richieste.length - primaDiLeggere], ['programmato', 1], 'una nuova lettura entro 60 s viene dalla cache (sessionStorage), senza rete');
    await p.clock.runFor(61 * 1000);
    /* Il ricontrollo del minuto (segui) ha appena chiesto lo stato: si aspetta
       che la sua risposta sia arrivata, altrimenti la lettura "fallita" qui
       sotto si accoda alla sua richiesta in volo e ne eredita lo stato buono
       (una corsa che su una macchina lenta si vedeva come due rossi). */
    await p.waitForTimeout(500);
    let dopo = v.richieste.length;
    v.stato = null; // il servizio risponde { ok:false }
    const fallita = await p.evaluate(() => new Promise(ok => {
        sessionStorage.removeItem('ngbDirettaStato_webinar-2026-12-10');
        window.NGBDiretta.leggi(d => ok(d));
    }));
    uguale(fallita, null, 'risposta { ok:false } del servizio: cb(null)');
    vero(v.richieste.length === dopo + 1, 'anche la lettura fallita e\' una sola richiesta (e resta in cache: niente raffiche)');

    // 'pausa' con l'orario di ripresa: accettato e ripulito
    v.stato = 'pausa'; v.ripresa = '16:10';
    const pausa = await p.evaluate(() => new Promise(ok => {
        sessionStorage.removeItem('ngbDirettaStato_webinar-2026-12-10');
        window.NGBDiretta.leggi(d => ok(d && [d.stato, d.ripresa]));
    }));
    uguale(pausa, ['pausa', '16.10'], 'stato "pausa" accettato, con la ripresa scritta come nel sito (16.10)');
    v.ripresa = '<b>16</b>';
    const sporca = await p.evaluate(() => new Promise(ok => {
        sessionStorage.removeItem('ngbDirettaStato_webinar-2026-12-10');
        window.NGBDiretta.leggi(d => ok(d && d.ripresa));
    }));
    uguale(sporca, '', 'una ripresa che non e\' un orario si scarta');
    v.ripresa = '';

    // 'terminato' a evento cominciato chiude la lettura
    v.stato = 'terminato';
    await p.evaluate(() => new Promise(ok => {
        sessionStorage.removeItem('ngbDirettaStato_webinar-2026-12-10');
        window.NGBDiretta.leggi(() => ok());
    }));
    dopo = v.richieste.length;
    v.stato = 'in_onda';
    await p.clock.runFor(5 * MINUTO);
    const chiusa = await p.evaluate(() => new Promise(ok => window.NGBDiretta.leggi(d => ok(d && d.stato))));
    uguale([chiusa, v.richieste.length - dopo], ['terminato', 0], 'dopo "terminato" (letto alle 15.30) nessuna richiesta, nemmeno a cache scaduta');
    vero(v.errori.length === 0, 'nessun errore JavaScript nella pagina' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
    await v.ctx.close();

    // un visitatore da New York: il giorno dell'evento resta quello di Roma
    const ny = await visitatore(Object.assign({}, COMPUTER, { timezoneId: 'America/New_York' }), 'programmato');
    const q = await ny.scheda('2026-12-09T23:30:00Z'); // 18.30 a New York, 0.30 del 10 dicembre a Roma
    await q.goto(WEBINAR);
    const daNy = await q.evaluate(() => [new Date().getDate(), window.NGBDiretta.fase(), window.NGBDiretta.giornoRoma(Date.now())]);
    uguale(daNy, [9, 'oggi', '2026-12-10'], 'chi visita da New York il 9 dicembre alle 18.30 (0.30 a Roma) e\' gia\' nel giorno dell\'evento');
    await ny.ctx.close();
}

/* ---------- 2. la home: l'evento su invito non si annuncia ---------- */
/* In home diretta-stato.js (con data-pillola) e diretta-popup.js sono
   caricati come prima, ma con EVENTO.riservato non costruiscono niente:
   la pagina non ha agganci, quindi non chiede mai lo stato, e la finestra
   del prossimo evento (Milano, assets/event-banner.js) si apre come sempre,
   una volta per sessione, anche nella settimana del webinar e il giorno
   stesso. Ogni scheda (v.scheda) e' una sessione nuova. */
async function provaHome() {
    // [nome, quando, stato che il servizio darebbe, fase di NGBDiretta, condizione dal solo orologio]
    const giorni = [
        ['20 novembre, fuori finestra', '2026-11-20T10:00:00+01:00', 'in_onda', 'fuori', 'fuori'],
        ['5 dicembre, nella finestra', '2026-12-05T10:00:00+01:00', 'programmato', 'prima', 'prima'],
        ['10 dicembre ore 8, non ancora in onda', '2026-12-10T08:00:00+01:00', 'programmato', 'oggi', 'oggi'],
        ['10 dicembre ore 13, nella finestra di lettura', '2026-12-10T13:00:00+01:00', 'programmato', 'oggi', 'oggi'],
        ['10 dicembre ore 15.30, in onda', '2026-12-10T15:30:00+01:00', 'in_onda', 'oggi', 'oggi'],
        ['10 dicembre ore 16, in pausa', '2026-12-10T16:00:00+01:00', 'pausa', 'oggi', 'oggi'],
        ['10 dicembre ore 17.15, si sfora oltre la fine prevista', '2026-12-10T17:15:00+01:00', 'in_onda', 'dopo', 'conclusa'],
        ['10 dicembre ore 18.30, dopo la fine', '2026-12-10T18:30:00+01:00', 'terminato', 'dopo', 'conclusa'],
        ['10 dicembre ore 21, oltre le 3 ore dopo la fine', '2026-12-10T21:00:00+01:00', 'in_onda', 'dopo', 'conclusa']
    ];
    for (const [nome, quando, stato, fase, condizione] of giorni) {
        console.log('\n[home: ' + nome + ']');
        const v = await visitatore(COMPUTER, stato);
        if (stato === 'pausa') v.ripresa = '16:10';
        const p = await v.scheda(quando);
        await p.goto(HOME);
        await quiete(p);
        uguale(await nienteDiretta(p), nienteAtteso(fase, condizione),
            'niente della diretta: nessun popup ne\' pillola (nemmeno i fogli di stile), niente prenotazione, la pagina non nomina il webinar; NGBDiretta sa la fase ("' + fase + '") ma la condizione viene dal solo orologio ("' + condizione + '")');
        const f = await finestraMilano(p);
        uguale([f.aperta, f.citta, f.dialoghi], [true, 'Milano', 1], 'la finestra del prossimo evento (Milano) si apre come sempre, unico dialogo della pagina');
        if (nome.indexOf('15.30') > 0) await scatta(p, 'home-computer-in-diretta');
        await passa(p, 2 * MINUTO);
        uguale(v.richieste.length, 0, 'nessuna richiesta allo stato della diretta, nemmeno dopo due minuti (il servizio direbbe "' + stato + '")');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await v.ctx.close();
    }

    /* Il 5 dicembre da vicino: il blocco dormiente (i file ci sono e
       NGBDiretta risponde, ma non costruiscono niente) e la finestra di
       Milano, che si comporta come in qualsiasi altro giorno. */
    console.log('\n[home: 5 dicembre da vicino (computer)]');
    {
        const v = await visitatore(COMPUTER);
        const p = await v.scheda('2026-12-05T10:00:00+01:00');
        await p.goto(HOME);
        await quiete(p);
        await scatta(p, 'home-computer-5-dicembre');
        const d = await p.evaluate(() => {
            const D = window.NGBDiretta;
            const script = s => document.querySelectorAll('script[src*="' + s + '"]').length;
            return {
                file: [script('diretta-stato.js'), script('diretta-popup.js'), script('event-banner.js')],
                dataPillola: !!document.querySelector('script[src*="diretta-stato.js"][data-pillola]'),
                evento: [D.EVENTO.riservato, D.visibile, D.fase(), D.condizione(null), D.eGiorno(), D.ultimo()],
                costruito: ['dirPromo', 'dirPromoStyle', 'dirPillola', 'dirPillolaStyle'].filter(id => !!document.getElementById(id)),
                memoria: [window.__dirPromoPlanned === undefined, sessionStorage.getItem('dirPromoSeen'),
                    localStorage.getItem('dirPromoHidden_webinar-2026-12-10'), sessionStorage.getItem('ngbDirettaStato_webinar-2026-12-10'),
                    document.documentElement.getAttribute('data-diretta')]
            };
        });
        uguale([d.file, d.dataPillola], [[1, 1, 1], true],
            'diretta-stato.js (con data-pillola), diretta-popup.js ed event-banner.js sono caricati come prima: e\' riservato a spegnere popup e pillola, non la home');
        uguale(d.evento, [true, true, 'prima', 'prima', false, null],
            'NGBDiretta risponde come sempre: EVENTO.riservato true, diretta visibile, fase e condizione "prima", niente da leggere e niente letto');
        uguale([d.costruito, d.memoria], [[], [true, null, null, null, null]],
            'popup e pillola non sono nel DOM (nemmeno i fogli di stile), nessuna prenotazione, niente "visto" ne\' "non mostrare più", cache vuota, <html> senza data-diretta');
        const f = await finestraMilano(p);
        uguale([f.ruolo, f.titolo, f.evento, f.fuoco, f.banner, f.scorrimento],
            ['dialog|true', 'Merito creditizio, crescita e competitività delle imprese', '/milano_febbraio_2027/', true, 0, 'hidden'],
            'la finestra di Milano: dialogo modale con il fuoco, il titolo del convegno, «Scopri l\'evento» verso /milano_febbraio_2027/, nessun banner d\'angolo, la pagina sotto non scorre');
        vero(await sezioneLente(p), 'le novita\' sono nella pagina: il riquadro «Sotto la lente» nella colonna degli approfondimenti, con il bando-tipo e la Cassazione 7134');
        await premiEsc(p);
        const g = await finestraMilano(p);
        uguale([g.presente, g.vista, g.scorrimento], [false, '1', ''], 'ESC chiude la finestra, che si segna come vista per la sessione, e la pagina torna a scorrere');
        await scatta(p, 'home-computer-5-dicembre-chiusa');
        await p.reload();
        await quiete(p);
        uguale([(await finestraMilano(p)).presente, await nelDom(p), (await pillola(p)).presente, v.richieste.length], [false, [], false, 0],
            'ricaricando nella stessa sessione: la finestra di Milano non torna, della diretta ancora niente, nessuna richiesta');
        const nuova = await v.scheda(); // nuova scheda = nuova sessione (sessionStorage suo), stesso orologio del contesto
        await nuova.goto(HOME);
        await quiete(nuova);
        uguale([(await finestraMilano(nuova)).aperta, await nelDom(nuova), (await pillola(nuova)).presente], [true, [], false],
            'in una nuova sessione la finestra di Milano torna; popup e pillola della diretta no');
        await nuova.click('.ngb-fin-x');
        await nuova.waitForTimeout(600);
        uguale((await finestraMilano(nuova)).presente, false, 'la X la chiude');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await v.ctx.close();
    }

    /* La finestra della diretta si apre il 3 dicembre alle 15.00, a pagina
       aperta: con un evento pubblico comparirebbe la pillola e, tornando
       sulla home, il popup. Su invito non cambia niente. */
    console.log('\n[home: la finestra della diretta si apre a pagina aperta (3 dicembre, 14.58 -> 15.01)]');
    {
        const v = await visitatore(COMPUTER);
        const p = await v.scheda('2026-12-03T14:58:00+01:00');
        await p.goto(HOME);
        await quiete(p);
        uguale([await p.evaluate(() => window.NGBDiretta.fase()), await nelDom(p), (await pillola(p)).presente], ['fuori', [], false],
            'alle 14.58 la finestra della diretta non e\' ancora aperta: nessun popup ne\' pillola');
        await passa(p, 3 * MINUTO);
        uguale([await p.evaluate(() => window.NGBDiretta.fase()), await nelDom(p), (await pillola(p)).presente, v.richieste.length], ['prima', [], false, 0],
            'alle 15.01 la finestra e\' aperta (fase "prima") ma in home non cambia niente: nessuna pillola, nessuna richiesta');
        await p.reload();
        await quiete(p);
        uguale([await nelDom(p), await p.evaluate(() => sessionStorage.getItem('dirPromoSeen')), (await pillola(p)).presente], [[], null, false],
            'tornando sulla home nella stessa sessione, a finestra aperta: nessun popup (e non risulta "visto"), nessuna pillola');
        const nuova = await v.scheda();
        await nuova.goto(HOME);
        await quiete(nuova);
        uguale([await nelDom(nuova), (await pillola(nuova)).presente, (await finestraMilano(nuova)).aperta], [[], false, true],
            'in una nuova sessione: ancora niente della diretta, la finestra di Milano si apre');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await v.ctx.close();
    }

    for (const [nome, quando, stato] of [['prima', '2026-12-05T10:00:00+01:00', null], ['in-diretta', '2026-12-10T15:30:00+01:00', 'in_onda']]) {
        console.log('\n[home: telefono, ' + nome + ']');
        const v = await visitatore(TELEFONO, stato);
        const p = await v.scheda(quando);
        await p.goto(HOME);
        await quiete(p);
        uguale(await nienteDiretta(p), nienteAtteso(stato ? 'oggi' : 'prima', stato ? 'oggi' : 'prima'), 'niente della diretta sul telefono');
        const f = await finestraMilano(p);
        uguale([f.aperta, f.dentro], [true, true], 'la finestra di Milano si apre e sta tutta nello schermo del telefono');
        vero(await senzaScorrimentoOrizzontale(p), 'niente scorrimento orizzontale');
        await scatta(p, 'home-telefono-' + nome);
        await p.tap('.ngb-fin-x');
        await p.waitForTimeout(600);
        uguale((await finestraMilano(p)).presente, false, 'la X la chiude');
        vero(await senzaScorrimentoOrizzontale(p), 'e la pagina non scorre di lato');
        await scatta(p, 'home-telefono-' + nome + '-chiusa');
        await passa(p, 2 * MINUTO);
        uguale(v.richieste.length, 0, 'nessuna richiesta allo stato (2 minuti)');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await v.ctx.close();
    }
}

/* ---------- 3. la pagina del webinar ---------- */
async function statoWebinar(page) {
    return page.evaluate(() => {
        const vis = el => !!el && !el.hidden && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none' &&
            !el.closest('[hidden]');
        const nav = document.getElementById('navDiretta');
        const btn = document.getElementById('btnDiretta');
        const pil = document.getElementById('navDirettaPillola');
        const sez = document.getElementById('diretta');
        const titolo = Array.from(sez.querySelectorAll('h2 span')).filter(vis).map(s => s.textContent.trim()).join('');
        return {
            menu: vis(nav.querySelector('.indicatore-live')),
            pulsante: vis(btn.querySelector('.indicatore-live')),
            pillola: vis(pil.querySelector('.indicatore-live')),
            pausaMenu: vis(nav.querySelector('.indicatore-pausa')),
            pausaPulsante: vis(btn.querySelector('.indicatore-pausa')),
            // solo le parti che si vedono ("Diretta", "IN DIRETTA", "Diretta in pausa")
            testoMenu: Array.from(nav.children).filter(vis).map(e => e.textContent.trim()).join(' '),
            // la voce e' un collegamento del menu senza <li>: hidden sta su di lei
            voceMenu: !nav.hidden,
            voceVisibile: vis(nav),
            pillolaAccesa: !pil.hidden,
            pillolaVisibile: vis(pil),
            pulsanteVisibile: vis(btn),
            titolo,
            conclusa: Array.from(sez.querySelectorAll('[data-diretta-conclusa]')).every(vis) && Array.from(sez.querySelectorAll('[data-diretta-aperta]')).every(el => !vis(el)),
            html: document.documentElement.getAttribute('data-diretta'),
            letto: document.documentElement.getAttribute('data-diretta-stato')
        };
    });
}

// il menu esteso (sopra i 960px): voci su una riga, senza toccare il marchio
async function menuWebinar(page) {
    return page.evaluate(() => {
        const r = el => el.getBoundingClientRect();
        const menu = r(document.getElementById('navMenu'));
        const marchio = r(document.querySelector('.nav-brand'));
        const voci = Array.from(document.querySelectorAll('#navMenu > a')).filter(a => r(a).width > 0);
        const centri = voci.map(a => { const b = r(a); return b.top + b.height / 2; });
        const pil = document.getElementById('navDirettaPillola');
        return {
            hamburger: getComputedStyle(document.getElementById('navToggle')).display !== 'none',
            voci: voci.length,
            // una riga = tutte le voci con il centro alla stessa altezza
            // (la pillola Diretta e' piu' alta dei collegamenti di testo)
            righe: voci.length && Math.max.apply(null, centri) - Math.min.apply(null, centri) < 6 ? 1 : 2,
            margine: Math.round(menu.left - marchio.right),
            fuori: menu.right > window.innerWidth,
            diretta: r(document.getElementById('navDiretta')).width > 0,
            pillola: !pil.hidden && getComputedStyle(pil).display !== 'none' && r(pil).width > 0
        };
    });
}

// la pillola accanto all'hamburger (fino a 960px): dove sta e cosa dice
async function barra(page) {
    return page.evaluate(() => {
        const r = el => el.getBoundingClientRect();
        const pil = document.getElementById('navDirettaPillola');
        const b = r(pil), t = r(document.getElementById('navToggle')), m = r(document.querySelector('.nav-brand'));
        const centro = x => x.top + x.height / 2;
        // chi risponde al tocco 5px sopra e sotto la pillola (area allargata)
        const sopra = document.elementFromPoint(b.left + b.width / 2, b.top - 5);
        const sotto = document.elementFromPoint(b.left + b.width / 2, b.bottom + 5);
        return {
            visibile: !pil.hidden && getComputedStyle(pil).display !== 'none' && b.width > 0,
            testo: pil.innerText.replace(/\s+/g, ' ').trim().toUpperCase(),
            href: pil.getAttribute('href'),
            fuoriDalMenu: !document.getElementById('navMenu').contains(pil),
            menuChiuso: !document.getElementById('navMenu').classList.contains('active'),
            accanto: b.right <= t.left && t.left - b.right <= 24 && Math.abs(centro(b) - centro(t)) <= 4,
            staccataDalMarchio: b.left >= m.right + 8,
            dentro: b.left >= 0 && b.right <= window.innerWidth,
            tocco: pil.contains(sopra) && pil.contains(sotto) ? Math.round(b.height + 10) : Math.round(b.height),
            altezza: Math.round(b.height)
        };
    });
}

async function provaWebinar() {
    /* Prima della finestra (da 7 giorni prima) la pagina spiega gia' come si
       partecipa: sezione, voce di menu e pillola restano nascoste anche con
       la diretta accesa sul sito, e compaiono da sole all'apertura. */
    console.log('\n[webinar: 20 novembre, fuori finestra (computer e telefono)]');
    for (const [nome, opzioni] of [['computer', COMPUTER], ['telefono', TELEFONO]]) {
        const v = await visitatore(opzioni, 'in_onda');
        const p = await v.scheda('2026-11-20T10:00:00+01:00');
        await p.goto(WEBINAR);
        await passa(p, 2 * MINUTO);
        const s = await statoWebinar(p);
        const m = await menuWebinar(p);
        uguale([s.html, s.voceMenu, s.pillolaAccesa, m.pillola, await p.isVisible('#diretta')], ['fuori', false, false, false, false],
            nome + ': <html data-diretta="fuori">, sezione, voce "Diretta" e pillola nascoste anche con la diretta accesa sul sito');
        uguale(v.richieste.length, 0, nome + ': nessuna richiesta allo stato (2 minuti)');
        if (nome === 'computer') vero(!m.hamburger && m.voci === 4 && m.righe === 1, 'computer: le 4 voci del menu su una riga, senza Diretta');
        else vero(m.hamburger, 'telefono: l\'hamburger, senza pillola accanto');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await v.ctx.close();
    }

    console.log('\n[webinar: la finestra si apre a pagina aperta (3 dicembre, 14.58 -> 15.01)]');
    {
        const v = await visitatore(COMPUTER, 'programmato');
        const p = await v.scheda('2026-12-03T14:58:00+01:00');
        await p.goto(WEBINAR);
        await p.waitForTimeout(600);
        let s = await statoWebinar(p);
        uguale([s.html, s.voceMenu, await p.isVisible('#diretta')], ['fuori', false, false], 'alle 14.58 ancora niente');
        await passa(p, 3 * MINUTO);
        s = await statoWebinar(p);
        uguale([s.html, s.voceMenu, s.voceVisibile, await p.isVisible('#diretta'), s.titolo], ['prima', true, true, true, 'Segui il webinar in diretta'],
            'alle 15.01 sezione e voce "Diretta" compaiono da sole, senza ricaricare');
        uguale(v.richieste.length, 0, 'senza nessuna richiesta allo stato');
        await v.ctx.close();
    }

    console.log('\n[webinar: 5 dicembre (computer)]');
    {
        const v = await visitatore(COMPUTER, 'programmato');
        const p = await v.scheda('2026-12-05T10:00:00+01:00');
        await p.goto(WEBINAR);
        await p.waitForTimeout(600);
        const s = await p.evaluate(() => {
            const nav = document.getElementById('navDiretta');
            const sez = document.getElementById('diretta');
            const btn = document.getElementById('btnDiretta');
            const vis = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
            const voci = Array.from(document.querySelectorAll('#navMenu > a'));
            const iscriviti = sez.querySelector('.diretta-note a[href^="#"]');
            return {
                // innerText: solo quello che si vede (l'indicatore spento non conta)
                nav: nav ? nav.getAttribute('href') + '|' + nav.className + '|' + nav.innerText.replace(/\s+/g, ' ').trim() : '',
                navVisibile: nav ? vis(nav) : false,
                // il menu: collegamenti semplici (niente <ul>/<li>), con Diretta per ultima
                voci: voci.map(a => a.innerText.replace(/\s+/g, ' ').trim()),
                ultima: voci[voci.length - 1] === nav,
                pillolaTelefono: getComputedStyle(document.getElementById('navDirettaPillola')).display,
                sezione: sez ? sez.tagName + '|' + (sez.previousElementSibling && sez.previousElementSibling.id) + '|' + (sez.nextElementSibling && sez.nextElementSibling.id) : '',
                // textContent: innerText darebbe il maiuscolo del foglio di stile
                occhiello: sez ? sez.querySelector('.diretta-occhiello').textContent.replace(/\s+/g, ' ').trim() : '',
                titolo: sez ? sez.querySelector('h2').innerText.trim() : '',
                testo: sez ? sez.innerText.replace(/\s+/g, ' ') : '',
                posta: sez ? Array.from(sez.querySelectorAll('.diretta-note a[href^="mailto:"]')).map(a => a.getAttribute('href')) : [],
                iscriviti: iscriviti ? iscriviti.getAttribute('href') + '|' + iscriviti.textContent.trim() : '',
                btn: btn ? btn.getAttribute('href') + '|' + btn.querySelector('.btn-diretta-testo').textContent.trim() + '|' + sez.contains(btn) : '',
                btnVisibile: btn ? vis(btn) : false,
                indicatori: document.querySelectorAll('.indicatore-live').length,
                pause: document.querySelectorAll('.indicatore-pausa').length,
                nascosti: Array.from(document.querySelectorAll('.indicatore-live, .indicatore-pausa')).every(el => el.hidden && getComputedStyle(el).display === 'none')
            };
        });
        uguale(s.nav, '/diretta/|nav-diretta|Diretta', 'voce di menu "Diretta" verso /diretta/ (a.nav-diretta#navDiretta)');
        vero(s.navVisibile, 'la voce Diretta si vede nel menu esteso');
        uguale(s.voci, ['Il webinar', 'Programma', 'Come partecipare', 'Iscrizioni', 'Diretta'], 'il menu: Il webinar, Programma, Come partecipare, Iscrizioni e Diretta');
        vero(s.ultima, 'la voce Diretta e\' l\'ultima del menu, subito dopo "Iscrizioni"');
        uguale(s.pillolaTelefono, 'none', 'col menu esteso la pillola accanto all\'hamburger non serve (nascosta)');
        uguale(s.sezione, 'SECTION|hero|evento', 'sezione #diretta subito dopo la hero e prima di #evento');
        uguale(s.occhiello, 'Diretta online · 10 dicembre 2026', 'occhiello "Diretta online · 10 dicembre 2026"');
        uguale(s.titolo, 'Segui il webinar in diretta', 'titolo "Segui il webinar in diretta"');
        vero(/Giovedì 10 dicembre, dalle 15\.00 alle 17\.00, il webinar si segue online, in diretta, da computer, tablet o telefono\./.test(s.testo),
            'giorno e orario del webinar, che si segue online da computer, tablet o telefono');
        vero(/Gli iscritti entrano con la propria email e la password ricevuta via email\./.test(s.testo),
            'il testo spiega che gli iscritti entrano con la propria email e la password ricevuta via email');
        vero(/Non trovi l’email con la password\? Controlla nella cartella Spam o Promozioni e segna il mittente come sicuro, oppure scrivi a info@nextgenerationbusiness\.it/.test(s.testo),
            '"Non trovi l’email con la password? Controlla nella cartella Spam o Promozioni e segna il mittente come sicuro, oppure scrivi a info@nextgenerationbusiness.it"');
        vero(!/nome utente|nei giorni precedenti/i.test(s.testo), 'nessun "nome utente" e nessuna data d\'invio promessa nella sezione');
        uguale(s.posta, ['mailto:info@nextgenerationbusiness.it'], 'l\'indirizzo dell\'assistenza e\' un collegamento email');
        uguale(s.iscriviti, '#iscrizioni|Iscriviti al webinar', 'la nota "Non ti sei ancora iscritto?" porta alle iscrizioni della pagina (#iscrizioni)');
        vero(!/si è concluso/.test(s.testo), 'nessuna traccia del testo di fine webinar');
        uguale(s.btn, '/diretta/|Accedi alla diretta|true', 'pulsante #btnDiretta "Accedi alla diretta" verso /diretta/');
        vero(s.btnVisibile, 'il pulsante si vede');
        uguale([s.indicatori, s.pause], [3, 3], 'tre indicatori IN DIRETTA e tre "in pausa": nel menu, sulla pillola e sul pulsante');
        vero(s.nascosti, 'indicatori spenti fuori dal giorno dell\'evento');
        uguale(await p.evaluate(() => document.documentElement.getAttribute('data-diretta')), 'prima', '<html data-diretta="prima">');
        uguale(v.richieste.length, 0, 'nessuna richiesta allo stato fuori dal giorno dell\'evento');
        await p.clock.runFor(3 * MINUTO);
        uguale(v.richieste.length, 0, 'nemmeno dopo tre minuti di pagina aperta');
        vero(await senzaScorrimentoOrizzontale(p), 'niente scorrimento orizzontale');
        await inCima(p);
        await scatta(p, 'webinar-menu-computer', { clip: { x: 0, y: 0, width: 1440, height: 90 } });
        await p.locator('#diretta').scrollIntoViewIfNeeded();
        await p.waitForTimeout(300);
        await scatta(p, 'webinar-sezione-computer');
        // gli errori si contano prima di uscire: la pagina /diretta/ non e' oggetto di questa prova
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await Promise.all([p.waitForURL(/\/diretta\/$/), p.click('#btnDiretta')]);
        vero(new URL(p.url()).pathname === '/diretta/', 'il pulsante porta davvero a /diretta/');
        await v.ctx.close();
    }

    console.log('\n[webinar: 10 dicembre ore 15.30, in onda (computer)]');
    {
        const v = await visitatore(COMPUTER, 'in_onda');
        const p = await v.scheda('2026-12-10T15:30:00+01:00');
        await p.goto(WEBINAR);
        await p.waitForFunction(() => document.documentElement.getAttribute('data-diretta') === 'in_onda', null, { timeout: 5000 }).catch(() => {});
        const s = await statoWebinar(p);
        vero(s.menu && s.pulsante, 'indicatore IN DIRETTA acceso nel menu e sul pulsante');
        vero(!s.pausaMenu && !s.pausaPulsante, 'niente "in pausa"');
        uguale(s.testoMenu, 'IN DIRETTA', 'in onda la voce di menu dice IN DIRETTA');
        uguale([s.html, s.letto], ['in_onda', 'in_onda'], 'condizione in <html data-diretta>, stato letto in data-diretta-stato');
        uguale(v.richieste.length, 1, 'una sola richiesta per pagina (non una per indicatore)');
        await inCima(p);
        await scatta(p, 'webinar-menu-computer-in-diretta', { clip: { x: 0, y: 0, width: 1440, height: 90 } });
        await p.locator('#diretta').scrollIntoViewIfNeeded();
        await p.waitForTimeout(300);
        await scatta(p, 'webinar-sezione-computer-in-diretta');
        await p.reload();
        await p.waitForTimeout(800);
        vero((await statoWebinar(p)).menu, 'ricaricando entro 60 s l\'indicatore resta acceso...');
        uguale(v.richieste.length, 1, '...senza nuove richieste (cache della sessione)');
        await v.ctx.close();
    }

    console.log('\n[webinar: 10 dicembre, ricontrollo ogni 60 secondi (in onda, pausa, fine)]');
    {
        const v = await visitatore(COMPUTER, 'programmato');
        const p = await v.scheda('2026-12-10T15:30:00+01:00'); // partenza in ritardo
        await p.goto(WEBINAR);
        await p.waitForTimeout(800);
        let s = await statoWebinar(p);
        vero(!s.menu && !s.pulsante && !s.pausaMenu && s.html === 'oggi' && s.letto === 'programmato', 'alle 15.30, ancora programmato: indicatori spenti');
        uguale(s.testoMenu, 'Diretta', 'la voce di menu dice Diretta');
        uguale(v.richieste.length, 1, 'una richiesta all\'apertura');
        v.stato = 'in_onda'; // il gestore preme "Vai in onda"
        await p.clock.runFor(30 * 1000);
        uguale(v.richieste.length, 1, 'dopo 30 s ancora nessun ricontrollo');
        await passa(p, 31 * 1000);
        s = await statoWebinar(p);
        vero(s.menu && s.pulsante, 'dopo 60 s l\'indicatore si accende da solo, senza ricaricare');
        uguale(v.richieste.length, 2, 'con una sola richiesta in piu\'');
        v.stato = 'pausa';
        await passa(p, MINUTO);
        s = await statoWebinar(p);
        vero(!s.menu && !s.pulsante && s.pausaMenu && s.pausaPulsante && s.html === 'pausa', 'in pausa: niente IN DIRETTA, "in pausa" nel menu e sul pulsante');
        uguale(s.testoMenu.toLowerCase(), 'diretta in pausa', 'la voce di menu dice "Diretta in pausa"');
        await inCima(p);
        await scatta(p, 'webinar-menu-computer-pausa', { clip: { x: 0, y: 0, width: 1440, height: 90 } });
        await p.locator('#diretta').scrollIntoViewIfNeeded();
        await p.waitForTimeout(300);
        await scatta(p, 'webinar-sezione-computer-pausa');
        v.stato = null; // il servizio non risponde bene
        await passa(p, MINUTO);
        s = await statoWebinar(p);
        uguale([s.html, s.letto, s.pausaPulsante], ['pausa', 'pausa', true], 'una lettura fallita non cambia quello che si vede');
        v.stato = 'in_onda';
        await passa(p, MINUTO);
        s = await statoWebinar(p);
        vero(s.menu && s.pulsante && !s.pausaMenu, 'si riprende: di nuovo IN DIRETTA');
        v.stato = 'terminato';
        await passa(p, MINUTO);
        s = await statoWebinar(p);
        vero(!s.menu && !s.pulsante && s.html === 'conclusa', 'a diretta terminata gli indicatori si spengono da soli');
        uguale([s.titolo, s.conclusa, s.voceMenu, s.pulsanteVisibile], ['Il webinar si è concluso', true, false, false],
            'e la sezione dice "Il webinar si è concluso", senza pulsante ne\' voce di menu');
        uguale(v.richieste.length, 6, 'una richiesta al minuto, non di piu\'');
        await passa(p, 3 * MINUTO);
        uguale(v.richieste.length, 6, 'letto "terminato", la lettura si chiude');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await v.ctx.close();
    }

    console.log('\n[webinar: si sfora oltre le 17.00, poi "Termina"]');
    {
        const v = await visitatore(COMPUTER, 'in_onda');
        const p = await v.scheda('2026-12-10T17:15:00+01:00');
        await p.goto(WEBINAR);
        await p.waitForTimeout(800);
        let s = await statoWebinar(p);
        vero(s.menu && s.pulsante && s.voceMenu && s.titolo === 'Segui il webinar in diretta', 'alle 17.15 ancora in onda: IN DIRETTA, pulsante e voce di menu restano');
        v.stato = 'terminato';
        await passa(p, MINUTO);
        s = await statoWebinar(p);
        uguale([s.html, s.titolo, s.voceMenu, s.pulsanteVisibile], ['conclusa', 'Il webinar si è concluso', false, false], 'a "Termina": il webinar si e\' concluso');
        await v.ctx.close();
    }

    console.log('\n[webinar: dopo la fine]');
    {
        const v = await visitatore(COMPUTER, 'terminato');
        const p = await v.scheda('2026-12-10T18:30:00+01:00');
        await p.goto(WEBINAR);
        await p.waitForTimeout(800);
        const s = await statoWebinar(p);
        uguale([s.html, s.titolo, s.conclusa, s.voceMenu, s.voceVisibile, s.pulsanteVisibile],
            ['conclusa', 'Il webinar si è concluso', true, false, false, false], 'alle 18.30: "Il webinar si è concluso", voce di menu e pulsante nascosti');
        const testo = await p.evaluate(() => document.getElementById('diretta').innerText.replace(/\s+/g, ' '));
        vero(/Grazie a tutti quelli che hanno seguito il webinar di giovedì 10 dicembre\./.test(testo) && /Per informazioni scrivi a info@nextgenerationbusiness\.it\./.test(testo),
            'un grazie e il contatto per informazioni');
        vero(!/Accedi alla diretta/.test(testo), 'nessun invito ad accedere');
        uguale(v.richieste.length, 1, 'una richiesta (si legge fino a 3 ore dopo la fine)');
        await p.clock.runFor(3 * MINUTO);
        uguale(v.richieste.length, 1, 'e poi basta: "terminato" chiude la lettura');
        vero(await senzaScorrimentoOrizzontale(p), 'niente scorrimento orizzontale');
        await inCima(p);
        await scatta(p, 'webinar-menu-computer-conclusa', { clip: { x: 0, y: 0, width: 1440, height: 90 } });
        await p.locator('#diretta').scrollIntoViewIfNeeded();
        await p.waitForTimeout(300);
        await scatta(p, 'webinar-sezione-computer-conclusa');
        await v.ctx.close();
    }
    for (const [quando, descrizione] of [['2026-12-10T20:30:00+01:00', 'alle 20.30 (oltre 3 ore dopo la fine), anche se il servizio dicesse in onda'],
        ['2026-12-11T10:00:00+01:00', 'l\'11 dicembre']]) {
        const v = await visitatore(COMPUTER, 'in_onda');
        const p = await v.scheda(quando);
        await p.goto(WEBINAR);
        await p.waitForTimeout(800);
        const s = await statoWebinar(p);
        await p.clock.runFor(2 * MINUTO);
        vero(s.html === 'conclusa' && s.titolo === 'Il webinar si è concluso' && !s.voceMenu && !s.menu && v.richieste.length === 0,
            descrizione + ': concluso, senza nessuna richiesta');
        await v.ctx.close();
    }

    console.log('\n[webinar: larghezze del menu esteso]');
    for (const stato of ['programmato', 'in_onda', 'pausa']) {
        for (const larghezza of [961, 1024, 1100, 1280, 1440, 1920]) {
            const v = await visitatore({ viewport: { width: larghezza, height: 800 } }, stato);
            const p = await v.scheda('2026-12-10T15:30:00+01:00');
            await p.goto(WEBINAR);
            await p.waitForFunction(s => document.documentElement.getAttribute('data-diretta-stato') === s, stato, { timeout: 5000 }).catch(() => {});
            const m = await menuWebinar(p);
            vero(!m.hamburger && m.voci === 5 && m.righe === 1 && !m.fuori && m.margine >= 20 && m.diretta && !m.pillola,
                larghezza + 'px, ' + stato + ': le 5 voci (con Diretta) su una riga, niente hamburger ne\' pillola, ' + m.margine + 'px di margine dal marchio');
            await v.ctx.close();
        }
    }

    /* Sopra i 960px il menu e' sempre su una riga: con la voce Diretta nella
       finestra dell'evento, senza dopo la fine (come prima della diretta). */
    console.log('\n[webinar: sopra i 960px, prima e dopo la fine]');
    for (const larghezza of [961, 1024, 1100, 1199]) {
        for (const [quando, stato, descrizione] of [['2026-12-10T18:30:00+01:00', 'terminato', 'alle 18.30 del 10 dicembre'], ['2026-12-11T10:00:00+01:00', 'in_onda', 'l\'11 dicembre']]) {
            const v = await visitatore({ viewport: { width: larghezza, height: 800 } }, stato);
            const p = await v.scheda(quando);
            await p.goto(WEBINAR);
            await p.waitForFunction(() => document.documentElement.getAttribute('data-diretta') === 'conclusa', null, { timeout: 5000 }).catch(() => {});
            const m = await menuWebinar(p);
            vero(!m.hamburger && m.voci === 4 && m.righe === 1 && !m.fuori && m.margine >= 20 && !m.diretta && !m.pillola,
                larghezza + 'px, ' + descrizione + ' (diretta conclusa): niente hamburger, le 4 voci su una riga senza Diretta, ' + m.margine + 'px dal marchio');
            if (larghezza === 1024 && stato === 'terminato') await scatta(p, 'webinar-menu-1024-conclusa', { clip: { x: 0, y: 0, width: 1024, height: 90 } });
            await v.ctx.close();
        }
        const v = await visitatore({ viewport: { width: larghezza, height: 800 } }, 'programmato');
        const p = await v.scheda('2026-12-05T10:00:00+01:00');
        await p.goto(WEBINAR);
        await p.waitForTimeout(800);
        const m = await menuWebinar(p);
        vero(!m.hamburger && m.voci === 5 && m.righe === 1 && !m.fuori && m.diretta && !m.pillola,
            larghezza + 'px, 5 dicembre (voce Diretta nel menu): le 5 voci su una riga, niente hamburger ne\' pillola');
        await v.ctx.close();
    }

    /* Fino a 960px (tablet) il menu e' a tendina: l'hamburger, con la pillola
       Diretta accanto nella barra; la voce del menu si vede solo a menu aperto. */
    console.log('\n[webinar: fino a 960px, menu a tendina con la pillola nella barra]');
    for (const larghezza of [960, 820, 768]) {
        const v = await visitatore({ viewport: { width: larghezza, height: 800 } }, 'in_onda');
        const p = await v.scheda('2026-12-10T15:30:00+01:00');
        await p.goto(WEBINAR);
        await p.waitForFunction(() => document.documentElement.getAttribute('data-diretta') === 'in_onda', null, { timeout: 5000 }).catch(() => {});
        const primo = await p.evaluate(() => [getComputedStyle(document.getElementById('navToggle')).display,
            (document.getElementById('navDirettaPillola').innerText || '').trim()]);
        const b = await barra(p);
        const chiusa = await p.locator('#navDiretta').isVisible();
        await p.click('#navToggle');
        await p.waitForTimeout(300);
        const aperta = await p.locator('#navDiretta').isVisible();
        uguale([primo, b.visibile && b.dentro && b.accanto && b.staccataDalMarchio, chiusa, aperta], [['flex', 'IN DIRETTA'], true, false, true],
            larghezza + 'px (tablet): hamburger con la pillola IN DIRETTA accanto, dentro lo schermo; la voce Diretta si vede solo a menu aperto');
        if (larghezza === 820) await scatta(p, 'webinar-menu-820-aperto');
        await v.ctx.close();
    }

    const scenari = [
        ['', '2026-12-05T10:00:00+01:00', 'programmato', 'DIRETTA'],
        ['-in-diretta', '2026-12-10T15:30:00+01:00', 'in_onda', 'IN DIRETTA'],
        ['-pausa', '2026-12-10T16:00:00+01:00', 'pausa', 'IN PAUSA']
    ];
    for (const [nome, quando, stato, scritta] of scenari) {
        console.log('\n[webinar: telefono, ' + stato + ']');
        const v = await visitatore(TELEFONO, stato);
        const p = await v.scheda(quando);
        await p.goto(WEBINAR);
        await p.waitForTimeout(900);
        const b = await barra(p);
        vero(b.visibile && b.fuoriDalMenu && b.menuChiuso && b.href === '/diretta/', 'a menu chiuso la pillola "Diretta" e\' nella barra, fuori dal menu a scomparsa, verso /diretta/');
        vero(b.accanto && b.staccataDalMarchio && b.dentro, 'accanto all\'hamburger, allineata, senza toccare il marchio');
        // innerText conta anche "Diretta" nascosto per i soli lettori di schermo in pausa
        vero(b.testo.endsWith(scritta), 'la pillola dice ' + scritta + ' (' + b.testo + ')');
        vero(b.tocco >= 48, 'area di tocco di almeno ' + b.tocco + 'px (pillola alta ' + b.altezza + 'px)');
        vero(!(await p.locator('#navDiretta').isVisible()), 'a menu chiuso la voce del menu non ingombra la barra');
        await inCima(p);
        await scatta(p, 'webinar-barra-telefono' + nome, { clip: { x: 0, y: 0, width: 390, height: 90 } });
        await p.tap('#navToggle');
        await p.waitForTimeout(300);
        const m = await p.evaluate(() => {
            const a = document.getElementById('navDiretta').getBoundingClientRect();
            const voci = Array.from(document.querySelectorAll('#navMenu > a'));
            const iscrizioni = voci.find(x => /Iscrizioni/.test(x.textContent)).getBoundingClientRect();
            return { visibile: a.width > 0 && a.height >= 40, dentro: a.left >= 0 && a.right <= window.innerWidth && a.bottom <= window.innerHeight,
                sotto: a.top >= iscrizioni.bottom, largo: a.width > window.innerWidth * 0.8, ultima: voci[voci.length - 1].id === 'navDiretta' };
        });
        vero(m.visibile && m.dentro, 'a menu aperto la voce Diretta si vede, grande, dentro lo schermo');
        vero(m.sotto && m.largo && m.ultima, 'pulsante largo quanto il menu, in fondo, sotto "Iscrizioni"');
        const s = await statoWebinar(p);
        vero(stato === 'in_onda' ? (s.menu && s.pulsante && s.pillola) : (!s.menu && !s.pulsante && !s.pillola),
            'indicatore IN DIRETTA ' + (stato === 'in_onda' ? 'acceso' : 'spento') + ' su menu, pillola e pulsante');
        vero(stato === 'pausa' ? (s.pausaMenu && s.pausaPulsante) : (!s.pausaMenu && !s.pausaPulsante), '"in pausa" ' + (stato === 'pausa' ? 'acceso' : 'spento'));
        await scatta(p, 'webinar-menu-telefono' + nome);
        await p.tap('#navToggle');
        await p.locator('#diretta').scrollIntoViewIfNeeded();
        await p.evaluate(() => window.scrollBy({ top: -70, behavior: 'instant' })); // sotto la barra fissa
        await p.waitForTimeout(300);
        await scatta(p, 'webinar-sezione-telefono' + nome);
        vero(await senzaScorrimentoOrizzontale(p), 'niente scorrimento orizzontale');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        if (stato === 'programmato') {
            await inCima(p);
            await Promise.all([p.waitForURL(/\/diretta\/$/), p.tap('#navDirettaPillola')]);
            vero(new URL(p.url()).pathname === '/diretta/', 'un tocco sulla pillola porta a /diretta/');
        }
        await v.ctx.close();
    }

    console.log('\n[webinar: telefono stretto (320px)]');
    for (const [stato, scritta] of [['in_onda', 'IN DIRETTA'], ['pausa', 'IN PAUSA']]) {
        const v = await visitatore(TELEFONO_STRETTO, stato);
        const p = await v.scheda('2026-12-10T16:00:00+01:00');
        await p.goto(WEBINAR);
        await p.waitForTimeout(900);
        const b = await barra(p);
        vero(b.visibile && b.accanto && b.staccataDalMarchio && b.dentro && b.testo.endsWith(scritta),
            '320px, ' + stato + ': marchio, pillola ' + scritta + ' e hamburger su una riga, senza sovrapporsi');
        vero(await senzaScorrimentoOrizzontale(p), '320px, ' + stato + ': niente scorrimento orizzontale');
        if (stato === 'pausa') await scatta(p, 'webinar-barra-telefono-320-pausa', { clip: { x: 0, y: 0, width: 320, height: 90 } });
        await v.ctx.close();
    }

    console.log('\n[webinar: telefono, dopo la fine]');
    {
        const v = await visitatore(TELEFONO, 'terminato');
        const p = await v.scheda('2026-12-10T18:30:00+01:00');
        await p.goto(WEBINAR);
        await p.waitForTimeout(900);
        const s = await statoWebinar(p);
        uguale([s.html, s.pillolaAccesa, s.pillolaVisibile, s.voceMenu, s.titolo], ['conclusa', false, false, false, 'Il webinar si è concluso'],
            'pillola accanto all\'hamburger e voce di menu nascoste, sezione "Il webinar si è concluso"');
        await inCima(p);
        await scatta(p, 'webinar-barra-telefono-conclusa', { clip: { x: 0, y: 0, width: 390, height: 90 } });
        await p.locator('#diretta').scrollIntoViewIfNeeded();
        await p.evaluate(() => window.scrollBy({ top: -70, behavior: 'instant' }));
        await p.waitForTimeout(300);
        await scatta(p, 'webinar-sezione-telefono-conclusa');
        vero(await senzaScorrimentoOrizzontale(p), 'niente scorrimento orizzontale');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await v.ctx.close();
    }
}

/* ---------- 3b. la pagina di Napoli, conclusa a mano ---------- */
/* Napoli non carica piu' diretta-stato.js (che ora descrive il webinar):
   <html data-diretta="conclusa"> e' scritto nel file, gli agganci restano
   nel markup con hidden e nessuno li tocca. Anche con il webinar in onda la
   pagina non mostra niente della diretta e non chiede lo stato. */
async function provaNapoliConclusa() {
    console.log('\n[Napoli, conclusa: nessun aggancio e nessuna richiesta, anche con il webinar in onda]');
    for (const [nome, opzioni] of [['computer-1100', { viewport: { width: 1100, height: 800 } }], ['telefono', TELEFONO]]) {
        const v = await visitatore(opzioni, 'in_onda');
        const p = await v.scheda('2026-12-10T15:30:00+01:00');
        await p.goto(NAPOLI);
        await passa(p, 2 * MINUTO);
        const s = await p.evaluate(() => {
            const vis = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
            const nav = document.getElementById('navDiretta');
            return {
                attributo: document.documentElement.getAttribute('data-diretta'),
                sezione: vis(document.getElementById('diretta')),
                voce: vis(nav && nav.closest('li')),
                pillola: vis(document.getElementById('navDirettaPillola')),
                hamburger: getComputedStyle(document.getElementById('navToggle')).display !== 'none',
                script: !!document.querySelector('script[src*="diretta-stato"]'),
                ngb: typeof window.NGBDiretta
            };
        });
        uguale([s.attributo, s.sezione, s.voce, s.pillola], ['conclusa', false, false, false],
            nome + ': <html data-diretta="conclusa"> scritto a mano, niente sezione "Segui la diretta", voce "Diretta" ne\' pillola');
        uguale([s.script, s.ngb], [false, 'undefined'], nome + ': diretta-stato.js non e\' caricato e window.NGBDiretta non esiste');
        uguale(v.richieste.length, 0, nome + ': nessuna richiesta allo stato in 2 minuti, con il webinar in onda');
        if (nome === 'telefono') vero(s.hamburger, 'telefono: l\'hamburger c\'e\', senza pillola accanto');
        else vero(!s.hamburger, '1100px: menu su una riga, niente hamburger (come prima della diretta)');
        vero(v.errori.length === 0, nome + ': nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await inCima(p);
        await scatta(p, 'napoli-conclusa-' + nome, { clip: { x: 0, y: 0, width: opzioni.viewport.width, height: 90 } });
        await v.ctx.close();
    }
}

/* ---------- 4. la diretta nascosta sul sito (PUBBLICA) e la controprova ---------- */
async function vistaWebinar(page) {
    return page.evaluate(() => {
        const vis = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
        return {
            attributo: document.documentElement.getAttribute('data-diretta'),
            sezione: vis(document.getElementById('diretta')),
            voce: vis(document.getElementById('navDiretta')),
            pillola: vis(document.getElementById('navDirettaPillola')),
            hamburger: getComputedStyle(document.getElementById('navToggle')).display !== 'none'
        };
    });
}
async function provaNascosta() {
    console.log('\n[la diretta nascosta sul sito: PUBBLICA = false]');
    // home, 5 dicembre (dentro la finestra): niente, come con la diretta accesa (l'evento e' su invito)
    const v1 = await visitatore(COMPUTER, 'programmato', { prova: false, pubblica: false });
    const h1 = await v1.scheda('2026-12-05T10:00:00+01:00');
    await h1.goto(HOME);
    await quiete(h1);
    const n1 = await h1.evaluate(() => ({ cond: window.NGBDiretta && window.NGBDiretta.condizione(), vis: window.NGBDiretta && window.NGBDiretta.visibile, pianificato: !!window.__dirPromoPlanned }));
    vero(n1.cond === 'nascosta' && n1.vis === false && !n1.pianificato, 'home: condizione "nascosta", il popup della diretta non si prenota');
    uguale([await nelDom(h1), (await pillola(h1)).presente, (await finestraMilano(h1)).aperta], [[], false, true],
        'home: nessun popup ne\' pillola della diretta (come con la diretta accesa: l\'evento e\' su invito), la finestra di Milano si apre');
    await scatta(h1, 'nascosta-home');
    // webinar, 10 dicembre alle 15.30, in onda: niente voce, pillola, sezione; nessuna richiesta
    const n2 = await v1.scheda('2026-12-10T15:30:00+01:00');
    await n2.goto(WEBINAR);
    await passa(n2, 2 * MINUTO);
    const s2 = await vistaWebinar(n2);
    vero(s2.attributo === 'nascosta' && !s2.sezione && !s2.voce && !s2.pillola,
        'webinar il 10 dicembre in onda: niente sezione "Segui il webinar in diretta", niente voce "Diretta" ne\' pillola nel menu', JSON.stringify(s2));
    uguale(v1.richieste.length, 0, 'nessuna richiesta allo stato della diretta, nemmeno il giorno dell\'evento in onda (2 minuti)');
    await inCima(n2);
    await scatta(n2, 'nascosta-webinar');
    // fino a 960px il menu e' a tendina: l'hamburger c'e', la pillola accanto no
    await n2.setViewportSize({ width: 960, height: 800 });
    await n2.waitForTimeout(200);
    const s2b = await vistaWebinar(n2);
    vero(s2b.hamburger && !s2b.pillola, 'webinar a 960px: menu a tendina con l\'hamburger, senza la pillola "Diretta" accanto');
    vero(v1.errori.length === 0, 'nessun errore nelle pagine' + (v1.errori.length ? ': ' + v1.errori.join(' | ') : ''));
    await v1.ctx.close();

    console.log('\n[?diretta=prova: la vede solo questo browser, finche\' non si chiede ?diretta=pubblico]');
    const v2 = await visitatore(COMPUTER, 'programmato', { prova: false, pubblica: false });
    const h2 = await v2.scheda('2026-12-05T10:00:00+01:00');
    await h2.goto(HOME + '?diretta=prova');
    await quiete(h2);
    uguale([await h2.evaluate(() => [window.NGBDiretta.visibile, window.NGBDiretta.fase()]), await nelDom(h2), (await pillola(h2)).presente, (await finestraMilano(h2)).aperta],
        [[true, 'prima'], [], false, true], 'home?diretta=prova: la diretta e\' visibile in prova (fase "prima"), ma in home niente popup ne\' pillola e la finestra di Milano si apre: l\'evento e\' su invito');
    vero(await h2.evaluate(() => localStorage.getItem('ngbDirettaProva') === '1'), 'il browser se lo ricorda (localStorage)');
    const n3 = await v2.scheda('2026-12-05T10:00:00+01:00');
    await n3.goto(WEBINAR);
    await passa(n3, 1000);
    const s3 = await vistaWebinar(n3);
    vero(s3.attributo === 'prima' && s3.sezione && s3.voce, 'poi il webinar senza parametro: sezione e voce "Diretta" visibili (in prova)', JSON.stringify(s3));
    const n4 = await v2.scheda('2026-12-05T10:00:00+01:00');
    await n4.goto(WEBINAR + '?diretta=pubblico');
    await passa(n4, 1000);
    const s4 = await vistaWebinar(n4);
    vero(s4.attributo === 'nascosta' && !s4.sezione && !s4.voce && !s4.pillola, 'webinar?diretta=pubblico: di nuovo come la vedono tutti (nascosta)', JSON.stringify(s4));
    vero(await n4.evaluate(() => localStorage.getItem('ngbDirettaProva') === null), 'e il browser non se lo ricorda piu\'');
    vero(v2.errori.length === 0, 'nessun errore nelle pagine' + (v2.errori.length ? ': ' + v2.errori.join(' | ') : ''));
    await v2.ctx.close();

    console.log('\n[PUBBLICA = true: tutto compare per tutti, senza prova]');
    const v3 = await visitatore(COMPUTER, 'programmato', { prova: false, pubblica: true });
    const h3 = await v3.scheda('2026-12-05T10:00:00+01:00');
    await h3.goto(HOME);
    await quiete(h3);
    uguale([await nelDom(h3), (await pillola(h3)).presente, (await finestraMilano(h3)).aperta, v3.richieste.length], [[], false, true, 0],
        'home: niente popup ne\' pillola nemmeno con la diretta accesa per tutti, la finestra di Milano si apre, nessuna richiesta');
    const n5 = await v3.scheda('2026-12-05T10:00:00+01:00');
    await n5.goto(WEBINAR);
    await passa(n5, 1000);
    const s5 = await vistaWebinar(n5);
    vero(s5.attributo === 'prima' && s5.sezione && s5.voce, 'webinar: sezione "Segui il webinar in diretta" e voce "Diretta" visibili', JSON.stringify(s5));
    vero(v3.errori.length === 0, 'nessun errore nelle pagine' + (v3.errori.length ? ': ' + v3.errori.join(' | ') : ''));
    await v3.ctx.close();

    /* La controprova: senza riservato il popup e la pillola della home
       tornerebbero, e la finestra di Milano cederebbe loro la precedenza.
       I controlli "niente in home" della sezione 2 non sono vuoti. */
    console.log('\n[controprova: diretta-stato.js servito con riservato: false]');
    const v4 = await visitatore(COMPUTER, null, { riservato: false });
    const h4 = await v4.scheda('2026-12-05T10:00:00+01:00');
    await h4.goto(HOME);
    vero(await aspettaPopup(h4, 'dirPromo'), 'senza riservato, il 5 dicembre il popup della diretta compare');
    const t4 = await h4.evaluate(() => ({ riservato: window.NGBDiretta.EVENTO.riservato, titolo: document.querySelector('#dirPromo h2').textContent, prenotato: window.__dirPromoPlanned === true }));
    uguale(t4, { riservato: false, titolo: 'Segui il webinar in diretta', prenotato: true }, 'con il titolo dei giorni prima e la prenotazione (window.__dirPromoPlanned)');
    const pl4 = await pillola(h4);
    const f4 = await finestraMilano(h4);
    uguale([pl4.visibile, pl4.testo, f4.presente, f4.vista], [true, 'Diretta Webinar 10 dicembre', false, '1'],
        'la pillola c\'e\' e la finestra di Milano cede la precedenza (si segna come vista): i controlli "niente in home" non sono vuoti');
    await scatta(h4, 'controprova-senza-riservato');
    vero(v4.errori.length === 0, 'nessun errore nelle pagine' + (v4.errori.length ? ': ' + v4.errori.join(' | ') : ''));
    await v4.ctx.close();
}
