#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"

if [[ "$(id -un)" != "deploy" ]]; then
  echo "Run this script as the deploy user."
  exit 1
fi

cd "$BACKEND_DIR"
npm ci
npm run build
pm2 startOrRestart ecosystem.config.cjs --only jobflow-api --env production --update-env
pm2 save
