/* ============================================================
   PDF dell'invito d'ingresso
   ------------------------------------------------------------
   Il foglio che l'ospite esibisce all'ingresso, anche dal telefono.
   Parte in allegato alla seconda mail, quella che segue la conferma
   dell'indirizzo email: e' il modo in cui "confermato" diventa una
   cosa che si ha in mano.

   Una pagina, stesso Foglio e stesso file minimo del foglio degli
   incontri B2B (lib/pdf-prenotazione.js spiega perche' scritto a mano
   e non con una libreria).

   `dati`: { nome, azienda, ruolo, evento: {titolo, quando, luogo,
   indirizzo, orario}, online, emessoIl }.
   ============================================================ */

const { pdfDaFlusso, inLatin1, Foglio, aCapo, A4, LATO, DENTRO, C } = require('./pdf-prenotazione');

function contenutoPagina(dati) {
    const d = dati || {};
    const ev = d.evento || {};
    const f = Foglio();

    // --- testata scura ---
    const altaTesta = 132;
    f.rettangolo(0, 0, A4.larghezza, altaTesta, C.scuro);
    f.testo('REVILAW', { alto: 44, corpo: 17, grassetto: true, colore: C.bianco, spazio: 2.2 });
    f.testo('Revisione legale', { alto: 60, corpo: 9, colore: C.chiaroBlu, spazio: 1.1 });
    f.testo('NEXT GENERATION BUSINESS', { alto: 92, corpo: 8.5, grassetto: true, colore: C.chiaroBlu, spazio: 1.6 });
    f.testo(d.online ? 'La tua iscrizione' : 'Il tuo invito', { alto: 114, corpo: 20, grassetto: true, colore: C.bianco });

    // --- di chi e' ---
    f.y = altaTesta + 44;
    f.testo('PARTECIPANTE', { corpo: 8.5, grassetto: true, colore: C.accento, spazio: 1.4 });
    f.scendi(22);
    f.paragrafo(d.nome || 'Ospite', { corpo: 19, grassetto: true, colore: C.scuro, passo: 24 });
    const sotto = [d.azienda, d.ruolo].filter(Boolean).join(' - ');
    if (sotto) f.paragrafo(sotto, { corpo: 11.5, colore: C.tenue, passo: 17 });

    // --- riquadro "quando e dove" ---
    const dove = [ev.luogo, ev.indirizzo].filter(Boolean).join(' - ');
    const righeBox = [];
    righeBox.push(['CONVEGNO', 'Next Generation Business - ' + (ev.titolo || '')]);
    if (ev.quando) righeBox.push(['GIORNO', ev.quando]);
    if (ev.orario) righeBox.push(['ORARIO', ev.orario]);
    if (dove) righeBox.push(['DOVE', dove]);
    righeBox.push(['PARTECIPAZIONE', d.online ? 'Online, in diretta' : 'In sala']);
    const largoValore = DENTRO - 134;
    const spezzate = righeBox.map(r => aCapo(r[1], 11, largoValore));
    const altezza = 20 + spezzate.reduce((t, righe) => t + righe.length * 15 + 8, 0);
    const cima = f.y + 8;
    f.rettangolo(LATO, cima, DENTRO, altezza, C.chiaro);
    f.rettangolo(LATO, cima, 3, altezza, C.accento);
    let alto = cima + 22;
    righeBox.forEach((r, i) => {
        f.testo(r[0], { alto: alto, x: LATO + 18, corpo: 8, grassetto: true, colore: C.accento, spazio: 1 });
        spezzate[i].forEach((riga, k) => {
            f.testo(riga, { alto: alto + k * 15, x: LATO + 134, corpo: 11, grassetto: k === 0, colore: C.scuro });
        });
        alto += spezzate[i].length * 15 + 8;
    });
    f.y = cima + altezza + 40;

    // --- l'avviso: la riga per cui questo foglio esiste ---
    if (d.online) {
        f.testo('COME SEGUIRE I LAVORI', { corpo: 8.5, grassetto: true, colore: C.accento, spazio: 1.4 });
        f.scendi(10);
        f.linea(LATO, f.y, A4.larghezza - LATO, C.bordo, 1);
        f.scendi(22);
        f.paragrafo('Qualche giorno prima dell\'evento riceverai per email il collegamento e le istruzioni per seguire i lavori in diretta.',
            { corpo: 11.5, colore: C.testo, passo: 17 });
    } else {
        const altoBox = 74;
        f.rettangolo(LATO, f.y, DENTRO, altoBox, C.blu);
        f.testo('DA ESIBIRE ALL\'INGRESSO', { alto: f.y + 28, x: LATO + 22, corpo: 9, grassetto: true, colore: C.chiaroBlu, spazio: 1.6 });
        f.testo('Mostra questo foglio al desk, anche dal telefono.', { alto: f.y + 52, x: LATO + 22, corpo: 14, grassetto: true, colore: C.bianco });
        f.scendi(altoBox + 30);
        f.testo('ALL\'ARRIVO', { corpo: 8.5, grassetto: true, colore: C.accento, spazio: 1.4 });
        f.scendi(10);
        f.linea(LATO, f.y, A4.larghezza - LATO, C.bordo, 1);
        f.scendi(22);
        f.paragrafo('Al desk Revilaw all\'ingresso della sala ti accreditiamo e ti consegniamo il badge. Se qualcosa cambia, dal collegamento personale nella mail di iscrizione puoi correggere i tuoi dati o annullare la partecipazione.',
            { corpo: 11.5, colore: C.testo, passo: 17 });
    }

    // --- piede ---
    const altoPiede = A4.altezza - 66;
    f.linea(LATO, altoPiede, A4.larghezza - LATO, C.bordo, 1);
    f.testo('Revilaw S.p.A. - Via XX Settembre 9, 37129 Verona - C.F. 04641610235',
        { alto: altoPiede + 18, corpo: 8.5, colore: C.tenue });
    f.testo('Invito emesso il ' + (d.emessoIl || '') + ' - nextgenerationbusiness.it',
        { alto: altoPiede + 31, corpo: 8.5, colore: C.tenue });

    return f.contenuto();
}

function pdfInvito(dati) {
    const titolo = 'Invito Next Generation Business - ' + inLatin1((dati && dati.nome) || '');
    return pdfDaFlusso(contenutoPagina(dati), titolo);
}
// il nome del file allegato: solo lettere e numeri, che ogni client di posta apre
function nomeFileInvito(nome) {
    const base = inLatin1(nome || 'ospite').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ospite';
    return 'Invito-NGB-' + base + '.pdf';
}

module.exports = { pdfInvito, nomeFileInvito };
