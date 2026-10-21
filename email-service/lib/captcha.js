/* ============================================================
   CAPTCHA del modulo pubblico (Cloudflare Turnstile)
   ------------------------------------------------------------
   Prima che parta un SMS di verifica il modulo chiede la casella
   "non sono un robot" di Turnstile: gli SMS costano, e un programma
   che chiede codici a raffica e' il modo piu' rapido per svuotare i
   crediti. Il browser riceve un gettone, lo manda con la richiesta,
   e qui si chiede a Cloudflare se e' buono. Il gettone vale una volta
   e per pochi minuti: il modulo ne chiede uno nuovo a ogni SMS.

   Turnstile e' gratuito e quasi sempre non chiede nulla alla persona
   (al massimo una spunta). La chiave pubblica sta nella pagina
   (milano_febbraio_2027/script.js, TURNSTILE_CHIAVE), quella segreta
   qui, nella variabile TURNSTILE_SECRET.

   SENZA TURNSTILE_SECRET il controllo e' SPENTO e tutto passa: cosi'
   il modulo funziona anche prima che le chiavi siano create. Una volta
   impostata, invece, il controllo e' chiuso: senza gettone buono, o se
   Cloudflare non risponde, l'SMS non parte.

   LA STESSA CHIAVE SERVE ANCHE IL MODULO DELLE DOMANDE (/contatti/),
   con un'AZIONE sua ('domanda-sito'): Cloudflare la rimanda nella
   risposta, e chi la passa in `opz.azione` rifiuta un gettone nato
   per un altro modulo. Un gettone vale una volta sola comunque; cosi'
   pero' quello preparato per l'SMS di Milano non apre la porta delle
   domande, e viceversa. Senza `opz.azione` (l'SMS, com'era) l'azione
   non si guarda.
   ============================================================ */

const VERIFICA_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function attivo() { return !!String(process.env.TURNSTILE_SECRET || '').trim(); }

async function verifica(gettone, ip, opz) {
    if (!attivo()) return { ok: true, spento: true };
    const g = String(gettone || '').trim().slice(0, 2048);
    if (!g) return { ok: false, motivo: 'mancante' };
    const corpo = new URLSearchParams({ secret: String(process.env.TURNSTILE_SECRET).trim(), response: g });
    if (ip) corpo.set('remoteip', String(ip));
    try {
        const r = await fetch(VERIFICA_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: corpo.toString(),
            signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(8000) : undefined
        });
        const d = await r.json().catch(() => ({}));
        /* un'azione diversa da quella attesa: gettone buono, ma di un altro
           modulo. Un'azione vuota passa (widget senza azione: non c'e' niente
           da confrontare). */
        const azione = String((opz && opz.azione) || '');
        if (d && d.success === true && azione && d.action && String(d.action) !== azione) {
            return { ok: false, motivo: 'rifiutato', codici: ['azione-diversa'] };
        }
        if (d && d.success === true) return { ok: true };
        return { ok: false, motivo: 'rifiutato', codici: (d && d['error-codes']) || [] };
    } catch (e) {
        console.error('Turnstile non raggiungibile:', String((e && e.message) || e).slice(0, 200));
        return { ok: false, motivo: 'servizio' };
    }
}

module.exports = { attivo, verifica };
