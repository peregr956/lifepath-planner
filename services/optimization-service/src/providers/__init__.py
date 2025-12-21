"""Pluggable provider implementations for suggestion generation."""

from .openai_suggestions import OpenAISuggestionProvider

__all__ = ["OpenAISuggestionProvider"]


