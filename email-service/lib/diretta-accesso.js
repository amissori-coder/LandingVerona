/* ============================================================
   Diretta degli eventi: l'accesso delle persone e dei gestori
   ------------------------------------------------------------
   La logica di api/diretta-accesso.js, l'unica porta PUBBLICA della
   diretta insieme a diretta-stato:

   - ENTRA: nome utente + password -> token personalizzato di Firebase.
     La persona scrive solo il nome utente ("Mario Rossi", " MarioRossi "
     e "mario.rossi" sono tutti mariorossi); dietro, il nome porta all'uid
     (nomiUtente/{nome}) e l'uid all'email tecnica dell'account, che
     nessuno vede e che dal nome NON si ricava (DECISIONI D1). La
     password la verifica Google (Identity Toolkit, chiamata dal server):
     noi non la vediamo passare in nessun archivio e non la scriviamo mai.

   - IL BLOCCO DEI TENTATIVI (DECISIONI D4). Ogni tentativo si PRENOTA
     prima di chiedere a Google, in una transazione su due documenti:
       tentativi/{nome}_{impronta dell'IP}: la coppia nome + rete. Dopo 5
         errori di fila si aspetta 30 s, poi 60, 120... fino a 15 minuti.
         E' la regola "5 password sbagliate di fila, attesa crescente", e
         riguarda solo chi sbaglia da quella rete: un disturbatore che
         prova il nome di un altro da casa sua non blocca il vero titolare.
       tentativiNome/{nome}: il tetto contro chi prova da tante reti
         diverse: 50 errori in un'ora bloccano il nome per 15 minuti.
     La prenotazione conta il tentativo come fallito PRIMA della verifica:
     cosi' venti richieste sbagliate che arrivano nello stesso istante
     non passano tutte (ne passano cinque, le altre aspettano). Se poi la
     password e' giusta, la coppia si cancella e il tentativo si restituisce.
     In piu' tentativiIp/{impronta} conta i soli fallimenti di una rete
     (40 in 15 minuti -> 5 minuti di attesa), senza transazione e senza
     scrivere niente sugli accessi riusciti: cento colleghi dietro lo
     stesso IP aziendale non si bloccano a vicenda.

   - NOMI INESISTENTI: stessa risposta e tempi simili a una password
     sbagliata (DECISIONI T1), ma senza chiedere niente a Google.

   - PASSWORD DIMENTICATA e ACCESSO DEI GESTORI (DECISIONI D2, D9): la
     risposta e' SEMPRE la stessa e arriva sempre dopo lo stesso tempo
     (2,5-2,9 secondi), qualunque cosa succeda dietro: dall'esterno non
     si capisce se un nome o un'email esistono.

   - AGGIORNA-PERMESSI (DECISIONI T8): se i claims del token di una
     persona non corrispondono ai suoi eventi, li rimette in ordine.

   Nei log non finiscono mai password, token, nomi utente scritti dalle
   persone o indirizzi email.
   ============================================================ */
'use strict';
const crypto = require('crypto');
const C = require('./diretta-comune');
const N = require('./diretta-nome-utente');
const D = require('./diretta-dati');
const { passwordSegreta } = require('./diretta-password');
const { conLimite } = require('./diretta-auth');

const MINUTO = 60 * 1000;
const ORA = 60 * MINUTO;
const GIORNO = 24 * ORA;
const ERRORI_DI_FILA = 5;                 // poi si aspetta
const ATTESA_BASE_MS = 30 * 1000;         // 30 s, 60 s, 120 s...
const ATTESA_MASSIMA_MS = 15 * MINUTO;
const TETTO_NOME = 50;                    // errori in un'ora sullo stesso nome, da qualunque rete
const BLOCCO_NOME_MS = 15 * MINUTO;
const TETTO_IP = 40;                      // errori in 15 minuti dalla stessa rete
const FINESTRA_IP_MS = 15 * MINUTO;
const BLOCCO_IP_MS = 5 * MINUTO;
const ATTESA_GOOGLE_MS = 8000;

const MSG_CREDENZIALI = 'Nome utente o password non corretti. Se il problema continua, scrivi all\'assistenza.';
const MSG_DISATTIVATO = 'Il tuo accesso è stato disattivato. Scrivi all\'assistenza.';
const MSG_DIMENTICATA = 'Se l\'account esiste, ti abbiamo scritto all\'indirizzo email con cui ti sei iscritto.';
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

function rifTentativi(ctx, nome, impIp) {
    return {
        coppia: ctx.db.collection('tentativi').doc(nome + '_' + impIp),
        nome: ctx.db.collection('tentativiNome').doc(nome),
        ip: ctx.db.collection('tentativiIp').doc(impIp)
    };
}

/* Prenota il tentativo: se la coppia o il nome sono bloccati risponde
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

        // il nome, da tutte le reti insieme: finestra di un'ora
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

// quanto manca alla fine del blocco della rete (0 = libera)
function bloccoIp(snap, ora) {
    const d = snap && snap.exists ? snap.data() : {};
    const fino = Number(d.bloccatoFino) || 0;
    return fino > ora ? fino - ora : 0;
}
/* Un fallimento in piu' per la rete: senza transazione (increment),
   partendo da quello che si era letto all'inizio. */
async function contaFallimentoIp(ctx, rifIp, snap, ora) {
    try {
        const d = snap && snap.exists ? snap.data() : {};
        if (!(snap && snap.exists) || ora - (Number(d.inizioFinestra) || 0) >= FINESTRA_IP_MS) {
            await rifIp.set({ falliti: 1, inizioFinestra: ora, bloccatoFino: 0 });
            return;
        }
        const agg = { falliti: ctx.FieldValue.increment(1) };
        if ((Number(d.falliti) || 0) + 1 >= TETTO_IP) agg.bloccatoFino = ora + BLOCCO_IP_MS;
        await rifIp.set(agg, { merge: true });
    } catch (e) {
        console.error('[diretta] conteggio della rete: ' + D.perLog(e));
    }
}

/* ============================================================
   LA VERIFICA DELLA PASSWORD (Identity Toolkit, dal server)
   ============================================================ */

const FALLIMENTI = new Set(['INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND', 'USER_DISABLED']);

/* Google limita a volte le verifiche che arrivano da uno stesso IP (e
   il servizio su Vercel, per Google, e' un solo IP): se succede con
   tanti nomi diversi nello stesso minuto non e' una persona che sbaglia,
   e il log lo deve dire chiaro. */
let troppiRecenti = [];
function segnalaTroppi(nome) {
    const ora = Date.now();
    troppiRecenti = troppiRecenti.filter(x => ora - x.t < MINUTO);
    troppiRecenti.push({ t: ora, n: C.impronta(nome) });
    const nomi = new Set(troppiRecenti.map(x => x.n)).size;
    console.error('[diretta] Google risponde TOO_MANY_ATTEMPTS_TRY_LATER' + (nomi > 20
        ? ': ' + nomi + ' nomi diversi in un minuto, possibile blocco di Google sugli IP del servizio'
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
async function verificaPassword(ctx, uid, password, nome) {
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
    if (codice === 'TOO_MANY_ATTEMPTS_TRY_LATER') { segnalaTroppi(nome); return { esito: 'troppi' }; }
    console.error('[diretta] verifica delle credenziali: risposta inattesa ' + r.status + ' ' + codice.slice(0, 60));
    return { esito: 'lento' };
}

/* ============================================================
   ENTRA
   ============================================================ */
async function entra(ctx, ingresso) {
    const nome = N.pulisciAccesso(ingresso.nomeUtente);
    const password = typeof ingresso.password === 'string' ? ingresso.password : '';
    if (!nome || !password) throw D.errorePubblico(400, 'credenziali', 'Scrivi il nome utente e la password.');
    if (password.length > 200) throw D.errorePubblico(401, 'credenziali', MSG_CREDENZIALI, { rimasti: ERRORI_DI_FILA });
    const db = ctx.db;
    const inizio = ctx.adesso();
    const impIp = C.improntaIp(ingresso.ip);
    const rif = rifTentativi(ctx, nome, impIp);

    // la rete e il nome si leggono insieme (nessuna transazione: letture semplici)
    const [snapIp, snapNome] = await Promise.all([rif.ip.get(), db.collection('nomiUtente').doc(nome).get()]);
    const attesaRete = bloccoIp(snapIp, inizio);
    if (attesaRete) throw attendi(attesaRete);

    const pren = await prenota(ctx, rif);
    if (pren.bloccatoPerMs) throw attendi(pren.bloccatoPerMs);

    const uid = snapNome.exists ? String(snapNome.data().uid || '') : '';
    let verifica;
    if (!uid) {
        // nome inesistente: niente Google, ma lo stesso tempo di una verifica vera
        await pausa(150 + crypto.randomInt(250));
        verifica = { esito: 'fallita' };
    } else {
        verifica = await verificaPassword(ctx, uid, password, nome);
    }

    if (verifica.esito === 'fallita') {
        await contaFallimentoIp(ctx, rif.ip, snapIp, ctx.adesso());
        const ora = ctx.adesso();
        if (pren.bloccatoFino > ora) throw attendi(pren.bloccatoFino - ora);
        throw D.errorePubblico(401, 'credenziali', MSG_CREDENZIALI, { rimasti: Math.max(0, ERRORI_DI_FILA - pren.falliti) });
    }
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
    const batch = db.batch();
    batch.update(rifP, { ultimoAccesso: ts });
    batch.set(rifS, Object.assign(s ? {} : { stato: 'attivo' }, {
        sessioneAttiva: scelta.dati.unSoloDispositivo === true ? sessione : null, aggiornato: ts
    }), { merge: true });
    batch.set(db.collection('accessi').doc(), {
        uid: uid, nomeUtente: p.nomeUtente || nome, nome: p.nome || '', cognome: p.cognome || '', azienda: p.azienda || '',
        idEvento: scelta.id, quando: ts, dispositivo: descriviDispositivo(ingresso.userAgent)
    });
    // il tentativo era buono: via la coppia, e al nome si restituisce il tentativo
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
        nome: p.nome || '', cognome: p.cognome || '', nomeUtente: p.nomeUtente || nome
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

/* Tutto quello che c'e' dentro gira, ma la risposta parte solo quando
   e' passato il tempo fissato all'inizio (2,5 s + fino a 0,4 s a caso):
   un account che esiste e uno che non esiste, un invio riuscito e uno
   fallito, rispondono dopo lo stesso tempo. */
async function aDurataCostante(etichetta, fn) {
    const fine = Date.now() + 2500 + crypto.randomInt(400);
    try {
        await fn();
    } catch (e) {
        console.error('[diretta] ' + etichetta + ': ' + D.perLog(e));
    }
    const resto = fine - Date.now();
    if (resto > 0) await pausa(resto);
}

/* Un contatore per finestra SENZA transazione (increment): serve ai
   limiti condivisi da tante richieste nello stesso momento (la stessa
   rete aziendale, il tetto complessivo delle reimpostazioni). Con una
   transazione le richieste contemporanee si metterebbero in fila, e ogni
   ripartenza di Firestore costa un secondo: la risposta non arriverebbe
   piu' "sempre dopo lo stesso tempo". Al confine del tetto puo' passare
   qualche richiesta in piu': per un limite anti-abuso va bene. I limiti
   per singola persona restano invece transazionali (consumaGettone). */
async function contaInFinestra(ctx, chiave, massimo, finestraMs) {
    const rif = ctx.db.collection('limiti').doc(chiave);
    const ora = ctx.adesso();
    const snap = await rif.get();
    const d = snap.exists ? snap.data() : {};
    if (!snap.exists || ora - (Number(d.inizioFinestra) || 0) >= finestraMs) {
        await rif.set({ conteggio: 1, inizioFinestra: ora, ultimo: ora });
        return true;
    }
    if ((Number(d.conteggio) || 0) >= massimo) return false;
    await rif.set({ conteggio: ctx.FieldValue.increment(1), ultimo: ora }, { merge: true });
    return true;
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
   posto a credenziali e promemoria). Il modulo si carica solo qui. */
async function spedisciReimpostazione(ctx, dati) {
    const invio = require('./diretta-invio');
    const r = await invio.inviaReimpostazione(ctx, dati);
    if (r && r.ok === false) throw new Error('reimpostazione non spedita (' + String(r.motivo || '').slice(0, 80) + ')');
}

/* password-dimenticata: la persona scrive il nome utente oppure la sua
   email (quella vera, con cui si e' iscritta). Se l'account c'e' ed e'
   attivo, il collegamento parte verso la sua email vera; in ogni caso
   la risposta e' la stessa. I limiti: 20 richieste l'ora dalla stessa
   rete (contate prima di cercare, anche per i nomi inesistenti), per
   persona una ogni 2 minuti e al massimo 3 al giorno, e 200 all'ora in
   tutto. */
async function passwordDimenticata(ctx, { identificativo, ip }) {
    await aDurataCostante('reimpostazione', async () => {
        const impIp = C.improntaIp(ip);
        if (!await contaInFinestra(ctx, 'resetip_' + impIp, 20, ORA)) {
            console.error('[diretta] reimpostazione: limite della rete raggiunto');
            return;
        }
        const scritto = String(identificativo == null ? '' : identificativo).slice(0, 300);
        const db = ctx.db;
        let uid = '';
        if (scritto.indexOf('@') >= 0) {
            const email = N.emailNormalizzata(scritto);
            if (!N.emailValida(email)) return;
            const s = await db.collection('indirizzi').doc(email).get();
            uid = s.exists ? String(s.data().uid || '') : '';
        } else {
            const nome = N.pulisciAccesso(scritto);
            if (!nome) return;
            const s = await db.collection('nomiUtente').doc(nome).get();
            uid = s.exists ? String(s.data().uid || '') : '';
        }
        if (!uid) return;
        const [snapP, snapS] = await db.getAll(db.collection('partecipanti').doc(uid), db.collection('sessioni').doc(uid));
        const p = snapP.exists ? snapP.data() : null;
        if (!p || p.stato !== 'attivo' || p.authCreato !== true || (snapS.exists && snapS.data().stato !== 'attivo')) return;
        if (!N.emailValida(p.emailNorm || p.email)) return;
        if (!await C.consumaGettone(ctx, 'limiti', 'reset_' + uid, { pausaMs: 2 * MINUTO, maxFinestra: 3, finestraMs: GIORNO })) {
            console.error('[diretta] reimpostazione: limite della persona raggiunto');
            return;
        }
        if (!await contaInFinestra(ctx, 'reset_globale', 200, ORA)) {
            console.error('[diretta] reimpostazione: tetto orario complessivo raggiunto');
            return;
        }
        const link = await linkReimpostazione(ctx, C.emailTecnica(uid), '&u=' + encodeURIComponent(p.nomeUtente || ''));
        await spedisciReimpostazione(ctx, { a: p.email, nome: p.nome || '', cognome: p.cognome || '', nomeUtente: p.nomeUtente || '', link: link, perGestore: false });
    });
    return { msg: MSG_DIMENTICATA };
}

/* gestore-accesso: "primo accesso o password dimenticata" della gestione.
   Solo per le email dell'elenco DIRETTA_ADMIN_EMAILS. L'account del
   gestore lo crea o lo rimette in ordine il servizio (DECISIONI D2):
   email verificata, claim "gestore", niente claim "eventi". Se qualcuno
   si era registrato da solo con quell'email (con la chiave pubblica del
   progetto si puo'), la password cambia e le sue sessioni si chiudono:
   perde l'accesso, e il collegamento arriva al vero titolare. */
async function gestoreAccesso(ctx, { email, ip }) {
    await aDurataCostante('accesso gestore', async () => {
        const impIp = C.improntaIp(ip);
        if (!await contaInFinestra(ctx, 'gestoreip_' + impIp, 10, ORA)) {
            console.error('[diretta] accesso gestore: limite della rete raggiunto');
            return;
        }
        const indirizzo = String(email == null ? '' : email).trim().toLowerCase().slice(0, 254);
        if (!C.eGestore(indirizzo)) return;
        if (!await C.consumaGettone(ctx, 'limiti', 'gestore_' + C.impronta(indirizzo), { pausaMs: 2 * MINUTO, maxFinestra: 3, finestraMs: GIORNO })) {
            console.error('[diretta] accesso gestore: limite della persona raggiunto');
            return;
        }
        if (!await contaInFinestra(ctx, 'reset_globale', 200, ORA)) {
            console.error('[diretta] accesso gestore: tetto orario complessivo raggiunto');
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
        await spedisciReimpostazione(ctx, { a: indirizzo, nome: '', nomeUtente: '', link: link, perGestore: true });
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
    try { tok = await ctx.auth.verifyIdToken(m[1], true); } catch (_) {
        throw C.errore(401, 'La sessione è scaduta: accedi di nuovo.', 'non-autenticato');
    }
    const [snapP, snapS] = await ctx.db.getAll(ctx.db.collection('partecipanti').doc(tok.uid), ctx.db.collection('sessioni').doc(tok.uid));
    if (!snapP.exists) throw C.errore(403, 'Questo account non è un partecipante della diretta.', 'non-partecipante');
    const p = snapP.data();
    if (p.stato !== 'attivo' || (snapS.exists && snapS.data().stato !== 'attivo')) throw D.errorePubblico(403, 'disattivato', MSG_DISATTIVATO);
    return { aggiornati: await D.allineaClaims(ctx, tok.uid) };
}

module.exports = {
    entra, passwordDimenticata, gestoreAccesso, aggiornaPermessi,
    attesaDopo, descriviDispositivo, contenutoToken, verificaPassword,
    MSG_CREDENZIALI, MSG_DIMENTICATA, MSG_GESTORE, MSG_DISATTIVATO
};
