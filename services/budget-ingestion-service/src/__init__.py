"""
Budget ingestion service package.

Having an explicit package initializer lets us rely on relative imports (for
example `from .models import ...`) so the service can be started without
manually modifying PYTHONPATH.
"""
