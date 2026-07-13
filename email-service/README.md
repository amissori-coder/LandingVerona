# Servizio email dell'Area riservata

Questa piccola funzione invia le email di impostazione/reimpostazione password
dell'area riservata **dal server di posta dello studio (Aruba)**, con:

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
| `SMTP_HOST` | `smtps.aruba.it` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `noreply@nextgenerationbusiness.it` |
| `SMTP_PASS` | la **password** della casella `noreply@nextgenerationbusiness.it` |
| `SMTP_FROM_NAME` | `Revilaw S.p.A.` |
| `SMTP_FROM_EMAIL` | `noreply@nextgenerationbusiness.it` |
| `APP_BASE_URL` | `https://nextgenerationbusiness.it` |
| `ALLOWED_ORIGIN` | `https://nextgenerationbusiness.it` |

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
- Invia l'email via Aruba SMTP (DKIM del dominio → niente spam).
- La pagina `reimposta.html` fa impostare la nuova password all'utente.

Se `RV_EMAIL_SERVICE_URL` non è configurato, l'app continua a usare l'invio
standard (mittente firebaseapp.com): niente si rompe durante la transizione.

---

## Comunicazioni (mail composte nell'area riservata)

Oltre a `invia-email`, il progetto include due funzioni per la sezione
**Comunicazioni**:

- `POST /api/invia-comunicazione` — invia una mail composta dall'utente.
  Verifica l'**ID token Firebase** del mittente (solo utenti abilitati possono
  inviare: niente relay aperto), poi invia via Aruba SMTP (più destinatari → BCC).
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
