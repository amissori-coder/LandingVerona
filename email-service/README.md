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

## 1. Crea l'account Vercel (gratuito)

1. Vai su https://vercel.com e registrati con GitHub (l'account `amissori-coder`).
   Il piano **Hobby** è gratuito e non richiede carta.

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

Nota: sul piano Hobby il cron gira **una volta al giorno** alle **06:00 UTC**
(≈ 08:00 in ora legale, 07:00 in ora solare), a orario approssimativo. Una mail
programmata parte quindi al primo mattino utile **a partire dalla** data scelta,
non all'ora esatta impostata — perfetto per invii settimanali/mensili/
trimestrali/annuali. Il `vercel.json` alza il timeout della funzione cron a
`maxDuration: 60` (tetto Hobby) per gestire più invii nello stesso mattino.

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
NON e una funzione a parte, perche il piano Hobby di Vercel ammette al massimo
**12 funzioni per deploy** e una tredicesima fa fallire l'intera pubblicazione
(il servizio resta alla versione precedente senza che nulla lo dica). Flusso
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

- **Invito massivo** (`/api/presenze`, `azione: "invita-b2b"`; amministratore,
  equity e founding partner): riceve `destinatari` (fino a 50 per chiamata,
  `{id, doc}`; l'area riservata manda i lotti in sequenza) e la mail gia
  composta (formato NGB) con i segnaposti `{{NOME}}` e `{{B2B}}`, sostituiti
  QUI per destinatario con nome e collegamento personale firmato verso
  `/incontri_b2b/`; il tratto fra `{{SE_TEMI}}` e `{{/SE_TEMI}}` resta solo per
  chi ha gia espresso preferenze, con `{{TEMI}}` sostituito dall'elenco (cosi la
  mail le riporta e invita a confermarle o modificarle). Dal menu della riga si
  puo invitare anche UNA SOLA persona. Una mail per destinatario; chi ha gia
  ricevuto l'invito
  (`b2bInvito` sulla scheda) viene saltato salvo `forza: true`; i doppioni di
  indirizzo partono una volta sola. `maxDuration` 60s in vercel.json.
- **Modulo dei temi** (`/api/iscrizione-nuova`, azioni `b2b-leggi` e
  `b2b-salva`, pubbliche con la stessa firma della scheda): le preferenze gia
  espresse tornano come caselle spuntate, comprese le etichette storiche del
  form del sito (alias in `ALIAS_B2B`); le voci non riconducibili ai nove temi
  non si cancellano al salvataggio. L'iscritto sceglie
  i temi (viaggiano solo gli INDICI: le etichette le decide il servizio,
  costante `TEMI_B2B`) e racconta il progetto. Le scelte finiscono sulla sua
  scheda negli stessi campi del modulo di Napoli (`interessi`, `incontro`),
  quindi nelle colonne aggiuntive "Interessi" e "Incontro B2B"; la nota nella
  colonna "Nota B2B". L'area riservata le raccoglie anche nel riepilogo per
  argomento, con le persone interessate per tema.

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
