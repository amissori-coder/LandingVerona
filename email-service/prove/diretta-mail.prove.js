/* ============================================================
   PROVE - le email della diretta (lib/diretta-mail.js)
   ------------------------------------------------------------
       node prove/diretta-mail.prove.js

   Niente da installare. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Che le quattro email (credenziali, «sei iscritto
   anche a», promemoria, reimpostazione) hanno sempre la versione HTML e
   quella in solo testo; che si entra con l'EMAIL: le credenziali dicono
   «Per entrare nella diretta: vai su <indirizzo>, scrivi la tua email
   <email> e questa password: <password>», con la password in carattere
   a spaziatura fissa, e da nessuna parte compare un "nome utente"; che
   in ognuna c'e' «Non trovi l'email? Controlla nella cartella Spam o
   Promozioni e segna il mittente come sicuro.»; che c'e' il pulsante
   "Accedi alla diretta" con il collegamento /diretta/?e=evento (mai
   l'email nel collegamento); che ci sono la pagina dell'evento, la
   home, titolo, data, ora (con "(ora italiana)") e l'assistenza; il
   piede con l'informativa privacy; che non c'e' mai un trattino lungo;
   che un nome o un titolo con < > & " ' arriva scritto e non eseguito,
   e un a capo non entra nell'oggetto; che il promemoria e l'avviso
   «anche» non contengono MAI la password, nemmeno se qualcuno gliela
   passa, ma portano a "Password dimenticata?"; che il promemoria dice
   "domani" o "oggi" guardando l'ora vera; che chi aveva gia' una
   password legge che non vale piu'; che l'email di prova si riconosce
   come prova; che i collegamenti non si possono dirottare.
   ============================================================ */
'use strict';
delete process.env.APP_BASE_URL;
delete process.env.DIRETTA_ASSISTENZA_EMAIL;
delete process.env.DIRETTA_ASSISTENZA_TELEFONO;
const M = require('../lib/diretta-mail');
const C = require('../lib/diretta-comune');

let rossi = 0, verdi = 0;
function vero(cond, descrizione) {
    if (cond) verdi++;
    else { rossi++; console.log('ROSSO  ' + descrizione); }
}

const SITO = 'https://nextgenerationbusiness.it';
const PRIVACY = 'https://www.iubenda.com/privacy-policy/40996386';
const EMAIL = 'mario.rossi@esempio.it';
// il collegamento, com'e' nell'HTML e nel testo
const ACCEDI_HTML = 'href="' + SITO + '/diretta/?e=napoli-2026"';
const ACCEDI_TESTO = SITO + '/diretta/?e=napoli-2026';
const FRASE_SPAM = 'Non trovi l\'email? Controlla nella cartella Spam o Promozioni e segna il mittente come sicuro.';
const EVENTO = {
    id: 'napoli-2026',
    titolo: 'Next Generation Business 2026 · Napoli',
    luogo: 'Napoli · Hotel Eurostars Excelsior',
    data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30',
    inizio: C.istanteRoma('2026-10-02', '09:00'),
    fine: C.istanteRoma('2026-10-02', '17:30'),
    paginaEvento: '/napoli_ottobre_2026/'
};
// lo stesso evento come arriva da Firestore: Timestamp con toMillis()
const EVENTO_FIRESTORE = Object.assign({}, EVENTO, {
    inizio: { toMillis: () => EVENTO.inizio },
    fine: { toMillis: () => EVENTO.fine }
});
const ASSISTENZA = { email: 'info@nextgenerationbusiness.it', telefono: '045 1234567' };

/* Il valore sta dentro un elemento il cui stile dice "monospace"?
   Si cerca l'apertura di tag piu' vicina prima del valore. */
function inMonospace(html, valore) {
    let i = html.indexOf('>' + valore + '<');
    let trovato = false;
    while (i >= 0) {
        const apertura = html.lastIndexOf('<', i);
        if (/monospace/.test(html.slice(apertura, i))) { trovato = true; break; }
        i = html.indexOf('>' + valore + '<', i + 1);
    }
    return trovato;
}
// l'apostrofo nell'HTML e' scritto &#39; (esc tratta anche ')
const comeHtml = t => t.replace(/'/g, '&#39;');
const TRATTINI_LUNGHI = /[‒–—―]|&[mn]dash;|&#(8210|8211|8212|8213);/i;
function comuni(nome, m) {
    vero(m && typeof m.oggetto === 'string' && m.oggetto.length > 10, nome + ': ha un oggetto');
    vero(/^<!DOCTYPE html/i.test(m.html) && /<\/html>\s*$/.test(m.html), nome + ': HTML completo');
    vero(typeof m.testo === 'string' && m.testo.length > 200 && !/<[a-z][^>]*>/i.test(m.testo), nome + ': versione in solo testo, senza tag');
    vero(!TRATTINI_LUNGHI.test(m.oggetto + m.html + m.testo), nome + ': nessun trattino lungo');
    vero(!/[\r\n]/.test(m.oggetto), nome + ': oggetto su una riga sola');
    vero(m.html.indexOf(SITO + '/assets/logo-revilaw-bianco.png') >= 0, nome + ': testata con il logo bianco');
    vero(/Revilaw S\.p\.A\./.test(m.html) && /C\.F\. 04641610235/.test(m.html) && /Via XX Settembre 9/.test(m.html), nome + ': piede con Revilaw S.p.A.');
    vero(/Revilaw S\.p\.A\./.test(m.testo), nome + ': firma anche nel testo');
    vero(m.html.indexOf('info@nextgenerationbusiness.it') >= 0 && m.testo.indexOf('info@nextgenerationbusiness.it') >= 0, nome + ': contatto dell\'assistenza');
    vero(m.html.indexOf('045 1234567') >= 0 && m.testo.indexOf('045 1234567') >= 0, nome + ': telefono dell\'assistenza');
    vero(!/undefined|NaN|\[object Object\]|null/.test(m.oggetto + m.html + m.testo), nome + ': niente "undefined", "NaN" o "null"');
    vero(m.html.indexOf('href="' + PRIVACY + '"') > m.html.indexOf('Revilaw S.p.A.') && />Informativa privacy<\/a>/.test(m.html), nome + ': piede con il collegamento all\'informativa privacy');
    vero(m.testo.indexOf('Informativa privacy: ' + PRIVACY) >= 0, nome + ': informativa privacy anche nel testo');
    // ogni & dentro un href e' scritto &amp; (un & nudo e' HTML non valido, e certi programmi di posta lo rovinano)
    vero(!/href="[^"]*&(?!amp;|#)/.test(m.html), nome + ': nei collegamenti ogni & e\' scritto &amp;');
    // si entra con l'email: nessun "nome utente" da nessuna parte, e nessun ?u= nei collegamenti
    vero(!/nome utente|nomeutente|username/i.test(m.oggetto + m.html + m.testo), nome + ': nessun "nome utente"');
    vero(!/[?&](amp;)?u=/.test(m.html + m.testo), nome + ': nessun parametro ?u= nei collegamenti');
    vero(m.testo.indexOf(FRASE_SPAM) >= 0 && m.html.indexOf(comeHtml(FRASE_SPAM)) >= 0, nome + ': «' + FRASE_SPAM + '» in HTML e testo');
}

/* ---------- le credenziali ---------- */
const cred = M.credenziali({
    evento: EVENTO_FIRESTORE, nome: 'Mario', cognome: 'Rossi', email: EMAIL, password: 'Esempio7Kq',
    paginaEvento: '/napoli_ottobre_2026/', assistenza: ASSISTENZA
});
comuni('credenziali', cred);
const FRASE_ENTRA = 'Per entrare nella diretta: vai su ' + SITO + '/diretta/, scrivi la tua email ' + EMAIL + ' e questa password: Esempio7Kq';
vero(cred.testo.indexOf(FRASE_ENTRA) >= 0, 'credenziali: «' + FRASE_ENTRA + '» nel testo');
vero(/Per entrare nella diretta: vai su <a href="https:\/\/nextgenerationbusiness\.it\/diretta\/"[^>]*>https:\/\/nextgenerationbusiness\.it\/diretta\/<\/a>, scrivi la tua email <strong[^>]*>mario\.rossi@esempio\.it<\/strong> e questa password: <span style="font-family:'Courier New', Courier, monospace;[^"]*">Esempio7Kq<\/span>/.test(cred.html),
    'credenziali: la stessa frase nell\'HTML, con l\'indirizzo cliccabile, l\'email in evidenza e la password a spaziatura fissa');
vero(inMonospace(cred.html, 'Esempio7Kq'), 'credenziali: password in carattere a spaziatura fissa (anche nel riquadro)');
vero(/Courier New/.test(cred.html) && /letter-spacing:3px/.test(cred.html), 'credenziali: Courier New con le lettere spaziate');
vero(/>La tua email</.test(cred.html) && />Password</.test(cred.html) && cred.html.indexOf('>' + EMAIL + '</td>') >= 0, 'credenziali: riquadro con «La tua email» e «Password»');
vero(/La tua email: mario\.rossi@esempio\.it\nPassword: Esempio7Kq/.test(cred.testo), 'credenziali: email e password anche nel testo semplice');
vero(/>Accedi alla diretta<\/a>/.test(cred.html), 'credenziali: pulsante "Accedi alla diretta"');
vero(cred.html.indexOf(ACCEDI_HTML) >= 0, 'credenziali: il pulsante porta a /diretta/?e=napoli-2026');
vero(cred.testo.indexOf('Accedi alla diretta: ' + ACCEDI_TESTO) >= 0, 'credenziali: il collegamento con ?e= anche nel testo');
vero((cred.html + cred.testo).indexOf('?e=napoli-2026&') < 0 && !/diretta\/\?[^"\s]*@/.test(cred.html + cred.testo), 'credenziali: l\'email non entra in nessun collegamento');
vero(cred.html.indexOf('href="' + SITO + '/napoli_ottobre_2026/"') >= 0 && cred.testo.indexOf(SITO + '/napoli_ottobre_2026/') >= 0, 'credenziali: pagina dell\'evento (collegamento assoluto)');
vero(cred.html.indexOf('href="' + SITO + '/"') >= 0 && /home del sito/.test(cred.html) && /home del sito/.test(cred.testo), 'credenziali: home del sito');
vero(cred.html.indexOf('Next Generation Business 2026 · Napoli') >= 0 && cred.oggetto.indexOf('Next Generation Business 2026 · Napoli') >= 0, 'credenziali: titolo dell\'evento (e nell\'oggetto)');
vero(/venerdì 2 ottobre 2026/.test(cred.html) && /venerdì 2 ottobre 2026/.test(cred.testo), 'credenziali: la data scritta per esteso');
vero(/dalle 9\.00 alle 17\.30 \(ora italiana\)<\/td>/.test(cred.html) && /Quando: venerdì 2 ottobre 2026, dalle 9\.00 alle 17\.30 \(ora italiana\)/.test(cred.testo),
    'credenziali: "(ora italiana)" accanto all\'orario, nel riquadro e nel testo (R24)');
vero(/venerdì 2 ottobre 2026 dalle 9\.00 \(ora italiana\)/.test(cred.testo), 'credenziali: "(ora italiana)" anche nella frase d\'apertura');
vero(/Se non riesci a entrare/.test(cred.html) && /Password dimenticata\?/.test(cred.html) && /maiuscole e minuscole/.test(cred.html) && /altro browser/.test(cred.html), 'credenziali: "Se non riesci a entrare" con i consigli');
vero(/Scrivi l&#39;email con cui ti sei iscritto/.test(cred.html) && /Scrivi l'email con cui ti sei iscritto/.test(cred.testo), 'credenziali: il primo consiglio parla dell\'email');
vero(/Gentile Mario Rossi/.test(cred.html), 'credenziali: saluto con nome e cognome');
vero(!/EMAIL DI PROVA/.test(cred.html + cred.testo) && !/\[PROVA\]/.test(cred.oggetto), 'credenziali vere: nessuna scritta di prova');
vero(!/sostituisce le precedenti|altro evento/.test(cred.html + cred.testo), 'credenziali al primo invio: nessuna nota "sostituisce"');
vero(/<meta http-equiv="Content-Type" content="text\/html; charset=UTF-8"/.test(cred.html), 'credenziali: codifica UTF-8 dichiarata');

// stesso risultato con l'evento in millisecondi o in Timestamp
const credMs = M.credenziali({ evento: EVENTO, nome: 'Mario', cognome: 'Rossi', email: EMAIL, password: 'Esempio7Kq', paginaEvento: '/napoli_ottobre_2026/', assistenza: ASSISTENZA });
vero(credMs.testo === cred.testo, 'credenziali: evento in millisecondi o Timestamp danno la stessa email');
vero(credMs.testo.indexOf(ACCEDI_TESTO) >= 0, 'credenziali: l\'evento del collegamento si prende anche da evento.id');
// e con i soli campi di testo (data e ore), come se gli istanti mancassero
const credTesto = M.credenziali({ evento: { titolo: EVENTO.titolo, data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30' }, email: EMAIL, password: 'X', assistenza: ASSISTENZA });
vero(/venerdì 2 ottobre 2026/.test(credTesto.testo) && /dalle 9\.00 alle 17\.30/.test(credTesto.testo), 'credenziali: data e ore ricavate anche da data/oraInizio/oraFine');
vero(credTesto.testo.indexOf('Accedi alla diretta: ' + SITO + '/diretta/\n') >= 0, 'credenziali senza evento noto: collegamento a /diretta/ (niente ?e= vuoto)');
// l'email arriva gia' normalizzata dal servizio; qui resta su una riga, minuscola
vero(M.credenziali({ evento: EVENTO, email: '  Mario.Rossi@Esempio.IT\n', password: 'X', assistenza: ASSISTENZA }).testo.indexOf('scrivi la tua email mario.rossi@esempio.it e questa') >= 0,
    'credenziali: l\'email si scrive minuscola e senza spazi');

/* ---------- chi aveva gia' una password (D14) ---------- */
const FRASE_D14 = 'Questa email sostituisce le precedenti: la password che avevi ricevuto prima non è più valida.';
const credSost = M.credenziali({ evento: EVENTO, nome: 'Mario', cognome: 'Rossi', email: EMAIL, password: 'Nuova8Wxy2', assistenza: ASSISTENZA, sostituisce: 'evento' });
vero(credSost.html.indexOf(FRASE_D14) >= 0 && credSost.testo.indexOf(FRASE_D14) >= 0, 'reinvio per lo stesso evento: "' + FRASE_D14 + '" in HTML e testo');
vero(credSost.html.indexOf(FRASE_D14) < credSost.html.indexOf('>La tua email<') && credSost.testo.indexOf(FRASE_D14) < credSost.testo.indexOf('La tua email:'),
    'reinvio: la nota sta PRIMA delle credenziali (si legge subito)');
vero(M.credenziali({ evento: EVENTO, email: EMAIL, password: 'X', assistenza: ASSISTENZA, sostituisce: true }).testo.indexOf(FRASE_D14) >= 0, 'reinvio: sostituisce: true vale come lo stesso evento');
const credAltro = M.credenziali({ evento: EVENTO, nome: 'Mario', email: EMAIL, password: 'Nuova8Wxy2', assistenza: ASSISTENZA, sostituisce: 'altro-evento' });
vero(credAltro.testo.indexOf(FRASE_D14) < 0 && /Avevi già ricevuto le credenziali per un altro evento: l'email per entrare è la stessa/.test(credAltro.testo)
    && /per un altro evento/.test(credAltro.html), 'credenziali dopo quelle di un altro evento (Reinvia del gestore): nota propria (stessa email, password nuova)');

/* ---------- l'email di prova ---------- */
const prova = M.credenziali({ evento: EVENTO, nome: 'Mario', cognome: 'Rossi', email: EMAIL, password: 'Esempio7Kq', assistenza: ASSISTENZA, prova: true });
comuni('credenziali di prova', prova);
vero(/^\[PROVA\] /.test(prova.oggetto), 'prova: l\'oggetto comincia con [PROVA]');
vero(/EMAIL DI PROVA/.test(prova.html) && /EMAIL DI PROVA/.test(prova.testo), 'prova: "EMAIL DI PROVA" in HTML e testo');
vero(prova.html.indexOf('EMAIL DI PROVA') < prova.html.indexOf('Le tue credenziali per la diretta</td>'), 'prova: la scritta sta in testa, prima della testata');
vero(/Nome, email e password qui sotto sono di esempio e non funzionano/.test(prova.html), 'prova: dice che nome, email e password sono di esempio');
const provaProm = M.promemoria({ tipo: 'giorno', evento: EVENTO, nome: 'Mario', email: EMAIL, assistenza: ASSISTENZA, prova: true, adesso: EVENTO.inizio - 24 * 3600e3 });
vero(/^\[PROVA\] /.test(provaProm.oggetto) && /EMAIL DI PROVA/.test(provaProm.html), 'prova: anche il promemoria di prova e\' marcato');
const provaAnche = M.iscrittoAnche({ evento: EVENTO, nome: 'Mario', email: EMAIL, assistenza: ASSISTENZA, prova: true });
vero(/^\[PROVA\] Sei iscritto anche a /.test(provaAnche.oggetto) && /EMAIL DI PROVA/.test(provaAnche.html) && /Nome ed email qui sotto sono di esempio/.test(provaAnche.testo),
    'prova: anche l\'avviso «anche» di prova e\' marcato (senza parlare di password)');

/* ---------- sei iscritto anche a ---------- */
const PASSWORD_SEGRETA = 'Segreta9Kz';
const anche = M.iscrittoAnche({
    evento: EVENTO_FIRESTORE, nome: 'Mario', cognome: 'Rossi', email: EMAIL, password: PASSWORD_SEGRETA,
    paginaEvento: '/napoli_ottobre_2026/', assistenza: ASSISTENZA
});
comuni('iscritto anche', anche);
const FRASE_ANCHE = 'Sei iscritto anche a Next Generation Business 2026 · Napoli: entra con la tua email e la password che hai già; se non la ricordi usa "Password dimenticata?"';
vero(anche.testo.indexOf(FRASE_ANCHE) >= 0, 'iscritto anche: «' + FRASE_ANCHE + '» nel testo');
vero(anche.html.indexOf(comeHtml('Sei iscritto anche a Next Generation Business 2026 · Napoli: entra con la tua email e la password che hai già; se non la ricordi usa ')
    + '"<a href="' + SITO + '/diretta/?dimenticata=1"') >= 0 && />Password dimenticata\?<\/a>"/.test(anche.html), 'iscritto anche: la stessa frase nell\'HTML, con "Password dimenticata?" cliccabile');
vero(/^Sei iscritto anche a Next Generation Business 2026 · Napoli$/.test(anche.oggetto), 'iscritto anche: oggetto «Sei iscritto anche a <evento>»');
vero((anche.oggetto + anche.html + anche.testo).indexOf(PASSWORD_SEGRETA) < 0 && !/Password:\s*\S/.test(anche.testo) && !/>Password</.test(anche.html),
    'iscritto anche: la password NON c\'e\', nemmeno se passata (nessun campo "Password")');
vero(anche.html.indexOf('>' + EMAIL + '</td>') >= 0 && /La tua email: mario\.rossi@esempio\.it/.test(anche.testo), 'iscritto anche: l\'email con cui entrare (HTML e testo)');
vero(anche.html.indexOf(ACCEDI_HTML) >= 0 && anche.testo.indexOf('Accedi alla diretta: ' + ACCEDI_TESTO) >= 0, 'iscritto anche: pulsante con il collegamento ?e=');
vero(/non ne arriva una nuova/.test(anche.testo) && /venerdì 2 ottobre 2026/.test(anche.testo), 'iscritto anche: dice che la password resta quella, con data e ora');

/* ---------- i promemoria ---------- */
const promGiorno = M.promemoria({
    tipo: 'giorno', evento: EVENTO_FIRESTORE, nome: 'Mario', cognome: 'Rossi', email: EMAIL,
    paginaEvento: '/napoli_ottobre_2026/', assistenza: ASSISTENZA,
    password: PASSWORD_SEGRETA, adesso: C.istanteRoma('2026-10-01', '10:00')
});
comuni('promemoria del giorno prima', promGiorno);
const promOra = M.promemoria({
    tipo: 'ora', evento: EVENTO, nome: 'Mario', cognome: 'Rossi', email: EMAIL,
    paginaEvento: '/napoli_ottobre_2026/', assistenza: ASSISTENZA, password: PASSWORD_SEGRETA,
    adesso: C.istanteRoma('2026-10-02', '08:05')
});
comuni('promemoria dell\'ora prima', promOra);
[['giorno', promGiorno], ['ora', promOra]].forEach(([t, m]) => {
    const tutto = m.oggetto + m.html + m.testo;
    vero(tutto.indexOf(PASSWORD_SEGRETA) < 0, 'promemoria ' + t + ': la password NON c\'e\', nemmeno se passata');
    vero(!/Password:\s*\S/.test(m.testo) && !/>Password</.test(m.html), 'promemoria ' + t + ': nessun campo "Password"');
    vero(m.html.indexOf('>' + EMAIL + '</td>') >= 0 && /La tua email: mario\.rossi@esempio\.it/.test(m.testo), 'promemoria ' + t + ': l\'email con cui entrare c\'e\' (HTML e testo)');
    vero(m.html.indexOf(ACCEDI_HTML) >= 0 && />Accedi alla diretta<\/a>/.test(m.html) && m.testo.indexOf('Accedi alla diretta: ' + ACCEDI_TESTO) >= 0, 'promemoria ' + t + ': pulsante con il collegamento ?e=');
    vero(m.html.indexOf(SITO + '/napoli_ottobre_2026/') >= 0 && m.html.indexOf('href="' + SITO + '/"') >= 0, 'promemoria ' + t + ': pagina dell\'evento e home');
    vero(/venerdì 2 ottobre 2026/.test(m.testo) && /9\.00/.test(m.testo), 'promemoria ' + t + ': data e ora');
    vero(/Password dimenticata\?/.test(m.html), 'promemoria ' + t + ': come recuperare la password');
    // R12: la frase e il collegamento diretto alla vista "Password dimenticata?"
    const dimenticata = SITO + '/diretta/?dimenticata=1';
    vero(m.html.indexOf('Non trovi la password? Usa <a href="' + dimenticata + '"') >= 0
        && /«Password dimenticata\?»<\/a> nella pagina di accesso/.test(m.html), 'promemoria ' + t + ': "Non trovi la password? Usa «Password dimenticata?» nella pagina di accesso" con il collegamento');
    vero(m.testo.indexOf('Non trovi la password? Usa «Password dimenticata?» nella pagina di accesso: ' + dimenticata) >= 0, 'promemoria ' + t + ': la stessa frase, con il collegamento, nel testo');
    vero(/\(ora italiana\)/.test(m.testo) && /\(ora italiana\)/.test(m.html), 'promemoria ' + t + ': "(ora italiana)" accanto agli orari');
});
vero(/^Domani la diretta - /.test(promGiorno.oggetto) && /domani alle 9\.00 \(ora italiana\) comincia la diretta/.test(promGiorno.testo), 'promemoria del giorno prima: "domani alle 9.00 (ora italiana)"');
const promGiornoTardi = M.promemoria({ tipo: 'giorno', evento: EVENTO, nome: 'Mario', email: EMAIL, assistenza: ASSISTENZA, adesso: C.istanteRoma('2026-10-02', '07:00') });
vero(/^Oggi in diretta - /.test(promGiornoTardi.oggetto) && /oggi alle 9\.00 \(ora italiana\)/.test(promGiornoTardi.testo) && !/domani/.test(promGiornoTardi.testo),
    'promemoria del giorno prima partito la mattina stessa: dice "oggi alle 9.00", non "domani"');
// il giorno si conta sul calendario di Roma, non a ore
const promMezzanotte = M.promemoria({ tipo: 'giorno', evento: EVENTO, nome: 'Mario', email: EMAIL, assistenza: ASSISTENZA, adesso: C.istanteRoma('2026-10-01', '23:50') });
vero(/domani alle 9\.00/.test(promMezzanotte.testo), 'promemoria partito alle 23.50 della sera prima (9 ore prima): "domani"');
const promDopoMezzanotte = M.promemoria({ tipo: 'giorno', evento: EVENTO, nome: 'Mario', email: EMAIL, assistenza: ASSISTENZA, adesso: C.istanteRoma('2026-10-02', '00:10') });
vero(/oggi alle 9\.00/.test(promDopoMezzanotte.testo) && /^Oggi in diretta/.test(promDopoMezzanotte.oggetto), 'promemoria partito alle 0.10 dello stesso giorno: "oggi"');
const promPresto = M.promemoria({ tipo: 'giorno', evento: EVENTO, nome: 'Mario', email: EMAIL, assistenza: ASSISTENZA, adesso: C.istanteRoma('2026-09-30', '09:00') });
vero(/venerdì 2 ottobre 2026 alle 9\.00 \(ora italiana\)/.test(promPresto.testo) && !/domani|oggi alle/.test(promPresto.testo) && /^Promemoria della diretta - /.test(promPresto.oggetto),
    'promemoria partito due giorni prima: la data per esteso, niente "domani"');
// a cavallo del ritorno all'ora solare (25 ottobre 2026): sempre un giorno solo
const EV_OTTOBRE = { titolo: 'Evento di prova', data: '2026-10-25', oraInizio: '09:00', oraFine: '12:00', inizio: C.istanteRoma('2026-10-25', '09:00'), fine: C.istanteRoma('2026-10-25', '12:00') };
vero(/domani alle 9\.00/.test(M.promemoria({ tipo: 'giorno', evento: EV_OTTOBRE, email: 'x@y.it', adesso: C.istanteRoma('2026-10-24', '09:30') }).testo)
    && M.giorniFra(C.istanteRoma('2026-10-24', '23:59'), C.istanteRoma('2026-10-25', '00:01')) === 1
    && M.giorniFra(C.istanteRoma('2026-03-28', '12:00'), C.istanteRoma('2026-03-29', '12:00')) === 1, 'giorni di calendario giusti anche nei giorni del cambio d\'ora');
vero(/^Tra poco in diretta - /.test(promOra.oggetto) && /comincia oggi alle 9\.00 \(ora italiana\)/.test(promOra.testo), 'promemoria dell\'ora prima: "tra poco", "oggi alle 9.00 (ora italiana)"');
const promOraTardi = M.promemoria({ tipo: 'ora', evento: EVENTO, nome: 'Mario', email: EMAIL, assistenza: ASSISTENZA, adesso: C.istanteRoma('2026-10-02', '09:20') });
vero(/^In diretta adesso - /.test(promOraTardi.oggetto) && /è in onda/.test(promOraTardi.testo), 'promemoria partito a diretta iniziata: "è in onda"');

/* ---------- la reimpostazione ---------- */
const LINK_RESET = SITO + '/diretta/reimposta.html?oobCode=AbC123_-x';
const reset = M.reimpostazione({ nome: 'Mario Rossi', email: EMAIL, link: LINK_RESET, assistenza: ASSISTENZA });
comuni('reimpostazione', reset);
vero(reset.html.indexOf('href="' + LINK_RESET + '"') >= 0 && reset.testo.indexOf(LINK_RESET) >= 0, 'reimpostazione: il collegamento (HTML e testo)');
vero(reset.html.indexOf('>' + EMAIL + '</td>') >= 0 && /La tua email: mario\.rossi@esempio\.it/.test(reset.testo), 'reimpostazione: ricorda l\'email con cui si entra');
vero(/con la tua email e la password nuova/.test(reset.testo), 'reimpostazione: dice che poi si entra con l\'email e la password nuova');
vero(/vale un&#39;ora e si può usare una volta sola/.test(reset.html) && /vale un'ora e si può usare una volta sola/.test(reset.testo), 'reimpostazione: "vale un\'ora e si può usare una volta sola"');
vero(/ignora questa email/.test(reset.testo), 'reimpostazione: se non l\'hai chiesta tu, ignora');
const resetSenza = M.reimpostazione({ nome: 'Mario', link: LINK_RESET, assistenza: ASSISTENZA });
vero(!/La tua email/.test(resetSenza.testo) && !/>Per entrare, la tua email</.test(resetSenza.html), 'reimpostazione senza email: niente riquadro vuoto');
const resetGestore = M.reimpostazione({ perGestore: true, email: 'gestore@prova.it', link: SITO + '/diretta/reimposta.html?oobCode=Zz9&per=gestione', assistenza: ASSISTENZA });
comuni('reimpostazione del gestore', resetGestore);
vero(/gestione della diretta/.test(resetGestore.oggetto) && !/La tua email/.test(resetGestore.html) && /Imposta la password/.test(resetGestore.html), 'gestore: accesso alla gestione, senza il riquadro dei partecipanti');
vero(/tra i gestori/.test(resetGestore.html), 'gestore: il piede dice perché la riceve');
let rifiutato = false;
try { M.reimpostazione({ nome: 'X', link: 'https://sito-cattivo.example/diretta/reimposta.html?oobCode=1' }); } catch (_) { rifiutato = true; }
vero(rifiutato, 'reimpostazione: un collegamento fuori dal sito viene rifiutato');
rifiutato = false;
try { M.reimpostazione({ nome: 'X', link: SITO + '/diretta/reimposta.html?oobCode=1" onclick="x' }); } catch (_) { rifiutato = true; }
vero(rifiutato, 'reimpostazione: un collegamento con apici o spazi viene rifiutato');

/* ---------- l'escape di tutto quello che arriva da fuori ---------- */
const CATTIVO = {
    titolo: '<script>alert(1)</script> & "Convegno" \'speciale\'\r\nBcc: tutti@esempio.it',
    nome: 'Anna <b>', cognome: 'D\'Angelo "&" <img src=x onerror=alert(1)>',
    luogo: '<iframe src="x">'
};
const evCattivo = Object.assign({}, EVENTO, { titolo: CATTIVO.titolo, luogo: CATTIVO.luogo });
const tutte = [
    ['credenziali', M.credenziali({ evento: evCattivo, nome: CATTIVO.nome, cognome: CATTIVO.cognome, email: 'anna@esempio.it', password: 'Esempio7Kq', assistenza: ASSISTENZA })],
    ['iscritto anche', M.iscrittoAnche({ evento: evCattivo, nome: CATTIVO.nome, cognome: CATTIVO.cognome, email: 'anna@esempio.it', assistenza: ASSISTENZA })],
    ['promemoria', M.promemoria({ tipo: 'ora', evento: evCattivo, nome: CATTIVO.nome, cognome: CATTIVO.cognome, email: 'anna@esempio.it', assistenza: ASSISTENZA })],
    ['reimpostazione', M.reimpostazione({ nome: CATTIVO.nome, cognome: CATTIVO.cognome, email: 'anna@esempio.it', link: LINK_RESET, assistenza: ASSISTENZA })]
];
tutte.forEach(([n, m]) => {
    // (le uniche <img> ammesse sono il logo e la fascia, con i loro indirizzi fissi)
    vero(!/<script|<b>|<img src=x|<iframe/i.test(m.html) && (m.html.match(/<img /g) || []).length === 2, n + ': nessun tag arrivato dai dati (script, b, img, iframe)');
    vero(/&lt;/.test(m.html), n + ': i caratteri speciali arrivano scritti (&lt;)');
    vero(!/[\r\n]/.test(m.oggetto) && !/\nBcc:/i.test(m.oggetto), n + ': nessun a capo (e nessun Bcc) nell\'oggetto');
});
const credCattiva = tutte[0][1];
vero(credCattiva.html.indexOf('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Convegno&quot; &#39;speciale&#39;') >= 0, 'escape completo di < > & " \' nel titolo');
vero(credCattiva.html.indexOf('Anna &lt;b&gt; D&#39;Angelo &quot;&amp;&quot; &lt;img src=x onerror=alert(1)&gt;') >= 0, 'escape completo nel nome e cognome');
vero(credCattiva.testo.indexOf('<script>alert(1)</script>') >= 0, 'nel testo semplice il titolo resta com\'era (non e\' HTML)');
const emailCattiva = M.credenziali({ evento: EVENTO, email: 'a"><script>@x.it', password: 'X', assistenza: ASSISTENZA });
vero(!/<script/.test(emailCattiva.html) && /a&quot;&gt;&lt;script&gt;@x\.it/.test(emailCattiva.html), 'un\'email strana arriva scritta, non eseguita');

/* ---------- i collegamenti non si dirottano ---------- */
const dirottata = M.credenziali({
    evento: EVENTO, nome: 'Mario', email: EMAIL, password: 'Esempio7Kq', assistenza: ASSISTENZA,
    link: 'https://phishing.example/diretta/', paginaEvento: 'javascript:alert(1)'
});
vero(dirottata.html.indexOf('phishing.example') < 0 && dirottata.html.indexOf(ACCEDI_HTML) >= 0, 'un collegamento di accesso estraneo viene ignorato e rifatto dall\'evento');
// l'evento entra nel collegamento solo se ha la forma giusta
const idStrani = ['napoli-2026&u=altro', '../x', 'Napoli-2026', 'a"><b'].map(id => M.credenziali({ evento: EVENTO, idEvento: id, email: EMAIL, password: 'X', assistenza: ASSISTENZA }));
vero(idStrani.every(m => m.html.indexOf('href="' + SITO + '/diretta/"') >= 0 && m.testo.indexOf('Accedi alla diretta: ' + SITO + '/diretta/\n') >= 0 && !/<b>|<b\s|a"><b/.test(m.html)),
    'un identificativo dell\'evento non valido non entra nel collegamento (resta /diretta/)');
vero(M.linkAccesso('roma-2026') === SITO + '/diretta/?e=roma-2026' && M.linkAccesso('') === SITO + '/diretta/', 'linkAccesso: /diretta/?e=evento (e /diretta/ senza evento)');
vero(M.linkDimenticata() === SITO + '/diretta/?dimenticata=1', 'linkDimenticata: la vista "Password dimenticata?" (senza email nel collegamento)');
vero(dirottata.html.indexOf('javascript:') < 0 && !/pagina dell'evento/.test(dirottata.html) && /home del sito/.test(dirottata.html), 'una pagina dell\'evento non valida non compare (resta la home)');
vero(M.linkPaginaEvento('/napoli_ottobre_2026/') === SITO + '/napoli_ottobre_2026/' && M.linkPaginaEvento('//evil.example/') === '', 'pagina dell\'evento: forma /cartella/ (e niente //host)');
vero(M.linkPaginaEvento('https://evil.example/') === '' && M.linkPaginaEvento('/pagina"x/') === '' && M.linkPaginaEvento('/Maiuscole/') === '', 'pagina dell\'evento: indirizzi esterni, apici e maiuscole rifiutati');
const assistenzaCattiva = M.credenziali({ evento: EVENTO, email: EMAIL, password: 'y', assistenza: { email: '"><script>@x.it', telefono: '<b>123</b>' } });
vero(!/<script|<b>123/.test(assistenzaCattiva.html) && assistenzaCattiva.html.indexOf('info@nextgenerationbusiness.it') >= 0, 'un contatto di assistenza non valido torna quello predefinito');

/* ---------- l'indirizzo del sito da APP_BASE_URL (le prove locali) ---------- */
process.env.APP_BASE_URL = 'http://127.0.0.1:8090/';
const locale = M.credenziali({ evento: EVENTO, email: EMAIL, password: 'Esempio7Kq', paginaEvento: '/napoli_ottobre_2026/', assistenza: ASSISTENZA });
vero(locale.html.indexOf('href="http://127.0.0.1:8090/diretta/?e=napoli-2026"') >= 0, 'con APP_BASE_URL i collegamenti puntano a quel sito');
vero(locale.testo.indexOf('vai su http://127.0.0.1:8090/diretta/, scrivi la tua email') >= 0, '...anche nella frase «vai su ...»');
vero(locale.html.indexOf(SITO + '/assets/logo-revilaw-bianco.png') >= 0, '...ma le immagini restano quelle del sito pubblico');
delete process.env.APP_BASE_URL;

console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
process.exit(rossi ? 1 : 0);
