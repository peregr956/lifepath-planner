import asyncio
import os
import time
from collections import defaultdict, deque


class SimpleRateLimiter:
    """
    Sliding-window rate limiter keyed by client identifier (IP/requester).

    Keeps per-key deques of recent request timestamps to avoid external stores.
    Suitable for the single-process dev stack; replace with Redis for multi-host deployments.
    """

    def __init__(self, max_requests: int, window_seconds: int = 60, burst: int = 0):
        self._max_requests = max(1, max_requests)
        self._window_seconds = max(1, window_seconds)
        self._burst = max(0, burst)
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def allow(self, client_id: str) -> tuple[bool, float]:
        """
        Returns (allowed, retry_after_seconds). When disallowed, retry_after_seconds
        represents how long the client should wait before retrying.
        """

        now = time.monotonic()
        async with self._lock:
            bucket = self._buckets[client_id]
            self._evict_old(bucket, now)

            limit = self._max_requests + self._burst
            if len(bucket) >= limit:
                retry_after = self._window_seconds - (now - bucket[0])
                return False, max(retry_after, 0.0)

            bucket.append(now)
            return True, 0.0

    def remaining(self, client_id: str) -> int:
        bucket = self._buckets.get(client_id)
        if not bucket:
            return self._max_requests + self._burst
        return max((self._max_requests + self._burst) - len(bucket), 0)

    def _evict_old(self, bucket: deque[float], now: float) -> None:
        threshold = now - self._window_seconds
        while bucket and bucket[0] <= threshold:
            bucket.popleft()


def build_default_rate_limiter() -> SimpleRateLimiter:
    per_minute = int(os.getenv("GATEWAY_RATE_LIMIT_PER_MIN", "60"))
    burst = int(os.getenv("GATEWAY_RATE_LIMIT_BURST", "20"))
    return SimpleRateLimiter(max_requests=per_minute, window_seconds=60, burst=burst)
