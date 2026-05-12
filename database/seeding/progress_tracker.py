"""
Progress tracker for Firestore seeding (DB027).

Tracks and displays real-time metrics: documents/sec, time/batch, failure rates, ETA.
Helps operators understand the health of long-running seed jobs.
"""

import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import sys


class ProgressTracker:
    """Tracks and reports progress of seeding operations."""

    def __init__(self, total_documents: int, batch_size: int):
        """
        Initialize progress tracker.

        Args:
            total_documents: Total docs to process.
            batch_size: Docs per batch.
        """
        self.total_documents = total_documents
        self.batch_size = batch_size
        self.total_batches = (total_documents + batch_size - 1) // batch_size

        self.batches_completed = 0
        self.batches_failed = 0
        self.documents_written = 0
        self.documents_failed = 0
        self.documents_skipped = 0

        self.start_time = time.time()
        self.last_batch_time = self.start_time
        self.batch_times: list[float] = []

    def on_batch_start(self) -> float:
        """Call at the start of each batch. Returns batch start time."""
        return time.time()

    def on_batch_success(
        self,
        batch_number: int,
        docs_written: int,
        docs_failed: int = 0,
        docs_skipped: int = 0,
        batch_start_time: Optional[float] = None,
    ) -> None:
        """
        Call when batch completes successfully.

        Args:
            batch_number: 1-based batch number.
            docs_written: Docs successfully written.
            docs_failed: Docs that failed in this batch.
            docs_skipped: Docs that were skipped (missing fields, etc).
            batch_start_time: Time batch started (from on_batch_start).
        """
        now = time.time()
        batch_time = now - (batch_start_time or self.last_batch_time)
        self.batch_times.append(batch_time)

        self.batches_completed += 1
        self.documents_written += docs_written
        self.documents_failed += docs_failed
        self.documents_skipped += docs_skipped

        self.last_batch_time = now
        self._print_progress(batch_number)

    def on_batch_failure(
        self,
        batch_number: int,
        reason: str,
        batch_start_time: Optional[float] = None,
    ) -> None:
        """
        Call when batch fails.

        Args:
            batch_number: 1-based batch number.
            reason: Failure reason.
            batch_start_time: Time batch started.
        """
        now = time.time()
        batch_time = now - (batch_start_time or self.last_batch_time)

        self.batches_failed += 1
        self.last_batch_time = now

        print(
            f"\n[BATCH FAILURE] Batch {batch_number}: {reason} (took {batch_time:.2f}s)"
        )

    def _print_progress(self, batch_number: int) -> None:
        """Print current progress summary."""
        now = time.time()
        elapsed = now - self.start_time

        docs_so_far = self.documents_written + self.documents_failed
        success_rate = (
            (self.documents_written / docs_so_far * 100)
            if docs_so_far > 0
            else 100.0
        )

        # Throughput
        docs_per_sec = docs_so_far / elapsed if elapsed > 0 else 0
        avg_batch_time = (
            sum(self.batch_times) / len(self.batch_times)
            if self.batch_times
            else 0
        )

        # ETA
        remaining_docs = self.total_documents - docs_so_far
        remaining_batches = max(0, self.total_batches - self.batches_completed)
        if docs_per_sec > 0:
            eta_seconds = remaining_docs / docs_per_sec
        else:
            eta_seconds = None

        # Progress bar
        progress_pct = (docs_so_far / self.total_documents * 100) if self.total_documents else 0
        bar_length = 40
        filled = int(bar_length * progress_pct / 100)
        bar = "█" * filled + "░" * (bar_length - filled)

        print(
            f"[{bar}] {progress_pct:.1f}% | "
            f"Batch {batch_number}/{self.total_batches} | "
            f"{docs_so_far}/{self.total_documents} docs"
        )
        print(
            f"  Written: {self.documents_written} ✓ | "
            f"Failed: {self.documents_failed} ✗ | "
            f"Skipped: {self.documents_skipped} ⊘ | "
            f"Success rate: {success_rate:.1f}%"
        )
        print(
            f"  {docs_per_sec:.1f} docs/sec | "
            f"Avg batch: {avg_batch_time:.2f}s | "
            f"Elapsed: {self._format_duration(elapsed)}"
        )
        if eta_seconds is not None and remaining_docs > 0:
            print(f"  ETA: {self._format_duration(eta_seconds)}")
        print()

    @staticmethod
    def _format_duration(seconds: float) -> str:
        """Format seconds as HH:MM:SS."""
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        return f"{h:02d}:{m:02d}:{s:02d}"

    def get_summary(self) -> Dict[str, Any]:
        """Get a summary dict of all metrics."""
        elapsed = time.time() - self.start_time
        docs_so_far = self.documents_written + self.documents_failed
        success_rate = (
            (self.documents_written / docs_so_far * 100)
            if docs_so_far > 0
            else 100.0
        )

        return {
            "elapsed_seconds": elapsed,
            "batches": {
                "total": self.total_batches,
                "completed": self.batches_completed,
                "failed": self.batches_failed,
            },
            "documents": {
                "total": self.total_documents,
                "written": self.documents_written,
                "failed": self.documents_failed,
                "skipped": self.documents_skipped,
            },
            "throughput": {
                "docs_per_sec": docs_so_far / elapsed if elapsed > 0 else 0,
                "avg_batch_time_sec": (
                    sum(self.batch_times) / len(self.batch_times)
                    if self.batch_times
                    else 0
                ),
            },
            "success_rate_pct": success_rate,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
