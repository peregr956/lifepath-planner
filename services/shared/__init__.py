"""
Shared utilities for LifePath Planner services.

This package contains code shared across multiple services:
- provider_settings: Configuration for pluggable AI providers
- observability: Telemetry, logging, and privacy utilities
"""

from .provider_settings import (
    SUPPORTED_PROVIDERS,
    REQUIRED_OPENAI_ENV_VARS,
    ProviderSettingsError,
    OpenAIConfig,
    ProviderSettings,
    load_provider_settings,
)

__all__ = [
    "SUPPORTED_PROVIDERS",
    "REQUIRED_OPENAI_ENV_VARS",
    "ProviderSettingsError",
    "OpenAIConfig",
    "ProviderSettings",
    "load_provider_settings",
]

