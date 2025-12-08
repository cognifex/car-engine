#!/usr/bin/env bash
set -euo pipefail

# Reliable dev restart for backend and frontend.
# - Prefers nvm Node (v20) but falls back to Windows node.exe if needed.
# - Stops existing backend/vite processes (ports 3001/5180).
# - Starts backend on :3001 and frontend (Vite) on :5180, writing logs to root.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_BACKEND="$ROOT_DIR/backend.log"
LOG_FRONTEND="$ROOT_DIR/frontend.log"

use_node() {
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    nvm use 20 >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true
  fi
  if ! command -v node >/dev/null 2>&1; then
    if [ -x "/mnt/c/Program Files/nodejs/node.exe" ]; then
      export PATH="/mnt/c/Program Files/nodejs:$PATH"
    fi
  fi
  echo "   node: $(command -v node || echo 'not found')"
  node -v 2>/dev/null || echo "   node version unavailable"
}

stop_existing() {
  # Kill processes on our dev ports.
  local pids
  pids=$(lsof -t -i:3001 -i:5180 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "   Killing PIDs: $pids"
    kill $pids || true
  else
    echo "   Nothing running on 3001/5180."
  fi
}

start_backend() {
  echo "Starting backend on :3001..."
  (cd "$ROOT_DIR/backend" && HOST=0.0.0.0 PORT=3001 setsid node index.js >"$LOG_BACKEND" 2>&1 < /dev/null & echo $!)
}

start_frontend() {
  echo "Starting frontend on :5180..."
  (cd "$ROOT_DIR" && setsid node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5180 --strictPort >"$LOG_FRONTEND" 2>&1 < /dev/null & echo $!)
}

wait_for_port() {
  local port="$1"
  local name="$2"
  local tries=20
  local i=0
  while [ $i -lt $tries ]; do
    if lsof -i :"$port" >/dev/null 2>&1; then
      echo "   $name is up on :$port"
      return 0
    fi
    i=$((i + 1))
    echo -n "."
    sleep 1
  done
  echo
  echo "   $name not responding on :$port after ${tries}s (check logs)."
}

main() {
  cd "$ROOT_DIR"
  echo "[1/4] Selecting Node runtime..."
  use_node

  echo "[2/4] Stopping existing dev servers on 3001/5180..."
  stop_existing

  echo "[3/4] Starting backend..."
  backend_pid=$(start_backend)
  echo "   backend PID (spawned): $backend_pid"
  if ! kill -0 "$backend_pid" 2>/dev/null; then
    echo "   backend process not running, check $LOG_BACKEND"
  fi
  wait_for_port 3001 "backend"

  echo "[4/4] Starting frontend..."
  frontend_pid=$(start_frontend)
  echo "   frontend PID (spawned): $frontend_pid"
  if ! kill -0 "$frontend_pid" 2>/dev/null; then
    echo "   frontend process not running, check $LOG_FRONTEND"
  fi
  wait_for_port 5180 "frontend"

  echo "-------------------------"
  echo "Backend PID:  $backend_pid (log: $LOG_BACKEND)"
  echo "Frontend PID: $frontend_pid (log: $LOG_FRONTEND)"
  echo "Tail logs:"
  echo "  tail -f $LOG_BACKEND"
  echo "  tail -f $LOG_FRONTEND"
  echo "Done."
}

main "$@"
