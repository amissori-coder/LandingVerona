"""Inserisce punti di sillabazione invisibili (&shy;) nel testo corrente di una pagina HTML.

Serve alle pagine con testo sempre giustificato (classe testo-giustificato sul body,
vedi assets/approfondimento-extra.css): il browser va a capo con il trattino solo dove
serve, e le righe non si allargano anche nei browser che non sillabano l'italiano da soli.

Solo dentro p, li, celle di tabella (role="cell"), risposte delle FAQ e voci della lista di
controllo; mai in titoli, menu, pulsanti, script, stili, svg. Parole di almeno 6 lettere,
almeno 2 lettere prima e dopo ogni punto. Le elisioni (dell', un') restano intere.
Uso:
    pip install pyphen
    python3 scripts/testo/sillaba.py oic35_bilancio_ets/index.html          # prima volta
    python3 scripts/testo/sillaba.py oic35_bilancio_ets/index.html --rifai  # dopo aver cambiato il testo

Con --rifai toglie i punti gia' presenti e li rimette sul testo aggiornato.
"""
import re, sys
import pyphen

DIZ = pyphen.Pyphen(lang='it_IT', left=2, right=2)
VUOTI = {'br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'wbr', 'area', 'col', 'embed', 'param', 'track'}
SALTA = {'script', 'style', 'svg', 'title', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'nav', 'head', 'textarea', 'select', 'option'}
LETTERE = 'A-Za-zÀ-ÖØ-öø-ÿ'
PAROLA = re.compile(r"((?:[%s]+['’])?)([%s]{6,})" % (LETTERE, LETTERE))
ENTITA = re.compile(r'(&[#a-zA-Z0-9]+;)')

def ammesso(pila):
    if any(t in SALTA for t, _ in pila):
        return False
    return any(t in ('p', 'li') or 'role="cell"' in a or 'faq-answer-inner' in a or 'ck-voce' in a or 'rimando-desc' in a for t, a in pila)

def sillaba_testo(testo):
    pezzi = ENTITA.split(testo)
    for i in range(0, len(pezzi), 2):          # i pezzi dispari sono entita'
        def sost(m):
            pref, w = m.group(1), m.group(2)
            if w.isupper() or '\xad' in w:
                return m.group(0)
            return pref + DIZ.inserted(w, hyphen='&shy;')
        pezzi[i] = PAROLA.sub(sost, pezzi[i])
    return ''.join(pezzi)

def elabora(html):
    i0 = html.index('<body')
    testa, corpo = html[:i0], html[i0:]
    out, pila, n = [], [], 0
    for tok in re.findall(r'<!--.*?-->|<[^>]+>|[^<]+', corpo, re.S):
        if tok.startswith('<!--'):
            out.append(tok); continue
        if tok.startswith('<'):
            m = re.match(r'<(/?)([a-zA-Z0-9]+)([^>]*)>', tok, re.S)
            if m:
                chiusura, tag, attr = m.group(1), m.group(2).lower(), m.group(3)
                if chiusura:
                    while pila:
                        t, _ = pila.pop()
                        if t == tag: break
                elif tag not in VUOTI and not attr.rstrip().endswith('/'):
                    pila.append((tag, attr))
            out.append(tok); continue
        if ammesso(pila) and tok.strip():
            nuovo = sillaba_testo(tok)
            n += nuovo.count('&shy;') - tok.count('&shy;')
            out.append(nuovo)
        else:
            out.append(tok)
    return testa + ''.join(out), n

if __name__ == '__main__':
    p = sys.argv[1]
    html = open(p, encoding='utf-8').read()
    if '--rifai' in sys.argv[2:]:
        html = html.replace('&shy;', '').replace('\xad', '')
    elif '&shy;' in html:
        sys.exit('La pagina contiene gia\' punti di sillabazione: usa --rifai per rigenerarli.')
    nuovo, n = elabora(html)
    open(p, 'w', encoding='utf-8').write(nuovo)
    print('punti di sillabazione inseriti:', n)
