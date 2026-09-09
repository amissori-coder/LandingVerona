/* ============================================================
   A che ritmo parte un invio programmato
   ------------------------------------------------------------
   L'invio a mano lo guida il browser: si preme Invia, la finestra
   resta aperta e i lotti partono uno dietro l'altro finche' l'elenco
   non finisce. Va bene per duecento aziende, non per cinquemila:
   nessuno tiene una finestra aperta per otto ore, e il tetto orario
   per utente si esaurisce dopo il primo quarto d'ora.

   Un invio PROGRAMMATO e' un'altra cosa: lo porta avanti il servizio,
   da solo, un pezzo per volta, e la misura di quel pezzo e' il RITMO.
   Il ritmo non e' una preferenza estetica, e' l'unica cosa che decide
   se l'invio arriva o se lo ferma qualcun altro:

     - sulla PEC il gestore misura il ritmo con cui gli arriva la
       posta, e una raffica da un mittente che non conosce e' il
       profilo che fa scattare l'antiabuso. E ogni PEC si paga: un
       errore che parte in raffica costa davvero;
     - sull'email ordinaria il freno serve a proteggere la
       reputazione del dominio e l'account Brevo, che regge anche le
       email con cui le persone entrano nell'area riservata. Una
       sospensione per un invio a freddo le fermerebbe tutte.

   PERCHE' "QUANTI OGNI QUANTO" E NON "QUANTI ALL'ORA". Perche' i due
   canali non hanno lo stesso passo naturale: sulla PEC il ritmo utile
   e' 250 ogni novanta minuti, sull'ordinaria mille ogni ora. Ridurre
   tutto a un numero orario avrebbe costretto a mentire su uno dei
   due.

   Il tetto orario per utente (invito_throttle in lib/aziende-invito.js)
   resta dov'e' e continua a valere per l'invio a mano: e' un freno
   contro l'invio partito per sbaglio da una finestra aperta. Sul
   programmato non c'entra - li' il freno E' il ritmo, scritto sulla
   programmazione e verificato a ogni giro.
   ============================================================ */

/* I ritmi che l'area riservata propone. Il primo di ogni canale e' il
   predefinito, ed e' quello chiesto: 250 PEC ogni novanta minuti,
   1.000 email ogni ora. Gli altri servono a chi vuole andare piano -
   un elenco nuovo, un dominio appena scaldato, un testo su cui non si
   e' ancora sicuri.

   Questo elenco deve restare uguale a quello dell'area riservata
   (area-riservata/app.js, costante INV_RITMI): il servizio decide,
   li' si decide solo come scriverlo a video. */
const RITMI = {
    pec: [
        { quanti: 250, ogniMin: 90 },
        { quanti: 250, ogniMin: 60 },
        { quanti: 100, ogniMin: 60 },
        { quanti: 50, ogniMin: 60 }
    ],
    email: [
        { quanti: 1000, ogniMin: 60 },
        { quanti: 500, ogniMin: 60 },
        { quanti: 250, ogniMin: 60 },
        { quanti: 100, ogniMin: 60 }
    ]
};

/* I limiti entro cui un ritmo e' accettato. Non sono lo stesso numero
   dei ritmi proposti: l'area riservata puo' invecchiare in cache e
   mandare un ritmo che qui non c'e' piu', e rispondere "non
   riconosciuto" a una richiesta legittima e' peggio che accettarla
   dentro dei limiti. Fuori dai limiti invece si taglia, perche' un
   ritmo assurdo (centomila PEC al minuto) non e' una preferenza, e'
   un errore di chi chiama. */
const MAX_QUANTI = {
    pec: Number(process.env.PEC_MAX_RITMO) || 500,
    email: Number(process.env.MKT_MAX_RITMO) || 2000
};
const MIN_OGNI_MIN = 15;            // sotto il quarto d'ora il cron non ci arriva
const MAX_OGNI_MIN = 24 * 60;       // oltre il giorno non e' piu' un ritmo, e' un calendario

/* Ogni quanti minuti gira il lavoro automatico. Serve a due conti:
   quanti messaggi far partire in UN giro (perche' il ritmo si spalmi
   invece di uscire tutto nei primi quattro minuti della finestra) e
   quanto tempo si aspetta chi guarda l'avanzamento. Deve corrispondere
   alla pianificazione scritta in vercel.json: sono due numeri che si
   muovono insieme. */
function passoCronMin() {
    const n = Number(process.env.INVITI_PASSO_CRON_MIN);
    return (Number.isFinite(n) && n >= 1) ? Math.min(n, 60) : 10;
}

function canaleValido(c) { return String(c) === 'pec' ? 'pec' : 'email'; }

function predefinito(canale) {
    const c = canaleValido(canale);
    return { quanti: RITMI[c][0].quanti, ogniMin: RITMI[c][0].ogniMin };
}

/* Da quello che arriva dalla rete a un ritmo che si puo' usare.
   Si taglia, non si rifiuta: vedi il commento sui limiti qui sopra. */
function normalizza(canale, ritmo) {
    const c = canaleValido(canale);
    const q = Math.round(Number(ritmo && ritmo.quanti));
    const m = Math.round(Number(ritmo && ritmo.ogniMin));
    if (!Number.isFinite(q) || !Number.isFinite(m) || q < 1 || m < 1) return predefinito(c);
    return {
        quanti: Math.max(1, Math.min(q, MAX_QUANTI[c])),
        ogniMin: Math.max(MIN_OGNI_MIN, Math.min(m, MAX_OGNI_MIN))
    };
}

/* Quanti messaggi al massimo in UN giro del lavoro automatico.
   Senza questo, una finestra da mille email uscirebbe tutta nei primi
   minuti e poi ci sarebbero cinquantacinque minuti di silenzio: il
   conto orario tornerebbe, ma il profilo di invio sarebbe esattamente
   quello che i filtri antispam cercano.

   Il fattore di RECUPERO serve al caso opposto: se un giro salta (il
   servizio non risponde, la funzione muore), senza margine la finestra
   chiuderebbe con meno messaggi di quanti ne erano stati promessi. Con
   una volta e mezza la quota, i giri seguenti recuperano il buco senza
   trasformarsi in una raffica. */
const RECUPERO = 1.5;
function perGiro(ritmo, passoMin) {
    const passo = Number(passoMin) || passoCronMin();
    const r = ritmo || {};
    const quanti = Math.max(1, Number(r.quanti) || 1);
    const ogni = Math.max(1, Number(r.ogniMin) || 60);
    const passiPerFinestra = Math.max(1, Math.floor(ogni / passo));
    return Math.max(1, Math.ceil(quanti / passiPerFinestra * RECUPERO));
}

/* Come si dice un ritmo in una frase. Sta qui e non nell'area riservata
   perche' lo stesso testo serve anche nei messaggi del servizio, e due
   modi di scrivere lo stesso ritmo si scollano al primo ritocco. */
function descrizione(canale, ritmo) {
    const r = normalizza(canale, ritmo);
    const cosa = canaleValido(canale) === 'pec' ? 'PEC' : 'email';
    const quando = r.ogniMin === 60 ? 'ogni ora'
        : (r.ogniMin === 1440 ? 'al giorno'
            : ('ogni ' + r.ogniMin + ' minuti'));
    return r.quanti.toLocaleString('it-IT') + ' ' + cosa + ' ' + quando;
}

module.exports = {
    RITMI, MIN_OGNI_MIN, MAX_OGNI_MIN, MAX_QUANTI,
    passoCronMin, predefinito, normalizza, perGiro, descrizione, canaleValido
};
