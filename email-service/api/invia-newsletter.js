/* ============================================================
   Invio della newsletter (Area riservata Revilaw)
   ------------------------------------------------------------
   Differenza dalle comunicazioni: qui OGNI destinatario riceve una
   mail sua, perche' il collegamento per disiscriversi e' personale
   (firmato sul suo indirizzo). Niente copia nascosta, quindi, e
   nessuno vede gli indirizzi degli altri.

   L'area riservata manda l'HTML gia' pronto (lo costruisce il
   formato condiviso newsletter-format.js) con dentro il segnaposto
   {{DISISCRIVITI}}: qui viene sostituito, destinatario per
   destinatario, con il suo collegamento firmato.

   Si invia a lotti: l'area riservata chiama piu' volte questo
   endpoint con un pezzo dell'elenco e mostra l'avanzamento. Cosi'
   nessuna richiesta resta appesa e, se qualcosa va storto a meta',
   si sa esattamente a chi era gia' partita.

   Chi ha chiesto di non ricevere piu' nulla viene SALTATO qui, sul
   server: e' l'ultimo controllo, quello che vale, anche se l'elenco
   a video fosse vecchio di qualche minuto.
   ============================================================ */

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const N = require('../lib/newsletter');

function trasporto() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        // una sola connessione riusata per tutto il lotto: piu' veloce e piu' gentile col server
        pool: true, maxConnections: 1, maxMessages: 100
    });
}

/* Rate limit per mittente: e' un invio di massa, quindi il tetto e' sui LOTTI.
   Serve a evitare la partenza a raffica per errore, non a rallentare il lavoro. */
const RL_PAUSA_MS = 2 * 1000;
const RL_MAX_ORA = 80;                // lotti/ora per utente
const RL_ORA_MS = 60 * 60 * 1000;
async function consumaGettone(email) {
    const ref = N.admin.firestore().collection('newsletter_throttle').doc(email);
    return N.admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const ora = Date.now();
        const d = snap.exists ? snap.data() : { inizioFinestra: 0, conteggio: 0, ultimo: 0 };
        const stessaFinestra = (ora - (d.inizioFinestra || 0)) < RL_ORA_MS;
        const conteggio = stessaFinestra ? (d.conteggio || 0) : 0;
        if ((ora - (d.ultimo || 0)) < RL_PAUSA_MS || conteggio >= RL_MAX_ORA) return false;
        tx.set(ref, { ultimo: ora, inizioFinestra: stessaFinestra ? d.inizioFinestra : ora, conteggio: conteggio + 1 }, { merge: true });
        return true;
    });
}

/* Quanti destinatari per chiamata. Con Brevo si manda tutto il lotto in UNA
   richiesta (una "versione" per persona), quindi il numero puo' essere alto;
   con la casella SMTP invece si spedisce una mail per volta e 20 e' quanto
   sta comodamente nei 60 secondi della funzione. */
const MAX_LOTTO_BREVO = 200;
const MAX_LOTTO_SMTP = 20;
function maxLotto() { return N.brevoAttivo() ? MAX_LOTTO_BREVO : MAX_LOTTO_SMTP; }

const SEGNAPOSTO = '{{DISISCRIVITI}}';

/* --- dal nostro formato a quello di Brevo ---
   Brevo sostituisce i segnaposto scritti {{params.nome}}. Noi nel corpo
   abbiamo {{DISISCRIVITI}} e le variabili {nome} {cognome}...: si convertono,
   cosi' l'HTML viaggia UNA volta sola e cambia solo la manciata di valori di
   ciascun destinatario. Le graffe doppie eventualmente scritte da chi compone
   vengono neutralizzate prima, altrimenti Brevo proverebbe a interpretarle. */
const VARIABILI = ['nome_completo', 'nome', 'cognome', 'azienda', 'email'];
function perBrevo(testo) {
    // sentinella interna: nessuno puo' scriverla per sbaglio in un testo
    const SEGNO = '\u0000DISISCRIVITI\u0000';
    let s = String(testo == null ? '' : testo).split(SEGNAPOSTO).join(SEGNO);
    s = s.replace(/\{\{/g, '&#123;&#123;').replace(/\}\}/g, '&#125;&#125;');
    s = s.split(SEGNO).join('{{params.disiscriviti}}');
    VARIABILI.forEach(v => { s = s.split('{' + v + '}').join('{{params.' + v + '}}'); });
    return s;
}
/* Nell'oggetto e nella parte in solo testo le graffe doppie non servono a nessuno:
   li si converte allo stesso modo, senza la neutralizzazione (non c'e' HTML). */
function perBrevoSemplice(testo) {
    let s = String(testo == null ? '' : testo).split(SEGNAPOSTO).join('{{params.disiscriviti}}');
    VARIABILI.forEach(v => { s = s.split('{' + v + '}').join('{{params.' + v + '}}'); });
    return s;
}
/* Chiave di non ripetizione: la stessa identica richiesta rimandata entro
   mezz'ora non fa partire le mail due volte.

   Ci deve entrare anche il CONTENUTO, non solo chi lo riceve. Altrimenti:
   si manda la prova a se stessi, ci si accorge di un refuso, si corregge e si
   rimanda la prova - stessi destinatari, stessa campagna, stessa chiave: Brevo
   la scarta come doppione e la sezione direbbe "prova inviata" senza che sia
   partito niente. Con il contenuto dentro, una versione diversa e' un invio
   diverso, mentre il ritentativo dopo un errore di rete resta protetto.

   Si calcola sull'elenco RICEVUTO, non su quello ripulito dai disiscritti: se
   fra un tentativo e l'altro qualcuno si disiscrive, la chiave non deve
   cambiare proprio nel momento in cui serve. */
function chiaveNonRipetere(campagna, destinatari, contenuto) {
    const impronta = crypto.createHash('sha256')
        .update(String(campagna || '') + '\n' + String(contenuto || '') + '\n'
            + destinatari.map(d => d.email).sort().join(','))
        .digest('hex');
    return impronta.slice(0, 8) + '-' + impronta.slice(8, 12) + '-4' + impronta.slice(13, 16)
        + '-a' + impronta.slice(17, 20) + '-' + impronta.slice(20, 32);
}

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
/* Variabili di personalizzazione, le stesse delle comunicazioni. */
function applicaVariabili(s, d, escapa) {
    d = d || {};
    const v = x => escapa ? esc(x || '') : String(x || '');
    const nc = (d.nome && d.cognome) ? (d.nome + ' ' + d.cognome) : (d.nome || d.cognome || '');
    return String(s == null ? '' : s)
        .replace(/\{nome_completo\}/g, () => v(nc))
        .replace(/\{nome\}/g, () => v(d.nome))
        .replace(/\{cognome\}/g, () => v(d.cognome))
        .replace(/\{azienda\}/g, () => v(d.azienda))
        .replace(/\{email\}/g, () => v(d.email));
}

module.exports = async (req, res) => {
    const origin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Metodo non consentito' }); return; }

    try {
        N.initAdmin();
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

        const aut = await N.autorizza(body.idToken);
        if (!aut.ok) { res.status(aut.stato).json({ ok: false, msg: aut.msg }); return; }

        const oggetto = String(body.oggetto || '').trim();
        const html = String(body.html || '');
        const testoSemplice = String(body.testo || '');
        if (!oggetto) { res.status(400).json({ ok: false, msg: 'Oggetto mancante.' }); return; }
        if (!html) { res.status(400).json({ ok: false, msg: 'Contenuto mancante.' }); return; }
        if (html.indexOf(SEGNAPOSTO) < 0) {
            // senza collegamento di disiscrizione la mail non parte: e' un obbligo, non un dettaglio
            res.status(400).json({ ok: false, msg: 'La newsletter non contiene il collegamento per disiscriversi: non puo\' essere inviata.' });
            return;
        }
        const campagna = String(body.campagna || '').slice(0, 60);

        /* prova: si manda solo a chi sta usando la sezione, con il suo collegamento
           vero (cosi' si puo' verificare anche la disiscrizione, e poi riattivarsi). */
        const prova = body.prova === true;
        const grezzi = prova ? [{ email: aut.email, nome: 'Prova', cognome: '' }]
            : (Array.isArray(body.destinatari) ? body.destinatari : []);

        const perEmail = {};
        grezzi.forEach(d => {
            const o = (d && typeof d === 'object') ? d : { email: d };
            const email = String(o.email || '').trim().toLowerCase();
            if (!N.EMAIL_RE.test(email) || perEmail[email]) return;
            perEmail[email] = {
                email: email,
                nome: String(o.nome || '').slice(0, 80),
                cognome: String(o.cognome || '').slice(0, 80),
                azienda: String(o.azienda || '').slice(0, 120)
            };
        });
        const destinatari = Object.keys(perEmail).map(k => perEmail[k]);
        if (!destinatari.length) { res.status(400).json({ ok: false, msg: 'Nessun destinatario valido.' }); return; }
        if (destinatari.length > maxLotto()) {
            res.status(400).json({ ok: false, msg: 'Lotto troppo grande (massimo ' + maxLotto() + ' destinatari per volta).', rimasti: destinatari });
            return;
        }

        const consentito = await consumaGettone(aut.email);
        if (!consentito) { res.status(429).json({ ok: false, msg: 'Troppi invii ravvicinati: attendi qualche secondo e riprova.', rimasti: destinatari }); return; }

        // ultimo controllo sulle disiscrizioni: vale quello del server, non l'elenco a video
        const fuori = prova ? {} : await N.disiscritti(N.admin.firestore());

        /* Mittente della NEWSLETTER, distinto da quello delle email di servizio.
           Password e comunicazioni continuano a partire da noreply@ via Aruba:
           se un giorno una lista crea problemi di reputazione, non si porta
           dietro anche le email con cui si fa entrare la gente nell'area
           riservata. Se la variabile dedicata non c'e', si torna a quella
           generale e non cambia niente rispetto a prima. */
        const fromEmail = process.env.NEWSLETTER_FROM_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
        const fromName = String(body.mittenteNome || process.env.NEWSLETTER_FROM_NAME || process.env.SMTP_FROM_NAME || 'Revilaw S.p.A.').replace(/[\r\n]/g, ' ').slice(0, 80);
        // forma a oggetto: la citazione la fa nodemailer. Componendo la stringa a mano,
        // un nome con virgolette dentro potrebbe aggiungere un secondo indirizzo al From.
        const from = { name: fromName, address: fromEmail };
        // l'indirizzo di risposta e' sempre quello di chi ha davvero premuto invio:
        // non si accetta dal corpo della richiesta
        const rispostaA = aut.email;

        /* ---------- strada 1: Brevo ----------
           Tutto il lotto in UNA richiesta: una "versione" per destinatario, con
           il suo collegamento di disiscrizione nei parametri. L'HTML viaggia una
           volta sola, non una per persona.
           Due avvertenze, che valgono la pena di essere scritte:
           - Brevo risponde "accettato" o "rifiutato" per l'INTERA richiesta: non
             esiste l'esito per singolo destinatario. Rimbalzi e blocchi si
             vedono dopo, dal pannello di Brevo;
           - l'header "Annulla iscrizione" lo mette Brevo e non si puo'
             sostituire con il nostro. Chi usa quel pulsante finisce nella
             blocklist di Brevo: la sezione la rilegge e la riporta nel nostro
             elenco (vedi api/newsletter.js). Il collegamento dentro la mail
             resta invece il nostro, firmato. */
        if (N.brevoAttivo()) {
            const vivi = [], saltatiB = [];
            destinatari.forEach(d => {
                if (fuori[d.email]) saltatiB.push({ email: d.email, motivo: 'disiscritto' });
                else vivi.push(d);
            });
            if (!vivi.length) { res.status(200).json({ ok: true, inviati: 0, saltati: saltatiB, falliti: [], rimasti: [], trasporto: 'brevo' }); return; }

            const versioni = vivi.map(d => ({
                to: [{ email: d.email, name: ((d.nome || '') + ' ' + (d.cognome || '')).trim() || undefined }],
                params: {
                    disiscriviti: N.linkDisiscrizione(d.email, campagna),
                    nome: d.nome || '', cognome: d.cognome || '',
                    nome_completo: ((d.nome || '') + ' ' + (d.cognome || '')).trim(),
                    azienda: d.azienda || '', email: d.email
                }
            }));
            const corpo = {
                sender: { name: fromName, email: fromEmail },
                replyTo: { email: rispostaA },
                subject: perBrevoSemplice(oggetto) || '(senza oggetto)',
                htmlContent: perBrevo(html),
                messageVersions: versioni,
                tags: campagna ? ['newsletter', campagna] : ['newsletter'],
                // se la stessa identica richiesta viene rimandata entro mezz'ora, Brevo non la esegue due volte
                headers: {
                    idempotencyKey: chiaveNonRipetere(campagna, destinatari,
                        oggetto + '\n' + html + '\n' + testoSemplice + '\n' + (body.sandbox === true ? 'prova' : ''))
                }
            };
            if (testoSemplice) corpo.textContent = perBrevoSemplice(testoSemplice);

            const r = await N.chiamataBrevo('/smtp/email', { metodo: 'POST', corpo: corpo, sandbox: body.sandbox === true });
            if (r.ok) {
                res.status(200).json({ ok: true, inviati: vivi.length, saltati: saltatiB, falliti: [], rimasti: [], trasporto: 'brevo' });
                return;
            }
            // stesso lotto gia' accettato poco fa: NON e' un errore, e' la protezione che ha funzionato
            if (r.dati && r.dati.code === 'duplicate_parameter') {
                console.warn('Newsletter: lotto gia accettato da Brevo (chiave di non ripetizione).');
                res.status(200).json({ ok: true, inviati: vivi.length, saltati: saltatiB, falliti: [], rimasti: [], trasporto: 'brevo', giaAccettato: true });
                return;
            }
            const motivo = (r.dati && (r.dati.message || r.dati.code)) || ('errore ' + r.stato);
            console.error('Newsletter: Brevo ha rifiutato il lotto:', r.stato, String(motivo).slice(0, 200));
            res.status(502).json({
                ok: false, trasporto: 'brevo',
                msg: r.stato === 401 ? 'Chiave Brevo non valida o scaduta.'
                    : (r.stato === 402 ? 'Crediti Brevo esauriti: controlla il piano.'
                        : 'Brevo ha rifiutato l\'invio: ' + String(motivo).slice(0, 160)),
                saltati: saltatiB, falliti: [], rimasti: vivi
            });
            return;
        }

        /* ---------- strada 2: la casella SMTP ----------
           Resta come ripiego finche' la chiave Brevo non e' configurata, e per
           l'invio di prova quando si vuole verificare la vecchia strada. */
        const trans = trasporto();

        /* Budget di tempo. La funzione ha 60 secondi (vercel.json): se il server di
           posta e' lento, un lotto intero potrebbe non starci e la risposta non
           uscirebbe affatto, lasciando chi invia senza sapere quante mail sono
           partite davvero. Con la scadenza si esce sempre con i conti in mano, e
           gli indirizzi non ancora trattati tornano indietro in "rimasti": l'area
           riservata li rimette in coda invece di ricominciare da capo. */
        const scadenza = Date.now() + 45000;

        let inviati = 0;
        const saltati = [];
        const falliti = [];
        const rimasti = [];
        for (const d of destinatari) {
            if (Date.now() > scadenza) { rimasti.push(d); continue; }
            if (fuori[d.email]) { saltati.push({ email: d.email, motivo: 'disiscritto' }); continue; }
            const link = N.linkDisiscrizione(d.email, campagna);
            const unClic = N.linkUnClic(d.email, campagna);
            const corpoHtml = applicaVariabili(html, d, true).split(SEGNAPOSTO).join(esc(link));
            const corpoTesto = applicaVariabili(testoSemplice, d, false).split(SEGNAPOSTO).join(link);
            const ogg = applicaVariabili(oggetto, d, false).trim() || '(senza oggetto)';
            try {
                await trans.sendMail({
                    from: from, replyTo: rispostaA, to: d.email,
                    subject: ogg, text: corpoTesto || undefined, html: corpoHtml,
                    headers: {
                        // il pulsante "Annulla iscrizione" del client di posta: un clic, senza aprire nulla
                        'List-Unsubscribe': '<' + unClic + '>, <mailto:' + fromEmail + '?subject=Disiscrizione%20newsletter>',
                        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                        'Precedence': 'bulk',
                        'Auto-Submitted': 'auto-generated'
                    }
                });
                inviati++;
            } catch (e) {
                const motivo = String((e && e.message) || 'errore sconosciuto').slice(0, 200);
                console.error('Newsletter a', d.email, 'non inviata:', motivo);
                falliti.push({ email: d.email, motivo: motivo });
            }
        }
        try { trans.close(); } catch (_) { }

        if (!inviati && falliti.length) {
            res.status(502).json({ ok: false, msg: 'Nessuna mail inviata (errore del server di posta).', falliti: falliti.slice(0, 100), saltati: saltati, rimasti: rimasti.concat(falliti.map(f => ({ email: f.email }))) });
            return;
        }
        res.status(200).json({ ok: true, inviati: inviati, saltati: saltati, falliti: falliti.slice(0, 100), rimasti: rimasti, trasporto: 'smtp' });
    } catch (e) {
        console.error('Invio newsletter non riuscito:', e);
        res.status(500).json({ ok: false, msg: 'Invio non riuscito. Riprova.' });
    }
};
