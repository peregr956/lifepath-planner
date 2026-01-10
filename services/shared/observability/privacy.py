import hashlib
import json
from collections.abc import Iterable, Mapping
from typing import Any

REDACTED = "[REDACTED]"


def hash_payload(value: Any) -> str:
    """
    Return a stable SHA-256 hash for the provided payload without leaking contents.

    Strings are encoded as UTF-8, bytes are used as-is, and arbitrary objects are
    serialized via JSON (falling back to repr()) before hashing.
    """

    if value is None:
        normalized = "null"
    elif isinstance(value, bytes):
        normalized = value
    elif isinstance(value, str):
        normalized = value.encode("utf-8")
    else:
        try:
            normalized = json.dumps(value, sort_keys=True, default=str).encode("utf-8")
        except TypeError:
            normalized = repr(value).encode("utf-8")

    return hashlib.sha256(normalized).hexdigest()


def redact_fields(payload: Mapping[str, Any], allowed_keys: Iterable[str]) -> dict[str, Any]:
    """
    Produce a shallow copy that preserves only the whitelisted keys and redacts the rest.
    """

    whitelist = set(allowed_keys)
    redacted: dict[str, Any] = {}
    for key, value in payload.items():
        if key in whitelist:
            redacted[key] = value
        else:
            redacted[key] = REDACTED
    return redacted





