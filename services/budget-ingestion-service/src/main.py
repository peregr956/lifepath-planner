"""
Budget Ingestion Service accepts budget spreadsheets from the UI and maps them into
structured DraftBudgetModels so downstream services can reason about consistent data.
"""

from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing_extensions import Literal

from .models.raw_budget import DraftBudgetModel, RawBudgetLine
from .parsers.csv_parser import parse_csv_to_draft_model
from .parsers.xlsx_parser import parse_xlsx_to_draft_model

app = FastAPI(title="Budget Ingestion Service")


class RawBudgetLineModel(BaseModel):
    source_row_index: int
    date: Optional[date]
    category_label: str
    description: Optional[str]
    amount: float
    metadata: Dict[str, Any]


class DraftBudgetResponseModel(BaseModel):
    detected_format: Literal["categorical", "ledger", "unknown"]
    notes: Optional[str] = None
    format_hints: Optional[Dict[str, Any]] = None
    lines: List[RawBudgetLineModel] = Field(default_factory=list)


CSV_CONTENT_TYPES = {
    "text/csv",
    "application/csv",
    "text/plain",
}
XLSX_CONTENT_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
}


@app.get("/health")
def health_check() -> dict:
    """
    Report overall service health; expects no payload.
    Returns a minimal status object for uptime probes and orchestrators.
    """
    return {"status": "ok", "service": "budget-ingestion-service"}


@app.post("/ingest", response_model=DraftBudgetResponseModel, response_model_exclude_none=True)
async def ingest_budget(file: UploadFile = File(...)) -> DraftBudgetResponseModel:
    """
    Parse an uploaded CSV or XLSX budget file into the canonical DraftBudgetModel schema.
    Expects a multipart/form-data payload with a single `file` field containing CSV/XLSX bytes.
    Returns a `DraftBudgetResponseModel` describing the detected format, notes, and normalized lines.
    """
    parser_kind = _determine_parser_kind(file)
    if parser_kind is None:
        return JSONResponse(status_code=400, content={"error": "unsupported_file_type"})

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    draft_model = _parse_file(parser_kind, file_bytes)
    return _draft_model_to_response(draft_model)


def _determine_parser_kind(file: UploadFile) -> Optional[str]:
    content_type = (file.content_type or "").lower()
    filename = (file.filename or "").lower()

    if content_type in CSV_CONTENT_TYPES or filename.endswith(".csv"):
        return "csv"
    if content_type in XLSX_CONTENT_TYPES or filename.endswith(".xlsx"):
        return "xlsx"
    return None


def _parse_file(kind: str, file_bytes: bytes) -> DraftBudgetModel:
    if kind == "csv":
        return parse_csv_to_draft_model(file_bytes)
    if kind == "xlsx":
        return parse_xlsx_to_draft_model(file_bytes)
    raise ValueError(f"Unsupported parser kind: {kind}")


def _draft_model_to_response(model: DraftBudgetModel) -> DraftBudgetResponseModel:
    return DraftBudgetResponseModel(
        detected_format=model.detected_format,
        notes=model.notes,
        format_hints=model.format_hints,
        lines=[_raw_line_to_model(line) for line in model.lines],
    )


def _raw_line_to_model(line: RawBudgetLine) -> RawBudgetLineModel:
    return RawBudgetLineModel(
        source_row_index=line.source_row_index,
        date=line.date,
        category_label=line.category_label,
        description=line.description,
        amount=line.amount,
        metadata=dict(line.metadata),
    )
