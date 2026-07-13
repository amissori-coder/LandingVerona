/* ============================================================
   CONFIGURAZIONE FIREBASE (facoltativa)
   ------------------------------------------------------------
   Con RV_FIREBASE_CONFIG = null l'area riservata funziona in
   modalita dimostrativa: accessi e dati restano nel browser.

   Per attivare l'accesso reale (password via email) e i dati
   condivisi tra gli utenti, segui FIREBASE-SETUP.md:
   1. crea un progetto su https://console.firebase.google.com
   2. aggiungi una "app web" e copia qui sotto l'oggetto
      firebaseConfig che la console ti mostra
   3. in Authentication > Sign-in method abilita "Email/Password"
   4. crea il database Cloud Firestore e incolla le regole di
      sicurezza riportate in FIREBASE-SETUP.md
   5. ricarica la pagina: l'app passa da sola in modalita cloud

   NOTA: la configurazione web di Firebase (apiKey compresa) e
   pubblica per progetto: la protezione dei dati sta nelle regole
   di sicurezza di Firestore, non in questo file.
   ============================================================ */

window.RV_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDTQHCBDrxsBvbcEW2MrRDVgPKqA9KHQR0",
    authDomain: "revilaw-incarichi.firebaseapp.com",
    projectId: "revilaw-incarichi",
    storageBucket: "revilaw-incarichi.firebasestorage.app",
    messagingSenderId: "631931481265",
    appId: "1:631931481265:web:8e2d7321b924798aca8690"
};

/* Servizio email dedicato (vedi email-service/README.md).
   Con l'indirizzo compilato, le email di accesso partono dal server di
   posta dello studio (mittente Revilaw, link sul dominio nextgenerationbusiness.it).
   Con null, l'app usa l'invio standard di sistema. */
window.RV_EMAIL_SERVICE_URL = "https://revilaw-email.vercel.app/api/invia-email";

/* Invio delle "Comunicazioni" (mail composte nell'area riservata) tramite lo
   stesso servizio. Se lasciato null viene dedotto dall'URL qui sopra
   (.../invia-email -> .../invia-comunicazione). */
window.RV_COMUNICAZIONI_URL = "https://revilaw-email.vercel.app/api/invia-comunicazione";
