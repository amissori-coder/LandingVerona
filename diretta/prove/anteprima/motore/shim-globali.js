/* ============================================================
   ANTEPRIMA - Buffer, process e i timer per il codice del servizio nel browser
   ------------------------------------------------------------
   esbuild li "inietta": dove il codice di email-service/ scrive
   Buffer, process, setTimeout o clearTimeout senza dichiararli, usa
   questi. Solo quello che il servizio della diretta adopera davvero:
   base64, base64url, hex e utf8; process.env con le variabili
   dell'anteprima; i timer con unref() (la prova del link lo usa), che
   nel browser non c'e'.
   ============================================================ */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function inBase64(byte) {
    let s = '';
    for (let i = 0; i < byte.length; i += 3) {
        const a = byte[i], b = byte[i + 1], c = byte[i + 2];
        const n = (a << 16) | ((b || 0) << 8) | (c || 0);
        s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (b === undefined ? '=' : B64[(n >> 6) & 63]) + (c === undefined ? '=' : B64[n & 63]);
    }
    return s;
}
function daBase64(s) {
    const pulita = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
    const out = [];
    let buf = 0, bit = 0;
    for (const ch of pulita) {
        buf = (buf << 6) | B64.indexOf(ch);
        bit += 6;
        if (bit >= 8) { bit -= 8; out.push((buf >> bit) & 255); }
    }
    return out;
}

export class Buffer extends Uint8Array {
    static from(dati, codifica) {
        if (typeof dati === 'string') {
            const c = String(codifica || 'utf8').toLowerCase();
            if (c === 'base64' || c === 'base64url') return new Buffer(daBase64(dati));
            if (c === 'hex') {
                const out = [];
                for (let i = 0; i + 1 < dati.length; i += 2) out.push(parseInt(dati.slice(i, i + 2), 16));
                return new Buffer(out);
            }
            return new Buffer(new TextEncoder().encode(dati));
        }
        if (dati instanceof ArrayBuffer) return new Buffer(new Uint8Array(dati));
        return new Buffer(Array.from(dati || []));
    }
    static isBuffer(x) { return x instanceof Buffer; }
    static alloc(n) { return new Buffer(Math.max(0, Number(n) || 0)); }
    static concat(elenco) {
        const tot = elenco.reduce((n, b) => n + b.length, 0);
        const out = new Buffer(tot);
        let i = 0;
        elenco.forEach(b => { out.set(b, i); i += b.length; });
        return out;
    }
    static byteLength(s) { return new TextEncoder().encode(String(s)).length; }
    toString(codifica) {
        const c = String(codifica || 'utf8').toLowerCase();
        if (c === 'hex') return Array.prototype.map.call(this, b => ('0' + b.toString(16)).slice(-2)).join('');
        if (c === 'base64') return inBase64(this);
        if (c === 'base64url') return inBase64(this).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return new TextDecoder().decode(this);
    }
    equals(altro) {
        if (!altro || altro.length !== this.length) return false;
        for (let i = 0; i < this.length; i++) if (this[i] !== altro[i]) return false;
        return true;
    }
}

export const process = {
    env: {},
    platform: 'browser',
    version: 'v22.0.0',
    versions: { node: '22.0.0' },
    cwd: () => '/',
    nextTick: (f, ...a) => queueMicrotask(() => f(...a)),
    emitWarning: () => {},
    hrtime: Object.assign(() => [0, 0], { bigint: () => BigInt(Math.round(performance.now() * 1e6)) })
};


/* I timer di Node: setTimeout restituisce un oggetto con unref()/ref();
   clearTimeout accetta sia quello sia il numero del browser. */
const timerBrowser = globalThis.setTimeout.bind(globalThis);
const fermaBrowser = globalThis.clearTimeout.bind(globalThis);
export function setTimeout(fn, ms, ...argomenti) {
    const id = timerBrowser(fn, ms, ...argomenti);
    return {
        id: id,
        unref() { return this; },
        ref() { return this; },
        hasRef() { return true; },
        [Symbol.toPrimitive]() { return id; }
    };
}
export function clearTimeout(t) { fermaBrowser(t && typeof t === 'object' ? t.id : t); }
