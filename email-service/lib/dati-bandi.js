/* ============================================================
   I bandi del sito, letti senza eseguirli
   ------------------------------------------------------------
   L'elenco dei bandi vive nel sito, in bandi/dati.js: un file
   JavaScript scritto a mano, con i commenti per chi lo aggiorna.
   La newsletter dei bandi (lib/newsletter-bandi.js) deve sapere
   quali bandi ci sono per accorgersi di quelli nuovi, e lo legge
   dalla pagina pubblicata, cioe' dalla rete.

   PERCHE' NON SI ESEGUE. Il modo piu' corto sarebbe far girare il
   file in una sandbox (vm) e prenderne il risultato. Ma vm non e'
   una barriera: un file che ne esce trova l'account di servizio di
   Firebase e le chiavi della posta. Un servizio che legge dalla
   rete non deve eseguire quello che legge. Qui invece si LEGGONO i
   valori scritti nel file - testi, numeri, true/false/null,
   elenchi e schede - come si legge un JSON un po' piu' largo
   (apici singoli, nomi dei campi senza virgolette, commenti,
   virgola in fondo). Qualunque altra cosa (un nome, un calcolo,
   una funzione) ferma la lettura con un errore che dice la riga.

   Per questo in testa a bandi/dati.js c'e' scritto di usare solo
   valori scritti. E il controllo scripts/bandi/controlla-dati.cjs
   (lanciato da GitHub a ogni modifica del file) confronta questa
   lettura con quella del browser: se un giorno le due non
   coincidono, se ne accorge chi ha toccato il file, non gli
   iscritti alla newsletter.

   Nessuna dipendenza: lo usa anche lo script di controllo, che
   gira su GitHub senza installare niente.
   ============================================================ */

'use strict';

const PROFONDITA_MASSIMA = 24;
const RE_NUMERO = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const RE_NOME = /[A-Za-z_$][\w$]*/y;
// nomi di campo che toccherebbero il prototipo degli oggetti: non servono a nessuna scheda
const NOMI_VIETATI = new Set(['__proto__', 'constructor', 'prototype']);

function rigaDi(src, i) {
    return src.slice(0, i).split('\n').length;
}

/* Legge UN valore a partire dalla posizione `pos` e restituisce
   { valore, fine }, con `fine` la posizione subito dopo il valore. */
function leggiValore(src, pos) {
    let i = pos;
    let profondita = 0;
    const errore = (msg) => { throw new Error(msg + ' (riga ' + rigaDi(src, i) + ')'); };

    function spazi() {
        for (;;) {
            const c = src[i];
            if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '﻿' || c === ' ' || c === ' ' || c === ' ') { i++; continue; }
            if (c === '/' && src[i + 1] === '/') {
                const f = src.indexOf('\n', i);
                i = f < 0 ? src.length : f + 1;
                continue;
            }
            if (c === '/' && src[i + 1] === '*') {
                const f = src.indexOf('*/', i + 2);
                if (f < 0) errore('commento non chiuso');
                i = f + 2;
                continue;
            }
            return;
        }
    }

    function testo() {
        const apice = src[i++];
        let out = '';
        for (;;) {
            if (i >= src.length) errore('testo non chiuso');
            const c = src[i++];
            if (c === apice) return out;
            if (c === '\n' || c === '\r') errore('a capo dentro un testo');
            if (c !== '\\') { out += c; continue; }
            const e = src[i++];
            if (e === undefined) errore('testo non chiuso');
            switch (e) {
                case 'n': out += '\n'; break;
                case 't': out += '\t'; break;
                case 'r': out += '\r'; break;
                case 'b': out += '\b'; break;
                case 'f': out += '\f'; break;
                case 'v': out += '\v'; break;
                case '0': out += '\0'; break;
                case 'x': {
                    const h = src.substr(i, 2);
                    if (!/^[0-9a-fA-F]{2}$/.test(h)) errore('sequenza \\x non valida');
                    out += String.fromCharCode(parseInt(h, 16));
                    i += 2;
                    break;
                }
                case 'u': {
                    if (src[i] === '{') {
                        const f = src.indexOf('}', i);
                        const h = f < 0 ? '' : src.slice(i + 1, f);
                        if (!/^[0-9a-fA-F]{1,6}$/.test(h) || parseInt(h, 16) > 0x10FFFF) errore('sequenza \\u{} non valida');
                        out += String.fromCodePoint(parseInt(h, 16));
                        i = f + 1;
                    } else {
                        const h = src.substr(i, 4);
                        if (!/^[0-9a-fA-F]{4}$/.test(h)) errore('sequenza \\u non valida');
                        out += String.fromCharCode(parseInt(h, 16));
                        i += 4;
                    }
                    break;
                }
                // la barra in fondo alla riga continua il testo sulla riga dopo
                case '\r': if (src[i] === '\n') i++; break;
                case '\n': break;
                // \' \" \\ e gli altri valgono se stessi, come in JavaScript
                default: out += e;
            }
        }
    }

    function nome() {
        RE_NOME.lastIndex = i;
        const m = RE_NOME.exec(src);
        return m ? m[0] : '';
    }

    function chiave() {
        spazi();
        const c = src[i];
        let k;
        if (c === '\'' || c === '"') k = testo();
        else {
            k = nome();
            if (!k) errore('nome di campo non valido');
            i += k.length;
        }
        if (NOMI_VIETATI.has(k)) errore('nome di campo non ammesso: «' + k + '»');
        return k;
    }

    function oggetto() {
        i++;
        const o = {};
        spazi();
        if (src[i] === '}') { i++; return o; }
        for (;;) {
            const k = chiave();
            spazi();
            if (src[i] !== ':') errore('manca «:» dopo «' + k + '»');
            i++;
            o[k] = valore();
            spazi();
            if (src[i] === ',') {
                i++;
                spazi();
                if (src[i] === '}') { i++; return o; }
                continue;
            }
            if (src[i] === '}') { i++; return o; }
            errore('atteso «,» o «}»');
        }
    }

    function elenco() {
        i++;
        const a = [];
        spazi();
        if (src[i] === ']') { i++; return a; }
        for (;;) {
            a.push(valore());
            spazi();
            if (src[i] === ',') {
                i++;
                spazi();
                if (src[i] === ']') { i++; return a; }
                continue;
            }
            if (src[i] === ']') { i++; return a; }
            errore('atteso «,» o «]»');
        }
    }

    function valore() {
        spazi();
        if (i >= src.length) errore('il file finisce prima del valore');
        const c = src[i];
        if (c === '{' || c === '[') {
            if (++profondita > PROFONDITA_MASSIMA) errore('troppi livelli annidati');
            const v = c === '{' ? oggetto() : elenco();
            profondita--;
            return v;
        }
        if (c === '\'' || c === '"') return testo();
        if (c === '-' || (c >= '0' && c <= '9')) {
            RE_NUMERO.lastIndex = i;
            const m = RE_NUMERO.exec(src);
            if (!m) errore('numero non valido');
            i += m[0].length;
            return Number(m[0]);
        }
        const n = nome();
        if (n === 'true') { i += 4; return true; }
        if (n === 'false') { i += 5; return false; }
        if (n === 'null') { i += 4; return null; }
        errore(n
            ? 'valore non ammesso «' + n + '»: in questo file vanno solo valori scritti (testi, numeri, true/false, elenchi), non nomi o calcoli'
            : 'valore non riconosciuto');
    }

    const v = valore();
    return { valore: v, fine: i };
}

/* Dove comincia il valore di `var|let|const <nome> =`, cercando nel codice
   e non dentro commenti o testi: in testa a dati.js le istruzioni nominano
   BANDI, e una ricerca alla buona si fermerebbe li'. -1 se non c'e'. */
function inizioDichiarazione(src, nomeCercato) {
    const re = new RegExp('(?:var|let|const)\\s+' + nomeCercato + '\\s*=\\s*', 'y');
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') { const f = src.indexOf('\n', i); i = f < 0 ? src.length : f + 1; continue; }
        if (c === '/' && src[i + 1] === '*') { const f = src.indexOf('*/', i + 2); i = f < 0 ? src.length : f + 2; continue; }
        if (c === '\'' || c === '"' || c === '`') {
            i++;
            while (i < src.length && src[i] !== c) i += (src[i] === '\\') ? 2 : 1;
            i++;
            continue;
        }
        // solo all'inizio di una parola: "xvar BANDI" non conta
        if ((c === 'v' || c === 'l' || c === 'c') && !/[\w$]/.test(src[i - 1] || '')) {
            re.lastIndex = i;
            const m = re.exec(src);
            if (m) return i + m[0].length;
        }
        i++;
    }
    return -1;
}

function leggiDichiarazione(src, nomeCercato) {
    const inizio = inizioDichiarazione(src, nomeCercato);
    if (inizio < 0) return undefined;
    return leggiValore(src, inizio).valore;
}

/* --- dalla lettura grezza alle schede che servono alla newsletter --- */
const RE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function testoBreve(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 400);
}
function data(v) {
    const s = String(v == null ? '' : v).trim();
    return RE_DATA.test(s) ? s : '';
}
function chiavi(v) {
    return (Array.isArray(v) ? v : []).map(x => testoBreve(x, 60)).filter(Boolean);
}

/* Le schede, una per bando, con i soli campi che servono fuori dalla
   pagina. Una scheda senza identificativo valido o senza titolo resta
   fuori, e cosi' un identificativo ripetuto: finiscono in `avvisi`. */
function normalizza(grezzi) {
    const bandi = [];
    const avvisi = [];
    const visti = new Set();
    (Array.isArray(grezzi) ? grezzi : []).forEach((b, n) => {
        if (!b || typeof b !== 'object' || Array.isArray(b)) { avvisi.push('voce ' + (n + 1) + ': non e\' una scheda'); return; }
        const id = testoBreve(b.id, 80);
        if (!RE_ID.test(id)) { avvisi.push('voce ' + (n + 1) + ': identificativo non valido «' + id + '»'); return; }
        if (visti.has(id)) { avvisi.push(id + ': identificativo ripetuto'); return; }
        const titolo = testoBreve(b.titolo, 200);
        if (!titolo) { avvisi.push(id + ': manca il titolo'); return; }
        visti.add(id);
        bandi.push({
            id: id,
            titolo: titolo,
            ente: testoBreve(b.ente, 200),
            regione: testoBreve(b.regione, 60) || 'Nazionale',
            tipologie: chiavi(b.tipologie),
            finalita: chiavi(b.finalita),
            beneficiari: testoBreve(b.beneficiari, 300),
            importo: testoBreve(b.importo, 300),
            sintesi: testoBreve(b.sintesi, 600),
            apertura: data(b.apertura),
            chiusura: data(b.chiusura),
            scadenza: testoBreve(b.scadenza, 300),
            procedura: testoBreve(b.procedura, 40),
            revisore: b.revisore === true ? true : (typeof b.revisore === 'string' && b.revisore.trim() ? testoBreve(b.revisore, 300) : false),
            pdf: testoBreve(b.pdf, 120),
            aggiornata: data(b.aggiornata)
        });
    });
    return { bandi: bandi, avvisi: avvisi };
}

/* Il file intero: le schede e le etichette di tipologie e finalita'.
   Lancia un errore se BANDI non si legge: senza l'elenco non c'e' niente da
   confrontare, e un elenco vuoto per sbaglio farebbe sembrare "nuovi" tutti
   i bandi alla lettura successiva. */
function leggiFile(src) {
    const grezzi = leggiDichiarazione(String(src || ''), 'BANDI');
    if (!Array.isArray(grezzi)) throw new Error('nel file non c\'e\' l\'elenco dei bandi (var BANDI = [...])');
    const tip = leggiDichiarazione(src, 'TIPOLOGIE');
    const fin = leggiDichiarazione(src, 'FINALITA');
    const n = normalizza(grezzi);
    return {
        bandi: n.bandi,
        avvisi: n.avvisi,
        tipologie: (tip && typeof tip === 'object' && !Array.isArray(tip)) ? tip : {},
        finalita: (fin && typeof fin === 'object' && !Array.isArray(fin)) ? fin : {},
        grezzi: grezzi
    };
}

/* Lo stato di un bando a una data ('AAAA-MM-GG'), con le regole della
   pagina (bandi/bandi.js, statoDi): chiuso dopo la chiusura, in apertura
   prima dell'apertura, altrimenti aperto. */
function statoAl(b, oggi) {
    if (b.chiusura && b.chiusura < oggi) return 'chiuso';
    if (b.apertura && b.apertura > oggi) return 'in-apertura';
    return 'aperto';
}

module.exports = { leggiValore, leggiDichiarazione, inizioDichiarazione, normalizza, leggiFile, statoAl, RE_ID };
