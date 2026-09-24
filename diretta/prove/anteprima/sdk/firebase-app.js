/* ============================================================
   ANTEPRIMA - al posto di https://www.gstatic.com/firebasejs/<v>/firebase-app.js
   Le pagine vere lo caricano con import() come l'originale; qui ogni
   funzione passa al motore dell'anteprima (motore/indice.js).
   ============================================================ */
import { motore, dispositivo } from './motore.js';

const app = new Map();
export const SDK_VERSION = '11.6.1-anteprima';
export function initializeApp(opzioni, nome) {
    const n = typeof nome === 'string' ? nome : '[DEFAULT]';
    if (!app.has(n)) app.set(n, motore().sdk.app.initializeApp(opzioni, n, window, dispositivo()));
    return app.get(n);
}
export function getApp(nome) { return app.get(nome || '[DEFAULT]'); }
export function getApps() { return Array.from(app.values()); }
