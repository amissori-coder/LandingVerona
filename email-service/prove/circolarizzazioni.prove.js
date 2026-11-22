/* ============================================================
   PROVE - circolarizzazioni via PEC (Strumenti di revisione)
   ------------------------------------------------------------
       node prove/circolarizzazioni.prove.js

   Niente da installare e niente rete: Firestore, il server di
   posta e la casella PEC sono finti, il codice provato e' quello
   vero (api/circolarizzazioni.js e lib/circ-*.js).

   COSA DIMOSTRANO
     - chi vede che cosa: team, responsabile dell'incarico e della
       qualita' i propri incarichi; amministratore e supervisori
       tutto; nessuno la lettera di un incarico altrui;
     - una lettera non parte senza il suo PDF, e un file che non e'
       un PDF non entra;
     - piu' persone che inviano insieme: ogni PEC parte una volta
       sola (due giri in parallelo non raddoppiano niente);
     - le ricevute: accettata, consegnata, non consegnata (con i
       solleciti che si fermano);
     - i solleciti partono alla loro data con il loro testo, e NON
       partono se la risposta e' arrivata prima;
     - a chi appartiene una risposta: per messaggio a cui si
       risponde, per riferimento nell'oggetto, per indirizzo; e
       quando non e' sicuro resta "non associata" finche' non la
       associa l'amministratore;
     - un giro interrotto a meta' non spedisce due volte, e non
       lascia una lettera ferma per sempre;
     - il tetto orario e il rifiuto del server che ferma il giro;
     - il registro degli errori: una riga per problema, UNA email
       per gli errori nuovi, la spunta di chi amministra, e la riga
       che si riapre se il problema si ripresenta;
     - la bozza delle nuove lettere sta sul portale: righe e PDF si
       ritrovano da un altro computer, chi salva da una versione
       superata viene fermato, all'invio la lettera prende il PDF
       dalla bozza, e le bozze ferme da un mese si tolgono;
     - il registro delle operazioni: ogni azione che cambia qualcosa
       lascia una voce con chi l'ha fatta e che cosa e' cambiato,
       un'azione rifiutata non ne lascia, le voci restano anche dopo
       la cancellazione dei dati di un incarico (con il riepilogo
       delle lettere tolte), e ognuno legge solo quello che gli
       spetta;
     - la pagina degli incarichi si apre con poche letture, sempre le
       stesse, anche per chi segue centinaia di incarichi (prima erano
       una per incarico, in fila);
     - la posta gia' nella casella prima dell'attivazione non entra
       fra le "non associate", e la casella non si legge piu' del
       necessario.
   ============================================================ */
'use strict';

const F = require('./circ-finti');
F.orologioFinto('2027-01-11T10:00:00+01:00');
const { dati, db, posta, avvisi, notizie, ricevuta, risposta, avanti, alle, DateVera } = F;
const MIN = 60000, ORA = 60 * MIN, GIORNO = 24 * ORA;

const C = require('../lib/circ-comune');
const DATI = require('../lib/circ-dati');
const GIRO = require('../lib/circ-giro');
const LETTORE = require('../lib/circ-lettore');
const BOZZE = require('../lib/circ-bozze');
const crypto = require('crypto');
const api = require('../api/circolarizzazioni');

// ---------- anagrafica ----------
const persone = [
    { id: 'p1', nome: 'Rossi', nomeProprio: 'Marta', email: 'marta@studio.it', attivo: true },
    { id: 'p2', nome: 'Bianchi', nomeProprio: 'Luca', email: 'luca@studio.it', attivo: true },
    { id: 'p3', nome: 'Verdi', nomeProprio: 'Anna', email: 'anna@studio.it', attivo: true },
    { id: 'p4', nome: 'Neri', nomeProprio: 'Ugo', email: 'ugo@studio.it', attivo: true },
    { id: 'p5', nome: 'Gialli', nomeProprio: 'Sara', email: 'sara@studio.it', attivo: true }
];
const incarichi = [
    { id: 'inc-alfa', cliente: 'ALFA MECCANICA SRL', stato: 'attivo', respIncarico: 'Verdi', qualita: 'Neri', team: 'Rossi, Bianchi' },
    { id: 'inc-beta', cliente: 'BETA TESSILE SPA', stato: 'attivo', respIncarico: 'Verdi', qualita: 'Neri', team: 'Bianchi' },
    { id: 'inc-gamma', cliente: 'GAMMA SRL', stato: 'proposta', respIncarico: 'Verdi', qualita: 'Neri', team: 'Rossi' }
];
dati.set('archivio/incarichi', { json: JSON.stringify(incarichi) });
dati.set('archivio/persone', { json: JSON.stringify(persone) });
['marta', 'luca', 'anna', 'ugo', 'sara'].forEach(n => dati.set('utenti/' + n + '@studio.it', { nome: n, ruolo: 'procuratore', attivo: true }));
dati.set('utenti/a.missori@emvas.tax', { nome: 'Andrea Missori', ruolo: 'admin', attivo: true });
dati.set('utenti/spento@studio.it', { nome: 'x', ruolo: 'procuratore', attivo: false });

// ---------- attrezzi ----------
let passate = 0, fallite = 0;
function verifica(cosa, condizione, dettaglio) {
    if (condizione) { passate++; return; }
    fallite++;
    console.error('  NO  ' + cosa + (dettaglio !== undefined ? '\n        ' + JSON.stringify(dettaglio) : ''));
}
async function chiama(chi, corpo, metodo, intestazioni) {
    let stato = 200, risposta = null;
    const res = { setHeader() { }, status(s) { stato = s; return res; }, json(j) { risposta = j; return res; }, end() { return res; } };
    await api({ method: metodo || 'POST', headers: intestazioni || {}, body: Object.assign({ idToken: chi }, corpo) }, res);
    return Object.assign({ http: stato }, risposta);
}
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(700 * 1024, 65)]);     // piu' di un pezzo
async function nuova(chi, incaricoId, campi, file) {
    file = file || PDF;
    const oggi = C.giornoRoma();
    const r = await chiama(chi, Object.assign({
        azione: 'crea', incaricoId: incaricoId, destinatario: 'Banca di Prova S.p.A.', pec: 'banca@pec.it', categoria: 'banca',
        bilancio: '2026-12-31', scadenza: C.aggiungiGiorni(oggi, 10),
        sollecito1: { data: C.aggiungiGiorni(oggi, 11), scadenza: C.aggiungiGiorni(oggi, 18) },
        sollecito2: { data: C.aggiungiGiorni(oggi, 19), scadenza: C.aggiungiGiorni(oggi, 24) },
        allegatoNome: 'Lettera banca.pdf', allegatoDimensione: file.length
    }, campi));
    if (!r.ok) return r;
    let ultimo = null;
    for (let n = 0; n < r.pezzi; n++) {
        ultimo = await chiama(chi, { azione: 'allegato', id: r.id, n: n, dati: file.slice(n * r.pezzoByte, (n + 1) * r.pezzoByte).toString('base64') });
        if (!ultimo.ok) return ultimo;
    }
    return Object.assign({}, r, ultimo);
}
const scheda = async id => (await DATI.leggi(db, id));
const rifDi = m => String(m.messageId).replace(/[<>]/g, '');

(async () => {
    // ---------- 1. regole e testi ----------
    const oggi = C.giornoRoma();
    verifica('oggi a Roma', oggi === '2027-01-11', oggi);
    verifica('le 9 di Roma in inverno', new DateVera(C.istanteRoma('2027-01-22', 9)).toISOString() === '2027-01-22T08:00:00.000Z');
    verifica('le 9 di Roma in estate', new DateVera(C.istanteRoma('2027-07-01', 9)).toISOString() === '2027-07-01T07:00:00.000Z');
    verifica('riferimento letto dall\'oggetto', C.codiceDa('POSTA CERTIFICATA: R: Richiesta - rif. rvl-7k3m9q') === 'RVL-7K3M9Q');
    verifica('nessun riferimento inventato', C.codiceDa('Richiesta di conferma REVILAW 2026') === '');
    const base = { destinatario: 'Banca X', pec: 'x@pec.it', categoria: 'banca', bilancio: '2026-12-31', scadenza: '2027-01-21', allegatoNome: 'a.pdf', allegatoDimensione: 1000 };
    verifica('scadenza gia\' passata rifiutata', C.controllaRichiesta(Object.assign({}, base, { scadenza: '2027-01-11' }), oggi).ok === false);
    verifica('PEC non valida rifiutata', C.controllaRichiesta(Object.assign({}, base, { pec: 'x@pec' }), oggi).ok === false);
    verifica('secondo sollecito senza il primo rifiutato', C.controllaRichiesta(Object.assign({}, base, { sollecito2: { data: '2027-02-01', scadenza: '2027-02-05' } }), oggi).ok === false);
    verifica('secondo sollecito prima del primo rifiutato', C.controllaRichiesta(Object.assign({}, base, { sollecito1: { data: '2027-01-25', scadenza: '2027-01-30' }, sollecito2: { data: '2027-01-24', scadenza: '2027-02-05' } }), oggi).ok === false);
    verifica('PDF troppo grande rifiutato', C.controllaRichiesta(Object.assign({}, base, { allegatoDimensione: 6 * 1024 * 1024 }), oggi).ok === false);
    const d0 = { cliente: 'ALFA MECCANICA SRL', destinatario: 'Banca X', categoria: 'banca', bilancio: '2026-12-31', scadenza: '2027-01-21', codice: 'RVL-ABCDEF', casella: 'c@pec.it', inviatoIl: '2027-01-11', scadenzaPrima: '2027-01-21', sollecito1Il: '2027-01-22' };
    const t1 = C.testoSemplice('primo', d0), t2 = C.testoSemplice('sollecito1', Object.assign({}, d0, { scadenza: '2027-01-29' })), t3 = C.testoSemplice('sollecito2', Object.assign({}, d0, { scadenza: '2027-02-05' }));
    verifica('la richiesta dice entro quando rispondere', t1.indexOf('entro il 21 gennaio 2027') > 0 && t1.indexOf('RVL-ABCDEF') > 0 && t1.indexOf('rapporti bancari') > 0);
    verifica('il primo sollecito ha il suo testo e la sua data', t2.indexOf('11 gennaio 2027') > 0 && t2.indexOf('entro il 29 gennaio 2027') > 0 && t2.indexOf('potrebbe esserVi sfuggita') > 0);
    verifica('il secondo sollecito cita il primo ed e\' piu\' fermo', t3.indexOf('sollecito del 22 gennaio 2027') > 0 && t3.indexOf('entro e non oltre il 5 febbraio 2027') > 0 && t3.indexOf('procedure alternative') > 0);
    verifica('oggetti distinti per passo', C.oggetto('primo', d0).indexOf('SOLLECITO') < 0 && /^SOLLECITO - /.test(C.oggetto('sollecito1', d0)) && /^SECONDO SOLLECITO - /.test(C.oggetto('sollecito2', d0)));
    verifica('HTML senza immagini e con i dati', C.html('primo', d0).indexOf('<img') < 0 && C.html('primo', d0).indexOf('ALFA MECCANICA SRL') > 0);

    // ---------- 2. chi vede che cosa ----------
    let st = await chiama('marta@studio.it', { azione: 'stato' });
    verifica('team: vede il suo incarico e non gli altri', st.ok && st.incarichi.length === 1 && st.incarichi[0].id === 'inc-alfa' && st.incarichi[0].ruoli.join() === 'team', st.incarichi);
    st = await chiama('luca@studio.it', { azione: 'stato' });
    verifica('team su due incarichi', st.incarichi.map(i => i.id).join() === 'inc-alfa,inc-beta');
    st = await chiama('anna@studio.it', { azione: 'stato' });
    verifica('responsabile dell\'incarico', st.incarichi.length === 2 && st.incarichi[0].ruoli.join() === 'responsabile');
    st = await chiama('ugo@studio.it', { azione: 'stato' });
    verifica('responsabile della qualita\'', st.incarichi.length === 2 && st.incarichi[0].ruoli.join() === 'qualita');
    st = await chiama('sara@studio.it', { azione: 'stato' });
    verifica('chi non e\' su nessun incarico non vede niente', st.ok && st.incarichi.length === 0 && st.profilo.vedeTutto === false);
    st = await chiama('a.missori@emvas.tax', { azione: 'stato' });
    verifica('amministratore: tutti gli incarichi partiti', st.profilo.admin && st.incarichi.length === 2 && st.nonAssociate === 0, st.incarichi);
    verifica('utenza spenta rifiutata', (await chiama('spento@studio.it', { azione: 'stato' })).http === 403);
    verifica('gettone non valido rifiutato', (await chiama('scaduto', { azione: 'stato' })).http === 401);
    verifica('incarico altrui: niente elenco', (await chiama('marta@studio.it', { azione: 'elenco', incaricoId: 'inc-beta' })).http === 403);
    verifica('incarico altrui: niente lettere', (await chiama('marta@studio.it', { azione: 'crea', incaricoId: 'inc-beta' })).http === 403);

    // ---------- 3. una lettera e il suo PDF ----------
    const nonPdf = await nuova('marta@studio.it', 'inc-alfa', { pec: 'word@pec.it' }, Buffer.concat([Buffer.from('PK docx'), Buffer.alloc(2000, 66)]));
    verifica('un file che non e\' un PDF non entra', nonPdf.ok === false && /non è un PDF/.test(nonPdf.msg), nonPdf);
    const a1 = await nuova('marta@studio.it', 'inc-alfa');
    verifica('lettera creata e in coda', a1.ok && a1.completo && /^RVL-/.test(a1.codice), a1);
    let s = await scheda(a1.id);
    verifica('la scheda e\' in coda con i due solleciti programmati', s.stato === 'coda' && s.passi.sollecito1.stato === 'programmato' && s.passi.sollecito2.stato === 'programmato' && s.prossimo <= Date.now());
    const doppia = await nuova('luca@studio.it', 'inc-alfa');
    verifica('stessa PEC sullo stesso incarico: avviso di doppione', doppia.ok === false && doppia.doppione === true && doppia.http === 400, doppia);
    const a2 = await nuova('luca@studio.it', 'inc-alfa', { destinatario: 'Studio Legale Bruni', pec: 'bruni@pec.it', categoria: 'legale' });
    const b1 = await nuova('luca@studio.it', 'inc-beta', {});      // stessa banca, altra societa'
    const a3 = await nuova('marta@studio.it', 'inc-alfa', { destinatario: 'Fornitore Zeta', pec: 'zeta@pec.it', categoria: 'fornitore', sollecito1: null, sollecito2: null });
    verifica('altre tre lettere in coda', a2.ok && b1.ok && a3.ok);
    verifica('un collega non carica l\'allegato di un altro', (await chiama('luca@studio.it', { azione: 'allegato', id: a1.id, n: 0, dati: 'AAAA' })).http === 409);

    // ---------- 4. piu' persone inviano insieme ----------
    // nella casella c'e' gia' posta di prima dell'attivazione: non deve finire fra le "non associate"
    risposta({ da: 'vecchio.cliente@pec.it', oggetto: 'Risposta a una lettera mandata a mano mesi fa' });
    const giri = await Promise.all([chiama('marta@studio.it', { azione: 'avvia' }), chiama('luca@studio.it', { azione: 'avvia' }), GIRO.giro(db, { da: 'cron' })]);
    verifica('tre giri insieme: quattro PEC, nessuna doppia', posta.length === 4 && new Set(posta.map(m => m.to)).size === 3 && new Set(posta.map(m => m.messageId)).size === 4, posta.map(m => m.to));
    verifica('prima di spedire la prima PEC si e\' fissato il punto di partenza della casella', dati.get('meta/circLettore').uidValidity === '777' && dati.get('meta/circLettore').ultimoUid === 1);
    verifica('uno solo ha spedito, gli altri hanno trovato occupato', giri.filter(g => g.esito === 'occupato').length === 2, giri.map(g => g.esito));
    const m1 = posta.find(m => m.to === 'banca@pec.it' && m.subject.indexOf('ALFA') > 0);
    verifica('la PEC porta mittente, riferimento, PDF e data', m1.from.indexOf('circolarizzazionirevilaw@pec.it') > 0 && m1.subject.indexOf(a1.codice) > 0
        && m1.attachments[0].filename === 'Lettera banca.pdf' && m1.attachments[0].content.equals(PDF) && m1.text.indexOf('entro il 21 gennaio 2027') > 0, m1.subject);
    s = await scheda(a1.id);
    verifica('scheda inviata, prossimo = primo sollecito alle 9', s.stato === 'inviata' && s.passi.primo.stato === 'inviato' && s.prossimo === C.istanteRoma('2027-01-22', 9));
    await GIRO.giro(db, { da: 'cron' });
    verifica('un altro giro non rispedisce niente', posta.length === 4);

    // ---------- 5. le ricevute ----------
    const rA1 = rifDi(m1), mA2 = posta.find(m => m.to === 'bruni@pec.it'), mB1 = posta.find(m => m.to === 'banca@pec.it' && m.subject.indexOf('BETA') > 0), mA3 = posta.find(m => m.to === 'zeta@pec.it');
    ricevuta('accettazione', rA1, { identificativo: 'opec210312.20270111100005.00001.pec@pec.aruba.it' });
    ricevuta('avvenuta-consegna', rA1, { consegna: 'banca@pec.it' });
    ricevuta('accettazione', rifDi(mA2));
    ricevuta('errore-consegna', rifDi(mA2), { errore: 'no-dest', erroreEsteso: '5.1.1 - indirizzo non valido' });
    ricevuta('accettazione', rifDi(mB1), { identificativo: 'opec-beta@pec.aruba.it' });
    ricevuta('avvenuta-consegna', rifDi(mB1), { consegna: 'banca@pec.it' });
    ricevuta('avvenuta-consegna', 'messaggio-di-qualcun-altro@pec.it', { consegna: 'boh@pec.it' });
    const let1 = await chiama('marta@studio.it', { azione: 'controlla' });
    verifica('casella letta', let1.ok && let1.letto && let1.ricevute === 6, let1);
    s = await scheda(a1.id);
    verifica('accettata e consegnata', s.stato === 'consegnata' && s.passi.primo.accettata && s.passi.primo.consegnata && s.messaggi.length === 2);
    s = await scheda(a2.id);
    verifica('non consegnata: errore e solleciti fermi', s.stato === 'errore' && s.passi.sollecito1.stato === 'bloccato' && s.passi.sollecito1.per === 'recapito' && s.prossimo === null, s.passi);
    await LETTORE.giro(db, {});
    verifica('rileggere la casella non cambia niente', (await scheda(a1.id)).messaggi.length === 2);
    const el = await chiama('ugo@studio.it', { azione: 'elenco', incaricoId: 'inc-alfa' });
    verifica('conteggi dell\'incarico', el.ok && el.conteggi.totale === 3 && el.conteggi.consegnate === 1 && el.conteggi.errori === 1 && el.conteggi.inviate === 3 && el.conteggi.sollecito1.programmati === 1, el.conteggi);
    const eml = await chiama('marta@studio.it', { azione: 'scarica', id: a1.id, chiave: s.messaggi.length ? (await scheda(a1.id)).messaggi[0].chiave : '' });
    verifica('la ricevuta si scarica come .eml', eml.ok && eml.fine && Buffer.from(eml.dati, 'base64').toString().indexOf('X-Ricevuta: accettazione') >= 0);
    verifica('la ricevuta di un altro incarico no', (await chiama('marta@studio.it', { azione: 'scarica', id: b1.id, chiave: 'x' })).http === 403);

    // ---------- 6. correggere l'indirizzo e reinviare ----------
    const rein = await chiama('luca@studio.it', { azione: 'reinvia', id: a2.id, pec: 'studiobruni@pec.it' });
    verifica('reinvio accettato', rein.ok && rein.scheda.stato === 'coda' && rein.scheda.pec === 'studiobruni@pec.it' && rein.scheda.passi.sollecito1.stato === 'programmato', rein);
    await GIRO.giro(db, {});
    verifica('la lettera corretta e\' ripartita', posta.length === 5 && posta[4].to === 'studiobruni@pec.it');
    ricevuta('accettazione', rifDi(posta[4]));
    ricevuta('avvenuta-consegna', rifDi(posta[4]), { consegna: 'studiobruni@pec.it' });
    await LETTORE.giro(db, {});
    verifica('ora e\' consegnata, con la storia del primo tentativo', (await scheda(a2.id)).stato === 'consegnata' && (await scheda(a2.id)).storico.length === 1);
    verifica('non si reinvia una lettera consegnata', (await chiama('luca@studio.it', { azione: 'reinvia', id: a1.id, pec: 'x@pec.it' })).http === 409);

    // ---------- 7. le risposte ----------
    // a) BETA risponde al nostro messaggio (identificativo del gestore): niente dubbi anche se la banca e' la stessa di ALFA
    alle('2027-01-15T11:00:00+01:00');
    const rispBeta = risposta({ da: 'banca@pec.it', oggetto: 'R: conferma saldi', inRisposta: 'opec-beta@pec.aruba.it', pdfByte: 5000 });
    // b) un fornitore risponde da un altro indirizzo, ma lascia il riferimento nell'oggetto
    const rispZeta = risposta({ da: 'amministrazione.zeta@legalmail.it', oggetto: 'Re: Richiesta di conferma esterna - rif. ' + a3.codice.toLowerCase() });
    // c) la banca scrive un messaggio nuovo, senza riferimenti: ha due lettere, ma una e' gia' risposta? no: resta ambigua
    const rispAmbigua = risposta({ da: 'banca@pec.it', oggetto: 'Invio documentazione richiesta' });
    // d) un "sono in ferie" non e' una risposta
    risposta({ da: 'studiobruni@pec.it', oggetto: 'Risposta automatica: assente fino al 20', automatica: true, inRisposta: rifDi(posta[4]) });
    const let2 = await LETTORE.giro(db, {});
    verifica('quattro messaggi: tre abbinati, uno no', let2.risposte === 3 && let2.nonAssociate === 1, let2);
    s = await scheda(b1.id);
    verifica('risposta per messaggio: sulla lettera di BETA, solleciti fermi', s.stato === 'risposta' && s.risposta.modo === 'pec' && s.risposte[0].via === 'risposta' && s.passi.sollecito1.stato === 'bloccato' && s.passi.sollecito2.stato === 'bloccato' && s.prossimo === null, s.passi.sollecito1);
    verifica('la lettera di ALFA alla stessa banca NON e\' toccata', (await scheda(a1.id)).risposta === null && (await scheda(a1.id)).passi.sollecito1.stato === 'programmato');
    s = await scheda(a3.id);
    verifica('risposta per riferimento nell\'oggetto, da un altro indirizzo', s.stato === 'risposta' && s.risposte[0].via === 'riferimento' && s.risposte[0].da === 'amministrazione.zeta@legalmail.it');
    s = await scheda(a2.id);
    verifica('la risposta automatica si elenca ma non ferma i solleciti', s.risposta === null && s.risposte.length === 1 && s.risposte[0].automatica && s.passi.sollecito1.stato === 'programmato');
    verifica('il team non vede le non associate', (await chiama('marta@studio.it', { azione: 'non-associate' })).http === 403);
    let na = await chiama('a.missori@emvas.tax', { azione: 'non-associate' });
    verifica('l\'amministratore vede la non associata, con la lettera candidata', na.ok && na.messaggi.length === 1 && na.messaggi[0].da === 'banca@pec.it' && na.messaggi[0].candidati.length === 2, na.messaggi);
    const testoNa = await chiama('a.missori@emvas.tax', { azione: 'leggi', chiave: na.messaggi[0].chiave });
    verifica('la legge prima di associarla', testoNa.ok && testoNa.testo === 'Confermiamo il saldo indicato.', testoNa);
    const ass = await chiama('a.missori@emvas.tax', { azione: 'associa', chiave: na.messaggi[0].chiave, id: a1.id });
    verifica('associata a mano', ass.ok && ass.incaricoId === 'inc-alfa', ass);
    s = await scheda(a1.id);
    verifica('la lettera di ALFA ora ha la risposta e i solleciti fermi', s.stato === 'risposta' && s.risposte[0].via === 'manuale' && s.risposte[0].associataDa && s.passi.sollecito1.stato === 'bloccato');
    verifica('non si associa due volte', (await chiama('a.missori@emvas.tax', { azione: 'associa', chiave: na.messaggi[0].chiave, id: b1.id })).http === 409);
    verifica('nessuna non associata rimasta', (await chiama('a.missori@emvas.tax', { azione: 'non-associate' })).messaggi.length === 0);
    // il testo e il PDF della risposta, a tratti
    const testo = await chiama('luca@studio.it', { azione: 'leggi', id: b1.id, chiave: (await scheda(b1.id)).risposte[0].chiave });
    verifica('il testo della risposta si legge dalla casella', testo.ok && testo.testo === 'Confermiamo il saldo indicato.');
    const rb = (await scheda(b1.id)).risposte[0];
    const pezzo = await chiama('luca@studio.it', { azione: 'scarica', id: b1.id, chiave: rb.chiave, parte: rb.allegati[0].parte });
    const ricomposto = Buffer.from(Buffer.from(pezzo.dati, 'base64').toString('latin1').replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
    verifica('il PDF della risposta si scarica e torna identico', pezzo.ok && pezzo.fine && pezzo.codifica === 'base64' && ricomposto.equals(rispBeta.pdf), { fine: pezzo.fine, cod: pezzo.codifica });
    verifica('un allegato che non e\' di quella risposta no', (await chiama('luca@studio.it', { azione: 'scarica', id: b1.id, chiave: rb.chiave, parte: '9.9' })).http === 404);
    void rispZeta; void rispAmbigua;

    // ---------- 8. i solleciti ----------
    // resta senza risposta solo a2 (Studio Bruni): sollecito1 il 22/1 alle 9, sollecito2 il 30/1
    alle('2027-01-22T08:30:00+01:00');
    await chiama('x', {}, 'GET', { authorization: 'Bearer cron' });
    verifica('prima delle 9 non parte niente', posta.length === 5);
    alle('2027-01-22T09:03:00+01:00');
    const cron = await chiama('x', {}, 'GET', { authorization: 'Bearer cron' });
    verifica('alle 9 parte il primo sollecito, uno solo', cron.ok && posta.length === 6 && /^SOLLECITO - /.test(posta[5].subject) && posta[5].to === 'studiobruni@pec.it', posta.slice(5).map(m => m.subject));
    verifica('il sollecito cita la prima PEC e la nuova scadenza', posta[5].text.indexOf('in data 11 gennaio 2027') > 0 && posta[5].text.indexOf('entro il 29 gennaio 2027') > 0 && posta[5].attachments[0].content.equals(PDF));
    const subito = await chiama('x', {}, 'GET', { authorization: 'Bearer cron' });
    verifica('niente da spedire e casella appena letta: non ci si rientra', subito.lettore.esito === 'letta da poco' && posta.length === 6, subito.lettore);
    verifica('il giro senza segreto non parte', (await chiama('x', {}, 'GET', { authorization: 'Bearer undefined' })).http === 401);
    // la risposta arriva dopo il primo sollecito: il secondo non deve partire
    alle('2027-01-26T10:00:00+01:00');
    risposta({ da: 'studiobruni@pec.it', oggetto: 'Riscontro', ordinaria: true });       // posta ordinaria, indirizzo univoco
    alle('2027-01-30T09:05:00+01:00');
    await chiama('x', {}, 'GET', { authorization: 'Bearer cron' });
    s = await scheda(a2.id);
    verifica('risposta arrivata: il secondo sollecito e\' bloccato e non parte', posta.length === 6 && s.passi.sollecito2.stato === 'bloccato' && s.risposta.modo === 'email' && s.passi.sollecito1.stato === 'inviato', s.passi.sollecito2);

    // ---------- 9. risposta a mano, date dei solleciti, annullamenti ----------
    alle('2027-02-01T10:00:00+01:00');
    const c1 = await nuova('anna@studio.it', 'inc-beta', { destinatario: 'Cliente Uno', pec: 'uno@pec.it', categoria: 'cliente', saldo: '12.345,67', nota: 'cod. 1001' });
    verifica('saldo scritto all\'italiana e nota: sulla scheda, per il report', (await scheda(c1.id)).saldo === 12345.67 && (await scheda(c1.id)).nota === 'cod. 1001');
    verifica('un saldo che non e\' un numero viene rifiutato', (await chiama('anna@studio.it', { azione: 'crea', incaricoId: 'inc-beta', destinatario: 'X Srl', pec: 'x@pec.it', categoria: 'cliente', bilancio: '2026-12-31', scadenza: C.aggiungiGiorni(C.giornoRoma(), 5), saldo: 'circa mille', allegatoNome: 'x.pdf', allegatoDimensione: 5000 })).http === 400);
    const c2 = await nuova('anna@studio.it', 'inc-beta', { destinatario: 'Cliente Due', pec: 'due@pec.it', categoria: 'cliente' });
    verifica('annullare una lettera ancora in coda', (await chiama('anna@studio.it', { azione: 'annulla', id: c2.id })).cosa === 'lettera');
    await GIRO.giro(db, {});
    verifica('la lettera annullata non parte', posta.length === 7 && posta[6].to === 'uno@pec.it');
    const mod = await chiama('luca@studio.it', { azione: 'solleciti', id: c1.id, sollecito1: { data: '2027-02-20', scadenza: '2027-02-27' }, sollecito2: null });
    verifica('date dei solleciti cambiate', mod.ok && mod.scheda.passi.sollecito1.data === '2027-02-20' && mod.scheda.passi.sollecito2.stato === 'non-previsto' && (await scheda(c1.id)).prossimo === C.istanteRoma('2027-02-20', 9), mod);
    verifica('data di sollecito nel passato rifiutata', (await chiama('luca@studio.it', { azione: 'solleciti', id: c1.id, sollecito1: { data: '2027-02-01', scadenza: '2027-02-08' } })).http === 400);
    const man = await chiama('luca@studio.it', { azione: 'risposta-manuale', id: c1.id, nota: 'consegnata a mano al team' });
    verifica('risposta segnata a mano: sollecito fermo', man.ok && man.scheda.risposta.modo === 'manuale' && man.scheda.passi.sollecito1.stato === 'bloccato');
    const tolta = await chiama('luca@studio.it', { azione: 'risposta-manuale', id: c1.id, togli: true });
    verifica('tolta: il sollecito torna in programma', tolta.ok && tolta.scheda.risposta === null && tolta.scheda.passi.sollecito1.stato === 'programmato');
    const stB = await chiama('anna@studio.it', { azione: 'stato' });
    const pa = stB.incarichi.find(i => i.id === 'inc-beta').perAmbito;
    verifica('le tipologie dicono a quale area appartengono', stB.categorie.find(x => x.id === 'cliente').ambito === 'clientiFornitori' && stB.categorie.find(x => x.id === 'cliente').saldo === true && stB.categorie.find(x => x.id === 'banca').ambito === 'obbligatorie' && stB.ambiti.length === 2);
    verifica('conteggi divisi per area: la banca fra le obbligatorie, il cliente fra clienti e fornitori', pa.obbligatorie.totale === 1 && pa.clientiFornitori.totale === 1 && pa.clientiFornitori.annullate === 1, pa);
    const elB = await chiama('anna@studio.it', { azione: 'elenco', incaricoId: 'inc-beta' });
    verifica('l\'elenco porta area, saldo e nota di ogni lettera', elB.schede.find(x => x.id === c1.id).ambito === 'clientiFornitori' && elB.schede.find(x => x.id === c1.id).saldo === 12345.67 && elB.schede.find(x => x.id === b1.id).ambito === 'obbligatorie' && elB.perAmbito.obbligatorie.risposte === 1);
    verifica('annullare i solleciti di una lettera partita', (await chiama('anna@studio.it', { azione: 'annulla', id: c1.id })).cosa === 'solleciti' && (await scheda(c1.id)).prossimo === null);

    // ---------- 10. un giro interrotto a meta' ----------
    alle('2027-02-03T10:00:00+01:00');
    const d1 = await nuova('anna@studio.it', 'inc-beta', { destinatario: 'Cliente Tre', pec: 'tre@pec.it', categoria: 'cliente', sollecito1: null, sollecito2: null });
    const preso = await DATI.prendi(db, d1.id, Date.now(), 0);       // il giro la prende... e la funzione muore qui
    verifica('presa in carico', preso.passo === 'primo' && (await scheda(d1.id)).passi.primo.stato === 'invio');
    await GIRO.giro(db, {});
    verifica('finche\' e\' "in invio" nessun altro la spedisce', posta.length === 7);
    avanti(25 * MIN);
    await GIRO.giro(db, {});
    verifica('senza una lettura recente della casella non si rischia il doppione', posta.length === 7 && (await scheda(d1.id)).passi.primo.stato === 'invio');
    // caso A: la PEC era partita davvero -> arriva l'accettazione
    ricevuta('accettazione', preso.riferimento);
    await LETTORE.giro(db, {});
    verifica('l\'accettazione dice che era partita: inviata, senza rispedire', (await scheda(d1.id)).passi.primo.stato === 'inviato' && posta.length === 7);
    // caso B: non era partita -> la casella letta dopo non ha niente, quindi si rispedisce
    const d2 = await nuova('anna@studio.it', 'inc-beta', { destinatario: 'Cliente Quattro', pec: 'quattro@pec.it', categoria: 'cliente', sollecito1: null, sollecito2: null });
    await DATI.prendi(db, d2.id, Date.now(), 0);
    avanti(25 * MIN);
    await LETTORE.giro(db, {});
    await GIRO.giro(db, {});
    verifica('nessuna accettazione dopo venti minuti e casella letta: riparte', posta.length === 8 && posta[7].to === 'quattro@pec.it' && (await scheda(d2.id)).passi.primo.stato === 'inviato' && (await scheda(d2.id)).passi.primo.tentativi === 2);

    // ---------- 11. il server rifiuta, e il tetto orario ----------
    alle('2027-02-04T10:00:00+01:00');
    const e1 = await nuova('anna@studio.it', 'inc-beta', { destinatario: 'Cliente Cinque', pec: 'cinque@pec.it', categoria: 'cliente', sollecito1: null, sollecito2: null });
    const e2 = await nuova('anna@studio.it', 'inc-beta', { destinatario: 'Cliente Sei', pec: 'sei@pec.it', categoria: 'cliente', sollecito1: null, sollecito2: null });
    F.stato.rifiuta = () => Object.assign(new Error('421 4.7.0 Too many messages, try later'), { responseCode: 421 });
    const fermo = await GIRO.giro(db, {});
    verifica('rifiuto che riguarda noi: il giro si ferma e la lettera torna in coda', fermo.esito === 'fermato' && posta.length === 8 && (await scheda(e1.id)).passi.primo.stato === 'coda' && (await scheda(e2.id)).passi.primo.stato === 'coda', fermo);
    F.stato.rifiuta = m => m.to === 'cinque@pec.it' ? Object.assign(new Error('550 5.1.1 mailbox unavailable'), { responseCode: 550 }) : null;
    avanti(20 * MIN);
    await GIRO.giro(db, {});
    verifica('rifiuto del solo destinatario: errore su quella, le altre partono', (await scheda(e1.id)).stato === 'errore' && (await scheda(e2.id)).passi.primo.stato === 'inviato' && posta.length === 9);
    F.stato.rifiuta = null;
    process.env.CIRC_MAX_ORA = '10';      // nell'ora ne e' gia' partita una
    for (let i = 0; i < 12; i++) await nuova('anna@studio.it', 'inc-beta', { destinatario: 'Fornitore ' + i, pec: 'f' + i + '@pec.it', categoria: 'fornitore', sollecito1: null, sollecito2: null });
    const tetto1 = await GIRO.giro(db, {});
    verifica('tetto orario: ne partono nove e le altre aspettano', tetto1.inviate === 9 && tetto1.restanti === true && posta.length === 18, tetto1);
    verifica('raggiunto il tetto non parte piu\' niente', (await GIRO.giro(db, {})).esito === 'tetto' && posta.length === 18);
    avanti(ORA);
    await GIRO.giro(db, {});
    verifica('nell\'ora dopo partono le rimanenti', posta.length === 21);
    delete process.env.CIRC_MAX_ORA;

    // ---------- 11 bis. il registro degli errori, l'email, la spunta ----------
    const cronGiro = () => chiama('x', {}, 'GET', { authorization: 'Bearer cron' });
    verifica('il team non vede il registro degli errori', (await chiama('marta@studio.it', { azione: 'errori' })).http === 403);
    let reg = await chiama('a.missori@emvas.tax', { azione: 'errori' });
    const tipi = reg.aperti.map(x => x.tipo).sort().join();
    verifica('nel registro: la PEC non consegnata, quella non partita e il server che ha sospeso', reg.ok && reg.aperti.length === 3 && tipi === 'invio,recapito,server', reg.aperti.map(x => x.tipo + ':' + x.titolo));
    const eRec = reg.aperti.find(x => x.tipo === 'recapito');
    verifica('l\'errore di recapito dice quale lettera', eRec.titolo === 'PEC non consegnata' && eRec.cliente === 'ALFA MECCANICA SRL' && eRec.destinatario === 'Studio Legale Bruni' && eRec.pec === 'bruni@pec.it' && /^RVL-/.test(eRec.codice) && eRec.incaricoId === 'inc-alfa' && /indirizzo non valido/.test(eRec.dettaglio), eRec);
    verifica('la prima email e\' partita col primo giro dopo l\'errore, al titolare', avvisi.length === 1 && avvisi[0].to === 'a.missori@emvas.tax' && /PEC non consegnata/.test(avvisi[0].subject) && avvisi[0].html.indexOf('Studio Legale Bruni') > 0 && avvisi[0].from.indexOf('noreply@nextgenerationbusiness.it') > 0, avvisi.map(m => m.subject));
    verifica('la stessa lettera reinviata e non consegnata di nuovo non fa una seconda riga', reg.aperti.filter(x => x.tipo === 'recapito').length === 1);
    let giroAvv = await cronGiro();
    verifica('i due errori nuovi arrivano in UNA sola email', giroAvv.avvisi.avvisati === 2 && avvisi.length === 2 && /2 errori da controllare/.test(avvisi[1].subject) && avvisi[1].text.indexOf('Cliente Cinque') > 0 && avvisi[1].text.indexOf('sospeso gli invii') > 0, avvisi.slice(1).map(m => m.subject));
    await cronGiro();
    verifica('per un errore gia\' avvisato non arriva un\'altra email', avvisi.length === 2);
    const eServer = reg.aperti.find(x => x.tipo === 'server');
    verifica('solo chi vede tutto spunta', (await chiama('luca@studio.it', { azione: 'errore-risolvi', id: eServer.id })).http === 403);
    const spunta = await chiama('a.missori@emvas.tax', { azione: 'errore-risolvi', id: eServer.id, nota: 'tetto orario: ripartite da sole' });
    reg = await chiama('a.missori@emvas.tax', { azione: 'errori' });
    verifica('errore spuntato: passa fra i risolti, con chi e quando', spunta.risolti === 1 && reg.aperti.length === 2 && reg.risolti.length === 1 && /Andrea Missori/.test(reg.risolti[0].risolto.da) && reg.risolti[0].risolto.nota === 'tetto orario: ripartite da sole');
    verifica('nel conteggio di chi entra ci sono solo gli aperti', (await chiama('a.missori@emvas.tax', { azione: 'stato' })).errori === 2);
    // lo stesso problema si ripresenta dopo la spunta: la riga si riapre e l'avviso riparte
    const g1 = await nuova('anna@studio.it', 'inc-beta', { destinatario: 'Cliente Sette', pec: 'sette@pec.it', categoria: 'cliente', sollecito1: null, sollecito2: null });
    F.stato.rifiuta = () => Object.assign(new Error('421 4.7.0 Too many messages, try later'), { responseCode: 421 });
    await GIRO.giro(db, {});
    F.stato.rifiuta = null;
    reg = await chiama('a.missori@emvas.tax', { azione: 'errori' });
    const riaperto = reg.aperti.find(x => x.tipo === 'server');
    verifica('si ripresenta dopo la spunta: riaperto, due volte, da avvisare di nuovo', reg.aperti.length === 3 && reg.risolti.length === 0 && riaperto.volte === 2 && riaperto.riaperto > 0 && riaperto.avvisato === 0, riaperto);
    F.stato.rifiutaAvvisi = true;
    giroAvv = await cronGiro();
    verifica('se l\'email non parte l\'errore resta da avvisare', avvisi.length === 2 && giroAvv.avvisi.ok === false);
    F.stato.rifiutaAvvisi = false;
    avanti(20 * MIN);
    await cronGiro();
    verifica('e parte al giro dopo (intanto la lettera in coda e\' ripartita)', avvisi.length === 3 && /sospeso gli invii/.test(avvisi[2].subject) && (await scheda(g1.id)).passi.primo.stato === 'inviato');
    const riap = await chiama('a.missori@emvas.tax', { azione: 'errore-riapri', id: eServer.id });
    verifica('riaprire una riga aperta non fa danni', riap.ok === true);
    // la casella rifiuta la password
    F.stato.rompiImap = () => Object.assign(new Error('Invalid credentials (Failure)'), { authenticationFailed: true });
    const guasto = await LETTORE.giro(db, { forza: true });
    F.stato.rompiImap = null;
    reg = await chiama('a.missori@emvas.tax', { azione: 'errori' });
    verifica('password della casella rifiutata: nel registro', guasto.ok === false && reg.aperti.some(x => x.tipo === 'casella' && /rifiuta la password/.test(x.titolo)), reg.aperti.map(x => x.titolo));
    await LETTORE.giro(db, { forza: true });      // la casella torna a leggersi
    // un errore che non doveva succedere
    const vera = DATI.schedeIncarico;
    DATI.schedeIncarico = async () => { throw new Error('indice mancante'); };
    const rotto = await chiama('anna@studio.it', { azione: 'elenco', incaricoId: 'inc-beta' });
    DATI.schedeIncarico = vera;
    reg = await chiama('a.missori@emvas.tax', { azione: 'errori' });
    verifica('un errore imprevisto del servizio finisce nel registro', rotto.http === 500 && reg.aperti.some(x => x.tipo === 'servizio' && /elenco/.test(x.dettaglio) && /indice mancante/.test(x.dettaglio)));
    const tutti = await chiama('a.missori@emvas.tax', { azione: 'errore-risolvi', ids: reg.aperti.map(x => x.id) });
    verifica('si spuntano anche tutti insieme', tutti.risolti === reg.aperti.length && (await chiama('a.missori@emvas.tax', { azione: 'errori' })).aperti.length === 0);
    await cronGiro();
    let nAvvisi = avvisi.length;

    // ---------- 11 ter. chi ha preparato la lettera viene avvisato ----------
    // finora: i giri programmati del 22 e del 30 gennaio hanno gia' spedito le notizie accumulate
    const perChi = a => notizie.filter(m => m.to === a);
    const nLuca = perChi('luca@studio.it'), nMarta = perChi('marta@studio.it');
    verifica('a Luca, che aveva preparato le lettere: PEC non consegnata e risposte, in una email a giro',
        nLuca.length === 2 && /2 novità|3 novità/.test(nLuca[0].subject) && nLuca[0].text.indexOf('PEC NON ARRIVATE') > 0 && nLuca[0].text.indexOf('Studio Legale Bruni') > 0 && nLuca[0].text.indexOf('non è stata consegnata') > 0
        && nLuca[0].text.indexOf('RISPOSTE ARRIVATE') > 0 && nLuca[0].text.indexOf('Banca di Prova S.p.A. (BETA TESSILE SPA') > 0, nLuca.map(m => m.subject + ' | ' + m.text.slice(0, 400)));
    verifica('la risposta automatica ("sono assente") non genera un avviso', nLuca[0].text.indexOf('assente') < 0 && nLuca[0].text.split('\n').filter(r => /^- Studio Legale Bruni/.test(r)).length === 1, nLuca[0].text);
    verifica('la risposta arrivata dopo arriva con il giro successivo, da sola', /risposta di Studio Legale Bruni \(ALFA MECCANICA SRL\)/.test(nLuca[1].subject) && nLuca[1].html.indexOf('(posta ordinaria)') > 0 && nLuca[1].text.indexOf('PEC NON ARRIVATE') < 0, nLuca[1].subject);
    verifica('a Marta le sue: la risposta del fornitore e quella associata a mano dall\'amministratore',
        nMarta.length === 1 && /2 novità/.test(nMarta[0].subject) && nMarta[0].text.indexOf('Fornitore Zeta') > 0 && nMarta[0].text.indexOf('Banca di Prova S.p.A. (ALFA MECCANICA SRL') > 0 && nMarta[0].html.indexOf('Risposta firmata.pdf') > 0, nMarta.map(m => m.subject));
    verifica('ognuno riceve solo le notizie delle lettere che ha preparato', nMarta[0].text.indexOf('BETA TESSILE') < 0 && nLuca[0].text.indexOf('Fornitore Zeta') < 0 && notizie.every(m => m.to.indexOf(',') < 0));
    verifica('le email partono dalla posta ordinaria dello studio, con il collegamento all\'area', nLuca[0].from.indexOf('noreply@nextgenerationbusiness.it') > 0 && nLuca[0].html.indexOf('https://nextgenerationbusiness.it/area-riservata/') > 0);
    const nAnna = perChi('anna@studio.it');
    verifica('la lettera non partita (indirizzo rifiutato) avvisa chi l\'aveva preparata', nAnna.length === 1 && /la PEC non è partita: Cliente Cinque \(BETA TESSILE SPA\)/.test(nAnna[0].subject) && nAnna[0].text.indexOf('Correggi la PEC e reinvia') > 0, nAnna.map(m => m.subject));
    verifica('la coda degli avvisi e\' vuota: niente arriva due volte', ![...dati.keys()].some(k => /^circAvvisi\//.test(k)) && (await cronGiro()).avvisiUtenti.inviate === 0);
    // chi amministra prepara una lettera che non arriva: ha gia' l'email degli errori, non ne riceve una seconda
    dati.set('archivio/persone', { json: JSON.stringify(persone.concat([{ id: 'p0', nome: 'Missori', nomeProprio: 'Andrea', email: 'a.missori@emvas.tax', attivo: true }])) });
    const h1 = await nuova('a.missori@emvas.tax', 'inc-beta', { destinatario: 'Cliente Otto', pec: 'otto@pec.it', categoria: 'cliente', sollecito1: null, sollecito2: null });
    await GIRO.giro(db, {});
    const mOtto = posta[posta.length - 1];
    ricevuta('accettazione', rifDi(mOtto));
    ricevuta('errore-consegna', rifDi(mOtto), { errore: 'no-dest', erroreEsteso: '5.1.1 - casella piena' });
    risposta({ da: 'otto@pec.it', oggetto: 'Riscontro', inRisposta: 'opec-' + rifDi(mOtto) });
    await LETTORE.giro(db, { forza: true });
    await cronGiro();
    const nAdmin = perChi('a.missori@emvas.tax');
    verifica('all\'amministratore che ha inviato: solo la risposta (l\'errore gli arriva con l\'email degli errori)', h1.ok && nAdmin.length === 1 && /risposta di Cliente Otto/.test(nAdmin[0].subject) && nAdmin[0].text.indexOf('PEC NON ARRIVATE') < 0, nAdmin.map(m => m.subject));
    F.stato.rifiutaAvvisi = true;
    const i1 = await nuova('anna@studio.it', 'inc-beta', { destinatario: 'Cliente Nove', pec: 'nove@pec.it', categoria: 'cliente', sollecito1: null, sollecito2: null });
    await GIRO.giro(db, {});
    risposta({ da: 'nove@pec.it', oggetto: 'Riscontro Vostra' });
    await LETTORE.giro(db, { forza: true });
    const ko = await cronGiro();
    F.stato.rifiutaAvvisi = false;
    verifica('se la posta non parte l\'avviso resta in coda', i1.ok && ko.avvisiUtenti.ok === false && perChi('anna@studio.it').length === 1);
    await cronGiro();
    verifica('e parte al giro dopo', perChi('anna@studio.it').length === 2 && /risposta di Cliente Nove/.test(perChi('anna@studio.it')[1].subject));
    // gli errori nati qui (la lettera dell'amministratore non consegnata) si chiudono: la sezione dopo riparte pulita
    const apertiOra = (await chiama('a.missori@emvas.tax', { azione: 'errori' })).aperti;
    verifica('la PEC non consegnata dell\'amministratore e\' nel registro', apertiOra.some(x => x.tipo === 'recapito' && x.destinatario === 'Cliente Otto'));
    await chiama('a.missori@emvas.tax', { azione: 'errore-risolvi', ids: apertiOra.map(x => x.id) });
    await cronGiro();
    nAvvisi = avvisi.length;

    // ---------- 12. supervisori, riepilogo, cancellazione ----------
    verifica('solo l\'amministratore nomina i supervisori', (await chiama('anna@studio.it', { azione: 'supervisori', supervisori: ['sara@studio.it'] })).http === 403);
    verifica('un supervisore deve avere un accesso', (await chiama('a.missori@emvas.tax', { azione: 'supervisori', supervisori: ['nessuno@studio.it'] })).http === 400);
    verifica('supervisore nominato', (await chiama('a.missori@emvas.tax', { azione: 'supervisori', supervisori: ['Sara@studio.it'] })).supervisori.join() === 'sara@studio.it');
    verifica('solo l\'amministratore decide chi riceve gli avvisi', (await chiama('sara@studio.it', { azione: 'avvisi-errori', supervisori: true })).http === 403);
    const av = await chiama('a.missori@emvas.tax', { azione: 'avvisi-errori', supervisori: true });
    verifica('avvisi anche ai supervisori', av.ok && av.avvisiErrori.destinatari.join() === 'a.missori@emvas.tax,sara@studio.it');
    await require('../lib/circ-errori').segna(db, { chiave: 'prova~supervisori', tipo: 'servizio', titolo: 'Errore di prova' });
    await chiama('x', {}, 'GET', { authorization: 'Bearer cron' });
    verifica('l\'email arriva al titolare e al supervisore', avvisi.length === nAvvisi + 1 && avvisi[avvisi.length - 1].to === 'a.missori@emvas.tax, sara@studio.it');
    verifica('il supervisore vede il registro e spunta', (await chiama('sara@studio.it', { azione: 'errori' })).aperti.length === 1
        && (await chiama('sara@studio.it', { azione: 'errore-risolvi', ids: (await chiama('sara@studio.it', { azione: 'errori' })).aperti.map(x => x.id) })).risolti === 1);
    st = await chiama('sara@studio.it', { azione: 'stato' });
    verifica('il supervisore vede tutto, ma non e\' amministratore', st.profilo.vedeTutto && !st.profilo.admin && st.incarichi.length === 2 && st.supervisori === undefined);
    verifica('il supervisore vede le non associate', (await chiama('sara@studio.it', { azione: 'non-associate' })).ok === true);
    verifica('il supervisore non cancella', (await chiama('sara@studio.it', { azione: 'cancella-incarico', incaricoId: 'inc-alfa', conferma: 'CANCELLA' })).http === 403);
    st = await chiama('a.missori@emvas.tax', { azione: 'stato' });
    const cAlfa = st.incarichi.find(i => i.id === 'inc-alfa').conteggi;
    verifica('riepilogo dell\'amministratore per incarico', cAlfa.totale === 3 && cAlfa.risposte === 3 && cAlfa.sollecito1.inviati === 1 && cAlfa.sollecito2.bloccati === 2, cAlfa);
    const perCod = await chiama('a.missori@emvas.tax', { azione: 'per-codice', codice: a1.codice.replace('-', ' ').toLowerCase() });
    verifica('lettera trovata dal riferimento', perCod.ok && perCod.scheda.id === a1.id);
    verifica('la cancellazione vuole la conferma', (await chiama('a.missori@emvas.tax', { azione: 'cancella-incarico', incaricoId: 'inc-alfa' })).http === 400);
    const canc = await chiama('a.missori@emvas.tax', { azione: 'cancella-incarico', incaricoId: 'inc-alfa', conferma: 'CANCELLA' });
    const tolteAlfa = [a1.id, a2.id, a3.id];
    const rimaste = [...dati.keys()].filter(k => /^circ(Riferimenti|Messaggi)\//.test(k) && tolteAlfa.indexOf(dati.get(k).invio) >= 0);
    verifica('incarico cancellato: schede, PDF e indice', canc.ok && canc.tolte === 3 && (await scheda(a1.id)) === null && rimaste.length === 0 && ![...dati.keys()].some(k => k.indexOf('circInvii/' + a1.id + '/') === 0), rimaste);
    verifica('l\'altro incarico resta', (await scheda(b1.id)) !== null);
    verifica('con l\'incarico se ne vanno anche i suoi errori', ![...dati.keys()].some(k => /^circErrori\//.test(k) && dati.get(k).incaricoId === 'inc-alfa') && [...dati.keys()].some(k => /^circErrori\//.test(k) && dati.get(k).incaricoId === 'inc-beta'));

    // ---------- 12b. la bozza delle nuove lettere, salvata sul portale ----------
    const PDFB = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(650 * 1024, 66)]);        // due pezzi
    const PDFP = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3000, 67)]);
    const bz = (chi, corpo) => chiama(chi, Object.assign({ incaricoId: 'inc-alfa', ambito: 'obbligatorie' }, corpo));
    const bozzaDiMarta = async () => (await bz('marta@studio.it', { azione: 'bozza-leggi' })).bozza;
    const chiaviBozze = re => [...dati.keys()].filter(k => /^circBozze\//.test(k) && (!re || re.test(k)));
    const righeB = [
        { id: 'r1', categoria: 'banca', nome: 'Banca Bozza S.p.A.', pec: 'bozza@pec.it', saldo: '', nota: 'c/c 77', file: { nome: 'bozza.pdf', peso: PDFB.length } },
        { id: 'r2', categoria: 'legale', nome: 'Studio a metà', pec: '', saldo: '', nota: '' },
        { id: 'r3', categoria: 'cliente', nome: 'Fuori area', pec: 'x@pec.it' },
        { id: 'non valido!', categoria: 'banca', nome: 'Riga senza un id buono' }
    ];
    verifica('lo stato dice per quanto resta una bozza', (await chiama('marta@studio.it', { azione: 'stato' })).limiti.bozzaGiorni === 30);
    verifica('nessuna bozza all\'inizio', (await bozzaDiMarta()) === null);
    verifica('la bozza e\' solo per gli incarichi che si seguono', (await chiama('marta@studio.it', { azione: 'bozza-leggi', incaricoId: 'inc-beta', ambito: 'obbligatorie' })).http === 403);
    verifica('la bozza vuole la sua area', (await chiama('marta@studio.it', { azione: 'bozza-leggi', incaricoId: 'inc-alfa', ambito: 'boh' })).http === 400);
    let sv = await bz('marta@studio.it', { azione: 'bozza-salva', base: 0, bozza: { righe: righeB, date: { 'pc-n-scad': '2027-06-01', 'x y': '2027-06-01', 'pc-n-bil': 'oggi' }, s1: true, s2: false, aperte: ['banca', 'legale', 'cliente'] } });
    let lb = await bozzaDiMarta();
    verifica('bozza salvata, anche con una riga a meta\'', sv.ok && sv.versione === 1 && lb.righe.length === 2 && lb.righe[1].nome === 'Studio a metà' && lb.righe[1].pec === '', lb && lb.righe);
    verifica('quello che non e\' dell\'area o non e\' una data viene scartato', lb.aperte.join() === 'banca,legale' && lb.s2 === false && lb.date['pc-n-scad'] === '2027-06-01' && lb.date['pc-n-bil'] === '' && !('x y' in lb.date), lb);
    verifica('la bozza di Marta non e\' quella di Luca', (await bz('luca@studio.it', { azione: 'bozza-leggi' })).bozza === null);
    verifica('ne\' quella dell\'altra area', (await chiama('marta@studio.it', { azione: 'bozza-leggi', incaricoId: 'inc-alfa', ambito: 'clientiFornitori' })).bozza === null);
    const pezzoB = n => PDFB.slice(n * C.LIMITI.pezzoByte, (n + 1) * C.LIMITI.pezzoByte).toString('base64');
    verifica('un file che non e\' un PDF non entra in bozza', (await bz('marta@studio.it', { azione: 'bozza-pdf', riga: 'r1', nome: 'x.pdf', dimensione: 2000, n: 0, dati: Buffer.alloc(2000, 65).toString('base64') })).http === 400 && !(await bozzaDiMarta()).pdf.r1);
    verifica('un PDF troppo grande non entra in bozza', (await bz('marta@studio.it', { azione: 'bozza-pdf', riga: 'r1', nome: 'x.pdf', dimensione: C.LIMITI.pdfMaxByte + 1, n: 0, dati: '' })).http === 413);
    let up = await bz('marta@studio.it', { azione: 'bozza-pdf', riga: 'r1', nome: 'bozza.pdf', dimensione: PDFB.length, n: 0, dati: pezzoB(0) });
    verifica('primo pezzo: il PDF e\' in arrivo, non ancora pronto', up.ok && up.completo === false && (await bozzaDiMarta()).pdf.r1.pronto === false);
    verifica('finche\' non e\' completo non si riapre', (await bz('marta@studio.it', { azione: 'bozza-pdf-leggi', riga: 'r1', n: 0 })).http === 404);
    up = await bz('marta@studio.it', { azione: 'bozza-pdf', riga: 'r1', nome: 'bozza.pdf', dimensione: PDFB.length, n: 1, dati: pezzoB(1) });
    lb = await bozzaDiMarta();
    verifica('PDF completo sul portale, e la versione delle righe non cambia', up.ok && up.completo === true && lb.pdf.r1.pronto === true && lb.pdf.r1.byte === PDFB.length && lb.versione === 1, lb.pdf);
    const p0 = await bz('marta@studio.it', { azione: 'bozza-pdf-leggi', riga: 'r1', n: 0 }), p1 = await bz('marta@studio.it', { azione: 'bozza-pdf-leggi', riga: 'r1', n: 1 });
    verifica('da un altro computer il PDF si riapre identico', p0.ok && p0.pezzi === 2 && p0.nome === 'bozza.pdf' && Buffer.concat([Buffer.from(p0.dati, 'base64'), Buffer.from(p1.dati, 'base64')]).equals(PDFB));
    verifica('il PDF della bozza di Marta non lo apre Luca', (await bz('luca@studio.it', { azione: 'bozza-pdf-leggi', riga: 'r1', n: 0 })).http === 404);
    sv = await bz('marta@studio.it', { azione: 'bozza-salva', base: 1, bozza: { righe: [righeB[0], Object.assign({}, righeB[1], { pec: 'studio@pec.it' })] } });
    verifica('secondo salvataggio: versione 2, il PDF resta', sv.ok && sv.versione === 2 && (await bozzaDiMarta()).pdf.r1.pronto === true);
    const conflitto = await bz('marta@studio.it', { azione: 'bozza-salva', base: 1, bozza: { righe: [righeB[0]] } });
    verifica('chi salva da una versione superata viene fermato, e niente si perde', conflitto.ok === false && conflitto.conflitto === true && conflitto.versione === 2 && conflitto.http === 200 && (await bozzaDiMarta()).righe.length === 2, conflitto);
    await bz('marta@studio.it', { azione: 'bozza-pdf', riga: 'r2', nome: 'studio.pdf', dimensione: PDFP.length, n: 0, dati: PDFP.toString('base64') });
    verifica('un PDF piccolo sale in un pezzo solo', (await bozzaDiMarta()).pdf.r2.pronto === true && chiaviBozze(/\/pdf\/r2~/).length === 1);
    // al posto del PDF lungo se ne carica uno corto: il pezzo in piu' non resta
    await bz('marta@studio.it', { azione: 'bozza-pdf', riga: 'r1', nome: 'corto.pdf', dimensione: PDFP.length, n: 0, dati: PDFP.toString('base64') });
    verifica('cambiando il PDF di una riga i pezzi di prima non restano', chiaviBozze(/\/pdf\/r1~/).length === 1 && (await bozzaDiMarta()).pdf.r1.nome === 'corto.pdf');
    for (let n = 0; n < 2; n++) await bz('marta@studio.it', { azione: 'bozza-pdf', riga: 'r1', nome: 'bozza.pdf', dimensione: PDFB.length, n: n, dati: pezzoB(n) });
    sv = await bz('marta@studio.it', { azione: 'bozza-salva', base: 2, bozza: { righe: [righeB[0]] } });
    lb = await bozzaDiMarta();
    verifica('tolta una riga, se ne va anche il suo PDF', sv.ok && sv.versione === 3 && !lb.pdf.r2 && chiaviBozze(/\/pdf\/r2~/).length === 0 && chiaviBozze(/\/pdf\/r1~/).length === 2);
    // l'invio: la lettera prende il PDF dalla bozza, senza che risalga dal browser
    const cr = await chiama('marta@studio.it', { azione: 'crea', incaricoId: 'inc-alfa', destinatario: 'Banca Bozza S.p.A.', pec: 'bozza@pec.it', categoria: 'banca', bilancio: '2026-12-31', scadenza: C.aggiungiGiorni(C.giornoRoma(), 10), allegatoNome: 'bozza.pdf', allegatoDimensione: PDFB.length });
    verifica('la bozza di un altro non serve a niente', (await bz('luca@studio.it', { azione: 'allegato-da-bozza', id: cr.id, riga: 'r1' })).http === 404);
    verifica('una riga senza PDF non fa partire la lettera', (await bz('marta@studio.it', { azione: 'allegato-da-bozza', id: cr.id, riga: 'r9' })).http === 404 && (await scheda(cr.id)).stato === 'bozza');
    const ab = await bz('marta@studio.it', { azione: 'allegato-da-bozza', id: cr.id, riga: 'r1' });
    s = await scheda(cr.id);
    verifica('la lettera prende il PDF dalla bozza ed entra in coda', ab.ok && ab.completo === true && s.stato === 'coda' && s.allegato.sha256 === crypto.createHash('sha256').update(PDFB).digest('hex') && (await DATI.leggiAllegato(db, cr.id, s.allegato.pezzi)).equals(PDFB), ab);
    verifica('la riga inviata esce dalla bozza; vuota, la bozza non resta', ab.versione === 0 && (await bozzaDiMarta()) === null && chiaviBozze().length === 0, chiaviBozze());
    // con i dati dell'incarico se ne vanno anche le bozze di chi ci lavorava
    await bz('marta@studio.it', { azione: 'bozza-salva', base: 0, bozza: { righe: [righeB[0]] } });
    await bz('marta@studio.it', { azione: 'bozza-pdf', riga: 'r1', nome: 'studio.pdf', dimensione: PDFP.length, n: 0, dati: PDFP.toString('base64') });
    await chiama('luca@studio.it', { azione: 'bozza-salva', incaricoId: 'inc-alfa', ambito: 'clientiFornitori', base: 0, bozza: { righe: [{ id: 'k1', categoria: 'cliente', nome: 'Cliente in bozza', pec: 'c@pec.it', saldo: '1.200,00' }] } });
    await chiama('luca@studio.it', { azione: 'bozza-salva', incaricoId: 'inc-beta', ambito: 'obbligatorie', base: 0, bozza: { righe: [{ id: 'b1', categoria: 'banca', nome: 'Banca di Beta', pec: 'beta@pec.it' }] } });
    verifica('tre bozze: due persone, due aree, due incarichi', chiaviBozze(/^circBozze\/[^/]+$/).length === 3);
    verifica('svuotare la bozza la toglie', (await chiama('luca@studio.it', { azione: 'bozza-togli', incaricoId: 'inc-alfa', ambito: 'clientiFornitori' })).ok && chiaviBozze(/^circBozze\/[^/]+$/).length === 2);
    await chiama('luca@studio.it', { azione: 'bozza-salva', incaricoId: 'inc-alfa', ambito: 'clientiFornitori', base: 0, bozza: { righe: [{ id: 'k1', categoria: 'cliente', nome: 'Cliente in bozza', pec: 'c@pec.it' }] } });
    const canc2 = await chiama('a.missori@emvas.tax', { azione: 'cancella-incarico', incaricoId: 'inc-alfa', conferma: 'CANCELLA' });
    verifica('cancellato l\'incarico, le sue bozze (righe e PDF) non restano; quelle degli altri si\'', canc2.ok && canc2.tolte === 1 && chiaviBozze().length === 1 && dati.get(chiaviBozze()[0]).incaricoId === 'inc-beta', chiaviBozze());

    // ---------- 12c. il registro delle operazioni ----------
    const registro = (azione, filtro) => [...dati.keys()].filter(k => /^circRegistro\//.test(k)).map(k => dati.get(k)).filter(v => (!azione || v.azione === azione) && (!filtro || filtro(v)));
    const inCodaA1 = registro('lettera-in-coda', v => v.invio === a1.id)[0];
    verifica('una lettera messa in coda: chi, per chi, quale PDF', !!inCodaA1 && inCodaA1.da === 'marta@studio.it' && inCodaA1.incaricoId === 'inc-alfa' && inCodaA1.cliente === 'ALFA MECCANICA SRL' && inCodaA1.pec === 'banca@pec.it' && inCodaA1.ambito === 'obbligatorie' && /caricato dal computer/.test(inCodaA1.dettaglio) && inCodaA1.dati.sha256.length === 64 && inCodaA1.titolo === 'Lettera preparata e messa in coda', inCodaA1);
    const inCodaCr = registro('lettera-in-coda', v => v.invio === cr.id)[0];
    verifica('quella partita dalla bozza dice che il PDF viene da li\', con la sua impronta', !!inCodaCr && /preso dalla bozza/.test(inCodaCr.dettaglio) && inCodaCr.dati.sha256 === crypto.createHash('sha256').update(PDFB).digest('hex') && inCodaCr.dati.byte === PDFB.length);
    verifica('una lettera in bozza (mai arrivata in coda) non lascia la voce, una per ogni lettera in coda', registro('lettera-in-coda', v => v.invio === c1.id).length === 1 && registro('lettera-in-coda', v => v.invio === c2.id).length === 1 && registro('lettera-in-coda').every(v => v.invio && v.codice && v.da));
    const modReg = registro('solleciti-modificati', v => v.invio === c1.id)[0];
    verifica('date dei solleciti: resta scritto prima e dopo, e chi le ha cambiate', !!modReg && modReg.da === 'luca@studio.it' && modReg.ambito === 'clientiFornitori' && modReg.campi.length === 2 && modReg.campi[0].campo === 'Primo sollecito' && /20\/02\/2027/.test(modReg.campi[0].dopo) && modReg.campi[1].dopo === 'non previsto', modReg);
    verifica('una modifica rifiutata non lascia voci', registro('solleciti-modificati', v => v.invio === c1.id).length === 1);
    verifica('annullata una lettera in coda, e annullati i solleciti di una partita', registro('lettera-annullata', v => v.invio === c2.id && v.da === 'anna@studio.it').length === 1 && registro('solleciti-annullati', v => v.invio === c1.id && v.campi.length === 1 && /annullato/.test(v.campi[0].dopo)).length === 1);
    verifica('risposta a mano segnata (con la nota) e poi tolta', registro('risposta-manuale', v => v.invio === c1.id && /consegnata a mano al team/.test(v.dettaglio) && v.campi.some(x => /fermo/.test(x.dopo))).length === 1 && registro('risposta-manuale-tolta', v => v.invio === c1.id && /luca@studio.it/.test(v.dettaglio)).length === 1);
    const reinv = registro('lettera-reinviata')[0];
    verifica('reinvio: l\'indirizzo di prima e quello di dopo', !!reinv && reinv.campi[0].campo === 'PEC' && reinv.campi[0].prima !== reinv.campi[0].dopo && reinv.pec === reinv.campi[0].dopo, reinv);
    verifica('risposta associata a mano: quale messaggio, a quale lettera, da chi', registro('risposta-associata').length >= 1 && registro('risposta-associata').every(v => v.invio && /Messaggio di /.test(v.dettaglio) && v.da === 'a.missori@emvas.tax'), registro('risposta-associata'));
    verifica('errori spuntati e riaperti: con il titolo dell\'errore', registro('errore-risolto').length >= 2 && registro('errore-risolto', v => v.da === 'sara@studio.it' && /Errore di prova/.test(v.dettaglio)).length === 1 && registro('errore-riaperto').length === 1);
    verifica('supervisori e destinatari degli avvisi: solo i cambi riusciti', registro('supervisori').length === 1 && registro('supervisori')[0].campi[0].prima === 'nessuno' && registro('supervisori')[0].campi[0].dopo === 'sara@studio.it' && registro('avvisi-errori').length === 1 && registro('avvisi-errori')[0].campi[0].dopo === 'sì');
    const cancReg = registro('incarico-cancellato', v => v.incaricoId === 'inc-alfa').sort((x, y) => x.quando - y.quando);
    verifica('cancellati i dati di un incarico: nel registro resta il riepilogo di ogni lettera tolta', cancReg.length === 2 && cancReg[0].da === 'a.missori@emvas.tax' && cancReg[0].lettere.length === 3 && cancReg[0].lettere.every(l => l.codice && l.destinatario && l.pec && l.preparataDa && l.inviataIl > 0 && l.rispostaIl > 0) && cancReg[0].lettere.some(l => l.sollecito1Il > 0) && /3 lettere tolte/.test(cancReg[0].dettaglio), cancReg[0]);
    verifica('e delle bozze non inviate tolte con lui', cancReg[1].lettere.length === 1 && cancReg[1].lettere[0].codice === cr.codice && /2 bozze non inviate tolte/.test(cancReg[1].dettaglio), cancReg[1] && cancReg[1].dettaglio);
    verifica('le voci dell\'incarico cancellato restano, le lettere no', (await scheda(cr.id)) === null && registro(null, v => v.incaricoId === 'inc-alfa').length >= 7);
    verifica('una bozza svuotata lascia la voce, i salvataggi automatici no', registro('bozza-svuotata').length === 1 && registro('bozza-svuotata')[0].da === 'luca@studio.it' && registro('bozza-svuotata')[0].ambito === 'clientiFornitori' && /1 riga non inviata/.test(registro('bozza-svuotata')[0].dettaglio), registro('bozza-svuotata'));
    // chi lo legge
    const regAlfa = await chiama('marta@studio.it', { azione: 'registro', incaricoId: 'inc-alfa' });
    verifica('chi segue un incarico ne legge il registro, dal piu\' recente', regAlfa.ok && regAlfa.voci.length === registro(null, v => v.incaricoId === 'inc-alfa').length && regAlfa.voci.every((v, i) => v.incaricoId === 'inc-alfa' && (i === 0 || regAlfa.voci[i - 1].quando >= v.quando)) && regAlfa.voci[0].azione === 'incarico-cancellato' && regAlfa.voci[0].lettere.length === 1, regAlfa.voci && regAlfa.voci.length);
    verifica('non quello di un incarico che non segue, ne\' quello generale', (await chiama('marta@studio.it', { azione: 'registro', incaricoId: 'inc-beta' })).http === 403 && (await chiama('marta@studio.it', { azione: 'registro' })).http === 403);
    let paginaReg = await chiama('sara@studio.it', { azione: 'registro', limite: 5 });
    const voceLetta = {};
    let sfogliate = 0;
    verifica('chi vede tutto legge il registro generale, una pagina per volta', paginaReg.ok && paginaReg.voci.length === 5 && paginaReg.altre === true && paginaReg.prima > 0 && paginaReg.voci.every((v, i) => i === 0 || paginaReg.voci[i - 1].quando >= v.quando));
    while (paginaReg.ok && sfogliate++ < 60) {
        paginaReg.voci.forEach(v => { voceLetta[v.id] = 1; });
        if (!paginaReg.altre) break;
        paginaReg = await chiama('sara@studio.it', { azione: 'registro', limite: 5, prima: paginaReg.prima });
    }
    verifica('sfogliandolo tutto non si perde nessuna voce', Object.keys(voceLetta).length === registro().length, [Object.keys(voceLetta).length, registro().length]);
    verifica('nel registro generale ci sono anche le voci senza incarico (impostazioni, errori)', (await chiama('a.missori@emvas.tax', { azione: 'registro', limite: 500 })).voci.some(v => v.azione === 'supervisori' && !v.incaricoId));
    // se la voce non si riesce a scrivere l'azione vale lo stesso, e chi amministra lo viene a sapere
    const collVera = db.collection;
    db.collection = nome => (nome === 'circRegistro' ? { doc: () => ({ set: async () => { throw new Error('registro giu\''); } }) } : collVera(nome));
    const senzaReg = await chiama('anna@studio.it', { azione: 'risposta-manuale', id: c1.id, nota: 'registro spento' });
    db.collection = collVera;
    const erroreReg = [...dati.keys()].filter(k => /^circErrori\//.test(k)).map(k => dati.get(k)).filter(e => /non è stata scritta nel registro/.test(e.titolo || '') && e.stato === 'aperto');
    verifica('registro non scrivibile: l\'azione riesce lo stesso e nasce un errore da controllare', senzaReg.ok && (await scheda(c1.id)).risposta.nota === 'registro spento' && erroreReg.length === 1 && /risposta-manuale/.test(erroreReg[0].dettaglio), erroreReg);
    await chiama('a.missori@emvas.tax', { azione: 'errore-risolvi', ids: (await chiama('a.missori@emvas.tax', { azione: 'errori' })).aperti.map(x => x.id) });
    await chiama('anna@studio.it', { azione: 'risposta-manuale', id: c1.id, togli: true });

    // ---------- 12d. la pagina degli incarichi si apre in fretta, anche con tanti incarichi ----------
    // Luca nel team di altri 300 incarichi (4 dei quali con lettere): le letture non devono crescere con gli incarichi
    const tanti = incarichi.concat(Array.from({ length: 300 }, (_, i) => ({ id: 'inc-x' + i, cliente: 'SOCIETA ' + i + ' SRL', stato: 'attivo', respIncarico: i % 3 ? 'Verdi' : 'Bianchi', qualita: i % 5 ? 'Neri' : 'Bianchi', team: 'Bianchi' })));
    dati.set('archivio/incarichi', { json: JSON.stringify(tanti) });
    await chiama('a.missori@emvas.tax', { azione: 'stato' });          // i conteggi lasciati da rifare dalle prove di prima
    for (let i = 0; i < 4; i++) await nuova('luca@studio.it', 'inc-x' + i, { destinatario: 'Banca ' + i, pec: 'banca' + i + '@pec.it' });
    F.letture.azzera();
    const stTanti = await chiama('luca@studio.it', { azione: 'stato' });
    const lettureStato = { documenti: F.letture.documenti, raccolte: F.letture.raccolte };
    verifica('chi segue 300 incarichi li vede tutti, con i conteggi di quelli che hanno lettere', stTanti.ok && stTanti.incarichi.length === 302 && stTanti.incarichi.filter(i => i.conteggi && i.conteggi.totale === 1).length === 4 && stTanti.incarichi.find(i => i.id === 'inc-x0').ruoli.join() === 'responsabile,qualita,team', stTanti.incarichi && stTanti.incarichi.length);
    // utenza, impostazioni, due anagrafiche, giro, lettore; la raccolta dei conteggi; piu' le 4 schede segnate da rifare
    verifica('e la pagina si apre con poche letture, non una per incarico', lettureStato.documenti <= 8 && lettureStato.raccolte <= 1 + 4, lettureStato);
    F.letture.azzera();
    await chiama('luca@studio.it', { azione: 'stato' });
    verifica('la seconda volta ancora meno: i conteggi sono gia\' fatti', F.letture.documenti <= 8 && F.letture.raccolte === 1, { documenti: F.letture.documenti, raccolte: F.letture.raccolte });
    avanti(GIORNO);
    F.letture.azzera();
    const stDomani = await chiama('luca@studio.it', { azione: 'stato' });
    verifica('il giorno dopo si rifanno solo i conteggi degli incarichi con lettere ancora senza risposta', stDomani.ok && F.letture.raccolte <= 1 + 4 && F.letture.documenti <= 8, { documenti: F.letture.documenti, raccolte: F.letture.raccolte });
    F.letture.azzera();
    const stAdmin = await chiama('a.missori@emvas.tax', { azione: 'stato' });
    verifica('anche per chi vede tutto: poche letture, qualunque sia il numero degli incarichi', stAdmin.ok && stAdmin.incarichi.length === 302 && F.letture.documenti <= 10 && F.letture.raccolte <= 3, { documenti: F.letture.documenti, raccolte: F.letture.raccolte });
    for (let i = 0; i < 4; i++) await chiama('a.missori@emvas.tax', { azione: 'cancella-incarico', incaricoId: 'inc-x' + i, conferma: 'CANCELLA' });
    dati.set('archivio/incarichi', { json: JSON.stringify(incarichi) });

    // ---------- 13. pulizie ----------
    const bozza = await chiama('anna@studio.it', { azione: 'crea', incaricoId: 'inc-beta', destinatario: 'Mai finita', pec: 'mai@pec.it', categoria: 'altro', bilancio: '2026-12-31', scadenza: C.aggiungiGiorni(C.giornoRoma(), 5), allegatoNome: 'x.pdf', allegatoDimensione: 5000 });
    verifica('una bozza non compare in elenco', bozza.ok && !(await chiama('anna@studio.it', { azione: 'elenco', incaricoId: 'inc-beta' })).schede.some(x => x.id === bozza.id));
    avanti(2 * GIORNO);
    await DATI.pulizia(db, Date.now(), 20);
    verifica('la bozza rimasta a meta\' viene tolta', (await scheda(bozza.id)) === null);
    verifica('una bozza di nuove lettere ferma da due giorni resta', (await BOZZE.pulizia(db, Date.now(), 20)) === 0 && chiaviBozze().length === 1);
    avanti(40 * GIORNO);
    await DATI.pulizia(db, Date.now(), 50);
    verifica('ferma da piu\' di trenta giorni, si toglie', (await BOZZE.pulizia(db, Date.now(), 20)) === 1 && chiaviBozze().length === 0);
    s = await scheda(b1.id);
    verifica('dopo un mese il PDF e\' ancora sul portale', s && !s.allegato.tolto && [...dati.keys()].some(k => k.indexOf('circInvii/' + b1.id + '/') === 0));
    alle('2028-01-12T10:00:00+01:00');       // la lettera di BETA era stata preparata l'11 gennaio 2027
    await DATI.pulizia(db, Date.now(), 50);
    s = await scheda(b1.id);
    verifica('a 365 giorni dalla preparazione il PDF si toglie, la scheda resta', s && s.allegato.tolto > 0 && s.stato === 'risposta' && s.risposte.length === 1 && ![...dati.keys()].some(k => k.indexOf('circInvii/' + b1.id + '/') === 0));
    s = await scheda(c1.id);
    verifica('una lettera preparata dopo (1 febbraio) il suo PDF lo ha ancora', s && !s.allegato.tolto);
    verifica('il giro programmato a riposo non spedisce e non prende il lucchetto', (await chiama('x', {}, 'GET', { authorization: 'Bearer cron' })).invii.esito === 'niente da spedire');
    // le pulizie del giro tolgono dei dati: quando tolgono qualcosa resta scritto nel registro, a nome del servizio
    await chiama('luca@studio.it', { azione: 'bozza-salva', incaricoId: 'inc-beta', ambito: 'obbligatorie', base: 0, bozza: { righe: [{ id: 'z1', categoria: 'banca', nome: 'Banca dimenticata', pec: 'dim@pec.it' }] } });
    const primaPulizie = registro('pulizie').length;
    avanti(31 * GIORNO);
    const giroPulizie = await chiama('x', {}, 'GET', { authorization: 'Bearer cron' });
    verifica('pulizie automatiche: nel registro, a nome del servizio', giroPulizie.bozzeTolte === 1 && registro('pulizie').length === primaPulizie + 1 && registro('pulizie').slice(-1)[0].da === 'servizio' && /1 bozza ferma/.test(registro('pulizie').slice(-1)[0].dettaglio), [giroPulizie.bozzeTolte, registro('pulizie').length]);

    console.log('\ncircolarizzazioni: ' + passate + ' verifiche passate' + (fallite ? ', ' + fallite + ' FALLITE' : ''));
    process.exit(fallite ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
