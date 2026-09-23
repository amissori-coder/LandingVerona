/* ============================================================
   Promemoria: le parole che dipendono dal GIORNO DELL'INVIO
   ------------------------------------------------------------
   Un promemoria non dice "manca una settimana" scritto a mano: dice
   quanti giorni mancano la mattina in cui parte davvero. Serve perche'
   la stessa mail puo' partire in giorni diversi: il giorno per cui e'
   programmata, oppure piu' tardi, come benvenuto a chi si e' iscritto
   dopo. Qui si calcola tutto a partire da tre date, in ora di Roma:
   il giorno dell'invio, il giorno dell'evento e la chiusura delle
   prenotazioni B2B.

   Segnaposti (la maiuscola iniziale dice se la parola apre la frase):
     {{MANCANO}} {{mancano}}   "Mancano 5 giorni" / "manca un giorno"
     {{QUANDO}}  {{quando}}    "Domani" / "oggi" / "venerdì 2 ottobre"
     {{CHIUSURA_B2B}}          "il 30 settembre" / "domani" / "oggi"
   Blocco a scadenza: quello che sta fra i segni SE_B2B vale solo fino
   al giorno di chiusura delle prenotazioni compreso; dopo, sparisce
   (nell'HTML sono commenti <!--SE_B2B--> ... <!--/SE_B2B-->, nel solo
   testo [[SE_B2B]] ... [[/SE_B2B]]).

   GEMELLO: la stessa funzione sta in area-riservata/promemoria-eventi.js
   (tempo), per l'anteprima. Una prova le confronta giorno per giorno:
   se ne cambia una, va cambiata l'altra.
   ============================================================ */
'use strict';

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function utc(iso) { const m = ISO.exec(String(iso || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; }
// giorni da `da` a `a` (date "aaaa-mm-gg"): 0 se sono lo stesso giorno
function giorniTra(da, a) { return Math.round((utc(a) - utc(da)) / 86400000); }
function dataEstesa(iso) { const t = utc(iso); if (isNaN(t)) return ''; const d = new Date(t); return d.getUTCDate() + ' ' + MESI[d.getUTCMonth()]; }
function giornoEsteso(iso) { const t = utc(iso); if (isNaN(t)) return ''; return GIORNI[new Date(t).getUTCDay()] + ' ' + dataEstesa(iso); }
function maiuscola(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* Le frasi per un invio che parte il giorno `oggi`. */
function frasi(oggi, evento, chiusuraB2B) {
    const n = ISO.test(evento) && ISO.test(oggi) ? giorniTra(oggi, evento) : NaN;
    const mancano = isNaN(n) ? 'mancano pochi giorni'
        : n >= 2 ? 'mancano ' + n + ' giorni'
            : n === 1 ? 'manca un giorno'
                : n === 0 ? 'ci siamo' : '';
    const quando = isNaN(n) ? '' : n === 0 ? 'oggi' : n === 1 ? 'domani' : giornoEsteso(evento);
    let chiusura = 'prima dell\'evento', b2bAperto = true;
    if (ISO.test(chiusuraB2B) && ISO.test(oggi)) {
        const k = giorniTra(oggi, chiusuraB2B);
        b2bAperto = k >= 0;
        chiusura = k === 0 ? 'oggi' : k === 1 ? 'domani' : 'il ' + dataEstesa(chiusuraB2B);
    }
    return { giorni: n, mancano: mancano, quando: quando, chiusura: chiusura, b2bAperto: b2bAperto };
}

/* Applica le frasi a un testo (oggetto, HTML o solo testo). */
function applica(s, f) {
    let out = String(s == null ? '' : s)
        .split('{{MANCANO}}').join(maiuscola(f.mancano)).split('{{mancano}}').join(f.mancano)
        .split('{{QUANDO}}').join(maiuscola(f.quando)).split('{{quando}}').join(f.quando)
        .split('{{CHIUSURA_B2B}}').join(f.chiusura);
    out = out.replace(/<!--SE_B2B-->([\s\S]*?)<!--\/SE_B2B-->/g, (m, dentro) => f.b2bAperto ? dentro : '')
        .replace(/\[\[SE_B2B\]\]([\s\S]*?)\[\[\/SE_B2B\]\]/g, (m, dentro) => f.b2bAperto ? dentro : '');
    // nel solo testo un blocco tolto lascerebbe righe vuote in fila
    return out.replace(/\n{3,}/g, '\n\n');
}

module.exports = { frasi, applica, giorniTra, giornoEsteso, dataEstesa };
