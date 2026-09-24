/* ============================================================
   ANTEPRIMA - al posto di https://www.gstatic.com/firebasejs/<v>/firebase-firestore.js
   Letture e scritture passano dalle regole di diretta/firebase/
   firestore.rules, riscritte in motore/cliente.js.
   ============================================================ */
import { motore } from './motore.js';

const M = () => motore().sdk.firestore;
const db = new WeakMap();
export function initializeFirestore(app) {
    if (!db.has(app)) db.set(app, M().creaDb(app));
    return db.get(app);
}
export function getFirestore(app) { return initializeFirestore(app); }
export function connectFirestoreEmulator() { /* nessun emulatore */ }
export function setLogLevel() { /* niente */ }
export function doc(d, ...segmenti) { return M().doc(d, ...segmenti); }
export function getDoc(ref) { return M().getDoc(ref); }
export function setDoc(ref, dati, opzioni) { return M().setDoc(ref, dati, opzioni); }
export function updateDoc(ref, dati) { return M().updateDoc(ref, dati); }
export function onSnapshot(ref, ...resto) { return M().onSnapshot(ref, ...resto); }
export function serverTimestamp() { return M().serverTimestamp(); }
export function increment(n) { return M().increment(n); }
export const Timestamp = { now: () => M().Timestamp.now(), fromMillis: ms => M().Timestamp.fromMillis(ms), fromDate: d => M().Timestamp.fromDate(d) };
