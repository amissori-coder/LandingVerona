/* ============================================================
   PROVE - area-riservata/app.js, il riquadro "Moduli riservati"
   ------------------------------------------------------------
       node prove/moduli-riservati.prove.js

   Niente da installare: le funzioni si ritagliano dal sorgente
   VERO di app.js, come nelle altre prove dell'area riservata.

   COSA DIMOSTRANO. Le pagine di iscrizione che sul sito non si
   vedono (aderenti, sponsor e relatori di Milano 2027) hanno un
   posto nel cruscotto dell'evento, con "Apri" e "Copia":
     - l'evento di Milano le elenca tutte e due, e gli indirizzi
       sono pagine che esistono, riservate (noindex);
     - l'indirizzo degli aderenti e' lo stesso che usa il servizio;
     - il riquadro porta un collegamento e un "Copia" per modulo,
       verso il SITO anche se l'area riservata e' aperta altrove;
     - dove l'evento non ne ha, e nel riepilogo, il riquadro non c'e';
     - sta nel cruscotto, accanto alle iscrizioni, e il "Copia"
       e' collegato.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const RADICE = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(RADICE, 'area-riservata', 'app.js'), 'utf8');

function ritaglia(apertura, apre, chiude) {
    const inizio = APP.indexOf(apertura);
    if (inizio < 0) throw new Error('non trovato in app.js: ' + apertura);
    let i = APP.indexOf(apre, inizio), aperte = 0, fine = -1;
    for (; i < APP.length; i++) {
        if (APP[i] === apre) aperte++;
        else if (APP[i] === chiude) { aperte--; if (!aperte) { fine = i + 1; break; } }
    }
    if (fine < 0) throw new Error('chiusura non trovata per: ' + apertura);
    return APP.slice(inizio, fine);
}
const daAppJs = nome => eval('(' + ritaglia('function ' + nome + '(', '{', '}') + ')');

/* Quello che le funzioni trovano intorno a se' nell'app: l'escape e
   l'indirizzo della pagina. `location` cambia da scenario a scenario. */
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
let location = { hostname: 'localhost', origin: 'http://localhost:8080' };
const gruppoEv = daAppJs('gruppoEv');
const indirizzoSulSito = daAppJs('indirizzoSulSito');
const moduliRiservatiHtml = daAppJs('moduliRiservatiHtml');
const EVENTI_DEF = eval('(' + ritaglia('const EVENTI_DEF = [', '[', ']').slice('const EVENTI_DEF = '.length) + ')');
const MILANO = EVENTI_DEF.find(e => e.id === 'milano-2027-02-26');

let ok = 0, ko = 0;
function esigi(cond, cosa, extra) {
    if (cond) { ok++; console.log('  ok  ' + cosa); }
    else { ko++; console.log('  NO  ' + cosa + (extra !== undefined ? '\n      ' + String(extra).slice(0, 400) : '')); }
}
const prove = [];
function prova(titolo, fn) { prove.push({ titolo: titolo, fn: fn }); }

prova('Milano elenca i due moduli riservati, e sono pagine vere e riservate', () => {
    const m = (MILANO && MILANO.moduliRiservati) || [];
    esigi(m.map(x => x.via).join('|') === '/milano_febbraio_2027/aderenti/|/milano_febbraio_2027/sponsor_relatori/',
        'aderenti e sponsor e relatori', JSON.stringify(m));
    esigi(m.map(x => x.nome).join('|') === 'Aderenti Revilaw|Sponsor e relatori', 'con i nomi delle loro sezioni');
    m.forEach(x => {
        const file = path.join(RADICE, x.via, 'index.html');
        const html = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        esigi(/<meta name="robots" content="noindex/.test(html) && /<form/.test(html), x.via + ' esiste, ha il modulo e non si indicizza');
    });
    const servizio = fs.readFileSync(path.join(RADICE, 'email-service', 'lib', 'iscrizioni-aderenti.js'), 'utf8');
    esigi(servizio.indexOf("pagina: '/milano_febbraio_2027/aderenti/'") >= 0, 'l\'indirizzo degli aderenti e\' quello del servizio');
    const altri = EVENTI_DEF.filter(e => e.id !== MILANO.id && e.moduliRiservati);
    esigi(!altri.length, 'gli altri eventi non ne dichiarano', altri.map(e => e.id).join(', '));
});

prova('Il riquadro: un modulo per riga, con "Apri" e "Copia" verso il sito', () => {
    location = { hostname: 'localhost', origin: 'http://localhost:8080' };
    const h = moduliRiservatiHtml(MILANO);
    esigi(/<section class="ev-bl" id="ev-moduli-blocco">/.test(h) && /Moduli riservati/.test(h), 'e\' un riquadro del cruscotto', h);
    esigi((h.match(/class="ev-modulo"/g) || []).length === 2, 'due righe');
    ['/milano_febbraio_2027/aderenti/', '/milano_febbraio_2027/sponsor_relatori/'].forEach(via => {
        const url = 'https://nextgenerationbusiness.it' + via;
        esigi(h.indexOf('href="' + url + '" target="_blank" rel="noopener"') >= 0, 'apre ' + via + ' sul sito, in un\'altra scheda');
        esigi(h.indexOf('data-copia="' + url + '"') >= 0, 'e copia lo stesso indirizzo');
    });
    esigi(/Aderenti Revilaw<span>cena del 26 e meeting del 27<\/span>/.test(h) && /Sponsor e relatori<span>/.test(h), 'con il nome e a cosa serve');
    location = { hostname: 'www.nextgenerationbusiness.it', origin: 'https://www.nextgenerationbusiness.it' };
    esigi(moduliRiservatiHtml(MILANO).indexOf('href="https://www.nextgenerationbusiness.it/milano_febbraio_2027/aderenti/"') >= 0,
        'dal sito stesso, l\'indirizzo e\' quello da cui si e\' entrati');
});

prova('Dove non ci sono moduli riservati il riquadro non c\'e\'', () => {
    esigi(moduliRiservatiHtml(EVENTI_DEF.find(e => e.id === 'napoli-2026-10-02')) === '', 'un evento senza');
    esigi(moduliRiservatiHtml(EVENTI_DEF.find(e => e.tutti)) === '', 'il riepilogo');
    esigi(moduliRiservatiHtml(Object.assign({}, MILANO, { tutti: true })) === '', 'mai nel riepilogo');
    esigi(moduliRiservatiHtml(null) === '', 'nessun evento');
});

prova('Sta nel cruscotto accanto alle iscrizioni, e "Copia" e\' collegato', () => {
    const vista = ritaglia('function vistaEventi(', '{', '}');
    esigi(/gruppoEv\(\{ titolo: 'Iscrizioni'[^\n]*\n\s*\+ moduliRiservatiHtml\(ev\)\n/.test(vista), 'subito dopo il riquadro delle iscrizioni');
    esigi(/collegaModuliRiservati\(\);/.test(vista), 'il disegno collega i pulsanti');
    const collega = ritaglia('function collegaModuliRiservati(', '{', '}');
    esigi(/#ev-moduli-blocco \[data-copia\]/.test(collega) && /copiaNegliAppunti\(b\.dataset\.copia/.test(collega), '"Copia" mette negli appunti il collegamento');
    const CSS = fs.readFileSync(path.join(RADICE, 'area-riservata', 'styles.css'), 'utf8');
    esigi(/\.ev-modulo \{/.test(CSS) && /\.ev-modulo-az \{/.test(CSS), 'con la sua veste');
});

console.log('\nIl riquadro "Moduli riservati"\n');
for (const p of prove) { console.log('\n' + p.titolo); p.fn(); }
console.log('\n' + ok + ' verdi, ' + ko + ' rossi');
process.exit(ko ? 1 : 0);
