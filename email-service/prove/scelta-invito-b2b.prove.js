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
    collection: nome => ({
        // il riferimento porta con se' la collezione, come fa Firestore: il
        // batch scrive dove gli dice il riferimento, non dove indovina
        doc: id => ({ id: id, _coll: nome, set: async () => { } }),
        /* La lettura con cui l'importazione degli inviti cerca chi e' gia'
           iscritto: si legge tutta la collezione con tre campi soli. */
        select: () => ({
            get: async () => {
                const righe = Object.keys(dati).filter(k => k.indexOf(nome + '/') === 0)
                    .map(k => ({ id: k.slice(nome.length + 1), data: () => dati[k] }));
                return { forEach: f => righe.forEach(f), size: righe.length };
            }
        })
    }),
    batch() {
        const ops = [];
        return {
            set(rif, patch, opz) {
                ops.push({ k: (rif._coll || 'iscrizioni') + '/' + rif.id, patch: patch, merge: !!(opz && opz.merge) });
            },
            commit: async () => {
                ops.forEach(o => {
                    dati[o.k] = o.merge ? sovrapponi(dati[o.k], o.patch) : o.patch;
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
const aLotti = daAppJs('aLotti');
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
/* Una scheda gia' presente fra gli iscritti: e' il punto di partenza di
   queste prove, perche' il file degli inviti sceglie fra chi c'e' gia'. */
function mettiIscritto(id, email, pagina, resto) {
    dati['iscrizioni/' + id] = Object.assign({
        nome: 'Tizio', cognome: 'Caio', email: email, pagina: pagina, extra: {}
    }, resto || {});
}
const schede = () => Object.keys(dati).filter(k => k.indexOf('iscrizioni/') === 0).map(k => dati[k]);
const INTEST = 'Data,Nome,Cognome,Email,Azienda,P.IVA,Telefono,Invito B2B';
const riga = (nome, mail, tel, invito) =>
    '01/09/2026,' + nome + ',Rossi,' + mail + ',Alfa Srl,09302991212,' + tel + ',' + invito;

(async () => {

console.log('\n1) Il file degli inviti SEGNA chi e\' gia\' iscritto, e non aggiunge nessuno');
dati = {};
mettiIscritto('vecchia-1', 'mario@alfa.it', 'Napoli 2 Ottobre 2026', { telefono: '333', azienda: 'Alfa Srl' });
mettiIscritto('vecchia-2', 'luisa@alfa.it', 'Napoli 2 Ottobre 2026', {});
const r1 = await importa([INTEST, riga('Mario', 'mario@alfa.it', '999', 'si'),
    riga('Luisa', 'luisa@alfa.it', '334', '')].join('\n'));
esigi(schede().length === 2, 'nessuna scheda nuova: le aziende del file erano gia\' iscritte', 'schede: ' + schede().length);
esigi(dati['iscrizioni/vecchia-1'].extra[COL_INVITO_B2B] === 'si', 'chi e\' segnato nel foglio si ritrova segnato sulla sua scheda');
esigi(dati['iscrizioni/vecchia-2'].extra[COL_INVITO_B2B] === '', 'e chi ha la cella in bianco no');
esigi(dati['iscrizioni/vecchia-1'].telefono === '333',
    'il telefono con cui si era iscritto resta il suo: il foglio degli inviti non riscrive l\'anagrafica');
esigi(dati['iscrizioni/vecchia-1'].extra['P.IVA'] === '09302991212',
    'la partita IVA del foglio invece arriva: senza, l\'azienda non si riconosce al momento di spedire');
esigi(r1.soloInviti === true && r1.aggiornate === 2, 'e la risposta dice che sono state SEGNATE, non importate',
    JSON.stringify(r1));

console.log('\n2) Il ripensamento: si toglie il "si" e si reimporta');
await importa([INTEST, riga('Mario', 'mario@alfa.it', '999', ''),
    riga('Luisa', 'luisa@alfa.it', '334', 'si')].join('\n'));
esigi(!segnatoInvitoB2B(dati['iscrizioni/vecchia-1']),
    'la cella svuotata cancella davvero la scelta della volta prima');
esigi(segnatoInvitoB2B(dati['iscrizioni/vecchia-2']), 'e quella riempita la aggiunge');
esigi(schede().length === 2, 'e anche stavolta nessuna scheda nuova');

console.log('\n3) Una riga che non trova il suo iscritto non si scrive: si riporta');
dati = {};
mettiIscritto('vecchia-1', 'mario@alfa.it', 'Napoli 2 Ottobre 2026', {});
mettiIscritto('altra-citta', 'gino@beta.it', 'Verona 27 Marzo 2026', {});
const r3 = await importa([INTEST,
    riga('Mario', 'mario@alfa.it', '333', 'si'),
    riga('Gino', 'gino@beta.it', '334', 'si'),
    riga('Rita', 'rita@gamma.it', '335', 'si')].join('\n'));
esigi(r3.aggiornate === 1 && r3.nonIscritte === 2, 'una segnata, due no', JSON.stringify(r3));
esigi(schede().length === 2, 'e le due che non c\'erano non sono nate: le presenze restano quelle vere');
esigi((r3.nonTrovate || []).join(' ') === 'gino@beta.it rita@gamma.it',
    'la risposta dice QUALI, cosi\' non si scopre il 2 ottobre che a due aziende non e\' arrivato niente',
    (r3.nonTrovate || []).join(' '));
esigi(!segnatoInvitoB2B(dati['iscrizioni/altra-citta']),
    'chi e\' iscritto a un ALTRO evento non viene segnato: quell\'invito non e\' suo');

console.log('\n4) Un file SENZA quella colonna importa come ha sempre fatto');
dati = {};
const r4 = await importa(['Data,Nome,Cognome,Email,Azienda',
    '01/09/2026,Rita,Neri,rita@gamma.it,Gamma Srl'].join('\n'));
esigi(r4.soloInviti === false && r4.importate === 1, 'la riga si importa', JSON.stringify(r4));
esigi(schede().length === 1 && schede()[0].email === 'rita@gamma.it',
    'e la scheda nasce: l\'importazione degli iscritti resta quella di sempre');

console.log('\n5) L\'etichetta e\' sempre la stessa, comunque sia scritta nel foglio');
dati = {};
mettiIscritto('vecchia-1', 'mario@alfa.it', 'Napoli 2 Ottobre 2026', {});
await importa(['Data,Nome,Cognome,Email,invito b2b', '01/09/2026,Mario,Rossi,mario@alfa.it,SI'].join('\n'));
esigi(dati['iscrizioni/vecchia-1'].extra[COL_INVITO_B2B] === 'SI',
    'il foglio scrive "invito b2b", la scheda scrive "' + COL_INVITO_B2B + '"');
esigi(Object.keys(dati['iscrizioni/vecchia-1'].extra).length === 1,
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
const segnati = iscrittiPerInvitoB2B('ev', elenco).map(r => r.email);
esigi(segnati.join(' ') === 'mario@alfa.it gino@beta.it',
    'ci sono solo le aziende importate, fra gli ospiti e gli sponsor in sala', segnati.join(' '));
esigi(segnati.indexOf('luisa@alfa.it') < 0,
    'un iscritto che nel file non c\'era non compare: agli incontri non si invita chi si e\' iscritto');
esigi(segnati.indexOf('sara@beta.it') < 0 && segnati.indexOf('rita@beta.it') < 0,
    'chi segue online e gli aderenti restano fuori anche se importati: al tavolo non ci siedono');
esigi(!iscrittiPerInvitoB2B('ev', null).length && !iscrittiPerInvitoB2B('ev', []).length,
    'e senza iscritti non si sbaglia: non c\'e\' nessuno da invitare');
/* Non c'e' nessun modo di farli comparire: la funzione prende due argomenti e
   basta. Un interruttore "mostra tutti" era il genere di comodita' da cui, un
   giorno di fretta, parte un invito a duecento persone che non dovevano. */
esigi(iscrittiPerInvitoB2B.length === 2,
    'e non c\'e\' nessun interruttore per vedere tutti gli iscritti', 'argomenti: ' + iscrittiPerInvitoB2B.length);

console.log('\n8) Svuotare l\'elenco: le schede si mandano a lotti');
/* "Svuota l'elenco" tocca tutte le schede insieme, e il servizio ne accetta
   trecento per chiamata: oltre quel tetto la richiesta viene respinta e
   l'elenco resterebbe svuotato a meta', senza che nulla lo dica. */
const centoventidue = [];
for (let i = 0; i < 245; i++) centoventidue.push('doc' + i);
const lotti = aLotti(centoventidue, 200);
esigi(lotti.length === 2 && lotti[0].length === 200 && lotti[1].length === 45,
    'duecentoquarantacinque schede diventano due lotti, non una richiesta sola che verrebbe respinta',
    lotti.map(x => x.length).join('+'));
esigi([].concat.apply([], lotti).join(',') === centoventidue.join(','),
    'e messi in fila i lotti sono l\'elenco di partenza, nello stesso ordine: nessuna scheda persa o ripetuta');
esigi(aLotti([], 200).length === 0 && aLotti(null, 200).length === 0,
    'un elenco vuoto non fa partire nessuna chiamata');
esigi(aLotti(['a', 'b'], 0).length === 2, 'un tetto assurdo non fa sparire niente: al peggio un lotto per scheda');

console.log('\n' + ok + ' verde, ' + ko + ' ROSSO');
process.exit(ko ? 1 : 0);
})();
