/* ============================================================
   PROVA NEL BROWSER: IL REVISORE VEDE SOLO I SUOI INCARICHI
   ------------------------------------------------------------
   Mette insieme i pezzi veri: l'area riservata (app.js) aperta in
   un browser, il servizio email (email-service/api) e un database
   di prova con le regole di sicurezza (gli emulatori di Firebase:
   niente tocca il database vero, i dati sono inventati).

       cd scripts/regole && npm install && npx playwright install chromium
       npm run prova-area

   COSA DIMOSTRA.
   1. Sullo stesso computer entra prima l'amministratore, poi un
      revisore: nel browser del revisore restano SOLO i suoi
      incarichi, a video e in memoria; se prova a leggere il
      database da se' (come dalla console del browser) viene
      respinto; quello che scrive (accesso nel registro, una
      richiesta di correzione con la sua email) passa dal servizio.
   2. Il collaboratore di un revisore, e un equity partner entrato
      come revisore (sezione Nuovi accessi).
   3. Chi non e' revisore lavora come prima.
   4. La "Prova la protezione" dell'amministratore dice
      "protezione attiva"...
   5. ...e con regole che NON proteggono dice "protezione NON
      attiva": la prova sa accorgersene.
   6. Le altre porte del servizio (email libere, sblocco) tengono
      il revisore nel suo perimetro.
   ============================================================ */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { avvia, posta, admin } = require('./servizio-di-prova.cjs');
const REPO = path.join(__dirname, '../..');
// la libreria Firebase del browser, nella stessa versione che l'area scarica da gstatic
const FB = path.join(__dirname, 'node_modules/firebase-web');
const PROGETTO = 'demo-regole', PW = 'Prova-123456!';
const BASE = 'http://127.0.0.1:8765/area-riservata/', SERVIZIO = 'http://127.0.0.1:8791/api/';
// le regole vere, e una copia a cui e' stata tolta la riga che tiene fuori il revisore:
// serve a vedere che la prova dell'amministratore se ne accorge
const REGOLE = fs.readFileSync(path.join(REPO, 'area-riservata/firestore.rules'), 'utf8');
const RIGA_REVISORE = "return interno() && ruoloUtente() != 'revisore';";
if (REGOLE.split(RIGA_REVISORE).length !== 2) throw new Error('nelle regole non trovo piu\' la riga che esclude il revisore dallo staff: aggiorna questa prova');
const REGOLE_SENZA_PROTEZIONE = REGOLE.replace(RIGA_REVISORE, 'return interno();');

let passate = 0, fallite = 0;
function verifica(cosa, ok, dett) {
    if (ok) { passate++; console.log('  ok  ' + cosa); return; }
    fallite++; console.log('  NO  ' + cosa + (dett !== undefined ? '\n        ' + JSON.stringify(dett).slice(0, 900) : ''));
}
const tutto = o => JSON.stringify(o);

// ---------- file statici del sito ----------
const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
function sito() {
    return new Promise(ok => {
        const s = http.createServer((req, res) => {
            let p = decodeURIComponent(req.url.split('?')[0]);
            if (p.endsWith('/')) p += 'index.html';
            const file = path.join(REPO, p);
            if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end('no'); return; }
            res.setHeader('Content-Type', TIPI[path.extname(file)] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'no-store');
            fs.createReadStream(file).pipe(res);
        });
        s.listen(8765, '127.0.0.1', () => ok(s));
    });
}
async function regole(testo) {
    const r = await fetch('http://127.0.0.1:8189/emulator/v1/projects/' + PROGETTO + ':securityRules', { method: 'PUT', body: JSON.stringify({ rules: { files: [{ content: testo }] } }) });
    if (!r.ok) throw new Error('regole non caricate: ' + r.status + ' ' + (await r.text()).slice(0, 300));
}

// ---------- lo studio di prova ----------
const inc = (id, cliente, regione, campi) => Object.assign({ id: id, cliente: cliente, tipo: 'legale', stato: 'attivo', codiceFiscale: '0123456' + id, area: 'Centro', regione: regione, localita: 'ROMA', dataInizio: '2024-05-10', dataFine: '2027-04-30', compensi: { 2024: 7000, 2025: 7000, 2026: 7000 }, fatturazione: 'annuale', creato: { da: 'Admin <admin@studio.it>', il: 1 } }, campi);
const persone = [
    { id: 'p1', nome: 'Rossi', nomeProprio: 'Mario', email: 'mario.rossi@studio.it', telefono: '333 1111111', indirizzo: 'via Roma 1', attivo: true, team: true },
    { id: 'p2', nome: 'Rossi', nomeProprio: 'Luca', email: 'luca.rossi@studio.it', telefono: '333 2222222', attivo: true, team: true },
    { id: 'p3', nome: 'Bianchi', nomeProprio: 'Anna', email: 'anna@studio.it', telefono: '333 3333333', attivo: true, team: true },
    { id: 'p4', nome: 'Verdi', nomeProprio: 'Elena', email: 'elena@studio.it', telefono: '333 4444444', attivo: true, equityPartner: true, respIncarico: true },
    { id: 'p5', nome: 'Neri', nomeProprio: 'Ugo', email: 'ugo@studio.it', telefono: '333 5555555', attivo: true, coordinatore: true, regioniCoordinate: ['Lazio'], qualita: true },
    { id: 'p6', nome: 'Gialli', nomeProprio: 'Ivo', email: 'ivo@studio.it', telefono: '333 6666666', attivo: true, respIncarico: true },
    { id: 'p7', nome: 'Blu', nomeProprio: 'Paola', email: 'paola@studio.it', telefono: '333 7777777', attivo: true, team: true },
    { id: 'p8', nome: 'Viola', nomeProprio: 'Piero', email: 'piero@studio.it', attivo: true, equityPartner: true }
];
const incarichi = [
    inc('inc1', 'ALFA MECCANICA SRL', 'Lazio', { team: 'Rossi Mario, Bianchi', respIncarico: 'Verdi', qualita: 'Neri', calcoloCongelato: true }),
    inc('inc2', 'BETA VINI SPA', 'Veneto', { team: 'Rossi Luca', respIncarico: 'Gialli', calcoloCongelato: true }),
    inc('inc3', 'GAMMA CARTA SRL', 'Veneto', { team: 'Blu', respIncarico: 'Gialli' }),
    inc('inc4', 'OMEGA TESSILE SPA', 'Lazio', { team: 'Blu', respIncarico: 'Verdi' }),
    inc('inc5', 'DELTA TRASPORTI SRL', 'Lazio', { referente: 'Rossi Mario', team: 'Bianchi', respIncarico: 'Verdi' }),
    inc('inc6', 'EPSILON ENERGIA SPA', 'Puglia', { coordinatore: 'Rossi Mario', respIncarico: 'Verdi', team: 'Bianchi' })
];
const MIEI = ['inc1', 'inc5', 'inc6'], CLIENTI_MIEI = ['ALFA MECCANICA SRL', 'DELTA TRASPORTI SRL', 'EPSILON ENERGIA SPA'], CLIENTI_ALTRI = ['BETA VINI SPA', 'GAMMA CARTA SRL', 'OMEGA TESSILE SPA'];
const SEGRETI = CLIENTI_ALTRI.concat(['333 2222222', '333 6666666', '333 7777777', 'ivo@studio.it', 'Circolare riservata ai soci', 'ZETA RATING SPA', 'luca.rossi@studio.it']);
const UTENTI = {
    'admin@studio.it': { ruolo: 'admin', nome: 'Admin Di Prova' },
    'mario.rossi@studio.it': { ruolo: 'revisore', nome: 'Mario Rossi' },
    'paola@studio.it': { ruolo: 'revisore', nome: 'Paola Blu' },
    'piero@studio.it': { ruolo: 'revisore', nome: 'Piero Viola' },
    'aiuto@studio.it': { ruolo: 'collaboratore', collaboratoreDi: 'mario.rossi@studio.it', nome: 'Aiuto Di Mario' },
    'anna@studio.it': { ruolo: 'procuratore', nome: 'Anna Bianchi' },
    'elena@studio.it': { ruolo: 'qualita', nome: 'Elena Verdi' }
};
async function semina() {
    const db = admin.firestore();
    const metti = (nome, v) => db.collection('archivio').doc(nome).set({ json: JSON.stringify(v), da: 'semina' });
    await metti('persone', persone); await metti('incarichi', incarichi);
    await metti('fattureStato', { 'inc1|2026|annuale|1': 'emessa', 'inc2|2026|annuale|1': 'emessa', 'inc3|2026|annuale|1': 'incassata' });
    await metti('audit', [
        { id: 'a1', ts: 900, utente: 'Admin Di Prova <admin@studio.it>', azione: 'Incarico modificato', entita: 'incarico', rif: 'inc1', cliente: 'ALFA MECCANICA SRL', dettagli: [{ campo: 'Compenso', prima: '1', dopo: '2' }] },
        { id: 'a2', ts: 890, utente: 'Admin Di Prova <admin@studio.it>', azione: 'Incarico modificato', entita: 'incarico', rif: 'inc2', cliente: 'BETA VINI SPA', dettagli: [{ campo: 'Compenso', prima: '1', dopo: '2' }] }
    ]);
    await metti('controlliQualita', [{ id: 'cq1', incaricoId: 'inc1', anno: 2026, cliente: 'ALFA MECCANICA SRL' }, { id: 'cq3', incaricoId: 'inc3', anno: 2026, cliente: 'GAMMA CARTA SRL' }]);
    await metti('richieste', []); await metti('firmeEmail', {});
    await metti('comunicazioni', [{ id: 'c1', oggetto: 'Circolare riservata ai soci', testo: 'x', destinatari: ['tutti@studio.it'], stato: 'bozza', creato: { da: 'admin@studio.it', il: 1 } }]);
    await metti('rating', [{ id: 'rt1', cliente: 'ZETA RATING SPA' }]);
    for (const [email, d] of Object.entries(UTENTI)) {
        await db.collection('utenti').doc(email).set(Object.assign({ attivo: true, creato: 1 }, d));
        await admin.auth().createUser({ email: email, password: PW, emailVerified: true });
    }
}
// i salvataggi dell'area partono con un piccolo ritardo: si aspetta che arrivino, fino a `ms`
async function finche(condizione, ms) {
    const fine = Date.now() + (ms || 8000);
    while (Date.now() < fine) { if (await condizione()) return true; await new Promise(ok => setTimeout(ok, 250)); }
    return false;
}
const archivio = async nome => { const s = await admin.firestore().collection('archivio').doc(nome).get(); return s.exists ? JSON.parse(s.data().json) : null; };
async function gettone(email) {
    const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=finta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: PW, returnSecureToken: true }) });
    return (await r.json()).idToken;
}
async function chiama(porta, email, corpo) {
    const r = await fetch(SERVIZIO + porta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ idToken: await gettone(email) }, corpo)) });
    return Object.assign({ http: r.status }, await r.json().catch(() => ({})));
}

// ---------- il browser ----------
const involucro = (nome, corpo) => `export * from 'https://www.gstatic.com/firebasejs/11.6.1/${nome}?vero';\n${corpo}`;
async function contesto(browser) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'it-IT' });
    await ctx.route('**/*', r => {
        const u = r.request().url();
        if (u.includes('firebase-config.js')) return r.fulfill({ contentType: 'application/javascript', body: `window.RV_FIREBASE_CONFIG = { apiKey: 'finta', authDomain: '${PROGETTO}.firebaseapp.com', projectId: '${PROGETTO}' }; window.RV_EMAIL_SERVICE_URL = '${SERVIZIO}invia-email';` });
        const m = /gstatic\.com\/firebasejs\/11\.6\.1\/(firebase-[a-z]+\.js)(\?vero)?$/.exec(u);
        if (m) {
            const vero = () => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(FB, m[1]), 'utf8') });
            if (m[2] || m[1] === 'firebase-app.js') return vero();
            if (m[1] === 'firebase-auth.js') return r.fulfill({ contentType: 'application/javascript', body: involucro(m[1], `import { getAuth as g, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js?vero';\nconst fatti = new WeakSet();\nexport function getAuth(app) { const a = g(app); if (!fatti.has(a)) { fatti.add(a); connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true }); } return a; }`) });
            if (m[1] === 'firebase-firestore.js') return r.fulfill({ contentType: 'application/javascript', body: involucro(m[1], `import { getFirestore as g, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js?vero';\nconst fatti = new WeakSet();\nexport function getFirestore(app) { const d = g(app); if (!fatti.has(d)) { fatti.add(d); connectFirestoreEmulator(d, '127.0.0.1', 8189); } return d; }`) });
            return vero();
        }
        if (!/^http:\/\/127\.0\.0\.1:(8765|8791|9099|8189)\//.test(u)) return r.abort();
        return r.continue();
    });
    return ctx;
}
async function entra(p, email, opz) {
    await p.goto(BASE);
    await p.waitForSelector('#login-email', { state: 'visible', timeout: 20000 });
    await p.fill('#login-email', email); await p.fill('#login-password', PW);
    await p.click('#form-login button[type="submit"]');
    if (opz && opz.fallisce) { await p.waitForSelector('#login-errore:not(.hidden)', { timeout: 20000 }); return; }
    await p.waitForSelector('#nav-principale .nav-voce', { timeout: 25000 });
    await p.waitForTimeout(700);
    if (await p.$('#m-ok')) { await p.click('#m-ok'); await p.waitForTimeout(200); }
}
async function esci(p) { await p.click('#btn-logout'); await p.waitForSelector('#login-email', { state: 'visible', timeout: 15000 }); await p.waitForTimeout(600); }
const magazzino = p => p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
const menu = p => p.$$eval('#nav-principale .nav-voce', bs => bs.map(b => b.dataset.vista));
const vai = async (p, vista) => { await p.click('#nav-principale button[data-vista="' + vista + '"]'); await p.waitForTimeout(700); return p.$eval('#vista', e => e.innerText); };
// quello che un revisore smaliziato farebbe dalla console del browser: leggere il database da se'
const diretto = (p, cosa) => p.evaluate(async cosa => {
    const A = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js');
    const F = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const db = F.getFirestore(A.getApp());
    try {
        if (cosa === 'utenti') { const s = await F.getDocs(F.collection(db, 'utenti')); return 'letto: ' + s.size + ' schede'; }
        if (cosa.startsWith('scrivi:')) { await F.setDoc(F.doc(db, 'archivio', cosa.slice(7)), { json: '[]' }); return 'scritto'; }
        const s = await F.getDocFromServer(F.doc(db, ...cosa.split('/')));
        return 'letto' + (s.exists() ? ': ' + String(JSON.stringify(s.data())).length + ' caratteri' : ' (vuoto)');
    } catch (e) { return String(e.code || e.message); }
}, cosa);

(async () => {
    const [srvSito, srvServizio] = [await sito(), await avvia(8791)];
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    await regole(REGOLE);
    await semina();
    // CHROMIUM=/percorso/di/chromium per usare un browser gia' installato invece di quello scaricato da Playwright
    const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
    const errori = [];
    const pagina = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => errori.push(e.message)); return p; };

    console.log('\n== 1. Prima entra l\'amministratore, poi sullo stesso computer un revisore ==');
    const ctx = await contesto(browser);
    const p = await pagina(ctx);
    await entra(p, 'admin@studio.it');
    let testo = await vai(p, 'incarichi');
    verifica('amministratore: vede tutti e sei gli incarichi', CLIENTI_MIEI.concat(CLIENTI_ALTRI).every(c => testo.includes(c)), testo.slice(0, 300));
    verifica('amministratore: legge il database come prima', /^letto: /.test(await diretto(p, 'archivio/incarichi')) && /^letto: 7/.test(await diretto(p, 'utenti')));
    let mag = await magazzino(p);
    verifica('nel browser dell\'amministratore ci sono i dati di tutti', CLIENTI_ALTRI.every(c => tutto(mag).includes(c)));
    await esci(p);

    await entra(p, 'mario.rossi@studio.it');
    mag = await magazzino(p);
    const incLoc = JSON.parse(mag['rvArea.incarichi'] || '[]');
    verifica('revisore: nel suo browser ci sono SOLO i suoi tre incarichi', tutto(incLoc.map(i => i.id)) === tutto(MIEI), incLoc.map(i => i.id));
    const residui = SEGRETI.filter(s => tutto(mag).includes(s));
    verifica('revisore: dei dati dell\'amministratore entrato prima non è rimasto niente', residui.length === 0, residui);
    verifica('revisore: comunicazioni, merito creditizio e fatture altrui non ci sono', (mag['rvArea.comunicazioni'] || '[]') === '[]' && (mag['rvArea.rating'] || '[]') === '[]' && tutto(Object.keys(JSON.parse(mag['rvArea.fattureStato'] || '{}'))) === tutto(['inc1|2026|annuale|1']), [mag['rvArea.comunicazioni'], mag['rvArea.fattureStato']]);
    const piede = await p.$eval('.sidebar', e => e.innerText).catch(() => '');
    verifica('revisore: in basso a sinistra «Vedi solo i tuoi incarichi: 3»', /Vedi solo i tuoi incarichi:\s*3/.test(piede), piede.slice(-300));
    const m = await menu(p);
    verifica('revisore: il menu non ha le sezioni vietate', !m.some(v => ['persone', 'rating', 'comunicazioni', 'sondaggi', 'utenti', 'ruoli', 'accessi', 'dati', 'eventi', 'newsletter'].includes(v)), m);
    testo = await vai(p, 'incarichi');
    verifica('revisore: a video i suoi incarichi e nessun altro', CLIENTI_MIEI.every(c => testo.includes(c)) && !CLIENTI_ALTRI.some(c => testo.includes(c)), testo.slice(0, 400));
    testo = await vai(p, 'dashboard');
    verifica('revisore: il cruscotto parla dei suoi tre incarichi', /sono 3/.test(testo) && !CLIENTI_ALTRI.some(c => testo.includes(c)), testo.slice(0, 300));
    // dalla console: il database lo respinge
    const tentativi = {};
    for (const c of ['archivio/incarichi', 'archivio/persone', 'archivio/fattureStato', 'archivio/audit', 'archivio/comunicazioni', 'archivio/rating', 'archivio/richieste', 'archivio/presenza', 'archivio/sondaggi', 'utenti', 'utenti/admin@studio.it', 'scrivi:incarichi', 'scrivi:eventiConfig', 'scrivi:ruoli']) tentativi[c] = await diretto(p, c);
    verifica('revisore: dalla console del browser il database lo respinge su tutto', Object.values(tentativi).every(v => v === 'permission-denied'), tentativi);
    verifica('revisore: gli incarichi nel database sono rimasti sei (la scrittura è stata respinta)', (await archivio('incarichi')).length === 6);
    verifica('revisore: la sua scheda utente e i ruoli li legge (servono per entrare)', /^letto/.test(await diretto(p, 'utenti/mario.rossi@studio.it')) && /^letto/.test(await diretto(p, 'archivio/ruoli')));
    // il registro: l'accesso e' passato dal servizio, con la sua firma
    await finche(async () => (await archivio('audit')).some(v => v.azione === 'Accesso effettuato' && /mario\.rossi@studio\.it/.test(v.utente)));
    let reg = await archivio('audit');
    const accesso = reg.find(v => v.azione === 'Accesso effettuato' && /mario\.rossi@studio\.it/.test(v.utente));
    verifica('revisore: l\'accesso è nel Registro, scritto dal servizio con la sua firma', !!accesso && accesso.utente === 'Mario Rossi <mario.rossi@studio.it>', reg.slice(0, 3));
    verifica('revisore: le voci degli altri nel Registro sono rimaste', reg.some(v => v.id === 'a2') && reg.some(v => v.id === 'a1'));

    // una richiesta di correzione, dall'inizio alla fine
    testo = await vai(p, 'richieste');
    await p.click('#btn-nuova-richiesta');
    await p.waitForSelector('#ric-oggetto');
    const opzioni = await p.$$eval('#ric-incarico option', os => os.map(o => o.textContent.trim()).filter(Boolean));
    verifica('richiesta: tra gli incarichi che può scegliere ci sono solo i suoi', CLIENTI_MIEI.every(c => opzioni.some(o => o.includes(c))) && !CLIENTI_ALTRI.some(c => opzioni.some(o => o.includes(c))), opzioni);
    await p.check('input[name="ric-ambito"][value="incarico"]');
    await p.selectOption('#ric-incarico', 'inc1');
    await p.selectOption('#ric-destinatario', 'elena@studio.it');
    await p.fill('#ric-oggetto', 'Data fine incarico errata');
    await p.fill('#ric-testo', 'La data di fine corretta è il 30/04/2028.');
    posta.length = 0;
    await p.click('#m-invia');
    await finche(async () => { const l = await archivio('richieste'); return l.length === 1 && l[0].invii.length === 1; }, 12000);
    let ric = await archivio('richieste');
    verifica('richiesta: è nel database, scritta dal servizio', ric.length === 1 && ric[0].richiedente.email === 'mario.rossi@studio.it' && ric[0].destinatario.email === 'elena@studio.it' && ric[0].incaricoId === 'inc1' && ric[0].cliente === 'ALFA MECCANICA SRL', ric);
    verifica('richiesta: in copia il coordinatore del Lazio', ric[0] && tutto(ric[0].conoscenza.map(c => c.email)) === tutto(['ugo@studio.it']), ric[0] && ric[0].conoscenza);
    verifica('richiesta: il riepilogo per email è partito a lui e all\'equity partner', posta.length === 1 && /Richiesta di correzione dati/.test(posta[0].subject) && tutto([].concat(posta[0].to || [], posta[0].bcc || []).sort()) === tutto(['elena@studio.it', 'mario.rossi@studio.it']), posta.map(x => [x.to, x.bcc, x.subject]));
    verifica('richiesta: l\'esito dell\'email è registrato sulla richiesta', ric[0] && ric[0].invii.length === 1 && ric[0].invii[0].esito === 'ok', ric[0] && ric[0].invii);
    testo = await vai(p, 'richieste');
    verifica('richiesta: la vede nell\'elenco', testo.includes('Data fine incarico errata'), testo.slice(0, 300));
    // ricarica la pagina: la sessione riprende, i dati sono sempre e solo i suoi
    await p.goto(BASE); await p.waitForSelector('#nav-principale .nav-voce', { timeout: 25000 }); await p.waitForTimeout(800);
    mag = await magazzino(p);
    verifica('revisore: ricaricando la pagina resta sui suoi tre incarichi', tutto(JSON.parse(mag['rvArea.incarichi']).map(i => i.id)) === tutto(MIEI) && !SEGRETI.some(s => tutto(mag).includes(s)));
    testo = await vai(p, 'registro').catch(() => '');
    await esci(p);

    console.log('\n== 2. Il collaboratore di un revisore, e un equity partner entrato come revisore ==');
    await entra(p, 'aiuto@studio.it');
    mag = await magazzino(p);
    verifica('collaboratore del revisore: entra e riceve gli incarichi del suo riferimento', tutto(JSON.parse(mag['rvArea.incarichi'] || '[]').map(i => i.id)) === tutto(MIEI) && !SEGRETI.some(s => tutto(mag).includes(s)));
    verifica('collaboratore del revisore: il database respinge anche lui', (await diretto(p, 'archivio/incarichi')) === 'permission-denied' && (await diretto(p, 'utenti')) === 'permission-denied');
    await esci(p);
    await entra(p, 'piero@studio.it');
    const mp = await menu(p);
    verifica('equity partner entrato come revisore: ha «Nuovi accessi»', mp.includes('accessi'), mp);
    testo = await vai(p, 'accessi'); await p.waitForTimeout(1500); testo = await p.$eval('#vista', e => e.innerText);
    verifica('nuovi accessi: l\'elenco arriva dal servizio (chi non ha ancora un accesso)', testo.includes('Luca Rossi') && testo.includes('Ugo Neri') && testo.includes('Ivo Gialli') && !testo.includes('Elenco non disponibile'), testo.slice(0, 600));
    mag = await magazzino(p);
    verifica('nuovi accessi: l\'anagrafica intera non è stata scaricata nel suo browser', !tutto(mag).includes('333 2222222') && !tutto(mag).includes('333 6666666'));
    await esci(p);

    console.log('\n== 3. Chi non è revisore lavora come prima ==');
    await entra(p, 'anna@studio.it');
    testo = await vai(p, 'incarichi');
    verifica('procuratore: vede tutti gli incarichi', CLIENTI_MIEI.concat(CLIENTI_ALTRI).every(c => testo.includes(c)));
    verifica('procuratore: legge e scrive il database come prima', /^letto: /.test(await diretto(p, 'archivio/incarichi')) && /^letto: /.test(await diretto(p, 'utenti')) && (await diretto(p, 'scrivi:provaScrittura')) === 'scritto');
    const avvisi = await p.$$eval('.toast', ts => ts.map(t => t.textContent)).catch(() => []);
    verifica('procuratore: nessun avviso di permessi', !avvisi.some(a => /non consente|RIFIUTATO/.test(a)), avvisi);
    await esci(p);

    console.log('\n== 4. La prova della protezione, lanciata dall\'amministratore ==');
    await entra(p, 'admin@studio.it');
    await vai(p, 'ruoli');
    await p.click('#r-prova-protezione');
    await p.waitForSelector('#modale-contenitore .riquadro-ambito', { timeout: 40000 });
    let modale = await p.$eval('#modale-contenitore', e => e.innerText);
    verifica('prova con le regole vere: «protezione attiva»', /protezione attiva/.test(modale) && !/NON attiva/.test(modale), modale.slice(0, 500));
    const righe = await p.$$eval('#modale-contenitore table.dati tbody tr', trs => trs.map(tr => Array.from(tr.children).map(td => td.innerText.trim())));
    verifica('prova: diciotto tentativi, tutti con l\'esito giusto', righe.length === 18 && righe.every(r => r[1] === r[2]), righe);
    await p.click('#m-ok');
    let rimasti = (await admin.firestore().collection('utenti').where('provaProtezione', '==', true).get()).size;
    let account = (await admin.auth().listUsers()).users.filter(u => /^prova-protezione-/.test(u.email || '')).length;
    verifica('prova: il revisore di prova è stato tolto (scheda e account)', rimasti === 0 && account === 0, [rimasti, account]);
    const eNelRegistro = v => v.azione === 'Prova della protezione dei revisori' && /admin@studio\.it/.test(v.utente);
    await finche(async () => (await archivio('audit')).some(eNelRegistro));
    reg = await archivio('audit');
    verifica('prova: resta nel Registro modifiche, a nome dell\'amministratore', reg.some(v => v.azione === 'Prova della protezione dei revisori' && /admin@studio\.it/.test(v.utente) && v.dettagli[0].dopo === 'protezione attiva'), reg.slice(0, 2));
    testo = await vai(p, 'ruoli');
    verifica('prova: la scheda del ruolo riporta l\'ultimo esito', /Ultima prova:\s*protezione attiva/.test(testo), testo.match(/Protezione del database[^\n]*/));

    console.log('\n== 5. CON REGOLE CHE NON PROTEGGONO: la prova se ne accorge, e il revisore riceve comunque solo i suoi dati ==');
    await regole(REGOLE_SENZA_PROTEZIONE);
    await p.click('#r-prova-protezione');
    await p.waitForSelector('#modale-contenitore .riquadro-ambito', { timeout: 40000 });
    modale = await p.$eval('#modale-contenitore', e => e.innerText);
    verifica('prova con regole che non proteggono: «protezione NON attiva»', /protezione NON attiva \(1[0-9] accessi non respinti\)/.test(modale), modale.slice(0, 400));
    await p.click('#m-ok');
    verifica('prova: il documento di prova, che stavolta è stato scritto, è stato tolto', !(await admin.firestore().collection('archivio').doc('provaProtezione').get()).exists);
    verifica('prova: gli archivi veri non sono stati toccati', (await archivio('incarichi')).length === 6 && (await archivio('persone')).length === 8);
    rimasti = (await admin.firestore().collection('utenti').where('provaProtezione', '==', true).get()).size;
    verifica('prova: il revisore di prova è stato tolto anche stavolta', rimasti === 0);
    await esci(p);
    const ctx2 = await contesto(browser);
    const q = await pagina(ctx2);
    await entra(q, 'paola@studio.it');
    mag = await magazzino(q);
    verifica('regole che non proteggono: il programma dà comunque al revisore solo i suoi incarichi', tutto(JSON.parse(mag['rvArea.incarichi'] || '[]').map(i => i.id)) === tutto(['inc3', 'inc4']) && !tutto(mag).includes('ALFA MECCANICA SRL'), JSON.parse(mag['rvArea.incarichi'] || '[]').map(i => i.id));
    verifica('regole che non proteggono: ma dalla console il database gli darebbe tutto (ecco perché servono le regole)', /^letto: /.test(await diretto(q, 'archivio/incarichi')));
    await regole(REGOLE);
    verifica('regole vere di nuovo: lo stesso revisore viene respinto', (await diretto(q, 'archivio/persone')) === 'permission-denied');
    await ctx2.close();

    console.log('\n== 6. Le altre porte del servizio ==');
    posta.length = 0;
    let r = await chiama('invia-comunicazione', 'paola@studio.it', { oggetto: 'Offerta', testo: 'Ciao', destinatari: ['cliente@fuori.it'], mittenteNome: 'Revilaw S.p.A. - Amministrazione' });
    verifica('email: un revisore non scrive a un indirizzo qualunque', r.http === 403 && posta.length === 0, r);
    r = await chiama('invia-comunicazione', 'paola@studio.it', { oggetto: 'Richiesta', testo: 'Ciao', destinatari: ['elena@studio.it'], mittenteNome: 'Revilaw S.p.A. - Amministrazione' });
    verifica('email: a un equity partner sì, ma con il suo nome e non con quello che sceglie', r.http === 200 && posta.length === 1 && /"Paola Blu"/.test(posta[0].from), [r, posta.map(x => x.from)]);
    await new Promise(ok => setTimeout(ok, 300));
    r = await chiama('invia-comunicazione', 'anna@studio.it', { oggetto: 'Comunicazione', testo: 'Ciao', destinatari: ['cliente@fuori.it'], mittenteNome: 'Anna per Revilaw' });
    verifica('email: per chi non è revisore non cambia nulla', r.http === 200 && /"Anna per Revilaw"/.test(posta[posta.length - 1].from), r);
    r = await chiama('sblocco-incarico', 'paola@studio.it', { azione: 'richiedi', incaricoId: 'inc2', motivo: 'vorrei sbloccarlo' });
    verifica('sblocco: un revisore non chiede lo sblocco di un incarico non suo', r.http === 404, r);
    r = await chiama('sblocco-incarico', 'mario.rossi@studio.it', { azione: 'richiedi', incaricoId: 'inc1', motivo: 'serve ricalcolare il compenso' });
    verifica('sblocco: sul suo incarico sì', r.http === 200 && r.ok === true, r);
    r = await chiama('sblocco-incarico', 'anna@studio.it', { azione: 'richiedi', incaricoId: 'inc2', motivo: 'serve ricalcolare il compenso' });
    verifica('sblocco: per chi non è revisore non cambia nulla', r.http === 200 && r.ok === true, r);
    r = await chiama('revisore', 'anna@studio.it', { azione: 'dati' });
    verifica('la porta dei dati del revisore non serve agli altri', r.http === 403);

    verifica('nessun errore JavaScript nelle pagine', errori.length === 0, errori.slice(0, 5));
    await browser.close(); srvSito.close(); srvServizio.close();
    console.log('\nprova completa: ' + passate + ' verifiche passate' + (fallite ? ', ' + fallite + ' FALLITE' : ''));
    process.exit(fallite ? 1 : 0);
})().catch(e => { console.error('ERRORE', (e && e.stack) || e); process.exit(1); });
