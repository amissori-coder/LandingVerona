/* ============================================================
   Caricamento su Google Drive (cartella Backup-NGB)
   ------------------------------------------------------------
   La cartella di destinazione sta su un Drive condiviso, quindi tutte le
   chiamate passano supportsAllDrives: senza, l'API fa finta che la cartella
   non esista. Il service account deve essere membro del Drive condiviso con
   permesso di scrittura (Editor).

   I file oltre i 5 MB salgono con l'upload ripartibile, a blocchi, cosi' un
   video da centinaia di MB non viene tenuto tutto in memoria.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const AMBITI = ['https://www.googleapis.com/auth/drive'];
const SOGLIA_RIPARTIBILE = 5 * 1024 * 1024;
const COMUNI = 'supportsAllDrives=true&includeItemsFromAllDrives=true';

function scappaApici(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

async function conRiprova(operazione, tentativi = 4) {
    let ultimo;
    for (let i = 0; i < tentativi; i++) {
        try { return await operazione(); } catch (e) {
            ultimo = e;
            if (i < tentativi - 1) await new Promise(r => setTimeout(r, 2000 * Math.pow(2, i)));
        }
    }
    throw ultimo;
}

/* Elenca i figli diretti di una cartella. */
async function elenca(tok, idCartella) {
    const trovati = [];
    let pagina = '';
    do {
        const q = encodeURIComponent("'" + scappaApici(idCartella) + "' in parents and trashed = false");
        const url = 'https://www.googleapis.com/drive/v3/files?q=' + q + '&' + COMUNI +
            '&fields=nextPageToken,files(id,name,size,mimeType)&pageSize=1000' +
            (pagina ? '&pageToken=' + encodeURIComponent(pagina) : '');
        const r = await conRiprova(() => fetch(url, { headers: { Authorization: 'Bearer ' + tok } }));
        if (!r.ok) throw new Error('Drive elenco HTTP ' + r.status + ': ' + (await r.text()).slice(0, 300));
        const dati = await r.json();
        trovati.push(...(dati.files || []));
        pagina = dati.nextPageToken || '';
    } while (pagina);
    return trovati;
}

/* Cerca una sottocartella per nome; se non c'e' la crea. */
async function trovaOCreaCartella(tok, nome, idPadre) {
    const q = encodeURIComponent(
        "'" + scappaApici(idPadre) + "' in parents and trashed = false and " +
        "mimeType = 'application/vnd.google-apps.folder' and name = '" + scappaApici(nome) + "'"
    );
    const url = 'https://www.googleapis.com/drive/v3/files?q=' + q + '&' + COMUNI + '&fields=files(id,name)';
    const r = await conRiprova(() => fetch(url, { headers: { Authorization: 'Bearer ' + tok } }));
    if (!r.ok) throw new Error('Drive ricerca cartella HTTP ' + r.status + ': ' + (await r.text()).slice(0, 300));
    const dati = await r.json();
    if (dati.files && dati.files.length) return dati.files[0].id;

    const creazione = await conRiprova(() => fetch('https://www.googleapis.com/drive/v3/files?' + COMUNI + '&fields=id', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [idPadre] })
    }));
    if (!creazione.ok) throw new Error('Drive creazione cartella HTTP ' + creazione.status + ': ' + (await creazione.text()).slice(0, 300));
    return (await creazione.json()).id;
}

async function caricaPiccolo(tok, percorso, nome, idCartella) {
    const contenuto = fs.readFileSync(percorso);
    const confine = 'ngb' + Date.now().toString(36);
    const testa = Buffer.from(
        '--' + confine + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify({ name: nome, parents: [idCartella] }) +
        '\r\n--' + confine + '\r\nContent-Type: application/octet-stream\r\n\r\n'
    );
    const coda = Buffer.from('\r\n--' + confine + '--');
    const r = await conRiprova(() => fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&' + COMUNI + '&fields=id',
        {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'multipart/related; boundary=' + confine },
            body: Buffer.concat([testa, contenuto, coda])
        }
    ));
    if (!r.ok) throw new Error('Drive upload HTTP ' + r.status + ': ' + (await r.text()).slice(0, 300));
    return (await r.json()).id;
}

async function caricaGrande(tok, percorso, nome, idCartella) {
    const dimensione = fs.statSync(percorso).size;
    const avvio = await conRiprova(() => fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&' + COMUNI + '&fields=id',
        {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + tok,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': 'application/octet-stream',
                'X-Upload-Content-Length': String(dimensione)
            },
            body: JSON.stringify({ name: nome, parents: [idCartella] })
        }
    ));
    if (!avvio.ok) throw new Error('Drive avvio upload HTTP ' + avvio.status + ': ' + (await avvio.text()).slice(0, 300));
    const sessione = avvio.headers.get('location');
    if (!sessione) throw new Error('Drive: sessione di upload non restituita per ' + nome);

    const invio = await fetch(sessione, {
        method: 'PUT',
        headers: { 'Content-Length': String(dimensione), 'Content-Type': 'application/octet-stream' },
        body: fs.createReadStream(percorso),
        duplex: 'half'
    });
    if (!invio.ok) throw new Error('Drive upload HTTP ' + invio.status + ': ' + (await invio.text()).slice(0, 300));
    return (await invio.json()).id;
}

async function caricaFile(tok, percorso, idCartella, nome) {
    const etichetta = nome || path.basename(percorso);
    const dimensione = fs.statSync(percorso).size;
    return dimensione > SOGLIA_RIPARTIBILE
        ? caricaGrande(tok, percorso, etichetta, idCartella)
        : caricaPiccolo(tok, percorso, etichetta, idCartella);
}

module.exports = { AMBITI, elenca, trovaOCreaCartella, caricaFile };
