"""
Enhanced Firestore seeding engine with batch writes, rate limiting, checkpointing,
and retry logic (DB025-DB028 integration).

Large seeding runs complete safely and observably. Temporary database or quota
errors do not abort the whole seeding job.
"""

import json
import sys
import time
import os
import argparse
from typing import Any, Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from database.seeding.checkpoint_manager import CheckpointManager
from database.seeding.rate_limiter import AdaptiveRateLimiter
from database.seeding.progress_tracker import ProgressTracker
from database.seeding.retry_config import retry_with_backoff, DEFAULT_RETRY, ErrorCategory, categorize_error

CHECKPOINT_FILE = os.path.join(BASE_DIR, "checkpoint.json")

_firestore_client = None


def _resolve_repo_path(path: str) -> str:
    """Turn repo-relative paths (e.g. database/seeding/...) into absolute paths."""
    if not path:
        return path
    if os.path.isabs(path):
        return os.path.normpath(path)
    return os.path.normpath(os.path.join(REPO_ROOT, path.replace("/", os.sep)))


def _repo_relative_for_metadata(path: str) -> str:
    """
    Path string for pipeline JSON (processed/output fields): repo-relative with forward
    slashes when the file is under REPO_ROOT, so metadata is portable across machines.
    """
    if not path:
        return path
    ap = os.path.normpath(os.path.abspath(path))
    try:
        rel = os.path.relpath(ap, REPO_ROOT)
    except ValueError:
        return ap.replace("\\", "/")
    if rel.startswith(".."):
        return ap.replace("\\", "/")
    return rel.replace("\\", "/")


def _clear_invalid_credential_env_vars() -> None:
    """
    If GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_SERVICE_ACCOUNT_KEY point at a missing file,
    remove them. Otherwise google.auth keeps trying that path (even for Application Default
    Credentials) and you get the same error until the variable is unset or fixed.
    """
    for key in ("GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_SERVICE_ACCOUNT_KEY"):
        val = os.environ.get(key)
        if not val or not val.strip():
            continue
        abs_p = os.path.abspath(val.strip().strip('"'))
        if not os.path.isfile(abs_p):
            print(
                f"[seed_firestore] {key} points to a file that does not exist:\n"
                f"  {abs_p}\n"
                "  Removing it for this process so a real key file can be found "
                "(e.g. serviceAccountKey.json in the project folder) or ADC can run.\n"
                "  In PowerShell, unset permanently for the session with:\n"
                f"    Remove-Item Env:{key}"
            )
            del os.environ[key]


def _service_account_json_path() -> Optional[str]:
    """Return first existing Firebase service account JSON path, or None."""
    env = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or os.environ.get(
        "FIREBASE_SERVICE_ACCOUNT_KEY"
    )
    candidates: list[str] = []
    if env:
        candidates.append(os.path.abspath(env))
    for c in (
        os.path.join(os.getcwd(), "serviceAccountKey.json"),
        os.path.join(REPO_ROOT, "serviceAccountKey.json"),
        os.path.join(BASE_DIR, "serviceAccountKey.json"),
    ):
        if c not in candidates:
            candidates.append(c)

    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


def _default_firebase_project_id() -> Optional[str]:
    """Read default project from repo .firebaserc (same as Firebase CLI)."""
    rc = os.path.join(REPO_ROOT, ".firebaserc")
    if not os.path.isfile(rc):
        return None
    try:
        with open(rc, "r", encoding="utf-8") as f:
            data = json.load(f)
        return (data.get("projects") or {}).get("default")
    except Exception:
        return None


def _firebase_app_options() -> dict:
    """Optional project id for initialize_app (helps ADC / multi-project setups)."""
    pid = (
        os.environ.get("FIREBASE_PROJECT_ID")
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GCLOUD_PROJECT")
        or _default_firebase_project_id()
    )
    if pid:
        return {"projectId": pid}
    return {}


def _credentials_help_message() -> str:
    project = _default_firebase_project_id() or "<your-firebase-project-id>"
    key_path = os.path.join(REPO_ROOT, "serviceAccountKey.json")
    return (
        "\n"
        "Cannot connect to Firestore: no valid service account JSON was found.\n\n"
        "Do this once:\n"
        f"  1) Open Firebase Console -> Project settings -> Service accounts.\n"
        f"  2) Generate new private key for project (this repo's .firebaserc default is: {project}).\n"
        f"  3) Save the downloaded file as:\n"
        f"       {key_path}\n"
        "     (exact name: serviceAccountKey.json - it is gitignored.)\n"
        "     OR set a real path (not a placeholder), e.g.:\n"
        "       $env:GOOGLE_APPLICATION_CREDENTIALS = \"C:/Users/you/Downloads/your-key.json\"\n\n"
        "Common mistake: using tutorial text like YOUR-ACTUAL-FILE-NAME in the path - that file does not exist.\n"
        "Optional: install Google Cloud SDK and run `gcloud auth application-default login` if you prefer ADC.\n"
    )


def get_firestore_client():
    """Lazily initialise Firebase Admin (skipped entirely when seeding with dry_run)."""
    global _firestore_client
    if _firestore_client is not None:
        return _firestore_client

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError as e:
        raise ImportError(
            "firebase-admin is required for real Firestore writes. "
            "Install with: pip install firebase-admin"
        ) from e

    if firebase_admin._apps:
        _firestore_client = firestore.client()
        return _firestore_client

    _clear_invalid_credential_env_vars()

    opts = _firebase_app_options()
    path = _service_account_json_path()

    if path:
        cred = credentials.Certificate(path)
        firebase_admin.initialize_app(cred, opts)
    else:
        # Fail fast: ApplicationDefault often defers loading until firestore.client(), which
        # produced confusing tracebacks. Verify ADC before initialize_app.
        try:
            import google.auth

            google.auth.default()
        except Exception as e:
            raise FileNotFoundError(_credentials_help_message() + f"\n(Underlying: {e})") from e

        try:
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred, opts)
        except Exception as e:
            raise FileNotFoundError(_credentials_help_message() + f"\n(Underlying: {e})") from e

    try:
        _firestore_client = firestore.client()
    except Exception as e:
        raise FileNotFoundError(_credentials_help_message() + f"\n(Underlying: {e})") from e
    return _firestore_client


def commit_batch(batch):
    """Commit a Firestore batch with retry.

    Import google-api-core lazily so dry-run mode works without Google deps.
    """
    try:
        from google.api_core import retry as g_retry
    except ImportError as e:
        raise ImportError(
            "google-api-core is required for real Firestore writes. "
            "Install with: pip install google-api-core"
        ) from e

    @g_retry.Retry(
        predicate=g_retry.if_exception_type(Exception),
        initial=1,
        maximum=16,
        multiplier=2,
        deadline=60,
    )
    def _commit():
        batch.commit()

    _commit()



def run(input_path: str, output_path: str, config: dict[str, Any]) -> dict[str, Any]:
    """
    Enhanced seed stage: Writes enriched products to Firestore with batching,
    rate limiting, checkpoint support, and retry logic.

    Args:
        input_path: Path to enriched products JSON.
        output_path: Path to write seeded products JSON (for pipeline tracking).
        config: Configuration dict with keys:
            - dry_run (bool): Simulate without writing to Firestore.
            - batch_size (int): Documents per Firestore batch (max 500).
            - writes_per_second_limit (int): Rate limit (adaptive).
            - max_retries (int): Retry attempts per failed batch.
            - validate_before_seed (bool): Run DB012 validation first.
            - subset (int): Limit to first N documents (disables resume).

    Returns:
        dict with 'processed', 'failures', 'output', and optional 'error'.
    """
    start_time = time.time()

    # Configuration
    batch_size = int(config.get("batch_size", 500))
    writes_per_second_limit = int(config.get("writes_per_second_limit", 400))
    dry_run = bool(config.get("dry_run", False))
    max_retries = int(config.get("max_retries", 3))

    raw_input_path = str(input_path).strip()
    input_path = _resolve_repo_path(input_path)
    output_path = _resolve_repo_path(output_path)

    if raw_input_path in {"...", "."} or os.path.basename(os.path.normpath(input_path)) == "...":
        msg = (
            "Invalid --input path: received placeholder '...'. "
            "Use a real JSON file path, for example: "
            "database/seeding/products_enriched.json"
        )
        print(f"[ERROR] {msg}")
        return {"error": msg, "processed": 0, "failures": 1}

    if os.path.isdir(input_path):
        msg = (
            f"Invalid --input path: expected a JSON file but got a directory: {input_path}. "
            "Use a file like database/seeding/products_enriched.json"
        )
        print(f"[ERROR] {msg}")
        return {"error": msg, "processed": 0, "failures": 1}

    print("\n" + "=" * 70)
    print("[SEEDING ENGINE] Enhanced Firestore Seeding with Checkpointing & Retry")
    print("=" * 70)
    print(f"Input:  {_repo_relative_for_metadata(input_path)}")
    print(f"Output: {_repo_relative_for_metadata(output_path)}")
    print(f"Dry-run: {dry_run}")
    print(f"Batch size: {batch_size}")
    print(f"Target rate: {writes_per_second_limit} writes/sec")
    print(f"Max retries per batch: {max_retries}")

    # Load input
    try:
        with open(input_path, "r", encoding="utf-8") as f:
            raw = f.read()
        if not raw.strip():
            data = []
        else:
            data = json.loads(raw)
    except json.JSONDecodeError as e:
        msg = f"Invalid JSON in {input_path}: {e}"
        print(f"[ERROR] {msg}")
        return {"error": msg, "processed": 0, "failures": 1}
    except OSError as e:
        msg = f"Cannot read {input_path}: {e}"
        print(f"[ERROR] {msg}")
        return {"error": msg, "processed": 0, "failures": 1}

    # Handle subset
    subset = config.get("subset")
    if subset is not None:
        try:
            subset = int(subset)
        except (TypeError, ValueError):
            subset = None
    if subset is not None and subset > 0:
        data = data[:subset]
        print(f"[SUBSET] Using first {len(data)} record(s); checkpoint resume disabled.")

    if not data:
        print("[INFO] Input JSON is empty — nothing to seed.")
        return {"processed": 0, "failures": 0, "output": _repo_relative_for_metadata(output_path)}

    # Optional pre-seed validation
    if config.get("validate_before_seed"):
        print("[VALIDATION] Running DB012 pre-seed validation...")
        try:
            from database.Validation.db012_validator import BatchValidator
            bv = BatchValidator()
            if not bv.validate_data(data):
                msg = "Pre-seed validation failed (DB012). See logs and database/Validation reports."
                print(f"[ERROR] {msg}")
                return {"error": msg, "processed": 0, "failures": 1}
            print("[VALIDATION] ✓ All records passed schema validation.")
        except Exception as e:
            msg = f"Validation error: {e}"
            print(f"[ERROR] {msg}")
            return {"error": msg, "processed": 0, "failures": 1}

    total_records = len(data)
    use_checkpoint = subset is None or subset <= 0

    # Initialize checkpoint manager
    checkpoint_mgr = CheckpointManager(CHECKPOINT_FILE)
    if use_checkpoint:
        resume_info = checkpoint_mgr.get_resume_info()
        start_batch_index = resume_info["next_batch_index"]
        resume_offset = (start_batch_index - 1) * batch_size
        print(
            f"[CHECKPOINT] Resuming from batch {start_batch_index}. "
            f"Previously: {resume_info['documents_written']} written, "
            f"{resume_info['documents_failed']} failed."
        )
    else:
        start_batch_index = 0
        resume_offset = 0
        print("[CHECKPOINT] Subset mode: checkpoint resume disabled.")

    if resume_offset >= total_records:
        print("[INFO] No seed work left: checkpoint already covers this file.")
        return {
            "processed": total_records,
            "failures": 0,
            "output": _repo_relative_for_metadata(output_path),
        }

    # Initialize helpers
    rate_limiter = AdaptiveRateLimiter(writes_per_second_limit)
    progress = ProgressTracker(total_records, batch_size)
    retry_config = DEFAULT_RETRY
    retry_config.max_retries = max_retries

    db = None if dry_run else get_firestore_client()
    total_batches = (total_records + batch_size - 1) // batch_size

    print(f"[PROCESSING] Starting batch {start_batch_index + 1} of {total_batches}")
    print()

    # Main batch processing loop
    batches_processed = 0
    batches_failed = 0

    for i in range(resume_offset, total_records, batch_size):
        batch_idx = i // batch_size
        batch_number = batch_idx + 1
        chunk = data[i : i + batch_size]
        batch_start_time = progress.on_batch_start()

        if dry_run:
            # Dry-run: just count
            docs_valid = 0
            for product in chunk:
                if product.get("barcode"):
                    docs_valid += 1
            progress.on_batch_success(batch_number, docs_valid)
            batches_processed += 1
            continue

        # Real seeding: attempt batch with retries
        batch_attempt = 0
        batch_success = False
        batch_error = None

        def do_batch_commit():
            """Closure for retryable batch commit."""
            batch = db.batch()
            docs_added = 0
            docs_skipped = 0

            for product in chunk:
                barcode = product.get("barcode")
                if not barcode:
                    docs_skipped += 1
                    checkpoint_mgr.add_failed_document(
                        str(i + docs_added + docs_skipped),
                        "Missing barcode"
                    )
                    continue

                # Rate limit before each write
                rate_limiter.acquire(1, block=True)

                doc_ref = db.collection("products").document(str(barcode))
                batch.set(doc_ref, product, merge=True)
                docs_added += 1

            # Commit batch
            commit_batch(batch)
            return docs_added, docs_skipped

        # Retry logic with backoff
        try:
            def on_batch_retry(attempt: int, error: Exception):
                nonlocal batch_attempt
                batch_attempt = attempt
                print(
                    f"[RETRY] Batch {batch_number}: "
                    f"Attempt {attempt + 1}/{retry_config.max_retries + 1}"
                )
                # Adapt rate limit on quota errors
                error_cat = categorize_error(error)
                if error_cat == ErrorCategory.TRANSIENT:
                    rate_limiter.on_quota_error()

            docs_written, docs_skipped = retry_with_backoff(
                do_batch_commit,
                retry_config,
                on_retry=on_batch_retry,
            )
            batch_success = True
            rate_limiter.on_success()
            checkpoint_mgr.mark_batch_success(batch_idx, docs_written, docs_skipped)
            progress.on_batch_success(batch_number, docs_written, docs_skipped)
            batches_processed += 1

        except Exception as e:
            batch_error = str(e)
            checkpoint_mgr.mark_batch_failure(batch_idx, batch_error)
            progress.on_batch_failure(batch_number, batch_error, batch_start_time)
            batches_failed += 1

            # Continue to next batch (partial failure doesn't abort entire job)
            print(f"[WARN] Batch {batch_number} exhausted retries. Continuing...")

    # Summary
    elapsed = time.time() - start_time
    summary = progress.get_summary()

    print("\n" + "=" * 70)
    print("SEEDING SUMMARY")
    print("=" * 70)
    print(f"Elapsed time: {summary['elapsed_seconds']:.2f}s")
    print(f"Total batches: {summary['batches']['total']}")
    print(f"  ✓ Completed: {summary['batches']['completed']}")
    print(f"  ✗ Failed:    {summary['batches']['failed']}")
    print(f"Total documents: {summary['documents']['total']}")
    print(f"  ✓ Written:   {summary['documents']['written']}")
    print(f"  ✗ Failed:    {summary['documents']['failed']}")
    print(f"  ⊘ Skipped:   {summary['documents']['skipped']}")
    print(f"Success rate: {summary['success_rate_pct']:.1f}%")
    print(f"Throughput: {summary['throughput']['docs_per_sec']:.1f} docs/sec")
    print("=" * 70)

    if dry_run:
        print("[DRY-RUN] No Firestore writes were made. Checkpoint not updated.")

    # Save output
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    out_meta = _repo_relative_for_metadata(output_path)
    print(f"Seeded data written to: {out_meta}")

    return {
        "processed": summary["documents"]["total"],
        "failures": summary["batches"]["failed"],
        "output": out_meta,
        "summary": summary,
    }



def seed_products():
    """Entry point expected by run_seed_stage.py"""
    default_input = os.path.join(BASE_DIR, "products_enriched.json")
    default_output = os.path.join(BASE_DIR, "seeded_products.json")

    config: dict[str, Any] = {
        "dry_run": False,
        "batch_size": 500,
        "writes_per_second_limit": 400,
    }

    if hasattr(seed_products, "config") and isinstance(seed_products.config, dict):
        config.update(seed_products.config)

    in_rel = config.get("input")
    out_rel = config.get("output")
    input_path = _resolve_repo_path(in_rel) if in_rel else default_input
    output_path = _resolve_repo_path(out_rel) if out_rel else default_output

    print(
        f"[seed_products] input={_repo_relative_for_metadata(input_path)}, "
        f"output={_repo_relative_for_metadata(output_path)}, "
        f"dry_run={config.get('dry_run')}, batch_size={config.get('batch_size')}, "
        f"writes_per_second_limit={config.get('writes_per_second_limit')}"
    )

    return run(input_path, output_path, config)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Enhanced Firestore Seeding Engine with Retry & Checkpointing (DB025-DB028)"
    )
    parser.add_argument(
        "--input",
        default=os.path.join(BASE_DIR, "products_enriched.json"),
        help="Path to enriched JSON file (repo-relative or absolute)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Simulate run (no Firestore writes)")
    parser.add_argument("--subset", type=int, default=None, help="Limit to first N records")
    parser.add_argument(
        "--batch-size", type=int, default=500, help="Documents per Firestore batch (max 500)"
    )
    parser.add_argument(
        "--writes-per-second",
        type=int,
        default=400,
        help="Target write rate before throttling (adaptive under quota pressure)",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=3,
        help="Max retry attempts per failed batch (exponential backoff)",
    )
    parser.add_argument(
        "--output",
        default="database/seeding/seeded_products.json",
        help="Output JSON path for pipeline tracking (repo-relative or absolute)",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Run DB012 batch validation on the input before Firestore writes",
    )
    args = parser.parse_args()

    cfg: dict[str, Any] = {
        "dry_run": args.dry_run,
        "batch_size": args.batch_size,
        "writes_per_second_limit": args.writes_per_second,
        "max_retries": args.max_retries,
        "validate_before_seed": args.validate,
    }
    if args.subset:
        cfg["subset"] = args.subset

    run(args.input, args.output, cfg)
