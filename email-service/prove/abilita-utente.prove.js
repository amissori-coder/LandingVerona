/* ============================================================
   PROVE - i nuovi accessi abilitati da chi non e' amministratore
   ------------------------------------------------------------
       node prove/abilita-utente.prove.js

   Firestore e l'autenticazione sono finti (gli stessi delle prove
   delle circolarizzazioni): non serve niente di installato.

   COSA DIMOSTRANO. Responsabili della qualita', equity partner e
   founding partner possono AGGIUNGERE utenti con i soli ruoli
   Revisore, Coordinatore territoriale e Vice coordinatore, e
   nient'altro: nessun altro ruolo, nessuna modifica a chi c'e' gia',
   nessun potere a chi non ha la qualifica, e solo per chi ha gia' una
   scheda attiva in Aderenti Revilaw. La decisione e' del
   servizio (api/abilita-utente.js): l'app mostra solo i comandi.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const F = require('./circ-finti');
const { dati, db } = F;
const ABILITA = require('../lib/abilita-utente');
const { utenteEffettivo } = require('../lib/utente-effettivo');
const api = require('../api/abilita-utente');

let passate = 0, fallite = 0;
function verifica(cosa, condizione, dettaglio) {
    if (condizione) { passate++; return; }
    fallite++;
    console.error('  NO  ' + cosa + (dettaglio !== undefined ? '\n        ' + JSON.stringify(dettaglio) : ''));
}
async function chiama(chi, corpo, metodo) {
    let stato = 200, risposta = null;
    const res = { setHeader() { }, status(s) { stato = s; return res; }, json(j) { risposta = j; return res; }, end() { return res; } };
    await api({ method: metodo || 'POST', headers: {}, body: Object.assign(chi === null ? {} : { idToken: chi }, corpo) }, res);
    return Object.assign({ http: stato }, risposta);
}
const utente = (email, campi) => dati.set('utenti/' + email, Object.assign({ nome: email.split('@')[0], attivo: true }, campi));
const scheda = email => dati.get('utenti/' + email);
const quanti = () => [...dati.keys()].filter(k => /^utenti\//.test(k)).length;

// ---------- l'anagrafica (archivio/persone) e gli utenti ----------
const persone = [
    { id: 'p1', nome: 'Blu', nomeProprio: 'Elena', email: 'elena@studio.it', attivo: true, equityPartner: true },
    { id: 'p2', nome: 'Viola', nomeProprio: 'Piero', email: 'piero@studio.it', attivo: true, foundingPartner: true },
    { id: 'p3', nome: 'Neri', nomeProprio: 'Ugo', email: 'ugo@studio.it', attivo: true, qualita: true },
    { id: 'p4', nome: 'Rossi', nomeProprio: 'Marta', email: 'marta@studio.it', attivo: true, team: true },
    { id: 'p5', nome: 'Grigi', nomeProprio: 'Ada', email: 'ada@studio.it', attivo: false, equityPartner: true },          // scheda non attiva
    { id: 'p6', nome: 'Bruni', nomeProprio: 'Ivo', email: 'ivo@studio.it', attivo: true, eliminato: true, foundingPartner: true },
    { id: 'p7', nome: 'Verdi', nomeProprio: 'Anna', email: 'ANNA@studio.it', attivo: true, qualita: true }                 // email scritta in maiuscolo sulla scheda
];
// le persone che verranno abilitate: tutte gia' in anagrafica, con il loro indirizzo
[['Nuovo.Revisore@studio.it', 'Mario', 'Bianchi'], ['coord@studio.it', 'Carla', 'Coordina'], ['vice.coord@studio.it', 'Vito', 'Vice'], ['da.admin@studio.it', 'Dario', 'Admin'],
    ['altro@studio.it', 'Alba', 'Altro'], ['domani@studio.it', 'Dino', 'Domani'], ['senza.freno@studio.it', 'Sara', 'Freno'], ['troppi@studio.it', 'Tina', 'Troppi'], ['scalata@studio.it', 'Sandro', 'Scalata'], ['x@studio.it', 'Ics', 'Ipsilon']]
    .forEach(([email, nomeProprio, nome], i) => persone.push({ id: 'n' + i, nome: nome, nomeProprio: nomeProprio, email: email, attivo: true, team: true }));
persone.push({ id: 'f1', nome: 'Fermo', nomeProprio: 'Fabio', email: 'fermo@studio.it', attivo: false });                      // scheda disattivata
persone.push({ id: 'f2', nome: 'Tolta', nomeProprio: 'Tea', email: 'tolta@studio.it', attivo: true, eliminato: true });        // scheda eliminata
persone.push({ id: 'f3', nome: 'Senzamail', nomeProprio: 'Sem', email: '', attivo: true });
dati.set('archivio/persone', { json: JSON.stringify(persone) });
utente('a.missori@emvas.tax', { ruolo: 'procuratore' });           // il titolare: amministratore qualunque cosa dica la scheda
utente('admin@studio.it', { ruolo: 'admin' });
utente('vice@studio.it', { ruolo: 'viceadmin' });
utente('qualita@studio.it', { ruolo: 'qualita' });                // il ruolo di accesso "Responsabile qualita'", senza scheda
utente('elena@studio.it', { ruolo: 'procuratore' });              // equity partner sulla scheda
utente('piero@studio.it', { ruolo: 'coordinatore' });             // founding partner sulla scheda, qualunque sia il ruolo
utente('ugo@studio.it', { ruolo: 'revisore' });                   // responsabile qualita' sulla scheda
utente('anna@studio.it', { ruolo: 'procuratore' });
utente('marta@studio.it', { ruolo: 'procuratore' });              // nessuna qualifica
utente('ada@studio.it', { ruolo: 'procuratore' });                // equity, ma la scheda non e' attiva
utente('ivo@studio.it', { ruolo: 'procuratore' });                // founding, ma la scheda e' eliminata
utente('ospite@fuori.it', { ruolo: 'sondaggio_compila' });
utente('aiuto@studio.it', { ruolo: 'collaboratore', collaboratoreDi: 'elena@studio.it' });   // collaboratore di un equity partner
utente('spento@studio.it', { ruolo: 'qualita', attivo: false });
utente('vecchio@studio.it', { ruolo: 'procuratore', attivo: false, nome: 'Tolto dall\'amministratore' });

(async () => {
    // ---------- 1. chi puo' ----------
    const come = async email => ABILITA.qualifica(db, await utenteEffettivo(db, email));
    verifica('amministratore, vice e titolare: sempre', (await come('admin@studio.it')) === 'amministratore' && (await come('vice@studio.it')) === 'amministratore' && (await come('a.missori@emvas.tax')) === 'amministratore');
    verifica('equity partner (qualifica della scheda, qualunque sia il ruolo di accesso)', (await come('elena@studio.it')) === 'equity');
    verifica('founding partner, anche se entra da coordinatore', (await come('piero@studio.it')) === 'founding');
    verifica('responsabile della qualita\': per il ruolo di accesso', (await come('qualita@studio.it')) === 'qualita');
    verifica('responsabile della qualita\': per la qualifica sulla scheda, anche se entra da revisore', (await come('ugo@studio.it')) === 'qualita');
    verifica('la scheda si aggancia per email senza badare a maiuscole e minuscole', (await come('anna@studio.it')) === 'qualita');
    verifica('chi non ha nessuna di queste qualifiche: no', (await come('marta@studio.it')) === '');
    verifica('una scheda non attiva o eliminata non da\' la qualifica', (await come('ada@studio.it')) === '' && (await come('ivo@studio.it')) === '');
    verifica('un invitato "solo sondaggio": no', (await come('ospite@fuori.it')) === '');
    verifica('il collaboratore di un equity partner: no (i poteri sugli utenti non si delegano)', (await come('aiuto@studio.it')) === '');

    // ---------- 2. la porta del servizio ----------
    const prima = quanti();
    verifica('senza accesso: 401', (await chiama(null, { azione: 'abilita', email: 'x@studio.it', nome: 'X', ruolo: 'revisore' })).http === 401);
    verifica('utente disabilitato: 403', (await chiama('spento@studio.it', { azione: 'abilita', email: 'x@studio.it', nome: 'X', ruolo: 'revisore' })).http === 403);
    let r = await chiama('marta@studio.it', { azione: 'abilita', email: 'x@studio.it', nome: 'X', ruolo: 'revisore' });
    verifica('chi non ha la qualifica: 403, e dice chi puo\'', r.http === 403 && /responsabili della qualità, gli equity partner e i founding partner/.test(r.msg), r);
    r = await chiama('aiuto@studio.it', { azione: 'abilita', email: 'x@studio.it', nome: 'X', ruolo: 'revisore' });
    verifica('il collaboratore: 403', r.http === 403 && /collaboratore/.test(r.msg), r);
    verifica('solo POST', (await chiama('elena@studio.it', { azione: 'abilita' }, 'GET')).http === 405);
    verifica('fin qui non e\' stato creato nessuno', quanti() === prima && !scheda('x@studio.it'));
    r = await chiama('elena@studio.it', { azione: 'stato' });
    verifica('"stato" dice se si puo\', come, e con quali ruoli', r.ok && r.puo === true && r.come === 'equity' && r.ruoli.join() === 'revisore,coordinatore,vicecoordinatore', r);
    verifica('"stato" a chi non puo\'', (await chiama('marta@studio.it', { azione: 'stato' })).puo === false);

    // ---------- 3. si aggiunge, e solo con i tre ruoli ----------
    const t0 = Date.now();
    r = await chiama('qualita@studio.it', { azione: 'abilita', email: '  Nuovo.Revisore@Studio.IT ', nome: 'Un Nome Scritto Da Chi Chiama', ruolo: 'revisore' });
    let s = scheda('nuovo.revisore@studio.it');
    verifica('un responsabile della qualita\' abilita un Revisore', r.ok && r.http === 200 && r.email === 'nuovo.revisore@studio.it' && r.ruolo === 'revisore' && r.nomeRuolo === 'Revisore' && r.nome === 'Mario Bianchi', r);
    verifica('la scheda: indirizzo in minuscolo, nome preso da Aderenti Revilaw (non da chi chiama), attiva, con chi l\'ha creata e a che titolo', s && s.nome === 'Mario Bianchi' && s.ruolo === 'revisore' && s.attivo === true && s.creatoDa === 'qualita@studio.it' && s.delega === 'qualita' && s.creato >= t0 && !dati.has('utenti/  Nuovo.Revisore@Studio.IT '), s);
    r = await chiama('elena@studio.it', { azione: 'abilita', email: 'coord@studio.it', nome: 'Coordinatore Nuovo', ruolo: 'coordinatore' });
    verifica('un equity partner abilita un Coordinatore territoriale', r.ok && scheda('coord@studio.it').ruolo === 'coordinatore' && scheda('coord@studio.it').delega === 'equity' && scheda('coord@studio.it').creatoDa === 'elena@studio.it', r);
    r = await chiama('piero@studio.it', { azione: 'abilita', email: 'vice.coord@studio.it', nome: 'Vice Nuovo', ruolo: 'vicecoordinatore' });
    verifica('un founding partner abilita un Vice coordinatore', r.ok && scheda('vice.coord@studio.it').ruolo === 'vicecoordinatore' && scheda('vice.coord@studio.it').delega === 'founding', r);
    r = await chiama('admin@studio.it', { azione: 'abilita', email: 'da.admin@studio.it', nome: 'Da Admin', ruolo: 'revisore' });
    verifica('lo puo\' fare anche l\'amministratore (che ha comunque la sezione Utenti)', r.ok && scheda('da.admin@studio.it').delega === 'amministratore');
    const dopo = quanti();
    for (const ruolo of ['admin', 'viceadmin', 'qualita', 'procuratore', 'marketing', 'collaboratore', 'sondaggio_compila', 'ruolo-su-misura', '', 'Revisore', 'REVISORE']) {
        r = await chiama('elena@studio.it', { azione: 'abilita', email: 'scalata@studio.it', nome: 'Scalata', ruolo: ruolo });
        verifica('il ruolo "' + ruolo + '" NON si puo\' assegnare da qui', r.http === 400 && /solo i ruoli Revisore, Coordinatore territoriale e Vice coordinatore/.test(r.msg) && !scheda('scalata@studio.it'), r);
    }
    r = await chiama('admin@studio.it', { azione: 'abilita', email: 'scalata@studio.it', nome: 'Scalata', ruolo: 'admin' });
    verifica('nemmeno l\'amministratore crea amministratori da questa porta: usa la sezione Utenti', r.http === 400 && !scheda('scalata@studio.it'));
    verifica('indirizzo non valido: 400', (await chiama('elena@studio.it', { azione: 'abilita', email: 'non-un-indirizzo', nome: 'X', ruolo: 'revisore' })).http === 400
        && (await chiama('elena@studio.it', { azione: 'abilita', email: 'a@b.it, c@d.it', nome: 'X', ruolo: 'revisore' })).http === 400);
    // solo chi e' gia' in Aderenti Revilaw: niente indirizzi scritti a mano
    r = await chiama('elena@studio.it', { azione: 'abilita', email: 'fuori.anagrafica@esempio.it', nome: 'Fuori Anagrafica', ruolo: 'revisore' });
    verifica('un indirizzo che non e\' in Aderenti Revilaw NON si abilita: 400, e dice cosa fare prima', r.http === 400 && /non c'è una scheda attiva con questo indirizzo email: prima va inserita la persona in anagrafica/.test(r.msg) && !scheda('fuori.anagrafica@esempio.it'), r);
    verifica('nemmeno se la scheda c\'e\' ma e\' disattivata o eliminata', (await chiama('piero@studio.it', { azione: 'abilita', email: 'fermo@studio.it', ruolo: 'revisore' })).http === 400 && (await chiama('piero@studio.it', { azione: 'abilita', email: 'tolta@studio.it', ruolo: 'revisore' })).http === 400
        && !scheda('fermo@studio.it') && !scheda('tolta@studio.it'));
    verifica('vale anche per l\'amministratore, da questa porta (lui ha la sezione Utenti per il resto)', (await chiama('admin@studio.it', { azione: 'abilita', email: 'fuori.anagrafica@esempio.it', ruolo: 'revisore' })).http === 400 && !scheda('fuori.anagrafica@esempio.it'));
    verifica('azione sconosciuta: 400', (await chiama('elena@studio.it', { azione: 'elimina', email: 'marta@studio.it' })).http === 400 && scheda('marta@studio.it').attivo === true);
    verifica('nessuno di questi tentativi ha scritto qualcosa', quanti() === dopo);

    // ---------- 4. chi c'e' gia' non si tocca ----------
    const martaPrima = JSON.stringify(scheda('marta@studio.it'));
    r = await chiama('elena@studio.it', { azione: 'abilita', email: 'Marta@Studio.it', nome: 'Marta Declassata', ruolo: 'revisore' });
    verifica('un utente che c\'e\' gia\' non si puo\' "riabilitare" con un altro ruolo: 409, scheda intatta', r.http === 409 && /ha già un accesso/.test(r.msg) && JSON.stringify(scheda('marta@studio.it')) === martaPrima, r);
    r = await chiama('elena@studio.it', { azione: 'abilita', email: 'admin@studio.it', nome: 'Admin', ruolo: 'revisore' });
    verifica('nemmeno l\'amministratore si puo\' declassare cosi\'', r.http === 409 && scheda('admin@studio.it').ruolo === 'admin');
    r = await chiama('qualita@studio.it', { azione: 'abilita', email: 'vecchio@studio.it', nome: 'Di Nuovo Dentro', ruolo: 'revisore' });
    verifica('chi e\' stato disabilitato dall\'amministratore resta disabilitato', r.http === 409 && scheda('vecchio@studio.it').attivo === false && scheda('vecchio@studio.it').nome === 'Tolto dall\'amministratore', r);
    r = await chiama('elena@studio.it', { azione: 'abilita', email: 'elena@studio.it', nome: 'Elena', ruolo: 'coordinatore' });
    verifica('non ci si cambia il ruolo da soli', r.http === 409 && scheda('elena@studio.it').ruolo === 'procuratore');
    r = await chiama('piero@studio.it', { azione: 'abilita', email: 'nuovo.revisore@studio.it', nome: 'Doppio', ruolo: 'coordinatore' });
    verifica('chi e\' appena stato abilitato da un altro non si ricrea con un altro ruolo', r.http === 409 && scheda('nuovo.revisore@studio.it').ruolo === 'revisore' && scheda('nuovo.revisore@studio.it').creatoDa === 'qualita@studio.it');

    // ---------- 5. il freno giornaliero ----------
    const k = ABILITA._interni.chiaveDi('ugo@studio.it');
    dati.set('meta/abilitazioni', { [k]: Array.from({ length: ABILITA.MAX_AL_GIORNO }, (_, i) => Date.now() - i * 1000) });
    r = await chiama('ugo@studio.it', { azione: 'abilita', email: 'troppi@studio.it', nome: 'Troppi', ruolo: 'revisore' });
    verifica('oltre ' + ABILITA.MAX_AL_GIORNO + ' accessi in un giorno ci si ferma: 429', r.http === 429 && /ultime 24 ore/.test(r.msg) && !scheda('troppi@studio.it'), r);
    verifica('il freno e\' per persona: un altro continua', (await chiama('anna@studio.it', { azione: 'abilita', email: 'altro@studio.it', nome: 'Altro', ruolo: 'revisore' })).ok && dati.get('meta/abilitazioni')[ABILITA._interni.chiaveDi('anna@studio.it')].length === 1);
    dati.set('meta/abilitazioni', { [k]: Array.from({ length: ABILITA.MAX_AL_GIORNO }, () => Date.now() - 25 * 3600 * 1000) });
    r = await chiama('ugo@studio.it', { azione: 'abilita', email: 'domani@studio.it', nome: 'Domani', ruolo: 'revisore' });
    verifica('il giorno dopo si riparte', r.ok && scheda('domani@studio.it').creatoDa === 'ugo@studio.it' && dati.get('meta/abilitazioni')[k].length === 1, r);
    dati.set('meta/abilitazioni', { [ABILITA._interni.chiaveDi('admin@studio.it')]: Array.from({ length: 200 }, () => Date.now()) });
    verifica('l\'amministratore non ha il freno', (await chiama('admin@studio.it', { azione: 'abilita', email: 'senza.freno@studio.it', nome: 'Senza Freno', ruolo: 'revisore' })).ok);

    // ---------- 6. app, regole e servizio dicono la stessa cosa ----------
    const app = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'app.js'), 'utf8');
    const regole = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'FIREBASE-SETUP.md'), 'utf8');
    verifica('l\'app propone gli stessi tre ruoli che il servizio accetta', /const RUOLO_REVISORE = 'revisore';/.test(app) && /const RUOLI_DELEGABILI = \[RUOLO_REVISORE, 'coordinatore', 'vicecoordinatore'\];/.test(app) && ABILITA.RUOLI_DELEGABILI.join() === 'revisore,coordinatore,vicecoordinatore');
    verifica('l\'app chiama questa porta, non scrive la scheda da se\'', /abilita-utente\$1/.test(app) && /azione: 'abilita'/.test(app));
    verifica('le regole Firestore lasciano creare gli utenti al solo amministratore: dal browser un delegato non puo\'', /allow create, delete: if admin\(\);/.test(regole));
    verifica('il Revisore non compare fra i ruoli esclusi dallo staff nelle regole (legge l\'archivio come gli altri)', !/'revisore'/.test(regole.split('```')[1] || ''));

    console.log('\nabilita-utente: ' + passate + ' verifiche passate' + (fallite ? ', ' + fallite + ' FALLITE' : ''));
    process.exit(fallite ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
