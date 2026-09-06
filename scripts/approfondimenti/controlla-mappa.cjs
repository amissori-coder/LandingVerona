#!/usr/bin/env node
// Controlla che ogni approfondimento pubblicato in home (le card della
// colonna "Approfondimenti & Risorse" in index.html) sia presente anche
// nella mappa di approfondimenti/index.html, cioè nell'esploratore per
// argomento. Non modifica nulla: elenca le pagine mancanti ed esce con
// codice 1, così su GitHub il controllo risulta fallito e arriva l'avviso.
//
// Uso:  node scripts/approfondimenti/controlla-mappa.cjs
// Segnala anche il caso opposto (nella mappa ma non in home) come nota,
// senza far fallire il controllo: nella mappa ci possono stare pagine
// che in home non hanno una card (per esempio le sottopagine ZLS e ZES).
'use strict';

const fs = require('fs');
const path = require('path');

const radice = path.resolve(__dirname, '..', '..');
const home = fs.readFileSync(path.join(radice, 'index.html'), 'utf8');
const mappa = fs.readFileSync(path.join(radice, 'approfondimenti', 'index.html'), 'utf8');

// Un indirizzo relativo alla radice del sito, senza "../", senza "#..."
// e senza "index.html" finale: così "zls_zes/", "../zls_zes/" e
// "zls_zes/index.html" sono la stessa pagina.
function normalizza(href) {
    return href.replace(/^(\.\.\/)+/, '').replace(/#.*$/, '').replace(/index\.html$/, '');
}

// Le card della home: <a href="..." class="content-card" ...>
const cardHome = [];
const reCard = /<a\s+href="([^"#][^"]*)"\s+class="content-card[^"]*"/g;
let m;
while ((m = reCard.exec(home)) !== null) cardHome.push(normalizza(m[1]));

// I collegamenti della mappa: ogni <a href="..."> dentro <ul class="mappa" ...>...</ul>
const inizio = mappa.indexOf('<ul class="mappa"');
const fine = mappa.indexOf('</section>', inizio);
if (inizio === -1 || fine === -1) {
    console.error('Non trovo la mappa (<ul class="mappa">) in approfondimenti/index.html');
    process.exit(2);
}
const blocco = mappa.slice(inizio, fine);
const inMappa = new Set();
const reLink = /<a\s+href="([^"]+)"/g;
while ((m = reLink.exec(blocco)) !== null) inMappa.add(normalizza(m[1]));

const mancanti = [...new Set(cardHome)].filter((h) => !inMappa.has(h));
const soloMappa = [...inMappa].filter((h) => !cardHome.includes(h));

const riepilogo = [];
if (mancanti.length) {
    riepilogo.push(`## ${mancanti.length} approfondiment${mancanti.length === 1 ? 'o' : 'i'} in home ma non nella mappa per argomento`);
    riepilogo.push('');
    riepilogo.push('Compaiono nell\'esploratore solo nell\'area di riserva "Altri approfondimenti". Per collocarli nel ramo giusto aggiungi una riga nella mappa di `approfondimenti/index.html` (sezione "Mappa completa"):');
    riepilogo.push('');
    mancanti.forEach((h) => riepilogo.push(`- \`${h}\``));
} else {
    riepilogo.push('## Mappa per argomento allineata con la home');
    riepilogo.push('');
    riepilogo.push(`Tutte le ${new Set(cardHome).size} card della home hanno un posto nell'esploratore.`);
}
if (soloMappa.length) {
    riepilogo.push('');
    riepilogo.push(`Nota: ${soloMappa.length} pagin${soloMappa.length === 1 ? 'a' : 'e'} nella mappa senza card in home (va bene così): ${soloMappa.map((h) => '`' + h + '`').join(', ')}`);
}

const testo = riepilogo.join('\n');
console.log(testo);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, testo + '\n');
process.exit(mancanti.length ? 1 : 0);
