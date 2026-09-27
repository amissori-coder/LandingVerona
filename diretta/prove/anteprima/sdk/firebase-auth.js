/* ============================================================
   ANTEPRIMA - al posto di https://www.gstatic.com/firebasejs/<v>/firebase-auth.js
   Solo le funzioni che usano diretta.js e gestione.js; la sessione e'
   quella del "dispositivo" dell'anteprima su cui gira la pagina.
   ============================================================ */
import { motore } from './motore.js';

const M = () => motore().sdk.auth;
export const browserLocalPersistence = { type: 'LOCAL' };
export const indexedDBLocalPersistence = { type: 'LOCAL' };
export const browserSessionPersistence = { type: 'SESSION' };
export const inMemoryPersistence = { type: 'NONE' };

export function initializeAuth(app) { return app._auth || M().creaAuth(app); }
export function getAuth(app) { return initializeAuth(app); }
export function connectAuthEmulator() { /* nell'anteprima non c'e' nessun emulatore */ }
export function setPersistence() { return Promise.resolve(); }
export function onAuthStateChanged(auth, fn, errore) { return M().onAuthStateChanged(auth, fn, errore); }
export function signInWithCustomToken(auth, token) { return M().signInWithCustomToken(auth, token); }
export function signInWithEmailAndPassword(auth, email, password) { return M().signInWithEmailAndPassword(auth, email, password); }
export function signOut(auth) { return M().signOut(auth); }
export function verifyPasswordResetCode(auth, codice) { return M().verifyPasswordResetCode(auth, codice); }
export function confirmPasswordReset(auth, codice, password) { return M().confirmPasswordReset(auth, codice, password); }
