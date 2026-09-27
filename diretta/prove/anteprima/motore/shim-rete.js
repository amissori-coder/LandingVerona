/* ANTEPRIMA - net, dns, https, zlib e stream di Node, quanto basta a
   email-service/lib/diretta-prova-link.js. Nell'anteprima la prova del
   link non esce in rete: la web TV e' quella finta (webtv-finta.js),
   passata a provaLink() come `fetch` e `lookup` (vedi prova-link.js).
   Il trasporto vero (https.request) qui non esiste. */
'use strict';
function isIP(s) {
    s = String(s || '');
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s) && s.split('.').every(n => Number(n) <= 255)) return 4;
    if (s.indexOf(':') >= 0 && /^[0-9a-f:.]+$/i.test(s)) return 6;
    return 0;
}
function assente() { throw new Error('rete non disponibile nell\'anteprima'); }
function lookup(host, opzioni, cb) {
    const fatto = typeof opzioni === 'function' ? opzioni : cb;
    const e = new Error('ENOTFOUND ' + host);
    e.code = 'ENOTFOUND';
    setTimeout(() => fatto(e), 0);
}
module.exports = {
    // net
    isIP: isIP, isIPv4: s => isIP(s) === 4, isIPv6: s => isIP(s) === 6,
    // dns
    lookup: lookup,
    promises: { lookup: host => Promise.reject(Object.assign(new Error('ENOTFOUND ' + host), { code: 'ENOTFOUND' })) },
    // https
    request: assente, get: assente, Agent: function Agent() {},
    // zlib
    createUnzip: assente, createGunzip: assente, createInflate: assente, createBrotliDecompress: assente,
    // stream
    Readable: { toWeb: assente, fromWeb: assente, from: assente }
};
