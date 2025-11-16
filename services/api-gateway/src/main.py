from fastapi import FastAPI

app = FastAPI(title="API Gateway")

# Handles external API endpoints and orchestrates ingestion, clarification, and optimization flows (see PRD).


@app.get("/health")
def health_check() -> dict:
    """Basic health check."""
    return {"status": "ok", "service": "api-gateway"}
