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
    // icone lineari (stroke = currentColor, si adattano al colore del contesto)
    const ICO_LUCCHETTO = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    const ICO_ALLERTA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:7px;"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    // fatturazione predefinita in base al tipo di incarico
    function fatturazionePredefinita(tipo) {
        if (tipo === 'legale') return 'trimestrale';
        return 'annuale';
    }
    // descrizione leggibile della modalita di fatturazione (con finestra o data specifica)
    const MESI_BREVI_FATT = ['', 'gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    function descriviFatturazione(inc) {
        const per = inc.fatturazione || 'annuale';
        const et = p => (p && p.mese) ? (MESI_BREVI_FATT[p.mese] + ' ' + p.anno) : '';
        if (per === 'specifica') return inc.fattData ? ('data specifica: ' + fmtData(inc.fattData)) : 'data specifica (da impostare)';
        const nome = per === 'mensile' ? 'Mensile' : (per === 'trimestrale' ? 'Trimestrale' : 'Annuale');
        const fin = [];
        if (inc.fattInizio) fin.push('da ' + et(inc.fattInizio));
        if (inc.fattFine) fin.push('a ' + et(inc.fattFine));
        return nome + (fin.length ? ' (' + fin.join(', ') + ')' : '');
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
    /* Chiave di confronto di una regione: uguale per grafie diverse della STESSA regione
       (maiuscole, accenti, apostrofi dritti/curvi, trattino vs spazio). Cosi'
       "Trentino-Alto Adige", "Trentino Alto Adige" e "TRENTINO ALTO ADIGE" coincidono,
       e "Valle d'Aosta" con apostrofo dritto o curvo coincide. Usata per il filtro
       regione dei coordinatori e per raggruppare le regioni. */
    function chiaveRegione(r) {
        return String(r == null ? '' : r).trim().toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')    // via gli accenti
            .replace(/['’`]/g, '')                // via gli apostrofi (dritto e curvo)
            .replace(/[\s-]+/g, ' ');                            // trattini e spazi multipli -> spazio
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
    /* Solo la data (senza ora) a partire da un timestamp. */
    function fmtGiorno(ts) {
        const d = new Date(ts);
        return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
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
        rimborsi: 'rvArea.rimborsiSpese',
        allerte: 'rvArea.allerte',
        comunicazioni: 'rvArea.comunicazioni',
        sondaggi: 'rvArea.sondaggi',
        ruoli: 'rvArea.ruoli',
        impostazioni: 'rvArea.impostazioni'
    };

    /* Sezioni su cui un ruolo puo' avere: 'no' (nascosta), 'lettura' (vede ma non tocca),
       'scrittura' (piena). "Utenti", "Ruoli" e "Dati e backup" non sono qui: restano
       riservate ad amministratore e titolare, non delegabili a un ruolo su misura. */
    const SEZIONI_RUOLO = [
        { id: 'dashboard', nome: 'Cruscotto' },
        { id: 'incarichi', nome: 'Incarichi' },
        { id: 'fatturazione', nome: 'Fatturazione' },
        { id: 'report', nome: 'Report compensi' },
        { id: 'persone', nome: 'Persone' },
        { id: 'comunicazioni', nome: 'Comunicazioni' },
        { id: 'sondaggi', nome: 'Sondaggi' },
        { id: 'registro', nome: 'Registro modifiche' }
    ];
    const LIVELLI_SEZIONE = { no: 'Nascosta', lettura: 'Sola lettura', scrittura: 'Scrittura' };
    const sezioniTutte = liv => { const o = {}; SEZIONI_RUOLO.forEach(s => { o[s.id] = liv; }); return o; };
    /* Ruoli predefiniti: coincidono con i ruoli storici (admin/qualita/procuratore) cosi' gli
       utenti gia' presenti continuano a funzionare esattamente come prima (accesso pieno).
       "Coordinatore territoriale" e il suo vice sono ruoli di sistema: SEMPRE in sola
       visualizzazione, limitati agli incarichi delle regioni della loro scheda in Persone
       (la Regione della scheda piu' le eventuali altre regioni coordinate). */
    const RUOLI_DEFAULT = [
        { id: 'admin', nome: 'Amministratore', builtin: true, sezioni: sezioniTutte('scrittura') },
        { id: 'qualita', nome: 'Responsabile qualita', builtin: true, sezioni: sezioniTutte('scrittura') },
        { id: 'procuratore', nome: 'Procuratore', builtin: true, sezioni: sezioniTutte('scrittura') },
        { id: 'coordinatore', nome: 'Coordinatore territoriale', builtin: true, sistema: true, sezioni: sezioniTutte('lettura') },
        { id: 'vicecoordinatore', nome: 'Vice coordinatore territoriale', builtin: true, sistema: true, sezioni: sezioniTutte('lettura') }
    ];

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
            Ruoli.seed();
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
       RUOLI (permessi per sezione + filtro regione).
       L'amministratore li crea e li modifica; ogni utente ha un ruolo
       (il campo utente.ruolo) che punta qui per id.
    ========================================================= */
    const Ruoli = {
        tutti() {
            const l = Store.leggi(CHIAVI.ruoli, null);
            const lista = Array.isArray(l) && l.length ? l.slice() : RUOLI_DEFAULT.map(r => ({ ...r, sezioni: { ...r.sezioni } }));
            // i ruoli di sistema (coordinatore e vice) ci sono sempre, anche negli elenchi
            // salvati prima che esistessero, e i loro id sono riservati. Se un vecchio ruolo
            // personalizzato occupava per caso uno di quegli id (possibile con le versioni
            // precedenti), viene riportato al profilo di sistema: e' comunque quello che il
            // programma applica a chi ha quel ruolo, meglio che l'elenco dica la verita'.
            RUOLI_DEFAULT.filter(d => d.sistema).forEach(d => {
                const idx = lista.findIndex(r => r.id === d.id);
                if (idx < 0) lista.push({ ...d, sezioni: { ...d.sezioni } });
                else if (!lista[idx].sistema) lista[idx] = { ...d, sezioni: { ...d.sezioni } };
            });
            return lista;
        },
        salva(lista) { Store.scrivi(CHIAVI.ruoli, lista); },
        trova(id) { return this.tutti().find(r => r.id === id) || null; },
        // il seed resta SOLO locale: i ruoli su Firestore li scrive l'amministratore (le regole
        // permettono la scrittura di archivio/ruoli al solo admin). In cloud arrivano dal server.
        seed() {
            if (!localStorage.getItem(CHIAVI.ruoli)) {
                try { localStorage.setItem(CHIAVI.ruoli, JSON.stringify(RUOLI_DEFAULT.map(r => ({ ...r, sezioni: { ...r.sezioni } })))); } catch (e) { }
            }
        },
        // normalizza un ruolo letto da fuori: garantisce le chiavi sezione
        normalizza(r) {
            const sez = {};
            SEZIONI_RUOLO.forEach(s => { const v = r && r.sezioni && r.sezioni[s.id]; sez[s.id] = (v === 'lettura' || v === 'scrittura') ? v : 'no'; });
            return { id: r.id, nome: r.nome || r.id, builtin: !!r.builtin, sistema: !!r.sistema, sezioni: sez };
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
       COMUNICAZIONI (mail preparate: bozze condivise e inviate)
       Record: { id, oggetto, testo, destinatari:[email], stato:'bozza'|'inviata',
                 creato:{da,il}, inviata?:{da,il,n} }
    ========================================================= */
    const Comunicazioni = {
        tutte() { return Store.leggi(CHIAVI.comunicazioni, []); },
        salva(l) { Store.scrivi(CHIAVI.comunicazioni, l); },
        trova(id) { return this.tutte().find(c => c.id === id) || null; },
        salvaUna(c) {
            const lista = this.tutte();
            const i = lista.findIndex(x => x.id === c.id);
            if (i >= 0) {
                // Riconcilia con la versione piu fresca gia in archivio: se il server
                // (invio programmato) ha avanzato la schedulazione o registrato un invio
                // mentre la modale era aperta, non riportarlo indietro col valore del form.
                const cur = lista[i];
                const chiave = v => (v && v.il || 0) + '|' + (v && v.da || '') + '|' + (v && v.n || '');
                const visti = new Set(), uniti = [];
                [].concat(cur.invii || [], c.invii || []).forEach(v => { const k = chiave(v); if (!visti.has(k)) { visti.add(k); uniti.push(v); } });
                c.invii = uniti;
                // riconcilia solo se la versione in archivio e' ATTIVA (solo allora il server puo averla fatta
                // avanzare): se e' sospesa o disattivata non va mai riportata indietro sul valore del form,
                // altrimenti riprogrammandola a una data anticipata sparirebbe da tutte le sezioni.
                if (c.programmazione && cur.programmazione && cur.programmazione.attiva !== false && !cur.sospesa
                    && (cur.programmazione.prossimoInvio || 0) > (c.programmazione.prossimoInvio || 0)) {
                    c.programmazione = Object.assign({}, c.programmazione, {
                        prossimoInvio: cur.programmazione.prossimoInvio,
                        ultimoInvio: cur.programmazione.ultimoInvio,
                        attiva: cur.programmazione.attiva
                    });
                }
                if (cur.stato === 'inviata') { c.stato = 'inviata'; if (cur.inviata) c.inviata = cur.inviata; }
                lista[i] = c;
            } else lista.unshift(c);
            this.salva(lista);
        },
        elimina(id) { this.salva(this.tutte().filter(c => c.id !== id)); }
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

    /* ---- Variabili di personalizzazione delle comunicazioni ----
       Nel testo/oggetto si possono usare {nome} {cognome} {nome_completo}
       {incarichi}; vengono sostituite per ogni destinatario. {incarichi} nel
       testo HTML diventa una tabella (cliente, resp. qualita, resp. incarico). */
    const VARIABILI_MAIL = [
        { chiave: 'nome', desc: 'Nome della persona (o ragione sociale del cliente)' },
        { chiave: 'cognome', desc: 'Cognome della persona' },
        { chiave: 'nome_completo', desc: 'Nome e cognome (o ragione sociale)' },
        { chiave: 'incarichi', desc: 'Tabella degli incarichi della persona: cliente, resp. qualita e resp. incarico (aggiornata a ogni invio). Nel testo del messaggio diventa una tabella; nell\'oggetto resta l\'elenco dei clienti.' },
        { chiave: 'periodo', desc: 'Periodo di riferimento (es. "primo trimestre 2026"): solo per invii programmati ricorrenti, dipende dalla frequenza e dalla data di ogni invio' }
    ];
    // {periodo} e una variabile "di invio" (uguale per tutti i destinatari), calcolata
    // dalla frequenza + data; sostituita a parte, non da applicaVariabili.
    function sostituisciPeriodo(s, periodo) { return String(s == null ? '' : s).replace(/\{periodo\}/g, periodo || ''); }
    const RE_VARIABILI = /\{(nome_completo|nome|cognome|email|incarichi)\}/;
    function haVariabili(s) { return RE_VARIABILI.test(String(s || '')); }
    function applicaVariabili(s, d) {
        d = d || {};
        const nc = (d.nome && d.cognome) ? (d.nome + ' ' + d.cognome) : (d.nome || d.cognome || '');
        // funzioni di sostituzione: il valore e' inserito LETTERALE (evita che un "$" nel testo
        // venga interpretato come riferimento speciale di String.replace)
        return String(s == null ? '' : s)
            .replace(/\{nome_completo\}/g, () => nc)
            .replace(/\{nome\}/g, () => d.nome || '')
            .replace(/\{cognome\}/g, () => d.cognome || '')
            .replace(/\{email\}/g, () => d.email || '')
            .replace(/\{incarichi\}/g, () => d.incarichi || '');
    }
    // come applicaVariabili ma per contenuto HTML: i valori vengono escaped, tranne {incarichi}
    // che e' gia' una TABELLA HTML pronta (incarichiHtml) e va inserita RAW.
    function applicaVariabiliHtml(s, d) {
        d = d || {};
        return applicaVariabili(s, { nome: esc(d.nome || ''), cognome: esc(d.cognome || ''), email: esc(d.email || ''), incarichi: (d.incarichiHtml != null ? d.incarichiHtml : esc(d.incarichi || '')) });
    }
    // clienti degli incarichi in cui la persona (per cognome) compare come team,
    // responsabile incarico o referente (NON come responsabile della qualita)
    function incarichiDiCognome(cognome, incarichi) {
        const cg = String(cognome || '').trim().toLowerCase();
        if (!cg) return [];
        const out = [];
        (incarichi || []).forEach(inc => {
            const tok = [];
            [inc.team, inc.respIncarico, inc.referente].forEach(f => { if (f) dividiNomi(String(f)).forEach(t => tok.push(t.trim().toLowerCase())); });
            if (tok.indexOf(cg) >= 0 && inc.cliente) out.push(inc.cliente);
        });
        return Array.from(new Set(out));
    }
    // gli incarichi come oggetti {cliente, qualita, respIncarico} per costruire la tabella {incarichi}
    function incarichiObjDiCognome(cognome, incarichi) {
        const cg = String(cognome || '').trim().toLowerCase();
        if (!cg) return [];
        const out = [], visti = {};
        (incarichi || []).forEach(inc => {
            const tok = [];
            [inc.team, inc.respIncarico, inc.referente].forEach(f => { if (f) dividiNomi(String(f)).forEach(t => tok.push(t.trim().toLowerCase())); });
            if (tok.indexOf(cg) >= 0 && inc.cliente && !visti[inc.cliente]) { visti[inc.cliente] = 1; out.push({ cliente: inc.cliente, qualita: inc.qualita || '', respIncarico: inc.respIncarico || '' }); }
        });
        return out;
    }
    // tabella HTML (email-safe) degli incarichi della persona: cliente, resp. qualita, resp. incarico
    function tabellaIncarichiHtml(objs) {
        if (!objs || !objs.length) return ''; // niente incarichi: {incarichi} sparisce (coerente su tutti i canali)
        const th = 'border:1px solid #CBD5E1;padding:6px 9px;text-align:left;background:#F1F5F9;';
        const td = 'border:1px solid #CBD5E1;padding:6px 9px;';
        return '<table style="border-collapse:collapse;margin:10px 0;font-size:13px;"><tr>'
            + '<th style="' + th + '">Incarico</th><th style="' + th + '">Resp. qualita</th><th style="' + th + '">Resp. incarico</th></tr>'
            + objs.map(o => '<tr><td style="' + td + '">' + esc(o.cliente) + '</td><td style="' + td + '">' + esc(o.qualita || '-') + '</td><td style="' + td + '">' + esc(o.respIncarico || '-') + '</td></tr>').join('')
            + '</table>';
    }
    // per una lista di email, costruisce i dati di personalizzazione di ciascun destinatario
    function datiDestinatari(emails) {
        const persone = (typeof Persone !== 'undefined') ? Persone.tutte() : [];
        const incarichi = (typeof Incarichi !== 'undefined') ? Incarichi.tutti() : [];
        const perEmail = {}, cliEmail = {};
        persone.forEach(p => { if (p.email) perEmail[String(p.email).toLowerCase()] = p; });
        incarichi.forEach(i => { [i.email1, i.email2].forEach(e => { if (e) { const k = String(e).toLowerCase(); if (!cliEmail[k]) cliEmail[k] = i.cliente; } }); });
        return (emails || []).map(email => {
            const k = String(email || '').toLowerCase();
            const p = perEmail[k];
            if (p) { const cognome = p.nome || ''; const objs = incarichiObjDiCognome(cognome, incarichi); return { email: k, nome: p.nomeProprio || cognome, cognome: cognome, incarichi: objs.map(o => o.cliente).join(', '), incarichiHtml: tabellaIncarichiHtml(objs) }; }
            if (cliEmail[k]) return { email: k, nome: cliEmail[k], cognome: '', incarichi: '', incarichiHtml: '' };
            return { email: k, nome: '', cognome: '', incarichi: '', incarichiHtml: '' };
        });
    }

    /* =========================================================
       FUSIONE A 3 VIE (sincronizzazione concorrente)
       ---------------------------------------------------------
       Ogni elenco condiviso e salvato come un unico documento: senza
       accortezze, il salvataggio di un utente sovrascriverebbe l'intera
       lista cancellando le modifiche fatte nel frattempo da un altro.
       Qui si calcolano le MIE differenze (base -> mio locale) e si
       applicano SOPRA lo stato remoto attuale, per record: per id negli
       array (incarichi, persone, allerte), per chiave negli oggetti
       (stati fatture), in append-only per l'audit. Cosi modifiche a
       record diversi non si perdono; sullo stesso record vince l'ultimo.
       Le funzioni sono pure e collaudate a parte.
    ========================================================= */
    function _formaDati(chiave) {
        if (chiave === CHIAVI.fatture) return 'oggetto';
        if (chiave === CHIAVI.audit) return 'audit';
        return 'array';
    }
    function _parseDati(str, forma) {
        try { const v = JSON.parse(str); return v == null ? (forma === 'oggetto' ? {} : []) : v; }
        catch (e) { return forma === 'oggetto' ? {} : []; }
    }
    function _deltaDati(baseStr, nuovoStr, forma) {
        const base = _parseDati(baseStr, forma), nuovo = _parseDati(nuovoStr, forma);
        if (forma === 'oggetto') {
            const upserts = {}, deletes = [];
            Object.keys(nuovo).forEach(k => { if (JSON.stringify(nuovo[k]) !== JSON.stringify(base[k])) upserts[k] = nuovo[k]; });
            Object.keys(base).forEach(k => { if (!(k in nuovo)) deletes.push(k); });
            return { upserts, deletes };
        }
        const baseById = {}; base.forEach(r => { if (r && r.id != null) baseById[r.id] = r; });
        const nuovoById = {}; nuovo.forEach(r => { if (r && r.id != null) nuovoById[r.id] = r; });
        const upserts = [], deletes = [];
        nuovo.forEach(r => { if (r && r.id != null && JSON.stringify(r) !== JSON.stringify(baseById[r.id])) upserts.push(r); });
        if (forma !== 'audit') Object.keys(baseById).forEach(id => { if (!(id in nuovoById)) deletes.push(id); });
        return { upserts, deletes };
    }
    function _applicaDelta(targetStr, delta, forma) {
        const target = _parseDati(targetStr, forma);
        if (forma === 'oggetto') {
            const out = Object.assign({}, target);
            Object.keys(delta.upserts).forEach(k => { out[k] = delta.upserts[k]; });
            delta.deletes.forEach(k => { delete out[k]; });
            return JSON.stringify(out);
        }
        const byId = {}, ordine = [];
        target.forEach(r => { if (r && r.id != null) { if (!(r.id in byId)) ordine.push(r.id); byId[r.id] = r; } });
        delta.upserts.forEach(r => { if (r && r.id != null) { if (!(r.id in byId)) ordine.push(r.id); byId[r.id] = r; } });
        delta.deletes.forEach(id => { delete byId[id]; });
        let out = ordine.filter(id => byId[id] !== undefined).map(id => byId[id]);
        if (forma === 'audit') { out.sort((a, b) => (b.ts || 0) - (a.ts || 0)); if (out.length > 2000) out = out.slice(0, 2000); }
        return JSON.stringify(out);
    }
    // fonde il mio valore locale con lo stato remoto attuale, partendo dalla base
    // (l'ultimo remoto che avevo visto). Ritorna la stringa JSON fusa.
    function _fondiDati(chiave, baseStr, localStr, remoteStr) {
        if (baseStr == null || remoteStr == null) return localStr;
        if (baseStr === remoteStr) return localStr;   // nessuna modifica altrui
        if (localStr === baseStr) return remoteStr;   // io non ho cambiato nulla
        return _applicaDelta(remoteStr, _deltaDati(baseStr, localStr, _formaDati(chiave)), _formaDati(chiave));
    }

    const Persone = {
        tutte() { return Store.leggi(CHIAVI.persone, []); },
        salva(l) { Store.scrivi(CHIAVI.persone, l); },
        /* nomi attivi per un ruolo: 'qualita' | 'respIncarico' | 'team' (esclusi eliminati) */
        attive(ruolo) {
            return this.tutte()
                .filter(p => p.attivo && !p.eliminato && (!ruolo || p[ruolo]))
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
            // gli elenchi si mostrano leggibili ("Veneto, Lazio") e un elenco vuoto vale
            // come campo assente: cosi' aggiungere un campo-elenco nuovo non genera una
            // voce fantasma ("vuoto -> []") al primo risalvataggio dei record esistenti
            const testo = v => {
                if (v == null) return '';
                if (Array.isArray(v)) return v.length ? v.join(', ') : '';
                return typeof v === 'object' ? JSON.stringify(v) : String(v);
            };
            campi.forEach(c => {
                const sa = testo(prima ? prima[c.chiave] : undefined);
                const sb = testo(dopo ? dopo[c.chiave] : undefined);
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
        { chiave: 'fatturazione', nome: 'Modalita fatturazione' },
        { chiave: 'gruppoFatturazione', nome: 'Gruppo di fatturazione' },
        { chiave: 'fattInizio', nome: 'Inizio fatturazione' },
        { chiave: 'fattFine', nome: 'Fine fatturazione' },
        { chiave: 'fattData', nome: 'Data fattura' },
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
        // "Dati e backup" e riservato al titolare dello studio
        eProprietario() {
            return this.utenteCorrente && this.utenteCorrente.email && this.utenteCorrente.email.toLowerCase() === PROPRIETARIO;
        },

        /* Il ruolo dell'utente collegato, gia' normalizzato. Il titolare e l'admin hanno sempre
           accesso pieno (non si possono chiudere fuori da soli). Il Coordinatore territoriale
           ha un profilo IMPOSTO dal codice, non dai dati salvati: sempre e solo visualizzazione.
           Un ruolo sconosciuto (es. cancellato) non vede nulla: fail-closed. */
        ruoloCorrente() {
            const u = this.utenteCorrente;
            if (!u) return null;
            if (this.eProprietario() || u.ruolo === 'admin') return { id: 'admin', nome: 'Amministratore', admin: true, builtin: true, sezioni: sezioniTutte('scrittura') };
            if (u.ruolo === 'coordinatore') return { id: 'coordinatore', nome: 'Coordinatore territoriale', coordinatore: true, builtin: true, sistema: true, sezioni: sezioniTutte('lettura') };
            if (u.ruolo === 'vicecoordinatore') return { id: 'vicecoordinatore', nome: 'Vice coordinatore territoriale', coordinatore: true, builtin: true, sistema: true, sezioni: sezioniTutte('lettura') };
            const r = Ruoli.trova(u.ruolo);
            if (r) return Ruoli.normalizza(r);
            return { id: u.ruolo || '', nome: u.ruolo || 'Senza ruolo', sconosciuto: true, sezioni: sezioniTutte('no') };
        },
        /* La scheda in Persone dell'utente collegato (agganciata per email): per il
           Coordinatore territoriale e' li' che sta scritta la sua regione.
           Se per errore due schede hanno la stessa email, vince la piu' completa
           (attiva e con la regione compilata), non la prima in elenco. */
        personaCorrente() {
            const u = this.utenteCorrente;
            if (!u || !u.email) return null;
            const em = String(u.email).toLowerCase();
            const match = Persone.tutte().filter(p => p.email && !p.eliminato && String(p.email).toLowerCase() === em);
            if (!match.length) return null;
            const haRegioni = p => !!((p.regione && String(p.regione).trim()) || (Array.isArray(p.regioniCoordinate) && p.regioniCoordinate.filter(Boolean).length));
            const punti = p => (p.attivo ? 2 : 0) + (haRegioni(p) ? 1 : 0);
            return match.sort((a, b) => punti(b) - punti(a))[0];
        },
        // livello sulla singola sezione di contenuto: 'no' | 'lettura' | 'scrittura'
        accessoSezione(sez) {
            const r = this.ruoloCorrente();
            if (!r) return 'no';
            if (r.admin) return 'scrittura';
            return (r.sezioni && r.sezioni[sez]) || 'no';
        },
        // sezioni "di sistema": non passano dai ruoli, restano di admin/titolare.
        // Il titolare ha sempre i poteri dell'admin (non deve potersi chiudere fuori).
        puoVedere(sez) {
            if (sez === 'utenti' || sez === 'ruoli') return this.eAdmin() || this.eProprietario();
            if (sez === 'dati') return this.eProprietario();
            return this.accessoSezione(sez) !== 'no';
        },
        puoScrivere(sez) {
            if (sez === 'utenti' || sez === 'ruoli') return this.eAdmin() || this.eProprietario();
            if (sez === 'dati') return this.eProprietario();
            return this.accessoSezione(sez) === 'scrittura';
        },
        /* null = tutte le regioni. Solo coordinatore e vice sono limitati: alla Regione della
           LORO scheda in Persone (agganciata per email) piu' le eventuali altre regioni
           coordinate indicate sulla scheda. Scheda mancante o senza alcuna regione = nessun
           incarico visibile (fail-closed): si sistema compilando la scheda. */
        regioniConsentite() {
            const r = this.ruoloCorrente();
            if (!r || !r.coordinatore) return null;
            const p = this.personaCorrente();
            if (!p) return [];
            // chiave normalizzata: grafie diverse della stessa regione (accenti, trattini) coincidono
            const regioni = [p.regione].concat(Array.isArray(p.regioniCoordinate) ? p.regioniCoordinate : [])
                .map(chiaveRegione).filter(Boolean);
            return Array.from(new Set(regioni));
        },
        vedeIncarico(inc) {
            const reg = this.regioniConsentite();
            if (!reg) return true;
            return reg.includes(chiaveRegione((inc && inc.regione) || ''));
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
                this.DOC_SYNC[CHIAVI.comunicazioni] = 'comunicazioni';
                this.DOC_SYNC[CHIAVI.sondaggi] = 'sondaggi';
                this.DOC_SYNC[CHIAVI.ruoli] = 'ruoli';
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

        // Invia una comunicazione libera: passa l'ID token dell'utente loggato,
        // che il server verifica (solo utenti abilitati possono inviare).
        async inviaComunicazione(oggetto, testo, destinatari, formato) {
            let url = window.RV_COMUNICAZIONI_URL;
            if (!url && window.RV_EMAIL_SERVICE_URL) url = window.RV_EMAIL_SERVICE_URL.replace(/invia-email(\/?)$/, 'invia-comunicazione$1');
            if (!url) return { ok: false, msg: 'Servizio di invio non configurato.' };
            if (!this.auth || !this.auth.currentUser) return { ok: false, msg: 'Sessione scaduta: rientra e riprova.' };
            let idToken;
            try { idToken = await this.auth.currentUser.getIdToken(); }
            catch (e) { return { ok: false, msg: 'Sessione scaduta: rientra e riprova.' }; }
            const mittenteNome = Auth.utenteCorrente ? Auth.utenteCorrente.nome : '';
            try {
                const r = await fetch(url, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idToken, oggetto, testo, destinatari, mittenteNome, formato })
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok || !data.ok) return { ok: false, msg: (data && data.msg) || ('Invio non riuscito (' + r.status + ').'), falliti: (data && data.falliti) || [] };
                return { ok: true, inviati: data.inviati, falliti: (data && data.falliti) || [] };
            } catch (e) {
                return { ok: false, msg: 'Servizio di invio non raggiungibile.' };
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
            // invia subito le scritture ancora in coda (transazione) PRIMA di uscire
            if (this._timerFlush) { clearTimeout(this._timerFlush); this._timerFlush = null; }
            const eseguiSignOut = () => { try { this.fb.authMod.signOut(this.auth); } catch (e) { } };
            const chiudi = () => {
                this.pronto = false;
                this._sync = null;
                // attende le scritture in corso (es. la voce "Uscita" del registro)
                try { this.fb.fsMod.waitForPendingWrites(this.db).then(eseguiSignOut, eseguiSignOut); }
                catch (e) { eseguiSignOut(); }
            };
            Promise.resolve(this._flush()).then(chiudi, chiudi);
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
                    this._baseRemoto[chiave] = snap.data().json;
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
                    if (locale) {
                        // archivio/ruoli e scrivibile solo dall'amministratore (regole Firestore):
                        // un non-admin NON deve tentare questo bootstrap, altrimenti il permission-denied
                        // farebbe fallire tutta la sincronizzazione e lo bloccherebbe al login.
                        const sonoAdmin = Auth.utenteCorrente && (Auth.utenteCorrente.ruolo === 'admin' || Auth.eProprietario());
                        if (!(chiave === CHIAVI.ruoli && !sonoAdmin)) {
                            try { await setDoc(rif, { json: locale, aggiornato: serverTimestamp(), da: 'bootstrap' }); this._baseRemoto[chiave] = locale; }
                            catch (e) { /* scrittura non consentita: si prosegue, i dati arrivano via onSnapshot */ }
                        }
                    }
                }
            }
            this.pronto = true;
            Object.keys(this.DOC_SYNC).forEach(chiave => {
                const rif = doc(this.db, 'archivio', this.DOC_SYNC[chiave]);
                const stacca = onSnapshot(rif, snap => {
                    if (!snap.exists()) return;
                    const remoto = snap.data().json;
                    if (typeof remoto !== 'string') return;
                    // Se ho modifiche locali non ancora inviate, le riporto SOPRA il
                    // nuovo remoto (fusione) invece di perderle sovrascrivendo tutto.
                    let nuovoLocale = remoto;
                    if (this._pendenti[chiave] != null) {
                        const forma = _formaDati(chiave);
                        nuovoLocale = _applicaDelta(remoto, _deltaDati(this._baseRemoto[chiave], this._pendenti[chiave], forma), forma);
                        this._pendenti[chiave] = nuovoLocale;
                    }
                    this._baseRemoto[chiave] = remoto;
                    if (nuovoLocale !== localStorage.getItem(chiave)) {
                        localStorage.setItem(chiave, nuovoLocale);
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
        _baseRemoto: {},   // ultimo valore remoto visto per chiave (base della fusione)
        _timerFlush: null,
        _erroreMostrato: false,
        sincronizza(chiave, valore) {
            if (!this.attivo || !this.pronto || !this.DOC_SYNC || !this.DOC_SYNC[chiave]) return;
            this._pendenti[chiave] = JSON.stringify(valore);
            if (this._timerFlush) return;
            this._timerFlush = setTimeout(() => this._flush(), 400);
        },
        // Scrive le modifiche in coda con una TRANSAZIONE che fonde per-record il
        // mio valore locale con lo stato remoto attuale: due utenti che salvano
        // record diversi non si sovrascrivono piu (niente perdita di dati).
        async _flush() {
            this._timerFlush = null;
            const pendenti = this._pendenti;
            this._pendenti = {};
            if (!this.pronto) return;
            const { doc, runTransaction, serverTimestamp } = this.fb.fsMod;
            const email = Auth.utenteCorrente ? Auth.utenteCorrente.email : 'sconosciuto';
            for (const chiave of Object.keys(pendenti)) {
                const rif = doc(this.db, 'archivio', this.DOC_SYNC[chiave]);
                const localStr = pendenti[chiave];
                const baseStr = this._baseRemoto[chiave];
                try {
                    const fuso = await runTransaction(this.db, async (tx) => {
                        const snap = await tx.get(rif);
                        const remoteStr = (snap.exists() && typeof snap.data().json === 'string') ? snap.data().json : null;
                        const merged = (remoteStr == null) ? localStr : _fondiDati(chiave, baseStr, localStr, remoteStr);
                        tx.set(rif, { json: merged, aggiornato: serverTimestamp(), da: email });
                        return merged;
                    });
                    this._baseRemoto[chiave] = fuso;
                    if (fuso !== localStorage.getItem(chiave)) {
                        localStorage.setItem(chiave, fuso);
                        if (Auth.utenteCorrente && vistaCorrente !== 'wizard') naviga(vistaCorrente, parametriVista);
                    }
                } catch (e) {
                    console.error('Sincronizzazione non riuscita (' + chiave + '):', e);
                    // rimetti in coda per un nuovo tentativo: la modifica non va persa
                    if (this._pendenti[chiave] == null) this._pendenti[chiave] = localStr;
                    if (!this._timerFlush && this.pronto) this._timerFlush = setTimeout(() => this._flush(), 2500);
                    if (!this._erroreMostrato) {
                        this._erroreMostrato = true;
                        toast('Attenzione: salvataggio non ancora condiviso, nuovo tentativo in corso' +
                            (e && e.code === 'permission-denied' ? ' (utenza non piu abilitata?)' : '') + '.', 'rosso');
                        setTimeout(() => { this._erroreMostrato = false; }, 5000);
                    }
                }
            }
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

    /* Ore CONCORDATE: vengono dal calcolo del compenso fatto nel wizard, dove chi segue
       l'incarico ha scelto settore e rischio e ha visto il risultato prima di salvarlo.
       Sono queste, e solo queste, che finiscono nella proposta di incarico e nel PDF.
       La revisione volontaria vale un esercizio solo (ore anno 1), la legale va a regime. */
    function oreDaCalcolo(inc) {
        const c = inc && inc.calc;
        if (!c) return 0;
        const primo = c.oreAnno1 || 0;
        return inc.tipo === 'volontaria' ? primo : (c.oreAnni23 || primo || 0);
    }

    /* Ore STIMATE per l'analisi (report): il calcolo del wizard se c'e', altrimenti la stima
       ricavata dai bilanci caricati (inc.stima). La stima resta fuori dalle lettere: un numero
       calcolato in blocco con i correttivi predefiniti non puo' finire in un documento
       contrattuale al posto del trattino da compilare.
       Con l'anno si distingue il primo esercizio (ore piu' alte) dal regime: senza, il primo
       anno sembrerebbe pagato meglio di quanto e'. Torna 0 = ore non stimabili. */
    function oreStimatePerAnno(inc, anno) {
        if (!inc) return 0;
        const c = inc.calc, haCalc = c && (c.oreAnni23 || c.oreAnno1);
        const f = haCalc ? c : (inc.stima || null);
        if (!f) return 0;
        const a1 = f.oreAnno1 || 0, regime = f.oreAnni23 || a1 || 0;
        if (inc.tipo === 'volontaria') return a1;
        const primo = inc.dataInizio ? Number(String(inc.dataInizio).slice(0, 4)) : null;
        return (anno && primo && anno === primo) ? (a1 || regime) : regime;
    }

    /* =========================================================
       INCARICHI
    ========================================================= */
    const Incarichi = {
        tutti() { return Store.leggi(CHIAVI.incarichi, []); },
        // gli incarichi che l'utente collegato PUO' vedere (filtro per regione del ruolo).
        // Usare questo nelle viste; tutti() resta per storage, import, backup e integrita' dati.
        visibili() {
            const reg = Auth.regioniConsentite();
            const tutti = this.tutti();
            if (!reg) return tutti;
            return tutti.filter(i => reg.includes(chiaveRegione(i.regione || '')));
        },
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

        // termina l'incarico: passa allo stato "cessato" (mostrato come "terminato") e finisce nella sezione dedicata
        termina(id, utente) {
            const lista = this.tutti();
            const idx = lista.findIndex(i => i.id === id);
            if (idx < 0) return null;
            const inc = lista[idx];
            const prima = inc.stato || 'attivo';
            inc.stato = 'cessato';
            inc.terminato = { da: utente.nome + ' <' + utente.email + '>', il: Date.now() };
            inc.modificato = { da: utente.nome + ' <' + utente.email + '>', il: Date.now() };
            this.salva(lista);
            Audit.registra(utente, 'Incarico terminato', 'incarico', id, inc.cliente, [{ campo: 'Stato', prima: prima, dopo: 'terminato' }]);
            return inc;
        },

        /* Dimissioni dall'incarico: il revisore si dimette a una certa data. L'incarico esce
           dall'elenco degli attivi e finisce nella scheda "Dismessi" (riattivabile). */
        dimetti(id, dataDimissioni, utente) {
            const lista = this.tutti();
            const idx = lista.findIndex(i => i.id === id);
            if (idx < 0) return null;
            const inc = lista[idx];
            const prima = inc.stato || 'attivo';
            inc.stato = 'dimesso';
            inc.dimissioni = { data: dataDimissioni || null, da: utente.nome + ' <' + utente.email + '>', il: Date.now() };
            inc.modificato = { da: utente.nome + ' <' + utente.email + '>', il: Date.now() };
            this.salva(lista);
            Audit.registra(utente, 'Dimissioni dall\'incarico', 'incarico', id, inc.cliente,
                [{ campo: 'Stato', prima: prima, dopo: 'dimesso' }].concat(dataDimissioni ? [{ campo: 'Data dimissioni', prima: '', dopo: fmtData(dataDimissioni) }] : []));
            return inc;
        },

        // riattiva un incarico terminato o dimesso: torna attivo e rientra nell'elenco principale
        riattiva(id, utente) {
            const lista = this.tutti();
            const idx = lista.findIndex(i => i.id === id);
            if (idx < 0) return null;
            const inc = lista[idx];
            const prima = inc.stato === 'dimesso' ? 'dimesso' : 'terminato';
            inc.stato = 'attivo';
            inc.terminato = null;
            inc.dimissioni = null;
            inc.modificato = { da: utente.nome + ' <' + utente.email + '>', il: Date.now() };
            this.salva(lista);
            Audit.registra(utente, 'Incarico riattivato', 'incarico', id, inc.cliente, [{ campo: 'Stato', prima: prima, dopo: 'attivo' }]);
            return inc;
        },

        statoScadenza(inc) {
            const fine = inc.rinnovo || inc.dataFine;
            if (inc.stato === 'dimesso') return { classe: 'neutro', testo: 'Dimesso' + (inc.dimissioni && inc.dimissioni.data ? ' ' + fmtData(inc.dimissioni.data) : '') };
            if (inc.stato === 'cessato') return { classe: 'neutro', testo: 'Terminato' };
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
            const stati = this.stati();

            // modalita "data specifica": una sola scadenza, nell'esercizio che coincide con la data
            if (periodicita === 'specifica') {
                if (!inc.fattData) return [];
                const d = new Date(inc.fattData);
                if (isNaN(d.getTime()) || d.getFullYear() !== anno) return [];
                const mese = d.getMonth() + 1;
                const chiave = inc.id + '|' + anno + '|specifica|' + inc.fattData;
                return [{
                    chiave, incarico: inc, anno, numero: 1, totale: 1, mese,
                    scadenza: anno + '-' + String(mese).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
                    importo: compenso, stato: stati[chiave] || 'da emettere'
                }];
            }

            const nBase = periodicita === 'mensile' ? 12 : (periodicita === 'trimestrale' ? 4 : 1);
            const mesi = [];
            for (let i = 1; i <= nBase; i++) mesi.push(nBase === 12 ? i : (nBase === 4 ? i * 3 : 12));
            // finestra inizio/fine (se impostata): tiene solo le scadenze (anno,mese) dentro [inizio, fine]
            const dentro = m => {
                if (inc.fattInizio && (anno < inc.fattInizio.anno || (anno === inc.fattInizio.anno && m < inc.fattInizio.mese))) return false;
                if (inc.fattFine && (anno > inc.fattFine.anno || (anno === inc.fattFine.anno && m > inc.fattFine.mese))) return false;
                return true;
            };
            const mesiAttivi = mesi.filter(dentro);
            if (!mesiAttivi.length) return [];
            const n = mesiAttivi.length;
            const importoRata = Math.round((compenso / n) * 100) / 100;
            // senza finestra la chiave resta identica a prima (stati esistenti preservati);
            // con finestra si aggiunge una firma cosi gli stati non si riattaccano a rate diverse
            const finestra = (inc.fattInizio || inc.fattFine)
                ? '|w' + (inc.fattInizio ? inc.fattInizio.anno + '-' + inc.fattInizio.mese : '') + '-' + (inc.fattFine ? inc.fattFine.anno + '-' + inc.fattFine.mese : '')
                : '';
            const out = [];
            mesiAttivi.forEach((mese, k) => {
                const i = k + 1;
                let importo = importoRata;
                if (i === n) importo = Math.round((compenso - importoRata * (n - 1)) * 100) / 100;
                const chiave = inc.id + '|' + anno + '|' + periodicita + '|' + i + finestra;
                out.push({
                    chiave, incarico: inc, anno, numero: i, totale: n, mese,
                    scadenza: anno + '-' + String(mese).padStart(2, '0') + '-' + (nBase === 1 ? '31' : '28'),
                    importo, stato: stati[chiave] || 'da emettere'
                });
            });
            return out;
        },

        tutteAnno(anno) {
            const out = [];
            Incarichi.visibili().forEach(inc => { out.push(...this.rate(inc, anno)); });
            return out.sort((a, b) => a.mese - b.mese || a.incarico.cliente.localeCompare(b.incarico.cliente));
        },

        cambiaStato(chiave, nuovo, utente, cliente) {
            if (!Auth.puoScrivere('fatturazione')) return;      // sola lettura: nessuna scrittura
            const s = this.stati();
            const prima = s[chiave] || 'da emettere';
            s[chiave] = nuovo;
            this.salvaStati(s);
            Audit.registra(utente, 'Stato fattura aggiornato', 'fattura', chiave, cliente,
                [{ campo: 'Stato rata', prima, dopo: nuovo }]);
        },

        /* Rimborsi spese per rata (importo + campo congelabile). Storage locale per rata (chiave). */
        rimborsi() { return Store.leggi(CHIAVI.rimborsi, {}); },
        rimborso(chiave) { const r = this.rimborsi()[chiave]; return { importo: (r && Number(r.importo)) || 0, congelato: !!(r && r.congelato) }; },
        salvaRimborso(chiave, importo, utente, cliente) {
            if (!Auth.puoScrivere('fatturazione')) return false; // sola lettura: nessuna scrittura
            const m = this.rimborsi();
            const cur = m[chiave] || { importo: 0, congelato: false };
            if (cur.congelato) return false;                    // campo congelato: non modificabile
            const prima = Number(cur.importo) || 0;
            const nuovo = Math.round((Number(importo) || 0) * 100) / 100;
            m[chiave] = { importo: nuovo, congelato: false };
            Store.scrivi(CHIAVI.rimborsi, m);
            if (prima !== nuovo) Audit.registra(utente, 'Rimborso spese aggiornato', 'fattura', chiave, cliente,
                [{ campo: 'Rimborso spese', prima: String(prima), dopo: String(nuovo) }]);
            return true;
        },
        congelaRimborso(chiave, congelato, utente, cliente) {
            if (!Auth.puoScrivere('fatturazione')) return;      // sola lettura: nessuna scrittura
            const m = this.rimborsi();
            const cur = m[chiave] || { importo: 0, congelato: false };
            cur.congelato = !!congelato;
            m[chiave] = cur;
            Store.scrivi(CHIAVI.rimborsi, m);
            Audit.registra(utente, congelato ? 'Rimborso spese congelato' : 'Rimborso spese sbloccato', 'fattura', chiave, cliente, null);
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

    /* Testo pulito di una cella (per filtri ed export). */
    function _testoCella(cella) {
        return cella ? cella.textContent.trim().replace(/\s+/g, ' ') : '';
    }

    /* Esporta in CSV le righe VISIBILI (rispetta i filtri) di una tabella "dati",
       saltando le colonne d'azione (intestazione vuota). Formato come l'export
       incarichi: BOM, virgolette, separatore ";", guardia anti-formula Excel. */
    function esportaTabellaCsv(tabella, nomeFile) {
        if (!tabella || !tabella.tHead || !tabella.tBodies[0]) return;
        const ths = Array.from(tabella.tHead.rows[0].cells);
        const colonne = [];
        ths.forEach((th, i) => { if (th.textContent.trim() !== '') colonne.push(i); });
        const righe = [colonne.map(i => ths[i].textContent.trim())];
        Array.from(tabella.tBodies[0].rows).forEach(tr => {
            if (tr.style.display === 'none') return;
            righe.push(colonne.map(i => _testoCella(tr.cells[i])));
        });
        const csv = righe.map(r => r.map(v => {
            let s = String(v).replace(/"/g, '""');
            if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // niente formule in Excel
            return '"' + s + '"';
        }).join(';')).join('\r\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (nomeFile || 'tabella') + '_' + oggiISO() + '.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        toast('CSV esportato (' + (righe.length - 1) + ' righe).', 'verde');
        Audit.registra(Auth.utenteCorrente, 'Esportazione CSV', 'sistema', null, null, nomeFile || null);
    }

    /* Attrezza una tabella "dati" con una barra strumenti professionale: un filtro
       PER COLONNA (tendina per le colonne categoriali, casella di testo per le
       altre) e un pulsante "Esporta CSV". Generico, guidato dai dati della tabella.
       opts: { nomeFile, filtri = true }. */
    /* Filtro "combinato" riusabile: campo di testo con suggerimenti (datalist).
       Si digita liberamente O si sceglie dall'elenco; vuoto = tutti.
       Chi lo usa confronta con "contiene" (minuscole), cosi' il suggerimento
       scelto per intero coincide e il testo parziale filtra comunque. */
    function comboFiltro(id, etichetta, valori, valore) {
        const dl = id + '-dl';
        return '<div class="campo"><label>' + esc(etichetta) + '</label>'
            + '<input type="search" id="' + id + '" list="' + dl + '" placeholder="Tutti" value="' + esc(valore || '') + '">'
            + '<datalist id="' + dl + '">' + (valori || []).map(v => '<option value="' + esc(v) + '"></option>').join('') + '</datalist></div>';
    }
    // confronto standard dei filtri combinati
    const filtroCorrisponde = (testoCella, digitato) => {
        const q = String(digitato || '').trim().toLowerCase();
        return !q || String(testoCella || '').toLowerCase().includes(q);
    };

    function attrezzaTabella(elOrScope, opts) {
        opts = opts || {};
        const tabella = (elOrScope && elOrScope.tagName === 'TABLE') ? elOrScope : (elOrScope && elOrScope.querySelector('table.dati'));
        if (!tabella || !tabella.tHead || !tabella.tBodies[0]) return;
        const ancora = tabella.closest('.tabella-wrap') || tabella;
        if (ancora.previousElementSibling && ancora.previousElementSibling.classList.contains('barra-tabella')) return;
        const ths = Array.from(tabella.tHead.rows[0].cells);
        const corpo = tabella.tBodies[0];
        // la ricerca globale guarda solo le colonne con intestazione (esclude la colonna azioni: Apri/Duplica/Elimina)
        const idxCerca = ths.map((th, i) => (th.textContent.trim() ? i : -1)).filter(i => i >= 0);
        const barra = document.createElement('div');
        barra.className = 'barra-tabella';

        const controlli = [];
        let ricercaEl = null;
        if (opts.ricerca) {
            const campo = document.createElement('div');
            campo.className = 'campo ricerca';
            campo.innerHTML = '<label>Ricerca</label><input type="search" placeholder="Cerca in tutte le colonne...">';
            ricercaEl = campo.querySelector('input');
            barra.appendChild(campo);
        }
        if (opts.filtri !== false) {
            ths.forEach((th, i) => {
                const nome = th.textContent.trim();
                if (!nome) return; // colonna d'azione
                const valori = new Set();
                Array.from(corpo.rows).forEach(tr => { const v = _testoCella(tr.cells[i]); if (v) valori.add(v); });
                if (valori.size === 0) return; // colonna vuota
                const distinti = Array.from(valori);
                if (distinti.length < 2) return; // un solo valore distinto: filtro inutile
                // Filtro "combinato": si puo' digitare liberamente E scegliere un suggerimento
                // dall'elenco (datalist). Vuoto = tutti; il confronto e' "contiene".
                distinti.sort((a, b) => a.localeCompare(b, 'it', { numeric: true }));
                const dlId = 'dl-' + uid();
                const campo = document.createElement('div');
                campo.className = 'campo';
                campo.innerHTML = '<label>' + esc(nome) + '</label><input type="search" list="' + dlId + '" placeholder="Tutti">'
                    + '<datalist id="' + dlId + '">' + distinti.map(v => '<option value="' + esc(v) + '"></option>').join('') + '</datalist>';
                controlli.push({ i: i, tipo: 'testo', el: campo.querySelector('input') });
                barra.appendChild(campo);
            });
        }

        const azioni = document.createElement('div');
        azioni.className = 'barra-tabella-azioni';
        azioni.innerHTML = '<span class="filtro-conteggio" aria-live="polite"></span>'
            + '<button type="button" class="btn btn-sm btn-secondary" data-esporta>'
            + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Esporta CSV</button>';
        barra.appendChild(azioni);
        const conteggio = azioni.querySelector('.filtro-conteggio');
        ancora.parentElement.insertBefore(barra, ancora);

        const applica = () => {
            const righe = Array.from(corpo.rows);
            const q = ricercaEl ? ricercaEl.value.trim().toLowerCase() : '';
            let visibili = 0;
            righe.forEach(tr => {
                let ok = true;
                if (q && !idxCerca.map(i => _testoCella(tr.cells[i])).join(' ').toLowerCase().includes(q)) ok = false;
                if (ok) for (const c of controlli) {
                    const testo = _testoCella(tr.cells[c.i]);
                    if (c.tipo === 'select') { if (c.el.value && testo !== c.el.value) { ok = false; break; } }
                    else { const qc = c.el.value.trim().toLowerCase(); if (qc && !testo.toLowerCase().includes(qc)) { ok = false; break; } }
                }
                tr.style.display = ok ? '' : 'none';
                if (ok) visibili++;
            });
            const filtrando = !!q || controlli.some(c => (c.el.value || '').trim());
            conteggio.textContent = filtrando ? (visibili + ' di ' + righe.length) : '';
        };
        controlli.forEach(c => c.el.addEventListener(c.tipo === 'select' ? 'change' : 'input', applica));
        if (ricercaEl) ricercaEl.addEventListener('input', applica);
        azioni.querySelector('[data-esporta]').addEventListener('click', () => esportaTabellaCsv(tabella, opts.nomeFile));
        return applica;
    }

    function apriModale(html, opts) {
        opts = opts || {};
        const cont = document.getElementById('modale-contenitore');
        const finestra = !!opts.finestra;
        let inner;
        if (finestra) {
            const barra = '<div class="modale-barra">'
                + '<span class="modale-titolo">' + esc(opts.titolo || '') + '</span>'
                + '<span class="modale-controlli">'
                + '<button type="button" class="mw-btn mw-min" title="Riduci a barra" aria-label="Riduci">&#8211;</button>'
                + '<button type="button" class="mw-btn mw-max" title="A schermo intero" aria-label="A schermo intero">&#9633;</button>'
                + '<button type="button" class="mw-btn mw-close" title="Chiudi" aria-label="Chiudi">&#10005;</button>'
                + '</span></div>';
            inner = '<div class="modale ' + (opts.classe || '') + ' modale-finestra">' + barra + '<div class="modale-corpo">' + html + '</div></div>';
        } else {
            inner = '<div class="modale ' + (opts.classe || '') + '">' + html + '</div>';
        }
        cont.innerHTML = '<div class="modale-sfondo' + (finestra ? ' modale-sfondo-finestra' : '') + '">' + inner + '</div>';
        const sfondo = cont.querySelector('.modale-sfondo');
        sfondo.addEventListener('click', e => {
            // le finestre non si chiudono cliccando fuori (comportamento da finestra)
            if (e.target.classList.contains('modale-sfondo') && !opts.bloccante && !finestra) chiudiModale();
        });
        if (finestra) {
            const modale = cont.querySelector('.modale');
            // il piede con i pulsanti esce dall'area scorrevole e diventa un footer fisso della finestra:
            // resta sempre visibile e non copre piu il contenuto finale (es. la sezione del periodo)
            const corpo = modale.querySelector('.modale-corpo');
            const azioni = corpo && corpo.lastElementChild;
            if (azioni && azioni.classList && azioni.classList.contains('modale-azioni')) modale.appendChild(azioni);
            const setRidotta = r => { modale.classList.toggle('ridotta', r); sfondo.classList.toggle('sfondo-ridotto', r); };
            cont.querySelector('.mw-close').addEventListener('click', chiudiModale);
            cont.querySelector('.mw-min').addEventListener('click', () => setRidotta(!modale.classList.contains('ridotta')));
            cont.querySelector('.mw-max').addEventListener('click', () => { setRidotta(false); modale.classList.toggle('massimizzata'); });
            cont.querySelector('.modale-barra').addEventListener('dblclick', e => { if (!e.target.closest('.mw-btn')) { setRidotta(false); modale.classList.toggle('massimizzata'); } });
            cont.querySelector('.modale-titolo').addEventListener('click', () => { if (modale.classList.contains('ridotta')) setRidotta(false); });
        }
        return cont;
    }
    function chiudiModale() { document.getElementById('modale-contenitore').innerHTML = ''; }

    /* Rende un livello inattivo mentre sopra c'e' una finestra: lo sfondo copre i clic, ma NON la
       tastiera, quindi senza questo con Tab/Invio si arriverebbe ancora ai pulsanti della finestra
       sotto (compreso "Invia"). "inert" fa tutto; sui browser che non ce l'hanno si tolgono a mano
       gli elementi dal giro del Tab. */
    const FOCUSABILI = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';
    function rendiInerte(el, inerte) {
        if (!el || !el.querySelectorAll) return;
        if ('inert' in HTMLElement.prototype) { el.inert = inerte; return; }
        Array.from(el.querySelectorAll(FOCUSABILI)).forEach(f => {
            if (inerte) {
                if (!f.hasAttribute('data-ti-prec')) f.setAttribute('data-ti-prec', f.getAttribute('tabindex') || '');
                f.setAttribute('tabindex', '-1');
            } else if (f.hasAttribute('data-ti-prec')) {
                const p = f.getAttribute('data-ti-prec');
                if (p) f.setAttribute('tabindex', p); else f.removeAttribute('tabindex');
                f.removeAttribute('data-ti-prec');
            }
        });
    }

    /* Apre una vera finestra SOPRA quella corrente (es. Destinatari, Programma l'invio):
       la finestra sotto resta aperta ma diventa inattiva, questa si chiude con "Fatto" o con la X.
       Il contenuto si mette dentro .corpo (di solito spostandoci un pezzo di DOM gia' pronto,
       cosi' mantiene valori e listener). allaChiusura() serve a riprenderselo indietro. */
    function apriSottoFinestra(opts) {
        opts = opts || {};
        const cont = document.getElementById('modale-contenitore');
        const sotto = Array.from(cont.children);          // i livelli gia' aperti: da congelare
        const attivoPrima = document.activeElement;       // a chi ridare il focus alla chiusura
        const sfondo = document.createElement('div');
        sfondo.className = 'modale-sfondo modale-sfondo-finestra modale-sfondo-sopra';
        sfondo.innerHTML = '<div class="modale ' + (opts.classe || '') + ' modale-finestra" tabindex="-1" role="dialog" aria-modal="true">'
            + '<div class="modale-barra"><span class="modale-titolo">' + esc(opts.titolo || '') + '</span>'
            + '<span class="modale-controlli">'
            + '<button type="button" class="mw-btn mw-max" title="A schermo intero" aria-label="A schermo intero">&#9633;</button>'
            + '<button type="button" class="mw-btn mw-close" title="Chiudi" aria-label="Chiudi">&#10005;</button>'
            + '</span></div>'
            + '<div class="modale-corpo"></div>'
            + '<div class="modale-azioni"><button type="button" class="btn btn-primary" data-sf-ok="1">' + esc(opts.ok || 'Fatto') + '</button></div>'
            + '</div>';
        cont.appendChild(sfondo);
        sotto.forEach(el => rendiInerte(el, true));
        const modale = sfondo.querySelector('.modale');
        let chiusa = false;
        const chiudi = () => {
            if (chiusa) return; chiusa = true;
            if (typeof opts.allaChiusura === 'function') opts.allaChiusura();
            sfondo.remove();
            sotto.forEach(el => rendiInerte(el, false));
            try { if (attivoPrima && attivoPrima.focus && attivoPrima.isConnected) attivoPrima.focus(); } catch (_) { }
        };
        sfondo.querySelector('.mw-close').addEventListener('click', chiudi);
        sfondo.querySelector('[data-sf-ok]').addEventListener('click', chiudi);
        sfondo.querySelector('.mw-max').addEventListener('click', () => modale.classList.toggle('massimizzata'));
        sfondo.querySelector('.modale-barra').addEventListener('dblclick', e => { if (!e.target.closest('.mw-btn')) modale.classList.toggle('massimizzata'); });
        sfondo.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); chiudi(); } });
        try { modale.focus(); } catch (_) { }   // il focus entra nella finestra nuova
        return { sfondo: sfondo, corpo: sfondo.querySelector('.modale-corpo'), chiudi: chiudi };
    }

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
        { id: 'coordinatori', nome: 'Coordinatori e vice', icona: 'M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10zM12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
        { id: 'responsabili', nome: 'Responsabili', icona: 'M9 12l2 2 4-4M12 3l7 4v5c0 4-3 7-7 8-4-1-7-4-7-8V7z' },
        { id: 'comunicazioni', nome: 'Comunicazioni', icona: 'M3 8l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z' },
        { id: 'sondaggi', nome: 'Sondaggi', icona: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 13l2 2 4-4' },
        { id: 'registro', nome: 'Registro modifiche', icona: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
        { id: 'utenti', nome: 'Utenti', icona: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m20 0v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M12 7a4 4 0 11-8 0 4 4 0 018 0z', soloAdmin: true },
        { id: 'ruoli', nome: 'Ruoli e permessi', icona: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 1v2m0 18v2m11-11h-2M3 12H1m17.66 6.66l-1.42-1.42M6.76 6.76 5.34 5.34m12.32 0-1.42 1.42M6.76 17.24l-1.42 1.42', soloAdmin: true },
        { id: 'dati', nome: 'Dati e backup', icona: 'M4 7c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2zm0 0v10c0 1.1 3.6 2 8 2s8-.9 8-2V7', soloProprietario: true }
    ];

    let vistaCorrente = 'dashboard';
    let parametriVista = null;

    // dettaglio/wizard/lettera sono sottopagine degli incarichi: valgono il permesso "incarichi".
    // La sezione Coordinatori e' una vista dell'anagrafica: valgono i permessi di "persone".
    const SEZIONE_DI_VISTA = { dettaglio: 'incarichi', wizard: 'incarichi', lettera: 'incarichi', coordinatori: 'persone', responsabili: 'persone' };
    function primaVistaVisibile() { const v = VOCI_NAV.find(x => Auth.puoVedere(SEZIONE_DI_VISTA[x.id] || x.id)); return v ? v.id : null; }

    function naviga(id, parametri) {
        const viste = {
            dashboard: vistaDashboard,
            incarichi: vistaIncarichi,
            dettaglio: vistaDettaglio,
            wizard: vistaWizard,
            fatturazione: vistaFatturazione,
            report: vistaReport,
            persone: vistaPersone,
            coordinatori: vistaCoordinatori,
            responsabili: vistaResponsabili,
            comunicazioni: vistaComunicazioni,
            sondaggi: vistaSondaggi,
            registro: vistaRegistro,
            utenti: vistaUtenti,
            ruoli: vistaRuoli,
            dati: vistaDati,
            lettera: vistaLettera
        };
        // guardia permessi: la sezione richiesta deve essere consentita dal ruolo
        const sez = SEZIONE_DI_VISTA[id] || id;
        if (!Auth.puoVedere(sez)) {
            const alt = primaVistaVisibile();
            if (!alt) { vistaCorrente = id; parametriVista = null; disegnaNav(); vistaSenzaAccesso(); return; }
            id = alt; parametri = null;
        }
        // creare un incarico e' scrittura: chi ha gli incarichi in sola lettura non entra nel wizard
        if (id === 'wizard' && !Auth.puoScrivere('incarichi')) { id = 'incarichi'; parametri = null; }
        vistaCorrente = id;
        parametriVista = parametri || null;
        disegnaNav();
        (viste[id] || vistaDashboard)();
        window.scrollTo(0, 0);
    }

    function vistaSenzaAccesso() {
        $vista().innerHTML = '<header><div><h1>Nessuna sezione disponibile</h1>'
            + '<p class="descrizione">Il tuo ruolo non ha accesso ad alcuna sezione. Chiedi all\'amministratore di assegnarti i permessi.</p></div></header>';
    }

    /* Nome del ruolo nella barra laterale; per il coordinatore anche la regione, cosi' si
       capisce subito cosa si sta vedendo (e perche' tutto e' vuoto se la scheda in Persone
       non ha la regione). Richiamata a ogni cambio vista: resta aggiornata anche quando
       l'anagrafica cambia mentre si e' collegati. */
    function aggiornaEtichettaUtente() {
        const el = document.getElementById('utente-ruolo');
        if (!el || !Auth.utenteCorrente) return;
        let etich = nomeRuolo(Auth.utenteCorrente.ruolo);
        const rc = Auth.ruoloCorrente();
        if (rc && rc.coordinatore) {
            const p = Auth.personaCorrente();
            // stessa lista di regioniConsentite, ma con le grafie originali e senza doppioni
            const viste = new Set(), regioni = [];
            (p ? [p.regione].concat(Array.isArray(p.regioniCoordinate) ? p.regioniCoordinate : []) : []).filter(Boolean).forEach(r => {
                const k = String(r).trim().toLowerCase();
                if (k && !viste.has(k)) { viste.add(k); regioni.push(String(r).trim()); }
            });
            etich += ' · ' + (regioni.length ? regioni.join(', ') : 'regione non impostata');
        }
        el.textContent = etich;
    }

    function disegnaNav() {
        const nav = document.getElementById('nav-principale');
        aggiornaEtichettaUtente();
        nav.innerHTML = VOCI_NAV
            .filter(v => Auth.puoVedere(SEZIONE_DI_VISTA[v.id] || v.id))
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
        const incarichi = Incarichi.visibili();
        const anno = annoCorrente();
        const attivi = incarichi.filter(i => i.stato !== 'cessato' && i.stato !== 'dimesso');
        const totAnno = incarichi.reduce((s, i) => s + Incarichi.compensoAnno(i, anno), 0);
        const totPrec = incarichi.reduce((s, i) => s + Incarichi.compensoAnno(i, anno - 1), 0);
        const delta = totPrec ? ((totAnno - totPrec) / totPrec * 100) : null;
        const inScadenza = attivi.filter(i => Incarichi.statoScadenza(i).classe === 'ambra');
        const scaduti = attivi.filter(i => Incarichi.statoScadenza(i).classe === 'rosso');
        const volontarie = attivi.filter(i => i.tipo === 'volontaria').length;
        // allerte di sblocco calcolo: visibili solo al titolare
        const allerte = Auth.eProprietario() ? Allerte.attive() : [];
        const puoRinnovare = Auth.puoScrivere('incarichi');
        // fatturato dell'anno a rischio (incarichi in scadenza / scaduti)
        const scadenzaTot = inScadenza.reduce((s, i) => s + Incarichi.compensoAnno(i, anno), 0);
        const scadutoTot = scaduti.reduce((s, i) => s + Incarichi.compensoAnno(i, anno), 0);
        /* Raggruppamento per coordinatore territoriale (solo incarichi attivi).
           Il coordinatore non e' piu' un campo dell'incarico: si ricava dalle SCHEDE in
           Persone (spunta "Coordinatore territoriale"), abbinando le regioni della scheda
           (Regione + altre regioni coordinate) alla regione dell'incarico. Un incarico la
           cui regione non e' coperta da nessun coordinatore finisce in "Senza coordinatore". */
        const coordinatori = Persone.tutte().filter(p => p.coordinatore && p.attivo && !p.eliminato).map(p => ({
            nome: (p.nomeProprio ? p.nomeProprio + ' ' : '') + p.nome,
            regioni: new Set([p.regione].concat(Array.isArray(p.regioniCoordinate) ? p.regioniCoordinate : [])
                .map(chiaveRegione).filter(Boolean))
        }));
        const perCoord = {};
        const aggiungi = (key, nome, i, comp, s) => {
            const g = perCoord[key] || (perCoord[key] = { nome: nome, incarichi: [], tot: 0, scadN: 0, scadTot: 0, scaduN: 0, scaduTot: 0 });
            g.incarichi.push(i); g.tot += comp;
            if (s.classe === 'ambra') { g.scadN++; g.scadTot += comp; }
            else if (s.classe === 'rosso') { g.scaduN++; g.scaduTot += comp; }
        };
        attivi.forEach(i => {
            const reg = chiaveRegione(i.regione || '');
            const comp = Incarichi.compensoAnno(i, anno);
            const s = Incarichi.statoScadenza(i);
            const suoi = reg ? coordinatori.filter(c => c.regioni.has(reg)) : [];
            if (suoi.length) suoi.forEach(c => aggiungi(c.nome, c.nome, i, comp, s));
            else aggiungi('', '', i, comp, s);
        });
        const coordList = Object.values(perCoord).sort((a, b) => b.tot - a.tot);
        const maxCoord = Math.max(1, ...coordList.map(g => g.tot));
        const rigaCoordIncarico = i => {
            const s = Incarichi.statoScadenza(i);
            return `<tr class="cliccabile" data-apri="${esc(i.id)}">
                <td class="cliente-cella" data-label="Cliente">${esc(i.cliente)}</td>
                <td data-label="Tipo">${badgeTipo(i.tipo)}</td>
                <td data-label="Scadenza">${esc(fmtData(i.rinnovo || i.dataFine))}</td>
                <td class="num" data-label="Compenso ${anno}">${Incarichi.compensoAnno(i, anno) ? eurFmt.format(Incarichi.compensoAnno(i, anno)) : ''}</td>
                <td data-label="Stato"><span class="badge ${s.classe}">${esc(s.testo)}</span></td>
                ${puoRinnovare ? `<td data-label="" style="white-space:nowrap;"><button class="btn btn-sm btn-secondary" data-rinnova="${esc(i.id)}">Rinnova</button> <button class="btn btn-sm btn-secondary" data-termina="${esc(i.id)}">Termina</button></td>` : ''}
            </tr>`;
        };
        const coordItem = g => {
            const pct = Math.round(g.tot / maxCoord * 100);
            const incs = g.incarichi.slice().sort((a, b) => (b.rinnovo || b.dataFine || '') < (a.rinnovo || a.dataFine || '') ? 1 : -1);
            return `<details class="coord-item">
                <summary class="coord-sommario">
                    <span class="coord-nome">${g.nome ? esc(g.nome) : '<em>Senza coordinatore</em>'}</span>
                    <span class="coord-barra"><span class="coord-barra-fill" style="width:${pct}%"></span></span>
                    <span class="coord-tot">${eurFmt.format(g.tot)}</span>
                    <span class="coord-n">${g.incarichi.length} inc.</span>
                    <span class="coord-badges">${g.scadN ? `<span class="badge ambra" title="In scadenza">${g.scadN} &middot; ${eurFmt.format(g.scadTot)}</span>` : ''}${g.scaduN ? `<span class="badge rosso" title="Scaduti">${g.scaduN} &middot; ${eurFmt.format(g.scaduTot)}</span>` : ''}</span>
                </summary>
                <div class="coord-dettaglio">
                    <div class="tabella-wrap"><table class="dati a-schede"><thead><tr>
                        <th>Cliente</th><th>Tipo</th><th>Scadenza</th><th class="num">Compenso ${anno}</th><th>Stato</th>${puoRinnovare ? '<th></th>' : ''}
                    </tr></thead><tbody>${incs.map(rigaCoordIncarico).join('')}</tbody></table></div>
                </div>
            </details>`;
        };

        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Cruscotto</h1>
                    <p class="descrizione">Quadro generale degli incarichi di revisione e dei compensi.</p>
                </div>
                <div class="header-azioni">
                    ${Auth.puoScrivere('incarichi') ? '<button class="btn btn-primary" id="btn-nuovo-incarico">+ Nuovo incarico</button>' : ''}
                </div>
            </header>
            ${allerte.length ? `<div class="card" style="border-left:4px solid var(--rosso);">
                <h2>${ICO_ALLERTA}Allerte (${allerte.length})</h2>
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
                <div class="kpi ambra"><div class="etichetta">In scadenza (6 mesi)</div><div class="valore">${inScadenza.length}</div><div class="nota">${eurFmt.format(scadenzaTot)} di fatturato</div></div>
                <div class="kpi rosso"><div class="etichetta">Scaduti</div><div class="valore">${scaduti.length}</div><div class="nota">${eurFmt.format(scadutoTot)} di fatturato</div></div>
            </div>
            <div class="card">
                <h2>Andamento compensi per anno</h2>
                <p class="hint" style="margin:-6px 0 10px;">Passa sopra le barre per il dettaglio. Nell'anno in corso il fatturato <span style="color:#C9A227;font-weight:600;">in scadenza</span> e <span style="color:#C0392B;font-weight:600;">scaduto</span> e evidenziato nella barra.</p>
                <div id="grafico-compensi"></div>
            </div>
            <div class="card">
                <h2>Incarichi e fatturato per coordinatore territoriale</h2>
                <p class="hint" style="margin:-6px 0 12px;">Ogni coordinatore vede gli incarichi delle sue regioni (dalla scheda in Persone). Clicca su un coordinatore per l'elenco; le pastiglie mostrano quanti (e quanto fatturato) sono in scadenza o scaduti.</p>
                ${coordList.length ? '<div class="coord-lista">' + coordList.map(coordItem).join('') + '</div>' : '<p class="tabella-vuota">Nessun incarico attivo.</p>'}
            </div>
            <div class="card" id="sez-scadenze-dash">
                <h2>Incarichi in scadenza o scaduti</h2>
                ${tabellaScadenze(scaduti.concat(inScadenza))}
            </div>`;

        { const bni = document.getElementById('btn-nuovo-incarico'); if (bni) bni.addEventListener('click', () => naviga('wizard', { modalita: 'nuovo' })); }
        $vista().querySelectorAll('.a-letta').forEach(b =>
            b.addEventListener('click', () => { Allerte.segnaLetta(b.dataset.id); vistaDashboard(); }));
        $vista().querySelectorAll('[data-apri]').forEach(r =>
            r.addEventListener('click', () => naviga('dettaglio', { id: r.dataset.apri })));
        $vista().querySelectorAll('[data-rinnova]').forEach(b =>
            b.addEventListener('click', e => {
                e.stopPropagation();
                naviga('wizard', { modalita: 'rinnovo', id: b.dataset.rinnova });
            }));
        $vista().querySelectorAll('[data-termina]').forEach(b =>
            b.addEventListener('click', e => {
                e.stopPropagation();
                const inc = Incarichi.trova(b.dataset.termina);
                if (inc) modaleTerminaIncarico(inc, () => vistaDashboard());
            }));
        const tScad = $vista().querySelector('#sez-scadenze-dash table.dati');
        if (tScad) attrezzaTabella(tScad, { ricerca: true, nomeFile: 'incarichi-in-scadenza' });
        disegnaGraficoCompensiSvg('grafico-compensi', anno);
    }

    function tabellaScadenze(lista) {
        if (!lista.length) return '<p class="tabella-vuota">Nessun incarico in scadenza nei prossimi sei mesi.</p>';
        const puoRinnovare = Auth.puoScrivere('incarichi');
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
                ${puoRinnovare ? `<td data-label="" style="white-space:nowrap;"><button class="btn btn-sm btn-secondary" data-rinnova="${esc(i.id)}">Rinnova</button> <button class="btn btn-sm btn-secondary" data-termina="${esc(i.id)}">Termina</button></td>` : ''}
            </tr>`;
        }).join('') + '</tbody></table></div>';
    }

    /* =========================================================
       VISTA: ELENCO INCARICHI
    ========================================================= */
    const filtriIncarichi = { testo: '', tipo: '', area: '', regione: '', qualita: '', resp: '', stato: '', ordina: 'cliente', verso: 1 };
    let incarichiTab = 'attivi'; // scheda incarichi: 'attivi' | 'terminati'

    function annoRiferimento() {
        const anni = Incarichi.anniConCompensi();
        return Math.min(Math.max(annoCorrente(), anni[0]), anni[anni.length - 1]);
    }

    /* Unione tra roster e valori presenti negli incarichi (anche importati) */
    function valoriPresenti(campo, base) {
        const presenti = Incarichi.visibili().map(i => i[campo]).filter(Boolean);
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
                    ${Auth.puoScrivere('incarichi') ? '<button class="btn btn-primary" id="btn-nuovo-incarico">+ Nuovo incarico</button>' : ''}
                </div>
            </header>
            <div class="filtri">
                <div class="campo ricerca"><label>Ricerca</label><input type="text" id="f-testo" placeholder="Cliente, codice fiscale, regione..." value="${esc(filtriIncarichi.testo)}"></div>
                ${comboFiltro('f-tipo', 'Tipo', Object.keys(TIPI).map(t => TIPI[t]), filtriIncarichi.tipo)}
                ${comboFiltro('f-area', 'Area', listaAree, filtriIncarichi.area)}
                ${comboFiltro('f-regione', 'Regione', valoriPresenti('regione', RV_ROSTER.regioni), filtriIncarichi.regione)}
                ${comboFiltro('f-qualita', 'Qualita', listaQualita, filtriIncarichi.qualita)}
                ${comboFiltro('f-resp', 'Resp. incarico', listaResp, filtriIncarichi.resp)}
                ${comboFiltro('f-stato', 'Stato', ['Attivi', 'In scadenza', 'Scaduti'], filtriIncarichi.stato)}
            </div>
            <div id="contenitore-tabella"></div>`;

        const aggiorna = () => {
            filtriIncarichi.testo = document.getElementById('f-testo').value;
            filtriIncarichi.tipo = document.getElementById('f-tipo').value;
            filtriIncarichi.area = document.getElementById('f-area').value;
            filtriIncarichi.regione = document.getElementById('f-regione').value;
            filtriIncarichi.qualita = document.getElementById('f-qualita').value;
            filtriIncarichi.resp = document.getElementById('f-resp').value;
            filtriIncarichi.stato = document.getElementById('f-stato').value;
            disegnaTabellaIncarichi(annoRif);
        };
        ['f-testo', 'f-tipo', 'f-area', 'f-regione', 'f-qualita', 'f-resp', 'f-stato'].forEach(id =>
            document.getElementById(id).addEventListener('input', aggiorna));
        { const bni = document.getElementById('btn-nuovo-incarico'); if (bni) bni.addEventListener('click', () => naviga('wizard', { modalita: 'nuovo' })); }
        document.getElementById('btn-esporta-csv').addEventListener('click', esportaCsvIncarichi);
        disegnaTabellaIncarichi(annoRif);
    }

    function incarichiFiltrati(annoRif, statoOverride) {
        const f = filtriIncarichi;
        const stato = statoOverride !== undefined ? statoOverride : f.stato;
        if (!annoRif) annoRif = annoRiferimento();
        let lista = Incarichi.visibili();
        if (f.testo) {
            const t = f.testo.toLowerCase();
            lista = lista.filter(i =>
                (i.cliente || '').toLowerCase().includes(t) ||
                (i.codiceFiscale || '').toLowerCase().includes(t) ||
                (i.regione || '').toLowerCase().includes(t) ||
                (i.referente || '').toLowerCase().includes(t) ||
                (i.team || '').toLowerCase().includes(t));
        }
        // i filtri sono "combinati": testo digitato o suggerimento scelto, confronto "contiene"
        if (f.tipo) lista = lista.filter(i => filtroCorrisponde(TIPI[i.tipo] || i.tipo, f.tipo));
        if (f.area) lista = lista.filter(i => filtroCorrisponde(i.area, f.area));
        if (f.regione) lista = lista.filter(i => filtroCorrisponde(i.regione, f.regione));
        if (f.qualita) lista = lista.filter(i => filtroCorrisponde(i.qualita, f.qualita));
        if (f.resp) lista = lista.filter(i => filtroCorrisponde(i.respIncarico, f.resp));
        // stato: dall'esterno arriva la chiave (es. 'cessato'); dal filtro arriva il testo
        // digitato, che puo' corrispondere a piu' voci (es. "sca" = In scadenza + Scaduti)
        const controllaStato = (i, st) => {
            const s = Incarichi.statoScadenza(i);
            // "neutro" su un incarico non cessato significa "senza scadenza": e attivo
            if (st === 'attivo') return i.stato !== 'cessato' && i.stato !== 'dimesso' && (s.classe === 'verde' || s.classe === 'neutro');
            if (st === 'scadenza') return s.classe === 'ambra';
            if (st === 'scaduto') return s.classe === 'rosso';
            if (st === 'cessato') return i.stato === 'cessato';
            if (st === 'dimesso') return i.stato === 'dimesso';
            return true;
        };
        if (statoOverride !== undefined) {
            if (statoOverride) lista = lista.filter(i => controllaStato(i, statoOverride));
        } else if (stato && String(stato).trim()) {
            const chiavi = [['attivo', 'Attivi'], ['scadenza', 'In scadenza'], ['scaduto', 'Scaduti']]
                .filter(([, etich]) => filtroCorrisponde(etich, stato)).map(([k]) => k);
            lista = lista.filter(i => chiavi.some(k => controllaStato(i, k)));
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
        const cont = document.getElementById('contenitore-tabella');
        const puoRinnovare = Auth.puoScrivere('incarichi');
        // attivi: rispetta il filtro di stato (attivo/scadenza/scaduto). terminati: ignora il filtro di stato
        // (che riguarda solo gli attivi) cosi restano sempre visibili nella loro scheda.
        const attivi = incarichiFiltrati(annoRif).filter(i => i.stato !== 'cessato' && i.stato !== 'dimesso');
        const terminati = incarichiFiltrati(annoRif, 'cessato');
        const dismessi = incarichiFiltrati(annoRif, 'dimesso');

        // ogni gruppo (attivi / terminati / dismessi) ha la sua scheda invece di stare in sequenza
        const tabBar = `<div class="tab-dest" style="margin-bottom:16px;">
            <button class="tab-btn ${incarichiTab === 'attivi' ? 'attivo' : ''}" data-inctab="attivi">Attivi (${attivi.length})</button>
            <button class="tab-btn ${incarichiTab === 'terminati' ? 'attivo' : ''}" data-inctab="terminati">Terminati (${terminati.length})</button>
            <button class="tab-btn ${incarichiTab === 'dismessi' ? 'attivo' : ''}" data-inctab="dismessi">Dismessi (${dismessi.length})</button>
        </div>`;

        let corpo;
        if (incarichiTab === 'dismessi') {
            corpo = dismessi.length ? `<div class="card" id="sez-dismessi">
                <p class="descrizione" style="margin:0 0 12px;">Incarichi da cui il revisore si e dimesso, con la data delle dimissioni. Apri una riga per il dettaglio o premi <strong>Riattiva</strong> per riportarlo tra gli attivi.</p>
                <div class="tabella-wrap"><table class="dati a-schede"><thead><tr>
                    <th>Cliente</th><th>Tipo</th><th>Regione</th><th>Resp. incarico</th><th>Data dimissioni</th><th>Registrate il</th>${puoRinnovare ? '<th></th>' : ''}
                </tr></thead><tbody>` +
                dismessi.map(i => `<tr class="cliccabile" data-apri="${esc(i.id)}">
                    <td class="cliente-cella" data-label="Cliente">${esc(i.cliente)}</td>
                    <td data-label="Tipo">${badgeTipo(i.tipo)}</td>
                    <td data-label="Regione">${esc(i.regione || '')}</td>
                    <td data-label="Resp. incarico">${esc(i.respIncarico || '')}</td>
                    <td data-label="Data dimissioni">${i.dimissioni && i.dimissioni.data ? esc(fmtData(i.dimissioni.data)) : ''}</td>
                    <td data-label="Registrate il">${i.dimissioni ? esc(fmtDataOra(i.dimissioni.il)) : ''}</td>
                    ${puoRinnovare ? `<td data-label=""><button class="btn btn-sm btn-secondary" data-riattiva="${esc(i.id)}">Riattiva</button></td>` : ''}
                </tr>`).join('') +
                `</tbody></table></div></div>`
                : '<div class="card tabella-vuota">Nessun incarico dismesso.</div>';
        } else if (incarichiTab === 'terminati') {
            corpo = terminati.length ? `<div class="card" id="sez-terminati">
                <p class="descrizione" style="margin:0 0 12px;">Incarichi conclusi, tenuti fuori dall'elenco principale. Apri una riga per il dettaglio o premi <strong>Riattiva</strong> per riportarlo tra gli attivi.</p>
                <div class="tabella-wrap"><table class="dati a-schede"><thead><tr>
                    <th>Cliente</th><th>Tipo</th><th>Regione</th><th>Fine</th><th>Resp. incarico</th><th>Terminato il</th>${puoRinnovare ? '<th></th>' : ''}
                </tr></thead><tbody>` +
                terminati.map(i => `<tr class="cliccabile" data-apri="${esc(i.id)}">
                    <td class="cliente-cella" data-label="Cliente">${esc(i.cliente)}</td>
                    <td data-label="Tipo">${badgeTipo(i.tipo)}</td>
                    <td data-label="Regione">${esc(i.regione || '')}</td>
                    <td data-label="Fine">${esc(fmtData(i.rinnovo || i.dataFine))}</td>
                    <td data-label="Resp. incarico">${esc(i.respIncarico || '')}</td>
                    <td data-label="Terminato il">${i.terminato ? esc(fmtDataOra(i.terminato.il)) : ''}</td>
                    ${puoRinnovare ? `<td data-label=""><button class="btn btn-sm btn-secondary" data-riattiva="${esc(i.id)}">Riattiva</button></td>` : ''}
                </tr>`).join('') +
                `</tbody></table></div></div>`
                : '<div class="card tabella-vuota">Nessun incarico terminato.</div>';
        } else {
            const totale = attivi.reduce((s, i) => s + Incarichi.compensoAnno(i, annoRif), 0);
            const colonne = [
                { chiave: 'cliente', nome: 'Cliente' },
                { chiave: 'tipo', nome: 'Tipo' },
                { chiave: 'dataInizio', nome: 'Inizio' },
                { chiave: 'dataFine', nome: 'Fine' },
                { chiave: 'area', nome: 'Area' },
                { chiave: 'regione', nome: 'Regione' },
                { chiave: 'qualita', nome: 'Qualita' },
                { chiave: 'respIncarico', nome: 'Resp. incarico' },
                { chiave: 'team', nome: 'Team' },
                { chiave: 'compenso', nome: 'Compenso ' + annoRif, num: true },
                { chiave: 'scadenza', nome: 'Stato' }
            ];
            corpo = attivi.length ? `<div class="tabella-wrap"><table class="dati a-schede"><thead><tr>` +
                colonne.map(c => `<th class="${c.num ? 'num' : ''}" data-ordina="${c.chiave}">${c.nome}${filtriIncarichi.ordina === c.chiave ? (filtriIncarichi.verso > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('') +
                (puoRinnovare ? '<th></th>' : '') +
                `</tr></thead><tbody>` +
                attivi.map(i => {
                    const s = Incarichi.statoScadenza(i);
                    return `<tr class="cliccabile" data-apri="${esc(i.id)}">
                        <td class="cliente-cella" data-label="Cliente">${esc(i.cliente)}</td>
                        <td data-label="Tipo">${badgeTipo(i.tipo)}</td>
                        <td data-label="Inizio">${i.dataInizio ? esc(fmtData(i.dataInizio)) : esc(i.dataInizioNote || '')}</td>
                        <td data-label="Fine">${esc(fmtData(i.rinnovo || i.dataFine))}</td>
                        <td data-label="Area">${esc(i.area || '')}</td>
                        <td data-label="Regione">${esc(i.regione || '')}</td>
                        <td data-label="Qualita">${esc(i.qualita || '')}</td>
                        <td data-label="Resp. incarico">${esc(i.respIncarico || '')}</td>
                        <td data-label="Team">${esc(i.team || '')}</td>
                        <td class="num" data-label="Compenso ${annoRif}">${Incarichi.compensoAnno(i, annoRif) ? eurFmt.format(Incarichi.compensoAnno(i, annoRif)) : ''}</td>
                        <td data-label="Stato"><span class="badge ${s.classe}">${esc(s.testo)}</span></td>
                        ${puoRinnovare ? `<td data-label="" style="white-space:nowrap;"><button class="btn btn-sm btn-secondary" data-rinnova="${esc(i.id)}">Rinnova</button> <button class="btn btn-sm btn-secondary" data-termina="${esc(i.id)}">Termina</button> <button class="btn btn-sm btn-secondary" data-dimetti="${esc(i.id)}">Dimissioni</button></td>` : ''}
                    </tr>`;
                }).join('') +
                `</tbody><tfoot><tr><td colspan="9">Totale (${attivi.length} incarichi)</td><td class="num">${eurFmt.format(totale)}</td><td></td>${puoRinnovare ? '<td></td>' : ''}</tr></tfoot></table></div>`
                : '<div class="card tabella-vuota">Nessun incarico attivo corrisponde ai filtri.</div>';
        }

        cont.innerHTML = tabBar + corpo;

        cont.querySelectorAll('[data-inctab]').forEach(b =>
            b.addEventListener('click', () => { incarichiTab = b.dataset.inctab; disegnaTabellaIncarichi(annoRif); }));
        cont.querySelectorAll('[data-apri]').forEach(r =>
            r.addEventListener('click', () => naviga('dettaglio', { id: r.dataset.apri })));
        cont.querySelectorAll('[data-rinnova]').forEach(b =>
            b.addEventListener('click', e => {
                e.stopPropagation();
                naviga('wizard', { modalita: 'rinnovo', id: b.dataset.rinnova });
            }));
        cont.querySelectorAll('[data-termina]').forEach(b =>
            b.addEventListener('click', e => {
                e.stopPropagation();
                const inc = Incarichi.trova(b.dataset.termina);
                if (inc) modaleTerminaIncarico(inc, () => disegnaTabellaIncarichi(annoRif));
            }));
        cont.querySelectorAll('[data-dimetti]').forEach(b =>
            b.addEventListener('click', e => {
                e.stopPropagation();
                const inc = Incarichi.trova(b.dataset.dimetti);
                if (inc) modaleDimissioniIncarico(inc, () => disegnaTabellaIncarichi(annoRif));
            }));
        cont.querySelectorAll('[data-riattiva]').forEach(b =>
            b.addEventListener('click', e => {
                e.stopPropagation();
                Incarichi.riattiva(b.dataset.riattiva, Auth.utenteCorrente);
                toast('Incarico riattivato: torna tra gli incarichi attivi.', 'verde');
                disegnaTabellaIncarichi(annoRif);
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
        const righe = [['Cliente', 'Tipo', 'Codice fiscale', 'Data inizio', 'Data fine', 'Rinnovo', 'Area', 'Regione', 'Qualita', 'Resp. incarico', 'Referente', 'Team', 'Fatturazione', 'Stato'].concat(anni.map(String))];
        incarichiFiltrati(annoRiferimento()).forEach(i => {
            righe.push([
                i.cliente, nomeTipo(i.tipo), i.codiceFiscale || '', i.dataInizio || i.dataInizioNote || '', i.dataFine || '',
                i.rinnovo || '', i.area || '', i.regione || '', i.qualita || '', i.respIncarico || '',
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
        // filtro regione: non si apre un incarico fuori dalle regioni consentite al ruolo
        if (!Auth.vedeIncarico(inc)) { naviga('incarichi'); return; }
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
                        ${inc.calcoloCongelato ? '<span class="badge ambra">' + ICO_LUCCHETTO + 'Calcolo congelato</span>' : ''}
                    </p>
                </div>
                <div class="header-azioni">
                    <button class="btn btn-ghost" id="btn-indietro">&larr; Elenco</button>
                    ${Auth.puoScrivere('incarichi') ? `
                        <button class="btn btn-secondary" id="btn-modifica">Modifica</button>
                        <button class="btn btn-secondary" id="btn-rinnova">Rinnova</button>
                        ${inc.stato === 'cessato' || inc.stato === 'dimesso' ? '<button class="btn btn-secondary" id="btn-riattiva-inc">Riattiva incarico</button>' : '<button class="btn btn-secondary" id="btn-termina-inc">Termina incarico</button><button class="btn btn-secondary" id="btn-dimetti-inc">Dimissioni</button>'}
                        ${inc.calcoloCongelato ? '<button class="btn btn-secondary" id="btn-sblocca">Sblocca calcolo</button>' : ''}
                        ${inc.tipo === 'legale' || inc.tipo === 'volontaria' ? '<button class="btn btn-primary" id="btn-lettera">Lettera di incarico</button>' : ''}
                    ` : ''}
                </div>
            </header>
            ${inc.calcoloCongelato ? `<div class="card" style="border-left:4px solid var(--oro);">
                <p class="descrizione" style="margin:0;">${ICO_LUCCHETTO}Il calcolo del compenso e congelato${inc.congelamento && inc.congelamento.il ? ' dal ' + fmtDataOra(inc.congelamento.il) : ''}. Per modificarlo, usa "Sblocca calcolo": verra inviato un messaggio di allerta al titolare.</p>
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
                            ${rigaRiepilogo('Email', [inc.email1, inc.email2].filter(Boolean).join(', '))}
                        </div>
                        <div class="riepilogo-blocco">
                            <h4>Durata</h4>
                            ${rigaRiepilogo('Tipo', TIPI[inc.tipo] || inc.tipo)}
                            ${rigaRiepilogo('Presenza in MEF', inc.presenzaMef)}
                            ${rigaRiepilogo('Data inizio', inc.dataInizio ? fmtData(inc.dataInizio) : inc.dataInizioNote)}
                            ${rigaRiepilogo('Data fine', fmtData(inc.dataFine) || inc.dataFineNote)}
                            ${rigaRiepilogo('Rinnovo', inc.rinnovo ? fmtData(inc.rinnovo) : inc.rinnovoNote)}
                            ${rigaRiepilogo('Stato', (inc.stato === 'cessato' ? 'Terminato' : (inc.stato === 'dimesso' ? 'Dimesso' + (inc.dimissioni && inc.dimissioni.data ? ' il ' + fmtData(inc.dimissioni.data) : '') : (inc.stato === 'attivo' ? 'Attivo' : inc.stato))) + (inc.statoNote ? ' (' + inc.statoNote + ')' : ''))}
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
                        <p class="descrizione" style="margin-bottom:12px;">Fatturazione: <strong>${esc(descriviFatturazione(inc))}</strong>${inc.gruppoFatturazione ? ' &middot; Gruppo: <strong>' + esc(inc.gruppoFatturazione) + '</strong>' : ''}</p>
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
                    ${(inc.storico && inc.storico.length) ? `<div class="card" id="periodi-precedenti">
                        <h2>Periodi precedenti (${inc.storico.length})</h2>
                        <p class="descrizione" style="margin-bottom:12px;">Ogni rinnovo archivia qui il periodo concluso, con la sua lettera di incarico ricreabile.</p>
                        <div class="tabella-wrap"><table class="dati"><thead><tr><th>Periodo</th><th>Scadenza</th><th class="num">Compenso 1&deg; esercizio</th><th>Rinnovato il</th>${(inc.tipo === 'legale' || inc.tipo === 'volontaria') ? '<th></th>' : ''}</tr></thead><tbody>` +
                            inc.storico.map((s, i) => {
                                const durataS = s.tipo === 'legale' ? 3 : 1;
                                const primoS = s.esercizioPeriodo ? Number(s.esercizioPeriodo) : null;
                                const periodoS = primoS ? (durataS > 1 ? primoS + '-' + (primoS + durataS - 1) : String(primoS)) : 'n.d.';
                                const compS = primoS ? (Number((s.compensi || {})[primoS]) || 0) : 0;
                                const scadS = s.rinnovo || s.dataFine;
                                const azS = (inc.tipo === 'legale' || inc.tipo === 'volontaria') ? '<td><button class="btn btn-sm btn-secondary p-lettera-storica" data-periodo="' + i + '">Vedi lettera</button></td>' : '';
                                return '<tr><td><strong>' + periodoS + '</strong>' + (s.calcoloCongelato ? ' <span class="badge ambra">' + ICO_LUCCHETTO + 'congelato</span>' : '') + '</td><td>' + (scadS ? fmtData(scadS) : '') + '</td><td class="num">' + eurFmt.format(compS) + '</td><td>' + (s.chiuso ? fmtDataOra(s.chiuso.il) : '') + '</td>' + azS + '</tr>';
                            }).join('') +
                        `</tbody></table></div>
                    </div>` : ''}
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
        $vista().querySelectorAll('.p-lettera-storica').forEach(b =>
            b.addEventListener('click', () => naviga('lettera', { id: inc.id, periodo: Number(b.dataset.periodo) })));
        if (Auth.puoScrivere('incarichi')) {
            document.getElementById('btn-modifica').addEventListener('click', () => naviga('wizard', { modalita: 'modifica', id: inc.id }));
            document.getElementById('btn-rinnova').addEventListener('click', () => naviga('wizard', { modalita: 'rinnovo', id: inc.id }));
            const btnLettera = document.getElementById('btn-lettera');
            if (btnLettera) btnLettera.addEventListener('click', () => naviga('lettera', { id: inc.id }));
            const btnSblocca = document.getElementById('btn-sblocca');
            if (btnSblocca) btnSblocca.addEventListener('click', () => modaleSblocco(inc));
            const btnTermina = document.getElementById('btn-termina-inc');
            if (btnTermina) btnTermina.addEventListener('click', () => modaleTerminaIncarico(inc));
            const btnDimetti = document.getElementById('btn-dimetti-inc');
            if (btnDimetti) btnDimetti.addEventListener('click', () => modaleDimissioniIncarico(inc));
            const btnRiattivaInc = document.getElementById('btn-riattiva-inc');
            if (btnRiattivaInc) btnRiattivaInc.addEventListener('click', () => {
                Incarichi.riattiva(inc.id, Auth.utenteCorrente);
                toast('Incarico riattivato: torna tra gli incarichi attivi.', 'verde');
                naviga('dettaglio', { id: inc.id });
            });
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

    // termina l'incarico: conferma e spostamento nella scheda "Terminati".
    // onDone opzionale: eseguito dopo la conferma (dall'elenco ridisegna la tabella; dal dettaglio si ricarica la scheda)
    function modaleTerminaIncarico(inc, onDone) {
        apriModale(`<h2>Terminare l'incarico?</h2>
            <p>L'incarico <strong>${esc(inc.cliente)}</strong> verra spostato nella scheda <strong>Terminati</strong> e non comparira piu tra gli attivi. Potrai riattivarlo in qualsiasi momento. L'operazione resta nel registro modifiche.</p>
            <div class="modale-azioni">
                <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                <button class="btn btn-primary" id="m-conferma">Termina incarico</button>
            </div>`);
        document.getElementById('m-annulla').addEventListener('click', chiudiModale);
        document.getElementById('m-conferma').addEventListener('click', () => {
            Incarichi.termina(inc.id, Auth.utenteCorrente);
            chiudiModale();
            toast('Incarico terminato e spostato nella scheda "Terminati".', 'verde');
            if (onDone) onDone(); else naviga('dettaglio', { id: inc.id });
        });
    }

    /* Dimissioni dall'incarico: chiede la DATA delle dimissioni (di default oggi) e sposta
       l'incarico nella scheda "Dismessi". Riattivabile come i terminati. */
    function modaleDimissioniIncarico(inc, onDone) {
        apriModale(`<h2>Dimissioni dall'incarico?</h2>
            <p>L'incarico <strong>${esc(inc.cliente)}</strong> verra spostato nella scheda <strong>Dismessi</strong> con la data delle dimissioni, e non comparira piu tra gli attivi. Potrai riattivarlo in qualsiasi momento. L'operazione resta nel registro modifiche.</p>
            <div class="campo"><label>Data delle dimissioni</label><input type="date" id="m-dim-data" value="${oggiISO()}"></div>
            <div class="msg-errore hidden" id="m-dim-err"></div>
            <div class="modale-azioni">
                <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                <button class="btn btn-primary" id="m-conferma">Registra le dimissioni</button>
            </div>`);
        document.getElementById('m-annulla').addEventListener('click', chiudiModale);
        document.getElementById('m-conferma').addEventListener('click', () => {
            const data = document.getElementById('m-dim-data').value;
            const err = document.getElementById('m-dim-err');
            if (!data) { err.textContent = 'Indica la data delle dimissioni.'; err.classList.remove('hidden'); return; }
            Incarichi.dimetti(inc.id, data, Auth.utenteCorrente);
            chiudiModale();
            toast('Dimissioni registrate al ' + fmtData(data) + ': incarico nella scheda "Dismessi".', 'verde');
            if (onDone) onDone(); else naviga('dettaglio', { id: inc.id });
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
                cliente: '', tipo: 'legale', codiceFiscale: '', area: 'Nord', regione: 'Lombardia',
                email1: '', email2: '', qualita: '', respIncarico: '', referente: '', team: '',
                fatturazione: fatturazionePredefinita('legale'), gruppoFatturazione: '', fattInizio: null, fattFine: null, fattData: null, compensi: {}, stato: 'attivo'
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
            const teamCompleto = Array.from(new Set(Persone.attive('team').concat(teamSel))).sort((a, b) => a.localeCompare(b, 'it'));
            corpo.innerHTML = `
                <h2>Team di revisione</h2>
                <p class="descrizione" style="margin-bottom:12px;">Assegna i ruoli e scegli i componenti del team. I nominativi si gestiscono dalla vista Persone.</p>
                <div class="griglia-2">
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
                <div class="campo"><label>Team di revisione (componenti)</label>
                    <div class="team-picker">
                        <div class="team-picker-barra">
                            <input id="w-team-cerca" type="search" placeholder="Cerca un nominativo...">
                            <button type="button" class="btn btn-sm btn-ghost" data-team-sel="1">Seleziona tutti</button>
                            <button type="button" class="btn btn-sm btn-ghost" data-team-sel="0">Deseleziona</button>
                            <span class="hint" id="w-team-conteggio"></span>
                        </div>
                        <div class="team-picker-chips" id="w-team-chips"></div>
                        <div class="team-picker-lista" id="w-team-lista">
                            ${teamCompleto.length ? teamCompleto.map(t => `<label class="team-opz" data-nome="${esc(t)}"><input type="checkbox" class="w-team-check" value="${esc(t)}" ${teamSel.includes(t) ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('') : '<div class="hint" style="padding:6px;">Nessun nominativo con ruolo team: aggiungili dalla vista Persone.</div>'}
                        </div>
                    </div>
                </div>`;
            const teamLista = document.getElementById('w-team-lista');
            const teamChips = document.getElementById('w-team-chips');
            const teamConta = document.getElementById('w-team-conteggio');
            const aggiornaTeam = () => {
                const sel = Array.from(teamLista.querySelectorAll('.w-team-check:checked')).map(c => c.value);
                teamConta.textContent = sel.length + ' selezionat' + (sel.length === 1 ? 'o' : 'i') + ' su ' + teamCompleto.length;
                teamChips.innerHTML = sel.length
                    ? sel.map(n => `<span class="team-chip">${esc(n)}<button type="button" class="team-chip-x" title="Rimuovi" data-nome="${esc(n)}">&times;</button></span>`).join('')
                    : '<span class="hint">Nessun componente selezionato.</span>';
                teamChips.querySelectorAll('.team-chip-x').forEach(b => b.addEventListener('click', () => {
                    teamLista.querySelectorAll('.w-team-check').forEach(cb => { if (cb.value === b.dataset.nome) cb.checked = false; });
                    aggiornaTeam();
                }));
            };
            teamLista.querySelectorAll('.w-team-check').forEach(c => c.addEventListener('change', aggiornaTeam));
            const teamCerca = document.getElementById('w-team-cerca');
            teamCerca.addEventListener('input', () => {
                const q = teamCerca.value.trim().toLowerCase();
                teamLista.querySelectorAll('.team-opz').forEach(row => { row.style.display = (!q || (row.dataset.nome || '').toLowerCase().includes(q)) ? '' : 'none'; });
            });
            corpo.querySelectorAll('[data-team-sel]').forEach(b => b.addEventListener('click', () => {
                const on = b.dataset.teamSel === '1';
                teamLista.querySelectorAll('.team-opz').forEach(row => { if (row.style.display !== 'none') { const cb = row.querySelector('.w-team-check'); if (cb) cb.checked = on; } });
                aggiornaTeam();
            }));
            aggiornaTeam();
        } else if (w.passo === 5) {
            const mappa = compensiRisultanti();
            const anno0 = anniEsercizi()[0];
            const compenso = mappa[anno0] || 0;
            const pInizio = d.fattInizio ? (d.fattInizio.anno + '-' + String(d.fattInizio.mese).padStart(2, '0')) : '';
            const pFine = d.fattFine ? (d.fattFine.anno + '-' + String(d.fattFine.mese).padStart(2, '0')) : '';
            const gruppiFatt = Array.from(new Set(Incarichi.tutti().map(i => i.gruppoFatturazione).filter(Boolean))).sort();
            corpo.innerHTML = `
                <h2>Fatturazione</h2>
                <div class="campo"><label>Modalita di fatturazione *</label>
                    <select id="w-fatturazione">
                        <option value="annuale" ${d.fatturazione === 'annuale' ? 'selected' : ''}>Annuale (una rata l'anno)</option>
                        <option value="trimestrale" ${d.fatturazione === 'trimestrale' ? 'selected' : ''}>Trimestrale (quattro rate l'anno)</option>
                        <option value="mensile" ${d.fatturazione === 'mensile' ? 'selected' : ''}>Mensile (dodici rate l'anno)</option>
                        <option value="specifica" ${d.fatturazione === 'specifica' ? 'selected' : ''}>Ad una data specifica</option>
                    </select>
                    <div class="hint">Predefinita per ${esc(nomeTipo(d.tipo))}: ${esc(fatturazionePredefinita(d.tipo))}.</div>
                </div>
                <div class="campo"><label>Gruppo di fatturazione</label>
                    <input id="w-gruppo-fatt" list="w-gruppi-fatt" value="${esc(d.gruppoFatturazione || '')}" placeholder="es. BC&amp; (facoltativo)" maxlength="40">
                    <datalist id="w-gruppi-fatt">${gruppiFatt.map(g => '<option value="' + esc(g) + '">').join('')}</datalist>
                    <div class="hint">Raggruppa piu incarichi in un'unica fatturazione. Lascia vuoto se l'incarico si fattura da solo.</div>
                </div>
                <div class="griglia-2" id="w-finestra">
                    <div class="campo"><label>Inizio fatturazione</label><input type="month" id="w-fatt-inizio" value="${pInizio}"><div class="hint">Da quale periodo parte. Vuoto = da subito.</div></div>
                    <div class="campo"><label>Fine fatturazione</label><input type="month" id="w-fatt-fine" value="${pFine}"><div class="hint">Quando termina. Vuoto = senza fine.</div></div>
                </div>
                <div class="campo" id="w-data-specifica"><label>Data della fattura</label><input type="date" id="w-fatt-data" value="${d.fattData || ''}"><div class="hint">La scadenza cade in questa data, nell'esercizio corrispondente.</div></div>
                <div class="calc-riquadro" id="w-anteprima-rate"></div>`;
            const sincronizzaCampi = () => {
                const per = document.getElementById('w-fatturazione').value;
                document.getElementById('w-finestra').style.display = per === 'specifica' ? 'none' : '';
                document.getElementById('w-data-specifica').style.display = per === 'specifica' ? '' : 'none';
            };
            const anteprima = () => {
                const per = document.getElementById('w-fatturazione').value;
                const pi = document.getElementById('w-fatt-inizio').value;
                const pf = document.getElementById('w-fatt-fine').value;
                const temp = {
                    id: 'anteprima', fatturazione: per, compensi: mappa,
                    fattData: per === 'specifica' ? (document.getElementById('w-fatt-data').value || null) : null,
                    fattInizio: (per !== 'specifica' && pi) ? { anno: Number(pi.slice(0, 4)), mese: Number(pi.slice(5, 7)) } : null,
                    fattFine: (per !== 'specifica' && pf) ? { anno: Number(pf.slice(0, 4)), mese: Number(pf.slice(5, 7)) } : null
                };
                const rate = Fatture.rate(temp, anno0);
                const box = document.getElementById('w-anteprima-rate');
                if (!rate.length) { box.innerHTML = `<div class="calc-riga"><span>Scadenze nel ${anno0}</span><span class="val">nessuna</span></div><div class="hint" style="margin-top:6px;">Con queste impostazioni il primo esercizio (${anno0}) non genera scadenze: verifica la finestra o la data.</div>`; return; }
                box.innerHTML =
                    `<div class="calc-riga"><span>Compenso primo esercizio (${anno0})</span><span class="val">${eurFmt.format(compenso)}</span></div>
                     <div class="calc-riga"><span>Scadenze nel ${anno0}</span><span class="val">${rate.length}</span></div>
                     <div class="calc-riga totale"><span>Importo scadenza</span><span class="val">${eurFmt2.format(rate[0].importo)}</span></div>`;
            };
            document.getElementById('w-fatturazione').addEventListener('change', () => { w.fatturazioneToccata = true; sincronizzaCampi(); anteprima(); });
            ['w-fatt-inizio', 'w-fatt-fine', 'w-fatt-data'].forEach(idw => { const el = document.getElementById(idw); if (el) el.addEventListener('change', anteprima); });
            sincronizzaCampi();
            anteprima();
        } else if (w.passo === 6) {
            const anni = anniEsercizi();
            const mappa = compensiRisultanti();
            corpo.innerHTML = `
                <h2>Riepilogo</h2>
                <div class="riepilogo-blocco"><h4>Cliente</h4>
                    ${rigaRiepilogo('Ragione sociale', d.cliente)}
                    ${rigaRiepilogo('Codice fiscale', d.codiceFiscale)}
                    ${rigaRiepilogo('Regione', d.regione)}
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
                    ${rigaRiepilogo('Fatturazione', descriviFatturazione(d))}
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
                    <strong>${ICO_LUCCHETTO}Calcolo congelato</strong>
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
                <div class="campo"><label>Totale attivo patrimoniale</label><input id="c-attivo" inputmode="numeric" value="${c.attivo ? numFmt.format(c.attivo) : ''}" placeholder="es. 5.000.000"><div class="imp-eco" id="c-attivo-eco"></div></div>
                <div class="campo"><label>Ricavi delle vendite</label><input id="c-ricavi" inputmode="numeric" value="${c.ricavi ? numFmt.format(c.ricavi) : ''}" placeholder="es. 8.000.000"><div class="imp-eco" id="c-ricavi-eco"></div></div>
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
                <div class="campo"><label>Tariffa oraria media</label><input id="c-tariffa" type="number" min="0" value="${c.tariffa || 85}"><div class="imp-eco" id="c-tariffa-eco"></div><div class="hint">Tariffa media ponderata del team (partner, manager, senior, junior).</div></div>
                <div class="campo"><label>Note sul rischio</label><input id="c-note" value="${esc(c.rischioNote || '')}" placeholder="es. governance, contenziosi, sistemi IT"></div>
            </div>
            <div class="calc-riquadro" id="c-risultato"></div>
            <div class="campo" style="margin-top:10px;">
                <label style="display:flex; align-items:center; gap:8px; font-weight:600;">
                    <input type="checkbox" id="c-manuale" ${w.compensoManuale ? 'checked' : ''} style="width:auto;"> Imposta il compenso annuo manualmente
                </label>
                <input id="c-compenso-manuale" inputmode="numeric" class="${w.compensoManuale ? '' : 'hidden'}" value="${w.compensoManualeValore ? numFmt.format(w.compensoManualeValore) : ''}" placeholder="es. 8.500" style="margin-top:8px;">
                <div class="imp-eco ${w.compensoManuale ? '' : 'hidden'}" id="c-compenso-manuale-eco"></div>
            </div>`;

        /* Eco in euro sotto i campi importo. Mostra il valore che il calcolo sta USANDO, non
           quello che e' stato battuto: chi scrive 5000000 vede subito 5.000.000 euro senza
           contare gli zeri, e se sbaglia a digitare se ne accorge qui. */
        const ecoImporto = (id, valore, suffisso) => {
            const el = document.getElementById(id);
            if (el) el.textContent = valore > 0 ? eurFmt.format(valore) + (suffisso || '') : '';
        };
        const aggiornaEco = () => {
            ecoImporto('c-attivo-eco', w.calc.attivo);
            ecoImporto('c-ricavi-eco', w.calc.ricavi);
            ecoImporto('c-tariffa-eco', w.calc.tariffa, ' all\'ora');
            ecoImporto('c-compenso-manuale-eco', w.compensoManualeValore, ' all\'anno');
        };
        const ricalcola = () => {
            leggiCampiCalcolo();
            aggiornaEco();
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
            document.getElementById('c-compenso-manuale-eco').classList.toggle('hidden', !e.target.checked);
        });
        // il compenso manuale non passa da ricalcola: qui l'eco va aggiornato a parte
        document.getElementById('c-compenso-manuale').addEventListener('input', () => {
            wizard.compensoModificato = true;
            leggiCampiCalcolo();
            aggiornaEco();
        });
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
            d.gruppoFatturazione = document.getElementById('w-gruppo-fatt').value.trim();
            if (d.fatturazione === 'specifica') {
                d.fattData = document.getElementById('w-fatt-data').value || null;
                d.fattInizio = null; d.fattFine = null;
            } else {
                d.fattData = null;
                const pi = document.getElementById('w-fatt-inizio').value;
                const pf = document.getElementById('w-fatt-fine').value;
                d.fattInizio = pi ? { anno: Number(pi.slice(0, 4)), mese: Number(pi.slice(5, 7)) } : null;
                d.fattFine = pf ? { anno: Number(pf.slice(0, 4)), mese: Number(pf.slice(5, 7)) } : null;
            }
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
            // archivia il periodo PRECEDENTE (dati + lettera ricreabile) prima di sovrascrivere
            const prec = Incarichi.trova(w.idEsistente);
            if (prec) {
                const snap = {
                    chiuso: { il: Date.now(), da: (Auth.utenteCorrente.nome || Auth.utenteCorrente.email || '') },
                    esercizioPeriodo: prec.esercizioPeriodo || null,
                    tipo: prec.tipo,
                    dataInizio: prec.dataInizio || null,
                    rinnovo: prec.rinnovo || null,
                    dataFine: prec.dataFine || null,
                    compensi: Object.assign({}, prec.compensi || {}),
                    calc: prec.calc ? Object.assign({}, prec.calc) : null,
                    qualita: prec.qualita, respIncarico: prec.respIncarico, referente: prec.referente, team: prec.team,
                    calcoloCongelato: !!prec.calcoloCongelato, congelamento: prec.congelamento || null
                };
                d.storico = (prec.storico || []).concat([snap]);
            }
            // un rinnovo riporta l'incarico ATTIVO: chi rinnova un incarico terminato o
            // dimesso (es. revisore ri-nominato) non deve doverlo riattivare a parte
            d.stato = 'attivo';
            d.terminato = null;
            d.dimissioni = null;
            const agg = Incarichi.aggiorna(w.idEsistente, d, Auth.utenteCorrente, 'Rinnovo incarico');
            toast(haLettera ? 'Incarico rinnovato. Il periodo precedente e archiviato in "Periodi precedenti"; ora puoi stampare la nuova lettera.' : 'Incarico rinnovato. Il periodo precedente e archiviato.', 'verde');
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
    let fattTab = ''; // scheda periodicita: 'mensile' | 'trimestrale' | 'annuale' | 'specifica'
    let fattSub = null; // sotto-scheda: mese (1-12) per mensile, trimestre (1-4) per trimestrale; null altrimenti
    let fattAperti = null; // gruppi di fatturazione aperti (Set di nomi); null = predefinito (solo "Senza gruppo")

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
                    <button class="btn btn-secondary" id="btn-esporta-fatt">Esporta CSV</button>
                </div>
            </header>
            <div id="fatturazione-corpo"></div>`;
        document.getElementById('f-anno').addEventListener('change', e => {
            annoFatturazione = Number(e.target.value);
            fattSub = null;
            fattAperti = null;
            disegnaFatturazione();
        });
        document.getElementById('btn-esporta-fatt').addEventListener('click', esportaCsvFatturazione);
        disegnaFatturazione();
    }

    function disegnaFatturazione() {
        const anno = annoFatturazione;
        const rateAll = Fatture.tutteAnno(anno);
        const corpo = document.getElementById('fatturazione-corpo');
        if (!rateAll.length) {
            corpo.innerHTML = '<div class="card tabella-vuota">Nessun compenso registrato per l\'esercizio ' + anno + '.</div>';
            return;
        }
        const puoMod = Auth.puoScrivere('fatturazione');
        const mesi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
        const mesiFull = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
        const perc5 = imp => Math.round(imp * 5) / 100;
        // importi in euro con decimali (formato italiano): parse robusto e formattazione per il campo
        const parseEuro = s => {
            s = String(s == null ? '' : s).replace(/[^\d.,-]/g, '').trim();
            if (!s) return 0;
            if (s.indexOf(',') >= 0) {
                s = s.replace(/\./g, '').replace(',', '.');            // virgola = decimali, punto = migliaia
            } else if (s.indexOf('.') >= 0) {
                const parti = s.split('.');
                // piu punti (1.234.567) o ultimo gruppo di 3 cifre (1.234) = separatore di migliaia; altrimenti punto decimale (50.5, 50.00)
                if (parti.length > 2 || parti[parti.length - 1].length === 3) s = parti.join('');
            }
            return Math.round((Number(s) || 0) * 100) / 100;
        };
        const fmtEuroInput = n => n ? Number(n).toFixed(2).replace('.', ',') : '';

        // KPI e grafico: quadro dell'intero anno (tutte le periodicita)
        const totaleAnno = rateAll.reduce((s, r) => s + r.importo, 0);
        const emesse = rateAll.filter(r => r.stato !== 'da emettere');
        const incassate = rateAll.filter(r => r.stato === 'incassata');
        const perMese = {};
        rateAll.forEach(r => { perMese[r.mese] = (perMese[r.mese] || 0) + r.importo; });

        // schede per periodicita (solo quelle presenti nell'anno)
        const perDi = r => (r.incarico.fatturazione || 'annuale');
        const ordine = ['mensile', 'trimestrale', 'annuale', 'specifica'];
        const etichettaPer = { mensile: 'Mensile', trimestrale: 'Trimestrale', annuale: 'Annuale', specifica: 'Data specifica' };
        const presenti = ordine.filter(p => rateAll.some(r => perDi(r) === p));
        if (!presenti.includes(fattTab)) fattTab = presenti[0];
        let rateTab = rateAll.filter(r => perDi(r) === fattTab);

        // sotto-schede: il mensile si divide in tante finestre quanti sono i mesi, il trimestrale nei trimestri
        let subTabs = '';
        if (fattTab === 'mensile' || fattTab === 'trimestrale') {
            const perMensile = fattTab === 'mensile';
            const subKey = perMensile ? (r => r.mese) : (r => Math.ceil(r.mese / 3));
            const subLabel = perMensile ? (k => mesiFull[k - 1]) : (k => ['Primo', 'Secondo', 'Terzo', 'Quarto'][k - 1] + ' trimestre');
            const subPresenti = Array.from(new Set(rateTab.map(subKey))).sort((a, b) => a - b);
            if (!subPresenti.includes(fattSub)) fattSub = subPresenti[0];
            subTabs = `<div class="tab-dest tab-sub">${subPresenti.map(k => `<button class="tab-btn ${fattSub === k ? 'attivo' : ''}" data-fattsub="${k}">${subLabel(k)} (${rateTab.filter(r => subKey(r) === k).length})</button>`).join('')}</div>`;
            rateTab = rateTab.filter(r => subKey(r) === fattSub);
        } else {
            fattSub = null;
        }

        // raggruppa per gruppo di fatturazione (vuoto = "Senza gruppo")
        const perGruppo = {};
        rateTab.forEach(r => {
            const key = (r.incarico.gruppoFatturazione && r.incarico.gruppoFatturazione.trim()) || '';
            (perGruppo[key] || (perGruppo[key] = { nome: key, rate: [] })).rate.push(r);
        });
        const gruppi = Object.values(perGruppo).sort((a, b) => (a.nome ? 0 : 1) - (b.nome ? 0 : 1) || a.nome.localeCompare(b.nome));

        const rigaRata = r => {
            const rb = Fatture.rimborso(r.chiave);
            const base = r.importo + perc5(r.importo); // importo + 5% (parte fissa del totale)
            return `<tr>
                <td class="cliente-cella" data-label="Cliente"><span class="link-incarico" data-apri="${esc(r.incarico.id)}">${esc(r.incarico.cliente)}</span></td>
                <td data-label="Rata">${r.numero} di ${r.totale}</td>
                <td data-label="Mese">${mesi[r.mese - 1]}</td>
                <td class="num" data-label="Importo">${eurFmt2.format(r.importo)}</td>
                <td class="num" data-label="5%">${eurFmt2.format(perc5(r.importo))}</td>
                <td data-label="Rimborsi spese"><span class="rimb-campo">
                    <input type="text" inputmode="decimal" class="rimb-input" data-chiave="${esc(r.chiave)}" data-cliente="${esc(r.incarico.cliente)}" data-imp="${rb.importo || 0}" value="${fmtEuroInput(rb.importo)}" ${rb.congelato || !puoMod ? 'disabled' : ''} placeholder="0,00"><span class="rimb-eur">&euro;</span>
                    ${puoMod ? `<button type="button" class="btn btn-sm btn-ghost rimb-lock" data-chiave="${esc(r.chiave)}" data-cliente="${esc(r.incarico.cliente)}" data-cong="${rb.congelato ? '1' : '0'}" title="${rb.congelato ? 'Campo congelato: clicca per sbloccare' : 'Congela il campo'}">${rb.congelato ? ICO_LUCCHETTO + 'Sblocca' : 'Congela'}</button>` : ''}
                </span></td>
                <td class="num fatt-tot-riga" data-base="${base}" data-label="Totale">${eurFmt2.format(base + rb.importo)}</td>
                <td data-label="Stato">${puoMod ? `<select class="stato-rata" data-chiave="${esc(r.chiave)}" data-cliente="${esc(r.incarico.cliente)}" style="padding:4px 8px; border-radius:6px; border:1px solid var(--grigio-200); font-size:0.8rem;">
                    <option value="da emettere" ${r.stato === 'da emettere' ? 'selected' : ''}>da emettere</option>
                    <option value="emessa" ${r.stato === 'emessa' ? 'selected' : ''}>emessa</option>
                    <option value="incassata" ${r.stato === 'incassata' ? 'selected' : ''}>incassata</option>
                </select>` : `<span class="badge ${r.stato === 'incassata' ? 'verde' : (r.stato === 'emessa' ? 'ambra' : 'neutro')}">${esc(r.stato)}</span>`}</td>
            </tr>`;
        };
        const sezGruppo = g => {
            const tImp = g.rate.reduce((s, r) => s + r.importo, 0);
            const t5 = g.rate.reduce((s, r) => s + perc5(r.importo), 0); // somma dei 5% di riga (riconcilia col Totale)
            const tRimb = g.rate.reduce((s, r) => s + Fatture.rimborso(r.chiave).importo, 0);
            const tTot = tImp + t5 + tRimb;
            const nClienti = new Set(g.rate.map(r => r.incarico.id)).size;
            const nEmesse = g.rate.filter(r => r.stato !== 'da emettere').length;
            const aperto = fattAperti ? fattAperti.has(g.nome) : !g.nome;
            return `<details class="fatt-gruppo" data-gruppo="${esc(g.nome)}"${aperto ? ' open' : ''}>
                <summary class="fatt-gruppo-sommario">
                    <span class="fatt-gruppo-nome">${g.nome ? esc(g.nome) : '<em>Senza gruppo</em>'}</span>
                    <span class="fatt-gruppo-meta">${nClienti} client${nClienti === 1 ? 'e' : 'i'} &middot; ${g.rate.length} rate</span>
                    <span class="fatt-gruppo-imp">${eurFmt2.format(tTot)}</span>
                    <span class="badge ${nEmesse === g.rate.length ? 'verde' : 'neutro'}">${nEmesse}/${g.rate.length} emesse</span>
                </summary>
                <div class="fatt-gruppo-corpo">
                    <div class="tabella-wrap"><table class="dati a-schede"><thead><tr>
                        <th>Cliente</th><th>Rata</th><th>Mese</th><th class="num">Importo</th><th class="num" title="5% dell'importo">5%</th><th>Rimborsi spese</th><th class="num" title="Importo + 5% + rimborsi">Totale</th><th>Stato</th>
                    </tr></thead><tbody>${g.rate.map(rigaRata).join('')}</tbody>
                    <tfoot><tr><td colspan="3">Totale gruppo</td><td class="num" data-label="Importi">${eurFmt2.format(tImp)}</td><td class="num" data-label="5%">${eurFmt2.format(t5)}</td><td class="num fatt-tot-rimb" data-label="Rimborsi">${eurFmt2.format(tRimb)}</td><td class="num fatt-tot-tot" data-label="Totale">${eurFmt2.format(tTot)}</td><td></td></tr></tfoot></table></div>
                </div>
            </details>`;
        };
        const tabs = `<div class="tab-dest" style="margin-bottom:16px;">${presenti.map(p => `<button class="tab-btn ${fattTab === p ? 'attivo' : ''}" data-fatttab="${p}">${etichettaPer[p]} (${rateAll.filter(r => perDi(r) === p).length})</button>`).join('')}</div>`;

        corpo.innerHTML = `
            <div class="kpi-griglia">
                <div class="kpi"><div class="etichetta">Da fatturare ${anno}</div><div class="valore">${eurFmt.format(totaleAnno)}</div><div class="nota">${rateAll.length} rate totali</div></div>
                <div class="kpi verde"><div class="etichetta">Rate emesse</div><div class="valore">${emesse.length} / ${rateAll.length}</div><div class="nota">${eurFmt.format(emesse.reduce((s, r) => s + r.importo, 0))}</div></div>
                <div class="kpi ambra"><div class="etichetta">Rate incassate</div><div class="valore">${incassate.length}</div><div class="nota">${eurFmt.format(incassate.reduce((s, r) => s + r.importo, 0))}</div></div>
            </div>
            <div class="card">
                <h2>Distribuzione per mese</h2>
                <div class="grafico-wrap"><canvas id="grafico-mesi" height="200"></canvas></div>
            </div>
            <div class="card">
                <h2>Dettaglio rate ${anno}</h2>
                <p class="hint" style="margin:-6px 0 12px;">Rate divise per periodicita (schede); il mensile e il trimestrale si dividono a loro volta in una finestra per ogni mese/trimestre. In ogni finestra gli incarichi sono raggruppati per gruppo di fatturazione: clicca un gruppo per vedere i singoli clienti; clicca il nome del cliente per aprire l'incarico. Colonna 5% sull'importo, Totale = importo + 5% + rimborsi; i rimborsi spese (in euro) si possono congelare/sbloccare per campo.</p>
                ${tabs}
                ${subTabs}
                ${gruppi.length ? '<div class="fatt-gruppi">' + gruppi.map(sezGruppo).join('') + '</div>' : '<p class="tabella-vuota">Nessuna rata per questa finestra.</p>'}
            </div>`;

        corpo.querySelectorAll('[data-fatttab]').forEach(b => b.addEventListener('click', () => { fattTab = b.dataset.fatttab; fattSub = null; fattAperti = null; disegnaFatturazione(); }));
        corpo.querySelectorAll('[data-fattsub]').forEach(b => b.addEventListener('click', () => { fattSub = Number(b.dataset.fattsub); fattAperti = null; disegnaFatturazione(); }));
        corpo.querySelectorAll('.fatt-gruppo').forEach(d => d.addEventListener('toggle', () => {
            fattAperti = new Set(Array.from(corpo.querySelectorAll('.fatt-gruppo')).filter(x => x.open).map(x => x.dataset.gruppo));
        }));
        corpo.querySelectorAll('.link-incarico[data-apri]').forEach(el => el.addEventListener('click', () => naviga('dettaglio', { id: el.dataset.apri })));
        corpo.querySelectorAll('.stato-rata').forEach(sel =>
            sel.addEventListener('change', () => {
                Fatture.cambiaStato(sel.dataset.chiave, sel.value, Auth.utenteCorrente, sel.dataset.cliente);
                toast('Stato rata aggiornato.', 'verde');
                disegnaFatturazione();
            }));
        corpo.querySelectorAll('.rimb-input').forEach(inp =>
            inp.addEventListener('change', () => {
                const val = parseEuro(inp.value);
                if (Fatture.salvaRimborso(inp.dataset.chiave, val, Auth.utenteCorrente, inp.dataset.cliente)) {
                    toast('Rimborso spese salvato.', 'verde');
                    inp.value = fmtEuroInput(val);
                    inp.dataset.imp = val;
                    // aggiorna i totali (riga e gruppo) SENZA ridisegnare: un redraw stacchererebbe il
                    // pulsante Congela prima del mouseup, "ingoiando" il click se si scrive e si congela di seguito
                    const tr = inp.closest('tr');
                    const cellRiga = tr && tr.querySelector('.fatt-tot-riga');
                    if (cellRiga) cellRiga.textContent = eurFmt2.format((Number(cellRiga.dataset.base) || 0) + val);
                    const gr = inp.closest('.fatt-gruppo');
                    if (gr) {
                        let tRimb = 0, tTot = 0;
                        gr.querySelectorAll('.rimb-input').forEach(x => { tRimb += Number(x.dataset.imp) || 0; });
                        gr.querySelectorAll('.fatt-tot-riga').forEach(c => { tTot += Number(c.dataset.base) || 0; });
                        tTot += tRimb;
                        const cr = gr.querySelector('.fatt-tot-rimb'); if (cr) cr.textContent = eurFmt2.format(tRimb);
                        const ct = gr.querySelector('.fatt-tot-tot'); if (ct) ct.textContent = eurFmt2.format(tTot);
                        const ch = gr.querySelector('.fatt-gruppo-imp'); if (ch) ch.textContent = eurFmt2.format(tTot); // totale in intestazione del gruppo
                    }
                }
            }));
        corpo.querySelectorAll('.rimb-lock').forEach(b =>
            b.addEventListener('click', () => {
                const cong = b.dataset.cong === '1';
                Fatture.congelaRimborso(b.dataset.chiave, !cong, Auth.utenteCorrente, b.dataset.cliente);
                toast(cong ? 'Campo rimborsi sbloccato.' : 'Campo rimborsi congelato.', 'verde');
                disegnaFatturazione();
            }));
        disegnaGraficoBarre('grafico-mesi', mesi, mesi.map((m, i) => perMese[i + 1] || 0));
    }

    function esportaCsvFatturazione() {
        const anno = annoFatturazione;
        const rate = Fatture.tutteAnno(anno);
        const mesi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
        const righe = [['Cliente', 'Gruppo di fatturazione', 'Periodicita', 'Rata', 'Mese', 'Importo', '5%', 'Rimborsi spese', 'Totale', 'Stato']];
        rate.forEach(r => {
            const rb = Fatture.rimborso(r.chiave);
            const cinque = Math.round(r.importo * 5) / 100;
            righe.push([r.incarico.cliente, r.incarico.gruppoFatturazione || '', r.incarico.fatturazione || 'annuale',
                r.numero + ' di ' + r.totale, mesi[r.mese - 1], r.importo, cinque, rb.importo || 0, r.importo + cinque + (rb.importo || 0), r.stato]);
        });
        const csv = righe.map(r => r.map(v => {
            let s = String(v).replace(/"/g, '""');
            if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
            return '"' + s + '"';
        }).join(';')).join('\r\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'fatturazione_' + anno + '_' + oggiISO() + '.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        Audit.registra(Auth.utenteCorrente, 'Esportazione CSV fatturazione', 'sistema', null, null, null);
    }

    /* =========================================================
       VISTA: REPORT COMPENSI
    ========================================================= */
    let filtriReport = { anno: null };
    function vistaReport() {
        const incarichi = Incarichi.visibili();
        const anni = Incarichi.anniConCompensi();
        // anno di riferimento della schermata (selettore): default = anno corrente se presente, altrimenti l'ultimo
        const annoDefault = anni.includes(annoCorrente()) ? annoCorrente() : anni[anni.length - 1];
        const annoRif = (filtriReport.anno && anni.includes(filtriReport.anno)) ? filtriReport.anno : annoDefault;
        const elencoClienti = incarichi
            .map(i => ({ cliente: i.cliente, id: i.id, importo: Incarichi.compensoAnno(i, annoRif) }))
            .filter(x => x.importo > 0)
            .sort((a, b) => b.importo - a.importo);
        const totaleAnno = elencoClienti.reduce((s, x) => s + x.importo, 0);
        // confronto con l'anno prima: si mostra solo se quell'anno esiste e non era a zero
        const totalePrec = incarichi.reduce((s, i) => s + Incarichi.compensoAnno(i, annoRif - 1), 0);
        const variazione = totalePrec > 0 ? (totaleAnno - totalePrec) / totalePrec * 100 : null;

        /* Compenso rispetto alle ore stimate. Le ore arrivano dal calcolo CNDCEC (attivo+ricavi):
           dove non e' compilato non sono stimabili, e l'incarico non puo' entrare nel grafico:
           va detto, non nascosto. */
        const oreTutti = incarichi.map(i => ({
            id: i.id, cliente: i.cliente, tipo: i.tipo,
            ore: oreStimatePerAnno(i, annoRif), compenso: Incarichi.compensoAnno(i, annoRif)
        }));
        const oreDati = oreTutti.filter(x => x.ore > 0 && x.compenso > 0)
            .map(x => Object.assign(x, { eurH: x.compenso / x.ore }));
        const senzaOre = oreTutti.filter(x => x.compenso > 0 && !(x.ore > 0)).length;
        /* Tariffa di riferimento = mediana dello studio. Con pochi incarichi la mediana e' se
           stessa: un incarico verrebbe confrontato con il proprio compenso e risulterebbe sempre
           "in linea". Sotto la soglia si mostrano i punti senza dare giudizi. */
        const MIN_CONFRONTO = 5;
        const ordEurH = oreDati.map(x => x.eurH).sort((a, b) => a - b);
        const confrontabile = ordEurH.length >= MIN_CONFRONTO;
        const tariffaRif = confrontabile
            ? (ordEurH.length % 2 ? ordEurH[(ordEurH.length - 1) / 2]
                : (ordEurH[ordEurH.length / 2 - 1] + ordEurH[ordEurH.length / 2]) / 2)
            : 0;
        const peggiori = oreDati.slice().sort((a, b) => a.eurH - b.eurH);
        // meta' degli incarichi sta sotto la mediana per definizione: non e' una notizia.
        // Il segnale vero e' chi sta molto sotto, quindi si contano quelli sotto il 70%.
        const moltoSotto = confrontabile ? oreDati.filter(x => x.eurH < tariffaRif * 0.7).length : 0;

        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Report compensi</h1>
                    <p class="descrizione">Compensi per cliente e rapporto tra compenso e ore stimate. Scegli l'anno di riferimento.</p>
                </div>
                <div class="header-azioni">
                    <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--grigio-600);white-space:nowrap;">Anno di riferimento
                        <select id="f-anno-report" style="width:auto;">${anni.map(a => '<option value="' + a + '"' + (a === annoRif ? ' selected' : '') + '>' + a + '</option>').join('')}</select>
                    </label>
                    <button class="btn btn-secondary" id="btn-stampa-report">Stampa report</button>
                </div>
            </header>
            <div class="intest-stampa">
                <div class="is-marchio">Revilaw S.p.A.</div>
                <div class="is-tit">Report compensi ${annoRif}</div>
                <div class="is-meta">${elencoClienti.length} clienti con compenso &middot; totale ${eurFmt.format(totaleAnno)} &middot; stampato il ${fmtData(oggiISO())}</div>
            </div>
            <div class="kpi-griglia">
                <div class="kpi">
                    <div class="etichetta">Totale compensi ${annoRif}</div>
                    <div class="valore">${eurFmt.format(totaleAnno)}</div>
                    <div class="nota">${elencoClienti.length} ${elencoClienti.length === 1 ? 'cliente' : 'clienti'} con compenso</div>
                </div>
                <div class="kpi">
                    <div class="etichetta">Media per cliente</div>
                    <div class="valore">${elencoClienti.length ? eurFmt.format(totaleAnno / elencoClienti.length) : '-'}</div>
                    <div class="nota">${elencoClienti.length ? 'il piu alto e ' + eurFmt.format(elencoClienti[0].importo) : ''}</div>
                </div>
                ${variazione == null ? '' : `<div class="kpi ${variazione >= 0 ? 'verde' : 'rosso'}">
                    <div class="etichetta">Rispetto al ${annoRif - 1}</div>
                    <div class="valore">${variazione >= 0 ? '+' : ''}${variazione.toFixed(1)}%</div>
                    <div class="nota">${eurFmt.format(totalePrec)} nel ${annoRif - 1}</div>
                </div>`}
            </div>
            <div class="card">
                <h2>Primi clienti per compenso ${annoRif}</h2>
                <p class="hint" style="margin:-6px 0 10px;">Passa sopra una barra per il dettaglio; clicca per aprire l'incarico.</p>
                <div id="grafico-clienti"></div>
            </div>
            <div class="card">
                <h2>Compenso rispetto alle ore stimate ${annoRif}</h2>
                <p class="hint" style="margin:-6px 0 10px;">Ogni punto e un incarico: a destra chi costa piu ore, in alto chi rende di piu. Chi sta <strong>sotto la retta</strong> e pagato poco per le ore che assorbe. Passa sopra un punto per il dettaglio; clicca per aprire l'incarico.</p>
                ${oreDati.length ? `<div class="ore-sintesi">
                    <div class="ore-box"><span class="ore-n">${oreDati.length}</span><span class="ore-et">incarichi con ore stimate</span></div>
                    ${confrontabile ? `<div class="ore-box"><span class="ore-n">${eurFmt.format(Math.round(tariffaRif))}</span><span class="ore-et">tariffa mediana per ora</span></div>
                    <div class="ore-box ${moltoSotto ? 'ore-box-att' : ''}"><span class="ore-n">${moltoSotto}</span><span class="ore-et">sotto il 70% della mediana</span></div>` : ''}
                </div>` : ''}
                ${oreDati.length && !confrontabile ? `<div class="ore-avviso">
                    Solo ${oreDati.length} ${oreDati.length === 1 ? 'incarico ha' : 'incarichi hanno'} le ore stimate: troppo pochi per dire cosa e alto e cosa e basso.
                    I punti sono mostrati senza giudizio; servono almeno ${MIN_CONFRONTO} incarichi perche il confronto con la mediana abbia senso.
                </div>` : ''}
                <div id="grafico-ore-compenso"></div>
                ${senzaOre ? `<div class="ore-avviso">
                    <strong>${senzaOre} incarichi con compenso nel ${annoRif} non hanno le ore stimate</strong> e restano fuori dal grafico.
                    Le ore si ricavano dal metodo CNDCEC a partire da <strong>totale attivo</strong> e <strong>ricavi</strong>: compilali nel calcolo del compenso dentro l'incarico${Auth.eProprietario() ? `,
                    oppure caricali per tutti in una volta da <em>Dati e backup &rarr; Importa incarichi &rarr; Aggiorna la stima delle ore dai bilanci</em>` : ''}.
                </div>` : ''}
                ${peggiori.length ? `<h3 style="margin:16px 0 6px;font-size:0.95rem;">Compenso piu basso per ora</h3>
                <div class="tabella-wrap"><table class="dati"><thead><tr>
                    <th>Cliente</th><th class="num">Ore stimate</th><th class="num">Compenso ${annoRif}</th><th class="num">Per ora</th>${confrontabile ? '<th class="num">Rispetto alla mediana</th>' : ''}
                </tr></thead><tbody>` +
                peggiori.map(p => {
                    const scarto = confrontabile ? (p.eurH - tariffaRif) / tariffaRif * 100 : 0;
                    return `<tr class="cliccabile" data-apri="${esc(p.id)}">
                        <td class="cliente-cella">${esc(p.cliente)}</td>
                        <td class="num">${numFmt.format(p.ore)} h</td>
                        <td class="num">${eurFmt.format(p.compenso)}</td>
                        <td class="num"><strong>${eurFmt.format(Math.round(p.eurH))}</strong></td>
                        ${confrontabile ? `<td class="num"><span class="badge ${scarto < -30 ? 'rosso' : (scarto < 0 ? 'ambra' : 'verde')}">${scarto >= 0 ? '+' : ''}${scarto.toFixed(0)}%</span></td>` : ''}
                    </tr>`;
                }).join('') + `</tbody></table></div>` : ''}
            </div>
            <div class="card">
                <h2>Compensi per cliente ${annoRif}</h2>
                <p class="hint" style="margin:-6px 0 12px;">${elencoClienti.length} clienti con compenso nel ${annoRif} · totale ${eurFmt.format(totaleAnno)}</p>
                <div class="tabella-wrap"><table class="dati"><thead><tr><th>Cliente</th><th class="num">Compenso ${annoRif}</th></tr></thead><tbody>` +
            elencoClienti.map(t => `<tr class="cliccabile" data-apri="${t.id}"><td class="cliente-cella">${esc(t.cliente)}</td><td class="num">${eurFmt.format(t.importo)}</td></tr>`).join('') +
            `</tbody></table></div>
            </div>`;

        const selAnno = document.getElementById('f-anno-report');
        if (selAnno) selAnno.addEventListener('change', () => { filtriReport.anno = Number(selAnno.value); vistaReport(); });
        document.getElementById('btn-stampa-report').addEventListener('click', () => window.print());
        $vista().querySelectorAll('[data-apri]').forEach(r =>
            r.addEventListener('click', () => naviga('dettaglio', { id: r.dataset.apri })));
        // ogni tabella del report ha ricerca testuale + export CSV
        $vista().querySelectorAll('.card table.dati').forEach(tab => {
            const h2 = tab.closest('.card') && tab.closest('.card').querySelector('h2');
            const nome = h2 ? h2.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) : 'report';
            attrezzaTabella(tab, { filtri: false, ricerca: true, nomeFile: 'report-' + nome });
        });
        disegnaGraficoClientiSvg('grafico-clienti', elencoClienti, annoRif);
        disegnaGraficoOreCompensoSvg('grafico-ore-compenso', oreDati, tariffaRif, annoRif);
    }

    /* =========================================================
       VISTA: PERSONE (anagrafica del team)
    ========================================================= */
    /* Incarichi in cui una persona compare, con il ruolo che vi ricopre.
       Il collegamento e' per cognome (negli incarichi i nomi sono testo), come nel resto
       dell'area: due omonimi risultano sugli stessi incarichi. Di default guarda solo
       gli incarichi visibili all'utente collegato (filtro regione del ruolo). */
    function incarichiDellaPersona(cognome, lista) {
        const cg = String(cognome || '').trim().toLowerCase();
        if (!cg) return [];
        const ha = campo => campo && dividiNomi(String(campo)).some(t => t.trim().toLowerCase() === cg);
        const out = [];
        (lista || Incarichi.visibili()).forEach(inc => {
            const ruoli = [];
            if (ha(inc.qualita)) ruoli.push('Resp. qualita');
            if (ha(inc.respIncarico)) ruoli.push('Resp. incarico');
            if (ha(inc.referente)) ruoli.push('Referente');
            if (ha(inc.coordinatore)) ruoli.push('Coordinatore');
            if (ha(inc.team)) ruoli.push('Team');
            if (ruoli.length) out.push({ inc: inc, ruoli: ruoli });
        });
        // prima gli attivi, poi i terminati; dentro ogni gruppo per cliente
        out.sort((a, b) => {
            const chiusi = s => (s === 'cessato' || s === 'dimesso') ? 1 : 0;
            const ca = chiusi(a.inc.stato), cb = chiusi(b.inc.stato);
            return ca - cb || String(a.inc.cliente || '').localeCompare(String(b.inc.cliente || ''), 'it');
        });
        return out;
    }

    function modaleIncarichiPersona(persona) {
        const voci = incarichiDellaPersona(persona.nome);
        const nomeVis = (persona.nomeProprio ? persona.nomeProprio + ' ' : '') + persona.nome;
        // per un ruolo limitato a certe regioni: dice QUANTI incarichi restano fuori, senza nominarli
        const fuori = Auth.regioniConsentite() ? incarichiDellaPersona(persona.nome, Incarichi.tutti()).length - voci.length : 0;
        const righe = voci.map(v => {
            const i = v.inc;
            const stato = i.stato === 'cessato'
                ? '<span class="badge neutro">terminato</span>'
                : (() => { const s = Incarichi.statoScadenza(i); return '<span class="badge ' + s.classe + '">' + esc(s.testo) + '</span>'; })();
            return `<tr class="cliccabile" data-apri="${esc(i.id)}">
                <td>${esc(i.cliente || '')}</td>
                <td>${badgeTipo(i.tipo)}</td>
                <td>${esc(i.regione || '')}</td>
                <td>${v.ruoli.map(r => '<span class="badge neutro">' + esc(r) + '</span>').join(' ')}</td>
                <td>${esc(fmtData(i.rinnovo || i.dataFine))}</td>
                <td>${stato}</td>
            </tr>`;
        }).join('');
        apriModale(`<h2>Incarichi di ${esc(nomeVis)}</h2>
            ${voci.length ? `<p class="hint" style="margin:-4px 0 10px;">${voci.length} ${voci.length === 1 ? 'incarico' : 'incarichi'} &middot; clicca una riga per aprire l'incarico.</p>
            <div class="tabella-wrap"><table class="dati"><thead><tr>
                <th>Cliente</th><th>Tipo</th><th>Regione</th><th>Ruolo</th><th>Fine</th><th>Stato</th>
            </tr></thead><tbody>${righe}</tbody></table></div>`
            : '<p class="descrizione">Nessun incarico associato a questa persona.</p>'}
            ${fuori > 0 ? `<p class="hint" style="margin-top:10px;">${fuori === 1 ? 'Un altro incarico e' : 'Altri ' + fuori + ' incarichi sono'} fuori dalle regioni del tuo ruolo e non ${fuori === 1 ? 'viene mostrato' : 'vengono mostrati'}.</p>` : ''}
            <div class="modale-azioni"><button class="btn btn-primary" id="m-ok">Chiudi</button></div>`, { classe: 'larga' });
        document.getElementById('m-ok').addEventListener('click', chiudiModale);
        document.querySelectorAll('#modale-contenitore [data-apri]').forEach(r =>
            r.addEventListener('click', () => { chiudiModale(); naviga('dettaglio', { id: r.dataset.apri }); }));
    }

    let personeTab = 'attive'; // 'attive' | 'disattivate' | 'eliminate'

    function vistaPersone() {
        const puoScr = Auth.puoScrivere('persone');
        // si/no compatti: testo leggibile (utile per filtri di colonna ed esportazione CSV) ma senza il riquadro del badge, cosi la tabella entra in orizzontale
        const spunta = v => v ? '<span class="mark-si">si</span>' : '<span class="mark-no">no</span>';
        const tutte = Persone.tutte().slice().sort((a, b) => a.nome.localeCompare(b.nome));
        const attive = tutte.filter(p => p.attivo && !p.eliminato);
        const disattivate = tutte.filter(p => !p.attivo && !p.eliminato);
        const eliminate = tutte.filter(p => p.eliminato);
        const lista = personeTab === 'disattivate' ? disattivate : personeTab === 'eliminate' ? eliminate : attive;

        const azioni = p => {
            if (!puoScr) return '';
            if (p.eliminato) return `<td data-label="" style="white-space:nowrap;"><button class="btn btn-sm btn-secondary p-ripristina" data-id="${esc(p.id)}">Ripristina</button></td>`;
            return `<td data-label="" style="white-space:nowrap;">
                <button class="btn btn-sm btn-secondary p-modifica" data-id="${esc(p.id)}">Modifica</button>
                <button class="btn btn-sm btn-secondary p-attiva" data-id="${esc(p.id)}">${p.attivo ? 'Disattiva' : 'Riattiva'}</button>
                <button class="btn btn-sm btn-danger p-elimina" data-id="${esc(p.id)}">Elimina</button>
            </td>`;
        };
        const badgeStato = p => p.eliminato
            ? '<span class="badge neutro">eliminata' + (p.eliminato.il ? ' il ' + fmtGiorno(p.eliminato.il) : '') + '</span>'
            : (p.attivo ? '<span class="badge verde">attiva</span>' : '<span class="badge ambra">disattivata</span>');

        const corpo = lista.length ? `<div class="tabella-wrap"><table class="dati a-schede compatta"><thead><tr>
                <th>Cognome</th><th>Nome</th><th>Email</th><th>Regione</th><th class="col-mark" title="Responsabile qualita">Qualita</th><th class="col-mark" title="Responsabile incarico">Resp.</th><th class="col-mark" title="Team di revisione">Team</th><th class="col-mark" title="Coordinatore territoriale">Coord.</th><th class="col-mark" title="Vice coordinatore territoriale">Vice</th><th class="col-mark" title="Equity partner">Equity</th><th class="col-mark" title="Founding partner">Founding</th><th class="num" title="Incarichi associati, con qualunque ruolo: clicca il numero per vedere quali">Inc.</th><th>Stato</th>${puoScr ? '<th></th>' : ''}
            </tr></thead><tbody>` +
            lista.map(p => {
                const nInc = incarichiDellaPersona(p.nome).length;
                return `<tr>
                <td class="cliente-cella" data-label="Cognome">${esc(p.nome)}</td>
                <td data-label="Nome">${p.nomeProprio ? esc(p.nomeProprio) : '<span style="color:var(--grigio-400)">—</span>'}</td>
                <td class="col-email" data-label="Email">${p.email ? '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>' : '<span style="color:var(--grigio-400)">—</span>'}</td>
                <td data-label="Regione">${esc(p.regione || '')}</td>
                <td class="col-mark" data-label="Qualita">${spunta(p.qualita)}</td>
                <td class="col-mark" data-label="Resp. incarico">${spunta(p.respIncarico)}</td>
                <td class="col-mark" data-label="Team">${spunta(p.team)}</td>
                <td class="col-mark" data-label="Coordinatore territoriale">${spunta(p.coordinatore)}</td>
                <td class="col-mark" data-label="Vice coordinatore">${spunta(p.viceCoordinatore)}</td>
                <td class="col-mark" data-label="Equity partner">${spunta(p.equityPartner)}</td>
                <td class="col-mark" data-label="Founding partner">${spunta(p.foundingPartner)}</td>
                <td class="num" data-label="Incarichi">${nInc ? `<button class="btn btn-sm btn-ghost p-inc" data-id="${esc(p.id)}" title="Vedi gli incarichi di ${esc(p.nome)}">${nInc}</button>` : ''}</td>
                <td data-label="Stato">${badgeStato(p)}</td>
                ${azioni(p)}
            </tr>`; }).join('') +
            `</tbody></table></div>`
            : `<div class="card tabella-vuota">${personeTab === 'disattivate' ? 'Nessuna persona disattivata.' : personeTab === 'eliminate' ? 'Nessuna persona eliminata.' : 'Nessuna persona attiva.'}</div>`;

        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Persone</h1>
                    <p class="descrizione">Anagrafica completa: nominativi, contatti (email, telefono, regione) e ruoli. Chi puo essere responsabile della qualita, responsabile dell'incarico o componente del team. Le tendine del wizard leggono da questo elenco.</p>
                </div>
                <div class="header-azioni">
                    ${puoScr ? '<button class="btn btn-primary" id="btn-nuova-persona">+ Aggiungi persona</button>' : ''}
                </div>
            </header>
            <div class="tab-dest" style="margin-bottom:16px;">
                <button class="tab-btn ${personeTab === 'attive' ? 'attivo' : ''}" data-ptab="attive">Attive (${attive.length})</button>
                <button class="tab-btn ${personeTab === 'disattivate' ? 'attivo' : ''}" data-ptab="disattivate">Disattivate (${disattivate.length})</button>
                <button class="tab-btn ${personeTab === 'eliminate' ? 'attivo' : ''}" data-ptab="eliminate">Eliminate (${eliminate.length})</button>
            </div>
            ${corpo}
            <p class="descrizione" style="margin-top:10px;">Le persone disattivate o eliminate non compaiono piu nelle tendine ne nelle sezioni Coordinatori e Responsabili, ma restano negli incarichi gia registrati. L'eliminazione e reversibile: le persone eliminate si ripristinano dalla scheda "Eliminate".</p>`;

        const tab = $vista().querySelector('table.dati');
        if (tab) attrezzaTabella(tab, { nomeFile: 'persone-' + personeTab });
        $vista().querySelectorAll('[data-ptab]').forEach(b =>
            b.addEventListener('click', () => { personeTab = b.dataset.ptab; vistaPersone(); }));
        const btnNuova = document.getElementById('btn-nuova-persona');
        if (btnNuova) btnNuova.addEventListener('click', () => modalePersona(null));
        $vista().querySelectorAll('.p-inc').forEach(b =>
            b.addEventListener('click', () => {
                const p = Persone.tutte().find(x => x.id === b.dataset.id);
                if (p) modaleIncarichiPersona(p);
            }));
        $vista().querySelectorAll('.p-modifica').forEach(b =>
            b.addEventListener('click', () => modalePersona(b.dataset.id)));
        $vista().querySelectorAll('.p-attiva').forEach(b =>
            b.addEventListener('click', () => {
                const l = Persone.tutte();
                const p = l.find(x => x.id === b.dataset.id);
                if (!p) return;
                p.attivo = !p.attivo;
                Persone.salva(l);
                Audit.registra(Auth.utenteCorrente, p.attivo ? 'Persona riattivata' : 'Persona disattivata', 'persona', p.id, p.nome, null);
                toast((p.attivo ? 'Riattivata: ' : 'Disattivata: ') + p.nome, 'verde');
                vistaPersone();
            }));
        $vista().querySelectorAll('.p-elimina').forEach(b =>
            b.addEventListener('click', () => {
                const p = Persone.tutte().find(x => x.id === b.dataset.id);
                if (!p) return;
                apriModale(`<h2>Eliminare la persona?</h2>
                    <p><strong>${esc((p.nomeProprio ? p.nomeProprio + ' ' : '') + p.nome)}</strong> verra spostata nella scheda <strong>Eliminate</strong>: non comparira piu nelle tendine ne nelle sezioni Coordinatori e Responsabili. Resta negli incarichi gia registrati e si puo ripristinare in qualsiasi momento. L'operazione e nel registro.</p>
                    <div class="modale-azioni"><button class="btn btn-ghost" id="m-annulla">Annulla</button><button class="btn btn-danger" id="m-conferma">Elimina</button></div>`);
                document.getElementById('m-annulla').addEventListener('click', chiudiModale);
                document.getElementById('m-conferma').addEventListener('click', () => {
                    const l = Persone.tutte();
                    const x = l.find(y => y.id === p.id); if (!x) return;
                    x.eliminato = { da: Auth.utenteCorrente.nome + ' <' + Auth.utenteCorrente.email + '>', il: Date.now() };
                    Persone.salva(l);
                    Audit.registra(Auth.utenteCorrente, 'Persona eliminata', 'persona', x.id, x.nome, null);
                    chiudiModale(); toast('Persona eliminata: e nella scheda "Eliminate".', 'verde'); vistaPersone();
                });
            }));
        $vista().querySelectorAll('.p-ripristina').forEach(b =>
            b.addEventListener('click', () => {
                const l = Persone.tutte();
                const p = l.find(x => x.id === b.dataset.id);
                if (!p) return;
                p.eliminato = null;
                Persone.salva(l);
                Audit.registra(Auth.utenteCorrente, 'Persona ripristinata', 'persona', p.id, p.nome, null);
                toast('Persona ripristinata: ' + p.nome + (p.attivo ? '' : ' (resta disattivata).'), 'verde');
                vistaPersone();
            }));
    }

    /* =========================================================
       VISTA: COORDINATORI E VICE (dall'anagrafica), in 3 schede:
       Coordinatori, Vice coordinatori, Per regione. Permessi come Persone.
    ========================================================= */
    let coordTab = 'coordinatori'; // 'coordinatori' | 'vice' | 'regione'

    // le regioni coperte da una persona (Regione della scheda + altre regioni coordinate), dedup
    function regioniCoperte(p) {
        const viste = new Set(), out = [];
        [p.regione].concat(Array.isArray(p.regioniCoordinate) ? p.regioniCoordinate : []).filter(Boolean).forEach(r => {
            const k = chiaveRegione(r);
            if (k && !viste.has(k)) { viste.add(k); out.push(String(r).trim()); }
        });
        return out;
    }

    function vistaCoordinatori() {
        const puoScr = Auth.puoScrivere('persone');
        const attivi = Incarichi.visibili().filter(i => i.stato !== 'cessato' && i.stato !== 'dimesso');
        const coordinatori = Persone.tutte().filter(p => p.coordinatore && !p.eliminato).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
        const vice = Persone.tutte().filter(p => p.viceCoordinatore && !p.eliminato).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));

        // tabella persone (usata per Coordinatori e per Vice)
        const tabellaPersone = (lista, ruolo) => {
            if (!lista.length) return `<div class="card tabella-vuota">Nessun ${ruolo === 'vice' ? 'vice coordinatore' : 'coordinatore'} in anagrafica: spunta la relativa casella nella scheda della persona (sezione Persone).</div>`;
            const righe = lista.map(p => {
                const regioni = regioniCoperte(p);
                const chiavi = new Set(regioni.map(chiaveRegione));
                const suoi = attivi.filter(i => chiavi.has(chiaveRegione(i.regione || '')));
                return `<tr>
                    <td class="cliente-cella" data-label="Cognome">${esc(p.nome)}</td>
                    <td data-label="Nome">${p.nomeProprio ? esc(p.nomeProprio) : ''}</td>
                    <td data-label="Regioni">${regioni.length ? esc(regioni.join(', ')) : '<span class="badge rosso">nessuna regione</span>'}</td>
                    <td class="col-email" data-label="Email">${p.email ? '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>' : ''}</td>
                    <td class="num" data-label="Incarichi">${suoi.length || ''}</td>
                    <td data-label="Stato">${p.attivo ? '<span class="badge verde">attiva</span>' : '<span class="badge rosso">disattivata</span>'}</td>
                    ${puoScr ? `<td data-label=""><button class="btn btn-sm btn-secondary co-modifica" data-id="${esc(p.id)}">Modifica scheda</button></td>` : ''}
                </tr>`;
            }).join('');
            return `<div class="tabella-wrap"><table class="dati a-schede"><thead><tr>
                <th>Cognome</th><th>Nome</th><th>Regioni</th><th>Email</th><th class="num" title="Incarichi attivi nelle regioni coperte">Incarichi</th><th>Stato</th>${puoScr ? '<th></th>' : ''}
            </tr></thead><tbody>${righe}</tbody></table></div>`;
        };

        // tabella per regione: per ogni regione, chi la coordina (coord + vice) e gli incarichi attivi
        const tabellaRegioni = () => {
            const nomiPerChiave = {};   // chiave normalizzata -> grafia da mostrare
            RV_ROSTER.regioni.forEach(r => { nomiPerChiave[chiaveRegione(r)] = r; });
            const dati = {};
            const assicura = r => {
                const k = chiaveRegione(r); if (!k) return null;
                if (!nomiPerChiave[k]) nomiPerChiave[k] = String(r).trim();
                return dati[k] || (dati[k] = { coord: [], vice: [], n: 0 });
            };
            coordinatori.forEach(p => regioniCoperte(p).forEach(r => { const d = assicura(r); if (d) d.coord.push(p.nomeProprio ? p.nomeProprio + ' ' + p.nome : p.nome); }));
            vice.forEach(p => regioniCoperte(p).forEach(r => { const d = assicura(r); if (d) d.vice.push(p.nomeProprio ? p.nomeProprio + ' ' + p.nome : p.nome); }));
            attivi.forEach(i => { const d = assicura(i.regione); if (d) d.n++; });
            // mostra le regioni con qualcosa (persone o incarichi), in ordine alfabetico
            const chiavi = Object.keys(dati).filter(k => dati[k].coord.length || dati[k].vice.length || dati[k].n)
                .sort((a, b) => nomiPerChiave[a].localeCompare(nomiPerChiave[b], 'it'));
            if (!chiavi.length) return '<div class="card tabella-vuota">Nessuna regione con coordinatori o incarichi attivi.</div>';
            const righe = chiavi.map(k => {
                const d = dati[k];
                const scoperta = d.n > 0 && !d.coord.length && !d.vice.length;
                return `<tr>
                    <td class="cliente-cella" data-label="Regione">${esc(nomiPerChiave[k])}${scoperta ? ' <span class="badge rosso">scoperta</span>' : ''}</td>
                    <td data-label="Coordinatori">${d.coord.length ? esc(d.coord.join(', ')) : '<span style="color:var(--grigio-400)">—</span>'}</td>
                    <td data-label="Vice">${d.vice.length ? esc(d.vice.join(', ')) : '<span style="color:var(--grigio-400)">—</span>'}</td>
                    <td class="num" data-label="Incarichi attivi">${d.n || ''}</td>
                </tr>`;
            }).join('');
            return `<div class="tabella-wrap"><table class="dati a-schede"><thead><tr>
                <th>Regione</th><th>Coordinatori</th><th>Vice</th><th class="num">Incarichi attivi</th>
            </tr></thead><tbody>${righe}</tbody></table></div>`;
        };

        const tabBar = `<div class="tab-dest" style="margin-bottom:16px;">
            <button class="tab-btn ${coordTab === 'coordinatori' ? 'attivo' : ''}" data-coordtab="coordinatori">Coordinatori (${coordinatori.length})</button>
            <button class="tab-btn ${coordTab === 'vice' ? 'attivo' : ''}" data-coordtab="vice">Vice coordinatori (${vice.length})</button>
            <button class="tab-btn ${coordTab === 'regione' ? 'attivo' : ''}" data-coordtab="regione">Per regione</button>
        </div>`;
        const corpo = coordTab === 'vice' ? tabellaPersone(vice, 'vice')
            : coordTab === 'regione' ? tabellaRegioni()
                : tabellaPersone(coordinatori, 'coordinatore');

        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Coordinatori e vice</h1>
                    <p class="descrizione">Coordinatori territoriali e vice dall'anagrafica, con le regioni coperte e gli incarichi attivi di quelle regioni. Le regioni si impostano nella scheda della persona (sezione Persone).</p>
                </div>
            </header>
            ${tabBar}${corpo}
            <p class="descrizione" style="margin-top:10px;">Gli incarichi contati sono quelli attivi con la regione tra quelle coperte. Una regione coperta da piu persone conta gli stessi incarichi per ciascuna.</p>`;

        $vista().querySelectorAll('[data-coordtab]').forEach(b =>
            b.addEventListener('click', () => { coordTab = b.dataset.coordtab; vistaCoordinatori(); }));
        const tab = $vista().querySelector('table.dati');
        if (tab) attrezzaTabella(tab, { nomeFile: 'coordinatori-' + coordTab, ricerca: true });
        $vista().querySelectorAll('.co-modifica').forEach(b =>
            b.addEventListener('click', () => modalePersona(b.dataset.id)));
    }

    /* =========================================================
       VISTA: RESPONSABILI (qualita e incarico), con gli incarichi associati.
       Un incarico "associa" una persona quando il campo qualita/respIncarico
       dell'incarico coincide col suo cognome. Permessi come Persone.
    ========================================================= */
    let respTab = 'qualita'; // 'qualita' | 'incarico'

    // incarichi (visibili) in cui la persona e' responsabile del ruolo indicato (campo).
    // Attivi prima, poi terminati/dimessi; il confronto e' per cognome, minuscole.
    function incarichiConResponsabile(cognome, campo, lista) {
        const cg = String(cognome || '').trim().toLowerCase();
        if (!cg) return [];
        const out = (lista || Incarichi.visibili()).filter(i => String(i[campo] || '').trim().toLowerCase() === cg);
        out.sort((a, b) => {
            const chiuso = s => (s === 'cessato' || s === 'dimesso') ? 1 : 0;
            return chiuso(a.stato) - chiuso(b.stato) || String(a.cliente || '').localeCompare(String(b.cliente || ''), 'it');
        });
        return out;
    }

    function modaleIncarichiResponsabile(persona, campo, etichetta) {
        const voci = incarichiConResponsabile(persona.nome, campo);
        const nomeVis = (persona.nomeProprio ? persona.nomeProprio + ' ' : '') + persona.nome;
        const fuori = Auth.regioniConsentite() ? incarichiConResponsabile(persona.nome, campo, Incarichi.tutti()).length - voci.length : 0;
        const righe = voci.map(i => {
            const s = Incarichi.statoScadenza(i);
            return `<tr class="cliccabile" data-apri="${esc(i.id)}">
                <td>${esc(i.cliente || '')}</td>
                <td>${badgeTipo(i.tipo)}</td>
                <td>${esc(i.regione || '')}</td>
                <td>${esc(fmtData(i.rinnovo || i.dataFine))}</td>
                <td><span class="badge ${s.classe}">${esc(s.testo)}</span></td>
            </tr>`;
        }).join('');
        apriModale(`<h2>${esc(etichetta)}: ${esc(nomeVis)}</h2>
            ${voci.length ? `<p class="hint" style="margin:-4px 0 10px;">${voci.length} ${voci.length === 1 ? 'incarico' : 'incarichi'} &middot; clicca una riga per aprire l'incarico.</p>
            <div class="tabella-wrap"><table class="dati"><thead><tr>
                <th>Cliente</th><th>Tipo</th><th>Regione</th><th>Fine</th><th>Stato</th>
            </tr></thead><tbody>${righe}</tbody></table></div>`
            : '<p class="descrizione">Nessun incarico associato con questo ruolo.</p>'}
            ${fuori > 0 ? `<p class="hint" style="margin-top:10px;">${fuori === 1 ? 'Un altro incarico e' : 'Altri ' + fuori + ' incarichi sono'} fuori dalle regioni del tuo ruolo e non ${fuori === 1 ? 'viene mostrato' : 'vengono mostrati'}.</p>` : ''}
            <div class="modale-azioni"><button class="btn btn-primary" id="m-ok">Chiudi</button></div>`, { classe: 'larga' });
        document.getElementById('m-ok').addEventListener('click', chiudiModale);
        document.querySelectorAll('#modale-contenitore [data-apri]').forEach(r =>
            r.addEventListener('click', () => { chiudiModale(); naviga('dettaglio', { id: r.dataset.apri }); }));
    }

    function vistaResponsabili() {
        const puoScr = Auth.puoScrivere('persone');
        const campo = respTab === 'incarico' ? 'respIncarico' : 'qualita';
        const etichetta = respTab === 'incarico' ? 'Responsabile incarico' : 'Responsabile qualita';
        const lista = Persone.tutte().filter(p => !p.eliminato && (respTab === 'incarico' ? p.respIncarico : p.qualita))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
        const qualitaN = Persone.tutte().filter(p => p.qualita && !p.eliminato).length;
        const incaricoN = Persone.tutte().filter(p => p.respIncarico && !p.eliminato).length;

        const corpo = lista.length ? `<div class="tabella-wrap"><table class="dati a-schede"><thead><tr>
            <th>Cognome</th><th>Nome</th><th>Email</th><th class="num" title="Incarichi in cui e ${esc(etichetta.toLowerCase())}">Incarichi</th><th>Stato</th>${puoScr ? '<th></th>' : ''}
        </tr></thead><tbody>` +
            lista.map(p => {
                const n = incarichiConResponsabile(p.nome, campo).length;
                return `<tr>
                    <td class="cliente-cella" data-label="Cognome">${esc(p.nome)}</td>
                    <td data-label="Nome">${p.nomeProprio ? esc(p.nomeProprio) : ''}</td>
                    <td class="col-email" data-label="Email">${p.email ? '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>' : ''}</td>
                    <td class="num" data-label="Incarichi">${n ? `<button class="btn btn-sm btn-ghost re-inc" data-id="${esc(p.id)}">${n}</button>` : ''}</td>
                    <td data-label="Stato">${p.attivo ? '<span class="badge verde">attiva</span>' : '<span class="badge rosso">disattivata</span>'}</td>
                    ${puoScr ? `<td data-label=""><button class="btn btn-sm btn-secondary re-modifica" data-id="${esc(p.id)}">Modifica scheda</button></td>` : ''}
                </tr>`;
            }).join('') +
            `</tbody></table></div>`
            : `<div class="card tabella-vuota">Nessun ${respTab === 'incarico' ? 'responsabile incarico' : 'responsabile qualita'} in anagrafica: spunta la relativa casella nella scheda della persona (sezione Persone).</div>`;

        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Responsabili</h1>
                    <p class="descrizione">Responsabili della qualita e responsabili dell'incarico dall'anagrafica, con gli incarichi in cui ricoprono quel ruolo. Clicca il numero per vedere quali. I ruoli si assegnano nella scheda della persona (sezione Persone).</p>
                </div>
            </header>
            <div class="tab-dest" style="margin-bottom:16px;">
                <button class="tab-btn ${respTab === 'qualita' ? 'attivo' : ''}" data-resptab="qualita">Responsabili qualita (${qualitaN})</button>
                <button class="tab-btn ${respTab === 'incarico' ? 'attivo' : ''}" data-resptab="incarico">Responsabili incarico (${incaricoN})</button>
            </div>
            ${corpo}`;

        $vista().querySelectorAll('[data-resptab]').forEach(b =>
            b.addEventListener('click', () => { respTab = b.dataset.resptab; vistaResponsabili(); }));
        const tab = $vista().querySelector('table.dati');
        if (tab) attrezzaTabella(tab, { nomeFile: 'responsabili-' + respTab, ricerca: true });
        $vista().querySelectorAll('.re-inc').forEach(b =>
            b.addEventListener('click', () => {
                const p = Persone.tutte().find(x => x.id === b.dataset.id);
                if (p) modaleIncarichiResponsabile(p, campo, etichetta);
            }));
        $vista().querySelectorAll('.re-modifica').forEach(b =>
            b.addEventListener('click', () => modalePersona(b.dataset.id)));
    }

    function modalePersona(id) {
        const lista = Persone.tutte();
        const p = id ? lista.find(x => x.id === id) : null;
        // altre regioni coordinate: si mostrano se la persona e' coordinatore o vice.
        // L'elenco e' lo STESSO degli incarichi (tutte le regioni italiane), piu' le regioni
        // gia' salvate sulla scheda che eventualmente non vi compaiono: altrimenti un
        // risalvataggio le perderebbe in silenzio.
        const salvate = (p && Array.isArray(p.regioniCoordinate) ? p.regioniCoordinate : []).filter(Boolean);
        const regioniExtra = salvate.map(x => String(x).toLowerCase());
        const tutteLeRegioni = (typeof RV_ROSTER !== 'undefined' && RV_ROSTER.regioni ? RV_ROSTER.regioni : []).slice();
        salvate.forEach(rg => { if (!tutteLeRegioni.some(x => String(x).toLowerCase() === String(rg).toLowerCase())) tutteLeRegioni.push(rg); });
        const chipsRegioni = tutteLeRegioni.map(rg =>
            `<label class="chip-check"><input type="checkbox" class="m-p-regcoord" value="${esc(rg)}" ${regioniExtra.includes(String(rg).toLowerCase()) ? 'checked' : ''} style="width:auto;"> ${esc(rg)}</label>`).join('');
        apriModale(`<h2>${p ? 'Modifica persona' : 'Aggiungi persona'}</h2>
            <div class="griglia-2">
                <div class="campo"><label>Nome</label><input id="m-p-nomepr" value="${p && p.nomeProprio ? esc(p.nomeProprio) : ''}" placeholder="es. Mario"><div class="hint">Usato nelle lettere: "Dott. Nome Cognome".</div></div>
                <div class="campo"><label>Cognome</label><input id="m-p-nome" value="${p ? esc(p.nome) : ''}" placeholder="es. Rossi"><div class="hint">Collega la persona agli incarichi.</div></div>
                <div class="campo"><label>Email</label><input id="m-p-email" type="email" value="${p && p.email ? esc(p.email) : ''}"></div>
                <div class="campo"><label>Telefono</label><input id="m-p-telefono" value="${p && p.telefono ? esc(p.telefono) : ''}"></div>
                <div class="campo"><label>Regione</label><select id="m-p-regione">
                    <option value="">Nessuna</option>
                    ${p && p.regione && !RV_ROSTER.regioni.includes(p.regione) ? `<option selected>${esc(p.regione)}</option>` : ''}
                    ${RV_ROSTER.regioni.map(r => `<option ${p && p.regione === r ? 'selected' : ''}>${r}</option>`).join('')}
                </select></div>
                <div class="campo"><label>Provincia</label><input id="m-p-provincia" value="${p && p.provincia ? esc(p.provincia) : ''}"></div>
                <div class="campo"><label>Localita</label><input id="m-p-localita" value="${p && p.localita ? esc(p.localita) : ''}"></div>
                <div class="campo"><label>Indirizzo</label><input id="m-p-indirizzo" value="${p && p.indirizzo ? esc(p.indirizzo) : ''}"></div>
            </div>
            <div class="campo"><label>Ruoli</label>
                <label style="display:flex; gap:8px; align-items:center; font-weight:500;"><input type="checkbox" id="m-p-qualita" ${p && p.qualita ? 'checked' : ''} style="width:auto;">Responsabile qualita</label>
                <label style="display:flex; gap:8px; align-items:center; font-weight:500;"><input type="checkbox" id="m-p-resp" ${p && p.respIncarico ? 'checked' : ''} style="width:auto;">Responsabile incarico</label>
                <label style="display:flex; gap:8px; align-items:center; font-weight:500;"><input type="checkbox" id="m-p-team" ${!p || p.team ? 'checked' : ''} style="width:auto;">Team di revisione / referente</label>
                <label style="display:flex; gap:8px; align-items:center; font-weight:500;"><input type="checkbox" id="m-p-coordinatore" ${p && p.coordinatore ? 'checked' : ''} style="width:auto;">Coordinatore territoriale</label>
                <label style="display:flex; gap:8px; align-items:center; font-weight:500;"><input type="checkbox" id="m-p-vice" ${p && p.viceCoordinatore ? 'checked' : ''} style="width:auto;">Vice coordinatore territoriale</label>
                <div id="m-p-coord-box" class="${p && (p.coordinatore || p.viceCoordinatore) ? '' : 'nascosto'}" style="margin:2px 0 6px 26px;">
                    <div class="hint" style="margin:0 0 6px;">Se questa persona accede con il ruolo "Coordinatore territoriale" o "Vice coordinatore territoriale", vede in sola visualizzazione gli incarichi della <strong>Regione</strong> indicata qui sopra piu quelli delle regioni scelte qui sotto. Senza alcuna regione non vede alcun incarico.</div>
                    <div class="hint" style="margin:0 0 4px;"><strong>Altre regioni coordinate</strong> (oltre alla Regione della scheda):</div>
                    <div class="regcoord-grid">${chipsRegioni || '<span class="hint">Nessuna regione disponibile.</span>'}</div>
                </div>
                <label style="display:flex; gap:8px; align-items:center; font-weight:500;"><input type="checkbox" id="m-p-equity" ${p && p.equityPartner ? 'checked' : ''} style="width:auto;">Equity partner</label>
                <label style="display:flex; gap:8px; align-items:center; font-weight:500;"><input type="checkbox" id="m-p-founding" ${p && p.foundingPartner ? 'checked' : ''} style="width:auto;">Founding partner</label>
            </div>
            ${p ? '<p class="descrizione">Se cambi il cognome, viene aggiornato anche negli incarichi che lo citano.</p>' : ''}
            <div class="msg-errore hidden" id="m-p-errore"></div>
            <div class="modale-azioni">
                <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                <button class="btn btn-primary" id="m-salva">Salva</button>
            </div>`, { classe: 'larga' });
        document.getElementById('m-annulla').addEventListener('click', chiudiModale);
        // le "altre regioni coordinate" compaiono con la spunta Coordinatore o Vice
        const aggiornaCoordBox = () => document.getElementById('m-p-coord-box').classList.toggle('nascosto',
            !document.getElementById('m-p-coordinatore').checked && !document.getElementById('m-p-vice').checked);
        document.getElementById('m-p-coordinatore').addEventListener('change', aggiornaCoordBox);
        document.getElementById('m-p-vice').addEventListener('change', aggiornaCoordBox);
        const btnSalvaP = document.getElementById('m-salva');
        btnSalvaP.addEventListener('click', () => conAttesa(btnSalvaP, () => {
            const nome = document.getElementById('m-p-nome').value.trim();
            const err = document.getElementById('m-p-errore');
            if (nome.length < 2) { err.textContent = 'Inserisci un cognome valido.'; err.classList.remove('hidden'); return; }
            // virgole e punti e virgola sono i separatori degli elenchi team
            if (/[,;]/.test(nome)) { err.textContent = 'Il cognome non puo contenere virgole o punti e virgola.'; err.classList.remove('hidden'); return; }
            const omonimo = Persone.trovaPerNome(nome);
            if (omonimo && (!p || omonimo.id !== p.id)) { err.textContent = 'Esiste gia una persona con questo cognome.'; err.classList.remove('hidden'); return; }
            // email unica: e' l'aggancio tra utente e scheda (regione del coordinatore territoriale)
            const emailNuova = document.getElementById('m-p-email').value.trim().toLowerCase();
            if (emailNuova) {
                const stessa = Persone.tutte().find(x => x.email && String(x.email).toLowerCase() === emailNuova && (!p || x.id !== p.id));
                if (stessa) { err.textContent = 'Questa email e gia sulla scheda di ' + stessa.nome + ': ogni scheda deve avere un\'email diversa.'; err.classList.remove('hidden'); return; }
            }
            const contatti = {
                nomeProprio: document.getElementById('m-p-nomepr').value.trim(),
                email: document.getElementById('m-p-email').value.trim(),
                telefono: document.getElementById('m-p-telefono').value.trim(),
                regione: document.getElementById('m-p-regione').value.trim(),
                provincia: document.getElementById('m-p-provincia').value.trim(),
                localita: document.getElementById('m-p-localita').value.trim(),
                indirizzo: document.getElementById('m-p-indirizzo').value.trim()
            };
            const coordFlag = document.getElementById('m-p-coordinatore').checked;
            const viceFlag = document.getElementById('m-p-vice').checked;
            const ruoli = {
                qualita: document.getElementById('m-p-qualita').checked,
                respIncarico: document.getElementById('m-p-resp').checked,
                team: document.getElementById('m-p-team').checked,
                coordinatore: coordFlag,
                viceCoordinatore: viceFlag,
                // senza alcuna spunta di coordinamento le altre regioni non hanno senso: si azzerano
                regioniCoordinate: (coordFlag || viceFlag) ? Array.from(document.querySelectorAll('.m-p-regcoord:checked')).map(c => c.value) : [],
                equityPartner: document.getElementById('m-p-equity').checked,
                foundingPartner: document.getElementById('m-p-founding').checked
            };
            const CAMPI_PERSONA = [
                { chiave: 'nome', nome: 'Cognome' }, { chiave: 'nomeProprio', nome: 'Nome' },
                { chiave: 'email', nome: 'Email' }, { chiave: 'telefono', nome: 'Telefono' },
                { chiave: 'regione', nome: 'Regione' }, { chiave: 'provincia', nome: 'Provincia' },
                { chiave: 'localita', nome: 'Localita' }, { chiave: 'indirizzo', nome: 'Indirizzo' },
                { chiave: 'qualita', nome: 'Ruolo qualita' }, { chiave: 'respIncarico', nome: 'Ruolo resp. incarico' },
                { chiave: 'team', nome: 'Ruolo team' }, { chiave: 'coordinatore', nome: 'Coordinatore territoriale' },
                { chiave: 'viceCoordinatore', nome: 'Vice coordinatore territoriale' },
                { chiave: 'regioniCoordinate', nome: 'Altre regioni coordinate' },
                { chiave: 'equityPartner', nome: 'Equity partner' }, { chiave: 'foundingPartner', nome: 'Founding partner' }
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
            // ridisegna la vista da cui si e' aperta la scheda (Persone, Coordinatori o Responsabili)
            naviga(['coordinatori', 'responsabili'].includes(vistaCorrente) ? vistaCorrente : 'persone');
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
            // coordinatore non e' piu' un campo dell'incarico: non si rinomina (eviterebbe
            // anche voci di registro senza dettagli, visto che non e' piu' tracciato)
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

    /* Contesti delle comunicazioni (categorie), con colore riusato dai badge. */
    const CONTESTI = [
        { id: 'evento', nome: 'Evento', classe: 'legale' },
        { id: 'scadenza', nome: 'Scadenza', classe: 'rosso' },
        { id: 'adempimento', nome: 'Adempimento di revisione', classe: 'verde' },
        { id: 'generale', nome: 'Comunicazione generale', classe: 'neutro' },
        { id: 'altro', nome: 'Altro', classe: 'volontaria' }
    ];
    function contesto(id) { return CONTESTI.find(x => x.id === id) || CONTESTI.find(x => x.id === 'generale'); }
    function badgeContesto(id) { const x = contesto(id); return '<span class="badge ' + x.classe + '">' + esc(x.nome) + '</span>'; }

    /* Firma della mail con logo Revilaw: usata nell'anteprima; la STESSA firma e
       replicata nel servizio di invio (email-service/api/invia-comunicazione.js
       e cron-comunicazioni.js) cosi il destinatario vede esattamente questo. */
    const FIRMA_MAIL_HTML = '<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px;border-top:1px solid #E2E8F0;padding-top:16px;"><tr>'
        + '<td style="padding-right:14px;vertical-align:middle;"><img src="https://nextgenerationbusiness.it/zls_zes/img/logo-revilaw.png" alt="Revilaw" height="42" style="height:42px;width:auto;display:block;"></td>'
        + '<td style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;color:#0A2844;font-size:13px;line-height:1.5;">'
        + '<div style="font-size:16px;font-weight:bold;color:#0A2844;">Revilaw <span style="color:#8bb8d4;">S.p.A.</span></div>'
        + '<div style="color:#475569;">Revisione legale &middot; Next Generation Business</div>'
        + '<a href="https://nextgenerationbusiness.it" style="color:#164068;text-decoration:none;">nextgenerationbusiness.it</a>'
        + '</td></tr></table>';

    /* Gruppi DINAMICI di destinatari: si risolvono al momento dell'invio, quindi
       chi viene aggiunto dopo (nuovi utenti/ruoli) entra da solo negli invii
       successivi programmati. */
    const GRUPPI_MAIL = [
        { id: 'qualita', nome: 'Responsabili qualità' },
        { id: 'procuratori', nome: 'Procuratori (resp. incarico)' },
        { id: 'team', nome: 'Team di revisione' },
        { id: 'coordinatori', nome: 'Coordinatori territoriali' },
        { id: 'vicecoordinatori', nome: 'Vice coordinatori territoriali' },
        { id: 'utenti', nome: 'Utenti abilitati' }
    ];
    function nomeGruppo(id) { const g = GRUPPI_MAIL.find(x => x.id === id); return g ? g.nome : id; }
    // risolve i gruppi in indirizzi email usando i dati ATTUALI (persone locali + utenti passati)
    function risolviGruppiMail(gruppi, utentiAbilitati) {
        const set = new Set();
        const g = new Set(gruppi || []);
        if (g.has('utenti')) (utentiAbilitati || []).forEach(u => { if (u.email && u.attivo !== false) set.add(String(u.email).toLowerCase()); });
        const persone = Persone.tutte().filter(p => p.attivo && !p.eliminato && p.email);
        if (g.has('qualita')) persone.filter(p => p.qualita).forEach(p => set.add(p.email.toLowerCase()));
        if (g.has('procuratori')) persone.filter(p => p.respIncarico).forEach(p => set.add(p.email.toLowerCase()));
        if (g.has('team')) persone.filter(p => p.team).forEach(p => set.add(p.email.toLowerCase()));
        if (g.has('coordinatori')) persone.filter(p => p.coordinatore).forEach(p => set.add(p.email.toLowerCase()));
        if (g.has('vicecoordinatori')) persone.filter(p => p.viceCoordinatore).forEach(p => set.add(p.email.toLowerCase()));
        return set;
    }

    /* Sposta un timestamp al periodo successivo (uguale al cron, lato app). */
    function prossimaDataMs(ts, freq) {
        const d = new Date(ts);
        if (freq === 'settimanale') d.setDate(d.getDate() + 7);
        else if (freq === 'mensile') d.setMonth(d.getMonth() + 1);
        else if (freq === 'trimestrale') d.setMonth(d.getMonth() + 3);
        else if (freq === 'annuale') d.setFullYear(d.getFullYear() + 1);
        else return null;
        return d.getTime();
    }

    const MESI_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    /* Riferimento del periodo in base alla frequenza e alla data (per l'oggetto):
       trimestrale -> "primo trimestre 2026", mensile -> "gennaio 2026",
       annuale -> "2026", settimanale -> "settimana del 15/01/2026". */
    function etichettaPeriodo(freq, ts) {
        if (!ts) return '';
        const d = new Date(ts), anno = d.getFullYear(), z = n => String(n).padStart(2, '0');
        if (freq === 'trimestrale') return ['primo', 'secondo', 'terzo', 'quarto'][Math.floor(d.getMonth() / 3)] + ' trimestre ' + anno;
        if (freq === 'mensile') return MESI_IT[d.getMonth()] + ' ' + anno;
        if (freq === 'annuale') return String(anno);
        if (freq === 'settimanale') return 'settimana del ' + z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + anno;
        return '';
    }
    /* Oggetto finale con il periodo aggiunto (se richiesto e ricorrente). */
    function oggettoConPeriodo(oggetto, prog) {
        if (!prog || !prog.periodoNelOggetto) return oggetto;
        const p = etichettaPeriodo(prog.frequenza, prog.prossimoInvio);
        return p ? (oggetto + ' - ' + p) : oggetto;
    }

    /* Descrizione leggibile di QUANDO parte una comunicazione programmata. */
    function descriviProgrammazione(prog) {
        if (!prog || !prog.prossimoInvio) return '';
        // l'invio avviene una volta al giorno la mattina: conta il giorno, non l'ora
        const d = new Date(prog.prossimoInvio);
        const giorni = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
        const z = n => String(n).padStart(2, '0');
        const gg = d.getDate();
        if (prog.frequenza === 'unica' || !prog.frequenza) return 'Una volta, il ' + fmtGiorno(prog.prossimoInvio) + ' (la mattina)';
        let base;
        switch (prog.frequenza) {
            case 'settimanale': base = 'Ogni settimana, di ' + giorni[d.getDay()] + ' (la mattina)'; break;
            case 'mensile': base = 'Ogni mese, il giorno ' + gg + ' (la mattina)'; break;
            case 'trimestrale': base = 'Ogni 3 mesi, il giorno ' + gg + ' (la mattina)'; break;
            case 'annuale': base = 'Ogni anno, il ' + z(gg) + '/' + z(d.getMonth() + 1) + ' (la mattina)'; break;
            default: base = 'Periodicamente';
        }
        const fine = prog.fine ? (() => { const f = new Date(prog.fine); return ', fino al ' + z(f.getDate()) + '/' + z(f.getMonth() + 1) + '/' + f.getFullYear(); })() : ', senza fine';
        return base + fine;
    }

    /* Prossimi invii REALI di una comunicazione programmata, fedeli al cron:
       parte da prossimoInvio; se e in ritardo il cron recupera i periodi saltati
       con UN solo invio (la prima occorrenza puo essere nel passato, poi si salta
       alla prima data futura). Rispetta la data di fine. Ritorna [{ts, ritardo}]. */
    function prossimiInvii(prog, n, adesso) {
        if (!prog || !prog.prossimoInvio) return [];
        const freq = prog.frequenza;
        const out = [];
        let ts = prog.prossimoInvio, guard = 0;
        while (out.length < n && guard++ < 300) {
            if (prog.fine && ts > prog.fine) break;
            out.push({ ts: ts, ritardo: ts <= adesso });
            let nx = prossimaDataMs(ts, freq);
            if (nx == null) break;                       // frequenza unica: un solo invio
            if (ts <= adesso) { let g2 = 0; while (nx <= adesso && g2++ < 3000) nx = prossimaDataMs(nx, freq); }
            ts = nx;
        }
        return out;
    }

    /* Blocco "Prossimi invii" con data, etichetta di periodo e oggetto che verra
       spedito davvero (con il periodo nell'oggetto se la comunicazione lo prevede). */
    function anteprimaProssimiInvii(c) {
        const prog = c.programmazione;
        if (!prog || !prog.prossimoInvio) return '';
        const unica = !prog.frequenza || prog.frequenza === 'unica';
        const oggetto = (c.oggetto || c.nome || '(senza oggetto)');
        const conPeriodo = prog.periodoNelOggetto && !unica;
        const gg = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
        const z = n => String(n).padStart(2, '0');
        const dlong = ms => { const d = new Date(ms); return gg[d.getDay()] + ' ' + z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear(); };
        const dshort = ms => { const d = new Date(ms); return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear(); };
        const MOSTRA = 4;
        const occ = prossimiInvii(prog, MOSTRA + 1, Date.now());
        if (!occ.length) return '';
        const righe = occ.slice(0, MOSTRA).map(o => {
            const per = unica ? '' : etichettaPeriodo(prog.frequenza, o.ts);
            const ogg = (conPeriodo && per) ? (oggetto + ' - ' + per) : oggetto;
            return '<li class="pi-riga' + (o.ritardo ? ' pi-ritardo' : '') + '">'
                + '<span class="pi-data">' + dlong(o.ts) + '</span>'
                + (per ? '<span class="pi-periodo">' + esc(per) + '</span>' : '')
                + '<span class="pi-ogg">' + esc(ogg) + '</span>'
                + (o.ritardo ? '<span class="pi-badge">in ritardo: parte al prossimo giro</span>' : '')
                + '</li>';
        }).join('');
        let nota = '';
        if (!unica) {
            if (occ.length > MOSTRA) nota = '<div class="pi-nota">&hellip;e cosi via</div>';
            else if (prog.fine) nota = '<div class="pi-nota">poi la serie termina (fino al ' + dshort(prog.fine) + ')</div>';
        }
        const tit = unica ? 'Invio previsto' : (conPeriodo ? 'Prossimi invii (l&rsquo;oggetto include il periodo)' : 'Prossimi invii');
        return '<div class="prossimi-invii"><div class="pi-tit">' + tit + '</div><ol class="pi-lista">' + righe + '</ol>' + nota + '</div>';
    }

    /* Stato della vista Comunicazioni: 'elenco' o 'calendario', e il mese mostrato. */
    let comuniVista = 'elenco';
    let comuniMese = null;
    let comuniTab = 'programmate'; // scheda attiva: 'programmate' | 'sospese' | 'bozze' (in preparazione) | 'invii' (effettuati)

    /* Calendario classico mensile delle comunicazioni: mostra gli invii passati
       (dallo storico) e le occorrenze future programmate, colorati per contesto. */
    function renderCalendarioComunicazioni() {
        if (!comuniMese) comuniMese = new Date();
        const lista = Comunicazioni.tutte();
        const anno = comuniMese.getFullYear(), mese = comuniMese.getMonth();
        const inizioMs = new Date(anno, mese, 1).getTime();
        const fineMs = new Date(anno, mese + 1, 0, 23, 59, 59).getTime();
        const perGiorno = {};
        const chiave = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
        const aggiungi = (ts, c, tipo) => {
            if (!ts || ts < inizioMs || ts > fineMs) return;
            const k = chiave(ts);
            (perGiorno[k] = perGiorno[k] || []).push({ comId: c.id, etichetta: c.nome || c.oggetto || '(senza nome)', contesto: c.contesto, tipo, ts });
        };
        lista.forEach(c => {
            const storia = (c.invii && c.invii.length) ? c.invii : (c.inviata ? [{ il: c.inviata.il }] : []);
            storia.forEach(s => aggiungi(s.il, c, 'inviato'));
            if (c.stato === 'programmata' && c.programmazione && c.programmazione.attiva !== false && c.programmazione.prossimoInvio) {
                const fineProg = c.programmazione.fine || null;
                let t = c.programmazione.prossimoInvio, guard = 0;
                while (t <= fineMs && guard < 400) {
                    if (fineProg && t > fineProg) break;   // non proiettare invii oltre la data di fine
                    aggiungi(t, c, 'programmato');
                    const nx = prossimaDataMs(t, c.programmazione.frequenza);
                    if (nx == null) break;
                    t = nx; guard++;
                }
            }
        });
        const mesiIt = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
        const giorniIt = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
        const primoGiornoSett = (new Date(anno, mese, 1).getDay() + 6) % 7; // 0 = lunedi
        const numGiorni = new Date(anno, mese + 1, 0).getDate();
        const oggiK = chiave(Date.now());
        let celle = '';
        for (let i = 0; i < primoGiornoSett; i++) celle += '<div class="cal-cella cal-vuota"></div>';
        for (let g = 1; g <= numGiorni; g++) {
            const k = anno + '-' + String(mese + 1).padStart(2, '0') + '-' + String(g).padStart(2, '0');
            const ev = (perGiorno[k] || []).sort((a, b) => a.ts - b.ts);
            const chips = ev.map(e => `<button class="cal-chip badge ${contesto(e.contesto).classe}" data-id="${esc(e.comId)}" title="${esc(e.etichetta)}${e.tipo === 'programmato' ? ' (programmato)' : ''}">${e.tipo === 'programmato' ? '&#9202; ' : ''}${esc(e.etichetta)}</button>`).join('');
            celle += `<div class="cal-cella${k === oggiK ? ' cal-oggi' : ''}"><div class="cal-num">${g}</div>${chips}</div>`;
        }
        return `<div class="cal-barra">
                <button class="btn btn-sm btn-secondary" id="cal-prec" aria-label="Mese precedente">&#9664;</button>
                <div class="cal-titolo">${mesiIt[mese]} ${anno}</div>
                <button class="btn btn-sm btn-secondary" id="cal-succ" aria-label="Mese successivo">&#9654;</button>
                <button class="btn btn-sm btn-ghost" id="cal-oggi-btn">Oggi</button>
            </div>
            <div class="cal-legenda">${CONTESTI.map(x => `<span class="badge ${x.classe}">${esc(x.nome)}</span>`).join('')}</div>
            <div class="cal-griglia">${giorniIt.map(d => `<div class="cal-intest">${d}</div>`).join('')}${celle}</div>`;
    }

    /* =========================================================
       SONDAGGI (candidatura ai gruppi di specialisti Revilaw)
       ---------------------------------------------------------
       Un questionario interno: ogni utente abilitato ordina le aree
       di consulenza per preferenza e indica competenze ed esperienze.
       Le risposte sono un archivio condiviso (una per utente, chiave =
       email), con una scheda di riepilogo dei risultati aggregati.
    ========================================================= */
    const LIVELLI_COMP = ['Base', 'Buona', 'Elevata'];
    const SOND_DEF = {
        id: 'gruppi-specialisti',
        titolo: 'Gruppi di specialisti',
        descrizione: 'Accanto alla revisione legale Revilaw sviluppa una consulenza integrata per rafforzare gli assetti e il merito creditizio delle imprese. Da settembre nascono i gruppi di specialisti: indica in ordine le aree su cui vorresti contribuire e, dove vuoi, le tue competenze ed esperienze.',
        argomenti: [
            { id: 'adeguati_assetti', nome: 'Adeguati assetti', desc: 'Assetti organizzativi, amministrativi e contabili adeguati ai sensi dell\'art. 2086 c.c.' },
            { id: 'esg', nome: 'ESG e sostenibilita', desc: 'Rendicontazione di sostenibilita, criteri ESG e finanza sostenibile per le imprese.' },
            { id: 'finanza_agevolata', nome: 'Finanza agevolata', desc: 'Bandi, incentivi e strumenti agevolativi per gli investimenti e la crescita d\'impresa.' },
            { id: 'rating_legalita', nome: 'Rating di legalita', desc: 'Requisiti, punteggio e vantaggi reputazionali e creditizi del rating di legalita.' },
            { id: 'modello_231', nome: 'Modello 231', desc: 'Responsabilita amministrativa degli enti e sistema di prevenzione dei reati.' },
            { id: 'tcf', nome: 'Tax Control Framework', desc: 'Presidio del rischio fiscale e adempimento collaborativo con l\'amministrazione.' },
            { id: 'crisi_impresa', nome: 'Crisi d\'impresa', desc: 'Allerta precoce, composizione negoziata e percorsi di risanamento dell\'impresa.' },
            { id: 'wealth_management', nome: 'Wealth management', desc: 'Protezione e pianificazione del patrimonio dell\'imprenditore e della famiglia.' }
        ]
    };
    const Sondaggi = {
        risposte() { const l = Store.leggi(CHIAVI.sondaggi, []); return Array.isArray(l) ? l : []; },
        salvaTutte(l) { Store.scrivi(CHIAVI.sondaggi, l); },
        rispostaDi(email) { const e = String(email || '').toLowerCase(); return this.risposte().find(r => r && r.id === e) || null; },
        salvaRisposta(rec) {
            const l = this.risposte();
            const i = l.findIndex(r => r && r.id === rec.id);
            if (i >= 0) l[i] = rec; else l.push(rec);
            this.salvaTutte(l);
        },
        elimina(id) { this.salvaTutte(this.risposte().filter(r => r && r.id !== id)); }
    };
    function nomeArgomento(id) { const a = SOND_DEF.argomenti.find(x => x.id === id); return a ? a.nome : id; }

    // riepilogo: punteggio (metodo Borda), media posizione, prime scelte, competenze
    function aggregaSondaggio() {
        const risposte = Sondaggi.risposte();
        const ids = SOND_DEF.argomenti.map(a => a.id);
        const N = ids.length;
        const stat = {};
        ids.forEach(id => { stat[id] = { id, nome: nomeArgomento(id), punti: 0, sommaPos: 0, conteggi: 0, primi: 0, comp: { Base: 0, Buona: 0, Elevata: 0 } }; });
        risposte.forEach(r => {
            const ord = Array.isArray(r.ordine) ? r.ordine.filter(id => stat[id]) : [];
            ord.forEach((id, i) => {
                const s = stat[id]; const pos = i + 1;
                s.punti += (N - pos + 1);
                s.sommaPos += pos; s.conteggi += 1;
                if (pos === 1) s.primi += 1;
            });
            if (r.comp) ids.forEach(id => { const c = r.comp[id]; if (c && c.liv && stat[id].comp[c.liv] != null) stat[id].comp[c.liv]++; });
        });
        const classifica = ids.map(id => stat[id]).sort((a, b) =>
            b.punti - a.punti || (a.sommaPos / (a.conteggi || 1)) - (b.sommaPos / (b.conteggi || 1)));
        return { risposte, classifica, N };
    }

    /* Modale di compilazione: ordinamento con le frecce, competenze facoltative.
       La bozza vive in memoria e i campi vengono riletti prima di ogni riordino,
       cosi spostare una riga non perde cio' che e' gia' stato scritto. */
    function modaleSondaggio() {
        const u = Auth.utenteCorrente; if (!u) return;
        const esistente = Sondaggi.rispostaDi(u.email);
        const idsDefault = SOND_DEF.argomenti.map(a => a.id);
        const argById = {}; SOND_DEF.argomenti.forEach(a => { argById[a.id] = a; });

        const bozza = { ordine: [], comp: {}, note: (esistente && esistente.note) || '' };
        const base = (esistente && Array.isArray(esistente.ordine)) ? esistente.ordine.filter(id => argById[id]) : [];
        idsDefault.forEach(id => { if (base.indexOf(id) < 0) base.push(id); });
        bozza.ordine = base;
        idsDefault.forEach(id => {
            const c = esistente && esistente.comp && esistente.comp[id];
            bozza.comp[id] = { liv: (c && c.liv) || '', esp: (c && c.esp) || '' };
        });

        function leggiDom() {
            const cont = document.getElementById('s-lista'); if (!cont) return;
            cont.querySelectorAll('.s-riga').forEach(r => {
                const id = r.dataset.id; if (!bozza.comp[id]) return;
                const sel = r.querySelector('select.s-liv'); const inp = r.querySelector('input.s-esp');
                bozza.comp[id].liv = sel ? sel.value : '';
                bozza.comp[id].esp = inp ? inp.value.trim() : '';
            });
            const note = document.getElementById('s-note'); if (note) bozza.note = note.value;
        }
        function rigaHtml(id, i) {
            const a = argById[id]; const c = bozza.comp[id] || { liv: '', esp: '' };
            const opt = ['<option value="">Competenza (facoltativa)</option>']
                .concat(LIVELLI_COMP.map(l => '<option value="' + l + '"' + (c.liv === l ? ' selected' : '') + '>' + l + '</option>')).join('');
            return '<div class="s-riga" data-id="' + esc(id) + '">'
                + '<div class="s-pos">' + (i + 1) + '</div>'
                + '<div class="s-main"><div class="s-nome">' + esc(a.nome) + '</div>'
                + '<div class="s-desc">' + esc(a.desc) + '</div>'
                + '<div class="s-comp"><select class="s-liv">' + opt + '</select>'
                + '<input type="text" class="s-esp" maxlength="240" placeholder="Esperienze sull\'argomento (facoltative)" value="' + esc(c.esp) + '"></div></div>'
                + '<div class="s-move">'
                + '<button type="button" class="btn btn-sm btn-secondary s-up" data-id="' + esc(id) + '" aria-label="Sposta su"' + (i === 0 ? ' disabled' : '') + '>&#9650;</button>'
                + '<button type="button" class="btn btn-sm btn-secondary s-down" data-id="' + esc(id) + '" aria-label="Sposta giu"' + (i === bozza.ordine.length - 1 ? ' disabled' : '') + '>&#9660;</button>'
                + '</div></div>';
        }
        function renderLista() {
            const cont = document.getElementById('s-lista');
            cont.innerHTML = bozza.ordine.map((id, i) => rigaHtml(id, i)).join('');
            cont.querySelectorAll('.s-up').forEach(b => b.addEventListener('click', () => muovi(b.dataset.id, -1)));
            cont.querySelectorAll('.s-down').forEach(b => b.addEventListener('click', () => muovi(b.dataset.id, 1)));
        }
        function muovi(id, dir) {
            leggiDom();
            const i = bozza.ordine.indexOf(id); const j = i + dir;
            if (i < 0 || j < 0 || j >= bozza.ordine.length) return;
            const t = bozza.ordine[i]; bozza.ordine[i] = bozza.ordine[j]; bozza.ordine[j] = t;
            renderLista();
        }

        apriModale('<h2>' + (esistente ? 'Modifica la tua risposta' : 'Compila il questionario') + '</h2>'
            + '<p class="hint" style="margin:-4px 0 12px;">Ordina le otto aree dalla piu preferita (in alto) alla meno preferita (in basso) con le frecce. Per ciascuna puoi indicare, se vuoi, il livello di competenza e una nota sulle esperienze.</p>'
            + '<div id="s-lista" class="s-lista"></div>'
            + '<div class="campo" style="margin-top:14px;"><label for="s-note">Nota per la direzione (facoltativa)</label>'
            + '<textarea id="s-note" rows="2" maxlength="600" placeholder="Disponibilita, specializzazioni, proposte">' + esc(bozza.note) + '</textarea></div>'
            + '<div class="modale-azioni"><button class="btn btn-secondary" id="s-annulla">Annulla</button>'
            + '<button class="btn btn-primary" id="s-salva">' + (esistente ? 'Aggiorna la risposta' : 'Invia la risposta') + '</button></div>',
            { classe: 'larga' });

        renderLista();
        document.getElementById('s-annulla').addEventListener('click', chiudiModale);
        document.getElementById('s-salva').addEventListener('click', () => {
            leggiDom();
            const comp = {};
            bozza.ordine.forEach(id => { const c = bozza.comp[id]; if (c && (c.liv || c.esp)) comp[id] = { liv: c.liv || '', esp: c.esp || '' }; });
            const rec = {
                id: String(u.email).toLowerCase(), email: String(u.email).toLowerCase(),
                nome: u.nome || u.email, ruolo: u.ruolo || '',
                ordine: bozza.ordine.slice(), comp: comp, note: bozza.note || '', ts: Date.now()
            };
            Sondaggi.salvaRisposta(rec);
            try { Audit.registra(u, esistente ? 'Sondaggio aggiornato' : 'Sondaggio compilato', 'sondaggio', SOND_DEF.id, null, SOND_DEF.titolo); } catch (e) { }
            chiudiModale();
            toast('Risposta salvata. Grazie!', 'verde');
            vistaSondaggi();
        });
    }

    function confermaEliminaRisposta(id, nome) {
        apriModale('<h2>Elimina la risposta</h2><p>Vuoi eliminare la risposta di <strong>' + esc(nome || id) + '</strong>? L\'operazione non e reversibile.</p>'
            + '<div class="modale-azioni"><button class="btn btn-secondary" id="e-no">Annulla</button><button class="btn btn-danger" id="e-si">Elimina</button></div>');
        document.getElementById('e-no').addEventListener('click', chiudiModale);
        document.getElementById('e-si').addEventListener('click', () => {
            Sondaggi.elimina(id);
            try { Audit.registra(Auth.utenteCorrente, 'Risposta sondaggio eliminata', 'sondaggio', id, null, SOND_DEF.titolo); } catch (e) { }
            chiudiModale(); toast('Risposta eliminata.', 'verde'); vistaSondaggi();
        });
    }

    let sondTab = 'questionario'; // 'questionario' | 'risultati'

    function vistaSondaggi() {
        const u = Auth.utenteCorrente;
        const mia = u ? Sondaggi.rispostaDi(u.email) : null;
        const nRisposte = Sondaggi.risposte().length;

        const tabBar = '<div class="tab-dest" style="margin-bottom:16px;">'
            + '<button class="tab-btn ' + (sondTab === 'questionario' ? 'attivo' : '') + '" data-sondtab="questionario">Il questionario</button>'
            + '<button class="tab-btn ' + (sondTab === 'risultati' ? 'attivo' : '') + '" data-sondtab="risultati">Riepilogo risultati (' + nRisposte + ')</button>'
            + '</div>';

        let corpo;
        if (sondTab === 'risultati') {
            corpo = corpoRisultati();
        } else {
            const statoCard = mia
                ? '<div class="card s-stato"><div><span class="badge verde">Hai risposto</span> '
                    + '<span class="hint">Aggiornata il ' + esc(fmtDataOra(mia.ts)) + '</span>'
                    + '<div class="s-top3">La tua classifica: ' + esc(mia.ordine.map((id, i) => (i + 1) + '. ' + nomeArgomento(id)).join('   ')) + '</div></div>'
                    + '<button class="btn btn-primary" id="s-compila">Modifica la tua risposta</button></div>'
                : '<div class="card s-stato"><div><strong>Non hai ancora compilato il questionario.</strong>'
                    + '<div class="hint" style="margin-top:4px;">Bastano un paio di minuti: ordina le aree e, se vuoi, aggiungi le tue competenze.</div></div>'
                    + '<button class="btn btn-primary" id="s-compila">Compila il questionario</button></div>';
            const argomenti = '<div class="s-argomenti">' + SOND_DEF.argomenti.map((a, i) =>
                '<div class="s-arg"><span class="s-arg-num">' + String(i + 1).padStart(2, '0') + '</span>'
                + '<div><div class="s-arg-nome">' + esc(a.nome) + '</div><div class="s-arg-desc">' + esc(a.desc) + '</div></div></div>').join('') + '</div>';
            corpo = statoCard + '<h2 class="s-sez-tit">Le otto aree del sondaggio</h2>' + argomenti;
        }

        $vista().innerHTML = '<header><div><h1>Sondaggi</h1>'
            + '<p class="descrizione">' + esc(SOND_DEF.descrizione) + '</p></div></header>'
            + tabBar + corpo;

        $vista().querySelectorAll('[data-sondtab]').forEach(b =>
            b.addEventListener('click', () => { sondTab = b.dataset.sondtab; vistaSondaggi(); }));
        const bc = document.getElementById('s-compila');
        if (bc) bc.addEventListener('click', modaleSondaggio);
        const tab = $vista().querySelector('table.dati');
        if (tab) attrezzaTabella(tab, { nomeFile: 'sondaggio-risultati', ricerca: true });
        $vista().querySelectorAll('.s-elimina').forEach(b =>
            b.addEventListener('click', () => confermaEliminaRisposta(b.dataset.id, b.dataset.nome)));
    }

    function corpoRisultati() {
        const { risposte, classifica, N } = aggregaSondaggio();
        if (!risposte.length) {
            return '<div class="card tabella-vuota">Ancora nessuna risposta. Il riepilogo compare qui appena il questionario viene compilato.</div>';
        }
        const media = s => s.conteggi ? (s.sommaPos / s.conteggi).toFixed(1) : '-';
        const righe = classifica.map((s, i) => '<tr>'
            + '<td class="num" data-label="Pos.">' + (i + 1) + '</td>'
            + '<td class="cliente-cella" data-label="Area">' + esc(s.nome) + '</td>'
            + '<td class="num" data-label="Punteggio">' + s.punti + '</td>'
            + '<td class="num" data-label="Media posizione">' + media(s) + '</td>'
            + '<td class="num" data-label="Prime scelte">' + (s.primi || '') + '</td>'
            + '<td data-label="Competenze">' + competenzeBadge(s.comp) + '</td>'
            + '</tr>').join('');
        const tabella = '<div class="tabella-wrap"><table class="dati a-schede"><thead><tr>'
            + '<th class="num">Pos.</th><th>Area</th><th class="num" title="Punteggio complessivo: 8 punti alla prima scelta, 1 all\'ultima">Punteggio</th>'
            + '<th class="num" title="Posizione media assegnata">Media pos.</th><th class="num">Prime scelte</th><th>Competenze dichiarate</th>'
            + '</tr></thead><tbody>' + righe + '</tbody></table></div>';

        const intro = '<div class="s-riep-head"><div class="s-riep-num">' + risposte.length + '</div>'
            + '<div class="hint">' + (risposte.length === 1 ? 'risposta raccolta' : 'risposte raccolte') + '. Le aree sono ordinate per punteggio (metodo a punti: 8 alla prima scelta, 1 all\'ultima).</div></div>';

        let dettaglio = '';
        if (Auth.eAdmin() || Auth.eProprietario()) {
            const rr = risposte.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
            const drighe = rr.map(r => {
                const top3 = (Array.isArray(r.ordine) ? r.ordine.slice(0, 3) : []).map((id, i) => (i + 1) + '. ' + nomeArgomento(id)).join(' · ');
                return '<tr>'
                    + '<td class="cliente-cella" data-label="Persona">' + esc(r.nome || r.email) + '</td>'
                    + '<td data-label="Ruolo">' + esc(nomeRuolo(r.ruolo)) + '</td>'
                    + '<td data-label="Prime scelte">' + esc(top3) + '</td>'
                    + '<td data-label="Aggiornata">' + esc(fmtDataOra(r.ts)) + '</td>'
                    + '<td data-label=""><button class="btn btn-sm btn-secondary s-elimina" data-id="' + esc(r.id) + '" data-nome="' + esc(r.nome || r.email) + '">Elimina</button></td>'
                    + '</tr>';
            }).join('');
            dettaglio = '<h2 class="s-sez-tit">Risposte individuali</h2>'
                + '<div class="tabella-wrap"><table class="dati a-schede compatta"><thead><tr>'
                + '<th>Persona</th><th>Ruolo</th><th>Prime scelte</th><th>Aggiornata</th><th></th>'
                + '</tr></thead><tbody>' + drighe + '</tbody></table></div>'
                + '<p class="hint" style="margin-top:8px;">Il dettaglio nominativo e visibile solo ad amministratore e titolare.</p>';
        }
        return intro + tabella + dettaglio;
    }

    function competenzeBadge(comp) {
        const parti = [];
        if (comp.Elevata) parti.push('<span class="badge verde">Elevata ' + comp.Elevata + '</span>');
        if (comp.Buona) parti.push('<span class="badge ambra">Buona ' + comp.Buona + '</span>');
        if (comp.Base) parti.push('<span class="badge">Base ' + comp.Base + '</span>');
        return parti.length ? parti.join(' ') : '<span style="color:var(--grigio-400)">nessuna</span>';
    }

    /* =========================================================
       VISTA: COMUNICAZIONI (programmate, bozze, storico invii)
    ========================================================= */
    function vistaComunicazioni() {
        const lista = Comunicazioni.tutte();
        const puoInviare = Cloud.attivo;
        const puoScr = Auth.puoScrivere('comunicazioni');   // sola lettura: si apre e si legge, ma non si tocca
        const seScr = html => puoScr ? html : '';
        // serie ancora attive: esclude le sospese manualmente e quelle concluse dal server (attiva:false)
        const programmate = lista.filter(c => c.stato === 'programmata' && !c.sospesa && (!c.programmazione || c.programmazione.attiva !== false));
        const sospese = lista.filter(c => c.stato === 'programmata' && c.sospesa);
        const bozze = lista.filter(c => c.stato === 'bozza');
        // storico: ogni invio effettuato (immediato o programmato), piu recente prima
        const invii = [];
        lista.forEach(c => {
            const storia = (c.invii && c.invii.length) ? c.invii : (c.inviata ? [{ il: c.inviata.il, n: c.inviata.n, da: c.inviata.da, falliti: c.inviata.falliti, dettaglioFalliti: c.inviata.dettaglioFalliti }] : []);
            storia.forEach(s => invii.push({ contesto: c.contesto, nome: c.nome, oggetto: c.oggetto || '(senza oggetto)', il: s.il, n: s.n, da: s.da || '', falliti: s.falliti || 0, dettaglioFalliti: s.dettaglioFalliti || [] }));
        });
        invii.sort((a, b) => (b.il || 0) - (a.il || 0));

        const azioni = c => `<td data-label="" style="white-space:nowrap;">
            <button class="btn btn-sm btn-secondary c-apri" data-id="${esc(c.id)}">Apri</button>
            ${seScr(`<button class="btn btn-sm btn-secondary c-duplica" data-id="${esc(c.id)}">Duplica</button>
            <button class="btn btn-sm btn-danger c-elimina" data-id="${esc(c.id)}">Elimina</button>`)}</td>`;

        // barra filtri riutilizzabile per le liste "a schede" (programmate, sospese)
        const barraFiltriComm = (pfx, items) => {
            if (items.length < 2) return '';
            const cs = Array.from(new Set(items.map(c => c.contesto).filter(Boolean)));
            const fs = Array.from(new Set(items.map(c => (c.programmazione && c.programmazione.frequenza) || '').filter(Boolean)));
            return `<div class="filtri" id="${pfx}-filtri">
                <div class="campo ricerca"><label>Ricerca</label><input id="${pfx}-cerca" type="search" placeholder="Nome o oggetto..."></div>
                ${comboFiltro(pfx + '-contesto', 'Contesto', cs.map(x => contesto(x).nome))}
                ${fs.length ? comboFiltro(pfx + '-freq', 'Frequenza', fs) : ''}
                <span class="filtro-conteggio" id="${pfx}-conta"></span>
            </div>`;
        };
        // riga (details) di una comunicazione a schede; sosp=true per le sospese
        const rigaComm = (c, sosp) => {
            const grp = (c.gruppi && c.gruppi.length) ? ' + ' + esc(c.gruppi.map(nomeGruppo).join(', ')) : '';
            const freq = (c.programmazione && c.programmazione.frequenza) || '';
            const cerca = ((c.nome || '') + ' ' + (c.oggetto || '')).toLowerCase();
            const quando = sosp ? ('Sospesa &middot; ' + esc(descriviProgrammazione(c.programmazione))) : esc(descriviProgrammazione(c.programmazione));
            const azioniInline = sosp
                ? `${seScr(`<button class="btn btn-sm btn-primary c-riattiva" data-id="${esc(c.id)}">Riattiva</button>`)}<button class="btn btn-sm btn-secondary c-apri" data-id="${esc(c.id)}">Apri</button>${seScr(`<button class="btn btn-sm btn-secondary c-duplica" data-id="${esc(c.id)}">Duplica</button><button class="btn btn-sm btn-danger c-elimina" data-id="${esc(c.id)}">Elimina</button>`)}`
                : `<button class="btn btn-sm btn-secondary c-apri" data-id="${esc(c.id)}">Apri</button>${seScr(`<button class="btn btn-sm btn-secondary c-duplica" data-id="${esc(c.id)}">Duplica</button><button class="btn btn-sm btn-secondary c-sospendi" data-id="${esc(c.id)}">Sospendi</button><button class="btn btn-sm btn-danger c-elimina" data-id="${esc(c.id)}">Elimina</button>`)}`;
            const dettaglio = sosp
                ? '<p class="hint" style="margin:0;">Gli invii sono fermi. Con "Riattiva" ripartono dalla prossima occorrenza futura; con "Duplica" ne crei una copia modificabile.</p>'
                : anteprimaProssimiInvii(c);
            return `<details class="comm-item${sosp ? ' comm-sospesa' : ''}" data-contesto="${esc(c.contesto || '')}" data-freq="${esc(freq)}" data-cerca="${esc(cerca)}">
                <summary class="comm-sommario">
                    ${badgeContesto(c.contesto)}
                    <span class="comm-nome">${esc(c.nome || c.oggetto || '(senza nome)')}</span>
                    <span class="comm-quando-inline">${quando}</span>
                    <span class="comm-dest-inline">${(c.destinatari || []).length} dest.${grp}</span>
                    <span class="comm-azioni-inline">${azioniInline}</span>
                </summary>
                <div class="comm-dettaglio">${(c.nome && c.oggetto) ? '<div class="comm-ogg-riga">Oggetto: ' + esc(c.oggetto) + '</div>' : ''}${dettaglio}</div>
            </details>`;
        };
        const sezProgrammate = programmate.length ? `<div class="card" id="sez-programmate">
            <h2>Comunicazioni programmate (${programmate.length})</h2>
            <p class="hint" style="margin:-6px 0 12px;">Clicca su una riga (o sul <strong>&#9654;</strong> a inizio riga) per <strong>espanderla</strong> e vedere i prossimi invii con il periodo; ri-clicca per chiuderla.</p>
            ${barraFiltriComm('fp', programmate)}
            <div class="comm-lista">${programmate.map(c => rigaComm(c, false)).join('')}</div></div>`
            : '<div class="card tabella-vuota">Nessuna comunicazione programmata. Premi "Nuova comunicazione" per crearne una.</div>';

        const sezSospese = sospese.length ? `<div class="card" id="sez-sospese">
            <h2>Comunicazioni sospese (${sospese.length})</h2>
            <p class="hint" style="margin:-6px 0 12px;">Invii fermati: non partira nessuna mail finche non premi <strong>Riattiva</strong>. Riparte dalla prossima data utile.</p>
            ${barraFiltriComm('fs', sospese)}
            <div class="comm-lista">${sospese.map(c => rigaComm(c, true)).join('')}</div></div>`
            : '<div class="card tabella-vuota">Nessuna comunicazione sospesa.</div>';

        const sezBozze = bozze.length ? `<div class="card" id="sez-bozze">
            <h2>Comunicazioni in preparazione (${bozze.length})</h2>
            <p class="hint" style="margin:-6px 0 12px;">Salvate ma non ancora inviate ne programmate. Premi <strong>Apri</strong> per completarle e poi inviarle o programmarle.</p>
            <div class="tabella-wrap"><table class="dati a-schede"><thead><tr>
                <th>Contesto</th><th>Nome</th><th class="num">Destinatari</th><th>Creata da</th><th>Creata il</th><th></th>
            </tr></thead><tbody>` +
            bozze.map(c => `<tr>
                <td data-label="Contesto">${badgeContesto(c.contesto)}</td>
                <td class="cliente-cella" data-label="Nome">${esc(c.nome || c.oggetto || '(senza nome)')}${c.nome && c.oggetto ? '<div class="hint">' + esc(c.oggetto) + '</div>' : ''}</td>
                <td data-label="Destinatari">${(c.destinatari || []).length}${(c.gruppi && c.gruppi.length) ? ' <span class="hint">+ ' + esc(c.gruppi.map(nomeGruppo).join(', ')) + '</span>' : ''}</td>
                <td data-label="Creata da">${esc((c.creato && c.creato.da) || '')}</td>
                <td data-label="Creata il">${c.creato ? fmtDataOra(c.creato.il) : ''}</td>
                ${azioni(c)}
            </tr>`).join('') + `</tbody></table></div></div>`
            : '<div class="card tabella-vuota">Nessuna comunicazione in preparazione. Premi "Nuova comunicazione" per prepararne una.</div>';

        const sezInvii = invii.length ? `<div class="card" id="sez-invii">
            <h2>Invii effettuati (${invii.length})</h2>
            <div class="tabella-wrap"><table class="dati a-schede"><thead><tr>
                <th>Contesto</th><th>Nome</th><th>Inviata il</th><th class="num">Inviati</th><th>Esito</th><th>Tipo</th><th>Da</th>
            </tr></thead><tbody>` +
            invii.map((s, idx) => `<tr>
                <td data-label="Contesto">${badgeContesto(s.contesto)}</td>
                <td class="cliente-cella" data-label="Nome">${esc(s.nome || s.oggetto)}${s.nome && s.oggetto ? '<div class="hint">' + esc(s.oggetto) + '</div>' : ''}</td>
                <td data-label="Inviata il">${fmtDataOra(s.il)}</td>
                <td class="num" data-label="Inviati">${s.n || 0}</td>
                <td data-label="Esito">${s.falliti ? '<button type="button" class="btn btn-sm btn-danger inv-falliti" data-idx="' + idx + '">' + s.falliti + ' fallit' + (s.falliti === 1 ? 'o' : 'i') + '</button>' : '<span class="badge verde">tutti ok</span>'}</td>
                <td data-label="Tipo">${s.da === 'programmato' ? '<span class="badge legale">programmato</span>' : '<span class="badge neutro">manuale</span>'}</td>
                <td data-label="Da">${esc(s.da)}</td>
            </tr>`).join('') + `</tbody></table></div></div>`
            : '<div class="card tabella-vuota">Nessun invio effettuato finora.</div>';

        // ogni gruppo di comunicazioni ha la sua scheda (finestra) invece di stare tutto in sequenza
        const schede = [
            { k: 'programmate', nome: 'Programmate', n: programmate.length },
            { k: 'sospese', nome: 'Sospese', n: sospese.length },
            { k: 'bozze', nome: 'In preparazione', n: bozze.length },
            { k: 'invii', nome: 'Invii effettuati', n: invii.length }
        ];
        if (!schede.some(s => s.k === comuniTab)) comuniTab = 'programmate';
        const tabs = `<div class="tab-dest" style="margin-bottom:16px;">${schede.map(s => `<button class="tab-btn ${comuniTab === s.k ? 'attivo' : ''}" data-tab="${s.k}">${s.nome} (${s.n})</button>`).join('')}</div>`;

        const toggle = `<div class="toggle-vista">
            <button class="btn btn-sm ${comuniVista === 'elenco' ? 'btn-primary' : 'btn-secondary'}" data-vista="elenco">Elenco</button>
            <button class="btn btn-sm ${comuniVista === 'calendario' ? 'btn-primary' : 'btn-secondary'}" data-vista="calendario">Calendario</button>
        </div>`;
        const mostraToggle = comuniTab === 'programmate';
        const corpo = comuniTab === 'programmate' ? (comuniVista === 'calendario' ? renderCalendarioComunicazioni() : sezProgrammate)
            : comuniTab === 'sospese' ? sezSospese
                : comuniTab === 'bozze' ? sezBozze
                    : sezInvii;

        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Comunicazioni</h1>
                    <p class="descrizione">Prepara le mail ai destinatari (persone Revilaw o clienti), scegli il contesto, inviale subito o programmale.</p>
                </div>
                <div class="header-azioni">${mostraToggle ? toggle : ''}${seScr('<button class="btn btn-primary" id="btn-nuova-com">+ Nuova comunicazione</button>')}</div>
            </header>
            ${tabs}
            ${corpo}
            ${puoInviare ? '' : '<p class="descrizione" style="margin-top:10px;">L\'invio dal server e disponibile solo con l\'accesso protetto attivo; qui puoi comunque preparare le comunicazioni e salvarle in preparazione.</p>'}`;

        $vista().querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { comuniTab = b.dataset.tab; vistaComunicazioni(); }));
        $vista().querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => { comuniVista = b.dataset.vista; vistaComunicazioni(); }));
        { const bn = document.getElementById('btn-nuova-com'); if (bn) bn.addEventListener('click', () => modaleComunicazione(null)); }

        if (comuniTab === 'programmate' && comuniVista === 'calendario') {
            const pm = document.getElementById('cal-prec'), sm = document.getElementById('cal-succ'), ob = document.getElementById('cal-oggi-btn');
            if (pm) pm.addEventListener('click', () => { comuniMese = new Date(comuniMese.getFullYear(), comuniMese.getMonth() - 1, 1); vistaComunicazioni(); });
            if (sm) sm.addEventListener('click', () => { comuniMese = new Date(comuniMese.getFullYear(), comuniMese.getMonth() + 1, 1); vistaComunicazioni(); });
            if (ob) ob.addEventListener('click', () => { comuniMese = new Date(); vistaComunicazioni(); });
            $vista().querySelectorAll('.cal-chip').forEach(b => b.addEventListener('click', () => modaleComunicazione(b.dataset.id)));
            return;
        }

        // filtri delle liste a schede (programmate, sospese): ricerca + contesto + frequenza sui .comm-item
        const legaFiltriComm = (pfx, sezSel) => {
            const run = () => {
                const ce = document.getElementById(pfx + '-cerca'), coe = document.getElementById(pfx + '-contesto'), fre = document.getElementById(pfx + '-freq');
                const q = ce ? ce.value.toLowerCase() : '', ct = coe ? coe.value : '', fq = fre ? fre.value : '';
                let visti = 0, tot = 0;
                $vista().querySelectorAll(sezSel + ' .comm-item').forEach(it => {
                    tot++;
                    // contesto e frequenza sono filtri combinati: confronto "contiene" sul nome
                    const nomeCtx = it.dataset.contesto ? contesto(it.dataset.contesto).nome : '';
                    const ok = (!q || (it.dataset.cerca || '').includes(q))
                        && filtroCorrisponde(nomeCtx, ct)
                        && filtroCorrisponde(it.dataset.freq || '', fq);
                    it.style.display = ok ? '' : 'none';
                    if (ok) visti++;
                });
                const cnt = document.getElementById(pfx + '-conta');
                if (cnt) cnt.textContent = (visti < tot) ? (visti + ' di ' + tot) : '';
            };
            const s = document.getElementById(pfx + '-cerca'); if (s) s.addEventListener('input', run);
            [pfx + '-contesto', pfx + '-freq'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', run); });
        };
        legaFiltriComm('fp', '#sez-programmate');
        legaFiltriComm('fs', '#sez-sospese');

        // tabelle (in preparazione, invii): filtri per colonna + ricerca testuale + esporta CSV
        [['#sez-bozze', 'comunicazioni-in-preparazione'], ['#sez-invii', 'invii-effettuati']].forEach(([sel, nome]) => {
            const t = $vista().querySelector(sel + ' table.dati');
            if (t) attrezzaTabella(t, { nomeFile: nome, ricerca: true });
        });
        // dettaglio dei destinatari falliti di un invio
        $vista().querySelectorAll('.inv-falliti').forEach(b => b.addEventListener('click', () => {
            const s = invii[Number(b.dataset.idx)];
            if (!s) return;
            const dett = s.dettaglioFalliti || [];
            const righe = dett.length
                ? '<div class="tabella-wrap"><table class="dati"><thead><tr><th>Destinatario</th><th>Motivo</th></tr></thead><tbody>'
                    + dett.map(x => '<tr><td>' + esc(x.email || '') + '</td><td>' + esc(x.motivo || 'errore') + '</td></tr>').join('')
                    + '</tbody></table></div>'
                : '<p class="descrizione">Il numero di falliti e registrato, ma il dettaglio dei destinatari non e disponibile per questo invio.</p>';
            apriModale('<h2>Destinatari falliti (' + s.falliti + ')</h2>'
                + '<p class="descrizione" style="margin-bottom:10px;">' + esc(s.nome || s.oggetto || '') + ' &middot; ' + fmtDataOra(s.il) + ' &middot; inviati ' + (s.n || 0) + '</p>'
                + righe
                + '<div class="modale-azioni"><button class="btn btn-primary" id="m-ok">Chiudi</button></div>', { classe: 'larga' });
            document.getElementById('m-ok').addEventListener('click', chiudiModale);
        }));
        $vista().querySelectorAll('.c-apri').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); modaleComunicazione(b.dataset.id); }));
        $vista().querySelectorAll('.c-sospendi').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); sospendiComunicazione(b.dataset.id); }));
        $vista().querySelectorAll('.c-riattiva').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); riattivaComunicazione(b.dataset.id); }));
        $vista().querySelectorAll('.c-duplica').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); duplicaComunicazione(b.dataset.id); }));
        $vista().querySelectorAll('.c-elimina').forEach(b => b.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            if (!Auth.puoScrivere('comunicazioni')) return;
            const c = Comunicazioni.trova(b.dataset.id);
            apriModale(`<h2>Eliminare la comunicazione?</h2>
                <p>"${esc((c && c.oggetto) || '')}" verra rimossa per tutti.</p>
                <div class="modale-azioni"><button class="btn btn-ghost" id="m-annulla">Annulla</button><button class="btn btn-danger" id="m-conferma">Elimina</button></div>`);
            document.getElementById('m-annulla').addEventListener('click', chiudiModale);
            document.getElementById('m-conferma').addEventListener('click', () => {
                Comunicazioni.elimina(b.dataset.id);
                Audit.registra(Auth.utenteCorrente, 'Comunicazione eliminata', 'comunicazione', b.dataset.id, (c && c.oggetto) || null, null);
                chiudiModale(); toast('Comunicazione eliminata.', 'verde'); vistaComunicazioni();
            });
        }));
    }

    /* Sospende una comunicazione programmata: ferma il cron (attiva:false) e la sposta
       tra le sospese, senza perdere la programmazione (si puo riattivare). */
    function sospendiComunicazione(id) {
        if (!Auth.puoScrivere('comunicazioni')) return;
        const c = Comunicazioni.trova(id);
        if (!c || c.stato !== 'programmata') return;
        c.sospesa = true;
        c.programmazione = Object.assign({}, c.programmazione, { attiva: false });
        Comunicazioni.salvaUna(c);
        Audit.registra(Auth.utenteCorrente, 'Comunicazione sospesa', 'comunicazione', c.id, c.oggetto || null, null);
        toast('Comunicazione sospesa: non partiranno altri invii.', 'verde');
        vistaComunicazioni();
    }

    /* Riattiva una comunicazione sospesa: riparte dalla prossima occorrenza futura,
       cosi non genera una raffica di invii arretrati. */
    function riattivaComunicazione(id) {
        if (!Auth.puoScrivere('comunicazioni')) return;
        const c = Comunicazioni.trova(id);
        if (!c || c.stato !== 'programmata') return;
        const p = c.programmazione || {};
        const ora = Date.now();
        let next = p.prossimoInvio || 0;
        const ricorrente = p.frequenza && p.frequenza !== 'unica';
        if (ricorrente && next) {
            let guard = 0;
            while (next <= ora && guard < 600) { const n = prossimaDataMs(next, p.frequenza); if (n == null) break; next = n; guard++; }
            if (p.fine && next > p.fine) { toast('La serie e gia oltre la data di fine: non ci sono altri invii da programmare.', 'ambra'); return; }
        } else if (next && next <= ora) {
            toast('La data dell\'invio e gia passata: apri la comunicazione e imposta una nuova data prima di riattivarla.', 'ambra'); return;
        }
        c.sospesa = false;
        c.programmazione = Object.assign({}, p, { attiva: true, prossimoInvio: next });
        Comunicazioni.salvaUna(c);
        Audit.registra(Auth.utenteCorrente, 'Comunicazione riattivata', 'comunicazione', c.id, c.oggetto || null,
            [{ campo: 'Prossimo invio', prima: '', dopo: fmtDataOra(next) }]);
        toast('Comunicazione riattivata. Prossimo invio: ' + fmtDataOra(next) + '.', 'verde');
        vistaComunicazioni();
    }

    /* Duplica una comunicazione: crea una copia modificabile tra quelle "in preparazione"
       (nessun invio parte da sola) e apre subito il compositore. */
    function duplicaComunicazione(id) {
        if (!Auth.puoScrivere('comunicazioni')) return;
        const orig = Comunicazioni.trova(id);
        if (!orig) return;
        const copia = JSON.parse(JSON.stringify(orig));
        copia.id = uid();
        copia.nome = ((orig.nome && orig.nome.trim()) ? orig.nome.trim() : (orig.oggetto || 'Comunicazione')) + ' (copia)';
        copia.stato = 'bozza';
        copia.sospesa = false;
        copia.invii = [];
        delete copia.inviata;
        // la copia non deve poter partire da sola: niente stato attivo e nessuna data d'invio ereditata (si reimposta a mano)
        if (copia.programmazione) copia.programmazione = Object.assign({}, copia.programmazione, { attiva: false, ultimoInvio: null, prossimoInvio: null });
        copia.creato = { da: Auth.utenteCorrente.email, il: Date.now() };
        Comunicazioni.salvaUna(copia);
        Audit.registra(Auth.utenteCorrente, 'Comunicazione duplicata', 'comunicazione', copia.id, copia.oggetto || null,
            [{ campo: 'Copiata da', prima: '', dopo: orig.oggetto || orig.nome || orig.id }]);
        toast('Copia creata tra le comunicazioni in preparazione. Aprila e modificala.', 'verde');
        vistaComunicazioni();
        modaleComunicazione(copia.id);
    }

    function modaleComunicazione(id) {
        const puoScr = Auth.puoScrivere('comunicazioni');   // in sola lettura si apre solo per vedere
        const c = id ? Comunicazioni.trova(id) : null;
        const inviata = c && c.stato === 'inviata';
        // destinatari SCELTI singolarmente (persone/clienti/manuali); i vecchi record
        // avevano solo "destinatari": lo usiamo come base individuale
        const dest = new Set((c && c.destinatariManuali) || (c && c.destinatari) || []);
        const gruppiIniziali = new Set((c && c.gruppi) || []);
        let utentiAbilitati = []; // caricati dal cloud per risolvere il gruppo "Utenti abilitati"
        const reEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
        const prog = (c && c.programmazione) || null;
        const perDateLocal = ts => {
            if (!ts) return '';
            const d = new Date(ts), z = n => String(n).padStart(2, '0');
            return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
        };
        // il campo "quando" e' ora solo una DATA: la converto in timestamp all'inizio di quel giorno (ora locale)
        const tsDaData = q => { if (!q) return NaN; const t = new Date(q + 'T00:00:00').getTime(); return isNaN(t) ? NaN : t; };
        // AREA 1 - Persone Revilaw con email, con i ruoli per il filtro
        const conMail = Persone.tutte().filter(p => p.email && p.attivo && !p.eliminato)
            .sort((a, b) => (a.nome + (a.nomeProprio || '')).localeCompare(b.nome + (b.nomeProprio || '')));
        const emailPersone = new Set(conMail.map(p => p.email.toLowerCase()));
        // AREA 2 - Clienti: contatti (email1/email2) dagli incarichi, dedup per email
        const contattiCliente = [];
        const vistiCli = new Set();
        Incarichi.visibili().forEach(i => {
            [i.email1, i.email2].forEach(em => {
                const e = String(em || '').trim().toLowerCase();
                if (!reEmail.test(e) || vistiCli.has(e)) return;
                vistiCli.add(e);
                contattiCliente.push({ cliente: i.cliente || '', email: e, tipo: i.tipo || '', area: i.area || '', regione: i.regione || '', stato: i.stato || '' });
            });
        });
        contattiCliente.sort((a, b) => a.cliente.localeCompare(b.cliente));
        // per classificare i destinatari gia' salvati serve conoscere TUTTE le email cliente,
        // non solo quelle visibili: altrimenti l'email di un cliente fuori regione, non
        // riconosciuta come "cliente", finirebbe in chiaro nel campo "Altri indirizzi".
        const emailTuttiClienti = new Set();
        Incarichi.tutti().forEach(i => [i.email1, i.email2].forEach(em => { const e = String(em || '').trim().toLowerCase(); if (reEmail.test(e)) emailTuttiClienti.add(e); }));
        // indirizzi liberi = destinatari che non sono ne persone ne clienti (di qualunque regione)
        const altri = Array.from(dest).filter(e => { const x = String(e).toLowerCase(); return !emailPersone.has(x) && !emailTuttiClienti.has(x); });
        const opzCli = campo => Array.from(new Set(contattiCliente.map(c => c[campo]).filter(Boolean))).sort();
        const tipiCli = opzCli('tipo'), areeCli = opzCli('area'), regioniCli = opzCli('regione'), statiCli = opzCli('stato');
        // filtro combinato compatto (senza label esterna: sta nella barra dei filtri destinatari)
        const selFiltro = (id, etichetta, valori) => valori.length
            ? `<input type="search" id="${id}" list="${id}-dl" placeholder="${esc(etichetta)}"><datalist id="${id}-dl">${valori.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>`
            : '';
        // contenuto iniziale dell'editor: i nuovi record salvano HTML; i vecchi (testo semplice) si convertono
        const testoInizialeHtml = c ? (c.formato === 'html' ? (c.testo || '') : esc(c.testo || '').replace(/\n/g, '<br>')) : '';

        apriModale(`
            ${inviata ? `<p class="descrizione">Inviata il ${fmtDataOra(c.inviata.il)} a ${c.inviata.n} destinatari da ${esc(c.inviata.da || '')}. Puoi modificarla e reinviarla.</p>` : ''}
            <div class="comp-scelta" id="c-card-dest">
                <div class="comp-scelta-testa">
                    <div class="comp-scelta-tit">Destinatari</div>
                    <button type="button" class="btn btn-sm btn-secondary" id="c-btn-dest">Scegli i destinatari</button>
                </div>
                <div class="comp-scelta-riep" id="c-riep-dest"></div>
            </div>
            <div class="griglia-2">
                <div class="campo"><label>Contesto</label><select id="c-contesto">${CONTESTI.map(x => `<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select></div>
                <div class="campo"><label>Nome della comunicazione</label><input id="c-nome" value="${esc((c && c.nome) || '')}" placeholder="es. Promemoria scadenze trimestrali"><div class="hint">Etichetta interna per riconoscerla in elenco e nel calendario.</div></div>
            </div>
            <div class="campo"><label>Oggetto della mail</label><input id="c-oggetto" value="${esc((c && c.oggetto) || '')}" placeholder="Oggetto che vedra il destinatario"></div>
            <div class="campo">
                <div class="rte-intest">
                    <label style="margin:0;">Messaggio</label>
                    <button type="button" class="btn btn-sm btn-secondary" id="c-anteprima-btn">Anteprima (nuova finestra)</button>
                </div>
                <div class="rte-barra">
                    <button type="button" class="rte-btn" data-cmd="bold" title="Grassetto"><strong>G</strong></button>
                    <button type="button" class="rte-btn" data-cmd="italic" title="Corsivo"><em>C</em></button>
                    <button type="button" class="rte-btn" data-cmd="underline" title="Sottolineato"><span style="text-decoration:underline;">S</span></button>
                    <span class="rte-sep"></span>
                    <button type="button" class="rte-btn" data-cmd="insertUnorderedList" title="Elenco puntato">&bull; Elenco</button>
                    <button type="button" class="rte-btn" data-cmd="insertOrderedList" title="Elenco numerato">1. Elenco</button>
                    <span class="rte-sep"></span>
                    <button type="button" class="rte-btn" data-cmd="createLink" title="Inserisci collegamento">Link</button>
                    <button type="button" class="rte-btn" data-cmd="removeFormat" title="Rimuovi formattazione">Pulisci</button>
                </div>
                <div id="c-testo" class="rte-editor" contenteditable="true" data-ph="Scrivi qui il testo della mail. Usa la barra sopra per grassetto, corsivo, elenchi...">${testoInizialeHtml}</div>
                <div class="var-chips"><span class="hint" style="margin-right:4px;">Variabili (clic per inserire):</span>${VARIABILI_MAIL.map(v => '<button type="button" class="chip-var' + (v.chiave === 'periodo' ? ' chip-var-periodo' : '') + '" data-var="' + v.chiave + '" title="' + esc(v.desc) + '">{' + v.chiave + '}</button>').join('')}</div>
                <div class="hint"><strong>{nome} {cognome} {incarichi}</strong> cambiano per ogni destinatario: se le usi, ognuno riceve una mail personalizzata; altrimenti un unico invio in copia nascosta. <strong>{incarichi}</strong> nel testo diventa una tabella (cliente, resp. qualita, resp. incarico).</div>
                <div class="spiega-periodo">
                    <div class="sp-tit">Come funziona {periodo}</div>
                    <p>Negli <strong>invii programmati ricorrenti</strong> scrivi <code>{periodo}</code> nell'oggetto o nel testo: ad <strong>ogni invio</strong> viene sostituito in automatico con il periodo di riferimento, calcolato dalla frequenza scelta e dalla data di quell'invio.</p>
                    <ul>
                        <li><strong>Trimestrale</strong> &rarr; &ldquo;primo trimestre 2026&rdquo;, &ldquo;secondo trimestre 2026&rdquo;, terzo, quarto&hellip;</li>
                        <li><strong>Mensile</strong> &rarr; &ldquo;gennaio 2026&rdquo;, &ldquo;febbraio 2026&rdquo;&hellip;</li>
                        <li><strong>Annuale</strong> &rarr; &ldquo;2026&rdquo;, &ldquo;2027&rdquo;&hellip;</li>
                    </ul>
                    <p>Cosi una sola comunicazione ricorrente genera da sola l'oggetto e il testo giusti per ogni periodo. Nell'invio immediato <code>{periodo}</code> resta vuoto, perche non c'e una frequenza.</p>
                </div>
            </div>
            <div class="comp-scelta" id="c-card-prog">
                <div class="comp-scelta-testa">
                    <div class="comp-scelta-tit">Quando parte</div>
                    <button type="button" class="btn btn-sm btn-secondary" id="c-btn-prog">Programma l'invio</button>
                </div>
                <div class="comp-scelta-riep" id="c-riep-prog"></div>
            </div>
            <div class="comp-esito" id="c-esito-invio"></div>
            <div id="c-riposo" class="nascosto">
            <div id="c-vista-dest">
            <div class="campo">
                <label>Destinatari <span class="hint" id="c-conta"></span></label>
                <div class="tab-dest">
                    <button type="button" class="tab-btn attivo" data-pane="pane-persone">Persone Revilaw</button>
                    <button type="button" class="tab-btn" data-pane="pane-clienti">Clienti</button>
                    <button type="button" class="tab-btn" data-pane="pane-altri">Altri indirizzi</button>
                </div>
                <div class="tab-pane" id="pane-persone">
                    <div class="gruppi-dinamici">
                        <div class="gruppi-titolo">Gruppi (dinamici): chi verrà aggiunto in futuro entra da solo negli invii successivi in programma</div>
                        <div class="gruppi-chip">${GRUPPI_MAIL.map(g => `<label class="chip-gruppo"><input type="checkbox" class="c-gruppo" value="${g.id}" ${gruppiIniziali.has(g.id) ? 'checked' : ''}> ${esc(g.nome)}</label>`).join('')}</div>
                    </div>
                    <div class="filtri-dest">
                        <input id="cp-cerca" type="search" placeholder="Oppure scegli singole persone: filtra per cognome, nome, email...">
                        <input type="search" id="cp-ruolo" list="cp-ruolo-dl" placeholder="Tutti i ruoli"><datalist id="cp-ruolo-dl"><option value="Responsabile qualita"></option><option value="Responsabile incarico (procuratori)"></option><option value="Team di revisione"></option><option value="Coordinatore territoriale"></option><option value="Vice coordinatore territoriale"></option></datalist>
                    </div>
                    <div class="sel-azioni"><button type="button" class="btn btn-sm btn-ghost" data-selpane="cp-lista" data-seltutti="1">Seleziona tutti (filtrati)</button><button type="button" class="btn btn-sm btn-ghost" data-selpane="cp-lista" data-seltutti="0">Deseleziona</button><span class="hint" id="cp-conta"></span></div>
                    <div class="lista-destinatari" id="cp-lista">
                        ${conMail.length ? conMail.map(p => `<label class="riga-dest" data-ruoli="${(p.qualita ? 'qualita ' : '') + (p.respIncarico ? 'respIncarico ' : '') + (p.team ? 'team ' : '') + (p.coordinatore ? 'coordinatore ' : '') + (p.viceCoordinatore ? 'vice' : '')}"><input type="checkbox" value="${esc(p.email)}" ${dest.has(String(p.email).toLowerCase()) ? 'checked' : ''}><span>${esc(p.nome)}${p.nomeProprio ? ' ' + esc(p.nomeProprio) : ''} <span class="riga-dest-mail">${esc(p.email)}</span></span></label>`).join('') : '<div class="hint" style="padding:8px;">Nessuna persona con email in anagrafica.</div>'}
                    </div>
                </div>
                <div class="tab-pane nascosto" id="pane-clienti">
                    <div class="filtri-dest">
                        <input id="cc-cerca" type="search" placeholder="Filtra per cliente o email...">
                        ${selFiltro('cc-tipo', 'Tutti i tipi', tipiCli)}
                        ${selFiltro('cc-area', 'Tutte le aree', areeCli)}
                        ${selFiltro('cc-regione', 'Tutte le regioni', regioniCli)}
                        ${selFiltro('cc-stato', 'Tutti gli stati', statiCli)}
                    </div>
                    <div class="sel-azioni"><button type="button" class="btn btn-sm btn-ghost" data-selpane="cc-lista" data-seltutti="1">Seleziona tutti (filtrati)</button><button type="button" class="btn btn-sm btn-ghost" data-selpane="cc-lista" data-seltutti="0">Deseleziona</button><span class="hint" id="cc-conta"></span></div>
                    <div class="lista-destinatari" id="cc-lista">
                        ${contattiCliente.length ? contattiCliente.map(cc => `<label class="riga-dest" data-tipo="${esc(cc.tipo)}" data-area="${esc(cc.area)}" data-regione="${esc(cc.regione)}" data-stato="${esc(cc.stato)}"><input type="checkbox" value="${esc(cc.email)}" ${dest.has(cc.email) ? 'checked' : ''}><span>${esc(cc.cliente)} <span class="riga-dest-mail">${esc(cc.email)}</span></span></label>`).join('') : '<div class="hint" style="padding:8px;">Nessun cliente con email negli incarichi.</div>'}
                    </div>
                </div>
                <div class="tab-pane nascosto" id="pane-altri">
                    <textarea id="c-altri" rows="3" placeholder="Un indirizzo per riga o separati da virgola: mario.rossi@esempio.it, ...">${esc(altri.join(', '))}</textarea>
                </div>
            </div>
            </div><!-- /c-vista-dest -->
            <div id="c-vista-prog">
            <div class="campo">
                <label style="display:flex;gap:8px;align-items:center;font-weight:600;cursor:pointer;"><input type="checkbox" id="c-prog" style="width:auto;" ${prog ? 'checked' : ''}> Programma l'invio (una volta o periodico)</label>
                <div id="c-prog-box" class="${prog ? '' : 'nascosto'}" style="margin-top:8px;">
                    <div class="griglia-2">
                        <div class="campo"><label>Frequenza</label><select id="c-freq">
                            <option value="unica">Una volta</option>
                            <option value="settimanale">Ogni settimana</option>
                            <option value="mensile">Ogni mese</option>
                            <option value="trimestrale">Ogni trimestre</option>
                            <option value="annuale">Ogni anno</option>
                        </select></div>
                        <div class="campo"><label>Giorno del (primo) invio</label><input type="date" id="c-quando" value="${prog ? perDateLocal(prog.prossimoInvio) : ''}"><div class="hint">Parte quella mattina (verso le 8:00). Conta il giorno, non l'ora.</div></div>
                    </div>
                    <div id="c-ricorrenti" class="${prog && prog.frequenza && prog.frequenza !== 'unica' ? '' : 'nascosto'}">
                        <div class="griglia-2">
                            <div class="campo"><label>Termine</label><select id="c-fine-tipo">
                                <option value="senza">Senza fine (finche non la fermi)</option>
                                <option value="data">Fino a una data</option>
                            </select></div>
                            <div class="campo nascosto" id="c-fine-data-box"><label>Fino al</label><input type="date" id="c-fine-data" value="${prog && prog.fine ? perDateLocal(prog.fine) : ''}"></div>
                        </div>
                        <p class="hint" style="margin:2px 0 0;">Per mettere il periodo nell'oggetto o nel testo, usa la variabile <strong>{periodo}</strong> (i chip sopra il messaggio).</p>
                    </div>
                    <p class="hint" id="c-prog-riepilogo" style="font-weight:600;color:var(--blu-700);"></p>
                    <div id="c-oggetto-riepilogo" class="anteprima-periodi"></div>
                    <p class="hint">Gli invii programmati partono dal server <strong>una volta al giorno, la mattina presto</strong> (verso le 8:00): quindi conta il <strong>giorno</strong> scelto, non l'ora esatta. Se scegli oggi e l'invio del mattino e gia avvenuto, parte domani mattina. La comunicazione resta modificabile fino all'invio.</p>
                </div>
            </div>
            </div><!-- /c-vista-prog -->
            </div><!-- /c-riposo -->
            <div class="msg-errore hidden" id="c-errore"></div>
            <div class="modale-azioni">
                <button class="btn btn-ghost" id="c-annulla">${puoScr ? 'Annulla' : 'Chiudi'}</button>
                ${puoScr ? '<button class="btn btn-secondary" id="c-bozza">Salva in preparazione</button><button class="btn btn-primary" id="c-invia">Invia</button>' : '<span class="hint" style="align-self:center;">Sola lettura: non puoi modificare o inviare questa comunicazione.</span>'}
            </div>`, { classe: 'larga', finestra: true, titolo: inviata ? 'Comunicazione inviata' : (c ? 'Modifica comunicazione' : 'Nuova comunicazione') });

        const $ = x => document.getElementById(x);
        $('c-contesto').value = (c && c.contesto) || 'generale';
        // anteprima della mail: si apre in una NUOVA FINESTRA del browser
        const CAMPIONE_VAR = { email: 'mario.rossi@esempio.it', nome: 'Mario', cognome: 'Rossi', incarichi: 'Alpha S.r.l., Beta S.p.A.', incarichiHtml: tabellaIncarichiHtml([{ cliente: 'Alpha S.r.l.', qualita: 'Bianchi', respIncarico: 'Verdi' }, { cliente: 'Beta S.p.A.', qualita: 'Neri', respIncarico: 'Gialli' }]) };
        const editor = $('c-testo');
        // separatore paragrafo coerente (Blink/Gecko), placeholder robusto (non dipende da :empty), selezione salvata (iOS)
        try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (_) { }
        const aggiornaPh = () => editor.classList.toggle('rte-vuoto', !editor.textContent.trim());
        let selSalvata = null;
        const salvaSel = () => { const s = window.getSelection(); if (s && s.rangeCount && editor.contains(s.anchorNode)) selSalvata = s.getRangeAt(0).cloneRange(); };
        const ripristinaSel = () => { if (selSalvata) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(selSalvata); } };
        editor.addEventListener('keyup', salvaSel);
        editor.addEventListener('mouseup', salvaSel);
        editor.addEventListener('input', () => { aggiornaPh(); salvaSel(); });
        aggiornaPh();
        const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        // anteprima in una nuova finestra (o overlay in pagina se i popup sono bloccati, es. browser in-app iOS)
        const mostraAnteprimaInPagina = (doc) => {
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;inset:0;top:0;right:0;bottom:0;left:0;background:rgba(10,40,68,0.55);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px;';
            ov.innerHTML = '<div style="background:#fff;border-radius:8px;overflow:hidden;width:760px;max-width:100%;height:80vh;display:flex;flex-direction:column;box-shadow:var(--ombra-lg);">'
                + '<div style="background:#0A2844;color:#fff;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;font-size:0.95rem;"><span>Anteprima mail</span><button type="button" class="ov-x" style="background:transparent;border:none;color:#fff;font-size:16px;cursor:pointer;line-height:1;">&#10005;</button></div>'
                + '<iframe title="Anteprima mail" style="flex:1 1 auto;border:none;width:100%;"></iframe></div>';
            document.body.appendChild(ov);
            ov.querySelector('iframe').srcdoc = doc;
            const chiudi = () => ov.remove();
            ov.querySelector('.ov-x').addEventListener('click', chiudi);
            ov.addEventListener('click', e => { if (e.target === ov) chiudi(); });
        };
        const apriAnteprima = () => {
            const oggRaw = $('c-oggetto').value, testoRaw = editor.innerHTML;
            const usaPersonal = haVariabili(oggRaw) || haVariabili(testoRaw);
            const usaPeriodo = /\{periodo\}/.test(oggRaw + '\n' + testoRaw);
            let periodoAnt = '';
            if (usaPeriodo) {
                const progOn = $('c-prog') && $('c-prog').checked;
                const q = $('c-quando') ? $('c-quando').value : '', ts = tsDaData(q), fq = $('c-freq') ? $('c-freq').value : 'unica';
                periodoAnt = (progOn && fq !== 'unica' && !isNaN(ts)) ? etichettaPeriodo(fq, ts) : 'primo trimestre 2026';
            }
            const oggFinale = esc(applicaVariabili(sostituisciPeriodo(oggRaw, periodoAnt), CAMPIONE_VAR).trim() || '(nessun oggetto)');
            const corpoHtml = editor.textContent.trim() ? applicaVariabiliHtml(sostituisciPeriodo(testoRaw, esc(periodoAnt)), CAMPIONE_VAR) : '<span style="color:#94A3B8;">(nessun testo)</span>';
            const nota = usaPersonal ? 'Anteprima con dati di esempio (Mario Rossi). Ogni destinatario ricevera la sua versione.' : (usaPeriodo ? 'Anteprima con un periodo di esempio; {periodo} cambia a ogni invio programmato.' : '');
            const doc = '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anteprima mail</title><base target="_blank">'
                + '<style>body{margin:0;background:#F1F5F9;font-family:Inter,system-ui,sans-serif;color:#1E293B;padding:24px;}.wrap{max-width:680px;margin:0 auto;}.nota{font-size:13px;color:#164068;background:#E8EFF6;border:1px solid #CFE0EE;border-radius:6px;padding:8px 12px;margin-bottom:14px;}.card{background:#fff;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;}.intest{background:#F1F5F9;border-bottom:1px solid #E2E8F0;padding:12px 16px;font-size:13px;color:#475569;}.intest strong{color:#0A2844;}.corpo{padding:18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1E293B;}.corpo p,.corpo div{margin:0 0 8px;}.corpo ul,.corpo ol{margin:0 0 8px 22px;}</style></head><body><div class="wrap">'
                + (nota ? '<div class="nota">' + esc(nota) + '</div>' : '')
                + '<div class="card"><div class="intest"><div><strong>Da:</strong> Revilaw S.p.A. &lt;noreply@nextgenerationbusiness.it&gt;</div><div><strong>Oggetto:</strong> ' + oggFinale + '</div></div>'
                + '<div class="corpo">' + corpoHtml + FIRMA_MAIL_HTML + '</div></div></div></body></html>';
            let w = null;
            try { w = window.open('', 'rv-anteprima-mail', 'width=760,height=820,scrollbars=yes,resizable=yes'); } catch (_) { w = null; }
            if (!w) { mostraAnteprimaInPagina(doc); return; }  // popup bloccato (browser in-app iOS, PWA...): overlay in pagina
            try { w.document.open(); w.document.write(doc); w.document.close(); w.focus(); }
            catch (_) { try { w.close(); } catch (e) { } mostraAnteprimaInPagina(doc); }  // finestra navigata altrove/cross-origin
        };
        const btnAnt = $('c-anteprima-btn');
        if (btnAnt) btnAnt.addEventListener('click', apriAnteprima);
        // barra di formattazione: i pulsanti non rubano il focus (mousedown preventDefault) + selezione ripristinata (iOS)
        document.querySelectorAll('.rte-btn').forEach(b => {
            b.addEventListener('mousedown', e => { e.preventDefault(); salvaSel(); });
            b.addEventListener('click', () => {
                editor.focus(); ripristinaSel();
                const cmd = b.dataset.cmd;
                if (cmd === 'createLink') {
                    const url = prompt('Indirizzo del collegamento (https://...)'); if (!url) return;
                    const sel = window.getSelection();
                    if (sel && sel.isCollapsed) document.execCommand('insertHTML', false, '<a href="' + escHtml(url) + '">' + escHtml(url) + '</a>');
                    else document.execCommand('createLink', false, url);
                } else if (cmd === 'removeFormat') {
                    document.execCommand('removeFormat', false, null);
                    document.execCommand('unlink', false, null);
                    try { if (document.queryCommandState('insertUnorderedList')) document.execCommand('insertUnorderedList', false, null); if (document.queryCommandState('insertOrderedList')) document.execCommand('insertOrderedList', false, null); } catch (_) { }
                } else document.execCommand(cmd, false, null);
                aggiornaPh(); salvaSel();
            });
        });
        // incolla come testo semplice (evita HTML sporco da Word/pagine web), con fallback se execCommand fallisce
        editor.addEventListener('paste', e => {
            e.preventDefault();
            const t = ((e.clipboardData || window.clipboardData).getData('text/plain') || '');
            if (!document.execCommand('insertText', false, t)) {
                const s = window.getSelection();
                if (s && s.rangeCount) { const r = s.getRangeAt(0); r.deleteContents(); const n = document.createTextNode(t); r.insertNode(n); r.setStartAfter(n); r.collapse(true); s.removeAllRanges(); s.addRange(r); }
            }
            aggiornaPh();
        });
        // inserimento variabili al cursore del campo attivo (oggetto = input, messaggio = editor)
        let ultimoCampoVar = 'c-testo';
        $('c-oggetto').addEventListener('focus', () => { ultimoCampoVar = 'c-oggetto'; });
        editor.addEventListener('focus', () => { ultimoCampoVar = 'c-testo'; });
        document.querySelectorAll('.chip-var').forEach(b => {
            b.addEventListener('mousedown', e => { e.preventDefault(); salvaSel(); });
            b.addEventListener('click', () => {
                const token = '{' + b.dataset.var + '}';
                if (ultimoCampoVar === 'c-testo') { editor.focus(); ripristinaSel(); document.execCommand('insertText', false, token); aggiornaPh(); salvaSel(); }
                else { const el = $('c-oggetto'), s = el.selectionStart != null ? el.selectionStart : el.value.length, e2 = el.selectionEnd != null ? el.selectionEnd : el.value.length; el.value = el.value.slice(0, s) + token + el.value.slice(e2); el.focus(); try { el.setSelectionRange(s + token.length, s + token.length); } catch (_) { } el.dispatchEvent(new Event('input', { bubbles: true })); }
            });
        });
        // schede destinatari
        document.querySelectorAll('.tab-dest .tab-btn').forEach(b => b.addEventListener('click', () => {
            document.querySelectorAll('.tab-dest .tab-btn').forEach(x => x.classList.toggle('attivo', x === b));
            ['pane-persone', 'pane-clienti', 'pane-altri'].forEach(p => $(p).classList.toggle('nascosto', p !== b.dataset.pane));
        }));
        // filtro Persone (ricerca + ruolo)
        const filtraPersone = () => {
            const t = ($('cp-cerca').value || '').trim().toLowerCase();
            const r = ($('cp-ruolo').value || '').trim();
            // il ruolo si digita per nome: si risalgono le chiavi dei ruoli il cui nome contiene il testo
            const MAPPA_RUOLI = [['qualita', 'Responsabile qualita'], ['respIncarico', 'Responsabile incarico (procuratori)'], ['team', 'Team di revisione'], ['coordinatore', 'Coordinatore territoriale'], ['vice', 'Vice coordinatore territoriale']];
            // il nome scelto per intero dal suggerimento vale ESATTO: "Coordinatore territoriale"
            // non deve prendere anche il vice (il cui nome lo contiene). Il testo parziale filtra per "contiene".
            const esatte = r ? MAPPA_RUOLI.filter(([, n]) => n.toLowerCase() === r.toLowerCase()) : [];
            const chiaviOk = r ? (esatte.length ? esatte : MAPPA_RUOLI.filter(([, n]) => filtroCorrisponde(n, r))).map(([k]) => k) : null;
            $('cp-lista').querySelectorAll('.riga-dest').forEach(row => {
                const okT = !t || row.textContent.toLowerCase().includes(t);
                const tokens = (row.dataset.ruoli || '').split(' ');
                const okR = !chiaviOk || chiaviOk.some(k => tokens.includes(k));
                row.style.display = (okT && okR) ? '' : 'none';
            });
        };
        $('cp-cerca').addEventListener('input', filtraPersone);
        $('cp-ruolo').addEventListener('input', filtraPersone);
        // filtro Clienti (ricerca + tipo/area/regione/stato): filtri combinati, confronto "contiene"
        const filtraClienti = () => {
            const t = ($('cc-cerca').value || '').trim().toLowerCase();
            const val = idf => { const el = $(idf); return el ? el.value : ''; };
            const ft = val('cc-tipo'), fa = val('cc-area'), fr = val('cc-regione'), fs = val('cc-stato');
            $('cc-lista').querySelectorAll('.riga-dest').forEach(row => {
                const ok = (!t || row.textContent.toLowerCase().includes(t))
                    && filtroCorrisponde(row.dataset.tipo, ft) && filtroCorrisponde(row.dataset.area, fa)
                    && filtroCorrisponde(row.dataset.regione, fr) && filtroCorrisponde(row.dataset.stato, fs);
                row.style.display = ok ? '' : 'none';
            });
        };
        ['cc-cerca', 'cc-tipo', 'cc-area', 'cc-regione', 'cc-stato'].forEach(idf => {
            const el = $(idf); if (el) el.addEventListener('input', filtraClienti);
        });

        const gruppiSel = () => Array.from(document.querySelectorAll('.c-gruppo:checked')).map(i => i.value);
        // destinatari scelti SINGOLARMENTE (persone/clienti spuntati + indirizzi a mano): statici
        const manuali = () => {
            const daP = Array.from($('cp-lista').querySelectorAll('input:checked')).map(i => i.value.trim().toLowerCase());
            const daC = Array.from($('cc-lista').querySelectorAll('input:checked')).map(i => i.value.trim().toLowerCase());
            const liberi = $('c-altri').value.split(/[\n,;]+/).map(s => s.trim().toLowerCase()).filter(e => reEmail.test(e));
            return Array.from(new Set(daP.concat(daC, liberi)));
        };
        // destinatari EFFETTIVI adesso = gruppi risolti sui dati attuali + scelte singole
        const tuttiDestinatari = () => {
            const set = risolviGruppiMail(gruppiSel(), utentiAbilitati);
            manuali().forEach(e => set.add(e));
            return Array.from(set);
        };
        const spuntati = idLista => Array.from($(idLista).querySelectorAll('input:checked')).length;
        let aggiornaScelte = () => {}; // definita piu sotto (dopo chkProg/leggiProg); qui solo un segnaposto
        const aggiornaConta = () => {
            const g = gruppiSel();
            $('c-conta').textContent = '(' + tuttiDestinatari().length + ' destinatari' + (g.length ? ' - include i gruppi: ' + g.map(nomeGruppo).join(', ') : '') + ')';
            $('cp-conta').textContent = spuntati('cp-lista') + ' selezionati';
            $('cc-conta').textContent = spuntati('cc-lista') + ' selezionati';
            aggiornaScelte();
        };
        $('cp-lista').addEventListener('change', aggiornaConta);
        $('cc-lista').addEventListener('change', aggiornaConta);
        $('c-altri').addEventListener('input', aggiornaConta);
        document.querySelectorAll('.c-gruppo').forEach(cb => cb.addEventListener('change', aggiornaConta));
        // seleziona tutti / deseleziona (solo le righe filtrate visibili)
        document.querySelectorAll('[data-selpane]').forEach(b => b.addEventListener('click', () => {
            const on = b.dataset.seltutti === '1';
            $(b.dataset.selpane).querySelectorAll('.riga-dest').forEach(row => {
                if (row.style.display === 'none') return;
                const cb = row.querySelector('input[type="checkbox"]');
                if (cb) cb.checked = on;
            });
            aggiornaConta();
        }));
        // carica gli utenti abilitati (per risolvere il gruppo "Utenti abilitati")
        if (Cloud.attivo && typeof Cloud.listaUtenti === 'function') {
            Cloud.listaUtenti().then(u => { utentiAbilitati = u || []; aggiornaConta(); }).catch(() => { });
        }
        aggiornaConta();

        const componiRecord = () => ({
            id: (c && c.id) || uid(),
            contesto: $('c-contesto').value,
            nome: $('c-nome').value.trim(),
            oggetto: $('c-oggetto').value.trim(),
            testo: $('c-testo').textContent.trim() ? $('c-testo').innerHTML.trim() : '',
            formato: 'html',                      // il messaggio e ora HTML (editor formattato)
            gruppi: gruppiSel(),                  // gruppi dinamici (risolti all'invio)
            destinatariManuali: manuali(),        // scelte singole statiche
            destinatari: tuttiDestinatari(),      // snapshot risolto ora (per invio immediato e conteggio)
            stato: (c && c.stato) || 'bozza',
            creato: (c && c.creato) || { da: Auth.utenteCorrente.email, il: Date.now() },
            // storico degli invii effettuati (migra i vecchi record che avevano solo "inviata")
            invii: (c && c.invii) || (c && c.inviata ? [{ il: c.inviata.il, n: c.inviata.n, da: c.inviata.da }] : [])
        });
        const mostraErr = m => { const e = $('c-errore'); e.textContent = m; e.classList.remove('hidden'); try { e.scrollIntoView({ block: 'nearest' }); } catch (_) { try { e.scrollIntoView(); } catch (e2) { } } };

        // programmazione: mostra/nascondi opzioni e adatta l'etichetta del pulsante
        const chkProg = $('c-prog');
        if (prog && prog.frequenza) $('c-freq').value = prog.frequenza;
        if (prog && prog.fine) $('c-fine-tipo').value = 'data';
        const relabel = () => { const b = $('c-invia'); if (b) b.textContent = chkProg.checked ? 'Programma l\'invio' : 'Invia subito'; };
        const leggiProg = () => {
            if (!chkProg.checked) return { prog: null };
            const q = $('c-quando').value;
            const t = tsDaData(q);
            if (!q || isNaN(t)) return { errore: 'Imposta il giorno del (primo) invio.' };
            const oggi0 = new Date(); oggi0.setHours(0, 0, 0, 0);
            if (t < oggi0.getTime()) return { errore: 'Il giorno scelto e gia passato: scegli oggi o una data futura.' };
            const freq = $('c-freq').value, ricorrente = freq !== 'unica';
            let fine = null;
            if (ricorrente && $('c-fine-tipo').value === 'data') {
                const fd = $('c-fine-data').value;
                if (!fd) return { errore: 'Imposta la data di fine, oppure scegli "Senza fine".' };
                fine = new Date(fd + 'T23:59:59').getTime();
                if (fine < t) return { errore: 'La data di fine e precedente al primo invio.' };
            }
            return { prog: { attiva: true, frequenza: freq, prossimoInvio: t, fine: fine, periodoNelOggetto: false } };
        };
        const aggiornaRiepilogo = () => {
            const freq = $('c-freq').value, ricorrente = freq !== 'unica';
            $('c-ricorrenti').classList.toggle('nascosto', !ricorrente);
            $('c-fine-data-box').classList.toggle('nascosto', $('c-fine-tipo').value !== 'data');
            const q = $('c-quando').value, t = tsDaData(q);
            const attivo = chkProg.checked && q && !isNaN(t);
            const lp = attivo ? leggiProg() : null;
            $('c-prog-riepilogo').textContent = (lp && lp.prog) ? descriviProgrammazione(lp.prog) : '';
            // anteprima di cosa diventa {periodo} a ogni invio (max 4 occorrenze)
            const box = $('c-oggetto-riepilogo');
            const usaPeriodo = /\{periodo\}/.test($('c-oggetto').value + '\n' + $('c-testo').innerHTML);
            if (attivo && ricorrente && usaPeriodo) {
                const fineTs = (lp && lp.prog) ? lp.prog.fine : null;
                const db = ms => { const d = new Date(ms), z = n => String(n).padStart(2, '0'); return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear(); };
                const righe = [];
                let tt = t, guard = 0;
                while (righe.length < 4 && guard < 60) {
                    if (fineTs && tt > fineTs) break;
                    righe.push('<div class="ap-per-riga"><span class="ap-per-data">' + db(tt) + '</span><strong>' + esc(etichettaPeriodo(freq, tt)) + '</strong></div>');
                    const nx = prossimaDataMs(tt, freq);
                    if (nx == null) break;
                    tt = nx; guard++;
                }
                box.innerHTML = '<div class="ap-per-tit">Il {periodo} diventa, a ogni invio:</div>' + righe.join('')
                    + (fineTs ? '<div class="ap-per-nota">poi termina (fino al ' + db(fineTs) + ')</div>' : (righe.length >= 4 ? '<div class="ap-per-nota">…e cosi via</div>' : ''));
            } else { box.innerHTML = ''; }
            aggiornaScelte();
        };
        // Destinatari e Programmazione stanno in due VERE finestre sopra questa: il loro pezzo di DOM
        // vive parcheggiato (nascosto) in #c-riposo e viene spostato dentro la finestra quando la apri,
        // cosi' mantiene valori e listener. Alla chiusura torna al suo posto e si aggiorna il riepilogo.
        const apriFinestraScelta = (idNodo, titolo) => {
            const nodo = $(idNodo), riposo = $('c-riposo');
            if (!nodo || !riposo) return;
            // se non e' parcheggiato, una finestra lo sta gia' mostrando: non aprirne una seconda
            // (col tasto Invio sul pulsante gia' a fuoco si arriverebbe qui una seconda volta)
            if (nodo.parentElement !== riposo) return;
            const sf = apriSottoFinestra({
                titolo: titolo, classe: 'larga', ok: 'Fatto',
                allaChiusura: () => {
                    // riprendilo solo se e' ancora qui dentro: mai strapparlo a un'altra finestra
                    if (nodo.parentElement === sf.corpo) riposo.appendChild(nodo);
                    aggiornaScelte();
                }
            });
            sf.corpo.appendChild(nodo);
        };
        // errore: lo mostra nella finestra principale e mette in evidenza la card da sistemare
        const mostraErrSu = (idCard, m) => {
            ['c-card-dest', 'c-card-prog'].forEach(x => { const el = $(x); if (el) el.classList.remove('comp-scelta-errore'); });
            if (idCard) { const el = $(idCard); if (el) el.classList.add('comp-scelta-errore'); }
            mostraErr(m);
        };
        // appena l'utente sistema qualcosa l'errore va via: altrimenti resta una card rossa
        // accanto a un riepilogo che dice il contrario
        const nascondiErr = () => {
            ['c-card-dest', 'c-card-prog'].forEach(x => { const el = $(x); if (el) el.classList.remove('comp-scelta-errore'); });
            const e = $('c-errore'); if (e) { e.textContent = ''; e.classList.add('hidden'); }
        };
        // riepilogo dei destinatari: gruppi + quanti per scheda + totale
        const riepDestHtml = () => {
            const g = gruppiSel(), nP = spuntati('cp-lista'), nC = spuntati('cc-lista');
            // "Altri" conta solo gli indirizzi non gia' spuntati tra persone/clienti, altrimenti
            // le righe sommerebbero piu' del totale (che invece e' deduplicato)
            const gia = new Set(Array.from($('cp-lista').querySelectorAll('input:checked')).map(i => i.value.trim().toLowerCase())
                .concat(Array.from($('cc-lista').querySelectorAll('input:checked')).map(i => i.value.trim().toLowerCase())));
            const nA = $('c-altri').value.split(/[\n,;]+/).map(s => s.trim().toLowerCase())
                .filter(e => reEmail.test(e) && !gia.has(e)).length;
            const tot = tuttiDestinatari().length;
            const r = [];
            if (g.length) r.push('<div class="riep-r"><span class="riep-et">Gruppi</span><span>' + esc(g.map(nomeGruppo).join(', ')) + '</span></div>');
            if (nP) r.push('<div class="riep-r"><span class="riep-et">Persone Revilaw</span><span>' + nP + '</span></div>');
            if (nC) r.push('<div class="riep-r"><span class="riep-et">Clienti</span><span>' + nC + '</span></div>');
            if (nA) r.push('<div class="riep-r"><span class="riep-et">Altri indirizzi</span><span>' + nA + '</span></div>');
            if (!r.length) return '<div class="riep-vuoto">Nessun destinatario scelto</div>';
            r.push('<div class="riep-tot">' + tot + (tot === 1 ? ' destinatario in tutto' : ' destinatari in tutto')
                + (g.length ? ' &middot; i gruppi si aggiornano a ogni invio' : '') + '</div>');
            return r.join('');
        };
        // riepilogo di quando parte
        const riepProgHtml = () => {
            if (!chkProg.checked) return '<div class="riep-r"><strong>Invio subito</strong></div><div class="riep-tot">Parte appena premi "Invia subito".</div>';
            const lp = leggiProg();
            if (!lp || !lp.prog) return '<div class="riep-vuoto">Programmazione da completare</div>';
            return '<div class="riep-r"><strong>' + esc(descriviProgrammazione(lp.prog)) + '</strong></div>'
                + '<div class="riep-tot">Parte la mattina del giorno scelto (verso le 8:00).</div>';
        };
        aggiornaScelte = () => {
            nascondiErr();
            const nDest = tuttiDestinatari().length, nGruppi = gruppiSel().length;
            const dstr = nDest + (nDest === 1 ? ' destinatario' : ' destinatari');
            const gstr = nGruppi + (nGruppi === 1 ? ' gruppo' : ' gruppi') + ' (destinatari presi a ogni invio)';
            const rd = $('c-riep-dest'); if (rd) rd.innerHTML = riepDestHtml();
            const rp = $('c-riep-prog'); if (rp) rp.innerHTML = riepProgHtml();
            const bd = $('c-btn-dest'); if (bd) bd.textContent = (nDest || nGruppi) ? 'Modifica i destinatari' : 'Scegli i destinatari';
            const bp = $('c-btn-prog'); if (bp) bp.textContent = chkProg.checked ? 'Modifica la programmazione' : 'Programma l\'invio';
            const esito = $('c-esito-invio');
            if (!esito) return;
            if (chkProg.checked) {
                const lp = leggiProg();
                const descr = (lp && lp.prog) ? descriviProgrammazione(lp.prog) : 'da completare';
                if (nDest === 0 && nGruppi === 0) { esito.className = 'comp-esito vuoto'; esito.innerHTML = 'Invio <strong>PROGRAMMATO</strong> (' + esc(descr) + '), ma <strong>nessun destinatario</strong>: apri "Destinatari" e scegli persone o un gruppo.'; }
                else { esito.className = 'comp-esito prog'; esito.innerHTML = 'Invio <strong>PROGRAMMATO</strong>: ' + esc(descr) + ' &middot; ' + (nDest ? dstr : gstr) + '.'; }
            } else {
                if (nDest === 0) { esito.className = 'comp-esito vuoto'; esito.innerHTML = '<strong>Nessun destinatario</strong> selezionato: apri "Destinatari" e scegline almeno uno prima di inviare.'; }
                else { esito.className = 'comp-esito subito'; esito.innerHTML = 'Invio <strong>SUBITO</strong> a ' + dstr + ', appena premi "Invia subito".'; }
            }
        };
        if ($('c-btn-dest')) $('c-btn-dest').addEventListener('click', () => apriFinestraScelta('c-vista-dest', 'Destinatari'));
        if ($('c-btn-prog')) $('c-btn-prog').addEventListener('click', () => apriFinestraScelta('c-vista-prog', 'Programma l\'invio'));
        chkProg.addEventListener('change', () => { $('c-prog-box').classList.toggle('nascosto', !chkProg.checked); relabel(); aggiornaRiepilogo(); });
        ['c-freq', 'c-quando', 'c-fine-tipo', 'c-fine-data', 'c-oggetto', 'c-testo'].forEach(idw => {
            const el = $(idw); if (el) el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', aggiornaRiepilogo);
        });
        relabel(); aggiornaRiepilogo();

        $('c-annulla').addEventListener('click', chiudiModale);
        if ($('c-bozza')) $('c-bozza').addEventListener('click', () => {
            const rec = componiRecord();
            if (!rec.oggetto && !rec.testo && !rec.destinatari.length) { mostraErrSu(null, 'Non c\'e nulla da salvare: aggiungi almeno l\'oggetto, il testo o un destinatario.'); return; }
            // In preparazione: la programmazione si salva SEMPRE come non attiva e puo essere incompleta
            // (la data si puo mettere dopo). Non parte finche non premi Programma, che valida tutto.
            let progBozza = null;
            if (chkProg.checked) {
                const tB = tsDaData($('c-quando').value);
                let fineB = null;
                if ($('c-freq').value !== 'unica' && $('c-fine-tipo').value === 'data' && $('c-fine-data').value) fineB = new Date($('c-fine-data').value + 'T23:59:59').getTime();
                progBozza = { attiva: false, frequenza: $('c-freq').value, prossimoInvio: isNaN(tB) ? null : tB, fine: fineB };
            }
            rec.programmazione = progBozza;
            rec.stato = inviata ? 'inviata' : 'bozza';   // "bozza" = in preparazione: salvata ma non parte finche non premi Programma/Invia
            Comunicazioni.salvaUna(rec);
            Audit.registra(Auth.utenteCorrente, 'Comunicazione salvata in preparazione', 'comunicazione', rec.id, rec.oggetto || null, null);
            chiudiModale(); toast('Salvata tra le comunicazioni in preparazione.', 'verde'); vistaComunicazioni();
        });

        const btnInvia = $('c-invia');
        // conAttesa rimette sul pulsante l'etichetta fotografata al clic: se nel frattempo e'
        // cambiata la programmazione, quella e' vecchia. Qui la si rimette giusta (solo se e'
        // ancora questo pulsante: se la finestra si e' chiusa o riaperta, non toccare nulla).
        const rilabella = () => { if ($('c-invia') === btnInvia) relabel(); };
        if (btnInvia) btnInvia.addEventListener('click', () => conAttesa(btnInvia, async () => {
            const rec = componiRecord();
            if (!rec.oggetto) { mostraErrSu(null, 'Inserisci l\'oggetto.'); return; }
            if (!rec.testo) { mostraErrSu(null, 'Scrivi il testo del messaggio.'); return; }
            const haGruppi = rec.gruppi && rec.gruppi.length;
            const lp = leggiProg();
            if (lp.errore) { mostraErrSu('c-card-prog', lp.errore); return; }
            // per una programmata basta aver scelto un gruppo (anche se ora e vuoto): si popolera all'invio
            if (!rec.destinatari.length && !(lp.prog && haGruppi)) { mostraErrSu('c-card-dest', 'Seleziona almeno un destinatario o un gruppo.'); return; }

            if (lp.prog) {
                // PROGRAMMA: non invia ora, sara' il server a inviare (una volta al giorno, la mattina).
                // La validazione del giorno (oggi o futuro) e' gia in leggiProg.
                if (!Cloud.attivo) { mostraErr('La programmazione richiede l\'accesso protetto attivo.'); return; }
                rec.programmazione = lp.prog;
                rec.stato = 'programmata';
                Comunicazioni.salvaUna(rec);
                Audit.registra(Auth.utenteCorrente, 'Comunicazione programmata', 'comunicazione', rec.id, rec.oggetto,
                    [{ campo: 'Primo invio', prima: '', dopo: fmtGiorno(lp.prog.prossimoInvio) }, { campo: 'Frequenza', prima: '', dopo: lp.prog.frequenza }]);
                chiudiModale();
                toast('Comunicazione programmata dal ' + fmtGiorno(lp.prog.prossimoInvio) + ' (parte la mattina).', 'verde');
                vistaComunicazioni();
                return;
            }

            // INVIO IMMEDIATO
            if (!Cloud.attivo) { mostraErr('L\'invio richiede l\'accesso protetto attivo. Puoi comunque salvarla in preparazione.'); return; }
            rec.programmazione = null;
            Comunicazioni.salvaUna(rec); // salva prima: non si perde nulla se l'invio fallisce
            const esito = await Cloud.inviaComunicazione(rec.oggetto, rec.testo, datiDestinatari(rec.destinatari), rec.formato);
            const falliti = (esito && esito.falliti) || [];
            if (!esito.ok) { mostraErr('Invio non riuscito: ' + esito.msg + (falliti.length ? ' (' + falliti.length + ' destinatari rifiutati)' : '')); return; }
            const ora = Date.now();
            rec.stato = 'inviata';
            const voceInv = { il: ora, n: esito.inviati, da: Auth.utenteCorrente.email };
            if (falliti.length) { voceInv.falliti = falliti.length; voceInv.dettaglioFalliti = falliti.slice(0, 100); }
            rec.inviata = Object.assign({}, voceInv, { da: Auth.utenteCorrente.email });
            rec.invii = (rec.invii || []).concat([voceInv]);
            Comunicazioni.salvaUna(rec);
            Audit.registra(Auth.utenteCorrente, 'Comunicazione inviata', 'comunicazione', rec.id, rec.oggetto,
                [{ campo: 'Destinatari', prima: '', dopo: String(esito.inviati) }].concat(falliti.length ? [{ campo: 'Falliti', prima: '', dopo: String(falliti.length) }] : []));
            chiudiModale();
            toast(falliti.length
                ? ('Inviata a ' + esito.inviati + ' destinatari, ' + falliti.length + ' falliti (vedi "Invii effettuati").')
                : ('Comunicazione inviata a ' + esito.inviati + ' destinatari.'), falliti.length ? 'ambra' : 'verde');
            vistaComunicazioni();
        }, { testo: 'Attendere…' }).then(rilabella, rilabella));
    }

    /* =========================================================
       VISTA: REGISTRO MODIFICHE
    ========================================================= */
    const ENTITA_LABEL = { incarico: 'Incarico', fattura: 'Fatturazione', persona: 'Persona', comunicazione: 'Comunicazione', utente: 'Utente/accesso', sistema: 'Sistema' };
    const ENTITA_CLASSE = { incarico: 'legale', fattura: 'ambra', persona: 'volontaria', comunicazione: 'collegio', utente: 'neutro', sistema: 'neutro' };
    function badgeEntita(ent) { return '<span class="badge ' + (ENTITA_CLASSE[ent] || 'neutro') + '">' + esc(ENTITA_LABEL[ent] || ent || 'altro') + '</span>'; }

    // Dettaglio completo di una voce del registro: riferimento risolto, modifiche
    // integrali (senza troncamento) e apertura dell'incarico collegato.
    function modaleDettaglioAudit(v) {
        if (!v) return;
        const ent = v.entita;
        let incId = null;
        if (ent === 'incarico' && v.rif) incId = v.rif;
        else if (ent === 'fattura' && v.rif) incId = String(v.rif).split('|')[0]; // chiave rata: incId|anno|...
        const inc = incId ? Incarichi.trova(incId) : null;
        let rifHtml = esc(v.cliente || (ent === 'utente' ? (v.rif || '') : '') || '(nessuno)');
        if (inc) rifHtml = esc(inc.cliente) + ' <span class="hint">(' + esc(nomeTipo(inc.tipo)) + ')</span>';
        const dettHtml = (Array.isArray(v.dettagli) && v.dettagli.length)
            ? '<div class="tabella-wrap"><table class="dati"><thead><tr><th>Campo</th><th>Prima</th><th>Dopo</th></tr></thead><tbody>'
                + v.dettagli.map(d => '<tr><td><strong>' + esc(d.campo) + '</strong></td><td class="reg-da">' + esc(d.prima) + '</td><td class="reg-a">' + esc(d.dopo) + '</td></tr>').join('')
                + '</tbody></table></div>'
            : (v.dettagli ? '<p>' + esc(v.dettagli) + '</p>' : '<p class="hint">Nessuna modifica di campo registrata per questa voce.</p>');
        apriModale(`<h2>Dettaglio del registro</h2>
            <div class="riepilogo-blocco">
                ${rigaRiepilogo('Data e ora', fmtDataOra(v.ts))}
                <div class="riepilogo-riga"><span class="etichetta">Ambito</span><span class="valore">${badgeEntita(ent)}</span></div>
                ${rigaRiepilogo('Azione', v.azione)}
                ${rigaRiepilogo('Autore', v.utente)}
                <div class="riepilogo-riga"><span class="etichetta">Riferimento</span><span class="valore">${rifHtml}</span></div>
            </div>
            <h4 style="margin:14px 0 8px; color:var(--blu-500); text-transform:uppercase; letter-spacing:0.05em; font-size:0.82rem;">Modifiche</h4>
            ${dettHtml}
            <div class="modale-azioni">${inc ? '<button class="btn btn-secondary" id="md-apri-inc">Apri incarico</button>' : ''}<button class="btn btn-primary" id="md-chiudi">Chiudi</button></div>`, { classe: 'larga' });
        document.getElementById('md-chiudi').addEventListener('click', chiudiModale);
        const ap = document.getElementById('md-apri-inc');
        if (ap) ap.addEventListener('click', () => { chiudiModale(); naviga('dettaglio', { id: incId }); });
    }

    function vistaRegistro() {
        const log = Store.leggi(CHIAVI.audit, []);
        // filtro regione: un ruolo limitato non deve vedere nel registro le voci che nominano
        // un cliente fuori dalla sua regione (nome cliente, codice fiscale, compensi, ecc.).
        // Le voci senza cliente (accessi, sistema, persone, comunicazioni) restano visibili.
        const regCons = Auth.regioniConsentite();
        let base = log;
        if (regCons) {
            const visCli = new Set(Incarichi.visibili().map(i => String(i.cliente || '').toLowerCase()));
            base = log.filter(v => { const cli = String(v.cliente || '').toLowerCase(); return !cli || visCli.has(cli); });
        }
        const utenti = Array.from(new Set(base.map(v => v.utente))).sort();

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
                    <option value="comunicazione">Comunicazioni</option>
                    <option value="utente">Utenti e accessi</option>
                    <option value="sistema">Sistema</option>
                </select></div>
                <div class="campo"><label>Dal</label><input type="date" id="r-dal"></div>
                <div class="campo"><label>Al</label><input type="date" id="r-al"></div>
                <div class="barra-tabella-azioni"><button type="button" class="btn btn-sm btn-secondary" id="r-esporta">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Esporta CSV</button></div>
            </div>
            <div id="registro-corpo"></div>`;

        const disegna = () => {
            const t = document.getElementById('r-testo').value.toLowerCase();
            const u = document.getElementById('r-utente').value;
            const e = document.getElementById('r-entita').value;
            const dalV = document.getElementById('r-dal').value, alV = document.getElementById('r-al').value;
            const dal = dalV ? new Date(dalV + 'T00:00:00').getTime() : null;
            const al = alV ? new Date(alV + 'T23:59:59').getTime() : null;
            const testoVoce = v => ((v.cliente || '') + ' ' + (v.azione || '') + ' ' + (v.utente || '') + ' ' + (Array.isArray(v.dettagli) ? v.dettagli.map(d => d.campo + ' ' + d.prima + ' ' + d.dopo).join(' ') : (v.dettagli || ''))).toLowerCase();
            let lista = base;
            if (t) lista = lista.filter(v => testoVoce(v).includes(t));
            if (u) lista = lista.filter(v => v.utente === u);
            if (e) lista = lista.filter(v => v.entita === e);
            if (dal != null) lista = lista.filter(v => (v.ts || 0) >= dal);
            if (al != null) lista = lista.filter(v => (v.ts || 0) <= al);
            const totale = lista.length;
            lista = lista.slice(0, 300);
            document.getElementById('registro-corpo').innerHTML = lista.length ?
                (totale > 300 ? '<p class="hint" style="margin-bottom:8px;">Mostrate le 300 voci piu recenti su ' + totale + '. Restringi con i filtri per vedere le altre.</p>' : '') +
                `<p class="hint" style="margin-bottom:8px;">Clic su una riga per il dettaglio completo (riferimento, modifiche integrali, apertura dell'incarico).</p>
                <div class="tabella-wrap"><table class="dati"><thead><tr>
                    <th>Data e ora</th><th>Ambito</th><th>Autore</th><th>Azione</th><th>Riferimento</th><th>Dettagli</th>
                </tr></thead><tbody>` +
                lista.map((v, i) => `<tr class="cliccabile" data-idx="${i}">
                    <td data-label="Data e ora">${fmtDataOra(v.ts)}</td>
                    <td data-label="Ambito">${badgeEntita(v.entita)}</td>
                    <td data-label="Autore">${esc(v.utente)}</td>
                    <td data-label="Azione"><strong>${esc(v.azione)}</strong></td>
                    <td data-label="Riferimento">${esc(v.cliente || (v.entita === 'utente' ? v.rif : '') || '')}</td>
                    <td data-label="Dettagli">${Array.isArray(v.dettagli) ? '<ul class="reg-diff">' + v.dettagli.map(d => '<li><span class="reg-campo">' + esc(d.campo) + '</span> <span class="reg-da">' + esc(troncaTesto(d.prima, 44)) + '</span> <span class="reg-fr">&rarr;</span> <span class="reg-a">' + esc(troncaTesto(d.dopo, 44)) + '</span></li>').join('') + '</ul>' : esc(v.dettagli || '')}</td>
                </tr>`).join('') + '</tbody></table></div>'
                : '<div class="card tabella-vuota">Nessuna voce nel registro con questi filtri.</div>';
            document.querySelectorAll('#registro-corpo tr[data-idx]').forEach(tr =>
                tr.addEventListener('click', () => modaleDettaglioAudit(lista[Number(tr.dataset.idx)])));
        };
        ['r-testo', 'r-utente', 'r-entita', 'r-dal', 'r-al'].forEach(id => document.getElementById(id).addEventListener('input', disegna));
        document.getElementById('r-esporta').addEventListener('click', () =>
            esportaTabellaCsv(document.querySelector('#registro-corpo table.dati'), 'registro-modifiche'));
        disegna();
    }

    /* =========================================================
       VISTA: RUOLI E PERMESSI (solo amministratore)
    ========================================================= */
    // etichetta di un ruolo per id (compresi i ruoli personalizzati)
    function nomeRuolo(id) {
        if (id === 'admin') return 'Amministratore';
        const r = Ruoli.trova(id);
        return r ? r.nome : (id || 'Senza ruolo');
    }
    // <option> per assegnare un ruolo a un utente (sel = ruolo attualmente scelto)
    function opzioniRuolo(sel) {
        return Ruoli.tutti().map(r => '<option value="' + esc(r.id) + '"' + (r.id === sel ? ' selected' : '') + '>' + esc(r.nome) + '</option>').join('');
    }
    /* Selettore "dall'anagrafica" nel modale di creazione utente: si sceglie una persona
       gia' in Persone (con email) e nome + email si compilano da soli, restando modificabili. */
    function selettorePersonaUtente() {
        const conEmail = Persone.tutte().filter(p => p.attivo && !p.eliminato && p.email)
            .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
        if (!conEmail.length) return '';
        return '<div class="campo"><label>Scegli dall\'anagrafica (facoltativo)</label>'
            + '<select id="m-da-persona"><option value="">- compila a mano -</option>'
            + conEmail.map(p => '<option value="' + esc(p.id) + '">' + esc(p.nome + (p.nomeProprio ? ' ' + p.nomeProprio : '') + ' - ' + p.email) + '</option>').join('')
            + '</select><div class="hint">Scegliendo una persona, nome ed email si compilano da soli.</div></div>';
    }
    function collegaSelettorePersona() {
        const sel = document.getElementById('m-da-persona');
        if (!sel) return;
        sel.addEventListener('change', () => {
            const p = Persone.tutte().find(x => x.id === sel.value);
            if (!p) return;
            const n = document.getElementById('m-nome'), e = document.getElementById('m-email');
            if (n) n.value = (p.nomeProprio ? p.nomeProprio + ' ' : '') + p.nome;
            if (e) e.value = p.email || '';
        });
    }
    // quanti utenti (in locale) hanno un dato ruolo: per avvisare prima di cancellarlo
    function utentiConRuolo(id) {
        try { return Auth.utenti().filter(u => u.ruolo === id).length; } catch (e) { return 0; }
    }

    function vistaRuoli() {
        if (!Auth.eAdmin() && !Auth.eProprietario()) { naviga('dashboard'); return; }
        const ruoli = Ruoli.tutti().map(Ruoli.normalizza);
        const riepSez = r => SEZIONI_RUOLO.map(s => {
            const liv = r.sezioni[s.id] || 'no';
            const cls = liv === 'scrittura' ? 'verde' : (liv === 'lettura' ? 'ambra' : 'neutro');
            return '<span class="badge ' + cls + '">' + esc(s.nome) + ': ' + LIVELLI_SEZIONE[liv] + '</span>';
        }).join(' ');
        $vista().innerHTML = `
            <header>
                <div>
                    <h1>Ruoli e permessi</h1>
                    <p class="descrizione">Per ogni ruolo scegli cosa vede e cosa puo modificare in ciascuna sezione. Il ruolo si assegna agli utenti dalla sezione "Utenti".</p>
                </div>
                <div class="header-azioni"><button class="btn btn-primary" id="btn-nuovo-ruolo">+ Nuovo ruolo</button></div>
            </header>
            <div class="avviso-ruoli">Questi permessi tengono ognuno nella sua parte e prevengono gli errori, ma valgono dentro il programma: non sono una cassaforte. I dati piu delicati restano protetti dalle regole del server.</div>
            <div class="ruoli-griglia">` +
            ruoli.map(r => `<div class="ruolo-card">
                <div class="ruolo-testa">
                    <h2>${esc(r.nome)}${r.sistema ? ' <span class="badge ambra">di sistema</span>' : (r.builtin ? ' <span class="badge neutro">predefinito</span>' : '')}</h2>
                    <div class="ruolo-azioni">
                        <button class="btn btn-sm btn-secondary r-mod" data-id="${esc(r.id)}">${r.id === 'admin' || r.sistema ? 'Dettagli' : 'Modifica'}</button>
                        ${r.id === 'admin' || r.sistema ? '' : '<button class="btn btn-sm btn-danger r-del" data-id="' + esc(r.id) + '">Elimina</button>'}
                    </div>
                </div>
                <div class="ruolo-sez">${riepSez(r)}</div>
                ${r.sistema ? '<div class="ruolo-reg">Sempre in sola visualizzazione, solo gli incarichi delle <strong>sue regioni</strong>: la Regione della sua scheda in Persone piu le eventuali altre regioni coordinate indicate li.</div>' : ''}
            </div>`).join('') +
            `</div>`;
        document.getElementById('btn-nuovo-ruolo').addEventListener('click', () => modaleRuolo(null));
        $vista().querySelectorAll('.r-mod').forEach(b => b.addEventListener('click', () => modaleRuolo(b.dataset.id)));
        $vista().querySelectorAll('.r-del').forEach(b => b.addEventListener('click', () => conAttesa(b, async () => {
            const r = Ruoli.trova(b.dataset.id); if (!r || r.id === 'admin' || r.sistema) return;
            // conteggio utenti col ruolo: in cloud gli utenti stanno su Firestore, non in locale
            let n = 0, contato = true;
            if (Cloud.attivo) {
                try { const u = await Cloud.listaUtenti(); n = (u || []).filter(x => x.ruolo === r.id).length; }
                catch (e) { contato = false; }
            } else { n = utentiConRuolo(r.id); }
            const avviso = !contato ? 'Non e stato possibile contare gli utenti con questo ruolo: verifica a mano che nessuno lo usi prima di eliminarlo.'
                : (n ? '<strong>' + n + (n === 1 ? ' utente ha' : ' utenti hanno') + '</strong> questo ruolo: riassegnalo prima, altrimenti resteranno senza accesso finche l\'amministratore non interviene.'
                    : 'Nessun utente risulta avere questo ruolo.');
            apriModale(`<h2>Eliminare il ruolo "${esc(r.nome)}"?</h2>
                <p>${avviso}</p>
                <div class="modale-azioni"><button class="btn btn-ghost" id="m-annulla">Annulla</button><button class="btn btn-danger" id="m-conferma">Elimina</button></div>`);
            document.getElementById('m-annulla').addEventListener('click', chiudiModale);
            document.getElementById('m-conferma').addEventListener('click', () => {
                Ruoli.salva(Ruoli.tutti().filter(x => x.id !== r.id));
                Audit.registra(Auth.utenteCorrente, 'Ruolo eliminato', 'sistema', null, null, [{ campo: 'Ruolo', prima: r.nome, dopo: 'eliminato' }]);
                chiudiModale(); toast('Ruolo eliminato.', 'verde'); vistaRuoli();
            });
        })));
    }

    function modaleRuolo(id) {
        const esistente = id ? Ruoli.normalizza(Ruoli.trova(id) || { id: id }) : null;
        // non modificabili: l'amministratore (ha sempre tutto) e il Coordinatore territoriale
        // (profilo di sistema: sola visualizzazione, regione dalla scheda in Persone)
        const bloccato = !!(esistente && (esistente.id === 'admin' || esistente.sistema));
        const r = esistente || { id: '', nome: '', builtin: false, sezioni: sezioniTutte('no') };
        apriModale(`<h2>${esistente ? (bloccato ? esc(r.nome) : 'Modifica ruolo') : 'Nuovo ruolo'}</h2>
            ${bloccato ? '' : `<div class="campo"><label>Nome del ruolo</label><input id="r-nome" value="${esc(r.nome)}" placeholder="es. Referente Nord"></div>`}
            ${bloccato ? (esistente.id === 'admin'
                ? '<p class="descrizione">L\'amministratore ha sempre accesso completo a tutte le sezioni: non e modificabile.</p>'
                : '<p class="descrizione">' + esc(esistente.nome) + ' e un ruolo di sistema, non modificabile: vede tutte le sezioni in <strong>sola visualizzazione</strong> e SOLO gli incarichi delle sue regioni. Le regioni sono quelle della sua scheda in <strong>Persone</strong> (agganciata all\'utente tramite email): la <strong>Regione</strong> della scheda piu le eventuali <strong>altre regioni coordinate</strong> spuntate li. Senza alcuna regione, non vede alcun incarico.</p>') : `
            <h3 style="margin:14px 0 6px;font-size:0.95rem;">Cosa vede e cosa puo toccare</h3>
            <div class="ruolo-sezgrid">${SEZIONI_RUOLO.map(s => `<div class="campo"><label>${esc(s.nome)}</label>
                <select data-sez="${s.id}">${Object.keys(LIVELLI_SEZIONE).map(liv => '<option value="' + liv + '"' + ((r.sezioni[s.id] || 'no') === liv ? ' selected' : '') + '>' + LIVELLI_SEZIONE[liv] + '</option>').join('')}</select></div>`).join('')}</div>`}
            <div class="msg-errore hidden" id="r-errore"></div>
            <div class="modale-azioni">
                ${bloccato ? '<button class="btn btn-primary" id="m-annulla">Chiudi</button>'
                    : '<button class="btn btn-ghost" id="m-annulla">Annulla</button><button class="btn btn-primary" id="m-salva">Salva</button>'}
            </div>`, { classe: 'larga' });
        document.getElementById('m-annulla').addEventListener('click', chiudiModale);
        if (document.getElementById('m-salva')) document.getElementById('m-salva').addEventListener('click', () => {
            if (bloccato) { chiudiModale(); return; }
            const err = document.getElementById('r-errore');
            const mostra = m => { err.textContent = m; err.classList.remove('hidden'); };
            const nome = document.getElementById('r-nome').value.trim();
            if (!nome) { mostra('Dai un nome al ruolo.'); return; }
            const lista = Ruoli.tutti();
            let nid = r.id;
            if (!nid) {
                const base = nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'ruolo';
                nid = base; let k = 2; while (nid === 'admin' || lista.some(x => x.id === nid)) { nid = base + '-' + k; k++; }
            }
            if (lista.some(x => x.id !== nid && String(x.nome).trim().toLowerCase() === nome.toLowerCase())) { mostra('Esiste gia un ruolo con questo nome.'); return; }
            const sezioni = {};
            SEZIONI_RUOLO.forEach(s => { const sel = document.querySelector('[data-sez="' + s.id + '"]'); const v = sel ? sel.value : 'no'; sezioni[s.id] = (v === 'lettura' || v === 'scrittura') ? v : 'no'; });
            const nuovo = { id: nid, nome: nome, builtin: !!(esistente && esistente.builtin), sezioni: sezioni };
            const idx = lista.findIndex(x => x.id === nid);
            if (idx >= 0) lista[idx] = nuovo; else lista.push(nuovo);
            Ruoli.salva(lista);
            Audit.registra(Auth.utenteCorrente, esistente ? 'Ruolo modificato' : 'Ruolo creato', 'sistema', null, null, [{ campo: 'Ruolo', prima: esistente ? esistente.nome : 'vuoto', dopo: nome }]);
            chiudiModale(); toast('Ruolo salvato.', 'verde'); vistaRuoli();
        });
    }

    /* =========================================================
       VISTA: UTENTI (solo amministratore)
    ========================================================= */
    function vistaUtenti() {
        if (!Auth.eAdmin() && !Auth.eProprietario()) { naviga('dashboard'); return; }
        if (Cloud.attivo) { vistaUtentiCloud(); return; }
        const utenti = Auth.utenti();

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
                <td class="cliente-cella" data-label="Nome">${esc(u.nome)}</td>
                <td data-label="Email">${esc(u.email)}</td>
                <td data-label="Ruolo">${u.email === Auth.utenteCorrente.email ? esc(nomeRuolo(u.ruolo)) : '<select class="u-ruolo" data-email="' + esc(u.email) + '">' + opzioniRuolo(u.ruolo) + '</select>'}</td>
                <td data-label="Stato">${u.attivo ? (u.hash ? '<span class="badge verde">attivo</span>' : '<span class="badge ambra">in attesa di prima password</span>') : '<span class="badge rosso">disabilitato</span>'}${u.mustChange && u.hash ? ' <span class="badge neutro">cambio password richiesto</span>' : ''}</td>
                <td data-label="Ultimo accesso">${u.ultimoAccesso ? fmtDataOra(u.ultimoAccesso) : ''}</td>
                <td data-label="" style="white-space:nowrap;">
                    <button class="btn btn-sm btn-secondary u-reimposta" data-email="${esc(u.email)}">Reimposta password</button>
                    ${u.email !== Auth.utenteCorrente.email ? `<button class="btn btn-sm ${u.attivo ? 'btn-danger' : 'btn-secondary'} u-attiva" data-email="${esc(u.email)}">${u.attivo ? 'Disabilita' : 'Riabilita'}</button>` : ''}
                </td>
            </tr>`).join('') +
            `</tbody></table></div>`;

        attrezzaTabella($vista(), { nomeFile: 'utenti' });
        document.getElementById('btn-nuovo-utente').addEventListener('click', () => {
            apriModale(`<h2>Abilita nuovo utente</h2>
                ${selettorePersonaUtente()}
                <div class="campo"><label>Nome e cognome</label><input id="m-nome"></div>
                <div class="campo"><label>Email</label><input id="m-email" type="email"></div>
                <div class="campo"><label>Ruolo</label><select id="m-ruolo">${opzioniRuolo(null)}</select></div>
                <p class="descrizione">L'utente ricevera l'accesso richiedendo la prima password dalla pagina di ingresso.</p>
                <div class="modale-azioni">
                    <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                    <button class="btn btn-primary" id="m-salva">Abilita</button>
                </div>`);
            document.getElementById('m-annulla').addEventListener('click', chiudiModale);
            collegaSelettorePersona();
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
        $vista().querySelectorAll('.u-ruolo').forEach(sel => sel.addEventListener('change', () => {
            const email = sel.dataset.email, nuovo = sel.value;
            const utenti2 = Auth.utenti();
            const u = utenti2.find(x => x.email === email); if (!u) return;
            const prima = u.ruolo; u.ruolo = nuovo;
            Auth.salvaUtenti(utenti2);
            Audit.registra(Auth.utenteCorrente, 'Ruolo utente cambiato', 'utente', email, null, [{ campo: 'Ruolo', prima: nomeRuolo(prima), dopo: nomeRuolo(nuovo) }]);
            toast('Ruolo aggiornato per ' + email + '.', 'verde');
        }));
    }

    /* Utenti abilitati in modalita cloud (collezione Firestore "utenti") */
    async function vistaUtentiCloud() {
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
                ${selettorePersonaUtente()}
                <div class="campo"><label>Nome e cognome</label><input id="m-nome"></div>
                <div class="campo"><label>Email</label><input id="m-email" type="email"></div>
                <div class="campo"><label>Ruolo</label><select id="m-ruolo">
                    ${opzioniRuolo(null)}
                </select></div>
                <p class="descrizione">L'utente ricevera una email (da noreply@nextgenerationbusiness.it) con il collegamento per impostare la password. Ricordagli di controllare anche la posta indesiderata / spam.</p>
                <div class="modale-azioni">
                    <button class="btn btn-ghost" id="m-annulla">Annulla</button>
                    <button class="btn btn-primary" id="m-salva">Abilita e invia email</button>
                </div>`);
            document.getElementById('m-annulla').addEventListener('click', chiudiModale);
            collegaSelettorePersona();
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
                <td class="cliente-cella" data-label="Nome">${esc(u.nome || '')}</td>
                <td data-label="Email">${esc(u.email)}</td>
                <td data-label="Ruolo">${u.email === Auth.utenteCorrente.email ? esc(nomeRuolo(u.ruolo)) : '<select class="u-ruolo" data-email="' + esc(u.email) + '">' + opzioniRuolo(u.ruolo) + '</select>'}</td>
                <td data-label="Stato">${u.attivo === false ? '<span class="badge rosso">disabilitato</span>' : '<span class="badge verde">attivo</span>'}</td>
                <td data-label="Ultimo accesso">${u.ultimoAccesso ? fmtDataOra(u.ultimoAccesso) : ''}</td>
                <td data-label="" style="white-space:nowrap;">
                    <button class="btn btn-sm btn-secondary u-reimposta" data-email="${esc(u.email)}">Invia email reimposta password</button>
                    ${u.email !== Auth.utenteCorrente.email ? `<button class="btn btn-sm ${u.attivo === false ? 'btn-secondary' : 'btn-danger'} u-attiva" data-email="${esc(u.email)}" data-attivo="${u.attivo === false ? '0' : '1'}">${u.attivo === false ? 'Riabilita' : 'Disabilita'}</button>` : ''}
                </td>
            </tr>`).join('') +
            `</tbody></table></div>`;

        attrezzaTabella($vista(), { nomeFile: 'utenti' });
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
        document.querySelectorAll('.u-ruolo').forEach(sel => {
            let prec = sel.value;
            sel.addEventListener('change', async () => {
                const email = sel.dataset.email, nuovo = sel.value;
                sel.disabled = true;
                try {
                    await Cloud.salvaUtente(email, { ruolo: nuovo });
                    Audit.registra(Auth.utenteCorrente, 'Ruolo utente cambiato', 'utente', email, null, [{ campo: 'Ruolo', prima: nomeRuolo(prec), dopo: nomeRuolo(nuovo) }]);
                    prec = nuovo;
                    toast('Ruolo aggiornato per ' + email + '.', 'verde');
                } catch (e) {
                    sel.value = prec;
                    toast('Cambio ruolo non riuscito: ' + Cloud.msgErrore(e), 'rosso');
                } finally { sel.disabled = false; }
            });
        });
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
                <label style="display:flex; gap:8px; align-items:center; font-weight:600;"><input type="radio" name="d-modo" value="aggiungi" checked style="width:auto;">Aggiungi all'elenco attuale</label>
                <label style="display:flex; gap:8px; align-items:flex-start; font-weight:600;"><input type="radio" name="d-modo" value="aggiorna" style="width:auto; margin-top:3px;"><span>Aggiorna la stima delle ore dai bilanci<br><span style="font-weight:400; font-size:0.82rem; color:var(--grigio-600);">Non crea e non elimina nulla: cerca ogni riga per codice fiscale (o per nome cliente) e salva <strong>attivo</strong> e <strong>ricavi</strong>, da cui si ricavano le ore stimate per il report. Serve solo all'analisi: <strong>non tocca il calcolo del compenso concordato, ne le proposte di incarico o i PDF</strong>, che continuano a riportare solo le ore decise nel wizard.</span></span></label></div>
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

                    /* AGGIORNA: compila attivo e ricavi sugli incarichi che ci sono gia', senza
                       toccare id, compensi o altro. Serve per le ore stimate (metodo CNDCEC), che
                       si ricalcolano da attivo+ricavi. Un import normale rigenererebbe gli id
                       creando dei doppioni, quindi qui si cerca la corrispondenza e si modifica. */
                    if (modo === 'aggiorna') {
                        const lista = Incarichi.tutti();
                        const norm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
                        const normCf = s => String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, '');
                        // un cliente puo' avere piu' incarichi (es. rinnovo): attivo e ricavi sono
                        // del cliente, quindi la riga aggiorna TUTTI i suoi incarichi, non solo il primo
                        const perCf = new Map(), perNome = new Map();
                        const agg = (mappa, k, i) => { if (!k) return; const a = mappa.get(k); if (a) a.push(i); else mappa.set(k, [i]); };
                        lista.forEach(i => { agg(perCf, normCf(i.codiceFiscale), i); agg(perNome, norm(i.cliente), i); });
                        let aggiornati = 0, righeUsate = 0, nonTrovati = 0, senzaDati = 0;
                        const nomiNonTrovati = [];
                        righe.forEach(r => {
                            if (!r || typeof r !== 'object') { nonTrovati++; return; }
                            const attivo = parseImporto(r.attivo != null ? r.attivo : (r.calc && r.calc.attivo));
                            const ricavi = parseImporto(r.ricavi != null ? r.ricavi : (r.calc && r.calc.ricavi));
                            if (!(attivo > 0) && !(ricavi > 0)) { senzaDati++; return; }
                            const cf = normCf(r.codiceFiscale);
                            const trovati = (cf && perCf.get(cf)) || (r.cliente && perNome.get(norm(r.cliente))) || null;
                            if (!trovati || !trovati.length) { nonTrovati++; if (nomiNonTrovati.length < 5 && r.cliente) nomiNonTrovati.push(String(r.cliente)); return; }
                            let usata = false;
                            trovati.forEach(inc => {
                                // la stima va in inc.stima, MAI in inc.calc: il calcolo e' quello
                                // concordato nel wizard e finisce nella proposta di incarico.
                                // Se i correttivi sono gia' stati scelti li si riusa, altrimenti i predefiniti.
                                const src = inc.calc || {};
                                const base = {
                                    attivo: attivo > 0 ? attivo : (src.attivo || 0),
                                    ricavi: ricavi > 0 ? ricavi : (src.ricavi || 0),
                                    moltSettore: src.moltSettore || 1.0, moltRischio: src.moltRischio || 1.2,
                                    orePlus: src.orePlus || 0, extra50: src.extra50 || 0,
                                    hConsolidato: src.hConsolidato || 0, hIfrs: src.hIfrs || 0, hIt: src.hIt || 0,
                                    hAltro: src.hAltro || 0, hVolontaria: src.hVolontaria || 0, hPrimoAnno: src.hPrimoAnno || 0
                                };
                                const res = calcolaCompenso(base);
                                inc.stima = Object.assign(base, {
                                    media: res.media, oreAnno1: res.oreAnno1, oreAnni23: res.oreAnni23,
                                    origine: 'bilanci importati', il: Date.now()
                                });
                                inc.modificato = { da: Auth.utenteCorrente.nome + ' (stima ore da bilanci)', il: Date.now() };
                                aggiornati++; usata = true;
                            });
                            if (usata) righeUsate++;
                        });
                        if (!aggiornati) {
                            toast('Nessun incarico aggiornato: ' + (senzaDati ? 'nel file non ci sono attivo/ricavi validi.' : 'nessuna corrispondenza con gli incarichi presenti.'), 'rosso');
                            return;
                        }
                        Incarichi.salva(lista);
                        const note = [];
                        if (nonTrovati) note.push(nonTrovati + ' righe senza corrispondenza' + (nomiNonTrovati.length ? ' (es. ' + nomiNonTrovati.join(', ') + ')' : ''));
                        if (senzaDati) note.push(senzaDati + ' righe senza attivo/ricavi');
                        Audit.registra(Auth.utenteCorrente, 'Stima ore aggiornata dai bilanci', 'sistema', null, null,
                            'Stima aggiornata su ' + aggiornati + ' incarichi da ' + righeUsate + ' righe (solo report: calcolo concordato e lettere non toccati)' + (note.length ? '. ' + note.join('; ') : ''));
                        toast('Aggiornati ' + aggiornati + ' incarichi.' + (note.length ? ' ' + note.join('; ') + '.' : ''), note.length ? undefined : 'verde');
                        naviga('report');
                        return;
                    }
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
    // Scarica il PDF di un mandato (usato per le lettere dei periodi precedenti: solo download, nessun congelamento)
    async function scaricaPdfMandato(inc) {
        try {
            const bytes = await generaPdfIncarico(inc, { restituisciBytes: true });
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'mandato-' + String(inc.cliente || 'incarico').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.pdf';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 8000);
        } catch (e) { toast('Impossibile generare il PDF: ' + (e && e.message || 'errore'), 'rosso'); }
    }

    function vistaLettera() {
        const inc = Incarichi.trova(parametriVista && parametriVista.id);
        if (!inc) { naviga('incarichi'); return; }
        if (!Auth.vedeIncarico(inc)) { naviga('incarichi'); return; }
        // se e richiesto un periodo storico, si costruisce un incarico "virtuale" con lo snapshot
        const idxPeriodo = (parametriVista && parametriVista.periodo != null) ? Number(parametriVista.periodo) : null;
        const snap = (idxPeriodo != null && inc.storico && inc.storico[idxPeriodo]) ? inc.storico[idxPeriodo] : null;
        const incL = snap ? Object.assign({}, inc, snap) : inc;
        if (incL.tipo !== 'legale' && incL.tipo !== 'volontaria') {
            toast('Il modello di lettera e disponibile solo per revisione legale e revisione volontaria.', 'rosso');
            naviga('dettaglio', { id: inc.id });
            return;
        }
        const durataL = incL.tipo === 'legale' ? 3 : 1;
        const periodoLabel = (snap && snap.esercizioPeriodo) ? (durataL > 1 ? snap.esercizioPeriodo + '-' + (snap.esercizioPeriodo + durataL - 1) : String(snap.esercizioPeriodo)) : '';
        const html = incL.tipo === 'volontaria' ? letteraVolontaria(incL) : letteraLegale(incL);
        $vista().innerHTML = `
            <div class="barra-stampa no-stampa">
                <button class="btn btn-ghost" id="btn-lettera-indietro">&larr; Torna al dettaglio</button>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    ${snap ? '<span class="badge neutro" style="align-self:center;">Periodo precedente' + (periodoLabel ? ' ' + periodoLabel : '') + '</span>' : ''}
                    <span class="badge ${classeTipo(incL.tipo)}" style="align-self:center;">${esc(nomeTipo(incL.tipo))}</span>
                    ${incL.calcoloCongelato ? '<span class="badge ambra" style="align-self:center;">' + ICO_LUCCHETTO + 'Calcolo congelato</span>' : ''}
                    <button class="btn btn-primary" id="btn-pdf-ufficiale">${snap ? 'Scarica PDF' : 'Scarica / stampa mandato'}</button>
                </div>
            </div>
            <div id="lettera-corpo">
                <p class="descrizione" style="max-width:860px; margin:0 auto 14px; text-align:center;">Caricamento anteprima del mandato ufficiale...</p>
            </div>`;
        document.getElementById('btn-lettera-indietro').addEventListener('click', () => naviga('dettaglio', { id: inc.id }));
        document.getElementById('btn-pdf-ufficiale').addEventListener('click', () => snap ? scaricaPdfMandato(incL) : modaleStampaMandato(inc));

        // anteprima = PDF ufficiale renderizzato inline; fallback all'anteprima HTML
        (async () => {
            const corpo = document.getElementById('lettera-corpo');
            try {
                const bytes = await generaPdfIncarico(incL, { restituisciBytes: true });
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
        // per la volontaria (un solo esercizio) valgono le ore dell'anno 1.
        // SOLO dal calcolo concordato: la stima del report non entra nei documenti.
        const oreRegime = oreDaCalcolo(inc);
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
${inc.localita ? esc(inc.localita) + (inc.regione ? ' (' + esc(inc.regione) + ')' : '') : esc(inc.regione || '')}
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
        if (per === 'specifica') return inc.fattData ? ('La fatturazione dei corrispettivi avverra alla data del ' + fmtData(inc.fattData)) : 'La fatturazione dei corrispettivi avverra alla data concordata';
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
            ctx.fillRect(x, h - margine.giu - alt, barW, alt);
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

    // Grafico SVG interattivo dei compensi per anno (cruscotto): tooltip al passaggio,
    // barra dell'anno in corso segmentata per evidenziare il fatturato in scadenza / scaduto.
    function disegnaGraficoCompensiSvg(containerId, annoCorr) {
        const cont = document.getElementById(containerId);
        if (!cont) return;
        const incarichi = Incarichi.visibili();
        const anni = Incarichi.anniConCompensi();
        if (!anni.length) { cont.innerHTML = '<p class="tabella-vuota">Nessun compenso registrato.</p>'; return; }
        const valori = anni.map(a => incarichi.reduce((s, i) => s + Incarichi.compensoAnno(i, a), 0));
        const max = Math.max(...valori, 1);
        const attivi = incarichi.filter(i => i.stato !== 'cessato' && i.stato !== 'dimesso');
        let scadTot = 0, scaduTot = 0;
        attivi.forEach(i => { const s = Incarichi.statoScadenza(i); const c = Incarichi.compensoAnno(i, annoCorr); if (s.classe === 'ambra') scadTot += c; else if (s.classe === 'rosso') scaduTot += c; });

        const W = 760, H = 300, mL = 58, mR = 18, mT = 18, mB = 42;
        const areaW = W - mL - mR, areaH = H - mT - mB, y0 = mT;
        const passo = areaW / anni.length, barW = Math.min(66, passo * 0.6);
        const yOf = v => y0 + areaH * (1 - Math.max(0, v) / max);
        const fmtK = v => v >= 1000 ? Math.round(v / 1000) + 'k' : String(Math.round(v));
        const esr = s => String(s);

        let grid = '';
        for (let g = 0; g <= 4; g++) {
            const y = y0 + areaH * (1 - g / 4);
            grid += `<line x1="${mL}" y1="${y}" x2="${W - mR}" y2="${y}" stroke="#E2E8F0"/>`
                + `<text x="${mL - 8}" y="${y + 3}" text-anchor="end" font-size="10" fill="#94A3B8">${fmtK(max * g / 4)}</text>`;
        }
        let barre = '';
        anni.forEach((a, i) => {
            const v = valori[i];
            const x = mL + passo * i + (passo - barW) / 2;
            const isCorr = a === annoCorr;
            const tip = `data-anno="${esr(a)}" data-tot="${esr(v)}" data-scad="${esr(isCorr ? scadTot : 0)}" data-scadu="${esr(isCorr ? scaduTot : 0)}"`;
            if (isCorr && (scadTot + scaduTot) > 0) {
                const segs = [{ v: Math.max(0, v - scadTot - scaduTot), c: '#164068' }, { v: scadTot, c: '#C9A227' }, { v: scaduTot, c: '#C0392B' }];
                let acc = 0;
                segs.forEach(sg => {
                    if (sg.v <= 0) return;
                    const yTop = yOf(acc + sg.v), yBot = yOf(acc);
                    barre += `<rect class="g-bar" x="${x}" y="${yTop}" width="${barW}" height="${Math.max(0, yBot - yTop)}" fill="${sg.c}" rx="2" ${tip}><title>${esr(a)}: ${eurFmt.format(v)}</title></rect>`;
                    acc += sg.v;
                });
            } else {
                const y = yOf(v);
                barre += `<rect class="g-bar" x="${x}" y="${y}" width="${barW}" height="${Math.max(0, y0 + areaH - y)}" fill="${a > annoCorr ? '#9DB8D2' : '#164068'}" rx="2" ${tip}><title>${esr(a)}: ${eurFmt.format(v)}</title></rect>`;
            }
            barre += `<text x="${x + barW / 2}" y="${H - 16}" text-anchor="middle" font-size="11" fill="${isCorr ? '#0A2844' : '#475569'}" font-weight="${isCorr ? '700' : '400'}">${esr(a)}</text>`;
            if (v > 0) barre += `<text x="${x + barW / 2}" y="${yOf(v) - 5}" text-anchor="middle" font-size="9" font-weight="700" fill="#0A2844">${fmtK(v)}</text>`;
        });
        const legenda = (scadTot + scaduTot) > 0 ? `<div class="g-legenda">
            <span><i style="background:#164068"></i>Regolare</span>
            <span><i style="background:#C9A227"></i>In scadenza ${eurFmt.format(scadTot)}</span>
            <span><i style="background:#C0392B"></i>Scaduto ${eurFmt.format(scaduTot)}</span>
        </div>` : '';
        cont.innerHTML = `<div class="g-svg-wrap"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Andamento compensi per anno">${grid}${barre}</svg><div class="g-tip" id="g-tip" hidden></div></div>${legenda}`;

        const tip = cont.querySelector('#g-tip'), wrap = cont.querySelector('.g-svg-wrap');
        cont.querySelectorAll('.g-bar').forEach(bar => {
            bar.addEventListener('mousemove', e => {
                const d = bar.dataset, sc = +d.scad, sd = +d.scadu;
                tip.innerHTML = `<strong>${esc(d.anno)}</strong><br>Compensi: ${eurFmt.format(+d.tot)}`
                    + (sc + sd > 0 ? `<br><span style="color:#C9A227">In scadenza: ${eurFmt.format(sc)}</span><br><span style="color:#C0392B">Scaduto: ${eurFmt.format(sd)}</span>` : '');
                const r = wrap.getBoundingClientRect();
                tip.style.left = Math.min(r.width - 150, e.clientX - r.left + 12) + 'px';
                tip.style.top = (e.clientY - r.top + 12) + 'px';
                tip.hidden = false;
            });
            bar.addEventListener('mouseleave', () => { tip.hidden = true; });
        });
    }

    // Grafico SVG a barre orizzontali dei primi clienti per compenso (report): tooltip + clic per aprire l'incarico.
    function disegnaGraficoClientiSvg(containerId, clienti, anno) {
        const cont = document.getElementById(containerId);
        if (!cont) return;
        const top = (clienti || []).slice(0, 12);
        if (!top.length) { cont.innerHTML = '<p class="tabella-vuota">Nessun compenso nel ' + anno + '.</p>'; return; }
        const max = Math.max(...top.map(c => c.importo), 1);
        const W = 760, rowH = 26, padT = 6, padB = 6, labelW = 180, valW = 110, mR = 12;
        const H = padT + padB + top.length * rowH;
        const barX = labelW, barMax = W - labelW - valW - mR;
        let body = '';
        top.forEach((c, i) => {
            const y = padT + i * rowH;
            const bw = Math.max(2, barMax * (c.importo / max));
            const nome = c.cliente.length > 26 ? c.cliente.slice(0, 25) + '…' : c.cliente;
            body += `<text x="${labelW - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="11" fill="#334155">${esc(nome)}</text>`
                + `<rect class="g-bar" x="${barX}" y="${y + 4}" width="${bw}" height="${rowH - 10}" rx="3" fill="#164068" data-cliente="${esc(c.cliente)}" data-imp="${c.importo}" data-apri="${esc(c.id)}"><title>${esc(c.cliente)}: ${eurFmt.format(c.importo)}</title></rect>`
                + `<text x="${barX + bw + 6}" y="${y + rowH / 2 + 4}" font-size="10" font-weight="700" fill="#0A2844">${eurFmt.format(c.importo)}</text>`;
        });
        cont.innerHTML = `<div class="g-svg-wrap"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Primi clienti per compenso">${body}</svg><div class="g-tip" id="g-tip-cli" hidden></div></div>`;
        const tip = cont.querySelector('#g-tip-cli'), wrap = cont.querySelector('.g-svg-wrap');
        cont.querySelectorAll('.g-bar').forEach(bar => {
            bar.addEventListener('mousemove', e => {
                tip.innerHTML = '<strong>' + esc(bar.dataset.cliente) + '</strong><br>' + eurFmt.format(+bar.dataset.imp);
                const r = wrap.getBoundingClientRect();
                tip.style.left = Math.min(r.width - 150, e.clientX - r.left + 12) + 'px';
                tip.style.top = (e.clientY - r.top + 12) + 'px';
                tip.hidden = false;
            });
            bar.addEventListener('mouseleave', () => { tip.hidden = true; });
            bar.addEventListener('click', () => naviga('dettaglio', { id: bar.dataset.apri }));
        });
    }

    /* Dispersione ore stimate / compenso: ogni punto e' un incarico, quindi si vedono tutti
       insieme. La retta e' la tariffa oraria di riferimento (mediana dello studio): i punti
       SOTTO la retta sono quelli pagati poco per le ore che costano, e sono in rosso.
       Tooltip al passaggio, clic per aprire l'incarico. */
    function disegnaGraficoOreCompensoSvg(containerId, punti, tariffaRif, anno) {
        const cont = document.getElementById(containerId);
        if (!cont) return;
        if (!punti.length) {
            cont.innerHTML = '<p class="tabella-vuota">Nessun incarico con ore stimate e compenso nel ' + anno + '.</p>';
            return;
        }
        const W = 760, H = 330, mS = 66, mD = 16, mSu = 14, mGiu = 40;
        const areaW = W - mS - mD, areaH = H - mSu - mGiu;
        // senza una tariffa di riferimento attendibile si mostrano i punti senza colorarli
        const conRif = tariffaRif > 0;
        const maxOre = Math.max(...punti.map(p => p.ore), 1);
        const maxComp = Math.max(...punti.map(p => p.compenso), conRif ? tariffaRif * maxOre : 0, 1);
        const px = o => mS + (o / maxOre) * areaW;
        const py = c => mSu + areaH - (c / maxComp) * areaH;
        const colore = p => !conRif ? '#164068'
            : (p.eurH < tariffaRif * 0.7 ? '#B3261E' : (p.eurH < tariffaRif ? '#B45309' : '#15803D'));

        // griglia + assi
        let g = '';
        for (let i = 0; i <= 4; i++) {
            const v = maxComp * i / 4, yy = py(v);
            g += `<line x1="${mS}" y1="${yy}" x2="${W - mD}" y2="${yy}" stroke="#E2E8F0" stroke-width="1"/>`
                + `<text x="${mS - 8}" y="${yy + 3}" text-anchor="end" font-size="9" fill="#64748B">${eurFmt.format(Math.round(v))}</text>`;
        }
        for (let i = 0; i <= 4; i++) {
            const v = maxOre * i / 4, xx = px(v);
            g += `<text x="${xx}" y="${H - mGiu + 15}" text-anchor="middle" font-size="9" fill="#64748B">${Math.round(v)} h</text>`;
        }
        g += `<text x="${mS + areaW / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#475569">Ore stimate (metodo CNDCEC)</text>`;

        // retta della tariffa di riferimento: fin dove ci sta dentro il riquadro
        const retta = conRif ? (() => {
            const oreMax = Math.min(maxOre, maxComp / tariffaRif);
            return `<line x1="${px(0)}" y1="${py(0)}" x2="${px(oreMax)}" y2="${py(tariffaRif * oreMax)}"
                stroke="#164068" stroke-width="1.5" stroke-dasharray="5 4"/>`;
        })() : '';

        /* Le ore CNDCEC vengono da nove scaglioni, quindi molti incarichi cadono sulla stessa
           ascissa: senza scostare i doppioni resterebbero uno sotto l'altro e solo quello in
           cima sarebbe leggibile e cliccabile. Si apre a ventaglio chi coincide. */
        const occupati = new Map();
        const posiziona = p => {
            const bx = px(p.ore), by = py(p.compenso);
            const k = Math.round(bx / 9) + ':' + Math.round(by / 9);
            const n = occupati.get(k) || 0;
            occupati.set(k, n + 1);
            p._x = n ? bx + Math.ceil(n / 2) * 7 * (n % 2 ? 1 : -1) : bx;
            p._y = by;
        };
        // prima i piu' pagati, cosi' i rossi finiscono disegnati sopra e restano visibili
        const ordinati = punti.slice().sort((a, b) => b.eurH - a.eurH);
        ordinati.forEach(posiziona);
        let cerchi = '';
        ordinati.forEach(p => {
            cerchi += `<circle class="g-punto" cx="${p._x}" cy="${p._y}" r="5" fill="${colore(p)}"
                fill-opacity="0.75" stroke="#fff" stroke-width="1"
                data-cliente="${esc(p.cliente)}" data-ore="${p.ore}" data-imp="${p.compenso}"
                data-eurh="${Math.round(p.eurH)}" data-apri="${esc(p.id)}"
                ><title>${esc(p.cliente)}: ${eurFmt.format(p.compenso)} per ${numFmt.format(p.ore)} h = ${eurFmt.format(Math.round(p.eurH))}/h</title></circle>`;
        });
        /* Una sola etichetta, sul piu' basso: con i punti incolonnati piu' etichette si
           coprirebbero fra loro. L'elenco completo, ordinato, sta nella tabella qui sotto. */
        let etich = '';
        const peggio = punti.slice().sort((a, b) => a.eurH - b.eurH)[0];
        if (peggio && conRif && peggio.eurH < tariffaRif) {
            const nome = peggio.cliente.length > 22 ? peggio.cliente.slice(0, 21) + '…' : peggio.cliente;
            const a = peggio._x > W - 150 ? 'end' : 'start';
            etich = `<text x="${peggio._x + (a === 'end' ? -9 : 9)}" y="${peggio._y + 3}" text-anchor="${a}" font-size="9" font-weight="700" fill="#B3261E">${esc(nome)}</text>`;
        }

        cont.innerHTML = `<div class="g-svg-wrap"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
            aria-label="Compenso rispetto alle ore stimate: ogni punto e un incarico, la retta e la tariffa di riferimento">${g}${retta}${cerchi}${etich}</svg>
            <div class="g-tip" id="g-tip-oc" hidden></div></div>
            ${conRif ? `<div class="g-legenda-oc">
                <span><i style="background:#B3261E"></i>Sotto il 70% della tariffa</span>
                <span><i style="background:#B45309"></i>Sotto la tariffa</span>
                <span><i style="background:#15803D"></i>In linea o sopra</span>
                <span><i class="g-linea"></i>Tariffa di riferimento: ${eurFmt.format(Math.round(tariffaRif))}/h (mediana)</span>
            </div>` : ''}`;
        const tip = cont.querySelector('#g-tip-oc'), wrap = cont.querySelector('.g-svg-wrap');
        cont.querySelectorAll('.g-punto').forEach(pt => {
            pt.addEventListener('mousemove', e => {
                tip.innerHTML = '<strong>' + esc(pt.dataset.cliente) + '</strong><br>'
                    + eurFmt.format(+pt.dataset.imp) + ' per ' + numFmt.format(+pt.dataset.ore) + ' h<br>'
                    + '<strong>' + eurFmt.format(+pt.dataset.eurh) + '/h</strong>';
                const r = wrap.getBoundingClientRect();
                tip.style.left = Math.min(r.width - 170, e.clientX - r.left + 12) + 'px';
                tip.style.top = (e.clientY - r.top + 12) + 'px';
                tip.hidden = false;
            });
            pt.addEventListener('mouseleave', () => { tip.hidden = true; });
            pt.addEventListener('click', () => naviga('dettaglio', { id: pt.dataset.apri }));
        });
    }

    function disegnaGraficoTrend(id, annoRif) {
        const c = preparaCanvas(id, 280);
        if (!c) return;
        const { ctx, w, h } = c;
        const incarichi = Incarichi.visibili();
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
        const annoOra = annoRif || annoCorrente();
        const punti = [];
        anni.forEach((a, i) => {
            const v = valori[i];
            const x = margine.sx + passo * i + (passo - barW) / 2;
            const alt = areaH * (v / max);
            ctx.fillStyle = a > annoOra ? '#9DB8D2' : (a === annoOra ? '#C9A227' : '#164068');
            ctx.fillRect(x, margine.su + areaH - alt, barW, alt);
            ctx.fillStyle = '#475569';
            ctx.font = '11px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(String(a), x + barW / 2, h - 10);
            if (v > 0) {
                ctx.fillStyle = '#0A2844';
                ctx.font = 'bold 10px Inter';
                ctx.fillText(eurFmt.format(v).replace(/ ?€/, '').trim() + ' €', x + barW / 2, margine.su + areaH - alt - 6);
            }
        });
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
        aggiornaEtichettaUtente();
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
