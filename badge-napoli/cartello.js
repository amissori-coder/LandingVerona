#!/usr/bin/env node
/* ============================================================
   CARTELLO PER IL DESK - Next Generation Business, Napoli 2 ottobre 2026
   ------------------------------------------------------------
       PRESENZA_NAPOLI_CHIAVE=... node cartello.js

   Produce out/cartello-accredito.html: un foglio A4 con il QR che apre
   /p26/ per chi arriva in sala senza essersi iscritto online. La
   pagina cerca la persona fra le iscrizioni e, se non c'e', le fa
   compilare il questionario dal telefono.

   LA CHIAVE. Nell'indirizzo del QR c'e' la chiave che il servizio
   confronta con la variabile PRESENZA_NAPOLI_CHIAVE impostata su
   Vercel: DEVE essere la stessa, altrimenti la pagina risponde a
   tutti "non trovato". Per questo la legge dall'ambiente e non da un
   file: cosi' non finisce nel repo e non si stampa una chiave che il
   servizio non conosce.

   Stesse regole di stampa dei badge (README): scala 100%, carta
   opaca, QR nero su bianco con la sua cornice, niente logo sopra.
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');
const QR = require('qrcode');

const PAGINA = 'https://nextgenerationbusiness.it/p26/';
const CARTELLA_OUT = path.join(__dirname, 'out');
const FILE_OUT = path.join(CARTELLA_OUT, 'cartello-accredito.html');

function fuga(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function main() {
    const chiave = String(process.env.PRESENZA_NAPOLI_CHIAVE || '').trim();
    if (!chiave) {
        console.error('Manca PRESENZA_NAPOLI_CHIAVE.\n'
            + 'E\' la chiave stampata nel QR, la stessa da impostare su Vercel per il servizio email.\n'
            + 'Scegline una (lettere e numeri, 12-20 caratteri) e lancia:\n'
            + '    PRESENZA_NAPOLI_CHIAVE=lachiave node cartello.js');
        process.exit(1);
    }
    if (!/^[A-Za-z0-9]{8,40}$/.test(chiave)) {
        console.error('La chiave deve essere di sole lettere e numeri, da 8 a 40 caratteri: nel QR ogni carattere in piu\' lo rende piu\' fitto.');
        process.exit(1);
    }

    // il frammento (#) non viaggia verso il server della pagina: la chiave resta fra telefono e servizio
    const link = PAGINA + '#k=' + chiave;
    const qr = await QR.toString(link, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 4,                   // la cornice bianca fa parte del codice
        color: { dark: '#000000', light: '#ffffff' }
    });

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Cartello accredito - Napoli 2 ottobre 2026</title>
<style>
/* Non si stampa: promemoria per chi manda in stampa. */
.promemoria { font: 14px/1.5 system-ui, sans-serif; background: #fff7e0; border: 1px solid #e0c98a; padding: 12px 16px; margin: 16px; max-width: 800px; }
@media print { .promemoria { display: none; } }

@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; background: #eee; }
.foglio {
    width: 210mm; height: 297mm; margin: 16px auto; background: #fff; position: relative;
    padding: 18mm 18mm 16mm; font-family: 'Montserrat', 'Segoe UI', Arial, sans-serif; color: #16202e;
    display: flex; flex-direction: column; align-items: center; text-align: center;
}
@media print { .foglio { margin: 0; box-shadow: none; page-break-after: always; } body { background: #fff; } }
.fascia { width: 100%; background: #164068; color: #fff; padding: 9mm 8mm; }
.fascia .evento { font-size: 11pt; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.8; font-weight: 600; }
.fascia h1 { margin: 3mm 0 0; font-size: 26pt; font-weight: 800; line-height: 1.15; letter-spacing: -0.01em; }
.sotto { font-size: 15pt; margin: 9mm 0 6mm; font-weight: 600; max-width: 150mm; line-height: 1.35; }
.qr { width: 105mm; height: 105mm; }
.qr svg { width: 100%; height: 100%; display: block; }
.indirizzo { margin-top: 3mm; font-family: ui-monospace, Consolas, monospace; font-size: 12pt; color: #16202e; word-break: break-all; max-width: 160mm; }
.passi { margin: 8mm 0 0; padding: 0; list-style: none; width: 100%; max-width: 160mm; text-align: left; font-family: 'Inter', 'Segoe UI', Arial, sans-serif; }
.passi li { display: grid; grid-template-columns: 11mm 1fr; gap: 3mm; align-items: start; font-size: 12.5pt; line-height: 1.4; margin-bottom: 3.5mm; }
.passi b { display: inline-flex; width: 9mm; height: 9mm; border-radius: 50%; background: #164068; color: #fff; align-items: center; justify-content: center; font-size: 12pt; }
.piede { position: absolute; bottom: 12mm; left: 18mm; right: 18mm; font-family: 'Inter', 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #5b6878; }
</style>
</head>
<body>
<div class="promemoria">
    <strong>Prima di stampare:</strong> scala 100% (mai "adatta alla pagina"), carta opaca, non ritagliare dentro la cornice bianca del QR.
    Prova il QR stampato con <strong>tre telefoni diversi</strong>. Chiave nel QR: <code>${fuga(chiave)}</code> — deve essere uguale a <code>PRESENZA_NAPOLI_CHIAVE</code> su Vercel, altrimenti la pagina risponde sempre "non trovato".
</div>
<div class="foglio">
    <div class="fascia">
        <div class="evento">Next Generation Business &middot; Napoli, 2 ottobre 2026</div>
        <h1>Non ti sei iscritto online?<br>Registrati da qui</h1>
    </div>
    <p class="sotto">Inquadra il QR con la fotocamera del telefono: ci vuole un minuto e sei dentro.</p>
    <div class="qr">${qr}</div>
    <div class="indirizzo">${fuga(link)}</div>
    <ol class="passi">
        <li><b>1</b><span>Scrivi l&rsquo;email con cui ti sei iscritto, se lo hai fatto: se ti troviamo basta un tocco.</span></li>
        <li><b>2</b><span>Se non risulti, compila il questionario direttamente dal telefono.</span></li>
        <li><b>3</b><span>Mostra la schermata verde al desk e accomodati in sala.</span></li>
    </ol>
    <div class="piede">Il QR non si legge? Scrivi l&rsquo;indirizzo qui sopra nel browser, oppure chiedi al desk Revilaw: ti registriamo noi.</div>
</div>
</body>
</html>
`;

    fs.mkdirSync(CARTELLA_OUT, { recursive: true });
    fs.writeFileSync(FILE_OUT, html, 'utf8');
    console.log('Cartello scritto in ' + path.relative(process.cwd(), FILE_OUT));
    console.log('Indirizzo nel QR: ' + link);
}

main().catch(e => { console.error(e && e.message ? e.message : e); process.exit(1); });
