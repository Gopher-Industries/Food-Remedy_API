#!/usr/bin/env python3
"""Run DB021 and report DB047 release criteria against the unchanged saved candidate.

Exit 0: checks pass, still subject to release approval; 1: blocked/review required;
2: input or execution failure. Never seeds Firestore or repairs source records.
"""

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from database.Validation.db021_validator import DB021Validator
from database.Validation.schema_loader import load_schema
from database.clean_data.cleanProductData import standardise_category

SCHEMA = ROOT / "database/seeding/schema_definition.json"
CONFIG = ROOT / "database/pipeline/pipeline.config.json"
PLACEHOLDER_NAMES = {"nan", "null", "none", "n/a"}


class ReleaseValidator(DB021Validator):
    """Keep DB021 checks unchanged; capture its report without overwriting its default file."""

    def __init__(self):
        self.schema = load_schema(str(SCHEMA))

    def generate_report(self, results):
        # The CLI saves the full DB021 result inside the selected release report.
        pass


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def validate(products):
    if not isinstance(products, list) or any(not isinstance(p, dict) for p in products):
        raise ValueError("Expected a JSON array of product objects; malformed rows are not silently dropped")

    validator = ReleaseValidator()
    current = validator.run_all_validations(products)
    current_errors = defaultdict(list)
    for failure in current["schema_validation"]["errors"]:
        current_errors[failure["index"]].extend("schema: " + e for e in failure["errors"])

    # Trace the same preprocessed barcode values that run_all_validations checks.
    seen = set()
    barcode_groups = defaultdict(list)
    for index, product in enumerate(products):
        barcode = validator.preprocess_record(product).get("barcode")
        if not isinstance(barcode, str) or not barcode:
            current_errors[index].append("barcode_missing")
        elif not validator._is_valid_barcode_format(barcode):
            current_errors[index].append("barcode_invalid_format")
        else:
            barcode_groups[barcode].append(index)
            if barcode in seen:
                current_errors[index].append("barcode_duplicate")
            seen.add(barcode)

    release_errors = {i: list(reasons) for i, reasons in current_errors.items()}
    raw_name_missing = raw_name_placeholder = raw_barcode_not_string = 0
    for index, product in enumerate(products):
        reasons = release_errors.setdefault(index, [])
        barcode = product.get("barcode")
        if not isinstance(barcode, str):
            raw_barcode_not_string += 1
            reasons.append("stored_barcode_not_string")
        name = product.get("productName")
        if not isinstance(name, str) or not name.strip():
            raw_name_missing += 1
            reasons.append("stored_product_name_missing_or_unusable")
        elif name.strip().lower() in PLACEHOLDER_NAMES:
            raw_name_placeholder += 1
            reasons.append("stored_product_name_placeholder")
        # DB021's diagnostic checks can reject null structures that its optional
        # schema fields accept. Keep those failures visible in release status.
        if not isinstance(product.get("nutriments", {}), dict):
            reasons.append("nutrient_structure_invalid")
        if not isinstance(product.get("allergens", []), list):
            reasons.append("allergen_structure_invalid")

    # All members of an ambiguous identifier group need review, including the first.
    for indices in barcode_groups.values():
        if len(indices) > 1:
            for index in indices:
                if "barcode_duplicate" not in release_errors[index]:
                    release_errors[index].append("barcode_duplicate")

    failures = [
        {"index": i, "barcode": products[i].get("barcode"),
         "productName": products[i].get("productName"), "reasons": reasons}
        for i, reasons in release_errors.items() if reasons
    ]
    failures.sort(key=lambda item: item["index"])
    reason_counts = Counter(reason for item in failures for reason in item["reasons"])
    missing_ingredients = sum(
        not isinstance(p.get("ingredientsText"), str) or not p["ingredientsText"].strip()
        for p in products
    )
    empty_allergens = sum(p.get("allergens") in (None, []) for p in products)
    categories = Counter(standardise_category(p.get("categories"))
                         if isinstance(p.get("categories"), (list, str)) else "other"
                         for p in products)
    missing_categories = sum(not p.get("categories") for p in products)
    reviews = []
    if empty_allergens:
        reviews.append({
            "code": "allergen_unknown_state_review", "records": empty_allergens,
            "reason": "Missing/empty stored allergens do not prove allergen-free status. "
                      "Confirm conservative handling through enrichment and the API before approval.",
        })
    dataset_errors = [] if products else ["empty_dataset"]
    dataset_errors.extend(
        "db021_" + check + "_failed"
        for check in ("basic_schema", "nutrients", "allergens") if not current[check]
    )
    status = "BLOCKED" if failures or dataset_errors else (
        "REVIEW_REQUIRED" if reviews else "CHECKS_PASSED_PENDING_APPROVAL"
    )
    return {
        "status": status,
        "release_approved": False,
        "total_records": len(products),
        "valid_records": len(products) - len(failures),
        "invalid_records": len(failures),
        "count_definition": "Unique rows passing/failing DB021 plus stored required-field checks; "
                            "dataset-wide reviews are separate. Valid does not mean release approved.",
        "dataset_errors": dataset_errors,
        "current_validation": {
            "batch_gate_passed": bool(current["schema_validation"]["valid"] and current["barcode"]["ok"]),
            "valid_records": len(products) - len(current_errors),
            "invalid_records": len(current_errors),
            "result": current,
        },
        "stored_required_fields": {
            "missing_or_unusable_names": raw_name_missing,
            "placeholder_names": raw_name_placeholder,
            "non_string_barcodes": raw_barcode_not_string,
            "approved_exceptions_applied": [],
        },
        "quality": {
            "missing_ingredient_text": missing_ingredients,
            "missing_or_empty_allergens": empty_allergens,
            "missing_categories": missing_categories,
            "category_rule_replay_counts": dict(sorted(categories.items())),
        },
        "reason_counts": dict(sorted(reason_counts.items())),
        "failed_records": failures,
        "required_reviews": reviews,
        "limitations": [
            "No source generation/version approval is inferred from committed filenames or pipeline configuration.",
            "DB021 validates normalised copies; this report separately checks saved barcode/name values.",
            "Placeholder names nan/null/none/n/a require source correction or an explicit reviewed exception.",
            "Barcode checks cover format and uniqueness, not GTIN check digits.",
            "Missing source ingredients/categories are measured, not inferred or repaired.",
            "This is an offline candidate check, not a Firestore, API, reproducibility or full nutrition-safety certification.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "database/seeding/products_enriched.json")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.resolve() in {args.input.resolve(), SCHEMA.resolve(), CONFIG.resolve()}:
        parser.error("Report must not overwrite the dataset, schema or pipeline configuration")
    try:
        raw = args.input.read_bytes()
        report = validate(json.loads(raw))
        digest = hashlib.sha256(raw).hexdigest()
        config = json.loads(CONFIG.read_bytes())["pipeline"]
        source = ROOT / config["enrich"]["input"]
        report["provenance"] = {
            "validated_at_utc": datetime.now(timezone.utc).isoformat(),
            "dataset": args.input.name, "dataset_sha256": digest,
            "dataset_version": "unapproved-candidate-" + digest[:12],
            "dataset_generation_date": None,
            "checkout_commit": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
            "validation_script_sha256": sha256(__file__),
            "db021_validator_sha256": sha256(ROOT / "database/Validation/db021_validator.py"),
            "schema_sha256": sha256(SCHEMA),
            "category_classifier_sha256": sha256(ROOT / "database/clean_data/cleanProductData.py"),
            "pipeline_config_sha256": sha256(CONFIG),
            "configured_enrichment_input": config["enrich"]["input"],
            "configured_enrichment_input_sha256": sha256(source) if source.exists() else None,
            "configured_seed_input": config["seed"]["input"],
            "config_note": "Observed configuration; not proof that it generated this candidate",
        }
        if args.input.read_bytes() != raw:
            raise ValueError("Dataset changed during validation; rerun against a stable candidate")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    except Exception as exc:
        # CLI boundary: schema_loader also raises generic Exception on load
        # failure. Execution failures must return 2, not the blocked-data code 1.
        print(f"Validation could not complete: {exc}", file=sys.stderr)
        return 2
    print(f"{report['status']}: total={report['total_records']}, "
          f"valid={report['valid_records']}, invalid={report['invalid_records']}; report={args.output}")
    return 0 if report["status"] == "CHECKS_PASSED_PENDING_APPROVAL" else 1


if __name__ == "__main__":
    sys.exit(main())
