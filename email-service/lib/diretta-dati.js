/* ============================================================
   Diretta degli eventi: i dati (eventi, partecipanti, presenze)
   ------------------------------------------------------------
   Qui sta la logica che la gestione (api/diretta-gestione.js) e
   l'accesso (lib/diretta-accesso.js) usano per leggere e scrivere
   Firestore e Firebase Auth del progetto della diretta. Le funzioni
   api/ restano sottili: leggono la richiesta, controllano chi chiama
   e passano di qui.

   LE TRE GARANZIE CONTRO I DOPPIONI (vedi `crea`):
   1. una email = un account: l'indirizzo si PRENOTA nel documento
      indirizzi/{emailNormalizzata}, dentro una transazione;
   2. un nome utente = una persona: anche il nome si prenota, in
      nomiUtente/{nomeUtente}, nella STESSA transazione;
   3. l'account Firebase Auth ha come uid quello scritto nella
      prenotazione, generato prima della transazione: se due
      caricamenti arrivano insieme, o se lo stesso file si ricarica
      dopo un errore, l'account e' sempre lo stesso e al massimo si
      completa.
   Cosi' nemmeno due caricamenti contemporanei dello stesso file
   possono creare due volte la stessa persona o lo stesso nome.

   IL VIDEO. Arriva SOLO dalla web TV Azoto, in una delle due modalita'
   che la gestione sceglie per ogni evento (tipoPlayer):
     'azoto'   il player di Azoto in un iframe (la predefinita);
     'flusso'  il flusso diretto (.m3u8, o .mpd) nel nostro player,
               per quando Azoto ce lo dara'.
   Gli indirizzi e la firma dei link a tempo vivono in
   eventiRiservati/{id}, che solo il server legge:
     tipoPlayer               'azoto' | 'flusso' (assente = 'azoto')
     azotoUrl                 l'indirizzo del player di Azoto ('' se
                              non c'e' ancora): del codice incollato si
                              salva SOLO l'indirizzo, e solo se e' di
                              cdn.azotosolutions.com
     videoUrl, videoId        il flusso principale (pulito) e il valore
                              che riceve il player (solo HLS o DASH)
     riservaUrl, riservaId    il flusso di riserva ('' se non c'e')
     firma                    { schema, segreto, durataOre, parametri }
                              (lib/diretta-firma.js): il segreto non
                              esce MAI dal servizio
   Flusso, riserva e firma valgono solo per la modalita' 'flusso'.
   Nel documento pubblico dell'evento (quello che la pagina ascolta)
   tipoPlayer c'e' sempre (la pagina sceglie il player); videoId (in
   modalita' 'azoto' l'indirizzo di Azoto, in modalita' 'flusso' il
   flusso principale) compare SOLO mentre si e' in onda: prima e dopo,
   chi ha un account non puo' ricavarlo. Solo per il flusso e solo in
   onda anche videoRiserva e videoFirmato (la pagina chiede il link
   firmato al servizio); `sorgente` ('principale' o 'riserva': la
   scelta della regia per tutti) resta anche fuori onda.
   videoAggiornato cambia quando cambia uno di questi campi (anche
   tipoPlayer) e a ogni comando della regia (evento-sorgente,
   evento-player), anche quando conferma la scelta di prima.

   IL DOCUMENTO DELL'EVENTO COSTA CARO. Mille persone lo ascoltano: ogni
   scrittura sono mille letture. Per questo qui si scrive solo quando
   qualcosa cambia davvero, e mai contatori o dati che si muovono.
   ============================================================ */
'use strict';
const crypto = require('crypto');
const C = require('./diretta-comune');
const N = require('./diretta-nome-utente');
const V = require('./diretta-sorgente-video');
const F = require('./diretta-firma');
const { indirizzoPubblico, eIndirizzoIp } = require('./diretta-prova-link');
const { passwordSegreta, generaPassword } = require('./diretta-password');
const { conLimite } = require('./diretta-auth');

const RE_ID_EVENTO = /^[a-z0-9][a-z0-9-]{2,40}$/;
const RE_UID = /^[A-Za-z0-9_-]{1,128}$/;
const RE_PAGINA = /^\/[a-z0-9_\/-]*\/?$/;
const SORGENTI = ['principale', 'riserva'];
const TIPI_PLAYER = ['azoto', 'flusso'];
const MSG_SERVE_FLUSSO = 'Per il flusso diretto serve prima il link .m3u8: inseriscilo nel campo «Flusso diretto (.m3u8)».';
const MSG_SERVE_AZOTO = 'Per il player Azoto serve prima il suo indirizzo: incolla il codice (o l\'indirizzo) del player nel campo «Player Azoto».';
const MSG_FLUSSO_IN_USO = 'Il flusso diretto è in uso per tutti: per togliere il link .m3u8 torna prima al player Azoto.';
const STATI_EVENTO = ['programmato', 'in_onda', 'pausa', 'terminato'];
const MAX_EVENTI_PERSONA = 20;
const MAX_RIGHE_CREA = 50;
const CONCORRENZA_CREA = 5;
const CANDIDATI_PER_BLOCCO = 10;
const MAX_BLOCCHI = 6;
const MAX_ANTEPRIMA = 5000;
const MAX_PROGRAMMA = 40;
const FINESTRA_CONNESSI_MS = 150 * 1000;

/* ---------- attrezzi ---------- */

// Timestamp di Firestore -> millisecondi (le risposte JSON parlano in numeri)
function ms(v) {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    if (typeof v.toMillis === 'function') return v.toMillis();
    return null;
}
function jsonDi(dati) {
    const out = {};
    Object.keys(dati || {}).forEach(k => {
        const v = dati[k];
        out[k] = v && typeof v.toMillis === 'function' ? v.toMillis() : v;
    });
    return out;
}
function adessoTs(ctx) {
    return ctx.Timestamp.fromMillis(ctx.adesso());
}

/* Errore da mostrare cosi' com'e' a chi ha chiamato, anche con dati in
   piu' (i secondi da aspettare, i tentativi rimasti). */
function errorePubblico(stato, codice, msg, dati) {
    const e = C.errore(stato, msg, codice);
    e.pubblico = true;
    e.dati = dati || null;
    return e;
}
/* Il motivo di un errore, pronto per i log: i messaggi di Firestore e di
   Auth possono contenere il percorso di un documento (indirizzi/<email>)
   o un indirizzo: gli indirizzi si mascherano sempre. */
function perLog(e) {
    const testo = String((e && ((e.code ? e.code + ' ' : '') + (e.message || ''))) || e || '');
    return testo.replace(/[^\s/@'"]+@[^\s/'"]+/g, '<email>').slice(0, 300);
}

/* Risposta di errore delle funzioni della diretta.
   - Gli errori "pubblici" passano con il loro testo e i loro dati (i
     secondi da aspettare, i tentativi rimasti).
   - Gli errori previsti (con uno stato HTTP, scritti per le persone)
     passano con il loro testo; sopra i 500 solo se chi chiama e' un
     gestore (`dettagli`): all'accesso pubblico basta una frase generica.
   - Gli errori imprevisti: motivo tecnico nei log (mascherato), alla
     persona una frase generica. */
function rispondi(res, e, contesto, dettagli) {
    const stato = (e && e.stato) || 500;
    if (stato >= 500) console.error('[diretta] ' + (contesto || '') + ': ' + perLog(e));
    if (e && e.pubblico) {
        res.status(stato).json(Object.assign({ ok: false, codice: e.codice, msg: e.message }, e.dati || {}));
        return;
    }
    const mostra = e && e.stato && (stato < 500 || dettagli);
    res.status(stato).json({
        ok: false, codice: (e && e.codice) || 'errore',
        msg: mostra ? String(e.message || 'Richiesta non valida') : 'Errore del servizio: riprova tra poco.'
    });
}

function controllaIdEvento(id) {
    const s = String(id || '').trim();
    if (!RE_ID_EVENTO.test(s)) throw C.errore(400, 'Evento non valido.', 'evento');
    return s;
}
function controllaUid(uid) {
    const s = String(uid || '').trim();
    if (!RE_UID.test(s)) throw C.errore(400, 'Partecipante non valido.', 'uid');
    return s;
}

// l'uid dei partecipanti: casuale, MAI ricavato dal nome (DECISIONI D1)
function nuovoUid() {
    return 'p' + crypto.randomBytes(10).toString('hex');
}

/* La lista degli eventi di una persona: l'ultimo aggiunto in testa,
   senza ripetizioni, al massimo 20. E' la stessa lista che va nei
   claims del token: le regole di Firestore la leggono da li'. */
function listaEventi(eventi, idEvento) {
    const altri = (Array.isArray(eventi) ? eventi : []).filter(x => typeof x === 'string' && x && x !== idEvento);
    return (idEvento ? [idEvento] : []).concat(altri).slice(0, MAX_EVENTI_PERSONA);
}
function stessaLista(a, b) {
    return JSON.stringify(Array.isArray(a) ? a : []) === JSON.stringify(Array.isArray(b) ? b : []);
}

// nomi e cognomi: niente caratteri di controllo e niente < > (DECISIONI D3)
function sospetto(s) {
    return /[\u0000-\u001f\u007f<>]/.test(String(s || ''));
}

/* Tanti lavori, al massimo n alla volta, risultati nello stesso ordine. */
async function inParallelo(elenco, n, fn) {
    const risultati = new Array(elenco.length);
    let prossimo = 0;
    async function operaio() {
        while (prossimo < elenco.length) {
            const i = prossimo++;
            risultati[i] = await fn(elenco[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(n, elenco.length) }, operaio));
    return risultati;
}

/* Le transazioni che si contendono gli stessi documenti (due caricamenti
   di tanti "Mario Rossi" insieme) possono essere interrotte da Firestore
   con ABORTED dopo i loro tentativi interni: si riprova con un'attesa
   casuale crescente, cosi' non ripartono tutte nello stesso istante. */
async function conRiprova(fn, volte) {
    const massimo = volte || 8;
    for (let i = 0; ; i++) {
        try {
            return await fn();
        } catch (e) {
            const conteso = e && (e.code === 10 || /ABORTED|contention|transaction.*(expired|lock)/i.test(String(e.message || '')));
            if (!conteso || i >= massimo) throw e;
            await C.pausa(40 + Math.random() * 120 * (i + 1));
        }
    }
}
function transazione(ctx, fn) {
    return conRiprova(() => ctx.db.runTransaction(fn, { maxAttempts: 10 }));
}

/* ============================================================
   EVENTI
   ============================================================ */

/* L'evento come lo vede la gestione: i campi del documento (con i
   tempi in millisecondi) piu' la modalita' del video, gli indirizzi
   impostati e la firma, che stanno nel documento riservato. Della firma
   si dice solo se la chiave c'e' (segretoImpostato): la chiave non esce
   MAI. videoInOnda e' il videoId pubblico (quello che ricevono i
   partecipanti, in qualunque modalita'); azotoInOnda lo stesso, ma solo
   se e' il player di Azoto. */
function eventoJSON(id, dati, riservati) {
    const out = jsonDi(dati);
    const r = riservatiDa(riservati);
    const pubblico = dati || {};
    // un documento di prima, senza tipoPlayer: come fa la pagina, lo dice l'indirizzo
    const tipoPubblico = pubblico.tipoPlayer || (V.eAzoto(pubblico.videoId) ? 'azoto' : 'flusso');
    out.id = id;
    out.tipoPlayer = r.tipoPlayer;
    out.azotoUrl = r.azotoUrl;
    out.azotoInOnda = tipoPubblico === 'azoto' ? (pubblico.videoId || '') : '';
    out.videoUrl = r.videoUrl;
    out.videoId = r.videoId;
    out.videoTipo = V.tipoDi(out.videoId);
    out.videoInOnda = pubblico.videoId || '';
    out.riservaUrl = r.riservaUrl;
    out.riservaId = r.riservaId;
    out.riservaTipo = V.tipoDi(out.riservaId);
    out.riservaInOnda = (dati && dati.videoRiserva) || '';
    out.sorgente = dati && dati.sorgente === 'riserva' ? 'riserva' : 'principale';
    out.videoFirmato = F.attiva(r.firma);
    out.firma = F.pubblica(r.firma);
    return out;
}

async function leggiEvento(ctx, idEvento) {
    const [snap, ris] = await ctx.db.getAll(
        ctx.db.collection('eventi').doc(idEvento),
        ctx.db.collection('eventiRiservati').doc(idEvento));
    if (!snap.exists) throw C.errore(404, 'Evento inesistente.', 'evento');
    return { dati: snap.data(), riservati: ris.exists ? ris.data() : {}, json: eventoJSON(idEvento, snap.data(), ris.exists ? ris.data() : {}) };
}

async function elencoEventi(ctx) {
    const snap = await ctx.db.collection('eventi').get();
    if (snap.empty) return [];
    const riservati = await ctx.db.getAll(...snap.docs.map(d => ctx.db.collection('eventiRiservati').doc(d.id)));
    const conteggi = await Promise.all(snap.docs.map(d =>
        ctx.db.collection('partecipanti').where('eventi', 'array-contains', d.id).count().get()
            .then(c => c.data().count).catch(() => null)));
    return snap.docs.map((d, i) => Object.assign(eventoJSON(d.id, d.data(), riservati[i].exists ? riservati[i].data() : {}), { iscritti: conteggi[i] }))
        .sort((a, b) => (b.inizio || 0) - (a.inizio || 0));
}

// "9:00", "09.00", "09:00" -> "09:00"; '' se non e' un'ora
function normalizzaOra(v) {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(v || '').trim());
    if (!m || +m[1] > 23 || +m[2] > 59) return '';
    return String(+m[1]).padStart(2, '0') + ':' + m[2];
}
function dataValida(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/* Il programma arriva come lista [{ora, titolo}] oppure come il testo
   della casella, una voce per riga: "09.00 Accoglienza". L'ora si
   scrive come la scrive il sito ("09.00"); una riga senza ora resta
   una voce senza ora. */
function leggiProgramma(v) {
    let voci;
    if (Array.isArray(v)) voci = v.map(x => ({ ora: x && x.ora, titolo: x && x.titolo }));
    else {
        voci = String(v || '').split(/\r?\n/).map(riga => {
            const m = /^\s*(\d{1,2}[.:]\d{2})\s+(.*)$/.exec(riga);
            return m ? { ora: m[1], titolo: m[2] } : { ora: '', titolo: riga };
        });
    }
    const out = [];
    voci.forEach(x => {
        const titolo = C.testo(String(x.titolo || '').replace(/^\s*[-–—:·]\s*/, ''), 160);
        if (!titolo) return;
        const o = normalizzaOra(x.ora);
        out.push({ ora: o ? o.replace(':', '.') : '', titolo: titolo });
    });
    if (out.length > MAX_PROGRAMMA) throw C.errore(400, 'Il programma può avere al massimo ' + MAX_PROGRAMMA + ' voci.', 'programma');
    return out;
}

/* Il flusso diretto (modalita' 'flusso'). Il gestore incolla il link
   che gli da' la web TV (HLS .m3u8 o DASH .mpd): le regole sono in
   diretta-sorgente-video.js (perFlusso), le stesse della gestione e del
   player; l'indirizzo del player di Azoto qui si rifiuta, con il
   messaggio che dice dove va. Si salva il valore che il player riceve,
   l'indirizzo https normalizzato, sia come link (videoUrl) sia come
   valore (videoId). Decide il servizio: con il link, l'identificativo
   mandato dalla pagina non conta; senza link, l'identificativo si legge
   con le stesse regole. Vale per il flusso principale e per la riserva.
   Un indirizzo IP interno o privato scritto per intero non si salva. */
function leggiVideo(videoUrl, videoId) {
    const incollato = String(videoUrl == null ? '' : videoUrl).trim().slice(0, 4000);
    const testo = incollato || String(videoId == null ? '' : videoId).trim().slice(0, 4000);
    if (!testo) return { videoUrl: '', videoId: '' };
    const s = V.perFlusso(testo);
    if (!s || s.errore) throw C.errore(400, V.messaggio(s), 'video');
    const host = new URL(s.valore).hostname;
    if (eIndirizzoIp(host) && !indirizzoPubblico(host)) {
        throw C.errore(400, 'Il link porta a un indirizzo interno o privato: serve l\'indirizzo pubblico della web TV.', 'video');
    }
    return { videoUrl: s.valore, videoId: s.valore };
}

/* Il player di Azoto (modalita' 'azoto'). Il gestore incolla il codice
   che gli ha dato Azoto (<div ...><iframe src='...'></iframe></div>
   <script ...></script>) oppure solo l'indirizzo del player: le regole
   sono in diretta-sorgente-video.js (perAzoto). Del codice si prende
   SOLO l'indirizzo del primo iframe, e solo se e' di
   cdn.azotosolutions.com: l'HTML incollato non si salva MAI (ne' qui
   ne' altrove), l'iframe lo costruisce la pagina. '' = nessun player. */
function leggiAzoto(azotoUrl) {
    // il codice puo' essere lungo: si legge tutto (fino a 4000 caratteri), si salva solo l'indirizzo
    const testo = String(azotoUrl == null ? '' : azotoUrl).trim().slice(0, 4000);
    if (!testo) return '';
    const s = V.perAzoto(testo);
    if (!s || s.errore) throw C.errore(400, V.messaggio(s), 'azoto');
    return s.valore;
}

/* I dati riservati del video come si salvano: la modalita', il player
   di Azoto, il flusso principale e la riserva, la firma. */
function riservatiVideo({ tipoPlayer, azotoUrl, principale, riserva, firma }) {
    if (riserva.videoId && !principale.videoId) {
        throw C.errore(400, 'Il link di riserva serve solo insieme al link principale: inserisci prima quello principale.', 'riserva');
    }
    return {
        tipoPlayer: tipoPlayer === 'flusso' ? 'flusso' : 'azoto', azotoUrl: azotoUrl || '',
        videoUrl: principale.videoUrl, videoId: principale.videoId,
        riservaUrl: riserva.videoUrl, riservaId: riserva.videoId,
        firma: firma
    };
}
/* I dati riservati come sono salvati, con i valori predefiniti. Un
   evento salvato prima delle due modalita' (niente tipoPlayer e niente
   azotoUrl) con l'indirizzo del player di Azoto nel link principale:
   quell'indirizzo e' il suo player Azoto, e il flusso non c'e'. */
function riservatiDa(ris) {
    const r = ris || {};
    const diPrima = r.tipoPlayer === undefined && r.azotoUrl === undefined && V.eAzoto(r.videoId);
    return {
        tipoPlayer: r.tipoPlayer === 'flusso' ? 'flusso' : 'azoto',
        azotoUrl: diPrima ? r.videoId : (r.azotoUrl || ''),
        videoUrl: diPrima ? '' : (r.videoUrl || ''), videoId: diPrima ? '' : (r.videoId || ''),
        riservaUrl: r.riservaUrl || '', riservaId: r.riservaId || '',
        firma: F.pulita(r.firma)
    };
}
/* Un valore salvato si pubblica solo se il player di quella modalita'
   lo sa usare: per il flusso HLS o DASH, per Azoto il suo player (un
   valore di prima, per esempio la pagina di un'altra web TV, no). */
function flussoValido(valore) {
    const t = V.tipoDi(valore);
    return t === 'hls' || t === 'dash' ? valore : '';
}
function azotoValido(valore) {
    return V.eAzoto(valore) ? valore : '';
}

/* I campi del video nel documento pubblico, per lo stato dato:
   tipoPlayer sempre; videoId solo in onda (l'indirizzo di Azoto o il
   flusso principale, secondo la modalita'); videoRiserva e videoFirmato
   solo in onda e solo per il flusso; sorgente sempre (torna
   'principale' se la riserva non c'e' piu'). Restituisce solo quelli
   che cambiano (vuoto se niente cambia: il documento dell'evento costa
   mille letture a ogni scrittura). */
function campiVideo(pubblico, ris, stato) {
    const p = pubblico || {};
    const r = riservatiDa(ris);
    const inOnda = stato === 'in_onda';
    const flusso = r.tipoPlayer === 'flusso';
    const riserva = flussoValido(r.riservaId);
    const attuali = {
        tipoPlayer: p.tipoPlayer || '',
        videoId: p.videoId || '', videoRiserva: p.videoRiserva || '',
        sorgente: p.sorgente === 'riserva' ? 'riserva' : 'principale', videoFirmato: p.videoFirmato === true
    };
    const nuovi = {
        tipoPlayer: r.tipoPlayer,
        videoId: !inOnda ? '' : (flusso ? flussoValido(r.videoId) : azotoValido(r.azotoUrl)),
        videoRiserva: inOnda && flusso ? riserva : '',
        sorgente: attuali.sorgente === 'riserva' && !riserva ? 'principale' : attuali.sorgente,
        videoFirmato: inOnda && flusso ? F.attiva(r.firma) : false
    };
    const cambiati = {};
    Object.keys(nuovi).forEach(k => { if (nuovi[k] !== attuali[k]) cambiati[k] = nuovi[k]; });
    return cambiati;
}

// due valori (anche con Timestamp e liste) sono uguali?
function normale(v) {
    if (v && typeof v.toMillis === 'function') return v.toMillis();
    if (Array.isArray(v)) return v.map(normale);
    if (v && typeof v === 'object') {
        const o = {};
        Object.keys(v).sort().forEach(k => { o[k] = normale(v[k]); });
        return o;
    }
    return v;
}
function uguali(a, b) {
    return JSON.stringify(normale(a)) === JSON.stringify(normale(b));
}

/* evento-salva: crea un evento nuovo o modifica quello esistente.
   Nella modifica i campi che non arrivano restano come sono. Per il
   video: tipoPlayer 'azoto' | 'flusso' (la modalita'; un evento nuovo
   senza tipoPlayer e' 'azoto'), azotoUrl il codice o l'indirizzo del
   player di Azoto ('' lo toglie; si salva solo l'indirizzo), videoUrl
   (e videoId) il flusso principale, riservaUrl il flusso di riserva (''
   lo toglie), firma { schema, segreto?, durataOre?, parametri? } i link
   firmati del flusso (segreto assente o '' = si tiene quello salvato;
   schema 'nessuna' cancella anche il segreto). La modalita' 'flusso'
   vuole il flusso principale (400 campo 'tipoPlayer', o 'video' se lo
   si toglie mentre e' in uso); 'azoto' si salva anche senza indirizzo
   (lo si inserisce piu' tardi). */
async function salvaEvento(ctx, ingresso) {
    const e = ingresso || {};
    const nuovo = e.nuovo === true;
    const id = String(e.id || '').trim().toLowerCase();
    if (!RE_ID_EVENTO.test(id)) {
        throw C.errore(400, 'Identificativo dell\'evento non valido: lettere minuscole, numeri e trattini, da 3 a 41 caratteri.', 'evento');
    }
    const db = ctx.db;
    const rif = db.collection('eventi').doc(id);
    const rifRis = db.collection('eventiRiservati').doc(id);

    await transazione(ctx, async tx => {
        const [snap, snapRis] = await tx.getAll(rif, rifRis);
        if (nuovo && snap.exists) throw C.errore(409, 'Esiste già un evento con l\'identificativo "' + id + '".', 'esiste');
        if (!nuovo && !snap.exists) throw C.errore(404, 'Evento inesistente.', 'evento');
        const vecchio = snap.exists ? snap.data() : {};
        const ris = snapRis.exists ? snapRis.data() : {};
        const val = (campo, predefinito) => (e[campo] !== undefined ? e[campo] : (vecchio[campo] !== undefined ? vecchio[campo] : predefinito));

        const titolo = C.testo(val('titolo', ''), 140);
        if (titolo.length < 3) throw C.errore(400, 'Il titolo deve avere almeno 3 caratteri.', 'titolo');
        const luogo = C.testo(val('luogo', ''), 140);
        const data = String(val('data', '')).trim();
        if (!dataValida(data)) throw C.errore(400, 'Data non valida (AAAA-MM-GG).', 'data');
        const oraInizio = normalizzaOra(val('oraInizio', ''));
        const oraFine = normalizzaOra(val('oraFine', ''));
        if (!oraInizio || !oraFine) throw C.errore(400, 'Orari non validi (per esempio 09:00 e 17:30).', 'orari');
        const inizio = C.istanteRoma(data, oraInizio);
        const fine = C.istanteRoma(data, oraFine);
        if (!(fine > inizio)) throw C.errore(400, 'L\'ora di fine deve venire dopo quella di inizio.', 'orari');
        // il video: quello che non arriva resta com'e' (senza rileggerlo)
        const prima = riservatiDa(ris);
        if (e.tipoPlayer !== undefined && TIPI_PLAYER.indexOf(e.tipoPlayer) < 0) {
            throw C.errore(400, 'Tipo di player non valido: scegli «Player Azoto» o «Flusso diretto».', 'tipoPlayer');
        }
        const tipoPlayer = e.tipoPlayer !== undefined ? e.tipoPlayer : prima.tipoPlayer;
        const azotoUrl = e.azotoUrl !== undefined ? leggiAzoto(e.azotoUrl) : prima.azotoUrl;
        const principale = e.videoUrl !== undefined || e.videoId !== undefined
            ? leggiVideo(e.videoUrl, e.videoId) : { videoUrl: prima.videoUrl, videoId: prima.videoId };
        const riserva = e.riservaUrl !== undefined
            ? leggiVideo(e.riservaUrl, '') : { videoUrl: prima.riservaUrl, videoId: prima.riservaId };
        if (tipoPlayer === 'flusso' && !flussoValido(principale.videoId)) {
            throw e.tipoPlayer === 'flusso' ? C.errore(400, MSG_SERVE_FLUSSO, 'tipoPlayer') : C.errore(400, MSG_FLUSSO_IN_USO, 'video');
        }
        // con Akamai l'acl ricavata dal percorso del flusso deve essere valida: lo si dice subito, non alla prima firma
        const firma = F.normalizza(e.firma, ris.firma, [principale.videoId, riserva.videoId].filter(Boolean));
        if (firma.errore) throw C.errore(400, firma.errore, 'firma');
        const nuoviRis = riservatiVideo({ tipoPlayer: tipoPlayer, azotoUrl: azotoUrl, principale: principale, riserva: riserva, firma: firma.firma });
        const programma = e.programma !== undefined ? leggiProgramma(e.programma) : (vecchio.programma || []);
        const paginaEvento = String(val('paginaEvento', '') || '').trim();
        if (paginaEvento && !RE_PAGINA.test(paginaEvento)) throw C.errore(400, 'Pagina dell\'evento non valida (per esempio /napoli_ottobre_2026/).', 'pagina');
        const unSoloDispositivo = val('unSoloDispositivo', false) === true;
        const prom = val('promemoria', {}) || {};
        const promemoria = { giornoPrima: prom.giornoPrima === true, oraPrima: prom.oraPrima === true };

        const stato = vecchio.stato || 'programmato';
        const ts = adessoTs(ctx);
        const campi = {
            titolo, luogo, data, oraInizio, oraFine,
            inizio: ctx.Timestamp.fromMillis(inizio), fine: ctx.Timestamp.fromMillis(fine),
            programma, paginaEvento, unSoloDispositivo, promemoria
        };
        if (nuovo) {
            tx.create(rif, Object.assign(campi, {
                tipoPlayer: nuoviRis.tipoPlayer, videoId: '', videoRiserva: '', sorgente: 'principale', videoFirmato: false,
                stato: 'programmato', statoAggiornato: ts, videoAggiornato: ts, ripresa: '', avviso: '', creato: ts, aggiornato: ts
            }));
        } else {
            const cambiati = {};
            Object.keys(campi).forEach(k => { if (!uguali(campi[k], vecchio[k])) cambiati[k] = campi[k]; });
            const video = campiVideo(vecchio, nuoviRis, stato);
            if (Object.keys(video).length) Object.assign(cambiati, video, { videoAggiornato: ts });
            if (Object.keys(cambiati).length) {
                cambiati.aggiornato = ts;
                tx.update(rif, cambiati);
            }
        }
        if (nuovo || !uguali(nuoviRis, prima)) {
            tx.set(rifRis, Object.assign({}, nuoviRis, { aggiornato: ts }));
        }
    });
    return (await leggiEvento(ctx, id)).json;
}

/* evento-stato: programmato, in onda, in pausa, terminato. Il video
   (l'indirizzo di Azoto, oppure principale, riserva e videoFirmato del
   flusso) passa nel documento pubblico solo andando in onda, e ne esce
   uscendo; la modalita' (tipoPlayer) e la sorgente scelta dalla regia
   restano. */
async function cambiaStato(ctx, { idEvento, stato, ripresa }) {
    const id = controllaIdEvento(idEvento);
    if (STATI_EVENTO.indexOf(stato) < 0) throw C.errore(400, 'Stato non valido.', 'stato');
    const oraRipresa = stato === 'pausa' ? normalizzaOra(ripresa) : '';
    if (stato === 'pausa' && ripresa && !oraRipresa) throw C.errore(400, 'Ora di ripresa non valida (per esempio 14:30).', 'ripresa');
    const rif = ctx.db.collection('eventi').doc(id);
    const rifRis = ctx.db.collection('eventiRiservati').doc(id);
    await transazione(ctx, async tx => {
        const [snap, snapRis] = await tx.getAll(rif, rifRis);
        if (!snap.exists) throw C.errore(404, 'Evento inesistente.', 'evento');
        const v = snap.data();
        const video = campiVideo(v, snapRis.exists ? snapRis.data() : {}, stato);
        const ts = adessoTs(ctx);
        const agg = {};
        if (v.stato !== stato) { agg.stato = stato; agg.statoAggiornato = ts; }
        if (Object.keys(video).length) Object.assign(agg, video, { videoAggiornato: ts });
        if ((v.ripresa || '') !== oraRipresa) agg.ripresa = oraRipresa;
        if (Object.keys(agg).length) { agg.aggiornato = ts; tx.update(rif, agg); }
    });
    return (await leggiEvento(ctx, id)).json;
}

/* evento-video: il cambio degli indirizzi durante la diretta. Arrivano
   solo quelli da cambiare: azotoUrl (il player di Azoto), videoUrl (e
   videoId: il flusso principale), riservaUrl (il flusso di riserva);
   '' toglie, assente resta com'e'. Vanno nel documento riservato; se si
   e' in onda e l'indirizzo e' quello della modalita' in uso, anche nel
   documento pubblico (chi guarda passa al nuovo video da solo, senza
   ricaricare la pagina). Il flusso principale in uso per tutti non si
   toglie (prima si torna al player di Azoto). */
async function cambiaVideo(ctx, { idEvento, azotoUrl, videoUrl, videoId, riservaUrl }) {
    const id = controllaIdEvento(idEvento);
    const nuovoAzoto = azotoUrl !== undefined ? leggiAzoto(azotoUrl) : null;
    const nuovoPrincipale = videoUrl !== undefined || videoId !== undefined ? leggiVideo(videoUrl, videoId) : null;
    const nuovaRiserva = riservaUrl !== undefined ? leggiVideo(riservaUrl, '') : null;
    const rif = ctx.db.collection('eventi').doc(id);
    const rifRis = ctx.db.collection('eventiRiservati').doc(id);
    await transazione(ctx, async tx => {
        const [snap, snapRis] = await tx.getAll(rif, rifRis);
        if (!snap.exists) throw C.errore(404, 'Evento inesistente.', 'evento');
        const v = snap.data();
        const prima = riservatiDa(snapRis.exists ? snapRis.data() : {});
        const principale = nuovoPrincipale || { videoUrl: prima.videoUrl, videoId: prima.videoId };
        if (prima.tipoPlayer === 'flusso' && !flussoValido(principale.videoId)) throw C.errore(400, MSG_FLUSSO_IN_USO, 'video');
        const nuoviRis = riservatiVideo({
            tipoPlayer: prima.tipoPlayer,
            azotoUrl: nuovoAzoto !== null ? nuovoAzoto : prima.azotoUrl,
            principale: principale,
            riserva: nuovaRiserva || { videoUrl: prima.riservaUrl, videoId: prima.riservaId },
            firma: prima.firma
        });
        const ts = adessoTs(ctx);
        if (!uguali(nuoviRis, prima)) tx.set(rifRis, Object.assign({}, nuoviRis, { aggiornato: ts }));
        const video = campiVideo(v, nuoviRis, v.stato);
        if (Object.keys(video).length) tx.update(rif, Object.assign(video, { videoAggiornato: ts, aggiornato: ts }));
    });
    return (await leggiEvento(ctx, id)).json;
}

/* evento-sorgente: la regia sceglie per tutti il link principale o
   quello di riserva (anche fuori onda: vale quando si va in onda). La
   pagina di chi guarda passa all'altro link senza ricaricare. Ogni
   comando aggiorna videoAggiornato, ANCHE se la scelta resta la stessa:
   e' cosi' che la regia riporta sul link scelto chi ci era passato da
   solo (dopo 20 secondi di guasto il player passa all'altro link, e la
   pagina annulla quel passaggio quando la regia "riconferma"). */
async function cambiaSorgente(ctx, { idEvento, sorgente }) {
    const id = controllaIdEvento(idEvento);
    if (SORGENTI.indexOf(sorgente) < 0) throw C.errore(400, 'Scegli il link principale o quello di riserva.', 'sorgente');
    const rif = ctx.db.collection('eventi').doc(id);
    const rifRis = ctx.db.collection('eventiRiservati').doc(id);
    await transazione(ctx, async tx => {
        const [snap, snapRis] = await tx.getAll(rif, rifRis);
        if (!snap.exists) throw C.errore(404, 'Evento inesistente.', 'evento');
        const r = riservatiDa(snapRis.exists ? snapRis.data() : {});
        if (sorgente === 'riserva' && !flussoValido(r.riservaId)) {
            throw C.errore(400, 'Non c\'è un link di riserva: inseriscilo nella scheda dell\'evento e salva.', 'sorgente');
        }
        const ts = adessoTs(ctx);
        tx.update(rif, { sorgente: sorgente, videoAggiornato: ts, aggiornato: ts });
    });
    return (await leggiEvento(ctx, id)).json;
}

/* evento-player: la regia passa tutti al player di Azoto ('azoto') o
   al flusso diretto ('flusso'), anche durante la diretta: la pagina di
   chi guarda cambia player da sola, senza ricaricare. Serve l'indirizzo
   di quella modalita' (400 campo 'tipoPlayer' altrimenti). Come per
   evento-sorgente, ogni comando aggiorna videoAggiornato ANCHE se la
   modalita' resta la stessa: la "riconferma" riporta tutti sul player
   scelto (per esempio chi e' rimasto indietro con un player bloccato). */
async function cambiaPlayer(ctx, { idEvento, tipoPlayer }) {
    const id = controllaIdEvento(idEvento);
    if (TIPI_PLAYER.indexOf(tipoPlayer) < 0) throw C.errore(400, 'Scegli il player Azoto o il flusso diretto.', 'tipoPlayer');
    const rif = ctx.db.collection('eventi').doc(id);
    const rifRis = ctx.db.collection('eventiRiservati').doc(id);
    await transazione(ctx, async tx => {
        const [snap, snapRis] = await tx.getAll(rif, rifRis);
        if (!snap.exists) throw C.errore(404, 'Evento inesistente.', 'evento');
        const v = snap.data();
        const prima = riservatiDa(snapRis.exists ? snapRis.data() : {});
        if (tipoPlayer === 'flusso' && !flussoValido(prima.videoId)) throw C.errore(400, MSG_SERVE_FLUSSO, 'tipoPlayer');
        if (tipoPlayer === 'azoto' && !azotoValido(prima.azotoUrl)) throw C.errore(400, MSG_SERVE_AZOTO, 'tipoPlayer');
        const nuoviRis = Object.assign({}, prima, { tipoPlayer: tipoPlayer });
        const ts = adessoTs(ctx);
        if (!uguali(nuoviRis, prima) || !snapRis.exists) tx.set(rifRis, Object.assign({}, nuoviRis, { aggiornato: ts }));
        tx.update(rif, Object.assign(campiVideo(v, nuoviRis, v.stato), { videoAggiornato: ts, aggiornato: ts }));
    });
    return (await leggiEvento(ctx, id)).json;
}

/* Il link del flusso da riprodurre, firmato se l'evento usa i link
   firmati della web TV: per chi guarda (link-video, solo in onda) e per
   l'anteprima della regia (link-firmato). Solo in modalita' 'flusso':
   con il player di Azoto non c'e' un link da dare (409 'non-flusso').
   -> { url, scade, validoSecondi } (scade in ms, null senza firma). Il
   segreto resta qui. */
async function linkVideo(ctx, { idEvento, sorgente, soloInOnda }) {
    const id = controllaIdEvento(idEvento);
    const quale = sorgente === undefined || sorgente === null || sorgente === '' ? 'principale' : sorgente;
    if (SORGENTI.indexOf(quale) < 0) throw C.errore(400, 'Scegli il link principale o quello di riserva.', 'sorgente');
    const [snap, snapRis] = await ctx.db.getAll(ctx.db.collection('eventi').doc(id), ctx.db.collection('eventiRiservati').doc(id));
    if (!snap.exists) throw C.errore(404, 'Evento inesistente.', 'evento');
    if (soloInOnda && snap.data().stato !== 'in_onda') throw errorePubblico(409, 'non-in-onda', 'La diretta non è in onda in questo momento.');
    const r = riservatiDa(snapRis.exists ? snapRis.data() : {});
    if (r.tipoPlayer !== 'flusso') throw errorePubblico(409, 'non-flusso', 'La diretta usa il player Azoto: il link del flusso non serve.');
    const url = flussoValido(quale === 'riserva' ? r.riservaId : r.videoId);
    if (!url) throw errorePubblico(404, 'nessun-link', quale === 'riserva' ? 'Non c\'è un link di riserva.' : 'Il video della diretta non è ancora impostato.');
    try {
        return F.firma(url, r.firma, ctx.adesso());
    } catch (_) {
        // mai il motivo con i dati della firma: solo che non e' riuscita
        throw C.errore(500, 'La firma del link non è riuscita: controlla le impostazioni dei link firmati.', 'firma');
    }
}

/* evento-avviso: una riga per tutti ("problema tecnico, torniamo tra
   5 minuti"), '' per toglierla. */
async function cambiaAvviso(ctx, { idEvento, avviso }) {
    const id = controllaIdEvento(idEvento);
    const testo = C.testo(avviso, 200);
    const rif = ctx.db.collection('eventi').doc(id);
    await transazione(ctx, async tx => {
        const snap = await tx.get(rif);
        if (!snap.exists) throw C.errore(404, 'Evento inesistente.', 'evento');
        if ((snap.data().avviso || '') !== testo) tx.update(rif, { avviso: testo, aggiornato: adessoTs(ctx) });
    });
    return (await leggiEvento(ctx, id)).json;
}

/* Quale evento mostrare a una persona iscritta a piu' eventi: quello
   in onda, poi quello in pausa, poi il prossimo in programma (il piu'
   vicino), altrimenti il piu' recente. Si guardano al massimo i 5 piu'
   recenti della sua lista. `preferito` (dal link dell'email) vince se
   e' tra i suoi eventi. */
async function scegliEvento(ctx, eventi, preferito) {
    const lista = (Array.isArray(eventi) ? eventi : []).filter(x => RE_ID_EVENTO.test(String(x || '')));
    let ids = lista.slice(0, 5);
    const pref = String(preferito || '');
    if (pref && lista.indexOf(pref) >= 0 && ids.indexOf(pref) < 0) ids = [pref].concat(ids.slice(0, 4));
    if (!ids.length) return null;
    const snaps = await ctx.db.getAll(...ids.map(id => ctx.db.collection('eventi').doc(id)));
    const trovati = snaps.filter(s => s.exists).map(s => ({ id: s.id, dati: s.data() }));
    if (!trovati.length) return null;
    const scelto = trovati.find(x => x.id === pref);
    if (scelto) return scelto;
    const ora = ctx.adesso();
    const inOnda = trovati.find(x => x.dati.stato === 'in_onda') || trovati.find(x => x.dati.stato === 'pausa');
    if (inOnda) return inOnda;
    const prossimi = trovati.filter(x => x.dati.stato === 'programmato' && (ms(x.dati.fine) || 0) > ora)
        .sort((a, b) => (ms(a.dati.inizio) || 0) - (ms(b.dati.inizio) || 0));
    if (prossimi.length) return prossimi[0];
    return trovati.slice().sort((a, b) => (ms(b.dati.inizio) || 0) - (ms(a.dati.inizio) || 0))[0];
}

/* ============================================================
   PARTECIPANTI
   ============================================================ */

function partecipanteJSON(d, idEvento) {
    const invii = d.invii || {};
    return {
        uid: d.uid, nomeUtente: d.nomeUtente || '', nome: d.nome || '', cognome: d.cognome || '',
        email: d.email || '', azienda: d.azienda || '', stato: d.stato || 'attivo',
        idEvento: d.idEvento || '', eventi: Array.isArray(d.eventi) ? d.eventi : [],
        invio: jsonDi(invii[idEvento] || { stato: 'da inviare' }),
        ultimoAccesso: ms(d.ultimoAccesso), authCreato: d.authCreato === true
    };
}

async function elencoPartecipanti(ctx, idEvento) {
    const id = controllaIdEvento(idEvento);
    const snap = await ctx.db.collection('partecipanti').where('eventi', 'array-contains', id).get();
    return snap.docs.map(d => partecipanteJSON(Object.assign({ uid: d.id }, d.data()), id))
        .sort((a, b) => (a.cognome + ' ' + a.nome).localeCompare(b.cognome + ' ' + b.nome, 'it') || a.nomeUtente.localeCompare(b.nomeUtente));
}

// "mario.rossi@acme.it" -> "m***@acme.it": basta per riconoscere, non per copiare
function emailMascherata(email) {
    const e = String(email || '');
    const at = e.indexOf('@');
    if (at < 1) return '';
    return e[0] + '***' + e.slice(at);
}

/* anteprima: che cosa esiste gia' per le righe del file, senza
   creare niente. La gestione ci fa girare analizzaRighe() (la stessa
   funzione di diretta/nome-utente.js). */
async function anteprima(ctx, { idEvento, emails, basi, nomi }) {
    controllaIdEvento(idEvento);
    const elenco = (v, pulisci) => {
        if (v != null && !Array.isArray(v)) throw C.errore(400, 'Dati dell\'anteprima non validi.', 'dati');
        const a = v || [];
        if (a.length > MAX_ANTEPRIMA) throw C.errore(400, 'Troppe righe: al massimo ' + MAX_ANTEPRIMA + ' per volta.', 'troppe');
        return Array.from(new Set(a.map(pulisci).filter(Boolean)));
    };
    const indirizzi = elenco(emails, x => { const e = N.emailNormalizzata(x); return N.emailValida(e) ? e : ''; });
    const listaBasi = elenco(basi, x => N.pulisciNomeUtente(x));
    const listaNomi = elenco(nomi, x => N.pulisciNomeUtente(x));
    const db = ctx.db;

    // una email = un account: chi c'e' gia'
    const perEmail = {};
    const uidPerEmail = {};
    for (const gruppo of C.aGruppi(indirizzi, 100)) {
        const snaps = await db.getAll(...gruppo.map(e => db.collection('indirizzi').doc(e)));
        snaps.forEach((s, i) => { if (s.exists && s.data().uid) uidPerEmail[gruppo[i]] = s.data().uid; });
    }
    const uids = Array.from(new Set(Object.values(uidPerEmail)));
    const profili = {};
    for (const gruppo of C.aGruppi(uids, 100)) {
        const snaps = await db.getAll(...gruppo.map(u => db.collection('partecipanti').doc(u)));
        snaps.forEach(s => { if (s.exists) profili[s.id] = s.data(); });
    }
    Object.keys(uidPerEmail).forEach(e => {
        const p = profili[uidPerEmail[e]];
        if (!p) return;
        perEmail[e] = { uid: uidPerEmail[e], nomeUtente: p.nomeUtente || '', nome: p.nome || '', cognome: p.cognome || '', eventi: Array.isArray(p.eventi) ? p.eventi : [] };
    });

    // i nomi utente gia' presi: tutti quelli delle basi del file, piu' quelli richiesti
    const occupati = new Set();
    const titolari = {};
    for (const gruppo of C.aGruppi(listaBasi, 30)) {
        const snap = await db.collection('nomiUtente').where('base', 'in', gruppo).get();
        snap.docs.forEach(d => { occupati.add(d.id); titolari[d.id] = d.data().uid; });
    }
    for (const gruppo of C.aGruppi(listaNomi, 100)) {
        const snaps = await db.getAll(...gruppo.map(n => db.collection('nomiUtente').doc(n)));
        snaps.forEach(s => { if (s.exists) occupati.add(s.id); });
    }

    /* Chi usa gia' il nome di base (per la riga dell'omonimo: "gia' usato
       da Mario Rossi, ACME srl, m***@acme.it"): solo per le basi del file
       che sono occupate, e con l'email mascherata. */
    const dettagliOccupati = {};
    const daLeggere = listaBasi.filter(b => titolari[b] && !profili[titolari[b]]).map(b => titolari[b]);
    for (const gruppo of C.aGruppi(Array.from(new Set(daLeggere)), 100)) {
        const snaps = await db.getAll(...gruppo.map(u => db.collection('partecipanti').doc(u)));
        snaps.forEach(s => { if (s.exists) profili[s.id] = s.data(); });
    }
    listaBasi.forEach(b => {
        const p = titolari[b] && profili[titolari[b]];
        if (p) dettagliOccupati[b] = { nome: p.nome || '', cognome: p.cognome || '', azienda: p.azienda || '', emailMascherata: emailMascherata(p.emailNorm || p.email) };
    });

    return { esistenti: { perEmail: perEmail, occupati: Array.from(occupati).sort(), dettagliOccupati: dettagliOccupati } };
}

/* Da dove parte la numerazione del nome utente.
   - Il nome desiderato e' la base (mariorossi) o la base con un numero
     (mariorossi4): si numera dalla base, partendo da quel numero.
   - Altrimenti (un nome scritto a mano diverso dalla base) si numera da
     quel nome: desiderato, desiderato2, desiderato3...
   Nella prenotazione si registra la "radice" come base, cosi'
   l'anteprima trova tutti i nomi di quella famiglia. */
function radiceDi(desiderato, base) {
    if (base && desiderato.indexOf(base) === 0) {
        const coda = desiderato.slice(base.length);
        if (coda === '') return { radice: base, primo: 1 };
        if (/^[1-9]\d{0,4}$/.test(coda) && +coda >= 2) return { radice: base, primo: +coda };
    }
    return { radice: desiderato, primo: 1 };
}

/* La prenotazione del nome utente DENTRO una transazione: si leggono i
   candidati a blocchi di dieci (radice, radice2 ... radice10, poi i dieci
   successivi), al massimo sei blocchi, e si prende il primo libero. Un
   candidato gia' prenotato dalla stessa persona vale come libero (serve
   alla correzione del nome). */
async function primoNomeLibero(ctx, tx, radice, primo, uid) {
    for (let b = 0; b < MAX_BLOCCHI; b++) {
        const candidati = [];
        for (let k = 0; k < CANDIDATI_PER_BLOCCO; k++) candidati.push(N.conNumero(radice, primo + b * CANDIDATI_PER_BLOCCO + k));
        const snaps = await tx.getAll(...candidati.map(c => ctx.db.collection('nomiUtente').doc(c)));
        const i = snaps.findIndex(s => !s.exists || (uid && s.data().uid === uid));
        if (i >= 0) return { nome: candidati[i], mio: snaps[i].exists };
    }
    return null;
}

/* L'account Firebase Auth di una persona appena prenotata (o rimasta a
   meta' in un giro precedente): l'uid e' quello della prenotazione,
   l'email tecnica deriva dall'uid (DECISIONI D1), la password e' una
   segreta che nessuno conosce, finche' non partono le credenziali. */
async function completaAccount(ctx, uid, nomeCompleto) {
    const emailTecnica = C.emailTecnica(uid);
    try {
        await conLimite(() => ctx.auth.createUser({ uid: uid, email: emailTecnica, password: passwordSegreta(), displayName: nomeCompleto }));
    } catch (e) {
        const codice = String((e && (e.code || (e.errorInfo && e.errorInfo.code))) || '');
        if (codice === 'auth/uid-already-exists') {
            // un giro precedente l'aveva gia' creato: si prosegue, se e' davvero lui
            const u = await ctx.auth.getUser(uid);
            if (String(u.email || '').toLowerCase() !== emailTecnica.toLowerCase()) {
                throw errorePubblico(409, 'estraneo', 'L\'identificativo di questa persona è già usato da un altro account: scrivi all\'assistenza tecnica.');
            }
            if (u.displayName !== nomeCompleto) await conLimite(() => ctx.auth.updateUser(uid, { displayName: nomeCompleto }));
        } else if (codice === 'auth/email-already-exists') {
            throw errorePubblico(409, 'estraneo', 'L\'indirizzo tecnico di questa persona è già usato da un altro account: scrivi all\'assistenza tecnica.');
        } else {
            throw e;
        }
    }
    await impostaClaims(ctx, uid);
    await ctx.db.collection('partecipanti').doc(uid).update({ authCreato: true, aggiornato: adessoTs(ctx) });
}

/* I claims "eventi" del token si scrivono SEMPRE rileggendo la lista dal
   profilo appena prima: se due caricamenti aggiungono la stessa persona a
   due eventi insieme, l'ultimo a scrivere scrive la lista completa. */
async function impostaClaims(ctx, uid) {
    const snap = await ctx.db.collection('partecipanti').doc(uid).get();
    const eventi = snap.exists && Array.isArray(snap.data().eventi) ? snap.data().eventi : [];
    await conLimite(() => ctx.auth.setCustomUserClaims(uid, { eventi: eventi }));
    return eventi;
}
// solo se i claims attuali sono diversi dal profilo; true se li ha riscritti
async function allineaClaims(ctx, uid) {
    const [snap, utente] = await Promise.all([
        ctx.db.collection('partecipanti').doc(uid).get(),
        ctx.auth.getUser(uid)
    ]);
    const eventi = snap.exists && Array.isArray(snap.data().eventi) ? snap.data().eventi : [];
    const attuali = (utente.customClaims || {}).eventi;
    if (stessaLista(attuali, eventi)) return false;
    await conLimite(() => ctx.auth.setCustomUserClaims(uid, { eventi: eventi }));
    return true;
}

/* crea: le righe confermate in anteprima (al massimo 50 per chiamata,
   cinque alla volta). Per ogni riga, UNA transazione che:
   - legge indirizzi/{email}: se la persona esiste (stessa email, scritta
     in qualunque modo) non si crea niente, la si aggiunge all'evento;
   - altrimenti prenota insieme l'indirizzo, il primo nome utente libero
     e il profilo, con l'uid generato prima.
   Poi, fuori dalla transazione, l'account Auth e i claims. Se qualcosa
   si ferma a meta', ricaricare lo stesso file completa senza doppioni. */
async function crea(ctx, { idEvento, righe }) {
    const id = controllaIdEvento(idEvento);
    if (!Array.isArray(righe) || !righe.length) throw C.errore(400, 'Nessuna riga da creare.', 'righe');
    if (righe.length > MAX_RIGHE_CREA) throw C.errore(400, 'Al massimo ' + MAX_RIGHE_CREA + ' righe per volta.', 'righe');
    const ev = await ctx.db.collection('eventi').doc(id).get();
    if (!ev.exists) throw C.errore(404, 'Evento inesistente.', 'evento');
    /* Cinque righe alla volta, ma quelle della stessa "famiglia" di nomi
       (tutti i Mario Rossi) o con la stessa email una dopo l'altra: in
       parallelo si contenderebbero gli stessi documenti e Firestore
       farebbe ripartire le transazioni (ogni ripartenza costa almeno un
       secondo di attesa). Famiglie diverse vanno avanti insieme. */
    const gruppi = new Map();
    const gruppoDellEmail = {};
    righe.forEach((r, i) => {
        const x = r || {};
        const base = N.nomeUtenteBase(C.testo(x.nome, 80), C.testo(x.cognome, 80));
        const desiderato = N.pulisciNomeUtente(x.nomeUtente) || base;
        const email = N.emailNormalizzata(x.email);
        let chiave = desiderato ? 'n:' + radiceDi(desiderato, base).radice : 'r:' + i;
        if (email && gruppoDellEmail[email]) chiave = gruppoDellEmail[email];
        else if (email) gruppoDellEmail[email] = chiave;
        if (!gruppi.has(chiave)) gruppi.set(chiave, []);
        gruppi.get(chiave).push(i);
    });
    const risultati = new Array(righe.length);
    await inParallelo(Array.from(gruppi.values()), CONCORRENZA_CREA, async indici => {
        for (const i of indici) risultati[i] = await creaRiga(ctx, id, righe[i] || {});
    });
    return { risultati: risultati };
}

/* Se i primi sessanta candidati sono tutti presi (una famiglia di
   omonimi molto numerosa), si chiede a Firestore quali nomi della
   famiglia esistono e si riparte dal primo buco: la transazione poi
   ricontrolla, come sempre. */
async function primoLiberoStimato(ctx, radice, primo) {
    const snap = await ctx.db.collection('nomiUtente').where('base', '==', radice).select().get();
    const presi = new Set(snap.docs.map(d => d.id));
    let n = primo;
    while (presi.has(N.conNumero(radice, n))) n++;
    return n;
}

async function creaRiga(ctx, idEvento, r) {
    const riga = Number(r.riga) || 0;
    const esito = (tipo, altro) => Object.assign({ riga: riga, esito: tipo, nomeUtente: '', nomeUtenteCambiato: false, uid: null, motivo: '' }, altro || {});
    const nome = C.testo(r.nome, 80);
    const cognome = C.testo(r.cognome, 80);
    const azienda = C.testo(r.azienda, 120);
    /* Una sola regola per l'indirizzo: si salva (in `email` e in
       `emailNorm`) e si spedisce quello normalizzato, senza spazi ne'
       caratteri invisibili (quelli che arrivano da Excel) e in minuscolo.
       E' lo stesso che garantisce "una email = un account", ed e' quello
       che emailValida ha controllato: niente seconda regola in invio. */
    const emailNorm = N.emailNormalizzata(String(r.email == null ? '' : r.email).slice(0, 400));
    if (!emailNorm) return esito('errore', { motivo: 'Email mancante.' });
    if (!N.emailValida(emailNorm)) return esito('errore', { motivo: 'Email non valida.' });
    if (!nome || !cognome) return esito('errore', { motivo: 'Nome o cognome vuoto.' });
    if (sospetto(nome) || sospetto(cognome)) return esito('errore', { motivo: 'Il nome o il cognome contiene caratteri non ammessi (< > o caratteri invisibili).' });
    const base = N.nomeUtenteBase(nome, cognome);
    const scritto = N.pulisciNomeUtente(r.nomeUtente);
    const desiderato = scritto || base;
    if (!desiderato) return esito('errore', { motivo: 'Da questo nome e cognome non resta nessuna lettera a-z: scrivi il nome utente a mano.' });
    const { radice, primo } = radiceDi(desiderato, base);
    const uidNuovo = nuovoUid();
    const db = ctx.db;

    let fatto;
    try {
        const prenota = inizio => transazione(ctx, async tx => {
            const rifInd = db.collection('indirizzi').doc(emailNorm);
            const ind = await tx.get(rifInd);
            const ts = adessoTs(ctx);
            if (ind.exists) {
                const uid = ind.data().uid;
                const rifP = db.collection('partecipanti').doc(uid);
                const p = await tx.get(rifP);
                if (!p.exists) return { tipo: 'incoerente', uid: uid };
                const d = p.data();
                const eventi = Array.isArray(d.eventi) ? d.eventi : [];
                if (eventi.indexOf(idEvento) >= 0) return { tipo: 'gia-nell-evento', uid: uid, dati: d };
                const nuovi = listaEventi(eventi, idEvento);
                tx.set(rifP, {
                    eventi: nuovi, idEvento: idEvento, aggiornato: ts,
                    invii: { [idEvento]: { stato: 'da inviare', aggiornato: ts, tentativi: 0 } }
                }, { merge: true });
                return { tipo: 'aggiunto', uid: uid, dati: d };
            }
            const libero = await primoNomeLibero(ctx, tx, radice, inizio, null);
            if (!libero) return { tipo: 'pieno' };
            tx.create(rifInd, { uid: uidNuovo, creato: ts });
            tx.create(db.collection('nomiUtente').doc(libero.nome), { uid: uidNuovo, base: radice, creato: ts });
            tx.create(db.collection('partecipanti').doc(uidNuovo), {
                uid: uidNuovo, nomeUtente: libero.nome, nome: nome, cognome: cognome, email: emailNorm, emailNorm: emailNorm,
                azienda: azienda, idEvento: idEvento, eventi: [idEvento], stato: 'attivo', authCreato: false,
                ultimoAccesso: null, invii: { [idEvento]: { stato: 'da inviare', aggiornato: ts, tentativi: 0 } },
                promemoria: {}, creato: ts, aggiornato: ts
            });
            tx.set(db.collection('sessioni').doc(uidNuovo), { stato: 'attivo', sessioneAttiva: null, aggiornato: ts });
            return { tipo: 'creato', uid: uidNuovo, nomeUtente: libero.nome };
        });
        fatto = await prenota(primo);
        if (fatto.tipo === 'pieno') fatto = await prenota(await primoLiberoStimato(ctx, radice, primo));
    } catch (e) {
        console.error('[diretta] crea riga ' + riga + ': ' + perLog(e));
        return esito('errore', { motivo: 'Errore temporaneo: ricarica lo stesso file per completare (non si creano doppioni).' });
    }

    if (fatto.tipo === 'incoerente') return esito('errore', { uid: fatto.uid, motivo: 'Dati incoerenti per questa email: scrivi all\'assistenza tecnica.' });
    if (fatto.tipo === 'pieno') return esito('errore', { motivo: 'Troppi nomi utente occupati a partire da "' + radice + '": scrivi il nome utente a mano.' });

    const nomeUtente = fatto.tipo === 'creato' ? fatto.nomeUtente : (fatto.dati.nomeUtente || '');
    const out = esito(fatto.tipo, {
        uid: fatto.uid, nomeUtente: nomeUtente,
        nomeUtenteCambiato: fatto.tipo === 'creato' ? nomeUtente !== desiderato : !!scritto && scritto !== nomeUtente
    });
    if (fatto.tipo !== 'creato' && fatto.dati.stato === 'disattivato') out.motivo = 'Account disattivato: riattivalo per farlo entrare.';
    try {
        const dati = fatto.dati || {};
        const nomeCompleto = fatto.tipo === 'creato' ? nome + ' ' + cognome : ((dati.nome || '') + ' ' + (dati.cognome || '')).trim();
        if (fatto.tipo === 'creato' || dati.authCreato !== true) await completaAccount(ctx, fatto.uid, nomeCompleto);
        else if (fatto.tipo === 'aggiunto') await impostaClaims(ctx, fatto.uid);
        else await allineaClaims(ctx, fatto.uid); // gia' nell'evento: si ripara solo se serve (DECISIONI T8)
    } catch (e) {
        console.error('[diretta] account della riga ' + riga + ': ' + perLog(e));
        out.esito = 'errore';
        out.motivo = e && e.pubblico ? e.message : 'Account non completato (errore di Firebase): ricarica lo stesso file per completarlo, senza doppioni.';
    }
    return out;
}

/* ---------- operazioni sul singolo partecipante ---------- */

async function leggiPartecipante(ctx, uid) {
    const snap = await ctx.db.collection('partecipanti').doc(uid).get();
    if (!snap.exists) throw C.errore(404, 'Partecipante inesistente.', 'partecipante');
    return Object.assign({ uid: uid }, snap.data());
}

async function operazionePartecipante(ctx, corpo) {
    const b = corpo || {};
    const uid = controllaUid(b.uid);
    const idEvento = controllaIdEvento(b.idEvento);
    switch (b.operazione) {
        case 'reinvia': return reinvia(ctx, uid, idEvento);
        case 'rigenera': return rigenera(ctx, uid);
        case 'disattiva': return cambiaAttivazione(ctx, uid, idEvento, false);
        case 'riattiva': return cambiaAttivazione(ctx, uid, idEvento, true);
        case 'correggi': return correggi(ctx, uid, idEvento, b);
        case 'rimuovi-evento': return rimuoviDaEvento(ctx, uid, idEvento);
        default: throw C.errore(400, 'Operazione sconosciuta.', 'operazione');
    }
}

/* Reinvia credenziali: nuova password e email subito, con la stessa
   coda "al massimo una volta" dell'invio a tutti (lib/diretta-invio.js,
   caricata solo qui: e' un modulo a parte). */
async function reinvia(ctx, uid, idEvento) {
    const p = await leggiPartecipante(ctx, uid);
    if ((p.eventi || []).indexOf(idEvento) < 0) throw C.errore(409, 'La persona non è iscritta a questo evento.', 'evento');
    if (p.stato !== 'attivo') throw C.errore(409, 'Account disattivato: riattivalo prima di reinviare le credenziali.', 'disattivato');
    if (p.authCreato !== true) throw C.errore(409, 'Account non ancora completo: ricarica il file dei partecipanti per completarlo.', 'incompleto');
    const invio = require('./diretta-invio');
    const r = await invio.inviaCredenziali(ctx, { uid: uid, idEvento: idEvento });
    return { invio: r };
}

/* Rigenera: una password nuova da comunicare a voce, mostrata UNA
   volta sola in gestione e mai salvata ne' scritta nei log. La vecchia
   smette di valere e chi e' collegato viene scollegato entro un'ora
   (Firebase chiude le sessioni quando la password cambia). */
async function rigenera(ctx, uid) {
    const p = await leggiPartecipante(ctx, uid);
    if (p.authCreato !== true) throw C.errore(409, 'Account non ancora completo: ricarica il file dei partecipanti per completarlo.', 'incompleto');
    const password = generaPassword(10);
    await conLimite(() => ctx.auth.updateUser(uid, { password: password }));
    return { password: password };
}

/* Disattiva / riattiva: prima Firestore (le regole leggono sessioni/{uid}
   a ogni lettura dell'evento e a ogni segnale di presenza: l'effetto e'
   immediato), poi Firebase Auth (niente nuovi accessi, sessioni chiuse). */
async function cambiaAttivazione(ctx, uid, idEvento, attivo) {
    const p = await leggiPartecipante(ctx, uid);
    const ts = adessoTs(ctx);
    const stato = attivo ? 'attivo' : 'disattivato';
    const batch = ctx.db.batch();
    batch.update(ctx.db.collection('partecipanti').doc(uid), { stato: stato, aggiornato: ts });
    batch.set(ctx.db.collection('sessioni').doc(uid), { stato: stato, sessioneAttiva: null, aggiornato: ts }, { merge: true });
    await batch.commit();
    if (p.authCreato === true) {
        await conLimite(() => ctx.auth.updateUser(uid, { disabled: !attivo }));
        if (!attivo) await conLimite(() => ctx.auth.revokeRefreshTokens(uid));
    }
    return { partecipante: partecipanteJSON(Object.assign({}, p, { stato: stato }), idEvento) };
}

/* Correggi nome, cognome, azienda, email.
   - Se nome e cognome danno un'altra base, il nome utente si ricalcola con
     la stessa prenotazione di `crea` (nella stessa transazione: si prende
     il nuovo e si libera il vecchio), a meno che la gestione chieda di
     mantenere quello attuale (credenziali gia' spedite).
   - Se cambia l'email, si sposta la prenotazione dell'indirizzo; se la
     nuova e' gia' di un'altra persona, niente da fare (409).
   L'email tecnica su Auth non cambia mai (DECISIONI D1): chi e' collegato
   resta collegato. Se il nome utente cambia, le credenziali per l'evento
   tornano "da inviare"; se l'email era stata respinta, anche. */
async function correggi(ctx, uid, idEvento, b) {
    const nome = C.testo(b.nome, 80);
    const cognome = C.testo(b.cognome, 80);
    const azienda = C.testo(b.azienda, 120);
    if (!nome || !cognome) throw C.errore(400, 'Nome e cognome non possono essere vuoti.', 'nome');
    if (sospetto(nome) || sospetto(cognome)) throw C.errore(400, 'Il nome o il cognome contiene caratteri non ammessi (< > o caratteri invisibili).', 'nome');
    const nuovaBase = N.nomeUtenteBase(nome, cognome);
    if (!nuovaBase) throw C.errore(400, 'Da questo nome e cognome non resta nessuna lettera a-z.', 'nome');
    const mantieni = b.mantieniNomeUtente === true;
    const db = ctx.db;
    const rifP = db.collection('partecipanti').doc(uid);
    // da dove cercare il nuovo nome: dalla base, o dal primo buco se la famiglia e' molto numerosa
    let inizioNome = 1;
    if (!mantieni) {
        const libero = await db.collection('nomiUtente').doc(nuovaBase).get();
        if (libero.exists && libero.data().uid !== uid) inizioNome = await primoLiberoStimato(ctx, nuovaBase, 1);
    }

    const fatto = await transazione(ctx, async tx => {
        const snap = await tx.get(rifP);
        if (!snap.exists) throw C.errore(404, 'Partecipante inesistente.', 'partecipante');
        const d = snap.data();
        // la stessa regola di `crea`: si salva l'indirizzo normalizzato (vale anche per i profili di prima)
        const emailNorm = N.emailNormalizzata(b.email !== undefined ? String(b.email || '').slice(0, 400) : (d.emailNorm || d.email || ''));
        if (!N.emailValida(emailNorm)) throw C.errore(400, 'Email non valida.', 'email');
        const cambiaEmail = emailNorm !== d.emailNorm;
        const cambiaNome = !mantieni && nuovaBase !== N.nomeUtenteBase(d.nome, d.cognome);

        // prima tutte le letture...
        let indNuovo = null, indVecchio = null, nomeVecchio = null, libero = null;
        if (cambiaEmail) {
            [indNuovo, indVecchio] = await tx.getAll(db.collection('indirizzi').doc(emailNorm), db.collection('indirizzi').doc(d.emailNorm || '-'));
            if (indNuovo.exists && indNuovo.data().uid !== uid) {
                throw C.errore(409, 'Questa email appartiene già a un\'altra persona: non si possono unire due account.', 'email-occupata');
            }
        }
        if (cambiaNome) {
            libero = await primoNomeLibero(ctx, tx, nuovaBase, inizioNome, uid);
            if (!libero) throw C.errore(409, 'Troppi nomi utente occupati a partire da "' + nuovaBase + '".', 'pieno');
            nomeVecchio = await tx.get(db.collection('nomiUtente').doc(d.nomeUtente || '-'));
        }

        // ...poi le scritture
        const ts = adessoTs(ctx);
        const nomeUtente = cambiaNome ? libero.nome : d.nomeUtente;
        const agg = { nome: nome, cognome: cognome, azienda: azienda, email: emailNorm, emailNorm: emailNorm, nomeUtente: nomeUtente, aggiornato: ts };
        if (cambiaNome && nomeUtente !== d.nomeUtente) {
            if (!libero.mio) tx.create(db.collection('nomiUtente').doc(nomeUtente), { uid: uid, base: nuovaBase, creato: ts });
            if (nomeVecchio && nomeVecchio.exists && nomeVecchio.data().uid === uid) tx.delete(nomeVecchio.ref);
        }
        if (cambiaEmail) {
            if (!indNuovo.exists) tx.create(indNuovo.ref, { uid: uid, creato: ts });
            if (indVecchio && indVecchio.exists && indVecchio.data().uid === uid) tx.delete(indVecchio.ref);
        }
        const invio = (d.invii || {})[idEvento];
        const nomeCambiato = nomeUtente !== d.nomeUtente;
        if (invio && ((nomeCambiato && ['inviata', 'incerto', 'respinta', 'errore'].indexOf(invio.stato) >= 0)
            || (cambiaEmail && invio.stato === 'respinta'))) {
            agg['invii.' + idEvento + '.stato'] = 'da inviare';
            agg['invii.' + idEvento + '.aggiornato'] = ts;
        }
        tx.update(rifP, agg);
        return { prima: d, nomeCambiato: nomeCambiato };
    });

    const d = fatto.prima;
    const nomeCompleto = nome + ' ' + cognome;
    if (d.authCreato === true && nomeCompleto !== ((d.nome || '') + ' ' + (d.cognome || '')).trim()) {
        await conLimite(() => ctx.auth.updateUser(uid, { displayName: nomeCompleto }));
    }
    if (fatto.nomeCambiato) await cancellaTentativi(ctx, d.nomeUtente);
    const aggiornato = await leggiPartecipante(ctx, uid);
    return {
        partecipante: partecipanteJSON(aggiornato, idEvento),
        nomeUtenteCambiato: fatto.nomeCambiato,
        nomeUtentePrecedente: d.nomeUtente || ''
    };
}

/* I contatori dei tentativi di un nome che non esiste piu': le coppie
   tentativi/{nome}_{rete} e il tetto tentativiNome/{nome}. Se il nome
   liberato tocca poi a un'altra persona (un nuovo omonimo), non deve
   ereditare gli errori o il blocco di chi lo aveva prima.
   Le coppie di quel nome sono i documenti da "{nome}_" (compreso) a
   "{nome}`" (escluso): il carattere ` viene subito dopo _ nella tabella
   dei caratteri, e i nomi utente sono solo [a-z0-9] (le impronte delle
   reti solo [0-9a-f]), quindi nessun altro nome ci cade in mezzo:
   "mariorossi30_..." sta prima di "mariorossi3_", "mariorossi3a..." dopo
   "mariorossi3`". Niente caratteri invisibili nel limite: si leggono
   male e si scambiano per un intervallo vuoto. */
async function cancellaTentativi(ctx, nomeUtente) {
    if (!nomeUtente) return;
    try {
        const coppie = await ctx.db.collection('tentativi')
            .where(ctx.FieldPath.documentId(), '>=', nomeUtente + '_')
            .where(ctx.FieldPath.documentId(), '<', nomeUtente + '`').get();
        const batch = ctx.db.batch();
        coppie.docs.slice(0, 399).forEach(d => batch.delete(d.ref));
        batch.delete(ctx.db.collection('tentativiNome').doc(nomeUtente));
        await batch.commit();
    } catch (e) {
        console.error('[diretta] pulizia dei tentativi: ' + perLog(e));
    }
}

/* Togli da questo evento (diverso da "disattiva", che chiude tutto
   l'account): via l'evento dalla lista, dai claims, dagli invii e dai
   promemoria. Se non restano eventi l'account resta attivo ma non vede
   nessuna diretta. */
async function rimuoviDaEvento(ctx, uid, idEvento) {
    const rifP = ctx.db.collection('partecipanti').doc(uid);
    await transazione(ctx, async tx => {
        const snap = await tx.get(rifP);
        if (!snap.exists) throw C.errore(404, 'Partecipante inesistente.', 'partecipante');
        const d = snap.data();
        const eventi = Array.isArray(d.eventi) ? d.eventi : [];
        if (eventi.indexOf(idEvento) < 0) throw C.errore(409, 'La persona non è iscritta a questo evento.', 'evento');
        const resto = eventi.filter(x => x !== idEvento);
        tx.update(rifP, new ctx.FieldPath('eventi'), resto,
            new ctx.FieldPath('idEvento'), resto[0] || '',
            new ctx.FieldPath('invii', idEvento), ctx.FieldValue.delete(),
            new ctx.FieldPath('promemoria', idEvento), ctx.FieldValue.delete(),
            new ctx.FieldPath('aggiornato'), adessoTs(ctx));
    });
    const p = await leggiPartecipante(ctx, uid);
    if (p.authCreato === true) await impostaClaims(ctx, uid);
    return { partecipante: partecipanteJSON(p, idEvento) };
}

/* ============================================================
   COLLEGATI ED ESPORTAZIONE
   ============================================================ */

/* Chi e' collegato adesso: le presenze con un segnale negli ultimi 150
   secondi (la pagina ne manda uno al minuto). Una query di conteggio:
   costa una lettura ogni mille documenti contati. */
async function connessi(ctx, idEvento) {
    const id = controllaIdEvento(idEvento);
    const ora = ctx.adesso();
    const c = await ctx.db.collection('presenze')
        .where('idEvento', '==', id)
        .where('ultimo', '>=', ctx.Timestamp.fromMillis(ora - FINESTRA_CONNESSI_MS))
        .count().get();
    return { connessi: c.data().count, quando: ora };
}

/* Esportazione per gli attestati: i partecipanti con la loro presenza e
   l'elenco degli accessi. I minuti si limitano alla durata dell'evento
   (un segnale al minuto, verificato dalle regole con l'orario del server;
   piu' della durata non puo' essere). */
async function esporta(ctx, idEvento) {
    const id = controllaIdEvento(idEvento);
    const ev = await leggiEvento(ctx, id);
    const durata = Math.max(0, Math.round(((ms(ev.dati.fine) || 0) - (ms(ev.dati.inizio) || 0)) / 1000));
    const [partecipanti, presenze, accessi] = await Promise.all([
        elencoPartecipanti(ctx, id),
        ctx.db.collection('presenze').where('idEvento', '==', id).get(),
        ctx.db.collection('accessi').where('idEvento', '==', id).get()
    ]);
    const perUid = {};
    presenze.docs.forEach(d => {
        const p = d.data();
        const secondi = Math.max(0, Number(p.secondi) || 0);
        perUid[p.uid] = { primo: ms(p.primo), ultimo: ms(p.ultimo), secondi: durata ? Math.min(secondi, durata) : secondi, secondiRegistrati: secondi, collegamenti: Number(p.collegamenti) || 0 };
    });
    return {
        evento: ev.json,
        nota: 'Minuti stimati dalla pagina durante la diretta (segnale ogni 60 s, verificato dalle regole con l\'orario del server); limitati alla durata dell\'evento.',
        partecipanti: partecipanti.map(p => Object.assign(p, { presenza: perUid[p.uid] || null })),
        accessi: accessi.docs.map(d => {
            const a = d.data();
            return { quando: ms(a.quando), nomeUtente: a.nomeUtente || '', nome: a.nome || '', cognome: a.cognome || '', azienda: a.azienda || '', dispositivo: a.dispositivo || '' };
        }).sort((a, b) => (a.quando || 0) - (b.quando || 0))
    };
}

module.exports = {
    // attrezzi e risposte
    ms, jsonDi, errorePubblico, rispondi, perLog, controllaIdEvento, controllaUid, nuovoUid, listaEventi, stessaLista,
    inParallelo, conRiprova, radiceDi, emailMascherata, leggiProgramma, normalizzaOra, leggiVideo, leggiAzoto, campiVideo, riservatiDa,
    // eventi
    eventoJSON, leggiEvento, elencoEventi, salvaEvento, cambiaStato, cambiaVideo, cambiaSorgente, cambiaPlayer, linkVideo, cambiaAvviso, scegliEvento,
    // partecipanti
    partecipanteJSON, elencoPartecipanti, anteprima, crea, operazionePartecipante, impostaClaims, allineaClaims,
    cancellaTentativi,
    // collegati ed esportazione
    connessi, esporta,
    RE_ID_EVENTO, STATI_EVENTO, SORGENTI, TIPI_PLAYER, MAX_RIGHE_CREA
};
