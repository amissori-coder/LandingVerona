#!/usr/bin/env node
// Controlla bandi/dati.js, l'elenco dei bandi della pagina /bandi/.
// Non modifica nulla: elenca i problemi ed esce con codice 1, cosi' su
// GitHub il controllo risulta fallito e arriva l'avviso.
//
// Uso:  node scripts/bandi/controlla-dati.cjs
//
// Perche' serve. Lo stesso file lo leggono in due: il browser, che lo
// esegue, e la newsletter dei bandi (email-service/lib/dati-bandi.js), che
// lo legge dal sito senza eseguirlo per accorgersi dei bandi nuovi. Se un
// giorno nel file finisce qualcosa che il browser capisce e la newsletter
// no (una variabile, una somma di testi), la pagina funziona ma la
// newsletter si ferma in silenzio. Qui le due letture si confrontano: se non
// coincidono, lo scopre chi ha toccato il file, non gli iscritti.
//
// Controlla anche quello che si sbaglia piu' spesso aggiungendo un bando:
// identificativi ripetuti o scritti male, date in un'altra forma, tipologie
// e finalita' che non esistono, la scheda PDF che manca o ha un altro nome.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const DATI = require('../../email-service/lib/dati-bandi.js');

const radice = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(radice, 'bandi', 'dati.js'), 'utf8');
const problemi = [];
const note = [];

// 1) la lettura del browser (qui si puo' eseguire: e' il file del repository)
let browser = null;
try {
    const finestra = {};
    vm.runInNewContext(src, { window: finestra });
    browser = finestra.NGB_BANDI;
    if (!browser || !Array.isArray(browser.BANDI)) problemi.push('Il file non definisce window.NGB_BANDI.BANDI: la pagina resterebbe vuota.');
} catch (e) {
    problemi.push('Il browser non riesce a eseguire il file: ' + e.message);
}

// 2) la lettura della newsletter, che non esegue
let letto = null;
try {
    letto = DATI.leggiFile(src);
} catch (e) {
    problemi.push('La newsletter dei bandi non riesce a leggere il file: ' + e.message + '. In bandi/dati.js vanno solo valori scritti (testi, numeri, true/false, elenchi), non variabili o calcoli.');
}

// 3) le due letture devono coincidere, campo per campo
if (browser && letto && JSON.stringify(browser.BANDI) !== JSON.stringify(letto.grezzi)) {
    problemi.push('La newsletter legge i bandi in modo diverso dal browser: controlla le ultime modifiche a bandi/dati.js (solo valori scritti, niente calcoli).');
}
if (browser && letto && (JSON.stringify(browser.TIPOLOGIE || {}) !== JSON.stringify(letto.tipologie)
    || JSON.stringify(browser.FINALITA || {}) !== JSON.stringify(letto.finalita))) {
    problemi.push('La newsletter legge tipologie o finalita\' in modo diverso dal browser.');
}

// 4) le schede
if (letto) {
    letto.avvisi.forEach((a) => problemi.push('Scheda scartata: ' + a + '.'));
    const tipologie = letto.tipologie || {};
    const finalita = letto.finalita || {};
    (letto.grezzi || []).forEach((g, n) => {
        if (!g || typeof g !== 'object') return;
        const id = String(g.id || 'voce ' + (n + 1));
        ['apertura', 'chiusura', 'aggiornata'].forEach((campo) => {
            if (g[campo] != null && g[campo] !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(g[campo]))) {
                problemi.push(id + ': la data «' + campo + '» va scritta AAAA-MM-GG (ora: «' + g[campo] + '»).');
            }
        });
        if (g.apertura && g.chiusura && String(g.apertura) > String(g.chiusura)) problemi.push(id + ': l\'apertura viene dopo la chiusura.');
        (Array.isArray(g.tipologie) ? g.tipologie : []).forEach((t) => { if (!tipologie[t]) problemi.push(id + ': la tipologia «' + t + '» non e\' fra le TIPOLOGIE.'); });
        (Array.isArray(g.finalita) ? g.finalita : []).forEach((f) => { if (!finalita[f]) problemi.push(id + ': la finalita\' «' + f + '» non e\' fra le FINALITA.'); });
        if (!Array.isArray(g.tipologie) || !g.tipologie.length) problemi.push(id + ': manca la tipologia (serve al filtro).');
        if (!g.regione) problemi.push(id + ': manca la regione (o «Nazionale»).');
        if (!g.sintesi) note.push(id + ': manca la sintesi, che e\' anche il testo della newsletter.');
        if (g.pdf) {
            if (g.pdf !== id + '.pdf') problemi.push(id + ': la scheda PDF si deve chiamare «' + id + '.pdf» (ora: «' + g.pdf + '»).');
            else if (!fs.existsSync(path.join(radice, 'bandi', 'schede', g.pdf))) problemi.push(id + ': manca il file bandi/schede/' + g.pdf + ' (si rifa\' con node scripts/bandi/genera-schede.cjs).');
        } else {
            note.push(id + ': nessuna scheda PDF.');
        }
    });
}

const riepilogo = [];
if (problemi.length) {
    riepilogo.push(`## ${problemi.length} problem${problemi.length === 1 ? 'a' : 'i'} in bandi/dati.js`);
    riepilogo.push('');
    problemi.forEach((p) => riepilogo.push('- ' + p));
} else {
    riepilogo.push('## Bandi in ordine');
    riepilogo.push('');
    riepilogo.push(`${letto.bandi.length} bandi: la pagina e la newsletter li leggono allo stesso modo.`);
}
if (note.length) {
    riepilogo.push('');
    riepilogo.push('Note (non bloccano):');
    note.forEach((n) => riepilogo.push('- ' + n));
}
const testo = riepilogo.join('\n');
console.log(testo);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, testo + '\n');
process.exit(problemi.length ? 1 : 0);
