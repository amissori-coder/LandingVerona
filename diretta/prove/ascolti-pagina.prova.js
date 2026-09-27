/* ============================================================
   PROVE - la scheda ASCOLTI della gestione (/diretta/gestione/)
   ------------------------------------------------------------
       cd diretta/prove && node ascolti-pagina.prova.js

   Avvia da sola gli emulatori di Firebase (Firestore 8425, Auth
   9425) e server-locale.js (funzioni vere sulla 3420, sito sulla
   8420): porte sue, cosi' puo' girare insieme alle altre prove. Il
   gestore entra davvero (account con il claim «gestore» preparato con
   firebase-admin, come dopo «Primo accesso»), l'evento lo crea il
   servizio vero ('evento-salva') e tutte le altre chiamate della
   pagina vanno al servizio vero.

   UNICA RISPOSTA FINTA: l'azione 'ascolti'. La intercetta la prova
   (page.route) e risponde con un risultato costruito qui, conforme al
   §2 del contratto degli ascolti (lo stesso JSON che manda
   lib/diretta-ascolti.js): cosi' la pagina si prova con numeri noti,
   senza aspettare otto ore di fotografie. La fixture e' realistica e
   sempre uguale (generatore pseudo-casuale con il seme fisso): 380
   iscritti, una giornata di 8 ore (9.00-17.00) con la pausa pranzo
   (13.00-14.00), 13 voci di programma, prima e dopo la diretta, un
   problema tecnico alle 10.40 (quaranta persone escono e rientrano),
   due buchi del cron (2 minuti, ricuciti; 5 minuti, linea interrotta),
   persone con piu' periodi di collegamento, chi entra solo in pausa,
   chi non entra mai (con e senza credenziali), chi riapre con la
   sessione salvata (nessun accesso), dispositivi vari. Picco, minimo,
   media, cali, programma, ingressi e dispositivi li calcola la prova
   con le regole del §2, e la pagina deve mostrarli tali e quali.

   COSA CONTROLLA. Le tessere del riepilogo (numeri e orari); nel
   grafico il punto e la scritta del picco e del minimo esattamente
   dove dicono i dati (la scala e' scritta nell'SVG: data-da, data-a,
   data-sinistra...), la fascia della pausa con «Pausa», il prima e il
   dopo attenuati, le 13 linee del programma con il titolo intero, i
   tre cali, la linea interrotta sul buco di 5 minuti e ricucita su
   quello di 2; il riquadrino con le frecce della tastiera (Inizio,
   Fine, frecce, Pagina su) e al tocco; «Vedi i dati del grafico»; la
   tabella del programma con la voce piu' seguita; l'istogramma degli
   ingressi con la legenda; i dispositivi; le persone (ricerca, filtro,
   ordine, «Mostra altre 100», linea del tempo); i non collegati con
   «Copia gli indirizzi»; l'esportazione (i sei fogli, riletti con
   SheetJS in Node); la stampa (media print: solo la scheda Ascolti,
   senza pulsanti); l'aggiornamento ogni 60 secondi solo con la scheda
   aperta e la finestra visibile (orologio finto di Playwright); il
   caso registrazione.attiva=false; il telefono 390x844 senza
   scorrimento orizzontale della pagina; nessun errore in console.

   Screenshot in risultati/screenshot-ascolti/ (a pagina intera):
     ascolti-computer.png           1440x900, la scheda appena aperta
     ascolti-computer-dettagli.png  con una linea del tempo aperta e i
                                    dati del grafico
     ascolti-computer-linea-del-tempo.png   solo la riga di una persona
                                    con la sua linea del tempo
     ascolti-stampa.png             come si stampa (media print, A4
                                    orizzontale)
     ascolti-senza-dati-computer.png   registrazione non ancora attiva
     ascolti-telefono.png           390x844
   Esce con 1 se qualcosa e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORTE = { firestore: 8425, auth: 9425, api: 3420, statico: 8420 };
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + PORTE.auth;
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + PORTE.firestore;

const RADICE = path.resolve(__dirname, '../..');
const RISULTATI = path.join(__dirname, 'risultati');
const FOTO = path.join(RISULTATI, 'screenshot-ascolti');
fs.mkdirSync(FOTO, { recursive: true });

const admin = require(path.join(RADICE, 'email-service/node_modules/firebase-admin'));
const { chromium } = require('./node_modules/playwright');
const { preparaContesto } = require('./rete-prove');

const SITO = 'http://127.0.0.1:' + PORTE.statico;
const API = 'http://127.0.0.1:' + PORTE.api + '/api';
const AUTH_REST = 'http://127.0.0.1:' + PORTE.auth + '/identitytoolkit.googleapis.com/v1';
const EMAIL_GESTORE = 'gestore@prova.it';
const PASSWORD_GESTORE = 'Ascolti-2026-prova';
const ID = 'verona-2026';
const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

let rossi = 0, verdi = 0;
function vero(cond, descrizione, dettaglio) {
    if (cond) { verdi++; console.log('  ok  ' + descrizione); }
    else { rossi++; console.log('ROSSO ' + descrizione + (dettaglio !== undefined ? '\n       ' + String(dettaglio).slice(0, 800) : '')); }
    return !!cond;
}
const pausa = ms => new Promise(r => setTimeout(r, ms));
const vicino = (a, b, tolleranza) => Math.abs(Number(a) - Number(b)) <= (tolleranza == null ? 0.6 : tolleranza);

/* ============================================================
   LA FIXTURE: il risultato di 'ascolti' (§2 del contratto)
   ============================================================ */
const MIN = 60000;
// l'ora di Roma del 2 ottobre 2026 (ora legale: UTC+2)
const ora = (h, m) => Date.parse('2026-10-02T' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00+02:00');
const minutoDi = ms => Math.floor(ms / MIN);
// "9.05", come le scrive la pagina (oraLeggibile)
const oraIt = ms => {
    const d = new Date(ms + 2 * 3600000);
    return d.getUTCHours() + '.' + String(d.getUTCMinutes()).padStart(2, '0');
};
const oraXls = ms => {
    const d = new Date(ms + 2 * 3600000);
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
};
const arrotonda1 = x => Math.round(x * 10) / 10;
// l'ordine della tabella nella pagina (ordinePersone di gestione.js): cognome, nome, email
const ordinePagina = (a, b) => a.cognome.localeCompare(b.cognome, 'it', { sensitivity: 'base' }) || a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' })
    || a.email.localeCompare(b.email);

function generatore(seme) {
    let a = seme >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const PROGRAMMA = [
    ['09.00', 'Accoglienza e saluti istituzionali'],
    ['09.30', 'Apertura dei lavori'],
    ['10.00', 'Adeguati assetti organizzativi e governance'],
    ['10.45', 'Crisi d\'impresa: gli strumenti di allerta'],
    ['11.30', 'Tavola rotonda: banche e imprese'],
    ['12.15', 'Fiscalità internazionale e transfer pricing'],
    ['13.00', 'Pausa pranzo'],
    ['14.00', 'Intelligenza artificiale e professioni'],
    ['14.45', 'Passaggio generazionale nelle PMI'],
    ['15.30', 'Sostenibilità e rendicontazione ESG'],
    ['16.00', 'Domande dal pubblico'],
    ['16.30', 'Conclusioni'],
    ['16.50', 'Saluti finali']
];

function costruisciFixture() {
    const caso = generatore(20261002);
    const fra = (a, b) => a + Math.floor(caso() * (b - a + 1));
    const inizio = ora(9, 0), fine = ora(17, 0);
    // lo stato di ogni minuto della giornata (8.30-17.14) e i minuti che il cron ha saltato
    const statoMinuto = m => {
        const t = m * MIN;
        if (t < inizio) return 'a';
        if (t >= fine) return 't';
        if (t >= ora(13, 0) && t < ora(14, 0)) return 'p';
        return 'o';
    };
    const saltati = new Set([ora(10, 31), ora(10, 32), ora(15, 21), ora(15, 22), ora(15, 23), ora(15, 24), ora(15, 25)].map(minutoDi));
    const minuti = [];
    for (let m = minutoDi(ora(8, 30)); m <= minutoDi(ora(17, 14)); m++) if (!saltati.has(m)) minuti.push(m);
    const M = (h, mm) => minutoDi(ora(h, mm));

    const NOMI = ['Marco', 'Giulia', 'Luca', 'Francesca', 'Alessandro', 'Chiara', 'Andrea', 'Sara', 'Matteo', 'Elena', 'Davide', 'Valentina',
        'Stefano', 'Martina', 'Paolo', 'Federica', 'Simone', 'Laura', 'Giorgio', 'Silvia', 'Roberto', 'Anna', 'Nicola', 'Elisa', 'Fabio',
        'Marta', 'Riccardo', 'Paola', 'Emanuele', 'Ilaria', 'Nicolò', 'Noemi'];
    const COGNOMI = ['Rossi', 'Bianchi', 'Ferrari', 'Esposito', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti',
        'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi',
        'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone', 'Longo', 'Gentile', 'Martinelli', 'Vitale', 'Serra', 'Coppola', 'De Santis',
        'D\'Angelo', 'Marchetti', 'Parisi', 'Villa', 'Zanetti'];
    const AZIENDE = ['Studio Scaligero Associati', 'Adige Consulting S.r.l.', 'Garda Revisioni S.p.A.', 'Contabilità Veneta S.r.l.',
        'Studio Tributario Berici', 'Lessinia Advisory', 'Arena Corporate Finance', 'Valpolicella Holding S.p.A.', 'Studio Legale Brenta',
        'Mincio Servizi Fiscali', 'Euganea Audit S.r.l.', 'Studio Commercialisti Riuniti', 'Rossi & Figli S.n.c.', 'Nord Est Payroll',
        'Baldo Consulenze', 'Studio Dal Molin', 'Piave Tax & Legal', 'Veneto Imprese Partners', 'Studio Associato Bertoldi', 'Lago Capital'];
    const DISPOSITIVI = [['Windows · Chrome', 30], ['Windows · Edge', 15], ['Mac · Safari', 10], ['Mac · Chrome', 7], ['iPhone · Safari', 15],
        ['Android · Chrome', 9], ['Android · Samsung Internet', 2], ['iPad · Safari', 5], ['Tablet Android · Chrome', 1], ['Linux · Firefox', 2],
        ['Windows · Firefox', 3], ['Chromebook · Chrome', 1]];
    const dispositivoACaso = () => {
        let r = caso() * 100;
        for (const [d, peso] of DISPOSITIVI) { if ((r -= peso) < 0) return d; }
        return DISPOSITIVI[0][0];
    };
    const slug = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '');

    /* Le 380 persone. Categorie fisse per posizione (cosi' i conteggi
       sono noti): 0-323 hanno visto, 324-335 sono entrate senza vedere
       (prima dell'inizio o solo in pausa), 336-379 non sono mai entrate
       (le prime 30 con le credenziali inviate, le altre no). */
    const persone = [];
    const accessi = [];
    for (let i = 0; i < 380; i++) {
        const nome = NOMI[(i * 7) % NOMI.length];
        const cognome = COGNOMI[(i * 11 + Math.floor(i / 41)) % COGNOMI.length];
        const azienda = AZIENDE[(i * 3) % AZIENDE.length];
        const email = slug(nome) + '.' + slug(cognome) + (i + 1) + '@' + slug(azienda).slice(0, 18) + '.example';
        const p = { uid: 'u' + String(i + 1).padStart(3, '0'), nome, cognome, email, azienda, i };
        let seg = [];
        if (i < 324) {
            // chi ha visto: di mattina (quasi tutti), rientri dopo pranzo, qualcuno solo il pomeriggio
            const soloPomeriggio = i % 10 === 9;
            if (!soloPomeriggio) {
                const presto = caso() < 0.75;
                const entra = presto ? M(8, fra(38, 59)) : M(9, 0) + fra(10, 95);
                const r = caso();
                let esce;
                if (r < 0.58) esce = M(12, fra(52, 59));
                else if (r < 0.78) esce = M(14, 0) + fra(10, 170);        // resta anche durante la pausa
                else esce = M(10, 30) + fra(0, 120);                       // esce prima di pranzo
                seg.push([entra, Math.max(entra + 5, esce)]);
            }
            const mattinaFinita = seg.length ? seg[0][1] : 0;
            if (soloPomeriggio || (mattinaFinita < M(13, 30) && caso() < 0.82)) {
                const entra = M(13, fra(54, 59)) + fra(0, 30);
                const r = caso();
                const esce = r < 0.6 ? M(16, fra(55, 59)) + fra(0, 8) : M(15, 0) + fra(10, 110);
                seg.push([entra, esce]);
            }
            // chi si scollega un attimo (rete, telefono) e rientra
            if (caso() < 0.14 && seg[0] && seg[0][1] - seg[0][0] > 40) {
                const s = seg[0];
                const via = s[0] + fra(10, s[1] - s[0] - 20);
                seg.splice(0, 1, [s[0], via], [via + fra(3, 8), s[1]]);
            }
        } else if (i < 336) {
            seg = [i % 2 ? [M(8, fra(32, 40)), M(8, fra(45, 55))] : [M(13, fra(8, 15)), M(13, fra(30, 45))]];
        }
        p.seg = seg;
        persone.push(p);
    }
    // una persona con tre periodi noti (la linea del tempo della prova)
    persone[5].seg = [[M(9, 2), M(10, 40)], [M(10, 50), M(12, 58)], [M(14, 3), M(16, 59)]];
    /* Il problema tecnico delle 10.40: quaranta persone collegate escono
       per qualche minuto e rientrano alle 10.50 (il calo piu' forte). */
    let tolte = 0;
    for (const p of persone) {
        if (tolte >= 40 || p.i === 5 || p.i >= 324) continue;
        const k = p.seg.findIndex(s => s[0] <= M(10, 36) && s[1] >= M(10, 55));
        if (k < 0) continue;
        const s = p.seg[k];
        p.seg.splice(k, 1, [s[0], M(10, 40) + (tolte % 4)], [M(10, 50) + (tolte % 3), s[1]]);
        tolte++;
    }

    // le presenze, gli accessi e i numeri di ogni persona
    const durataMinuti = (fine - inizio) / MIN;
    const minutiInOndaDi = seg => {
        let n = 0;
        seg.forEach(s => { for (let m = s[0]; m <= s[1]; m++) if (statoMinuto(m) === 'o') n++; });
        return Math.min(n, durataMinuti);
    };
    persone.forEach(p => {
        const mai = p.i >= 336;
        p.credenziali = mai && p.i >= 366 ? ['da-inviare', 'respinta', 'errore'][p.i % 3] : 'inviata';
        if (mai) {
            Object.assign(p, { stato: 'mai-entrato', primoIngresso: null, ultimaPresenza: null, secondi: 0, collegamenti: 0, acc: [] });
            return;
        }
        const primo = p.seg[0][0] * MIN + fra(2, 50) * 1000;
        const ultimo = (p.seg[p.seg.length - 1][1] + 1) * MIN - fra(5, 55) * 1000;
        const inOnda = minutiInOndaDi(p.seg);
        p.secondi = inOnda ? Math.max(1, inOnda * 60 - fra(0, 45)) : 0;
        p.collegamenti = p.seg.length + (caso() < 0.1 ? 1 : 0);
        // dieci persone riaprono la pagina con la sessione salvata: nessun accesso
        const senzaAccesso = p.i % 31 === 30;
        p.acc = [];
        if (!senzaAccesso) {
            const quanti = caso() < 0.8 ? 1 : (caso() < 0.75 ? 2 : 3);
            let dispositivo = dispositivoACaso();
            for (let k = 0; k < quanti; k++) {
                const s = p.seg[Math.min(k, p.seg.length - 1)];
                const quando = s[0] * MIN - fra(20, 170) * 1000 + (k && k >= p.seg.length ? fra(5, 30) * MIN : 0);
                if (k && caso() < 0.4) dispositivo = dispositivoACaso();
                p.acc.push({ quando, dispositivo });
            }
            p.acc.sort((a, b) => a.quando - b.quando);
        }
        p.stato = p.secondi > 0 ? 'ha-visto' : 'entrato';
        p.primo = primo;
        p.primoIngresso = Math.min(primo, p.acc.length ? p.acc[0].quando : Infinity);
        p.ultimaPresenza = ultimo;
    });

    /* I periodi come li registra il servizio: una fotografia al minuto,
       e un periodo continua solo se la persona c'era nella fotografia
       prima e il cron non ha saltato piu' di 3 minuti (§1 del contratto).
       Chi esce mentre il cron tace finisce all'ultima fotografia in cui
       c'era; il buco di 5 minuti spezza in due il periodo di chi c'era. */
    const fotografati = {};
    let fotoPrima = null;
    minuti.forEach(m => {
        const ricuce = fotoPrima != null && m - fotoPrima <= 3;
        persone.forEach(p => {
            if (!p.seg.some(x => x[0] <= m && m <= x[1])) return;
            const t = fotografati[p.uid] || (fotografati[p.uid] = []);
            const ultimo = t[t.length - 1];
            if (ricuce && ultimo && ultimo[1] === fotoPrima) ultimo[1] = m; else t.push([m, m]);
        });
        fotoPrima = m;
    });
    /* E come nel risultato del servizio (uniscoBuchi): dopo un buco grande
       chi c'era nell'ultima fotografia prima e nella prima dopo si considera
       rimasto, e il suo periodo si ricuce. */
    const primaDelBuco = new Map();
    minuti.forEach((m, i) => { if (i && m - minuti[i - 1] > 3) primaDelBuco.set(m, minuti[i - 1]); });
    Object.keys(fotografati).forEach(uid => {
        const uniti = [];
        fotografati[uid].forEach(t => {
            const u = uniti[uniti.length - 1];
            if (u && primaDelBuco.has(t[0]) && u[1] === primaDelBuco.get(t[0])) u[1] = t[1]; else uniti.push(t);
        });
        fotografati[uid] = uniti;
    });
    persone.forEach(p => { p.foto = fotografati[p.uid] || []; });

    // la curva: chi era collegato in ogni minuto fotografato
    const curva = minuti.map(m => ({
        t: m * MIN,
        n: persone.reduce((s, p) => s + (p.seg.some(x => x[0] <= m && m <= x[1]) ? 1 : 0), 0),
        stato: statoMinuto(m)
    }));
    const inOnda = curva.filter(p => p.stato === 'o');
    let picco = null;
    inOnda.forEach(p => { if (!picco || p.n > picco.n) picco = { n: p.n, t: p.t }; });
    const perMinimo = inOnda.length > 10 ? inOnda.slice(5, inOnda.length - 5) : inOnda;
    let minimo = null;
    perMinimo.forEach(p => { if (!minimo || p.n < minimo.n) minimo = { n: p.n, t: p.t }; });
    const media = arrotonda1(inOnda.reduce((s, p) => s + p.n, 0) / inOnda.length);
    const perT = new Map(curva.map(p => [p.t, p]));
    // le pause: punti consecutivi in pausa (a = la fine dell'ultimo minuto, come lib/diretta-ascolti.js)
    const pause = [];
    let aperta = null;
    curva.forEach(p => {
        if (p.stato === 'p') { if (!aperta) { aperta = { da: p.t, a: p.t + MIN }; pause.push(aperta); } else aperta.a = p.t + MIN; } else aperta = null;
    });
    // i cali: fra un minuto in onda e quello 5 minuti dopo (in onda anche in mezzo), i 3 piu' forti non sovrapposti
    const candidati = [];
    inOnda.forEach(p => {
        const dopo = perT.get(p.t + 5 * MIN);
        const inMezzo = curva.filter(q => q.t > p.t && q.t <= p.t + 5 * MIN);
        if (dopo && inMezzo.every(q => q.stato === 'o') && p.n - dopo.n > 0) candidati.push({ t: p.t, da: p.n, a: dopo.n, perdita: p.n - dopo.n });
    });
    candidati.sort((x, y) => y.perdita - x.perdita || x.t - y.t);
    const cali = [];
    candidati.forEach(c => { if (cali.length < 3 && cali.every(x => Math.abs(x.t - c.t) >= 5 * MIN)) cali.push(c); });
    // il programma
    const programma = PROGRAMMA.map(([o, titolo], i) => {
        const [h, m] = o.split('.').map(Number);
        const da = ora(h, m);
        const a = i + 1 < PROGRAMMA.length ? ora(...PROGRAMMA[i + 1][0].split('.').map(Number)) : fine;
        const dentro = inOnda.filter(p => p.t >= da && p.t < a);
        return {
            ora: o, titolo, da, a,
            media: dentro.length ? arrotonda1(dentro.reduce((s, p) => s + p.n, 0) / dentro.length) : null,
            massimo: dentro.length ? Math.max(...dentro.map(p => p.n)) : null,
            minimo: dentro.length ? Math.min(...dentro.map(p => p.n)) : null,
            minuti: dentro.length
        };
    });
    // gli ingressi ogni 5 minuti
    const fasce = new Map();
    persone.forEach(p => p.foto.forEach((s, k) => {
        const t = Math.floor(s[0] * MIN / (5 * MIN)) * 5 * MIN;
        const f = fasce.get(t) || { t, primi: 0, rientri: 0 };
        if (k === 0) f.primi++; else f.rientri++;
        fasce.set(t, f);
    }));
    const ingressi = Array.from(fasce.values()).sort((a, b) => a.t - b.t);
    // i dispositivi (per persona, l'ultimo accesso)
    const tipoDi = s => (/^(iPhone|Android)$/.test(s) ? 'Telefono' : /^(iPad|Tablet Android)$/.test(s) ? 'Tablet'
        : /^(Windows|Mac|Linux|Chromebook)$/.test(s) ? 'Computer' : 'Altro');
    const conta = () => new Map();
    const tipi = conta(), browser = conta(), sistemi = conta();
    persone.filter(p => p.acc && p.acc.length).forEach(p => {
        const [sistema, nav] = p.acc[p.acc.length - 1].dispositivo.split(' · ');
        [[tipi, tipoDi(sistema)], [browser, nav], [sistemi, sistema]].forEach(([mappa, k]) => mappa.set(k, (mappa.get(k) || 0) + 1));
    });
    const inOrdine = mappa => Array.from(mappa.entries()).map(([nome, n]) => ({ nome, persone: n })).sort((a, b) => b.persone - a.persone || a.nome.localeCompare(b.nome));

    const minutiInOndaRiepilogo = inOnda.length;
    const hannoVisto = persone.filter(p => p.stato === 'ha-visto');
    const entrati = persone.filter(p => p.stato !== 'mai-entrato');
    // l'ordine in cui arrivano dal servizio: quello di elencoPartecipanti (lib/diretta-dati.js)
    const ordineServizio = (a, b) => (a.cognome + ' ' + a.nome).localeCompare(b.cognome + ' ' + b.nome, 'it') || a.email.localeCompare(b.email);
    persone.sort(ordineServizio);
    const personeOut = persone.map(p => {
        const minutiP = arrotonda1(Math.min(p.secondi, durataMinuti * 60) / 60);
        const distinti = [];
        p.acc.slice().reverse().forEach(a => { if (distinti.indexOf(a.dispositivo) < 0) distinti.push(a.dispositivo); });
        return {
            uid: p.uid, nome: p.nome, cognome: p.cognome, email: p.email, azienda: p.azienda, stato: p.stato, credenziali: p.credenziali,
            primoIngresso: p.primoIngresso, ultimaPresenza: p.ultimaPresenza, minutiInOnda: minutiP,
            percentuale: Math.min(100, Math.round(minutiP / minutiInOndaRiepilogo * 100)),
            collegamenti: p.collegamenti, accessi: p.acc.length, dispositivi: distinti,
            segmenti: p.foto.map(s => [s[0] * MIN, (s[1] + 1) * MIN])
        };
    });
    const accessiOut = [];
    persone.forEach(p => p.acc.forEach(a => accessiOut.push({ quando: a.quando, uid: p.uid, email: p.email, nome: p.nome, cognome: p.cognome, azienda: p.azienda, dispositivo: a.dispositivo })));
    accessiOut.sort((a, b) => a.quando - b.quando);
    const secondiLimitati = persone.reduce((s, p) => s + Math.min(p.secondi, durataMinuti * 60), 0);
    const F = {
        ok: true, calcolato: ora(17, 20),
        evento: { id: ID, titolo: 'Next Generation Business 2026 · Verona', inizio, fine, stato: 'terminato', programma: PROGRAMMA.map(([o, titolo]) => ({ ora: o, titolo })) },
        registrazione: { attiva: true, primoMinuto: curva[0].t, ultimoMinuto: curva[curva.length - 1].t },
        riepilogo: {
            iscritti: persone.length,
            credenzialiInviate: persone.filter(p => p.credenziali === 'inviata').length,
            entrati: entrati.length,
            entratiPercento: Math.round(entrati.length / persone.length * 100),
            hannoVisto: hannoVisto.length,
            picco, minimo, media,
            minutiInOnda: minutiInOndaRiepilogo,
            tempoMedioMinuti: arrotonda1(hannoVisto.reduce((s, p) => s + Math.min(p.secondi, durataMinuti * 60) / 60, 0) / hannoVisto.length),
            oreTotali: arrotonda1(secondiLimitati / 3600)
        },
        curva, pause, cali, programma, ingressi,
        dispositivi: { tipi: inOrdine(tipi), browser: inOrdine(browser), sistemi: inOrdine(sistemi) },
        persone: personeOut,
        accessi: accessiOut,
        nota: 'Spettatori di un minuto: le persone con la pagina della diretta aperta che hanno mandato il segnale negli ultimi 2 minuti e mezzo '
            + '(una fotografia al minuto). Minuti per persona: quelli degli attestati.'
    };
    /* I dati da cui il servizio farebbe lo stesso calcolo (documenti come in
       Firestore): non enumerabili, quindi fuori dal JSON mandato alla pagina. */
    Object.defineProperty(F, 'grezzi', {
        enumerable: false,
        value: {
            fotografie: minuti.map(m => ({ m, uids: persone.filter(p => p.seg.some(x => x[0] <= m && m <= x[1])).map(p => p.uid), codice: statoMinuto(m) })),
            presenze: persone.filter(p => p.stato !== 'mai-entrato').map(p => ({ uid: p.uid, idEvento: ID, primo: p.primo, ultimo: p.ultimaPresenza,
                secondi: p.secondi, collegamenti: p.collegamenti })),
            partecipanti: persone.map(p => ({ uid: p.uid, nome: p.nome, cognome: p.cognome, email: p.email, azienda: p.azienda, stato: 'attivo', invio: { stato: p.credenziali } }))
        }
    });
    return F;
}

/* La stessa giornata vista prima che la registrazione cominci: niente
   fotografie (niente curva, pause, cali, ingressi, segmenti), il resto si'. */
function senzaRegistrazione(f) {
    const g = JSON.parse(JSON.stringify(f));
    g.evento.stato = 'programmato';
    g.registrazione = { attiva: false, primoMinuto: null, ultimoMinuto: null };
    g.curva = []; g.pause = []; g.cali = []; g.ingressi = [];
    Object.assign(g.riepilogo, { picco: null, minimo: null, media: 0, minutiInOnda: 0 });
    g.programma.forEach(v => Object.assign(v, { media: null, massimo: null, minimo: null, minuti: 0 }));
    g.persone.forEach(p => { p.segmenti = []; });
    return g;
}

/* ---------- processi di appoggio ---------- */
function avvia(argomenti, pronto, nome, env) {
    return new Promise((risolvi, rifiuta) => {
        const figlio = spawn(process.execPath, argomenti, {
            cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'],
            env: Object.assign({}, process.env, { FORCE_COLOR: '0' }, env || {})
        });
        figlio.uscita = '';
        let partito = false;
        const limite = setTimeout(() => { figlio.kill('SIGTERM'); rifiuta(new Error(nome + ' non partito in tempo:\n' + figlio.uscita.slice(-2000))); }, 150000);
        const leggi = d => {
            figlio.uscita = (figlio.uscita + d.toString()).slice(-200000);
            if (!partito && pronto.test(figlio.uscita)) { partito = true; clearTimeout(limite); risolvi(figlio); }
        };
        figlio.stdout.on('data', leggi);
        figlio.stderr.on('data', leggi);
        figlio.on('exit', c => { clearTimeout(limite); if (!partito) rifiuta(new Error(nome + ' uscito (' + c + '):\n' + figlio.uscita.slice(-2000))); });
    });
}
function ferma(figlio) {
    return new Promise(r => {
        if (!figlio || figlio.exitCode !== null) return r();
        figlio.removeAllListeners('exit');
        figlio.on('exit', () => r());
        figlio.kill('SIGINT');
        setTimeout(() => { try { figlio.kill('SIGKILL'); } catch (_) { /* gia' fermo */ } r(); }, 8000);
    });
}
async function postJSON(url, corpo, intestazioni) {
    const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, intestazioni || {}), body: JSON.stringify(corpo) });
    let j = null;
    try { j = await r.json(); } catch (_) { j = null; }
    return { stato: r.status, dati: j };
}

/* SheetJS anche in Node, per rileggere l'Excel scaricato (dalla cache
   delle prove, la stessa di gestione.prova.js) */
async function sheetJSNode() {
    const k = crypto.createHash('sha256').update(SHEETJS_URL).digest('hex').slice(0, 40);
    const cache = path.join(RISULTATI, 'cache-rete');
    fs.mkdirSync(cache, { recursive: true });
    const bin = path.join(cache, k + '.bin');
    if (!fs.existsSync(bin)) {
        const r = await fetch(SHEETJS_URL);
        if (!r.ok) throw new Error('SheetJS non scaricata: ' + r.status);
        fs.writeFileSync(bin, Buffer.from(await r.arrayBuffer()));
        fs.writeFileSync(path.join(cache, k + '.json'), JSON.stringify({ stato: 200, tipo: r.headers.get('content-type') || 'application/javascript' }));
    }
    const copia = path.join(RISULTATI, 'xlsx-node-ascolti.js');
    fs.writeFileSync(copia, fs.readFileSync(bin));
    return require(copia);
}

/* ============================================================
   LA PROVA
   ============================================================ */
(async () => {
    let emulatori = null, server = null, browser = null, pagina = null;
    const t0 = Date.now();
    try {
        const F = costruisciFixture();
        const k = F.riepilogo;
        // la fixture e' quella che dice il contratto
        vero(F.persone.length === 380 && F.programma.length === 13 && F.evento.fine - F.evento.inizio === 8 * 3600000 && F.pause.length === 1
            && F.cali.length === 3 && k.picco && k.minimo && F.persone.some(p => p.segmenti.length >= 3),
            'fixture: 380 persone, 8 ore, pausa pranzo, 13 voci, 3 cali, picco ' + k.picco.n + ' alle ' + oraIt(k.picco.t) + ', minimo in onda '
            + k.minimo.n + ' alle ' + oraIt(k.minimo.t) + ', media ' + k.media + ', ' + F.curva.length + ' minuti fotografati, '
            + F.accessi.length + ' accessi', JSON.stringify(k));
        /* La fixture e' quella che calcola il servizio? Gli stessi dati
           (fotografie minuto per minuto con aggiungiMinuto, presenze, accessi,
           partecipanti) passati a risultato() di lib/diretta-ascolti.js devono
           dare lo stesso JSON: cosi' la pagina si prova sul formato vero. */
        const A = require(path.join(RADICE, 'email-service/lib/diretta-ascolti'));
        let registrato = null;
        F.grezzi.fotografie.forEach(f => { registrato = A.aggiungiMinuto(registrato, f.m, f.uids, f.codice) || registrato; });
        const delServizio = A.risultato({
            id: ID, ev: { titolo: F.evento.titolo, inizio: F.evento.inizio, fine: F.evento.fine, stato: F.evento.stato, programma: F.evento.programma },
            registrazione: { primoMinuto: registrato.primoMinuto, ultimoMinuto: registrato.ultimoMinuto, curva: JSON.stringify(registrato.curva), persone: JSON.stringify(registrato.persone), versione: 1 },
            presenze: F.grezzi.presenze, accessi: F.accessi, partecipanti: F.grezzi.partecipanti, adesso: F.calcolato
        });
        const diverse = Object.keys(F).filter(c => c !== 'nota' && JSON.stringify(F[c]) !== JSON.stringify(delServizio[c]));
        vero(diverse.length === 0 && Object.keys(delServizio).sort().join() === Object.keys(F).sort().join(),
            'la fixture coincide, voce per voce, con quello che calcola lib/diretta-ascolti.js (risultato) dagli stessi dati: stesso formato, stessi numeri',
            diverse.map(c => c + ': ' + JSON.stringify(F[c]).slice(0, 150) + ' / servizio ' + JSON.stringify(delServizio[c]).slice(0, 150)).join('\n'));
        const FS = senzaRegistrazione(F);
        const comeNellaPagina = F.persone.slice().sort(ordinePagina);

        const codice = fs.readFileSync(path.join(RADICE, 'diretta/gestione/gestione.js'), 'utf8');
        const html = fs.readFileSync(path.join(RADICE, 'diretta/gestione/index.html'), 'utf8');
        vero(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/.test(codice) && /createElementNS\(SVG_NS/.test(codice),
            'gestione.js disegna i grafici con createElementNS e textContent (mai innerHTML)');
        vero(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html) && !/\son[a-z]+=/i.test(html)
            && /gestione\.css\?v=20260927a/.test(html) && /gestione\.js\?v=20260927a/.test(html),
            'HTML senza script in linea né on...=, con le versioni nuove di gestione.js e gestione.css');
        const cspPrima = /script-src 'self' https:\/\/www\.gstatic\.com https:\/\/cdn\.sheetjs\.com;/.test(html);
        vero(cspPrima, 'la Content-Security-Policy resta quella (script solo da gstatic e SheetJS: nessuna libreria nuova)');
        const posTab = ['tab-regia', 'tab-ascolti', 'tab-partecipanti'].map(id => html.indexOf('id="' + id + '"'));
        vero(posTab[0] > 0 && posTab[0] < posTab[1] && posTab[1] < posTab[2]
            && /<button type="button" role="tab" id="tab-ascolti" data-scheda="ascolti" aria-controls="scheda-ascolti"/.test(html)
            && /<section id="scheda-ascolti" class="scheda[^"]*" role="tabpanel"[^>]*hidden>/.test(html),
            'la scheda «Ascolti» sta fra Regia e Partecipanti (role="tab", aria-controls, tabpanel nascosto)');

        fs.readdirSync(FOTO).filter(f => /\.png$/.test(f)).forEach(f => fs.unlinkSync(path.join(FOTO, f)));
        console.log('\n-- avvio degli emulatori e del servizio vero (porte ' + JSON.stringify(PORTE) + ')');
        emulatori = await avvia([path.join(__dirname, 'avvia-emulatori.js'), '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], /EMULATORI PRONTI/, 'emulatori');
        server = await avvia([path.join(__dirname, 'server-locale.js'), '--api', String(PORTE.api), '--statico', String(PORTE.statico),
            '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], /SERVER LOCALE PRONTO/, 'server locale',
        { DIRETTA_ADMIN_EMAILS: EMAIL_GESTORE, DIRETTA_POSTA_FINTA: path.join(RISULTATI, 'posta-ascolti-pagina.jsonl') });

        // il gestore, gia' attivato (il claim lo mette di solito «Primo accesso»)
        const app = admin.initializeApp({ projectId: 'demo-ngb-eventi' }, 'prova-ascolti-pagina');
        const utente = await app.auth().createUser({ email: EMAIL_GESTORE, password: PASSWORD_GESTORE, emailVerified: true });
        await app.auth().setCustomUserClaims(utente.uid, { gestore: true });
        const accesso = await postJSON(AUTH_REST + '/accounts:signInWithPassword?key=finta', { email: EMAIL_GESTORE, password: PASSWORD_GESTORE, returnSecureToken: true });
        const salvato = await postJSON(API + '/diretta-gestione', {
            azione: 'evento-salva', evento: {
                id: ID, nuovo: true, titolo: F.evento.titolo, luogo: 'Verona · Palazzo della Gran Guardia', data: '2026-10-02',
                oraInizio: '09:00', oraFine: '17:00', programma: F.evento.programma, paginaEvento: '/verona_ottobre_2026/'
            }
        }, { Authorization: 'Bearer ' + (accesso.dati && accesso.dati.idToken) });
        vero(salvato.stato === 200, 'l\'evento di Verona creato con il servizio vero (evento-salva)', JSON.stringify(salvato.dati).slice(0, 300));

        browser = await chromium.launch({
            executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--lang=it-IT'],
            env: Object.assign({}, process.env, { LANG: 'it_IT.UTF-8', LANGUAGE: 'it', LC_ALL: 'it_IT.UTF-8' })
        });
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'it-IT', timezoneId: 'Europe/Rome', hasTouch: true });
        await preparaContesto(context, {});
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITO });
        await context.addInitScript(p => {
            window.NGB_DIRETTA_PROVE = p;
            window.__violazioniCSP = [];
            document.addEventListener('securitypolicyviolation', e => { window.__violazioniCSP.push(e.violatedDirective + ' ' + e.blockedURI); });
        }, { firestore: PORTE.firestore, auth: PORTE.auth, api: API });
        const page = await context.newPage();
        pagina = page;
        const erroriConsole = [];
        const erroriPagina = [];
        page.on('console', m => { if (m.type() === 'error') erroriConsole.push(m.text() + ' (' + ((m.location() && m.location().url) || '') + ')'); });
        page.on('pageerror', e => erroriPagina.push(e.stack || e.message));

        /* L'unica risposta finta: 'ascolti'. Tutto il resto va al servizio vero. */
        let risposta = F;
        // false: la chiamata va al servizio vero (lib/diretta-ascolti.js), per vedere la sua risposta nella pagina
        let finta = true;
        const chiamateAscolti = [];
        await page.route(API + '/diretta-gestione', async route => {
            const req = route.request();
            let dati = {};
            try { dati = JSON.parse(req.postData() || '{}'); } catch (_) { dati = {}; }
            if (req.method() !== 'POST' || dati.azione !== 'ascolti' || !finta) return route.continue();
            chiamateAscolti.push({ quando: Date.now(), idEvento: dati.idEvento, autorizzata: /^Bearer \S+/.test(req.headers().authorization || '') });
            return route.fulfill({
                status: 200, contentType: 'application/json; charset=utf-8',
                headers: { 'access-control-allow-origin': SITO, vary: 'Origin', 'cache-control': 'no-store' },
                body: JSON.stringify(risposta)
            });
        });
        await page.clock.install();

        const $ = s => page.locator(s);
        const testo = async s => ((await $(s).first().textContent()) || '').replace(/\s+/g, ' ').trim();
        const aspetta = async (fn, ms, descr) => {
            const fine = Date.now() + (ms || 10000);
            let ultimo;
            while (Date.now() < fine) {
                try { ultimo = await fn(); if (ultimo) return ultimo; } catch (e) { ultimo = e.message; }
                await pausa(100);
            }
            throw new Error('Tempo scaduto: ' + (descr || '') + ' (' + ultimo + ')');
        };
        // le foto a pagina intera: la testata "appiccicata" torna nel flusso della pagina
        async function foto(nome) {
            const stile = await page.addStyleTag({ content: '.testata{position:static!important}.avvisi{display:none!important}' });
            await page.evaluate(() => window.scrollTo(0, 0));
            await pausa(250);
            await page.screenshot({ path: path.join(FOTO, nome + '.png'), fullPage: true });
            await stile.evaluate(n => n.remove());
        }

        /* ---------- 1. il gestore entra e apre la scheda ---------- */
        console.log('\n-- il gestore entra e apre «Ascolti»');
        await page.goto(SITO + '/diretta/gestione/?emulatori=1');
        await $('#form-gestore').waitFor({ state: 'visible', timeout: 30000 });
        await $('#gestore-email').fill(EMAIL_GESTORE);
        await $('#gestore-password').fill(PASSWORD_GESTORE);
        await $('#btn-gestore-entra').click();
        await $('#vista-app').waitFor({ state: 'visible', timeout: 20000 });
        await aspetta(async () => await $('#sel-evento').inputValue() === ID, 15000, 'evento scelto');
        vero(!(await $('#tab-ascolti').isDisabled()) && chiamateAscolti.length === 0,
            'con l\'evento scelto la scheda Ascolti è attiva, e finché non la si apre nessuna chiamata \'ascolti\'');
        await $('#tab-ascolti').click();
        await aspetta(async () => (await testo('#ascolti-tessere [data-voce="iscritti"] .tessera-num')) === '380', 15000, 'tessere');
        vero(chiamateAscolti.length === 1 && chiamateAscolti[0].idEvento === ID && chiamateAscolti[0].autorizzata,
            'aprendo la scheda: una chiamata chiama(\'ascolti\', { idEvento }) con il token del gestore');
        vero(await $('#tab-ascolti').getAttribute('aria-selected') === 'true' && await $('#scheda-ascolti').isVisible()
            && await page.evaluate(() => document.body.dataset.scheda) === 'ascolti', 'la scheda Ascolti è quella aperta (body[data-scheda="ascolti"])');
        vero(await testo('#ascolti-aggiornato') === 'Aggiornato alle 17.20 · si aggiorna da solo ogni minuto', '«' + await testo('#ascolti-aggiornato') + '»');
        vero(/^Next Generation Business 2026 · Verona · venerdì 2 ottobre 2026, dalle 9\.00 alle 17\.00 · Terminato$/.test(await testo('#ascolti-evento')),
            'sotto il titolo: evento, giorno, orario e stato: «' + await testo('#ascolti-evento') + '»');

        /* ---------- 2. le tessere ---------- */
        console.log('\n-- il riepilogo');
        const tessera = async v => ({ num: await testo('#ascolti-tessere [data-voce="' + v + '"] .tessera-num'), sotto: await testo('#ascolti-tessere [data-voce="' + v + '"] .tessera-sotto') });
        // i numeri all'italiana, come li scrive il browser (1.612,0: il punto anche sulle migliaia)
        const it = (n, d) => { const [intera, dec] = Number(n).toFixed(d || 0).split('.'); return intera.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + dec : ''); };
        const durata = m => { const x = Math.round(m); return x < 60 ? x + ' min' : Math.floor(x / 60) + ' h' + (x % 60 ? ' ' + (x % 60) + ' min' : ''); };
        const attese = {
            iscritti: { num: '380', sotto: 'persone dell\'evento' },
            credenziali: { num: String(k.credenzialiInviate), sotto: (380 - k.credenzialiInviate) + ' ancora da inviare' },
            entrati: { num: String(k.entrati), sotto: k.entratiPercento + '% degli iscritti' },
            visto: { num: String(k.hannoVisto), sotto: 'con la diretta in onda' },
            picco: { num: String(k.picco.n), sotto: 'alle ' + oraIt(k.picco.t) },
            minimo: { num: String(k.minimo.n), sotto: 'alle ' + oraIt(k.minimo.t) },
            media: { num: it(k.media, 1), sotto: 'su ' + durata(k.minutiInOnda) + ' in onda' },
            tempo: { num: durata(k.tempoMedioMinuti), sotto: 'per chi ha visto' },
            ore: { num: it(k.oreTotali, 1), sotto: 'sommando tutte le persone' }
        };
        for (const v of Object.keys(attese)) {
            const t = await tessera(v);
            vero(t.num === attese[v].num && t.sotto === attese[v].sotto, 'tessera ' + v + ': «' + t.num + '» «' + t.sotto + '»', JSON.stringify({ visto: t, atteso: attese[v] }));
        }

        await foto('ascolti-computer');

        /* ---------- 3. il grafico: dove stanno le cose ---------- */
        console.log('\n-- il grafico degli spettatori');
        const scala = await page.evaluate(() => {
            const s = document.querySelector('#ascolti-cornice svg');
            const n = k => Number(s.getAttribute('data-' + k));
            return { da: n('da'), a: n('a'), sinistra: n('sinistra'), destra: n('destra'), alto: n('alto'), fondo: n('fondo'), massimo: n('massimo'), label: s.getAttribute('aria-label'), role: s.getAttribute('role') };
        });
        const X = t => scala.sinistra + (t - scala.da) * (scala.destra - scala.sinistra) / (scala.a - scala.da);
        const Y = n => scala.fondo - n / scala.massimo * (scala.fondo - scala.alto);
        vero(scala.da === ora(8, 30) && scala.a === ora(17, 15) && scala.massimo >= k.picco.n && scala.role === 'img'
            && scala.label.includes('Picco: ' + k.picco.n + ' spettatori alle ' + oraIt(k.picco.t)) && scala.label.includes('Minimo in onda: ' + k.minimo.n),
            'il grafico va dalle 8.30 alle 17.15 (primo minuto fotografato e fine arrotondata al quarto d\'ora), asse fino a ' + scala.massimo
            + '; role="img" con il riassunto: «' + scala.label.slice(0, 120) + '…»', JSON.stringify(scala));
        const segno = async sel => page.evaluate(s => {
            const g = document.querySelector(s);
            if (!g) return null;
            const c = g.querySelector('circle'), t = g.querySelector('text');
            return { cx: Number(c.getAttribute('cx')), cy: Number(c.getAttribute('cy')), testo: t.textContent, tx: Number(t.getAttribute('x')), ty: Number(t.getAttribute('y')), ancora: t.getAttribute('text-anchor') };
        }, sel);
        const gp = await segno('#ascolti-cornice .g-picco');
        vero(gp && vicino(gp.cx, X(k.picco.t)) && vicino(gp.cy, Y(k.picco.n)) && gp.testo === 'Picco ' + k.picco.n + ' alle ' + oraIt(k.picco.t)
            && gp.ty < gp.cy && Math.abs(gp.tx - gp.cx) <= 6,
            'il punto del picco è sul minuto delle ' + oraIt(k.picco.t) + ' all\'altezza di ' + k.picco.n + ' (' + gp.cx + ', ' + gp.cy + '), con la scritta «' + gp.testo + '» sopra', JSON.stringify({ gp, x: X(k.picco.t), y: Y(k.picco.n) }));
        const gm = await segno('#ascolti-cornice .g-minimo');
        vero(gm && vicino(gm.cx, X(k.minimo.t)) && vicino(gm.cy, Y(k.minimo.n)) && gm.testo === 'Minimo ' + k.minimo.n + ' alle ' + oraIt(k.minimo.t)
            && Math.abs(gm.tx - gm.cx) <= 6,
            'il punto del minimo in onda è sul minuto delle ' + oraIt(k.minimo.t) + ' all\'altezza di ' + k.minimo.n + ', con la scritta «' + gm.testo + '»', JSON.stringify({ gm, x: X(k.minimo.t), y: Y(k.minimo.n) }));
        const linee = await page.evaluate(() => Array.from(document.querySelectorAll('#ascolti-cornice path.g-linea, #ascolti-cornice path.g-linea-spenta'))
            .map(p => ({ classe: p.getAttribute('class'), punti: p.getAttribute('d').split(/[ML]/).filter(Boolean).map(c => c.split(',').map(Number)) })));
        const passaPer = (x, y) => linee.some(l => l.punti.some(p => vicino(p[0], x) && vicino(p[1], y)));
        vero(passaPer(X(k.picco.t), Y(k.picco.n)) && passaPer(X(k.minimo.t), Y(k.minimo.n)), 'la linea degli spettatori passa proprio per il picco e per il minimo');
        const tuttiIPunti = F.curva.every(p => passaPer(X(p.t), Y(p.n)));
        vero(tuttiIPunti, 'ogni minuto fotografato (' + F.curva.length + ') è un punto della linea, nel posto giusto');
        const salto = (x1, x2) => linee.some(l => l.punti.some((p, i) => i && vicino(l.punti[i - 1][0], x1) && vicino(p[0], x2)));
        vero(!salto(X(ora(15, 20)), X(ora(15, 26))) && salto(X(ora(10, 30)), X(ora(10, 33)))
            && await testo('#ascolti-buchi') === 'Mancano i dati dalle 15.21 alle 15.25: lì la linea si interrompe.',
        'buchi del cron: 5 minuti senza fotografie (15.21-15.25) interrompono la linea, e sotto il grafico lo si dice («' + await testo('#ascolti-buchi') + '»); 2 minuti (10.31-10.32) no, la linea li ricuce');
        vero(linee.filter(l => l.classe === 'g-linea').every(l => l.punti.every(p => {
            const t = scala.da + (p[0] - scala.sinistra) * (scala.a - scala.da) / (scala.destra - scala.sinistra);
            const m = F.curva.find(q => Math.abs(q.t - t) < 20000);
            return m && m.stato === 'o';
        })) && linee.some(l => l.classe === 'g-linea-spenta'),
        'la linea blu è solo nei minuti in onda; prima, dopo e in pausa la linea è grigia');
        const fasce = await page.evaluate(() => Array.from(document.querySelectorAll('#ascolti-cornice .g-fasce > g')).map(g => {
            const r = g.querySelector('rect'), t = g.querySelector('text');
            return { classe: g.getAttribute('class'), x: Number(r.getAttribute('x')), w: Number(r.getAttribute('width')), testo: t ? t.textContent : '' };
        }));
        const fp = fasce.find(f => f.classe === 'g-pausa');
        vero(fp && vicino(fp.x, X(ora(13, 0))) && vicino(fp.x + fp.w, X(ora(14, 0)), 0.8) && fp.testo === 'Pausa',
            'la fascia grigia della pausa va dalle 13.00 alle 14.00, con la scritta «Pausa»', JSON.stringify(fasce));
        const prima = fasce.find(f => f.classe === 'g-fuori' && vicino(f.x, X(ora(8, 30))) && /^Prima/.test(f.testo));
        const dopo = fasce.filter(f => f.classe === 'g-fuori' && f.x > X(ora(16, 0)));
        vero(prima && vicino(prima.x + prima.w, X(ora(9, 0)), 0.8) && dopo.length === 1 && vicino(dopo[0].x, X(ora(17, 0))),
            'prima (8.30-9.00, «' + (prima && prima.testo) + '») e dopo la diretta (dalle 17.00) le fasce attenuate', JSON.stringify(fasce));
        const voci = await page.evaluate(() => Array.from(document.querySelectorAll('#ascolti-cornice .g-voce')).map(g => ({
            n: Number(g.getAttribute('data-voce')), x: Number(g.querySelector('line').getAttribute('x1')), titolo: g.querySelector('title').textContent,
            etichetta: g.querySelector('text') ? g.querySelector('text').textContent : ''
        })));
        vero(voci.length === 13 && voci.every((v, i) => v.n === i + 1 && vicino(v.x, X(F.programma[i].da)) && v.titolo === (i + 1) + '. ' + F.programma[i].ora + ' ' + F.programma[i].titolo
            && (v.etichetta === '' || v.etichetta.startsWith(String(i + 1)))),
        'le 13 voci del programma: linee verticali all\'ora giusta, numerate, con il titolo intero al passaggio (<title>) e l\'etichetta accorciata: '
            + voci.map(v => '«' + v.etichetta + '»').slice(0, 5).join(' '), JSON.stringify(voci.slice(0, 3)));
        vero(voci.some(v => /…$/.test(v.etichetta)) && voci.some(v => v.etichetta.length > 12), 'le etichette lunghe si accorciano con «…», quelle che ci stanno restano intere');
        const cali = await page.evaluate(() => Array.from(document.querySelectorAll('#ascolti-cornice .g-calo')).map(g => ({ t: Number(g.getAttribute('data-t')), perdita: Number(g.getAttribute('data-perdita')), testo: g.querySelector('text').textContent })));
        vero(cali.length === 3 && F.cali.every((c, i) => cali[i].t === c.t && cali[i].testo === '−' + c.perdita),
            'i 3 cali più forti segnati in rosso con la perdita: ' + cali.map(c => oraIt(c.t) + ' ' + c.testo).join(', '), JSON.stringify(cali));
        const testoCali = await testo('#ascolti-cali');
        vero(testoCali.startsWith('I cali più forti (in 5 minuti): alle ' + oraIt(F.cali[0].t) + ' da ' + F.cali[0].da + ' a ' + F.cali[0].a),
            'e sotto il grafico anche a parole: «' + testoCali.slice(0, 110) + '…»');
        vero(F.cali[0].t === ora(10, 40) || F.cali.some(c => c.t >= ora(10, 36) && c.t <= ora(10, 41)), 'il calo del problema tecnico delle 10.40 è fra i tre');
        const tacche = await page.evaluate(() => Array.from(document.querySelectorAll('#ascolti-cornice .g-assi text')).map(t => ({ testo: t.textContent, x: Number(t.getAttribute('x')), y: Number(t.getAttribute('y')) })));
        const tacca12 = tacche.find(t => t.testo === '12.00');
        const tacca100 = tacche.find(t => t.testo === '100');
        vero(tacca12 && vicino(tacca12.x, X(ora(12, 0))) && tacca100 && vicino(tacca100.y - 4, Y(100)) && tacche.some(t => t.testo === '9.00') && tacche.some(t => t.testo === '17.00'),
            'gli assi: le ore italiane (9.00 … 17.00) e i numeri (0, 100, …) al loro posto');

        /* ---------- 4. il riquadrino: tastiera e tocco ---------- */
        console.log('\n-- il riquadrino (tastiera e tocco)');
        // il riquadrino: una riga per elemento (il numero, poi ora e stato, la voce...)
        const righeDi = sel => page.evaluate(s => Array.from(document.querySelector(s).children).map(n => n.textContent).join(' '), sel);
        const riquadrino = async () => ({ visibile: await $('#ascolti-suggerimento').isVisible(), testo: await righeDi('#ascolti-suggerimento'), annuncio: await testo('#ascolti-annuncio') });
        const spett = n => n + (n === 1 ? ' spettatore' : ' spettatori');
        const riga = p => spett(p.n) + ' alle ' + oraIt(p.t);
        const rigaAnnuncio = p => spett(p.n) + ', alle ' + oraIt(p.t);
        await $('#ascolti-cornice').focus();
        let rq = await riquadrino();
        vero(rq.visibile && rq.testo.startsWith(riga(k.picco)) && /Picco della giornata/.test(rq.testo) && /Picco della giornata/.test(rq.annuncio),
            'con il fuoco sul grafico il riquadrino parte dal picco: «' + rq.testo + '» (anche nella riga aria-live)', JSON.stringify(rq));
        await page.keyboard.press('Home');
        rq = await riquadrino();
        vero(rq.testo.startsWith(riga(F.curva[0]) + ' · Prima della diretta'), 'Inizio: il primo minuto, «' + rq.testo + '»');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        rq = await riquadrino();
        vero(rq.testo.startsWith(riga(F.curva[2])) && rq.annuncio.startsWith(rigaAnnuncio(F.curva[2])), 'freccia a destra due volte: «' + rq.testo + '» (e nella riga aria-live «' + rq.annuncio + '»)');
        await page.keyboard.press('End');
        await page.keyboard.press('PageUp');
        rq = await riquadrino();
        const dieciPrima = F.curva[F.curva.length - 11];
        vero(rq.testo.startsWith(riga(dieciPrima)), 'Fine e poi Pagina su: dieci minuti prima dell\'ultimo, «' + rq.testo + '»');
        // un minuto con la voce del programma e il calo
        const iCalo = F.curva.findIndex(p => p.t === F.cali[0].t);
        await page.keyboard.press('Home');
        for (let i = 0; i < Math.floor(iCalo / 10); i++) await page.keyboard.press('PageDown');
        for (let i = 0; i < iCalo % 10; i++) await page.keyboard.press('ArrowRight');
        rq = await riquadrino();
        const voceCalo = F.programma.findIndex(v => F.cali[0].t >= v.da && F.cali[0].t < v.a);
        vero(rq.testo.includes((voceCalo + 1) + '. ' + F.programma[voceCalo].titolo) && rq.testo.includes('Da qui, in 5 minuti: da ' + F.cali[0].da + ' a ' + F.cali[0].a),
            'nel riquadrino anche la voce del programma e il calo che comincia lì: «' + rq.testo + '»');
        const mirino = await page.evaluate(() => { const m = document.querySelector('#ascolti-cornice .g-mirino'); return { vis: m.getAttribute('visibility'), x: Number(m.getAttribute('x1')) }; });
        vero(mirino.vis === 'visible' && vicino(mirino.x, X(F.cali[0].t)), 'la riga verticale del mirino segue il minuto scelto');
        await page.keyboard.press('Escape');
        vero(!(await $('#ascolti-suggerimento').isVisible()), 'Esc nasconde il riquadrino');
        // il mouse: passando sopra il minimo
        const box = await $('#ascolti-cornice svg').boundingBox();
        const aSchermo = (t, n) => ({ x: box.x + X(t) * box.width / (scala.destra + 20), y: box.y + Y(n) * box.width / (scala.destra + 20) });
        const suMinimo = aSchermo(k.minimo.t, k.minimo.n);
        await page.mouse.move(suMinimo.x, suMinimo.y);
        rq = await riquadrino();
        vero(rq.visibile && rq.testo.startsWith(riga(k.minimo)) && /Minimo in onda/.test(rq.testo), 'passando con il mouse sul minimo: «' + rq.testo + '»');
        await page.mouse.move(5, 5);
        // il tocco: sul picco
        const suPicco = aSchermo(k.picco.t, k.picco.n);
        await page.touchscreen.tap(suPicco.x, suPicco.y + 30);
        rq = await riquadrino();
        vero(rq.visibile && rq.testo.startsWith(riga(k.picco)), 'toccando il grafico sul picco il riquadrino dice «' + rq.testo + '» e resta scritto', JSON.stringify(rq));
        await $('#ascolti-riepilogo-titolo').click();

        /* ---------- 5. «Vedi i dati del grafico» ---------- */
        await $('#ascolti-dati-grafico > summary').click();
        const tabCurva = await page.evaluate(() => ({
            righe: document.querySelectorAll('#tabella-curva tbody tr[data-t]').length,
            buchi: Array.from(document.querySelectorAll('#tabella-curva tbody tr.riga-buco')).map(r => r.textContent),
            picco: Array.from(document.querySelectorAll('#tabella-curva tbody tr.riga-nota')).map(r => Array.from(r.cells).map(c => c.textContent).join('|')),
            intestazioni: Array.from(document.querySelectorAll('#tabella-curva thead th')).map(t => t.getAttribute('scope') + ':' + t.textContent)
        }));
        vero(await $('#tabella-curva').isVisible() && tabCurva.righe === F.curva.length
            && tabCurva.buchi.length === 2 && tabCurva.buchi[1] === 'Nessuna fotografia per 5 minuti (dalle 15.21 alle 15.25)'
            && tabCurva.picco.some(r => r.startsWith(oraIt(k.picco.t) + '|' + k.picco.n + '|In onda|Picco'))
            && tabCurva.intestazioni.join(',') === 'col:Ora,col:Spettatori,col:Stato della diretta,col:Nota',
        '«Vedi i dati del grafico»: la tabella di ogni minuto (' + tabCurva.righe + ' righe, <th scope="col">), i due buchi detti a parole, il picco segnato', JSON.stringify(tabCurva).slice(0, 500));
        await $('#ascolti-dati-grafico > summary').click();

        /* ---------- 6. programma ---------- */
        console.log('\n-- programma, ingressi, dispositivi');
        const prog = await page.evaluate(() => Array.from(document.querySelectorAll('#tabella-programma tbody tr')).map(tr => ({
            classe: tr.className, voce: tr.querySelector('th[scope="row"]').textContent.replace(/\s+/g, ' ').trim(),
            celle: Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()),
            barra: tr.querySelector('.media-valore') ? tr.querySelector('.media-valore').style.width : ''
        })));
        const medie = F.programma.map(v => v.media);
        const maxMedia = Math.max(...medie.filter(m => m != null));
        const iMigliore = medie.indexOf(maxMedia);
        vero(prog.length === 13 && prog.every((r, i) => {
            const v = F.programma[i];
            return r.celle[0] === oraIt(v.da) + '–' + oraIt(v.a)
                && (v.media == null ? r.celle[1] === 'nessun minuto in onda' && r.celle[2] === '–' : r.celle[1] === it(v.media, 1) && r.celle[2] === String(v.massimo) && r.celle[3] === String(v.minimo))
                && (v.media == null || vicino(parseFloat(r.barra), v.media / maxMedia * 100, 0.06));
        }), 'la tabella del programma: 13 voci con orario, media (con la barra proporzionale), massimo e minimo; la pausa pranzo «nessun minuto in onda»',
        JSON.stringify(prog.slice(0, 2)) + ' / ' + JSON.stringify(prog[6]));
        vero(prog.filter(r => /migliore/.test(r.classe)).length === 1 && /migliore/.test(prog[iMigliore].classe) && prog[iMigliore].voce.endsWith('la più seguita')
            && parseFloat(prog[iMigliore].barra) === 100,
        'la voce più seguita evidenziata, con la scritta «la più seguita»: «' + prog[iMigliore].voce + '» (media ' + it(maxMedia, 1) + ')');

        /* ---------- 7. ingressi ---------- */
        const col = await page.evaluate(() => Array.from(document.querySelectorAll('#ingressi-cornice .g-colonna')).map(g => ({
            t: Number(g.getAttribute('data-t')), primi: Number(g.getAttribute('data-primi')), rientri: Number(g.getAttribute('data-rientri')),
            parti: Array.from(g.querySelectorAll('path')).map(p => p.getAttribute('class'))
        })));
        const legenda = (await testo('#ascolti-ingressi .grafico-legenda')).replace(/\s+/g, ' ');
        vero(col.length === F.ingressi.length && col.every((c, i) => c.t === F.ingressi[i].t && c.primi === F.ingressi[i].primi && c.rientri === F.ingressi[i].rientri)
            && col.some(c => c.parti.join() === 'g-primi,g-rientri') && legenda === 'Primi ingressi Rientri',
        'istogramma degli ingressi: ' + col.length + ' colonne ogni 5 minuti, primi ingressi e rientri in due colori, con la legenda «' + legenda + '»');
        const colonnaBuco = F.ingressi.find(b => b.t === ora(15, 25));
        vero((!colonnaBuco || colonnaBuco.rientri < 20)
            && await testo('#ingressi-buchi') === 'Mancano i dati dalle 15.21 alle 15.25: chi era collegato prima e dopo è contato come presente anche in mezzo.',
        'dopo il buco del cron niente finti «rientri» alle 15.25 (' + (colonnaBuco ? colonnaBuco.rientri : 0) + '), e l\'avviso: «' + await testo('#ingressi-buchi') + '»');
        const massimaColonna = F.ingressi.reduce((m, b) => (b.primi > m.primi ? b : m), F.ingressi[0]);
        await $('#ingressi-cornice').focus();
        let ri = await righeDi('#ingressi-suggerimento');
        vero(ri === massimaColonna.primi + ' primi ingressi ' + massimaColonna.rientri + (massimaColonna.rientri === 1 ? ' rientro' : ' rientri') + ' dalle ' + oraIt(massimaColonna.t) + ' alle ' + oraIt(massimaColonna.t + 5 * MIN),
            'anche l\'istogramma si legge con la tastiera: parte dalla colonna più alta, «' + ri + '»');
        await page.keyboard.press('ArrowRight');
        ri = await testo('#ingressi-annuncio');
        const dopoMassima = F.ingressi[F.ingressi.indexOf(massimaColonna) + 1];
        vero(ri.includes('dalle ' + oraIt(dopoMassima.t)), 'freccia a destra: la colonna dopo, «' + ri + '»');
        await page.keyboard.press('Escape');

        /* ---------- 8. dispositivi ---------- */
        const disp = await page.evaluate(() => {
            const g = n => Array.from(document.querySelectorAll('#ascolti-dispositivi [data-gruppo="' + n + '"] li')).map(li => ({
                nome: li.querySelector('.disp-nome').textContent, numero: li.querySelector('.disp-numero').textContent, larga: li.querySelector('.disp-valore').style.width
            }));
            return { tipi: g('tipi'), browser: g('browser'), sistemi: g('sistemi'), titoli: Array.from(document.querySelectorAll('#ascolti-dispositivi h3')).map(h => h.textContent) };
        });
        const totaleTipi = F.dispositivi.tipi.reduce((s, v) => s + v.persone, 0);
        const come = (lista, attesa) => lista.length === attesa.length && attesa.every((v, i) => lista[i].nome === v.nome
            && lista[i].numero === v.persone + ' · ' + Math.round(v.persone / totaleTipi * 100) + '%' && vicino(parseFloat(lista[i].larga), v.persone / totaleTipi * 100, 0.06));
        vero(come(disp.tipi, F.dispositivi.tipi) && come(disp.browser, F.dispositivi.browser) && come(disp.sistemi, F.dispositivi.sistemi)
            && disp.titoli.join(',') === 'Tipo di dispositivo,Browser,Sistema',
        'dispositivi: barre orizzontali per tipo (' + disp.tipi.map(d => d.nome + ' ' + d.numero).join(', ') + '), browser e sistema', JSON.stringify(disp).slice(0, 400));

        /* ---------- 9. le persone ---------- */
        console.log('\n-- le persone');
        const righeVisibili = () => page.evaluate(() => Array.from(document.querySelectorAll('#tabella-persone tbody tr[data-uid]')).map(tr => tr.dataset.uid));
        let uids = await righeVisibili();
        vero(uids.length === 100 && await testo('#btn-altre-persone') === 'Mostra altre 100' && await testo('#conta-persone') === '(380)'
            && await testo('#persone-mostrate') === 'Ne vedi 100 su 380.' && uids.join() === comeNellaPagina.slice(0, 100).map(p => p.uid).join(),
        'oltre 200 righe se ne vedono 100, in ordine di cognome e nome, con «Mostra altre 100» (ne vedi 100 su 380)');
        await $('#btn-altre-persone').click();
        await $('#btn-altre-persone').click();
        vero((await righeVisibili()).length === 300 && await testo('#btn-altre-persone') === 'Mostra altre 80', 'due volte «Mostra altre»: 300 righe, e il pulsante dice «Mostra altre 80»');
        await $('#btn-altre-persone').click();
        vero((await righeVisibili()).length === 380 && !(await $('#btn-altre-persone').isVisible()), 'alla terza volta tutte le 380, e il pulsante sparisce');
        const intestazioniPersone = await page.evaluate(() => Array.from(document.querySelectorAll('#tabella-persone thead th')).map(th => th.textContent.trim()));
        const primaRiga = await page.evaluate(() => {
            const tr = document.querySelector('#tabella-persone tbody tr[data-uid]');
            return { th: tr.querySelector('th[scope="row"]').innerText.replace(/\n+/g, ' | '), celle: Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()), stato: tr.querySelector('.stato-persona').className };
        });
        const p0 = comeNellaPagina[0];
        vero(intestazioniPersone.slice(0, 9).join('|') === 'Persona|Azienda|Stato|Primo ingresso|Ultima presenza|Minuti in onda|% vista|Collegamenti|Dispositivi'
            && primaRiga.th === p0.nome + ' ' + p0.cognome + ' | ' + p0.email && primaRiga.celle[0] === p0.azienda
            && primaRiga.celle[2] === (p0.primoIngresso ? oraIt(p0.primoIngresso) : '–') && primaRiga.celle[5] === (p0.stato === 'mai-entrato' ? '–' : p0.percentuale + '%'),
        'le colonne: persona (nome e cognome, email sotto), azienda, stato, primo ingresso, ultima presenza, minuti, %, collegamenti, dispositivi: «' + primaRiga.th + '» ' + primaRiga.celle.slice(0, 7).join(' · '),
        JSON.stringify({ intestazioniPersone, primaRiga, p0 }));
        // la ricerca
        await $('#cerca-persone').fill('rossi');
        const attesiRossi = F.persone.filter(p => (p.nome + ' ' + p.cognome + ' ' + p.email + ' ' + p.azienda).toLowerCase().includes('rossi'));
        uids = await righeVisibili();
        vero(uids.length === attesiRossi.length && attesiRossi.every(p => uids.includes(p.uid)) && await testo('#conta-persone') === '(' + attesiRossi.length + ' di 380)',
            'ricerca «rossi» (nome, cognome, email, azienda): ' + uids.length + ' persone, «' + await testo('#conta-persone') + '»');
        await $('#cerca-persone').fill(F.persone[40].email.slice(0, 14).toUpperCase());
        uids = await righeVisibili();
        vero(uids.includes(F.persone[40].uid), 'ricerca per email (anche in maiuscolo): trovata ' + F.persone[40].email);
        await $('#cerca-persone').fill('');
        // il filtro
        const perStato = s => F.persone.filter(p => p.stato === s);
        const opzioni = await page.evaluate(() => Array.from(document.querySelectorAll('#filtro-persone option')).map(o => o.textContent));
        vero(opzioni.join('|') === 'Tutte (380)|Hanno visto (' + perStato('ha-visto').length + ')|Entrate senza vedere (' + perStato('entrato').length + ')|Mai entrate (' + perStato('mai-entrato').length + ')',
            'il filtro per stato, con quante per ognuno: ' + opzioni.join(', '));
        await $('#filtro-persone').selectOption('mai-entrato');
        uids = await righeVisibili();
        vero(uids.length === 44 && await testo('#conta-persone') === '(44 di 380)'
            && await page.evaluate(() => Array.from(document.querySelectorAll('#tabella-persone tbody .stato-persona')).every(s => s.textContent === 'Mai entrata')),
        '«Mai entrate»: 44 persone, tutte con l\'etichetta «Mai entrata»');
        await $('#filtro-persone').selectOption('entrato');
        vero((await righeVisibili()).length === 12, '«Entrate senza vedere»: 12 persone (entrate prima dell\'inizio o solo in pausa)');
        await $('#filtro-persone').selectOption('');
        // l'ordine
        const colonna = async indice => page.evaluate(i => Array.from(document.querySelectorAll('#tabella-persone tbody tr[data-uid]')).map(tr => tr.querySelectorAll('td')[i].textContent.trim()), indice);
        const numeri = v => v.map(x => (x === '–' ? null : Number(x.replace('%', '').replace(/\./g, '').replace(',', '.'))));
        // tutte le righe, per vedere anche il fondo della tabella
        while (await $('#btn-altre-persone').isVisible()) await $('#btn-altre-persone').click();
        await $('#tabella-persone th[data-ordine="minuti"] .ordina').click();
        let valori = numeri(await colonna(4));
        const maxMinuti = Math.max(...F.persone.map(p => Math.round(p.minutiInOnda)));
        vero(valori[0] === maxMinuti && valori.filter(v => v != null).every((v, i, a) => !i || a[i - 1] >= v) && valori.slice(-44).every(v => v === null)
            && await $('#tabella-persone th[data-ordine="minuti"]').getAttribute('aria-sort') === 'descending',
        'clic su «Minuti in onda»: dal più alto (' + maxMinuti + ') in giù, chi non è mai entrato in fondo (aria-sort="descending")', JSON.stringify(valori.slice(0, 8)) + ' … ' + JSON.stringify(valori.slice(-50)));
        await $('#tabella-persone th[data-ordine="minuti"] .ordina').click();
        valori = numeri(await colonna(4));
        vero(valori.length === 380 && valori.filter(v => v != null).every((v, i, a) => !i || a[i - 1] <= v) && valori.slice(-44).every(v => v === null)
            && await $('#tabella-persone th[data-ordine="minuti"]').getAttribute('aria-sort') === 'ascending',
        'secondo clic: dal più basso (aria-sort="ascending"), e chi non è mai entrato resta in fondo');
        await $('#tabella-persone th[data-ordine="primo"] .ordina').click();
        const primi = F.persone.filter(p => p.primoIngresso).map(p => p.primoIngresso).sort((a, b) => a - b);
        vero((await colonna(2))[0] === oraIt(primi[0]), 'clic su «Primo ingresso»: dal primo arrivato (' + oraIt(primi[0]) + ')');
        await $('#tabella-persone th[data-ordine="collegamenti"] .ordina').click();
        valori = numeri(await colonna(6));
        vero(valori.filter(v => v != null).every((v, i, a) => !i || a[i - 1] >= v), 'clic su «Collegamenti»: dal più alto');
        await $('#tabella-persone th[data-ordine="percentuale"] .ordina').click();
        valori = numeri(await colonna(5));
        vero(valori[0] === Math.max(...F.persone.map(p => p.percentuale)) && valori.filter(v => v != null).every((v, i, a) => !i || a[i - 1] >= v), 'clic su «% vista»: dal più alto');
        await $('#tabella-persone th[data-ordine="nome"] .ordina').click();
        vero((await righeVisibili())[0] === comeNellaPagina[0].uid && await $('#tabella-persone th[data-ordine="nome"]').getAttribute('aria-sort') === 'ascending',
            'clic su «Persona»: di nuovo per cognome e nome');
        // la linea del tempo di una persona con tre periodi
        const tre = F.persone.find(p => p.uid === 'u006');
        await $('#cerca-persone').fill(tre.email);
        const bottone = $('#tabella-persone tr[data-uid="u006"] .btn-linea');
        vero(await bottone.getAttribute('aria-expanded') === 'false', 'ogni riga ha il pulsante «Linea del tempo» (aria-expanded="false")');
        await bottone.click();
        const linea = await page.evaluate(() => {
            const r = document.getElementById('linea-tempo-u006');
            if (!r) return null;
            return {
                segmenti: Array.from(r.querySelectorAll('.linea-segmento')).map(s => ({ left: parseFloat(s.style.left), width: parseFloat(s.style.width) })),
                pausa: Array.from(r.querySelectorAll('.linea-pausa')).map(s => ({ left: parseFloat(s.style.left), width: parseFloat(s.style.width) })),
                elenco: Array.from(r.querySelectorAll('.linea-elenco li')).map(li => li.textContent),
                titolo: r.querySelector('.linea-titolo').textContent
            };
        });
        const pct = t => (t - scala.da) / (scala.a - scala.da) * 100;
        const elencoAtteso = tre.segmenti.map(x => 'dalle ' + oraIt(x[0]) + ' alle ' + oraIt(x[1]) + ' (' + durata((x[1] - x[0]) / MIN) + ')').join(' | ');
        vero(linea && await bottone.getAttribute('aria-expanded') === 'true' && linea.segmenti.length === tre.segmenti.length && tre.segmenti.length === 3
            && tre.segmenti.every((s, i) => vicino(linea.segmenti[i].left, pct(s[0]), 0.02) && vicino(linea.segmenti[i].left + linea.segmenti[i].width, pct(s[1]), 0.03))
            && linea.pausa.length === 1 && vicino(linea.pausa[0].left, pct(ora(13, 0)), 0.02)
            && linea.elenco.join(' | ') === elencoAtteso && elencoAtteso.startsWith('dalle 9.02 alle 10.41 (1 h 39 min) | dalle 10.50 alle 12.59 (2 h 9 min) | dalle 14.03 alle ') && !/alle 15\.21/.test(elencoAtteso),
        'la linea del tempo di ' + tre.nome + ' ' + tre.cognome + ': tre periodi (il buco del cron delle 15.21 non spezza il pomeriggio) sulla stessa scala del grafico (dalle 8.30 alle 17.15), la pausa in grigio, e l\'elenco «' + (linea ? linea.elenco.join(', ') : '') + '»', JSON.stringify(linea));
        // la foto della riga con la sua linea del tempo
        const rigaTre = await $('#tabella-persone tr[data-uid="u006"]').boundingBox();
        const lineaTre = await $('#linea-tempo-u006').boundingBox();
        await page.screenshot({ path: path.join(FOTO, 'ascolti-computer-linea-del-tempo.png'), clip: { x: 0, y: rigaTre.y - 60, width: 1440, height: lineaTre.y + lineaTre.height - rigaTre.y + 80 } });
        await bottone.click();
        vero(!(await page.evaluate(() => !!document.getElementById('linea-tempo-u006'))) && await bottone.getAttribute('aria-expanded') === 'false', 'premendo di nuovo la linea del tempo si chiude');
        await bottone.click();
        await $('#cerca-persone').fill('');
        vero(await page.evaluate(() => !!document.getElementById('linea-tempo-u006')), 'la linea del tempo aperta resta aperta anche togliendo la ricerca');

        /* ---------- 10. non collegati ---------- */
        console.log('\n-- non collegati');
        const nonCollegati = comeNellaPagina.filter(p => p.stato === 'mai-entrato' && p.credenziali === 'inviata');
        const nc = await page.evaluate(() => Array.from(document.querySelectorAll('#tabella-non-collegati tbody tr')).map(tr => Array.from(tr.cells).map(c => c.textContent.trim())));
        vero(nonCollegati.length === 30 && await testo('#conta-non-collegati') === '(30)' && nc.length === 30
            && nc.every((r, i) => r[0] === nonCollegati[i].nome + ' ' + nonCollegati[i].cognome && r[1] === nonCollegati[i].email && r[2] === nonCollegati[i].azienda && r[3] === 'inviate'),
        '«Non si sono collegati (30)»: chi ha le credenziali inviate ma non è mai entrato, con nome, email, azienda e credenziali', JSON.stringify(nc.slice(0, 2)));
        vero(await testo('#non-collegati-altri') === 'Non sono entrati nemmeno 14 iscritti che non hanno ancora ricevuto le credenziali: le invii dalla scheda Email.',
            'e a parte, chi non è entrato senza aver ricevuto le credenziali: «' + await testo('#non-collegati-altri') + '»');
        await $('#btn-copia-indirizzi').click();
        await aspetta(async () => await $('#msg-non-collegati').isVisible(), 5000, 'messaggio della copia');
        const appunti = await page.evaluate(() => navigator.clipboard.readText());
        vero(appunti === nonCollegati.map(p => p.email).join('; ') && /^Copiati 30 indirizzi/.test(await testo('#msg-non-collegati')),
            '«Copia gli indirizzi»: negli appunti le 30 email separate da «; », e il messaggio «' + await testo('#msg-non-collegati') + '»', appunti.slice(0, 200));

        /* ---------- 11. esportazione ---------- */
        console.log('\n-- esportazione in Excel');
        const XLSX = await sheetJSNode();
        const [scarico] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), $('#btn-ascolti-esporta').click()]);
        const nomeFile = scarico.suggestedFilename();
        const doveFile = path.join(RISULTATI, 'ascolti-esportazione.xlsx');
        await scarico.saveAs(doveFile);
        const wb = XLSX.read(fs.readFileSync(doveFile), { type: 'buffer' });
        const foglio = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
        vero(/^ascolti-verona-2026-\d{8}-\d{4}\.xlsx$/.test(nomeFile) && JSON.stringify(wb.SheetNames) === JSON.stringify(['Riepilogo', 'Minuto per minuto', 'Programma', 'Persone', 'Non collegati', 'Accessi']),
            'scaricato «' + nomeFile + '» con i sei fogli: ' + wb.SheetNames.join(', '));
        const intestazioni = {
            'Riepilogo': 'Voce|Valore',
            'Minuto per minuto': 'Ora|Spettatori|Stato della diretta',
            'Programma': 'N.|Voce del programma|Dalle|Alle|Media spettatori|Massimo|Minimo|Minuti in onda',
            'Persone': 'Nome|Cognome|Email|Azienda|Stato|Credenziali|Primo ingresso|Ultima presenza|Minuti in onda|% della diretta vista|Collegamenti|Accessi|Dispositivi|Periodi collegati',
            'Non collegati': 'Nome|Cognome|Email|Azienda|Credenziali',
            'Accessi': 'Quando|Email|Nome|Cognome|Azienda|Dispositivo'
        };
        Object.keys(intestazioni).forEach(n => {
            vero(foglio(n)[0].join('|') === intestazioni[n], 'foglio «' + n + '»: ' + intestazioni[n].split('|').join(', '), foglio(n)[0].join('|'));
        });
        const fr = foglio('Riepilogo');
        const voceR = v => (fr.find(r => r[0] === v) || [])[1];
        const fm = foglio('Minuto per minuto');
        const fpers = foglio('Persone');
        const fprog = foglio('Programma');
        const iPicco = F.curva.findIndex(p => p.t === k.picco.t);
        vero(voceR('Iscritti') === 380 && voceR('Picco di spettatori') === k.picco.n && voceR('Ora del picco') === oraXls(k.picco.t)
            && voceR('Minimo in onda') === k.minimo.n && voceR('Media spettatori (minuti in onda)') === k.media && voceR('Data') === 'venerdì 2 ottobre 2026'
            && voceR('Dati calcolati il') === '02/10/2026 17:20' && fr.some(r => /^Spettatore in un minuto/.test(r[0])),
        'Riepilogo: i numeri (picco ' + voceR('Picco di spettatori') + ' alle ' + voceR('Ora del picco') + ', media ' + voceR('Media spettatori (minuti in onda)') + '), date e ore italiane e le definizioni');
        vero(fm.length === F.curva.length + 1 && fm[iPicco + 1].join('|') === oraXls(k.picco.t) + '|' + k.picco.n + '|In onda' && fm[1][2] === 'Prima della diretta',
            'Minuto per minuto: ' + (fm.length - 1) + ' righe (una per minuto fotografato), ore «' + fm[1][0] + '», numeri e stato');
        vero(fprog.length === 14 && fprog[iMigliore + 1][4] === maxMedia && fprog[7][4] === '' && fprog[1][2] === '09:00' && fprog[13][3] === '17:00',
            'Programma: 13 voci con orari, media (vuota per la pausa pranzo), massimo, minimo e minuti');
        const riga6 = fpers.find(r => r[2] === tre.email);
        vero(fpers.length === 381 && riga6 && riga6[4] === 'Ha visto' && riga6[13] === tre.segmenti.map(x => oraXls(x[0]) + '-' + oraXls(x[1])).join(', ') && riga6[6] === '02/10/2026 ' + oraXls(tre.primoIngresso),
            'Persone: 380 righe, con stato, ingressi in data e ora italiane e i periodi collegati («' + (riga6 ? riga6[13] : '') + '»)');
        vero(foglio('Non collegati').length === 31 && foglio('Accessi').length === F.accessi.length + 1,
            'Non collegati: 30 righe; Accessi: ' + F.accessi.length + ' righe');
        vero(/^Scaricato «ascolti-verona-2026-/.test(await testo('#msg-ascolti')), 'e la pagina lo dice: «' + (await testo('#msg-ascolti')).slice(0, 80) + '…»');

        await $('#ascolti-dati-grafico > summary').click();
        await foto('ascolti-computer-dettagli');
        await $('#ascolti-dati-grafico > summary').click();

        /* ---------- 12. stampa ---------- */
        console.log('\n-- stampa');
        await page.evaluate(() => { window.__stampe = 0; window.print = () => { window.__stampe++; }; });
        await $('#btn-ascolti-stampa').click();
        vero(await page.evaluate(() => window.__stampe) === 1, '«Stampa il riepilogo» chiama window.print()');
        await page.emulateMedia({ media: 'print' });
        const stampa = await page.evaluate(() => {
            const vis = s => { const n = document.querySelector(s); if (!n) return false; const r = n.getBoundingClientRect(); return getComputedStyle(n).display !== 'none' && r.width > 0 && r.height > 0; };
            return {
                testata: vis('.testata'), scheda: vis('#scheda-ascolti'), grafico: vis('#ascolti-cornice svg'), ingressi: vis('#ingressi-cornice svg'),
                tessere: vis('#ascolti-tessere'), programma: vis('#tabella-programma'), nonCollegati: vis('#tabella-non-collegati'),
                pulsanti: Array.from(document.querySelectorAll('#scheda-ascolti button')).filter(b => b.getBoundingClientRect().width > 0).length,
                campi: vis('#cerca-persone'), persone: vis('#riquadro-persone'), notaStampa: vis('#scheda-ascolti .solo-stampa'),
                altre: ['#scheda-evento', '#scheda-regia', '#scheda-partecipanti'].some(vis)
            };
        });
        vero(!stampa.testata && stampa.scheda && stampa.grafico && stampa.ingressi && stampa.tessere && stampa.programma && stampa.nonCollegati
            && stampa.pulsanti === 0 && !stampa.campi && !stampa.persone && stampa.notaStampa && !stampa.altre,
        'in stampa (media print): solo la scheda Ascolti, senza testata, pulsanti e campi; tessere, grafico (anche quello degli ingressi), programma e non collegati ci sono; l\'elenco delle persone rimanda al file Excel',
        JSON.stringify(stampa));
        await page.setViewportSize({ width: 1123, height: 794 });
        await pausa(300);
        await page.screenshot({ path: path.join(FOTO, 'ascolti-stampa.png'), fullPage: true });
        await page.pdf({ path: path.join(RISULTATI, 'ascolti-stampa.pdf'), landscape: true, format: 'A4', printBackground: true }).catch(() => {});
        await page.emulateMedia({ media: 'screen' });
        await page.setViewportSize({ width: 1440, height: 900 });
        await pausa(300);

        /* ---------- 13. aggiornamento automatico ---------- */
        console.log('\n-- aggiornamento automatico');
        /* l'orologio della pagina si ferma: da qui il tempo lo fa passare la
           prova (runFor), cosi' i conteggi delle chiamate sono esatti */
        await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
        await aspetta(async () => !(await page.evaluate(() => document.querySelector('#scheda-ascolti').classList.contains('in-aggiornamento'))), 10000, 'nessuna lettura in corso');
        risposta = Object.assign({}, F, { calcolato: ora(17, 21) });
        let n0 = chiamateAscolti.length;
        await page.clock.runFor(61000);
        await aspetta(async () => chiamateAscolti.length === n0 + 1 && await testo('#ascolti-aggiornato') === 'Aggiornato alle 17.21 · si aggiorna da solo ogni minuto', 10000, 'aggiornamento dopo 60 s');
        vero(true, 'con la scheda aperta, dopo 60 secondi arriva da solo il risultato nuovo: «' + await testo('#ascolti-aggiornato') + '»');
        vero(await page.evaluate(() => !!document.getElementById('linea-tempo-u006')) && await $('#filtro-persone').inputValue() === '',
            'dopo l\'aggiornamento la linea del tempo aperta resta aperta');
        await $('#tab-partecipanti').click();
        n0 = chiamateAscolti.length;
        await page.clock.runFor(130000);
        await pausa(500);
        vero(chiamateAscolti.length === n0, 'con un\'altra scheda aperta, in 130 secondi nessuna chiamata \'ascolti\'');
        await $('#tab-ascolti').click();
        await aspetta(async () => chiamateAscolti.length === n0 + 1, 10000, 'ricarica tornando alla scheda');
        vero(true, 'tornando alla scheda Ascolti i dati si rileggono subito');
        await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        n0 = chiamateAscolti.length;
        await page.clock.runFor(125000);
        await pausa(500);
        vero(chiamateAscolti.length === n0, 'con la finestra nascosta (visibilityState "hidden") il giro non chiama il servizio');
        await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await aspetta(async () => chiamateAscolti.length === n0 + 1, 10000, 'ricarica tornando visibile');
        vero(true, 'tornando visibile dopo più di un minuto: subito i dati di adesso');
        n0 = chiamateAscolti.length;
        await $('#btn-ascolti-aggiorna').click();
        await aspetta(async () => chiamateAscolti.length === n0 + 1, 10000, '«Aggiorna adesso»');
        vero(true, '«Aggiorna adesso» rilegge subito');
        await page.clock.resume();

        /* ---------- 14. registrazione non ancora attiva ---------- */
        console.log('\n-- registrazione non ancora attiva');
        risposta = FS;
        await $('#btn-ascolti-aggiorna').click();
        await aspetta(async () => await $('#ascolti-grafico-vuoto').isVisible(), 10000, 'frase senza registrazione');
        const frase = await testo('#ascolti-grafico-vuoto');
        vero(frase.startsWith('I dati minuto per minuto si registrano da quando la diretta è in finestra:') && !(await $('#ascolti-grafico').isVisible())
            && await page.locator('#ascolti-cornice svg').count() === 0,
        'registrazione.attiva=false: al posto del grafico «' + frase.slice(0, 150) + '…»');
        vero(await testo('#ascolti-tessere [data-voce="picco"] .tessera-num') === '–' && await testo('#ascolti-tessere [data-voce="iscritti"] .tessera-num') === '380'
            && (await righeVisibili()).length === 100 && await testo('#conta-non-collegati') === '(30)' && await $('#ascolti-ingressi-vuoto').isVisible()
            && (await page.evaluate(() => document.querySelectorAll('#tabella-programma tbody tr').length)) === 13
            && await testo('#programma-nota') === 'Media, massimo e minimo di ogni voce compaiono con i dati minuto per minuto.',
        'il resto sì: tessere (picco «–»), programma (con la nota: le medie arrivano con i dati minuto per minuto), persone, non collegati; gli ingressi dicono che arriveranno con la prima fotografia');
        await $('#cerca-persone').fill(tre.email);
        const senzaSeg = await page.evaluate(() => { const r = document.getElementById('linea-tempo-u006'); return r ? r.textContent : ''; });
        vero(/I periodi minuto per minuto si vedono da quando si registrano le fotografie/.test(senzaSeg), 'e la linea del tempo aperta lo dice');
        await $('#cerca-persone').fill('');
        await foto('ascolti-senza-dati-computer');
        risposta = Object.assign({}, F, { calcolato: ora(17, 22) });
        await $('#btn-ascolti-aggiorna').click();
        await aspetta(async () => await page.locator('#ascolti-cornice svg').count() === 1, 10000, 'di nuovo il grafico');

        /* ---------- 14b. la risposta del servizio vero ----------
           L'evento di Verona sul servizio vero non ha ancora iscritti ne'
           fotografie: la pagina deve mostrare la risposta vera di 'ascolti'
           (lib/diretta-ascolti.js) senza errori, con la frase al posto del
           grafico e gli zeri. */
        console.log('\n-- la risposta del servizio vero');
        finta = false;
        const vera = page.waitForResponse(r => /\/api\/diretta-gestione$/.test(r.url()) && r.request().method() === 'POST' && /"azione":"ascolti"/.test(r.request().postData() || ''), { timeout: 20000 });
        await $('#btn-ascolti-aggiorna').click();
        const rispostaVera = await (await vera).json().catch(() => null);
        await aspetta(async () => (await testo('#ascolti-tessere [data-voce="iscritti"] .tessera-num')) === '0', 15000, 'tessere dal servizio vero');
        vero(rispostaVera && rispostaVera.ok === true && rispostaVera.registrazione && rispostaVera.registrazione.attiva === false && Array.isArray(rispostaVera.curva)
            && await $('#ascolti-grafico-vuoto').isVisible() && await testo('#conta-persone') === '' && await testo('#persone-vuoto') === 'Nessun iscritto a questo evento.'
            && await testo('#ascolti-dispositivi') === 'Ancora nessun accesso con email e password.',
        'con la risposta vera del servizio (evento senza iscritti né fotografie): tessere a zero, la frase al posto del grafico, «Nessun iscritto a questo evento.»',
        JSON.stringify(rispostaVera).slice(0, 300));
        finta = true;
        risposta = Object.assign({}, F, { calcolato: ora(17, 23) });
        await $('#btn-ascolti-aggiorna').click();
        await aspetta(async () => await page.locator('#ascolti-cornice svg').count() === 1, 10000, 'di nuovo la fixture');

        /* ---------- 15. telefono ---------- */
        console.log('\n-- telefono 390x844');
        await page.setViewportSize({ width: 390, height: 844 });
        await pausa(600);
        const tel = await page.evaluate(() => {
            const s = document.querySelector('#ascolti-cornice').parentElement;
            return {
                pagina: document.documentElement.scrollWidth, finestra: window.innerWidth,
                graficoScorre: s.scrollWidth > s.clientWidth, larghezzaSvg: document.querySelector('#ascolti-cornice svg').getBoundingClientRect().width,
                schede: getComputedStyle(document.querySelector('#tabella-persone tbody tr')).display === 'grid',
                compatta: getComputedStyle(document.querySelector('#tabella-curva')).display,
                troppoLarghi: Array.from(document.querySelectorAll('#scheda-ascolti *')).filter(n => {
                    if (n.closest('.grafico-scorri') && n !== document.querySelector('#ascolti-cornice').parentElement && n !== document.querySelector('#ingressi-cornice').parentElement) return false;
                    if (n.closest('details:not([open])') || n.closest('.solo-lettori')) return false;
                    const r = n.getBoundingClientRect();
                    return r.width > 0 && r.right > window.innerWidth + 1;
                }).map(n => n.tagName + '#' + n.id + '.' + n.className).slice(0, 5)
            };
        });
        vero(tel.pagina <= tel.finestra && tel.troppoLarghi.length === 0, '390px: niente scorrimento orizzontale della pagina (larga ' + tel.pagina + 'px)', JSON.stringify(tel));
        vero(tel.graficoScorre && tel.larghezzaSvg >= 640 && tel.schede && tel.compatta === 'table',
            'sul telefono il grafico resta leggibile (640px) e scorre di lato dentro il suo riquadro; le tabelle diventano schede (quelle dei dati del grafico restano tabelle)', JSON.stringify(tel));
        // il tocco sul telefono: il minimo (il grafico scorre fino a lui)
        await page.locator('#ascolti-cornice .g-minimo circle').scrollIntoViewIfNeeded();
        const cerchio = await page.locator('#ascolti-cornice .g-minimo circle').boundingBox();
        await page.touchscreen.tap(cerchio.x + cerchio.width / 2, cerchio.y + cerchio.height / 2);
        rq = await riquadrino();
        const dentro = await page.evaluate(() => {
            const r = document.querySelector('#ascolti-suggerimento').getBoundingClientRect();
            const c = document.querySelector('#ascolti-cornice').getBoundingClientRect();
            return r.left >= c.left - 1 && r.right <= c.right + 1;
        });
        vero(rq.visibile && rq.testo.startsWith(riga(k.minimo)) && dentro, 'sul telefono, toccando il minimo: «' + rq.testo + '» (il riquadrino resta dentro il grafico)');
        await $('#ascolti-riepilogo-titolo').click();
        await page.evaluate(() => { document.querySelectorAll('.grafico-scorri').forEach(s => { s.scrollLeft = 0; }); });
        await pausa(200);
        await foto('ascolti-telefono');
        await page.setViewportSize({ width: 1440, height: 900 });
        await pausa(300);

        /* ---------- 16. errori ---------- */
        const csp = await page.evaluate(() => window.__violazioniCSP);
        vero(csp.length === 0, 'nessuna violazione della Content-Security-Policy', csp.join('\n'));
        vero(erroriPagina.length === 0, 'nessun errore JavaScript nella pagina', erroriPagina.join('\n'));
        vero(erroriConsole.length === 0, 'nessun errore in console', erroriConsole.join('\n'));
    } catch (e) {
        rossi++;
        console.log('ROSSO la prova si è interrotta: ' + (e && e.stack || e));
        if (pagina) await pagina.screenshot({ path: path.join(RISULTATI, 'ascolti-pagina-interrotta.png'), fullPage: true }).catch(() => {});
        if (server && server.uscita) console.log('--- ultime righe del servizio ---\n' + server.uscita.slice(-2000));
    } finally {
        if (browser) await browser.close().catch(() => {});
        await ferma(server);
        await ferma(emulatori);
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi (' + Math.round((Date.now() - t0) / 1000) + ' s)');
    console.log('screenshot in ' + path.relative(process.cwd(), FOTO));
    process.exit(rossi ? 1 : 0);
})();
