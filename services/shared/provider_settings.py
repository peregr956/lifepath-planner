from __future__ import annotations

"""
Shared helpers for configuring pluggable AI providers across services.

Both the clarification and optimization services rely on the same set of
environment variables to determine which provider to use and how outbound calls
should be tuned. Loading and validating those settings in one place ensures that
future provider implementations (e.g., OpenAI adapters) receive consistent
timeouts, temperature, and token limits without duplicating parsing logic.
"""

import os
from dataclasses import dataclass
from typing import Optional

SUPPORTED_PROVIDERS = frozenset({"deterministic", "mock", "openai"})
REQUIRED_OPENAI_ENV_VARS = ("OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_API_BASE")


class ProviderSettingsError(RuntimeError):
    """Raised when provider configuration cannot be constructed."""


@dataclass(frozen=True, slots=True)
class OpenAIConfig:
    api_key: str
    model: str
    api_base: str


@dataclass(frozen=True, slots=True)
class ProviderSettings:
    provider_name: str
    timeout_seconds: float
    temperature: float
    max_output_tokens: int
    openai: Optional[OpenAIConfig] = None


def load_provider_settings(
    *,
    provider_env: str,
    timeout_env: str,
    temperature_env: str,
    max_tokens_env: str,
    default_provider: str = "deterministic",
    default_timeout: float = 10.0,
    default_temperature: float = 0.2,
    default_max_tokens: int = 512,
) -> ProviderSettings:
    """
    Construct ProviderSettings for a service-specific provider stack.
    
    Note: For OpenAI providers, consider using a longer timeout (60+ seconds)
    as API calls can take longer for complex requests.

    Args:
        provider_env: Env var that selects the provider implementation.
        timeout_env: Env var that overrides outbound request timeouts.
        temperature_env: Env var that tunes generation randomness.
        max_tokens_env: Env var that caps model responses.
        default_*: Fallback values when the env var is unset/empty.
    """

    provider_name = _normalize_provider(os.getenv(provider_env, default_provider))
    timeout_seconds = _parse_float(os.getenv(timeout_env), default_timeout, timeout_env)
    temperature = _parse_float(os.getenv(temperature_env), default_temperature, temperature_env)
    max_output_tokens = _parse_int(os.getenv(max_tokens_env), default_max_tokens, max_tokens_env)

    openai_config: Optional[OpenAIConfig] = None
    if provider_name == "openai":
        openai_config = _build_openai_config(provider_env)

    return ProviderSettings(
        provider_name=provider_name,
        timeout_seconds=timeout_seconds,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        openai=openai_config,
    )


def _normalize_provider(raw_value: Optional[str]) -> str:
    candidate = (raw_value or "").strip().lower()
    if not candidate:
        candidate = "deterministic"

    if candidate not in SUPPORTED_PROVIDERS:
        raise ProviderSettingsError(f"Unsupported provider '{candidate}'")
    return candidate


def _parse_float(raw_value: Optional[str], default: float, env_key: str) -> float:
    if raw_value is None or raw_value.strip() == "":
        return default

    try:
        return float(raw_value)
    except ValueError as exc:
        raise ProviderSettingsError(f"{env_key} must be numeric (received '{raw_value}')") from exc


def _parse_int(raw_value: Optional[str], default: int, env_key: str) -> int:
    if raw_value is None or raw_value.strip() == "":
        return default

    try:
        return int(raw_value)
    except ValueError as exc:
        raise ProviderSettingsError(f"{env_key} must be an integer (received '{raw_value}')") from exc


def _build_openai_config(provider_env: str) -> OpenAIConfig:
    missing = [env_key for env_key in REQUIRED_OPENAI_ENV_VARS if not os.getenv(env_key)]
    if missing:
        formatted_missing = ", ".join(missing)
        raise ProviderSettingsError(
            f"{provider_env}=openai requires the following env vars: {formatted_missing}"
        )

    return OpenAIConfig(
        api_key=os.environ["OPENAI_API_KEY"].strip(),
        model=os.environ["OPENAI_MODEL"].strip(),
        api_base=os.environ["OPENAI_API_BASE"].strip(),
    )

