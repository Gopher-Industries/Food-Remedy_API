"""
Run DB014 dataset validation on a JSON list of products.

Usage (from repository root):
  python scripts/run_db014_validation.py
  python scripts/run_db014_validation.py path/to/products.json

Writes database/Validation/schema_validation_report.json unless --no-report.
"""

import argparse
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from database.Validation.db021_validator import DB021Validator  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="DB014 / DB021 validation runner")
    parser.add_argument(
        "json_path",
        nargs="?",
        default=os.path.join(ROOT, "database", "seeding", "cleanTestSample.json"),
        help="Path to JSON array of product objects",
    )
    parser.add_argument(
        "--no-report",
        action="store_true",
        help="Do not write schema_validation_report.json",
    )
    args = parser.parse_args()

    with open(args.json_path, "r", encoding="utf-8") as f:
        products = json.load(f)

    if not isinstance(products, list):
        print("Error: JSON root must be a list of products", file=sys.stderr)
        sys.exit(1)

    v = DB021Validator()
    result = v.run_all_validations(products, write_report=not args.no_report)
    print(json.dumps(result, indent=2))

    ok = (
        result["basic_schema"]
        and result["nutrients"]
        and result["allergens"]
        and result["barcode"]["ok"]
        and result["schema_validation"]["valid"]
    )
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
