/* ============================================================
   Configurazione Firebase: accessi, regole, indici
   ------------------------------------------------------------
   Sono le cose che NON stanno nei dati ma senza le quali, dopo un
   ripristino, il sito non funziona e nessuno riesce ad entrare:

     - gli account di Authentication, con i loro hash di password
     - i parametri di cifratura del progetto (senza quelli le password
       vanno tutte reimpostate a mano, una per utente)
     - le regole di sicurezza di Firestore
     - gli indici e gli override dei campi
   ============================================================ */

const admin = require('firebase-admin');
const { leggiJson } = require('./credenziali.cjs');

const AMBITI = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/firebase'
];

/* --- account di accesso, nel formato che "firebase auth:import" sa rileggere --- */
async function esportaUtenti() {
    const utenti = [];
    let pagina;
    do {
        const risultato = await admin.auth().listUsers(1000, pagina);
        for (const u of risultato.users) {
            const voce = {
                localId: u.uid,
                email: u.email || undefined,
                emailVerified: !!u.emailVerified,
                displayName: u.displayName || undefined,
                photoUrl: u.photoURL || undefined,
                phoneNumber: u.phoneNumber || undefined,
                disabled: !!u.disabled,
                passwordHash: u.passwordHash || undefined,
                salt: u.passwordSalt || undefined,
                createdAt: u.metadata && u.metadata.creationTime
                    ? String(new Date(u.metadata.creationTime).getTime()) : undefined,
                lastSignedInAt: u.metadata && u.metadata.lastSignInTime
                    ? String(new Date(u.metadata.lastSignInTime).getTime()) : undefined
            };
            if (u.customClaims && Object.keys(u.customClaims).length) {
                voce.customAttributes = JSON.stringify(u.customClaims);
            }
            if (u.providerData && u.providerData.length) {
                voce.providerUserInfo = u.providerData.map(p => ({
                    providerId: p.providerId,
                    rawId: p.uid,
                    email: p.email || undefined,
                    displayName: p.displayName || undefined,
                    photoUrl: p.photoURL || undefined
                }));
            }
            utenti.push(voce);
        }
        pagina = risultato.pageToken;
    } while (pagina);

    const conPassword = utenti.filter(u => u.passwordHash).length;
    return { contenuto: { users: utenti }, totale: utenti.length, conPassword };
}

/* --- parametri di cifratura del progetto ---
   Con questi, reimportando gli utenti le password restano quelle che gia'
   conoscono. Senza, gli account si ricreano ma va fatto partire un reset
   password per ciascuno. */
async function esportaParametriHash(tok, progetto) {
    const cfg = await leggiJson(tok, 'https://identitytoolkit.googleapis.com/admin/v2/projects/' + progetto + '/config');
    const h = cfg && cfg.signIn && cfg.signIn.hashConfig;
    if (!h || !h.signerKey) return null;
    const comando = [
        'firebase auth:import auth-users.json',
        '--hash-algo=' + (h.algorithm || 'SCRYPT'),
        '--hash-key=' + h.signerKey,
        '--salt-separator=' + (h.saltSeparator || ''),
        '--rounds=' + (h.rounds != null ? h.rounds : 8),
        '--mem-cost=' + (h.memoryCost != null ? h.memoryCost : 14),
        '--project=' + progetto
    ].join(' ');
    const testo = [
        'PARAMETRI DI CIFRATURA DELLE PASSWORD - progetto ' + progetto,
        '='.repeat(62),
        '',
        'Comando pronto: reimporta i 25 account MANTENENDO le password attuali.',
        'Va lanciato dalla cartella del backup, dove sta auth-users.json.',
        '',
        comando,
        '',
        'Serve la Firebase CLI (npm install -g firebase-tools) e un accesso',
        'con i permessi sul progetto (firebase login).',
        ''
    ].join('\n');
    return { testo, comando, algoritmo: h.algorithm || 'SCRYPT' };
}

/* --- regole di sicurezza di Firestore --- */
async function esportaRegole(tok, progetto) {
    const rilasci = await leggiJson(tok, 'https://firebaserules.googleapis.com/v1/projects/' + progetto + '/releases');
    if (!rilasci || !rilasci.releases || !rilasci.releases.length) return { file: [], rilasci: [] };
    const file = [];
    const elenco = [];
    for (const r of rilasci.releases) {
        const nomeRilascio = String(r.name || '').split('/').pop();   // es. cloud.firestore
        elenco.push(nomeRilascio);
        if (!r.rulesetName) continue;
        const ruleset = await leggiJson(tok, 'https://firebaserules.googleapis.com/v1/' + r.rulesetName);
        const sorgenti = (ruleset && ruleset.source && ruleset.source.files) || [];
        for (const f of sorgenti) {
            file.push({
                nomeFile: 'regole-' + nomeRilascio + '-' + (f.name || 'firestore.rules'),
                contenuto: f.content || '',
                rilascio: nomeRilascio
            });
        }
    }
    return { file, rilasci: elenco, grezzo: rilasci };
}

/* --- indici e override dei campi --- */
async function esportaIndici(tok, progetto) {
    const base = 'https://firestore.googleapis.com/v1/projects/' + progetto + '/databases/(default)/collectionGroups/-';
    const indici = await leggiJson(tok, base + '/indexes');
    const campi = await leggiJson(tok, base + '/fields?filter=' + encodeURIComponent('indexConfig.usesAncestorConfig=false'));
    return {
        contenuto: {
            progetto,
            esportato: new Date().toISOString(),
            indici: (indici && indici.indexes) || [],
            campi: (campi && campi.fields) || []
        },
        quantiIndici: ((indici && indici.indexes) || []).length
    };
}

module.exports = { AMBITI, esportaUtenti, esportaParametriHash, esportaRegole, esportaIndici };
