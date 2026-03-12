import json
import os
import time
from datetime import datetime

from database.pipeline.run_pipeline import runPipeline


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SEED_DIR = os.path.join(REPO_ROOT, "database", "seeding")


def slice_5k(source_path: str, dest_path: str, count: int = 5000):
    with open(source_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    subset = data[:count]
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with open(dest_path, "w", encoding="utf-8") as f:
        json.dump(subset, f, ensure_ascii=False)
    return dest_path


def build_config(input_path: str, enriched_out: str, report_path: str):
    repo_root = REPO_ROOT
    return {
        "pipeline": {
            "fail_on_error": False,
            "clean": {"enabled": False},
            "enrich": {
                "enabled": True,
                "input": input_path,
                "output": enriched_out,
                "modules": [
                    {
                        "name": "nutrition_enrich",
                        "path": os.path.join(repo_root, "database", "pipeline", "modules", "nutrition_enrich.py"),
                        "enabled": True,
                    },
                    {
                        "name": "schema_validator",
                        "path": os.path.join(repo_root, "database", "pipeline", "modules", "schema_validator.py"),
                        "enabled": True,
                        "config": {"report_path": report_path},
                    },
                ],
            },
            "seed": {"enabled": False},
        }
    }


def main():
    src = os.path.join(SEED_DIR, "products_40k_50k.json")
    if not os.path.exists(src):
        raise FileNotFoundError(f"Source sample not found: {src}")

    sample_5k = os.path.join(SEED_DIR, "products_5k_test.json")
    enriched_out = os.path.join(SEED_DIR, "products_5k_enriched.json")
    report_path = os.path.join(REPO_ROOT, "database", "pipeline", "test_reports", f"schema_report_{int(time.time())}.json")

    print(f"Slicing 5k records -> {sample_5k}")
    slice_5k(src, sample_5k, count=5000)

    cfg = build_config(sample_5k, enriched_out, report_path)

    print("Running pipeline enrich stage on 5k sample (nutrition_enrich + schema_validator)")
    start = time.time()
    # Run actual enrichment (not dry-run) so module outputs are produced
    res = runPipeline(config=cfg, run_clean=False, run_enrich=True, run_seed=False, dry_run=False)
    elapsed = time.time() - start

    print(f"Pipeline finished in {elapsed:.2f}s")
    print("Result metadata:")
    print(json.dumps(res, indent=2))

    if os.path.exists(report_path):
        print(f"Reading report: {report_path}")
        with open(report_path, "r", encoding="utf-8") as rf:
            report = json.load(rf)
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print("No report produced")


if __name__ == "__main__":
    main()
