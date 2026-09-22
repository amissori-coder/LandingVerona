/* ============================================================
   LA CHIAVE DELL'AZIENDA
   ------------------------------------------------------------
   Il sistema e' nato con la PERSONA come unita': una scheda per
   iscritto, un invito per scheda, una prenotazione per scheda.
   L'azienda non c'e' mai stata, e quando serviva la si indovinava
   al volo confrontando la ragione sociale e il dominio della mail.
   Con gli incontri B2B per azienda quell'indovinello non basta
   piu': l'invito, il collegamento e la prenotazione sono
   dell'IMPRESA, e se la chiave cambiasse fra un giorno e l'altro
   cambierebbe anche di chi e' la prenotazione.

   Quindi le regole stanno qui, in un posto solo, e chi invita le
   usa UNA VOLTA per congelare la chiave sulla scheda
   (`b2bAzienda`). Da li' in avanti nessuno ricalcola piu' niente:
   il ripiego serve solo a LEGGERE e a raggruppare cio' che e'
   stato scritto prima che queste righe esistessero.

   L'ORDINE DELLE CHIAVI, dalla piu' solida alla piu' incerta:
     1. `p:<partita iva>` - e' un numero che lo Stato assegna a
        un'impresa sola. Arriva dall'elenco importato (colonna
        "P.IVA", che finisce in `extra`);
     2. `n:<ragione sociale ridotta all'osso>` - "Alfa S.r.l." e
        "ALFA SPA" diventano tutte e due "alfa";
     3. `d:<dominio della mail>` - chi scrive da @alfa.it e' di
        Alfa anche se il campo azienda e' in bianco. I domini
        pubblici (gmail, libero, aruba...) non dicono niente;
     4. `doc:<id della scheda>` - nessuno dei tre: allora quella
        persona vale come un'azienda a se'. E' la riga piu'
        importante del file: senza, tutti i non identificabili
        finirebbero in un'azienda sola, con UN collegamento
        condiviso fra imprese diverse, ognuna in grado di
        cambiare la prenotazione delle altre.

   La stessa regola vive anche in area-riservata/app.js
   (`raggruppaPerAzienda`, che fa i gruppi a video prima di
   invitare): quella e' la copia del browser, e le due devono
   dire la stessa cosa - come gia' succede per le etichette dei
   tavoli in temi-b2b.js.
   ============================================================ */
'use strict';
const crypto = require('crypto');

/* I domini di posta pubblici: non dicono niente sull'azienda. */
const DOMINI_PUBBLICI = [
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.it', 'outlook.com', 'outlook.it',
    'live.it', 'live.com', 'msn.com', 'yahoo.it', 'yahoo.com', 'libero.it', 'virgilio.it',
    'alice.it', 'tin.it', 'tiscali.it', 'inwind.it', 'iol.it', 'email.it', 'fastwebnet.it',
    'icloud.com', 'me.com', 'mac.com', 'aruba.it', 'pec.it', 'legalmail.it', 'poste.it',
    'protonmail.com', 'proton.me', 'gmx.com', 'katamail.com', 'supereva.it', 'teletu.it',
    'vodafone.it', 'wind.it', 'tim.it', 'windtre.it', 'blu.it'
];
/* Le forme giuridiche: si tolgono dal confronto perche' la stessa impresa
   compare ora con la sigla, ora senza, ora con i punti. Restano fuori le
   parole che potrebbero essere il nome vero ("studio", "impresa", "gruppo"):
   toglierle farebbe di "Studio Rossi" e "Studio Bianchi" la stessa cosa. */
const FORME_GIURIDICHE = /\b(s\s*r\s*l\s*s?|s\s*p\s*a|s\s*a\s*p\s*a|s\s*a\s*s|s\s*n\s*c|s\s*c\s*a\s*r\s*l|s\s*s|societa|soc|cooperativa|coop|sarl|ltd|limited|llc|inc|gmbh|plc)\b/g;
function chiaveAzienda(s) {
    let t = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    t = t.replace(/&/g, ' e ');
    // i punti e gli apostrofi spariscono senza lasciare spazio: "s.r.l." -> "srl"
    t = t.replace(/[.'’"]/g, '');
    t = t.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    const senzaForma = t.replace(FORME_GIURIDICHE, ' ').replace(/\s+/g, ' ').trim();
    // se dell'azienda resta solo la forma giuridica, meglio la stringa intera
    return senzaForma || t;
}
function dominioMail(email) {
    const m = String(email || '').toLowerCase().trim().match(/@([a-z0-9.\-]+)$/);
    if (!m) return '';
    let d = m[1];
    if (DOMINI_PUBBLICI.indexOf(d) >= 0) return '';
    /* Le caselle di posta certificata dell'azienda portano lo stesso nome
       (pec.alfa.it e alfa.it sono la stessa impresa). Il prefisso si toglie
       solo se quel che resta e' ancora un dominio: da "pec.it" resterebbe
       "it", e allora mezzo mondo diventerebbe un'azienda sola. */
    const senzaPrefisso = d.replace(/^(pec|mail|posta)\./, '');
    if (senzaPrefisso !== d && senzaPrefisso.indexOf('.') > 0) d = senzaPrefisso;
    return DOMINI_PUBBLICI.indexOf(d) >= 0 ? '' : d;
}

/* La partita IVA, ridotta alle sole cifre. Si accetta il prefisso "IT" e
   qualunque punteggiatura in mezzo; quello che non sono undici cifre non e'
   una partita IVA e si butta, perche' una chiave sbagliata qui unisce due
   imprese diverse sotto la stessa prenotazione. */
function normalizzaPiva(v) {
    const cifre = String(v == null ? '' : v).replace(/[^0-9]/g, '');
    return cifre.length === 11 ? cifre : '';
}

/* La chiave di un'impresa a partire da cio' che si sa di una persona.
   `doc` e' l'identificativo della sua scheda: e' l'ultima spiaggia, e vuol
   dire "questa persona vale come un'azienda a se'". */
function chiaveAziendaDi(p) {
    const x = (p && typeof p === 'object') ? p : {};
    const piva = normalizzaPiva(x.piva);
    if (piva) return 'p:' + piva;
    const nome = chiaveAzienda(x.azienda);
    if (nome) return 'n:' + nome;
    const dom = dominioMail(x.email);
    if (dom) return 'd:' + dom;
    const doc = String(x.doc == null ? '' : x.doc).trim();
    return doc ? 'doc:' + doc : '';
}
function chiaveValida(chiave) {
    return /^(p:[0-9]{11}|n:.+|d:[a-z0-9.\-]+|doc:.+)$/.test(String(chiave || ''));
}

/* L'IDENTIFICATIVO dell'azienda per un evento: una stringa corta e innocua
   ("az" piu' sedici cifre esadecimali) che si puo' mettere in un indirizzo
   web e nel nome di un documento senza doverla ripulire.
   L'evento sta DENTRO l'impasto: la stessa impresa a due convegni ha due
   agende, due collegamenti e due prenotazioni, e il collegamento di Verona
   non apre quello di Napoli. */
function idAzienda(evento, chiave) {
    const ev = String(evento == null ? '' : evento).trim();
    const k = String(chiave == null ? '' : chiave).trim();
    if (!ev || !k) return '';
    return 'az' + crypto.createHash('sha256').update(ev + '|' + k).digest('hex').slice(0, 16);
}
function idAziendaValido(id) { return /^az[0-9a-f]{16}$/.test(String(id || '')); }

module.exports = {
    DOMINI_PUBBLICI, FORME_GIURIDICHE,
    chiaveAzienda, dominioMail, normalizzaPiva,
    chiaveAziendaDi, chiaveValida, idAzienda, idAziendaValido
};
