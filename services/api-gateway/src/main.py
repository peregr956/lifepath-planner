from typing import Any, Dict, List
from uuid import uuid4

import httpx
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="API Gateway")

# Handles external API endpoints and orchestrates ingestion, clarification, and optimization flows (see PRD).

budgets: Dict[str, Dict[str, Any]] = {}
# Stores budget sessions keyed by session ID with draft/partial/final states ("draft", "partial", "final").

INGESTION_BASE = "http://localhost:8001"
CLARIFICATION_BASE = "http://localhost:8002"
OPTIMIZATION_BASE = "http://localhost:8003"


def error_response(status_code: int, error_code: str, details: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": error_code, "details": details},
    )


@app.get("/health")
def health_check() -> dict:
    """Reports API gateway uptime so orchestrators can confirm this entrypoint is available."""
    return {"status": "ok", "service": "api-gateway"}


@app.post("/upload-budget")
async def upload_budget(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Starts the pipeline by proxying uploads to the ingestion service's /ingest endpoint."""
    if file is None:
        return error_response(400, "file_required", "File upload is required.")

    file_bytes = await file.read()
    if not file_bytes:
        return error_response(400, "file_empty", "Uploaded file is empty.")

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
    except httpx.HTTPStatusError:
        return error_response(
            502,
            "upstream_service_unavailable",
            "Budget ingestion service returned an error response.",
        )
    except httpx.RequestError:
        return error_response(
            502,
            "upstream_service_unavailable",
            "Budget ingestion service is unavailable.",
        )

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


@app.get("/clarification-questions")
async def clarification_questions(budget_id: str) -> Dict[str, Any]:
    """Sends stored draft data to clarification service /clarify to generate questions and a partial model."""
    budget_session = budgets.get(budget_id)
    if not budget_session:
        return error_response(404, "budget_session_not_found", "Budget session not found.")

    draft_payload = budget_session.get("draft")
    if draft_payload is None:
        return error_response(
            404,
            "draft_budget_missing",
            "No draft budget found; please upload a budget before requesting clarifications.",
        )

    # TODO: add auth, tracing, and better error propagation when services fail.
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            clarification_response = await client.post(
                f"{CLARIFICATION_BASE}/clarify", json=draft_payload
            )
            clarification_response.raise_for_status()
    except httpx.HTTPStatusError:
        return error_response(
            502,
            "upstream_service_unavailable",
            "Clarification service returned an error response.",
        )
    except httpx.RequestError:
        return error_response(
            502,
            "upstream_service_unavailable",
            "Clarification service is unavailable.",
        )

    clarification_data: Dict[str, Any] = clarification_response.json()

    partial_model = clarification_data.get("partial_model")
    budget_session["partial"] = partial_model

    return {
        "budget_id": budget_id,
        "needs_clarification": clarification_data.get("needs_clarification"),
        "questions": clarification_data.get("questions", []),
        "partial_model": partial_model,
    }


class SubmitAnswersPayload(BaseModel):
    budget_id: str
    answers: Dict[str, Any]


@app.post("/submit-answers")
async def submit_answers(payload: SubmitAnswersPayload) -> Dict[str, Any]:
    """Calls clarification service /apply-answers to merge user answers into a final unified model."""
    budget_session = budgets.get(payload.budget_id)
    if not budget_session:
        return error_response(404, "budget_session_not_found", "Budget session not found.")

    partial_model = budget_session.get("partial")
    if partial_model is None:
        return error_response(
            400,
            "clarification_not_completed",
            "Clarification has not run for this budget; please answer the clarification questions first.",
        )

    request_body = {
        "partial_model": partial_model,
        "answers": payload.answers,
    }

    # TODO: validate answers schema and provide better downstream error handling/logging.
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            clarification_response = await client.post(
                f"{CLARIFICATION_BASE}/apply-answers", json=request_body
            )
            clarification_response.raise_for_status()
    except httpx.HTTPStatusError:
        return error_response(
            502,
            "upstream_service_unavailable",
            "Clarification service returned an error response.",
        )
    except httpx.RequestError:
        return error_response(
            502,
            "upstream_service_unavailable",
            "Clarification service is unavailable.",
        )

    apply_data: Dict[str, Any] = clarification_response.json()

    updated_model = apply_data.get("updated_model")
    budget_session["final"] = updated_model

    # TODO: surface ready_for_summary flag to the client once downstream contract is finalized.
    return {
        "budget_id": payload.budget_id,
        "status": "ready_for_summary",
    }


@app.get("/summary-and-suggestions")
async def summary_and_suggestions(budget_id: str) -> Dict[str, Any]:
    """Finishes the pipeline by calling optimization service /summarize-and-optimize for insights."""
    budget_session = budgets.get(budget_id)
    if not budget_session:
        return error_response(404, "budget_session_not_found", "Budget session not found.")

    final_model = budget_session.get("final")
    if final_model is None:
        return error_response(
            400,
            "answers_incomplete",
            "Clarification answers are incomplete; please submit answers before requesting the summary.",
        )

    # TODO: propagate user context, auth, and tracing headers downstream.
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            optimization_response = await client.post(
                f"{OPTIMIZATION_BASE}/summarize-and-optimize", json=final_model
            )
            optimization_response.raise_for_status()
    except httpx.HTTPStatusError:
        return error_response(
            502,
            "upstream_service_unavailable",
            "Optimization service returned an error response.",
        )
    except httpx.RequestError:
        return error_response(
            502,
            "upstream_service_unavailable",
            "Optimization service is unavailable.",
        )

    optimization_data: Dict[str, Any] = optimization_response.json()

    return {
        "budget_id": budget_id,
        "summary": optimization_data.get("summary"),
        "category_shares": optimization_data.get("category_shares"),
        "suggestions": optimization_data.get("suggestions"),
    }
