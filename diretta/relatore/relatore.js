/* ============================================================
   LA PAGINA DEL RELATORE (/diretta/relatore/)
   ------------------------------------------------------------
   Il relatore vede, per la sua diretta:
     - le DOMANDE dei partecipanti, tutte, dalla prima arrivata (o dalla
       piu' recente), con nome, cognome e azienda di chi le ha scritte, e
       segna quelle a cui ha risposto («Segna come risposta»; si toglie
       con un altro clic, o con «Annulla» subito dopo). Le stesse domande
       e lo stesso segno li vede la regia, nella scheda Regia della
       gestione. Gli altri partecipanti non le vedono MAI;
     - i PARTECIPANTI: chi e' iscritto (con l'account attivo) e chi e'
       collegato adesso, con la ricerca per nome o azienda.
   La pagina si aggiorna da sola: le domande ogni 5 secondi, i
   partecipanti ogni 30 (piu' piano se la scheda del browser non e' in
   vista, e piu' piano ancora se il servizio non risponde).

   CHI ENTRA. Il relatore entra con la SUA email e una password che
   sceglie lui: «Primo accesso o password dimenticata» chiede al servizio
   il collegamento (api/diretta-accesso, azione 'relatore-accesso'), che
   arriva solo se l'email e' fra i relatori di un evento (scheda Evento
   della gestione, «Relatori»). Ogni chiamata al servizio
   (api/diretta-domande) porta il token: il servizio controlla a OGNI
   chiamata che l'email sia ancora fra i relatori dell'evento chiesto.
   Anche i gestori possono entrare qui, su tutti gli eventi.

   UNA SESSIONE TUTTA SUA. L'app di Firebase qui ha un nome suo
   ('relatore'): la sessione di questa pagina non e' quella della
   diretta (/diretta/) ne' quella della gestione. Cosi' il relatore puo'
   aprire anche la diretta, in un'altra scheda, con un account da
   partecipante, e uscire da una pagina non chiude l'altra.

   Niente Firestore: la pagina parla solo con il servizio. Nomi, aziende
   e domande arrivano da altre persone: si scrivono SEMPRE con
   textContent, mai come HTML.
   ============================================================ */
(function () {
    'use strict';

    const cfg = window.NGB_DIRETTA_CONFIG || null;
    const $ = id => document.getElementById(id);

    const CHIAVE_EVENTO = 'ngbRelatoreEvento';
    const CHIAVE_TESTO = 'ngbRelatoreTestoGrande';
    const CHIAVE_ORDINE = 'ngbRelatoreOrdine';
    const ID_EVENTO_VALIDO = /^[a-z0-9-]{3,41}$/;
    const OGNI_DOMANDE_MS = 5000;
    const OGNI_DOMANDE_NASCOSTA_MS = 20000;
    const OGNI_PARTECIPANTI_MS = 30000;
    const OGNI_PARTECIPANTI_NASCOSTA_MS = 120000;
    const MAX_ATTESA_ERRORE_MS = 30000;
    const NUOVA_PER_MS = 2 * 60 * 1000;      // «Nuova» resta accanto a una domanda per due minuti
    const SEGNO_RECENTE_MS = 15000;          // un segno appena salvato vince sulle letture partite prima
    const TITOLO_PAGINA = 'Pagina del relatore | Next Generation Business';

    const archivio = {
        leggi(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        scrivi(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* navigazione privata: pazienza */ } },
        togli(k) { try { localStorage.removeItem(k); } catch (e) { /* idem */ } }
    };

    const stato = {
        fb: null, auth: null,
        utente: null, email: '', ruolo: '',
        eventi: [], idEvento: '', evento: null,
        gen: 0,                       // ogni cambio di evento o di persona invalida le letture in corso
        domande: [],
        viste: new Set(),             // le domande gia' viste (per «Nuova»)
        nuove: new Map(),             // id -> quando e' comparsa
        primaLettura: true,
        forzati: new Map(),           // id -> { risposta, scade }: segni in corso o appena salvati
        filtro: 'aperte',
        ordine: archivio.leggi(CHIAVE_ORDINE) === 'recenti' ? 'recenti' : 'prima',
        partecipanti: [], conteggiP: null,
        timerDomande: null, timerPartecipanti: null,
        erroriDomande: 0, erroriPartecipanti: 0,
        messaggioAccesso: ''
    };

    /* ---------------------------------------------------------------
       PICCOLI ATTREZZI
       --------------------------------------------------------------- */
    function testo(id, t) { const n = typeof id === 'string' ? $(id) : id; if (n) n.textContent = t == null ? '' : String(t); }
    function el(tag, classe, t) {
        const n = document.createElement(tag);
        if (classe) n.className = classe;
        if (t != null) n.textContent = String(t);
        return n;
    }
    function mostraMsg(id, t, tipo) {
        const n = $(id);
        if (!n) return;
        n.textContent = t || '';
        n.className = 'msg' + (tipo ? ' msg-' + tipo : '');
        n.hidden = !t;
    }
    function numero(n) { return Number(n || 0).toLocaleString('it-IT'); }
    function ora(ms, conSecondi) {
        if (!ms) return '';
        try {
            const o = { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' };
            if (conSecondi) o.second = '2-digit';
            return new Date(ms).toLocaleTimeString('it-IT', o);
        } catch (e) { return ''; }
    }
    function dataBreve(ev) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String((ev && ev.data) || ''));
        return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
    }
    // per la ricerca: minuscole, senza accenti
    function semplice(t) {
        return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    // avviso breve in basso, con un pulsante facoltativo («Annulla»)
    function avviso(t, tipo, azione) {
        const zona = $('avvisi');
        const n = el('div', 'avviso-breve' + (tipo ? ' ' + tipo : ''));
        n.appendChild(el('span', '', t));
        let timer = null;
        if (azione) {
            const b = el('button', 'avviso-azione', azione.testo);
            b.type = 'button';
            b.addEventListener('click', () => { clearTimeout(timer); n.remove(); azione.fa(); });
            n.appendChild(b);
        }
        zona.appendChild(n);
        timer = setTimeout(() => { n.remove(); }, azione ? 9000 : (tipo === 'errore' ? 9000 : 5000));
    }

    /* ---------------------------------------------------------------
       IL SERVIZIO
       --------------------------------------------------------------- */
    class ErroreServizio extends Error {
        constructor(statoHttp, codice, msg) {
            super(msg);
            this.stato = statoHttp;
            this.codice = codice || '';
            this.msg = msg;
        }
    }
    const MSG_RETE = 'Connessione assente o servizio non raggiungibile: controlla la rete e riprova.';
    function messaggioPerStato(s) {
        if (s === 429) return 'Troppe richieste ravvicinate: attendi qualche secondo e riprova.';
        if (s >= 500) return 'Errore del servizio: riprova tra poco.';
        return 'Richiesta non accettata dal servizio.';
    }
    async function posta(funzione, dati, token) {
        const intestazioni = { 'Content-Type': 'application/json' };
        if (token) intestazioni.Authorization = 'Bearer ' + token;
        const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null;
        try {
            const r = await fetch(cfg.servizio + '/' + funzione, {
                method: 'POST', headers: intestazioni, body: JSON.stringify(dati),
                cache: 'no-store', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined
            });
            let j = null;
            try { j = await r.json(); } catch (e) { j = null; }
            return { r: r, j: j };
        } catch (e) {
            throw new ErroreServizio(0, 'rete', MSG_RETE);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }
    /* Ogni chiamata porta il token, preso subito prima; con un 401 si
       riprova UNA volta con un token nuovo (claim appena messo, password
       cambiata). */
    async function chiama(azione, dati) {
        const corpo = Object.assign({ azione: azione }, dati || {});
        for (let tentativo = 0; ; tentativo++) {
            const u = stato.auth && stato.auth.currentUser;
            if (!u) throw new ErroreServizio(401, 'non-autenticato', 'La sessione è scaduta: accedi di nuovo.');
            let token;
            try { token = await u.getIdToken(tentativo > 0); }
            catch (e) {
                if (e && e.code === 'auth/network-request-failed') throw new ErroreServizio(0, 'rete', MSG_RETE);
                throw new ErroreServizio(401, 'non-autenticato', 'La sessione è scaduta: accedi di nuovo.');
            }
            const { r, j } = await posta('diretta-domande', corpo, token);
            if (r.status === 401 && tentativo === 0) continue;
            if (!r.ok || !j || j.ok !== true) throw new ErroreServizio(r.status, j && j.codice, (j && j.msg) || messaggioPerStato(r.status));
            return j;
        }
    }
    // l'unica chiamata senza token: «Primo accesso o password dimenticata»
    async function chiamaAccesso(dati) {
        const { r, j } = await posta('diretta-accesso', dati, null);
        if (!r.ok || !j) throw new ErroreServizio(r.status, j && j.codice, (j && j.msg) || messaggioPerStato(r.status));
        return j;
    }

    /* ---------------------------------------------------------------
       VISTE E AVVIO
       --------------------------------------------------------------- */
    function mostraVista(nome) {
        document.body.setAttribute('data-vista', nome);
        $('vista-caricamento').hidden = nome !== 'caricamento';
        $('vista-messaggio').hidden = nome !== 'messaggio';
        $('vista-accesso').hidden = nome !== 'accesso';
        $('vista-app').hidden = nome !== 'app';
    }
    function mostraMessaggio(titolo, t, riprova) {
        testo('messaggio-titolo', titolo);
        testo('messaggio-testo', t);
        const b = $('btn-messaggio-riprova');
        b.hidden = !riprova;
        b.onclick = riprova || null;
        mostraVista('messaggio');
    }

    async function avvio() {
        preparaComandi();
        if (!cfg) { mostraMessaggio('Pagina non disponibile', 'Manca il file di configurazione della diretta (config.js).'); return; }
        if (!cfg.emulatori && (!cfg.firebase || !cfg.firebase.apiKey || cfg.firebase.apiKey === 'DA_COMPILARE')) {
            mostraMessaggio('Pagina non ancora configurata', 'Mancano i dati del progetto Firebase della diretta in diretta/config.js.');
            return;
        }
        const V = cfg.versioneFirebase || '11.6.1';
        let appMod, authMod;
        try {
            [appMod, authMod] = await Promise.all([
                import('https://www.gstatic.com/firebasejs/' + V + '/firebase-app.js'),
                import('https://www.gstatic.com/firebasejs/' + V + '/firebase-auth.js')
            ]);
        } catch (e) {
            mostraMessaggio('Il browser non è aggiornato',
                'Non riesco a caricare i componenti della pagina: prova con Chrome, Safari, Edge o Firefox recenti e controlla la connessione.',
                () => location.reload());
            return;
        }
        // un'app con un nome suo: la sessione di questa pagina e' separata (vedi in cima)
        const app = appMod.initializeApp(cfg.firebase, 'relatore');
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
        let r;
        try {
            r = await chiama('eventi');
        } catch (e) {
            if (e.stato === 401 || e.stato === 403) {
                stato.messaggioAccesso = e.stato === 403
                    ? 'Questo account non è fra i relatori di una diretta. Se sei un relatore, usa «Primo accesso o password dimenticata» con l\'email che hai dato alla regia.'
                    : 'La sessione è scaduta: accedi di nuovo.';
                try { await stato.fb.signOut(stato.auth); } catch (e2) { mostraAccesso(); }
                return;
            }
            mostraMessaggio('Servizio non raggiungibile', e.msg || MSG_RETE, () => { stato.utente = null; gestisciUtente(stato.auth.currentUser); });
            return;
        }
        stato.utente = u;
        stato.email = String(r.email || u.email || '');
        stato.ruolo = r.ruolo === 'gestore' ? 'gestore' : 'relatore';
        testo('utente-connesso', stato.email + (stato.ruolo === 'gestore' ? ' · regia' : ''));
        mostraVista('app');
        impostaEventi(r.eventi);
    }

    function mostraAccesso() {
        mostraVista('accesso');
        const b = $('btn-entra');
        b.disabled = false;
        b.removeAttribute('aria-busy');
        if (stato.messaggioAccesso) {
            mostraMsg('msg-accesso', stato.messaggioAccesso, 'errore');
            stato.messaggioAccesso = '';
        }
    }

    function uscitaForzata(m) {
        stato.messaggioAccesso = m || 'La sessione è scaduta: accedi di nuovo.';
        fermaTutto();
        if (stato.fb && stato.auth) stato.fb.signOut(stato.auth).catch(() => mostraAccesso());
        else mostraAccesso();
    }

    function fermaLetture() {
        stato.gen++;
        clearTimeout(stato.timerDomande);
        clearTimeout(stato.timerPartecipanti);
        stato.timerDomande = null;
        stato.timerPartecipanti = null;
    }
    function fermaTutto() {
        fermaLetture();
        stato.eventi = [];
        stato.idEvento = '';
        stato.evento = null;
        azzeraEvento();
    }
    function azzeraEvento() {
        stato.domande = [];
        stato.viste = new Set();
        stato.nuove = new Map();
        stato.forzati = new Map();
        stato.primaLettura = true;
        stato.partecipanti = [];
        stato.conteggiP = null;
        stato.erroriDomande = 0;
        stato.erroriPartecipanti = 0;
        $('elenco-domande').textContent = '';
        $('elenco-partecipanti').textContent = '';
        testo('aggiornato-domande', '');
        testo('aggiornato-partecipanti', '');
        testo('conteggi-domande', '');
        testo('conteggi-partecipanti', '');
        $('nota-nuove').hidden = true;
        document.title = TITOLO_PAGINA;
        disegnaDomande();
        disegnaPartecipanti();
    }

    /* ---------------------------------------------------------------
       ACCESSO
       --------------------------------------------------------------- */
    function preparaComandi() {
        $('form-accesso').addEventListener('submit', async e => {
            e.preventDefault();
            const email = $('campo-email').value.trim();
            const password = $('campo-password').value;
            mostraMsg('msg-accesso', '');
            if (!email || !password) {
                mostraMsg('msg-accesso', 'Scrivi la tua email e la password.', 'errore');
                (email ? $('campo-password') : $('campo-email')).focus();
                return;
            }
            if (!stato.fb) return;
            const b = $('btn-entra');
            b.disabled = true;
            b.setAttribute('aria-busy', 'true');
            try {
                await stato.fb.signInWithEmailAndPassword(stato.auth, email, password);
                // il resto lo fa onAuthStateChanged (il controllo del servizio compreso)
            } catch (err) {
                b.disabled = false;
                b.removeAttribute('aria-busy');
                const c = String((err && err.code) || '');
                let m = 'Accesso non riuscito: riprova.';
                if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) m = 'Email o password non corretti. Al primo accesso usa «Primo accesso o password dimenticata».';
                else if (/too-many-requests/.test(c)) m = 'Troppi tentativi sbagliati: attendi qualche minuto oppure usa «Primo accesso o password dimenticata».';
                else if (/user-disabled/.test(c)) m = 'Questo account è stato disattivato.';
                else if (/network-request-failed/.test(c)) m = 'Connessione assente: controlla la rete e riprova.';
                mostraMsg('msg-accesso', m, 'errore');
            }
        });
        $('btn-mostra-password').addEventListener('click', () => {
            const campo = $('campo-password');
            const b = $('btn-mostra-password');
            const vedi = campo.type === 'password';
            campo.type = vedi ? 'text' : 'password';
            b.setAttribute('aria-pressed', String(vedi));
            b.setAttribute('aria-label', vedi ? 'Nascondi la password' : 'Mostra la password');
        });
        $('btn-primo-accesso').addEventListener('click', async () => {
            const email = $('campo-email').value.trim();
            if (!email || email.indexOf('@') < 1) {
                mostraMsg('msg-accesso', 'Scrivi prima la tua email qui sopra, poi premi di nuovo «Primo accesso o password dimenticata».', 'errore');
                $('campo-email').focus();
                return;
            }
            const b = $('btn-primo-accesso');
            if (b.getAttribute('aria-busy') === 'true') return;
            b.setAttribute('aria-busy', 'true');
            b.disabled = true;
            mostraMsg('msg-accesso', 'Invio in corso…', 'info');
            try {
                const r = await chiamaAccesso({ azione: 'relatore-accesso', email: email });
                mostraMsg('msg-accesso', (r.msg || 'Se l\'indirizzo è fra i relatori, ti abbiamo scritto.')
                    + ' Il collegamento porta alla pagina dove scegliere la password; poi torna qui ed entra.', 'ok');
            } catch (e) {
                mostraMsg('msg-accesso', e.msg || 'Invio non riuscito: riprova tra poco.', 'errore');
            } finally {
                b.removeAttribute('aria-busy');
                b.disabled = false;
            }
        });
        $('btn-esci').addEventListener('click', async () => {
            fermaTutto();
            archivio.togli(CHIAVE_EVENTO);
            try { await stato.fb.signOut(stato.auth); } catch (e) { mostraAccesso(); }
        });

        // la diretta
        $('sel-evento').addEventListener('change', () => apriEvento($('sel-evento').value));
        document.querySelectorAll('.filtro').forEach(b => b.addEventListener('click', () => {
            stato.filtro = b.getAttribute('data-filtro');
            document.querySelectorAll('.filtro').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            disegnaDomande();
        }));
        $('sel-ordine').value = stato.ordine;
        $('sel-ordine').addEventListener('change', () => {
            stato.ordine = $('sel-ordine').value === 'recenti' ? 'recenti' : 'prima';
            archivio.scrivi(CHIAVE_ORDINE, stato.ordine);
            disegnaDomande(true);
        });
        const grande = archivio.leggi(CHIAVE_TESTO) === '1';
        impostaTestoGrande(grande);
        $('btn-testo-grande').addEventListener('click', () => {
            const si = !document.body.classList.contains('testo-grande');
            impostaTestoGrande(si);
            archivio.scrivi(CHIAVE_TESTO, si ? '1' : '0');
        });
        document.querySelectorAll('.scambio-btn').forEach(b => b.addEventListener('click', () => {
            const s = b.getAttribute('data-sezione');
            $('principale').setAttribute('data-sezione', s);
            document.querySelectorAll('.scambio-btn').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        }));
        let timerCerca = null;
        $('cerca-partecipante').addEventListener('input', () => {
            clearTimeout(timerCerca);
            timerCerca = setTimeout(disegnaPartecipanti, 120);
        });
        $('solo-collegati').addEventListener('change', disegnaPartecipanti);
        // le domande: un solo ascoltatore per tutto l'elenco
        $('elenco-domande').addEventListener('click', e => {
            const b = e.target && e.target.closest ? e.target.closest('.btn-segna') : null;
            if (!b) return;
            const li = b.closest('.domanda');
            const id = li && li.getAttribute('data-id');
            const d = stato.domande.find(x => x.id === id);
            if (d) segna(id, !d.risposta, true);
        });
        // tornando sulla scheda: subito una lettura, senza aspettare il giro
        document.addEventListener('visibilitychange', () => {
            if (document.hidden || !stato.idEvento) return;
            if (stato.timerDomande) { clearTimeout(stato.timerDomande); leggiDomande(); }
            if (stato.timerPartecipanti) { clearTimeout(stato.timerPartecipanti); leggiPartecipanti(); }
        });
    }
    function impostaTestoGrande(si) {
        document.body.classList.toggle('testo-grande', !!si);
        $('btn-testo-grande').setAttribute('aria-pressed', String(!!si));
    }

    /* ---------------------------------------------------------------
       GLI EVENTI
       --------------------------------------------------------------- */
    // il preferito: quello del collegamento (?e=), poi l'ultimo scelto, poi in onda > il prossimo > il piu' recente
    function eventoPreferito(eventi) {
        const par = new URLSearchParams(location.search).get('e') || '';
        const salvato = archivio.leggi(CHIAVE_EVENTO) || '';
        const c = [par, salvato].filter(x => ID_EVENTO_VALIDO.test(x) && eventi.some(e => e.id === x))[0];
        if (c) return c;
        const inOnda = eventi.find(e => e.stato === 'in_onda' || e.stato === 'pausa');
        if (inOnda) return inOnda.id;
        const adesso = Date.now();
        const prossimi = eventi.filter(e => e.stato === 'programmato' && (e.fine || 0) > adesso).sort((a, b) => (a.inizio || 0) - (b.inizio || 0));
        if (prossimi.length) return prossimi[0].id;
        return eventi.length ? eventi[0].id : '';
    }
    function impostaEventi(eventi) {
        stato.eventi = Array.isArray(eventi) ? eventi.filter(e => e && ID_EVENTO_VALIDO.test(String(e.id))) : [];
        const sel = $('sel-evento');
        sel.textContent = '';
        stato.eventi.forEach(e => {
            const o = el('option', '', (e.titolo || e.id) + (dataBreve(e) ? ' · ' + dataBreve(e) : ''));
            o.value = e.id;
            sel.appendChild(o);
        });
        sel.hidden = stato.eventi.length < 2;
        const nessuno = !stato.eventi.length;
        $('avviso-nessun-evento').hidden = !nessuno;
        $('sezione-domande').hidden = nessuno;
        $('sezione-partecipanti').hidden = nessuno;
        if (nessuno) {
            fermaLetture();
            stato.idEvento = '';
            stato.evento = null;
            azzeraEvento();
            aggiornaTestata();
            return;
        }
        const id = stato.eventi.some(e => e.id === stato.idEvento) ? stato.idEvento : eventoPreferito(stato.eventi);
        apriEvento(id, id === stato.idEvento);
    }
    function apriEvento(id, stesso) {
        if (!stesso) {
            fermaLetture();
            stato.idEvento = id;
            azzeraEvento();
        }
        stato.evento = stato.eventi.find(e => e.id === id) || null;
        $('sel-evento').value = id;
        archivio.scrivi(CHIAVE_EVENTO, id);
        aggiornaTestata();
        if (!stesso) { leggiDomande(); leggiPartecipanti(); }
    }

    const NOMI_STATO = { in_onda: 'In onda', pausa: 'In pausa', programmato: 'In programma', terminato: 'Terminata' };
    function aggiornaTestata() {
        const ev = stato.evento;
        testo('testata-titolo', ev ? (ev.titolo || ev.id) + (dataBreve(ev) ? ' · ' + dataBreve(ev) : '') : 'Nessuna diretta');
        const p = $('stato-evento');
        const s = ev ? (ev.stato || 'programmato') : '';
        p.setAttribute('data-stato', s);
        p.textContent = s ? (NOMI_STATO[s] || s) : '';
        p.hidden = !s;
        $('avviso-spente').hidden = !ev || ev.domande === true;
    }
    // l'evento come lo rimanda ogni lettura delle domande: stato, titolo, interruttore delle domande
    function aggiornaEvento(ev) {
        if (!ev || ev.id !== stato.idEvento) return;
        const i = stato.eventi.findIndex(e => e.id === ev.id);
        if (i >= 0) stato.eventi[i] = Object.assign({}, stato.eventi[i], ev);
        stato.evento = i >= 0 ? stato.eventi[i] : ev;
        aggiornaTestata();
    }
    // tolto dai relatori di questo evento mentre la pagina e' aperta: si rileggono i suoi eventi
    async function ricaricaEventi() {
        fermaLetture();
        try {
            const r = await chiama('eventi');
            avviso('Non risulti più fra i relatori di questa diretta.', 'errore');
            stato.idEvento = '';
            impostaEventi(r.eventi);
        } catch (e) {
            if (e.stato === 401 || e.stato === 403) { uscitaForzata(e.stato === 403 ? 'Questo account non è più fra i relatori di una diretta.' : ''); return; }
            mostraMessaggio('Servizio non raggiungibile', e.msg || MSG_RETE, () => { stato.utente = null; gestisciUtente(stato.auth.currentUser); });
        }
    }

    /* ---------------------------------------------------------------
       LE DOMANDE
       --------------------------------------------------------------- */
    function prossimoGiro(errori, normale, nascosta) {
        if (errori) return Math.min(MAX_ATTESA_ERRORE_MS, normale * Math.pow(2, Math.min(errori, 4)));
        return document.hidden ? nascosta : normale;
    }

    async function leggiDomande() {
        clearTimeout(stato.timerDomande);
        stato.timerDomande = null;
        const gen = stato.gen;
        const id = stato.idEvento;
        if (!id) return;
        try {
            const r = await chiama('elenco', { idEvento: id });
            if (gen !== stato.gen) return;
            stato.erroriDomande = 0;
            aggiornaEvento(r.evento);
            riceviDomande(Array.isArray(r.domande) ? r.domande : []);
            const a = $('aggiornato-domande');
            a.removeAttribute('data-errore');
            a.textContent = 'Aggiornate alle ' + ora(r.aggiornato || Date.now(), true) + ': la pagina si aggiorna da sola.';
        } catch (e) {
            if (gen !== stato.gen) return;
            if (e.stato === 401) { uscitaForzata('La sessione è scaduta: accedi di nuovo.'); return; }
            if (e.stato === 403) { ricaricaEventi(); return; }
            stato.erroriDomande++;
            const a = $('aggiornato-domande');
            a.setAttribute('data-errore', '');
            a.textContent = 'Non riesco ad aggiornare le domande (' + (e.msg || 'errore') + '): nuovo tentativo tra poco.';
        }
        if (gen === stato.gen) stato.timerDomande = setTimeout(leggiDomande, prossimoGiro(stato.erroriDomande, OGNI_DOMANDE_MS, OGNI_DOMANDE_NASCOSTA_MS));
    }

    function riceviDomande(lista) {
        const adesso = Date.now();
        let arrivate = 0;
        const valide = lista.filter(d => d && typeof d.id === 'string' && typeof d.testo === 'string');
        valide.forEach(d => {
            if (!stato.viste.has(d.id)) {
                stato.viste.add(d.id);
                if (!stato.primaLettura) { stato.nuove.set(d.id, adesso); arrivate++; }
            }
            // un segno in corso, o appena salvato, vince su una lettura partita prima
            const f = stato.forzati.get(d.id);
            if (f) {
                if (f.scade < adesso || d.risposta === f.risposta) stato.forzati.delete(d.id);
                else d.risposta = f.risposta;
            }
        });
        stato.nuove.forEach((t, id) => { if (adesso - t > NUOVA_PER_MS) stato.nuove.delete(id); });
        stato.domande = valide;
        stato.primaLettura = false;
        disegnaDomande();
        if (arrivate) {
            const n = $('nota-nuove');
            n.textContent = arrivate === 1 ? 'È arrivata una nuova domanda.' : 'Sono arrivate ' + arrivate + ' nuove domande.';
            n.hidden = false;
            clearTimeout(n._timer);
            n._timer = setTimeout(() => { n.hidden = true; }, 8000);
        }
    }

    function domandeDaMostrare() {
        const numerate = stato.domande.slice().sort((a, b) => (a.quando || 0) - (b.quando || 0) || String(a.id).localeCompare(String(b.id)));
        numerate.forEach((d, i) => { d.numero = i + 1; });
        let elenco = numerate;
        if (stato.filtro === 'aperte') elenco = numerate.filter(d => !d.risposta);
        else if (stato.filtro === 'risposte') elenco = numerate.filter(d => d.risposta);
        if (stato.ordine === 'recenti') elenco = elenco.slice().reverse();
        return elenco;
    }

    // una domanda: prima la creazione (una volta), poi solo gli aggiornamenti
    function nodoDomanda(d) {
        const li = el('li', 'domanda');
        li.setAttribute('data-id', d.id);
        const testa = el('div', 'domanda-testa');
        testa.appendChild(el('span', 'domanda-numero'));
        const chi = el('span', 'domanda-chi');
        chi.appendChild(el('strong', 'domanda-nome'));
        chi.appendChild(el('span', 'domanda-azienda'));
        chi.appendChild(el('span', 'domanda-email'));
        testa.appendChild(chi);
        testa.appendChild(el('span', 'bollino-nuova', 'Nuova'));
        testa.appendChild(el('span', 'domanda-ora'));
        li.appendChild(testa);
        li.appendChild(el('p', 'domanda-testo'));
        const piede = el('div', 'domanda-piede');
        piede.appendChild(el('span', 'domanda-esito'));
        const b = el('button', 'btn btn-segna');
        b.type = 'button';
        piede.appendChild(b);
        li.appendChild(piede);
        return li;
    }
    function riempiDomanda(li, d) {
        const nome = [d.nome, d.cognome].map(x => String(x || '').trim()).filter(Boolean).join(' ') || 'Partecipante';
        testo(li.querySelector('.domanda-numero'), 'n. ' + d.numero);
        testo(li.querySelector('.domanda-nome'), nome);
        testo(li.querySelector('.domanda-azienda'), d.azienda ? d.azienda : '');
        testo(li.querySelector('.domanda-email'), stato.ruolo === 'gestore' && d.email ? d.email : '');
        testo(li.querySelector('.domanda-ora'), ora(d.quando));
        const q = li.querySelector('.domanda-testo');
        if (q.textContent !== d.testo) q.textContent = d.testo;
        li.setAttribute('data-risposta', d.risposta ? '1' : '0');
        li.toggleAttribute('data-nuova', stato.nuove.has(d.id) && !d.risposta);
        const inCorso = stato.forzati.has(d.id) && stato.forzati.get(d.id).scade === Infinity;
        li.toggleAttribute('aria-busy', inCorso);
        let esito = '';
        if (d.risposta) {
            esito = 'Risposta data' + (d.rispostaQuando ? ' alle ' + ora(d.rispostaQuando) : '');
            if (stato.ruolo === 'gestore' && d.rispostaDa) esito += ' (' + d.rispostaDa + ')';
        }
        testo(li.querySelector('.domanda-esito'), esito);
        const b = li.querySelector('.btn-segna');
        b.setAttribute('aria-pressed', String(!!d.risposta));
        b.textContent = d.risposta ? 'Togli «Risposta data»' : 'Segna come risposta';
        b.setAttribute('aria-label', (d.risposta ? 'Togli il segno di risposta alla domanda n. ' : 'Segna come risposta la domanda n. ') + d.numero + ' di ' + nome);
        b.disabled = inCorso;
    }
    /* L'elenco si aggiorna senza ridisegnarlo: le domande che restano
       restano gli stessi elementi (il fuoco e il puntatore sul pulsante
       non saltano a ogni giro), si aggiungono le nuove e si tolgono quelle
       uscite dal filtro. Con «riordina» (cambio d'ordine) si rimette tutto
       in fila. */
    function disegnaDomande() {
        const tutte = stato.domande.length;
        const risposte = stato.domande.filter(d => d.risposta).length;
        const aperte = tutte - risposte;
        testo('numero-aperte', numero(aperte));
        testo('numero-risposte', numero(risposte));
        testo('numero-tutte', numero(tutte));
        testo('scambio-domande', aperte ? '(' + numero(aperte) + ')' : '');
        testo('conteggi-domande', tutte
            ? numero(tutte) + (tutte === 1 ? ' domanda ricevuta' : ' domande ricevute') + ' · ' + numero(risposte) + ' con risposta'
            : '');
        document.title = (aperte ? '(' + aperte + ') ' : '') + TITOLO_PAGINA;

        const lista = $('elenco-domande');
        const elenco = domandeDaMostrare();
        const esistenti = new Map();
        Array.from(lista.children).forEach(li => esistenti.set(li.getAttribute('data-id'), li));
        const volute = new Set(elenco.map(d => d.id));
        esistenti.forEach((li, id) => { if (!volute.has(id)) li.remove(); });
        let cursore = lista.firstElementChild;
        elenco.forEach(d => {
            let li = esistenti.get(d.id);
            if (!li) li = nodoDomanda(d);
            riempiDomanda(li, d);
            if (li === cursore) { cursore = cursore.nextElementSibling; return; }
            lista.insertBefore(li, cursore);
        });

        const vuoto = $('vuoto-domande');
        if (!elenco.length && stato.idEvento) {
            vuoto.textContent = !tutte
                ? (stato.primaLettura ? 'Lettura delle domande…' : 'Ancora nessuna domanda. Compariranno qui da sole, appena i partecipanti le mandano.')
                : (stato.filtro === 'aperte' ? 'Nessuna domanda da rispondere: hai risposto a tutte.' : 'Nessuna domanda con risposta, per ora.');
            vuoto.hidden = false;
        } else vuoto.hidden = true;
    }

    async function segna(id, risposta, conAnnulla) {
        const gen = stato.gen;
        const d = stato.domande.find(x => x.id === id);
        if (!d) return;
        const prima = !!d.risposta;
        stato.forzati.set(id, { risposta: risposta, scade: Infinity });
        d.risposta = risposta;
        if (!risposta) d.rispostaQuando = null;
        disegnaDomande();
        try {
            const r = await chiama('segna', { idEvento: stato.idEvento, idDomanda: id, risposta: risposta });
            if (gen !== stato.gen) return;
            stato.forzati.set(id, { risposta: risposta, scade: Date.now() + SEGNO_RECENTE_MS });
            const i = stato.domande.findIndex(x => x.id === id);
            if (i >= 0 && r.domanda && r.domanda.id === id) stato.domande[i] = Object.assign({}, stato.domande[i], r.domanda);
            disegnaDomande();
            if (conAnnulla) {
                avviso(risposta ? 'Domanda n. ' + (d.numero || '') + ' segnata come risposta.' : 'Tolto il segno di risposta.', 'ok',
                    { testo: 'Annulla', fa: () => segna(id, !risposta, false) });
            }
        } catch (e) {
            if (gen !== stato.gen) return;
            stato.forzati.delete(id);
            const x = stato.domande.find(y => y.id === id);
            if (x) x.risposta = prima;
            disegnaDomande();
            if (e.stato === 401) { uscitaForzata('La sessione è scaduta: accedi di nuovo.'); return; }
            if (e.stato === 403) { ricaricaEventi(); return; }
            avviso(e.msg || 'Non è stato possibile salvare: riprova.', 'errore');
        }
    }

    /* ---------------------------------------------------------------
       I PARTECIPANTI
       --------------------------------------------------------------- */
    async function leggiPartecipanti() {
        clearTimeout(stato.timerPartecipanti);
        stato.timerPartecipanti = null;
        const gen = stato.gen;
        const id = stato.idEvento;
        if (!id) return;
        try {
            const r = await chiama('partecipanti', { idEvento: id });
            if (gen !== stato.gen) return;
            stato.erroriPartecipanti = 0;
            stato.partecipanti = Array.isArray(r.partecipanti) ? r.partecipanti : [];
            stato.conteggiP = r.conteggi || null;
            disegnaPartecipanti();
            const a = $('aggiornato-partecipanti');
            a.removeAttribute('data-errore');
            a.textContent = 'Aggiornato alle ' + ora(r.aggiornato || Date.now(), true) + '.';
        } catch (e) {
            if (gen !== stato.gen) return;
            if (e.stato === 401) { uscitaForzata('La sessione è scaduta: accedi di nuovo.'); return; }
            if (e.stato === 403) { ricaricaEventi(); return; }
            stato.erroriPartecipanti++;
            const a = $('aggiornato-partecipanti');
            a.setAttribute('data-errore', '');
            a.textContent = 'Non riesco ad aggiornare l\'elenco (' + (e.msg || 'errore') + '): nuovo tentativo tra poco.';
        }
        if (gen === stato.gen) {
            stato.timerPartecipanti = setTimeout(leggiPartecipanti,
                prossimoGiro(stato.erroriPartecipanti, OGNI_PARTECIPANTI_MS, OGNI_PARTECIPANTI_NASCOSTA_MS));
        }
    }

    function disegnaPartecipanti() {
        const c = stato.conteggiP;
        testo('conteggi-partecipanti', c ? numero(c.iscritti) + (c.iscritti === 1 ? ' iscritto' : ' iscritti') + ' · '
            + numero(c.collegati) + (c.collegati === 1 ? ' collegato adesso' : ' collegati adesso') : '');
        testo('scambio-partecipanti', c ? '(' + numero(c.collegati) + ')' : '');
        const cerca = semplice($('cerca-partecipante').value.trim());
        const solo = $('solo-collegati').checked;
        const elenco = stato.partecipanti.filter(p => (!solo || p.collegato)
            && (!cerca || semplice([p.nome, p.cognome, p.azienda, p.email].join(' ')).indexOf(cerca) >= 0));
        const lista = $('elenco-partecipanti');
        const frammento = document.createDocumentFragment();
        elenco.forEach(p => {
            const li = el('li', 'partecipante');
            li.setAttribute('data-collegato', p.collegato ? '1' : '0');
            const punto = el('span', 'punto-collegato');
            punto.setAttribute('aria-hidden', 'true');
            li.appendChild(punto);
            const chi = el('span', 'partecipante-chi');
            chi.appendChild(el('strong', '', [p.cognome, p.nome].map(x => String(x || '').trim()).filter(Boolean).join(' ') || 'Senza nome'));
            if (p.azienda) chi.appendChild(el('span', 'partecipante-azienda', p.azienda));
            if (stato.ruolo === 'gestore' && p.email) chi.appendChild(el('span', 'partecipante-email', p.email));
            li.appendChild(chi);
            li.appendChild(el('span', 'partecipante-stato', p.collegato ? 'collegato' : 'non collegato'));
            frammento.appendChild(li);
        });
        lista.textContent = '';
        lista.appendChild(frammento);
        const vuoto = $('vuoto-partecipanti');
        if (!elenco.length && stato.idEvento) {
            vuoto.textContent = !stato.conteggiP ? 'Lettura dei partecipanti…'
                : (stato.partecipanti.length ? 'Nessun partecipante corrisponde alla ricerca.' : 'Nessun partecipante iscritto, per ora.');
            vuoto.hidden = false;
        } else vuoto.hidden = true;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
    else avvio();
})();
