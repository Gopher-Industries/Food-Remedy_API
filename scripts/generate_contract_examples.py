#!/usr/bin/env python3
"""Regenerate ProductDetail v1 example payloads (DB037).

Reads database/seeding/cleanTestSample.json, maps the first three barcoded
records, and writes api/contracts/examples/*.json.
"""
from __future__ import annotations

import json
import sys
import types
from pathlib import Path

repo_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(repo_root))

fake_pd = types.SimpleNamespace()
fake_pd.DataFrame = lambda *a, **k: None
sys.modules.setdefault("pandas", fake_pd)

from mapping.contract_paths import CONTRACT_EXAMPLES_DIR
from mapping.map_enriched_to_product_detail import map_enriched_to_product_detail
from mapping.validate_product_contract import validate_product

INPUT = repo_root / "database" / "seeding" / "cleanTestSample.json"
OUTPUT_NAMES = ("tuna_tomato_onion", "vegetable_oil", "third_sample")


def main() -> int:
    with INPUT.open(encoding="utf-8") as fh:
        data = json.load(fh)
    records = [r for r in data if isinstance(r, dict) and r.get("barcode")][:3]
    if len(records) < 3:
        print("Need at least 3 barcoded records in", INPUT)
        return 1

    CONTRACT_EXAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    failed = 0
    for name, record in zip(OUTPUT_NAMES, records):
        mapped = map_enriched_to_product_detail(record)
        errors = validate_product(mapped)
        out_path = CONTRACT_EXAMPLES_DIR / f"{name}.json"
        out_path.write_text(json.dumps(mapped, indent=2), encoding="utf-8")
        status = "ok" if not errors else f"errors: {errors}"
        print(out_path.relative_to(repo_root), mapped["barcode"], status)
        if errors:
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
