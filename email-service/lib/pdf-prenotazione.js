/* ============================================================
   PDF della prenotazione agli incontri B2B
   ------------------------------------------------------------
   Il foglio che l'ospite presenta al desk: chi e', di che azienda,
   quando si tengono gli incontri e a quali tavoli si e' prenotato.
   Parte in allegato alla mail di conferma, e riparte uguale a ogni
   modifica della scelta (l'ultimo che arriva e' quello buono, e la
   data di emissione stampata in fondo lo dice).

   Perche' scritto a mano e non con una libreria: al servizio serve
   UNA pagina con del testo e qualche rettangolo. Una libreria di
   impaginazione porterebbe megabyte dentro una funzione che deve
   partire in fretta, per fare una cosa che qui sta in trecento
   righe e non ha sorprese. Il PDF prodotto e' un 1.4 minimo -
   catalogo, una pagina, un flusso di contenuto, i due font
   standard - che tutti i lettori aprono senza discutere.

   I font sono Helvetica e Helvetica-Bold, che ogni lettore ha per
   conto suo: cosi' non c'e' niente da incorporare. Sono codificati
   WinAnsi (Latin-1), quindi accenti e "à è é ì ò ù" passano; cio'
   che Latin-1 non ha (virgolette curve, trattini lunghi) viene
   ricondotto al carattere semplice piu' vicino prima di scrivere,
   perche' un carattere fuori tabella diventerebbe un segno a caso.
   ============================================================ */

const A4 = { larghezza: 595.28, altezza: 841.89 };
const LATO = 46;                       // margine sinistro e destro
const DENTRO = A4.larghezza - LATO * 2;
const C = {
    scuro: [0.039, 0.157, 0.267],      // #0A2844
    blu: [0.086, 0.251, 0.408],        // #164068
    accento: [0.165, 0.353, 0.522],    // #2A5A85
    chiaroBlu: [0.357, 0.537, 0.722],  // #5B89B8
    testo: [0.118, 0.161, 0.231],      // #1E293B
    tenue: [0.278, 0.333, 0.412],      // #475569
    bordo: [0.886, 0.906, 0.929],      // #E2E8F0
    chiaro: [0.957, 0.973, 0.984],     // #F4F8FB
    bianco: [1, 1, 1]
};

/* Da testo qualunque a testo scrivibile in Latin-1: i caratteri che la
   tabella non ha si sostituiscono invece di sparire o diventare segni a
   caso (le virgolette curve arrivano da Word e dai telefoni in continuazione). */
function inLatin1(s) {
    return String(s == null ? '' : s)
        .replace(/[‘’‛]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, '-')
        .replace(/[•]/g, '-')
        .replace(/…/g, '...')
        .replace(/ /g, ' ')
        .replace(/[\r\n\t]+/g, ' ')
        .split('')
        .map(c => (c.charCodeAt(0) <= 0xFF ? c : '?'))
        .join('');
}
// dentro una stringa PDF vanno protetti backslash e parentesi
function stringaPdf(s) {
    return '(' + inLatin1(s).replace(/([\\()])/g, '\\$1') + ')';
}
/* Larghezza di un testo, in punti. Non sono le tabelle esatte dei font
   Helvetica: sono le classi di larghezza che bastano per andare a capo
   dentro un margine largo. Meglio stimare qualche punto in piu' che in
   meno, cosi' una riga non esce mai dal foglio. */
function larghezza(testo, corpo) {
    let u = 0;
    inLatin1(testo).split('').forEach(c => {
        if ('iljt.,;:!|\'`()[]{} '.indexOf(c) >= 0) u += 0.30;
        else if ('fr/\\-'.indexOf(c) >= 0) u += 0.36;
        else if ('mw'.indexOf(c) >= 0) u += 0.86;
        else if ('MW'.indexOf(c) >= 0) u += 0.94;
        else if (c >= 'A' && c <= 'Z') u += 0.72;
        else u += 0.56;
    });
    return u * corpo;
}
// il testo spezzato in righe che stanno dentro `dentro` punti
function aCapo(testo, corpo, dentro) {
    const parole = inLatin1(testo).split(' ').filter(x => x !== '');
    const righe = [];
    let riga = '';
    parole.forEach(p => {
        const prova = riga ? riga + ' ' + p : p;
        if (riga && larghezza(prova, corpo) > dentro) { righe.push(riga); riga = p; }
        else riga = prova;
    });
    if (riga) righe.push(riga);
    return righe.length ? righe : [''];
}

/* Il foglio si scrive dall'alto verso il basso, ma il PDF conta le
   coordinate dal basso: `Foglio` tiene il conto di dove siamo arrivati
   e traduce, cosi' chi compone la pagina ragiona come su carta. */
function Foglio() {
    const pezzi = [];
    // `y` e' la distanza dal BORDO SUPERIORE: scendere la fa crescere.
    // La conversione nelle coordinate del PDF (che contano dal basso) la
    // fanno i metodi qui sotto, una volta sola.
    let y = 0;
    return {
        get y() { return y; },
        set y(v) { y = v; },
        scendi(d) { y += d; return y; },
        colore(c, tratto) { pezzi.push(c.map(n => n.toFixed(3)).join(' ') + (tratto ? ' RG' : ' rg')); },
        rettangolo(x, alto, largo, altezza, c) {
            this.colore(c);
            pezzi.push(x.toFixed(2) + ' ' + (A4.altezza - alto - altezza).toFixed(2) + ' '
                + largo.toFixed(2) + ' ' + altezza.toFixed(2) + ' re f');
        },
        linea(x1, alto, x2, c, spessore) {
            this.colore(c, true);
            pezzi.push((spessore || 1).toFixed(2) + ' w '
                + x1.toFixed(2) + ' ' + (A4.altezza - alto).toFixed(2) + ' m '
                + x2.toFixed(2) + ' ' + (A4.altezza - alto).toFixed(2) + ' l S');
        },
        /* Una riga di testo alla quota corrente (o a quella indicata).
           `spazio` fra le lettere serve agli occhielli maiuscoli. */
        testo(t, opz) {
            const o = opz || {};
            const corpo = o.corpo || 11;
            const font = o.grassetto ? '/F2' : '/F1';
            this.colore(o.colore || C.testo);
            pezzi.push('BT ' + font + ' ' + corpo + ' Tf'
                + (o.spazio ? ' ' + o.spazio + ' Tc' : ' 0 Tc')
                + ' ' + (o.x === undefined ? LATO : o.x).toFixed(2) + ' '
                + (A4.altezza - (o.alto === undefined ? y : o.alto)).toFixed(2) + ' Td '
                + stringaPdf(t) + ' Tj ET');
        },
        /* Un paragrafo che va a capo da solo e fa scendere la quota. */
        paragrafo(t, opz) {
            const o = opz || {};
            const corpo = o.corpo || 11;
            const passo = o.passo || Math.round(corpo * 1.45);
            const dentro = o.dentro || DENTRO;
            // `alto` non si eredita: le righe di un paragrafo stanno una sotto
            // l'altra, non tutte alla stessa quota
            const stile = Object.assign({}, o, { corpo: corpo, alto: undefined });
            aCapo(t, corpo, dentro).forEach(riga => {
                this.testo(riga, stile);
                this.scendi(passo);
            });
            return y;
        },
        contenuto() { return pezzi.join('\n'); }
    };
}

/* Il foglio, dall'alto in basso. Nel PDF chi scrive dopo copre chi ha
   scritto prima, quindi il fondo chiaro di un riquadro va disegnato PRIMA
   del testo che ci va dentro: per questo l'altezza dei riquadri si calcola
   mandando a capo il testo prima di stamparlo.
   `dati`: { nome, azienda, ruolo, evento: {titolo, quando, luogo, indirizzo},
   tavoli: [{nome, orario}], emessoIl }. Ogni tavolo porta il SUO orario: e'
   la riga per cui questo foglio esiste, perche' gli incontri non si tengono
   tutti insieme e chi si presenta all'ora sbagliata perde il suo. */
function contenutoPagina(dati) {
    const d = dati || {};
    const ev = d.evento || {};
    const f = Foglio();

    const altaTesta = 132;
    f.rettangolo(0, 0, A4.larghezza, altaTesta, C.scuro);
    f.testo('REVILAW', { alto: 44, corpo: 17, grassetto: true, colore: C.bianco, spazio: 2.2 });
    f.testo('Revisione legale', { alto: 60, corpo: 9, colore: C.chiaroBlu, spazio: 1.1 });
    f.testo('NEXT GENERATION BUSINESS', { alto: 92, corpo: 8.5, grassetto: true, colore: C.chiaroBlu, spazio: 1.6 });
    f.testo('Incontri B2B - la Sua prenotazione', { alto: 114, corpo: 20, grassetto: true, colore: C.bianco });

    f.y = altaTesta + 44;
    f.testo('PARTECIPANTE', { corpo: 8.5, grassetto: true, colore: C.accento, spazio: 1.4 });
    f.scendi(22);
    f.paragrafo(d.nome || 'Ospite', { corpo: 17, grassetto: true, colore: C.scuro, passo: 22 });
    const sotto = [d.azienda, d.ruolo].filter(Boolean).join(' - ');
    if (sotto) f.paragrafo(sotto, { corpo: 11.5, colore: C.tenue, passo: 17 });

    // --- riquadro "quando e dove" ---
    const ev1 = [ev.titolo, ev.quando].filter(Boolean).join(', ');
    const dove = [ev.luogo, ev.indirizzo].filter(Boolean).join(' - ');
    const righeBox = [];
    // il giorno ha una riga sua: ripeterlo anche accanto al nome del convegno
    // fa leggere due volte la stessa cosa e allunga il riquadro per niente
    if (ev.titolo) righeBox.push(['CONVEGNO', 'Next Generation Business - ' + ev.titolo]);
    else if (ev1) righeBox.push(['CONVEGNO', 'Next Generation Business - ' + ev1]);
    if (ev.quando) righeBox.push(['GIORNO', ev.quando]);
    if (dove) righeBox.push(['DOVE', dove]);
    if (righeBox.length) {
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
        f.y = cima + altezza + 34;
    }

    // --- i tavoli prenotati ---
    f.testo('I SUOI INCONTRI PRENOTATI', { corpo: 8.5, grassetto: true, colore: C.accento, spazio: 1.4 });
    f.scendi(10);
    f.linea(LATO, f.y, A4.larghezza - LATO, C.bordo, 1);
    f.scendi(20);
    /* I tavoli arrivano come oggetti {nome, orario}; si accettano anche
       stringhe, per non rompersi se un chiamante vecchio resta in giro. */
    const tavoli = (d.tavoli || []).filter(Boolean)
        .map(t => (typeof t === 'string' ? { nome: t, orario: '' } : { nome: String(t.nome || ''), orario: String(t.orario || '') }))
        .filter(t => t.nome);
    if (!tavoli.length) {
        f.paragrafo('Nessun incontro selezionato.', { corpo: 11, colore: C.tenue });
    } else {
        /* Il foglio e' UNA pagina e deve restarlo: con nove tavoli prenotati, il
           nome su una riga e l'orario sotto sfonderebbero il piede. Da sette in
           su si passa alla forma compatta - nome e orario sulla stessa riga,
           passo ridotto - che sta larga il doppio ma alta la meta'. */
        const stretti = tavoli.length > 6;
        tavoli.forEach(t => {
            const alto = f.y;
            f.rettangolo(LATO + 2, alto - 8, 7, 7, C.accento);
            let giu = 0;
            if (stretti) {
                const righe = aCapo(t.nome + (t.orario ? '  -  ' + t.orario : ''), 10.5, DENTRO - 24);
                righe.forEach((riga, i) => {
                    f.testo(riga, { alto: alto + i * 14, x: LATO + 24, corpo: 10.5, grassetto: true, colore: C.scuro });
                });
                giu = righe.length * 14;
            } else {
                const righe = aCapo(t.nome, 11.5, DENTRO - 24);
                righe.forEach((riga, i) => {
                    f.testo(riga, { alto: alto + i * 16, x: LATO + 24, corpo: 11.5, grassetto: true, colore: C.scuro });
                });
                giu = righe.length * 16;
                /* L'orario sotto il nome del tavolo, in blu: e' quello che si cerca
                   con l'occhio quando si e' in fila al desk. Va a capo come tutto
                   il resto - "dalle 14:30 alle 15:15, dopo il coffee break" e'
                   un orario che qualcuno scrivera' - invece di uscire dal margine. */
                if (t.orario) {
                    aCapo(t.orario, 11, DENTRO - 24).forEach((riga, i) => {
                        f.testo(riga, { alto: alto + giu + i * 15, x: LATO + 24, corpo: 11, grassetto: true, colore: C.blu });
                    });
                    giu += aCapo(t.orario, 11, DENTRO - 24).length * 15;
                }
            }
            f.scendi(giu + (stretti ? 6 : 10));
        });
    }

    /* --- l'avviso per il desk ---
       Sta sopra il piede, e sopra il piede ci deve STARE: con nove tavoli dagli
       orari lunghi lo spazio finisce, e un riquadro che sfora finirebbe stampato
       sopra l'indirizzo di Revilaw. Quindi si misura prima quanto ne resta e si
       lascia cadere quello che non entra, nell'ordine: la seconda frase (la
       stessa cosa la dice anche la mail), poi il riquadro intero. La prima frase
       - dove presentarsi - non si taglia mai: e' il motivo per cui questo foglio
       esiste, e se non ci sta e' l'elenco che va stretto, non l'avviso. */
    const altoPiede = A4.altezza - 66;
    f.scendi(14);
    const avviso1 = 'Presenti questo foglio, stampato o dal telefono, al desk "Incontri B2B" all\'ingresso.'
        + ' La aspettiamo a ciascun incontro nell\'orario indicato qui sopra.'
        + ' Gli specialisti a Sua disposizione Le saranno confermati sul posto.';
    const avviso2 = 'Può modificare la prenotazione quando vuole, dal collegamento personale che trova nella mail: '
        + 'riceve subito un foglio aggiornato. Vale sempre l\'ultimo emesso.';
    const largoAvviso = DENTRO - 36;
    // la versione minima, quando lo spazio e' finito: due righe, ma la cosa da
    // fare c'e' ancora
    const avvisoCorto = 'Presenti questo foglio al desk "Incontri B2B" all\'ingresso: '
        + 'la aspettiamo a ciascun incontro nell\'orario indicato qui sopra.';
    const alte = (testo, corpo) => 20 + aCapo(testo, corpo, largoAvviso).length * (corpo + 4.5) + 8;
    const cimaAvviso = f.y;
    const disponibile = altoPiede - 12 - cimaAvviso;
    const alteConDue = alte(avviso1, 10.5) + aCapo(avviso2, 10.5, largoAvviso).length * 15 + 6;
    let dueFrasi = false, testoAvviso = avvisoCorto, corpoAvviso = 9.5, alteAvviso = alte(avvisoCorto, 9.5);
    if (alteConDue <= disponibile) {
        dueFrasi = true; testoAvviso = avviso1; corpoAvviso = 10.5; alteAvviso = alteConDue;
    } else if (alte(avviso1, 10.5) <= disponibile) {
        testoAvviso = avviso1; corpoAvviso = 10.5; alteAvviso = alte(avviso1, 10.5);
    }
    if (alteAvviso <= disponibile) {
        f.rettangolo(LATO, cimaAvviso, DENTRO, alteAvviso, C.chiaro);
        f.rettangolo(LATO, cimaAvviso, DENTRO, 3, C.accento);
        f.y = cimaAvviso + 24;
        f.paragrafo(testoAvviso, { corpo: corpoAvviso, colore: C.testo, dentro: largoAvviso, x: LATO + 18, passo: corpoAvviso + 4.5 });
        if (dueFrasi) {
            f.scendi(4);
            f.paragrafo(avviso2, { corpo: 10.5, colore: C.tenue, dentro: largoAvviso, x: LATO + 18, passo: 15 });
        }
    }

    // --- piede ---
    f.linea(LATO, altoPiede, A4.larghezza - LATO, C.bordo, 1);
    f.testo('Revilaw S.p.A. - Via XX Settembre 9, 37129 Verona - C.F. 04641610235',
        { alto: altoPiede + 18, corpo: 8.5, colore: C.tenue });
    f.testo('Prenotazione emessa il ' + (d.emessoIl || '') + ' - nextgenerationbusiness.it',
        { alto: altoPiede + 31, corpo: 8.5, colore: C.tenue });

    return f.contenuto();
}

/* Il file vero e proprio: oggetti numerati, tavola degli scarti (xref) con
   la posizione IN BYTE di ognuno, coda. Si scrive in latin1, dove un
   carattere e' un byte: e' quello che rende gli scarti calcolabili
   contando i caratteri. */
function pdfPrenotazione(dati) {
    const flusso = contenutoPagina(dati);
    const titolo = 'Prenotazione incontri B2B - ' + inLatin1((dati && dati.nome) || '');
    const oggetti = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + A4.larghezza + ' ' + A4.altezza + ']'
        + ' /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
        '<< /Length ' + flusso.length + ' >>\nstream\n' + flusso + '\nendstream',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
        '<< /Title ' + stringaPdf(titolo) + ' /Producer (Revilaw - Next Generation Business) >>'
    ];
    let file = '%PDF-1.4\n%âãÏÓ\n';
    const scarti = [];
    oggetti.forEach((o, i) => {
        scarti.push(file.length);
        file += (i + 1) + ' 0 obj\n' + o + '\nendobj\n';
    });
    const inizioXref = file.length;
    file += 'xref\n0 ' + (oggetti.length + 1) + '\n0000000000 65535 f \n';
    scarti.forEach(s => { file += String(s).padStart(10, '0') + ' 00000 n \n'; });
    file += 'trailer\n<< /Size ' + (oggetti.length + 1) + ' /Root 1 0 R /Info '
        + oggetti.length + ' 0 R >>\nstartxref\n' + inizioXref + '\n%%EOF\n';
    return Buffer.from(file, 'latin1');
}

module.exports = { pdfPrenotazione, inLatin1 };
