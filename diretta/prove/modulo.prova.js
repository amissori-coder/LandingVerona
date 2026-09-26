/* ============================================================
   PROVE - il modulo di Napoli e la diretta
   ------------------------------------------------------------
       node modulo.prova.js

   La pagina vera di Napoli (napoli_ottobre_2026/), servita da
   server-locale.js (porte 3955 per le funzioni, non usate, e 8955 per
   il sito) in Chromium con Playwright. La chiamata al servizio
   (NGB_FIREBASE_URL, .../api/iscrizione-nuova) e' intercettata nel
   browser e risponde come chiede ogni prova. Nessuna richiesta esce
   davvero. L'orologio della pagina e' quello finto di Playwright
   (page.clock), fermo al momento dell'invio.

   Dal sito principale (main, f26e12e) il modulo di Napoli ha UNA
   strada sola, il servizio: aspetta la risposta, e se non arriva o dice
   di no mostra l'errore e lascia riprovare. La diretta aggiunge soltanto
   il percorso della pagina (`percorso`), con cui il servizio trova
   l'evento della diretta; nessun tentativo automatico (chi vede
   l'errore riprova, e se il lavoro della diretta non riesce dopo una
   scheda salvata ci pensa la riconciliazione).

   COSA DIMOSTRA.
   1. Servizio a posto: UNA chiamata, POST text/plain, con il corpo di
      main (f26e12e) byte per byte piu' il solo `percorso`
      (/napoli_ottobre_2026/); la conferma a video; nessuna richiesta al
      foglio Google.
   2. 503: l'errore del sito, il modulo resta, il pulsante torna
      attivo; una chiamata sola, anche un minuto dopo.
   3. Rete che cade: «Errore di connessione…», una chiamata sola.
   4. 400 con un messaggio del servizio: il messaggio a video.
   In tutte: nessun errore nella pagina.
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
// il modulo del sito principale, senza la diretta: una strada sola, senza `percorso`
const SCRIPT_MAIN = execSync('git show f26e12e:napoli_ottobre_2026/script.js', { cwd: RADICE, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const URL_SERVIZIO = (/const NGB_FIREBASE_URL = '([^']+)'/.exec(SCRIPT_ORA) || [])[1];
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
   un numero = lo stato HTTP); oltre l'ultima vale l'ultima. msg: il
   messaggio del servizio quando dice di no.
   script: al posto di script.js (quello di main). */
async function apriModulo(browser, opz) {
    const ctx = await browser.newContext({ locale: 'it-IT', timezoneId: 'Europe/Rome', viewport: { width: 1280, height: 900 } });
    const c = { servizio: [], esterni: [] };
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
            const corpo = r === 200 ? { ok: true } : Object.assign({ ok: false }, opz.msg ? { msg: opz.msg } : {});
            return route.fulfill({ status: r, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(corpo) });
        }
        c.esterni.push(new URL(url).host);
        return route.abort();
    });
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
const erroreVisibile = p => p.evaluate(() => {
    const el = document.getElementById('submitError');
    const form = document.getElementById('accreditationForm');
    return el && el.textContent && getComputedStyle(form).display !== 'none' && !document.getElementById('submitBtn').disabled ? el.textContent : '';
});
// invia e aspetta (tempo vero) che la pagina dica com'e' andata
async function invia(m) {
    await m.p.click('#submitBtn');
    await aspetta(async () => (await confermaVisibile(m.p)) || !!(await erroreVisibile(m.p)), 5000);
    return { conferma: await confermaVisibile(m.p), errore: await erroreVisibile(m.p), chiamate: m.c.servizio.length };
}

(async () => {
    let sito = null, browser = null;
    try {
        vero(!!URL_SERVIZIO && !/NGB_SHEET_URL/.test(SCRIPT_ORA) && /percorso: location\.pathname/.test(SCRIPT_ORA) && !/percorso/.test(SCRIPT_MAIN.slice(SCRIPT_MAIN.indexOf('NGB_FIREBASE_URL'), SCRIPT_MAIN.indexOf('function validateField'))),
            'lo script di adesso manda al servizio anche il percorso, e nessuna richiesta al foglio; servizio ' + URL_SERVIZIO);
        sito = await accendiSito();
        browser = await chromium.launch({ executablePath: CHROMIUM });

        console.log('\n1. Servizio a posto');
        const m1 = await apriModulo(browser, { risposte: [200] });
        const i1 = await invia(m1);
        vero(i1.conferma && i1.chiamate === 1, 'la conferma a video, dopo UNA chiamata al servizio', JSON.stringify(i1));
        await m1.p.screenshot({ path: path.join(FOTO, 'napoli-conferma.png') });
        const s1 = m1.c.servizio[0] || {};
        vero(s1.metodo === 'POST' && /^text\/plain/.test(s1.tipo), 'POST text/plain, come su main');
        const m0 = await apriModulo(browser, { script: SCRIPT_MAIN, risposte: [200] });
        const i0 = await invia(m0);
        const corpo = JSON.parse(s1.corpo || '{}');
        const senzaPercorso = Object.assign({}, corpo);
        delete senzaPercorso.percorso;
        const corpoMain = (m0.c.servizio[0] || {}).corpo;
        vero(i0.conferma && corpo.percorso === '/napoli_ottobre_2026/' && JSON.stringify(senzaPercorso) === corpoMain,
            'al servizio: il corpo di main (f26e12e) byte per byte, piu\' il solo `percorso` (/napoli_ottobre_2026/)',
            'adesso: ' + s1.corpo + '\n       main:   ' + corpoMain);
        vero(!m1.c.esterni.some(h => /script\.google/.test(h)), 'nessuna richiesta al foglio Google', m1.c.esterni.join(', '));
        vero(m1.p.__errori.length === 0, 'nessun errore nella pagina' + (m1.p.__errori.length ? ': ' + m1.p.__errori.join(' | ') : ''));
        await m0.ctx.close();
        await m1.ctx.close();

        console.log('\n2. Il servizio risponde 503');
        const m2 = await apriModulo(browser, { risposte: [503] });
        const i2 = await invia(m2);
        vero(!i2.conferma && /Iscrizione non registrata/.test(i2.errore) && i2.chiamate === 1, 'l\'errore del sito, il modulo resta e il pulsante torna attivo', JSON.stringify(i2));
        await m2.p.screenshot({ path: path.join(FOTO, 'napoli-servizio-giu.png') });
        await m2.p.clock.runFor(60000);
        await pausa(400);
        vero(m2.c.servizio.length === 1, 'nessun tentativo automatico: un minuto dopo, sempre una chiamata');
        vero(m2.p.__errori.length === 0, 'nessun errore nella pagina');
        await m2.ctx.close();

        console.log('\n3. La rete cade');
        const m3 = await apriModulo(browser, { risposte: ['rete'] });
        const i3 = await invia(m3);
        vero(!i3.conferma && /Errore di connessione/.test(i3.errore) && i3.chiamate === 1 && m3.p.__errori.length === 0, '«Errore di connessione…», una chiamata sola', JSON.stringify(i3));
        await m3.ctx.close();

        console.log('\n4. Il servizio dice di no (400) con un messaggio');
        const m4 = await apriModulo(browser, { risposte: [400], msg: 'Codice invito non valido.' });
        const i4 = await invia(m4);
        vero(!i4.conferma && i4.errore === 'Codice invito non valido.' && i4.chiamate === 1 && m4.p.__errori.length === 0, 'il messaggio del servizio a video', JSON.stringify(i4));
        await m4.ctx.close();
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
