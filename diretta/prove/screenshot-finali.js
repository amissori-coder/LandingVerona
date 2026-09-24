/* ============================================================
   PROVE - gli screenshot da consegnare (diretta/screenshot/)
   ------------------------------------------------------------
       node diretta/prove/screenshot-finali.js

   Le prove lasciano i loro screenshot in risultati/ (non versionati).
   Questo file:
   1. scatta quello che manca: la gestione con l'anteprima del
      caricamento anche sul TELEFONO (le prove della gestione la
      guardano su computer e tablet), contro il servizio vero in
      locale (emulatori firestore 8680 / auth 9680, api 3680, sito 8695);
   2. raccoglie da risultati/ le schermate richieste, su telefono e
      computer, e le salva in JPEG (qualita' 82) in diretta/screenshot/,
      con i nomi in ordine: accesso, attesa, diretta, gestione con
      l'anteprima, email, popup della home, sezione di Napoli.
   Va lanciato DOPO le prove (esegui-tutte.js, e2e.prova.js,
   anteprima-email.js --screenshot).
   ============================================================ */
'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const PORTE = { firestore: 8680, auth: 9680, api: 3680, statico: 8695 };
const SITO = 'http://127.0.0.1:' + PORTE.statico;
const API = 'http://127.0.0.1:' + PORTE.api + '/api';
const RIS = path.resolve(__dirname, 'risultati');
const DEST = path.resolve(__dirname, '../screenshot');
const GESTORE = 'gestore@prova.it';
const PW = 'GestioneNapoli2026';
fs.mkdirSync(DEST, { recursive: true });

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + PORTE.firestore;
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + PORTE.auth;
const admin = require(path.resolve(__dirname, '../../email-service/node_modules/firebase-admin'));
const { chromium } = require('playwright');
const { preparaContesto } = require('./rete-prove');

const figli = [];
function avvia(argomenti, pronto, env) {
    return new Promise((ok, ko) => {
        const f = spawn(process.execPath, argomenti, { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, env || {}) });
        figli.push(f);
        let u = '';
        const t = setTimeout(() => ko(new Error('non parte: ' + u.slice(-800))), 150000);
        const l = d => { u += d; if (u.indexOf(pronto) >= 0) { clearTimeout(t); ok(); } };
        f.stdout.on('data', l); f.stderr.on('data', l);
    });
}
async function chiama(funzione, corpo, token) {
    const r = await fetch(API + '/' + funzione, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: SITO }, token ? { authorization: 'Bearer ' + token } : {}), body: JSON.stringify(corpo) });
    const j = await r.json();
    if (!r.ok || j.ok === false) throw new Error(funzione + ' ' + JSON.stringify(j).slice(0, 200));
    return j;
}

// da PNG a JPEG passando dal browser: niente librerie in piu'
async function inJpeg(browser, sorgente, destinazione) {
    const png = fs.readFileSync(sorgente);
    const page = await browser.newPage();
    const dim = await page.evaluate(async b64 => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        return { w: img.naturalWidth, h: img.naturalHeight };
    }, png.toString('base64'));
    await page.setViewportSize({ width: dim.w, height: Math.min(dim.h, 16000) });
    await page.setContent('<html><body style="margin:0"><img src="data:image/png;base64,' + png.toString('base64') + '" style="display:block"></body></html>');
    await page.screenshot({ path: destinazione, type: 'jpeg', quality: 82, fullPage: true });
    await page.close();
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    try {
        /* ---------- 1. la gestione con l'anteprima, telefono e computer ---------- */
        await avvia(['avvia-emulatori.js', '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], 'EMULATORI PRONTI');
        await avvia(['server-locale.js', '--api', String(PORTE.api), '--statico', String(PORTE.statico), '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)],
            'SERVER LOCALE PRONTO', { DIRETTA_POSTA_FINTA: path.join(RIS, 'posta-screenshot.jsonl'), DIRETTA_ADMIN_EMAILS: GESTORE });
        const app = admin.initializeApp({ projectId: 'demo-ngb-eventi' }, 'foto');
        await chiama('diretta-accesso', { azione: 'gestore-accesso', email: GESTORE });
        const u = await app.auth().getUserByEmail(GESTORE);
        await app.auth().updateUser(u.uid, { password: PW });
        const r = await fetch('http://127.0.0.1:' + PORTE.auth + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=finta', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: GESTORE, password: PW, returnSecureToken: true })
        });
        const token = (await r.json()).idToken;
        await chiama('diretta-gestione', { azione: 'evento-salva', evento: {
            id: 'napoli-2026', nuovo: true, titolo: 'Next Generation Business 2026 · Napoli', luogo: 'Napoli · Hotel Eurostars Excelsior',
            data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30', videoUrl: 'https://youtu.be/aaaaaaaaaaa',
            programma: [{ ora: '09.00', titolo: 'Accoglienza e registrazione' }, { ora: '09.30', titolo: 'Apertura dei lavori' }],
            paginaEvento: '/napoli_ottobre_2026/', unSoloDispositivo: false, promemoria: { giornoPrima: true, oraPrima: true }
        } }, token).catch(() => {});
        // una persona gia' presente, per vedere anche quel caso nell'anteprima
        await chiama('diretta-gestione', { azione: 'crea', idEvento: 'napoli-2026', righe: [{ riga: 2, nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@esempio.it', azienda: 'Rossi Costruzioni srl', nomeUtente: 'mariorossi' }] }, token).catch(() => {});

        for (const [nome, opz] of [
            ['telefono', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
            ['computer', { viewport: { width: 1440, height: 900 } }]
        ]) {
            const context = await browser.newContext(Object.assign({ locale: 'it-IT', timezoneId: 'Europe/Rome' }, opz));
            await preparaContesto(context, {});
            await context.addInitScript(p => { window.NGB_DIRETTA_PROVE = p; try { sessionStorage.setItem('ngbDirettaEmulatori', '1'); } catch (e) { /* niente */ } },
                { firestore: PORTE.firestore, auth: PORTE.auth, api: API });
            const page = await context.newPage();
            await page.goto(SITO + '/diretta/gestione/');
            await page.fill('#gestore-email', GESTORE);
            await page.fill('#gestore-password', PW);
            await page.click('#btn-gestore-entra');
            await page.waitForSelector('#sel-evento', { state: 'visible', timeout: 20000 });
            await page.waitForFunction(() => document.querySelector('#sel-evento option[value="napoli-2026"]'), null, { timeout: 20000 });
            await page.selectOption('#sel-evento', 'napoli-2026');
            await page.click('[data-scheda="partecipanti"]');
            await page.locator('#file-partecipanti').setInputFiles(path.join(__dirname, 'esempio-partecipanti.csv'));
            await page.waitForSelector('#tabella-anteprima tr[data-riga]', { timeout: 20000 });
            await page.waitForTimeout(800);
            // si parte dal riepilogo dell'anteprima: conteggi e problemi, poi le prime righe
            await page.evaluate(() => {
                const el = document.getElementById('riepilogo-anteprima') || document.getElementById('anteprima-caricamento');
                if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 130);
            });
            await page.waitForTimeout(300);
            await page.screenshot({ path: path.join(RIS, 'gestione-anteprima-' + nome + '.png') });
            await context.close();
        }

        /* ---------- 2. la raccolta ---------- */
        const scelta = [
            ['01-accesso-telefono', 'screenshot-e2e/02-accesso-telefono.png'],
            ['01-accesso-computer', 'screenshot-pagina/accesso-computer.png'],
            ['02-attesa-telefono', 'screenshot-e2e/03-attesa-telefono.png'],
            ['02-attesa-computer', 'screenshot-e2e/04-attesa-computer.png'],
            ['03-diretta-telefono', 'screenshot-e2e/06-diretta-telefono.png'],
            ['03-diretta-computer', 'screenshot-e2e/05-diretta-computer.png'],
            ['03-diretta-schermo-intero-telefono', 'screenshot-e2e/07-schermo-intero-telefono.png'],
            ['03-diretta-webtv-telefono', 'screenshot-webtv/diretta-webtv-telefono.png'],
            ['03-diretta-webtv-incorporata-telefono', 'screenshot-webtv/diretta-webtv-incorporato-telefono.png'],
            ['03-pausa-evento-computer', 'screenshot-pagina/pausa-evento-computer.png'],
            ['04-gestione-anteprima-telefono', 'gestione-anteprima-telefono.png'],
            ['04-gestione-anteprima-computer', 'gestione-anteprima-computer.png'],
            ['04-gestione-regia-computer', 'screenshot-gestione/computer-regia.png'],
            ['04-gestione-partecipanti-computer', 'screenshot-gestione/computer-partecipanti.png'],
            ['05-email-credenziali-telefono', 'email/screenshot/credenziali-telefono.png'],
            ['05-email-credenziali-computer', 'email/screenshot/credenziali-computer.png'],
            ['05-email-promemoria-telefono', 'email/screenshot/promemoria-ora-telefono.png'],
            ['06-popup-home-telefono', 'screenshot-sito/popup-home-telefono-in-diretta.png'],
            ['06-popup-home-computer', 'screenshot-sito/popup-home-computer-in-diretta.png'],
            ['06-popup-home-prima-computer', 'screenshot-sito/popup-home-computer-prima.png'],
            ['07-napoli-sezione-telefono', 'screenshot-sito/napoli-sezione-telefono-in-diretta.png'],
            ['07-napoli-sezione-computer', 'screenshot-sito/napoli-sezione-computer-in-diretta.png'],
            ['07-napoli-menu-telefono', 'screenshot-sito/napoli-barra-telefono-in-diretta.png']
        ];
        for (const [nome, sorgente] of scelta) {
            const s = path.join(RIS, sorgente);
            if (!fs.existsSync(s)) { console.log('manca ' + sorgente); continue; }
            await inJpeg(browser, s, path.join(DEST, nome + '.jpg'));
            console.log('ok  ' + nome + '.jpg');
        }
    } finally {
        await browser.close();
        figli.forEach(f => { try { f.kill('SIGINT'); } catch (e) { /* gia' fermo */ } });
        setTimeout(() => process.exit(0), 1500);
    }
})().catch(e => { console.error(e); figli.forEach(f => { try { f.kill('SIGINT'); } catch (x) { /* niente */ } }); process.exit(1); });
