/* ============================================================
   GESTIONE DELLA DIRETTA (/diretta/gestione/)
   ------------------------------------------------------------
   La pagina dei gestori: eventi, regia durante la diretta,
   caricamento dei partecipanti, email con le credenziali ed
   esportazione in Excel. Niente framework e niente build: un file
   solo, letto dal browser cosi' com'e'.

   CHI PUO' ENTRARE. Solo le email dell'elenco DIRETTA_ADMIN_EMAILS
   (variabile d'ambiente su Vercel). L'accesso e' quello di Firebase
   (email e password, progetto "ngb-eventi"), ma a decidere e' il
   servizio: ogni chiamata porta il token del gestore e il servizio
   lo rifiuta se l'email non e' in elenco o se l'account non e' stato
   attivato da "Primo accesso o password dimenticata". Questa pagina
   non legge e non scrive MAI Firestore direttamente: parla solo con
   api/diretta-gestione, che fa i controlli e tiene i dati coerenti.

   SICUREZZA DEI DATI MOSTRATI. Nomi, email, aziende, titoli e
   messaggi del servizio arrivano da file caricati o da altre persone:
   si scrivono SEMPRE con textContent (mai innerHTML), cosi' un nome
   come "<img onerror=...>" resta un nome e non diventa codice.

   LE REGOLE DEL NOME UTENTE non sono qui: stanno in
   diretta/nome-utente.js (analizzaRighe), la stessa funzione che usa
   il servizio. L'anteprima del caricamento mostra quello che il
   servizio fara' davvero; la garanzia finale contro i doppioni resta
   la prenotazione transazionale sul servizio.
   ============================================================ */
(function () {
    'use strict';

    const cfg = window.NGB_DIRETTA_CONFIG || null;
    const NU = window.NGBNomeUtente || null;

    /* SheetJS serve solo per leggere il file caricato e per scrivere
       l'Excel: si carica quando serve, dalla CDN ufficiale, con
       l'impronta del file (se qualcuno lo cambiasse sulla CDN il browser
       si rifiuterebbe di eseguirlo). La 0.18.5 di cdnjs ha vulnerabilita'
       note sui file costruiti ad arte: qui si usa la 0.20.3. */
    const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    const SHEETJS_IMPRONTA = 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT';

    // la creazione degli account va a gruppi: il servizio ne accetta al
    // massimo 50 per chiamata, 25 lasciano margine sui 60 s della funzione
    const GRUPPO_CREA = 25;
    const PAUSA_CREA_MS = 300;
    const PAUSA_EMAIL_MS = 2000;
    // un altro giro di invio sta lavorando (il cron o un'altra pagina): si guarda piu' piano
    const PAUSA_OCCUPATO_MS = 5000;
    const OGNI_CONNESSI_MS = 20000;
    const MAX_RIGHE = 5000;
    const MAX_BYTE_FILE = 15 * 1024 * 1024;
    const ATTESA_ANALISI_MS = 300;
    const ATTESA_VERIFICA_MS = 600;

    const AVVISO_PASSWORD = 'La password attuale smetterà di funzionare; chi è già collegato dovrà rientrare con le nuove credenziali entro un\'ora.';

    const ETICHETTE_STATO = { programmato: 'In attesa', in_onda: 'In onda', pausa: 'In pausa', terminato: 'Terminato' };
    const STATO_GRANDE = { programmato: 'In attesa', in_onda: 'In onda', pausa: 'In pausa', terminato: 'Terminato' };
    const STATI_EMAIL = ['da inviare', 'in coda', 'invio', 'inviata', 'respinta', 'errore', 'incerto'];

    const stato = {
        fb: null,              // modulo firebase-auth
        auth: null,
        utente: null,
        emailGestore: '',
        messaggioAccesso: '',
        eventi: [],
        idEvento: '',
        evento: null,
        nuovo: false,
        idModificatoAMano: false,
        scheda: 'evento',
        partecipanti: [],
        perUid: new Map(),
        partecipantiDi: '',
        file: null,            // il file aperto: cartella di lavoro, foglio, abbinamento
        caricamento: null,     // l'anteprima in corso
        connessi: { timer: null, ultimo: null, inCorso: false },
        // la scheda Email: l'ultima risposta di email-stato, il giro di invio
        // seguito da questa pagina e da che pulsante e' partita la coda
        posta: { conteggi: {}, coda: {}, ciclo: null, risposta: null, ultimoChi: '' },
        anteprimaVideo: null,
        annullaProvaVideo: null,   // chiude la prova del video in corso, se c'e'
        inCorrezione: null
    };

    /* ============================================================
       ATTREZZI
       ============================================================ */
    const $ = sel => document.querySelector(sel);
    const pausa = ms => new Promise(r => setTimeout(r, ms));

    // un elemento con i suoi attributi e figli, senza mai passare da HTML
    function el(tag, attributi, figli) {
        const n = document.createElement(tag);
        const a = attributi || {};
        Object.keys(a).forEach(k => {
            const v = a[k];
            if (v == null || v === false) return;
            if (k === 'testo') n.textContent = String(v);
            else if (k === 'classe') n.className = v;
            else if (k === 'dati') Object.keys(v).forEach(d => { n.dataset[d] = v[d]; });
            else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'readOnly' || k === 'hidden') n[k] = v;
            else n.setAttribute(k, v === true ? '' : String(v));
        });
        (figli || []).forEach(f => {
            if (f == null || f === false) return;
            n.appendChild(typeof f === 'string' || typeof f === 'number' ? document.createTextNode(String(f)) : f);
        });
        return n;
    }

    function svuota(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }

    function plurale(n, uno, tanti) { return n === 1 ? uno : tanti; }
    function conNumero(n, uno, tanti) { return n + ' ' + plurale(n, uno, tanti); }

    function leggiPreferenza(chiave) {
        try { return localStorage.getItem(chiave) || ''; } catch (_) { return ''; }
    }
    function salvaPreferenza(chiave, valore) {
        try { localStorage.setItem(chiave, valore); } catch (_) { /* senza memoria locale si ricomincia dall'inizio */ }
    }

    /* ---------- date e ore: sempre quelle di Roma ---------- */
    const FORMATO_DATA_ORA = new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    const FORMATO_ORA = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' });
    const FORMATO_ORA_SECONDI = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const FORMATO_ESTESO = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    function parti(formato, ms) {
        const p = {};
        formato.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
        return p;
    }
    // "02/10/2026 09:15": il formato delle date nell'Excel e negli elenchi
    function dataOra(ms) {
        if (!ms && ms !== 0) return '';
        const p = parti(FORMATO_DATA_ORA, ms);
        return p.day + '/' + p.month + '/' + p.year + ' ' + p.hour + ':' + p.minute;
    }
    // "9.00", "17.30": come le scrive il sito
    function oraLeggibile(ms) {
        const p = parti(FORMATO_ORA, ms);
        return Number(p.hour) + '.' + p.minute;
    }
    function oraSecondi(ms) { return FORMATO_ORA_SECONDI.format(new Date(ms)); }
    function dataEstesa(ms) { return FORMATO_ESTESO.format(new Date(ms)); }
    // "14:30" -> "14.30"
    function oraDaCampo(hhmm) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
        return m ? Number(m[1]) + '.' + m[2] : '';
    }

    /* ---------- testo per la ricerca: minuscolo e senza accenti ---------- */
    function perRicerca(s) {
        return String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    /* ---------- il video ----------
       L'identificativo lo ricava il player (NGBPlayer.idDa), cosi' se un
       giorno si passa a Vimeo o Mux cambia solo quel file. Se il player
       non c'e' si usano le stesse regole del servizio per YouTube. */
    function idYouTube(v) {
        const s = String(v || '').trim();
        if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
        let u;
        try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (_) { return ''; }
        const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
        let id = '';
        if (host === 'youtu.be') id = u.pathname.split('/')[1] || '';
        else if (/(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
            if (u.searchParams.get('v')) id = u.searchParams.get('v');
            else {
                const m = /^\/(embed|live|shorts|v)\/([^/?#]+)/.exec(u.pathname);
                if (m) id = m[2];
            }
        }
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
    }
    function idVideoDa(url) {
        const P = window.NGBPlayer;
        if (P && typeof P.idDa === 'function') {
            try { return String(P.idDa(url) || ''); } catch (_) { return ''; }
        }
        return idYouTube(url);
    }

    /* La piattaforma del video la dice il player caricato (NGBPlayer.nome):
       i testi che la nominano (etichette, esempi di link, errori) seguono
       lui, cosi' passando a Vimeo, Mux o Cloudflare Stream non resta scritto
       "YouTube" da nessuna parte. Senza player valgono le regole di YouTube
       (idYouTube qui sopra), quindi anche i testi. */
    const PIATTAFORME = {
        youtube: { nome: 'YouTube', esempi: 'youtube.com/watch?v=…, youtu.be/…, youtube.com/live/…', segnaposto: 'https://www.youtube.com/live/…' },
        vimeo: { nome: 'Vimeo', esempi: 'vimeo.com/…, vimeo.com/event/…', segnaposto: 'https://vimeo.com/…' },
        mux: { nome: 'Mux', esempi: '', segnaposto: '' },
        cloudflare: { nome: 'Cloudflare Stream', esempi: '', segnaposto: '' }
    };
    function piattaforma() {
        const P = window.NGBPlayer;
        const chiave = P && typeof P.nome === 'string' ? P.nome.trim().toLowerCase() : 'youtube';
        if (PIATTAFORME[chiave]) return Object.assign({ chiave: chiave }, PIATTAFORME[chiave]);
        // un player che qui non si conosce: si usa il nome che dichiara
        const nome = chiave ? P.nome.trim() : '';
        return { chiave: chiave, nome: nome ? nome.charAt(0).toUpperCase() + nome.slice(1) : '', esempi: '', segnaposto: '' };
    }
    function msgLinkNonRiconosciuto() {
        const p = piattaforma();
        return 'Non riconosco un video' + (p.nome ? ' di ' + p.nome : '') + ' in questo link: incolla il link della pagina del video o della diretta'
            + (p.esempi ? ' (' + p.esempi + ')' : '') + '.';
    }
    // etichette e segnaposto della pagina, scritti nell'HTML per YouTube
    function adattaTestiPiattaforma() {
        const p = piattaforma();
        document.querySelectorAll('.nome-piattaforma').forEach(n => { n.textContent = p.nome; });
        document.querySelectorAll('[data-solo-piattaforma]').forEach(n => { n.hidden = n.dataset.soloPiattaforma !== p.chiave; });
        $('#ev-video').placeholder = p.segnaposto;
        $('#regia-video').placeholder = 'Incolla il link' + (p.nome ? ' ' + p.nome : '') + ' della diretta';
    }

    /* ============================================================
       MESSAGGI
       ============================================================ */
    function mostraMsg(elemento, testo, tipo) {
        const n = typeof elemento === 'string' ? $(elemento) : elemento;
        if (!n) return;
        n.textContent = testo || '';
        n.className = 'msg' + (tipo ? ' msg-' + tipo : '');
        n.hidden = !testo;
    }
    function nascondiMsg(elemento) { mostraMsg(elemento, '', ''); }

    // avviso breve in basso a destra (letto anche dai lettori di schermo)
    function avviso(testo, tipo) {
        const zona = $('#avvisi');
        const n = el('div', { classe: 'avviso' + (tipo ? ' ' + tipo : ''), testo: testo });
        zona.appendChild(n);
        setTimeout(() => { n.remove(); }, tipo === 'errore' ? 9000 : 6000);
    }

    /* Un pulsante che lavora: si spegne, gira la rotellina, e alla fine
       torna com'era. Evita il doppio clic che manderebbe due richieste. */
    async function conAttesa(bottone, fn) {
        if (!bottone || bottone.getAttribute('aria-busy') === 'true') return undefined;
        bottone.setAttribute('aria-busy', 'true');
        const eraSpento = bottone.disabled;
        bottone.disabled = true;
        try {
            return await fn();
        } finally {
            bottone.removeAttribute('aria-busy');
            bottone.disabled = eraSpento;
            // lo stato giusto dei pulsanti lo decidono le regole della pagina,
            // non quello che avevano prima (un invio puo' essere partito nel frattempo)
            aggiornaPulsantiRegia();
            aggiornaEtichetteEmail();
        }
    }

    function erroreGenerico(e, elemento) {
        if (e && (e.stato === 401 || e.stato === 403)) { uscitaForzata(e.msg); return; }
        const testo = (e && e.msg) || 'Qualcosa non ha funzionato: riprova.';
        if (elemento) mostraMsg(elemento, testo, 'errore');
        else avviso(testo, 'errore');
    }

    /* ============================================================
       FINESTRE (<dialog>)
       ============================================================ */
    function apriDialogo(d) {
        if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); }
        else { d.setAttribute('open', ''); d.classList.add('aperto-senza-modale'); }
    }
    function chiudiDialogo(d, valore) {
        if (typeof d.close === 'function') { if (d.open) d.close(valore); }
        else {
            d.removeAttribute('open');
            d.classList.remove('aperto-senza-modale');
            d.dispatchEvent(new Event('close'));
        }
    }
    // clic sullo sfondo scuro = annulla (il clic "sul dialogo" fuori dal contenuto)
    ['#dialogo-conferma', '#dialogo-correggi', '#dialogo-password'].forEach(sel => {
        const d = $(sel);
        d.addEventListener('click', e => { if (e.target === d) chiudiDialogo(d, 'annulla'); });
    });

    /* conferma({ titolo, testo, dettagli, ok, stile, pericolo }) -> Promise<boolean> */
    function conferma(o) {
        return new Promise(risolvi => {
            const d = $('#dialogo-conferma');
            const bOk = $('#conferma-ok');
            const bAnnulla = $('#conferma-annulla');
            const prima = document.activeElement;
            $('#conferma-titolo').textContent = o.titolo || 'Confermi?';
            $('#conferma-testo').textContent = o.testo || '';
            const ul = $('#conferma-dettagli');
            svuota(ul);
            (o.dettagli || []).filter(Boolean).forEach(t => ul.appendChild(el('li', { testo: t })));
            ul.hidden = !ul.firstChild;
            bOk.textContent = o.ok || 'Conferma';
            bOk.className = 'btn ' + (o.stile || (o.pericolo ? 'btn-pericolo' : 'btn-primario'));
            bAnnulla.textContent = o.annulla || 'Annulla';
            let esito = false;
            const suOk = () => { esito = true; chiudiDialogo(d, 'ok'); };
            const suAnnulla = () => chiudiDialogo(d, 'annulla');
            const suChiusura = () => {
                bOk.removeEventListener('click', suOk);
                bAnnulla.removeEventListener('click', suAnnulla);
                d.removeEventListener('close', suChiusura);
                if (prima && typeof prima.focus === 'function' && document.contains(prima)) { try { prima.focus(); } catch (_) { /* niente */ } }
                risolvi(esito);
            };
            bOk.addEventListener('click', suOk);
            bAnnulla.addEventListener('click', suAnnulla);
            d.addEventListener('close', suChiusura);
            apriDialogo(d);
            // per le azioni che non si possono annullare il fuoco parte da "Annulla"
            (o.pericolo ? bAnnulla : bOk).focus();
        });
    }

    /* ============================================================
       IL SERVIZIO
       ============================================================ */
    class ErroreServizio extends Error {
        constructor(stato, codice, msg) {
            super(msg);
            this.stato = stato;
            this.codice = codice || '';
            this.msg = msg;
        }
    }

    function messaggioPerStato(s) {
        if (s === 429) return 'Troppe richieste ravvicinate: attendi qualche secondo e riprova.';
        if (s >= 500) return 'Errore del servizio: riprova tra poco.';
        return 'Richiesta non accettata dal servizio.';
    }

    /* Ogni chiamata porta il token del gestore, preso subito prima (l'SDK lo
       rinnova da solo quando sta per scadere). Se il servizio risponde 401
       si riprova UNA volta con un token nuovo di zecca: capita dopo un cambio
       di password o quando il claim "gestore" e' appena stato messo. */
    async function chiama(azione, dati) {
        const corpo = JSON.stringify(Object.assign({ azione: azione }, dati || {}));
        for (let tentativo = 0; ; tentativo++) {
            const u = stato.auth && stato.auth.currentUser;
            if (!u) throw new ErroreServizio(401, 'non-autenticato', 'Sessione scaduta: accedi di nuovo.');
            let token;
            try { token = await u.getIdToken(tentativo > 0); }
            catch (_) { throw new ErroreServizio(401, 'non-autenticato', 'Sessione scaduta: accedi di nuovo.'); }
            let r;
            try {
                r = await fetch(cfg.servizio + '/diretta-gestione', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: corpo
                });
            } catch (_) {
                throw new ErroreServizio(0, 'rete', 'Connessione assente o servizio non raggiungibile: controlla la rete e riprova.');
            }
            let j = null;
            try { j = await r.json(); } catch (_) { j = null; }
            if (r.status === 401 && tentativo === 0) continue;
            if (!r.ok || !j || j.ok !== true) {
                throw new ErroreServizio(r.status, j && j.codice, (j && j.msg) || messaggioPerStato(r.status));
            }
            return j;
        }
    }

    // l'unica chiamata senza token: "Primo accesso o password dimenticata"
    async function chiamaAccesso(dati) {
        let r;
        try {
            r = await fetch(cfg.servizio + '/diretta-accesso', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dati)
            });
        } catch (_) {
            throw new ErroreServizio(0, 'rete', 'Connessione assente o servizio non raggiungibile: controlla la rete e riprova.');
        }
        let j = null;
        try { j = await r.json(); } catch (_) { j = null; }
        if (!r.ok || !j) throw new ErroreServizio(r.status, j && j.codice, (j && j.msg) || messaggioPerStato(r.status));
        return j;
    }

    /* ============================================================
       VISTE E AVVIO
       ============================================================ */
    function mostraVista(nome) {
        document.body.dataset.vista = nome;
        $('#vista-caricamento').hidden = nome !== 'caricamento';
        $('#vista-messaggio').hidden = nome !== 'messaggio';
        $('#vista-accesso').hidden = nome !== 'accesso';
        $('#vista-app').hidden = nome !== 'app';
    }

    function mostraMessaggio(titolo, testo, riprova) {
        $('#messaggio-titolo').textContent = titolo;
        $('#messaggio-testo').textContent = testo;
        const b = $('#btn-messaggio-riprova');
        b.hidden = !riprova;
        b.onclick = riprova || null;
        mostraVista('messaggio');
    }

    async function avvio() {
        if (!cfg || !NU) {
            mostraMessaggio('Gestione non disponibile', 'Mancano i file di configurazione della diretta (config.js e nome-utente.js).');
            return;
        }
        if (!cfg.emulatori && (!cfg.firebase || !cfg.firebase.apiKey || cfg.firebase.apiKey === 'DA_COMPILARE')) {
            mostraMessaggio('Gestione non ancora configurata',
                'Mancano i dati del progetto Firebase «ngb-eventi» in diretta/config.js: segui i passi del README della diretta.');
            return;
        }
        const V = cfg.versioneFirebase || '11.6.1';
        let appMod, authMod;
        try {
            [appMod, authMod] = await Promise.all([
                import('https://www.gstatic.com/firebasejs/' + V + '/firebase-app.js'),
                import('https://www.gstatic.com/firebasejs/' + V + '/firebase-auth.js')
            ]);
        } catch (_) {
            mostraMessaggio('Il browser non è aggiornato',
                'Non riesco a caricare i componenti della pagina: prova con Chrome, Safari, Edge o Firefox recenti e controlla la connessione.',
                () => location.reload());
            return;
        }
        /* L'app ha il nome predefinito, come nella pagina della diretta: la
           sessione salvata nel browser e' la stessa, ed e' quello che fa
           funzionare "Vedi come un partecipante" (la pagina /diretta/ trova
           il gestore gia' collegato e apre l'anteprima).
           initializeAuth invece di getAuth: niente gestione di popup e
           redirect (qui non servono), quindi nessun iframe nascosto verso
           il dominio di Firebase. La sessione resta sul dispositivo:
           ricaricando la pagina durante la diretta non si rifa' l'accesso. */
        const app = appMod.initializeApp(cfg.firebase);
        const auth = authMod.initializeAuth(app, {
            persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence]
        });
        auth.languageCode = 'it';
        if (cfg.emulatori && cfg.emulatori.auth) authMod.connectAuthEmulator(auth, cfg.emulatori.auth, { disableWarnings: true });
        stato.fb = authMod;
        stato.auth = auth;
        authMod.onAuthStateChanged(auth, u => { gestisciUtente(u); });
    }

    async function gestisciUtente(u) {
        if (!u) {
            stato.utente = null;
            fermaTutto();
            mostraAccesso();
            return;
        }
        if (stato.utente && stato.utente.uid === u.uid) return;
        mostraVista('caricamento');
        try {
            const r = await chiama('chi-sono');
            // il claim "gestore" appena messo arriva solo con un token nuovo
            if (r.rinnovaToken) await u.getIdToken(true);
            stato.utente = u;
            stato.emailGestore = String(r.email || u.email || '');
            await entraNellaGestione();
        } catch (e) {
            if (e.stato === 401 || e.stato === 403) {
                stato.messaggioAccesso = e.stato === 403
                    ? (e.msg || 'Questo account non è tra i gestori della diretta.')
                    : 'Sessione scaduta: accedi di nuovo.';
                try { await stato.fb.signOut(stato.auth); } catch (_) { mostraAccesso(); }
                return;
            }
            mostraMessaggio('Servizio non raggiungibile', (e && e.msg) || 'Non riesco a raggiungere il servizio: riprova tra poco.',
                () => { stato.utente = null; gestisciUtente(stato.auth.currentUser); });
        }
    }

    function mostraAccesso() {
        mostraVista('accesso');
        const b = $('#btn-gestore-entra');
        b.disabled = false;
        b.removeAttribute('aria-busy');
        if (stato.messaggioAccesso) {
            mostraMsg('#msg-gestore', stato.messaggioAccesso, 'errore');
            stato.messaggioAccesso = '';
        }
    }

    function uscitaForzata(msg) {
        stato.messaggioAccesso = msg || 'Sessione scaduta: accedi di nuovo.';
        fermaTutto();
        if (stato.fb && stato.auth) stato.fb.signOut(stato.auth).catch(() => mostraAccesso());
        else mostraAccesso();
    }

    // i comandi che la creazione degli account blocca, di nuovo utilizzabili
    function sbloccaCaricamento(sblocca) {
        $('#btn-annulla-caricamento').disabled = !sblocca;
        $('#file-partecipanti').disabled = !sblocca;
        $('#sel-evento').disabled = !sblocca;
    }

    function fermaTutto() {
        fermaConnessi();
        sbloccaCaricamento(true);
        if (stato.posta.ciclo) stato.posta.ciclo.attivo = false;
        ['#dialogo-conferma', '#dialogo-correggi', '#dialogo-password'].forEach(s => chiudiDialogo($(s), 'annulla'));
        chiudiAnteprimaVideo();
        stato.caricamento = null;
        stato.file = null;
        stato.eventi = [];
        stato.idEvento = '';
        stato.evento = null;
        stato.nuovo = false;
        stato.partecipanti = [];
        stato.perUid = new Map();
        stato.partecipantiDi = '';
    }

    /* ============================================================
       ACCESSO DEI GESTORI
       ============================================================ */
    $('#form-gestore').addEventListener('submit', async e => {
        e.preventDefault();
        const email = $('#gestore-email').value.trim();
        const password = $('#gestore-password').value;
        nascondiMsg('#msg-gestore');
        if (!email || !password) {
            mostraMsg('#msg-gestore', 'Scrivi la tua email e la password.', 'errore');
            (email ? $('#gestore-password') : $('#gestore-email')).focus();
            return;
        }
        const b = $('#btn-gestore-entra');
        b.disabled = true;
        b.setAttribute('aria-busy', 'true');
        try {
            await stato.fb.signInWithEmailAndPassword(stato.auth, email, password);
            // il resto lo fa onAuthStateChanged (controllo del servizio compreso)
        } catch (err) {
            b.disabled = false;
            b.removeAttribute('aria-busy');
            const c = String(err && err.code || '');
            let msg = 'Accesso non riuscito: riprova.';
            if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) msg = 'Email o password non corretti.';
            else if (/too-many-requests/.test(c)) msg = 'Troppi tentativi sbagliati: attendi qualche minuto oppure usa «Primo accesso o password dimenticata».';
            else if (/user-disabled/.test(c)) msg = 'Questo account è stato disattivato.';
            else if (/network-request-failed/.test(c)) msg = 'Connessione assente: controlla la rete e riprova.';
            mostraMsg('#msg-gestore', msg, 'errore');
        }
    });

    $('#btn-mostra-password-gestore').addEventListener('click', () => {
        const campo = $('#gestore-password');
        const b = $('#btn-mostra-password-gestore');
        const mostra = campo.type === 'password';
        campo.type = mostra ? 'text' : 'password';
        b.setAttribute('aria-pressed', String(mostra));
        b.setAttribute('aria-label', mostra ? 'Nascondi la password' : 'Mostra la password');
    });

    $('#link-gestore-reset').addEventListener('click', async () => {
        const email = $('#gestore-email').value.trim();
        if (!email || email.indexOf('@') < 1) {
            mostraMsg('#msg-gestore', 'Scrivi prima la tua email qui sopra, poi premi di nuovo «Primo accesso o password dimenticata».', 'errore');
            $('#gestore-email').focus();
            return;
        }
        const b = $('#link-gestore-reset');
        await conAttesa(b, async () => {
            mostraMsg('#msg-gestore', 'Invio in corso…', 'info');
            try {
                const r = await chiamaAccesso({ azione: 'gestore-accesso', email: email });
                mostraMsg('#msg-gestore', (r.msg || 'Se l\'indirizzo è tra i gestori, ti abbiamo scritto.')
                    + ' Il collegamento porta alla pagina dove scegliere la password; poi torna qui ed entra.', 'ok');
            } catch (e) {
                mostraMsg('#msg-gestore', e.msg || 'Invio non riuscito: riprova tra poco.', 'errore');
            }
        });
    });

    $('#btn-gestore-esci').addEventListener('click', async () => {
        const c = stato.caricamento;
        if (c && c.creazione && c.creazione.inCorso) {
            const ok = await conferma({ titolo: 'Uscire adesso?', testo: 'La creazione degli account è in corso: se esci si ferma. Potrai completarla ricaricando lo stesso file (non si crea niente di doppio).', ok: 'Esci comunque', pericolo: true });
            if (!ok) return;
        }
        fermaTutto();
        try { await stato.fb.signOut(stato.auth); } catch (_) { mostraAccesso(); }
    });

    /* ============================================================
       EVENTI
       ============================================================ */
    async function entraNellaGestione() {
        $('#gestore-connesso').textContent = stato.emailGestore;
        mostraVista('app');
        try {
            await caricaEventi(leggiPreferenza('ngbGestioneEvento'));
        } catch (e) {
            if (e && (e.stato === 401 || e.stato === 403)) { erroreGenerico(e); return; }
            mostraMessaggio('Servizio non raggiungibile', (e && e.msg) || 'Non riesco a leggere gli eventi: riprova tra poco.', () => entraNellaGestione());
            return;
        }
        const scheda = leggiPreferenza('ngbGestioneScheda');
        mostraScheda(stato.idEvento && scheda ? scheda : 'evento', false);
    }

    async function caricaEventi(preferito) {
        const r = await chiama('eventi');
        stato.eventi = Array.isArray(r.eventi) ? r.eventi.slice() : [];
        // se nel frattempo il gestore ha gia' premuto "Nuovo evento", non gli si
        // cambia il modulo sotto le mani: l'elenco si aggiorna e basta
        if (stato.nuovo) { riempiSelectEventi(); return; }
        let id = preferito && stato.eventi.some(e => e.id === preferito) ? preferito : '';
        if (!id) id = eventoPredefinito();
        riempiSelectEventi();
        if (id) selezionaEvento(id);
        else nuovoEvento();
    }

    // in onda o in pausa > il prossimo in programma > il piu' recente
    function eventoPredefinito() {
        const ora = Date.now();
        const vivo = stato.eventi.find(e => e.stato === 'in_onda' || e.stato === 'pausa');
        if (vivo) return vivo.id;
        const prossimi = stato.eventi.filter(e => e.stato === 'programmato' && (e.fine || 0) > ora).sort((a, b) => (a.inizio || 0) - (b.inizio || 0));
        if (prossimi.length) return prossimi[0].id;
        return stato.eventi.length ? stato.eventi[0].id : '';
    }

    function riempiSelectEventi() {
        const s = $('#sel-evento');
        svuota(s);
        if (stato.nuovo || !stato.eventi.length) s.appendChild(el('option', { value: '__nuovo', testo: 'Nuovo evento (da salvare)' }));
        stato.eventi.forEach(e => {
            const quando = e.inizio ? ' · ' + dataOra(e.inizio).slice(0, 10) : '';
            s.appendChild(el('option', { value: e.id, testo: (e.titolo || e.id) + quando }));
        });
        s.value = stato.nuovo ? '__nuovo' : stato.idEvento;
    }

    function selezionaEvento(id) {
        const ev = stato.eventi.find(e => e.id === id);
        if (!ev) return;
        const cambiato = stato.idEvento !== id;
        stato.idEvento = id;
        stato.evento = ev;
        stato.nuovo = false;
        salvaPreferenza('ngbGestioneEvento', id);
        riempiSelectEventi();
        compilaFormEvento(ev);
        aggiornaStatoEvento();
        abilitaSchede(true);
        if (cambiato) {
            chiudiAnteprimaVideo();
            annullaCaricamento();
            if (stato.posta.ciclo) stato.posta.ciclo.attivo = false;
            stato.posta = { conteggi: {}, coda: {}, ciclo: null, risposta: null, ultimoChi: '' };
            disegnaConteggi();
            $('#avanzamento-email').hidden = true;
            nascondiMsg('#coda-bloccata');
            $('#btn-riprova-invio').hidden = true;
            $('#num-connessi').textContent = '–';
            stato.connessi.ultimo = null;
            stato.partecipanti = [];
            stato.perUid = new Map();
            stato.partecipantiDi = '';
            disegnaPartecipanti();
            caricaPartecipanti();
            aggiornaStatoEmail().catch(() => { /* lo si rivede aprendo la scheda Email */ });
            if (stato.scheda === 'regia') avviaConnessi();
        }
    }

    function aggiornaEvento(ev) {
        if (!ev || !ev.id) return;
        const i = stato.eventi.findIndex(e => e.id === ev.id);
        // il conteggio degli iscritti arriva solo con l'elenco: si conserva
        if (i >= 0) {
            if (ev.iscritti == null) ev.iscritti = stato.eventi[i].iscritti;
            stato.eventi[i] = ev;
        } else stato.eventi.unshift(ev);
        if (stato.idEvento === ev.id) {
            stato.evento = ev;
            aggiornaStatoEvento();
            if (!stato.nuovo) aggiornaCampoVideo(ev);
        }
        riempiSelectEventi();
    }

    /* Il link nella scheda Evento segue quello del servizio (per esempio
       dopo un cambio dalla Regia), a meno che il gestore lo stia
       modificando: in quel caso resta quello che ha scritto, e al
       salvataggio vale come una sua scelta esplicita. */
    function aggiornaCampoVideo(ev) {
        const campo = $('#ev-video');
        const nuovo = ev.videoUrl || '';
        if (campo.value.trim() === (campo.dataset.iniziale || '')) {
            campo.value = nuovo;
            campo.removeAttribute('aria-invalid');
        }
        campo.dataset.iniziale = nuovo;
    }

    function nuovoEvento() {
        stato.nuovo = true;
        stato.idModificatoAMano = false;
        riempiSelectEventi();
        compilaFormEvento(null);
        abilitaSchede(false);
        mostraScheda('evento', false);
        $('#ev-titolo').focus();
    }

    $('#btn-nuovo-evento').addEventListener('click', async () => {
        if (!(await lasciaCaricamento())) return;
        nuovoEvento();
    });

    $('#sel-evento').addEventListener('change', async () => {
        const v = $('#sel-evento').value;
        if (v === '__nuovo') return;
        if (!(await lasciaCaricamento())) { riempiSelectEventi(); return; }
        selezionaEvento(v);
    });

    // un'anteprima non ancora trasformata in account si perde cambiando evento
    async function lasciaCaricamento() {
        const c = stato.caricamento;
        if (!c) return true;
        if (c.creazione && c.creazione.inCorso) {
            avviso('Aspetta la fine della creazione degli account prima di cambiare evento.', 'errore');
            return false;
        }
        if (c.creazione && c.creazione.finita) return true;
        return conferma({
            titolo: 'Lasciare il caricamento?',
            testo: 'L\'anteprima del file «' + c.nomeFile + '» non è ancora stata trasformata in account: se cambi evento la perdi.',
            ok: 'Lascia il caricamento'
        });
    }

    function abilitaSchede(attive) {
        ['regia', 'partecipanti', 'email', 'esporta'].forEach(n => {
            const t = document.querySelector('[data-scheda="' + n + '"]');
            t.disabled = !attive;
            t.title = attive ? '' : 'Salva prima l\'evento';
        });
    }

    /* ---------- le schede ---------- */
    const TAB = Array.from(document.querySelectorAll('.schede [role="tab"]'));

    function mostraScheda(nome, salva) {
        if (!TAB.some(t => t.dataset.scheda === nome)) nome = 'evento';
        const tab = TAB.find(t => t.dataset.scheda === nome);
        if (tab.disabled) nome = 'evento';
        stato.scheda = nome;
        if (salva !== false) salvaPreferenza('ngbGestioneScheda', nome);
        TAB.forEach(t => {
            const attiva = t.dataset.scheda === nome;
            t.setAttribute('aria-selected', String(attiva));
            t.tabIndex = attiva ? 0 : -1;
            $('#' + t.getAttribute('aria-controls')).hidden = !attiva;
        });
        if (nome === 'regia') avviaConnessi(); else fermaConnessi();
        /* L'anteprima di un video provato in un'altra scheda non serve piu'
           (e continuerebbe a scaricare il video): si chiude, ma non a meta'
           della prova, che aspetta ancora la risposta del player. */
        const anteprimaAperta = document.querySelector('.video-anteprima:not([hidden])');
        if (anteprimaAperta && !stato.annullaProvaVideo && !$('#scheda-' + nome).contains(anteprimaAperta)) chiudiAnteprimaVideo();
        mostraSchedaAttiva(TAB.find(t => t.dataset.scheda === nome));
        if (nome === 'email') aggiornaStatoEmail().catch(e => erroreGenerico(e, '#msg-email'));
        if (nome === 'partecipanti' && stato.partecipantiDi !== stato.idEvento) caricaPartecipanti();
    }

    /* ---------- le schede sul telefono ----------
       Su uno schermo stretto le cinque schede non stanno tutte in una riga
       e scorrono di lato. Perche' si capisca che ce ne sono altre, la
       testata riceve le classi altre-a-destra / altre-a-sinistra: il foglio
       di stile (solo sotto i 900px) sfuma il bordo e mette una freccia. La
       scheda scelta si porta sempre in vista, anche quando la si sceglie
       con le frecce della tastiera. Dove le schede ci stanno, niente. */
    const BARRA_SCHEDE = document.querySelector('.schede');
    const TESTATA = document.querySelector('.testata');
    function aggiornaIndizioSchede() {
        const s = BARRA_SCHEDE;
        const max = s.scrollWidth - s.clientWidth;
        TESTATA.classList.toggle('altre-a-destra', max > 1 && s.scrollLeft < max - 1);
        TESTATA.classList.toggle('altre-a-sinistra', max > 1 && s.scrollLeft > 1);
    }
    function mostraSchedaAttiva(tab) {
        const s = BARRA_SCHEDE;
        if (tab && s.scrollWidth > s.clientWidth) {
            const margine = 36; // la sfumatura sul bordo: la scheda scelta deve restarne fuori
            const b = tab.getBoundingClientRect();
            const c = s.getBoundingClientRect();
            if (b.left < c.left + margine) s.scrollLeft -= c.left + margine - b.left;
            else if (b.right > c.right - margine) s.scrollLeft += b.right - (c.right - margine);
        }
        aggiornaIndizioSchede();
    }
    BARRA_SCHEDE.addEventListener('scroll', aggiornaIndizioSchede, { passive: true });
    window.addEventListener('resize', () => mostraSchedaAttiva(TAB.find(t => t.getAttribute('aria-selected') === 'true')));
    // i caratteri del sito arrivano dopo la pagina e cambiano la larghezza delle schede
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(aggiornaIndizioSchede).catch(() => { /* niente */ });

    TAB.forEach(t => {
        t.addEventListener('click', () => mostraScheda(t.dataset.scheda));
        // frecce, Inizio e Fine come nelle schede dei programmi
        t.addEventListener('keydown', e => {
            const attivi = TAB.filter(x => !x.disabled);
            const i = attivi.indexOf(t);
            let j = -1;
            if (e.key === 'ArrowRight') j = (i + 1) % attivi.length;
            else if (e.key === 'ArrowLeft') j = (i - 1 + attivi.length) % attivi.length;
            else if (e.key === 'Home') j = 0;
            else if (e.key === 'End') j = attivi.length - 1;
            if (j < 0) return;
            e.preventDefault();
            attivi[j].focus();
            mostraScheda(attivi[j].dataset.scheda);
        });
    });

    /* ============================================================
       SCHEDA EVENTO
       ============================================================ */
    function compilaFormEvento(ev) {
        const f = $('#form-evento');
        f.querySelectorAll('[aria-invalid]').forEach(n => n.removeAttribute('aria-invalid'));
        nascondiMsg('#msg-evento');
        $('#ev-id').value = ev ? ev.id : '';
        $('#ev-id').readOnly = !!ev;
        $('#ev-titolo').value = ev ? ev.titolo || '' : '';
        $('#ev-luogo').value = ev ? ev.luogo || '' : '';
        $('#ev-data').value = ev ? ev.data || '' : '';
        $('#ev-ora-inizio').value = ev ? ev.oraInizio || '' : '';
        $('#ev-ora-fine').value = ev ? ev.oraFine || '' : '';
        // il link con cui si apre il modulo: al salvataggio si manda solo se cambiato
        $('#ev-video').value = ev ? ev.videoUrl || '' : '';
        $('#ev-video').dataset.iniziale = $('#ev-video').value;
        $('#ev-programma').value = ev && Array.isArray(ev.programma) ? ev.programma.map(v => (v.ora ? v.ora + ' ' : '') + (v.titolo || '')).join('\n') : '';
        $('#ev-pagina').value = ev ? ev.paginaEvento || '' : '';
        $('#ev-un-dispositivo').checked = !!(ev && ev.unSoloDispositivo);
        $('#ev-promemoria-giorno').checked = !!(ev && ev.promemoria && ev.promemoria.giornoPrima);
        $('#ev-promemoria-ora').checked = !!(ev && ev.promemoria && ev.promemoria.oraPrima);
        $('#titolo-form-evento').textContent = ev ? 'Dati dell\'evento' : 'Nuovo evento';
        $('#btn-salva-evento').textContent = ev ? 'Salva le modifiche' : 'Crea l\'evento';
        const info = [];
        if (ev) {
            if (ev.iscritti != null) info.push(conNumero(ev.iscritti, 'iscritto', 'iscritti'));
            if (ev.inizio) info.push(dataEstesa(ev.inizio) + ', dalle ' + oraLeggibile(ev.inizio) + (ev.fine ? ' alle ' + oraLeggibile(ev.fine) : ''));
            if (ev.aggiornato) info.push('ultima modifica ' + dataOra(ev.aggiornato));
        } else info.push('Compila i dati e crea l\'evento: poi potrai caricare i partecipanti.');
        $('#info-evento').textContent = info.join(' · ');
        aggiornaDestinatariPromemoria();
    }

    /* ---------- i promemoria: a chi arrivano e a che punto sono ----------
       Il servizio (email-stato) dice quante persone riceverebbero ciascun
       promemoria da adesso in poi (destinatariPromemoria: { giorno, ora }:
       solo chi ha le credenziali «inviata» e l'account attivo) e, in
       coda.promemoria.<tipo>, se il giro e' cominciato o finito
       ({ cominciato, quando, finito, inviate }). La finestra in cui ciascuno
       puo' partire e' la stessa di lib/diretta-invio.js: il giorno prima da
       24 ore prima dell'inizio (fino a un'ora prima, se c'e' anche l'altro),
       l'ora prima da 60 minuti prima fino alla fine. */
    const ORA_MS = 60 * 60 * 1000;
    function finestraPromemoria(ev, tipo) {
        if (!ev || !ev.inizio || !ev.fine || ev.stato === 'terminato') return null;
        const p = ev.promemoria || {};
        if (tipo === 'giorno') return { da: ev.inizio - 24 * ORA_MS, a: p.oraPrima ? ev.inizio - ORA_MS : ev.inizio };
        return { da: ev.inizio - ORA_MS, a: ev.fine };
    }
    function destinatariDi(tipo) {
        const d = stato.posta.risposta && stato.posta.risposta.destinatariPromemoria;
        if (typeof d === 'number') return d;
        return d && typeof d[tipo] === 'number' ? d[tipo] : null;
    }
    // una riga per promemoria: "partirà da solo da ..." / "già partito" / "il momento è passato"
    function descriviPromemoria(tipo) {
        const ev = stato.evento;
        if (!ev || stato.nuovo || !stato.posta.risposta) return '';
        const attivo = !!(ev.promemoria && ev.promemoria[tipo === 'giorno' ? 'giornoPrima' : 'oraPrima']);
        const giro = ((stato.posta.coda || {}).promemoria || {})[tipo] || null;
        const inviate = giro ? Number(giro.inviate || 0) : 0;
        if (giro && giro.finito) {
            return 'Già partito: ' + conNumero(inviate, 'email inviata', 'email inviate') + (giro.quando ? ' (ultimo giro ' + dataOra(giro.quando) + ')' : '') + '.';
        }
        const f = finestraPromemoria(ev, tipo);
        if (!f || Date.now() >= f.a) return attivo || giro ? 'Il momento di questo promemoria è passato: non parte più.' : '';
        const n = destinatariDi(tipo);
        if (n == null) return '';
        const chi = conNumero(n, 'persona', 'persone');
        if (giro && giro.cominciato) return 'In corso: ' + conNumero(inviate, 'email inviata', 'email inviate') + ', ne mancano ' + n + '.';
        if (!attivo) return 'Se lo attivi, oggi lo riceverebbero ' + chi + '.';
        const quando = Date.now() >= f.da ? 'al prossimo giro automatico (entro 5 minuti)' : dataEstesa(f.da) + ' dalle ' + oraLeggibile(f.da);
        return 'Parte da solo ' + quando + ': oggi lo riceverebbero ' + chi + '.';
    }
    function aggiornaDestinatariPromemoria() {
        $('#prom-dest-giorno').textContent = descriviPromemoria('giorno');
        $('#prom-dest-ora').textContent = descriviPromemoria('ora');
        $('#promemoria-destinatari').textContent = stato.nuovo ? ''
            : 'I promemoria arrivano solo a chi ha già ricevuto le credenziali e ha l\'account attivo, mai con la password. '
              + 'Le caselle valgono dopo «Salva le modifiche».';
    }

    // per un evento nuovo l'identificativo si propone da solo (luogo + anno)
    function suggerisciId() {
        if (!stato.nuovo || stato.idModificatoAMano) return;
        const luogo = $('#ev-luogo').value.split(/[·,|]/)[0].trim();
        const base = luogo || $('#ev-titolo').value.split(/[·|]/)[0].trim();
        const anno = ($('#ev-data').value || '').slice(0, 4);
        let s = perRicerca(base).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');
        if (s && anno && !s.endsWith(anno)) s += '-' + anno;
        $('#ev-id').value = s;
    }
    ['#ev-luogo', '#ev-titolo', '#ev-data'].forEach(s => $(s).addEventListener('input', suggerisciId));
    $('#ev-id').addEventListener('input', () => { stato.idModificatoAMano = true; });

    function leggiProgramma(testo) {
        const voci = [];
        const errori = [];
        String(testo || '').split(/\r?\n/).forEach((riga, i) => {
            const t = riga.trim();
            if (!t) return;
            const m = /^(\d{1,2})[.:](\d{2})(?:\s*[-–—:]\s*|\s+)(.+)$/.exec(t);
            if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
                errori.push('Riga ' + (i + 1) + ' del programma: scrivi prima l\'ora e poi il titolo (es. «09.00 Accoglienza»).');
                return;
            }
            voci.push({ ora: m[1].padStart(2, '0') + '.' + m[2], titolo: m[3].trim().slice(0, 160) });
        });
        if (voci.length > 40) errori.push('Il programma può avere al massimo 40 voci (ora sono ' + voci.length + ').');
        return { voci: voci, errori: errori };
    }

    function normalizzaPagina(v) {
        let s = String(v || '').trim();
        if (!s) return '';
        s = s.replace(/^https?:\/\/[^/]+/i, '');
        if (s[0] !== '/') s = '/' + s;
        if (!/\.[a-z0-9]+$/i.test(s) && s.slice(-1) !== '/') s += '/';
        return s;
    }

    function leggiFormEvento() {
        const errori = [];
        const segna = (sel, testo) => { $(sel).setAttribute('aria-invalid', 'true'); errori.push(testo); };
        $('#form-evento').querySelectorAll('[aria-invalid]').forEach(n => n.removeAttribute('aria-invalid'));
        const id = $('#ev-id').value.trim();
        const titolo = $('#ev-titolo').value.trim().replace(/\s+/g, ' ');
        const luogo = $('#ev-luogo').value.trim().replace(/\s+/g, ' ');
        const data = $('#ev-data').value;
        const oraInizio = $('#ev-ora-inizio').value;
        const oraFine = $('#ev-ora-fine').value;
        const videoUrl = $('#ev-video').value.trim();
        const pagina = normalizzaPagina($('#ev-pagina').value);
        const programma = leggiProgramma($('#ev-programma').value);

        if (stato.nuovo && !/^[a-z0-9][a-z0-9-]{2,40}$/.test(id)) segna('#ev-id', 'Identificativo: da 3 a 41 caratteri, solo lettere minuscole, numeri e trattini (es. napoli-2026).');
        if (titolo.length < 3 || titolo.length > 140) segna('#ev-titolo', 'Titolo: da 3 a 140 caratteri.');
        if (luogo.length > 140) segna('#ev-luogo', 'Luogo: al massimo 140 caratteri.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || isNaN(Date.parse(data + 'T12:00:00Z'))) segna('#ev-data', 'Data: scegli il giorno dell\'evento.');
        if (!/^\d{2}:\d{2}$/.test(oraInizio)) segna('#ev-ora-inizio', 'Ora di inizio mancante.');
        if (!/^\d{2}:\d{2}$/.test(oraFine)) segna('#ev-ora-fine', 'Ora di fine mancante.');
        else if (/^\d{2}:\d{2}$/.test(oraInizio) && oraFine <= oraInizio) segna('#ev-ora-fine', 'L\'ora di fine deve venire dopo quella di inizio.');
        const videoId = videoUrl ? idVideoDa(videoUrl) : '';
        if (videoUrl && !videoId) segna('#ev-video', msgLinkNonRiconosciuto());
        if (pagina && !/^\/[a-z0-9_\/-]*\/?$/.test(pagina)) segna('#ev-pagina', 'Pagina dell\'evento: solo il percorso, per esempio /napoli_ottobre_2026/.');
        if (programma.errori.length) { $('#ev-programma').setAttribute('aria-invalid', 'true'); errori.push.apply(errori, programma.errori); }

        return {
            errori: errori,
            evento: {
                id: stato.nuovo ? id : stato.idEvento,
                nuovo: stato.nuovo,
                titolo: titolo, luogo: luogo, data: data, oraInizio: oraInizio, oraFine: oraFine,
                videoUrl: videoUrl, videoId: videoId,
                programma: programma.voci,
                paginaEvento: pagina,
                unSoloDispositivo: $('#ev-un-dispositivo').checked,
                promemoria: { giornoPrima: $('#ev-promemoria-giorno').checked, oraPrima: $('#ev-promemoria-ora').checked }
            }
        };
    }

    $('#form-evento').addEventListener('submit', async e => {
        e.preventDefault();
        const { errori, evento } = leggiFormEvento();
        if (errori.length) {
            mostraMsg('#msg-evento', errori.join(' '), 'errore');
            const primo = $('#form-evento [aria-invalid="true"]');
            if (primo) primo.focus();
            return;
        }
        /* Il link del video si manda solo se il gestore l'ha cambiato qui.
           Il campo e' stato riempito quando si e' aperto l'evento: se nel
           frattempo il video e' stato cambiato dalla Regia (da un altro
           gestore, o da un'altra scheda del browser), rimandare quel valore
           per correggere, per esempio, il titolo rimetterebbe a tutti il
           video vecchio. Senza videoUrl il servizio tiene quello che ha. */
        const campoVideo = $('#ev-video');
        const eraNuovo = stato.nuovo;
        const videoCambiato = eraNuovo || evento.videoUrl !== (campoVideo.dataset.iniziale || '');
        if (!videoCambiato) { delete evento.videoUrl; delete evento.videoId; }
        const inOnda = !eraNuovo && !!stato.evento && stato.evento.stato === 'in_onda';
        $('#ev-pagina').value = evento.paginaEvento;
        await conAttesa($('#btn-salva-evento'), async () => {
            /* Un link nuovo si prova prima di salvarlo, con lo stesso player dei
               partecipanti e le stesse regole della Regia (R8): un video che la
               piattaforma non lascia incorporare si blocca qui, non quando la
               diretta va in onda. */
            let prova = { ok: true };
            if (videoCambiato && evento.videoId) {
                mostraMsg('#msg-evento', 'Controllo del video in corso…', 'info');
                prova = await provaVideo(evento.videoId, $('#ev-video-anteprima'));
                // nel frattempo si e' passati a un altro evento: questo salvataggio non vale piu'
                if (eraNuovo ? !stato.nuovo : stato.idEvento !== evento.id) { nascondiMsg('#msg-evento'); return; }
                if (prova.annullata) { mostraMsg('#msg-evento', 'Controllo del video interrotto (anteprima chiusa): non ho salvato niente.', 'info'); return; }
                if (!prova.ok) {
                    campoVideo.setAttribute('aria-invalid', 'true');
                    mostraMsg('#msg-evento', 'Questo video non si può usare: ' + prova.motivo + ' Non ho salvato niente.', 'errore');
                    campoVideo.focus();
                    return;
                }
                nascondiMsg('#msg-evento');
            }
            if (videoCambiato && inOnda) {
                const ok = await conferma(evento.videoUrl ? {
                    titolo: 'Cambiare il video per tutti?',
                    testo: 'La diretta è in onda: chi è collegato passa al nuovo video da solo, in pochi secondi.'
                        + (prova.avviso ? '\n' + prova.avviso : '') + (prova.saltata ? '\nL\'anteprima del video non è disponibile in questa pagina: controlla con «Vedi come un partecipante».' : ''),
                    ok: 'Cambia il video'
                } : {
                    titolo: 'Togliere il video?',
                    testo: 'La diretta è in onda: i partecipanti vedranno «Il video sta per arrivare» finché non ne inserisci un altro.',
                    ok: 'Togli il video', pericolo: true
                });
                if (!ok) return;
            }
            try {
                const r = await chiama('evento-salva', { evento: evento });
                if (eraNuovo) r.evento.iscritti = r.evento.iscritti || 0;
                stato.nuovo = false;
                aggiornaEvento(r.evento);
                selezionaEvento(r.evento.id);
                const notaVideo = videoCambiato && evento.videoUrl && prova.avviso ? ' ' + prova.avviso : '';
                mostraMsg('#msg-evento', (eraNuovo
                    ? 'Evento creato. Ora carica i partecipanti dalla scheda Partecipanti.'
                    : 'Modifiche salvate.' + (videoCambiato && inOnda ? (evento.videoUrl ? ' I partecipanti collegati passano al nuovo video.' : ' Video tolto.') : '')) + notaVideo, 'ok');
                // orari e caselle dei promemoria cambiano chi li riceve e quando
                if (!eraNuovo) aggiornaStatoEmail().catch(() => { /* lo si rivede aprendo la scheda Email */ });
            } catch (err) {
                if (err.stato === 409) {
                    $('#ev-id').setAttribute('aria-invalid', 'true');
                    mostraMsg('#msg-evento', err.msg || 'Esiste già un evento con questo identificativo: scegline un altro.', 'errore');
                } else erroreGenerico(err, '#msg-evento');
            }
        });
    });

    /* ============================================================
       SCHEDA REGIA
       ============================================================ */
    function aggiornaStatoEvento() {
        const ev = stato.evento;
        const s = ev ? ev.stato || 'programmato' : '';
        const pillola = $('#stato-testata');
        pillola.textContent = ev && !stato.nuovo ? ETICHETTE_STATO[s] || s : '';
        pillola.dataset.stato = s;

        const grande = $('#regia-stato');
        grande.dataset.stato = s;
        $('#regia-stato-testo').textContent = ev ? (STATO_GRANDE[s] || s).toUpperCase() : '—';

        const righe = [];
        if (ev && ev.inizio) righe.push(dataEstesa(ev.inizio) + ', dalle ' + oraLeggibile(ev.inizio) + (ev.fine ? ' alle ' + oraLeggibile(ev.fine) : '') + ' (ora italiana)');
        if (ev && s === 'in_onda' && ev.statoAggiornato) righe.push('in onda dalle ' + oraLeggibile(ev.statoAggiornato));
        if (ev && s === 'pausa') righe.push(ev.ripresa ? 'si riprende alle ' + oraDaCampo(ev.ripresa) : 'senza orario di ripresa');
        if (ev && s === 'terminato' && ev.statoAggiornato) righe.push('terminata alle ' + oraLeggibile(ev.statoAggiornato));
        $('#regia-orari').textContent = righe.join(' · ');

        aggiornaAvvisoOrario();

        $('#regia-video-attuale').textContent = ev && ev.videoUrl ? (ev.videoId ? ev.videoId + ' · ' : '') + ev.videoUrl : 'nessuno';
        /* Il link vive in un documento riservato del servizio: ai partecipanti
           l'identificativo arriva solo mentre si e' in onda (videoInOnda e'
           quello che vedono adesso). Qui si dice in chiaro che cosa vedono. */
        let pubblico = '';
        if (ev && ev.videoId) {
            if (ev.videoInOnda && ev.videoInOnda === ev.videoId) pubblico = 'I partecipanti collegati stanno guardando questo video.';
            else if (ev.videoInOnda) pubblico = 'I partecipanti stanno ancora ricevendo il video precedente (' + ev.videoInOnda + '): aggiorna la pagina tra qualche secondo.';
            else pubblico = 'I partecipanti lo ricevono solo mentre la diretta è in onda: prima e dopo il link resta riservato.';
        } else if (ev && s === 'in_onda') pubblico = 'Nessun video impostato: i partecipanti vedono «Il video sta per arrivare».';
        $('#regia-video-pubblico').textContent = pubblico;
        $('#regia-avviso-attuale').textContent = ev && ev.avviso ? '«' + ev.avviso + '»' : 'nessuno';
        if (ev && ev.ripresa && !$('#regia-ripresa').value) $('#regia-ripresa').value = ev.ripresa;
        aggiornaPulsantiRegia();
        aggiornaDettaglioConnessi();
    }

    // l'orario d'inizio e' passato e nessuno ha premuto "Vai in onda"
    // (si ricontrolla a ogni aggiornamento dei collegati, ogni 20 secondi)
    function aggiornaAvvisoOrario() {
        const ev = stato.evento;
        const adesso = Date.now();
        const ritardo = ev && (ev.stato || 'programmato') === 'programmato' && ev.inizio && adesso >= ev.inizio && (!ev.fine || adesso < ev.fine);
        mostraMsg('#regia-avviso-orario', ritardo
            ? 'L\'orario d\'inizio (' + oraLeggibile(ev.inizio) + ') è passato e la diretta non è ancora in onda: i partecipanti vedono ancora la schermata di attesa.'
            : '', 'attenzione');
    }

    function aggiornaPulsantiRegia() {
        const ev = stato.evento;
        const s = ev ? ev.stato || 'programmato' : '';
        const occupato = id => $(id).getAttribute('aria-busy') === 'true';
        const imposta = (id, attivo) => { if (!occupato(id)) $(id).disabled = !attivo; };
        const inOnda = $('#btn-in-onda');
        inOnda.hidden = s === 'pausa';
        $('#btn-riprendi').hidden = s !== 'pausa';
        inOnda.querySelector('.etichetta-btn').textContent = s === 'terminato' ? 'Rimanda in onda' : 'Vai in onda';
        imposta('#btn-in-onda', !!ev && (s === 'programmato' || s === 'terminato'));
        imposta('#btn-riprendi', !!ev && s === 'pausa');
        imposta('#btn-termina', !!ev && s !== 'terminato');
        imposta('#btn-pausa', !!ev && s === 'in_onda');
        imposta('#btn-riprogramma', !!ev && s !== 'programmato');
    }

    async function cambiaStato(nuovo, bottone) {
        const ev = stato.evento;
        if (!ev) return;
        let domanda;
        const ripresa = $('#regia-ripresa').value;
        if (nuovo === 'in_onda' && ev.stato === 'pausa') {
            domanda = { titolo: 'Riprendere la diretta?', testo: 'Il video torna per tutti i partecipanti collegati.', ok: 'Riprendi', stile: 'btn-onda' };
        } else if (nuovo === 'in_onda') {
            // un evento di un altro giorno in onda e' quasi sempre l'evento sbagliato nel menu
            const altroGiorno = ev.inizio && dataOra(ev.inizio).slice(0, 10) !== dataOra(Date.now()).slice(0, 10);
            domanda = {
                titolo: 'Mandare in onda la diretta?',
                testo: (ev.videoId
                    ? 'Il video è impostato (' + ev.videoId + '). Chi è collegato lo vede subito; chi apre la pagina entra direttamente nella diretta.'
                    : 'Il video NON è impostato: finché non inserisci il link, i partecipanti vedranno «Il video sta per arrivare».')
                    + (altroGiorno ? '\nAttenzione: «' + (ev.titolo || ev.id) + '» è previsto per ' + dataEstesa(ev.inizio) + ', non per oggi. Controlla di aver scelto l\'evento giusto.' : ''),
                ok: 'Vai in onda', stile: 'btn-onda'
            };
        } else if (nuovo === 'pausa') {
            domanda = {
                titolo: 'Mettere in pausa?',
                testo: 'Il video sparisce per tutti e compare «Pausa»' + (ripresa ? ' con la ripresa alle ' + oraDaCampo(ripresa) + '.' : ', senza orario di ripresa.'),
                ok: 'Metti in pausa'
            };
        } else if (nuovo === 'terminato') {
            const n = stato.connessi.ultimo;
            domanda = {
                titolo: 'Terminare la diretta per tutti' + (n != null ? ' (' + conNumero(n, 'collegato', 'collegati') + ')' : '') + '?',
                testo: 'Il video sparisce e compare il messaggio di fine. Se serve, puoi rimandarla in onda.',
                ok: 'Termina la diretta', pericolo: true
            };
        } else {
            domanda = { titolo: 'Riportare l\'evento in attesa?', testo: 'I partecipanti tornano alla schermata di attesa con il conto alla rovescia.', ok: 'Riporta in attesa' };
        }
        if (!(await conferma(domanda))) return;
        await conAttesa(bottone, async () => {
            try {
                const dati = { idEvento: ev.id, stato: nuovo };
                if (nuovo === 'pausa') dati.ripresa = ripresa || '';
                const r = await chiama('evento-stato', dati);
                aggiornaEvento(r.evento);
                const detto = { in_onda: 'La diretta è in onda.', pausa: 'Diretta in pausa.', terminato: 'Diretta terminata.', programmato: 'Evento riportato in attesa.' };
                mostraMsg('#msg-regia', detto[nuovo] || 'Stato aggiornato.', 'ok');
                aggiornaConnessi();
            } catch (e) { erroreGenerico(e, '#msg-regia'); }
        });
    }
    $('#btn-in-onda').addEventListener('click', () => cambiaStato('in_onda', $('#btn-in-onda')));
    $('#btn-riprendi').addEventListener('click', () => cambiaStato('in_onda', $('#btn-riprendi')));
    $('#btn-termina').addEventListener('click', () => cambiaStato('terminato', $('#btn-termina')));
    $('#btn-pausa').addEventListener('click', () => cambiaStato('pausa', $('#btn-pausa')));
    $('#btn-riprogramma').addEventListener('click', () => cambiaStato('programmato', $('#btn-riprogramma')));

    /* ---------- collegati adesso ----------
       Una chiamata ogni 20 secondi, SOLO mentre la scheda Regia e' aperta
       e la pagina e' in primo piano: il conteggio costa letture su
       Firestore e non serve a nessuno quando non lo si guarda. */
    function avviaConnessi() {
        fermaConnessi();
        if (!stato.idEvento) return;
        aggiornaConnessi();
        stato.connessi.timer = setInterval(() => {
            if (document.visibilityState === 'visible') aggiornaConnessi();
        }, OGNI_CONNESSI_MS);
    }
    function fermaConnessi() {
        if (stato.connessi.timer) clearInterval(stato.connessi.timer);
        stato.connessi.timer = null;
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && stato.scheda === 'regia' && stato.connessi.timer) aggiornaConnessi();
    });

    async function aggiornaConnessi() {
        const id = stato.idEvento;
        if (!id || stato.connessi.inCorso || !stato.utente) return;
        stato.connessi.inCorso = true;
        try {
            const r = await chiama('connessi', { idEvento: id });
            if (id !== stato.idEvento) return;
            stato.connessi.ultimo = Number(r.connessi) || 0;
            $('#num-connessi').textContent = stato.connessi.ultimo.toLocaleString('it-IT');
            $('#connessi-aggiornato').textContent = 'Aggiornato alle ' + oraSecondi(r.quando || Date.now()) + ' · si aggiorna da solo ogni 20 secondi mentre questa scheda è aperta.';
            aggiornaDettaglioConnessi();
            aggiornaAvvisoOrario();
        } catch (e) {
            if (e.stato === 401 || e.stato === 403) { erroreGenerico(e); return; }
            $('#connessi-aggiornato').textContent = 'Conteggio non aggiornato: ' + (e.msg || 'errore') + ' Riprovo tra 20 secondi.';
        } finally {
            stato.connessi.inCorso = false;
        }
    }
    function aggiornaDettaglioConnessi() {
        const ev = stato.evento;
        // l'elenco caricato e' piu' fresco del conteggio arrivato con gli eventi
        // (qualcuno puo' essere stato tolto o aggiunto nel frattempo)
        const iscritti = stato.partecipantiDi === stato.idEvento ? stato.partecipanti.length
            : (ev && ev.iscritti != null ? ev.iscritti : null);
        $('#connessi-dettaglio').textContent = 'persone con la pagina aperta negli ultimi due minuti e mezzo'
            + (iscritti != null ? ', su ' + conNumero(iscritti, 'iscritto', 'iscritti') : '');
    }
    $('#btn-aggiorna-connessi').addEventListener('click', () => conAttesa($('#btn-aggiorna-connessi'), aggiornaConnessi));

    /* ---------- il video ----------
       Prima di cambiarlo lo si prova qui con lo stesso player della
       pagina dei partecipanti, dalla Regia come dalla scheda Evento: se
       la piattaforma non consente di incorporarlo, o il video non esiste,
       lo si scopre ora e non davanti a mille persone.
       I codici qui sotto sono quelli del player di YouTube (101/150/153:
       incorporamento non consentito, 100: video inesistente); un altro
       player manda il suo messaggio, che si mostra cosi' com'e'. */
    const MOTIVI_YOUTUBE = {
        2: 'l\'identificativo del video non è valido.',
        5: 'il player non riesce a riprodurlo.',
        100: 'il video non esiste, è privato o è stato rimosso.',
        101: 'il proprietario non consente di incorporarlo in altri siti (su YouTube: consenti l\'incorporamento).',
        150: 'il proprietario non consente di incorporarlo in altri siti (su YouTube: consenti l\'incorporamento).',
        153: 'YouTube rifiuta la richiesta di questa pagina: controlla che l\'incorporamento sia consentito.'
    };
    function motivoVideo(err) {
        const codice = err && err.codice;
        const noto = piattaforma().chiave === 'youtube' ? MOTIVI_YOUTUBE[codice] : '';
        return noto || (err && err.messaggio) || ('errore ' + codice + ' del player.');
    }

    // una sola anteprima alla volta, nel riquadro della scheda da cui la si chiede;
    // chiuderla a meta' della prova la interrompe (e non si cambia niente)
    function chiudiAnteprimaVideo() {
        if (stato.annullaProvaVideo) stato.annullaProvaVideo();
        const p = stato.anteprimaVideo;
        stato.anteprimaVideo = null;
        if (p && typeof p.distruggi === 'function') { try { p.distruggi(); } catch (_) { /* gia' distrutto */ } }
        document.querySelectorAll('.video-anteprima').forEach(box => {
            box.hidden = true;
            svuota(box.querySelector('.video-anteprima-cornice'));
        });
    }
    document.querySelectorAll('.btn-chiudi-anteprima-video').forEach(b => b.addEventListener('click', chiudiAnteprimaVideo));

    // -> { ok, motivo?, saltata?, avviso?, annullata? }
    function provaVideo(id, box) {
        const P = window.NGBPlayer;
        if (!P || typeof P.crea !== 'function') return Promise.resolve({ ok: true, saltata: true });
        chiudiAnteprimaVideo();
        const cornice = box.querySelector('.video-anteprima-cornice');
        const posto = el('div', { id: box.id + '-player' });
        cornice.appendChild(posto);
        box.hidden = false;
        return new Promise(risolvi => {
            let finito = false;
            let pronto = false;
            const fine = esito => {
                if (finito) return;
                finito = true;
                if (stato.annullaProvaVideo === annulla) stato.annullaProvaVideo = null;
                clearTimeout(limite);
                risolvi(esito);
            };
            const annulla = () => fine({ ok: false, annullata: true });
            stato.annullaProvaVideo = annulla;
            // se il player non dice niente entro 10 s non si blocca il gestore:
            // lo si avvisa di controllare dalla pagina dei partecipanti
            const limite = setTimeout(() => fine({ ok: true, avviso: pronto ? '' : 'L\'anteprima non ha risposto: controlla il video con «Vedi come un partecipante».' }), 10000);
            try {
                stato.anteprimaVideo = P.crea(posto, {
                    livelloTrasparente: false,
                    onPronto: () => { pronto = true; setTimeout(() => fine({ ok: true }), 2500); },
                    onStato: s => { if (s === 'riproduzione') setTimeout(() => fine({ ok: true }), 800); },
                    onErrore: err => {
                        const codice = err && err.codice;
                        // "lento" e "api" dicono che l'anteprima non si e' caricata qui,
                        // non che il video sia sbagliato: non si blocca il gestore
                        if (codice === 'lento' || codice === 'api') {
                            fine({ ok: true, avviso: 'L\'anteprima non si è caricata (' + ((err && err.messaggio) || codice) + '): controlla il video con «Vedi come un partecipante».' });
                            return;
                        }
                        fine({ ok: false, codice: codice, motivo: motivoVideo(err) });
                    }
                });
                if (stato.anteprimaVideo && typeof stato.anteprimaVideo.carica === 'function') stato.anteprimaVideo.carica(id);
            } catch (_) {
                fine({ ok: true, saltata: true });
            }
        });
    }

    $('#form-video').addEventListener('submit', async e => {
        e.preventDefault();
        const ev = stato.evento;
        if (!ev) return;
        const url = $('#regia-video').value.trim();
        const id = url ? idVideoDa(url) : '';
        const b = $('#btn-cambia-video');
        if (url && !id) {
            $('#regia-video').setAttribute('aria-invalid', 'true');
            mostraMsg('#msg-video', msgLinkNonRiconosciuto(), 'errore');
            return;
        }
        $('#regia-video').removeAttribute('aria-invalid');
        if (!url && !ev.videoUrl) { mostraMsg('#msg-video', 'Incolla il link del video.', 'errore'); return; }
        await conAttesa(b, async () => {
            let prova = { ok: true };
            if (id) {
                mostraMsg('#msg-video', 'Controllo del video in corso…', 'info');
                prova = await provaVideo(id, $('#regia-video-anteprima'));
                // nel frattempo si e' passati a un altro evento: non si cambia niente
                if (stato.idEvento !== ev.id) { nascondiMsg('#msg-video'); return; }
                if (prova.annullata) { mostraMsg('#msg-video', 'Controllo del video interrotto (anteprima chiusa): non ho cambiato niente.', 'info'); return; }
                if (!prova.ok) {
                    mostraMsg('#msg-video', 'Questo video non si può usare: ' + prova.motivo + ' Non ho cambiato niente.', 'errore');
                    return;
                }
                nascondiMsg('#msg-video');
            }
            const inOnda = ev.stato === 'in_onda';
            const ok = await conferma(url ? {
                titolo: 'Cambiare il video per tutti?',
                testo: (inOnda ? 'La diretta è in onda: chi è collegato passa al nuovo video da solo, in pochi secondi.' : 'Il nuovo video partirà quando la diretta andrà in onda.')
                    + (prova.avviso ? '\n' + prova.avviso : '') + (prova.saltata ? '\nL\'anteprima del video non è disponibile in questa pagina: controlla con «Vedi come un partecipante».' : ''),
                ok: 'Cambia il video'
            } : {
                titolo: 'Togliere il video?',
                testo: inOnda ? 'La diretta è in onda: i partecipanti vedranno «Il video sta per arrivare» finché non ne inserisci un altro.' : 'L\'evento resterà senza video finché non ne inserisci uno.',
                ok: 'Togli il video', pericolo: true
            });
            if (!ok) return;
            try {
                const r = await chiama('evento-video', { idEvento: ev.id, videoUrl: url, videoId: id });
                // aggiornaEvento rimette nella scheda Evento il link appena applicato
                aggiornaEvento(r.evento);
                $('#regia-video').value = '';
                mostraMsg('#msg-video', url ? 'Video aggiornato' + (inOnda ? ': i partecipanti collegati passano al nuovo video.' : '.') : 'Video tolto.', 'ok');
            } catch (err) { erroreGenerico(err, '#msg-video'); }
        });
    });

    /* ---------- avviso a tutti ---------- */
    $('#regia-avviso').addEventListener('input', () => {
        const n = $('#regia-avviso').value.length;
        $('#avviso-caratteri').textContent = n ? n + ' di 200 caratteri' : '';
    });
    async function pubblicaAvviso(testo, bottone) {
        const ev = stato.evento;
        if (!ev) return;
        await conAttesa(bottone, async () => {
            try {
                const r = await chiama('evento-avviso', { idEvento: ev.id, avviso: testo });
                aggiornaEvento(r.evento);
                mostraMsg('#msg-avviso', testo ? 'Avviso pubblicato: lo vedono tutti i partecipanti.' : 'Avviso tolto.', 'ok');
                if (testo) { $('#regia-avviso').value = ''; $('#avviso-caratteri').textContent = ''; }
            } catch (e) { erroreGenerico(e, '#msg-avviso'); }
        });
    }
    $('#form-avviso').addEventListener('submit', async e => {
        e.preventDefault();
        const testo = $('#regia-avviso').value.trim().replace(/\s+/g, ' ').slice(0, 200);
        if (!testo) { mostraMsg('#msg-avviso', 'Scrivi il testo dell\'avviso.', 'errore'); return; }
        const ok = await conferma({ titolo: 'Pubblicare l\'avviso per tutti?', testo: '«' + testo + '»\nCompare in cima alla pagina di tutti i partecipanti finché non lo togli.', ok: 'Pubblica' });
        if (ok) pubblicaAvviso(testo, $('#btn-avviso'));
    });
    $('#btn-togli-avviso').addEventListener('click', () => {
        if (!stato.evento || !stato.evento.avviso) { mostraMsg('#msg-avviso', 'Non c\'è nessun avviso da togliere.', 'info'); return; }
        pubblicaAvviso('', $('#btn-togli-avviso'));
    });

    /* ---------- vedi come un partecipante ---------- */
    $('#btn-anteprima').addEventListener('click', () => {
        if (!stato.idEvento) return;
        // nelle prove in locale la nuova scheda deve parlare con gli stessi emulatori
        const url = '../?anteprima=' + encodeURIComponent(stato.idEvento) + (cfg.emulatori ? '&emulatori=1' : '');
        window.open(url, '_blank', 'noopener');
    });

    /* ============================================================
       SCHEDA PARTECIPANTI: LETTURA DEL FILE
       ============================================================ */
    let promessaSheetJS = null;
    function caricaSheetJS() {
        if (window.XLSX && window.XLSX.utils) return Promise.resolve(window.XLSX);
        if (!promessaSheetJS) {
            promessaSheetJS = new Promise((risolvi, rifiuta) => {
                const s = document.createElement('script');
                s.src = SHEETJS_URL;
                s.integrity = SHEETJS_IMPRONTA;
                s.crossOrigin = 'anonymous';
                s.async = true;
                s.onload = () => (window.XLSX && window.XLSX.utils ? risolvi(window.XLSX) : rifiuta(new Error('SheetJS assente')));
                s.onerror = () => { promessaSheetJS = null; s.remove(); rifiuta(new Error('SheetJS non caricato')); };
                document.head.appendChild(s);
            });
        }
        return promessaSheetJS;
    }

    /* Un CSV salvato da Excel su Windows e' spesso in "windows-1252", non
       in UTF-8: si prova prima UTF-8 in modo severo e, se non torna, si
       rilegge con la codifica di Windows. Cosi' "Nicolò" resta Nicolò. */
    function decodificaTesto(buf) {
        try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
        catch (_) { return new TextDecoder('windows-1252').decode(buf); }
    }

    function eTesto(file) {
        return /\.(csv|txt)$/i.test(file.name) || /^text\//i.test(file.type || '');
    }

    $('#link-modello').addEventListener('click', e => {
        e.preventDefault();
        // il BOM iniziale fa aprire il file a Excel con gli accenti giusti; la riga
        // d'esempio usa un dominio riservato (example.com) che non riceve posta:
        // se restasse nel file, le credenziali non finirebbero a uno sconosciuto
        const testo = '﻿nome;cognome;email;azienda\r\nMario;Rossi;mario.rossi@example.com;Esempio S.r.l.\r\n';
        const url = URL.createObjectURL(new Blob([testo], { type: 'text/csv;charset=utf-8' }));
        const a = el('a', { href: url, download: 'modello-partecipanti.csv' });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    });

    $('#file-partecipanti').addEventListener('change', async () => {
        const input = $('#file-partecipanti');
        const file = input.files && input.files[0];
        input.value = ''; // cosi' si puo' scegliere di nuovo lo stesso file
        if (!file) return;
        if (!stato.idEvento) { mostraMsg('#msg-caricamento', 'Salva prima l\'evento.', 'errore'); return; }
        const c = stato.caricamento;
        if (c && c.creazione && c.creazione.inCorso) return;
        if (c && !(c.creazione && c.creazione.finita)) {
            const ok = await conferma({ titolo: 'Sostituire il caricamento?', testo: 'L\'anteprima di «' + c.nomeFile + '» non è ancora stata trasformata in account: la sostituisco con il nuovo file.', ok: 'Sostituisci' });
            if (!ok) return;
        }
        apriFile(file);
    });

    async function apriFile(file) {
        annullaCaricamento();
        $('#esito-crea').hidden = true;
        $('#nome-file').textContent = file.name;
        if (file.size > MAX_BYTE_FILE) { mostraMsg('#msg-caricamento', 'Il file è troppo grande (più di 15 MB): dividilo in più file.', 'errore'); return; }
        mostraMsg('#msg-caricamento', 'Lettura del file…', 'info');
        let XLSX;
        try { XLSX = await caricaSheetJS(); }
        catch (_) { mostraMsg('#msg-caricamento', 'Non riesco a caricare il lettore dei file (SheetJS): controlla la connessione e riprova.', 'errore'); return; }
        let wb;
        try {
            const buf = await file.arrayBuffer();
            // raw: il testo dei CSV resta testo ("0039..." non diventa un numero)
            if (eTesto(file)) wb = XLSX.read(decodificaTesto(buf), { type: 'string', raw: true, cellFormula: false, cellHTML: false });
            else wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellFormula: false, cellHTML: false, cellDates: false });
        } catch (_) {
            mostraMsg('#msg-caricamento', 'Il file non si legge: deve essere un CSV o un file Excel (.xlsx, .xls).', 'errore');
            return;
        }
        if (!wb || !wb.SheetNames || !wb.SheetNames.length) { mostraMsg('#msg-caricamento', 'Il file è vuoto.', 'errore'); return; }
        stato.file = { nome: file.name, wb: wb, XLSX: XLSX, foglio: '', tabella: [], inizio: 0 };
        const sf = $('#sel-foglio');
        svuota(sf);
        wb.SheetNames.forEach(n => sf.appendChild(el('option', { value: n, testo: n })));
        $('#scelta-foglio').hidden = wb.SheetNames.length < 2;
        preparaFoglio(wb.SheetNames[0]);
    }

    $('#sel-foglio').addEventListener('change', () => {
        if (!stato.file) return;
        annullaCaricamento(true);
        preparaFoglio($('#sel-foglio').value);
    });

    function preparaFoglio(nome) {
        const f = stato.file;
        const ws = f.wb.Sheets[nome];
        f.foglio = nome;
        $('#sel-foglio').value = nome;
        if (!ws || !ws['!ref']) { mostraMsg('#msg-caricamento', 'Il foglio «' + nome + '» è vuoto.', 'errore'); $('#abbina-colonne').hidden = true; return; }
        // blankrows: true -> l'indice della riga corrisponde alla riga di Excel
        f.tabella = f.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: true });
        f.inizio = f.XLSX.utils.decode_range(ws['!ref']).s.r;
        const trovate = riconosciColonne(f.tabella);
        f.abbinamento = trovate;
        const completo = trovate.colonne.nome >= 0 && trovate.colonne.cognome >= 0 && trovate.colonne.email >= 0 && trovate.colonne.nome !== trovate.colonne.cognome;
        if (completo) {
            nascondiMsg('#msg-caricamento');
            $('#abbina-colonne').hidden = true;
            costruisciRighe(trovate);
        } else {
            nascondiMsg('#msg-caricamento');
            mostraAbbinamento(trovate);
        }
    }

    /* ---------- le intestazioni ----------
       Si riconoscono senza badare a maiuscole, accenti e spazi, e per
       "contiene": "E-mail aziendale" e' l'email, "Ragione sociale" e'
       l'azienda. L'ordine dei controlli conta: "cognome" contiene "nome",
       e "Nome e cognome" e' una colonna sola con tutti e due. */
    function normIntestazione(s) {
        return perRicerca(s).replace(/[^a-z0-9]+/g, ' ').trim();
    }
    function tipoColonna(h) {
        if (!h) return '';
        const parola = w => new RegExp('(^| )' + w + '( |$)').test(h);
        if (parola('nominativo') || parola('partecipante') || (parola('nome') && parola('cognome'))) return 'unica';
        if (/cognome|surname|last ?name/.test(h)) return 'cognome';
        if (/(^| )e ?mail|(^| )mail( |$)|posta elettronica/.test(h)) return 'email';
        if ((parola('nome') || /first ?name/.test(h) || h === 'name') && !/utente|azienda|societ|impresa|ditta|ente( |$)/.test(h)) return 'nome';
        if (/azienda|societ|ragione sociale|impresa|(^| )ente( |$)|studio|ditta|organizzazione|company/.test(h)) return 'azienda';
        if (parola('indirizzo')) return 'email-debole';
        return '';
    }
    function riconosciColonne(tabella) {
        const vuoto = () => ({ nome: -1, cognome: -1, email: -1, azienda: -1 });
        for (let i = 0; i < Math.min(10, tabella.length); i++) {
            const riga = tabella[i] || [];
            const col = vuoto();
            let debole = -1, unica = -1;
            riga.forEach((cella, j) => {
                const t = tipoColonna(normIntestazione(cella));
                if (t === 'unica' && unica < 0) unica = j;
                else if (t === 'email-debole' && debole < 0) debole = j;
                else if (t && t !== 'unica' && t !== 'email-debole' && col[t] < 0) col[t] = j;
            });
            if (col.email < 0 && debole >= 0) col.email = debole;
            if (unica >= 0 && col.nome < 0 && col.cognome < 0) { col.nome = unica; col.cognome = unica; }
            const riconosciute = ['nome', 'cognome', 'email'].filter(k => col[k] >= 0).length;
            if (riconosciute >= 2 || (col.email >= 0 && unica >= 0)) return { riga: i, colonne: col, unica: unica >= 0 && col.nome === unica };
        }
        // nessuna intestazione: si prova a indovinare la colonna dell'email dal contenuto
        const col = vuoto();
        const conta = [];
        tabella.slice(0, 50).forEach(r => (r || []).forEach((c, j) => { if (/@/.test(String(c))) conta[j] = (conta[j] || 0) + 1; }));
        let migliore = -1;
        conta.forEach((n, j) => { if (n && (migliore < 0 || n > conta[migliore])) migliore = j; });
        col.email = migliore;
        return { riga: -1, colonne: col, unica: false };
    }

    function lettera(j) {
        let s = '';
        j += 1;
        while (j > 0) { const r = (j - 1) % 26; s = String.fromCharCode(65 + r) + s; j = Math.floor((j - 1) / 26); }
        return s;
    }

    function mostraAbbinamento(trovate) {
        const f = stato.file;
        const larghezza = f.tabella.slice(0, 60).reduce((m, r) => Math.max(m, (r || []).length), 0);
        const intest = trovate.riga >= 0 ? f.tabella[trovate.riga] || [] : [];
        const esempioDi = j => {
            for (let i = trovate.riga + 1; i < Math.min(f.tabella.length, trovate.riga + 12); i++) {
                const v = String(((f.tabella[i] || [])[j]) || '').trim();
                if (v) return v;
            }
            return '';
        };
        const riempi = (sel, valore, facoltativa) => {
            const s = $(sel);
            svuota(s);
            s.appendChild(el('option', { value: '-1', testo: facoltativa ? '— nessuna —' : '— scegli la colonna —' }));
            for (let j = 0; j < larghezza; j++) {
                const nomeCol = String(intest[j] || '').trim();
                const es = esempioDi(j);
                const testo = 'Colonna ' + lettera(j) + (nomeCol ? ': «' + nomeCol.slice(0, 40) + '»' : '') + (es && !nomeCol ? ' (es. ' + es.slice(0, 30) + ')' : '');
                s.appendChild(el('option', { value: String(j), testo: testo }));
            }
            s.value = String(valore);
        };
        const ri = $('#abb-intestazione');
        svuota(ri);
        ri.appendChild(el('option', { value: '-1', testo: 'Nessuna: i dati cominciano dalla prima riga' }));
        for (let i = 0; i < Math.min(10, f.tabella.length); i++) ri.appendChild(el('option', { value: String(i), testo: 'Riga ' + (f.inizio + i + 1) }));
        ri.value = String(trovate.riga);
        riempi('#abb-nome', trovate.colonne.nome, false);
        riempi('#abb-cognome', trovate.colonne.cognome, false);
        riempi('#abb-email', trovate.colonne.email, false);
        riempi('#abb-azienda', trovate.colonne.azienda, true);
        const mancano = ['nome', 'cognome', 'email'].filter(k => trovate.colonne[k] < 0);
        $('#abbina-spiegazione').textContent = trovate.unica
            ? 'Nome e cognome stanno in una sola colonna: dimmi in che ordine sono scritti, poi controlla le prime righe qui sotto.'
            : (mancano.length
                ? 'Non ho riconosciuto ' + (mancano.length === 1 ? 'la colonna ' : 'le colonne ') + mancano.join(', ') + ': indica dove sono.'
                : 'Controlla l\'abbinamento delle colonne.');
        $('#abbina-colonne').hidden = false;
        aggiornaEsempioAbbinamento();
        $('#abb-nome').focus();
    }

    function abbinamentoScelto() {
        const n = sel => Number($(sel).value);
        const ordine = (document.querySelector('input[name="abb-ordine"]:checked') || {}).value || 'nome-cognome';
        return {
            riga: n('#abb-intestazione'),
            colonne: { nome: n('#abb-nome'), cognome: n('#abb-cognome'), email: n('#abb-email'), azienda: n('#abb-azienda') },
            ordine: ordine
        };
    }

    function aggiornaEsempioAbbinamento() {
        const a = abbinamentoScelto();
        const f = stato.file;
        const stessa = a.colonne.nome >= 0 && a.colonne.nome === a.colonne.cognome;
        $('#abb-ordine').hidden = !stessa;
        const tb = $('#abb-esempio tbody');
        svuota(tb);
        estraiRighe(f, a).slice(0, 3).forEach(r => {
            tb.appendChild(el('tr', null, [
                el('td', { classe: 'num', 'data-label': 'Riga', testo: r.riga }),
                el('td', { 'data-label': 'Nome', testo: r.nome }),
                el('td', { 'data-label': 'Cognome', testo: r.cognome }),
                el('td', { 'data-label': 'Email', testo: r.email }),
                el('td', { 'data-label': 'Azienda', testo: r.azienda })
            ]));
        });
        $('#btn-abbina-continua').disabled = !(a.colonne.nome >= 0 && a.colonne.cognome >= 0 && a.colonne.email >= 0);
    }
    ['#abb-intestazione', '#abb-nome', '#abb-cognome', '#abb-email', '#abb-azienda'].forEach(s => $(s).addEventListener('change', aggiornaEsempioAbbinamento));
    document.querySelectorAll('input[name="abb-ordine"]').forEach(r => r.addEventListener('change', aggiornaEsempioAbbinamento));
    $('#btn-abbina-continua').addEventListener('click', () => {
        const a = abbinamentoScelto();
        $('#abbina-colonne').hidden = true;
        costruisciRighe(a);
    });
    $('#btn-abbina-annulla').addEventListener('click', () => {
        $('#abbina-colonne').hidden = true;
        $('#scelta-foglio').hidden = true;
        $('#nome-file').textContent = '';
        stato.file = null;
    });

    /* "Anna Maria De Luca" in una colonna sola: con l'ordine Nome Cognome
       il nome e' la prima parola; con Cognome Nome il cognome si prende con
       le sue particelle (De, Di, Della, Van...). Il nome utente non cambia
       comunque (nome e cognome si attaccano), cambia solo come si legge. */
    const PARTICELLE = /^(de|di|da|del|dei|della|delle|dello|degli|dal|dalla|lo|la|le|li|van|von|der|den|dos|das|du|mac|mc|st|san|santa|d'|dell'|l')$/i;
    function dividiNominativo(testo, ordine) {
        const parole = String(testo || '').trim().split(/\s+/).filter(Boolean);
        if (parole.length < 2) return [parole.join(' '), ''];
        if (ordine === 'cognome-nome') {
            let k = 1;
            while (k < parole.length - 1 && PARTICELLE.test(parole[k - 1])) k++;
            return [parole.slice(k).join(' '), parole.slice(0, k).join(' ')];
        }
        return [parole[0], parole.slice(1).join(' ')];
    }

    function estraiRighe(f, a) {
        const out = [];
        const c = a.colonne;
        const unica = c.nome >= 0 && c.nome === c.cognome;
        for (let i = a.riga + 1; i < f.tabella.length; i++) {
            const r = f.tabella[i] || [];
            const cella = j => (j >= 0 ? String(r[j] == null ? '' : r[j]).trim() : '');
            let nome = cella(c.nome);
            let cognome = cella(c.cognome);
            if (unica) { const d = dividiNominativo(nome, a.ordine); nome = d[0]; cognome = d[1]; }
            const email = cella(c.email);
            const azienda = cella(c.azienda);
            if (!nome && !cognome && !email && !azienda) continue;
            out.push({ riga: f.inizio + i + 1, nome: nome, cognome: cognome, email: email, azienda: azienda });
        }
        return out;
    }

    function costruisciRighe(a) {
        const f = stato.file;
        const righe = estraiRighe(f, a);
        if (!righe.length) { mostraMsg('#msg-caricamento', 'Nel file non ci sono righe con dei dati sotto le intestazioni.', 'errore'); return; }
        if (righe.length > MAX_RIGHE) {
            mostraMsg('#msg-caricamento', 'Il file ha ' + righe.length.toLocaleString('it-IT') + ' righe: il massimo è ' + MAX_RIGHE.toLocaleString('it-IT') + '. Dividilo in più file.', 'errore');
            return;
        }
        avviaAnteprima(f.nome + (f.wb.SheetNames.length > 1 ? ' (foglio ' + f.foglio + ')' : ''), righe);
    }

    /* ============================================================
       SCHEDA PARTECIPANTI: ANTEPRIMA
       ============================================================ */
    async function avviaAnteprima(nomeFile, righe) {
        const c = stato.caricamento = {
            nomeFile: nomeFile,
            idEvento: stato.idEvento,
            righe: righe.map(r => ({
                riga: r.riga, nome: r.nome, cognome: r.cognome, email: r.email, azienda: r.azienda,
                nomeUtente: '', escludi: false, confermaOmonimo: false, confermaDoppione: false
            })),
            perEmail: {},
            occupati: new Set(),
            dettagli: {},
            chiesti: { emails: new Set(), basi: new Set(), nomi: new Set() },
            verifiche: 0,
            erroreVerifica: '',
            timerAnalisi: null,
            timerVerifica: null,
            analisi: null,
            dom: [],
            creazione: null
        };
        $('#anteprima-caricamento').hidden = false;
        $('#avanzamento-crea').hidden = true;
        $('#btn-riprendi-crea').hidden = true;
        costruisciTabellaAnteprima(c);
        mostraMsg('#msg-caricamento', 'Controllo delle persone già registrate…', 'info');
        await verificaEsistenti();
        if (c !== stato.caricamento) return;
        nascondiMsg('#msg-caricamento');
        analizza();
        // con dei problemi si parte dalle righe da controllare
        const a = c.analisi;
        const conProblemi = a.righe.some(daControllare);
        impostaFiltro(conProblemi ? 'problemi' : 'tutte');
        $('#riepilogo-anteprima').scrollIntoView({ block: 'nearest' });
    }

    function annullaCaricamento(tieniFile) {
        const c = stato.caricamento;
        if (c) {
            clearTimeout(c.timerAnalisi);
            clearTimeout(c.timerVerifica);
        }
        stato.caricamento = null;
        if (!tieniFile) {
            $('#nome-file').textContent = '';
            $('#scelta-foglio').hidden = true;
            $('#abbina-colonne').hidden = true;
            stato.file = null;
        }
        $('#anteprima-caricamento').hidden = true;
        svuota($('#tabella-anteprima tbody'));
        // niente riepilogo di un file precedente mentre si legge il nuovo
        svuota($('#riepilogo-anteprima'));
        $('#conta-anteprima').textContent = '';
        $('#motivo-blocco').textContent = '';
        nascondiMsg('#msg-caricamento');
    }
    $('#btn-annulla-caricamento').addEventListener('click', async () => {
        const c = stato.caricamento;
        if (c && c.creazione && c.creazione.inCorso) return;
        annullaCaricamento();
        $('#file-partecipanti').focus();
    });

    const ETICHETTE_ESITO = {
        'nuovo': 'Nuovo account',
        'esistente': 'Già registrato',
        'gia-nell-evento': 'Già nell\'evento',
        'doppione': 'Doppione',
        'escluso': 'Esclusa',
        'errore': 'Da correggere'
    };

    function costruisciTabellaAnteprima(c) {
        const tb = $('#tabella-anteprima tbody');
        svuota(tb);
        const frammento = document.createDocumentFragment();
        c.dom = c.righe.map((r, i) => {
            const etichetta = 'riga ' + r.riga;
            const inNome = el('input', { type: 'text', classe: 'campo-nome', value: r.nome, 'aria-label': 'Nome, ' + etichetta, autocomplete: 'off', maxlength: '80' });
            const inCognome = el('input', { type: 'text', classe: 'campo-cognome', value: r.cognome, 'aria-label': 'Cognome, ' + etichetta, autocomplete: 'off', maxlength: '80' });
            const inEmail = el('input', { type: 'email', classe: 'campo-email', value: r.email, 'aria-label': 'Email, ' + etichetta, autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });
            const inNomeUtente = el('input', { type: 'text', classe: 'nome-utente-riga', 'aria-label': 'Nome utente, ' + etichetta, autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', maxlength: '46', dati: { auto: '1' } });
            const escludi = el('input', { type: 'checkbox', classe: 'escludi-riga' });
            // nella cella dell'esito, sotto le etichette, le scelte del gestore:
            // escludere la riga, confermare l'omonimo o il doppione
            const esito = el('div', { classe: 'etichette-esito' });
            const problemi = el('ul', { classe: 'problemi' });
            const scelte = el('div', { classe: 'scelte' }, [el('label', { classe: 'scelta' }, [escludi, 'Escludi'])]);
            const tr = el('tr', { dati: { riga: String(r.riga), indice: String(i) } }, [
                el('td', { classe: 'num', 'data-label': 'Riga', testo: r.riga }),
                el('td', { 'data-label': 'Esito e scelte' }, [esito, scelte]),
                el('td', { 'data-label': 'Nome' }, [inNome]),
                el('td', { 'data-label': 'Cognome' }, [inCognome]),
                el('td', { 'data-label': 'Email', classe: 'largo' }, [inEmail]),
                el('td', { 'data-label': 'Azienda', testo: r.azienda }),
                el('td', { 'data-label': 'Nome utente' }, [inNomeUtente]),
                el('td', { 'data-label': 'Controlli', classe: 'largo' }, [problemi])
            ]);
            frammento.appendChild(tr);
            return { tr: tr, esito: esito, inNome: inNome, inCognome: inCognome, inEmail: inEmail, inNomeUtente: inNomeUtente, escludi: escludi, problemi: problemi, scelte: scelte, confermaOmonimo: null, confermaDoppione: null };
        });
        tb.appendChild(frammento);
    }

    /* ---------- chi esiste gia' ----------
       Al servizio si chiedono solo le email, le basi dei nomi utente e i
       nomi scritti a mano che non si sono ancora chiesti: correggere una
       riga costa una chiamata piccola, non il ricontrollo del file intero. */
    async function verificaEsistenti() {
        const c = stato.caricamento;
        if (!c) return;
        const emails = new Set(), basi = new Set(), nomi = new Set();
        c.righe.forEach(r => {
            const e = NU.emailNormalizzata(r.email);
            if (e && NU.emailValida(e) && !c.chiesti.emails.has(e)) emails.add(e);
            const b = NU.nomeUtenteBase(r.nome, r.cognome);
            if (b && !c.chiesti.basi.has(b)) basi.add(b);
            const n = NU.pulisciNomeUtente(r.nomeUtente);
            if (n && !c.chiesti.nomi.has(n)) nomi.add(n);
        });
        if (!emails.size && !basi.size && !nomi.size) return;
        c.verifiche++;
        c.erroreVerifica = '';
        aggiornaPulsanteCrea();
        try {
            const r = await chiama('anteprima', {
                idEvento: c.idEvento,
                emails: Array.from(emails).slice(0, 5000),
                basi: Array.from(basi).slice(0, 5000),
                nomi: Array.from(nomi).slice(0, 5000)
            });
            if (c !== stato.caricamento) return;
            const es = r.esistenti || {};
            Object.assign(c.perEmail, es.perEmail || {});
            (es.occupati || []).forEach(n => c.occupati.add(String(n)));
            Object.assign(c.dettagli, es.dettagliOccupati || r.dettagliOccupati || {});
            emails.forEach(e => c.chiesti.emails.add(e));
            basi.forEach(b => c.chiesti.basi.add(b));
            nomi.forEach(n => c.chiesti.nomi.add(n));
        } catch (e) {
            if (e.stato === 401 || e.stato === 403) { erroreGenerico(e); return; }
            if (c === stato.caricamento) c.erroreVerifica = e.msg || 'Controllo non riuscito.';
        } finally {
            c.verifiche--;
        }
    }

    function programmaAnalisi(ms) {
        const c = stato.caricamento;
        if (!c) return;
        clearTimeout(c.timerAnalisi);
        c.timerAnalisi = setTimeout(() => { c.timerAnalisi = null; if (c === stato.caricamento) analizza(); }, ms == null ? ATTESA_ANALISI_MS : ms);
    }
    function programmaVerifica() {
        const c = stato.caricamento;
        if (!c) return;
        clearTimeout(c.timerVerifica);
        c.timerVerifica = setTimeout(async () => {
            c.timerVerifica = null;
            await verificaEsistenti();
            if (c === stato.caricamento) analizza();
        }, ATTESA_VERIFICA_MS);
        aggiornaPulsanteCrea();
    }

    /* Controlli in piu' rispetto ad analizzaRighe, gli stessi che fa il
       servizio al momento della creazione: meglio vederli ora in anteprima
       che scoprirli dopo, riga per riga, nei risultati. */
    const MOJIBAKE = /[ÃÂ][\u0080-¿ŒœŠšŸŽžƒˆ˜–-™€]|�/;
    const CARATTERI_VIETATI = /[<>\u0000-\u001f\u007f]/;
    function controlliAggiuntivi(a) {
        a.righe.forEach(o => {
            if (o.esito === 'escluso' || o.esito === 'doppione' || o.esito === 'gia-nell-evento') return;
            const aggiungi = (codice, testo) => {
                o.problemi.push({ codice: codice, testo: testo, grave: true });
                if (o.esito === 'nuovo') { o.esito = 'errore'; o.daConfermare = false; }
            };
            if ([o.nome, o.cognome, o.azienda, o.email].some(v => MOJIBAKE.test(v))) {
                aggiungi('codifica', 'Caratteri strani (Ã, Â, �): la codifica del file è sbagliata. Salva il file come «CSV UTF-8» e ricaricalo, oppure correggi a mano.');
            }
            if (o.esito !== 'esistente' && (CARATTERI_VIETATI.test(o.nome) || CARATTERI_VIETATI.test(o.cognome))) {
                aggiungi('caratteri', 'Nome o cognome contengono caratteri non ammessi (< > o caratteri invisibili).');
            }
        });
        // i conteggi, con la stessa regola di analizzaRighe
        const k = { totale: a.righe.length, nuovi: 0, esistenti: 0, giaNellEvento: 0, doppioni: 0, esclusi: 0, errori: 0, omonimi: 0, daConfermare: 0 };
        a.righe.forEach(o => {
            if (o.esito === 'nuovo') k.nuovi++;
            else if (o.esito === 'esistente') k.esistenti++;
            else if (o.esito === 'gia-nell-evento') k.giaNellEvento++;
            else if (o.esito === 'doppione') k.doppioni++;
            else if (o.esito === 'escluso') k.esclusi++;
            else if (o.esito === 'errore') k.errori++;
            if (o.omonimo) k.omonimi++;
            if (o.daConfermare) k.daConfermare++;
        });
        a.conteggi = k;
        a.pronto = k.errori === 0 && k.daConfermare === 0;
        return a;
    }

    function analizza() {
        const c = stato.caricamento;
        if (!c) return;
        const a = NU.analizzaRighe(c.righe.map(r => ({
            riga: r.riga, nome: r.nome, cognome: r.cognome, email: r.email, azienda: r.azienda,
            nomeUtente: r.nomeUtente, escludi: r.escludi, confermaOmonimo: r.confermaOmonimo, confermaDoppione: r.confermaDoppione
        })), { perEmail: c.perEmail, occupati: Array.from(c.occupati), dettagliOccupati: c.dettagli }, c.idEvento);
        c.analisi = controlliAggiuntivi(a);
        aggiornaRigheAnteprima(c);
        aggiornaRiepilogo(c);
        aggiornaPulsanteCrea();
        applicaFiltro();
    }

    const haCodice = (o, codice) => o.problemi.some(p => p.codice === codice);
    const daControllare = o => o.problemi.length > 0 || o.omonimo;
    const daSistemare = o => o.esito === 'errore' || o.daConfermare;

    function casella(classe, testo, attiva) {
        const input = el('input', { type: 'checkbox', classe: classe, checked: !!attiva });
        return { label: el('label', { classe: 'scelta' }, [input, testo]), input: input };
    }

    function aggiornaRigheAnteprima(c) {
        const a = c.analisi;
        const bloccata = !!(c.creazione && (c.creazione.inCorso || c.creazione.finita));
        a.righe.forEach((o, i) => {
            const d = c.dom[i];
            const r = c.righe[i];
            if (!d) return;
            /* Con migliaia di righe ridisegnarle tutte a ogni tasto premuto si
               sentirebbe: si tocca solo la riga il cui esito e' cambiato. */
            const firma = [o.esito, o.omonimo, o.daConfermare, o.nomeUtente, r.nomeUtente, r.escludi, r.confermaOmonimo, r.confermaDoppione, bloccata,
                o.problemi.map(p => p.codice + ':' + p.testo).join('|')].join('¦');
            if (d.firma === firma) return;
            // una riga su cui si sta scrivendo si ridisegna anche dopo, all'uscita dal campo
            d.firma = document.activeElement === d.inNomeUtente ? '' : firma;
            const numerato = haCodice(o, 'omonimo');
            d.tr.className = 'esito-' + o.esito + (o.omonimo ? ' omonimo' : '') + (o.daConfermare ? ' da-confermare' : '');

            svuota(d.esito);
            d.esito.appendChild(el('span', { classe: 'etichetta-esito ' + o.esito, testo: ETICHETTE_ESITO[o.esito] || o.esito }));
            if (o.omonimo && o.esito !== 'errore') {
                d.esito.appendChild(el('span', {
                    classe: 'etichetta-esito ' + (o.daConfermare ? 'omonimo' : (numerato ? 'omonimo-ok' : 'omonimo')),
                    testo: o.daConfermare ? 'Omonimo da confermare' : (numerato ? 'Omonimo confermato' : 'Omonimo')
                }));
            }
            if (o.esito === 'doppione' && haCodice(o, 'doppione-nome-diverso')) {
                d.esito.appendChild(el('span', { classe: 'etichetta-esito ' + (o.daConfermare ? 'omonimo' : 'omonimo-ok'), testo: o.daConfermare ? 'Da confermare' : 'Stessa persona' }));
            }

            // i campi che hanno un problema si segnano (bordo rosso + lettori di schermo)
            const segna = (inp, male) => { if (male) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); };
            segna(d.inNome, haCodice(o, 'nome-vuoto') || haCodice(o, 'caratteri'));
            segna(d.inCognome, haCodice(o, 'cognome-vuoto') || haCodice(o, 'caratteri'));
            segna(d.inEmail, haCodice(o, 'email-mancante') || haCodice(o, 'email-non-valida'));
            segna(d.inNomeUtente, haCodice(o, 'nome-utente-occupato') || haCodice(o, 'nome-utente-vuoto'));

            // il nome utente: quello di chi esiste gia' e' fisso; gli altri si
            // possono scrivere a mano, e finche' non lo si fa si vede quello calcolato
            const fisso = o.esito === 'esistente' || o.esito === 'gia-nell-evento' || o.esito === 'doppione' || o.esito === 'escluso';
            d.inNomeUtente.readOnly = fisso;
            if (fisso) {
                d.inNomeUtente.value = o.esito === 'doppione' || o.esito === 'escluso' ? '' : o.nomeUtente;
                d.inNomeUtente.placeholder = o.esito === 'doppione' ? '(prima riga)' : '';
                d.inNomeUtente.dataset.auto = '1';
            } else if (r.nomeUtente) {
                d.inNomeUtente.dataset.auto = '0';
            } else if (document.activeElement !== d.inNomeUtente) {
                d.inNomeUtente.value = o.nomeUtente || '';
                d.inNomeUtente.placeholder = o.nomeUtente ? '' : 'a mano';
                d.inNomeUtente.dataset.auto = '1';
            }

            svuota(d.problemi);
            o.problemi.forEach(p => {
                const classe = p.grave ? 'grave' : (p.codice === 'omonimo' || p.codice === 'doppione-nome-diverso' ? 'omonimo' : '');
                d.problemi.appendChild(el('li', { classe: classe, testo: p.testo }));
            });
            if (o.omonimo && !numerato && o.esito === 'nuovo') {
                d.problemi.appendChild(el('li', { classe: 'omonimo', testo: 'Nel file ci sono altre persone con lo stesso nome: a loro va un numero (' + o.base + '2, ' + o.base + '3…).' }));
            }

            // le caselle di conferma esistono solo dove servono
            if (numerato && o.esito !== 'errore') {
                if (!d.confermaOmonimo) {
                    const x = casella('conferma-omonimo', 'Confermo il numero', r.confermaOmonimo);
                    d.confermaOmonimo = x.label;
                    d.scelte.insertBefore(x.label, d.scelte.firstChild);
                }
                d.confermaOmonimo.querySelector('input').checked = !!r.confermaOmonimo;
            } else if (d.confermaOmonimo) { d.confermaOmonimo.remove(); d.confermaOmonimo = null; }
            if (o.esito === 'doppione' && haCodice(o, 'doppione-nome-diverso')) {
                if (!d.confermaDoppione) {
                    const x = casella('conferma-doppione', 'È la stessa persona', r.confermaDoppione);
                    d.confermaDoppione = x.label;
                    d.scelte.insertBefore(x.label, d.scelte.firstChild);
                }
                d.confermaDoppione.querySelector('input').checked = !!r.confermaDoppione;
            } else if (d.confermaDoppione) { d.confermaDoppione.remove(); d.confermaDoppione = null; }
            d.escludi.checked = !!r.escludi;
            d.tr.querySelectorAll('input').forEach(inp => { inp.disabled = bloccata; });
        });
    }

    function gettone(numero, testo, colore) {
        return el('span', { classe: 'gettone' + (colore ? ' ' + colore : '') }, [el('strong', { testo: numero.toLocaleString('it-IT') }), testo]);
    }

    function aggiornaRiepilogo(c) {
        const k = c.analisi.conteggi;
        const r = $('#riepilogo-anteprima');
        svuota(r);
        const omonimiDaConf = c.analisi.righe.filter(o => o.daConfermare && o.omonimo).length;
        const doppioniDaConf = c.analisi.righe.filter(o => o.daConfermare && o.esito === 'doppione').length;
        r.appendChild(gettone(k.totale, plurale(k.totale, 'riga letta', 'righe lette'), ''));
        r.appendChild(gettone(k.nuovi, plurale(k.nuovi, 'nuovo account', 'nuovi account'), 'verde'));
        if (k.esistenti) r.appendChild(gettone(k.esistenti, plurale(k.esistenti, 'già registrata, da aggiungere', 'già registrate, da aggiungere'), 'blu'));
        if (k.giaNellEvento) r.appendChild(gettone(k.giaNellEvento, 'già nell\'evento', 'blu'));
        if (k.doppioni) r.appendChild(gettone(k.doppioni, plurale(k.doppioni, 'doppione nel file', 'doppioni nel file'), ''));
        if (k.esclusi) r.appendChild(gettone(k.esclusi, plurale(k.esclusi, 'esclusa', 'escluse'), ''));
        if (k.omonimi) r.appendChild(gettone(k.omonimi, plurale(k.omonimi, 'omonimo', 'omonimi') + (omonimiDaConf ? ' (' + omonimiDaConf + ' da confermare)' : ''), 'ambra'));
        if (doppioniDaConf) r.appendChild(gettone(doppioniDaConf, 'stessa email, nome diverso: da confermare', 'ambra'));
        r.appendChild(gettone(k.errori, plurale(k.errori, 'da correggere', 'da correggere'), k.errori ? 'rosso' : ''));
        $('#btn-conferma-omonimi').disabled = !omonimiDaConf || !!(c.creazione && (c.creazione.inCorso || c.creazione.finita));
        $('#btn-conferma-omonimi').textContent = omonimiDaConf ? 'Conferma tutti gli omonimi (' + omonimiDaConf + ')' : 'Conferma tutti gli omonimi';
    }

    function aggiornaPulsanteCrea() {
        const c = stato.caricamento;
        const b = $('#btn-crea-account');
        const motivo = $('#motivo-blocco');
        $('#btn-riprova-verifica').hidden = true;
        if (!c || !c.analisi) { b.disabled = true; motivo.textContent = c ? 'Controllo in corso…' : ''; return; }
        const a = c.analisi;
        const k = a.conteggi;
        const omonimiDaConf = a.righe.filter(o => o.daConfermare && o.omonimo).length;
        const doppioniDaConf = a.righe.filter(o => o.daConfermare && o.esito === 'doppione').length;
        let perche = '';
        if (c.creazione && c.creazione.finita) perche = 'Account già creati per questo file.';
        else if (c.creazione && c.creazione.inCorso) perche = 'Creazione degli account in corso…';
        else if (c.creazione) perche = 'Creazione interrotta: premi «Riprendi» qui sotto per completarla.';
        else if (c.verifiche > 0 || c.timerVerifica) perche = 'Controllo dei dati modificati in corso…';
        else if (c.erroreVerifica) {
            perche = 'Il controllo delle persone già registrate non è riuscito (' + c.erroreVerifica + '): riprova prima di creare gli account.';
            $('#btn-riprova-verifica').hidden = false;
        } else if (k.errori || omonimiDaConf || doppioniDaConf) {
            const cose = [];
            if (k.errori) cose.push('correggi o escludi ' + conNumero(k.errori, 'riga in errore', 'righe in errore'));
            if (omonimiDaConf) cose.push('conferma ' + conNumero(omonimiDaConf, 'omonimo', 'omonimi') + ' (o scrivi un nome utente diverso)');
            if (doppioniDaConf) cose.push('conferma o correggi ' + conNumero(doppioniDaConf, 'riga con la stessa email e un nome diverso', 'righe con la stessa email e un nome diverso'));
            perche = 'Per creare gli account: ' + cose.join('; ') + '.';
        } else if (!k.nuovi && !k.esistenti) perche = 'Niente da creare: tutte le persone del file sono già nell\'evento, doppioni o escluse.';
        b.disabled = !!perche || !a.pronto;
        let testo = 'Crea ' + conNumero(k.nuovi, 'account', 'account');
        if (k.esistenti) testo += ' e aggiungi ' + conNumero(k.esistenti, 'persona già registrata', 'persone già registrate');
        b.textContent = testo;
        motivo.textContent = perche || 'Tutto pronto: nessun problema da sistemare.';
        motivo.classList.toggle('pronto', !perche);
    }
    $('#btn-riprova-verifica').addEventListener('click', async () => {
        const c = stato.caricamento;
        if (!c) return;
        await verificaEsistenti();
        if (c === stato.caricamento) analizza();
    });

    /* ---------- i filtri ---------- */
    function impostaFiltro(valore) {
        const r = document.querySelector('input[name="filtro-anteprima"][value="' + valore + '"]');
        if (r) r.checked = true;
        applicaFiltro();
    }
    function applicaFiltro() {
        const c = stato.caricamento;
        if (!c || !c.analisi) return;
        const filtro = (document.querySelector('input[name="filtro-anteprima"]:checked') || {}).value || 'tutte';
        document.querySelectorAll('input[name="filtro-anteprima"]').forEach(r => r.parentNode.classList.toggle('attivo', r.checked));
        let visibili = 0;
        c.analisi.righe.forEach((o, i) => {
            const d = c.dom[i];
            // la riga su cui si sta scrivendo non sparisce mentre la si corregge
            const inUso = d.tr.contains(document.activeElement);
            const mostra = inUso || filtro === 'tutte' || (filtro === 'problemi' ? daControllare(o) : daSistemare(o));
            d.tr.hidden = !mostra;
            if (mostra) visibili++;
        });
        $('#conta-anteprima').textContent = visibili === c.analisi.righe.length
            ? conNumero(visibili, 'riga', 'righe')
            : 'Mostrate ' + visibili + ' di ' + conNumero(c.analisi.righe.length, 'riga', 'righe');
    }
    document.querySelectorAll('input[name="filtro-anteprima"]').forEach(r => r.addEventListener('change', applicaFiltro));

    /* ---------- le correzioni ---------- */
    const corpoAnteprima = $('#tabella-anteprima tbody');
    corpoAnteprima.addEventListener('input', e => {
        const c = stato.caricamento;
        const t = e.target;
        const tr = t.closest('tr[data-indice]');
        if (!c || !tr) return;
        const r = c.righe[Number(tr.dataset.indice)];
        if (!r) return;
        if (t.classList.contains('campo-nome')) r.nome = t.value;
        else if (t.classList.contains('campo-cognome')) r.cognome = t.value;
        else if (t.classList.contains('campo-email')) r.email = t.value;
        else if (t.classList.contains('nome-utente-riga')) { r.nomeUtente = t.value.trim(); t.dataset.auto = r.nomeUtente ? '0' : '1'; }
        else return;
        programmaAnalisi();
        programmaVerifica();
    });
    corpoAnteprima.addEventListener('change', e => {
        const c = stato.caricamento;
        const t = e.target;
        const tr = t.closest('tr[data-indice]');
        if (!c || !tr || t.type !== 'checkbox') return;
        const r = c.righe[Number(tr.dataset.indice)];
        if (t.classList.contains('escludi-riga')) r.escludi = t.checked;
        else if (t.classList.contains('conferma-omonimo')) r.confermaOmonimo = t.checked;
        else if (t.classList.contains('conferma-doppione')) r.confermaDoppione = t.checked;
        else return;
        analizza();
    });
    // uscendo da un nome utente lasciato vuoto torna quello calcolato
    corpoAnteprima.addEventListener('focusout', e => {
        if (e.target.classList && e.target.classList.contains('nome-utente-riga')) programmaAnalisi(0);
    });

    $('#btn-conferma-omonimi').addEventListener('click', () => {
        const c = stato.caricamento;
        if (!c || !c.analisi) return;
        c.analisi.righe.forEach((o, i) => { if (o.daConfermare && o.omonimo) c.righe[i].confermaOmonimo = true; });
        analizza();
        avviso('Omonimi confermati: ognuno avrà il nome utente con il numero proposto.', 'ok');
    });

    /* ============================================================
       SCHEDA PARTECIPANTI: CREAZIONE DEGLI ACCOUNT
       ============================================================ */
    $('#btn-crea-account').addEventListener('click', async () => {
        const c = stato.caricamento;
        if (!c || !c.analisi || !c.analisi.pronto || c.creazione) return;
        // ultimo controllo, nel caso ci fosse una correzione ancora in attesa
        clearTimeout(c.timerAnalisi);
        c.timerAnalisi = null;
        analizza();
        if (!c.analisi.pronto || $('#btn-crea-account').disabled) return;
        const k = c.analisi.conteggi;
        const daInviare = c.analisi.righe.filter(o => o.esito === 'nuovo' || o.esito === 'esistente');
        const ok = await conferma({
            titolo: 'Creare ' + conNumero(k.nuovi, 'account', 'account') + '?',
            testo: 'Per l\'evento «' + (stato.evento && stato.evento.titolo || c.idEvento) + '»:',
            dettagli: [
                conNumero(k.nuovi, 'nuovo account', 'nuovi account'),
                k.esistenti ? conNumero(k.esistenti, 'persona già registrata aggiunta', 'persone già registrate aggiunte') + ' all\'evento, senza un nuovo account' : '',
                'Le email con le credenziali NON partono adesso: le invii dalla scheda Email, dopo la prova su di te.'
            ],
            ok: 'Crea gli account'
        });
        if (!ok || c !== stato.caricamento) return;
        c.creazione = {
            inCorso: true, finita: false,
            gruppi: [], indice: 0, risultati: [], ritentati: new Set(),
            previsti: new Map(daInviare.map(o => [o.riga, o])),
            totale: daInviare.length
        };
        for (let i = 0; i < daInviare.length; i += GRUPPO_CREA) c.creazione.gruppi.push(daInviare.slice(i, i + GRUPPO_CREA));
        aggiornaRigheAnteprima(c);
        aggiornaRiepilogo(c);
        aggiornaPulsanteCrea();
        sbloccaCaricamento(false);
        eseguiCreazione(c);
    });

    $('#btn-riprendi-crea').addEventListener('click', () => {
        const c = stato.caricamento;
        if (!c || !c.creazione || c.creazione.inCorso || c.creazione.finita) return;
        c.creazione.inCorso = true;
        $('#btn-riprendi-crea').hidden = true;
        aggiornaPulsanteCrea();
        sbloccaCaricamento(false);
        eseguiCreazione(c);
    });

    function aggiornaAvanzamentoCrea(c, testo) {
        const cr = c.creazione;
        const fatte = cr.risultati.length;
        const pct = cr.totale ? Math.round(fatte * 100 / cr.totale) : 100;
        const box = $('#avanzamento-crea');
        box.hidden = false;
        box.classList.toggle('finito', !!cr.finita);
        const barra = box.querySelector('.barra');
        barra.setAttribute('aria-valuenow', String(pct));
        box.querySelector('.barra-piena').style.width = pct + '%';
        box.querySelector('.avanzamento-testo').textContent = testo
            || ('Gruppo ' + Math.min(cr.indice + 1, cr.gruppi.length) + ' di ' + cr.gruppi.length + ' · ' + fatte + ' di ' + cr.totale + ' righe elaborate');
    }

    async function eseguiCreazione(c) {
        const cr = c.creazione;
        aggiornaAvanzamentoCrea(c);
        while (cr.indice < cr.gruppi.length) {
            if (c !== stato.caricamento) return;
            const gruppo = cr.gruppi[cr.indice];
            let r = null;
            for (let tentativo = 0; ; tentativo++) {
                try {
                    r = await chiama('crea', {
                        idEvento: c.idEvento,
                        righe: gruppo.map(o => ({ riga: o.riga, nome: o.nome, cognome: o.cognome, email: o.email, azienda: o.azienda, nomeUtente: o.nomeUtente }))
                    });
                    break;
                } catch (e) {
                    if (e.stato === 401 || e.stato === 403) { cr.inCorso = false; erroreGenerico(e); return; }
                    // gli errori di rete e del servizio si riprovano: la creazione
                    // e' "idempotente", le righe gia' fatte non si duplicano
                    const riprovabile = !e.stato || e.stato === 429 || e.stato >= 500;
                    /* Con la rete caduta (o il servizio fermato a meta') la richiesta
                       puo' essere arrivata e il gruppo creato, senza che la risposta
                       tornasse: al nuovo tentativo quelle righe risultano «gia'
                       nell'evento». Lo si ricorda per dirlo giusto nel risultato. */
                    if (!e.stato || e.stato >= 500) cr.ritentati.add(cr.indice);
                    if (!riprovabile || tentativo >= 2) {
                        cr.inCorso = false;
                        aggiornaAvanzamentoCrea(c, 'Caricamento interrotto al gruppo ' + (cr.indice + 1) + ' di ' + cr.gruppi.length
                            + (e.msg ? ' (' + e.msg + ')' : '') + ': premi Riprendi. Le righe già create non si duplicano.');
                        $('#btn-riprendi-crea').hidden = false;
                        aggiornaPulsanteCrea();
                        // si puo' anche lasciar perdere: le righe gia' create restano, e
                        // ricaricando lo stesso file si completano le altre
                        sbloccaCaricamento(true);
                        $('#btn-riprendi-crea').focus();
                        return;
                    }
                    await pausa(1500 * (tentativo + 1));
                }
            }
            const risultati = Array.isArray(r.risultati) ? r.risultati : [];
            if (cr.ritentati.has(cr.indice)) risultati.forEach(x => { if (x.esito === 'gia-nell-evento') x.dalTentativo = true; });
            cr.risultati.push.apply(cr.risultati, risultati);
            cr.indice++;
            aggiornaAvanzamentoCrea(c);
            if (cr.indice < cr.gruppi.length) await pausa(PAUSA_CREA_MS);
        }
        cr.inCorso = false;
        cr.finita = true;
        creazioneFinita(c);
    }

    function creazioneFinita(c) {
        const cr = c.creazione;
        const k = { creato: 0, aggiunto: 0, 'gia-nell-evento': 0, errore: 0, dalTentativo: 0 };
        cr.risultati.forEach(x => {
            if (x.dalTentativo) k.dalTentativo++;
            else k[x.esito] = (k[x.esito] || 0) + 1;
        });
        // il nome utente conta come "cambiato" solo per chi e' stato creato adesso
        // (o dal tentativo interrotto): chi esisteva gia' tiene il suo
        const eCambiato = x => !!x.nomeUtenteCambiato && (x.esito === 'creato' || !!x.dalTentativo);
        const cambiati = cr.risultati.filter(eCambiato);
        aggiornaAvanzamentoCrea(c, 'Creazione completata: ' + cr.risultati.length + ' di ' + cr.totale + ' righe elaborate.');
        sbloccaCaricamento(true);
        $('#anteprima-caricamento').hidden = true;

        const riepilogo = $('#esito-crea-riepilogo');
        svuota(riepilogo);
        riepilogo.appendChild(gettone(k.creato, plurale(k.creato, 'account creato', 'account creati'), 'verde'));
        if (k.aggiunto) riepilogo.appendChild(gettone(k.aggiunto, plurale(k.aggiunto, 'persona aggiunta all\'evento', 'persone aggiunte all\'evento'), 'blu'));
        if (k.dalTentativo) riepilogo.appendChild(gettone(k.dalTentativo, plurale(k.dalTentativo, 'riga già completata dal tentativo interrotto', 'righe già completate dal tentativo interrotto'), 'verde'));
        if (k['gia-nell-evento']) riepilogo.appendChild(gettone(k['gia-nell-evento'], 'già nell\'evento', 'blu'));
        if (cambiati.length) riepilogo.appendChild(gettone(cambiati.length, plurale(cambiati.length, 'nome utente cambiato', 'nomi utente cambiati'), 'ambra'));
        riepilogo.appendChild(gettone(k.errore, plurale(k.errore, 'errore', 'errori'), k.errore ? 'rosso' : ''));

        const tb = $('#tabella-esito-crea tbody');
        svuota(tb);
        /* Qui sotto solo le righe da guardare: gli errori, i nomi utente
           diversi dall'anteprima e le note del servizio (per esempio una
           persona gia' registrata con l'account disattivato). */
        const ESITO_RIGA = { creato: 'Creato', aggiunto: 'Aggiunta all\'evento', 'gia-nell-evento': 'Già nell\'evento' };
        cr.risultati.filter(x => x.esito === 'errore' || eCambiato(x) || x.motivo).forEach(x => {
            const o = cr.previsti.get(x.riga) || {};
            const cambiato = eCambiato(x);
            const nomeCella = el('td', { 'data-label': 'Nome utente' });
            if (cambiato && o.nomeUtente && o.nomeUtente !== x.nomeUtente) {
                nomeCella.appendChild(el('span', { classe: 'nome-cambiato-testo' }, [el('del', { testo: o.nomeUtente }), ' → ', x.nomeUtente || '']));
            } else nomeCella.textContent = x.nomeUtente || '';
            const esito = x.esito === 'errore' ? 'Errore' : (cambiato ? 'Creato con un altro nome utente' : (ESITO_RIGA[x.esito] || x.esito));
            const nota = x.esito === 'errore' ? (x.motivo || 'Errore non specificato')
                : [cambiato ? 'Il nome proposto era stato preso nel frattempo (per esempio da un caricamento contemporaneo).' : '', x.motivo || ''].filter(Boolean).join(' ');
            tb.appendChild(el('tr', { classe: x.esito === 'errore' ? 'riga-errore' : (cambiato ? 'nome-cambiato' : 'riga-nota'), dati: { riga: String(x.riga) } }, [
                el('td', { classe: 'num', 'data-label': 'Riga', testo: x.riga }),
                el('td', { 'data-label': 'Persona', testo: [o.nome, o.cognome].filter(Boolean).join(' ') }),
                el('td', { 'data-label': 'Esito', testo: esito }),
                nomeCella,
                el('td', { 'data-label': 'Nota', classe: 'largo', testo: nota })
            ]));
        });
        $('#esito-crea-contenitore').hidden = !tb.firstChild;
        $('#esito-crea-nota').textContent = (tb.firstChild ? 'Qui sotto solo le righe da guardare; tutte le altre hanno il nome utente dell\'anteprima. ' : '')
            + (k.dalTentativo ? 'Il collegamento era caduto a metà: ' + conNumero(k.dalTentativo, 'riga era già stata completata', 'righe erano già state completate')
                + ' dal tentativo interrotto, senza doppioni. ' : '')
            + (k.errore ? 'Le righe in errore si possono completare ricaricando lo stesso file: non si crea niente di doppio. ' : '')
            + 'Le credenziali si inviano dalla scheda Email.';
        $('#esito-crea').hidden = false;
        $('#nome-file').textContent = '';
        stato.file = null;
        $('#esito-crea').scrollIntoView({ block: 'nearest' });
        avviso('Creazione completata: ' + conNumero(k.creato + k.dalTentativo, 'riga completata', 'righe completate')
            + (k.aggiunto ? ', ' + conNumero(k.aggiunto, 'persona aggiunta', 'persone aggiunte') + ' all\'evento' : '')
            + (k.errore ? ', ' + conNumero(k.errore, 'errore', 'errori') : '') + '.', k.errore ? 'errore' : 'ok');
        // elenco e conteggi aggiornati
        caricaPartecipanti();
        chiama('eventi').then(r => {
            (r.eventi || []).forEach(e => { const i = stato.eventi.findIndex(x => x.id === e.id); if (i >= 0) stato.eventi[i] = e; });
            if (stato.idEvento) { stato.evento = stato.eventi.find(e => e.id === stato.idEvento) || stato.evento; compilaFormEvento(stato.evento); aggiornaStatoEvento(); }
        }).catch(() => { /* i conteggi si aggiornano al prossimo caricamento */ });
        aggiornaStatoEmail().catch(() => { /* idem */ });
    }

    window.addEventListener('beforeunload', e => {
        const c = stato.caricamento;
        if (c && c.creazione && c.creazione.inCorso) { e.preventDefault(); e.returnValue = ''; }
    });

    /* ============================================================
       SCHEDA PARTECIPANTI: ELENCO, RICERCA E AZIONI
       ============================================================ */
    async function caricaPartecipanti() {
        const id = stato.idEvento;
        if (!id || !stato.utente) return;
        const vuoto = $('#partecipanti-vuoto');
        if (!stato.partecipanti.length) { vuoto.hidden = false; vuoto.textContent = 'Caricamento dei partecipanti…'; }
        try {
            const r = await chiama('partecipanti', { idEvento: id });
            if (id !== stato.idEvento) return;
            stato.partecipanti = (r.partecipanti || []).slice().sort(ordinePersone);
            stato.perUid = new Map(stato.partecipanti.map(p => [p.uid, p]));
            stato.partecipantiDi = id;
            disegnaPartecipanti();
            aggiornaEtichetteEmail();
            aggiornaDettaglioConnessi();
        } catch (e) {
            if (id !== stato.idEvento) return;
            vuoto.hidden = false;
            vuoto.textContent = 'Elenco non caricato: ' + (e.msg || 'errore') + ' Premi «Aggiorna» per riprovare.';
            if (e.stato === 401 || e.stato === 403) erroreGenerico(e);
        }
    }
    $('#btn-aggiorna-partecipanti').addEventListener('click', () => conAttesa($('#btn-aggiorna-partecipanti'), caricaPartecipanti));

    function ordinePersone(a, b) {
        return String(a.cognome || '').localeCompare(String(b.cognome || ''), 'it', { sensitivity: 'base' })
            || String(a.nome || '').localeCompare(String(b.nome || ''), 'it', { sensitivity: 'base' })
            || String(a.nomeUtente || '').localeCompare(String(b.nomeUtente || ''));
    }

    function statoInvio(p) { return (p.invio && p.invio.stato) || 'da inviare'; }
    const classeStatoEmail = s => 'stato-email stato-' + String(s).replace(/\s+/g, '-');

    function rigaPartecipante(p) {
        const s = statoInvio(p);
        const attivo = p.stato !== 'disattivato';
        const chi = [p.nome, p.cognome].filter(Boolean).join(' ') || p.nomeUtente;
        const dettaglioEmail = p.invio && p.invio.inviata && s === 'inviata' ? 'il ' + dataOra(p.invio.inviata)
            : (p.invio && p.invio.errore ? p.invio.errore : '');
        const bottone = (op, testo, extra) => el('button', Object.assign({ type: 'button', classe: 'btn btn-mini btn-secondario', dati: { op: op }, 'aria-label': testo + ': ' + chi }, extra || {}), [testo]);
        const altre = el('details', { classe: 'altre-azioni' }, [
            el('summary', { classe: 'btn btn-mini btn-secondario', 'aria-label': 'Altre azioni per ' + chi }, ['Altro']),
            el('div', { classe: 'altre-azioni-menu' }, [
                bottone('rigenera', 'Nuova password da comunicare a voce'),
                bottone('rimuovi-evento', 'Togli da questo evento', { classe: 'btn btn-mini btn-pericolo-testo' }),
                attivo
                    ? bottone('disattiva', 'Disattiva l\'account (tutti gli eventi)', { classe: 'btn btn-mini btn-pericolo-testo' })
                    : bottone('riattiva', 'Riattiva l\'account')
            ])
        ]);
        const tr = el('tr', { classe: attivo ? '' : 'disattivato', dati: { uid: p.uid } }, [
            el('td', { classe: 'col-nome-utente', 'data-label': 'Nome utente', testo: p.nomeUtente || '' }),
            el('td', { 'data-label': 'Nome e cognome' }, [el('span', { classe: 'persona', testo: chi })]),
            el('td', { 'data-label': 'Email', classe: 'largo', testo: p.email || '' }),
            el('td', { 'data-label': 'Azienda', testo: p.azienda || '' }),
            el('td', { 'data-label': 'Account' }, [el('span', { classe: 'stato-account ' + (attivo ? 'attivo' : 'disattivato'), testo: attivo ? 'attivo' : 'disattivato' })]),
            el('td', { 'data-label': 'Email credenziali' }, [
                el('span', { classe: classeStatoEmail(s), testo: s, title: dettaglioEmail || null }),
                dettaglioEmail ? el('span', { classe: 'piccolo', testo: dettaglioEmail }) : null
            ]),
            el('td', { 'data-label': 'Ultimo accesso', testo: p.ultimoAccesso ? dataOra(p.ultimoAccesso) : 'mai' }),
            el('td', { 'data-label': 'Azioni', classe: 'largo' }, [el('div', { classe: 'azioni-riga' }, [
                bottone('reinvia', s === 'da inviare' ? 'Invia ora' : 'Reinvia credenziali'),
                bottone('correggi', 'Correggi'),
                altre
            ])])
        ]);
        p._cerca = perRicerca([p.nomeUtente, p.nome + ' ' + p.cognome, p.cognome + ' ' + p.nome, p.email, p.azienda].join(' | '));
        p._compatto = NU.pulisci((p.nome || '') + (p.cognome || '')) + '|' + NU.pulisci((p.cognome || '') + (p.nome || '')) + '|' + (p.nomeUtente || '');
        return tr;
    }

    function disegnaPartecipanti() {
        const tb = $('#tabella-partecipanti tbody');
        svuota(tb);
        const frammento = document.createDocumentFragment();
        stato.partecipanti.forEach(p => frammento.appendChild(rigaPartecipante(p)));
        tb.appendChild(frammento);
        filtraPartecipanti();
    }

    function sostituisciPartecipante(p) {
        const vecchio = stato.perUid.get(p.uid);
        const i = stato.partecipanti.indexOf(vecchio);
        if (i >= 0) stato.partecipanti[i] = p; else stato.partecipanti.push(p);
        stato.perUid.set(p.uid, p);
        const tr = $('#tabella-partecipanti tbody').querySelector('tr[data-uid="' + CSS.escape(p.uid) + '"]');
        const nuovo = rigaPartecipante(p);
        if (tr) tr.replaceWith(nuovo); else $('#tabella-partecipanti tbody').appendChild(nuovo);
        filtraPartecipanti();
        aggiornaEtichetteEmail();
        return nuovo;
    }

    function togliPartecipante(uid) {
        const p = stato.perUid.get(uid);
        stato.partecipanti = stato.partecipanti.filter(x => x !== p);
        stato.perUid.delete(uid);
        const tr = $('#tabella-partecipanti tbody').querySelector('tr[data-uid="' + CSS.escape(uid) + '"]');
        if (tr) tr.remove();
        filtraPartecipanti();
        aggiornaEtichetteEmail();
        aggiornaDettaglioConnessi();
    }

    function corrispondeFiltroEmail(p, f) {
        const s = statoInvio(p);
        if (!f) return true;
        if (f === 'in coda') return s === 'in coda' || s === 'invio';
        if (f === 'problemi') return s === 'respinta' || s === 'errore';
        return s === f;
    }

    // ricerca istantanea, sul testo gia' pronto in memoria (anche con mille righe)
    function filtraPartecipanti() {
        const grezzo = $('#cerca-partecipanti').value;
        const q = perRicerca(grezzo);
        const compatta = NU.pulisci(grezzo);
        const fEmail = $('#filtro-stato-email').value;
        let visibili = 0;
        $('#tabella-partecipanti tbody').querySelectorAll('tr[data-uid]').forEach(tr => {
            const p = stato.perUid.get(tr.dataset.uid);
            const ok = !!p && corrispondeFiltroEmail(p, fEmail)
                && (!q || p._cerca.indexOf(q) >= 0 || (compatta.length >= 2 && p._compatto.indexOf(compatta) >= 0));
            tr.hidden = !ok;
            if (ok) visibili++;
        });
        const tot = stato.partecipanti.length;
        $('#conta-partecipanti').textContent = tot ? '(' + (visibili === tot ? tot.toLocaleString('it-IT') : visibili + ' di ' + tot.toLocaleString('it-IT')) + ')' : '';
        const vuoto = $('#partecipanti-vuoto');
        if (!tot) { vuoto.hidden = stato.partecipantiDi !== stato.idEvento; vuoto.textContent = 'Nessun partecipante in questo evento: carica un file qui sopra.'; }
        else if (!visibili) { vuoto.hidden = false; vuoto.textContent = 'Nessun partecipante corrisponde alla ricerca.'; }
        else vuoto.hidden = true;
    }
    $('#cerca-partecipanti').addEventListener('input', filtraPartecipanti);
    $('#filtro-stato-email').addEventListener('change', filtraPartecipanti);

    // il menu "Altro" si chiude cliccando altrove o con Esc, come un menu vero
    document.addEventListener('click', e => {
        document.querySelectorAll('details.altre-azioni[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
    });
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        const aperto = e.target.closest && e.target.closest('details.altre-azioni[open]');
        if (aperto) { aperto.open = false; aperto.querySelector('summary').focus(); }
    });

    $('#tabella-partecipanti tbody').addEventListener('click', e => {
        const b = e.target.closest('button[data-op]');
        if (!b) return;
        const tr = b.closest('tr[data-uid]');
        const p = tr && stato.perUid.get(tr.dataset.uid);
        if (p) operazione(p, b.dataset.op, b);
    });

    async function operazione(p, op, bottone) {
        const chi = [p.nome, p.cognome].filter(Boolean).join(' ') + ' (' + p.nomeUtente + ')';
        const s = statoInvio(p);
        if (op === 'correggi') { apriCorreggi(p); return; }
        let domanda;
        if (op === 'reinvia') {
            domanda = s === 'da inviare' && !(p.invio && p.invio.inviata)
                ? { titolo: 'Inviare adesso le credenziali?', testo: chi + ' riceve subito l\'email con il nome utente e una password.', ok: 'Invia ora' }
                : {
                    titolo: 'Reinviare le credenziali?',
                    testo: chi + ' riceve subito un\'email con il nome utente e una password nuova.\n' + AVVISO_PASSWORD
                        + (s === 'incerto' ? '\nAttenzione: l\'invio precedente si è interrotto a metà e l\'email potrebbe essere già arrivata.' : ''),
                    ok: 'Reinvia'
                };
        } else if (op === 'rigenera') {
            domanda = { titolo: 'Creare una nuova password da comunicare a voce?', testo: 'Per ' + chi + '. La vedrai una volta sola e non viene inviata per email.\n' + AVVISO_PASSWORD, ok: 'Crea la nuova password' };
        } else if (op === 'disattiva') {
            domanda = { titolo: 'Disattivare l\'account?', testo: chi + ' non potrà più entrare in nessun evento; se è collegata viene scollegata. Puoi riattivarlo in qualsiasi momento.', ok: 'Disattiva', pericolo: true };
        } else if (op === 'riattiva') {
            domanda = { titolo: 'Riattivare l\'account?', testo: chi + ' potrà di nuovo entrare con le sue credenziali.', ok: 'Riattiva' };
        } else if (op === 'rimuovi-evento') {
            domanda = { titolo: 'Togliere da questo evento?', testo: chi + ' non vedrà più questo evento. L\'account resta attivo per gli altri eventi.', ok: 'Togli dall\'evento', pericolo: true };
        } else return;
        if (!(await conferma(domanda))) return;
        const menu = bottone.closest('details');
        await conAttesa(bottone, async () => {
            try {
                const r = await chiama('partecipante', { uid: p.uid, idEvento: stato.idEvento, operazione: op });
                if (op === 'rigenera') { mostraPassword(p, r.password); return; }
                if (op === 'rimuovi-evento') { togliPartecipante(p.uid); avviso(chi + ' non fa più parte di questo evento.', 'ok'); return; }
                let nuovo = r.partecipante ? Object.assign({}, r.partecipante) : Object.assign({}, p);
                if (!r.partecipante) {
                    if (op === 'reinvia') nuovo.invio = Object.assign({}, p.invio, r.invio || {}, (r.invio && r.invio.stato === 'inviata') ? { inviata: Date.now() } : {});
                    if (op === 'disattiva') nuovo.stato = 'disattivato';
                    if (op === 'riattiva') nuovo.stato = 'attivo';
                }
                const riga = sostituisciPartecipante(nuovo);
                const detto = {
                    reinvia: nuovo.invio && nuovo.invio.stato === 'inviata' ? 'Credenziali inviate a ' + chi + '.' : 'Invio a ' + chi + ': ' + statoInvio(nuovo) + (nuovo.invio && nuovo.invio.errore ? ' (' + nuovo.invio.errore + ')' : '') + '.',
                    disattiva: 'Account di ' + chi + ' disattivato.',
                    riattiva: 'Account di ' + chi + ' riattivato.'
                };
                avviso(detto[op], op === 'reinvia' && statoInvio(nuovo) !== 'inviata' ? 'errore' : 'ok');
                const stessoBottone = riga.querySelector('button[data-op="' + (op === 'disattiva' ? 'riattiva' : op === 'riattiva' ? 'disattiva' : op) + '"]');
                if (stessoBottone && !menu) stessoBottone.focus();
            } catch (e) {
                /* 409: il servizio spiega perche' no con una frase sua ("Credenziali
                   inviate meno di un minuto fa...", "Invio già in corso...", "Account
                   disattivato: riattivalo prima..."). La si mostra cosi' com'e', e
                   si rilegge l'elenco: lo stato della persona puo' essere cambiato
                   nel frattempo (un altro gestore, il giro automatico). */
                if (e && e.stato === 409) {
                    avviso((op === 'reinvia' ? 'Credenziali non inviate a ' : 'Operazione non eseguita per ') + chi + ': ' + e.msg, 'errore');
                    caricaPartecipanti();
                } else erroreGenerico(e);
            }
        });
        if (op === 'reinvia') aggiornaStatoEmail().catch(() => { /* si vede nella scheda Email */ });
    }

    /* ---------- la password mostrata una volta ---------- */
    function mostraPassword(p, password) {
        const d = $('#dialogo-password');
        $('#password-nome-utente').textContent = p.nomeUtente || '';
        $('#password-mostrata').textContent = password || '';
        nascondiMsg('#msg-password');
        apriDialogo(d);
        $('#btn-chiudi-password').focus();
    }
    // chiusa la finestra, la password sparisce anche dalla pagina
    $('#dialogo-password').addEventListener('close', () => { $('#password-mostrata').textContent = ''; });
    $('#btn-chiudi-password').addEventListener('click', () => chiudiDialogo($('#dialogo-password'), 'ok'));
    $('#btn-copia-password').addEventListener('click', async () => {
        const testo = $('#password-mostrata').textContent;
        try {
            await navigator.clipboard.writeText(testo);
            mostraMsg('#msg-password', 'Password copiata.', 'ok');
        } catch (_) {
            // ripiego: si seleziona il testo, cosi' basta Ctrl+C
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents($('#password-mostrata'));
            sel.removeAllRanges();
            sel.addRange(range);
            mostraMsg('#msg-password', 'Password selezionata: premi Ctrl+C (o Cmd+C) per copiarla.', 'info');
        }
    });

    /* ---------- correzione di nome, cognome, azienda, email ---------- */
    function apriCorreggi(p) {
        stato.inCorrezione = p;
        $('#corr-nome').value = p.nome || '';
        $('#corr-cognome').value = p.cognome || '';
        $('#corr-azienda').value = p.azienda || '';
        $('#corr-email').value = p.email || '';
        $('#correggi-sotto').textContent = 'Nome utente attuale: ' + (p.nomeUtente || '—') + '. Se nome o cognome cambiano, il servizio ricalcola il nome utente e controlla che non sia già usato.';
        $('#corr-nome-attuale').textContent = p.nomeUtente || '';
        const mantieni = document.querySelector('input[name="corr-nome-utente"][value="mantieni"]');
        if (mantieni) mantieni.checked = true;
        nascondiMsg('#msg-correggi');
        $('#form-correggi').querySelectorAll('[aria-invalid]').forEach(n => n.removeAttribute('aria-invalid'));
        anteprimaNomeCorretto();
        apriDialogo($('#dialogo-correggi'));
        $('#corr-nome').focus();
    }
    /* La stessa regola del servizio (correggi in lib/diretta-dati.js): il
       nome utente si ricalcola quando la base di nome e cognome cambia, e
       diventa il primo libero fra base, base2, base3… (quello attuale vale
       come libero). Resta com'e' solo se coincide proprio con la nuova base:
       "mariorossii" corretto in Rossi diventa il primo libero fra
       "mariorossi", "mariorossi2"..., e anche "mariorossi3" puo' diventare
       "mariorossi2" se nel frattempo si e' liberato. Per questo non basta
       che il nome attuale cominci con la base: la scelta «Mantieni» (con le
       credenziali gia' spedite) deve comparire. */
    function anteprimaNomeCorretto() {
        const p = stato.inCorrezione;
        if (!p) return;
        const base = NU.nomeUtenteBase($('#corr-nome').value, $('#corr-cognome').value);
        const baseAttuale = NU.nomeUtenteBase(p.nome, p.cognome);
        const attuale = String(p.nomeUtente || '');
        const cambia = !!base && base !== baseAttuale && attuale !== base;
        let testo;
        if (!base) testo = 'Da questo nome e cognome non resta nessuna lettera a-z: correggili.';
        else if (!cambia) testo = 'Il nome utente resta ' + attuale + '.';
        else if (new RegExp('^' + base + '\\d+$').test(attuale)) {
            testo = 'Il nome utente verrebbe ricalcolato: il primo libero fra ' + base + ', ' + base + '2, ' + base + '3… (potrebbe non restare ' + attuale + ').';
        } else testo = 'Il nome utente cambierebbe da ' + attuale + ' a ' + base + ' (o ' + base + '2, ' + base + '3… se è già usato).';
        $('#corr-anteprima-nome').textContent = testo;
        // credenziali gia' partite: si sceglie se tenere il nome utente che la persona ha gia'
        // ('incerto': l'email potrebbe essere arrivata, vale come spedita)
        $('#corr-scelta-nome').hidden = !(cambia && (statoInvio(p) === 'inviata' || statoInvio(p) === 'incerto'));
    }
    ['#corr-nome', '#corr-cognome'].forEach(s => $(s).addEventListener('input', anteprimaNomeCorretto));
    $('#btn-corr-annulla').addEventListener('click', () => chiudiDialogo($('#dialogo-correggi'), 'annulla'));
    $('#dialogo-correggi').addEventListener('close', () => { stato.inCorrezione = null; });

    $('#form-correggi').addEventListener('submit', async e => {
        e.preventDefault();
        const p = stato.inCorrezione;
        if (!p) return;
        const dati = {
            nome: $('#corr-nome').value.trim().replace(/\s+/g, ' '),
            cognome: $('#corr-cognome').value.trim().replace(/\s+/g, ' '),
            azienda: $('#corr-azienda').value.trim().replace(/\s+/g, ' '),
            email: $('#corr-email').value.trim()
        };
        const errori = [];
        const segna = (sel, t) => { $(sel).setAttribute('aria-invalid', 'true'); errori.push(t); };
        $('#form-correggi').querySelectorAll('[aria-invalid]').forEach(n => n.removeAttribute('aria-invalid'));
        if (!dati.nome) segna('#corr-nome', 'Il nome è vuoto.');
        if (!dati.cognome) segna('#corr-cognome', 'Il cognome è vuoto.');
        if (CARATTERI_VIETATI.test(dati.nome + dati.cognome)) segna('#corr-nome', 'Nome e cognome non possono contenere < > o caratteri invisibili.');
        if (!NU.emailValida(dati.email)) segna('#corr-email', 'L\'email non è valida.');
        if (dati.nome && dati.cognome && !NU.nomeUtenteBase(dati.nome, dati.cognome)) segna('#corr-cognome', 'Da questo nome e cognome non resta nessuna lettera a-z.');
        if (errori.length) { mostraMsg('#msg-correggi', errori.join(' '), 'errore'); return; }
        const sceltaVisibile = !$('#corr-scelta-nome').hidden;
        const mantieni = sceltaVisibile && (document.querySelector('input[name="corr-nome-utente"]:checked') || {}).value === 'mantieni';
        await conAttesa($('#btn-corr-salva'), async () => {
            try {
                const r = await chiama('partecipante', Object.assign({ uid: p.uid, idEvento: stato.idEvento, operazione: 'correggi', mantieniNomeUtente: mantieni }, dati));
                const nuovo = r.partecipante || Object.assign({}, p, dati);
                chiudiDialogo($('#dialogo-correggi'), 'ok');
                const riga = sostituisciPartecipante(nuovo);
                if (r.nomeUtenteCambiato) {
                    const prima = r.nomeUtentePrecedente || p.nomeUtente || '';
                    avviso('Nome utente cambiato' + (prima ? ' da ' + prima : '') + ' a ' + nuovo.nomeUtente + '. ' + (statoInvio(nuovo) === 'da inviare'
                        ? 'Premi «Invia ora» per mandare le credenziali con il nuovo nome utente.'
                        : 'Ricordati di reinviare le credenziali.'), 'ok');
                } else if (statoInvio(p) === 'respinta' && statoInvio(nuovo) === 'da inviare') {
                    // email corretta dopo un rifiuto: il servizio la rimette "da inviare" (R3)
                    avviso('Email di ' + [nuovo.nome, nuovo.cognome].join(' ') + ' corretta: premi «Invia ora» per mandare le credenziali al nuovo indirizzo.', 'ok');
                } else avviso('Dati di ' + [nuovo.nome, nuovo.cognome].join(' ') + ' corretti.'
                    + (nuovo.nomeUtente === p.nomeUtente && mantieni ? ' Il nome utente resta ' + nuovo.nomeUtente + '.' : ''), 'ok');
                const b = riga.querySelector('button[data-op="correggi"]');
                if (b) b.focus();
            } catch (err) {
                if (err.stato === 401 || err.stato === 403) { chiudiDialogo($('#dialogo-correggi'), 'annulla'); erroreGenerico(err); return; }
                if (err.stato === 409) $('#corr-email').setAttribute('aria-invalid', 'true');
                mostraMsg('#msg-correggi', err.msg || 'Correzione non riuscita.', 'errore');
            }
        });
    });

    /* ============================================================
       SCHEDA EMAIL
       ------------------------------------------------------------
       Tutto arriva da api/diretta-gestione (lib/diretta-invio.js):
       - email-stato: i conteggi per stato; la coda (attiva, inCorso,
         bloccato { motivo, quando }, promemoria.<tipo>); quante persone
         riceverebbero i promemoria (destinatariPromemoria { giorno, ora });
         se i rimbalzi di Brevo si possono leggere (esitiDisponibili); il
         tetto del giorno (limiteRaggiunto, rimasteOggi);
       - email-accoda: mette in coda, e toglie un blocco precedente
         (chiedere di nuovo l'invio e' la decisione di riprovare);
       - email-avanza: un giro della coda (vedi avviaCicloEmail);
       - email-esiti: i rimbalzi letti da Brevo, se c'e' la chiave.
       ============================================================ */
    async function aggiornaStatoEmail() {
        const id = stato.idEvento;
        if (!id || !stato.utente) return null;
        const r = await chiama('email-stato', { idEvento: id });
        if (id !== stato.idEvento) return r;
        stato.posta.risposta = r;
        stato.posta.conteggi = r.conteggi || {};
        stato.posta.coda = r.coda || {};
        disegnaConteggi();
        aggiornaEtichetteEmail();
        aggiornaDestinatariPromemoria();
        disegnaStatoPromemoria();
        disegnaCodaFerma();
        // senza BREVO_API_KEY "inviata" vuol dire solo "accettata da Brevo": lo si dice subito
        const nota = $('#nota-esiti');
        nota.hidden = r.esitiDisponibili !== false;
        nota.textContent = r.esitiDisponibili === false
            ? 'Esiti dei rimbalzi non disponibili (manca BREVO_API_KEY sul servizio): «inviata» vuol dire accettata dal server di posta.' : '';
        /* Un invio gia' avviato (da questa pagina prima di ricaricarla, da un
           altro gestore o dal giro automatico) si segue da solo. Non se la
           coda e' ferma per un blocco o per il tetto del giorno: li' la pagina
           non ha niente da aggiungere al giro automatico. */
        const inCoda = Number(stato.posta.conteggi['in coda'] || 0);
        const coda = stato.posta.coda;
        if (inCoda > 0 && (coda.attiva !== false || coda.inCorso) && !r.limiteRaggiunto && !codaBloccata()
            && !(stato.posta.ciclo && stato.posta.ciclo.attivo)) {
            avviaCicloEmail(0);
        }
        return r;
    }
    $('#btn-aggiorna-email').addEventListener('click', () => conAttesa($('#btn-aggiorna-email'), async () => {
        try { await aggiornaStatoEmail(); } catch (e) { erroreGenerico(e, '#msg-email'); }
    }));

    // il blocco del server di posta registrato dal servizio: { motivo, quando } oppure null
    function codaBloccata() {
        const b = (stato.posta.coda || {}).bloccato;
        return b && typeof b === 'object' && b.motivo ? b : null;
    }

    /* Perche' la coda e' ferma, detto a chi deve decidere che cosa fare.
       - Blocco del server di posta (account Brevo sospeso, accesso
         rifiutato, troppi invii): nessuno viene saltato, le persone restano
         in coda. Il giro automatico riprova ogni 5 minuti; «Riprova adesso»
         serve quando il problema su Brevo e' stato risolto.
       - Tetto giornaliero (DIRETTA_MAX_GIORNO): le restanti partono domani
         da sole, non c'e' niente da fare. */
    function disegnaCodaFerma() {
        const r = stato.posta.risposta || {};
        const blocco = codaBloccata();
        const inCoda = Number((stato.posta.conteggi || {})['in coda'] || 0);
        const bottone = $('#btn-riprova-invio');
        const quando = blocco && blocco.quando ? ', alle ' + oraLeggibile(blocco.quando) : '';
        if (blocco && inCoda > 0) {
            mostraMsg('#coda-bloccata', 'Invio fermo: il server di posta ha rifiutato l\'invio per tutti («' + blocco.motivo + '»' + quando + '). '
                + 'Nessuno è stato saltato: ' + conNumero(inCoda, 'persona resta', 'persone restano') + ' in coda. '
                + 'Il servizio riprova da solo ogni 5 minuti; se hai risolto il problema su Brevo, premi «Riprova adesso».', 'errore');
            bottone.hidden = false;
        } else if (r.limiteRaggiunto) {
            const n = Number(r.rimasteOggi || inCoda || 0);
            mostraMsg('#coda-bloccata', 'Limite di oggi raggiunto: ' + (n ? 'le restanti ' + n.toLocaleString('it-IT') + ' partono' : 'le restanti partono')
                + ' domani da sole.', 'attenzione');
            bottone.hidden = true;
        } else if (blocco) {
            // nessuno in coda: l'ultimo invio (per esempio un "Reinvia") e' stato rifiutato
            mostraMsg('#coda-bloccata', 'L\'ultimo invio è stato rifiutato dal server di posta («' + blocco.motivo + '»' + quando + '): '
                + 'controlla l\'account Brevo prima di inviare di nuovo.', 'attenzione');
            bottone.hidden = true;
        } else {
            nascondiMsg('#coda-bloccata');
            bottone.hidden = true;
        }
    }

    // i promemoria, in una riga per tipo (si attivano nella scheda Evento)
    function disegnaStatoPromemoria() {
        const ev = stato.evento;
        const prom = ev && ev.promemoria ? ev.promemoria : {};
        const riga = (nome, attivo, tipo) => el('span', { classe: 'riga-promemoria', testo: (nome + ': ' + (attivo ? 'attivo' : 'non attivo') + '. ' + descriviPromemoria(tipo)).trim() + ' ' });
        const p = $('#promemoria-stato');
        svuota(p);
        p.appendChild(riga('Promemoria del giorno prima', prom.giornoPrima, 'giorno'));
        p.appendChild(riga('Promemoria di un\'ora prima', prom.oraPrima, 'ora'));
        p.appendChild(el('span', { classe: 'riga-promemoria', testo: 'Si attivano nella scheda Evento.' }));
    }

    function disegnaConteggi() {
        const k = stato.posta.conteggi || {};
        document.querySelectorAll('#conteggi-email li[data-stato]').forEach(li => {
            const n = Number(k[li.dataset.stato] || 0);
            li.querySelector('.conteggio-num').textContent = n.toLocaleString('it-IT');
            li.classList.toggle('zero', !n);
        });
    }

    // chi riceverebbe davvero le credenziali: gli account disattivati non si accodano
    function daInviareAttivi() {
        if (stato.partecipantiDi === stato.idEvento && stato.partecipanti.length) {
            return stato.partecipanti.filter(p => statoInvio(p) === 'da inviare' && p.stato !== 'disattivato').length;
        }
        return Number((stato.posta.conteggi || {})['da inviare'] || 0);
    }

    function nonRicevute() {
        // chi e' gia' entrato l'email l'ha ricevuta: non si riaccoda
        if (stato.partecipantiDi === stato.idEvento && stato.partecipanti.length) {
            return stato.partecipanti.filter(p => (statoInvio(p) === 'respinta' || statoInvio(p) === 'errore') && !p.ultimoAccesso && p.stato !== 'disattivato').length;
        }
        const k = stato.posta.conteggi || {};
        return Number(k.respinta || 0) + Number(k.errore || 0);
    }

    function aggiornaEtichetteEmail() {
        const daInviare = daInviareAttivi();
        const nr = nonRicevute();
        const inCorso = !!(stato.posta.ciclo && stato.posta.ciclo.attivo);
        const b1 = $('#btn-invia-tutti');
        const b2 = $('#btn-reinvia-non-ricevute');
        b1.textContent = 'Invia le credenziali a chi non le ha ancora (' + daInviare.toLocaleString('it-IT') + ')';
        // il riquadro "da inviare" conta anche gli account disattivati, che non ricevono niente
        const disattivati = Math.max(0, Number((stato.posta.conteggi || {})['da inviare'] || 0) - daInviare);
        const nota = $('#nota-disattivati');
        nota.hidden = !disattivati;
        nota.textContent = disattivati ? conNumero(disattivati, 'persona', 'persone') + ' «da inviare» ' + plurale(disattivati, 'ha', 'hanno')
            + ' l\'account disattivato: non ' + plurale(disattivati, 'riceve', 'ricevono') + ' niente finché non lo riattivi.' : '';
        b2.textContent = 'Reinvia a chi non l\'ha ricevuta (' + nr.toLocaleString('it-IT') + ')';
        if (b1.getAttribute('aria-busy') !== 'true') b1.disabled = !daInviare || inCorso;
        if (b2.getAttribute('aria-busy') !== 'true') b2.disabled = !nr || inCorso;
    }

    $('#btn-email-prova').addEventListener('click', () => conAttesa($('#btn-email-prova'), async () => {
        const tipo = $('#sel-tipo-prova').value;
        mostraMsg('#msg-email-prova', 'Invio della prova…', 'info');
        try {
            await chiama('email-prova', { idEvento: stato.idEvento, tipo: tipo });
            mostraMsg('#msg-email-prova', 'Email di prova inviata a ' + stato.emailGestore + '. Controlla la casella (anche la posta indesiderata).', 'ok');
        } catch (e) { erroreGenerico(e, '#msg-email-prova'); }
    }));

    // "email-accoda" risponde { accodate, saltate }: le saltate non si possono raggiungere
    function testoAccodate(r, messe) {
        const saltate = Number(r.saltate || 0);
        return conNumero(Number(r.accodate || 0), 'email ' + messe[0], 'email ' + messe[1]) + ' in coda'
            + (saltate ? ' (' + conNumero(saltate, 'persona saltata', 'persone saltate') + ': account disattivato o non completo)' : '');
    }

    $('#btn-invia-tutti').addEventListener('click', async () => {
        const n = daInviareAttivi();
        if (!n) return;
        const ok = await conferma({
            titolo: 'Inviare le credenziali a ' + conNumero(n, 'persona', 'persone') + '?',
            testo: 'Ognuno riceve il proprio nome utente e una password. Le email partono a gruppi, con pause, e nessuno le riceve due volte.',
            dettagli: [
                'Hai già provato l\'email su di te? Se no, annulla e usa «Invia email di prova a me».',
                'Se chiudi la pagina l\'invio continua da solo, un gruppo ogni 5 minuti.'
            ],
            ok: 'Invia a ' + conNumero(n, 'persona', 'persone')
        });
        if (!ok) return;
        await conAttesa($('#btn-invia-tutti'), async () => {
            try {
                const r = await chiama('email-accoda', { idEvento: stato.idEvento, chi: 'da-inviare' });
                if (!r.accodate) { mostraMsg('#msg-email', 'Nessuna email da inviare: tutti hanno già le credenziali o sono in coda.', 'info'); return; }
                mostraMsg('#msg-email', testoAccodate(r, ['messa', 'messe']) + ': l\'invio è partito.', 'ok');
                avviaCicloEmail(r.accodate, 'da-inviare');
            } catch (e) { erroreGenerico(e, '#msg-email'); }
        });
    });

    $('#btn-reinvia-non-ricevute').addEventListener('click', async () => {
        const n = nonRicevute();
        const ok = await conferma({
            titolo: 'Reinviare a chi non l\'ha ricevuta?',
            testo: 'Rimetto in coda le email respinte o in errore delle persone che non sono ancora entrate (' + n + '). Ognuna riceve una password nuova.',
            dettagli: [
                'Se l\'indirizzo era sbagliato, correggilo prima dalla scheda Partecipanti: altrimenti verrà respinta di nuovo.',
                'Le email «incerte» non si reinviano da qui: controllale una per una.'
            ],
            ok: 'Reinvia'
        });
        if (!ok) return;
        await conAttesa($('#btn-reinvia-non-ricevute'), async () => {
            try {
                const r = await chiama('email-accoda', { idEvento: stato.idEvento, chi: 'non-ricevuta' });
                if (!r.accodate) { mostraMsg('#msg-email', 'Nessuna email da reinviare.', 'info'); return; }
                mostraMsg('#msg-email', testoAccodate(r, ['rimessa', 'rimesse']) + '.', 'ok');
                avviaCicloEmail(r.accodate, 'non-ricevuta');
            } catch (e) { erroreGenerico(e, '#msg-email'); }
        });
    });

    /* «Riprova adesso», solo con la coda ferma per un blocco del server di
       posta: si chiede di nuovo l'invio con lo stesso pulsante che l'aveva
       avviato (il servizio toglie il blocco e le persone gia' in coda
       restano in coda), e il giro riparte subito invece di aspettare quello
       automatico. Nessuno riceve due email: la presa in carico di ogni
       persona resta transazionale. */
    $('#btn-riprova-invio').addEventListener('click', () => conAttesa($('#btn-riprova-invio'), async () => {
        const chi = stato.posta.ultimoChi || 'da-inviare';
        try {
            const r = await chiama('email-accoda', { idEvento: stato.idEvento, chi: chi });
            stato.posta.coda = Object.assign({}, stato.posta.coda, { bloccato: null, attiva: true });
            disegnaCodaFerma();
            mostraMsg('#msg-email', 'Coda rimessa in moto' + (r.accodate ? ' (' + testoAccodate(r, ['aggiunta', 'aggiunte']) + ')' : '') + ': l\'invio riparte.', 'ok');
            avviaCicloEmail(Number(r.accodate || 0), chi);
        } catch (e) { erroreGenerico(e, '#msg-email'); }
    }));

    $('#btn-aggiorna-esiti').addEventListener('click', () => conAttesa($('#btn-aggiorna-esiti'), async () => {
        try {
            const r = await chiama('email-esiti', { idEvento: stato.idEvento });
            const respinte = Number(r.respinte || 0);
            if (r.disponibile === false) {
                mostraMsg('#msg-email', 'Esiti dei rimbalzi non disponibili (manca BREVO_API_KEY sul servizio): le email respinte si vedono solo quando il server di posta le rifiuta subito.', 'attenzione');
            } else if (r.letto === false) {
                mostraMsg('#msg-email', 'Esiti non aggiornati: ' + (r.msg || 'Brevo non ha risposto, riprova fra qualche minuto.'), 'errore');
            } else {
                mostraMsg('#msg-email', 'Esiti aggiornati da Brevo: ' + (respinte ? conNumero(respinte, 'email respinta', 'email respinte') + ' in più' : 'nessuna nuova email respinta') + '.', 'ok');
            }
            await aggiornaStatoEmail();
            await caricaPartecipanti();
        } catch (e) { erroreGenerico(e, '#msg-email'); }
    }));

    /* ---------- l'invio che avanza ----------
       Finche' la pagina e' aperta, una chiamata "email-avanza" ogni 2
       secondi; ognuna manda avanti la coda finche' ha tempo (fino a 40 s,
       a gruppi e con pause). Se la pagina si chiude, il giro automatico del
       servizio (ogni 5 minuti) porta a termine la coda: qui si guadagna
       solo tempo. Il servizio ha un lucchetto: due pagine aperte, o la
       pagina e il giro automatico, non spediscono mai due volte la stessa
       email. Che cosa puo' rispondere email-avanza:
         { inviate, respinte, errori, incerti, rimaste, finito }
         occupato: true   -> un altro giro sta lavorando: lo si segue, piu' piano;
         inPausa: true    -> la coda e' ferma per un blocco di poco fa e il servizio
                             aspetta ancora riprovaTraSecondi prima di ritentare;
         bloccato: '...'  -> il server di posta ha rifiutato per tutti: ci si
                             ferma (riprova il giro automatico, o «Riprova adesso»);
         limiteGiorno     -> tetto giornaliero pieno: le restanti partono domani.
       Insistere da qui su un blocco non servirebbe: con Brevo semmai lo allunga. */
    async function avviaCicloEmail(totale, chi) {
        if (chi) stato.posta.ultimoChi = chi;
        const esistente = stato.posta.ciclo;
        if (esistente && esistente.attivo && esistente.idEvento === stato.idEvento) {
            esistente.totale += totale || 0;
            return;
        }
        const ciclo = stato.posta.ciclo = {
            attivo: true, idEvento: stato.idEvento, totale: totale || 0,
            inviate: 0, respinte: 0, errori: 0, incerti: 0, rimaste: null,
            erroriRete: 0, finito: false, fermo: '', seguito: false, nota: ''
        };
        aggiornaEtichetteEmail();
        disegnaAvanzamentoEmail(ciclo);
        while (ciclo.attivo && ciclo.idEvento === stato.idEvento && stato.utente) {
            let r;
            try {
                r = await chiama('email-avanza', { idEvento: ciclo.idEvento });
                ciclo.erroriRete = 0;
                ciclo.nota = '';
            } catch (e) {
                if (e.stato === 401 || e.stato === 403) { erroreGenerico(e); break; }
                ciclo.erroriRete++;
                ciclo.nota = 'Collegamento con il servizio interrotto: riprovo tra poco. L\'invio continua comunque sul servizio ogni 5 minuti.';
                disegnaAvanzamentoEmail(ciclo);
                if (ciclo.erroriRete > 20) break;
                await pausa(Math.min(30000, 3000 * ciclo.erroriRete));
                continue;
            }
            if (!ciclo.attivo || ciclo.idEvento !== stato.idEvento) break;
            ciclo.inviate += Number(r.inviate || 0);
            ciclo.respinte += Number(r.respinte || 0);
            ciclo.errori += Number(r.errori || 0);
            ciclo.incerti += Number(r.incerti || 0);
            if (r.rimaste != null) ciclo.rimaste = Number(r.rimaste);
            const fatte = ciclo.inviate + ciclo.respinte + ciclo.errori + ciclo.incerti;
            if (ciclo.rimaste != null && fatte + ciclo.rimaste > ciclo.totale) ciclo.totale = fatte + ciclo.rimaste;
            let attesa = PAUSA_EMAIL_MS;
            // l'ordine conta: anche "occupato" e "inPausa" riportano il motivo di un blocco precedente
            if (r.occupato) {
                ciclo.seguito = true;
                ciclo.nota = 'Un altro giro di invio è già in corso (automatico o da un\'altra pagina): seguo l\'avanzamento.';
                attesa = PAUSA_OCCUPATO_MS;
            } else if (r.inPausa) {
                ciclo.fermo = 'bloccato';
                const s = Number(r.riprovaTraSecondi || 0);
                ciclo.nota = 'Dopo un blocco del server di posta il servizio aspetta ancora ' + (s ? 'circa ' + conNumero(s, 'secondo', 'secondi') : 'qualche istante')
                    + ' prima di ritentare.';
            } else if (r.bloccato) {
                ciclo.fermo = 'bloccato';
                ciclo.nota = 'Il server di posta ha rifiutato l\'invio («' + (typeof r.bloccato === 'object' ? r.bloccato.motivo : r.bloccato) + '»).';
            } else if (r.limiteGiorno) {
                ciclo.fermo = 'limite';
            } else if (r.finito || ciclo.rimaste === 0) {
                ciclo.finito = true;
            }
            // prima i numeri del servizio, poi il testo: cosi' dicono la stessa cosa
            try { await aggiornaStatoEmail(); } catch (_) { /* il prossimo giro la riprova */ }
            disegnaAvanzamentoEmail(ciclo);
            if (ciclo.fermo || ciclo.finito) break;
            // il tetto del giorno puo' essersi riempito anche per un altro giro
            if ((stato.posta.risposta || {}).limiteRaggiunto) { ciclo.fermo = 'limite'; break; }
            await pausa(attesa);
        }
        ciclo.attivo = false;
        disegnaAvanzamentoEmail(ciclo);
        aggiornaEtichetteEmail();
        // "l'invio è partito" non serve piu': adesso parla la barra dell'avanzamento
        if (ciclo.finito && ciclo.idEvento === stato.idEvento) nascondiMsg('#msg-email');
        if (ciclo.idEvento === stato.idEvento && stato.utente) caricaPartecipanti();
    }

    function disegnaAvanzamentoEmail(ciclo) {
        const box = $('#avanzamento-email');
        box.hidden = false;
        const fatte = ciclo.inviate + ciclo.respinte + ciclo.errori + ciclo.incerti;
        const totale = Math.max(ciclo.totale, fatte + (ciclo.rimaste || 0));
        const pct = ciclo.finito ? 100 : (totale ? Math.round(Math.max(0, totale - (ciclo.rimaste == null ? totale : ciclo.rimaste)) * 100 / totale) : 0);
        box.classList.toggle('finito', ciclo.finito);
        box.classList.toggle('fermo', !!ciclo.fermo);
        box.querySelector('.barra').setAttribute('aria-valuenow', String(pct));
        box.querySelector('.barra-piena').style.width = pct + '%';
        const dettagli = conNumero(ciclo.inviate, 'inviata', 'inviate') + ', ' + conNumero(ciclo.respinte, 'respinta', 'respinte') + ', '
            + conNumero(ciclo.errori, 'errore', 'errori') + (ciclo.incerti ? ', ' + conNumero(ciclo.incerti, 'incerta', 'incerte') : '');
        const restano = ciclo.rimaste ? ' · restano ' + ciclo.rimaste.toLocaleString('it-IT') : '';
        let testo;
        if (ciclo.finito && ciclo.seguito) {
            // ha spedito (anche) un altro giro: contano i numeri dell'evento, non quelli di questa pagina
            const k = stato.posta.conteggi || {};
            testo = 'Invio completato, anche dal giro automatico: in tutto ' + conNumero(Number(k.inviata || 0), 'inviata', 'inviate') + ', '
                + conNumero(Number(k.respinta || 0), 'respinta', 'respinte') + ', ' + conNumero(Number(k.errore || 0), 'errore', 'errori') + '.';
        } else if (ciclo.finito) testo = 'Invio completato: ' + dettagli + '.';
        else if (ciclo.fermo === 'bloccato') testo = 'Invio fermo per un problema del server di posta: ' + dettagli + restano + '.';
        else if (ciclo.fermo === 'limite') testo = 'Invio fermo per il limite di oggi: ' + dettagli + restano + ' (partono domani da sole).';
        else if (ciclo.attivo) testo = 'Invio in corso: ' + dettagli + restano + '.';
        else testo = 'Invio seguito da questa pagina fermo: ' + dettagli + (ciclo.rimaste ? restano + ' (le manda il servizio ogni 5 minuti)' : '') + '.';
        if (ciclo.incerti) testo += ' Le email «incerte» potrebbero essere arrivate: non si rimandano da sole, guardale nella scheda Partecipanti.';
        box.querySelector('.avanzamento-testo').textContent = testo + (ciclo.nota ? ' ' + ciclo.nota : '');
    }

    /* ============================================================
       SCHEDA ESPORTA
       ============================================================ */
    const COLONNE_PARTECIPANTI = ['Nome utente', 'Nome', 'Cognome', 'Email', 'Azienda', 'Account', 'Email credenziali', 'Inviata il',
        'Primo collegamento', 'Ultimo segnale', 'Minuti collegati (durante la diretta)', 'Collegamenti', 'Ultimo accesso'];
    const COLONNE_ACCESSI = ['Quando', 'Nome utente', 'Nome', 'Cognome', 'Azienda', 'Dispositivo'];
    const NOTA_MINUTI = 'Minuti stimati dalla pagina durante la diretta (segnale ogni 60 s, verificato dalle regole con l\'orario del server); limitati alla durata dell\'evento.';

    $('#btn-esporta').addEventListener('click', () => conAttesa($('#btn-esporta'), async () => {
        mostraMsg('#msg-esporta', 'Preparazione del file…', 'info');
        try {
            const [r, XLSX] = await Promise.all([chiama('esporta', { idEvento: stato.idEvento }), caricaSheetJS()]);
            const ev = r.evento || stato.evento || { id: stato.idEvento };
            const durata = ev.inizio && ev.fine && ev.fine > ev.inizio ? (ev.fine - ev.inizio) / 1000 : Infinity;
            const persone = (r.partecipanti || []).slice().sort(ordinePersone);
            const righe = [COLONNE_PARTECIPANTI];
            persone.forEach(p => {
                const pr = p.presenza || {};
                const inv = p.invio || {};
                const secondi = Math.min(Number(pr.secondi || 0), durata);
                righe.push([
                    p.nomeUtente || '', p.nome || '', p.cognome || '', p.email || '', p.azienda || '',
                    p.stato === 'disattivato' ? 'disattivato' : 'attivo',
                    inv.stato || 'da inviare', dataOra(inv.inviata),
                    dataOra(pr.primo), dataOra(pr.ultimo),
                    Math.round(secondi / 60), Number(pr.collegamenti || 0),
                    dataOra(p.ultimoAccesso)
                ]);
            });
            righe.push([]);
            // la nota la scrive il servizio (che limita i minuti), questa e' la stessa se manca
            righe.push([r.nota || NOTA_MINUTI]);
            const accessi = (r.accessi || []).slice().sort((a, b) => (a.quando || 0) - (b.quando || 0));
            const righeAccessi = [COLONNE_ACCESSI].concat(accessi.map(a => [dataOra(a.quando), a.nomeUtente || '', a.nome || '', a.cognome || '', a.azienda || '', a.dispositivo || '']));

            const wb = XLSX.utils.book_new();
            const ws1 = XLSX.utils.aoa_to_sheet(righe);
            ws1['!cols'] = [16, 16, 18, 30, 26, 12, 16, 17, 18, 17, 14, 12, 17].map(w => ({ wch: w }));
            ws1['!autofilter'] = { ref: 'A1:M' + (persone.length + 1) };
            const ws2 = XLSX.utils.aoa_to_sheet(righeAccessi);
            ws2['!cols'] = [17, 16, 16, 18, 26, 22].map(w => ({ wch: w }));
            ws2['!autofilter'] = { ref: 'A1:F' + (accessi.length + 1) };
            XLSX.utils.book_append_sheet(wb, ws1, 'Partecipanti');
            XLSX.utils.book_append_sheet(wb, ws2, 'Accessi');
            const adesso = parti(FORMATO_DATA_ORA, Date.now());
            const nome = 'diretta-' + (ev.id || stato.idEvento) + '-' + adesso.year + adesso.month + adesso.day + '-' + adesso.hour + adesso.minute + '.xlsx';
            XLSX.writeFile(wb, nome, { compression: true });
            mostraMsg('#msg-esporta', 'Scaricato «' + nome + '»: ' + conNumero(persone.length, 'partecipante', 'partecipanti') + ', ' + conNumero(accessi.length, 'accesso', 'accessi') + '.', 'ok');
        } catch (e) { erroreGenerico(e, '#msg-esporta'); }
    }));

    /* ============================================================
       VIA
       ============================================================ */
    adattaTestiPiattaforma();
    avvio().catch(() => {
        mostraMessaggio('Gestione non disponibile', 'Si è verificato un errore imprevisto durante l\'avvio: ricarica la pagina.', () => location.reload());
    });
})();
