/* ============================================================
   PROVE - anteprima delle email della diretta
   ------------------------------------------------------------
       node diretta/prove/anteprima-email.js [--screenshot]

   Scrive in diretta/prove/risultati/email/ le email di esempio per
   l'evento di Napoli, con dati di esempio evidenti (Mario Rossi,
   email mario.rossi@esempio.it, password Esempio7Kq), cosi' come le
   compone il servizio (email-service/lib/diretta-mail.js). Si entra
   con l'email: nessun nome utente.
     credenziali.html            le credenziali (primo invio): «vai su...,
                                 scrivi la tua email ... e questa password: ...»
     iscritto-anche.html         «Sei iscritto anche a...»: chi ha gia' una
                                 password, iscritto a un evento in piu' (niente password)
     credenziali-reinvio.html    il reinvio ("sostituisce le precedenti")
     credenziali-altro-evento.html  il "Reinvia" del gestore a chi aveva gia'
                                 le credenziali di un altro evento (stessa email, password nuova)
     credenziali-prova.html      l'email di prova per il gestore
     promemoria-giorno.html      il giorno prima
     promemoria-ora.html         un'ora prima
     reimpostazione.html         "Password dimenticata?"
     reimpostazione-gestore.html il primo accesso di un gestore
   Per ognuna anche la versione in solo testo (.txt) e l'oggetto, e
   un indice.html che le mette in fila.

   Con --screenshot fa anche le immagini (computer 1280 px e telefono
   390 px) in risultati/email/screenshot/, con il Chromium di
   Playwright. Le immagini dell'email (logo e fascia) puntano al sito
   pubblico: qui si servono dai file del repository, che sono gli
   stessi, senza uscire in rete.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

// i collegamenti dell'anteprima sono quelli veri del sito pubblico
delete process.env.APP_BASE_URL;
delete process.env.DIRETTA_ASSISTENZA_EMAIL;
delete process.env.DIRETTA_ASSISTENZA_TELEFONO;

const RADICE = path.resolve(__dirname, '../..');
const M = require(path.join(RADICE, 'email-service/lib/diretta-mail'));
const C = require(path.join(RADICE, 'email-service/lib/diretta-comune'));
const CARTELLA = path.resolve(__dirname, 'risultati/email');

const EVENTO = {
    id: 'napoli-2026',
    titolo: 'Next Generation Business 2026 · Napoli',
    luogo: 'Napoli · Hotel Eurostars Excelsior',
    data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30',
    inizio: C.istanteRoma('2026-10-02', '09:00'),
    fine: C.istanteRoma('2026-10-02', '17:30'),
    paginaEvento: '/napoli_ottobre_2026/'
};
const PERSONA = { nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@esempio.it', password: 'Esempio7Kq' };
const ASSISTENZA = C.assistenza();
// il collegamento (/diretta/?e=napoli-2026) lo compone diretta-mail.js dall'evento: l'email non entra nei collegamenti
const comuni = {
    evento: EVENTO, idEvento: EVENTO.id, nome: PERSONA.nome, cognome: PERSONA.cognome, email: PERSONA.email,
    paginaEvento: EVENTO.paginaEvento, assistenza: ASSISTENZA
};
const QUANDO_CREDENZIALI = C.istanteRoma('2026-09-28', '10:00');
const LINK_RESET = C.baseSito() + '/diretta/reimposta.html?oobCode=ESEMPIO-codice-monouso';

const EMAIL = [
    ['credenziali', 'Credenziali (primo invio)', M.credenziali(Object.assign({ password: PERSONA.password, adesso: QUANDO_CREDENZIALI }, comuni))],
    ['iscritto-anche', 'Sei iscritto anche a... (chi ha già una password: nessuna password nuova)', M.iscrittoAnche(Object.assign({ adesso: QUANDO_CREDENZIALI }, comuni))],
    ['credenziali-reinvio', 'Credenziali (reinvio: sostituisce le precedenti)', M.credenziali(Object.assign({ password: 'Nuova4Hwz8', sostituisce: 'evento', adesso: QUANDO_CREDENZIALI }, comuni))],
    ['credenziali-altro-evento', 'Credenziali di chi le aveva già per un altro evento', M.credenziali(Object.assign({ password: 'Nuova6Rtk9', sostituisce: 'altro-evento', adesso: QUANDO_CREDENZIALI }, comuni))],
    ['credenziali-prova', 'Email di prova per il gestore', M.credenziali(Object.assign({ password: PERSONA.password, prova: true, adesso: QUANDO_CREDENZIALI }, comuni))],
    ['promemoria-giorno', 'Promemoria del giorno prima', M.promemoria(Object.assign({ tipo: 'giorno', adesso: EVENTO.inizio - 24 * 3600e3 }, comuni))],
    ['promemoria-ora', 'Promemoria dell\'ora prima', M.promemoria(Object.assign({ tipo: 'ora', adesso: EVENTO.inizio - 3600e3 }, comuni))],
    ['reimpostazione', 'Password dimenticata', M.reimpostazione({ nome: 'Mario Rossi', email: PERSONA.email, link: LINK_RESET, assistenza: ASSISTENZA, adesso: QUANDO_CREDENZIALI })],
    ['reimpostazione-gestore', 'Primo accesso di un gestore', M.reimpostazione({ perGestore: true, link: C.baseSito() + '/diretta/reimposta.html?oobCode=ESEMPIO&per=gestione', assistenza: ASSISTENZA, adesso: QUANDO_CREDENZIALI })]
];

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

fs.mkdirSync(CARTELLA, { recursive: true });
EMAIL.forEach(([nome, , m]) => {
    fs.writeFileSync(path.join(CARTELLA, nome + '.html'), m.html);
    fs.writeFileSync(path.join(CARTELLA, nome + '.txt'), 'Oggetto: ' + m.oggetto + '\n\n' + m.testo + '\n');
});
fs.writeFileSync(path.join(CARTELLA, 'indice.html'), '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Email della diretta: anteprima</title>'
    + '<style>body{font-family:Arial,sans-serif;margin:24px;color:#1E293B;background:#F1F5F9}h1{color:#0A2844}section{margin:0 0 40px}'
    + 'iframe{width:100%;max-width:680px;height:1500px;border:1px solid #E2E8F0;background:#fff}pre{white-space:pre-wrap;background:#fff;border:1px solid #E2E8F0;padding:12px;max-width:680px}</style></head><body>'
    + '<h1>Email della diretta: anteprima (dati di esempio)</h1>'
    + EMAIL.map(([nome, etichetta, m]) => '<section><h2>' + esc(etichetta) + '</h2><p><strong>Oggetto:</strong> ' + esc(m.oggetto) + '</p>'
        + '<iframe src="' + nome + '.html" title="' + esc(etichetta) + '"></iframe><details><summary>Versione in solo testo</summary><pre>' + esc(m.testo) + '</pre></details></section>').join('')
    + '</body></html>');
console.log('Email di esempio scritte in ' + path.relative(RADICE, CARTELLA) + '/:');
EMAIL.forEach(([nome, , m]) => console.log('  ' + (nome + '.html').padEnd(30) + m.oggetto));

/* ---------- le immagini, con --screenshot ---------- */
async function fotografa() {
    const { chromium } = require(path.resolve(__dirname, 'node_modules/playwright'));
    const eseguibile = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    const browser = await chromium.launch(fs.existsSync(eseguibile) ? { executablePath: eseguibile } : {});
    const uscita = path.join(CARTELLA, 'screenshot');
    fs.mkdirSync(uscita, { recursive: true });
    try {
        for (const [dispositivo, opzioni] of [
            ['computer', { viewport: { width: 1280, height: 900 } }],
            ['telefono', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]
        ]) {
            const context = await browser.newContext(opzioni);
            // logo e fascia dai file del repository (sono gli stessi del sito); il resto della rete e' chiuso
            await context.route(/^https?:\/\//, async route => {
                const u = new URL(route.request().url());
                const file = path.join(RADICE, decodeURIComponent(u.pathname));
                if (u.hostname === 'nextgenerationbusiness.it' && file.startsWith(RADICE) && fs.existsSync(file) && fs.statSync(file).isFile()) {
                    return route.fulfill({ status: 200, body: fs.readFileSync(file), contentType: /\.png$/.test(file) ? 'image/png' : 'application/octet-stream' });
                }
                return route.abort();
            });
            const page = await context.newPage();
            for (const [nome] of EMAIL) {
                await page.goto('file://' + path.join(CARTELLA, nome + '.html'));
                await page.waitForLoadState('networkidle');
                await page.screenshot({ path: path.join(uscita, nome + '-' + dispositivo + '.png'), fullPage: true });
            }
            await context.close();
        }
    } finally {
        await browser.close();
    }
    console.log('Immagini in ' + path.relative(RADICE, uscita) + '/ (' + EMAIL.length * 2 + ' file)');
}
if (process.argv.indexOf('--screenshot') >= 0) {
    fotografa().catch(e => { console.error(e); process.exit(1); });
}
