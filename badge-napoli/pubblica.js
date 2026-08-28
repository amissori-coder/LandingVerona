/* ============================================================
   PUBBLICA - manda le agende su Firestore
   ------------------------------------------------------------
   Legge out/agende.json (prodotto da prepara.js) e scrive la
   collezione "agendaNapoli", una scheda per codice.

       node pubblica.js --secco     mostra cosa farebbe, senza scrivere
       node pubblica.js             scrive per davvero

   CREDENZIALI, in ordine di precedenza:
     1. la variabile d'ambiente FIREBASE_SERVICE_ACCOUNT
        (lo stesso contenuto usato dal servizio email: JSON o base64)
     2. un file serviceAccount.json in questa cartella
   Il file e' escluso dal repo: e' una chiave, non va pubblicata.

   PERCHE' NON C'E' UNA FUNZIONE SUL SERVIZIO
   Quando questo script e' nato, il servizio email era fermo a dodici
   funzioni - il tetto del piano Hobby - e la successiva bloccava la
   pubblicazione del deploy. Cosi' le agende arrivano su Firestore da
   qui, con l'account di servizio, senza aggiungere nulla al conteggio.
   Sul piano Pro il tetto non c'e' piu': resta un limite vero, che
   questo script vuole un computer acceso e una persona che lo lanci.

   LE REGOLE DI FIRESTORE VANNO MESSE A MANO, UNA VOLTA SOLA
   Vedi README.md. Senza quelle regole la pagina degli ospiti non
   legge niente, e con le regole sbagliate legge troppo.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const COLLEZIONE = 'agendaNapoli';
const FILE_AGENDE = path.join(__dirname, 'out', 'agende.json');
const FILE_CHIAVE = path.join(__dirname, 'serviceAccount.json');

const secco = process.argv.includes('--secco');

function leggiCredenziali() {
    const grezzo = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();

    if (grezzo) {
        let testo = grezzo;
        if (testo[0] !== '{') {
            // il valore puo' essere in base64, come sul servizio email
            try {
                const decodificato = Buffer.from(testo, 'base64').toString('utf8').trim();
                if (decodificato[0] === '{') testo = decodificato;
            } catch (e) { /* lo segnala JSON.parse qui sotto */ }
        }
        try { return JSON.parse(testo); }
        catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT non e\' un JSON valido.'); }
    }

    if (fs.existsSync(FILE_CHIAVE)) {
        try { return JSON.parse(fs.readFileSync(FILE_CHIAVE, 'utf8')); }
        catch (e) { throw new Error('serviceAccount.json non e\' un JSON valido.'); }
    }

    throw new Error(
        'Credenziali mancanti. Imposta FIREBASE_SERVICE_ACCOUNT oppure metti serviceAccount.json in questa cartella.'
    );
}

/* Controllo prima di scrivere: nelle agende non devono comparire
   recapiti. Se un domani qualcuno allarga la whitelist in prepara.js
   senza pensarci, e' qui che ce ne accorgiamo, prima di pubblicare. */
const CAMPI_AMMESSI = ['nome', 'azienda', 'ruolo', 'tavolo', 'incontri'];
const CAMPI_AMMESSI_INCONTRO = ['ora', 'tavolo', 'chi', 'azienda', 'ruolo', 'tema'];

function controlla(agende) {
    const problemi = [];

    for (const [codice, scheda] of Object.entries(agende)) {
        if (!/^[a-hj-km-np-z2-9]{8,14}$/.test(codice)) {
            problemi.push('codice fuori formato: ' + codice);
        }
        for (const campo of Object.keys(scheda)) {
            if (!CAMPI_AMMESSI.includes(campo)) {
                problemi.push(codice + ': campo non previsto "' + campo + '"');
            }
        }
        if (!scheda.nome) problemi.push(codice + ': manca il nome');

        for (const inc of (scheda.incontri || [])) {
            for (const campo of Object.keys(inc)) {
                if (!CAMPI_AMMESSI_INCONTRO.includes(campo)) {
                    problemi.push(codice + ': incontro con campo non previsto "' + campo + '"');
                }
            }
        }

        // rete di sicurezza sui contenuti, non solo sui nomi dei campi
        const tutto = JSON.stringify(scheda);
        if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(tutto)) problemi.push(codice + ': contiene un indirizzo email');
        if (/(\+39|\b3\d{2})[\s.-]?\d{6,}/.test(tutto)) problemi.push(codice + ': contiene un numero di telefono');
    }

    return problemi;
}

async function principale() {
    if (!fs.existsSync(FILE_AGENDE)) {
        console.error('Non trovo out/agende.json. Lancia prima: node prepara.js partecipanti.json');
        process.exit(1);
    }

    const agende = JSON.parse(fs.readFileSync(FILE_AGENDE, 'utf8'));
    const codici = Object.keys(agende);

    if (!codici.length) {
        console.error('out/agende.json e\' vuoto: non c\'e\' niente da pubblicare.');
        process.exit(1);
    }

    const problemi = controlla(agende);
    if (problemi.length) {
        console.error('');
        console.error('Non pubblico: le agende non passano i controlli.');
        problemi.slice(0, 20).forEach(p => console.error('  - ' + p));
        if (problemi.length > 20) console.error('  ... e altri ' + (problemi.length - 20));
        console.error('');
        process.exit(1);
    }

    const conIncontri = codici.filter(c => (agende[c].incontri || []).length).length;

    console.log('');
    console.log('Collezione       ' + COLLEZIONE);
    console.log('Schede           ' + codici.length);
    console.log('Con appuntamenti ' + conIncontri);
    console.log('Controlli        superati (nessun recapito nelle agende)');

    if (secco) {
        console.log('');
        console.log('Prova a vuoto: non ho scritto niente.');
        console.log('Esempio della prima scheda:');
        console.log('  ' + codici[0] + ' -> ' + JSON.stringify(agende[codici[0]]).slice(0, 220));
        console.log('');
        console.log('Per scrivere davvero: node pubblica.js');
        console.log('');
        return;
    }

    const credenziali = leggiCredenziali();
    admin.initializeApp({ credential: admin.credential.cert(credenziali) });
    const db = admin.firestore();

    // Firestore accetta al massimo 500 operazioni per lotto
    const LOTTO = 400;
    let scritte = 0;

    for (let i = 0; i < codici.length; i += LOTTO) {
        const gruppo = codici.slice(i, i + LOTTO);
        const lotto = db.batch();
        for (const codice of gruppo) {
            lotto.set(
                db.collection(COLLEZIONE).doc(codice),
                Object.assign({}, agende[codice], {
                    aggiornato: admin.firestore.FieldValue.serverTimestamp()
                }),
                { merge: false }   // la scheda e' sempre quella completa, niente residui di lanci precedenti
            );
        }
        await lotto.commit();
        scritte += gruppo.length;
        console.log('  scritte ' + scritte + '/' + codici.length);
    }

    /* Schede rimaste su Firestore e non piu' presenti nel file: le segnalo
       ma non le cancello. Una cancellazione automatica la sera prima
       dell'evento e' il tipo di comodita' che si rimpiange. */
    const presenti = await db.collection(COLLEZIONE).select().get();
    const avanzi = presenti.docs.map(d => d.id).filter(id => !agende[id]);

    console.log('');
    console.log('Pubblicate ' + scritte + ' agende.');
    if (avanzi.length) {
        console.log('');
        console.log('Attenzione: su Firestore ci sono ' + avanzi.length + ' schede che non stanno piu' + ' nel file.');
        console.log('Sono di persone rimosse dall\'elenco. Non le ho toccate: se vanno via, cancellale');
        console.log('dalla console di Firebase. Codici: ' + avanzi.slice(0, 10).join(', ') + (avanzi.length > 10 ? ' ...' : ''));
    }
    console.log('');
    console.log('Prova ora un indirizzo vero: https://nextgenerationbusiness.it/n26/#' + codici[0]);
    console.log('');
}

principale().catch(e => {
    console.error('Errore: ' + (e && e.message ? e.message : e));
    process.exit(1);
});
