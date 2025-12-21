import asyncio
import logging
import random
import time
from collections.abc import Mapping, MutableMapping
from dataclasses import dataclass
from typing import Any

import httpx
from shared.observability.telemetry import CORRELATION_ID_HEADER

logger = logging.getLogger(__name__)
# Increased read timeout to accommodate OpenAI API calls which can take longer
DEFAULT_TIMEOUT = httpx.Timeout(90.0, connect=5.0, read=90.0, write=15.0, pool=5.0)
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_BACKOFF_FACTOR = 0.5
RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}


@dataclass
class RequestMetrics:
    attempts: int
    latency_ms: float


class ResilientHttpClient:
    """Async httpx helper with retries, timeouts, and structured logging."""

    def __init__(
        self,
        *,
        timeout: httpx.Timeout | float = DEFAULT_TIMEOUT,
        max_attempts: int = DEFAULT_MAX_ATTEMPTS,
        backoff_factor: float = DEFAULT_BACKOFF_FACTOR,
        correlation_header: str = CORRELATION_ID_HEADER,
        retry_status_codes: set[int] | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._timeout = timeout
        self._max_attempts = max(1, max_attempts)
        self._backoff_factor = max(0.0, backoff_factor)
        self._correlation_header = correlation_header
        self._retry_status_codes = retry_status_codes or RETRYABLE_STATUS_CODES
        self._transport = transport

    async def request(
        self,
        method: str,
        url: str,
        *,
        request_id: str,
        headers: Mapping[str, str] | None = None,
        timeout: httpx.Timeout | float | None = None,
        **kwargs: Any,
    ) -> tuple[httpx.Response, RequestMetrics]:
        attempts = 0
        start_time = time.perf_counter()
        last_exc: Exception | None = None

        while attempts < self._max_attempts:
            attempts += 1
            request_headers = self._build_headers(headers, request_id)

            try:
                async with httpx.AsyncClient(timeout=timeout or self._timeout, transport=self._transport) as client:
                    response = await client.request(method=method.upper(), url=url, headers=request_headers, **kwargs)
                response.raise_for_status()
                metrics = self._metrics(start_time, attempts)
                self._log_success(url, method, response.status_code, request_id, metrics)
                return response, metrics
            except (httpx.HTTPStatusError, httpx.RequestError) as exc:
                last_exc = exc
                should_retry = self._should_retry(exc)
                metrics = self._metrics(start_time, attempts)
                if should_retry and attempts < self._max_attempts:
                    self._log_retry(url, method, request_id, metrics, exc)
                    await asyncio.sleep(self._backoff_seconds(attempts))
                    continue
                self._log_failure(url, method, request_id, metrics, exc)
                raise

        assert last_exc is not None  # for mypy
        raise last_exc

    async def post(
        self,
        url: str,
        *,
        request_id: str,
        headers: Mapping[str, str] | None = None,
        timeout: httpx.Timeout | float | None = None,
        **kwargs: Any,
    ) -> tuple[httpx.Response, RequestMetrics]:
        return await self.request(
            "POST",
            url,
            request_id=request_id,
            headers=headers,
            timeout=timeout,
            **kwargs,
        )

    async def get(
        self,
        url: str,
        *,
        request_id: str,
        headers: Mapping[str, str] | None = None,
        timeout: httpx.Timeout | float | None = None,
        **kwargs: Any,
    ) -> tuple[httpx.Response, RequestMetrics]:
        return await self.request(
            "GET",
            url,
            request_id=request_id,
            headers=headers,
            timeout=timeout,
            **kwargs,
        )

    def _build_headers(
        self,
        headers: Mapping[str, str] | None,
        request_id: str,
    ) -> MutableMapping[str, str]:
        merged: MutableMapping[str, str] = {}
        if headers:
            merged.update(headers)
        merged.setdefault(self._correlation_header, request_id)
        return merged

    def _metrics(self, start_time: float, attempts: int) -> RequestMetrics:
        latency_ms = (time.perf_counter() - start_time) * 1000
        return RequestMetrics(attempts=attempts, latency_ms=round(latency_ms, 2))

    def _should_retry(self, exc: Exception) -> bool:
        if isinstance(exc, httpx.HTTPStatusError):
            status = exc.response.status_code
            return status >= 500 or status in self._retry_status_codes
        if isinstance(exc, httpx.RequestError):
            return True
        return False

    def _backoff_seconds(self, attempts: int) -> float:
        base = self._backoff_factor * (2 ** (attempts - 1))
        jitter = random.uniform(0, base / 2 if base else 0)
        return base + jitter

    def _log_success(
        self,
        url: str,
        method: str,
        status_code: int,
        request_id: str,
        metrics: RequestMetrics,
    ) -> None:
        logger.info(
            {
                "event": "http_request",
                "outcome": "success",
                "url": url,
                "method": method.upper(),
                "status_code": status_code,
                "request_id": request_id,
                "latency_ms": metrics.latency_ms,
                "attempts": metrics.attempts,
            }
        )

    def _log_retry(
        self,
        url: str,
        method: str,
        request_id: str,
        metrics: RequestMetrics,
        exc: Exception,
    ) -> None:
        logger.warning(
            {
                "event": "http_request",
                "outcome": "retry",
                "url": url,
                "method": method.upper(),
                "request_id": request_id,
                "attempts": metrics.attempts,
                "latency_ms": metrics.latency_ms,
                "error": str(exc),
            }
        )

    def _log_failure(
        self,
        url: str,
        method: str,
        request_id: str,
        metrics: RequestMetrics,
        exc: Exception,
    ) -> None:
        logger.error(
            {
                "event": "http_request",
                "outcome": "failure",
                "url": url,
                "method": method.upper(),
                "request_id": request_id,
                "attempts": metrics.attempts,
                "latency_ms": metrics.latency_ms,
                "error": str(exc),
            }
        )
