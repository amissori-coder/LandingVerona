/* ============================================================
   Diretta degli eventi: l'accesso delle persone e dei gestori
   ------------------------------------------------------------
   La logica di api/diretta-accesso.js, l'unica porta PUBBLICA della
   diretta insieme a diretta-stato:

   - ENTRA: email + password -> token personalizzato di Firebase.
     La persona scrive l'email con cui si e' iscritta (maiuscole e spazi
     prima e dopo non contano: lib/diretta-email.js, normalizzaEmail) e la
     password che le abbiamo mandato. Dietro, l'email porta all'uid
     (indirizzi/{email}) e l'uid all'email TECNICA dell'account Auth, che
     nessuno vede e che dall'email NON si ricava (DECISIONI D1). La
     password la verifica Google (Identity Toolkit, chiamata dal server):
     noi non la vediamo passare in nessun archivio e non la scriviamo mai.
     Il vecchio campo `nomeUtente` non si accetta piu'.

   - IL BLOCCO DEI TENTATIVI (DECISIONI D4). Ogni tentativo si PRENOTA
     prima di chiedere a Google, in una transazione su due documenti.
     La "chiave" e' l'impronta dell'email normalizzata (sha256, vedi
     chiaveEmail): negli id dei documenti non c'e' mai un indirizzo.
       tentativi/{chiave}_{impronta dell'IP}: la coppia email + rete. Dopo
         5 errori di fila si aspetta 30 s, poi 60, 120... fino a 15 minuti.
         E' la regola "5 password sbagliate di fila, attesa crescente", e
         riguarda solo chi sbaglia da quella rete: un disturbatore che
         prova l'email di un altro da casa sua non blocca il vero titolare.
       tentativiNome/{chiave}: il tetto contro chi prova da tante reti
         diverse: 50 errori in un'ora bloccano l'email per 15 minuti
         (il nome della raccolta e' rimasto quello di prima).
     La prenotazione conta il tentativo come fallito PRIMA della verifica:
     cosi' venti richieste sbagliate che arrivano nello stesso istante
     non passano tutte (ne passano cinque, le altre aspettano). Se poi la
     password e' giusta, la coppia si cancella e il tentativo si restituisce.

   - LA RETE: al massimo 40 password sbagliate ogni 15 minuti dalla
     stessa rete (poi almeno 5 minuti di attesa per tutta la rete). E'
     il limite contro chi prova tante email diverse da un posto solo.
     Anche qui il tentativo si conta PRIMA della verifica (vedi
     prenotaRete): un contatore per finestra fissa di 15 minuti,
     tentativiIp/{impronta}_{finestra}, con un incremento seguito da
     una rilettura, senza transazione. Cento richieste sbagliate che
     arrivano insieme non passano tutte: la rilettura di ciascuna
     comprende il proprio incremento e quelli arrivati prima, e solo 40
     possono vedere un numero entro il tetto. Un accesso riuscito (o
     finito per un motivo che non e' una password sbagliata) restituisce
     subito il suo tentativo: cento colleghi dietro lo stesso IP
     aziendale non consumano il tetto e non si bloccano a vicenda.

   - EMAIL INESISTENTI: stessa risposta di una password sbagliata
     (DECISIONI T1), senza chiedere niente a Google, e lo stesso tempo:
     la risposta "Email o password non corretti." non parte mai prima di
     900-1200 ms dall'inizio (TEMPO_FALLITO_MS + CASO_FALLITO_MS), che la
     password l'abbia verificata Google o che l'email non esista.
     Dall'esterno non si capisce chi e' iscritto (i numeri: vedi
     TEMPO_FALLITO_MS).
   - «PASSWORD DIMENTICATA?» LASCIA UN SEGNO: quando il collegamento
     parte (o forse e' partito), sul profilo resta resetInviato (quando).
     Da li' in poi la persona puo' avere una password scelta da lei, e
     lib/diretta-invio.js non le manda piu' credenziali nuove da solo
     (riceve «Sei iscritto anche a...»): vedi haPassword.

   - PASSWORD DIMENTICATA e ACCESSO DEI GESTORI (DECISIONI D2, D9): la
     risposta e' SEMPRE la stessa e arriva sempre dopo lo stesso tempo
     (2,5-2,9 secondi), qualunque cosa succeda dietro: dall'esterno non
     si capisce se un'email e' iscritta. L'email con il collegamento
     parte solo a chi e' iscritto; a chi non lo e' non parte niente.

   - AGGIORNA-PERMESSI (DECISIONI T8): se i claims del token di una
     persona non corrispondono ai suoi eventi, li rimette in ordine.

   - LINK-VIDEO: se la web TV usa i link firmati a tempo, la pagina di
     chi guarda chiede qui il link firmato (principale o riserva). Solo
     a chi e' iscritto all'evento, con l'account attivo, mentre si e' in
     onda; al massimo 60 richieste l'ora per persona.

   Nei log non finiscono mai password, token, indirizzi email (ne' le
   loro impronte).
   ============================================================ */
'use strict';
const crypto = require('crypto');
const C = require('./diretta-comune');
const E = require('./diretta-email');
const D = require('./diretta-dati');
const { passwordSegreta } = require('./diretta-password');
const { conLimite } = require('./diretta-auth');

const MINUTO = 60 * 1000;
const ORA = 60 * MINUTO;
const GIORNO = 24 * ORA;
const ERRORI_DI_FILA = 5;                 // poi si aspetta
const ATTESA_BASE_MS = 30 * 1000;         // 30 s, 60 s, 120 s...
const ATTESA_MASSIMA_MS = 15 * MINUTO;
const TETTO_NOME = 50;                    // errori in un'ora sulla stessa email, da qualunque rete
const BLOCCO_NOME_MS = 15 * MINUTO;
const TETTO_IP = 40;                      // errori in una finestra di 15 minuti dalla stessa rete
const FINESTRA_IP_MS = 15 * MINUTO;       // finestre fisse: :00, :15, :30, :45
const BLOCCO_IP_MS = 5 * MINUTO;          // raggiunto il tetto, la rete aspetta almeno tanto
const ATTESA_RETE_MS = 3000;              // quanto si aspetta il proprio turno se tanti entrano insieme
const ATTESA_GOOGLE_MS = 8000;
/* "Email o password non corretti" non parte prima di TEMPO_FALLITO_MS,
   piu' fino a CASO_FALLITO_MS a caso (vedi EMAIL INESISTENTI). Il
   pavimento deve stare SOPRA il tempo del ramo piu' lento, quello di
   un'email iscritta con la password sbagliata: in produzione sono la
   lettura di indirizzi/{email} e del blocco della rete (Firestore, 20-80
   ms), la transazione dei tentativi (50-200 ms, di piu' se riparte), la
   verifica di Google (signInWithPassword da Vercel: 150-400 ms di
   solito, a volte 600 e oltre) e il conteggio della rete. In tutto
   300-700 ms, con code fino a 800-900: con 450 ms le email iscritte
   avrebbero risposto spesso DOPO il pavimento e quelle inesistenti
   sempre SUL pavimento, distinguibili a occhio. Con 900 ms quasi tutte
   le risposte (iscritte o no) partono sul pavimento, e i 0-300 ms a
   caso coprono lo scarto che resta. Costa mezzo secondo in piu' solo a
   chi sbaglia; chi entra non aspetta niente. Le prove
   (email-service/prove/diretta-accesso-tempi.prove.js e
   diretta/prove/accesso.prova.js) leggono questi due numeri da qui. */
const TEMPO_FALLITO_MS = 900;
const CASO_FALLITO_MS = 300;
// i tetti di "password dimenticata" e "primo accesso" dei gestori (DECISIONI D9)
const TETTO_RESET_RETE = 20;              // richieste all'ora dalla stessa rete
const TETTO_RESET_ORA = 200;              // email di reimpostazione all'ora, in tutto
const TETTO_GESTORE_RETE = 10;            // richieste all'ora dalla stessa rete
const TETTO_GESTORI_ORA = 20;             // email ai gestori all'ora, in tutto (un tetto loro)
const TETTO_LINK_VIDEO = 60;              // link firmati del video all'ora, per persona

const MSG_CREDENZIALI = 'Email o password non corretti.';
const MSG_DISATTIVATO = 'Il tuo accesso è stato disattivato. Scrivi all\'assistenza.';
const MSG_DIMENTICATA = 'Se l\'indirizzo è iscritto alla diretta, tra poco ricevi un\'email con il collegamento per scegliere una nuova password. '
    + 'Controlla anche nella cartella Spam o Promozioni.';
const MSG_GESTORE = 'Se l\'indirizzo è tra i gestori, ti abbiamo scritto.';

const pausa = ms => new Promise(r => setTimeout(r, ms));

// attesa dopo `falliti` errori di fila (dal quinto): 30 s * 2^(falliti-5), al massimo 15 minuti
function attesaDopo(falliti) {
    if (falliti < ERRORI_DI_FILA) return 0;
    return Math.min(ATTESA_BASE_MS * Math.pow(2, falliti - ERRORI_DI_FILA), ATTESA_MASSIMA_MS);
}

function msgAttesa(secondi) {
    const quanto = secondi >= 90 ? Math.ceil(secondi / 60) + ' minuti' : secondi + ' secondi';
    return 'Troppi tentativi non riusciti: riprova tra ' + quanto + '. Se non ricordi la password, usa «Password dimenticata?».';
}
function attendi(ms) {
    const secondi = Math.max(1, Math.ceil(ms / 1000));
    return D.errorePubblico(429, 'attendi', msgAttesa(secondi), { attesaSecondi: secondi });
}

// il contenuto (non verificato) di un token: solo per leggerne i claims gia' verificati da Google
function contenutoToken(token) {
    try { return JSON.parse(Buffer.from(String(token || '').split('.')[1] || '', 'base64url').toString('utf8')) || {}; } catch (_) { return {}; }
}

/* "iPhone · Safari", "Windows · Edge": quanto basta all'elenco degli
   accessi, senza conservare lo user agent intero. */
function descriviDispositivo(ua) {
    const s = String(ua || '');
    let sistema = 'Altro';
    if (/iPhone|iPod/.test(s)) sistema = 'iPhone';
    else if (/iPad/.test(s) || (/Macintosh/.test(s) && /Mobile\//.test(s))) sistema = 'iPad';
    else if (/Android/.test(s)) sistema = /Mobile/.test(s) ? 'Android' : 'Tablet Android';
    else if (/Windows/.test(s)) sistema = 'Windows';
    else if (/CrOS/.test(s)) sistema = 'Chromebook';
    else if (/Macintosh|Mac OS X/.test(s)) sistema = 'Mac';
    else if (/Linux/.test(s)) sistema = 'Linux';
    let browser = 'altro browser';
    if (/Edg(A|iOS)?\//.test(s)) browser = 'Edge';
    else if (/OPR\/|Opera/.test(s)) browser = 'Opera';
    else if (/SamsungBrowser/.test(s)) browser = 'Samsung Internet';
    else if (/Firefox\/|FxiOS/.test(s)) browser = 'Firefox';
    else if (/Chrome\/|CriOS/.test(s)) browser = 'Chrome';
    else if (/Safari\//.test(s)) browser = 'Safari';
    return sistema + ' · ' + browser;
}

/* ============================================================
   IL BLOCCO DEI TENTATIVI
   ============================================================ */

// chiave: l'impronta dell'email normalizzata (E.chiaveEmail), mai l'indirizzo
function rifTentativi(ctx, chiave, impIp) {
    return {
        coppia: ctx.db.collection('tentativi').doc(chiave + '_' + impIp),
        nome: ctx.db.collection('tentativiNome').doc(chiave),
        // il blocco della rete: puo' durare oltre la fine della finestra
        bloccoIp: ctx.db.collection('tentativiIp').doc(impIp)
    };
}

/* Prenota il tentativo: se la coppia o l'email sono bloccate risponde
   con l'attesa, altrimenti conta il tentativo come fallito (lo si
   restituisce se va bene) e, al quinto errore di fila, fissa gia'
   l'attesa: le richieste che arrivano nel frattempo non passano. */
async function prenota(ctx, rif) {
    return ctx.db.runTransaction(async tx => {
        const [c, n] = await tx.getAll(rif.coppia, rif.nome);
        const ora = ctx.adesso();
        const dc = c.exists ? c.data() : {};
        const dn = n.exists ? n.data() : {};
        const fino = Math.max(Number(dc.bloccatoFino) || 0, Number(dn.bloccatoFino) || 0);
        if (fino > ora) return { bloccatoPerMs: fino - ora };

        // la coppia: dopo un giorno senza errori si riparte da zero
        const recente = ora - (Number(dc.aggiornato) || 0) < GIORNO;
        const falliti = (recente ? Math.max(0, Number(dc.falliti) || 0) : 0) + 1;
        const bloccoCoppia = falliti >= ERRORI_DI_FILA ? ora + attesaDopo(falliti) : 0;
        tx.set(rif.coppia, { falliti: falliti, bloccatoFino: bloccoCoppia, aggiornato: ora });

        // l'email, da tutte le reti insieme: finestra di un'ora
        const inFinestra = ora - (Number(dn.inizioFinestra) || 0) < ORA;
        const fallitiNome = (inFinestra ? Math.max(0, Number(dn.falliti) || 0) : 0) + 1;
        const bloccoNome = fallitiNome >= TETTO_NOME ? ora + BLOCCO_NOME_MS : 0;
        tx.set(rif.nome, { falliti: fallitiNome, inizioFinestra: inFinestra ? dn.inizioFinestra : ora, bloccatoFino: bloccoNome, aggiornato: ora });

        return { bloccatoPerMs: 0, falliti: falliti, bloccatoFino: Math.max(bloccoCoppia, bloccoNome) };
    });
}

/* Il tentativo non era "colpa" della password (Google lento, Google che
   limita il servizio, account disattivato con la password giusta): lo si
   restituisce, e l'attesa fissata in prenotazione cade se non serve piu'. */
async function restituisci(ctx, rif) {
    try {
        await ctx.db.runTransaction(async tx => {
            const [c, n] = await tx.getAll(rif.coppia, rif.nome);
            if (c.exists) {
                const falliti = Math.max(0, (Number(c.data().falliti) || 0) - 1);
                tx.set(rif.coppia, { falliti: falliti, bloccatoFino: falliti >= ERRORI_DI_FILA ? c.data().bloccatoFino : 0 }, { merge: true });
            }
            if (n.exists) {
                const fallitiNome = Math.max(0, (Number(n.data().falliti) || 0) - 1);
                tx.set(rif.nome, { falliti: fallitiNome, bloccatoFino: fallitiNome >= TETTO_NOME ? n.data().bloccatoFino : 0 }, { merge: true });
            }
        });
    } catch (e) {
        console.error('[diretta] restituzione del tentativo: ' + D.perLog(e));
    }
}

/* ---------- la rete ----------
   tentativiIp/{impronta}_{finestra} (finestre fisse di 15 minuti) ha due
   contatori:
     inCorso: le verifiche prenotate e non ancora finite;
     falliti: le verifiche finite con una password sbagliata (o un'email
              che non e' iscritta).
   Ogni tentativo fa +1 su inCorso e POI rilegge il documento: passa se
   falliti + inCorso (il proprio compreso) non supera il tetto. Alla fine
   il tentativo si chiude: -1 su inCorso e, se era sbagliato, +1 su
   falliti, nella stessa scrittura. Per questo nessuna raffica passa il
   tetto: chi rilegge vede, oltre a se', tutti i tentativi gia' passati,
   finiti o ancora in volo, e ne passano al massimo 40 che finiscono
   male. Niente transazioni (la rete di un'azienda che entra tutta alle
   9 non deve mettersi in fila dietro le ripartenze di Firestore) e mai
   una scrittura che azzera: solo incrementi, con merge.
   Oltre il tetto ci sono due casi diversi:
   - i falliti sono gia' 40: la rete ha finito i suoi errori. Si scrive
     il blocco in tentativiIp/{impronta} (almeno 5 minuti, e comunque
     fino alla fine della finestra) e si risponde "attendi";
   - i falliti sono meno, ma ci sono tante verifiche in volo insieme
     (un ufficio che entra tutto nello stesso secondo): non e' un
     abuso, e le verifiche in volo di solito vanno bene e liberano il
     posto. Si restituisce il tentativo, si aspetta un attimo (a caso,
     per non ripartire tutti insieme) e si riprova, per al massimo 3
     secondi; poi "riprova tra qualche secondo", senza bloccare niente.
   Un tentativo prenotato e mai chiuso (la funzione fermata da Vercel a
   meta') resta contato solo fino alla fine della sua finestra. */
function rifFinestraIp(ctx, impIp, ora) {
    const finestra = Math.floor(ora / FINESTRA_IP_MS);
    return {
        rif: ctx.db.collection('tentativiIp').doc(impIp + '_' + finestra),
        fine: (finestra + 1) * FINESTRA_IP_MS
    };
}
// il campo per un'eventuale regola TTL di Firestore (i contatori vecchi si cancellano da soli)
function scadenza(ctx, fineFinestra) {
    return ctx.Timestamp.fromMillis(fineFinestra + GIORNO);
}
function incrementoRete(ctx, finestra) {
    return finestra.rif.set({ inCorso: ctx.FieldValue.increment(1), scade: scadenza(ctx, finestra.fine) }, { merge: true });
}
async function restituisciRete(ctx, finestra) {
    try { await finestra.rif.set({ inCorso: ctx.FieldValue.increment(-1) }, { merge: true }); }
    catch (e) { console.error('[diretta] conteggio della rete: ' + D.perLog(e)); }
}
// quanto manca alla fine del blocco della rete (0 = libera)
function bloccoIp(snap, ora) {
    const fino = snap && snap.exists ? Number(snap.get('bloccatoFino')) || 0 : 0;
    return fino > ora ? fino - ora : 0;
}

/* Il turno della rete per un tentativo il cui +1 e' GIA' scritto nella
   `finestra` (e' partito insieme alle letture iniziali: un'andata e
   ritorno in meno). -> la prenotazione, da chiudere con chiudiRete.
   Se non tocca a lui lancia "attendi" o "riprova", dopo aver gia'
   restituito il tentativo. */
async function prenotaRete(ctx, rif, impIp, finestra) {
    const limite = Date.now() + ATTESA_RETE_MS;
    let f = finestra;
    for (let giro = 1; ; giro++) {
        const snap = await f.rif.get();
        const falliti = Math.max(0, Number(snap.get('falliti')) || 0);
        const inCorso = Math.max(0, Number(snap.get('inCorso')) || 0);
        if (falliti + inCorso <= TETTO_IP) return { finestra: f, chiusura: null };
        await restituisciRete(ctx, f);
        const ora = ctx.adesso();
        if (falliti >= TETTO_IP) {
            const fino = Math.max(ora + BLOCCO_IP_MS, f.fine);
            try { await rif.bloccoIp.set({ bloccatoFino: fino, aggiornato: ora, scade: scadenza(ctx, fino) }, { merge: true }); }
            catch (e) { console.error('[diretta] blocco della rete non scritto: ' + D.perLog(e)); }
            console.error('[diretta] accesso: una rete ha raggiunto il tetto di ' + TETTO_IP + ' errori, attesa di ' + Math.ceil((fino - ora) / MINUTO) + ' minuti');
            throw attendi(fino - ora);
        }
        if (Date.now() >= limite) {
            console.error('[diretta] accesso: troppe verifiche insieme dalla stessa rete (' + inCorso + ' in corso)');
            throw D.errorePubblico(503, 'riprova', 'Il servizio è molto richiesto in questo momento: riprova tra qualche secondo.');
        }
        await pausa(100 + crypto.randomInt(150 * Math.min(giro, 4)));
        f = rifFinestraIp(ctx, impIp, ctx.adesso());
        await incrementoRete(ctx, f);
    }
}
/* Il tentativo e' finito: si restituisce il posto e, se la password era
   sbagliata, lo si conta fra i falliti, nella stessa scrittura. Una
   volta sola: una seconda chiamata aspetta la prima. */
function chiudiRete(ctx, rete, fallito) {
    if (!rete) return Promise.resolve();
    if (!rete.chiusura) {
        const agg = { inCorso: ctx.FieldValue.increment(-1) };
        if (fallito) agg.falliti = ctx.FieldValue.increment(1);
        rete.chiusura = rete.finestra.rif.set(agg, { merge: true })
            .catch(e => console.error('[diretta] conteggio della rete: ' + D.perLog(e)));
    }
    return rete.chiusura;
}

/* ============================================================
   LA VERIFICA DELLA PASSWORD (Identity Toolkit, dal server)
   ============================================================ */

const FALLIMENTI = new Set(['INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND', 'USER_DISABLED']);

/* Google limita a volte le verifiche che arrivano da uno stesso IP (e
   il servizio su Vercel, per Google, e' un solo IP): se succede con
   tante email diverse nello stesso minuto non e' una persona che
   sbaglia, e il log lo deve dire chiaro (solo il numero: niente email). */
let troppiRecenti = [];
function segnalaTroppi(chiave) {
    const ora = Date.now();
    troppiRecenti = troppiRecenti.filter(x => ora - x.t < MINUTO);
    troppiRecenti.push({ t: ora, n: chiave });
    const diverse = new Set(troppiRecenti.map(x => x.n)).size;
    console.error('[diretta] Google risponde TOO_MANY_ATTEMPTS_TRY_LATER' + (diverse > 20
        ? ': ' + diverse + ' email diverse in un minuto, possibile blocco di Google sugli IP del servizio'
        : ''));
}

function indirizzoVerifica(ctx) {
    const emu = ctx.emulatore && process.env.FIREBASE_AUTH_EMULATOR_HOST;
    if (emu) return 'http://' + emu + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=finta';
    const chiave = String(process.env.DIRETTA_FIREBASE_API_KEY || '').trim();
    if (!chiave) throw C.errore(500, 'DIRETTA_FIREBASE_API_KEY mancante', 'configurazione');
    return 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(chiave);
}

// -> { esito: 'ok', localId, idToken } | { esito: 'fallita' } | { esito: 'troppi' } | { esito: 'lento' }
async function verificaPassword(ctx, uid, password, chiave) {
    const url = indirizzoVerifica(ctx);
    let r;
    try {
        r = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', referer: C.baseSito() + '/' },
            body: JSON.stringify({ email: C.emailTecnica(uid), password: password, returnSecureToken: true }),
            signal: AbortSignal.timeout(ATTESA_GOOGLE_MS)
        });
    } catch (e) {
        console.error('[diretta] verifica delle credenziali non riuscita: ' + ((e && e.name) || 'errore di rete'));
        return { esito: 'lento' };
    }
    let j = {};
    try { j = await r.json(); } catch (_) { /* risposta non JSON */ }
    if (r.ok && j.localId) return { esito: 'ok', localId: j.localId, idToken: j.idToken || '' };
    // i messaggi di Google hanno a volte un seguito ("TOO_MANY_ATTEMPTS_TRY_LATER : ...")
    const codice = String((j.error && j.error.message) || '').split(/[\s:]/)[0];
    if (FALLIMENTI.has(codice)) return { esito: 'fallita' };
    if (codice === 'TOO_MANY_ATTEMPTS_TRY_LATER') { segnalaTroppi(chiave); return { esito: 'troppi' }; }
    console.error('[diretta] verifica delle credenziali: risposta inattesa ' + r.status + ' ' + codice.slice(0, 60));
    return { esito: 'lento' };
}

/* ============================================================
   ENTRA
   ============================================================ */

/* La risposta di una verifica non riuscita (401 "Email o password non
   corretti.", o il 429 fissato proprio da quell'errore) non parte prima
   di TEMPO_FALLITO_MS + fino a CASO_FALLITO_MS a caso dall'inizio della
   richiesta: un'email che non e' iscritta (nessuna domanda a Google) e
   una password sbagliata (una verifica vera) rispondono dopo lo stesso
   tempo. */
async function tempoMinimo(inizio) {
    const resto = inizio + TEMPO_FALLITO_MS + crypto.randomInt(CASO_FALLITO_MS) - Date.now();
    if (resto > 0) await pausa(resto);
}

async function entra(ctx, ingresso) {
    const t0 = Date.now();
    const email = E.normalizzaEmail(String(ingresso.email == null ? '' : ingresso.email).slice(0, 400));
    const password = typeof ingresso.password === 'string' ? ingresso.password : '';
    if (!email || !password) throw D.errorePubblico(400, 'credenziali', 'Scrivi l\'email e la password.');
    if (password.length > 200) throw D.errorePubblico(401, 'credenziali', MSG_CREDENZIALI, { rimasti: ERRORI_DI_FILA });
    const inizio = ctx.adesso();
    const impIp = C.improntaIp(ingresso.ip);
    const chiave = E.chiaveEmail(email);
    const rif = rifTentativi(ctx, chiave, impIp);

    /* Il blocco della rete e l'indirizzo si leggono insieme, e intanto
       parte il +1 della rete (vedi prenotaRete): nessuna transazione. Un
       indirizzo non valido non si cerca nemmeno (non puo' essere iscritto,
       e con una "/" non sarebbe nemmeno un id di Firestore): vale come
       un'email che non esiste. */
    const finestra = rifFinestraIp(ctx, impIp, inizio);
    let incrementato = false;
    const incremento = incrementoRete(ctx, finestra).then(() => { incrementato = true; });
    let snapBlocco, snapInd;
    try {
        [snapBlocco, snapInd] = await Promise.all([
            rif.bloccoIp.get(),
            E.emailValida(email) ? ctx.db.collection('indirizzi').doc(email).get() : Promise.resolve(null),
            incremento
        ]);
    } catch (e) {
        await incremento.catch(() => {});
        if (incrementato) await restituisciRete(ctx, finestra);
        throw e;
    }
    const attesaRete = bloccoIp(snapBlocco, inizio);
    if (attesaRete) {
        await restituisciRete(ctx, finestra);
        throw attendi(attesaRete);
    }
    const rete = await prenotaRete(ctx, rif, impIp, finestra);

    /* Da qui il tentativo della rete e' prenotato e si chiude SEMPRE:
       come fallito appena si sa che la password era sbagliata, altrimenti
       restituito (qui nel finally, se non e' gia' stato fatto). */
    try {
        return await verificaEdEntra(ctx, ingresso, { t0, email, chiave, password, rif, rete, snapInd });
    } finally {
        await chiudiRete(ctx, rete, false);
    }
}

/* Il resto di "entra", con il tentativo della rete gia' prenotato. */
async function verificaEdEntra(ctx, ingresso, { t0, email, chiave, password, rif, rete, snapInd }) {
    const db = ctx.db;
    const pren = await prenota(ctx, rif);
    if (pren.bloccatoPerMs) throw attendi(pren.bloccatoPerMs);

    const uid = snapInd && snapInd.exists ? String(snapInd.data().uid || '') : '';
    // email non iscritta: niente Google (il tempo lo pareggia tempoMinimo)
    const verifica = uid ? await verificaPassword(ctx, uid, password, chiave) : { esito: 'fallita' };

    if (verifica.esito === 'fallita') {
        await chiudiRete(ctx, rete, true);
        await tempoMinimo(t0);
        const ora = ctx.adesso();
        if (pren.bloccatoFino > ora) throw attendi(pren.bloccatoFino - ora);
        throw D.errorePubblico(401, 'credenziali', MSG_CREDENZIALI, { rimasti: Math.max(0, ERRORI_DI_FILA - pren.falliti) });
    }
    // qualunque altro esito non e' una password sbagliata: la rete riavra' subito il suo tentativo
    chiudiRete(ctx, rete, false);
    if (verifica.esito === 'troppi') {
        await restituisci(ctx, rif);
        throw attendi(60 * 1000);
    }
    if (verifica.esito === 'lento') {
        await restituisci(ctx, rif);
        throw D.errorePubblico(503, 'riprova', 'Il servizio è lento: riprova tra qualche secondo.');
    }
    if (verifica.localId !== uid) {
        await restituisci(ctx, rif);
        throw C.errore(500, 'La verifica ha restituito un account diverso da quello atteso');
    }

    // password giusta: il profilo e lo stato dell'account
    const rifP = db.collection('partecipanti').doc(uid);
    const rifS = db.collection('sessioni').doc(uid);
    const [snapP, snapS] = await db.getAll(rifP, rifS);
    const p = snapP.exists ? snapP.data() : null;
    const s = snapS.exists ? snapS.data() : null;
    if (!p || p.stato !== 'attivo' || (s && s.stato !== 'attivo')) {
        await chiudiTentativi(ctx, rif);
        throw D.errorePubblico(403, 'disattivato', MSG_DISATTIVATO);
    }
    const scelta = await D.scegliEvento(ctx, p.eventi, ingresso.idEvento);
    if (!scelta) {
        await chiudiTentativi(ctx, rif);
        throw D.errorePubblico(403, 'nessun-evento', 'Non risulti iscritto a nessuna diretta. Scrivi all\'assistenza.');
    }

    /* Un solo dispositivo (se l'evento lo chiede): la sessione nuova
       diventa quella ammessa, e le regole rifiutano i segnali di presenza
       di quella vecchia (la pagina sul primo dispositivo se ne accorge). */
    const sessione = crypto.randomBytes(12).toString('hex');
    const ts = ctx.Timestamp.fromMillis(ctx.adesso());
    const indirizzo = p.emailNorm || E.normalizzaEmail(p.email) || email;
    const batch = db.batch();
    batch.update(rifP, { ultimoAccesso: ts });
    batch.set(rifS, Object.assign(s ? {} : { stato: 'attivo' }, {
        sessioneAttiva: scelta.dati.unSoloDispositivo === true ? sessione : null, aggiornato: ts
    }), { merge: true });
    batch.set(db.collection('accessi').doc(), {
        uid: uid, email: indirizzo, nome: p.nome || '', cognome: p.cognome || '', azienda: p.azienda || '',
        idEvento: scelta.id, quando: ts, dispositivo: descriviDispositivo(ingresso.userAgent)
    });
    // il tentativo era buono: via la coppia, e all'email si restituisce il tentativo
    batch.delete(rif.coppia);
    batch.set(rif.nome, { falliti: ctx.FieldValue.increment(-1) }, { merge: true });
    await batch.commit();

    // i claims del token devono dire gli eventi della persona (le regole li leggono da li')
    const eventi = Array.isArray(p.eventi) ? p.eventi : [];
    if (!D.stessaLista(contenutoToken(verifica.idToken).eventi, eventi)) {
        await conLimite(() => ctx.auth.setCustomUserClaims(uid, { eventi: eventi }));
    }
    const token = await ctx.auth.createCustomToken(uid);
    return {
        token: token, sessione: sessione, idEvento: scelta.id,
        nome: p.nome || '', cognome: p.cognome || '', email: indirizzo
    };
}

// la password era giusta ma l'accesso non si apre: la coppia si azzera comunque
async function chiudiTentativi(ctx, rif) {
    try {
        const batch = ctx.db.batch();
        batch.delete(rif.coppia);
        batch.set(rif.nome, { falliti: ctx.FieldValue.increment(-1) }, { merge: true });
        await batch.commit();
    } catch (_) { /* pazienza: al massimo resta un tentativo contato */ }
}

/* ============================================================
   PASSWORD DIMENTICATA E ACCESSO DEI GESTORI
   ============================================================ */

/* Vercel lascia finire un lavoro dopo la risposta solo se glielo si chiede
   (waitUntil). E' lo stesso aggancio che usa il pacchetto @vercel/functions,
   letto qui direttamente per non aggiungere una dipendenza al servizio.
   Fuori da Vercel (server locale, prove) non c'e': restituisce false. */
function lasciaFinire(lavoro) {
    try {
        const rc = globalThis[Symbol.for('@vercel/request-context')];
        const c = rc && typeof rc.get === 'function' ? rc.get() : null;
        if (c && typeof c.waitUntil === 'function') { c.waitUntil(lavoro); return true; }
    } catch (_) { /* nessun aggancio */ }
    return false;
}

/* Tutto quello che c'e' dentro gira, ma la risposta parte solo quando
   e' passato il tempo fissato all'inizio (2,5 s + fino a 0,4 s a caso):
   un account che esiste e uno che non esiste, un invio riuscito e uno
   fallito, rispondono dopo lo stesso tempo. Se il lavoro dura di piu'
   (Brevo lento), la risposta parte lo stesso allo scadere e il lavoro
   finisce dopo, con waitUntil: il tempo della risposta non dice nulla
   nemmeno in quel caso. Solo fuori da Vercel si aspetta la fine. */
async function aDurataCostante(etichetta, fn) {
    const fine = Date.now() + 2500 + crypto.randomInt(400);
    const lavoro = Promise.resolve().then(fn).catch(e => {
        console.error('[diretta] ' + etichetta + ': ' + D.perLog(e));
    });
    const finito = await Promise.race([
        lavoro.then(() => true),
        pausa(Math.max(0, fine - Date.now())).then(() => false)
    ]);
    if (!finito) {
        if (!lasciaFinire(lavoro)) await lavoro;
        return;
    }
    const resto = fine - Date.now();
    if (resto > 0) await pausa(resto);
}

/* Un contatore per finestra fissa SENZA transazione: serve ai limiti
   condivisi da tante richieste nello stesso momento (la stessa rete
   aziendale, il tetto complessivo delle email). Con una transazione le
   richieste contemporanee si metterebbero in fila, e ogni ripartenza di
   Firestore costa un secondo: la risposta non arriverebbe piu' "sempre
   dopo lo stesso tempo".
   Prima si conta, poi si rilegge: limiti/{chiave}_{numero della finestra}
   riceve +1 (increment, con merge: niente si azzera mai) e la rilettura
   comprende il proprio +1 e tutti quelli arrivati prima. Cosi' anche in
   una raffica di sessanta richieste nello stesso istante al massimo
   `massimo` possono vedere un numero entro il tetto: le altre si
   fermano. In una raffica ne passano anche MENO (la rilettura di una
   richiesta vede pure i +1 arrivati subito dopo il suo): si sbaglia
   dalla parte della prudenza, e solo quando da una rete arrivano decine
   di richieste nello stesso secondo, che non e' un uso normale di
   "password dimenticata". Una finestra nuova e' un documento nuovo:
   niente da azzerare. Ogni
   richiesta conta, anche quelle che poi si fermano (DECISIONI D9: il
   gettone della rete si consuma prima di cercare). I limiti per singola
   persona restano transazionali (consumaGettone). */
async function contaInFinestra(ctx, chiave, massimo, finestraMs) {
    const ora = ctx.adesso();
    const finestra = Math.floor(ora / finestraMs);
    const rif = ctx.db.collection('limiti').doc(chiave + '_' + finestra);
    await rif.set({ conteggio: ctx.FieldValue.increment(1), scade: scadenza(ctx, (finestra + 1) * finestraMs) }, { merge: true });
    const snap = await rif.get();
    return (Number(snap.get('conteggio')) || 0) <= massimo;
}

/* Il collegamento di Firebase per la nuova password, riscritto sulla
   pagina nostra (/diretta/reimposta.html): se ne tiene solo il codice. */
async function linkReimpostazione(ctx, emailAccount, extra) {
    const grezzo = await ctx.auth.generatePasswordResetLink(emailAccount);
    const oob = new URL(grezzo).searchParams.get('oobCode');
    if (!oob) throw new Error('oobCode non ricavabile dal collegamento di Firebase');
    return C.baseSito() + '/diretta/reimposta.html?oobCode=' + encodeURIComponent(oob) + (extra || '');
}

/* L'email parte da lib/diretta-invio.js, che conta anche il tetto
   giornaliero di Brevo (le reimpostazioni si fermano all'80%, per lasciare
   posto a credenziali e promemoria). Il modulo si carica solo qui.
   `dopoInvio()` si chiama quando il collegamento e' partito, o
   forse partito (connessione caduta dopo il DATA), prima di segnalare
   un eventuale errore. */
async function spedisciReimpostazione(ctx, dati, dopoInvio) {
    const invio = require('./diretta-invio');
    const r = await invio.inviaReimpostazione(ctx, dati);
    if (r && (r.ok !== false || r.forse) && dopoInvio) await dopoInvio();
    if (r && r.ok === false) throw new Error('reimpostazione non spedita (' + String(r.motivo || '').slice(0, 80) + ')');
}

/* password-dimenticata: la persona scrive la sua email (quella con cui
   si e' iscritta; maiuscole e spazi prima e dopo non contano). Se c'e'
   un account attivo con quell'email, il collegamento per scegliere una
   password nuova parte verso quell'indirizzo (normalizzato: lo stesso a
   cui arrivano le credenziali); a chi non e' iscritto non parte NIENTE.
   In ogni caso la risposta e' la stessa, dopo lo stesso tempo. I limiti:
   20 richieste l'ora dalla stessa rete (contate prima di cercare, anche
   per le email che non esistono), per persona una ogni 2 minuti e al
   massimo 3 al giorno, e 200 all'ora in tutto.
   Il vecchio nome del campo (`identificativo`, che accettava anche il
   nome utente) arriva qui gia' tradotto in `email` dall'API: un nome
   utente non e' un'email valida, quindi non trova nessuno.
   Partito il collegamento, sul profilo resta QUANDO (resetInviato): la
   persona da li' puo' avere una password scelta da lei, e un «Invia le
   credenziali» del gestore o un'iscrizione dal modulo non devono
   cancellargliela con una nostra (vedi haPassword in
   lib/diretta-invio.js: riceve «Sei iscritto anche a...»). Se proprio
   questa scrittura non riesce, il collegamento e' partito lo stesso: lo
   dice il log (senza dati personali). */
async function passwordDimenticata(ctx, { email, ip }) {
    await aDurataCostante('reimpostazione', async () => {
        const impIp = C.improntaIp(ip);
        if (!await contaInFinestra(ctx, 'resetip_' + impIp, TETTO_RESET_RETE, ORA)) {
            console.error('[diretta] reimpostazione: limite della rete raggiunto');
            return;
        }
        const scritta = E.normalizzaEmail(String(email == null ? '' : email).slice(0, 400));
        if (!E.emailValida(scritta)) return;
        const db = ctx.db;
        const s = await db.collection('indirizzi').doc(scritta).get();
        const uid = s.exists ? String(s.data().uid || '') : '';
        if (!uid) return;
        const [snapP, snapS] = await db.getAll(db.collection('partecipanti').doc(uid), db.collection('sessioni').doc(uid));
        const p = snapP.exists ? snapP.data() : null;
        if (!p || p.stato !== 'attivo' || p.authCreato !== true || (snapS.exists && snapS.data().stato !== 'attivo')) return;
        // una sola regola per l'indirizzo: quello normalizzato (anche per i profili caricati prima che si salvasse cosi')
        const indirizzo = p.emailNorm || E.normalizzaEmail(p.email);
        if (!E.emailValida(indirizzo)) return;
        if (!await C.consumaGettone(ctx, 'limiti', 'reset_' + uid, { pausaMs: 2 * MINUTO, maxFinestra: 3, finestraMs: GIORNO })) {
            console.error('[diretta] reimpostazione: limite della persona raggiunto');
            return;
        }
        if (!await contaInFinestra(ctx, 'reset_globale', TETTO_RESET_ORA, ORA)) {
            console.error('[diretta] reimpostazione: tetto orario complessivo raggiunto');
            return;
        }
        // il collegamento non porta l'email: un indirizzo in un URL finisce nei registri
        const link = await linkReimpostazione(ctx, C.emailTecnica(uid));
        await spedisciReimpostazione(ctx, { a: indirizzo, nome: p.nome || '', cognome: p.cognome || '', email: indirizzo, link: link, perGestore: false }, async () => {
            try {
                await db.collection('partecipanti').doc(uid).update({ resetInviato: ctx.Timestamp.fromMillis(ctx.adesso()) });
            } catch (e) {
                console.error('[diretta] reimpostazione partita ma non registrata sul profilo: ' + D.perLog(e));
            }
        });
    });
    return { msg: MSG_DIMENTICATA };
}

/* gestore-accesso: "primo accesso o password dimenticata" della gestione.
   Solo per le email dell'elenco DIRETTA_ADMIN_EMAILS. L'account del
   gestore lo crea o lo rimette in ordine il servizio (DECISIONI D2):
   email verificata, claim "gestore", niente claim "eventi". Se qualcuno
   si era registrato da solo con quell'email (con la chiave pubblica del
   progetto si puo'), la password cambia e le sue sessioni si chiudono:
   perde l'accesso, e il collegamento arriva al vero titolare.
   I gestori hanno un tetto orario tutto loro ('gestore_globale'): un'ondata
   di "password dimenticata" dei partecipanti non deve togliere ai gestori
   il collegamento per entrare in gestione proprio quel giorno. */
async function gestoreAccesso(ctx, { email, ip }) {
    await aDurataCostante('accesso gestore', async () => {
        const impIp = C.improntaIp(ip);
        if (!await contaInFinestra(ctx, 'gestoreip_' + impIp, TETTO_GESTORE_RETE, ORA)) {
            console.error('[diretta] accesso gestore: limite della rete raggiunto');
            return;
        }
        const indirizzo = String(email == null ? '' : email).trim().toLowerCase().slice(0, 254);
        if (!C.eGestore(indirizzo)) return;
        if (!await C.consumaGettone(ctx, 'limiti', 'gestore_' + C.impronta(indirizzo), { pausaMs: 2 * MINUTO, maxFinestra: 3, finestraMs: GIORNO })) {
            console.error('[diretta] accesso gestore: limite della persona raggiunto');
            return;
        }
        if (!await contaInFinestra(ctx, 'gestore_globale', TETTO_GESTORI_ORA, ORA)) {
            console.error('[diretta] accesso gestore: tetto orario dei gestori raggiunto');
            return;
        }
        let utente = null;
        try { utente = await ctx.auth.getUserByEmail(indirizzo); } catch (e) {
            if (!e || e.code !== 'auth/user-not-found') throw e;
        }
        if (!utente) {
            utente = await conLimite(() => ctx.auth.createUser({ email: indirizzo, emailVerified: true, password: passwordSegreta() }));
            await conLimite(() => ctx.auth.setCustomUserClaims(utente.uid, { gestore: true }));
        } else {
            const claims = utente.customClaims || {};
            if (utente.emailVerified !== true || claims.gestore !== true || claims.eventi !== undefined || utente.disabled) {
                await conLimite(() => ctx.auth.updateUser(utente.uid, { password: passwordSegreta(), emailVerified: true, disabled: false }));
                await conLimite(() => ctx.auth.revokeRefreshTokens(utente.uid));
                await conLimite(() => ctx.auth.setCustomUserClaims(utente.uid, { gestore: true }));
            }
        }
        // l'elenco degli account di gestione: il cron li ripulisce quando l'email esce dall'elenco
        await ctx.db.collection('gestoriAccount').doc(utente.uid).set({ email: indirizzo, aggiornato: ctx.adesso() });
        const link = await linkReimpostazione(ctx, indirizzo, '&per=gestione');
        await spedisciReimpostazione(ctx, { a: indirizzo, nome: '', link: link, perGestore: true });
    });
    return { msg: MSG_GESTORE };
}

/* ============================================================
   AGGIORNA-PERMESSI
   ============================================================ */

/* La pagina della diretta la chiama quando il profilo dice che la persona
   e' iscritta a un evento ma il token non lo sa ancora (claims non
   allineati, per esempio dopo un'aggiunta a un secondo evento). */
async function aggiornaPermessi(ctx, req) {
    const m = /^Bearer\s+(.+)$/i.exec(String((req.headers || {}).authorization || ''));
    if (!m) throw C.errore(401, 'Accesso richiesto', 'non-autenticato');
    let tok;
    try { tok = await ctx.auth.verifyIdToken(m[1], true); } catch (e) {
        if (C.tokenNonValido(e)) throw C.errore(401, 'La sessione è scaduta: accedi di nuovo.', 'non-autenticato');
        throw C.errore(503, 'Servizio di accesso momentaneamente non disponibile: riprova tra qualche secondo.', 'riprova');
    }
    const [snapP, snapS] = await ctx.db.getAll(ctx.db.collection('partecipanti').doc(tok.uid), ctx.db.collection('sessioni').doc(tok.uid));
    if (!snapP.exists) throw C.errore(403, 'Questo account non è un partecipante della diretta.', 'non-partecipante');
    const p = snapP.data();
    if (p.stato !== 'attivo' || (snapS.exists && snapS.data().stato !== 'attivo')) throw D.errorePubblico(403, 'disattivato', MSG_DISATTIVATO);
    return { aggiornati: await D.allineaClaims(ctx, tok.uid) };
}

/* ============================================================
   LINK-VIDEO
   ============================================================ */

/* Il link firmato del video per chi guarda. La pagina lo chiede solo
   quando l'evento dice videoFirmato (con un'attesa casuale, cosi' mille
   persone non chiedono nello stesso istante) e lo rinnova verso la
   scadenza. Controlli: token valido (senza chiedere a Google delle
   revoche, che con mille persone insieme costerebbe mille chiamate:
   lo stato dell'account si legge nei dati della diretta, come fanno le
   regole), account attivo, dispositivo ammesso, iscritto all'evento,
   evento in onda, link presente. Il dispositivo si controlla come fanno
   le regole di Firestore per i segnali di presenza (sessioneValida):
   con "un solo dispositivo" sessioni/{uid}.sessioneAttiva e' la sessione
   dell'ultimo accesso, e un dispositivo sostituito (la sua sessione,
   b.sessione, e' un'altra) non riceve piu' link: 403 'altro-dispositivo'
   (la pagina lo dice come per la presenza). Senza "un solo dispositivo"
   sessioneAttiva e' null e vale ogni dispositivo. Il link c'e' solo per
   il flusso diretto (tipoPlayer 'flusso'): con il player di Azoto
   l'indirizzo arriva gia' nel documento dell'evento, e qui la risposta
   e' 409 'non-flusso' (lo decide D.linkVideo). La risposta:
   { url, scade, validoSecondi } (vedi lib/diretta-firma.js). Nei log
   niente di personale (vedi D.rispondi). */
async function linkVideo(ctx, req, b) {
    const m = /^Bearer\s+(.+)$/i.exec(String((req.headers || {}).authorization || ''));
    if (!m) throw C.errore(401, 'Accesso richiesto', 'non-autenticato');
    let tok;
    try { tok = await ctx.auth.verifyIdToken(m[1]); } catch (e) {
        if (C.tokenNonValido(e)) throw C.errore(401, 'La sessione è scaduta: accedi di nuovo.', 'non-autenticato');
        throw C.errore(503, 'Servizio di accesso momentaneamente non disponibile: riprova tra qualche secondo.', 'riprova');
    }
    const idEvento = D.controllaIdEvento(b.idEvento);
    if (!await C.consumaGettone(ctx, 'limiti', 'linkvideo_' + tok.uid, { maxFinestra: TETTO_LINK_VIDEO, finestraMs: ORA })) {
        throw D.errorePubblico(429, 'attendi', 'Troppe richieste del video in poco tempo: riprova tra qualche minuto.', { attesaSecondi: 300 });
    }
    const [snapP, snapS] = await ctx.db.getAll(ctx.db.collection('partecipanti').doc(tok.uid), ctx.db.collection('sessioni').doc(tok.uid));
    if (!snapP.exists) throw C.errore(403, 'Questo account non è un partecipante della diretta.', 'non-partecipante');
    const p = snapP.data();
    const s = snapS.exists ? snapS.data() : null;
    if (p.stato !== 'attivo' || (s && s.stato !== 'attivo')) throw D.errorePubblico(403, 'disattivato', MSG_DISATTIVATO);
    const ammessa = s && typeof s.sessioneAttiva === 'string' && s.sessioneAttiva ? s.sessioneAttiva : null;
    if (ammessa && String(b.sessione || '') !== ammessa) {
        throw D.errorePubblico(403, 'altro-dispositivo', 'La diretta è stata aperta da un altro dispositivo: per guardarla qui, accedi di nuovo.');
    }
    if (!Array.isArray(p.eventi) || p.eventi.indexOf(idEvento) < 0) throw D.errorePubblico(403, 'non-iscritto', 'Non risulti iscritto a questa diretta.');
    return D.linkVideo(ctx, { idEvento: idEvento, sorgente: b.sorgente, soloInOnda: true });
}

module.exports = {
    entra, passwordDimenticata, gestoreAccesso, aggiornaPermessi, linkVideo,
    attesaDopo, descriviDispositivo, contenutoToken, verificaPassword, aDurataCostante, lasciaFinire, tempoMinimo, contaInFinestra,
    MSG_CREDENZIALI, MSG_DIMENTICATA, MSG_GESTORE, MSG_DISATTIVATO, TEMPO_FALLITO_MS, CASO_FALLITO_MS
};
