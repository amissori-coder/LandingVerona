/* ============================================================
   PROVE - lib/conferma-email.js (conferma dell'indirizzo email)
   ------------------------------------------------------------
       node prove/conferma-email.prove.js

   Niente da installare: Firestore e firebase-admin sono finti e
   stanno qui dentro. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Il baffetto verde nell'elenco deve dire il vero:
     - senza la firma giusta non si conferma niente, e non si legge
       niente;
     - il collegamento di conferma ha un contesto suo: la sua firma
       non apre /completa_iscrizione/, e viceversa;
     - la seconda apertura non sposta la data della prima;
     - la risposta porta nome ed evento, mai email o telefono;
     - il freno e' per scheda: un altro collegamento non ne risente;
     - la mail porta il collegamento sia nell'HTML sia nel testo, e
       senza collegamento resta com'era;
     - il pregresso segna solo chi non ha il campo, non tocca chi ha
       confermato dalla mail, rilanciato non cambia nulla, e non
       tocca gli iscritti di un altro evento.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- orologio ----------
let orologio = Date.parse('2026-09-26T10:00:00+02:00');
const DateVera = Date;
global.Date = class extends DateVera {
    constructor(...a) { if (a.length) super(...a); else super(orologio); }
    static now() { return orologio; }
};

// ---------- Firestore finto ----------
const dati = new Map();
function applica(vecchio, patch, merge) {
    const base = (merge && vecchio) ? Object.assign({}, vecchio) : {};
    for (const k of Object.keys(patch)) {
        if (patch[k] && patch[k].__incrementa) base[k] = (base[k] || 0) + patch[k].__incrementa;
        else base[k] = patch[k];
    }
    return base;
}
function doc(chiave) {
    const self = {
        id: chiave.split('/').pop(),
        get: async () => ({ exists: dati.has(chiave), id: chiave.split('/').pop(), data: () => dati.get(chiave), ref: self }),
        set: async (patch, opz) => { dati.set(chiave, applica(dati.get(chiave), patch, !!(opz && opz.merge))); }
    };
    return self;
}
function collection(nome) {
    const elenco = () => [...dati.keys()].filter(k => k.startsWith(nome + '/'))
        .map(k => ({ id: k.slice(nome.length + 1), data: () => dati.get(k), ref: doc(k) }));
    return {
        doc: (id) => doc(nome + '/' + id),
        get: async () => { const ds = elenco(); return { forEach: f => ds.forEach(f), docs: ds, size: ds.length }; }
    };
}
let commit = 0;
const db = {
    collection: collection,
    batch: () => { const ops = []; return { set: (r, p, o) => ops.push(() => r.set(p, o)), commit: async () => { commit++; for (const f of ops) await f(); } }; }
};
const adminFinto = { firestore: { FieldValue: { increment: n => ({ __incrementa: n }) } } };

// ---------- SMTP finto ----------
const posta = [];
let rompiInvio = 0;
const nodemailerFinto = {
    createTransport: () => ({
        sendMail: async (msg) => {
            if (rompiInvio > 0) { rompiInvio--; throw new Error('server di posta non raggiungibile'); }
            posta.push(msg);
            return { response: '250 ok' };
        }
    })
};

// ---------- intercetta i require ----------
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'firebase-admin') return adminFinto;
    if (nome === 'nodemailer') return nodemailerFinto;
    return veroRequire.apply(this, arguments);
};
process.env.SMTP_HOST = 'smtp.prova'; process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 'p';
process.env.SMTP_FROM_EMAIL = 'noreply@ngb.it';
process.env.NEWSLETTER_SECRET = 'segreto-di-prova';
process.env.APP_BASE_URL = 'https://nextgenerationbusiness.it';

const RADICE = path.join(__dirname, '..');
const CONF = require(path.join(RADICE, 'lib/conferma-email.js'));
const NL = require(path.join(RADICE, 'lib/newsletter.js'));
const MNGB = require(path.join(RADICE, 'lib/mail-ngb.js'));

// ---------- impalcatura ----------
let ok = 0, ko = 0;
function esigi(cond, che) {
    if (cond) { ok++; console.log('  ok   ' + che); }
    else { ko++; console.log('  KO   ' + che); }
}
async function prova(titolo, fn) {
    console.log('\n' + titolo);
    try { await fn(); }
    catch (e) { ko++; console.log('  KO   eccezione: ' + (e && e.stack)); }
}
function azzera() { dati.clear(); commit = 0; posta.length = 0; rompiInvio = 0; orologio = Date.parse('2026-09-26T10:00:00+02:00'); }
const PAGINA = 'Napoli 2 Ottobre 2026 - Manifestazione di interesse';
const ID = 'mario-rossi@esempio-it|20-09-2026 10:00:00';
const ROSSI = { pagina: PAGINA, data: '20/09/2026 10:00:00', nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@esempio.it', telefono: '333', azienda: 'Rossi Srl' };
const token = () => NL.firmaConfermaEmail(ID);

(async () => {

    await prova('La firma: contesto suo, confronto a tempo costante', async () => {
        esigi(NL.firmaConfermaEmail(ID) !== NL.firmaCompleta(ID), 'la firma di conferma non e\' quella di "completa i dati"');
        esigi(NL.firmaConfermaEmailValida(ID, NL.firmaConfermaEmail(ID)), 'la firma giusta passa');
        esigi(!NL.firmaConfermaEmailValida(ID, NL.firmaCompleta(ID)), 'la firma di "completa i dati" NON conferma l\'indirizzo');
        esigi(!NL.firmaCompletaValida(ID, NL.firmaConfermaEmail(ID)), 'e quella di conferma NON apre "completa i dati"');
        esigi(!NL.firmaConfermaEmailValida(ID, ''), 'senza token non passa');
        const link = NL.linkConfermaEmail(ID);
        esigi(link.indexOf('https://nextgenerationbusiness.it/conferma_email/?d=') === 0 && link.indexOf('&t=' + encodeURIComponent(token())) > 0, 'il collegamento porta d e t sulla pagina giusta');
    });

    await prova('Senza firma buona: niente, e nessuna lettura', async () => {
        azzera();
        dati.set('iscrizioni/' + ID, Object.assign({}, ROSSI));
        const r1 = await CONF.conferma(db, { d: ID, t: 'sbagliato' });
        esigi(r1.stato === 403 && r1.corpo.ok === false && !('nome' in r1.corpo), 'firma sbagliata: 403 e nessun dato');
        const r2 = await CONF.conferma(db, { d: ID });
        esigi(r2.stato === 403, 'senza token: 403');
        const r3 = await CONF.conferma(db, { d: 'altro', t: token() });
        esigi(r3.stato === 403, 'la firma di una scheda non vale per un\'altra');
        esigi(!CONF.confermata(dati.get('iscrizioni/' + ID)), 'la scheda e\' rimasta senza conferma');
    });

    await prova('La conferma: idempotente, e risponde il minimo', async () => {
        azzera();
        dati.set('iscrizioni/' + ID, Object.assign({}, ROSSI));
        const r = await CONF.conferma(db, { d: ID, t: token() });
        esigi(r.stato === 200 && r.corpo.ok && r.corpo.gia === false && r.corpo.quando === Date.now(), 'confermato adesso');
        esigi(r.corpo.nome === 'Mario' && r.corpo.evento === 'Napoli 2 Ottobre 2026', 'nome ed evento per la pagina');
        esigi(!('email' in r.corpo) && !('telefono' in r.corpo) && !('cognome' in r.corpo) && !('azienda' in r.corpo), 'niente email, telefono, cognome o azienda');
        const s = dati.get('iscrizioni/' + ID);
        esigi(s.emailConfermata && s.emailConfermata.come === 'mail' && s.emailConfermata.quando === Date.now(), 'sulla scheda: come "mail", con la data');
        esigi(s.nome === 'Mario' && s.telefono === '333', 'il resto della scheda e\' intatto (merge)');
        esigi((dati.get('meta/iscrizioni') || {}).rev === 1, 'la revisione e\' alzata: l\'area riservata rilegge');
        const prima = s.emailConfermata.quando;
        orologio += 60 * 60 * 1000;
        const r2 = await CONF.conferma(db, { d: ID, t: token() });
        esigi(r2.corpo.ok && r2.corpo.gia === true && r2.corpo.quando === prima, 'la seconda apertura dice "gia\'" e tiene la prima data');
        esigi(dati.get('iscrizioni/' + ID).emailConfermata.quando === prima && (dati.get('meta/iscrizioni') || {}).rev === 1, 'e non riscrive niente');
        const n = await CONF.conferma(db, { d: 'x|y', t: NL.firmaConfermaEmail('x|y') });
        esigi(n.stato === 404, 'scheda inesistente con firma buona: 404');
        dati.set('iscrizioni/senza', { pagina: PAGINA, nome: 'Posto', cognome: 'Due' });
        const z = await CONF.conferma(db, { d: 'senza', t: NL.firmaConfermaEmail('senza') });
        esigi(z.stato === 400, 'una scheda-partecipante senza email non ha niente da confermare');
    });

    await prova('Dopo la conferma parte l\'invito, con il PDF, una volta sola', async () => {
        azzera();
        dati.set('iscrizioni/' + ID, Object.assign({}, ROSSI));
        const r = await CONF.conferma(db, { d: ID, t: token() });
        esigi(r.corpo.ok && r.corpo.invito === true && r.corpo.online === false, 'la risposta dice che l\'invito e\' partito');
        esigi(posta.length === 1 && posta[0].to === ROSSI.email, 'una mail, all\'iscritto');
        esigi(/Il tuo invito/.test(posta[0].subject) && /esibiscilo al desk/.test(posta[0].html), 'e\' la mail dell\'invito');
        esigi(/Hotel Eurostars Excelsior/.test(posta[0].html) && /2 ottobre 2026/.test(posta[0].text), 'con giorno e sede di Napoli');
        const all = posta[0].attachments || [];
        esigi(all.length === 1 && all[0].contentType === 'application/pdf' && /^Invito-NGB-Mario-Rossi\.pdf$/.test(all[0].filename), 'con l\'invito in PDF allegato');
        esigi(Buffer.isBuffer(all[0].content) && all[0].content.slice(0, 5).toString('latin1') === '%PDF-' && /%%EOF/.test(all[0].content.toString('latin1')), 'e il PDF e\' un PDF intero');
        const s = dati.get('iscrizioni/' + ID);
        esigi(s.mailInvito && s.mailInvito.ok === true, 'sulla scheda: invito partito');
        const r2 = await CONF.conferma(db, { d: ID, t: token() });
        esigi(r2.corpo.gia === true && posta.length === 1, 'la seconda apertura non rimanda l\'invito');
    });

    await prova('Chi segue online riceve la conferma senza PDF; se la posta e\' giu\' la conferma resta', async () => {
        azzera();
        dati.set('iscrizioni/on', Object.assign({}, ROSSI, { email: 'on@line.it', modalita: 'online' }));
        const r = await CONF.conferma(db, { d: 'on', t: NL.firmaConfermaEmail('on') });
        esigi(r.corpo.invito === true && r.corpo.online === true, 'online: mail partita, segnalato come online');
        esigi(posta.length === 1 && !posta[0].attachments && /Indirizzo confermato/.test(posta[0].subject) && /collegamento/.test(posta[0].html), 'senza allegato, con il promemoria del collegamento');
        azzera();
        dati.set('iscrizioni/' + ID, Object.assign({}, ROSSI));
        rompiInvio = 1;
        const k = await CONF.conferma(db, { d: ID, t: token() });
        esigi(k.corpo.ok && k.corpo.gia === false && k.corpo.invito === false, 'posta giu\': l\'indirizzo e\' confermato lo stesso, l\'invito no');
        const s = dati.get('iscrizioni/' + ID);
        esigi(s.emailConfermata.come === 'mail' && s.mailInvito.ok === false && /non raggiungibile/.test(s.mailInvito.errore), 'sulla scheda: confermato, invito non partito con il motivo');
    });

    await prova('Il freno e\' per scheda', async () => {
        azzera();
        dati.set('iscrizioni/' + ID, Object.assign({}, ROSSI));
        dati.set('iscrizioni/altra', Object.assign({}, ROSSI, { email: 'anna@bianchi.it' }));
        let ultimo = null;
        for (let i = 0; i < CONF.RL_MAX + 2; i++) ultimo = await CONF.conferma(db, { d: ID, t: token() });
        esigi(ultimo.stato === 429, 'dopo ' + CONF.RL_MAX + ' tentativi la stessa scheda e\' frenata');
        const a = await CONF.conferma(db, { d: 'altra', t: NL.firmaConfermaEmail('altra') });
        esigi(a.stato === 200 && a.corpo.ok, 'un\'altra scheda passa lo stesso');
    });

    await prova('La mail: il collegamento sta nell\'HTML e nel testo', async () => {
        const link = NL.linkConfermaEmail(ID);
        const m = MNGB.confermaSito({ nome: 'Mario', cognome: 'Rossi', email: ROSSI.email, azienda: 'Rossi Srl', pagina: PAGINA, data: ROSSI.data }, NL.linkCompleta(ID), link);
        const attesoHtml = 'href="' + link.replace(/&/g, '&amp;') + '"';
        esigi(m.html.indexOf(attesoHtml) > 0, 'il pulsante punta al collegamento di conferma');
        esigi(m.html.indexOf('Conferma il tuo indirizzo email') > 0, 'con il testo del pulsante');
        esigi(m.html.indexOf(attesoHtml) < m.html.indexOf('Modifica o annulla'), 'e sta PRIMA del pulsante "modifica o annulla"');
        esigi(m.html.split(attesoHtml).length - 1 >= 2, 'l\'indirizzo c\'e\' anche in chiaro sotto il pulsante');
        esigi(m.html.indexOf('height="48"') > 0 && m.html.indexOf('display:block;padding:13px') > 0, 'il pulsante e\' alto almeno 44px, a blocco pieno');
        const righe = m.testo.split('\n\n');
        esigi(righe[2] === 'Conferma il tuo indirizzo email (un clic): ' + link, 'nel testo semplice il collegamento e\' subito dopo il saluto');
        const senza = MNGB.confermaSito({ nome: 'Mario', cognome: 'Rossi', email: ROSSI.email, pagina: PAGINA, data: ROSSI.data }, NL.linkCompleta(ID));
        esigi(senza.html.indexOf('Conferma il tuo indirizzo') < 0 && senza.testo.indexOf('conferma_email') < 0, 'senza collegamento la mail resta com\'era');
        const dm = CONF.mailDiConferma(ID, ROSSI);
        esigi(dm && dm.to === ROSSI.email && dm.html.indexOf(attesoHtml) > 0, 'la mail rimandata dall\'area riservata e\' la stessa, allo stesso indirizzo');
        esigi(CONF.mailDiConferma('x', { nome: 'Senza' }) === null, 'senza indirizzo non c\'e\' mail');
    });

    await prova('Il pregresso: d\'ufficio, solo chi non ha il campo, solo quell\'evento', async () => {
        azzera();
        dati.set('iscrizioni/a', Object.assign({}, ROSSI));
        dati.set('iscrizioni/b', Object.assign({}, ROSSI, { email: 'anna@bianchi.it', pagina: 'Napoli 2 Ottobre 2026' }));
        dati.set('iscrizioni/c', Object.assign({}, ROSSI, { email: 'gia@mail.it', emailConfermata: { quando: 5, come: 'mail' } }));
        dati.set('iscrizioni/v', Object.assign({}, ROSSI, { email: 'verona@x.it', pagina: 'Verona 20 Marzo 2026' }));
        const r = await CONF.pregresso(db, { filtro: 'napoli', da: 'admin@revilaw.it' });
        esigi(r.stato === 200 && r.corpo.segnate === 2 && r.corpo.giaConfermate === 1, 'due segnate, una era gia\' confermata');
        esigi(dati.get('iscrizioni/a').emailConfermata.come === 'pregresso' && dati.get('iscrizioni/a').emailConfermata.da === 'admin@revilaw.it', 'come "pregresso", con chi lo ha lanciato');
        esigi(dati.get('iscrizioni/b').emailConfermata.come === 'pregresso', 'anche la scheda con il titolo corto (inserita a mano)');
        esigi(dati.get('iscrizioni/c').emailConfermata.come === 'mail' && dati.get('iscrizioni/c').emailConfermata.quando === 5, 'chi ha confermato dalla mail resta com\'era');
        esigi(!dati.get('iscrizioni/v').emailConfermata, 'l\'iscritto di Verona non e\' toccato');
        esigi((dati.get('meta/iscrizioni') || {}).rev === 1, 'revisione alzata una volta');
        const r2 = await CONF.pregresso(db, { filtro: 'napoli', da: 'admin@revilaw.it' });
        esigi(r2.corpo.segnate === 0 && r2.corpo.giaConfermate === 3 && (dati.get('meta/iscrizioni') || {}).rev === 1, 'rilanciato: niente da segnare, niente riscritto');
        const v = await CONF.pregresso(db, {});
        esigi(v.stato === 400, 'senza evento e\' rifiutato');
    });

    console.log('\n' + ok + ' ok, ' + ko + ' ko');
    process.exit(ko ? 1 : 0);
})();
