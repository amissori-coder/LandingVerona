/* ============================================================
   PROVE - la rete vista dal browser di Playwright
   ------------------------------------------------------------
   In questo ambiente di prova l'uscita verso Internet passa da un
   proxy che ricifra il traffico con un proprio certificato: Node e
   curl lo conoscono, il Chromium di Playwright no. Invece di
   spegnere i controlli TLS del browser, qui il browser non esce
   mai da solo: ogni richiesta https verso l'esterno la fa Node (che
   si fida del certificato giusto) e la risposta torna al browser.
   Le risposte si tengono in una cache su disco
   (risultati/cache-rete/), cosi' le prove ripetute non dipendono
   dalla rete e girano piu' veloci.

   Le eccezioni:
   - l'indirizzo pubblico del servizio (revilaw-email.vercel.app)
     si puo' deviare sul server locale (opz.servizio) o far
     rispondere dalla prova (opz.statoDiretta);
   - il video della diretta (la web TV finta https://webtv.prova.test
     e il flusso pubblico di prova, che cambia a ogni secondo e non va
     in cache) lo instradano le prove con flusso-prova.js
     (instradaWebTv, inoltraPubblico), registrate DOPO preparaContesto:
     Playwright usa l'ultima regola registrata.

   Uso:  const { preparaContesto } = require('./rete-prove');
         await preparaContesto(context, { servizio: 'http://127.0.0.1:3100/api' });
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Node 22: fetch usa HTTPS_PROXY solo con questa variabile (vedi /root/.ccr/README.md)
if (!process.env.NODE_USE_ENV_PROXY) process.env.NODE_USE_ENV_PROXY = '1';

const CACHE = path.resolve(__dirname, 'risultati/cache-rete');
fs.mkdirSync(CACHE, { recursive: true });

function chiave(url) {
    return crypto.createHash('sha256').update(url).digest('hex').slice(0, 40);
}

async function scarica(url, intestazioni) {
    const k = chiave(url);
    const fileDati = path.join(CACHE, k + '.bin');
    const fileMeta = path.join(CACHE, k + '.json');
    if (fs.existsSync(fileDati) && fs.existsSync(fileMeta)) {
        return { meta: JSON.parse(fs.readFileSync(fileMeta, 'utf8')), corpo: fs.readFileSync(fileDati) };
    }
    const r = await fetch(url, { headers: { 'user-agent': intestazioni['user-agent'] || 'Mozilla/5.0 Chrome/140 Safari/537.36' } });
    const corpo = Buffer.from(await r.arrayBuffer());
    const meta = { stato: r.status, tipo: r.headers.get('content-type') || 'application/octet-stream' };
    if (r.ok && corpo.length < 5 * 1024 * 1024) { fs.writeFileSync(fileDati, corpo); fs.writeFileSync(fileMeta, JSON.stringify(meta)); }
    return { meta, corpo };
}

/* opz.servizio: se presente, le chiamate a https://revilaw-email.vercel.app/api/...
   vanno al servizio locale (es. http://127.0.0.1:3100/api).
   opz.statoDiretta: funzione (url) -> oggetto JSON per /api/diretta-stato
   (per provare popup e pulsante senza server). */
async function preparaContesto(context, opz) {
    opz = opz || {};
    await context.route(/^https:\/\/revilaw-email\.vercel\.app\/api\//, async route => {
        const req = route.request();
        if (opz.statoDiretta && /\/api\/diretta-stato/.test(req.url())) {
            const dati = await opz.statoDiretta(req.url());
            return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(dati) });
        }
        if (!opz.servizio) return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":false}' });
        const dest = req.url().replace(/^https:\/\/revilaw-email\.vercel\.app\/api/, opz.servizio);
        return route.continue({ url: dest });
    });
    await context.route(/^https:\/\//, async route => {
        const req = route.request();
        const url = req.url();
        if (/^https:\/\/revilaw-email\.vercel\.app\//.test(url)) return route.fallback();
        if (req.method() !== 'GET') return route.abort();
        // i video della home (decine di MB) e le statistiche non servono alle
        // prove: consegnati in un colpo solo fanno cadere il browser
        if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) || /googletagmanager|google-analytics|iubenda/.test(url)) return route.abort();
        try {
            const { meta, corpo } = await scarica(url, req.headers());
            await route.fulfill({ status: meta.stato, contentType: meta.tipo, headers: { 'access-control-allow-origin': '*' }, body: corpo });
        } catch (e) {
            await route.abort();
        }
    });
}

module.exports = { preparaContesto };
