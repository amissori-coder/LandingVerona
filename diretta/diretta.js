/* ============================================================
   LA PAGINA DELLA DIRETTA (/diretta/) e la reimpostazione della
   password (/diretta/reimposta.html)
   ------------------------------------------------------------
   Chi entra qui vede una cosa sola: la diretta dell'evento a cui e'
   iscritto. Il percorso:

     accesso (nome utente + password)
       -> il servizio su Vercel verifica e risponde con un gettone
          (api/diretta-accesso, azione 'entra')
       -> accesso a Firebase con quel gettone (signInWithCustomToken)
       -> UNA lettura del proprio profilo e UN SOLO ascolto continuo
          (onSnapshot) sul documento dell'evento: titolo, orari,
          stato, video. Nient'altro resta in ascolto.
       -> attesa (conto alla rovescia) / diretta (video) / pausa /
          fine, secondo lo stato che la regia cambia dalla gestione.
          La pagina passa da una vista all'altra da sola, senza
          ricaricare: quando la regia manda in onda, il video compare.

   PERCHE' COSI'.
   - 1000 persone collegate insieme: il video lo trasmette la web TV
     (o YouTube);
     Firebase porta solo un documento piccolo (l'evento) a ciascuno
     e riceve un segnale di presenza al massimo ogni 60 secondi per
     persona, con partenze sparse a caso (mai 1000 scritture nello
     stesso secondo). Vedi "PRESENZA" piu' sotto.
   - Il link del video non sta nel codice pubblico: il suo
     identificativo arriva dentro il documento dell'evento, che
     Firestore consegna solo agli iscritti, e solo mentre si e' in
     onda (DECISIONI D6).
   - Niente HTML costruito con i dati: nomi, titoli, programma,
     avvisi e risposte del servizio finiscono nella pagina solo come
     testo (textContent). Le icone sono gia' scritte in index.html.
   - La sessione resta aperta sul dispositivo (persistenza locale di
     Firebase): chi chiude e riapre la pagina non rifa' l'accesso.

   Il player e' in player-webtv.js (window.NGBPlayer): la web TV (link
   HLS, file video o player incorporato) e, se il link e' di YouTube,
   player-youtube.js. Per cambiare fornitore si cambiano solo quei file. La configurazione (progetto
   Firebase, indirizzo del servizio, modalita' prove) e' in config.js.
   La pulizia del nome utente e' in nome-utente.js (la stessa del
   servizio).

   Tutti gli ID usati qui sono elencati nel contratto (sezione 6) e
   le prove (diretta/prove/pagina.prova.js) li usano.
   ============================================================ */
(function () {
    'use strict';

    const CFG = window.NGB_DIRETTA_CONFIG || null;
    const NU = window.NGBNomeUtente || null;
    const PAGINA = document.body.getAttribute('data-pagina') || 'diretta';

    // cosa resta nel browser (localStorage): mai password, mai gettoni
    const CHIAVE_SESSIONE = 'ngbDirettaSessione';   // identificativo del dispositivo per "un solo dispositivo"
    const CHIAVE_NOME = 'ngbDirettaNomeUtente';     // per riproporre il nome utente
    const CHIAVE_SEGNALE = 'ngbDirettaPresenza';    // ultimo segnale di presenza (fra schede e ricariche)
    // sessionStorage: quante volte di fila l'SDK di Firebase non si e' scaricato (per allungare le attese)
    const CHIAVE_RIPROVA_SDK = 'ngbDirettaRiprovaSdk';

    const PAGINA_EVENTO_VALIDA = /^\/[a-z0-9_/-]*\/?$/;
    const ID_EVENTO_VALIDO = /^[a-z0-9-]{3,41}$/;
    const SESSIONE_VALIDA = /^[A-Za-z0-9_-]{1,40}$/;

    /* iPhone e iPad (anche l'iPad che si presenta come un Mac): il volume
       si regola solo con i tasti del dispositivo, e lo schermo intero di un
       riquadro qualsiasi non esiste (si usa lo pseudo schermo intero). */
    const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent || '')
        || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || navigator.userAgent || ''));

    /* ---------------------------------------------------------------
       PICCOLI ATTREZZI
       --------------------------------------------------------------- */
    const $ = id => document.getElementById(id);
    const archivio = {
        leggi(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        scrivi(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* navigazione privata: pazienza */ } },
        togli(k) { try { localStorage.removeItem(k); } catch (e) { /* idem */ } }
    };
    function testo(el, t) {
        if (typeof el === 'string') el = $(el);
        if (el) el.textContent = t == null ? '' : String(t);
    }
    function mostra(el, si) {
        if (typeof el === 'string') el = $(el);
        if (el) el.hidden = !si;
    }
    function codiceDi(e) { return String((e && e.code) || ''); }
    function ms(v) {
        if (!v) return 0;
        if (typeof v === 'number') return v;
        if (typeof v.toMillis === 'function') return v.toMillis();
        if (typeof v.seconds === 'number') return v.seconds * 1000;
        const n = Date.parse(v);
        return isNaN(n) ? 0 : n;
    }
    function casuale(max) {
        max = Math.max(0, Math.floor(max));
        if (!max) return 0;
        try {
            const a = new Uint32Array(1);
            crypto.getRandomValues(a);
            return a[0] % (max + 1);
        } catch (e) { return Math.floor(Math.random() * (max + 1)); }
    }
    function idCasuale(byte) {
        const a = new Uint8Array(byte);
        try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < byte; i++) a[i] = Math.floor(Math.random() * 256); }
        return Array.prototype.map.call(a, b => ('0' + b.toString(16)).slice(-2)).join('');
    }
    function due(n) { return (n < 10 ? '0' : '') + n; }
    function parametro(nome) {
        try { return new URLSearchParams(location.search).get(nome) || ''; } catch (e) { return ''; }
    }
    function pulisciNome(t) {
        return NU ? NU.pulisciAccesso(t) : String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }
    function annuncia(t) {
        const el = $('annuncio');
        if (!el) return;
        el.textContent = '';
        setTimeout(() => { el.textContent = t; }, 60);
    }
    /* Toglie dall'indirizzo i parametri gia' usati (?u=, ?dimenticata=1):
       una ricarica non deve rifare la stessa domanda. */
    function togliParametri(nomi) {
        try {
            const u = new URL(location.href);
            let cambiato = false;
            nomi.forEach(n => { if (u.searchParams.has(n)) { u.searchParams.delete(n); cambiato = true; } });
            if (cambiato) history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash);
        } catch (e) { /* browser molto vecchio: resta com'e' */ }
    }

    /* ---------- ora italiana ---------- */
    const FORMATO_ROMA = (() => {
        try {
            return new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
            });
        } catch (e) { return null; }
    })();
    function adessoRoma() {
        const d = new Date();
        if (!FORMATO_ROMA || typeof FORMATO_ROMA.formatToParts !== 'function') {
            return { data: '', minuti: d.getHours() * 60 + d.getMinutes() };
        }
        const p = {};
        FORMATO_ROMA.formatToParts(d).forEach(x => { p[x.type] = x.value; });
        return { data: p.year + '-' + p.month + '-' + p.day, minuti: (Number(p.hour) % 24) * 60 + Number(p.minute) };
    }
    function minutiDa(ora) {
        const m = /^(\d{1,2})[.:](\d{2})$/.exec(String(ora || '').trim());
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    }
    // "09:00" -> "9.00", come scrive il sito
    function oraLeggibile(hhmm) {
        const m = /^(\d{1,2})[.:](\d{2})$/.exec(String(hhmm || '').trim());
        return m ? String(Number(m[1])) + '.' + m[2] : '';
    }
    // "2026-10-02" -> "venerdì 2 ottobre 2026"
    function dataLeggibile(ev) {
        try {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ev.data || ''));
            const opzioni = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
            if (m) {
                const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
                return new Intl.DateTimeFormat('it-IT', Object.assign({ timeZone: 'UTC' }, opzioni)).format(d);
            }
            if (ms(ev.inizio)) return new Intl.DateTimeFormat('it-IT', Object.assign({ timeZone: 'Europe/Rome' }, opzioni)).format(new Date(ms(ev.inizio)));
        } catch (e) { /* senza Intl: niente data estesa */ }
        return '';
    }

    /* ---------------------------------------------------------------
       FIREBASE (SDK modulare 11.6.1 da gstatic, caricato con import())
       --------------------------------------------------------------- */
    const fb = { app: null, auth: null, A: null, F: null, db: null, promessaF: null };

    function indirizzoSdk(nome) {
        return 'https://www.gstatic.com/firebasejs/' + ((CFG && CFG.versioneFirebase) || '11.6.1') + '/' + nome + '.js';
    }
    function configurata() {
        return !!(CFG && CFG.firebase && (CFG.emulatori || (CFG.firebase.apiKey && CFG.firebase.apiKey !== 'DA_COMPILARE')));
    }

    async function preparaAuth() {
        const moduli = await Promise.all([import(indirizzoSdk('firebase-app')), import(indirizzoSdk('firebase-auth'))]);
        const appMod = moduli[0];
        const A = moduli[1];
        fb.A = A;
        fb.app = appMod.initializeApp(CFG.firebase);
        /* initializeAuth e non getAuth: getAuth porta con se' il codice per gli
           accessi con finestra (Google, ecc.) che su telefono scarica script di
           apis.google.com, inutili qui e vietati dalla CSP. La persistenza e'
           locale: la sessione sopravvive alla chiusura della pagina. */
        fb.auth = A.initializeAuth(fb.app, {
            persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence, A.browserSessionPersistence]
        });
        fb.auth.languageCode = 'it';
        if (CFG.emulatori) A.connectAuthEmulator(fb.auth, CFG.emulatori.auth, { disableWarnings: true });
        return A;
    }

    /* Firestore serve solo dopo l'accesso: si scarica in parallelo, senza
       far aspettare la schermata di accesso. */
    function preparaFirestore() {
        if (!fb.promessaF) {
            fb.promessaF = import(indirizzoSdk('firebase-firestore')).then(F => {
                if (!fb.db) {
                    fb.db = F.initializeFirestore(fb.app, { ignoreUndefinedProperties: true });
                    if (CFG.emulatori) F.connectFirestoreEmulator(fb.db, CFG.emulatori.firestore.host, Number(CFG.emulatori.firestore.porta));
                    // i rifiuti attesi (segnale troppo vicino al precedente) non sono errori da mostrare in console
                    try { F.setLogLevel('error'); } catch (e) { /* versioni diverse */ }
                }
                fb.F = F;
                return F;
            }, e => { fb.promessaF = null; throw e; });
        }
        return fb.promessaF;
    }

    /* Chiamata al servizio su Vercel. Mai la password nei log: qui non si
       registra niente; la risposta torna sempre come oggetto. */
    async function chiamaServizio(dati, idToken) {
        const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null;
        try {
            const intestazioni = { 'Content-Type': 'application/json' };
            if (idToken) intestazioni.Authorization = 'Bearer ' + idToken;
            const r = await fetch(CFG.servizio + '/diretta-accesso', {
                method: 'POST', headers: intestazioni, body: JSON.stringify(dati),
                cache: 'no-store', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined
            });
            let j = null;
            try { j = await r.json(); } catch (e) { j = null; }
            if (!j || typeof j !== 'object') j = { ok: false, codice: 'servizio' };
            j.statoHttp = r.status;
            return j;
        } catch (e) {
            return { ok: false, codice: 'rete', statoHttp: 0 };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    /* ---------------------------------------------------------------
       ASSISTENZA (in tutte le viste in cui qualcuno puo' bloccarsi)
       --------------------------------------------------------------- */
    function assistenza() {
        const a = (CFG && CFG.assistenza) || {};
        const email = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(String(a.email || '')) ? String(a.email) : 'info@nextgenerationbusiness.it';
        const telefono = String(a.telefono || '').replace(/[^\d+ ]/g, '').trim();
        return { email: email, telefono: telefono };
    }
    function preparaAssistenza() {
        const a = assistenza();
        document.querySelectorAll('[data-assistenza-link]').forEach(el => el.setAttribute('href', 'mailto:' + a.email));
        document.querySelectorAll('[data-aiuto]').forEach(el => {
            el.textContent = '';
            el.appendChild(document.createTextNode('Serve aiuto? Scrivi a '));
            const posta = document.createElement('a');
            posta.href = 'mailto:' + a.email;
            posta.textContent = a.email;
            el.appendChild(posta);
            if (a.telefono) {
                el.appendChild(document.createTextNode(' oppure chiama il '));
                const tel = document.createElement('a');
                tel.href = 'tel:' + a.telefono.replace(/\s/g, '');
                tel.textContent = a.telefono;
                el.appendChild(tel);
            }
            el.appendChild(document.createTextNode('.'));
        });
    }

    /* ---------------------------------------------------------------
       VISTE
       --------------------------------------------------------------- */
    let vista = 'caricamento';
    function mostraVista(nome, opzioni) {
        const cambiata = vista !== nome;
        vista = nome;
        document.body.setAttribute('data-vista', nome);
        document.querySelectorAll('[data-vista-di]').forEach(el => { el.hidden = el.getAttribute('data-vista-di') !== nome; });
        aggiornaTestata();
        posizionaAvvisoConnessione();
        if (nome !== 'diretta') esciSchermoIntero();
        if (cambiata) window.scrollTo(0, 0);
        if (opzioni && opzioni.fuoco) {
            const t = document.querySelector('#vista-' + nome + ' [data-fuoco]');
            if (t) { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
        }
    }

    function aggiornaTestata() {
        const conPersona = !!(stato.utente && stato.nomePersona) && ['accesso', 'dimenticata', 'caricamento'].indexOf(vista) < 0;
        mostra('blocco-persona', conPersona);
        testo('nome-persona', stato.nomePersona);
        mostra('avviso-anteprima', stato.anteprima && conPersona);
        // in anteprima il pulsante chiude solo l'anteprima (vedi chiudiAnteprima)
        const etichettaEsci = stato.anteprima ? 'Chiudi l\'anteprima' : 'Esci';
        if ($('btn-esci-testo').textContent !== etichettaEsci) testo('btn-esci-testo', etichettaEsci);

        /* L'avviso a tutti della regia (R7). Sta in cima alla pagina e, a
           schermo intero, anche nella striscia sotto il video (la testata li'
           non si vede). Le due scritte non sono "regioni live": un'area che
           compare gia' piena molti lettori di schermo non la annunciano, quindi
           il testo nuovo si annuncia a parte, una volta. */
        const avviso = stato.evento && conPersona ? String(stato.evento.avviso || '').trim().slice(0, 200) : '';
        if ($('avviso-evento-testo').textContent !== avviso) {
            testo('avviso-evento-testo', avviso);
            testo('avviso-intero-testo', avviso);
        }
        mostra('avviso-evento', !!avviso);
        $('avviso-intero').setAttribute('data-attivo', avviso ? '1' : '0');
        if (avviso && avviso !== stato.avvisoMostrato) annuncia('Avviso: ' + avviso);
        stato.avvisoMostrato = avviso;
        const s = stato.evento && conPersona ? stato.evento.stato : '';
        const badge = $('stato-evento');
        badge.setAttribute('data-stato', s || '');
        const testi = { in_onda: 'IN DIRETTA', programmato: 'In programma', pausa: 'In pausa', terminato: 'Terminata' };
        testo('stato-evento-testo', testi[s] || '');
        badge.hidden = !testi[s];
        const titolo = stato.evento && conPersona ? String(stato.evento.titolo || 'Diretta').trim() : 'La diretta degli eventi';
        if ($('titolo-evento').textContent !== titolo) testo('titolo-evento', titolo);
    }

    /* Messaggi a tutta pagina. Tipi fissi, testi scritti qui (mai HTML). */
    const MESSAGGI = {
        'non-configurata': {
            titolo: 'Diretta non ancora configurata',
            testo: 'La pagina della diretta sarà attiva nei giorni dell\'evento. Torna più tardi.'
        },
        'browser': {
            titolo: 'Il browser non è aggiornato',
            testo: 'Il browser non è aggiornato: prova con Chrome, Safari, Edge o Firefox recenti.'
        },
        'rete': {
            titolo: 'Non riusciamo a caricare la diretta',
            testo: 'Controlla la connessione a internet e riprova.',
            azione: 'Riprova', fai: () => location.reload()
        },
        // i componenti della pagina (da gstatic) non sono arrivati: quasi sempre la rete
        'sdk-rete': {
            titolo: 'Non riusciamo a caricare la diretta',
            testo: 'La connessione a internet sembra assente o molto lenta. Riproviamo da soli tra pochi secondi: resta su questa pagina.',
            azione: 'Riprova adesso', fai: () => location.reload()
        },
        'disattivato': {
            titolo: 'Il tuo accesso è stato disattivato',
            testo: 'Se pensi che sia un errore, scrivi all\'assistenza.',
            azione: 'Torna all\'accesso', fai: () => mostraAccesso()
        },
        'altro-dispositivo': {
            titolo: 'Hai aperto la diretta da un altro dispositivo',
            testo: 'Per questo evento si può seguire la diretta da un solo dispositivo alla volta. Se vuoi guardarla qui, accedi di nuovo: l\'altro dispositivo verrà scollegato.',
            azione: 'Accedi di nuovo qui', fai: () => mostraAccesso()
        },
        'accedi-di-nuovo': {
            titolo: 'Accedi di nuovo',
            testo: 'I permessi del tuo account sono cambiati. Accedi di nuovo con il tuo nome utente e la tua password.',
            azione: 'Vai all\'accesso', fai: () => mostraAccesso()
        },
        'nessun-evento': {
            titolo: 'Nessuna diretta per te in questo momento',
            testo: 'Il tuo account non risulta iscritto a nessun evento. Se ti sei iscritto da poco, scrivi all\'assistenza.'
        },
        'evento-assente': {
            titolo: 'Evento non trovato',
            testo: 'L\'evento non è più disponibile. Se pensi che sia un errore, scrivi all\'assistenza.'
        },
        'anteprima-negata': {
            titolo: 'Anteprima non disponibile',
            testo: 'Non è stato possibile aprire l\'anteprima di questo evento. Riprova dalla gestione.'
        }
    };
    function mostraMessaggio(tipo) {
        const m = MESSAGGI[tipo] || MESSAGGI.rete;
        testo('messaggio-titolo', m.titolo);
        testo('messaggio-testo', m.testo);
        const b = $('btn-messaggio-azione');
        if (m.azione) {
            testo(b, m.azione);
            b.onclick = m.fai;
            b.hidden = false;
        } else {
            b.onclick = null;
            b.hidden = true;
        }
        mostraVista('messaggio', { fuoco: true });
    }

    /* ---------------------------------------------------------------
       STATO DELLA PAGINA
       --------------------------------------------------------------- */
    const stato = {
        utente: null,             // l'utente Firebase collegato
        nomePersona: '',
        nomeUtente: '',
        anteprima: false,         // un gestore che guarda come un partecipante
        idEvento: '',
        evento: null,             // i dati dell'evento (dall'ascolto)
        annullaAscolto: null,
        generazione: 0,           // ogni cambio di utente invalida i lavori in corso
        sessioneIniziata: false,  // in questa pagina c'e' stato un utente collegato
        motivoUscita: null,       // null | 'esci' | 'messaggio'
        appenaEntrato: false,
        /* L'identificativo di questo dispositivo per "un solo dispositivo",
           tenuto ANCHE in memoria: se il browser non concede localStorage
           (cookie e dati dei siti bloccati), la sessione non deve cambiare a
           ogni segnale di presenza (le regole la confrontano ogni volta). */
        sessione: '',
        // l'evento scelto dal servizio all'accesso: la pagina lo preferisce,
        // cosi' "un solo dispositivo" vale sull'evento che la persona guarda
        eventoAccesso: '',
        avvisoMostrato: '',
        timerConto: null,
        timerProgramma: null,
        firmaProgramma: ''
    };

    function smettiDiAscoltare() {
        if (stato.annullaAscolto) { try { stato.annullaAscolto(); } catch (e) { /* gia' chiuso */ } }
        stato.annullaAscolto = null;
    }
    function fermaTutto() {
        smettiDiAscoltare();
        fermaPresenza();
        fermaConto();
        clearInterval(stato.timerProgramma);
        stato.timerProgramma = null;
        distruggiPlayer();
        stato.evento = null;
        stato.idEvento = '';
        stato.firmaProgramma = '';
        rete.daCache = false;
        aggiornaConnessione();
    }

    /* ---------------------------------------------------------------
       ACCESSO
       --------------------------------------------------------------- */
    const accesso = { inCorso: false, attesaFino: 0, timerAttesa: null, errori: 0 };

    function msg(id, t, tipo) {
        const el = $(id);
        if (!el) return;
        el.textContent = t || '';
        if (tipo) el.setAttribute('data-tipo', tipo); else el.removeAttribute('data-tipo');
    }

    function mostraAccesso(opzioni) {
        opzioni = opzioni || {};
        mostraVista('accesso', { fuoco: false });
        const campo = $('campo-nome-utente');
        const daLink = pulisciNome(parametro('u'));
        if (opzioni.nome) campo.value = opzioni.nome;
        else if (!campo.value) campo.value = daLink || archivio.leggi(CHIAVE_NOME) || '';
        aggiornaAiutoNome();
        $('campo-password').value = '';
        if (!accesso.attesaFino) {
            if (opzioni.messaggio) msg('msg-accesso', opzioni.messaggio, opzioni.tipo || 'info');
            else msg('msg-accesso', '');
        }
        ripristinaBottoneEntra();
        // sul computer il cursore e' gia' nel campo giusto; sul telefono no: la
        // tastiera che si apre da sola coprirebbe le spiegazioni della carta
        if (!puntatoreGrossolano()) {
            const bersaglio = campo.value ? $('campo-password') : campo;
            try { bersaglio.focus({ preventScroll: true }); } catch (e) { bersaglio.focus(); }
        }
    }
    function puntatoreGrossolano() {
        try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
    }

    function mostraDimenticata() {
        mostraVista('dimenticata', { fuoco: false });
        const id = $('campo-identificativo');
        // dal link "password dimenticata" delle email (?u=mariorossi&dimenticata=1)
        // il campo di accesso e' ancora vuoto: il nome utente arriva dal link
        if (!id.value) id.value = $('campo-nome-utente').value.trim() || pulisciNome(parametro('u'));
        msg('msg-dimenticata', '');
        if (!puntatoreGrossolano()) { try { id.focus({ preventScroll: true }); } catch (e) { id.focus(); } }
    }

    /* Sotto il campo: che nome utente verra' usato davvero (chi scrive
       "Mario Rossi" vede che diventa mariorossi, e non si spaventa). */
    function aggiornaAiutoNome() {
        const grezzo = $('campo-nome-utente').value;
        const aiuto = $('aiuto-nome-utente');
        aiuto.textContent = '';
        if (grezzo.indexOf('@') >= 0) {
            aiuto.textContent = 'Scrivi il nome utente che trovi nell\'email, non l\'indirizzo email.';
            return;
        }
        const pulito = pulisciNome(grezzo);
        if (grezzo.trim() && pulito && pulito !== grezzo.trim()) {
            aiuto.appendChild(document.createTextNode('Entrerai come '));
            const b = document.createElement('strong');
            b.textContent = pulito;
            aiuto.appendChild(b);
            return;
        }
        aiuto.textContent = 'Di solito è il nome e il cognome attaccati, tutto minuscolo.';
    }

    function ripristinaBottoneEntra() {
        const b = $('btn-entra');
        if (accesso.attesaFino) return;
        b.disabled = false;
        testo(b.querySelector('.btn-testo'), 'Entra');
    }

    function durata(s) {
        s = Math.max(0, Math.ceil(s));
        const m = Math.floor(s / 60);
        return m ? m + ':' + due(s % 60) : s + ' s';
    }

    /* Troppi tentativi: il bottone resta spento e conta i secondi. Il
       messaggio (letto dai lettori di schermo) si scrive una volta sola;
       il conto scorre sul bottone, che non viene annunciato a ogni secondo. */
    function avviaAttesaAccesso(secondi) {
        secondi = Math.max(1, Math.min(3600, Number(secondi) || 60));
        accesso.attesaFino = Date.now() + secondi * 1000;
        msg('msg-accesso', 'Troppi tentativi non riusciti: per sicurezza devi aspettare prima di riprovare. '
            + 'Se non ricordi la password, usa «Password dimenticata?» qui sotto.', 'errore');
        const b = $('btn-entra');
        b.disabled = true;
        const giro = () => {
            const resto = (accesso.attesaFino - Date.now()) / 1000;
            if (resto <= 0) {
                clearInterval(accesso.timerAttesa);
                accesso.timerAttesa = null;
                accesso.attesaFino = 0;
                ripristinaBottoneEntra();
                msg('msg-accesso', 'Ora puoi riprovare.', 'info');
                return;
            }
            testo(b.querySelector('.btn-testo'), 'Riprova tra ' + durata(resto));
        };
        clearInterval(accesso.timerAttesa);
        accesso.timerAttesa = setInterval(giro, 1000);
        giro();
    }

    async function entra() {
        if (accesso.inCorso || accesso.attesaFino) return;
        const campo = $('campo-nome-utente');
        const campoPw = $('campo-password');
        const grezzo = campo.value;
        const password = campoPw.value;
        if (grezzo.indexOf('@') >= 0) {
            msg('msg-accesso', 'Scrivi il nome utente che trovi nell\'email, non l\'indirizzo email.', 'errore');
            campo.focus();
            return;
        }
        const nomeUtente = pulisciNome(grezzo);
        if (!nomeUtente) { msg('msg-accesso', 'Scrivi il tuo nome utente.', 'errore'); campo.focus(); return; }
        if (!password) { msg('msg-accesso', 'Scrivi la password.', 'errore'); campoPw.focus(); return; }

        accesso.inCorso = true;
        const b = $('btn-entra');
        b.disabled = true;
        testo(b.querySelector('.btn-testo'), 'Accesso in corso…');
        msg('msg-accesso', '');
        /* L'evento del link dell'email (&e=, R4) va anche al servizio: e' su
           quello che il servizio decide "un solo dispositivo". Senza, con due
           eventi il servizio potrebbe decidere su un evento e la pagina
           mostrare l'altro. */
        const dalLink = parametro('e');
        const r = await chiamaServizio({
            azione: 'entra', nomeUtente: nomeUtente, password: password,
            idEvento: ID_EVENTO_VALIDO.test(dalLink) ? dalLink : undefined
        });
        if (r.ok && r.token) {
            ricordaSessione(r.sessione);
            stato.eventoAccesso = ID_EVENTO_VALIDO.test(String(r.idEvento || '')) ? String(r.idEvento) : '';
            archivio.scrivi(CHIAVE_NOME, pulisciNome(r.nomeUtente || nomeUtente));
            stato.appenaEntrato = true;
            accesso.errori = 0;
            try {
                await fb.A.signInWithCustomToken(fb.auth, r.token);
                campoPw.value = '';
                // da qui prosegue onAuthStateChanged
            } catch (e) {
                stato.appenaEntrato = false;
                msg('msg-accesso', 'Non è stato possibile completare l\'accesso. Riprova tra qualche secondo.', 'errore');
            }
        } else {
            erroreAccesso(r);
        }
        accesso.inCorso = false;
        if (vista === 'accesso') ripristinaBottoneEntra();
    }

    function erroreAccesso(r) {
        const codice = String(r.codice || '');
        if (codice === 'attendi' || r.statoHttp === 429) { accesso.errori++; avviaAttesaAccesso(r.attesaSecondi); return; }
        if (codice === 'disattivato') {
            msg('msg-accesso', 'Il tuo accesso è stato disattivato. Scrivi all\'assistenza.', 'errore');
            return;
        }
        // password giusta, ma la persona non e' (piu') iscritta a nessun evento
        // (per esempio dopo «Togli da questo evento» in gestione)
        if (codice === 'nessun-evento') {
            msg('msg-accesso', 'Non risulti iscritto a nessuna diretta. Scrivi all\'assistenza.', 'errore');
            return;
        }
        if (codice === 'credenziali' || r.statoHttp === 401) {
            accesso.errori++;
            let t = 'Nome utente o password non corretti.';
            const rimasti = Number(r.rimasti);
            if (r.rimasti != null && isFinite(rimasti) && rimasti > 0 && rimasti <= 3) {
                t += rimasti === 1 ? ' Ti resta un tentativo, poi dovrai attendere qualche minuto.'
                    : ' Ti restano ' + rimasti + ' tentativi, poi dovrai attendere qualche minuto.';
            }
            // dopo due errori, i due sbagli piu' comuni (DECISIONI R5)
            if (accesso.errori >= 2) {
                t += ' Controlla il nome utente nell\'email: può finire con un numero (es. mariorossi2).'
                    + ' La password distingue maiuscole e minuscole: copiala dall\'email.';
            }
            t += ' Se il problema continua, scrivi all\'assistenza.';
            msg('msg-accesso', t, 'errore');
            $('campo-password').select();
            return;
        }
        // il servizio spiega perche' (lento, oppure molti accessi insieme dalla stessa rete)
        if (codice === 'riprova') { msg('msg-accesso', (r.msg && String(r.msg).length < 200 ? String(r.msg) : 'Il servizio è lento: riprova tra qualche secondo.'), 'errore'); return; }
        if (codice === 'rete') {
            msg('msg-accesso', 'Non riusciamo a raggiungere il servizio: controlla la connessione a internet e riprova.', 'errore');
            return;
        }
        msg('msg-accesso', 'Errore del servizio: riprova tra poco. Se il problema continua, scrivi all\'assistenza.', 'errore');
    }

    async function inviaReimpostazione() {
        const campo = $('campo-identificativo');
        const identificativo = campo.value.trim();
        if (!identificativo) { msg('msg-dimenticata', 'Scrivi il tuo nome utente oppure la tua email.', 'errore'); campo.focus(); return; }
        const b = $('btn-invia-reset');
        if (b.disabled) return;
        b.disabled = true;
        testo(b.querySelector('.btn-testo'), 'Invio in corso…');
        msg('msg-dimenticata', '');
        const r = await chiamaServizio({ azione: 'password-dimenticata', identificativo: identificativo.slice(0, 254) });
        b.disabled = false;
        testo(b.querySelector('.btn-testo'), 'Invia il collegamento');
        if (r.ok) {
            msg('msg-dimenticata', 'Se l\'account esiste, ti abbiamo scritto all\'indirizzo email con cui ti sei iscritto. '
                + 'Il collegamento vale un\'ora. Controlla anche la posta indesiderata.', 'ok');
        } else if (r.codice === 'rete') {
            msg('msg-dimenticata', 'Non riusciamo a raggiungere il servizio: controlla la connessione a internet e riprova.', 'errore');
        } else {
            msg('msg-dimenticata', 'In questo momento non riusciamo a inviare il collegamento: riprova tra qualche minuto.', 'errore');
        }
    }

    function preparaModuli() {
        $('form-accesso').addEventListener('submit', e => { e.preventDefault(); entra(); });
        $('campo-nome-utente').addEventListener('input', () => {
            aggiornaAiutoNome();
            if (!accesso.attesaFino && $('msg-accesso').getAttribute('data-tipo') === 'errore') msg('msg-accesso', '');
        });
        $('btn-mostra-password').addEventListener('click', () => {
            const pw = $('campo-password');
            const visibile = pw.type === 'password';
            pw.type = visibile ? 'text' : 'password';
            const b = $('btn-mostra-password');
            b.setAttribute('aria-pressed', String(visibile));
            b.setAttribute('aria-label', visibile ? 'Nascondi la password' : 'Mostra la password');
        });
        $('link-dimenticata').addEventListener('click', e => { e.preventDefault(); mostraDimenticata(); });
        $('form-dimenticata').addEventListener('submit', e => { e.preventDefault(); inviaReimpostazione(); });
        $('link-torna-accesso').addEventListener('click', e => { e.preventDefault(); togliParametri(['dimenticata']); mostraAccesso(); });
    }

    /* ---------------------------------------------------------------
       CHI E' COLLEGATO
       --------------------------------------------------------------- */
    function nomeDaMostrare(p) {
        return [p.nome, p.cognome].map(x => String(x || '').trim()).filter(Boolean).join(' ') || String(p.nomeUtente || '');
    }

    async function gestisciUtente(utente) {
        const gen = ++stato.generazione;
        fermaTutto();
        stato.utente = utente || null;
        stato.anteprima = false;

        if (!utente) {
            sdkCaricato(); // la vista di accesso non usa Firestore
            stato.nomePersona = '';
            stato.nomeUtente = '';
            stato.sessione = '';
            stato.eventoAccesso = '';
            const motivo = stato.motivoUscita;
            stato.motivoUscita = null;
            if (motivo === 'messaggio') {
                // resta il messaggio gia' mostrato (account disattivato, altro dispositivo...)
                stato.sessioneIniziata = false;
                aggiornaTestata();
                return;
            }
            if (motivo !== 'esci' && stato.sessioneIniziata) {
                // T9: la sessione e' finita da sola (password cambiata, account disattivato...)
                stato.sessioneIniziata = false;
                mostraAccesso({ messaggio: 'La sessione è scaduta: accedi di nuovo.', tipo: 'info' });
                return;
            }
            stato.sessioneIniziata = false;
            if (parametro('dimenticata') === '1') mostraDimenticata();
            else mostraAccesso();
            return;
        }

        stato.sessioneIniziata = true;
        stato.motivoUscita = null;
        mostraVista('caricamento');
        preparaFirestore().catch(() => { /* gestito sotto */ });

        // Il token si rinnova subito (se l'account e' stato disattivato o la
        // password e' cambiata, qui ce ne si accorge); senza rete si usa quello
        // che c'e': la pagina deve aprirsi anche con una connessione ballerina.
        let risultato = null;
        try {
            risultato = await utente.getIdTokenResult(!stato.appenaEntrato);
        } catch (e) {
            if (codiceDi(e) === 'auth/network-request-failed') {
                try { risultato = await utente.getIdTokenResult(false); } catch (e2) { risultato = null; }
            }
            if (!risultato) {
                if (gen !== stato.generazione) return;
                // accesso non piu' valido: T9
                stato.appenaEntrato = false;
                try { await fb.A.signOut(fb.auth); } catch (e3) { /* gia' fuori */ }
                return;
            }
        }
        stato.appenaEntrato = false;
        if (gen !== stato.generazione) return;
        const claims = (risultato && risultato.claims) || {};

        if (claims.gestore === true) { avviaGestore(utente, claims, gen); return; }
        await avviaPartecipante(utente, claims, gen);
    }

    /* Le letture iniziali: senza rete si riprova da soli ogni 5 secondi,
       con l'avviso di connessione (la pagina non resta bianca). */
    async function conRiprova(fn, gen) {
        const pulisci = () => { if (rete.erroreLettura) { rete.erroreLettura = false; aggiornaConnessione(); } };
        for (;;) {
            try {
                const r = await fn();
                pulisci();
                return r;
            } catch (e) {
                const c = codiceDi(e);
                const diRete = c === 'unavailable' || c === 'deadline-exceeded' || (!c && navigator.onLine === false);
                if (!diRete) { pulisci(); throw e; }
                rete.erroreLettura = true;
                aggiornaConnessione();
                await new Promise(r => setTimeout(r, 5000));
                if (gen !== stato.generazione) { pulisci(); throw new Error('superato'); }
            }
        }
    }

    function avviaGestore(utente, claims, gen) {
        stato.nomePersona = claims.email || utente.email || 'Gestore';
        const id = parametro('anteprima');
        if (!ID_EVENTO_VALIDO.test(id)) {
            sdkCaricato();
            mostraVista('gestore', { fuoco: true });
            return;
        }
        // anteprima: la stessa pagina dei partecipanti, senza presenze
        stato.anteprima = true;
        stato.nomePersona = 'Anteprima (gestore)';
        preparaFirestore().then(() => {
            sdkCaricato();
            if (gen !== stato.generazione) return;
            ascoltaEvento(id, true, gen);
        }, e => { if (gen === stato.generazione) sdkNonCaricato(e); });
    }

    async function avviaPartecipante(utente, claims, gen) {
        let F;
        try { F = await preparaFirestore(); } catch (e) { if (gen === stato.generazione) sdkNonCaricato(e); return; }
        sdkCaricato();
        if (gen !== stato.generazione) return;

        let profilo;
        try {
            profilo = await conRiprova(() => F.getDoc(F.doc(fb.db, 'partecipanti', utente.uid)), gen);
        } catch (e) {
            if (gen !== stato.generazione) return;
            if (codiceDi(e) === 'permission-denied') { await esciConMessaggio('accedi-di-nuovo'); return; }
            mostraMessaggio('rete');
            return;
        }
        if (gen !== stato.generazione) return;
        const p = profilo.exists() ? profilo.data() : null;
        if (!p) { await esciConMessaggio('nessun-evento'); return; }
        if (p.stato === 'disattivato') { await esciConMessaggio('disattivato'); return; }

        stato.nomePersona = nomeDaMostrare(p);
        stato.nomeUtente = String(p.nomeUtente || '');
        if (stato.nomeUtente) archivio.scrivi(CHIAVE_NOME, stato.nomeUtente);

        // R24: il link dell'email e' di un'altra persona?
        const daLink = pulisciNome(parametro('u'));
        togliParametri(['u']);
        if (daLink && stato.nomeUtente && daLink !== stato.nomeUtente) {
            mostraVista('caricamento');
            const cambia = await chiediConferma({
                titolo: 'Sei collegato come ' + stato.nomeUtente,
                testo: 'Il collegamento che hai aperto è per ' + daLink + '. Vuoi entrare come ' + daLink + '?',
                si: 'Entra come ' + daLink,
                no: 'Resta come ' + stato.nomeUtente
            });
            if (gen !== stato.generazione) return;
            if (cambia) { await esci(daLink); return; }
        }

        let eventi = Array.isArray(p.eventi) ? p.eventi.filter(x => ID_EVENTO_VALIDO.test(String(x))) : [];
        if (!eventi.length && ID_EVENTO_VALIDO.test(String(p.idEvento || ''))) eventi = [p.idEvento];
        if (!eventi.length) { mostraMessaggio('nessun-evento'); return; }

        /* T8: il profilo dice che la persona e' iscritta, il suo token no
           (i permessi sono cambiati da poco): si chiede al servizio di
           allinearli, poi si rinnova il token. */
        const nelToken = Array.isArray(claims.eventi) ? claims.eventi : [];
        const candidati = eventi.slice(0, 5);
        if (candidati.some(id => nelToken.indexOf(id) < 0)) {
            const esito = await aggiornaPermessi();
            if (gen !== stato.generazione) return;
            if (esito === 'disattivato') { await esciConMessaggio('disattivato'); return; }
            // se non riesce, si prova comunque: l'ascolto dell'evento dira' se serve rientrare
        }

        const id = await scegliEvento(F, eventi, p.idEvento, gen);
        if (gen !== stato.generazione) return;
        ascoltaEvento(id, false, gen);
    }

    /* Piu' eventi: in onda > il prossimo in programma > il piu' recente.
       Il link dell'email (&e=) ha la precedenza se e' uno dei suoi (R4). */
    async function scegliEvento(F, eventi, idPreferito, gen) {
        // prima il link dell'email, poi l'evento su cui il servizio ha deciso all'accesso
        const preferito = [parametro('e'), stato.eventoAccesso].filter(x => ID_EVENTO_VALIDO.test(x) && eventi.indexOf(x) >= 0)[0];
        if (preferito) return preferito;
        if (eventi.length <= 1) return eventi[0];
        const candidati = eventi.slice(0, 5);
        const letti = await Promise.all(candidati.map(id =>
            F.getDoc(F.doc(fb.db, 'eventi', id)).then(s => (s.exists() ? Object.assign({ id: id }, s.data()) : null), () => null)));
        if (gen !== stato.generazione) return eventi[0];
        const validi = letti.filter(Boolean);
        if (!validi.length) return eventi.indexOf(idPreferito) >= 0 ? idPreferito : eventi[0];
        const inOnda = validi.filter(e => e.stato === 'in_onda' || e.stato === 'pausa');
        if (inOnda.length) return inOnda[0].id;
        const adesso = Date.now();
        const prossimi = validi.filter(e => e.stato === 'programmato' && ms(e.fine) > adesso)
            .sort((a, b) => ms(a.inizio) - ms(b.inizio));
        if (prossimi.length) return prossimi[0].id;
        return validi.slice().sort((a, b) => ms(b.inizio) - ms(a.inizio))[0].id;
    }

    /* 'ok' | 'disattivato' | 'riprova' (rete o intoppo del servizio: non
       si esce, si riprova) | 'errore' (sessione da rifare) */
    async function aggiornaPermessi() {
        const u = fb.auth && fb.auth.currentUser;
        if (!u) return 'errore';
        const diRete = e => codiceDi(e) === 'auth/network-request-failed';
        let token;
        try { token = await u.getIdToken(); } catch (e) { return diRete(e) ? 'riprova' : 'errore'; }
        const r = await chiamaServizio({ azione: 'aggiorna-permessi' }, token);
        if (!r.ok) {
            if (r.codice === 'disattivato') return 'disattivato';
            if (r.codice === 'riprova' || r.codice === 'rete' || r.statoHttp === 0 || r.statoHttp >= 500) return 'riprova';
            return 'errore';
        }
        try { await u.getIdToken(true); } catch (e) { return diRete(e) ? 'riprova' : 'errore'; }
        return 'ok';
    }

    function dimenticaSessione() {
        archivio.togli(CHIAVE_SESSIONE);
        stato.sessione = '';
        stato.eventoAccesso = '';
    }

    async function esci(nomeDaProporre) {
        stato.motivoUscita = 'esci';
        fermaTutto();
        dimenticaSessione();
        try { if (fb.auth) await fb.A.signOut(fb.auth); } catch (e) { /* fuori comunque */ }
        stato.utente = null;
        stato.nomePersona = '';
        mostraAccesso(nomeDaProporre ? { nome: nomeDaProporre } : {});
    }

    /* Anteprima del gestore: la sessione di Firebase e' la stessa della
       gestione (stessa app, stesso browser: e' cosi' che l'anteprima si apre
       senza un nuovo accesso). Un signOut qui chiuderebbe anche la regia
       aperta nell'altra scheda, magari durante la diretta: il pulsante
       invece chiude solo l'anteprima. */
    function chiudiAnteprima() {
        try { window.close(); } catch (e) { /* non chiudibile: sotto */ }
        // una scheda aperta a mano (non da «Vedi come un partecipante») il
        // browser non la lascia chiudere: si torna alla gestione
        setTimeout(() => { if (!window.closed) location.href = '/diretta/gestione/'; }, 300);
    }

    async function esciConMessaggio(tipo) {
        stato.motivoUscita = 'messaggio';
        fermaTutto();
        dimenticaSessione();
        mostraMessaggio(tipo);
        try { if (fb.auth && fb.auth.currentUser) await fb.A.signOut(fb.auth); else stato.motivoUscita = null; }
        catch (e) { stato.motivoUscita = null; }
    }

    /* ---------------------------------------------------------------
       L'EVENTO: UN SOLO ASCOLTO CONTINUO
       --------------------------------------------------------------- */
    function ascoltaEvento(id, permessiGiaRinnovati, gen) {
        smettiDiAscoltare();
        stato.idEvento = id;
        const F = fb.F;
        stato.annullaAscolto = F.onSnapshot(F.doc(fb.db, 'eventi', id), { includeMetadataChanges: true }, snap => {
            if (gen !== stato.generazione) return;
            segnaCache(snap.metadata.fromCache);
            if (!snap.exists()) {
                if (!snap.metadata.fromCache) mostraMessaggio('evento-assente');
                return;
            }
            aggiornaEvento(snap.data());
        }, async err => {
            if (gen !== stato.generazione) return;
            stato.annullaAscolto = null;
            if (codiceDi(err) === 'permission-denied') {
                if (stato.anteprima) { mostraMessaggio('anteprima-negata'); return; }
                if (!permessiGiaRinnovati) {
                    // T8: un solo nuovo tentativo dopo aver riallineato i permessi
                    const esito = await aggiornaPermessi();
                    if (gen !== stato.generazione) return;
                    if (esito === 'ok') { ascoltaEvento(id, true, gen); return; }
                    if (esito === 'riprova') {
                        // rete o servizio momentaneamente giu': non si esce, si riprova tra poco
                        rete.erroreLettura = true;
                        aggiornaConnessione();
                        setTimeout(() => {
                            if (gen !== stato.generazione) return;
                            rete.erroreLettura = false;
                            ascoltaEvento(id, false, gen);
                        }, 5000);
                        return;
                    }
                    await esciConMessaggio(esito === 'disattivato' ? 'disattivato' : 'accedi-di-nuovo');
                    return;
                }
                await esciConMessaggio('accedi-di-nuovo');
                return;
            }
            // altro errore (raro): si riprova tra poco, con l'avviso di connessione
            rete.erroreLettura = true;
            aggiornaConnessione();
            setTimeout(() => {
                if (gen !== stato.generazione) return;
                rete.erroreLettura = false;
                ascoltaEvento(id, permessiGiaRinnovati, gen);
            }, 5000);
        });
    }

    function aggiornaEvento(d) {
        stato.evento = d;
        const titolo = String(d.titolo || 'Diretta').trim();
        document.title = titolo + ' · Diretta | Next Generation Business';
        aggiornaDettagli(d);
        aggiornaProgramma(d, false);
        aggiornaLinkEvento(d.paginaEvento);
        if (!stato.anteprima) avviaPresenza();

        const primaVolta = vista === 'caricamento';
        if (d.stato === 'in_onda') entraInDiretta(d, primaVolta);
        else if (d.stato === 'pausa') mostraPausa(d, primaVolta);
        else if (d.stato === 'terminato') mostraFine(d, primaVolta);
        else mostraAttesa(d, primaVolta);
        aggiornaTestata();
    }

    function aggiornaDettagli(d) {
        const data = dataLeggibile(d);
        const oi = oraLeggibile(d.oraInizio);
        const of = oraLeggibile(d.oraFine);
        let quando = data;
        if (oi && of) quando += (quando ? ' · ' : '') + 'dalle ' + oi + ' alle ' + of + ' (ora italiana)';
        else if (oi) quando += (quando ? ' · ' : '') + 'alle ' + oi + ' (ora italiana)';
        testo('attesa-quando', quando);
        mostra('attesa-quando-riga', !!quando);
        const luogo = String(d.luogo || '').trim();
        testo('attesa-luogo', luogo);
        mostra('attesa-luogo-riga', !!luogo);
        testo('fine-titolo-evento', String(d.titolo || 'l\'evento'));
    }

    function aggiornaLinkEvento(percorso) {
        const valido = typeof percorso === 'string' && PAGINA_EVENTO_VALIDA.test(percorso) && percorso.length < 120;
        ['link-pagina-evento', 'fine-link-evento'].forEach(id => {
            const a = $(id);
            if (valido) a.setAttribute('href', percorso);
            a.hidden = !valido;
        });
        mostra('piede-evento-sep', valido);
    }

    /* Il programma: disegnato solo se cambia (l'ascolto riceve anche eventi
       che non toccano il programma). Durante la diretta si evidenzia la voce
       in corso, ricalcolata ogni minuto. */
    function aggiornaProgramma(d, forza) {
        const voci = Array.isArray(d.programma) ? d.programma.slice(0, 40) : [];
        const adesso = adessoRoma();
        const firma = JSON.stringify([voci, d.stato, d.data, d.oraFine, adesso.data, adesso.minuti]);
        if (!forza && firma === stato.firmaProgramma) return;
        stato.firmaProgramma = firma;
        disegnaProgramma($('programma'), voci, d, adesso);
        disegnaProgramma($('programma-diretta'), voci, d, adesso);
        mostra('carta-programma', voci.length > 0);
        mostra('carta-programma-diretta', voci.length > 0);
    }
    function disegnaProgramma(el, voci, d, adesso) {
        el.textContent = '';
        const oggi = (d.stato === 'in_onda' || d.stato === 'pausa') && d.data && d.data === adesso.data;
        const fine = minutiDa(d.oraFine);
        voci.forEach((v, i) => {
            const li = document.createElement('li');
            li.className = 'voce-programma';
            const ora = document.createElement('span');
            ora.className = 'voce-ora';
            ora.textContent = String((v && v.ora) || '').slice(0, 10);
            const titolo = document.createElement('span');
            titolo.className = 'voce-titolo';
            titolo.textContent = String((v && v.titolo) || '').slice(0, 160);
            li.appendChild(ora);
            li.appendChild(titolo);
            if (oggi) {
                const da = minutiDa(v && v.ora);
                const succ = i + 1 < voci.length ? minutiDa(voci[i + 1] && voci[i + 1].ora) : fine;
                if (da != null && adesso.minuti >= da && (succ == null || adesso.minuti < succ)) {
                    li.classList.add('in-corso');
                    li.setAttribute('aria-current', 'true');
                    const e = document.createElement('span');
                    e.className = 'etichetta-in-corso';
                    e.textContent = 'In corso';
                    titolo.appendChild(e);
                }
            }
            el.appendChild(li);
        });
    }

    /* ---------- attesa ---------- */
    function mostraAttesa(d, primaVolta) {
        distruggiPlayer();
        clearInterval(stato.timerProgramma);
        stato.timerProgramma = null;
        if (vista !== 'attesa') mostraVista('attesa', { fuoco: primaVolta });
        avviaConto();
    }
    function fermaConto() { clearInterval(stato.timerConto); stato.timerConto = null; }
    function avviaConto() {
        if (!stato.timerConto) stato.timerConto = setInterval(aggiornaConto, 1000);
        aggiornaConto();
    }
    function aggiornaConto() {
        const d = stato.evento;
        const inizio = d ? ms(d.inizio) : 0;
        const conto = $('conto-alla-rovescia');
        if (!inizio) {
            conto.hidden = true;
            testo('attesa-titolo', 'La diretta non è ancora iniziata');
            return;
        }
        conto.hidden = false;
        const resto = inizio - Date.now();
        if (resto <= 0) {
            ['conto-giorni', 'conto-ore', 'conto-minuti', 'conto-secondi'].forEach(id => testo(id, '00'));
            conto.classList.add('imminente');
            if ($('attesa-titolo').textContent !== 'La diretta sta per iniziare') testo('attesa-titolo', 'La diretta sta per iniziare');
            return;
        }
        conto.classList.remove('imminente');
        const s = Math.floor(resto / 1000);
        testo('conto-giorni', due(Math.floor(s / 86400)));
        testo('conto-ore', due(Math.floor((s % 86400) / 3600)));
        testo('conto-minuti', due(Math.floor((s % 3600) / 60)));
        testo('conto-secondi', due(s % 60));
        if ($('attesa-titolo').textContent !== 'La diretta inizia tra') testo('attesa-titolo', 'La diretta inizia tra');
    }

    /* ---------- pausa dell'evento (decisa dalla regia) ---------- */
    function mostraPausa(d, primaVolta) {
        distruggiPlayer();
        fermaConto();
        const ripresa = oraLeggibile(d.ripresa);
        testo('pausa-titolo', ripresa ? 'Pausa: si riprende alle ' + ripresa : 'Pausa');
        testo('pausa-testo', ripresa ? 'La diretta riprende alle ' + ripresa + ' (ora italiana).' : 'La diretta riprende a breve.');
        if (vista !== 'pausa') {
            mostraVista('pausa', { fuoco: primaVolta });
            if (!primaVolta) annuncia(ripresa ? 'Pausa: si riprende alle ' + ripresa + '.' : 'La diretta è in pausa.');
        }
    }

    /* ---------- fine ---------- */
    function mostraFine(d, primaVolta) {
        distruggiPlayer();
        fermaConto();
        clearInterval(stato.timerProgramma);
        stato.timerProgramma = null;
        if (vista !== 'fine') {
            mostraVista('fine', { fuoco: primaVolta });
            if (!primaVolta) annuncia('La diretta è terminata.');
        }
    }

    /* ---------- diretta ---------- */
    function entraInDiretta(d, primaVolta) {
        fermaConto();
        if (vista !== 'diretta') {
            mostraVista('diretta', { fuoco: primaVolta });
            if (!primaVolta) annuncia('La diretta è cominciata.');
            aggiornaComandi();
        }
        if (!stato.timerProgramma) {
            stato.timerProgramma = setInterval(() => { if (stato.evento) aggiornaProgramma(stato.evento, false); }, 30000);
        }
        impostaVideo(String(d.videoId || ''));
    }

    /* ---------------------------------------------------------------
       IL VIDEO E I NOSTRI COMANDI
       --------------------------------------------------------------- */
    const video = {
        player: null,
        id: '',
        stato: 'non-avviato',
        errore: null,
        muto: true,
        volume: 100,
        fermo: false,           // in onda ma il dispositivo non l'ha avviato (T3)
        pausaNostra: false,     // la pausa l'ha chiesta la persona con i nostri comandi
        audioTentato: 0,        // quando si e' provato ad attivare l'audio
        pausaDelBrowser: false, // il browser ha fermato il video appena gli si e' chiesto l'audio
        timerFermo: null,
        timerRiprova: null,
        timerSuggerimento: null
    };

    const SCHERMATE = {
        arrivo: {
            titolo: 'Il video sta per arrivare',
            testo: 'La diretta è cominciata: il video comparirà qui tra pochi istanti, senza bisogno di ricaricare la pagina.'
        },
        errore: {
            titolo: 'Video non disponibile',
            testo: 'In questo momento il video non si riesce a caricare. Riproviamo da soli ogni 20 secondi: resta su questa pagina.'
        },
        interrotto: {
            titolo: 'Il segnale è momentaneamente interrotto',
            testo: 'La trasmissione riprenderà a breve. Riproviamo da soli: resta su questa pagina.'
        },
        avvia: {
            titolo: 'La diretta è pronta',
            testo: 'Il dispositivo non ha avviato il video da solo (succede, per esempio, con il risparmio energetico).'
        }
    };

    function creaPlayer() {
        if (!window.NGBPlayer || typeof window.NGBPlayer.crea !== 'function') {
            video.errore = { codice: 'player' };
            return null;
        }
        video.stato = 'non-avviato';
        video.muto = true;
        video.player = window.NGBPlayer.crea($('video-player'), {
            // il velo che blocca i clic resta spento: vedi player-youtube.js
            livelloTrasparente: false,
            /* Il conto dei 3 secondi di "fermo" parte da qui (e da onStato
               'non-avviato'), MAI dalla richiesta del video: finche' il player
               nasce (API di YouTube lenta, telefono lento) non e' fermo, sta
               arrivando, e "Avvia la diretta" non deve comparire. */
            onPronto: () => {
                video.errore = null;
                video.fermo = false;
                // con la web TV (HLS) le qualita' si conoscono solo adesso
                preparaQualita();
                controllaFermo();
                aggiornaSchermo();
            },
            onStato: s => {
                video.stato = s;
                if (s === 'riproduzione' || s === 'buffering') {
                    video.fermo = false;
                    video.errore = null;
                    video.pausaNostra = false;
                    clearTimeout(video.timerRiprova);
                    video.timerRiprova = null;
                    if (s === 'riproduzione' && !video.muto) nascondiSuggerimento();
                }
                /* Safari (iPhone, iPad) ferma il video quando gli si chiede
                   l'audio senza un tocco DENTRO il video. Se la pausa arriva
                   subito dopo "Attiva l'audio" e non l'ha chiesta la persona,
                   il video resta visibile (niente nostra schermata di pausa):
                   deve poterlo toccare, come dice il suggerimento. */
                video.pausaDelBrowser = s === 'pausa' && !video.pausaNostra && Date.now() - video.audioTentato < 3000;
                if (video.pausaDelBrowser) mostraSuggerimento('Tocca il video per attivare l\'audio.');
                if (s === 'fine' && stato.evento && stato.evento.stato === 'in_onda') {
                    // la diretta si e' fermata dal lato di chi trasmette: si riprova ogni 20-30 s
                    programmaRiprova(20000 + casuale(10000));
                }
                if (s === 'non-avviato') controllaFermo();
                aggiornaSchermo();
            },
            onErrore: err => {
                video.errore = err || { codice: 'errore' };
                programmaRiprova(20000);
                aggiornaSchermo();
            },
            onVolume: v => {
                video.muto = !!v.muto;
                video.volume = Number(v.volume) || 0;
                aggiornaComandi();
            }
        });
        preparaQualita();
        return video.player;
    }

    function impostaVideo(id) {
        if (id === video.id && (video.player || !id)) { aggiornaSchermo(); return; }
        video.id = id;
        video.errore = null;
        video.fermo = false;
        clearTimeout(video.timerRiprova);
        video.timerRiprova = null;
        if (!id) {
            if (video.player) video.player.pausa();
            aggiornaSchermo();
            return;
        }
        if (!video.player) creaPlayer();
        if (video.player) {
            // il cambio di link della regia arriva qui: il player cambia video
            // senza che la pagina si ricarichi (il controllo del "fermo" lo
            // fanno onPronto e onStato, quando il player risponde)
            video.player.carica(id);
        }
        aggiornaSchermo();
    }

    function distruggiPlayer() {
        clearTimeout(video.timerFermo);
        clearTimeout(video.timerRiprova);
        clearTimeout(video.timerSuggerimento);
        if (video.player) { try { video.player.distruggi(); } catch (e) { /* gia' distrutto */ } }
        video.player = null;
        video.id = '';
        video.stato = 'non-avviato';
        video.errore = null;
        video.fermo = false;
        video.muto = true;
        video.pausaNostra = false;
        video.pausaDelBrowser = false;
        video.audioTentato = 0;
        nascondiSuggerimento();
        esciSchermoIntero();
    }

    function programmaRiprova(dopoMs) {
        clearTimeout(video.timerRiprova);
        video.timerRiprova = setTimeout(riprovaVideo, dopoMs);
    }
    function riprovaVideo() {
        video.timerRiprova = null;
        if (!video.player || !video.id || vista !== 'diretta') return;
        video.player.carica(video.id);
        // se anche questo tentativo non va, il prossimo lo decide onErrore/onStato
        if (video.errore || video.stato === 'fine') programmaRiprova(20000 + casuale(10000));
    }

    /* T3: in onda ma il player resta fermo (iPhone in risparmio energetico,
       autoplay bloccato): dopo 3 secondi, al posto del video, un grande
       "Avvia la diretta". */
    function controllaFermo() {
        clearTimeout(video.timerFermo);
        video.timerFermo = setTimeout(() => {
            if (video.player && video.id && !video.errore && video.player.stato() === 'non-avviato') {
                video.fermo = true;
                aggiornaSchermo();
            }
        }, 3000);
    }

    function schermataAttuale() {
        if (!video.id) return 'arrivo';
        if (video.errore) return 'errore';
        if (video.stato === 'fine') return 'interrotto';
        if (video.stato === 'pausa' && !video.pausaDelBrowser) return 'pausa';
        if (video.fermo) return 'avvia';
        return 'video';
    }

    /* Una cosa sola alla volta nel riquadro: il video OPPURE una nostra
       schermata, mai una sopra l'altro (regole di YouTube). */
    function aggiornaSchermo() {
        const s = schermataAttuale();
        $('area-video').setAttribute('data-schermata', s);
        mostra('schermo-pausa', s === 'pausa');
        const sv = $('schermo-video');
        const t = SCHERMATE[s];
        if (t) {
            testo('schermo-video-titolo', t.titolo);
            testo('schermo-video-testo', t.testo);
            sv.setAttribute('data-tipo', s);
            mostra('btn-avvia-diretta', s === 'avvia');
            sv.hidden = false;
        } else {
            sv.hidden = true;
        }
        if (video.player) video.player.mostra(s === 'video');
        aggiornaComandi();
    }

    function aggiornaComandi() {
        const inRiproduzione = video.stato === 'riproduzione' || video.stato === 'buffering';
        const conVideo = !!(video.player && video.id);
        const play = $('btn-play');
        play.setAttribute('data-stato', inRiproduzione ? 'riproduzione' : 'pausa');
        play.setAttribute('aria-label', inRiproduzione ? 'Metti in pausa' : 'Riproduci');
        play.disabled = !conVideo;
        const muto = $('btn-muto');
        muto.setAttribute('data-muto', video.muto ? '1' : '0');
        muto.setAttribute('aria-pressed', video.muto ? 'true' : 'false');
        muto.setAttribute('aria-label', video.muto ? 'Audio disattivato: premi per attivarlo' : 'Audio attivo: premi per disattivarlo');
        muto.disabled = !conVideo;
        const vol = $('volume');
        const valore = video.muto ? 0 : video.volume;
        if (document.activeElement !== vol) vol.value = String(valore);
        vol.setAttribute('aria-valuetext', video.muto ? 'Audio disattivato' : 'Volume ' + valore + ' per cento');
        vol.disabled = !conVideo;
        vol.hidden = IOS;
        $('btn-live').disabled = !conVideo;
        /* Il player della web TV incorporato (iframe di un altro sito) ha i
           suoi comandi e i nostri non lo raggiungono: restano solo lo schermo
           intero e l'indicazione di usare i comandi del player. */
        const ridotti = comandiRidotti();
        $('riquadro-video').setAttribute('data-comandi', ridotti ? 'ridotti' : 'pieni');
        testo('riga-comandi-aiuto', ridotti
            ? 'Audio e pausa si regolano con i comandi del player; qui sotto lo schermo intero.'
            : 'Usa i pulsanti qui sotto per l\'audio e lo schermo intero.');
        mostra('btn-attiva-audio', conVideo && video.muto && !video.errore && !ridotti);
        aggiornaStriscia();
    }
    function comandiRidotti() {
        const p = video.player;
        if (!p || !video.id || typeof p.capacita !== 'function') return false;
        try { return p.capacita().comandi === false; } catch (e) { return false; }
    }
    // la striscia sotto il video c'e' solo se ha qualcosa da dire
    function aggiornaStriscia() {
        mostra('striscia-audio', !$('btn-attiva-audio').hidden || !$('suggerimento-audio').hidden);
    }

    function mostraSuggerimento(t) {
        testo('suggerimento-audio', t);
        mostra('suggerimento-audio', true);
        aggiornaStriscia();
        clearTimeout(video.timerSuggerimento);
        video.timerSuggerimento = setTimeout(nascondiSuggerimento, 20000);
    }
    function nascondiSuggerimento() {
        clearTimeout(video.timerSuggerimento);
        mostra('suggerimento-audio', false);
        aggiornaStriscia();
    }

    /* Dopo aver chiesto l'audio: il browser l'ha concesso davvero? Se il
       player e' ancora muto (il browser ha ignorato la richiesta), la pagina
       torna "muta" anche nei comandi: "Attiva l'audio" ricompare e il
       pulsante del muto dice il vero. Se il video si e' fermato, un tocco sul
       video (che resta visibile, vedi pausaDelBrowser) lo fa ripartire. */
    function controllaAudio(testoFermo) {
        const p = video.player;
        if (!p) return;
        if (p.eMuto()) {
            p.muto();
            mostraSuggerimento('Tocca il video per attivare l\'audio.');
        } else if (['riproduzione', 'buffering'].indexOf(p.stato()) < 0) {
            mostraSuggerimento(testoFermo);
        } else {
            nascondiSuggerimento();
        }
    }

    /* T3: tutto nello STESSO gestore del clic (i browser concedono l'audio
       solo come risposta diretta a un gesto della persona). */
    function attivaAudio() {
        const p = video.player;
        if (!p) return;
        video.fermo = false;
        video.pausaNostra = false;
        video.audioTentato = Date.now();
        p.smuto();
        p.volume(100);
        p.play();
        aggiornaSchermo();
        clearTimeout(video.timerSuggerimento);
        video.timerSuggerimento = setTimeout(() => controllaAudio('Tocca il video per attivare l\'audio.'), 800);
    }

    function avviaDaFermo() {
        const p = video.player;
        if (!p) return;
        video.fermo = false;
        video.pausaNostra = false;
        video.audioTentato = Date.now();
        p.mostra(true);
        p.smuto();
        p.volume(100);
        p.play();
        aggiornaSchermo();
        clearTimeout(video.timerSuggerimento);
        video.timerSuggerimento = setTimeout(() => controllaAudio('Tocca il video per avviarlo.'), 1500);
    }

    function alternaPlay() {
        const p = video.player;
        if (!p || !video.id) return;
        if (video.stato === 'riproduzione' || video.stato === 'buffering') { video.pausaNostra = true; p.pausa(); }
        else { video.fermo = false; video.pausaNostra = false; p.play(); }
    }
    function alternaMuto() {
        const p = video.player;
        if (!p) return;
        if (video.muto) {
            p.smuto();
            if (!video.volume) p.volume(50);
            if (video.stato !== 'riproduzione') p.play();
        } else {
            p.muto();
        }
    }
    function cambiaVolume(delta) {
        const p = video.player;
        if (!p || IOS) return;
        const base = video.muto ? 0 : video.volume;
        const n = Math.max(0, Math.min(100, base + delta));
        if (n === 0) { p.muto(); return; }
        p.volume(n);
        if (video.muto) p.smuto();
    }

    function preparaQualita() {
        const sel = $('sel-qualita');
        const livelli = video.player && typeof video.player.livelliQualita === 'function' ? video.player.livelliQualita() : [];
        sel.textContent = '';
        (livelli || []).forEach(l => {
            const o = document.createElement('option');
            o.value = String(l.valore);
            o.textContent = String(l.etichetta);
            sel.appendChild(o);
        });
        // con YouTube (e con l'HLS di Safari) la qualita' la sceglie il player: il selettore resta nascosto
        sel.hidden = !(livelli && livelli.length);
    }

    /* ---------- schermo intero: il NOSTRO riquadro, con i nostri comandi ---------- */
    let intero = { finto: false, scorrimento: 0 };
    function elementoSchermoIntero() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
    function aggiornaStatoIntero() {
        const r = $('riquadro-video');
        const attivo = intero.finto || elementoSchermoIntero() === r;
        r.setAttribute('data-intero', attivo ? '1' : '0');
        $('btn-schermo-intero').setAttribute('aria-label', attivo ? 'Esci dallo schermo intero' : 'Schermo intero');
    }
    function entraFinto() {
        const r = $('riquadro-video');
        intero.finto = true;
        intero.scorrimento = window.scrollY || 0;
        document.documentElement.classList.add('schermo-intero-finto');
        r.classList.add('schermo-intero-finto');
        aggiornaStatoIntero();
        try { r.focus({ preventScroll: true }); } catch (e) { /* niente */ }
    }
    function esciFinto() {
        if (!intero.finto) return;
        intero.finto = false;
        document.documentElement.classList.remove('schermo-intero-finto');
        $('riquadro-video').classList.remove('schermo-intero-finto');
        aggiornaStatoIntero();
        window.scrollTo(0, intero.scorrimento);
    }
    function esciSchermoIntero() {
        esciFinto();
        const el = elementoSchermoIntero();
        if (el) {
            const esciFn = document.exitFullscreen || document.webkitExitFullscreen;
            if (typeof esciFn === 'function') { try { const p = esciFn.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) { /* gia' uscito */ } }
        }
    }
    function alternaSchermoIntero() {
        if (vista !== 'diretta') return;
        const r = $('riquadro-video');
        if (intero.finto) { esciFinto(); return; }
        if (elementoSchermoIntero()) { esciSchermoIntero(); return; }
        const richiesta = r.requestFullscreen || r.webkitRequestFullscreen;
        const permesso = document.fullscreenEnabled === true || document.webkitFullscreenEnabled === true;
        if (typeof richiesta === 'function' && permesso) {
            try {
                const p = richiesta.call(r);
                if (p && typeof p.then === 'function') {
                    p.then(() => {
                        // sui telefoni Android, in orizzontale (se il sistema lo consente)
                        try { if (screen.orientation && screen.orientation.lock && window.matchMedia('(pointer: coarse)').matches) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* non consentito */ }
                    }, () => entraFinto());
                }
            } catch (e) { entraFinto(); }
            return;
        }
        // iPhone: Safari manda a schermo intero solo i <video>, non un riquadro
        entraFinto();
    }

    /* ---------- tastiera ---------- */
    function tasti(e) {
        if (!$('dialogo-conferma').hidden) return;
        if (e.key === 'Escape' && intero.finto) { e.preventDefault(); esciFinto(); return; }
        if (vista !== 'diretta' || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        const tag = t && t.tagName ? t.tagName : '';
        const campoTesto = tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)
            || (tag === 'INPUT' && t.type !== 'range');
        if (campoTesto) return;
        const k = e.key;
        if (k === ' ' || k === 'Spacebar') {
            // sui bottoni lo spazio li preme gia': non si fa due volte
            if (tag === 'BUTTON' || tag === 'A') return;
            e.preventDefault();
            alternaPlay();
        } else if (k === 'f' || k === 'F') {
            e.preventDefault();
            alternaSchermoIntero();
        } else if (k === 'm' || k === 'M') {
            e.preventDefault();
            alternaMuto();
        } else if (k === 'ArrowUp' || k === 'ArrowRight' || k === 'Up' || k === 'Right') {
            if (tag === 'INPUT' || IOS) return;    // sul cursore del volume le frecce fanno gia' il loro lavoro
            e.preventDefault();
            cambiaVolume(10);
        } else if (k === 'ArrowDown' || k === 'ArrowLeft' || k === 'Down' || k === 'Left') {
            if (tag === 'INPUT' || IOS) return;
            e.preventDefault();
            cambiaVolume(-10);
        }
    }

    function preparaComandi() {
        $('btn-play').addEventListener('click', alternaPlay);
        $('btn-riprendi').addEventListener('click', () => { if (video.player) { video.pausaNostra = false; video.player.play(); } });
        $('btn-muto').addEventListener('click', alternaMuto);
        $('btn-attiva-audio').addEventListener('click', attivaAudio);
        $('btn-avvia-diretta').addEventListener('click', avviaDaFermo);
        $('btn-live').addEventListener('click', () => { if (video.player) { video.fermo = false; video.pausaNostra = false; video.player.vaiAlLive(); } });
        $('btn-schermo-intero').addEventListener('click', alternaSchermoIntero);
        $('sel-qualita').addEventListener('change', e => { if (video.player) video.player.impostaQualita(e.target.value); });
        $('volume').addEventListener('input', e => {
            const p = video.player;
            if (!p) return;
            const n = Number(e.target.value) || 0;
            if (n === 0) { p.muto(); return; }
            p.volume(n);
            if (video.muto) p.smuto();
        });
        document.addEventListener('keydown', tasti);
        document.addEventListener('fullscreenchange', aggiornaStatoIntero);
        document.addEventListener('webkitfullscreenchange', aggiornaStatoIntero);
        /* T3: dopo un clic dentro il video il focus resta nell'iframe di
           YouTube e le scorciatoie non arriverebbero piu' alla pagina: lo si
           riprende e lo si rimette sul riquadro. */
        window.addEventListener('blur', () => {
            setTimeout(() => {
                const a = document.activeElement;
                if (vista === 'diretta' && a && a.tagName === 'IFRAME') {
                    try { a.blur(); } catch (e) { /* niente */ }
                    try { $('riquadro-video').focus({ preventScroll: true }); } catch (e) { /* niente */ }
                }
            }, 0);
        });
        if (IOS) document.documentElement.classList.add('ios');
    }

    /* ---------------------------------------------------------------
       PRESENZA (il contatore dei collegati e i minuti per gli attestati)
       ---------------------------------------------------------------
       Un documento per persona e per evento, presenze/{idEvento}_{uid},
       scritto con le regole strette di firestore.rules. L'algoritmo
       (DECISIONI D5 e T4):
       - si scrive solo nelle viste attesa, diretta e pausa, da un'ora
         prima dell'inizio a mezz'ora dopo la fine (e comunque mentre si
         e' in onda, anche se la regia parte in anticipo);
       - il primo segnale parte dopo un ritardo casuale fra 0 e 60 s,
         fissato all'apertura; poi uno ogni 60 s, contati dalla FINE della
         scrittura precedente. Gli aggiornamenti dell'evento non
         ripristinano mai il timer: quando la regia manda in onda, le
         1000 pagine aperte NON scrivono tutte insieme;
       - mai meno di 55 s dopo l'ultimo segnale riuscito (anche di una
         pagina precedente: ricarica) e nemmeno dopo l'ultimo rifiutato,
         una sola scrittura alla volta, niente scritture senza rete, una
         sola scheda per dispositivo;
       - primo segnale della pagina = "nuovo collegamento" (se il
         documento non c'e', lo si crea); poi "continua", con +60 secondi
         solo se l'evento e' in onda. Se si e' rimasti muti per piu' di
         140 s, o se il segnale precedente e' stato rifiutato, di nuovo
         "nuovo collegamento";
       - se le regole rifiutano, si guarda il proprio profilo: account
         disattivato -> messaggio e uscita, subito. "Hai aperto la diretta
         da un altro dispositivo" (eventi a un solo dispositivo) invece
         SOLO dopo DUE rifiuti di fila, il secondo dei quali su un "nuovo
         collegamento" mandato almeno 55 secondi dopo il primo. Un rifiuto
         solo non prova niente: il dispositivo appena entrato (quello
         buono) si vede rifiutare il primo segnale se il vecchio ha
         scritto meno di 50 s prima (le regole lo impongono); un segnale
         rimasto in coda senza rete arriva oltre i 150 s del "continua";
         la regia che mette in pausa proprio in quel momento toglie il
         minuto in piu'. In tutti questi casi il segnale del giro dopo
         (un "nuovo collegamento", un minuto piu' tardi) passa. Il vecchio
         dispositivo invece, soppiantato davvero, si vede rifiutare anche
         quello: esce con il messaggio al secondo giro (un paio di minuti).
       --------------------------------------------------------------- */
    const presenza = {
        attiva: false,
        timer: null,
        inCorso: false,
        primoFatto: false,
        ultimoRiuscito: 0,
        ultimoRifiutato: 0,
        rifiuti: 0,              // segnali rifiutati di fila da questa scheda
        forzaNuovo: false,       // dopo un rifiuto, il segnale successivo e' un "nuovo collegamento"
        scheda: idCasuale(8),
        lucchetto: { nome: '', tenuto: false, chiesto: false, rilascia: null, giro: 0 }
    };
    // una scheda senza il lucchetto scrive solo se le altre tacciono da tanto cosi'
    const SILENZIO_ALTRE_SCHEDE_MS = 90000;

    function tempiPresenza() {
        const p = (CFG && CFG.prove) || null;   // solo in modalita' prove (config.js)
        return {
            ritardo: p && p.ritardoPresenzaMs != null && isFinite(p.ritardoPresenzaMs) ? Math.max(0, Number(p.ritardoPresenzaMs)) : 60000,
            intervallo: p && p.intervalloPresenzaMs != null && isFinite(p.intervalloPresenzaMs) ? Math.max(500, Number(p.intervalloPresenzaMs)) : 60000
        };
    }

    function avviaPresenza() {
        if (presenza.attiva || stato.anteprima || !stato.utente || !stato.idEvento) return;
        presenza.attiva = true;
        presenza.primoFatto = false;
        presenza.ultimoRiuscito = 0;
        presenza.ultimoRifiutato = 0;
        presenza.rifiuti = 0;
        presenza.forzaNuovo = false;
        prendiLucchetto(nomeLucchetto());
        presenza.timer = setTimeout(giroPresenza, casuale(tempiPresenza().ritardo));
    }
    function fermaPresenza() {
        presenza.attiva = false;
        clearTimeout(presenza.timer);
        presenza.timer = null;
        rilasciaLucchetto();
    }

    /* Una sola scheda per dispositivo scrive: di norma quella che tiene il
       lucchetto del browser (navigator.locks). Il lucchetto ha il nome
       dell'evento e della persona: due schede su due eventi diversi non si
       ostacolano. Si rilascia quando la pagina smette di segnalare (uscita,
       cambio di persona, fine dell'evento) e quando la pagina viene chiusa
       o messa da parte (pagehide). E siccome una scheda che lo tiene puo'
       restare sospesa (iPhone: le schede in secondo piano si congelano),
       le altre scrivono comunque se da 90 s nessuna scheda ha lasciato il
       suo segnale in localStorage (la regola dei 50 s evita i doppioni).
       Senza navigator.locks (Safari vecchi) vale solo il segnale. */
    function nomeLucchetto() {
        return 'ngb-presenza-' + stato.idEvento + '_' + (stato.utente ? stato.utente.uid : '');
    }
    function conLucchetti() {
        return !!(navigator.locks && typeof navigator.locks.request === 'function');
    }
    function prendiLucchetto(nome) {
        const l = presenza.lucchetto;
        if (!conLucchetti() || !nome) return;
        if (l.nome === nome && (l.tenuto || l.chiesto)) return;
        rilasciaLucchetto();
        const giro = ++l.giro;
        l.nome = nome;
        l.chiesto = true;
        try {
            navigator.locks.request(nome, { ifAvailable: true }, lucchetto => {
                // nel frattempo la pagina l'ha lasciato (uscita, altro evento): lo si restituisce subito
                if (l.giro !== giro) return undefined;
                l.chiesto = false;
                if (!lucchetto) return undefined;       // lo tiene un'altra scheda
                l.tenuto = true;
                // tenuto finche' qualcuno non chiama l.rilascia()
                return new Promise(risolvi => { l.rilascia = risolvi; });
            }).catch(() => { if (l.giro === giro) l.chiesto = false; });
        } catch (e) { l.chiesto = false; }
    }
    function rilasciaLucchetto() {
        const l = presenza.lucchetto;
        l.giro++;
        const r = l.rilascia;
        l.rilascia = null;
        l.tenuto = false;
        l.chiesto = false;
        l.nome = '';
        if (r) { try { r(); } catch (e) { /* gia' rilasciato */ } }
    }
    function leggiSegnale() {
        try {
            const s = JSON.parse(archivio.leggi(CHIAVE_SEGNALE) || 'null');
            return s && typeof s.quando === 'number' ? s : null;
        } catch (e) { return null; }
    }
    /* altraSchedaAttiva: un'altra scheda di questo dispositivo ha segnalato
       la stessa presenza da meno di 90 s. */
    function questaSchedaScrive(altraSchedaAttiva) {
        if (conLucchetti()) {
            prendiLucchetto(nomeLucchetto());
            if (presenza.lucchetto.tenuto) return true;
        }
        return !altraSchedaAttiva;
    }

    function nellaFinestra(ev) {
        if (!ev) return false;
        if (ev.stato === 'in_onda') return true;
        if (ev.stato === 'terminato') return false;
        const i = ms(ev.inizio);
        const f = ms(ev.fine);
        if (!i || !f) return false;
        const t = Date.now();
        return t >= i - 60 * 60000 && t <= f + 30 * 60000;
    }

    /* La sessione del dispositivo: quella che il servizio ha dato all'accesso.
       Prima localStorage (condiviso fra le schede e le ricariche), poi la
       memoria della pagina: con localStorage bloccato un identificativo
       nuovo a ogni segnale farebbe rifiutare tutti i "continua" (zero
       minuti) e, con "un solo dispositivo", ogni segnale. */
    function ricordaSessione(s) {
        stato.sessione = SESSIONE_VALIDA.test(String(s || '')) ? String(s) : idCasuale(12);
        archivio.scrivi(CHIAVE_SESSIONE, stato.sessione);
    }
    function sessioneDispositivo() {
        const s = archivio.leggi(CHIAVE_SESSIONE);
        if (s && SESSIONE_VALIDA.test(s)) return s;
        if (!stato.sessione) stato.sessione = idCasuale(12);
        archivio.scrivi(CHIAVE_SESSIONE, stato.sessione);
        return stato.sessione;
    }

    async function giroPresenza() {
        presenza.timer = null;
        if (!presenza.attiva) return;
        try { await segnalePresenza(); }
        catch (e) { /* rete o altro: si riprova al giro dopo */ }
        if (presenza.attiva && !presenza.timer) presenza.timer = setTimeout(giroPresenza, tempiPresenza().intervallo);
    }

    async function segnalePresenza() {
        const ev = stato.evento;
        const utente = fb.auth && fb.auth.currentUser;
        if (!presenza.attiva || presenza.inCorso || stato.anteprima || !utente || !fb.F || !ev || !stato.idEvento) return;
        if (['attesa', 'diretta', 'pausa'].indexOf(vista) < 0 || !nellaFinestra(ev)) return;
        if (navigator.onLine === false) return;

        const chiave = stato.idEvento + '_' + utente.uid;
        const adesso = Date.now();
        const s = leggiSegnale();
        const segnale = s && s.chiave === chiave ? s : null;
        const altraSchedaAttiva = !!(segnale && segnale.scheda !== presenza.scheda && adesso - segnale.quando < SILENZIO_ALTRE_SCHEDE_MS);
        // un'altra scheda di questo dispositivo scrive senza rifiuti: la
        // sessione del dispositivo e' buona, i rifiuti di prima non contano piu'
        if (altraSchedaAttiva) presenza.rifiuti = 0;
        // l'ultimo segnale riuscito, di questa scheda o di un'altra (anche di prima di una ricarica)
        const ultimoScritto = Math.max(presenza.ultimoRiuscito, segnale ? segnale.quando : 0);
        const ultimo = Math.max(ultimoScritto, presenza.ultimoRifiutato);
        if (ultimo && adesso - ultimo < 55000) return;
        if (!questaSchedaScrive(altraSchedaAttiva)) return;

        const F = fb.F;
        const rif = F.doc(fb.db, 'presenze', chiave);
        const sessione = sessioneDispositivo();
        const nuovo = presenza.forzaNuovo || !presenza.primoFatto || (presenza.ultimoRiuscito && adesso - presenza.ultimoRiuscito > 140000);
        const piuUnMinuto = ev.stato === 'in_onda' && adesso - ultimoScritto >= 58000;
        const gen = stato.generazione;
        presenza.inCorso = true;
        let esito;
        try {
            esito = nuovo
                ? await nuovoCollegamento(F, rif, utente.uid, stato.idEvento, sessione)
                : await continua(F, rif, sessione, piuUnMinuto);
        } finally {
            presenza.inCorso = false;
        }
        if (gen !== stato.generazione) return;
        if (esito === 'ok') {
            presenza.primoFatto = true;
            presenza.forzaNuovo = false;
            presenza.rifiuti = 0;
            presenza.ultimoRiuscito = Date.now();
            archivio.scrivi(CHIAVE_SEGNALE, JSON.stringify({ scheda: presenza.scheda, quando: presenza.ultimoRiuscito, chiave: chiave }));
        } else if (esito === 'negato') {
            presenza.rifiuti++;
            presenza.forzaNuovo = true;
            presenza.ultimoRifiutato = Date.now();
            await diagnosiPresenza(utente.uid, presenza.rifiuti >= 2, ultimoScritto, gen);
        }
    }

    function negato(e) {
        const c = codiceDi(e);
        return c === 'permission-denied' || c === 'not-found';
    }

    async function nuovoCollegamento(F, rif, uid, idEvento, sessione) {
        try {
            await F.updateDoc(rif, { ultimo: F.serverTimestamp(), collegamenti: F.increment(1), sessione: sessione });
            return 'ok';
        } catch (e) {
            if (!negato(e)) throw e;
        }
        try {
            await F.setDoc(rif, {
                uid: uid, idEvento: idEvento, primo: F.serverTimestamp(), ultimo: F.serverTimestamp(),
                secondi: 0, collegamenti: 1, sessione: sessione
            });
            return 'ok';
        } catch (e) {
            if (!negato(e)) throw e;
        }
        // come ultima prova un "continua" senza minuti
        return continua(F, rif, sessione, false);
    }

    async function continua(F, rif, sessione, piuUnMinuto) {
        const dati = { ultimo: F.serverTimestamp(), sessione: sessione };
        if (piuUnMinuto) dati.secondi = F.increment(60);
        try {
            await F.updateDoc(rif, dati);
            return 'ok';
        } catch (e) {
            if (!negato(e)) throw e;
        }
        if (!piuUnMinuto) return 'negato';
        /* Il minuto in piu' vale solo se l'evento e' in onda nel momento in
           cui la scrittura arriva (le regole lo rileggono): se la regia ha
           appena messo in pausa o terminato, il segnale senza minuto passa, e
           il rifiuto non va contato. */
        try {
            await F.updateDoc(rif, { ultimo: F.serverTimestamp(), sessione: sessione });
            return 'ok';
        } catch (e) {
            if (negato(e)) return 'negato';
            throw e;
        }
    }

    /* confermato: e' il secondo rifiuto di fila (vedi sopra). ultimoScritto:
       l'ultimo segnale riuscito conosciuto da questo dispositivo. */
    async function diagnosiPresenza(uid, confermato, ultimoScritto, gen) {
        // un segnale riuscito da meno di un minuto (ricarica, altra scheda):
        // il rifiuto e' per i tempi delle regole, non per la persona
        if (ultimoScritto && Date.now() - ultimoScritto < 60000) return;
        const F = fb.F;
        let p = null;
        try {
            const snap = await F.getDoc(F.doc(fb.db, 'partecipanti', uid));
            p = snap.exists() ? snap.data() : null;
        } catch (e) { return; }
        if (gen !== stato.generazione) return;
        // l'account disattivato si vede dal profilo, scritto dal server: basta un rifiuto
        if (!p || p.stato === 'disattivato') { await esciConMessaggio('disattivato'); return; }
        if (confermato && stato.evento && stato.evento.unSoloDispositivo === true) await esciConMessaggio('altro-dispositivo');
    }

    /* ---------------------------------------------------------------
       CONNESSIONE
       ---------------------------------------------------------------
       Avviso "Connessione persa" solo dopo 5 secondi di assenza (niente
       lampeggi per un attimo di rete che manca). Firestore si ricollega
       da solo; il video, se era in errore, riparte appena torna la rete.

       Dove sta l'avviso: nelle viste senza video e' un riquadro fisso in
       basso; nella vista della diretta invece entra nel riquadro del
       video, in cima, SOPRA l'area del video (non davanti: il video si
       sposta un poco in giu' finche' la rete manca). Fisso in basso
       copriva il video (telefono in orizzontale) o i comandi (e
       intercettava i tocchi), e davanti al video non va mai niente. In
       cima al riquadro si vede sempre: sul telefono in verticale, in
       orizzontale (dove quello che sta sotto il video resta fuori dallo
       schermo) e a schermo intero. L'avviso non e' una "regione live"
       (compare gia' pieno: molti lettori di schermo non lo leggerebbero):
       lo si annuncia a parte, e cosi' il ritorno. */
    const rete = { daCache: false, erroreLettura: false, persaDa: 0, timer: null, avvisata: false };
    function segnaCache(daCache) {
        if (rete.daCache === daCache) return;
        rete.daCache = daCache;
        aggiornaConnessione();
    }
    function mostraAvvisoConnessione(si) {
        mostra('avviso-connessione', si);
        if (si && !rete.avvisata) annuncia('Connessione persa: nuovo tentativo in corso.');
        else if (!si && rete.avvisata) annuncia('Connessione ritrovata.');
        rete.avvisata = si;
    }
    function aggiornaConnessione() {
        const persa = navigator.onLine === false || rete.daCache || rete.erroreLettura;
        clearTimeout(rete.timer);
        rete.timer = null;
        if (!persa) {
            rete.persaDa = 0;
            mostraAvvisoConnessione(false);
            return;
        }
        if (!rete.persaDa) rete.persaDa = Date.now();
        const manca = 5000 - (Date.now() - rete.persaDa);
        if (manca <= 0) mostraAvvisoConnessione(true);
        else rete.timer = setTimeout(aggiornaConnessione, manca + 20);
    }
    function posizionaAvvisoConnessione() {
        const avviso = $('avviso-connessione');
        const riquadro = $('riquadro-video');
        if (!avviso || !riquadro) return;
        if (vista === 'diretta') {
            if (avviso.parentNode !== riquadro) riquadro.insertBefore(avviso, $('area-video'));
        } else if (avviso.parentNode === riquadro) {
            document.body.insertBefore(avviso, $('dialogo-conferma'));
        }
    }
    function preparaRete() {
        window.addEventListener('offline', aggiornaConnessione);
        window.addEventListener('online', () => {
            aggiornaConnessione();
            if (video.player && video.id && (video.errore || video.stato === 'fine')) {
                clearTimeout(video.timerRiprova);
                riprovaVideo();
            }
        });
        // la pagina si chiude o va in secondo piano per sempre: il lucchetto della presenza passa alle altre schede
        window.addEventListener('pagehide', rilasciaLucchetto);
    }

    /* I componenti di Firebase (da gstatic) non si sono scaricati. Quasi
       sempre e' la rete (debole o assente all'apertura): allora si dice
       quello, e si riprova da soli ricaricando la pagina (un import() fallito
       resta ricordato dal browser per tutta la vita della pagina: il nuovo
       tentativo sicuro e' la ricarica), appena torna la rete oppure dopo
       un'attesa che cresce a ogni fallimento (20 s, 40 s... fino a 5 minuti).
       "Il browser non e' aggiornato" resta per gli errori del codice
       (SyntaxError: un browser che non capisce l'SDK). */
    function erroreDiRete(e) {
        const nome = String((e && e.name) || '');
        if (nome === 'SyntaxError') return false;
        if (navigator.onLine === false) return true;
        return nome === 'TypeError' || /fetch|network|failed to load|importing a module|dynamically imported/i.test(String((e && e.message) || ''));
    }
    let ricaricaProgrammata = false;
    function sdkNonCaricato(e) {
        if (!erroreDiRete(e)) { mostraMessaggio('browser'); return; }
        mostraMessaggio('sdk-rete');
        if (ricaricaProgrammata) return;
        ricaricaProgrammata = true;
        let volte = 0;
        try { volte = Number(sessionStorage.getItem(CHIAVE_RIPROVA_SDK)) || 0; } catch (err) { volte = 0; }
        try { sessionStorage.setItem(CHIAVE_RIPROVA_SDK, String(volte + 1)); } catch (err) { /* niente */ }
        const attesa = Math.min(300000, 20000 * Math.pow(2, Math.min(volte, 4)));
        window.addEventListener('online', () => location.reload(), { once: true });
        const prova = () => {
            // senza rete una ricarica mostrerebbe la pagina d'errore del browser, che non riprova piu'
            if (navigator.onLine === false) { setTimeout(prova, 5000); return; }
            location.reload();
        };
        setTimeout(prova, attesa);
    }
    function sdkCaricato() {
        try { sessionStorage.removeItem(CHIAVE_RIPROVA_SDK); } catch (e) { /* niente */ }
    }

    /* ---------------------------------------------------------------
       CONFERME (accessibili: focus dentro, Esc, clic sullo sfondo)
       --------------------------------------------------------------- */
    function chiediConferma(o) {
        return new Promise(risolvi => {
            const d = $('dialogo-conferma');
            testo('dialogo-titolo', o.titolo);
            testo('dialogo-testo', o.testo);
            testo('btn-conferma-si', o.si);
            testo('btn-conferma-no', o.no);
            const prima = document.activeElement;
            d.hidden = false;
            const bottoni = [$('btn-conferma-no'), $('btn-conferma-si')];
            function chiudi(valore) {
                d.hidden = true;
                document.removeEventListener('keydown', tastiDialogo, true);
                d.removeEventListener('click', clic);
                if (prima && typeof prima.focus === 'function' && document.contains(prima)) { try { prima.focus({ preventScroll: true }); } catch (e) { /* niente */ } }
                risolvi(valore);
            }
            function tastiDialogo(e) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chiudi(false); return; }
                if (e.key === 'Tab') {
                    const i = bottoni.indexOf(document.activeElement);
                    e.preventDefault();
                    bottoni[(i + (e.shiftKey ? bottoni.length - 1 : 1)) % bottoni.length].focus();
                }
            }
            function clic(e) {
                if (e.target.closest('#btn-conferma-si')) chiudi(true);
                else if (e.target.closest('#btn-conferma-no') || e.target.closest('[data-chiudi-dialogo]')) chiudi(false);
            }
            document.addEventListener('keydown', tastiDialogo, true);
            d.addEventListener('click', clic);
            // il fuoco sul "no": un Invio di troppo non fa niente di irreversibile
            bottoni[0].focus();
        });
    }

    /* ---------------------------------------------------------------
       AVVIO DELLA PAGINA DELLA DIRETTA
       --------------------------------------------------------------- */
    async function avviaDiretta() {
        preparaAssistenza();
        preparaModuli();
        preparaComandi();
        preparaRete();
        $('btn-esci').addEventListener('click', async () => {
            if (stato.anteprima) { chiudiAnteprima(); return; }
            // il gestore entrato qui (vista 'gestore') condivide la sessione con la gestione
            const si = await chiediConferma(vista === 'gestore' ? {
                titolo: 'Vuoi uscire?',
                testo: 'Uscirai anche dalla gestione della diretta, anche se è aperta in altre schede di questo browser.',
                si: 'Esci', no: 'Resta'
            } : {
                titolo: 'Vuoi uscire dalla diretta?',
                testo: 'Per rientrare ti serviranno di nuovo il nome utente e la password.',
                si: 'Esci', no: 'Resta'
            });
            if (si) esci();
        });

        if (!configurata()) { mostraMessaggio('non-configurata'); return; }
        try {
            await preparaAuth();
        } catch (e) {
            sdkNonCaricato(e);
            return;
        }
        fb.A.onAuthStateChanged(fb.auth, u => { gestisciUtente(u); });
    }

    /* ---------------------------------------------------------------
       REIMPOSTAZIONE DELLA PASSWORD (/diretta/reimposta.html)
       ---------------------------------------------------------------
       Il collegamento arriva per email: reimposta.html?oobCode=...&u=<nome utente>
       (oppure &per=gestione per i gestori). Il nome utente si mostra dal
       parametro u, ripulito: l'email tecnica dietro l'account non si vede
       mai (DECISIONI D1). Dopo il salvataggio si entra da soli nella
       diretta con la nuova password (R24). */
    async function avviaReimposta() {
        preparaAssistenza();
        const par = new URLSearchParams(location.search);
        const oob = par.get('oobCode') || '';
        const perGestione = par.get('per') === 'gestione';
        const nomeUtente = pulisciNome(par.get('u') || '');
        const destinazione = perGestione ? '/diretta/gestione/' : '/diretta/' + (nomeUtente ? '?u=' + encodeURIComponent(nomeUtente) : '');
        const nuovoCollegamento = perGestione ? '/diretta/gestione/' : '/diretta/?dimenticata=1';

        function avviso(t, tipo) { msg('msg-reimposta', t, tipo); }
        function mostraScaduto() {
            mostra('form-reimposta', false);
            testo('reimposta-sottotitolo', 'Il collegamento è scaduto o è già stato usato.');
            avviso('Per sicurezza ogni collegamento vale un\'ora e si può usare una volta sola. Chiedine uno nuovo: arriva in pochi minuti.', 'info');
            const a = $('link-nuovo-collegamento');
            a.setAttribute('href', nuovoCollegamento);
            a.hidden = false;
        }

        $('link-reimposta-accesso').setAttribute('href', perGestione ? '/diretta/gestione/' : '/diretta/');
        $('btn-mostra-nuova').addEventListener('click', () => {
            const b = $('btn-mostra-nuova');
            const visibili = b.getAttribute('aria-pressed') !== 'true';
            ['campo-nuova', 'campo-ripeti'].forEach(id => { $(id).type = visibili ? 'text' : 'password'; });
            b.setAttribute('aria-pressed', String(visibili));
            b.setAttribute('aria-label', visibili ? 'Nascondi le password' : 'Mostra le password');
        });
        if (perGestione) testo('etichetta-nome-reset', 'Email');

        if (!configurata()) { testo('reimposta-sottotitolo', 'La pagina non è ancora configurata.'); return; }
        if (!oob) {
            testo('reimposta-sottotitolo', 'Il collegamento non è completo.');
            avviso('Apri il collegamento direttamente dall\'email, oppure chiedine uno nuovo.', 'info');
            $('link-nuovo-collegamento').setAttribute('href', nuovoCollegamento);
            mostra('link-nuovo-collegamento', true);
            return;
        }
        try {
            await preparaAuth();
        } catch (e) {
            // come nella pagina della diretta: quasi sempre e' la rete, non il browser
            testo('reimposta-sottotitolo', erroreDiRete(e)
                ? 'Non riusciamo a caricare la pagina: controlla la connessione a internet e ricarica la pagina.'
                : 'Il browser non è aggiornato: prova con Chrome, Safari, Edge o Firefox recenti.');
            return;
        }
        let email = '';
        try {
            email = await fb.A.verifyPasswordResetCode(fb.auth, oob);
        } catch (e) {
            const c = codiceDi(e);
            if (c === 'auth/network-request-failed') {
                testo('reimposta-sottotitolo', 'Non riusciamo a verificare il collegamento: controlla la connessione e ricarica la pagina.');
                return;
            }
            mostraScaduto();
            return;
        }

        const campoNome = $('nome-utente-reset');
        campoNome.value = perGestione ? email : nomeUtente;
        mostra('riga-nome-reset', !!campoNome.value);
        testo('reimposta-sottotitolo', perGestione ? 'La userai per entrare nella gestione della diretta.'
            : 'La userai per entrare nella diretta, insieme al nome utente qui sotto.');
        mostra('form-reimposta', true);
        try { $('campo-nuova').focus({ preventScroll: true }); } catch (e) { /* niente */ }

        $('form-reimposta').addEventListener('submit', async ev => {
            ev.preventDefault();
            const p1 = $('campo-nuova').value;
            const p2 = $('campo-ripeti').value;
            if (p1.length < 8) { avviso('La password deve avere almeno 8 caratteri.', 'errore'); $('campo-nuova').focus(); return; }
            if (!/[A-Za-z]/.test(p1) || !/\d/.test(p1)) { avviso('La password deve contenere almeno una lettera e un numero.', 'errore'); $('campo-nuova').focus(); return; }
            if (p1 !== p2) { avviso('Le due password non coincidono: riscrivila uguale nel secondo campo.', 'errore'); $('campo-ripeti').focus(); return; }
            const b = $('btn-salva-password');
            b.disabled = true;
            testo(b.querySelector('.btn-testo'), 'Salvataggio…');
            avviso('');
            try {
                await fb.A.confirmPasswordReset(fb.auth, oob, p1);
            } catch (e) {
                b.disabled = false;
                testo(b.querySelector('.btn-testo'), 'Salva la password');
                const c = codiceDi(e);
                if (c === 'auth/expired-action-code' || c === 'auth/invalid-action-code') { mostraScaduto(); return; }
                if (c === 'auth/weak-password') { avviso('La password è troppo semplice: scegline una più lunga.', 'errore'); return; }
                if (c === 'auth/network-request-failed') { avviso('Connessione assente: controlla la rete e riprova.', 'errore'); return; }
                avviso('Non è stato possibile salvare la password. Riprova tra poco.', 'errore');
                return;
            }
            mostra('form-reimposta', false);
            testo('reimposta-sottotitolo', 'Password salvata.');
            const vai = $('link-dopo-reimposta');
            vai.setAttribute('href', destinazione);
            testo(vai, perGestione ? 'Vai alla gestione' : 'Vai alla diretta');

            if (perGestione || !nomeUtente) {
                avviso(perGestione ? 'Ora puoi entrare nella gestione con la nuova password.' : 'Ora puoi entrare nella diretta con la nuova password.', 'ok');
                mostra('link-dopo-reimposta', true);
                return;
            }
            // R24: si entra da soli, come se la persona avesse scritto nome utente e password
            avviso('Password salvata. Ti stiamo portando nella diretta…', 'ok');
            const r = await chiamaServizio({ azione: 'entra', nomeUtente: nomeUtente, password: p1 });
            if (r.ok && r.token) {
                try {
                    ricordaSessione(r.sessione);
                    archivio.scrivi(CHIAVE_NOME, nomeUtente);
                    await fb.A.signInWithCustomToken(fb.auth, r.token);
                    // l'evento su cui il servizio ha deciso all'accesso: la diretta apre quello
                    const e = String(r.idEvento || '');
                    location.replace('/diretta/' + (ID_EVENTO_VALIDO.test(e) ? '?e=' + encodeURIComponent(e) : ''));
                    return;
                } catch (e) { /* sotto: si entra a mano */ }
            }
            avviso('Password salvata. Ora puoi entrare nella diretta con la nuova password.', 'ok');
            mostra('link-dopo-reimposta', true);
        });
    }

    /* ---------------------------------------------------------------
       VIA
       --------------------------------------------------------------- */
    function via() {
        if (PAGINA === 'reimposta') avviaReimposta();
        else avviaDiretta();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', via);
    else via();
})();
