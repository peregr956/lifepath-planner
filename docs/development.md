# Development Guide

> **Note:** The Python services described here are now legacy and the production app has migrated to a **Vercel serverless architecture**. For current production development, focus on the `services/ui-web` directory.

This document describes the package structure, import conventions, and development workflow for the legacy Python microservices.

## Package Structure

The repository is organized as a Python package with proper import paths configured in `pyproject.toml`:

```
lifepath-planner/
├── pyproject.toml           # Root package configuration
├── requirements-dev.txt     # Development dependencies (includes -e .)
├── services/
│   ├── shared/              # Cross-service shared code
│   │   ├── __init__.py
│   │   ├── pyproject.toml   # Shared package configuration
│   │   ├── provider_settings.py
│   │   └── observability/
│   │       ├── privacy.py
│   │       └── telemetry.py
│   ├── api-gateway/
│   │   ├── src/
│   │   │   ├── main.py
│   │   │   ├── http_client.py
│   │   │   ├── persistence/
│   │   │   └── middleware/
│   │   └── tests/
│   ├── budget-ingestion-service/
│   │   ├── src/
│   │   │   ├── main.py
│   │   │   ├── models/
│   │   │   └── parsers/
│   │   └── tests/
│   ├── clarification-service/
│   │   ├── src/
│   │   │   ├── main.py
│   │   │   ├── providers/
│   │   │   └── ...
│   │   └── tests/
│   └── optimization-service/
│       ├── src/
│       │   ├── main.py
│       │   ├── providers/
│       │   └── ...
│       └── tests/
└── tests/                   # Integration tests
```

## Import Conventions

### Shared Code

Import shared utilities using the `shared` package prefix:

```python
from shared.observability.telemetry import setup_telemetry
from shared.provider_settings import load_provider_settings
```

### Within a Service

Use relative imports for modules within the same service:

```python
# In services/api-gateway/src/main.py
from .http_client import ResilientHttpClient
from .persistence.database import get_session
```

### Cross-Service Imports

When one service needs types from another (e.g., clarification needs budget_model from optimization), import using the module name directly:

```python
# In services/clarification-service/src/main.py
from budget_model import UnifiedBudgetModel
from models.raw_budget import DraftBudgetModel
```

This works because `pyproject.toml` configures the pythonpath to include all service `src` directories.

### Test Imports

Tests should import from `src` package:

```python
# In services/api-gateway/tests/test_gateway_smoke.py
from src.main import app
from src.http_client import RequestMetrics
```

## Development Setup

### Initial Setup

1. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies (including local package in editable mode):
   ```bash
   pip install -r requirements-dev.txt
   ```

3. Install web dependencies:
   ```bash
   cd services/ui-web && npm install
   ```

### Running Services

**One-command start (recommended):**
```bash
npm install    # First time only
npm run dev    # Starts all services
```

**Manual start (for debugging individual services):**
```bash
# Export PYTHONPATH first
export PYTHONPATH="$(pwd)/services:$(pwd)/services/shared"

# Then run individual services
cd services/api-gateway && uvicorn src.main:app --reload --port 8000
```

### Running Tests

**All tests for a service:**
```bash
pytest services/api-gateway/tests
pytest services/clarification-service/tests
```

**Integration tests:**
```bash
pytest tests/test_deterministic_pipeline.py -m integration
```

## CI/CD Pipeline

The project uses GitHub Actions for continuous integration. The workflow is defined in `.github/workflows/ci.yml`.

### Workflow Overview

The CI pipeline runs on:
- Push to `main` branch
- Pull requests targeting `main`

**Jobs:**

| Job | Description |
|-----|-------------|
| `lint-python` | Runs ruff (format + lint) and pyright type checking |
| `lint-ui` | Runs ESLint, Prettier, and TypeScript type check for UI |
| `test-python` | Runs pytest for all Python services (Python 3.11, 3.12, 3.13 matrix) |
| `test-ui` | Runs vitest for the UI service |
| `test-deterministic-pipeline` | Runs the integration test suite |
| `ci-success` | Final check that all jobs passed |

### Running Linting Locally

**Python linting:**
```bash
# Check formatting (will fail if files need reformatting)
ruff format --check .

# Auto-fix formatting
ruff format .

# Run linter
ruff check .

# Auto-fix linter issues where possible
ruff check --fix .

# Run type checking
pyright
```

**UI linting:**
```bash
cd services/ui-web

# Run ESLint
npm run lint

# Check formatting
npm run format

# Auto-fix formatting
npm run format:write

# Type check
npm run type-check
```

### Running All Tests Locally

**Python services:**
```bash
# All services
pytest services/api-gateway/tests -v
pytest services/budget-ingestion-service/tests -v
pytest services/clarification-service/tests -v
pytest services/optimization-service/tests -v

# Integration tests
pytest tests/test_deterministic_pipeline.py -v -m integration
```

**UI service:**
```bash
cd services/ui-web && npm run test
```

### OpenAI Secret Handling in CI

Tests that require OpenAI API access are handled gracefully when secrets are unavailable:

- The CI sets `SKIP_LLM_TESTS=1` when `OPENAI_API_KEY` is not configured
- Tests using mocks (e.g., `test_openai_clarification_provider.py`) run regardless
- To run LLM tests locally, configure `.env` with your OpenAI credentials (see `docs/operations.md`)

### Branch Protection

To enforce CI checks before merging:

1. Go to Repository Settings → Branches → Branch protection rules
2. Add rule for `main` branch
3. Enable "Require status checks to pass before merging"
4. Select required checks: `lint-python`, `lint-ui`, `test-python`, `test-ui`, `test-deterministic-pipeline`

## Adding a New Service

1. Create the service directory structure:
   ```
   services/new-service/
   ├── README.md
   ├── src/
   │   ├── __init__.py
   │   └── main.py
   └── tests/
       └── test_service.py
   ```

2. Use relative imports within the service:
   ```python
   # src/main.py
   from .models import MyModel
   ```

3. Import shared code using the `shared` package:
   ```python
   from shared.observability.telemetry import setup_telemetry
   ```

4. Add the service to `scripts/dev.sh` if it should start with `npm run dev`.

5. Update `pyproject.toml` pythonpath if needed (usually not required).

## IDE Configuration

### VS Code / Cursor

The `pyrightconfig.json` file configures type checking. Ensure your Python interpreter is set to the virtual environment.

### PyCharm

Mark the following as Sources Root:
- `services/`
- `services/shared/`
- `services/api-gateway/src/`
- `services/budget-ingestion-service/src/`
- `services/clarification-service/src/`
- `services/optimization-service/src/`

## Troubleshooting

### Import Errors

If you see `ModuleNotFoundError`:

1. Ensure the package is installed in editable mode:
   ```bash
   pip install -e .
   ```

2. Check PYTHONPATH includes the services directory:
   ```bash
   export PYTHONPATH="$(pwd)/services:$(pwd)/services/shared:$PYTHONPATH"
   ```

3. Verify you're using the correct virtual environment.

### Type Checking Errors

Run pyright to check for type errors:
```bash
pyright
```

Configuration is in `pyrightconfig.json` and `pyproject.toml`.

