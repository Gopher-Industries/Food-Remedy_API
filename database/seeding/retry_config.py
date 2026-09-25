"""
Retry configuration and backoff strategies for Firestore seeding (DB028).

Implements exponential backoff with jitter for transient errors.
Distinguishes between retryable (quota, timeout) and permanent errors.
"""

import time
import random
from typing import Callable, Optional, Any, Type
from enum import Enum


class ErrorCategory(Enum):
    """Categorizes errors by retry-ability."""
    TRANSIENT = "transient"  # Quota, timeout, service unavailable
    PERMANENT = "permanent"  # Invalid data, auth, bad request
    UNKNOWN = "unknown"  # Unclear - treat conservatively


class RetryConfig:
    """Configuration for retry behavior."""

    def __init__(
        self,
        max_retries: int = 3,
        base_delay_ms: float = 100.0,
        max_delay_ms: float = 16000.0,
        backoff_multiplier: float = 2.0,
        jitter_enabled: bool = True,
    ):
        """
        Initialize retry configuration.

        Args:
            max_retries: Max attempts per operation.
            base_delay_ms: Starting delay in milliseconds.
            max_delay_ms: Cap on delay (prevents runaway backoff).
            backoff_multiplier: Multiply delay each retry (exponential).
            jitter_enabled: Add random jitter to delays to prevent thundering herd.
        """
        self.max_retries = max_retries
        self.base_delay_ms = base_delay_ms
        self.max_delay_ms = max_delay_ms
        self.backoff_multiplier = backoff_multiplier
        self.jitter_enabled = jitter_enabled

    def get_delay_ms(self, attempt: int) -> float:
        """
        Calculate delay for a given attempt number (0-indexed).

        Args:
            attempt: Attempt number (0 = first retry).

        Returns:
            Delay in milliseconds.
        """
        delay = self.base_delay_ms * (self.backoff_multiplier ** attempt)
        delay = min(delay, self.max_delay_ms)

        if self.jitter_enabled:
            # Add ±20% random jitter to reduce thundering herd
            jitter = delay * 0.2
            delay = delay - jitter + (random.random() * 2 * jitter)

        return delay

    def should_retry(self, attempt: int, error_category: ErrorCategory) -> bool:
        """
        Determine if we should retry an error.

        Args:
            attempt: Attempt number (0-indexed).
            error_category: Category of error.

        Returns:
            True if should retry, False otherwise.
        """
        # Never retry permanent errors
        if error_category == ErrorCategory.PERMANENT:
            return False

        # Retry transient errors up to max_retries
        if error_category == ErrorCategory.TRANSIENT:
            return attempt < self.max_retries

        # Unknown errors: be conservative, retry but not as many times
        if error_category == ErrorCategory.UNKNOWN:
            return attempt < (self.max_retries - 1)

        return False


def categorize_error(error: Exception) -> ErrorCategory:
    """
    Categorize a Firestore error as transient, permanent, or unknown.

    Args:
        error: Exception to categorize.

    Returns:
        ErrorCategory enum value.
    """
    error_str = str(error).lower()
    error_type = type(error).__name__

    # Quota / rate limit errors (transient)
    if any(
        phrase in error_str
        for phrase in [
            "quota",
            "rate_limit",
            "too many requests",
            "resource exhausted",
        ]
    ):
        return ErrorCategory.TRANSIENT

    # Timeout / network errors (transient)
    if any(
        phrase in error_str
        for phrase in [
            "timeout",
            "deadline",
            "connection",
            "temporarily unavailable",
            "service unavailable",
            "internal error",
        ]
    ):
        return ErrorCategory.TRANSIENT

    # Auth errors (permanent)
    if any(
        phrase in error_str
        for phrase in [
            "permission denied",
            "unauthenticated",
            "invalid credential",
            "forbidden",
        ]
    ):
        return ErrorCategory.PERMANENT

    # Validation errors (permanent)
    if any(
        phrase in error_str
        for phrase in [
            "invalid argument",
            "failed precondition",
            "not found",
            "already exists",
            "bad request",
        ]
    ):
        return ErrorCategory.PERMANENT

    # Unknown - be conservative
    return ErrorCategory.UNKNOWN


def retry_with_backoff(
    func: Callable[[], Any],
    config: RetryConfig,
    on_retry: Optional[Callable[[int, Exception], None]] = None,
    error_categories: dict[Type[Exception], ErrorCategory] | None = None,
) -> Any:
    """
    Execute a function with automatic retry and exponential backoff.

    Args:
        func: Function to retry.
        config: Retry configuration.
        on_retry: Callback(attempt, error) called before each retry.
        error_categories: Map of exception type to ErrorCategory (overrides auto-detection).

    Returns:
        Result of func.

    Raises:
        Exception: If all retries exhausted.
    """
    error_categories = error_categories or {}
    attempt = 0

    while True:
        try:
            return func()
        except Exception as e:
            # Determine error category
            exc_type = type(e)
            if exc_type in error_categories:
                category = error_categories[exc_type]
            else:
                category = categorize_error(e)

            # Check if we should retry
            if not config.should_retry(attempt, category):
                raise

            # Calculate delay
            delay_ms = config.get_delay_ms(attempt)
            delay_sec = delay_ms / 1000.0

            # Call callback
            if on_retry:
                on_retry(attempt, e)

            # Sleep and retry
            print(
                f"[Retry] Attempt {attempt + 1} failed "
                f"({category.value}): {type(e).__name__}. "
                f"Waiting {delay_ms:.0f}ms before retry..."
            )
            time.sleep(delay_sec)
            attempt += 1


# Preset configs for common scenarios
AGGRESSIVE_RETRY = RetryConfig(
    max_retries=5,
    base_delay_ms=50.0,
    max_delay_ms=32000.0,
    backoff_multiplier=2.0,
)

CONSERVATIVE_RETRY = RetryConfig(
    max_retries=1,
    base_delay_ms=500.0,
    max_delay_ms=2000.0,
    backoff_multiplier=2.0,
)

DEFAULT_RETRY = RetryConfig(
    max_retries=3,
    base_delay_ms=100.0,
    max_delay_ms=16000.0,
    backoff_multiplier=2.0,
)
