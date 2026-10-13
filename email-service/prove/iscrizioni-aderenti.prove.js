/* ============================================================
   PROVE - lib/iscrizioni-aderenti.js (aderenti Revilaw, Milano 2027)
   ------------------------------------------------------------
       node prove/iscrizioni-aderenti.prove.js

   Niente da installare: Firestore e la posta sono finti e stanno
   qui dentro. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Da questa scheda parte una fattura, quindi:
     - un'iscrizione completa passa, viene registrata e fa partire
       DUE mail: l'avviso a Pierluigi Sterzi e Andrea Missori (con
       "rispondi a" l'iscritto) e il riepilogo all'iscritto;
     - la quota la decide il servizio: 200 + IVA 22% = 244 euro,
       qualunque cosa mandi la pagina;
     - i dati fiscali sbagliati si fermano qui: partita IVA con la
       cifra di controllo storta, CAP, provincia, codice SDI;
     - con la partita IVA serve il codice destinatario o la PEC;
     - chi compila due volte NON diventa due schede (due fatture):
       la seconda aggiorna la prima e l'avviso dice che e' una
       correzione;
     - se la posta non parte l'iscrizione resta registrata.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

const dati = new Map();
let rompiScrittura = false;
function doc(chiave) {
    return {
        get: async () => ({ exists: dati.has(chiave), data: () => dati.get(chiave) }),
        set: async (patch, opz) => {
            if (rompiScrittura) throw new Error('firestore giu\'');
            const base = (opz && opz.merge && dati.get(chiave)) ? Object.assign({}, dati.get(chiave)) : {};
            Object.assign(base, patch);
            dati.set(chiave, JSON.parse(JSON.stringify(base)));
        },
        delete: async () => { dati.delete(chiave); }
    };
}
// il solo filtro che usa il modulo: where('quota', '==', x)
const db = {
    collection: (nome) => ({
        doc: (id) => doc(nome + '/' + id),
        where: (campo, op, valore) => {
            const q = {
                limit: () => q,
                get: async () => {
                    const ds = [...dati.keys()].filter(k => k.startsWith(nome + '/'))
                        .map(k => ({ id: k.slice(nome.length + 1), data: () => dati.get(k) }))
                        .filter(d => String((d.data() || {})[campo]) === String(valore));
                    return { forEach: f => ds.forEach(f), size: ds.length };
                }
            };
            return q;
        }
    })
};

const posta = [];
let rompiInvio = 0;
const nodemailer = {
    createTransport: () => ({
        sendMail: async (msg) => {
            if (rompiInvio > 0) { rompiInvio--; throw new Error('server di posta non raggiungibile'); }
            posta.push(msg);
            return { response: '250 ok' };
        },
        close: () => { }
    })
};
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'nodemailer') return nodemailer;
    return veroRequire.apply(this, arguments);
};
process.env.SMTP_HOST = 'smtp.prova';
process.env.SMTP_USER = 'noreply@ngb.it';
process.env.SMTP_PASS = 'x';
process.env.SMTP_FROM_EMAIL = 'noreply@ngb.it';

const A = require(path.join(__dirname, '..', 'lib/iscrizioni-aderenti.js'));

let ok = 0, ko = 0;
function esigi(cond, che) {
    if (cond) { ok++; console.log('  ok   ' + che); }
    else { ko++; console.log('  KO   ' + che); }
}
async function prova(titolo, fn) {
    console.log('\n' + titolo);
    try { await fn(); }
    catch (e) { ko++; console.log('  KO   eccezione: ' + (e && e.message)); }
}
function azzera() { dati.clear(); posta.length = 0; rompiInvio = 0; rompiScrittura = false; }

const BASE = {
    quota: 'milano-2027-aderenti',
    nome: 'Anna', cognome: 'Verdi', email: 'Anna.Verdi@Studio.it', telefono: '+39 333 1234567',
    studio: 'Studio Verdi', citta: 'Verona',
    fatturazione: {
        intestatario: 'Studio Verdi Associati', partitaIva: 'IT 04641610235', codiceFiscale: '04641610235',
        indirizzo: 'Via Roma 1', cap: '37121', comune: 'Verona', provincia: 'vr',
        codiceDestinatario: 'm5uxcr1', pec: '', emailFatture: 'Amministrazione@Studio.it'
    },
    privacy: true, accettaQuota: true
};
function iscrizione(extra, fat) {
    const c = JSON.parse(JSON.stringify(BASE));
    Object.assign(c, extra || {});
    Object.assign(c.fatturazione, fat || {});
    return c;
}
function invia(extra, fat) { return A.ricevi(db, iscrizione(extra, fat)); }

(async () => {
    await prova('0. Controlli di forma', async () => {
        esigi(A.partitaIvaValida('04641610235'), 'la partita IVA di Revilaw e\' valida');
        esigi(!A.partitaIvaValida('04641610236'), 'una cifra scambiata non passa');
        esigi(A.codiceFiscaleValido('RSSMRA80A01F205X'), 'un codice fiscale di persona ha la forma giusta');
        esigi(A.codiceFiscaleValido('04641610235'), 'il codice fiscale di una societa\' (11 cifre) passa');
        const i = A.importi(A.definizione('milano-2027-aderenti'));
        esigi(i.imponibile === 200 && i.iva === 44 && i.totale === 244, '200 + IVA 22% = 244');
    });

    await prova('1. Un\'iscrizione completa: registrata, due mail', async () => {
        azzera();
        const r = await invia();
        esigi(r.stato === 200 && r.corpo.ok, 'passa (' + (r.corpo.msg || 'ok') + ')');
        esigi(r.corpo.aggiornata === false, 'e\' una prima iscrizione');
        const chiavi = [...dati.keys()];
        esigi(chiavi.length === 1 && chiavi[0].startsWith('iscrizioniAderenti/'), 'una scheda in iscrizioniAderenti');
        const s = dati.get(chiavi[0]);
        esigi(s.email === 'anna.verdi@studio.it', 'l\'email si salva in minuscolo');
        esigi(s.fatturazione.partitaIva === '04641610235', 'il prefisso IT e gli spazi della partita IVA si tolgono');
        esigi(s.fatturazione.provincia === 'VR' && s.fatturazione.codiceDestinatario === 'M5UXCR1', 'provincia e SDI in maiuscolo');
        esigi(s.importi.totale === 244, 'sulla scheda c\'e\' il totale da fatturare');
        esigi(posta.length === 2, 'partono due mail');
        const interna = posta.find(m => /pierluigisterzi@revilaw\.it/.test(m.to));
        esigi(!!interna && /andreamissori@revilaw\.it/.test(interna.to), 'l\'avviso va a Pierluigi Sterzi e Andrea Missori');
        esigi(interna && interna.replyTo === 'anna.verdi@studio.it', 'rispondendo all\'avviso si scrive all\'iscritto');
        esigi(interna && /Studio Verdi Associati/.test(interna.html) && /04641610235/.test(interna.html) && /M5UXCR1/.test(interna.html),
            'nell\'avviso ci sono i dati di fatturazione');
        esigi(interna && /244,00/.test(interna.html), 'nell\'avviso c\'e\' l\'importo IVA inclusa');
        const conf = posta.find(m => m.to === 'anna.verdi@studio.it');
        esigi(!!conf && /fattura/i.test(conf.html) && /200,00/.test(conf.html), 'all\'iscritto il riepilogo con quota e fattura in arrivo');
        esigi(dati.get(chiavi[0]).avvisati === true && dati.get(chiavi[0]).mail === true, 'sulla scheda risulta che le mail sono partite');
    });

    await prova('2. La quota non la decide la pagina', async () => {
        azzera();
        const r = await invia({ importi: { totale: 1 }, imponibile: 1 });
        esigi(r.corpo.ok && r.corpo.importi.totale === 244, 'si fattura sempre 244');
        const sconosciuta = await invia({ quota: 'gratis' });
        esigi(sconosciuta.stato === 400, 'una quota che non esiste si rifiuta');
    });

    await prova('3. I dati sbagliati si fermano', async () => {
        azzera();
        const casi = [
            [{ nome: '' }, null, 'senza nome'],
            [{ email: 'anna@' }, null, 'email storta'],
            [{ telefono: '12' }, null, 'telefono troppo corto'],
            [{}, { intestatario: '' }, 'senza intestatario'],
            [{}, { partitaIva: '04641610236' }, 'partita IVA con la cifra di controllo storta'],
            [{}, { partitaIva: '' }, 'senza partita IVA'],
            [{}, { codiceFiscale: '' }, 'senza codice fiscale'],
            [{}, { codiceFiscale: 'RSSMRA80A01' }, 'codice fiscale storto'],
            [{}, { emailFatture: '' }, 'senza email per la fattura'],
            [{}, { emailFatture: 'amministrazione@' }, 'email per la fattura storta'],
            [{}, { cap: '3712' }, 'CAP di 4 cifre'],
            [{}, { provincia: 'Verona' }, 'provincia scritta per intero'],
            [{}, { codiceDestinatario: 'AB' }, 'codice SDI troppo corto'],
            [{}, { codiceDestinatario: '', pec: '' }, 'ne\' SDI ne\' PEC'],
            [{ privacy: false }, null, 'senza consenso privacy'],
            [{ accettaQuota: false }, null, 'senza aver letto la quota']
        ];
        for (const [extra, fat, che] of casi) {
            const r = await invia(extra, fat);
            esigi(r.stato === 400 && !r.corpo.ok && r.corpo.msg, che + ' -> "' + r.corpo.msg + '"');
        }
        esigi(dati.size === 0 && posta.length === 0, 'nessuna scheda e nessuna mail');
    });

    await prova('4. Basta uno fra SDI e PEC', async () => {
        azzera();
        let r = await invia({}, { codiceDestinatario: '', pec: 'studio@pec.it' });
        esigi(r.corpo.ok, 'con la sola PEC passa');
        azzera();
        r = await invia({}, { codiceFiscale: 'rssmra80a01f205x' });
        esigi(r.corpo.ok, 'con il codice fiscale di una persona passa');
        const s = [...dati.values()][0];
        esigi(s.fatturazione.emailFatture === 'amministrazione@studio.it', 'l\'email per la fattura si salva, in minuscolo');
    });

    await prova('4b. Le note nell\'avviso dicono che cosa sono', async () => {
        azzera();
        await invia({ note: 'Celiaco' });
        let interna = posta.find(m => /pierluigisterzi/.test(m.to));
        esigi(/Note \(allergie o intolleranze per la cena, altre indicazioni\)/.test(interna.html) && /Celiaco/.test(interna.html), 'con le note, l\'intestazione le spiega');
        azzera();
        await invia({ note: '' });
        interna = posta.find(m => /pierluigisterzi/.test(m.to));
        esigi(/allergie o intolleranze/.test(interna.html) && /nessuna/.test(interna.html), 'senza note, l\'avviso dice "nessuna"');
    });

    await prova('5. Due invii, una scheda', async () => {
        azzera();
        await invia();
        posta.length = 0;
        const r = await invia({ email: 'anna.verdi@studio.it' }, { intestatario: 'Verdi Srl', partitaIva: '04641610235' });
        esigi(r.corpo.ok && r.corpo.aggiornata === true, 'il secondo invio aggiorna');
        esigi(dati.size === 1, 'resta una scheda sola');
        const s = [...dati.values()][0];
        esigi(s.fatturazione.intestatario === 'Verdi Srl', 'valgono i dati nuovi');
        esigi(Array.isArray(s.storia) && s.storia.length === 1 && s.storia[0].fatturazione.intestatario === 'Studio Verdi Associati',
            'quelli di prima restano nella storia');
        const interna = posta.find(m => /pierluigisterzi/.test(m.to));
        esigi(interna && /aggiornata/i.test(interna.subject), 'l\'avviso dice che e\' una correzione');
    });

    await prova('6. Se la posta non parte l\'iscrizione resta', async () => {
        azzera();
        rompiInvio = 2;
        const r = await invia();
        esigi(r.corpo.ok, 'la risposta e\' ok');
        const s = [...dati.values()][0];
        esigi(s && s.avvisati === false && s.mail === false, 'la scheda c\'e\' e dice che le mail non sono partite');
    });

    await prova('7. Se l\'archivio non risponde non parte niente', async () => {
        azzera();
        rompiScrittura = true;
        const r = await invia();
        esigi(r.stato === 500 && posta.length === 0, 'errore, e nessuna mail per un\'iscrizione non registrata');
    });

    await prova('8. Area riservata: elenco, fatture, cancellazione', async () => {
        azzera();
        await invia();
        await invia({ nome: 'Bruno', cognome: 'Neri', email: 'bruno@neri.it' }, { intestatario: 'Bruno Neri', codiceFiscale: 'RSSMRA80A01F205X', codiceDestinatario: '', pec: 'bruno@pec.it' });
        const ctx = (body, chi) => Object.assign({ db: db, body: Object.assign({ sezione: 'aderenti' }, body), email: 'admin@revilaw.it', eAdmin: false, ePartner: false }, chi || {});
        esigi(A.gestisce({ sezione: 'aderenti' }) && !A.gestisce({ sezione: 'cene' }), 'la sezione si riconosce');

        let r = await A.esegui(ctx({ azione: 'elenco', evento: 'milano-2027-02-26' }));
        const q = r.corpo.quote && r.corpo.quote[0];
        esigi(r.stato === 200 && q && q.righe.length === 2, 'l\'elenco di Milano ha le due iscrizioni');
        esigi(q.conti.iscritti === 2 && q.conti.daFatturare === 2 && q.conti.totaleDaFatturare === 488, 'conti: 2 iscritti, 2 fatture da emettere, 488 euro');
        esigi(q.righe[0].fatturazione.intestatario === 'Studio Verdi Associati' && q.righe[0].telefono, 'nella riga ci sono i dati di fatturazione e i contatti');
        esigi(q.quota.pagina === '/milano_febbraio_2027/aderenti/', 'l\'elenco sa qual e\' la pagina da mandare');
        r = await A.esegui(ctx({ azione: 'elenco', evento: 'napoli-2026-10-02' }));
        esigi(r.corpo.quote.length === 0, 'un altro evento non ha iscrizioni degli aderenti');

        const id = q.righe[0].id;
        r = await A.esegui(ctx({ azione: 'fattura', quota: 'milano-2027-aderenti', id: id, emessa: true, numero: '12/2027' }));
        esigi(r.stato === 403, 'chi vede soltanto non segna fatture');
        r = await A.esegui(ctx({ azione: 'fattura', quota: 'milano-2027-aderenti', id: id, emessa: true, numero: '12/2027' }, { ePartner: true }));
        esigi(r.stato === 200 && r.corpo.fattura.emessa && r.corpo.fattura.numero === '12/2027', 'un partner segna la fattura emessa, con il numero');
        r = await A.esegui(ctx({ azione: 'elenco' }));
        esigi(r.corpo.quote[0].conti.fattureEmesse === 1 && r.corpo.quote[0].conti.totaleDaFatturare === 244, 'resta da fatturare una sola iscrizione');
        esigi(r.corpo.quote[0].righe[0].fattura.da === 'admin@revilaw.it', 'si sa chi l\'ha segnata');

        await invia({}, { intestatario: 'Studio Verdi Associati' });
        r = await A.esegui(ctx({ azione: 'elenco' }));
        esigi(r.corpo.quote[0].righe.find(x => x.id === id).fattura.emessa, 'una correzione dell\'iscritto non cancella la fattura segnata');

        r = await A.esegui(ctx({ azione: 'fattura', quota: 'milano-2027-aderenti', id: id, emessa: false }, { eAdmin: true }));
        esigi(r.corpo.ok && !r.corpo.fattura.emessa, 'segnata per sbaglio si toglie');
        r = await A.esegui(ctx({ azione: 'fattura', quota: 'milano-2027-aderenti', id: 'non-esiste', emessa: true }, { eAdmin: true }));
        esigi(r.stato === 404, 'un\'iscrizione che non c\'e\' si dice');

        r = await A.esegui(ctx({ azione: 'cancella', quota: 'milano-2027-aderenti', ids: [id] }, { ePartner: true }));
        esigi(r.stato === 403, 'togliere un\'iscrizione non e\' dei partner');
        r = await A.esegui(ctx({ azione: 'cancella', quota: 'milano-2027-aderenti', ids: [id] }, { eAdmin: true }));
        esigi(r.corpo.tolte === 1 && dati.size === 1, 'l\'amministratore la toglie');
    });

    console.log('\n' + ok + ' ok, ' + ko + ' KO');
    process.exit(ko ? 1 : 0);
})();
