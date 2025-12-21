"""Pytest configuration for clarification-service tests.

Ensures the service's own src directory takes precedence in sys.path
to avoid module name collisions with other services.
"""

import sys
from pathlib import Path

SERVICES_ROOT = Path(__file__).resolve().parents[2]

# Ensure this service's src is first in sys.path
SERVICE_SRC = Path(__file__).resolve().parents[1] / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))

# Add other service sources for cross-service imports (budget_model, models, etc.)
OPTIMIZATION_SRC = SERVICES_ROOT / "optimization-service" / "src"
if str(OPTIMIZATION_SRC) not in sys.path:
    sys.path.insert(1, str(OPTIMIZATION_SRC))

INGESTION_SRC = SERVICES_ROOT / "budget-ingestion-service" / "src"
if str(INGESTION_SRC) not in sys.path:
    sys.path.insert(2, str(INGESTION_SRC))
