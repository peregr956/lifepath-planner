# Operations Runbook

This guide explains how to operate the LifePath Planner services now that Step 7 (observability + guardrails) is in place.

## Secret Management

### Source of truth

- **Vault** – All ChatGPT/OpenAI keys live in the `LifePath` 1Password vault under items `LLM/OpenAI Dev` and `LLM/OpenAI Prod`.
- **Subfields** – Each item exposes `api_key`, `model` (default slug), and `api_base`. Update both the dev and prod items whenever a rotation occurs.
- **Access** – Members of the `lifepath-ai` 1Password group have read/write permissions; audit logs live in 1Password for any changes.

### Local `.env` workflow

1. Copy the checked-in `.env.example` to `.env`.
2. Sign in to 1Password CLI (`op signin <account>`).
3. Pull secrets directly into the file (avoid manual copy/paste):
   - `op read "op://LifePath/LLM/OpenAI Dev/api_key" | xargs -I{} sed -i '' 's|OPENAI_API_KEY=.*|OPENAI_API_KEY={}|' .env`
   - `op read "op://LifePath/LLM/OpenAI Dev/model" | xargs -I{} sed -i '' 's|OPENAI_MODEL=.*|OPENAI_MODEL={}|' .env`
   - `op read "op://LifePath/LLM/OpenAI Dev/api_base" | xargs -I{} sed -i '' 's|OPENAI_API_BASE=.*|OPENAI_API_BASE={}|' .env`
4. Run `op run --env-file=.env -- npm run dev` (or `uvicorn ...`) to ensure processes inherit the secrets without leaving them in shell history.
5. Never commit `.env`; `.gitignore` already enforces this, and pre-commit hooks should block accidental additions.

### GitHub Actions & hosted environments

1. Mirror the same variables as repository or environment secrets (`OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_API_BASE`).
2. Use the 1Password CLI on a trusted workstation to sync secrets into GitHub:
   - `gh secret set OPENAI_API_KEY --body "$(op read op://LifePath/LLM/OpenAI\ Prod/api_key)"`
   - Repeat for `OPENAI_MODEL` and `OPENAI_API_BASE`, targeting the appropriate environment (`prod`, `staging`, etc).
3. Workflows should load the secrets at the top of each job (`env:` block) and pass them only to the steps that require LLM access.
4. For self-hosted or container deployments, export the same variables in the orchestrator (Docker, ECS task definition, etc.) instead of baking keys into images.

### Rotation policy

- **Cadence** – Rotate the OpenAI key monthly or immediately after any suspected leak.
- **Execution**:
  1. Generate a new key in the OpenAI dashboard.
  2. Update the corresponding 1Password items (`api_key`, and optionally `model`/`api_base`).
  3. Re-sync GitHub Actions secrets via `gh secret set ...`.
  4. Redeploy services so the new environment variables take effect.
  5. Verify traffic in telemetry dashboards (or `op run --env` locally) to confirm requests succeed with the new key.
- **Revocation** – Delete the old key in OpenAI once all workloads confirm green to avoid orphaned credentials.

### Rate-limit & telemetry guardrails

- Tie OpenAI usage back to the API Gateway limiter. Keep `GATEWAY_RATE_LIMIT_PER_MIN` and `GATEWAY_RATE_LIMIT_BURST` at conservative defaults (60/20) for staging to prevent runaway token burn.
- For load tests, temporarily raise both values and add `request_id` to the test logs so any spike can be attributed to a known campaign.
- Telemetry (`ENABLE_TELEMETRY=true`) should remain enabled in staging/prod so that trace sampling reveals sudden increases in `/ai/*` calls. Pair traces with structured logs containing the OpenAI `model` and hashed payload metadata (see `observability/privacy.py`).
- If telemetry detects rate-limit hits >5% of requests, increase burst only after validating that caching or queueing cannot absorb the spike.

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

### LLM-specific guardrails

- Every outbound OpenAI call flows through the gateway, so the limiter effectively caps token spend and exposure. Keep the limiter enabled even for internal environments so compromised keys cannot be brute-forced via automated scripts.
- Pair limiter alerts with telemetry dashboards to detect anomalies (e.g., sudden burst on `POST /clarify`) and suspend the key in OpenAI if traffic looks malicious.
- When raising limits for a sanctioned test, document the window plus expected RPS in this runbook and schedule a reminder to reset values immediately after the test.

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

## ChatGPT Provider Monitoring

### Key log events

Both OpenAI providers emit structured logs for monitoring:

| Event | Provider | Description |
| --- | --- | --- |
| `openai_clarification_request` | clarification | Emitted before calling OpenAI; includes `prompt_hash`, `model_hash` |
| `openai_clarification_response` | clarification | Emitted on success; includes `question_count`, `response_hash` |
| `openai_clarification_error` | clarification | Emitted on API error; includes `error_type`, `error_message` |
| `openai_fallback_to_deterministic` | clarification | Emitted when falling back after failure |
| `openai_suggestion_request` | optimization | Emitted before calling OpenAI; includes `prompt_hash`, `budget_model_hash`, `summary_hash` |
| `openai_suggestion_response` | optimization | Emitted on success; includes `suggestion_count`, `response_hash` |
| `openai_suggestion_error` | optimization | Emitted on API error; includes `error_type`, `error_message` |

### Monitoring queries

Sample log queries for common monitoring scenarios:

```
# OpenAI error rate (last hour)
event:openai_*_error | stats count by error_type

# Fallback frequency
event:openai_fallback_to_deterministic | timechart count

# Response latency distribution (requires span data)
service_name:clarification-service span_name:openai_chat_completion | stats avg(duration_ms), p95(duration_ms)

# Provider usage by type
event:*_provider_output | stats count by provider
```

### Quota monitoring

OpenAI enforces rate limits and token quotas. Monitor for these patterns:

1. **Rate limit hits** – Log events with `error_type: RateLimitError` indicate quota exhaustion.
   - Action: Reduce `GATEWAY_RATE_LIMIT_PER_MIN` to throttle inbound requests.
   - Consider caching repeated clarification/suggestion calls per session.

2. **Token budget overruns** – Large prompts or verbose responses may exceed `max_tokens`.
   - Tune `CLARIFICATION_PROVIDER_MAX_TOKENS` / `SUGGESTION_PROVIDER_MAX_TOKENS`.
   - Review prompt templates if truncation becomes frequent.

3. **Billing spikes** – Cross-reference OpenAI dashboard with telemetry `request_id`s.
   - Identify high-volume users/sessions from gateway audit logs.
   - Implement per-user rate limiting if abuse is suspected.

### Fallback behavior

When OpenAI calls fail, both providers automatically fall back to deterministic heuristics:

- **Clarification**: Returns rule-based questions from `question_generator.py`
- **Suggestions**: Returns heuristic suggestions from `generate_suggestions.py`

Fallback ensures the user flow continues even during API outages, but the quality
of questions/suggestions may be reduced. Monitor `openai_fallback_to_deterministic`
events and alert if the rate exceeds 5% over a 15-minute window.

### Testing without real API calls

Run the mocked test suites to exercise OpenAI provider logic:

```bash
# Clarification provider tests (mocked)
pytest services/clarification-service/tests/test_openai_clarification_provider.py

# Suggestion provider tests (mocked)
pytest services/optimization-service/tests/test_openai_suggestion_provider.py
```

To run the full pipeline with stubbed OpenAI responses, set providers to `mock`:

```bash
CLARIFICATION_PROVIDER=mock SUGGESTION_PROVIDER=mock pytest tests/test_deterministic_pipeline.py
```

Document any deviations or production overrides directly in this file to keep the runbook authoritative.

