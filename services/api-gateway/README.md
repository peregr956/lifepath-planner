# API Gateway

FastAPI entrypoint that orchestrates ingestion, clarification, and optimization services.  
This service now persists budget sessions and audit events via SQLAlchemy so state survives restarts.

## Prerequisites

- Python 3.11
- Install dependencies once per virtualenv:

  ```bash
  pip install -r requirements-dev.txt
  ```

## Running Locally

```bash
cd services/api-gateway
uvicorn src.main:app --reload --port 9000
```

The gateway expects the supporting services to run on the default localhost ports listed in `src/main.py`. Adjust the `INGESTION_BASE`, `CLARIFICATION_BASE`, and `OPTIMIZATION_BASE` env vars (or edit the file) if your topology differs.

## Persistence & Auditing

- Budgets are stored in SQLite by default at `services/api-gateway/data/gateway.db`.
- Override the location (or use Postgres/MySQL) via `GATEWAY_DB_URL`, e.g.

  ```bash
  export GATEWAY_DB_URL="sqlite:////tmp/lifepath-gateway.db"
  ```

- On startup the app calls `persistence.database.init_db()` to create tables automatically. You can pre-create them manually by running:

  ```bash
  python -c "from persistence.database import init_db; init_db()"
  ```

- The `BudgetSession` table retains the draft, partial, and final payloads plus timestamps.
- Every state mutation records an `AuditEvent` with the action name, source IP, and stage transition metadata for troubleshooting.

## Testing

Run the persistence-focused suite to verify durable storage and auditing behavior:

```bash
pytest services/api-gateway/tests/test_persistence.py
```

The existing smoke tests remain pending integration with the downstream services.
