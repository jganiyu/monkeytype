#!/bin/bash

set -e

MONKEYTYPE_DIR="/Users/jonathanganiyu/Applications/monkeytype"
PORT=3000
URL="http://localhost:${PORT}/"
LOG_FILE="${MONKEYTYPE_DIR}/monkeytype-steno.log"

is_running() {
  lsof -ti tcp:${PORT} >/dev/null 2>&1
}

if ! is_running; then
  cd "${MONKEYTYPE_DIR}"
  source "${HOME}/.nvm/nvm.sh"
  nvm use 24.11.0 >/dev/null
  nohup pnpm --filter @monkeytype/frontend dev -- --host 127.0.0.1 >"${LOG_FILE}" 2>&1 &

  for _ in {1..30}; do
    if is_running; then
      break
    fi
    sleep 1
  done
fi

open -na "Brave Browser" --args --app="${URL}"
