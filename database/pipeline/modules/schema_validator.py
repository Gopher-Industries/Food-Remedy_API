import json
import os
import time
from typing import Any, Dict, List


def _validate_record(record: Dict[str, Any]) -> List[str]:
    errors = []
    # Required fields for Firestore seeding
    if "barcode" not in record:
        errors.append("missing_barcode")
    else:
        if not isinstance(record["barcode"], str) or not record["barcode"].strip():
            errors.append("invalid_barcode")

    # Nutriments should be a dict (can be empty)
    if "nutriments" in record and not isinstance(record["nutriments"], dict):
        errors.append("invalid_nutriments_type")

    return errors


def run(input_path: str, output_path: str, config: dict):
    """Validate product objects for minimal Firestore compatibility.

    Writes a JSON report to `report_path` (from config) or to
    `database/pipeline/test_reports/schema_report.json` by default.

    The module passes the input through to `output_path` unchanged.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input not found: {input_path}")

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    total = 0
    valid = 0
    invalid = 0
    examples = []

    if isinstance(data, list):
        iterable = data
    elif isinstance(data, dict):
        # support newline-delimited JSON written as dict-of-docs
        iterable = list(data.values())
    else:
        raise RuntimeError("Unsupported input JSON format; expected list or dict")

    for rec in iterable:
        total += 1
        errs = _validate_record(rec)
        if errs:
            invalid += 1
            if len(examples) < 10:
                examples.append({"barcode": rec.get("barcode"), "errors": errs})
        else:
            valid += 1

    report = {
        "total": total,
        "valid": valid,
        "invalid": invalid,
        "invalid_examples": examples,
    }

    # determine dry-run behaviour
    dry = False
    if config and isinstance(config, dict):
        dry = bool(config.get("dry_run"))

    # determine report path (timestamped default)
    report_path = None
    if config and isinstance(config, dict):
        report_path = config.get("report_path")
    if not report_path:
        repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        report_dir = os.path.join(repo_root, "pipeline", "test_reports")
        os.makedirs(report_dir, exist_ok=True)
        ts = int(time.time())
        report_path = os.path.join(report_dir, f"schema_report_{ts}.json")

    if dry:
        print("DRY-RUN: schema validation report (not written):")
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        os.makedirs(os.path.dirname(report_path) or ".", exist_ok=True)
        with open(report_path, "w", encoding="utf-8") as rf:
            json.dump(report, rf, indent=2, ensure_ascii=False)

    # pass-through copy to output_path (skip write on dry-run)
    if dry:
        print(f"DRY-RUN: skipping write of output pass-through to {output_path}")
    else:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as out_f:
            json.dump(data, out_f, ensure_ascii=False)

    return {"processed": total, "failures": invalid if invalid else None, "output": (None if dry else output_path), "report": (None if dry else report_path)}
