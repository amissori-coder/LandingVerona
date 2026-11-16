#!/usr/bin/env node
// Genera le schede PDF dei bandi (bandi/schede/<id>.pdf) nel formato Revilaw,
// a partire dai dati dell'area bandi (bandi/dati.js): sono quelle che si
// scaricano con «Scarica la scheda (PDF)».
//
// Uso:  node scripts/bandi/genera-schede.cjs                      (tutte)
//       node scripts/bandi/genera-schede.cjs mimit-brevetti-piu   (solo alcune)
//
// Quando rifarle: ogni volta che in bandi/dati.js si aggiunge un bando o si
// corregge una scheda. Il PDF e la pagina dicono cosi' la stessa cosa: il
// testo si scrive una volta sola, in dati.js. Lo script scrive anche il campo
// `pdf` che manca? No: in dati.js il campo `pdf` va messo a mano, uguale a
// '<id>.pdf'; lo script avvisa se un bando non lo ha o lo ha diverso.
//
// Il formato e' quello di stampa del sito (assets/stampa.css e stampa.js):
// foglio A4, testata con il logo Revilaw ripetuta su ogni pagina, in fondo i
// recapiti di Revilaw, nel margine l'indirizzo del sito e il numero di pagina.
// In piu', in cima, i dati essenziali del bando in un riquadro e, per i bandi
// che la chiedono, il bollo oro «Certificazione del revisore».
//
// Richiede Playwright (npm i -D playwright, oppure installato globalmente) e
// il carattere Inter installato sulla macchina; senza, il PDF esce in Arial.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const radice = path.resolve(__dirname, '..', '..');
const CARTELLA = path.join(radice, 'bandi', 'schede');
const SITO = 'nextgenerationbusiness.it';

// ------------------------------------------------------------------- i dati

function leggiDati() {
    const finestra = {};
    vm.runInNewContext(fs.readFileSync(path.join(radice, 'bandi', 'dati.js'), 'utf8'), { window: finestra });
    if (!finestra.NGB_BANDI || !Array.isArray(finestra.NGB_BANDI.BANDI)) {
        throw new Error('bandi/dati.js non definisce window.NGB_BANDI.BANDI');
    }
    return finestra.NGB_BANDI;
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
function dataEstesa(iso) {
    const p = String(iso || '').split('-');
    return p.length === 3 ? Number(p[2]) + ' ' + MESI[Number(p[1]) - 1] + ' ' + p[0] : '';
}
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function immagine(file) {
    return 'data:image/png;base64,' + fs.readFileSync(path.join(radice, file)).toString('base64');
}

// ----------------------------------------------------------------- la pagina

const SIGILLO = '<svg viewBox="0 0 48 48" aria-hidden="true">'
    + '<path fill="#164068" d="M15 30 10 46l7-4 4 5 3-12zM33 30l5 16-7-4-4 5-3-12z"/>'
    + '<circle fill="#0A2844" cx="24" cy="21" r="18"/>'
    + '<circle cx="24" cy="21" r="18" fill="none" stroke="#E6C870" stroke-width="3.2" stroke-dasharray="3.14 3.14"/>'
    + '<circle cx="24" cy="21" r="12.5" fill="none" stroke="#C9A53F" stroke-width="1.1"/>'
    + '<path d="M18.2 21.4l4 4 7.6-8.2" fill="none" stroke="#F3DE9A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'
    + '</svg>';

const STILE = `
@page { size: A4; margin: 12mm 15mm 17mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Inter", Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.5; color: #0f172a; }
table.impaginato { width: 100%; border-collapse: collapse; }
table.impaginato > thead { display: table-header-group; }
table.impaginato td { padding: 0; vertical-align: top; }
.testata { display: flex; justify-content: space-between; align-items: flex-end; gap: 10mm; padding-bottom: 2.5mm; margin-bottom: 7mm; border-bottom: 0.75pt solid #164068; }
.testata img { height: 9mm; width: auto; }
.testata-titolo { font-size: 7.5pt; line-height: 1.35; color: #475569; text-align: right; }
.testata-titolo strong { display: block; color: #164068; font-size: 8pt; letter-spacing: 0.9px; text-transform: uppercase; }
.occhiello { font-size: 8pt; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #2A5A85; margin-bottom: 3mm; }
h1 { font-size: 21pt; line-height: 1.16; letter-spacing: -0.4px; color: #164068; margin-bottom: 2mm; }
.ente { font-size: 10pt; color: #475569; margin-bottom: 5mm; }
.sintesi { font-size: 10.5pt; line-height: 1.55; color: #1e293b; margin-bottom: 5mm; text-align: justify; hyphens: auto; }
.bollo { display: flex; align-items: center; gap: 4mm; margin-bottom: 5mm; padding: 2.4mm 5mm 2.4mm 3mm; border-radius: 2mm; background: linear-gradient(100deg, #B8892B 0%, #E6C870 38%, #F3DE9A 52%, #DDB95A 70%, #B8892B 100%); color: #0A2844; break-inside: avoid; }
.bollo svg { flex: none; width: 11mm; height: 11mm; }
.bollo strong { display: block; font-size: 9pt; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; }
.bollo span { display: block; font-size: 8.5pt; font-weight: 600; color: #3D2F08; }
.dati { margin-bottom: 7mm; padding: 4mm 5mm; background: #f0f4f8; border: 0.5pt solid #c8d8e8; border-radius: 2mm; break-inside: avoid; }
.dato { display: grid; grid-template-columns: 30mm 1fr; gap: 3mm; padding: 1mm 0; }
.dato dt { font-size: 7pt; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #5A6270; padding-top: 0.6mm; }
.dato dd { font-size: 9.5pt; font-weight: 600; line-height: 1.4; }
h2 { font-size: 11.5pt; color: #164068; margin: 0 0 1.8mm; break-after: avoid; }
section { margin-bottom: 5mm; }
section p, section li { font-size: 10pt; line-height: 1.55; color: #1e293b; text-align: justify; hyphens: auto; orphans: 3; widows: 3; }
section p { margin-bottom: 2mm; }
section ul { margin: 0 0 2mm; padding-left: 5mm; }
section li { margin-bottom: 1mm; }
.chiusura { display: flex; align-items: center; gap: 6mm; margin-top: 8mm; padding-top: 4mm; border-top: 0.75pt solid #164068; break-inside: avoid; }
.chiusura img { height: 8mm; width: auto; }
.chiusura div { display: flex; flex-direction: column; gap: 0.8mm; font-size: 7.5pt; line-height: 1.45; color: #475569; }
.chiusura strong { color: #164068; font-size: 8pt; }
`;

function dato(nome, valore) {
    return valore ? '<div class="dato"><dt>' + esc(nome) + '</dt><dd>' + esc(valore) + '</dd></div>' : '';
}

function pagina(b, D, logo) {
    const tipologie = (b.tipologie || []).map((t) => D.TIPOLOGIE[t] || t).join(', ');
    const finalita = (b.finalita || []).map((f) => D.FINALITA[f] || f).join(', ');
    const procedura = b.procedura === 'graduatoria' ? 'A graduatoria, per punteggio'
        : (b.procedura === 'sportello' ? 'A sportello, in ordine cronologico' : '');
    const revisore = b.revisore ? (b.revisore === true ? 'È richiesta la certificazione del revisore legale' : b.revisore) : '';
    const sezioni = (b.sezioni || []).map((s) => {
        // paragrafi ed elenco nell'ordine in cui la sezione li da', come sulla pagina
        const dentro = Object.keys(s).filter((k) => k === 'p' || k === 'l').map((k) => (k === 'p'
            ? (s.p || []).map((t) => '<p>' + esc(t) + '</p>').join('')
            : '<ul>' + (s.l || []).map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>')).join('');
        return '<section><h2>' + esc(s.t) + '</h2>' + dentro + '</section>';
    }).join('');
    return '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>' + esc(b.titolo) + ' - Scheda sintetica</title><style>' + STILE + '</style></head><body>'
        + '<table class="impaginato"><thead><tr><td><div class="testata"><img src="' + logo + '" alt="Revilaw">'
        + '<div class="testata-titolo"><strong>Bandi e agevolazioni</strong>Scheda sintetica · ' + esc(b.titolo) + '</div></div></td></tr></thead>'
        + '<tbody><tr><td>'
        + '<div class="occhiello">Scheda sintetica · ' + esc(b.regione === 'Nazionale' ? 'Bando nazionale' : b.regione) + '</div>'
        + '<h1>' + esc(b.titolo) + '</h1>'
        + '<div class="ente">' + esc(b.ente) + '</div>'
        + (b.sintesi ? '<p class="sintesi">' + esc(b.sintesi) + '</p>' : '')
        + (b.revisore ? '<div class="bollo">' + SIGILLO + '<div><strong>Certificazione del revisore</strong><span>Richiesta da questo bando</span></div></div>' : '')
        + '<dl class="dati">' + dato('Agevolazione', b.importo) + dato('Tipologia', tipologie) + dato('Finalità', finalita)
        + dato('Per chi', b.beneficiari) + dato('Quando', b.scadenza) + dato('Revisore', revisore) + dato('Procedura', procedura) + '</dl>'
        + sezioni
        + '<div class="chiusura"><img src="' + logo + '" alt=""><div>'
        + '<strong>Revilaw S.p.A., società di revisione legale</strong>'
        + '<span>Via XX Settembre, 9, 37129 Verona. Telefono 045 8010734. info@nextgenerationbusiness.it</span>'
        + '<span>' + (b.aggiornata ? 'Scheda aggiornata al ' + dataEstesa(b.aggiornata) + '. ' : '')
        + 'Sintesi a scopo informativo: non sostituisce il testo ufficiale del bando né un parere professionale. '
        + 'Requisiti, importi e scadenze vanno verificati sull\'avviso pubblicato dall\'ente gestore.</span>'
        + '<span>Per informazioni su questo bando: ' + SITO + '/bandi/#' + esc(b.id) + '</span>'
        + '</div></div>'
        + '</td></tr></tbody></table></body></html>';
}

// il margine in basso: l'indirizzo del sito e il numero di pagina, come in assets/stampa.css
const PIEDE = '<div style="width:100%;padding:0 15mm;display:flex;justify-content:space-between;'
    + 'font-family:Inter,Arial,sans-serif;font-size:7.5pt;color:#64748b;">'
    + '<span>' + SITO + '/bandi</span>'
    + '<span>Pagina <span class="pageNumber"></span> di <span class="totalPages"></span></span></div>';

// -------------------------------------------------------------------- avvio

(async () => {
    const filtro = process.argv.slice(2);
    const D = leggiDati();
    const scelti = D.BANDI.filter((b) => !filtro.length || filtro.includes(b.id));
    if (!scelti.length) { console.error('Nessun bando con questi identificativi.'); process.exit(1); }

    let playwright;
    try { playwright = require('playwright'); }
    catch (_) { console.error('Serve Playwright: npm i -D playwright'); process.exit(2); }

    fs.mkdirSync(CARTELLA, { recursive: true });
    const logo = immagine('assets/logo-revilaw.png');
    const browser = await playwright.chromium.launch();
    const scheda = await browser.newPage();
    let avvisi = 0;
    for (const b of scelti) {
        if (b.pdf !== b.id + '.pdf') {
            avvisi++;
            console.warn('  ATTENZIONE  ' + b.id + ': in dati.js il campo pdf deve essere \'' + b.id + '.pdf\' (ora: ' + (b.pdf || 'manca') + ')');
        }
        await scheda.setContent(pagina(b, D, logo), { waitUntil: 'load' });
        await scheda.evaluate(() => document.fonts.ready);
        const file = path.join(CARTELLA, b.id + '.pdf');
        await scheda.pdf({
            path: file, format: 'A4', printBackground: true, preferCSSPageSize: true,
            displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: PIEDE
        });
        console.log('  ' + b.id + '.pdf  ' + Math.round(fs.statSync(file).size / 1024) + ' KB');
    }
    await browser.close();
    console.log(scelti.length + ' schede scritte in bandi/schede/' + (avvisi ? ' (' + avvisi + ' da sistemare in dati.js)' : ''));
})().catch((e) => { console.error(e); process.exit(1); });
