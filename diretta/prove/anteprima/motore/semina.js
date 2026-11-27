/* ============================================================
   ANTEPRIMA - la semina: evento e accessi di prova
   ------------------------------------------------------------
   Alla prima apertura (e ogni giorno nuovo, perche' l'evento di prova
   e' sempre "oggi") l'anteprima prepara tutto passando dal servizio
   VERO, come farebbe un gestore:
   1. "Primo accesso" del gestore (gestore@anteprima.it): l'account di
      gestione lo crea il servizio; qui si fissa la password di prova;
   2. l'evento "Next Generation Business 2026 · Napoli", di oggi, che
      comincia tra circa mezz'ora (conto alla rovescia visibile), con il
      video in modalita' A, il player incorporato: un video di YouTube
      (tipoPlayer 'azoto', il campo «Player YouTube, Castr o Azoto»), come il
      webinar. C'e' anche un flusso diretto .m3u8 della web TV finta, per
      passare alla modalita' B dalla regia;
   3. quattro partecipanti, due con lo stesso nome (Mario Rossi e Mario
      Rossi) ma con email diverse: si entra con l'email, niente nomi utente;
   4. le credenziali, spedite con "Reinvia credenziali": le email sono
      nella Posta di prova, con l'email per entrare e le password
      elencate nella guida;
   5. le DOMANDE AL RELATORE accese per l'evento, con la relatrice di
      prova: Laura Verdi, una partecipante come le altre (le credenziali
      sono nella Posta di prova), segnata come relatrice dalla regia
      (azione 'relatore-segna', scheda Partecipanti); e due domande gia'
      arrivate da due partecipanti, mandate dalla porta vera
      (api/diretta-domande, azione 'invia').
   ============================================================ */
'use strict';
const adm = require('./admin');
const servizio = require('./servizio');

const ID_EVENTO = 'napoli-anteprima';
/* La versione della semina: quando cambia (per esempio il relatore che
   diventa una partecipante segnata), chi ha gia' aperto l'anteprima oggi
   riparte con i dati nuovi invece di tenere quelli di prima. */
const VERSIONE_SEMINA = 2;
// l'indirizzo del player di Azoto (quello del codice che Azoto ci ha dato)
const AZOTO_URL = 'https://cdn.azotosolutions.com/cloudtv/livetv91/player';
/* Il video dell'evento di prova: un video di YouTube, come il webinar del
   10 dicembre 2026 (va nello stesso campo del player di Azoto, «Player
   YouTube, Castr o Azoto»). Nell'anteprima al suo posto c'e' il riquadro di prova. */
const YOUTUBE_URL = 'https://www.youtube.com/live/ngbDiretta1';
const GESTORE = { email: 'gestore@anteprima.it', password: 'Regia-Napoli-26' };
// la relatrice: una partecipante dell'evento, segnata come relatrice dalla regia
const RELATORE = { nome: 'Laura', cognome: 'Verdi', email: 'laura.verdi@esempio.it', azienda: 'Studio Verdi', password: 'Scena4Rapt' };
// le domande gia' arrivate all'apertura: chi le ha scritte (indice in PARTECIPANTI) e il testo
const DOMANDE = [
    { chi: 1, testo: 'Per una srl che supera i limiti per la prima volta, da quando scatta l\'obbligo di nominare il revisore?' },
    { chi: 2, testo: 'Il collegio sindacale può svolgere anche la revisione legale dei conti, oppure servono due incarichi separati?' }
];
const PARTECIPANTI = [
    { nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@esempio.it', azienda: 'Rossi Costruzioni srl', password: 'Vesuv9Kaz3' },
    { nome: 'Anna Maria', cognome: 'De Luca', email: 'annamaria.deluca@esempio.it', azienda: 'Studio De Luca', password: 'Capr3Mare7' },
    { nome: 'Nicolò', cognome: 'D\'Angelo', email: 'nicolo.dangelo@esempio.it', azienda: 'D\'Angelo Consulting', password: 'Pasta7Duke' },
    { nome: 'Mario', cognome: 'Rossi', email: 'm.rossi@altraimpresa.it', azienda: 'Altra Impresa spa', password: 'Baba9Rum4x' }
];

function partiRoma(ms) {
    const f = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    const p = {};
    f.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
    return { data: p.year + '-' + p.month + '-' + p.day, ore: Number(p.hour), minuti: Number(p.minute) };
}
function hhmm(minuti) { return String(Math.floor(minuti / 60)).padStart(2, '0') + ':' + String(minuti % 60).padStart(2, '0'); }
// "10:30" piu' 30 minuti -> "11:00"
function piu(hhmmTesto, minuti) { const [h, m] = String(hhmmTesto).split(':').map(Number); return hhmm(Math.min(h * 60 + m + minuti, 23 * 60 + 59)); }
function giornoDiOggi() { return partiRoma(Date.now()).data; }

/* Oggi, tra 25-30 minuti (a multipli di 5), per tre ore. Dopo le 21 si
   passa a domattina: l'evento di prova resta "in attesa". */
function orariDellEvento() {
    const tra = partiRoma(Date.now() + 25 * 60000);
    const oggi = giornoDiOggi();
    let inizio = Math.ceil((tra.ore * 60 + tra.minuti) / 5) * 5;
    if (tra.data !== oggi || inizio >= 21 * 60) {
        const domani = tra.data !== oggi ? tra.data : partiRoma(Date.now() + 24 * 3600000).data;
        return { data: domani, oraInizio: '09:30', oraFine: '12:30' };
    }
    return { data: oggi, oraInizio: hhmm(inizio), oraFine: hhmm(Math.min(inizio + 180, 23 * 60 + 55)) };
}

function tokenGestore() {
    const u = adm.perEmail(GESTORE.email);
    return adm.tokenIdentita(u, 'password', Date.now() + 1000);
}
async function gestione(corpo) {
    const r = await servizio.chiama('diretta-gestione', {
        corpo, intestazioni: { authorization: 'Bearer ' + tokenGestore(), origin: 'https://nextgenerationbusiness.it', 'x-forwarded-for': '151.12.3.4' }
    });
    const j = JSON.parse(r.corpo || '{}');
    if (r.stato !== 200 || !j.ok) throw new Error('semina: ' + corpo.azione + ' ' + r.stato + ' ' + String(j.msg || '').slice(0, 160));
    return j;
}

async function semina(archivio, avanzamento) {
    const passo = t => { try { if (avanzamento) avanzamento(t); } catch (e) { /* niente */ } };

    passo('Attivo l\'account della regia…');
    const r = await servizio.chiama('diretta-accesso', {
        corpo: { azione: 'gestore-accesso', email: GESTORE.email },
        intestazioni: { origin: 'https://nextgenerationbusiness.it', 'x-forwarded-for': '151.12.3.4' }
    });
    if (r.stato !== 200) throw new Error('semina: gestore-accesso ' + r.stato);
    const g = adm.perEmail(GESTORE.email);
    if (!g) throw new Error('semina: account del gestore non creato');
    await adm.auth.updateUser(g.uid, { password: GESTORE.password });

    passo('Creo l\'evento di prova…');
    const orari = orariDellEvento();
    await gestione({
        azione: 'evento-salva',
        evento: {
            id: ID_EVENTO, nuovo: true,
            titolo: 'Next Generation Business 2026 · Napoli',
            luogo: 'Napoli · Hotel Eurostars Excelsior',
            data: orari.data, oraInizio: orari.oraInizio, oraFine: orari.oraFine,
            // modalita' A (il player di Azoto), e il flusso diretto pronto per la B
            tipoPlayer: 'azoto',
            azotoUrl: YOUTUBE_URL,
            videoUrl: 'https://webtv.esempio.it/live/napoli/playlist.m3u8',
            programma: [
                /* ogni voce con la sua ora: il modulo della scheda Evento non salva
                   voci senza ora, e l'evento di prova si deve poter modificare */
                { ora: orari.oraInizio.replace(':', '.'), titolo: 'Apertura dei lavori' },
                { ora: piu(orari.oraInizio, 30).replace(':', '.'), titolo: 'Governance e controlli: cosa cambia per le imprese' },
                { ora: piu(orari.oraInizio, 100).replace(':', '.'), titolo: 'Tavola rotonda con le imprese del territorio' },
                { ora: orari.oraFine.replace(':', '.'), titolo: 'Chiusura' }
            ],
            paginaEvento: '/napoli_ottobre_2026/',
            unSoloDispositivo: false,
            // le domande al relatore: il riquadro nella pagina della diretta, la pagina del relatore
            domande: true,
            promemoria: { giornoPrima: false, oraPrima: false }
        }
    });

    passo('Iscrivo i partecipanti di prova…');
    // i partecipanti e, ultima, la relatrice: un account come gli altri
    const tutti = PARTECIPANTI.concat([RELATORE]);
    const creati = await gestione({
        azione: 'crea', idEvento: ID_EVENTO,
        righe: tutti.map((p, i) => ({ riga: i + 2, nome: p.nome, cognome: p.cognome, email: p.email, azienda: p.azienda }))
    });
    const accessi = [];
    for (let i = 0; i < PARTECIPANTI.length; i++) {
        const esito = (creati.risultati || [])[i] || {};
        if (!esito.uid) throw new Error('semina: riga ' + (i + 2) + ' non creata (' + (esito.motivo || esito.esito) + ')');
        passo('Spedisco le credenziali a ' + PARTECIPANTI[i].nome + ' ' + PARTECIPANTI[i].cognome + '…');
        // la prossima password generata dal servizio sara' quella della guida (vedi shim-password.js)
        globalThis.NGBA_PROSSIMA_PASSWORD = PARTECIPANTI[i].password;
        await gestione({ azione: 'partecipante', operazione: 'reinvia', uid: esito.uid, idEvento: ID_EVENTO });
        globalThis.NGBA_PROSSIMA_PASSWORD = '';
        accessi.push({
            nome: PARTECIPANTI[i].nome + ' ' + PARTECIPANTI[i].cognome, azienda: PARTECIPANTI[i].azienda,
            email: PARTECIPANTI[i].email, password: PARTECIPANTI[i].password
        });
    }

    passo('Segno Laura Verdi come relatrice…');
    const esitoR = (creati.risultati || [])[PARTECIPANTI.length] || {};
    if (!esitoR.uid) throw new Error('semina: relatrice non creata (' + (esitoR.motivo || esitoR.esito) + ')');
    globalThis.NGBA_PROSSIMA_PASSWORD = RELATORE.password;
    await gestione({ azione: 'partecipante', operazione: 'reinvia', uid: esitoR.uid, idEvento: ID_EVENTO });
    globalThis.NGBA_PROSSIMA_PASSWORD = '';
    await gestione({ azione: 'relatore-segna', idEvento: ID_EVENTO, uid: esitoR.uid, relatore: true });

    passo('Arrivano le prime domande per il relatore…');
    for (const q of DOMANDE) {
        const esito = (creati.risultati || [])[q.chi] || {};
        const u = adm.auth && esito.uid ? await adm.auth.getUser(esito.uid) : null;
        if (!u) throw new Error('semina: partecipante della domanda non trovato');
        const r2 = await servizio.chiama('diretta-domande', {
            corpo: { azione: 'invia', idEvento: ID_EVENTO, testo: q.testo },
            intestazioni: {
                authorization: 'Bearer ' + adm.tokenIdentita(adm.perEmail(u.email), 'custom', Date.now()),
                origin: 'https://nextgenerationbusiness.it', 'x-forwarded-for': '93.44.10.' + (40 + q.chi)
            }
        });
        if (r2.stato !== 200) throw new Error('semina: domanda di prova ' + r2.stato + ' ' + String(r2.corpo || '').slice(0, 160));
    }

    archivio.extra.semina = { versione: VERSIONE_SEMINA, giorno: giornoDiOggi(), quando: Date.now(), idEvento: ID_EVENTO, orari, gestore: GESTORE, relatore: RELATORE, accessi };
    archivio.salva();
    passo('Pronto.');
    return archivio.extra.semina;
}

function serveSemina(archivio) {
    const s = archivio.extra && archivio.extra.semina;
    return !s || s.giorno !== giornoDiOggi() || s.versione !== VERSIONE_SEMINA;
}

// gestione(): una chiamata alla gestione come il gestore di prova (la usano anche le prove della diretta)
module.exports = { semina, serveSemina, gestione, ID_EVENTO, AZOTO_URL, YOUTUBE_URL, GESTORE, RELATORE, PARTECIPANTI };
