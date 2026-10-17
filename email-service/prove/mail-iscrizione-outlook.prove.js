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
   ============================================================ */
'use strict';
const path = require('path');
const M = require(path.join(__dirname, '..', 'lib/mail-ngb.js'));

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
const PAGINA = 'Milano 26 Febbraio 2027 - Iscrizione';
const ev = { quando: 'Venerdì 26 febbraio 2027', orario: 'Dalle 8.30 alle 18.00', luogo: 'Excelsior Hotel Gallia', indirizzo: 'Piazza Duca d\'Aosta 9, 20124 Milano' };
const mail = {
    'richiesta di conferma': M.confermaSito({ nome: 'Andrea', cognome: 'Missori', azienda: 'Revilaw', pagina: PAGINA, data: '17/10/2026 23:30', modalita: 'presenza' }, 'https://x/m', 'https://x/c'),
    'invito': M.invitoIngresso({ nome: 'Andrea', cognome: 'Missori', azienda: 'Revilaw', pagina: PAGINA, evento: ev, modalita: 'presenza', agenda: { google: 'https://g', outlook: 'https://o' } }, 'https://x/m'),
    'iscrizione aggiornata': M.confermaVariazioni({ pagina: PAGINA, intestatario: 'Andrea Missori', attivi: [{ nome: 'Andrea', cognome: 'Missori' }], postiAttivi: 1, senzaNome: 0, annullati: 0 }, 'https://x/m')
};

for (const nome of Object.keys(mail)) {
    console.log('\n' + nome);
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
}

console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
