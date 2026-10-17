/* ============================================================
   La giornata in agenda: Google Calendar, Outlook e file .ics
   ------------------------------------------------------------
   Lo usa l'invito che parte dopo la conferma dell'indirizzo email
   (lib/conferma-email.js e lib/mail-ngb.js, invitoIngresso): due
   collegamenti pronti per Google Calendar e Outlook, e il file .ics
   in allegato per Apple Calendar e per qualunque altra agenda.
   Lo stesso evento lo offre anche la pagina di Milano, dopo l'invio
   del modulo (milano_febbraio_2027/script.js, riempiConferma).

   `ev`: { titolo, luogo, indirizzo, descrizione, url,
           inizio: '2027-02-26T08:30:00+01:00', fine: '...' }.
   Senza inizio e fine non si propone niente: un evento in agenda
   all'ora sbagliata e' peggio di nessun evento.
   ============================================================ */

function utc(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');   // 20270226T073000Z
}
function dove(ev) {
    return [ev.luogo, ev.indirizzo].filter(Boolean).join(', ');
}
function valido(ev) {
    return !!(ev && utc(ev.inizio) && utc(ev.fine));
}

function linkGoogle(ev) {
    if (!valido(ev)) return '';
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
        + '&text=' + encodeURIComponent(ev.titolo || '')
        + '&dates=' + utc(ev.inizio) + '/' + utc(ev.fine)
        + '&location=' + encodeURIComponent(dove(ev))
        + '&details=' + encodeURIComponent([ev.descrizione, ev.url].filter(Boolean).join('\n'));
}
function linkOutlook(ev) {
    if (!valido(ev)) return '';
    return 'https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent'
        + '&subject=' + encodeURIComponent(ev.titolo || '')
        + '&startdt=' + encodeURIComponent(new Date(ev.inizio).toISOString())
        + '&enddt=' + encodeURIComponent(new Date(ev.fine).toISOString())
        + '&location=' + encodeURIComponent(dove(ev))
        + '&body=' + encodeURIComponent([ev.descrizione, ev.url].filter(Boolean).join('\n'));
}

// testo dentro un .ics: virgole, punti e virgola e barre vanno protetti
function escIcs(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/[;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
}
// le righe di un .ics non superano i 75 caratteri: le piu' lunghe continuano con uno spazio
function piega(riga) {
    const fuori = [];
    let r = riga;
    while (r.length > 74) { fuori.push(r.slice(0, 74)); r = ' ' + r.slice(74); }
    fuori.push(r);
    return fuori.join('\r\n');
}
function ics(ev, uid) {
    if (!valido(ev)) return '';
    return [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Revilaw//Next Generation Business//IT', 'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        'UID:' + (uid || utc(ev.inizio) + '-ngb') + '@nextgenerationbusiness.it',
        'DTSTAMP:' + utc(new Date().toISOString()),
        'DTSTART:' + utc(ev.inizio), 'DTEND:' + utc(ev.fine),
        'SUMMARY:' + escIcs(ev.titolo), 'LOCATION:' + escIcs(dove(ev)),
        'DESCRIPTION:' + escIcs([ev.descrizione, ev.url].filter(Boolean).join('\n')),
        ev.url ? 'URL:' + ev.url : '',
        'END:VEVENT', 'END:VCALENDAR'
    ].filter(Boolean).map(piega).join('\r\n') + '\r\n';
}

module.exports = { valido, linkGoogle, linkOutlook, ics };
