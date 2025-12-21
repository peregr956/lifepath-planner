"""Pytest configuration for api-gateway tests.

Ensures the service's own src directory takes precedence in sys.path
to avoid module name collisions with other services.
"""

import sys
from pathlib import Path

# Ensure this service's src is first in sys.path
SERVICE_SRC = Path(__file__).resolve().parents[1] / "src"
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))
