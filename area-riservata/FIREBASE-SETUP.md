# Attivare l'accesso reale con Firebase

Con questa configurazione la password arriva davvero per email e i dati
(incarichi, persone, registro, stati delle rate) sono condivisi tra gli
utenti abilitati tramite Cloud Firestore. Senza configurazione l'area
resta in modalita dimostrativa (dati solo nel browser).

Tempo stimato: 15 minuti. Il piano gratuito di Firebase (Spark) e
sufficiente per questo utilizzo.

## 1. Crea il progetto

1. Vai su https://console.firebase.google.com e accedi con un account Google.
2. "Aggiungi progetto", nome ad esempio `revilaw-incarichi`.
   Google Analytics non serve: puoi disattivarlo.

## 2. Registra l'app web e copia la configurazione

1. Nella panoramica del progetto premi l'icona `</>` (App web).
2. Nome qualsiasi (es. "Area riservata"), NON serve Firebase Hosting.
3. La console mostra un blocco `const firebaseConfig = { ... }`.
4. Apri `area-riservata/firebase-config.js` e sostituisci
   `window.RV_FIREBASE_CONFIG = null;` con:

   ```js
   window.RV_FIREBASE_CONFIG = { ...incolla qui l'oggetto firebaseConfig... };
   ```

   Nota: la configurazione web (compresa la apiKey) e pubblica per
   progetto. La protezione sta nelle regole del passo 4 e in
   Authentication, non in questo file.

## 3. Abilita l'accesso con email e password

1. Menu "Authentication" > "Sign-in method".
2. Abilita il provider "Email/Password" (solo la prima voce, non serve
   il "link via email").
3. In "Settings > Authorized domains" aggiungi il dominio del sito
   (es. `nextgenerationbusiness.it`); `localhost` e gia presente.
4. Facoltativo ma consigliato: in "Templates" personalizza in italiano
   l'email "Password reset" (e quella che gli utenti ricevono per la
   prima password e per il recupero).

## 4. Crea il database Firestore e applica le regole

1. Menu "Firestore Database" > "Crea database" > modalita "production"
   (regione consigliata: `europe-west8` Milano o `eur3`).
2. Scheda "Rules": incolla e pubblica queste regole:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       function ruoloUtente() {
         return get(/databases/$(database)/documents/utenti/$(request.auth.token.email)).data.ruolo;
       }
       function abilitato() {
         return request.auth != null
           && exists(/databases/$(database)/documents/utenti/$(request.auth.token.email))
           && get(/databases/$(database)/documents/utenti/$(request.auth.token.email)).data.attivo == true;
       }
       function admin() {
         return abilitato() && ruoloUtente() == 'admin';
       }
       // utente "solo sondaggio" (invitato esterno): accede SOLO ai dati del sondaggio
       function soloSondaggio() {
         return abilitato() && (ruoloUtente() == 'sondaggio_compila' || ruoloUtente() == 'sondaggio_risultati');
       }
       // "staff pieno" = abilitato che NON e' un utente solo-sondaggio
       function staff() {
         return abilitato() && !soloSondaggio();
       }
       // elenco degli utenti abilitati: lo legge lo STAFF (ogni utente puo
       // comunque leggere la PROPRIA scheda, serve al login); lo modifica solo
       // l'admin; ogni utente puo aggiornare soltanto il proprio "ultimoAccesso".
       // Cosi gli invitati esterni "solo sondaggio" non vedono l'elenco dello staff.
       match /utenti/{email} {
         allow read: if staff() || (abilitato() && request.auth.token.email == email);
         allow create, delete: if admin();
         allow update: if admin()
           || (abilitato()
               && request.auth.token.email == email
               && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['ultimoAccesso']));
       }
       // dati generali dell'area riservata (incarichi, persone, fatture, ...):
       // SOLO lo staff pieno. Gli utenti "solo sondaggio" NON possono leggerli
       // ne scriverli. La definizione dei ruoli ha una regola dedicata sotto.
       match /archivio/{documento} {
         allow read: if staff();
         allow write: if staff() && documento != 'ruoli';
       }
       // definizione dei ruoli e dei permessi: la legge lo STAFF (serve a sapere
       // cosa puo' vedere ciascuno) ma la scrive SOLO l'admin. Gli utenti "solo
       // sondaggio" non ne hanno bisogno e non devono vederla.
       match /archivio/ruoli {
         allow read: if staff();
         allow write: if admin();
       }
       // risposte del sondaggio: le leggono tutti gli abilitati (staff +
       // compilatori + visualizzatori); le scrivono lo staff e i compilatori
       // (NON i "solo risultati").
       match /archivio/sondaggi {
         allow read: if abilitato();
         allow write: if staff() || (abilitato() && ruoloUtente() == 'sondaggio_compila');
       }
       // configurazione del sondaggio (scadenza, invitati): la leggono tutti gli
       // abilitati, la scrive solo lo staff (l'admin la modifica dall'app).
       match /archivio/sondaggiConfig {
         allow read: if abilitato();
         allow write: if staff();
       }
       // modelli PDF delle lettere di incarico: li leggono gli abilitati,
       // li carica solo l'amministratore
       match /modelli/{documento} {
         allow read: if staff();
         allow write: if admin();
       }
     }
   }
   ```

   > **Ruoli "solo sondaggio" (invitati esterni).** I ruoli `sondaggio_compila`
   > (compila il questionario) e `sondaggio_risultati` (vede solo il riepilogo)
   > danno accesso **esclusivamente** ai due documenti del sondaggio: con le regole
   > qui sopra, questi utenti non possono leggere ne' scrivere incarichi, persone,
   > fatture o altri dati, nemmeno via API. Sono creati in automatico dal pulsante
   > **"Invia inviti via email"** della sezione Sondaggi quando un invitato non e'
   > gia' un utente dello studio. **Finche' non pubblichi queste regole aggiornate,
   > NON invitare persone esterne**: senza di esse un qualsiasi utente abilitato
   > puo' leggere tutti i dati.

## 5. Abilita il primo amministratore (te stesso)

Le regole permettono solo all'admin di scrivere in `utenti`, quindi il
primo documento va creato a mano dalla console:

1. "Firestore Database" > "Dati" > "Avvia raccolta", ID raccolta: `utenti`.
2. ID documento: `a.missori@emvas.tax` (l'email, tutta minuscola).
3. Campi del documento:
   - `nome` (string): `Andrea Missori`
   - `ruolo` (string): `admin`
   - `attivo` (boolean): `true`

## 6. Primo accesso

1. Ricarica l'area riservata: il riquadro in basso nella pagina di
   accesso deve dire "Accesso protetto con Firebase".
2. Premi "Richiedi la prima password" con la tua email: ricevi una email
   con il collegamento per impostare la password, poi accedi.
3. Dalla vista "Utenti" abiliti i colleghi: alla conferma parte in
   automatico l'email per impostare la loro password.
4. Al primo accesso i dati presenti nel browser (per esempio l'elenco
   importato dall'Excel) vengono caricati su Firestore e da quel momento
   sono condivisi e sincronizzati in tempo reale tra gli utenti.

## Ruoli e permessi: cosa e blindato dal server e cosa no

L'amministratore crea ruoli su misura (sezione "Ruoli e permessi") e per ogni
ruolo sceglie, sezione per sezione, se e nascosta, in sola lettura o in
scrittura. Anche i ruoli di sistema "Coordinatore territoriale" e "Vice
coordinatore territoriale" hanno i permessi per sezione modificabili
dall'amministratore (compresa la scrittura): cio che resta fisso in questi due
ruoli e' il filtro per regione, cioe' vedono solo gli incarichi delle regioni
della loro scheda in Persone (agganciata all'utente tramite email): la Regione
della scheda piu le eventuali altre regioni coordinate spuntate li. Nota: il
filtro per regione limita gli incarichi (e cio che ne deriva, come la
fatturazione); dare la scrittura a un coordinatore su sezioni non legate alla
regione (per esempio Persone o Comunicazioni) non e' ristretto alla sua regione.
Cosa succede a livello di sicurezza:

- **Blindato dal server (regole Firestore):**
  - il campo `ruolo` di ogni utente sta nella collezione `utenti`, che solo
    l'admin puo' scrivere: un utente non puo' cambiarsi il ruolo da solo;
  - la **definizione** dei ruoli (`archivio/ruoli`) e scrivibile solo
    dall'admin (regola qui sopra): un utente non puo' allargarsi i permessi
    riscrivendo il proprio ruolo.
- **Solo lato browser (NON blindato dal server):** la sola lettura per
  sezione e il filtro per regione del coordinatore territoriale. Tengono ognuno nella sua parte e prevengono
  gli errori, ma un utente abilitato che conosca gli strumenti per
  sviluppatori del browser potrebbe aggirarli, perche' ogni collezione e
  salvata come un unico blocco JSON che le regole non sanno leggere al loro
  interno. Per blindare davvero anche questi due aspetti servirebbe cambiare
  come sono salvati i dati (un documento per incarico invece di un unico
  blocco), un intervento a se' stante.

In sintesi: nessuno puo' auto-promuoversi (quello e' blindato); il "chi vede
cosa" per sezione e regione e una divisione organizzativa affidabile per un
gruppo di lavoro interno, non una barriera contro un uso volutamente ostile.

## Note

- "Richiedi la prima password" e "Password dimenticata?" usano l'email
  di reimpostazione password di Firebase: nessuna password viaggia o
  viene mostrata in chiaro.
- Un'utenza disabilitata dalla vista Utenti non supera piu il controllo
  di accesso, anche se conosce la password.
- Il registro modifiche e i dati viaggiano su Firestore: valgono i
  limiti del piano gratuito (piu che sufficienti per questi volumi).
- Limite noto della sincronizzazione v1: i salvataggi scrivono l'intero
  archivio, quindi se due utenti salvano nello stesso istante vince
  l'ultimo. Per l'uso tipico (pochi utenti interni) e adeguato.
- Limite noto della prima password: il pulsante "Richiedi la prima
  password" puo creare account Firebase Authentication anche per email
  non abilitate (che comunque NON superano l'accesso e non leggono
  alcun dato, perche mancano dall'elenco `utenti`). Eventuali account
  estranei si eliminano da Authentication > Users. Per bloccare anche
  la creazione servirebbero le "blocking functions" (piano a pagamento).
