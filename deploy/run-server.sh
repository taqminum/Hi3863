#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f apps/server/.env ]; then
  set -a
  env_file="$(mktemp)"
  sed '1s/^\xEF\xBB\xBF//' apps/server/.env > "$env_file"
  # shellcheck disable=SC1090
  source "$env_file"
  rm -f "$env_file"
  set +a
fi

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8787}"
export DB_PATH="${DB_PATH:-data/ws63-platform.sqlite}"

exec node --experimental-sqlite apps/server/dist/index.js
