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
    // il Chromium di Playwright: quello della versione fissata, se c'e', altrimenti quello installato con Playwright
    const cromo = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(f => fs.existsSync(f));
    const browser = await chromium.launch(cromo ? { executablePath: cromo } : {});
    const errori = [];
    let page = null;
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'it-IT', timezoneId: 'Europe/Rome' });
        await preparaContesto(context, {});
        page = await context.newPage();
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
        /* modalita' A con il video di YouTube: la registrazione che sembra una diretta (qui il riquadro di
           prova, che mostra il punto della registrazione), con i NOSTRI comandi: audio, volume, «In diretta»,
           «Schermo intero»; niente pausa e niente nota di Azoto */
        await P.locator('.player-youtube-anteprima').waitFor({ timeout: 10000 });
        await page.waitForTimeout(1000);
        const modoA = await P.locator('html').evaluate(h => {
            const vede = id => { const e = document.getElementById(id); return !!e && !!(e.offsetWidth || e.offsetHeight); };
            return {
                azoto: h.classList.contains('modo-azoto'), youtube: h.classList.contains('modo-youtube'), intero: vede('btn-schermo-intero'), nota: vede('nota-azoto'),
                play: vede('btn-play'), audio: vede('btn-attiva-audio'), muto: vede('btn-muto'), live: vede('indicatore-live'), iframe: document.querySelectorAll('iframe').length
            };
        });
        vero(modoA.azoto && modoA.youtube && modoA.intero && !modoA.nota && !modoA.play && modoA.audio && modoA.muto && modoA.live && modoA.iframe === 0,
            'il video di YouTube: la registrazione con i nostri comandi (audio, «In diretta», «Schermo intero»), niente pausa né nota di Azoto ' + JSON.stringify(modoA));
        const orologio = async () => ((await P.locator('.player-youtube-anteprima').innerText()).match(/\b\d+:\d\d(?::\d\d)?\b/) || [''])[0];
        const t1 = await orologio();
        await page.waitForTimeout(2300);
        const t2 = await orologio();
        vero(/Registrazione YouTube \(anteprima\)/.test(await P.locator('.player-youtube-anteprima').innerText()) && t1 && t2 && t1 !== t2,
            'il riquadro mostra il punto della registrazione, che va avanti da «In onda» (' + t1 + ' → ' + t2 + ')');
        await P.locator('#btn-attiva-audio').click();
        await page.waitForTimeout(300);
        vero(/Audio attivo/.test(await P.locator('.player-youtube-anteprima').innerText()) && !(await P.locator('#btn-attiva-audio').isVisible()),
            '«Attiva l\'audio» lo attiva (e il pulsante sparisce)');
        await page.screenshot({ path: path.join(FOTO, '04-diretta.png') });

        // 2b. LE DOMANDE AL RELATORE: il riquadro sotto il video, l'invio, la pagina del relatore, la regia
        await P.locator('#vista-diretta #carta-domande').waitFor({ state: 'visible', timeout: 10000 });
        vero(/Fai una domanda al relatore/.test(await P.locator('#carta-domande').innerText()), 'sotto il video: «Fai una domanda al relatore»');
        await P.locator('#testo-domanda').fill('  Quali controlli servono   a una società che si quota in Borsa?  ');
        await P.locator('#btn-invia-domanda').click();
        await P.locator('#esito-domanda[data-tipo="ok"]').waitFor({ timeout: 10000 });
        vero(/Domanda inviata/.test(await P.locator('#esito-domanda').innerText()) && await P.locator('#testo-domanda').inputValue() === '',
            'la domanda parte: «Domanda inviata» e il campo si svuota');
        vero(await P.locator('#elenco-mie .mia-domanda').count() === 1
            && /Quali controlli servono a una società/.test(await P.locator('#elenco-mie').innerText()), 'compare fra «Le tue domande», ripulita');
        vero(await P.locator('#btn-invia-domanda').isDisabled() && /tra \d+ s/.test(await P.locator('#btn-invia-domanda').innerText()),
            'per qualche secondo il pulsante aspetta, con il conto alla rovescia');
        await page.screenshot({ path: path.join(FOTO, '04c-domanda.png') });

        await A.locator('#tab-guida').click();
        vero(/laura\.verdi@esempio\.it/.test(await A.locator('#relatore-email').innerText()), 'la guida mostra l\'accesso della relatrice (una partecipante)');
        await A.locator('#btn-usa-relatore').click();
        const R = A.frameLocator('#fr-relatore');
        await R.locator('body[data-vista="app"]').waitFor({ timeout: 20000 });
        await R.locator('#elenco-domande .domanda').nth(2).waitFor({ timeout: 15000 });
        const testiR = await R.locator('#elenco-domande .domanda-testo').allInnerTexts();
        vero(testiR.length === 3 && /Borsa/.test(testiR[2]) && /srl che supera/.test(testiR[0]), 'il relatore vede le tre domande, dalla prima arrivata ' + JSON.stringify(testiR));
        const terza = await R.locator('#elenco-domande .domanda').nth(2).innerText();
        vero(/Mario Rossi/.test(terza) && /Rossi Costruzioni/.test(terza) && /n\. 3/.test(terza), 'con numero, nome, cognome e azienda di chi l\'ha scritta');
        vero(!/@/.test(await R.locator('#elenco-domande').innerText()), 'al relatore nessuna email');
        await R.locator('#elenco-partecipanti .partecipante').nth(4).waitFor({ timeout: 15000 });
        const partR = await R.locator('#elenco-partecipanti').innerText();
        vero(await R.locator('#elenco-partecipanti .partecipante').count() === 5 && /De Luca/.test(partR) && !/@/.test(partR)
            && /Verdi Laura\s*relatore/i.test(partR),
            'la relatrice vede i cinque iscritti (lei compresa, segnata «relatore»), senza email', partR);
        await R.locator('#elenco-partecipanti .partecipante[data-collegato="1"]').first().waitFor({ timeout: 40000 });
        vero(/5 iscritti · 1 collegato adesso/.test(await R.locator('#conteggi-partecipanti').innerText())
            && /Rossi Costruzioni/.test(await R.locator('#elenco-partecipanti .partecipante[data-collegato="1"]').first().innerText()),
            'e chi è collegato adesso (Mario Rossi, dal telefono)');
        vero(/In onda/i.test(await R.locator('#stato-evento').innerText()), 'la pagina del relatore dice che la diretta è in onda');
        await page.screenshot({ path: path.join(FOTO, '12-relatore.png') });

        // «Segna come risposta»: esce da «Da rispondere», con «Annulla»
        await R.locator('#elenco-domande .domanda').nth(2).locator('.btn-segna').click();
        await R.locator('.avviso-azione').waitFor({ timeout: 10000 });
        vero(await R.locator('#elenco-domande .domanda').count() === 2 && (await R.locator('#numero-risposte').innerText()).trim() === '1',
            '«Segna come risposta»: la domanda passa fra «Con risposta»');
        await R.locator('[data-filtro="risposte"]').click();
        vero(/Risposta data/.test(await R.locator('#elenco-domande').innerText()) && /Borsa/.test(await R.locator('#elenco-domande').innerText()),
            'fra «Con risposta», con «Risposta data» e l\'ora');
        await R.locator('#btn-testo-grande').click();
        vero(await R.locator('body.testo-grande').count() === 1, '«AA» ingrandisce il testo delle domande');
        await page.screenshot({ path: path.join(FOTO, '13-relatore-risposta.png') });
        await R.locator('#btn-testo-grande').click();
        await R.locator('[data-filtro="aperte"]').click();

        // la regia: nella scheda Partecipanti la relatrice ha il segno «relatore»
        await A.locator('#tab-gestione').click();
        await G.locator('[data-scheda="partecipanti"]').click();
        await G.locator('#tabella-partecipanti .origine-relatore').first().waitFor({ timeout: 15000 });
        const rigaRel = await G.locator('#tabella-partecipanti tr', { has: G.locator('.origine-relatore') }).innerText();
        vero(await G.locator('#tabella-partecipanti .origine-relatore').count() === 1 && /Laura Verdi/.test(rigaRel),
            'Gestione → Partecipanti: Laura Verdi ha il segno «relatore»', rigaRel);
        await G.locator('[data-scheda="evento"]').click();
        vero(/Relatori:\s*Laura Verdi/.test(await G.locator('.relatori-elenco').innerText()), 'Gestione → Evento: «Relatori: Laura Verdi»');
        await G.locator('[data-scheda="regia"]').click();
        // la regia: le stesse domande, con l'email e chi ha segnato la risposta
        await G.locator('#regia-elenco-domande .regia-domanda').first().waitFor({ timeout: 15000 });
        await G.locator('.filtro-domande[data-filtro="tutte"]').click();
        // la regia rilegge ogni 8 secondi: la domanda di Mario e il segno del relatore arrivano al giro dopo
        await G.locator('#regia-elenco-domande .regia-domanda.risposta').first().waitFor({ timeout: 20000 });
        const regiaD = await G.locator('#regia-elenco-domande').innerText();
        vero(await G.locator('#regia-elenco-domande .regia-domanda').count() === 3 && /mario\.rossi@esempio\.it/.test(regiaD)
            && /Risposta data.*laura\.verdi@esempio\.it/.test(regiaD), 'in Regia le stesse tre domande, con le email e chi ha segnato la risposta');
        await G.locator('#regia-domande').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(FOTO, '14-regia-domande.png') });

        // il partecipante vede che il relatore ha risposto
        await A.locator('#tab-partecipante').click();
        await P.locator('#elenco-mie .mia-risposta').waitFor({ timeout: 30000 });
        vero(/Il relatore ha risposto/.test(await P.locator('#elenco-mie').innerText()), 'il partecipante vede «Il relatore ha risposto»');
        await page.screenshot({ path: path.join(FOTO, '15-risposta-partecipante.png') });

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
            nota: !!document.getElementById('nota-azoto').offsetWidth, azoto: !!document.querySelector('.player-youtube-anteprima')
        }));
        vero(modoB.flusso && modoB.play && !modoB.nota && !modoB.azoto, 'la regia passa al flusso diretto: il video di prova con i nostri comandi ' + JSON.stringify(modoB));
        await page.screenshot({ path: path.join(FOTO, '04b-flusso.png') });
        await A.locator('#tab-gestione').click();
        await G.locator('#btn-passa-azoto').click();
        await G.locator('#conferma-ok').click();
        await A.locator('#tab-partecipante').click();
        await P.locator('.player-youtube-anteprima').waitFor({ timeout: 15000 });
        vero(await P.locator('canvas.ngb-player-anteprima').count() === 0 && await P.locator('html').evaluate(() => window.__nonRicaricata === true),
            'e torna al video di YouTube, senza ricaricare la pagina');

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
        /* Con righe da sistemare la tabella si apre su «Solo da controllare»: la
           prima riga del file (una persona nuova) e' nascosta. Si aspetta una
           riga qualunque visibile, non proprio la prima. */
        await G.locator('#tabella-anteprima tr[data-riga]:visible').first().waitFor({ timeout: 20000 });
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

        // 8. la relatrice entra dalla pagina della diretta (il collegamento dell'email): va da sola alla pagina del relatore
        await A.locator('#tab-partecipante').click();
        // la pagina e' rimasta su «Password dimenticata?»: si ricarica (nessuno e' collegato su questo telefono)
        await A.locator('#btn-ricarica-partecipante').click();
        await P.locator('#email').waitFor({ timeout: 15000 });
        await P.locator('#email').fill('laura.verdi@esempio.it');
        await P.locator('#campo-password').fill('Scena4Rapt');
        await P.locator('#btn-entra').click();
        await A.locator('#tab-relatore[aria-selected="true"]').waitFor({ timeout: 20000 });
        await R.locator('body[data-vista="app"]').waitFor({ timeout: 20000 });
        vero(/laura\.verdi@esempio\.it/.test(await R.locator('#utente-connesso').innerText()), 'la relatrice entra dalla diretta e va da sola alla pagina del relatore');
        vero(/vista=diretta/.test(await R.locator('#link-guarda-diretta').getAttribute('href')), 'nella pagina del relatore «Guarda la diretta» riapre la diretta per lei');
        await A.locator('#tab-partecipante').click();
        await P.locator('#box-relatore').waitFor({ state: 'visible', timeout: 30000 });
        vero(!(await P.locator('#modulo-domanda').isVisible()), 'nella diretta, al posto del modulo, «Apri le domande dei partecipanti»');

        // telefono (390 px) su tutto il percorso: la guida
        await page.setViewportSize({ width: 390, height: 844 });
        await A.locator('#tab-guida').click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(FOTO, '09-guida-telefono.png'), fullPage: false });
        const largo = await page.frame({ url: /index\.html/ }).evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        vero(largo, 'a 390 px la guida non scorre di lato');
        // la pagina del relatore sul telefono: una sezione alla volta, niente scorrimento di lato
        await A.locator('#tab-relatore').click();
        await page.waitForTimeout(600);
        const relTel = await R.locator('html').evaluate(() => ({
            largo: document.documentElement.scrollWidth <= window.innerWidth + 1,
            domande: !!document.getElementById('sezione-domande').offsetWidth,
            partecipanti: !!document.getElementById('sezione-partecipanti').offsetWidth,
            scambio: !!document.getElementById('btn-sezione-partecipanti').offsetWidth
        }));
        vero(relTel.largo && relTel.domande && !relTel.partecipanti && relTel.scambio, 'a 390 px la pagina del relatore mostra le domande, con il pulsante per i partecipanti ' + JSON.stringify(relTel));
        await page.screenshot({ path: path.join(FOTO, '16-relatore-telefono.png') });
        await R.locator('#btn-sezione-partecipanti').click();
        vero(await R.locator('#sezione-partecipanti').isVisible() && !(await R.locator('#sezione-domande').isVisible()), 'e i partecipanti con un tocco');
        void guscio;
    } catch (e) {
        rossi++;
        console.log('ROSSO  interrotta: ' + (e && e.message ? e.message.split('\n').slice(0, 3).join(' | ') : e));
        try { if (page) await page.screenshot({ path: path.join(FOTO, '99-interrotta.png') }); } catch (e2) { /* niente */ }
    } finally {
        const rilevanti = errori.filter(t => !/favicon|net::ERR_ABORTED|Failed to load resource: the server responded with a status of 404/.test(t));
        vero(rilevanti.length === 0, 'nessun errore in console: ' + rilevanti.slice(0, 6).join(' | '));
        await browser.close();
        server.close();
        console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
        process.exit(rossi ? 1 : 0);
    }
})();
