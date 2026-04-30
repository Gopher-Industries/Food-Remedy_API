#!/usr/bin/env python3
"""DB032 validation suite.

Runs validation in two layers:
1) batch data quality checks (required fields, barcodes, categories, inconsistencies)
2) integration-style checks for lookup/query flows expected by API consumers
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.validate_cleaned_dataset import validate as validate_dataset


DEFAULT_INPUT = REPO_ROOT / "database" / "seeding" / "products_5k_test.json"
DEFAULT_REPORT = REPO_ROOT / "scripts" / "reports" / "db032_validation_report.json"

RECOMMENDATION_REQUIRED_FIELDS = ("barcode", "productName")


def load_products(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        text = handle.read().strip()
    if not text:
        return []

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        products = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            item = json.loads(line)
            if isinstance(item, dict):
                products.append(item)
        return products

    if isinstance(parsed, list):
        return [item for item in parsed if isinstance(item, dict)]
    if isinstance(parsed, dict):
        return [parsed]
    return []


def category_value(product: dict[str, Any]) -> str:
    categories = product.get("categories")
    if isinstance(categories, list) and categories:
        first = categories[0]
        if isinstance(first, str) and first.strip():
            return first.strip().lower()
    category = product.get("category")
    if isinstance(category, str) and category.strip():
        return category.strip().lower()
    standard = product.get("standardCategory")
    if isinstance(standard, str) and standard.strip():
        return standard.strip().lower()
    return ""


def has_recommendation_signals(product: dict[str, Any]) -> bool:
    """Allow either enrich tags or nutrition traits as recommendation signals."""
    enrichment = product.get("enrichment")
    if isinstance(enrichment, dict) and enrichment:
        return True

    tags = product.get("tags")
    if isinstance(tags, dict):
        final_tags = tags.get("final")
        if isinstance(final_tags, list) and len(final_tags) > 0:
            return True

    nutriments = product.get("nutriments")
    return isinstance(nutriments, dict) and len(nutriments) > 0


def run_lookup_checks(products: list[dict[str, Any]], sample_size: int, rng: random.Random) -> dict[str, Any]:
    indexed = {}
    invalid = []
    for item in products:
        barcode = str(item.get("barcode") or "").strip()
        if not barcode:
            continue
        if barcode in indexed:
            # duplicates are already covered in batch checks, but mark lookup as problematic too
            invalid.append({"barcode": barcode, "message": "duplicate barcode in lookup index"})
            continue
        indexed[barcode] = item

    barcodes = list(indexed.keys())
    chosen = rng.sample(barcodes, k=min(sample_size, len(barcodes))) if barcodes else []

    for barcode in chosen:
        hit = indexed.get(barcode)
        if not hit:
            invalid.append({"barcode": barcode, "message": "barcode lookup did not return a record"})
            continue
        if str(hit.get("barcode") or "").strip() != barcode:
            invalid.append({"barcode": barcode, "message": "barcode lookup returned mismatched record"})

    return {
        "ok": len(invalid) == 0 and len(chosen) > 0,
        "sampled_barcodes": len(chosen),
        "index_size": len(indexed),
        "issues": invalid[:100],
    }


def run_category_query_checks(products: list[dict[str, Any]], top_n_categories: int = 10) -> dict[str, Any]:
    by_category: dict[str, list[dict[str, Any]]] = {}
    counts = Counter()

    for item in products:
        key = category_value(item)
        if not key:
            continue
        counts[key] += 1
        by_category.setdefault(key, []).append(item)

    issues = []
    most_common = [name for name, _ in counts.most_common(top_n_categories)]
    for category in most_common:
        matches = by_category.get(category, [])
        if not matches:
            issues.append({"category": category, "message": "category query returned no products"})
            continue
        for row in matches[:3]:
            if not str(row.get("barcode") or "").strip():
                issues.append({"category": category, "message": "category query row missing barcode"})
            if not str(row.get("productName") or "").strip():
                issues.append({"category": category, "message": "category query row missing productName"})

    return {
        "ok": len(issues) == 0 and len(most_common) > 0,
        "categories_checked": len(most_common),
        "top_categories": most_common,
        "issues": issues[:100],
    }


def run_recommendation_candidate_checks(products: list[dict[str, Any]], sample_size: int, rng: random.Random) -> dict[str, Any]:
    by_category: dict[str, list[dict[str, Any]]] = {}
    for product in products:
        key = category_value(product)
        if key:
            by_category.setdefault(key, []).append(product)

    issues = []
    eligible_products = [p for p in products if category_value(p)]
    selected = rng.sample(eligible_products, k=min(sample_size, len(eligible_products))) if eligible_products else []

    for source in selected:
        source_barcode = str(source.get("barcode") or "").strip()
        key = category_value(source)
        peers = [p for p in by_category.get(key, []) if str(p.get("barcode") or "").strip() != source_barcode]
        if not peers:
            issues.append(
                {
                    "barcode": source_barcode,
                    "category": key,
                    "message": "no recommendation candidates available in same category",
                }
            )
            continue

        candidate = peers[0]
        for field in RECOMMENDATION_REQUIRED_FIELDS:
            if not str(candidate.get(field) or "").strip():
                issues.append(
                    {
                        "barcode": source_barcode,
                        "category": key,
                        "message": f"candidate missing required field: {field}",
                    }
                )
        if not has_recommendation_signals(candidate):
            issues.append(
                {
                    "barcode": source_barcode,
                    "category": key,
                    "message": "candidate missing enrichment/tags/nutriments signal data",
                }
            )

    return {
        "ok": len(issues) == 0 and len(selected) > 0,
        "products_checked": len(selected),
        "issues": issues[:100],
    }


def run_validation_suite(products: list[dict[str, Any]], source: Path, sample_size: int, seed: int) -> dict[str, Any]:
    rng = random.Random(seed)
    batch_result = validate_dataset(products, source)
    integration_result = {
        "barcode_lookup": run_lookup_checks(products, sample_size=sample_size, rng=rng),
        "category_queries": run_category_query_checks(products),
        "recommendation_candidates": run_recommendation_candidate_checks(products, sample_size=sample_size, rng=rng),
    }

    return {
        "ticket": "DB032",
        "source": str(source),
        "total_records": len(products),
        "seed": seed,
        "sample_size": sample_size,
        "ok": batch_result["ok"] and all(check["ok"] for check in integration_result.values()),
        "checks": {
            "batch_validation": batch_result,
            "integration_validation": integration_result,
        },
    }


def write_report(report: dict[str, Any], report_path: Path) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with report_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False)


def print_summary(report: dict[str, Any], report_path: Path) -> None:
    print(f"DB032 validation: {'PASS' if report['ok'] else 'FAIL'}")
    print(f"Records checked: {report['total_records']}")

    batch = report["checks"]["batch_validation"]
    print(f"- batch_validation: {'ok' if batch['ok'] else 'issues'}")
    for name, result in batch["checks"].items():
        state = "ok" if result["ok"] and result["issue_count"] == 0 else "warnings" if result["ok"] else "issues"
        print(f"  - {name}: {state} ({result['issue_count']} issues)")

    integration = report["checks"]["integration_validation"]
    for name, result in integration.items():
        issue_count = len(result.get("issues", []))
        print(f"- {name}: {'ok' if result['ok'] else 'issues'} ({issue_count} issues)")

    print(f"Report written to: {report_path}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run DB032 validation suite")
    parser.add_argument("--input", "-i", type=Path, default=DEFAULT_INPUT, help="Path to dataset (JSON array/object or JSONL)")
    parser.add_argument("--report", "-r", type=Path, default=DEFAULT_REPORT, help="Output report path")
    parser.add_argument("--sample-size", type=int, default=200, help="Sample size for integration-style checks")
    parser.add_argument("--seed", type=int, default=32, help="Random seed for deterministic sampling")
    parser.add_argument("--allow-issues", action="store_true", help="Exit 0 even if validation fails")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    products = load_products(args.input)
    report = run_validation_suite(products, source=args.input, sample_size=max(1, args.sample_size), seed=args.seed)
    write_report(report, args.report)
    print_summary(report, args.report)
    return 0 if report["ok"] or args.allow_issues else 1


if __name__ == "__main__":
    raise SystemExit(main())
