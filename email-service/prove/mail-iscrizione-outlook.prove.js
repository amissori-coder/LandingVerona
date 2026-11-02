/* ============================================================
   PROVE - le mail dell'iscrizione in Outlook e dopo un inoltro
   ------------------------------------------------------------
       node prove/mail-iscrizione-outlook.prove.js

   Le mail dell'iscrizione (richiesta di conferma, invito,
   variazioni) con la grafica della pagina dell'evento devono
   leggersi uguali in ogni programma di posta, Outlook per Windows
   compreso, e restare intere quando la persona le INOLTRA.
   Outlook per Windows impagina con Word e inoltrando quasi tutti i
   programmi buttano il <style> dell'intestazione: quindi la grafica
   deve stare dentro gli elementi. Qui si verifica che:
     - nessun <div> di impaginazione (solo il testo d'anteprima nascosto);
     - ogni cella o tabella con un fondo lo dichiari anche con bgcolor;
     - la colonna da 600 regga in Outlook (tabella "fantasma");
     - Montserrat sia nascosto a Outlook, che altrimenti scrive in Times;
     - i pulsanti abbiano il padding anche per Outlook (mso-padding-alt);
     - senza il foglio di stile (come dopo un inoltro) titoli, fondi e
       testo abbiano ancora misure e colori scritti nell'elemento.
   Per tutti e due gli eventi con la grafica della pagina: Milano 2027
   (in sala) e il webinar del 10 dicembre 2026 (online), che hanno
   testata e piede diversi e nessun trattino lungo nei testi.
   ============================================================ */
'use strict';
const path = require('path');
const M = require(path.join(__dirname, '..', 'lib/mail-ngb.js'));

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
/* I due eventi con la grafica della pagina: per ciascuno il modulo, i
   dettagli, come si partecipa, e la riga dell'evento in testata e nel piede. */
const EVENTI = [
    {
        nome: 'Milano', pagina: 'Milano 26 Febbraio 2027 - Iscrizione', modalita: 'presenza',
        ev: { quando: 'Venerdì 26 febbraio 2027', orario: 'Dalle 8.30 alle 18.00', luogo: 'Excelsior Hotel Gallia', indirizzo: 'Piazza Duca d\'Aosta 9, 20124 Milano' },
        occhiello: 'Milano &middot; 26 febbraio 2027', piede: 'Milano &middot; 26 febbraio 2027 &middot; Excelsior Hotel Gallia'
    },
    {
        nome: 'Webinar', pagina: 'Webinar 10 Dicembre 2026 - Iscrizione', modalita: 'online',
        ev: { quando: 'Giovedì 10 dicembre 2026', orario: 'Dalle 15.00 alle 17.00', luogo: 'Online, in diretta sul sito', indirizzo: '' },
        occhiello: 'Webinar &middot; 10 dicembre 2026', piede: 'Webinar &middot; 10 dicembre 2026 &middot; Online, in diretta'
    }
];
const letterale = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const E of EVENTI) {
const PAGINA = E.pagina;
const ev = E.ev;
const mail = {
    'richiesta di conferma': M.confermaSito({ nome: 'Andrea', cognome: 'Missori', azienda: 'Revilaw', pagina: PAGINA, data: '17/10/2026 23:30', modalita: E.modalita }, 'https://x/m', 'https://x/c'),
    'invito': M.invitoIngresso({ nome: 'Andrea', cognome: 'Missori', azienda: 'Revilaw', pagina: PAGINA, evento: ev, modalita: E.modalita, agenda: { google: 'https://g', outlook: 'https://o' } }, 'https://x/m'),
    'iscrizione aggiornata': M.confermaVariazioni({ pagina: PAGINA, intestatario: 'Andrea Missori', attivi: [{ nome: 'Andrea', cognome: 'Missori' }], postiAttivi: 1, senzaNome: 0, annullati: 0 }, 'https://x/m')
};

for (const nome of Object.keys(mail)) {
    console.log('\n' + E.nome + ' - ' + nome);
    const html = mail[nome].html;
    const corpo = html.slice(html.indexOf('<body'));
    esigi(/Next Generation <span[^>]*>Business<\/span>/.test(html), 'ha la testata della pagina dell\'evento');
    esigi((corpo.match(/<div/g) || []).length === 1, 'nessun <div> di impaginazione (solo l\'anteprima nascosta)');
    const senzaBg = (corpo.match(/<(td|table)\b[^>]*background-color:[^>]*>/g) || []).filter(t => !/\bbgcolor="/.test(t));
    esigi(senzaBg.length === 0, 'ogni fondo e\' dichiarato anche con bgcolor', senzaBg[0]);
    esigi(/<!--\[if mso\]><table role="presentation" width="600"/.test(html), 'la colonna da 600 regge in Outlook');
    esigi(/<!--\[if !mso\]><!--><link href="https:\/\/fonts\.googleapis\.com[^"]*Montserrat/.test(html), 'Montserrat e\' nascosto a Outlook');
    esigi(/<!--\[if mso\]>[\s\S]*font-family:Arial[\s\S]*<!\[endif\]-->/.test(html), 'e a Outlook si impone Arial');
    const linkPadding = (html.match(/<a [^>]*padding:[^>]*>/g) || []).filter(a => !/mso-padding-alt/.test(a));
    esigi(linkPadding.length === 0, 'i pulsanti hanno il padding anche per Outlook', linkPadding[0]);
    // inoltro: senza <style>, le classi non valgono piu'
    const conClasse = (corpo.match(/<td[^>]*class="(h1|lead[^"]*|px)"[^>]*>/g) || []).filter(t => !/style="[^"]*(font-size|padding)/.test(t));
    esigi(conClasse.length === 0, 'senza foglio di stile le celle con classe hanno ancora misure proprie', conClasse[0]);
    esigi(/bgcolor="#08213A"/.test(corpo) && /color:#FFFFFF/.test(corpo), 'il blu notte e il bianco sono scritti negli elementi');
    esigi(mail[nome].testo && mail[nome].testo.length > 100, 'c\'e\' anche la versione senza formattazione');
    // niente testo sotto i 13px (le celle-filetto a 1px non sono testo)
    const misure = (corpo.replace(/<div style="display:none[^>]*>[\s\S]*?<\/div>/, '')
        .replace(/<td[^>]*mso-line-height-rule:exactly;font-size:1px;[^>]*>&nbsp;<\/td>/g, '')
        .match(/font-size:(\d+)px/g) || []).map(x => parseInt(x.replace(/\D/g, ''), 10));
    esigi(Math.min.apply(null, misure) >= 13, 'niente testo sotto i 13px', Array.from(new Set(misure)).sort((a, b) => a - b).join(' '));
    esigi(!/border-left:3px/.test(corpo), 'il riquadro non ha la barra laterale');
    // il piede: sotto il filetto un colore solo, e indirizzo e codice fiscale non diventano collegamenti
    const piede = corpo.slice(corpo.lastIndexOf('Next Generation Business</td></tr>'));
    const dopoFiletto = piede.slice(piede.indexOf('height="1"'));
    const colori = new Set((dopoFiletto.match(/[^-]color:(#[0-9A-Fa-f]{6})/g) || []).map(c => c.slice(-7).toUpperCase()));
    esigi(colori.size === 1, 'nel piede, sotto il filetto, un colore solo', Array.from(colori).join(' '));
    esigi(/046&#8203;416&#8203;102&#8203;35/.test(piede) && /371&#8203;29/.test(piede), 'indirizzo e codice fiscale non si trasformano in collegamenti');
    esigi(new RegExp(letterale(E.piede) + '<\\/td>').test(piede) && !/>color:/.test(piede), 'la riga dell\'evento e\' scritta giusta, senza stili a vista');
    esigi(html.indexOf(E.occhiello + '</td>') > 0 && html.indexOf(E.occhiello) < html.indexOf('Next Generation <span'), 'la testata porta l\'occhiello dell\'evento, sopra il titolo');
    esigi(!/[\u2012-\u2015]/.test(html + mail[nome].testo + mail[nome].oggetto), 'nessun trattino lungo nei testi');
    esigi(!/u \+ #corpo a|#MessageViewBody a/.test(html), 'nessuna regola ricolora TUTTI i collegamenti (il testo dei pulsanti resta bianco)');
    esigi((corpo.match(/<a [^>]*background-color:#164068[^>]*><span style="color:#ffffff/g) || []).length >= 1, 'il testo dei pulsanti e\' bianco anche nello span');
    esigi(!/copia questo indirizzo/.test(corpo), 'niente indirizzo lungo da copiare sotto il pulsante');
    esigi(/format-detection" content="telephone=no/.test(html) && /x-apple-data-detectors/.test(html), 'e il riconoscimento automatico e\' spento anche nell\'intestazione');
}
}

console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
