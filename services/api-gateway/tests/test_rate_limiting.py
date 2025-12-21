from fastapi.testclient import TestClient
from main import app
from middleware.rate_limit import SimpleRateLimiter


def test_rate_limit_returns_429_after_threshold() -> None:
    original_limiter = app.state.rate_limiter
    app.state.rate_limiter = SimpleRateLimiter(max_requests=2, window_seconds=60, burst=0)
    try:
        with TestClient(app) as client:
            first = client.get("/health")
            second = client.get("/health")

            assert first.status_code == 200
            assert second.status_code == 200

            blocked = client.get("/health")
            assert blocked.status_code == 429
            payload = blocked.json()
            assert payload["error"] == "rate_limit_exceeded"
            assert "Retry-After" in blocked.headers
    finally:
        app.state.rate_limiter = original_limiter
