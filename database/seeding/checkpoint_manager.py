"""
Checkpoint manager for resumable Firestore seeding (DB025).

Tracks and persists the state of a seeding run so that partial failures
do not require restarting from scratch. Checkpoints include:
  - Last successful batch index
  - Documents written / failed
  - Rate limit state
  - Timestamp for monitoring long-running jobs
"""

import json
import os
from typing import Optional, Dict, Any
from datetime import datetime, timezone


class CheckpointManager:
    """Manages checkpoint state for seeding runs."""

    def __init__(self, checkpoint_file: str):
        """
        Initialize checkpoint manager.

        Args:
            checkpoint_file: Path to checkpoint JSON file.
        """
        self.checkpoint_file = checkpoint_file
        self._state: Dict[str, Any] = {}
        self._load_or_init()

    def _load_or_init(self):
        """Load existing checkpoint or initialize empty state."""
        if os.path.exists(self.checkpoint_file):
            try:
                with open(self.checkpoint_file, "r", encoding="utf-8") as f:
                    self._state = json.load(f)
                self._state = self._normalize_state(self._state)
                print(f"[Checkpoint] Loaded from {self.checkpoint_file}")
                self._print_state()
            except (json.JSONDecodeError, IOError) as e:
                print(f"[Checkpoint] Failed to load: {e}. Starting fresh.")
                self._state = self._new_state()
        else:
            self._state = self._new_state()

    @staticmethod
    def _new_state() -> Dict[str, Any]:
        """Create a fresh checkpoint state."""
        return {
            "last_batch_index": 0,
            "documents_written": 0,
            "documents_failed": 0,
            "batches_completed": 0,
            "batches_failed": 0,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "last_updated_at": datetime.now(timezone.utc).isoformat(),
            "failed_documents": [],  # Track which docs failed for retry
            "rate_limit_state": {
                "writes_this_second": 0,
                "last_second_timestamp": None,
            },
        }

    def _normalize_state(self, loaded_state: Dict[str, Any]) -> Dict[str, Any]:
        """Backfill missing keys for older checkpoint formats."""
        state = self._new_state()
        if not isinstance(loaded_state, dict):
            return state

        for key in (
            "last_batch_index",
            "documents_written",
            "documents_failed",
            "batches_completed",
            "batches_failed",
            "started_at",
            "last_updated_at",
            "failed_documents",
            "rate_limit_state",
        ):
            if key in loaded_state:
                state[key] = loaded_state[key]

        if not isinstance(state.get("failed_documents"), list):
            state["failed_documents"] = []

        if not isinstance(state.get("rate_limit_state"), dict):
            state["rate_limit_state"] = {
                "writes_this_second": 0,
                "last_second_timestamp": None,
            }

        state["rate_limit_state"].setdefault("writes_this_second", 0)
        state["rate_limit_state"].setdefault("last_second_timestamp", None)

        for nkey in (
            "last_batch_index",
            "documents_written",
            "documents_failed",
            "batches_completed",
            "batches_failed",
        ):
            try:
                state[nkey] = int(state.get(nkey, 0))
            except (TypeError, ValueError):
                state[nkey] = 0

        return state

    def save(self) -> None:
        """Persist checkpoint to disk."""
        self._state["last_updated_at"] = datetime.now(timezone.utc).isoformat()
        try:
            os.makedirs(os.path.dirname(self.checkpoint_file), exist_ok=True)
            with open(self.checkpoint_file, "w", encoding="utf-8") as f:
                json.dump(self._state, f, indent=2)
        except IOError as e:
            print(f"[Checkpoint] Warning: failed to save checkpoint: {e}")

    def get_state(self) -> Dict[str, Any]:
        """Return current checkpoint state (read-only copy)."""
        return dict(self._state)

    def mark_batch_success(
        self, batch_index: int, documents_written: int, failed_count: int = 0
    ) -> None:
        """
        Mark a batch as successfully processed.

        Args:
            batch_index: 0-based batch number.
            documents_written: Number of docs successfully written.
            failed_count: Number of docs that failed in this batch.
        """
        self._state["last_batch_index"] = batch_index
        self._state["documents_written"] += documents_written
        self._state["documents_failed"] += failed_count
        self._state["batches_completed"] += 1
        self.save()

    def mark_batch_failure(self, batch_index: int, reason: str) -> None:
        """
        Mark a batch as failed (but don't update documents_written).

        Args:
            batch_index: 0-based batch number.
            reason: Description of failure.
        """
        self._state["batches_failed"] += 1
        print(
            f"[Checkpoint] Batch {batch_index} failed: {reason}. "
            f"Will retry on next run."
        )
        self.save()

    def add_failed_document(self, doc_id: str, reason: str) -> None:
        """
        Track a document that failed, for potential retry.

        Args:
            doc_id: Document identifier (e.g. barcode).
            reason: Why it failed.
        """
        self._state["failed_documents"].append(
            {"doc_id": doc_id, "reason": reason, "timestamp": datetime.now(timezone.utc).isoformat()}
        )
        # Keep only last 100 failures to avoid unbounded growth
        if len(self._state["failed_documents"]) > 100:
            self._state["failed_documents"] = self._state["failed_documents"][-100:]

    def reset(self) -> None:
        """Reset checkpoint to initial state."""
        self._state = self._new_state()
        self.save()
        print("[Checkpoint] Reset to initial state.")

    def _print_state(self) -> None:
        """Pretty-print current checkpoint state."""
        state = self._state
        print(
            f"  Batches: {state['batches_completed']} completed, "
            f"{state['batches_failed']} failed"
        )
        print(
            f"  Documents: {state['documents_written']} written, "
            f"{state['documents_failed']} failed"
        )
        print(f"  Last batch index: {state['last_batch_index']}")
        if state["failed_documents"]:
            print(f"  Recent failures: {len(state['failed_documents'])} tracked")

    def get_resume_info(self) -> Dict[str, Any]:
        """
        Get info needed to resume from checkpoint.

        Returns:
            dict with 'next_batch_index', 'documents_written', 'documents_failed'
        """
        return {
            "next_batch_index": self._state["last_batch_index"] + 1,
            "documents_written": self._state["documents_written"],
            "documents_failed": self._state["documents_failed"],
        }
