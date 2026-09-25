#!/usr/bin/env python3
"""DB038 — Generate source-data gap evidence from a product JSON dataset.

Writes a JSON report suitable for Planner / ticket evidence and prints a short summary.

Usage (from repo root):
  python scripts/db038_gap_evidence.py -i database/seeding/products_5k_enriched.json
  python scripts/db038_gap_evidence.py -i database/seeding/products_5k_enriched_db032_remediated.json -o scripts/reports/db038_gap_stats_remediated.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.validate_cleaned_dataset import load_products

MIN_NUTRIENTS_FOR_SCORE = 3
NUTRIENT_KEYS = (
    "sugars_100g",
    "sugars",
    "proteins_100g",
    "proteins",
    "fat_100g",
    "fat",
    "saturated-fat_100g",
    "saturated-fat",
    "fiber_100g",
    "fiber",
    "fibre_100g",
    "fibre",
    "sodium_100g",
    "sodium",
    "energy-kcal_100g",
    "energy-kcal",
    "energy_100g",
)


def _has_text(val: Any) -> bool:
    return isinstance(val, str) and bool(val.strip())


def _nutrient_count(product: dict) -> int:
    n = product.get("nutriments_normalized") or product.get("nutriments") or {}
    if not isinstance(n, dict):
        return 0
    known = 0
    for key in NUTRIENT_KEYS:
        v = n.get(key)
        if v is None or v == "":
            continue
        try:
            float(v)
            known += 1
        except (TypeError, ValueError):
            continue
    return known


def _enrichment_nutrition(product: dict) -> dict:
    enrichment = product.get("enrichment") or {}
    if isinstance(enrichment, dict):
        nutrition = enrichment.get("nutrition") or {}
        if isinstance(nutrition, dict):
            return nutrition
    return {}


def analyse(products: list[dict], source: Path) -> dict:
    total = len(products)
    missing = {
        "brand": 0,
        "categories": 0,
        "standardCategory": 0,
        "nutriments": 0,
        "productName": 0,
        "ingredientsText": 0,
    }
    standard_category_counts: dict[str, int] = {}
    insufficient_score_data = 0
    null_composite_score = 0
    has_provisional_only = 0

    for p in products:
        if not _has_text(p.get("brand")):
            missing["brand"] += 1
        cats = p.get("categories")
        if not cats or (isinstance(cats, list) and len(cats) == 0):
            missing["categories"] += 1
        if not _has_text(p.get("standardCategory")) and not _has_text(p.get("category")):
            missing["standardCategory"] += 1
        n = p.get("nutriments")
        if not n or (isinstance(n, dict) and len(n) == 0):
            missing["nutriments"] += 1
        if not _has_text(p.get("productName")):
            missing["productName"] += 1
        if not _has_text(p.get("ingredientsText")):
            missing["ingredientsText"] += 1

        std = (p.get("standardCategory") or p.get("category") or "unknown").strip().lower()
        standard_category_counts[std] = standard_category_counts.get(std, 0) + 1

        if _nutrient_count(p) < MIN_NUTRIENTS_FOR_SCORE:
            insufficient_score_data += 1

        nut = _enrichment_nutrition(p)
        composite = nut.get("compositeScore")
        provisional = nut.get("provisionalCompositeScore")
        sufficient = nut.get("sufficientDataForScore")
        if composite is None and (sufficient is False or sufficient is None):
            null_composite_score += 1
        if composite is None and provisional is not None:
            has_provisional_only += 1

    pct = lambda n: round(100.0 * n / total, 2) if total else 0.0

    return {
        "ticket": "DB038",
        "source": str(source),
        "total_records": total,
        "missing_field_counts": missing,
        "missing_field_percent": {k: pct(v) for k, v in missing.items()},
        "standard_category_distribution": dict(
            sorted(standard_category_counts.items(), key=lambda x: -x[1])
        ),
        "health_score_gaps": {
            "insufficient_nutrients_for_score_lt3": insufficient_score_data,
            "insufficient_nutrients_percent": pct(insufficient_score_data),
            "null_composite_score": null_composite_score,
            "null_composite_percent": pct(null_composite_score),
            "provisional_only_no_composite": has_provisional_only,
            "provisional_only_percent": pct(has_provisional_only),
            "min_nutrients_rule": MIN_NUTRIENTS_FOR_SCORE,
        },
        "doc": "Documents/Database/2026 Trimester 1/DB038-Source-Data-Gaps-And-Limitations.md",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="DB038 gap evidence report")
    parser.add_argument(
        "-i",
        "--input",
        type=Path,
        default=REPO_ROOT / "database" / "seeding" / "products_5k_enriched.json",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=REPO_ROOT / "scripts" / "reports" / "db038_gap_stats.json",
    )
    args = parser.parse_args(argv or sys.argv[1:])

    products = load_products(args.input)
    report = analyse(products, args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("DB038 gap evidence")
    print(f"  Source: {report['source']}")
    print(f"  Records: {report['total_records']}")
    print("  Missing fields (% of records):")
    for field, pct in report["missing_field_percent"].items():
        print(f"    - {field}: {pct}%")
    print("  Health score gaps:")
    hg = report["health_score_gaps"]
    print(f"    - insufficient nutrients (<{hg['min_nutrients_rule']}): {hg['insufficient_nutrients_percent']}%")
    print(f"    - null compositeScore: {hg['null_composite_percent']}%")
    top_cat = list(report["standard_category_distribution"].items())[:3]
    print(f"  Top categories: {top_cat}")
    print(f"  Report: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
