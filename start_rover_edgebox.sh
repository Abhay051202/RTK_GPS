#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/backend"
exec python3 ntrip_rover_client.py
