/* ============================================================
   Diretta degli eventi: le scritture su Firebase Auth, con misura
   ------------------------------------------------------------
   Firebase Auth ha dei tetti alle chiamate di amministrazione
   (creare un account, cambiarne la password, mettergli i claims,
   chiudergli le sessioni). Con mille partecipanti da creare o da
   mandare in coda, un servizio che chiama "piu' forte che puo'"
   prende rifiuti a raffica: meglio andare a un passo costante.

   Qui c'e' UN solo attrezzo, conLimite(fn), da usare per OGNI
   scrittura su Auth delle funzioni della diretta:
       await conLimite(() => ctx.auth.createUser({...}))
   e fa due cose:
   1. PASSO: al massimo 8 chiamate al secondo per istanza (in
      memoria: ogni istanza di Vercel ha il suo contatore; con piu'
      istanze accese insieme il totale resta comunque lontano dai
      tetti di Google). Le chiamate in piu' aspettano il loro turno,
      in ordine di arrivo.
   2. NUOVI TENTATIVI: se Google risponde "troppe richieste" o
      "errore interno" (quota superata, 429, 503), si riprova dopo
      0,5, 1, 2 e 4 secondi, al massimo quattro volte. Gli altri
      errori (email gia' usata, utente inesistente...) passano subito
      a chi ha chiamato: riprovare non cambierebbe la risposta.

   Le letture (getUser, verifyIdToken, createCustomToken) non passano
   da qui: non consumano i tetti delle scritture e devono restare
   veloci per l'accesso delle persone.

   La lettura (per le prove) si puo' alzare con DIRETTA_AUTH_AL_SECONDO.
   ============================================================ */
'use strict';

const PAUSE_TENTATIVI_MS = [500, 1000, 2000, 4000];
const CODICI_RIPETIBILI = new Set([
    'auth/quota-exceeded', 'auth/too-many-requests', 'auth/internal-error'
]);

function alSecondo() {
    const v = Number(process.env.DIRETTA_AUTH_AL_SECONDO);
    return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 8;
}

const pausa = ms => new Promise(r => setTimeout(r, ms));

/* ---------- il passo ----------
   `partenze` tiene gli istanti delle chiamate partite nell'ultimo
   secondo. `fila` e' una catena di promesse: ogni richiesta di turno
   si accoda alla precedente, cosi' chi arriva prima parte prima e due
   chiamate non si prendono lo stesso posto. */
let partenze = [];
let fila = Promise.resolve();

function turno() {
    const mio = fila.then(async () => {
        for (;;) {
            const ora = Date.now();
            partenze = partenze.filter(t => ora - t < 1000);
            if (partenze.length < alSecondo()) { partenze.push(ora); return; }
            await pausa(partenze[0] + 1000 - ora + 1);
        }
    });
    // la fila non si deve mai "rompere": un errore qui non blocca i successivi
    fila = mio.catch(() => {});
    return mio;
}

/* Un rifiuto per troppe richieste o un guasto passeggero di Google?
   I codici di firebase-admin sono in e.code (o in e.errorInfo.code);
   lo stato HTTP, quando c'e', in e.httpResponse.status o in e.status. */
function ripetibile(e) {
    if (!e) return false;
    const codice = String(e.code || (e.errorInfo && e.errorInfo.code) || '');
    if (CODICI_RIPETIBILI.has(codice)) return true;
    const stato = Number((e.httpResponse && e.httpResponse.status) || e.status || e.statusCode || 0);
    return stato === 429 || stato === 503;
}

async function conLimite(fn) {
    for (let tentativo = 0; ; tentativo++) {
        await turno();
        try {
            return await fn();
        } catch (e) {
            if (tentativo >= PAUSE_TENTATIVI_MS.length || !ripetibile(e)) throw e;
            await pausa(PAUSE_TENTATIVI_MS[tentativo]);
        }
    }
}

// solo per le prove: ricomincia da zero il conto delle partenze
function azzera() {
    partenze = [];
    fila = Promise.resolve();
}

module.exports = { conLimite, ripetibile, azzera, alSecondo };
