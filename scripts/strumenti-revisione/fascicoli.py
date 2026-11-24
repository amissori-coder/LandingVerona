#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fascicoli PDF degli Strumenti di revisione (area riservata, «Stampa tutto»).

Per ogni attivita' con la scheda aperta nel piano di un anno prepara un PDF unico:
la scheda dell'attivita' come la stampa il browser, poi tutti i suoi documenti
nell'ordine dell'indice della scheda (in evidenza, passaggio per passaggio,
documenti utili: la stessa regola di srDocumentiAttivita in app.js). Ogni pagina
porta in alto il titolo dell'attivita' e il numero del documento, in basso il
numero di pagina; i segnalibri del PDF portano a ciascun documento.

    python3 scripts/strumenti-revisione/fascicoli.py

Scrive area-riservata/strumenti-revisione/fascicoli/<anno>-<attivita>.pdf e, in
fondo a area-riservata/strumenti-revisione.js, la riga
window.RV_STRUMENTI_REVISIONE.fascicoli = {anno: {attivita: {file, pagine, kb}}}.
Va rilanciato ogni volta che cambiano schede o documenti (e poi cambiato
SR_DATI_VERSIONE in app.js). Serve: LibreOffice (soffice), Node con Playwright
e Chromium, pypdf, reportlab, openpyxl.
"""
import hashlib, io, json, os, re, shutil, socket, subprocess, sys, tempfile, time, urllib.request

import openpyxl
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.properties import PageSetupProperties
from pypdf import PdfReader, PdfWriter, Transformation
from reportlab.pdfgen import canvas

QUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(QUI, '..', '..'))
AREA = os.path.join(REPO, 'area-riservata')
DATI = os.path.join(AREA, 'strumenti-revisione.js')
USCITA_REL = 'strumenti-revisione/fascicoli'
USCITA = os.path.join(AREA, USCITA_REL)
PREFISSO = 'window.RV_STRUMENTI_REVISIONE = '
RIGA_FASCICOLI = 'window.RV_STRUMENTI_REVISIONE.fascicoli = '
TIPI = {'pdf': 'PDF', 'docx': 'Word', 'xlsx': 'Excel'}


def leggi_dati():
    js = open(DATI, encoding='utf-8').read()
    dati, _ = json.JSONDecoder().raw_decode(js, js.index(PREFISSO) + len(PREFISSO))
    return js, dati


def documenti_attivita(d, a):
    """I documenti dell'attivita' una volta sola, nell'ordine dell'indice della scheda."""
    out, visti = [], set()

    def metti(x, dove):
        for k in x.get('c') or ([x['a']] if x.get('a') else []):
            if k not in visti and k in d['allegati']:
                visti.add(k)
                out.append((k, dove))

    c = d['carte'].get(a['carta']) if a.get('carta') else None
    if c:
        for x in c.get('inEvidenza', []):
            metti(x, '')
        for b in c['blocchi']:
            for p in b['passi']:
                for x in p.get('doc', []):
                    metti(x, (b['titolo'] + ', ' if b.get('titolo') else '') + 'passaggio %s' % p['n'])
    for x in a.get('documentiUtili', []):
        metti(x, 'documenti utili')
    return out


def schede_aperte(d):
    """(anno, attivita') con la scheda aperta: righe del piano senza «scheda»."""
    out = []
    for anno in d['anni']:
        for r in anno['piano']:
            k = (str(anno['anno']), r['attivita'])
            if not r.get('scheda') and k not in out:
                out.append(k)
    return out


def prepara_xlsx(src, dst):
    """Copia del foglio pronta per la stampa: orizzontale, larga quanto la pagina,
    area di stampa fino all'ultima riga scritta, piu' qualche riga vuota da
    compilare a mano (le caselle di spunta non selezionate, False, non contano:
    nei report arrivano fino alla riga 220)."""
    wb = openpyxl.load_workbook(src)
    # i fogli nascosti (elenchi per i menu a tendina) LibreOffice li stamperebbe:
    # via, se nessuna formula li usa
    formule = ' '.join(str(c.value) for ws in wb.worksheets if ws.sheet_state == 'visible'
                       for r in ws.iter_rows() for c in r if isinstance(c.value, str) and c.value.startswith('='))
    for ws in list(wb.worksheets):
        if ws.sheet_state != 'visible' and ws.title not in formule:
            wb.remove(ws)
    for ws in wb.worksheets:
        if ws.sheet_state != 'visible':
            continue
        ultima_r = ultima_c = 0
        for riga in ws.iter_rows():
            for cella in riga:
                if cella.value not in (None, '', False):
                    ultima_r, ultima_c = max(ultima_r, cella.row), max(ultima_c, cella.column)
        if not ultima_r:
            continue
        ws.print_area = 'A1:%s%d' % (get_column_letter(ultima_c), ultima_r + 10)
        ws.page_setup.orientation = 'landscape'
        ws.page_setup.paperSize = ws.PAPERSIZE_A4
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
        ws.print_options.gridLines = True
    wb.save(dst)


def converti(file, cartella):
    """Word ed Excel in PDF con LibreOffice (un solo processo per tutti i file)."""
    if not file:
        return
    profilo = 'file://' + os.path.join(cartella, 'profilo-lo')
    subprocess.run(['soffice', '-env:UserInstallation=' + profilo, '--headless', '--convert-to', 'pdf',
                    '--outdir', cartella] + file, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=900)


def porta_libera():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def stampa_schede(schede, cartella):
    """Le schede come le stampa il browser (render-schede.cjs) da un server locale."""
    porta = porta_libera()
    server = subprocess.Popen([sys.executable, '-m', 'http.server', str(porta), '--bind', '127.0.0.1', '--directory', REPO],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        base = 'http://127.0.0.1:%d/area-riservata/' % porta
        for _ in range(50):
            try:
                urllib.request.urlopen(base, timeout=1)
                break
            except OSError:
                time.sleep(0.2)
        elenco = json.dumps([{'anno': a, 'id': i} for a, i in schede])
        subprocess.run(['node', os.path.join(QUI, 'render-schede.cjs'), base, cartella, elenco], check=True, timeout=600)
    finally:
        server.terminate()


def timbro(larghezza, altezza, sinistra, destra, piede):
    """Pagina trasparente con le scritte di testata e di piede."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(larghezza, altezza))
    c.setFont('Helvetica', 7)
    c.setFillColorRGB(0.33, 0.37, 0.43)
    c.drawString(28, altezza - 16, sinistra)
    c.drawRightString(larghezza - 28, altezza - 16, destra)
    c.drawCentredString(larghezza / 2, 12, piede)
    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def accorcia(testo, n):
    return testo if len(testo) <= n else testo[:n - 1].rstrip() + '…'


def main():
    js, d = leggi_dati()
    schede = schede_aperte(d)
    os.makedirs(USCITA, exist_ok=True)
    lavoro = tempfile.mkdtemp(prefix='fascicoli-')
    try:
        stampa_schede(schede, lavoro)
        # tutti i documenti da convertire, una volta sola
        serve = {}
        for anno, att in schede:
            for k, _ in documenti_attivita(d, d['attivita'][att]):
                serve[k] = d['allegati'][k]
        da_convertire = []
        for k, al in serve.items():
            src = os.path.join(AREA, al['file'])
            if al['tipo'] == 'pdf':
                continue
            dst = os.path.join(lavoro, k + '.' + al['tipo'])
            if al['tipo'] == 'xlsx':
                prepara_xlsx(src, dst)
            else:
                shutil.copyfile(src, dst)
            da_convertire.append(dst)
        converti(da_convertire, lavoro)

        def pdf_di(k):
            al = d['allegati'][k]
            p = os.path.join(AREA, al['file']) if al['tipo'] == 'pdf' else os.path.join(lavoro, k + '.pdf')
            if not os.path.exists(p):
                raise SystemExit('conversione non riuscita: ' + al['nome'])
            return p

        fascicoli, fatti = {}, set()
        for anno, att in schede:
            a = d['attivita'][att]
            docs = documenti_attivita(d, a)
            w = PdfWriter()
            parti = [('Scheda dell\'attività', os.path.join(lavoro, '%s-%s-scheda.pdf' % (anno, att)), None)]
            parti += [('%d. %s' % (i, d['allegati'][k]['nome']), pdf_di(k), (i, k)) for i, (k, _) in enumerate(docs, 1)]
            inizi = []
            for titolo, path, doc in parti:
                inizi.append((titolo, len(w.pages), doc))
                for pg in PdfReader(path).pages:
                    w.add_page(pg)
            tot = len(w.pages)
            testata = accorcia('%s · Piano di revisione %s' % (a['titolo'], anno), 70)
            confini = [x[1] for x in inizi] + [tot]
            for n, (titolo, ini, doc) in enumerate(inizi):
                destra = 'Scheda dell\'attività' if not doc else accorcia(
                    'Documento %d di %d · %s' % (doc[0], len(docs), d['allegati'][doc[1]]['nome']), 80)
                for i in range(ini, confini[n + 1]):
                    pg = w.pages[i]
                    if pg.get('/Rotate'):
                        pg.transfer_rotation_to_content()
                    box = pg.mediabox
                    t = timbro(float(box.width), float(box.height), testata, destra, 'Pagina %d di %d' % (i + 1, tot))
                    pg.merge_transformed_page(t, Transformation().translate(float(box.left), float(box.bottom)))
                    pg.compress_content_streams()
                w.add_outline_item(titolo, ini)
            w.add_metadata({'/Title': '%s · Piano di revisione %s' % (a['titolo'], anno), '/Author': 'Revilaw S.p.A.',
                            '/Subject': 'Strumenti di revisione: scheda dell\'attività e documenti'})
            w.page_mode = '/UseOutlines'
            w.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
            buf = io.BytesIO()
            w.write(buf)
            nome = '%s-%s.pdf' % (anno, att)
            open(os.path.join(USCITA, nome), 'wb').write(buf.getvalue())
            fatti.add(nome)
            fascicoli.setdefault(anno, {})[att] = {
                # ?v= cambia con il contenuto: il browser non tiene la copia vecchia
                'file': '%s/%s?v=%s' % (USCITA_REL, nome, hashlib.sha1(buf.getvalue()).hexdigest()[:10]),
                'pagine': tot, 'kb': max(1, round(len(buf.getvalue()) / 1024)), 'documenti': len(docs)}
            print('%s: %d documenti, %d pagine, %d KB' % (nome, len(docs), tot, len(buf.getvalue()) // 1024))
        for f in os.listdir(USCITA):
            if f.endswith('.pdf') and f not in fatti:
                os.remove(os.path.join(USCITA, f))
        js = re.sub(r'\n' + re.escape(RIGA_FASCICOLI) + r'.*\n', '\n', js)
        js = js.rstrip('\n') + '\n' + RIGA_FASCICOLI + json.dumps(fascicoli, ensure_ascii=False) + ';\n'
        open(DATI, 'w', encoding='utf-8').write(js)
    finally:
        shutil.rmtree(lavoro, ignore_errors=True)


if __name__ == '__main__':
    main()
