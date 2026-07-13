/* ============================================================
   AREA RISERVATA REVILAW - Applicazione
   ------------------------------------------------------------
   Prototipo dimostrativo: tutti i dati vivono in localStorage.
   L'autenticazione e' simulata lato client e serve solo a
   mostrare i flussi (prima password, cambio obbligatorio,
   recupero, ruoli). Non costituisce protezione reale.
   ============================================================ */

(function () {
    'use strict';

    /* =========================================================
       UTILITA'
    ========================================================= */
    const eurFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    const eurFmt2 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const numFmt = new Intl.NumberFormat('it-IT');

    // titolare dello studio: unico a vedere "Dati e backup" e a ricevere le allerte
    const PROPRIETARIO = 'a.missori@emvas.tax';
    // fatturazione predefinita in base al tipo di incarico
    function fatturazionePredefinita(tipo) {
        if (tipo === 'legale') return 'trimestrale';
        return 'annuale';
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function uid() {
        return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    }
    function oggiISO() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function fmtData(iso) {
        if (!iso) return '';
        const [a, m, g] = iso.split('-');
        if (!a || !m || !g) return iso;
        return g + '/' + m + '/' + a;
    }
    function fmtDataOra(ts) {
        const d = new Date(ts);
        return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() +
            ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    function parseImporto(str) {
        if (typeof str === 'number') return str;
        if (!str) return 0;
        const pulito = String(str).replace(/[.\s€]/g, '').replace(',', '.');
        const n = parseFloat(pulito);
        return isNaN(n) ? 0 : n;
    }
    function annoCorrente() { return new Date().getFullYear(); }

    /* ---------- SHA-256 (Web Crypto con fallback puro JS) ---------- */
    function sha256Js(ascii) {
        // Implementazione compatta di SHA-256 per contesti senza crypto.subtle
        function rr(v, c) { return (v >>> c) | (v << (32 - c)); }
        let maxWord = Math.pow(2, 32), result = '';
        const words = [], asciiBitLength = ascii.length * 8;
        let hash = sha256Js.h = sha256Js.h || [], k = sha256Js.k = sha256Js.k || [];
        let primeCounter = k.length;
        const isComposite = {};
        for (let candidate = 2; primeCounter < 64; candidate++) {
            if (!isComposite[candidate]) {
                for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
                hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
                k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
            }
        }
        ascii += '\x80';
        while (ascii.length % 64 - 56) ascii += '\x00';
        for (let i = 0; i < ascii.length; i++) {
            const j = ascii.charCodeAt(i);
            if (j >> 8) return null;
            words[i >> 2] |= j << ((3 - i) % 4) * 8;
        }
        words[words.length] = ((asciiBitLength / maxWord) | 0);
        words[words.length] = (asciiBitLength);
        for (let j = 0; j < words.length;) {
            const w = words.slice(j, j += 16);
            const oldHash = hash.slice(0, 8);
            for (let i = 0; i < 64; i++) {
                const w15 = w[i - 15], w2 = w[i - 2];
                const a = hash[0], e = hash[4];
                const temp1 = hash[7]
                    + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
                    + ((e & hash[5]) ^ ((~e) & hash[6]))
                    + k[i]
                    + (w[i] = (i < 16) ? w[i] : (
                        w[i - 16]
                        + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
                        + w[i - 7]
                        + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))
                    ) | 0);
                const temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
                    + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
                hash = [(temp1 + temp2) | 0].concat(hash);
                hash[4] = (hash[4] + temp1) | 0;
            }
            for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
        }
        for (let i = 0; i < 8; i++) {
            for (let j = 3; j + 1; j--) {
                const b = (hash[i] >> (j * 8)) & 255;
                result += ((b < 16) ? 0 : '') + b.toString(16);
            }
        }
        return result;
    }

    async function sha256(testo) {
        if (window.crypto && crypto.subtle) {
            try {
                const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(testo));
                return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
            } catch (e) { /* fallback sotto */ }
        }
        // fallback: converte in "ascii-safe" tramite encodeURIComponent
        return sha256Js(unescape(encodeURIComponent(testo)));
    }

    function generaPasswordTemporanea() {
        const set = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let p = '';
        const rand = new Uint32Array(10);
        if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(rand);
        else for (let i = 0; i < 10; i++) rand[i] = Math.floor(Math.random() * 1e9);
        for (let i = 0; i < 10; i++) p += set[rand[i] % set.length];
        return p;
    }

    /* =========================================================
       ARCHIVIO (localStorage)
    ========================================================= */
    const CHIAVI = {
        utenti: 'rvArea.utenti',
        incarichi: 'rvArea.incarichi',
        persone: 'rvArea.persone',
        audit: 'rvArea.audit',
        fatture: 'rvArea.fattureStato',
        allerte: 'rvArea.allerte',
        impostazioni: 'rvArea.impostazioni'
    };

    const Store = {
        leggi(chiave, def) {
            try {
                const raw = localStorage.getItem(chiave);
                return raw ? JSON.parse(raw) : def;
            } catch (e) { return def; }
        },
        scrivi(chiave, valore) {
            localStorage.setItem(chiave, JSON.stringify(valore));
            // in modalita cloud i dati condivisi vengono replicati su Firestore
            if (typeof Cloud !== 'undefined' && Cloud.attivo) Cloud.sincronizza(chiave, valore);
        },
        seed() {
            if (!localStorage.getItem(CHIAVI.utenti)) {
                const utenti = RV_UTENTI_INIZIALI.map(u => ({
                    ...u, hash: null, sale: uid(), mustChange: false,
                    tentativi: 0, bloccatoFino: 0, attivo: true,
                    creato: Date.now(), creatoDa: 'sistema'
                }));
                Store.scrivi(CHIAVI.utenti, utenti);
            }
            if (!localStorage.getItem(CHIAVI.incarichi)) {
                const incarichi = RV_INCARICHI_DEMO.map(r => ({
                    id: uid(), stato: 'attivo', fatturazione: 'annuale', ...r,
                    creato: { da: 'sistema (dati demo)', il: Date.now() },
                    modificato: null
                }));
                Store.scrivi(CHIAVI.incarichi, incarichi);
                Audit.registra('sistema', 'Inizializzazione', 'sistema', null, null,
                    'Caricati ' + incarichi.length + ' incarichi dimostrativi');
            }
            Store.seedPersone();
        },
        /* l'anagrafica del team serve anche in modalita cloud */
        seedPersone() {
            if (!localStorage.getItem(CHIAVI.persone)) {
                const mappa = {};
                RV_ROSTER.team.forEach(n => { mappa[n] = { team: true }; });
                RV_ROSTER.qualita.forEach(n => { mappa[n] = { ...(mappa[n] || {}), qualita: true, team: true }; });
                RV_ROSTER.respIncarico.forEach(n => { mappa[n] = { ...(mappa[n] || {}), respIncarico: true, team: true }; });
                const persone = Object.keys(mappa).sort().map(n => ({
                    id: uid(), nome: n,
                    qualita: !!mappa[n].qualita, respIncarico: !!mappa[n].respIncarico,
                    team: true, attivo: true
                }));
                Store.scrivi(CHIAVI.persone, persone);
            }
        }
    };

    /* =========================================================
       ALLERTE (messaggi per sbloccare un calcolo congelato,
       visibili al titolare dello studio)
    ========================================================= */
    const Allerte = {
        tutte() { return Store.leggi(CHIAVI.allerte, []); },
        salva(l) { Store.scrivi(CHIAVI.allerte, l); },
        attive() { return this.tutte().filter(a => !a.letta); },
        aggiungi(a) {
            const lista = this.tutte();
            lista.unshift({ id: uid(), ts: Date.now(), letta: false, ...a });
            if (lista.length > 500) lista.length = 500;
            this.salva(lista);
        },
        segnaLetta(id) {
            const lista = this.tutte();
            const a = lista.find(x => x.id === id);
            if (a) { a.letta = true; this.salva(lista); }
        }
    };

    /* =========================================================
       PERSONE (anagrafica modificabile del team)
    ========================================================= */
    /* separatore unico per gli elenchi di nominativi: virgola, punto e
       virgola, o trattino con almeno uno spazio adiacente (cosi i
       cognomi composti tipo "Rossi-Bianchi" restano interi) */
    function dividiNomi(testo) {
        return String(testo || '')
            .split(/[,;]|\s+-\s*|\s*-\s+/)
            .map(t => t.trim())
            .filter(Boolean);
    }

    const Persone = {
        tutte() { return Store.leggi(CHIAVI.persone, []); },
        salva(l) { Store.scrivi(CHIAVI.persone, l); },
        /* nomi attivi per un ruolo: 'qualita' | 'respIncarico' | 'team' */
        attive(ruolo) {
            return this.tutte()
                .filter(p => p.attivo && (!ruolo || p[ruolo]))
                .map(p => p.nome)
                .sort((a, b) => a.localeCompare(b));
        },
        trovaPerNome(nome) {
            const n = String(nome || '').trim().toLowerCase();
            return this.tutte().find(p => p.nome.toLowerCase() === n) || null;
        },
        // nome completo "Nome Cognome" se il nome proprio e registrato; altrimenti
        // (dati non ancora migrati) il vecchio nomeCompleto; altrimenti il solo cognome
        nomeCompleto(cognome) {
            const p = this.trovaPerNome(cognome);
            if (!p) return cognome || '';
            if (p.nomeProprio) {
                // evita "Rossi Mario Rossi" se il nome proprio contenesse gia il cognome
                return p.nomeProprio.toLowerCase().endsWith(String(p.nome || '').toLowerCase())
                    ? p.nomeProprio : (p.nomeProprio + ' ' + p.nome).trim();
            }
            if (p.nomeCompleto) return p.nomeCompleto;
            return cognome || '';
        },
        // migrazione una tantum: dai vecchi record con "nomeCompleto" ai nuovi
        // campi (cognome = nome; nomeProprio = nomeCompleto senza il cognome finale).
        // Idempotente: dopo la prima esecuzione non trova piu nulla da migrare.
        migraNomi() {
            const lista = this.tutte();
            let cambiato = false;
            lista.forEach(p => {
                if (p.nomeProprio === undefined) {
                    let np = '';
                    if (p.nomeCompleto) {
                        const nc = String(p.nomeCompleto).trim();
                        const cog = String(p.nome || '').trim();
                        np = (cog && nc.toLowerCase().endsWith(cog.toLowerCase()))
                            ? nc.slice(0, nc.length - cog.length).trim()
                            : nc;
                    }
                    p.nomeProprio = np;
                    cambiato = true;
                }
                if ('nomeCompleto' in p) { delete p.nomeCompleto; cambiato = true; }
            });
            if (cambiato) this.salva(lista);
        },
        /* usato dall'import: aggiunge i nominativi mancanti con i ruoli
           rilevati e riporta i campi degli incarichi alla grafia canonica
           dell'anagrafica (evita doppioni tipo "MISSORI" / "Missori") */
        integraDaIncarichi(incarichi) {
            const lista = this.tutte();
            const indice = {};
            lista.forEach(p => { indice[p.nome.toLowerCase()] = p; });
            let aggiunte = 0;
            const registra = (nome, ruolo) => {
                const pulito = String(nome || '').trim();
                if (!pulito || pulito.length < 2 || /^#?n\s*[.\/]?\s*d\.?$/i.test(pulito)) return null;
                const chiave = pulito.toLowerCase();
                if (indice[chiave]) {
                    if (!indice[chiave][ruolo]) indice[chiave][ruolo] = true;
                    return indice[chiave].nome;
                }
                const nuova = { id: uid(), nome: pulito, qualita: false, respIncarico: false, team: true, attivo: true };
                nuova[ruolo] = true;
                indice[chiave] = nuova;
                lista.push(nuova);
                aggiunte++;
                return nuova.nome;
            };
            incarichi.forEach(i => {
                const q = registra(i.qualita, 'qualita');
                if (q) i.qualita = q;
                const r = registra(i.respIncarico, 'respIncarico');
                if (r) i.respIncarico = r;
                // il referente puo contenere piu nominativi
                const refs = dividiNomi(i.referente).map(t => registra(t, 'team') || t);
                if (refs.length) i.referente = refs.join(', ');
                const membri = dividiNomi(i.team).map(t => registra(t, 'team') || t);
                if (membri.length) i.team = membri.join(', ');
            });
            this.salva(lista);
            return aggiunte;
        }
    };

    /* =========================================================
       REGISTRO MODIFICHE (audit trail)
    ========================================================= */
    const Audit = {
        registra(utente, azione, entita, rif, cliente, dettagli) {
            const log = Store.leggi(CHIAVI.audit, []);
            log.unshift({
                id: uid(), ts: Date.now(),
                utente: typeof utente === 'object' ? (utente.nome + ' <' + utente.email + '>') : utente,
                azione, entita, rif: rif || null, cliente: cliente || null,
                dettagli: dettagli || null
            });
            if (log.length > 2000) log.length = 2000;
            Store.scrivi(CHIAVI.audit, log);
        },
        confronta(prima, dopo, campi) {
            const diff = [];
            campi.forEach(c => {
                const a = prima ? prima[c.chiave] : undefined;
                const b = dopo ? dopo[c.chiave] : undefined;
                const sa = a == null ? '' : (typeof a === 'object' ? JSON.stringify(a) : String(a));
                const sb = b == null ? '' : (typeof b === 'object' ? JSON.stringify(b) : String(b));
                if (sa !== sb) diff.push({ campo: c.nome, prima: sa || 'vuoto', dopo: sb || 'vuoto' });
            });
            return diff;
        }
    };

    const CAMPI_TRACCIATI = [
        { chiave: 'cliente', nome: 'Cliente' },
        { chiave: 'tipo', nome: 'Tipo incarico' },
        { chiave: 'codiceFiscale', nome: 'Codice fiscale' },
        { chiave: 'area', nome: 'Area' },
        { chiave: 'regione', nome: 'Regione' },
        { chiave: 'localita', nome: 'Localita' },
        { chiave: 'dataInizio', nome: 'Data inizio' },
        { chiave: 'dataFine', nome: 'Data fine' },
        { chiave: 'rinnovo', nome: 'Rinnovo' },
        { chiave: 'qualita', nome: 'Responsabile qualita' },
        { chiave: 'respIncarico', nome: 'Responsabile incarico' },
        { chiave: 'referente', nome: 'Referente' },
        { chiave: 'team', nome: 'Team di revisione' },
        { chiave: 'email1', nome: 'Email 1' },
        { chiave: 'email2', nome: 'Email 2' },
        { chiave: 'compensi', nome: 'Compensi' },
        { chiave: 'fatturazione', nome: 'Periodicita fatturazione' },
        { chiave: 'stato', nome: 'Stato' },
        { chiave: 'statoNote', nome: 'Note stato' },
        { chiave: 'calcoloCongelato', nome: 'Calcolo congelato' }
    ];

    /* =========================================================
       AUTENTICAZIONE (simulata)
    ========================================================= */
    const Auth = {
        utenteCorrente: null,

        utenti() { return Store.leggi(CHIAVI.utenti, []); },
        salvaUtenti(u) { Store.scrivi(CHIAVI.utenti, u); },
        trova(email) {
            return this.utenti().find(u => u.email.toLowerCase() === String(email || '').trim().toLowerCase()) || null;
        },

        async richiediPrimaPassword(email) {
            if (Cloud.attivo) return Cloud.primaPassword(email);
            const utenti = this.utenti();
            const u = utenti.find(x => x.email.toLowerCase() === email.toLowerCase());
            if (!u) return { ok: false, msg: 'Indirizzo non autorizzato. L\'accesso e riservato agli utenti abilitati dall\'amministratore.' };
            if (!u.attivo) return { ok: false, msg: 'Utenza disabilitata. Contatta l\'amministratore.' };
            if (u.hash) return { ok: false, msg: 'Password gia impostata per questa utenza. Usa "Password dimenticata?" per reimpostarla.' };
            const temp = generaPasswordTemporanea();
            u.hash = await sha256(u.sale + '|' + temp);
            u.mustChange = true;
            this.salvaUtenti(utenti);
            Audit.registra(u.email, 'Prima password generata', 'utente', u.email, null,
                'Richiesta prima password dalla pagina di accesso');
            return { ok: true, temp };
        },

        async recuperaPassword(email) {
            if (Cloud.attivo) return Cloud.recuperaPassword(email);
            const utenti = this.utenti();
            const u = utenti.find(x => x.email.toLowerCase() === email.toLowerCase());
            if (!u) return { ok: false, msg: 'Indirizzo non autorizzato.' };
            if (!u.attivo) return { ok: false, msg: 'Utenza disabilitata. Contatta l\'amministratore.' };
            if (!u.hash) return { ok: false, msg: 'Per questa utenza non e mai stata impostata una password: usa "Richiedi la prima password".' };
            const temp = generaPasswordTemporanea();
            u.hash = await sha256(u.sale + '|' + temp);
            u.mustChange = true;
            u.tentativi = 0; u.bloccatoFino = 0;
            this.salvaUtenti(utenti);
            Audit.registra(u.email, 'Password reimpostata (recupero)', 'utente', u.email, null,
                'Recupero password dalla pagina di accesso');
            return { ok: true, temp };
        },

        async accedi(email, password) {
            if (Cloud.attivo) return Cloud.accedi(email, password);
            const utenti = this.utenti();
            const u = utenti.find(x => x.email.toLowerCase() === email.toLowerCase());
            if (!u || !u.attivo) return { ok: false, msg: 'Credenziali non valide o utenza non abilitata.' };
            if (u.bloccatoFino && Date.now() < u.bloccatoFino) {
                const min = Math.ceil((u.bloccatoFino - Date.now()) / 60000);
                return { ok: false, msg: 'Utenza temporaneamente bloccata per troppi tentativi. Riprova tra ' + min + ' minuti.' };
            }
            if (!u.hash) return { ok: false, msg: 'Nessuna password impostata: usa "Richiedi la prima password".' };
            const h = await sha256(u.sale + '|' + password);
            if (h !== u.hash) {
                u.tentativi = (u.tentativi || 0) + 1;
                if (u.tentativi >= 5) {
                    u.bloccatoFino = Date.now() + 5 * 60000;
                    u.tentativi = 0;
                    Audit.registra(u.email, 'Utenza bloccata (5 tentativi falliti)', 'utente', u.email, null, null);
                }
                this.salvaUtenti(utenti);
                return { ok: false, msg: 'Credenziali non valide.' };
            }
            u.tentativi = 0; u.bloccatoFino = 0; u.ultimoAccesso = Date.now();
            this.salvaUtenti(utenti);
            this.utenteCorrente = u;
            sessionStorage.setItem('rvArea.sessione', JSON.stringify({ email: u.email, ts: Date.now() }));
            Audit.registra(u.email, 'Accesso effettuato', 'utente', u.email, null, null);
            return { ok: true, mustChange: !!u.mustChange };
        },

        async cambiaPassword(email, nuova) {
            if (Cloud.attivo) return Cloud.cambiaPassword(email, nuova);
            const utenti = this.utenti();
            const u = utenti.find(x => x.email.toLowerCase() === email.toLowerCase());
            if (!u) return { ok: false, msg: 'Utente non trovato.' };
            const controllo = Auth.validaPassword(nuova);
            if (controllo) return { ok: false, msg: controllo };
            u.sale = uid();
            u.hash = await sha256(u.sale + '|' + nuova);
            u.mustChange = false;
            this.salvaUtenti(utenti);
            if (this.utenteCorrente && this.utenteCorrente.email === u.email) this.utenteCorrente = u;
            Audit.registra(u.email, 'Password modificata', 'utente', u.email, null, null);
            return { ok: true };
        },

        validaPassword(p) {
            if (!p || p.length < 8) return 'La password deve avere almeno 8 caratteri.';
            if (!/[A-Z]/.test(p)) return 'La password deve contenere almeno una lettera maiuscola.';
            if (!/[a-z]/.test(p)) return 'La password deve contenere almeno una lettera minuscola.';
            if (!/[0-9]/.test(p)) return 'La password deve contenere almeno una cifra.';
            return null;
        },

        ripristinaSessione() {
            try {
                const s = JSON.parse(sessionStorage.getItem('rvArea.sessione'));
                if (!s) return false;
                const u = this.trova(s.email);
                if (!u || !u.attivo || u.mustChange) return false;
                this.utenteCorrente = u;
                return true;
            } catch (e) { return false; }
        },

        esci() {
            if (this.utenteCorrente) Audit.registra(this.utenteCorrente.email, 'Uscita', 'utente', this.utenteCorrente.email, null, null);
            this.utenteCorrente = null;
            sessionStorage.removeItem('rvArea.sessione');
            if (Cloud.attivo) Cloud.esci();
        },

        eAdmin() { return this.utenteCorrente && this.utenteCorrente.ruolo === 'admin'; },
        puoModificare() {
            return this.utenteCorrente && ['admin', 'qualita', 'procuratore'].includes(this.utenteCorrente.ruolo);
        },
        // "Dati e backup" e riservato al titolare dello studio
        eProprietario() {
            return this.utenteCorrente && this.utenteCorrente.email && this.utenteCorrente.email.toLowerCase() === PROPRIETARIO;
        }
    };

    /* =========================================================
       CLOUD (Firebase: accesso reale via email e dati condivisi)
       Attivo solo se window.RV_FIREBASE_CONFIG e' compilato.
    ========================================================= */
    const Cloud = {
        attivo: false,
        pronto: false,
        fb: null, app: null, auth: null, db: null,
        sottoscrizioni: [],
        DOC_SYNC: null,

        async init() {
            const config = window.RV_FIREBASE_CONFIG;
            if (!config || !config.apiKey) return;
            try {
                const V = '11.6.1';
                const [appMod, authMod, fsMod] = await Promise.all([
                    import('https://www.gstatic.com/firebasejs/' + V + '/firebase-app.js'),
                    import('https://www.gstatic.com/firebasejs/' + V + '/firebase-auth.js'),
                    import('https://www.gstatic.com/firebasejs/' + V + '/firebase-firestore.js')
                ]);
                this.fb = { appMod, authMod, fsMod };
                this.app = appMod.initializeApp(config);
                this.auth = authMod.getAuth(this.app);
                // email di Firebase (reimpostazione password) in italiano
                this.auth.languageCode = 'it';
                // sessione limitata alla scheda, come in modalita demo
                // sessione persistente (sopravvive ai reload); l'inattivita di
                // 30 minuti viene fatta rispettare dall'app, anche dopo un riavvio
                try { await authMod.setPersistence(this.auth, authMod.browserLocalPersistence); } catch (e) { }
                this.db = fsMod.getFirestore(this.app);
                this.DOC_SYNC = {};
                this.DOC_SYNC[CHIAVI.incarichi] = 'incarichi';
                this.DOC_SYNC[CHIAVI.persone] = 'persone';
                this.DOC_SYNC[CHIAVI.audit] = 'audit';
                this.DOC_SYNC[CHIAVI.fatture] = 'fattureStato';
                this.DOC_SYNC[CHIAVI.allerte] = 'allerte';
                this.attivo = true;
                // svuota la coda di scritture prima che la scheda venga chiusa
                // o messa in background (evita perdite silenziose su Firestore)
                const teardown = () => { if (this._timerFlush) { clearTimeout(this._timerFlush); this._timerFlush = null; } this._flush(); };
                window.addEventListener('pagehide', teardown);
                document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') teardown(); });
            } catch (e) {
                console.error('Firebase non inizializzato, resto in modalita dimostrativa:', e);
                this.attivo = false;
            }
        },

        async docUtente(email) {
            const { doc, getDoc } = this.fb.fsMod;
            const snap = await getDoc(doc(this.db, 'utenti', email.toLowerCase()));
            return snap.exists() ? snap.data() : null;
        },

        /* sessione gia aperta (ricarica pagina) */
        async utenteDaSessione() {
            const { onAuthStateChanged, signOut } = this.fb.authMod;
            const utenteFb = await new Promise(risolvi => {
                const stacca = onAuthStateChanged(this.auth, u => { stacca(); risolvi(u); });
            });
            if (!utenteFb || !utenteFb.email) return null;
            // sessione persistente ma scaduta per inattivita: si esce
            if (sessioneScaduta()) { try { await signOut(this.auth); } catch (e) { } return null; }
            try {
                const dati = await this.docUtente(utenteFb.email);
                if (!dati || dati.attivo === false) { await signOut(this.auth); return null; }
                await this.avviaSync();
                return { email: utenteFb.email.toLowerCase(), nome: dati.nome || utenteFb.email, ruolo: dati.ruolo || 'procuratore' };
            } catch (e) { return null; }
        },

        async accedi(email, password) {
            const { signInWithEmailAndPassword, signOut } = this.fb.authMod;
            try {
                await signInWithEmailAndPassword(this.auth, email, password);
            } catch (e) {
                return { ok: false, msg: this.msgErrore(e) };
            }
            let dati = null;
            try { dati = await this.docUtente(email); } catch (e) { /* lettura negata = non abilitato */ }
            if (!dati || dati.attivo === false) {
                await signOut(this.auth);
                return { ok: false, msg: 'Utenza non abilitata: chiedi all\'amministratore di aggiungerti all\'elenco utenti.' };
            }
            try {
                await this.avviaSync();
            } catch (e) {
                try { await signOut(this.auth); } catch (e2) { }
                return { ok: false, msg: 'Accesso verificato ma dati non raggiungibili (' + this.msgErrore(e) + '). Riprova tra poco.' };
            }
            Auth.utenteCorrente = { email: email.toLowerCase(), nome: dati.nome || email, ruolo: dati.ruolo || 'procuratore' };
            this.salvaUtente(email, { ultimoAccesso: Date.now() }).catch(() => {});
            Audit.registra(Auth.utenteCorrente, 'Accesso effettuato', 'utente', email.toLowerCase(), null, null);
            return { ok: true, mustChange: false };
        },

        // invia tramite il servizio email dedicato, se configurato
        async inviaTramiteServizio(email, tipo) {
            const url = window.RV_EMAIL_SERVICE_URL;
            if (!url) return null; // non configurato: si usa l'invio standard
            try {
                const r = await fetch(url, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, tipo })
                });
                if (!r.ok) return { ok: false, msg: 'Servizio email non disponibile (' + r.status + ').' };
                return { ok: true, viaEmail: true };
            } catch (e) {
                return { ok: false, msg: 'Servizio email non raggiungibile.' };
            }
        },

        /* prima password: crea l'account se manca (su una app secondaria,
           senza toccare la sessione corrente) e invia l'email con il
           collegamento per impostare la password */
        async primaPassword(email) {
            const { createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, getAuth } = this.fb.authMod;
            const { initializeApp, getApps, getApp } = this.fb.appMod;
            try {
                const nomeApp = 'rv-secondaria';
                const appSec = getApps().some(a => a.name === nomeApp) ? getApp(nomeApp) : initializeApp(window.RV_FIREBASE_CONFIG, nomeApp);
                const authSec = getAuth(appSec);
                try {
                    await createUserWithEmailAndPassword(authSec, email, generaPasswordTemporanea() + generaPasswordTemporanea());
                    await signOut(authSec);
                } catch (e) { /* account gia esistente: si prosegue con l'email */ }
                // l'account ora esiste: se c'e il servizio dedicato, invia da li
                const viaServizio = await this.inviaTramiteServizio(email, 'attivazione');
                if (viaServizio) return viaServizio;
                await sendPasswordResetEmail(this.auth, email);
                return { ok: true, viaEmail: true };
            } catch (e) {
                return { ok: false, msg: this.msgErrore(e) };
            }
        },

        async recuperaPassword(email) {
            try {
                const viaServizio = await this.inviaTramiteServizio(email, 'recupero');
                if (viaServizio) return viaServizio;
                await this.fb.authMod.sendPasswordResetEmail(this.auth, email);
                return { ok: true, viaEmail: true };
            } catch (e) { return { ok: false, msg: this.msgErrore(e) }; }
        },

        async cambiaPassword(email, nuova) {
            const controllo = Auth.validaPassword(nuova);
            if (controllo) return { ok: false, msg: controllo };
            try {
                await this.fb.authMod.updatePassword(this.auth.currentUser, nuova);
                return { ok: true };
            } catch (e) { return { ok: false, msg: this.msgErrore(e) }; }
        },

        esci() {
            this.fermaPresenza();
            this.sottoscrizioni.forEach(s => { try { s(); } catch (e) { } });
            this.sottoscrizioni = [];
            // invia subito le scritture ancora in coda prima di chiudere
            if (this._timerFlush) { clearTimeout(this._timerFlush); this._timerFlush = null; }
            this._flush();
            this.pronto = false;
            this._sync = null;
            // attende le scritture in corso (es. la voce "Uscita" del registro)
            const eseguiSignOut = () => { try { this.fb.authMod.signOut(this.auth); } catch (e) { } };
            try {
                this.fb.fsMod.waitForPendingWrites(this.db).then(eseguiSignOut, eseguiSignOut);
            } catch (e) { eseguiSignOut(); }
        },

        /* --- dati condivisi: un documento Firestore per archivio --- */
        _sync: null,
        avviaSync() {
            // memoizzata: chiamate concorrenti condividono la stessa promessa
            if (!this._sync) {
                this._sync = this._eseguiSync().catch(e => { this._sync = null; throw e; });
            }
            return this._sync;
        },
        async _eseguiSync() {
            if (this.pronto) return;
            const { doc, getDoc, setDoc, onSnapshot, serverTimestamp } = this.fb.fsMod;
            for (const chiave of Object.keys(this.DOC_SYNC)) {
                const rif = doc(this.db, 'archivio', this.DOC_SYNC[chiave]);
                const snap = await getDoc(rif);
                if (snap.exists() && typeof snap.data().json === 'string') {
                    localStorage.setItem(chiave, snap.data().json);
                } else {
                    // primo avvio del progetto: i dati locali fanno da base,
                    // ma gli incarichi dimostrativi non vengono caricati
                    let locale = localStorage.getItem(chiave);
                    if (locale && chiave === CHIAVI.incarichi) {
                        try {
                            const reali = JSON.parse(locale).filter(i => !(i.creato && i.creato.da === 'sistema (dati demo)'));
                            locale = reali.length ? JSON.stringify(reali) : null;
                        } catch (e) { locale = null; }
                    }
                    if (locale) await setDoc(rif, { json: locale, aggiornato: serverTimestamp(), da: 'bootstrap' });
                }
            }
            this.pronto = true;
            Object.keys(this.DOC_SYNC).forEach(chiave => {
                const rif = doc(this.db, 'archivio', this.DOC_SYNC[chiave]);
                const stacca = onSnapshot(rif, snap => {
                    if (!snap.exists()) return;
                    const json = snap.data().json;
                    if (typeof json === 'string' && json !== localStorage.getItem(chiave)) {
                        localStorage.setItem(chiave, json);
                        // niente ricarica dentro il wizard: si perderebbero i dati digitati
                        if (Auth.utenteCorrente && vistaCorrente !== 'wizard') naviga(vistaCorrente, parametriVista);
                    }
                }, () => { });
                this.sottoscrizioni.push(stacca);
            });
        },

        // sincronizzazione coalescente: scritture ripetute sulla stessa chiave
        // (es. una modifica di massa) vengono unite in un'unica scrittura del
        // valore finale, cosi non si esaurisce la coda di scritture di Firestore
        _pendenti: {},
        _timerFlush: null,
        _erroreMostrato: false,
        sincronizza(chiave, valore) {
            if (!this.attivo || !this.pronto || !this.DOC_SYNC || !this.DOC_SYNC[chiave]) return;
            this._pendenti[chiave] = JSON.stringify(valore);
            if (this._timerFlush) return;
            this._timerFlush = setTimeout(() => this._flush(), 400);
        },
        _flush() {
            this._timerFlush = null;
            const pendenti = this._pendenti;
            this._pendenti = {};
            if (!this.pronto) return;
            const { doc, setDoc, serverTimestamp } = this.fb.fsMod;
            const email = Auth.utenteCorrente ? Auth.utenteCorrente.email : 'sconosciuto';
            Object.keys(pendenti).forEach(chiave => {
                setDoc(doc(this.db, 'archivio', this.DOC_SYNC[chiave]), {
                    json: pendenti[chiave], aggiornato: serverTimestamp(), da: email
                }).catch(e => {
                    console.error('Sincronizzazione non riuscita (' + chiave + '):', e);
                    if (!this._erroreMostrato) {
                        this._erroreMostrato = true;
                        toast('Attenzione: salvataggio non condiviso, la modifica e rimasta solo su questo browser' +
                            (e && e.code === 'permission-denied' ? ' (utenza non piu abilitata?)' : '') + '.', 'rosso');
                        setTimeout(() => { this._erroreMostrato = false; }, 5000);
                    }
                });
            });
        },

        /* --- Presenza: mostra sempre gli utenti connessi ---
           Ogni scheda aggiorna il proprio "ultimoAccesso" a intervalli (heartbeat,
           l'unico campo che le regole consentono di aggiornare da soli) e ascolta
           l'intera collezione "utenti" in tempo reale: e "connesso" chi ha un
           battito negli ultimi ~2 minuti. Nessuna modifica alle regole Firestore. */
        _presenzaAvviata: false,
        _presenzaTimer: null,
        avviaPresenza() {
            if (!this.attivo || !this.pronto || this._presenzaAvviata) return;
            const email = Auth.utenteCorrente ? Auth.utenteCorrente.email : null;
            if (!email) return;
            this._presenzaAvviata = true;
            const { collection, onSnapshot } = this.fb.fsMod;
            const battito = () => { this.salvaUtente(email, { ultimoAccesso: Date.now() }).catch(() => { }); };
            battito(); // subito, poi ogni 45s
            this._presenzaTimer = setInterval(battito, 45000);
            const stacca = onSnapshot(collection(this.db, 'utenti'), snap => {
                const ora = Date.now();
                const connessi = [];
                snap.forEach(d => {
                    const u = d.data() || {};
                    if (u.attivo !== false && u.ultimoAccesso && (ora - u.ultimoAccesso) < 120000) {
                        connessi.push({ email: d.id, nome: u.nome || d.id });
                    }
                });
                connessi.sort((a, b) => a.nome.localeCompare(b.nome));
                aggiornaPresenza(connessi);
            }, () => { });
            this.sottoscrizioni.push(stacca);
        },
        fermaPresenza() {
            this._presenzaAvviata = false;
            if (this._presenzaTimer) { clearInterval(this._presenzaTimer); this._presenzaTimer = null; }
            aggiornaPresenza([]);
        },

        /* --- gestione utenti abilitati (Firestore, solo admin) --- */
        async listaUtenti() {
            const { collection, getDocs } = this.fb.fsMod;
            const snap = await getDocs(collection(this.db, 'utenti'));
            const out = [];
            snap.forEach(d => out.push({ email: d.id, ...d.data() }));
            return out.sort((a, b) => a.email.localeCompare(b.email));
        },
        async salvaUtente(email, dati) {
            const { doc, setDoc } = this.fb.fsMod;
            await setDoc(doc(this.db, 'utenti', email.toLowerCase()), dati, { merge: true });
        },

        msgErrore(e) {
            const codice = (e && e.code) || '';
            if (codice.includes('invalid-credential') || codice.includes('wrong-password') || codice.includes('user-not-found')) return 'Credenziali non valide.';
            if (codice.includes('too-many-requests')) return 'Troppi tentativi: riprova tra qualche minuto.';
            if (codice.includes('invalid-email')) return 'Indirizzo email non valido.';
            if (codice.includes('requires-recent-login')) return 'Per cambiare la password esegui di nuovo l\'accesso.';
            if (codice.includes('network')) return 'Problema di rete: riprova.';
            return 'Operazione non riuscita' + (codice ? ' (' + codice + ')' : '') + '.';
        }
    };

    /* =========================================================
       MODELLI PDF (le lettere di incarico originali, archiviate
       su Firestore a blocchi e usate per generare i PDF compilati)
    ========================================================= */
    const Modelli = {
        TIPI: { triennale: 'Revisione legale triennale', volontaria: 'Revisione limitata volontaria annuale' },
        _cache: {},

        _b64DaBytes(bytes) {
            let bin = '';
            for (let i = 0; i < bytes.length; i += 0x8000) {
                bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            }
            return btoa(bin);
        },
        _bytesDaB64(b64) {
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return bytes;
        },

        // id di un blocco: con versione (nuovo schema) o legacy (primo schema)
        _idChunk(tipo, versione, i) {
            return versione ? tipo + '_' + versione + '_' + i : tipo + '_' + i;
        },

        async carica(tipo, file) {
            if (!Cloud.attivo || !Cloud.pronto) throw new Error('I modelli PDF richiedono l\'accesso al cloud condiviso.');
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (bytes.length > 9 * 1024 * 1024) throw new Error('File troppo grande (massimo 9 MB).');
            const b64 = this._b64DaBytes(bytes);
            const DIM = 750000; // caratteri base64 per documento Firestore (limite 1 MB)
            const chunks = Math.ceil(b64.length / DIM);
            const { doc, setDoc, deleteDoc, serverTimestamp } = Cloud.fb.fsMod;
            const vecchioMeta = await this.info(tipo);
            // versione univoca: i blocchi nuovi non sovrascrivono i vecchi, quindi
            // un'interruzione a meta upload lascia intatto il modello attualmente valido
            const versione = 'v' + (vecchioMeta && vecchioMeta.versione ? (parseInt(String(vecchioMeta.versione).slice(1)) || 0) + 1 : 1) + '_' + uid().slice(-6);
            for (let i = 0; i < chunks; i++) {
                await setDoc(doc(Cloud.db, 'modelli', this._idChunk(tipo, versione, i)), { b64: b64.slice(i * DIM, (i + 1) * DIM) });
            }
            // il meta, scritto per ultimo, e cio che rende "attivo" il nuovo modello
            await setDoc(doc(Cloud.db, 'modelli', tipo + '_meta'), {
                nome: file.name, dimensione: bytes.length, chunks, versione,
                aggiornato: serverTimestamp(), da: Auth.utenteCorrente.email
            });
            this._cache[tipo] = { bytes, dimensione: bytes.length, versione };
            // solo ora si rimuovono i blocchi della versione precedente (orfani innocui se falliscono)
            if (vecchioMeta) {
                for (let i = 0; i < (vecchioMeta.chunks || 0); i++) {
                    try { await deleteDoc(doc(Cloud.db, 'modelli', this._idChunk(tipo, vecchioMeta.versione, i))); } catch (e) { }
                }
            }
            Audit.registra(Auth.utenteCorrente, 'Modello lettera caricato', 'sistema', tipo, null,
                Modelli.TIPI[tipo] + ': ' + file.name + ' (' + Math.round(bytes.length / 1024) + ' KB, ' + chunks + ' blocchi)');
        },

        async info(tipo) {
            if (!Cloud.attivo || !Cloud.pronto) return null;
            const { doc, getDoc } = Cloud.fb.fsMod;
            const snap = await getDoc(doc(Cloud.db, 'modelli', tipo + '_meta'));
            return snap.exists() ? snap.data() : null;
        },

        async leggi(tipo) {
            const meta = await this.info(tipo);
            if (!meta) return null;
            // la cache vale solo se il modello remoto non e stato sostituito
            const inCache = this._cache[tipo];
            if (inCache && inCache.dimensione === meta.dimensione && inCache.versione === meta.versione) return inCache.bytes;
            const { doc, getDoc } = Cloud.fb.fsMod;
            let b64 = '';
            for (let i = 0; i < meta.chunks; i++) {
                const snap = await getDoc(doc(Cloud.db, 'modelli', this._idChunk(tipo, meta.versione, i)));
                if (!snap.exists()) throw new Error('Modello incompleto su Firestore: ricaricalo da Dati e backup.');
                b64 += snap.data().b64;
            }
            const bytes = this._bytesDaB64(b64);
            if (bytes.length !== meta.dimensione) throw new Error('Modello non coerente su Firestore: ricaricalo da Dati e backup.');
            this._cache[tipo] = { bytes, dimensione: bytes.length, versione: meta.versione };
            return bytes;
        }
    };

    /* =========================================================
       CALCOLO COMPENSO (stessa logica del simulatore compensi)
    ========================================================= */
    const SETTORI = [
        { val: 1.0, nome: 'Produzione / Altro (standard)' },
        { val: 0.5, nome: 'Immobiliare (-50%)' },
        { val: 0.85, nome: 'Commerciale / Servizi (-15%)' },
        { val: 1.1, nome: 'Lavori su commessa (+10%)' }
    ];
    const RISCHI = [
        { val: 1.0, nome: 'Basso (standard)' },
        { val: 1.2, nome: 'Moderato (+20%)' },
        { val: 1.4, nome: 'Alto (+40%)' }
    ];

    function oreBaseDaMedia(media) {
        if (media <= 0) return 0;
        if (media <= 2000000) return 80;
        if (media <= 5000000) return 130;
        if (media <= 7000000) return 160;
        if (media <= 10000000) return 180;
        if (media <= 15000000) return 220;
        if (media <= 20000000) return 250;
        if (media <= 30000000) return 310;
        if (media <= 40000000) return 360;
        return 400;
    }

    function calcolaCompenso(p) {
        const attivo = p.attivo || 0, ricavi = p.ricavi || 0;
        const media = (attivo + ricavi) / 2;
        const oreBase = oreBaseDaMedia(media);
        const oltre50M = media > 50000000;
        const extra50 = oltre50M ? Math.max(0, Math.round(p.extra50 || 0)) : 0;
        const orePlus = Math.max(0, Math.round(p.orePlus || 0));
        const oreBaseEff = oreBase + orePlus + extra50;
        const oreCorrette = oreBaseEff * (p.moltSettore || 1) * (p.moltRischio || 1);
        const oreLegale = Math.ceil(oreCorrette);
        const extraRicorrenti = (p.hConsolidato || 0) + (p.hIfrs || 0) + (p.hIt || 0) + (p.hAltro || 0);
        const extraSoloAnno1 = (p.hVolontaria || 0) + (p.hPrimoAnno || 0);
        const oreAnno1 = oreLegale + extraRicorrenti + extraSoloAnno1;
        const oreAnni23 = oreLegale + extraRicorrenti;
        const tariffa = p.tariffa || 0;
        return {
            media, oreBase, oltre50M, extra50, orePlus, oreBaseEff, oreCorrette,
            oreLegale, extraRicorrenti, extraSoloAnno1, oreAnno1, oreAnni23, tariffa,
            compensoAnno1: oreAnno1 * tariffa,
            compensoAnni23: oreAnni23 * tariffa
        };
    }

    /* =========================================================
       INCARICHI
    ========================================================= */
    const Incarichi = {
        tutti() { return Store.leggi(CHIAVI.incarichi, []); },
        salva(lista) { Store.scrivi(CHIAVI.incarichi, lista); },
        trova(id) { return this.tutti().find(i => i.id === id) || null; },

        crea(dati, utente) {
            const lista = this.tutti();
            const nuovo = {
                id: uid(), stato: 'attivo', ...dati,
                creato: { da: utente.nome + ' <' + utente.email + '>', il: Date.now() },
                modificato: null
            };
            lista.push(nuovo);
            this.salva(lista);
            Audit.registra(utente, 'Nuovo incarico', 'incarico', nuovo.id, nuovo.cliente,
                Audit.confronta(null, nuovo, CAMPI_TRACCIATI));
            return nuovo;
        },

        aggiorna(id, dati, utente, azione) {
            const lista = this.tutti();
            const idx = lista.findIndex(i => i.id === id);
            if (idx < 0) return null;
            const prima = JSON.parse(JSON.stringify(lista[idx]));
            const dopo = { ...lista[idx], ...dati, modificato: { da: utente.nome + ' <' + utente.email + '>', il: Date.now() } };
            lista[idx] = dopo;
            this.salva(lista);
            const diff = Audit.confronta(prima, dopo, CAMPI_TRACCIATI);
            Audit.registra(utente, azione || 'Modifica incarico', 'incarico', id, dopo.cliente, diff.length ? diff : null);
            return dopo;
        },

        elimina(id, utente) {
            const lista = this.tutti();
            const inc = lista.find(i => i.id === id);
            if (!inc) return;
            this.salva(lista.filter(i => i.id !== id));
            Audit.registra(utente, 'Eliminazione incarico', 'incarico', id, inc.cliente, null);
        },

        // congela il calcolo del compenso: i valori concordati non cambiano piu
        congela(id, utente) {
            const lista = this.tutti();
            const idx = lista.findIndex(i => i.id === id);
            if (idx < 0) return null;
            lista[idx].calcoloCongelato = true;
            lista[idx].congelamento = { da: utente.nome + ' <' + utente.email + '>', il: Date.now() };
            this.salva(lista);
            Audit.registra(utente, 'Calcolo congelato', 'incarico', id, lista[idx].cliente,
                'Compenso e ore bloccati alla stampa del mandato');
            return lista[idx];
        },

        // sblocca il calcolo: richiede un messaggio di allerta al titolare
        scongela(id, utente, messaggio) {
            const lista = this.tutti();
            const idx = lista.findIndex(i => i.id === id);
            if (idx < 0) return null;
            const inc = lista[idx];
            inc.calcoloCongelato = false;
            inc.congelamento = null;
            this.salva(lista);
            Allerte.aggiungi({
                tipo: 'sblocco-calcolo', incaricoId: id, cliente: inc.cliente,
                da: utente.nome + ' <' + utente.email + '>', messaggio: messaggio
            });
            Audit.registra(utente, 'Allerta: sblocco calcolo congelato', 'incarico', id, inc.cliente,
                [{ campo: 'Messaggio di allerta', prima: '', dopo: messaggio }]);
            return inc;
        },

        statoScadenza(inc) {
            const fine = inc.rinnovo || inc.dataFine;
            if (inc.stato === 'cessato') return { classe: 'neutro', testo: 'Cessato' };
            if (!fine) return { classe: 'neutro', testo: 'Senza scadenza' };
            // valori non in formato data (note testuali) non sono confrontabili
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fine)) return { classe: 'neutro', testo: String(fine) };
            const oggi = oggiISO();
            if (fine < oggi) return { classe: 'rosso', testo: 'Scaduto ' + fmtData(fine) };
            // +6 mesi senza trabocco di fine mese (es. 31/08 -> 28/02, non 03/03)
            const seiMesi = new Date();
            const giornoOggi = seiMesi.getDate();
            seiMesi.setDate(1);
            seiMesi.setMonth(seiMesi.getMonth() + 6);
            seiMesi.setDate(Math.min(giornoOggi, new Date(seiMesi.getFullYear(), seiMesi.getMonth() + 1, 0).getDate()));
            const limite = seiMesi.getFullYear() + '-' + String(seiMesi.getMonth() + 1).padStart(2, '0') + '-' + String(seiMesi.getDate()).padStart(2, '0');
            if (fine <= limite) return { classe: 'ambra', testo: 'In scadenza ' + fmtData(fine) };
            return { classe: 'verde', testo: 'Attivo fino al ' + fmtData(fine) };
        },

        compensoAnno(inc, anno) {
            return (inc.compensi && inc.compensi[anno]) ? Number(inc.compensi[anno]) : 0;
        },

        anniConCompensi() {
            const anni = new Set();
            this.tutti().forEach(i => Object.keys(i.compensi || {}).forEach(a => anni.add(Number(a))));
            const lista = Array.from(anni).sort();
            return lista.length ? lista : [annoCorrente()];
        }
    };

    const TIPI = {
        legale: 'Revisione legale (triennale)',
        volontaria: 'Revisione volontaria (annuale)',
        collegio: 'Collegio sindacale',
        assistenza: 'Assistenza esterna'
    };

    /* Classe CSS e badge sicuri anche con valori di "tipo" arbitrari
       provenienti da un file importato */
    function classeTipo(tipo) {
        return Object.prototype.hasOwnProperty.call(TIPI, tipo) ? tipo : 'assistenza';
    }
    function nomeTipo(tipo, breve) {
        const nome = TIPI[tipo] || String(tipo || 'n.d.');
        return breve ? nome.split(' (')[0] : nome;
    }
    function badgeTipo(tipo) {
        return '<span class="badge ' + classeTipo(tipo) + '">' + esc(nomeTipo(tipo, true)) + '</span>';
    }

    /* =========================================================
       FATTURAZIONE
    ========================================================= */
    const Fatture = {
        stati() { return Store.leggi(CHIAVI.fatture, {}); },
        salvaStati(s) { Store.scrivi(CHIAVI.fatture, s); },

        /* Genera il piano rate di un incarico per un anno */
        rate(inc, anno) {
            const compenso = Incarichi.compensoAnno(inc, anno);
            if (!compenso) return [];
            const periodicita = inc.fatturazione || 'annuale';
            const n = periodicita === 'mensile' ? 12 : (periodicita === 'trimestrale' ? 4 : 1);
            const importoRata = Math.round((compenso / n) * 100) / 100;
            const out = [];
            for (let i = 1; i <= n; i++) {
                let mese;
                if (n === 12) mese = i;
                else if (n === 4) mese = i * 3;
                else mese = 12;
                let importo = importoRata;
                if (i === n) importo = Math.round((compenso - importoRata * (n - 1)) * 100) / 100;
                // la periodicita fa parte della chiave: cambiandola, gli stati
                // delle vecchie rate non si riattaccano a rate di importo diverso
                const chiave = inc.id + '|' + anno + '|' + periodicita + '|' + i;
                out.push({
                    chiave, incarico: inc, anno, numero: i, totale: n, mese,
                    scadenza: anno + '-' + String(mese).padStart(2, '0') + '-' + (n === 1 ? '31' : '28'),
                    importo, stato: this.stati()[chiave] || 'da emettere'
                });
            }
            return out;
        },

        tutteAnno(anno) {
            const out = [];
            Incarichi.tutti().forEach(inc => { out.push(...this.rate(inc, anno)); });
            return out.sort((a, b) => a.mese - b.mese || a.incarico.cliente.localeCompare(b.incarico.cliente));
        },

        cambiaStato(chiave, nuovo, utente, cliente) {
            const s = this.stati();
            const prima = s[chiave] || 'da emettere';
            s[chiave] = nuovo;
            this.salvaStati(s);
            Audit.registra(utente, 'Stato fattura aggiornato', 'fattura', chiave, cliente,
                [{ campo: 'Stato rata', prima, dopo: nuovo }]);
        }
    };

    /* =========================================================
       INTERFACCIA - infrastruttura
    ========================================================= */
    const $vista = () => document.getElementById('vista');

    function toast(msg, tipo) {
        const area = document.getElementById('toast-area');
        const el = document.createElement('div');
        el.className = 'toast' + (tipo ? ' ' + tipo : '');
        el.textContent = msg;
        area.appendChild(el);
        setTimeout(() => el.remove(), 4200);
    }

    /* Esegue un'azione mostrando SEMPRE il caricamento sul pulsante: spinner +
       testo, pulsante disabilitato, con guardia anti doppio-click. Ripristina
       tutto (anche in caso di errore) al termine. Un tempo minimo garantisce
       che lo spinner sia percepibile anche per le operazioni istantanee, cosi
       si capisce sempre quando l'app sta elaborando. */
    async function conAttesa(btn, fn, opts) {
        if (!btn) return typeof fn === 'function' ? fn() : undefined;
        if (btn.dataset.attesa === '1') return; // gia in corso: ignora il click
        const htmlOrig = btn.innerHTML;
        const testo = (opts && opts.testo) || btn.textContent || '';
        const minMs = opts && typeof opts.min === 'number' ? opts.min : 300;
        btn.dataset.attesa = '1';
        btn.classList.add('caricamento');
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>' + esc(testo) + '</span>';
        const avvio = performance.now();
        try {
            return await fn();
        } finally {
            const resta = minMs - (performance.now() - avvio);
            if (resta > 0) await new Promise(r => setTimeout(r, resta));
            delete btn.dataset.attesa;
            btn.classList.remove('caricamento');
            btn.disabled = false;
            btn.innerHTML = htmlOrig;
        }
    }

    /* Aggiunge una casella di ricerca sopra la prima tabella "dati" contenuta in
       scopeEl e filtra le righe per testo su TUTTE le colonne. Riusa lo stile
       .filtri/.campo gia presente; nessuna dipendenza dalla vista specifica. */
    function abilitaRicercaTabella(scopeEl, placeholder) {
        if (!scopeEl) return;
        const tabella = scopeEl.querySelector('table.dati');
        if (!tabella || !tabella.tBodies[0]) return;
        const ancora = tabella.closest('.tabella-wrap') || tabella;
        // evita doppioni se la funzione venisse richiamata sulla stessa tabella
        if (ancora.previousElementSibling && ancora.previousElementSibling.classList.contains('filtri')) return;
        const barra = document.createElement('div');
        barra.className = 'filtri';
        barra.innerHTML = '<div class="campo ricerca"><label>Cerca</label>'
            + '<input type="search" placeholder="' + esc(placeholder || 'Cerca in tabella...') + '"></div>'
            + '<div class="filtro-conteggio" aria-live="polite"></div>';
        ancora.parentElement.insertBefore(barra, ancora);
        const input = barra.querySelector('input');
        const conteggio = barra.querySelector('.filtro-conteggio');
        const applica = () => {
            const t = input.value.trim().toLowerCase();
            const righe = Array.from(tabella.tBodies[0].rows);
            let visibili = 0;
            righe.forEach(tr => {
                const ok = !t || tr.textContent.toLowerCase().includes(t);
                tr.style.display = ok ? '' : 'none';
                if (ok) visibili++;
            });
            conteggio.textContent = t ? (visibili + ' di ' + righe.length) : '';
        };
        input.addEventListener('input', applica);
        return applica;
    }

    function apriModale(html, opts) {
        const cont = document.getElementById('modale-contenitore');
        cont.innerHTML = '<div class="modale-sfondo"><div class="modale ' + ((opts && opts.classe) || '') + '">' + html + '</div></div>';
        cont.querySelector('.modale-sfondo').addEventListener('click', e => {
            if (e.target.classList.contains('modale-sfondo') && !(opts && opts.bloccante)) chiudiModale();
        });
        return cont;
    }
    function chiudiModale() { document.getElementById('modale-contenitore').innerHTML = ''; }

    /* Mostra nella sidebar gli utenti attualmente connessi (heartbeat recente). */
    function aggiornaPresenza(connessi) {
        const box = document.getElementById('presenza-box');
        if (!box) return;
        if (!connessi || !connessi.length) { box.innerHTML = ''; return; }
        const mio = Auth.utenteCorrente ? Auth.utenteCorrente.email : '';
        const voci = connessi.map(c => {
            const etichetta = c.nome + (c.email === mio ? ' (tu)' : '');
            return '<span class="presenza-utente"><span class="pallino"></span>' + esc(etichetta) + '</span>';
        }).join('');
        box.innerHTML = '<div class="presenza-titolo">Connessi ora · ' + connessi.length + '</div>' + voci;
    }

    /* =========================================================
       NAVIGAZIONE
    ========================================================= */
    const VOCI_NAV = [
        { id: 'dashboard', nome: 'Cruscotto', icona: 'M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z' },
        { id: 'incarichi', nome: 'Incarichi', icona: 'M4 6h16M4 12h16M4 18h10' },
        { id: 'fatturazione', nome: 'Fatturazione', icona: 'M9 14l2 2 4-4M5 3h14a1 1 0 011 1v16l-3-2-2 2-3-2-2 2-3-2-3 2V4a1 1 0 011-1z' },
        { id: 'report', nome: 'Report compensi', icona: 'M4 20V10m6 10V4m6 16v-7m4 7H2' },
        { id: 'persone', nome: 'Persone', icona: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
        { id: 'registro', nome: 'Registro modifiche', icona: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
        { id: 'utenti', nome: 'Utenti', icona: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m20 0v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M12 7a4 4 0 11-8 0 4 4 0 018 0z', soloAdmin: true },
        { id: 'dati', nome: 'Dati e backup', icona: 'M4 7c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2zm0 0v10c0 1.1 3.6 2 8 2s8-.9 8-2V7', soloProprietario: true }
    ];

    let vistaCorrente = 'dashboard';
    let parametriVista = null;

    function naviga(id, parametri) {
        vistaCorrente = id;
        parametriVista = parametri || null;
        disegnaNav();
        const viste = {
            dashboard: vistaDashboard,
            incarichi: vistaIncarichi,
            dettaglio: vistaDettaglio,
            wizard: vistaWizard,
            fatturazione: vistaFatturazione,
            report: vistaReport,
            persone: vistaPersone,
            registro: vistaRegistro,
            utenti: vistaUtenti,
            dati: vistaDati,
            lettera: vistaLettera
        };
        (viste[id] || vistaDashboard)();
        window.scrollTo(0, 0);
    }

    function disegnaNav() {
        const nav = document.getElementById('nav-principale');
        nav.innerHTML = VOCI_NAV
            .filter(v => (!v.soloAdmin || Auth.eAdmin()) && (!v.soloProprietario || Auth.eProprietario()))
            .map(v => '<button class="nav-voce' + (vistaCorrente === v.id ? ' attiva' : '') + '" data-vista="' + v.id + '">' +
                '<svg class="icona" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + v.icona + '"/></svg>' +
                esc(v.nome) + '</button>').join('');
        nav.querySelectorAll('.nav-voce').forEach(b =>
            b.addEventListener('click', () => { naviga(b.dataset.vista); chiudiMenuMobile(); }));
    }

    /* menu a comparsa su smartphone */
    function chiudiMenuMobile() {
        const sidebar = document.querySelector('.sidebar');
        const ham = document.getElementById('nav-hamburger');
        if (sidebar) sidebar.classList.remove('menu-aperto');
        if (ham) ham.setAttribute('aria-expanded', 'false');
    }
    function collegaHamburger() {
        const ham = document.getElementById('nav-hamburger');
        if (!ham || ham._collegato) return;
        ham._collegato = true;
        ham.addEventListener('click', () => {
            const sidebar = document.querySelector('.sidebar');
            const aperto = sidebar.classList.toggle('menu-aperto');
            ham.setAttribute('aria-expanded', aperto ? 'true' : 'false');
        });
    }

    /* =========================================================
       VISTA: CRUSCOTTO
    ========================================================= */
    function vistaDashboard() {
        const incarichi = Incarichi.tutti();
        const anno = annoCorrente();
        const attivi = incarichi.filter(i => i.stato !== 'cessato');
        const totAnno = incarichi.reduce((s, i) => s + Incarichi.compensoAnno(i, anno), 0);
        const totPrec = incarichi.reduce((s, i) => s + Incarichi.compensoAnno(i, anno - 1), 0);
        const delta = totPrec ? ((totAnno - totPrec) / totPrec * 100) : null;
        const inScadenza = attivi.filter(i => Incarichi.statoScadenza(i).classe === 'ambra');
        const scaduti = attivi.filter(i => Incarichi.statoScadenza(i).classe === 'rosso');
        const volontarie = attivi.filter(i => i.tipo === 'volontaria').length;
        // allerte di sblocco calcolo: visibili solo al titolare
        const allerte = Auth.eProprietario() ? Allerte.attive() : [];

        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Cruscotto</h1>
                    <p class="descrizione">Quadro generale degli incarichi di revisione e dei compensi.</p>
                </div>
                <div class="header-azioni">
                    <button class="btn btn-primary" id="btn-nuovo-incarico">+ Nuovo incarico</button>
                </div>
            </header>
            ${allerte.length ? `<div class="card" style="border-left:4px solid var(--rosso);">
                <h2>⚠ Allerte (${allerte.length})</h2>
                ${allerte.slice(0, 20).map(a => `<div class="storia-voce" style="border-left-color:var(--rosso);">
                    <div class="quando">${fmtDataOra(a.ts)}</div>
                    <div><span class="chi">${esc(a.da || '')}</span> ha sbloccato il calcolo di <strong>${esc(a.cliente || '')}</strong></div>
                    <div class="campi">"${esc(a.messaggio || '')}"</div>
                    <button class="btn btn-sm btn-ghost a-letta" data-id="${esc(a.id)}" style="margin-top:4px;">Segna come letta</button>
                </div>`).join('')}
            </div>` : ''}
            <div class="kpi-griglia">
                <div class="kpi"><div class="etichetta">Incarichi attivi</div><div class="valore">${attivi.length}</div><div class="nota">${volontarie} volontari, ${attivi.length - volontarie} altri</div></div>
                <div class="kpi verde"><div class="etichetta">Compensi ${anno}</div><div class="valore">${eurFmt.format(totAnno)}</div><div class="nota">${delta == null ? 'nessun confronto disponibile' : (delta >= 0 ? '+' : '') + delta.toFixed(1) + '% rispetto al ' + (anno - 1)}</div></div>
                <div class="kpi ambra"><div class="etichetta">In scadenza (6 mesi)</div><div class="valore">${inScadenza.length}</div><div class="nota">da rinnovare o chiudere</div></div>
                <div class="kpi rosso"><div class="etichetta">Scaduti</div><div class="valore">${scaduti.length}</div><div class="nota">verifica rinnovo o cessazione</div></div>
            </div>
            <div class="card">
                <h2>Andamento compensi per anno</h2>
                <div class="grafico-wrap"><canvas id="grafico-trend" height="260"></canvas></div>
            </div>
            <div class="card">
                <h2>Incarichi in scadenza o scaduti</h2>
                ${tabellaScadenze(scaduti.concat(inScadenza))}
            </div>`;

        document.getElementById('btn-nuovo-incarico').addEventListener('click', () => naviga('wizard', { modalita: 'nuovo' }));
        $vista().querySelectorAll('.a-letta').forEach(b =>
            b.addEventListener('click', () => { Allerte.segnaLetta(b.dataset.id); vistaDashboard(); }));
        $vista().querySelectorAll('[data-apri]').forEach(r =>
            r.addEventListener('click', () => naviga('dettaglio', { id: r.dataset.apri })));
        $vista().querySelectorAll('[data-rinnova]').forEach(b =>
            b.addEventListener('click', e => {
                e.stopPropagation();
                naviga('wizard', { modalita: 'rinnovo', id: b.dataset.rinnova });
            }));
        disegnaGraficoTrend('grafico-trend');
    }

    function tabellaScadenze(lista) {
        if (!lista.length) return '<p class="tabella-vuota">Nessun incarico in scadenza nei prossimi sei mesi.</p>';
        const puoRinnovare = Auth.puoModificare();
        return `<div class="tabella-wrap"><table class="dati a-schede"><thead><tr>
            <th>Cliente</th><th>Tipo</th><th>Scadenza</th><th>Resp. incarico</th><th>Qualita</th><th>Stato</th>${puoRinnovare ? '<th></th>' : ''}
        </tr></thead><tbody>` + lista.map(i => {
            const s = Incarichi.statoScadenza(i);
            return `<tr class="cliccabile" data-apri="${esc(i.id)}">
                <td class="cliente-cella" data-label="Cliente">${esc(i.cliente)}</td>
                <td data-label="Tipo">${badgeTipo(i.tipo)}</td>
                <td data-label="Scadenza">${esc(fmtData(i.rinnovo || i.dataFine))}</td>
                <td data-label="Resp. incarico">${esc(i.respIncarico || '')}</td>
                <td data-label="Qualita">${esc(i.qualita || '')}</td>
                <td data-label="Stato"><span class="badge ${s.classe}">${esc(s.testo)}</span></td>
                ${puoRinnovare ? `<td data-label=""><button class="btn btn-sm btn-secondary" data-rinnova="${esc(i.id)}">Rinnova</button></td>` : ''}
            </tr>`;
        }).join('') + '</tbody></table></div>';
    }

    /* =========================================================
       VISTA: ELENCO INCARICHI
    ========================================================= */
    const filtriIncarichi = { testo: '', tipo: '', area: '', qualita: '', resp: '', stato: '', ordina: 'cliente', verso: 1 };

    function annoRiferimento() {
        const anni = Incarichi.anniConCompensi();
        return Math.min(Math.max(annoCorrente(), anni[0]), anni[anni.length - 1]);
    }

    /* Unione tra roster e valori presenti negli incarichi (anche importati) */
    function valoriPresenti(campo, base) {
        const presenti = Incarichi.tutti().map(i => i[campo]).filter(Boolean);
        return Array.from(new Set((base || []).concat(presenti))).sort();
    }

    function vistaIncarichi() {
        const annoRif = annoRiferimento();
        const listaAree = valoriPresenti('area', RV_ROSTER.aree);
        const listaQualita = valoriPresenti('qualita', Persone.attive('qualita'));
        const listaResp = valoriPresenti('respIncarico', Persone.attive('respIncarico'));

        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Incarichi</h1>
                    <p class="descrizione">Elenco completo degli incarichi con team, scadenze e compensi. Fai clic su una riga per aprire il dettaglio.</p>
                </div>
                <div class="header-azioni">
                    <button class="btn btn-secondary" id="btn-esporta-csv">Esporta CSV</button>
                    <button class="btn btn-primary" id="btn-nuovo-incarico">+ Nuovo incarico</button>
                </div>
            </header>
            <div class="filtri">
                <div class="campo ricerca"><label>Ricerca</label><input type="text" id="f-testo" placeholder="Cliente, codice fiscale, localita..." value="${esc(filtriIncarichi.testo)}"></div>
                <div class="campo"><label>Tipo</label><select id="f-tipo">
                    <option value="">Tutti</option>
                    ${Object.keys(TIPI).map(t => `<option value="${t}" ${filtriIncarichi.tipo === t ? 'selected' : ''}>${esc(TIPI[t])}</option>`).join('')}
                </select></div>
                <div class="campo"><label>Area</label><select id="f-area">
                    <option value="">Tutte</option>
                    ${listaAree.map(a => `<option ${filtriIncarichi.area === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
                </select></div>
                <div class="campo"><label>Qualita</label><select id="f-qualita">
                    <option value="">Tutti</option>
                    ${listaQualita.map(q => `<option ${filtriIncarichi.qualita === q ? 'selected' : ''}>${esc(q)}</option>`).join('')}
                </select></div>
                <div class="campo"><label>Resp. incarico</label><select id="f-resp">
                    <option value="">Tutti</option>
                    ${listaResp.map(q => `<option ${filtriIncarichi.resp === q ? 'selected' : ''}>${esc(q)}</option>`).join('')}
                </select></div>
                <div class="campo"><label>Stato</label><select id="f-stato">
                    <option value="">Tutti</option>
                    <option value="attivo" ${filtriIncarichi.stato === 'attivo' ? 'selected' : ''}>Attivi</option>
                    <option value="scadenza" ${filtriIncarichi.stato === 'scadenza' ? 'selected' : ''}>In scadenza</option>
                    <option value="scaduto" ${filtriIncarichi.stato === 'scaduto' ? 'selected' : ''}>Scaduti</option>
                    <option value="cessato" ${filtriIncarichi.stato === 'cessato' ? 'selected' : ''}>Cessati</option>
                </select></div>
            </div>
            <div id="contenitore-tabella"></div>`;

        const aggiorna = () => {
            filtriIncarichi.testo = document.getElementById('f-testo').value;
            filtriIncarichi.tipo = document.getElementById('f-tipo').value;
            filtriIncarichi.area = document.getElementById('f-area').value;
            filtriIncarichi.qualita = document.getElementById('f-qualita').value;
            filtriIncarichi.resp = document.getElementById('f-resp').value;
            filtriIncarichi.stato = document.getElementById('f-stato').value;
            disegnaTabellaIncarichi(annoRif);
        };
        ['f-testo', 'f-tipo', 'f-area', 'f-qualita', 'f-resp', 'f-stato'].forEach(id =>
            document.getElementById(id).addEventListener('input', aggiorna));
        document.getElementById('btn-nuovo-incarico').addEventListener('click', () => naviga('wizard', { modalita: 'nuovo' }));
        document.getElementById('btn-esporta-csv').addEventListener('click', esportaCsvIncarichi);
        disegnaTabellaIncarichi(annoRif);
    }

    function incarichiFiltrati(annoRif) {
        const f = filtriIncarichi;
        if (!annoRif) annoRif = annoRiferimento();
        let lista = Incarichi.tutti();
        if (f.testo) {
            const t = f.testo.toLowerCase();
            lista = lista.filter(i =>
                (i.cliente || '').toLowerCase().includes(t) ||
                (i.codiceFiscale || '').toLowerCase().includes(t) ||
                (i.localita || '').toLowerCase().includes(t) ||
                (i.regione || '').toLowerCase().includes(t) ||
                (i.referente || '').toLowerCase().includes(t) ||
                (i.team || '').toLowerCase().includes(t));
        }
        if (f.tipo) lista = lista.filter(i => i.tipo === f.tipo);
        if (f.area) lista = lista.filter(i => i.area === f.area);
        if (f.qualita) lista = lista.filter(i => i.qualita === f.qualita);
        if (f.resp) lista = lista.filter(i => i.respIncarico === f.resp);
        if (f.stato) {
            lista = lista.filter(i => {
                const s = Incarichi.statoScadenza(i);
                // "neutro" su un incarico non cessato significa "senza scadenza": e attivo
                if (f.stato === 'attivo') return i.stato !== 'cessato' && (s.classe === 'verde' || s.classe === 'neutro');
                if (f.stato === 'scadenza') return s.classe === 'ambra';
                if (f.stato === 'scaduto') return s.classe === 'rosso';
                if (f.stato === 'cessato') return i.stato === 'cessato';
                return true;
            });
        }
        const chiave = f.ordina, verso = f.verso;
        lista.sort((a, b) => {
            let va, vb;
            if (chiave === 'compenso') { va = Incarichi.compensoAnno(a, annoRif); vb = Incarichi.compensoAnno(b, annoRif); }
            else if (chiave === 'scadenza') { va = a.rinnovo || a.dataFine || ''; vb = b.rinnovo || b.dataFine || ''; }
            else { va = (a[chiave] || '').toString().toLowerCase(); vb = (b[chiave] || '').toString().toLowerCase(); }
            return (va < vb ? -1 : va > vb ? 1 : 0) * verso;
        });
        return lista;
    }

    function disegnaTabellaIncarichi(annoRif) {
        const lista = incarichiFiltrati(annoRif);
        const cont = document.getElementById('contenitore-tabella');
        if (!lista.length) {
            cont.innerHTML = '<div class="card tabella-vuota">Nessun incarico corrisponde ai filtri.</div>';
            return;
        }
        const totale = lista.reduce((s, i) => s + Incarichi.compensoAnno(i, annoRif), 0);
        const colonne = [
            { chiave: 'cliente', nome: 'Cliente' },
            { chiave: 'tipo', nome: 'Tipo' },
            { chiave: 'dataInizio', nome: 'Inizio' },
            { chiave: 'dataFine', nome: 'Fine' },
            { chiave: 'area', nome: 'Area' },
            { chiave: 'qualita', nome: 'Qualita' },
            { chiave: 'respIncarico', nome: 'Resp. incarico' },
            { chiave: 'team', nome: 'Team' },
            { chiave: 'compenso', nome: 'Compenso ' + annoRif, num: true },
            { chiave: 'scadenza', nome: 'Stato' }
        ];
        const puoRinnovare = Auth.puoModificare();
        cont.innerHTML = `<div class="tabella-wrap"><table class="dati a-schede"><thead><tr>` +
            colonne.map(c => `<th class="${c.num ? 'num' : ''}" data-ordina="${c.chiave}">${c.nome}${filtriIncarichi.ordina === c.chiave ? (filtriIncarichi.verso > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('') +
            (puoRinnovare ? '<th></th>' : '') +
            `</tr></thead><tbody>` +
            lista.map(i => {
                const s = Incarichi.statoScadenza(i);
                return `<tr class="cliccabile" data-apri="${esc(i.id)}">
                    <td class="cliente-cella" data-label="Cliente">${esc(i.cliente)}</td>
                    <td data-label="Tipo">${badgeTipo(i.tipo)}</td>
                    <td data-label="Inizio">${i.dataInizio ? esc(fmtData(i.dataInizio)) : esc(i.dataInizioNote || '')}</td>
                    <td data-label="Fine">${esc(fmtData(i.rinnovo || i.dataFine))}</td>
                    <td data-label="Area">${esc(i.area || '')}</td>
                    <td data-label="Qualita">${esc(i.qualita || '')}</td>
                    <td data-label="Resp. incarico">${esc(i.respIncarico || '')}</td>
                    <td data-label="Team">${esc(i.team || '')}</td>
                    <td class="num" data-label="Compenso ${annoRif}">${Incarichi.compensoAnno(i, annoRif) ? eurFmt.format(Incarichi.compensoAnno(i, annoRif)) : ''}</td>
                    <td data-label="Stato"><span class="badge ${s.classe}">${esc(s.testo)}</span></td>
                    ${puoRinnovare ? `<td data-label=""><button class="btn btn-sm btn-secondary" data-rinnova="${esc(i.id)}">Rinnova</button></td>` : ''}
                </tr>`;
            }).join('') +
            `</tbody><tfoot><tr><td colspan="8">Totale (${lista.length} incarichi)</td><td class="num">${eurFmt.format(totale)}</td><td></td>${puoRinnovare ? '<td></td>' : ''}</tr></tfoot></table></div>`;

        cont.querySelectorAll('[data-apri]').forEach(r =>
            r.addEventListener('click', () => naviga('dettaglio', { id: r.dataset.apri })));
        cont.querySelectorAll('[data-rinnova]').forEach(b =>
            b.addEventListener('click', e => {
                e.stopPropagation();
                naviga('wizard', { modalita: 'rinnovo', id: b.dataset.rinnova });
            }));
        cont.querySelectorAll('th[data-ordina]').forEach(th =>
            th.addEventListener('click', () => {
                const c = th.dataset.ordina;
                if (filtriIncarichi.ordina === c) filtriIncarichi.verso *= -1;
                else { filtriIncarichi.ordina = c; filtriIncarichi.verso = 1; }
                disegnaTabellaIncarichi(annoRif);
            }));
    }

    function esportaCsvIncarichi() {
        const anni = Incarichi.anniConCompensi();
        const righe = [['Cliente', 'Tipo', 'Codice fiscale', 'Data inizio', 'Data fine', 'Rinnovo', 'Area', 'Regione', 'Localita', 'Qualita', 'Resp. incarico', 'Referente', 'Team', 'Fatturazione', 'Stato'].concat(anni.map(String))];
        incarichiFiltrati(annoRiferimento()).forEach(i => {
            righe.push([
                i.cliente, nomeTipo(i.tipo), i.codiceFiscale || '', i.dataInizio || i.dataInizioNote || '', i.dataFine || '',
                i.rinnovo || '', i.area || '', i.regione || '', i.localita || '', i.qualita || '', i.respIncarico || '',
                i.referente || '', i.team || '', i.fatturazione || '', i.stato || ''
            ].concat(anni.map(a => Incarichi.compensoAnno(i, a) || '')));
        });
        const csv = righe.map(r => r.map(v => {
            let s = String(v).replace(/"/g, '""');
            // evita l'interpretazione come formula in Excel
            if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
            return '"' + s + '"';
        }).join(';')).join('\r\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'incarichi_' + oggiISO() + '.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        Audit.registra(Auth.utenteCorrente, 'Esportazione CSV incarichi', 'sistema', null, null, null);
    }

    /* =========================================================
       VISTA: DETTAGLIO INCARICO
    ========================================================= */
    function vistaDettaglio() {
        const inc = Incarichi.trova(parametriVista && parametriVista.id);
        if (!inc) { naviga('incarichi'); return; }
        const s = Incarichi.statoScadenza(inc);
        const anni = Object.keys(inc.compensi || {}).map(Number).sort();
        const storia = Store.leggi(CHIAVI.audit, []).filter(v => v.rif === inc.id);

        $vista().innerHTML = `
            <header>
                <div>
                    <h1>${esc(inc.cliente)}</h1>
                    <p class="descrizione">
                        <span class="badge ${classeTipo(inc.tipo)}">${esc(nomeTipo(inc.tipo))}</span>
                        <span class="badge ${s.classe}">${esc(s.testo)}</span>
                        ${inc.calcoloCongelato ? '<span class="badge ambra">🔒 Calcolo congelato</span>' : ''}
                    </p>
                </div>
                <div class="header-azioni">
                    <button class="btn btn-ghost" id="btn-indietro">&larr; Elenco</button>
                    ${Auth.puoModificare() ? `
                        <button class="btn btn-secondary" id="btn-modifica">Modifica</button>
                        <button class="btn btn-secondary" id="btn-rinnova">Rinnova</button>
                        ${inc.calcoloCongelato ? '<button class="btn btn-secondary" id="btn-sblocca">Sblocca calcolo</button>' : ''}
                        ${inc.tipo === 'legale' || inc.tipo === 'volontaria' ? '<button class="btn btn-primary" id="btn-lettera">Lettera di incarico</button>' : ''}
                    ` : ''}
                </div>
            </header>
            ${inc.calcoloCongelato ? `<div class="card" style="border-left:4px solid var(--oro);">
                <p class="descrizione" style="margin:0;">🔒 Il calcolo del compenso e congelato${inc.congelamento && inc.congelamento.il ? ' dal ' + fmtDataOra(inc.congelamento.il) : ''}. Per modificarlo, usa "Sblocca calcolo": verra inviato un messaggio di allerta al titolare.</p>
            </div>` : ''}
            <div class="dettaglio-griglia">
                <div>
                    <div class="card">
                        <h2>Dati incarico</h2>
                        <div class="riepilogo-blocco">
                            <h4>Cliente</h4>
                            ${rigaRiepilogo('Ragione sociale', inc.cliente)}
                            ${rigaRiepilogo('Codice fiscale', inc.codiceFiscale)}
                            ${rigaRiepilogo('Regione', inc.regione)}
                            ${rigaRiepilogo('Localita', inc.localita)}
                            ${rigaRiepilogo('Email', [inc.email1, inc.email2].filter(Boolean).join(', '))}
                        </div>
                        <div class="riepilogo-blocco">
                            <h4>Durata</h4>
                            ${rigaRiepilogo('Tipo', TIPI[inc.tipo] || inc.tipo)}
                            ${rigaRiepilogo('Presenza in MEF', inc.presenzaMef)}
                            ${rigaRiepilogo('Data inizio', inc.dataInizio ? fmtData(inc.dataInizio) : inc.dataInizioNote)}
                            ${rigaRiepilogo('Data fine', fmtData(inc.dataFine) || inc.dataFineNote)}
                            ${rigaRiepilogo('Rinnovo', inc.rinnovo ? fmtData(inc.rinnovo) : inc.rinnovoNote)}
                            ${rigaRiepilogo('Stato', inc.stato + (inc.statoNote ? ' (' + inc.statoNote + ')' : ''))}
                        </div>
                        <div class="riepilogo-blocco">
                            <h4>Team</h4>
                            ${rigaRiepilogo('Responsabile incarico', inc.respIncarico)}
                            ${rigaRiepilogo('Responsabile qualita', inc.qualita)}
                            ${rigaRiepilogo('Referente', inc.referente)}
                            ${rigaRiepilogo('Team di revisione', inc.team)}
                            ${rigaRiepilogo('Area', inc.area)}
                        </div>
                    </div>
                    <div class="card">
                        <h2>Compensi annui e fatturazione</h2>
                        <p class="descrizione" style="margin-bottom:12px;">Periodicita di fatturazione: <strong>${esc(inc.fatturazione || 'annuale')}</strong></p>
                        ${anni.length ? `<div class="tabella-wrap"><table class="dati"><thead><tr><th>Esercizio</th><th class="num">Compenso annuo</th><th class="num">Rate</th><th class="num">Importo rata</th></tr></thead><tbody>` +
                            anni.map(a => {
                                const rate = Fatture.rate(inc, a);
                                return `<tr><td>${a}</td><td class="num">${eurFmt.format(Incarichi.compensoAnno(inc, a))}</td><td class="num">${rate.length}</td><td class="num">${rate.length ? eurFmt2.format(rate[0].importo) : ''}</td></tr>`;
                            }).join('') + '</tbody></table></div>' : '<p class="tabella-vuota">Nessun compenso registrato.</p>'}
                        ${inc.calc ? `<div class="calc-riquadro">
                            <strong>Ultimo calcolo del compenso</strong>
                            <div class="calc-riga"><span>Media dimensionale</span><span class="val">${eurFmt.format(inc.calc.media || 0)}</span></div>
                            <div class="calc-riga"><span>Ore finali (anno 1)</span><span class="val">${numFmt.format(inc.calc.oreAnno1 || 0)} h</span></div>
                            <div class="calc-riga"><span>Tariffa oraria</span><span class="val">${eurFmt.format(inc.calc.tariffa || 0)}</span></div>
                        </div>` : ''}
                    </div>
                </div>
                <div>
                    <div class="card">
                        <h2>Storia delle modifiche</h2>
                        ${storia.length ? storia.map(v => `<div class="storia-voce">
                            <div class="quando">${fmtDataOra(v.ts)}</div>
                            <div><span class="chi">${esc(v.utente)}</span> - ${esc(v.azione)}</div>
                            ${Array.isArray(v.dettagli) ? '<ul class="campi">' + v.dettagli.map(d => '<li>' + esc(d.campo) + ': ' + esc(troncaTesto(d.prima, 40)) + ' → ' + esc(troncaTesto(d.dopo, 40)) + '</li>').join('') + '</ul>' : (v.dettagli ? '<div class="campi">' + esc(v.dettagli) + '</div>' : '')}
                        </div>`).join('') : '<p class="tabella-vuota">Nessuna modifica registrata.</p>'}
                        ${inc.creato ? `<div class="storia-voce"><div class="quando">${fmtDataOra(inc.creato.il)}</div><div>Creato da <span class="chi">${esc(inc.creato.da)}</span></div></div>` : ''}
                    </div>
                    ${Auth.eAdmin() ? `<div class="card">
                        <h2>Zona amministratore</h2>
                        <button class="btn btn-danger btn-sm" id="btn-elimina">Elimina incarico</button>
                    </div>` : ''}
                </div>
            </div>`;

        document.getElementById('btn-indietro').addEventListener('click', () => naviga('incarichi'));
        if (Auth.puoModificare()) {
            document.getElementById('btn-modifica').addEventListener('click', () => naviga('wizard', { modalita: 'modifica', id: inc.id }));
            document.getElementById('btn-rinnova').addEventListener('click', () => naviga('wizard', { modalita: 'rinnovo', id: inc.id }));
            const btnLettera = document.getElementById('btn-lettera');
            if (btnLettera) btnLettera.addEventListener('click', () => naviga('lettera', { id: inc.id }));
            const btnSblocca = document.getElementById('btn-sblocca');
            if (btnSblocca) btnSblocca.addEventListener('click', () => modaleSblocco(inc));
        }
        const btnElimina = document.getElementById('btn-elimina');
        if (btnElimina) btnElimina.addEventListener('click', () => {
            apriModale(`<h2>Eliminare l'incarico?</h2>
                <p>Stai per eliminare l'incarico <strong>${esc(inc.cliente)}</strong>. L'operazione viene tracciata nel registro modifiche.</p>
                <div class="modale-azioni">
                    <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                    <button class="btn btn-danger" id="m-conferma">Elimina</button>
                </div>`);
            document.getElementById('m-annulla').addEventListener('click', chiudiModale);
            document.getElementById('m-conferma').addEventListener('click', () => {
                Incarichi.elimina(inc.id, Auth.utenteCorrente);
                chiudiModale();
                toast('Incarico eliminato.', 'verde');
                naviga('incarichi');
            });
        });
    }

    // sblocco del calcolo: obbliga a comporre un messaggio di allerta
    function modaleSblocco(inc) {
        apriModale(`<h2>Sbloccare il calcolo?</h2>
            <p class="descrizione" style="margin-bottom:12px;">Il calcolo di <strong>${esc(inc.cliente)}</strong> e congelato. Per sbloccarlo devi inviare un messaggio di allerta al titolare dello studio, spiegando il motivo. Lo sblocco e la motivazione restano nel registro.</p>
            <div class="campo"><label>Motivo dello sblocco (messaggio di allerta) *</label><textarea id="m-sblocco-msg" placeholder="Es. rinegoziazione del compenso concordata con il cliente il ..."></textarea></div>
            <div class="msg-errore hidden" id="m-sblocco-err"></div>
            <div class="modale-azioni">
                <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                <button class="btn btn-danger" id="m-conferma">Invia allerta e sblocca</button>
            </div>`);
        document.getElementById('m-annulla').addEventListener('click', chiudiModale);
        document.getElementById('m-conferma').addEventListener('click', () => {
            const msg = document.getElementById('m-sblocco-msg').value.trim();
            const err = document.getElementById('m-sblocco-err');
            if (msg.length < 5) { err.textContent = 'Scrivi il motivo dello sblocco (almeno 5 caratteri).'; err.classList.remove('hidden'); return; }
            Incarichi.scongela(inc.id, Auth.utenteCorrente, msg);
            chiudiModale();
            toast('Calcolo sbloccato. Allerta inviata al titolare.', 'verde');
            naviga('dettaglio', { id: inc.id });
        });
    }

    function rigaRiepilogo(etichetta, valore) {
        if (valore == null || valore === '') return '';
        return `<div class="riepilogo-riga"><span class="etichetta">${esc(etichetta)}</span><span class="valore">${esc(valore)}</span></div>`;
    }
    function troncaTesto(t, n) {
        t = String(t);
        return t.length > n ? t.slice(0, n - 1) + '…' : t;
    }

    /* =========================================================
       VISTA: WIZARD nuovo / modifica / rinnovo
    ========================================================= */
    let wizard = null;

    function vistaWizard() {
        const modalita = (parametriVista && parametriVista.modalita) || 'nuovo';
        const esistente = parametriVista && parametriVista.id ? Incarichi.trova(parametriVista.id) : null;
        if ((modalita === 'modifica' || modalita === 'rinnovo') && !esistente) { naviga('incarichi'); return; }

        const annoBase = annoCorrente();
        wizard = {
            modalita, idEsistente: esistente ? esistente.id : null, passo: 1,
            dati: esistente ? JSON.parse(JSON.stringify(esistente)) : {
                cliente: '', tipo: 'legale', codiceFiscale: '', area: 'Nord', regione: 'Lombardia', localita: '',
                email1: '', email2: '', qualita: '', respIncarico: '', referente: '', team: '',
                fatturazione: fatturazionePredefinita('legale'), compensi: {}, stato: 'attivo'
            },
            // su un incarico esistente la fatturazione salvata e una scelta
            // deliberata: il cambio di tipo non deve sovrascriverla
            fatturazioneToccata: modalita !== 'nuovo',
            esercizio: annoBase,
            calc: (esistente && esistente.calc) ? { ...esistente.calc } : {
                attivo: 0, ricavi: 0, moltSettore: 1.0, moltRischio: 1.2, rischioNote: '',
                orePlus: 0, extra50: 0, hConsolidato: 0, hIfrs: 0, hIt: 0, hAltro: 0, altroNote: '',
                hVolontaria: 0, hPrimoAnno: 0, tariffa: 85
            },
            compensoManuale: false,
            compensoManualeValore: 0,
            // finche' l'utente non tocca il passo 3, in modifica i compensi
            // per anno esistenti vengono conservati cosi' come sono
            compensoModificato: modalita !== 'modifica'
        };
        const anniEsistenti = esistente ? Object.keys(esistente.compensi || {}).map(Number).sort((a, b) => a - b) : [];
        if (modalita === 'rinnovo') {
            // il rinnovo parte dall'esercizio successivo all'ultimo coperto;
            // la data di nomina proposta e' la vecchia scadenza (assemblea di rinnovo)
            wizard.esercizio = anniEsistenti.length ? anniEsistenti[anniEsistenti.length - 1] + 1 : annoBase;
            wizard.dati.compensi = { ...esistente.compensi };
            wizard.dati.dataInizio = esistente.rinnovo || esistente.dataFine || null;
            wizard.dati.dataFine = null;
            // il nuovo periodo e un accordo nuovo: il calcolo riparte sbloccato
            wizard.dati.calcoloCongelato = false;
            wizard.dati.congelamento = null;
        } else if (modalita === 'modifica') {
            // esercizio di riferimento: il periodo piu' recente coperto dai compensi
            if (anniEsistenti.length) {
                const ultimo = anniEsistenti[anniEsistenti.length - 1];
                wizard.esercizio = esistente.tipo === 'legale' ? Math.max(ultimo - 2, anniEsistenti[0]) : ultimo;
            } else if (esistente.dataInizio) {
                wizard.esercizio = Number(esistente.dataInizio.slice(0, 4)) || annoBase;
            }
            // se il calcolo non e' ricostruibile ma esiste un compenso, viene
            // proposto come valore manuale (cosi' il passo 3 non blocca)
            const proposto = Math.round(calcolaCompenso(wizard.calc).compensoAnno1);
            const compEsistente = anniEsistenti.length ? Number(esistente.compensi[anniEsistenti[anniEsistenti.length - 1]]) : 0;
            if (proposto <= 0 && compEsistente > 0) {
                wizard.compensoManuale = true;
                wizard.compensoManualeValore = compEsistente;
            }
        }
        disegnaWizard();
    }

    const PASSI_WIZARD = ['Cliente', 'Incarico e durata', 'Compenso', 'Team', 'Fatturazione', 'Riepilogo'];

    function disegnaWizard() {
        const w = wizard;
        const titoli = { nuovo: 'Nuovo incarico', modifica: 'Modifica incarico', rinnovo: 'Rinnovo incarico' };
        $vista().innerHTML = `
            <header>
                <div>
                    <h1>${titoli[w.modalita]}${w.modalita !== 'nuovo' ? ': ' + esc(w.dati.cliente) : ''}</h1>
                    <p class="descrizione">${w.modalita === 'rinnovo' ? 'La revisione legale si rinnova per un nuovo triennio con compenso annuale. La revisione volontaria si rinnova di anno in anno.' : 'Compila i passaggi. Il compenso viene proposto con il metodo della pagina sulla revisione legale (ore CNDCEC per tariffa oraria).'}</p>
                </div>
                <div class="header-azioni"><button class="btn btn-ghost" id="btn-annulla-wizard">Annulla</button></div>
            </header>
            <div class="wizard-passi">
                ${PASSI_WIZARD.map((p, i) => `<div class="wizard-passo ${w.passo === i + 1 ? 'attivo' : (w.passo > i + 1 ? 'fatto' : '')}"><span class="n">${i + 1}</span>${p}</div>`).join('')}
            </div>
            <div class="card" id="wizard-corpo"></div>
            <div style="display:flex; justify-content:space-between;">
                <button class="btn btn-secondary" id="btn-passo-prec" ${w.passo === 1 ? 'disabled' : ''}>&larr; Indietro</button>
                <button class="btn btn-primary" id="btn-passo-succ">${w.passo === 6 ? 'Salva incarico' : 'Avanti →'}</button>
            </div>`;

        document.getElementById('btn-annulla-wizard').addEventListener('click', () =>
            w.idEsistente ? naviga('dettaglio', { id: w.idEsistente }) : naviga('incarichi'));
        document.getElementById('btn-passo-prec').addEventListener('click', () => { salvaPassoCorrente(); w.passo--; disegnaWizard(); });
        document.getElementById('btn-passo-succ').addEventListener('click', () => {
            if (!salvaPassoCorrente(true)) return;
            if (w.passo === 6) { concludiWizard(); return; }
            w.passo++;
            disegnaWizard();
        });
        disegnaPassoWizard();
    }

    function disegnaPassoWizard() {
        const w = wizard, d = w.dati, corpo = document.getElementById('wizard-corpo');
        if (w.passo === 1) {
            corpo.innerHTML = `
                <h2>Dati del cliente</h2>
                <div class="griglia-2">
                    <div class="campo"><label>Ragione sociale *</label><input id="w-cliente" value="${esc(d.cliente)}"></div>
                    <div class="campo"><label>Codice fiscale / P. IVA</label><input id="w-cf" value="${esc(d.codiceFiscale || '')}"></div>
                    <div class="campo"><label>Regione</label><select id="w-regione">${d.regione && !RV_ROSTER.regioni.includes(d.regione) ? `<option selected>${esc(d.regione)}</option>` : ''}${RV_ROSTER.regioni.map(r => `<option ${d.regione === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
                    <div class="campo"><label>Localita</label><input id="w-localita" value="${esc(d.localita || '')}"></div>
                    <div class="campo"><label>Email di riferimento</label><input id="w-email1" type="email" value="${esc(d.email1 || '')}"></div>
                    <div class="campo"><label>Seconda email</label><input id="w-email2" type="email" value="${esc(d.email2 || '')}"></div>
                    <div class="campo"><label>Area</label><select id="w-area">${d.area && !RV_ROSTER.aree.includes(d.area) ? `<option selected>${esc(d.area)}</option>` : ''}${RV_ROSTER.aree.map(a => `<option ${d.area === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
                </div>`;
        } else if (w.passo === 2) {
            const bloccaTipo = w.modalita === 'rinnovo';
            // se il calcolo e congelato, tipo ed esercizio non si spostano
            // (cambierebbero gli anni coperti dai compensi bloccati)
            const bloccaPeriodo = w.modalita === 'modifica' && d.calcoloCongelato;
            corpo.innerHTML = `
                <h2>Tipo di incarico e durata</h2>
                <div class="griglia-2">
                    <div class="campo"><label>Tipo *</label>
                        <select id="w-tipo" ${bloccaTipo || bloccaPeriodo ? 'disabled' : ''}>
                            ${Object.keys(TIPI).map(t => `<option value="${t}" ${d.tipo === t ? 'selected' : ''}>${TIPI[t]}</option>`).join('')}
                        </select>
                        <div class="hint">${bloccaPeriodo ? 'Calcolo congelato: per cambiare tipo o periodo sblocca prima il calcolo dal dettaglio.' : 'La revisione legale dura tre esercizi con compenso annuale. La revisione volontaria dura un esercizio.'}</div>
                    </div>
                    <div class="campo"><label>${w.modalita === 'rinnovo' ? 'Primo esercizio del nuovo periodo' : 'Primo esercizio'} *</label>
                        <input id="w-esercizio" type="number" min="2000" max="2100" value="${w.esercizio}" ${bloccaPeriodo ? 'disabled' : ''}>
                        <div class="hint" id="w-esercizi-hint"></div>
                    </div>
                    <div class="campo"><label>Data inizio (nomina)</label><input id="w-inizio" type="date" value="${esc(d.dataInizio || '')}"></div>
                    <div class="campo"><label>Data fine (approvazione ultimo bilancio)</label><input id="w-fine" type="date" value="${esc(d.dataFine || '')}"></div>
                </div>`;
            const aggiornaHint = () => {
                const tipo = document.getElementById('w-tipo').value;
                const e = Number(document.getElementById('w-esercizio').value) || annoCorrente();
                const hint = document.getElementById('w-esercizi-hint');
                if (tipo === 'legale') hint.textContent = 'Esercizi coperti: ' + e + ', ' + (e + 1) + ', ' + (e + 2) + '. Scadenza suggerita: 30/04/' + (e + 3) + '.';
                else if (tipo === 'volontaria') hint.textContent = 'Esercizio coperto: ' + e + '. Scadenza suggerita: 30/04/' + (e + 1) + '.';
                else hint.textContent = '';
                const fine = document.getElementById('w-fine');
                if (!fine.value || fine.dataset.auto === '1') {
                    fine.value = tipo === 'legale' ? (e + 3) + '-04-30' : (tipo === 'volontaria' ? (e + 1) + '-04-30' : fine.value);
                    fine.dataset.auto = '1';
                }
            };
            document.getElementById('w-tipo').addEventListener('change', () => {
                aggiornaHint();
                // se l'utente non ha scelto a mano la fatturazione, applica lo standard del tipo
                if (!w.fatturazioneToccata) d.fatturazione = fatturazionePredefinita(document.getElementById('w-tipo').value);
            });
            document.getElementById('w-esercizio').addEventListener('input', aggiornaHint);
            document.getElementById('w-fine').addEventListener('input', e => { e.target.dataset.auto = '0'; });
            if (w.modalita === 'rinnovo' || w.modalita === 'nuovo') aggiornaHint();
        } else if (w.passo === 3) {
            disegnaPassoCalcolo(corpo);
        } else if (w.passo === 4) {
            const teamSel = dividiNomi(d.team);
            // i valori importati fuori roster restano selezionabili
            const opzioni = (lista, corrente) => {
                const extra = corrente && !lista.includes(corrente) ? `<option selected>${esc(corrente)}</option>` : '';
                return extra + lista.map(r => `<option ${corrente === r ? 'selected' : ''}>${esc(r)}</option>`).join('');
            };
            const teamCompleto = Array.from(new Set(Persone.attive('team').concat(teamSel))).sort();
            corpo.innerHTML = `
                <h2>Team di revisione</h2>
                <p class="descrizione" style="margin-bottom:12px;">I nominativi si gestiscono dalla vista Persone.</p>
                <div class="griglia-3">
                    <div class="campo"><label>Responsabile incarico *</label>
                        <select id="w-resp"><option value="">Seleziona</option>${opzioni(Persone.attive('respIncarico'), d.respIncarico)}</select>
                    </div>
                    <div class="campo"><label>Responsabile qualita *</label>
                        <select id="w-qualita"><option value="">Seleziona</option>${opzioni(Persone.attive('qualita'), d.qualita)}</select>
                        <div class="msg-errore hidden" id="w-qualita-errore"></div>
                    </div>
                    <div class="campo"><label>Referente</label>
                        <select id="w-referente"><option value="">Seleziona</option>${opzioni(Persone.attive('team'), d.referente)}</select>
                    </div>
                </div>
                <div class="campo"><label>Team di revisione (seleziona uno o piu componenti)</label>
                    <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:4px; max-height:220px; overflow-y:auto; border:1px solid var(--grigio-200); border-radius:8px; padding:10px;">
                        ${teamCompleto.map(t => `<label style="font-weight:400; font-size:0.85rem; display:flex; gap:6px; align-items:center;"><input type="checkbox" class="w-team-check" value="${esc(t)}" ${teamSel.includes(t) ? 'checked' : ''}>${esc(t)}</label>`).join('')}
                    </div>
                    <div class="hint">Componenti selezionati: <span id="w-team-conteggio">${teamSel.length}</span></div>
                </div>`;
            corpo.querySelectorAll('.w-team-check').forEach(c => c.addEventListener('change', () => {
                document.getElementById('w-team-conteggio').textContent = corpo.querySelectorAll('.w-team-check:checked').length;
            }));
        } else if (w.passo === 5) {
            const mappa = compensiRisultanti();
            const compenso = mappa[anniEsercizi()[0]] || 0;
            corpo.innerHTML = `
                <h2>Fatturazione</h2>
                <div class="campo"><label>Periodicita di fatturazione *</label>
                    <select id="w-fatturazione">
                        <option value="annuale" ${d.fatturazione === 'annuale' ? 'selected' : ''}>Annuale (rata unica)</option>
                        <option value="trimestrale" ${d.fatturazione === 'trimestrale' ? 'selected' : ''}>Trimestrale (4 rate)</option>
                        <option value="mensile" ${d.fatturazione === 'mensile' ? 'selected' : ''}>Mensile (12 rate)</option>
                    </select>
                    <div class="hint">Predefinita per ${esc(nomeTipo(d.tipo))}: ${esc(fatturazionePredefinita(d.tipo))}.</div>
                </div>
                <div class="calc-riquadro" id="w-anteprima-rate"></div>`;
            const anteprima = () => {
                const per = document.getElementById('w-fatturazione').value;
                const n = per === 'mensile' ? 12 : (per === 'trimestrale' ? 4 : 1);
                document.getElementById('w-anteprima-rate').innerHTML =
                    `<div class="calc-riga"><span>Compenso primo esercizio</span><span class="val">${eurFmt.format(compenso)}</span></div>
                     <div class="calc-riga"><span>Numero rate per esercizio</span><span class="val">${n}</span></div>
                     <div class="calc-riga totale"><span>Importo rata (primo esercizio)</span><span class="val">${eurFmt2.format(compenso / n)}</span></div>`;
            };
            document.getElementById('w-fatturazione').addEventListener('change', () => { w.fatturazioneToccata = true; anteprima(); });
            anteprima();
        } else if (w.passo === 6) {
            const anni = anniEsercizi();
            const mappa = compensiRisultanti();
            corpo.innerHTML = `
                <h2>Riepilogo</h2>
                <div class="riepilogo-blocco"><h4>Cliente</h4>
                    ${rigaRiepilogo('Ragione sociale', d.cliente)}
                    ${rigaRiepilogo('Codice fiscale', d.codiceFiscale)}
                    ${rigaRiepilogo('Sede', [d.localita, d.regione].filter(Boolean).join(', '))}
                </div>
                <div class="riepilogo-blocco"><h4>Incarico</h4>
                    ${rigaRiepilogo('Tipo', TIPI[d.tipo])}
                    ${rigaRiepilogo('Esercizi', anni.join(', '))}
                    ${rigaRiepilogo('Periodo', (d.dataInizio ? fmtData(d.dataInizio) : '') + ' - ' + (d.dataFine ? fmtData(d.dataFine) : ''))}
                </div>
                <div class="riepilogo-blocco"><h4>Team</h4>
                    ${rigaRiepilogo('Responsabile incarico', d.respIncarico)}
                    ${rigaRiepilogo('Responsabile qualita', d.qualita)}
                    ${rigaRiepilogo('Referente', d.referente)}
                    ${rigaRiepilogo('Team', d.team)}
                </div>
                <div class="riepilogo-blocco"><h4>Compenso e fatturazione</h4>
                    ${anni.map(a => rigaRiepilogo('Esercizio ' + a, eurFmt.format(mappa[a] || 0))).join('')}
                    ${rigaRiepilogo('Fatturazione', d.fatturazione)}
                    ${w.modalita === 'modifica' && !w.compensoModificato ? '<p class="hint" style="font-size:0.78rem; color:var(--grigio-600); margin-top:6px;">Il passo 3 non e stato modificato: i compensi esistenti restano invariati.</p>' : ''}
                </div>
                <p class="descrizione">Salvando, la modifica viene registrata nel registro con il tuo nome (${esc(Auth.utenteCorrente.nome)}).</p>`;
        }
    }

    function disegnaPassoCalcolo(corpo) {
        const w = wizard, c = w.calc;
        // se il calcolo e congelato (solo in modifica): sola lettura
        if (w.modalita === 'modifica' && w.dati.calcoloCongelato) {
            const cong = w.dati.congelamento || {};
            const compenso = w.dati.compensi && w.dati.compensi[anniEsercizi()[0]];
            corpo.innerHTML = `
                <h2>Calcolo del compenso</h2>
                <div class="calc-riquadro" style="border-color:var(--ambra); background:var(--ambra-bg);">
                    <strong>🔒 Calcolo congelato</strong>
                    <p class="descrizione" style="margin:8px 0;">Il calcolo di questo incarico e stato congelato${cong.il ? ' il ' + fmtDataOra(cong.il) : ''}${cong.da ? ' da ' + esc(cong.da) : ''}. Il compenso concordato non puo essere modificato.</p>
                    <div class="calc-riga totale"><span>Compenso concordato (primo esercizio)</span><span class="val">${compenso ? eurFmt.format(compenso) : '—'}</span></div>
                </div>
                <p class="descrizione">Per modificare il calcolo occorre prima sbloccarlo dal dettaglio dell'incarico, inviando un messaggio di allerta al titolare.</p>`;
            w.compensoModificato = false;
            return;
        }
        corpo.innerHTML = `
            <h2>Calcolo del compenso</h2>
            <p class="descrizione" style="margin-bottom:14px;">Metodo della pagina sulla revisione legale: media dimensionale, ore base CNDCEC, correttivi di settore e rischio, tariffa oraria.</p>
            <div class="griglia-2">
                <div class="campo"><label>Totale attivo patrimoniale</label><input id="c-attivo" inputmode="numeric" value="${c.attivo ? numFmt.format(c.attivo) : ''}" placeholder="es. 5.000.000"></div>
                <div class="campo"><label>Ricavi delle vendite</label><input id="c-ricavi" inputmode="numeric" value="${c.ricavi ? numFmt.format(c.ricavi) : ''}" placeholder="es. 8.000.000"></div>
                <div class="campo"><label>Settore di attivita</label><select id="c-settore">${SETTORI.map(s => `<option value="${s.val}" ${c.moltSettore === s.val ? 'selected' : ''}>${s.nome}</option>`).join('')}</select></div>
                <div class="campo"><label>Rischio incarico</label><select id="c-rischio">${RISCHI.map(s => `<option value="${s.val}" ${c.moltRischio === s.val ? 'selected' : ''}>${s.nome}</option>`).join('')}</select></div>
                <div class="campo"><label>Aumento manuale ore base</label><input id="c-oreplus" type="number" min="0" value="${c.orePlus || 0}"></div>
                <div class="campo hidden" id="c-extra50-box"><label>Ore extra oltre 50 milioni</label><input id="c-extra50" type="number" min="0" value="${c.extra50 || 0}"><div class="hint" id="c-extra50-hint"></div></div>
            </div>
            <h3>Ore extra per casistiche</h3>
            <div class="griglia-3">
                <div class="campo"><label>Consolidato (ricorrente)</label><input id="c-consolidato" type="number" min="0" value="${c.hConsolidato || 0}"></div>
                <div class="campo"><label>IFRS / principi particolari</label><input id="c-ifrs" type="number" min="0" value="${c.hIfrs || 0}"></div>
                <div class="campo"><label>Sistemi IT / Data Analytics</label><input id="c-it" type="number" min="0" value="${c.hIt || 0}"></div>
                <div class="campo"><label>Altro (ricorrente)</label><input id="c-altro" type="number" min="0" value="${c.hAltro || 0}"></div>
                <div class="campo"><label>Rev. volontaria anno prec. (solo anno 1)</label><input id="c-volontaria" type="number" min="0" value="${c.hVolontaria || 0}"></div>
                <div class="campo"><label>Primo anno / subentro (solo anno 1)</label><input id="c-primoanno" type="number" min="0" value="${c.hPrimoAnno || 0}"></div>
            </div>
            <div class="griglia-2">
                <div class="campo"><label>Tariffa oraria media</label><input id="c-tariffa" type="number" min="0" value="${c.tariffa || 85}"><div class="hint">Tariffa media ponderata del team (partner, manager, senior, junior).</div></div>
                <div class="campo"><label>Note sul rischio</label><input id="c-note" value="${esc(c.rischioNote || '')}" placeholder="es. governance, contenziosi, sistemi IT"></div>
            </div>
            <div class="calc-riquadro" id="c-risultato"></div>
            <div class="campo" style="margin-top:10px;">
                <label style="display:flex; align-items:center; gap:8px; font-weight:600;">
                    <input type="checkbox" id="c-manuale" ${w.compensoManuale ? 'checked' : ''} style="width:auto;"> Imposta il compenso annuo manualmente
                </label>
                <input id="c-compenso-manuale" inputmode="numeric" class="${w.compensoManuale ? '' : 'hidden'}" value="${w.compensoManualeValore ? numFmt.format(w.compensoManualeValore) : ''}" placeholder="es. 8.500" style="margin-top:8px;">
            </div>`;

        const ricalcola = () => {
            leggiCampiCalcolo();
            const r = calcolaCompenso(w.calc);
            const box = document.getElementById('c-extra50-box');
            box.classList.toggle('hidden', !r.oltre50M);
            if (r.oltre50M) document.getElementById('c-extra50-hint').textContent =
                'Media oltre 50 milioni: consiglio orientativo +' + Math.round(r.oreCorrette * 0.10) + ' / +' + Math.round(r.oreCorrette * 0.20) + ' ore.';
            const volontaria = wizard.dati.tipo === 'volontaria';
            document.getElementById('c-risultato').innerHTML = `
                <div class="calc-riga"><span>Media dimensionale</span><span class="val">${eurFmt.format(r.media)}</span></div>
                <div class="calc-riga"><span>Ore base CNDCEC</span><span class="val">${numFmt.format(r.oreBase)} h</span></div>
                <div class="calc-riga"><span>Ore base effettive</span><span class="val">${numFmt.format(r.oreBaseEff)} h</span></div>
                <div class="calc-riga"><span>Ore corrette (settore ${w.calc.moltSettore} - rischio ${w.calc.moltRischio})</span><span class="val">${numFmt.format(r.oreLegale)} h</span></div>
                <div class="calc-riga"><span>Ore anno 1 (con extra)</span><span class="val">${numFmt.format(r.oreAnno1)} h</span></div>
                ${volontaria ? '' : `<div class="calc-riga"><span>Ore anni 2 e 3</span><span class="val">${numFmt.format(r.oreAnni23)} h</span></div>`}
                <div class="calc-riga totale"><span>Compenso annuo proposto</span><span class="val">${eurFmt.format(r.compensoAnno1)}</span></div>
                ${volontaria ? '' : `<div class="calc-riga"><span>Compenso anni 2 e 3</span><span class="val">${eurFmt.format(r.compensoAnni23)}</span></div>`}`;
        };
        ['c-attivo', 'c-ricavi', 'c-settore', 'c-rischio', 'c-oreplus', 'c-extra50', 'c-consolidato', 'c-ifrs', 'c-it', 'c-altro', 'c-volontaria', 'c-primoanno', 'c-tariffa', 'c-note'].forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener('input', () => { wizard.compensoModificato = true; ricalcola(); });
        });
        document.getElementById('c-manuale').addEventListener('change', e => {
            wizard.compensoManuale = e.target.checked;
            wizard.compensoModificato = true;
            document.getElementById('c-compenso-manuale').classList.toggle('hidden', !e.target.checked);
        });
        document.getElementById('c-compenso-manuale').addEventListener('input', () => { wizard.compensoModificato = true; });
        ricalcola();
    }

    function leggiCampiCalcolo() {
        const c = wizard.calc;
        c.attivo = parseImporto(document.getElementById('c-attivo').value);
        c.ricavi = parseImporto(document.getElementById('c-ricavi').value);
        c.moltSettore = parseFloat(document.getElementById('c-settore').value);
        c.moltRischio = parseFloat(document.getElementById('c-rischio').value);
        c.orePlus = Number(document.getElementById('c-oreplus').value) || 0;
        c.extra50 = Number(document.getElementById('c-extra50').value) || 0;
        c.hConsolidato = Number(document.getElementById('c-consolidato').value) || 0;
        c.hIfrs = Number(document.getElementById('c-ifrs').value) || 0;
        c.hIt = Number(document.getElementById('c-it').value) || 0;
        c.hAltro = Number(document.getElementById('c-altro').value) || 0;
        c.hVolontaria = Number(document.getElementById('c-volontaria').value) || 0;
        c.hPrimoAnno = Number(document.getElementById('c-primoanno').value) || 0;
        c.tariffa = Number(document.getElementById('c-tariffa').value) || 0;
        c.rischioNote = document.getElementById('c-note').value;
        wizard.compensoManualeValore = parseImporto(document.getElementById('c-compenso-manuale').value);
    }

    function compensoAnnuoCorrente() {
        const w = wizard;
        if (w.compensoManuale && w.compensoManualeValore > 0) return w.compensoManualeValore;
        const r = calcolaCompenso(w.calc);
        return Math.round(r.compensoAnno1);
    }

    function anniEsercizi() {
        const w = wizard;
        const e = Number(w.esercizio) || annoCorrente();
        return w.dati.tipo === 'legale' ? [e, e + 1, e + 2] : [e];
    }

    /* Compensi che verranno effettivamente salvati, anno per anno:
       - in modifica senza interventi sul passo 3 restano i valori esistenti;
       - con compenso manuale, lo stesso importo su tutti gli esercizi;
       - altrimenti anno 1 con le ore una tantum, anni 2-3 a regime. */
    function compensiRisultanti() {
        const w = wizard;
        const anni = anniEsercizi();
        const r = calcolaCompenso(w.calc);
        const manuale = w.compensoManuale && w.compensoManualeValore > 0;
        // calcolo congelato: si conservano SOLO i compensi gia concordati,
        // senza fabbricarne di nuovi per anni non coperti
        const congelato = w.modalita === 'modifica' && w.dati.calcoloCongelato;
        const mappa = {};
        anni.forEach((a, idx) => {
            if (!w.compensoModificato && w.dati.compensi && w.dati.compensi[a] != null) {
                mappa[a] = Number(w.dati.compensi[a]);
            } else if (congelato) {
                // non concordato: resta fuori dalla mappa (nessun compenso inventato)
            } else if (manuale) {
                mappa[a] = w.compensoManualeValore;
            } else {
                mappa[a] = Math.round(idx === 0 ? r.compensoAnno1 : r.compensoAnni23);
            }
        });
        return mappa;
    }

    function salvaPassoCorrente(valida) {
        const w = wizard, d = w.dati;
        if (w.passo === 1) {
            d.cliente = document.getElementById('w-cliente').value.trim();
            d.codiceFiscale = document.getElementById('w-cf').value.trim();
            d.regione = document.getElementById('w-regione').value;
            d.localita = document.getElementById('w-localita').value.trim().toUpperCase();
            d.email1 = document.getElementById('w-email1').value.trim();
            d.email2 = document.getElementById('w-email2').value.trim();
            d.area = document.getElementById('w-area').value;
            if (valida && !d.cliente) { toast('Inserisci la ragione sociale.', 'rosso'); return false; }
        } else if (w.passo === 2) {
            d.tipo = document.getElementById('w-tipo').value;
            w.esercizio = Number(document.getElementById('w-esercizio').value) || annoCorrente();
            d.dataInizio = document.getElementById('w-inizio').value || null;
            d.dataFine = document.getElementById('w-fine').value || null;
            if (valida && !w.esercizio) { toast('Indica il primo esercizio.', 'rosso'); return false; }
        } else if (w.passo === 3) {
            // calcolo congelato in modifica: nessuna lettura, i compensi restano
            if (!(w.modalita === 'modifica' && d.calcoloCongelato)) {
                leggiCampiCalcolo();
                if (valida) {
                    const mappa = compensiRisultanti();
                    if (Object.values(mappa).some(v => !v || v <= 0)) { toast('Il compenso annuo deve essere maggiore di zero: inserisci attivo e ricavi oppure imposta il compenso manualmente.', 'rosso'); return false; }
                }
            }
        } else if (w.passo === 4) {
            d.respIncarico = document.getElementById('w-resp').value;
            d.qualita = document.getElementById('w-qualita').value;
            d.referente = document.getElementById('w-referente').value;
            d.team = Array.from(document.querySelectorAll('.w-team-check:checked')).map(c => c.value).join(', ');
            if (valida) {
                if (!d.respIncarico || !d.qualita) { toast('Indica responsabile incarico e responsabile qualita.', 'rosso'); return false; }
                if (d.respIncarico === d.qualita) {
                    const err = document.getElementById('w-qualita-errore');
                    // per nuovi incarichi e rinnovi la separazione e obbligatoria;
                    // in modifica di dati preesistenti viene solo segnalata
                    if (w.modalita === 'modifica') {
                        err.textContent = 'Attenzione: il responsabile della qualita coincide con il responsabile dell\'incarico (dato preesistente, valuta di separare i ruoli).';
                        err.classList.remove('hidden');
                    } else {
                        err.textContent = 'Il responsabile della qualita deve essere diverso dal responsabile dell\'incarico.';
                        err.classList.remove('hidden');
                        return false;
                    }
                }
            }
        } else if (w.passo === 5) {
            d.fatturazione = document.getElementById('w-fatturazione').value;
        }
        return true;
    }

    function concludiWizard() {
        const w = wizard, d = w.dati;
        const anni = anniEsercizi();
        const mappa = compensiRisultanti();
        if (w.modalita === 'rinnovo') {
            anni.forEach(a => { d.compensi[a] = mappa[a]; });
        } else {
            const nuovi = {};
            // in modifica conserva gli anni gia presenti fuori dal periodo corrente
            Object.keys(d.compensi || {}).forEach(a => { if (!anni.includes(Number(a))) nuovi[a] = d.compensi[a]; });
            anni.forEach(a => { nuovi[a] = mappa[a]; });
            d.compensi = nuovi;
        }
        const r = calcolaCompenso(w.calc);
        d.calc = { ...w.calc, media: r.media, oreAnno1: r.oreAnno1, oreAnni23: r.oreAnni23, compensoAnno1: mappa[anni[0]] };
        // il periodo corrente dell'incarico, usato dalla lettera
        d.esercizioPeriodo = anni[0];

        const haLettera = d.tipo === 'legale' || d.tipo === 'volontaria';
        if (w.modalita === 'rinnovo') {
            d.rinnovo = d.dataFine;
            const agg = Incarichi.aggiorna(w.idEsistente, d, Auth.utenteCorrente, 'Rinnovo incarico');
            toast(haLettera ? 'Incarico rinnovato. Ora puoi stampare la lettera di incarico.' : 'Incarico rinnovato.', 'verde');
            naviga(haLettera ? 'lettera' : 'dettaglio', { id: agg.id });
        } else if (w.modalita === 'modifica') {
            Incarichi.aggiorna(w.idEsistente, d, Auth.utenteCorrente, 'Modifica incarico');
            toast('Incarico aggiornato.', 'verde');
            naviga('dettaglio', { id: w.idEsistente });
        } else {
            const nuovo = Incarichi.crea(d, Auth.utenteCorrente);
            toast(haLettera ? 'Incarico creato. Ora puoi stampare la lettera di incarico.' : 'Incarico creato.', 'verde');
            naviga(haLettera ? 'lettera' : 'dettaglio', { id: nuovo.id });
        }
    }

    /* =========================================================
       VISTA: FATTURAZIONE
    ========================================================= */
    let annoFatturazione = null;

    function vistaFatturazione() {
        const anni = Incarichi.anniConCompensi();
        if (!annoFatturazione || !anni.includes(annoFatturazione)) {
            annoFatturazione = anni.includes(annoCorrente()) ? annoCorrente() : anni[anni.length - 1];
        }
        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Riepilogo fatturazioni</h1>
                    <p class="descrizione">Piano delle rate per esercizio in base alla periodicita di ogni incarico (annuale, trimestrale o mensile).</p>
                </div>
                <div class="header-azioni">
                    <div class="campo" style="margin:0;"><label>Esercizio</label>
                        <select id="f-anno">${anni.map(a => `<option ${a === annoFatturazione ? 'selected' : ''}>${a}</option>`).join('')}</select>
                    </div>
                </div>
            </header>
            <div id="fatturazione-corpo"></div>`;
        document.getElementById('f-anno').addEventListener('change', e => {
            annoFatturazione = Number(e.target.value);
            disegnaFatturazione();
        });
        disegnaFatturazione();
    }

    function disegnaFatturazione() {
        const anno = annoFatturazione;
        const rate = Fatture.tutteAnno(anno);
        const corpo = document.getElementById('fatturazione-corpo');
        if (!rate.length) {
            corpo.innerHTML = '<div class="card tabella-vuota">Nessun compenso registrato per l\'esercizio ' + anno + '.</div>';
            return;
        }
        const totale = rate.reduce((s, r) => s + r.importo, 0);
        const emesse = rate.filter(r => r.stato !== 'da emettere');
        const incassate = rate.filter(r => r.stato === 'incassata');
        const perMese = {};
        rate.forEach(r => { perMese[r.mese] = (perMese[r.mese] || 0) + r.importo; });
        const mesi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

        corpo.innerHTML = `
            <div class="kpi-griglia">
                <div class="kpi"><div class="etichetta">Da fatturare ${anno}</div><div class="valore">${eurFmt.format(totale)}</div><div class="nota">${rate.length} rate totali</div></div>
                <div class="kpi verde"><div class="etichetta">Rate emesse</div><div class="valore">${emesse.length} / ${rate.length}</div><div class="nota">${eurFmt.format(emesse.reduce((s, r) => s + r.importo, 0))}</div></div>
                <div class="kpi ambra"><div class="etichetta">Rate incassate</div><div class="valore">${incassate.length}</div><div class="nota">${eurFmt.format(incassate.reduce((s, r) => s + r.importo, 0))}</div></div>
            </div>
            <div class="card">
                <h2>Distribuzione per mese</h2>
                <div class="grafico-wrap"><canvas id="grafico-mesi" height="200"></canvas></div>
            </div>
            <div class="card">
                <h2>Dettaglio rate ${anno}</h2>
                <div class="tabella-wrap"><table class="dati a-schede"><thead><tr>
                    <th>Cliente</th><th>Periodicita</th><th>Rata</th><th>Mese</th><th class="num">Importo</th><th>Stato</th>${Auth.puoModificare() ? '<th></th>' : ''}
                </tr></thead><tbody>` +
            rate.map(r => `<tr>
                    <td class="cliente-cella" data-label="Cliente">${esc(r.incarico.cliente)}</td>
                    <td data-label="Periodicita">${esc(r.incarico.fatturazione || 'annuale')}</td>
                    <td data-label="Rata">${r.numero} di ${r.totale}</td>
                    <td data-label="Mese">${mesi[r.mese - 1]}</td>
                    <td class="num" data-label="Importo">${eurFmt2.format(r.importo)}</td>
                    <td data-label="Stato"><span class="badge ${r.stato === 'incassata' ? 'verde' : (r.stato === 'emessa' ? 'ambra' : 'neutro')}">${esc(r.stato)}</span></td>
                    ${Auth.puoModificare() ? `<td data-label="Aggiorna">
                        <select class="stato-rata" data-chiave="${esc(r.chiave)}" data-cliente="${esc(r.incarico.cliente)}" style="padding:4px 8px; border-radius:6px; border:1px solid var(--grigio-200); font-size:0.8rem;">
                            <option value="da emettere" ${r.stato === 'da emettere' ? 'selected' : ''}>da emettere</option>
                            <option value="emessa" ${r.stato === 'emessa' ? 'selected' : ''}>emessa</option>
                            <option value="incassata" ${r.stato === 'incassata' ? 'selected' : ''}>incassata</option>
                        </select>
                    </td>` : ''}
                </tr>`).join('') +
            `</tbody><tfoot><tr><td colspan="4">Totale</td><td class="num">${eurFmt2.format(totale)}</td><td colspan="${Auth.puoModificare() ? 2 : 1}"></td></tr></tfoot></table></div>
            </div>`;

        abilitaRicercaTabella(corpo, 'Cerca per cliente, periodicita, mese o stato...');
        corpo.querySelectorAll('.stato-rata').forEach(sel =>
            sel.addEventListener('change', () => {
                Fatture.cambiaStato(sel.dataset.chiave, sel.value, Auth.utenteCorrente, sel.dataset.cliente);
                toast('Stato rata aggiornato.', 'verde');
                disegnaFatturazione();
            }));

        disegnaGraficoBarre('grafico-mesi', mesi, mesi.map((m, i) => perMese[i + 1] || 0));
    }

    /* =========================================================
       VISTA: REPORT COMPENSI
    ========================================================= */
    function vistaReport() {
        const incarichi = Incarichi.tutti();
        const anni = Incarichi.anniConCompensi();
        const totali = anni.map(a => incarichi.reduce((s, i) => s + Incarichi.compensoAnno(i, a), 0));
        const conteggi = anni.map(a => incarichi.filter(i => Incarichi.compensoAnno(i, a) > 0).length);

        const perTipo = {};
        Object.keys(TIPI).forEach(t => { perTipo[t] = anni.map(a => incarichi.filter(i => i.tipo === t).reduce((s, i) => s + Incarichi.compensoAnno(i, a), 0)); });
        const qualitaTutte = valoriPresenti('qualita', Persone.attive('qualita'));
        const perQualita = {};
        qualitaTutte.forEach(q => { perQualita[q] = anni.map(a => incarichi.filter(i => i.qualita === q).reduce((s, i) => s + Incarichi.compensoAnno(i, a), 0)); });

        const annoRif = anni.includes(annoCorrente()) ? annoCorrente() : anni[anni.length - 1];
        const top = incarichi
            .map(i => ({ cliente: i.cliente, id: i.id, importo: Incarichi.compensoAnno(i, annoRif) }))
            .filter(x => x.importo > 0)
            .sort((a, b) => b.importo - a.importo)
            .slice(0, 10);

        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Report compensi</h1>
                    <p class="descrizione">Totale dei compensi per ogni anno con andamento, dettaglio per tipo di incarico e per responsabile della qualita.</p>
                </div>
                <div class="header-azioni"><button class="btn btn-secondary" id="btn-stampa-report">Stampa report</button></div>
            </header>
            <div class="card">
                <h2>Andamento compensi per anno</h2>
                <div class="grafico-wrap"><canvas id="grafico-report" height="280"></canvas></div>
            </div>
            <div class="card">
                <h2>Totali per anno</h2>
                <div class="tabella-wrap"><table class="dati"><thead><tr>
                    <th>Anno</th><th class="num">Incarichi con compenso</th><th class="num">Totale compensi</th><th class="num">Variazione</th><th class="num">Media per incarico</th>
                </tr></thead><tbody>` +
            anni.map((a, i) => {
                const prec = i > 0 ? totali[i - 1] : null;
                const delta = prec ? ((totali[i] - prec) / prec * 100) : null;
                return `<tr>
                        <td><strong>${a}</strong></td>
                        <td class="num">${conteggi[i]}</td>
                        <td class="num">${eurFmt.format(totali[i])}</td>
                        <td class="num">${delta == null ? '' : '<span class="badge ' + (delta >= 0 ? 'verde' : 'rosso') + '">' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%</span>'}</td>
                        <td class="num">${conteggi[i] ? eurFmt.format(totali[i] / conteggi[i]) : ''}</td>
                    </tr>`;
            }).join('') +
            `</tbody></table></div>
            </div>
            <div class="card">
                <h2>Compensi per tipo di incarico</h2>
                <div class="tabella-wrap"><table class="dati"><thead><tr><th>Tipo</th>${anni.map(a => '<th class="num">' + a + '</th>').join('')}</tr></thead><tbody>` +
            Object.keys(TIPI).filter(t => perTipo[t].some(v => v > 0)).map(t =>
                `<tr><td><span class="badge ${t}">${esc(TIPI[t].split(' (')[0])}</span></td>${perTipo[t].map(v => '<td class="num">' + (v ? eurFmt.format(v) : '') + '</td>').join('')}</tr>`).join('') +
            `</tbody></table></div>
            </div>
            <div class="card">
                <h2>Compensi per responsabile della qualita</h2>
                <div class="tabella-wrap"><table class="dati"><thead><tr><th>Qualita</th>${anni.map(a => '<th class="num">' + a + '</th>').join('')}</tr></thead><tbody>` +
            qualitaTutte.filter(q => perQualita[q].some(v => v > 0)).map(q =>
                `<tr><td><strong>${esc(q)}</strong></td>${perQualita[q].map(v => '<td class="num">' + (v ? eurFmt.format(v) : '') + '</td>').join('')}</tr>`).join('') +
            `</tbody></table></div>
            </div>
            <div class="card">
                <h2>Primi 10 incarichi per compenso ${annoRif}</h2>
                <div class="tabella-wrap"><table class="dati"><thead><tr><th>Cliente</th><th class="num">Compenso ${annoRif}</th></tr></thead><tbody>` +
            top.map(t => `<tr class="cliccabile" data-apri="${t.id}"><td class="cliente-cella">${esc(t.cliente)}</td><td class="num">${eurFmt.format(t.importo)}</td></tr>`).join('') +
            `</tbody></table></div>
            </div>`;

        document.getElementById('btn-stampa-report').addEventListener('click', () => window.print());
        $vista().querySelectorAll('[data-apri]').forEach(r =>
            r.addEventListener('click', () => naviga('dettaglio', { id: r.dataset.apri })));
        disegnaGraficoTrend('grafico-report');
    }

    /* =========================================================
       VISTA: PERSONE (anagrafica del team)
    ========================================================= */
    function vistaPersone() {
        const persone = Persone.tutte().slice().sort((a, b) => a.nome.localeCompare(b.nome));
        const incarichi = Incarichi.tutti();
        const conteggi = {};
        incarichi.forEach(i => {
            [['respIncarico', 'resp'], ['qualita', 'qual']].forEach(([campo, k]) => {
                const n = (i[campo] || '').trim();
                if (!n) return;
                conteggi[n] = conteggi[n] || { resp: 0, qual: 0 };
                conteggi[n][k]++;
            });
        });
        const spunta = v => v ? '<span class="badge verde">si</span>' : '<span class="badge neutro">no</span>';

        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Persone</h1>
                    <p class="descrizione">Anagrafica completa: nominativi, contatti (email, telefono, regione) e ruoli. Chi puo essere responsabile della qualita, responsabile dell'incarico o componente del team. Le tendine del wizard leggono da questo elenco.</p>
                </div>
                <div class="header-azioni">
                    ${Auth.puoModificare() ? '<button class="btn btn-primary" id="btn-nuova-persona">+ Aggiungi persona</button>' : ''}
                </div>
            </header>
            <div class="tabella-wrap"><table class="dati a-schede"><thead><tr>
                <th>Cognome</th><th>Nome</th><th>Email</th><th>Regione</th><th>Qualita</th><th>Resp. incarico</th><th>Team</th><th class="num">Inc. (resp.)</th><th>Stato</th>${Auth.puoModificare() ? '<th></th>' : ''}
            </tr></thead><tbody>` +
            persone.map(p => `<tr>
                <td class="cliente-cella" data-label="Cognome">${esc(p.nome)}</td>
                <td data-label="Nome">${p.nomeProprio ? esc(p.nomeProprio) : '<span style="color:var(--grigio-400)">—</span>'}</td>
                <td data-label="Email">${p.email ? '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>' : '<span style="color:var(--grigio-400)">—</span>'}</td>
                <td data-label="Regione">${esc(p.regione || '')}</td>
                <td data-label="Qualita">${spunta(p.qualita)}</td>
                <td data-label="Resp. incarico">${spunta(p.respIncarico)}</td>
                <td data-label="Team">${spunta(p.team)}</td>
                <td class="num" data-label="Inc. (resp.)">${(conteggi[p.nome] || {}).resp || ''}</td>
                <td data-label="Stato">${p.attivo ? '<span class="badge verde">attiva</span>' : '<span class="badge rosso">disattivata</span>'}</td>
                ${Auth.puoModificare() ? `<td data-label="" style="white-space:nowrap;">
                    <button class="btn btn-sm btn-secondary p-modifica" data-id="${esc(p.id)}">Modifica</button>
                    <button class="btn btn-sm ${p.attivo ? 'btn-danger' : 'btn-secondary'} p-attiva" data-id="${esc(p.id)}">${p.attivo ? 'Disattiva' : 'Riattiva'}</button>
                </td>` : ''}
            </tr>`).join('') +
            `</tbody></table></div>
            <p class="descrizione" style="margin-top:10px;">Le persone disattivate non compaiono piu nelle tendine ma restano negli incarichi gia registrati.</p>`;

        abilitaRicercaTabella($vista(), 'Cerca per cognome, nome, email o regione...');
        const btnNuova = document.getElementById('btn-nuova-persona');
        if (btnNuova) btnNuova.addEventListener('click', () => modalePersona(null));
        $vista().querySelectorAll('.p-modifica').forEach(b =>
            b.addEventListener('click', () => modalePersona(b.dataset.id)));
        $vista().querySelectorAll('.p-attiva').forEach(b =>
            b.addEventListener('click', () => {
                const lista = Persone.tutte();
                const p = lista.find(x => x.id === b.dataset.id);
                if (!p) return;
                p.attivo = !p.attivo;
                Persone.salva(lista);
                Audit.registra(Auth.utenteCorrente, p.attivo ? 'Persona riattivata' : 'Persona disattivata', 'persona', p.id, p.nome, null);
                toast((p.attivo ? 'Riattivata: ' : 'Disattivata: ') + p.nome, 'verde');
                vistaPersone();
            }));
    }

    function modalePersona(id) {
        const lista = Persone.tutte();
        const p = id ? lista.find(x => x.id === id) : null;
        apriModale(`<h2>${p ? 'Modifica persona' : 'Aggiungi persona'}</h2>
            <div class="griglia-2">
                <div class="campo"><label>Nome</label><input id="m-p-nomepr" value="${p && p.nomeProprio ? esc(p.nomeProprio) : ''}" placeholder="es. Mario"><div class="hint">Usato nelle lettere: "Dott. Nome Cognome".</div></div>
                <div class="campo"><label>Cognome</label><input id="m-p-nome" value="${p ? esc(p.nome) : ''}" placeholder="es. Rossi"><div class="hint">Collega la persona agli incarichi.</div></div>
                <div class="campo"><label>Email</label><input id="m-p-email" type="email" value="${p && p.email ? esc(p.email) : ''}"></div>
                <div class="campo"><label>Telefono</label><input id="m-p-telefono" value="${p && p.telefono ? esc(p.telefono) : ''}"></div>
                <div class="campo"><label>Regione</label><input id="m-p-regione" value="${p && p.regione ? esc(p.regione) : ''}"></div>
                <div class="campo"><label>Provincia</label><input id="m-p-provincia" value="${p && p.provincia ? esc(p.provincia) : ''}"></div>
                <div class="campo"><label>Localita</label><input id="m-p-localita" value="${p && p.localita ? esc(p.localita) : ''}"></div>
                <div class="campo"><label>Indirizzo</label><input id="m-p-indirizzo" value="${p && p.indirizzo ? esc(p.indirizzo) : ''}"></div>
            </div>
            <div class="campo"><label>Ruoli</label>
                <label style="display:flex; gap:8px; align-items:center; font-weight:500;"><input type="checkbox" id="m-p-qualita" ${p && p.qualita ? 'checked' : ''} style="width:auto;">Responsabile qualita</label>
                <label style="display:flex; gap:8px; align-items:center; font-weight:500;"><input type="checkbox" id="m-p-resp" ${p && p.respIncarico ? 'checked' : ''} style="width:auto;">Responsabile incarico</label>
                <label style="display:flex; gap:8px; align-items:center; font-weight:500;"><input type="checkbox" id="m-p-team" ${!p || p.team ? 'checked' : ''} style="width:auto;">Team di revisione / referente</label>
            </div>
            ${p ? '<p class="descrizione">Se cambi il cognome, viene aggiornato anche negli incarichi che lo citano.</p>' : ''}
            <div class="msg-errore hidden" id="m-p-errore"></div>
            <div class="modale-azioni">
                <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                <button class="btn btn-primary" id="m-salva">Salva</button>
            </div>`, { classe: 'larga' });
        document.getElementById('m-annulla').addEventListener('click', chiudiModale);
        const btnSalvaP = document.getElementById('m-salva');
        btnSalvaP.addEventListener('click', () => conAttesa(btnSalvaP, () => {
            const nome = document.getElementById('m-p-nome').value.trim();
            const err = document.getElementById('m-p-errore');
            if (nome.length < 2) { err.textContent = 'Inserisci un cognome valido.'; err.classList.remove('hidden'); return; }
            // virgole e punti e virgola sono i separatori degli elenchi team
            if (/[,;]/.test(nome)) { err.textContent = 'Il cognome non puo contenere virgole o punti e virgola.'; err.classList.remove('hidden'); return; }
            const omonimo = Persone.trovaPerNome(nome);
            if (omonimo && (!p || omonimo.id !== p.id)) { err.textContent = 'Esiste gia una persona con questo cognome.'; err.classList.remove('hidden'); return; }
            const contatti = {
                nomeProprio: document.getElementById('m-p-nomepr').value.trim(),
                email: document.getElementById('m-p-email').value.trim(),
                telefono: document.getElementById('m-p-telefono').value.trim(),
                regione: document.getElementById('m-p-regione').value.trim(),
                provincia: document.getElementById('m-p-provincia').value.trim(),
                localita: document.getElementById('m-p-localita').value.trim(),
                indirizzo: document.getElementById('m-p-indirizzo').value.trim()
            };
            const ruoli = {
                qualita: document.getElementById('m-p-qualita').checked,
                respIncarico: document.getElementById('m-p-resp').checked,
                team: document.getElementById('m-p-team').checked
            };
            const CAMPI_PERSONA = [
                { chiave: 'nome', nome: 'Cognome' }, { chiave: 'nomeProprio', nome: 'Nome' },
                { chiave: 'email', nome: 'Email' }, { chiave: 'telefono', nome: 'Telefono' },
                { chiave: 'regione', nome: 'Regione' }, { chiave: 'provincia', nome: 'Provincia' },
                { chiave: 'localita', nome: 'Localita' }, { chiave: 'indirizzo', nome: 'Indirizzo' },
                { chiave: 'qualita', nome: 'Ruolo qualita' }, { chiave: 'respIncarico', nome: 'Ruolo resp. incarico' },
                { chiave: 'team', nome: 'Ruolo team' }
            ];
            if (p) {
                const prima = { ...p };
                const vecchioNome = p.nome;
                Object.assign(p, { nome, ...contatti, ...ruoli });
                Persone.salva(lista);
                let rinominati = 0;
                if (vecchioNome !== nome) rinominati = rinominaPersonaNegliIncarichi(vecchioNome, nome);
                Audit.registra(Auth.utenteCorrente, 'Persona modificata', 'persona', p.id, nome,
                    Audit.confronta(prima, p, CAMPI_PERSONA)
                        .concat(rinominati ? [{ campo: 'Incarichi aggiornati', prima: vecchioNome, dopo: nome + ' (' + rinominati + ')' }] : []));
                toast('Persona aggiornata.' + (rinominati ? ' Aggiornati ' + rinominati + ' incarichi.' : ''), 'verde');
            } else {
                lista.push({ id: uid(), nome, ...contatti, ...ruoli, attivo: true });
                Persone.salva(lista);
                Audit.registra(Auth.utenteCorrente, 'Persona aggiunta', 'persona', null, nome, null);
                toast('Persona aggiunta: ' + nome, 'verde');
            }
            chiudiModale();
            vistaPersone();
        }));
    }

    /* Rinomina una persona in tutti i campi degli incarichi che la citano,
       con timbro di modifica e voce di registro per ogni incarico toccato */
    function rinominaPersonaNegliIncarichi(vecchio, nuovo) {
        const lista = Incarichi.tutti();
        const utente = Auth.utenteCorrente;
        let toccati = 0;
        lista.forEach(i => {
            const prima = JSON.parse(JSON.stringify(i));
            let cambiato = false;
            ['qualita', 'respIncarico'].forEach(campo => {
                if ((i[campo] || '').trim() === vecchio) { i[campo] = nuovo; cambiato = true; }
            });
            ['referente', 'team'].forEach(campo => {
                const parti = dividiNomi(i[campo]);
                if (parti.includes(vecchio)) {
                    i[campo] = parti.map(t => t === vecchio ? nuovo : t).join(', ');
                    cambiato = true;
                }
            });
            if (cambiato) {
                toccati++;
                i.modificato = { da: utente.nome + ' <' + utente.email + '>', il: Date.now() };
                Audit.registra(utente, 'Rinomina persona nell\'incarico', 'incarico', i.id, i.cliente,
                    Audit.confronta(prima, i, CAMPI_TRACCIATI));
            }
        });
        if (toccati) Incarichi.salva(lista);
        return toccati;
    }

    /* =========================================================
       VISTA: REGISTRO MODIFICHE
    ========================================================= */
    function vistaRegistro() {
        const log = Store.leggi(CHIAVI.audit, []);
        const utenti = Array.from(new Set(log.map(v => v.utente))).sort();

        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Registro modifiche</h1>
                    <p class="descrizione">Ogni inserimento, modifica, rinnovo e accesso viene tracciato con autore, data e campi variati.</p>
                </div>
            </header>
            <div class="filtri">
                <div class="campo ricerca"><label>Ricerca</label><input id="r-testo" placeholder="Cliente, azione..."></div>
                <div class="campo"><label>Autore</label><select id="r-utente"><option value="">Tutti</option>${utenti.map(u => `<option>${esc(u)}</option>`).join('')}</select></div>
                <div class="campo"><label>Ambito</label><select id="r-entita">
                    <option value="">Tutti</option>
                    <option value="incarico">Incarichi</option>
                    <option value="fattura">Fatturazione</option>
                    <option value="persona">Persone</option>
                    <option value="utente">Utenti e accessi</option>
                    <option value="sistema">Sistema</option>
                </select></div>
            </div>
            <div id="registro-corpo"></div>`;

        const disegna = () => {
            const t = document.getElementById('r-testo').value.toLowerCase();
            const u = document.getElementById('r-utente').value;
            const e = document.getElementById('r-entita').value;
            let lista = log;
            if (t) lista = lista.filter(v => (v.cliente || '').toLowerCase().includes(t) || (v.azione || '').toLowerCase().includes(t));
            if (u) lista = lista.filter(v => v.utente === u);
            if (e) lista = lista.filter(v => v.entita === e);
            lista = lista.slice(0, 300);
            document.getElementById('registro-corpo').innerHTML = lista.length ?
                `<div class="tabella-wrap"><table class="dati"><thead><tr>
                    <th>Data e ora</th><th>Autore</th><th>Azione</th><th>Riferimento</th><th>Dettagli</th>
                </tr></thead><tbody>` +
                lista.map(v => `<tr>
                    <td style="white-space:nowrap;">${fmtDataOra(v.ts)}</td>
                    <td>${esc(v.utente)}</td>
                    <td><strong>${esc(v.azione)}</strong></td>
                    <td>${esc(v.cliente || (v.entita === 'utente' ? v.rif : '') || '')}</td>
                    <td>${Array.isArray(v.dettagli) ? v.dettagli.map(d => esc(d.campo) + ': ' + esc(troncaTesto(d.prima, 30)) + ' → ' + esc(troncaTesto(d.dopo, 30))).join('<br>') : esc(v.dettagli || '')}</td>
                </tr>`).join('') + '</tbody></table></div>'
                : '<div class="card tabella-vuota">Nessuna voce nel registro.</div>';
        };
        ['r-testo', 'r-utente', 'r-entita'].forEach(id => document.getElementById(id).addEventListener('input', disegna));
        disegna();
    }

    /* =========================================================
       VISTA: UTENTI (solo amministratore)
    ========================================================= */
    function vistaUtenti() {
        if (!Auth.eAdmin()) { naviga('dashboard'); return; }
        if (Cloud.attivo) { vistaUtentiCloud(); return; }
        const utenti = Auth.utenti();
        const RUOLI = { admin: 'Amministratore', qualita: 'Responsabile qualita', procuratore: 'Procuratore' };

        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Utenti abilitati</h1>
                    <p class="descrizione">Solo gli indirizzi presenti in questo elenco possono richiedere la prima password e accedere all'area riservata.</p>
                </div>
                <div class="header-azioni"><button class="btn btn-primary" id="btn-nuovo-utente">+ Abilita utente</button></div>
            </header>
            <div class="tabella-wrap"><table class="dati"><thead><tr>
                <th>Nome</th><th>Email</th><th>Ruolo</th><th>Stato</th><th>Ultimo accesso</th><th></th>
            </tr></thead><tbody>` +
            utenti.map(u => `<tr>
                <td class="cliente-cella">${esc(u.nome)}</td>
                <td>${esc(u.email)}</td>
                <td>${esc(RUOLI[u.ruolo] || u.ruolo)}</td>
                <td>${u.attivo ? (u.hash ? '<span class="badge verde">attivo</span>' : '<span class="badge ambra">in attesa di prima password</span>') : '<span class="badge rosso">disabilitato</span>'}${u.mustChange && u.hash ? ' <span class="badge neutro">cambio password richiesto</span>' : ''}</td>
                <td>${u.ultimoAccesso ? fmtDataOra(u.ultimoAccesso) : ''}</td>
                <td style="white-space:nowrap;">
                    <button class="btn btn-sm btn-secondary u-reimposta" data-email="${esc(u.email)}">Reimposta password</button>
                    ${u.email !== Auth.utenteCorrente.email ? `<button class="btn btn-sm ${u.attivo ? 'btn-danger' : 'btn-secondary'} u-attiva" data-email="${esc(u.email)}">${u.attivo ? 'Disabilita' : 'Riabilita'}</button>` : ''}
                </td>
            </tr>`).join('') +
            `</tbody></table></div>`;

        abilitaRicercaTabella($vista(), 'Cerca per nome, email o ruolo...');
        document.getElementById('btn-nuovo-utente').addEventListener('click', () => {
            apriModale(`<h2>Abilita nuovo utente</h2>
                <div class="campo"><label>Nome e cognome</label><input id="m-nome"></div>
                <div class="campo"><label>Email</label><input id="m-email" type="email"></div>
                <div class="campo"><label>Ruolo</label><select id="m-ruolo">
                    <option value="qualita">Responsabile qualita</option>
                    <option value="procuratore">Procuratore</option>
                    <option value="admin">Amministratore</option>
                </select></div>
                <p class="descrizione">L'utente ricevera l'accesso richiedendo la prima password dalla pagina di ingresso.</p>
                <div class="modale-azioni">
                    <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                    <button class="btn btn-primary" id="m-salva">Abilita</button>
                </div>`);
            document.getElementById('m-annulla').addEventListener('click', chiudiModale);
            document.getElementById('m-salva').addEventListener('click', () => {
                const nome = document.getElementById('m-nome').value.trim();
                const email = document.getElementById('m-email').value.trim().toLowerCase();
                const ruolo = document.getElementById('m-ruolo').value;
                if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Inserisci nome e un indirizzo email valido.', 'rosso'); return; }
                if (Auth.trova(email)) { toast('Esiste gia un utente con questo indirizzo.', 'rosso'); return; }
                const utenti2 = Auth.utenti();
                utenti2.push({ email, nome, ruolo, hash: null, sale: uid(), mustChange: false, tentativi: 0, bloccatoFino: 0, attivo: true, creato: Date.now(), creatoDa: Auth.utenteCorrente.email });
                Auth.salvaUtenti(utenti2);
                Audit.registra(Auth.utenteCorrente, 'Utente abilitato', 'utente', email, null, [{ campo: 'Ruolo', prima: 'vuoto', dopo: ruolo }]);
                chiudiModale();
                toast('Utente abilitato: potra richiedere la prima password dalla pagina di accesso.', 'verde');
                vistaUtenti();
            });
        });

        $vista().querySelectorAll('.u-reimposta').forEach(b => b.addEventListener('click', () => conAttesa(b, async () => {
            const email = b.dataset.email;
            const utenti2 = Auth.utenti();
            const u = utenti2.find(x => x.email === email);
            const temp = generaPasswordTemporanea();
            u.hash = await sha256(u.sale + '|' + temp);
            u.mustChange = true; u.tentativi = 0; u.bloccatoFino = 0;
            Auth.salvaUtenti(utenti2);
            Audit.registra(Auth.utenteCorrente, 'Password reimpostata dall\'amministratore', 'utente', email, null, null);
            mostraPasswordTemporanea(u.email, temp, 'Comunica questa password temporanea all\'utente. Al primo accesso dovra sceglierne una nuova.');
        }, { testo: 'Reimposto…' })));
        $vista().querySelectorAll('.u-attiva').forEach(b => b.addEventListener('click', () => {
            const email = b.dataset.email;
            const utenti2 = Auth.utenti();
            const u = utenti2.find(x => x.email === email);
            u.attivo = !u.attivo;
            Auth.salvaUtenti(utenti2);
            Audit.registra(Auth.utenteCorrente, u.attivo ? 'Utente riabilitato' : 'Utente disabilitato', 'utente', email, null, null);
            toast(u.attivo ? 'Utente riabilitato.' : 'Utente disabilitato.', 'verde');
            vistaUtenti();
        }));
    }

    /* Utenti abilitati in modalita cloud (collezione Firestore "utenti") */
    async function vistaUtentiCloud() {
        const RUOLI = { admin: 'Amministratore', qualita: 'Responsabile qualita', procuratore: 'Procuratore' };
        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Utenti abilitati</h1>
                    <p class="descrizione">Solo gli indirizzi presenti in questo elenco possono accedere. La password si imposta e si recupera tramite email.</p>
                </div>
                <div class="header-azioni"><button class="btn btn-primary" id="btn-nuovo-utente">+ Abilita utente</button></div>
            </header>
            <div class="card tabella-vuota" id="u-caricamento">Caricamento elenco utenti...</div>
            <div id="u-tabella"></div>`;

        document.getElementById('btn-nuovo-utente').addEventListener('click', () => {
            apriModale(`<h2>Abilita nuovo utente</h2>
                <div class="campo"><label>Nome e cognome</label><input id="m-nome"></div>
                <div class="campo"><label>Email</label><input id="m-email" type="email"></div>
                <div class="campo"><label>Ruolo</label><select id="m-ruolo">
                    <option value="qualita">Responsabile qualita</option>
                    <option value="procuratore">Procuratore</option>
                    <option value="admin">Amministratore</option>
                </select></div>
                <p class="descrizione">L'utente ricevera una email (da noreply@nextgenerationbusiness.it) con il collegamento per impostare la password. Ricordagli di controllare anche la posta indesiderata / spam.</p>
                <div class="modale-azioni">
                    <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                    <button class="btn btn-primary" id="m-salva">Abilita e invia email</button>
                </div>`);
            document.getElementById('m-annulla').addEventListener('click', chiudiModale);
            const btnSalvaU = document.getElementById('m-salva');
            btnSalvaU.addEventListener('click', () => conAttesa(btnSalvaU, async () => {
                const nome = document.getElementById('m-nome').value.trim();
                const email = document.getElementById('m-email').value.trim().toLowerCase();
                const ruolo = document.getElementById('m-ruolo').value;
                if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Inserisci nome e un indirizzo email valido.', 'rosso'); return; }
                try {
                    await Cloud.salvaUtente(email, { nome, ruolo, attivo: true, creato: Date.now(), creatoDa: Auth.utenteCorrente.email });
                    Audit.registra(Auth.utenteCorrente, 'Utente abilitato', 'utente', email, null, [{ campo: 'Ruolo', prima: 'vuoto', dopo: ruolo }]);
                    const invio = await Cloud.primaPassword(email);
                    chiudiModale();
                    toast(invio.ok ? 'Utente abilitato: email di impostazione password inviata. Avvisa il collega di controllare anche lo spam.' : 'Utente abilitato, ma invio email non riuscito: ' + invio.msg, invio.ok ? 'verde' : 'rosso');
                    vistaUtentiCloud();
                } catch (e) {
                    toast('Operazione non riuscita: ' + (e && e.message ? e.message : e), 'rosso');
                }
            }, { testo: 'Abilito…' }));
        });

        let utenti = [];
        try {
            utenti = await Cloud.listaUtenti();
        } catch (e) {
            const caric = document.getElementById('u-caricamento');
            if (caric) caric.textContent = 'Elenco non disponibile: ' + Cloud.msgErrore(e);
            return;
        }
        // la vista puo essere cambiata durante il caricamento
        const caricamento = document.getElementById('u-caricamento');
        const tabella = document.getElementById('u-tabella');
        if (!caricamento || !tabella) return;
        caricamento.classList.add('hidden');
        tabella.innerHTML = `
            <div class="tabella-wrap"><table class="dati"><thead><tr>
                <th>Nome</th><th>Email</th><th>Ruolo</th><th>Stato</th><th>Ultimo accesso</th><th></th>
            </tr></thead><tbody>` +
            utenti.map(u => `<tr>
                <td class="cliente-cella">${esc(u.nome || '')}</td>
                <td>${esc(u.email)}</td>
                <td>${esc(RUOLI[u.ruolo] || u.ruolo || '')}</td>
                <td>${u.attivo === false ? '<span class="badge rosso">disabilitato</span>' : '<span class="badge verde">attivo</span>'}</td>
                <td>${u.ultimoAccesso ? fmtDataOra(u.ultimoAccesso) : ''}</td>
                <td style="white-space:nowrap;">
                    <button class="btn btn-sm btn-secondary u-reimposta" data-email="${esc(u.email)}">Invia email reimposta password</button>
                    ${u.email !== Auth.utenteCorrente.email ? `<button class="btn btn-sm ${u.attivo === false ? 'btn-secondary' : 'btn-danger'} u-attiva" data-email="${esc(u.email)}" data-attivo="${u.attivo === false ? '0' : '1'}">${u.attivo === false ? 'Riabilita' : 'Disabilita'}</button>` : ''}
                </td>
            </tr>`).join('') +
            `</tbody></table></div>`;

        abilitaRicercaTabella($vista(), 'Cerca per nome, email o ruolo...');
        document.querySelectorAll('.u-reimposta').forEach(b => b.addEventListener('click', () => conAttesa(b, async () => {
            // primaPassword crea l'account se non e mai stato attivato, poi invia l'email
            const esito = await Cloud.primaPassword(b.dataset.email);
            Audit.registra(Auth.utenteCorrente, 'Email reimpostazione password inviata', 'utente', b.dataset.email, null, null);
            toast(esito.ok ? 'Email inviata a ' + b.dataset.email + ' (potrebbe finire nello spam).' : esito.msg, esito.ok ? 'verde' : 'rosso');
        }, { testo: 'Invio…' })));
        document.querySelectorAll('.u-attiva').forEach(b => b.addEventListener('click', () => conAttesa(b, async () => {
            const attivo = b.dataset.attivo !== '1';
            try {
                await Cloud.salvaUtente(b.dataset.email, { attivo });
                Audit.registra(Auth.utenteCorrente, attivo ? 'Utente riabilitato' : 'Utente disabilitato', 'utente', b.dataset.email, null, null);
                toast(attivo ? 'Utente riabilitato.' : 'Utente disabilitato.', 'verde');
                vistaUtentiCloud();
            } catch (e) {
                toast('Operazione non riuscita: ' + Cloud.msgErrore(e), 'rosso');
            }
        })));
    }

    /* =========================================================
       VISTA: DATI E BACKUP
    ========================================================= */
    function vistaDati() {
        if (!Auth.eProprietario()) { naviga('dashboard'); return; }
        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Dati e backup</h1>
                    <p class="descrizione">Sezione riservata al titolare dello studio. Da qui gestisci import, backup, modelli PDF delle lettere e le impostazioni predefinite.</p>
                </div>
            </header>
            <div class="card">
                <h2>Fatturazione predefinita per tipo</h2>
                <p class="descrizione" style="margin-bottom:12px;">Imposta la periodicita di fatturazione secondo lo standard dello studio: <strong>trimestrale</strong> per la revisione legale triennale, <strong>annuale</strong> per la revisione volontaria. Vale per i nuovi incarichi; da qui puoi applicarla anche a tutti quelli gia presenti.</p>
                <button class="btn btn-secondary" id="d-fatturazione-default">Applica a tutti gli incarichi esistenti</button>
            </div>
            <div class="card">
                <h2>Importa incarichi</h2>
                <p class="descrizione" style="margin-bottom:12px;">Formati accettati: elenco incarichi "revilaw-incarichi-v1" (ad esempio <code>incarichi_import.json</code> generato dall'elenco Excel) oppure un backup completo "revilaw-backup-v1". I dati importati NON vengono pubblicati sul sito: restano in questo browser.</p>
                <div class="campo"><input type="file" id="d-file" accept=".json,application/json"></div>
                <div class="campo">
                ${Auth.eAdmin() ? `<label style="display:flex; gap:8px; align-items:center; font-weight:600;"><input type="radio" name="d-modo" value="sostituisci" style="width:auto;">Sostituisci l'elenco attuale (solo amministratore)</label>` : ''}
                <label style="display:flex; gap:8px; align-items:center; font-weight:600;"><input type="radio" name="d-modo" value="aggiungi" checked style="width:auto;">Aggiungi all'elenco attuale</label></div>
                <button class="btn btn-primary" id="d-importa">Importa</button>
            </div>
            <div class="card">
                <h2>Backup e ripristino</h2>
                <div class="header-azioni">
                    <button class="btn btn-secondary" id="d-backup">Scarica backup completo (JSON)</button>
                    ${Auth.eAdmin() && !Cloud.attivo ? '<button class="btn btn-danger" id="d-ripristina">Ripristina dati dimostrativi</button>' : ''}
                </div>
            </div>
            ${Auth.eAdmin() ? `<div class="card">
                <h2>Modelli PDF delle lettere di incarico</h2>
                ${Cloud.attivo
                    ? `<p class="descrizione" style="margin-bottom:12px;">Carica qui i PDF originali con i campi modulo: vengono archiviati su Firestore (visibili solo agli utenti abilitati) e usati dal pulsante "Scarica PDF ufficiale" della lettera. L'app compila i dati dell'incarico e lascia compilabili i campi riservati al cliente.</p>
                       <div id="modelli-stato" class="tabella-vuota">Caricamento stato modelli...</div>`
                    : '<p class="descrizione">Disponibile con l\'accesso al cloud condiviso.</p>'}
            </div>` : ''}
            <div class="card">
                <h2>Modalita di funzionamento</h2>
                ${Cloud.attivo
                    ? '<p class="descrizione">Accesso protetto attivo: ogni utente entra con le proprie credenziali (password via email) e i dati sono condivisi in tempo reale tra gli utenti abilitati.</p>'
                    : '<p class="descrizione">Modalita dimostrativa: accessi e dati vivono solo in questo browser. Per avere la password via email e i dati condivisi tra colleghi occorre attivare il servizio cloud seguendo la <a href="FIREBASE-SETUP.md" target="_blank">guida di configurazione</a>.</p>'}
            </div>`;
        if (Auth.eAdmin() && Cloud.attivo) disegnaStatoModelli();

        document.getElementById('d-importa').addEventListener('click', () => {
            const file = document.getElementById('d-file').files[0];
            if (!file) { toast('Seleziona un file JSON.', 'rosso'); return; }
            const lettore = new FileReader();
            lettore.onload = () => {
                try {
                    const dati = JSON.parse(lettore.result);

                    /* Ripristino di un backup completo: incarichi, stati rate e registro */
                    if (dati && dati.formato === 'revilaw-backup-v1') {
                        if (!Auth.eAdmin()) { toast('Il ripristino di un backup completo e riservato all\'amministratore.', 'rosso'); return; }
                        apriModale(`<h2>Ripristinare il backup?</h2>
                            <p>Il file contiene un backup completo (${(dati.incarichi || []).length} incarichi, registro e stati delle rate). L'elenco attuale in questo browser verra sostituito.</p>
                            <div class="modale-azioni">
                                <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                                <button class="btn btn-danger" id="m-conferma">Ripristina backup</button>
                            </div>`);
                        document.getElementById('m-annulla').addEventListener('click', chiudiModale);
                        document.getElementById('m-conferma').addEventListener('click', () => {
                            Incarichi.salva(dati.incarichi || []);
                            if (Array.isArray(dati.persone) && dati.persone.length) Persone.salva(dati.persone);
                            Store.scrivi(CHIAVI.fatture, dati.fattureStato || {});
                            if (Array.isArray(dati.audit)) Store.scrivi(CHIAVI.audit, dati.audit);
                            Audit.registra(Auth.utenteCorrente, 'Ripristino backup', 'sistema', null, null,
                                'Ripristinati ' + (dati.incarichi || []).length + ' incarichi da backup del ' + (dati.esportato || 'data ignota'));
                            chiudiModale();
                            toast('Backup ripristinato.', 'verde');
                            naviga('incarichi');
                        });
                        return;
                    }

                    const righe = Array.isArray(dati) ? dati : (dati.incarichi || []);
                    if (!righe.length) { toast('Il file non contiene incarichi.', 'rosso'); return; }
                    const modoSel = document.querySelector('input[name="d-modo"]:checked');
                    const modo = modoSel ? modoSel.value : 'aggiungi';
                    if (modo === 'sostituisci' && !Auth.eAdmin()) { toast('Solo l\'amministratore puo sostituire l\'elenco.', 'rosso'); return; }
                    const attuali = modo === 'aggiungi' ? Incarichi.tutti() : [];
                    let scartate = 0, tipiNormalizzati = 0, compensiScartati = 0, dateInNote = 0;
                    // accetta date ISO o gg/mm/aaaa; il resto diventa nota testuale
                    const normalizzaData = valore => {
                        if (valore == null || valore === '') return { data: null, nota: null };
                        const s = String(valore).trim();
                        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { data: s, nota: null };
                        const it = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                        if (it) return { data: it[3] + '-' + it[2].padStart(2, '0') + '-' + it[1].padStart(2, '0'), nota: null };
                        dateInNote++;
                        return { data: null, nota: s };
                    };
                    const nuovi = [];
                    righe.forEach(r => {
                        if (!r || typeof r !== 'object' || !r.cliente) { scartate++; return; }
                        // id, creato e modificato vengono sempre rigenerati:
                        // un id proveniente dal file causerebbe duplicati
                        const { id, creato, modificato, ...resto } = r;
                        // il tipo deve appartenere alla lista nota
                        let tipo = resto.tipo;
                        if (!Object.prototype.hasOwnProperty.call(TIPI, tipo)) { tipo = 'assistenza'; tipiNormalizzati++; }
                        // i compensi devono essere numerici (accetta anche "12.500" o "12.500,00")
                        const compensi = {};
                        if (resto.compensi && typeof resto.compensi === 'object') {
                            Object.keys(resto.compensi).forEach(anno => {
                                if (!/^\d{4}$/.test(String(anno))) { compensiScartati++; return; }
                                const n = parseImporto(resto.compensi[anno]);
                                if (n > 0) compensi[anno] = n;
                                else compensiScartati++;
                            });
                        }
                        const dInizio = normalizzaData(resto.dataInizio);
                        const dFine = normalizzaData(resto.dataFine);
                        const dRinnovo = normalizzaData(resto.rinnovo);
                        nuovi.push({
                            stato: 'attivo', fatturazione: 'annuale',
                            ...resto,
                            tipo, compensi,
                            dataInizio: dInizio.data, dataInizioNote: dInizio.nota || resto.dataInizioNote || null,
                            dataFine: dFine.data, dataFineNote: dFine.nota || resto.dataFineNote || null,
                            rinnovo: dRinnovo.data, rinnovoNote: dRinnovo.nota || resto.rinnovoNote || null,
                            id: uid(),
                            creato: { da: Auth.utenteCorrente.nome + ' (importazione)', il: Date.now() },
                            modificato: null
                        });
                    });
                    if (!nuovi.length) { toast('Nessun incarico valido nel file.', 'rosso'); return; }
                    // prima l'anagrafica (normalizza anche le grafie nei record), poi il salvataggio
                    const personeAggiunte = Persone.integraDaIncarichi(nuovi);
                    Incarichi.salva(attuali.concat(nuovi));
                    const note = [];
                    if (dateInNote) note.push(dateInNote + ' date non riconosciute spostate nelle note');
                    if (personeAggiunte) note.push(personeAggiunte + ' persone aggiunte all\'anagrafica');
                    if (scartate) note.push(scartate + ' righe scartate (senza cliente)');
                    if (tipiNormalizzati) note.push(tipiNormalizzati + ' tipi non riconosciuti impostati ad Assistenza esterna');
                    if (compensiScartati) note.push(compensiScartati + ' compensi non validi ignorati');
                    Audit.registra(Auth.utenteCorrente, 'Importazione incarichi', 'sistema', null, null,
                        'Importati ' + nuovi.length + ' incarichi (' + (modo === 'aggiungi' ? 'aggiunti' : 'elenco sostituito') + ')' + (note.length ? '. ' + note.join('; ') : ''));
                    toast('Importati ' + nuovi.length + ' incarichi.' + (note.length ? ' Attenzione: ' + note.join('; ') + '.' : ''), note.length ? undefined : 'verde');
                    naviga('incarichi');
                } catch (e) {
                    toast('File non valido: ' + e.message, 'rosso');
                }
            };
            lettore.readAsText(file);
        });

        document.getElementById('d-backup').addEventListener('click', () => {
            const backup = {
                formato: 'revilaw-backup-v1', esportato: new Date().toISOString(),
                incarichi: Incarichi.tutti(), persone: Persone.tutte(),
                audit: Store.leggi(CHIAVI.audit, []),
                fattureStato: Fatture.stati()
            };
            const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'backup_area_riservata_' + oggiISO() + '.json';
            a.click();
            URL.revokeObjectURL(a.href);
            Audit.registra(Auth.utenteCorrente, 'Backup scaricato', 'sistema', null, null, null);
        });

        const btnRipristina = document.getElementById('d-ripristina');
        if (btnRipristina) btnRipristina.addEventListener('click', () => {
            apriModale(`<h2>Ripristinare i dati dimostrativi?</h2>
                <p>L'elenco incarichi attuale in questo browser verra sostituito dai dati fittizi iniziali. Il registro modifiche viene conservato.</p>
                <div class="modale-azioni">
                    <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                    <button class="btn btn-danger" id="m-conferma">Ripristina</button>
                </div>`);
            document.getElementById('m-annulla').addEventListener('click', chiudiModale);
            document.getElementById('m-conferma').addEventListener('click', () => {
                if (Cloud.attivo) {
                    toast('Con il cloud condiviso attivo i dati sono condivisi: il ripristino demo non e disponibile.', 'rosso');
                    chiudiModale();
                    return;
                }
                localStorage.removeItem(CHIAVI.incarichi);
                localStorage.removeItem(CHIAVI.fatture);
                Store.seed();
                Audit.registra(Auth.utenteCorrente, 'Ripristino dati dimostrativi', 'sistema', null, null, null);
                chiudiModale();
                toast('Dati dimostrativi ripristinati.', 'verde');
                naviga('incarichi');
            });
        });

        document.getElementById('d-fatturazione-default').addEventListener('click', () => {
            const lista = Incarichi.tutti();
            const daCambiare = lista.filter(i => (i.tipo === 'legale' || i.tipo === 'volontaria') && i.fatturazione !== fatturazionePredefinita(i.tipo));
            if (!daCambiare.length) { toast('Tutti gli incarichi hanno gia la fatturazione predefinita.', 'verde'); return; }
            apriModale(`<h2>Applicare la fatturazione predefinita?</h2>
                <p>Verra impostata la fatturazione <strong>trimestrale</strong> per gli incarichi di revisione legale triennale e <strong>annuale</strong> per la revisione volontaria.</p>
                <p>Incarichi interessati: <strong>${daCambiare.length}</strong>. L'operazione viene registrata nel registro modifiche.</p>
                <div class="modale-azioni">
                    <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                    <button class="btn btn-primary" id="m-conferma">Applica</button>
                </div>`);
            document.getElementById('m-annulla').addEventListener('click', chiudiModale);
            document.getElementById('m-conferma').addEventListener('click', () => {
                daCambiare.forEach(i => {
                    Incarichi.aggiorna(i.id, { fatturazione: fatturazionePredefinita(i.tipo) }, Auth.utenteCorrente, 'Fatturazione predefinita per tipo');
                });
                chiudiModale();
                toast('Fatturazione aggiornata su ' + daCambiare.length + ' incarichi.', 'verde');
                naviga('dati');
            });
        });
    }

    /* Stato e caricamento dei modelli PDF (solo amministratore, cloud) */
    async function disegnaStatoModelli() {
        const box = document.getElementById('modelli-stato');
        if (!box) return;
        const righe = [];
        for (const tipo of Object.keys(Modelli.TIPI)) {
            let meta = null;
            try { meta = await Modelli.info(tipo); } catch (e) { }
            righe.push(`<div class="riepilogo-blocco">
                <h4>${esc(Modelli.TIPI[tipo])}</h4>
                <p class="descrizione" style="margin-bottom:8px;">${meta
                    ? 'Caricato: ' + esc(meta.nome) + ' (' + Math.round((meta.dimensione || 0) / 1024) + ' KB)'
                    : 'Non ancora caricato.'}</p>
                <div class="campo" style="margin-bottom:8px;"><input type="file" id="m-file-${tipo}" accept="application/pdf"></div>
                <button class="btn btn-sm btn-primary" data-carica="${tipo}">${meta ? 'Sostituisci modello' : 'Carica modello'}</button>
            </div>`);
        }
        const boxDopo = document.getElementById('modelli-stato');
        if (!boxDopo) return; // vista cambiata durante il caricamento
        boxDopo.classList.remove('tabella-vuota');
        boxDopo.innerHTML = righe.join('');
        boxDopo.querySelectorAll('[data-carica]').forEach(b => b.addEventListener('click', () => conAttesa(b, async () => {
            const tipo = b.dataset.carica;
            const file = document.getElementById('m-file-' + tipo).files[0];
            if (!file) { toast('Seleziona il PDF del modello.', 'rosso'); return; }
            try {
                await Modelli.carica(tipo, file);
                toast('Modello "' + Modelli.TIPI[tipo] + '" caricato.', 'verde');
                disegnaStatoModelli();
            } catch (e) {
                toast('Caricamento non riuscito: ' + (e.message || e), 'rosso');
            }
        }, { testo: 'Caricamento…' })));
    }

    /* =========================================================
       VISTA: LETTERA DI INCARICO
    ========================================================= */
    function vistaLettera() {
        const inc = Incarichi.trova(parametriVista && parametriVista.id);
        if (!inc) { naviga('incarichi'); return; }
        if (inc.tipo !== 'legale' && inc.tipo !== 'volontaria') {
            toast('Il modello di lettera e disponibile solo per revisione legale e revisione volontaria.', 'rosso');
            naviga('dettaglio', { id: inc.id });
            return;
        }
        const html = inc.tipo === 'volontaria' ? letteraVolontaria(inc) : letteraLegale(inc);
        $vista().innerHTML = `
            <div class="barra-stampa no-stampa">
                <button class="btn btn-ghost" id="btn-lettera-indietro">&larr; Torna al dettaglio</button>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <span class="badge ${classeTipo(inc.tipo)}" style="align-self:center;">${esc(nomeTipo(inc.tipo))}</span>
                    ${inc.calcoloCongelato ? '<span class="badge ambra" style="align-self:center;">🔒 Calcolo congelato</span>' : ''}
                    <button class="btn btn-primary" id="btn-pdf-ufficiale">Scarica / stampa mandato</button>
                </div>
            </div>
            <div id="lettera-corpo">
                <p class="descrizione" style="max-width:860px; margin:0 auto 14px; text-align:center;">Caricamento anteprima del mandato ufficiale...</p>
            </div>`;
        document.getElementById('btn-lettera-indietro').addEventListener('click', () => naviga('dettaglio', { id: inc.id }));
        document.getElementById('btn-pdf-ufficiale').addEventListener('click', () => modaleStampaMandato(inc));

        // anteprima = PDF ufficiale renderizzato inline; fallback all'anteprima HTML
        (async () => {
            const corpo = document.getElementById('lettera-corpo');
            try {
                const bytes = await generaPdfIncarico(inc, { restituisciBytes: true });
                if (!document.getElementById('lettera-corpo')) return;
                const blob = new Blob([bytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                corpo.innerHTML = `<div style="max-width:900px; margin:0 auto;">
                    <iframe src="${url}#toolbar=1" title="Anteprima mandato" style="width:100%; height:80vh; border:1px solid var(--grigio-200); border-radius:8px; background:#fff;"></iframe>
                </div>`;
            } catch (e) {
                if (!document.getElementById('lettera-corpo')) return;
                corpo.innerHTML = `<p class="descrizione" style="max-width:860px; margin:0 auto 14px;">Anteprima del PDF ufficiale non disponibile (${esc(e.message || 'errore')}). Mostro l'anteprima sintetica.</p>
                    <div class="lettera-anteprima"><div class="lettera">${html}</div></div>`;
            }
        })();
    }

    // dialogo di stampa/scarico del mandato con opzione di congelamento del calcolo
    function modaleStampaMandato(inc) {
        const giaCongelato = !!inc.calcoloCongelato;
        apriModale(`<h2>Stampa del mandato</h2>
            <p class="descrizione" style="margin-bottom:12px;">Verra generato il PDF ufficiale di <strong>${esc(inc.cliente)}</strong> con i dati compilati e i campi del cliente lasciati editabili.</p>
            ${giaCongelato
                ? '<p class="descrizione">Il calcolo di questo incarico e gia congelato: il compenso non e modificabile finche non viene sbloccato.</p>'
                : `<label style="display:flex; gap:8px; align-items:flex-start; font-weight:600;"><input type="checkbox" id="m-congela" checked style="width:auto; margin-top:3px;"><span>Congela il calcolo del compenso<br><span style="font-weight:400; font-size:0.82rem; color:var(--grigio-600);">Il compenso e le ore concordati vengono bloccati: per modificarli in seguito occorrera sbloccarli inviando un messaggio di allerta.</span></span></label>`}
            <div class="modale-azioni">
                <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                <button class="btn btn-primary" id="m-conferma">Genera PDF</button>
            </div>`);
        document.getElementById('m-annulla').addEventListener('click', chiudiModale);
        const btnGen = document.getElementById('m-conferma');
        btnGen.addEventListener('click', () => conAttesa(btnGen, async () => {
            const congela = !giaCongelato && document.getElementById('m-congela') && document.getElementById('m-congela').checked;
            try {
                await generaPdfIncarico(inc);
                if (congela) {
                    Incarichi.congela(inc.id, Auth.utenteCorrente);
                    toast('Mandato generato. Calcolo congelato.', 'verde');
                } else {
                    toast('Mandato generato: controlla i download del browser.', 'verde');
                }
                chiudiModale();
                naviga('dettaglio', { id: inc.id });
            } catch (e) {
                toast(e.message || 'Generazione non riuscita.', 'rosso');
            }
        }, { testo: 'Generazione…' }));
    }

    /* ---------- PDF ufficiale: compila i campi modulo del modello ----------
       L'app scrive solo i dati dell'incarico (societa, esercizi, compensi,
       responsabile); i campi del cliente (scheda di identificazione,
       titolari effettivi, consensi privacy, fatturazione elettronica,
       firme e date) restano vuoti e compilabili nel PDF. */
    function caricaPdfLib() {
        if (window.PDFLib) return Promise.resolve(window.PDFLib);
        return new Promise((ok, ko) => {
            const s = document.createElement('script');
            s.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
            s.onload = () => ok(window.PDFLib);
            s.onerror = () => ko(new Error('Libreria PDF non raggiungibile: verifica la connessione.'));
            document.head.appendChild(s);
        });
    }

    async function generaPdfIncarico(inc, opzioni) {
        if (!inc) throw new Error('Incarico non trovato.');
        const tipo = inc.tipo === 'volontaria' ? 'volontaria' : 'triennale';
        const modello = await Modelli.leggi(tipo);
        if (!modello) throw new Error('Modello "' + Modelli.TIPI[tipo] + '" non ancora caricato: vai in Dati e backup > Modelli PDF.');
        const PDFLib = await caricaPdfLib();
        const pdf = await PDFLib.PDFDocument.load(modello.slice(0));
        const form = pdf.getForm();
        const scrivi = (nome, valore) => {
            if (valore == null || valore === '') return;
            try { form.getTextField(nome).setText(String(valore)); }
            catch (e) { console.warn('Campo non trovato nel modello:', nome); }
        };
        const d = datiLettera(inc);
        const oggi = fmtData(oggiISO());
        const num = v => v ? numFmt.format(v) : '';
        const respNome = Persone.nomeCompleto(inc.respIncarico); // nome completo se disponibile
        // stesso riparto ore/compensi della tabella della lettera
        const rip = tipo === 'triennale' ? [0.60, 0.30, 0.10] : [0.70, 0.30];
        const oreTot = d.ore || 0, compTot = d.compenso || 0;
        const oreParti = rip.map(q => Math.round(oreTot * q));
        if (oreTot) oreParti[0] += oreTot - oreParti.reduce((s, v) => s + v, 0);
        const compParti = rip.map(q => Math.round(compTot * q));
        if (compTot) compParti[0] += compTot - compParti.reduce((s, v) => s + v, 0);

        if (tipo === 'volontaria') {
            scrivi('t_p3_01', d.primo);                    // frontespizio: esercizio
            scrivi('t_p4_01', inc.cliente);                // Spettabile
            scrivi('t_p4_02', inc.codiceFiscale);          // C.f.
            scrivi('t_p4_03', inc.email1);                 // Pec
            scrivi('t_p4_04', 'Verona');                   // luogo lettera
            scrivi('t_p4_05', oggi);                       // data lettera
            scrivi('t_p4_06', '31/12/' + d.primo);         // chiusura bilancio
            scrivi('t_p4_07', inc.cliente);                // "della societa ..."
            scrivi('t_p9_01', respNome);           // responsabile (Dott.)
            scrivi('t_p10_01', num(oreParti[0])); scrivi('t_p10_02', num(compParti[0]));  // a) bilancio
            scrivi('t_p10_03', num(oreParti[1])); scrivi('t_p10_04', num(compParti[1]));  // b) contabilita
            /* riga c) libera: lasciata compilabile */
            scrivi('t_p10_07', num(oreTot)); scrivi('t_p10_08', num(compTot));            // TOTALE
            scrivi('t_p17_01', respNome);          // firma REVILAW
        } else {
            scrivi('Testo1.0.0', d.primo);                 // frontespizio: triennio da
            scrivi('Testo1.1.1', d.ultimo);                //               triennio a
            scrivi('Testo4.0.0', inc.cliente);             // Spettabile + "della societa" (due posizioni)
            scrivi('Testo4.1.1', inc.codiceFiscale);       // C.f.
            scrivi('Testo4.1.0', inc.email1);              // Pec
            scrivi('Testo5', 'Verona');                    // luogo lettera
            scrivi('Testo6', oggi);                        // data lettera
            scrivi('Testo8.0.0', '31/12/' + d.primo);      // chiusura dal
            scrivi('Testo8.1.1', '31/12/' + d.ultimo);     // chiusura al
            scrivi('Testo9', respNome);            // responsabile (Dott.)
            scrivi('Testo10.0.0', num(oreParti[0]));       // ore a) bilancio
            scrivi('Testo10.1.0', num(oreParti[1]));       // ore b) contabilita
            scrivi('Testo10.1.1.0.0', num(oreParti[2]));   // ore c) dichiarazioni
            scrivi('Testo10.1.1.1.1', num(oreTot));        // ore TOTALE
            scrivi('Testo10.1.1.0.1.0', num(compParti[0]));            // euro a)
            scrivi('Testo10.1.1.0.1.1.0', num(compParti[1]));          // euro b)
            scrivi('Testo10.1.1.0.1.1.1.0', num(compParti[2]));        // euro c)
            scrivi('Testo10.1.1.0.1.1.1.1.1', num(compTot));           // euro TOTALE
            /* riga extra della tabella (Testo11) e campi firma/allegati
               (Testo12, Testo13) lasciati compilabili */
        }

        const bytes = await pdf.save();
        if (opzioni && opzioni.restituisciBytes) return bytes;
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        // traslittera gli accenti (Societa, non Societ) prima di filtrare
        const base = (inc.cliente || 'societa').normalize('NFD').replace(/\p{M}+/gu, '')
            .replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'societa';
        a.download = 'Incarico_' + base +
            '_' + d.primo + (d.ultimo !== d.primo ? '-' + d.ultimo : '') + '.pdf';
        a.click();
        URL.revokeObjectURL(a.href);
        Audit.registra(Auth.utenteCorrente, 'Generato PDF lettera di incarico', 'incarico', inc.id, inc.cliente, null);
    }

    function datiLettera(inc) {
        // la lettera riguarda il PERIODO CORRENTE dell'incarico, non l'intero
        // storico dei compensi (che dopo un rinnovo copre piu trienni)
        const anniTutti = Object.keys(inc.compensi || {}).map(Number).sort((a, b) => a - b);
        const durata = inc.tipo === 'legale' ? 3 : 1;
        let primo;
        if (inc.esercizioPeriodo && anniTutti.includes(Number(inc.esercizioPeriodo))) {
            primo = Number(inc.esercizioPeriodo);
        } else if (anniTutti.length) {
            primo = anniTutti[anniTutti.length - 1] - durata + 1;
            if (primo < anniTutti[0]) primo = anniTutti[0];
        } else {
            primo = annoCorrente();
        }
        const ultimo = primo + durata - 1;
        const anni = [];
        for (let a = primo; a <= ultimo; a++) anni.push(a);
        const compensoRegime = Incarichi.compensoAnno(inc, ultimo) || Incarichi.compensoAnno(inc, primo);
        const compensoPrimo = Incarichi.compensoAnno(inc, primo) || compensoRegime;
        const orePrimo = inc.calc ? (inc.calc.oreAnno1 || 0) : 0;
        // per la volontaria (un solo esercizio) valgono le ore dell'anno 1
        const oreRegime = inc.tipo === 'volontaria' ? orePrimo : (inc.calc ? (inc.calc.oreAnni23 || inc.calc.oreAnno1 || 0) : 0);
        const tariffa = inc.calc ? (inc.calc.tariffa || null) : null;
        const fine = inc.rinnovo || inc.dataFine || null;
        return { anni, primo, ultimo, compenso: compensoRegime, compensoPrimo, ore: oreRegime, orePrimo, tariffa, fine };
    }

    function intestazioneLettera(inc) {
        return `
            <div class="intestazione">
                <span class="marchio-lettera">
                    <img src="../zls_zes/img/logo-revilaw.png" alt="Revilaw">
                    <span><span class="lr">Revilaw</span><span class="ls">SPA</span></span>
                </span>
                <div class="societa-dati">
                    REVILAW S.p.A. - Revisione Legale<br>
                    Via XX Settembre 9 - 37129 Verona<br>
                    C.F. 04641610235 - www.revilaw.it
                </div>
            </div>
            <div class="destinatario">Spettabile
<strong>${esc(inc.cliente)}</strong>
${esc(inc.localita || '')}${inc.regione ? ' (' + esc(inc.regione) + ')' : ''}
C.f.: ${esc(inc.codiceFiscale || '____________')}
${inc.email1 ? 'Pec: ' + esc(inc.email1) : 'Pec: ____________'}

Alla cortese attenzione dell'Organo Amministrativo</div>
            <div class="luogo-data">Verona, ${fmtData(oggiISO())}</div>`;
    }

    /* Ripartizione ore e corrispettivi come nella tabella della proposta:
       a) revisione del bilancio 60%, b) verifiche periodiche 30%,
       c) sottoscrizione dichiarazioni fiscali 10% (stessa suddivisione
       della pagina sulla revisione legale). */
    function tabellaCompensiLettera(inc, d, conFiscali) {
        const oreTot = d.ore || 0;
        const compTot = d.compenso || 0;
        const rip = conFiscali ? [0.60, 0.30, 0.10] : [0.70, 0.30];
        const oreParti = rip.map(q => Math.round(oreTot * q));
        oreParti[0] += oreTot - oreParti.reduce((s, v) => s + v, 0);
        const compParti = rip.map(q => Math.round(compTot * q));
        compParti[0] += compTot - compParti.reduce((s, v) => s + v, 0);
        const cella = v => v ? numFmt.format(v) : '____';
        const cellaEur = v => v ? eurFmt.format(v) : '€ ____';
        const righe = [
            `<tr><td>a) Revisione legale del bilancio d'esercizio della societa</td><td class="num">${cella(oreParti[0])}</td><td class="num">${cellaEur(compParti[0])}</td></tr>`,
            `<tr><td>b) Verifica della regolare tenuta della contabilita sociale</td><td class="num">${cella(oreParti[1])}</td><td class="num">${cellaEur(compParti[1])}</td></tr>`
        ];
        if (conFiscali) righe.push(`<tr><td>c) Sottoscrizione delle dichiarazioni fiscali</td><td class="num">${cella(oreParti[2])}</td><td class="num">${cellaEur(compParti[2])}</td></tr>`);
        return `<table>
            <thead><tr><th>Corrispettivi</th><th class="num">Ore</th><th class="num">Euro</th></tr></thead>
            <tbody>${righe.join('')}
            <tr><td><strong>TOTALE</strong></td><td class="num"><strong>${cella(oreTot)}</strong></td><td class="num"><strong>${cellaEur(compTot)}</strong></td></tr></tbody>
        </table>`;
    }

    function testoFatturazioneLettera(inc) {
        const per = inc.fatturazione || 'annuale';
        if (per === 'mensile') return 'La fatturazione dei corrispettivi avverra in dodici rate mensili di pari importo';
        if (per === 'trimestrale') return 'La fatturazione dei corrispettivi avverra in quattro rate trimestrali di pari importo';
        return 'La fatturazione dei corrispettivi avverra in un\'unica soluzione annuale, per l\'importo complessivo sopra indicato';
    }

    function firmeLettera(inc) {
        return `
            <p>Desideriamo esprimere i nostri ringraziamenti per l'opportunita offertaci e ribadire il nostro vivo interesse professionale per l'assegnazione dell'incarico, che svolgeremo con la massima cura. Vorrete quindi comunicarci per iscritto la Vostra determinazione in ordine al conferimento dell'incarico, sulla base della deliberazione dell'Assemblea dei Soci della Vostra Societa in conformita a quanto previsto dall'art. 13 del D.Lgs. n. 39/2010, restituendoci la presente proposta firmata per accettazione.</p>
            <p>Con i migliori saluti</p>
            <div class="firme">
                <div class="firma-blocco">
                    <div>&nbsp;</div>
                    <div class="firma-linea">Dott. ${esc(Persone.nomeCompleto(inc.respIncarico) || '____________')}<br>REVILAW S.p.A.</div>
                </div>
            </div>
            <div class="accettazione">
                <p><strong>Per accettazione:</strong></p>
                <div class="firme">
                    <div class="firma-blocco"><div class="firma-linea">Data</div></div>
                    <div class="firma-blocco"><div class="firma-linea">Timbro e Firma</div></div>
                </div>
                <p style="margin-top:26px;">Per accettazione specifica, in quanto cio possa occorrere, dei paragrafi dal n. 8 al n. 18 inclusi delle condizioni generali, per quanto espressamente indicato dagli artt. 1341 e 1342 del codice civile:</p>
                <div class="firme">
                    <div class="firma-blocco"><div class="firma-linea">Data</div></div>
                    <div class="firma-blocco"><div class="firma-linea">Timbro e Firma</div></div>
                </div>
                <p style="margin-top:20px;">Allegati N. ____ (scheda di identificazione del cliente ex D.Lgs. 231/2007, informativa privacy e modulo consensi, modulo dati per fatturazione elettronica)</p>
            </div>`;
    }

    function blocchiComuniLettera(inc) {
        return `
            <h2>1. Natura dell'incarico</h2>
            <p>La revisione del bilancio d'esercizio sara svolta in conformita ai principi di revisione internazionali ISA Italia, ai sensi dell'art. 11 del D.Lgs. n. 39/2010. La pianificazione e l'effettuazione della revisione sono finalizzate ad ottenere una ragionevole sicurezza che il bilancio d'esercizio non sia viziato da errori significativi. Le verifiche saranno svolte a campione; a causa della natura selettiva e degli altri limiti insiti sia nelle procedure di revisione sia in ogni sistema di controllo interno, rimane un inevitabile rischio che eventuali frodi, errori ed irregolarita, anche significative, possano non essere individuate.</p>
            <p>Le verifiche periodiche della regolare tenuta della contabilita sociale e della corretta rilevazione dei fatti di gestione nelle scritture contabili saranno svolte nel corso dell'esercizio secondo il principio di revisione SA Italia n. 250B, secondo un calendario da concordare.</p>
            <h2>2. Modalita di svolgimento</h2>
            <p>Il lavoro sara articolato in due fasi, preliminare e finale, rispettivamente prima e dopo la chiusura dell'esercizio. La fase preliminare comprende la conoscenza della Societa, la valutazione dell'affidabilita del sistema di controllo interno, la determinazione della significativita e la predisposizione del piano di revisione. La fase finale comprende le procedure di validita sulle voci di bilancio, l'esame delle stime contabili, delle operazioni con parti correlate e degli eventi successivi.</p>
            <h2>3. Responsabilita degli Amministratori</h2>
            <p>La redazione del bilancio e della relazione sulla gestione, la regolare tenuta delle scritture contabili e l'adeguatezza dell'assetto organizzativo, amministrativo e contabile competono agli Amministratori della Societa. Il progetto di bilancio e la documentazione di supporto dovranno esserci messi a disposizione almeno 40 giorni prima della data prevista per l'approvazione assembleare. Verra inoltre richiesta la sottoscrizione delle Lettere di Attestazione previste dal principio ISA Italia n. 580.</p>`;
    }

    function letteraLegale(inc) {
        const d = datiLettera(inc);
        return `
            ${intestazioneLettera(inc)}
            <div class="oggetto">Oggetto: Proposta di Incarico di Revisione Legale ex art. 13 D.Lgs. n. 39/2010 e artt. 2409-bis e seguenti del Codice Civile per il triennio ${d.primo} - ${d.ultimo}</div>
            <p>Egregi Signori,</p>
            <p>facendo seguito alla Vostra gradita richiesta, siamo lieti di sottoporre la nostra proposta per i servizi di Revisione legale ai sensi dell'art. 13 del D.Lgs. n. 39/2010 secondo le caratteristiche e le condizioni di seguito esposte.</p>
            <p>Oggetto della proposta e:</p>
            <ul>
                <li>la revisione legale del bilancio d'esercizio per ciascuno dei tre esercizi con chiusura dal 31/12/${d.primo} al 31/12/${d.ultimo}, della societa ${esc(inc.cliente)} (di seguito anche "Societa"), ai sensi e per gli effetti dell'art. 14, comma 1, lettera a) del D.Lgs. n. 39/2010;</li>
                <li>la verifica, nel corso dell'esercizio, della regolare tenuta della contabilita sociale e della corretta rilevazione dei fatti di gestione nelle scritture contabili, ai sensi dell'art. 14, comma 1, lettera b) del D.Lgs. n. 39/2010;</li>
                <li>la verifica della coerenza della relazione sulla gestione con il bilancio d'esercizio, ai sensi dell'art. 14, comma 2, lettera e) del D.Lgs. n. 39/2010;</li>
                <li>la durata dell'incarico e di tre esercizi ai sensi dell'art. 17, comma 1, del D.Lgs. n. 39/2010${d.fine ? ', con scadenza alla data dell\'assemblea convocata per l\'approvazione del bilancio relativo all\'esercizio ' + d.ultimo + ' (indicativamente entro il ' + esc(fmtData(d.fine)) + ')' : ''};</li>
                <li>le attivita volte alla sottoscrizione delle dichiarazioni fiscali in base all'art. 1, comma 5, D.P.R. 22 luglio 1998, n. 322, come modificato dall'art. 1, comma 94, L. n. 244/2007.</li>
            </ul>
            ${blocchiComuniLettera(inc)}
            <h2>4. Personale impiegato, tempi e corrispettivi</h2>
            <p>La determinazione dei tempi e dei corrispettivi relativi all'incarico oggetto della presente proposta e stata effettuata in conformita ai criteri generali fissati in base all'art. 10, comma 10, del D.Lgs. n. 39/2010, considerando la dimensione, composizione e rischiosita delle piu significative grandezze patrimoniali, economiche e finanziarie del bilancio della Vostra Societa, la preparazione tecnica e l'esperienza che il lavoro di revisione richiede e la necessita di assicurare un'adeguata attivita di supervisione e di indirizzo.</p>
            <p>Il responsabile dell'incarico e il Dott. ${esc(Persone.nomeCompleto(inc.respIncarico) || '____________')}. Il riesame della qualita dell'incarico e affidato a ${esc(inc.qualita || '____________')}. Il team di revisione e composto da: ${esc(inc.team || '____________')}${inc.referente ? ' (referente operativo: ' + esc(inc.referente) + ')' : ''}.</p>
            <p>Il riepilogo delle stime dei tempi di lavoro e dei relativi corrispettivi risulta essere il seguente:</p>
            ${tabellaCompensiLettera(inc, d, true)}
            <p>Le ore e i corrispettivi sopra indicati si riferiscono ad ognuno degli esercizi di riferimento della presente proposta.${d.compensoPrimo && d.compensoPrimo !== d.compenso ? ' Per il primo esercizio (' + d.primo + '), in considerazione delle attivita non ricorrenti di primo anno, le ore stimate sono ' + (d.orePrimo ? numFmt.format(d.orePrimo) : '____') + ' e il corrispettivo e pari a ' + eurFmt.format(d.compensoPrimo) + '.' : ''}${d.tariffa ? ' La stima si basa su una tariffa oraria media di ' + eurFmt.format(d.tariffa) + ', determinata con il metodo degli scaglioni dimensionali CNDCEC.' : ''} I tempi di lavoro sono stati stimati presupponendo che potremo contare sulla collaborazione del personale della Societa per la messa a disposizione di dati, documenti ed elaborazioni.</p>
            <h2>5. Altre spese e modalita di fatturazione</h2>
            <p>I corrispettivi sopra indicati riguardano esclusivamente le prestazioni professionali per la revisione legale e non comprendono le spese sostenute per lo svolgimento del lavoro (viaggi, vitto e alloggio), che verranno addebitate alla Societa nella stessa misura in cui sono sostenute. Saranno inoltre addebitate le spese accessorie relative a tecnologia, banche dati, software e servizi di segreteria e comunicazione, nella misura forfettaria del 5% degli onorari fatturati, oltre IVA.</p>
            <p>${testoFatturazioneLettera(inc)}, oltre spese ed IVA. Il pagamento dovra essere effettuato a 30 giorni data fattura tramite ricevuta bancaria a scadenza.</p>
            <h2>6. Condizioni generali</h2>
            <p>Formano parte integrante della presente proposta le condizioni generali dell'incarico (indipendenza e incompatibilita, riservatezza, comunicazioni con la governance, utilizzo del lavoro di esperti, conservazione delle carte di lavoro, limitazioni di responsabilita, interruzione anticipata ex art. 13 D.Lgs. 39/2010 e D.M. 261/2012) riportate nel documento completo, unitamente agli allegati.</p>
            ${firmeLettera(inc)}`;
    }

    function letteraVolontaria(inc) {
        const d = datiLettera(inc);
        return `
            ${intestazioneLettera(inc)}
            <div class="oggetto">Oggetto: Proposta di Incarico di Revisione Legale per l'esercizio ${d.primo} - REVISIONE LIMITATA ANNUALE VOLONTARIA</div>
            <p>Egregi Signori,</p>
            <p>facendo seguito alla Vostra gradita richiesta, siamo lieti di sottoporre la nostra proposta per lo svolgimento della revisione volontaria del bilancio d'esercizio della Vostra Societa, secondo le caratteristiche e le condizioni di seguito esposte.</p>
            <p>Oggetto della proposta e:</p>
            <ul>
                <li>la revisione volontaria del bilancio d'esercizio con chiusura al 31/12/${d.primo}, della societa ${esc(inc.cliente)} (di seguito anche "Societa");</li>
                <li>la verifica, nel corso dell'esercizio, della regolare tenuta della contabilita sociale e della corretta rilevazione dei fatti di gestione nelle scritture contabili;</li>
                <li>la durata dell'incarico e relativa ad un solo esercizio${d.fine ? ', con conclusione delle attivita indicativamente entro il ' + esc(fmtData(d.fine)) : ''}; l'eventuale rinnovo per gli esercizi successivi sara oggetto di separata proposta.</li>
            </ul>
            <p>L'incarico, di natura volontaria, non comporta l'iscrizione presso il Registro dei revisori tenuto dal MEF prevista per gli incarichi di revisione legale ex art. 13 del D.Lgs. n. 39/2010.</p>
            ${blocchiComuniLettera(inc)}
            <h2>4. Tempi e corrispettivi</h2>
            <p>La determinazione dei tempi e dei corrispettivi e stata effettuata in conformita ai criteri generali fissati in base all'art. 10, comma 10, del D.Lgs. n. 39/2010, considerando la dimensione, composizione e rischiosita delle piu significative grandezze patrimoniali, economiche e finanziarie del bilancio della Vostra Societa.</p>
            <p>Il responsabile dell'incarico e il Dott. ${esc(Persone.nomeCompleto(inc.respIncarico) || '____________')}. Il riesame della qualita dell'incarico e affidato a ${esc(inc.qualita || '____________')}. Il team di revisione e composto da: ${esc(inc.team || '____________')}${inc.referente ? ' (referente operativo: ' + esc(inc.referente) + ')' : ''}.</p>
            ${tabellaCompensiLettera(inc, d, false)}
            <p>Le ore e i corrispettivi sopra indicati si riferiscono all'esercizio di riferimento della presente proposta. I tempi di lavoro sono stati stimati presupponendo che potremo contare sulla collaborazione del personale della Societa.</p>
            <h2>5. Altre spese e modalita di fatturazione</h2>
            <p>I corrispettivi sopra indicati non comprendono le spese sostenute per lo svolgimento del lavoro (viaggi, vitto e alloggio), che verranno addebitate alla Societa nella stessa misura in cui sono sostenute. Saranno inoltre addebitate le spese accessorie relative a tecnologia, banche dati, software e servizi di segreteria e comunicazione, nella misura forfettaria del 5% degli onorari fatturati, oltre IVA.</p>
            <p>${testoFatturazioneLettera(inc)}, oltre spese ed IVA. Il pagamento dovra essere effettuato a 30 giorni data fattura tramite ricevuta bancaria a scadenza.</p>
            <h2>6. Condizioni generali</h2>
            <p>Formano parte integrante della presente proposta le condizioni generali dell'incarico (riservatezza, limiti di utilizzo della relazione, conservazione delle carte di lavoro, limitazioni di responsabilita, interruzione anticipata) riportate nel documento completo, unitamente agli allegati.</p>
            ${firmeLettera(inc)}`;
    }

    /* =========================================================
       GRAFICI (canvas, senza librerie esterne)
    ========================================================= */
    function preparaCanvas(id, altezza) {
        const canvas = document.getElementById(id);
        if (!canvas) return null;
        const dpr = window.devicePixelRatio || 1;
        const larghezza = canvas.parentElement.getBoundingClientRect().width || 600;
        canvas.width = larghezza * dpr;
        canvas.height = altezza * dpr;
        canvas.style.width = larghezza + 'px';
        canvas.style.height = altezza + 'px';
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx, w: larghezza, h: altezza };
    }

    function disegnaGraficoBarre(id, etichette, valori) {
        const c = preparaCanvas(id, 200);
        if (!c) return;
        const { ctx, w, h } = c;
        const max = Math.max(...valori, 1);
        const margine = { sx: 10, dx: 10, su: 14, giu: 24 };
        const areaW = w - margine.sx - margine.dx;
        const barW = Math.min(46, areaW / etichette.length * 0.62);
        const passo = areaW / etichette.length;
        ctx.clearRect(0, 0, w, h);
        etichette.forEach((e, i) => {
            const v = valori[i];
            const x = margine.sx + passo * i + (passo - barW) / 2;
            const alt = (h - margine.su - margine.giu) * (v / max);
            ctx.fillStyle = '#164068';
            ctx.beginPath();
            ctx.roundRect(x, h - margine.giu - alt, barW, alt, 4);
            ctx.fill();
            ctx.fillStyle = '#475569';
            ctx.font = '10px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(e, x + barW / 2, h - 8);
            if (v > 0) {
                ctx.fillStyle = '#0A2844';
                ctx.font = 'bold 9px Inter';
                ctx.fillText(Math.round(v / 1000) + 'k', x + barW / 2, h - margine.giu - alt - 4);
            }
        });
    }

    function disegnaGraficoTrend(id) {
        const c = preparaCanvas(id, 280);
        if (!c) return;
        const { ctx, w, h } = c;
        const incarichi = Incarichi.tutti();
        const anni = Incarichi.anniConCompensi();
        const valori = anni.map(a => incarichi.reduce((s, i) => s + Incarichi.compensoAnno(i, a), 0));
        const max = Math.max(...valori, 1);
        const margine = { sx: 56, dx: 16, su: 20, giu: 30 };
        const areaW = w - margine.sx - margine.dx;
        const areaH = h - margine.su - margine.giu;
        ctx.clearRect(0, 0, w, h);

        // griglia orizzontale
        ctx.strokeStyle = '#E2E8F0';
        ctx.fillStyle = '#94A3B8';
        ctx.font = '10px Inter';
        ctx.textAlign = 'right';
        for (let g = 0; g <= 4; g++) {
            const y = margine.su + areaH * (1 - g / 4);
            ctx.beginPath();
            ctx.moveTo(margine.sx, y);
            ctx.lineTo(w - margine.dx, y);
            ctx.stroke();
            ctx.fillText(Math.round(max * g / 4 / 1000) + 'k', margine.sx - 8, y + 3);
        }

        const passo = areaW / anni.length;
        const barW = Math.min(56, passo * 0.55);
        const annoOra = annoCorrente();
        const punti = [];
        anni.forEach((a, i) => {
            const v = valori[i];
            const x = margine.sx + passo * i + (passo - barW) / 2;
            const alt = areaH * (v / max);
            ctx.fillStyle = a > annoOra ? '#9DB8D2' : (a === annoOra ? '#C9A227' : '#164068');
            ctx.beginPath();
            ctx.roundRect(x, margine.su + areaH - alt, barW, alt, 5);
            ctx.fill();
            ctx.fillStyle = '#475569';
            ctx.font = '11px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(String(a), x + barW / 2, h - 10);
            if (v > 0) {
                ctx.fillStyle = '#0A2844';
                ctx.font = 'bold 10px Inter';
                ctx.fillText(eurFmt.format(v).replace(/ ?€/, '').trim() + ' €', x + barW / 2, margine.su + areaH - alt - 6);
            }
            punti.push({ x: x + barW / 2, y: margine.su + areaH - alt });
        });

        // linea di tendenza
        ctx.strokeStyle = '#B3261E';
        ctx.lineWidth = 2;
        ctx.beginPath();
        punti.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.stroke();
        punti.forEach(p => {
            ctx.fillStyle = '#B3261E';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.lineWidth = 1;
    }

    /* =========================================================
       ACCESSO: gestione schermata e flussi
    ========================================================= */
    function mostraMessaggio(titolo, testo) {
        apriModale(`<h2>${esc(titolo)}</h2>
            <p>${esc(testo)}</p>
            <div class="modale-azioni"><button class="btn btn-primary" id="m-ok">Ho capito</button></div>`);
        document.getElementById('m-ok').addEventListener('click', chiudiModale);
    }

    function mostraPasswordTemporanea(email, temp, nota) {
        apriModale(`<h2>Password temporanea generata</h2>
            <p>In un sistema di produzione questa password verrebbe inviata via email a <strong>${esc(email)}</strong>. In questa dimostrazione viene mostrata qui:</p>
            <div class="password-temporanea">${esc(temp)}</div>
            <p class="descrizione">${esc(nota || 'Accedi con questa password: ti verra chiesto di sceglierne una nuova.')}</p>
            <div class="modale-azioni"><button class="btn btn-primary" id="m-ok">Ho copiato la password</button></div>`, { bloccante: true });
        document.getElementById('m-ok').addEventListener('click', chiudiModale);
    }

    function chiediEmail(titolo, descrizione, callback) {
        apriModale(`<h2>${esc(titolo)}</h2>
            <p class="descrizione" style="margin-bottom:12px;">${esc(descrizione)}</p>
            <div class="campo"><label>Indirizzo email</label><input id="m-email" type="email" placeholder="nome@studio.it"></div>
            <div class="msg-errore hidden" id="m-errore"></div>
            <div class="modale-azioni">
                <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                <button class="btn btn-primary" id="m-conferma">Procedi</button>
            </div>`);
        const emailLogin = document.getElementById('login-email').value.trim();
        if (emailLogin) document.getElementById('m-email').value = emailLogin;
        document.getElementById('m-annulla').addEventListener('click', chiudiModale);
        const btnProc = document.getElementById('m-conferma');
        btnProc.addEventListener('click', () => conAttesa(btnProc, async () => {
            const email = document.getElementById('m-email').value.trim();
            if (!email) return;
            const esito = await callback(email);
            if (!esito.ok) {
                const err = document.getElementById('m-errore');
                err.textContent = esito.msg;
                err.classList.remove('hidden');
            }
        }, { testo: 'Invio…' }));
    }

    function chiediCambioPassword(email, obbligatorio, dopo) {
        apriModale(`<h2>Imposta una nuova password</h2>
            <p class="descrizione" style="margin-bottom:12px;">${obbligatorio ? 'Al primo accesso (o dopo un recupero) devi scegliere una password personale.' : 'Scegli la nuova password.'} Requisiti: almeno 8 caratteri, una maiuscola, una minuscola e una cifra.</p>
            <div class="campo"><label>Nuova password</label><input id="m-p1" type="password" autocomplete="new-password"></div>
            <div class="campo"><label>Ripeti la nuova password</label><input id="m-p2" type="password" autocomplete="new-password"></div>
            <div class="msg-errore hidden" id="m-errore"></div>
            <div class="modale-azioni">
                ${obbligatorio ? '' : '<button class="btn btn-ghost" id="m-annulla">Annulla</button>'}
                <button class="btn btn-primary" id="m-conferma">Salva password</button>
            </div>`, { bloccante: obbligatorio });
        const annulla = document.getElementById('m-annulla');
        if (annulla) annulla.addEventListener('click', chiudiModale);
        const btnCambio = document.getElementById('m-conferma');
        btnCambio.addEventListener('click', () => conAttesa(btnCambio, async () => {
            const p1 = document.getElementById('m-p1').value, p2 = document.getElementById('m-p2').value;
            const err = document.getElementById('m-errore');
            if (p1 !== p2) { err.textContent = 'Le due password non coincidono.'; err.classList.remove('hidden'); return; }
            const esito = await Auth.cambiaPassword(email, p1);
            if (!esito.ok) { err.textContent = esito.msg; err.classList.remove('hidden'); return; }
            chiudiModale();
            toast('Password aggiornata.', 'verde');
            if (dopo) dopo();
        }, { testo: 'Salvataggio…' }));
    }

    function mostraLogin() {
        document.getElementById('app').classList.add('hidden');
        document.getElementById('schermata-login').classList.remove('hidden');
    }

    function mostraApp() {
        segnaAttivita();
        Persone.migraNomi(); // porta i vecchi record "nomeCompleto" ai campi nome/cognome
        document.getElementById('schermata-login').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        collegaHamburger();
        document.getElementById('utente-nome').textContent = Auth.utenteCorrente.nome;
        const RUOLI = { admin: 'Amministratore', qualita: 'Responsabile qualita', procuratore: 'Procuratore' };
        document.getElementById('utente-ruolo').textContent = RUOLI[Auth.utenteCorrente.ruolo] || Auth.utenteCorrente.ruolo;
        if (typeof Cloud !== 'undefined' && Cloud.attivo) Cloud.avviaPresenza();
        naviga('dashboard');
    }

    function collegaLogin() {
        document.getElementById('form-login').addEventListener('submit', async e => {
            e.preventDefault();
            const btnAccedi = e.currentTarget.querySelector('button[type="submit"]');
            // evita il doppio invio mentre l'accesso e in corso
            if (btnAccedi.classList.contains('caricamento')) return;
            const emailInput = document.getElementById('login-email');
            const pwdInput = document.getElementById('login-password');
            const toggleBtn = document.getElementById('toggle-password');
            const err = document.getElementById('login-errore');
            const email = emailInput.value.trim();
            const password = pwdInput.value;
            err.classList.add('hidden');

            // Caricamento chiaro: il pulsante mostra "Accesso in corso..." con
            // spinner e i campi si bloccano, cosi si capisce che sta elaborando.
            // L'attesa copre autenticazione E scaricamento dati (Auth.accedi le
            // fa entrambe): la fine e segnalata in modo netto dalla comparsa del
            // cruscotto (o dal messaggio d'errore se qualcosa non va).
            const testoOriginale = btnAccedi.textContent;
            const ripristina = () => {
                btnAccedi.classList.remove('caricamento');
                btnAccedi.textContent = testoOriginale;
                btnAccedi.disabled = false;
                emailInput.disabled = false;
                pwdInput.disabled = false;
                if (toggleBtn) toggleBtn.disabled = false;
            };
            btnAccedi.classList.add('caricamento');
            btnAccedi.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>Accesso in corso…</span>';
            btnAccedi.disabled = true;
            emailInput.disabled = true;
            pwdInput.disabled = true;
            if (toggleBtn) toggleBtn.disabled = true;

            try {
                const esito = await Auth.accedi(email, password);
                if (!esito.ok) {
                    err.textContent = esito.msg;
                    err.classList.remove('hidden');
                    return;
                }
                if (esito.mustChange) {
                    chiediCambioPassword(email, true, () => {
                        const u = Auth.trova(email);
                        Auth.utenteCorrente = u;
                        sessionStorage.setItem('rvArea.sessione', JSON.stringify({ email: u.email, ts: Date.now() }));
                        mostraApp();
                    });
                    return;
                }
                mostraApp();
            } catch (ex) {
                err.textContent = 'Accesso non riuscito. Riprova.';
                err.classList.remove('hidden');
            } finally {
                // ripristina sempre lo stato del pulsante/campi (in caso di
                // successo il cruscotto ha gia nascosto la schermata: invisibile)
                ripristina();
            }
        });

        // Mostra/nascondi la password nella schermata di accesso
        const inputPwd = document.getElementById('login-password');
        const btnPwd = document.getElementById('toggle-password');
        if (btnPwd && inputPwd) {
            const ICONA_MOSTRA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
            const ICONA_NASCONDI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
            const impostaVisibilita = mostra => {
                inputPwd.type = mostra ? 'text' : 'password';
                btnPwd.innerHTML = mostra ? ICONA_NASCONDI : ICONA_MOSTRA;
                btnPwd.setAttribute('aria-pressed', mostra ? 'true' : 'false');
                const testo = mostra ? 'Nascondi la password' : 'Mostra la password';
                btnPwd.setAttribute('aria-label', testo);
                btnPwd.title = testo;
            };
            btnPwd.addEventListener('click', () => {
                impostaVisibilita(inputPwd.type === 'password');
                inputPwd.focus();
            });
            // richiudi sempre alla visualizzazione della schermata di accesso
            btnPwd._reset = () => impostaVisibilita(false);
        }

        // In modalita Firebase gli account sono creati solo dall'amministratore
        // (vista Utenti): niente auto-registrazione dalla pagina di accesso.
        const btnPrima = document.getElementById('btn-prima-password');
        if (Cloud.attivo) {
            btnPrima.classList.add('hidden');
        } else {
            btnPrima.addEventListener('click', () => {
                chiediEmail('Richiedi la prima password',
                    'Se il tuo indirizzo e stato abilitato dall\'amministratore, verra generata una password temporanea per il primo accesso.',
                    async email => {
                        const esito = await Auth.richiediPrimaPassword(email);
                        if (esito.ok) {
                            chiudiModale();
                            document.getElementById('login-email').value = email;
                            if (esito.viaEmail) mostraMessaggio('Email inviata', 'Abbiamo inviato a ' + email + ' una email con il collegamento per impostare la password. Controlla anche la posta indesiderata, poi torna qui per accedere.');
                            else mostraPasswordTemporanea(email, esito.temp);
                        }
                        return esito;
                    });
            });
        }

        document.getElementById('link-recupero').addEventListener('click', () => {
            chiediEmail('Recupero password',
                Cloud.attivo
                    ? 'Riceverai una email con il collegamento per reimpostare la password.'
                    : 'Verra generata una nuova password temporanea, da cambiare al primo accesso.',
                async email => {
                    const esito = await Auth.recuperaPassword(email);
                    if (esito.ok) {
                        chiudiModale();
                        document.getElementById('login-email').value = email;
                        if (esito.viaEmail) mostraMessaggio('Email inviata', 'Se l\'indirizzo ' + email + ' corrisponde a un account, ricevera una email (da noreply@nextgenerationbusiness.it) con il collegamento per reimpostare la password. Controlla anche la posta indesiderata / spam.');
                        else mostraPasswordTemporanea(email, esito.temp);
                    }
                    return esito;
                });
        });

        document.getElementById('btn-logout').addEventListener('click', () => {
            Auth.esci();
            document.getElementById('login-password').value = '';
            if (btnPwd && btnPwd._reset) btnPwd._reset();
            mostraLogin();
        });
    }

    /* ---------- Uscita automatica per inattivita (30 minuti) ----------
       L'ultima attivita e persistita, cosi la scadenza vale anche dopo
       un reload o la riapertura della scheda (persistenza locale). */
    const INATTIVITA_MS = 30 * 60000;
    let _ultimoTimbroAttivita = 0;
    function segnaAttivita() {
        const ora = Date.now();
        // basta aggiornare ogni tanto: la soglia di inattivita e di 30 minuti
        if (ora - _ultimoTimbroAttivita < 20000) return;
        _ultimoTimbroAttivita = ora;
        try { localStorage.setItem('rvArea.ultimaAttivita', String(ora)); } catch (e) { }
    }
    function ultimaAttivita() { return Number(localStorage.getItem('rvArea.ultimaAttivita')) || 0; }
    function sessioneScaduta() { return Date.now() - ultimaAttivita() > INATTIVITA_MS; }
    ['click', 'keydown', 'mousemove', 'scroll'].forEach(ev =>
        document.addEventListener(ev, () => { if (Auth.utenteCorrente) segnaAttivita(); }, { passive: true }));
    setInterval(() => {
        if (Auth.utenteCorrente && sessioneScaduta()) {
            Auth.esci();
            mostraLogin();
            toast('Sessione chiusa per inattivita.');
        }
    }, 60000);

    /* Gancio diagnostico: generazione PDF senza scaricare il file */
    window.rvDebug = {
        pdfIncarico: (id, opzioni) => generaPdfIncarico(Incarichi.trova(id), opzioni || { restituisciBytes: true }),
        // enrichPersone({ "Cognome": "Nome Cognome", ... }): imposta il nome proprio
        // (ricavato togliendo il cognome finale), creando la persona se manca
        enrichPersone: (mappa) => {
            const lista = Persone.tutte();
            const indice = {};
            lista.forEach(p => { indice[p.nome.toLowerCase()] = p; });
            let aggiornate = 0, create = 0;
            const nomeProprioDa = (completo, cognome) => {
                const nc = String(completo || '').trim(), cog = String(cognome || '').trim();
                return (cog && nc.toLowerCase().endsWith(cog.toLowerCase())) ? nc.slice(0, nc.length - cog.length).trim() : nc;
            };
            Object.keys(mappa).forEach(cognome => {
                const np = nomeProprioDa(mappa[cognome], cognome);
                const chiave = cognome.toLowerCase();
                if (indice[chiave]) {
                    if (indice[chiave].nomeProprio !== np) { indice[chiave].nomeProprio = np; aggiornate++; }
                } else {
                    const nuova = { id: uid(), nome: cognome, nomeProprio: np, qualita: false, respIncarico: false, team: true, attivo: true };
                    lista.push(nuova); indice[chiave] = nuova; create++;
                }
            });
            Persone.salva(lista);
            Audit.registra(Auth.utenteCorrente, 'Nominativi completi importati', 'sistema', null, null,
                aggiornate + ' aggiornate, ' + create + ' create dai dati ASSOCIATI');
            return { aggiornate, create };
        },

        // importaAderenti([{nominativo,cognome,nomeCompleto,email,cellulare,telefono,regione,provincia,localita,indirizzo}, ...]):
        // arricchisce le persone esistenti (match per cognome come parola iniziale del nominativo)
        // e aggiunge le nuove. I dati restano solo nel cloud, mai nel repo.
        importaAderenti: (aderenti) => {
            const lista = Persone.tutte();
            const perCognome = {};
            lista.forEach(p => { perCognome[p.nome.toLowerCase()] = p; });
            let aggiornate = 0, create = 0;
            const nomeProprioDa = (completo, cognome) => {
                const nc = String(completo || '').trim(), cog = String(cognome || '').trim();
                if (!nc) return '';
                return (cog && nc.toLowerCase().endsWith(cog.toLowerCase())) ? nc.slice(0, nc.length - cog.length).trim() : nc;
            };
            const applica = (p, a) => {
                const contatti = {
                    nomeProprio: a.nomeProprio || nomeProprioDa(a.nomeCompleto, a.cognome || p.nome) || p.nomeProprio || '',
                    email: a.email || p.email || '',
                    telefono: a.cellulare || a.telefono || p.telefono || '',
                    regione: a.regione || p.regione || '',
                    provincia: a.provincia || p.provincia || '',
                    localita: a.localita || p.localita || '',
                    indirizzo: a.indirizzo || p.indirizzo || ''
                };
                Object.assign(p, contatti);
            };
            aderenti.forEach(a => {
                const nomLow = String(a.nominativo || '').toLowerCase();
                // fra le persone esistenti, quella il cui cognome e parola iniziale del nominativo
                // (prende il cognome piu lungo per gestire "Lo Piccolo" vs "Lo")
                let match = null;
                lista.forEach(p => {
                    const c = p.nome.toLowerCase();
                    if (nomLow === c || nomLow.startsWith(c + ' ')) {
                        if (!match || p.nome.length > match.nome.length) match = p;
                    }
                });
                if (match) { applica(match, a); aggiornate++; return; }
                // nessun match: nuova persona (evita doppioni per cognome nello stesso import)
                const chiave = String(a.cognome || '').toLowerCase();
                if (!chiave) return;
                if (perCognome[chiave]) { applica(perCognome[chiave], a); aggiornate++; return; }
                const nuova = { id: uid(), nome: a.cognome, qualita: false, respIncarico: false, team: true, attivo: true };
                applica(nuova, a);
                lista.push(nuova); perCognome[chiave] = nuova; create++;
            });
            Persone.salva(lista);
            Audit.registra(Auth.utenteCorrente, 'Anagrafica aderenti importata', 'sistema', null, null,
                aggiornate + ' persone arricchite, ' + create + ' aggiunte (elenco aderenti Revilaw)');
            return { aggiornate, create, totale: lista.length };
        }
    };

    /* =========================================================
       AVVIO
    ========================================================= */
    (async function avvia() {
        await Cloud.init();
        // in modalita cloud i dati arrivano da Firestore: niente demo locali,
        // ma l'anagrafica del team parte comunque dal roster
        if (Cloud.attivo) Store.seedPersone();
        else Store.seed();
        collegaLogin();
        if (Cloud.attivo) {
            const avviso = document.querySelector('.avviso-demo');
            if (avviso) avviso.innerHTML = '<strong>Accesso protetto.</strong> L\'accesso e riservato agli utenti abilitati dall\'amministratore; la password si imposta e si recupera tramite email. Se non hai ancora le credenziali, contatta l\'amministratore.';
            const u = await Cloud.utenteDaSessione();
            if (u) { Auth.utenteCorrente = u; mostraApp(); return; }
            mostraLogin();
            return;
        }
        if (Auth.ripristinaSessione()) mostraApp();
        else mostraLogin();
    })();

})();
