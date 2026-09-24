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
6. [Il giorno prima e il giorno dell'evento](#6-il-giorno-prima-e-il-giorno-dellevento)
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
| `diretta/player-youtube.js` | il player: **l'unico file che parla con YouTube** (vedi [§11](#11-cambiare-piattaforma-video)) |
| `diretta/nome-utente.js` | la regola del nome utente, **una sola** per tutto il sistema |
| `diretta/config.js` | configurazione web del progetto Firebase e indirizzo del servizio |
| `diretta/reimposta.html` | scelta della nuova password |
| `diretta/gestione/` | la pagina dei gestori |
| `diretta/firebase/` | regole e indici di Firestore, `firebase.json` |
| `diretta/prove/` | prove automatiche (emulatori, Playwright, carico) |
| `assets/diretta-stato.js` | legge "in onda sì/no" con la cache, per popup e pulsante |
| `assets/diretta-popup.js` | il popup "Diretta Napoli" della home |

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
[§9](#9-tenuta-con-1000-persone-stime-e-piani): su Blaze la giornata costa
**meno di 1 euro** (la quota gratuita giornaliera resta, si paga solo quello che
la supera).

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
| `DIRETTA_ASSISTENZA_TELEFONO` | *(vuoto)* | un numero di telefono per l'assistenza, se c'è |
| `DIRETTA_DOMINIO_TECNICO` | `utenti.diretta.nextgenerationbusiness.it` | il dominio delle email tecniche (non riceve posta, non va creato) |
| `DIRETTA_MAX_LOTTO` | `40` | quante email per giro della coda |
| `DIRETTA_CONCORRENZA` | `4` | quante email in parallelo dentro un giro |
| `DIRETTA_PAUSA_MS` | `300` | pausa fra un gruppo di email e il successivo |
| `DIRETTA_MAX_GIORNO` | `0` (nessun tetto) | tetto di email della diretta al giorno: impostalo se il piano Brevo ha un limite giornaliero (§4) |

**Già presenti, riusate così come sono**: `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`, `APP_BASE_URL`,
`ALLOWED_ORIGIN`, `CRON_SECRET`, `BREVO_API_KEY` (quest'ultima serve per
vedere le email **respinte**, §4).

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
`BREVO_API_KEY` (già presente per la newsletter).

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

## 6. Il giorno prima e il giorno dell'evento

*Da completare con il flusso della gestione dopo le prove (bozza):*

1. **Settimana prima.** In gestione: crea l'evento (titolo, data, orari,
   programma, link YouTube), carica il file degli iscritti online, controlla
   l'anteprima, crea gli account. "Invia email di prova a me", controlla la
   posta, poi "Invia a tutti". Attiva i promemoria (giorno prima, ora prima).
2. **Giorno prima.** Controlla in gestione le email respinte o in errore,
   correggi gli indirizzi, "Reinvia a chi non l'ha ricevuta". Prova il link
   YouTube con "Vedi come un partecipante".
3. **Giorno dell'evento.** Scheda *Regia*: quando YouTube è in onda, premi
   **Vai in onda** (la pagina di tutti passa da sola dall'attesa alla diretta).
   Il contatore mostra le persone collegate. Se il video cambia, incolla il
   nuovo link: chi guarda passa al nuovo video senza ricaricare. Alla fine,
   **Termina**.
4. **Dopo.** *Esporta*: file Excel con partecipanti e accessi (chi, quando, per
   quanto tempo) per gli attestati.

---

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
   maiuscole e spazi (anche quelli invisibili che arrivano da Excel). Se
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
  indirizzo IP. Il blocco non è solo sul nome, apposta: altrimenti chiunque
  potrebbe tenere fuori una persona sbagliando la password al posto suo.
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

### Cosa la prova di carico dimostra e cosa no

*Risultati da inserire dopo l'esecuzione di `diretta/prove/carico.prova.js`.*

---

## 10. Le prove

*Da completare con i comandi e i risultati.*

---

## 11. Cambiare piattaforma video

Tutto quello che riguarda YouTube sta in **`diretta/player-youtube.js`**. La
pagina usa solo questa interfaccia:

```js
const player = NGBPlayer.crea(elemento, { onPronto, onStato, onErrore, onVolume });
player.carica(idVideo); player.play(); player.pausa(); player.alterna();
player.muto(); player.smuto(); player.eMuto(); player.volume(0-100); player.leggiVolume();
player.vaiAlLive(); player.livelliQualita(); player.impostaQualita(v);
player.stato(); player.mostra(true|false); player.distruggi();
```

Per passare a Vimeo, Mux o Cloudflare Stream si scrive un
`player-vimeo.js` (o `-mux`, `-cloudflare`) con la stessa interfaccia, si
cambia la riga `<script src="player-youtube.js">` in `diretta/index.html` e,
nella gestione, si incolla l'identificativo del video della nuova piattaforma.
Con loro anche il selettore della qualità comincia a funzionare (livelli HLS).

---

## 12. Cosa devi fare tu

*Da completare.*
