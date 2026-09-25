"""
Rate limiter for Firestore seeding (DB026).

Implements token bucket rate limiting to prevent hitting Firebase write quotas.
Supports configurable writes-per-second and adaptive backoff under quota pressure.
"""

import time
from typing import Optional


class RateLimiter:
    """Token bucket rate limiter for Firestore writes."""

    def __init__(
        self,
        writes_per_second: int = 400,
        burst_size: Optional[int] = None,
    ):
        """
        Initialize rate limiter.

        Args:
            writes_per_second: Target write rate (tokens refilled per second).
            burst_size: Max tokens allowed at once (default: writes_per_second).
        """
        self.writes_per_second = writes_per_second
        self.burst_size = burst_size or writes_per_second
        self.tokens = self.burst_size
        self.last_refill_time = time.time()

    def acquire(self, count: int = 1, block: bool = True) -> bool:
        """
        Acquire tokens for a write operation.

        Args:
            count: Number of tokens needed (usually 1 per doc write).
            block: If True, sleep until tokens available. If False, return immediately.

        Returns:
            True if tokens acquired, False if not available and block=False.
        """
        while True:
            now = time.time()
            # Refill tokens based on time elapsed
            elapsed = now - self.last_refill_time
            refill = elapsed * self.writes_per_second
            self.tokens = min(self.burst_size, self.tokens + refill)
            self.last_refill_time = now

            if self.tokens >= count:
                self.tokens -= count
                return True

            if not block:
                return False

            # Sleep until we have enough tokens (conservative estimate)
            sleep_time = (count - self.tokens) / self.writes_per_second
            time.sleep(sleep_time)

    def wait_if_needed(self, writes_in_batch: int = 1) -> None:
        """
        Block until tokens are available for batch writes.

        Args:
            writes_in_batch: Number of writes in the next batch.
        """
        self.acquire(writes_in_batch, block=True)

    def get_current_tokens(self) -> float:
        """Get current token count (for monitoring)."""
        now = time.time()
        elapsed = now - self.last_refill_time
        refill = elapsed * self.writes_per_second
        return min(self.burst_size, self.tokens + refill)


class AdaptiveRateLimiter(RateLimiter):
    """
    Rate limiter that adapts to quota exhaustion errors.

    If quota errors are detected, gradually reduce write rate.
    """

    def __init__(
        self,
        writes_per_second: int = 400,
        burst_size: Optional[int] = None,
        min_writes_per_second: int = 10,
    ):
        """
        Initialize adaptive rate limiter.

        Args:
            writes_per_second: Starting write rate.
            burst_size: Max tokens at once.
            min_writes_per_second: Don't go below this rate when backing off.
        """
        super().__init__(writes_per_second, burst_size)
        self.initial_rate = writes_per_second
        self.min_rate = min_writes_per_second
        self.quota_errors_seen = 0

    def on_quota_error(self) -> None:
        """
        Call when a quota error occurs. Reduces write rate.
        """
        self.quota_errors_seen += 1
        new_rate = max(
            self.min_rate,
            int(self.writes_per_second * 0.8),  # Reduce by 20%
        )
        print(
            f"[RateLimiter] Quota error #{self.quota_errors_seen}. "
            f"Reducing rate from {self.writes_per_second} to {new_rate} writes/sec."
        )
        self.writes_per_second = new_rate
        self.burst_size = new_rate  # Reduce burst too

    def on_success(self) -> None:
        """Call when a batch succeeds. Gradually restore write rate."""
        if (
            self.quota_errors_seen > 0
            and self.writes_per_second < self.initial_rate
        ):
            # Slowly recover: increase by 5% each success
            new_rate = min(
                self.initial_rate,
                int(self.writes_per_second * 1.05),
            )
            if new_rate > self.writes_per_second:
                print(
                    f"[RateLimiter] Success batch. "
                    f"Recovering rate to {new_rate} writes/sec."
                )
                self.writes_per_second = new_rate
                self.burst_size = new_rate

    def reset(self) -> None:
        """Reset to initial rate."""
        self.writes_per_second = self.initial_rate
        self.burst_size = self.initial_rate
        self.quota_errors_seen = 0
        print(f"[RateLimiter] Reset to initial rate {self.initial_rate} writes/sec.")
