FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements-dev.txt pyproject.toml ./
COPY services/shared ./services/shared/

# Install dependencies (note: -e . requires the full project)
RUN pip install --no-cache-dir -r requirements-dev.txt || pip install --no-cache-dir $(grep -v "^-e" requirements-dev.txt | grep -v "^#" | grep -v "^$")

# Copy the rest of the application
COPY . .

# Install the package in development mode
RUN pip install -e . || true

# Set Python path for imports
ENV PYTHONPATH="/app/services/api-gateway/src:/app/services/budget-ingestion-service/src:/app/services/clarification-service/src:/app/services/optimization-service/src:/app/services/shared:/app/services"

# Expose port
EXPOSE 8000

# Run the production script
CMD ["./scripts/start-production.sh"]

