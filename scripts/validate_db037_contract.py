#!/usr/bin/env python3
"""Validate enriched JSON maps to ProductDetail v1 (DB037 lock)."""
from __future__ import annotations

import argparse
import json
import sys
import types
from pathlib import Path

repo_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(repo_root))

fake_pd = types.SimpleNamespace()
fake_pd.DataFrame = lambda *a, **k: None
sys.modules.setdefault("pandas", fake_pd)

from mapping.contract_paths import CANONICAL_CONTRACT_PATH, CONTRACT_EXAMPLES_DIR
from mapping.validate_product_contract import validate_dataset, validate_product


def _validate_examples() -> tuple[int, int]:
    ok = 0
    bad = 0
    for path in sorted(CONTRACT_EXAMPLES_DIR.glob("*.json")):
        with path.open(encoding="utf-8") as fh:
            payload = json.load(fh)
        errors = validate_product(payload)
        if errors:
            print("FAIL example", path.name, errors)
            bad += 1
        else:
            print("OK   example", path.name)
            ok += 1
    return ok, bad


def main() -> int:
    parser = argparse.ArgumentParser(description="DB037 contract validation")
    parser.add_argument(
        "--input",
        type=Path,
        default=repo_root / "database" / "seeding" / "cleanTestSample.json",
        help="Enriched JSON array to map and validate",
    )
    args = parser.parse_args()

    if not CANONICAL_CONTRACT_PATH.is_file():
        print("Missing canonical schema:", CANONICAL_CONTRACT_PATH)
        return 1

    print("Schema:", CANONICAL_CONTRACT_PATH.relative_to(repo_root))
    ex_ok, ex_bad = _validate_examples()
    print(f"Examples: {ex_ok} ok, {ex_bad} failed")

    result = validate_dataset(args.input)
    print(
        f"Dataset {args.input.name}: {result['valid']}/{result['total']} valid, "
        f"{result['invalid']} invalid"
    )
    if result["errors"]:
        for item in result["errors"][:5]:
            print(" ", item)
        if len(result["errors"]) > 5:
            print(f"  ... and {len(result['errors']) - 5} more")

    if ex_bad or result["invalid"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
