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

   `dati`: { nome, azienda, ruolo, evento: {titolo, tema, quando, luogo,
   indirizzo, orario, programma}, online, emessoIl }.
   ============================================================ */

const { pdfDaFlusso, inLatin1, Foglio, A4, LATO, DENTRO, C } = require('./pdf-prenotazione');
// il logo dello studio e le larghezze vere dei caratteri (testo giustificato, allineamento a destra)
const { LOGO, larghezzaEsatta } = require('./pdf-grafica');

/* L'impaginato e' quello di un documento dello studio: testata bianca con il
   logo Revilaw, filetti sottili invece di fondi pieni, i dati in tabella e
   tutto il testo corrente GIUSTIFICATO, come nel resto del sito. Il solo
   blocco scuro e' la riga per cui il foglio esiste: da presentare al desk. */
function contenutoPagina(dati) {
    const d = dati || {};
    const ev = d.evento || {};
    const f = Foglio();
    const DESTRA = A4.larghezza - LATO;
    const aDestra = (t, opz) => {
        const o = opz || {};
        const largo = larghezzaEsatta(inLatin1(t), o.corpo || 11, !!o.grassetto) + (o.spazio || 0) * inLatin1(t).length;
        f.testo(t, Object.assign({}, o, { x: DESTRA - largo }));
    };
    const occhiello = (t, alto, x) => f.testo(t, { alto: alto, x: x, corpo: 8, grassetto: true, colore: C.accento, spazio: 1.4 });

    // --- testata: logo a sinistra, il convegno a destra ---
    const largoLogo = 150;
    const altoLogo = largoLogo * LOGO.altezza / LOGO.larghezza;
    f.immagine('Logo', LATO, 40, largoLogo, altoLogo);
    aDestra('NEXT GENERATION BUSINESS', { alto: 58, corpo: 8.5, grassetto: true, colore: C.scuro, spazio: 1.4 });
    aDestra(ev.titolo || '', { alto: 73, corpo: 9, colore: C.tenue });
    f.rettangolo(LATO, 104, DENTRO, 2, C.scuro);
    f.rettangolo(LATO, 107, 64, 2, C.accento);

    // --- titolo ---
    occhiello(d.online ? 'CONFERMA DI ISCRIZIONE' : 'INVITO PERSONALE', 146);
    f.testo('Next Generation Business', { alto: 176, corpo: 24, grassetto: true, colore: C.scuro });
    f.y = 198;
    if (ev.tema) f.paragrafo(ev.tema, { corpo: 12.5, colore: C.accento, passo: 17, giustifica: true });

    // --- a chi e' intestato ---
    f.scendi(18);
    const cimaChi = f.y;
    const sotto = [d.azienda, d.ruolo].filter(Boolean).join(' · ');
    const altoChi = sotto ? 76 : 58;
    f.rettangolo(LATO, cimaChi, DENTRO, altoChi, C.chiaro);
    f.rettangolo(LATO, cimaChi, 3, altoChi, C.accento);
    occhiello('INTESTATO A', cimaChi + 22, LATO + 18);
    f.testo(d.nome || 'Ospite', { alto: cimaChi + 44, x: LATO + 18, corpo: 18, grassetto: true, colore: C.scuro });
    if (sotto) f.testo(sotto, { alto: cimaChi + 62, x: LATO + 18, corpo: 10.5, colore: C.tenue });
    f.y = cimaChi + altoChi + 30;

    // --- i dati della giornata, in tabella con filetti ---
    occhiello('LA GIORNATA', f.y);
    f.scendi(10);
    const righe = [];
    if (ev.quando) righe.push(['Data', ev.quando]);
    if (ev.orario) righe.push(['Orario', ev.orario]);
    if (ev.luogo) righe.push(['Sede', ev.luogo]);
    if (ev.indirizzo) righe.push(['Indirizzo', ev.indirizzo]);
    if (ev.programma) righe.push(['Programma', ev.programma]);
    righe.push(['Partecipazione', d.online ? 'Online, in diretta' : 'In presenza, su invito personale']);
    const colValore = LATO + 120;
    const largoValore = DESTRA - colValore;
    righe.forEach(r => {
        f.linea(LATO, f.y, DESTRA, C.bordo, 0.8);
        f.scendi(18);
        const altoRiga = f.y;
        f.testo(r[0].toUpperCase(), { alto: altoRiga, corpo: 7.5, grassetto: true, colore: C.tenue, spazio: 1 });
        f.y = altoRiga;
        f.paragrafo(r[1], { x: colValore, dentro: largoValore, corpo: 10.5, grassetto: true, colore: C.scuro, passo: 14, giustifica: true });
        f.scendi(-4);
    });
    f.linea(LATO, f.y, DESTRA, C.bordo, 0.8);
    f.scendi(30);

    // --- la riga per cui il foglio esiste ---
    if (d.online) {
        occhiello('COME SEGUIRE I LAVORI', f.y);
        f.scendi(20);
        f.paragrafo('Qualche giorno prima dell\'evento riceverai per email il collegamento e le istruzioni per seguire i lavori in diretta. Conserva questa conferma: riporta i dati con cui ti sei iscritto.',
            { corpo: 10.5, colore: C.testo, passo: 15.5, giustifica: true });
    } else {
        const altoBox = 70;
        f.rettangolo(LATO, f.y, DENTRO, altoBox, C.scuro);
        f.testo('DA PRESENTARE ALL\'ACCREDITAMENTO', { alto: f.y + 26, x: LATO + 22, corpo: 8, grassetto: true, colore: C.chiaroBlu, spazio: 1.4 });
        f.testo('Mostra questo invito al desk Revilaw, stampato o dal telefono.', { alto: f.y + 48, x: LATO + 22, corpo: 12.5, grassetto: true, colore: C.bianco });
        f.scendi(altoBox + 30);
        occhiello('INFORMAZIONI UTILI', f.y);
        f.scendi(20);
        f.paragrafo('All\'ingresso della sala il personale Revilaw verifica l\'invito e consegna il badge nominativo. L\'invito è personale e vale per la persona indicata: chi desidera partecipare con un collega lo invita a iscriversi dalla pagina dell\'evento.',
            { corpo: 10.5, colore: C.testo, passo: 15.5, giustifica: true });
        f.scendi(6);
        f.paragrafo('Se i tuoi programmi cambiano, dal collegamento personale nella mail di iscrizione puoi correggere i dati o annullare la partecipazione, liberando il posto per altri ospiti. Per qualunque informazione scrivi a info@nextgenerationbusiness.it.',
            { corpo: 10.5, colore: C.testo, passo: 15.5, giustifica: true });
    }

    // --- piede ---
    const altoPiede = A4.altezza - 64;
    f.linea(LATO, altoPiede, DESTRA, C.bordo, 0.8);
    f.testo('Revilaw S.p.A. · Via XX Settembre 9, 37129 Verona · P.IVA 04641610235',
        { alto: altoPiede + 18, corpo: 8, colore: C.tenue });
    f.testo('nextgenerationbusiness.it', { alto: altoPiede + 30, corpo: 8, grassetto: true, colore: C.accento });
    aDestra('Documento personale e non cedibile', { alto: altoPiede + 18, corpo: 8, colore: C.tenue });
    aDestra('Emesso il ' + (d.emessoIl || ''), { alto: altoPiede + 30, corpo: 8, colore: C.tenue });

    return f.contenuto();
}

function pdfInvito(dati) {
    const titolo = 'Invito Next Generation Business - ' + inLatin1((dati && dati.nome) || '');
    return pdfDaFlusso(contenutoPagina(dati), titolo, { Logo: LOGO });
}
// il nome del file allegato: solo lettere e numeri, che ogni client di posta apre
function nomeFileInvito(nome) {
    const base = inLatin1(nome || 'ospite').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ospite';
    return 'Invito-NGB-' + base + '.pdf';
}

module.exports = { pdfInvito, nomeFileInvito };
