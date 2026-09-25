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
        // la prova di ogni campo dei link (ev-video, ev-riserva, regia-video,
        // regia-riserva): l'ultima finita e quella in corso
        prove: {},
        proveInCorso: {},
        // la firma dei link com'e' salvata sul servizio (senza la chiave, che non torna mai)
        firmaSalvata: { schema: 'nessuna', durataOre: 6, parametri: {}, segretoImpostato: false },
        // il tipo di player com'e' salvato sul servizio ('azoto' | 'flusso')
        tipoSalvato: 'azoto',
        // in Regia: per quale evento e quale modo si sono aperte le due parti del video
        blocchiRegia: '',
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

    /* ---------- il video: due modi ----------
       A) il player di Azoto dentro la nostra pagina (un iframe): e' il
          modo predefinito. Dal codice che Azoto ci ha dato si salva SOLO
          l'indirizzo https del player; l'iframe lo costruisce il nostro
          codice (player-azoto.js). Il codice incollato qui resta testo:
          non entra MAI nella pagina e non parte mai verso il servizio.
       B) il flusso diretto (.m3u8, o .mpd) riprodotto dal nostro player
          (player-webtv.js): per quando Azoto ci dara' il link.
       Che cosa sia un testo incollato (un player Azoto, un flusso, o
       niente di buono e perche') lo dice diretta/sorgente-video.js
       (perAzoto, perFlusso), lo stesso file che usano il player e il
       servizio: qui le regole non si ripetono. Se quel file non si fosse
       caricato un flusso non si blocca qui (lo controllano comunque la
       prova e il servizio), mentre il codice di Azoto non si legge:
       estrarne l'indirizzo tocca solo a quelle regole. */
    const SV = window.NGBSorgenteVideo || null;
    const SITO = 'https://nextgenerationbusiness.it';
    // la nota fissa sotto il campo del player Azoto (in sorgente-video.js: AVVISO_INCORPORATO)
    const NOTA_AZOTO = (SV && SV.AVVISO_INCORPORATO)
        || 'Con il player Azoto restano i comandi (e l\'eventuale logo) di Azoto: per usare i nostri comandi serve il link .m3u8 del flusso diretto, da chiedere ad Azoto.';
    document.querySelectorAll('.nota-azoto').forEach(n => { n.textContent = NOTA_AZOTO; });
    // i nomi brevi, per le frasi della regia
    const NOMI_TIPO = { hls: 'flusso HLS', dash: 'flusso DASH', incorporato: 'player Azoto' };
    const NOMI_PLAYER = { azoto: 'Player Azoto', flusso: 'Flusso diretto' };
    // i campi del player Azoto; gli altri (ev-video, ev-riserva, regia-video, regia-riserva) sono il flusso diretto
    const CAMPI_AZOTO = { 'ev-azoto': true, 'regia-azoto': true };

    /* Il player Azoto: il codice incollato o l'indirizzo.
       -> null (vuoto) | { tipo: 'incorporato', valore, daCodice } | { errore, messaggio } */
    function leggiAzoto(testo) {
        const s = String(testo || '').trim();
        if (!s) return null;
        if (!SV || typeof SV.perAzoto !== 'function') {
            return { errore: 'regole', messaggio: 'Non riesco a leggere il player Azoto: manca il file con le regole dei link (sorgente-video.js). Ricarica la pagina.' };
        }
        const r = SV.perAzoto(s);
        if (!r) return null;
        if (r.errore) return { errore: r.errore, messaggio: SV.messaggio(r) };
        return { tipo: r.tipo || 'incorporato', valore: r.valore, daCodice: /<iframe\b/i.test(s) };
    }
    /* Il flusso diretto: solo HLS o DASH.
       -> null (vuoto) | { tipo: 'hls'|'dash', valore } | { errore, messaggio } */
    function leggiFlusso(testo) {
        const s = String(testo || '').trim();
        if (!s) return null;
        if (!SV) {
            return /^https:\/\/\S+$/i.test(s) ? { tipo: '', valore: s }
                : { errore: 'formato', messaggio: 'Serve un indirizzo che comincia con https://.' };
        }
        // (un sorgente-video.js di prima rimasto nella cache del browser: le sue regole, ma solo i flussi)
        const r = typeof SV.perFlusso === 'function' ? SV.perFlusso(s) : SV.leggi(s);
        if (!r) return null;
        if (r.errore) return { errore: r.errore, messaggio: SV.messaggio(r) };
        if (r.tipo !== 'hls' && r.tipo !== 'dash') return { errore: 'formato', messaggio: SV.messaggio({ errore: 'formato' }) };
        return { tipo: r.tipo, valore: r.valore };
    }
    function leggiCampo(id, testo) { return CAMPI_AZOTO[id] ? leggiAzoto(testo) : leggiFlusso(testo); }
    function tipoDi(valore) {
        if (!valore) return '';
        if (SV && typeof SV.tipoDi === 'function') return SV.tipoDi(valore) || '';
        const l = leggiFlusso(valore);
        return l && !l.errore ? l.tipo : '';
    }
    function descrizioneTipo(tipo) {
        if (SV && typeof SV.descrizione === 'function') return SV.descrizione(tipo) || '';
        return NOMI_TIPO[tipo] ? NOMI_TIPO[tipo].charAt(0).toUpperCase() + NOMI_TIPO[tipo].slice(1) + '.' : '';
    }
    // il modo scelto per un evento: 'azoto' se non e' detto (gli eventi di prima)
    function tipoPlayerDi(ev) { return ev && ev.tipoPlayer === 'flusso' ? 'flusso' : 'azoto'; }
    // un link lungo (con i suoi gettoni) si accorcia per le frasi: server e ultimo pezzo del percorso
    function linkBreve(url) {
        try {
            const u = new URL(url);
            const pezzi = u.pathname.split('/').filter(Boolean);
            return u.hostname + (pezzi.length > 1 ? '/…/' : '/') + (pezzi.pop() || '');
        } catch (_) { return String(url || ''); }
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
            catch (e) {
                // senza rete il token non si rinnova: non e' una sessione scaduta, non si esce
                if (e && e.code === 'auth/network-request-failed') {
                    throw new ErroreServizio(0, 'rete', 'Connessione assente o servizio non raggiungibile: controlla la rete e riprova.');
                }
                throw new ErroreServizio(401, 'non-autenticato', 'Sessione scaduta: accedi di nuovo.');
            }
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
        dimenticaProve();
        // una chiave segreta scritta e non salvata non resta nella pagina
        $('#ev-firma-segreto').value = '';
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
            dimenticaProve();
            $('#ev-firma').open = false;
            riempiCampoLink('regia-azoto', ev.azotoUrl);
            riempiCampoLink('regia-video', ev.videoUrl);
            riempiCampoLink('regia-riserva', ev.riservaUrl);
            nascondiMsg('#msg-video');
            nascondiMsg('#msg-sorgente');
            nascondiMsg('#msg-azoto');
            nascondiMsg('#msg-player');
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
            if (!stato.nuovo) {
                seguiCampoLink('ev-azoto', ev.azotoUrl);
                seguiCampoLink('ev-video', ev.videoUrl);
                seguiCampoLink('ev-riserva', ev.riservaUrl);
                seguiFirma(ev);
                seguiTipoPlayer(ev);
            }
            seguiCampoLink('regia-azoto', ev.azotoUrl);
            seguiCampoLink('regia-video', ev.videoUrl);
            seguiCampoLink('regia-riserva', ev.riservaUrl);
        }
        riempiSelectEventi();
    }

    /* I link nei campi (scheda Evento e Regia: il player Azoto e i link
       del flusso) seguono quelli del servizio
       (per esempio dopo un cambio fatto dall'altra scheda o da un altro
       gestore), a meno che il gestore li stia modificando: in quel caso
       resta quello che ha scritto, e al salvataggio vale come una sua
       scelta esplicita. dataset.iniziale e' l'ultimo valore del servizio:
       al salvataggio si manda un link solo se e' diverso da quello. */
    function seguiCampoLink(id, valore) {
        const campo = $('#' + id);
        const nuovo = valore || '';
        if (campo.value.trim() === (campo.dataset.iniziale || '')) {
            campo.value = nuovo;
            campo.removeAttribute('aria-invalid');
        }
        campo.dataset.iniziale = nuovo;
        riconosciLink(id);
    }
    function riempiCampoLink(id, valore) {
        const campo = $('#' + id);
        campo.value = valore || '';
        campo.dataset.iniziale = campo.value;
        campo.removeAttribute('aria-invalid');
        riconosciLink(id);
    }

    function nuovoEvento() {
        stato.nuovo = true;
        stato.idModificatoAMano = false;
        chiudiAnteprimaVideo();
        dimenticaProve();
        $('#ev-firma').open = false;
        riempiSelectEventi();
        compilaFormEvento(null);
        // la pillola della testata era dell'evento scelto prima: uno nuovo non ha ancora uno stato
        $('#stato-testata').textContent = '';
        $('#stato-testata').dataset.stato = '';
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
        // i link con cui si apre il modulo: al salvataggio si mandano solo se cambiati
        riempiCampoLink('ev-azoto', ev ? ev.azotoUrl : '');
        riempiCampoLink('ev-video', ev ? ev.videoUrl : '');
        riempiCampoLink('ev-riserva', ev ? ev.riservaUrl : '');
        compilaFirma(ev);
        compilaTipoPlayer(ev);
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

    /* ---------- i link firmati ----------
       Il modulo mostra la firma salvata (tipo, durata, nomi dei parametri)
       e la chiave solo come "impostata": il servizio non la rimanda mai
       (segretoImpostato). Una chiave scritta qui parte con il salvataggio
       dell'evento e il campo si svuota subito dopo. */
    const SCHEMI_FIRMA = { nessuna: 'nessuna firma', nginx: 'nginx secure_link', akamai: 'Akamai EdgeAuth' };
    const DURATA_FIRMA = 6;
    // le stesse regole del servizio (lib/diretta-firma.js)
    const RE_NOME_PARAMETRO = /^[A-Za-z0-9_.-]{1,40}$/;
    const RE_ACL = /^\/[^\s~&#?"'<>\\]{0,499}$/;
    // i valori predefiniti che non serve mandare (il servizio li usa da solo)
    const PREDEFINITI_FIRMA = { percorso: 'intero' };
    // i nomi dei parametri di ogni tipo di firma, con il campo del modulo
    const PARAMETRI_FIRMA = {
        nginx: { nomeFirma: '#ev-firma-nome-firma', nomeScadenza: '#ev-firma-nome-scadenza', percorso: '#ev-firma-percorso' },
        akamai: { acl: '#ev-firma-acl', nomeParametro: '#ev-firma-nome-parametro' }
    };

    function schemaScelto() {
        const r = document.querySelector('input[name="ev-firma-schema"]:checked');
        return r && SCHEMI_FIRMA[r.value] ? r.value : 'nessuna';
    }
    // la firma di un evento del servizio, con i valori predefiniti
    function firmaDa(ev) {
        const f = (ev && ev.firma) || {};
        const schema = SCHEMI_FIRMA[f.schema] ? f.schema : 'nessuna';
        const durata = Number(f.durataOre);
        const p = f.parametri && typeof f.parametri === 'object' ? f.parametri : {};
        const parametri = {};
        Object.keys(PARAMETRI_FIRMA[schema] || {}).forEach(k => { if (p[k] && p[k] !== PREDEFINITI_FIRMA[k]) parametri[k] = String(p[k]); });
        return {
            schema: schema,
            durataOre: Number.isInteger(durata) && durata >= 1 && durata <= 24 ? durata : DURATA_FIRMA,
            parametri: parametri,
            segretoImpostato: f.segretoImpostato === true
        };
    }
    function compilaFirma(ev) {
        const f = firmaDa(ev);
        stato.firmaSalvata = f;
        document.querySelectorAll('input[name="ev-firma-schema"]').forEach(r => { r.checked = r.value === f.schema; });
        const segreto = $('#ev-firma-segreto');
        segreto.value = '';
        segreto.type = 'password';
        $('#btn-mostra-segreto').setAttribute('aria-pressed', 'false');
        $('#btn-mostra-segreto').setAttribute('aria-label', 'Mostra la chiave segreta');
        $('#ev-firma-durata').value = String(f.durataOre);
        Object.keys(PARAMETRI_FIRMA).forEach(schema => {
            Object.keys(PARAMETRI_FIRMA[schema]).forEach(k => {
                $(PARAMETRI_FIRMA[schema][k]).value = (schema === f.schema ? f.parametri[k] : '') || PREDEFINITI_FIRMA[k] || '';
            });
        });
        aggiornaVistaFirma();
    }
    // un aggiornamento del servizio (per esempio dalla Regia): il modulo lo segue se non lo si sta modificando
    function seguiFirma(ev) {
        if (!leggiFirma(() => { /* qui gli errori non contano */ }).cambiata) compilaFirma(ev);
        else stato.firmaSalvata = firmaDa(ev);
        aggiornaVistaFirma();
    }

    function aggiornaVistaFirma() {
        const schema = schemaScelto();
        const f = stato.firmaSalvata;
        $('#ev-firma-campi').hidden = schema === 'nessuna';
        document.querySelectorAll('#ev-firma-campi [data-schema]').forEach(n => { n.hidden = n.dataset.schema !== schema; });
        const tieneChiave = f.segretoImpostato && f.schema === schema;
        const scritta = !!$('#ev-firma-segreto').value.trim();
        $('#ev-firma-segreto-aiuto').textContent = tieneChiave
            ? 'Chiave impostata: lasciala vuota per non cambiarla. Scrivine una solo se la web TV ve ne ha data una nuova.'
            : 'La chiave che vi ha dato la web TV' + (schema === 'akamai' ? ' (per Akamai è esadecimale: cifre 0-9 e lettere a-f)' : '')
              + '. Si scrive e basta: resta sul servizio e non si rilegge più, nemmeno da qui.';
        $('#ev-firma-segreto').placeholder = tieneChiave ? 'Chiave impostata' : '';
        // il riassunto accanto al titolo: si legge anche a sezione chiusa
        let riassunto = SCHEMI_FIRMA[schema];
        if (schema !== 'nessuna') {
            const durata = Number($('#ev-firma-durata').value);
            if (Number.isInteger(durata) && durata >= 1 && durata <= 24) riassunto += ' · ' + conNumero(durata, 'ora', 'ore');
            riassunto += tieneChiave && !scritta ? ' · chiave impostata' : (scritta ? ' · chiave da salvare' : ' · manca la chiave');
        }
        const r = $('#ev-firma-riassunto');
        r.textContent = riassunto;
        r.dataset.attiva = schema !== 'nessuna' ? 'si' : '';
    }
    document.querySelectorAll('input[name="ev-firma-schema"]').forEach(r => r.addEventListener('change', aggiornaVistaFirma));
    ['#ev-firma-segreto', '#ev-firma-durata'].forEach(s => $(s).addEventListener('input', aggiornaVistaFirma));
    $('#btn-mostra-segreto').addEventListener('click', () => {
        const campo = $('#ev-firma-segreto');
        const b = $('#btn-mostra-segreto');
        const mostra = campo.type === 'password';
        campo.type = mostra ? 'text' : 'password';
        b.setAttribute('aria-pressed', String(mostra));
        b.setAttribute('aria-label', mostra ? 'Nascondi la chiave segreta' : 'Mostra la chiave segreta');
    });

    /* -> { firma, cambiata, tolta }. firma e' quella da mandare al servizio:
       { schema, durataOre, parametri, segreto? } (segreto solo se scritto:
       senza, il servizio tiene quello salvato). */
    function leggiFirma(segna) {
        const salvata = stato.firmaSalvata;
        const schema = schemaScelto();
        if (schema === 'nessuna') {
            const tolta = salvata.schema !== 'nessuna';
            return { firma: { schema: 'nessuna' }, cambiata: tolta, tolta: tolta };
        }
        const segreto = $('#ev-firma-segreto').value.trim();
        const testoDurata = $('#ev-firma-durata').value.trim();
        const durata = testoDurata === '' ? DURATA_FIRMA : Number(testoDurata);
        const parametri = {};
        Object.keys(PARAMETRI_FIRMA[schema]).forEach(k => {
            const sel = PARAMETRI_FIRMA[schema][k];
            const v = $(sel).value.trim();
            if (!v || v === PREDEFINITI_FIRMA[k]) return;
            if (k === 'acl') {
                if (!RE_ACL.test(v)) segna(sel, 'Link firmati: i percorsi ammessi (acl) cominciano con / e non hanno spazi né i caratteri ~ & # ? (per esempio /live/napoli/*).');
            } else if (k === 'percorso') {
                if (v !== 'cartella') segna(sel, 'Link firmati: scegli che cosa si firma.');
            } else if (!RE_NOME_PARAMETRO.test(v)) {
                segna(sel, 'Link firmati: il nome di un parametro può avere solo lettere, numeri, punti, trattini e trattini bassi.');
            }
            parametri[k] = v;
        });
        if (schema === 'nginx' && parametri.nomeFirma && parametri.nomeFirma === parametri.nomeScadenza) {
            segna('#ev-firma-nome-scadenza', 'Link firmati: la firma e la scadenza devono avere nomi diversi.');
        }
        const tieneChiave = salvata.segretoImpostato && salvata.schema === schema;
        if (!segreto && !tieneChiave) {
            segna('#ev-firma-segreto', salvata.segretoImpostato
                ? 'Link firmati: hai cambiato il tipo di firma, scrivi la chiave segreta per ' + SCHEMI_FIRMA[schema] + '.'
                : 'Link firmati: scrivi la chiave segreta che vi ha dato la web TV.');
        } else if (segreto && schema === 'akamai' && !/^([0-9a-f]{2})+$/i.test(segreto)) {
            segna('#ev-firma-segreto', 'Link firmati: la chiave di Akamai EdgeAuth è esadecimale (solo cifre 0-9 e lettere a-f, in numero pari).');
        }
        if (!Number.isInteger(durata) || durata < 1 || durata > 24) segna('#ev-firma-durata', 'Link firmati: la durata è un numero intero di ore, da 1 a 24.');
        const firma = { schema: schema, durataOre: durata, parametri: parametri };
        if (segreto) firma.segreto = segreto;
        const cambiata = !!segreto || schema !== salvata.schema || durata !== salvata.durataOre
            || JSON.stringify(parametri) !== JSON.stringify(salvata.parametri);
        return { firma: firma, cambiata: cambiata, tolta: false };
    }

    /* ---------- il tipo di player ----------
       «Player Azoto (iframe)» e' il predefinito. «Flusso diretto (.m3u8)»
       si puo' scegliere solo con un link del flusso valido nel riquadro
       «Flusso diretto» (il servizio rifiuterebbe comunque la modalita'
       senza un flusso salvato): finche' manca, l'opzione e' spenta e dice
       perche'. stato.tipoSalvato e' la scelta com'e' sul servizio: al
       salvataggio il tipo si manda solo se cambiato qui. */
    const RADIO_TIPO = Array.from(document.querySelectorAll('input[name="ev-tipo-player"]'));
    const RADIO_FLUSSO = RADIO_TIPO.find(r => r.value === 'flusso');
    function tipoScelto() {
        const r = RADIO_TIPO.find(x => x.checked);
        return r && r.value === 'flusso' ? 'flusso' : 'azoto';
    }
    function scegliTipo(tipo) {
        RADIO_TIPO.forEach(r => { r.checked = r.value === tipo; r.removeAttribute('aria-invalid'); });
    }
    function compilaTipoPlayer(ev) {
        stato.tipoSalvato = ev ? tipoPlayerDi(ev) : 'azoto';
        scegliTipo(stato.tipoSalvato);
        aggiornaVistaTipoPlayer();
    }
    // un cambio arrivato dal servizio (per esempio dalla Regia): il modulo lo segue, se qui non si e' scelto altro
    function seguiTipoPlayer(ev) {
        const nuovo = tipoPlayerDi(ev);
        if (tipoScelto() === stato.tipoSalvato) scegliTipo(nuovo);
        stato.tipoSalvato = nuovo;
        aggiornaVistaTipoPlayer();
    }
    // il link del flusso nel campo e' valido (un .m3u8 o un .mpd)?
    function flussoPronto() {
        const l = leggiFlusso($('#ev-video').value);
        return !!l && !l.errore;
    }
    function aggiornaVistaTipoPlayer() {
        const tipo = tipoScelto();
        const pronto = flussoPronto();
        // gia' scelto resta sceglibile: se il link manca lo dice il salvataggio
        RADIO_FLUSSO.disabled = !pronto && tipo !== 'flusso';
        RADIO_FLUSSO.closest('.opzione').classList.toggle('spenta', RADIO_FLUSSO.disabled);
        // (la classe al posto di :has(), che manca nei browser meno recenti)
        $('#ev-tipo-player').dataset.errore = RADIO_TIPO.some(r => r.getAttribute('aria-invalid') === 'true') ? 'si' : '';
        const nota = $('#ev-tipo-flusso-nota');
        if (pronto) {
            nota.textContent = 'Il link del flusso è pronto nel riquadro «Flusso diretto (.m3u8)» qui sotto.';
            nota.dataset.tono = 'ok';
        } else if (tipo === 'flusso') {
            nota.textContent = 'Manca un link .m3u8 valido nel riquadro «Flusso diretto (.m3u8)» qui sotto: senza, questa scelta non si può salvare.';
            nota.dataset.tono = 'errore';
        } else {
            nota.textContent = 'Si può scegliere quando c\'è il link .m3u8 del flusso, nel riquadro «Flusso diretto (.m3u8)» qui sotto.';
            nota.dataset.tono = '';
        }
        const daSalvare = stato.nuovo || tipo !== stato.tipoSalvato;
        ['azoto', 'flusso'].forEach(t => {
            const blocco = $('#blocco-' + t);
            const inUso = t === tipo;
            blocco.dataset.inUso = inUso ? 'si' : '';
            const bollo = blocco.querySelector('.blocco-uso');
            bollo.textContent = inUso ? (daSalvare ? 'scelto' : 'in uso') : 'non in uso';
            bollo.dataset.stato = inUso ? 'si' : '';
        });
    }
    RADIO_TIPO.forEach(r => r.addEventListener('change', () => {
        RADIO_TIPO.forEach(x => x.removeAttribute('aria-invalid'));
        aggiornaVistaTipoPlayer();
    }));

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
        const tipo = tipoScelto();
        const azotoTesto = $('#ev-azoto').value.trim();
        const videoUrl = $('#ev-video').value.trim();
        const riservaUrl = $('#ev-riserva').value.trim();
        const pagina = normalizzaPagina($('#ev-pagina').value);
        const programma = leggiProgramma($('#ev-programma').value);

        if (stato.nuovo && !/^[a-z0-9][a-z0-9-]{2,40}$/.test(id)) segna('#ev-id', 'Identificativo: da 3 a 41 caratteri, solo lettere minuscole, numeri e trattini (es. napoli-2026).');
        if (titolo.length < 3 || titolo.length > 140) segna('#ev-titolo', 'Titolo: da 3 a 140 caratteri.');
        if (luogo.length > 140) segna('#ev-luogo', 'Luogo: al massimo 140 caratteri.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || isNaN(Date.parse(data + 'T12:00:00Z'))) segna('#ev-data', 'Data: scegli il giorno dell\'evento.');
        if (!/^\d{2}:\d{2}$/.test(oraInizio)) segna('#ev-ora-inizio', 'Ora di inizio mancante.');
        if (!/^\d{2}:\d{2}$/.test(oraFine)) segna('#ev-ora-fine', 'Ora di fine mancante.');
        else if (/^\d{2}:\d{2}$/.test(oraInizio) && oraFine <= oraInizio) segna('#ev-ora-fine', 'L\'ora di fine deve venire dopo quella di inizio.');
        /* I link si controllano solo se cambiati qui: uno salvato prima con
           regole diverse non deve impedire di correggere, per esempio, il
           titolo. Il player Azoto e' "cambiato" solo se l'indirizzo che se
           ne ricava e' diverso da quello salvato (lo stesso player incollato
           come codice non cambia niente). */
        const azotoIniziale = $('#ev-azoto').dataset.iniziale || '';
        const la = leggiAzoto(azotoTesto);
        const azotoCambiato = stato.nuovo ? !!azotoTesto
            : azotoTesto !== azotoIniziale && !(la && !la.errore && la.valore === azotoIniziale);
        if (azotoCambiato && la && la.errore) segna('#ev-azoto', 'Player Azoto: ' + la.messaggio);
        const videoCambiato = stato.nuovo || videoUrl !== ($('#ev-video').dataset.iniziale || '');
        const riservaCambiata = stato.nuovo || riservaUrl !== ($('#ev-riserva').dataset.iniziale || '');
        const lp = leggiFlusso(videoUrl);
        const lr = leggiFlusso(riservaUrl);
        if (videoCambiato && lp && lp.errore) segna('#ev-video', 'Link del flusso: ' + lp.messaggio);
        if (riservaCambiata && lr && lr.errore) segna('#ev-riserva', 'Link di riserva: ' + lr.messaggio);
        if (videoCambiato || riservaCambiata) {
            if (riservaUrl && !videoUrl) segna('#ev-riserva', 'Il link di riserva serve insieme al link del flusso: inserisci prima quello.');
            else if (lp && lr && !lp.errore && !lr.errore && lp.valore === lr.valore) {
                segna('#ev-riserva', 'Il link di riserva è uguale a quello del flusso: inserisci un link diverso (un altro server o un altro canale) oppure lascialo vuoto.');
            }
        }
        // il flusso diretto senza un flusso valido: il servizio lo rifiuterebbe
        if (tipo === 'flusso' && !(lp && !lp.errore) && !(videoCambiato && lp && lp.errore)) {
            segna('input[name="ev-tipo-player"][value="flusso"]', 'Tipo di player: per il flusso diretto serve prima il link .m3u8, nel riquadro «Flusso diretto (.m3u8)».');
        }
        if (pagina && !/^\/[a-z0-9_\/-]*\/?$/.test(pagina)) segna('#ev-pagina', 'Pagina dell\'evento: solo il percorso, per esempio /napoli_ottobre_2026/.');
        if (programma.errori.length) { $('#ev-programma').setAttribute('aria-invalid', 'true'); errori.push.apply(errori, programma.errori); }
        const firma = leggiFirma(segna);

        const evento = {
            id: stato.nuovo ? id : stato.idEvento,
            nuovo: stato.nuovo,
            titolo: titolo, luogo: luogo, data: data, oraInizio: oraInizio, oraFine: oraFine,
            videoUrl: videoUrl, videoId: lp && !lp.errore ? lp.valore : '',
            riservaUrl: riservaUrl,
            programma: programma.voci,
            paginaEvento: pagina,
            unSoloDispositivo: $('#ev-un-dispositivo').checked,
            promemoria: { giornoPrima: $('#ev-promemoria-giorno').checked, oraPrima: $('#ev-promemoria-ora').checked }
        };
        // al servizio va solo l'indirizzo ricavato qui, mai il codice incollato
        if (azotoCambiato) evento.azotoUrl = la && !la.errore ? la.valore : '';
        const tipoCambiato = stato.nuovo || tipo !== stato.tipoSalvato;
        if (tipoCambiato) evento.tipoPlayer = tipo;
        return {
            errori: errori,
            tipo: tipo,
            tipoCambiato: tipoCambiato,
            azotoCambiato: azotoCambiato,
            azotoDaCodice: !!(la && la.daCodice),
            videoCambiato: videoCambiato,
            riservaCambiata: riservaCambiata,
            firma: firma,
            evento: evento
        };
    }

    $('#form-evento').addEventListener('submit', async e => {
        e.preventDefault();
        const letto = leggiFormEvento();
        const evento = letto.evento;
        aggiornaVistaTipoPlayer();
        if (letto.errori.length) {
            mostraMsg('#msg-evento', letto.errori.join(' '), 'errore');
            const primo = $('#form-evento [aria-invalid="true"]');
            if (primo) {
                // un errore nei link firmati: la sezione si apre, se era chiusa
                const sezione = primo.closest('details');
                if (sezione) sezione.open = true;
                primo.focus();
            }
            return;
        }
        /* I link si mandano solo se il gestore li ha cambiati qui. I campi
           sono stati riempiti quando si e' aperto l'evento: se nel frattempo
           i link sono stati cambiati dalla Regia (da un altro gestore, o da
           un'altra scheda del browser), rimandare quei valori per correggere,
           per esempio, il titolo rimetterebbe a tutti i link vecchi. Senza
           videoUrl / riservaUrl / azotoUrl il servizio tiene quelli che ha.
           Lo stesso per il tipo di player e per la firma: si mandano solo se
           cambiati. */
        const eraNuovo = stato.nuovo;
        const tipo = letto.tipo;
        const tipoCambiato = letto.tipoCambiato && !eraNuovo;
        const azotoCambiato = letto.azotoCambiato;
        const videoCambiato = letto.videoCambiato;
        const riservaCambiata = letto.riservaCambiata;
        if (!videoCambiato) { delete evento.videoUrl; delete evento.videoId; }
        if (!riservaCambiata) delete evento.riservaUrl;
        if (letto.firma.cambiata || (eraNuovo && letto.firma.firma.schema !== 'nessuna')) evento.firma = letto.firma.firma;
        const evPrima = stato.evento;
        const inOnda = !eraNuovo && !!evPrima && evPrima.stato === 'in_onda';
        $('#ev-pagina').value = evento.paginaEvento;
        await conAttesa($('#btn-salva-evento'), async () => {
            /* Un link nuovo si prova prima di salvarlo (la prova di «Prova il
               player» / «Prova il link», se fatta da poco sullo stesso testo,
               vale): con esito 'errore' non si salva niente, con 'avviso' si
               chiede conferma. */
            const avvisi = [];
            const daProvare = [];
            if (azotoCambiato && evento.azotoUrl) daProvare.push({ id: 'ev-azoto', etichetta: 'Player Azoto' });
            if (videoCambiato && evento.videoUrl) daProvare.push({ id: 'ev-video', etichetta: 'Link del flusso' });
            if (riservaCambiata && evento.riservaUrl) daProvare.push({ id: 'ev-riserva', etichetta: 'Link di riserva' });
            for (const x of daProvare) {
                mostraMsg('#msg-evento', 'Prova in corso: ' + x.etichetta.toLowerCase() + '…', 'info');
                const p = await provaPerSalvare(x.id);
                // nel frattempo si e' passati a un altro evento: questo salvataggio non vale piu'
                if (eraNuovo ? !stato.nuovo : stato.idEvento !== evento.id) { nascondiMsg('#msg-evento'); return; }
                const v = verdettoProva(p, x.etichetta);
                if (v.fermo) {
                    if (v.messaggio) mostraMsg('#msg-evento', v.messaggio + '. Non ho salvato niente.', v.tono);
                    else nascondiMsg('#msg-evento');
                    if (v.tono === 'errore') $('#' + x.id).focus();
                    return;
                }
                avvisi.push.apply(avvisi, v.avvisi);
                if (x.id === 'ev-video' && p.valore) evento.videoId = p.valore;
            }
            nascondiMsg('#msg-evento');

            // una sola domanda per tutto: gli avvisi della prova, il cambio durante la diretta, la firma tolta
            const tolto = videoCambiato && !evento.videoUrl && !!(evPrima && evPrima.videoUrl);
            const azotoTolto = azotoCambiato && !evento.azotoUrl && !!(evPrima && evPrima.azotoUrl);
            const riservaTolta = riservaCambiata && !evento.riservaUrl && !!(evPrima && evPrima.riservaUrl);
            const riservaInUsoTolta = riservaTolta && !!evPrima && evPrima.sorgente === 'riserva';
            const fraseOnda = inOnda ? frasiCambioInOnda(evPrima, {
                tipo: tipo, tipoCambiato: tipoCambiato, azoto: azotoCambiato, azotoTolto: azotoTolto,
                principale: videoCambiato, riserva: riservaCambiata, principaleTolto: tolto, riservaTolta: riservaTolta
            }).join('\n') : '';
            const dettagli = avvisi.slice();
            if (riservaInUsoTolta && !inOnda) dettagli.push('La riserva è la scelta della regia: togliendola, quando si userà il flusso diretto si partirà dal link principale.');
            if (letto.firma.tolta) dettagli.push('Link firmati: si tolgono, e la chiave segreta salvata viene cancellata.');
            const suAzoto = tipo === 'azoto';
            let domanda = null;
            if (avvisi.length) {
                domanda = {
                    titolo: 'Salvare lo stesso?',
                    testo: 'La prova ha trovato dei problemi: finché non sono risolti, i partecipanti potrebbero non vedere il video.' + (fraseOnda ? '\n' + fraseOnda : ''),
                    dettagli: dettagli, ok: 'Salva lo stesso'
                };
            } else if (inOnda && suAzoto && azotoTolto) {
                domanda = { titolo: 'Togliere il player Azoto?', testo: fraseOnda, dettagli: dettagli, ok: 'Togli il player', pericolo: true };
            } else if (fraseOnda) {
                if (tipoCambiato) {
                    domanda = { titolo: 'Cambiare il tipo di player per tutti?', testo: fraseOnda, dettagli: dettagli, ok: tipo === 'flusso' ? 'Passa al flusso diretto' : 'Torna al player Azoto' };
                } else if (suAzoto) {
                    domanda = { titolo: 'Cambiare il player per tutti?', testo: fraseOnda, dettagli: dettagli, ok: 'Cambia il player' };
                } else {
                    domanda = videoCambiato
                        ? { titolo: 'Cambiare il link per tutti?', testo: fraseOnda, dettagli: dettagli, ok: 'Cambia il link' }
                        : { titolo: 'Cambiare il link di riserva?', testo: fraseOnda, dettagli: dettagli, ok: evento.riservaUrl ? 'Salva la riserva' : 'Togli la riserva' };
                }
            } else if (riservaInUsoTolta) {
                domanda = { titolo: 'Togliere il link di riserva?', testo: 'In regia hai scelto la riserva per tutti.', dettagli: dettagli, ok: 'Togli la riserva', pericolo: true };
            } else if (letto.firma.tolta) {
                domanda = {
                    titolo: 'Togliere i link firmati?',
                    testo: 'I partecipanti riceveranno il link del flusso così com\'è, senza firma.',
                    dettagli: dettagli, ok: 'Togli la firma', pericolo: true
                };
            }
            if (domanda && !(await conferma(domanda))) return;
            try {
                const r = await chiama('evento-salva', { evento: evento });
                if (eraNuovo) r.evento.iscritti = r.evento.iscritti || 0;
                stato.nuovo = false;
                aggiornaEvento(r.evento);
                selezionaEvento(r.evento.id);
                const detto = [eraNuovo ? 'Evento creato. Ora carica i partecipanti dalla scheda Partecipanti.' : 'Modifiche salvate.'];
                if (tipoCambiato) {
                    detto.push(inOnda
                        ? (tipo === 'flusso' ? 'I partecipanti collegati passano al flusso diretto.' : 'I partecipanti collegati tornano al player Azoto.')
                        : 'Tipo di player: ' + (tipo === 'flusso' ? 'flusso diretto (.m3u8).' : 'player Azoto.'));
                } else if (fraseOnda) {
                    detto.push(suAzoto ? (azotoTolto ? 'Player Azoto tolto.' : 'I partecipanti collegati passano al nuovo player Azoto.') : 'I partecipanti collegati ricevono i link nuovi.');
                }
                if (azotoCambiato && evento.azotoUrl && letto.azotoDaCodice) detto.push('Dal codice di Azoto ho salvato solo l\'indirizzo del player.');
                if (evento.firma && evento.firma.segreto) detto.push('La chiave segreta è salvata sul servizio.');
                if (avvisi.length) detto.push('Ricorda i problemi segnalati dalla prova: riprova quando Azoto li ha risolti.');
                mostraMsg('#msg-evento', detto.join(' '), 'ok');
                // orari e caselle dei promemoria cambiano chi li riceve e quando
                if (!eraNuovo) aggiornaStatoEmail().catch(() => { /* lo si rivede aprendo la scheda Email */ });
            } catch (err) {
                if (err.stato === 409) {
                    $('#ev-id').setAttribute('aria-invalid', 'true');
                    mostraMsg('#msg-evento', err.msg || 'Esiste già un evento con questo identificativo: scegline un altro.', 'errore');
                } else if (err.stato === 400 && err.codice === 'azoto') {
                    $('#ev-azoto').setAttribute('aria-invalid', 'true');
                    erroreGenerico(err, '#msg-evento');
                } else if (err.stato === 400 && err.codice === 'tipoPlayer') {
                    RADIO_FLUSSO.setAttribute('aria-invalid', 'true');
                    aggiornaVistaTipoPlayer();
                    erroreGenerico(err, '#msg-evento');
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

        aggiornaVideoRegia();
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
        /* il player per tutti: si vede il pulsante che porta all'altro modo,
           acceso solo se l'altro modo ha il suo link (il flusso .m3u8 per il
           flusso diretto, l'indirizzo per il player Azoto) */
        const tipo = tipoPlayerDi(ev);
        $('#btn-passa-flusso').hidden = !!ev && tipo === 'flusso';
        $('#btn-passa-azoto').hidden = !ev || tipo !== 'flusso';
        imposta('#btn-passa-flusso', !!ev && !!ev.videoId);
        imposta('#btn-passa-azoto', !!ev && !!ev.azotoUrl);
        /* principale / riserva per tutti: un pulsante per link. Quello del
           link gia' scelto "riconferma" la scelta (riporta chi era passato
           da solo all'altro link dopo un guasto): serve solo in onda e con il
           flusso diretto in uso. Senza riserva nessuno puo' passare all'altro
           link: niente da scegliere. */
        const suRiserva = !!ev && ev.sorgente === 'riserva';
        const conRiserva = !!ev && !!ev.riservaUrl;
        const flussoInOnda = s === 'in_onda' && tipo === 'flusso';
        $('.sorgente-comandi[data-sorgente]').dataset.sorgente = suRiserva ? 'riserva' : 'principale';
        if (!occupato('#btn-sorgente-riserva')) $('#btn-sorgente-riserva').textContent = suRiserva ? 'Riporta tutti sulla riserva' : 'Passa alla riserva per tutti';
        if (!occupato('#btn-sorgente-principale')) $('#btn-sorgente-principale').textContent = suRiserva ? 'Torna al link principale per tutti' : 'Riporta tutti sul link principale';
        $('#btn-sorgente-riserva').hidden = suRiserva && !flussoInOnda;
        $('#btn-sorgente-principale').hidden = !suRiserva && !flussoInOnda;
        imposta('#btn-sorgente-riserva', conRiserva);
        imposta('#btn-sorgente-principale', !!ev && (suRiserva || conRiserva));
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
            const vistaSubito = ' Chi è collegato lo vede subito; chi apre la pagina entra direttamente nella diretta.';
            let video;
            if (tipoPlayerDi(ev) === 'azoto') {
                video = ev.azotoUrl
                    ? 'Si usa il player Azoto (' + linkBreve(ev.azotoUrl) + ').' + vistaSubito
                    : 'L\'indirizzo del player Azoto NON è impostato: finché non lo inserisci, i partecipanti vedranno «Il video sta per arrivare».';
            } else {
                video = ev.videoId
                    ? 'Si usa il flusso diretto (' + (NOMI_TIPO[tipoDi(ev.videoId)] || 'web TV') + (ev.riservaUrl ? ', con la riserva' : ', senza riserva') + ').'
                      + (ev.sorgente === 'riserva' ? ' Si parte dal link di riserva, come hai scelto in regia.' : '') + vistaSubito
                    : 'Il link del flusso diretto NON è impostato: finché non lo inserisci, i partecipanti vedranno «Il video sta per arrivare».';
            }
            domanda = {
                titolo: 'Mandare in onda la diretta?',
                testo: video
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

    /* ============================================================
       IL VIDEO: IL PLAYER AZOTO, I LINK DEL FLUSSO E LA LORO PROVA
       ------------------------------------------------------------
       Sei campi che si comportano allo stesso modo, nella scheda Evento
       e nella Regia: il player Azoto (ev-azoto, regia-azoto) e il link
       principale e di riserva del flusso diretto (ev-video, ev-riserva,
       regia-video, regia-riserva). Per ognuno:
       - mentre lo si scrive (o lo si incolla), la riga sotto dice che
         cosa ho riconosciuto (sorgente-video.js): per il player Azoto
         l'indirizzo che si salva, preso dal codice incollato;
       - "Prova": (a) il controllo qui, senza chiamare nessuno; (b) la
         prova del servizio (prova-link: la pagina del player Azoto e se
         si puo' incorporare; il server del flusso, le qualita', il
         CORS); (c) per un flusso, la lettura dal browser, cioe' dal
         nostro dominio, come la faranno i partecipanti; (d) l'anteprima
         con il player vero (player-azoto.js o player-webtv.js).
       Se il servizio non risponde la prova non si ferma: restano (a),
       (c) e (d), e l'esito e' almeno un avviso (mai un blocco).
       Al salvataggio: 'errore' ferma, 'avviso' chiede conferma.
       Al servizio, del player Azoto, va solo l'indirizzo: mai il codice.
       ============================================================ */
    const CAMPI_LINK = ['ev-azoto', 'ev-video', 'ev-riserva', 'regia-azoto', 'regia-video', 'regia-riserva'];
    const DI_RISERVA = { 'ev-riserva': true, 'regia-riserva': true };
    // una prova fatta da poco sullo stesso testo vale anche per il salvataggio
    const VALIDITA_PROVA_MS = 10 * 60 * 1000;
    const ATTESA_LETTURA_MS = 8000;
    // la frase segue "il link" / "il player"
    const ESITI_PROVA = {
        ok: { parola: 'Si può usare', frase: 'si può usare.' },
        avviso: { parola: 'Da controllare', frase: 'si può usare, ma leggi gli avvisi qui sotto.' },
        errore: { parola: 'Non si può usare', frase: 'non si può usare (il motivo è qui sotto).' }
    };
    const GRAVITA = { ok: 0, avviso: 1, errore: 2 };
    // i problemi della prova che spiegano gia' perche' l'anteprima non parte
    const GIA_SPIEGANO_ANTEPRIMA = { 'non-trovato': true, 'non-risponde': true, rifiutato: true, cors: true, 'cors-segmenti': true, 'solo-hevc': true };
    function piuGrave(a, b) { return GRAVITA[b] > GRAVITA[a] ? b : a; }
    function senzaPunto(t) { return String(t || '').trim().replace(/[.:;]+$/, ''); }

    // la riga sotto il campo: che cosa ho riconosciuto (per Azoto: <id>-indirizzo), o a che punto e' la prova
    function mostraTipo(id, contenuto, tono) {
        const n = $('#' + id + (CAMPI_AZOTO[id] ? '-indirizzo' : '-tipo'));
        svuota(n);
        if (!contenuto) { n.hidden = true; return; }
        (Array.isArray(contenuto) ? contenuto : [contenuto]).forEach(x => {
            n.appendChild(typeof x === 'string' ? document.createTextNode(x) : x);
        });
        n.dataset.tono = tono || 'info';
        n.hidden = false;
    }

    /* Mentre si scrive: che cosa ho riconosciuto. La prova fatta su questo
       stesso testo resta. Del player Azoto si mostra SUBITO l'indirizzo che
       si salverebbe (quello preso dal codice incollato), come testo. */
    function riconosciLink(id) {
        const campo = $('#' + id);
        const testo = campo.value.trim();
        const p = stato.prove[id];
        if (p && p.testo === testo) return;
        if (p) dimenticaProva(id);
        const l = leggiCampo(id, testo);
        if (!l || l.errore) {
            mostraTipo(id, l ? l.messaggio : '', 'errore');
            return;
        }
        const iniziale = campo.dataset.iniziale || '';
        if (CAMPI_AZOTO[id]) {
            const salvato = !!iniziale && (testo === iniziale || l.valore === iniziale);
            mostraTipo(id, [
                el('strong', { testo: salvato ? 'Player salvato:' : 'Indirizzo del player:' }), ' ',
                el('span', { classe: 'testo-fisso', testo: l.valore }),
                l.daCodice ? ' Preso dal codice di Azoto: si salva solo questo indirizzo, il resto del codice si scarta.' : '',
                salvato ? '' : ' Premi «Prova il player» per controllarlo.'
            ], 'ok');
            return;
        }
        const salvato = testo === iniziale;
        mostraTipo(id, [
            el('strong', { testo: salvato ? 'Link salvato.' : 'Link riconosciuto.' }),
            ' ' + (descrizioneTipo(l.tipo) || 'Il tipo lo controlla la prova.') + (salvato ? '' : ' Premi «Prova il link» per controllarlo.')
        ], 'ok');
    }

    function dimenticaProva(id) {
        delete stato.prove[id];
        const box = $('#' + id + '-esito');
        box.hidden = true;
        svuota(box);
        // l'anteprima di questo campo mostrava il link di prima
        const ant = $('#' + id + '-anteprima');
        if (ant && !ant.hidden && !stato.annullaProvaVideo) chiudiAnteprimaVideo();
    }
    function dimenticaProve() {
        stato.proveInCorso = {};
        CAMPI_LINK.forEach(id => {
            delete stato.prove[id];
            const box = $('#' + id + '-esito');
            box.hidden = true;
            svuota(box);
            riconosciLink(id);
        });
    }

    CAMPI_LINK.forEach(id => {
        const campo = $('#' + id);
        let timer = null;
        // il player Azoto si riconosce quasi subito (e' quasi sempre incollato); i link del flusso dopo una pausa
        const attesa = CAMPI_AZOTO[id] ? 150 : 500;
        campo.addEventListener('input', () => {
            campo.removeAttribute('aria-invalid');
            // l'errore di «Applica i link» / «Cambia il player» parlava del link di prima: cambiato il link, sparisce
            const msg = id === 'regia-azoto' ? '#msg-azoto' : '#msg-video';
            if (id.indexOf('regia-') === 0 && $(msg).classList.contains('msg-errore')) nascondiMsg(msg);
            // «Flusso diretto (.m3u8)» si puo' scegliere solo con un link valido: si ricontrolla a ogni tasto
            if (id === 'ev-video') aggiornaVistaTipoPlayer();
            clearTimeout(timer);
            timer = setTimeout(() => riconosciLink(id), attesa);
        });
        campo.addEventListener('change', () => { clearTimeout(timer); riconosciLink(id); if (id === 'ev-video') aggiornaVistaTipoPlayer(); });
        /* Un link incollato si riconosce subito, non dopo la pausa della
           scrittura: la riga sotto il campo compare prima che si prema un
           pulsante (comparendo al clic, sposterebbe il pulsante sotto il
           puntatore e il clic andrebbe perso). */
        campo.addEventListener('paste', () => { clearTimeout(timer); timer = setTimeout(() => riconosciLink(id), 0); });
        $('#btn-prova-' + id).addEventListener('click', () => { provaLink(id); });
    });

    /* La prova del link com'e' adesso nel campo. Due richieste sullo
       stesso testo mentre la prima e' in corso (il pulsante e il
       salvataggio) ricevono la stessa prova. */
    function provaLink(id) {
        const testo = $('#' + id).value.trim();
        const c = stato.proveInCorso[id];
        if (c && c.testo === testo) return c.promessa;
        const b = $('#btn-prova-' + id);
        b.setAttribute('aria-busy', 'true');
        b.disabled = true;
        const promessa = eseguiProva(id, testo).catch(() => {
            // un guasto imprevisto della prova non blocca il gestore: lo si dice e basta
            const r = { testo: testo, esito: 'avviso', tipo: '', valore: '', titolo: 'La prova si è interrotta per un errore imprevisto.', righe: [], problemi: [], quando: Date.now(), idEvento: '' };
            disegnaEsito(id, r);
            mostraTipo(id, 'Prova interrotta da un errore imprevisto: riprova.', 'avviso');
            return r;
        }).then(p => {
            if (stato.proveInCorso[id] && stato.proveInCorso[id].promessa === promessa) delete stato.proveInCorso[id];
            b.removeAttribute('aria-busy');
            b.disabled = false;
            return p;
        });
        stato.proveInCorso[id] = { testo: testo, promessa: promessa };
        return promessa;
    }
    // per il salvataggio: la prova gia' fatta sullo stesso testo (se recente), altrimenti una nuova
    function provaPerSalvare(id) {
        const testo = $('#' + id).value.trim();
        const p = stato.prove[id];
        const idEvento = stato.nuovo ? '' : stato.idEvento;
        if (p && p.testo === testo && p.idEvento === idEvento && Date.now() - p.quando < VALIDITA_PROVA_MS) return Promise.resolve(p);
        return provaLink(id);
    }

    // -> { testo, esito: 'ok'|'avviso'|'errore'|'annullata'|'vuoto', tipo, valore, titolo, righe, problemi, ... }
    async function eseguiProva(id, testo) {
        const campo = $('#' + id);
        const azoto = !!CAMPI_AZOTO[id];
        const idEvento = stato.nuovo ? '' : stato.idEvento;
        // la prova vale per questo testo e questo evento: se nel frattempo cambiano, si butta
        const superata = () => campo.value.trim() !== testo || (stato.nuovo ? '' : stato.idEvento) !== idEvento;
        const annullata = { testo: testo, esito: 'annullata' };
        dimenticaProva(id);

        // (a) il controllo qui: vuoto o sbagliato si dice subito, senza chiamare nessuno
        const l = leggiCampo(id, testo);
        if (!l || l.errore) {
            const motivo = l ? l.messaggio
                : (azoto ? 'Incolla il codice o l\'indirizzo del player Azoto.' : (DI_RISERVA[id] ? 'Incolla il link di riserva.' : 'Incolla il link del flusso (.m3u8).'));
            campo.setAttribute('aria-invalid', 'true');
            mostraTipo(id, motivo, 'errore');
            campo.focus();
            return { testo: testo, esito: l ? 'errore' : 'vuoto', tipo: '', valore: '', titolo: motivo, righe: [], problemi: [], quando: Date.now(), idEvento: idEvento };
        }
        campo.removeAttribute('aria-invalid');
        const r = {
            testo: testo, idEvento: idEvento, quando: Date.now(),
            esito: 'ok', tipo: l.tipo, valore: l.valore, urlProva: l.valore,
            titolo: '', righe: [], problemi: [], info: null,
            servizio: false, browser: null, anteprima: null
        };

        // (b) la prova del servizio: del player Azoto si manda solo l'indirizzo, mai il codice incollato
        mostraTipo(id, azoto ? 'Prova in corso: il servizio controlla il player Azoto…' : 'Prova in corso: il servizio controlla il server della web TV…', 'info');
        const link = azoto ? l.valore : testo;
        try {
            const s = await chiama('prova-link', idEvento ? { link: link, idEvento: idEvento } : { link: link });
            leggiRispostaProva(r, s, azoto);
        } catch (e) {
            if (e && (e.stato === 401 || e.stato === 403)) { erroreGenerico(e); return annullata; }
            r.esito = 'avviso';
            r.titolo = azoto ? 'Il servizio non ha risposto: ho provato il player solo dal browser' : 'Il servizio non ha risposto: ho provato il link solo dal browser';
            r.righe.push(azoto
                ? 'Il servizio non ha risposto alla prova («' + senzaPunto((e && e.msg) || 'nessuna risposta') + '»): qui sotto c\'è solo l\'anteprima dal browser.'
                : 'Il servizio non ha risposto alla prova («' + senzaPunto((e && e.msg) || 'nessuna risposta')
                  + '»): ho fatto solo i controlli dal browser, che non vedono tutto (per esempio le qualità del flusso e i segmenti video).'
                  + (stato.firmaSalvata.schema !== 'nessuna' ? ' Senza il servizio provo il link senza firma: la web TV potrebbe rifiutarlo.' : ''));
        }
        if (superata()) return annullata;

        // (c) la lettura dal browser, dal nostro dominio (solo per i flussi: il player Azoto non ne ha bisogno)
        if (!azoto && (r.tipo === 'hls' || r.tipo === 'dash') && r.esito !== 'errore') {
            mostraTipo(id, 'Prova in corso: leggo il link dal browser, come faranno i partecipanti…', 'info');
            r.browser = await leggiDalBrowser(r.urlProva);
            if (superata()) return annullata;
            valutaLettura(r);
        }

        // (d) l'anteprima con il player dei partecipanti
        if (r.esito !== 'errore') {
            const P = azoto ? window.NGBPlayerAzoto : window.NGBPlayer;
            if (P && typeof P.crea === 'function') {
                mostraTipo(id, 'Prova in corso: apro l\'anteprima con il player dei partecipanti…', 'info');
                let a;
                if (azoto) {
                    // l'indirizzo ricavato qui, lo stesso che si salva
                    a = await provaAzoto(l.valore, $('#' + id + '-anteprima'), titoloAnteprima(id));
                } else {
                    // un urlProva diverso dal link e' il link firmato dal servizio (la firma dell'evento)
                    const firmato = !!r.urlProva && r.urlProva !== r.valore;
                    a = await provaVideo(r.urlProva || r.valore, $('#' + id + '-anteprima'), firmato);
                }
                if (superata()) return annullata;
                r.anteprima = a;
                // un'anteprima che non parte per un motivo gia' detto (server spento, CORS...) non e' un problema in piu'
                const giaDetto = r.problemi.some(p => GIA_SPIEGANO_ANTEPRIMA[p.codice]) || (!!r.browser && r.browser.esito !== 'ok');
                if (a.annullata) r.righe.push('Anteprima chiusa prima della fine della prova.');
                else if (a.saltata) r.righe.push('Anteprima non disponibile in questa pagina: controlla con «Vedi come un partecipante».');
                else if ((!a.ok || a.avviso) && giaDetto) {
                    r.righe.push(azoto ? 'Anteprima: il player per ora non si vede, per il problema segnalato qui sotto.' : 'Anteprima: il video per ora non parte, per il problema segnalato qui sotto.');
                    // un riquadro nero non aggiunge niente al motivo gia' detto: si chiude
                    chiudiAnteprimaVideo();
                }
                else if (!a.ok) aggiungiProblema(r, { codice: 'anteprima', messaggio: 'Anteprima: ' + a.motivo });
                else if (a.avviso) aggiungiProblema(r, { codice: 'anteprima', messaggio: a.avviso });
                else if (azoto) {
                    r.righe.push(giaDetto
                        ? 'Anteprima: qui sotto quello che mostra adesso l\'indirizzo del player.'
                        : 'Anteprima: il player Azoto compare qui sotto, con i suoi comandi (se non parte da solo premi play; il volume si regola nel player).');
                }
                else r.righe.push('Anteprima: il video si vede qui sotto con il player dei partecipanti (parte senza audio).');
            } else {
                r.righe.push('Anteprima non disponibile in questa pagina (il player non si è caricato): controlla con «Vedi come un partecipante».');
            }
        }

        // una prova con l'anteprima chiusa a meta' si mostra, ma non vale per il salvataggio
        if (!(r.anteprima && r.anteprima.annullata)) stato.prove[id] = r;
        if (r.esito === 'errore') campo.setAttribute('aria-invalid', 'true');
        disegnaEsito(id, r);
        const frase = (azoto ? 'il player' : 'il link') + ' ' + ESITI_PROVA[r.esito].frase;
        mostraTipo(id, azoto
            ? [el('strong', { testo: 'Prova finita:' }), ' ' + frase + ' Indirizzo del player: ', el('span', { classe: 'testo-fisso', testo: l.valore })]
            : [el('strong', { testo: 'Prova finita:' }), ' ' + frase], r.esito);
        return r;
    }

    /* la risposta di prova-link, presa con prudenza (un servizio piu' vecchio
       o piu' nuovo non rompe la pagina). azoto: la prova del player Azoto. */
    function leggiRispostaProva(r, s, azoto) {
        r.servizio = true;
        r.esito = Object.prototype.hasOwnProperty.call(GRAVITA, s.esito) ? s.esito : 'avviso';
        if (s.tipo) r.tipo = String(s.tipo);
        if (typeof s.valore === 'string' && s.valore) r.valore = s.valore;
        r.titolo = String(s.titolo || '');
        r.righe = (Array.isArray(s.righe) ? s.righe : []).map(x => String(x == null ? '' : x)).filter(Boolean);
        r.problemi = (Array.isArray(s.problemi) ? s.problemi : []).filter(p => p && p.messaggio).map(p => ({
            codice: String(p.codice || ''),
            grave: p.grave === true,
            messaggio: String(p.messaggio),
            testoWebTv: String(p.testoWebTv || '')
        }));
        r.info = s.info && typeof s.info === 'object' ? s.info : null;
        if (typeof s.urlProva === 'string' && /^https:\/\//i.test(s.urlProva)) r.urlProva = s.urlProva;
        /* Con il player Azoto «restano i comandi di Azoto» non e' un problema
           da sistemare: e' il modo scelto, e la nota e' gia' sotto il campo.
           Non conta (da sola non chiede conferme al salvataggio) e non si
           ripete nel riquadro della prova. */
        if (azoto) {
            const nota = senzaPunto(NOTA_AZOTO);
            r.righe = r.righe.filter(t => senzaPunto(t) !== nota);
            if (r.problemi.some(p => p.codice === 'incorporato')) {
                r.problemi = r.problemi.filter(p => p.codice !== 'incorporato');
                if (r.esito === 'avviso' && !r.problemi.length) r.esito = 'ok';
            }
        }
    }

    function aggiungiProblema(r, p) {
        r.problemi.push(Object.assign({ codice: '', grave: false, messaggio: '', testoWebTv: '' }, p));
        r.esito = piuGrave(r.esito, 'avviso');
    }

    /* (c) Il browser legge il link come lo leggera' il player dei
       partecipanti: dal nostro dominio, con le regole CORS. Basta la
       prima risposta (la playlist, pochi KB): il resto non si scarica.
       -> { esito: 'ok' | 'http' (con lo stato) | 'tempo' | 'bloccato' } */
    async function leggiDalBrowser(url) {
        const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        const limite = setTimeout(() => { if (ctrl) ctrl.abort(); }, ATTESA_LETTURA_MS);
        try {
            const opzioni = { mode: 'cors', cache: 'no-store' };
            if (ctrl) opzioni.signal = ctrl.signal;
            const risposta = await fetch(url, opzioni);
            try { if (risposta.body && typeof risposta.body.cancel === 'function') risposta.body.cancel().catch(() => { /* niente */ }); } catch (_) { /* niente */ }
            return risposta.ok ? { esito: 'ok', stato: risposta.status } : { esito: 'http', stato: risposta.status };
        } catch (e) {
            // il browser non dice mai perche' una lettura e' bloccata: server spento e CORS sono uguali
            return { esito: e && e.name === 'AbortError' ? 'tempo' : 'bloccato' };
        } finally {
            clearTimeout(limite);
        }
    }

    function valutaLettura(r) {
        const b = r.browser;
        if (b.esito === 'ok') {
            r.righe.push('Dal browser il link si legge: il server della web TV consente la lettura dal nostro sito (CORS).');
            return;
        }
        if (b.esito === 'http') {
            r.righe.push('Dal browser il server della web TV risponde con l\'errore ' + b.stato + '.');
            if (!r.servizio) {
                aggiungiProblema(r, {
                    codice: b.stato === 404 ? 'non-trovato' : 'rifiutato',
                    messaggio: b.stato === 404
                        ? 'A questo indirizzo per ora non c\'è niente (errore 404): la web TV non ha ancora cominciato a trasmettere, oppure il link è sbagliato.'
                        : 'Il server della web TV rifiuta la richiesta (errore ' + b.stato + ')' + (b.stato === 403 ? ': se la web TV usa i link firmati, controlla la firma.' : '.')
                });
            }
            return;
        }
        if (b.esito === 'tempo') {
            r.righe.push('Dal browser il link non ha risposto entro ' + Math.round(ATTESA_LETTURA_MS / 1000) + ' secondi.');
            if (!r.servizio) aggiungiProblema(r, { codice: 'non-risponde', messaggio: 'Il server della web TV non risponde.' });
            return;
        }
        // bloccato: se il server risponde (lo dice il servizio) e' il CORS
        if (r.problemi.some(p => p.codice === 'cors')) {
            r.righe.push('Confermato dal browser: la lettura dal nostro sito è bloccata (CORS).');
            return;
        }
        const risponde = !!(r.info && r.info.raggiungibile === true);
        if (risponde || !r.servizio) {
            aggiungiProblema(r, {
                codice: 'cors',
                messaggio: risponde
                    ? 'Il server della web TV risponde, ma non consente al browser di leggere il flusso dal nostro sito (CORS): i partecipanti non vedrebbero il video.'
                    : 'Dal browser il link non si legge: o il server della web TV non risponde, o non consente la lettura dal nostro sito (CORS). Nel secondo caso i partecipanti non vedrebbero il video.',
                testoWebTv: testoCors(r)
            });
            return;
        }
        r.righe.push('Dal browser il link non si legge: il server della web TV non risponde.');
    }

    // il testo da girare alla web TV per il CORS: quello del servizio se l'ha dato, altrimenti questo
    function testoCors(r) {
        const dalServizio = r.problemi.find(p => (p.codice === 'cors' || p.codice === 'cors-segmenti') && p.testoWebTv);
        if (dalServizio) return dalServizio.testoWebTv;
        // lo stesso tono delle lettere del servizio (lib/diretta-prova-link.js)
        return 'Buongiorno,\n'
            + 'per la diretta del nostro evento sul sito ' + SITO + ' riproduciamo il vostro flusso con il nostro player, '
            + 'direttamente nel browser di chi guarda. Il link ' + r.valore + ' non consente la lettura dal nostro sito: '
            + 'il browser la blocca perché mancano le intestazioni CORS. Potete abilitare, per la playlist e per i segmenti video, '
            + 'l\'intestazione «Access-Control-Allow-Origin: ' + SITO + '» (oppure «*»)? Se il flusso passa da una rete di '
            + 'distribuzione (CDN), va impostata anche lì.\n'
            + 'Grazie e buona giornata.';
    }

    /* Il risultato della prova, nel riquadro sotto il campo: esito a parole
       e a colori, cosa ho capito, le righe di dettaglio, i problemi (dal
       piu' grave) con il testo pronto per la web TV. Tutto con textContent. */
    function disegnaEsito(id, r) {
        const box = $('#' + id + '-esito');
        svuota(box);
        box.dataset.esito = r.esito;
        const e = ESITI_PROVA[r.esito] || ESITI_PROVA.avviso;
        const d = descrizioneTipo(r.tipo);
        const titolo = r.titolo || d || 'Prova del link';
        box.appendChild(el('p', { classe: 'esito-testa' }, [
            el('span', { classe: 'esito-bollo', testo: e.parola }),
            el('strong', { classe: 'esito-titolo', testo: titolo })
        ]));
        const righe = [];
        // la descrizione del tipo, se il servizio non l'ha gia' messa fra le sue righe
        if (d && d !== titolo && (r.righe || []).indexOf(d) < 0) righe.push(d);
        (r.righe || []).forEach(t => righe.push(t));
        if (righe.length) box.appendChild(el('ul', { classe: 'esito-righe' }, righe.map(t => el('li', { testo: t }))));
        const problemi = (r.problemi || []).slice().sort((a, b) => (b.grave ? 1 : 0) - (a.grave ? 1 : 0));
        if (problemi.length) {
            box.appendChild(el('p', { classe: 'esito-sottotitolo', testo: problemi.length === 1 ? 'Da sistemare' : 'Da sistemare (' + problemi.length + ')' }));
            const ul = el('ul', { classe: 'esito-problemi' });
            problemi.forEach((p, i) => {
                const li = el('li', { classe: 'esito-problema', dati: { gravita: p.grave ? 'grave' : 'avviso' } }, [
                    el('span', { classe: 'problema-etichetta', testo: p.grave ? 'Da correggere' : 'Attenzione' }),
                    el('span', { classe: 'problema-testo', testo: p.messaggio })
                ]);
                if (p.testoWebTv) li.appendChild(riquadroTestoWebTv(id + '-webtv-' + i, p.testoWebTv));
                ul.appendChild(li);
            });
            box.appendChild(ul);
        }
        box.hidden = false;
    }

    // il testo pronto da mandare alla web TV, con il pulsante per copiarlo
    function riquadroTestoWebTv(idTesto, testo) {
        const corpo = el('p', { id: idTesto, classe: 'testo-webtv-corpo', testo: testo });
        const esito = el('span', { classe: 'testo-webtv-esito', role: 'status' });
        const b = el('button', { type: 'button', classe: 'btn btn-secondario btn-piccolo', 'aria-describedby': idTesto, testo: 'Copia il testo per la web TV' });
        b.addEventListener('click', () => copiaTesto(testo, corpo, esito));
        return el('div', { classe: 'testo-webtv' }, [
            el('p', { classe: 'testo-webtv-etichetta', testo: 'Testo pronto da mandare alla web TV' }),
            corpo,
            el('div', { classe: 'testo-webtv-azioni' }, [b, esito])
        ]);
    }

    async function copiaTesto(testo, nodo, esito) {
        let copiato = false;
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(testo);
                copiato = true;
            }
        } catch (_) { copiato = false; }
        if (!copiato) {
            // ripiego: si seleziona il testo nel riquadro, e si prova la copia alla vecchia maniera
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(nodo);
            sel.removeAllRanges();
            sel.addRange(range);
            try { copiato = document.execCommand('copy'); } catch (_) { copiato = false; }
        }
        esito.textContent = copiato
            ? 'Testo copiato: incollalo nella tua email alla web TV.'
            : 'Testo selezionato: premi Ctrl+C (o Cmd+C) per copiarlo.';
    }

    /* ---------- (d) l'anteprima con il player vero ----------
       Lo stesso player della pagina dei partecipanti (player-webtv.js):
       se il video non si vede qui, non si vedra' neanche davanti a mille
       persone. I codici d'errore sono quelli del player: 'lento' e
       'libreria' dicono che l'anteprima non si e' caricata QUI, non che
       il link sia sbagliato; 'rete', 'media', 'segnale' e 'browser' che
       per ora a quell'indirizzo la diretta non si vede (di solito: la web
       TV non ha ancora cominciato a trasmettere); 'link' che il player
       non accetta il link. */
    const MOTIVI_PLAYER = {
        rete: 'il server della web TV non risponde o rifiuta la richiesta',
        media: 'il video arriva, ma il browser non riesce a leggerlo',
        segnale: 'il video si è fermato',
        lento: 'l\'anteprima ci mette troppo a partire',
        libreria: 'il componente del player non si è caricato',
        browser: 'questo browser non riesce a riprodurlo',
        link: 'il player non accetta questo link'
    };
    function motivoVideo(err) {
        const codice = err && err.codice;
        return MOTIVI_PLAYER[codice] || senzaPunto(err && err.messaggio) || ('errore ' + (codice || 'sconosciuto') + ' del player');
    }

    // una sola anteprima alla volta, nel riquadro da cui la si chiede;
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

    /* firmato: il link porta la firma a tempo della web TV; il player la
       aggiunge anche alle playlist delle qualita' e ai segmenti, come fa
       la pagina dei partecipanti (senza, una web TV che controlla la firma
       su tutto rifiuterebbe l'anteprima).
       -> { ok, motivo?, saltata?, avviso?, annullata? } */
    function provaVideo(url, box, firmato) {
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
            // se il player non dice niente entro 12 s non si blocca il gestore:
            // lo si avvisa di controllare dalla pagina dei partecipanti
            const limite = setTimeout(() => fine({
                ok: true,
                avviso: pronto ? '' : 'L\'anteprima non ha risposto entro 12 secondi: controlla il video con «Vedi come un partecipante».'
            }), 12000);
            try {
                stato.anteprimaVideo = P.crea(posto, {
                    onPronto: () => { pronto = true; setTimeout(() => fine({ ok: true }), 2500); },
                    onStato: s => { if (s === 'riproduzione') setTimeout(() => fine({ ok: true }), 800); },
                    onErrore: err => {
                        const codice = err && err.codice;
                        if (codice === 'lento' || codice === 'libreria') {
                            fine({ ok: true, avviso: 'L\'anteprima non si è caricata (' + motivoVideo(err) + '): controlla il video con «Vedi come un partecipante».' });
                            return;
                        }
                        if (codice === 'link') {
                            fine({ ok: false, codice: codice, motivo: motivoVideo(err) + '.' });
                            return;
                        }
                        /* Il link si mette di solito PRIMA che la diretta parta, quando
                           all'indirizzo non c'e' ancora niente: non si blocca, si avvisa,
                           e si riprova quando la web TV trasmette. */
                        fine({ ok: true, avviso: 'Per ora a questo indirizzo non vedo la diretta (' + motivoVideo(err) + '). Se la web TV non ha ancora cominciato a trasmettere è normale: quando trasmette, riprova il link.' });
                    }
                });
                if (stato.anteprimaVideo && typeof stato.anteprimaVideo.carica === 'function') stato.anteprimaVideo.carica(url, { firmato: firmato === true });
            } catch (_) {
                fine({ ok: true, saltata: true });
            }
        });
    }

    /* ---------- (d) l'anteprima del player Azoto ----------
       Lo stesso player-azoto.js della pagina dei partecipanti: l'iframe lo
       crea il nostro codice, con l'indirizzo ricavato qui (mai con il
       codice incollato), e il player ricontrolla da se' che sia un
       indirizzo di Azoto. Pronto = la pagina del player si e' caricata
       nell'iframe; 'lento' = 15 secondi senza caricarsi; 'link' = non e'
       un indirizzo di Azoto. Il player di Azoto non dice altro alla nostra
       pagina (niente messaggi): se il video parte si vede solo guardando.
       -> { ok, motivo?, saltata?, avviso?, annullata? } */
    const ATTESA_AZOTO_MS = 17000;
    // il titolo dell'iframe ("Diretta: <titolo>"), come per i partecipanti
    function titoloAnteprima(id) {
        const scritto = id && id.indexOf('ev-') === 0 ? $('#ev-titolo').value.trim() : '';
        return scritto || (stato.evento && stato.evento.titolo) || 'anteprima';
    }
    function provaAzoto(url, box, titolo) {
        const PA = window.NGBPlayerAzoto;
        if (!PA || typeof PA.crea !== 'function') return Promise.resolve({ ok: true, saltata: true });
        chiudiAnteprimaVideo();
        const cornice = box.querySelector('.video-anteprima-cornice');
        const posto = el('div', { id: box.id + '-player', classe: 'anteprima-azoto' });
        cornice.appendChild(posto);
        box.hidden = false;
        return new Promise(risolvi => {
            let finito = false;
            const fine = esito => {
                if (finito) return;
                finito = true;
                if (stato.annullaProvaVideo === annulla) stato.annullaProvaVideo = null;
                clearTimeout(limite);
                risolvi(esito);
            };
            const annulla = () => fine({ ok: false, annullata: true });
            stato.annullaProvaVideo = annulla;
            // se il player non dice niente (non dovrebbe succedere: a 15 s dice 'lento') non si blocca il gestore
            const limite = setTimeout(() => fine({
                ok: true, avviso: 'Il player Azoto non ha risposto: controlla con «Vedi come un partecipante».'
            }), ATTESA_AZOTO_MS);
            try {
                stato.anteprimaVideo = PA.crea(posto, {
                    onPronto: () => fine({ ok: true }),
                    onErrore: err => {
                        if (err && err.codice === 'link') {
                            fine({ ok: false, codice: 'link', motivo: 'il player accetta solo un indirizzo https di cdn.azotosolutions.com.' });
                            return;
                        }
                        fine({ ok: true, avviso: 'Il player Azoto non si è caricato entro 15 secondi: se Azoto non ha ancora acceso il canale è normale, altrimenti controlla con «Vedi come un partecipante».' });
                    }
                });
                stato.anteprimaVideo.carica(url, { titolo: titolo });
            } catch (_) {
                fine({ ok: true, saltata: true });
            }
        });
    }

    /* ---------- il salvataggio dei link: il verdetto della prova ----------
       -> { fermo: true, messaggio, tono } oppure { avvisi: [righe per la conferma] } */
    function verdettoProva(p, etichetta) {
        if (!p || p.esito === 'annullata') return { fermo: true, messaggio: '', tono: 'info' };
        if (p.anteprima && p.anteprima.annullata) return { fermo: true, messaggio: 'Prova del link interrotta (anteprima chiusa)', tono: 'info' };
        if (p.esito === 'errore' || p.esito === 'vuoto') {
            const grave = (p.problemi || []).find(x => x.grave) || (p.problemi || [])[0];
            return { fermo: true, tono: 'errore', messaggio: etichetta + ': non si può usare. ' + senzaPunto(grave ? grave.messaggio : (p.titolo || 'la prova non è riuscita')) };
        }
        if (p.esito === 'avviso') {
            const righe = (p.problemi || []).map(x => etichetta + ': ' + x.messaggio);
            if (!righe.length) righe.push(etichetta + ': ' + (p.titolo || (p.righe || [])[0] || 'la prova ha dato degli avvisi.'));
            return { avvisi: righe };
        }
        return { avvisi: [] };
    }

    /* La frase per chi e' collegato quando si cambiano i link durante la
       diretta. o: { principale, riserva } (cambiati), { principaleTolto,
       riservaTolta }. Togliendo la riserva mentre e' in uso, il servizio
       riporta tutti al link principale. */
    function testoCambioInOnda(ev, o) {
        if (o.principaleTolto) return 'La diretta è in onda: i partecipanti vedranno «Il video sta per arrivare» finché non inserisci un altro link.';
        const suRiserva = ev && ev.sorgente === 'riserva';
        if (o.riservaTolta && suRiserva) return 'La diretta è in onda e la riserva è in uso per tutti: togliendola, chi è collegato torna da solo al link principale, in pochi secondi.';
        if ((o.principale && !suRiserva) || (o.riserva && suRiserva)) {
            return 'La diretta è in onda: chi è collegato passa al nuovo link da solo, in pochi secondi, senza ricaricare la pagina.';
        }
        return 'La diretta è in onda: chi è collegato resta sul link ' + (suRiserva ? 'di riserva' : 'principale') + ', che non cambia; il link nuovo vale se si passa all\'altro.';
    }

    /* Le frasi per chi e' collegato quando si salva l'evento durante la
       diretta. Contano solo i cambi che chi guarda vede: il tipo di player,
       il player Azoto se e' in uso, i link del flusso se e' in uso. o:
       { tipo (quello che si salva), tipoCambiato, azoto, azotoTolto,
       principale, riserva, principaleTolto, riservaTolta }. */
    function frasiCambioInOnda(ev, o) {
        if (o.tipoCambiato) {
            return [o.tipo === 'flusso'
                ? 'La diretta è in onda: chi è collegato passa dal player Azoto al flusso diretto da solo, in pochi secondi, senza ricaricare la pagina.'
                : 'La diretta è in onda: chi è collegato torna dal flusso diretto al player Azoto da solo, in pochi secondi, senza ricaricare la pagina.'];
        }
        if (o.tipo === 'azoto') {
            if (!o.azoto) return [];
            return [o.azotoTolto
                ? 'La diretta è in onda con il player Azoto: togliendolo, i partecipanti vedranno «Il video sta per arrivare» finché non ne inserisci un altro.'
                : 'La diretta è in onda con il player Azoto: chi è collegato passa al nuovo indirizzo da solo, in pochi secondi, senza ricaricare la pagina.'];
        }
        return o.principale || o.riserva ? [testoCambioInOnda(ev, o)] : [];
    }

    /* ============================================================
       REGIA: IL PLAYER E I LINK IN USO
       ============================================================ */
    function aggiornaVideoRegia() {
        const ev = stato.evento;
        const s = ev ? ev.stato || 'programmato' : '';
        const tipo = tipoPlayerDi(ev);
        const suRiserva = !!ev && ev.sorgente === 'riserva';

        // il player che vedono tutti (eventi.tipoPlayer)
        const bollinoTipo = $('#regia-tipo-player');
        bollinoTipo.dataset.tipo = tipo;
        bollinoTipo.textContent = NOMI_PLAYER[tipo];
        document.querySelectorAll('.regia-video-riquadro .blocco-uso').forEach(n => {
            const inUso = n.dataset.uso === tipo;
            n.textContent = inUso ? 'in uso' : 'non in uso';
            n.dataset.stato = inUso ? 'si' : '';
        });
        /* Si apre la parte del modo in uso e si chiude l'altra: una volta per
           evento e per modo (poi le apre e chiude il gestore, e un
           aggiornamento qualunque non gliele cambia sotto le mani). */
        const chiave = ev ? ev.id + '|' + tipo : '';
        if (chiave !== stato.blocchiRegia) {
            stato.blocchiRegia = chiave;
            $('#regia-blocco-azoto').open = tipo === 'azoto';
            $('#regia-blocco-flusso').open = tipo === 'flusso';
        }
        $('#regia-azoto-riassunto').textContent = ev && ev.azotoUrl ? linkBreve(ev.azotoUrl) : 'nessun indirizzo';
        $('#regia-flusso-riassunto').textContent = ev && ev.videoUrl ? linkBreve(ev.videoUrl) + (ev.riservaUrl ? ' + riserva' : '') : 'nessun link';

        // il player Azoto salvato
        $('#regia-azoto-attuale').textContent = (ev && ev.azotoUrl) || 'nessuno';
        $('#btn-guarda-azoto').hidden = !(ev && ev.azotoUrl);
        document.querySelector('.link-salvato[data-ruolo="azoto"]').dataset.inUso = ev && ev.azotoUrl && tipo === 'azoto' ? 'si' : '';

        // i link del flusso: quale si usa (eventi.sorgente) vale quando il flusso diretto e' in uso
        const bollino = $('#regia-sorgente');
        bollino.dataset.sorgente = suRiserva ? 'riserva' : 'principale';
        bollino.textContent = suRiserva ? 'link di riserva' : 'link principale';
        $('#regia-sorgente-etichetta').textContent = tipo === 'flusso' ? 'Link in uso per tutti:' : 'Link scelto per il flusso diretto:';
        [
            { ruolo: 'principale', url: ev && ev.videoUrl, valore: ev && ev.videoId, testo: '#regia-video-attuale', tipo: '#regia-video-tipo-attuale', guarda: '#btn-guarda-principale' },
            { ruolo: 'riserva', url: ev && ev.riservaUrl, valore: ev && ev.riservaId, testo: '#regia-riserva-attuale', tipo: '#regia-riserva-tipo-attuale', guarda: '#btn-guarda-riserva' }
        ].forEach(x => {
            $(x.testo).textContent = x.url || 'nessuno';
            const t = x.url ? tipoDi(x.valore || x.url) : '';
            $(x.tipo).textContent = NOMI_TIPO[t] ? '(' + NOMI_TIPO[t] + ')' : '';
            $(x.guarda).hidden = !x.url;
            const riga = document.querySelector('.link-salvato[data-ruolo="' + x.ruolo + '"]');
            const scelto = !!ev && (x.ruolo === 'riserva') === suRiserva;
            const inUso = scelto && tipo === 'flusso';
            riga.dataset.inUso = inUso ? 'si' : '';
            riga.querySelector('.in-uso').hidden = !scelto;
            riga.querySelector('.in-uso').textContent = inUso ? '· in uso' : '· scelto';
        });

        /* Il player Azoto e i link vivono in un documento riservato del
           servizio: ai partecipanti arriva solo quello del modo in uso, e
           solo mentre si e' in onda (azotoInOnda, videoInOnda e riservaInOnda
           sono quelli che vedono adesso). Qui si dice in chiaro che cosa vedono. */
        let pubblico = '';
        if (ev && tipo === 'azoto') {
            const inOndaAzoto = ev.azotoInOnda != null ? ev.azotoInOnda : (ev.videoInOnda || '');
            if (ev.azotoUrl) {
                if (s === 'in_onda' && inOndaAzoto === ev.azotoUrl) pubblico = 'I partecipanti collegati stanno guardando il player Azoto.';
                else if (s === 'in_onda') pubblico = 'I partecipanti stanno ancora ricevendo il player precedente: aggiorna la pagina tra qualche secondo.';
                else pubblico = 'L\'indirizzo del player Azoto arriva ai partecipanti solo mentre la diretta è in onda, e solo dopo l\'accesso: prima e dopo resta riservato.';
            } else if (s === 'in_onda') pubblico = 'Nessun player Azoto impostato: i partecipanti vedono «Il video sta per arrivare». Inserisci l\'indirizzo qui sotto.';
            else pubblico = 'Manca l\'indirizzo del player Azoto: inseriscilo qui sotto, o nella scheda Evento, prima di andare in onda.';
        } else if (ev && ev.videoId) {
            const nomeInUso = suRiserva ? 'il flusso diretto (link di riserva)' : 'il flusso diretto (link principale)';
            const pubblicati = ev.videoInOnda === ev.videoId && (ev.riservaInOnda == null || (ev.riservaInOnda || '') === (ev.riservaId || ''));
            if (s === 'in_onda' && pubblicati) pubblico = 'I partecipanti collegati stanno guardando ' + nomeInUso + '.';
            else if (s === 'in_onda' && ev.videoInOnda) pubblico = 'I partecipanti stanno ancora ricevendo i link precedenti: aggiorna la pagina tra qualche secondo.';
            else pubblico = 'I partecipanti ricevono i link solo mentre la diretta è in onda: prima e dopo restano riservati.'
                + (suRiserva ? ' Quando andrà in onda, partiranno dal link di riserva.' : '');
        } else if (ev && s === 'in_onda') pubblico = 'Nessun link del flusso impostato: i partecipanti vedono «Il video sta per arrivare».';
        $('#regia-video-pubblico').textContent = pubblico;

        // che cosa serve per passare all'altro modo
        let aiutoPlayer = '';
        if (ev && tipo === 'azoto') {
            aiutoPlayer = ev.videoId
                ? 'Il flusso diretto è pronto (' + linkBreve(ev.videoUrl || ev.videoId) + '): passandoci, chi guarda vede il nostro player, senza ricaricare la pagina.'
                : 'Per passare al flusso diretto serve il link .m3u8, da chiedere ad Azoto: inseriscilo qui sotto, in «Flusso diretto (.m3u8)», o nella scheda Evento.';
        } else if (ev) {
            aiutoPlayer = ev.azotoUrl
                ? 'Se il flusso diretto dà problemi puoi tornare al player Azoto: chi guarda passa da solo, senza ricaricare la pagina.'
                : 'Per tornare al player Azoto serve il suo indirizzo: inseriscilo qui sotto, in «Player Azoto».';
        }
        $('#regia-player-aiuto').textContent = aiutoPlayer;

        const f = ev ? firmaDa(ev) : null;
        const firmata = !!ev && (ev.videoFirmato === true || (f && f.schema !== 'nessuna'));
        $('#regia-firma-attuale').hidden = !firmata;
        $('#regia-firma-attuale').textContent = firmata && f
            ? 'Link firmati: ' + SCHEMI_FIRMA[f.schema] + ', ogni link vale ' + conNumero(f.durataOre, 'ora', 'ore') + '.'
              + (f.segretoImpostato ? '' : ' Manca la chiave segreta: completala nella scheda Evento.')
            : '';
        $('#sorgente-aiuto').textContent = ev && !ev.riservaUrl && !suRiserva
            ? 'Non c\'è un link di riserva: inseriscilo qui sotto per poterci passare in caso di problemi.'
            : 'Se il link in uso si blocca per più di 20 secondi, il player di ciascun partecipante passa da solo all\'altro. '
              + 'Con questi pulsanti decidi tu, per tutti: chi guarda passa da solo, senza ricaricare la pagina'
              + (s === 'in_onda' && tipo === 'flusso' ? '; «Riporta tutti…» riporta sul link scelto anche chi era passato da solo all\'altro.' : '.')
              + (tipo === 'azoto' ? ' Vale quando si usa il flusso diretto.' : '');
    }

    /* ---------- il player per tutti (evento-player) ----------
       Il flusso diretto o il player Azoto, anche durante la diretta: chi
       guarda cambia da solo, senza ricaricare la pagina (la pagina dei
       partecipanti segue eventi.tipoPlayer con l'unico ascolto che ha). */
    async function passaPlayer(verso, bottone) {
        const ev = stato.evento;
        if (!ev) return;
        nascondiMsg('#msg-player');
        if (verso === 'flusso' && !ev.videoId) {
            mostraMsg('#msg-player', 'Per passare al flusso diretto serve il link .m3u8: inseriscilo qui sotto, in «Flusso diretto (.m3u8)», oppure nella scheda Evento.', 'errore');
            return;
        }
        if (verso === 'azoto' && !ev.azotoUrl) {
            mostraMsg('#msg-player', 'Manca l\'indirizzo del player Azoto: inseriscilo qui sotto, in «Player Azoto».', 'errore');
            return;
        }
        const inOnda = ev.stato === 'in_onda';
        const suRiserva = ev.sorgente === 'riserva' && !!ev.riservaUrl;
        const ok = await conferma(verso === 'flusso' ? {
            titolo: 'Passare al flusso diretto per tutti?',
            testo: inOnda
                ? 'Chi sta guardando passa dal player Azoto al nostro player (il link .m3u8) da solo, in pochi secondi, senza ricaricare la pagina.'
                : 'La diretta non è in onda: quando ci andrà, tutti vedranno il flusso diretto con il nostro player.',
            dettagli: ['Flusso: ' + linkBreve(suRiserva ? ev.riservaUrl : ev.videoUrl) + (suRiserva ? ' (la riserva, come hai scelto in regia)' : '')],
            ok: 'Passa al flusso diretto'
        } : {
            titolo: 'Tornare al player Azoto per tutti?',
            testo: inOnda
                ? 'Chi sta guardando torna dal flusso diretto al player Azoto da solo, in pochi secondi, senza ricaricare la pagina.'
                : 'La diretta non è in onda: quando ci andrà, tutti vedranno il player Azoto.',
            dettagli: ['Player Azoto: ' + ev.azotoUrl],
            ok: 'Torna al player Azoto'
        });
        if (!ok) return;
        await conAttesa(bottone, async () => {
            try {
                const r = await chiama('evento-player', { idEvento: ev.id, tipoPlayer: verso });
                if (stato.idEvento !== ev.id) return;
                aggiornaEvento(r && r.evento ? r.evento : Object.assign({}, ev, { tipoPlayer: verso }));
                mostraMsg('#msg-player', (verso === 'flusso' ? 'Flusso diretto in uso per tutti' : 'Player Azoto in uso per tutti')
                    + (inOnda ? ': chi guarda passa da solo, in pochi secondi.' : ': vale da quando la diretta va in onda.'), 'ok');
            } catch (e) { erroreGenerico(e, '#msg-player'); }
        });
        // il pulsante premuto ora e' nascosto: il fuoco passa a quello che riporta indietro
        const altro = $(verso === 'flusso' ? '#btn-passa-azoto' : '#btn-passa-flusso');
        if (!altro.hidden && document.activeElement === document.body) altro.focus();
    }
    $('#btn-passa-flusso').addEventListener('click', () => passaPlayer('flusso', $('#btn-passa-flusso')));
    $('#btn-passa-azoto').addEventListener('click', () => passaPlayer('azoto', $('#btn-passa-azoto')));

    /* ---------- il player Azoto salvato: «Guarda» e il cambio (evento-video) ---------- */
    async function guardaAzoto(bottone) {
        const ev = stato.evento;
        if (!ev || !ev.azotoUrl) return;
        nascondiMsg('#msg-azoto');
        await conAttesa(bottone, async () => {
            const a = await provaAzoto(ev.azotoUrl, $('#regia-azoto-attuale-anteprima'), ev.titolo || ev.id);
            if (a.annullata || stato.idEvento !== ev.id) return;
            if (!a.ok) mostraMsg('#msg-azoto', 'Player Azoto: ' + a.motivo, 'errore');
            else if (a.avviso) mostraMsg('#msg-azoto', a.avviso, 'attenzione');
            else if (a.saltata) mostraMsg('#msg-azoto', 'Player Azoto: anteprima non disponibile in questa pagina, controlla con «Vedi come un partecipante».', 'info');
            else mostraMsg('#msg-azoto', 'Player Azoto: qui sotto lo vedi come lo vedono i partecipanti, con i comandi di Azoto.', 'ok');
        });
    }
    $('#btn-guarda-azoto').addEventListener('click', () => guardaAzoto($('#btn-guarda-azoto')));

    /* Il cambio dell'indirizzo del player Azoto, anche durante la diretta:
       si prova, si chiede conferma e si manda al servizio SOLO l'indirizzo
       (evento-video con azotoUrl). Se il player Azoto e' in uso, chi guarda
       passa al nuovo indirizzo da solo. */
    $('#form-azoto').addEventListener('submit', async e => {
        e.preventDefault();
        const ev = stato.evento;
        if (!ev) return;
        const campo = $('#regia-azoto');
        nascondiMsg('#msg-azoto');
        campo.removeAttribute('aria-invalid');
        const errore = testo => {
            campo.setAttribute('aria-invalid', 'true');
            mostraMsg('#msg-azoto', testo, 'errore');
            campo.focus();
        };
        const l = leggiAzoto(campo.value);
        if (!l) { errore('Incolla il codice o l\'indirizzo del player Azoto.'); return; }
        if (l.errore) { errore('Player Azoto: ' + l.messaggio); return; }
        if (l.valore === (ev.azotoUrl || '')) {
            mostraMsg('#msg-azoto', 'È già il player salvato: incolla un indirizzo diverso, poi premi «Cambia il player».', 'info');
            return;
        }
        await conAttesa($('#btn-cambia-azoto'), async () => {
            mostraMsg('#msg-azoto', 'Prova in corso: player Azoto…', 'info');
            const p = await provaPerSalvare('regia-azoto');
            // nel frattempo si e' passati a un altro evento: non si cambia niente
            if (stato.idEvento !== ev.id) { nascondiMsg('#msg-azoto'); return; }
            const v = verdettoProva(p, 'Player Azoto');
            if (v.fermo) {
                if (v.messaggio) mostraMsg('#msg-azoto', v.messaggio + '. Non ho cambiato niente.', v.tono);
                else nascondiMsg('#msg-azoto');
                if (v.tono === 'errore') campo.focus();
                return;
            }
            nascondiMsg('#msg-azoto');
            const inOnda = ev.stato === 'in_onda';
            const conAzoto = tipoPlayerDi(ev) === 'azoto';
            const frase = !inOnda
                ? 'La diretta non è in onda: il nuovo indirizzo vale da quando ci andrà' + (conAzoto ? '.' : ' e si userà il player Azoto.')
                : (conAzoto
                    ? 'La diretta è in onda con il player Azoto: chi è collegato passa al nuovo indirizzo da solo, in pochi secondi, senza ricaricare la pagina.'
                    : 'La diretta è in onda con il flusso diretto: chi guarda adesso non vede cambiare niente; il nuovo indirizzo vale quando tornerai al player Azoto.');
            const ok = await conferma({
                titolo: 'Cambiare il player per tutti?',
                testo: (v.avvisi.length ? 'La prova ha trovato dei problemi: finché non sono risolti, i partecipanti potrebbero non vedere il video.\n' : '') + frase,
                dettagli: ['Nuovo player: ' + l.valore].concat(v.avvisi),
                ok: v.avvisi.length ? 'Cambia lo stesso' : 'Cambia il player'
            });
            if (!ok) return;
            try {
                const r = await chiama('evento-video', { idEvento: ev.id, azotoUrl: l.valore });
                aggiornaEvento(r.evento);
                // nel campo, al posto del codice incollato, l'indirizzo appena salvato (la prova fatta si chiude)
                riempiCampoLink('regia-azoto', r.evento.azotoUrl);
                mostraMsg('#msg-azoto', 'Player Azoto cambiato' + (inOnda && conAzoto ? ': i partecipanti collegati passano al nuovo indirizzo.' : '.')
                    + (l.daCodice ? ' Dal codice di Azoto ho salvato solo l\'indirizzo del player.' : '')
                    + (v.avvisi.length ? ' Ricorda i problemi segnalati dalla prova: riprova quando Azoto li ha risolti.' : ''), 'ok');
            } catch (err) { erroreGenerico(err, '#msg-azoto'); }
        });
    });

    /* principale / riserva per tutti (evento-sorgente). Scegliere il link
       gia' scelto vale come "riconferma": il servizio aggiorna comunque
       videoAggiornato e la pagina di chi guarda annulla il passaggio
       automatico all'altro link. */
    async function scegliSorgente(verso, bottone) {
        const ev = stato.evento;
        if (!ev) return;
        nascondiMsg('#msg-sorgente');
        if (verso === 'riserva' && !ev.riservaUrl) {
            mostraMsg('#msg-sorgente', 'Non c\'è un link di riserva: inseriscilo qui sotto e applicalo, poi potrai passarci.', 'errore');
            return;
        }
        const inOnda = ev.stato === 'in_onda';
        const riconferma = verso === (ev.sorgente === 'riserva' ? 'riserva' : 'principale');
        const ok = await conferma(riconferma ? (verso === 'riserva' ? {
            titolo: 'Riportare tutti sulla riserva?',
            testo: inOnda
                ? 'La riserva è già la scelta per tutti. Chi è passato da solo al link principale (per un guasto della riserva) torna sulla riserva in pochi secondi, senza ricaricare la pagina.'
                : 'La riserva è già la scelta per tutti: quando la diretta andrà in onda, tutti partiranno dalla riserva.',
            dettagli: ['Riserva: ' + linkBreve(ev.riservaUrl)],
            ok: 'Riporta tutti sulla riserva'
        } : {
            titolo: 'Riportare tutti sul link principale?',
            testo: inOnda
                ? 'Il link principale è già la scelta per tutti. Chi è passato da solo alla riserva (dopo un guasto di più di 20 secondi) torna al principale in pochi secondi, senza ricaricare la pagina.'
                : 'Il link principale è già la scelta per tutti: quando la diretta andrà in onda, tutti partiranno dal principale.',
            dettagli: ev.videoUrl ? ['Principale: ' + linkBreve(ev.videoUrl)] : [],
            ok: 'Riporta tutti sul principale'
        }) : verso === 'riserva' ? {
            titolo: 'Passare alla riserva per tutti?',
            testo: inOnda
                ? 'Chi sta guardando passa da solo al link di riserva in pochi secondi, senza ricaricare la pagina.'
                : 'La diretta non è in onda: quando ci andrà, tutti partiranno dal link di riserva.',
            dettagli: ['Riserva: ' + linkBreve(ev.riservaUrl)],
            ok: 'Passa alla riserva'
        } : {
            titolo: 'Tornare al link principale per tutti?',
            testo: inOnda
                ? 'Chi sta guardando torna da solo al link principale in pochi secondi, senza ricaricare la pagina.'
                : 'La diretta non è in onda: quando ci andrà, tutti partiranno dal link principale.',
            dettagli: ev.videoUrl ? ['Principale: ' + linkBreve(ev.videoUrl)] : [],
            ok: 'Torna al principale'
        });
        if (!ok) return;
        await conAttesa(bottone, async () => {
            try {
                const r = await chiama('evento-sorgente', { idEvento: ev.id, sorgente: verso });
                if (stato.idEvento !== ev.id) return;
                aggiornaEvento(r && r.evento ? r.evento : Object.assign({}, ev, { sorgente: verso }));
                if (riconferma) {
                    mostraMsg('#msg-sorgente', (verso === 'riserva' ? 'Riserva confermata per tutti' : 'Link principale confermato per tutti')
                        + (inOnda ? ': chi era passato da solo all\'altro link torna ' + (verso === 'riserva' ? 'sulla riserva' : 'al principale') + ' in pochi secondi.'
                            : ': vale da quando la diretta va in onda.'), 'ok');
                } else {
                    mostraMsg('#msg-sorgente', (verso === 'riserva' ? 'Riserva in uso per tutti' : 'Link principale in uso per tutti')
                        + (inOnda ? ': chi guarda passa da solo, in pochi secondi.' : ': vale da quando la diretta va in onda.'), 'ok');
                }
            } catch (e) { erroreGenerico(e, '#msg-sorgente'); }
        });
    }
    $('#btn-sorgente-riserva').addEventListener('click', () => scegliSorgente('riserva', $('#btn-sorgente-riserva')));
    $('#btn-sorgente-principale').addEventListener('click', () => scegliSorgente('principale', $('#btn-sorgente-principale')));

    /* "Guarda": l'anteprima di un link salvato. Se la web TV usa i link
       firmati, il servizio ne prepara uno (link-firmato), come per i
       partecipanti. */
    async function guardaLinkSalvato(sorgente, bottone) {
        const ev = stato.evento;
        if (!ev) return;
        const testo = sorgente === 'riserva' ? ev.riservaUrl : ev.videoUrl;
        let url = (sorgente === 'riserva' ? ev.riservaId : ev.videoId) || '';
        let firmato = false;
        if (!url) { const l = leggiFlusso(testo); url = l && !l.errore ? l.valore : ''; }
        if (!url) return;
        const nome = sorgente === 'riserva' ? 'Link di riserva' : 'Link principale';
        nascondiMsg('#msg-sorgente');
        await conAttesa(bottone, async () => {
            // senza il link firmato si prova quello nudo, e lo si dice
            let nota = '';
            if (ev.videoFirmato && tipoPlayerDi(ev) !== 'flusso') {
                // con il player Azoto in uso il servizio non prepara link firmati (409 'non-flusso')
                nota = ' Provato senza firma: il link firmato si prepara solo con il flusso diretto in uso, e la web TV potrebbe rifiutare il link nudo.';
            } else if (ev.videoFirmato) {
                try {
                    const r = await chiama('link-firmato', { idEvento: ev.id, sorgente: sorgente });
                    if (r && typeof r.url === 'string' && /^https:\/\//i.test(r.url)) { url = r.url; firmato = true; }
                } catch (e) {
                    if (e && (e.stato === 401 || e.stato === 403)) { erroreGenerico(e); return; }
                    nota = ' Non ho ottenuto il link firmato (' + senzaPunto(e && e.msg) + '): provato senza firma, che la web TV potrebbe rifiutare.';
                    mostraMsg('#msg-sorgente', 'Non ho ottenuto il link firmato (' + senzaPunto(e && e.msg) + '): provo il link senza firma, che la web TV potrebbe rifiutare.', 'attenzione');
                }
            }
            if (stato.idEvento !== ev.id) return;
            const a = await provaVideo(url, $('#regia-attuale-anteprima'), firmato);
            if (a.annullata || stato.idEvento !== ev.id) return;
            if (!a.ok) mostraMsg('#msg-sorgente', nome + ': ' + a.motivo + nota, 'errore');
            else if (a.avviso) mostraMsg('#msg-sorgente', nome + ': ' + a.avviso + nota, 'attenzione');
            else if (a.saltata) mostraMsg('#msg-sorgente', nome + ': anteprima non disponibile in questa pagina, controlla con «Vedi come un partecipante».' + nota, 'info');
            else mostraMsg('#msg-sorgente', nome + ': qui sotto lo vedi come lo vedono i partecipanti' + (firmato ? ', con un link firmato come il loro' : '') + '.' + nota, nota ? 'attenzione' : 'ok');
        });
    }
    $('#btn-guarda-principale').addEventListener('click', () => guardaLinkSalvato('principale', $('#btn-guarda-principale')));
    $('#btn-guarda-riserva').addEventListener('click', () => guardaLinkSalvato('riserva', $('#btn-guarda-riserva')));

    /* ---------- cambio dei link del flusso dalla Regia (evento-video) ----------
       Si mandano i link cambiati rispetto a quelli salvati: il principale
       sempre (se non e' cambiato e' quello di prima), la riserva solo se
       cambiata. Chi guarda li vede solo se il flusso diretto e' in uso. */
    $('#form-video').addEventListener('submit', async e => {
        e.preventDefault();
        const ev = stato.evento;
        if (!ev) return;
        const campoP = $('#regia-video');
        const campoR = $('#regia-riserva');
        const url = campoP.value.trim();
        const riserva = campoR.value.trim();
        const cambiaP = url !== (campoP.dataset.iniziale || '');
        const cambiaR = riserva !== (campoR.dataset.iniziale || '');
        nascondiMsg('#msg-video');
        [campoP, campoR].forEach(c => c.removeAttribute('aria-invalid'));
        const errore = (campo, testo) => {
            campo.setAttribute('aria-invalid', 'true');
            mostraMsg('#msg-video', testo, 'errore');
            campo.focus();
        };
        if (!cambiaP && !cambiaR) {
            mostraMsg('#msg-video', url || riserva ? 'I link sono quelli già salvati: cambiane uno, poi premi «Applica i link».' : 'Incolla il link del flusso (.m3u8).', url || riserva ? 'info' : 'errore');
            return;
        }
        const lp = leggiFlusso(url);
        const lr = leggiFlusso(riserva);
        if (cambiaP && lp && lp.errore) { errore(campoP, 'Link del flusso: ' + lp.messaggio); return; }
        if (cambiaR && lr && lr.errore) { errore(campoR, 'Link di riserva: ' + lr.messaggio); return; }
        if (riserva && !url) { errore(campoR, 'Il link di riserva serve insieme al link del flusso: inserisci prima quello.'); return; }
        if (lp && lr && !lp.errore && !lr.errore && lp.valore === lr.valore) {
            errore(campoR, 'Il link di riserva è uguale a quello del flusso: inserisci un link diverso (un altro server o un altro canale) oppure lascialo vuoto.');
            return;
        }
        // senza il flusso principale il flusso diretto non si puo' usare: se e' in uso per tutti, prima si torna al player Azoto
        if (cambiaP && !url && tipoPlayerDi(ev) === 'flusso') {
            errore(campoP, 'Il flusso diretto è in uso per tutti: per togliere il link, prima torna al player Azoto («Torna al player Azoto per tutti»).');
            return;
        }
        const b = $('#btn-cambia-video');
        await conAttesa(b, async () => {
            const avvisi = [];
            const dati = { idEvento: ev.id, videoUrl: url };
            const daProvare = [];
            if (cambiaP && url) daProvare.push({ id: 'regia-video', etichetta: 'Link del flusso' });
            if (cambiaR && riserva) daProvare.push({ id: 'regia-riserva', etichetta: 'Link di riserva' });
            for (const x of daProvare) {
                mostraMsg('#msg-video', 'Prova in corso: ' + x.etichetta.toLowerCase() + '…', 'info');
                const p = await provaPerSalvare(x.id);
                // nel frattempo si e' passati a un altro evento: non si cambia niente
                if (stato.idEvento !== ev.id) { nascondiMsg('#msg-video'); return; }
                const v = verdettoProva(p, x.etichetta);
                if (v.fermo) {
                    if (v.messaggio) mostraMsg('#msg-video', v.messaggio + '. Non ho cambiato niente.', v.tono);
                    else nascondiMsg('#msg-video');
                    if (v.tono === 'errore') $('#' + x.id).focus();
                    return;
                }
                avvisi.push.apply(avvisi, v.avvisi);
                if (x.id === 'regia-video' && p.valore) dati.videoId = p.valore;
            }
            nascondiMsg('#msg-video');
            if (cambiaR) dati.riservaUrl = riserva;
            const inOnda = ev.stato === 'in_onda';
            // con il player Azoto in uso i link del flusso non li vede nessuno, finche' non si passa al flusso diretto
            const conFlusso = tipoPlayerDi(ev) === 'flusso';
            const tolto = cambiaP && !url;
            const riservaTolta = cambiaR && !riserva;
            const riservaInUsoTolta = riservaTolta && ev.sorgente === 'riserva';
            let frase;
            if (inOnda && conFlusso) frase = testoCambioInOnda(ev, { principale: cambiaP, riserva: cambiaR, principaleTolto: tolto, riservaTolta: riservaTolta });
            else if (inOnda) frase = 'La diretta è in onda con il player Azoto: chi guarda adesso non vede cambiare niente; i link nuovi valgono quando passerai al flusso diretto.';
            else if (tolto) frase = 'Il flusso diretto resterà senza link finché non ne inserisci uno: si userà il player Azoto.';
            else if (riservaInUsoTolta) frase = 'La riserva è la scelta della regia: togliendola, quando si userà il flusso diretto si partirà dal link principale.';
            else frase = conFlusso ? 'I link nuovi valgono da quando la diretta andrà in onda.' : 'I link nuovi valgono quando passerai al flusso diretto.';
            let domanda;
            if (tolto) domanda = { titolo: 'Togliere il link del flusso?', testo: frase, dettagli: avvisi, ok: 'Togli il link', pericolo: true };
            else if (riservaInUsoTolta && !avvisi.length) domanda = { titolo: 'Togliere il link di riserva?', testo: frase, ok: 'Togli la riserva', pericolo: true };
            else if (avvisi.length) {
                domanda = {
                    titolo: 'Salvare lo stesso?',
                    testo: 'La prova ha trovato dei problemi: finché non sono risolti, i partecipanti potrebbero non vedere il video.\n' + frase,
                    dettagli: avvisi, ok: 'Salva lo stesso'
                };
            } else {
                domanda = {
                    titolo: cambiaP ? 'Cambiare il link per tutti?' : (riserva ? 'Cambiare il link di riserva?' : 'Togliere il link di riserva?'),
                    testo: frase, ok: cambiaP ? 'Cambia il link' : (riserva ? 'Salva la riserva' : 'Togli la riserva')
                };
            }
            if (!(await conferma(domanda))) return;
            try {
                const r = await chiama('evento-video', dati);
                // aggiornaEvento rimette nei campi (qui e nella scheda Evento) i link appena applicati
                aggiornaEvento(r.evento);
                const detto = tolto ? 'Link del flusso tolto.'
                    : (cambiaP && cambiaR ? 'Link aggiornati' : (cambiaP ? 'Link del flusso aggiornato' : (riserva ? 'Link di riserva aggiornato' : 'Link di riserva tolto')))
                      + (inOnda && conFlusso && !tolto && (cambiaP || ev.sorgente === 'riserva') ? ': i partecipanti collegati passano al nuovo link.' : '.');
                mostraMsg('#msg-video', detto + (avvisi.length ? ' Ricorda i problemi segnalati dalla prova: riprova il link quando Azoto li ha risolti.' : ''), 'ok');
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
    avvio().catch(() => {
        mostraMessaggio('Gestione non disponibile', 'Si è verificato un errore imprevisto durante l\'avvio: ricarica la pagina.', () => location.reload());
    });
})();
