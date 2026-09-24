# Diretta degli eventi (`/diretta/`)

Un'area riservata piccola e separata, che fa **una cosa sola**: chi è iscritto
a un evento online entra con **nome utente e password** e vede la diretta di
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
5. [Il video: il canale della web TV](#5-il-video-il-canale-della-web-tv)
6. [Come si usa: dalla settimana prima al giorno dopo](#6-come-si-usa-dalla-settimana-prima-al-giorno-dopo)
7. [Nomi utente, doppioni, password](#7-nomi-utente-doppioni-password)
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
 /diretta/  ── nome utente + password ──▶  api/diretta-accesso  ── verifica ──▶  Authentication
            ◀── token personale ─────────                       ◀──────────────
            ── accesso con il token ───────────────────────────────────────▶  Authentication
            ── UNA lettura in ascolto: eventi/{idEvento} ───────────────────▶  Firestore (regole)
            ── un segnale di presenza al minuto ────────────────────────────▶  Firestore (regole)
            ── video ───────────────────────────────▶  la web TV (HLS/DASH, dalla sua CDN)

 /diretta/gestione/ ── token del gestore ──▶ api/diretta-gestione ─────────────▶  Firestore + Auth
                                            api/diretta-cron (ogni 5 min) ─ email ─▶ Brevo
 sito (home, Napoli) ── stato in onda ────▶ api/diretta-stato (cache CDN 30 s) ─▶  Firestore (1 lettura ogni 30 s)
```

**File del sito** (statici, GitHub Pages):

| File | Che cosa fa |
|---|---|
| `diretta/index.html`, `diretta.css`, `diretta.js` | la pagina dei partecipanti |
| `diretta/player-webtv.js` | il player: il nostro `<video>` per i flussi **HLS** e **DASH** della web TV (e la pagina della web TV incorporata, come ripiego), usato da pagina e regia (vedi [§5](#5-il-video-il-canale-della-web-tv)) |
| `diretta/sorgente-video.js` | che cosa è il link incollato (HLS, DASH, pagina da incorporare) e perché un link è rifiutato: **una sola** regola per gestione, player e servizio |
| `diretta/hls.min.js`, `diretta/dash.all.min.js` | hls.js 1.7.3 "light" (Apache 2.0) e dash.js 5.2.1 (BSD), versioni fissate e salvate nel sito (licenze accanto); si scaricano solo quando servono |
| `diretta/nome-utente.js` | la regola del nome utente, **una sola** per tutto il sistema |
| `diretta/config.js` | configurazione web del progetto Firebase e indirizzo del servizio |
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
sempre, nomi che cominciano con `diretta-`; le funzioni esistenti non sono
state toccate, a parte `vercel.json` che elenca il nuovo lavoro programmato):

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
| `eventi/{idEvento}` | i partecipanti di quell'evento, i gestori | titolo, data, orari, stato, programma; il link del video (e quello di riserva, e quale dei due è in uso) **solo mentre è in onda**; con i link firmati è il link senza firma, che da solo non basta (quello firmato lo dà il servizio a ciascuno) |
| `partecipanti/{uid}` | solo la persona stessa | nome utente, nome, cognome, email, azienda, eventi, stato delle email, ultimo accesso |
| `nomiUtente/{nomeUtente}` | solo il server | → uid: garantisce che un nome utente esista una volta sola |
| `indirizzi/{email}` | solo il server | → uid: garantisce che un'email abbia un solo account |
| `sessioni/{uid}` | solo il server | account attivo o disattivato, dispositivo ammesso |
| `eventiRiservati/{idEvento}` | solo il server | il link del video e quello di riserva come li ha incollati il gestore; la chiave segreta dei link firmati |
| `presenze/{idEvento}_{uid}` | solo il server (scritta dal partecipante con regole strette) | primo e ultimo segnale, minuti collegati durante la diretta, collegamenti |
| `accessi/{auto}` | solo il server | un documento per ogni accesso riuscito |
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
"password dimenticata" si fermano all'80 % del tetto, per lasciare spazio a
credenziali e promemoria.

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
  quello con il nome utente) e Brevo conserva per un periodo i registri dei
  messaggi: **l'email delle credenziali contiene la password in chiaro**, come
  richiesto, quindi passa dai sistemi di Brevo. Il nostro codice non la salva da
  nessuna parte; limita a poche persone l'accesso all'account Brevo e, se
  possibile, disattiva il tracciamento dei clic per le email transazionali.

---

## 5. Il video: il canale della web TV

La diretta arriva dal **canale streaming della web TV**. Il nostro sito non
trasmette video: la pagina lo prende direttamente dai server della web TV,
dopo l'accesso.

### 5.1 Che link si può usare

Nella gestione (scheda *Evento* o *Regia*) incolli quello che ti dà la web TV.
Il sistema riconosce da solo che cos'è e lo scrive accanto al campo:

| Che cosa incolli | Che cosa succede |
|---|---|
| **Link HLS** che finisce con `.m3u8` (anche con `?token=…` dopo): **il caso principale** | il **nostro player**: nostri comandi, nessun logo di altri, scelta della qualità, "Torna in diretta", barra per tornare indietro se la web TV lo consente |
| **Link DASH** che finisce con `.mpd` | il nostro player, con dash.js |
| **Pagina del player della web TV**, o tutto il suo codice da incorporare (`<iframe src="…">`) | **ripiego**: il video si vede, ma con i comandi e i loghi della web TV. La gestione lo dice con un avviso ben visibile: *"Con questo tipo di link non possiamo togliere il logo della web TV né usare i nostri comandi: chiedete alla web TV il link .m3u8"* |
| Qualunque altra cosa | **rifiutata con il motivo**: indirizzi `http://`, indirizzi per **trasmettere** (`rtmp://`, `rtsp://`, `srt://`: sono per il programma di regia della web TV, non per chi guarda), file video (`.mp4`, `.ts`…: non sono una diretta), link con nome utente e password, indirizzi non pubblici, pagine che la web TV non permette di incorporare |

Le regole stanno in `diretta/sorgente-video.js`, le stesse per gestione, player e
servizio (`email-service/lib/diretta-sorgente-video.js` ne è una copia identica,
controllata dalle prove).

### 5.2 La prova del link, prima di salvarlo

Ogni link nuovo si prova con **"Prova il link"** (e comunque prima di salvare):

1. **Dal servizio** (`prova-link`): si scarica la playlist (o la pagina) e si
   dice che cosa c'è: diretta o registrazione, quante qualità e quali, se si può
   tornare indietro e di quanto, la durata dei segmenti (e quindi il ritardo
   sul vivo), i codec, e se il server della web TV **permette la riproduzione
   dal nostro sito** (intestazioni CORS sulla playlist e su un segmento). Per le
   pagine da incorporare: se la web TV permette di incorporarle da noi
   (`X-Frame-Options`, `frame-ancestors`).
2. **Dal browser** della gestione: una lettura vera del link da
   `nextgenerationbusiness.it`, per confermare il CORS;
3. con **il player vero**, in una piccola anteprima.

Per ogni problema la gestione mostra una frase comprensibile e, quando la
soluzione è della web TV, **il testo pronto da girarle** con "Copia il testo
per la web TV" (per esempio: la richiesta dell'intestazione
`Access-Control-Allow-Origin: https://nextgenerationbusiness.it`, o di permettere
l'incorporamento con `frame-ancestors https://nextgenerationbusiness.it`).

- **Si blocca il salvataggio** solo quando il link non potrà mai funzionare:
  non è https, non è né un flusso né una pagina, è un file, è per trasmettere,
  contiene credenziali, è un indirizzo non pubblico, la pagina non si può
  incorporare, il contenuto non è davvero HLS o DASH.
- **Si salva dopo una conferma** quando il problema può risolversi prima della
  diretta: il link non risponde o dà 404 (la web TV non trasmette ancora: è
  normale giorni prima), il CORS manca (va chiesto alla web TV), è una
  registrazione invece di una diretta, il flusso è solo in HEVC (su Firefox e su
  molti computer Windows non si vede: meglio chiedere anche H.264), il ripiego
  della pagina da incorporare.

Il servizio fa la prova con le dovute cautele: solo indirizzi https pubblici
(niente indirizzi interni, nemmeno dopo un redirect), al massimo 3 redirect,
8 secondi per richiesta, 256 KB letti, 30 prove al minuto per gestore.

### 5.3 Il nostro player

- **HLS**: su **Safari, iPhone e iPad** lo legge il browser (riproduzione
  nativa); su **Chrome, Edge, Firefox e Android** lo legge **hls.js 1.7.3**
  (`diretta/hls.min.js`, libreria libera Apache 2.0, versione fissata e salvata
  nel sito, 386 KB, scaricata solo per le dirette HLS).
- **DASH**: **dash.js 5.2.1** (`diretta/dash.all.min.js`, licenza BSD, salvato nel
  sito, scaricato solo per le dirette DASH). Su iPhone il DASH funziona solo
  dove Safari lo permette (iOS 17.1 e successivi): **meglio l'HLS**.
- **Nessun logo e nessun marchio di terzi**: il `<video>` è nostro.
- **Comandi nella grafica del sito**: play/pausa, muto e volume (su iPhone e iPad
  il volume si regola solo con i tasti del telefono: Apple non lo permette a una
  pagina web), indicatore rosso **"IN DIRETTA"** quando si è al punto live,
  **"Torna in diretta"** solo quando si è rimasti indietro, **qualità**
  ("Automatica" più le qualità del flusso), **schermo intero** del nostro riquadro
  (anche su iPhone e iPad). Tastiera: spazio (play/pausa), F (schermo intero),
  M (muto), frecce (volume: su e destra alzano, giù e sinistra abbassano).
- **Tornare indietro nella diretta**: se la web TV tiene una finestra DVR di
  almeno un minuto, sotto il video compare la barra per tornare indietro
  ("−2:30"); se non c'è, la barra non compare.
- **Qualità adattiva**: si parte dalla qualità più bassa e si sale da soli in
  base alla connessione, così chi è su rete mobile non si blocca.
- **Parte senza audio** (i browser bloccano l'audio automatico) con il grande
  pulsante **"Attiva l'audio"**.
- Niente menu del tasto destro sul video, niente "scarica video"
  (`controlsList="nodownload"`), niente picture-in-picture né trasmissione ad
  altri dispositivi.
- Le **scorciatoie da tastiera** valgono quando il riquadro del video ha il
  fuoco (dopo un clic sul video, con Tab, o a schermo intero): così frecce e
  spazio scorrono la pagina come sempre quando si legge il programma, e chi usa
  un lettore di schermo non attiva comandi per sbaglio.
- **Ritardo** rispetto alla sala: quello dell'HLS, di solito 3 segmenti (con
  segmenti da 6 secondi, circa 20 secondi). La prova del link lo stima.

### 5.4 Se il flusso si interrompe: ricollegamento e link di riserva

- Se il flusso si ferma o la rete cade, il player prima prova i recuperi previsti
  dalla libreria (hls.js: riprendere il caricamento, ricostruire la decodifica),
  poi la pagina mostra **"Stiamo ricollegando la diretta…"** e riprova da sola,
  **senza ricaricare**, con attese **crescenti e casuali** (1-3 s, poi 2-6, 4-12,
  8-24, poi fra 15 e 45 s): mille persone non riprovano mai nello stesso
  secondo. Quando riparte, riparte dal punto live.
- Il player se ne accorge da solo anche quando il video resta fermo senza dare
  errori (più di 12 secondi fermo mentre dovrebbe andare) e quando la web TV
  continua a servire la stessa playlist senza nuovi pezzi (l'encoder si è
  fermato ma il server risponde): se il punto live non avanza per più di 20
  secondi (o di 3 segmenti) vale come un guasto. Il video si considera ripartito
  solo quando va **e** il punto live avanza.
- Se a cadere è la **rete di chi guarda** (telefono senza campo, wifi senza
  internet), la pagina non passa alla riserva: aspetta che la rete torni e
  riparte dal link di prima.
- Se la web TV chiude la diretta e al suo posto il link dà la registrazione, la
  pagina resta su "Stiamo ricollegando la diretta…" e non mostra l'evento
  dall'inizio.
- **Link di riserva**: nella gestione puoi mettere un secondo link (un altro
  server della web TV o un altro canale). Se il link in uso non funziona per
  **più di 20 secondi**, ogni pagina passa **da sola** all'altro (fra 20 e 24
  secondi: anche qui qualche secondo casuale, perché non passino tutti insieme,
  anche se un tentativo è ancora in corso).
  Se un browser non sa riprodurre uno dei due link (per esempio un DASH su un
  vecchio iPhone), passa subito all'altro.
- **In *Regia*** vedi quale link è in uso per tutti e puoi **passare a mano alla
  riserva (o tornare al principale) per tutti**: chi guarda cambia da solo, senza
  ricaricare. La scelta della regia vale più del passaggio automatico.
- **Cambio del link durante l'evento**: come prima, chi è collegato passa al
  nuovo flusso da solo (l'unica lettura in ascolto sull'evento).

### 5.5 Chi può vedere il link

- Il link **non è nel codice pubblico**: arriva dal database solo dopo
  l'accesso, solo agli iscritti a quell'evento e solo mentre è in onda.
- **Link firmati a tempo** (se la web TV li usa): nella gestione, sezione
  **"Link firmati"**, scegli lo schema, incolli la chiave segreta che ti dà la
  web TV (resta solo nel servizio: la pagina non la vede mai, nemmeno la
  gestione dopo averla salvata) e la durata (predefinita 6 ore). Ogni
  partecipante collegato riceve allora dal servizio (`link-video`) un link
  **suo, che scade**. Schemi pronti: **nginx `secure_link`** (parametri `md5` ed
  `expires`) e **Akamai EdgeAuth** (`hdnts=…`). Se la web TV ne usa un altro,
  si aggiunge in `email-service/lib/diretta-firma.js`. La web TV deve accettare
  la firma anche sui segmenti (firmando la cartella del flusso: opzione
  "cartella" per nginx, acl con `*` per Akamai).
- **Link limitati al nostro dominio**: la web TV può accettare solo le richieste
  che arrivano da `https://nextgenerationbusiness.it` (intestazioni `Origin` e
  `Referer`, che il browser manda da solo). Da parte nostra non serve niente.
- **Limite, detto chiaramente**: **senza link firmati, chi ha il link `.m3u8`
  può girarlo ad altri**, e lo può aprire anche fuori dal nostro sito (con
  VLC, per esempio). La limitazione al dominio è un ostacolo per i browser, non
  per un programma. Solo i link firmati a tempo lo impediscono davvero (e anche
  quelli valgono per qualche ora).
- Con i link firmati la pagina chiede il suo link al servizio con qualche
  secondo casuale di attesa (mille persone non chiedono nello stesso istante)
  e ne chiede uno nuovo quando è passato l'80% della validità: il player usa la
  firma nuova per le richieste che seguono **senza ricaricare il video** (chi è
  in pausa o indietro nella diretta resta dov'è). Solo su un iPhone che legge
  l'HLS da solo il video si ricarica per un paio di secondi. La validità la
  conta il servizio (`validoSecondi`): un computer con l'orologio sbagliato non
  cambia niente. Principale e riserva hanno ciascuno il suo link firmato, e chi
  ha già un link valido non lo richiede.
- La firma sta nella query del link della playlist; il player la aggiunge anche
  alle richieste delle playlist delle singole qualità e dei segmenti verso lo
  stesso server. Su **Safari, iPhone e iPad** questo il browser da solo non lo
  permette: con un link firmato anche lì si usa hls.js (iPhone da iOS 17.1,
  iPad, Mac). Su un iPhone più vecchio la web TV deve mettere la firma negli
  indirizzi scritti dentro le playlist (quasi tutte le CDN lo fanno da sole:
  domanda 6 del §5.7).

### 5.6 La banda: 1000 persone insieme

Il video lo trasmette la **rete di distribuzione (CDN) della web TV**, non il
nostro sito. La banda che serve, con 1000 persone collegate insieme:

| Qualità | Bitrate tipico | 1000 persone |
|---|---|---|
| 480p | ~1-1,5 Mbit/s | ~1-1,5 Gbit/s |
| 720p | ~2,5-3 Mbit/s | **~3 Gbit/s** |
| 1080p | ~4,5-6 Mbit/s | ~5-6 Gbit/s |

In pratica (qualità adattiva, telefoni e computer insieme) si sta fra 2 e 4
Gbit/s al picco, e circa **1-1,5 TB di traffico in 3 ore**. Per una CDN
professionale non è molto; per un singolo server sì. La domanda 3 qui sotto
serve a questo.

### 5.7 Le domande da fare alla web TV (pronte da inoltrare)

> Buongiorno,
> il 2 ottobre trasmetteremo in diretta l'evento Next Generation Business di
> Napoli sul nostro sito, https://nextgenerationbusiness.it, con il nostro player,
> per circa 1000 persone collegate insieme. Per prepararci vi chiediamo:
>
> 1. Ci date un link diretto **HLS (.m3u8) in https**, oltre alla pagina da incorporare?
> 2. Il vostro server consente la riproduzione dal dominio **nextgenerationbusiness.it**
>    (intestazioni CORS `Access-Control-Allow-Origin` sulla playlist e sui segmenti)?
> 3. Reggete **1000 spettatori contemporanei**? Con quale rete di distribuzione (CDN)
>    e quale banda?
> 4. Il flusso ha **più qualità** (adattivo)? Quali risoluzioni e bitrate?
> 5. C'è una **finestra DVR** per tornare indietro nella diretta? Di quanti minuti?
> 6. Supportate **link firmati a tempo** o **limitati al nostro dominio**? Con quale
>    sistema (per esempio nginx secure_link, Akamai EdgeAuth, altro)?
> 7. Avete un **link di riserva** su un altro server?
> 8. Possiamo fare una **prova con il flusso vero** qualche giorno prima?
> 9. Qual è il **ritardo** della diretta rispetto al vivo?
>
> Grazie.

### 5.8 Provare su iPhone, iPad e Safari (a mano)

Le prove automatiche usano Chromium, che l'HLS non lo legge da solo: il ramo
"Safari" del player (riproduzione nativa) si prova a mano, con il link di prova
della web TV (o, prima di averlo, con il flusso pubblico di prova di Shaka
Player: `https://storage.googleapis.com/shaka-live-assets/player-source.m3u8`):

1. Crea un evento di prova nella gestione, incolla il link, "Prova il link",
   salva, "Vai in onda".
2. Entra con un partecipante di prova da **iPhone con Safari** (e da iPad, e da
   un Mac con Safari). Controlla: il video parte **muto** da solo (o compare
   "Avvia la diretta" con il Risparmio energetico); **"Attiva l'audio"** porta
   l'audio (il volume con i tasti del telefono); **schermo intero** del nostro
   riquadro, con i nostri comandi; **"IN DIRETTA"** rosso; metti in pausa 30
   secondi e riparti: compare **"Torna in diretta"** e riporta al punto live;
   la **barra per tornare indietro** se la web TV ha il DVR; ruota il telefono.
3. **Caduta e riserva**: con la riserva inserita, chiedi alla web TV di fermare
   il flusso principale (o metti un link principale che non risponde):
   entro circa 20 secondi la pagina passa alla riserva; "Passa alla riserva per
   tutti" in *Regia* fa passare tutti subito.
4. **Rete**: metti il telefono in modalità aereo per 10 secondi e poi toglila:
   "Stiamo ricollegando la diretta…" e poi il video riparte da solo.
5. **Link firmati** (se la web TV li usa): ripeti il punto 2 su iPhone e iPad
   con la firma attiva, e lascia la pagina aperta oltre l'80% della durata
   scelta (con una durata di 1 ora, dopo 48 minuti): il video continua (su
   iPhone si ricarica da solo in un paio di secondi).
6. Ripeti con un telefono **Android** (Chrome) e un computer con **Chrome,
   Edge e Firefox** (lì lavora hls.js).

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
   di inizio e di fine, link della diretta (web TV, §5), programma (una voce per
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
   L'**anteprima** mostra riga per riga il nome utente che verrà assegnato e i
   problemi, a colori: email mancanti o non valide, nome o cognome vuoti,
   doppioni nel file, persone già presenti, omonimi con il numero proposto (e chi
   usa già quel nome), un indirizzo condiviso da persone diverse, un file salvato
   con la codifica sbagliata (lettere come `Ã²`). Il filtro "Solo da controllare"
   mostra solo quelle. Per ogni riga puoi correggere, escludere o confermare;
   **"Crea gli account" resta spento finché c'è qualcosa da sistemare**. Gli
   account si creano a gruppi di 25 (circa 4 al secondo, per non superare i
   limiti di Firebase); se la rete cade, "Riprendi" continua senza doppioni.
   Ricaricare lo stesso file più tardi non crea niente di doppio.
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
  email, azienda o nome utente → **"Nuova password da comunicare a voce"** (la
  vedi una volta sola) oppure **"Reinvia credenziali"** (email con una password
  nuova: la vecchia smette di funzionare).
- Prova il link: *Regia* → **"Vedi come un partecipante"** (si apre in una
  scheda nuova, senza registrare presenze; "Chiudi l'anteprima" non ti fa uscire
  dalla gestione).

### 6.4 Il giorno dell'evento (scheda *Regia*)

- Quando la web TV trasmette, **"Vai in onda"**: tutte le pagine aperte passano da
  sole dall'attesa alla diretta. Il contatore mostra le persone collegate in
  questo momento (si aggiorna ogni 20 secondi).
- **Pausa** (con l'orario di ripresa, facoltativo) e **Riprendi**: in pausa i
  partecipanti vedono "Pausa: si riprende alle 14.30", non la fine.
- **"Avviso a tutti"**: una riga che compare in cima alla pagina di tutti
  ("Problema tecnico: riprendiamo tra 5 minuti").
- **Cambio del link**: incolla il nuovo link (principale o di riserva) e
  "Prova il link": la regia lo prova come nella scheda *Evento* (§5.2), anche in
  una piccola anteprima, e lo blocca se non si può usare (se la web TV non ha
  ancora cominciato a trasmettere, lo salva dopo una conferma). Chi guarda passa
  al nuovo link da solo, senza ricaricare. Cambiare solo la riserva non
  disturba chi sta guardando il principale.
- **Link in uso per tutti**: la regia mostra quale link stanno guardando i
  partecipanti. **"Passa alla riserva per tutti"** e **"Torna al link principale
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

## 7. Nomi utente, doppioni, password

**La regola del nome utente** (una sola funzione, `diretta/nome-utente.js`,
usata dalla pagina, dalla gestione e dal servizio, con le prove): nome e
cognome attaccati, tutto minuscolo, senza accenti, apostrofi, trattini, punti
e spazi; restano solo a-z e numeri.

| Scritto così | Nome utente |
|---|---|
| Mario Rossi | `mariorossi` |
| Anna Maria De Luca | `annamariadeluca` |
| Nicolò D'Angelo | `nicolodangelo` |
| Jean-Luc Picard | `jeanlucpicard` |
| Łukasz Żółć | `lukaszzolc` |
| Иван Петров (cirillico) | `ivanpetrov` |

Le lettere che non sono "lettera + accento" hanno una tabella (ß → ss, æ → ae,
ø → o, ł → l…), cirillico e greco si traslitterano. Un nome fatto solo di
ideogrammi darebbe un nome utente vuoto: l'anteprima lo segnala e chiede di
scriverlo a mano. Nel campo di accesso si può scrivere anche "Mario Rossi" con
maiuscole e spazi: diventa `mariorossi` con la stessa regola.

**Nessun utente doppio, a tre livelli:**
1. **Stessa email = stessa persona = un account.** Il confronto ignora
   maiuscole e spazi (anche quelli invisibili che arrivano da Excel). Gli
   indirizzi si salvano e si usano per le email già ripuliti: in gestione
   compaiono quindi in minuscolo. Se
   l'email c'è già, o compare due volte nel file, non si crea niente di nuovo:
   la persona viene solo aggiunta all'evento. Ricaricare lo stesso file non
   crea niente.
2. **Omonimi** (stesso nome utente, email diversa): il secondo diventa
   `mariorossi2`, il terzo `mariorossi3`… L'anteprima li evidenzia e la
   creazione non parte finché non li confermi o correggi a mano.
3. **Garanzia tecnica.** Ogni nome utente e ogni email si **prenotano** con una
   transazione nel server (`nomiUtente/{nome}`, `indirizzi/{email}`): due
   caricamenti contemporanei non possono prendere lo stesso nome né creare due
   account per la stessa email. Le prove lo dimostrano con caricamenti
   contemporanei (§10).

**L'email tecnica.** Dietro ogni nome utente c'è un account Firebase con
un'email tecnica che nessuno vede e a cui non arriva niente. Non è
`mariorossi@…` come nell'esempio della richiesta, ma
`p3f9c…@utenti.diretta.nextgenerationbusiness.it` (un codice interno): se fosse
ricavabile dal nome, chiunque conosca nome e cognome di un iscritto potrebbe
provare le password direttamente su Google, scavalcando il blocco dei
tentativi, o scoprire chi è iscritto. Per la persona non cambia niente: scrive
solo il nome utente.

**Le password.** Generate dal servizio: 10 caratteri, senza quelli che si
confondono (0/O/o, 1/l/I/i), sempre con maiuscole, minuscole e cifre. Non
vengono **mai** salvate: esistono solo nel momento in cui si impostano
sull'account e si mettono nell'email (o si mostrano una volta in gestione con
"Rigenera password"). Per questo **"Reinvia credenziali" genera una password
nuova**: quella vecchia non la conosce più nessuno e smette di funzionare (chi
è collegato dovrà rientrare entro un'ora).

**Account disattivato.** Chi prova a entrare con un account disattivato legge
lo stesso messaggio di una password sbagliata ("Nome utente o password non
corretti. Se il problema continua, scrivi all'assistenza"): Google risponde
"disattivato" anche con la password sbagliata, e dirlo rivelerebbe quali
account esistono. Chi assiste le persone al telefono deve saperlo.

**Password dimenticata.** La persona scrive il nome utente oppure la sua email;
il servizio manda il collegamento per sceglierne una nuova all'email vera
(vale un'ora, una volta). La risposta è sempre la stessa, anche nei tempi, così
non si scopre chi è iscritto.

---

## 8. Sicurezza: cosa è protetto e come

- **Regole di Firestore**: un partecipante legge il proprio profilo e il proprio
  evento, nient'altro; scrive solo il proprio segnale di presenza, con l'orario
  del server e al massimo uno ogni 50 secondi. Tutto il resto lo scrive solo il
  servizio. (Prove: [§10](#10-le-prove).)
- **Tentativi**: dopo 5 password sbagliate di fila dallo stesso dispositivo o
  rete, attesa crescente (30 s, 1 min, 2 min… fino a 15 min). In più un tetto
  largo per nome utente da qualunque provenienza (50 errori all'ora) e uno per
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
  blocca i gestori). In una raffica ne passano meno, mai di più.
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
| Accessi (servizio): nome utente, tentativi, profilo, evento, registro | ~7.000 | ~6.000 | ~9.000 | ~8.000 |
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
0,6 %. Nessuna funzione è sul percorso del video: lo trasmette la web TV (a
1000 persone insieme, circa 3 Gbit/s: vanno chiesti a lei, §5.6 e §5.7).

### Firebase Authentication e Brevo

Account con email e password: gratuiti. Brevo: vedi §4 (~3.100 email).

### La prova di carico: 1000 accessi in 2 minuti

`diretta/prove/carico.sh` (emulatori di Firebase + funzioni vere del servizio
in locale + `carico.prova.js`). Prima si creano **1000 partecipanti con l'API
di gestione** (40 chiamate `crea` da 25 righe, con molti omonimi apposta), poi
ognuno, a un istante casuale dentro i 2 minuti, fa quello che fa la pagina:
accesso con il nome utente scritto con maiuscole e spazi, token, lettura del
profilo e dell'evento con le regole vere, primo segnale di presenza a un ritardo
casuale (0-60 s) e il secondo 60 secondi dopo. Risultato dell'ultima esecuzione,
sul codice definitivo (24 settembre 2026, questa macchina: 4 processori, con
altre prove che giravano in parallelo):

| Passo | n | p50 | p95 | p99 | massimo |
|---|---:|---:|---:|---:|---:|
| accesso (funzione `diretta-accesso`: blocco dei tentativi, verifica, token) | 1000 | 43 ms | 108 ms | 181 ms | 217 ms |
| accesso a Firebase con il token | 1000 | 4 ms | 12 ms | 23 ms | 43 ms |
| lettura del profilo (regole) | 1000 | 7 ms | 28 ms | 72 ms | 889 ms |
| lettura dell'evento (regole) | 1000 | 9 ms | 38 ms | 94 ms | 376 ms |
| primo segnale di presenza | 1000 | 10 ms | 24 ms | 54 ms | 197 ms |
| segnale "continua" (+60 s, regole con l'orario del server) | 1000 | 9 ms | 19 ms | 54 ms | 80 ms |
| `crea` (25 righe, nella preparazione) | 40 | 6,1 s | 6,9 s | 6,9 s | 6,9 s |

- **Errori: nessuno** su 6000 operazioni; 1000 presenze scritte, tutte con il
  secondo segnale accettato dalle regole.
- **Picco di accessi in un secondo: 16; picco di scritture di presenza in un
  secondo: 23** (su 1000 persone): la partenza casuale funziona, non arrivano
  mai tutte insieme.
- Creazione dei 1000 account: **250 secondi** (circa 4 al secondo: è il
  limitatore delle scritture su Firebase Auth, 8 al secondo, che tiene lontani i
  limiti di Google; con la pagina di gestione sono 40 gruppi da 25).
- Tutti i 1000 accessi arrivano dallo stesso indirizzo (127.0.0.1): nessuno è
  stato bloccato o rallentato dal limite per rete, che conta solo le password
  sbagliate.
- Il contatore della gestione alla fine ne vedeva 948: la prova smette di
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

Tutte in `diretta/prove/` (più quattro nel servizio, `email-service/prove/`).
Girano contro gli **emulatori di Firebase** (nessun progetto vero, nessuna
email vera: la posta diventa righe di un file) e con **Playwright** su
Chromium. YouTube, che dalla rete di prova non si raggiunge, è sostituito da un
finto YouTube (`finto-youtube.js`) che si comporta come il player vero per
quello che usa la pagina.

```bash
cd diretta/prove
npm install                    # una volta: firebase-tools, firebase, playwright
node esegui-tutte.js           # tutte, circa 15 minuti
bash carico.sh                 # la prova di carico, circa 8 minuti
node e2e.prova.js              # solo il percorso completo
```

| Prova | Che cosa dimostra | Esito |
|---|---|---|
| `email-service/prove/diretta-nome-utente.prove.js` | la regola del nome utente: accenti, apostrofi (anche tipografici), trattini, punti, cognomi composti, doppi nomi, maiuscole, spazi, lettere straniere, cirillico e greco, omonimi, doppioni, anteprima; la copia del servizio è identica a quella del sito | 91 verdi, 0 rossi |
| `email-service/prove/diretta-password.prove.js` | 10 caratteri, niente 0/O/o/1/l/I/i, 20.000 password tutte diverse, nessuna password nei log o in Firestore | 9 verdi, 0 rossi |
| `email-service/prove/diretta-mail.prove.js` | le email: HTML e testo, credenziali in carattere a spaziatura fissa, collegamenti, date, assistenza, niente trattini lunghi, niente HTML iniettato, promemoria mai con la password | 196 verdi, 0 rossi |
| `email-service/prove/diretta-accesso-tempi.prove.js` | "password dimenticata" e "primo accesso" dei gestori rispondono sempre in 2,5-2,9 s, anche con Brevo lento (il resto finisce dopo, con `waitUntil`); un token scaduto fa uscire, un intoppo di Google (rete, chiavi pubbliche non scaricate) no | 26 verdi, 0 rossi |
| `email-service/prove/diretta-video.prove.js` | il link del video: link HLS `.m3u8` (anche con token), file video, link e codice da incorporare del player della web TV, YouTube; rifiutati con il motivo http, RTMP/RTSP/SRT, DASH, link con credenziali; la copia del servizio è identica a quella del sito | 53 verdi, 0 rossi |
| `regole.prova.js` | le regole di Firestore: un partecipante legge solo il suo evento e il suo profilo; presenze solo nelle forme e nei tempi previsti; account disattivato o secondo dispositivo | 61 verdi, 0 rossi |
| `separazione.prova.js` | nessun collegamento con l'area riservata; un token della diretta è rifiutato dal progetto dello studio | 14 verdi, 0 rossi |
| `doppioni.prova.js` | stesso file due volte, stessa email scritta in modi diversi, **tre caricamenti contemporanei** con 20 "Mario Rossi" ciascuno, omonimi, correzioni: **zero account doppi, zero nomi utente doppi** | 81 verdi, 0 rossi |
| `accesso.prova.js` | accesso con "Mario Rossi", 5 errori e attesa crescente, 20 tentativi contemporanei (ne arrivano 5), 100 password sbagliate insieme dalla stessa rete (ne arrivano alla verifica al massimo 40), raffiche di "password dimenticata" (mai più di 20 email l'ora per rete), risposte e tempi uguali, gestori (anche chi si registra da solo con l'email di un gestore), stato pubblico; link della web TV salvati come indirizzo, http e RTMP rifiutati | 110 verdi, 0 rossi |
| `coda.prova.js` | 1000 credenziali con rifiuti, errori, un processo ucciso a metà, blocco di Brevo, tetto giornaliero, due giri insieme: **nessuna email doppia**; promemoria una volta sola e mai con la password | 144 verdi, 0 rossi |
| `pagina.prova.js` | la pagina della diretta su computer e iPhone (senza schermo intero, come Safari): attesa, messa in onda, audio (anche rifiutato dal browser), pausa, tastiera, schermo intero, cambio del video, errori, connessione persa, pausa dell'evento, fine e ritorno in onda, reimpostazione; e i casi difficili: un solo dispositivo con due browser veri, due schede e una congelata, localStorage bloccato, player che nasce lento, anteprima del gestore, componenti di Firebase che non si scaricano | 51 verdi, 0 rossi |
| `gestione.prova.js` | la gestione contro il servizio vero, su computer e tablet: anteprima di un file CSV ed Excel con tutti i casi (omonimi, doppioni, email sbagliate, correzioni, conferme), creazione a gruppi con "Riprendi", ricerca e azioni sul partecipante, regia (in onda, pausa, termina, cambio del link provato prima, connessi, vedi come un partecipante), email (prova, invio, reinvio), esportazione Excel riletta | 220 verdi, 0 rossi |
| `sito.prova.js` | popup della home (finestra di date, precedenza sugli altri popup anche ricaricando, ESC, sfondo, focus, "non mostrare più"), pillola, pagina di Napoli (menu, sezione, IN DIRETTA solo in onda), nessuna chiamata fuori dal giorno dell'evento | 282 verdi, 0 rossi |
| `e2e.prova.js` | **il percorso completo con tutto vero** tranne YouTube: il gestore si attiva dall'email, crea evento e partecipanti, manda le credenziali; Mario le legge dalla posta, entra dal telefono, aspetta, va in onda, schermo intero, cambio del link, connessione persa, pagina riaperta, un minuto di presenza, esce, password dimenticata, accesso automatico; fine ed esportazione | 24 verdi, 0 rossi |
| `webtv.prova.js` | **la web TV sulle pagine vere**, con una diretta HLS vera trasmessa da ffmpeg (due qualità): la regia incolla e prova il link, va in onda, il partecipante la vede nel nostro player (qualità, audio, pausa, «Torna in diretta»); player della web TV incorporato; file video; diretta non ancora partita che poi parte da sola; link sbagliati rifiutati; nessuna violazione della CSP. Serve ffmpeg (`pip install imageio-ffmpeg` basta) | 23 verdi, 0 rossi |
| `anteprima/anteprima.prova.js` | l'anteprima con accessi di prova (vedi sotto), aperta come la apre claude.ai: iframe con sandbox e CSP stretta; accesso, regia che manda in onda, posta, file di esempio, «Vedi come un partecipante», esportazione, password dimenticata | 18 verdi, 0 rossi |
| `carico.sh` | 1000 accessi in 2 minuti (§9) | nessun errore |

Ultimo giro completo, sul codice di questo branch: **1403 controlli verdi, 0 rossi** (24 settembre 2026).

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
`firestore.rules`. Le email finiscono nella scheda «Posta di prova», al posto di
YouTube c'è un video di prova (`anteprima/player-anteprima.js`, con la stessa
interfaccia del player vero) e l'esportazione Excel si apre in una finestra.
Accessi di prova: `mariorossi`, `annamariadeluca`, `nicolodangelo` e
`mariorossi2` (le password sono nella guida dell'anteprima), regia
`gestore@anteprima.it`. L'evento di prova è sempre di oggi. I pochi ritocchi
fatti alle pagine per farle girare lì (da dove si caricano l'SDK e SheetJS, la
navigazione fra le pagine) sono elencati in `anteprima/costruisci.js`, che si
ferma se non li trova: l'anteprima non può restare indietro rispetto al codice.

**Cosa le prove non coprono** (e va provato a mano, vedi §12): la web TV vera
(il suo link, il CORS dei suoi server, la capacità con 1000 persone), YouTube vero
(la rete di prova non lo raggiunge), Safari vero su iPhone e iPad (Playwright
usa Chromium, che simula il telefono ma non è Safari), Firefox ed Edge, Brevo
vero, il progetto Firebase vero (quote, indici, limiti di Google).

**Gli screenshot** di consegna sono in [`diretta/screenshot/`](screenshot/)
(telefono e computer: accesso, attesa, diretta, gestione con l'anteprima del
caricamento, email, popup della home, sezione di Napoli). Si rifanno con
`node diretta/prove/screenshot-finali.js` dopo le prove.

## 11. Cambiare piattaforma video

La pagina della diretta e la regia della gestione parlano con il video solo
attraverso questa interfaccia (`window.NGBPlayer`, in `diretta/player-webtv.js`):

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
player.capacita();   // { comandi, qualita, dvr }: comandi false = pagina incorporata, restano i suoi
player.avvioBloccato();   // true se il browser non l'ha fatto partire da solo (serve un tocco)
// onErrore({ codice }): 'rete', 'media', 'segnale', 'lento', 'libreria', 'browser', 'link'
// finestra().avanza: il bordo live cresce davvero (una playlist "ferma" resta false)
```

Il player non riprova da solo dopo un errore: ricollegamento, attese e
passaggio alla riserva li decide la pagina (`diretta.js`), che chiama di nuovo
`carica()`. Il `<video>` resta lo stesso fra un `carica()` e l'altro (chi ha
attivato l'audio lo ritrova).

Oggi `player-webtv.js` sceglie da solo secondo il link: HLS (nativo su Safari,
hls.js altrove), DASH (dash.js) o la pagina della web TV incorporata. Che cosa
è un link lo decide `diretta/sorgente-video.js`, la stessa regola del servizio.

Per un fornitore con un'API propria (per esempio un player di una piattaforma
video che non dà un link HLS): scrivi `diretta/player-<nome>.js` con la stessa
interfaccia, insegna a `sorgente-video.js` a riconoscerne i link (e ricopialo in
`email-service/lib/diretta-sorgente-video.js`), aggiungi la riga `<script>` in
`diretta/index.html` e in `diretta/gestione/index.html` e i domini nella
`Content-Security-Policy`. Mux e Cloudflare Stream danno comunque un link HLS:
per loro basta incollarlo, come per la web TV.

## 12. Cosa devi fare tu

In ordine, pensando all'evento di Napoli del **2 ottobre** (oggi è il 24
settembre: c'è tempo, ma non tanto).

**Subito (oggi o domani)**

1. [ ] **Web TV**: manda alla web TV **le 9 domande del §5.7** (il testo è pronto
   da copiare). Ti servono: il **link HLS `.m3u8` in https** (e, se c'è, un link
   di **riserva** su un altro server), il **CORS** attivo per
   `nextgenerationbusiness.it`, la conferma che reggono **1000 persone insieme**
   (circa 3 Gbit/s, §5.6), se usano **link firmati** (e con quale sistema), e un
   **link di prova** attivo qualche giorno prima. Mandami il link appena ce l'hai:
   lo provo e, se vuoi, restringo la CSP ai loro domini.
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
7. [ ] **Brevo** (§4): verifica il piano (servono circa **3.100 email** fra il
   26 settembre e il 2 ottobre, oltre alle altre email dello studio: il piano
   gratuito da 300 al giorno non basta; se il piano ha un tetto giornaliero
   imposta `DIRETTA_MAX_GIORNO`), SPF/DKIM/DMARC del dominio verificati, e
   valuta di spegnere il tracciamento dei clic per le email transazionali.
8. [ ] **Pubblica** questo ramo sul sito (unisci la richiesta di modifica):
   popup e pulsanti compaiono da soli dal 25 settembre.

**Prima di inviare le credenziali (entro il 26-27 settembre)**

9. [ ] Entra in `/diretta/gestione/` con "Primo accesso" (§6.1).
10. [ ] Crea l'evento **`napoli-2026`** con gli orari veri e il link della web TV
    (stesso identificativo e stessi orari di `assets/diretta-stato.js`: se li
    cambi, aggiorna anche quel file).
11. [ ] **Prova generale** con un evento di prova e 3-4 persone vere (tu e dei
    colleghi): email di prova, credenziali, accesso **da un iPhone con Safari,
    da un telefono Android, da un computer con Chrome, Firefox ed Edge**, "Vai in
    onda" con il link di prova della web TV, "Attiva l'audio", la qualità, schermo intero,
    pausa, cambio del link, "Password dimenticata?", esportazione. Su iPhone
    prova anche con il **Risparmio energetico** attivo.
12. [ ] Prova sul progetto vero il **contatore dei collegati** e
    l'**esportazione** (servono gli indici del passo 4) e, se possibile, un
    piccolo carico: 300 accessi in 2 minuti con account di prova (§9).
13. [ ] Carica il file degli iscritti online, controlla l'anteprima, crea gli
    account, "Invia email di prova a me", poi **"Invia le credenziali"**.

**Il giorno prima (1° ottobre)**

14. [ ] "Aggiorna esiti", correggi gli indirizzi respinti, "Reinvia a chi non
    l'ha ricevuta". Tieni a portata di mano il numero dell'assistenza e la
    sezione 7 ("account disattivato", "password dimenticata").

**Il 2 ottobre**: *Regia* → "Vai in onda" quando la web TV trasmette; "Pausa"
a pranzo; "Termina" alla fine; poi *Esporta* per gli attestati. Dopo l'evento,
chiedi alla web TV di disattivare il link se la registrazione non deve restare
visibile.

**Da decidere con calma** (non bloccano Napoli)

- Facoltativo: in *Firestore* → *TTL*, una regola sul campo `scade` per i
  gruppi di raccolte `tentativiIp` e `limiti`, così i contatori dei limiti
  vecchi si cancellano da soli (senza, restano ma non danno fastidio).
- Per quanto tempo tenere accessi e presenze (dati personali: per esempio 12
  mesi) e se aggiungere una pulizia automatica; l'informativa privacy è già
  collegata dalla pagina di accesso e dalle email.
- Se un giorno servirà impedire del tutto la condivisione del link del video:
  passare a Vimeo, Mux o Cloudflare Stream (§11).
