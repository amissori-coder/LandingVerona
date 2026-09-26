/* ============================================================
   PROVE - l'anteprima della diretta (anteprima/costruisci.js)
   ------------------------------------------------------------
       node anteprima/costruisci.js && node anteprima/anteprima.prova.js

   Serve diretta/prove/risultati/anteprima/ su http://127.0.0.1:8790 e
   la apre come la apre claude.ai quando e' pubblicata: dentro un
   iframe con sandbox, con una CSP che ammette gli script solo dalla
   stessa origine e da cdnjs, e SENZA frame-src (gli iframe srcdoc
   devono funzionare lo stesso). Percorso: accesso di Mario Rossi con
   la sua email (nella guida gli accessi sono email, niente nomi utente),
   attesa, regia che manda in onda, video nella pagina del partecipante
   (modalita' A: il riquadro «Player Azoto (anteprima)», con sotto solo
   «Schermo intero» e la nota), la regia che passa tutti al flusso
   diretto (modalita' B: il video di prova con i nostri comandi) e poi
   di nuovo ad Azoto, senza ricaricare la pagina del partecipante;
   posta con le credenziali, file di esempio con l'anteprima, "Vedi
   come un partecipante", esportazione, la pagina di accesso con «Non
   sei ancora iscritto? Iscriviti qui.», password dimenticata con
   l'email (la stessa risposta per chi non e' iscritto, e a lui nessuna
   email).
   Screenshot in risultati/screenshot-anteprima/. Esce con 1 se
   qualcosa e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const { preparaContesto } = require('../rete-prove');

const PORTA = 8790;
const DIR = path.resolve(__dirname, '../risultati/anteprima');
const FOTO = path.resolve(__dirname, '../risultati/screenshot-anteprima');
fs.mkdirSync(FOTO, { recursive: true });

// la CSP piu' stretta che ci si puo' aspettare dove si pubblica l'anteprima
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; "
    + "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; "
    + "connect-src 'self'; frame-src 'none'; object-src 'none'";
const SCHELETRO = '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    + '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui;background:#fafaf8}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/ospite.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><html><body style="margin:0"><iframe id="artifact" src="/index.html" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" allow="fullscreen; clipboard-write" style="border:0;width:100vw;height:100vh;display:block"></iframe></body></html>');
        return;
    }
    const f = path.join(DIR, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('404'); return; }
    let corpo = fs.readFileSync(f);
    if (u.pathname === '/index.html' || u.pathname === '/') corpo = SCHELETRO + corpo.toString('utf8') + '</body></html>';
    res.writeHead(200, { 'content-type': TIPI[path.extname(f)] || 'application/octet-stream', 'content-security-policy': CSP, 'cache-control': 'no-store' });
    res.end(corpo);
});

let verdi = 0, rossi = 0;
function vero(c, d) { if (c) verdi++; else { rossi++; console.log('ROSSO  ' + d); } }

(async () => {
    // prima si ricostruisce l'anteprima dai file veri (un secondo)
    require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'costruisci.js')], { stdio: 'ignore' });
    await new Promise(r => server.listen(PORTA, '127.0.0.1', r));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const errori = [];
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'it-IT', timezoneId: 'Europe/Rome' });
        await preparaContesto(context, {});
        const page = await context.newPage();
        page.on('console', m => { if (m.type() === 'error') errori.push(m.text()); });
        page.on('pageerror', e => errori.push('pageerror: ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(0, 6).join(' <- ')));
        await page.goto('http://127.0.0.1:' + PORTA + '/ospite.html');
        const A = page.frameLocator('#artifact');
        const guscio = () => page.frame({ url: /index\.html/ });

        await A.locator('#preparazione').waitFor({ state: 'hidden', timeout: 30000 });
        vero(await A.locator('#tabella-accessi tr').count() === 4, 'quattro accessi di prova nella guida');
        const accessi = await A.locator('#tabella-accessi').innerText();
        vero(accessi.includes('mario.rossi@esempio.it') && accessi.includes('m.rossi@altraimpresa.it'), 'gli accessi sono le email (i due Mario Rossi, due email)');
        vero(!/mariorossi2|omonimo/i.test(accessi) && !/nome utente/i.test(await A.locator('#pannello-guida').innerText()), 'nella guida resta il nome utente');
        vero(/Next Generation Business 2026/.test(await A.locator('#info-evento').innerText()), 'la guida mostra l\'evento di prova');
        await page.screenshot({ path: path.join(FOTO, '01-guida.png') });

        // 1. Mario Rossi entra dal telefono: attesa
        await A.locator('#tabella-accessi button').first().click();
        const P = A.frameLocator('#fr-partecipante');
        await P.locator('body[data-vista="attesa"]').waitFor({ timeout: 20000 });
        vero(true, 'Mario Rossi entra e vede l\'attesa');
        vero(/Mario Rossi/.test(await P.locator('body').innerText()), 'la pagina saluta Mario Rossi');
        await page.screenshot({ path: path.join(FOTO, '02-attesa.png') });

        // 2. la regia entra e manda in onda
        await A.locator('#tab-guida').click();
        await A.locator('#btn-usa-gestore').click();
        const G = A.frameLocator('#fr-gestione');
        await G.locator('#sel-evento').waitFor({ state: 'visible', timeout: 20000 });
        vero(true, 'il gestore entra nella gestione');
        await G.locator('[data-scheda="regia"]').click();
        await G.locator('#btn-in-onda').click();
        await G.locator('#conferma-ok').click();
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(FOTO, '03-regia.png') });
        vero(/In onda/i.test(await A.locator('#stato-evento').innerText()), 'lo stato nella scheda Gestione diventa In onda');

        await A.locator('#tab-partecipante').click();
        await P.locator('body[data-vista="diretta"]').waitFor({ timeout: 20000 });
        vero(true, 'la pagina del partecipante passa alla diretta da sola');
        // modalita' A: il riquadro di prova al posto dell'iframe di Azoto; dei nostri comandi solo «Schermo intero» e la nota
        await P.locator('.player-azoto-anteprima').waitFor({ timeout: 10000 });
        await page.waitForTimeout(1000);
        const modoA = await P.locator('html').evaluate(h => {
            const vede = id => { const e = document.getElementById(id); return !!e && !!(e.offsetWidth || e.offsetHeight); };
            return { azoto: h.classList.contains('modo-azoto'), intero: vede('btn-schermo-intero'), nota: vede('nota-azoto'), play: vede('btn-play'), audio: vede('btn-attiva-audio'), iframe: document.querySelectorAll('iframe').length };
        });
        vero(modoA.azoto && modoA.intero && modoA.nota && !modoA.play && !modoA.audio && modoA.iframe === 0,
            'modalità A: il riquadro «Player Azoto (anteprima)», sotto solo «Schermo intero» e la nota ' + JSON.stringify(modoA));
        await page.screenshot({ path: path.join(FOTO, '04-diretta.png') });

        // la regia passa tutti al flusso diretto (modalita' B) e poi torna ad Azoto: la pagina del partecipante segue da sola
        await P.locator('html').evaluate(() => { window.__nonRicaricata = true; });
        await A.locator('#tab-gestione').click();
        await G.locator('#btn-passa-flusso').click();
        await G.locator('#conferma-ok').click();
        await A.locator('#tab-partecipante').click();
        await P.locator('canvas.ngb-player-anteprima').waitFor({ timeout: 15000 });
        await page.waitForTimeout(1200);
        const modoB = await P.locator('html').evaluate(h => ({
            flusso: h.classList.contains('modo-flusso'), play: !!document.getElementById('btn-play').offsetWidth,
            nota: !!document.getElementById('nota-azoto').offsetWidth, azoto: !!document.querySelector('.player-azoto-anteprima')
        }));
        vero(modoB.flusso && modoB.play && !modoB.nota && !modoB.azoto, 'la regia passa al flusso diretto: il video di prova con i nostri comandi ' + JSON.stringify(modoB));
        await page.screenshot({ path: path.join(FOTO, '04b-flusso.png') });
        await A.locator('#tab-gestione').click();
        await G.locator('#btn-passa-azoto').click();
        await G.locator('#conferma-ok').click();
        await A.locator('#tab-partecipante').click();
        await P.locator('.player-azoto-anteprima').waitFor({ timeout: 15000 });
        vero(await P.locator('canvas.ngb-player-anteprima').count() === 0 && await P.locator('html').evaluate(() => window.__nonRicaricata === true),
            'e torna al player Azoto, senza ricaricare la pagina');

        // 3. posta: le credenziali di Mario con la password della guida
        await A.locator('#tab-posta').click();
        const voci = await A.locator('#elenco-posta li button').count();
        vero(voci >= 5, 'nella posta di prova ci sono le email della semina (' + voci + ')');
        await A.locator('#elenco-posta li button', { hasText: 'credenziali' }).last().click();
        await page.waitForTimeout(600);
        const email = A.frameLocator('#lettore iframe');
        const testoEmail = await email.locator('body').innerText();
        vero(/Vesuv9Kaz3|Capr3Mare7|Pasta7Duke|Baba9Rum4x/.test(testoEmail), 'l\'email mostra una password della guida');
        vero(/mario\.rossi@esempio\.it|annamaria\.deluca@esempio\.it|nicolo\.dangelo@esempio\.it|m\.rossi@altraimpresa\.it/.test(testoEmail) && !/nome utente/i.test(testoEmail),
            'l\'email delle credenziali dice con quale email entrare, senza nome utente');
        await page.screenshot({ path: path.join(FOTO, '05-posta.png') });

        // 4. file di esempio: l'anteprima riga per riga nella gestione
        await A.locator('#tab-guida').click();
        await A.locator('#btn-file-esempio').click();
        await G.locator('#tabella-anteprima tr[data-riga]').first().waitFor({ timeout: 20000 });
        vero(await G.locator('#tabella-anteprima tr[data-riga]').count() > 5, 'il file di esempio produce l\'anteprima');
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(FOTO, '06-caricamento.png') });

        // il modello CSV si mostra invece di scaricarsi
        await G.locator('#link-modello').click();
        await A.locator('#sopra pre').waitFor({ timeout: 5000 });
        vero(/nome;cognome;email;azienda/.test(await A.locator('#sopra pre').innerText()), 'il modello CSV si apre nella finestra');
        await A.locator('#btn-chiudi-sopra').click();

        // 5. "Vedi come un partecipante": si apre sopra la gestione
        await G.locator('[data-scheda="regia"]').click();
        await G.locator('#btn-anteprima').click();
        await A.locator('#sopra').waitFor({ state: 'visible', timeout: 5000 });
        const S = A.frameLocator('#corpo-sopra iframe');
        await S.locator('body[data-vista="diretta"]').waitFor({ timeout: 20000 });
        vero(true, '"Vedi come un partecipante" mostra la diretta al gestore');
        await page.screenshot({ path: path.join(FOTO, '07-vedi-come.png') });
        await A.locator('#btn-chiudi-sopra').click();

        // 6. esportazione: si apre il contenuto invece di scaricare
        await G.locator('[data-scheda="esporta"]').click();
        await G.locator('#btn-esporta').click();
        await A.locator('#sopra .excel table').waitFor({ timeout: 15000 });
        vero(/mario\.rossi@esempio\.it/.test(await A.locator('#sopra .excel').innerText()), 'l\'esportazione mostra i partecipanti');
        await page.screenshot({ path: path.join(FOTO, '08-esporta.png') });
        await A.locator('#btn-chiudi-sopra').click();

        // 7. password dimenticata di un altro partecipante, dal telefono
        const prima = await A.locator('#elenco-posta li').count().catch(() => 0);
        void prima;
        await A.locator('#tab-partecipante').click();
        await P.locator('#btn-esci, [data-azione="esci"]').first().click().catch(() => {});
        await P.locator('#conferma-si, #btn-conferma-si').first().click().catch(() => {});
        await P.locator('#email').waitFor({ timeout: 15000 });
        vero((await P.locator('#frase-iscrizione').innerText()).trim() === 'Non sei ancora iscritto? Iscriviti qui.'
            && await P.locator('#link-iscrizione').getAttribute('href') === '/napoli_ottobre_2026/#accreditamento',
            'sotto «Entra»: «Non sei ancora iscritto? Iscriviti qui.» verso il modulo');
        await page.screenshot({ path: path.join(FOTO, '10-accesso.png') });
        const RISPOSTA = 'Se l\'indirizzo è iscritto alla diretta, tra poco ricevi un\'email con il collegamento per scegliere una nuova password. '
            + 'Controlla anche nella cartella Spam o Promozioni.';
        await P.locator('#link-dimenticata').click();
        // chi non e' iscritto: la stessa risposta, e nessuna email
        await A.locator('#tab-posta').click();
        const postaPrima = await A.locator('#elenco-posta li').count();
        await A.locator('#tab-partecipante').click();
        await P.locator('#email-dimenticata').fill('nessuno.iscritto@esempio.it');
        await P.locator('#btn-invia-reset').click();
        await P.locator('#msg-dimenticata', { hasText: 'Spam o Promozioni' }).waitFor({ timeout: 15000 });
        vero((await P.locator('#msg-dimenticata').innerText()).trim() === RISPOSTA && await P.locator('#frase-iscrizione-dimenticata').isVisible(),
            'chi non è iscritto: la risposta di sempre e «Non sei ancora iscritto? Iscriviti qui.»');
        await page.waitForTimeout(4500);
        await A.locator('#tab-posta').click();
        vero(await A.locator('#elenco-posta li').count() === postaPrima, 'a chi non è iscritto non parte nessuna email');
        // l'email di Anna Maria (scritta con le maiuscole): la stessa risposta, e il collegamento nella posta
        await A.locator('#tab-partecipante').click();
        await P.locator('#email-dimenticata').fill('AnnaMaria.DeLuca@esempio.it');
        await P.locator('#btn-invia-reset').click();
        await page.waitForTimeout(600);
        await P.locator('#msg-dimenticata', { hasText: 'Spam o Promozioni' }).waitFor({ timeout: 15000 });
        vero((await P.locator('#msg-dimenticata').innerText()).trim() === RISPOSTA, 'la risposta di «Password dimenticata?» è quella di sempre');
        await page.screenshot({ path: path.join(FOTO, '11-dimenticata.png') });
        await page.waitForTimeout(4500);
        await A.locator('#tab-posta').click();
        vero(/Nuova password/i.test(await A.locator('#elenco-posta').innerText()), 'l\'email di "password dimenticata" arriva nella posta');

        // telefono (390 px) su tutto il percorso: la guida
        await page.setViewportSize({ width: 390, height: 844 });
        await A.locator('#tab-guida').click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(FOTO, '09-guida-telefono.png'), fullPage: false });
        const largo = await page.frame({ url: /index\.html/ }).evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        vero(largo, 'a 390 px la guida non scorre di lato');
        void guscio;
    } catch (e) {
        rossi++;
        console.log('ROSSO  interrotta: ' + (e && e.message ? e.message.split('\n')[0] : e));
    } finally {
        const rilevanti = errori.filter(t => !/favicon|net::ERR_ABORTED|Failed to load resource: the server responded with a status of 404/.test(t));
        vero(rilevanti.length === 0, 'nessun errore in console: ' + rilevanti.slice(0, 6).join(' | '));
        await browser.close();
        server.close();
        console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
        process.exit(rossi ? 1 : 0);
    }
})();
