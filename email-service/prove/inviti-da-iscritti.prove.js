/* ============================================================
   PROVE - area-riservata/app.js, gli iscritti di un evento come
   elenco da invitare a un altro (righeDaIscritti)
   ------------------------------------------------------------
       node prove/inviti-da-iscritti.prove.js

   La funzione si ritaglia dal sorgente VERO di app.js.

   COSA DIMOSTRANO. Chi e' venuto a Napoli si invita al webinar
   senza passare da un file: entrano le aziende in presenza e
   online, una riga per indirizzo; restano fuori aderenti, sponsor
   e relatori, i soli incontri B2B e chi non ha un'email. La
   sezione decisa da chi organizza (presenze) vince su quella
   dichiarata iscrivendosi, e vuota vale in presenza.

   E CHI C'E' GIA' NELL'EVENTO A CUI LI SI INVITA RESTA FUORI: gli
   iscritti di Milano invitati al webinar non comprendono chi e'
   gia' iscritto al webinar (stessa email o stesso cellulare) ne'
   chi l'invito al webinar l'ha gia' avuto o lo avra' dall'elenco,
   al suo indirizzo o alla sua azienda (PEC dell'invito con cui si
   e' iscritto, codice fiscale o partita IVA, ragione sociale). Ogni
   escluso si elenca con il perche'.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'app.js'), 'utf8');
const inizio = APP.indexOf('function righeDaIscritti(');
let i = APP.indexOf('{', inizio), aperte = 0, fine = -1;
for (; i < APP.length; i++) {
    if (APP[i] === '{') aperte++;
    else if (APP[i] === '}') { aperte--; if (!aperte) { fine = i + 1; break; } }
}
const SEZIONI_MODALITA = ['presenza', 'aderenti', 'sponsor', 'online', 'b2b'].map(id => ({ id: id }));
const righeDaIscritti = new Function('SEZIONI_MODALITA', APP.slice(inizio, fine) + '; return righeDaIscritti;')(SEZIONI_MODALITA);

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}

const NAPOLI = { id: 'napoli-2026-10-02', titolo: 'Napoli' };
const ISCRITTI = [
    { id: 'a', nome: 'Anna', cognome: 'Alfa', email: 'Anna@Alfa.it', azienda: 'Alfa S.p.A.', telefono: '333' },
    { id: 'b', nome: 'Bruno', cognome: 'Beta', email: 'bruno@beta.it', azienda: 'Beta S.r.l.', modalita: 'online' },
    { id: 'c', nome: 'Carla', cognome: 'Gamma', email: 'carla@gamma.it', azienda: 'Gamma', modalita: 'presenza' },   // spostata online
    { id: 'd', nome: 'Dino', cognome: 'Delta', email: 'dino@studio.it', azienda: 'Studio Delta', modalita: 'aderenti' },
    { id: 'e', nome: 'Elsa', cognome: 'Eta', email: 'elsa@sponsor.it', azienda: 'Sponsor' },                          // spostata fra gli sponsor
    { id: 'f', nome: 'Furio', cognome: 'Zeta', email: '', azienda: 'Zeta' },
    { id: 'g', nome: 'Anna', cognome: 'Alfa', email: 'anna@alfa.it', azienda: 'Alfa S.p.A.' },                        // stessa casella
    { id: 'h', nome: 'Ida', cognome: 'Iota', email: 'ida@iota.it', azienda: '' },
    { id: 'i', nome: 'Luca', cognome: 'B2B', email: 'luca@b2b.it', azienda: 'B2B', modalita: 'b2b' }
];
const PRESENZE = { c: { modalita: 'online' }, e: { modalita: 'sponsor' } };

console.log('\nGli iscritti di Napoli come elenco da invitare');
const x = righeDaIscritti(NAPOLI, ISCRITTI, PRESENZE);
const dati = x.righe.slice(1);
esigi(x.righe[0].join('|') === 'Azienda|Email|Referente|Telefono|Note|Evento di provenienza', 'le intestazioni sono quelle che il caricamento riconosce', x.righe[0].join('|'));
esigi(dati.map(r => r[1]).join(',') === 'anna@alfa.it,bruno@beta.it,carla@gamma.it,ida@iota.it', 'entrano le aziende in presenza e online, con l\'email in minuscolo', dati.map(r => r[1]).join(','));
esigi(x.conta.presenza === 2 && x.conta.online === 2, 'due in presenza e due online: la sezione di chi organizza vince', JSON.stringify(x.conta));
esigi(x.conta.altreSezioni === 3, 'aderenti, sponsor e soli B2B restano fuori');
esigi(x.conta.senzaEmail === 1 && x.conta.doppie === 1, 'chi non ha email e la stessa casella due volte restano fuori, e si contano');
esigi(dati[0][0] === 'Alfa S.p.A.' && dati[0][2] === 'Anna Alfa' && dati[0][3] === '333', 'azienda, referente e telefono al loro posto');
esigi(dati[3][0] === 'Ida Iota', 'senza azienda la riga porta il nome della persona');
esigi(dati[0][4] === 'Iscritto a Napoli (in presenza)' && dati[2][4] === 'Iscritto a Napoli (online)', 'la nota dice da dove arriva', dati[2][4]);
esigi(dati.every(r => r[5] === 'napoli-2026-10-02'), 'e la colonna "Evento di provenienza" porta l\'identificativo dell\'evento');
esigi(x.esclusi.length === 0 && x.conta.giaIscritti === 0 && x.conta.giaInvitati === 0 && x.conta.giaInElenco === 0,
    'senza l\'evento di destinazione nessuno resta fuori per "c\'e\' gia\'"');
esigi(righeDaIscritti(NAPOLI, [], {}).righe.length === 1, 'nessun iscritto: solo le intestazioni');

console.log('\nGli iscritti di Milano invitati al webinar: chi c\'e\' gia\' resta fuori');
const MILANO = { id: 'milano-2027-02-26', titolo: 'Milano' };
const WEBINAR = { id: 'webinar-2026-12-10', titolo: 'Webinar' };
const PARTITO = { quando: Date.UTC(2026, 10, 16, 22, 3), canale: 'pec' };
const DA_MILANO = [
    // gia' iscritta al webinar con la stessa email (e anche invitata: vince l'iscrizione)
    { id: 'm1', nome: 'Gina', cognome: 'Gia', email: 'Gia@X.it', azienda: 'Gia Srl', telefono: '' },
    // gia' iscritta al webinar con un'altra email, ma lo stesso cellulare
    { id: 'm2', nome: 'Carlo', cognome: 'Cell', email: 'carlo@lavoro.it', azienda: 'Cell Spa', telefono: '+39 333 111 2222' },
    // il suo indirizzo ha gia' ricevuto l'invito al webinar
    { id: 'm3', nome: 'Ivo', cognome: 'Invitato', email: 'ivo@studio.it', azienda: 'Studio Ivo' },
    // la PEC della sua azienda (dalla scheda dell'invito con cui si e' iscritto) ha gia' ricevuto il webinar
    { id: 'm4', nome: 'Pia', cognome: 'Pec', email: 'pia@alfa.it', azienda: 'Alfa', invito: { codice: 'A1B2C', azienda: 'ALFA INDUSTRIE S.P.A.', scheda: 'milano-2027-02-26~alfa@pec-it' } },
    // il codice fiscale del file dell'invito: l'azienda e' nell'elenco del webinar, invito non ancora partito
    { id: 'm5', nome: 'Fede', cognome: 'Fisco', email: 'fede@beta.it', azienda: 'Beta', invito: { codice: 'B1B2C', azienda: 'BETA', scheda: 'milano-2027-02-26~altra@pec-it' },
      datiInvito: [{ c: 'Ragione sociale (file)', v: 'BETA' }, { c: 'Codice fiscale', v: '01234567890' }, { c: 'PEC', v: 'altra@pec.it' }] },
    // la ragione sociale scritta a mano: "Gamma Costruzioni s.r.l." e' "GAMMA COSTRUZIONI S.R.L."
    { id: 'm6', nome: 'Gaia', cognome: 'Gamma', email: 'gaia@gamma.it', azienda: 'Gamma Costruzioni s.r.l.' },
    // libera: entra
    { id: 'm7', nome: 'Lia', cognome: 'Libera', email: 'lia@delta.it', azienda: 'Delta Servizi', telefono: '333 999 8888', modalita: 'online' },
    // nome troppo corto per confrontarlo ("AB" contro "AB S.R.L."): entra
    { id: 'm8', nome: 'Ada', cognome: 'Corta', email: 'ada@ab.it', azienda: 'Ab Srl' },
    // aderente iscritta anche al webinar: resta fuori come aderente, prima ancora della domanda
    { id: 'm9', nome: 'Dora', cognome: 'Aderente', email: 'dora@studio.it', azienda: 'Revilaw', modalita: 'aderenti' }
];
const DESTINO = {
    evento: WEBINAR,
    iscrizioni: [
        { id: 'w1', email: 'gia@x.it', telefono: '+39 340 000 0000' },
        { id: 'w2', email: 'carlo.casa@gmail.com', telefono: '3331112222' },
        { id: 'w3', email: 'dora@studio.it' }
    ],
    aziende: [
        { id: 'webinar-2026-12-10~gia@x-it', email: 'gia@x.it', ragioneSociale: 'Gia Srl', invio: PARTITO },
        { id: 'webinar-2026-12-10~ivo@studio-it', email: 'ivo@studio.it', ragioneSociale: 'Studio Ivo', invio: PARTITO },
        { id: 'webinar-2026-12-10~alfa@pec-it', pec: 'alfa@pec.it', ragioneSociale: 'ALFA INDUSTRIE S.P.A.', invio: PARTITO },
        { id: 'webinar-2026-12-10~beta@pec-it', pec: 'beta@pec.it', ragioneSociale: 'BETA', piva: 'IT01234567890', stato: 'da-invitare' },
        { id: 'webinar-2026-12-10~gamma@pec-it', pec: 'gamma@pec.it', ragioneSociale: 'GAMMA COSTRUZIONI S.R.L.', invio: PARTITO },
        { id: 'webinar-2026-12-10~ab@pec-it', pec: 'ab@pec.it', ragioneSociale: 'AB S.R.L.', invio: PARTITO }
    ]
};
const y = righeDaIscritti(MILANO, DA_MILANO, {}, DESTINO);
const entrano = y.righe.slice(1).map(r => r[1]).join(',');
esigi(entrano === 'lia@delta.it,ada@ab.it', 'entrano solo le persone che nel webinar non ci sono ancora', entrano);
esigi(y.conta.giaIscritti === 2 && y.conta.giaInvitati === 3 && y.conta.giaInElenco === 1 && y.conta.altreSezioni === 1,
    'due gia\' iscritte, tre gia\' invitate, una gia\' in elenco; l\'aderente resta fuori come aderente', JSON.stringify(y.conta));
esigi(y.conta.presenza === 1 && y.conta.online === 1, 'e i conti di chi entra restano quelli di chi entra', JSON.stringify(y.conta));
const perche = {};
y.esclusi.forEach(e => { perche[e.email] = e.conto + '/' + e.come; });
esigi(perche['gia@x.it'] === 'giaIscritti/email', 'gia\' iscritta con la stessa email (vince anche sull\'invito gia\' partito)', perche['gia@x.it']);
esigi(perche['carlo@lavoro.it'] === 'giaIscritti/cellulare', 'gia\' iscritto con un\'altra email ma lo stesso cellulare', perche['carlo@lavoro.it']);
esigi(perche['ivo@studio.it'] === 'giaInvitati/indirizzo', 'l\'invito era gia\' partito al suo indirizzo', perche['ivo@studio.it']);
esigi(perche['pia@alfa.it'] === 'giaInvitati/pec', 'l\'invito era gia\' partito alla PEC della sua azienda (dalla scheda del codice)', perche['pia@alfa.it']);
esigi(perche['fede@beta.it'] === 'giaInElenco/fiscale', 'la sua azienda e\' nell\'elenco del webinar (codice fiscale = partita IVA), invito non ancora partito', perche['fede@beta.it']);
esigi(perche['gaia@gamma.it'] === 'giaInvitati/nome', 'la stessa ragione sociale, scritta in un altro modo', perche['gaia@gamma.it']);
const pia = y.esclusi.find(e => e.email === 'pia@alfa.it') || {};
esigi(pia.con === 'ALFA INDUSTRIE S.P.A.' && pia.quando === PARTITO.quando && pia.nome === 'Pia Pec' && pia.azienda === 'Alfa',
    'chi resta fuori si elenca con nome, azienda, la scheda del webinar che l\'ha fatta escludere e quando era partito', JSON.stringify(pia));
esigi(y.righe.slice(1).every(r => r[5] === 'milano-2027-02-26' && /^Iscritto a Milano /.test(r[4])), 'le righe dicono da dove arrivano');
const z = righeDaIscritti(MILANO, DA_MILANO, {}, { evento: WEBINAR, iscrizioni: [], aziende: [] });
esigi(z.righe.length - 1 === 8 && z.esclusi.length === 0, 'con il webinar vuoto entrano tutti, tranne l\'aderente');

console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
