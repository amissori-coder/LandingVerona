/* ============================================================
   PROVE - la pagina di GESTIONE della diretta (/diretta/gestione/)
   ------------------------------------------------------------
       cd diretta/prove && node gestione.prova.js

   Avvia da sola gli emulatori di Firebase (Auth sulla 9580,
   Firestore sulla 8580) e il sito in locale (8590), poi apre la
   gestione in Chromium con la Content-Security-Policy vera, e alla
   fine chiude tutto.

   IL SERVIZIO E' FINTO, DI PROPOSITO. Le chiamate della pagina a
   api/diretta-gestione e api/diretta-accesso le intercetta questa
   prova e risponde con un piccolo servizio in memoria che segue il
   contratto (sezione 5.2): eventi, anteprima, crea con la
   prenotazione dei nomi utente, partecipanti, operazioni, email,
   connessi, esportazione. Cosi' la prova guarda SOLO la pagina (le
   funzioni vere hanno le loro prove: doppioni, accesso, coda) e
   puo' simulare quello che con il servizio vero e' difficile da
   ottenere a comando: un nome utente preso da un caricamento
   contemporaneo, un'email respinta, il contatore dei collegati.
   Il token del gestore invece e' VERO: l'utente sta nell'emulatore
   di Auth e il finto servizio lo verifica con firebase-admin, come
   fa verificaGestore.

   COSA DIMOSTRA. Accesso del gestore (password sbagliata, primo
   accesso, account che non e' un gestore); creazione dell'evento di
   Napoli; caricamento di esempio-partecipanti.csv con ogni problema
   evidenziato dalla classe giusta e il pulsante di creazione spento;
   correzioni in linea, esclusione e conferma degli omonimi che lo
   accendono; creazione a gruppi di 25 senza doppioni; elenco con
   ricerca; reinvio, nuova password mostrata una volta, disattivazione,
   correzione; regia (in onda con conferma, pausa, cambio del video
   provato prima, avviso, contatore dei collegati); email di prova e
   invio a tutti con l'avanzamento; esportazione in Excel con due
   fogli, riletta con la stessa SheetJS. Screenshot in
   risultati/screenshot-gestione/ (computer 1440x900 e tablet 820x1180).
   Esce con 1 se qualcosa e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORTE = { firestore: 8580, auth: 9580, api: 3580, statico: 8590 };
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + PORTE.auth;
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + PORTE.firestore;

const RADICE = path.resolve(__dirname, '../..');
const RISULTATI = path.join(__dirname, 'risultati');
const FOTO = path.join(RISULTATI, 'screenshot-gestione');
fs.mkdirSync(FOTO, { recursive: true });

const admin = require(path.join(RADICE, 'email-service/node_modules/firebase-admin'));
const { chromium } = require('./node_modules/playwright');
const { preparaContesto } = require('./rete-prove');
const NU = require(path.join(RADICE, 'diretta/nome-utente.js'));

const SITO = 'http://127.0.0.1:' + PORTE.statico;
const API = 'http://127.0.0.1:' + PORTE.api + '/api';
const EMAIL_GESTORE = 'gestore@prova.it';
const PASSWORD_GESTORE = 'Gestione-2026-prova';
const EMAIL_CURIOSO = 'curioso@prova.it';
// in elenco ma mai attivato da "Primo accesso": niente claim gestore
const EMAIL_NUOVO = 'nuovo.gestore@prova.it';
const PASSWORD_NUOVO = 'Nuovo-2026-prova';
const GESTORI = [EMAIL_GESTORE, EMAIL_NUOVO];
const PASSWORD_CURIOSO = 'Curioso-2026-prova';
const ID = 'napoli-2026';
const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
const SHEETJS_IMPRONTA = 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT';

let rossi = 0, verdi = 0;
function vero(cond, descrizione, dettaglio) {
    if (cond) { verdi++; console.log('  ok  ' + descrizione); }
    else { rossi++; console.log('ROSSO ' + descrizione + (dettaglio !== undefined ? '\n       ' + String(dettaglio).slice(0, 400) : '')); }
    return !!cond;
}
const pausa = ms => new Promise(r => setTimeout(r, ms));

/* ---------- processi di appoggio ---------- */
function avvia(argomenti, pronto, nome, cartella) {
    return new Promise((risolvi, rifiuta) => {
        const figlio = spawn(process.execPath, argomenti, { cwd: cartella || __dirname, stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { FORCE_COLOR: '0' }) });
        let uscita = '';
        const limite = setTimeout(() => { figlio.kill('SIGTERM'); rifiuta(new Error(nome + ' non partito in tempo:\n' + uscita.slice(-2000))); }, 150000);
        const leggi = d => {
            uscita += d.toString();
            if (pronto.test(uscita)) { clearTimeout(limite); risolvi(figlio); }
        };
        figlio.stdout.on('data', leggi);
        figlio.stderr.on('data', leggi);
        figlio.on('exit', c => { clearTimeout(limite); rifiuta(new Error(nome + ' uscito (' + c + '):\n' + uscita.slice(-2000))); });
    });
}
function ferma(figlio) {
    return new Promise(r => {
        if (!figlio || figlio.exitCode !== null) return r();
        figlio.removeAllListeners('exit');
        figlio.on('exit', () => r());
        figlio.kill('SIGINT');
        setTimeout(() => { try { figlio.kill('SIGKILL'); } catch (_) { /* gia' fermo */ } r(); }, 8000);
    });
}

/* Gli emulatori si avviano con avvia-emulatori.js. Quello script ricava le
   porte "di servizio" (hub, log, websocket) dalla porta di Firestore con uno
   scarto di 100 per prova: hub 4400+scarto e log 4500+scarto. Due prove che
   girano INSIEME con porte a 100 di distanza (8480 e 8580) si pestano: il log
   dell'una (4900) e' l'hub dell'altra. In quel caso, e solo in quello, si
   riparte con una configurazione propria che tiene hub, log e websocket
   accanto alla porta di Firestore di questa prova (8583, 8584, 8585). */
async function avviaEmulatori() {
    try {
        return await avvia([path.join(__dirname, 'avvia-emulatori.js'), '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], /EMULATORI PRONTI/, 'emulatori');
    } catch (e) {
        if (!/port taken|not open|could not start/i.test(e.message)) throw e;
        console.log('   (porte di servizio degli emulatori occupate da un\'altra prova in parallelo: riparto con hub, log e websocket su '
            + (PORTE.firestore + 3) + '-' + (PORTE.firestore + 5) + ')');
        const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'ngb-gestione-emulatori-'));
        fs.copyFileSync(path.resolve(__dirname, '../firebase/firestore.rules'), path.join(cartella, 'firestore.rules'));
        fs.writeFileSync(path.join(cartella, 'firebase.json'), JSON.stringify({
            firestore: { rules: 'firestore.rules' },
            emulators: {
                auth: { port: PORTE.auth, host: '127.0.0.1' },
                firestore: { port: PORTE.firestore, host: '127.0.0.1', websocketPort: PORTE.firestore + 5 },
                hub: { port: PORTE.firestore + 3, host: '127.0.0.1' },
                logging: { port: PORTE.firestore + 4, host: '127.0.0.1' },
                ui: { enabled: false }
            }
        }));
        const firebase = path.join(__dirname, 'node_modules/.bin/firebase');
        return avvia([firebase, 'emulators:start', '--only', 'auth,firestore', '--project', 'demo-ngb-eventi'], /All emulators ready/, 'emulatori (configurazione propria)', cartella);
    }
}

/* ---------- SheetJS anche in Node, per rileggere l'Excel scaricato ---------- */
async function sheetJSNode() {
    const k = crypto.createHash('sha256').update(SHEETJS_URL).digest('hex').slice(0, 40);
    const cache = path.join(RISULTATI, 'cache-rete');
    fs.mkdirSync(cache, { recursive: true });
    const bin = path.join(cache, k + '.bin');
    if (!fs.existsSync(bin)) {
        const r = await fetch(SHEETJS_URL);
        if (!r.ok) throw new Error('SheetJS non scaricata: ' + r.status);
        fs.writeFileSync(bin, Buffer.from(await r.arrayBuffer()));
        fs.writeFileSync(path.join(cache, k + '.json'), JSON.stringify({ stato: 200, tipo: r.headers.get('content-type') || 'application/javascript' }));
    }
    const dati = fs.readFileSync(bin);
    const impronta = 'sha384-' + crypto.createHash('sha384').update(dati).digest('base64');
    const copia = path.join(RISULTATI, 'xlsx-node.js');
    fs.writeFileSync(copia, dati);
    return { XLSX: require(copia), impronta: impronta };
}

/* ============================================================
   IL FINTO SERVIZIO (in memoria, secondo il contratto)
   ============================================================ */
function conNumero(base, n) { return n > 1 ? base + n : base; }
const ALFABETO_PASSWORD = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function passwordFinta() { let s = ''; for (let i = 0; i < 10; i++) s += ALFABETO_PASSWORD[crypto.randomInt(ALFABETO_PASSWORD.length)]; return s; }
function idYouTube(v) {
    const s = String(v || '').trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    try {
        const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
        const id = u.searchParams.get('v') || (u.hostname === 'youtu.be' ? u.pathname.slice(1) : ((/^\/(live|embed)\/([^/?#]+)/.exec(u.pathname) || [])[2] || ''));
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
    } catch (_) { return ''; }
}

class FintoServizio {
    constructor(auth) {
        this.auth = auth;
        this.chiamate = [];
        this.eventi = new Map();
        this.partecipanti = new Map();
        this.nomiUtente = new Map();
        this.indirizzi = new Map();
        this.connessi = 37;
        this.creaGruppi = [];
        this.creaEmail = [];
        this.creaQuando = [];
        this.avanzaQuando = [];
        this.concorrenzaSimulata = false;
        this.guastiCrea = 0;       // quante chiamate "crea" far fallire dopo il primo gruppo
        this.creaFallite = 0;
        // un evento passato, con due persone gia' registrate: servono all'anteprima
        const ieri = Date.parse('2026-04-17T09:00:00+02:00');
        this.eventi.set('roma-2026', {
            id: 'roma-2026', titolo: 'Next Generation Business 2026 · Roma', luogo: 'Roma', data: '2026-04-17', oraInizio: '09:00', oraFine: '17:00',
            inizio: ieri, fine: ieri + 8 * 3600e3, videoUrl: '', videoId: '', stato: 'terminato', statoAggiornato: ieri + 8 * 3600e3,
            programma: [], paginaEvento: '/roma_aprile_2026/', unSoloDispositivo: false, promemoria: { giornoPrima: false, oraPrima: false },
            avviso: '', creato: ieri - 30 * 864e5, aggiornato: ieri
        });
        this.aggiungi({ uid: 'p-mario-roma', nomeUtente: 'mariorossi', nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@altra-azienda.it', azienda: 'Altra Azienda S.p.A.', eventi: ['roma-2026'], inviata: true });
        this.aggiungi({ uid: 'p-giulia', nomeUtente: 'giuliaferri', nome: 'Giulia', cognome: 'Ferri', email: 'giulia.ferri@esempio.it', azienda: 'Ferri Consulting', eventi: ['roma-2026'], inviata: true });
    }

    aggiungi(d) {
        const invii = {};
        d.eventi.forEach(e => { invii[e] = d.inviata ? { stato: 'inviata', inviata: Date.now() - 864e5, tentativi: 1 } : { stato: 'da inviare', tentativi: 0 }; });
        const p = {
            uid: d.uid, nomeUtente: d.nomeUtente, nome: d.nome, cognome: d.cognome, email: d.email, emailNorm: NU.emailNormalizzata(d.email),
            azienda: d.azienda || '', idEvento: d.eventi[0], eventi: d.eventi.slice(), stato: 'attivo', ultimoAccesso: null, invii: invii
        };
        this.partecipanti.set(p.uid, p);
        this.nomiUtente.set(p.nomeUtente, { uid: p.uid, base: NU.nomeUtenteBase(p.nome, p.cognome) });
        this.indirizzi.set(p.emailNorm, p.uid);
        return p;
    }

    eventoJSON(e) {
        const iscritti = Array.from(this.partecipanti.values()).filter(p => p.eventi.includes(e.id)).length;
        return Object.assign({}, e, { iscritti: iscritti });
    }
    partecipanteJSON(p, id) {
        return {
            uid: p.uid, nomeUtente: p.nomeUtente, nome: p.nome, cognome: p.cognome, email: p.email, azienda: p.azienda,
            stato: p.stato, idEvento: p.idEvento, invio: p.invii[id] || { stato: 'da inviare' }, ultimoAccesso: p.ultimoAccesso, authCreato: true
        };
    }
    delEvento(id) { return Array.from(this.partecipanti.values()).filter(p => p.eventi.includes(id)); }

    // la prenotazione del nome utente come nel contratto (5.2, crea c)
    prenota(desiderato, base, uid) {
        const re = new RegExp('^' + base + '(\\d+)?$');
        const radice = re.test(desiderato) ? base : desiderato;
        const m = re.exec(desiderato);
        const da = radice === base && m && m[1] ? Number(m[1]) : 1;
        for (let n = da; n < da + 60; n++) {
            const c = conNumero(radice, n);
            if (!this.nomiUtente.has(c)) { this.nomiUtente.set(c, { uid: uid, base: radice }); return c; }
        }
        return '';
    }

    async gestisci(route) {
        const req = route.request();
        const origine = req.headers()['origin'] || '*';
        const intestazioni = {
            'access-control-allow-origin': origine, 'access-control-allow-headers': 'Content-Type, Authorization',
            'access-control-allow-methods': 'POST, OPTIONS', vary: 'Origin'
        };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: intestazioni });
        let corpo = {};
        try { corpo = JSON.parse(req.postData() || '{}'); } catch (_) { corpo = {}; }
        let esito;
        try {
            esito = /diretta-accesso/.test(req.url()) ? this.accesso(corpo) : await this.gestione(corpo, req.headers()['authorization'] || '');
        } catch (e) {
            esito = [500, { ok: false, codice: 'errore', msg: 'Errore del finto servizio: ' + e.message }];
        }
        this.chiamate.push({ azione: corpo.azione, dati: corpo, stato: esito[0], quando: Date.now() });
        return route.fulfill({ status: esito[0], contentType: 'application/json; charset=utf-8', headers: intestazioni, body: JSON.stringify(esito[1]) });
    }

    accesso(corpo) {
        if (corpo.azione === 'gestore-accesso') return [200, { ok: true, msg: 'Se l\'indirizzo è tra i gestori, ti abbiamo scritto.' }];
        return [400, { ok: false, codice: 'azione', msg: 'Azione sconosciuta' }];
    }

    async gestione(d, autorizzazione) {
        const m = /^Bearer\s+(.+)$/i.exec(autorizzazione);
        if (!m) return [401, { ok: false, codice: 'non-autenticato', msg: 'Accesso richiesto' }];
        let tok;
        try { tok = await this.auth.verifyIdToken(m[1], true); } catch (_) { return [401, { ok: false, codice: 'non-autenticato', msg: 'Sessione scaduta: accedi di nuovo' }]; }
        if (!GESTORI.includes(tok.email) || tok.email_verified !== true || (tok.firebase || {}).sign_in_provider !== 'password') {
            return [403, { ok: false, codice: 'non-gestore', msg: 'Questo account non è tra i gestori della diretta' }];
        }
        if (tok.gestore !== true) return [403, { ok: false, codice: 'non-gestore', msg: 'Usa «Primo accesso o password dimenticata» per attivare l\'account di gestione' }];
        const f = this['_' + String(d.azione || '').replace(/-/g, '_')];
        if (typeof f !== 'function') return [400, { ok: false, codice: 'azione', msg: 'Azione sconosciuta: ' + d.azione }];
        return f.call(this, d, tok);
    }

    _chi_sono(d, tok) { return [200, { ok: true, email: tok.email }]; }
    _eventi() {
        const l = Array.from(this.eventi.values()).sort((a, b) => b.inizio - a.inizio).map(e => this.eventoJSON(e));
        return [200, { ok: true, eventi: l }];
    }
    _evento_salva(d) {
        const e = d.evento || {};
        if (String(e.titolo || '').length < 3) return [400, { ok: false, codice: 'dati', msg: 'Titolo troppo corto' }];
        if (!(e.oraFine > e.oraInizio)) return [400, { ok: false, codice: 'dati', msg: 'Orari non validi' }];
        if (e.nuovo) {
            if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(e.id)) return [400, { ok: false, codice: 'dati', msg: 'Identificativo non valido' }];
            if (this.eventi.has(e.id)) return [409, { ok: false, codice: 'esiste', msg: 'Esiste già un evento con l\'identificativo ' + e.id }];
        }
        const vecchio = this.eventi.get(e.id) || { stato: 'programmato', creato: Date.now(), avviso: '' };
        const programma = Array.isArray(e.programma) ? e.programma : [];
        const ev = Object.assign({}, vecchio, {
            id: e.id, titolo: e.titolo, luogo: e.luogo || '', data: e.data, oraInizio: e.oraInizio, oraFine: e.oraFine,
            inizio: Date.parse(e.data + 'T' + e.oraInizio + ':00+02:00'), fine: Date.parse(e.data + 'T' + e.oraFine + ':00+02:00'),
            videoUrl: e.videoUrl || '', videoId: e.videoId || idYouTube(e.videoUrl), programma: programma,
            paginaEvento: e.paginaEvento || '', unSoloDispositivo: !!e.unSoloDispositivo,
            promemoria: { giornoPrima: !!(e.promemoria && e.promemoria.giornoPrima), oraPrima: !!(e.promemoria && e.promemoria.oraPrima) },
            aggiornato: Date.now()
        });
        this.eventi.set(ev.id, ev);
        return [200, { ok: true, evento: this.eventoJSON(ev) }];
    }
    _evento_stato(d) {
        const e = this.eventi.get(d.idEvento);
        if (!e) return [404, { ok: false, codice: 'evento', msg: 'Evento inesistente' }];
        if (!['programmato', 'in_onda', 'pausa', 'terminato'].includes(d.stato)) return [400, { ok: false, codice: 'dati', msg: 'Stato non valido' }];
        e.stato = d.stato;
        e.statoAggiornato = Date.now();
        e.ripresa = d.stato === 'pausa' ? String(d.ripresa || '') : '';
        return [200, { ok: true, evento: this.eventoJSON(e) }];
    }
    _evento_video(d) {
        const e = this.eventi.get(d.idEvento);
        e.videoUrl = d.videoUrl || '';
        e.videoId = d.videoId || idYouTube(d.videoUrl);
        e.videoAggiornato = Date.now();
        return [200, { ok: true, evento: this.eventoJSON(e) }];
    }
    _evento_avviso(d) {
        const e = this.eventi.get(d.idEvento);
        e.avviso = String(d.avviso || '').slice(0, 200);
        return [200, { ok: true, evento: this.eventoJSON(e) }];
    }
    _anteprima(d) {
        const perEmail = {};
        (d.emails || []).forEach(em => {
            const uid = this.indirizzi.get(em);
            if (uid) { const p = this.partecipanti.get(uid); perEmail[em] = { uid: uid, nomeUtente: p.nomeUtente, nome: p.nome, cognome: p.cognome, eventi: p.eventi.slice() }; }
        });
        const basi = new Set(d.basi || []);
        const nomi = new Set(d.nomi || []);
        const occupati = [];
        const dettagliOccupati = {};
        this.nomiUtente.forEach((v, nome) => {
            if (basi.has(v.base) || nomi.has(nome)) {
                occupati.push(nome);
                const p = this.partecipanti.get(v.uid);
                if (p && basi.has(v.base)) dettagliOccupati[nome] = { nome: p.nome, cognome: p.cognome, azienda: p.azienda, emailMascherata: p.email[0] + '***@' + p.email.split('@')[1] };
            }
        });
        return [200, { ok: true, esistenti: { perEmail: perEmail, occupati: occupati, dettagliOccupati: dettagliOccupati } }];
    }
    _crea(d) {
        const righe = Array.isArray(d.righe) ? d.righe : [];
        if (righe.length > 50) return [400, { ok: false, codice: 'troppe', msg: 'Al massimo 50 righe per chiamata' }];
        // un guasto del servizio a meta' caricamento (dopo il primo gruppo)
        if (this.guastiCrea > 0 && this.creaGruppi.length >= 1) {
            this.guastiCrea--;
            this.creaFallite++;
            return [503, { ok: false, codice: 'errore', msg: 'Errore del servizio: riprova tra poco.' }];
        }
        this.creaGruppi.push(righe.length);
        this.creaQuando.push(Date.now());
        // un altro gestore, nello stesso istante, ha preso "nicolodangelo"
        if (!this.concorrenzaSimulata) {
            this.concorrenzaSimulata = true;
            this.aggiungi({ uid: 'p-altro-caricamento', nomeUtente: 'nicolodangelo', nome: 'Nicolò', cognome: 'D\'Angelo', email: 'nicolo.dangelo@altro-caricamento.it', eventi: ['roma-2026'] });
        }
        const id = d.idEvento;
        const risultati = righe.map(r => {
            const emailNorm = NU.emailNormalizzata(r.email);
            this.creaEmail.push(emailNorm);
            if (!NU.emailValida(emailNorm) || !String(r.nome || '').trim() || !String(r.cognome || '').trim() || /[<>]/.test(r.nome + r.cognome)) {
                return { riga: r.riga, esito: 'errore', nomeUtente: '', nomeUtenteCambiato: false, uid: '', motivo: 'Dati non validi' };
            }
            const esistente = this.indirizzi.get(emailNorm);
            if (esistente) {
                const p = this.partecipanti.get(esistente);
                if (p.eventi.includes(id)) return { riga: r.riga, esito: 'gia-nell-evento', nomeUtente: p.nomeUtente, nomeUtenteCambiato: false, uid: p.uid, motivo: '' };
                p.eventi = [id].concat(p.eventi.filter(x => x !== id)).slice(0, 20);
                p.idEvento = id;
                p.invii[id] = { stato: 'da inviare', tentativi: 0 };
                return { riga: r.riga, esito: 'aggiunto', nomeUtente: p.nomeUtente, nomeUtenteCambiato: false, uid: p.uid, motivo: '' };
            }
            const base = NU.nomeUtenteBase(r.nome, r.cognome);
            const desiderato = NU.pulisciNomeUtente(r.nomeUtente) || base;
            const uid = 'p' + crypto.randomBytes(10).toString('hex');
            const nome = this.prenota(desiderato, base, uid);
            this.nomiUtente.delete(nome);
            this.aggiungi({ uid: uid, nomeUtente: nome, nome: r.nome, cognome: r.cognome, email: String(r.email).trim(), azienda: r.azienda, eventi: [id] });
            return { riga: r.riga, esito: 'creato', nomeUtente: nome, nomeUtenteCambiato: nome !== desiderato, uid: uid, motivo: '' };
        });
        return [200, { ok: true, risultati: risultati }];
    }
    _partecipanti(d) {
        return [200, { ok: true, partecipanti: this.delEvento(d.idEvento).map(p => this.partecipanteJSON(p, d.idEvento)) }];
    }
    _partecipante(d) {
        const p = this.partecipanti.get(d.uid);
        const id = d.idEvento;
        if (!p) return [404, { ok: false, codice: 'assente', msg: 'Partecipante inesistente' }];
        switch (d.operazione) {
            case 'reinvia': {
                const inv = p.invii[id] = Object.assign({}, p.invii[id], { stato: p.emailNorm === 'chloe.dupont@dupont.fr' ? 'respinta' : 'inviata', aggiornato: Date.now() });
                if (inv.stato === 'inviata') inv.inviata = Date.now();
                inv.tentativi = (inv.tentativi || 0) + 1;
                return [200, { ok: true, invio: { stato: inv.stato } }];
            }
            case 'rigenera': return [200, { ok: true, password: passwordFinta() }];
            case 'disattiva': p.stato = 'disattivato'; return [200, { ok: true, partecipante: this.partecipanteJSON(p, id) }];
            case 'riattiva': p.stato = 'attivo'; return [200, { ok: true, partecipante: this.partecipanteJSON(p, id) }];
            case 'rimuovi-evento':
                p.eventi = p.eventi.filter(x => x !== id);
                delete p.invii[id];
                return [200, { ok: true }];
            case 'correggi': {
                const emailNorm = NU.emailNormalizzata(d.email);
                const di = this.indirizzi.get(emailNorm);
                if (di && di !== p.uid) return [409, { ok: false, codice: 'email-occupata', msg: 'Questa email è già di un altro partecipante.' }];
                if (emailNorm !== p.emailNorm) { this.indirizzi.delete(p.emailNorm); this.indirizzi.set(emailNorm, p.uid); p.emailNorm = emailNorm; p.email = String(d.email).trim(); }
                const nuovaBase = NU.nomeUtenteBase(d.nome, d.cognome);
                let cambiato = false;
                if (nuovaBase !== NU.nomeUtenteBase(p.nome, p.cognome) && !d.mantieniNomeUtente) {
                    const vecchio = p.nomeUtente;
                    const nuovo = this.prenota(nuovaBase, nuovaBase, p.uid);
                    this.nomiUtente.delete(vecchio);
                    p.nomeUtente = nuovo;
                    cambiato = true;
                    if (p.invii[id] && p.invii[id].stato === 'inviata') p.invii[id] = { stato: 'da inviare', tentativi: p.invii[id].tentativi || 0 };
                }
                p.nome = d.nome; p.cognome = d.cognome; p.azienda = d.azienda || '';
                return [200, { ok: true, partecipante: this.partecipanteJSON(p, id), nomeUtenteCambiato: cambiato }];
            }
            default: return [400, { ok: false, codice: 'operazione', msg: 'Operazione sconosciuta' }];
        }
    }
    conteggi(id) {
        const k = { 'da inviare': 0, 'in coda': 0, 'invio': 0, 'inviata': 0, 'respinta': 0, 'errore': 0, 'incerto': 0 };
        this.delEvento(id).forEach(p => { const s = (p.invii[id] || {}).stato || 'da inviare'; k[s] = (k[s] || 0) + 1; });
        return k;
    }
    _email_stato(d) {
        const k = this.conteggi(d.idEvento);
        const destinatari = this.delEvento(d.idEvento).filter(p => p.stato === 'attivo' && (p.invii[d.idEvento] || {}).stato === 'inviata').length;
        return [200, { ok: true, conteggi: k, coda: { attiva: k['in coda'] > 0 }, destinatariPromemoria: destinatari }];
    }
    _email_prova() { return [200, { ok: true }]; }
    _email_accoda(d) {
        let n = 0;
        this.delEvento(d.idEvento).forEach(p => {
            const inv = p.invii[d.idEvento] || {};
            const si = d.chi === 'da-inviare' ? inv.stato === 'da inviare' : ((inv.stato === 'respinta' || inv.stato === 'errore') && !p.ultimoAccesso);
            if (si && p.stato === 'attivo') { p.invii[d.idEvento] = Object.assign({}, inv, { stato: 'in coda' }); n++; }
        });
        return [200, { ok: true, accodate: n }];
    }
    _email_avanza(d) {
        this.avanzaQuando.push(Date.now());
        const inCoda = this.delEvento(d.idEvento).filter(p => (p.invii[d.idEvento] || {}).stato === 'in coda');
        let inviate = 0, respinte = 0;
        inCoda.slice(0, 10).forEach(p => {
            const inv = p.invii[d.idEvento];
            inv.tentativi = (inv.tentativi || 0) + 1;
            if (p.emailNorm === 'chloe.dupont@dupont.fr') { inv.stato = 'respinta'; respinte++; }
            else { inv.stato = 'inviata'; inv.inviata = Date.now(); inviate++; }
        });
        const rimaste = Math.max(0, inCoda.length - 10);
        return [200, { ok: true, inviate: inviate, respinte: respinte, errori: 0, rimaste: rimaste, bloccato: false, finito: rimaste === 0 }];
    }
    _email_esiti() { return [200, { ok: true, respinte: 0, letto: false }]; }
    _connessi() { const n = this.connessi; this.connessi += 5; return [200, { ok: true, connessi: n, quando: Date.now() }]; }
    _esporta(d) {
        const e = this.eventi.get(d.idEvento);
        const persone = this.delEvento(d.idEvento).map(p => {
            const j = this.partecipanteJSON(p, d.idEvento);
            // Ivan e' rimasto collegato piu' della durata dell'evento: i minuti vanno limitati
            if (p.nomeUtente === 'ivanpetrov') j.presenza = { primo: e.inizio + 3 * 60e3, ultimo: e.fine + 5 * 60e3, secondi: 40000, collegamenti: 2 };
            else if (p.nomeUtente === 'annamariadeluca') j.presenza = { primo: e.inizio + 15 * 60e3, ultimo: e.inizio + 135 * 60e3, secondi: 7200, collegamenti: 1 };
            else j.presenza = null;
            return j;
        });
        const accessi = [
            { quando: e.inizio - 10 * 60e3, nomeUtente: 'ivanpetrov', nome: 'Иван', cognome: 'Петров', azienda: 'Petrov Trading', dispositivo: 'Mac · Chrome' },
            { quando: e.inizio + 10 * 60e3, nomeUtente: 'annamariadeluca', nome: 'Anna Maria', cognome: 'De Luca', azienda: 'De Luca & Figli S.p.A.', dispositivo: 'iPhone · Safari' }
        ];
        return [200, { ok: true, evento: this.eventoJSON(e), partecipanti: persone, accessi: accessi }];
    }
}

/* ============================================================
   LA PROVA
   ============================================================ */
(async () => {
    let emulatori = null, server = null, browser = null;
    const t0 = Date.now();
    try {
        const { XLSX, impronta } = await sheetJSNode();
        vero(impronta === SHEETJS_IMPRONTA, 'SheetJS 0.20.3 dalla CDN ufficiale: l\'impronta del file coincide con quella scritta nella pagina');
        const codiceGestione = fs.readFileSync(path.join(RADICE, 'diretta/gestione/gestione.js'), 'utf8');
        vero(codiceGestione.includes(SHEETJS_IMPRONTA) && codiceGestione.includes(SHEETJS_URL), 'la gestione carica SheetJS con URL e integrity della decisione D15');
        const htmlGestione = fs.readFileSync(path.join(RADICE, 'diretta/gestione/index.html'), 'utf8');
        vero(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(htmlGestione) && !/\son[a-z]+=/i.test(htmlGestione), 'nessuno script in linea e nessun gestore on...= nell\'HTML (CSP)');
        vero(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/.test(codiceGestione), 'gestione.js non usa innerHTML/outerHTML/insertAdjacentHTML (D3)');

        console.log('\n-- avvio di emulatori e sito (porte ' + JSON.stringify(PORTE) + ')');
        emulatori = await avviaEmulatori();
        server = await avvia([path.join(__dirname, 'server-locale.js'), '--api', String(PORTE.api), '--statico', String(PORTE.statico), '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], /SERVER LOCALE PRONTO/, 'server locale');

        const app = admin.initializeApp({ projectId: 'demo-ngb-eventi' }, 'prova-gestione');
        const auth = app.auth();
        const gestore = await auth.createUser({ email: EMAIL_GESTORE, password: PASSWORD_GESTORE, emailVerified: true });
        await auth.setCustomUserClaims(gestore.uid, { gestore: true });
        await auth.createUser({ email: EMAIL_CURIOSO, password: PASSWORD_CURIOSO, emailVerified: true });
        await auth.createUser({ email: EMAIL_NUOVO, password: PASSWORD_NUOVO, emailVerified: true });
        const servizio = new FintoServizio(auth);
        const inizioNapoli = Date.parse('2026-10-02T09:00:00+02:00');
        await app.firestore().doc('eventi/' + ID).set({
            titolo: 'Next Generation Business 2026 · Napoli', luogo: 'Napoli · Hotel Eurostars Excelsior', data: '2026-10-02',
            oraInizio: '09:00', oraFine: '17:30', inizio: admin.firestore.Timestamp.fromMillis(inizioNapoli),
            fine: admin.firestore.Timestamp.fromMillis(inizioNapoli + 8.5 * 3600e3), videoId: 'abcdefghijk', stato: 'in_onda',
            programma: [{ ora: '09.00', titolo: 'Accoglienza e registrazione' }], paginaEvento: '/napoli_ottobre_2026/',
            unSoloDispositivo: false, promemoria: { giornoPrima: false, oraPrima: false }
        });

        browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'it-IT', timezoneId: 'Europe/Rome' });
        await preparaContesto(context, {});
        await context.route(/^http:\/\/127\.0\.0\.1:3580\/api\/diretta-(gestione|accesso)/, route => servizio.gestisci(route));
        await context.addInitScript(p => {
            window.NGB_DIRETTA_PROVE = p;
            window.__violazioniCSP = [];
            document.addEventListener('securitypolicyviolation', e => {
                window.__violazioniCSP.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sourceFile || ''));
            });
        }, { firestore: PORTE.firestore, auth: PORTE.auth, api: API });

        const page = await context.newPage();
        const erroriConsole = [];
        const erroriPagina = [];
        page.on('console', m => { if (m.type() === 'error') erroriConsole.push(m.text()); });
        page.on('pageerror', e => erroriPagina.push(e.message));
        await page.clock.install();

        const $ = s => page.locator(s);
        const testo = async s => (await $(s).textContent() || '').trim();
        const visibile = s => $(s).isVisible();
        const chiamate = azione => servizio.chiamate.filter(c => c.azione === azione);
        const aspetta = async (fn, ms, descr) => {
            const fine = Date.now() + (ms || 10000);
            let ultimo;
            while (Date.now() < fine) {
                try { ultimo = await fn(); if (ultimo) return ultimo; } catch (e) { ultimo = e.message; }
                await pausa(100);
            }
            throw new Error('Tempo scaduto: ' + (descr || '') + ' (' + ultimo + ')');
        };
        /* Le foto a pagina intera non ricalcolano gli elementi "appiccicati"
           (la testata, il piede dell'anteprima) ne' quelli fissi (gli avvisi):
           li disegnerebbero a meta' pagina, sopra le righe. Solo per la foto
           si rimettono al loro posto nel flusso della pagina. */
        async function foto(nome, soloVista) {
            const stile = soloVista ? null : await page.addStyleTag({ content: '.testata,.anteprima-piede{position:static!important}.avvisi{display:none!important}' });
            await page.evaluate(() => window.scrollTo(0, 0));
            for (const [dispositivo, vista] of [['computer', { width: 1440, height: 900 }], ['tablet', { width: 820, height: 1180 }]]) {
                await page.setViewportSize(vista);
                await pausa(300);
                await page.screenshot({ path: path.join(FOTO, dispositivo + '-' + nome + '.png'), fullPage: !soloVista });
            }
            if (stile) await stile.evaluate(n => n.remove());
            await page.setViewportSize({ width: 1440, height: 900 });
            await pausa(150);
        }
        async function confermaDialogo(atteso) {
            await $('#dialogo-conferma').waitFor({ state: 'visible', timeout: 5000 });
            const titolo = await testo('#conferma-titolo');
            const corpo = await testo('#conferma-testo') + ' ' + await testo('#conferma-dettagli');
            if (atteso) vero(atteso.test(titolo + ' ' + corpo), 'conferma chiesta: «' + titolo + '»', corpo);
            await $('#conferma-ok').click();
            await $('#dialogo-conferma').waitFor({ state: 'hidden', timeout: 5000 });
            return titolo + ' ' + corpo;
        }
        const riga = n => $('#tabella-anteprima tr[data-riga="' + n + '"]');
        const classeRiga = async n => (await riga(n).getAttribute('class')) || '';

        /* ---------- 1. accesso ---------- */
        console.log('\n-- accesso del gestore');
        await page.goto(SITO + '/diretta/gestione/?emulatori=1');
        await $('#form-gestore').waitFor({ state: 'visible', timeout: 30000 });
        vero(await page.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')), 'la pagina ha la Content-Security-Policy');
        await foto('accesso', true);
        await $('#gestore-email').fill(EMAIL_GESTORE);
        await $('#gestore-password').fill('sbagliata-123');
        await $('#btn-gestore-entra').click();
        await aspetta(async () => /non corretti/.test(await testo('#msg-gestore')), 10000, 'messaggio password sbagliata');
        vero(true, 'password sbagliata: «' + await testo('#msg-gestore') + '»');

        await $('#link-gestore-reset').click();
        await aspetta(async () => /tra i gestori/.test(await testo('#msg-gestore')), 10000, 'primo accesso');
        const ga = chiamate('gestore-accesso');
        vero(ga.length === 1 && ga[0].dati.email === EMAIL_GESTORE, '«Primo accesso o password dimenticata» chiama diretta-accesso {azione: gestore-accesso} con l\'email scritta');

        await $('#gestore-email').fill(EMAIL_CURIOSO);
        await $('#gestore-password').fill(PASSWORD_CURIOSO);
        await $('#btn-gestore-entra').click();
        await aspetta(async () => /non è tra i gestori/.test(await testo('#msg-gestore')) && await visibile('#form-gestore'), 15000, 'rifiuto del non gestore');
        vero(true, 'un account che non è in elenco viene respinto e scollegato: «' + await testo('#msg-gestore') + '»');
        await $('#gestore-email').fill(EMAIL_NUOVO);
        await $('#gestore-password').fill(PASSWORD_NUOVO);
        await $('#btn-gestore-entra').click();
        await aspetta(async () => /Primo accesso o password dimenticata/.test(await testo('#msg-gestore')) && await visibile('#form-gestore'), 15000, 'gestore non attivato');
        vero(true, 'un gestore in elenco ma non ancora attivato riceve l\'indicazione giusta: «' + await testo('#msg-gestore') + '»');

        await $('#gestore-email').fill(EMAIL_GESTORE);
        await $('#gestore-password').fill(PASSWORD_GESTORE);
        await $('#btn-gestore-entra').click();
        await $('#vista-app').waitFor({ state: 'visible', timeout: 20000 });
        vero(await testo('#gestore-connesso') === EMAIL_GESTORE, 'gestore collegato: la testata mostra la sua email');
        vero(await page.locator('#sel-evento option[value="roma-2026"]').count() === 1, 'l\'elenco degli eventi arriva dal servizio (azione eventi)');

        /* ---------- 2. evento di Napoli ---------- */
        console.log('\n-- creazione dell\'evento di Napoli');
        await $('#btn-nuovo-evento').click();
        vero(await $('#tab-partecipanti').isDisabled(), 'con un evento nuovo non ancora salvato le altre schede sono spente');
        await $('#ev-titolo').fill('Next Generation Business 2026 · Napoli');
        await $('#ev-luogo').fill('Napoli · Hotel Eurostars Excelsior');
        await $('#ev-data').fill('2026-10-02');
        vero(await $('#ev-id').inputValue() === ID, 'identificativo proposto dal luogo e dall\'anno: ' + await $('#ev-id').inputValue());
        await $('#ev-ora-inizio').fill('17:30');
        await $('#ev-ora-fine').fill('09:00');
        await $('#ev-video').fill('https://www.youtube.com/live/abcdefghijk');
        await $('#ev-programma').fill('09.00 Accoglienza e registrazione\n09.30 Saluti istituzionali\n10:00 - Adeguati assetti e governance\n13.00 Pausa pranzo\n17.30 Chiusura dei lavori');
        await $('#ev-pagina').fill('napoli_ottobre_2026');
        await $('#ev-promemoria-giorno').check();
        await $('#btn-salva-evento').click();
        vero(await $('#ev-ora-fine').getAttribute('aria-invalid') === 'true' && /dopo quella di inizio/.test(await testo('#msg-evento')), 'fine prima dell\'inizio: errore sul campo, niente chiamata al servizio');
        vero(chiamate('evento-salva').length === 0, 'nessun salvataggio con dati sbagliati');
        await $('#ev-ora-inizio').fill('09:00');
        await $('#ev-ora-fine').fill('17:30');
        await $('#btn-salva-evento').click();
        await aspetta(async () => /Evento creato/.test(await testo('#msg-evento')), 10000, 'evento creato');
        const salvato = chiamate('evento-salva')[0].dati.evento;
        vero(salvato.nuovo === true && salvato.id === ID && salvato.paginaEvento === '/napoli_ottobre_2026/' && salvato.videoId === 'abcdefghijk',
            'evento-salva riceve id, pagina normalizzata e videoId ricavato dal link', JSON.stringify(salvato));
        vero(salvato.programma.length === 5 && salvato.programma[2].ora === '10.00' && salvato.programma[2].titolo === 'Adeguati assetti e governance',
            'programma letto riga per riga ("10:00 - Titolo" diventa {ora: "10.00", titolo})', JSON.stringify(salvato.programma));
        vero(await $('#sel-evento').inputValue() === ID && await testo('#stato-testata') === 'In attesa', 'evento selezionato, stato «In attesa» in testata');
        vero(await $('#ev-id').evaluate(n => n.readOnly), 'dopo la creazione l\'identificativo non si cambia più');
        await foto('evento');

        /* ---------- 3. caricamento e anteprima ---------- */
        console.log('\n-- caricamento di esempio-partecipanti.csv');
        await page.click('[data-scheda="partecipanti"]');
        const [modello] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), $('#link-modello').click()]);
        const testoModello = fs.readFileSync(await modello.path(), 'utf8');
        vero(modello.suggestedFilename() === 'modello-partecipanti.csv' && /^\ufeffnome;cognome;email;azienda\r\n/.test(testoModello), '«Scarica il modello CSV»: nome;cognome;email;azienda, con il BOM per Excel');
        await $('#file-partecipanti').setInputFiles(path.join(__dirname, 'esempio-partecipanti.csv'));
        await $('#anteprima-caricamento').waitFor({ state: 'visible', timeout: 20000 });
        await aspetta(async () => (await $('#tabella-anteprima tbody tr').count()) === 42 && /righe lette/.test(await testo('#riepilogo-anteprima')), 15000, 'anteprima con 42 righe');
        vero(true, 'anteprima: 42 righe (la riga vuota del file è saltata)');
        const attese = {
            2: ['esito-nuovo', 'omonimo', 'da-confermare'], 3: ['esito-nuovo', 'omonimo'], 4: ['esito-nuovo'], 5: ['esito-esistente'],
            6: ['esito-errore'], 7: ['esito-errore'], 8: ['esito-errore'], 9: ['esito-errore'], 10: ['esito-doppione'],
            11: ['esito-nuovo', 'omonimo', 'da-confermare'], 12: ['esito-nuovo', 'omonimo', 'da-confermare'], 13: ['esito-nuovo'],
            20: ['esito-nuovo', 'omonimo', 'da-confermare'], 31: ['esito-nuovo', 'omonimo', 'da-confermare'], 32: ['esito-errore'],
            34: ['esito-doppione'], 36: ['esito-doppione', 'da-confermare']
        };
        for (const n of Object.keys(attese)) {
            const cl = await classeRiga(n);
            vero(attese[n].every(c => cl.split(/\s+/).includes(c)), 'riga ' + n + ': ' + attese[n].join(' '), cl);
        }
        const nu = async n => riga(n).locator('input.nome-utente-riga').inputValue();
        vero(await nu(2) === 'mariorossi2' && await nu(11) === 'mariorossi3' && await nu(12) === 'mariorossi4', 'omonimi numerati: mariorossi2, mariorossi3, mariorossi4 (mariorossi è già di un altro)');
        vero(await nu(13) === 'ivanpetrov' && await nu(4) === 'nicolodangelo' && await nu(24) === 'carmeladauria' && await nu(25) === 'carloconti',
            'nomi utente: cirillico traslitterato, accenti e apostrofi (anche tipografici) tolti, spazi ripuliti');
        vero(await nu(5) === 'giuliaferri' && await riga(5).locator('input.nome-utente-riga').evaluate(n => n.readOnly), 'persona già presente (email con maiuscole e spazi): nome utente esistente, non modificabile');
        vero(/Altra Azienda/.test(await riga(2).locator('.problemi').textContent()), 'l\'omonimo dice chi usa già il nome (dettagliOccupati)');
        vero(await riga(2).locator('input.conferma-omonimo').count() === 1 && await riga(4).locator('input.conferma-omonimo').count() === 0, 'la casella di conferma c\'è solo sugli omonimi numerati');
        vero(await riga(36).locator('input.conferma-doppione').count() === 1, 'stessa email con nome diverso: casella «È la stessa persona»');
        vero(await riga(6).locator('input.campo-email').getAttribute('aria-invalid') === 'true', 'email mancante: campo segnato');
        vero(await $('#btn-crea-account').isDisabled(), 'con errori e omonimi da confermare il pulsante di creazione è spento');
        vero(/correggi o escludi 5 righe in errore/.test(await testo('#motivo-blocco')) && /conferma 5 omonimi/.test(await testo('#motivo-blocco')), 'il motivo del blocco è spiegato: «' + await testo('#motivo-blocco') + '»');
        const primaAnteprima = chiamate('anteprima')[0].dati;
        vero(primaAnteprima.emails.length === 37 && primaAnteprima.basi.includes('mariorossi') && primaAnteprima.idEvento === ID, 'anteprima: una chiamata con le email valide (' + primaAnteprima.emails.length + ') e le basi del file');
        const visibili = () => page.evaluate(() => Array.from(document.querySelectorAll('#tabella-anteprima tbody tr')).filter(t => !t.hidden).length);
        vero(await $('input[name="filtro-anteprima"][value="problemi"]').isChecked() && await visibili() === 16, 'con dei problemi si parte dal filtro «Solo da controllare» (16 righe)', await visibili());
        await foto('anteprima');
        await page.click('input[name="filtro-anteprima"][value="da-sistemare"] >> xpath=..');
        vero(await visibili() === 11, 'filtro «Solo da sistemare»: 11 righe (5 errori, 6 da confermare)', await visibili());
        await page.click('input[name="filtro-anteprima"][value="tutte"] >> xpath=..');
        vero(await visibili() === 42, 'filtro «Tutte»: 42 righe');

        console.log('\n-- correzioni in linea');
        const nAnteprima = chiamate('anteprima').length;
        await riga(7).locator('input.campo-email').fill('francesca.esposito@esposito.it');
        await aspetta(async () => (await classeRiga(7)).includes('esito-nuovo'), 5000, 'riga 7 corretta');
        vero(true, 'riga 7: email corretta, ora «nuovo account»');
        await riga(6).locator('input.campo-email').fill('luca.bianchi@bianchi-impianti.it');
        await riga(9).locator('input.campo-cognome').fill('Verdi');
        await riga(8).locator('input.escludi-riga').check();
        await riga(32).locator('input.nome-utente-riga').fill('wangxiaoming');
        await riga(36).locator('input.campo-email').fill('marco.galli@studiogalli.it');
        await aspetta(async () => (await classeRiga(8)).includes('esito-escluso') && (await classeRiga(6)).includes('esito-nuovo')
            && (await classeRiga(9)).includes('esito-nuovo') && (await classeRiga(32)).includes('esito-nuovo') && (await classeRiga(36)).includes('esito-nuovo'), 5000, 'correzioni');
        vero(true, 'righe 6, 9, 32, 36 corrette e riga 8 esclusa');
        vero(await nu(9) === 'paoloverdi' && await nu(32) === 'wangxiaoming' && await nu(36) === 'marcogalli', 'il nome utente segue le correzioni (anche quello scritto a mano)');
        await aspetta(() => chiamate('anteprima').length > nAnteprima, 5000, 'nuova anteprima');
        await aspetta(async () => !/Controllo dei dati/.test(await testo('#motivo-blocco')), 5000, 'fine controllo');
        const seconde = chiamate('anteprima').slice(nAnteprima).map(c => c.dati);
        const emailRichieste = [].concat.apply([], seconde.map(d => d.emails));
        vero(emailRichieste.includes('francesca.esposito@esposito.it') && emailRichieste.includes('marco.galli@studiogalli.it') && emailRichieste.length <= 4,
            'dopo le correzioni si chiedono al servizio solo le email nuove (' + emailRichieste.length + '), non tutto il file');
        // un nome utente scritto a mano gia' occupato
        await riga(44).locator('input.nome-utente-riga').fill('mariorossi');
        await aspetta(async () => (await classeRiga(44)).includes('esito-errore'), 5000, 'nome occupato');
        vero(/già usato/.test(await riga(44).locator('.problemi').textContent()), 'nome utente scritto a mano già occupato: errore sulla riga');
        await riga(44).locator('input.nome-utente-riga').fill('');
        await page.locator('#cerca-partecipanti').focus();
        await aspetta(async () => (await classeRiga(44)).includes('esito-nuovo') && await nu(44) === 'giorgiofontana', 5000, 'nome automatico');
        vero(true, 'svuotato il campo, torna il nome utente calcolato (giorgiofontana)');
        vero(await $('#btn-crea-account').isDisabled(), 'ancora spento: restano gli omonimi da confermare');
        await $('#btn-conferma-omonimi').click();
        await aspetta(async () => !(await $('#btn-crea-account').isDisabled()), 5000, 'pulsante acceso');
        vero(!(await classeRiga(2)).includes('da-confermare') && (await classeRiga(2)).includes('omonimo'), 'omonimi confermati: restano evidenziati, non più da confermare');
        vero(/Tutto pronto/.test(await testo('#motivo-blocco')) && /Crea 38 account e aggiungi 1 persona già registrata/.test(await testo('#btn-crea-account')),
            'pulsante acceso: «' + await testo('#btn-crea-account') + '»');

        /* ---------- 4. creazione a gruppi ---------- */
        console.log('\n-- creazione degli account');
        servizio.guastiCrea = 3;
        await $('#btn-crea-account').click();
        await confermaDialogo(/Creare 38 account.*NON partono/s);
        // il secondo gruppo fallisce tre volte (un tentativo e due nuovi tentativi): la pagina si ferma
        await $('#btn-riprendi-crea').waitFor({ state: 'visible', timeout: 20000 });
        vero(/Caricamento interrotto al gruppo 2 di 2.*Riprendi.*non si duplicano/.test(await testo('#avanzamento-crea .avanzamento-testo')) && servizio.creaFallite === 3,
            'servizio in errore a metà: dopo 3 tentativi la creazione si ferma e propone «Riprendi» (R18) — «' + await testo('#avanzamento-crea .avanzamento-testo') + '»');
        vero(await $('#btn-crea-account').isDisabled() && /Creazione interrotta/.test(await testo('#motivo-blocco')) && !(await $('#btn-annulla-caricamento').isDisabled()),
            'intanto «Crea» resta spento e si può anche annullare');
        await $('#btn-riprendi-crea').click();
        await $('#esito-crea').waitFor({ state: 'visible', timeout: 30000 });
        vero(true, '«Riprendi»: la creazione riparte dal gruppo interrotto e si completa');
        vero(JSON.stringify(servizio.creaGruppi) === JSON.stringify([25, 14]), 'crea chiamata a gruppi di 25: ' + JSON.stringify(servizio.creaGruppi));
        vero(servizio.creaQuando.length === 2 && servizio.creaQuando[1] - servizio.creaQuando[0] >= 290, 'pausa fra un gruppo e l\'altro (' + (servizio.creaQuando[1] - servizio.creaQuando[0]) + ' ms)');
        const inviate = servizio.creaEmail;
        vero(new Set(inviate).size === inviate.length && inviate.length === 39, 'nessuna email inviata due volte a crea (' + inviate.length + ' righe, tutte diverse)');
        const quante = em => inviate.filter(e => e === em).length;
        vero(!inviate.includes('giovanni.russo@russotrasporti.it') && quante('mario.rossi@rossi-srl.it') === 1 && quante('lucia.ferraro@ferraro.it') === 1 && quante('info@studiogalli.it') === 1,
            'a crea non arrivano la riga esclusa né i doppioni');
        const cambiato = $('#tabella-esito-crea tr.nome-cambiato');
        vero(await cambiato.count() === 1 && /nicolodangelo2/.test(await cambiato.textContent()), 'nome utente preso nel frattempo da un altro caricamento: evidenziato (nicolodangelo → nicolodangelo2)');
        vero(/38/.test(await testo('#esito-crea-riepilogo')) && /aggiunta all'evento/.test(await testo('#esito-crea-riepilogo')), 'riepilogo: 38 creati, 1 aggiunta all\'evento');
        const nomiCreati = Array.from(servizio.nomiUtente.keys());
        vero(new Set(nomiCreati).size === nomiCreati.length, 'zero nomi utente doppi nel finto servizio');

        /* ---------- 5. elenco e ricerca ---------- */
        console.log('\n-- elenco dei partecipanti');
        await aspetta(async () => (await $('#tabella-partecipanti tbody tr').count()) === 39, 10000, 'elenco con 39 persone');
        vero(true, 'elenco: 39 persone (38 nuove + Giulia già registrata)');
        const visibiliElenco = () => page.evaluate(() => Array.from(document.querySelectorAll('#tabella-partecipanti tbody tr')).filter(t => !t.hidden).map(t => t.dataset.uid));
        const cerca = async q => { await $('#cerca-partecipanti').fill(q); await pausa(80); return visibiliElenco(); };
        const uidDi = nome => Array.from(servizio.partecipanti.values()).find(p => p.nomeUtente === nome).uid;
        let v = await cerca('ivanpetrov');
        vero(v.length === 1 && v[0] === uidDi('ivanpetrov'), 'ricerca per nome utente');
        v = await cerca('deluca-figli.it');
        vero(v.length === 2, 'ricerca per email (2 persone di deluca-figli.it)', v.length);
        v = await cerca('Ferri Consulting');
        vero(v.length === 1 && v[0] === 'p-giulia', 'ricerca per azienda');
        v = await cerca('mario rossi');
        vero(v.length === 3, 'ricerca «mario rossi»: i tre omonimi', v.length);
        v = await cerca('NUNEZ');
        vero(v.length === 1, 'ricerca senza accenti e maiuscole («NUNEZ» trova Núñez)');
        await cerca('');
        vero((await visibiliElenco()).length === 39 && /\(39\)/.test(await testo('#conta-partecipanti')), 'ricerca vuota: tutti');
        await foto('partecipanti');

        console.log('\n-- azioni sul partecipante');
        const rp = nome => $('#tabella-partecipanti tr[data-uid="' + uidDi(nome) + '"]');
        await rp('ivanpetrov').locator('button[data-op="reinvia"]').click();
        await confermaDialogo(/Inviare adesso le credenziali/);
        await aspetta(async () => (await rp('ivanpetrov').locator('.stato-email').textContent()) === 'inviata', 5000, 'invio');
        vero(true, '«Invia ora»: stato email della persona «inviata», con il colore giusto');
        vero(/stato-inviata/.test(await rp('ivanpetrov').locator('.stato-email').getAttribute('class')), 'classe stato-inviata');
        await rp('ivanpetrov').locator('button[data-op="reinvia"]').click();
        const avvisoReinvio = await confermaDialogo(/Reinviare le credenziali/);
        vero(/smetterà di funzionare.*entro un'ora/s.test(avvisoReinvio), 'il reinvio avverte che la password attuale smette di funzionare (T9)');
        await rp('annamariadeluca').locator('summary').click();
        await rp('annamariadeluca').locator('button[data-op="rigenera"]').click();
        await confermaDialogo(/Nuova password|nuova password/);
        await $('#dialogo-password').waitFor({ state: 'visible', timeout: 5000 });
        const pw = await testo('#password-mostrata');
        vero(/^[A-HJ-NP-Za-km-z2-9]{10}$/.test(pw) && await testo('#password-nome-utente') === 'annamariadeluca', 'nuova password mostrata una volta, in chiaro solo nella finestra');
        await foto('password', true);
        await $('#btn-chiudi-password').click();
        vero(await testo('#password-mostrata') === '', 'chiusa la finestra, la password sparisce dalla pagina');
        await rp('robertomoretti').locator('summary').click();
        await rp('robertomoretti').locator('button[data-op="disattiva"]').click();
        await confermaDialogo(/Disattivare l'account/);
        await aspetta(async () => /disattivato/.test(await rp('robertomoretti').getAttribute('class') || ''), 5000, 'disattivato');
        vero(await rp('robertomoretti').locator('button[data-op="riattiva"]').count() === 1, 'disattivato: la riga lo dice e offre «Riattiva»');
        await rp('sarabarbieri').locator('summary').click();
        await rp('sarabarbieri').locator('button[data-op="rimuovi-evento"]').click();
        await confermaDialogo(/Togliere da questo evento/);
        await aspetta(async () => (await $('#tabella-partecipanti tbody tr').count()) === 38, 5000, 'tolta');
        vero(true, '«Togli da questo evento»: la persona sparisce dall\'elenco dell\'evento (l\'account resta)');
        // correzione con ricalcolo del nome utente
        await rp('chloelhoteldupont').locator('button[data-op="correggi"]').click();
        await $('#dialogo-correggi').waitFor({ state: 'visible' });
        await $('#corr-cognome').fill('Dupont');
        vero(/chloedupont/.test(await testo('#corr-anteprima-nome')) && await $('#corr-scelta-nome').isHidden(), 'la finestra mostra il nuovo nome utente prima di salvare');
        await $('#btn-corr-salva').click();
        await $('#dialogo-correggi').waitFor({ state: 'hidden' });
        await aspetta(async () => (await page.locator('#tabella-partecipanti td.col-nome-utente', { hasText: /^chloedupont$/ }).count()) === 1, 5000, 'nome ricalcolato');
        vero(true, 'correzione del cognome: nome utente ricalcolato (chloelhoteldupont → chloedupont)');
        // credenziali gia' partite: si chiede se tenere il nome utente (R3)
        await rp('ivanpetrov').locator('button[data-op="correggi"]').click();
        await $('#corr-cognome').fill('Petrova');
        vero(await $('#corr-scelta-nome').isVisible(), 'credenziali già inviate e nome che cambierebbe: si chiede se mantenerlo');
        await $('#btn-corr-salva').click();
        await $('#dialogo-correggi').waitFor({ state: 'hidden' });
        const corr = chiamate('partecipante').filter(c => c.dati.operazione === 'correggi').pop().dati;
        vero(corr.mantieniNomeUtente === true && servizio.partecipanti.get(uidDi('ivanpetrov')).cognome === 'Petrova', 'scelta predefinita «Mantieni»: mantieniNomeUtente true, nome utente invariato');
        // email gia' di un altro: 409 mostrato nella finestra
        await rp('elenaricci').locator('button[data-op="correggi"]').click();
        await $('#corr-email').fill('giulia.ferri@esempio.it');
        await $('#btn-corr-salva').click();
        await aspetta(async () => /già di un altro/.test(await testo('#msg-correggi')), 5000, '409');
        vero(await $('#corr-email').getAttribute('aria-invalid') === 'true', 'email già usata da un\'altra persona: errore nella finestra, niente salvato');
        await $('#btn-corr-annulla').click();

        /* ---------- 6. regia ---------- */
        console.log('\n-- regia');
        await page.click('[data-scheda="regia"]');
        await aspetta(async () => await testo('#num-connessi') === '37', 5000, 'collegati');
        vero(await testo('#regia-stato-testo') === 'IN ATTESA', 'stato grande: IN ATTESA');
        vero(true, 'contatore dei collegati: 37, con l\'orario di aggiornamento');
        await $('#btn-in-onda').click();
        const domandaOnda = await confermaDialogo(/Mandare in onda.*Il video è impostato/s);
        vero(/previsto per venerdì 2 ottobre 2026, non per oggi/.test(domandaOnda), 'oggi non è il giorno dell\'evento: la conferma lo dice (evento sbagliato nel menu?)');
        await aspetta(async () => await $('#regia-stato').getAttribute('data-stato') === 'in_onda', 5000, 'in onda');
        vero(await testo('#regia-stato-testo') === 'IN ONDA' && await testo('#stato-testata') === 'In onda', 'IN ONDA, grande in regia e in testata');
        vero(await $('#btn-in-onda').isDisabled() && !(await $('#btn-termina').isDisabled()) && !(await $('#btn-pausa').isDisabled()), 'in onda: «Vai in onda» spento, «Termina» e «Pausa» accesi');
        const primaDelTimer = chiamate('connessi').length;
        await page.clock.fastForward(21000);
        await aspetta(async () => chiamate('connessi').length > primaDelTimer && await testo('#num-connessi') !== '37', 5000, 'aggiornamento dei collegati');
        vero(true, 'dopo 20 secondi il contatore si aggiorna da solo (' + await testo('#num-connessi') + ')');
        // il video: prima provato con il player, poi cambiato per tutti
        const conPlayer = await page.evaluate(() => !!(window.NGBPlayer && window.NGBPlayer.crea));
        if (conPlayer) {
            await $('#regia-video').fill('https://youtu.be/errore12345');
            await $('#btn-cambia-video').click();
            await aspetta(async () => /non si può usare/.test(await testo('#msg-video')), 15000, 'errore del video');
            vero(chiamate('evento-video').length === 0, 'video non incorporabile (errore 150 del player): bloccato con il motivo, niente cambiato — «' + await testo('#msg-video') + '»');
        } else vero(true, '(player-youtube.js assente: prova dell\'errore del video saltata)');
        await $('#regia-video').fill('https://www.youtube.com/watch?v=zyxwvutsrqp');
        await $('#btn-cambia-video').click();
        await confermaDialogo(/Cambiare il video per tutti/);
        await aspetta(async () => /zyxwvutsrqp/.test(await testo('#regia-video-attuale')), 15000, 'video cambiato');
        const cv = chiamate('evento-video').pop().dati;
        vero(cv.videoId === 'zyxwvutsrqp' && cv.videoUrl === 'https://www.youtube.com/watch?v=zyxwvutsrqp', 'evento-video riceve videoUrl e videoId (R21)');
        if (conPlayer) vero(await $('#regia-video-anteprima').isVisible() && await page.evaluate(() => (window.__fintoYT.comandi || []).length >= 0), 'anteprima del video in regia con lo stesso player dei partecipanti');
        // avviso a tutti
        await $('#regia-avviso').fill('Problema tecnico: torniamo tra 5 minuti');
        await $('#btn-avviso').click();
        await confermaDialogo(/Pubblicare l'avviso/);
        await aspetta(async () => /torniamo tra 5 minuti/.test(await testo('#regia-avviso-attuale')), 5000, 'avviso');
        vero(chiamate('evento-avviso').pop().dati.avviso === 'Problema tecnico: torniamo tra 5 minuti', 'avviso a tutti pubblicato (evento-avviso)');
        // pausa con orario di ripresa e ripresa
        await $('#regia-ripresa').fill('14:30');
        await $('#btn-pausa').click();
        await confermaDialogo(/Mettere in pausa.*14\.30/s);
        await aspetta(async () => await $('#regia-stato').getAttribute('data-stato') === 'pausa', 5000, 'pausa');
        vero(await testo('#regia-stato-testo') === 'IN PAUSA' && /si riprende alle 14\.30/.test(await testo('#regia-orari')) && await $('#btn-riprendi').isVisible(), 'pausa: IN PAUSA, orario di ripresa, pulsante «Riprendi»');
        vero(chiamate('evento-stato').pop().dati.ripresa === '14:30', 'evento-stato {stato: pausa, ripresa: 14:30}');
        await $('#btn-riprendi').click();
        await confermaDialogo(/Riprendere la diretta/);
        await aspetta(async () => await $('#regia-stato').getAttribute('data-stato') === 'in_onda', 5000, 'ripresa');
        vero(true, 'ripresa: di nuovo IN ONDA');
        // termina: la conferma dice quanti sono collegati; qui si annulla
        await $('#btn-termina').click();
        await $('#dialogo-conferma').waitFor({ state: 'visible' });
        vero(/Terminare la diretta per tutti \(\d+ collegati\)/.test(await testo('#conferma-titolo')), 'la conferma di «Termina» dice quante persone sono collegate: «' + await testo('#conferma-titolo') + '»');
        vero(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'conferma-annulla', 'per «Termina» il fuoco parte da «Annulla»');
        await page.keyboard.press('Escape');
        await $('#dialogo-conferma').waitFor({ state: 'hidden' });
        vero(await $('#regia-stato').getAttribute('data-stato') === 'in_onda', 'Esc annulla: la diretta resta in onda');
        // vedi come un partecipante
        const [nuovaScheda] = await Promise.all([context.waitForEvent('page'), $('#btn-anteprima').click()]);
        await nuovaScheda.waitForLoadState('domcontentloaded').catch(() => {});
        vero(/\/diretta\/\?anteprima=napoli-2026&emulatori=1$/.test(nuovaScheda.url()), '«Vedi come un partecipante» apre /diretta/?anteprima=napoli-2026 in una nuova scheda');
        if (fs.existsSync(path.join(RADICE, 'diretta/diretta.js'))) {
            // stessa app Firebase (nome predefinito) = stessa sessione: la pagina
            // dei partecipanti riconosce il gestore senza chiedere un nuovo accesso
            const vistaAnteprima = await aspetta(async () => {
                const vv = await nuovaScheda.evaluate(() => document.body.dataset.vista || '');
                return vv && vv !== 'caricamento' ? vv : '';
            }, 20000, 'vista dell\'anteprima').catch(e => 'errore: ' + e.message);
            vero(vistaAnteprima !== 'accesso' && !/^errore/.test(vistaAnteprima), 'la pagina della diretta riconosce il gestore già collegato (vista «' + vistaAnteprima + '», non l\'accesso)');
        }
        await nuovaScheda.close();
        await foto('regia');

        /* ---------- 7. email ---------- */
        console.log('\n-- email');
        await page.click('[data-scheda="email"]');
        await aspetta(async () => /\(36\)/.test(await testo('#btn-invia-tutti')), 5000, 'conteggi email');
        // l'etichetta del pulsante puo' arrivare (dall'elenco) prima dei conteggi (da email-stato)
        const conteggiOk = await aspetta(async () => await testo('#conteggi-email li[data-stato="da inviare"] .conteggio-num') === '37'
            && await testo('#conteggi-email li[data-stato="inviata"] .conteggio-num') === '1', 5000, 'conteggi').catch(() => false);
        vero(conteggiOk, 'conteggi per stato: 37 da inviare, 1 inviata (quella mandata a mano)', await testo('#conteggi-email'));
        vero(true, 'il pulsante dice a quante persone partirà davvero: (36), l\'account disattivato non si conta');
        await $('#sel-tipo-prova').selectOption('credenziali');
        await $('#btn-email-prova').click();
        await aspetta(async () => /Email di prova inviata a gestore@prova\.it/.test(await testo('#msg-email-prova')), 5000, 'prova');
        vero(chiamate('email-prova').pop().dati.tipo === 'credenziali', '«Invia email di prova a me» (tipo credenziali)');
        await $('#btn-invia-tutti').click();
        await confermaDialogo(/Inviare le credenziali a 36 persone/);
        await aspetta(async () => /Invio completato/.test(await testo('#avanzamento-email .avanzamento-testo')), 60000, 'invio completato');
        const k = servizio.conteggi(ID);
        vero(k.inviata === 36 && k.respinta === 1 && k['in coda'] === 0 && k['da inviare'] === 1, 'invio a tutti completato (resta solo l\'account disattivato): ' + JSON.stringify(k));
        const aq = servizio.avanzaQuando;
        const intervalli = aq.slice(1).map((t, i) => t - aq[i]);
        vero(aq.length >= 4 && intervalli.every(x => x >= 1900), 'email-avanza in ciclo con una pausa di 2 s fra le chiamate (' + aq.length + ' chiamate, minimo ' + Math.min.apply(null, intervalli) + ' ms)');
        vero(await testo('#conteggi-email li[data-stato="inviata"] .conteggio-num') === '36' && await testo('#conteggi-email li[data-stato="respinta"] .conteggio-num') === '1', 'i conteggi colorati si aggiornano (36 inviate, 1 respinta)');
        await aspetta(async () => /\(1\)/.test(await testo('#btn-reinvia-non-ricevute')), 5000, 'non ricevute');
        vero(/1 persona «da inviare» ha l'account disattivato/.test(await testo('#nota-disattivati')), 'la scheda spiega perché «1 da inviare» non parte: account disattivato');
        await foto('email');
        await $('#btn-reinvia-non-ricevute').click();
        await confermaDialogo(/Reinviare a chi non l'ha ricevuta/);
        await aspetta(() => chiamate('email-accoda').some(c => c.dati.chi === 'non-ricevuta'), 5000, 'riaccodata');
        vero(true, '«Reinvia a chi non l\'ha ricevuta» riaccoda con chi: non-ricevuta');
        await aspetta(async () => /Invio completato/.test(await testo('#avanzamento-email .avanzamento-testo')), 30000, 'secondo invio');
        await $('#btn-aggiorna-esiti').click();
        await aspetta(async () => /manca BREVO_API_KEY/.test(await testo('#msg-email')), 5000, 'esiti');
        vero(true, 'senza BREVO_API_KEY la gestione lo dice (R13)');
        await page.click('[data-scheda="partecipanti"]');
        vero(/stato-respinta/.test(await rp('chloedupont').locator('.stato-email').getAttribute('class')), 'nell\'elenco la persona respinta ha lo stato rosso «respinta»');

        /* ---------- 8. esportazione ---------- */
        console.log('\n-- esportazione');
        await page.click('[data-scheda="esporta"]');
        const [scarico] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), $('#btn-esporta').click()]);
        const nomeFile = scarico.suggestedFilename();
        vero(/^diretta-napoli-2026-\d{8}-\d{4}\.xlsx$/.test(nomeFile), 'file scaricato: ' + nomeFile);
        const doveFile = path.join(RISULTATI, 'gestione-esportazione.xlsx');
        await scarico.saveAs(doveFile);
        const wb = XLSX.read(fs.readFileSync(doveFile), { type: 'buffer' });
        vero(JSON.stringify(wb.SheetNames) === JSON.stringify(['Partecipanti', 'Accessi']), 'due fogli: ' + wb.SheetNames.join(', '));
        const fp = XLSX.utils.sheet_to_json(wb.Sheets.Partecipanti, { header: 1, defval: '' });
        const fa = XLSX.utils.sheet_to_json(wb.Sheets.Accessi, { header: 1, defval: '' });
        vero(fp[0].join('|') === 'Nome utente|Nome|Cognome|Email|Azienda|Account|Email credenziali|Inviata il|Primo collegamento|Ultimo segnale|Minuti collegati (durante la diretta)|Collegamenti|Ultimo accesso',
            'colonne del foglio Partecipanti come da contratto');
        vero(fa[0].join('|') === 'Quando|Nome utente|Nome|Cognome|Azienda|Dispositivo' && fa.length === 3, 'foglio Accessi con le sue colonne e 2 accessi');
        const ivan = fp.find(r => r[0] === 'ivanpetrov');
        vero(ivan && ivan[10] === 510 && ivan[11] === 2, 'minuti limitati alla durata dell\'evento: 40000 s collegati -> 510 minuti (8 ore e mezza)', ivan && ivan.join('|'));
        vero(ivan && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(ivan[8]) && ivan[8] === '02/10/2026 09:03', 'date in ora di Roma «02/10/2026 09:03»', ivan && ivan[8]);
        vero(fp.filter(r => r[0] && r[0] !== 'Nome utente' && !/^Minuti stimati/.test(r[0])).length === 38 && /^Minuti stimati/.test(fp[fp.length - 1][0]), '38 partecipanti e, in fondo, la nota sui minuti (T13)');
        vero(/Scaricato/.test(await testo('#msg-esporta')), 'messaggio di conferma dell\'esportazione');

        /* ---------- 9. file con colonne da abbinare, piu' fogli, codifica ---------- */
        console.log('\n-- abbinamento delle colonne e codifica');
        await page.click('[data-scheda="partecipanti"]');
        const wbProva = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wbProva, XLSX.utils.aoa_to_sheet([['Note'], ['Elenco degli iscritti nel secondo foglio']]), 'Note');
        XLSX.utils.book_append_sheet(wbProva, XLSX.utils.aoa_to_sheet([
            ['Nominativo', 'Posta elettronica', 'Ragione sociale'],
            ['De Luca Anna Maria', 'annamaria.deluca@deluca-figli.it', 'De Luca & Figli S.p.A.'],
            ['Bruno Carla', 'carla.bruno@bruno.it', 'Bruno Srl'],
            ['Van der Berg Jan', 'jan@vanderberg.nl', 'VDB BV']
        ]), 'Iscritti');
        const bufXlsx = Buffer.from(XLSX.write(wbProva, { type: 'array', bookType: 'xlsx' }));
        await $('#file-partecipanti').setInputFiles({ name: 'iscritti-due-fogli.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bufXlsx });
        await $('#abbina-colonne').waitFor({ state: 'visible', timeout: 10000 });
        vero(await $('#scelta-foglio').isVisible() && await $('#btn-abbina-continua').isDisabled(), 'più fogli: selettore del foglio; nel primo foglio non ci sono le colonne -> passo «abbina le colonne»');
        await $('#sel-foglio').selectOption('Iscritti');
        await aspetta(() => $('#abb-ordine').isVisible(), 5000, 'ordine');
        vero(await $('#abb-email').inputValue() === '1' && await $('#abb-azienda').inputValue() === '2' && await $('#abb-nome').inputValue() === '0',
            'foglio «Iscritti»: riconosciute «Nominativo» (nome e cognome insieme), «Posta elettronica», «Ragione sociale»');
        await page.click('input[name="abb-ordine"][value="cognome-nome"] >> xpath=..');
        const esempio = await page.evaluate(() => Array.from(document.querySelectorAll('#abb-esempio tbody tr')).map(tr => Array.from(tr.cells).map(c => c.textContent)));
        vero(esempio[0][1] === 'Anna Maria' && esempio[0][2] === 'De Luca' && esempio[2][1] === 'Jan' && esempio[2][2] === 'Van der Berg', 'ordine «Cognome Nome»: il cognome si prende con le particelle (De Luca, Van der Berg)', JSON.stringify(esempio));
        await $('#btn-abbina-continua').click();
        await aspetta(async () => (await $('#tabella-anteprima tbody tr').count()) === 3, 10000, 'anteprima abbinata');
        vero((await classeRiga(2)).includes('esito-gia-nell-evento'), 'Anna Maria De Luca è già nell\'evento: nessun nuovo account');
        await $('#btn-annulla-caricamento').click();
        const csvRotto = Buffer.from('nome;cognome;email\nNicolÃ²;Rossi;nicolo@esempio.it\nAnna;Neri;anna.neri@esempio.it\n', 'utf8');
        await $('#file-partecipanti').setInputFiles({ name: 'codifica-sbagliata.csv', mimeType: 'text/csv', buffer: csvRotto });
        await aspetta(async () => (await $('#tabella-anteprima tbody tr').count()) === 2 && /righe lette/.test(await testo('#riepilogo-anteprima')), 10000, 'anteprima codifica');
        vero((await classeRiga(2)).includes('esito-errore') && /codifica/.test(await riga(2).locator('.problemi').textContent()), 'caratteri «Ã²»: problema grave «codifica del file sbagliata» (R9)');
        await $('#btn-annulla-caricamento').click();

        // lo stesso file caricato di nuovo: niente da creare
        await $('#file-partecipanti').setInputFiles(path.join(__dirname, 'esempio-partecipanti.csv'));
        await aspetta(async () => (await $('#tabella-anteprima tbody tr').count()) === 42 && /righe lette/.test(await testo('#riepilogo-anteprima')), 15000, 'ricarico');
        const esiti = await page.evaluate(() => Array.from(document.querySelectorAll('#tabella-anteprima tbody tr')).map(t => t.className));
        vero(!esiti.some(c => /esito-nuovo/.test(c)) && esiti.filter(c => /esito-gia-nell-evento/.test(c)).length >= 30,
            'lo stesso file ricaricato: nessun nuovo account, ' + esiti.filter(c => /esito-gia-nell-evento/.test(c)).length + ' righe «già nell\'evento»');
        // Sara Barbieri era stata tolta dall'evento: ha gia' l'account, torna solo nell'evento
        vero(esiti.filter(c => /esito-esistente/.test(c)).length === 1 && (await classeRiga(42)).includes('esito-esistente'),
            'la persona tolta dall\'evento risulta «già registrata, da aggiungere» (nessun secondo account)');
        vero(await $('#btn-crea-account').isDisabled(), 'con le righe originali in errore il pulsante resta spento');
        await $('#btn-annulla-caricamento').click();

        /* ---------- 10. accessibilita' e tastiera ---------- */
        console.log('\n-- accessibilità');
        const senzaNome = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll('input, select, textarea').forEach(n => {
                if (n.type === 'hidden') return;
                const etichetta = n.getAttribute('aria-label') || (n.id && document.querySelector('label[for="' + n.id + '"]')) || n.closest('label');
                if (!etichetta) out.push(n.id || n.className || n.name);
            });
            return out;
        });
        vero(senzaNome.length === 0, 'ogni campo ha un\'etichetta', senzaNome.join(', '));
        await $('#tab-evento').click();
        await $('#tab-evento').focus();
        await page.keyboard.press('ArrowRight');
        vero(await $('#tab-regia').getAttribute('aria-selected') === 'true' && await page.evaluate(() => document.activeElement.id) === 'tab-regia', 'schede: le frecce spostano la scheda attiva (role="tab")');
        await page.keyboard.press('End');
        vero(await $('#tab-esporta').getAttribute('aria-selected') === 'true', 'schede: Fine porta all\'ultima');

        /* ---------- 11. la sessione resta, poi si esce ---------- */
        console.log('\n-- sessione');
        await page.reload();
        await $('#vista-app').waitFor({ state: 'visible', timeout: 20000 });
        vero(await testo('#gestore-connesso') === EMAIL_GESTORE && await $('#sel-evento').inputValue() === ID, 'ricaricando la pagina la sessione resta aperta e l\'evento resta scelto');
        await $('#btn-gestore-esci').click();
        await $('#form-gestore').waitFor({ state: 'visible', timeout: 10000 });
        vero(true, '«Esci»: di nuovo alla schermata di accesso');

        /* ---------- 12. errori della pagina ---------- */
        const csp = await page.evaluate(() => window.__violazioniCSP);
        vero(csp.length === 0, 'nessuna violazione della Content-Security-Policy', csp.join('\n'));
        vero(erroriPagina.length === 0, 'nessun errore JavaScript nella pagina', erroriPagina.join('\n'));
        // attesi: le risposte 4xx provocate apposta (password sbagliata, non gestore, email gia' usata),
        // i 503 del guasto simulato durante la creazione
        // e lo script in linea del finto YouTube (srcdoc), che la CSP vera blocca come deve
        const inattesi = erroriConsole.filter(t => !/Failed to load resource: the server responded with a status of (400|401|403|409|503)/.test(t)
            && !/Refused to execute inline script/.test(t));
        vero(inattesi.length === 0, 'nessun errore inatteso nella console', inattesi.join('\n'));
    } catch (e) {
        rossi++;
        console.log('ROSSO la prova si è interrotta: ' + (e && e.stack || e));
    } finally {
        if (browser) await browser.close().catch(() => {});
        await ferma(server);
        await ferma(emulatori);
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi (' + Math.round((Date.now() - t0) / 1000) + ' s)');
    console.log('screenshot in ' + path.relative(process.cwd(), FOTO));
    process.exit(rossi ? 1 : 0);
})();
