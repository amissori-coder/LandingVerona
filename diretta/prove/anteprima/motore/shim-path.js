/* ANTEPRIMA - path di Node, quanto basta a diretta-invio.js (percorsi con "/") */
'use strict';
const sep = '/';
function normalizza(p) {
    const parti = [];
    String(p).split('/').forEach(x => {
        if (!x || x === '.') return;
        if (x === '..') parti.pop(); else parti.push(x);
    });
    return '/' + parti.join('/');
}
function resolve(...pezzi) {
    let p = '';
    pezzi.forEach(x => { x = String(x); p = x.startsWith('/') ? x : p + '/' + x; });
    return normalizza(p || '/');
}
function join(...pezzi) { return normalizza(pezzi.join('/')); }
function dirname(p) { const n = normalizza(p); return n.slice(0, n.lastIndexOf('/')) || '/'; }
function basename(p) { const n = normalizza(p); return n.slice(n.lastIndexOf('/') + 1); }
module.exports = { sep, resolve, join, dirname, basename, posix: null };
module.exports.posix = module.exports;
