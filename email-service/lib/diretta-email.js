/* ============================================================
   Diretta degli eventi: l'EMAIL, l'unico identificativo
   ------------------------------------------------------------
   Nella diretta non esiste un nome utente: si entra con l'indirizzo
   email con cui ci si e' iscritti e con la password che generiamo
   noi. Questo file tiene le regole dell'email per tutto il servizio
   (accesso, "password dimenticata", caricamento dalla gestione,
   iscrizioni dal modulo del sito, invio delle email):

   - normalizzaEmail(): LA regola. Via gli spazi prima e dopo, tutto
     minuscolo. Per un indirizzo scritto da una persona e' solo questo
     (la stessa regola della pagina: trim + minuscole). In piu' spariscono
     gli spazi e i caratteri invisibili IN MEZZO (quelli che arrivano da
     Excel: U+200B, il BOM...) e un "mailto:" davanti: un indirizzo con
     uno spazio in mezzo non e' valido comunque, quindi per ogni
     indirizzo valido le due cose coincidono. NON si toccano i punti ne'
     i "+": per molti gestori di posta sono caselle diverse (i punti di
     Gmail compresi), e decidere il contrario vorrebbe dire unire due
     persone. E' la regola con cui sono gia' scritti indirizzi/{email}
     ed emailNorm dei profili: un'email = un account.
   - emailValida(): il controllo, lo stesso ovunque. Niente "/" (e' il
     separatore dei percorsi di Firestore: l'indirizzo normalizzato e'
     anche la chiave del documento indirizzi/{email}).
   - chiaveEmail(): l'impronta (sha256, 32 caratteri esadecimali)
     dell'indirizzo normalizzato. E' l'identificativo dei contatori dei
     tentativi di accesso: niente indirizzi in chiaro negli id.
   - stessaPersona(): due nomi scritti in modo diverso ("Nicolò
     D'Angelo" e "nicolo dangelo", o nome e cognome scambiati) sono la
     stessa persona? Serve a riconoscere un'email CONDIVISA da persone
     diverse (info@azienda.it per due colleghi): un account e' di una
     persona sola, e la seconda resterebbe senza accesso.
   - analizzaImport(): l'anteprima del caricamento della gestione, riga
     per riga (vedi sotto). Non legge niente: riceve le righe e quello
     che esiste gia', e dice che cosa succederebbe. La lettura di
     Firestore sta in lib/diretta-dati.js (anteprima).

   Niente dipendenze: solo crypto di Node.
   ============================================================ */
'use strict';
const crypto = require('crypto');

const LUNGHEZZA_MASSIMA = 254;

function normalizzaEmail(email) {
    return String(email == null ? '' : email)
        .replace(/[\s\u200b-\u200d\u2060\ufeff]+/g, '')
        .replace(/^mailto:/i, '')
        .toLowerCase();
}

function emailValida(email) {
    const e = normalizzaEmail(email);
    if (!e || e.length > LUNGHEZZA_MASSIMA) return false;
    if (e.indexOf('..') >= 0) return false;
    return /^[a-z0-9._%+'=!#$&*?^`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e)
        && e[0] !== '.' && e.split('@')[0].slice(-1) !== '.';
}

// l'impronta dell'indirizzo normalizzato: l'id dei contatori dei tentativi
function chiaveEmail(email) {
    return crypto.createHash('sha256').update('email|' + normalizzaEmail(email)).digest('hex').slice(0, 32);
}

/* "mario.rossi@acme.it" -> "m***@acme.it": basta per riconoscere, non
   per copiare (per le frasi e i log dove l'indirizzo intero non serve). */
function emailMascherata(email) {
    const e = String(email || '');
    const at = e.indexOf('@');
    if (at < 1) return '';
    return e[0] + '***' + e.slice(at);
}

/* ---------- nomi ---------- */

// "Nicolò D'Angelo" -> "nicolodangelo": senza accenti, spazi, apostrofi, punti
function chiaveNome(s) {
    return String(s == null ? '' : s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
/* Stessa persona se nome e cognome coincidono (scritti in qualunque
   modo), anche scambiati di colonna. Un nome del tutto vuoto da una
   delle due parti non si puo' confrontare: vale come la stessa persona
   (l'anteprima lo segnala gia' come nome mancante). */
function stessaPersona(a, b) {
    const na = chiaveNome(a && a.nome), ca = chiaveNome(a && a.cognome);
    const nb = chiaveNome(b && b.nome), cb = chiaveNome(b && b.cognome);
    if (!(na + ca) || !(nb + cb)) return true;
    return (na === nb && ca === cb) || (na === cb && ca === nb) || (na + ca === nb + cb);
}
// nomi e cognomi: niente caratteri di controllo e niente < > (DECISIONI D3)
function nomeSospetto(s) {
    return /[\u0000-\u001f\u007f<>]/.test(String(s || ''));
}
function nomeCompleto(p) {
    return String(((p && p.nome) || '') + ' ' + ((p && p.cognome) || '')).trim().replace(/\s+/g, ' ');
}
function pulito(v, max) {
    return String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, max || 200);
}

/* ============================================================
   L'ANTEPRIMA DEL CARICAMENTO
   ------------------------------------------------------------
   righe: [{ riga?, nome, cognome, email, azienda, escludi? }]
     (riga: il numero della riga nel file; se manca, la posizione + 2:
      la prima riga del file e' l'intestazione)
   esistenti: { perEmail: { [emailNormalizzata]: { uid, nome, cognome,
                eventi: [], stato } } }   (gli account gia' presenti)
   idEvento: l'evento a cui si aggiungono le persone.

   Risultato: { righe: [...], conteggi: {...}, pronto }
   Ogni riga: { riga, nome, cognome, email, emailNorm, azienda, esito,
     problemi: [{ codice, testo, grave }], crea, uidEsistente,
     registrato (nome e cognome dell'account esistente, o null),
     primaRiga (per 'doppia-nel-file': la riga che vale) }

   GLI ESITI (esito: uno per riga):
     'nuovo'             account nuovo (password generata, mai salvata;
                         NESSUNA email: le credenziali partono solo da
                         «Invia le credenziali»)
     'gia-presente'      c'e' gia' un account con questa email: nessun
                         account nuovo e nessuna password nuova, la
                         persona viene aggiunta all'evento
     'gia-iscritto'      l'account c'e' ed e' gia' in questo evento:
                         non cambia niente
     'doppia-nel-file'   la stessa persona (stessa email, stesso nome)
                         e' gia' in una riga precedente del file: la
                         riga non crea niente (non va corretta)
     'escluso'           esclusa a mano dalla gestione
   e le righe DA CORREGGERE (grave: finche' ce n'e' una, pronto e'
   false e «Crea gli account» resta spento):
     'email-mancante'    email vuota
     'email-non-valida'  email scritta male
     'nome-mancante'     nome o cognome vuoto
     'nome-non-valido'   nome o cognome con < > o caratteri invisibili
     'email-condivisa'   la stessa email e' di persone diverse: nel file
                         (nome diverso in un'altra riga: tutte le righe
                         coinvolte) oppure rispetto all'account gia'
                         registrato con quel nome. Un account e' di una
                         persona sola: serve un indirizzo per ciascuno
                         (oppure si esclude la riga).
   Se una riga ha piu' problemi, l'esito e' il primo grave nell'ordine
   qui sopra; in `problemi` ci sono tutti. Avvisi non gravi: 'disattivato'
   (l'account esistente e' disattivato).
   crea: true per le righe da mandare a 'crea' ('nuovo' e 'gia-presente').
   conteggi: { totale, nuovi, giaPresenti, giaIscritti, doppie, esclusi,
               daCorreggere, daCreare }
   pronto: nessuna riga da correggere.
   ============================================================ */
const ESITI = ['nuovo', 'gia-presente', 'gia-iscritto', 'doppia-nel-file', 'escluso',
    'email-mancante', 'email-non-valida', 'nome-mancante', 'nome-non-valido', 'email-condivisa'];
const DA_CORREGGERE = ['email-mancante', 'email-non-valida', 'nome-mancante', 'nome-non-valido', 'email-condivisa'];

function analizzaImport(righe, esistenti, idEvento) {
    const perEmail = (esistenti && esistenti.perEmail) || {};
    const elenco = Array.isArray(righe) ? righe : [];

    // prima passata: i dati puliti e i problemi della riga da sola
    const out = elenco.map((r, i) => {
        const x = r || {};
        const o = {
            riga: Number(x.riga) || (i + 2),
            nome: pulito(x.nome, 80), cognome: pulito(x.cognome, 80),
            email: String(x.email == null ? '' : x.email).trim().slice(0, 400),
            emailNorm: '', azienda: pulito(x.azienda, 120),
            esito: 'nuovo', problemi: [], crea: false, uidEsistente: null, registrato: null, primaRiga: null,
            escluso: x.escludi === true
        };
        o.emailNorm = normalizzaEmail(o.email);
        const problema = (codice, testo, grave) => o.problemi.push({ codice: codice, testo: testo, grave: !!grave });
        if (o.escluso) return o;
        if (!o.emailNorm) problema('email-mancante', 'Email mancante.', true);
        else if (!emailValida(o.emailNorm)) problema('email-non-valida', 'Email non valida: "' + o.email + '".', true);
        if (!o.nome || !o.cognome) problema('nome-mancante', !o.nome && !o.cognome ? 'Nome e cognome vuoti.' : (!o.nome ? 'Nome vuoto.' : 'Cognome vuoto.'), true);
        else if (nomeSospetto(o.nome) || nomeSospetto(o.cognome)) problema('nome-non-valido', 'Il nome o il cognome contiene caratteri non ammessi (< > o caratteri invisibili).', true);
        return o;
    });

    // seconda passata: la stessa email in piu' righe del file
    const gruppi = {};
    out.forEach(o => {
        if (o.escluso || !o.emailNorm || !emailValida(o.emailNorm)) return;
        (gruppi[o.emailNorm] = gruppi[o.emailNorm] || []).push(o);
    });
    Object.keys(gruppi).forEach(e => {
        const g = gruppi[e];
        if (g.length < 2) return;
        const prima = g[0];
        const condivisa = g.some(o => !stessaPersona(o, prima));
        g.forEach((o, k) => {
            const altre = g.filter(x => x !== o);
            if (condivisa) {
                o.problemi.push({
                    codice: 'email-condivisa', grave: true,
                    testo: 'La stessa email è anche ' + (altre.length === 1 ? 'alla riga ' : 'alle righe ') + altre.map(x => x.riga + ' (' + (nomeCompleto(x) || 'senza nome') + ')').join(', ')
                        + ': ogni persona deve avere il suo indirizzo per entrare. Correggi l\'email o escludi la riga in più.'
                });
            } else if (k > 0) {
                o.primaRiga = prima.riga;
                o.problemi.push({ codice: 'doppia-nel-file', grave: false, testo: 'Stessa persona e stessa email della riga ' + prima.riga + ': questa riga non crea niente.' });
            }
        });
    });

    // terza passata: chi c'e' gia'
    out.forEach(o => {
        if (o.escluso || o.primaRiga) return;
        const gia = o.emailNorm && emailValida(o.emailNorm) ? perEmail[o.emailNorm] : null;
        if (!gia) return;
        o.uidEsistente = gia.uid || null;
        o.registrato = { nome: String(gia.nome || ''), cognome: String(gia.cognome || '') };
        if (!stessaPersona(o, gia)) {
            o.problemi.push({
                codice: 'email-condivisa', grave: true,
                testo: 'Con questa email è già registrato ' + (nomeCompleto(gia) || 'un altro account') + ': se è la stessa persona scrivi il nome come è registrato, '
                    + 'altrimenti serve un indirizzo suo (un account è di una persona sola).'
            });
            return;
        }
        const nelEvento = Array.isArray(gia.eventi) && !!idEvento && gia.eventi.indexOf(idEvento) >= 0;
        o.problemi.push(nelEvento
            ? { codice: 'gia-iscritto', grave: false, testo: 'Già iscritta a questo evento: non cambia niente.' }
            : { codice: 'gia-presente', grave: false, testo: 'Account già esistente: nessun nuovo account e nessuna password nuova, la persona viene aggiunta all\'evento.' });
        if (gia.stato === 'disattivato') o.problemi.push({ codice: 'disattivato', grave: false, testo: 'Account disattivato: riattivalo per farla entrare.' });
    });

    // l'esito di ogni riga
    out.forEach(o => {
        if (o.escluso) { o.esito = 'escluso'; return; }
        const grave = DA_CORREGGERE.find(c => o.problemi.some(p => p.grave && p.codice === c));
        if (grave) o.esito = grave;
        else if (o.primaRiga) o.esito = 'doppia-nel-file';
        else if (o.problemi.some(p => p.codice === 'gia-iscritto')) o.esito = 'gia-iscritto';
        else if (o.problemi.some(p => p.codice === 'gia-presente')) o.esito = 'gia-presente';
        else o.esito = 'nuovo';
        o.crea = o.esito === 'nuovo' || o.esito === 'gia-presente';
    });

    const conteggi = { totale: out.length, nuovi: 0, giaPresenti: 0, giaIscritti: 0, doppie: 0, esclusi: 0, daCorreggere: 0, daCreare: 0 };
    out.forEach(o => {
        if (o.esito === 'nuovo') conteggi.nuovi++;
        else if (o.esito === 'gia-presente') conteggi.giaPresenti++;
        else if (o.esito === 'gia-iscritto') conteggi.giaIscritti++;
        else if (o.esito === 'doppia-nel-file') conteggi.doppie++;
        else if (o.esito === 'escluso') conteggi.esclusi++;
        else conteggi.daCorreggere++;
        if (o.crea) conteggi.daCreare++;
        delete o.escluso;
    });
    return { righe: out, conteggi: conteggi, pronto: conteggi.daCorreggere === 0 };
}

module.exports = {
    normalizzaEmail, emailValida, chiaveEmail, emailMascherata,
    chiaveNome, stessaPersona, nomeSospetto, nomeCompleto,
    analizzaImport, ESITI, DA_CORREGGERE, LUNGHEZZA_MASSIMA
};
