/* ============================================================
   Gli orari dei tavoli B2B, letti dalla frase
   ------------------------------------------------------------
   L'orario di un tavolo viaggia come frase - "dalle 14:30 alle
   15:15" - perche' e' cosi' che va scritto nella mail, sulla
   pagina e sul foglio del desk. Per ORDINARE gli incontri, pero',
   la frase non basta: serve l'ora come numero. Qui si ricava.

   Si riconosce SOLO la forma che le caselle compongono ("dalle
   14:30 alle 15:15"). Gli orari scritti a mano prima che l'area
   riservata avesse le caselle ("nel primo pomeriggio", "sala 2.30,
   dalle 14:00") non si interpretano: si stampano com'e' stato
   scritto e vanno in coda. E' l'unico modo per non annunciare un
   orario che nessuno ha mai comunicato.
   ============================================================ */

/* La forma che le caselle dell'ora compongono, e l'unica di cui ci si puo'
   fidare. Pescare due ore da una frase qualunque sembra generoso e invece
   inventa: da "sala 2.30, dalle 14:00 alle 15:00" verrebbero fuori le 02:30
   come inizio - il numero della sala - e il foglio del desk direbbe all'ospite
   un orario che nessuno gli ha mai comunicato, per giunta mettendogli
   quell'incontro per primo. Meglio dire "non lo so": una frase che non ha
   questa forma si stampa cosi' com'e', e in coda. */
const FRASE_CANONICA = /^dalle ([01]\d|2[0-3]):[0-5]\d alle ([01]\d|2[0-3]):[0-5]\d$/;
function oreDaFrase(frase) {
    const t = String(frase || '').trim();
    if (!FRASE_CANONICA.test(t)) return { inizio: '', fine: '' };
    const ore = t.match(/([01]\d|2[0-3]):[0-5]\d/g);
    return { inizio: ore[0], fine: ore[1] };
}

function minutiOra(v) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''))) return -1;
    const p = String(v).split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

/* L'inizio di un tavolo in minuti, per ordinare. Chi non ha un'ora
   riconoscibile torna un numero grande: in fondo all'elenco, non in cima. */
function inizioDi(tavolo) {
    const t = tavolo || {};
    const m = minutiOra(oreDaFrase(t.orario).inizio);
    return m < 0 ? 99999 : m;
}

/* I tavoli in ORDINE DI ORARIO. E' l'ordine in cui la giornata succede:
   un foglio da presentare al desk che li elenca in un altro ordine
   costringe chi lo legge a rimetterli in fila da se'. A parita' di ora
   (due tavoli in parallelo) resta l'ordine di arrivo. */
function ordinaPerOrario(tavoli) {
    return (tavoli || []).map((t, i) => ({ t: t, i: i }))
        .sort((a, b) => (inizioDi(a.t) - inizioDi(b.t)) || (a.i - b.i))
        .map(x => x.t);
}

/* Un tavolo normalizzato a { nome, orario }: si accettano anche le stringhe,
   per non rompersi se un chiamante vecchio resta in giro. */
function normalizzaTavoli(tavoli) {
    return (tavoli || []).filter(Boolean)
        .map(t => (typeof t === 'string'
            ? { nome: t, orario: '' }
            : { nome: String(t.nome || ''), orario: String(t.orario || '') }))
        .filter(t => t.nome);
}

module.exports = { oreDaFrase, minutiOra, inizioDi, ordinaPerOrario, normalizzaTavoli };
