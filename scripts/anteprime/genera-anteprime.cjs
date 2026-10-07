#!/usr/bin/env node
// Genera l'immagine di anteprima social (1200x630) di ogni pagina del sito,
// con il titolo e la descrizione della pagina stessa, e la collega nei meta
// og:image / twitter:image. Così, quando si condivide il link su LinkedIn,
// Facebook, WhatsApp o X, la scheda mostra di che cosa parla la pagina
// invece della copertina generica Revilaw uguale per tutte.
//
// Uso:  node scripts/anteprime/genera-anteprime.cjs           (tutte le pagine)
//       node scripts/anteprime/genera-anteprime.cjs fcd_2026  (solo alcune)
//       node scripts/anteprime/genera-anteprime.cjs --forza   (rigenera tutto)
//
// Richiede Playwright (npm i -D playwright, oppure installato globalmente).
//
// Quali pagine: ogni index.html che ha già i meta Open Graph. Le pagine con
// un'immagine scelta a mano (per esempio le interviste di Verona) restano
// come sono: il generatore sostituisce solo la copertina generica.
//
// Le immagini finiscono in assets/og/<pagina>.jpg. Il file manifest.json
// accanto ricorda con quale titolo e descrizione è stata fatta ciascuna:
// se non cambiano, l'immagine non viene rifatta. Nell'indirizzo dell'immagine
// c'è "?v=<impronta>", che cambia quando cambia il testo: i social tengono in
// cache le anteprime per indirizzo, così vedono subito quella nuova.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const radice = path.resolve(__dirname, '..', '..');
const SITO = 'https://nextgenerationbusiness.it';
const CARTELLA = path.join(radice, 'assets', 'og');
const MANIFEST = path.join(CARTELLA, 'manifest.json');
const VERSIONE_GRAFICA = 1; // da aumentare quando si cambia il modello qui sotto

// Le copertine che il generatore può sostituire. Tutto il resto è una scelta
// fatta a mano e non si tocca.
const GENERICHE = [
    /\/assets\/og-revilaw-1200x630\.jpg/,
    /\/assets\/og-ngb-1200x630\.jpg/,
    /tuosito\.it/,
    /\/assets\/og\/[^"?]+\.jpg/, // le nostre, da aggiornare
];

// Cartelle che non sono pagine da condividere.
const ESCLUSE = new Set([
    'node_modules', 'assets', 'scripts', 'tools', 'area-riservata', 'diretta',
    'badge-napoli', 'email-service', 'news-demo', 'stima-ore-test',
]);

// Etichetta sopra il titolo per le pagine che non sono approfondimenti.
// Il resto prende "Approfondimento" (og:type article) o il nome del progetto.
const ETICHETTE = {
    '': 'Eventi B2B · Legalità, innovazione, crescita',
    'napoli_ottobre_2026': 'Evento · Napoli',
    'roma_aprile_2026': 'Evento · Roma',
    'verona_marzo_2026': 'Evento · Verona',
    'chi_siamo': 'Chi siamo',
    'approfondimenti': 'Approfondimenti per argomento',
};

// ---------------------------------------------------------------- pagine

function trovaPagine(filtro) {
    const pagine = [];
    const visita = (dir, rel) => {
        for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
            if (voce.name.startsWith('.')) continue;
            const relVoce = rel ? `${rel}/${voce.name}` : voce.name;
            if (voce.isDirectory()) {
                if (!rel && ESCLUSE.has(voce.name)) continue;
                visita(path.join(dir, voce.name), relVoce);
            } else if (voce.name === 'index.html' || (rel === 'zls_zes' && /^z[le]s\.html$/.test(voce.name))) {
                pagine.push(relVoce);
            }
        }
    };
    visita(radice, '');
    return pagine
        .filter((p) => !filtro.length || filtro.some((f) => p.startsWith(f)))
        .sort();
}

function meta(html, attr, nome) {
    const re = new RegExp(`<meta\\s+${attr}="${nome}"\\s+content="([^"]*)"`, 'i');
    const m = html.match(re);
    return m ? m[1] : null;
}

function decodifica(s) {
    return s
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
        .replace(/&amp;/g, '&');
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// "Titolo | Revilaw S.p.A." -> "Titolo": il marchio c'è già nell'immagine.
function pulisciTitolo(t) {
    return t.replace(/\s*[|–—-]\s*(Revilaw( S\.p\.A\.)?|Next Generation Business)\s*$/i, '')
        .replace(/\s+\|\s+/g, ' · ') // "2026 | Convegno Napoli" -> "2026 · Convegno Napoli"
        .trim();
}

// Un nome di file per la pagina: "zls_zes/zes.html" -> "zls_zes-zes".
function nomeImmagine(rel) {
    const base = rel.replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '').replace(/\//g, '-');
    return base || 'home';
}

function leggiPagina(rel) {
    const html = fs.readFileSync(path.join(radice, rel), 'utf8');
    const immagine = meta(html, 'property', 'og:image');
    if (!immagine) return null; // pagina senza Open Graph: non è fatta per essere condivisa
    if (!GENERICHE.some((re) => re.test(immagine))) return { rel, saltata: 'immagine scelta a mano' };

    const titolo = meta(html, 'property', 'og:title') || (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
    const descrizione = meta(html, 'property', 'og:description') || meta(html, 'name', 'description') || '';
    const tipo = meta(html, 'property', 'og:type') || 'website';
    const cartella = rel.split('/')[0] === 'index.html' ? '' : rel.split('/')[0];
    const etichetta = ETICHETTE[cartella] || (tipo === 'article' ? 'Approfondimento' : 'Next Generation Business');

    return {
        rel,
        html,
        nome: nomeImmagine(rel),
        titolo: pulisciTitolo(decodifica(titolo)),
        descrizione: decodifica(descrizione),
        etichetta,
    };
}

// ---------------------------------------------------------------- grafica

function logoDataUri() {
    const png = fs.readFileSync(path.join(radice, 'assets', 'logo-revilaw-bianco.png'));
    return `data:image/png;base64,${png.toString('base64')}`;
}

function modello(p, logo) {
    // Titoli lunghi: si scala il carattere invece di tagliare il testo.
    const n = p.titolo.length;
    const corpo = n <= 40 ? 68 : n <= 60 ? 60 : n <= 85 ? 52 : n <= 115 ? 45 : 39;
    return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=block" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    font-family: Inter, 'Segoe UI', Arial, sans-serif; color: #fff; overflow: hidden; position: relative;
    background:
      radial-gradient(circle at 92% 18%, rgba(91,137,184,.38) 0, rgba(91,137,184,0) 42%),
      radial-gradient(circle at 105% 110%, rgba(60,111,160,.45) 0, rgba(60,111,160,0) 50%),
      linear-gradient(135deg, #0A2844 0%, #164068 62%, #2A5A85 100%);
  }
  .anelli { position: absolute; right: -170px; top: -170px; width: 640px; height: 640px; border-radius: 50%;
    border: 1.5px solid rgba(255,255,255,.08); box-shadow: 0 0 0 70px rgba(255,255,255,.025), 0 0 0 140px rgba(255,255,255,.018); }
  .barra { position: absolute; left: 0; top: 0; bottom: 0; width: 14px; background: linear-gradient(#5B89B8, #2A5A85); }
  .contenuto { position: absolute; left: 84px; right: 84px; top: 66px; bottom: 60px; display: flex; flex-direction: column; }
  .etichetta { display: inline-flex; align-self: flex-start; align-items: center; gap: 12px;
    font-size: 20px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #BFD3E8; }
  .etichetta::before { content: ''; width: 34px; height: 3px; background: #5B89B8; border-radius: 2px; }
  h1 { margin-top: 30px; font-size: ${corpo}px; line-height: 1.12; font-weight: 800; letter-spacing: -.02em;
    display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; text-wrap: balance; }
  p { margin-top: 24px; font-size: 25px; line-height: 1.42; color: #C9D8E8; font-weight: 400; max-width: 960px;
    display: -webkit-box; -webkit-line-clamp: ${corpo >= 52 ? 3 : 2}; -webkit-box-orient: vertical; overflow: hidden; }
  .piede { margin-top: auto; display: flex; align-items: center; justify-content: space-between;
    padding-top: 26px; border-top: 1px solid rgba(255,255,255,.16); }
  .piede img { height: 58px; }
  .sito { font-size: 21px; font-weight: 500; color: #9FBBD8; letter-spacing: .02em; }
</style></head><body>
  <div class="anelli"></div><div class="barra"></div>
  <div class="contenuto">
    <div class="etichetta">${escapeHtml(p.etichetta)}</div>
    <h1>${escapeHtml(p.titolo)}</h1>
    ${p.descrizione ? `<p>${escapeHtml(p.descrizione)}</p>` : ''}
    <div class="piede"><img src="${logo}" alt=""><span class="sito">nextgenerationbusiness.it</span></div>
  </div>
</body></html>`;
}

// ---------------------------------------------------------------- meta tag

function aggiornaMeta(html, url, alt) {
    let out = html;
    const sostituisci = (attr, nome, valore) => {
        const re = new RegExp(`(<meta\\s+${attr}="${nome}"\\s+content=")[^"]*(")`, 'i');
        if (re.test(out)) { out = out.replace(re, `$1${valore}$2`); return true; }
        return false;
    };
    // Aggiunge un meta subito dopo un altro, con lo stesso rientro e la stessa
    // chiusura (alcune pagine usano " />", altre ">").
    const aggiungiDopo = (attrRif, nomeRif, attr, nome, valore) => {
        const re = new RegExp(`([ \\t]*)(<meta\\s+${attrRif}="${nomeRif}"\\s+content="[^"]*"\\s*(/?)>)`, 'i');
        out = out.replace(re, (_, rientro, tag, barra) =>
            `${rientro}${tag}\n${rientro}<meta ${attr}="${nome}" content="${valore}"${barra ? ' />' : '>'}`);
    };

    sostituisci('property', 'og:image', url);
    sostituisci('property', 'og:image:secure_url', url);
    if (!sostituisci('name', 'twitter:image', url)) aggiungiDopo('name', 'twitter:description', 'name', 'twitter:image', url);
    if (!sostituisci('property', 'og:image:type', 'image/jpeg')) aggiungiDopo('property', 'og:image', 'property', 'og:image:type', 'image/jpeg');
    if (!/property="og:image:width"/.test(out)) {
        aggiungiDopo('property', 'og:image:type', 'property', 'og:image:height', '630');
        aggiungiDopo('property', 'og:image:type', 'property', 'og:image:width', '1200');
    }
    if (!sostituisci('property', 'og:image:alt', alt)) aggiungiDopo('property', 'og:image:height', 'property', 'og:image:alt', alt);
    if (!sostituisci('name', 'twitter:image:alt', alt)) aggiungiDopo('name', 'twitter:image', 'name', 'twitter:image:alt', alt);
    if (!/name="twitter:card"/.test(out)) aggiungiDopo('name', 'twitter:image', 'name', 'twitter:card', 'summary_large_image');
    return out;
}

// ---------------------------------------------------------------- main

function caricaPlaywright() {
    try { return require('playwright'); } catch (_) { /* proviamo globale */ }
    try {
        const globale = require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim();
        return require(path.join(globale, 'playwright'));
    } catch (_) {
        console.error('Serve Playwright: npm i -D playwright && npx playwright install chromium');
        process.exit(2);
    }
}

async function main() {
    const argomenti = process.argv.slice(2);
    const forza = argomenti.includes('--forza');
    const filtro = argomenti.filter((a) => !a.startsWith('--'));

    fs.mkdirSync(CARTELLA, { recursive: true });
    const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};

    const pagine = trovaPagine(filtro).map(leggiPagina).filter(Boolean);
    const daFare = [];
    for (const p of pagine) {
        if (p.saltata) { console.log(`  = ${p.rel} (${p.saltata})`); continue; }
        p.impronta = crypto.createHash('sha1')
            .update(JSON.stringify([VERSIONE_GRAFICA, p.titolo, p.descrizione, p.etichetta]))
            .digest('hex').slice(0, 10);
        p.url = `${SITO}/assets/og/${p.nome}.jpg?v=${p.impronta}`;
        const giaFatta = manifest[p.nome] && manifest[p.nome].impronta === p.impronta
            && fs.existsSync(path.join(CARTELLA, `${p.nome}.jpg`));
        p.rigenera = forza || !giaFatta;
        daFare.push(p);
    }

    const daDisegnare = daFare.filter((p) => p.rigenera);
    if (daDisegnare.length) {
        const { chromium } = caricaPlaywright();
        const browser = await chromium.launch();
        const pagina = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
        const logo = logoDataUri();
        for (const p of daDisegnare) {
            await pagina.setContent(modello(p, logo), { waitUntil: 'networkidle' });
            await pagina.evaluate(() => document.fonts.ready);
            await pagina.screenshot({ path: path.join(CARTELLA, `${p.nome}.jpg`), type: 'jpeg', quality: 88 });
            manifest[p.nome] = { pagina: p.rel, impronta: p.impronta, titolo: p.titolo };
            console.log(`  + ${p.rel} -> assets/og/${p.nome}.jpg`);
        }
        await browser.close();
    }

    let modificate = 0;
    for (const p of daFare) {
        const alt = escapeHtml(p.titolo);
        const nuovo = aggiornaMeta(p.html, p.url, alt);
        if (nuovo !== p.html) {
            fs.writeFileSync(path.join(radice, p.rel), nuovo);
            modificate++;
            if (!p.rigenera) console.log(`  ~ ${p.rel} (solo meta)`);
        }
    }

    const ordinato = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
    fs.writeFileSync(MANIFEST, `${JSON.stringify(ordinato, null, 2)}\n`);
    console.log(`\nImmagini disegnate: ${daDisegnare.length}, pagine aggiornate: ${modificate}, invariate: ${daFare.length - daDisegnare.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
