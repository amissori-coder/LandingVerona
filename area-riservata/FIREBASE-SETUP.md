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
       function abilitato() {
         return request.auth != null
           && exists(/databases/$(database)/documents/utenti/$(request.auth.token.email))
           && get(/databases/$(database)/documents/utenti/$(request.auth.token.email)).data.attivo == true;
       }
       function admin() {
         return abilitato()
           && get(/databases/$(database)/documents/utenti/$(request.auth.token.email)).data.ruolo == 'admin';
       }
       // elenco degli utenti abilitati: lo leggono gli abilitati, lo
       // modifica solo l'admin; ogni utente puo aggiornare soltanto il
       // proprio campo "ultimoAccesso"
       match /utenti/{email} {
         allow read: if abilitato();
         allow create, delete: if admin();
         allow update: if admin()
           || (abilitato()
               && request.auth.token.email == email
               && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['ultimoAccesso']));
       }
       // dati condivisi dell'area riservata: li leggono e scrivono gli utenti
       // abilitati, TRANNE la definizione dei ruoli (vedi sotto)
       match /archivio/{documento} {
         allow read: if abilitato();
         allow write: if abilitato() && documento != 'ruoli';
       }
       // definizione dei ruoli e dei permessi: la leggono tutti gli abilitati
       // (serve a sapere cosa puo' vedere ciascuno) ma la scrive SOLO l'admin.
       // Senza questa regola un utente potrebbe riscriversi i permessi da solo.
       match /archivio/ruoli {
         allow read: if abilitato();
         allow write: if admin();
       }
       // modelli PDF delle lettere di incarico: li leggono gli abilitati,
       // li carica solo l'amministratore
       match /modelli/{documento} {
         allow read: if abilitato();
         allow write: if admin();
       }
     }
   }
   ```

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
scrittura. Il ruolo di sistema "Coordinatore territoriale" e sempre in sola
visualizzazione e vede solo gli incarichi della regione scritta nella sua
scheda in Persone (agganciata all'utente tramite email). Cosa succede a
livello di sicurezza:

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
