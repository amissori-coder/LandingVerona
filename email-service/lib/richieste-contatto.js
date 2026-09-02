/* ============================================================
   Le richieste di contatto arrivate dal pulsante nella mail
   ------------------------------------------------------------
   La mail di sponsorizzazione finisce con un pulsante. Chi lo
   preme apre una pagina con cinque campi - nome, cognome,
   azienda, email, telefono - e da li' parte la richiesta.

   Due mail, non una:

     A NOI   la richiesta vera, ai destinatari configurati per
             quell'evento e quella campagna: alcuni come
             destinatari, altri in copia. Chi sono lo decide
             l'area riservata, non questo file, perche' cambia
             da evento a evento e a volte in corso d'opera.
     A LORO  una conferma che dice che saranno richiamati. Non e'
             una cortesia: senza, chi ha appena lasciato il
             proprio numero non sa se il modulo ha funzionato, e
             o riprova (e arrivano tre richieste uguali) o
             pensa di essere stato ignorato.

   L'ORDINE CONTA. Prima si scrive in archivio, poi si spedisce.
   Se la mail non parte la richiesta e' comunque registrata e si
   vede nell'area riservata; se fosse il contrario, un guasto
   dello smtp cancellerebbe un contatto commerciale senza lasciare
   traccia. Per la stessa ragione la risposta al modulo e' "ok"
   anche quando la conferma non parte: il lavoro e' fatto, e non
   c'e' niente che chi ha compilato possa farci.

   IL CODICE. Se la richiesta arriva da un pulsante dentro una
   mail, l'indirizzo porta con se' il codice riservato
   all'azienda. Serve a due cose: scrivere nella richiesta di
   quale azienda si tratta, e segnare sulla scheda che quel
   contatto ha risposto. Il modulo funziona anche senza - ci si
   puo' arrivare per altre strade - e allora si registra quello
   che la persona ha scritto, senza inventare legami.
   ============================================================ */

const nodemailer = require('nodemailer');
const { avvolgi, senzaTrattiniLunghi } = require('./mail-layout');
const CODICI = require('./codici-invito');
const CAMPAGNE = require('./campagne-invito');

const MAX_DESTINATARI = 10;

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function indirizzoValido(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
}
/* Un elenco di indirizzi come lo scrive una persona: separati da virgole,
   punti e virgola o a capo. Si tengono solo quelli validi e senza doppioni,
   perche' un indirizzo storto qui vorrebbe dire una richiesta che non arriva
   a nessuno e nessuno che se ne accorge. */
function elencoIndirizzi(v) {
    const grezzi = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;\n\r]+/);
    const visti = {};
    const out = [];
    grezzi.forEach(x => {
        const ind = String(x || '').trim().toLowerCase();
        if (!ind || !indirizzoValido(ind) || visti[ind]) return;
        visti[ind] = true;
        if (out.length < MAX_DESTINATARI) out.push(ind);
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

/* --- a chi arrivano le richieste ---
   Una riga per evento e campagna. Vive in Firestore e non fra le variabili
   d'ambiente perche' la cambia chi organizza, non chi pubblica il servizio. */
function idConfig(evento, campagna) {
    return (String(evento || '') + '~' + CAMPAGNE.normalizza(campagna)).replace(/[\/\\.#$\[\]]/g, '-').slice(0, 300);
}
async function destinatari(db, evento, campagna) {
    let d = {};
    try {
        const s = await db.collection('contattiRichieste').doc(idConfig(evento, campagna)).get();
        d = s.exists ? (s.data() || {}) : {};
    } catch (_) { d = {}; }
    return {
        a: elencoIndirizzi(d.a || []),
        cc: elencoIndirizzi(d.cc || []),
        aggiornato: d.aggiornato || null
    };
}
async function salvaDestinatari(db, evento, campagna, dati, chi) {
    const a = elencoIndirizzi((dati && dati.a) || []);
    /* Chi e' gia' fra i destinatari non va anche in copia: riceverebbe due
       volte lo stesso messaggio e la riga "Cc" direbbe il falso. */
    const cc = elencoIndirizzi((dati && dati.cc) || []).filter(x => a.indexOf(x) < 0);
    await db.collection('contattiRichieste').doc(idConfig(evento, campagna)).set({
        evento: String(evento || ''), campagna: CAMPAGNE.normalizza(campagna),
        a: a, cc: cc, aggiornato: { quando: Date.now(), da: String(chi || '').slice(0, 200) }
    }, { merge: true });
    return { a: a, cc: cc };
}

/* --- le due mail --- */
function mailInterna(r, azienda) {
    const riga = (et, v) => v
        ? '<tr><td style="padding:4px 12px 4px 0;color:#475569;white-space:nowrap;">' + esc(et) + '</td>'
        + '<td style="padding:4px 0;font-weight:600;">' + esc(v) + '</td></tr>'
        : '';
    const dentro = '<p style="margin:0 0 14px;">Richiesta di contatto ricevuta dal modulo sul sito.</p>'
        + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;font-size:14px;">'
        + riga('Nome', r.nome + ' ' + r.cognome)
        + riga('Azienda', r.azienda)
        + riga('Email', r.email)
        + riga('Telefono', r.telefono)
        + riga('Evento', r.eventoNome || r.evento)
        + riga('Campagna', CAMPAGNE.definizione(r.campagna).nome)
        + riga('Codice', r.codice)
        + riga('Azienda invitata', azienda || '')
        + '</table>'
        + (r.messaggio ? '<p style="margin:0 0 14px;"><b>Messaggio</b><br>' + esc(r.messaggio).split('\n').join('<br>') + '</p>' : '')
        + '<p style="margin:0;font-size:13px;color:#475569;">Rispondendo a questo messaggio si scrive direttamente a '
        + esc(r.email) + '.</p>';
    return {
        oggetto: senzaTrattiniLunghi('Richiesta di contatto - ' + (r.azienda || (r.nome + ' ' + r.cognome))),
        html: avvolgi(dentro)
    };
}
function mailConferma(r) {
    const dentro = '<p style="margin:0 0 14px;">Gentile ' + esc(r.nome) + ' ' + esc(r.cognome) + ',</p>'
        + '<p style="margin:0 0 14px;">abbiamo ricevuto la Vostra richiesta di contatto e La ringraziamo '
        + 'per l\'interesse. Sarete contattati quanto prima da un nostro referente '
        + 'ai recapiti che ci avete indicato.</p>'
        + '<p style="margin:0 0 14px;font-size:13px;color:#475569;">Riepilogo di quanto ci avete trasmesso:<br>'
        + esc(r.nome + ' ' + r.cognome) + (r.azienda ? ' - ' + esc(r.azienda) : '') + '<br>'
        + esc(r.email) + (r.telefono ? ' - ' + esc(r.telefono) : '') + '</p>'
        + '<p style="margin:0;">Cordiali saluti.</p>';
    return {
        oggetto: senzaTrattiniLunghi('Abbiamo ricevuto la Vostra richiesta di contatto'),
        html: avvolgi(dentro)
    };
}

/* --- l'arrivo di una richiesta ---
   Chiamata dall'endpoint pubblico: quello che arriva qui e' scritto da
   chiunque, e va trattato come tale. */
async function ricevi(db, corpo) {
    const c = corpo || {};
    const nome = testo(c.nome, 80);
    const cognome = testo(c.cognome, 80);
    const azienda = testo(c.azienda, 200);
    const email = testo(c.email, 200).toLowerCase();
    const telefono = testo(c.telefono, 40);

    if (!nome || !cognome) return { stato: 400, corpo: { ok: false, msg: 'Nome e cognome sono obbligatori.' } };
    if (!azienda) return { stato: 400, corpo: { ok: false, msg: 'Indichi il nome dell\'azienda.' } };
    if (!indirizzoValido(email)) return { stato: 400, corpo: { ok: false, msg: 'L\'indirizzo email non sembra valido.' } };
    if (!telefono || telefono.replace(/[^0-9]/g, '').length < 6) {
        return { stato: 400, corpo: { ok: false, msg: 'Indichi un numero di telefono a cui possiamo richiamarla.' } };
    }

    /* Il codice, se c'e'. Non e' obbligatorio e uno sbagliato non blocca
       niente: una richiesta di contatto persa perche' chi l'ha mandata ha
       ricopiato male cinque caratteri sarebbe il peggiore dei due mali. */
    let invito = null;
    const codice = CODICI.normalizza(c.codice || '');
    if (codice && CODICI.valido(codice)) invito = await CODICI.cerca(db, codice);

    const evento = invito ? invito.evento : testo(c.evento, 80);
    const campagna = CAMPAGNE.normalizza(invito ? invito.campagna : c.campagna);

    const r = {
        nome: nome, cognome: cognome, azienda: azienda, email: email, telefono: telefono,
        messaggio: testo(c.messaggio, 2000),
        evento: evento, eventoNome: testo(c.eventoNome, 120), campagna: campagna,
        codice: invito ? invito.codice : '',
        scheda: invito ? invito.scheda : '',
        quando: Date.now(),
        origine: testo(c.origine, 200)
    };

    // 1) in archivio, sempre e per primo
    let id = '';
    try {
        const doc = await db.collection('richiesteContatto').add(r);
        id = doc.id;
    } catch (e) {
        console.error('Richiesta contatto non registrata:', String((e && e.message) || e).slice(0, 200));
        return { stato: 500, corpo: { ok: false, msg: 'Non siamo riusciti a registrare la richiesta: riprovi fra poco.' } };
    }

    /* 2) sulla scheda dell'azienda contattata, se il codice l'ha identificata.
       E' quello che fa dialogare le due tabelle: nell'elenco della campagna
       la riga passa a "ha risposto" senza che nessuno la sposti a mano. */
    if (r.scheda) {
        try {
            await db.collection('aziendeInvito').doc(r.scheda).set({
                stato: 'risposta',
                contatto: { quando: r.quando, id: id, nome: nome + ' ' + cognome, email: email, telefono: telefono }
            }, { merge: true });
        } catch (_) { /* la richiesta resta comunque registrata */ }
    }
    if (r.codice) {
        try { await CODICI.segnaUso(db, r.codice, { email: email, iscrizione: 'richiesta contatto ' + id }); }
        catch (_) { /* dato di servizio */ }
    }

    // 3) le mail: se non partono, la richiesta e' comunque salva
    const dest = await destinatari(db, evento, campagna);
    let avvisati = 0, confermato = false;
    if (configurato()) {
        const trans = trasporto();
        const interna = mailInterna(r, invito ? invito.ragioneSociale : '');
        if (dest.a.length || dest.cc.length) {
            try {
                await trans.sendMail({
                    from: mittente(),
                    /* Se sono stati indicati solo indirizzi in copia, quelli
                       diventano i destinatari: una mail con il solo Cc e senza
                       A viene trattata come spam da diversi server. */
                    to: dest.a.length ? dest.a.join(', ') : dest.cc.join(', '),
                    cc: (dest.a.length && dest.cc.length) ? dest.cc.join(', ') : undefined,
                    /* Rispondendo alla richiesta si scrive alla persona, non a
                       noi stessi: e' il gesto che fa chi la riceve. */
                    replyTo: email,
                    subject: interna.oggetto,
                    html: interna.html
                });
                avvisati = dest.a.length + dest.cc.length;
            } catch (e) {
                console.error('Richiesta contatto, avviso interno non partito:', String((e && e.message) || e).slice(0, 200));
            }
        }
        const conferma = mailConferma(r);
        try {
            await trans.sendMail({ from: mittente(), to: email, subject: conferma.oggetto, html: conferma.html });
            confermato = true;
        } catch (e) {
            console.error('Richiesta contatto, conferma non partita:', String((e && e.message) || e).slice(0, 200));
        }
        try { trans.close(); } catch (_) { /* niente da chiudere */ }
    }

    try {
        await db.collection('richiesteContatto').doc(id)
            .set({ avvisati: avvisati, confermato: confermato }, { merge: true });
    } catch (_) { /* dato di servizio */ }

    /* Se non c'era nessun destinatario configurato lo si scrive nel registro:
       la richiesta e' salva e si vede nell'area riservata, ma nessuno ha
       ricevuto la mail, ed e' esattamente il genere di cosa di cui ci si
       accorge tre settimane dopo. */
    if (!avvisati) console.warn('Richiesta contatto ' + id + ': nessun destinatario configurato per ' + evento + '/' + campagna + '.');

    return { stato: 200, corpo: { ok: true, id: id, confermato: confermato } };
}

/* Le richieste ricevute, per l'area riservata. */
async function elenco(db, evento, campagna, quante) {
    const limite = Math.min(Math.max(Number(quante) || 200, 1), 500);
    let snap;
    try {
        snap = await db.collection('richiesteContatto').where('evento', '==', String(evento || ''))
            .orderBy('quando', 'desc').limit(limite).get();
    } catch (_) {
        // senza l'indice composito si ripiega sul solo filtro, e si ordina qui
        snap = await db.collection('richiesteContatto').where('evento', '==', String(evento || '')).limit(limite).get();
    }
    const camp = CAMPAGNE.normalizza(campagna);
    const out = [];
    snap.forEach(d => {
        const v = d.data() || {};
        if (CAMPAGNE.normalizza(v.campagna) !== camp) return;
        out.push({
            id: d.id, quando: v.quando || 0,
            nome: v.nome || '', cognome: v.cognome || '', azienda: v.azienda || '',
            email: v.email || '', telefono: v.telefono || '', messaggio: v.messaggio || '',
            codice: v.codice || '', scheda: v.scheda || '',
            avvisati: Number(v.avvisati) || 0, confermato: !!v.confermato
        });
    });
    out.sort((a, b) => (b.quando || 0) - (a.quando || 0));
    return out;
}

/* Togliere una richiesta.
   Serve per le prove e per i doppioni: chi compila due volte lo stesso
   modulo lascia due righe identiche, e l'elenco e' anche il posto da cui si
   capisce quante richieste vere sono arrivate.

   La parte delicata non e' cancellare la richiesta: e' quello che resta
   ATTACCATO alla scheda dell'azienda. Se la riga dell'elenco dice "ha
   chiesto di essere contattato" e la richiesta non c'e' piu', quel segno
   punta al nulla e non si capisce piu' da dove venga. Quindi si toglie
   anche di li' - ma solo se e' proprio QUELLA richiesta, riconosciuta
   dall'identificativo: se nel frattempo ne e' arrivata un'altra, quella
   resta e la scheda continua a dire il vero.

   Lo stato torna a 'inviata' e non a 'da-invitare': il messaggio era
   partito davvero, e fingere il contrario lo farebbe ripartire. E non si
   tocca chi si e' iscritto, e' stato escluso o disiscritto: quelle sono
   decisioni prese altrove, e una richiesta cancellata non le annulla. */
async function elimina(db, evento, campagna, ids) {
    const camp = CAMPAGNE.normalizza(campagna);
    const chiesti = (Array.isArray(ids) ? ids : []).map(x => testo(x, 200)).filter(Boolean).slice(0, 200);
    if (!chiesti.length) return { tolte: 0, schede: 0 };

    let tolte = 0, schede = 0;
    for (const id of chiesti) {
        const rif = db.collection('richiesteContatto').doc(id);
        let d = null;
        try {
            const snap = await rif.get();
            if (!snap.exists) continue;
            d = snap.data() || {};
        } catch (_) { continue; }
        /* Si cancella solo dentro l'evento e la campagna che si sta
           guardando: l'identificativo arriva dalla rete, e senza questo
           controllo basterebbe indovinarne uno per togliere la richiesta di
           un altro evento. */
        if (String(d.evento || '') !== String(evento || '')) continue;
        if (CAMPAGNE.normalizza(d.campagna) !== camp) continue;

        if (d.scheda) {
            try {
                const sr = db.collection('aziendeInvito').doc(String(d.scheda));
                const ss = await sr.get();
                const sd = ss.exists ? (ss.data() || {}) : null;
                if (sd && sd.contatto && String(sd.contatto.id || '') === id) {
                    const patch = { contatto: null };
                    if (sd.stato === 'risposta') patch.stato = 'inviata';
                    await sr.set(patch, { merge: true });
                    schede++;
                }
            } catch (_) { /* la richiesta si toglie comunque */ }
        }
        try { await rif.delete(); tolte++; }
        catch (e) { console.error('Richiesta contatto non tolta:', String((e && e.message) || e).slice(0, 200)); }
    }
    return { tolte: tolte, schede: schede };
}

module.exports = {
    ricevi, elenco, elimina, destinatari, salvaDestinatari, elencoIndirizzi,
    indirizzoValido, configurato, MAX_DESTINATARI
};
