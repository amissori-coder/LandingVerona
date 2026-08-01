/* ============================================================
   Verifiche: il sito risponde, le API rispondono, il DNS e' quello giusto
   ------------------------------------------------------------
   Un backup che nessuno controlla e' una speranza, non una garanzia. Qui si
   verifica che quanto si sta salvando corrisponda a un impianto vivo, e si
   fotografano i record DNS: se il dominio va rifatto da zero, quelli servono
   e non stanno da nessun'altra parte.

   Sugli endpoint API 401 e 405 sono risposte CORRETTE: sono protetti da
   segreto o accettano solo POST. Contano come "attivo".
   ============================================================ */

const dns = require('dns').promises;

const CONTROLLI = [
    { nome: 'Sito (home)', url: 'https://nextgenerationbusiness.it/', attesi: [200] },
    { nome: 'Area riservata (sito)', url: 'https://nextgenerationbusiness.it/area-riservata/', attesi: [200] },
    { nome: 'API invia-email', url: 'https://revilaw-email.vercel.app/api/invia-email', attesi: [405, 401] },
    { nome: 'API invia-comunicazione', url: 'https://revilaw-email.vercel.app/api/invia-comunicazione', attesi: [405, 401] },
    { nome: 'API cron-comunicazioni', url: 'https://revilaw-email.vercel.app/api/cron-comunicazioni', attesi: [401, 405] },
    { nome: 'API newsletter', url: 'https://revilaw-email.vercel.app/api/newsletter', attesi: [405, 401, 400] }
];

async function controllaEndpoint(c) {
    const scadenza = AbortSignal.timeout(20000);
    try {
        const r = await fetch(c.url, { method: 'GET', redirect: 'follow', signal: scadenza });
        return { nome: c.nome, stato: r.status, attivo: c.attesi.includes(r.status) };
    } catch (e) {
        return { nome: c.nome, stato: null, attivo: false, errore: String(e.message || e) };
    }
}

async function controllaEndpoints() {
    const esiti = [];
    for (const c of CONTROLLI) esiti.push(await controllaEndpoint(c));
    return esiti;
}

/* --- DNS ---
   Si interroga una matrice di nomi e tipi e si annota tutto quello che
   risponde. I selettori DKIM sono quelli usati da Brevo e da Aruba: se un
   nome non esiste semplicemente non compare. */
const DOMINIO = 'nextgenerationbusiness.it';
const NOMI_DNS = [
    { etichetta: '@', sotto: '', tipi: ['A', 'AAAA', 'MX', 'TXT', 'NS', 'SOA'] },
    { etichetta: 'www', sotto: 'www', tipi: ['CNAME', 'A', 'AAAA', 'TXT'] },
    { etichetta: 'ftp', sotto: 'ftp', tipi: ['CNAME', 'A'] },
    { etichetta: 'mail', sotto: 'mail', tipi: ['CNAME', 'A'] },
    { etichetta: 'mx', sotto: 'mx', tipi: ['CNAME', 'A'] },
    { etichetta: 'autodiscover', sotto: 'autodiscover', tipi: ['CNAME', 'A'] },
    { etichetta: '_dmarc', sotto: '_dmarc', tipi: ['TXT'] },
    // selettori DKIM piu' comuni fra Brevo e Aruba: quelli inesistenti non compaiono
    ...['mail', 'default', 'brevo', 'brevo1', 'brevo2', 's1', 's2', 'k1', 'dkim']
        .map(s => ({ etichetta: s + '._domainkey', sotto: s + '._domainkey', tipi: ['TXT'] }))
];

function appiattisci(tipo, valori) {
    if (!Array.isArray(valori)) return [String(valori)];
    if (tipo === 'MX') return valori.map(v => v.priority + ' ' + v.exchange);
    if (tipo === 'TXT') return valori.map(v => (Array.isArray(v) ? v.join('') : String(v)));
    if (tipo === 'SOA') return valori.map(v => (v && v.nsname) ? (v.nsname + ' ' + v.hostmaster) : String(v));
    return valori.map(v => String(v));
}

async function leggiDns() {
    const righe = [];
    for (const gruppo of NOMI_DNS) {
        const nome = gruppo.sotto ? gruppo.sotto + '.' + DOMINIO : DOMINIO;
        // Se il nome e' un alias, gli A/AAAA che si vedono sono quelli della
        // destinazione, non record di questa zona: annotarli sarebbe falso.
        let alias = false;
        for (const tipo of gruppo.tipi) {
            if (alias && (tipo === 'A' || tipo === 'AAAA')) continue;
            let valori;
            try {
                valori = tipo === 'SOA' ? [await dns.resolveSoa(nome)] : await dns.resolve(nome, tipo);
            } catch (_) { continue; }   // nome o tipo inesistente: normale
            if (tipo === 'CNAME' && valori.length) alias = true;
            for (const v of appiattisci(tipo, valori)) {
                righe.push({ nome: gruppo.etichetta, tipo, valore: v });
            }
        }
    }
    return { righe, quanti: righe.length };
}

function formattaDns(righe) {
    const larghezzaNome = Math.max(4, ...righe.map(r => r.nome.length));
    const testo = [
        'RECORD DNS DI nextgenerationbusiness.it',
        'Fotografia del ' + new Date().toISOString(),
        '='.repeat(62),
        '',
        ...righe.map(r => r.nome.padEnd(larghezzaNome) + '  ' + r.tipo.padEnd(6) + '  ' + r.valore),
        '',
        'Per GitHub Pages servono i 4 record A del dominio nudo',
        '(185.199.108.153 / .109.153 / .110.153 / .111.153) e un CNAME per www.',
        'ATTENZIONE ai TXT: contengono SPF e il codice di verifica Brevo.',
        'Senza quelli le email partono ma finiscono nello spam.',
        ''
    ].join('\n');
    return testo;
}

module.exports = { controllaEndpoints, leggiDns, formattaDns };
