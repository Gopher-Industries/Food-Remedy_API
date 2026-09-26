"""Dataset-bound, gap-safe checkpoints for Firestore seeding."""

from __future__ import annotations

import json
import os
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict


CHECKPOINT_SCHEMA_VERSION = 2


class CheckpointCompatibilityError(RuntimeError):
    """Raised when a checkpoint cannot safely be applied to this seed run."""


class CheckpointManager:
    """Persist only the contiguous successful frontier of a seeding run."""

    def __init__(self, checkpoint_file: str):
        self.checkpoint_file = checkpoint_file
        self._state: Dict[str, Any] = {}
        self._loaded_legacy_state = False
        self._load_or_init()

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @classmethod
    def _new_state(cls) -> Dict[str, Any]:
        now = cls._now()
        return {
            "schema_version": CHECKPOINT_SCHEMA_VERSION,
            "run_identity": None,
            "last_batch_index": -1,
            "documents_written": 0,
            "documents_failed": 0,
            "batches_completed": 0,
            "batches_failed": 0,
            "started_at": now,
            "last_updated_at": now,
            "failed_documents": [],
            "failed_batches": [],
            "rate_limit_state": {
                "writes_this_second": 0,
                "last_second_timestamp": None,
            },
        }

    def _load_or_init(self) -> None:
        if not os.path.exists(self.checkpoint_file):
            self._state = self._new_state()
            return
        try:
            with open(self.checkpoint_file, "r", encoding="utf-8") as handle:
                loaded = json.load(handle)
            self._loaded_legacy_state = (
                not isinstance(loaded, dict)
                or loaded.get("schema_version") != CHECKPOINT_SCHEMA_VERSION
            )
            self._state = self._normalize_state(loaded)
            print(f"[Checkpoint] Loaded from {self.checkpoint_file}")
            self._print_state()
        except (json.JSONDecodeError, OSError) as exc:
            raise CheckpointCompatibilityError(
                f"Checkpoint cannot be read safely: {self.checkpoint_file}: {exc}"
            ) from exc

    def _normalize_state(self, loaded_state: Dict[str, Any]) -> Dict[str, Any]:
        state = self._new_state()
        if not isinstance(loaded_state, dict):
            return state

        for key in state:
            if key in loaded_state:
                state[key] = loaded_state[key]

        for key in ("failed_documents", "failed_batches"):
            if not isinstance(state.get(key), list):
                state[key] = []
        if not isinstance(state.get("rate_limit_state"), dict):
            state["rate_limit_state"] = {}
        state["rate_limit_state"].setdefault("writes_this_second", 0)
        state["rate_limit_state"].setdefault("last_second_timestamp", None)

        defaults = self._new_state()
        for key in (
            "last_batch_index",
            "documents_written",
            "documents_failed",
            "batches_completed",
            "batches_failed",
        ):
            try:
                state[key] = int(state.get(key, defaults[key]))
            except (TypeError, ValueError):
                state[key] = defaults[key]
        return state

    def bind_run(
        self,
        *,
        dataset_sha256: str,
        total_records: int,
        batch_size: int,
        collection: str,
    ) -> None:
        """Bind checkpoint progress to the exact data and write configuration."""
        identity = {
            "dataset_sha256": dataset_sha256,
            "total_records": int(total_records),
            "batch_size": int(batch_size),
            "collection": collection,
        }
        existing = self._state.get("run_identity")
        has_progress = self._state["last_batch_index"] >= 0

        if has_progress and existing is None:
            checkpoint_type = "Legacy" if self._loaded_legacy_state else "Unbound"
            raise CheckpointCompatibilityError(
                f"{checkpoint_type} checkpoint progress has no dataset identity. Reset the "
                "checkpoint explicitly before seeding; it is unsafe to guess which "
                "dataset or batch size it represents."
            )
        if existing is not None and existing != identity and has_progress:
            raise CheckpointCompatibilityError(
                "Checkpoint belongs to a different dataset or seed configuration. "
                "Reset it explicitly before starting this run."
            )
        if existing != identity:
            self._state["run_identity"] = identity
            self._state["schema_version"] = CHECKPOINT_SCHEMA_VERSION
            self._loaded_legacy_state = False
            self.save()

    def save(self) -> None:
        """Atomically replace the checkpoint so interruption cannot leave half JSON."""
        self._state["last_updated_at"] = self._now()
        directory = os.path.dirname(os.path.abspath(self.checkpoint_file))
        os.makedirs(directory, exist_ok=True)
        temporary = f"{self.checkpoint_file}.tmp.{os.getpid()}"
        try:
            with open(temporary, "w", encoding="utf-8") as handle:
                json.dump(self._state, handle, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self.checkpoint_file)
        except OSError as exc:
            try:
                if os.path.exists(temporary):
                    os.unlink(temporary)
            finally:
                raise OSError(
                    f"Failed to persist checkpoint {self.checkpoint_file}: {exc}"
                ) from exc

    def get_state(self) -> Dict[str, Any]:
        return deepcopy(self._state)

    def mark_batch_success(
        self, batch_index: int, documents_written: int, failed_count: int = 0
    ) -> None:
        if self._state.get("run_identity") is None:
            raise CheckpointCompatibilityError(
                "Bind the checkpoint to a dataset before recording progress"
            )
        expected = self._state["last_batch_index"] + 1
        if batch_index != expected:
            raise ValueError(
                f"Refusing non-contiguous checkpoint advance to batch {batch_index}; "
                f"batch {expected} must succeed first"
            )
        self._state["last_batch_index"] = batch_index
        self._state["documents_written"] += documents_written
        self._state["documents_failed"] += failed_count
        self._state["batches_completed"] += 1
        self._state["failed_batches"] = [
            item for item in self._state["failed_batches"]
            if item.get("batch_index") != batch_index
        ]
        self.save()

    def mark_batch_failure(self, batch_index: int, reason: str) -> None:
        if self._state.get("run_identity") is None:
            raise CheckpointCompatibilityError(
                "Bind the checkpoint to a dataset before recording progress"
            )
        self._state["batches_failed"] += 1
        self._state["failed_batches"] = [
            item for item in self._state["failed_batches"]
            if item.get("batch_index") != batch_index
        ]
        self._state["failed_batches"].append(
            {
                "batch_index": batch_index,
                "reason": reason,
                "timestamp": self._now(),
            }
        )
        print(
            f"[Checkpoint] Batch {batch_index} failed: {reason}. "
            "This batch remains the resume point."
        )
        self.save()

    def add_failed_document(self, doc_id: str, reason: str) -> None:
        self._state["failed_documents"].append(
            {"doc_id": doc_id, "reason": reason, "timestamp": self._now()}
        )
        if len(self._state["failed_documents"]) > 100:
            self._state["failed_documents"] = self._state["failed_documents"][-100:]

    def reset(self) -> None:
        self._state = self._new_state()
        self._loaded_legacy_state = False
        self.save()
        print("[Checkpoint] Reset to initial state.")

    def _print_state(self) -> None:
        state = self._state
        print(
            f"  Batches: {state['batches_completed']} completed, "
            f"{state['batches_failed']} failed"
        )
        print(
            f"  Documents: {state['documents_written']} written, "
            f"{state['documents_failed']} failed"
        )
        print(f"  Last contiguous batch index: {state['last_batch_index']}")
        if state["failed_documents"]:
            print(f"  Recent failures: {len(state['failed_documents'])} tracked")

    def get_resume_info(self) -> Dict[str, Any]:
        return {
            "next_batch_index": self._state["last_batch_index"] + 1,
            "documents_written": self._state["documents_written"],
            "documents_failed": self._state["documents_failed"],
        }
