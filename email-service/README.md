# Servizio email dell'Area riservata

Questa piccola funzione invia le email di impostazione/reimpostazione password
dell'area riservata **da un server di posta autenticato sul dominio dello studio** (oggi Brevo), con:

- mittente `noreply@nextgenerationbusiness.it` (firma Revilaw S.p.A.);
- testo in italiano, firmato;
- link di conferma **sul dominio nextgenerationbusiness.it** (non più `firebaseapp.com`).

Così le email superano i filtri antispam e risultano inviate da voi.

Si ospita gratis su **Vercel**. Nessuna password finisce nel codice: tutto sta
nelle variabili d'ambiente di Vercel.

---

## 1. L'account Vercel

1. Vai su https://vercel.com e registrati con GitHub (l'account `amissori-coder`).
2. **Il progetto gira sul piano Pro**, e non è un dettaglio contabile. Il piano
   Hobby vieta l'uso commerciale, ammette **12 funzioni** per rilascio e fa
   girare i lavori programmati **una volta al giorno**. Tutti e tre i vincoli
   hanno lasciato tracce nel codice: sono segnalate qui sotto, una per una.

## 2. Genera la chiave di servizio Firebase

Serve per generare i link di reimpostazione password.

1. Console Firebase → **Impostazioni progetto** (ingranaggio) → scheda **Account di servizio**.
2. Premi **Genera nuova chiave privata** → scarica il file JSON.
3. Tienilo da parte: NON va messo nel repository. Il contenuto lo incollerai in una variabile su Vercel (passo 4).

## 3. Importa il progetto su Vercel

1. Su Vercel: **Add New… → Project** → importa il repository `LandingVerona`.
2. In **Root Directory** scegli la cartella **`email-service`** (importante: non la radice).
3. Framework preset: **Other**. Lascia i comandi di build vuoti.
4. Prima di premere Deploy, apri **Environment Variables** e aggiungi quelle del passo 4.

## 4. Variabili d'ambiente (su Vercel)

| Nome | Valore |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | la chiave del passo 2, **in base64** (vedi nota qui sotto) |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | il **login SMTP di Brevo** (del tipo `xxxxxxx@smtp-brevo.com`) |
| `SMTP_PASS` | la **chiave SMTP di Brevo** (non la password con cui si accede al sito) |
| `SMTP_FROM_NAME` | `Revilaw S.p.A.` |
| `SMTP_FROM_EMAIL` | `noreply@nextgenerationbusiness.it` |
| `APP_BASE_URL` | `https://nextgenerationbusiness.it` |
| `ALLOWED_ORIGIN` | `https://nextgenerationbusiness.it` |

> **Il server di posta e' Brevo, non piu' Aruba (dal 21/07/2026).** Aruba aveva
> bloccato gli invii con un `525 5.7.13` (protezione anti-abuso della casella:
> non e' fatta per mandare decine di email in sequenza). Da allora TUTTO esce da
> Brevo: attivazioni e reimpostazioni password, Comunicazioni, inviti ai
> questionari e newsletter. La casella Aruba continua a **ricevere** la posta
> normalmente, e il mittente che i destinatari vedono resta
> `noreply@nextgenerationbusiness.it`: il login `...@smtp-brevo.com` serve solo
> ad autenticarsi.
>
> Conseguenza da tenere a mente: **un solo account Brevo regge tutte le email
> dello studio**. Il monte invii del piano e' condiviso, e una sospensione
> dell'account fermerebbe anche le email con cui le persone entrano nell'area
> riservata.

### Inviti alle aziende (sezione Eventi)

Nella sezione Eventi si carica un elenco di aziende **non ancora iscritte** e
si manda l'invito. L'invito puo' partire su due canali, scelti al momento
dell'invio.

**Canale normale: email ordinaria da Brevo.** Funziona **senza aggiungere
niente**: usa le variabili `SMTP_*` gia' presenti qui sopra. Ogni messaggio
porta il collegamento di disiscrizione e le intestazioni `List-Unsubscribe`,
e chi si e' gia' disiscritto viene saltato (stesso elenco della newsletter).

Facoltative, ma **consigliate** per un invio a freddo:

| Nome | Valore |
|---|---|
| `MKT_SMTP_HOST` | `smtp-relay.brevo.com` |
| `MKT_SMTP_PORT` | `587` |
| `MKT_SMTP_USER` | login SMTP di un **secondo** account (o sotto-account) Brevo |
| `MKT_SMTP_PASS` | la chiave SMTP di quell'account |
| `MKT_FROM_EMAIL` | il mittente degli inviti (es. `eventi@nextgenerationbusiness.it`) |
| `MKT_FROM_NAME` | `Next Generation Business` |
| `MKT_REPLY_TO` | dove far arrivare le risposte (se manca, risponde a chi ha premuto invia) |
| `MKT_MAX_LOTTO` | quanti messaggi per chiamata (predefinito 40) |
| `MKT_MAX_ORA` | tetto orario per utente (predefinito 2000) |
| `MKT_PAUSA_MS` | pausa fra un messaggio e il successivo (predefinito 0: il relay ha le sue code) |

> **Perche' un secondo account Brevo.** Come dice la nota qui sopra, un solo
> account Brevo regge oggi TUTTE le email dello studio, comprese quelle con cui
> le persone entrano nell'area riservata. Un invio a freddo porta rimbalzi e
> segnalazioni di spam: se il conto viene sospeso per quelli, si ferma anche
> l'accesso all'area riservata. Con `MKT_SMTP_*` gli inviti viaggiano su un
> conto separato e il danno resta li'. Se le variabili non ci sono, l'invio
> funziona lo stesso dal mittente di sempre.

**Secondo canale: PEC.** Per l'invito formale. La casella dello studio e'
**`revilawngb@pec.it`**: il dominio `pec.it` e' di Aruba (gli MX puntano a
`mx.pec.aruba.it`), quindi host e porte predefiniti nel codice sono gia' quelli
giusti e **le sole variabili davvero necessarie sono tre**:
`PEC_SMTP_USER`, `PEC_SMTP_PASS`, `PEC_FROM_EMAIL`. Finche' le variabili mancano,
il canale resta spento nell'area riservata e il servizio **si rifiuta di
spedire**: l'elenco si puo' comunque caricare e preparare.

| Nome | Valore |
|---|---|
| `PEC_SMTP_USER` | `revilawngb@pec.it` |
| `PEC_SMTP_PASS` | la password di quella casella (vedi la nota sulla verifica in due passaggi) |
| `PEC_FROM_EMAIL` | `revilawngb@pec.it` (lo stesso: il gestore rifiuta qualunque altro mittente) |
| `PEC_FROM_NAME` | `Revilaw S.p.A.` |
| `PEC_REPLY_TO` | **da lasciare vuota** se le risposte si vogliono leggere nell'area riservata (vedi la nota) |
| `PEC_SMTP_HOST` | `smtps.pec.aruba.it` — **si puo' omettere**, e' il predefinito |
| `PEC_SMTP_PORT` | `465` — si puo' omettere |
| `PEC_MAX_LOTTO` | quante PEC per chiamata (predefinito 15) |
| `PEC_MAX_ORA` | tetto di PEC all'ora per utente (predefinito 300) |
| `PEC_PAUSA_MS` | pausa fra una PEC e la successiva (predefinito 1500) |

> **Dipendenza aggiunta: `imapflow`** (licenza MIT, usabile in un prodotto
> chiuso). Attenzione se un domani si tocca la versione: imapflow e' stato
> AGPL-3.0 dalla 1.0.28 alla 1.0.63 ed e' MIT dalla 1.0.65 in poi, quindi non
> va mai fissato un intervallo che possa risolversi sotto quella versione. Il
> `package-lock.json` e' nel repository apposta: senza, ogni deploy
> reinstallerebbe l'ultima versione pubblicata, licenza compresa.
>
> > **Perche' la PEC non passa da Brevo.** Una PEC ha valore legale solo se parte
> da una casella PEC attraverso l'SMTP del gestore accreditato: e' il gestore a
> produrre la ricevuta di accettazione e quella di consegna. Brevo non e' un
> gestore PEC, quindi da li' uscirebbe posta ordinaria, senza ricevute, e
> diverse caselle PEC aziendali sono impostate per rifiutarla. Per questo il
> canale PEC ha credenziali sue (`lib/canali-invito.js`).
>
> **Le ricevute** (accettazione e consegna) arrivano nella casella PEC, non
> qui: l'area riservata registra la presa in carico da parte del gestore e
> l'eventuale rifiuto, non la consegna finale.

> **Dove sta il codice degli inviti.** Non in un endpoint suo:
> `lib/aziende-invito.js`, con `api/presenze.js` che gli devia le richieste
> che portano `sezione: "aziende"`. Il motivo era il tetto di **12 funzioni
> serverless per rilascio** del piano Hobby, che qui era gia' raggiunto: la
> tredicesima faceva fallire la distribuzione con *"No more than 12 Serverless
> Functions can be added to a Deployment on the Hobby plan"*. Le librerie in
> `lib/` non contano, quindi tutto il lavoro sta li'.
>
> **Sul piano Pro quel tetto non c'e' piu'** (si sta abbondantemente sotto il
> limite del piano), quindi oggi questa e' una scelta e non una costrizione:
> si puo' riportare fuori come endpoint suo, e guadagnarci log ed errori
> separati invece che mescolati a quelli delle presenze. Non e' una modifica
> a costo zero - cambia l'indirizzo che chiama l'area riservata - quindi va
> fatta lasciando per un po' anche la vecchia deviazione, non tagliando netto.

> **Il modulo si carica solo quando serve, e non e' un dettaglio.**
> `api/presenze.js` chiede `require('../lib/aziende-invito')` **dentro** il
> ramo che gestisce `sezione: "aziende"`, e `lib/lettore-pec.js` carica
> `imapflow` solo quando apre davvero la casella. Con i `require` in cima
> succedeva questo: `imapflow` si tira dietro `pino` e `thread-stream`
> (quest'ultimo dichiara `node >= 20`), e se una di quelle librerie non parte
> sul runtime non muore la sezione aziende, muore **tutto** `presenze.js` —
> prima di scrivere le intestazioni CORS. Il browser non riceve una risposta
> con i permessi, quindi `fetch` **solleva** invece di tornare un errore, e
> l'area riservata puo' solo dire *"Servizio non raggiungibile"*: nessun
> codice, nessun messaggio, e presenze e cancellazioni giu' insieme a una
> libreria di posta che magari non si usa nemmeno. La distribuzione, intanto,
> risultava riuscita: il guasto era all'invocazione, non alla compilazione.
> Per lo stesso motivo `package.json` fissa `engines.node` a `22.x`, cosi'
> il runtime soddisfa quel `node >= 20` invece di dipendere dal valore
> predefinito del progetto Vercel.

### Ricevute PEC: consegne, errori e risposte

Dopo un invio PEC il gestore risponde nella casella del mittente (accettazione,
avvenuta consegna, mancata consegna) e li' arrivano anche le risposte delle
aziende. Il servizio legge quella casella in **IMAP, in sola lettura**, e
riporta gli esiti sulla scheda di ciascuna azienda: nell'area riservata compare
la colonna **Ricevute PEC** con "Consegnata", "NON consegnata" e il motivo
scritto dal gestore, "Consegna in dubbio", "Ha risposto".

| Nome | Valore |
|---|---|
| `PEC_IMAP_HOST` | `imaps.pec.aruba.it` — **si puo' omettere**, e' il predefinito |
| `PEC_IMAP_PORT` | `993` — si puo' omettere |
| `PEC_IMAP_USER` | si puo' **omettere**: senza, usa `PEC_SMTP_USER` (`revilawngb@pec.it`) |
| `PEC_IMAP_PASS` | si puo' **omettere**: senza, usa `PEC_SMTP_PASS`. Da riempire solo se la casella ha una password dedicata ai programmi di posta diversa da quella dell'invio |
| `PEC_IMAP_CARTELLA` | `INBOX` (predefinito). Da cambiare solo se un filtro sposta le ricevute altrove: quello che il lettore non vede, non esiste |
| `PEC_LETTORE_MAX` | quanti messaggi per giro (predefinito 40) |
| `PEC_LETTORE_RECUPERO` | quanti messaggi guardare all'indietro alla prima accensione (predefinito 200) |
| `PEC_CRON_SECRET` | **di norma non serve**: solo per guidare il controllo da uno scheduler ESTERNO al posto del cron di Vercel (vedi sotto) |

> **La password che scade: e' il punto piu' fragile di tutto l'impianto.** Con
> la verifica in due passaggi attiva sulla casella PEC (obbligatoria nel
> percorso verso la PEC europea), i programmi di posta non possono piu' usare
> la password principale: serve la **password dedicata ai programmi di posta**,
> che Aruba fa generare dalla webmail e che **scade ogni sei mesi**. Quando
> scade il lettore smette di funzionare. Per questo: dopo tre rifiuti di
> password consecutivi il lettore **si ferma da solo** invece di ribattere (un
> login sbagliato ripetuto fa scattare le protezioni del gestore, e quelle
> bloccherebbero anche l'INVIO delle PEC), e nell'area riservata compare un
> riquadro rosso che dice esattamente cosa e' successo. Conviene annotarsi la
> scadenza da qualche parte.

> **Come si aggiorna: da solo, ogni quarto d'ora.** Sul piano Pro il lettore
> ha un lavoro programmato suo (`/api/presenze` in `vercel.json`, `*/15`), e
> ricevute, errori e risposte compaiono senza che nessuno prema niente. Il
> pulsante **"Controlla le ricevute"** nella finestra delle aziende resta e
> serve ancora: legge la casella *adesso*, quando si e' appena spedito e non
> si vuole aspettare.
>
> Prima non era cosi': sul piano Hobby i cron girano **una volta al giorno**,
> che per una PEC e' inutile, e il controllo era solo manuale.
>
> Il giro automatico si riconosce dal segreto nell'intestazione
> `Authorization: Bearer <segreto>`, in **GET**. Ne valgono due, e la
> differenza conta:
>
> - `CRON_SECRET` — lo mette **Vercel da se'** quando fa partire i lavori di
>   `vercel.json`. Non esce mai da Vercel. E' quello in uso normalmente.
> - `PEC_CRON_SECRET` — **dedicato** a questo solo giro, da consegnare a uno
>   scheduler **esterno** (per esempio un workflow GitHub Actions) se un
>   domani si volesse guidarlo da fuori: cio' che si da' fuori deve poter fare
>   una cosa sola. Oggi non serve impostarlo.

> **`PEC_REPLY_TO`: attenzione, decide DOVE finiscono le risposte.**
> Lasciata vuota (consigliato) la risposta dell'azienda torna alla casella
> `revilawngb@pec.it`, cioe' proprio dove il lettore va a prenderla: e' cosi'
> che compare sulla scheda dell'azienda e si legge nell'area riservata.
> Impostandola, le risposte vengono dirottate su quella casella ordinaria e
> **spariscono dall'area riservata**, perche' il lettore guarda solo la PEC.
> Ha senso solo se si preferisce gestirle a mano dalla posta di sempre.
>
> Sul canale email ordinaria e' l'opposto: li' non c'e' nessun lettore, quindi
> se `MKT_REPLY_TO` non c'e' la risposta va a chi ha premuto invia.

> **Ricevute e risposte si leggono dall'area riservata.** Nella colonna
> Ricevute PEC la pastiglia dell'esito e il "Ha risposto il..." sono
> cliccabili: si apre la finestra con l'elenco dei messaggi di quell'azienda
> (accettazione, consegna, avvisi, risposte) e il testo di quello scelto.
>
> Il testo **non viene copiato su Firestore**: si va a prenderlo nella casella
> nel momento in cui qualcuno lo apre. Sulla scheda restano solo le coordinate
> (quale messaggio, di che tipo, quando), poche decine di byte. Il motivo e'
> che quella casella e' la PEC dello studio: contiene corrispondenza, e
> copiarne il testo in un archivio di marketing - che finisce anche nei backup
> notturni - vorrebbe dire conservare per sempre dati che nessuno ha chiesto.
> Per la stessa ragione il contenuto lo vedono solo amministratore, equity e
> founding partner, e il servizio accetta di leggere **solo** un messaggio
> gia' collegato alla scheda che si sta guardando: senza quel controllo
> l'endpoint diventerebbe "leggimi qualunque messaggio della PEC dello studio".

> **Cosa il lettore non fa.** Non segna niente come letto, non sposta e non
> cancella: quella casella e' l'archivio con valore legale, e il segno "letto"
> e' condiviso con la webmail. Non verifica la firma S/MIME con cui il gestore
> sigilla le ricevute: per un cruscotto interno va bene, ma la prova in una
> contestazione resta il messaggio nella casella, non la riga sullo schermo.
> Non scarica gli allegati delle risposte: ne mostra i nomi, il file si apre
> dalla casella.

> **Le risposte da posta ordinaria non arrivano.** Di predefinito una casella
> PEC Aruba **rifiuta** i messaggi non certificati: se un'azienda risponde
> dalla propria mail normale, quel messaggio non entra proprio, e non e' il
> lettore a perderlo. La ricezione ordinaria si accende dalla webmail Aruba;
> in quel caso quelle risposte compaiono, segnate come non certificate.

> **Lo spazio della casella.** Ogni invio genera almeno un'accettazione e una
> consegna: il volume in casella e' piu' che doppio rispetto a quello spedito.
> A casella piena Aruba continua a ricevere ma **blocca l'uscita**, quindi gli
> inviti successivi non partono. Prima di una campagna grossa conviene
> guardare quanto spazio resta.

Su entrambi i canali si spedisce **un destinatario per messaggio**, a lotti:
un elenco lungo parte in piu' riprese, e l'area riservata tiene il segno e non
rispedisce a chi ha gia' ricevuto.

> **Nota sulla chiave (`FIREBASE_SERVICE_ACCOUNT`).** Il file JSON è su più righe e
> Vercel non lo fa incollare bene nel campo valore. Conviene incollarlo **in base64**
> (una sola riga). Dal tuo PC, in **PowerShell**, esegui — sostituendo il percorso col
> file scaricato al passo 2 — questo comando, che copia la stringa già negli appunti:
>
> ```powershell
> [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\percorso\della\chiave.json")) | Set-Clipboard
> ```
>
> Poi incolla (Ctrl+V) nel campo valore di `FIREBASE_SERVICE_ACCOUNT`. La funzione
> riconosce da sola sia il base64 sia il JSON grezzo. La chiave resta solo su Vercel,
> mai nel repository.

Poi premi **Deploy**.

## 5. Copia l'indirizzo della funzione

A deploy finito, l'indirizzo sarà del tipo:

```
https://<nome-progetto>.vercel.app/api/invia-email
```

Comunicalo: verrà inserito in `area-riservata/firebase-config.js`
(campo `window.RV_EMAIL_SERVICE_URL`). Da quel momento l'app userà questo
servizio per tutte le email di accesso, con mittente e link Revilaw.

---

## Come funziona (in breve)

- L'app chiama `POST /api/invia-email` con `{ email, tipo }`.
- La funzione verifica che l'email sia un **utente abilitato** (collezione `utenti` su Firestore).
- Genera con Firebase Admin il link di reimpostazione, ne estrae il codice e
  costruisce un link su `nextgenerationbusiness.it/area-riservata/reimposta.html`.
- Invia l'email via il relay SMTP configurato (Brevo, con DKIM del dominio → niente spam).
- La pagina `reimposta.html` fa impostare la nuova password all'utente.

Se `RV_EMAIL_SERVICE_URL` non è configurato, l'app continua a usare l'invio
standard (mittente firebaseapp.com): niente si rompe durante la transizione.

---

## Comunicazioni (mail composte nell'area riservata)

Oltre a `invia-email`, il progetto include due funzioni per la sezione
**Comunicazioni**:

- `POST /api/invia-comunicazione` — invia una mail composta dall'utente.
  Verifica l'**ID token Firebase** del mittente (solo utenti abilitati possono
  inviare: niente relay aperto), poi invia via il relay SMTP configurato (più destinatari → BCC).
  Usa le stesse variabili d'ambiente già configurate. L'app la richiama tramite
  `window.RV_COMUNICAZIONI_URL` (in `firebase-config.js`).
- `GET /api/cron-comunicazioni` — invii **programmati/periodici**. Vercel la
  richiama **una volta al giorno** (vedi `vercel.json`): invia le comunicazioni
  in stato "programmata" la cui data è arrivata e aggiorna la pianificazione.

### Variabile in più da impostare su Vercel: `CRON_SECRET`

Perché gli invii programmati partano (e solo Vercel possa attivarli), aggiungi
in **Settings → Environment Variables** una variabile:

| Nome | Valore |
|---|---|
| `CRON_SECRET` | una stringa segreta a piacere (lunga e casuale) |

Vercel invierà quel segreto nell'header `Authorization` a ogni esecuzione del
cron; la funzione rifiuta chiunque non lo presenti. La variabile va abilitata per
l'ambiente **Production** (è lì che gira il cron). Dopo averla aggiunta, fai un
**Redeploy della Production**. Senza `CRON_SECRET` il cron resta inattivo (l'invio
immediato e la composizione funzionano comunque).

> **Prima di attivare, controlla le "Comunicazioni programmate".** Al primo giro
> del cron dopo il redeploy vengono inviate **davvero** tutte le comunicazioni
> ancora attive con data già passata (comprese eventuali prove). Apri Area
> riservata → Comunicazioni e invia a mano, annulla o riprogramma a una data
> futura ogni record scaduto, così non parte nulla di inatteso.

## I lavori programmati (cron)

Stanno tutti in `email-service/vercel.json`. Vercel li fa partire **solo sulla
Production** e solo dal ramo predefinito, mettendo da se' l'intestazione
`Authorization: Bearer <CRON_SECRET>`: senza `CRON_SECRET` fra le variabili
d'ambiente non parte nessuno dei tre.

| Percorso | Quando | Cosa fa |
|---|---|---|
| `/api/cron-comunicazioni` | `0 6-18 * * *` — ogni ora, dalle 06:00 alle 18:00 UTC | invia le comunicazioni programmate dovute, riprendendo quelle lasciate a meta' |
| `/api/programma-newsletter` | `*/15 * * * *` — ogni quarto d'ora | manda avanti le newsletter programmate, un lotto per volta |
| `/api/presenze` | `*/15 * * * *` — ogni quarto d'ora | legge la casella PEC: ricevute, errori, risposte |

Sul piano Hobby i primi due giravano **una volta al giorno** e il terzo non
esisteva: i cron Hobby sono due in tutto e girano una volta al giorno, a orario
approssimativo. Il piano Pro toglie il vincolo.

### Le comunicazioni: perche' piu' giri al giorno non rispediscono

Un invio **personalizzato** (con `{nome}`, `{incarichi}`… nell'oggetto o nel
testo) manda **una mail per destinatario, in fila**: puo' durare minuti. Prima
`api/cron-comunicazioni.js` inviava **e poi** registrava l'avanzamento, per cui
una funzione che moriva a meta' non lasciava traccia e il giro dopo
ricominciava **da tutti**. Con un giro al giorno era una rispedizione; con
tredici giri sarebbero state tredici.

Ora l'avanzamento si scrive **durante** l'invio, in
`lib/comunicazioni-avanzamento.js`: un documento per comunicazione, con
l'elenco di chi e' gia' stato servito, scritto ogni **20 destinatari**. Alla
ripresa quelli si saltano. E' la stessa strada del giro delle newsletter, che
scrive dopo ogni lotto.

Le regole che ne governano i casi storti, tutte verificate:

- **Il tempo si guarda prima di spedire, mai dopo.** La funzione ha un budget
  di 240 secondi dentro i 300 di `maxDuration`: quando scade si ferma senza
  cominciare una mail nuova, **non** fa avanzare la programmazione, e il giro
  dopo riprende da li'. Una comunicazione lasciata a meta' resta "dovuta".
- **Prima lo storico, poi la pulizia dell'avanzamento.** Nell'ordine inverso,
  un guasto in mezzo cancellerebbe la memoria di chi ha gia' ricevuto
  lasciando la comunicazione ancora dovuta: cioe' il doppio invio che tutto
  questo evita. Cosi' invece l'avanzamento sopravvive un giro di troppo e
  viene scartato da se', perche' l'occorrenza non combacia piu'.
- **L'avanzamento e' legato all'ISTANTE dell'occorrenza.** Una ricorrente
  rispedisce ogni mese con lo stesso identificativo: senza il campo `quando`,
  l'invio di settembre salterebbe tutti quelli serviti ad agosto.
- **"Servito" vuol dire tentato**, riuscito o no: un indirizzo che rifiuta
  (casella inesistente o piena) non si ritenta a ogni giro per sempre, e il
  motivo finisce nello storico della comunicazione, dove si legge dall'area
  riservata.
- **Ma finche' non parte nemmeno una mail non si segna nessuno.** Se a
  rifiutare e' il *server* (irraggiungibile, credenziali scadute) falliscono
  tutti allo stesso modo: segnarli vorrebbe dire non riprovare mai piu' e
  chiudere la comunicazione con "0 destinatari". Al primo invio riuscito si sa
  che il canale c'e', e da li' un fallimento e' dell'indirizzo.
- **Un lucchetto** (6 minuti, piu' della durata della funzione) impedisce che
  due giri lavorino la stessa comunicazione. Con il solo cron non
  capiterebbe; basterebbe un'esecuzione lanciata a mano dalla dashboard mentre
  il cron gira.
- Il **BCC** (nessuna variabile nel testo) resta una sola transazione SMTP: non
  c'e' un "a meta'" da riprendere. Si registra subito dopo, e se non e' partito
  niente non si segna nessuno.

Tutto questo e' verificato da `prove/cron-comunicazioni.prove.js`, che si
lancia con `node prove/cron-comunicazioni.prove.js` e non richiede di
installare niente: Firestore, il server di posta e l'orologio sono finti e
stanno nel file. Esce con codice 1 se qualcosa e' rosso. Se un domani si tocca
`inviaUna()` o l'ordine fra `applicaPatch` e `AV.chiudi`, e' li' che ci si
accorge di aver rotto qualcosa.

Di indirizzi, li' dentro, non ce ne sono: di ogni servito si tiene solo
l'**impronta** (`improntaEmail`, la stessa della newsletter e dell'area
riservata). In chiaro compaiono solo i falliti, perche' devono finire nello
storico leggibile, e il documento si cancella appena l'invio si conclude.

**Il primo giro resta quello delle 06:00 UTC**, la mattina presto in Italia, e
non e' un dettaglio: chi programma sceglie un **giorno** e l'area riservata lo
fissa a **mezzanotte**, quindi un cron che girasse anche di notte manderebbe
posta di lavoro alle 00:30. I giri dalle 07:00 alle 18:00 servono a finire gli
invii lunghi e a riprovare quelli andati storti, non ad anticipare. Per chi
programma non cambia niente: la comunicazione parte al primo mattino utile **a
partire dalla** data scelta, che e' quello che l'area riservata promette.

### La newsletter: `NEWSLETTER_PASSO_CRON`

Con il cron ogni quarto d'ora va impostata anche questa variabile, **altrimenti
l'area riservata continua a dire il falso** a chi programma un invio:

| Nome | Valore |
|---|---|
| `NEWSLETTER_PASSO_CRON` | `15min` |

Senza (o con `giornaliero`, il valore predefinito) la schermata Newsletter
annuncia *"Parte nella prima mattina di … Conta il giorno, non l'ora"*. Con
`15min` annuncia *"Parte a mezzogiorno di …, entro un quarto d'ora"*, che con
questo `vercel.json` e' la verita': chi programma sceglie **il giorno**, e
l'area riservata fissa l'invio a **mezzogiorno** di quel giorno (`T12:00`, per
non farsi spostare il giorno dal fuso orario).

> **Prima cambiava il giorno, non solo l'ora.** Con il cron delle 05:00 UTC una
> newsletter fissata a mezzogiorno del giorno X non era ancora dovuta quando il
> cron passava quella mattina, quindi partiva **il giorno dopo**. Ogni quarto
> d'ora, parte nel giorno scelto.

Se un domani si vuole far scegliere anche **l'ora**, il campo da aggiungere e'
uno solo (accanto a "Giorno dell'invio", nella schermata Newsletter): il
servizio accetta gia' un istante qualsiasi, e `frasePartenza` in
`area-riservata/app.js` porta il commento con quello che va cambiato.

### I tempi massimi delle funzioni

Il blocco `functions` di `vercel.json` alza `maxDuration` dove serve. Sul piano
Hobby il tetto era **60 secondi**; sul Pro si arriva a 300.

| Funzione | Prima | Ora | Perche' |
|---|---|---|---|
| `api/cron-comunicazioni.js` | 60 | **300** | un invio personalizzato manda **una mail per destinatario**, in fila |
| `api/importa-iscrizioni.js` | *(predefinito, ~10 s)* | **300** | importa il foglio intero, a blocchi di 400 scritture |
| `api/invia-comunicazione.js` | *(predefinito, ~10 s)* | **120** | stesso invio in fila, avviato a mano dall'area riservata |

**Le altre sono rimaste a 60 apposta.** `api/programma-newsletter.js` e
`api/presenze.js` hanno un budget interno legato a quel numero (`BUDGET_MS` in
`lib/giro-newsletter.js` e `lib/lettore-pec.js`) e un lucchetto che deve durare
**piu'** della funzione. Alzarli non serviva, perche' a fare il lavoro adesso
e' la **frequenza**: quindici minuti per volta, novantasei volte al giorno,
invece di un solo giro lungo.

> **Tre numeri che si muovono insieme, in tutti e tre i lavori programmati.**
>
> | Funzione | `maxDuration` | budget interno | lucchetto |
> |---|---|---|---|
> | `cron-comunicazioni` | 300 | 240 s | 6 min |
> | `programma-newsletter` | 60 | 45 s (`giro-newsletter`) | 6 min |
> | `presenze` (lettore PEC) | 60 | 40 s (`lettore-pec`) | 3 min |
>
> Il budget sta **dentro** il `maxDuration`, con margine per scrivere prima di
> essere interrotti; il lucchetto dura **piu'** del `maxDuration`, o un secondo
> giro entrerebbe mentre il primo sta ancora spedendo. Alzarne uno solo fa
> perdere l'ultimo lotto oppure lascia entrare due giri insieme: si toccano
> tutti e tre o nessuno.

## Nuova iscrizione dal sito (`/api/iscrizione-nuova`)

Endpoint **pubblico**: lo chiama il form dell'evento sul sito, in parallelo al
solito invio al foglio Google. Scrive la scheda nella collezione Firestore
`iscrizioni` usando l'account di servizio (Admin SDK), quindi le regole di
sicurezza non entrano in gioco e nessuno puo scrivere sul database dal browser.

Protezioni: accetta solo POST, solo i campi noti e con lunghezza massima, esige
`pagina` (l'evento) e almeno un recapito, valida l'indirizzo email, limita gli
invii dallo stesso IP (8 ogni 10 minuti) e non restituisce mai dati.
L'identificativo del documento deriva da email e data, quindi un doppio invio
aggiorna la stessa scheda invece di creare un duplicato.

Nessuna configurazione aggiuntiva: usa `FIREBASE_SERVICE_ACCOUNT`, gia presente.
Per collegare un altro form basta aggiungere nella pagina un secondo `fetch` a
questo indirizzo con lo stesso payload (vedi `napoli_ottobre_2026/script.js`).

## Presenze, note e cancellazioni (`/api/presenze`)

Stato ("confermato / presente / assente") e nota di ogni iscritto stanno nella
collezione `presenze`, non piu in un archivio condiviso: cosi li vede e li puo
cambiare **chiunque sia abilitato alla sezione Eventi**, qualunque sia il ruolo,
perche la decisione la prende il servizio e non le regole di Firestore.

Autorizzazione identica a quella di `/api/iscrizioni`: amministratore, contrassegno
`eventi` sulla scheda utente, oppure presenza nell'elenco di `archivio/eventiConfig`.
Le due condizioni vanno tenute allineate: se divergono si ottengono utenti che
possono scrivere ma non leggere, o viceversa. C'e anche un limite di 60 modifiche
al minuto per utente.

- `azione: "imposta"` con `stato` e/o `nota`: aggiorna una sola scheda (merge) e
  registra chi ha fatto la modifica e quando. Risponde con lo stato **completo**
  dopo la modifica, cosi salvare la sola nota non azzera lo stato.
- `azione: "cancella"`: **solo amministratore**. Cancella l'iscrizione e la sua
  presenza, e scrive una traccia in `iscrizioniCancellate` cosi la persona non
  ricompare se la sua riga esiste ancora sul foglio.
- `azione: "aggiungi"`: **amministratore, equity partner e founding partner**.
  Conta **solo il ruolo di accesso** dell'utente (`utenti/<email>.ruolo`): un
  ruolo il cui id o nome contiene "equity" o "founding/founder" abilita; la
  spunta Equity/Founding partner in anagrafica non vale. Registra un'iscrizione
  a mano,
  per chi si e iscritto da un portale esterno (dall'evento di Napoli in poi
  l'iscrizione passa anche da Eventbrite). Nel corpo: `pagina` (titolo del
  modulo dell'evento), `campi` (nome, cognome, email, telefono, azienda,
  ruolo, partecipanti, data; `partecipanti` e il numero di posti coperti
  dall'iscrizione, 1-99, e finisce anche nella colonna aggiuntiva
  "Partecipanti"), `portale` (`{ id, nome }`: id fra `eventbrite`, `sito`,
  `email`, `telefono`, `altro`; per le voci fisse l'etichetta la mette il
  servizio, con `altro` vale il `nome` scritto a mano - LinkedIn, Meetup... -
  ripulito e accorciato a 40 caratteri; finisce nella colonna aggiuntiva
  "Portale" e nella mail) e, facoltativa, `mail` `{ oggetto, html,
  testo }`: la conferma in formato NGB gia composta dall'area riservata
  (stesso schema della newsletter), spedita SOLO all'indirizzo dell'iscritto
  appena registrato, con copia nascosta a chi la inserisce (salvo che stia
  iscrivendo se stesso). L'identificativo della scheda e lo stesso del form del
  sito. Risposta: `{ ok, id, mail: { inviata, msg } }`; se la mail non parte
  l'iscrizione resta comunque registrata.
- La mail di conferma dell'inserimento manuale porta anche il collegamento
  personale firmato per **modificare o annullare** l'iscrizione (segnaposto
  `{{COMPLETA}}` sostituito qui).
- `azione: "richiedi-dati"`: stessi permessi di `aggiungi`. Manda
  all'intestatario di un'iscrizione manuale la mail (gia composta, formato NGB)
  con il collegamento personale FIRMATO verso `/completa_iscrizione/`: il
  segnaposto `{{COMPLETA}}` viene sostituito qui, con copia nascosta a chi
  chiede. Sulla scheda resta `datiRichiesti` (da chi e quando).

## Completamento dati partecipanti (dentro `/api/iscrizione-nuova`)

Azioni `completa-leggi` e `completa-salva` della funzione `iscrizione-nuova`:
NON e una funzione a parte. Il motivo era il tetto di **12 funzioni per deploy**
del piano Hobby, dove la tredicesima faceva fallire l'intera pubblicazione (il
servizio restava alla versione precedente senza che nulla lo dicesse). Sul piano
Pro il tetto non c'e' piu' e resta solo il motivo buono: e' lo stesso tipo di
endpoint, pubblico e con limite per IP, e cambia solo l'azione nel corpo. Flusso
**pubblico** (lo apre l'iscritto dal collegamento nella mail), con
firma HMAC dell'identificativo del documento: stesso segreto della
disiscrizione, contesto diverso, quindi un collegamento vale per quella sola
scheda e nessuno puo fabbricarne per le altre. Rate limit per IP.

- `azione: "completa-leggi"`: evento, posti, dati gia noti dell'intestatario
  e dei partecipanti gia scritti (con lo stato di eventuali posti annullati),
  per precompilare il modulo della pagina.
- `azione: "completa-salva"`: un elemento PER POSTO (dati, `{annulla:true}`,
  oppure null = posto riservato senza nome). Il primo aggiorna la scheda
  originale (mai l'email); gli altri diventano schede proprie con documenti dal
  nome fisso (`<id>~p2`...), quindi rimandare il modulo sovrascrive invece di
  duplicare. I posti senza nome restano contati sulla scheda originale, gli
  ANNULLATI escono dal conteggio (l'annullamento e reversibile ricompilando):
  il totale non puo mai crescere da questo modulo. Ogni scheda scritta porta
  `compilato` (nome dell'intestatario e quando), che l'area riservata mostra in
  "Aggiornato da" come "Nome (dal modulo)"; le schede con `annullato` escono
  dall'elenco. A ogni salvataggio parte all'intestatario la mail di riepilogo
  (composta DAL SERVIZIO, lib/mail-ngb.js) con lo stesso collegamento per
  modificare o annullare ancora, in copia nascosta a chi aveva chiesto i dati.

Le iscrizioni dai **moduli degli eventi del sito** (pagina che contiene
verona/roma/napoli/milano) ricevono ora anche loro una conferma automatica in
formato NGB con il collegamento personale per modificare o annullare: la
stessa possibilita di chi viene inserito a mano. Gli altri moduli del sito
(approfondimenti, newsletter) non ricevono nulla, come prima.

`/api/iscrizioni` restituisce ora anche `presenze` e toglie le cancellate: l'area
riservata riceve tutto con una sola richiesta e mostra l'elenco gia completo.

## Incontri B2B

L'invito B2B non e un sondaggio di gradimento: e la convocazione con cui
Revilaw chiama le aziende agli incontri. Ogni argomento del convegno e un
tavolo; chi riceve la mail sceglie a quali sedersi.

- **Invito massivo** (`/api/presenze`, `azione: "invita-b2b"`; amministratore,
  equity e founding partner): riceve `destinatari` (fino a 50 per chiamata,
  `{id, doc}`; l'area riservata manda i lotti in sequenza) e la mail gia
  composta (formato NGB) con i segnaposti `{{NOME}}` e `{{B2B}}`, sostituiti
  QUI per destinatario con nome e collegamento personale firmato verso
  `/incontri_b2b/`; il tratto fra `{{SE_TEMI}}` e `{{/SE_TEMI}}` resta solo per
  chi ha gia scelto i suoi incontri, con `{{TEMI}}` sostituito dall'elenco (cosi
  la mail li riporta e invita a confermarli o cambiarli). Dal menu della riga si
  puo invitare anche UNA SOLA persona. Chi manda sceglie prima, nell'area
  riservata, le AZIENDE da invitare (la mail parte a TUTTI i referenti iscritti
  delle imprese spuntate) e l'ORARIO DI OGNI TAVOLO, che entra nella mail gia
  composta: qui non cambia nulla, il servizio riceve comunque solo l'elenco dei
  destinatari e l'HTML. Una mail per destinatario; i doppioni
  di indirizzo partono una volta sola. L'area riservata manda sempre
  `forza: true`: chi ha gia ricevuto l'invito (`b2bInvito` sulla scheda) lo
  riceve di nuovo, perche saltarlo vorrebbe dire non convocarlo. Il salto resta
  possibile a chi chiama il servizio senza quel flag. `maxDuration` 60s in
  vercel.json.
- **Pagina di prenotazione** (`/api/iscrizione-nuova`, azioni `b2b-leggi` e
  `b2b-salva`, pubbliche con la stessa firma della scheda): le scelte gia fatte
  tornano come caselle spuntate, comprese le etichette storiche del form del
  sito (alias in `ALIAS_B2B`); le voci non riconducibili ai nove temi non si
  cancellano al salvataggio. L'iscritto sceglie i tavoli (viaggiano solo gli
  INDICI: le etichette le decide il servizio, costante `TEMI_B2B`) e racconta il
  progetto; almeno un tavolo e obbligatorio, la sola nota non e una
  prenotazione. All'apertura le caselle segnate sono la prenotazione se c'e gia,
  altrimenti le preferenze dell'iscrizione come punto di partenza (`daPreferenze`
  lo dice alla pagina, che avverte che finche non conferma prenotazione non ce
  n'e). La scelta va in `b2bScelte`, la nota nella colonna "Nota B2B",
  `incontro` diventa "si". L'area riservata le raccoglie anche nel riepilogo per
  argomento, con i prenotati per tavolo.
- **Chi e dello stesso EVENTO**: il campo `pagina` dice da dove arriva
  un'iscrizione e non e scritto uguale da tutti - il modulo del sito di Napoli
  scrive "Napoli 2 Ottobre 2026 - Manifestazione di interesse", l'area riservata
  (quando si aggiunge a mano) solo "Napoli 2 Ottobre 2026", dal foglio importato
  puo arrivare altro. Confrontare la stringa intera spezzava lo stesso evento in
  tanti eventi quante sono le sue provenienze: due colleghi della stessa azienda,
  uno iscritto dal sito e uno aggiunto a mano, non si vedevano. L'evento e quindi
  la parte PRIMA del trattino, ridotta all'osso; le schede si chiedono per
  intervallo su `pagina` (una lettura mirata) e, se da li non esce nessuno oltre
  a chi sta guardando, si rilegge tutto e si filtra a mano.
- **Le prenotazioni dei colleghi**: siccome l'invito parte a tutti i referenti
  di un'azienda, `b2b-leggi` restituisce anche `colleghi` - le altre persone
  della STESSA impresa per lo STESSO evento, con nome, ruolo, tavoli prenotati e
  (a parte) preferenze dell'iscrizione. Senza, due referenti si prenoterebbero
  allo stesso tavolo senza saperlo. Email e nota non escono: la nota e scritta a
  noi. Le schede dell'evento restano in memoria una trentina di secondi per non
  rileggere l'archivio a ogni apertura; chi salva butta via quella memoria, cosi
  il collega che apre la pagina un attimo dopo vede la scelta appena fatta.
- **Chi e della stessa azienda** (`chiaveAzienda` + `dominioMail` +
  `radiciAziende`): la ragione sociale la scrive ognuno a modo suo, quindi il
  confronto e tollerante. Il nome si riduce all'osso (minuscole, senza accenti,
  senza punteggiatura, senza forma giuridica: "Alfa S.r.l." e "ALFA SPA"
  diventano tutte e due `alfa`) e, nel dubbio, decide il DOMINIO della mail: chi
  scrive da `@alfa.it` e di Alfa anche con il campo azienda in bianco. I domini
  pubblici (gmail, libero, aruba, pec.it...) non contano; un prefisso `pec.` si
  toglie solo se quel che resta e ancora un dominio. Le due chiavi uniscono a
  catena. Unica eccezione: chi e stato spostato a mano (vedi sotto) non si
  unisce piu per dominio. La STESSA regola sta nell'area riservata (`app.js`,
  `raggruppaPerAzienda`), che con quella raggruppa le aziende da invitare:
  devono vedere le stesse imprese, altrimenti si invita un gruppo e se ne mostra
  un altro.

### Prenotazioni e preferenze non sono la stessa cosa

`interessi` sono le PREFERENZE spuntate dal form di iscrizione del sito: dicono
cosa interessa all'impresa, non che qualcuno verra a un tavolo. La PRENOTAZIONE
e la risposta all'invito e sta per conto suo in `b2bScelte` (etichette dei
tavoli), con `b2bRisposta` a fare da data; `b2b-salva` non tocca piu `interessi`.

- L'area riservata riceve le due cose in due colonne aggiuntive distinte:
  `B2B prenotati` (da `b2bScelte`) e `Interessi`; negli eventi con inserimento
  manuale si vedono SEMPRE, una accanto all'altra, perche e il confronto fra le
  due che dice a chi vale la pena richiedere la prenotazione.
- Il riepilogo per argomento conta SOLO le prenotazioni: sommarci le preferenze
  gonfierebbe i tavoli di gente che non ha detto di venire.
- Il riquadro "La Sua scelta attuale" della mail riporta la prenotazione, non le
  preferenze. Chi non ha ancora prenotato non lo vede.
- Vale SOLO `b2bScelte`: prima di questo invito nessun modulo di prenotazione
  era mai partito, quindi non c'e' niente da recuperare altrove e `interessi`
  non e mai una prenotazione.

### Conferma della prenotazione, con il foglio per il desk

Appena l'ospite salva la scelta, `b2b-salva` gli manda una mail di conferma
(`MNGB.confermaB2B`) con in allegato il PDF della prenotazione
(`lib/pdf-prenotazione.js`): nome, azienda, convegno, orario, luogo e i tavoli
scelti, da presentare al desk "Incontri B2B". La scelta si puo cambiare quante
volte si vuole: ogni salvataggio rimanda la mail con un foglio aggiornato, e in
fondo al foglio c'e la data di emissione, perche vale sempre l'ultimo.

- **Da dove vengono orari, luogo e nome dell'evento**: dall'invito. L'area
  riservata li manda insieme ai destinatari (`orari` e `eventoDati` nel corpo di
  `invita-b2b`) e `presenze.js` li scrive su `b2bInvito` di ogni scheda. Il
  servizio non ha una tabella degli eventi - sta nell'area riservata - e tenerne
  una seconda qui vorrebbe dire vederle divergere.

### Un orario per ogni tavolo

Gli incontri non si tengono tutti insieme: ogni argomento e un tavolo con il suo
orario, ed e l'unico modo perche chi prenota sappia se due si sovrappongono.

- `b2bInvito.orari` e una mappa `etichetta corta del tavolo -> orario` ("dalle
  14:30 alle 15:15"). `presenze.js` accetta solo le etichette che conosce
  (`lib/temi-b2b.js`), cosi nessuno puo infilare voci inventate nel foglio del
  desk.
- **L'orario si scrive in due caselle dell'ora**, inizio e fine (area riservata),
  e da li si compone la frase. Un orario scritto a mano ("14.30-15,15",
  "pomeriggio") sarebbe quattro modi di dire la stessa cosa e nessuno
  confrontabile: senza due ore confrontabili non si puo dire se due tavoli si
  sovrappongono ne mettere gli incontri in fila sul foglio del desk. La finestra
  riempie i nove tavoli in sequenza (ora del primo, durata, pausa) o con lo
  stesso orario per tutti, segnala le sovrapposizioni e non lascia partire un
  invito con un tavolo a meta o che finisce prima di cominciare.
- `lib/orari-b2b.js` rilegge le ore dalla frase e mette i tavoli in ordine di
  orario: lo usano la mail di conferma e il PDF. Riconosce SOLO la forma che le
  caselle compongono (`dalle HH:MM alle HH:MM`). Pescare due ore da una frase
  qualunque sembrerebbe generoso e invece inventa: da "sala 2.30, dalle 14:00
  alle 15:00" verrebbero fuori le 02:30 come inizio - il numero della sala - e
  il foglio del desk annuncerebbe un orario che nessuno ha mai comunicato,
  mettendo per giunta quell'incontro per primo. Un orario scritto a mano prima
  delle caselle si stampa com'e stato scritto, accanto al nome dell'incontro, e
  va in coda. L'area riservata usa la stessa identica regola e avverte quando un
  orario ricordato non si rilegge nelle caselle, invece di lasciarlo sparire.
- **Un tavolo senza orario non e in programma** a quell'evento: non compare
  nell'elenco della mail di invito, `b2b-leggi` lo rimanda con orario vuoto e la
  pagina non lo propone, e `b2b-salva` rifiuta una prenotazione che lo contenga
  (la firma sul collegamento non e un lasciapassare per scrivere quel che si
  vuole). Chi aveva gia prenotato un tavolo che nel frattempo e uscito dal
  programma lo legge scritto sulla pagina, invece di vederselo sparire.
- **Svuotare un orario lo toglie davvero.** `set(..., {merge:true})` fonde le
  mappe annidate CHIAVE PER CHIAVE: una chiave assente non viene cancellata.
  Percio `presenze.js` scrive una voce per ogni tavolo, con
  `FieldValue.delete()` dove l'orario e stato tolto; senza, al secondo invito il
  tavolo svuotato sarebbe sparito dalla mail ma sarebbe rimasto prenotabile
  dalla pagina, con tanto di orario stampato sul foglio del desk.
- **Gli orari tornano con l'elenco** (`orariB2B` su ogni riga, da
  `b2bInvito.orari`): l'area riservata li usa per riproporli anche da un altro
  computer, invece di tenerli solo nel browser di chi ha spedito.
- Se all'invito non erano stati dati orari per tavolo ma il vecchio `orario`
  unico - inviti partiti con la versione precedente - vale quello per tutti i
  tavoli: e quello che quella mail diceva davvero.
- I nove argomenti stanno in `lib/temi-b2b.js`, condiviso fra `presenze.js` e
  `iscrizione-nuova.js`: finche erano due copie bastava una virgola di
  differenza perche un orario arrivasse su un tavolo e la prenotazione su un
  altro. Le stesse etichette, nello stesso ordine, vivono anche in
  `area-riservata/newsletter-format.js` (con le descrizioni lunghe) e in
  `incontri_b2b/index.html`: sono altri pezzi del sistema, senza moduli in
  comune con il servizio.

### Spostare un referente da un'azienda a un'altra

`/api/presenze`, `azione: "sposta-azienda"` (amministratore, equity e founding
partner: la stessa mano che compone i tavoli). Serve perche chi organizza sa
cose che l'iscritto non ha scritto - che "Mario di Alfa" lavora per la
controllata, che due ragioni sociali sono la stessa impresa, che un indirizzo
personale appartiene a un'azienda che non ha nominato.

- Riceve `docs` (i nomi dei documenti: una persona puo avere piu iscrizioni allo
  stesso evento, e spostarne una sola la lascerebbe mezza di qua e mezza di la)
  e `azienda`. Tocca SOLO il campo azienda, mai email o data: l'identificativo
  del documento nasce da quelle due, e cambiarle farebbe traslocare la scheda
  perdendo prenotazione, invito e allegati, e invaliderebbe il collegamento
  firmato gia spedito.
- Lascia traccia in tre modi: `azienda` cambia ed e il dato che tutti leggono;
  `aziendaSpostata` dice l'ultimo spostamento; `aziendaStorico` li tiene tutti,
  perche la domanda vera - da dove viene questa persona - un campo singolo non
  la regge dal secondo spostamento in poi.
- `iscrizioni.js` espone la traccia come colonna aggiuntiva "Spostamento
  azienda" (la lettura e una whitelist campo per campo: senza quella riga il
  dato resterebbe sul database e non si vedrebbe mai). La frase la compone
  `lib/traccia-azienda.js`, condiviso, cosi la riga non cambia testo da sola
  fra la risposta immediata e la lettura successiva.
- La traccia serve anche da BANDIERA: chi e stato spostato a mano non si unisce
  piu per dominio della mail, ne qui (`radiciAziende`) ne nell'area riservata
  (`raggruppaPerAzienda`). Senza, mario@alfa.it spostato in Beta tornerebbe fra
  i colleghi di Alfa al primo ridisegno, e lo spostamento sembrerebbe non aver
  funzionato.
- **Il PDF e un programma della giornata**: gli incontri in ordine di orario,
  impaginati come un orario - a sinistra l'ora, a destra l'argomento - perche la
  domanda di chi ha il foglio in mano non e "a che ora e il merito creditizio"
  ma "dove devo essere adesso".
- **Il PDF e scritto a mano** (nessuna libreria): una pagina A4, i due font
  standard Helvetica in codifica WinAnsi, testo e rettangoli. Una libreria di
  impaginazione porterebbe megabyte in una funzione che deve partire in fretta.
  Cio che Latin-1 non ha (virgolette curve, trattini lunghi) viene ricondotto al
  carattere semplice piu vicino prima di scrivere.
- **Se la posta non risponde** la prenotazione resta comunque registrata e la
  risposta porta `mailInviata: false`: la pagina lo dice a chi ha appena
  prenotato, invece di far credere che il foglio sia in arrivo.
- **I limiti**: le azioni che si aprono solo dal collegamento firmato
  (`completa-*`, `b2b-*`) NON passano dal limite per indirizzo IP - i referenti
  di un'azienda escono tutti dallo stesso IP dell'ufficio e se lo mangerebbero
  in due persone - ma il salvataggio ha un tetto per SCHEDA (12 ogni 10 minuti),
  che lascia passare i ripensamenti veri e ferma l'accanimento sul pulsante, che
  sarebbe una mail dietro l'altra.

## Importazione una tantum (`/api/importa-iscrizioni`)

Riservato all'**amministratore** (ID token verificato, ruolo `admin`). Porta
dentro la collezione `iscrizioni` le iscrizioni raccolte finora, in due modi:

- senza `csv` nel corpo: legge il foglio con l'API Google (serve il foglio
  condiviso con l'account di servizio);
- con `csv`: usa il testo inviato, cioe il file scaricato dal foglio
  (*File > Scarica > Valori separati da virgole*). Non richiede nulla.

Si usa dall'area riservata: **Eventi > Importa dal foglio**. L'identificativo dei
documenti e lo stesso del form, quindi reimportare non crea doppioni e non tocca
stati e note gia collegati. Scrive a blocchi di 400 per rispettare i limiti di
Firestore.

Fatta l'importazione, il foglio non serve piu: si puo togliere `EVENTI_SHEET_ID`
dalle variabili su Vercel e la lettura restera sulle sole iscrizioni Firestore.

## Iscrizioni agli eventi (`/api/iscrizioni`)

Restituisce **solo** le iscrizioni dell'evento richiesto (di default "napoli"),
unendo **due fonti**: la collezione Firestore `iscrizioni` (dove arrivano quelle
nuove) e il foglio Google (dove ci sono quelle raccolte prima). A parita di
identificativo vince Firestore. Se il foglio non risponde, o non e configurato,
si mostrano comunque le iscrizioni presenti su Firestore. I dati sono personali, quindi
l'endpoint non e pubblico: verifica l'ID token Firebase di chi chiama, controlla
che sia un utente abilitato e attivo, e che sia amministratore **oppure**
presente nell'elenco `abilitati` di `archivio/eventiConfig`.

Configurazione del foglio (una tantum, ora **facoltativa**: serve solo a vedere
anche le iscrizioni raccolte prima del passaggio a Firestore):

1. **Condividi il foglio** con l'account di servizio gia usato da Firebase.
   L'indirizzo e il campo `client_email` dentro `FIREBASE_SERVICE_ACCOUNT`
   (finisce con `@...iam.gserviceaccount.com`): dallo Sheet, *Condividi* ->
   incolla quell'indirizzo -> permesso **Visualizzatore**.
2. **Abilita l'API Google Sheets** nel progetto Google Cloud del service account
   (console Google Cloud > API e servizi > Libreria > "Google Sheets API" > Abilita).
3. Aggiungi su Vercel la variabile d'ambiente:
   - `EVENTI_SHEET_ID` = l'ID del foglio (la parte fra `/d/` e `/edit` nell'URL)
   - facoltativa: `EVENTI_SHEET_RANGE` (default `A:Z`)
4. **Redeploy** del servizio.

Le colonne vengono lette **per nome** dall'intestazione (`Data, Pagina, Nome,
Cognome, Email, Azienda, Ruolo, Telefono, Messaggio, ...`), quindi l'ordine puo
cambiare senza rompere nulla. Il filtro dell'evento confronta la colonna
`Pagina` (senza accenti/maiuscole).

---

## Newsletter

Quattro funzioni servono la sezione **Newsletter** dell'area riservata. Le parti in
comune (firma dei collegamenti, permessi, lettura dei disiscritti) stanno in
`lib/newsletter.js`: non e una funzione, e solo codice condiviso.

### `POST /api/newsletter` — destinatari e disiscritti

Restituisce in una sola richiesta:

- `iscritti`: **tutte** le iscrizioni raccolte dai moduli del sito, con la pagina
  di provenienza (l'area riservata le divide da sola fra eventi e altre sezioni).
  Unisce le due fonti come `/api/iscrizioni`: collezione Firestore `iscrizioni`
  (che vince) e foglio Google (lo storico);
- `disiscritti`: gli indirizzi che hanno chiesto di non ricevere piu' nulla.

Accetta anche `azione: "disiscrivi" | "riattiva"` con un `email`, per registrare
a mano una richiesta arrivata per telefono.

Ogni iscritto porta con se' il **consenso** alle comunicazioni promozionali
(`marketing`), letto dalla scheda su Firestore o dalla colonna omonima del
foglio: `true` = l'ha spuntato, `false` = no, `null` = non risulta (elenchi
importati). L'area riservata mette fra i destinatari **solo chi ha `true`**.

**Chi puo' chiamarla:** utente autenticato e attivo che sia amministratore
**oppure** abbia il contrassegno `newsletter` sulla propria scheda in `utenti`.
Non si guarda l'elenco `archivio/newsletterConfig`, che pure esiste e pilota il
menu dell'area riservata: quel documento, per le regole di Firestore, e'
scrivibile da qualunque utente dello staff, quindi chiunque potrebbe
aggiungercisi e concedersi da solo la rubrica e l'invio. La scheda in `utenti`
la scrive invece solo l'amministratore. Quando si salvano gli accessi, l'area
riservata scrive entrambi: per chi usa l'interfaccia non cambia niente.

### Chi spedisce la newsletter: Brevo

Tutte le email dello studio escono gia' da Brevo tramite il relay SMTP (vedi
sopra). La newsletter usa invece l'**API** di Brevo, che e' la strada giusta per
gli invii di massa: un solo colpo per l'intero lotto invece di una connessione
SMTP per ogni destinatario.

Il dominio `nextgenerationbusiness.it` risulta **gia autenticato per Brevo**:
verificando i DNS pubblici il 28/07/2026 c'erano il codice di verifica
(`brevo-code:...`), entrambe le chiavi DKIM (`brevo1._domainkey` e
`brevo2._domainkey` che puntano a `dkim.brevo.com`) e il record DMARC che manda
i rapporti a `rua@dmarc.brevo.com`. **Non serve toccare l'SPF**: Brevo firma con
le proprie chiavi DKIM e usa un proprio percorso di ritorno; le guide che
consigliano di aggiungere un `include:` di Brevo non riguardano questo caso.

Per accendere Brevo bastano **due variabili d'ambiente**:

| Nome | Valore |
|---|---|
| `BREVO_API_KEY` | la chiave creata dal pannello Brevo (Impostazioni → chiavi API) |
| `NEWSLETTER_FROM_EMAIL` | `revilaw@nextgenerationbusiness.it` (mittente della sola newsletter, da verificare in Brevo) |
| `NEWSLETTER_FROM_NAME` | facoltativa; senza di essa vale `SMTP_FROM_NAME` (Revilaw S.p.A.) |
| `NEWSLETTER_REPLY_TO` | facoltativa; senza di essa le risposte vanno al mittente qui sopra |

Le **risposte** alla newsletter arrivano alla casella del mittente, non a quella
personale di chi ha premuto Invia: chi risponde si aspetta di scrivere
all'indirizzo che vede scritto. Quella casella va quindi presidiata da qualcuno.
Con `NEWSLETTER_REPLY_TO` si puo' dirottarle altrove (per esempio a
`info@`), senza cambiare il mittente.

Senza `BREVO_API_KEY` l'invio della newsletter torna sul relay SMTP, che e'
comunque Brevo: cambia solo il modo (una connessione per destinatario invece di
una richiesta per l'intero lotto). Si puo' accendere e spegnere senza toccare il
codice.

**Non toccare `SMTP_FROM_EMAIL`.** Quella e' condivisa con le email di
reimpostazione password (`invia-email.js`) e con le Comunicazioni
(`invia-comunicazione.js` e il cron), che partono da `noreply@`: cambiandola
cambierebbero mittente anche loro. La newsletter ha una variabile sua apposta,
cosi' i due mittenti restano distinti agli occhi di chi riceve e la reputazione
di una lista non si mescola con quella delle email di servizio.

> **Attenzione: la separazione e' solo nel mittente, non nell'infrastruttura.**
> Entrambi i canali passano dallo stesso account Brevo, quindi condividono il
> monte invii del piano e la sorte dell'account. Una sospensione per le metriche
> di una lista fermerebbe anche le email di attivazione password. E' il motivo
> per cui vale la pena tenere le liste pulite (consenso verificato, rimbalzi
> bassi) e valutare un ripiego SMTP per le sole email di servizio.

> **Il piano gratuito non basta**: 300 email al giorno condivise fra newsletter,
> comunicazioni ed email di servizio, e con la dicitura "Sent with Brevo" in
> fondo ai messaggi. Serve almeno lo Starter (nessun limite giornaliero,
> scaglioni da 5.000 invii al mese).

**Cosa cambia rispetto alla casella SMTP.** Con Brevo tutto il lotto parte in
**una sola richiesta** (una "versione" per destinatario, con dentro il suo
collegamento di disiscrizione), quindi i lotti passano da 20 a **200** e l'invio
diventa molto piu' rapido. In piu' la richiesta porta una **chiave di non
ripetizione**: se lo stesso lotto viene rimandato entro mezz'ora (per esempio
dopo un errore di rete), Brevo non lo esegue una seconda volta.

**Due cose da sapere, che non si possono aggirare:**

1. **L'header "Annulla iscrizione" lo mette Brevo.** La documentazione dice che
   Brevo inserisce da se' il `list-unsubscribe` e non accetta header standard
   nostri. Quindi il pulsante che Gmail e Apple Mail mostrano accanto al
   mittente porta alla disiscrizione di Brevo, non alla nostra pagina. Il
   collegamento **dentro** la mail resta il nostro, firmato. Per non avere due
   elenchi che si contraddicono, `/api/newsletter` legge la blocklist di Brevo
   (`GET /v3/smtp/blockedContacts`) e riporta i nomi nuovi nella nostra
   collezione `newsletterDisiscritti`: da quel momento valgono per tutti,
   compreso l'invio.
2. **Brevo risponde per l'intera richiesta, non per singolo destinatario.** O il
   lotto e' accettato o e' rifiutato: non esiste l'elenco di chi non e' passato.
   Rimbalzi, blocchi e reclami si vedono dopo, nel pannello di Brevo. Per questo
   la sezione, quando spedisce con Brevo, scrive "consegnate a Brevo per la
   spedizione" invece di far credere che siano tutte arrivate.

Per una prova a vuoto (Brevo risponde ok senza spedire niente) si puo' passare
`sandbox: true` nel corpo della richiesta.

### `POST /api/invia-newsletter` — invio a lotti

L'area riservata manda l'HTML gia pronto (lo costruisce
`area-riservata/newsletter-format.js`) con dentro il segnaposto
`{{DISISCRIVITI}}`. La funzione, **per ogni destinatario**:

- sostituisce il segnaposto con il suo collegamento personale firmato;
- sostituisce le variabili `{nome} {cognome} {nome_completo} {azienda} {email}`;
- invia **una mail sola a quella persona** (niente BCC: il collegamento di
  disiscrizione e' personale e nessuno deve vedere gli indirizzi degli altri);
- aggiunge gli header `List-Unsubscribe` e `List-Unsubscribe-Post`, cioe' il
  pulsante "Annulla iscrizione" che Gmail e Apple Mail mostrano accanto al
  mittente.

Chi risulta disiscritto viene **saltato qui**, sul server: e' il controllo che
vale, anche se l'elenco a video fosse vecchio di qualche minuto. Una newsletter
senza `{{DISISCRIVITI}}` viene **rifiutata**.

Massimo **200 destinatari per chiamata con Brevo**, **20** con la casella SMTP:
il numero lo dichiara `/api/newsletter` e l'area riservata si regola da sola.
L'elenco viene spezzato e le chiamate si susseguono mostrando l'avanzamento, con
una pausa fra un lotto e l'altro (il servizio impone almeno 2 secondi, e non
piu' di 80 lotti l'ora per utente).
In `vercel.json` la funzione ha `maxDuration: 60`, e il ciclo si ferma da solo
dopo **45 secondi**: gli indirizzi non ancora trattati tornano indietro in
`rimasti` e l'area riservata li rimette in coda. Cosi' non capita mai che la
funzione venga troncata lasciando chi invia senza sapere quante mail sono
partite davvero.

Se l'invio si interrompe (rete, sessione scaduta, server di posta), l'area
riservata registra **le impronte** degli indirizzi gia serviti - non gli
indirizzi - e alla riapertura propone di **riprendere da dove si era fermato**,
saltando chi ha gia ricevuto.

> **Limite del piano Brevo.** Il monte invii mensile e' condiviso fra newsletter,
> comunicazioni ed email di servizio. Sul piano gratuito ci sono anche 300 invii
> al giorno, non cumulabili: per una newsletter serve almeno lo Starter.

### `POST /api/andamento-newsletter` — come e andato un invio

Restituisce, per una o piu **etichette di giro**, quante mail Brevo ha accettato,
consegnate, aperte e cliccate. L'area riservata la mostra dentro la finestra
della singola newsletter, con un grafico a torta.

L'etichetta di giro (`invio` nel corpo di `/api/invia-newsletter`) la genera
l'area riservata, e' uguale per tutti i lotti dello stesso invio ed e diversa fra
un invio e l'altro. Serve perche l'etichetta di **campagna** non basta: la
condividono i due invii di una ripresa dopo un'interruzione, e ci finiscono
dentro anche le prove, che sono mail vere.

Corpo: `{ idToken, blocchi: [{ chiave, per, dal }], forza }`, massimo 8 blocchi.
Risposta: un blocco per etichetta, ciascuno con uno `stato` dichiarato
(`ok`, `attesa`, `fuori-finestra`, `non-disponibile`, `errore`) e i numeri
**solo** nello stato `ok`.

Tre scelte da non disfare per sbaglio:

- si interroga l'**aggregato** (`/smtp/statistics/aggregatedReport`) e non
  l'elenco degli eventi. L'elenco degli eventi restituisce una riga per evento
  **con dentro l'indirizzo del destinatario**: sarebbe l'elenco di chi apre le
  nostre mail, e questo servizio non deve nemmeno maneggiarlo. La risposta di
  questo endpoint contiene solo numeri, stati e date;
- **cache obbligatoria**, non un'ottimizzazione: gli endpoint `/v3/smtp/...` di
  Brevo hanno una quota di **300 chiamate all'ora**, condivisa con la lettura
  della blocklist che la sezione fa gia per conto suo. Qui: memoria dell'istanza
  piu collezione Firestore `newsletterEsiti` (su Vercel le istanze sono piu
  d'una), scadenza 10 minuti, massimo 3 letture vere per richiesta, 60 secondi di
  silenzio su un'etichetta dopo un errore;
- **zero richieste non e zero consegnate**: significa che Brevo non ha ancora
  niente su quell'etichetta, ed esce come `attesa`. Se Brevo non risponde si
  serve l'ultima lettura riuscita dichiarando che e vecchia.

Brevo guarda indietro **90 giorni**: oltre quelli il blocco esce
`fuori-finestra`. Le aperture si contano con un'immagine invisibile, quindi non
vanno mai presentate come "persone che hanno letto": i filtri antispam le
gonfiano e le immagini bloccate le nascondono. Il numero affidabile e il **clic**.

### `POST|GET /api/disiscrizione` — endpoint pubblico

Registra la disiscrizione. Il collegamento in fondo a ogni newsletter e'
personale e **firmato**: `?e=<email>&t=<firma>`, dove la firma e' un HMAC
dell'indirizzo. Senza quella firma nessuno puo' disiscrivere gli altri, e nessuno
puo' provare indirizzi a caso per scoprire chi e' iscritto (a firma sbagliata la
risposta e' sempre la stessa).

- **POST** dalla pagina pubblica `newsletter/disiscriviti.html`, che chiede
  conferma con un pulsante;
- **POST** `List-Unsubscribe=One-Click` dal client di posta (RFC 8058);
- **GET**: non disiscrive nessuno, rimanda alla pagina di conferma. Serve perche'
  i controlli antivirus dei client aprono i collegamenti da soli.

Gli indirizzi finiscono nella collezione `newsletterDisiscritti`, scritta solo
con l'account di servizio: dal browser non ci arriva nessuno.

L'endpoint **legge prima di scrivere** e, se lo stato e' gia quello richiesto,
non scrive nulla. Serve a proteggere la quota: il collegamento non scade e ce
l'ha ogni destinatario, quindi senza quel controllo bastava riaprirlo a
ripetizione per consumare le scritture giornaliere del database e bloccare
l'intera area riservata.

### Variabile facoltativa: `NEWSLETTER_SECRET`

| Nome | Valore |
|---|---|
| `NEWSLETTER_SECRET` | una stringa segreta a piacere (lunga e casuale) |

**Non e' obbligatoria.** Se manca, il segreto della firma si ricava dalla chiave
privata dentro `FIREBASE_SERVICE_ACCOUNT`, che e' gia segreta e gia configurata:
la disiscrizione funziona subito, senza toccare niente.

> Attenzione: cambiare `NEWSLETTER_SECRET` (o rigenerare la chiave di servizio, se
> il segreto non e' impostato) **invalida i collegamenti gia spediti**. Chi ci
> clicca vede un messaggio con l'indirizzo a cui scrivere, quindi non si perde la
> richiesta, ma va gestita a mano dalla sezione Newsletter.

Se il progetto Vercel non si chiama `revilaw-email`, imposta anche
`NEWSLETTER_API_BASE` con l'indirizzo del servizio (serve a costruire il
collegamento "un clic" negli header della mail).


## Invii PEC: il ritmo, e cosa succede quando il gestore blocca

Fra una PEC e la successiva il servizio aspetta un secondo e mezzo
(`PEC_PAUSA_MS`). Non e' prudenza generica: i gestori misurano il ritmo con
cui arriva la posta, e una raffica da un indirizzo che non conoscono e' il
profilo che fa scattare i filtri antiabuso. La pausa non si nota — la
funzione ha comunque i suoi 60 secondi e l'area riservata richiama finche'
l'elenco non e' finito — e cambia il profilo dell'invio.

Quando il rifiuto riguarda **noi** e non il destinatario, il lotto si ferma
subito. La distinzione la fa `CANALI.fermaTutto()` e conta piu' di quanto
sembri:

| Risposta del server | Cosa vuol dire | Cosa fa il servizio |
|---|---|---|
| `550 User unknown` | quell'indirizzo non esiste | segna la scheda in errore e **va avanti** |
| `554 5.7.1 Indirizzo IP bloccato` | il gestore rifiuta la nostra connessione | **ferma il lotto** |
| `421`, `450`, `451`, `452` | rifiuto temporaneo o servizio non disponibile | **ferma il lotto** |
| credenziali rifiutate (`EAUTH`) | la casella non ci fa entrare | **ferma il lotto** |

Insistere dopo un blocco fa due danni: allunga il blocco stesso, e marca
"errore" decine di aziende che non hanno alcun problema, costringendo poi a
ripulirle a mano. Fermandosi, le schede mai tentate restano `da-invitare` e
l'invio riprende da li' quando si preme di nuovo Invia.

> **Il blocco dell'IP non si risolve dal codice.** Le funzioni girano su
> indirizzi condivisi e rotanti: la pausa riduce la probabilita' di finire
> nel mirino, non la elimina. La soluzione stabile e' spedire da un IP fisso
> italiano — un piccolo server dedicato che faccia da ponte verso
> `smtps.pec.aruba.it` — oppure autorizzare quell'IP presso il gestore.

## Il modello per il caricamento delle aziende

L'area riservata genera un `.xlsx` da compilare (pulsante *Scarica il
modello*), lo rilegge, e lo converte in CSV prima di consegnarlo al servizio:
il lettore dei fogli sta nel browser, non qui, cosi' il servizio non si porta
dietro un lettore di zip dentro una funzione che ha sessanta secondi.

Obbligatorie **Denominazione** e **PEC**; le righe che ne sono prive vengono
scartate e **contate a parte** (`senzaDenominazione`, `senzaRecapito`), perche'
un elenco che entra a meta' senza spiegazioni e' peggio di uno che non entra.
L'asterisco che nel modello segna le colonne obbligatorie viene ignorato in
lettura: toglierlo o lasciarlo non cambia nulla.


## Codici di invito: il filo fra le due tabelle

Ogni azienda invitata riceve, dentro il messaggio, un codice di **5 caratteri**
riservato a lei. Lo scrive nel modulo di registrazione, e da quel momento le
due tabelle si parlano: nell'elenco delle aziende si vede chi si e' registrato,
nell'elenco degli iscritti si vede chi e' arrivato perche' era stato scelto.
Senza il codice le due liste restano estranee, e l'unico modo di incrociarle e'
confrontare i nomi a occhio, che con "Alfa S.r.l." e "ALFA SRL" non funziona.

**L'alfabeto e' quello di Crockford**, senza `I`, `L`, `O`, `U`: le prime tre
si confondono con `1` e `0` quando il codice viene letto al telefono o
ricopiato da una stampa. In lettura `I` e `L` diventano `1` e `O` diventa `0`,
cosi' chi trascrive male viene comunque riconosciuto invece di ricevere un
"codice non valido" che non sa come correggere.

L'unicita' non e' affidata alla fortuna: **il codice e' l'identificativo del
documento** in `codiciInvito`, e `create()` fallisce se esiste gia' (su 20.000
sorteggi di prova gli scontri sono stati 5, quindi il caso si presenta davvero).

Regole che valgono la pena di essere ricordate:

- **Il codice nasce PRIMA che il messaggio parta.** Se partisse la mail e poi
  fallisse la scrittura, l'azienda avrebbe in mano un codice che qui non
  risulta, e al momento di registrarsi si sentirebbe dire di no.
- **Un secondo invito ripete lo stesso codice**, non ne crea un altro:
  altrimenti quello ricevuto per primo smetterebbe di valere in silenzio.
- **Il codice non si consuma.** Un'azienda selezionata puo' mandare due
  persone; si contano gli usi e si ricorda il primo.
- **Nel modulo pubblico e' facoltativo**, perche' la pagina resta aperta a
  tutti. Ma se viene scritto dev'essere uno di quelli spediti davvero: un
  codice inventato che passasse renderebbe "azienda selezionata" un'etichetta
  che chiunque puo' mettersi da solo.
- **Un codice di un altro evento non vale.** Il modulo pubblico conosce
  l'evento solo per nome, quindi la pagina di iscrizione viaggia insieme al
  codice e si confronta con quella. I codici spediti prima di questa regola
  continuano a valere.
- La verifica dal modulo passa per l'azione `verifica-codice`, che ricade
  **sotto il limite per indirizzo IP** come tutti i moduli aperti: e' cio' che
  rende impraticabile provare codici a tappeto.

Quando qualcuno si registra con un codice, la scheda dell'iscritto porta
`invitoCodice`, `invitoAzienda` e `selezionata`, e la scheda dell'azienda passa
a `iscritta` con l'elenco di chi si e' registrato. Se questa parte non riesce,
**l'iscrizione resta valida**: e' informazione di servizio, non una condizione.
