#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo ./scripts/install_ubuntu.sh" >&2
  exit 1
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

apt-get update
apt-get install -y python3 python3-venv python3-pip openssl ca-certificates curl jq

if ! id prosperrtk >/dev/null 2>&1; then
  useradd --system --home /opt/prosper-ntrip-caster --shell /usr/sbin/nologin prosperrtk
fi

mkdir -p /opt/prosper-ntrip-caster /etc/prosper-ntrip/tls
cp -a "$SRC_DIR"/. /opt/prosper-ntrip-caster/
python3 -m venv /opt/prosper-ntrip-caster/.venv
/opt/prosper-ntrip-caster/.venv/bin/pip install --upgrade pip setuptools wheel
/opt/prosper-ntrip-caster/.venv/bin/pip install -e /opt/prosper-ntrip-caster

cp /opt/prosper-ntrip-caster/config/caster-azure.yaml /etc/prosper-ntrip/caster.yaml
cp /opt/prosper-ntrip-caster/deploy/systemd/prosper-ntrip-caster.service /etc/systemd/system/prosper-ntrip-caster.service

chown -R prosperrtk:prosperrtk /opt/prosper-ntrip-caster
chown root:prosperrtk /etc/prosper-ntrip /etc/prosper-ntrip/tls /etc/prosper-ntrip/caster.yaml
chmod 0750 /etc/prosper-ntrip /etc/prosper-ntrip/tls
chmod 0640 /etc/prosper-ntrip/caster.yaml

systemctl daemon-reload

echo
cat <<'MSG'
Installed Prosper NTRIP Caster.
Next steps:
  1. Create /etc/prosper-ntrip/caster.env (chmod 600, owner root).
  2. Obtain TLS cert for rtk.prosperinfotech.com.
  3. Copy fullchain.pem and privkey.pem to /etc/prosper-ntrip/tls/ with group prosperrtk and mode 0640.
  4. sudo systemctl enable --now prosper-ntrip-caster
MSG
