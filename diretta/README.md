# Diretta degli eventi (`/diretta/`)

Un'area riservata piccola e separata, che fa **una cosa sola**: chi è iscritto
a un evento online entra con **la sua email e la password** che riceve via email e vede la diretta di
quell'evento. Niente ruoli, niente menu, nessun legame con l'area riservata
dello studio (`area-riservata/`): progetto Firebase diverso, account diversi,
dati diversi.

| Indirizzo | Per chi | Che cosa |
|---|---|---|
| `/diretta/` | partecipanti | accesso, attesa con conto alla rovescia, diretta |
| `/diretta/reimposta.html` | partecipanti e gestori | nuova password dal collegamento ricevuto via email |
| `/diretta/gestione/` | gestori (elenco fisso di email) | eventi, caricamento dei partecipanti, email, regia, esportazione |

Il resto del sito porta alla diretta dalla **pagina di Napoli** (pulsante
"Diretta" nel menu e sezione "Segui la diretta") e dalla **home** (popup
"Diretta Napoli" nei giorni dell'evento).

---

## Indice

1. [Come è fatta](#1-come-è-fatta)
2. [Il progetto Firebase `ngb-eventi`](#2-il-progetto-firebase-ngb-eventi)
3. [Le variabili su Vercel](#3-le-variabili-su-vercel)
4. [Brevo](#4-brevo)
5. [Il video: il player di Azoto](#5-il-video-il-player-di-azoto)
6. [Come si usa: dalla settimana prima al giorno dopo](#6-come-si-usa-dalla-settimana-prima-al-giorno-dopo)
7. [L'email come accesso, doppioni, password](#7-lemail-come-accesso-doppioni-password)
8. [Sicurezza: cosa è protetto e come](#8-sicurezza-cosa-è-protetto-e-come)
9. [Tenuta con 1000 persone: stime e piani](#9-tenuta-con-1000-persone-stime-e-piani)
10. [Le prove](#10-le-prove)
11. [Cambiare piattaforma video](#11-cambiare-piattaforma-video)
12. [Cosa devi fare tu](#12-cosa-devi-fare-tu)

---

## 1. Come è fatta

```
 browser del partecipante                     Vercel (email-service/)                 Firebase "ngb-eventi"
 ─────────────────────────                    ──────────────────────────              ─────────────────────
 /diretta/  ── email + password ────────▶  api/diretta-accesso  ── verifica ──▶  Authentication
            ◀── token personale ─────────                       ◀──────────────
            ── accesso con il token ───────────────────────────────────────▶  Authentication
            ── UNA lettura in ascolto: eventi/{idEvento} ───────────────────▶  Firestore (regole)
            ── un segnale di presenza al minuto ────────────────────────────▶  Firestore (regole)
            ── video ───────────────────────────────▶  Azoto: il suo player in un iframe (A)
                                                        o il flusso .m3u8 (B), dalla sua CDN

 /diretta/gestione/ ── token del gestore ──▶ api/diretta-gestione ─────────────▶  Firestore + Auth
                                            api/diretta-cron (ogni 5 min) ─ email ─▶ Brevo
 sito (home, Napoli) ── stato in onda ────▶ api/diretta-stato (cache CDN 30 s) ─▶  Firestore (1 lettura ogni 30 s)
```

**File del sito** (statici, GitHub Pages):

| File | Che cosa fa |
|---|---|
| `diretta/index.html`, `diretta.css`, `diretta.js` | la pagina dei partecipanti |
| `diretta/player-azoto.js` | **modalità A**: il player di Azoto in un iframe costruito dal nostro codice (solo indirizzi di `cdn.azotosolutions.com`), usato da pagina e regia (vedi [§5](#5-il-video-il-player-di-azoto)) |
| `diretta/player-webtv.js` | **modalità B**: il nostro `<video>` per il flusso diretto **HLS** (e DASH), usato da pagina e regia |
| `diretta/sorgente-video.js` | che cosa è quello che si incolla (codice o indirizzo del player Azoto, flusso HLS o DASH), gli indirizzi ammessi (`HOST_AZOTO`) e perché un link è rifiutato: **una sola** regola per gestione, pagina e servizio |
| `diretta/hls.min.js`, `diretta/dash.all.min.js` | hls.js 1.7.3 "light" (Apache 2.0) e dash.js 5.2.1 (BSD), versioni fissate e salvate nel sito (licenze accanto); si scaricano solo in modalità B |
| `diretta/config.js` | configurazione web del progetto Firebase, indirizzo del servizio e del modulo di iscrizione (`iscrizione`, il collegamento di "Non sei ancora iscritto? Iscriviti qui.") |
| `diretta/reimposta.html` | scelta della nuova password |
| `diretta/gestione/` | la pagina dei gestori |
| `diretta/firebase/` | regole e indici di Firestore, `firebase.json` |
| `diretta/prove/` | prove automatiche (emulatori, Playwright, carico) |
| `assets/diretta-stato.js` | legge "in onda sì/no" con la cache, per popup e pulsante |
| `assets/diretta-popup.js` | il popup "Diretta Napoli" della home |

**La cache dei file.** GitHub Pages fa tenere i file ai browser per 10 minuti,
e non si può cambiare. Quando modifichi un file di `diretta/`, cambia il `?v=`
nei collegamenti delle pagine che lo caricano (`index.html`, `reimposta.html`,
`gestione/index.html`), così nessuno si ritrova con file di versioni diverse.
Le modifiche ad `assets/diretta-stato.js` (date e orari di `EVENTO`) arrivano
ai visitatori entro 10 minuti.

**Funzioni nuove del servizio** (`email-service/`, stesso progetto Vercel di
sempre, nomi che cominciano con `diretta-`; delle funzioni esistenti sono
cambiati solo `vercel.json`, che elenca il nuovo lavoro programmato, e
`api/iscrizione-nuova.js`, il modulo di iscrizione del sito: dopo aver
registrato l'iscrizione come sempre, se l'interruttore dell'evento è acceso
crea l'account della diretta e manda la password, §7; se la diretta non è
configurata o qualcosa va storto, l'iscrizione del sito resta com'era):

| Funzione | Chi la chiama | Che cosa fa |
|---|---|---|
| `api/diretta-accesso` | pagina della diretta | accesso, blocco dei tentativi, password dimenticata, attivazione dei gestori |
| `api/diretta-gestione` | pagina di gestione | eventi, caricamento, partecipanti, email, regia, esportazione |
| `api/diretta-stato` | home e pagina di Napoli | "in onda sì/no", pubblico, con cache |
| `api/diretta-cron` | Vercel, ogni 5 minuti | coda delle email, promemoria, pulizie |
| `lib/diretta-*.js` | le funzioni qui sopra | logica, email, password, collegamento a Firebase |

**I dati** (Firestore del progetto `ngb-eventi`):

| Raccolta | Chi la legge | Contenuto |
|---|---|---|
| `eventi/{idEvento}` | i partecipanti di quell'evento, i gestori | titolo, data, orari, stato, programma; il tipo di player (Azoto o flusso diretto); l'indirizzo del player o il link del flusso (e quello di riserva, e quale dei due è in uso) **solo mentre è in onda**; con i link firmati è il link senza firma, che da solo non basta (quello firmato lo dà il servizio a ciascuno) |
| `partecipanti/{uid}` | solo la persona stessa | nome, cognome, email, azienda, eventi, da dove arriva (import o modulo del sito), stato delle email, ultimo accesso, quando ha chiesto «Password dimenticata?» (resetInviato) |
| `indirizzi/{email}` | solo il server | → uid: garantisce che un'email abbia un solo account |
| `sessioni/{uid}` | solo il server | account attivo o disattivato, dispositivo ammesso |
| `eventiRiservati/{idEvento}` | solo il server | il tipo di player, l'indirizzo del player Azoto (solo l'indirizzo, mai il codice incollato), il link del flusso e quello di riserva; la chiave segreta dei link firmati |
| `presenze/{idEvento}_{uid}` | solo il server (scritta dal partecipante con regole strette) | primo e ultimo segnale, minuti collegati durante la diretta, collegamenti |
| `accessi/{auto}` | solo il server | un documento per ogni accesso riuscito |
| `daVerificare/{impronta}` | solo il server (la gestione li vede con il servizio) | le iscrizioni dal modulo del sito che la diretta non ha potuto iscrivere da sola: evento, nome, cognome, email scritta, motivo (email di un'altra persona, email non accettata), quando, quante volte, vista o no |
| `tentativi*`, `limiti`, `code`, `contatori`, `stato`, `gestoriAccount` | solo il server | protezioni, coda delle email, cache |

Le prime tre sono quelle chieste; le altre esistono perché qualcosa (un
limite, una garanzia, una protezione) ha bisogno di un posto dove il browser
non può arrivare.

---

## 2. Il progetto Firebase `ngb-eventi`

Un progetto **nuovo e dedicato**. È questo che rende impossibile, per
costruzione, che un partecipante entri nell'area riservata dello studio o
viceversa: i token di un progetto non valgono nell'altro (c'è una prova che lo
dimostra, [§10](#10-le-prove)), e nemmeno per sbaglio le funzioni della diretta
possono scrivere nel progetto dello studio (si rifiutano di partire se la chiave
di servizio non è di `ngb-eventi`, o se è la stessa dell'area riservata).

### 2.1 Quale piano: **Blaze** (a consumo), con un avviso di spesa

Il piano gratuito **Spark non basta**, e non di poco. Il segnale di presenza
(una scrittura al minuto per persona, chiesto per il contatore e per gli
attestati) da solo fa 1000 × 60 = 60.000 scritture all'ora: Spark ne concede
**20.000 al giorno** e le finirebbe dopo **circa 20 minuti di diretta**. Quando
la quota finisce, Firestore rifiuta **tutto**, accessi compresi, fino alla
mezzanotte del Pacifico (le 9.00 di Roma). I conti completi sono in
[§9](#9-tenuta-con-1000-persone-stime-e-piani): su Blaze una diretta di 3 ore
costa **meno di 1 $** e la giornata intera di Napoli **circa 1,2 $** (poco più
di 1 €): la quota gratuita giornaliera resta, si paga solo quello che la supera.

Blaze non ha un tetto di spesa: per questo si imposta un **avviso di budget**
(passo 3 qui sotto).

### 2.2 I passi

1. **Crea il progetto.** <https://console.firebase.google.com> → *Aggiungi
   progetto* → nome `ngb-eventi`. Google Analytics: non serve (disattivalo).
   Annota l'**ID del progetto** che la console mostra: se `ngb-eventi` è già
   preso da qualcun altro nel mondo, sarà qualcosa come `ngb-eventi-1a2b3`, e
   quell'ID va usato ovunque qui sotto al posto di `ngb-eventi`.
2. **Passa a Blaze.** In basso a sinistra *Spark* → *Esegui l'upgrade* →
   *Blaze*, collega un account di fatturazione (carta dello studio).
3. **Avviso di budget.** <https://console.cloud.google.com/billing> → il conto
   di fatturazione → *Budget e avvisi* → *Crea budget*: progetto `ngb-eventi`,
   importo **10 €**, avvisi al 50 %, 90 % e 100 %, email agli amministratori
   del conto.
4. **Firestore.** *Build* → *Firestore Database* → *Crea database*: database
   `(default)`, modalità **Native**, posizione **`eur3 (Europe)`** (oppure
   `europe-west8`, Milano). *La posizione non si può cambiare dopo.* Parti in
   modalità produzione: le regole vere si pubblicano al passo 7.
5. **Authentication.** *Build* → *Authentication* → *Inizia* → *Metodo di
   accesso* → attiva **Email/password** (solo il primo interruttore, non il
   "collegamento via email").
   Poi *Impostazioni*:
   - *Azioni utente*: **togli** "Abilita la creazione (registrazione)" e
     "Abilita l'eliminazione". Gli account li crea solo il nostro servizio; così
     nessuno può registrarsi da solo con la chiave pubblica. (Se la voce non
     compare, prima *Esegui l'upgrade a Firebase Authentication with Identity
     Platform*: su Blaze è gratuito fino a 50.000 utenti attivi al mese.)
   - *Protezione contro l'enumerazione delle email*: **attiva** (è la
     predefinita nei progetti nuovi).
   - *Domini autorizzati*: aggiungi `nextgenerationbusiness.it`.
6. **L'app web e `config.js`.** *Impostazioni progetto* (ingranaggio) →
   *Generali* → *Le tue app* → icona `</>` → nome `diretta` (niente Hosting).
   Copia **tutti** i valori di `firebaseConfig` in `diretta/config.js`, al
   posto di `DA_COMPILARE` (e correggi `authDomain`, `projectId`,
   `storageBucket` se l'ID del progetto è diverso). Finché ci sono
   `DA_COMPILARE` la pagina dice "Diretta non ancora configurata".
   Nello stesso file compila **`assistenza.email` e `assistenza.telefono`**
   con gli stessi valori di `DIRETTA_ASSISTENZA_EMAIL` e
   `DIRETTA_ASSISTENZA_TELEFONO` (§3): le variabili di Vercel valgono per le
   email, `config.js` per le pagine. Senza, le pagine mostrano solo
   `info@nextgenerationbusiness.it`.
7. **Regole e indici.** Dal computer, nella cartella `diretta/firebase/`:
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules,firestore:indexes --project ngb-eventi
   ```
   In alternativa, dalla console: *Firestore* → *Regole* → incolla
   `diretta/firebase/firestore.rules` → *Pubblica*; e *Indici* → *Composito* →
   crea i due indici di `diretta/firebase/firestore.indexes.json`
   (`presenze`: `idEvento` crescente + `ultimo` crescente; `accessi`:
   `idEvento` crescente + `quando` crescente).
   **Aspetta** che gli indici risultino *Attivato*: senza, il contatore dei
   collegati e l'esportazione degli accessi falliscono (gli emulatori delle
   prove non se ne accorgono: vanno provati sul progetto vero, vedi [§12](#12-cosa-devi-fare-tu)).
8. **La chiave di servizio del server.** *Impostazioni progetto* → *Account di
   servizio* → *Genera nuova chiave privata* → scarica il JSON. **Non** va nel
   repository. Convertila in una riga base64:
   ```bash
   base64 -w0 ngb-eventi-xxxx.json      # Linux
   base64 -i ngb-eventi-xxxx.json       # Mac
   ```
   e incollala su Vercel in `DIRETTA_FIREBASE_SERVICE_ACCOUNT` ([§3](#3-le-variabili-su-vercel)).
   È una chiave **diversa** da `FIREBASE_SERVICE_ACCOUNT` (quella dell'area
   riservata), che resta dov'è.
9. **La chiave API del server** (`DIRETTA_FIREBASE_API_KEY`). Il servizio
   verifica la password chiamando Google dal server. Crea una chiave
   **separata** da quella del browser: <https://console.cloud.google.com/apis/credentials>
   (progetto `ngb-eventi`) → *Crea credenziali* → *Chiave API* → *Modifica*:
   - *Restrizioni delle applicazioni*: **Nessuna** (le chiamate partono da Vercel, senza sito di provenienza);
   - *Restrizioni API*: solo **Identity Toolkit API** e **Token Service API**.

   E già che ci sei, limita la chiave del **browser** (quella di `config.js`):
   *Restrizioni delle applicazioni* → *Referrer HTTP* →
   `https://nextgenerationbusiness.it/*`.

---

## 3. Le variabili su Vercel

Progetto Vercel di sempre (`revilaw-email`, cartella `email-service`) →
*Settings* → *Environment Variables* → ambiente **Production**.

**Nuove, obbligatorie**

| Nome | Valore |
|---|---|
| `DIRETTA_FIREBASE_SERVICE_ACCOUNT` | la chiave di servizio di `ngb-eventi`, in base64 (§2.2 passo 8) |
| `DIRETTA_FIREBASE_API_KEY` | la chiave API del server (§2.2 passo 9) |
| `DIRETTA_ADMIN_EMAILS` | le email dei gestori, separate da virgola: `a.missori@emvas.tax, altro@revilaw.it` |

**Nuove, facoltative**

| Nome | Predefinito | A che serve |
|---|---|---|
| `DIRETTA_PROGETTO_ATTESO` | `ngb-eventi` | l'ID del progetto, se è diverso (§2.2 passo 1): la chiave di servizio deve essere di quel progetto |
| `DIRETTA_ASSISTENZA_EMAIL` | `info@nextgenerationbusiness.it` | il contatto per l'assistenza nelle email (anche Reply-To) |
| `DIRETTA_ASSISTENZA_TELEFONO` | *(vuoto)* | un numero di telefono per l'assistenza, se c'è (nelle email; per le pagine scrivilo anche in `diretta/config.js`) |
| `DIRETTA_DOMINIO_TECNICO` | `utenti.diretta.nextgenerationbusiness.it` | il dominio delle email tecniche (non riceve posta, non va creato) |
| `DIRETTA_MAX_LOTTO` | `40` | quante email per giro della coda |
| `DIRETTA_CONCORRENZA` | `4` | quante email in parallelo dentro un giro |
| `DIRETTA_PAUSA_MS` | `300` | pausa fra un gruppo di email e il successivo |
| `DIRETTA_MAX_GIORNO` | `0` (nessun tetto) | tetto di email della diretta al giorno: impostalo se il piano Brevo ha un limite giornaliero (§4) |
| `DIRETTA_AUTH_AL_SECONDO` | `8` | quante modifiche agli account Firebase al secondo (creazione, nuove password): tiene lontani i limiti di Google; non serve cambiarlo |
| `DIRETTA_MODULO_PERCENTO` | `60` | la parte del tetto giornaliero (`DIRETTA_MAX_GIORNO`) che possono usare le password fatte partire dal modulo pubblico del sito: oltre, restano in coda e partono il giorno dopo; il resto è del gestore (credenziali, promemoria) e delle reimpostazioni (che si fermano all'80 %). Senza tetto giornaliero non conta (§4) |
| `DIRETTA_MODULO_RETE_ORA` | `10` | quante iscrizioni dal modulo del sito all'ora, dalla stessa rete (stesso IP; per IPv6 la stessa /64), fanno partire la password da sole: oltre, l'account si crea ma la password la mandi tu (§7) |
| `DIRETTA_MODULO_ORA` | `60` | quante iscrizioni dal modulo del sito all'ora, in tutto, fanno partire la password da sole (1440 al giorno al massimo): oltre, come sopra. `0` = nessuna password parte da sola (§7) |

**Già presenti, riusate così come sono**: `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`, `APP_BASE_URL`,
`ALLOWED_ORIGIN`, `CRON_SECRET`, `BREVO_API_KEY` (quest'ultima serve per
vedere le email **respinte**, §4).

**Solo per le prove in locale** (non vanno mai messe su Vercel, e comunque
funzionano solo con gli emulatori): `DIRETTA_EMULATORE`, `DIRETTA_PROGETTO`,
`DIRETTA_POSTA_FINTA` (la posta diventa un file in `diretta/prove/risultati/`),
`DIRETTA_POSTA_RIFIUTA`, `DIRETTA_POSTA_ERRORE_ACCOUNT`,
`DIRETTA_POSTA_ERRORE_MESSAGGIO`, `DIRETTA_POSTA_INCERTA`,
`DIRETTA_POSTA_RITARDO_MS`, `DIRETTA_BREVO_API`.

**Il lavoro programmato** `api/diretta-cron` gira ogni 5 minuti (è in
`email-service/vercel.json`): `maxDuration` 300 s, budget interno 240 s,
lucchetto 330 s (le chiamate a mano dalla gestione: 40 s e 90 s). Se non c'è
niente da fare esce subito con poche letture.

Dopo aver aggiunto le variabili: *Deployments* → l'ultimo → *Redeploy*.

---

## 4. Brevo

Le email della diretta escono dallo stesso account Brevo di tutto il servizio,
con mittente `noreply@nextgenerationbusiness.it` e firma Revilaw S.p.A.

**Quante sono.** Per 1000 iscritti: 1000 credenziali, fino a 1000 promemoria
del giorno prima e 1000 dell'ora prima, più reinvii e "password dimenticata":
**circa 3.100 email in tre giorni**. Il piano gratuito di Brevo (300 al giorno)
**non basta**. Con un piano a pagamento senza tetto giornaliero non serve fare
niente; se invece c'è un tetto giornaliero, imposta `DIRETTA_MAX_GIORNO` un
po' sotto quel tetto e manda le credenziali con qualche giorno di anticipo: la
coda si ferma al tetto e riprende da sola il giorno dopo. Le email di
"password dimenticata" si fermano all'80 % del tetto, e le password che
partono da sole per chi si iscrive dal modulo del sito al 60 %
(`DIRETTA_MODULO_PERCENTO`): sono richieste pubbliche, e non devono poter
togliere spazio alle credenziali che mandi tu e ai promemoria. Quelle del
modulo rimaste fuori aspettano in coda il giorno dopo (anche il lavoro
programmato le manda solo entro quella parte); la gestione dice «Invio
fermo per il limite di oggi … (partono domani da sole)».

**Le respinte.** Il server di posta di Brevo accetta quasi sempre il messaggio
e scopre solo dopo che l'indirizzo non esiste. Lo stato **respinta** arriva
quindi dall'API di Brevo (rimbalzi, indirizzi bloccati o non validi), letta dal
pulsante "Aggiorna esiti" della gestione e dal lavoro programmato: serve
`BREVO_API_KEY` (già presente per la newsletter). Contano solo i rifiuti
permanenti (indirizzo inesistente, bloccato o non valido): un rimbalzo
temporaneo (casella piena) non cambia lo stato.

**I promemoria** (giorno prima e un'ora prima, da attivare per ogni evento)
partono solo a chi ha già ricevuto le credenziali (stato *inviata*) e ha
l'account attivo, **mai con la password**: contengono il collegamento, il nome
utente e "Non trovi la password? Usa «Password dimenticata?»". Ognuno parte una
volta sola per persona; il giorno è scritto sull'ora vera ("domani alle 9.00",
"oggi alle 9.00", con "(ora italiana)").

**Quando Brevo si ferma** (credito o tetto finiti, autenticazione, ritmo
troppo alto) la coda **si ferma** e lo dice in gestione, senza segnare in
errore il resto dell'elenco: chi non è stato ancora servito resta "in coda" e
riparte al giro successivo.

**Da controllare in Brevo** (una volta):
- *Senders, Domains & Dedicated IPs* → `nextgenerationbusiness.it` autenticato
  con **SPF, DKIM e DMARC** (altrimenti le credenziali finiscono nello spam);
- *Transactional* → *Settings*: il tracciamento dei clic riscrive i link (anche
  quello per entrare nella diretta) e Brevo conserva per un periodo i registri dei
  messaggi: **l'email delle credenziali contiene la password in chiaro**, come
  richiesto, quindi passa dai sistemi di Brevo. Il nostro codice non la salva da
  nessuna parte; limita a poche persone l'accesso all'account Brevo e, se
  possibile, disattiva il tracciamento dei clic per le email transazionali.

---

## 5. Il video: il player di Azoto

La diretta la trasmette la web TV **Azoto Solutions**. Il nostro sito non
trasmette video: la pagina mostra il video che arriva dai server di Azoto,
solo dopo l'accesso. Per ogni evento la gestione ha il campo **"Tipo di
player"**, con due modalità:

| Modalità | Quando si usa | Che cosa vede chi guarda |
|---|---|---|
| **A. Player Azoto (iframe)**, quella predefinita | **adesso**: Azoto ci ha dato il codice del suo player | il player di Azoto dentro la nostra pagina, con i **suoi** comandi (play, volume, qualità) |
| **B. Flusso diretto (.m3u8)** | quando Azoto ci darà il link diretto del flusso (domanda 3 del [§5.8](#58-le-domande-per-azoto-pronte-da-inoltrare)) | il **nostro** player: nessun logo, i nostri comandi, "Attiva l'audio", "Torna in diretta", link di riserva |

Si passa da una modalità all'altra anche **durante la diretta**, dalla scheda
*Regia*: chi è collegato cambia da solo, senza ricaricare la pagina (è sempre
l'unica lettura in ascolto sull'evento).

### 5.1 Il player di Azoto, visto da vicino

Prima di scrivere il codice abbiamo aperto il codice che ci ha dato Azoto
(25 settembre 2026). È fatto così (`livetvNN` al posto del nostro canale: il
suo indirizzo vero non si scrive nei file del sito, che sono pubblici; sta solo
nel database, dove lo inserisce la gestione):

```html
<div class='azoto-player-container'>
<iframe src='https://cdn.azotosolutions.com/cloudtv/livetvNN/player' frameborder='0' scrolling='no' allowfullscreen></iframe>
</div>
<script src='https://azotosolutions.com/videojs/azoto-player.js'></script>
```

- **Lo script `azoto-player.js`** (1,6 KB) fa solo due cose: ridimensiona il
  riquadro in 16:9 (senza superare l'altezza della finestra) e mette margini
  zero e **sfondo nero a tutta la pagina che lo carica**. Non comunica con la
  pagina (niente `postMessage`), non dice se la diretta è partita. **Non lo
  carichiamo**: il 16:9 lo fa il nostro CSS, e il nero rovinerebbe la nostra
  grafica. Per questo `azotosolutions.com` non compare nemmeno nella
  Content-Security-Policy.
- **La pagina del player** (`cdn.azotosolutions.com/cloudtv/livetvNN/player/`)
  usa **OvenPlayer** (un player libero) e carica tre librerie da
  `cdn.jsdelivr.net` **senza una versione fissata** (`@latest`): possono cambiare
  da un giorno all'altro senza che Azoto lo decida.
- **Peer-to-peer**: una di quelle librerie (`swarmcloud-hls`) fa scambiare pezzi
  del video **fra gli spettatori** (WebRTC), coordinati dai server di
  `meshify.cloud` e con i server STUN di Google e Twilio. È attiva da sola: chi
  guarda usa anche la **propria connessione in uscita** e il suo **indirizzo IP**
  è visibile agli altri spettatori e a quei servizi. Sta dentro il player di
  Azoto: da fuori non si può spegnere. Va chiesto ad Azoto (domanda 8) e va
  tenuto presente nell'informativa privacy.
- **Avvio**: il player prova a partire da solo **con l'audio**; i browser di
  solito lo bloccano e il player non prova a partire muto. Quindi spesso (su
  iPhone sempre) chi guarda deve **toccare play** nel player: per questo la
  nota sotto il video.
- **Parametri**: nessuno. Avvio, audio, colori sono fissi nel codice di Azoto;
  l'indirizzo non accetta opzioni.
- **Logo**: nel codice del player non c'è; l'immagine d'attesa è tutta nera.
  Se un logo c'è, è nel video stesso: si vedrà alla prova con la diretta accesa.
- **Link diretti**: nella pagina ci sono i link del flusso (HLS `.m3u8` e DASH
  `.mpd`, con due server di riserva). **Non li usiamo** finché Azoto non ce li
  conferma: potrebbero cambiare o essere riservati a loro. Il CORS di quei
  server (se permettono la riproduzione dal nostro sito) non l'abbiamo potuto
  verificare: è la domanda 3.
- **Nessuna protezione**: la pagina del player si apre e si incorpora da
  **qualsiasi sito**, anche senza sapere da dove arriva la richiesta (niente
  `X-Frame-Options`, niente `frame-ancestors`, nessun controllo del referrer).
  Vedi il §5.5.
- In caso di errore il player di Azoto si ricarica da solo dopo un secondo.

### 5.2 Modalità A: il player di Azoto nella nostra pagina

- **Nella gestione** si incolla il codice di Azoto **oppure** solo l'indirizzo del
  player. Il sistema ne estrae e salva **solo l'indirizzo**, e accetta soltanto
  indirizzi `https://cdn.azotosolutions.com/…`. L'HTML incollato non si salva e
  non entra mai nella pagina (potrebbe contenere codice malevolo): script,
  `onload`, altri tag e iframe di altri siti vengono ignorati o rifiutati.
- **L'iframe lo costruisce il nostro codice** (`diretta/player-azoto.js`), con
  `allow="autoplay; fullscreen; picture-in-picture; encrypted-media"`,
  `allowfullscreen`, `referrerpolicy="strict-origin-when-cross-origin"`,
  `scrolling="no"` e il titolo accessibile "Diretta: *titolo dell'evento*". Il
  riquadro è 16:9 e si adatta a ogni schermo, senza bande e senza barre di
  scorrimento.
- **L'indirizzo arriva dal database solo dopo l'accesso**, solo agli iscritti a
  quell'evento e solo mentre è in onda: l'iframe esiste solo per chi è entrato
  con email e password, e non compare nel codice pubblico.
- **Prima dell'inizio, in pausa e dopo la fine** la pagina mostra le nostre
  schermate (attesa, pausa, chiusura) **al posto** dell'iframe, che si crea solo
  quando la regia va in onda e sparisce quando esce di onda: nessuno vede la
  schermata vuota della web TV.
- **Sopra e sotto il riquadro solo la nostra grafica**: titolo dell'evento,
  "IN DIRETTA", nome della persona, "Esci". **Niente sopra l'iframe**: i comandi
  di Azoto (play, volume, qualità) sono gli unici di questa modalità e devono
  restare cliccabili.
- **Sotto il video**: il nostro pulsante **"Schermo intero"** (ingrandisce il
  riquadro; su iPhone, dove una pagina non può mettere a schermo intero un
  iframe, passa a una **vista a pagina intera orizzontale**, con il pulsante per
  uscire fuori dal video) e la nota fissa: *"Non senti l'audio? Premi il pulsante
  del volume nel player. Il video si blocca? Ricarica la pagina."*
- **Se il player non risponde entro 15 secondi**, sotto il video compare "La
  diretta sta arrivando, attendi qualche secondo" con il pulsante **"Ricarica
  il video"**, che ricrea solo l'iframe (non la pagina). Il messaggio sparisce
  da solo appena il player risponde. Attenzione: da fuori si sa solo se la
  pagina del player è arrivata, non se il video sta andando (Azoto non lo
  comunica: domanda 5).

### 5.3 Modalità B: il flusso diretto (quando Azoto lo darà)

Quando Azoto ci darà il link `.m3u8`, lo si incolla nel campo **"Flusso diretto"**,
lo si prova e si sceglie la modalità B (anche durante la diretta, dalla *Regia*).
Il player è in un file a parte (`diretta/player-webtv.js`): la modalità si
cambia senza toccare il resto.

- **HLS**: su **Safari, iPhone e iPad** lo legge il browser; su **Chrome, Edge,
  Firefox e Android** lo legge **hls.js 1.7.3** (`diretta/hls.min.js`, libreria
  libera Apache 2.0, versione fissata e salvata nel sito). Se Azoto desse un
  link DASH (`.mpd`) funziona anche quello, con dash.js 5.2.1 salvato nel sito.
- **Nessun logo di terzi**, **comandi nostri**: play/pausa, muto e volume,
  **"IN DIRETTA"** al punto live, **"Torna in diretta"** solo quando si è rimasti
  indietro, **qualità** ("Automatica" più quelle del flusso, partendo dalla più
  bassa), **schermo intero** anche su iPhone e iPad, barra per tornare indietro
  se il flusso lo permette. Tastiera (con il fuoco sul video): spazio, F, M,
  frecce per il volume.
- **Parte senza audio** con il grande pulsante **"Attiva l'audio"**.
- Niente menu del tasto destro, niente "scarica video", niente
  picture-in-picture.
- **Se il flusso si interrompe**: "Stiamo ricollegando la diretta…" e nuovi
  tentativi **da soli, senza ricaricare**, con attese **crescenti e casuali**
  (1-3 s, 2-6, 4-12, 8-24, poi 15-45 s: mille persone non riprovano mai nello
  stesso secondo). Il player si accorge anche di un video fermo senza errori e
  di una playlist che non avanza.
- **Link di riserva**: se il link in uso non funziona per **più di 20 secondi**
  (fra 20 e 24, con qualche secondo casuale), ogni pagina passa **da sola**
  all'altro. Se a cadere è la rete di chi guarda, non si passa alla riserva. In
  *Regia*: "Passa alla riserva per tutti" e "Torna al link principale per tutti".
- **Link firmati a tempo**, se Azoto li usa: vedi il §5.5.

### 5.4 La prova del link, prima di salvarlo

Ogni indirizzo nuovo si prova con **"Prova"** (e comunque prima di salvare):

- **Player Azoto**: il servizio controlla che la pagina del player risponda e
  che si possa incorporare nel nostro sito; poi un'anteprima nella gestione.
- **Flusso diretto**: il servizio scarica la playlist e dice se è una diretta,
  quante qualità ha, se si può tornare indietro, il ritardo stimato e se il
  server **permette la riproduzione dal nostro sito** (CORS); il browser della
  gestione lo conferma; poi un'anteprima con il player vero. Quando la
  correzione tocca alla web TV, la gestione prepara il **testo da girarle**.
- **Si rifiuta subito**, con il motivo: indirizzi `http://`, indirizzi di altri
  siti nel campo del player Azoto, un `.m3u8` nel campo del player (va nel
  campo del flusso) e viceversa, link per trasmettere (`rtmp://`…), file video,
  link con nome utente e password, indirizzi interni.
- **Si salva dopo una conferma** quando il problema può risolversi prima della
  diretta (per esempio il flusso non risponde ancora, o manca il CORS).

Le regole stanno in `diretta/sorgente-video.js`, le stesse per gestione, pagina e
servizio (`email-service/lib/diretta-sorgente-video.js` ne è una copia identica,
controllata dalle prove). L'elenco degli indirizzi ammessi per il player è in
`HOST_AZOTO`, in cima a quel file.

### 5.5 Chi può vedere la diretta: il limite, detto chiaramente

- **Modalità A**: l'indirizzo del player di Azoto non è nel codice pubblico e
  arriva solo a chi è entrato, ma **una volta aperta la diretta chiunque può
  copiarlo** (dagli strumenti del browser) **e girarlo ad altri**: la pagina di
  Azoto oggi si apre da qualsiasi sito e anche direttamente. Da parte nostra
  non si può impedire. **La protezione vera la può dare solo Azoto**, limitando
  il player al nostro dominio (domanda 1 del §5.8).
- **Modalità B**: stesso limite per il link `.m3u8`, a meno che Azoto usi **link
  firmati a tempo**. La gestione e il servizio sono già pronti (sezione "Link
  firmati" della gestione, schemi **nginx `secure_link`** e **Akamai EdgeAuth**):
  ogni partecipante riceve un link **suo, che scade**, e la chiave segreta resta
  nel servizio. Senza link firmati, la sola limitazione al dominio (CORS e
  referrer) ferma i browser ma non un programma come VLC.

### 5.6 La sicurezza della pagina (Content-Security-Policy)

La pagina della diretta dice al browser da dove può caricare le cose:

- **`frame-src https://cdn.azotosolutions.com`**: l'unico iframe possibile è il
  player di Azoto.
- **`script-src 'self' https://www.gstatic.com`**: solo il codice del nostro sito
  (compresa hls.js, salvata nel sito) e l'SDK di Firebase. Non serve
  `azotosolutions.com`, perché il loro script non lo carichiamo (§5.1).
- `connect-src` e `media-src` per ora ammettono ogni indirizzo `https:`: servono
  alla modalità B, e il server del flusso `.m3u8` di Azoto non lo conosciamo
  ancora. Quando Azoto darà il link, si restringono al suo dominio (una riga in
  `diretta/index.html`).

### 5.7 La banda: 1000 persone insieme

Il video lo trasmette la **rete di distribuzione (CDN) di Azoto**, non il nostro
sito. La banda che serve, con 1000 persone collegate insieme:

| Qualità | Bitrate tipico | 1000 persone |
|---|---|---|
| 480p | ~1-1,5 Mbit/s | ~1-1,5 Gbit/s |
| 720p | ~2,5-3 Mbit/s | **~3 Gbit/s** |
| 1080p | ~4,5-6 Mbit/s | ~5-6 Gbit/s |

In pratica si sta fra 2 e 4 Gbit/s al picco, circa **1-1,5 TB di traffico in 3
ore**. Il peer-to-peer del player di Azoto (§5.1) sposta una parte di questo
traffico sulle connessioni degli spettatori. La domanda 4 serve a sapere se
Azoto regge.

### 5.8 Le domande per Azoto (pronte da inoltrare)

> Buongiorno,
> il 2 ottobre trasmetteremo in diretta l'evento Next Generation Business di
> Napoli sul nostro sito, https://nextgenerationbusiness.it, con il vostro player
> (il canale che ci avete indicato), per circa 1000 persone collegate insieme.
> Vi chiediamo:
>
> 1. Potete limitare il nostro player al solo dominio nextgenerationbusiness.it,
>    così che non si apra da altri siti o copiando il link?
> 2. Potete togliere il vostro logo dal player (versione senza marchio)?
> 3. Ci date anche il link diretto HLS (.m3u8) in https, con CORS abilitato per
>    nextgenerationbusiness.it?
> 4. Reggete 1000 spettatori contemporanei? Il flusso ha più qualità (adattivo)?
> 5. Il player accetta parametri (avvio automatico, muto, colori)? Comunica con la
>    pagina (postMessage) per sapere se la diretta è partita?
> 6. Avete un canale o un server di riserva in caso di problemi?
> 7. Qual è il ritardo rispetto al vivo? Possiamo fare una prova qualche giorno prima?
> 8. Il player usa la libreria swarmcloud-hls, che fa scambiare il video fra gli
>    spettatori (peer-to-peer, WebRTC, server meshify.cloud): si può disattivare
>    per il nostro evento? Se resta attivo, dove sono i server e che dati
>    trattano (serve per la nostra informativa privacy)? E potete fissare le
>    versioni delle librerie caricate da cdn.jsdelivr.net (oggi "@latest")?
>
> Grazie.

La domanda 8 l'abbiamo aggiunta noi dopo aver letto il codice del player (§5.1).

### 5.9 Provare su iPhone, iPad e Safari (a mano)

Le prove automatiche usano Chromium e una pagina finta al posto del player di
Azoto (per non dipendere dalla loro rete): il player vero, Safari e iPhone si
provano a mano, con Azoto che trasmette una prova:

1. Crea un evento di prova nella gestione, "Tipo di player": **Player Azoto**,
   incolla il codice di Azoto, "Prova", salva, "Vai in onda".
2. Entra con un partecipante di prova da **iPhone con Safari** (e da iPad, e da un
   Mac con Safari). Controlla: il player compare solo dopo "Vai in onda"; si
   avvia con un tocco su play; l'audio si sente (volume del player o tasti del
   telefono); **"Schermo intero"** dà la vista a pagina intera orizzontale e si
   esce con il pulsante; la nota sotto il video; ruota il telefono.
3. **Regia**: cambia l'indirizzo del player durante la prova (o metti lo stesso):
   le pagine aperte si aggiornano da sole. "Termina": il player sparisce e
   compare la nostra schermata di chiusura.
4. **Rete**: modalità aereo per 20 secondi e poi toglila: se il player non torna,
   dopo 15 secondi compare "Ricarica il video".
5. Ripeti con un telefono **Android** (Chrome) e un computer con **Chrome, Edge e
   Firefox**.
6. Quando Azoto darà il link `.m3u8`: incollalo nel campo del flusso diretto,
   "Prova", poi in *Regia* "Passa al flusso diretto per tutti", e ripeti i punti
   2-5 (qui con i nostri comandi, "Attiva l'audio", "Torna in diretta" e la
   riserva).

---

## 6. Come si usa: dalla settimana prima al giorno dopo

### 6.1 Il primo accesso del gestore

1. Apri `https://nextgenerationbusiness.it/diretta/gestione/` e premi
   **"Primo accesso o password dimenticata"**; scrivi la tua email (deve essere
   in `DIRETTA_ADMIN_EMAILS`).
2. Arriva un'email con il collegamento: scegli la password (almeno 8 caratteri,
   con lettere e numeri). Il collegamento vale un'ora.
3. Entra con email e password. La sessione resta aperta sul dispositivo.

### 6.2 La settimana prima

1. **Evento** (scheda *Evento*): identificativo (per Napoli `napoli-2026`,
   lo stesso scritto in `assets/diretta-stato.js`), titolo, luogo, data, ora
   di inizio e di fine, **tipo di player** e codice (o indirizzo) del player di
   Azoto (§5), programma (una voce per
   riga: `09.00 Accoglienza`), pagina dell'evento (`/napoli_ottobre_2026/`),
   le caselle dei **promemoria** (giorno prima, un'ora prima: accanto c'è quante
   persone li riceveranno) e, se serve, **"un solo dispositivo"**.
2. **Partecipanti** (scheda *Partecipanti*): carica il file degli iscritti
   online, CSV o Excel, con le colonne nome, cognome, email, azienda (vanno bene
   anche "Nominativo" in una colonna sola, "E-mail", "Società"…: se la pagina
   non le riconosce, ti chiede di abbinarle; se il file ha più fogli, di
   sceglierlo). C'è un file di esempio con tutti i casi:
   `diretta/prove/esempio-partecipanti.csv` (indirizzi finti su domini che non
   ricevono posta: serve solo a vedere l'anteprima in un evento di prova, **non
   inviare le credenziali agli indirizzi del file**).
   L'**anteprima** controlla riga per riga le **email** e mostra i problemi, a
   colori: email mancanti o non valide, nome o cognome vuoti, doppioni nel
   file, persone già presenti (vengono solo aggiunte all'evento, senza password
   nuova), la stessa email per persone diverse (da correggere), un file salvato
   con la codifica sbagliata (lettere come `Ã²`). Il filtro "Solo da controllare"
   mostra solo quelle. Per ogni riga puoi correggere o escludere;
   **"Crea gli account" resta spento finché c'è qualcosa da sistemare**. Gli
   account si creano a gruppi (per non superare i limiti di Firebase); se la
   rete cade, "Riprendi" continua senza doppioni. Ricaricare lo stesso file più
   tardi non crea niente di doppio. **Creare gli account non manda nessuna
   email**: le credenziali partono al punto 3, quando decidi tu.
3. **Email** (scheda *Email*): **"Invia email di prova a me"** e controlla la
   tua casella (anche sul telefono). Poi **"Invia le credenziali a chi non le ha
   ancora (N)"**. L'invio va avanti a gruppi finché la pagina è aperta; se la
   chiudi, lo porta avanti il lavoro programmato ogni 5 minuti. Per ogni persona
   vedi lo stato: *da inviare*, *in coda*, *inviata*, *respinta*, *errore*,
   *incerto* (l'invio si è interrotto a metà: forse è partita; si reinvia solo a
   mano, dopo aver controllato). Nessuno riceve mai due volte la stessa email.

### 6.3 Il giorno prima

- *Email* → **"Aggiorna esiti"**: legge da Brevo gli indirizzi che hanno
  rimbalzato (servono `BREVO_API_KEY`).
- Correggi gli indirizzi respinti (*Partecipanti* → **Correggi**) e premi
  **"Reinvia a chi non l'ha ricevuta (N)"**: solo respinte ed errori, mai chi è
  già entrato.
- Chi telefona perché non trova la password: *Partecipanti* → cerca per nome,
  email o azienda → **"Nuova password da comunicare a voce"** (la
  vedi una volta sola) oppure **"Reinvia credenziali"** (email con una password
  nuova: la vecchia smette di funzionare).
- Prova il link: *Regia* → **"Vedi come un partecipante"** (si apre in una
  scheda nuova, senza registrare presenze; "Chiudi l'anteprima" non ti fa uscire
  dalla gestione).

### 6.4 Il giorno dell'evento (scheda *Regia*)

- Quando Azoto trasmette, **"Vai in onda"**: tutte le pagine aperte passano da
  sole dall'attesa alla diretta (il player compare solo adesso). Il contatore mostra le persone collegate in
  questo momento (si aggiorna ogni 20 secondi).
- **Pausa** (con l'orario di ripresa, facoltativo) e **Riprendi**: in pausa i
  partecipanti vedono "Pausa: si riprende alle 14.30", non la fine.
- **"Avviso a tutti"**: una riga che compare in cima alla pagina di tutti
  ("Problema tecnico: riprendiamo tra 5 minuti").
- **Tipo di player per tutti**: la regia mostra la modalità in uso. **"Passa al
  flusso diretto per tutti"** e **"Torna al player Azoto per tutti"** spostano
  tutti insieme, senza ricaricare (il flusso diretto si può scegliere solo
  quando c'è il link `.m3u8`).
- **Cambio del player Azoto**: nella parte *Player Azoto* incolla il nuovo codice
  o indirizzo, "Prova il player", "Cambia il player": chi guarda passa al nuovo
  indirizzo da solo. **"Guarda"** apre il player in anteprima.
- **Solo in modalità B, cambio del link del flusso**: incolla il nuovo link
  (principale o di riserva) e "Prova il link": la regia lo prova (§5.4), anche in
  una piccola anteprima, e lo blocca se non si può usare (se la web TV non ha
  ancora cominciato a trasmettere, lo salva dopo una conferma). Chi guarda passa
  al nuovo link da solo, senza ricaricare. Cambiare solo la riserva non
  disturba chi sta guardando il principale.
- **Solo in modalità B, link in uso per tutti**: la regia mostra quale link del
  flusso stanno guardando i partecipanti. **"Passa alla riserva per tutti"** e **"Torna al link principale
  per tutti"** li spostano tutti insieme, senza ricaricare; con il link già
  scelto compare **"Riporta tutti sul link principale"** (o *sulla riserva*),
  che riporta anche chi era passato da solo all'altro link per un guasto.
  **"Guarda"** apre in anteprima il principale o la riserva, come lo vedono i
  partecipanti (anche con i link firmati).
- Alla fine, **"Termina"**. Se la riapri ("Vai in onda" di nuovo), le pagine
  ripartono.

### 6.5 Dopo

*Esporta* → file Excel con due fogli: **Partecipanti** (stato dell'account e
delle email, primo collegamento, ultimo segnale, **minuti collegati durante la
diretta**, numero di collegamenti, ultimo accesso) e **Accessi** (ogni accesso:
quando, chi, da che dispositivo). I minuti sono stimati dalla pagina (un
segnale al minuto, verificato dalle regole con l'orario del server, limitato
alla durata dell'evento): adatti agli attestati di partecipazione, con una
precisione di un paio di minuti per collegamento.

### 6.6 Il sito: popup, pillola e pagina di Napoli

- **Home**: dal 25 settembre (7 giorni prima) fino alla fine della diretta
  compare una volta per sessione il popup **"Diretta Napoli"**, con la
  precedenza sugli altri popup (quel giorno non compaiono). Il giorno
  dell'evento, se è in onda, dice **"Siamo in diretta: accedi"** con il bollino
  rosso. "Non mostrare più" lo spegne; resta comunque, in basso a sinistra, una
  piccola **pillola fissa "Diretta Napoli"** per tutta la finestra.
- **Pagina di Napoli**: voce **"Diretta"** nel menu, accanto a "Save the date"
  (sul telefono una pillola accanto al pulsante del menu), e la sezione **"Segui
  la diretta"** sotto la prima schermata. Mentre si è in onda, bollino rosso
  **"IN DIRETTA"**; in pausa "In pausa"; dopo la fine "La diretta si è conclusa".
- **Dettagli**: fra 1000 e 1199 px (portatili piccoli, iPad in orizzontale),
  finché la voce "Diretta" è nel menu, il menu della pagina di Napoli è a
  tendina con la pillola "Diretta" accanto (non c'era spazio per una voce in
  più); dopo la fine della diretta torna su una riga come prima. La pillola
  della home sta sotto gli avvisi del sito (esito del modulo newsletter, banner
  degli eventi). Se nella stessa sessione si è già visto il popup del bando o
  del FCD, quello della diretta non compare (resta la pillola): mai due popup
  nella stessa sessione.
- **Da dove arriva lo stato "in onda"**: `api/diretta-stato`, con la cache CDN
  di Vercel (una lettura di Firestore ogni 30 secondi circa, qualunque sia il
  numero dei visitatori), chiesto solo da 3 ore prima a 3 ore dopo l'evento. Il
  bollino può arrivare con **1-2 minuti di ritardo** rispetto alla regia.
- **Per un nuovo evento** (o se cambiano data e orario): aggiorna `EVENTO` in
  cima ad `assets/diretta-stato.js` (date con il fuso: `+02:00` d'estate,
  `+01:00` d'inverno).

## 7. L'email come accesso, doppioni, password

**Si entra con l'email.** Nessun nome utente: la persona scrive l'indirizzo
email con cui si è iscritta e la password che le abbiamo mandato. L'email si
confronta senza maiuscole e senza spazi (anche quelli invisibili che arrivano
da Excel, e un `mailto:` davanti); punti e `+` restano come sono. È una sola
regola (`email-service/lib/diretta-email.js`), la stessa per pagina, gestione e
servizio.

**Un'email = un account = una persona.** Chi è iscritto a più eventi ha un solo
account con più eventi.
1. Se l'email c'è già, o compare due volte nel file, non si crea niente di
   nuovo: la persona viene solo aggiunta all'evento. Ricaricare lo stesso file
   non crea niente.
2. **La stessa email per persone diverse** (nel file, o rispetto a un account
   che c'è già con un altro nome) è da correggere prima di creare: con l'email
   come accesso non può valere per due persone. L'anteprima la segna in rosso e
   "Crea gli account" resta spento.
3. **Garanzia tecnica.** Ogni email si **prenota** con una transazione nel
   server (`indirizzi/{email}`): due caricamenti contemporanei, o un
   caricamento e un'iscrizione dal modulo del sito nello stesso momento, non
   possono creare due account per la stessa email. Le prove lo dimostrano
   (§10).

**L'email tecnica.** Dietro ogni persona c'è un account Firebase con un'email
tecnica che nessuno vede e a cui non arriva niente
(`p3f9c…@utenti.diretta.nextgenerationbusiness.it`, un codice interno): la
password si prova solo attraverso il nostro servizio, con il blocco dei
tentativi, e cambiare l'email di una persona non tocca l'account.

**Le password.** Generate dal servizio: 10 caratteri, senza quelli che si
confondono (0/O/o, 1/l/I/i), sempre con maiuscole, minuscole e cifre. Non
vengono **mai** salvate: esistono solo nel momento in cui si impostano
sull'account e si mettono nell'email (o si mostrano una volta in gestione con
"Nuova password da comunicare a voce"). Per questo **"Reinvia credenziali"
genera una password nuova**: quella vecchia non la conosce più nessuno.

**Quando partono le email con la password.** Mai da sole:
- **i primi iscritti**: carichi il file in gestione e crei gli account (nessuna
  email parte); le credenziali partono **quando decidi tu**, con "Invia le
  credenziali" nella scheda *Email*;
- **chi si iscrive dopo**, dal modulo del sito: se nella scheda *Evento* è
  acceso **"Invia subito la password a chi si iscrive dal modulo del sito"**
  (spento di base), chi si iscrive online dal modulo della pagina dell'evento
  riceve subito l'email con la password; se ha già un account (per un altro
  evento) riceve invece "Sei iscritto anche a…", senza password nuova. Se Brevo
  non risponde, l'email resta in coda e parte appena possibile. Accendilo dopo
  aver caricato e inviato la prima lista. Il modulo è pubblico, quindi ha dei
  **limiti**: al massimo `DIRETTA_MODULO_RETE_ORA` (10) iscrizioni all'ora
  dalla stessa rete e `DIRETTA_MODULO_ORA` (60) all'ora in tutto fanno partire
  la password da sole; oltre, l'account si crea lo stesso ma la password resta
  **"da inviare"**, con il motivo scritto accanto nell'elenco dei
  partecipanti: la mandi tu con "Invia le credenziali" o "Invia ora". Su
  Vercel il modulo del sito **non aspetta** il lavoro della diretta: risponde
  subito, nello stesso tempo per un indirizzo nuovo e per uno già iscritto (se
  aspettasse, il tempo della risposta direbbe chi è già iscritto).

**Una password per persona, e quella che ha non si tocca.** Chi ha già una
password che funziona riceve "Sei iscritto anche a…" invece di credenziali
nuove (che cancellerebbero la sua): chi ha già ricevuto le credenziali di un
altro evento, chi ne ha avuta una a voce ("Nuova password da comunicare a
voce"), chi è **già entrato** nella diretta e chi ha chiesto **"Password
dimenticata?"** (sul profilo resta quando: forse la password se l'è scelta
lui). Se correggi l'email di una persona, quello che era successo prima
(credenziali, reimpostazioni, accessi) era di un'altra casella e non conta
più. Solo il tuo **"Reinvia credenziali"** manda comunque una password nuova,
e l'email dice che quella di prima (anche se l'aveva scelta lui) non vale più.

**Iscrizioni dal modulo da verificare.** Due casi in cui la diretta non
iscrive da sola chi arriva dal modulo del sito, e lo mette nella scheda
*Partecipanti*, riquadro **"Iscrizioni dal modulo da verificare"** (compare
solo quando c'è qualcosa): l'email è **già l'account di un'altra persona**
(due colleghi con `info@…`: la seconda persona non finisce nell'account della
prima, che non si tocca) e l'indirizzo che il modulo del sito ha accettato ma
la diretta **non accetta** (accenti, punto prima della @…). Nessun account,
nessuna email: l'iscrizione al sito resta valida. Sistema a mano (per esempio
chiedi un indirizzo suo e caricala con il file) e premi "Segna come vista".

**Email o password sbagliate.** La risposta è sempre "Email o password non
corretti.", nello stesso tempo (mai prima di 0,9 secondi, più fino a 0,3 a
caso: sopra il tempo che servono Firestore e Google per controllare davvero
una password), sia che l'email non esista sia che la password sia sbagliata:
non si scopre chi è iscritto. Sotto ci sono "Password
dimenticata?" e **"Non sei ancora iscritto? Iscriviti qui."**, che porta al
modulo di iscrizione (indirizzo in `diretta/config.js`, campo `iscrizione`).
Un account disattivato, con la password giusta, legge "Il tuo accesso è stato
disattivato. Scrivi all'assistenza." Quando lo riattivi, i suoi tentativi
sbagliati si azzerano: entra subito, anche se nel frattempo aveva provato.

**Password dimenticata.** La persona scrive la sua email e legge sempre la
stessa risposta, nello stesso tempo, iscritta o no: "Se l'indirizzo è iscritto
alla diretta, tra poco ricevi un'email con il collegamento per scegliere una
nuova password. Controlla anche nella cartella Spam o Promozioni." Il
collegamento arriva solo a chi è iscritto (vale un'ora, una volta); a chi non è
iscritto non parte niente, e sotto la risposta c'è "Non sei ancora iscritto?
Iscriviti qui."

**Lo Spam.** Ogni email della diretta, la pagina di accesso e la pagina di
Napoli ricordano: "Non trovi l'email? Controlla nella cartella Spam o
Promozioni e segna il mittente come sicuro."

---

## 8. Sicurezza: cosa è protetto e come

- **Regole di Firestore**: un partecipante legge il proprio profilo e il proprio
  evento, nient'altro; scrive solo il proprio segnale di presenza, con l'orario
  del server e al massimo uno ogni 50 secondi. Tutto il resto lo scrive solo il
  servizio. (Prove: [§10](#10-le-prove).)
- **Tentativi**: dopo 5 password sbagliate di fila dallo stesso dispositivo o
  rete, attesa crescente (30 s, 1 min, 2 min… fino a 15 min). In più un tetto
  largo per email da qualunque provenienza (50 errori all'ora) e uno per
  rete: al massimo 40 password sbagliate ogni quarto d'ora (finestre fisse:
  :00, :15, :30, :45), poi tutta la rete aspetta almeno 5 minuti. Il tentativo
  si conta **prima** della verifica, quindi i limiti reggono anche a raffiche
  di richieste simultanee (la prova: su 100 tentativi simultanei ne arrivano
  alla verifica 40); gli accessi riusciti restituiscono subito il loro
  tentativo, e se molte persone della stessa rete entrano nello stesso secondo
  al massimo si aspetta qualche secondo e compare "riprova", mai un blocco. Il
  blocco non è solo sul nome, apposta: altrimenti chiunque potrebbe tenere
  fuori una persona sbagliando la password al posto suo.
- **Risposte uguali**: "password dimenticata" e "primo accesso" dei gestori
  rispondono sempre con lo stesso testo e in 2,5-2,9 secondi, così non si
  scopre chi è iscritto. Anche quando Brevo o Google sono lenti: allo scadere
  dei 2,5-2,9 secondi la risposta parte comunque e l'invio finisce dopo, con
  `waitUntil` di Vercel (per questo `api/diretta-accesso.js` ha fino a 60
  secondi in `vercel.json`); ogni account può generare al massimo 3 di queste
  email al giorno. Tetti orari a finestra
  fissa: "password dimenticata" 20 richieste all'ora per rete e 200 email
  all'ora in tutto; "primo accesso" dei gestori 10 all'ora per rete e 20 email
  all'ora (tetto separato, così un'ondata di richieste dei partecipanti non
  blocca i gestori). In una raffica ne passano meno, mai di più. Anche
  "Email o password non corretti." parte sempre dopo 0,9-1,2 secondi, che
  l'email sia iscritta o no, e il modulo di iscrizione del sito risponde senza
  aspettare la diretta (`waitUntil`): nessuno dei due tempi dice chi è
  iscritto.
- **Il modulo del sito è pubblico**: le password che fa partire da sole hanno
  un limite per rete e uno orario complessivo (tenuti nel progetto della
  diretta, in `limiti/`), e al massimo il 60 % del tetto giornaliero; la stessa
  email di un'altra persona non si unisce mai al suo account (finisce fra le
  iscrizioni "da verificare").
- **Gestori**: l'elenco sta nella variabile `DIRETTA_ADMIN_EMAILS` e si
  controlla a ogni chiamata; l'account di gestione lo attiva solo il servizio
  ("Primo accesso o password dimenticata" nella pagina di gestione), e chi
  provasse a registrarsi da solo con l'email di un gestore non passa. Togliere
  un'email dall'elenco chiude la porta subito, e il lavoro programmato
  disattiva l'account.
- **Dati nelle pagine e nelle email**: nomi, aziende e titoli non diventano mai
  codice HTML (niente `innerHTML` con dati, escape nelle email, e una Content
  Security Policy sulle pagine della diretta).
- **Separazione dall'area riservata**: progetto diverso, chiave diversa
  controllata all'avvio, nessun file in comune (prova automatica).

---

## 9. Tenuta con 1000 persone: stime e piani

*Scenario: 1000 persone, diretta di 3 ore, collegate in media 3,5 ore (si entra
prima dell'inizio), 10 cambi di stato o di video durante la giornata.*

### Firestore, giorno dell'evento

Due scenari: quello della richiesta (**3 ore** di diretta, persone collegate in
media 3,5 ore perché si entra prima) e la **giornata vera di Napoli** (dalle
9.00 alle 17.30, con un'ora di pausa pranzo: persone collegate in media 7 ore).
In entrambi 1000 persone e una decina di cambi di stato o di video.

| Voce | 3 ore: letture | 3 ore: scritture | Napoli 9.00-17.30: letture | Napoli: scritture |
|---|---:|---:|---:|---:|
| Segnali di presenza (uno al minuto per persona, solo da un'ora prima a mezz'ora dopo) | — | 210.000 | — | 420.000 |
| Controlli delle regole a ogni segnale (stato dell'account; stato dell'evento quando si aggiunge un minuto) | ~390.000 | — | ~780.000 | — |
| Accessi (servizio): email, tentativi, profilo, evento, registro | ~7.000 | ~6.000 | ~9.000 | ~8.000 |
| Pagina: profilo, primo arrivo dell'evento, controllo delle regole | ~3.000 | — | ~5.000 | — |
| Ogni modifica dell'evento arriva a tutti (10 × 1000, con il controllo delle regole) | ~20.000 | — | ~30.000 | — |
| Gestione: elenchi, contatore ogni 20 s, esportazione | ~15.000 | ~1.000 | ~20.000 | ~1.000 |
| Promemoria dell'ora prima | ~2.000 | ~2.000 | ~2.000 | ~2.000 |
| **Totale** | **~437.000** | **~219.000** | **~846.000** | **~431.000** |
| Spark (gratuito): quota al giorno | 50.000 | 20.000 | 50.000 | 20.000 |
| **Blaze**, oltre la quota gratuita, prezzi `eur3` (0,06 $ ogni 100.000 letture, 0,18 $ ogni 100.000 scritture) | ~0,23 $ | ~0,36 $ | ~0,48 $ | ~0,74 $ |

**Spark non regge in nessuno dei due casi** (le scritture finirebbero dopo
circa 20 minuti di diretta); **Blaze costa meno di 1 $ per 3 ore e circa
1,2 $ per la giornata intera**. I giorni prima (creazione degli account, invio
delle credenziali, promemoria del giorno prima) stanno quasi tutti dentro la
quota gratuita giornaliera. I prezzi di Firestore cambiano poco nel tempo ma
vanno ricontrollati sul listino (<https://firebase.google.com/pricing>): anche
raddoppiati, restano pochi euro.

Il segnale di presenza è l'unica voce che conta davvero. È **una scrittura al
minuto per persona**, con una partenza casuale nei primi 60 secondi (mai 1000
scritture nello stesso secondo: la prova di carico misura il picco), e si
manda solo nelle viste di attesa e di diretta, da un'ora prima a mezz'ora dopo
l'evento, da una sola scheda del browser. In pausa il segnale continua (serve
al contatore) ma non aggiunge minuti.

### Vercel (piano Pro)

| Voce | Chiamate |
|---|---:|
| Accessi (con la richiesta preliminare del browser) | ~3.000 |
| Gestione (contatore ogni 20 s, regia, elenchi) | ~1.000 |
| Stato "in onda" per home e Napoli (servito dalla cache CDN; alla funzione arriva circa 1 chiamata ogni 30 s per zona) | ~1.500 (Napoli: ~3.000) |
| Lavoro programmato (ogni 5 minuti) | 288 |
| **Totale del giorno** | **~6.000** (Napoli: ~8.000) |

Il piano Pro include 1 milione di chiamate al mese: la diretta ne usa lo
0,6 %. Nessuna funzione è sul percorso del video: lo trasmette Azoto (a
1000 persone insieme, circa 3 Gbit/s: vanno chiesti a loro, §5.7 e §5.8).

### Firebase Authentication e Brevo

Account con email e password: gratuiti. Brevo: vedi §4 (~3.100 email).

### La prova di carico: 1000 accessi in 2 minuti

`diretta/prove/carico.sh` (emulatori di Firebase + funzioni vere del servizio
in locale + `carico.prova.js`). Prima si creano **1000 partecipanti con l'API
di gestione** (40 chiamate `crea` da 25 righe), poi
ognuno, a un istante casuale dentro i 2 minuti, fa quello che fa la pagina:
accesso con l'email, token, lettura del
profilo e dell'evento con le regole vere, primo segnale di presenza a un ritardo
casuale (0-60 s) e il secondo 60 secondi dopo. Risultato dell'ultima esecuzione,
sul codice dell'accesso con l'email (26 settembre 2026, questa macchina: 4
processori):

| Passo | n | p50 | p95 | p99 | massimo |
|---|---:|---:|---:|---:|---:|
| accesso con l'email (funzione `diretta-accesso`: blocco dei tentativi, verifica, token) | 1000 | 32 ms | 56 ms | 81 ms | 127 ms |
| accesso a Firebase con il token | 1000 | 3 ms | 6 ms | 12 ms | 35 ms |
| lettura del profilo (regole) | 1000 | 5 ms | 18 ms | 37 ms | 509 ms |
| lettura dell'evento (regole) | 1000 | 6 ms | 20 ms | 42 ms | 154 ms |
| primo segnale di presenza | 1000 | 8 ms | 24 ms | 49 ms | 69 ms |
| segnale "continua" (+60 s, regole con l'orario del server) | 1000 | 8 ms | 17 ms | 39 ms | 46 ms |
| `crea` (25 righe, nella preparazione) | 40 | 6,1 s | 6,6 s | 6,6 s | 6,6 s |

- **Errori: nessuno** su 6000 operazioni; 1000 presenze scritte, tutte con il
  secondo segnale accettato dalle regole.
- **Picco di accessi in un secondo: 16; picco di scritture di presenza in un
  secondo: 24** (su 1000 persone): la partenza casuale funziona, non arrivano
  mai tutte insieme.
- Creazione dei 1000 account: **250 secondi** (circa 4 al secondo: è il
  limitatore delle scritture su Firebase Auth, 8 al secondo, che tiene lontani i
  limiti di Google; con la pagina di gestione sono 40 gruppi da 25).
- Tutti i 1000 accessi arrivano dallo stesso indirizzo (127.0.0.1): nessuno è
  stato bloccato o rallentato dal limite per rete, che conta solo le password
  sbagliate.
- Il contatore della gestione alla fine ne vedeva 933: la prova smette di
  mandare segnali dopo il secondo, e chi era arrivato nei primi secondi aveva
  l'ultimo segnale da più di 150 secondi (la soglia del "collegato adesso").

**Cosa la prova NON dimostra.** Gli emulatori non sono i server di Google:
non applicano le quote di Spark, non chiedono gli indici compositi, non
limitano per IP né per account (`TOO_MANY_ATTEMPTS_TRY_LATER` di Identity
Toolkit) e non addebitano le letture delle regole; il servizio gira qui in
un solo processo e non su Vercel. La prova dice che il nostro codice regge il
volume **senza errori, senza contese e senza doppioni**; i tempi veri di
Google e Vercel sono di solito migliori ma vanno misurati sul progetto vero
(vedi [§12](#12-cosa-devi-fare-tu): prova con 300 accessi di prova la settimana
prima). Se Google dovesse limitare gli accessi che partono dagli IP di Vercel,
il servizio risponde "attendi un minuto" e lo scrive nel log.

---

## 10. Le prove

Tutte in `diretta/prove/` (più sette nel servizio, `email-service/prove/`).
Girano contro gli **emulatori di Firebase** (nessun progetto vero, nessuna
email vera: la posta diventa righe di un file) e con **Playwright** su
Chromium. Il video arriva da tre fonti di prova (`flusso-prova.js`); **nessuna
prova usa la rete vera di Azoto**:

- un **player di Azoto finto** al posto di quello vero, su
  `https://cdn.azotosolutions.com/cloudtv/…/player` intercettato dentro il
  browser (e, per la prova del link, dentro il servizio): una pagina "Player
  Azoto (prova)" con un suo pulsante play, che imita il vero (il rimando da
  `/player` a `/player/`), più un player che non risponde mai (i 15 secondi), uno
  che non si lascia incorporare e uno che rimanda a un altro sito. I canali
  usati nelle prove sono inventati (`livetv91`, `livetv92`…);
- una **web TV di prova** su `https://webtv.prova.test`: una diretta HLS vera
  trasmessa da **ffmpeg** (due qualità, segmenti da 2 secondi) che si può
  rompere a comando: link principale che cade, riserva, server senza CORS,
  diretta non ancora partita, pagina del player da incorporare, pagina che
  non si può incorporare. Anche la prova del link del servizio la raggiunge
  (solo nelle prove: `server-locale.js` con `DIRETTA_PROVE_WEBTV`);
- la **diretta pubblica di prova di Shaka Player** (Google), fatta apposta per
  provare i player: `https://storage.googleapis.com/shaka-live-assets/player-source.m3u8`
  e `.mpd`, sempre accesa, con più qualità e un'ora di DVR. Il browser di
  prova non esce in rete da solo: queste richieste passano da Node, senza
  cache.

```bash
cd diretta/prove
npm install                    # una volta: firebase-tools, firebase, playwright
pip install imageio-ffmpeg     # una volta, se ffmpeg non c'è già
node esegui-tutte.js           # tutte, circa 25 minuti
bash carico.sh                 # la prova di carico, circa 8 minuti
node e2e.prova.js              # solo il percorso completo
```

| Prova | Che cosa dimostra | Esito |
|---|---|---|
| `email-service/prove/diretta-email.prove.js` | la regola dell'email come accesso: maiuscole, spazi (anche invisibili, da Excel), `mailto:`, punti e `+` che restano; l'anteprima dell'import per email (nuovi, già registrati, già nell'evento, doppie nel file, email condivise da persone diverse, email mancanti o non valide) | 58 verdi, 0 rossi |
| `email-service/prove/diretta-password.prove.js` | 10 caratteri, niente 0/O/o/1/l/I/i, 20.000 password tutte diverse, nessuna password (né chiave dei link firmati) nei log o in Firestore | 9 verdi, 0 rossi |
| `email-service/prove/diretta-mail.prove.js` | le email: HTML e testo, credenziali in carattere a spaziatura fissa, collegamenti, date, assistenza, niente trattini lunghi, niente HTML iniettato, promemoria mai con la password; l'email delle credenziali con l'email e la password (mai un nome utente), «Sei iscritto anche a…» senza password, la frase dello Spam in ogni email; chi aveva già una password (anche scelta con «Password dimenticata?») legge che non vale più; **una password per persona**: chi ha ricevuto il collegamento di «Password dimenticata?», chi è già entrato o ha una password data a voce riceve «anche», le credenziali partite a un indirizzo poi corretto non contano | 240 verdi, 0 rossi |
| `email-service/prove/diretta-accesso-tempi.prove.js` | "password dimenticata" e "primo accesso" dei gestori rispondono sempre in 2,5-2,9 s, anche con Brevo lento (il resto finisce dopo, con `waitUntil`); un token scaduto fa uscire, un intoppo di Google (rete, chiavi pubbliche non scaricate) no; il gancio del modulo del sito su Vercel **non aspetta mai** la diretta (stessa risposta per lavori brevi e lunghi); vince il percorso della pagina, l'etichetta solo senza; "Email o password non corretti." mai prima di 900 ms (+ fino a 300 a caso) | 46 verdi, 0 rossi |
| `email-service/prove/diretta-video.prove.js` | il video: il codice vero di Azoto (si prende solo l'indirizzo), codice malevolo (script, `onload`, `onerror`, `javascript:`, `data:`, iframe di altri siti, due iframe), solo `https://cdn.azotosolutions.com` (niente altri siti, sottodomini, porte, http); il flusso diretto HLS `.m3u8` (anche con token) e DASH `.mpd`; rifiutati con il motivo RTMP/RTSP/SRT, file video, link con credenziali, indirizzi interni, un `.m3u8` nel campo del player e viceversa; tipo di player e passaggio A↔B (`evento-player`), link principale e di riserva, sorgente scelta dalla regia, nessun link nel documento pubblico fuori onda; la copia del servizio è identica a quella del sito | 265 verdi, 0 rossi |
| `email-service/prove/diretta-firma.prove.js` | i link firmati a tempo: nginx `secure_link` (con il vettore della documentazione di nginx) e Akamai EdgeAuth, durata, `validoSecondi`, acl non valide rifiutate, la chiave mai restituita | 64 verdi, 0 rossi |
| `email-service/prove/diretta-prova-link.prove.js` | la prova del link: il player di Azoto (si può incorporare? non risponde? rimanda altrove?), un indirizzo che non è di Azoto rifiutato senza nemmeno provarlo; per il flusso diretto playlist HLS principale e di una qualità, diretta o registrazione, qualità, DVR, codec, CORS su playlist e segmento, DASH, pagine incorporabili o no (`X-Frame-Options`, `frame-ancestors`), indirizzi interni rifiutati anche dopo un redirect o con il DNS che cambia, tempi e dimensioni massime | 120 verdi, 0 rossi |
| `regole.prova.js` | le regole di Firestore: un partecipante legge solo il suo evento e il suo profilo; presenze solo nelle forme e nei tempi previsti; account disattivato o secondo dispositivo | 65 verdi, 0 rossi |
| `separazione.prova.js` | nessun collegamento con l'area riservata; un token della diretta è rifiutato dal progetto dello studio | 14 verdi, 0 rossi |
| `doppioni.prova.js` | stesso file due volte, stessa email scritta in modi diversi, **tre caricamenti contemporanei** con le stesse persone, email condivise da persone diverse, correzioni: **zero account doppi, un account per email** | 89 verdi, 0 rossi |
| `accesso.prova.js` | accesso con l'email (anche in maiuscolo o con spazi), 5 errori e attesa crescente, 20 tentativi contemporanei (ne arrivano 5), 100 password sbagliate insieme dalla stessa rete (ne arrivano alla verifica al massimo 40), raffiche di "password dimenticata" (mai più di 20 email l'ora per rete, e sul profilo resta quando è partita), risposte e tempi uguali (mai prima di 900 ms), un account riattivato entra subito anche dalla rete da cui aveva sbagliato, il "Reinvia" a chi aveva scelto la sua password dice che non vale più, gestori (anche chi si registra da solo con l'email di un gestore), stato pubblico; link della web TV salvati come indirizzo, http e RTMP rifiutati; `link-video` solo a chi è iscritto, in onda, dal dispositivo ammesso e solo con il flusso diretto; lo stato pubblico non dice mai niente del player | 201 verdi, 0 rossi |
| `coda.prova.js` | 1000 credenziali con rifiuti, errori, un processo ucciso a metà, blocco di Brevo, tetto giornaliero, due giri insieme: **nessuna email doppia**; promemoria una volta sola e mai con la password; una sola password per persona (chi ha già le credenziali di un altro evento riceve «Sei iscritto anche a…»); il modulo del sito al massimo al 60 % del tetto giornaliero, le credenziali del gestore passano anche dietro un lotto tutto fermo | 164 verdi, 0 rossi |
| `iscrizioni.prova.js` | **le iscrizioni dal modulo del sito**, con il modulo vero (`api/iscrizione-nuova.js`) e i due progetti Firebase separati: interruttore spento (nessun account, nessuna email), acceso (account e password subito), iscrizione ripetuta (una sola password), email già con un account (evento aggiunto e «Sei iscritto anche a…», nessuna password nuova), pagina che non corrisponde a nessun evento, diretta non configurata (il modulo risponde come sempre), Brevo fermo (resta in coda); su Vercel il modulo risponde **nello stesso tempo** per un indirizzo nuovo e per uno già iscritto; vince il percorso della pagina; «Password dimenticata?» prima delle credenziali (la password scelta resta: «anche»); email corretta dal gestore (niente seconda password); **email di un'altra persona** e **email non accettata** (nessun account toccato, righe «da verificare»); limiti per rete, orario e 60 % del tetto; la conferma del sito per chi segue online | 100 verdi, 0 rossi |
| `pagina.prova.js` | la pagina della diretta su computer e iPhone (senza schermo intero, come Safari): accesso con l'email, «Non sei ancora iscritto? Iscriviti qui.», «Password dimenticata?» con la risposta sempre uguale e lo Spam; attesa, messa in onda, pausa dell'evento, fine e ritorno in onda, reimpostazione; **player Azoto**: un evento vecchio senza tipo di player che passa da solo alla modalità A, in onda senza indirizzo («Il video sta per arrivare»), indirizzo non ammesso (`javascript:`, http, un sito che imita Azoto: «Video non disponibile», nessun iframe, nessuna richiesta, e la CSP blocca davvero un iframe di un altro sito), player che non risponde con l'avviso a 15 secondi e «Ricarica il video»; **flusso diretto** con la web TV di prova: avvio muto con il grande «Attiva l'audio», il nostro `<video>` (niente comandi del browser, niente "scarica", niente picture-in-picture, tasto destro annullato), «IN DIRETTA», qualità, pausa e «Torna in diretta», scorciatoie, schermo intero, cambio del link senza ricaricare e senza aprire altri ascolti di Firestore, link non valido, connessione persa; e i casi difficili: un solo dispositivo con due browser veri, due schede e una congelata, localStorage bloccato, hls.js che arriva tardi, avvio automatico bloccato, anteprima del gestore, componenti di Firebase che non si scaricano | 60 verdi, 0 rossi |
| `gestione.prova.js` | la gestione contro il servizio vero, su computer, tablet e telefono: anteprima di un file CSV ed Excel controllata per **email** (nuovi, già registrati, doppie, email condivise da persone diverse, email sbagliate, correzioni ed esclusioni), creazione a gruppi con "Riprendi" **senza nessuna email** (partono solo con «Invia le credenziali»), l'interruttore «Invia subito la password a chi si iscrive dal modulo del sito» (con i suoi errori), ricerca e azioni sul partecipante, cambio dell'email; **il tipo di player**: Azoto predefinito, flusso diretto sceglibile solo con un `.m3u8`; il **codice vero di Azoto** (si salva solo l'indirizzo, controllato nella richiesta e in Firestore); **codice malevolo** (script, `onload`, `onerror`, `srcdoc`, secondo iframe, `javascript:`): nessuno script eseguito, nessuna richiesta ad altri siti; 9 indirizzi non ammessi rifiutati dalla pagina e dal servizio; «Prova il player» (si può usare, non si lascia incorporare, rimanda altrove, non risponde); regia in onda: A→B→A per tutti, cambio del player per tutti, il flusso in uso che non si può togliere; il documento pubblico dell'evento seguito per tutta la prova (mai indirizzi fuori onda, mai HTML, mai la chiave); il flusso diretto come prima (riserva, CORS, link firmati: la chiave non esce mai); regia (in onda, pausa, termina, connessi, vedi come un partecipante), email (prova, invio, reinvio), esportazione Excel riletta; il riquadro **«Iscrizioni dal modulo da verificare»** (righe, testo mai HTML, «Segna come vista», azioni protette) | 389 verdi, 0 rossi |
| `sito.prova.js` | popup della home (finestra di date, precedenza sugli altri popup anche ricaricando, ESC, sfondo, focus, "non mostrare più"), pillola, pagina di Napoli (menu, sezione, IN DIRETTA solo in onda), nessuna chiamata fuori dal giorno dell'evento | 287 verdi, 0 rossi |
| `e2e.prova.js` | **il percorso completo con tutto vero** (il player di Azoto è quello finto): il gestore si attiva dall'email, crea l'evento **incollando il codice di Azoto** (si salva solo l'indirizzo) e i partecipanti (nessuna email parte finché non preme «Invia le credenziali»), manda le credenziali; Mario le legge dalla posta, entra dal telefono **con la sua email**; il gestore accende l'interruttore e Luca, che si iscrive dal modulo del sito, riceve subito la password ed entra; aspetta (nessun player), va in onda e compare il player di Azoto (chi non ha fatto l'accesso non riceve l'indirizzo: né nella pagina, né nello stato pubblico, né da Firestore), schermo intero (vero sul computer, la vista orizzontale sull'iPhone), cambio del player senza ricaricare, connessione persa, pagina riaperta, pausa e fine (il player sparisce, restano le nostre schermate), un minuto di presenza, esce, «Password dimenticata?» (a chi non è iscritto non parte niente), accesso automatico; esportazione | 32 verdi, 0 rossi |
| `webtv.prova.js` | **le due modalità con la regia vera** (emulatori e servizio vero), su computer e iPhone. **Player Azoto**: prima dell'accesso nessuna richiesta ad Azoto; l'iframe con gli attributi e il titolo giusti, mai `azoto-player.js`; sotto il video solo «Schermo intero» e la nota; **niente sopra l'iframe** (un clic e un tocco veri sul play di Azoto arrivano); 16:9 senza bande né barre a 1440×900, 390×844, 360×740 e iPhone orizzontale; schermo intero vero sul computer e vista orizzontale sull'iPhone, senza ricaricare l'iframe; cambio del player e A→B→A senza ricaricare la pagina e senza altri ascolti di Firestore; player fermo: avviso a 15 secondi sotto il riquadro, «Ricarica il video» ricrea solo l'iframe; CSP. **Flusso diretto**: principale che cade → "Stiamo ricollegando la diretta…" e riserva; la regia sposta tutti; **flusso pubblico HLS di Shaka** (DVR, «Torna in diretta», qualità) e DASH; link firmati | 32 verdi, 0 rossi |
| `player.prova.js` | **il player del flusso diretto da solo**, con i flussi pubblici HLS e DASH di Shaka e la diretta ffmpeg: avvio, attributi del `<video>`, qualità senza doppioni, DVR, `cerca` e `vaiAlLive`, segnale fermo, **playlist ferma**, link firmati e rinnovo della firma **senza ricaricare**, link firmato molto lungo, pezzo di DASH perso, un indirizzo di pagina rifiutato ('link'), 404, link che non risponde, avvio bloccato, pagina nascosta | 73 verdi, 0 rossi |
| `anteprima/anteprima.prova.js` | l'anteprima con accessi di prova (vedi sotto), aperta come la apre claude.ai: iframe con sandbox e CSP stretta; accesso, regia che manda in onda, posta, file di esempio, «Vedi come un partecipante», esportazione, password dimenticata | 26 verdi, 0 rossi |
| `carico.sh` | 1000 accessi in 2 minuti (§9) | nessun errore |

Ultimo giro completo (`node esegui-tutte.js`), sul codice di questo branch
(26 settembre 2026, dopo le correzioni della revisione finale): 2324 verdi e 1
rosso, l'anteprima (qui sotto); l'anteprima rifatta da sola tre volte: 26 verdi
su 26. In tutto **2334 controlli verdi**. Due prove sono rosse ogni tanto, senza
che il codice c'entri in modo dimostrato:
- `anteprima/anteprima.prova.js`: a volte scade il tempo al passo "file di
  esempio", dove l'anteprima scarica dalla rete SheetJS (la libreria che legge
  Excel);
- `coda.prova.js`: 2 volte su una dozzina di giri, con una o due email
  «respinte» in meno del previsto nello scenario del processo ucciso a metà;
  tutti gli altri controlli di quei giri, compreso «nessuna email partita due
  volte», erano verdi. Non si è più ripresentata; se ricapita, la prova stampa
  lo stato di ogni indirizzo per trovarne la causa.

### L'anteprima con accessi di prova

Per far provare la diretta prima che esistano il progetto Firebase e le
variabili su Vercel c'è un'**anteprima** che gira tutta nel browser:

```bash
cd diretta/prove
npm install                        # una volta (serve esbuild)
node anteprima/costruisci.js       # crea risultati/anteprima/ (non versionata)
node anteprima/anteprima.prova.js  # la prova: percorso completo nel browser
```

Dentro ci sono le **pagine vere** (`diretta/index.html`, `reimposta.html`,
`gestione/`) e il **servizio vero** (`email-service/api/diretta-*.js`),
impacchettato con un Firebase finto in memoria che applica le stesse regole di
`firestore.rules`. Le email finiscono nella scheda «Posta di prova»; al posto
del player di Azoto c'è un riquadro «Player Azoto (anteprima)»
(`anteprima/player-azoto-anteprima.js`) e al posto del flusso diretto un video
di prova (`anteprima/player-anteprima.js`), con le stesse interfacce dei player
veri (con `node anteprima/costruisci.js --player-vero` c'è invece il player
vero del flusso con una web TV finta su `*.esempio.it`); l'esportazione Excel
si apre in una finestra.
Accessi di prova: `mario.rossi@esempio.it`, `annamaria.deluca@esempio.it` e
`nicolo.dangelo@esempio.it` (le password sono nella guida dell'anteprima), regia
`gestore@anteprima.it`. L'evento di prova è sempre di oggi. I pochi ritocchi
fatti alle pagine per farle girare lì (da dove si caricano l'SDK e SheetJS, la
navigazione fra le pagine) sono elencati in `anteprima/costruisci.js`, che si
ferma se non li trova: l'anteprima non può restare indietro rispetto al codice.

**Cosa le prove non coprono** (e va provato a mano, vedi §5.9 e §12): **il
player vero di Azoto** (le prove usano quello finto: il vero carica librerie e
video da server che l'ambiente delle prove non raggiunge), con il suo audio, i
suoi comandi e la capacità con 1000 persone; il flusso diretto vero di Azoto
(il CORS dei loro server); Safari vero su iPhone e iPad (Playwright usa
Chromium, che simula il telefono ma non è Safari); il codec H.264 (il Chromium
delle prove non lo ha: le dirette di prova sono in VP9/AV1); Firefox ed Edge;
Brevo vero; il progetto Firebase vero (quote, indici, limiti di Google).

**Gli screenshot** di consegna sono in [`diretta/screenshot/`](screenshot/)
(telefono e computer): accesso, attesa, **diretta con il player di Azoto**
(`03-diretta-azoto-*`, con il player finto delle prove), **schermo intero**
(`03-diretta-azoto-schermo-intero-*`: sul telefono la vista orizzontale, da
guardare girando la testa), **player che non risponde** con «Ricarica il video»
(`03-diretta-azoto-lenta-*`), gestione con il campo **«Tipo di player»**
(`04-gestione-tipo-player-*`), e poi la modalità B (diretta con «IN DIRETTA»,
«Torna in diretta», "Stiamo ricollegando la diretta…", video non disponibile,
schermo intero), la gestione con l'anteprima del caricamento, le email, il
popup della home e la sezione di Napoli. Si rifanno con
`node diretta/prove/screenshot-finali.js` dopo le prove. Altre foto della
gestione del player (scheda Evento, prova, regia in modalità A e B) sono in
`diretta/prove/risultati/screenshot-gestione-azoto/` (non versionata: le rifà
`gestione.prova.js`).

## 11. Cambiare piattaforma video

La pagina della diretta e la regia della gestione parlano con il video solo
attraverso due player con un'interfaccia simile, uno per modalità; quale usare
lo dice `tipoPlayer` dell'evento.

**Modalità A** (`window.NGBPlayerAzoto`, in `diretta/player-azoto.js`):

```js
window.NGBPlayerAzoto = { nome: 'azoto', crea(contenitore, { onPronto, onErrore }) };   // -> istanza
player.carica(url, { titolo });   // crea l'iframe (solo indirizzi di HOST_AZOTO)
player.ricarica();                // ricrea solo l'iframe ("Ricarica il video")
player.aggiornaTitolo(t); player.mostra(true|false); player.distruggi();
player.stato();      // 'vuoto', 'caricamento', 'pronto', 'lento', 'nascosto', 'link'
player.capacita();   // { comandi: false, qualita: false, dvr: false }: i comandi sono quelli di Azoto
// onPronto(): la pagina del player è arrivata (evento load dell'iframe)
// onErrore({ codice }): 'lento' (15 s senza risposta), 'link' (indirizzo non ammesso)
```

**Modalità B** (`window.NGBPlayer`, in `diretta/player-webtv.js`):

```js
window.NGBPlayer = {
    nome: 'webtv',
    crea(contenitore, { onPronto, onStato, onErrore, onVolume, onTempo, onQualita }),  // -> istanza
    idDa(testo)   // il valore da salvare dal link incollato, oppure ''
};
// istanza:
player.carica(url, { firmato });   // sempre dal punto live; firmato: true per un link firmato a tempo
player.aggiornaFirma(url);         // link firmato rinnovato: firma nuova senza ricaricare il video
player.play(); player.pausa(); player.alterna();
player.muto(); player.smuto(); player.eMuto(); player.volume(0-100); player.leggiVolume();
player.vaiAlLive(); player.finestra();   // { posizione, inizio, fine, ritardo, dvr, diretta, avanza }
player.cerca(secondi);   // un punto fra finestra().inizio e finestra().fine (per esempio fine - 120)
player.livelliQualita(); player.impostaQualita(v);
player.stato(); player.mostra(true|false); player.distruggi();
player.capacita();   // { comandi, qualita, dvr }
player.avvioBloccato();   // true se il browser non l'ha fatto partire da solo (serve un tocco)
// onErrore({ codice }): 'rete', 'media', 'segnale', 'lento', 'libreria', 'browser', 'link'
// finestra().avanza: il bordo live cresce davvero (una playlist "ferma" resta false)
```

Il player non riprova da solo dopo un errore: ricollegamento, attese e
passaggio alla riserva li decide la pagina (`diretta.js`), che chiama di nuovo
`carica()`. Il `<video>` resta lo stesso fra un `carica()` e l'altro (chi ha
attivato l'audio lo ritrova).

`player-webtv.js` legge l'HLS (nativo su Safari, hls.js altrove) e il DASH
(dash.js). Che cosa è un link lo decide `diretta/sorgente-video.js`, la stessa
regola del servizio.

- **Se Azoto cambia dominio del player** (per esempio un altro `cdn…`):
  aggiungilo a `HOST_AZOTO` in `diretta/sorgente-video.js` (e ricopia il file in
  `email-service/lib/diretta-sorgente-video.js`) e nel `frame-src` della
  Content-Security-Policy di `diretta/index.html`, `diretta/reimposta.html` e
  `diretta/gestione/index.html`.
- **Per un'altra web TV con un player da incorporare**: stessa cosa, con il suo
  dominio (e i testi che nominano Azoto).
- **Per un fornitore che dà un link HLS** (Mux, Cloudflare Stream, un'altra web
  TV): basta la modalità B, incollando il link.

## 12. Cosa devi fare tu

In ordine, pensando all'evento di Napoli del **2 ottobre** (oggi è il 25
settembre: c'è tempo, ma non tanto).

**Subito (oggi o domani)**

1. [ ] **Azoto**: manda ad Azoto **le domande del §5.8** (il testo è pronto da
   copiare). Le più importanti: **limitare il player del nostro canale al nostro
   dominio** (oggi si apre da qualsiasi sito: è l'unica vera protezione, §5.5),
   il **peer-to-peer** del loro player (domanda 8: serve anche per
   l'informativa privacy), la conferma che reggono **1000 persone insieme**
   (circa 3 Gbit/s, §5.7) e una **prova con la diretta accesa** qualche giorno
   prima. Se ti danno il **link `.m3u8`** (con il CORS per
   `nextgenerationbusiness.it`), mandamelo: lo provo e si può passare alla
   modalità B; allora restringo anche `connect-src` e `media-src` della CSP al
   loro dominio (§5.6).
   - [ ] **Privacy**: con chi cura l'informativa, valuta il peer-to-peer del
     player di Azoto (indirizzi IP degli spettatori scambiati fra loro e con i
     servizi `meshify.cloud`, Google e Twilio: §5.1) finché Azoto non lo spegne.
2. [ ] **Progetto Firebase `ngb-eventi`** (§2.2): crealo, passa a **Blaze** e
   imposta l'**avviso di budget** (10 €); Firestore `(default)` in `eur3` o
   `europe-west8`; Authentication con **Email/password**, **registrazione e
   eliminazione da parte degli utenti disattivate**, protezione contro
   l'enumerazione attiva, dominio `nextgenerationbusiness.it` autorizzato.
3. [ ] **`diretta/config.js`**: copia i valori dell'app web al posto di
   `DA_COMPILARE` (e l'ID del progetto, se non è `ngb-eventi`), e compila
   `assistenza.email` e `assistenza.telefono`.
4. [ ] **Regole e indici**: `firebase deploy --only firestore:rules,firestore:indexes`
   da `diretta/firebase/` (o a mano dalla console), e aspetta che gli indici
   siano *Attivati*.
5. [ ] **Chiavi**: genera la chiave di servizio (JSON → base64) e crea la
   **chiave API del server** limitata a Identity Toolkit API e Token Service API;
   limita la chiave del browser ai referrer `https://nextgenerationbusiness.it/*`.
6. [ ] **Vercel** (§3): aggiungi `DIRETTA_FIREBASE_SERVICE_ACCOUNT`,
   `DIRETTA_FIREBASE_API_KEY`, `DIRETTA_ADMIN_EMAILS` (e, se vuoi,
   `DIRETTA_ASSISTENZA_TELEFONO` con un numero **presidiato il giorno
   dell'evento**, lo stesso scritto in `config.js`, e `DIRETTA_PROGETTO_ATTESO`
   se l'ID è diverso). Controlla che ci
   siano già `BREVO_API_KEY` e `CRON_SECRET`. Poi *Redeploy*. Da questo momento
   parte anche il lavoro programmato ogni 5 minuti.
7. [ ] **Brevo** (§4): verifica il piano (servono circa **3.100 email** nei
   giorni prima dell'evento, oltre alle altre email dello studio: il piano
   gratuito da 300 al giorno non basta; se il piano ha un tetto giornaliero
   imposta `DIRETTA_MAX_GIORNO`), SPF/DKIM/DMARC del dominio verificati, e
   valuta di spegnere il tracciamento dei clic per le email transazionali.
8. [ ] **Pubblica** questo ramo sul sito (unisci la richiesta di modifica):
   popup e pulsanti compaiono da soli dal 25 settembre.

**Prima di inviare le credenziali** (le credenziali non partono mai da sole: le
mandi tu dalla gestione, quando decidi, con "Invia le credenziali")

9. [ ] Entra in `/diretta/gestione/` con "Primo accesso" (§6.1).
10. [ ] Crea l'evento **`napoli-2026`** con gli orari veri (stesso
    identificativo e stessi orari di `assets/diretta-stato.js`: se li cambi,
    aggiorna anche quel file), "Tipo di player": **Player Azoto**, e incolla il
    **codice che vi ha dato Azoto** (si salva solo l'indirizzo). "Prova il
    player". Il flusso diretto lascialo vuoto finché Azoto non dà il `.m3u8`.
11. [ ] **Prova generale** con un evento di prova e 3-4 persone vere (tu e dei
    colleghi): email di prova, credenziali, accesso **con la propria email da un iPhone con Safari,
    da un telefono Android, da un computer con Chrome, Firefox ed Edge**, "Vai in
    onda" con Azoto che trasmette una prova: il player compare, play e volume nel
    player, "Schermo intero" (su iPhone la vista orizzontale), pausa dell'evento
    (il player sparisce e torna), cambio del player dalla *Regia*, "Termina",
    "Password dimenticata?", esportazione. Su iPhone prova anche con il
    **Risparmio energetico** attivo. I passi per Safari, iPhone e iPad sono nel
    §5.9.
12. [ ] Prova sul progetto vero il **contatore dei collegati** e
    l'**esportazione** (servono gli indici del passo 4) e, se possibile, un
    piccolo carico: 300 accessi in 2 minuti con account di prova (§9).
13. [ ] Carica il file degli iscritti online, controlla l'anteprima (le email
    doppie o condivise da persone diverse vanno sistemate), crea gli account:
    **non parte nessuna email**. Quando decidi tu: "Invia email di prova a me",
    poi **"Invia le credenziali"**.
14. [ ] Solo **dopo** aver caricato e inviato la prima lista: nella scheda
    *Evento* accendi **"Invia subito la password a chi si iscrive dal modulo del
    sito"**. Da quel momento chi si iscrive online dalla pagina di Napoli riceve
    subito la password. Controlla che `iscrizione` in `diretta/config.js` porti
    al modulo giusto (oggi `/napoli_ottobre_2026/#accreditamento`): è il
    collegamento di "Non sei ancora iscritto? Iscriviti qui.".

**Il giorno prima (1° ottobre)**

15. [ ] "Aggiorna esiti", correggi gli indirizzi respinti, "Reinvia a chi non
    l'ha ricevuta". Tieni a portata di mano il numero dell'assistenza e la
    sezione 7 ("account disattivato", "password dimenticata").

**Il 2 ottobre**: *Regia* → "Vai in onda" quando Azoto trasmette; "Pausa"
a pranzo; "Termina" alla fine; poi *Esporta* per gli attestati. Dopo l'evento,
chiedi ad Azoto di spegnere il nostro canale (il suo indirizzo, una volta
copiato, resta apribile da chiunque finché è acceso).

**Da decidere con calma** (non bloccano Napoli)

- Facoltativo: in *Firestore* → *TTL*, una regola sul campo `scade` per i
  gruppi di raccolte `tentativiIp` e `limiti`, così i contatori dei limiti
  vecchi si cancellano da soli (senza, restano ma non danno fastidio).
- Per quanto tempo tenere accessi e presenze (dati personali: per esempio 12
  mesi) e se aggiungere una pulizia automatica; l'informativa privacy è già
  collegata dalla pagina di accesso e dalle email.
- Se servirà impedire davvero la condivisione del video: con il player di Azoto
  serve la limitazione al dominio da parte loro (domanda 1); con il flusso
  diretto, i **link firmati a tempo** (§5.5: la gestione e il servizio sono già
  pronti per nginx e Akamai; per un altro sistema di firma si aggiunge uno schema
  in `email-service/lib/diretta-firma.js`).
