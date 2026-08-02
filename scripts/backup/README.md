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
| 3 | `firestore-data.json` — tutti i dati, sottocollezioni comprese |
| 3-bis | `auth-users.json` + parametri di cifratura, regole di sicurezza, indici |
| 4 | Verifica che sito e API rispondano; `dns.txt` con i record del dominio |
| 5 | Stato del repository, TODO/FIXME, dipendenze del servizio email |

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

### 2. Copia su Google Drive (facoltativo ma consigliato)

Senza questa parte il backup funziona lo stesso: le copie restano allegate
all'esecuzione (artifact, 90 giorni) invece di finire in `Backup-NGB`.

In ogni caso serve il segreto:

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

**Strada B — scrivere per conto dell'utente** *(se il Drive condiviso non c'è)*

Si lascia la cartella dov'è e il backup scrive come se fossi tu. Servono tre
segreti, ottenuti una volta sola da Google Cloud Console → *API e servizi* →
*Credenziali* → *ID client OAuth* (tipo: applicazione desktop), poi uno scambio
del codice di consenso con l'ambito `https://www.googleapis.com/auth/drive`:

- `GDRIVE_CLIENT_ID`
- `GDRIVE_CLIENT_SECRET`
- `GDRIVE_REFRESH_TOKEN`

I file risultano tuoi e occupano il tuo spazio. Da tenere presente: il token di
aggiornamento si invalida se cambi password, se revochi l'accesso all'app, o se
l'app resta in stato *Test* sulla schermata di consenso (in quel caso scade
dopo 7 giorni — va portata in *Produzione*).

Il codice sceglie da solo: se trova le tre variabili della strada B le usa,
altrimenti va di service account. Il report scrive quale strada ha preso, e se
il caricamento fallisce per quota lo dice in chiaro invece di lasciare
l'errore grezzo di Google.

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
node import-firestore.cjs <chiave-service-account.json> firestore-data.json
```

Così fa solo una prova a vuoto e dice cosa scriverebbe. Per scrivere davvero si
aggiunge `--conferma`. Gli utenti e le password si reimportano a parte, con il
comando che sta in `auth-parametri-hash.txt`.
