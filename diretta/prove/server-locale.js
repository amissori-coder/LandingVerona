/* ============================================================
   PROVE - il servizio e il sito, in locale
   ------------------------------------------------------------
       node server-locale.js [--api 3100] [--statico 8090]
                             [--firestore 8080] [--auth 9099]

   Due server in un processo:
   - le funzioni api/diretta-*.js del servizio (email-service/api/),
     montate cosi' come le monta Vercel (req.query, req.body gia'
     letto, res.status().json()), su http://127.0.0.1:3100/api/...
   - il sito statico (la radice del repository) su
     http://127.0.0.1:8090/, senza cache, come GitHub Pages.

   Le funzioni parlano con gli emulatori Firebase (vedi
   avvia-emulatori.js) e NON spediscono email: con la posta finta
   ogni messaggio diventa una riga JSON in risultati/posta.jsonl.
   Le variabili d'ambiente gia' impostate vincono su quelle qui sotto.
   ============================================================ */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

function argomento(nome, predefinito) {
    const i = process.argv.indexOf('--' + nome);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : predefinito;
}
const PORTA_API = Number(argomento('api', 3100));
const PORTA_STATICO = Number(argomento('statico', 8090));
const PORTA_FIRESTORE = Number(argomento('firestore', 8080));
const PORTA_AUTH = Number(argomento('auth', 9099));

const RADICE = path.resolve(__dirname, '../..');
const RISULTATI = path.resolve(__dirname, 'risultati');
fs.mkdirSync(RISULTATI, { recursive: true });

const predefinite = {
    DIRETTA_EMULATORE: '1',
    DIRETTA_PROGETTO: 'demo-ngb-eventi',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:' + PORTA_FIRESTORE,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:' + PORTA_AUTH,
    DIRETTA_FIREBASE_API_KEY: 'finta',
    DIRETTA_ADMIN_EMAILS: 'gestore@prova.it',
    DIRETTA_POSTA_FINTA: path.join(RISULTATI, 'posta.jsonl'),
    ALLOWED_ORIGIN: 'http://127.0.0.1:' + PORTA_STATICO + ',http://localhost:' + PORTA_STATICO,
    APP_BASE_URL: 'http://127.0.0.1:' + PORTA_STATICO,
    CRON_SECRET: 'prova',
    DIRETTA_PAUSA_MS: '0'
};
Object.keys(predefinite).forEach(k => { if (process.env[k] == null) process.env[k] = predefinite[k]; });

/* ---------- le funzioni ---------- */
function adattaRisposta(res) {
    res.status = function (codice) { res.statusCode = codice; return res; };
    res.json = function (dati) {
        if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(dati));
        return res;
    };
    res.send = function (dati) {
        if (typeof dati === 'object' && !Buffer.isBuffer(dati)) return res.json(dati);
        res.end(dati);
        return res;
    };
    return res;
}

const serverApi = http.createServer((req, res) => {
    adattaRisposta(res);
    const indirizzo = new URL(req.url, 'http://127.0.0.1:' + PORTA_API);
    const m = /^\/api\/(diretta-[a-z-]+)\/?$/.exec(indirizzo.pathname);
    if (!m) { res.status(404).json({ ok: false, msg: 'Funzione inesistente' }); return; }
    const file = path.join(RADICE, 'email-service/api', m[1] + '.js');
    if (!fs.existsSync(file)) { res.status(404).json({ ok: false, msg: 'Funzione inesistente' }); return; }
    const pezzi = [];
    req.on('data', c => pezzi.push(c));
    req.on('end', async () => {
        const grezzo = Buffer.concat(pezzi).toString('utf8');
        req.query = Object.fromEntries(indirizzo.searchParams.entries());
        const tipo = String(req.headers['content-type'] || '');
        if (grezzo && /json/i.test(tipo)) { try { req.body = JSON.parse(grezzo); } catch (_) { req.body = grezzo; } }
        else req.body = grezzo || undefined;
        try {
            const funzione = require(file);
            await (typeof funzione === 'function' ? funzione : funzione.default)(req, res);
        } catch (e) {
            console.error('[server-locale] ' + m[1] + ':', e && e.stack || e);
            if (!res.writableEnded) res.status(500).json({ ok: false, msg: 'Errore non gestito' });
        }
    });
});

/* ---------- il sito ---------- */
const TIPI = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.csv': 'text/csv; charset=utf-8',
    '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};
const serverStatico = http.createServer((req, res) => {
    const indirizzo = new URL(req.url, 'http://127.0.0.1');
    let percorso = decodeURIComponent(indirizzo.pathname);
    let file = path.join(RADICE, percorso);
    if (!file.startsWith(RADICE)) { res.statusCode = 403; res.end(); return; }
    try {
        if (fs.statSync(file).isDirectory()) {
            if (!percorso.endsWith('/')) { res.statusCode = 301; res.setHeader('Location', percorso + '/' + indirizzo.search); res.end(); return; }
            file = path.join(file, 'index.html');
        }
        const dati = fs.readFileSync(file);
        res.setHeader('Content-Type', TIPI[path.extname(file).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.end(dati);
    } catch (_) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Non trovato');
    }
});

serverApi.listen(PORTA_API, '127.0.0.1', () => {
    serverStatico.listen(PORTA_STATICO, '127.0.0.1', () => {
        console.log('SERVER LOCALE PRONTO api=http://127.0.0.1:' + PORTA_API + '/api sito=http://127.0.0.1:' + PORTA_STATICO + '/');
    });
});
