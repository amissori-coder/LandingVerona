/* ============================================================
   PROVE - il Revisore riceve dal servizio solo i dati dei suoi
   incarichi
   ------------------------------------------------------------
       node prove/revisore.prove.js

   Firestore e l'autenticazione sono finti (gli stessi delle prove
   delle circolarizzazioni): non serve niente di installato.

   COSA DIMOSTRANO. A chi ha il ruolo Revisore il database non
   consegna piu' nessun archivio (lo dicono le regole Firestore,
   provate a parte sull'emulatore: scripts/regole/prova-regole.cjs).
   I dati glieli prepara il servizio, e qui si prova che gli arrivano
   SOLO quelli dei suoi incarichi; che le poche cose che scrive
   (registro, richieste di correzione, firma) portano la sua firma
   messa dal servizio e non toccano il resto; che nessun altro ruolo
   usa questa porta; e che le altre porte del servizio non lo fanno
   uscire dal suo perimetro.
   ============================================================ */
'use strict';
const F = require('./circ-finti');
const { dati, db } = F;
const adminFinto = require('firebase-admin');
const REVISORE = require('../lib/revisore');
const N = require('../lib/nomi-incarichi');
const ABILITA = require('../lib/abilita-utente');
const CIRC = require('../lib/circ-dati');
const { utenteEffettivo } = require('../lib/utente-effettivo');
const api = require('../api/revisore');
const apiAbilita = require('../api/abilita-utente');

let passate = 0, fallite = 0;
function verifica(cosa, condizione, dettaglio) {
    if (condizione) { passate++; return; }
    fallite++;
    console.error('  NO  ' + cosa + (dettaglio !== undefined ? '\n        ' + JSON.stringify(dettaglio).slice(0, 700) : ''));
}
async function chiama(chi, corpo, porta) {
    let stato = 200, risposta = null;
    const res = { setHeader() { }, status(s) { stato = s; return res; }, json(j) { risposta = j; return res; }, end() { return res; } };
    await (porta || api)({ method: 'POST', headers: {}, body: Object.assign(chi === null ? {} : { idToken: chi }, corpo) }, res);
    return Object.assign({ http: stato }, risposta);
}
const archivio = nome => JSON.parse(dati.get('archivio/' + nome).json);
const metti = (nome, valore) => dati.set('archivio/' + nome, { json: JSON.stringify(valore) });
const utente = (email, campi) => dati.set('utenti/' + email, Object.assign({ nome: email.split('@')[0], attivo: true }, campi));

// l'autenticazione finta sa solo verificare un gettone: per la prova della protezione servono anche gli account
const accountFinti = new Map();
{
    const vera = adminFinto.auth;
    adminFinto.auth = () => Object.assign(vera(), {
        createUser: async u => { const uid = 'uid-' + (accountFinti.size + 1); accountFinti.set(uid, u); return { uid: uid }; },
        createCustomToken: async uid => 'gettone-di-' + uid,
        deleteUser: async uid => { if (!accountFinti.has(uid)) throw new Error('non c\'è'); accountFinti.delete(uid); }
    });
}

// ---------- lo studio di prova ----------
const persone = [
    { id: 'p1', nome: 'Rossi', nomeProprio: 'Mario', email: 'Mario.Rossi@studio.it', telefono: '333 1111111', indirizzo: 'via Roma 1', attivo: true, team: true },
    { id: 'p2', nome: 'Rossi', nomeProprio: 'Luca', email: 'luca.rossi@studio.it', telefono: '333 2222222', attivo: true, team: true },      // omonimo: NON e' lui
    { id: 'p3', nome: 'Bianchi', nomeProprio: 'Anna', email: 'anna@studio.it', telefono: '333 3333333', indirizzo: 'via Po 3', attivo: true, team: true },
    { id: 'p4', nome: 'Verdi', nomeProprio: 'Elena', email: 'elena@studio.it', telefono: '333 4444444', attivo: true, equityPartner: true, respIncarico: true },
    { id: 'p5', nome: 'Neri', nomeProprio: 'Ugo', email: 'ugo@studio.it', telefono: '333 5555555', attivo: true, coordinatore: true, regioniCoordinate: ['Lazio'], qualita: true },
    { id: 'p6', nome: 'Gialli', nomeProprio: 'Ivo', email: 'ivo@studio.it', telefono: '333 6666666', attivo: true, respIncarico: true },     // non lavora con lui
    { id: 'p7', nome: 'Blu', nomeProprio: 'Paola', email: 'paola@studio.it', telefono: '333 7777777', attivo: true, team: true },            // un'altra revisora
    { id: 'p8', nome: 'Viola', nomeProprio: 'Piero', email: 'piero@studio.it', attivo: true, equityPartner: true },                           // equity partner che non lavora con lui
    { id: 'p9', nome: 'Grigi', nomeProprio: 'Ada', email: 'ada@studio.it', attivo: true, viceCoordinatore: true, regioniCoordinate: ['Veneto'] },
    { id: 'p10', nome: 'Bianchi', nomeProprio: 'Zeno', email: 'zeno@studio.it', telefono: '333 9999999', attivo: false, team: true },          // omonimo disattivato di una collega
    { id: 'p11', nome: 'Senzaincarichi', nomeProprio: 'Sara', email: 'sara@studio.it', attivo: true, team: true },
    { id: 'p12', nome: 'Doppia', nomeProprio: 'Dora', email: 'dora@studio.it', attivo: false },                                                  // due schede con la stessa email:
    { id: 'p13', nome: 'Doppia', nomeProprio: 'Dora', email: 'dora@studio.it', attivo: true, team: true }                                      // vale la attiva
];
const incarichi = [
    { id: 'inc1', cliente: 'Alfa Srl', regione: 'Lazio', stato: 'attivo', team: 'Rossi Mario, Bianchi', respIncarico: 'Verdi', qualita: 'Neri', compenso: 12000 },
    { id: 'inc2', cliente: 'Beta Spa', regione: 'Veneto', stato: 'attivo', team: 'Rossi Luca', respIncarico: 'Gialli', compenso: 9000 },          // dell'omonimo
    { id: 'inc3', cliente: 'Gamma Srl', regione: 'Veneto', stato: 'attivo', team: 'Blu', respIncarico: 'Gialli', compenso: 7000 },
    { id: 'inc4', cliente: 'Alfa Srl', regione: 'Lazio', stato: 'attivo', team: 'Blu; Doppia', respIncarico: 'Verdi', compenso: 3000 },          // STESSO cliente di inc1, ma non suo
    { id: 'inc5', cliente: 'Delta Srl', regione: 'Lazio', stato: 'cessato', referente: 'Rossi Mario', team: 'Bianchi', compenso: 5000 },             // suo: e' il referente
    { id: 'inc6', cliente: 'Epsilon Spa', regione: 'Puglia', stato: 'attivo', coordinatore: 'Rossi Mario', respIncarico: 'Verdi', compenso: 4000 } // suo: e' il coordinatore
];
const MIEI = ['inc1', 'inc5', 'inc6'];
metti('persone', persone);
metti('incarichi', incarichi);
metti('fattureStato', { 'inc1|2026|annuale|1': 'emessa', 'inc1|2026|p|2': 'incassata', 'inc2|2026|annuale|1': 'emessa', 'inc3|2026|annuale|1': 'da emettere', 'inc5|2025|annuale|1': 'incassata', 'inc4|2026|annuale|1': 'emessa' });
const firmaMario = 'mario.rossi <mario.rossi@studio.it>';
metti('audit', [
    { id: 'a1', ts: 900, utente: 'Admin <admin@studio.it>', azione: 'Incarico modificato', entita: 'incarico', rif: 'inc1', cliente: 'Alfa Srl', dettagli: [{ campo: 'Compenso', prima: '1', dopo: '2' }] },
    { id: 'a2', ts: 890, utente: 'Admin <admin@studio.it>', azione: 'Incarico modificato', entita: 'incarico', rif: 'inc4', cliente: 'Alfa Srl', dettagli: 'compenso segreto di un altro incarico' },
    { id: 'a3', ts: 880, utente: 'Admin <admin@studio.it>', azione: 'Stato fattura aggiornato', entita: 'fattura', rif: 'inc2|2026|annuale|1', cliente: 'Beta Spa', dettagli: null },
    { id: 'a4', ts: 870, utente: 'Admin <admin@studio.it>', azione: 'Stato fattura aggiornato', entita: 'fattura', rif: 'inc5|2025|annuale|1', cliente: 'Delta Srl', dettagli: null },
    { id: 'a5', ts: 860, utente: firmaMario, azione: 'Accesso effettuato', entita: 'utente', rif: 'mario.rossi@studio.it', cliente: null, dettagli: null },
    { id: 'a6', ts: 850, utente: 'luca.rossi <luca.rossi@studio.it>', azione: 'Accesso effettuato', entita: 'utente', rif: 'luca.rossi@studio.it', cliente: null, dettagli: null },
    { id: 'a7', ts: 840, utente: 'Admin <admin@studio.it>', azione: 'Persona modificata', entita: 'persona', rif: 'p6', cliente: null, dettagli: [{ campo: 'Telefono', prima: '', dopo: '333 6666666' }] },
    { id: 'a8', ts: 830, utente: 'Admin <admin@studio.it>', azione: 'Controllo qualità aggiornato', entita: 'controlloQualita', rif: 'cq1', cliente: 'Alfa Srl', dettagli: null },
    { id: 'a9', ts: 820, utente: 'Admin <admin@studio.it>', azione: 'Controllo qualità aggiornato', entita: 'controlloQualita', rif: 'cq3', cliente: 'Gamma Srl', dettagli: null },
    { id: 'a10', ts: 810, utente: 'paola <paola@studio.it>', azione: 'Richiesta di correzione inviata', entita: 'richiesta', rif: 'r2', cliente: 'Alfa Srl', dettagli: null },
    { id: 'a11', ts: 800, utente: 'Admin <admin@studio.it>', azione: 'Utente abilitato', entita: 'utente', rif: 'mario.rossi@studio.it', cliente: null, dettagli: null }
]);
metti('controlliQualita', [
    { id: 'cq-config', config: true, anni: [2025, 2026], modificato: { da: 'Admin <admin@studio.it>', il: 1 } },
    { id: 'cq1', incaricoId: 'inc1', anno: 2026, cliente: 'Alfa Srl', note: 'scheda sua' },
    { id: 'cq3', incaricoId: 'inc3', anno: 2026, cliente: 'Gamma Srl', note: 'scheda di altri' },
    { id: 'cq4', incaricoId: 'inc4', anno: 2026, cliente: 'Alfa Srl', note: 'stesso cliente, altro incarico' }
]);
const richiestaDiPaola = {
    id: 'r2', oggetto: 'Compenso sbagliato', ambito: 'incarico', incaricoId: 'inc4', cliente: 'Alfa Srl', regione: 'Veneto',
    richiedente: { email: 'paola@studio.it', nome: 'Paola Blu' }, destinatario: { email: 'elena@studio.it', nome: 'Elena Verdi' }, conoscenza: [],
    stato: 'aperta', creato: 10, aggiornato: 10, messaggi: [{ id: 'm1', ts: 10, autore: { email: 'paola@studio.it', nome: 'Paola Blu' }, tipo: 'richiesta', testo: 'riservato a Paola' }], invii: []
};
metti('richieste', [
    { id: 'r1', oggetto: 'Regione errata', ambito: 'incarico', incaricoId: 'inc1', cliente: 'Alfa Srl', regione: 'Lazio',
        richiedente: { email: 'mario.rossi@studio.it', nome: 'Mario Rossi' }, destinatario: { email: 'elena@studio.it', nome: 'Elena Verdi' }, conoscenza: [{ email: 'ugo@studio.it', nome: 'Ugo Neri', ruolo: 'Coordinatore territoriale' }],
        stato: 'aperta', creato: 5, aggiornato: 5, messaggi: [{ id: 'm0', ts: 5, autore: { email: 'mario.rossi@studio.it', nome: 'Mario Rossi' }, tipo: 'richiesta', testo: 'la regione è sbagliata' }], invii: [] },
    richiestaDiPaola,
    { id: 'r3', oggetto: 'In copia a Mario', ambito: 'funzione', funzione: 'Altro', regione: '', richiedente: { email: 'anna@studio.it', nome: 'Anna Bianchi' }, destinatario: { email: 'piero@studio.it', nome: 'Piero Viola' },
        conoscenza: [{ email: 'mario.rossi@studio.it', nome: 'Mario Rossi', ruolo: 'Coordinatore territoriale' }], stato: 'presa', creato: 7, aggiornato: 7, messaggi: [{ id: 'm3', ts: 7, autore: { email: 'anna@studio.it', nome: 'Anna Bianchi' }, tipo: 'richiesta', testo: 'x' }], invii: [] }
]);
metti('firmeEmail', { 'mario.rossi@studio.it': { nome: 'Mario Rossi', cellulare: '333 1111111' }, 'paola@studio.it': { nome: 'Paola Blu', cellulare: '333 7777777' } });
metti('comunicazioni', [{ id: 'c1', oggetto: 'Circolare riservata', destinatari: ['tutti@studio.it'] }]);
metti('rating', [{ id: 'rt1', cliente: 'Zeta Spa', esito: 'B' }]);
metti('sondaggi', { 'paola@studio.it': { aree: ['esg'] } });
metti('eventiConfig', { abilitati: ['admin@studio.it'] });

utente('a.missori@emvas.tax', { ruolo: 'procuratore' });
utente('admin@studio.it', { ruolo: 'admin', nome: 'Admin' });
utente('vice@studio.it', { ruolo: 'viceadmin' });
utente('mario.rossi@studio.it', { ruolo: 'revisore' });
utente('paola@studio.it', { ruolo: 'revisore', nome: 'Paola Blu' });
utente('sara@studio.it', { ruolo: 'revisore' });                    // revisora senza incarichi
utente('nessuna.scheda@studio.it', { ruolo: 'revisore' });          // revisore senza scheda in anagrafica
utente('dora@studio.it', { ruolo: 'revisore' });                    // due schede con la stessa email
utente('aiuto@studio.it', { ruolo: 'collaboratore', collaboratoreDi: 'mario.rossi@studio.it', nome: 'Aiuto' });
utente('anna@studio.it', { ruolo: 'procuratore' });
utente('ugo@studio.it', { ruolo: 'coordinatore' });
utente('elena@studio.it', { ruolo: 'qualita' });
utente('ospite@fuori.it', { ruolo: 'sondaggio_compila' });
utente('spento@studio.it', { ruolo: 'revisore', attivo: false });
utente('piero@studio.it', { ruolo: 'revisore', nome: 'Piero Viola' });      // equity partner sulla scheda, entra come revisore

const tutto = o => JSON.stringify(o);

(async () => {
    /* ============ 1. LETTURA: solo i suoi incarichi ============ */
    const m = await chiama('mario.rossi@studio.it', { azione: 'dati' });
    verifica('il revisore riceve i suoi dati', m.http === 200 && m.ok === true, m);
    const A = m.archivi || {};
    verifica('incarichi: solo quelli in cui compare (team, referente, coordinatore)', tutto((A.incarichi || []).map(i => i.id)) === tutto(MIEI), (A.incarichi || []).map(i => i.id));
    verifica('incarichi: l\'incarico dell\'omonimo "Rossi Luca" non è suo', !(A.incarichi || []).some(i => i.id === 'inc2'));
    verifica('incarichi: lo stesso cliente su un altro incarico non basta', !(A.incarichi || []).some(i => i.id === 'inc4'));
    verifica('incarichi: i suoi arrivano per intero', (A.incarichi || [])[0] && A.incarichi[0].compenso === 12000 && A.incarichi[0].respIncarico === 'Verdi');
    verifica('la risposta dice quali sono i suoi', tutto(m.miei) === tutto(MIEI) && m.scheda === 'p1', [m.miei, m.scheda]);
    const sco = tutto(m);
    ['Beta Spa', 'Gamma Srl', 'compenso segreto', 'riservato a Paola', 'Circolare riservata', 'Zeta Spa', '333 2222222', '333 3333333', '333 6666666', '333 7777777', '333 9999999', 'via Po 3', 'ivo@studio.it', 'paola@studio.it', 'luca.rossi@studio.it', 'sara@studio.it', 'stesso cliente, altro incarico', 'scheda di altri', '"esg"']
        .forEach(t => verifica('nella risposta non c\'è «' + t + '»', sco.indexOf(t) < 0));
    verifica('non riceve archivi che non lo riguardano', tutto(Object.keys(A).sort()) === tutto(['audit', 'controlliQualita', 'fattureStato', 'firmeEmail', 'incarichi', 'persone', 'richieste']), Object.keys(A));

    // anagrafica ridotta
    const P = id => (A.persone || []).find(p => p.id === id);
    verifica('persone: la sua scheda per intero', P('p1') && P('p1').telefono === '333 1111111' && P('p1').indirizzo === 'via Roma 1', P('p1'));
    verifica('persone: la collega del suo incarico con nome ed email, senza telefono né indirizzo', P('p3') && P('p3').email === 'anna@studio.it' && P('p3').telefono === undefined && P('p3').indirizzo === undefined, P('p3'));
    verifica('persone: il responsabile del suo incarico (equity partner) con le qualifiche', P('p4') && P('p4').equityPartner === true && P('p4').email === 'elena@studio.it' && P('p4').telefono === undefined, P('p4'));
    verifica('persone: l\'equity partner che non lavora con lui c\'è, per indirizzargli una richiesta', P('p8') && P('p8').email === 'piero@studio.it' && P('p8').equityPartner === true, P('p8'));
    verifica('persone: i coordinatori ci sono, con le regioni (restano in copia sulle richieste)', P('p9') && tutto(P('p9').regioniCoordinate) === tutto(['Veneto']) && P('p5') && tutto(P('p5').regioniCoordinate) === tutto(['Lazio']), [P('p9'), P('p5')]);
    verifica('persone: dell\'omonimo passa solo il nome', P('p2') && P('p2').nomeProprio === 'Luca' && P('p2').email === undefined && P('p2').telefono === undefined, P('p2'));
    verifica('persone: dell\'omonima disattivata di una collega passa solo il nome', P('p10') && P('p10').email === undefined && P('p10').attivo === false, P('p10'));
    verifica('persone: chi non c\'entra non c\'è', !P('p6') && !P('p7') && !P('p11') && !P('p12') && !P('p13'), (A.persone || []).map(p => p.id));
    // l'app rilegge le etichette degli incarichi con l'anagrafica RIDOTTA: deve arrivare alle stesse persone
    {
        const pieno = N.risolutorePersone(persone), ridotto = N.risolutorePersone(A.persone || []);
        const diversi = [];
        (A.incarichi || []).forEach(inc => N.CAMPI_PERSONE.forEach(c => N.dividiNomi(inc[c]).forEach(t => {
            const a = pieno(t), b = ridotto(t);
            if ((a && a.id) !== (b && b.id)) diversi.push([inc.id, c, t, a && a.id, b && b.id]);
        })));
        verifica('con l\'anagrafica ridotta le etichette dei suoi incarichi indicano le stesse persone', diversi.length === 0, diversi);
        const idApp = N.incarichiDellaScheda(A.incarichi || [], ridotto, 'p1').map(i => i.id);
        verifica('l\'app, rifacendo il conto sui dati ricevuti, trova gli stessi incarichi', tutto(idApp) === tutto(MIEI), idApp);
    }
    // le stesse regole dei nomi delle circolarizzazioni (che hanno la loro copia)
    {
        const a = N.risolutorePersone(persone), b = CIRC._interni.risolutorePersone(persone);
        const etichette = ['Rossi', 'Rossi Mario', 'rossi luca', 'Bianchi', 'Bianchi Zeno', 'Verdi', 'Doppia', 'Nessuno', ''];
        verifica('i nomi si risolvono come nelle circolarizzazioni', etichette.every(t => ((a(t) || {}).id) === ((b(t) || {}).id)), etichette.map(t => [t, (a(t) || {}).id, (b(t) || {}).id]));
        verifica('il separatore dei nominativi è lo stesso', tutto(N.dividiNomi('Rossi-Bianchi, Verdi; Neri - Blu')) === tutto(CIRC._interni.dividiNomi('Rossi-Bianchi, Verdi; Neri - Blu')));
    }

    // gli altri archivi
    verifica('fatture: solo le rate dei suoi incarichi', tutto(Object.keys(A.fattureStato || {}).sort()) === tutto(['inc1|2026|annuale|1', 'inc1|2026|p|2', 'inc5|2025|annuale|1']), Object.keys(A.fattureStato || {}));
    verifica('controlli qualità: solo le schede dei suoi incarichi, più gli anni', tutto((A.controlliQualita || []).map(s => s.id)) === tutto(['cq-config', 'cq1']) && tutto(A.controlliQualita[0]) === tutto({ id: 'cq-config', config: true, anni: [2025, 2026] }), A.controlliQualita);
    verifica('registro: le voci dei suoi incarichi e le sue', tutto((A.audit || []).map(v => v.id)) === tutto(['a1', 'a4', 'a5', 'a8']), (A.audit || []).map(v => v.id));
    verifica('richieste: quelle che ha scritto e quelle in cui è in copia', tutto((A.richieste || []).map(r => r.id)) === tutto(['r1', 'r3']), (A.richieste || []).map(r => r.id));
    verifica('firma email: solo la sua', tutto(Object.keys(A.firmeEmail || {})) === tutto(['mario.rossi@studio.it']), A.firmeEmail);

    // gli altri revisori
    const pa = await chiama('paola@studio.it', { azione: 'dati' });
    verifica('un\'altra revisora riceve i SUOI incarichi, non quelli del collega', tutto(pa.archivi.incarichi.map(i => i.id)) === tutto(['inc3', 'inc4']), pa.archivi.incarichi.map(i => i.id));
    verifica('e la sua richiesta, non quelle degli altri', tutto(pa.archivi.richieste.map(r => r.id)) === tutto(['r2']));
    const sa = await chiama('sara@studio.it', { azione: 'dati' });
    verifica('revisora senza incarichi: nessun incarico, nessuna fattura, nessuna scheda di controllo', sa.ok && sa.archivi.incarichi.length === 0 && Object.keys(sa.archivi.fattureStato).length === 0 && sa.archivi.controlliQualita.every(s => s.config), sa.archivi);
    verifica('revisora senza incarichi: in anagrafica la sua scheda e chi riceve le richieste, nessun collega', sa.archivi.persone.some(p => p.id === 'p11' && p.email) && !sa.archivi.persone.some(p => p.telefono && p.id !== 'p11') && !sa.archivi.persone.some(p => p.id === 'p3'), sa.archivi.persone.map(p => p.id));
    const ns = await chiama('nessuna.scheda@studio.it', { azione: 'dati' });
    verifica('revisore senza scheda in anagrafica: non vede alcun incarico (chiuso per difetto)', ns.ok && ns.scheda === null && ns.archivi.incarichi.length === 0 && ns.miei.length === 0, ns);
    const dd = await chiama('dora@studio.it', { azione: 'dati' });
    verifica('due schede con la stessa email: vale quella attiva', dd.scheda === 'p13' && tutto(dd.miei) === tutto(['inc4']), [dd.scheda, dd.miei]);
    const co = await chiama('aiuto@studio.it', { azione: 'dati' });
    verifica('il collaboratore di un revisore riceve i dati del suo riferimento', co.ok && tutto(co.miei) === tutto(MIEI), co.miei);
    verifica('ma non la firma email del riferimento (è personale)', Object.keys(co.archivi.firmeEmail).length === 0, co.archivi.firmeEmail);

    /* ============ 2. CHI NON E' REVISORE NON USA QUESTA PORTA ============ */
    for (const chi of ['admin@studio.it', 'a.missori@emvas.tax', 'anna@studio.it', 'ugo@studio.it', 'elena@studio.it', 'ospite@fuori.it']) {
        const r = await chiama(chi, { azione: 'dati' });
        verifica(chi + ': niente dati da questa porta', r.http === 403 && !r.archivi, r);
        const w = await chiama(chi, { azione: 'salva', archivio: 'audit', upserts: [{ id: 'x-' + chi, azione: 'prova' }] });
        verifica(chi + ': niente scritture da questa porta', w.http === 403, w);
    }
    verifica('utente disabilitato: respinto', (await chiama('spento@studio.it', { azione: 'dati' })).http === 403);
    verifica('utente sconosciuto: respinto', (await chiama('chi.sei@altrove.it', { azione: 'dati' })).http === 403);
    verifica('senza accesso: respinto', (await chiama(null, { azione: 'dati' })).http === 401);
    verifica('sessione scaduta: respinta', (await chiama('scaduto', { azione: 'dati' })).http === 401);
    verifica('azione sconosciuta: respinta', (await chiama('mario.rossi@studio.it', { azione: 'tutto' })).http === 400);
    verifica('niente nel registro è cambiato per i tentativi respinti', archivio('audit').length === 11);

    /* ============ 3. SCRITTURA: registro ============ */
    const prima = { incarichi: dati.get('archivio/incarichi').json, persone: dati.get('archivio/persone').json, fatture: dati.get('archivio/fattureStato').json, cq: dati.get('archivio/controlliQualita').json, com: dati.get('archivio/comunicazioni').json };
    const ora = Date.now();
    let w = await chiama('mario.rossi@studio.it', { azione: 'salva', archivio: 'audit', upserts: [
        { id: 'n1', ts: ora, utente: 'Admin <admin@studio.it>', azione: 'Accesso effettuato', entita: 'utente', rif: 'mario.rossi@studio.it', cliente: null, dettagli: null },
        { id: 'n2', ts: 5, utente: 'chiunque', azione: 'Richiesta di correzione inviata', entita: 'richiesta', rif: 'r1', cliente: 'Alfa Srl', dettagli: [{ campo: 'Oggetto', prima: '', dopo: 'x'.repeat(5000) }] },
        { id: 'a1', ts: ora, azione: 'RISCRITTA', entita: 'incarico', rif: 'inc1' },        // una voce che c'e' gia': non si riscrive
        { id: '', azione: 'senza id' }, { id: 'n3' }, 'non una voce'
    ] });
    verifica('registro: le voci nuove sono accolte', w.http === 200 && w.ok, w);
    let reg = archivio('audit');
    const n1 = reg.find(v => v.id === 'n1'), n2 = reg.find(v => v.id === 'n2');
    verifica('registro: la firma la mette il servizio, non il browser', n1 && n1.utente === firmaMario && n2 && n2.utente === firmaMario, [n1, n2]);
    verifica('registro: un\'ora non credibile viene sostituita con quella del servizio', n1.ts === ora && Math.abs(n2.ts - Date.now()) < 5000, [n1.ts, n2.ts]);
    verifica('registro: i testi troppo lunghi vengono tagliati', n2.dettagli[0].dopo.length === 2000);
    verifica('registro: una voce che c\'è già non si riscrive', reg.find(v => v.id === 'a1').azione === 'Incarico modificato' && reg.filter(v => v.id === 'a1').length === 1);
    verifica('registro: le voci non valide sono scartate, le altre restano tutte', reg.length === 13 && w.rifiutate.length === 3, [reg.length, w.rifiutate]);
    verifica('registro: resta ordinato dalla più recente', reg.every((v, i) => i === 0 || reg[i - 1].ts >= v.ts));
    verifica('registro: la risposta gli riporta solo le sue voci', tutto(w.valore.map(v => v.id).sort()) === tutto(['a1', 'a4', 'a5', 'a8', 'n1', 'n2'].sort()), w.valore.map(v => v.id));
    // il collaboratore: firma del riferimento, e il suo nome a parte
    w = await chiama('aiuto@studio.it', { azione: 'salva', archivio: 'audit', upserts: [{ id: 'n4', ts: Date.now(), azione: 'Accesso effettuato', entita: 'utente' }] });
    const n4 = archivio('audit').find(v => v.id === 'n4');
    verifica('registro: per un collaboratore firma il riferimento e il suo nome resta a parte', n4 && n4.utente === firmaMario && n4.collaboratore === 'Aiuto <aiuto@studio.it>', n4);
    // il freno
    {
        const tante = []; for (let i = 0; i < 30; i++) tante.push({ id: 'f' + i, ts: Date.now(), azione: 'prova', entita: 'utente' });
        let ultima = null;
        for (let giro = 0; giro < 12; giro++) ultima = await chiama('sara@studio.it', { azione: 'salva', archivio: 'audit', upserts: tante.map(v => Object.assign({}, v, { id: v.id + '-' + giro })) });
        const sue = archivio('audit').filter(v => /sara@studio\.it/.test(v.utente)).length;
        verifica('registro: oltre ' + REVISORE._interni.VOCI_AL_GIORNO + ' voci in un giorno il servizio si ferma', sue === REVISORE._interni.VOCI_AL_GIORNO && ultima.rifiutate.length === 30, [sue, ultima.rifiutate.length]);
        verifica('registro: le voci degli altri non vengono spinte fuori', archivio('audit').some(v => v.id === 'a11') && archivio('audit').some(v => v.id === 'a2'));
    }

    /* ============ 4. SCRITTURA: quello che non puo' scrivere ============ */
    for (const nome of ['incarichi', 'persone', 'fattureStato', 'controlliQualita', 'comunicazioni', 'rating', 'ruoli', 'eventiConfig', 'sondaggi', 'utenti', '']) {
        const r = await chiama('mario.rossi@studio.it', { azione: 'salva', archivio: nome, upserts: [{ id: 'inc1', cliente: 'MANOMESSO', compenso: 1 }] });
        verifica('non scrive in «' + (nome || 'vuoto') + '»', r.http === 403, r);
    }
    verifica('incarichi, anagrafica, fatture, controlli e comunicazioni sono rimasti identici',
        prima.incarichi === dati.get('archivio/incarichi').json && prima.persone === dati.get('archivio/persone').json && prima.fatture === dati.get('archivio/fattureStato').json
        && prima.cq === dati.get('archivio/controlliQualita').json && prima.com === dati.get('archivio/comunicazioni').json);

    /* ============ 5. SCRITTURA: richieste di correzione ============ */
    const nuova = (id, extra) => Object.assign({
        id: id, oggetto: 'Compenso da correggere', ambito: 'incarico', incaricoId: 'inc1', cliente: 'INVENTATO', regione: 'Sicilia', campo: 'Compenso',
        richiedente: { email: 'admin@studio.it', nome: 'Finto Admin' }, destinatario: { email: 'elena@studio.it', nome: 'x' }, conoscenza: [{ email: 'spia@fuori.it', nome: 'Spia', ruolo: 'x' }],
        stato: 'risolta', creato: 1, aggiornato: 1, messaggi: [{ id: 'mm-' + id, ts: 1, autore: { email: 'admin@studio.it', nome: 'Finto' }, tipo: 'richiesta', testo: 'il compenso è 13000' }], invii: []
    }, extra);
    w = await chiama('mario.rossi@studio.it', { azione: 'salva', archivio: 'richieste', upserts: [nuova('r10')] });
    let r10 = archivio('richieste').find(r => r.id === 'r10');
    verifica('richiesta nuova su un suo incarico: accolta', w.ok && r10 && w.rifiutate.length === 0, w);
    verifica('richiesta nuova: chi la scrive lo dice il servizio', r10.richiedente.email === 'mario.rossi@studio.it' && r10.messaggi.length === 1 && r10.messaggi[0].autore.email === 'mario.rossi@studio.it', r10);
    verifica('richiesta nuova: cliente e regione sono quelli dell\'incarico, non quelli mandati', r10.cliente === 'Alfa Srl' && r10.regione === 'Lazio' && r10.incaricoId === 'inc1', [r10.cliente, r10.regione]);
    verifica('richiesta nuova: in copia vanno i coordinatori della regione, non chi indica il browser', tutto(r10.conoscenza.map(c => c.email)) === tutto(['ugo@studio.it']), r10.conoscenza);
    verifica('richiesta nuova: parte aperta, con il nome vero del destinatario', r10.stato === 'aperta' && r10.destinatario.nome === 'Elena Verdi' && Math.abs(r10.creato - Date.now()) < 5000, r10);
    w = await chiama('mario.rossi@studio.it', { azione: 'salva', archivio: 'richieste', upserts: [nuova('r14', { invii: [{ il: 77, a: ['elena@studio.it', 'non un indirizzo'], esito: 'ok', msg: '' }, 'x'] })] });
    const r14 = archivio('richieste').find(r => r.id === 'r14');
    verifica('richiesta nuova: se l\'esito dell\'avviso per email arriva insieme, resta scritto', r14 && r14.invii.length === 1 && r14.invii[0].esito === 'ok' && tutto(r14.invii[0].a) === tutto(['elena@studio.it']), r14 && r14.invii);
    w = await chiama('mario.rossi@studio.it', { azione: 'salva', archivio: 'richieste', upserts: [nuova('r11', { incaricoId: 'inc3' })] });
    verifica('richiesta su un incarico NON suo: respinta', w.rifiutate.length === 1 && !archivio('richieste').some(r => r.id === 'r11'), w.rifiutate);
    w = await chiama('mario.rossi@studio.it', { azione: 'salva', archivio: 'richieste', upserts: [nuova('r12', { destinatario: { email: 'anna@studio.it' } })] });
    verifica('richiesta a chi non è equity partner: respinta', w.rifiutate.length === 1 && !archivio('richieste').some(r => r.id === 'r12'), w.rifiutate);
    w = await chiama('mario.rossi@studio.it', { azione: 'salva', archivio: 'richieste', upserts: [nuova('r13', { ambito: 'funzione', funzione: 'Accessi e permessi', incaricoId: 'inc3', regione: 'Veneto' })] });
    const r13 = archivio('richieste').find(r => r.id === 'r13');
    verifica('richiesta su una funzione dell\'area: accolta, senza incarico', r13 && r13.ambito === 'funzione' && r13.incaricoId === null && r13.cliente === '' && r13.regione === 'Veneto' && tutto(r13.conoscenza.map(c => c.email)) === tutto(['ada@studio.it']), r13);
    // sulla richiesta di un'altra persona non mette mano
    w = await chiama('mario.rossi@studio.it', { azione: 'salva', archivio: 'richieste', upserts: [Object.assign({}, richiestaDiPaola, { stato: 'respinta', messaggi: richiestaDiPaola.messaggi.concat([{ id: 'intruso', tipo: 'messaggio', testo: 'ci sono anch\'io' }]) })] });
    verifica('richiesta di un\'altra persona: non la tocca', w.rifiutate.length === 1 && tutto(archivio('richieste').find(r => r.id === 'r2')) === tutto(richiestaDiPaola), w.rifiutate);
    // sulla propria: aggiunge un messaggio, non riscrive quelli che ci sono
    const r1 = archivio('richieste').find(r => r.id === 'r1');
    w = await chiama('mario.rossi@studio.it', { azione: 'salva', archivio: 'richieste', upserts: [Object.assign({}, r1, {
        oggetto: 'OGGETTO CAMBIATO', destinatario: { email: 'mario.rossi@studio.it' }, stato: 'risolta',
        messaggi: [{ id: 'm0', ts: 5, autore: { email: 'elena@studio.it' }, tipo: 'richiesta', testo: 'RISCRITTO' }, { id: 'm9', ts: 1, autore: { email: 'elena@studio.it', nome: 'Finta Elena' }, tipo: 'messaggio', testo: 'aggiungo un dettaglio' },
            { id: 'm10', tipo: 'stato', stato: 'risolta', testo: 'Stato aggiornato: corretta', evento: 'corretta' }],
        invii: [{ il: 123, a: ['mario.rossi@studio.it', 'elena@studio.it'], esito: 'ok', msg: '' }]
    })] });
    let r1d = archivio('richieste').find(r => r.id === 'r1');
    verifica('sua richiesta: il messaggio nuovo entra, firmato da lui', r1d.messaggi.length === 2 && r1d.messaggi[1].id === 'm9' && r1d.messaggi[1].autore.email === 'mario.rossi@studio.it' && r1d.messaggi[1].testo === 'aggiungo un dettaglio', r1d.messaggi);
    verifica('sua richiesta: i messaggi che c\'erano non si riscrivono', r1d.messaggi[0].testo === 'la regione è sbagliata');
    verifica('sua richiesta: oggetto e destinatario non cambiano', r1d.oggetto === 'Regione errata' && r1d.destinatario.email === 'elena@studio.it');
    verifica('sua richiesta: non può segnarla come corretta da sé', r1d.stato === 'aperta' && !r1d.messaggi.some(x => x.tipo === 'stato'), r1d.stato);
    verifica('sua richiesta: l\'esito dell\'avviso per email resta scritto', r1d.invii.length === 1 && r1d.invii[0].esito === 'ok' && r1d.invii[0].a.length === 2, r1d.invii);
    w = await chiama('mario.rossi@studio.it', { azione: 'salva', archivio: 'richieste', upserts: [Object.assign({}, r1d, { messaggi: r1d.messaggi.concat([{ id: 'm11', tipo: 'stato', stato: 'respinta', testo: 'Richiesta ritirata dal richiedente', evento: 'ritirata dal richiedente' }]) })] });
    r1d = archivio('richieste').find(r => r.id === 'r1');
    verifica('sua richiesta: può ritirarla', r1d.stato === 'respinta' && r1d.messaggi[r1d.messaggi.length - 1].tipo === 'stato' && r1d.messaggi[r1d.messaggi.length - 1].autore.email === 'mario.rossi@studio.it', r1d);
    w = await chiama('mario.rossi@studio.it', { azione: 'salva', archivio: 'richieste', upserts: [Object.assign({}, r1d, { messaggi: r1d.messaggi.concat([{ id: 'm12', tipo: 'stato', stato: 'aperta', testo: 'riapro' }]) })] });
    verifica('sua richiesta: una volta chiusa non la riapre da sé', archivio('richieste').find(r => r.id === 'r1').stato === 'respinta');
    // l'equity partner entrato come revisore lavora le richieste indirizzate a lui
    const r3 = archivio('richieste').find(r => r.id === 'r3');
    w = await chiama('piero@studio.it', { azione: 'salva', archivio: 'richieste', upserts: [Object.assign({}, r3, { messaggi: r3.messaggi.concat([{ id: 'm20', tipo: 'stato', stato: 'risolta', testo: 'Stato aggiornato: corretta', evento: 'corretta' }]) })] });
    verifica('chi riceve la richiesta può chiuderla, anche se entra come revisore', archivio('richieste').find(r => r.id === 'r3').stato === 'risolta', w);
    verifica('richieste: quelle degli altri sono rimaste identiche', tutto(archivio('richieste').find(r => r.id === 'r2')) === tutto(richiestaDiPaola));
    verifica('richieste: la risposta gli riporta solo le sue', (await chiama('mario.rossi@studio.it', { azione: 'salva', archivio: 'richieste', upserts: [] })).valore.every(r => r.id !== 'r2'));

    /* ============ 6. SCRITTURA: firma email ============ */
    w = await chiama('mario.rossi@studio.it', { azione: 'salva', archivio: 'firmeEmail', upserts: { 'mario.rossi@studio.it': { nome: 'Mario Rossi', qualifica: 'Revisore legale', mostraNgb: true, oggetto: { x: 1 } }, 'paola@studio.it': { nome: 'MANOMESSA' } } });
    const firme = archivio('firmeEmail');
    verifica('firma: salva la sua', w.ok && firme['mario.rossi@studio.it'].qualifica === 'Revisore legale' && firme['mario.rossi@studio.it'].mostraNgb === true && firme['mario.rossi@studio.it'].oggetto === undefined, firme);
    verifica('firma: quella di un altro non la tocca', firme['paola@studio.it'].nome === 'Paola Blu' && w.rifiutate.length === 1, [firme['paola@studio.it'], w.rifiutate]);
    verifica('firma: la risposta gli riporta solo la sua', tutto(Object.keys(w.valore)) === tutto(['mario.rossi@studio.it']));
    verifica('le scritture portano chi le ha fatte e da dove', dati.get('archivio/firmeEmail').da === 'mario.rossi@studio.it' && dati.get('archivio/firmeEmail').via === 'servizio-revisori');

    /* ============ 7. LE ALTRE PORTE DEL SERVIZIO ============ */
    const ue = email => utenteEffettivo(db, email);
    const amm = await REVISORE.destinatariAmmessi(db, await ue('mario.rossi@studio.it'));
    verifica('email: può scrivere alle persone delle sue richieste e agli equity partner', ['mario.rossi@studio.it', 'elena@studio.it', 'piero@studio.it', 'ugo@studio.it', 'anna@studio.it'].every(e => amm.has(e)), [...amm]);
    verifica('email: non può scrivere a chiunque', !amm.has('paola@studio.it') && !amm.has('cliente@fuori.it') && !amm.has('ivo@studio.it') && !amm.has('luca.rossi@studio.it'), [...amm]);
    const idM = await REVISORE.idIncarichi(db, await ue('mario.rossi@studio.it'));
    verifica('sblocco: i suoi incarichi sono solo i suoi', tutto([...idM]) === tutto(MIEI), [...idM]);
    verifica('chi è revisore lo dice il ruolo effettivo', REVISORE.eRevisore(await ue('mario.rossi@studio.it')) && REVISORE.eRevisore(await ue('aiuto@studio.it')) && !REVISORE.eRevisore(await ue('admin@studio.it')) && !REVISORE.eRevisore(await ue('spento@studio.it')) && !REVISORE.eRevisore(null));

    /* ============ 8. NUOVI ACCESSI: l'elenco lo prepara il servizio ============ */
    const cand = await chiama('piero@studio.it', { azione: 'candidati' }, apiAbilita);
    verifica('nuovi accessi: un equity partner entrato come revisore riceve l\'elenco dal servizio', cand.http === 200 && cand.come === 'equity', cand);
    verifica('nuovi accessi: in elenco chi ha una scheda attiva con email e nessun accesso', tutto(cand.candidati.map(c => c.id).sort()) === tutto(['p2', 'p6', 'p9'].sort()), cand.candidati.map(c => c.id));
    verifica('nuovi accessi: con quanti incarichi e senza telefono', cand.candidati.find(c => c.id === 'p6').incarichi === 2 && cand.candidati.find(c => c.id === 'p2').incarichi === 1 && tutto(cand).indexOf('333') < 0, cand.candidati);
    dati.set('utenti/nuovo@studio.it', { nome: 'Nuovo', ruolo: 'revisore', attivo: true, creato: 5, creatoDa: 'piero@studio.it' });
    const cand2 = await chiama('piero@studio.it', { azione: 'candidati' }, apiAbilita);
    verifica('nuovi accessi: gli accessi abilitati da lui, e solo quelli', tutto(cand2.miei.map(u => u.email)) === tutto(['nuovo@studio.it']) && cand2.miei[0].attivo === true, cand2.miei);
    verifica('nuovi accessi: un revisore senza qualifica non riceve l\'elenco', (await chiama('mario.rossi@studio.it', { azione: 'candidati' }, apiAbilita)).http === 403);
    verifica('nuovi accessi: un collaboratore non riceve l\'elenco', (await chiama('aiuto@studio.it', { azione: 'candidati' }, apiAbilita)).http === 403);
    const candAdmin = await chiama('admin@studio.it', { azione: 'candidati' }, apiAbilita);
    verifica('nuovi accessi: l\'amministratore riceve lo stesso elenco', candAdmin.http === 200 && candAdmin.candidati.length === 3 && candAdmin.miei.length === 0, candAdmin);

    /* ============ 9. LA PROVA DELLA PROTEZIONE ============ */
    for (const chi of ['mario.rossi@studio.it', 'anna@studio.it', 'elena@studio.it', 'ospite@fuori.it', 'aiuto@studio.it']) {
        verifica(chi + ': non lancia la prova della protezione', (await chiama(chi, { azione: 'prova-inizio' })).http === 403);
    }
    const nUtenti = () => [...dati.keys()].filter(k => /^utenti\//.test(k)).length;
    const utentiPrima = nUtenti();
    const pr = await chiama('admin@studio.it', { azione: 'prova-inizio' });
    verifica('prova: l\'amministratore riceve un revisore di prova e il suo gettone', pr.http === 200 && /^prova-protezione-[0-9a-f]+@nextgenerationbusiness\.it$/.test(pr.email) && /^gettone-di-uid-/.test(pr.gettone), pr);
    const schedaProva = dati.get('utenti/' + pr.email);
    verifica('prova: il revisore di prova è un revisore attivo, segnato come prova', schedaProva && schedaProva.ruolo === 'revisore' && schedaProva.attivo === true && schedaProva.provaProtezione === true && schedaProva.creatoDa === 'admin@studio.it', schedaProva);
    const dp = await chiama(pr.email, { azione: 'dati' });
    verifica('prova: il revisore di prova non ha incarichi né scheda', dp.ok && dp.miei.length === 0 && dp.scheda === null);
    // un secondo avvio toglie il primo (browser chiuso a meta')
    const pr2 = await chiama('vice@studio.it', { azione: 'prova-inizio' });
    verifica('prova: una prova rimasta a metà viene tolta alla successiva', pr2.ok && !dati.has('utenti/' + pr.email) && dati.has('utenti/' + pr2.email) && accountFinti.size === 1, [...accountFinti.keys()]);
    // la fine non toglie mai un utente vero
    dati.set('archivio/provaProtezione', { json: '[]' });
    await chiama('admin@studio.it', { azione: 'prova-fine', email: 'mario.rossi@studio.it' });
    await chiama('admin@studio.it', { azione: 'prova-fine', email: 'prova-protezione-finto@nextgenerationbusiness.it' });
    verifica('prova: la chiusura non toglie mai un utente vero', dati.has('utenti/mario.rossi@studio.it') && dati.has('utenti/' + pr2.email));
    verifica('prova: la chiusura toglie il documento di prova', !dati.has('archivio/provaProtezione'));
    verifica('prova: un revisore non può chiuderla', (await chiama('mario.rossi@studio.it', { azione: 'prova-fine', email: pr2.email })).http === 403 && dati.has('utenti/' + pr2.email));
    const fine = await chiama('a.missori@emvas.tax', { azione: 'prova-fine', email: pr2.email });
    verifica('prova: alla fine il revisore di prova non c\'è più, né la scheda né l\'account', fine.ok && !dati.has('utenti/' + pr2.email) && accountFinti.size === 0 && nUtenti() === utentiPrima, [nUtenti(), utentiPrima]);

    console.log('\nrevisore: ' + passate + ' verifiche passate' + (fallite ? ', ' + fallite + ' FALLITE' : ''));
    process.exit(fallite ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
