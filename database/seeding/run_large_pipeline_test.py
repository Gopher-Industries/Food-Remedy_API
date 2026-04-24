import argparse
import json
import os
import sys
import time
import tracemalloc
from datetime import datetime
from typing import Dict, List, Sequence

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from database.pipeline.run_pipeline import runPipeline


SEED_DIR = os.path.join(REPO_ROOT, "database", "seeding")

DEFAULT_SHARD_INPUTS = [
    os.path.join(SEED_DIR, "products_0k_10k.json"),
    os.path.join(SEED_DIR, "products_10k_20k.json"),
    os.path.join(SEED_DIR, "products_20k_30k.json"),
    os.path.join(SEED_DIR, "products_30k_40k.json"),
    os.path.join(SEED_DIR, "products_40k_50k.json"),
]
DEFAULT_50K_PLUS_INPUT = os.path.join(SEED_DIR, "products_50k+.json")


def _now_utc() -> str:
    return datetime.utcnow().isoformat()


def _load_records(path: str) -> List[dict]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return list(data.values())
    raise ValueError(f"Unsupported JSON format in {path}; expected list or dict")


def _resolve_input_files(input_files: Sequence[str]) -> List[str]:
    if input_files:
        return [os.path.abspath(path) for path in input_files]

    existing_shards = [path for path in DEFAULT_SHARD_INPUTS if os.path.exists(path)]
    has_50k_plus = os.path.exists(DEFAULT_50K_PLUS_INPUT)

    auto_inputs: List[str] = []
    if existing_shards:
        auto_inputs.extend(existing_shards)
    if has_50k_plus:
        auto_inputs.append(DEFAULT_50K_PLUS_INPUT)

    if auto_inputs:
        return auto_inputs

    raise FileNotFoundError(
        "No large dataset input files found. Provide --input-files explicitly."
    )


def _chunk(records: List[dict], chunk_size: int) -> List[List[dict]]:
    return [records[i:i + chunk_size] for i in range(0, len(records), chunk_size)]


def _build_config(
    chunk_input_path: str,
    chunk_enriched_path: str,
    report_path: str,
    metadata_path: str,
    checkpoint_path: str,
) -> Dict:
    return {
        "pipeline": {
            "fail_on_error": False,
            "outputs": {
                "metadata": metadata_path,
                "checkpoints": checkpoint_path,
            },
            "clean": {
                "enabled": False,
            },
            "enrich": {
                "enabled": True,
                "input": chunk_input_path,
                "output": chunk_enriched_path,
                "modules": [
                    {
                        "name": "nutrition_enrich",
                        "path": os.path.join(
                            REPO_ROOT,
                            "database",
                            "pipeline",
                            "modules",
                            "nutrition_enrich.py",
                        ),
                        "enabled": True,
                    },
                    {
                        "name": "schema_validator",
                        "path": os.path.join(
                            REPO_ROOT,
                            "database",
                            "pipeline",
                            "modules",
                            "schema_validator.py",
                        ),
                        "enabled": True,
                        "config": {
                            "report_path": report_path,
                        },
                    },
                ],
            },
            "seed": {
                "enabled": False,
            },
        }
    }


def run_large_pipeline_test(
    input_files: Sequence[str],
    chunk_size: int,
    output_dir: str,
    max_records: int = None,
    dry_run: bool = False,
    stop_on_error: bool = False,
    allow_under_50k: bool = False,
) -> Dict:
    run_id = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    run_dir = os.path.join(output_dir, f"large_pipeline_{run_id}")
    os.makedirs(run_dir, exist_ok=True)

    resolved_inputs = _resolve_input_files(input_files)

    print("[Large Test] Loading large dataset inputs:")
    for path in resolved_inputs:
        print(f"  - {path}")

    load_start = time.perf_counter()
    all_records: List[dict] = []
    for path in resolved_inputs:
        if not os.path.exists(path):
            raise FileNotFoundError(f"Input file not found: {path}")
        all_records.extend(_load_records(path))
    load_elapsed = time.perf_counter() - load_start

    if max_records is not None:
        all_records = all_records[:max_records]

    total_records = len(all_records)
    if total_records == 0:
        raise RuntimeError("No records loaded; cannot run large dataset test")

    if total_records < 50000 and not allow_under_50k:
        raise RuntimeError(
            f"Loaded {total_records} records, but 50k+ is required. "
            "Use --allow-under-50k to override for local testing."
        )

    chunks = _chunk(all_records, chunk_size)
    total_chunks = len(chunks)

    print(f"[Large Test] Loaded {total_records} records in {load_elapsed:.2f}s")
    print(f"[Large Test] Chunk size: {chunk_size} | Total chunks: {total_chunks}")
    print(f"[Large Test] Dry-run: {dry_run}")

    tracemalloc.start()
    suite_start = time.perf_counter()

    chunk_results: List[Dict] = []
    processed_total = 0
    total_failures = 0
    failed_chunks = 0

    for idx, chunk_records in enumerate(chunks, start=1):
        chunk_input_path = os.path.join(run_dir, f"chunk_{idx:03d}_input.json")
        chunk_output_path = os.path.join(run_dir, f"chunk_{idx:03d}_enriched.json")
        chunk_report_path = os.path.join(run_dir, f"chunk_{idx:03d}_schema_report.json")
        chunk_metadata_path = os.path.join(run_dir, f"chunk_{idx:03d}_pipeline_metadata.json")
        chunk_checkpoint_path = os.path.join(run_dir, f"chunk_{idx:03d}_pipeline_checkpoint.json")

        with open(chunk_input_path, "w", encoding="utf-8") as f:
            json.dump(chunk_records, f, ensure_ascii=False)

        cfg = _build_config(
            chunk_input_path=chunk_input_path,
            chunk_enriched_path=chunk_output_path,
            report_path=chunk_report_path,
            metadata_path=chunk_metadata_path,
            checkpoint_path=chunk_checkpoint_path,
        )

        print(f"[Large Test] Running chunk {idx}/{total_chunks} ({len(chunk_records)} records)")

        chunk_start = time.perf_counter()
        stage_error = None
        stage_processed = 0
        stage_failures = 0

        try:
            run_result = runPipeline(
                config=cfg,
                run_clean=False,
                run_enrich=True,
                run_seed=False,
                dry_run=dry_run,
                force=True,
            )
            enrich_stage = run_result.get("stages", {}).get("enrich", {})
            if isinstance(enrich_stage, dict):
                stage_error = enrich_stage.get("error")
                stage_processed = int(enrich_stage.get("processed") or len(chunk_records))
                stage_failures = int(enrich_stage.get("failures") or 0)
            else:
                stage_processed = len(chunk_records)
        except Exception as exc:
            stage_error = str(exc)
            stage_processed = 0
            stage_failures = len(chunk_records)

        chunk_elapsed = time.perf_counter() - chunk_start
        records_per_second = (stage_processed / chunk_elapsed) if chunk_elapsed > 0 else None
        ok = stage_error is None

        if not ok:
            failed_chunks += 1
            if stop_on_error:
                print(f"[Large Test] Chunk {idx} failed; stop_on_error=True, stopping run")

        processed_total += stage_processed
        total_failures += stage_failures

        chunk_result = {
            "chunk_index": idx,
            "records_in_chunk": len(chunk_records),
            "processed": stage_processed,
            "failures": stage_failures,
            "duration_seconds": round(chunk_elapsed, 4),
            "records_per_second": round(records_per_second, 2) if records_per_second is not None else None,
            "status": "ok" if ok else "failed",
            "error": stage_error,
            "input_path": chunk_input_path,
            "output_path": chunk_output_path,
            "report_path": chunk_report_path,
            "metadata_path": chunk_metadata_path,
        }
        chunk_results.append(chunk_result)

        print(
            f"[Large Test] Chunk {idx} done in {chunk_elapsed:.2f}s | "
            f"processed={stage_processed} | failures={stage_failures}"
        )

        if stop_on_error and not ok:
            break

    suite_elapsed = time.perf_counter() - suite_start
    _, peak_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    throughput = (processed_total / suite_elapsed) if suite_elapsed > 0 else 0.0

    min_records_required = 50000
    meets_size_requirement = total_records >= min_records_required
    complete_processing = processed_total >= sum(c["records_in_chunk"] for c in chunk_results if c["status"] == "ok")

    success = (
        (meets_size_requirement or allow_under_50k)
        and failed_chunks == 0
        and total_failures == 0
        and complete_processing
    )

    summary = {
        "run_id": run_id,
        "started_at_utc": _now_utc(),
        "input_files": resolved_inputs,
        "output_directory": run_dir,
        "dry_run": dry_run,
        "chunk_size": chunk_size,
        "total_records_loaded": total_records,
        "load_duration_seconds": round(load_elapsed, 4),
        "total_chunks": total_chunks,
        "processed_total": processed_total,
        "failed_chunks": failed_chunks,
        "record_failures": total_failures,
        "suite_duration_seconds": round(suite_elapsed, 4),
        "throughput_records_per_second": round(throughput, 2),
        "peak_memory_mb": round(peak_bytes / (1024 * 1024), 2),
        "meets_50k_requirement": meets_size_requirement,
        "success": success,
        "chunk_results": chunk_results,
    }

    summary_path = os.path.join(run_dir, "performance_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print("\n[Large Test] Performance summary")
    print(f"  Total records loaded: {total_records}")
    print(f"  Processed total: {processed_total}")
    print(f"  Failed chunks: {failed_chunks}")
    print(f"  Record failures: {total_failures}")
    print(f"  Suite duration: {suite_elapsed:.2f}s")
    print(f"  Throughput: {throughput:.2f} records/sec")
    print(f"  Peak memory: {peak_bytes / (1024 * 1024):.2f} MB")
    print(f"  Meets 50k requirement: {meets_size_requirement}")
    print(f"  Success: {success}")
    print(f"  Summary written to: {summary_path}")

    return summary


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run pipeline enrichment on large (50k+) product datasets and monitor performance"
    )
    parser.add_argument(
        "--input-files",
        nargs="*",
        default=[],
        help="One or more JSON input files. Defaults to products_50k+.json if present.",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=10000,
        help="Number of records processed per pipeline run chunk.",
    )
    parser.add_argument(
        "--max-records",
        type=int,
        default=None,
        help="Optional cap for records loaded (useful for smoke tests).",
    )
    parser.add_argument(
        "--output-dir",
        default=os.path.join(SEED_DIR, "performance_runs"),
        help="Directory where chunk artifacts and performance summary are written.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run pipeline in dry-run mode when supported by modules.",
    )
    parser.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Stop immediately when any chunk fails.",
    )
    parser.add_argument(
        "--allow-under-50k",
        action="store_true",
        help="Allow running with fewer than 50k records (for local testing only).",
    )
    return parser.parse_args()


def main():
    args = _parse_args()
    if args.chunk_size <= 0:
        raise ValueError("--chunk-size must be greater than zero")

    summary = run_large_pipeline_test(
        input_files=args.input_files,
        chunk_size=args.chunk_size,
        output_dir=os.path.abspath(args.output_dir),
        max_records=args.max_records,
        dry_run=args.dry_run,
        stop_on_error=args.stop_on_error,
        allow_under_50k=args.allow_under_50k,
    )

    if not summary.get("success"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
