/* ============================================================
   PROVE - api/iscrizione-nuova.js, la casella "Sono un aderente"
   ------------------------------------------------------------
       node prove/iscrizione-aderente.prove.js

   Niente da installare: Firestore, la posta e le librerie pesanti
   sono finte e stanno qui dentro.

   COSA DIMOSTRANO. Il modulo di Napoli ha una casella che mette chi
   si iscrive direttamente nella sezione "Aderenti Revilaw". E' una
   comodita' con un confine da tenere fermo: la casella e' l'UNICA
   strada. Questo endpoint e' pubblico - lo chiama il visitatore - e
   se bastasse spedirgli un campo qualunque per scegliersi la sezione,
   "aderenti" smetterebbe di voler dire qualcosa.

   Qui si verifica che:
     - la casella scriva la dichiarazione E la sezione;
     - un "modalita": "aderenti" spedito a mano venga ignorato, con o
       senza casella - le sole modalita' che il modulo puo' dichiarare
       restano "presenza" e "online";
     - senza casella non si scriva niente: il campo assente vale no, e
       un "false" su ogni iscrizione di ogni altro modulo del sito
       sarebbe rumore;
     - la conferma automatica parta lo stesso, e non prometta un posto
       in sala a chi si iscrive online;
     - la lista d'attesa per la sala si scriva sulla scheda e si legga
       nella conferma, ma solo dove un posto in sala non c'e': accanto a
       "presenza" o a un aderente sarebbe una riga che contraddice la
       mail che la contiene.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- Firestore finto ----------
let scritte = {};
const admin = {
    initializeApp() { }, credential: { cert: () => ({}) }, apps: [],
    firestore: () => db
};
admin.firestore.FieldValue = { serverTimestamp: () => 0, increment: n => ({ __inc: n }), arrayUnion: function () { return {}; } };
const db = {
    collection(coll) {
        return {
            doc(id) {
                return {
                    id: id,
                    async get() { return { exists: false, data: () => ({}) }; },
                    async set(patch) { scritte[coll + '/' + id] = Object.assign({}, scritte[coll + '/' + id] || {}, patch); }
                };
            }
        };
    }
};

// ---------- posta finta ----------
let spedite = [];

const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return admin;
    if (nome === 'nodemailer') return { createTransport: () => ({ sendMail: async m => { spedite.push(m); return {}; } }) };
    if (nome === 'imapflow') return { ImapFlow: function () { } };
    if (nome === 'google-auth-library') return { JWT: function () { }, GoogleAuth: function () { } };
    return veroRequire.apply(this, arguments);
};

process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    client_email: 'servizio@esempio.iam.gserviceaccount.com', private_key: 'chiave-finta'
});
process.env.SMTP_FROM_EMAIL = 'noreply@esempio.it';

const RADICE = path.join(__dirname, '..');
const iscrizione = require(path.join(RADICE, 'api/iscrizione-nuova.js'));

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  verde  ' + cosa); }
    else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); }
}
const PAGINA = 'Napoli 2 Ottobre 2026 - Manifestazione di interesse';
async function iscrivi(campi) {
    scritte = {}; spedite = [];
    let stato = 0, risposta = null;
    const res = {
        setHeader() { }, status(s) { stato = s; return res; },
        json(c) { risposta = c; return res; }, end() { return res; }
    };
    await iscrizione({
        method: 'POST', headers: { 'x-forwarded-for': '1.2.3.' + Math.floor(Math.random() * 250) },
        body: Object.assign({
            pagina: PAGINA, nome: 'Mario', cognome: 'Rossi', email: 'mario' + Object.keys(campi).length + '@studio.it',
            privacy: true, marketing: true
        }, campi)
    }, res);
    const scheda = Object.keys(scritte).filter(k => k.indexOf('iscrizioni/') === 0).map(k => scritte[k])[0] || null;
    return { stato: stato, corpo: risposta || {}, scheda: scheda };
}

const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

prova('La casella mette nella sezione degli aderenti', async () => {
    const r = await iscrivi({ aderente: true });
    esigi(r.corpo.ok === true, 'l\'iscrizione va a buon fine', JSON.stringify(r.corpo));
    esigi(r.scheda && r.scheda.aderente === true, 'la dichiarazione resta scritta sulla scheda');
    esigi(r.scheda && r.scheda.modalita === 'aderenti', 'e la sezione e gia quella giusta', JSON.stringify(r.scheda && r.scheda.modalita));
    esigi(spedite.length === 1, 'la conferma automatica parte lo stesso');
    esigi(!/partecipazione online/i.test(spedite[0] ? spedite[0].html : ''), 'e non parla di partecipazione online');
});

prova('Vale anche scritta come la scrivono i moduli ("si", "true")', async () => {
    for (const v of [true, 'si', 'true', 'on', '1']) {
        const r = await iscrivi({ aderente: v });
        esigi(r.scheda && r.scheda.modalita === 'aderenti', 'accetta ' + JSON.stringify(v));
    }
});

prova('Senza casella non si scrive niente', async () => {
    const r = await iscrivi({});
    esigi(r.scheda && r.scheda.aderente === undefined, 'nessuna dichiarazione');
    esigi(r.scheda && r.scheda.modalita === undefined, 'nessuna sezione: vuoto vale "in presenza"');
    const no = await iscrivi({ aderente: false });
    esigi(no.scheda && no.scheda.modalita === undefined, 'e un "false" esplicito non cambia niente');
});

prova('La sezione non si sceglie spedendo un campo a mano', async () => {
    /* Il confine che regge tutto: questo endpoint e' pubblico. Se bastasse
       spedire modalita: "aderenti" per entrarci, la sezione non direbbe piu'
       niente - e la casella, che almeno e' una dichiarazione consapevole,
       sarebbe una formalita'. */
    const r = await iscrivi({ modalita: 'aderenti' });
    esigi(r.scheda && r.scheda.modalita === undefined, 'un "modalita: aderenti" spedito a mano viene ignorato',
        JSON.stringify(r.scheda && r.scheda.modalita));
    const inventata = await iscrivi({ modalita: 'vip' });
    esigi(inventata.scheda && inventata.scheda.modalita === undefined, 'e una modalita inventata pure');
    const online = await iscrivi({ modalita: 'online' });
    esigi(online.scheda && online.scheda.modalita === 'online', 'restano buone le due che il modulo puo dichiarare: online...');
    const presenza = await iscrivi({ modalita: 'presenza' });
    esigi(presenza.scheda && presenza.scheda.modalita === 'presenza', '...e presenza');
});

prova('Chi si iscrive online lo legge nella conferma', async () => {
    const r = await iscrivi({ modalita: 'online' });
    esigi(/partecipazione online/i.test(spedite[0] ? spedite[0].html : ''), 'la mail parla di partecipazione online');
    esigi(!/posto è riservato/i.test(spedite[0] ? spedite[0].html : ''), 'e non promette un posto in sala');
    esigi(r.scheda.modalita === 'online', 'la scheda dice online');
});

prova('La lista d\'attesa per la sala si scrive, e la conferma la dice', async () => {
    /* La sala di Napoli e' piena: chi si iscrive segue online E resta in coda.
       Deve risultare in due posti - sulla scheda, perche' quando un posto si
       libera bisogna sapere chi chiamare, e nella mail, perche' altrimenti la
       coda esiste solo per chi organizza e chi aspetta non sa di aspettare. */
    const r = await iscrivi({ modalita: 'online', listaAttesa: true });
    esigi(r.scheda && r.scheda.listaAttesa === true, 'la scheda tiene la coda');
    esigi(/lista d.attesa/i.test(spedite[0] ? spedite[0].html : ''), 'la conferma dice che e in lista d\'attesa');
    esigi(/lista d.attesa/i.test(spedite[0] ? spedite[0].text : ''), 'anche la versione senza formattazione');
    esigi(/partecipazione online/i.test(spedite[0] ? spedite[0].html : ''), 'e resta una partecipazione online');
});

prova('Una coda accanto a un posto in sala non vuol dire niente', async () => {
    /* "In lista d'attesa" ha senso solo dove un posto non c'e'. Accanto a
       "presenza" - o a un modulo che la modalita' non la chiede affatto - e'
       una riga che contraddice la mail che la contiene. */
    const inSala = await iscrivi({ modalita: 'presenza', listaAttesa: true });
    esigi(inSala.scheda && inSala.scheda.listaAttesa === undefined, 'con "presenza" si ignora');
    esigi(!/lista d.attesa/i.test(spedite[0] ? spedite[0].html : ''), 'e la conferma non ne parla');
    const muto = await iscrivi({ listaAttesa: true });
    esigi(muto.scheda && muto.scheda.listaAttesa === undefined, 'senza modalita pure');
    const aderente = await iscrivi({ aderente: true, modalita: 'online', listaAttesa: true });
    esigi(aderente.scheda && aderente.scheda.listaAttesa === undefined, 'e un aderente, che in sala entra, non finisce in coda');
});

prova('Senza il campo non si scrive niente', async () => {
    const r = await iscrivi({ modalita: 'online' });
    esigi(r.scheda && r.scheda.listaAttesa === undefined, 'nessuna coda: il campo assente vale "no"');
    esigi(!/lista d.attesa/i.test(spedite[0] ? spedite[0].html : ''), 'e la conferma online resta quella di prima');
    const no = await iscrivi({ modalita: 'online', listaAttesa: false });
    esigi(no.scheda && no.scheda.listaAttesa === undefined, 'e un "false" esplicito non cambia niente');
});

(async () => {
    for (const p of prove) { console.log('\n' + p.titolo); await p.fn(); }
    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})();
