/* ============================================================
   Video del sito (allegati alle release GitHub)
   ------------------------------------------------------------
   I video non stanno nel repository: pesano troppo e sono allegati alle
   release. Il repository da solo quindi NON basta a rimettere in piedi il
   sito com'era: i lettori resterebbero vuoti.

   Qui se ne fa l'inventario e, se Drive e' configurato, si copiano su Drive
   quelli che ancora non ci sono. La copia e' INCREMENTALE: un video gia'
   presente (stesso nome, stessa dimensione) non viene riscaricato. Sono circa
   3 GB in tutto, quindi la prima notte e' lunga e le successive quasi a costo
   zero.
   ============================================================ */

const fs = require('fs');
const os = require('os');
const path = require('path');
const drive = require('./drive.cjs');

/* Tetto di traffico per singola esecuzione: evita che una notte storta si
   trascini dietro decine di GB. Quello che avanza viene ripreso la notte dopo
   e viene SEMPRE scritto nel report, mai lasciato cadere in silenzio. */
const TETTO_BYTE = 6 * 1024 * 1024 * 1024;

async function apiGitHub(percorso, tok) {
    const r = await fetch('https://api.github.com' + percorso, {
        headers: {
            Authorization: 'Bearer ' + tok,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'ngb-backup'
        }
    });
    if (!r.ok) throw new Error('GitHub API HTTP ' + r.status + ' su ' + percorso + ': ' + (await r.text()).slice(0, 300));
    return r.json();
}

/* Inventario di tutti gli allegati, raggruppati per tag di release. */
async function inventario(deposito, tok) {
    const release = [];
    let pagina = 1;
    for (;;) {
        const lotto = await apiGitHub('/repos/' + deposito + '/releases?per_page=100&page=' + pagina, tok);
        if (!lotto.length) break;
        release.push(...lotto);
        if (lotto.length < 100) break;
        pagina++;
    }
    const voci = release.map(r => ({
        tag: r.tag_name,
        allegati: (r.assets || []).map(a => ({
            nome: a.name,
            dimensione: a.size,
            url: a.url,
            aggiornato: a.updated_at
        }))
    })).filter(r => r.allegati.length);

    const totaleFile = voci.reduce((n, r) => n + r.allegati.length, 0);
    const totaleByte = voci.reduce((n, r) => n + r.allegati.reduce((m, a) => m + a.dimensione, 0), 0);
    return { release: voci, totaleFile, totaleByte };
}

async function scarica(url, tok, destinazione) {
    const r = await fetch(url, {
        headers: {
            Authorization: 'Bearer ' + tok,
            Accept: 'application/octet-stream',
            'User-Agent': 'ngb-backup'
        },
        redirect: 'follow'
    });
    if (!r.ok) throw new Error('scaricamento HTTP ' + r.status);
    const buffer = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(destinazione, buffer);
    return buffer.length;
}

/* Copia su Drive gli allegati mancanti. Restituisce il conteggio per il report. */
async function sincronizzaSuDrive(inv, tokGitHub, tokDrive, idCartellaMedia, registro) {
    const esito = { presenti: 0, copiati: 0, falliti: 0, rimandati: 0, byteCopiati: 0 };
    let consumato = 0;
    const temporanea = fs.mkdtempSync(path.join(os.tmpdir(), 'ngb-media-'));

    for (const rel of inv.release) {
        const idTag = await drive.trovaOCreaCartella(tokDrive, rel.tag, idCartellaMedia);
        const giaLi = new Map((await drive.elenca(tokDrive, idTag)).map(f => [f.name, Number(f.size || 0)]));

        for (const allegato of rel.allegati) {
            if (giaLi.get(allegato.nome) === allegato.dimensione) { esito.presenti++; continue; }
            if (consumato + allegato.dimensione > TETTO_BYTE) { esito.rimandati++; continue; }

            const locale = path.join(temporanea, allegato.nome);
            try {
                const byte = await scarica(allegato.url, tokGitHub, locale);
                await drive.caricaFile(tokDrive, locale, idTag, allegato.nome);
                consumato += byte;
                esito.copiati++;
                esito.byteCopiati += byte;
            } catch (e) {
                esito.falliti++;
                registro('    video ' + rel.tag + '/' + allegato.nome + ': ' + (e.message || e));
            } finally {
                if (fs.existsSync(locale)) fs.unlinkSync(locale);
            }
        }
    }
    fs.rmSync(temporanea, { recursive: true, force: true });
    return esito;
}

module.exports = { TETTO_BYTE, inventario, sincronizzaSuDrive };
