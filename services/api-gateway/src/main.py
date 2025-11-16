from typing import Any, Dict, List
from uuid import uuid4

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile

app = FastAPI(title="API Gateway")

# Handles external API endpoints and orchestrates ingestion, clarification, and optimization flows (see PRD).

budgets: Dict[str, Dict[str, Any]] = {}
# Stores budget sessions keyed by session ID with draft/partial/final states ("draft", "partial", "final").


@app.get("/health")
def health_check() -> dict:
    """Basic health check."""
    return {"status": "ok", "service": "api-gateway"}


INGESTION_BASE = "http://localhost:8001"


@app.post("/upload-budget")
async def upload_budget(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Accepts a budget file upload and proxies it to the ingestion service, storing the draft result.
    """
    if file is None:
        raise HTTPException(status_code=400, detail="File upload is required.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    files = {
        "file": (
            file.filename or "budget_upload",
            file_bytes,
            file.content_type or "application/octet-stream",
        )
    }

    # TODO: introduce retries/backoff and better error reporting.
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            ingestion_response = await client.post(f"{INGESTION_BASE}/ingest", files=files)
            ingestion_response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Budget ingestion service is unavailable.") from exc

    draft_budget: Dict[str, Any] = ingestion_response.json()

    budget_id = str(uuid4())
    budgets[budget_id] = {
        "draft": draft_budget,
        "partial": None,
        "final": None,
    }

    lines: List[Dict[str, Any]] = draft_budget.get("lines") or []
    detected_income_lines = 0
    detected_expense_lines = 0
    for line in lines:
        amount = line.get("amount")
        try:
            amount_value = float(amount)
        except (TypeError, ValueError):
            continue
        if amount_value > 0:
            detected_income_lines += 1
        elif amount_value < 0:
            detected_expense_lines += 1

    return {
        "budget_id": budget_id,
        "status": "parsed",
        "detected_format": draft_budget.get("detected_format"),
        "summary_preview": {
            "detected_income_lines": detected_income_lines,
            "detected_expense_lines": detected_expense_lines,
        },
    }
