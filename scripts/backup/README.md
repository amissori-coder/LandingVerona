# Backup notturno

Sostituisce l'attività pianificata di Windows che girava alle 03:00 sul PC e
che si è fermata quando il PC si è rotto (ultimo salvataggio riuscito:
30/07/2026). Girando su GitHub Actions non dipende più da nessun computer.

Workflow: [`.github/workflows/backup-notturno.yml`](../../.github/workflows/backup-notturno.yml)
Orario: **01:17 UTC**, cioè le 03:17 in Italia con l'ora legale e le 02:17 con
l'ora solare (GitHub accetta solo orari UTC).

Il minuto dispari è voluto: GitHub non garantisce l'orario delle esecuzioni
pianificate, le accoda e le fa partire quando ha capacità. Gli slot all'ora
esatta sono i più affollati e la primissima esecuzione con `0 1 * * *` non è
mai partita. Se anche `:17` dovesse risultare inaffidabile, l'esecuzione
manuale resta sempre disponibile e non dipende dalla coda.

## Cosa salva

| Passo | Contenuto |
|---|---|
| 1 | `code-snapshot.zip` — il sito al commit corrente |
| 1 | `repo-full.bundle` — storia git completa, **solo la domenica** (pesa centinaia di MB) |
| 1-bis | I video allegati alle release: inventario sempre, copia su Drive incrementale |
| 2 | Verifica dello zip e `node --check` sui file critici |
| 3 | `firestore-data.jsonl.gz` — tutti i dati, sottocollezioni comprese: una riga per documento, compressi |
| 3-bis | `auth-users.json` + parametri di cifratura, regole di sicurezza, indici |
| 4 | Verifica che sito e API rispondano; `dns.txt` con i record del dominio |
| 5 | Stato del repository, TODO/FIXME, dipendenze del servizio email |

### Come si salvano i dati (e perché dal 2 settembre al 23 novembre 2026 non si salvavano)

Il passo 3 legge **tutti i documenti del database, a qualunque profondità**:
una interrogazione per ogni collezione di primo livello che chiede "tutto
quello che sta sotto, a pagine" (`lib/firestore.cjs`). Costa una lettura per
documento. I documenti si scrivono man mano in `firestore-data.jsonl.gz`, una
riga ciascuno: il database non sta mai tutto in memoria e non c'è un limite
alla sua grandezza. Ogni collezione lascia una riga nel report (quanti
documenti, quanti MB, quanti secondi), poi il file viene riletto per intero
per controllo. Ci sono dentro anche le circolarizzazioni via PEC: lettere,
PDF a pezzi, bozze, registro delle operazioni.

Prima si faceva diversamente: letta una collezione, per **ogni** documento si
chiedeva a Firestore se avesse sottocollezioni, una chiamata alla volta. Con
2.500 documenti erano sette minuti; cresciuto il database (iscrizioni, inviti
alle aziende, invii) l'esportazione ha superato le due ore concesse al lavoro,
e GitHub la interrompeva. **Un lavoro interrotto per tempo scaduto risulta
"annullato", non "fallito": non parte nessuna mail.** L'ultimo backup completo
dei dati è stato quello del 1° settembre 2026; fino al 23 novembre ogni notte
si è salvato solo il codice. Nessuno se n'è accorto perché niente lo diceva.

Due cose perché non succeda più:

- la lettura nuova non dipende dal numero di documenti in quel modo: decine di
  migliaia di documenti sono minuti;
- **il guardiano** (`esegui-backup.cjs`): se dopo 100 minuti il backup non ha
  finito, scrive il report con quello che c'è e chiude con un **errore**, che
  GitHub segnala per mail. Il tempo del lavoro nel workflow (120 minuti) deve
  restare più lungo di quello del guardiano.

Le prove dell'esportazione e del ripristino, senza rete e senza chiavi:

```
node scripts/backup/prove/firestore.prove.cjs
```

**Che cosa NON c'è nel backup dei dati**: i messaggi delle caselle PEC
(ricevute e risposte restano nella casella del gestore; sul portale c'è solo
l'elenco), e le variabili d'ambiente di Vercel e i segreti di GitHub, che per
loro natura non si esportano: vanno rimessi a mano (i nomi sono nei README).

Ogni cartella contiene `RIPRISTINO.txt` (istruzioni passo-passo),
`import-firestore.cjs` (lo strumento che rimette dentro i dati) e `report.txt`.

## Cosa serve per attivarlo

### 1. `FIREBASE_SERVICE_ACCOUNT` (obbligatorio)

La chiave del vecchio service account stava solo sul PC rotto: **va rigenerata**.

1. Console Firebase → *Impostazioni progetto* → *Account di servizio*
2. *Genera nuova chiave privata* → scarica il JSON
3. GitHub → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*
   - Nome: `FIREBASE_SERVICE_ACCOUNT`
   - Valore: tutto il contenuto del file JSON (va bene anche in base64)
4. Disattiva la vecchia chiave da *IAM e amministrazione* → *Account di servizio*:
   finché resta attiva, chiunque abbia il disco del PC rotto può usarla.

L'account predefinito `firebase-adminsdk-*` ha già i permessi che servono. Se
regole o parametri di cifratura risultassero vuoti nel report, aggiungi i ruoli
*Firebase Authentication Admin*, *Firebase Rules Viewer* e *Cloud Datastore User*.

### 2. Copia su Google Drive (obbligatoria)

`Backup-NGB` su Drive è **l'unico posto** dove il backup viene conservato. Senza
questa parte, o se una notte la copia su Drive non riesce, il backup risulta in
ERRORE e GitHub manda la mail.

> **Il backup non allega niente all'esecuzione, e non deve farlo mai.** Questo
> repository è pubblico, e gli allegati (*artifact*) delle esecuzioni di un
> repository pubblico li può scaricare chiunque abbia un account GitHub. La
> cartella del backup contiene i dati e gli accessi: non va allegata nemmeno in
> parte. Il report si legge nel riepilogo dell'esecuzione. Se dovessero esserci
> allegati `backup-...`, li cancella *Actions* → *Pulizia degli allegati delle
> esecuzioni* → *Run workflow* (scrivendo `CANCELLA` nel campo di conferma).

Serve il segreto:

- `GDRIVE_FOLDER_ID` = `1mDoyhjZUX_3OogUu9LX-cJA7a9IhV0c-`

Poi c'è una scelta da fare, e non è una formalità. **`Backup-NGB` sta dentro
"Il mio Drive" di a.missori@emvas.tax, non in un Drive condiviso.** Un service
account non possiede spazio su Drive: dentro "Il mio Drive" i suoi caricamenti
falliscono con `storageQuotaExceeded` qualunque permesso gli si dia. Quindi:

**Strada A — spostare la cartella su un Drive condiviso** *(consigliata)*

Crea (o usa) un Drive condiviso, sposta dentro `Backup-NGB`, aggiungi
l'indirizzo `client_email` del service account come *Gestore dei contenuti*.
Poi basta `GDRIVE_SERVICE_ACCOUNT` (o si riusa la chiave di Firebase). I file
appartengono al Drive condiviso e usano il suo spazio; non c'è niente che
scade. L'id della cartella non cambia spostandola, quindi `GDRIVE_FOLDER_ID`
resta valido.

**Strada B — scrivere per conto dell'utente** *(quella in uso)*

La cartella resta dov'è e il backup scrive come se fosse l'utente. Servono
`GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET` e `GDRIVE_REFRESH_TOKEN`, ottenuti
una volta sola. Procedura effettivamente seguita, tutta dal browser:

1. Abilitare l'API Drive:
   `console.cloud.google.com/apis/library/drive.googleapis.com?project=revilaw-incarichi`
2. Schermata di consenso (`console.cloud.google.com/auth/overview`) → *Inizia* →
   nome app, email di assistenza, e alla voce **Pubblico** scegliere **Interno**.
3. *Client* → **Crea client OAuth** → tipo **Applicazione web**, con URI di
   reindirizzamento autorizzato `https://developers.google.com/oauthplayground`.
4. Su `developers.google.com/oauthplayground`: ingranaggio ⚙ → *Use your own
   OAuth credentials* → incollare ID e secret. Nel campo *Input your own scopes*
   mettere `https://www.googleapis.com/auth/drive` → *Authorize APIs* →
   consenso → *Exchange authorization code for tokens* → copiare il
   **Refresh token** (comincia con `1//`).

**"Interno" non è un dettaglio.** Con *Esterno* l'app resta in stato *Test* e il
refresh token scade dopo 7 giorni: il backup si fermerebbe da solo dopo una
settimana. Portarla in *Produzione* non è una scorciatoia, perché l'ambito Drive
è "restricted" e richiederebbe una verifica di sicurezza di Google. Con
*Interno* — possibile perché l'account è Workspace — niente verifica e niente
scadenza.

Il token si invalida comunque se si cambia password o si revoca l'accesso
all'app dalle autorizzazioni dell'account Google.

**Copiare ID client e secret con il pulsante di copia della console**, mai
ricopiandoli a mano o da uno screenshot: sono lunghi e contengono caratteri che
si confondono (`l` con `1`, `O` con `0`). Un carattere sbagliato produce
`invalid_client`, che non dice quale dei due valori sia storto.

---

Il codice sceglie da solo: se trova le tre variabili della strada B le usa,
altrimenti va di service account. Il report annuncia quale strada prende e con
quale client **prima** di autenticarsi, così un errore di credenziali arriva
già con il contesto. Se il caricamento fallisce per quota, lo dice in chiaro
invece di lasciare l'errore grezzo di Google.

## Provarlo subito

*Actions* → *Backup notturno* → *Run workflow*. Il report completo compare nel
riepilogo dell'esecuzione, senza bisogno di scaricare niente.

> **Le esecuzioni pianificate partono solo dal ramo predefinito.** Finché questo
> file sta su un ramo di lavoro, il backup va lanciato a mano. Dopo l'unione su
> `main` parte da solo ogni notte.

## Quando qualcosa non va

Il report distingue due livelli:

- **ERRORE** → la copia è incompleta. L'esecuzione risulta fallita e GitHub
  manda una mail. Era esattamente quello che mancava prima: il vecchio backup
  si è fermato il 30 luglio e nessuno se n'è accorto per due giorni.
- **AVVISO** → la copia è a posto, ma c'è qualcosa da guardare (un endpoint che
  non risponde, video rimandati alla notte dopo).

## Rimettere i dati dentro Firestore

```
npm install firebase-admin
node import-firestore.cjs <chiave-service-account.json> firestore-data.jsonl.gz
```

Così fa solo una prova a vuoto e dice cosa scriverebbe. Per scrivere davvero si
aggiunge `--conferma`. Gli utenti e le password si reimportano a parte, con il
comando che sta in `auth-parametri-hash.txt`.

## Prova di ripristino

Un backup che non è mai stato ripristinato è una speranza, non un backup. La
prova lo ripristina **davvero**, ma in un progetto Firebase di appoggio che non
c'entra niente con quello vero:

1. scarica da `Backup-NGB` l'ultimo `firestore-data.jsonl.gz` e lo controlla da
   cima a fondo;
2. controlla che il progetto di appoggio sia vuoto;
3. ci ripristina i dati con `import-firestore.cjs`, lo stesso strumento che si
   userebbe il giorno del guaio;
4. rilegge tutto quello che ha scritto;
5. lo confronta con il backup, documento per documento e campo per campo;
6. ripulisce il progetto di appoggio.

Workflow: [`.github/workflows/prova-ripristino.yml`](../../.github/workflows/prova-ripristino.yml).
Parte da sola il 2 di ogni mese e ogni volta che cambia lo strumento di
ripristino; a mano da *Actions* → *Prova di ripristino* → *Run workflow*. L'esito
sta nel riepilogo dell'esecuzione: una tabella con, per ogni collezione, quanti
documenti nel backup, quanti ripristinati e quanti identici. Se anche un solo
documento non torna identico l'esecuzione fallisce e GitHub manda la mail.

**Campione o tutto.** Di base ripristina un campione: i primi 200 documenti di
ogni collezione di primo livello, sottocollezioni comprese (circa novemila
scritture, sta nel piano gratuito di Firebase). Scegliendo *tutto* ripristina
l'intero backup: sono centinaia di migliaia di scritture, serve il piano a
consumo sul progetto di appoggio e ci vuole un paio d'ore.

### Preparare il progetto di appoggio (una volta sola)

1. [console.firebase.google.com](https://console.firebase.google.com) → *Aggiungi
   progetto* → un nome che non si confonda con quello vero, per esempio
   `revilaw-ripristino-prova`. Google Analytics non serve.
2. Nel progetto nuovo: *Firestore Database* → *Crea database* → modalità
   **produzione** (regole chiuse), una sede europea. Va lasciato **vuoto**.
3. ⚙ → *Impostazioni progetto* → *Account di servizio* → *Genera nuova chiave
   privata*: scarica un file JSON.
4. Su GitHub: *Settings* → *Secrets and variables* → *Actions* → *New repository
   secret*, nome `FIREBASE_SERVICE_ACCOUNT_APPOGGIO`, valore tutto il contenuto
   del file JSON. Poi il file si può cancellare dal computer.

Finché il segreto manca, la prova si salta da sola senza dare errore.

### Perché non può toccare il progetto vero

- Il lavoro non riceve la chiave del progetto vero (`FIREBASE_SERVICE_ACCOUNT`):
  ha solo quella di appoggio.
- Si rifiuta di partire se la chiave di appoggio è del progetto vero, o dello
  stesso progetto da cui viene il backup.
- Scrive e cancella solo in un progetto trovato **vuoto**, oppure che porta il
  contrassegno lasciato da una sua prova precedente (il documento
  `_provaRipristino/stato`). Il progetto vero non è vuoto e quel contrassegno
  non ce l'ha: anche con la chiave sbagliata si fermerebbe lì, senza scrivere.

### Cosa prova e cosa no

Prova che il file del backup è leggibile e completo, che lo strumento di
ripristino funziona, e che i dati tornano identici: testi, numeri, date con
l'orario intero, allegati PDF, sottocollezioni. **Non** prova il ripristino
degli account (`auth-users.json`), delle regole e degli indici, né quello del
sito: quelli seguono `RIPRISTINO.txt`.

Il registro dell'esecuzione è pubblico come il repository: per questo la prova
non scrive mai il contenuto né il percorso di un documento, solo nomi di
collezione, conteggi e impronte.

Prove senza rete: `node scripts/backup/prove/prova-ripristino.prove.cjs`.
