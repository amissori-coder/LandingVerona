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
   Google ("Napoli 2 Ottobre 2026 - Manifestazione di interesse") e, il
   modulo di Napoli, anche il campo facoltativo `percorso` (con
   location.pathname: napoli_ottobre_2026/script.js), che arriva solo a
   questo servizio. Si guarda UNA delle due, mai tutte e due insieme:
     - se c'e' un percorso valido (un percorso o un indirizzo diverso
       dalla home: /napoli_ottobre_2026/, .../index.html,
       https://.../napoli_ottobre_2026/#accreditamento), vince il
       percorso: percorsi uguali, normalizzati (solo il percorso,
       minuscolo, con la barra finale: D.percorsoPagina). L'etichetta
       allora non conta: un'etichetta di un altro evento, rimasta in una
       pagina copiata, non deve portare altrove chi si iscrive da qui;
     - solo senza percorso (uno script vecchio rimasto in cache, un
       altro modulo) si guarda l'etichetta: ogni parola della cartella
       della pagina dell'evento (napoli, ottobre, 2026) deve esserci fra
       le parole dell'etichetta (quella prima del " - "), e le parole
       devono essere almeno due.
   Conta solo un evento con l'interruttore acceso, non terminato e non
   ancora finito; se ne corrispondono due, nessuno (e lo dice il log: la
   gestione non lascia accendere l'interruttore su due eventi con la
   stessa pagina).

   CHE COSA SUCCEDE (iscriviDaModulo):
     - email nuova: si crea l'account (password segreta che nessuno
       conosce, come nell'import), le credenziali vanno 'in coda' e si
       prova a spedirle SUBITO (lib/diretta-invio.js, inviaSubito: e' li'
       che nasce la password, ed e' li' che si imposta e si mette
       nell'email); se non partono (posta bloccata, parte del tetto del
       giorno finita) restano in coda e le manda il cron di ogni 5
       minuti;
     - email che ha gia' un account DELLA STESSA PERSONA (nome e cognome
       uguali, E.stessaPersona): si aggiunge l'evento, e parte l'avviso
       «Sei iscritto anche a <evento>: entra con la tua email e la
       password che hai gia'...», SENZA password nuova (lo decide
       tipoInvio in diretta-invio.js: se la persona non aveva ancora
       nessuna password, riceve le credenziali). Una volta sola per
       evento: dalla seconda iscrizione l'evento c'e' gia';
     - iscrizione ripetuta (gia' nell'evento): niente di nuovo, ne' una
       seconda password ne' una seconda email. Solo chi era stato
       caricato dal file e aspettava ancora le credenziali ('da
       inviare'), o era rimasto 'in coda', le riceve adesso.
   Il nome e il cognome sono quelli del modulo (ripuliti da < > e
   caratteri invisibili); per un account esistente restano quelli
   registrati.

   SE IL SERVIZIO NON RISPONDE. La scheda del sito si salva PRIMA di
   chiamare la diretta: se qui qualcosa non va (Firestore della diretta
   irraggiungibile, un errore, la funzione fermata a meta'), la scheda
   c'e' lo stesso, e la ritrova il lavoro programmato ogni 5 minuti
   (lib/diretta-riconcilia.js, che rilegge le schede del sito in sola
   lettura e chiama iscriviDaModulo con `riconcilia`). E il modulo di
   Napoli, se la chiamata al servizio non arriva o riceve un 5xx o un
   429, la ripete da solo due volte (napoli_ottobre_2026/script.js).

   ANNULLATA O RIATTIVATA DAL SITO (dalSito, chiamato da
   api/iscrizione-nuova.js quando dal collegamento della conferma, il
   flusso "completa-salva", si annulla un posto online o si toglie
   l'annullamento). Chi annulla l'iscrizione esce da solo dall'evento
   della diretta (ritiraDaModulo): l'evento si toglie dal suo account
   (e, subito, dalla lettura: sessioni/{uid}.eventiTolti, vedi
   D.segnaTolto), le credenziali non ancora partite si cancellano, sul
   profilo resta quando (annullatoDalSito) e al gestore una riga «da
   verificare» 'annullata-dal-sito'. Vale sempre, anche a interruttore
   spento. Chi toglie l'annullamento (riattivaDaModulo), con
   l'interruttore acceso, rientra come una nuova iscrizione dal modulo;
   con l'interruttore spento, al gestore solo una riga
   'riattivata-dal-sito'.

   DA VERIFICARE (raccolta daVerificare, la mostra la gestione nella
   scheda Partecipanti: «Iscrizioni dal modulo da verificare»). Due casi
   in cui la diretta NON fa niente da sola, ma non deve nemmeno tacere:
     - 'email-condivisa': l'email ha gia' un account di UN'ALTRA persona
       (due colleghi con info@studio.it). Unire la seconda persona
       all'account della prima vorrebbe dire darle l'accesso (e le
       presenze, l'esportazione per gli attestati) a nome di un altro:
       l'account esistente non si tocca e non parte niente;
     - 'email-non-valida': l'indirizzo che il modulo del sito ha
       accettato (la sua regola e' piu' larga) non lo accetta la
       diretta (E.emailValida: accenti, punto prima della @...): nessun
       account.
   In tutti e due la scheda dell'iscrizione del sito resta valida
   (e' nel progetto dello studio), e qui resta una riga per il gestore:
   { idEvento, motivo, origine: 'modulo', nome, cognome, azienda,
   email (come l'ha scritta la persona), esistente (per l'email
   condivisa: il nome sull'account che c'e' gia'), quando, volte,
   archiviato }. L'id e' l'impronta di evento, motivo, email e nome:
   la stessa persona che si iscrive tre volte fa UNA riga (volte: 3),
   che torna da vedere anche se il gestore l'aveva gia' segnata come
   vista. Il gestore la segna come vista (archiviaDaVerificare, azione
   'da-verificare-archivia' di api/diretta-gestione.js) dopo aver
   sistemato a mano (un indirizzo suo per il collega, caricato con il
   file). Segnata come vista, la riga RESTA nel database (con chi e
   quando): esce solo dall'elenco. Altri due motivi, che non chiedono
   di sistemare niente ma che il gestore deve sapere (origine 'sito'):
   'annullata-dal-sito' (tolta dall'evento: vedi sopra) e
   'riattivata-dal-sito' (ha tolto l'annullamento a interruttore
   spento: non e' rientrata da sola). La riconciliazione scrive una
   riga solo se non c'e' gia' (soloNuova): se il modulo l'aveva scritta
   e il gestore l'ha gia' vista, rileggere la stessa scheda non deve
   riproporgliela.

   I LIMITI DEL MODULO PUBBLICO (persistenti, in limiti/ come quelli di
   «Password dimenticata?»: vedi contaInFinestra in
   lib/diretta-accesso.js). Il modulo lo puo' usare chiunque, con
   qualunque indirizzo: senza un freno sarebbe un modo per far partire
   le nostre email verso chi si vuole, e per consumare il tetto
   giornaliero di Brevo che serve alle credenziali del gestore. Contano
   solo le iscrizioni che farebbero partire un'email (nuovo account,
   evento aggiunto, credenziali che aspettavano), non quelle ripetute:
     - per RETE (C.improntaIp dell'IP del visitatore, per IPv6 la /64):
       DIRETTA_MODULO_RETE_ORA, 10 all'ora di base. Un ufficio che
       iscrive tutti i colleghi insieme ci sta quasi sempre; chi prova
       a riempire la coda da una rete sola no;
     - in tutto: DIRETTA_MODULO_ORA, 60 all'ora di base (1440 al giorno
       al massimo): piu' di quanti se ne iscrivono in un'ora anche
       subito dopo una newsletter, molto meno di un'ondata da tante
       reti. 0 vuol dire "nessuna password parte da sola".
   Oltre il limite l'account si crea lo stesso (la persona e' iscritta),
   ma la voce resta 'da inviare' con il motivo per il gestore: la
   password la manda lui con «Invia le credenziali» o «Invia ora». Il
   log dice il limite raggiunto (rete o totale), mai chi. In piu' le
   password del modulo partono solo entro il 60% del tetto giornaliero
   (DIRETTA_MODULO_PERCENTO, vedi lib/diretta-invio.js).
   Le righe «da verificare» hanno lo stesso limite per rete e un tetto
   loro di TETTO_DA_VERIFICARE_ORA (100) all'ora in tutto: oltre, non si
   scrivono (lo dice il log; la scheda del sito c'e' comunque).
   La riconciliazione conta come il modulo, ma non ha l'IP (la scheda
   del sito non lo tiene): per lei vale solo il limite complessivo
   dell'ora, e oltre NON crea l'account "trattenuto": si ferma, e la
   stessa scheda torna al giro dopo, quando l'ora e' passata (vedi
   lib/diretta-riconcilia.js). Le righe 'annullata-dal-sito' e
   'riattivata-dal-sito' non hanno limiti: arrivano da un collegamento
   firmato (la conferma), non dal modulo aperto a tutti.

   IL GANCIO (dalModulo, chiamato da api/iscrizione-nuova.js DOPO aver
   salvato la scheda, dentro un try/catch). Non lancia mai. Su Vercel
   (dove c'e' waitUntil: A.lasciaFinire) NON aspetta mai il lavoro: la
   risposta del modulo parte subito e il lavoro finisce dopo. E' una
   questione di riservatezza, non solo di velocita': un account nuovo
   (account, password, email: un secondo o piu') e un'iscrizione gia'
   fatta (qualche lettura) durano tempi diversi, e se la risposta li
   aspettasse, il suo tempo direbbe a chiunque se un indirizzo e' gia'
   iscritto alla diretta. Cosi' invece il modulo risponde nello stesso
   tempo qualunque cosa succeda qui. Fuori da Vercel (il server locale,
   le prove) non c'e' waitUntil e si aspetta la fine, come per
   «Password dimenticata?». Se la diretta non e' configurata (manca
   DIRETTA_FIREBASE_SERVICE_ACCOUNT e non si e' nell'emulatore) non fa
   niente: l'iscrizione del sito resta com'e'.

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

const ORA = 60 * 60 * 1000;
const MOTIVI_DA_VERIFICARE = ['email-condivisa', 'email-non-valida', 'annullata-dal-sito', 'riattivata-dal-sito'];
// le credenziali "non ancora partite": chi annulla le perde (vedi ritiraDaModulo)
const STATI_NON_PARTITI = ['da inviare', 'in coda'];
const TETTO_DA_VERIFICARE_ORA = 100;
const MAX_DA_VERIFICARE = 500;
const RE_ID_DA_VERIFICARE = /^[0-9a-f]{32}$/;
// il motivo sulla voce di chi si iscrive oltre il limite: lo legge il gestore nell'elenco
const MOTIVO_TRATTENUTA = 'Iscritta dal modulo del sito quando il limite orario delle password automatiche era raggiunto: '
    + 'la password non è partita da sola. Mandala tu con «Invia le credenziali» (o «Invia ora»).';

// i limiti del modulo pubblico (vedi I LIMITI DEL MODULO PUBBLICO)
function maxRete() { return C.intero('DIRETTA_MODULO_RETE_ORA', 10); }
function maxOra() { return C.intero('DIRETTA_MODULO_ORA', 60); }

// lib/diretta-accesso.js si carica solo quando serve (waitUntil e i contatori a finestra)
function accesso() { return require('./diretta-accesso'); }

// la diretta c'e'? (la chiave del suo progetto, o l'emulatore delle prove)
function configurata() {
    return inEmulatore() || !!String(process.env.DIRETTA_FIREBASE_SERVICE_ACCOUNT || '').trim();
}

/* ---------- la pagina del modulo e quella dell'evento ---------- */

// "napoli_ottobre_2026" -> ['napoli', 'ottobre', '2026']; accenti via
function parole(s) {
    return String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
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
    const etichetta = new Set(parole(pm.split(/\s[-–—]\s/)[0]));
    return richieste.every(p => etichetta.has(p));
}
/* Che cosa si confronta con la pagina dell'evento: il percorso, se ce
   n'e' uno valido (diverso dalla home), altrimenti l'etichetta. Mai
   tutti e due: vince il percorso (vedi IL COLLEGAMENTO FRA I DUE). */
function pagineDelModulo(d) {
    const percorso = String(d.percorso == null ? '' : d.percorso).slice(0, 300).trim();
    const p = D.percorsoPagina(percorso);
    if (p && p !== '/') return [percorso];
    const pagina = String(d.pagina == null ? '' : d.pagina).slice(0, 300).trim();
    return pagina ? [pagina] : [];
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

/* ---------- i limiti del modulo pubblico ---------- */

/* Che cosa farebbe l'iscrizione? Una lettura veloce, FUORI dalla
   transazione, per decidere se contarla nei limiti e (per la
   riconciliazione) se c'e' qualcosa da fare:
     invio      farebbe partire un'email: nuovo indirizzo, evento da
                aggiungere, credenziali che aspettavano ('da inviare' o
                nessuna voce);
     nellEvento la stessa persona e' gia' nell'evento (in qualunque stato).
   Gia' iscritta con le credenziali partite o in coda, o email di
   un'altra persona -> nessun invio. Se nel frattempo cambia qualcosa, al
   massimo si conta un'iscrizione in piu' o in meno: la decisione vera la
   prende la transazione. -> { invio, nellEvento } */
async function situazione(ctx, idEvento, emailNorm, persona) {
    const ind = await ctx.db.collection('indirizzi').doc(emailNorm).get();
    const uid = ind.exists ? String(ind.data().uid || '') : '';
    if (!uid) return { invio: true, nellEvento: false };
    const p = await ctx.db.collection('partecipanti').doc(uid).get();
    if (!p.exists) return { invio: true, nellEvento: false };
    const d = p.data();
    if (!E.stessaPersona(persona, d)) return { invio: false, nellEvento: false };
    if (!(Array.isArray(d.eventi) && d.eventi.indexOf(idEvento) >= 0)) return { invio: true, nellEvento: false };
    const v = (d.invii || {})[idEvento];
    return { invio: !v || v.stato === 'da inviare', nellEvento: true };
}
/* I contatori a finestra fissa di un'ora (limiti/{chiave}_{ora}): prima
   la rete, poi il totale (una rete oltre il suo limite non consuma
   quello di tutti). Senza impronta della rete (la riconciliazione: la
   scheda del sito non tiene l'IP) conta solo il totale.
   -> '' (si puo'), 'rete' o 'totale' */
async function limiteModulo(ctx, impIp) {
    const A = accesso();
    if (impIp && !await A.contaInFinestra(ctx, 'modulorete_' + impIp, maxRete(), ORA)) return 'rete';
    if (!await A.contaInFinestra(ctx, 'modulo_globale', maxOra(), ORA)) return 'totale';
    return '';
}
async function limiteDaVerificare(ctx, impIp) {
    const A = accesso();
    if (impIp && !await A.contaInFinestra(ctx, 'modulorete_' + impIp, maxRete(), ORA)) return 'rete';
    if (!await A.contaInFinestra(ctx, 'daverificare_globale', TETTO_DA_VERIFICARE_ORA, ORA)) return 'totale';
    return '';
}

/* ---------- da verificare ---------- */

function idDaVerificare(riga) {
    return C.impronta(['daverificare', riga.idEvento, riga.motivo, String(riga.email || '').toLowerCase(),
        E.chiaveNome(riga.nome), E.chiaveNome(riga.cognome)].join('|'));
}
/* Una riga per il gestore (vedi DA VERIFICARE). Scrittura con merge:
   la stessa persona di nuovo -> la stessa riga, volte +1, di nuovo da
   vedere. Con `opz.soloNuova` (la riconciliazione) la riga si scrive
   solo se non c'e' ancora: una riga che c'e' gia' (magari gia' vista)
   non si tocca, e il risultato e' null. riga.origine: 'modulo' (il
   predefinito) o 'sito' (annullata o riattivata dal collegamento della
   conferma). -> l'id della riga, o null */
async function segnaDaVerificare(ctx, riga, opz) {
    if (MOTIVI_DA_VERIFICARE.indexOf(riga.motivo) < 0) throw new Error('motivo da verificare sconosciuto');
    const id = idDaVerificare(riga);
    const rif = ctx.db.collection('daVerificare').doc(id);
    const campi = {
        idEvento: riga.idEvento, motivo: riga.motivo, origine: riga.origine === 'sito' ? 'sito' : 'modulo',
        nome: riga.nome || '', cognome: riga.cognome || '', azienda: riga.azienda || '', email: riga.email || '',
        esistente: riga.esistente || '',
        quando: ctx.Timestamp.fromMillis(ctx.adesso())
    };
    if (opz && opz.soloNuova) {
        try {
            await rif.create(Object.assign(campi, { volte: 1, archiviato: false }));
        } catch (e) {
            // 6 = ALREADY_EXISTS: la riga c'e' gia', e resta com'e'
            if (e && (e.code === 6 || /already exists/i.test(String(e.message || '')))) return null;
            throw e;
        }
        return id;
    }
    await rif.set(Object.assign(campi, {
        volte: ctx.FieldValue.increment(1),
        archiviato: false, archiviatoIl: ctx.FieldValue.delete(), archiviatoDa: ctx.FieldValue.delete()
    }), { merge: true });
    return id;
}
function rigaDaVerificareJSON(doc) {
    const d = doc.data();
    return {
        id: doc.id, idEvento: d.idEvento || '', motivo: d.motivo || '', origine: d.origine === 'sito' ? 'sito' : 'modulo',
        nome: d.nome || '', cognome: d.cognome || '', azienda: d.azienda || '', email: d.email || '',
        esistente: d.esistente || '', quando: D.ms(d.quando), volte: Number(d.volte) || 1
    };
}
/* L'elenco per la gestione (azione 'da-verificare'): le righe non
   ancora viste dell'evento, dalla piu' recente. Due filtri di
   uguaglianza: bastano gli indici automatici. -> { righe } */
async function elencoDaVerificare(ctx, idEvento) {
    const id = D.controllaIdEvento(idEvento);
    const snap = await ctx.db.collection('daVerificare').where('idEvento', '==', id).where('archiviato', '==', false)
        .limit(MAX_DA_VERIFICARE).get();
    return { righe: snap.docs.map(rigaDaVerificareJSON).sort((a, b) => (b.quando || 0) - (a.quando || 0)) };
}
/* «Segna come vista» (azione 'da-verificare-archivia'): la riga resta
   (con chi e quando), ma esce dall'elenco. Due volte la stessa: va bene
   (un altro gestore l'ha appena segnata). -> { id } */
async function archiviaDaVerificare(ctx, b, chi) {
    const idEvento = D.controllaIdEvento(b && b.idEvento);
    const id = String((b && b.id) || '');
    if (!RE_ID_DA_VERIFICARE.test(id)) throw C.errore(400, 'Riga non valida.', 'id');
    const rif = ctx.db.collection('daVerificare').doc(id);
    const s = await rif.get();
    if (!s.exists || s.data().idEvento !== idEvento) throw C.errore(404, 'Riga non trovata: aggiorna l\'elenco.', 'riga');
    if (s.data().archiviato !== true) {
        await rif.update({ archiviato: true, archiviatoIl: ctx.Timestamp.fromMillis(ctx.adesso()), archiviatoDa: String(chi || '').slice(0, 254) });
    }
    return { id: id };
}

/* ============================================================
   ISCRIVI DAL MODULO
   iscriviDaModulo(ctx, { email, nome, cognome, azienda, pagina, percorso?, ip? }, opz?)
   -> { esito, idEvento?, invio?, trattenuta?, daVerificare? }
      esito: 'creato' | 'aggiunto' | 'gia-iscritto'   (con idEvento)
             'nessun-evento'   la pagina non porta a nessun evento con
                               l'interruttore acceso: non si fa niente
             'email-non-valida' | 'email-condivisa'   (con idEvento):
                               niente account, niente email, una riga
                               «da verificare» (daVerificare: true se
                               scritta)
             'limite'          solo con `riconcilia`: il limite orario e'
                               raggiunto, non si e' fatto niente
             'incoerente'
      invio: { stato, tipo } l'esito dell'invio subito (vedi
             inviaSubito), oppure null se non c'era niente da mandare
      trattenuta: 'rete' | 'totale' se un limite del modulo ha fermato
             la password (la voce resta 'da inviare')
   opz.evento: { id, dati } l'evento gia' trovato (la riconciliazione, la
             riattivazione): non si cerca dalla pagina.
   opz.riconcilia: la riconciliazione (lib/diretta-riconcilia.js), per
             chi il modulo non ha raggiunto. Diverso dal modulo in
             quattro cose:
               - chi e' gia' nell'evento (in qualunque stato, anche 'da
                 inviare' con il motivo del limite) resta com'e': la
                 riconciliazione recupera solo chi non e' stato iscritto,
                 mai le password trattenute per il gestore;
               - niente IP: conta solo il limite orario complessivo, e
                 oltre si ferma ('limite') invece di creare l'account
                 trattenuto: la scheda torna al giro dopo;
               - niente invio subito: le credenziali vanno 'in coda'
                 (automatiche, dentro il 60% del tetto) e le manda la
                 coda dello stesso giro del cron;
               - le righe «da verificare» solo se non ci sono gia'.
   ============================================================ */
async function iscriviDaModulo(ctx, dati, opz) {
    const o = opz || {};
    const d = dati || {};
    const riconcilia = o.riconcilia === true;
    let evento = o.evento || null;
    if (!evento) {
        const pagine = pagineDelModulo(d);
        if (!pagine.length) return { esito: 'nessun-evento' };
        evento = await eventoDelModulo(ctx, pagine);
        if (!evento) return { esito: 'nessun-evento' };
    }
    const nome = pulito(d.nome, 80);
    const cognome = pulito(d.cognome, 80);
    const azienda = pulito(d.azienda, 120);
    const impIp = riconcilia ? '' : C.improntaIp(d.ip);
    const scritta = pulito(d.email, 254);
    const emailNorm = E.normalizzaEmail(String(d.email == null ? '' : d.email).slice(0, 400));
    const perRiga = { soloNuova: riconcilia };

    // un indirizzo che il modulo del sito ha accettato e la diretta no: al gestore
    if (!E.emailValida(emailNorm)) {
        return Object.assign({ esito: 'email-non-valida', idEvento: evento.id },
            await daVerificare(ctx, impIp, { idEvento: evento.id, motivo: 'email-non-valida', nome, cognome, azienda, email: scritta }, perRiga));
    }

    // i limiti del modulo pubblico, solo per le iscrizioni che farebbero partire un'email
    const sit = await situazione(ctx, evento.id, emailNorm, { nome, cognome });
    if (riconcilia && sit.nellEvento) return { esito: 'gia-iscritto', idEvento: evento.id, invio: null };
    const trattenuta = sit.invio ? await limiteModulo(ctx, impIp) : '';
    if (riconcilia && trattenuta) return { esito: 'limite', idEvento: evento.id, trattenuta: trattenuta };
    const inCodaModulo = { stato: 'in coda', origine: 'modulo', automatica: true, errore: ctx.FieldValue.delete() };

    /* La prenotazione, come nell'import (una transazione su
       indirizzi/{email}: zero account doppi anche con due invii del
       modulo nello stesso istante; controllaNome: un'email che e' gia'
       di un'altra persona non si tocca). Le credenziali vanno 'in coda'
       (automatiche: la parte del tetto del modulo), oppure, oltre i
       limiti, restano 'da inviare' con il motivo per il gestore. Per chi
       e' gia' nell'evento la voce passa in coda solo se aspettava ancora
       le credenziali ('da inviare'): nessuna seconda password. */
    const fatto = await D.prenotaPersona(ctx, evento.id, {
        nome: nome, cognome: cognome, azienda: azienda, emailNorm: emailNorm, origine: 'modulo'
    }, {
        controllaNome: true,
        voce: trattenuta ? { stato: 'da inviare', origine: 'modulo', errore: MOTIVO_TRATTENUTA } : { stato: 'in coda', origine: 'modulo', automatica: true },
        // la riconciliazione non cambia mai una voce che c'e' gia' (vedi sopra)
        voceSeGia: v => (!riconcilia && !trattenuta && (!v || v.stato === 'da inviare')) ? inCodaModulo : null
    });
    if (fatto.tipo === 'incoerente') {
        console.error('[diretta] iscrizione dal modulo: dati incoerenti per un indirizzo (' + evento.id + ')');
        return { esito: 'incoerente', idEvento: evento.id };
    }
    if (fatto.tipo === 'email-condivisa') {
        return Object.assign({ esito: 'email-condivisa', idEvento: evento.id }, await daVerificare(ctx, impIp, {
            idEvento: evento.id, motivo: 'email-condivisa', nome, cognome, azienda, email: emailNorm, esistente: E.nomeCompleto(fatto.dati)
        }, perRiga));
    }
    await D.completaDopoPrenotazione(ctx, fatto, nome, cognome);

    const esito = { esito: fatto.tipo, idEvento: evento.id, invio: null };
    if (trattenuta) {
        // l'account c'e', la password la manda il gestore: niente coda, niente invio
        esito.trattenuta = trattenuta;
        return esito;
    }
    const inCoda = fatto.tipo === 'creato' || fatto.tipo === 'aggiunto' || !!(fatto.voce && fatto.voce.stato === 'in coda');
    if (!inCoda) return esito;
    // la rete di sicurezza: con la coda accesa, il cron manda chi non parte adesso
    await ctx.db.collection('code').doc(evento.id).set({ attiva: true, aggiornato: ctx.adesso() }, { merge: true });
    // la riconciliazione gira dentro il cron: le manda la coda, subito dopo, nello stesso giro
    if (riconcilia) {
        esito.invio = { stato: 'in coda', tipo: '' };
        return esito;
    }
    const invio = require('./diretta-invio');
    let r;
    try {
        r = await invio.inviaSubito(ctx, { uid: fatto.uid, idEvento: evento.id });
    } catch (e) {
        // resta 'in coda' (o 'invio', che il cron fara' diventare 'incerto'): mai un secondo invio da qui
        console.error('[diretta] iscrizione dal modulo: invio subito non riuscito (resta al cron): ' + D.perLog(e));
        r = { stato: 'in coda' };
    }
    esito.invio = { stato: r.stato, tipo: r.tipo || '' };
    return esito;
}
/* la riga «da verificare», se i limiti lo permettono -> { daVerificare:
   true|false, trattenuta? }. Con `opz.soloNuova` (la riconciliazione) una
   riga che c'e' gia' non si tocca e non consuma i limiti. */
async function daVerificare(ctx, impIp, riga, opz) {
    if (opz && opz.soloNuova && (await ctx.db.collection('daVerificare').doc(idDaVerificare(riga)).get()).exists) return { daVerificare: false };
    const limite = await limiteDaVerificare(ctx, impIp);
    if (limite) return { daVerificare: false, trattenuta: limite };
    const id = await segnaDaVerificare(ctx, riga, opz);
    return { daVerificare: !!id };
}

/* ============================================================
   ANNULLATA DAL SITO
   ritiraDaModulo(ctx, { email, nome, cognome, azienda?, pagina, percorso? })
   -> { esito, idEvento?, credenzialiCancellate? }
      esito: 'ritirato'       l'evento e' stato tolto dall'account
             'non-iscritto'   nessun account con questa email in questo
                              evento: niente da fare
             'altra-persona'  nell'evento c'e' un account con questa email
                              ma con un altro nome: non si tocca, e la
                              riga «da verificare» porta quel nome
                              (esistente)
             'nessun-evento'  la pagina non porta a nessun evento (o a due)
   Chi annulla dal collegamento della conferma perde da solo l'accesso a
   QUESTO evento della diretta (gli altri suoi eventi restano). L'evento
   si trova con la stessa regola di dalModulo (paginaCorrisponde:
   percorso, o etichetta), ma fra TUTTI gli eventi non finiti, con
   l'interruttore acceso o spento: l'annullamento vale sempre (anche per
   chi il gestore aveva caricato con il file). Un evento gia' finito non
   si tocca: l'esportazione delle presenze per gli attestati legge chi e'
   nell'evento. In una transazione sul profilo:
     - via l'evento da partecipanti/{uid}.eventi (e da idEvento, se era
       quello; gli altri eventi restano);
     - le credenziali di questo evento NON ancora partite ('da inviare',
       'in coda') si cancellano: nessuno le mandera' piu' (ne' la coda,
       ne' «Invia le credenziali»). Quelle gia' partite restano come
       storia: dicono che la persona una password l'ha gia' ricevuta (una
       password per persona, vedi lib/diretta-invio.js);
     - sul profilo annullatoDalSito.<idEvento> = quando;
     - l'evento in sessioni/{uid}.eventiTolti (D.segnaTolto): le regole
       gli chiudono SUBITO la lettura dell'evento e i segnali di presenza,
       anche con il token di prima (che dice l'evento ancora per un'ora),
       e la pagina aperta lo dice («Non sei più iscritto a questa
       diretta»).
   Poi i claims del token (senza l'evento) e la riga «da verificare»
   'annullata-dal-sito' per il gestore. Il nome e il cognome della scheda
   servono solo a non toccare l'account di un'altra persona con la stessa
   email.
   ============================================================ */
/* L'evento della diretta di questa pagina, interruttore acceso o spento:
   uno solo, non terminato e non gia' finito. -> { id, dati, riservati }
   oppure null */
async function eventoDellaPagina(ctx, pagine) {
    const snap = await ctx.db.collection('eventi').get();
    const ora = ctx.adesso();
    const buoni = snap.docs.filter(s => {
        const d = s.data();
        const fine = D.ms(d.fine);
        if (d.stato === 'terminato' || (fine != null && fine < ora)) return false;
        return pagine.some(p => paginaCorrisponde(p, d.paginaEvento));
    });
    if (buoni.length > 1) {
        console.error('[diretta] dal sito: ' + buoni.length + ' eventi con la stessa pagina (' + buoni.map(s => s.id).join(', ') + '): nessuno');
        return null;
    }
    if (!buoni.length) return null;
    const ris = await ctx.db.collection('eventiRiservati').doc(buoni[0].id).get();
    return { id: buoni[0].id, dati: buoni[0].data(), riservati: ris.exists ? ris.data() : {} };
}

async function ritiraDaModulo(ctx, dati) {
    const d = dati || {};
    const pagine = pagineDelModulo(d);
    if (!pagine.length) return { esito: 'nessun-evento' };
    const evento = await eventoDellaPagina(ctx, pagine);
    if (!evento) return { esito: 'nessun-evento' };
    const idEvento = evento.id;
    const nome = pulito(d.nome, 80);
    const cognome = pulito(d.cognome, 80);
    const emailNorm = E.normalizzaEmail(String(d.email == null ? '' : d.email).slice(0, 400));
    if (!E.emailValida(emailNorm)) return { esito: 'non-iscritto', idEvento: idEvento };
    const ind = await ctx.db.collection('indirizzi').doc(emailNorm).get();
    const uid = ind.exists ? String(ind.data().uid || '') : '';
    if (!uid) return { esito: 'non-iscritto', idEvento: idEvento };
    const rifP = ctx.db.collection('partecipanti').doc(uid);
    const rifS = ctx.db.collection('sessioni').doc(uid);

    const fatto = await D.transazione(ctx, async tx => {
        const [p, s] = await tx.getAll(rifP, rifS);
        if (!p.exists) return { esito: 'non-iscritto' };
        const pd = p.data();
        const eventi = Array.isArray(pd.eventi) ? pd.eventi : [];
        if (eventi.indexOf(idEvento) < 0) return { esito: 'non-iscritto' };
        if (!E.stessaPersona({ nome: nome, cognome: cognome }, pd)) return { esito: 'altra-persona', dati: pd };
        const resto = eventi.filter(x => x !== idEvento);
        const v = (pd.invii || {})[idEvento] || null;
        const cancella = !!(v && STATI_NON_PARTITI.indexOf(v.stato) >= 0);
        const ts = D.adessoTs(ctx);
        const args = [
            new ctx.FieldPath('eventi'), resto,
            new ctx.FieldPath('idEvento'), resto.indexOf(pd.idEvento) >= 0 ? pd.idEvento : (resto[0] || ''),
            new ctx.FieldPath('annullatoDalSito', idEvento), ts,
            new ctx.FieldPath('aggiornato'), ts
        ];
        if (cancella) args.push(new ctx.FieldPath('invii', idEvento), ctx.FieldValue.delete());
        tx.update(rifP, ...args);
        D.segnaTolto(ctx, tx, rifS, s, pd, idEvento, ts);
        return { esito: 'ritirato', dati: pd, cancellate: cancella };
    });
    if (fatto.esito === 'altra-persona') {
        /* Nell'evento c'e' un account con questa email ma con un altro
           nome: forse un collega con lo stesso indirizzo (non si toglie
           qualcun altro), forse la stessa persona scritta in due modi.
           Non si tocca niente, ma il gestore lo deve sapere: la riga
           porta il nome sull'account (esistente). */
        await segnaDaVerificare(ctx, {
            idEvento: idEvento, motivo: 'annullata-dal-sito', origine: 'sito', nome: nome, cognome: cognome,
            azienda: pulito(d.azienda, 120), email: emailNorm, esistente: E.nomeCompleto(fatto.dati)
        });
        return { esito: 'altra-persona', idEvento: idEvento };
    }
    if (fatto.esito !== 'ritirato') return { esito: fatto.esito, idEvento: idEvento };

    // il token, al prossimo rinnovo, senza l'evento (le regole intanto guardano eventiTolti)
    if (fatto.dati.authCreato === true) await D.impostaClaims(ctx, uid);
    await segnaDaVerificare(ctx, {
        idEvento: idEvento, motivo: 'annullata-dal-sito', origine: 'sito',
        nome: fatto.dati.nome || nome, cognome: fatto.dati.cognome || cognome,
        azienda: fatto.dati.azienda || pulito(d.azienda, 120), email: emailNorm
    });
    return { esito: 'ritirato', idEvento: idEvento, credenzialiCancellate: fatto.cancellate };
}

/* ============================================================
   RIATTIVATA DAL SITO
   riattivaDaModulo(ctx, { email, nome, cognome, azienda, pagina, percorso?, ip? })
   -> { esito, idEvento?, ... }
   Chi toglie l'annullamento dal collegamento della conferma (la sua
   scheda torna attiva):
     - interruttore ACCESO: come una nuova iscrizione dal modulo
       (iscriviDaModulo, con i suoi limiti): l'evento torna nel suo
       account, e parte «Sei iscritto anche a…» o le credenziali secondo
       le regole di sempre (lib/diretta-invio.js, tipoInvio). Per la
       diretta le credenziali partite prima dell'annullamento sono la
       storia di QUESTO evento: se la persona non si e' fatta nel
       frattempo una password sua (accesso, «Password dimenticata?»),
       riceve le credenziali con una password nuova, e l'email dice che
       quella di prima non vale piu';
     - interruttore SPENTO: niente di automatico (chi entra lo decide il
       gestore), solo una riga «da verificare» 'riattivata-dal-sito'; se
       e' gia' nell'evento (nessuno l'aveva tolta), niente.
   esito: quello di iscriviDaModulo, oppure 'da-verificare' (interruttore
   spento, riga scritta), 'gia-iscritto', 'nessun-evento'.
   ============================================================ */
async function riattivaDaModulo(ctx, dati) {
    const d = dati || {};
    const pagine = pagineDelModulo(d);
    if (!pagine.length) return { esito: 'nessun-evento' };
    const evento = await eventoDellaPagina(ctx, pagine);
    if (!evento) return { esito: 'nessun-evento' };
    if (D.iscrizioniDi(evento.riservati)) return iscriviDaModulo(ctx, d, { evento: { id: evento.id, dati: evento.dati } });
    const nome = pulito(d.nome, 80);
    const cognome = pulito(d.cognome, 80);
    const emailNorm = E.normalizzaEmail(String(d.email == null ? '' : d.email).slice(0, 400));
    if (E.emailValida(emailNorm) && (await situazione(ctx, evento.id, emailNorm, { nome, cognome })).nellEvento) {
        return { esito: 'gia-iscritto', idEvento: evento.id };
    }
    await segnaDaVerificare(ctx, {
        idEvento: evento.id, motivo: 'riattivata-dal-sito', origine: 'sito',
        nome: nome, cognome: cognome, azienda: pulito(d.azienda, 120), email: E.emailValida(emailNorm) ? emailNorm : pulito(d.email, 254)
    });
    return { esito: 'da-verificare', idEvento: evento.id, daVerificare: true };
}

/* ============================================================
   IL GANCIO PER completa-salva (api/iscrizione-nuova.js)
   dalSito([{ tipo: 'annullata'|'riattivata', email, nome, cognome,
              azienda, pagina }], { ip? })
   -> sempre una promessa che si risolve (mai un errore): { esiti } (uno
      per posto), oppure 'non-configurata' o 'in-corso' (su Vercel).
   Come dalModulo: su Vercel non si aspetta il lavoro (waitUntil), la
   risposta di completa-salva parte subito; fuori da Vercel si aspetta.
   Nei log solo l'evento e gli esiti. `opz.ctx`: un contesto gia'
   pronto (le prove).
   ============================================================ */
async function dalSito(azioni, opz) {
    const elenco = (Array.isArray(azioni) ? azioni : []).filter(a => a && (a.tipo === 'annullata' || a.tipo === 'riattivata')).slice(0, 100);
    if (!elenco.length) return { esiti: [] };
    if (!configurata()) return { esito: 'non-configurata' };
    const lavoro = Promise.resolve().then(async () => {
        const ctx = (opz && opz.ctx) || contesto();
        const esiti = [];
        for (const a of elenco) {
            let r;
            try {
                r = a.tipo === 'annullata'
                    ? await ritiraDaModulo(ctx, a)
                    : await riattivaDaModulo(ctx, Object.assign({}, a, { ip: opz && opz.ip }));
            } catch (e) {
                console.error('[diretta] ' + (a.tipo === 'annullata' ? 'annullamento' : 'riattivazione') + ' dal sito non riuscito: ' + D.perLog(e));
                r = { esito: 'errore' };
            }
            if (r.esito !== 'nessun-evento') {
                const riga = { idEvento: r.idEvento || '', esito: r.esito };
                if (r.credenzialiCancellate != null) riga.credenzialiCancellate = r.credenzialiCancellate;
                if (r.invio) riga.invio = r.invio.stato;
                if (r.trattenuta) riga.trattenuta = r.trattenuta;
                console.log('[diretta] ' + (a.tipo === 'annullata' ? 'annullata' : 'riattivata') + ' dal sito: ' + JSON.stringify(riga));
            }
            esiti.push(r);
        }
        return { esiti: esiti };
    }).catch(e => {
        console.error('[diretta] dal sito: ' + D.perLog(e));
        return { esito: 'errore' };
    });
    if (accesso().lasciaFinire(lavoro)) return { esito: 'in-corso' };
    return lavoro;
}

/* ============================================================
   IL GANCIO PER api/iscrizione-nuova.js
   dalModulo({ email, nome, cognome, azienda, pagina, percorso?, ip? })
   -> sempre una promessa che si risolve (mai un errore):
      { esito } come iscriviDaModulo, oppure 'non-configurata',
      'in-corso' (su Vercel: la risposta del modulo parte subito, il
      lavoro continua con waitUntil) o 'errore' (il motivo nel log).
   `opz.ctx`: un contesto gia' pronto (le prove).
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
    const t0 = Date.now();
    const lavoro = Promise.resolve().then(async () => {
        const ctx = (opz && opz.ctx) || contesto();
        const r = await iscriviDaModulo(ctx, dati);
        if (r.esito !== 'nessun-evento') {
            // solo l'evento e gli esiti: niente email, niente nomi
            const riga = { idEvento: r.idEvento || '', esito: r.esito, invio: r.invio ? r.invio.stato : '', tipo: r.invio ? r.invio.tipo : '' };
            if (r.trattenuta) riga.trattenuta = r.trattenuta;
            if (r.daVerificare != null) riga.daVerificare = r.daVerificare;
            riga.ms = Date.now() - t0;
            console.log('[diretta] iscrizione dal modulo: ' + JSON.stringify(riga));
            if (r.trattenuta && r.esito !== 'email-condivisa' && r.esito !== 'email-non-valida') {
                console.log('[diretta] iscrizione dal modulo: limite ' + (r.trattenuta === 'rete' ? 'della rete' : 'orario complessivo')
                    + ' raggiunto, la password non parte da sola: la manda il gestore (' + (r.idEvento || '') + ')');
            } else if (r.daVerificare === false) {
                console.log('[diretta] iscrizione dal modulo: riga «da verificare» non scritta, limite ' + (r.trattenuta === 'rete' ? 'della rete' : 'orario') + ' raggiunto (' + (r.idEvento || '') + ')');
            }
        }
        return r;
    }).catch(e => {
        console.error('[diretta] iscrizione dal modulo non riuscita: ' + D.perLog(e));
        return { esito: 'errore' };
    });
    /* Su Vercel mai aspettare: la risposta del modulo parte adesso, nello
       stesso tempo per un indirizzo nuovo e per uno gia' iscritto (vedi
       IL GANCIO in testa al file). Fuori da Vercel si aspetta la fine. Se
       su Vercel (VERCEL=1, la mette Vercel) l'aggancio mancasse, il lavoro
       si aspetta lo stesso (niente va perso) e il log lo dice, una volta. */
    if (accesso().lasciaFinire(lavoro)) return { esito: 'in-corso' };
    if (process.env.VERCEL === '1' && !avvisoSenzaAttesa) {
        avvisoSenzaAttesa = true;
        console.error('[diretta] iscrizione dal modulo: waitUntil non disponibile su Vercel: il modulo aspetta la diretta, e il tempo della risposta puo\' dire chi e\' gia\' iscritto');
    }
    return lavoro;
}
let avvisoSenzaAttesa = false;

module.exports = {
    iscriviDaModulo, dalModulo, paginaCorrisponde, pagineDelModulo, eventoDelModulo, configurata, parole,
    ritiraDaModulo, riattivaDaModulo, dalSito, eventoDellaPagina,
    segnaDaVerificare, elencoDaVerificare, archiviaDaVerificare, idDaVerificare,
    MOTIVI_DA_VERIFICARE, MOTIVO_TRATTENUTA, TETTO_DA_VERIFICARE_ORA
};
