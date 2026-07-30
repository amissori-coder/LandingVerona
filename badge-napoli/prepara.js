/* ============================================================
   PREPARA - codici personali, badge stampabili, agende da pubblicare
   ------------------------------------------------------------
   Gira sul computer, non sul server. Non chiede credenziali e non
   scrive su Firestore: produce solo file dentro "out/".

       node prepara.js partecipanti.json
       node prepara.js iscritti.csv

   Cosa esce, in out/:
     - badge.html    da aprire nel browser e stampare in PDF (A4, 8 per foglio)
     - agende.json   quello che pubblica.js manda su Firestore
     - codici.csv    nome, email, codice e link, per la mail agli ospiti
     - codici.json   registro dei codici assegnati (NON cancellare, vedi sotto)

   PERCHE' codici.json NON VA CANCELLATO
   Il codice e' stampato sul badge. Se rilanciamo lo script dopo aver
   deciso gli abbinamenti e i codici cambiassero, i badge stampati
   punterebbero al vuoto. Quindi il registro viene riletto ogni volta e
   chi c'e' gia' si tiene il suo codice: solo le persone nuove ne
   ricevono uno. Lo script si puo' rilanciare quante volte serve.

   COSA NON FINISCE NELLE AGENDE
   Su Firestore vanno soltanto nome, azienda, ruolo, tavolo e orari.
   Mai email e mai telefono: l'agenda si apre senza password, quindi
   deve contenere solo cio' che e' comunque scritto sul badge della
   persona. Le email restano in codici.csv, che resta sul computer.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QR = require('qrcode');

/* ---------- da regolare qui ---------- */

const BASE = 'https://nextgenerationbusiness.it/n26/#';
const LUNGHEZZA_CODICE = 10;

/* Alfabeto senza 0 1 i l o: a stampa si confondono e il codice va
   anche digitato a mano da chi ha il QR piegato o la fotocamera lenta. */
const ALFABETO = '23456789abcdefghjkmnpqrstuvwxyz';

/* Colore della fascia sul badge per profilo. Serve a capire in mezzo
   secondo con chi si sta parlando, quindi i quattro colori devono
   restare ben distinti anche stampati in bianco e nero: per questo il
   profilo e' scritto anche a parole accanto alla fascia. */
const PROFILI = {
    impresa:  { etichetta: 'Impresa',              colore: '#164068' },
    studio:   { etichetta: 'Studio professionale', colore: '#2c6ca8' },
    banca:    { etichetta: 'Banca / Investitore',  colore: '#1f6b57' },
    ente:     { etichetta: 'Ente / Associazione',  colore: '#4d5b6b' },
    ospite:   { etichetta: 'Ospite',               colore: '#6b7280' }
};

const CARTELLA_OUT = path.join(__dirname, 'out');
const FILE_REGISTRO = path.join(CARTELLA_OUT, 'codici.json');

/* ---------- utilita' ---------- */

function testo(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}

function fuga(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function aGruppi(codice) {
    return codice.replace(/(.{4})(?=.)/g, '$1-');
}

/* Chiave della persona: l'email quando c'e', altrimenti nome piu' azienda.
   Serve a ritrovare chi ha gia' un codice quando si rilancia lo script. */
function chiavePersona(p) {
    const email = testo(p.email, 200).toLowerCase();
    if (email) return 'e:' + email;
    return 'n:' + [p.nome, p.cognome, p.azienda].map(x => testo(x, 80).toLowerCase()).join('|');
}

function nuovoCodice(giaUsati) {
    for (let tentativo = 0; tentativo < 200; tentativo++) {
        const byte = crypto.randomBytes(LUNGHEZZA_CODICE);
        let c = '';
        for (let i = 0; i < LUNGHEZZA_CODICE; i++) c += ALFABETO[byte[i] % ALFABETO.length];
        if (!giaUsati.has(c)) return c;
    }
    throw new Error('Non riesco a generare un codice non ancora usato.');
}

/* ---------- lettura dei partecipanti ---------- */

/* CSV con le virgolette e il separatore riconosciuto da solo: i fogli
   Google esportano con la virgola, quelli salvati da Excel in italiano
   con il punto e virgola. */
function leggiCsv(contenuto) {
    const righe = [];
    let campo = '', riga = [], dentroVirgolette = false;
    const testoPulito = contenuto.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

    const primaRiga = testoPulito.split('\n')[0] || '';
    const sep = (primaRiga.split(';').length > primaRiga.split(',').length) ? ';' : ',';

    for (let i = 0; i < testoPulito.length; i++) {
        const c = testoPulito[i];
        if (dentroVirgolette) {
            if (c === '"') {
                if (testoPulito[i + 1] === '"') { campo += '"'; i++; }
                else dentroVirgolette = false;
            } else campo += c;
        } else if (c === '"') {
            dentroVirgolette = true;
        } else if (c === sep) {
            riga.push(campo); campo = '';
        } else if (c === '\n') {
            riga.push(campo); righe.push(riga); riga = []; campo = '';
        } else campo += c;
    }
    if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga); }

    if (!righe.length) return [];

    // intestazioni normalizzate: "Nome", "nome ", "NOME" diventano "nome"
    const intestazioni = righe[0].map(h =>
        testo(h, 60).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z]/g, '')
    );

    return righe.slice(1)
        .filter(r => r.some(c => testo(c, 200)))
        .map(r => {
            const o = {};
            intestazioni.forEach((h, i) => { if (h) o[h] = r[i]; });
            return o;
        });
}

function leggiPartecipanti(fileIngresso) {
    const contenuto = fs.readFileSync(fileIngresso, 'utf8');

    if (/\.json$/i.test(fileIngresso)) {
        const dati = JSON.parse(contenuto);
        const elenco = Array.isArray(dati) ? dati : (dati.partecipanti || []);
        if (!Array.isArray(elenco)) throw new Error('Nel JSON manca l\'elenco "partecipanti".');
        return elenco;
    }

    return leggiCsv(contenuto).map(r => ({
        nome:     r.nome || '',
        cognome:  r.cognome || '',
        email:    r.email || r.posta || '',
        azienda:  r.azienda || r.aziendastudio || r.societa || '',
        ruolo:    r.ruolo || r.qualifica || '',
        profilo:  r.profilo || '',
        tavolo:   r.tavolo || '',
        incontri: []
    }));
}

/* ---------- costruzione ---------- */

function nomeCompleto(p) {
    return [testo(p.nome, 120), testo(p.cognome, 120)].filter(Boolean).join(' ');
}

function profiloDi(p) {
    const chiave = testo(p.profilo, 40).toLowerCase();
    return PROFILI[chiave] ? chiave : 'ospite';
}

/* La scheda che finisce su Firestore. Whitelist esplicita: qualunque
   campo in piu' presente nel file di ingresso viene lasciato fuori,
   cosi non ci ritroviamo email o telefoni pubblicati per distrazione. */
function schedaAgenda(p) {
    const incontri = (Array.isArray(p.incontri) ? p.incontri : []).map(inc => ({
        ora:     testo(inc.ora, 10),
        tavolo:  testo(inc.tavolo, 10),
        chi:     testo(inc.chi, 120),
        azienda: testo(inc.azienda, 160),
        ruolo:   testo(inc.ruolo, 120),
        tema:    testo(inc.tema, 80)
    })).sort((a, b) => a.ora.localeCompare(b.ora, 'it', { numeric: true }));

    return {
        nome:    nomeCompleto(p),
        azienda: testo(p.azienda, 160),
        ruolo:   testo(p.ruolo, 120),
        tavolo:  testo(p.tavolo, 10),
        incontri: incontri
    };
}

/* ---------- badge stampabili ---------- */

function paginaBadge(voci) {
    const badge = voci.map(v => {
        const prof = PROFILI[v.profilo];
        return `
    <div class="badge">
      <div class="fascia" style="background:${prof.colore}"></div>
      <div class="testa">
        <span class="evento">Next Generation Business &middot; Napoli, 2 ottobre 2026</span>
      </div>
      <div class="corpo">
        <div class="chi">
          <p class="nome">${fuga(v.nome)}</p>
          <p class="azienda">${fuga(v.azienda)}</p>
          <p class="ruolo">${fuga(v.ruolo)}</p>
        </div>
        <div class="qr">
          ${v.qr}
          <p class="codice">${fuga(aGruppi(v.codice))}</p>
        </div>
      </div>
      <div class="piede" style="color:${prof.colore}">
        <span class="profilo">${fuga(prof.etichetta)}</span>
        <span class="istruzione">Inquadra il QR: dentro c'&egrave; la tua agenda B2B</span>
      </div>
    </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Badge - Napoli 2 ottobre 2026</title>
<style>
  /* Misure in millimetri: quello che si vede a schermo e' quello che esce
     dalla stampante. Stampare senza adattamento alla pagina ("scala 100%"),
     altrimenti il QR rimpicciolisce e la lettura diventa incerta. */
  @page { size: A4 portrait; margin: 8mm; }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #fff;
    color: #16202e;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 0;
  }

  .badge {
    width: 96mm;
    height: 68mm;
    border: 0.2mm dashed #b9c2cc;   /* traccia per il taglio */
    padding: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .fascia { height: 4mm; flex: 0 0 4mm; }

  .testa { padding: 2.5mm 4mm 0; }

  .evento {
    font-size: 6pt;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #78838f;
  }

  .corpo {
    flex: 1;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 3mm;
    padding: 1.5mm 4mm 0;
  }

  .chi { flex: 1; min-width: 0; padding-top: 1mm; }

  .nome {
    font-size: 15pt;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.01em;
    overflow-wrap: break-word;
  }

  .azienda { font-size: 10pt; font-weight: 600; color: #16202e; margin-top: 1.2mm; line-height: 1.2; }
  .ruolo   { font-size: 8.5pt; color: #5b6878; margin-top: 0.6mm; line-height: 1.2; }

  /* Il QR non deve mai scendere sotto i 28 mm di lato e vuole intorno a se'
     una cornice bianca di quattro moduli, che la libreria disegna da sola
     con l'opzione "margin: 4". Se il grafico lo appiccica al bordo del
     badge, la fotocamera fatica. */
  .qr { flex: 0 0 30mm; text-align: center; }
  .qr svg { width: 30mm; height: 30mm; display: block; }

  .codice {
    font-family: Consolas, ui-monospace, monospace;
    font-size: 7.5pt;
    letter-spacing: 0.08em;
    color: #16202e;
    margin-top: 0.4mm;
    text-transform: uppercase;
  }

  .piede {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 3mm;
    padding: 1.5mm 4mm 2.5mm;
  }

  .profilo { font-size: 8pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
  .istruzione { font-size: 6.5pt; color: #78838f; }

  /* Il promemoria non si stampa: serve solo a chi apre il file. */
  .promemoria { width: 100%; padding: 0 0 4mm; font-size: 9pt; color: #5b6878; }
  .promemoria b { color: #164068; }
  @media print { .promemoria { display: none; } }
</style>
</head>
<body>

<div class="promemoria">
  <b>Prima di stampare tutto:</b> stampa questa prima pagina e prova i QR con tre telefoni diversi,
  uno dei quali vecchio. Stampa a scala 100% (senza "adatta alla pagina") e su carta non lucida:
  la plastificazione brillante fa riflettere il flash e blocca la lettura.
</div>

${badge}

</body>
</html>`;
}

/* ---------- avvio ---------- */

async function principale() {
    const fileIngresso = process.argv[2] || 'partecipanti.json';
    const percorso = path.isAbsolute(fileIngresso) ? fileIngresso : path.join(__dirname, fileIngresso);

    if (!fs.existsSync(percorso)) {
        console.error('Non trovo il file "' + fileIngresso + '".');
        console.error('Uso: node prepara.js partecipanti.json   (oppure un CSV esportato dal foglio)');
        console.error('C\'e\' un esempio pronto in partecipanti.esempio.json: copialo in partecipanti.json.');
        process.exit(1);
    }

    const partecipanti = leggiPartecipanti(percorso);
    if (!partecipanti.length) {
        console.error('Il file non contiene partecipanti.');
        process.exit(1);
    }

    fs.mkdirSync(CARTELLA_OUT, { recursive: true });

    // registro dei codici gia' assegnati: chi c'e' si tiene il suo
    let registro = {};
    if (fs.existsSync(FILE_REGISTRO)) {
        try { registro = JSON.parse(fs.readFileSync(FILE_REGISTRO, 'utf8')) || {}; }
        catch (e) {
            console.error('codici.json non e\' leggibile. Non procedo: rischierei di cambiare i codici gia\' stampati.');
            process.exit(1);
        }
    }
    const giaUsati = new Set(Object.values(registro));

    const agende = {};
    const voci = [];
    const righeCsv = [['nome', 'cognome', 'email', 'azienda', 'codice', 'link']];
    let nuovi = 0, senzaNome = 0;

    for (const p of partecipanti) {
        const nome = nomeCompleto(p);
        if (!nome) { senzaNome++; continue; }

        const chiave = chiavePersona(p);
        if (!registro[chiave]) {
            registro[chiave] = nuovoCodice(giaUsati);
            giaUsati.add(registro[chiave]);
            nuovi++;
        }
        const codice = registro[chiave];
        const link = BASE + codice;

        agende[codice] = schedaAgenda(p);

        voci.push({
            nome: nome,
            azienda: testo(p.azienda, 160),
            ruolo: testo(p.ruolo, 120),
            profilo: profiloDi(p),
            codice: codice,
            qr: await QR.toString(link, {
                type: 'svg',
                errorCorrectionLevel: 'M',   // con la H il codice diventa piu' denso senza servire
                margin: 4,                   // cornice bianca obbligatoria, quattro moduli
                color: { dark: '#000000', light: '#ffffff' }
            })
        });

        righeCsv.push([
            testo(p.nome, 120), testo(p.cognome, 120), testo(p.email, 200).toLowerCase(),
            testo(p.azienda, 160), codice, link
        ]);
    }

    // ordine alfabetico: cosi in sala i badge si trovano a mano
    voci.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));

    fs.writeFileSync(FILE_REGISTRO, JSON.stringify(registro, null, 2), 'utf8');
    fs.writeFileSync(path.join(CARTELLA_OUT, 'agende.json'), JSON.stringify(agende, null, 2), 'utf8');
    fs.writeFileSync(path.join(CARTELLA_OUT, 'badge.html'), paginaBadge(voci), 'utf8');
    fs.writeFileSync(
        path.join(CARTELLA_OUT, 'codici.csv'),
        '\uFEFF' + righeCsv.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n'),
        'utf8'
    );

    const conIncontri = Object.values(agende).filter(a => a.incontri.length).length;
    const lunghezzaLink = (BASE + 'x'.repeat(LUNGHEZZA_CODICE)).length;

    console.log('');
    console.log('Fatto. In out/ trovi badge.html, agende.json, codici.csv e codici.json');
    console.log('  partecipanti      ' + voci.length + (senzaNome ? '  (' + senzaNome + ' righe senza nome, saltate)' : ''));
    console.log('  codici nuovi      ' + nuovi + '   (gli altri erano gia\' nel registro)');
    console.log('  con appuntamenti  ' + conIncontri + ' su ' + voci.length);
    console.log('  fogli A4          ' + Math.ceil(voci.length / 8) + '  (8 badge per foglio)');
    console.log('  link nel QR       ' + lunghezzaLink + ' caratteri' + (lunghezzaLink > 60 ? '  ATTENZIONE: sopra i 60, il QR diventa denso' : ''));
    if (conIncontri < voci.length) {
        console.log('');
        console.log('Nota: chi non ha appuntamenti vedra\' la pagina con l\'invito a passare al desk.');
        console.log('I badge si possono stampare comunque, gli incontri si aggiungono dopo con un nuovo lancio.');
    }
    console.log('');
}

principale().catch(e => {
    console.error('Errore: ' + (e && e.message ? e.message : e));
    process.exit(1);
});
