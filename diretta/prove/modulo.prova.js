/* ============================================================
   PROVE - il modulo di Napoli ripete da solo la chiamata al servizio
   ------------------------------------------------------------
       node modulo.prova.js

   La pagina vera di Napoli (napoli_ottobre_2026/), servita da
   server-locale.js (porte 3955 per le funzioni, non usate, e 8955 per
   il sito) in Chromium con Playwright. Le due strade del modulo sono
   intercettate nel browser: il foglio Google (NGB_SHEET_URL) risponde
   sempre, il servizio (NGB_FIREBASE_URL, .../api/iscrizione-nuova)
   risponde come chiede ogni prova. Nessuna richiesta esce davvero.
   L'orologio della pagina e' quello finto di Playwright (page.clock),
   fermo al momento dell'invio: la data scritta nel modulo e' la stessa
   in ogni prova, e i tentativi del servizio partono solo quando la
   prova fa passare il tempo (runFor).

   COSA DIMOSTRA.
   1. Servizio che risponde 503 alle prime due chiamate e 200 alla
      terza: TRE chiamate al servizio, la seconda dopo 3 secondi e la
      terza 10 secondi dopo la seconda (non prima: a 2,9 e 9,8 secondi
      non e' ancora partita), tutte con keepalive e con lo stesso corpo
      (il payload del foglio piu' il solo `percorso`); poi nessun'altra.
      La conferma a video compare SUBITO, prima dei tentativi (e' legata
      al foglio, come prima). Il payload del FOGLIO e' identico, byte per
      byte, a quello della versione di prima (git 6f762d7~1, quando la
      chiamata al servizio non aveva ne' percorso ne' tentativi), con le
      stesse intestazioni e lo stesso metodo.
   2. Rete che cade due volte (la richiesta non arriva), poi 200: tre
      chiamate.
   3. 429 (troppi invii), poi 200: due chiamate.
   4. 400 (dati non validi): una chiamata sola, niente tentativi (ripetuta
      sarebbe uguale).
   5. Sempre 503: tre chiamate e poi basta.
   6. Servizio a posto (200): una chiamata sola.
   In tutte: la conferma a video c'e', nessun errore nella pagina.
   Esce con 1 se qualcosa e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');
const { chromium } = require('playwright');

const RADICE = path.resolve(__dirname, '../..');
const PORTA_API = 3955, PORTA_STATICO = 8955;
const SITO = 'http://127.0.0.1:' + PORTA_STATICO;
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FOTO = path.resolve(__dirname, 'risultati/screenshot-modulo');
fs.mkdirSync(FOTO, { recursive: true });

const SCRIPT_ORA = fs.readFileSync(path.join(RADICE, 'napoli_ottobre_2026/script.js'), 'utf8');
// la versione di prima che il modulo mandasse al servizio anche il percorso (e ripetesse la chiamata)
const SCRIPT_PRIMA = execSync('git show 6f762d7~1:napoli_ottobre_2026/script.js', { cwd: RADICE, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const URL_SERVIZIO = (/const NGB_FIREBASE_URL = '([^']+)'/.exec(SCRIPT_ORA) || [])[1];
const URL_FOGLIO = (/const NGB_SHEET_URL = '([^']+)'/.exec(SCRIPT_ORA) || [])[1];
// l'istante (fermo) dell'invio: la stessa data nel modulo per tutte le prove
const ISTANTE = new Date('2026-09-26T10:15:30+02:00').getTime();

let rossi = 0, verdi = 0;
function vero(cond, descrizione, dettaglio) {
    if (cond) { verdi++; console.log('  ok  ' + descrizione); }
    else { rossi++; console.log('ROSSO ' + descrizione + (dettaglio ? '\n       ' + dettaglio : '')); }
}
const pausa = ms => new Promise(r => setTimeout(r, ms));
async function aspetta(fn, ms) {
    const t0 = Date.now();
    for (;;) {
        if (await fn()) return true;
        if (Date.now() - t0 > ms) return false;
        await pausa(50);
    }
}

/* ---------- il sito in locale ---------- */
function risponde(url) {
    return new Promise(ok => {
        const r = http.get(url, res => { res.resume(); ok(res.statusCode < 500); });
        r.on('error', () => ok(false));
        r.setTimeout(1500, () => { r.destroy(); ok(false); });
    });
}
async function accendiSito() {
    if (await risponde(SITO + '/')) return null;
    const figlio = spawn(process.execPath, [path.join(__dirname, 'server-locale.js'), '--api', String(PORTA_API), '--statico', String(PORTA_STATICO)],
        { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((ok, ko) => {
        const t = setTimeout(() => ko(new Error('server-locale non partito')), 20000);
        figlio.stdout.on('data', d => { if (/SERVER LOCALE PRONTO/.test(String(d))) { clearTimeout(t); ok(); } });
        figlio.stderr.on('data', d => process.stderr.write(d));
        figlio.on('exit', c => { clearTimeout(t); ko(new Error('server-locale uscito con ' + c)); });
    });
    return figlio;
}

/* ---------- una pagina di Napoli con il modulo compilato ----------
   risposte: una per chiamata al servizio ('rete' = la richiesta cade;
   un numero = lo stato HTTP); oltre l'ultima vale l'ultima.
   script: al posto di script.js (la versione di prima). */
async function apriModulo(browser, opz) {
    const ctx = await browser.newContext({ locale: 'it-IT', timezoneId: 'Europe/Rome', viewport: { width: 1280, height: 900 } });
    const c = { servizio: [], foglio: [], altre: 0 };
    await ctx.route(/^https?:\/\//, async route => {
        const req = route.request();
        const url = req.url();
        if (url.startsWith(SITO)) {
            if (opz.script && /\/napoli_ottobre_2026\/script\.js(\?|$)/.test(url)) {
                return route.fulfill({ status: 200, contentType: 'application/javascript', body: opz.script });
            }
            return route.fallback();
        }
        if (url === URL_SERVIZIO) {
            const n = c.servizio.length;
            c.servizio.push({ reale: Date.now(), metodo: req.method(), tipo: req.headers()['content-type'], corpo: req.postData() || '' });
            const r = opz.risposte ? opz.risposte[Math.min(n, opz.risposte.length - 1)] : 200;
            if (r === 'rete') return route.abort('failed');
            return route.fulfill({ status: r, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: r === 200 }) });
        }
        if (url === URL_FOGLIO) {
            c.foglio.push({ metodo: req.method(), tipo: req.headers()['content-type'], corpo: req.postData() || '' });
            return route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
        }
        c.altre++;
        return route.abort();
    });
    // come chiama fetch la pagina (keepalive non si vede dalla rete): lo si annota
    await ctx.addInitScript(servizio => {
        window.__fetchServizio = [];
        const vero = window.fetch;
        window.fetch = function (url, init) {
            if (String(url) === servizio) window.__fetchServizio.push({ keepalive: !!(init && init.keepalive), corpo: init && init.body });
            return vero.apply(this, arguments);
        };
    }, URL_SERVIZIO);
    const p = await ctx.newPage();
    p.__errori = [];
    p.on('pageerror', e => p.__errori.push(String(e.message || e)));
    await p.clock.install({ time: ISTANTE - 60000 });
    await p.goto(SITO + '/napoli_ottobre_2026/#accreditamento', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#accreditationForm');
    // da qui l'orologio della pagina e' fermo: lo muove solo la prova
    await p.clock.pauseAt(ISTANTE);
    await p.fill('#nome', 'Giulia');
    await p.fill('#cognome', 'Esposito');
    await p.fill('#email', 'Giulia.Esposito@Esempio.IT');
    await p.fill('#telefono', '+39 333 1234567');
    await p.fill('#azienda', 'Esposito srl');
    await p.fill('#ruolo', 'Amministratrice');
    for (const id of ['#profilo', '#settore', '#dimensione']) {
        const v = await p.$eval(id, s => Array.from(s.options).map(o => o.value).filter(Boolean)[0]);
        await p.selectOption(id, v);
    }
    // come una persona: clic sull'etichetta (le caselle vere sono nascoste dal CSS)
    for (const sel of ['input[name="interessi"][value="Adeguati assetti"]', 'input[name="interessi"][value="Finanza agevolata"]', '#privacy', '#marketing']) {
        await p.locator(sel).locator('xpath=ancestor::label[1]').click();
        if (!(await p.locator(sel).isChecked())) await p.locator(sel).check({ force: true });
    }
    return { ctx, p, c };
}
const confermaVisibile = p => p.evaluate(() => {
    const el = document.getElementById('formSuccess');
    return !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(document.getElementById('accreditationForm')).display === 'none';
});
/* Invia e aspetta la conferma a video (tempo vero, orologio della pagina
   fermo: nessun tentativo puo' partire nel frattempo). -> quante chiamate
   al servizio c'erano quando e' comparsa la conferma */
async function invia(m) {
    await m.p.click('#submitBtn');
    const comparsa = await aspetta(() => confermaVisibile(m.p), 5000);
    return { comparsa: comparsa, chiamate: m.c.servizio.length };
}
// fa passare `ms` di orologio della pagina, poi lascia arrivare le risposte (tempo vero)
async function passa(m, ms) {
    await m.p.clock.runFor(ms);
    await pausa(400);
}
// aspetta (tempo vero) che la risposta al tentativo n sia arrivata alla pagina
async function rispostaArrivata(m, n) {
    await aspetta(() => m.c.servizio.length >= n, 3000);
    await pausa(400);
}

(async () => {
    let sito = null, browser = null;
    try {
        vero(!!URL_SERVIZIO && !!URL_FOGLIO && /keepalive:\s*true/.test(SCRIPT_ORA) && !/keepalive/.test(SCRIPT_PRIMA),
            'lo script di adesso chiama il servizio con keepalive (quello di prima no); servizio ' + URL_SERVIZIO);
        sito = await accendiSito();
        browser = await chromium.launch({ executablePath: CHROMIUM });

        console.log('\n1. Il servizio risponde 503, 503, poi 200');
        const m1 = await apriModulo(browser, { risposte: [503, 503, 200] });
        const i1 = await invia(m1);
        vero(i1.comparsa && i1.chiamate === 1, 'la conferma a video compare subito, con UNA chiamata al servizio (i tentativi non si aspettano)', JSON.stringify(i1));
        await m1.p.screenshot({ path: path.join(FOTO, 'napoli-conferma-con-servizio-giu.png') });
        await rispostaArrivata(m1, 1);
        await passa(m1, 2900);
        vero(m1.c.servizio.length === 1, 'a 2,9 secondi il secondo tentativo non e\' ancora partito');
        await passa(m1, 200);
        await rispostaArrivata(m1, 2);
        vero(m1.c.servizio.length === 2, 'a 3 secondi parte il secondo tentativo (il primo ha avuto 503)');
        await passa(m1, 9800);
        vero(m1.c.servizio.length === 2, '9,8 secondi dopo il secondo, il terzo non e\' ancora partito');
        await passa(m1, 300);
        await rispostaArrivata(m1, 3);
        vero(m1.c.servizio.length === 3, '10 secondi dopo il secondo (503 anche lui) parte il terzo, che riceve 200');
        await passa(m1, 60000);
        vero(m1.c.servizio.length === 3, 'dopo il 200 nessun altro tentativo (un minuto dopo: sempre 3)');
        const fetch1 = await m1.p.evaluate(() => window.__fetchServizio);
        vero(fetch1.length === 3 && fetch1.every(f => f.keepalive === true), 'tutte e tre con keepalive: true (arrivano anche se la pagina si chiude)', JSON.stringify(fetch1.map(f => f.keepalive)));
        const corpi1 = m1.c.servizio.map(s => s.corpo);
        vero(corpi1.every(x => x === corpi1[0]) && m1.c.servizio.every(s => s.metodo === 'POST' && /^text\/plain/.test(s.tipo)),
            'lo stesso corpo in ogni tentativo (stessa scheda: stessa email, stessa data), POST text/plain come prima');
        vero(m1.c.foglio.length === 1, 'al foglio Google una richiesta sola (i tentativi sono solo verso il servizio)');
        vero(m1.p.__errori.length === 0 && m1.c.altre >= 0, 'nessun errore nella pagina' + (m1.p.__errori.length ? ': ' + m1.p.__errori.join(' | ') : ''));

        // il payload del foglio: identico alla versione di prima
        const m0 = await apriModulo(browser, { script: SCRIPT_PRIMA, risposte: [200] });
        const i0 = await invia(m0);
        await pausa(300);
        const fg = m1.c.foglio[0] || {}, fg0 = m0.c.foglio[0] || {};
        vero(i0.comparsa && fg0.corpo && fg.corpo === fg0.corpo, 'il payload del FOGLIO e\' identico, byte per byte, a quello della versione di prima (6f762d7~1)',
            'adesso: ' + fg.corpo + '\n       prima: ' + fg0.corpo);
        vero(fg.tipo === fg0.tipo && fg.metodo === fg0.metodo, 'verso il foglio stesso metodo e stesse intestazioni di prima (' + fg.metodo + ' ' + fg.tipo + ')');
        const corpoServizio = JSON.parse(corpi1[0] || '{}');
        const senzaPercorso = Object.assign({}, corpoServizio);
        delete senzaPercorso.percorso;
        vero(corpoServizio.percorso === '/napoli_ottobre_2026/' && JSON.stringify(senzaPercorso) === fg.corpo && (m0.c.servizio[0] || {}).corpo === fg0.corpo,
            'al servizio: il payload del foglio piu\' il solo `percorso` (/napoli_ottobre_2026/); prima era il payload del foglio e basta');
        await m0.ctx.close();
        await m1.ctx.close();

        console.log('\n2-6. Rete che cade, 429, 400, sempre 503, servizio a posto');
        const casi = [
            { nome: 'rete che cade due volte, poi 200', risposte: ['rete', 'rete', 200], attese: 3 },
            { nome: '429 (troppi invii), poi 200', risposte: [429, 200], attese: 2 },
            { nome: '400 (dati non validi): nessun tentativo in piu\'', risposte: [400], attese: 1 },
            { nome: 'sempre 503: tre tentativi e poi basta', risposte: [503], attese: 3 },
            { nome: 'servizio a posto (200): una chiamata', risposte: [200], attese: 1 }
        ];
        for (const caso of casi) {
            const m = await apriModulo(browser, { risposte: caso.risposte });
            const i = await invia(m);
            await rispostaArrivata(m, 1);
            await passa(m, 3100);
            await rispostaArrivata(m, Math.min(2, caso.attese));
            await passa(m, 10100);
            await rispostaArrivata(m, caso.attese);
            await passa(m, 60000);
            const f = await m.p.evaluate(() => window.__fetchServizio);
            vero(i.comparsa && i.chiamate === 1 && m.c.servizio.length === caso.attese && f.every(x => x.keepalive === true) && m.p.__errori.length === 0,
                caso.nome + ': conferma a video subito, ' + m.c.servizio.length + ' chiamat' + (m.c.servizio.length === 1 ? 'a' : 'e') + ' al servizio',
                JSON.stringify({ comparsa: i.comparsa, chiamate: m.c.servizio.length, errori: m.p.__errori }));
            await m.ctx.close();
        }
    } catch (e) {
        console.error(e);
        rossi++;
    } finally {
        if (browser) await browser.close();
        if (sito) sito.kill('SIGINT');
        console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
        process.exit(rossi ? 1 : 0);
    }
})();
