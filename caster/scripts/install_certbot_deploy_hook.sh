#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-rtk.prosperinfotech.com}"
HOOK="/etc/letsencrypt/renewal-hooks/deploy/prosper-ntrip-caster-cert.sh"

sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy /etc/prosper-ntrip/tls
sudo tee "$HOOK" >/dev/null <<EOF2
#!/usr/bin/env bash
set -euo pipefail
install -o root -g prosperrtk -m 0640 /etc/letsencrypt/live/${DOMAIN}/fullchain.pem /etc/prosper-ntrip/tls/fullchain.pem
install -o root -g prosperrtk -m 0640 /etc/letsencrypt/live/${DOMAIN}/privkey.pem /etc/prosper-ntrip/tls/privkey.pem
systemctl restart prosper-ntrip-caster.service || true
EOF2
sudo chmod 0750 "$HOOK"
sudo "$HOOK"
echo "Installed cert deploy hook: $HOOK"
