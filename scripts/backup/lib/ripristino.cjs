/* ============================================================
   RIPRISTINO.txt: le istruzioni che finiscono dentro ogni backup
   ------------------------------------------------------------
   Vanno scritte per chi le legge nel momento peggiore: sito giu', magari da
   un altro computer, magari senza di me. Niente sottintesi, comandi copiabili.
   ============================================================ */

function genera(d) {
    return `RIPRISTINO RAPIDO - nextgenerationbusiness.it + area riservata
===============================================================
Backup del ${d.dataOra}   -   commit ${d.commit}
Prodotto da GitHub Actions (.github/workflows/backup-notturno.yml)

COSA C'E' IN QUESTA CARTELLA
----------------------------
 code-snapshot.zip        tutto il sito, al commit indicato sopra
 repo-full.bundle         storia git completa (clonabile: e' un repo intero)
 firestore-data.json      i dati (incarichi, persone, iscrizioni, archivio...)
 import-firestore.cjs     lo strumento che rimette dentro i dati qui sopra
 auth-users.json          gli account di accesso, gia' nel formato di importazione
 auth-parametri-hash.txt  il comando pronto per reimportarli con le password attuali
 regole-*.rules           le regole di sicurezza di Firestore, in chiaro
 firebase-regole.json     le stesse regole in formato macchina
 firestore-indici.json    indici e override dei campi
 dns.txt                  i record DNS del dominio al momento del backup
 video-inventario.json    elenco dei video allegati alle release (nome e peso)
 report.txt               esito delle verifiche di questo backup
 ..\\media\\                i video veri e propri, divisi per release (fuori da qui)

COSA NON C'E' (e va tenuto altrove)
------------------------------------
 - I 12 valori delle variabili d'ambiente del servizio email su Vercel: sono
   segreti e non vengono salvati qui. I NOMI sono elencati sotto: i VALORI
   vanno tenuti nel gestore di password.
 - Le credenziali di GitHub, Vercel, del registrar del dominio e di Brevo.
 - La chiave del service account Firebase. Sta nei segreti del repository
   (FIREBASE_SERVICE_ACCOUNT) e nel gestore di password: NON viene copiata qui,
   perche' chiunque legga il backup potrebbe usarla per entrare nei dati.

1) RIMETTERE IN PIEDI IL SITO (GitHub Pages)
---------------------------------------------
 1. Crea un repository VUOTO su GitHub (senza README, senza .gitignore).
 2. Rimetti dentro il codice, in uno dei due modi:
    a) con tutta la storia (consigliato):
         git clone repo-full.bundle LandingVerona
         cd LandingVerona
         git remote set-url origin https://github.com/<utente>/<repo>.git
         git push -u origin main
    b) solo l'ultima versione: scompatta code-snapshot.zip in una cartella, poi
         git init && git add -A && git commit -m "ripristino"
         git branch -M main
         git remote add origin https://github.com/<utente>/<repo>.git
         git push -u origin main
 3. Rimetti i VIDEO. Non sono file del repo: sono allegati alle release. Per ogni
    sottocartella di ..\\media\\ (una per release, il nome della cartella e' il tag)
    crea su GitHub una release con quel tag esatto e allegaci i file che contiene.
    Se il nome utente o il nome del repo sono cambiati, gli indirizzi dei video
    vanno aggiornati: sono ${d.quantiVideo} righe in 3 file (index.html, interviste_verona_2026\\
    index.html, verona_marzo_2026\\index.html). Basta un trova-e-sostituisci di
      https://github.com/<vecchio-utente>/<vecchio-repo>/releases/download/
    con il nuovo indirizzo. Saltando questo passo il sito torna online ma i
    lettori video restano vuoti.
 4. Settings > Pages: sorgente = ramo main, cartella / (root).
 5. Il file CNAME e' gia' nel repo e contiene nextgenerationbusiness.it.
 6. DNS: rimetti i record come in dns.txt. Per GitHub Pages servono i 4 record A
    185.199.108.153 / .109.153 / .110.153 / .111.153 sul dominio nudo, e un CNAME
    per www verso <utente>.github.io.
    Attenzione a non perdere i TXT: c'e' l'SPF (include:_spf.aruba.it) e il codice
    di verifica Brevo. Senza quelli le email partono ma finiscono nello spam.

2) RIMETTERE IN PIEDI DATI E ACCESSI (Firebase)
------------------------------------------------
 1. Crea o riapri il progetto Firebase.
    ATTENZIONE se il progetto e' NUOVO: l'id "${d.progetto}", una volta
    cancellato, non si puo' riusare. Finche' non fai i tre passi qui sotto, il
    sito continua a parlare con il progetto morto e nessuno riesce ad accedere.
      a) Impostazioni progetto > Le tue app > App web: copia il nuovo oggetto
         firebaseConfig e sostituiscilo dentro area-riservata\\firebase-config.js
         (il blocco window.RV_FIREBASE_CONFIG), poi ripubblica il sito.
      b) Authentication > Sign-in method: riabilita il provider Email/Password.
      c) Authentication > Settings > Domini autorizzati: aggiungi
         nextgenerationbusiness.it e www.nextgenerationbusiness.it.
 2. Regole: copia il contenuto di regole-cloud.firestore-firestore.rules
    in Firestore > Regole, e pubblica.
 3. Dati: il file firestore-data.json ha un formato nostro, la console Firebase
    non lo sa leggere. Si reimporta con lo strumento che trovi qui accanto:
        npm install firebase-admin
        node import-firestore.cjs <chiave-service-account.json> firestore-data.json
    Lanciato cosi' fa solo una prova a vuoto e ti dice cosa scriverebbe.
    Per scrivere davvero aggiungi in fondo    --conferma
    ATTENZIONE: incarichi, persone, fatture e audit NON sono collezioni: stanno
    dentro la collezione "archivio", un documento ciascuno, con tutto il
    contenuto nel campo "json".
 4. Utenti: auth-users.json e' gia' nel formato giusto per l'importazione.
    In auth-parametri-hash.txt trovi il comando COMPLETO da incollare, con i
    parametri di cifratura del progetto. Usandolo, le password restano quelle
    che gli utenti gia' conoscono e nessuno deve fare niente.
    Se quei parametri mancassero, gli account si ricreano lo stesso ma va fatto
    partire un reset password per ciascuno dei ${d.quantiUtenti}.
 5. Ruoli e abilitazioni non stanno in Authentication ma nella collezione
    "utenti" di Firestore (campi ruolo e attivo; per i collaboratori anche
    collaboratoreDi, l'utente a nome del quale lavorano): arrivano con il
    punto 3.
    Quindi i punti 3 e 4 vanno fatti ENTRAMBI: il 4 crea chi puo' entrare, il 3
    stabilisce cosa ciascuno puo' fare una volta dentro.

3) RIMETTERE IN PIEDI IL SERVIZIO EMAIL (Vercel)
-------------------------------------------------
 Il codice sta in email-service/ dentro code-snapshot.zip (c'e' gia' il suo
 vercel.json). Ricrea il progetto su Vercel e reimposta queste variabili:

     ALLOWED_ORIGIN          APP_BASE_URL           CRON_SECRET
     EVENTI_SHEET_ID         EVENTI_SHEET_RANGE     FIREBASE_SERVICE_ACCOUNT
     SMTP_FROM_EMAIL         SMTP_FROM_NAME         SMTP_HOST
     SMTP_PASS               SMTP_PORT              SMTP_USER

 FIREBASE_SERVICE_ACCOUNT e' il contenuto della chiave del service account.
 Le SMTP_* sono le credenziali di invio. EVENTI_SHEET_ID punta al foglio Google
 delle iscrizioni agli eventi.
 Il progetto sta sul piano PRO: serve per i lavori programmati ogni quarto
 d'ora (lettore PEC e newsletter) e per l'uso commerciale. Ricreandolo sul
 piano Hobby tornano i vecchi limiti - 12 funzioni serverless e cron una
 volta al giorno - e il lettore PEC smette di funzionare da solo.

4) RIMETTERE IN PIEDI IL BACKUP STESSO
---------------------------------------
 Il backup gira su GitHub Actions e sta nel repository, quindi si ripristina da
 solo insieme al codice. Perche' riparta servono i segreti, che il repository
 non contiene (Settings > Secrets and variables > Actions):
     FIREBASE_SERVICE_ACCOUNT   obbligatorio
     GDRIVE_SERVICE_ACCOUNT     solo per la copia su Drive
     GDRIVE_FOLDER_ID           id della cartella Backup-NGB
 Le pianificazioni partono SOLO dal ramo predefinito del repository.

5) VERIFICA CHE SIA TORNATO TUTTO
----------------------------------
 - https://nextgenerationbusiness.it/ risponde 200
 - https://nextgenerationbusiness.it/area-riservata/ chiede il login e un utente entra
 - gli endpoint /api/invia-email e /api/invia-comunicazione rispondono 405 a una GET
   (405 e' giusto: accettano solo POST), /api/cron-comunicazioni risponde 401
 - in Area riservata > Dati e backup l'elenco incarichi e' quello atteso
`;
}

module.exports = { genera };
