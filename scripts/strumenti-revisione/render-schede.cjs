/* Stampa in PDF le schede delle attività (Strumenti di revisione) come le
   stampa il browser: area riservata in modalità demo, media "print", A4.
   La lancia fascicoli.py, che passa:
     node render-schede.cjs <url area riservata> <cartella di uscita> '<json [{anno, id}]>'
   e trova <anno>-<id>-scheda.pdf nella cartella di uscita. */
const { chromium } = require('playwright');

const [base, uscita, elenco] = process.argv.slice(2);
const schede = JSON.parse(elenco);

(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // niente Firebase: la pagina parte in modalità demo; niente risorse esterne
    await ctx.route('**/*', r => {
        const u = r.request().url();
        if (u.includes('firebase-config.js')) return r.fulfill({ contentType: 'application/javascript', body: 'window.RV_FIREBASE_CONFIG=null;' });
        if (!u.startsWith(new URL(base).origin)) return r.abort();
        return r.continue();
    });
    const errori = [];
    for (const { anno, id } of schede) {
        const p = await ctx.newPage();
        p.on('pageerror', e => errori.push(id + ': ' + e.message));
        await p.goto(base);
        // la sezione è visibile al titolare: la sessione demo è la sua
        await p.evaluate(() => sessionStorage.setItem('rvArea.sessione', JSON.stringify({ email: 'a.missori@emvas.tax', ts: Date.now() })));
        await p.goto(base);
        await p.click('button[data-vista="strumenti"]');
        await p.waitForSelector('#sr-piano');
        const tab = await p.$('.sr-anni [data-anno="' + anno + '"]');
        if (tab) { await tab.click(); await p.waitForSelector('#sr-piano'); }
        await p.click('tr[data-attivita="' + id + '"] .sr-apri');
        await p.waitForSelector('#sr-att-descrizione');
        await p.emulateMedia({ media: 'print' });
        await p.pdf({ path: uscita + '/' + anno + '-' + id + '-scheda.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
        await p.close();
    }
    await browser.close();
    if (errori.length) { console.error(errori.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
