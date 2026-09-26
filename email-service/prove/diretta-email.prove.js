/* ============================================================
   PROVE - l'email, l'unico identificativo della diretta
   ------------------------------------------------------------
       node prove/diretta-email.prove.js

   Niente da installare, niente emulatori. Esce con 1 se qualcosa e'
   rosso.

   COSA DIMOSTRANO.
   1. La regola dell'email (lib/diretta-email.js): maiuscole e spazi
      prima e dopo non contano (anche quelli invisibili di Excel); i
      punti e i "+" restano (sono caselle diverse); il controllo di
      validita'; l'impronta per i contatori dei tentativi (niente
      indirizzi negli id) uguale per la stessa email scritta in modi
      diversi.
   2. La stessa persona scritta in modi diversi (accenti, apostrofi,
      maiuscole, nome e cognome scambiati) e le persone diverse.
   3. L'anteprima dell'import (analizzaImport), riga per riga: nuovo,
      gia' presente (nessuna password nuova), gia' iscritto, doppia nel
      file, email condivisa (nel file e con l'account esistente),
      email mancante o non valida, nome mancante o non valido, escluso;
      i conteggi e "pronto".
   4. La pagina del modulo del sito e quella dell'evento
      (lib/diretta-iscrizione.js, paginaCorrisponde): l'etichetta di
      oggi ("Napoli 2 Ottobre 2026 - Manifestazione di interesse"), un
      percorso, un indirizzo intero; e le pagine che non corrispondono.
   5. Una password per persona (lib/diretta-invio.js, tipoInvio e
      haPassword): chi ha gia' una password riceve l'avviso «anche»,
      chi non l'ha (o l'ha avuta a un indirizzo poi corretto) le
      credenziali; il reinvio per lo stesso evento e il "Reinvia" del
      gestore sempre con la password.
   6. Il gancio del modulo del sito con la diretta NON configurata:
      risponde subito 'non-configurata', senza toccare niente.
   ============================================================ */
'use strict';
delete process.env.DIRETTA_EMULATORE;
delete process.env.DIRETTA_FIREBASE_SERVICE_ACCOUNT;
const E = require('../lib/diretta-email');
const I = require('../lib/diretta-iscrizione');
const invio = require('../lib/diretta-invio');
const D = require('../lib/diretta-dati');

let rossi = 0, verdi = 0;
function vero(cond, descrizione) {
    if (cond) verdi++;
    else { rossi++; console.log('ROSSO  ' + descrizione); }
}
function uguale(ottenuto, atteso, descrizione) {
    const ok = JSON.stringify(ottenuto) === JSON.stringify(atteso);
    vero(ok, descrizione + (ok ? '' : ' (atteso ' + JSON.stringify(atteso) + ', ottenuto ' + JSON.stringify(ottenuto) + ')'));
}

(async () => {
    /* ---------- 1. la regola dell'email ---------- */
    uguale(E.normalizzaEmail('  Mario.Rossi@Example.COM '), 'mario.rossi@example.com', 'email: maiuscole e spazi prima e dopo');
    uguale(E.normalizzaEmail('MARIO.ROSSI@EXAMPLE.COM'), 'mario.rossi@example.com', 'email tutta maiuscola');
    uguale(E.normalizzaEmail('\tmario.rossi@example.com\n'), 'mario.rossi@example.com', 'email con tabulazione e a capo');
    uguale(E.normalizzaEmail('mario\u200b.rossi@example.com\ufeff'), 'mario.rossi@example.com', 'email con i caratteri invisibili di Excel');
    uguale(E.normalizzaEmail('mailto:Mario@X.it'), 'mario@x.it', 'email con mailto: davanti');
    uguale(E.normalizzaEmail('m.a.r.i.o+eventi@gmail.com'), 'm.a.r.i.o+eventi@gmail.com', 'i punti e il "+" NON si toccano (sono caselle diverse)');
    uguale(E.normalizzaEmail(null), '', 'email null: vuota');
    vero(E.emailValida('mario.rossi+eventi@example.co.uk'), 'email valida con + e dominio a due livelli');
    vero(E.emailValida(' Mario.Rossi@Example.COM '), 'email valida anche scritta con maiuscole e spazi');
    vero(!E.emailValida('mario.rossi@example'), 'email senza dominio di primo livello: non valida');
    vero(!E.emailValida('mario..rossi@example.com'), 'email con due punti di fila: non valida');
    vero(!E.emailValida('mario/rossi@example.com'), 'email con barra (sarebbe un percorso di Firestore): non valida');
    vero(!E.emailValida('') && !E.emailValida('mario rossi') && !E.emailValida('mariorossi'), 'vuota, senza chiocciola, un vecchio nome utente: non valide');
    vero(!E.emailValida('a'.repeat(250) + '@x.it'), 'email piu\' lunga di 254 caratteri: non valida');
    const k = E.chiaveEmail('mario.rossi@example.com');
    vero(/^[0-9a-f]{32}$/.test(k), 'chiaveEmail: 32 caratteri esadecimali (' + k + ')');
    vero(E.chiaveEmail('  MARIO.Rossi@example.com ') === k && E.chiaveEmail('mario.rossi@example.it') !== k, 'chiaveEmail: stessa impronta per la stessa email scritta in modi diversi, diversa per un\'altra');
    vero(k.indexOf('mario') < 0, 'chiaveEmail: dall\'impronta non si legge l\'indirizzo');
    uguale(E.emailMascherata('mario.rossi@acme.it'), 'm***@acme.it', 'emailMascherata');

    /* ---------- 2. la stessa persona ---------- */
    vero(E.stessaPersona({ nome: 'Nicolò', cognome: 'D\'Angelo' }, { nome: 'nicolo', cognome: 'dangelo' }), 'stessa persona: accenti, apostrofi e maiuscole');
    vero(E.stessaPersona({ nome: 'Rossi', cognome: 'Mario' }, { nome: 'Mario', cognome: 'Rossi' }), 'stessa persona: nome e cognome scambiati di colonna');
    vero(E.stessaPersona({ nome: 'Anna Maria', cognome: 'De Luca' }, { nome: 'Anna', cognome: 'Maria De Luca' }), 'stessa persona: doppio nome spezzato in un altro modo');
    vero(!E.stessaPersona({ nome: 'Mario', cognome: 'Rossi' }, { nome: 'Luigi', cognome: 'Rossi' }), 'persone diverse: Mario e Luigi Rossi');
    vero(!E.stessaPersona({ nome: 'Mario', cognome: 'Rossi' }, { nome: 'Mario', cognome: 'Bianchi' }), 'persone diverse: stesso nome, cognome diverso');

    /* ---------- 3. l'anteprima dell'import ---------- */
    const esistenti = {
        perEmail: {
            'luigi.verdi@prova.it': { uid: 'pL', nome: 'Luigi', cognome: 'Verdi', eventi: ['milano-2026'], stato: 'attivo' },
            'anna.bianchi@prova.it': { uid: 'pA', nome: 'Anna', cognome: 'Bianchi', eventi: ['napoli-2026'], stato: 'attivo' },
            'info@studio.it': { uid: 'pI', nome: 'Carla', cognome: 'Neri', eventi: [], stato: 'attivo' },
            'spento@prova.it': { uid: 'pS', nome: 'Sandro', cognome: 'Spento', eventi: [], stato: 'disattivato' }
        }
    };
    const righe = [
        { nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@prova.it', azienda: 'ACME' },            // 2 nuovo
        { nome: 'Luigi', cognome: 'Verdi', email: ' LUIGI.VERDI@prova.it ', azienda: '' },              // 3 gia' presente (altro evento)
        { nome: 'anna', cognome: 'BIANCHI', email: 'anna.bianchi@prova.it' },                           // 4 gia' iscritta
        { nome: 'Mario', cognome: 'Rossi', email: 'Mario.Rossi@Prova.it' },                             // 5 doppia nel file (riga 2)
        { nome: 'Paolo', cognome: 'Gialli', email: 'condivisa@ufficio.it' },                            // 6 email condivisa nel file
        { nome: 'Pia', cognome: 'Gialli', email: 'condivisa@ufficio.it' },                              // 7 email condivisa nel file
        { nome: 'Dario', cognome: 'Blu', email: 'info@studio.it' },                                     // 8 condivisa con l'account esistente (Carla Neri)
        { nome: 'Elena', cognome: 'Senza', email: '' },                                                 // 9 email mancante
        { nome: 'Fabio', cognome: 'Storto', email: 'fabio.storto@' },                                   // 10 email non valida
        { nome: '', cognome: 'Solo', email: 'solo.cognome@prova.it' },                                  // 11 nome mancante
        { nome: '<b>Gino</b>', cognome: 'Tag', email: 'gino.tag@prova.it' },                            // 12 nome non valido
        { nome: 'Ugo', cognome: 'Escluso', email: 'ugo@prova.it', escludi: true },                      // 13 escluso
        { nome: 'Sandro', cognome: 'Spento', email: 'spento@prova.it' },                                // 14 gia' presente, disattivato
        { nome: 'Zeno', cognome: 'Invisibile', email: 'Zeno.Invisibile@Prova.it\u200b' }                // 15 nuovo (normalizzato)
    ];
    const a = E.analizzaImport(righe, esistenti, 'napoli-2026');
    uguale(a.righe.map(r => r.riga), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 'anteprima: le righe numerate come nel file (dalla 2)');
    uguale(a.righe.map(r => r.esito), ['nuovo', 'gia-presente', 'gia-iscritto', 'doppia-nel-file', 'email-condivisa', 'email-condivisa', 'email-condivisa',
        'email-mancante', 'email-non-valida', 'nome-mancante', 'nome-non-valido', 'escluso', 'gia-presente', 'nuovo'], 'anteprima: gli esiti riga per riga');
    uguale(a.righe.map(r => r.crea), [true, true, false, false, false, false, false, false, false, false, false, false, true, true], 'anteprima: da creare solo i nuovi e i gia\' presenti');
    vero(a.righe[1].uidEsistente === 'pL' && /nessuna password nuova/.test(a.righe[1].problemi.find(p => p.codice === 'gia-presente').testo), 'gia\' presente: l\'account esistente, e nessuna password nuova');
    vero(a.righe[3].primaRiga === 2 && a.righe[3].problemi.every(p => !p.grave), 'doppia nel file: vale la riga 2, e non c\'e\' niente da correggere');
    vero(/riga 7 \(Pia Gialli\)/.test(a.righe[4].problemi.find(p => p.codice === 'email-condivisa').testo) && /riga 6 \(Paolo Gialli\)/.test(a.righe[5].problemi.find(p => p.codice === 'email-condivisa').testo),
        'email condivisa nel file: tutte e due le righe, ognuna dice l\'altra');
    vero(/già registrato Carla Neri/.test(a.righe[6].problemi.find(p => p.codice === 'email-condivisa').testo), 'email condivisa con l\'account esistente: dice a chi e\' registrata');
    vero(a.righe[12].problemi.some(p => p.codice === 'disattivato' && !p.grave), 'gia\' presente ma disattivato: un avviso, non un errore');
    vero(a.righe[13].emailNorm === 'zeno.invisibile@prova.it', 'anteprima: l\'email normalizzata di ogni riga (' + a.righe[13].emailNorm + ')');
    uguale(a.conteggi, { totale: 14, nuovi: 2, giaPresenti: 2, giaIscritti: 1, doppie: 1, esclusi: 1, daCorreggere: 7, daCreare: 4 }, 'anteprima: i conteggi');
    vero(a.pronto === false, 'anteprima: con righe da correggere NON e\' pronta («Crea gli account» spento)');
    // corretto quello che c'era da correggere (o escluso), e' pronta
    const corrette = righe.map((r, i) => [4, 6, 7, 8, 9, 10].indexOf(i) >= 0 ? Object.assign({}, r, { escludi: true }) : r)
        .map((r, i) => i === 5 ? Object.assign({}, r, { email: 'pia.gialli@ufficio.it' }) : r);
    const b = E.analizzaImport(corrette, esistenti, 'napoli-2026');
    vero(b.pronto === true && b.conteggi.daCorreggere === 0 && b.conteggi.daCreare === 5, 'corrette o escluse le righe sbagliate: pronta (' + JSON.stringify(b.conteggi) + ')');
    const vuota = E.analizzaImport([], esistenti, 'napoli-2026');
    vero(vuota.pronto === true && vuota.conteggi.daCreare === 0, 'un file vuoto: niente da correggere e niente da creare');
    vero(E.ESITI.length === 10 && E.DA_CORREGGERE.every(c => E.ESITI.indexOf(c) >= 0), 'l\'elenco degli esiti (' + E.ESITI.join(', ') + ')');
    vero(!/nome ?utente/i.test(JSON.stringify(a)), 'nell\'anteprima non si parla di nome utente');

    /* ---------- 4. la pagina del modulo e quella dell'evento ---------- */
    const P = '/napoli_ottobre_2026/';
    vero(I.paginaCorrisponde('Napoli 2 Ottobre 2026 - Manifestazione di interesse', P), 'l\'etichetta del modulo di Napoli porta a /napoli_ottobre_2026/');
    vero(I.paginaCorrisponde('/napoli_ottobre_2026', P) && I.paginaCorrisponde('/NAPOLI_OTTOBRE_2026/index.html', P), 'un percorso (senza barra finale, con index.html, in maiuscolo)');
    vero(I.paginaCorrisponde('https://nextgenerationbusiness.it/napoli_ottobre_2026/#accreditamento', P) && I.paginaCorrisponde('http://127.0.0.1:8090/napoli_ottobre_2026/?x=1', P), 'un indirizzo intero (con # e ?)');
    vero(!I.paginaCorrisponde('Roma 16 Aprile 2026 - Iscrizione', P) && !I.paginaCorrisponde('Napoli 2026', P) && !I.paginaCorrisponde('/roma_aprile_2026/', P), 'un\'altra pagina: no');
    vero(!I.paginaCorrisponde('', P) && !I.paginaCorrisponde('Napoli 2 Ottobre 2026', '') && !I.paginaCorrisponde('Napoli', '/napoli/'), 'pagina vuota, evento senza pagina, una parola sola: no');
    vero(!I.paginaCorrisponde('Ottobre 2026 - Napoli', P), 'le parole contano solo prima del " - "');
    uguale(D.percorsoPagina('https://x.it/a_b/index.html#z'), '/a_b/', 'percorsoPagina: solo il percorso, con la barra finale');

    /* ---------- 5. una password per persona ---------- */
    const T = invio._interni;
    const ts = ms => ({ toMillis: () => ms });
    const nessuno = { invii: { 'napoli-2026': { stato: 'in coda' } } };
    vero(T.tipoInvio(nessuno, 'napoli-2026') === 'credenziali', 'mai ricevuta una password: le credenziali');
    const conMilano = { invii: { 'napoli-2026': { stato: 'in coda' }, 'milano-2026': { stato: 'inviata', inviata: ts(1000), tipo: 'credenziali' } } };
    vero(T.haPassword(conMilano, 'napoli-2026') && T.tipoInvio(conMilano, 'napoli-2026') === 'anche', 'credenziali gia\' partite per un altro evento: l\'avviso «anche», senza password');
    vero(T.tipoInvio(conMilano, 'napoli-2026', true) === 'credenziali', 'il "Reinvia" del gestore: sempre le credenziali');
    const soloAnche = { invii: { 'napoli-2026': { stato: 'in coda' }, 'milano-2026': { stato: 'inviata', inviata: ts(1000), tipo: 'anche' } } };
    vero(T.tipoInvio(soloAnche, 'napoli-2026') === 'credenziali', 'l\'avviso «anche» non e\' una password: se non c\'e\' altro, le credenziali');
    const respinta = { invii: { 'napoli-2026': { stato: 'in coda' }, 'milano-2026': { stato: 'respinta', inviata: ts(1000), tipo: 'credenziali' } } };
    vero(T.tipoInvio(respinta, 'napoli-2026') === 'credenziali', 'credenziali di un altro evento respinte: non le ha, riceve le credenziali');
    const incerta = { invii: { 'napoli-2026': { stato: 'in coda' }, 'milano-2026': { stato: 'incerto', aggiornato: ts(1000) } } };
    vero(T.tipoInvio(incerta, 'napoli-2026') === 'anche', 'credenziali di un altro evento "incerte" (forse partite): nessuna password nuova');
    const stessoEvento = { invii: { 'napoli-2026': { stato: 'in coda', inviata: ts(500), tipo: 'credenziali' }, 'milano-2026': { stato: 'inviata', inviata: ts(1000), tipo: 'credenziali' } } };
    vero(T.tipoInvio(stessoEvento, 'napoli-2026') === 'credenziali', 'reinvio per lo stesso evento (non ricevuta, indirizzo corretto): le credenziali, come sempre');
    const cambiata = { emailCambiata: ts(2000), invii: { 'napoli-2026': { stato: 'in coda' }, 'milano-2026': { stato: 'inviata', inviata: ts(1000), tipo: 'credenziali' } } };
    vero(T.tipoInvio(cambiata, 'napoli-2026') === 'credenziali', 'indirizzo corretto DOPO le credenziali dell\'altro evento: erano andate a un\'altra casella, le credenziali');
    const aVoce = { passwordAVoce: ts(3000), invii: { 'napoli-2026': { stato: 'in coda' } } };
    vero(T.tipoInvio(aVoce, 'napoli-2026') === 'anche', 'una password data a voce dal gestore: l\'avviso «anche» (non la si cancella)');
    const ancheAncora = { invii: { 'napoli-2026': { stato: 'in coda', inviata: ts(500), tipo: 'anche' }, 'milano-2026': { stato: 'inviata', inviata: ts(1000), tipo: 'credenziali' } } };
    vero(T.tipoInvio(ancheAncora, 'napoli-2026') === 'anche', 'un avviso «anche» da rimandare (respinto e riaccodato): di nuovo l\'avviso');

    /* ---------- 6. la diretta non configurata ---------- */
    const t0 = Date.now();
    const nc = await I.dalModulo({ email: 'mario@prova.it', nome: 'Mario', cognome: 'Rossi', pagina: 'Napoli 2 Ottobre 2026 - Manifestazione di interesse' });
    vero(nc.esito === 'non-configurata' && Date.now() - t0 < 50, 'diretta non configurata: il gancio risponde subito, senza fare niente (' + (Date.now() - t0) + ' ms)');
    vero(I.configurata() === false, 'configurata(): false senza chiave e senza emulatore');
    process.env.DIRETTA_FIREBASE_SERVICE_ACCOUNT = '{"project_id":"ngb-eventi"}';
    vero(I.configurata() === true, 'configurata(): true con la chiave della diretta');
    delete process.env.DIRETTA_FIREBASE_SERVICE_ACCOUNT;

    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi');
    process.exit(rossi ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
