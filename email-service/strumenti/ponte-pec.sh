#!/usr/bin/env bash
# ============================================================
# Il "ponte" per gli invii PEC delle circolarizzazioni
# ------------------------------------------------------------
# Il gestore della PEC respinge gli invii che arrivano da un
# indirizzo di rete estero ("554 5.7.1 Indirizzo IP bloccato
# temporaneamente per sospetto abuso"), e il servizio gira
# all'estero. Questo script prepara, su un server con indirizzo
# ITALIANO, un passaggio da cui il servizio fa uscire gli invii.
#
# Che cosa fa il ponte, e che cosa no:
#   - accetta solo chi ha utente e password (li crea lo script);
#   - inoltra solo verso i server PEC del gestore, sulle porte
#     465 (invio) e 993 (lettura): ogni altra destinazione e'
#     rifiutata;
#   - non legge niente: dentro il passaggio la connessione resta
#     cifrata fra il servizio e il gestore. Password della
#     casella e lettere non le vede.
#
# Dove: un server Ubuntu o Debian con indirizzo pubblico italiano.
# Come: da amministratore,   sudo bash ponte-pec.sh
# Alla fine stampa la riga da mettere su Vercel (CIRC_PEC_PROXY).
# Rilanciarlo non cambia la password gia' creata.
# ============================================================
set -euo pipefail

PORTA="${PONTE_PORTA:-8443}"
AMMESSI="${PONTE_AMMESSI:-smtps.pec.aruba.it imaps.pec.aruba.it}"
CONF="${PONTE_CONF:-/etc/tinyproxy/tinyproxy.conf}"
FILTRO="$(dirname "$CONF")/ponte-filtro"
UTENTE=ponte

[ "$(id -u)" = 0 ] || { echo "Va eseguito da amministratore: sudo bash ponte-pec.sh"; exit 1; }

if ! command -v tinyproxy >/dev/null 2>&1; then
    apt-get update -y
    DEBIAN_FRONTEND=noninteractive apt-get install -y tinyproxy
fi

# la password: se il ponte e' gia' stato preparato si tiene la sua
PASSWORD="$(sed -n "s/^BasicAuth $UTENTE //p" "$CONF" 2>/dev/null | head -1)"
[ -n "$PASSWORD" ] || PASSWORD="$(head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"

# le sole destinazioni ammesse, una espressione per riga
: > "$FILTRO"
for h in $AMMESSI; do echo "^$(printf '%s' "$h" | sed 's/\./\\./g')\$" >> "$FILTRO"; done

cat > "$CONF" <<CONFIGURAZIONE
User tinyproxy
Group tinyproxy
Port $PORTA
Timeout 600
DefaultErrorFile "/usr/share/tinyproxy/default.html"
LogLevel Connect
MaxClients 20
BasicAuth $UTENTE $PASSWORD
ConnectPort 465
ConnectPort 993
Filter "$FILTRO"
FilterDefaultDeny Yes
DisableViaHeader Yes
CONFIGURAZIONE
chown root:tinyproxy "$CONF" "$FILTRO"
chmod 640 "$CONF" "$FILTRO"

if [ -z "${PONTE_SENZA_AVVIO:-}" ]; then
    systemctl enable tinyproxy >/dev/null 2>&1 || true
    systemctl restart tinyproxy
fi

IP="$(curl -4 -s --max-time 8 https://api.ipify.org 2>/dev/null || true)"
[ -n "$IP" ] || IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

echo
echo "Ponte pronto sulla porta $PORTA (va aperta anche nel firewall del fornitore, se ce n'e' uno)."
echo "Su Vercel, nelle variabili d'ambiente del progetto, aggiungi:"
echo
echo "  CIRC_PEC_PROXY=http://$UTENTE:$PASSWORD@$IP:$PORTA"
echo
echo "poi fai un nuovo deployment. La riga contiene la password del ponte: non va scritta altrove."
