/* ============================================================
   Circolarizzazioni via PEC: configurazione, regole e testi
   ------------------------------------------------------------
   I team di revisione mandano le lettere di circolarizzazione
   (richieste di conferma esterna, ISA Italia 505) dall'area
   riservata: una PEC per destinatario, con la lettera in PDF, e
   fino a due solleciti programmati al momento dell'invio.

   Qui c'e' solo quello che non tocca ne' la rete ne' il database:
   la casella da cui si spedisce, i limiti, le date, i controlli sui
   dati che arrivano dall'area riservata e i testi dei tre messaggi.
   Cosi' si prova riga per riga (prove/circolarizzazioni.prove.js).

   LA CASELLA E' UN'ALTRA rispetto agli inviti agli eventi
   (PEC_SMTP_*): le circolarizzazioni partono da una casella PEC
   dedicata, CIRC_PEC_*, perche' li' arrivano le risposte dei terzi,
   che sono elementi probativi della revisione e non devono
   mescolarsi con altra posta.
   ============================================================ */
'use strict';

const crypto = require('crypto');

const s = v => String(v == null ? '' : v).trim();
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

/* ---------- la casella ---------- */
function configurazione() {
    const utente = s(process.env.CIRC_PEC_USER);
    return {
        utente: utente,
        password: String(process.env.CIRC_PEC_PASS || ''),
        // il mittente di una PEC DEVE essere la casella: il gestore rifiuta ogni altro indirizzo
        mittente: s(process.env.CIRC_PEC_FROM_EMAIL) || utente,
        nome: s(process.env.CIRC_PEC_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n"]/g, ' ').slice(0, 80),
        smtpHost: s(process.env.CIRC_PEC_SMTP_HOST) || 'smtps.pec.aruba.it',
        smtpPorta: Number(process.env.CIRC_PEC_SMTP_PORT) || 465,
        imapHost: s(process.env.CIRC_PEC_IMAP_HOST) || 'imaps.pec.aruba.it',
        imapPorta: Number(process.env.CIRC_PEC_IMAP_PORT) || 993,
        // con la verifica in due passaggi Aruba vuole una password dedicata ai programmi di posta
        imapUtente: s(process.env.CIRC_PEC_IMAP_USER) || utente,
        imapPassword: String(process.env.CIRC_PEC_IMAP_PASS || process.env.CIRC_PEC_PASS || ''),
        cartella: s(process.env.CIRC_PEC_IMAP_CARTELLA) || 'INBOX'
    };
}
function configurato() {
    const c = configurazione();
    return !!(c.utente && c.password && c.mittente);
}

/* ---------- i limiti ----------
   Un PDF per lettera. 5 MB bastano per una lettera firmata e passata allo
   scanner; oltre, quasi sempre e' una scansione a colori ad alta risoluzione
   che il destinatario fatica ad aprire. Il file sale a pezzi (PEZZO_BYTE)
   perche' una richiesta al servizio non puo' superare 4,5 MB e un documento
   Firestore 1 MB. */
function numero(v, predefinito, min, max) {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : predefinito;
}
const LIMITI = {
    get pdfMaxByte() { return Math.round(numero(process.env.CIRC_PDF_MAX_MB, 5, 0.2, 15) * 1024 * 1024); },
    pezzoByte: 600 * 1024,
    // le risposte: un allegato piu' grande di cosi' si apre dalla casella PEC
    get rispostaMaxByte() { return Math.round(numero(process.env.CIRC_RISPOSTA_MAX_MB, 20, 1, 60) * 1024 * 1024); },
    scaricoByte: 2 * 1024 * 1024,          // quanti byte per chiamata quando si scarica un messaggio o un allegato
    get perGiro() { return Math.round(numero(process.env.CIRC_MAX_GIRO, 80, 1, 400)); },
    get perOra() { return Math.round(numero(process.env.CIRC_MAX_ORA, 400, 1, 5000)); },
    get pausaMs() { return Math.round(numero(process.env.CIRC_PAUSA_MS, 1200, 0, 10000)); },
    oraSollecito: 9                         // i solleciti partono alle 9 del giorno indicato (ora italiana)
};

/* ---------- le categorie dei destinatari ----------
   Servono a tre cose: ordinare le tabelle, dire nel testo della PEC che cosa
   si chiede di confermare, e proporre la carta di lavoro giusta. `oggetto`
   completa la frase "la richiesta di conferma ...". */
const CATEGORIE = {
    banca: { nome: 'Istituto di credito', oggetto: 'dei rapporti bancari intrattenuti con la Società (saldi, affidamenti, garanzie e firme autorizzate)' },
    finanziatore: { nome: 'Ente finanziatore', oggetto: 'dei finanziamenti e degli altri rapporti in essere con la Società' },
    posta: { nome: 'Amministrazione postale', oggetto: 'dei rapporti di conto intrattenuti con la Società' },
    leasing: { nome: 'Società di leasing', oggetto: 'dei contratti di locazione finanziaria in essere con la Società' },
    factor: { nome: 'Società di factoring', oggetto: 'dei rapporti di factoring in essere con la Società' },
    assicurazione: { nome: 'Compagnia assicurativa', oggetto: 'delle coperture assicurative e dei rapporti in essere con la Società' },
    legale: { nome: 'Consulente legale', oggetto: 'delle controversie, delle passività potenziali e dei compensi maturati' },
    fiscale: { nome: 'Consulente fiscale', oggetto: 'delle posizioni fiscali, dei contenziosi e dei compensi maturati' },
    lavoro: { nome: 'Consulente del lavoro', oggetto: 'delle posizioni in materia di lavoro, dei contenziosi e dei compensi maturati' },
    depositario: { nome: 'Depositario di merci', oggetto: 'delle merci e dei beni della Società in giacenza presso di Voi' },
    correlata: { nome: 'Parte correlata o società del gruppo', oggetto: 'dei saldi e delle operazioni intercorse con la Società' },
    cliente: { nome: 'Cliente', oggetto: 'del saldo a Vostro debito nei confronti della Società' },
    fornitore: { nome: 'Fornitore', oggetto: 'del saldo a Vostro credito nei confronti della Società' },
    altro: { nome: 'Altro soggetto', oggetto: 'delle informazioni indicate nella lettera allegata' }
};
const PASSI = ['primo', 'sollecito1', 'sollecito2'];
const NOME_PASSO = { primo: 'Invio', sollecito1: 'Primo sollecito', sollecito2: 'Secondo sollecito' };

/* ---------- le date ----------
   Le date che scrive chi invia sono giorni di calendario italiani
   (AAAA-MM-GG): la funzione gira in UTC, quindi "oggi" e "le 9 del giorno X"
   si calcolano sul fuso di Roma, ora legale compresa. */
const RE_GIORNO = /^(\d{4})-(\d{2})-(\d{2})$/;
function giornoValido(g) {
    const m = RE_GIORNO.exec(String(g || ''));
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
function partiRoma(ms) {
    const f = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Rome', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(ms));
    const p = {};
    f.forEach(x => { p[x.type] = x.value; });
    return p;
}
function giornoRoma(ms) {
    const p = partiRoma(ms == null ? Date.now() : ms);
    return p.year + '-' + p.month + '-' + p.day;
}
/* Il momento (ms) in cui a Roma sono le `ore` del giorno `g`. */
function istanteRoma(g, ore) {
    const m = RE_GIORNO.exec(String(g || ''));
    if (!m) return 0;
    const ipotesi = Date.UTC(+m[1], +m[2] - 1, +m[3], ore || 0, 0, 0);
    const p = partiRoma(ipotesi);
    const visto = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return ipotesi - (visto - ipotesi);
}
function aggiungiGiorni(g, n) {
    const m = RE_GIORNO.exec(String(g || ''));
    if (!m) return '';
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
    return d.toISOString().slice(0, 10);
}
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
function dataEstesa(g) {
    const m = RE_GIORNO.exec(String(g || ''));
    return m ? (+m[3]) + ' ' + MESI[+m[2] - 1] + ' ' + m[1] : '';
}
function dataBreve(g) {
    const m = RE_GIORNO.exec(String(g || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}

/* ---------- il riferimento ----------
   Sei caratteri senza quelli che si confondono (0/O, 1/I/L): sta
   nell'oggetto della PEC, e chi risponde lasciando l'oggetto com'e' ci
   permette di abbinare la risposta alla richiesta anche quando arriva da un
   indirizzo diverso da quello a cui abbiamo scritto. */
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function codiceNuovo() {
    const b = crypto.randomBytes(6);
    let c = '';
    for (let i = 0; i < 6; i++) c += ALFABETO[b[i] % ALFABETO.length];
    return 'RVL-' + c;
}
const RE_CODICE = /RVL[-\s]?([2-9A-HJKMNP-Z]{6})(?![0-9A-Z])/i;
function codiceDa(testo) {
    const m = RE_CODICE.exec(String(testo || ''));
    return m ? 'RVL-' + m[1].toUpperCase() : '';
}
/* Il Message-ID che imponiamo: il gestore lo ricopia nelle ricevute
   (X-Riferimento-Message-ID e daticert.xml), ed e' il filo che lega ogni
   ricevuta al suo invio. Il dominio e' quello della casella. */
function riferimentoNuovo() {
    const dominio = String(configurazione().mittente || '').split('@')[1] || 'pec.it';
    return 'circ-' + crypto.randomBytes(8).toString('hex') + '@' + dominio;
}

/* ---------- i controlli su cio' che arriva dall'area riservata ---------- */
function unaRiga(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function nomeFile(v) {
    let n = unaRiga(v, 140).replace(/[\/\\:*?"<>|]+/g, '-');
    if (!/\.pdf$/i.test(n)) n = (n || 'lettera') + '.pdf';
    return n;
}
/* Torna { ok, dati } oppure { ok: false, msg }. `oggi` e' il giorno di Roma. */
function controllaRichiesta(b, oggi) {
    b = b || {};
    const nome = unaRiga(b.destinatario, 160);
    const pec = unaRiga(b.pec, 200).toLowerCase();
    const categoria = Object.prototype.hasOwnProperty.call(CATEGORIE, String(b.categoria)) ? String(b.categoria) : '';
    if (nome.length < 2) return { ok: false, msg: 'Indica la denominazione del destinatario.' };
    if (!EMAIL_RE.test(pec)) return { ok: false, msg: 'L\'indirizzo PEC di ' + nome + ' non è valido.' };
    if (!categoria) return { ok: false, msg: 'Scegli il tipo di destinatario di ' + nome + '.' };
    const scadenza = String(b.scadenza || '');
    if (!giornoValido(scadenza) || scadenza <= oggi) return { ok: false, msg: 'La data entro cui rispondere deve essere successiva a oggi.' };
    const bilancio = String(b.bilancio || '');
    if (!giornoValido(bilancio)) return { ok: false, msg: 'Indica la data di chiusura del bilancio.' };

    const sollecito = (x, etichetta, dopo) => {
        if (!x || !x.data) return { ok: true, dati: null };
        const data = String(x.data), entro = String(x.scadenza || '');
        if (!giornoValido(data) || data <= dopo.giorno) return { ok: false, msg: 'La data del ' + etichetta + ' deve essere successiva ' + dopo.a + '.' };
        if (!giornoValido(entro) || entro <= data) return { ok: false, msg: 'Nel ' + etichetta + ' la data entro cui rispondere deve essere successiva alla data del sollecito.' };
        return { ok: true, dati: { data: data, scadenza: entro } };
    };
    const s1 = sollecito(b.sollecito1, 'primo sollecito', { giorno: oggi, a: 'a oggi' });
    if (!s1.ok) return s1;
    if (!s1.dati && b.sollecito2 && b.sollecito2.data) return { ok: false, msg: 'Il secondo sollecito si può programmare solo insieme al primo.' };
    const s2 = sollecito(b.sollecito2, 'secondo sollecito', { giorno: s1.dati ? s1.dati.data : oggi, a: 'al primo sollecito' });
    if (!s2.ok) return s2;

    const dimensione = Math.round(Number(b.allegatoDimensione) || 0);
    if (!(dimensione > 0)) return { ok: false, msg: 'Allega la lettera in PDF per ' + nome + '.' };
    if (dimensione > LIMITI.pdfMaxByte) {
        return { ok: false, msg: 'Il PDF per ' + nome + ' supera ' + megabyte(LIMITI.pdfMaxByte) + ': riducilo (per esempio con una scansione in bianco e nero a 150 dpi).' };
    }
    return {
        ok: true,
        dati: {
            destinatario: nome, pec: pec, categoria: categoria, scadenza: scadenza, bilancio: bilancio,
            sollecito1: s1.dati, sollecito2: s2.dati,
            allegato: { nome: nomeFile(b.allegatoNome), dimensione: dimensione, pezzi: Math.ceil(dimensione / LIMITI.pezzoByte) }
        }
    };
}
function megabyte(n) {
    const mb = n / (1024 * 1024);
    return (mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10).toString().replace('.', ',') + ' MB';
}

/* ============================================================
   I TESTI
   Tre messaggi diversi: la richiesta, il primo sollecito (cortese:
   puo' essere sfuggita) e il secondo (fermo: dice che cosa succede
   se la risposta non arriva). Tutti portano il riferimento
   nell'oggetto e la data entro cui rispondere scelta da chi invia.
   ============================================================ */
function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function oggetto(passo, d) {
    const base = 'Richiesta di conferma esterna - Revisione legale di ' + unaRiga(d.cliente, 110) + ' - rif. ' + d.codice;
    if (passo === 'sollecito1') return 'SOLLECITO - ' + base;
    if (passo === 'sollecito2') return 'SECONDO SOLLECITO - ' + base;
    return base;
}
/* I paragrafi del messaggio, uno per voce: da qui nascono sia l'HTML sia il
   testo semplice, cosi' le due versioni non possono dire cose diverse.
   `d`: { cliente, destinatario, categoria, bilancio, scadenza (quella del
   passo), codice, casella, inviatoIl (giorno della prima PEC), scadenzaPrima,
   sollecito1Il }. */
function paragrafi(passo, d) {
    const cat = CATEGORIE[d.categoria] || CATEGORIE.altro;
    const cliente = unaRiga(d.cliente, 160), bilancio = dataEstesa(d.bilancio), entro = dataEstesa(d.scadenza);
    const p = [];
    if (passo === 'primo') {
        p.push('Revilaw S.p.A. è la società incaricata della revisione legale del bilancio di ' + cliente + ' al ' + bilancio + '.');
        p.push('Nell\'ambito delle procedure di revisione previste dal principio ISA Italia 505 (Conferme esterne), Vi trasmettiamo in allegato, in nome e per conto della Società, la richiesta di conferma ' + cat.oggetto + '.');
    } else if (passo === 'sollecito1') {
        p.push('in data ' + dataEstesa(d.inviatoIl) + ' Vi abbiamo trasmesso a mezzo PEC, in nome e per conto di ' + cliente + ', la richiesta di conferma ' + cat.oggetto + ', nell\'ambito della revisione legale del bilancio al ' + bilancio + '.');
        p.push('Ad oggi non ci risulta pervenuta la Vostra risposta' + (d.scadenzaPrima ? ', attesa entro il ' + dataEstesa(d.scadenzaPrima) : '') + '. Poiché la richiesta potrebbe esserVi sfuggita, Vi alleghiamo nuovamente la lettera.');
    } else {
        p.push('facciamo seguito alla richiesta di conferma ' + cat.oggetto + ' trasmessa a mezzo PEC in data ' + dataEstesa(d.inviatoIl)
            + (d.sollecito1Il ? ' e al sollecito del ' + dataEstesa(d.sollecito1Il) : '') + ', in nome e per conto di ' + cliente + ', rimasti ad oggi senza riscontro.');
        p.push('La Vostra conferma è un elemento necessario per completare la revisione legale del bilancio al ' + bilancio + ': in mancanza di risposta dovremo ricorrere a procedure alternative e informarne la Società. Vi alleghiamo ancora una volta la lettera.');
    }
    return p;
}
function istruzioni(passo, d) {
    return {
        entro: passo === 'primo'
            ? 'Vi chiediamo di rispondere entro il ' + dataEstesa(d.scadenza) + '.'
            : (passo === 'sollecito1'
                ? 'Vi chiediamo cortesemente di rispondere entro il ' + dataEstesa(d.scadenza) + '.'
                : 'Vi invitiamo a rispondere entro e non oltre il ' + dataEstesa(d.scadenza) + '.'),
        come: [
            'a mezzo PEC, rispondendo direttamente a questo messaggio (' + d.casella + ');',
            'lasciando invariato l\'oggetto: contiene il riferimento ' + d.codice + ', che ci permette di abbinare la Vostra risposta alla richiesta;',
            'allegando la lettera compilata e firmata, in formato PDF.'
        ],
        perche: 'La risposta va inviata direttamente a Revilaw S.p.A. e non alla Società: è questo che ne garantisce l\'attendibilità come elemento probativo ai fini della revisione.',
        gia: passo === 'primo' ? '' : 'Se nel frattempo avete già risposto, Vi preghiamo di non tenere conto di questo messaggio.'
    };
}
const SALUTO = 'RingraziandoVi per la collaborazione, porgiamo distinti saluti.';

function testoSemplice(passo, d) {
    const i = istruzioni(passo, d), par = paragrafi(passo, d);
    const apertura = passo === 'primo' ? 'Spett.le ' + d.destinatario + ',' : 'Spett.le ' + d.destinatario + ',';
    return [
        'Società sottoposta a revisione legale: ' + d.cliente,
        'Riferimento: ' + d.codice,
        '',
        apertura,
        '',
        par.join('\n\n'),
        '',
        i.entro + ' La risposta va inviata:',
        i.come.map(x => '- ' + x).join('\n'),
        '',
        i.perche,
        i.gia ? '\n' + i.gia : '',
        '',
        SALUTO,
        '',
        'Revilaw S.p.A.',
        'Società di revisione legale',
        'www.revilaw.it'
    ].filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

/* HTML a tabelle e stili in linea (i client PEC sono webmail vecchie e
   Outlook), nessuna immagine: molte caselle PEC le bloccano, e il messaggio
   deve leggersi per intero anche cosi'. */
function html(passo, d) {
    const i = istruzioni(passo, d), par = paragrafi(passo, d);
    const F = 'font-family:Arial,Helvetica,sans-serif;';
    const P = 'margin:0 0 14px;' + F + 'font-size:15px;line-height:1.6;color:#1E293B;text-align:justify;';
    const fascia = passo === 'primo' ? '' : '<tr><td style="background-color:' + (passo === 'sollecito1' ? '#FEF3C7' : '#FDE2E1') + ';padding:9px 28px;' + F
        + 'font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:' + (passo === 'sollecito1' ? '#7A5200' : '#8F1D15') + ';">'
        + esc(NOME_PASSO[passo]) + '</td></tr>';
    return '<!doctype html>\n<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        + '<title>' + esc(oggetto(passo, d)) + '</title></head>'
        + '<body style="margin:0;padding:0;background-color:#F1F5F9;">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9;"><tr><td align="center" style="padding:24px 12px;">'
        + '<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background-color:#ffffff;border:1px solid #E2E8F0;">'
        + '<tr><td style="background-color:#0A2844;padding:20px 28px;' + F + 'color:#ffffff;">'
        + '<div style="font-size:19px;font-weight:bold;letter-spacing:.5px;">REVILAW S.p.A.</div>'
        + '<div style="font-size:12px;color:#B6CCE0;letter-spacing:1px;text-transform:uppercase;margin-top:3px;">Società di revisione legale</div></td></tr>'
        + fascia
        + '<tr><td style="padding:26px 28px 8px;">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;"><tr>'
        + '<td style="border-left:4px solid #164068;background-color:#EEF4FA;padding:12px 16px;' + F + '">'
        + '<div style="font-size:11px;color:#475569;letter-spacing:1px;text-transform:uppercase;">Società sottoposta a revisione legale</div>'
        + '<div style="font-size:17px;font-weight:bold;color:#0A2844;margin-top:3px;">' + esc(d.cliente) + '</div>'
        + '<div style="font-size:12px;color:#475569;margin-top:6px;">Bilancio al ' + esc(dataEstesa(d.bilancio)) + ' &nbsp;&middot;&nbsp; Riferimento <strong style="color:#0A2844;">' + esc(d.codice) + '</strong></div>'
        + '</td></tr></table>'
        + '<p style="' + P + '">Spett.le <strong>' + esc(d.destinatario) + '</strong>,</p>'
        + par.map(x => '<p style="' + P + '">' + esc(x) + '</p>').join('')
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;"><tr>'
        + '<td style="border:1px solid #F0D27A;border-left:4px solid #C9A227;background-color:#FFFBEB;padding:14px 16px;' + F + 'font-size:15px;line-height:1.6;color:#1E293B;">'
        + '<div style="font-weight:bold;color:#0A2844;margin-bottom:6px;">' + esc(i.entro) + '</div>'
        + '<div style="margin-bottom:4px;">La risposta va inviata:</div>'
        + '<table role="presentation" cellpadding="0" cellspacing="0" border="0">'
        + i.come.map(x => '<tr><td valign="top" style="padding:2px 8px 2px 0;' + F + 'font-size:15px;color:#164068;">&bull;</td><td style="padding:2px 0;' + F + 'font-size:15px;line-height:1.5;color:#1E293B;">' + esc(x) + '</td></tr>').join('')
        + '</table></td></tr></table>'
        + '<p style="' + P + '">' + esc(i.perche) + '</p>'
        + (i.gia ? '<p style="' + P + 'color:#475569;">' + esc(i.gia) + '</p>' : '')
        + '<p style="' + P + '">' + esc(SALUTO) + '</p>'
        + '<p style="margin:18px 0 0;' + F + 'font-size:15px;line-height:1.5;color:#0A2844;"><strong>Revilaw S.p.A.</strong><br><span style="font-size:13px;color:#475569;">Società di revisione legale</span></p>'
        + '</td></tr>'
        + '<tr><td style="padding:16px 28px 22px;"><div style="border-top:1px solid #E2E8F0;padding-top:12px;' + F + 'font-size:11px;line-height:1.5;color:#64748B;text-align:justify;">'
        + 'L\'invio delle lettere di circolarizzazione è una procedura di revisione volta ad acquisire direttamente dai terzi elementi probativi sui rapporti intrattenuti con la società revisionata. '
        + 'Questo messaggio e il suo allegato sono riservati al destinatario indicato: se lo avete ricevuto per errore, Vi preghiamo di comunicarcelo rispondendo a questa PEC e di cancellarlo. '
        + 'Revilaw S.p.A. &middot; www.revilaw.it</div></td></tr>'
        + '</table></td></tr></table></body></html>';
}

/* I dati del messaggio di un passo, presi dalla scheda dell'invio. */
function datiMessaggio(invio, passo) {
    const p = (invio.passi || {})[passo] || {};
    const primo = (invio.passi || {}).primo || {}, s1 = (invio.passi || {}).sollecito1 || {};
    return {
        cliente: invio.cliente, destinatario: invio.destinatario, categoria: invio.categoria,
        bilancio: invio.bilancio, codice: invio.codice, casella: configurazione().mittente,
        scadenza: passo === 'primo' ? invio.scadenza : (p.scadenza || invio.scadenza),
        scadenzaPrima: invio.scadenza,
        inviatoIl: primo.inviatoIl ? giornoRoma(primo.inviatoIl) : giornoRoma(),
        sollecito1Il: s1.inviatoIl ? giornoRoma(s1.inviatoIl) : ''
    };
}
function messaggio(invio, passo) {
    const d = datiMessaggio(invio, passo);
    return { oggetto: oggetto(passo, d), testo: testoSemplice(passo, d), html: html(passo, d) };
}

module.exports = {
    configurazione, configurato, LIMITI, CATEGORIE, PASSI, NOME_PASSO, EMAIL_RE,
    giornoValido, giornoRoma, istanteRoma, aggiungiGiorni, dataEstesa, dataBreve,
    codiceNuovo, codiceDa, riferimentoNuovo, unaRiga, nomeFile, megabyte,
    controllaRichiesta, oggetto, testoSemplice, html, datiMessaggio, messaggio
};
