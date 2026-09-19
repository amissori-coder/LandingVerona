/* ============================================================
   Le cene dei giorni del convegno di Napoli
   ------------------------------------------------------------
   Due cene, due platee diverse, due pagine diverse:

     1 OTTOBRE  tutti gli aderenti Revilaw;
     2 OTTOBRE  coordinatori, vice coordinatori e partner Revilaw.

   Chi e' invitato NON si iscrive dal sito: riceve il collegamento
   e da li' conferma. Le pagine stanno fuori dalla sitemap e con
   "noindex", come le agende personali degli ospiti: l'indirizzo
   e' l'invito, e chi non lo ha ricevuto non lo trova cercando.

   PERCHE' UN MODULO E NON UN FOGLIO. La conferma di presenza e'
   un numero che il giorno prima si comunica al ristorante, e
   sbagliarlo costa: dei coperti pagati a vuoto o gente in piedi.
   Serve quindi che il conto si faccia da solo, che una persona
   possa cambiare idea senza creare una seconda riga, e che
   l'elenco lo veda chi organizza dall'area riservata, accanto
   alle iscrizioni dell'evento.

   COME SI CONTANO I POSTI. Una conferma vale UN posto per chi
   compila piu' uno per ogni ospite che porta. Chi risponde "non
   ci sara'" resta in elenco - e' un'informazione, non un vuoto -
   ma non occupa niente.

   IL TERMINE. Si conferma entro domenica 27 settembre 2026, a
   mezzanotte. Dopo, il modulo si chiude: la pagina lo dice e il
   servizio lo ripete, perche' una scheda aperta in anticipo e
   inviata il giorno dopo passerebbe senza che nessuno se ne
   accorga. Chi arriva tardi trova l'indirizzo della segreteria.

   UN INDIRIZZO, UNA SCHEDA. L'identificativo del documento nasce
   dalla cena e dall'email: se una persona compila due volte -
   perche' ha cambiato idea, o perche' non era sicura del primo
   invio - la seconda AGGIORNA la prima invece di aggiungere un
   doppione. Quello che cambia resta scritto nella sua storia.
   ============================================================ */

const nodemailer = require('nodemailer');
const { avvolgi, senzaTrattiniLunghi } = require('./mail-layout');

/* --- LE DUE CENE ---
   Restano qui e non nell'area riservata perche' il servizio deve poter
   rifiutare da solo una conferma fuori termine o su una cena che non
   esiste: se le date arrivassero dalla pagina, basterebbe cambiarle nel
   browser per riaprire un modulo chiuso.

   "scadenza" e' un istante, non una data: il termine e' la mezzanotte
   italiana fra domenica 27 e lunedi 28 settembre, e scritto con il fuso
   (+02:00, l'ora legale in vigore quel giorno) vale lo stesso da
   qualunque parte del mondo si apra la pagina.

   "luogo" e "ora" si vedono nella pagina e nella mail di conferma solo
   se compilati: finche' il ristorante non e' fissato e' meglio una riga
   in meno che un indirizzo sbagliato da smentire con una seconda mail. */
const TERMINE = Date.parse('2026-09-27T23:59:59+02:00');

const CENE = [
    {
        id: 'napoli-2026-10-01',
        evento: 'napoli-2026-10-02',
        titolo: 'Cena degli aderenti Revilaw',
        quando: 'giovedì 1 ottobre 2026',
        giorno: '2026-10-01',
        ora: '',
        luogo: '',
        chi: 'tutti gli aderenti Revilaw',
        pagina: '/cene_napoli/aderenti/',
        ospitiMax: 3,
        scadenza: TERMINE
    },
    {
        id: 'napoli-2026-10-02',
        evento: 'napoli-2026-10-02',
        titolo: 'Cena dei coordinatori, vice coordinatori e partner Revilaw',
        quando: 'venerdì 2 ottobre 2026',
        giorno: '2026-10-02',
        ora: '',
        luogo: '',
        chi: 'coordinatori, vice coordinatori e partner Revilaw',
        pagina: '/cene_napoli/coordinatori/',
        ospitiMax: 3,
        scadenza: TERMINE
    }
];

function definizione(id) {
    return CENE.find(c => c.id === String(id || '')) || null;
}
/* Quello che la pagina puo' sapere prima che qualcuno scriva il suo nome:
   niente di chi ha gia' confermato, solo la cena e il termine. La pagina e'
   aperta a chiunque abbia l'indirizzo, e l'elenco degli invitati non e' una
   cosa da lasciare leggere a chi passa. */
function perLaPagina(c) {
    if (!c) return null;
    return {
        id: c.id, titolo: c.titolo, quando: c.quando, giorno: c.giorno,
        ora: c.ora, luogo: c.luogo, chi: c.chi, ospitiMax: c.ospitiMax,
        scadenza: c.scadenza, chiusa: Date.now() > c.scadenza
    };
}

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function indirizzoValido(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
}
// l'email contiene "@" e punti: nel nome di un documento i punti non ci vanno
function idScheda(cena, email) {
    return (String(cena) + '~' + String(email)).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 400);
}

/* Gli ospiti come li scrive chi compila: un nome per riga o separati da
   virgola. Si tengono solo quelli con un nome, fino al tetto della cena.
   Il NUMERO dichiarato non basta da solo - "porto due persone" al
   ristorante diventa "due coperti senza nome" - ma nemmeno si pretende il
   nome per forza: chi non lo sa ancora dichiara quanti sono, e i posti si
   contano lo stesso. */
function ospitiDa(v, max) {
    const tetto = Math.max(0, Math.min(Number(max) || 0, 10));
    const grezzi = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;\n\r]+/);
    const out = [];
    grezzi.forEach(x => {
        const nome = testo(x, 120);
        if (nome && out.length < tetto) out.push(nome);
    });
    return out;
}

function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}
function mittente() {
    const ind = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const nome = (process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
    return '"' + nome + '" <' + ind + '>';
}
function configurato() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/* La mail che torna a chi ha confermato. Non e' una cortesia: dice che cosa
   abbiamo scritto - presenza, ospiti, note - e che si puo' cambiare fino al
   termine tornando sullo stesso indirizzo. Senza, chi ha un ripensamento
   scrive alla segreteria e il conto lo rifa' una persona a mano. */
function mailConferma(cena, r) {
    const quando = cena.quando + (cena.ora ? ', ore ' + cena.ora : '');
    const dove = cena.luogo ? '<br>' + esc(cena.luogo) : '';
    const posti = r.presente ? (1 + r.quantiOspiti) : 0;
    const chiOspiti = r.ospiti.length
        ? ' (Lei e ' + esc(r.ospiti.join(', ')) + ')'
        : (r.quantiOspiti ? ' (Lei e ' + r.quantiOspiti + (r.quantiOspiti === 1 ? ' ospite' : ' ospiti') + ')' : ' (Lei)');
    const dentro = '<p style="margin:0 0 14px;">Gentile ' + esc(r.nome) + ' ' + esc(r.cognome) + ',</p>'
        + (r.presente
            ? '<p style="margin:0 0 14px;">abbiamo registrato la Sua presenza alla <b>' + esc(cena.titolo)
                + '</b> di ' + esc(quando) + '.' + dove + '</p>'
            : '<p style="margin:0 0 14px;">abbiamo registrato che non potrà partecipare alla <b>'
                + esc(cena.titolo) + '</b> di ' + esc(quando) + '. Sarà per la prossima occasione.</p>')
        + (r.presente
            ? '<p style="margin:0 0 14px;font-size:13px;color:#475569;">Riepilogo:<br>'
                + '<b>' + posti + '</b> ' + (posti === 1 ? 'posto' : 'posti') + ' a tavola' + chiOspiti
                + (r.note ? '<br>Note: ' + esc(r.note) : '')
                + '</p>'
            : '')
        + '<p style="margin:0 0 14px;font-size:13px;color:#475569;">Se cambia programma può tornare sulla stessa '
        + 'pagina e inviare di nuovo il modulo: vale sempre l\'ultima risposta. Le conferme si raccolgono '
        + 'fino a <b>domenica 27 settembre</b>.</p>'
        + '<p style="margin:0;">Cordiali saluti.</p>';
    return {
        oggetto: senzaTrattiniLunghi((r.presente ? 'Conferma di presenza - ' : 'Registrata la Sua assenza - ') + cena.titolo),
        html: avvolgi(dentro)
    };
}

/* --- l'arrivo di una conferma ---
   Chiamata dall'endpoint pubblico: quello che arriva qui lo scrive chiunque
   abbia il collegamento, e va trattato come tale. */
async function ricevi(db, corpo) {
    const c = corpo || {};
    const cena = definizione(c.cena);
    if (!cena) return { stato: 400, corpo: { ok: false, msg: 'Cena non riconosciuta.' } };
    /* Il termine lo fa rispettare il servizio, non il conto alla rovescia
       della pagina: quello si puo' fermare tenendo aperta la scheda, questo no. */
    if (Date.now() > cena.scadenza) {
        return {
            stato: 403,
            corpo: {
                ok: false, chiusa: true,
                msg: 'Le conferme si sono chiuse domenica 27 settembre. Scriva alla segreteria: info@nextgenerationbusiness.it'
            }
        };
    }

    const nome = testo(c.nome, 80);
    const cognome = testo(c.cognome, 80);
    const email = testo(c.email, 200).toLowerCase();
    if (!nome || !cognome) return { stato: 400, corpo: { ok: false, msg: 'Nome e cognome sono obbligatori.' } };
    if (!indirizzoValido(email)) return { stato: 400, corpo: { ok: false, msg: 'L\'indirizzo email non sembra valido.' } };

    /* "Partecipo" non ha un valore di riposo: chi non spunta niente non ha
       risposto, e registrarlo come presente vorrebbe dire un coperto pagato
       per una persona che non si e' mai espressa. */
    if (c.presente !== true && c.presente !== false) {
        return { stato: 400, corpo: { ok: false, msg: 'Indichi se sarà presente alla cena.' } };
    }
    const presente = c.presente === true;
    // chi non viene non porta ospiti: il numero che avesse scritto prima di
    // cambiare risposta non deve restare a occupare posti
    const ospiti = presente ? ospitiDa(c.ospiti, cena.ospitiMax) : [];
    const quantiDichiarati = presente
        ? Math.max(0, Math.min(Number(c.quantiOspiti) || 0, cena.ospitiMax))
        : 0;
    /* I nomi contano piu' del numero, ma il numero non si butta: chi scrive
       "2" senza nomi porta comunque due persone. */
    const quanti = Math.max(ospiti.length, quantiDichiarati);

    const r = {
        cena: cena.id, evento: cena.evento,
        nome: nome, cognome: cognome, email: email,
        presente: presente,
        ospiti: ospiti, quantiOspiti: quanti,
        posti: presente ? 1 + quanti : 0,
        note: testo(c.note, 500),
        telefono: testo(c.telefono, 40),
        quando: Date.now(),
        origine: testo(c.origine, 200)
    };

    const id = idScheda(cena.id, email);
    const rif = db.collection('ceneEventi').doc(id);
    let prima = null;
    try {
        const s = await rif.get();
        prima = s.exists ? (s.data() || {}) : null;
    } catch (_) { prima = null; }

    /* La storia dei ripensamenti. Serve a chi organizza: "eravamo 40, adesso
       siamo 38" e' una frase che si deve poter ricostruire senza chiedere in
       giro. Si tengono le ultime cinque versioni, non tutte: oltre non serve
       a nessuno e la scheda cresce senza motivo. */
    const storia = Array.isArray(prima && prima.storia) ? prima.storia.slice(-4) : [];
    if (prima) {
        storia.push({
            quando: Number(prima.quando) || 0,
            presente: !!prima.presente,
            posti: Number(prima.posti) || 0
        });
    }
    r.storia = storia;
    if (prima && prima.primaVolta) r.primaVolta = prima.primaVolta;
    else r.primaVolta = r.quando;

    try {
        await rif.set(r, { merge: true });
    } catch (e) {
        console.error('Conferma cena non registrata:', String((e && e.message) || e).slice(0, 200));
        return { stato: 500, corpo: { ok: false, msg: 'Non siamo riusciti a registrare la conferma: riprovi fra poco.' } };
    }

    // la mail e' una conseguenza, non una condizione: se non parte la conferma
    // resta comunque scritta e si vede nell'area riservata
    let mail = false;
    if (configurato()) {
        const trans = trasporto();
        const m = mailConferma(cena, r);
        try {
            await trans.sendMail({ from: mittente(), to: email, subject: m.oggetto, html: m.html });
            mail = true;
        } catch (e) {
            console.error('Conferma cena, mail non partita:', String((e && e.message) || e).slice(0, 200));
        }
        try { trans.close(); } catch (_) { /* niente da chiudere */ }
    }
    try { await rif.set({ mail: mail }, { merge: true }); }
    catch (_) { /* dato di servizio */ }

    return {
        stato: 200,
        corpo: {
            ok: true, presente: presente, posti: r.posti,
            aggiornata: !!prima, mail: mail
        }
    };
}

/* --- quello che vede chi organizza ---
   Le risposte di una cena, in ordine di arrivo, con i conti gia' fatti: i
   posti li somma il servizio e non l'area riservata, cosi' il numero che si
   comunica al ristorante e' uno solo da qualunque parte lo si guardi. */
async function elenco(db, cenaId) {
    const cena = definizione(cenaId);
    if (!cena) return null;
    let snap;
    try {
        snap = await db.collection('ceneEventi').where('cena', '==', cena.id).limit(1000).get();
    } catch (e) {
        console.error('Elenco cena non letto:', String((e && e.message) || e).slice(0, 200));
        return null;
    }
    const righe = [];
    snap.forEach(d => {
        const v = d.data() || {};
        righe.push({
            id: d.id, quando: Number(v.quando) || 0, primaVolta: Number(v.primaVolta) || 0,
            nome: v.nome || '', cognome: v.cognome || '', email: v.email || '',
            telefono: v.telefono || '',
            presente: !!v.presente,
            ospiti: Array.isArray(v.ospiti) ? v.ospiti : [],
            quantiOspiti: Number(v.quantiOspiti) || 0,
            posti: Number(v.posti) || 0,
            note: v.note || '',
            mail: !!v.mail,
            cambiata: Array.isArray(v.storia) && v.storia.length > 0
        });
    });
    righe.sort((a, b) => (a.quando || 0) - (b.quando || 0));
    const presenti = righe.filter(x => x.presente);
    return {
        cena: perLaPagina(cena),
        righe: righe,
        conti: {
            risposte: righe.length,
            presenti: presenti.length,
            assenti: righe.length - presenti.length,
            ospiti: presenti.reduce((t, x) => t + (x.quantiOspiti || 0), 0),
            posti: presenti.reduce((t, x) => t + (x.posti || 0), 0)
        }
    };
}

/* Togliere una risposta. Serve per le prove e per chi ha compilato con un
   indirizzo sbagliato: quella scheda non si aggiorna piu' da sola - la
   persona rifara' il modulo con l'indirizzo giusto - e resterebbe a contare
   posti che nessuno occupera'. */
async function elimina(db, cenaId, ids) {
    const cena = definizione(cenaId);
    if (!cena) return { tolte: 0 };
    const chiesti = (Array.isArray(ids) ? ids : []).map(x => testo(x, 400)).filter(Boolean).slice(0, 100);
    let tolte = 0;
    for (const id of chiesti) {
        const rif = db.collection('ceneEventi').doc(id);
        try {
            const s = await rif.get();
            if (!s.exists) continue;
            /* Si cancella solo dentro la cena che si sta guardando:
               l'identificativo arriva dalla rete, e senza questo controllo
               basterebbe indovinarne uno per togliere la risposta dell'altra
               serata. */
            if (String((s.data() || {}).cena || '') !== cena.id) continue;
            await rif.delete();
            tolte++;
        } catch (e) {
            console.error('Risposta cena non tolta:', String((e && e.message) || e).slice(0, 200));
        }
    }
    return { tolte: tolte };
}

/* --- lo smistamento dall'area riservata (sezione: 'cene') ---
   Legge chiunque veda gli Eventi: il permesso lo ha gia' verificato
   api/presenze.js prima di arrivare qui. Cancella solo l'amministratore,
   come per le iscrizioni. */
async function esegui(ctx) {
    const { db, body, eAdmin } = ctx;
    const azione = String((body && body.azione) || 'elenco');

    if (azione === 'elenco') {
        /* Tutte e due le cene in una risposta sola: si guardano insieme -
           "chi c'e' la sera prima" e "chi c'e' la sera dopo" sono la stessa
           domanda fatta due volte - e una chiamata per serata sarebbe una
           chiamata in piu' a ogni apertura della finestra. */
        const quali = CENE.filter(c => !body.evento || c.evento === String(body.evento));
        const fuori = [];
        for (const c of quali) {
            const e = await elenco(db, c.id);
            if (e) fuori.push(e);
            else fuori.push({ cena: perLaPagina(c), righe: [], conti: null, errore: true });
        }
        return { stato: 200, corpo: { ok: true, cene: fuori, termine: TERMINE } };
    }

    if (azione === 'cancella') {
        if (!eAdmin) return { stato: 403, corpo: { ok: false, msg: 'Solo l\'amministratore puo\' togliere una risposta.' } };
        const r = await elimina(db, body.cena, body.ids);
        return { stato: 200, corpo: { ok: true, tolte: r.tolte } };
    }

    return { stato: 400, corpo: { ok: false, msg: 'Azione non riconosciuta.' } };
}

function gestisce(body) { return !!(body && String(body.sezione || '') === 'cene'); }

module.exports = {
    CENE, TERMINE, definizione, perLaPagina, ricevi, elenco, elimina, esegui, gestisce,
    ospitiDa, indirizzoValido, configurato
};
