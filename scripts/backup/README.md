# Backup notturno

Sostituisce l'attività pianificata di Windows che girava alle 03:00 sul PC e
che si è fermata quando il PC si è rotto (ultimo salvataggio riuscito:
30/07/2026). Girando su GitHub Actions non dipende più da nessun computer.

Workflow: [`.github/workflows/backup-notturno.yml`](../../.github/workflows/backup-notturno.yml)
Orario: **01:00 UTC**, cioè le 03:00 in Italia con l'ora legale e le 02:00 con
l'ora solare (GitHub accetta solo orari UTC).

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

Senza questi, il backup funziona lo stesso ma le copie restano allegate
all'esecuzione (artifact, 90 giorni) invece di finire in `Backup-NGB`.

- `GDRIVE_FOLDER_ID` — l'id della cartella Backup-NGB:
  `1mDoyhjZUX_3OogUu9LX-cJA7a9IhV0c-`
- `GDRIVE_SERVICE_ACCOUNT` — una chiave con accesso a Drive. Se non la imposti,
  si riusa quella di Firebase.

In entrambi i casi la cartella `Backup-NGB` va **condivisa** con l'indirizzo
`client_email` del service account, con permesso di *Gestore dei contenuti*.
La cartella sta su un Drive condiviso: è la sistemazione giusta, perché un
service account non ha spazio proprio e su "Il mio Drive" gli upload
fallirebbero per quota.

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
