# Attivare l'accesso reale con Firebase

Con questa configurazione la password arriva davvero per email e i dati
(incarichi, persone, registro, stati delle rate) sono condivisi tra gli
utenti abilitati tramite Cloud Firestore. Senza configurazione l'area
resta in modalita dimostrativa (dati solo nel browser).

Tempo stimato: 15 minuti. Il piano gratuito di Firebase (Spark) e
sufficiente per questo utilizzo: il servizio email tiene una copia
compressa dell'archivio iscrizioni in `meta/iscrizioniCopia`, cosi le
sezioni Eventi e Newsletter costano due letture a richiesta e non
esauriscono le 50.000 letture al giorno del piano gratuito (vedi
`email-service/README.md`, "Quante letture costa").

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
       function mia() {
         return request.auth.token.email;
       }
       function esisteScheda(email) {
         return exists(/databases/$(database)/documents/utenti/$(email));
       }
       function schedaDi(email) {
         return get(/databases/$(database)/documents/utenti/$(email)).data;
       }
       // Il "collaboratore" (ruolo 'collaboratore', campo collaboratoreDi = l'email
       // di un altro utente) lavora a nome di quell'utente: il ruolo che conta e'
       // quello del suo riferimento, non il suo. Senza collaboratoreDi l'email
       // effettiva e' vuota e l'accesso e' negato (fail-closed). I campi si leggono
       // con get(campo, '') cosi' una scheda senza ruolo non manda in errore la regola.
       function eCollaboratore() {
         return schedaDi(mia()).get('ruolo', '') == 'collaboratore';
       }
       function emailEffettiva() {
         return eCollaboratore() ? schedaDi(mia()).get('collaboratoreDi', '') : mia();
       }
       function ruoloUtente() {
         return schedaDi(emailEffettiva()).ruolo;
       }
       function abilitato() {
         return request.auth != null
           && esisteScheda(mia())
           && schedaDi(mia()).attivo == true
           // un collaboratore entra solo se il suo riferimento e' indicato, esiste,
           // e' attivo e non e' l'amministratore, il vice amministratore o il titolare
           // (i loro poteri non si delegano), un altro collaboratore (niente catene) o
           // un invitato "solo sondaggio" (le stesse regole dell'app e del servizio email)
           && (!eCollaboratore()
               || (emailEffettiva() != ''
                   && emailEffettiva() != 'a.missori@emvas.tax'
                   && esisteScheda(emailEffettiva())
                   && schedaDi(emailEffettiva()).attivo == true
                   && !(schedaDi(emailEffettiva()).get('ruolo', '') in ['admin', 'viceadmin', 'collaboratore', 'sondaggio_compila', 'sondaggio_risultati'])));
       }
       // amministratore e vice amministratore ('viceadmin'): stessi poteri, in tutto
       function admin() {
         return abilitato() && ruoloUtente() in ['admin', 'viceadmin'];
       }
       // utente "solo sondaggio" (invitato esterno): accede SOLO ai dati del sondaggio
       function soloSondaggio() {
         return abilitato() && (ruoloUtente() == 'sondaggio_compila' || ruoloUtente() == 'sondaggio_risultati');
       }
       // "interno" = abilitato che NON e' un invitato solo-sondaggio: lo staff pieno piu'
       // i revisori. Puo' usare i servizi comuni dell'area (messaggi, ruoli, modelli).
       // NB: abilitato() va valutata UNA volta sola per regola. Per un collaboratore
       // costa molto (rilegge la sua scheda e quella del suo riferimento) e Firestore
       // mette un tetto ai calcoli di una regola: ripetuta tre volte nella stessa
       // regola lo superava, e il collaboratore restava chiuso fuori da tutto (lo si
       // vede sull'emulatore: scripts/regole/prova-regole.cjs).
       function interno() {
         return abilitato() && !(ruoloUtente() in ['sondaggio_compila', 'sondaggio_risultati']);
       }
       // "staff pieno" = chi legge e scrive gli archivi: un interno che NON e' un revisore.
       // Il "Revisore" (ruolo 'revisore') vede solo cio' che riguarda i SUOI incarichi, ma
       // gli archivi sono salvati in blocco e le regole non sanno aprirli per dargliene una
       // parte: per questo il database a lui NON consegna nessun archivio, ne' l'elenco
       // degli utenti. I suoi dati glieli prepara il servizio email (api/revisore.js), che
       // gli passa solo quelli dei suoi incarichi. Vale anche per il collaboratore di un
       // revisore (ruoloUtente() e' il ruolo del suo utente di riferimento).
       function staff() {
         return interno() && ruoloUtente() != 'revisore';
       }
       // elenco degli utenti abilitati: lo legge lo STAFF (ogni utente attivo puo
       // comunque leggere la PROPRIA scheda, serve al login: anche un collaboratore
       // rimasto senza riferimento, cosi' la schermata di accesso gli dice perche'
       // non entra); lo modifica solo l'admin (o il suo vice); ogni utente puo aggiornare soltanto
       // il proprio "ultimoAccesso". Cosi gli invitati esterni "solo sondaggio" non
       // vedono l'elenco dello staff.
       // Il revisore NON legge l'elenco: solo la propria scheda (e il suo collaboratore
       // anche quella del revisore a nome del quale lavora: serve all'accesso).
       match /utenti/{email} {
         allow read: if (request.auth != null && request.auth.token.email == email && resource.data.attivo == true)
           || (interno() && (ruoloUtente() != 'revisore' || emailEffettiva() == email));
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
         allow read: if interno();
         allow write: if admin();
       }
       // risposte del sondaggio: le leggono tutti gli abilitati (staff +
       // compilatori + visualizzatori); le scrivono lo staff e i compilatori
       // (NON i "solo risultati").
       match /archivio/sondaggi {
         allow read: if abilitato() && ruoloUtente() != 'revisore';
         allow write: if staff() || (abilitato() && ruoloUtente() == 'sondaggio_compila');
       }
       // configurazione del sondaggio (scadenza, invitati): la leggono tutti gli
       // abilitati, la scrive solo lo staff (l'admin la modifica dall'app).
       match /archivio/sondaggiConfig {
         allow read: if abilitato() && ruoloUtente() != 'revisore';
         allow write: if staff();
       }
       // modelli PDF delle lettere di incarico: li leggono gli abilitati,
       // li carica solo l'amministratore
       match /modelli/{documento} {
         allow read: if interno();
         allow write: if admin();
       }
       // messaggi privati tra utenti: OGNUNO legge SOLO il proprio documento
       // (messaggi/<propria email>); qualunque utente staff puo scrivere per
       // recapitare. Cosi le conversazioni NON sono visibili a tutti, ma solo al
       // destinatario (nemmeno via strumenti per sviluppatori o API).
       match /messaggi/{email} {
         allow read: if interno() && request.auth.token.email == email;
         allow write: if interno();
       }
       // contatore delle modifiche all'archivio iscrizioni: solo un numero e una
       // data, nessun dato personale. L'area riservata lo ASCOLTA per aggiornare
       // la sezione Eventi in tempo reale (una lettura per cambiamento, non una
       // per utente al minuto). Lo scrive solo il servizio email, mai il browser.
       match /meta/iscrizioni {
         allow read: if staff();
         allow write: if false;
       }
     }
   }
   ```

   > **Revisore.** Queste regole tolgono al ruolo `revisore` (e al suo
   > collaboratore) la lettura e la scrittura degli archivi e l'elenco degli
   > utenti: i suoi dati glieli prepara il servizio email, che gli passa solo
   > quelli dei suoi incarichi (sezione "Revisore: i dati li prepara il
   > servizio", piu' sotto). Rispetto alla versione precedente cambiano le
   > funzioni `interno()` e `staff()` e le regole di `utenti`, `archivio/ruoli`,
   > `archivio/sondaggi`, `archivio/sondaggiConfig`, `modelli` e `messaggi`: per
   > tutti gli altri ruoli l'esito di ogni operazione resta quello di prima.
   > Il testo pronto da incollare e' anche nel file
   > `area-riservata/firestore.rules`. Dopo averle pubblicate, fai la prova
   > dalla sezione Ruoli e permessi ("Prova la protezione").

   > **Vice amministratore.** Il ruolo `viceadmin` (sezione Utenti: "Vice
   > amministratore") ha gli **stessi poteri** del ruolo `admin`: la funzione
   > `admin()` qui sopra li accetta tutti e due, quindi anche il vice scrive in
   > `utenti`, in `archivio/ruoli` e in `modelli`. Come per l'amministratore, i
   > suoi poteri non si delegano: `abilitato()` non fa entrare un collaboratore
   > il cui riferimento sia un vice amministratore. **Finche' non pubblichi
   > queste regole aggiornate**, un vice amministratore entra e vede le sezioni
   > Utenti e Ruoli e permessi, ma il server gli rifiuta i salvataggi (abilitare
   > un utente, cambiare un ruolo, modificare i permessi, caricare un modello
   > PDF): l'app lo dice con l'errore dei permessi. Se hai gia' pubblicato le
   > regole in passato, bastano le due righe con `'viceadmin'` (in `abilitato()`
   > e in `admin()`). Lo stesso ruolo e' riconosciuto dall'app (`eRuoloAdmin` in
   > `app.js`) e dal servizio email (`eRuoloAdmin` in
   > `email-service/lib/utente-effettivo.js`): i tre posti vanno tenuti uguali.

   > **Sezione Eventi in tempo reale.** Il blocco `match /meta/iscrizioni` e'
   > quello che permette all'area riservata di accorgersi subito quando un
   > collega segna una presenza o arriva un'iscrizione. Senza, non compare
   > nessun errore: la sezione si aggiorna comunque, ma ogni quattro minuti
   > (o con "Aggiorna adesso"). Se hai gia' pubblicato le regole in passato,
   > basta aggiungere questo blocco e ripubblicare.

   > **Collaboratori.** Il profilo "Collaboratore" (sezione Utenti: ruolo
   > `collaboratore` piu' il campo `collaboratoreDi` con l'email dell'utente di
   > riferimento) eredita TUTTI i permessi dell'utente a cui e' associato, anche
   > lato server: le funzioni `eCollaboratore()`, `emailEffettiva()` e
   > `ruoloUtente()` qui sopra leggono il ruolo dalla scheda del riferimento, e
   > `abilitato()` pretende che il riferimento sia indicato, esista, sia attivo e
   > non sia l'amministratore, il vice amministratore o il titolare (i poteri su
   > utenti, ruoli e dati non si delegano: un collaboratore non e' mai `admin()`), ne' a sua volta un
   > collaboratore, ne' un invitato "solo sondaggio"; la propria scheda resta
   > pero' leggibile a ogni utente attivo, cosi' l'app puo' spiegare il blocco
   > alla porta (la scheda del riferimento, invece, si legge solo da staff). Le
   > regole leggono al massimo due schede utente per richiesta (la propria e
   > quella del riferimento): si resta ben sotto il limite di dieci letture per
   > valutazione. **Finche' non pubblichi queste regole aggiornate**, un
   > collaboratore entra comunque come staff (la sua scheda e' attiva e il suo
   > ruolo non e' "solo sondaggio"), ma il server non controlla che il suo
   > riferimento sia ancora abilitato: lo fa solo l'app. Anche il servizio email
   > (`email-service/lib/utente-effettivo.js`) risolve il riferimento allo
   > stesso modo.

   > **Sblocco del calcolo: `sbloccoIncarichi` resta fuori dalle regole.** I
   > gettoni con cui il responsabile approva lo sblocco di un incarico vivono
   > nella collezione `sbloccoIncarichi`, e qui sopra NON c'e' un `match` per
   > essa: senza regola Firestore nega tutto, e quei documenti li vede solo
   > l'account di servizio (`email-service/api/sblocco-incarico.js`). E' voluto.
   > Aggiungere un `match` che la apra allo staff vanificherebbe l'approvazione:
   > chi chiede lo sblocco potrebbe leggersi il gettone e approvarsi da solo.

   > **Circolarizzazioni via PEC: anche `circInvii`, `circRiferimenti`,
   > `circMessaggi`, `circIncarichi`, `circErrori`, `circAvvisi`, `circBozze`, `circRegistro` e `circInoltri` restano fuori dalle regole.** Le lettere
   > di circolarizzazione, le loro ricevute e le risposte dei terzi si vedono
   > incarico per incarico (team, responsabile dell'incarico, responsabile
   > della qualita'; tutto solo per l'amministratore e i supervisori), e le
   > regole non possono controllare chi e' nel team di un incarico. Percio' NON
   > c'e' un `match`: le legge e le scrive solo l'account di servizio
   > (`email-service/api/circolarizzazioni.js`), che a ogni chiamata verifica
   > chi chiede. Aggiungere un `match` che le apra allo staff farebbe vedere a
   > tutti le circolarizzazioni di tutti gli incarichi.

   > **Messaggi tra utenti connessi.** Il blocco `match /messaggi/{email}` serve
   > ai messaggi privati tra colleghi (popup con risposta). Se le regole
   > pubblicate sulla console sono una versione precedente senza quel blocco,
   > l'app se ne accorge da sola e recapita comunque i messaggi attraverso il
   > documento di presenza condiviso (coperto dalla regola base `archivio/*`):
   > l'invio funziona, ma i messaggi in transito sono tecnicamente leggibili da
   > tutto lo staff via API. Pubblica le regole aggiornate per renderli privati.

   > **Ruoli "solo sondaggio" (invitati esterni).** I ruoli `sondaggio_compila`
   > (compila il questionario) e `sondaggio_risultati` (vede solo il riepilogo)
   > danno accesso **esclusivamente** ai due documenti del sondaggio: con le regole
   > qui sopra, questi utenti non possono leggere ne' scrivere incarichi, persone,
   > fatture o altri dati, nemmeno via API. Sono creati in automatico dal pulsante
   > **"Invia inviti via email"** della sezione Sondaggi quando un invitato non e'
   > gia' un utente dello studio. **Finche' non pubblichi queste regole aggiornate,
   > NON invitare persone esterne**: senza di esse un qualsiasi utente abilitato
   > puo' leggere tutti i dati.

   > **Newsletter: nessuna regola da aggiungere.** Le newsletter preparate, i
   > contatti raccolti a mano e l'elenco di chi puo' vedere la sezione stanno in
   > `archivio/newsletter`, `archivio/newsletterContatti` e
   > `archivio/newsletterConfig`: sono gia' coperti dalla regola generale
   > `archivio/{documento}` (solo staff). Gli indirizzi di chi si e' disiscritto
   > stanno invece in una collezione a parte, `newsletterDisiscritti`, che **non
   > compare in nessuna regola**: e' voluto. Ci scrive solo il servizio con
   > l'account di servizio (che le regole non le applica), e dal browser non ci
   > arriva nessuno — nemmeno per leggere chi si e' disiscritto. L'area riservata
   > la consulta passando dal servizio (`/api/newsletter`).
   >
   > **Richieste di correzione dati: nessuna regola da aggiungere.** Le richieste,
   > con tutto lo scambio di messaggi che le riguarda, stanno in
   > `archivio/richieste`: e' gia' coperto dalla regola generale
   > `archivio/{documento}` (solo staff). Chi vede quali richieste lo decide
   > l'app, non le regole: chi le ha scritte, l'equity partner a cui sono
   > indirizzate, il coordinatore e il vice della regione indicata, e tutti gli
   > equity e founding partner (che le vedono tutte). Vale quindi lo stesso
   > limite descritto piu' sotto per il filtro per regione: e' una divisione
   > organizzativa lato browser, non una barriera lato server. Il riepilogo per
   > email parte dal servizio gia' esistente (`/api/invia-comunicazione`), che
   > verifica l'ID token di chi scrive: nessuna configurazione in piu'.
   >
   > **Perche' il permesso della Newsletter sta sulla scheda utente.** La regola
   > `archivio/{documento}` lascia scrivere a *tutto* lo staff, quindi
   > `archivio/newsletterConfig` (l'elenco di chi vede la sezione) lo potrebbe
   > riscrivere chiunque, anche dagli strumenti per sviluppatori. Per questo il
   > servizio **non** lo guarda: decide in base al ruolo `admin` o `viceadmin`
   > oppure al campo `newsletter` sulla scheda in `utenti/<email>`, che solo
   > l'amministratore (o il suo vice) puo' scrivere. L'elenco condiviso resta, ma vale solo per
   > far comparire la voce di menu. Lo stesso ragionamento varrebbe per
   > `archivio/eventiConfig`, che `/api/iscrizioni` invece consulta: se un giorno
   > si vuole chiudere anche quello, la strada e' una regola dedicata
   > `match /archivio/eventiConfig { allow read: if staff(); allow write: if admin(); }`.

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

Il **vice amministratore** (ruolo `viceadmin`) puo' fare tutto quello che puo'
fare l'amministratore: dove qui sotto si legge "amministratore" o "admin" vale
anche per lui. Non ha permessi da configurare (accesso sempre pieno) e, come
l'amministratore, non puo' avere collaboratori. "Dati e backup" resta del solo
titolare.

L'amministratore crea ruoli su misura (sezione "Ruoli e permessi") e per ogni
ruolo sceglie, sezione per sezione, se e nascosta, in sola lettura o in
scrittura. Anche i ruoli di sistema "Coordinatore territoriale" e "Vice
coordinatore territoriale" hanno i permessi per sezione modificabili
dall'amministratore (compresa la scrittura): cio che resta fisso in questi due
ruoli e' il filtro per regione, cioe' vedono solo gli incarichi delle regioni
della loro scheda in Aderenti Revilaw (agganciata all'utente tramite email): la Regione
della scheda piu le eventuali altre regioni coordinate spuntate li. Nota: il
filtro per regione limita gli incarichi (e cio che ne deriva, come la
fatturazione); dare la scrittura a un coordinatore su sezioni non legate alla
regione (per esempio Aderenti Revilaw o Comunicazioni) non e' ristretto alla sua regione.
Il ruolo di sistema **"Revisore"** (`revisore`) e' per chi lavora sugli
incarichi: vede solo gli incarichi in cui compare la sua scheda in Aderenti
Revilaw (team, responsabile dell'incarico o della qualita', agganciata per
email), sempre in sola visualizzazione. L'amministratore sceglie quali sezioni
gli compaiono; Aderenti Revilaw, Verifica merito creditizio, Comunicazione
teams e Sondaggi gli restano nascoste, perche' non si possono restringere ai
suoi incarichi. A differenza degli altri ruoli limitati, per il Revisore il
limite **lo impone il database**: vedi piu' sotto "Revisore: i dati li prepara
il servizio".

**Nuovi accessi.** I responsabili della qualita' (ruolo `qualita`, oppure la
qualifica sulla scheda), gli equity partner e i founding partner possono
**aggiungere** utenti dalla sezione "Nuovi accessi", ma solo con il ruolo
Revisore e solo persone che hanno gia' una scheda attiva in Aderenti Revilaw.
Le regole lasciano creare gli utenti al solo amministratore, e restano cosi': la
scheda la scrive il servizio email (`email-service/api/abilita-utente.js`), che
verifica chi chiama, accetta solo quel ruolo e rifiuta un indirizzo che ha gia'
una scheda utente, anche disabilitata. Assegnare un altro ruolo, cambiarlo,
disabilitare ed eliminare restano dell'amministratore. Se chi abilita ha a sua
volta il ruolo Revisore (un equity partner o un responsabile della qualita'
entrato cosi'), l'elenco delle persone senza accesso glielo prepara lo stesso
servizio (azione `candidati`): a lui il database non consegna ne' l'anagrafica
ne' l'elenco degli utenti.

Cosa succede a livello di sicurezza:

- **Blindato dal server (regole Firestore):**
  - il campo `ruolo` di ogni utente sta nella collezione `utenti`, che solo
    l'admin puo' scrivere: un utente non puo' cambiarsi il ruolo da solo
    (l'unica altra strada e' il servizio email dei "Nuovi accessi", che crea
    schede nuove con il solo ruolo Revisore e non tocca quelle esistenti);
  - la **definizione** dei ruoli (`archivio/ruoli`) e scrivibile solo
    dall'admin (regola qui sopra): un utente non puo' allargarsi i permessi
    riscrivendo il proprio ruolo.
  - il **Revisore** non riceve dal database nessun archivio, ne' l'elenco
    degli utenti: vede solo cio' che gli passa il servizio, cioe' i dati dei
    suoi incarichi (sezione qui sotto).
- **Solo lato browser (NON blindato dal server):** la sola lettura per
  sezione e il filtro per regione del coordinatore territoriale. Tengono
  ognuno nella sua parte e prevengono gli errori, ma un utente abilitato che
  conosca gli strumenti per sviluppatori del browser potrebbe aggirarli,
  perche' ogni collezione e salvata come un unico blocco JSON che le regole
  non sanno leggere al loro interno. Per blindare davvero anche questi due
  aspetti servirebbe la stessa strada presa per il Revisore (i dati preparati
  dal servizio) oppure cambiare come sono salvati i dati (un documento per
  incarico invece di un unico blocco).

In sintesi: nessuno puo' auto-promuoversi (quello e' blindato); il Revisore
riceve solo i dati dei suoi incarichi (blindato anche questo); per gli altri
ruoli il "chi vede cosa" per sezione e regione e una divisione organizzativa
affidabile per un gruppo di lavoro interno, non una barriera contro un uso
volutamente ostile.

## Revisore: i dati li prepara il servizio

Gli archivi dell'area (incarichi, anagrafica, fatture, registro...) sono
salvati ognuno in **un solo documento**. Le regole di Firestore sanno dire
"questo documento si' / questo no", ma non sanno aprirlo per darne una parte.
Quindi a chi deve vedere solo i propri incarichi il database non puo'
consegnare l'archivio: con le regole qui sopra, a chi ha il ruolo `revisore`
(e al suo eventuale collaboratore) Firestore **non consegna nessun documento
di `archivio/`**, tranne la definizione dei ruoli, e non gli fa leggere
l'elenco degli utenti (solo la propria scheda). Non puo' nemmeno scriverci.

I suoi dati glieli prepara il servizio email (`email-service/api/revisore.js`,
la logica e' in `email-service/lib/revisore.js`), che legge gli archivi con la
chiave di servizio e gli passa soltanto:

- gli **incarichi** in cui compare la sua scheda di Aderenti Revilaw (team,
  responsabile dell'incarico o della qualita', referente, coordinatore);
- dell'**anagrafica**: la sua scheda per intero; dei colleghi citati nei suoi
  incarichi nome, email e qualifiche (niente telefono ne' indirizzo); degli
  equity partner e dei coordinatori quanto serve a indirizzare una richiesta
  di correzione; degli omonimi il solo nome;
- le **fatture** e i **controlli qualita'** dei suoi incarichi;
- del **Registro modifiche** le voci dei suoi incarichi e le sue;
- le **richieste di correzione** che ha scritto, quelle indirizzate a lui e
  quelle in cui e' in copia;
- la sua **firma email**.

Comunicazioni ai team, merito creditizio, sondaggi, eventi, newsletter e
l'elenco di chi e' connesso non gli vengono consegnati (per questo non compare
tra i "connessi ora" e non li vede).

Le tre cose che un revisore scrive passano dallo stesso servizio, che le
controlla: le voci del Registro (le **firma il servizio** con il suo nome, non
il browser), le richieste di correzione (ne apre di nuove solo sui suoi
incarichi e solo verso un equity partner; su quelle esistenti aggiunge la sua
parte) e la sua firma email. Niente si cancella e nient'altro si modifica.

Anche le altre porte del servizio lo tengono nel suo perimetro: da
`invia-comunicazione` gli partono solo i riepiloghi delle sue richieste di
correzione (alle persone che le riguardano e agli equity partner, con il suo
nome come mittente), e da `sblocco-incarico` chiede lo sblocco solo dei suoi
incarichi.

I dati del revisore non arrivano in tempo reale: l'area li rilegge
all'ingresso, ogni dieci minuti e quando si torna sulla scheda dopo un po'.

### Che cosa fare

1. **Pubblica le regole aggiornate**: Firebase console > Firestore Database >
   scheda Regole, incolla il testo del file `area-riservata/firestore.rules`
   (e' lo stesso riportato qui sopra) e premi Pubblica.
2. **Fai la prova**: nell'area riservata, sezione **Ruoli e permessi**, sulla
   scheda del ruolo Revisore premi **Prova la protezione**. Il servizio crea un
   revisore di prova (un utente finto, senza scheda e senza incarichi), il tuo
   browser entra a suo nome su un collegamento separato e tenta di leggere gli
   archivi direttamente dal database. Deve essere **respinto** ogni volta:
   l'esito, tentativo per tentativo, compare a video e resta nel Registro
   modifiche. Il revisore di prova viene tolto alla fine. La prova non legge e
   non scrive dati veri: in scrittura tenta un documento di prova
   (`archivio/provaProtezione`), che viene cancellato.
3. Ripeti la prova **ogni volta che ripubblichi le regole**.

**Finche' non pubblichi le regole aggiornate** l'area funziona lo stesso: al
revisore il programma chiede comunque i dati al servizio, quindi nel suo
browser arrivano solo quelli dei suoi incarichi. Ma il database, interrogato a
mano con gli strumenti per sviluppatori, gli risponderebbe ancora: e' la prova
a dirtelo ("protezione NON attiva").

Le regole si provano anche senza toccare il database vero, sull'emulatore di
Firebase: `scripts/regole/prova-regole.cjs` (ruolo per ruolo, operazione per
operazione; lo esegue anche GitHub a ogni modifica delle regole).

## Collaboratori: chi lavora a nome di un altro utente

Dalla sezione Utenti l'amministratore puo' abilitare un **collaboratore**,
indicando di quale utente e' collaboratore (campo `collaboratoreDi` sulla sua
scheda in `utenti`). Il collaboratore:

- **eredita tutti i permessi** dell'utente di riferimento: ruolo, sezioni,
  filtro per regione, abilitazioni a Eventi e Newsletter, qualifiche della
  scheda in Aderenti Revilaw (equity partner, responsabile qualita'), proprieta'
  delle verifiche di rating e delle richieste. Se il riferimento viene
  disabilitato o eliminato, il collaboratore non entra piu' (la schermata di
  accesso dice il perche');
- **firma con il nome del riferimento**: incarichi, registro modifiche,
  controlli qualita', verifiche, comunicazioni ed email partono con nome e
  indirizzo dell'utente di riferimento (le risposte alle email tornano a lui);
- **resta riconoscibile solo al suo riferimento**: nei dati ogni timbro porta
  anche il campo `collab` (nel registro `collaboratore`) con il nome del
  collaboratore, che l'app mostra come "tramite <nome>" soltanto all'utente di
  riferimento collegato in prima persona. Come per il filtro per regione, e'
  una riservatezza lato browser: il campo sta nei documenti condivisi.

Non possono avere collaboratori l'amministratore, il vice amministratore e il
titolare (i poteri su utenti, ruoli e dati non si delegano: un collaboratore non vede mai Utenti,
Ruoli e permessi o Dati e backup), un altro collaboratore e un invitato "solo
sondaggio". La tendina "Collaboratore di" propone solo chi puo'.

Attenzione a un caso raro: se in passato e' stato creato da Ruoli e permessi un
ruolo su misura chiamato proprio "Collaboratore", il suo identificativo
(`collaboratore`) coincide con quello del profilo di sistema e chi lo ha non
entra piu'. La sezione Ruoli e permessi lo segnala in testa alla pagina:
assegna a quegli utenti un altro ruolo (o abilitali come collaboratori di
qualcuno) e poi elimina il vecchio ruolo.

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
