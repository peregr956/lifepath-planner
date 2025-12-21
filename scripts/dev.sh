#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Source .env if present so all services inherit OpenAI and telemetry vars
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi
CONCURRENTLY_BIN="$ROOT_DIR/node_modules/.bin/concurrently"

if [[ ! -x "$CONCURRENTLY_BIN" ]]; then
  echo "Missing dev dependencies. Run 'npm install' from the repo root before 'npm run dev'." >&2
  exit 1
fi

if [[ "${SKIP_PIP_INSTALL:-0}" != "1" ]]; then
  echo "Installing Python dependencies (set SKIP_PIP_INSTALL=1 to skip)…"
  python3 -m pip install -r "$ROOT_DIR/requirements-dev.txt"
fi

# Export PYTHONPATH so services can find shared modules
export PYTHONPATH="${ROOT_DIR}/services:${ROOT_DIR}/services/shared:${PYTHONPATH:-}"

kill_port() {
  local port="$1"
  if lsof -ti tcp:"$port" >/dev/null 2>&1; then
    echo "Reclaiming port $port"
    lsof -ti tcp:"$port" | xargs kill -9 >/dev/null 2>&1 || true
  fi
}

for port in 8000 8001 8002 8003; do
  kill_port "$port"
done

cd "$ROOT_DIR"

"$CONCURRENTLY_BIN" --kill-others-on-fail --prefix "[{name}]" \
  --names "gateway,ingest,clarify,opt,ui" \
  "cd services/api-gateway && uvicorn src.main:app --reload --port 8000" \
  "cd services/budget-ingestion-service && uvicorn src.main:app --reload --port 8001" \
  "cd services/clarification-service && uvicorn src.main:app --reload --port 8002" \
  "cd services/optimization-service && uvicorn src.main:app --reload --port 8003" \
  "cd services/ui-web && npm run dev"

