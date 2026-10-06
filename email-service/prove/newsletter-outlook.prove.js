/* ============================================================
   PROVE - la newsletter si legge uguale in TUTTI i lettori di posta
   ------------------------------------------------------------
       node prove/newsletter-outlook.prove.js

   Niente da installare: si costruisce una newsletter vera con il
   formato (area-riservata/newsletter-format.js) e si guarda l'HTML.

   COSA DIMOSTRANO. Le regole che rendono una mail sicura anche su
   Outlook per Windows, che impagina con il motore di Word, e che si
   rompono in silenzio: a video (Chrome, Gmail, Apple Mail) la mail
   resta perfetta, e ci si accorge del danno solo dalla casella di
   un cliente. Ogni regola qui sotto e' una cosa che e' gia'
   successa o che Word fa per certo:
     - un <ul> vero prende i rientri di Word e in qualche webmail
       perde il punto: gli elenchi sono tabelle;
     - padding e margin sui <div> Word li ignora: lo spazio si fa
       con il padding delle celle o con righe vuote;
     - con mso-line-height-rule:exactly, un'interlinea piu' bassa
       del corpo RITAGLIA i glifi: i numeri grandi perdevano la testa;
     - font-size:0 e line-height:0 Word non li onora: una barretta
       da 3px diventava alta quanto una riga di testo;
     - text-transform:uppercase Word non lo conosce: le etichette
       vanno scritte gia' maiuscole;
     - i pulsanti NON stanno in un commento condizionale ne' in VML:
       in inoltro Gmail e Outlook.com tolgono head, foglio di stile e
       commenti, e il pulsante spariva. Qui si simula l'inoltro e si
       guarda che resti tutto quello che conta.
   ============================================================ */
'use strict';
const path = require('path');
const NL = require(path.join(__dirname, '..', '..', 'area-riservata', 'newsletter-format.js'));

let ok = 0, ko = 0;
function esigi(cond, testo, extra) {
    if (cond) { ok++; console.log('  verde  ' + testo); }
    else { ko++; console.log('  ROSSO  ' + testo + (extra ? '   ' + extra : '')); }
}
function prova(nome, fn) {
    console.log('\n' + nome);
    try { fn(); }
    catch (e) { ko++; console.log('  ROSSO  eccezione: ' + (e && e.stack || e)); }
}
/* L'HTML senza il ramo di Outlook (i commenti condizionali) e senza il ramo
   "tutti gli altri": servono per contare i tag di ciascun ramo da solo. */
function senzaMso(h) {
    return h.replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g, '').replace(/<!--\[if !mso\]><!-- -->|<!--<!\[endif\]-->/g, '');
}
function soloMso(h) {
    return h.replace(/<!--\[if !mso\]><!-- -->[\s\S]*?<!--<!\[endif\]-->/g, '').replace(/<!--\[if mso\]>|<!\[endif\]-->/g, '');
}
function conta(h, tag) {
    const ap = (h.match(new RegExp('<' + tag.replace(':', '\\:') + '[\\s>]', 'g')) || []).length;
    const ch = (h.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    return { ap: ap, ch: ch };
}
/* Tutti gli stili in linea, uno per elemento, con il nome del tag. */
function stili(h) {
    const out = [];
    const re = /<([a-z][a-z0-9:]*)\b[^>]*?\sstyle="([^"]*)"/gi;
    let m;
    while ((m = re.exec(h)) !== null) out.push({ tag: m[1].toLowerCase(), stile: m[2], pezzo: m[0].slice(0, 120) });
    return out;
}
function px(stile, prop) {
    const m = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([0-9.]+)px', 'i').exec(stile);
    return m ? Number(m[1]) : null;
}

const BOZZA = {
    oggetto: 'Prova formato', preheader: 'Anteprima.', occhiello: 'Approfondimento',
    titolo: 'Titolo della newsletter', sommario: 'Il sommario della newsletter, che sta nella testata.',
    perche: {
        titolo: 'Perché riguarda la tua impresa',
        testo: 'Un attacco breve che apre il discorso e dice di che cosa si parla.\n\nUn secondo paragrafo con un **grassetto** e un [collegamento](https://esempio.it/pagina?a=1&b=2).\n\n- Prima voce dell\'elenco\n- Seconda voce dell\'elenco, un po\' piu\' lunga per andare a capo sulla colonna\n- Terza voce'
    },
    come: {
        titolo: 'Come funziona',
        testo: 'Quattro passaggi.\n\n- Lettura del bilancio\n- Colloqui con gli amministratori\n- Mappatura dei presidi\n- Relazione finale\n\nChiusura del come.'
    },
    cosa: {
        titolo: 'Che cosa fare adesso',
        testo: 'Entro fine anno.\n\n- Richiedi un colloquio\n- Scarica la lista di controllo'
    },
    cta: { testo: 'Prenota il colloquio', url: 'https://esempio.it/contatti' }
};
const BLOCCHI = {
    oggetto: 'Prova blocchi', titolo: 'Formato a blocchi', occhiello: 'Prova', sommario: 'Tutti i tipi di blocco.',
    blocchi: [
        { tipo: 'testo', titolo: 'Testo con elenchi', html: '<p>Un paragrafo.</p><ul><li>Prima voce <strong>forte</strong></li><li>Seconda con <a href="https://esempio.it">link</a><ul><li>annidata uno</li><li>annidata due</li></ul></li></ul><ol><li><p>Numerata uno</p></li><li>Numerata due</li></ol><p>Chiusura.</p>' },
        { tipo: 'evidenza', titolo: 'Scadenza', testo: 'Entro il **30 giugno**.' },
        { tipo: 'elenco', titolo: 'Documenti', voci: ['Bilancio', 'Centrale dei Rischi'] },
        { tipo: 'duo', titolo: 'Prima', testo: 'Testo prima.', titolo2: 'Seconda', testo2: 'Testo seconda.' },
        { tipo: 'numero', numero: '12', etichetta: 'classi di rating', testo: 'Dal modello MCC.' },
        { tipo: 'bottone', testo: 'Vai', url: 'https://esempio.it' },
        { tipo: 'separatore' },
        { tipo: 'spalla', titolo: 'Di fianco', testo: 'Testo di fianco.', src: 'https://esempio.it/img.png' }
    ],
    cta: { testo: 'Pulsante finale', url: 'https://esempio.it' }
};
const MAIL = { 'tre momenti': NL.costruisci(BOZZA, { anno: 2026 }), 'a blocchi': NL.costruisci(BLOCCHI, { anno: 2026 }) };

Object.keys(MAIL).forEach(nome => {
    const h = MAIL[nome].html, t = MAIL[nome].testo;

    prova('[' + nome + '] i due rami, Outlook e tutti gli altri, sono entrambi chiusi bene', () => {
        ['table', 'tr', 'td', 'div', 'a', 'p', 'center', 'v:roundrect'].forEach(tag => {
            const a = conta(senzaMso(h), tag), b = conta(soloMso(h), tag);
            esigi(a.ap === a.ch, 'ramo normale: <' + tag + '> ' + a.ap + ' aperti, ' + a.ch + ' chiusi');
            esigi(b.ap === b.ch, 'ramo Outlook: <' + tag + '> ' + b.ap + ' aperti, ' + b.ch + ' chiusi');
        });
    });

    prova('[' + nome + '] gli elenchi sono tabelle, non <ul>', () => {
        esigi(!/<(ul|ol|li)\b/i.test(h), 'nessun <ul>, <ol> o <li> nell\'HTML');
        esigi(/class="ls"/.test(h), 'c\'e\' almeno un elenco a tabella (class="ls")');
        esigi(/&bull;<\/td>/.test(h), 'il pallino sta in una cella sua');
    });

    prova('[' + nome + '] niente spazio affidato ai <div> (Word lo ignora)', () => {
        const divs = stili(h).filter(x => x.tag === 'div' && /(^|;)\s*(padding|margin)(-[a-z]+)?\s*:/i.test(x.stile));
        esigi(divs.length === 0, 'nessun <div> con padding o margin', divs.map(d => d.pezzo).join(' | '));
    });

    prova('[' + nome + '] l\'interlinea non e\' mai sotto il corpo (con "exactly" Outlook ritaglia)', () => {
        const male = stili(h).filter(x => /mso-line-height-rule:exactly/i.test(x.stile) && !/font-size:1px/i.test(x.stile))
            .map(x => ({ fs: px(x.stile, 'font-size'), lh: px(x.stile, 'line-height'), pezzo: x.pezzo }))
            .filter(x => x.fs != null && x.lh != null && x.lh < x.fs);
        esigi(male.length === 0, 'nessun elemento con line-height < font-size', male.map(x => x.fs + '/' + x.lh + ' ' + x.pezzo).join(' | '));
    });

    prova('[' + nome + '] le barrette sottili non usano font-size:0 su una cella', () => {
        const celle = stili(h).filter(x => x.tag === 'td' && /font-size:0;line-height:0/i.test(x.stile) && !/<img/i.test(x.pezzo));
        // la cella della fascia contiene un'immagine e non passa di qui: li' "exactly" la ritaglierebbe
        const senzaImg = celle.filter(c => !/copertina|<img/.test(c.pezzo));
        esigi(senzaImg.length <= 1, 'al piu\' la cella dell\'immagine di testata usa font-size:0', String(senzaImg.length));
        esigi(/font-size:1px;line-height:3px;height:3px/.test(h) || nome === 'tre momenti', 'le barrette da 3px usano la ricetta di stileVuoto');
    });

    prova('[' + nome + '] le etichette sono gia\' maiuscole nel testo', () => {
        const occ = /<td style="[^"]*letter-spacing:1\.8px[^"]*">([^<]*)<\/td>/.exec(h);
        esigi(!!occ && occ[1] === occ[1].toUpperCase(), 'l\'occhiello e\' scritto in maiuscolo', occ && occ[1]);
        esigi(/>PERCH&Eacute;<|>PERCHÉ</.test(h) || nome === 'a blocchi', 'l\'etichetta del momento e\' maiuscola');
    });

    prova('[' + nome + '] il pulsante e\' una cella con sfondo e un link dentro, senza VML', () => {
        esigi(!/<v:|<w:anchorlock/.test(h), 'niente VML');
        esigi(/<td align="center" bgcolor="#164068" style="background-color:#164068;padding:14px 30px;mso-padding-alt:14px 30px;text-align:center;"><a href="https:\/\/esempio\.it[^"]*" class="btnlink"/.test(h), 'cella con sfondo e imbottitura, link subito dentro');
        esigi(!/<a [^>]*mso-hide:all/.test(h), 'nessun link nascosto a Outlook');
    });

    prova('[' + nome + '] INOLTRATA: senza head, foglio di stile e commenti resta tutto quello che conta', () => {
        /* Quello che fanno Gmail, Outlook.com e Yahoo quando inoltrano. */
        const inoltrata = h.replace(/<head>[\s\S]*?<\/head>/i, '').replace(/<!--[\s\S]*?-->/g, '');
        esigi(!/<style|<!--/.test(inoltrata), 'simulazione: niente stile ne\' commenti');
        ['table', 'tr', 'td', 'div', 'a', 'p'].forEach(tag => {
            const a = conta(inoltrata, tag);
            esigi(a.ap === a.ch, '<' + tag + '> ' + a.ap + ' aperti, ' + a.ch + ' chiusi');
        });
        esigi(/class="btnlink"[^>]*>[^<]*<span[^>]*>(Prenota il colloquio|Pulsante finale)<\/span><\/a>/.test(inoltrata), 'il pulsante finale c\'e\' ancora, con il suo testo');
        esigi(/bgcolor="#0A2844"/.test(inoltrata) && /bgcolor="#F1F5F9"/.test(inoltrata), 'gli sfondi stanno negli attributi, non solo nel foglio di stile');
        esigi(/max-width:600px/.test(inoltrata), 'la larghezza della colonna sta in linea');
        esigi(/<img [^>]*width="150" height="46"/.test(inoltrata), 'il marchio ha le misure negli attributi');
        esigi(/display:none;font-size:1px/.test(inoltrata), 'l\'anteprima resta nascosta con lo stile in linea');
        esigi(!/mso-hide:all;">[^<]*<\/a>/.test(inoltrata), 'nessun collegamento che Outlook nasconderebbe');
    });

    prova('[' + nome + '] involucro', () => {
        esigi(/<body lang="it" bgcolor="#F1F5F9"/.test(h), 'il body porta lo sfondo anche come attributo');
        esigi(/<!--\[if mso\]><style type="text\/css">table,td,th,div,p,a,span\{font-family:Arial/.test(h), 'foglio di stile per il solo Outlook (niente Times nelle celle vuote)');
        esigi(/#MessageViewBody a\{color:inherit/.test(h), 'regola per i collegamenti automatici di Samsung');
        esigi(/\.rw\{padding-top:0!important;\}/.test(h), 'sul telefono le righe di schede non raddoppiano lo stacco');
        esigi(/<o:PixelsPerInch>96<\/o:PixelsPerInch>/.test(h), 'rimedio alla scala DPI di Outlook');
        esigi(h.indexOf('{{DISISCRIVITI}}') > 0, 'c\'e\' il segnaposto della disiscrizione');
        esigi(Buffer.byteLength(h) < 100 * 1024, 'sotto i 100 KB (Gmail taglia a 102)', String(Buffer.byteLength(h)));
    });

    prova('[' + nome + '] il testo semplice', () => {
        esigi(!/­/.test(t), 'nessun trattino morbido nel testo semplice');
        esigi(/\n- /.test(t), 'le voci di elenco cominciano a capo');
        esigi(!/\)- /.test(t), 'un elenco annidato non si incolla alla voce che lo contiene');
    });
});

prova('la cella delle schede affiancate ha la classe per il telefono', () => {
    const h = MAIL['tre momenti'].html;
    esigi(/<td class="rw" style="padding:16px 0 0 0;">/.test(h), 'la seconda riga di schede porta class="rw"');
    esigi(/<td style="padding:6px 0 0 0;">/.test(h), 'la prima riga no');
});

console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
