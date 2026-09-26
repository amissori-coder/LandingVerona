/* ============================================================
   Diretta degli eventi: le iscrizioni dal MODULO DEL SITO
   ------------------------------------------------------------
   Chi si iscrive "online" dal modulo di un evento (oggi quello di
   Napoli: api/iscrizione-nuova.js, modalita' "online") puo' ricevere
   SUBITO la password della diretta, senza aspettare che il gestore
   carichi il file e prema «Invia le credenziali». Succede solo se il
   gestore ha acceso sull'evento della diretta l'interruttore
   iscrizioniAutomatiche («Invia subito la password a chi si iscrive dal
   modulo del sito», spento di base).

   IL COLLEGAMENTO FRA I DUE. L'evento della diretta ha la sua «Pagina
   dell'evento» (paginaEvento, per esempio /napoli_ottobre_2026/). Il
   modulo del sito manda nel campo `pagina` l'etichetta del foglio
   Google ("Napoli 2 Ottobre 2026 - Manifestazione di interesse"), non
   il percorso: paginaCorrisponde() accetta le due forme.
     - un percorso o un indirizzo (/napoli_ottobre_2026/,
       https://.../napoli_ottobre_2026/#accreditamento; anche nel campo
       facoltativo `percorso`, che il modulo di Napoli manda solo a questo
       servizio, con location.pathname: napoli_ottobre_2026/script.js):
       percorsi uguali, normalizzati (solo il percorso, minuscolo, con
       la barra finale: D.percorsoPagina);
     - l'etichetta: ogni parola della cartella della pagina dell'evento
       (napoli, ottobre, 2026) deve esserci fra le parole dell'etichetta
       (quella prima del " - "), e le parole devono essere almeno due.
   Conta solo un evento con l'interruttore acceso, non terminato e non
   ancora finito; se ne corrispondono due, nessuno (e lo dice il log: la
   gestione non lascia accendere l'interruttore su due eventi con la
   stessa pagina).

   CHE COSA SUCCEDE (iscriviDaModulo):
     - email nuova: si crea l'account (password segreta che nessuno
       conosce, come nell'import), le credenziali vanno 'in coda' e si
       prova a spedirle SUBITO (lib/diretta-invio.js, inviaSubito: e' li'
       che nasce la password, ed e' li' che si imposta e si mette
       nell'email); se non partono (posta bloccata, tetto del giorno)
       restano in coda e le manda il cron di ogni 5 minuti;
     - email che ha gia' un account: si aggiunge l'evento, e parte
       l'avviso «Sei iscritto anche a <evento>: entra con la tua email e
       la password che hai gia'...», SENZA password nuova (lo decide
       tipoInvio in diretta-invio.js: se la persona non aveva ancora
       ricevuto nessuna password, riceve le credenziali). Una volta sola
       per evento: dalla seconda iscrizione l'evento c'e' gia';
     - iscrizione ripetuta (gia' nell'evento): niente di nuovo, ne' una
       seconda password ne' una seconda email. Solo chi era stato
       caricato dal file e aspettava ancora le credenziali ('da
       inviare'), o era rimasto 'in coda', le riceve adesso.
   Il nome e il cognome sono quelli del modulo (ripuliti da < > e
   caratteri invisibili); per un account esistente restano quelli
   registrati.

   IL GANCIO (dalModulo, chiamato da api/iscrizione-nuova.js DOPO aver
   salvato la scheda, dentro un try/catch). Non lancia mai, e non tiene
   ferma la risposta del modulo piu' di ATTESA_MODULO_MS (3 s): se il
   lavoro dura di piu', la risposta parte e il lavoro finisce dopo con
   waitUntil di Vercel (lo stesso aggancio di "password dimenticata";
   fuori da Vercel si aspetta la fine). Se la diretta non e' configurata
   (manca DIRETTA_FIREBASE_SERVICE_ACCOUNT e non si e' nell'emulatore)
   non fa niente: l'iscrizione del sito resta com'e'.

   DUE PROGETTI SEPARATI. Qui si usa SOLO lib/diretta-firebase.js (l'app
   firebase-admin con il nome "diretta" e la sua chiave): niente della
   app predefinita del modulo del sito, che scrive sul progetto dello
   studio. Nei log niente email, niente nomi, niente password: solo
   l'evento e gli esiti.
   ============================================================ */
'use strict';
const C = require('./diretta-comune');
const E = require('./diretta-email');
const D = require('./diretta-dati');
const { contesto, inEmulatore } = require('./diretta-firebase');

const pausa = ms => new Promise(r => setTimeout(r, ms));

// quanto il modulo del sito aspetta al massimo la diretta prima di rispondere
function attesaModulo() { return C.intero('DIRETTA_ATTESA_MODULO_MS', 3000); }

// la diretta c'e'? (la chiave del suo progetto, o l'emulatore delle prove)
function configurata() {
    return inEmulatore() || !!String(process.env.DIRETTA_FIREBASE_SERVICE_ACCOUNT || '').trim();
}

/* ---------- la pagina del modulo e quella dell'evento ---------- */

// "napoli_ottobre_2026" -> ['napoli', 'ottobre', '2026']; accenti via
function parole(s) {
    return String(s == null ? '' : s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .split(/[^a-z0-9]+/).filter(Boolean);
}
/* La pagina del modulo (percorso, indirizzo o etichetta) e' quella
   dell'evento? Vedi IL COLLEGAMENTO FRA I DUE in testa al file. */
function paginaCorrisponde(paginaModulo, paginaEvento) {
    const ev = D.percorsoPagina(paginaEvento);
    if (!ev || ev === '/') return false;
    const pm = String(paginaModulo == null ? '' : paginaModulo).trim();
    if (!pm) return false;
    if (pm[0] === '/' || /^https?:\/\//i.test(pm)) return D.percorsoPagina(pm) === ev;
    const richieste = parole(ev.split('/').filter(Boolean).pop());
    if (richieste.length < 2) return false;
    const etichetta = new Set(parole(pm.split(/\s[-\u2013\u2014]\s/)[0]));
    return richieste.every(p => etichetta.has(p));
}

/* L'evento della diretta di questo modulo: uno solo, con l'interruttore
   acceso, non terminato e non gia' finito. -> { id, dati } oppure null */
async function eventoDelModulo(ctx, pagine) {
    const accesi = await ctx.db.collection('eventiRiservati').where('iscrizioniAutomatiche', '==', true).get();
    if (accesi.empty) return null;
    const snaps = await ctx.db.getAll(...accesi.docs.map(d => ctx.db.collection('eventi').doc(d.id)));
    const ora = ctx.adesso();
    const buoni = snaps.filter(s => {
        if (!s.exists) return false;
        const d = s.data();
        const fine = D.ms(d.fine);
        if (d.stato === 'terminato' || (fine != null && fine < ora)) return false;
        return pagine.some(p => paginaCorrisponde(p, d.paginaEvento));
    });
    if (buoni.length > 1) {
        console.error('[diretta] iscrizione dal modulo: ' + buoni.length + ' eventi con la stessa pagina e l\'invio automatico acceso (' + buoni.map(s => s.id).join(', ') + '): non si iscrive a nessuno');
        return null;
    }
    return buoni.length ? { id: buoni[0].id, dati: buoni[0].data() } : null;
}

// nome, cognome, azienda dal modulo: una riga, niente < > ne' caratteri invisibili
function pulito(v, max) {
    return C.testo(String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' '), max);
}

/* ============================================================
   ISCRIVI DAL MODULO
   iscriviDaModulo(ctx, { email, nome, cognome, azienda, pagina, percorso? })
   -> { esito, idEvento?, invio? }
      esito: 'creato' | 'aggiunto' | 'gia-iscritto'   (con idEvento)
             'nessun-evento'   la pagina non porta a nessun evento con
                               l'interruttore acceso: non si fa niente
             'email-non-valida' | 'incoerente'
      invio: { stato, tipo } l'esito dell'invio subito (vedi
             inviaSubito), oppure null se non c'era niente da mandare
   ============================================================ */
async function iscriviDaModulo(ctx, dati) {
    const d = dati || {};
    const emailNorm = E.normalizzaEmail(String(d.email == null ? '' : d.email).slice(0, 400));
    if (!E.emailValida(emailNorm)) return { esito: 'email-non-valida' };
    const pagine = [d.percorso, d.pagina].map(x => String(x == null ? '' : x).slice(0, 300)).filter(Boolean);
    if (!pagine.length) return { esito: 'nessun-evento' };
    const evento = await eventoDelModulo(ctx, pagine);
    if (!evento) return { esito: 'nessun-evento' };
    const nome = pulito(d.nome, 80);
    const cognome = pulito(d.cognome, 80);

    /* La prenotazione, come nell'import (una transazione su
       indirizzi/{email}: zero account doppi anche con due invii del
       modulo nello stesso istante), con le credenziali gia' 'in coda'.
       Per chi e' gia' nell'evento la voce passa in coda solo se aspettava
       ancora le credenziali ('da inviare'): nessuna seconda password. */
    const fatto = await D.prenotaPersona(ctx, evento.id, {
        nome: nome, cognome: cognome, azienda: pulito(d.azienda, 120), emailNorm: emailNorm, origine: 'modulo'
    }, {
        voce: { stato: 'in coda', origine: 'modulo' },
        voceSeGia: v => (!v || v.stato === 'da inviare') ? { stato: 'in coda', origine: 'modulo' } : null
    });
    if (fatto.tipo === 'incoerente') {
        console.error('[diretta] iscrizione dal modulo: dati incoerenti per un indirizzo (' + evento.id + ')');
        return { esito: 'incoerente', idEvento: evento.id };
    }
    await D.completaDopoPrenotazione(ctx, fatto, nome, cognome);

    const inCoda = fatto.tipo === 'creato' || fatto.tipo === 'aggiunto' || !!(fatto.voce && fatto.voce.stato === 'in coda');
    if (!inCoda) return { esito: fatto.tipo, idEvento: evento.id, invio: null };
    // la rete di sicurezza: con la coda accesa, il cron manda chi non parte adesso
    await ctx.db.collection('code').doc(evento.id).set({ attiva: true, aggiornato: ctx.adesso() }, { merge: true });
    const invio = require('./diretta-invio');
    let r;
    try {
        r = await invio.inviaSubito(ctx, { uid: fatto.uid, idEvento: evento.id });
    } catch (e) {
        // resta 'in coda' (o 'invio', che il cron fara' diventare 'incerto'): mai un secondo invio da qui
        console.error('[diretta] iscrizione dal modulo: invio subito non riuscito (resta al cron): ' + D.perLog(e));
        r = { stato: 'in coda' };
    }
    return { esito: fatto.tipo, idEvento: evento.id, invio: { stato: r.stato, tipo: r.tipo || '' } };
}

/* ============================================================
   IL GANCIO PER api/iscrizione-nuova.js
   dalModulo({ email, nome, cognome, azienda, pagina, percorso? })
   -> sempre una promessa che si risolve (mai un errore):
      { esito } come iscriviDaModulo, oppure 'non-configurata',
      'in-corso' (la risposta del modulo parte, il lavoro continua con
      waitUntil) o 'errore' (il motivo nel log).
   ============================================================ */
let avvisoNonConfigurata = false;
async function dalModulo(dati, opz) {
    if (!configurata()) {
        if (!avvisoNonConfigurata) {
            avvisoNonConfigurata = true;
            console.log('[diretta] iscrizione dal modulo: la diretta non e\' configurata (manca DIRETTA_FIREBASE_SERVICE_ACCOUNT): nessun account');
        }
        return { esito: 'non-configurata' };
    }
    const attesaMs = opz && Number.isFinite(opz.attesaMs) ? opz.attesaMs : attesaModulo();
    let risultato = { esito: 'in-corso' };
    const t0 = Date.now();
    const lavoro = Promise.resolve().then(async () => {
        const ctx = (opz && opz.ctx) || contesto();
        const r = await iscriviDaModulo(ctx, dati);
        risultato = r;
        if (r.esito !== 'nessun-evento') {
            // solo l'evento e gli esiti: niente email, niente nomi
            console.log('[diretta] iscrizione dal modulo: ' + JSON.stringify({
                idEvento: r.idEvento || '', esito: r.esito, invio: r.invio ? r.invio.stato : '', tipo: r.invio ? r.invio.tipo : '', ms: Date.now() - t0
            }));
        }
        return r;
    }).catch(e => {
        console.error('[diretta] iscrizione dal modulo non riuscita: ' + D.perLog(e));
        risultato = { esito: 'errore' };
        return risultato;
    });
    const finito = await Promise.race([lavoro.then(() => true), pausa(attesaMs).then(() => false)]);
    if (!finito) {
        const A = require('./diretta-accesso');
        if (!A.lasciaFinire(lavoro)) await lavoro;
    }
    return risultato;
}

module.exports = { iscriviDaModulo, dalModulo, paginaCorrisponde, eventoDelModulo, configurata, parole };
