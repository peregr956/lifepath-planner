import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple
from uuid import uuid4

import httpx
from fastapi import Depends, FastAPI, File, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

SERVICES_ROOT = SRC_DIR.parents[1]
if str(SERVICES_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICES_ROOT))

from answer_validation import validate_answers
from http_client import ResilientHttpClient
from persistence.database import get_session, init_db
from persistence.repository import BudgetSessionRepository
from middleware.rate_limit import SimpleRateLimiter, build_default_rate_limiter
from observability.telemetry import bind_request_context, ensure_request_id, reset_request_context, setup_telemetry

logger = logging.getLogger(__name__)

app = FastAPI(title="API Gateway")
setup_telemetry(app, service_name="api-gateway")
app.state.rate_limiter = build_default_rate_limiter()


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


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = ensure_request_id(request)
    token = bind_request_context(request_id)
    try:
        response = await call_next(request)
        response.headers.setdefault("x-request-id", request_id)
        return response
    finally:
        reset_request_context(token)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    limiter: SimpleRateLimiter = app.state.rate_limiter
    client_id = _client_ip(request) or "unknown"
    allowed, retry_after = await limiter.allow(client_id)
    if allowed:
        return await call_next(request)

    retry_after_header = str(max(1, int(retry_after or 1)))
    logger.warning(
        {
            "event": "rate_limited",
            "request_id": getattr(request.state, "request_id", None),
            "client_ip": client_id,
            "retry_after_seconds": retry_after,
        }
    )
    response = error_response(
        429,
        "rate_limit_exceeded",
        "Too many requests. Please retry shortly.",
    )
    response.headers["Retry-After"] = retry_after_header
    return response


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

http_client = ResilientHttpClient()


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
    request: Request,
    file: UploadFile = File(...),
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

    request_id = ensure_request_id(request)

    ingestion_url = f"{INGESTION_BASE}/ingest"
    try:
        ingestion_response, metrics = await http_client.post(
            ingestion_url,
            files=files,
            request_id=request_id,
        )
    except httpx.HTTPStatusError as exc:
        logger.error(
            {
                "event": "upload_budget_upstream_error",
                "request_id": request_id,
                "url": ingestion_url,
                "status_code": exc.response.status_code,
                "error": str(exc),
            }
        )
        return error_response(
            502,
            "upstream_service_unavailable",
            "Budget ingestion service returned an error response.",
        )
    except httpx.RequestError as exc:
        logger.warning(
            {
                "event": "upload_budget_upstream_unavailable",
                "request_id": request_id,
                "url": ingestion_url,
                "error": str(exc),
            }
        )
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
        details={"filename": filename, "request_id": request_id, **summary_counts},
    )
    logger.info(
        {
            "event": "upload_budget",
            "request_id": request_id,
            "budget_id": budget_id,
            "filename": filename,
            "upstream_latency_ms": metrics.latency_ms,
            "attempts": metrics.attempts,
        }
    )

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

    request_id = ensure_request_id(request)

    clarify_url = f"{CLARIFICATION_BASE}/clarify"
    try:
        clarification_response, metrics = await http_client.post(
            clarify_url,
            json=draft_payload,
            request_id=request_id,
        )
    except httpx.HTTPStatusError as exc:
        logger.error(
            {
                "event": "clarification_questions_upstream_error",
                "request_id": request_id,
                "url": clarify_url,
                "status_code": exc.response.status_code,
                "error": str(exc),
            }
        )
        return error_response(
            502,
            "upstream_service_unavailable",
            "Clarification service returned an error response.",
        )
    except httpx.RequestError as exc:
        logger.warning(
            {
                "event": "clarification_questions_upstream_unavailable",
                "request_id": request_id,
                "url": clarify_url,
                "error": str(exc),
            }
        )
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
        details={"question_count": len(questions), "request_id": request_id},
    )
    logger.info(
        {
            "event": "clarification_questions",
            "request_id": request_id,
            "budget_id": budget_id,
            "question_count": len(questions),
            "upstream_latency_ms": metrics.latency_ms,
            "attempts": metrics.attempts,
        }
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


ESSENTIAL_PREFIX = "essential_"
SUPPORTED_SIMPLE_FIELD_IDS = {
    "optimization_focus",
    "primary_income_type",
    "primary_income_stability",
}
VALID_OPTIMIZATION_FOCUS = {"debt", "savings", "balanced"}
PRIMARY_INCOME_TYPE_FLAGS = {"net", "gross"}
PRIMARY_INCOME_STABILITY_VALUES = {"stable", "variable", "seasonal"}
TRUE_STRINGS = {"true", "1", "yes", "y", "essential", "needed"}
FALSE_STRINGS = {"false", "0", "no", "n", "nonessential", "flexible"}
DEBT_FIELD_SUFFIXES: Tuple[Tuple[str, str], ...] = (
    ("_rate_change_new_rate", "rate_change_new_rate"),
    ("_rate_change_date", "rate_change_date"),
    ("_interest_rate", "interest_rate"),
    ("_min_payment", "min_payment"),
    ("_balance", "balance"),
    ("_priority", "priority"),
    ("_approximate", "approximate"),
)
VALID_DEBT_PRIORITIES = {"high", "medium", "low"}
AnswerIssue = Dict[str, str]

@app.post("/submit-answers", response_model=None)
async def submit_answers(
    payload: SubmitAnswersPayload,
    request: Request,
    db: Session = Depends(get_session),
) -> Dict[str, Any] | JSONResponse:
    """Calls clarification service /apply-answers to merge user answers into a final unified model."""
    request_id = ensure_request_id(request)
    logger.info(
        {
            "event": "submit_answers_received",
            "request_id": request_id,
            "budget_id": payload.budget_id,
        }
    )
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

    if not isinstance(partial_model, dict):
        logger.error(
            {
                "event": "submit_answers_invalid_model",
                "request_id": request_id,
                "budget_id": payload.budget_id,
                "detail": "Stored partial model is not a dict.",
            }
        )
        return error_response(
            500,
            "partial_model_corrupted",
            "Stored clarification data is malformed for this budget.",
        )

    answers = payload.answers or {}
    validation_errors = validate_answers(partial_model, answers)
    if validation_errors:
        logger.warning(
            {
                "event": "submit_answers_validation_failed",
                "request_id": request_id,
                "budget_id": payload.budget_id,
                "issue_count": len(validation_errors),
                "reasons": sorted({issue.get("reason") for issue in validation_errors if issue.get("reason")}),
            }
        )
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_answers",
                "details": {"field_errors": validation_errors},
            },
        )

    answer_count = len(answers)
    request_body = {
        "partial_model": partial_model,
        "answers": answers,
    }

    apply_answers_url = f"{CLARIFICATION_BASE}/apply-answers"
    try:
        clarification_response, metrics = await http_client.post(
            apply_answers_url,
            json=request_body,
            request_id=request_id,
        )
    except httpx.HTTPStatusError as exc:
        logger.error(
            {
                "event": "submit_answers_upstream_error",
                "request_id": request_id,
                "url": apply_answers_url,
                "status_code": exc.response.status_code,
                "error": str(exc),
            }
        )
        return error_response(
            502,
            "upstream_service_unavailable",
            "Clarification service returned an error response.",
        )
    except httpx.RequestError as exc:
        logger.warning(
            {
                "event": "submit_answers_upstream_unavailable",
                "request_id": request_id,
                "url": apply_answers_url,
                "error": str(exc),
            }
        )
        return error_response(
            502,
            "upstream_service_unavailable",
            "Clarification service is unavailable.",
        )

    apply_data: Dict[str, Any] = clarification_response.json()
    ready_for_summary = bool(apply_data.get("ready_for_summary"))
    updated_model = apply_data.get("updated_model")
    repo.update_final(
        budget_session,
        updated_model,
        source_ip=_client_ip(request),
        details={
            "answer_count": answer_count,
            "ready_for_summary": ready_for_summary,
            "request_id": request_id,
        },
    )

    logger.info(
        {
            "event": "submit_answers",
            "request_id": request_id,
            "budget_id": payload.budget_id,
            "answer_count": answer_count,
            "upstream_latency_ms": metrics.latency_ms,
            "attempts": metrics.attempts,
            "ready_for_summary": ready_for_summary,
        }
    )

    status = "ready_for_summary" if ready_for_summary else "clarifying"
    return {
        "budget_id": payload.budget_id,
        "status": status,
        "ready_for_summary": ready_for_summary,
    }


@app.get("/summary-and-suggestions", response_model=None)
async def summary_and_suggestions(
    budget_id: str,
    request: Request,
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

    request_id = ensure_request_id(request)

    optimize_url = f"{OPTIMIZATION_BASE}/summarize-and-optimize"
    try:
        optimization_response, metrics = await http_client.post(
            optimize_url,
            json=final_model,
            request_id=request_id,
        )
    except httpx.HTTPStatusError as exc:
        logger.error(
            {
                "event": "summary_upstream_error",
                "request_id": request_id,
                "url": optimize_url,
                "status_code": exc.response.status_code,
                "error": str(exc),
            }
        )
        return error_response(
            502,
            "upstream_service_unavailable",
            "Optimization service returned an error response.",
        )
    except httpx.RequestError as exc:
        logger.warning(
            {
                "event": "summary_upstream_unavailable",
                "request_id": request_id,
                "url": optimize_url,
                "error": str(exc),
            }
        )
        return error_response(
            502,
            "upstream_service_unavailable",
            "Optimization service is unavailable.",
        )

    optimization_data: Dict[str, Any] = optimization_response.json()

    summary_data = optimization_data.get("summary")
    logger.info(
        {
            "event": "summary_and_suggestions",
            "request_id": request_id,
            "budget_id": budget_id,
            "upstream_latency_ms": metrics.latency_ms,
            "attempts": metrics.attempts,
            "surplus": summary_data.get("surplus") if summary_data else None,
        }
    )
    return {
        "budget_id": budget_id,
        "summary": summary_data,
        "category_shares": optimization_data.get("category_shares"),
        "suggestions": optimization_data.get("suggestions"),
    }


def validate_answers_payload(partial_model: Dict[str, Any], answers: Dict[str, Any]) -> List[AnswerIssue]:
    """
    Ensure each answer targets a supported field_id and provides a coercible value.
    Mirrors clarification-service semantics so invalid payloads are rejected before proxying upstream.
    """

    if not answers:
        return []

    expenses = _safe_sequence(partial_model.get("expenses"))
    debts = _safe_sequence(partial_model.get("debts"))
    expense_ids = _collect_entry_ids(expenses)
    debt_ids = _collect_entry_ids(debts)

    issues: List[AnswerIssue] = []
    for raw_field_id, raw_value in answers.items():
        issue = _validate_answer_field(raw_field_id, raw_value, expense_ids, debt_ids)
        if issue:
            issues.append(issue)
    return issues


def _validate_answer_field(
    raw_field_id: Any,
    raw_value: Any,
    expense_ids: Set[str],
    debt_ids: Set[str],
) -> AnswerIssue | None:
    if not isinstance(raw_field_id, str):
        return {
            "field_id": str(raw_field_id),
            "reason": "invalid_field_id_type",
            "detail": "Field ids must be non-empty strings.",
        }

    field_id = raw_field_id.strip()
    if not field_id:
        return {
            "field_id": raw_field_id,
            "reason": "empty_field_id",
            "detail": "Field ids must be non-empty strings.",
        }

    if field_id.startswith(ESSENTIAL_PREFIX):
        return _validate_essential_field(field_id, raw_value, expense_ids)

    if field_id in SUPPORTED_SIMPLE_FIELD_IDS:
        return _validate_simple_field(field_id, raw_value)

    debt_target = _parse_debt_field_id(field_id)
    if debt_target:
        return _validate_debt_field(field_id, debt_target, raw_value, debt_ids)

    return {
        "field_id": field_id,
        "reason": "unsupported_field_id",
        "detail": "Field id is not recognized by the clarification schema.",
    }


def _validate_essential_field(field_id: str, raw_value: Any, expense_ids: Set[str]) -> AnswerIssue | None:
    expense_id = field_id[len(ESSENTIAL_PREFIX) :]
    if not expense_id or expense_id not in expense_ids:
        return {
            "field_id": field_id,
            "reason": "unknown_expense",
            "detail": f"Expense '{expense_id or '<missing>'}' is not part of the current partial model.",
        }

    if _coerce_to_bool(raw_value) is None:
        return {
            "field_id": field_id,
            "reason": "invalid_boolean",
            "detail": "Essential flags must be boolean values or boolean-like strings (true/false).",
        }
    return None


def _validate_simple_field(field_id: str, raw_value: Any) -> AnswerIssue | None:
    normalized = _normalize_string(raw_value)

    if field_id == "optimization_focus":
        if normalized in VALID_OPTIMIZATION_FOCUS:
            return None
        return {
            "field_id": field_id,
            "reason": "invalid_choice",
            "detail": "Optimization focus must be one of: debt, savings, balanced.",
        }

    if field_id == "primary_income_type":
        if normalized in PRIMARY_INCOME_TYPE_FLAGS:
            return None
        return {
            "field_id": field_id,
            "reason": "invalid_choice",
            "detail": "Primary income type must be 'net' or 'gross'.",
        }

    if field_id == "primary_income_stability":
        if normalized in PRIMARY_INCOME_STABILITY_VALUES:
            return None
        return {
            "field_id": field_id,
            "reason": "invalid_choice",
            "detail": "Primary income stability must be stable, variable, or seasonal.",
        }

    return {
        "field_id": field_id,
        "reason": "unsupported_field_id",
        "detail": "Field id is not recognized by the clarification schema.",
    }


def _validate_debt_field(
    field_id: str,
    debt_target: Tuple[str, str],
    raw_value: Any,
    debt_ids: Set[str],
) -> AnswerIssue | None:
    debt_id, attribute = debt_target
    if not debt_id or debt_id not in debt_ids:
        return {
            "field_id": field_id,
            "reason": "unknown_debt",
            "detail": f"Debt '{debt_id or '<missing>'}' is not present in the partial model.",
        }

    if attribute in {"balance", "interest_rate", "min_payment", "rate_change_new_rate"}:
        if _coerce_to_number(raw_value) is None:
            return {
                "field_id": field_id,
                "reason": "invalid_number",
                "detail": f"{attribute.replace('_', ' ').title()} must be numeric.",
            }
        return None

    if attribute == "priority":
        normalized = _normalize_string(raw_value)
        if normalized in VALID_DEBT_PRIORITIES:
            return None
        return {
            "field_id": field_id,
            "reason": "invalid_choice",
            "detail": "Debt priority must be high, medium, or low.",
        }

    if attribute == "approximate":
        if _coerce_to_bool(raw_value) is not None:
            return None
        return {
            "field_id": field_id,
            "reason": "invalid_boolean",
            "detail": "Approximate flags must be boolean values or boolean-like strings (true/false).",
        }

    if attribute == "rate_change_date":
        if _coerce_to_date_string(raw_value):
            return None
        return {
            "field_id": field_id,
            "reason": "invalid_date",
            "detail": "Rate change dates must be non-empty strings (preferably YYYY-MM-DD).",
        }

    return {
        "field_id": field_id,
        "reason": "unsupported_field_id",
        "detail": "Field id is not recognized by the clarification schema.",
    }


def _safe_sequence(value: Any) -> Sequence[Dict[str, Any]]:
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return []


def _collect_entry_ids(entries: Sequence[Any]) -> Set[str]:
    collected: Set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        entry_id = entry.get("id")
        if isinstance(entry_id, str) and entry_id:
            collected.add(entry_id)
    return collected


def _parse_debt_field_id(field_id: str) -> Tuple[str, str] | None:
    for suffix, attribute in DEBT_FIELD_SUFFIXES:
        if not field_id.endswith(suffix):
            continue
        debt_id = field_id[: -len(suffix)]
        if debt_id:
            return debt_id, attribute
    return None


def _coerce_to_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if value == 1:
            return True
        if value == 0:
            return False

    normalized = _normalize_string(value)
    if normalized in TRUE_STRINGS:
        return True
    if normalized in FALSE_STRINGS:
        return False
    return None


def _coerce_to_number(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    normalized = _normalize_string(value)
    if normalized is None:
        return None
    try:
        return float(normalized)
    except ValueError:
        return None


def _coerce_to_date_string(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        candidate = value.strip()
        return candidate or None
    candidate = str(value).strip()
    return candidate or None


def _normalize_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        normalized = value.strip().lower()
        return normalized or None
    normalized = str(value).strip().lower()
    return normalized or None
