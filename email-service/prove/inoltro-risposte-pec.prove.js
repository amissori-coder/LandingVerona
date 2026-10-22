/* ============================================================
   PROVE - le risposte alle PEC dell'invito, inoltrate per email
   (lib/inoltro-risposte-pec.js, agganciato a lib/lettore-pec.js)
   ------------------------------------------------------------
       node prove/inoltro-risposte-pec.prove.js

   Firestore, la casella PEC (imapflow) e la posta sono finti. Si
   verifica che:
     - una risposta riconosciuta finisce in coda, una volta sola anche
       se il messaggio si rilegge; le risposte automatiche e quelle di
       piu' di un mese fa no;
     - l'inoltro manda UNA mail agli organizzatori (gli stessi del
       riepilogo, o PEC_RISPOSTE_DESTINATARI), con l'azienda, il
       mittente, l'oggetto, il codice e il testo della risposta preso
       DENTRO la busta (postacert.eml), gli accenti giusti e gli
       allegati allegati; rispondendo si scrive all'azienda;
     - un messaggio solo HTML arriva come testo leggibile;
     - un allegato troppo grande non viaggia, ma si dice che c'e';
     - se la posta non parte si riprova al giro dopo, al massimo cinque
       volte; una riga presa da un altro giro non si tocca finche' la
       presa non scade;
     - se la cartella e' stata rigenerata la mail parte lo stesso, e dice
       che il testo e' nella casella; se cade la connessione la riga
       resta in attesa;
     - oltre la scadenza del giro, o senza posta configurata, non parte
       niente e le righe aspettano;
     - un giro completo del lettore legge la risposta e la inoltra subito;
     - il testo aperto dall'area riservata (leggiMessaggio) non rovina gli
       accenti dei messaggi in iso-8859-1.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');
const { Readable } = require('stream');

/* ---------- Firestore finto ---------- */
const dati = new Map();
const copia = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function fondi(a, b) {
    const out = Object.assign({}, a || {});
    Object.keys(b || {}).forEach(k => {
        const v = b[k];
        out[k] = (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]))
            ? fondi(out[k], v) : copia(v);
    });
    return out;
}
function doc(coll, id) {
    const k = coll + '/' + id;
    return {
        id: id,
        get: async () => ({ id: id, exists: dati.has(k), data: () => copia(dati.get(k)) }),
        set: async (p, o) => { dati.set(k, (o && o.merge) ? fondi(dati.get(k), p) : copia(p)); },
        delete: async () => { dati.delete(k); }
    };
}
function interroga(coll, filtri, quante) {
    const q = {
        where: (campo, op, val) => interroga(coll, filtri.concat([[campo, op, val]]), quante),
        limit: n => interroga(coll, filtri, n),
        get: async () => {
            let docs = [...dati.keys()].filter(k => k.startsWith(coll + '/'))
                .map(k => ({ id: k.slice(coll.length + 1), data: () => copia(dati.get(k)) }))
                .filter(d => filtri.every(([c, op, v]) => op === '==' && (d.data() || {})[c] === v));
            if (quante) docs = docs.slice(0, quante);
            return { forEach: f => docs.forEach(f), size: docs.length, docs: docs };
        }
    };
    return q;
}
const db = {
    collection: c => Object.assign({ doc: id => doc(c, id) }, interroga(c, [], 0)),
    batch: () => {
        const op = [];
        return { set: (r, p, o) => op.push(() => r.set(p, o)), delete: r => op.push(() => r.delete()), commit: async () => { for (const f of op) await f(); } };
    },
    runTransaction: async fn => {
        const scr = [];
        const r = await fn({ get: x => x.get(), set: (x, p, o) => scr.push([x, p, o]) });
        for (const [x, p, o] of scr) await x.set(p, o);
        return r;
    }
};
const leggi = (c, id) => copia(dati.get(c + '/' + id));
const righe = () => [...dati.keys()].filter(k => k.startsWith('pecInoltri/')).map(k => Object.assign({ id: k.slice(11) }, dati.get(k)));

/* ---------- posta finta ---------- */
let spedite = [];
let postaGiu = 0;
/* ---------- casella finta ---------- */
let casella = { uidValidity: 777, messaggi: new Map() };
class ClientFinto {
    constructor() { this.usable = true; this.cadeAlDownload = false; ClientFinto.ultimo = this; }
    on() { }
    async connect() { }
    async mailboxOpen() { return { uidValidity: casella.uidValidity, uidNext: Math.max(0, ...casella.messaggi.keys()) + 1 }; }
    async *fetch(q) {
        const [a, b] = String(q.uid).split(':').map(Number);
        for (const [uid, m] of [...casella.messaggi.entries()].sort((x, y) => x[0] - y[0])) {
            if (uid >= a && uid <= b) yield { uid: uid, size: m.size || 1000, internalDate: new Date(m.quando), headers: Buffer.from(m.headers), bodyStructure: m.struttura };
        }
    }
    async download(uid, parte) {
        if (this.cadeAlDownload) { this.usable = false; throw new Error('connessione caduta'); }
        const m = casella.messaggi.get(Number(uid));
        const p = m && m.parti[parte];
        if (!p) return {};
        return { meta: p.meta || {}, content: Readable.from([p.buf]) };
    }
    async logout() { }
    close() { }
}
const clientDiProva = () => new ClientFinto();

const veroRequire = Module.prototype.require;
Module.prototype.require = function (n) {
    if (n === 'nodemailer') {
        return { createTransport: () => ({ sendMail: async m => { if (postaGiu > 0) { postaGiu--; throw new Error('posta giu\''); } spedite.push(m); return {}; }, close() { } }) };
    }
    if (n === 'imapflow') return { ImapFlow: ClientFinto };
    return veroRequire.apply(this, arguments);
};

process.env.SMTP_HOST = 'smtp.esempio.it';
process.env.SMTP_USER = 'utente';
process.env.SMTP_PASS = 'segreta';
process.env.SMTP_FROM_EMAIL = 'noreply@esempio.it';
process.env.PEC_IMAP_USER = 'studio@pec.esempio.it';
process.env.PEC_IMAP_PASS = 'segreta';
delete process.env.RIEPILOGO_DESTINATARI;
delete process.env.PEC_RISPOSTE_DESTINATARI;

const radice = path.join(__dirname, '..');
const D = require(path.join(radice, 'lib/daticert'));
const LETTORE = require(path.join(radice, 'lib/lettore-pec'));
const INOLTRO = require(path.join(radice, 'lib/inoltro-risposte-pec'));
const MNGB = require(path.join(radice, 'lib/mail-ngb'));

let ok = 0, ko = 0;
function esigi(c, cosa, extra) { if (c) { ok++; console.log('  verde  ' + cosa); } else { ko++; console.log('  ROSSO  ' + cosa + (extra ? '   ' + extra : '')); } }

const ORA = Date.now();
const GIORNO = 24 * 60 * 60 * 1000;
const ORGANIZZATORI = 'andreamissori@revilaw.it, pierluigisterzi@revilaw.it, ombrettamagaraci@revilaw.it, sergiomiele@revilaw.it, vincenzoantonionapolitano@revilaw.it';

/* Una risposta PEC come arriva davvero: la busta del gestore con il suo
   testo, e dentro postacert.eml con il messaggio dell'azienda. Il testo
   dichiarato iso-8859-1 arriva da imapflow gia' convertito in UTF-8. */
function intestazioniRisposta(o) {
    return [
        'Message-ID: ' + (o.msgId || '<opec.risposta.1@pec.alfa.it>'),
        'In-Reply-To: ' + (o.inReplyTo || '<opec.invito.1@pec.aruba.it>'),
        'From: "Per conto di: alfa@pec.alfa.it" <posta-certificata@pec.aruba.it>',
        'Reply-To: alfa@pec.alfa.it',
        'Subject: ' + (o.oggetto || 'POSTA CERTIFICATA: Re: Invito - Next Generation Business'),
        'X-Trasporto: ' + (o.trasporto || 'posta-certificata'),
        o.extra || ''
    ].filter(Boolean).join('\r\n') + '\r\n';
}
function struttura(o) {
    o = o || {};
    const dentro = [];
    if (!o.soloHtml) dentro.push({ part: '2.1', type: 'text/plain', parameters: { charset: 'iso-8859-1' }, size: 120 });
    else dentro.push({ part: '2.1', type: 'text/html', parameters: { charset: 'utf-8' }, size: 300 });
    dentro.push({ part: '2.2', type: 'application/pdf', disposition: 'attachment', dispositionParameters: { filename: 'adesione.pdf' }, size: o.pdf || 2000 });
    return {
        type: 'multipart/mixed', childNodes: [
            { part: '1', type: 'text/plain', parameters: { charset: 'utf-8' }, size: 400 },
            {
                part: '2', type: 'message/rfc822', parameters: { name: 'postacert.eml' }, dispositionParameters: { filename: 'postacert.eml' }, size: 4000,
                childNodes: [{ part: '2', type: 'multipart/mixed', childNodes: dentro }]
            },
            { part: '3', type: 'application/xml', dispositionParameters: { filename: 'daticert.xml' }, size: 900 },
            { part: '4', type: 'application/pkcs7-signature', dispositionParameters: { filename: 'smime.p7s' }, size: 3000 }
        ]
    };
}
function messaggio(uid, o) {
    o = o || {};
    casella.messaggi.set(uid, {
        quando: o.quando || ORA - 60000,
        headers: intestazioniRisposta(o),
        struttura: struttura(o),
        parti: {
            '1': { buf: Buffer.from('Messaggio di posta certificata: il giorno ... e\' stato inviato da ...', 'utf8'), meta: { charset: 'utf-8', contentType: 'text/plain' } },
            '2.1': o.soloHtml
                ? { buf: Buffer.from('<html><head><style>p{color:red}</style></head><body><p>Grazie dell&#39;invito, ci sar&agrave; il nostro CFO.</p><div>Cordiali saluti<br>Mario Rossi</div></body></html>', 'utf8'), meta: { charset: 'utf-8', contentType: 'text/html' } }
                : { buf: Buffer.from(o.testo || 'Parteciperemo volentieri: è un piacere.\r\n\r\nMario Rossi\r\nAlfa S.r.l.', 'utf8'), meta: { charset: 'utf-8', contentType: 'text/plain' } },
            '2.2': { buf: Buffer.alloc(Math.min(o.pdf || 2000, 6 * 1024 * 1024), 7), meta: { contentType: 'application/pdf', disposition: 'attachment', filename: 'adesione.pdf' } }
        }
    });
}
function scheda(id, o) {
    dati.set('aziendeInvito/' + id, Object.assign({
        ragioneSociale: 'Alfa S.r.l.', pec: 'alfa@pec.alfa.it', evento: 'milano-2027-02-26', stato: 'inviata', codice: 'KK22K',
        invio: { quando: ORA - 5 * GIORNO, canale: 'pec', destinatario: 'alfa@pec.alfa.it', riferimento: '<ngb.aaaa@revilaw.it>', pecMsgId: '<opec.invito.1@pec.aruba.it>' }
    }, o || {}));
}
function riferimento(msgid, idScheda) {
    dati.set('pecRiferimenti/m~' + D.chiaveMsgId(msgid), { msgid: msgid, scheda: idScheda, evento: 'milano-2027-02-26', destinatario: 'alfa@pec.alfa.it', gestore: true });
}
async function lavora(client, uid) {
    const m = casella.messaggi.get(uid);
    const conto = { letti: 0, ricevute: 0, risposte: 0, estranei: 0, nonRiconosciute: 0 };
    return LETTORE._interni.lavoraMessaggio(db, client, { uid: uid, internalDate: new Date(m.quando), headers: Buffer.from(m.headers), bodyStructure: m.struttura }, String(casella.uidValidity), conto, {}, []);
}
const lontano = () => Date.now() + 60000;
function azzera() { dati.clear(); spedite = []; postaGiu = 0; casella = { uidValidity: 777, messaggi: new Map() }; delete process.env.PEC_RISPOSTE_DESTINATARI; }

(async () => {
    console.log('\nIn coda');
    azzera();
    scheda('s1');
    riferimento('<opec.invito.1@pec.aruba.it>', 's1');
    messaggio(10);
    let client = clientDiProva();
    let r = await lavora(client, 10);
    esigi(r.tipo === 'risposta' && r.scheda === 's1', 'la risposta e\' riconosciuta', JSON.stringify(r));
    esigi(leggi('aziendeInvito', 's1').stato === 'risposta', 'la scheda passa a "risposta"');
    let coda = righe();
    esigi(coda.length === 1 && coda[0].stato === 'da-inviare' && coda[0].scheda === 's1' && coda[0].uid === 10, 'una riga in coda per l\'inoltro', JSON.stringify(coda));
    esigi(coda[0].id === 'm~' + D.chiaveMsgId('<opec.risposta.1@pec.alfa.it>'), 'la chiave e\' il Message-ID del messaggio');
    esigi(!('testo' in coda[0]) && coda[0].da === 'alfa@pec.alfa.it' && /Re: Invito/.test(coda[0].oggetto), 'in coda le coordinate, non il testo');
    await lavora(client, 10);
    casella.messaggi.set(11, Object.assign({}, casella.messaggi.get(10)));  // lo stesso messaggio con un altro uid (cartella rigenerata)
    await lavora(client, 11);
    esigi(righe().length === 1, 'lo stesso messaggio riletto non si accoda due volte', righe().length);

    messaggio(12, { msgId: '<auto.1@pec.alfa.it>', oggetto: 'POSTA CERTIFICATA: Risposta automatica: fuori sede' });
    await lavora(client, 12);
    esigi(righe().length === 1, 'una risposta automatica non si inoltra');
    messaggio(13, { msgId: '<vecchia.1@pec.alfa.it>', quando: ORA - 40 * GIORNO });
    await lavora(client, 13);
    esigi(righe().length === 1, 'una risposta di piu\' di un mese fa non si inoltra');

    console.log('\nL\'inoltro');
    let e = await INOLTRO.inoltra(db, client, { uidValidity: '777', scadenza: lontano(), casella: 'studio@pec.esempio.it' });
    esigi(e.inoltrate === 1 && spedite.length === 1, 'parte una mail', JSON.stringify(e));
    let m = spedite[0] || {};
    esigi(m.to === ORGANIZZATORI, 'agli organizzatori del riepilogo', m.to);
    esigi(m.subject === 'Risposta alla PEC dell\'invito - Alfa S.r.l.', 'oggetto con l\'azienda', m.subject);
    esigi(m.replyTo === undefined && /Per rispondere scrivi dalla casella studio@pec\.esempio\.it a alfa@pec\.alfa\.it/.test(m.text), '"Rispondi" non porta alla PEC dell\'azienda (rifiuterebbe la posta ordinaria): la mail dice da dove rispondere', m.replyTo);
    esigi(/Parteciperemo volentieri: è un piacere\./.test(m.text) && /Parteciperemo volentieri: è un piacere\./.test(m.html), 'il testo della risposta, preso dentro la busta, con gli accenti giusti');
    esigi(!/Ã/.test(m.text) && !/Messaggio di posta certificata/.test(m.text), 'niente "Ã¨" e niente testo del gestore');
    esigi(/Mario Rossi<br>Alfa S\.r\.l\./.test(m.html), 'gli a capo dell\'originale restano a capo');
    esigi(/KK22K/.test(m.html) && /alfa@pec\.alfa\.it/.test(m.html) && /Re: Invito - Next Generation Business/.test(m.html), 'codice, mittente e oggetto nel riquadro');
    esigi(/Milano/.test(m.html) && /Excelsior Hotel Gallia/.test(m.html), 'vestita come le mail dell\'evento di Milano');
    esigi(/area-riservata\/#eventi/.test(m.html), 'con il collegamento all\'area riservata');
    esigi(Array.isArray(m.attachments) && m.attachments.length === 1 && m.attachments[0].filename === 'adesione.pdf' && m.attachments[0].content.length === 2000 && m.attachments[0].contentType === 'application/pdf', 'l\'allegato dell\'azienda e\' allegato', JSON.stringify((m.attachments || []).map(a => a.filename)));
    esigi(!(m.attachments || []).some(a => /daticert|smime|postacert/.test(a.filename)), 'senza le parti di servizio della PEC');
    esigi(righe()[0].stato === 'inviata' && righe()[0].a === 5, 'la riga e\' segnata come inviata');
    e = await INOLTRO.inoltra(db, client, { uidValidity: '777', scadenza: lontano() });
    esigi(e.inoltrate === 0 && spedite.length === 1, 'al giro dopo non riparte');

    console.log('\nSolo HTML, allegato grande, campagna sponsor');
    azzera();
    scheda('s2', { campagna: 'sponsor', ragioneSociale: 'Beta S.p.A.', email: 'Info@Beta.it' });
    riferimento('<opec.invito.2@pec.aruba.it>', 's2');
    messaggio(20, { msgId: '<html.1@pec.beta.it>', inReplyTo: '<opec.invito.2@pec.aruba.it>', soloHtml: true, pdf: 5 * 1024 * 1024 });
    client = clientDiProva();
    await lavora(client, 20);
    await INOLTRO.inoltra(db, client, { uidValidity: '777', scadenza: lontano() });
    m = spedite[0] || {};
    esigi(/Grazie dell'invito, ci sarà il nostro CFO\./.test(m.text) && /Cordiali saluti\nMario Rossi/.test(m.text), 'dall\'HTML un testo leggibile, entita\' comprese', m.text && m.text.slice(0, 400));
    esigi(!/<p>|color:red/.test(m.text), 'senza tag e senza stili');
    esigi(!m.attachments && /adesione\.pdf/.test(m.html) && /Troppo grande per questa email/.test(m.html), 'un allegato troppo grande non viaggia, ma si dice che c\'e\'');
    esigi(m.subject === 'Risposta alla PEC di sponsorizzazione - Beta S.p.A.', 'sulla campagna sponsor lo dice', m.subject);
    esigi(m.replyTo === 'info@beta.it' && /indirizzo email ordinario dell'azienda \(info@beta\.it\)/.test(m.text), 'con l\'email ordinaria sulla scheda, "Rispondi" porta li\'', m.replyTo);

    console.log('\nQuando la posta non parte');
    azzera();
    scheda('s1');
    riferimento('<opec.invito.1@pec.aruba.it>', 's1');
    messaggio(30);
    client = clientDiProva();
    await lavora(client, 30);
    postaGiu = 1;
    e = await INOLTRO.inoltra(db, client, { uidValidity: '777', scadenza: lontano() });
    let riga = righe()[0];
    esigi(e.fallite === 1 && spedite.length === 0 && riga.stato === 'da-inviare' && riga.tentativi === 1 && /posta giu/.test(riga.errore), 'la riga torna in attesa, con il motivo', JSON.stringify(riga));
    e = await INOLTRO.inoltra(db, client, { uidValidity: '777', scadenza: lontano() });
    esigi(e.inoltrate === 1 && spedite.length === 1 && righe()[0].stato === 'inviata', 'al giro dopo parte');

    azzera();
    scheda('s1');
    riferimento('<opec.invito.1@pec.aruba.it>', 's1');
    messaggio(31);
    client = clientDiProva();
    await lavora(client, 31);
    for (let i = 0; i < 5; i++) { postaGiu = 1; await INOLTRO.inoltra(db, client, { uidValidity: '777', scadenza: lontano() }); }
    esigi(righe()[0].stato === 'non-inviata' && righe()[0].tentativi === 5, 'dopo cinque tentativi si smette', JSON.stringify(righe()[0]));
    await INOLTRO.inoltra(db, client, { uidValidity: '777', scadenza: lontano() });
    esigi(spedite.length === 0, 'e non si riprova piu\'');

    console.log('\nLe prese');
    azzera();
    scheda('s1');
    riferimento('<opec.invito.1@pec.aruba.it>', 's1');
    messaggio(40);
    client = clientDiProva();
    await lavora(client, 40);
    const id = righe()[0].id;
    dati.set('pecInoltri/' + id, Object.assign(leggi('pecInoltri', id), { stato: 'in-invio', fino: Date.now() + 120000, tentativi: 1 }));
    await INOLTRO.inoltra(db, client, { uidValidity: '777', scadenza: lontano() });
    esigi(spedite.length === 0, 'una riga presa da un altro giro non si tocca');
    dati.set('pecInoltri/' + id, Object.assign(leggi('pecInoltri', id), { fino: Date.now() - 1000 }));
    await INOLTRO.inoltra(db, client, { uidValidity: '777', scadenza: lontano() });
    esigi(spedite.length === 1 && righe()[0].stato === 'inviata' && righe()[0].tentativi === 2, 'scaduta la presa (funzione morta a meta\') si riprova', JSON.stringify(righe()[0]));

    console.log('\nCasella rigenerata, connessione caduta, tempo finito, posta spenta');
    azzera();
    scheda('s1');
    riferimento('<opec.invito.1@pec.aruba.it>', 's1');
    messaggio(50);
    client = clientDiProva();
    await lavora(client, 50);
    e = await INOLTRO.inoltra(db, client, { uidValidity: '999', scadenza: lontano(), casella: 'studio@pec.esempio.it' });
    m = spedite[0] || {};
    esigi(e.inoltrate === 1 && /Il testo non si è potuto leggere \(la cartella della casella è stata rigenerata\)/.test(m.text) && !m.attachments, 'con la cartella rigenerata parte lo stesso, e dice dove leggere', m.text && m.text.slice(0, 300));

    azzera();
    scheda('s1');
    riferimento('<opec.invito.1@pec.aruba.it>', 's1');
    messaggio(51);
    client = clientDiProva();
    await lavora(client, 51);
    client.cadeAlDownload = true;
    e = await INOLTRO.inoltra(db, client, { uidValidity: '777', scadenza: lontano() });
    esigi(spedite.length === 0 && righe()[0].stato === 'da-inviare' && /casella/.test(righe()[0].errore), 'se cade la connessione la riga resta in attesa', JSON.stringify(righe()[0]));

    client = clientDiProva();
    e = await INOLTRO.inoltra(db, client, { uidValidity: '777', scadenza: Date.now() - 1 });
    esigi(spedite.length === 0 && e.rimaste === 1 && righe()[0].stato === 'da-inviare', 'oltre la scadenza del giro non comincia', JSON.stringify(e));

    const host = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    e = await INOLTRO.inoltra(db, client, { uidValidity: '777', scadenza: lontano() });
    esigi(spedite.length === 0 && e.motivo === 'posta non configurata' && righe()[0].stato === 'da-inviare', 'senza posta configurata non parte niente, e la riga aspetta');
    process.env.SMTP_HOST = host;

    process.env.PEC_RISPOSTE_DESTINATARI = 'segreteria@revilaw.it; Andrea@Revilaw.it, sbagliato';
    e = await INOLTRO.inoltra(db, client, { uidValidity: '777', scadenza: lontano() });
    esigi(spedite.length === 1 && spedite[0].to === 'segreteria@revilaw.it, andrea@revilaw.it', 'PEC_RISPOSTE_DESTINATARI sceglie a chi', spedite[0] && spedite[0].to);

    console.log('\nUn giro completo del lettore');
    azzera();
    scheda('s1');
    riferimento('<opec.invito.1@pec.aruba.it>', 's1');
    messaggio(1);
    messaggio(2, { msgId: '<auto.2@pec.alfa.it>', extra: 'Auto-Submitted: auto-replied' });
    const g = await LETTORE.giro(db, { forza: true, da: 'prova' });
    esigi(g.ok && g.ultimoGiro.risposte === 1 && g.ultimoGiro.inoltrate === 1, 'legge la risposta e la inoltra nello stesso giro', JSON.stringify(g.ultimoGiro));
    esigi(spedite.length === 1 && /Parteciperemo volentieri: è un piacere\./.test(spedite[0].text), 'la mail parte con il testo');
    const g2 = await LETTORE.giro(db, { forza: true, da: 'prova' });
    esigi(g2.ok && g2.ultimoGiro.inoltrate === 0 && spedite.length === 1, 'il giro dopo non rimanda niente', JSON.stringify(g2.ultimoGiro));

    console.log('\nIl testo aperto dall\'area riservata');
    const letto = await LETTORE.leggiMessaggio(db, { uid: 1, uidValidity: '777' });
    esigi(letto.ok && /è un piacere/.test(letto.testo) && !/Ã/.test(letto.testo), 'gli accenti di un messaggio iso-8859-1 restano accenti', letto.testo);
    messaggio(3, { msgId: '<html.3@pec.alfa.it>', soloHtml: true });
    const lettoHtml = await LETTORE.leggiMessaggio(db, { uid: 3, uidValidity: '777' });
    esigi(lettoHtml.ok && /ci sarà il nostro CFO/.test(lettoHtml.testo) && !/posta certificata/i.test(lettoHtml.testo) && !/<p>/.test(lettoHtml.testo), 'una risposta solo HTML mostra il testo dell\'azienda, non quello del gestore', lettoHtml.testo);
    esigi(D.automatica(D.intestazioni('Subject: POSTA CERTIFICATA: Risposta automatica: sono in ferie')) && !D.automatica(D.intestazioni('Subject: POSTA CERTIFICATA: Re: Invito')), 'le risposte automatiche si riconoscono anche dietro "POSTA CERTIFICATA:"');

    console.log('\nLa mail');
    const fatta = MNGB.rispostaPec({ azienda: 'Gamma <b>', da: 'g@pec.it', testo: 'Ciao <script>alert(1)</script>\nriga due', casella: 'studio@pec.it', rispondiA: true }, 'https://x/area-riservata/#eventi');
    esigi(!/<script>/.test(fatta.html) && /&lt;script&gt;/.test(fatta.html) && /Gamma &lt;b&gt;/.test(fatta.html), 'il testo dell\'azienda e\' scritto come testo, non come HTML');
    esigi(Buffer.byteLength(MNGB.rispostaPec({ azienda: 'A', testo: 'parola '.repeat(4300) }, 'x').html) < 102 * 1024, 'con il testo piu\' lungo resta sotto i 102 KB di Gmail');
    const ev = INOLTRO.evento('milano-2027-02-26');
    esigi(ev.pagina === 'Milano 26 Febbraio 2027' && ev.nome === 'Milano, 26 febbraio 2027', 'il nome dell\'evento dal suo identificativo', JSON.stringify(ev));
    esigi(INOLTRO.quandoTesto(Date.parse('2027-01-15T09:05:00Z')) === '15/01/2027 alle 10:05', 'l\'ora di Roma', INOLTRO.quandoTesto(Date.parse('2027-01-15T09:05:00Z')));
    esigi(D.testoDaHtml('a&nbsp;b &amp;lt; &#232; &#xE0; &egrave;') === 'a b &lt; è à è', 'le entita\' si sciolgono una volta sola', D.testoDaHtml('a&nbsp;b &amp;lt; &#232; &#xE0; &egrave;'));

    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
