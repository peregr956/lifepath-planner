#!/bin/bash
# Local production startup script
# Starts all Python services with proper configuration for local testing

set -e

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Set up Python path for cross-service imports
# Include all service src directories and shared code
export PYTHONPATH="${PROJECT_ROOT}/services/api-gateway/src:${PROJECT_ROOT}/services/budget-ingestion-service/src:${PROJECT_ROOT}/services/clarification-service/src:${PROJECT_ROOT}/services/optimization-service/src:${PROJECT_ROOT}/services/shared:${PROJECT_ROOT}/services:${PYTHONPATH}"

# Default ports (PORT env var for the main service)
GATEWAY_PORT="${PORT:-8000}"
INGESTION_PORT="${INGESTION_PORT:-8001}"
CLARIFICATION_PORT="${CLARIFICATION_PORT:-8002}"
OPTIMIZATION_PORT="${OPTIMIZATION_PORT:-8003}"

# Set internal service URLs if not already set
export INGESTION_BASE="${INGESTION_BASE:-http://localhost:${INGESTION_PORT}}"
export CLARIFICATION_BASE="${CLARIFICATION_BASE:-http://localhost:${CLARIFICATION_PORT}}"
export OPTIMIZATION_BASE="${OPTIMIZATION_BASE:-http://localhost:${OPTIMIZATION_PORT}}"

echo "Starting LifePath Planner production services..."
echo "  Project root: ${PROJECT_ROOT}"
echo "  Gateway: port ${GATEWAY_PORT}"
echo "  Ingestion: ${INGESTION_BASE}"
echo "  Clarification: ${CLARIFICATION_BASE}"
echo "  Optimization: ${OPTIMIZATION_BASE}"

# Cleanup function for graceful shutdown
cleanup() {
    echo "Shutting down services..."
    kill $INGESTION_PID $CLARIFICATION_PID $OPTIMIZATION_PID 2>/dev/null || true
    wait
    echo "All services stopped."
}
trap cleanup EXIT INT TERM

# Start internal services in background
echo "Starting Budget Ingestion Service..."
(cd "${PROJECT_ROOT}/services/budget-ingestion-service" && uvicorn src.main:app --host 0.0.0.0 --port "${INGESTION_PORT}") &
INGESTION_PID=$!

echo "Starting Clarification Service..."
(cd "${PROJECT_ROOT}/services/clarification-service" && uvicorn src.main:app --host 0.0.0.0 --port "${CLARIFICATION_PORT}") &
CLARIFICATION_PID=$!

echo "Starting Optimization Service..."
(cd "${PROJECT_ROOT}/services/optimization-service" && uvicorn src.main:app --host 0.0.0.0 --port "${OPTIMIZATION_PORT}") &
OPTIMIZATION_PID=$!

# Give internal services time to start
echo "Waiting for internal services to start..."
sleep 3

# Start API Gateway in foreground (main service)
echo "Starting API Gateway on port ${GATEWAY_PORT}..."
cd "${PROJECT_ROOT}/services/api-gateway"
exec uvicorn src.main:app --host 0.0.0.0 --port "${GATEWAY_PORT}"

