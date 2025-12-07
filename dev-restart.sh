#!/usr/bin/env bash
set -euo pipefail

# Restart frontend + backend and rebuild the automatch AI pipeline so changes can be tested quickly.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_BACKEND="$ROOT_DIR/backend.log"
LOG_FRONTEND="$ROOT_DIR/frontend.log"

use_node() {
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # Prefer the nvm-managed Node (expects v20 to be installed).
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    nvm use 20 >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true
  fi

  if ! command -v node >/dev/null 2>&1; then
    # Fallback to Windows Node when running inside WSL.
    if [ -x "/mnt/c/Program Files/nodejs/node.exe" ]; then
      export PATH="/mnt/c/Program Files/nodejs:$PATH"
    fi
  fi
}

stop_existing() {
  # Kill anything on our dev ports.
  local pids
  pids=$(lsof -t -i:3001 -i:5173 2>/dev/null || true)
  if [ -n "$pids" ]; then
    kill $pids || true
  fi
}

build_pipeline() {
  echo "Building automatch-ai..."
  (cd "$ROOT_DIR/automatch-ai" && npm run build)
}

start_backend() {
  echo "Starting backend on :3001..."
  (cd "$ROOT_DIR/backend" && HOST=0.0.0.0 PORT=3001 nohup node index.js > "$LOG_BACKEND" 2>&1 & echo $!)
}

start_frontend() {
  echo "Starting frontend on :5173..."
  (cd "$ROOT_DIR" && nohup npm run dev -- --host 0.0.0.0 --port 5173 --strictPort > "$LOG_FRONTEND" 2>&1 & echo $!)
}

main() {
  cd "$ROOT_DIR"
  use_node
  stop_existing
  build_pipeline
  backend_pid=$(start_backend)
  frontend_pid=$(start_frontend)
  echo "Backend PID: $backend_pid (logs: $LOG_BACKEND)"
  echo "Frontend PID: $frontend_pid (logs: $LOG_FRONTEND)"
}

main "$@"
