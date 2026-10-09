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

   COSA DIMOSTRANO.
   1. NGBDiretta (assets/diretta-stato.js): fasi e finestre dell'evento
      nei minuti di confine, giorno di Roma calcolato con Intl anche
      per chi visita da un altro fuso, condizione() per ogni stato
      (compresi 'pausa', lo sforamento oltre la fine e il 'terminato'
      letto prima dell'inizio), orario leggibile, una sola richiesta in
      volo, cache di 60 secondi, lettura fallita = null, lettura chiusa
      dopo 'terminato'.
   2. Home (assets/diretta-popup.js e la pillola #dirPillola). Le novita'
      (bando-tipo Mimit e Cassazione 7134) non sono piu' una finestra
      all'entrata ma la sezione «Sotto la lente» della pagina, fra
      l'apertura e il video: il popup della diretta e' l'unico della home.
      - 20 settembre, fuori finestra: nessun popup (ne' della diretta ne'
        delle novita') ne' pillola, la sezione «Sotto la lente» c'e';
        nessuna richiesta; la pillola compare da sola quando si apre la
        finestra;
      - 26 settembre: compare il popup della diretta con i suoi testi
        (si entra con la propria email e la password ricevuta via email;
        "Non trovi l'email? Controlla nella cartella Spam o Promozioni..."),
        ed e' l'unico; ricaricando la pagina nella stessa sessione non
        ricompare; la pillola c'e', sotto il popup e sopra ogni contenuto;
        nessuna richiesta allo stato;
      - accessibilita': dialog modale, focus trap con Tab e Maiusc+Tab,
        ESC chiude, clic sullo sfondo chiude;
      - "Non mostrare più": in una nuova sessione (nuova scheda, stesso
        localStorage) non ricompare (e nessun altro popup), ma la pillola
        resta, in primo piano;
      - 2 ottobre alle 10 in onda: "Siamo in diretta: accedi" e
        l'indicatore IN DIRETTA nel popup e nella pillola, UNA
        richiesta; la pillola segue lo stato da sola ogni minuto; in
        pausa: "La diretta è in pausa" con l'orario di ripresa, niente
        IN DIRETTA; alle 8 "Oggi in diretta dalle 9.00"; alle 17.45 in
        onda oltre l'orario: niente popup ma pillola IN DIRETTA, che si
        spegne a "terminato"; alle 19 dopo la fine: niente popup, niente
        pillola, una richiesta e poi basta; alle 21: nessuna richiesta;
        diretta terminata in anticipo: non si prenota piu';
      - prefers-reduced-motion: niente animazioni ne' transizioni;
      - telefono: popup e pillola stanno nello schermo, niente
        scorrimento orizzontale; gli avvisi del sito (l'esito del modulo
        newsletter) passano sopra la pillola;
      - la finestra della diretta che si apre a sessione iniziata (25
        settembre, 8.58 -> 9.01): alle 8.58 nessun popup; alle 9.01 la
        pillola compare da sola e, tornando sulla home, il popup della
        diretta (il primo della sessione).
   3. Pagina di Napoli: voce "Diretta" nel menu subito prima di "Save
      the date" (anche su telefono, a menu aperto, e nel menu a tendina
      fino a 1199px), pillola "Diretta" accanto all'hamburger fuori dal
      menu a scomparsa (telefono e tablet, anche a 320px), sezione "Segui
      la diretta" dopo la hero con il pulsante verso /diretta/ e il testo
      sull'accesso (la propria email e la password ricevuta via email,
      Spam o Promozioni; nessun nome utente, nessuna data d'invio
      promessa; la frase dello spam anche nella conferma dell'iscrizione);
      l'indicatore IN DIRETTA solo in onda, "in pausa"
      in pausa, con ricontrollo ogni 60 s (una richiesta per pagina, non
      una per indicatore); dopo la fine "La diretta si è conclusa" e voce
      di menu e pillola nascoste, anche se si sfora e poi si termina;
      menu su una riga senza sovrapporsi al marchio da 1200px in su; fra
      1000 e 1199px menu a tendina finche' c'e' la voce Diretta, e di nuovo
      su una riga (come prima della diretta) dopo la fine.
   Screenshot in risultati/screenshot-sito/.
   Esce con 1 se qualcosa e' rosso.

   Rete: i video delle pagine (mp4 dalle release di GitHub, decine di
   MB) non passano da rete-prove.js, che li consegnerebbe al browser in
   un colpo solo facendolo cadere; il banner dei cookie (iubenda) e
   Google Analytics sono spenti: non c'entrano con queste prove e il
   banner coprirebbe i clic sullo sfondo del popup.
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
const NAPOLI = SITO + '/napoli_ottobre_2026/';
const SCREENSHOT = path.resolve(__dirname, 'risultati/screenshot-sito');
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const RADICE = path.resolve(__dirname, '../..');
fs.mkdirSync(SCREENSHOT, { recursive: true });

// il popup si apre a pagina carica + 900 ms; il giorno dell'evento aspetta
// lo stato al massimo altri 2,5 s: dopo questo tempo "non compare" e' certo
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
       browser, e diretta-stato.js servito con PUBBLICA forzata (sezione 4). */
async function visitatore(opzioni, stato, diretta) {
    const d = Object.assign({ prova: true }, diretta || {});
    const ctx = await browser.newContext(Object.assign({ locale: 'it-IT', timezoneId: 'Europe/Rome' }, opzioni || {}));
    const v = { ctx, richieste: [], stato: stato || null, ripresa: '' };
    await preparaContesto(ctx, {
        statoDiretta: url => {
            v.richieste.push(url);
            if (!v.stato) return { ok: false };
            const r = {
                ok: true, id: 'napoli-2026', titolo: 'Next Generation Business 2026 · Napoli', stato: v.stato,
                inizio: Date.parse('2026-10-02T09:00:00+02:00'), fine: Date.parse('2026-10-02T17:30:00+02:00'),
                paginaEvento: '/napoli_ottobre_2026/'
            };
            if (v.ripresa) r.ripresa = v.ripresa;
            return r;
        }
    });
    // registrata dopo: Playwright la prova per prima (vedi l'intestazione)
    await ctx.route(/\.mp4(\?|$)|cdn\.iubenda\.com|googletagmanager\.com/, r => r.abort());
    if (typeof d.pubblica === 'boolean') {
        const sorgente = fs.readFileSync(path.join(RADICE, 'assets/diretta-stato.js'), 'utf8')
            .replace(/var PUBBLICA = (true|false);/, 'var PUBBLICA = ' + d.pubblica + ';');
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

/* I popup della home: oggi solo quello della diretta (#dirPromo). Le
   novita' (bando-tipo Mimit e Cassazione 7134) sono nella sezione «Sotto
   la lente» della pagina: la vecchia finestra delle novita' (#novitaPromo)
   e i popup del bando e del FCD (#btPromo, #fcdPromo) non devono tornare,
   e le prove li cercano lo stesso. */
const POPUP = ['dirPromo', 'novitaPromo', 'btPromo', 'fcdPromo'];
async function aspettaPopup(page, id) {
    try {
        await page.waitForSelector('#' + id + '.is-open', { timeout: 9000 });
        await page.waitForTimeout(800); // fine della transizione di entrata (screenshot puliti)
        return true;
    } catch (e) { return false; }
}
async function popupPresenti(page) {
    return page.evaluate(ids => ids.filter(id => { const el = document.getElementById(id); return !!el && !el.hidden; }), POPUP);
}
async function nelDom(page) {
    return page.evaluate(ids => ids.filter(id => !!document.getElementById(id)), POPUP);
}
// la pagina carica e ferma per il tempo in cui un popup sarebbe comparso
async function quiete(page) {
    await page.waitForLoadState('load');
    await page.waitForTimeout(QUIETE_MS);
}
// la sezione «Sotto la lente»: i due approfondimenti, fra l'apertura e il video
async function sezioneLente(page) {
    return page.evaluate(() => {
        const s = document.getElementById('sotto-la-lente');
        if (!s) return false;
        const prima = s.previousElementSibling, dopo = s.nextElementSibling;
        const link = Array.from(s.querySelectorAll('.lente-scheda a.lente-cta')).map(a => a.getAttribute('href')).join(' ');
        return prima && prima.id === 'hero' && dopo && dopo.id === 'video'
            && link === '/bando_tipo_2026/ /cassazione_7134_2026/';
    });
}
async function chiudiPopup(page) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
}
async function scatta(page, nome, opz) {
    await page.screenshot(Object.assign({ path: path.join(SCREENSHOT, nome + '.png') }, opz || {}));
}
async function focusNelDialogo(page) {
    return page.evaluate(() => {
        const card = document.querySelector('#dirPromo .dirp-card');
        return !!card && card.contains(document.activeElement);
    });
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

// La pillola della home: se si vede, cosa dice, e chi sta davvero sopra il
// suo centro (lei, un popup o qualcos'altro della pagina).
async function pillola(page) {
    return page.evaluate(() => {
        const a = document.getElementById('dirPillola');
        if (!a) return { presente: false, visibile: false };
        const b = a.getBoundingClientRect();
        const visibile = !a.hidden && getComputedStyle(a).display !== 'none' && b.width > 0;
        const sopra = visibile ? document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) : null;
        return {
            presente: true,
            visibile,
            testo: a.textContent.replace(/\s+/g, ' ').trim(),
            stato: a.getAttribute('data-dirpl'),
            href: a.getAttribute('href'),
            rett: { sinistra: Math.round(b.left), destra: Math.round(b.right), alto: Math.round(b.top), basso: Math.round(b.bottom), altezza: Math.round(b.height) },
            finestra: { larghezza: window.innerWidth, altezza: window.innerHeight },
            chiSopra: !sopra ? '' : a.contains(sopra) ? 'pillola' : sopra.closest('#dirPromo') ? 'popup' : 'altro'
        };
    });
}

/* ============================================================ */
(async () => {
    const server = await accendiSito();
    browser = await chromium.launch(fs.existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
    try {
        await provaFile();
        await provaNGBDiretta();
        await provaHome();
        await provaNapoli();
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
    const apertura = home.indexOf('<section class="landing-split" id="hero"'), lente = home.indexOf('<section class="lente" id="sotto-la-lente"'),
        video = home.indexOf('<section class="video-home vc" id="video"');
    vero(apertura > 0 && lente > apertura && video > lente && /<script src="\/assets\/sotto-la-lente\.js(\?v=\w+)?" defer><\/script>/.test(home),
        'home: la sezione «Sotto la lente» sta fra l\'apertura e il video, con il suo script (defer)');
    const popup = fs.readFileSync(path.join(RADICE, 'assets/diretta-popup.js'), 'utf8');
    const stato = fs.readFileSync(path.join(RADICE, 'assets/diretta-stato.js'), 'utf8');
    uguale(popup.match(/\.innerHTML\s*=\s*[^;]+;/g) || [], ['.innerHTML = html;'], 'popup: innerHTML solo con il markup costante (i testi variabili con textContent)');
    uguale(stato.match(/\.innerHTML\s*=\s*[^;]+;/g) || [], ['.innerHTML = HTML_PILLOLA;'], 'pillola: innerHTML solo con il markup costante');
    // il commento di testa, senza gli asterischi e gli a capo
    const testa = stato.slice(0, stato.indexOf('(function')).replace(/\s*\n\s*\*\s*/g, ' ');
    vero(testa.includes('se cambi data o orario in Gestione, aggiorna anche qui; d\'inverno +01:00'),
        'diretta-stato.js: in cima l\'avviso "se cambi data o orario in Gestione, aggiorna anche qui; d\'inverno +01:00"');
    vero(/timeZone: FUSO/.test(stato) && /var FUSO = "Europe\/Rome"/.test(stato), 'diretta-stato.js: il giorno di Roma con Intl (timeZone Europe/Rome)');
    vero(/#dirPillola\{[^}]*z-index:9990;/.test(stato), 'pillola: z-index 9990, sotto gli avvisi del sito (9998-9999) e sopra la barra (1000)');
    const napoli = fs.readFileSync(path.join(RADICE, 'napoli_ottobre_2026/index.html'), 'utf8');
    vero(/styles\.css\?v=20/.test(napoli), 'Napoli: versione del foglio di stile aggiornata (?v=20, con la diretta nascosta)');
    vero(/<section class="diretta-fascia" id="diretta"[^>]*\bdata-diretta-pubblica hidden>/.test(napoli)
        && /id="navDirettaPillola" data-diretta-aperta hidden>/.test(napoli) && /<li data-diretta-aperta hidden><a href="\/diretta\/" class="nav-diretta"/.test(napoli),
        'Napoli: sezione della diretta e le due voci "Diretta" del menu scritte con hidden (nascoste finche\' diretta-stato.js non le mostra)');
    const robots = fs.readFileSync(path.join(RADICE, 'robots.txt'), 'utf8');
    vero(/^Disallow: \/diretta\/$/m.test(robots), 'robots.txt: Disallow: /diretta/');
    const pubblica = (/var PUBBLICA = (true|false);/.exec(stato) || [])[1];
    vero(pubblica === 'true' || pubblica === 'false', 'diretta-stato.js: l\'interruttore PUBBLICA c\'e\' (oggi: ' + pubblica + (pubblica === 'false' ? ', diretta nascosta sul sito' : ', diretta accesa sul sito') + ')');
    vero(/<script src="\/assets\/diretta-stato\.js(\?v=\w+)?" defer><\/script>\s*<\/body>/.test(napoli), 'Napoli: diretta-stato.js caricato in fondo alla pagina');
    // niente trattini lunghi nei testi scritti per la diretta
    const sezione = napoli.slice(napoli.indexOf('<!-- Segui la diretta'), napoli.indexOf('<!-- L\'Evento -->'));
    const barra = napoli.slice(napoli.indexOf('<nav class="navbar"'), napoli.indexOf('</nav>'));
    const lunghi = [['diretta-popup.js', popup], ['diretta-stato.js', stato], ['sezione di Napoli', sezione], ['barra di Napoli', barra]]
        .filter(([, t]) => /[–—]/.test(t)).map(([n]) => n);
    uguale(lunghi, [], 'nessun trattino lungo nei testi della diretta (popup, pillola, sezione e menu di Napoli)');
    // si entra con l'email: niente "nome utente" e nessuna data d'invio delle credenziali promessa
    const conNome = [['diretta-popup.js', popup], ['pagina di Napoli', napoli]].filter(([, t]) => /nome utente/i.test(t)).map(([n]) => n);
    uguale(conNome, [], 'nessun "nome utente" nel popup e nella pagina di Napoli');
    vero(!/nei giorni precedenti/i.test(napoli), 'Napoli: nessuna data d\'invio delle credenziali promessa («nei giorni precedenti»)');
    const conferma = napoli.slice(napoli.indexOf('<div id="formSuccess"'), napoli.indexOf('</div>', napoli.indexOf('class="success-detail"')));
    vero(/«Conferma il tuo indirizzo»/.test(conferma) && /Nella diretta si entra con la propria email e la password che riceverai via email\./.test(conferma)
        && /Non trovi l’email\? Controlla nella cartella Spam o Promozioni e segna il mittente come sicuro\./.test(conferma),
        'Napoli: la conferma dell\'iscrizione chiede di confermare l\'indirizzo, dice come si entra (email e password) e dove cercare l\'email (Spam o Promozioni)');
}

/* ---------- 1. NGBDiretta ---------- */
async function provaNGBDiretta() {
    console.log('\n[NGBDiretta: date, finestre, condizioni, cache]');
    const v = await visitatore(COMPUTER, 'programmato');
    const p = await v.scheda('2026-10-02T10:00:00+02:00');
    await p.goto(NAPOLI);
    const esiti = await p.evaluate(() => {
        const D = window.NGBDiretta;
        const f = s => D.fase(new Date(s));
        const g = s => D.eGiorno(new Date(s));
        const c = (s, stato) => D.condizione(stato ? { stato } : null, new Date(s));
        return {
            evento: D.EVENTO,
            servizio: D.SERVIZIO,
            fasi: [f('2026-09-20T10:00:00+02:00'), f('2026-09-25T08:59:59+02:00'), f('2026-09-25T09:00:00+02:00'),
                f('2026-10-01T23:59:59+02:00'), f('2026-10-02T00:00:00+02:00'), f('2026-10-02T17:29:59+02:00'),
                f('2026-10-02T17:30:00+02:00'), f('2026-10-03T10:00:00+02:00')],
            giorno: [g('2026-10-02T05:59:59+02:00'), g('2026-10-02T06:00:00+02:00'), g('2026-10-02T20:29:59+02:00'),
                g('2026-10-02T20:30:00+02:00')],
            // stesso istante scritto in UTC: il fuso del visitatore non conta
            utc: f('2026-10-01T22:00:00Z') + '/' + f('2026-10-01T21:59:59Z'),
            giorniRoma: [D.giornoRoma(Date.parse('2026-10-01T21:59:59Z')), D.giornoRoma(Date.parse('2026-10-01T22:00:00Z')),
                // d'inverno Roma e' a +01:00: la mezzanotte e' alle 23 UTC
                D.giornoRoma(Date.parse('2026-12-01T22:30:00Z')), D.giornoRoma(Date.parse('2026-12-01T23:00:00Z'))],
            condizioni: {
                'fuori': c('2026-09-20T10:00:00+02:00', 'in_onda'),
                'prima': c('2026-09-28T10:00:00+02:00'),
                'oggi 8.00, programmato': c('2026-10-02T08:00:00+02:00', 'programmato'),
                'oggi 8.00, terminato (una prova del gestore)': c('2026-10-02T08:00:00+02:00', 'terminato'),
                'oggi 8.30, gia\' in onda': c('2026-10-02T08:30:00+02:00', 'in_onda'),
                'oggi 10.00, lettura fallita': c('2026-10-02T10:00:00+02:00', null),
                'oggi 10.00, in onda': c('2026-10-02T10:00:00+02:00', 'in_onda'),
                'oggi 11.00, pausa': c('2026-10-02T11:00:00+02:00', 'pausa'),
                'oggi 16.00, terminato': c('2026-10-02T16:00:00+02:00', 'terminato'),
                '17.45, ancora in onda': c('2026-10-02T17:45:00+02:00', 'in_onda'),
                '17.45, in pausa': c('2026-10-02T17:45:00+02:00', 'pausa'),
                '17.45, programmato': c('2026-10-02T17:45:00+02:00', 'programmato'),
                '17.45, lettura fallita': c('2026-10-02T17:45:00+02:00', null),
                '20.30, ancora in onda': c('2026-10-02T20:30:00+02:00', 'in_onda'),
                '3 ottobre': c('2026-10-03T10:00:00+02:00', null)
            },
            orario: D.orario()
        };
    });
    uguale(esiti.evento.id + '|' + esiti.evento.citta + '|' + esiti.evento.mostraDaGiorni + '|' + esiti.evento.urlDiretta + '|' + esiti.evento.pagina,
        'napoli-2026|Napoli|7|/diretta/|/napoli_ottobre_2026/', 'EVENTO configurato in cima al file (id, citta\', giorni, indirizzi)');
    uguale(esiti.servizio, 'https://revilaw-email.vercel.app/api/diretta-stato', 'SERVIZIO: l\'endpoint pubblico con cache');
    uguale(esiti.fasi, ['fuori', 'fuori', 'prima', 'prima', 'oggi', 'oggi', 'dopo', 'dopo'],
        'fase(): fuori fino a 7 giorni prima delle 9.00, prima, oggi dalla mezzanotte di Roma, dopo dalle 17.30');
    uguale(esiti.giorno, [false, true, true, false], 'eGiorno(): lettura da 3 ore prima dell\'inizio a 3 ore dopo la fine prevista');
    uguale(esiti.utc, 'oggi/prima', 'il giorno dell\'evento comincia alla mezzanotte di Roma');
    uguale(esiti.giorniRoma, ['2026-10-01', '2026-10-02', '2026-12-01', '2026-12-02'], 'giornoRoma(): mezzanotte di Roma con l\'ora legale e d\'inverno (Intl)');
    uguale(esiti.condizioni, {
        'fuori': 'fuori',
        'prima': 'prima',
        'oggi 8.00, programmato': 'oggi',
        'oggi 8.00, terminato (una prova del gestore)': 'oggi',
        'oggi 8.30, gia\' in onda': 'in_onda',
        'oggi 10.00, lettura fallita': 'oggi',
        'oggi 10.00, in onda': 'in_onda',
        'oggi 11.00, pausa': 'pausa',
        'oggi 16.00, terminato': 'conclusa',
        '17.45, ancora in onda': 'in_onda',
        '17.45, in pausa': 'pausa',
        '17.45, programmato': 'conclusa',
        '17.45, lettura fallita': 'conclusa',
        '20.30, ancora in onda': 'conclusa',
        '3 ottobre': 'conclusa'
    }, 'condizione(): da orario e stato (pausa, sforamento, terminato prima dell\'inizio, 3 ore dopo la fine)');
    uguale(esiti.orario, { giorno: 'venerdì 2 ottobre 2026', inizio: '9.00', fine: '17.30', giornoBreve: '2 ottobre' }, 'orario() leggibile come nel resto del sito');

    await p.waitForTimeout(300);
    const primaDiLeggere = v.richieste.length;
    vero(primaDiLeggere === 1 && /\/api\/diretta-stato\?evento=napoli-2026$/.test(v.richieste[0]),
        'la pagina chiede lo stato una volta, con il solo parametro evento (' + v.richieste[0] + ')');
    // cinque letture insieme a cache vuota: una sola richiesta in volo
    const cinque = await p.evaluate(() => new Promise(ok => {
        sessionStorage.removeItem('ngbDirettaStato_napoli-2026');
        const risposte = [];
        for (let i = 0; i < 5; i++) window.NGBDiretta.leggi(d => { risposte.push(d && d.stato); if (risposte.length === 5) ok(risposte); });
    }));
    uguale(cinque, ['programmato', 'programmato', 'programmato', 'programmato', 'programmato'], 'cinque letture contemporanee ricevono tutte lo stato');
    uguale(v.richieste.length - primaDiLeggere, 1, 'cinque letture contemporanee = una sola richiesta in volo');
    const ancora = await p.evaluate(() => new Promise(ok => window.NGBDiretta.leggi(d => ok(d && d.stato))));
    uguale([ancora, v.richieste.length - primaDiLeggere], ['programmato', 1], 'una nuova lettura entro 60 s viene dalla cache (sessionStorage), senza rete');
    await p.clock.runFor(61 * 1000);
    let dopo = v.richieste.length;
    v.stato = null; // il servizio risponde { ok:false }
    const fallita = await p.evaluate(() => new Promise(ok => {
        sessionStorage.removeItem('ngbDirettaStato_napoli-2026');
        window.NGBDiretta.leggi(d => ok(d));
    }));
    uguale(fallita, null, 'risposta { ok:false } del servizio: cb(null)');
    vero(v.richieste.length === dopo + 1, 'anche la lettura fallita e\' una sola richiesta (e resta in cache: niente raffiche)');

    // 'pausa' con l'orario di ripresa: accettato e ripulito
    v.stato = 'pausa'; v.ripresa = '14:30';
    const pausa = await p.evaluate(() => new Promise(ok => {
        sessionStorage.removeItem('ngbDirettaStato_napoli-2026');
        window.NGBDiretta.leggi(d => ok(d && [d.stato, d.ripresa]));
    }));
    uguale(pausa, ['pausa', '14.30'], 'stato "pausa" accettato, con la ripresa scritta come nel sito (14.30)');
    v.ripresa = '<b>14</b>';
    const sporca = await p.evaluate(() => new Promise(ok => {
        sessionStorage.removeItem('ngbDirettaStato_napoli-2026');
        window.NGBDiretta.leggi(d => ok(d && d.ripresa));
    }));
    uguale(sporca, '', 'una ripresa che non e\' un orario si scarta');
    v.ripresa = '';

    // 'terminato' a evento cominciato chiude la lettura
    v.stato = 'terminato';
    await p.evaluate(() => new Promise(ok => {
        sessionStorage.removeItem('ngbDirettaStato_napoli-2026');
        window.NGBDiretta.leggi(() => ok());
    }));
    dopo = v.richieste.length;
    v.stato = 'in_onda';
    await p.clock.runFor(5 * MINUTO);
    const chiusa = await p.evaluate(() => new Promise(ok => window.NGBDiretta.leggi(d => ok(d && d.stato))));
    uguale([chiusa, v.richieste.length - dopo], ['terminato', 0], 'dopo "terminato" (letto alle 10) nessuna richiesta, nemmeno a cache scaduta');
    vero(v.errori.length === 0, 'nessun errore JavaScript nella pagina' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
    await v.ctx.close();

    // un visitatore da New York: il giorno dell'evento resta quello di Roma
    const ny = await visitatore(Object.assign({}, COMPUTER, { timezoneId: 'America/New_York' }), 'programmato');
    const q = await ny.scheda('2026-10-01T22:30:00Z'); // 18.30 a New York, 0.30 del 2 ottobre a Roma
    await q.goto(NAPOLI);
    const daNy = await q.evaluate(() => [new Date().getDate(), window.NGBDiretta.fase(), window.NGBDiretta.giornoRoma(Date.now())]);
    uguale(daNy, [1, 'oggi', '2026-10-02'], 'chi visita da New York il 1 ottobre alle 18.30 (0.30 a Roma) e\' gia\' nel giorno dell\'evento');
    await ny.ctx.close();
}

/* ---------- 2. la home ---------- */
async function provaHome() {
    console.log('\n[home: 20 settembre, fuori finestra]');
    {
        const v = await visitatore(COMPUTER);
        const p = await v.scheda('2026-09-20T10:00:00+02:00');
        await p.goto(HOME);
        await quiete(p);
        uguale(await nelDom(p), [], 'nessun popup: ne\' della diretta ne\' delle novita\'');
        vero(await sezioneLente(p), 'le novita\' sono nella pagina: la sezione «Sotto la lente», prima del video, con il bando-tipo e la Cassazione 7134');
        uguale(await p.evaluate(() => window.__dirPromoPlanned === undefined), true, 'il popup della diretta non si prenota');
        uguale((await pillola(p)).visibile, false, 'nessuna pillola della diretta');
        uguale(v.richieste.length, 0, 'nessuna richiesta allo stato della diretta');
        await v.ctx.close();
    }

    console.log('\n[home: la finestra si apre a pagina aperta]');
    {
        const v = await visitatore(COMPUTER);
        const p = await v.scheda('2026-09-25T08:59:20+02:00');
        await p.goto(HOME);
        await p.waitForTimeout(500);
        uguale((await pillola(p)).visibile, false, 'alle 8.59 del 25 settembre ancora niente pillola');
        await passa(p, MINUTO);
        const pl = await pillola(p);
        uguale([pl.visibile, pl.testo], [true, 'Diretta Napoli 2 ottobre'], 'dalle 9.00 (7 giorni prima) la pillola compare da sola, senza ricaricare');
        uguale(v.richieste.length, 0, 'senza nessuna richiesta allo stato');
        await v.ctx.close();
    }

    /* La finestra della diretta si apre il 25 settembre alle 9.00. Prima
       la home non apre nessun popup (le novita' sono nella pagina, nella
       sezione «Sotto la lente»): chi torna sulla home dopo le 9.00, nella
       stessa scheda, vede il popup della diretta, il primo della sessione. */
    console.log('\n[home: la finestra si apre a sessione iniziata]');
    {
        const v = await visitatore(COMPUTER);
        const p = await v.scheda('2026-09-25T08:58:00+02:00');
        await p.goto(HOME);
        await quiete(p);
        uguale([await nelDom(p), await p.evaluate(() => window.NGBDiretta.fase())], [[], 'fuori'], 'alle 8.58 del 25 settembre nessun popup, la finestra della diretta non e\' ancora aperta');
        uguale(await p.evaluate(() => sessionStorage.getItem('dirPromoSeen')), null, 'il popup della diretta non risulta visto');
        await passa(p, 3 * MINUTO);
        uguale((await pillola(p)).visibile, true, 'alle 9.01 la finestra si apre: compare la pillola');
        await p.reload();
        vero(await aspettaPopup(p, 'dirPromo'), 'tornando sulla home nella stessa sessione, a finestra aperta: compare il popup della diretta');
        uguale([await p.evaluate(() => window.NGBDiretta.fase()), await nelDom(p)], ['prima', ['dirPromo']], 'ed e\' l\'unico');
        await chiudiPopup(p);
        uguale((await pillola(p)).visibile, true, 'la pillola della diretta c\'e\'');
        const nuova = await v.scheda(); // nuova scheda = nuova sessione, stesso orologio
        await nuova.goto(HOME);
        vero(await aspettaPopup(nuova, 'dirPromo'), 'in una nuova sessione il popup della diretta compare');
        uguale(await nelDom(nuova), ['dirPromo'], 'e resta l\'unico');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await v.ctx.close();
    }

    console.log('\n[home: 26 settembre, nella finestra (computer)]');
    {
        const v = await visitatore(COMPUTER);
        const p = await v.scheda('2026-09-26T10:00:00+02:00');
        await p.goto(HOME);
        vero(await aspettaPopup(p, 'dirPromo'), 'compare il popup della diretta');
        await scatta(p, 'popup-home-computer-prima');
        const t = await p.evaluate(() => {
            const r = document.getElementById('dirPromo');
            const card = r.querySelector('.dirp-card');
            const q = s => r.querySelector(s);
            return {
                ruolo: card.getAttribute('role') + '|' + card.getAttribute('aria-modal') + '|' + card.getAttribute('aria-labelledby'),
                titoloId: q('h2').id,
                eyebrow: q('.dirp-eyebrow').textContent.trim(),
                titolo: q('h2').textContent,
                corpo: r.textContent.replace(/\s+/g, ' '),
                cta: q('.dirp-cta').getAttribute('href') + '|' + q('.dirp-cta').textContent.trim(),
                programma: q('.dirp-programma').getAttribute('href') + '|' + q('.dirp-programma').textContent.trim(),
                posta: (q('.dirp-info a[href^="mailto:"]') || {}).href || '',
                live: q('.dirp-live').hidden && getComputedStyle(q('.dirp-live')).display === 'none',
                pausa: q('.dirp-pausa').hidden && getComputedStyle(q('.dirp-pausa')).display === 'none',
                mai: q('[data-dirp-never]').textContent.trim(),
                chiudi: r.querySelectorAll('[data-dirp-close]').length,
                focus: document.activeElement === card,
                sessione: ['dirPromoSeen', 'btPromoSeen', 'fcdPromoSeen'].map(k => sessionStorage.getItem(k)).join(',')
            };
        });
        uguale(t.ruolo, 'dialog|true|dirPromoTitle', 'dialogo modale accessibile (role, aria-modal, aria-labelledby)');
        uguale(t.titoloId, 'dirPromoTitle', 'il titolo e\' quello indicato da aria-labelledby');
        uguale(t.eyebrow, 'Diretta Napoli · 2 ottobre 2026', 'occhiello "Diretta Napoli · 2 ottobre 2026"');
        uguale(t.titolo, 'Segui il convegno in diretta', 'titolo dei giorni prima');
        vero(/iscritti online entrano nella diretta con la propria email e la password ricevuta via email/.test(t.corpo),
            'spiega che gli iscritti online entrano con la propria email e la password ricevuta via email');
        vero(/Non trovi l’email\? Controlla nella cartella Spam o Promozioni e segna il mittente come sicuro, oppure scrivi a info@nextgenerationbusiness\.it/.test(t.corpo),
            '"Non trovi l’email? Controlla nella cartella Spam o Promozioni e segna il mittente come sicuro, oppure scrivi a info@nextgenerationbusiness.it"');
        vero(!/nome utente|credenziali/i.test(t.corpo + ' ' + t.sotto), 'nessun "nome utente" e nessuna "credenziali" nel popup');
        uguale(t.posta, 'mailto:info@nextgenerationbusiness.it', 'l\'indirizzo dell\'assistenza e\' un collegamento email');
        vero(/Venerdì 2 ottobre 2026, dalle 9\.00 alle 17\.30/.test(t.corpo), 'giorno e orario dell\'evento');
        uguale(t.cta, '/diretta/|Accedi alla diretta', 'pulsante "Accedi alla diretta" verso /diretta/');
        // chi e' iscritto in presenza e non potra' venire: una nuova iscrizione, per la diretta
        const presenza = await p.evaluate(() => {
            const li = document.querySelector('#dirPromo .dirp-presenza');
            const a = li && li.querySelector('a.dirp-iscriviti');
            return li ? { testo: li.textContent.replace(/\s+/g, ' ').trim(), href: a && a.getAttribute('href'), link: a && a.textContent, svg: !!li.querySelector('svg[aria-hidden="true"]') } : null;
        });
        uguale(presenza && presenza.testo, 'Iscritto in presenza ma non puoi venire? Iscriviti alla diretta, anche con la stessa email, e annulla il posto in sala da «Modifica o annulla» nella tua email.',
            'la riga per chi e\' iscritto in presenza: nuova iscrizione per la diretta, anche con la stessa email, e il posto in sala da annullare');
        uguale(presenza && [presenza.href, presenza.link, presenza.svg], ['/napoli_ottobre_2026/#accreditamento', 'Iscriviti alla diretta', true], '«Iscriviti alla diretta» porta al modulo della pagina di Napoli');
        uguale(t.programma, '/napoli_ottobre_2026/#programma|Programma dell’evento', 'collegamento secondario al programma dell\'evento');
        vero(t.live && t.pausa, 'nessun indicatore IN DIRETTA ne\' "In pausa" prima del giorno dell\'evento');
        uguale(t.mai, 'Non mostrare più', '"Non mostrare più" con l\'accento');
        vero(t.chiudi >= 3, 'chiusura da sfondo, X e "Chiudi"');
        vero(t.focus, 'all\'apertura il focus va sul dialogo');
        uguale(t.sessione, '1,1,1', 'all\'apertura segna come visti anche btPromoSeen e fcdPromoSeen (le chiavi dei vecchi popup dei bandi)');
        uguale(await nelDom(p), ['dirPromo'], 'nessun altro popup: le novita\' sono nella pagina');
        uguale(v.richieste.length, 0, 'nessuna richiesta allo stato fuori dal giorno dell\'evento');
        let pl = await pillola(p);
        uguale([pl.visibile, pl.chiSopra], [true, 'popup'], 'la pillola c\'e\', ma sotto il popup');

        // focus trap
        let dentro = true;
        for (let i = 0; i < 12; i++) { await p.keyboard.press('Tab'); dentro = dentro && await focusNelDialogo(p); }
        vero(dentro, 'Tab (12 volte) non esce mai dal dialogo');
        for (let i = 0; i < 12; i++) { await p.keyboard.press('Shift+Tab'); dentro = dentro && await focusNelDialogo(p); }
        vero(dentro, 'Maiusc+Tab (12 volte) non esce mai dal dialogo');
        const giro = await p.evaluate(() => {
            const f = Array.from(document.querySelectorAll('#dirPromo .dirp-card a[href], #dirPromo .dirp-card button:not([disabled])'));
            f[f.length - 1].focus();
            return f.length;
        });
        await p.keyboard.press('Tab');
        vero(await p.evaluate(() => document.activeElement.classList.contains('dirp-close')), 'dall\'ultimo elemento Tab torna al primo (' + giro + ' elementi)');
        await p.keyboard.press('Shift+Tab');
        vero(await p.evaluate(() => document.activeElement.hasAttribute('data-dirp-never')), 'dal primo Maiusc+Tab va all\'ultimo');

        await chiudiPopup(p);
        uguale(await popupPresenti(p), [], 'ESC chiude il popup');

        // la pillola: in basso a sinistra, sopra i contenuti della pagina
        pl = await pillola(p);
        uguale([pl.visibile, pl.testo, pl.href, pl.stato], [true, 'Diretta Napoli 2 ottobre', '/diretta/', 'prima'], 'pillola fissa "Diretta Napoli · 2 ottobre" verso /diretta/');
        vero(pl.rett.sinistra <= 24 && pl.finestra.altezza - pl.rett.basso <= 24, 'in basso a sinistra (' + pl.rett.sinistra + 'px dal bordo, ' + (pl.finestra.altezza - pl.rett.basso) + 'px dal fondo)');
        vero(pl.rett.altezza >= 44, 'alta almeno 44px, facile da toccare (' + pl.rett.altezza + 'px)');
        let sempreSopra = pl.chiSopra === 'pillola';
        for (const quota of [0.25, 0.5, 0.75, 1]) {
            await p.evaluate(q => window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * q, behavior: 'instant' }), quota);
            await p.waitForTimeout(150);
            sempreSopra = sempreSopra && (await pillola(p)).chiSopra === 'pillola';
        }
        vero(sempreSopra, 'resta sopra ogni contenuto scorrendo tutta la pagina');
        await inCima(p);
        await p.waitForTimeout(200);
        await scatta(p, 'pillola-home-computer-prima');

        await p.reload();
        await p.waitForLoadState('load');
        await p.waitForTimeout(QUIETE_MS);
        uguale(await nelDom(p), [], 'ricaricando nella stessa sessione: nessun popup (né diretta, né novità)');
        uguale((await pillola(p)).visibile, true, 'la pillola invece resta');
        uguale(v.richieste.length, 0, 'ancora nessuna richiesta allo stato');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await Promise.all([p.waitForURL(/\/diretta\/$/), p.click('#dirPillola')]);
        vero(new URL(p.url()).pathname === '/diretta/', 'la pillola porta davvero a /diretta/');
        await v.ctx.close();
    }

    console.log('\n[home: 26 settembre, clic sullo sfondo]');
    {
        const v = await visitatore(COMPUTER);
        const p = await v.scheda('2026-09-26T10:00:00+02:00');
        await p.goto(HOME);
        vero(await aspettaPopup(p, 'dirPromo'), 'compare il popup della diretta');
        await p.mouse.click(12, 12);
        await p.waitForTimeout(700);
        uguale(await popupPresenti(p), [], 'il clic sullo sfondo chiude il popup');
        await v.ctx.close();
    }

    console.log('\n[home: "Non mostrare più" e nuova sessione]');
    {
        const v = await visitatore(COMPUTER);
        const p = await v.scheda('2026-09-26T10:00:00+02:00');
        await p.goto(HOME);
        vero(await aspettaPopup(p, 'dirPromo'), 'compare il popup della diretta');
        await p.click('[data-dirp-never]');
        await p.waitForTimeout(700);
        uguale(await popupPresenti(p), [], '"Non mostrare più" chiude il popup');
        uguale(await p.evaluate(() => localStorage.getItem('dirPromoHidden_napoli-2026')), '1', 'la scelta resta in localStorage per questo evento');
        uguale((await pillola(p)).visibile, true, 'la pillola resta: "Non mostrare più" riguarda solo il popup');
        await p.close();
        const p2 = await v.scheda(); // nuova scheda = nuova sessione, stesso localStorage (orologio del contesto)
        await p2.goto(HOME);
        await quiete(p2);
        uguale(await nelDom(p2), [], 'nella nuova sessione il popup della diretta non ricompare (e nessun altro popup)');
        const pl = await pillola(p2);
        uguale([pl.visibile, pl.chiSopra], [true, 'pillola'], 'la pillola c\'e\' anche nella nuova sessione, in primo piano');
        await v.ctx.close();
    }

    console.log('\n[home: 2 ottobre ore 10, in onda (computer)]');
    {
        const v = await visitatore(COMPUTER, 'in_onda');
        const p = await v.scheda('2026-10-02T10:00:00+02:00');
        await p.goto(HOME);
        vero(await aspettaPopup(p, 'dirPromo'), 'compare il popup della diretta');
        await scatta(p, 'popup-home-computer-in-diretta');
        const t = await p.evaluate(() => {
            const r = document.getElementById('dirPromo');
            const live = r.querySelector('.dirp-live');
            return {
                titolo: r.querySelector('h2').textContent,
                live: !live.hidden && live.getBoundingClientRect().width > 0 ? live.textContent.trim() : '',
                eyebrow: r.querySelector('.dirp-eyebrow').hidden,
                pausa: r.querySelector('.dirp-pausa').hidden,
                stato: r.getAttribute('data-dirp-stato')
            };
        });
        uguale(t.titolo, 'Siamo in diretta: accedi', 'titolo "Siamo in diretta: accedi"');
        uguale(t.live, 'IN DIRETTA', 'indicatore rosso IN DIRETTA visibile');
        vero(await p.isVisible('#dirPromo .dirp-presenza a.dirp-iscriviti'), 'anche in onda c\'e\' «Iscriviti alla diretta» per chi era iscritto in presenza');
        vero(t.eyebrow && t.pausa, 'al posto dell\'occhiello (e niente "In pausa")');
        uguale(v.richieste.length, 1, 'una sola richiesta allo stato (popup e pillola insieme)');
        uguale(await nelDom(p), ['dirPromo'], 'nessun altro popup');
        await chiudiPopup(p);
        let pl = await pillola(p);
        uguale([pl.visibile, pl.testo, pl.stato, pl.chiSopra], [true, 'IN DIRETTA Napoli', 'in_onda', 'pillola'], 'la pillola dice IN DIRETTA');
        await scatta(p, 'pillola-home-computer-in-diretta', { clip: { x: 0, y: 900 - 140, width: 520, height: 140 } });
        // la pillola segue lo stato da sola, una richiesta al minuto
        v.stato = 'pausa';
        await passa(p, MINUTO);
        pl = await pillola(p);
        uguale([pl.testo, pl.stato], ['Diretta Napoli In pausa', 'pausa'], 'dopo un minuto, in pausa: "Diretta Napoli · In pausa", niente IN DIRETTA');
        uguale(v.richieste.length, 2, 'con una richiesta in piu\'');
        await scatta(p, 'pillola-home-computer-pausa', { clip: { x: 0, y: 900 - 140, width: 520, height: 140 } });
        v.stato = 'in_onda';
        await passa(p, MINUTO);
        uguale((await pillola(p)).stato, 'in_onda', 'si riprende: di nuovo IN DIRETTA');
        await p.reload();
        await p.waitForLoadState('load');
        await p.waitForTimeout(QUIETE_MS);
        uguale(await nelDom(p), [], 'ricaricando nella stessa sessione: nessun popup');
        uguale((await pillola(p)).stato, 'in_onda', 'e la pillola dice subito IN DIRETTA');
        uguale(v.richieste.length, 3, 'senza richieste in piu\' (cache della sessione)');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await v.ctx.close();
    }

    console.log('\n[home: 2 ottobre ore 11, in pausa]');
    {
        const v = await visitatore(COMPUTER, 'pausa');
        v.ripresa = '11:30';
        const p = await v.scheda('2026-10-02T11:00:00+02:00');
        await p.goto(HOME);
        vero(await aspettaPopup(p, 'dirPromo'), 'compare il popup della diretta');
        const t = await p.evaluate(() => {
            const r = document.getElementById('dirPromo');
            const vis = el => !el.hidden && el.getBoundingClientRect().width > 0;
            return {
                titolo: r.querySelector('h2').textContent,
                sotto: r.querySelector('.dirp-sub').textContent,
                pausa: vis(r.querySelector('.dirp-pausa')) ? r.querySelector('.dirp-pausa').textContent.trim() : '',
                live: vis(r.querySelector('.dirp-live')),
                stato: r.getAttribute('data-dirp-stato')
            };
        });
        uguale(t.titolo, 'La diretta è in pausa', 'titolo "La diretta è in pausa"');
        uguale(t.sotto, 'Il convegno di Napoli riprende alle 11.30 (ora italiana). Intanto puoi già entrare con la tua email e la password ricevuta via email.',
            'con l\'orario di ripresa, in ora italiana');
        uguale([t.pausa, t.live, t.stato], ['In pausa', false, 'pausa'], 'scritta "In pausa" e niente indicatore IN DIRETTA');
        await scatta(p, 'popup-home-computer-pausa');
        uguale(v.richieste.length, 1, 'una sola richiesta allo stato');
        await v.ctx.close();
    }

    console.log('\n[home: 2 ottobre ore 8, non ancora in onda]');
    {
        const v = await visitatore(COMPUTER, 'programmato');
        const p = await v.scheda('2026-10-02T08:00:00+02:00');
        await p.goto(HOME);
        vero(await aspettaPopup(p, 'dirPromo'), 'compare il popup della diretta');
        const t = await p.evaluate(() => ({
            titolo: document.querySelector('#dirPromo h2').textContent,
            live: document.querySelector('#dirPromo .dirp-live').hidden
        }));
        uguale(t.titolo, 'Oggi in diretta dalle 9.00', 'titolo "Oggi in diretta dalle 9.00"');
        vero(t.live, 'niente indicatore IN DIRETTA');
        await chiudiPopup(p);
        const pl = await pillola(p);
        uguale([pl.visibile, pl.testo, pl.stato], [true, 'Diretta Napoli oggi dalle 9.00', 'oggi'], 'pillola "Diretta Napoli · oggi dalle 9.00"');
        uguale(v.richieste.length, 1, 'una sola richiesta allo stato');
        await v.ctx.close();
    }

    console.log('\n[home: 2 ottobre ore 17.45, si sfora oltre la fine prevista]');
    {
        const v = await visitatore(COMPUTER, 'in_onda');
        const p = await v.scheda('2026-10-02T17:45:00+02:00');
        await p.goto(HOME);
        await quiete(p);
        uguale(await nelDom(p), [], 'il popup della diretta si e\' spento all\'orario previsto: nessun popup');
        let pl = await pillola(p);
        uguale([pl.visibile, pl.stato], [true, 'in_onda'], 'la pillola invece dice IN DIRETTA finche\' si e\' in onda');
        v.stato = 'terminato';
        await passa(p, MINUTO);
        pl = await pillola(p);
        uguale(pl.visibile, false, 'a "Termina" la pillola si spegne da sola');
        const n = v.richieste.length;
        await passa(p, 3 * MINUTO);
        uguale([n, v.richieste.length], [2, 2], 'due richieste in tutto, poi la lettura si chiude');
        await v.ctx.close();
    }

    console.log('\n[home: 2 ottobre ore 19, dopo la fine]');
    {
        const v = await visitatore(COMPUTER, 'terminato');
        const p = await v.scheda('2026-10-02T19:00:00+02:00');
        await p.goto(HOME);
        await quiete(p);
        uguale(await nelDom(p), [], 'nessun popup: quello della diretta si e\' spento da solo');
        vero(await sezioneLente(p), 'la sezione «Sotto la lente» c\'e\'');
        uguale((await pillola(p)).visibile, false, 'nessuna pillola');
        uguale(v.richieste.length, 1, 'una richiesta allo stato (si legge fino a 3 ore dopo la fine, se si sfora)');
        await passa(p, 3 * MINUTO);
        uguale(v.richieste.length, 1, 'letto "terminato", nessun\'altra richiesta');
        await v.ctx.close();
    }

    console.log('\n[home: 2 ottobre ore 21, oltre le 3 ore dopo la fine]');
    {
        const v = await visitatore(COMPUTER, 'in_onda');
        const p = await v.scheda('2026-10-02T21:00:00+02:00');
        await p.goto(HOME);
        await quiete(p);
        uguale(await nelDom(p), [], 'nessun popup');
        const pl = await pillola(p);
        uguale([pl.presente, pl.visibile], [false, false], 'nessuna pillola (non viene nemmeno costruita)');
        await passa(p, 2 * MINUTO);
        uguale(v.richieste.length, 0, 'nessuna richiesta allo stato');
        await v.ctx.close();
    }

    console.log('\n[home: 2 ottobre ore 16, diretta gia\' terminata]');
    {
        const v = await visitatore(COMPUTER, 'terminato');
        const p = await v.scheda('2026-10-02T16:00:00+02:00');
        await p.goto(HOME);
        await p.waitForLoadState('load');
        await p.waitForTimeout(QUIETE_MS);
        uguale(await popupPresenti(p), [], 'stato "terminato": il popup della diretta non si apre');
        uguale((await pillola(p)).visibile, false, 'e la pillola non c\'e\'');
        await p.reload();
        await quiete(p);
        uguale([await p.evaluate(() => window.__dirPromoPlanned === undefined), await nelDom(p)], [true, []],
            'alla pagina successiva la diretta non si prenota piu\': nessun popup');
        uguale(v.richieste.length, 1, 'una sola richiesta allo stato (la seconda pagina usa quello gia\' letto)');
        await v.ctx.close();
    }

    console.log('\n[home: prefers-reduced-motion]');
    {
        const v = await visitatore(Object.assign({ reducedMotion: 'reduce' }, COMPUTER), 'in_onda');
        const p = await v.scheda('2026-10-02T10:00:00+02:00');
        await p.goto(HOME);
        vero(await aspettaPopup(p, 'dirPromo'), 'compare il popup della diretta');
        const m = await p.evaluate(() => {
            const q = s => getComputedStyle(document.querySelector(s));
            return {
                punto: q('#dirPromo .dirp-live-dot').animationName,
                scheda: q('#dirPromo .dirp-card').transitionDuration,
                sfondo: q('#dirPromo .dirp-backdrop').transitionDuration,
                riflesso: getComputedStyle(document.querySelector('#dirPromo .dirp-cta'), '::after').animationName,
                pillola: q('#dirPillola').animationName,
                segno: q('#dirPillola .dirpl-segno').animationName
            };
        });
        uguale(m, { punto: 'none', scheda: '0s', sfondo: '0s', riflesso: 'none', pillola: 'none', segno: 'none' }, 'niente pulsazioni, riflessi ne\' transizioni (popup e pillola)');
        await chiudiPopup(p);
        uguale(await popupPresenti(p), [], 'si chiude anche senza transizioni');
        await v.ctx.close();
    }

    for (const [nome, quando, stato] of [['prima', '2026-09-26T10:00:00+02:00', null], ['in-diretta', '2026-10-02T10:00:00+02:00', 'in_onda']]) {
        console.log('\n[home: telefono, ' + nome + ']');
        const v = await visitatore(TELEFONO, stato);
        const p = await v.scheda(quando);
        await p.goto(HOME);
        vero(await aspettaPopup(p, 'dirPromo'), 'compare il popup della diretta');
        await scatta(p, 'popup-home-telefono-' + nome);
        const r = await p.evaluate(() => {
            const b = document.querySelector('#dirPromo .dirp-card').getBoundingClientRect();
            return { dentro: b.left >= 0 && b.right <= window.innerWidth && b.top >= 0 && b.bottom <= window.innerHeight, titolo: document.querySelector('#dirPromo h2').textContent };
        });
        vero(r.dentro, 'il riquadro sta tutto nello schermo del telefono');
        vero(await senzaScorrimentoOrizzontale(p), 'niente scorrimento orizzontale');
        const cta = await p.evaluate(() => {
            const b = document.querySelector('#dirPromo .dirp-cta').getBoundingClientRect();
            const c = document.querySelector('#dirPromo .dirp-card').getBoundingClientRect();
            const riga = document.querySelector('#dirPromo .dirp-presenza').getBoundingClientRect();
            return { visibile: b.top >= c.top && b.bottom <= c.bottom && b.bottom <= window.innerHeight, basso: Math.round(b.bottom), schermo: window.innerHeight, riga: riga.height > 0 && riga.top >= b.bottom };
        });
        vero(cta.visibile && cta.riga, 'la riga per chi e\' in presenza sta sotto i pulsanti: «Accedi alla diretta» resta visibile senza scorrere (fondo a ' + cta.basso + ' px su ' + cta.schermo + ')');
        uguale(r.titolo, stato ? 'Siamo in diretta: accedi' : 'Segui il convegno in diretta', 'titolo giusto');
        await p.tap('#dirPromo .dirp-close');
        await p.waitForTimeout(700);
        uguale(await popupPresenti(p), [], 'la X chiude il popup');
        const pl = await pillola(p);
        vero(pl.visibile && pl.chiSopra === 'pillola' && pl.rett.sinistra >= 12 && pl.rett.destra <= pl.finestra.larghezza - 12 &&
            pl.rett.basso <= pl.finestra.altezza - 12 && pl.rett.altezza >= 44,
            'la pillola sta nello schermo, in primo piano, alta ' + (pl.rett && pl.rett.altezza) + 'px (' + pl.testo + ')');
        vero(await senzaScorrimentoOrizzontale(p), 'e non fa scorrere la pagina di lato');
        await scatta(p, 'pillola-home-telefono-' + nome);
        /* Gli avvisi del sito passano sopra la pillola: sul telefono l'esito
           del modulo newsletter (showNgbNotification di script.js, in basso
           a destra, largo quasi tutto lo schermo) le si sovrappone, e deve
           leggersi intero. */
        const avv = await p.evaluate(() => {
            showNgbNotification('Errore di connessione. Riprova o scrivici a info@nextgenerationbusiness.it', 'error');
            const n = document.querySelector('.ngb-notification').getBoundingClientRect();
            const a = document.getElementById('dirPillola').getBoundingClientRect();
            const x1 = Math.max(n.left, a.left), x2 = Math.min(n.right, a.right), y1 = Math.max(n.top, a.top), y2 = Math.min(n.bottom, a.bottom);
            if (x2 <= x1 || y2 <= y1) return { sovrapposti: false };
            const sopra = document.elementFromPoint((x1 + x2) / 2, (y1 + y2) / 2);
            return { sovrapposti: true, larghezza: Math.round(x2 - x1), avviso: !!(sopra && sopra.closest('.ngb-notification')) };
        });
        vero(avv.sovrapposti && avv.avviso, 'l\'avviso del modulo newsletter si sovrappone alla pillola (' + (avv.larghezza || 0) + 'px) e le passa sopra');
        await p.waitForTimeout(450); // fine della comparsa dell'avviso (foto nitida)
        await scatta(p, 'pillola-home-telefono-avviso-' + nome);
        await p.evaluate(() => { const n = document.querySelector('.ngb-notification'); if (n) n.remove(); });
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await v.ctx.close();
    }

    /* Un telefono da 360 px (Android): la riga per chi e' in presenza non deve
       spingere «Accedi alla diretta» fuori dallo schermo. Poi il tocco su
       «Iscriviti alla diretta» porta al modulo della pagina di Napoli. */
    console.log('\n[home: telefono da 360 px, «Iscriviti alla diretta»]');
    {
        const v = await visitatore({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, null);
        const p = await v.scheda('2026-09-26T10:00:00+02:00');
        await p.goto(HOME);
        vero(await aspettaPopup(p, 'dirPromo'), 'compare il popup della diretta');
        await scatta(p, 'popup-home-telefono-360');
        const m = await p.evaluate(() => {
            const b = document.querySelector('#dirPromo .dirp-cta').getBoundingClientRect();
            const c = document.querySelector('#dirPromo .dirp-card').getBoundingClientRect();
            return { visibile: b.bottom <= c.bottom && b.bottom <= window.innerHeight, basso: Math.round(b.bottom), schermo: window.innerHeight, dentro: c.left >= 0 && c.right <= window.innerWidth };
        });
        vero(m.dentro && m.visibile, '360 px: il riquadro sta nello schermo e «Accedi alla diretta» si vede senza scorrere (fondo a ' + m.basso + ' px su ' + m.schermo + ')');
        vero(await senzaScorrimentoOrizzontale(p), 'niente scorrimento orizzontale');
        await p.tap('#dirPromo a.dirp-iscriviti');
        await p.waitForURL(/\/napoli_ottobre_2026\/#accreditamento$/, { timeout: 15000 });
        await p.waitForLoadState('load');
        vero(await p.locator('#accreditamento').count() === 1, '«Iscriviti alla diretta» apre la pagina di Napoli sul modulo (#accreditamento)');
        uguale(await p.evaluate(() => sessionStorage.getItem('dirPromoSeen')), '1', 'e il popup conta come visto');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await v.ctx.close();
    }
}

/* ---------- 3. la pagina di Napoli ---------- */
async function statoNapoli(page) {
    return page.evaluate(() => {
        const vis = el => !!el && !el.hidden && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none' &&
            !el.closest('[hidden]');
        const nav = document.getElementById('navDiretta');
        const btn = document.getElementById('btnDirettaNapoli');
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
            voceMenu: !nav.closest('li').hidden,
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

async function provaNapoli() {
    console.log('\n[Napoli: 26 settembre (computer)]');
    {
        const v = await visitatore(COMPUTER, 'programmato');
        const p = await v.scheda('2026-09-26T10:00:00+02:00');
        await p.goto(NAPOLI);
        await p.waitForTimeout(600);
        const s = await p.evaluate(() => {
            const nav = document.getElementById('navDiretta');
            const li = nav && nav.closest('li');
            const sez = document.getElementById('diretta');
            const btn = document.getElementById('btnDirettaNapoli');
            const vis = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
            return {
                // innerText: solo quello che si vede (l'indicatore spento non conta)
                nav: nav ? nav.getAttribute('href') + '|' + nav.className + '|' + nav.innerText.replace(/\s+/g, ' ').trim() : '',
                navVisibile: nav ? vis(nav) : false,
                primaDiSave: !!(li && li.nextElementSibling && li.nextElementSibling.querySelector('a.nav-cta') &&
                    /Save the date/i.test(li.nextElementSibling.textContent)),
                pillolaTelefono: getComputedStyle(document.getElementById('navDirettaPillola')).display,
                sezione: sez ? sez.tagName + '|' + (sez.previousElementSibling && sez.previousElementSibling.id) + '|' + (sez.nextElementSibling && sez.nextElementSibling.id) : '',
                titolo: sez ? sez.querySelector('h2').innerText.trim() : '',
                testo: sez ? sez.innerText.replace(/\s+/g, ' ') : '',
                posta: sez ? Array.from(sez.querySelectorAll('.diretta-note a[href^="mailto:"]')).map(a => a.getAttribute('href')) : [],
                btn: btn ? btn.getAttribute('href') + '|' + btn.querySelector('.btn-diretta-testo').textContent.trim() + '|' + sez.contains(btn) : '',
                btnVisibile: btn ? vis(btn) : false,
                indicatori: document.querySelectorAll('.indicatore-live').length,
                pause: document.querySelectorAll('.indicatore-pausa').length,
                nascosti: Array.from(document.querySelectorAll('.indicatore-live, .indicatore-pausa')).every(el => el.hidden && getComputedStyle(el).display === 'none')
            };
        });
        uguale(s.nav, '/diretta/|nav-diretta|Diretta', 'voce di menu "Diretta" verso /diretta/ (a.nav-diretta#navDiretta)');
        vero(s.navVisibile, 'la voce Diretta si vede nel menu esteso');
        vero(s.primaDiSave, 'la voce Diretta sta subito prima di "Save the date"');
        uguale(s.pillolaTelefono, 'none', 'col menu esteso la pillola accanto all\'hamburger non serve (nascosta)');
        uguale(s.sezione, 'SECTION|hero|evento', 'sezione #diretta subito dopo la hero e prima di #evento');
        uguale(s.titolo, 'Segui la diretta', 'titolo "Segui la diretta"');
        vero(/Gli iscritti online entrano con la propria email e la password ricevuta via email/.test(s.testo),
            'il testo spiega che gli iscritti online entrano con la propria email e la password ricevuta via email');
        vero(/Non trovi l’email con la password\? Controlla nella cartella Spam o Promozioni e segna il mittente come sicuro, oppure scrivi a info@nextgenerationbusiness\.it/.test(s.testo),
            '"Non trovi l’email con la password? Controlla nella cartella Spam o Promozioni e segna il mittente come sicuro, oppure scrivi a info@nextgenerationbusiness.it"');
        vero(!/nome utente|nei giorni precedenti/i.test(s.testo), 'nessun "nome utente" e nessuna data d\'invio promessa nella sezione');
        uguale(s.posta, ['mailto:info@nextgenerationbusiness.it'], 'l\'indirizzo dell\'assistenza e\' un collegamento email');
        vero(!/si è conclusa/.test(s.testo), 'nessuna traccia del testo di fine diretta');
        uguale(s.btn, '/diretta/|Accedi alla diretta|true', 'pulsante #btnDirettaNapoli "Accedi alla diretta" verso /diretta/');
        vero(s.btnVisibile, 'il pulsante si vede');
        uguale([s.indicatori, s.pause], [3, 3], 'tre indicatori IN DIRETTA e tre "in pausa": nel menu, sulla pillola e sul pulsante');
        vero(s.nascosti, 'indicatori spenti fuori dal giorno dell\'evento');
        uguale(await p.evaluate(() => document.documentElement.getAttribute('data-diretta')), 'prima', '<html data-diretta="prima">');
        uguale(v.richieste.length, 0, 'nessuna richiesta allo stato fuori dal giorno dell\'evento');
        await p.clock.runFor(3 * MINUTO);
        uguale(v.richieste.length, 0, 'nemmeno dopo tre minuti di pagina aperta');
        vero(await senzaScorrimentoOrizzontale(p), 'niente scorrimento orizzontale');
        await inCima(p);
        await scatta(p, 'napoli-menu-computer', { clip: { x: 0, y: 0, width: 1440, height: 90 } });
        await p.locator('#diretta').scrollIntoViewIfNeeded();
        await p.waitForTimeout(300);
        await scatta(p, 'napoli-sezione-computer');
        // gli errori si contano prima di uscire: la pagina /diretta/ non e' oggetto di questa prova
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await Promise.all([p.waitForURL(/\/diretta\/$/), p.click('#btnDirettaNapoli')]);
        vero(new URL(p.url()).pathname === '/diretta/', 'il pulsante porta davvero a /diretta/');
        await v.ctx.close();
    }

    console.log('\n[Napoli: 2 ottobre ore 10, in onda (computer)]');
    {
        const v = await visitatore(COMPUTER, 'in_onda');
        const p = await v.scheda('2026-10-02T10:00:00+02:00');
        await p.goto(NAPOLI);
        await p.waitForFunction(() => document.documentElement.getAttribute('data-diretta') === 'in_onda', null, { timeout: 5000 }).catch(() => {});
        const s = await statoNapoli(p);
        vero(s.menu && s.pulsante, 'indicatore IN DIRETTA acceso nel menu e sul pulsante');
        vero(!s.pausaMenu && !s.pausaPulsante, 'niente "in pausa"');
        uguale(s.testoMenu, 'IN DIRETTA', 'in onda la voce di menu dice IN DIRETTA');
        uguale([s.html, s.letto], ['in_onda', 'in_onda'], 'condizione in <html data-diretta>, stato letto in data-diretta-stato');
        uguale(v.richieste.length, 1, 'una sola richiesta per pagina (non una per indicatore)');
        await inCima(p);
        await scatta(p, 'napoli-menu-computer-in-diretta', { clip: { x: 0, y: 0, width: 1440, height: 90 } });
        await p.locator('#diretta').scrollIntoViewIfNeeded();
        await p.waitForTimeout(300);
        await scatta(p, 'napoli-sezione-computer-in-diretta');
        await p.reload();
        await p.waitForTimeout(800);
        vero((await statoNapoli(p)).menu, 'ricaricando entro 60 s l\'indicatore resta acceso...');
        uguale(v.richieste.length, 1, '...senza nuove richieste (cache della sessione)');
        await v.ctx.close();
    }

    console.log('\n[Napoli: 2 ottobre, ricontrollo ogni 60 secondi (in onda, pausa, fine)]');
    {
        const v = await visitatore(COMPUTER, 'programmato');
        const p = await v.scheda('2026-10-02T10:00:00+02:00'); // partenza in ritardo
        await p.goto(NAPOLI);
        await p.waitForTimeout(800);
        let s = await statoNapoli(p);
        vero(!s.menu && !s.pulsante && !s.pausaMenu && s.html === 'oggi' && s.letto === 'programmato', 'alle 10, ancora programmato: indicatori spenti');
        uguale(s.testoMenu, 'Diretta', 'la voce di menu dice Diretta');
        uguale(v.richieste.length, 1, 'una richiesta all\'apertura');
        v.stato = 'in_onda'; // il gestore preme "Vai in onda"
        await p.clock.runFor(30 * 1000);
        uguale(v.richieste.length, 1, 'dopo 30 s ancora nessun ricontrollo');
        await passa(p, 31 * 1000);
        s = await statoNapoli(p);
        vero(s.menu && s.pulsante, 'dopo 60 s l\'indicatore si accende da solo, senza ricaricare');
        uguale(v.richieste.length, 2, 'con una sola richiesta in piu\'');
        v.stato = 'pausa';
        await passa(p, MINUTO);
        s = await statoNapoli(p);
        vero(!s.menu && !s.pulsante && s.pausaMenu && s.pausaPulsante && s.html === 'pausa', 'in pausa: niente IN DIRETTA, "in pausa" nel menu e sul pulsante');
        uguale(s.testoMenu.toLowerCase(), 'diretta in pausa', 'la voce di menu dice "Diretta in pausa"');
        await inCima(p);
        await scatta(p, 'napoli-menu-computer-pausa', { clip: { x: 0, y: 0, width: 1440, height: 90 } });
        await p.locator('#diretta').scrollIntoViewIfNeeded();
        await p.waitForTimeout(300);
        await scatta(p, 'napoli-sezione-computer-pausa');
        v.stato = null; // il servizio non risponde bene
        await passa(p, MINUTO);
        s = await statoNapoli(p);
        uguale([s.html, s.letto, s.pausaPulsante], ['pausa', 'pausa', true], 'una lettura fallita non cambia quello che si vede');
        v.stato = 'in_onda';
        await passa(p, MINUTO);
        s = await statoNapoli(p);
        vero(s.menu && s.pulsante && !s.pausaMenu, 'si riprende: di nuovo IN DIRETTA');
        v.stato = 'terminato';
        await passa(p, MINUTO);
        s = await statoNapoli(p);
        vero(!s.menu && !s.pulsante && s.html === 'conclusa', 'a diretta terminata gli indicatori si spengono da soli');
        uguale([s.titolo, s.conclusa, s.voceMenu, s.pulsanteVisibile], ['La diretta si è conclusa', true, false, false],
            'e la sezione dice "La diretta si è conclusa", senza pulsante ne\' voce di menu');
        uguale(v.richieste.length, 6, 'una richiesta al minuto, non di piu\'');
        await passa(p, 3 * MINUTO);
        uguale(v.richieste.length, 6, 'letto "terminato", la lettura si chiude');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await v.ctx.close();
    }

    console.log('\n[Napoli: si sfora oltre le 17.30, poi "Termina"]');
    {
        const v = await visitatore(COMPUTER, 'in_onda');
        const p = await v.scheda('2026-10-02T17:45:00+02:00');
        await p.goto(NAPOLI);
        await p.waitForTimeout(800);
        let s = await statoNapoli(p);
        vero(s.menu && s.pulsante && s.voceMenu && s.titolo === 'Segui la diretta', 'alle 17.45 ancora in onda: IN DIRETTA, pulsante e voce di menu restano');
        v.stato = 'terminato';
        await passa(p, MINUTO);
        s = await statoNapoli(p);
        uguale([s.html, s.titolo, s.voceMenu, s.pulsanteVisibile], ['conclusa', 'La diretta si è conclusa', false, false], 'a "Termina": la diretta si e\' conclusa');
        await v.ctx.close();
    }

    console.log('\n[Napoli: dopo la fine]');
    {
        const v = await visitatore(COMPUTER, 'terminato');
        const p = await v.scheda('2026-10-02T19:00:00+02:00');
        await p.goto(NAPOLI);
        await p.waitForTimeout(800);
        const s = await statoNapoli(p);
        uguale([s.html, s.titolo, s.conclusa, s.voceMenu, s.voceVisibile, s.pulsanteVisibile],
            ['conclusa', 'La diretta si è conclusa', true, false, false, false], 'alle 19: "La diretta si è conclusa", voce di menu e pulsante nascosti');
        const testo = await p.evaluate(() => document.getElementById('diretta').innerText.replace(/\s+/g, ' '));
        vero(/Grazie a tutti quelli che hanno seguito online il convegno/.test(testo) && /scrivi a info@nextgenerationbusiness\.it/.test(testo), 'un grazie e il contatto per informazioni');
        vero(!/Accedi alla diretta/.test(testo), 'nessun invito ad accedere');
        uguale(v.richieste.length, 1, 'una richiesta (si legge fino a 3 ore dopo la fine)');
        await p.clock.runFor(3 * MINUTO);
        uguale(v.richieste.length, 1, 'e poi basta: "terminato" chiude la lettura');
        vero(await senzaScorrimentoOrizzontale(p), 'niente scorrimento orizzontale');
        await inCima(p);
        await scatta(p, 'napoli-menu-computer-conclusa', { clip: { x: 0, y: 0, width: 1440, height: 90 } });
        await p.locator('#diretta').scrollIntoViewIfNeeded();
        await p.waitForTimeout(300);
        await scatta(p, 'napoli-sezione-computer-conclusa');
        await v.ctx.close();
    }
    for (const [quando, descrizione] of [['2026-10-02T20:45:00+02:00', 'alle 20.45 (oltre 3 ore dopo la fine), anche se il servizio dicesse in onda'],
        ['2026-10-03T10:00:00+02:00', 'il 3 ottobre']]) {
        const v = await visitatore(COMPUTER, 'in_onda');
        const p = await v.scheda(quando);
        await p.goto(NAPOLI);
        await p.waitForTimeout(800);
        const s = await statoNapoli(p);
        await p.clock.runFor(2 * MINUTO);
        vero(s.html === 'conclusa' && s.titolo === 'La diretta si è conclusa' && !s.voceMenu && !s.menu && v.richieste.length === 0,
            descrizione + ': conclusa, senza nessuna richiesta');
        await v.ctx.close();
    }

    console.log('\n[Napoli: larghezze del menu esteso]');
    for (const stato of ['programmato', 'in_onda', 'pausa']) {
        for (const larghezza of [1200, 1280, 1440, 1920]) {
            const v = await visitatore({ viewport: { width: larghezza, height: 800 } }, stato);
            const p = await v.scheda('2026-10-02T10:00:00+02:00');
            await p.goto(NAPOLI);
            await p.waitForFunction(s => document.documentElement.getAttribute('data-diretta-stato') === s, stato, { timeout: 5000 }).catch(() => {});
            const m = await p.evaluate(() => {
                const menu = document.getElementById('navMenu').getBoundingClientRect();
                const marchio = document.querySelector('.nav-brand-group').getBoundingClientRect();
                const img = document.querySelector('.logo-mark-img').getBoundingClientRect();
                // una riga = tutte le voci con il centro alla stessa altezza
                // (le pillole sono piu' alte dei collegamenti di testo)
                const centri = Array.from(document.querySelectorAll('#navMenu > li')).map(li => { const b = li.getBoundingClientRect(); return b.top + b.height / 2; });
                const righe = Math.max.apply(null, centri) - Math.min.apply(null, centri) < 6 ? 1 : 2;
                return { margine: Math.round(menu.left - Math.max(marchio.right, img.right)), righe, fuori: menu.right > window.innerWidth };
            });
            vero(m.margine >= 20 && m.righe === 1 && !m.fuori, larghezza + 'px, ' + stato + ': menu su una riga, ' + m.margine + 'px di margine dal marchio');
            await v.ctx.close();
        }
    }
    {
        const v = await visitatore({ viewport: { width: 1100, height: 800 } }, 'in_onda');
        const p = await v.scheda('2026-10-02T10:00:00+02:00');
        await p.goto(NAPOLI);
        await p.waitForTimeout(800);
        const primo = await p.evaluate(() => [getComputedStyle(document.getElementById('navToggle')).display,
            (document.getElementById('navDirettaPillola').innerText || '').trim()]);
        await p.click('#navToggle');
        const vis = await p.locator('#navDiretta').isVisible();
        uguale([primo, vis], [['flex', 'IN DIRETTA'], true], '1100px (tablet orizzontale): menu a tendina con la pillola IN DIRETTA accanto, e aperto mostra la voce Diretta');
        await v.ctx.close();
    }

    /* Fra 1000 e 1199px il menu a tendina serve solo finche' c'e' la voce
       Diretta: dopo la fine la voce sparisce e il menu torna su una riga,
       com'era prima della diretta (portatili da 1024px, iPad in orizzontale). */
    console.log('\n[Napoli: fra 1000 e 1199px, prima e dopo la fine]');
    async function menuNapoli(page) {
        return page.evaluate(() => {
            const menu = document.getElementById('navMenu').getBoundingClientRect();
            const marchio = document.querySelector('.nav-brand-group').getBoundingClientRect();
            const img = document.querySelector('.logo-mark-img').getBoundingClientRect();
            const voci = Array.from(document.querySelectorAll('#navMenu > li')).filter(li => li.getBoundingClientRect().width > 0);
            const centri = voci.map(li => { const b = li.getBoundingClientRect(); return b.top + b.height / 2; });
            return {
                hamburger: getComputedStyle(document.getElementById('navToggle')).display !== 'none',
                voci: voci.length,
                righe: voci.length && Math.max.apply(null, centri) - Math.min.apply(null, centri) < 6 ? 1 : 2,
                margine: Math.round(menu.left - Math.max(marchio.right, img.right)),
                fuori: menu.right > window.innerWidth,
                diretta: !!document.getElementById('navDiretta').getBoundingClientRect().width
            };
        });
    }
    for (const larghezza of [1000, 1024, 1100, 1199]) {
        for (const [quando, stato, descrizione] of [['2026-10-02T19:00:00+02:00', 'terminato', 'alle 19 del 2 ottobre'], ['2026-10-03T10:00:00+02:00', 'in_onda', 'il 3 ottobre']]) {
            const v = await visitatore({ viewport: { width: larghezza, height: 800 } }, stato);
            const p = await v.scheda(quando);
            await p.goto(NAPOLI);
            await p.waitForFunction(() => document.documentElement.getAttribute('data-diretta') === 'conclusa', null, { timeout: 5000 }).catch(() => {});
            const m = await menuNapoli(p);
            vero(!m.hamburger && m.voci === 8 && m.righe === 1 && !m.fuori && m.margine >= 10 && !m.diretta,
                larghezza + 'px, ' + descrizione + ' (diretta conclusa): niente hamburger, le 8 voci su una riga come prima, ' + m.margine + 'px dal marchio');
            if (larghezza === 1024 && stato === 'terminato') await scatta(p, 'napoli-menu-1024-conclusa', { clip: { x: 0, y: 0, width: 1024, height: 90 } });
            await v.ctx.close();
        }
        const v = await visitatore({ viewport: { width: larghezza, height: 800 } }, 'programmato');
        const p = await v.scheda('2026-09-26T10:00:00+02:00');
        await p.goto(NAPOLI);
        await p.waitForTimeout(800);
        const m = await menuNapoli(p);
        vero(m.hamburger && m.voci === 0, larghezza + 'px, 26 settembre (voce Diretta nel menu): menu a tendina, chiuso');
        await v.ctx.close();
    }

    // la pillola accanto all'hamburger: dove sta e cosa dice
    async function barra(page) {
        return page.evaluate(() => {
            const r = el => el.getBoundingClientRect();
            const pil = document.getElementById('navDirettaPillola');
            const b = r(pil), t = r(document.getElementById('navToggle')), m = r(document.querySelector('.nav-brand-group'));
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

    const scenari = [
        ['', '2026-09-26T10:00:00+02:00', 'programmato', 'DIRETTA'],
        ['-in-diretta', '2026-10-02T10:00:00+02:00', 'in_onda', 'IN DIRETTA'],
        ['-pausa', '2026-10-02T11:00:00+02:00', 'pausa', 'IN PAUSA']
    ];
    for (const [nome, quando, stato, scritta] of scenari) {
        console.log('\n[Napoli: telefono, ' + stato + ']');
        const v = await visitatore(TELEFONO, stato);
        const p = await v.scheda(quando);
        await p.goto(NAPOLI);
        await p.waitForTimeout(900);
        const b = await barra(p);
        vero(b.visibile && b.fuoriDalMenu && b.menuChiuso && b.href === '/diretta/', 'a menu chiuso la pillola "Diretta" e\' nella barra, fuori dal menu a scomparsa, verso /diretta/');
        vero(b.accanto && b.staccataDalMarchio && b.dentro, 'accanto all\'hamburger, allineata, senza toccare il marchio');
        // innerText conta anche "Diretta" nascosto per i soli lettori di schermo in pausa
        vero(b.testo.endsWith(scritta), 'la pillola dice ' + scritta + ' (' + b.testo + ')');
        vero(b.tocco >= 48, 'area di tocco di almeno ' + b.tocco + 'px (pillola alta ' + b.altezza + 'px)');
        vero(!(await p.locator('#navDiretta').isVisible()), 'a menu chiuso la voce del menu non ingombra la barra');
        await inCima(p);
        await scatta(p, 'napoli-barra-telefono' + nome, { clip: { x: 0, y: 0, width: 390, height: 90 } });
        await p.tap('#navToggle');
        await p.waitForTimeout(300);
        const m = await p.evaluate(() => {
            const a = document.getElementById('navDiretta').getBoundingClientRect();
            const cta = document.querySelector('#navMenu a.nav-cta').getBoundingClientRect();
            return { visibile: a.width > 0 && a.height >= 40, dentro: a.left >= 0 && a.right <= window.innerWidth && a.bottom <= window.innerHeight, sopra: a.bottom <= cta.top, largo: a.width > window.innerWidth * 0.8 };
        });
        vero(m.visibile && m.dentro, 'a menu aperto la voce Diretta si vede, grande, dentro lo schermo');
        vero(m.sopra && m.largo, 'pulsante largo quanto il menu, subito sopra "Save the date"');
        const s = await statoNapoli(p);
        vero(stato === 'in_onda' ? (s.menu && s.pulsante && s.pillola) : (!s.menu && !s.pulsante && !s.pillola),
            'indicatore IN DIRETTA ' + (stato === 'in_onda' ? 'acceso' : 'spento') + ' su menu, pillola e pulsante');
        vero(stato === 'pausa' ? (s.pausaMenu && s.pausaPulsante) : (!s.pausaMenu && !s.pausaPulsante), '"in pausa" ' + (stato === 'pausa' ? 'acceso' : 'spento'));
        await scatta(p, 'napoli-menu-telefono' + nome);
        await p.tap('#navToggle');
        await p.locator('#diretta').scrollIntoViewIfNeeded();
        await p.evaluate(() => window.scrollBy({ top: -70, behavior: 'instant' })); // sotto la barra fissa
        await p.waitForTimeout(300);
        await scatta(p, 'napoli-sezione-telefono' + nome);
        vero(await senzaScorrimentoOrizzontale(p), 'niente scorrimento orizzontale');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        if (stato === 'programmato') {
            await inCima(p);
            await Promise.all([p.waitForURL(/\/diretta\/$/), p.tap('#navDirettaPillola')]);
            vero(new URL(p.url()).pathname === '/diretta/', 'un tocco sulla pillola porta a /diretta/');
        }
        await v.ctx.close();
    }

    console.log('\n[Napoli: telefono stretto (320px)]');
    for (const [stato, scritta] of [['in_onda', 'IN DIRETTA'], ['pausa', 'IN PAUSA']]) {
        const v = await visitatore(TELEFONO_STRETTO, stato);
        const p = await v.scheda('2026-10-02T11:00:00+02:00');
        await p.goto(NAPOLI);
        await p.waitForTimeout(900);
        const b = await barra(p);
        vero(b.visibile && b.accanto && b.staccataDalMarchio && b.dentro && b.testo.endsWith(scritta),
            '320px, ' + stato + ': marchio, pillola ' + scritta + ' e hamburger su una riga, senza sovrapporsi');
        vero(await senzaScorrimentoOrizzontale(p), '320px, ' + stato + ': niente scorrimento orizzontale');
        if (stato === 'pausa') await scatta(p, 'napoli-barra-telefono-320-pausa', { clip: { x: 0, y: 0, width: 320, height: 90 } });
        await v.ctx.close();
    }

    console.log('\n[Napoli: telefono, dopo la fine]');
    {
        const v = await visitatore(TELEFONO, 'terminato');
        const p = await v.scheda('2026-10-02T19:00:00+02:00');
        await p.goto(NAPOLI);
        await p.waitForTimeout(900);
        const s = await statoNapoli(p);
        uguale([s.html, s.pillolaAccesa, s.pillolaVisibile, s.voceMenu, s.titolo], ['conclusa', false, false, false, 'La diretta si è conclusa'],
            'pillola accanto all\'hamburger e voce di menu nascoste, sezione "La diretta si è conclusa"');
        await inCima(p);
        await scatta(p, 'napoli-barra-telefono-conclusa', { clip: { x: 0, y: 0, width: 390, height: 90 } });
        await p.locator('#diretta').scrollIntoViewIfNeeded();
        await p.evaluate(() => window.scrollBy({ top: -70, behavior: 'instant' }));
        await p.waitForTimeout(300);
        await scatta(p, 'napoli-sezione-telefono-conclusa');
        vero(await senzaScorrimentoOrizzontale(p), 'niente scorrimento orizzontale');
        vero(v.errori.length === 0, 'nessun errore JavaScript' + (v.errori.length ? ': ' + v.errori.join(' | ') : ''));
        await v.ctx.close();
    }
}

/* ---------- 4. la diretta nascosta sul sito (PUBBLICA) ---------- */
async function vistaNapoli(page) {
    return page.evaluate(() => {
        const vis = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
        return {
            attributo: document.documentElement.getAttribute('data-diretta'),
            sezione: vis(document.getElementById('diretta')),
            voce: vis(document.getElementById('navDiretta') && document.getElementById('navDiretta').closest('li')),
            pillola: vis(document.getElementById('navDirettaPillola')),
            hamburger: getComputedStyle(document.getElementById('navToggle')).display !== 'none'
        };
    });
}
async function provaNascosta() {
    console.log('\n[la diretta nascosta sul sito: PUBBLICA = false]');
    // home, 26 settembre (dentro la finestra): niente popup ne' pillola, nessuna richiesta
    const v1 = await visitatore(COMPUTER, 'programmato', { prova: false, pubblica: false });
    const h1 = await v1.scheda('2026-09-26T10:00:00+02:00');
    await h1.goto(HOME);
    await passa(h1, QUIETE_MS);
    const n1 = await h1.evaluate(() => ({ cond: window.NGBDiretta && window.NGBDiretta.condizione(), vis: window.NGBDiretta && window.NGBDiretta.visibile, pianificato: !!window.__dirPromoPlanned }));
    vero(n1.cond === 'nascosta' && n1.vis === false && !n1.pianificato, 'home: condizione "nascosta", il popup della diretta non si prenota (gli altri popup restano liberi)');
    uguale(await nelDom(h1).then(l => l.filter(x => x === 'dirPromo')), [], 'home: nessun popup della diretta');
    vero(!(await pillola(h1)).presente, 'home: nessuna pillola della diretta');
    await scatta(h1, 'nascosta-home');
    // Napoli, 2 ottobre alle 10, in onda: niente voce, pillola, sezione; nessuna richiesta
    const n2 = await v1.scheda('2026-10-02T10:00:00+02:00');
    await n2.goto(NAPOLI);
    await passa(n2, 2 * MINUTO);
    const s2 = await vistaNapoli(n2);
    vero(s2.attributo === 'nascosta' && !s2.sezione && !s2.voce && !s2.pillola,
        'Napoli il 2 ottobre in onda: niente sezione "Segui la diretta", niente voce "Diretta" ne\' pillola nel menu', JSON.stringify(s2));
    uguale(v1.richieste.length, 0, 'nessuna richiesta allo stato della diretta, nemmeno il giorno dell\'evento in onda (2 minuti)');
    await inCima(n2);
    await scatta(n2, 'nascosta-napoli');
    // fra 1000 e 1199px il menu resta su una riga, come prima della diretta
    await n2.setViewportSize({ width: 1100, height: 800 });
    await n2.waitForTimeout(200);
    vero(!(await vistaNapoli(n2)).hamburger, 'Napoli a 1100px: menu su una riga, niente hamburger (come prima della diretta)');
    vero(v1.errori.length === 0, 'nessun errore nelle pagine' + (v1.errori.length ? ': ' + v1.errori.join(' | ') : ''));
    await v1.ctx.close();

    console.log('\n[?diretta=prova: la vede solo questo browser, finche\' non si chiede ?diretta=pubblico]');
    const v2 = await visitatore(COMPUTER, 'programmato', { prova: false, pubblica: false });
    const h2 = await v2.scheda('2026-09-26T10:00:00+02:00');
    await h2.goto(HOME + '?diretta=prova');
    vero(await aspettaPopup(h2, 'dirPromo'), 'home?diretta=prova: il popup della diretta compare');
    vero((await pillola(h2)).visibile, 'e la pillola');
    vero(await h2.evaluate(() => localStorage.getItem('ngbDirettaProva') === '1'), 'il browser se lo ricorda (localStorage)');
    const n3 = await v2.scheda('2026-09-26T10:00:00+02:00');
    await n3.goto(NAPOLI);
    await passa(n3, 1000);
    const s3 = await vistaNapoli(n3);
    vero(s3.attributo === 'prima' && s3.sezione && s3.voce, 'poi Napoli senza parametro: sezione e voce "Diretta" visibili (in prova)', JSON.stringify(s3));
    const n4 = await v2.scheda('2026-09-26T10:00:00+02:00');
    await n4.goto(NAPOLI + '?diretta=pubblico');
    await passa(n4, 1000);
    const s4 = await vistaNapoli(n4);
    vero(s4.attributo === 'nascosta' && !s4.sezione && !s4.voce && !s4.pillola, 'Napoli?diretta=pubblico: di nuovo come la vedono tutti (nascosta)', JSON.stringify(s4));
    vero(await n4.evaluate(() => localStorage.getItem('ngbDirettaProva') === null), 'e il browser non se lo ricorda piu\'');
    vero(v2.errori.length === 0, 'nessun errore nelle pagine' + (v2.errori.length ? ': ' + v2.errori.join(' | ') : ''));
    await v2.ctx.close();

    console.log('\n[PUBBLICA = true: tutto compare per tutti, senza prova]');
    const v3 = await visitatore(COMPUTER, 'programmato', { prova: false, pubblica: true });
    const h3 = await v3.scheda('2026-09-26T10:00:00+02:00');
    await h3.goto(HOME);
    vero(await aspettaPopup(h3, 'dirPromo'), 'home: il popup della diretta compare');
    vero((await pillola(h3)).visibile, 'e la pillola');
    const n5 = await v3.scheda('2026-09-26T10:00:00+02:00');
    await n5.goto(NAPOLI);
    await passa(n5, 1000);
    const s5 = await vistaNapoli(n5);
    vero(s5.attributo === 'prima' && s5.sezione && s5.voce, 'Napoli: sezione "Segui la diretta" e voce "Diretta" visibili', JSON.stringify(s5));
    vero(v3.errori.length === 0, 'nessun errore nelle pagine' + (v3.errori.length ? ': ' + v3.errori.join(' | ') : ''));
    await v3.ctx.close();
}
