import json
import time
import os
import argparse
from typing import Any, Optional

from google.api_core import retry

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
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


@retry.Retry(predicate=retry.if_exception_type(Exception), initial=1, maximum=16, multiplier=2, deadline=60)
def commit_batch(batch):
    """Commit a Firestore batch with retry."""
    batch.commit()

def commit_batch_with_retry(batch, batch_number: int, max_retries: int = 3, delay_seconds: int = 2):
    """
    DB025: Detect failed insert operations and retry automatically.
    """
    for attempt in range(1, max_retries + 1):
        try:
            commit_batch(batch)
            print(f"Batch {batch_number} committed successfully on attempt {attempt}")
            return True

        except Exception as e:
            print(f"Batch {batch_number} failed on attempt {attempt}: {e}")

            if attempt < max_retries:
                time.sleep(delay_seconds)
            else:
                print(f"Batch {batch_number} skipped after maximum retries.")
                return False



def load_checkpoint() -> int:
    """Load last successful batch index from checkpoint file."""
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
                return json.load(f).get("last_batch_index", 0)
        except Exception:
            pass
    return 0


def save_checkpoint(batch_index: int) -> None:
    """Save current batch index to checkpoint."""
    try:
        with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
            json.dump({"last_batch_index": batch_index}, f, indent=2)
    except Exception:
        pass


def run(input_path: str, output_path: str, config: dict[str, Any], stage_logger=None) -> dict[str, Any]:
    """
    Pipeline seed stage: Writes enriched products to Firestore with batching,
    rate limiting, retry, and checkpoint support.
    """
    start_time = time.time()
    batch_size = int(config.get("batch_size", 500))
    writes_per_second_limit = int(config.get("writes_per_second_limit", 400))
    dry_run = bool(config.get("dry_run", False))

    input_path = _resolve_repo_path(input_path)
    output_path = _resolve_repo_path(output_path)

    if stage_logger is None:
        from database.logging_system.pipeline_logger import PipelineStageLogger
        stage_logger = PipelineStageLogger("Seed")

    stage_logger.log_stage_start(
        stage_name="seed",
        input_file=_repo_relative_for_metadata(input_path)
    )

    stage_logger.log_info(
        stage_name="seed",
        message="config",
        dry_run=config.get('dry_run'),
        batch_size=config.get('batch_size'),
        writes_per_second_limit=config.get('writes_per_second_limit')
    )

    failures = 0
    total_written = 0

    try:
        with open(input_path, "r", encoding="utf-8") as f:
            raw = f.read()
        if not raw.strip():
            data = []
        else:
            data = json.loads(raw)
    except json.JSONDecodeError as e:
        stage_logger.log_stage_error("seed", e, input_file=input_path)
        return {"error": f"Failed to load input: {e}", "processed": 0, "failures": 1}
    except OSError as e:
        stage_logger.log_stage_error("seed", e, input_file=input_path)
        return {"error": f"Failed to load input: {e}", "processed": 0, "failures": 1}

    subset = config.get("subset")
    if subset is not None:
        try:
            subset = int(subset)
        except (TypeError, ValueError):
            subset = None
    if subset is not None and subset > 0:
        data = data[:subset]
        stage_logger.log_info(stage_name="seed", message="subset_mode", records=len(data))

    if not data:
        stage_logger.log_info(stage_name="seed", message="empty_input")
        return {"processed": 0, "failures": 0, "output": _repo_relative_for_metadata(output_path)}

    total_records = len(data)
    use_checkpoint = subset is None or subset <= 0
    last_completed_batch = load_checkpoint() if use_checkpoint else 0
    total_batch_count = (total_records + batch_size - 1) // batch_size if total_records else 0
    resume_offset = last_completed_batch * batch_size

    if last_completed_batch > 0 and use_checkpoint:
        stage_logger.log_info(
            stage_name="seed",
            message="checkpoint_resume",
            last_batch=last_completed_batch,
            total_batches=total_batch_count
        )

    if resume_offset >= total_records:
        stage_logger.log_info(stage_name="seed", message="nothing_to_do_checkpoint_covers_all")
    else:
        stage_logger.log_info(
            stage_name="seed",
            message="starting_from_batch",
            batch=last_completed_batch + 1,
            offset=resume_offset
        )

    stage_logger.log_info(stage_name="seed", message="dry_run_mode", dry_run=dry_run)
    stage_logger.log_info(stage_name="seed", message="total_documents", count=total_records)

    writes_this_second = 0
    last_second = time.time()

    db = None if dry_run else get_firestore_client()

    batches_this_run = 0
    for i in range(resume_offset, total_records, batch_size):
        chunk = data[i : i + batch_size]
        batch_number = i // batch_size + 1

        if dry_run:
            for product in chunk:
                if not product.get("barcode"):
                    continue
                total_written += 1
            stage_logger.log_info(
                stage_name="seed",
                message="dry_run_batch",
                batch_number=batch_number,
                docs=len(chunk)
            )
            batches_this_run += 1
            continue

        batch = db.batch()
        for product in chunk:
            barcode = product.get("barcode")
            if not barcode:
                continue

            current_second = time.time()
            if current_second - last_second >= 1:
                writes_this_second = 0
                last_second = current_second

            if writes_this_second >= writes_per_second_limit:
                sleep_time = max(0, 1 - (current_second - last_second))
                time.sleep(sleep_time)
                writes_this_second = 0
                last_second = time.time()

            doc_ref = db.collection("products").document(barcode)
            batch.set(doc_ref, product, merge=True)
            writes_this_second += 1
            total_written += 1

        success = commit_batch_with_retry(batch, batch_number)

        if success:
            stage_logger.log_info(
                stage_name="seed",
                message="batch_written",
                batch_number=batch_number,
                docs=len(chunk)
            )
            save_checkpoint(batch_number)
            batches_this_run += 1
        else:
            failures += 1
            stage_logger.log_stage_warning(
                stage_name="seed",
                warning_message=f"Batch {batch_number} failed after retries"
            )

        if total_written > 20000:
            stage_logger.log_stage_warning(
                stage_name="seed",
                warning_message="Approaching daily write quota (20k) — stopping"
            )
            break

    elapsed = time.time() - start_time

    stage_logger.log_stage_end(
        stage_name="seed",
        duration_ms=round(elapsed * 1000, 2),
        output_records=total_records,
        failures=failures if not dry_run else 0,
        output_file=_repo_relative_for_metadata(output_path)
    )

    return {
        "processed": total_records,
        "failures": failures,
        "output": _repo_relative_for_metadata(output_path),
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

    from database.logging_system.pipeline_logger import PipelineStageLogger
    stage_logger = PipelineStageLogger("Seed")

    result = run(input_path, output_path, config, stage_logger=stage_logger)

    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Firestore Seeding Engine")
    parser.add_argument(
        "--input",
        default=os.path.join(BASE_DIR, "products_enriched.json"),
        help="Path to enriched JSON file (repo-relative or absolute)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Simulate run (no Firebase)")
    parser.add_argument("--subset", type=int, default=None, help="Limit to first N records")
    parser.add_argument("--batch-size", type=int, default=500, help="Documents per Firestore batch (max 500)")
    parser.add_argument(
        "--writes-per-second",
        type=int,
        default=400,
        help="Soft cap on document writes per second before throttling",
    )
    parser.add_argument(
        "--output",
        default="database/seeding/seeded_products.json",
        help="Output JSON path for pipeline tracking (repo-relative or absolute)",
    )
    args = parser.parse_args()

    cfg: dict[str, Any] = {
        "dry_run": args.dry_run,
        "batch_size": args.batch_size,
        "writes_per_second_limit": args.writes_per_second,
    }
    if args.subset:
        cfg["subset"] = args.subset

    run(args.input, args.output, cfg)
