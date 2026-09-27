/* ANTEPRIMA - dove trovare il motore (window.NGBA del guscio) da dentro una pagina */
export function motore() {
    try { if (window.parent && window.parent !== window && window.parent.NGBA) return window.parent.NGBA; } catch (e) { /* guscio di un'altra origine */ }
    if (window.NGBA) return window.NGBA;
    throw new Error('Anteprima: questa pagina va aperta dal guscio dell\'anteprima (index.html).');
}
export const dispositivo = () => window.NGB_ANTEPRIMA_DISPOSITIVO || 'questo';
