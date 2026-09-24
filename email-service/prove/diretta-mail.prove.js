/* ============================================================
   PROVE - le email della diretta (lib/diretta-mail.js)
   ------------------------------------------------------------
       node prove/diretta-mail.prove.js

   Niente da installare. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Che le tre email (credenziali, promemoria,
   reimpostazione) hanno sempre la versione HTML e quella in solo
   testo; che nome utente e password stanno in carattere a spaziatura
   fissa nell'HTML e per esteso nel testo; che c'e' il pulsante
   "Accedi alla diretta" con il collegamento /diretta/?u=nome&e=evento;
   che ci sono la pagina dell'evento, la home, titolo, data, ora (con
   "(ora italiana)") e l'assistenza; il piede con l'informativa
   privacy; che non c'e' mai un trattino lungo; che un nome o un
   titolo con < > & " ' arriva scritto e non eseguito, e un a capo non
   entra nell'oggetto; che il promemoria non contiene MAI la password,
   nemmeno se qualcuno gliela passa, ma porta a "Password
   dimenticata?"; che dice "domani" o "oggi" guardando l'ora vera; che
   un nome utente con il numero in fondo viene segnalato; che chi aveva
   gia' una password legge che non vale piu'; che l'email di prova si
   riconosce come prova; che i collegamenti non si possono dirottare.
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
// il collegamento personale, com'e' nell'HTML (& scritto &amp;) e nel testo
const ACCEDI_HTML = 'href="' + SITO + '/diretta/?u=mariorossi&amp;e=napoli-2026"';
const ACCEDI_TESTO = SITO + '/diretta/?u=mariorossi&e=napoli-2026';
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
const TRATTINI_LUNGHI = /[\u2012\u2013\u2014\u2015]|&[mn]dash;|&#(8210|8211|8212|8213);/i;
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
}

/* ---------- le credenziali ---------- */
const cred = M.credenziali({
    evento: EVENTO_FIRESTORE, nome: 'Mario', cognome: 'Rossi', nomeUtente: 'mariorossi', password: 'Esempio7Kq',
    paginaEvento: '/napoli_ottobre_2026/', assistenza: ASSISTENZA
});
comuni('credenziali', cred);
vero(inMonospace(cred.html, 'mariorossi'), 'credenziali: nome utente in carattere a spaziatura fissa');
vero(inMonospace(cred.html, 'Esempio7Kq'), 'credenziali: password in carattere a spaziatura fissa');
vero(/Courier New/.test(cred.html) && /letter-spacing:3px/.test(cred.html), 'credenziali: Courier New con le lettere spaziate');
vero(/Nome utente: mariorossi/.test(cred.testo) && /Password: Esempio7Kq/.test(cred.testo), 'credenziali: nome utente e password nel testo semplice');
vero(/>Accedi alla diretta<\/a>/.test(cred.html), 'credenziali: pulsante "Accedi alla diretta"');
vero(cred.html.indexOf(ACCEDI_HTML) >= 0 && />Accedi alla diretta<\/a>/.test(cred.html), 'credenziali: il pulsante porta a /diretta/?u=mariorossi&e=napoli-2026 (R4)');
vero(cred.testo.indexOf('Accedi alla diretta: ' + ACCEDI_TESTO) >= 0, 'credenziali: il collegamento con &e= anche nel testo');
vero(cred.html.indexOf('href="' + SITO + '/napoli_ottobre_2026/"') >= 0 && cred.testo.indexOf(SITO + '/napoli_ottobre_2026/') >= 0, 'credenziali: pagina dell\'evento (collegamento assoluto)');
vero(cred.html.indexOf('href="' + SITO + '/"') >= 0 && /home del sito/.test(cred.html) && /home del sito/.test(cred.testo), 'credenziali: home del sito');
vero(cred.html.indexOf('Next Generation Business 2026 · Napoli') >= 0 && cred.oggetto.indexOf('Next Generation Business 2026 · Napoli') >= 0, 'credenziali: titolo dell\'evento (e nell\'oggetto)');
vero(/venerdì 2 ottobre 2026/.test(cred.html) && /venerdì 2 ottobre 2026/.test(cred.testo), 'credenziali: la data scritta per esteso');
vero(/dalle 9\.00 alle 17\.30/.test(cred.html) && /dalle 9\.00 alle 17\.30/.test(cred.testo), 'credenziali: l\'orario');
vero(/dalle 9\.00 alle 17\.30 \(ora italiana\)<\/td>/.test(cred.html) && /Quando: venerdì 2 ottobre 2026, dalle 9\.00 alle 17\.30 \(ora italiana\)/.test(cred.testo),
    'credenziali: "(ora italiana)" accanto all\'orario, nel riquadro e nel testo (R24)');
vero(/venerdì 2 ottobre 2026 dalle 9\.00 \(ora italiana\)\./.test(cred.testo), 'credenziali: "(ora italiana)" anche nella frase d\'apertura');
vero(/Se non riesci a entrare/.test(cred.html) && /Password dimenticata\?/.test(cred.html) && /maiuscole e minuscole/.test(cred.html) && /altro browser/.test(cred.html), 'credenziali: "Se non riesci a entrare" con i consigli');
vero(/Se non riesci a entrare/.test(cred.testo) && /Password dimenticata\?/.test(cred.testo), 'credenziali: i consigli anche nel testo');
vero(/Gentile Mario Rossi/.test(cred.html), 'credenziali: saluto con nome e cognome');
vero(!/EMAIL DI PROVA/.test(cred.html + cred.testo) && !/\[PROVA\]/.test(cred.oggetto), 'credenziali vere: nessuna scritta di prova');
vero(!/sostituisce le precedenti|altro evento/.test(cred.html + cred.testo), 'credenziali al primo invio: nessuna nota "sostituisce"');
vero(!/finisce con il numero/.test(cred.html + cred.testo), 'nome utente senza numero in fondo: nessun avviso sul numero');
vero(/<meta http-equiv="Content-Type" content="text\/html; charset=UTF-8"/.test(cred.html), 'credenziali: codifica UTF-8 dichiarata');

// stesso risultato con l'evento in millisecondi o in Timestamp
const credMs = M.credenziali({ evento: EVENTO, nome: 'Mario', cognome: 'Rossi', nomeUtente: 'mariorossi', password: 'Esempio7Kq', paginaEvento: '/napoli_ottobre_2026/', assistenza: ASSISTENZA });
vero(credMs.testo === cred.testo, 'credenziali: evento in millisecondi o Timestamp danno la stessa email');
vero(credMs.testo.indexOf(ACCEDI_TESTO) >= 0, 'credenziali: l\'evento del collegamento si prende anche da evento.id');
// e con i soli campi di testo (data e ore), come se gli istanti mancassero
const credTesto = M.credenziali({ evento: { titolo: EVENTO.titolo, data: '2026-10-02', oraInizio: '09:00', oraFine: '17:30' }, nomeUtente: 'mariorossi', password: 'X', assistenza: ASSISTENZA });
vero(/venerdì 2 ottobre 2026/.test(credTesto.testo) && /dalle 9\.00 alle 17\.30/.test(credTesto.testo), 'credenziali: data e ore ricavate anche da data/oraInizio/oraFine');
vero(credTesto.testo.indexOf('Accedi alla diretta: ' + SITO + '/diretta/?u=mariorossi\n') >= 0, 'credenziali senza evento noto: collegamento con il solo ?u= (niente &e= vuoto)');

/* ---------- chi aveva gia' una password (D14) ---------- */
const FRASE_D14 = 'Questa email sostituisce le precedenti: la password che avevi ricevuto prima non è più valida.';
const credSost = M.credenziali({ evento: EVENTO, nome: 'Mario', cognome: 'Rossi', nomeUtente: 'mariorossi', password: 'Nuova8Wxy2', assistenza: ASSISTENZA, sostituisce: 'evento' });
vero(credSost.html.indexOf(FRASE_D14) >= 0 && credSost.testo.indexOf(FRASE_D14) >= 0, 'reinvio per lo stesso evento: "' + FRASE_D14 + '" in HTML e testo');
vero(credSost.html.indexOf(FRASE_D14) < credSost.html.indexOf('>Nome utente<') && credSost.testo.indexOf(FRASE_D14) < credSost.testo.indexOf('Nome utente:'),
    'reinvio: la nota sta PRIMA delle credenziali (si legge subito)');
vero(M.credenziali({ evento: EVENTO, nomeUtente: 'mariorossi', password: 'X', assistenza: ASSISTENZA, sostituisce: true }).testo.indexOf(FRASE_D14) >= 0, 'reinvio: sostituisce: true vale come lo stesso evento');
const credAltro = M.credenziali({ evento: EVENTO, nome: 'Mario', nomeUtente: 'mariorossi', password: 'Nuova8Wxy2', assistenza: ASSISTENZA, sostituisce: 'altro-evento' });
vero(credAltro.testo.indexOf(FRASE_D14) < 0 && /Avevi già ricevuto le credenziali per un altro evento: il nome utente è lo stesso/.test(credAltro.testo)
    && /per un altro evento/.test(credAltro.html), 'credenziali dopo quelle di un altro evento: nota propria (stesso nome utente, password nuova)');

/* ---------- il nome utente con il numero in fondo (R5) ---------- */
const credNum = M.credenziali({ evento: EVENTO, nome: 'Mario', cognome: 'Rossi', nomeUtente: 'mariorossi2', password: 'Esempio7Kq', assistenza: ASSISTENZA });
comuni('credenziali (omonimo)', credNum);
vero(/Attenzione: il tuo nome utente finisce con il numero 2\./.test(credNum.html) && /Attenzione: il tuo nome utente finisce con il numero 2\./.test(credNum.testo),
    'omonimo: "Attenzione: il tuo nome utente finisce con il numero 2." in HTML e testo');
vero(credNum.testo.indexOf('Password: Esempio7Kq\n\nAttenzione: il tuo nome utente') >= 0, 'omonimo: l\'avviso sta subito sotto le credenziali');
vero(/finisce con il numero 12\./.test(M.credenziali({ evento: EVENTO, nomeUtente: 'annaverdi12', password: 'X', assistenza: ASSISTENZA }).testo), 'omonimo: il numero intero (12), non solo l\'ultima cifra');
vero(M.fraseNumero('mariorossi') === '' && M.fraseNumero('') === '' && /numero 3\./.test(M.fraseNumero('mariorossi3')), 'fraseNumero: solo con un numero in fondo');

/* ---------- l'email di prova ---------- */
const prova = M.credenziali({ evento: EVENTO, nome: 'Mario', cognome: 'Rossi', nomeUtente: 'mariorossi', password: 'Esempio7Kq', assistenza: ASSISTENZA, prova: true });
comuni('credenziali di prova', prova);
vero(/^\[PROVA\] /.test(prova.oggetto), 'prova: l\'oggetto comincia con [PROVA]');
vero(/EMAIL DI PROVA/.test(prova.html) && /EMAIL DI PROVA/.test(prova.testo), 'prova: "EMAIL DI PROVA" in HTML e testo');
vero(prova.html.indexOf('EMAIL DI PROVA') < prova.html.indexOf('Le tue credenziali per la diretta</td>'), 'prova: la scritta sta in testa, prima della testata');
vero(/di esempio e non funzionano/.test(prova.html), 'prova: dice che i dati sono di esempio');
const provaProm = M.promemoria({ tipo: 'giorno', evento: EVENTO, nome: 'Mario', nomeUtente: 'mariorossi', assistenza: ASSISTENZA, prova: true, adesso: EVENTO.inizio - 24 * 3600e3 });
vero(/^\[PROVA\] /.test(provaProm.oggetto) && /EMAIL DI PROVA/.test(provaProm.html), 'prova: anche il promemoria di prova e\' marcato');

/* ---------- i promemoria ---------- */
const PASSWORD_SEGRETA = 'Segreta9Kz';
const promGiorno = M.promemoria({
    tipo: 'giorno', evento: EVENTO_FIRESTORE, nome: 'Mario', cognome: 'Rossi', nomeUtente: 'mariorossi',
    paginaEvento: '/napoli_ottobre_2026/', assistenza: ASSISTENZA,
    password: PASSWORD_SEGRETA, adesso: C.istanteRoma('2026-10-01', '10:00')
});
comuni('promemoria del giorno prima', promGiorno);
const promOra = M.promemoria({
    tipo: 'ora', evento: EVENTO, nome: 'Mario', cognome: 'Rossi', nomeUtente: 'mariorossi',
    paginaEvento: '/napoli_ottobre_2026/', assistenza: ASSISTENZA, password: PASSWORD_SEGRETA,
    adesso: C.istanteRoma('2026-10-02', '08:05')
});
comuni('promemoria dell\'ora prima', promOra);
[['giorno', promGiorno], ['ora', promOra]].forEach(([t, m]) => {
    const tutto = m.oggetto + m.html + m.testo;
    vero(tutto.indexOf(PASSWORD_SEGRETA) < 0, 'promemoria ' + t + ': la password NON c\'e\', nemmeno se passata');
    vero(!/Password:\s*\S/.test(m.testo) && !/>Password</.test(m.html), 'promemoria ' + t + ': nessun campo "Password"');
    vero(inMonospace(m.html, 'mariorossi') && /Nome utente: mariorossi/.test(m.testo), 'promemoria ' + t + ': il nome utente c\'e\' (spaziatura fissa e testo)');
    vero(m.html.indexOf(ACCEDI_HTML) >= 0 && />Accedi alla diretta<\/a>/.test(m.html) && m.testo.indexOf('Accedi alla diretta: ' + ACCEDI_TESTO) >= 0, 'promemoria ' + t + ': pulsante con il collegamento ?u=&e=');
    vero(m.html.indexOf(SITO + '/napoli_ottobre_2026/') >= 0 && m.html.indexOf('href="' + SITO + '/"') >= 0, 'promemoria ' + t + ': pagina dell\'evento e home');
    vero(/venerdì 2 ottobre 2026/.test(m.testo) && /9\.00/.test(m.testo), 'promemoria ' + t + ': data e ora');
    vero(/Password dimenticata\?/.test(m.html), 'promemoria ' + t + ': come recuperare la password');
    // R12: la frase e il collegamento diretto alla vista "Password dimenticata?" con il nome utente gia' scritto
    const dimenticata = SITO + '/diretta/?u=mariorossi&dimenticata=1';
    vero(m.html.indexOf('Non trovi la password? Usa <a href="' + dimenticata.replace(/&/g, '&amp;') + '"') >= 0
        && /«Password dimenticata\?»<\/a> nella pagina di accesso/.test(m.html), 'promemoria ' + t + ': "Non trovi la password? Usa «Password dimenticata?» nella pagina di accesso" con il collegamento');
    vero(m.testo.indexOf('Non trovi la password? Usa «Password dimenticata?» nella pagina di accesso: ' + dimenticata) >= 0, 'promemoria ' + t + ': la stessa frase, con il collegamento, nel testo');
    vero(/\(ora italiana\)/.test(m.testo) && /\(ora italiana\)/.test(m.html), 'promemoria ' + t + ': "(ora italiana)" accanto agli orari');
});
vero(/^Domani la diretta - /.test(promGiorno.oggetto) && /domani alle 9\.00 \(ora italiana\) comincia la diretta/.test(promGiorno.testo), 'promemoria del giorno prima: "domani alle 9.00 (ora italiana)"');
const promGiornoTardi = M.promemoria({ tipo: 'giorno', evento: EVENTO, nome: 'Mario', nomeUtente: 'mariorossi', assistenza: ASSISTENZA, adesso: C.istanteRoma('2026-10-02', '07:00') });
vero(/^Oggi in diretta - /.test(promGiornoTardi.oggetto) && /oggi alle 9\.00 \(ora italiana\)/.test(promGiornoTardi.testo) && !/domani/.test(promGiornoTardi.testo),
    'promemoria del giorno prima partito la mattina stessa: dice "oggi alle 9.00", non "domani"');
// il giorno si conta sul calendario di Roma, non a ore
const promMezzanotte = M.promemoria({ tipo: 'giorno', evento: EVENTO, nome: 'Mario', nomeUtente: 'mariorossi', assistenza: ASSISTENZA, adesso: C.istanteRoma('2026-10-01', '23:50') });
vero(/domani alle 9\.00/.test(promMezzanotte.testo), 'promemoria partito alle 23.50 della sera prima (9 ore prima): "domani"');
const promDopoMezzanotte = M.promemoria({ tipo: 'giorno', evento: EVENTO, nome: 'Mario', nomeUtente: 'mariorossi', assistenza: ASSISTENZA, adesso: C.istanteRoma('2026-10-02', '00:10') });
vero(/oggi alle 9\.00/.test(promDopoMezzanotte.testo) && /^Oggi in diretta/.test(promDopoMezzanotte.oggetto), 'promemoria partito alle 0.10 dello stesso giorno: "oggi"');
const promPresto = M.promemoria({ tipo: 'giorno', evento: EVENTO, nome: 'Mario', nomeUtente: 'mariorossi', assistenza: ASSISTENZA, adesso: C.istanteRoma('2026-09-30', '09:00') });
vero(/venerdì 2 ottobre 2026 alle 9\.00 \(ora italiana\)/.test(promPresto.testo) && !/domani|oggi alle/.test(promPresto.testo) && /^Promemoria della diretta - /.test(promPresto.oggetto),
    'promemoria partito due giorni prima: la data per esteso, niente "domani"');
// a cavallo del ritorno all'ora solare (25 ottobre 2026): sempre un giorno solo
const EV_OTTOBRE = { titolo: 'Evento di prova', data: '2026-10-25', oraInizio: '09:00', oraFine: '12:00', inizio: C.istanteRoma('2026-10-25', '09:00'), fine: C.istanteRoma('2026-10-25', '12:00') };
vero(/domani alle 9\.00/.test(M.promemoria({ tipo: 'giorno', evento: EV_OTTOBRE, nomeUtente: 'x', adesso: C.istanteRoma('2026-10-24', '09:30') }).testo)
    && M.giorniFra(C.istanteRoma('2026-10-24', '23:59'), C.istanteRoma('2026-10-25', '00:01')) === 1
    && M.giorniFra(C.istanteRoma('2026-03-28', '12:00'), C.istanteRoma('2026-03-29', '12:00')) === 1, 'giorni di calendario giusti anche nei giorni del cambio d\'ora');
vero(/^Tra poco in diretta - /.test(promOra.oggetto) && /comincia oggi alle 9\.00 \(ora italiana\)/.test(promOra.testo), 'promemoria dell\'ora prima: "tra poco", "oggi alle 9.00 (ora italiana)"');
const promNum = M.promemoria({ tipo: 'ora', evento: EVENTO, nome: 'Mario', nomeUtente: 'mariorossi2', assistenza: ASSISTENZA, adesso: C.istanteRoma('2026-10-02', '08:05') });
vero(/finisce con il numero 2\./.test(promNum.html) && /finisce con il numero 2\./.test(promNum.testo), 'promemoria di un omonimo: anche qui l\'avviso sul numero');
const promOraTardi = M.promemoria({ tipo: 'ora', evento: EVENTO, nome: 'Mario', nomeUtente: 'mariorossi', assistenza: ASSISTENZA, adesso: C.istanteRoma('2026-10-02', '09:20') });
vero(/^In diretta adesso - /.test(promOraTardi.oggetto) && /è in onda/.test(promOraTardi.testo), 'promemoria partito a diretta iniziata: "è in onda"');

/* ---------- la reimpostazione ---------- */
const LINK_RESET = SITO + '/diretta/reimposta.html?oobCode=AbC123_-x&u=mariorossi';
const reset = M.reimpostazione({ nome: 'Mario Rossi', nomeUtente: 'mariorossi', link: LINK_RESET, assistenza: ASSISTENZA });
comuni('reimpostazione', reset);
vero(reset.html.indexOf('href="' + LINK_RESET.replace(/&/g, '&amp;') + '"') >= 0 && reset.testo.indexOf(LINK_RESET) >= 0, 'reimpostazione: il collegamento (HTML con &amp;, testo intero)');
vero(inMonospace(reset.html, 'mariorossi') && /Nome utente: mariorossi/.test(reset.testo), 'reimpostazione: ricorda il nome utente');
// nell'HTML l'apostrofo e' scritto come &#39; (esc tratta anche ')
vero(/vale un&#39;ora e si può usare una volta sola/.test(reset.html) && /vale un'ora e si può usare una volta sola/.test(reset.testo), 'reimpostazione: "vale un\'ora e si può usare una volta sola"');
vero(/ignora questa email/.test(reset.testo), 'reimpostazione: se non l\'hai chiesta tu, ignora');
vero(!/finisce con il numero/.test(reset.testo) && /finisce con il numero 4\./.test(M.reimpostazione({ nome: 'Mario', nomeUtente: 'mariorossi4', link: LINK_RESET, assistenza: ASSISTENZA }).testo),
    'reimpostazione: l\'avviso sul numero solo per un nome utente che finisce con un numero');
const resetGestore = M.reimpostazione({ perGestore: true, link: SITO + '/diretta/reimposta.html?oobCode=Zz9&per=gestione', assistenza: ASSISTENZA });
comuni('reimpostazione del gestore', resetGestore);
vero(/gestione della diretta/.test(resetGestore.oggetto) && !/Nome utente/.test(resetGestore.html) && /Imposta la password/.test(resetGestore.html), 'gestore: accesso alla gestione, senza nome utente');
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
    ['credenziali', M.credenziali({ evento: evCattivo, nome: CATTIVO.nome, cognome: CATTIVO.cognome, nomeUtente: 'annadangelo', password: 'Esempio7Kq', assistenza: ASSISTENZA })],
    ['promemoria', M.promemoria({ tipo: 'ora', evento: evCattivo, nome: CATTIVO.nome, cognome: CATTIVO.cognome, nomeUtente: 'annadangelo', assistenza: ASSISTENZA })],
    ['reimpostazione', M.reimpostazione({ nome: CATTIVO.nome, cognome: CATTIVO.cognome, nomeUtente: 'annadangelo', link: LINK_RESET, assistenza: ASSISTENZA })]
];
tutte.forEach(([n, m]) => {
    // (le uniche <img> ammesse sono il logo e la fascia, con i loro indirizzi fissi)
    vero(!/<script|<b>|<img src=x|<iframe/i.test(m.html) && (m.html.match(/<img /g) || []).length === 2, n + ': nessun tag arrivato dai dati (script, b, img, iframe)');
    vero(/&lt;/.test(m.html) || n === 'reimpostazione', n + ': i caratteri speciali arrivano scritti (&lt;)');
    vero(!/[\r\n]/.test(m.oggetto) && !/\nBcc:/i.test(m.oggetto), n + ': nessun a capo (e nessun Bcc) nell\'oggetto');
});
const credCattiva = tutte[0][1];
vero(credCattiva.html.indexOf('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Convegno&quot; &#39;speciale&#39;') >= 0, 'escape completo di < > & " \' nel titolo');
vero(credCattiva.html.indexOf('Anna &lt;b&gt; D&#39;Angelo &quot;&amp;&quot; &lt;img src=x onerror=alert(1)&gt;') >= 0, 'escape completo nel nome e cognome');
vero(credCattiva.testo.indexOf('<script>alert(1)</script>') >= 0, 'nel testo semplice il titolo resta com\'era (non e\' HTML)');

/* ---------- i collegamenti non si dirottano ---------- */
const dirottata = M.credenziali({
    evento: EVENTO, nome: 'Mario', nomeUtente: 'mariorossi', password: 'Esempio7Kq', assistenza: ASSISTENZA,
    link: 'https://phishing.example/diretta/?u=mariorossi', paginaEvento: 'javascript:alert(1)'
});
vero(dirottata.html.indexOf('phishing.example') < 0 && dirottata.html.indexOf(ACCEDI_HTML) >= 0, 'un collegamento di accesso estraneo viene ignorato e rifatto da nome utente ed evento');
// l'evento entra nel collegamento solo se ha la forma giusta
const idStrani = ['napoli-2026&u=altro', '../x', 'Napoli-2026', 'a"><b'].map(id => M.credenziali({ evento: EVENTO, idEvento: id, nomeUtente: 'mariorossi', password: 'X', assistenza: ASSISTENZA }));
vero(idStrani.every(m => m.html.indexOf('href="' + SITO + '/diretta/?u=mariorossi"') >= 0 && m.testo.indexOf('Accedi alla diretta: ' + SITO + '/diretta/?u=mariorossi\n') >= 0 && !/<b>|<b\s|a"><b/.test(m.html)),
    'un identificativo dell\'evento non valido non entra nel collegamento (resta ?u=)');
vero(M.linkAccesso('mariorossi', 'roma-2026') === SITO + '/diretta/?u=mariorossi&e=roma-2026' && M.linkAccesso('', 'roma-2026') === SITO + '/diretta/?e=roma-2026',
    'linkAccesso: ?u=nome&e=evento (e ?e= da solo senza nome utente)');
vero(M.linkDimenticata('mariorossi') === SITO + '/diretta/?u=mariorossi&dimenticata=1' && M.linkDimenticata('') === SITO + '/diretta/?dimenticata=1', 'linkDimenticata: la vista "Password dimenticata?" con il nome utente');
vero(dirottata.html.indexOf('javascript:') < 0 && !/pagina dell'evento/.test(dirottata.html) && /home del sito/.test(dirottata.html), 'una pagina dell\'evento non valida non compare (resta la home)');
vero(M.linkPaginaEvento('/napoli_ottobre_2026/') === SITO + '/napoli_ottobre_2026/' && M.linkPaginaEvento('//evil.example/') === '', 'pagina dell\'evento: forma /cartella/ (e niente //host)');
vero(M.linkPaginaEvento('https://evil.example/') === '' && M.linkPaginaEvento('/pagina"x/') === '' && M.linkPaginaEvento('/Maiuscole/') === '', 'pagina dell\'evento: indirizzi esterni, apici e maiuscole rifiutati');
const assistenzaCattiva = M.credenziali({ evento: EVENTO, nomeUtente: 'x', password: 'y', assistenza: { email: '"><script>@x.it', telefono: '<b>123</b>' } });
vero(!/<script|<b>123/.test(assistenzaCattiva.html) && assistenzaCattiva.html.indexOf('info@nextgenerationbusiness.it') >= 0, 'un contatto di assistenza non valido torna quello predefinito');

/* ---------- l'indirizzo del sito da APP_BASE_URL (le prove locali) ---------- */
process.env.APP_BASE_URL = 'http://127.0.0.1:8090/';
const locale = M.credenziali({ evento: EVENTO, nomeUtente: 'mariorossi', password: 'Esempio7Kq', paginaEvento: '/napoli_ottobre_2026/', assistenza: ASSISTENZA });
vero(locale.html.indexOf('href="http://127.0.0.1:8090/diretta/?u=mariorossi&amp;e=napoli-2026"') >= 0, 'con APP_BASE_URL i collegamenti puntano a quel sito');
vero(locale.html.indexOf(SITO + '/assets/logo-revilaw-bianco.png') >= 0, '...ma le immagini restano quelle del sito pubblico');
delete process.env.APP_BASE_URL;

console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
process.exit(rossi ? 1 : 0);
