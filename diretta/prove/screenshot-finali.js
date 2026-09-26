/* ============================================================
   PROVE - gli screenshot da consegnare (diretta/screenshot/)
   ------------------------------------------------------------
       node diretta/prove/screenshot-finali.js

   Le prove lasciano i loro screenshot in risultati/ (non versionati).
   Questo file:
   1. scatta quello che manca, contro il servizio vero in locale
      (emulatori firestore 8680 / auth 9680, api 3680, sito 8695), su
      telefono (390x844) e computer (1440x900):
      - l'accesso della diretta con l'EMAIL (01-accesso-*: «Email»,
        «Password», «Entra», «Password dimenticata?» e «Non sei ancora
        iscritto? Iscriviti qui.») e «Password dimenticata?» con la
        risposta di sempre e l'invito a guardare nello Spam
        (01-accesso-dimenticata-*);
      - la gestione con l'interruttore «Invia subito la password a chi
        si iscrive dal modulo del sito», acceso
        (04-gestione-iscrizioni-automatiche-*);
      - la gestione con l'anteprima del caricamento per email (le prove
        della gestione la guardano su computer e tablet): una persona
        gia' registrata, la stessa email per persone diverse, le righe
        doppie, le email mancanti o non valide;
   2. raccoglie da risultati/ le schermate richieste, su telefono e
      computer, e le salva in JPEG (qualita' 82) in diretta/screenshot/,
      con i nomi in ordine: accesso, attesa, diretta, gestione con
      l'anteprima e l'interruttore, email (le credenziali con l'email e
      la password, «Sei iscritto anche a…»), popup della home, sezione
      di Napoli.
      La diretta ha due modalita' (telefono 390x844, computer 1440x900):
      - A, il player di Azoto in un iframe (la predefinita): la
        fotografa webtv.prova.js (03-diretta-azoto-*): in diretta, a
        schermo intero (sul computer lo schermo intero vero; sul
        telefono la vista a pagina intera orizzontale di iPhone, con il
        riquadro ruotato: la foto e' lo schermo del telefono tenuto in
        verticale) e con il player che non risponde (dopo 15 s «La
        diretta sta arrivando, attendi qualche secondo»); l'attesa la
        fotografa e2e.prova.js (02-attesa-*), che usa la modalita' A;
      - B, il flusso diretto nel nostro player: webtv.prova.js (con
        «IN DIRETTA», i comandi e la qualita'; indietro nella diretta
        con la barra e «Torna in diretta»; «Stiamo ricollegando la
        diretta…»; «Video non disponibile») e pagina.prova.js (lo
        schermo intero del telefono, la pausa dell'evento).
      La gestione con il campo «Tipo di player» la fotografa
      gestione.prova.js (04-gestione-tipo-player-*).
   Va lanciato DOPO le prove (esegui-tutte.js, e2e.prova.js,
   anteprima-email.js --screenshot: le email si fotografano da li'). Le foto che una prova non ha
   lasciato si segnalano con «manca» (e restano quelle di prima); quelle
   che non si fanno piu' si tolgono.
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

/* Il browser non esce MAI in rete da solo: quello che serve lo danno le
   regole di rete-prove.js e flusso-prova.js (context.route). Senza proxy
   e senza DNS (tranne 127.0.0.1) qualunque richiesta sfuggita alle regole
   fallisce invece di uscire: mai la rete vera di Azoto (il 25/09 il
   rimando 301 del player finto sfuggiva alle regole e andava verso
   l'Azoto vero; ora lo segue instradaAzoto, e questa e' la rete di
   sicurezza). */
const LANCIO = {
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']
};

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + PORTE.firestore;
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + PORTE.auth;
const admin = require(path.resolve(__dirname, '../../email-service/node_modules/firebase-admin'));
const { chromium } = require('playwright');
const { preparaContesto } = require('./rete-prove');
const F = require('./flusso-prova');

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
    const browser = await chromium.launch(LANCIO);
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
            data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30', azotoUrl: F.PLAYER_AZOTO, videoUrl: 'https://webtv.esempio.it/live/napoli/playlist.m3u8',
            programma: [{ ora: '09.00', titolo: 'Accoglienza e registrazione' }, { ora: '09.30', titolo: 'Apertura dei lavori' }],
            paginaEvento: '/napoli_ottobre_2026/', unSoloDispositivo: false, promemoria: { giornoPrima: true, oraPrima: true }
        } }, token).catch(() => {});
        /* due persone gia' registrate (a un evento passato), per vedere anche quei casi
           nell'anteprima: Giulia Ferri (riga 5 del file: «Già registrata») e Mario
           Rossi, la cui email nel file e' scritta per Marta Rossi (riga 12: «Email
           condivisa») */
        await chiama('diretta-gestione', { azione: 'evento-salva', evento: {
            id: 'roma-2026', nuovo: true, titolo: 'Next Generation Business 2026 · Roma', luogo: 'Roma', data: '2026-04-17', oraInizio: '09:00', oraFine: '17:00',
            programma: [], paginaEvento: '/roma_aprile_2026/'
        } }, token).catch(() => {});
        await chiama('diretta-gestione', { azione: 'crea', idEvento: 'roma-2026', righe: [
            { riga: 2, nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@altra-azienda.example', azienda: 'Altra Azienda S.p.A.' },
            { riga: 3, nome: 'Giulia', cognome: 'Ferri', email: 'giulia.ferri@ferri-consulting.example', azienda: 'Ferri Consulting' }
        ] }, token).catch(() => {});
        // e una persona dell'evento di Napoli, per l'accesso
        await chiama('diretta-gestione', { azione: 'crea', idEvento: 'napoli-2026', righe: [{ riga: 2, nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@esempio.it', azienda: 'Rossi Costruzioni srl' }] }, token).catch(() => {});
        // l'interruttore acceso, com'e' dopo la prima lista
        await chiama('diretta-gestione', { azione: 'evento-iscrizioni', idEvento: 'napoli-2026', iscrizioniAutomatiche: true }, token);

        /* ---------- l'accesso con l'email e «Password dimenticata?» ---------- */
        for (const [nome, opz] of [
            ['telefono', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
            ['computer', { viewport: { width: 1440, height: 900 } }]
        ]) {
            const context = await browser.newContext(Object.assign({ locale: 'it-IT', timezoneId: 'Europe/Rome' }, opz));
            await preparaContesto(context, {});
            await F.instradaAzoto(context);
            await context.addInitScript(p => { window.NGB_DIRETTA_PROVE = p; try { sessionStorage.setItem('ngbDirettaEmulatori', '1'); } catch (e) { /* niente */ } },
                { firestore: PORTE.firestore, auth: PORTE.auth, api: API });
            const page = await context.newPage();
            await page.goto(SITO + '/diretta/?e=napoli-2026');
            await page.waitForSelector('body[data-vista="accesso"]', { timeout: 30000 });
            await page.fill('#email', 'mario.rossi@esempio.it');
            await page.fill('#campo-password', 'Password9Esempio');
            await page.evaluate(() => document.fonts && document.fonts.ready);
            await page.waitForTimeout(300);
            if ((await page.textContent('#frase-iscrizione')).trim() !== 'Non sei ancora iscritto? Iscriviti qui.' || !(await page.isVisible('#frase-iscrizione'))) {
                throw new Error('accesso: manca «Non sei ancora iscritto? Iscriviti qui.»');
            }
            await page.screenshot({ path: path.join(RIS, 'accesso-email-' + nome + '.png') });
            await page.click('#link-dimenticata');
            await page.waitForSelector('body[data-vista="dimenticata"]', { timeout: 10000 });
            await page.fill('#email-dimenticata', 'mario.rossi@esempio.it');
            await page.click('#btn-invia-reset');
            await page.waitForFunction(() => /Spam o Promozioni/.test(document.getElementById('msg-dimenticata').textContent), null, { timeout: 15000 });
            await page.waitForTimeout(300);
            await page.screenshot({ path: path.join(RIS, 'accesso-dimenticata-' + nome + '.png') });
            await context.close();
        }

        for (const [nome, opz] of [
            ['telefono', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
            ['computer', { viewport: { width: 1440, height: 900 } }]
        ]) {
            const context = await browser.newContext(Object.assign({ locale: 'it-IT', timezoneId: 'Europe/Rome' }, opz));
            await preparaContesto(context, {});
            // il player di Azoto finto: la gestione non deve mai arrivare alla rete vera di Azoto
            await F.instradaAzoto(context);
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
            // l'interruttore delle iscrizioni dal modulo del sito, nella scheda Evento
            await page.waitForFunction(() => document.getElementById('ev-iscrizioni-auto').checked, null, { timeout: 10000 });
            // le righe dei promemoria arrivano un attimo dopo (email-stato) e spostano il riquadro: si aspettano
            await page.waitForFunction(() => document.getElementById('prom-dest-giorno').textContent.trim() !== '', null, { timeout: 10000 });
            await page.waitForTimeout(500);
            /* il riquadro e' l'ultimo della scheda: sul telefono, perche' si veda tutto
               sotto la testata, lo schermo si allunga quanto serve (larghezza uguale) */
            const vista = page.viewportSize();
            const serve = await page.evaluate(() => Math.ceil(document.getElementById('riquadro-iscrizioni').getBoundingClientRect().height
                + document.querySelector('.testata').getBoundingClientRect().height + 40));
            if (serve > vista.height) await page.setViewportSize({ width: vista.width, height: serve });
            await page.evaluate(() => {
                const el = document.getElementById('riquadro-iscrizioni');
                const t = document.querySelector('.testata');
                window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - (t ? t.getBoundingClientRect().height : 0) - 16);
            });
            await page.waitForTimeout(300);
            await page.screenshot({ path: path.join(RIS, 'gestione-iscrizioni-' + nome + '.png') });
            await page.setViewportSize(vista);
            await page.click('[data-scheda="partecipanti"]');
            await page.locator('#file-partecipanti').setInputFiles(path.join(__dirname, 'esempio-partecipanti.csv'));
            // le righe ci sono tutte; con dei problemi si vedono solo quelle da controllare
            await page.waitForSelector('#tabella-anteprima tr[data-riga]', { state: 'attached', timeout: 20000 });
            // gli esiti arrivano dal servizio (anteprima per email)
            await page.waitForFunction(() => /righe lette/.test(document.getElementById('riepilogo-anteprima').textContent), null, { timeout: 20000 });
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
            ['01-accesso-telefono', 'accesso-email-telefono.png'],
            ['01-accesso-computer', 'accesso-email-computer.png'],
            ['01-accesso-dimenticata-telefono', 'accesso-dimenticata-telefono.png'],
            ['01-accesso-dimenticata-computer', 'accesso-dimenticata-computer.png'],
            ['02-attesa-telefono', 'screenshot-e2e/03-attesa-telefono.png'],
            ['02-attesa-computer', 'screenshot-e2e/04-attesa-computer.png'],
            ['03-diretta-azoto-telefono', 'screenshot-webtv/azoto-telefono.png'],
            ['03-diretta-azoto-computer', 'screenshot-webtv/azoto-computer.png'],
            ['03-diretta-azoto-schermo-intero-telefono', 'screenshot-webtv/azoto-schermo-intero-telefono.png'],
            ['03-diretta-azoto-schermo-intero-computer', 'screenshot-webtv/azoto-schermo-intero-computer.png'],
            ['03-diretta-azoto-lenta-telefono', 'screenshot-webtv/azoto-lenta-telefono.png'],
            ['03-diretta-azoto-lenta-computer', 'screenshot-webtv/azoto-lenta-computer.png'],
            ['03-diretta-telefono', 'screenshot-webtv/diretta-telefono.png'],
            ['03-diretta-computer', 'screenshot-webtv/diretta-computer.png'],
            ['03-diretta-indietro-telefono', 'screenshot-webtv/dvr-telefono.png'],
            ['03-diretta-indietro-computer', 'screenshot-webtv/dvr-computer.png'],
            ['03-diretta-ricollegamento-telefono', 'screenshot-webtv/ricollegamento-telefono.png'],
            ['03-diretta-ricollegamento-computer', 'screenshot-webtv/ricollegamento-computer.png'],
            ['03-diretta-non-disponibile-telefono', 'screenshot-webtv/non-disponibile-telefono.png'],
            ['03-diretta-non-disponibile-computer', 'screenshot-webtv/non-disponibile-computer.png'],
            ['03-diretta-schermo-intero-telefono', 'screenshot-pagina/diretta-schermo-intero-telefono.png'],
            ['03-pausa-evento-computer', 'screenshot-pagina/pausa-evento-computer.png'],
            ['04-gestione-tipo-player-telefono', 'screenshot-gestione-azoto/01-evento-tipo-player-telefono.png'],
            ['04-gestione-tipo-player-computer', 'screenshot-gestione-azoto/01-evento-tipo-player-computer.png'],
            ['04-gestione-iscrizioni-automatiche-telefono', 'gestione-iscrizioni-telefono.png'],
            ['04-gestione-iscrizioni-automatiche-computer', 'gestione-iscrizioni-computer.png'],
            ['04-gestione-anteprima-telefono', 'gestione-anteprima-telefono.png'],
            ['04-gestione-anteprima-computer', 'gestione-anteprima-computer.png'],
            ['04-gestione-regia-computer', 'screenshot-gestione/computer-regia.png'],
            ['04-gestione-partecipanti-computer', 'screenshot-gestione/computer-partecipanti.png'],
            ['05-email-credenziali-telefono', 'email/screenshot/credenziali-telefono.png'],
            ['05-email-credenziali-computer', 'email/screenshot/credenziali-computer.png'],
            ['05-email-iscritto-anche-telefono', 'email/screenshot/iscritto-anche-telefono.png'],
            ['05-email-iscritto-anche-computer', 'email/screenshot/iscritto-anche-computer.png'],
            ['05-email-promemoria-telefono', 'email/screenshot/promemoria-ora-telefono.png'],
            ['06-popup-home-telefono', 'screenshot-sito/popup-home-telefono-in-diretta.png'],
            ['06-popup-home-computer', 'screenshot-sito/popup-home-computer-in-diretta.png'],
            ['06-popup-home-prima-computer', 'screenshot-sito/popup-home-computer-prima.png'],
            ['07-napoli-sezione-telefono', 'screenshot-sito/napoli-sezione-telefono-in-diretta.png'],
            ['07-napoli-sezione-computer', 'screenshot-sito/napoli-sezione-computer-in-diretta.png'],
            ['07-napoli-menu-telefono', 'screenshot-sito/napoli-barra-telefono-in-diretta.png']
        ];
        // le foto di prima che non si fanno piu' (il player di prima, i nomi vecchi, il ripiego incorporato di altri siti)
        ['03-diretta-webtv-telefono', '03-diretta-webtv-incorporata-telefono', '03-diretta-incorporata-telefono',
            '04-gestione-ripiego-iframe-telefono', '04-gestione-ripiego-iframe-computer'].forEach(n => {
            const f = path.join(DEST, n + '.jpg');
            if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('tolta ' + n + '.jpg'); }
        });
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
