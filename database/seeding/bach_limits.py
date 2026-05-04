"""Shared Firestore seeding limits for batch uploads (DB024)."""

import os
from typing import Any, Optional


def resolve_max_writes_per_run(config: Optional[dict[str, Any]] = None) -> Optional[int]:
    """
    Max document writes before stopping this process (Firebase free-tier safety).

    Returns:
        None — no cap (use for large paid projects or multi-day strategies with care).
        int > 0 — stop after this many successful document writes in one run.

    Precedence: env FIRESTORE_SEED_MAX_WRITES, then config max_writes_per_run.
    Env or config value <= 0 means unlimited.
    Default when unset: 20000 (conservative free-tier daily write guidance).
    """
    config = config or {}

    env_raw = os.environ.get("FIRESTORE_SEED_MAX_WRITES", "").strip()
    if env_raw:
        try:
            n = int(env_raw)
            return None if n <= 0 else n
        except ValueError:
            pass

    v = config.get("max_writes_per_run")
    if v is None:
        return 20000
    try:
        n = int(v)
    except (TypeError, ValueError):
        return 20000
    return None if n <= 0 else n
