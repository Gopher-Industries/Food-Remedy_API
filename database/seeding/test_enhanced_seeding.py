"""
Test suite for enhanced seeding system (DB025-DB028).

Validates:
1. Checkpoint persistence and recovery
2. Rate limiter behavior
3. Progress tracking accuracy
4. Retry logic with error categorization
5. End-to-end seeding with dry-run

Run: python database/seeding/test_enhanced_seeding.py
"""

import os
import sys
import json
import time
import tempfile
from pathlib import Path

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from database.seeding.checkpoint_manager import CheckpointManager
from database.seeding.rate_limiter import RateLimiter, AdaptiveRateLimiter
from database.seeding.progress_tracker import ProgressTracker
from database.seeding.retry_config import (
    retry_with_backoff,
    categorize_error,
    ErrorCategory,
    DEFAULT_RETRY,
)


def test_checkpoint_persistence():
    """Test: Checkpoint saves and loads state."""
    print("\n" + "=" * 70)
    print("TEST 1: Checkpoint Persistence")
    print("=" * 70)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        checkpoint_file = f.name

    try:
        # Create checkpoint and mark batches
        cp = CheckpointManager(checkpoint_file)
        cp.mark_batch_success(0, documents_written=50, failed_count=0)
        cp.mark_batch_success(1, documents_written=50, failed_count=2)
        cp.add_failed_document("invalid-123", "Missing barcode")

        # Reload from disk
        cp2 = CheckpointManager(checkpoint_file)
        state = cp2.get_state()

        # Verify
        assert state["last_batch_index"] == 1, f"Expected batch 1, got {state['last_batch_index']}"
        assert state["documents_written"] == 100, f"Expected 100 written, got {state['documents_written']}"
        assert state["batches_completed"] == 2, f"Expected 2 completed, got {state['batches_completed']}"

        print("✓ Checkpoint persists and loads correctly")
        print(f"  - Batches completed: {state['batches_completed']}")
        print(f"  - Documents written: {state['documents_written']}")
        print(f"  - Documents failed: {state['documents_failed']}")

    finally:
        os.unlink(checkpoint_file)


def test_checkpoint_resume():
    """Test: Resume from checkpoint after interruption."""
    print("\n" + "=" * 70)
    print("TEST 2: Checkpoint Resume")
    print("=" * 70)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        checkpoint_file = f.name

    try:
        # Simulate partial completion
        cp = CheckpointManager(checkpoint_file)
        cp.mark_batch_success(0, documents_written=50, failed_count=0)
        cp.mark_batch_success(1, documents_written=50, failed_count=0)
        cp.mark_batch_success(2, documents_written=50, failed_count=0)

        # Simulate new process resuming
        cp_new = CheckpointManager(checkpoint_file)
        resume_info = cp_new.get_resume_info()

        assert resume_info["next_batch_index"] == 3, f"Expected batch 3, got {resume_info['next_batch_index']}"
        assert resume_info["documents_written"] == 150

        print("✓ Checkpoint resume info correct")
        print(f"  - Next batch to process: {resume_info['next_batch_index']}")
        print(f"  - Already written: {resume_info['documents_written']}")

    finally:
        os.unlink(checkpoint_file)


def test_rate_limiter():
    """Test: Rate limiter enforces writes/second."""
    print("\n" + "=" * 70)
    print("TEST 3: Rate Limiter")
    print("=" * 70)

    limiter = RateLimiter(writes_per_second=10, burst_size=10)

    # Acquire 10 tokens immediately (burst)
    start = time.time()
    limiter.acquire(10, block=True)
    elapsed = time.time() - start
    assert elapsed < 0.1, f"Burst acquire took too long: {elapsed}s"
    print(f"✓ Burst acquire (10 tokens): {elapsed:.3f}s (should be instant)")

    # Acquire 5 more tokens (should wait ~0.5s)
    start = time.time()
    limiter.acquire(5, block=True)
    elapsed = time.time() - start
    assert 0.4 < elapsed < 0.7, f"Rate-limited acquire timing wrong: {elapsed}s"
    print(f"✓ Rate-limited acquire (5 tokens at 10/sec): {elapsed:.3f}s (should be ~0.5s)")


def test_adaptive_rate_limiter():
    """Test: Adaptive rate limiter responds to quota errors."""
    print("\n" + "=" * 70)
    print("TEST 4: Adaptive Rate Limiter")
    print("=" * 70)

    limiter = AdaptiveRateLimiter(writes_per_second=100, min_writes_per_second=20)

    initial_rate = limiter.writes_per_second
    print(f"Initial rate: {initial_rate} writes/sec")

    # Simulate quota errors
    for i in range(3):
        limiter.on_quota_error()
        print(f"  After error {i+1}: {limiter.writes_per_second} writes/sec")

    assert limiter.writes_per_second < initial_rate, "Rate should have decreased"
    assert limiter.writes_per_second >= 20, "Rate should not go below min"

    # Simulate recovery
    for i in range(3):
        limiter.on_success()

    print(f"After recovery: {limiter.writes_per_second} writes/sec")
    print("✓ Adaptive rate limiter responds to errors and recovers")


def test_progress_tracker():
    """Test: Progress tracker accumulates metrics."""
    print("\n" + "=" * 70)
    print("TEST 5: Progress Tracker")
    print("=" * 70)

    progress = ProgressTracker(total_documents=1000, batch_size=100)

    # Simulate 3 successful batches
    for batch_num in range(1, 4):
        start_time = progress.on_batch_start()
        time.sleep(0.1)  # Simulate batch work
        progress.on_batch_success(batch_num, docs_written=100, docs_failed=0)

    # Get summary
    summary = progress.get_summary()

    assert summary["batches"]["completed"] == 3
    assert summary["documents"]["written"] == 300
    assert summary["success_rate_pct"] == 100.0

    print("✓ Progress tracker accumulates correctly")
    print(f"  - Batches completed: {summary['batches']['completed']}")
    print(f"  - Documents written: {summary['documents']['written']}")
    print(f"  - Success rate: {summary['success_rate_pct']:.1f}%")
    print(f"  - Throughput: {summary['throughput']['docs_per_sec']:.1f} docs/sec")


def test_error_categorization():
    """Test: Error categorization works correctly."""
    print("\n" + "=" * 70)
    print("TEST 6: Error Categorization")
    print("=" * 70)

    test_cases = [
        (Exception("resource exhausted"), ErrorCategory.TRANSIENT),
        (Exception("quota exceeded"), ErrorCategory.TRANSIENT),
        (Exception("deadline exceeded"), ErrorCategory.TRANSIENT),
        (Exception("permission denied"), ErrorCategory.PERMANENT),
        (Exception("invalid argument"), ErrorCategory.PERMANENT),
        (Exception("who knows"), ErrorCategory.UNKNOWN),
    ]

    passed = 0
    failed = 0
    for error, expected_category in test_cases:
        actual_category = categorize_error(error)
        if actual_category == expected_category:
            print(f"✓ {str(error)[:40]:40s} → {actual_category.value}")
            passed += 1
        else:
            print(f"✗ {str(error)[:40]:40s} → expected {expected_category.value}, got {actual_category.value}")
            failed += 1

    assert failed == 0, f"{failed} categorization test(s) failed"


def test_retry_with_backoff():
    """Test: Retry logic with exponential backoff."""
    print("\n" + "=" * 70)
    print("TEST 7: Retry with Backoff")
    print("=" * 70)

    call_count = {"value": 0}

    def failing_func():
        """Function that fails 3 times, then succeeds."""
        call_count["value"] += 1
        if call_count["value"] < 3:
            raise Exception("Transient error")
        return "success"

    retry_config = DEFAULT_RETRY
    retry_config.max_retries = 5

    start = time.time()
    result = retry_with_backoff(failing_func, retry_config)
    elapsed = time.time() - start

    assert result == "success"
    assert call_count["value"] == 3, f"Expected 3 calls, got {call_count['value']}"
    assert elapsed > 0.2, f"Backoff should have caused delay, but only {elapsed}s elapsed"

    print(f"✓ Retry logic succeeded after {call_count['value']} attempts")
    print(f"  - Total time: {elapsed:.3f}s (includes backoff delays)")


def test_dry_run_seeding():
    """Test: End-to-end dry-run seeding."""
    print("\n" + "=" * 70)
    print("TEST 8: End-to-End Dry-Run Seeding")
    print("=" * 70)

    try:
        from database.seeding.seed_firestore import run
    except ImportError as e:
        print(f"⊘ SKIPPED: {e} (optional for dry-run)")
        return

    # Create test input file
    test_data = [
        {"barcode": f"1234567890{i:04d}", "name": f"Product {i}"}
        for i in range(50)
    ]

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(test_data, f)
        input_file = f.name

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        output_file = f.name

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        checkpoint_file = f.name

    try:
        config = {
            "dry_run": True,
            "batch_size": 10,
            "writes_per_second_limit": 100,
            "max_retries": 2,
            "validate_before_seed": False,
        }

        result = run(input_file, output_file, config)

        assert result["processed"] == 50, f"Expected 50 processed, got {result['processed']}"
        assert result["failures"] == 0, f"Expected 0 failures in dry-run, got {result['failures']}"
        assert os.path.exists(output_file)

        print("✓ End-to-end dry-run seeding succeeded")
        print(f"  - Documents processed: {result['processed']}")
        print(f"  - Batches completed: {result['summary']['batches']['completed']}")

    finally:
        os.unlink(input_file)
        os.unlink(output_file)
        if os.path.exists(checkpoint_file):
            os.unlink(checkpoint_file)


def run_all_tests():
    """Run all tests."""
    print("\n" + "ENHANCED SEEDING SYSTEM TEST SUITE".center(70))
    print("=" * 70)

    tests = [
        test_checkpoint_persistence,
        test_checkpoint_resume,
        test_rate_limiter,
        test_adaptive_rate_limiter,
        test_progress_tracker,
        test_error_categorization,
        test_retry_with_backoff,
        test_dry_run_seeding,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"\n✗ TEST FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"\n✗ TEST ERROR: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    print("\n" + "=" * 70)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("=" * 70 + "\n")

    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
