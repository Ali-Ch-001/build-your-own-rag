"""Application-layer backpressure and concurrency controls.

Prevents the cascade failure where K8s autoscaling creates more pods → more
concurrent calls to downstream services → rate limits/saturation → pod restarts.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any

import structlog

from rag_platform.config import Settings

logger = structlog.get_logger(__name__)


@dataclass
class ConcurrencyGuard:
    """Bounded semaphore to cap concurrent calls to a downstream dependency."""

    name: str
    maximum: int
    _semaphore: asyncio.Semaphore = field(init=False)
    _in_flight: int = field(default=0, init=False)
    _rejected: int = field(default=0, init=False)

    def __post_init__(self) -> None:
        self._semaphore = asyncio.Semaphore(self.maximum)

    async def acquire(self) -> bool:
        acquired = self._semaphore.locked()
        _ = acquired
        await self._semaphore.acquire()
        self._in_flight += 1
        return True

    def release(self) -> None:
        self._semaphore.release()
        self._in_flight = max(0, self._in_flight - 1)

    @property
    def available(self) -> int:
        return self.maximum - self._in_flight


@dataclass
class TokenBucket:
    """Rate limiter using the token bucket algorithm."""

    rate_per_second: float
    burst: int
    _tokens: float = field(init=False, default=0)
    _last_refill: float = field(init=False, default_factory=time.monotonic)

    def __post_init__(self) -> None:
        self._tokens = float(self.burst)

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(float(self.burst), self._tokens + elapsed * self.rate_per_second)
        self._last_refill = now

    async def consume(self, tokens: int = 1) -> bool:
        while True:
            self._refill()
            if self._tokens >= tokens:
                self._tokens -= tokens
                return True
            wait = (tokens - self._tokens) / self.rate_per_second
            logger.debug(
                "rate_limit_waiting",
                bucket_tokens=self._tokens,
                wait_seconds=round(wait, 3),
            )
            await asyncio.sleep(min(wait, 1.0))

    @property
    def available_tokens(self) -> float:
        self._refill()
        return self._tokens


class BackpressureController:
    """Central coordinator for cross-service backpressure.

    Prevents the autoscaling death spiral:
    1. KEDA scales ingestion workers → more concurrent OpenAI calls → 429
    2. HPA scales API pods → more DB connections → pool exhaustion
    3. All pods compete for Qdrant write capacity → OOM

    Instead:
    1. Embedding calls are capped globally (embedding_guard)
    2. Qdrant writes are rate-limited (qdrant_write_bucket)
    3. Ingestion pauses when retrieval P95 exceeds threshold
    4. DB connections have a hard pool cap
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

        self.embedding_guard = ConcurrencyGuard(
            name="embedding",
            maximum=settings.embedding_max_concurrency,
        )

        self.qdrant_write_bucket = TokenBucket(
            rate_per_second=settings.qdrant_write_rate_per_second,
            burst=settings.qdrant_write_burst,
        )

        self.ingestion_paused = asyncio.Event()
        self.ingestion_paused.set()  # not paused by default

        self._last_retrieval_p95_ms: float = 0.0

    def update_retrieval_health(self, p95_ms: float) -> None:
        self._last_retrieval_p95_ms = p95_ms
        if p95_ms > self.settings.ingestion_backpressure_p95_threshold_ms:
            if self.ingestion_paused.is_set():
                logger.warning(
                    "ingestion_backpressure_activated",
                    retrieval_p95_ms=p95_ms,
                    threshold_ms=self.settings.ingestion_backpressure_p95_threshold_ms,
                )
                self.ingestion_paused.clear()
        else:
            if not self.ingestion_paused.is_set():
                logger.info(
                    "ingestion_backpressure_released",
                    retrieval_p95_ms=p95_ms,
                )
                self.ingestion_paused.set()

    async def wait_if_backpressured(self) -> None:
        if not self.ingestion_paused.is_set():
            await asyncio.sleep(0.5)
            await self.ingestion_paused.wait()

    async def acquire_embedding_slot(self) -> None:
        await self.embedding_guard.acquire()

    def release_embedding_slot(self) -> None:
        self.embedding_guard.release()

    async def acquire_qdrant_write(self) -> None:
        await self.qdrant_write_bucket.consume(1)

    def snapshot(self) -> dict[str, Any]:
        return {
            "embedding_in_flight": self.embedding_guard._in_flight,
            "embedding_available": self.embedding_guard.available,
            "embedding_max": self.embedding_guard.maximum,
            "qdrant_write_tokens": round(self.qdrant_write_bucket.available_tokens, 1),
            "qdrant_write_rate": self.qdrant_write_bucket.rate_per_second,
            "ingestion_paused": not self.ingestion_paused.is_set(),
            "retrieval_p95_ms": self._last_retrieval_p95_ms,
        }
