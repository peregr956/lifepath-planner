from __future__ import annotations

"""
Provider abstraction for optimization suggestion generation.

This module defines the request/response schema that both deterministic logic
and future LLM-backed implementations must satisfy. Providers accept a unified
budget model plus its computed summary and return a set of suggestion cards
ready for serialization.
"""

import json
import logging
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable

from shared.observability.privacy import hash_payload, redact_fields

from budget_model import Summary, UnifiedBudgetModel
from generate_suggestions import Suggestion, generate_suggestions

logger = logging.getLogger(__name__)

SAFE_CONTEXT_KEYS = frozenset({"locale", "surface", "channel"})


@dataclass(slots=True)
class SuggestionProviderRequest:
    """
    Contract for suggestion generation inputs.

    Attributes:
        model: Fully clarified UnifiedBudgetModel.
        summary: Pre-computed Summary for the same model instance.
        context: Optional metadata (audience, feature flags, etc.) that
            providers may use to shape their outputs.
    """

    model: UnifiedBudgetModel
    summary: Summary
    context: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SuggestionProviderResponse:
    """
    Contract for suggestion generation outputs.

    Attributes:
        suggestions: Ordered list of Suggestion dataclasses so downstream
            serializers can expose them without knowing which provider was used.
    """

    suggestions: List[Suggestion] = field(default_factory=list)


@runtime_checkable
class SuggestionProvider(Protocol):
    """
    Interface for swappable suggestion generators.

    Implementations should provide a descriptive `name` attribute and a
    `generate` method that returns structured suggestion payloads.
    """

    name: str

    def generate(self, request: SuggestionProviderRequest) -> SuggestionProviderResponse:
        """Produce optimization suggestions for the provided model summary."""
        ...


class DeterministicSuggestionProvider:
    """
    Default provider that delegates to the existing rule-based heuristics.

    Wrapping the heuristic function allows configuration-driven swaps between
    deterministic logic and future external providers.
    """

    name = "deterministic"

    def generate(self, request: SuggestionProviderRequest) -> SuggestionProviderResponse:
        suggestions = generate_suggestions(request.model, request.summary)
        response = SuggestionProviderResponse(suggestions=suggestions)
        _log_suggestion_metrics(self.name, request, response.suggestions)
        return response


class MockSuggestionProvider:
    """
    Fixture-driven provider suitable for tests or offline demos.
    """

    name = "mock"

    def __init__(self, fixture_path: str | Path | None = None):
        env_override = os.getenv("SUGGESTION_PROVIDER_FIXTURE")
        candidate = fixture_path or env_override
        if candidate is None:
            candidate = _default_fixture_path()

        self._fixture_path = Path(candidate)
        if not self._fixture_path.exists():
            raise FileNotFoundError(
                f"Mock suggestion provider fixture not found at {self._fixture_path}"
            )

    def generate(self, request: SuggestionProviderRequest) -> SuggestionProviderResponse:
        payload = self._load_fixture()
        suggestion_payloads = payload.get("suggestions", [])
        suggestions = [_deserialize_suggestion(item) for item in suggestion_payloads]
        response = SuggestionProviderResponse(suggestions=suggestions)
        _log_suggestion_metrics(self.name, request, response.suggestions)
        return response

    def _load_fixture(self) -> Dict[str, Any]:
        try:
            return json.loads(self._fixture_path.read_text())
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Mock suggestion provider fixture is not valid JSON: {self._fixture_path}"
            ) from exc


def _default_fixture_path() -> Path:
    service_root = Path(__file__).resolve().parents[1]
    return service_root / "tests" / "fixtures" / "mock_suggestions_provider.json"


def _deserialize_suggestion(item: Dict[str, Any]) -> Suggestion:
    return Suggestion(
        id=item["id"],
        title=item["title"],
        description=item["description"],
        expected_monthly_impact=float(item["expected_monthly_impact"]),
        rationale=item["rationale"],
        tradeoffs=item["tradeoffs"],
    )


def build_suggestion_provider(
    name: str | None,
    *,
    settings: Optional[Any] = None,
) -> SuggestionProvider:
    """
    Factory that instantiates the requested suggestion provider implementation.
    """

    normalized = (name or "").strip().lower()
    if normalized in ("", "deterministic"):
        return DeterministicSuggestionProvider()
    if normalized == "mock":
        return MockSuggestionProvider()
    if normalized == "openai":
        # Import lazily to avoid circular dependencies and path issues
        from providers.openai_suggestions import OpenAISuggestionProvider
        return OpenAISuggestionProvider(settings=settings)

    raise ValueError(f"Unsupported suggestion provider '{name}'")


def _log_suggestion_metrics(
    provider_name: str,
    request: SuggestionProviderRequest,
    suggestions: List[Suggestion],
) -> None:
    logger.info(
        {
            "event": "suggestion_provider_output",
            "provider": provider_name,
            "suggestion_count": len(suggestions),
            "suggestion_hashes": [_hash_suggestion_payload(suggestion) for suggestion in suggestions],
            "model_hash": hash_payload(asdict(request.model)),
            "summary_hash": hash_payload(asdict(request.summary)),
            "context_snapshot": _safe_context_snapshot(request.context),
        }
    )


def _hash_suggestion_payload(suggestion: Suggestion) -> str:
    return hash_payload(asdict(suggestion))


def _safe_context_snapshot(context: Dict[str, Any]) -> Dict[str, Any]:
    if not context:
        return {}
    return redact_fields(context, SAFE_CONTEXT_KEYS)



