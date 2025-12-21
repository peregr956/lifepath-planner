import httpx
import pytest
from http_client import CORRELATION_ID_HEADER, ResilientHttpClient


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_resilient_http_client_successful_post_injects_request_id() -> None:
    captured_headers: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured_headers.update(request.headers)
        return httpx.Response(200, json={"status": "ok"})

    client = ResilientHttpClient(max_attempts=1, backoff_factor=0, transport=httpx.MockTransport(handler))

    response, metrics = await client.post("https://example.org/test", request_id="req-123")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert captured_headers.get(CORRELATION_ID_HEADER) == "req-123"
    assert metrics.attempts == 1
    assert metrics.latency_ms >= 0


@pytest.mark.anyio
async def test_resilient_http_client_retries_on_retryable_status() -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count < 2:
            return httpx.Response(503, json={"error": "temporary"})
        return httpx.Response(200, json={"status": "ok"})

    client = ResilientHttpClient(max_attempts=3, backoff_factor=0, transport=httpx.MockTransport(handler))

    response, metrics = await client.post("https://example.org/retry", request_id="req-456")

    assert response.status_code == 200
    assert metrics.attempts == 2
    assert metrics.latency_ms >= 0


@pytest.mark.anyio
async def test_resilient_http_client_raises_after_request_errors() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    client = ResilientHttpClient(max_attempts=2, backoff_factor=0, transport=httpx.MockTransport(handler))

    with pytest.raises(httpx.RequestError):
        await client.post("https://example.org/fail", request_id="req-789")
