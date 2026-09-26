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

    /* Il marchio Revilaw, incorporato nel file: il cartello si apre e si
       stampa anche senza rete, e un'immagine esterna mancante lascerebbe un
       buco proprio in testa al foglio. E' il marchio bianco del sito
       (assets/), lo stesso della testata delle mail. */
    const FILE_LOGO = path.join(__dirname, '..', 'assets', 'logo-revilaw-bianco.png');
    const logo = fs.existsSync(FILE_LOGO)
        ? 'data:image/png;base64,' + fs.readFileSync(FILE_LOGO).toString('base64')
        : '';

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
    padding: 0 0 14mm; font-family: 'Montserrat', 'Segoe UI', Arial, sans-serif; color: #16202e;
    display: flex; flex-direction: column; align-items: center; text-align: center;
}
@media print { .foglio { margin: 0; box-shadow: none; page-break-after: always; } body { background: #fff; } }
/* la testata: marchio a sinistra, evento a destra, titolo sotto - come le mail */
.fascia { width: 100%; background: #0A2844; color: #fff; padding: 9mm 16mm 9mm; text-align: left; }
.fascia .riga { display: flex; align-items: center; justify-content: space-between; gap: 8mm; }
.fascia img { height: 13mm; width: auto; display: block; }
.fascia .evento { font-size: 9.5pt; letter-spacing: 0.16em; text-transform: uppercase; color: #7FA8CE; font-weight: 700; text-align: right; line-height: 1.4; }
.fascia h1 { margin: 5mm 0 0; font-size: 25pt; font-weight: 800; line-height: 1.15; letter-spacing: -0.01em; }
.fascia .sotto { margin: 3mm 0 0; font-size: 12.5pt; color: #C8DAEA; font-weight: 500; line-height: 1.4; }
.corpo { width: 100%; padding: 0 16mm; display: flex; flex-direction: column; align-items: center; }
.qr { width: 80mm; height: 80mm; margin-top: 6mm; }
.qr svg { width: 100%; height: 100%; display: block; }
.indirizzo { margin-top: 1mm; font-family: ui-monospace, Consolas, monospace; font-size: 10.5pt; color: #475569; word-break: break-all; max-width: 160mm; }
/* i passi: numero in cerchio, titolo in grassetto, spiegazione sotto */
.passi { margin: 7mm 0 0; padding: 0; list-style: none; width: 100%; text-align: left; font-family: 'Inter', 'Segoe UI', Arial, sans-serif; }
.passi > li { display: grid; grid-template-columns: 10mm 1fr; gap: 0 4mm; align-items: start; margin-bottom: 4.2mm; }
.passi > li > b { display: inline-flex; width: 9mm; height: 9mm; border-radius: 50%; background: #164068; color: #fff; align-items: center; justify-content: center; font-size: 12pt; font-family: 'Montserrat', 'Segoe UI', Arial, sans-serif; margin-top: 0.5mm; }
.passi .t { font-size: 12.5pt; font-weight: 700; color: #0A2844; line-height: 1.3; }
.passi .d { font-size: 11pt; line-height: 1.45; color: #1E293B; margin-top: 0.8mm; }
.passi .d em, .casi em { font-style: normal; font-weight: 700; color: #164068; }
.casi { margin: 1.5mm 0 0; padding: 0; list-style: none; }
.casi li { font-size: 11pt; line-height: 1.45; color: #1E293B; padding-left: 4.5mm; position: relative; }
.casi li::before { content: ''; position: absolute; left: 0; top: 2.1mm; width: 1.8mm; height: 1.8mm; border-radius: 50%; background: #2A5A85; }
.piede { position: absolute; bottom: 8mm; left: 16mm; right: 16mm; border-top: 1px solid #E2E8F0; padding-top: 3mm; font-family: 'Inter', 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #5b6878; line-height: 1.4; }
</style>
</head>
<body>
<div class="promemoria">
    <strong>Prima di stampare:</strong> scala 100% (mai "adatta alla pagina"), carta opaca, non ritagliare dentro la cornice bianca del QR.
    Prova il QR stampato con <strong>tre telefoni diversi</strong>. Chiave nel QR: <code>${fuga(chiave)}</code> — deve essere uguale a <code>PRESENZA_NAPOLI_CHIAVE</code> su Vercel, altrimenti la pagina risponde sempre "non trovato".
</div>
<div class="foglio">
    <div class="fascia">
        <div class="riga">
            ${logo ? '<img src="' + logo + '" alt="Revilaw - Revisione legale">' : '<div style="font-size:16pt;font-weight:800;letter-spacing:0.12em;">REVILAW</div>'}
            <div class="evento">Next Generation Business<br>Napoli &middot; 2 ottobre 2026</div>
        </div>
        <h1>Accredito all&rsquo;ingresso:<br>inquadra il QR con il telefono</h1>
        <p class="sotto">Ti sei iscritto online? Ricevi subito il tuo invito. Non ti sei iscritto? Registrati da qui in due minuti.</p>
    </div>
    <div class="corpo">
        <div class="qr">${qr}</div>
        <div class="indirizzo">${fuga(link)}</div>
        <ol class="passi">
            <li><b>1</b><div>
                <div class="t">Inquadra il QR con la fotocamera e apri la pagina</div>
                <div class="d">Non serve nessuna app: basta la fotocamera del telefono. Se il QR non si legge, scrivi nel browser l&rsquo;indirizzo qui sopra.</div>
            </div></li>
            <li><b>2</b><div>
                <div class="t">Scrivi l&rsquo;email con cui ti sei iscritto</div>
                <ul class="casi">
                    <li><em>Eri iscritto per la diretta online?</em> Tocca <em>&laquo;Passa in sala&raquo;</em>: ti spostiamo fra i presenti e ti mandiamo l&rsquo;invito.</li>
                    <li><em>Sei gi&agrave; iscritto in sala?</em> Tocca <em>&laquo;Mandami l&rsquo;invito&raquo;</em>: ricevi una copia dell&rsquo;invito.</li>
                    <li><em>Non risulti?</em> Compila il questionario dal telefono, poi conferma l&rsquo;indirizzo dall&rsquo;email <em>&laquo;Richiesta di conferma&raquo;</em>.</li>
                </ul>
            </div></li>
            <li><b>3</b><div>
                <div class="t">Apri l&rsquo;email &laquo;Il tuo invito&raquo;</div>
                <div class="d">Contiene l&rsquo;invito in PDF. Controlla anche fra spam e promozioni: il mittente &egrave; <em>noreply@nextgenerationbusiness.it</em>.</div>
            </div></li>
            <li><b>4</b><div>
                <div class="t">Mostra l&rsquo;invito al desk Revilaw, anche dal telefono</div>
                <div class="d">Ti consegniamo il badge e ti accompagniamo in sala. Benvenuto.</div>
            </div></li>
        </ol>
    </div>
    <div class="piede">Qualcosa non funziona? Chiedi al desk Revilaw all&rsquo;ingresso: ti registriamo noi, basta il tuo nome. &nbsp;&middot;&nbsp; nextgenerationbusiness.it</div>
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
