from fastapi import FastAPI

app = FastAPI(title="Optimization Service")

# Computes summaries and produces rational optimization suggestions using heuristics described in the PRD.


@app.get("/health")
def health_check() -> dict:
    """Basic health check."""
    return {"status": "ok", "service": "optimization-service"}
