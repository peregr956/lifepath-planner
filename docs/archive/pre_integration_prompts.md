# Pre-Integration Execution Guide

> **Historical Document**: This document records the seven pre-integration workstreams
> that were completed before ChatGPT integration. All steps have been implemented.
> See `docs/AI_integration_readiness.md` for the final integration status.

This document turns the pre-integration priorities into discrete, agent-ready
steps. Each step includes a ready-to-run prompt that can be handed to a new
agent (or teammate) so they understand the objective, key files, and success
criteria before ChatGPT is integrated into the flow.

**General guidance for all steps**
- Keep scope tight: finish the described objective before starting adjacent work.
- Update relevant documentation or READMEs when behavior/configuration changes.
- Add TODOs or cleanup notes _only_ when they are necessary follow-ups for the
  work performed in that step.
- If additional gaps are discovered, capture them in issues/backlog instead of
  silently expanding the step.

---

## Step 1 — Stabilize Clarification Answer Mapping

**Objective**  
De-risk `/apply-answers` by validating all incoming `field_id`s, extending
`apply_answers_to_model`, and adding regression tests for the clarified model.

**Prompt for Execution**
```
You are working in /Users/kyle/Cursor/lifepath-planner.
Focus on the clarification service (`services/clarification-service`).
Goals:
1. Implement validation + error reporting for `/apply-answers`.
2. Extend `normalization.apply_answers_to_model` so every supported field_id (essential flags, optimization focus, income type/stability, debt fields) round-trips into the unified model.
3. Add unit tests covering happy paths and schema violations.
Relevant files: `src/main.py`, `src/normalization.py`, `tests/test_normalization.py`.
Deliverables: passing tests plus documentation/comments summarizing accepted field_ids.
```

---

## Step 2 — Build the UI Schema Builder

**Objective**  
Replace the placeholder UI schema with structured sections that reflect income,
expenses, preferences, and summaries per `docs/ui_components_spec.md`.

**Prompt for Execution**
```
Work in /Users/kyle/Cursor/lifepath-planner/services/clarification-service.
Update `src/ui_schema_builder.py` so `build_initial_ui_schema` emits real sections with component descriptors that match `docs/ui_components_spec.md`.
Ensure schemas include bindings for clarification questions and add tests (new or existing) that snapshot the schema for representative budgets.
Document any conventions in `docs/ui_components_spec.md` if you extend the spec.
```

---

## Step 3 — Persist Budget Sessions and Audit Trails

**Objective**  
Move the API gateway's in-memory `budgets` store into durable persistence (SQLite or similar), introduce basic auditing, and keep endpoints backward-compatible.

**Prompt for Execution**
```
Within /Users/kyle/Cursor/lifepath-planner/services/api-gateway:
1. Replace the global `budgets` dict in `src/main.py` with a persistence layer (SQLite/Postgres via SQLAlchemy or lightweight ORM).
2. Store draft/partial/final models plus timestamps and minimal audit metadata (e.g., source IP, step transitions).
3. Update existing endpoints to read/write from the store and add migration/setup instructions in `services/api-gateway/README.md`.
4. Add tests (or integration fixtures) proving sessions survive process restarts.
```

---

## Step 4 — Harden Service-to-Service Calls

**Objective**  
Add shared HTTP client utilities with retries, timeouts, structured logging, and correlation IDs for ingestion, clarification, and optimization calls.

**Prompt for Execution**
```
Scope: /Users/kyle/Cursor/lifepath-planner/services/api-gateway.
Tasks:
1. Introduce a reusable httpx client helper (e.g., `client.py`) that handles retries/backoff, timeouts, and correlation-ID headers.
2. Update `/upload-budget`, `/clarification-questions`, `/submit-answers`, and `/summary-and-suggestions` to use the helper.
3. Emit structured logs (JSON or dict) with request IDs and upstream latency.
4. Cover failure + retry scenarios with unit tests or mocked responses.
```

---

## Step 5 — Expand Deterministic End-to-End Tests

**Objective**  
Add full-stack regression tests (or service-level suites) that cover upload → clarify → answers → summary loops with fixture data.

**Prompt for Execution**
```
Repository root: /Users/kyle/Cursor/lifepath-planner.
Create or extend tests so we can run a deterministic flow without the UI:
1. Provide sample CSV/XLSX fixtures under `services/budget-ingestion-service/tests/fixtures`.
2. Write integration tests (pytest) that simulate the entire pipeline, asserting on clarification question payloads, UI schema, computed summaries, and suggestions.
3. Snapshot critical responses so future LLM-driven changes can be compared against the deterministic baseline.
Document how to run these tests in README.md.
```

---

## Step 6 — Define the LLM Adapter Boundary

**Objective**  
Create an abstraction for question/suggestion generation so swapping in ChatGPT is a configuration change, not a rewrite.

**Prompt for Execution**
```
Target services: clarification + optimization.
1. Design an interface (e.g., `ClarificationQuestionProvider`, `SuggestionProvider`) with deterministic default implementations.
2. Move current rule-based logic behind the interface.
3. Document the request/response JSON contract and add a mock provider for tests.
4. Expose configuration (env vars) to switch providers without code changes.
Update relevant READMEs to describe the extension points.
```

See `docs/llm_adapter.md` for the finalized provider contract and configuration
details.

---

## Step 7 — Observability and Guardrails

**Objective**  
Instrument the stack with tracing/logging, add rate limiting, and outline PII/token safeguards before externalizing AI calls.

**Prompt for Execution**
```
Scope: gateway + all services.
Tasks:
1. Add OpenTelemetry (or structured logging) spans for each request + upstream call.
2. Implement simple rate limiting/throttling at the gateway.
3. Define logging guidelines that redact PII and capture prompt/response hashes (not raw content) for future LLM calls.
4. Document operational runbooks in `docs/roadmap.md` or a new `docs/operations.md`.
Provide instructions for enabling/disabling telemetry locally.
```

Runbook deliverables now live in `docs/operations.md`; update that file whenever telemetry, rate limiting, or logging guardrails change.

---






