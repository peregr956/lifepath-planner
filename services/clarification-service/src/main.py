from fastapi import FastAPI

app = FastAPI(title="Clarification Service")

# Generates targeted follow-up questions and UI schemas to fill gaps in the budget model (per PRD).


@app.get("/health")
def health_check() -> dict:
    """Basic health check."""
    return {"status": "ok", "service": "clarification-service"}
