/* ============================================================
   PROVE - incarichi "per conto di", altre caselle PEC, lettere
   mandate da altri soggetti, risposte inoltrate
   ------------------------------------------------------------
       node prove/circ-caselle.prove.js

   Niente da installare e niente rete: Firestore, il server di
   posta e le caselle PEC sono finti (prove/circ-finti.js), il
   codice provato e' quello vero.

   COSA DIMOSTRANO
     - l'amministratore (e i supervisori) indicano per conto di chi si
       lavora su un incarico, da quale casella partono le lettere e a
       chi inoltrare le risposte; il team no; tutto resta nel registro;
     - le lettere di quell'incarico partono dall'altra casella e a nome
       di chi ha la revisione legale (testo, mittente, anteprima); le
       altre dalla casella dello studio, come sempre;
     - ricevute e risposte si leggono nella casella giusta, anche
       quando le due caselle danno lo stesso numero a due messaggi;
       scaricarle apre la casella giusta;
     - la risposta si inoltra per email agli indirizzi indicati, con
       gli allegati veri e il messaggio originale, una volta sola, e
       resta scritto sulla lettera e nel registro;
     - un rifiuto del gestore su una casella non ferma le lettere
       dell'altra;
     - le lettere mandate da un altro soggetto (la societa' di
       revisione, il collegio, il revisore del gruppo) si registrano
       senza PEC ne' PDF, non partono, e se ne segna la risposta;
     - cambiare l'impostazione vale per le lettere nuove: quelle gia'
       partite restano sulla loro casella, solleciti compresi.
   ============================================================ */
'use strict';

const F = require('./circ-finti');
F.orologioFinto('2027-01-11T10:00:00+01:00');
const { dati, db, posta, notizie, associare, inoltri, ricevuta, risposta, avanti, altreCaselle, aperture, stato } = F;
const COLLEGIO = 'collegio.alfa@pec.it';
Object.assign(process.env, { CIRC_PEC2_USER: COLLEGIO, CIRC_PEC2_PASS: 'altra-segreta', CIRC_PEC2_NOME: 'PEC del collegio sindacale di Alfa' });
const MIN = 60000, ORA = 60 * MIN, GIORNO = 24 * ORA;

const C = require('../lib/circ-comune');
const DATI = require('../lib/circ-dati');
const GIRO = require('../lib/circ-giro');
const api = require('../api/circolarizzazioni');

const persone = [
    { id: 'p1', nome: 'Rossi', nomeProprio: 'Marta', email: 'marta@studio.it', attivo: true },
    { id: 'p2', nome: 'Bianchi', nomeProprio: 'Luca', email: 'luca@studio.it', attivo: true },
    { id: 'p3', nome: 'Verdi', nomeProprio: 'Anna', email: 'anna@studio.it', attivo: true }
];
const incarichi = [
    { id: 'inc-alfa', cliente: 'ALFA MECCANICA SRL', stato: 'attivo', respIncarico: 'Verdi', team: 'Rossi' },
    { id: 'inc-beta', cliente: 'BETA TESSILE SPA', stato: 'attivo', respIncarico: 'Verdi', team: 'Rossi' }
];
dati.set('archivio/incarichi', { json: JSON.stringify(incarichi) });
dati.set('archivio/persone', { json: JSON.stringify(persone) });
['marta', 'luca', 'anna'].forEach(n => dati.set('utenti/' + n + '@studio.it', { nome: n, ruolo: 'procuratore', attivo: true }));
dati.set('utenti/admin@studio.it', { nome: 'Amministratore', ruolo: 'admin', attivo: true });

let passate = 0, fallite = 0;
function verifica(cosa, condizione, dettaglio) {
    if (condizione) { passate++; return; }
    fallite++;
    console.error('  NO  ' + cosa + (dettaglio !== undefined ? '\n        ' + JSON.stringify(dettaglio).slice(0, 700) : ''));
}
async function chiama(chi, corpo, metodo, intestazioni) {
    let st = 200, r = null;
    const res = { setHeader() { }, status(s) { st = s; return res; }, json(j) { r = j; return res; }, end() { return res; } };
    await api({ method: metodo || 'POST', headers: intestazioni || {}, body: Object.assign({ idToken: chi }, corpo) }, res);
    return Object.assign({ http: st }, r);
}
const giroProgrammato = () => chiama(null, {}, 'GET', { authorization: 'Bearer cron' });
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2000, 65)]);
async function nuova(chi, incaricoId, campi) {
    const oggi = C.giornoRoma();
    const r = await chiama(chi, Object.assign({
        azione: 'crea', incaricoId: incaricoId, destinatario: 'Banca di Prova S.p.A.', pec: 'banca@pec.it', categoria: 'banca',
        bilancio: '2026-12-31', scadenza: C.aggiungiGiorni(oggi, 10),
        sollecito1: { data: C.aggiungiGiorni(oggi, 11), scadenza: C.aggiungiGiorni(oggi, 18) },
        allegatoNome: 'Lettera banca.pdf', allegatoDimensione: PDF.length
    }, campi));
    if (!r.ok || r.esterna) return r;
    const u = await chiama(chi, { azione: 'allegato', id: r.id, n: 0, dati: PDF.toString('base64') });
    return Object.assign({}, r, u);
}
const scheda = id => DATI.leggi(db, id);
const rifDi = m => String(m.messageId).replace(/[<>]/g, '');
const registro = azione => [...dati.keys()].filter(k => /^circRegistro\//.test(k)).map(k => dati.get(k)).filter(v => v.azione === azione);
const ALFA = { tipo: 'collegio', nome: 'Collegio sindacale di ALFA MECCANICA SRL', casella: 'pec2', inoltro: ['presidente@collegio.it', 'Sindaco2@collegio.it'] };

(async () => {
    /* ============ 1. le caselle ============ */
    verifica('due caselle: quella dello studio e quella in più', C.caselle().map(x => x.id).join() === 'studio,pec2', C.caselle().map(x => x.id));
    verifica('la casella in più ha il suo indirizzo e il suo nome', C.configurazione('pec2').mittente === COLLEGIO && C.configurazione('pec2').etichetta === 'PEC del collegio sindacale di Alfa');
    verifica('una casella sconosciuta vale quella dello studio', C.idCasella('pec7') === 'pec2' ? false : C.idCasella('xyz') === 'studio');
    verifica('la casella in più eredita host e porte di Aruba', C.configurazione('pec2').smtpHost === 'smtps.pec.aruba.it' && C.configurazione('pec2').imapPorta === 993);
    verifica('all\'area non vanno le credenziali', JSON.stringify(C.caselle().map(C.casellaBreve)).indexOf('altra-segreta') < 0);

    let st = await chiama('admin@studio.it', { azione: 'stato' });
    verifica('l\'amministratore vede le caselle', st.ok && (st.caselle || []).length === 2 && st.caselle[1].indirizzo === COLLEGIO, st.caselle);
    verifica('e i tipi di committente e di chi altro invia', (st.tipiCommittente || []).length === 4 && (st.tipiEsterni || []).length === 4);
    const stMarta = await chiama('marta@studio.it', { azione: 'stato' });
    verifica('il team non riceve l\'elenco delle caselle', stMarta.ok && !stMarta.caselle);

    /* ============ 2. per conto di chi ============ */
    let r = await chiama('marta@studio.it', { azione: 'committente', incaricoId: 'inc-alfa', committente: ALFA });
    verifica('il team non imposta per conto di chi si lavora', r.http === 403);
    for (const [cosa, x] of [['tipo sbagliato', { tipo: 'boh', nome: 'Qualcuno' }], ['nome troppo corto', { tipo: 'collegio', nome: 'X' }],
        ['casella non configurata', Object.assign({}, ALFA, { casella: 'pec5' })], ['indirizzo per l\'inoltro sbagliato', Object.assign({}, ALFA, { inoltro: ['non-una-email'] })],
        ['troppi indirizzi', Object.assign({}, ALFA, { inoltro: ['a@x.it', 'b@x.it', 'c@x.it', 'd@x.it', 'e@x.it', 'f@x.it'] })]]) {
        r = await chiama('admin@studio.it', { azione: 'committente', incaricoId: 'inc-alfa', committente: x });
        verifica('rifiutato: ' + cosa, r.http === 400, r);
    }
    verifica('i rifiuti non lasciano voci nel registro', registro('committente').length === 0);
    r = await chiama('admin@studio.it', { azione: 'committente', incaricoId: 'inc-alfa', committente: ALFA });
    verifica('l\'amministratore imposta il committente', r.ok && r.committente.casella === 'pec2' && r.committente.casellaIndirizzo === COLLEGIO, r);
    verifica('gli indirizzi per l\'inoltro in minuscolo e senza doppioni', r.committente && r.committente.inoltro.join() === 'presidente@collegio.it,sindaco2@collegio.it', r.committente);
    const vc = registro('committente');
    verifica('resta nel registro, con il prima e il dopo', vc.length === 1 && vc[0].da === 'admin@studio.it' && vc[0].campi.some(c => c.campo === 'Casella PEC da cui partono le lettere' && c.dopo === COLLEGIO), vc);
    st = await chiama('marta@studio.it', { azione: 'stato' });
    const incA = st.incarichi.find(i => i.id === 'inc-alfa'), incB = st.incarichi.find(i => i.id === 'inc-beta');
    verifica('il team vede per conto di chi lavora e da quale casella', incA.committente && incA.committente.nome === ALFA.nome && incA.committente.casellaIndirizzo === COLLEGIO && incA.committente.nomeTipo === 'Collegio sindacale', incA);
    verifica('l\'altro incarico resta dello studio', !incB.committente);

    /* ============ 3. il testo della PEC ============ */
    const ant = await chiama('marta@studio.it', { azione: 'anteprima', incaricoId: 'inc-alfa', destinatario: 'Banca X', categoria: 'banca', bilancio: '2026-12-31' });
    verifica('anteprima: a nome del collegio', ant.ok && ant.html.indexOf(ALFA.nome) >= 0 && ant.testo.indexOf('Soggetto incaricato della revisione legale: ' + ALFA.nome) >= 0, ant.testo);
    verifica('anteprima: Revilaw non si presenta come revisore', ant.testo.indexOf('Revilaw S.p.A. è la società incaricata') < 0 && ant.testo.indexOf('direttamente a Revilaw') < 0 && ant.html.indexOf('REVILAW S.p.A.') < 0, ant.testo);
    verifica('anteprima: si risponde alla casella del collegio', ant.testo.indexOf(COLLEGIO) >= 0 && ant.da.indexOf(COLLEGIO) >= 0, ant.da);
    const antB = await chiama('marta@studio.it', { azione: 'anteprima', incaricoId: 'inc-beta', destinatario: 'Banca X', categoria: 'banca', bilancio: '2026-12-31' });
    verifica('anteprima dello studio: come sempre', antB.testo.indexOf('Revilaw S.p.A. è la società incaricata') >= 0 && antB.testo.indexOf('circolarizzazionirevilaw@pec.it') >= 0);

    /* ============ 4. le lettere partono dalla casella giusta ============ */
    const la = await nuova('marta@studio.it', 'inc-alfa', { destinatario: 'Banca Uno', pec: 'uno@pec.it' });
    const lb = await nuova('marta@studio.it', 'inc-beta', { destinatario: 'Banca Due', pec: 'due@pec.it' });
    verifica('lettere preparate', la.ok && lb.ok, [la, lb]);
    let sa = await scheda(la.id), sb = await scheda(lb.id);
    verifica('la lettera dell\'incarico per conto del collegio porta la casella e il nome', sa.casella === 'pec2' && sa.committente && sa.committente.nome === ALFA.nome, sa);
    verifica('quella dello studio no', sb.casella === undefined && !sb.committente);
    const pa0 = posta.length;
    r = await chiama('marta@studio.it', { azione: 'avvia' });
    const pecA = posta.slice(pa0).find(m => m.to === 'uno@pec.it'), pecB = posta.slice(pa0).find(m => m.to === 'due@pec.it');
    verifica('partite tutte e due', r.ok && pecA && pecB, r);
    verifica('la PEC del collegio parte dalla sua casella e a suo nome', pecA._casella === COLLEGIO && pecA.from === '"' + ALFA.nome + '" <' + COLLEGIO + '>', pecA && [pecA._casella, pecA.from]);
    verifica('con il testo a suo nome', pecA.text.indexOf('Soggetto incaricato della revisione legale: ' + ALFA.nome) >= 0 && pecA.text.indexOf('Revilaw S.p.A. è la società incaricata') < 0, pecA.text);
    verifica('il riferimento del messaggio ha il dominio della sua casella', /@pec\.it$/.test(rifDi(pecA)));
    verifica('la PEC dello studio parte come sempre', pecB._casella === 'circolarizzazionirevilaw@pec.it' && /Revilaw S\.p\.A\./.test(pecB.from) && pecB.text.indexOf('Revilaw S.p.A. è la società incaricata') >= 0, pecB && pecB.from);
    verifica('prima di spedire dalla casella in più, la si è letta', dati.has('meta/circLettore~pec2') && !!dati.get('meta/circLettore~pec2').uidValidity && aperture.indexOf(COLLEGIO) >= 0);

    /* ============ 5. ricevute e risposte nella casella giusta ============ */
    // le due caselle danno gli stessi numeri: la ricevuta del collegio ha lo stesso uid di un messaggio dello studio
    ricevuta('accettazione', rifDi(pecB), {});
    ricevuta('accettazione', rifDi(pecA), { casella: COLLEGIO });
    ricevuta('avvenuta-consegna', rifDi(pecA), { casella: COLLEGIO, consegna: 'uno@pec.it' });
    r = await chiama('marta@studio.it', { azione: 'controlla' });
    sa = await scheda(la.id); sb = await scheda(lb.id);
    verifica('lette tutte e due le caselle', r.ok && r.ricevute === 3, r);
    verifica('la lettera del collegio: accettata e consegnata', sa.stato === 'consegnata' && sa.passi.primo.accettata && sa.passi.primo.consegnata, sa.passi.primo);
    verifica('i suoi messaggi hanno la chiave della casella', (sa.messaggi || []).length === 2 && sa.messaggi.every(m => /^pec2~/.test(m.chiave)), sa.messaggi);
    verifica('quelli dello studio no', (sb.messaggi || []).length === 1 && /^777_/.test(sb.messaggi[0].chiave));
    const uidA = sa.messaggi[0].uid, uidB = sb.messaggi[0].uid;
    verifica('stesso numero nelle due caselle, nessuna confusione', uidA === uidB && dati.has('circMessaggi/777_' + uidB) && dati.has('circMessaggi/pec2~777_' + uidA), [uidA, uidB]);
    // la ricevuta arriva per email a chi ha inviato, con il file preso dalla casella del collegio
    const n0 = notizie.length;
    await giroProgrammato();
    const conFile = notizie.slice(n0).find(m => (m.attachments || []).some(a => String(a.filename).indexOf('Ricevuta di consegna') >= 0 && String(a.filename).indexOf('Banca Uno') >= 0));
    const msgConsegna = altreCaselle[COLLEGIO].find(m => m.uid === sa.messaggi[1].uid);
    verifica('la ricevuta del collegio arriva a chi ha inviato, con il file giusto', !!conFile && conFile.attachments.some(a => Buffer.compare(Buffer.from(a.content), msgConsegna.sorgente) === 0), notizie.slice(n0).map(m => (m.attachments || []).map(a => a.filename)));

    // la risposta del terzo, nella casella del collegio
    const rispA = risposta({ da: 'uno@pec.it', oggetto: 'R: ' + pecA.subject, inRisposta: rifDi(pecA), casella: COLLEGIO, testo: 'Confermiamo il saldo di 1.234,56 euro.' });
    await chiama('marta@studio.it', { azione: 'controlla' });
    sa = await scheda(la.id);
    verifica('risposta abbinata alla lettera del collegio', sa.stato === 'risposta' && sa.risposte.length === 1 && sa.risposte[0].casella === 'pec2' && /^pec2~/.test(sa.risposte[0].chiave), sa.risposte);
    verifica('i solleciti si fermano', sa.passi.sollecito1.stato === 'bloccato');
    // scaricare e leggere aprono la casella del collegio
    const ap0 = aperture.length;
    const all = sa.risposte[0].allegati[0];
    const sc = await chiama('marta@studio.it', { azione: 'scarica', id: la.id, chiave: sa.risposte[0].chiave, parte: all.parte });
    verifica('l\'allegato si scarica dalla casella del collegio', sc.ok && aperture.slice(ap0).every(u => u === COLLEGIO) && Buffer.from(sc.dati, 'base64').equals(rispA.parti['2.2']), [sc.ok, aperture.slice(ap0)]);
    const lt = await chiama('marta@studio.it', { azione: 'leggi', id: la.id, chiave: sa.risposte[0].chiave });
    verifica('e il testo si legge', lt.ok && lt.testo.indexOf('1.234,56') >= 0, lt);
    const elencoA = await chiama('marta@studio.it', { azione: 'elenco', incaricoId: 'inc-alfa' });
    const perArea = elencoA.schede.find(x => x.id === la.id);
    verifica('all\'area: casella, committente e inoltro (ancora da fare)', perArea.casella === 'pec2' && perArea.casellaIndirizzo === COLLEGIO && perArea.committente.nome === ALFA.nome && perArea.risposte[0].inoltrata === null, perArea);

    /* ============ 6. l'inoltro della risposta al collegio ============ */
    const inoltriInCoda = [...dati.keys()].filter(k => /^circInoltri\//.test(k));
    verifica('la risposta è in coda per l\'inoltro', inoltriInCoda.length === 1 && dati.get(inoltriInCoda[0]).stato === 'attesa');
    const i0 = inoltri.length;
    await giroProgrammato();
    const em = inoltri.slice(i0);
    verifica('una email di inoltro', em.length === 1, em.map(m => m.subject));
    const e1 = em[0] || {};
    verifica('agli indirizzi del collegio', e1.to === 'presidente@collegio.it, sindaco2@collegio.it', e1.to);
    verifica('con l\'oggetto che dice di che cosa si tratta', /^Circolarizzazione ALFA MECCANICA SRL: risposta di Banca Uno \(rif\. RVL-/.test(e1.subject), e1.subject);
    const pdfAll = (e1.attachments || []).find(a => a.filename === 'Risposta firmata.pdf');
    verifica('con l\'allegato vero, decodificato', !!pdfAll && Buffer.from(pdfAll.content).equals(rispA.pdf), (e1.attachments || []).map(a => a.filename));
    const eml = (e1.attachments || []).find(a => /\.eml$/.test(a.filename));
    verifica('e il messaggio originale con la firma del gestore', !!eml && Buffer.from(eml.content).equals(rispA.sorgente));
    verifica('con il testo della risposta e chi l\'ha preparata per le repliche', e1.text.indexOf('1.234,56') >= 0 && e1.replyTo === 'marta@studio.it', [e1.replyTo]);
    sa = await scheda(la.id);
    verifica('resta scritto sulla risposta', sa.risposte[0].inoltrata && sa.risposte[0].inoltrata.a.length === 2 && sa.risposte[0].inoltrata.file === 2, sa.risposte[0].inoltrata);
    verifica('e nel registro', registro('risposta-inoltrata').length === 1 && /presidente@collegio\.it/.test(registro('risposta-inoltrata')[0].dettaglio));
    await giroProgrammato();
    verifica('non si inoltra una seconda volta', inoltri.length === i0 + 1);
    // la stessa risposta tolta e rimessa sulla stessa lettera: non riparte
    const chiaveR = sa.risposte[0].chiave;
    await chiama('admin@studio.it', { azione: 'risposta-dissocia', id: la.id, chiave: chiaveR });
    const naDissociata = (await chiama('admin@studio.it', { azione: 'non-associate' })).messaggi.find(m => m.chiave === chiaveR);
    verifica('rimessa fra le non associate, con la sua casella', naDissociata && naDissociata.casella === 'PEC del collegio sindacale di Alfa', naDissociata);
    await chiama('admin@studio.it', { azione: 'associa', id: la.id, chiave: chiaveR });
    await giroProgrammato();
    verifica('riassociata alla stessa lettera: niente secondo inoltro', inoltri.length === i0 + 1);

    /* ============ 7. una PEC non associata nella casella del collegio ============ */
    const ignota = risposta({ da: 'sconosciuto@pec.it', oggetto: 'Comunicazione', casella: COLLEGIO });
    await chiama('marta@studio.it', { azione: 'controlla' });
    const na = (await chiama('admin@studio.it', { azione: 'non-associate' })).messaggi.find(m => m.da === 'sconosciuto@pec.it');
    verifica('non associata, con la casella in cui è arrivata', na && na.casella === 'PEC del collegio sindacale di Alfa' && /^pec2~/.test(na.chiave), na);
    const a0 = associare.length;
    await giroProgrammato();
    const segn = associare.slice(a0)[0];
    verifica('segnalata allo studio, con il messaggio preso dalla casella del collegio', segn && (segn.attachments || []).some(a => Buffer.from(a.content).equals(ignota.sorgente)), segn && segn.subject);

    /* ============ 8. un rifiuto su una casella non ferma l'altra ============ */
    const la2 = await nuova('marta@studio.it', 'inc-alfa', { destinatario: 'Banca Tre', pec: 'tre@pec.it' });
    const lb2 = await nuova('marta@studio.it', 'inc-beta', { destinatario: 'Banca Quattro', pec: 'quattro@pec.it' });
    stato.rifiuta = m => m._casella === COLLEGIO ? Object.assign(new Error('554 5.7.1 Indirizzo IP bloccato temporaneamente per sospetto abuso'), { responseCode: 554 }) : null;
    const pb0 = posta.length;
    r = await chiama('marta@studio.it', { azione: 'avvia' });
    verifica('la lettera dello studio parte', posta.slice(pb0).some(m => m.to === 'quattro@pec.it'), posta.slice(pb0).map(m => m.to));
    verifica('quella del collegio resta in coda', (await scheda(la2.id)).stato === 'coda');
    const mg = dati.get('meta/circGiro');
    verifica('la pausa è della sola casella del collegio', (mg.caselle.pec2.sospesoFino || 0) > Date.now() && !(mg.sospesoFino > Date.now()), [mg.sospesoFino, mg.caselle]);
    verifica('l\'avviso dice quale casella', r.msg.indexOf('PEC del collegio sindacale di Alfa') >= 0, r.msg);
    verifica('e l\'errore è della casella del collegio', dati.has('circErrori/' + require('crypto').createHash('sha1').update('server~invii-sospesi~pec2').digest('hex').slice(0, 32)) || [...dati.keys()].some(k => /^circErrori\//.test(k) && dati.get(k).chiave === 'server~invii-sospesi~pec2'));
    const gs = await GIRO.stato(db);
    verifica('lo stato del giro lo dice per casella', gs.caselle.pec2.sospesoFino > Date.now() && gs.sospesoFino === 0, gs.caselle);
    // la pausa finisce, il gestore riapre: parte
    stato.rifiuta = null;
    avanti(15 * MIN);
    await chiama('marta@studio.it', { azione: 'avvia' });
    verifica('finita la pausa, la lettera del collegio parte dalla sua casella', (await scheda(la2.id)).stato !== 'coda' && posta.some(m => m.to === 'tre@pec.it' && m._casella === COLLEGIO));
    verifica('e la pausa si azzera', !((dati.get('meta/circGiro').caselle.pec2 || {}).sospesoFino > Date.now()));

    /* ============ 9. le lettere mandate da altri soggetti ============ */
    const oggi = C.giornoRoma();
    const est = campi => chiama('marta@studio.it', Object.assign({ azione: 'crea', incaricoId: 'inc-alfa', destinatario: 'Cliente Gruppo S.p.A.', categoria: 'banca', bilancio: '2026-12-31' }, campi));
    r = await est({ esterna: { tipo: 'gruppo' } });
    verifica('revisore del gruppo senza nome: rifiutata', r.http === 400 && /nome/.test(r.msg), r);
    r = await est({ esterna: { tipo: 'altro', nome: 'Beta Audit' }, pec: 'non-valida' });
    verifica('una PEC scritta male si rifiuta anche qui', r.http === 400, r);
    const pc0 = posta.length;
    const e1r = await est({ esterna: { tipo: 'gruppo', nome: 'EY S.p.A.' } });
    const e2r = await est({ esterna: { tipo: 'collegio' }, destinatario: 'Fornitore Due S.r.l.', pec: '' });
    verifica('registrate senza PEC, PDF ne\' date', e1r.ok && e1r.esterna && e2r.ok, [e1r, e2r]);
    const se = await scheda(e1r.id);
    verifica('la lettera di altri: in attesa, senza coda né allegato', se.stato === 'esterna' && se.prossimo === null && se.allegato === null && se.esterna.nome === 'EY S.p.A.' && se.casella === undefined, se);
    verifica('resta nel registro chi la manda', registro('lettera-esterna').some(v => v.invio === e1r.id && /EY S\.p\.A\./.test(v.dettaglio)));
    await chiama('marta@studio.it', { azione: 'avvia' });
    await giroProgrammato();
    verifica('non parte nessuna PEC per loro', posta.slice(pc0).every(m => m.to !== '' && m.to !== undefined) && !posta.slice(pc0).some(m => /Cliente Gruppo|Fornitore Due/.test(m.text || '')));
    let el = await chiama('marta@studio.it', { azione: 'elenco', incaricoId: 'inc-alfa' });
    verifica('i conteggi le contano a parte', el.conteggi.esterne === 2 && el.conteggi.esterneRicevute === 0, el.conteggi);
    r = await chiama('marta@studio.it', { azione: 'risposta-manuale', id: e1r.id, nota: 'Ricevuta da EY il 20/01' });
    verifica('se ne segna la risposta arrivata', r.ok && r.scheda.stato === 'risposta' && r.scheda.risposta.modo === 'manuale', r);
    verifica('e resta nel registro', registro('risposta-manuale').some(v => v.invio === e1r.id && /EY S\.p\.A\./.test(v.dettaglio)));
    el = await chiama('marta@studio.it', { azione: 'elenco', incaricoId: 'inc-alfa' });
    verifica('i conteggi lo dicono', el.conteggi.esterneRicevute === 1 && el.conteggi.esterne === 2, el.conteggi);
    r = await chiama('marta@studio.it', { azione: 'annulla', id: e1r.id });
    verifica('con la risposta segnata non si annulla', r.http === 409, r);
    r = await chiama('marta@studio.it', { azione: 'annulla', id: e2r.id });
    verifica('senza, si annulla', r.ok && r.scheda.stato === 'annullata', r);
    r = await chiama('marta@studio.it', { azione: 'solleciti', id: e1r.id, sollecito1: { data: C.aggiungiGiorni(oggi, 3), scadenza: C.aggiungiGiorni(oggi, 6) } });
    verifica('niente solleciti per una lettera di altri', !r.ok, r);

    /* ============ 10. cambiare il committente vale per le lettere nuove ============ */
    r = await chiama('admin@studio.it', { azione: 'committente', incaricoId: 'inc-alfa', committente: null });
    verifica('il committente si toglie', r.ok && r.committente === null && registro('committente').length >= 2);
    st = await chiama('marta@studio.it', { azione: 'stato' });
    verifica('l\'incarico torna dello studio', !st.incarichi.find(i => i.id === 'inc-alfa').committente);
    const la3 = await nuova('marta@studio.it', 'inc-alfa', { destinatario: 'Banca Cinque', pec: 'cinque@pec.it' });
    const pd0 = posta.length;
    await chiama('marta@studio.it', { azione: 'avvia' });
    const pec5 = posta.slice(pd0).find(m => m.to === 'cinque@pec.it');
    verifica('la lettera nuova parte dalla casella dello studio, a nome di Revilaw', pec5 && pec5._casella === 'circolarizzazionirevilaw@pec.it' && pec5.text.indexOf('Revilaw S.p.A. è la società incaricata') >= 0);
    verifica('quella già partita resta della casella del collegio', (await scheda(la2.id)).casella === 'pec2' && (await scheda(la3.id)).casella === undefined);
    // il sollecito della lettera partita dal collegio parte dal collegio, a suo nome
    const s2 = await scheda(la2.id);
    F.alle(new Date(C.istanteRoma(s2.passi.sollecito1.data, '09:00') + 5 * MIN).toISOString());
    const ps0 = posta.length;
    await giroProgrammato();
    const sol = posta.slice(ps0).find(m => m.to === 'tre@pec.it');
    verifica('il sollecito parte dalla casella da cui è partita la lettera', sol && sol._casella === COLLEGIO && /^SOLLECITO/.test(sol.subject) && sol.from.indexOf(ALFA.nome) >= 0, sol && [sol._casella, sol.subject, sol.from]);

    /* ============ 11. la bozza ricorda chi invia ============ */
    r = await chiama('marta@studio.it', { azione: 'bozza-salva', incaricoId: 'inc-alfa', ambito: 'obbligatorie', base: 0, bozza: { righe: [{ id: 'r1abc', categoria: 'banca', nome: 'Banca Gruppo', chi: 'gruppo', chiNome: 'PwC S.p.A.' }, { id: 'r2abc', categoria: 'banca', nome: 'Banca Nostra', chi: 'inventato' }] } });
    const bz = await chiama('marta@studio.it', { azione: 'bozza-leggi', incaricoId: 'inc-alfa', ambito: 'obbligatorie' });
    const righe = (bz.bozza || {}).righe || [];
    verifica('la bozza conserva chi invia ogni riga', r.ok && righe.find(x => x.id === 'r1abc').chi === 'gruppo' && righe.find(x => x.id === 'r1abc').chiNome === 'PwC S.p.A.' && righe.find(x => x.id === 'r2abc').chi === '', righe);

    console.log('\ncaselle e per conto di: ' + passate + ' verifiche passate' + (fallite ? ', ' + fallite + ' FALLITE' : ''));
    process.exit(fallite ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
