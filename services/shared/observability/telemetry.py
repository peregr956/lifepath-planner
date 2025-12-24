"""
Telemetry bootstrap utilities shared across services.

`setup_telemetry` wires OpenTelemetry tracing, HTTP instrumentation, and JSON
logging (with trace/request IDs) using environment-driven configuration so the
stack can toggle observability without bespoke service wiring.
"""

from __future__ import annotations

import logging
import os
from contextvars import ContextVar, Token
from uuid import uuid4

from fastapi import FastAPI, Request
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.trace import Span, SpanContext
from pythonjsonlogger import jsonlogger

CORRELATION_ID_HEADER = "x-request-id"
RequestContextToken = Token

_httpx_instrumented = False
_logging_configured = False
_request_id_ctx_var: ContextVar[str | None] = ContextVar("request_id", default=None)


def setup_telemetry(app: FastAPI, service_name: str) -> None:
    """
    Configure tracing + logging for the provided FastAPI app.

    Args:
        app: FastAPI app instance that should emit spans/logs.
        service_name: Logical service identifier used for OTLP resources.
    """

    enable_traces = _parse_bool(os.getenv("ENABLE_TELEMETRY", "false"))
    enable_console_export = _parse_bool(os.getenv("OTEL_CONSOLE_EXPORT", "false"))
    service_label = os.getenv("OTEL_SERVICE_NAME", service_name)

    _configure_logging(service_label, enable_traces)

    if enable_traces:
        _configure_tracing(service_label, enable_console_export)
        FastAPIInstrumentor.instrument_app(app)
        _instrument_httpx()
        LoggingInstrumentor().instrument(set_logging_format=False)


def ensure_request_id(request: Request | None, header_name: str = CORRELATION_ID_HEADER) -> str:
    """
    Retrieve the inbound request ID (x-request-id) or generate a new UUID4 value.
    """

    if request is not None:
        existing = request.headers.get(header_name) or getattr(request.state, "request_id", None)
        if existing:
            request.state.request_id = existing
            return existing

    request_id = os.getenv("REQUEST_ID_PREFIX", "") + str(uuid4())
    if request is not None:
        request.state.request_id = request_id
    return request_id


def bind_request_context(request_id: str | None) -> RequestContextToken:
    """
    Store the inbound request ID in a ContextVar so log records can include it.
    """

    return _request_id_ctx_var.set(request_id)


def reset_request_context(token: RequestContextToken | None) -> None:
    """Reset the ContextVar token emitted by `bind_request_context`."""

    if token is not None:
        _request_id_ctx_var.reset(token)


def _configure_logging(service_name: str, enable_traces: bool) -> None:
    global _logging_configured
    if _logging_configured:
        return

    formatter = jsonlogger.JsonFormatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s %(trace_id)s %(span_id)s %(service_name)s %(request_id)s"
    )
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    handler.addFilter(_TelemetryLogFilter(service_name, enable_traces))

    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
    _logging_configured = True


def _configure_tracing(service_name: str, enable_console_export: bool) -> None:
    if isinstance(trace.get_tracer_provider(), TracerProvider):
        # Already configured globally; skip duplicate setup.
        return

    resource = Resource.create({SERVICE_NAME: service_name})
    provider = TracerProvider(resource=resource)

    exporter = OTLPSpanExporter(endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318/v1/traces"))
    provider.add_span_processor(BatchSpanProcessor(exporter))
    if enable_console_export:
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))

    trace.set_tracer_provider(provider)


def _instrument_httpx() -> None:
    global _httpx_instrumented
    if _httpx_instrumented:
        return
    HTTPXClientInstrumentor().instrument()
    _httpx_instrumented = True


def _parse_bool(raw: str) -> bool:
    return raw.lower() in {"1", "true", "yes", "on"}


class _TelemetryLogFilter(logging.Filter):
    def __init__(self, service_name: str, traces_enabled: bool) -> None:
        super().__init__()
        self._service_name = service_name
        self._traces_enabled = traces_enabled

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: D401
        record.service_name = self._service_name
        record.request_id = _request_id_ctx_var.get()
        trace_id: str | None = None
        span_id: str | None = None

        if self._traces_enabled:
            span = trace.get_current_span()
            span_context = span.get_span_context() if isinstance(span, Span) else None
            if span_context and isinstance(span_context, SpanContext) and span_context.is_valid:
                trace_id = format(span_context.trace_id, "032x")
                span_id = format(span_context.span_id, "016x")

        record.trace_id = trace_id
        record.span_id = span_id
        return True



