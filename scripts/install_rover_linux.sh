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
chown -R prosperrtk:prosperrtk /opt/prosper-rtk
if [[ ! -f /etc/prosper-rtk/rover.env ]]; then
  cp /opt/prosper-rtk/backend/.env.rover.example /etc/prosper-rtk/rover.env
  chmod 600 /etc/prosper-rtk/rover.env
  echo "Created /etc/prosper-rtk/rover.env. EDIT IT before starting the service."
fi
cp /opt/prosper-rtk/deploy/systemd/prosper-rtk-rover.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable prosper-rtk-rover
printf '\nNext:\n  sudo nano /etc/prosper-rtk/rover.env\n  sudo systemctl start prosper-rtk-rover\n  sudo journalctl -u prosper-rtk-rover -f\n'
