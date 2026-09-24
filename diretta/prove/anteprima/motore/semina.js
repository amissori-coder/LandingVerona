/* ============================================================
   ANTEPRIMA - la semina: evento e accessi di prova
   ------------------------------------------------------------
   Alla prima apertura (e ogni giorno nuovo, perche' l'evento di prova
   e' sempre "oggi") l'anteprima prepara tutto passando dal servizio
   VERO, come farebbe un gestore:
   1. "Primo accesso" del gestore (gestore@anteprima.it): l'account di
      gestione lo crea il servizio; qui si fissa la password di prova;
   2. l'evento "Next Generation Business 2026 · Napoli", di oggi, che
      comincia tra circa mezz'ora (conto alla rovescia visibile);
   3. quattro partecipanti, due dei quali omonimi (Mario Rossi e Mario
      Rossi: mariorossi e mariorossi2);
   4. le credenziali, spedite con "Reinvia credenziali": le email sono
      nella Posta di prova, con le password elencate nella guida.
   ============================================================ */
'use strict';
const adm = require('./admin');
const servizio = require('./servizio');

const ID_EVENTO = 'napoli-anteprima';
const GESTORE = { email: 'gestore@anteprima.it', password: 'Regia-Napoli-26' };
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
            videoUrl: 'https://webtv.esempio.it/live/napoli/playlist.m3u8',
            programma: [
                { ora: orari.oraInizio.replace(':', '.'), titolo: 'Apertura dei lavori' },
                { ora: '', titolo: 'Governance e controlli: cosa cambia per le imprese' },
                { ora: '', titolo: 'Tavola rotonda con le imprese del territorio' },
                { ora: orari.oraFine.replace(':', '.'), titolo: 'Chiusura' }
            ],
            paginaEvento: '/napoli_ottobre_2026/',
            unSoloDispositivo: false,
            promemoria: { giornoPrima: false, oraPrima: false }
        }
    });

    passo('Iscrivo i partecipanti di prova…');
    const creati = await gestione({
        azione: 'crea', idEvento: ID_EVENTO,
        righe: PARTECIPANTI.map((p, i) => ({ riga: i + 2, nome: p.nome, cognome: p.cognome, email: p.email, azienda: p.azienda }))
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
            nomeUtente: esito.nomeUtente, password: PARTECIPANTI[i].password, email: PARTECIPANTI[i].email
        });
    }

    archivio.extra.semina = { giorno: giornoDiOggi(), quando: Date.now(), idEvento: ID_EVENTO, orari, gestore: GESTORE, accessi };
    archivio.salva();
    passo('Pronto.');
    return archivio.extra.semina;
}

function serveSemina(archivio) {
    const s = archivio.extra && archivio.extra.semina;
    return !s || s.giorno !== giornoDiOggi();
}

// gestione(): una chiamata alla gestione come il gestore di prova (la usano anche le prove della diretta)
module.exports = { semina, serveSemina, gestione, ID_EVENTO, GESTORE, PARTECIPANTI };
