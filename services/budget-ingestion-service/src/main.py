from fastapi import FastAPI

app = FastAPI(title="Budget Ingestion Service")

# Parses uploaded CSV/XLSX budgets into a structured model and detects missing data cues (per PRD).


@app.get("/health")
def health_check() -> dict:
    """Basic health check."""
    return {"status": "ok", "service": "budget-ingestion-service"}
