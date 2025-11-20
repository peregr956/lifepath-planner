import logging
import os
from typing import Any, Dict, List
from uuid import uuid4

import httpx
from fastapi import Depends, FastAPI, File, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from persistence.database import get_session, init_db
from persistence.repository import BudgetSessionRepository

logger = logging.getLogger(__name__)

app = FastAPI(title="API Gateway")


DEFAULT_CORS_ORIGINS: List[str] = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]

CORS_ENV_KEYS = (
    "GATEWAY_CORS_ORIGINS",
    "API_GATEWAY_CORS_ORIGINS",
    "CORS_ALLOWED_ORIGINS",
    "CORS_ORIGINS",
)


def _resolve_cors_origins() -> List[str]:
    """
    Determine which origins are allowed to call the gateway.

    Developers can provide a comma-separated list via any env var in `CORS_ENV_KEYS`.
    Falls back to localhost-friendly defaults so the Next.js dev server can talk to the API.
    """

    for key in CORS_ENV_KEYS:
        raw_value = os.getenv(key)
        if not raw_value:
            continue
        candidates = [origin.strip() for origin in raw_value.split(",")]
        origins = [origin for origin in candidates if origin]
        if origins:
            # FastAPI expects ["*"] instead of mixing '*' with explicit origins.
            if any(origin == "*" for origin in origins):
                return ["*"]
            return origins
    return DEFAULT_CORS_ORIGINS


app.add_middleware(
    CORSMiddleware,
    allow_origins=_resolve_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# Handles external API endpoints and orchestrates ingestion, clarification, and optimization flows (see PRD).

INGESTION_BASE = "http://localhost:8001"
CLARIFICATION_BASE = "http://localhost:8002"
OPTIMIZATION_BASE = "http://localhost:8003"


def error_response(status_code: int, error_code: str, details: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": error_code, "details": details},
    )


def _client_ip(request: Request) -> str | None:
    client = request.client
    if client:
        return client.host
    return None


@app.on_event("startup")
def on_startup() -> None:
    """Initialize persistence before serving requests."""
    init_db()


@app.get("/health")
def health_check() -> dict:
    """Reports API gateway uptime so orchestrators can confirm this entrypoint is available."""
    return {"status": "ok", "service": "api-gateway"}


@app.post("/upload-budget", response_model=None)
async def upload_budget(
    file: UploadFile = File(...),
    request: Request,
    db: Session = Depends(get_session),
) -> Dict[str, Any] | JSONResponse:
    """Starts the pipeline by proxying uploads to the ingestion service's /ingest endpoint."""
    if file is None:
        return error_response(400, "file_required", "File upload is required.")

    file_bytes = await file.read()
    if not file_bytes:
        return error_response(400, "file_empty", "Uploaded file is empty.")

    filename = file.filename or "budget_upload"
    files = {
        "file": (
            filename,
            file_bytes,
            file.content_type or "application/octet-stream",
        )
    }

    # TODO: introduce retries/backoff and better error reporting.
    ingestion_url = f"{INGESTION_BASE}/ingest"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            ingestion_response = await client.post(ingestion_url, files=files)
            ingestion_response.raise_for_status()
    except httpx.HTTPStatusError:
        return error_response(
            502,
            "upstream_service_unavailable",
            "Budget ingestion service returned an error response.",
        )
    except httpx.RequestError as exc:
        logger.warning("Request to %s failed: %s", ingestion_url, exc)
        return error_response(
            502,
            "upstream_service_unavailable",
            "Budget ingestion service is unavailable.",
        )

    draft_budget: Dict[str, Any] = ingestion_response.json()

    lines: List[Dict[str, Any]] = draft_budget.get("lines") or []
    detected_income_lines = 0
    detected_expense_lines = 0
    for line in lines:
        amount = line.get("amount")
        if amount is None:
            continue
        try:
            amount_value = float(amount)
        except (TypeError, ValueError):
            continue
        if amount_value > 0:
            detected_income_lines += 1
        elif amount_value < 0:
            detected_expense_lines += 1

    summary_counts = {
        "detected_income_lines": detected_income_lines,
        "detected_expense_lines": detected_expense_lines,
    }

    budget_id = str(uuid4())
    repo = BudgetSessionRepository(db)
    repo.create_session(
        budget_id,
        draft_budget,
        source_ip=_client_ip(request),
        details={"filename": filename, **summary_counts},
    )
    logger.info("upload-budget budget_id=%s filename=%s", budget_id, filename)

    return {
        "budget_id": budget_id,
        "status": "parsed",
        "detected_format": draft_budget.get("detected_format"),
        "summary_preview": summary_counts,
    }


@app.get("/clarification-questions", response_model=None)
async def clarification_questions(
    budget_id: str,
    request: Request,
    db: Session = Depends(get_session),
) -> Dict[str, Any] | JSONResponse:
    """Sends stored draft data to clarification service /clarify to generate questions and a partial model."""
    repo = BudgetSessionRepository(db)
    budget_session = repo.get_session(budget_id)
    if not budget_session:
        return error_response(404, "budget_session_not_found", "Budget session not found.")

    draft_payload = budget_session.draft
    if draft_payload is None:
        return error_response(
            404,
            "draft_budget_missing",
            "No draft budget found; please upload a budget before requesting clarifications.",
        )

    # TODO: add auth, tracing, and better error propagation when services fail.
    clarify_url = f"{CLARIFICATION_BASE}/clarify"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            clarification_response = await client.post(clarify_url, json=draft_payload)
            clarification_response.raise_for_status()
    except httpx.HTTPStatusError:
        return error_response(
            502,
            "upstream_service_unavailable",
            "Clarification service returned an error response.",
        )
    except httpx.RequestError as exc:
        logger.warning("Request to %s failed: %s", clarify_url, exc)
        return error_response(
            502,
            "upstream_service_unavailable",
            "Clarification service is unavailable.",
        )

    clarification_data: Dict[str, Any] = clarification_response.json()

    partial_model = clarification_data.get("partial_model")
    questions = clarification_data.get("questions", [])
    repo.update_partial(
        budget_session,
        partial_model,
        source_ip=_client_ip(request),
        details={"question_count": len(questions)},
    )
    logger.info(
        "clarification-questions budget_id=%s question_count=%s",
        budget_id,
        len(questions),
    )
    return {
        "budget_id": budget_id,
        "needs_clarification": clarification_data.get("needs_clarification"),
        "questions": questions,
        "partial_model": partial_model,
    }


class SubmitAnswersPayload(BaseModel):
    budget_id: str
    answers: Dict[str, Any]


@app.post("/submit-answers", response_model=None)
async def submit_answers(
    payload: SubmitAnswersPayload,
    request: Request,
    db: Session = Depends(get_session),
) -> Dict[str, Any] | JSONResponse:
    """Calls clarification service /apply-answers to merge user answers into a final unified model."""
    logger.info("submit-answers budget_id=%s", payload.budget_id)
    repo = BudgetSessionRepository(db)
    budget_session = repo.get_session(payload.budget_id)
    if not budget_session:
        return error_response(404, "budget_session_not_found", "Budget session not found.")

    partial_model = budget_session.partial
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
    apply_answers_url = f"{CLARIFICATION_BASE}/apply-answers"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            clarification_response = await client.post(apply_answers_url, json=request_body)
            clarification_response.raise_for_status()
    except httpx.HTTPStatusError:
        return error_response(
            502,
            "upstream_service_unavailable",
            "Clarification service returned an error response.",
        )
    except httpx.RequestError as exc:
        logger.warning("Request to %s failed: %s", apply_answers_url, exc)
        return error_response(
            502,
            "upstream_service_unavailable",
            "Clarification service is unavailable.",
        )

    apply_data: Dict[str, Any] = clarification_response.json()

    updated_model = apply_data.get("updated_model")
    repo.update_final(
        budget_session,
        updated_model,
        source_ip=_client_ip(request),
        details={"answer_count": len(payload.answers or {})},
    )

    # TODO: surface ready_for_summary flag to the client once downstream contract is finalized.
    return {
        "budget_id": payload.budget_id,
        "status": "ready_for_summary",
    }


@app.get("/summary-and-suggestions", response_model=None)
async def summary_and_suggestions(
    budget_id: str,
    db: Session = Depends(get_session),
) -> Dict[str, Any] | JSONResponse:
    """Finishes the pipeline by calling optimization service /summarize-and-optimize for insights."""
    repo = BudgetSessionRepository(db)
    budget_session = repo.get_session(budget_id)
    if not budget_session:
        return error_response(404, "budget_session_not_found", "Budget session not found.")

    final_model = budget_session.final
    if final_model is None:
        return error_response(
            400,
            "answers_incomplete",
            "Clarification answers are incomplete; please submit answers before requesting the summary.",
        )

    # TODO: propagate user context, auth, and tracing headers downstream.
    optimize_url = f"{OPTIMIZATION_BASE}/summarize-and-optimize"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            optimization_response = await client.post(optimize_url, json=final_model)
            optimization_response.raise_for_status()
    except httpx.HTTPStatusError:
        return error_response(
            502,
            "upstream_service_unavailable",
            "Optimization service returned an error response.",
        )
    except httpx.RequestError as exc:
        logger.warning("Request to %s failed: %s", optimize_url, exc)
        return error_response(
            502,
            "upstream_service_unavailable",
            "Optimization service is unavailable.",
        )

    optimization_data: Dict[str, Any] = optimization_response.json()

    summary_data = optimization_data.get("summary")
    if summary_data is not None:
        surplus = summary_data.get("surplus")
        if surplus is not None:
            logger.info("summary-and-suggestions budget_id=%s surplus=%s", budget_id, surplus)
    return {
        "budget_id": budget_id,
        "summary": summary_data,
        "category_shares": optimization_data.get("category_shares"),
        "suggestions": optimization_data.get("suggestions"),
    }
