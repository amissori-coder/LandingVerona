# Badge e agende B2B, Napoli 2 ottobre 2026

Tre pezzi che lavorano insieme:

| Dove | Cosa fa |
| --- | --- |
| `badge-napoli/prepara.js` | assegna i codici personali, produce i badge stampabili con QR e le agende |
| `badge-napoli/pubblica.js` | manda le agende su Firestore |
| `n26/index.html` | la pagina che l'ospite apre inquadrando il QR |

Tutto gira in locale tranne la pagina, che è un file statico sul sito.

**Nessuna funzione nuova sul servizio.** `email-service` è fermo a dodici
funzioni, che è il tetto del piano Hobby: la tredicesima blocca il deploy. La
pagina legge Firestore direttamente dal browser con l'SDK web, come fa già
l'area riservata, e la scrittura la fa questo script dal computer con l'account
di servizio. Il conteggio delle funzioni non si muove.

---

## La prima volta, tre cose da fare una volta sola

### 1. Installare

```bash
cd badge-napoli && npm install
```

### 2. Le regole di Firestore

Da incollare **a mano** nella console di Firebase, in Firestore Database →
Regole, dentro `match /databases/{database}/documents { ... }`, accanto alle
regole che ci sono già:

```
match /agendaNapoli/{codice} {
  // Chi ha il codice legge la sua scheda e basta.
  // "get" senza "list" e' il punto centrale: con list consentito
  // chiunque potrebbe scaricare l'elenco completo degli ospiti
  // senza conoscere nemmeno un codice.
  allow get: if true;
  allow list: if false;

  // Dal browser non si scrive mai. pubblica.js usa l'account di
  // servizio, che passa sopra le regole per progetto: questa riga
  // non gli impedisce nulla, impedisce a un estraneo di riscrivere
  // le agende dalla pagina.
  allow write: if false;
}
```

Senza queste regole la pagina non legge niente e mostra "Connessione assente".

### 3. Le credenziali per pubblicare

Una delle due, a scelta:

- la variabile d'ambiente `FIREBASE_SERVICE_ACCOUNT`, con lo stesso contenuto
  già usato dal servizio email (JSON o base64);
- un file `serviceAccount.json` in questa cartella.

Il file è escluso dal repo. È una chiave: non va né pubblicata né mandata per
email.

---

## Il giro completo

```bash
cp partecipanti.esempio.json partecipanti.json
```

Dentro `partecipanti.json` vanno i dati veri. Si può anche partire da un CSV
esportato dal foglio Google:

```bash
node prepara.js iscritti.csv
```

Le colonne riconosciute sono `nome`, `cognome`, `email`, `azienda`, `ruolo`,
`profilo`, `tavolo`. Gli appuntamenti si aggiungono dopo, passando al JSON.

```bash
node prepara.js partecipanti.json
```

In `out/` compaiono:

- **`badge.html`** da aprire nel browser e stampare;
- **`agende.json`** quello che verrà pubblicato;
- **`codici.csv`** nome, email, codice e link, per la mail agli ospiti;
- **`codici.json`** il registro dei codici. **Non cancellarlo mai.**

Poi la prova a vuoto e la pubblicazione:

```bash
node pubblica.js --secco
```

```bash
node pubblica.js
```

### Perché `codici.json` non va cancellato

Il codice è stampato sul badge. Se il registro sparisce, il lancio successivo
genera codici nuovi e **tutti i badge già stampati puntano al vuoto**. Con il
registro al suo posto lo script si può rilanciare quante volte serve: chi c'è
già si tiene il suo codice, solo le persone nuove ne ricevono uno.

Questo permette di lavorare in due tempi: badge stampati a fine settembre con
le agende ancora vuote, appuntamenti aggiunti dopo con un secondo lancio. I
badge restano validi.

---

## Stampa

Il file `badge.html` è impaginato in millimetri: otto badge per foglio A4,
96 × 68 mm ciascuno, con la traccia tratteggiata per il taglio.

Quattro regole, e sono tutte e quattro il motivo per cui i QR non funzionano
quando non funzionano:

1. **Scala 100%.** Mai "adatta alla pagina": rimpicciolisce il QR.
2. **Carta non lucida.** La plastificazione brillante riflette il flash e
   blocca la lettura.
3. **Non ritagliare dentro la cornice bianca** intorno al QR. Quel bianco fa
   parte del codice: senza, la fotocamera non trova i bordi.
4. **Nero su bianco.** Il QR non va colorato di blu e non va messo un logo
   sopra.

### Il collaudo, prima di stampare 150 badge

Stampa **solo la prima pagina** e prova i QR con **tre telefoni diversi**, uno
dei quali vecchio. Il promemoria è scritto in cima al file e non si stampa.

Sotto ogni QR c'è il codice in chiaro a gruppi di quattro. Serve a chi ha il
badge piegato o la fotocamera che fa i capricci: si digita nella pagina e si
apre lo stesso.

---

## Cosa finisce dove, e cosa non finisce nel repo

Su Firestore vanno **solo** nome, azienda, ruolo, tavolo e orari. Mai email,
mai telefono. La ragione è che l'agenda si apre senza password: chi ha il
codice deve vedere soltanto quello che è comunque stampato sul badge della
persona. `pubblica.js` lo verifica prima di scrivere e si ferma se trova un
recapito.

Restano fuori dal repo, e devono restarci:

```
badge-napoli/node_modules/
badge-napoli/out/              i codici e le email
badge-napoli/partecipanti.json i dati veri
badge-napoli/iscritti.csv
badge-napoli/serviceAccount.json  la chiave
```

Gli indirizzi delle agende sono esclusi dai motori di ricerca in `robots.txt` e
con `noindex` nella pagina.

---

## Calendario

| Quando | Cosa |
| --- | --- |
| 26 settembre | chiusura dell'elenco iscritti per la stampa |
| 28 settembre | prova di stampa e collaudo con tre telefoni |
| 29 settembre | badge in stampa, `node pubblica.js`, mail con i link |
| 2 ottobre | evento |

Chi si iscrive dopo il 26 prende un badge generico con il codice scritto a mano.

---

## Se qualcosa va storto

**La pagina dice "Connessione assente".** Le regole di Firestore non sono state
messe, oppure la rete della sala è giù. La pagina si arrende dopo otto secondi
invece di restare appesa. Chi aveva già aperto l'agenda una volta continua a
vederla: resta salvata sul telefono.

**La pagina dice "Non troviamo questo codice".** Il badge è stato consegnato
prima della pubblicazione delle agende. Rilanciare `node pubblica.js`.

**Un ospite ha perso il badge.** Cerca il suo nome in `out/codici.csv`, dettagli
il codice a voce: sono dieci caratteri senza `0`, `1`, `i`, `l` e `o`, scelti
proprio perché non si confondono quando si leggono ad alta voce.

**In sala serve un piano B.** Stampa `out/codici.csv` su carta prima di partire.
Con la lista in mano il desk funziona anche senza rete e senza telefoni.
