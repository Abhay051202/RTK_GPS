#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo "Run with sudo"; exit 1; fi
SRC="$(cd "$(dirname "$0")/.." && pwd)"
apt-get update
apt-get install -y python3 python3-venv python3-pip
id prosperrtk >/dev/null 2>&1 || useradd --system --create-home --groups dialout --shell /usr/sbin/nologin prosperrtk
usermod -a -G dialout prosperrtk
rm -rf /opt/prosper-rtk
mkdir -p /opt/prosper-rtk /etc/prosper-rtk
cp -a "$SRC"/. /opt/prosper-rtk/
python3 -m venv /opt/prosper-rtk/.venv
/opt/prosper-rtk/.venv/bin/pip install --upgrade pip
/opt/prosper-rtk/.venv/bin/pip install -r /opt/prosper-rtk/backend/requirements.txt
# Build dashboard if Node/npm are already installed. Otherwise it can be built separately.
if command -v npm >/dev/null 2>&1; then
  cd /opt/prosper-rtk
  if npm ci && npm run build; then
    echo "Dashboard build completed."
  else
    echo "WARNING: Dashboard build failed. Base backend installation will continue; install a current Node.js and run npm ci && npm run build later."
  fi
fi
chown -R prosperrtk:prosperrtk /opt/prosper-rtk
if [[ ! -f /etc/prosper-rtk/base.env ]]; then
  cp /opt/prosper-rtk/backend/.env.base.production.example /etc/prosper-rtk/base.env
  chmod 600 /etc/prosper-rtk/base.env
  echo "Created /etc/prosper-rtk/base.env. EDIT SURVEYED COORDINATES + SECRETS before starting."
fi
cp /opt/prosper-rtk/deploy/systemd/prosper-rtk-base.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable prosper-rtk-base
printf '\nNext:\n  sudo nano /etc/prosper-rtk/base.env\n  sudo systemctl start prosper-rtk-base\n  sudo journalctl -u prosper-rtk-base -f\n'
