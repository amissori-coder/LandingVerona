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

/* NOMI E AZIENDE SCRITTI TUTTI ALLO STESSO MODO.
   Persone: chi scrive tutto maiuscolo o tutto minuscolo ("MARIO ROSSI",
   "anna d'amico") diventa "Mario Rossi", "Anna D'Amico"; chi ha gia' messo
   le maiuscole al loro posto ("McArthur") resta com'e'.
   Aziende: stessa regola per le parole, le preposizioni in mezzo restano
   minuscole ("Studio di Consulenza"), e la forma societaria si scrive
   sempre nello stesso modo: S.r.l., S.r.l.s., S.p.A., S.a.s., S.n.c.,
   S.c.a r.l., S.s. */
const FORME = [
    [/(^|[\s,])s\.?\s?c\.?\s?a\.?\s?r\.?\s?l\.?(?=$|[\s,])/gi, 'S.c.a r.l.'],
    [/(^|[\s,])s\.?\s?c\.?\s?r\.?\s?l\.?(?=$|[\s,])/gi, 'S.c.r.l.'],
    [/(^|[\s,])s\.?\s?r\.?\s?l\.?\s?s\.?(?=$|[\s,])/gi, 'S.r.l.s.'],
    [/(^|[\s,])s\.?\s?r\.?\s?l\.?(?=$|[\s,])/gi, 'S.r.l.'],
    [/(^|[\s,])s\.?\s?p\.?\s?a\.?(?=$|[\s,])/gi, 'S.p.A.'],
    [/(^|[\s,])s\.?\s?a\.?\s?s\.?(?=$|[\s,])/gi, 'S.a.s.'],
    [/(^|[\s,])s\.?\s?n\.?\s?c\.?(?=$|[\s,])/gi, 'S.n.c.']
];
const PICCOLE = ['di', 'e', 'ed', 'del', 'della', 'delle', 'dei', 'degli', 'dello', 'da', 'in', 'per', 'con', 'a', 'al', 'alla', 'and', 'of', '&'];
function maiuscoleAPosto(t) {
    return t.toLowerCase().replace(/(^|[\s'’\-./(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}
function formaNome(s) {
    const t = String(s || '').trim().replace(/\s+/g, ' ');
    if (!t || (t !== t.toUpperCase() && t !== t.toLowerCase())) return t;
    return maiuscoleAPosto(t);
}
function formaAzienda(s) {
    let t = String(s || '').trim().replace(/\s+/g, ' ');
    if (!t) return '';
    if (t === t.toUpperCase() || t === t.toLowerCase()) {
        t = maiuscoleAPosto(t).split(' ').map((w, i) => (i && PICCOLE.indexOf(w.toLowerCase()) >= 0) ? w.toLowerCase() : w).join(' ');
    }
    FORME.forEach(f => { t = t.replace(f[0], (m, a) => a + f[1]); });
    // "Alfa S.r.l" e "Alfa, S.r.l.": la virgola prima della forma societaria non serve
    return t.replace(/\s*,\s*(S\.(?:r\.l\.s?|p\.A|a\.s|n\.c|c\.a r\.l|c\.r\.l)\.?)$/, ' $1').replace(/\s+/g, ' ').trim();
}
/* {{AZIENDA}} nell'oggetto: il nome dell'azienda di chi riceve. Se
   l'azienda non c'e', sparisce con il suo separatore (" - ", ": ", ", "). */
function conAzienda(s, azienda) {
    const a = formaAzienda(azienda);
    const x = String(s || '');
    if (a) return x.split('{{AZIENDA}}').join(a);
    return x.replace(/\s*[-–|:,]\s*\{\{AZIENDA\}\}/g, '').replace(/\{\{AZIENDA\}\}\s*[-–|:,]?\s*/g, '').trim();
}

module.exports = { frasi, applica, giorniTra, giornoEsteso, dataEstesa, formaNome, formaAzienda, conAzienda };
