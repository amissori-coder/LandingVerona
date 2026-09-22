/* ============================================================
   PROVE - le aziende da invitare agli incontri si SCELGONO
   ------------------------------------------------------------
       node prove/scelta-invito-b2b.prove.js

   Niente da installare: Firestore e' finto e sta qui dentro, e le
   funzioni dell'area riservata si ritagliano dal sorgente vero di
   app.js, cosi' la prova non collauda una copia.

   COSA DIMOSTRANO. Agli incontri B2B non si invita chi si e' iscritto:
   si invitano le aziende scelte una per una da chi organizza. La
   scelta si fa nel foglio che si importa, segnando "si" nella colonna
   "Invito B2B", e la finestra degli inviti mostra soltanto chi e'
   segnato.

   Il punto delicato e' il RIPENSAMENTO. Il file si reimporta proprio
   per cambiare la scelta, e l'importazione scrive "a sovrapposizione"
   (merge): le colonne lasciate in bianco non cancellano quello che si
   sapeva gia' - ed e' giusto, perche' un elenco parziale non deve
   perdere il telefono di nessuno. Ma per QUESTA colonna la stessa
   regola sarebbe un danno: l'azienda tolta dall'elenco resterebbe
   segnata dalla volta prima, e si vedrebbe fra gli invitati senza che
   nulla lo spieghi. Qui si verifica che la cella svuotata cancelli
   davvero il "si", e che nel farlo non si porti via nient'altro.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');
const fs = require('fs');

// ---------- Firestore finto ----------
/* La sovrapposizione di Firestore e' PROFONDA: set(..., {merge:true}) su un
   campo che e' una mappa (qui "extra") unisce le chiavi invece di sostituire
   la mappa intera. E' esattamente il comportamento che rende possibile il
   guaio raccontato sopra, quindi la finzione deve rifarlo, altrimenti la
   prova passerebbe per il motivo sbagliato. */
function sovrapponi(vecchio, nuovo) {
    const fuori = Object.assign({}, vecchio || {});
    Object.keys(nuovo || {}).forEach(k => {
        const v = nuovo[k];
        const piatto = v && typeof v === 'object' && !Array.isArray(v);
        fuori[k] = piatto ? sovrapponi(fuori[k], v) : v;
    });
    return fuori;
}
let dati = {};
const admin = {
    apps: [],
    initializeApp() { },
    credential: { cert: c => c },
    firestore: () => db,
    auth: () => ({ verifyIdToken: async () => ({ email: 'admin@esempio.it' }) })
};
admin.firestore.FieldValue = { increment: n => n, serverTimestamp: () => 0 };
const db = {
    collection: () => ({
        doc: id => ({ id: id, set: async () => { } })
    }),
    batch() {
        const ops = [];
        return {
            set(rif, patch, opz) {
                ops.push({ id: rif.id, patch: patch, merge: !!(opz && opz.merge) });
            },
            commit: async () => {
                ops.forEach(o => {
                    dati[o.id] = o.merge ? sovrapponi(dati[o.id], o.patch) : o.patch;
                });
            }
        };
    }
};

// ---------- intercetta i require ----------
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'google-auth-library') return { JWT: function () { } };
    if (nome === '../lib/utente-effettivo') return { utenteEffettivo: async () => ({ ok: true, ruolo: 'admin' }) };
    return veroRequire.apply(this, arguments);
};
process.env.FIREBASE_SERVICE_ACCOUNT = '{"client_email":"x@y.z","private_key":"k"}';
const IMPORTA = require(path.join(__dirname, '..', 'api', 'importa-iscrizioni.js'));

// ---------- le funzioni vere dell'area riservata ----------
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'area-riservata', 'app.js'), 'utf8');
function ritaglia(apertura, apre, chiude) {
    const inizio = APP.indexOf(apertura);
    if (inizio < 0) throw new Error('non trovato in app.js: ' + apertura);
    let i = APP.indexOf(apre, inizio), aperte = 0, fine = -1;
    for (; i < APP.length; i++) {
        if (APP[i] === apre) aperte++;
        else if (APP[i] === chiude) { aperte--; if (!aperte) { fine = i + 1; break; } }
    }
    if (fine < 0) throw new Error('chiusura non trovata per: ' + apertura);
    return APP.slice(inizio, fine);
}
const daAppJs = nome => eval('(' + ritaglia('function ' + nome + '(', '{', '}') + ')');
const COL_INVITO_B2B = eval('(' + APP.slice(
    APP.indexOf('const COL_INVITO_B2B = ') + 'const COL_INVITO_B2B = '.length,
    APP.indexOf(';', APP.indexOf('const COL_INVITO_B2B = '))) + ')');
const segnatoInvitoB2B = daAppJs('segnatoInvitoB2B');
const daInvitareB2B = daAppJs('daInvitareB2B');
const iscrittiPerInvitoB2B = daAppJs('iscrittiPerInvitoB2B');
/* modalitaDi legge le presenze dalla chiusura dell'app: qui la modalita' la
   porta la riga stessa, che e' quanto basta a questa prova. */
const modalitaDi = (ev, r) => String(r.modalita || 'presenza');

// ---------- utilita' ----------
let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
const risposta = () => {
    const r = { _stato: 0, _j: null };
    r.setHeader = () => { };
    r.status = s => { r._stato = s; return r; };
    r.json = j => { r._j = j; return r; };
    r.end = () => r;
    return r;
};
async function importa(csv) {
    const res = risposta();
    await IMPORTA({ method: 'POST', body: { idToken: 't', csv: csv, pagina: 'Napoli 2 Ottobre 2026' } }, res);
    return res._j || {};
}
const scheda = mail => {
    const k = Object.keys(dati).filter(x => x.indexOf(mail.replace(/[\/\\.#$\[\]]/g, '-')) === 0)[0];
    return k ? dati[k] : null;
};
const INTEST = 'Data,Nome,Cognome,Email,Azienda,P.IVA,Telefono,Invito B2B';
const riga = (nome, mail, tel, invito) =>
    '01/09/2026,' + nome + ',Rossi,' + mail + ',Alfa Srl,09302991212,' + tel + ',' + invito;

(async () => {

console.log('\n1) La colonna del foglio dice chi va invitato');
dati = {};
await importa([INTEST, riga('Mario', 'mario@alfa.it', '333', 'si'),
    riga('Luisa', 'luisa@alfa.it', '334', '')].join('\n'));
esigi(scheda('mario@alfa.it').extra[COL_INVITO_B2B] === 'si',
    'chi e\' segnato nel foglio si ritrova segnato sulla scheda');
esigi(scheda('luisa@alfa.it').extra[COL_INVITO_B2B] === '',
    'e chi ha la cella in bianco no');
esigi(segnatoInvitoB2B(scheda('mario@alfa.it')) && !segnatoInvitoB2B(scheda('luisa@alfa.it')),
    'e l\'area riservata legge la stessa cosa');

console.log('\n2) Il ripensamento: si toglie il "si" e si reimporta');
await importa([INTEST, riga('Mario', 'mario@alfa.it', '333', ''),
    riga('Luisa', 'luisa@alfa.it', '334', 'si')].join('\n'));
esigi(!segnatoInvitoB2B(scheda('mario@alfa.it')),
    'la cella svuotata cancella davvero la scelta della volta prima');
esigi(segnatoInvitoB2B(scheda('luisa@alfa.it')),
    'e quella riempita la aggiunge');
esigi(scheda('mario@alfa.it').telefono === '333',
    'il resto della scheda non si muove');

console.log('\n3) Le ALTRE colonne continuano a non cancellare niente');
dati = {};
await importa(['Data,Nome,Cognome,Email,Azienda,Citta,Invito B2B',
    '01/09/2026,Mario,Rossi,mario@alfa.it,Alfa Srl,Napoli,si'].join('\n'));
esigi(scheda('mario@alfa.it').extra['Citta'] === 'Napoli', 'la citta arriva dal primo file');
await importa(['Data,Nome,Cognome,Email,Azienda,Citta,Invito B2B',
    '01/09/2026,Mario,Rossi,mario@alfa.it,Alfa Srl,,si'].join('\n'));
esigi(scheda('mario@alfa.it').extra['Citta'] === 'Napoli',
    'e un secondo file che la lascia in bianco non la porta via: solo la scelta degli inviti si cancella');

console.log('\n4) Un elenco senza quella colonna non tocca la scelta gia\' fatta');
await importa(['Data,Nome,Cognome,Email,Azienda', '01/09/2026,Mario,Rossi,mario@alfa.it,Alfa Srl'].join('\n'));
esigi(segnatoInvitoB2B(scheda('mario@alfa.it')),
    'chi era segnato resta segnato: quel file degli inviti non parlava');

console.log('\n5) L\'etichetta e\' sempre la stessa, comunque sia scritta nel foglio');
dati = {};
await importa(['Data,Nome,Cognome,Email,invito b2b', '01/09/2026,Mario,Rossi,mario@alfa.it,SI'].join('\n'));
esigi(scheda('mario@alfa.it').extra[COL_INVITO_B2B] === 'SI',
    'il foglio scrive "invito b2b", la scheda scrive "' + COL_INVITO_B2B + '"');
esigi(Object.keys(scheda('mario@alfa.it').extra).length === 1,
    'e la colonna non finisce due volte nelle colonne aggiuntive');

console.log('\n6) Cosa vale come "si"');
const dice = v => segnatoInvitoB2B({ extra: { 'Invito B2B': v } });
esigi(dice('si') && dice('SI') && dice('Sì') && dice(' Si ') && dice('x') && dice('1'),
    'le forme con cui in un foglio si scrive di si valgono tutte');
esigi(!dice('') && !dice('no') && !dice('0') && !dice('da decidere'),
    'il bianco, il no e una frase qualunque non sono una scelta');
esigi(!segnatoInvitoB2B({}) && !segnatoInvitoB2B(null),
    'e una scheda senza colonne aggiuntive non e\' segnata');

console.log('\n7) Chi compare nella finestra degli inviti');
const elenco = [
    { email: 'mario@alfa.it', modalita: 'presenza', extra: { 'Invito B2B': 'si' } },
    { email: 'luisa@alfa.it', modalita: 'presenza', extra: {} },
    { email: 'gino@beta.it', modalita: 'sponsor', extra: { 'Invito B2B': 'si' } },
    { email: 'sara@beta.it', modalita: 'online', extra: { 'Invito B2B': 'si' } },
    { email: 'rita@beta.it', modalita: 'aderente', extra: { 'Invito B2B': 'si' } },
    { email: '', modalita: 'presenza', extra: { 'Invito B2B': 'si' } }
];
const segnati = iscrittiPerInvitoB2B('ev', elenco, true).map(r => r.email);
esigi(segnati.join(' ') === 'mario@alfa.it gino@beta.it',
    'ci sono solo gli iscritti segnati nel foglio, ospiti e sponsor', segnati.join(' '));
esigi(segnati.indexOf('sara@beta.it') < 0 && segnati.indexOf('rita@beta.it') < 0,
    'chi segue online e gli aderenti restano fuori anche se segnati: al tavolo non ci siedono');
const tutti = iscrittiPerInvitoB2B('ev', elenco, false).map(r => r.email);
esigi(tutti.join(' ') === 'mario@alfa.it luisa@alfa.it gino@beta.it',
    'togliendo la spunta tornano tutti quelli in sala', tutti.join(' '));
esigi(!iscrittiPerInvitoB2B('ev', null, true).length && !iscrittiPerInvitoB2B('ev', [], false).length,
    'e senza iscritti non si sbaglia: non c\'e\' nessuno da invitare');

console.log('\n' + ok + ' verde, ' + ko + ' ROSSO');
process.exit(ko ? 1 : 0);
})();
