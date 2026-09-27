"""
DB044 - Investigate Database Pipeline Performance
Measures approximate execution time for representative pipeline operations.
Identifies stages and modules that contribute most to processing time.
No existing pipeline functionality is changed.
"""

import time
import json
import os
import sys

_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)


def timer(label):
    """Simple context manager to time a block of code."""
    class Timer:
        def __enter__(self):
            self.start = time.perf_counter()
            return self
        def __exit__(self, *args):
            self.elapsed = time.perf_counter() - self.start
            print(f"  [{label}]: {self.elapsed:.4f}s")
    return Timer()


def load_sample_data(path: str) -> list:
    """Load sample product data for benchmarking."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        data = list(data.values())
    return data if isinstance(data, list) else []


def benchmark_clean_stage(data: list) -> dict:
    """Measure clean stage processing time."""
    print("\n--- Clean Stage ---")
    results = {}

    with timer("flatten records") as t:
        cleaned = []
        for record in data:
            if not isinstance(record, dict):
                continue
            flat = {}
            for k, v in record.items():
                if isinstance(v, (list, dict)):
                    flat[k] = json.dumps(v)
                else:
                    flat[k] = v
            cleaned.append(flat)
    results["flatten_records"] = t.elapsed

    return results


def benchmark_enrich_modules(data: list) -> dict:
    """Measure enrichment module processing times individually."""
    print("\n--- Enrich Stage Modules ---")
    results = {}

    # Allergen enrichment
    try:
        from utils.detect_allergens import detect_allergens
        with timer("allergen detection") as t:
            for record in data:
                detect_allergens(record)
        results["allergen_detection"] = t.elapsed
    except Exception as e:
        print(f"  [allergen detection]: skipped ({e})")

    # Personalisation tags
    try:
        from database.pipeline.modules.db009_personalisation_tags import enrich_record as enrich_tags
        with timer("personalisation tags") as t:
            for record in data:
                try:
                    enrich_tags(record.copy())
                except Exception:
                    pass
        results["personalisation_tags"] = t.elapsed
    except Exception as e:
        print(f"  [personalisation tags]: skipped ({e})")

    # Mood tags
    try:
        from database.pipeline.modules.db021_mood_tags import enrich_record as enrich_mood
        with timer("mood tags") as t:
            for record in data:
                try:
                    enrich_mood(record.copy())
                except Exception:
                    pass
        results["mood_tags"] = t.elapsed
    except Exception as e:
        print(f"  [mood tags]: skipped ({e})")

    # Alternative product mapping
    try:
        from database.pipeline.modules.db019_alternative_product_mapping import build_index
        with timer("alternative product mapping (index build)") as t:
            try:
                build_index(data[:100], config={})
            except Exception:
                pass
        results["alternative_mapping"] = t.elapsed
    except Exception as e:
        print(f"  [alternative mapping]: skipped ({e})")

    return results


def benchmark_schema_validation(data: list) -> dict:
    """Measure schema validation time."""
    print("\n--- Schema Validation ---")
    results = {}

    try:
        from database.pipeline.modules.schema_validator import _validate_record
        with timer("schema validation") as t:
            for record in data:
                _validate_record(record)
        results["schema_validation"] = t.elapsed
    except Exception as e:
        print(f"  [schema validation]: skipped ({e})")

    return results


def benchmark_json_io(path: str) -> dict:
    """Measure JSON file read/write times."""
    print("\n--- JSON I/O ---")
    results = {}

    with timer("json read") as t:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    results["json_read"] = t.elapsed

    tmp_path = os.path.join(
        os.path.dirname(__file__), "test_reports", "db044_tmp_output.json"
    )
    os.makedirs(os.path.dirname(tmp_path), exist_ok=True)

    with timer("json write") as t:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    results["json_write"] = t.elapsed

    # cleanup
    if os.path.exists(tmp_path):
        os.remove(tmp_path)

    return results


def identify_bottlenecks(all_results: dict) -> list:
    """Identify the slowest operations."""
    flat = {}
    for stage, timings in all_results.items():
        for op, elapsed in timings.items():
            flat[f"{stage}.{op}"] = elapsed

    sorted_ops = sorted(flat.items(), key=lambda x: x[1], reverse=True)
    total = sum(flat.values())

    bottlenecks = []
    for op, elapsed in sorted_ops:
        pct = (elapsed / total * 100) if total > 0 else 0
        bottlenecks.append({
            "operation": op,
            "elapsed_seconds": round(elapsed, 4),
            "percentage_of_total": round(pct, 1)
        })

    return bottlenecks


def run_investigation(input_path: str):
    """Run the full performance investigation."""
    print(f"\n{'='*60}")
    print(f"DB044 - Pipeline Performance Investigation")
    print(f"Input: {input_path}")
    print(f"{'='*60}")

    # Load data
    print("\n--- Loading Data ---")
    with timer("load data") as t:
        data = load_sample_data(input_path)
    load_time = t.elapsed
    print(f"  Loaded {len(data)} records")

    all_results = {
        "io": {"load_data": load_time},
        "io_write": benchmark_json_io(input_path),
        "clean": benchmark_clean_stage(data),
        "enrich": benchmark_enrich_modules(data),
        "validation": benchmark_schema_validation(data),
    }

    # Summary
    print(f"\n{'='*60}")
    print("PERFORMANCE SUMMARY")
    print(f"{'='*60}")
    print(f"Records processed: {len(data)}")

    bottlenecks = identify_bottlenecks(all_results)
    print("\nOperations ranked by time (slowest first):")
    for i, b in enumerate(bottlenecks, 1):
        marker = " <- SLOWEST" if i == 1 else ""
        print(f"  #{i} {b['operation']}: {b['elapsed_seconds']}s ({b['percentage_of_total']}%){marker}")

    total = sum(b['elapsed_seconds'] for b in bottlenecks)
    print(f"\nTotal measured time: {round(total, 4)}s")

    # Recommendations
    print(f"\n{'='*60}")
    print("RECOMMENDATIONS")
    print(f"{'='*60}")
    slowest = bottlenecks[0] if bottlenecks else None
    if slowest:
        print(f"1. '{slowest['operation']}' is the slowest operation ({slowest['percentage_of_total']}% of total).")
        print("   Consider optimising or caching this operation for large datasets.")
    print("2. JSON I/O is a significant cost for large files — consider streaming reads.")
    print("3. Alternative product mapping scans all products for each record — O(n²) complexity.")
    print("   Consider pre-indexing or batching for datasets over 10k records.")
    print("4. Enrichment modules run sequentially — parallel execution could improve throughput.")

    # Save report
    report_path = os.path.join(
        os.path.dirname(__file__), "test_reports",
        f"db044_performance_report_{int(time.time())}.json"
    )
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    report = {
        "input": input_path,
        "record_count": len(data),
        "results": all_results,
        "bottlenecks": bottlenecks,
        "total_measured_seconds": round(total, 4)
    }
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport saved to: {report_path}")


if __name__ == "__main__":
    input_path = "database/seeding/cleanTestSample.json"
    if not os.path.exists(input_path):
        input_path = "database/data_investigation/exampleProductCleaned.json"
    run_investigation(input_path)