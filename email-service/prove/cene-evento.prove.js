/* ============================================================
   PROVE - lib/cene-evento.js (le cene del convegno di Napoli)
   ------------------------------------------------------------
       node prove/cene-evento.prove.js

   Niente da installare: Firestore e la posta sono finti e stanno
   qui dentro. Esce con 1 se qualcosa e' rosso.

   COSA DIMOSTRANO. Il numero che il giorno prima si comunica al
   ristorante nasce da queste righe, e sbagliarlo costa dei
   coperti pagati a vuoto o della gente in piedi. Quindi:

     - i posti si contano da soli: chi compila vale uno, piu' un
       posto per ogni ospite che porta;
     - chi dice che non viene resta in elenco ma non occupa
       niente, e gli ospiti che aveva scritto prima di cambiare
       idea non restano a contare posti;
     - chi compila due volte NON diventa due righe: la seconda
       risposta aggiorna la prima, e il totale non raddoppia;
     - dopo il termine di domenica 27 settembre il servizio
       rifiuta, anche se la pagina era rimasta aperta da prima:
       il modulo si chiude qui, non nel browser;
     - "partecipo" senza risposta non passa: un silenzio non e'
       una presenza, e prenotarlo come tale vorrebbe dire un
       posto a tavola per chi non si e' mai espresso;
     - le due serate restano separate: la risposta di una non si
       vede nell'elenco dell'altra e non si cancella da li';
     - l'elenco lo legge chi organizza, la cancellazione e' del
       solo amministratore.
   ============================================================ */
'use strict';
const Module = require('module');
const path = require('path');

// ---------- orologio ----------
// mercoledi 23 settembre 2026: il modulo e' aperto, il termine e' domenica 27
let orologio = Date.parse('2026-09-23T10:00:00+02:00');
Date.now = () => orologio;

// ---------- Firestore finto ----------
const dati = new Map();
function applica(vecchio, patch, merge) {
    const base = (merge && vecchio) ? Object.assign({}, vecchio) : {};
    for (const k of Object.keys(patch)) base[k] = patch[k];
    return base;
}
function doc(chiave) {
    const self = {
        get: async () => ({ exists: dati.has(chiave), id: chiave.split('/').pop(), data: () => dati.get(chiave), ref: self }),
        set: async (patch, opz) => { dati.set(chiave, JSON.parse(JSON.stringify(applica(dati.get(chiave), patch, !!(opz && opz.merge))))); },
        delete: async () => { dati.delete(chiave); }
    };
    return self;
}
/* Una collezione con il solo filtro che serve al modulo: where('cena','==',x).
   Se domani il modulo chiedesse altro, qui si accorgerebbe subito. */
function collection(nome) {
    const filtra = (campo, valore) => {
        const elenco = () => [...dati.keys()].filter(k => k.startsWith(nome + '/'))
            .map(k => ({ id: k.slice(nome.length + 1), data: () => dati.get(k) }))
            .filter(d => campo === null || String((d.data() || {})[campo]) === String(valore));
        const q = {
            limit: () => q,
            get: async () => {
                const ds = elenco();
                return { forEach: f => ds.forEach(f), docs: ds, size: ds.length, empty: !ds.length };
            }
        };
        return q;
    };
    return {
        doc: (id) => doc(nome + '/' + id),
        where: (campo, op, valore) => {
            if (op !== '==') throw new Error('filtro non previsto: ' + op);
            return filtra(campo, valore);
        },
        limit: () => filtra(null),
        get: async () => filtra(null).get()
    };
}
const db = { collection: collection };

// ---------- SMTP finto ----------
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

// ---------- intercetta i require ----------
const veroRequire = Module.prototype.require;
Module.prototype.require = function (nome) {
    if (nome === 'nodemailer') return nodemailer;
    return veroRequire.apply(this, arguments);
};

process.env.SMTP_HOST = 'smtp.prova';
process.env.SMTP_USER = 'noreply@ngb.it';
process.env.SMTP_PASS = 'x';
process.env.SMTP_FROM_EMAIL = 'noreply@ngb.it';
process.env.SMTP_FROM_NAME = 'Revilaw S.p.A.';

const RADICE = path.join(__dirname, '..');
const CENE = require(path.join(RADICE, 'lib/cene-evento.js'));

const ADERENTI = 'napoli-2026-10-01';       // 1 ottobre, tutti gli aderenti
const COORD = 'napoli-2026-10-02';          // 2 ottobre, coordinatori e partner

// ---------- impalcatura ----------
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
function azzera() {
    dati.clear();
    posta.length = 0;
    orologio = Date.parse('2026-09-23T10:00:00+02:00');
}
function conferma(corpo) { return CENE.ricevi(db, corpo); }
const BASE = { cena: ADERENTI, nome: 'Anna', cognome: 'Verdi', email: 'anna@revilaw.it', presente: true };

(async () => {
    await prova('1. I posti si contano da soli', async () => {
        azzera();
        const r = await conferma(Object.assign({}, BASE, { ospiti: ['Luca Verdi', 'Marta Neri'] }));
        esigi(r.stato === 200 && r.corpo.ok, 'la conferma passa');
        esigi(r.corpo.posti === 3, 'chi compila vale un posto, piu\' uno per ospite (1 + 2 = 3)');

        await conferma({ cena: ADERENTI, nome: 'Bruno', cognome: 'Rossi', email: 'bruno@revilaw.it', presente: true });
        const e = await CENE.elenco(db, ADERENTI);
        esigi(e.conti.risposte === 2 && e.conti.presenti === 2, 'due risposte, due presenti');
        esigi(e.conti.posti === 4, 'il totale dei posti somma le due schede');
        esigi(e.conti.ospiti === 2, 'gli ospiti si contano a parte, per il ristorante');
    });

    await prova('2. Chi non viene resta in elenco ma non occupa posti', async () => {
        azzera();
        await conferma(Object.assign({}, BASE, { presente: false, ospiti: ['Luca Verdi'], quantiOspiti: 2 }));
        const e = await CENE.elenco(db, ADERENTI);
        esigi(e.conti.risposte === 1 && e.conti.assenti === 1, 'l\'assenza e\' un\'informazione, non un vuoto');
        esigi(e.conti.posti === 0, 'chi non viene non occupa niente');
        esigi(e.righe[0].ospiti.length === 0 && e.righe[0].quantiOspiti === 0,
            'gli ospiti scritti prima di cambiare idea non restano a contare posti');
    });

    await prova('3. Il numero dichiarato vale anche senza i nomi', async () => {
        azzera();
        const r = await conferma(Object.assign({}, BASE, { quantiOspiti: 2 }));
        esigi(r.corpo.posti === 3, 'chi sa quanti sono ma non ancora chi, prenota comunque i coperti');

        const r2 = await conferma({
            cena: ADERENTI, nome: 'Bruno', cognome: 'Rossi', email: 'bruno@revilaw.it',
            presente: true, ospiti: ['Uno', 'Due', 'Tre', 'Quattro', 'Cinque']
        });
        esigi(r2.corpo.posti === 4, 'oltre il tetto di ospiti della serata non si va (1 + 3)');
    });

    await prova('4. Chi compila due volte non diventa due righe', async () => {
        azzera();
        await conferma(Object.assign({}, BASE, { ospiti: ['Luca Verdi'] }));
        const r = await conferma(Object.assign({}, BASE, { email: 'ANNA@revilaw.it', ospiti: [] }));
        esigi(r.corpo.aggiornata === true, 'la seconda risposta si riconosce come un ripensamento');
        const e = await CENE.elenco(db, ADERENTI);
        esigi(e.conti.risposte === 1, 'una persona, una riga, anche con l\'indirizzo scritto in maiuscolo');
        esigi(e.conti.posti === 1, 'vale l\'ultima risposta: l\'ospite tolto non conta piu\'');
        esigi(e.righe[0].cambiata === true, 'la scheda si ricorda di essere stata cambiata');
    });

    await prova('5. Dopo il termine il servizio rifiuta', async () => {
        azzera();
        // lunedi 28 settembre: la pagina poteva essere aperta da giorni
        orologio = Date.parse('2026-09-28T00:30:00+02:00');
        const r = await conferma(BASE);
        esigi(r.stato === 403 && r.corpo.chiusa === true, 'il modulo si chiude sul servizio, non nel browser');
        const e = await CENE.elenco(db, ADERENTI);
        esigi(e.conti.risposte === 0, 'niente e\' stato scritto');

        // e il minuto prima del termine passa ancora
        orologio = Date.parse('2026-09-27T23:58:00+02:00');
        const r2 = await conferma(BASE);
        esigi(r2.stato === 200, 'fino alla mezzanotte di domenica si conferma');
    });

    await prova('6. Quello che manca si dice, non si indovina', async () => {
        azzera();
        const senzaRisposta = await conferma({ cena: ADERENTI, nome: 'Anna', cognome: 'Verdi', email: 'anna@revilaw.it' });
        esigi(senzaRisposta.stato === 400, 'senza dire se viene, la scheda non passa');
        const senzaNome = await conferma({ cena: ADERENTI, nome: '', cognome: '', email: 'anna@revilaw.it', presente: true });
        esigi(senzaNome.stato === 400, 'nome e cognome sono obbligatori');
        const emailStorta = await conferma(Object.assign({}, BASE, { email: 'anna.revilaw' }));
        esigi(emailStorta.stato === 400, 'un indirizzo storto si ferma subito');
        const altraCena = await conferma(Object.assign({}, BASE, { cena: 'cena-inventata' }));
        esigi(altraCena.stato === 400, 'una cena che non esiste non si apre scrivendone il nome');
        const e = await CENE.elenco(db, ADERENTI);
        esigi(e.conti.risposte === 0, 'nessuna di queste ha lasciato una riga');
    });

    await prova('7. Le due serate restano separate', async () => {
        azzera();
        await conferma(Object.assign({}, BASE, { ospiti: ['Luca Verdi'] }));
        await conferma(Object.assign({}, BASE, { cena: COORD }));
        const a = await CENE.elenco(db, ADERENTI);
        const c = await CENE.elenco(db, COORD);
        esigi(a.conti.risposte === 1 && c.conti.risposte === 1, 'la stessa persona puo\' essere a tutte e due');
        esigi(a.conti.posti === 2 && c.conti.posti === 1, 'i conti di una serata non si mescolano con l\'altra');

        // la cancellazione non attraversa le serate
        const idAltro = c.righe[0].id;
        const r = await CENE.elimina(db, ADERENTI, [idAltro]);
        esigi(r.tolte === 0, 'una risposta non si cancella dall\'elenco dell\'altra cena');
        const r2 = await CENE.elimina(db, COORD, [idAltro]);
        esigi(r2.tolte === 1, 'dalla sua, invece, si');
    });

    await prova('8. Chi legge e chi cancella', async () => {
        azzera();
        await conferma(BASE);
        const lettura = await CENE.esegui({ db: db, body: { azione: 'elenco' }, eAdmin: false });
        esigi(lettura.stato === 200 && lettura.corpo.cene.length === 2, 'chi vede gli Eventi legge tutte e due le serate');
        esigi(lettura.corpo.cene[0].conti.posti === 1, 'i conti arrivano gia\' fatti dal servizio');

        const id = lettura.corpo.cene[0].righe[0].id;
        const negata = await CENE.esegui({ db: db, body: { azione: 'cancella', cena: ADERENTI, ids: [id] }, eAdmin: false });
        esigi(negata.stato === 403, 'chi non e\' amministratore non toglie una risposta');
        const concessa = await CENE.esegui({ db: db, body: { azione: 'cancella', cena: ADERENTI, ids: [id] }, eAdmin: true });
        esigi(concessa.stato === 200 && concessa.corpo.tolte === 1, 'l\'amministratore si');
        const dopo = await CENE.elenco(db, ADERENTI);
        esigi(dopo.conti.risposte === 0, 'la riga non c\'e\' piu\'');
    });

    await prova('9. La mail e\' una conseguenza, non una condizione', async () => {
        azzera();
        const r = await conferma(Object.assign({}, BASE, { ospiti: ['Luca Verdi'] }));
        esigi(r.corpo.mail === true && posta.length === 1, 'chi conferma riceve il riepilogo');
        const html = String(posta[0].html);
        esigi(html.indexOf('<b>2</b> posti') >= 0, 'nel riepilogo ci sono i posti prenotati');
        esigi(html.indexOf('Luca Verdi') >= 0, 'e il nome dell\'ospite che si porta');

        azzera();
        rompiInvio = 1;
        const r2 = await conferma(BASE);
        esigi(r2.stato === 200 && r2.corpo.ok && r2.corpo.mail === false,
            'se la posta non risponde la conferma resta comunque registrata');
        const e = await CENE.elenco(db, ADERENTI);
        esigi(e.conti.risposte === 1, 'e si vede nell\'area riservata');
    });

    console.log('\n' + ok + ' ok, ' + ko + ' KO');
    process.exit(ko ? 1 : 0);
})().catch(e => { console.error('Errore nelle prove:', e); process.exit(1); });
