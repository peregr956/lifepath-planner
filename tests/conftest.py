"""Pytest configuration for root-level integration tests.

Adds all service src directories to sys.path for cross-service imports.
"""

import sys
from pathlib import Path

SERVICES_ROOT = Path(__file__).resolve().parents[1] / "services"

# Add all service src directories
SERVICE_PATHS = [
    SERVICES_ROOT / "clarification-service" / "src",
    SERVICES_ROOT / "optimization-service" / "src",
    SERVICES_ROOT / "budget-ingestion-service" / "src",
    SERVICES_ROOT / "api-gateway" / "src",
    SERVICES_ROOT / "shared",
]

for path in SERVICE_PATHS:
    path_str = str(path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)


