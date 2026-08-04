/* ============================================
   Circolare AI Act — script di pagina

   Due funzioni, entrambe pensate per l'uso reale
   della circolare:
   1. i testi pronti all'uso si copiano con un clic;
   2. le check list dell'allegato si compilano nel
      browser, si conservano sul dispositivo e si
      stampano (o si salvano in PDF) già barrate.

   Nessun dato lascia il browser: tutto resta in
   localStorage, sul dispositivo di chi compila.
   ============================================ */
(function () {
    'use strict';

    /* ============================================
       1. COPIA DEI TESTI PRONTI ALL'USO
       ============================================ */
    // Fallback per contesti non sicuri, browser datati o permesso negato
    const legacyCopy = (text) => new Promise((resolve, reject) => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        let ok = false;
        try {
            ok = document.execCommand('copy');
        } catch (err) {
            ok = false;
        }
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy non riuscita'));
    });

    const copyToClipboard = (text) => {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
        }
        return legacyCopy(text);
    };

    document.querySelectorAll('.testo-copy').forEach(btn => {
        const original = btn.querySelector('.testo-copy-label');
        btn.addEventListener('click', () => {
            const source = document.querySelector(btn.dataset.copy);
            if (!source) return;

            // Le virgolette tipografiche del testo di esempio non servono
            // a chi incolla: si copia il contenuto, non la citazione.
            const text = source.textContent
                .replace(/\s+/g, ' ')
                .replace(/^[\s"“”«]+|[\s"“”»]+$/g, '')
                .trim();

            copyToClipboard(text).then(() => {
                btn.classList.add('is-done');
                if (original) original.textContent = 'Testo copiato';
                window.setTimeout(() => {
                    btn.classList.remove('is-done');
                    if (original) original.textContent = 'Copia il testo';
                }, 2200);
            }).catch(() => {
                if (original) original.textContent = 'Copia non riuscita';
                window.setTimeout(() => {
                    if (original) original.textContent = 'Copia il testo';
                }, 2200);
            });
        });
    });

    /* ============================================
       2. CHECK LIST COMPILABILI
       ============================================ */
    const grid = document.getElementById('clGrid');
    if (!grid) return;

    const STORAGE_KEY  = 'ngb-aiact-checklist-v1';
    const boxes        = Array.from(grid.querySelectorAll('.cl-check input[type="checkbox"]'));
    const notes        = Array.from(grid.querySelectorAll('.cl-note'));
    const azienda      = document.getElementById('clAzienda');
    const meterFill    = document.getElementById('clMeterFill');
    const meterLabel   = document.getElementById('clMeterLabel');
    const savedLabel   = document.getElementById('clSaved');
    const printBtn     = document.getElementById('clPrint');
    const resetBtn     = document.getElementById('clReset');
    const total        = boxes.length;

    // --- Persistenza -------------------------------------------------
    const readState = () => {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            return null;
        }
    };

    const writeState = () => {
        const state = { azienda: '', checks: {}, notes: {}, ts: new Date().toISOString() };
        if (azienda) state.azienda = azienda.value;
        boxes.forEach(b => { if (b.checked) state.checks[b.dataset.clId] = true; });
        notes.forEach(n => { if (n.value.trim()) state.notes[n.dataset.clId] = n.value; });
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            showSaved(state.ts);
        } catch (err) {
            // Storage pieno o disabilitato: la compilazione resta comunque
            // utilizzabile nella sessione corrente e stampabile.
        }
    };

    const showSaved = (iso) => {
        if (!savedLabel || !iso) return;
        const d = new Date(iso);
        if (isNaN(d.getTime())) return;
        const when = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) +
                     ' alle ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        savedLabel.textContent = 'Compilazione salvata su questo dispositivo il ' + when + '.';
    };

    // --- Conteggi e barra di avanzamento ------------------------------
    const refresh = () => {
        let done = 0;

        grid.querySelectorAll('.cl-card').forEach(card => {
            const cardBoxes = Array.from(card.querySelectorAll('.cl-check input[type="checkbox"]'));
            const cardDone  = cardBoxes.filter(b => b.checked).length;
            done += cardDone;

            const counter = card.querySelector('.cl-count');
            if (counter) {
                counter.textContent = cardDone + '/' + cardBoxes.length;
                counter.classList.toggle('is-complete', cardDone === cardBoxes.length && cardBoxes.length > 0);
            }

            cardBoxes.forEach(b => {
                const item = b.closest('.cl-item');
                if (item) item.classList.toggle('is-checked', b.checked);
            });
        });

        const pct = total ? Math.round((done / total) * 100) : 0;
        if (meterFill) meterFill.style.width = pct + '%';
        const meter = meterFill ? meterFill.parentElement : null;
        if (meter) {
            meter.setAttribute('aria-valuemin', '0');
            meter.setAttribute('aria-valuemax', String(total));
            meter.setAttribute('aria-valuenow', String(done));
            meter.setAttribute('aria-valuetext', done + ' di ' + total + ' punti di controllo verificati');
        }
        if (meterLabel) {
            meterLabel.textContent = done === total
                ? 'Tutti i ' + total + ' punti di controllo sono verificati'
                : done + ' di ' + total + ' punti di controllo verificati';
        }
    };

    // --- Ripristino della compilazione precedente ----------------------
    const state = readState();
    if (state) {
        if (azienda && state.azienda) azienda.value = state.azienda;
        boxes.forEach(b => { if (state.checks && state.checks[b.dataset.clId]) b.checked = true; });
        notes.forEach(n => { if (state.notes && state.notes[n.dataset.clId]) n.value = state.notes[n.dataset.clId]; });
        showSaved(state.ts);
    }
    refresh();

    // --- Eventi --------------------------------------------------------
    boxes.forEach(b => b.addEventListener('change', () => { refresh(); writeState(); }));

    let noteTimer = null;
    const deferredSave = () => {
        window.clearTimeout(noteTimer);
        noteTimer = window.setTimeout(writeState, 500);
    };
    notes.forEach(n => n.addEventListener('input', deferredSave));
    if (azienda) azienda.addEventListener('input', deferredSave);

    if (printBtn) {
        printBtn.addEventListener('click', () => {
            if (typeof window.gtag === 'function') {
                window.gtag('event', 'stampa_checklist', { pagina: 'Circolare AI Act 2 agosto 2026' });
            }
            window.print();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            const ok = window.confirm('Vuoi azzerare la compilazione delle check list su questo dispositivo? I punti barrati e le note inserite andranno persi.');
            if (!ok) return;
            boxes.forEach(b => { b.checked = false; });
            notes.forEach(n => { n.value = ''; });
            if (azienda) azienda.value = '';
            try { window.localStorage.removeItem(STORAGE_KEY); } catch (err) { /* nulla da fare */ }
            if (savedLabel) savedLabel.textContent = 'Compilazione azzerata. Le check list ripartono da zero.';
            refresh();
        });
    }
})();
