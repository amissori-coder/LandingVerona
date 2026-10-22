/* ============================================================
   PROVE - le risposte alle PEC dell'invito, inoltrate per email
   (lib/inoltro-risposte-pec.js, agganciato a lib/lettore-pec.js)
   ------------------------------------------------------------
       node prove/inoltro-risposte-pec.prove.js

   Firestore, la casella PEC (imapflow) e la posta sono finti. La casella
   finta risponde come un server IMAP vero: le parti arrivano CODIFICATE
   (quoted-printable, base64) e la struttura e' numerata come la numera
   imapflow - il corpo di una busta di una parte sola ha lo stesso numero
   della busta, e quel numero scarica il messaggio intero.
   Si verifica che:
     - una risposta riconosciuta finisce in coda, una volta sola anche se
       il messaggio si rilegge (e con le coordinate nuove, se la cartella
       e' stata rigenerata); quelle di piu' di un mese fa no;
     - le risposte automatiche non si inoltrano e non fanno "ha risposto":
       riconosciute dall'oggetto (anche codificato, anche dietro
       "POSTA CERTIFICATA:") o dalle intestazioni DENTRO la busta; restano
       pero' elencate sulla scheda;
     - l'inoltro manda UNA mail agli organizzatori (gli stessi del
       riepilogo, o PEC_RISPOSTE_DESTINATARI) con azienda, mittente,
       oggetto, codice e il testo scritto dall'azienda, decodificato, con
       gli accenti giusti e gli allegati allegati;
     - risposta di solo testo, di solo HTML, di solo allegato: si legge il
       testo giusto, mai il sorgente grezzo ne' il testo del gestore;
     - "Rispondi" non porta mai a una PEC: all'email ordinaria della scheda,
       o all'indirizzo da cui l'azienda ha scritto se non era una PEC;
     - se la posta non parte si riprova a intervalli che crescono: premere
       di continuo non brucia i tentativi; dopo l'ultimo si smette e lo
       stato del lettore lo dice; un rifiuto definitivo con allegati fa
       ripartire la mail senza;
     - le prese, la cartella rigenerata, la connessione che cade, la
       scadenza del giro, il limite per spedire, la posta spenta;
     - un giro completo legge la risposta e la inoltra subito; se la coda
       non si scrive, il messaggio si rilegge al giro dopo (e alla terza
       volta si va avanti);
     - eliminando la scheda, le sue righe in coda se ne vanno;
     - il testo aperto dall'area riservata (leggiMessaggio) e' quello vero.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

/* ---------- l'orologio ---------- */
let avanti = 0;
const veroNow = Date.now;
Date.now = () => veroNow() + avanti;

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
let rompiCoda = 0;   // quante transazioni su pecInoltri falliscono, d'ora in poi
function doc(coll, id) {
    const k = coll + '/' + id;
    return {
        id: id, _coll: coll,
        get: async () => ({ id: id, exists: dati.has(k), data: () => copia(dati.get(k)), ref: doc(coll, id) }),
        set: async (p, o) => { dati.set(k, (o && o.merge) ? fondi(dati.get(k), p) : copia(p)); },
        // come Firestore: update su un documento che non c'e' fallisce
        update: async p => { if (!dati.has(k)) throw new Error('NOT_FOUND'); dati.set(k, fondi(dati.get(k), p)); },
        delete: async () => { dati.delete(k); }
    };
}
function interroga(coll, filtri, quante) {
    return {
        where: (campo, op, val) => interroga(coll, filtri.concat([[campo, op, val]]), quante),
        limit: n => interroga(coll, filtri, n),
        get: async () => {
            let docs = [...dati.keys()].filter(k => k.startsWith(coll + '/'))
                .map(k => ({ id: k.slice(coll.length + 1), data: () => copia(dati.get(k)) }))
                .filter(d => filtri.every(([c, op, v]) => op === '==' ? (d.data() || {})[c] === v : op === 'in' ? v.indexOf((d.data() || {})[c]) >= 0 : false));
            if (quante) docs = docs.slice(0, quante);
            return { forEach: f => docs.forEach(f), size: docs.length, docs: docs };
        }
    };
}
const db = {
    collection: c => Object.assign({ doc: id => doc(c, id) }, interroga(c, [], 0)),
    batch: () => {
        const op = [];
        return { set: (r, p, o) => op.push(() => r.set(p, o)), delete: r => op.push(() => r.delete()), commit: async () => { for (const f of op) await f(); } };
    },
    runTransaction: async fn => {
        const scr = [];
        const r = await fn({
            get: x => {
                if (x._coll === 'pecInoltri' && rompiCoda > 0) { rompiCoda--; throw new Error('firestore giu\''); }
                return x.get();
            },
            set: (x, p, o) => scr.push([x, p, o])
        });
        for (const [x, p, o] of scr) await x.set(p, o);
        return r;
    }
};
const leggi = (c, id) => copia(dati.get(c + '/' + id));
const righe = () => [...dati.keys()].filter(k => k.startsWith('pecInoltri/')).map(k => Object.assign({ id: k.slice(11) }, dati.get(k)));

/* ---------- posta finta ---------- */
let spedite = [];
let postaGiu = 0;
let rifiutoDefinitivo = false;
let passwordSbagliata = false;
let dataRespinto = false;
let postaLenta = false;
let primaDiSpedire = null;   // cosa succede nel mondo mentre la mail parte
/* ---------- casella finta ---------- */
let casella = { uidValidity: 777, messaggi: new Map() };
class ClientFinto {
    constructor() { this.usable = true; this.cade = false; }
    on() { }
    async connect() { }
    async mailboxOpen() { return { uidValidity: casella.uidValidity, uidNext: Math.max(0, ...casella.messaggi.keys()) + 1 }; }
    async search(q) {
        if (casella.ricercaKo) return false;
        const cercato = String((q.header || {})['message-id'] || '');
        return [...casella.messaggi.entries()].filter(([, m]) => m.headers.indexOf('Message-ID: ' + cercato + '\r\n') >= 0).map(([uid]) => uid);
    }
    async *fetch(q) {
        const [a, b] = String(q.uid).split(':').map(Number);
        if (a === b && casella.rifiuta && casella.rifiuta.has(a)) throw new Error('Command failed');
        // la connessione cade e imapflow non lo dice: il comando torna vuoto
        if (a === b && casella.cadeZitto && casella.cadeZitto.has(a)) { this.usable = false; return; }
        for (const [uid, m] of [...casella.messaggi.entries()].sort((x, y) => x[0] - y[0])) {
            if (uid >= a && uid <= b) yield { uid: uid, size: 5000, internalDate: new Date(m.quando), headers: Buffer.from(m.headers), bodyStructure: copia(m.struttura) };
        }
    }
    /* Come un server vero: BODY[n] e' il contenuto CODIFICATO della parte;
       per una busta e' il messaggio incapsulato intero. */
    async fetchOne(uid, q) {
        if (this.cade) { this.usable = false; throw new Error('connessione caduta'); }
        const m = casella.messaggi.get(Number(uid));
        if (!m) return false;
        const bodyParts = new Map();
        for (const bp of (q.bodyParts || [])) {
            const chiave = (typeof bp === 'string' ? bp : bp.key).toLowerCase();
            let buf = m.grezze[chiave];
            if (!buf) continue;
            if (typeof bp === 'object' && bp.maxLength) buf = buf.slice(bp.start || 0, (bp.start || 0) + bp.maxLength);
            bodyParts.set(chiave, buf);
        }
        return { uid: Number(uid), bodyParts: bodyParts };
    }
    async download() { throw new Error('download non dovrebbe servire per le risposte'); }
    async logout() { }
    close() { }
}
const clientDiProva = () => new ClientFinto();

const veroRequire = Module.prototype.require;
Module.prototype.require = function (n) {
    if (n === 'nodemailer') {
        return {
            createTransport: () => ({
                sendMail: async m => {
                    if (primaDiSpedire) { const f = primaDiSpedire; primaDiSpedire = null; f(); }
                    if (rifiutoDefinitivo && m.attachments) { const e = new Error('552 allegato rifiutato'); e.responseCode = 552; e.code = 'EMESSAGE'; e.command = 'DATA'; throw e; }
                    if (dataRespinto) { const e = new Error('Data command failed: 554 5.7.1 policy'); e.responseCode = 554; e.code = 'EENVELOPE'; e.command = 'DATA'; throw e; }
                    if (passwordSbagliata) { const e = new Error('Invalid login: 535 5.7.8 Authentication failed'); e.responseCode = 535; e.code = 'EAUTH'; e.command = 'AUTH PLAIN'; throw e; }
                    if (postaLenta) return new Promise(() => { });
                    if (postaGiu > 0) { postaGiu--; throw new Error('posta giu\''); }
                    spedite.push(m); return {};
                },
                close() { }
            })
        };
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

/* ---------- i messaggi ----------
   Una risposta PEC come arriva davvero: la busta del gestore con il suo
   testo, e dentro postacert.eml con il messaggio dell'azienda. */
const qp = s => Buffer.from(s, 'latin1').toString('latin1').replace(/[^\x20-\x7E\n]|=/g, c => '=' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
const TESTO = 'Parteciperemo volentieri: è un piacere.\nMario Rossi\nAlfa S.r.l.';
function messaggio(uid, o) {
    o = o || {};
    const forma = o.forma || 'multipart';
    const dentroH = [
        'From: Mario Rossi <' + (o.mittenteDentro || 'alfa@pec.alfa.it') + '>',
        'Subject: ' + (o.oggettoDentro || 'Re: Invito - Next Generation Business'),
        o.automaticaDentro ? 'Auto-Submitted: auto-replied' : '',
        'MIME-Version: 1.0'
    ].filter(Boolean).join('\r\n') + '\r\n';
    const grezze = { '1': Buffer.from('Messaggio di posta certificata: il giorno ... e\' stato inviato da ...', 'utf8') };
    let figli;
    if (forma === 'unaparte') {
        // il corpo di una busta di una parte sola: imapflow lo numera come la busta
        figli = [{ part: '2', type: 'text/plain', parameters: { charset: 'iso-8859-1' }, encoding: 'quoted-printable', size: 80 }];
        grezze['2.1'] = Buffer.from(qp(o.testo || TESTO).replace(/\n/g, '\r\n'), 'latin1');
        grezze['2'] = Buffer.concat([Buffer.from('Received: from [10.0.0.5]\r\n' + dentroH + 'Content-Type: text/plain; charset=iso-8859-1\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n'), grezze['2.1']]);
    } else if (forma === 'soloHtml') {
        figli = [{ part: '2', type: 'text/html', parameters: { charset: 'utf-8' }, encoding: 'base64', size: 300 }];
        const html = '<html><head><style>p{color:red}</style></head><body><p>Grazie dell&#39;invito, ci\r\n      sar&agrave; il nostro CFO.</p><table><tr><td>Mario Rossi</td><td>Alfa S.r.l.</td></tr></table></body></html>';
        grezze['2.1'] = Buffer.from(Buffer.from(html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'));
        grezze['2'] = Buffer.concat([Buffer.from(dentroH + 'Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'), grezze['2.1']]);
    } else {
        const dentro = [];
        if (forma !== 'soloAllegato') {
            dentro.push({ part: '2.1', type: 'text/plain', parameters: { charset: 'iso-8859-1' }, encoding: 'quoted-printable', size: 80 });
            grezze['2.1'] = Buffer.from(qp(o.testo || TESTO).replace(/\n/g, '\r\n'), 'latin1');
        }
        if (forma === 'htmlConNote') {
            dentro.push({ part: '2.1', type: 'text/html', parameters: { charset: 'utf-8' }, encoding: '7bit', size: 80 });
            grezze['2.1'] = Buffer.from('<p>Ci saremo, grazie.</p>');
            dentro.push({ part: '2.3', type: 'text/plain', disposition: 'attachment', dispositionParameters: { filename: 'note.txt' }, encoding: '7bit', size: 20 });
            grezze['2.3'] = Buffer.from('colonna1;colonna2');
            dentro.push({ part: '2.4', type: 'message/rfc822', parameters: { name: 'Invito.eml' }, size: 200,
                childNodes: [{ part: '2.4', type: 'text/plain', encoding: '7bit', size: 40 }] });
            grezze['2.4.1'] = Buffer.from('Gentile azienda, la invitiamo...');
        }
        if (o.cp1252) {
            dentro[0] = { part: '2.1', type: 'text/plain', parameters: { charset: 'iso-8859-1' }, encoding: 'base64', size: 80 };
            grezze['2.1'] = Buffer.from(Buffer.from([0x6c, 0x92, 0x65, 0x76, 0x65, 0x6e, 0x74, 0x6f, 0x20, 0x63, 0x6f, 0x73, 0x74, 0x61, 0x20, 0x33, 0x30, 0x20, 0x80]).toString('base64'));
        }
        if (o.flowed) {
            dentro[0] = { part: '2.1', type: 'text/plain', parameters: { charset: 'utf-8', format: 'flowed', delsp: 'yes' }, encoding: '7bit', size: 80 };
            grezze['2.1'] = Buffer.from('Parteciperemo vo \r\nlentieri all\'evento.\r\nMario');
        }
        const nPdf = forma === 'soloAllegato' ? '2.1' : '2.2';
        dentro.push({ part: nPdf, type: 'application/pdf', disposition: 'attachment', dispositionParameters: { filename: 'adesione.pdf' }, encoding: 'base64', size: Math.ceil((o.pdf || 2000) * 4 / 3) });
        grezze[nPdf] = Buffer.from(Buffer.alloc(o.pdf || 2000, 7).toString('base64'));
        figli = [{ part: '2', type: 'multipart/mixed', childNodes: dentro }];
        grezze['2'] = Buffer.from(dentroH + 'Content-Type: multipart/mixed\r\n\r\n(...)');
    }
    grezze['2.header'] = Buffer.from(dentroH);
    casella.messaggi.set(uid, {
        quando: o.quando || ORA - 60000,
        headers: [
            'Message-ID: ' + (o.msgId || '<opec.risposta.1@pec.alfa.it>'),
            'In-Reply-To: ' + (o.inReplyTo || '<opec.invito.1@pec.aruba.it>'),
            'From: "Per conto di: ' + (o.da || 'alfa@pec.alfa.it') + '" <posta-certificata@pec.aruba.it>',
            'Reply-To: ' + (o.da || 'alfa@pec.alfa.it'),
            'Subject: ' + (o.oggetto || 'POSTA CERTIFICATA: Re: Invito - Next Generation Business'),
            'X-Trasporto: ' + (o.trasporto || 'posta-certificata')
        ].join('\r\n') + '\r\n',
        struttura: {
            type: 'multipart/mixed', childNodes: [
                { part: '1', type: 'text/plain', parameters: { charset: 'utf-8' }, encoding: '7bit', size: 400 },
                { part: '2', type: 'message/rfc822', parameters: { name: 'postacert.eml' }, dispositionParameters: { filename: 'postacert.eml' }, size: 4000, childNodes: figli },
                { part: '3', type: 'application/xml', dispositionParameters: { filename: 'daticert.xml' }, encoding: 'base64', size: 900 },
                { part: '4', type: 'application/pkcs7-signature', dispositionParameters: { filename: 'smime.p7s' }, encoding: 'base64', size: 3000 }
            ]
        },
        grezze: grezze
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
    return LETTORE._interni.lavoraMessaggio(db, client, { uid: uid, internalDate: new Date(m.quando), headers: Buffer.from(m.headers), bodyStructure: copia(m.struttura) }, String(casella.uidValidity), conto, {}, []);
}
const lontano = () => Date.now() + 60000;
const giro = (client, o) => INOLTRO.inoltra(db, client, Object.assign({ uidValidity: '777', scadenza: lontano(), casella: 'studio@pec.esempio.it' }, o || {}));
function azzera() {
    dati.clear(); spedite = []; postaGiu = 0; rifiutoDefinitivo = false; passwordSbagliata = false; dataRespinto = false; postaLenta = false; rompiCoda = 0; avanti = 0;
    casella = { uidValidity: 777, messaggi: new Map() }; delete process.env.PEC_RISPOSTE_DESTINATARI;
}
function base() { azzera(); scheda('s1'); riferimento('<opec.invito.1@pec.aruba.it>', 's1'); }

(async () => {
    console.log('\nIn coda');
    base();
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
    esigi(righe().length === 1, 'lo stesso messaggio riletto non si accoda due volte');
    casella.uidValidity = 888;
    casella.messaggi.set(5, casella.messaggi.get(10));
    await lavora(client, 5);
    esigi(righe().length === 1 && righe()[0].uid === 5 && righe()[0].uidValidity === '888', 'cartella rigenerata: stessa riga, coordinate nuove', JSON.stringify(righe()[0]));
    casella.uidValidity = 777;

    base();
    messaggio(13, { msgId: '<vecchia.1@pec.alfa.it>', quando: ORA - 40 * GIORNO });
    await lavora(clientDiProva(), 13);
    esigi(righe().length === 0, 'una risposta di piu\' di un mese fa non si inoltra');

    console.log('\nLe risposte automatiche');
    base();
    client = clientDiProva();
    messaggio(12, { msgId: '<auto.1@pec.alfa.it>', oggetto: 'POSTA CERTIFICATA: Risposta automatica: fuori sede' });
    r = await lavora(client, 12);
    esigi(r.tipo === 'automatica' && righe().length === 0 && leggi('aziendeInvito', 's1').stato === 'inviata', 'dall\'oggetto dietro "POSTA CERTIFICATA:": niente coda, niente "ha risposto"');
    messaggio(14, { msgId: '<auto.2@pec.alfa.it>', oggetto: '=?UTF-8?Q?POSTA_CERTIFICATA:_Risposta_automatica:_sono_in_ferie?=' });
    r = await lavora(client, 14);
    esigi(r.tipo === 'automatica' && righe().length === 0, 'anche con l\'oggetto codificato (RFC 2047)');
    messaggio(15, { msgId: '<auto.3@pec.alfa.it>', automaticaDentro: true });
    r = await lavora(client, 15);
    esigi(r.tipo === 'automatica' && righe().length === 0 && leggi('aziendeInvito', 's1').stato === 'inviata', 'dall\'Auto-Submitted DENTRO la busta, con un oggetto normale');
    const messaggi = ((leggi('aziendeInvito', 's1').ricevute || {}).messaggi || []);
    esigi(messaggi.length === 3 && messaggi.every(x => x.tipo === 'risposta automatica'), 'restano elencate sulla scheda, e si possono aprire', JSON.stringify(messaggi));
    esigi(!(leggi('aziendeInvito', 's1').ricevute || {}).risposta, 'senza "ha risposto il..."');

    console.log('\nL\'inoltro');
    base();
    messaggio(10);
    client = clientDiProva();
    await lavora(client, 10);
    let e = await giro(client);
    esigi(e.inoltrate === 1 && spedite.length === 1, 'parte una mail', JSON.stringify(e));
    let m = spedite[0] || {};
    esigi(m.to === ORGANIZZATORI, 'agli organizzatori del riepilogo', m.to);
    esigi(m.subject === 'Risposta alla PEC dell\'invito - Alfa S.r.l.', 'oggetto con l\'azienda', m.subject);
    esigi(/Parteciperemo volentieri: è un piacere\./.test(m.text) && /Parteciperemo volentieri: è un piacere\./.test(m.html), 'il testo dell\'azienda, decodificato dal quoted-printable latin1');
    esigi(!/Ã|=E8|Messaggio di posta certificata/.test(m.text), 'niente "Ã¨", niente codifica, niente testo del gestore');
    esigi(/Mario Rossi<br>Alfa S\.r\.l\./.test(m.html), 'gli a capo dell\'originale restano a capo');
    esigi(/KK22K/.test(m.html) && /alfa@pec\.alfa\.it/.test(m.html) && /Re: Invito - Next Generation Business/.test(m.html), 'codice, mittente e oggetto nel riquadro');
    esigi(/Excelsior Hotel Gallia/.test(m.html), 'vestita come le mail dell\'evento di Milano');
    esigi(m.replyTo === undefined && /Per rispondere scrivi dalla casella studio@pec\.esempio\.it all'indirizzo alfa@pec\.alfa\.it/.test(m.text), '"Rispondi" non porta alla PEC dell\'azienda: la mail dice da dove rispondere');
    esigi(/area-riservata\/#eventi/.test(m.html), 'con il collegamento all\'area riservata');
    const pdf = (m.attachments || [])[0] || {};
    esigi((m.attachments || []).length === 1 && pdf.filename === 'adesione.pdf' && pdf.content.length === 2000 && pdf.content[0] === 7 && pdf.contentType === 'application/pdf', 'l\'allegato, decodificato dal base64', JSON.stringify((m.attachments || []).map(a => [a.filename, a.content.length])));
    esigi(righe()[0].stato === 'inviata' && righe()[0].a === 5 && righe()[0].da === '' && righe()[0].oggetto === '', 'la riga e\' inviata, e mittente e oggetto si cancellano', JSON.stringify(righe()[0]));
    e = await giro(client);
    esigi(e.inoltrate === 0 && spedite.length === 1, 'al giro dopo non riparte');

    console.log('\nLe forme della risposta');
    base();
    messaggio(20, { forma: 'unaparte' });
    client = clientDiProva();
    await lavora(client, 20);
    await giro(client);
    m = spedite[0] || {};
    esigi(/Parteciperemo volentieri: è un piacere\./.test(m.text) && !/Received:|Content-Transfer-Encoding|=E8/.test(m.text), 'solo testo (busta di una parte): il testo, non il sorgente grezzo', m.text && m.text.slice(0, 500));

    base();
    scheda('s2', { campagna: 'sponsor', ragioneSociale: 'Beta S.p.A.', email: 'Info@Beta.it' });
    riferimento('<opec.invito.2@pec.aruba.it>', 's2');
    messaggio(21, { msgId: '<html.1@pec.beta.it>', inReplyTo: '<opec.invito.2@pec.aruba.it>', forma: 'soloHtml' });
    client = clientDiProva();
    await lavora(client, 21);
    await giro(client);
    m = spedite[0] || {};
    esigi(/Grazie dell'invito, ci sarà il nostro CFO\./.test(m.text), 'solo HTML: testo leggibile, entita\' sciolte, gli a capo del sorgente non contano', m.text && m.text.slice(0, 600));
    esigi(/Mario Rossi Alfa S\.r\.l\./.test(m.text) && !/<p>|color:red/.test(m.text), 'le celle non si incollano, niente tag ne\' stili');
    esigi(m.subject === 'Risposta alla PEC di sponsorizzazione - Beta S.p.A.', 'sulla campagna sponsor lo dice', m.subject);
    esigi(m.replyTo === 'info@beta.it' && /indirizzo email ordinario dell'azienda \(info@beta\.it\)/.test(m.text), 'con l\'email ordinaria sulla scheda, "Rispondi" porta li\'', m.replyTo);

    base();
    messaggio(22, { forma: 'soloAllegato' });
    client = clientDiProva();
    await lavora(client, 22);
    await giro(client);
    m = spedite[0] || {};
    esigi(/messaggio senza testo/.test(m.text) && !/posta certificata: il giorno/i.test(m.text) && (m.attachments || []).length === 1, 'solo allegato: "senza testo", mai il testo del gestore come se fosse suo', m.text && m.text.slice(0, 400));

    base();
    scheda('s1', { email: 'alfa@pec.alfa.it' });
    messaggio(23, { trasporto: 'errore', da: 'info@alfa.it', oggetto: 'ANOMALIA MESSAGGIO: Re: Invito' });
    client = clientDiProva();
    await lavora(client, 23);
    await giro(client);
    m = spedite[0] || {};
    esigi(m.replyTo === 'info@alfa.it' && /da un indirizzo email ordinario/.test(m.text) && /senza valore di PEC/.test(m.text), 'risposta da posta ordinaria: "Rispondi" porta a quell\'indirizzo', m.replyTo);

    base();
    messaggio(24, { pdf: 5 * 1024 * 1024 });
    client = clientDiProva();
    await lavora(client, 24);
    await giro(client);
    m = spedite[0] || {};
    esigi(!m.attachments && /adesione\.pdf/.test(m.html) && /Troppo grande per questa email/.test(m.html), 'un allegato troppo grande non viaggia, ma si dice che c\'e\'');

    console.log('\nQuando la posta non parte');
    base();
    messaggio(30);
    client = clientDiProva();
    await lavora(client, 30);
    postaGiu = 1;
    e = await giro(client);
    let riga = righe()[0];
    esigi(e.fallite === 1 && spedite.length === 0 && riga.stato === 'da-inviare' && riga.tentativi === 1 && /posta giu/.test(riga.errore), 'la riga torna in attesa, con il motivo', JSON.stringify(riga));
    esigi(riga.prossimo > Date.now() + 9 * 60000, 'e aspetta dieci minuti prima di riprovare');
    for (let i = 0; i < 6; i++) await giro(client);
    esigi(righe()[0].tentativi === 1 && spedite.length === 0, 'premere di continuo "Controlla le ricevute" non brucia i tentativi');
    avanti += 11 * 60000;
    e = await giro(client);
    esigi(e.inoltrate === 1 && spedite.length === 1 && righe()[0].stato === 'inviata', 'passata l\'attesa, parte');

    base();
    messaggio(31);
    client = clientDiProva();
    await lavora(client, 31);
    let tentativi = 0;
    while (righe()[0].stato === 'da-inviare' && tentativi < 20) {
        postaGiu = 1; await giro(client); tentativi++;
        avanti += 7 * 60 * 60 * 1000;
    }
    riga = righe()[0];
    esigi(riga.stato === 'non-inviata' && riga.tentativi === INOLTRO.MAX_TENTATIVI && tentativi === INOLTRO.MAX_TENTATIVI, 'dopo l\'ultimo tentativo si smette', JSON.stringify([riga.stato, riga.tentativi, tentativi]));
    const stato = await LETTORE.stato(db);
    const np = stato.inoltriNonPartiti || [];
    esigi(np.length === 1 && np[0].azienda === 'Alfa S.r.l.' && np[0].evento === 'milano-2027-02-26' && /posta giu/.test(np[0].motivo), 'e lo stato del lettore lo dice, per l\'area riservata', JSON.stringify(np));
    avanti += GIORNO;
    await giro(client);
    esigi(spedite.length === 0, 'e non si riprova piu\'');
    const sec = INOLTRO._interni.attesaDopo;
    esigi(sec(1) === 600000 && sec(2) === 1200000 && sec(10) === 6 * 3600000, 'le attese: 10 minuti, poi il doppio, fino a sei ore');

    base();
    messaggio(32);
    client = clientDiProva();
    await lavora(client, 32);
    rifiutoDefinitivo = true;
    await giro(client);
    esigi(spedite.length === 0 && righe()[0].senzaAllegati === true, 'un rifiuto definitivo con allegati: si segna di riprovare senza');
    avanti += 11 * 60000;
    await giro(client);
    m = spedite[0] || {};
    esigi(spedite.length === 1 && !m.attachments && /Non allegato a questa email/.test(m.html) && /è un piacere/.test(m.text), 'e il tentativo dopo parte senza allegati, elencandoli', JSON.stringify(righe()[0]));

    console.log('\nLe prese, la casella, il tempo');
    base();
    messaggio(40);
    client = clientDiProva();
    await lavora(client, 40);
    const id = righe()[0].id;
    dati.set('pecInoltri/' + id, Object.assign(leggi('pecInoltri', id), { stato: 'in-invio', fino: Date.now() + 120000, tentativi: 1 }));
    await giro(client);
    esigi(spedite.length === 0, 'una riga presa da un altro giro non si tocca');
    dati.set('pecInoltri/' + id, Object.assign(leggi('pecInoltri', id), { fino: Date.now() - 1000 }));
    await giro(client);
    esigi(spedite.length === 1 && righe()[0].stato === 'inviata' && righe()[0].tentativi === 2, 'scaduta la presa (funzione morta a meta\') si riprova', JSON.stringify(righe()[0]));

    base();
    messaggio(50);
    client = clientDiProva();
    await lavora(client, 50);
    casella.messaggi.set(77, casella.messaggi.get(50));
    casella.messaggi.delete(50);
    e = await giro(client, { uidValidity: '999' });
    m = spedite[0] || {};
    esigi(e.inoltrate === 1 && /è un piacere/.test(m.text) && (m.attachments || []).length === 1, 'cartella rigenerata: il messaggio si ritrova dal suo Message-ID', m.text && m.text.slice(0, 300));
    base();
    messaggio(53);
    client = clientDiProva();
    await lavora(client, 53);
    casella.messaggi.delete(53);
    e = await giro(client, { uidValidity: '999' });
    m = spedite[0] || {};
    esigi(e.inoltrate === 1 && /Il testo non si è potuto leggere \(la cartella della casella è stata rigenerata\)/.test(m.text) && /cercalo nella casella PEC/.test(m.text) && !m.attachments, 'e se non si ritrova parte lo stesso, e dice dove cercarlo', m.text && m.text.slice(0, 300));

    base();
    messaggio(51);
    client = clientDiProva();
    await lavora(client, 51);
    client.cade = true;
    e = await giro(client);
    esigi(spedite.length === 0 && righe()[0].stato === 'da-inviare' && righe()[0].tentativi === 0 && /casella/.test(righe()[0].errore) && righe()[0].cadute === 1, 'se cade la connessione la riga resta in attesa, senza perdere il tentativo', JSON.stringify(righe()[0]));
    avanti += 11 * 60000;

    client = clientDiProva();
    e = await giro(client, { scadenza: Date.now() - 1 });
    esigi(spedite.length === 0 && e.rimaste === 1 && righe()[0].stato === 'da-inviare', 'oltre la scadenza del giro non comincia', JSON.stringify(e));
    e = await giro(client, { limiteInvio: Date.now() - 1 });
    esigi(spedite.length === 0 && righe()[0].stato === 'da-inviare' && righe()[0].tentativi === 0, 'oltre il limite per spedire la riga torna indietro, senza perdere il tentativo', JSON.stringify(righe()[0]));
    e = await giro(client, { limiteLettura: Date.now() - 1 });
    m = spedite[0] || {};
    esigi(spedite.length === 1 && !m.attachments && /adesione\.pdf/.test(m.html), 'oltre il limite per leggere gli allegati, si elencano soltanto');

    base();
    messaggio(52);
    client = clientDiProva();
    await lavora(client, 52);
    const host = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    e = await giro(client);
    esigi(spedite.length === 0 && e.motivo === 'posta non configurata' && righe()[0].stato === 'da-inviare', 'senza posta configurata non parte niente, e la riga aspetta');
    process.env.SMTP_HOST = host;
    process.env.PEC_RISPOSTE_DESTINATARI = 'segreteria@revilaw.it; Andrea@Revilaw.it, sbagliato';
    e = await giro(client);
    esigi(spedite.length === 1 && spedite[0].to === 'segreteria@revilaw.it, andrea@revilaw.it', 'PEC_RISPOSTE_DESTINATARI sceglie a chi', spedite[0] && spedite[0].to);

    console.log('\nUn giro completo del lettore');
    base();
    messaggio(1);
    messaggio(2, { msgId: '<auto.2@pec.alfa.it>', automaticaDentro: true });
    let g = await LETTORE.giro(db, { forza: true, da: 'prova' });
    esigi(g.ok && g.ultimoGiro.risposte === 1 && g.ultimoGiro.inoltrate === 1, 'legge la risposta e la inoltra nello stesso giro', JSON.stringify(g.ultimoGiro));
    esigi(spedite.length === 1 && /Parteciperemo volentieri: è un piacere\./.test(spedite[0].text), 'la mail parte con il testo');
    g = await LETTORE.giro(db, { forza: true, da: 'prova' });
    esigi(g.ok && g.ultimoGiro.inoltrate === 0 && spedite.length === 1, 'il giro dopo non rimanda niente', JSON.stringify(g.ultimoGiro));

    base();
    messaggio(1);
    messaggio(2, { msgId: '<altra.2@pec.alfa.it>' });
    rompiCoda = 1;
    g = await LETTORE.giro(db, { forza: true, da: 'prova' });
    esigi(g.ok && g.restanti && righe().length === 0 && !leggi('pecMessaggi', '777_1') && leggi('aziendeInvito', 's1').stato === 'inviata', 'se la coda non si scrive, il messaggio non si segna come visto e il giro si ferma', JSON.stringify(g.ultimoGiro));
    g = await LETTORE.giro(db, { forza: true, da: 'prova' });
    esigi(g.ok && righe().length === 2 && spedite.length === 2 && leggi('aziendeInvito', 's1').stato === 'risposta', 'al giro dopo lo rilegge, e le risposte partono', JSON.stringify([righe().length, spedite.length]));

    base();
    messaggio(1);
    messaggio(2, { msgId: '<altra.2@pec.alfa.it>' });
    let risposteContate = 0;
    for (let i = 0; i < 6; i++) { rompiCoda = 1; g = await LETTORE.giro(db, { forza: true, da: 'prova' }); risposteContate += g.ultimoGiro.risposte; }
    esigi(!leggi('pecMessaggi', '777_1') && risposteContate === 0, 'sei giri di fila in pochi secondi ("Controlla le ricevute") non fanno rinunciare, e non contano risposte mai trattate', String(risposteContate));
    avanti += 61 * 60000;
    rompiCoda = 1;
    g = await LETTORE.giro(db, { forza: true, da: 'prova' });
    esigi(leggi('pecMessaggi', '777_1') && leggi('pecMessaggi', '777_2') && leggi('aziendeInvito', 's1').stato === 'risposta', 'dopo un\'ora e tre giri falliti si va avanti, senza fermare la lettura per sempre', JSON.stringify(g.ultimoGiro));
    const npc = (await LETTORE.stato(db)).inoltriNonPartiti || [];
    esigi(npc.length === 1 && npc[0].azienda === 'Alfa S.r.l.' && /non messa in coda/.test(npc[0].motivo), 'e la risposta rimasta senza inoltro si dice nell\'area riservata', JSON.stringify(npc));

    console.log('\nLa scheda eliminata');
    base();
    messaggio(60);
    client = clientDiProva();
    await lavora(client, 60);
    const tolte = await INOLTRO.dimentica(db, ['s1', 's9']);
    esigi(tolte === 1 && righe().length === 0, 'le righe in coda se ne vanno con la scheda');
    messaggio(61, { msgId: '<altra.61@pec.alfa.it>' });
    await lavora(client, 61);
    const spostate = await INOLTRO.ripunta(db, 's1', 's1-nuova');
    esigi(spostate === 1 && righe()[0].scheda === 's1-nuova', 'e seguono la scheda quando cambia identificativo ("Modifica")');

    console.log('\nAltri casi della lettura');
    base();
    messaggio(70, { cp1252: true });
    client = clientDiProva();
    await lavora(client, 70);
    await giro(client);
    m = spedite[0] || {};
    esigi(/l’evento costa 30 €/.test(m.text), 'Outlook (iso-8859-1 che e\' windows-1252): apostrofo curvo ed euro restano', JSON.stringify(m.text && m.text.slice(m.text.indexOf('IL MESSAGGIO'), m.text.indexOf('IL MESSAGGIO') + 60)));
    base();
    messaggio(71, { flowed: true });
    client = clientDiProva();
    await lavora(client, 71);
    await giro(client);
    m = spedite[0] || {};
    esigi(/Parteciperemo volentieri all'evento\.\nMario/.test(m.text), 'format=flowed (Thunderbird): le righe si ricuciono', m.text && m.text.slice(0, 500));
    base();
    messaggio(72, { forma: 'htmlConNote' });
    client = clientDiProva();
    await lavora(client, 72);
    await giro(client);
    m = spedite[0] || {};
    esigi(/Ci saremo, grazie\./.test(m.text) && !/colonna1/.test(m.text) && !/Gentile azienda/.test(m.text), 'un note.txt allegato o un invito inoltrato non sono il testo dell\'azienda', m.text && m.text.slice(0, 500));
    const testoLungo = 'Citt=C3=A0 di Verona, perch=C3=A9 no.\r\n'.repeat(3);
    const tagli = [];
    for (let max = 30; max < testoLungo.length; max++) {
        const finto = { fetchOne: async () => ({ bodyParts: new Map([['2.1', Buffer.from(testoLungo).slice(0, max)]]) }) };
        const l = await INOLTRO.testoDiParte(finto, 1, { parte: '2.1', codifica: 'quoted-printable', gioco: 'utf-8' }, max);
        if (/Ã|=/.test(l.testo)) tagli.push(max);
    }
    esigi(tagli.length === 0, 'un testo quoted-printable tagliato a qualunque byte non diventa "Ã"', JSON.stringify(tagli));

    console.log('\nAltri casi della coda');
    base();
    messaggio(80);
    messaggio(81, { msgId: '<altra.81@pec.alfa.it>' });
    client = clientDiProva();
    await lavora(client, 80);
    await lavora(client, 81);
    casella.rifiuta = new Set([80]);
    e = await giro(client);
    const r80 = righe().find(x => x.uid === 80), r81 = righe().find(x => x.uid === 81);
    esigi(r80.stato === 'da-inviare' && r80.tentativi === 1 && r80.prossimo > Date.now() && r81.stato === 'inviata' && spedite.length === 1, 'un messaggio che la casella rifiuta: tentativo contato, attesa, e gli altri partono', JSON.stringify([r80, e]));
    casella.rifiuta = null;
    base();
    messaggio(82);
    messaggio(83, { msgId: '<altra.83@pec.alfa.it>' });
    await lavora(clientDiProva(), 82);
    await lavora(clientDiProva(), 83);
    for (let i = 0; i < 3; i++) { client = clientDiProva(); client.cade = true; await giro(client); avanti += 11 * 60000; }
    const r82 = righe().find(x => x.uid === 82);
    esigi(r82.cadute === 3 && r82.tentativi === 0 && spedite.length === 0, 'connessione caduta tre volte: nessun tentativo consumato, ma si conta', JSON.stringify(r82));
    client = clientDiProva();
    await giro(client);
    esigi(spedite.length === 2 && spedite.some(x => /non si riesce a leggere dalla casella/.test(x.text)), 'e alla quarta il messaggio parte senza testo invece di bloccare gli altri', String(spedite.length));

    base();
    messaggio(84);
    client = clientDiProva();
    await lavora(client, 84);
    passwordSbagliata = true;
    await giro(client);
    passwordSbagliata = false;
    avanti += 11 * 60000;
    await giro(client);
    m = spedite[0] || {};
    esigi(!righe()[0].senzaAllegati && (m.attachments || []).length === 1, 'una password sbagliata (535) non toglie gli allegati alla volta dopo');
    base();
    for (let i = 0; i < 4; i++) postaGiu = 0;
    messaggio(85);
    client = clientDiProva();
    await lavora(client, 85);
    for (let i = 0; i < 3; i++) { postaGiu = 1; await giro(client); avanti += 7 * 60 * 60 * 1000; }
    await giro(client);
    m = spedite[0] || {};
    esigi(spedite.length === 1 && (m.attachments || []).length === 1, 'nemmeno tre guasti della posta: al quarto tentativo gli allegati ci sono');

    base();
    scheda('s2', { ragioneSociale: 'Beta S.p.A.' });
    riferimento('<opec.invito.2@pec.aruba.it>', 's2');
    messaggio(86);
    messaggio(87, { msgId: '<b.87@pec.beta.it>', inReplyTo: '<opec.invito.2@pec.aruba.it>' });
    client = clientDiProva();
    await lavora(client, 86);
    await lavora(client, 87);
    for (let i = 0; i < 12; i++) { postaGiu = 2; await giro(client); avanti += 7 * 60 * 60 * 1000; }
    const tutte = (await LETTORE.stato(db)).inoltriNonPartiti || [];
    esigi(tutte.length === 2 && tutte.some(x => x.azienda === 'Alfa S.r.l.') && tutte.some(x => x.azienda === 'Beta S.p.A.'), 'un guasto lungo che ne fa abbandonare due: si dicono tutte e due', JSON.stringify(tutte.map(x => x.azienda)));

    base();
    for (let i = 0; i < 50; i++) dati.set('pecInoltri/m~attesa' + i, { stato: 'da-inviare', prossimo: Date.now() + 3600000, scheda: 's1', uid: 0, uidValidity: '777', quando: 1 });
    messaggio(88, { msgId: '<z.88@pec.alfa.it>' });
    client = clientDiProva();
    await lavora(client, 88);
    await giro(client);
    esigi(spedite.length === 1, 'cinquanta righe in attesa del loro turno non nascondono quella pronta');

    base();
    messaggio(89);
    client = clientDiProva();
    await lavora(client, 89);
    postaLenta = true;
    e = await giro(client, { limiteFine: Date.now() + 50 });
    postaLenta = false;
    esigi(e.fallite === 1 && righe()[0].stato === 'da-inviare' && /in tempo/.test(righe()[0].errore) && righe()[0].prossimo > Date.now(), 'una posta che non finisce in tempo: si lascia perdere e si riprova, la funzione resta viva', JSON.stringify(righe()[0]));

    base();
    messaggio(90);
    client = clientDiProva();
    await lavora(client, 90);
    // la scheda (e le sue righe) si elimina mentre la mail sta partendo, e la posta fallisce
    primaDiSpedire = () => { dati.delete('aziendeInvito/s1'); INOLTRO.dimentica(db, ['s1']); };
    postaGiu = 1;
    await giro(client);
    await new Promise(r => setImmediate(r));
    esigi(righe().length === 0, 'una riga tolta mentre la mail partiva non rinasce vuota', JSON.stringify(righe()));

    console.log('\nUltimi casi della coda');
    base();
    messaggio(91);
    client = clientDiProva();
    await lavora(client, 91);
    casella.cadeZitto = new Set([91]);
    e = await giro(client);
    casella.cadeZitto = null;
    esigi(spedite.length === 0 && righe()[0].cadute === 1 && righe()[0].tentativi === 0 && righe()[0].stato === 'da-inviare', 'una connessione che cade senza dirlo non fa partire la mail senza testo', JSON.stringify(righe()[0]));
    base();
    messaggio(92);
    client = clientDiProva();
    await lavora(client, 92);
    casella.ricercaKo = true;
    e = await giro(client, { uidValidity: '999' });
    casella.ricercaKo = false;
    esigi(spedite.length === 0 && righe()[0].tentativi === 1 && righe()[0].prossimo > Date.now(), 'una ricerca che non riesce non e\' "messaggio sparito": si riprova', JSON.stringify(righe()[0]));
    base();
    messaggio(93);
    client = clientDiProva();
    await lavora(client, 93);
    dati.set('pecInoltri/' + righe()[0].id, Object.assign(righe()[0], { tentativi: INOLTRO.MAX_TENTATIVI - 1 }));
    casella.rifiuta = new Set([93]);
    e = await giro(client);
    casella.rifiuta = null;
    m = spedite[0] || {};
    esigi(spedite.length === 1 && /non si riesce a leggere dalla casella/.test(m.text) && righe()[0].stato === 'inviata', 'all\'ultimo tentativo un messaggio che la casella rifiuta parte lo stesso, senza testo', JSON.stringify(righe()[0]));
    base();
    messaggio(94);
    client = clientDiProva();
    await lavora(client, 94);
    dataRespinto = true;
    await giro(client);
    dataRespinto = false;
    esigi(!righe()[0].senzaAllegati, 'il comando DATA respinto prima del contenuto non toglie gli allegati');
    avanti += 11 * 60000;
    postaLenta = true;
    await giro(client, { limiteFine: Date.now() + 50 });
    postaLenta = false;
    esigi(righe()[0].senzaAllegati === true, 'una spedizione con allegati che non finisce in tempo: la prossima parte senza');
    base();
    messaggio(95);
    client = clientDiProva();
    await lavora(client, 95);
    dati.set('pecInoltri/' + righe()[0].id, Object.assign(righe()[0], { tentativi: INOLTRO.MAX_TENTATIVI - 1 }));
    postaGiu = 1;
    e = await giro(client);
    esigi(e.fallite === 0 && e.abbandonate === 1, 'una risposta abbandonata non si conta fra quelle "che si riproveranno"', JSON.stringify(e));

    console.log('\nModifica ed Elimina, dal servizio delle aziende');
    const AZ = require(path.join(radice, 'lib/aziende-invito'));
    const esegui = body => AZ.esegui({ db: db, body: Object.assign({ sezione: 'aziende', evento: 'milano-2027-02-26', campagna: 'invito' }, body), email: 'admin@revilaw.it', eAdmin: true, ruolo: 'admin' });
    base();
    riferimento('<ngb.vecchio@revilaw.it>', 's1');   // il primo invio, prima di un secondo invio
    messaggio(96);
    client = clientDiProva();
    await lavora(client, 96);
    let rr = await esegui({ azione: 'modifica', id: 's1', azienda: { ragioneSociale: 'Alfa S.r.l.', pec: 'nuova@pec.alfa.it' } });
    const nuovoId = 'milano-2027-02-26~nuova@pec-alfa-it';
    const rifs = [...dati.keys()].filter(k => k.startsWith('pecRiferimenti/')).map(k => dati.get(k).scheda);
    esigi(rr.stato === 200 && !leggi('aziendeInvito', 's1') && leggi('aziendeInvito', nuovoId) && rifs.length === 2 && rifs.every(x => x === nuovoId) && righe()[0].scheda === nuovoId,
        '"Modifica" con un recapito nuovo: riferimenti PEC e risposte in coda seguono la scheda', JSON.stringify([rr.stato, rifs, righe().map(x => x.scheda)]));
    await giro(client);
    esigi(spedite.length === 1 && /Alfa S\.r\.l\./.test(spedite[0].subject), 'e la mail parte con il nome dell\'azienda', spedite[0] && spedite[0].subject);
    messaggio(97, { msgId: '<dopo.97@pec.alfa.it>' });
    await lavora(client, 97);
    esigi(righe().length === 2 && righe().every(x => x.scheda === nuovoId), 'una risposta arrivata dopo la modifica trova la scheda nuova');
    rr = await esegui({ azione: 'cancella', ids: [nuovoId] });
    const restano = [...dati.keys()].filter(k => k.startsWith('pecRiferimenti/') || k.startsWith('pecInoltri/'));
    esigi(rr.stato === 200 && restano.length === 0, '"Elimina" toglie tutti i riferimenti PEC (anche del primo invio) e le risposte in coda', JSON.stringify(restano));

    console.log('\nIl testo aperto dall\'area riservata');
    base();
    messaggio(1);
    messaggio(3, { msgId: '<html.3@pec.alfa.it>', forma: 'soloHtml' });
    messaggio(4, { msgId: '<una.4@pec.alfa.it>', forma: 'unaparte' });
    let letto = await LETTORE.leggiMessaggio(db, { uid: 1, uidValidity: '777' });
    esigi(letto.ok && /è un piacere/.test(letto.testo) && !/Ã/.test(letto.testo) && letto.allegati.length === 1 && Object.keys(letto.allegati[0]).join() === 'nome,dimensione', 'gli accenti restano accenti; gli allegati come prima (nome e dimensione)', JSON.stringify(letto.allegati));
    letto = await LETTORE.leggiMessaggio(db, { uid: 3, uidValidity: '777' });
    esigi(letto.ok && /ci sarà il nostro CFO/.test(letto.testo) && !/posta certificata/i.test(letto.testo) && !/<p>/.test(letto.testo), 'una risposta solo HTML mostra il testo dell\'azienda', letto.testo);
    letto = await LETTORE.leggiMessaggio(db, { uid: 4, uidValidity: '777' });
    esigi(letto.ok && /è un piacere/.test(letto.testo) && !/Received:|=E8/.test(letto.testo), 'una risposta di solo testo mostra il testo, non il sorgente grezzo', letto.testo);
    messaggio(5, { msgId: '<ric.5@pec.aruba.it>' });
    casella.messaggi.get(5).headers = casella.messaggi.get(5).headers.replace('X-Trasporto: posta-certificata', 'X-Ricevuta: avvenuta-consegna');
    letto = await LETTORE.leggiMessaggio(db, { uid: 5, uidValidity: '777' });
    esigi(letto.ok && /Messaggio di posta certificata/.test(letto.testo) && !/è un piacere/.test(letto.testo), 'una ricevuta di consegna completa mostra il testo del gestore, non il messaggio dentro', letto.testo);

    console.log('\nI pezzi');
    esigi(D.automatica(D.intestazioni('Subject: POSTA CERTIFICATA: Risposta automatica: sono in ferie')) && !D.automatica(D.intestazioni('Subject: POSTA CERTIFICATA: Re: Invito')), 'le risposte automatiche si riconoscono dietro "POSTA CERTIFICATA:"');
    esigi(D.intestazioni('Subject: Re: =?UTF-8?Q?Opportunit=C3=A0?= =?ISO-8859-1?B?6A==?=').subject === 'Re: Opportunitàè', 'gli oggetti codificati si leggono', D.intestazioni('Subject: Re: =?UTF-8?Q?Opportunit=C3=A0?= =?ISO-8859-1?B?6A==?=').subject);
    esigi(D.decodificaTesto(Buffer.from('Grazie, ci sarà. > perch� no'), 'utf-8') === 'Grazie, ci sarà. > perch� no', 'un "�" citato non fa diventare latin1 tutto il resto');
    esigi(D.decodificaTesto(Buffer.from('ci sarà').slice(0, -1), 'utf-8', true) === 'ci sar', 'un testo tagliato a meta\' di una lettera perde solo quella');
    esigi(D.decodificaTesto(Buffer.from('ci sar\xe0', 'latin1'), '') === 'ci sarà', 'un latin1 non dichiarato resta latin1');
    esigi(D.testoDaHtml('a&nbsp;b &amp;lt; &#232; &#xE0; &egrave;') === 'a b &lt; è à è', 'le entita\' si sciolgono una volta sola', D.testoDaHtml('a&nbsp;b &amp;lt; &#232; &#xE0; &egrave;'));
    esigi(D.testoDaHtml('Buongiorno,<div>ci saremo in due.</div><div>Mario Rossi</div>') === 'Buongiorno,\nci saremo in due.\nMario Rossi', 'il testo prima di un blocco HTML va a capo', JSON.stringify(D.testoDaHtml('Buongiorno,<div>ci saremo in due.</div><div>Mario Rossi</div>')));
    const html = h => D.testoDaHtml(h);
    esigi(html('<div>Buongiorno,</div><div><br></div><div>confermiamo.</div><div>Cordiali saluti</div><div>Mario Rossi</div>') === 'Buongiorno,\n\nconfermiamo.\nCordiali saluti\nMario Rossi', 'Gmail: una riga per <div>, e la riga vuota solo dove c\'era', JSON.stringify(html('<div>Buongiorno,</div><div><br></div><div>confermiamo.</div><div>Cordiali saluti</div><div>Mario Rossi</div>')));
    esigi(html('<p class=MsoNormal>Riga uno<o:p></o:p></p><p class=MsoNormal>Riga due<o:p></o:p></p>') === 'Riga uno\nRiga due', 'Outlook: un <p> per riga, senza righe vuote in mezzo');
    esigi(html('<p>Partecipanti:</p><ul><li><p>Mario</p></li><li dir="ltr"><p dir="ltr"><span>Luigi</span></p></li></ul><p>Saluti</p>') === 'Partecipanti:\n- Mario\n- Luigi\nSaluti', 'un elenco con il testo dentro <p> (Google Documenti): trattino e testo sulla stessa riga', JSON.stringify(html('<p>Partecipanti:</p><ul><li><p>Mario</p></li><li dir="ltr"><p dir="ltr"><span>Luigi</span></p></li></ul><p>Saluti</p>')));
    esigi(html('<table><tr><td>Nome</td><td>Mario</td></tr><tr><td>Ruolo</td><td>CFO</td></tr></table>') === 'Nome Mario\nRuolo CFO', 'una tabella: una riga per riga');
    esigi(D.decodificaParole('=?UTF-8?Q?Re:_Opportunit=C3?= =?UTF-8?Q?=A0_bella?=') === 'Re: Opportunità bella', 'una lettera spezzata fra due parole codificate si ricompone');
    const nn = D.normalizzaParti({ type: 'multipart/mixed', childNodes: [{ part: '1', type: 'text/plain' }, { part: '2', type: 'message/rfc822', childNodes: [{ part: '2', type: 'message/rfc822', childNodes: [{ part: '2', type: 'text/plain' }] }] }] });
    esigi(nn.childNodes[1].childNodes[0].part === '2.1' && nn.childNodes[1].childNodes[0].childNodes[0].part === '2.1.1', 'una busta dentro la busta si rinumera a sua volta', JSON.stringify(nn.childNodes[1]));
    const fatta = MNGB.rispostaPec({ azienda: 'Gamma <b>', da: 'g@pec.it', certificata: true, testo: 'Ciao <script>alert(1)</script>\nriga due', casella: 'studio@pec.it' }, 'https://x/area-riservata/#eventi');
    esigi(!/<script>/.test(fatta.html) && /&lt;script&gt;/.test(fatta.html) && /Gamma &lt;b&gt;/.test(fatta.html), 'il testo dell\'azienda e\' scritto come testo, non come HTML');
    esigi(Buffer.byteLength(MNGB.rispostaPec({ azienda: 'A', testo: 'parola '.repeat(4300) }, 'x').html) < 102 * 1024, 'con il testo piu\' lungo resta sotto i 102 KB di Gmail');
    const ev = INOLTRO.evento('milano-2027-02-26');
    esigi(ev.pagina === 'Milano 26 Febbraio 2027' && ev.nome === 'Milano, 26 febbraio 2027', 'il nome dell\'evento dal suo identificativo', JSON.stringify(ev));
    esigi(INOLTRO.quandoTesto(Date.parse('2027-01-15T09:05:00Z')) === '15/01/2027 alle 10:05', 'l\'ora di Roma', INOLTRO.quandoTesto(Date.parse('2027-01-15T09:05:00Z')));

    console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
