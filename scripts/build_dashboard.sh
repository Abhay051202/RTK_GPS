#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node --version
npm --version
npm ci
npm run build
echo "Dashboard built to $ROOT/dist and will be served by the Base backend on port 8000."
