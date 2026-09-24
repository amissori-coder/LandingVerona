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
5. [YouTube: la diretta e i limiti che non si possono togliere](#5-youtube-la-diretta-e-i-limiti-che-non-si-possono-togliere)
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
            ── video ───────────────────────────────▶  YouTube (youtube-nocookie.com)

 /diretta/gestione/ ── token del gestore ──▶ api/diretta-gestione ─────────────▶  Firestore + Auth
                                            api/diretta-cron (ogni 5 min) ─ email ─▶ Brevo
 sito (home, Napoli) ── stato in onda ────▶ api/diretta-stato (cache CDN 30 s) ─▶  Firestore (1 lettura ogni 30 s)
```

**File del sito** (statici, GitHub Pages):

| File | Che cosa fa |
|---|---|
| `diretta/index.html`, `diretta.css`, `diretta.js` | la pagina dei partecipanti |
| `diretta/player-youtube.js` | il player: **l'unico codice che parla con YouTube**, usato da pagina e regia (vedi [§11](#11-cambiare-piattaforma-video)) |
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
| `eventi/{idEvento}` | i partecipanti di quell'evento, i gestori | titolo, data, orari, stato, programma; l'identificativo del video **solo mentre è in onda** |
| `partecipanti/{uid}` | solo la persona stessa | nome utente, nome, cognome, email, azienda, eventi, stato delle email, ultimo accesso |
| `nomiUtente/{nomeUtente}` | solo il server | → uid: garantisce che un nome utente esista una volta sola |
| `indirizzi/{email}` | solo il server | → uid: garantisce che un'email abbia un solo account |
| `sessioni/{uid}` | solo il server | account attivo o disattivato, dispositivo ammesso |
| `eventiRiservati/{idEvento}` | solo il server | il link del video come l'ha incollato il gestore |
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

## 5. YouTube: la diretta e i limiti che non si possono togliere

**Da fare SUBITO** se il canale non ha mai trasmesso dal vivo: la prima
attivazione delle dirette su un canale YouTube può richiedere **fino a 24 ore**
(YouTube Studio → *Crea* → *Trasmetti dal vivo* → *Attiva*).

**Come impostare la diretta su YouTube** (YouTube Studio → *Crea* → *Trasmetti
dal vivo*):
- visibilità **Non in elenco**;
- *Consenti incorporamento* **attivo** (senza, il player mostra "video non
  disponibile");
- *Chat dal vivo*: disattivata (non si vede comunque, ma evita moderazione);
- pubblico **"No, non è destinato ai bambini"** (i video per bambini hanno il
  player incorporato limitato) e **nessuna limitazione d'età** (blocca
  l'incorporamento);
- **DVR attivo** (serve alla pausa e a "Torna in diretta");
- **chiave di streaming persistente** (la stessa per le prove e per il giorno);
- copia il link della diretta (va bene quello della pagina, quello breve
  `youtu.be/…` o quello `/live/…`) e incollalo nella gestione.
- **Prova generale almeno 3 giorni prima**: una diretta di prova non in elenco,
  inserita in un evento di prova della gestione, guardata da `/diretta/` su un
  iPhone, un telefono Android e un computer.
- **Se la diretta YouTube cade** a lungo, YouTube la chiude e per ripartire ne
  serve una nuova, con un altro link: avviala e incolla il nuovo link in
  *Regia* → chi guarda passa al nuovo video da solo, senza ricaricare.
- Dopo l'evento, se non deve restare visibile, rendi il video **privato**.

**Cosa abbiamo fatto per ridurre i marchi e i suggerimenti.** Player ufficiale
(API IFrame), dominio `youtube-nocookie.com`, parametri `controls=0`, `rel=0`,
`playsinline=1`, `disablekb=1`, `iv_load_policy=3`, `fs=0`; i comandi sono
nostri, nella grafica del sito; in pausa e a fine diretta il player **sparisce**
e al suo posto compare una nostra schermata, così i suggerimenti di YouTube non
si vedono.

**Cosa NON si può togliere, detto chiaramente:**

1. **Il logo di YouTube, il titolo del video e "Guarda su YouTube"** compaiono
   all'avvio e al passaggio del mouse. Il parametro `modestbranding` **non ha
   più effetto dall'agosto 2023** (lo abbiamo lasciato, con un commento, ma è
   ignorato). Nessun parametro ufficiale li toglie.
2. **Il "livello trasparente sopra il video che blocca i clic"** che avevi
   chiesto **l'ho preparato ma lasciato SPENTO**. Le regole di YouTube
   (*Required Minimum Functionality*, sezione sui player incorporati) dicono
   testualmente che **non si possono mostrare "overlay, cornici o altri
   elementi visivi davanti a qualsiasi parte di un player incorporato, compresi
   i controlli"**, né usarli per oscurarlo. Un livello davanti al video, anche
   trasparente, è esattamente questo: accenderlo vuol dire violare i termini.
   Per lo stesso motivo le nostre schermate di pausa e di fine **non coprono** il
   video: il player viene nascosto e la schermata prende il suo posto; e la
   barra dei comandi sta **sotto** il video, non sopra. L'interruttore esiste
   (`livelloTrasparente` in `player-youtube.js`) solo perché la scelta resti
   tua, sapendo che è fuori regola.
3. **La qualità** la sceglie sempre YouTube: dal 2019 l'API ignora la richiesta
   di una qualità precisa. Il selettore "Qualità" quindi con YouTube **non
   compare**; è pronto per Vimeo, Mux o Cloudflare Stream (§11).
4. **Su iPhone e iPad il volume** si regola solo con i tasti del dispositivo:
   Apple non lo permette da una pagina web. Lì il cursore del volume non
   compare; restano "Attiva l'audio" e il muto.
5. **Il link del video si può condividere.** L'identificativo del video arriva
   al browser solo dopo l'accesso e solo mentre l'evento è in onda, e non è mai
   nel codice pubblico. Ma chi è dentro può sempre copiarlo (è nell'iframe) e
   una diretta "non in elenco" è vista da chiunque abbia il link. YouTube non
   permette di limitare l'incorporamento a un solo sito. Se un giorno servirà un
   controllo vero: Vimeo con i domini consentiti, oppure Mux o Cloudflare Stream
   con indirizzi firmati (§11).
6. **"Un solo dispositivo"** (opzione per evento) scollega il primo dispositivo
   quando si entra dal secondo: è un **deterrente** contro la condivisione delle
   credenziali, non una barriera assoluta (per il motivo del punto 5).

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
   di inizio e di fine, link della diretta YouTube, programma (una voce per
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
- Prova il link: *Regia* → **"Vedi come un partecipante"**.

### 6.4 Il giorno dell'evento (scheda *Regia*)

- Quando YouTube è in onda, **"Vai in onda"**: tutte le pagine aperte passano da
  sole dall'attesa alla diretta. Il contatore mostra le persone collegate in
  questo momento (si aggiorna ogni 20 secondi).
- **Pausa** (con l'orario di ripresa, facoltativo) e **Riprendi**: in pausa i
  partecipanti vedono "Pausa: si riprende alle 14.30", non la fine.
- **"Avviso a tutti"**: una riga che compare in cima alla pagina di tutti
  ("Problema tecnico: riprendiamo tra 5 minuti").
- **Cambio del video**: incolla il nuovo link; la regia lo prova prima in una
  piccola anteprima e lo blocca se YouTube non lo fa vedere. Chi guarda passa al
  nuovo video da solo, senza ricaricare.
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
  scopre chi è iscritto. Limite noto: se Brevo o Google rispondono molto
  lentamente, la risposta per un account esistente può arrivare più tardi (per
  evitarlo del tutto servirebbe spedire dopo la risposta con `waitUntil` di
  Vercel, una dipendenza in più che non abbiamo aggiunto); ogni account può
  generare al massimo 3 di queste email al giorno. Tetti orari a finestra
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
0,6 %. Nessuna funzione è sul percorso del video (lo trasmette YouTube).

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

Tutte in `diretta/prove/` (più tre nel servizio, `email-service/prove/`).
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
| `email-service/prove/diretta-nome-utente.prove.js` | la regola del nome utente: accenti, apostrofi (anche tipografici), trattini, punti, cognomi composti, doppi nomi, maiuscole, spazi, lettere straniere, cirillico e greco, omonimi, doppioni, anteprima; la copia del servizio è identica a quella del sito | RISULTATO_nome-utente |
| `email-service/prove/diretta-password.prove.js` | 10 caratteri, niente 0/O/o/1/l/I/i, 20.000 password tutte diverse, nessuna password nei log o in Firestore | RISULTATO_password |
| `email-service/prove/diretta-mail.prove.js` | le email: HTML e testo, credenziali in carattere a spaziatura fissa, collegamenti, date, assistenza, niente trattini lunghi, niente HTML iniettato, promemoria mai con la password | RISULTATO_email |
| `regole.prova.js` | le regole di Firestore: un partecipante legge solo il suo evento e il suo profilo; presenze solo nelle forme e nei tempi previsti; account disattivato o secondo dispositivo | RISULTATO_regole |
| `separazione.prova.js` | nessun collegamento con l'area riservata; un token della diretta è rifiutato dal progetto dello studio | RISULTATO_separazione |
| `doppioni.prova.js` | stesso file due volte, stessa email scritta in modi diversi, **tre caricamenti contemporanei** con 20 "Mario Rossi" ciascuno, omonimi, correzioni: **zero account doppi, zero nomi utente doppi** | RISULTATO_doppioni |
| `accesso.prova.js` | accesso con "Mario Rossi", 5 errori e attesa crescente, 20 tentativi contemporanei (ne arrivano 5), password dimenticata a risposta e tempi uguali, gestori (anche chi si registra da solo con l'email di un gestore), stato pubblico | RISULTATO_accesso |
| `coda.prova.js` | 1000 credenziali con rifiuti, errori, un processo ucciso a metà, blocco di Brevo, tetto giornaliero, due giri insieme: **nessuna email doppia**; promemoria una volta sola e mai con la password | RISULTATO_coda |
| `pagina.prova.js` | la pagina della diretta su computer, iPhone (senza schermo intero, come Safari) e tablet: attesa, messa in onda, audio, pausa, tastiera, schermo intero, cambio del video, errori, connessione persa, pausa dell'evento, fine e ritorno in onda, un solo dispositivo, reimpostazione | RISULTATO_pagina |
| `gestione.prova.js` | la gestione contro il servizio vero: anteprima di un file con tutti i casi, creazione a gruppi con "Riprendi", ricerca e azioni, regia, email, esportazione Excel riletta | RISULTATO_gestione |
| `sito.prova.js` | popup della home (finestra di date, precedenza sugli altri popup anche ricaricando, ESC, sfondo, focus, "non mostrare più"), pillola, pagina di Napoli (menu, sezione, IN DIRETTA solo in onda), nessuna chiamata fuori dal giorno dell'evento | RISULTATO_sito |
| `e2e.prova.js` | **il percorso completo con tutto vero** tranne YouTube: il gestore si attiva dall'email, crea evento e partecipanti, manda le credenziali; Mario le legge dalla posta, entra dal telefono, aspetta, va in onda, schermo intero, cambio del link, connessione persa, pagina riaperta, un minuto di presenza, esce, password dimenticata, accesso automatico; fine ed esportazione | RISULTATO_e2e |
| `carico.sh` | 1000 accessi in 2 minuti (§9) | nessun errore |

**Cosa le prove non coprono** (e va provato a mano, vedi §12): YouTube vero
(la rete di prova non lo raggiunge), Safari vero su iPhone e iPad (Playwright
usa Chromium, che simula il telefono ma non è Safari), Firefox ed Edge, Brevo
vero, il progetto Firebase vero (quote, indici, limiti di Google).

**Gli screenshot** di consegna sono in [`diretta/screenshot/`](screenshot/)
(telefono e computer: accesso, attesa, diretta, gestione con l'anteprima del
caricamento, email, popup della home, sezione di Napoli). Si rifanno con
`node diretta/prove/screenshot-finali.js` dopo le prove.

## 11. Cambiare piattaforma video

Tutto quello che riguarda YouTube sta in **`diretta/player-youtube.js`**: la
pagina della diretta e la regia della gestione usano solo questa interfaccia.

```js
window.NGBPlayer = {
    nome: 'youtube',
    crea(contenitore, { onPronto, onStato, onErrore, onVolume }),  // -> istanza
    idDa(url)   // l'identificativo del video dal link incollato, oppure ''
};
// istanza:
player.carica(id); player.play(); player.pausa(); player.alterna();
player.muto(); player.smuto(); player.eMuto(); player.volume(0-100); player.leggiVolume();
player.vaiAlLive(); player.livelliQualita(); player.impostaQualita(v);
player.stato(); player.mostra(true|false); player.distruggi();
```

Per passare a Vimeo, Mux o Cloudflare Stream:

1. scrivi `diretta/player-vimeo.js` (o `-mux`, `-cloudflare`) con la **stessa
   interfaccia**, compresa `idDa` (identificativo di al massimo 64 caratteri fra
   lettere, numeri, `_` e `-`: il servizio accetta così com'è quello che la
   gestione gli manda);
2. cambia la riga `<script src="player-youtube.js">` in `diretta/index.html` e
   quella `<script src="../player-youtube.js">` in `diretta/gestione/index.html`;
3. aggiungi i domini del fornitore alla `Content-Security-Policy` in testa alle
   stesse due pagine (`frame-src` e `script-src` per il player, per esempio
   `https://player.vimeo.com`; `connect-src` e `media-src` con `blob:` per i
   flussi HLS, per esempio `https://stream.mux.com` o `https://videodelivery.net`).

Il servizio non va toccato. Con quei fornitori anche il selettore della qualità
comincia a funzionare (livelli HLS), e con Vimeo (domini consentiti) o con Mux e
Cloudflare (indirizzi firmati) si può impedire la condivisione del link.

## 12. Cosa devi fare tu

In ordine, pensando all'evento di Napoli del **2 ottobre** (oggi è il 24
settembre: c'è tempo, ma non tanto).

**Subito (oggi o domani)**

1. [ ] **YouTube**: se il canale non ha mai trasmesso dal vivo, attiva le dirette
   (fino a 24 ore di attesa). Poi crea la diretta di Napoli: **non in elenco**,
   **incorporamento consentito**, non per bambini, nessuna limitazione d'età,
   DVR attivo, chiave di streaming persistente (§5).
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
10. [ ] Crea l'evento **`napoli-2026`** con gli orari veri e il link YouTube
    (stesso identificativo e stessi orari di `assets/diretta-stato.js`: se li
    cambi, aggiorna anche quel file).
11. [ ] **Prova generale** con un evento di prova e 3-4 persone vere (tu e dei
    colleghi): email di prova, credenziali, accesso **da un iPhone con Safari,
    da un telefono Android, da un computer con Chrome, Firefox ed Edge**, "Vai in
    onda" con la diretta di prova di YouTube, "Attiva l'audio", schermo intero,
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

**Il 2 ottobre**: *Regia* → "Vai in onda" quando YouTube trasmette; "Pausa" a
pranzo; "Termina" alla fine; poi *Esporta* per gli attestati. Dopo l'evento,
rendi privato il video su YouTube se non deve restare visibile.

**Da decidere con calma** (non bloccano Napoli)

- Facoltativo: in *Firestore* → *TTL*, una regola sul campo `scade` per i
  gruppi di raccolte `tentativiIp` e `limiti`, così i contatori dei limiti
  vecchi si cancellano da soli (senza, restano ma non danno fastidio).
- Per quanto tempo tenere accessi e presenze (dati personali: per esempio 12
  mesi) e se aggiungere una pulizia automatica; l'informativa privacy è già
  collegata dalla pagina di accesso e dalle email.
- Se un giorno servirà impedire del tutto la condivisione del link del video:
  passare a Vimeo, Mux o Cloudflare Stream (§11).
