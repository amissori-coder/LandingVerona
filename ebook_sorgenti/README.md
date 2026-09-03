# Sorgenti degli ebook della collana

Qui vivono i sorgenti di stampa degli ebook "Guida operativa di governance e
compliance": una cartella per guida, con dentro l'HTML impaginato (una `div.page`
per pagina A4), i font Instrument Sans / Instrument Serif in `fonts/`, i loghi e
il PDF generato.

Il PDF si rigenera aprendo `index.html` in Chromium e stampando in A4 senza
margini con gli sfondi attivi. Da riga di comando (con Playwright):

```js
const page = await browser.newPage();
await page.goto('file://.../index.html', { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: 'ebook.pdf', format: 'A4', printBackground: true,
                 margin: { top: 0, bottom: 0, left: 0, right: 0 } });
```

Le pagine sono impaginate a mano (niente riflusso): chi modifica un testo deve
ricontrollare che la pagina non trabocchi. I contenuti della guida sul merito
creditizio seguono il motore della sezione "Rating bancario" dell'area riservata
(`area-riservata/app.js`) e il suo "Metodo di calcolo": se il metodo cambia,
la guida va aggiornata di conseguenza.
