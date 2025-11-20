# Operations Runbook

This guide explains how to operate the LifePath Planner services now that Step 7 (observability + guardrails) is in place.

## Telemetry & Tracing

All FastAPI services call `observability.telemetry.setup_telemetry` at startup. The helper emits JSON logs plus OpenTelemetry spans when enabled via environment variables:

| Env var | Default | Description |
| --- | --- | --- |
| `ENABLE_TELEMETRY` | `false` | When `true`, enable OTLP export and FastAPI/HTTPX instrumentation. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318/v1/traces` | Collector endpoint for spans. |
| `OTEL_SERVICE_NAME` | per-service logical name | Override the service label reported to OTLP backends. |
| `OTEL_CONSOLE_EXPORT` | `false` | When `true`, mirror spans to stdout for local debugging. |

The logging bootstrap uses `python-json-logger` to include `trace_id`, `span_id`, `service_name`, and the `x-request-id` correlation header in every structured log line. Telemetry can be toggled without code changes:

```bash
ENABLE_TELEMETRY=true \
OTEL_CONSOLE_EXPORT=true \
OTEL_SERVICE_NAME=api-gateway-dev \
uvicorn src.main:app --reload --port 9000
```

Disable spans entirely (useful for smoke tests) by unsetting `ENABLE_TELEMETRY` or setting it to `false`. When spans are on, inbound request context automatically propagates to downstream HTTPX calls, so traces stitched across services share the same `trace_id`.

### Verification steps

1. Start an OTLP collector (e.g., `docker run -p4318:4318 otel/opentelemetry-collector-contrib`).
2. Export `ENABLE_TELEMETRY=true OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces`.
3. Trigger `POST /upload-budget`; confirm spans appear in the collector and that log lines include both `request_id` and `trace_id`.

## Rate Limiting

The API Gateway now enforces a per-IP sliding-window limiter before requests reach the routers.

| Env var | Default | Description |
| --- | --- | --- |
| `GATEWAY_RATE_LIMIT_PER_MIN` | `60` | Allowed requests per minute per client IP. |
| `GATEWAY_RATE_LIMIT_BURST` | `20` | Temporary burst tokens layered on top of the minute bucket. |

Blocked calls return HTTP 429 with a `Retry-After` header and emit a `rate_limited` structured log that includes the offending IP + request ID. To temporarily raise capacity during load tests:

1. Export larger values: `export GATEWAY_RATE_LIMIT_PER_MIN=500 GATEWAY_RATE_LIMIT_BURST=200`.
2. Restart the gateway (the limiter initializes on startup).
3. Revert the env vars once traffic normalizes.

Because the limiter is in-memory, it should remain a stop-gap until a shared store (Redis) or upstream edge proxy is introduced for multi-instance deployments.

## Logging & PII Guardrails

- All logs are JSON and should avoid embedding raw prompts, model payloads, or free-text notes.
- Shared helpers live in `observability/privacy.py`:
  - `hash_payload(value)` → SHA-256 hex string for any payload (used for prompt/response hashes).
  - `redact_fields(payload, allowed_keys)` → clones dicts while replacing unknown keys with `[REDACTED]`.
- `DeterministicClarificationProvider` and `MockClarificationProvider` log only hashes (`model_hash`, `question_hashes`) plus a redacted context snapshot. No question prompt text is ever persisted.
- `DeterministicSuggestionProvider` and its mock analog follow the same pattern (`suggestion_hashes`, hashed `summary`/`model`).

When adding new AI/LLM adapters:

1. Hash the entire prompt and response objects before logging (`hash_payload(json_payload)`).
2. Use `redact_fields` (or a similar whitelist) for contextual metadata that may contain user identifiers.
3. Include `request_id` in every log payload so PII-free records can still be correlated end-to-end.

## Quick Reference (Enable/Disable Telemetry Locally)

- **Enable**: `ENABLE_TELEMETRY=true OTEL_CONSOLE_EXPORT=true uvicorn src.main:app --reload`
- **Disable**: unset `ENABLE_TELEMETRY` or set it to `false` (JSON logging remains, but spans stop).
- **Change service label**: `OTEL_SERVICE_NAME=optimization-service-staging`.
- **Switch collector**: update `OTEL_EXPORTER_OTLP_ENDPOINT` (supports HTTP or gRPC endpoints from the OpenTelemetry exporter package).

Document any deviations or production overrides directly in this file to keep the runbook authoritative.

