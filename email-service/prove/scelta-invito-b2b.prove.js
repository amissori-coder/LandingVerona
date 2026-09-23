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
const natoPerInvitiB2B = daAppJs('natoPerInvitiB2B');
const fraseEsitoInviti = daAppJs('fraseEsitoInviti');
const invitoB2BDi = daAppJs('invitoB2BDi');
const invitatiDelGruppo = daAppJs('invitatiDelGruppo');
const aziendaGiaInvitata = daAppJs('aziendaGiaInvitata');
const primoInvioB2B = daAppJs('primoInvioB2B');
const daSpuntareB2B = daAppJs('daSpuntareB2B');
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
async function importa(csv, evento) {
    const res = risposta();
    await IMPORTA({
        method: 'POST',
        body: {
            idToken: 't', csv: csv, pagina: 'Napoli 2 Ottobre 2026',
            /* L'EVENTO lo manda la finestra degli inviti, ed e' quello che
               permette di far nascere le aziende non iscritte nella sezione
               giusta. Le prove di prima non lo mandano apposta: cosi' si vede
               che senza continua a valere la regola di sempre. */
            evento: evento || ''
        }
    }, res);
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

console.log('\n9) L\'azienda segnata che iscritta non e\' NASCE, per i soli incontri');
/* Il file degli inviti non sceglie fra gli iscritti: sceglie fra le imprese,
   e quasi nessuna di loro si e' iscritta al convegno - vengono al desk per il
   loro appuntamento. Prima queste righe si riportavano indietro tutte, e
   davanti a un elenco di cento aziende voleva dire aggiungerle a mano cento
   volte. Ora nascono qui, come le fa "Aggiungi un'azienda". */
dati = {};
mettiIscritto('vecchia-1', 'mario@alfa.it', 'Napoli 2 Ottobre 2026', {});
const r9 = await importa([INTEST,
    riga('Mario', 'mario@alfa.it', '333', 'si'),
    riga('Rita', 'rita@gamma.it', '335', 'si')].join('\n'), 'napoli-2026-10-02');
esigi(r9.aggiornate === 1 && r9.create === 1 && r9.nonIscritte === 0,
    'una segnata, una creata, nessuna lasciata indietro', JSON.stringify(r9));
// i punti e le barre nel nome di un documento non si possono usare: diventano trattini
const nata = dati['iscrizioni/rita@gamma-it|01-09-2026'];
esigi(!!nata, 'la scheda c\'e\'', Object.keys(dati).join(' | '));
esigi(nata && nata.soloB2B === true,
    'e porta la bandiera dei soli incontri: l\'avviso "nuove iscrizioni dal sito" non la annuncia');
esigi(nata && segnatoInvitoB2B(nata), 'nasce gia\' scelta, altrimenti sparirebbe dall\'elenco da cui la si importa');
esigi(nata && nata.extra['P.IVA'] === '09302991212',
    'con la partita IVA del foglio: senza, al momento di spedire l\'impresa non si riconosce');
esigi(nata && nata.azienda === 'Alfa Srl' && nata.email === 'rita@gamma.it', 'e con ragione sociale e indirizzo');
/* IL POSTO IN SALA. E' la ragione per cui queste righe non si scrivevano: una
   scheda senza sezione vale "in presenza" e conta un posto che nessuno
   occupera'. La sezione non sta sulla scheda, sta fra le presenze. */
const pres = dati['presenze/napoli-2026-10-02~rita@gamma-it|01-09-2026'];
esigi(!!pres && pres.modalita === 'b2b',
    'e nelle presenze c\'e\' la sezione "Solo incontri B2B": in sala non occupa nessun posto',
    JSON.stringify(pres || null));
esigi(pres && pres.idIscritto === 'rita@gamma.it|01/09/2026',
    'con l\'identificativo dell\'iscritto per esteso, come lo scrive /api/presenze');
/* Il nome di quel documento lo compone anche /api/presenze, e le due scritture
   devono combaciare alla lettera: scritte diverse, la sezione sarebbe di
   nessuno e la scheda tornerebbe a contare un posto. */
const SORGENTE_PRES = fs.readFileSync(path.join(__dirname, '..', 'api', 'presenze.js'), 'utf8');
const SORGENTE_IMP = fs.readFileSync(path.join(__dirname, '..', 'api', 'importa-iscrizioni.js'), 'utf8');
const corpoDi = (src, firma) => {
    const i = src.indexOf(firma);
    if (i < 0) return '';
    return src.slice(i + firma.length, src.indexOf('}', i)).replace(/\s+/g, ' ').trim();
};
esigi(corpoDi(SORGENTE_PRES, 'function idDoc(evento, idIscritto) {')
    === corpoDi(SORGENTE_IMP, 'function idPresenza(evento, idIscritto) {'),
    'e il nome di quel documento si compone allo stesso modo nei due punti che lo scrivono',
    corpoDi(SORGENTE_IMP, 'function idPresenza(evento, idIscritto) {'));

console.log('\n10) Senza il "si" non nasce niente');
/* La cella vuota dice di NON invitare quell'azienda: crearla per poi non
   invitarla non ha senso, e riempirebbe l'archivio di schede che nessuno ha
   chiesto. */
dati = {};
const r10 = await importa([INTEST, riga('Rita', 'rita@gamma.it', '335', '')].join('\n'), 'napoli-2026-10-02');
esigi(!schede().length, 'nessuna scheda', 'schede: ' + schede().length);
esigi(r10.create === 0 && r10.nonIscritte === 1, 'e la riga si riporta indietro come sempre', JSON.stringify(r10));

console.log('\n11) Senza l\'evento non si crea niente, e si dice');
/* La sezione porta nel nome l'evento: senza, l'azienda nascerebbe "in sala" e
   si porterebbe via un posto. Meglio non crearla e dirlo. */
dati = {};
const r11 = await importa([INTEST, riga('Rita', 'rita@gamma.it', '335', 'si')].join('\n'));
esigi(!schede().length, 'nessuna scheda creata a occhi chiusi');
esigi(r11.create === 0 && r11.nonIscritte === 1 && (r11.nonTrovate || [])[0] === 'rita@gamma.it',
    'la riga torna indietro, con il suo indirizzo', JSON.stringify(r11));

console.log('\n12) Reimportare lo stesso file non fa nascere doppioni');
/* L'identificativo della scheda e' "indirizzo|data", lo stesso del modulo del
   sito: la seconda importazione riscrive la stessa scheda invece di
   affiancarne un'altra. E' quello che permette di correggere il file e
   ripassarlo senza pulire niente. */
dati = {};
const file12 = [INTEST, riga('Rita', 'rita@gamma.it', '335', 'si')].join('\n');
await importa(file12, 'napoli-2026-10-02');
const r12 = await importa(file12, 'napoli-2026-10-02');
esigi(schede().length === 1, 'una scheda sola dopo due importazioni', 'schede: ' + schede().length);
/* La seconda volta non la crea: la TROVA. La scheda che abbiamo creato noi e'
   a tutti gli effetti un'iscritta di questo evento, quindi il passaggio
   successivo la segna come segna tutte le altre - ed e' giusto cosi': da li'
   in avanti quell'azienda ha una scheda sua, e il file la aggiorna. */
esigi(r12.create === 0 && r12.aggiornate === 1,
    'la seconda volta non la crea: la trova e la aggiorna, come ogni altra scheda', JSON.stringify(r12));
/* E il ripensamento continua a valere: tolta dal file, l'azienda creata
   smette di essere invitata. */
await importa([INTEST, riga('Rita', 'rita@gamma.it', '335', '')].join('\n'), 'napoli-2026-10-02');
esigi(!segnatoInvitoB2B(schede()[0]),
    'e se poi la si toglie dal file, la scelta si spegne anche sulla scheda creata da noi');

console.log('\n13) Due referenti sulla stessa casella restano due schede');
/* Capita spesso: due soci, una casella sola. L'identificativo porta dentro la
   DATA, e nel file le due righe si scrivono a un secondo di distanza: con la
   stessa data una delle due sparirebbe dentro l'altra, e l'invito
   arriverebbe con un nome solo. */
dati = {};
const r13 = await importa([INTEST,
    '01/09/2026 09:00:00,Laura,Rossi,laura@balzano.it,Balzano Srl,07307010632,333,si',
    '01/09/2026 09:00:01,Livio,Rossi,laura@balzano.it,Balzano Srl,07307010632,333,si'].join('\n'),
    'napoli-2026-10-02');
esigi(r13.create === 2 && schede().length === 2,
    'due schede, una per referente', 'create: ' + r13.create + ', schede: ' + schede().length);
esigi(schede().map(x => x.nome).sort().join(',') === 'Laura,Livio', 'e ciascuna con il suo nome');

console.log('\n14) Dall\'importazione alla finestra degli inviti, senza passare per le mani di nessuno');
/* La prova che conta: importato il file, quelle aziende si devono VEDERE nella
   finestra da cui si spedisce. Fra l'importazione e la finestra ci sono due
   setacci - la scelta sulla scheda e la sezione - e basta che uno dei due non
   combaci perche' l'elenco resti vuoto come prima, che e' esattamente quello
   che e' successo la prima volta. */
dati = {};
const r14 = await importa([INTEST,
    riga('Rita', 'rita@gamma.it', '335', 'si'),
    riga('Nino', 'nino@delta.it', '336', 'si')].join('\n'), 'napoli-2026-10-02');
esigi(r14.create === 2, 'due aziende create dal file', JSON.stringify(r14));
/* La finestra legge le schede con accanto la loro sezione: qui si ricompone
   quello che fa l'area riservata, leggendo le presenze appena scritte. */
const conSezione = schede().map(x => Object.assign({}, x, {
    modalita: (dati['presenze/napoli-2026-10-02~' + (x.email + '|' + x.data).replace(/[\/\\.#$\[\]]/g, '-')] || {}).modalita || 'presenza'
}));
const inFinestra = iscrittiPerInvitoB2B('napoli-2026-10-02', conSezione).map(r => r.email).sort();
esigi(inFinestra.join(' ') === 'nino@delta.it rita@gamma.it',
    'e tutte e due compaiono nella finestra degli inviti, pronte da spedire', inFinestra.join(' '));
/* E l'avviso delle nuove iscrizioni non le annuncia: cento righe importate
   sarebbero cento finestre da chiudere per qualcosa che non e' successo. */
esigi(conSezione.every(x => natoPerInvitiB2B(x)),
    'mentre l\'avviso "nuove iscrizioni dal sito" non ne annuncia nessuna');

console.log('\n15) La frase che racconta l\'importazione, compreso il servizio indietro');
/* Il sito e il servizio stanno su due macchine diverse e si aggiornano per
   conto loro: per qualche minuto la finestra e' quella nuova e dall'altra
   parte risponde ancora quella vecchia. Quando e' successo, a video si e'
   letto "nessuna azienda segnata... 122 righe non le ho potute usare", che
   manda a cercare il guasto nel file - dove non c'e'. La risposta nuova porta
   sempre "create", anche a zero: la chiave che manca e' il segno. */
const vecchioServizio = fraseEsitoInviti({ ok: true, lette: 122, soloInviti: true, aggiornate: 0, nonIscritte: 122 }, 0);
esigi(/servizio non e ancora aggiornato/.test(vecchioServizio.testo) && vecchioServizio.ko,
    'il servizio indietro si riconosce e si dice, invece di dare la colpa al file', vecchioServizio.testo);
esigi(/reimport/.test(vecchioServizio.testo),
    'e si dice che cosa fare: reimportare lo stesso file, che non crea doppioni');
const tutteCreate = fraseEsitoInviti({ ok: true, lette: 122, soloInviti: true, aggiornate: 0, create: 122, nonIscritte: 0 }, 100);
esigi(/122 aziende aggiunte per i soli incontri/.test(tutteCreate.testo) && !tutteCreate.ko,
    'il caso vero: centoventidue aggiunte, nessun allarme', tutteCreate.testo);
esigi(/in elenco ci sono 100 aziende/.test(tutteCreate.testo), 'e quante ne sono finite in elenco');
const miste = fraseEsitoInviti({ ok: true, lette: 10, soloInviti: true, aggiornate: 3, create: 5, nonIscritte: 2, nonTrovate: ['a@b.it', 'c@d.it'] }, 8);
esigi(/3 aziende segnate fra gli iscritti, 5 aziende aggiunte per i soli incontri/.test(miste.testo),
    'le tre strade si leggono separate', miste.testo);
esigi(/a@b.it, c@d.it/.test(miste.testo) && miste.ko,
    'e le righe rimaste indietro si dicono con i loro indirizzi');
const zeroVere = fraseEsitoInviti({ ok: true, lette: 4, soloInviti: true, aggiornate: 0, create: 0, nonIscritte: 4, nonTrovate: ['a@b.it'] }, 0);
esigi(/nessuna azienda segnata/.test(zeroVere.testo) && !/servizio non e ancora/.test(zeroVere.testo),
    'con il servizio nuovo uno zero e uno zero: non si accusa nessuno di essere vecchio', zeroVere.testo);
const normale = fraseEsitoInviti({ ok: true, lette: 50, importate: 48, saltate: 2 });
esigi(/48 righe importate su 50 lette \(2 righe vuote saltate\)/.test(normale.testo) && !normale.ko,
    'e un\'importazione normale resta quella di sempre', normale.testo);

console.log('\n16) Il secondo elenco: di partenza sono spuntate solo le nuove');
/* Il caso vero: cento aziende invitate ieri, venti importate stamattina. Se la
   finestra si aprisse con tutte spuntate - com'era - basterebbe premere Invia
   per rimandare l'invito a chi l'ha gia' ricevuto, e l'unica difesa sarebbe
   togliere cento spunte a mano, che su cento righe non fa nessuno. */
const EV = 'napoli-2026-10-02';
const conInvito = (nome, quando) => ({ riga: { aziendaB2B: { id: 'az-' + nome, evento: EV, quando: quando || 0 } } });
const senzaInvito = () => ({ riga: {} });
const gruppo = (chiave, persone) => ({ chiave: chiave, persone: persone });
const vecchie = [];
for (let i = 0; i < 100; i++) vecchie.push(gruppo('v' + i, [conInvito('v' + i, 1758600000000)]));
const nuove = [];
for (let i = 0; i < 20; i++) nuove.push(gruppo('n' + i, [senzaInvito()]));
const tutte = vecchie.concat(nuove);
esigi(primoInvioB2B(tutte, EV) === false, 'la finestra sa che non e il primo invio');
const spuntate = tutte.filter(g => daSpuntareB2B(g, EV, primoInvioB2B(tutte, EV)));
esigi(spuntate.length === 20 && spuntate.every(g => g.chiave.indexOf('n') === 0),
    'e di partenza sono spuntate le venti nuove, nessuna delle cento di ieri',
    'spuntate: ' + spuntate.length);

console.log('\n17) Al PRIMO invio invece sono spuntate tutte');
/* Quando nessuna e' stata ancora invitata, "solo le nuove" e "tutte" sono la
   stessa cosa: ma se la regola guardasse solo la bandiera, il primo invio si
   aprirebbe con l'elenco giusto per caso. Qui si verifica che ci si arrivi
   apposta. */
const primaVolta = nuove.slice();
esigi(primoInvioB2B(primaVolta, EV) === true, 'nessuna invitata: e il primo invio');
esigi(primaVolta.every(g => daSpuntareB2B(g, EV, true)), 'e sono spuntate tutte, come e sempre stato');

console.log('\n18) L\'invito di un ALTRO evento non conta');
/* Un'impresa invitata a Verona a marzo non e' invitata a Napoli: le schede
   sono le stesse, l'evento no. Senza questo controllo, al primo invio di un
   convegno nuovo meta' elenco risulterebbe gia' invitato e resterebbe fuori. */
const altrove = gruppo('x', [{ riga: { aziendaB2B: { id: 'az-x', evento: 'verona-2026-03-27', quando: 1 } } }]);
esigi(!invitoB2BDi(altrove.persone[0].riga, EV), 'l invito di Verona non vale per Napoli');
esigi(!aziendaGiaInvitata(altrove, EV), 'quindi per Napoli quell azienda e nuova');
esigi(!!invitoB2BDi(altrove.persone[0].riga, 'verona-2026-03-27'), 'ma per Verona resta invitata');
/* Una scheda senza identificativo d'azienda non e' un invito: il servizio lo
   scrive solo quando la mail e' partita davvero. */
esigi(!invitoB2BDi({ aziendaB2B: { id: '', evento: EV } }, EV), 'e una scheda senza id non e un invito');
esigi(!invitoB2BDi({}, EV) && !invitoB2BDi(null, EV), 'ne lo e una scheda che non ne parla');

console.log('\n19) Il referente aggiunto DOPO l\'invito');
/* L'invito e' uno per impresa e il collegamento e' lo stesso per tutti: chi e'
   stato aggiunto dopo non ne ha bisogno di un altro, quindi l'azienda resta
   "gia invitata" e non si ripropone da se'. Ma quanti sono senza si conta,
   perche' e' l'unico caso in cui rimandarlo serve davvero. */
const mista = gruppo('m', [conInvito('m', 1758600000000), senzaInvito()]);
esigi(aziendaGiaInvitata(mista, EV), 'basta un referente con l invito perche l azienda risulti invitata');
esigi(invitatiDelGruppo(mista, EV) === 1 && mista.persone.length === 2,
    'e si sa che uno dei due e arrivato dopo');
esigi(!daSpuntareB2B(mista, EV, false), 'di partenza non si rispunta: il collegamento ce l ha gia');
esigi(invitatiDelGruppo({ persone: [] }, EV) === 0 && !aziendaGiaInvitata(null, EV),
    'e un gruppo vuoto non manda in errore niente');

console.log('\n' + ok + ' verde, ' + ko + ' ROSSO');
process.exit(ko ? 1 : 0);
})();
