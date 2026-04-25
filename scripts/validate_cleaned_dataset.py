#!/usr/bin/env python3
"""Validate cleaned product data before deeper integration.

The checks mirror the DB QA checklist:
- missing product fields
- category validity
- data inconsistencies
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = REPO_ROOT / "database" / "clean_data" / "cleanSample.json"
DEFAULT_REPORT = REPO_ROOT / "scripts" / "reports" / "cleaned_dataset_validation_report.json"

REQUIRED_FIELDS = ("barcode", "productName")
RECOMMENDED_FIELDS = (
    "brand",
    "categories",
    "standardCategory",
    "nutriments",
    "images",
)
ALLOWED_STANDARD_CATEGORIES = {
    "meal kits",
    "breads",
    "noodles and pasta",
    "seafood",
    "oils",
    "spreads",
    "beverages",
    "snacks and confectionery",
    "other",
}
ALLOWED_NUTRISCORE_GRADES = {"a", "b", "c", "d", "e", "unknown"}
ALLOWED_QUANTITY_UNITS = {"g", "kg", "ml", "l"}
LANG_PREFIX_RE = re.compile(r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,6})?:")


def is_missing(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def load_products(path: Path) -> list[dict[str, Any]]:
    """Load a cleaned dataset stored as a JSON array or JSONL."""
    with path.open("r", encoding="utf-8") as handle:
        text = handle.read().strip()

    if not text:
        return []

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        products = []
        for line_number, line in enumerate(text.splitlines(), start=1):
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSONL at line {line_number}: {exc}") from exc
            if not isinstance(item, dict):
                raise ValueError(f"JSONL line {line_number} is not an object")
            products.append(item)
        return products

    if isinstance(data, list):
        invalid_items = [idx for idx, item in enumerate(data) if not isinstance(item, dict)]
        if invalid_items:
            raise ValueError(f"JSON array contains non-object items at indexes {invalid_items[:5]}")
        return data

    if isinstance(data, dict):
        return [data]

    raise ValueError("Dataset must be a JSON object, JSON array, or JSONL objects")


def issue(index: int, barcode: Any, field: str, message: str) -> dict[str, Any]:
    return {
        "index": index,
        "barcode": barcode,
        "field": field,
        "message": message,
    }


def check_missing_fields(products: list[dict[str, Any]]) -> dict[str, Any]:
    issues = []
    counts = Counter()

    for idx, product in enumerate(products):
        barcode = product.get("barcode")
        for field in REQUIRED_FIELDS:
            if is_missing(product.get(field)):
                counts[field] += 1
                issues.append(issue(idx, barcode, field, "required field is missing or empty"))

        for field in RECOMMENDED_FIELDS:
            if is_missing(product.get(field)):
                counts[field] += 1
                issues.append(issue(idx, barcode, field, "recommended integration field is missing or empty"))

    return {
        "ok": not any(item["field"] in REQUIRED_FIELDS for item in issues),
        "issue_count": len(issues),
        "field_counts": dict(counts),
        "issues": issues[:100],
    }


def check_categories(products: list[dict[str, Any]]) -> dict[str, Any]:
    issues = []
    category_counts = Counter()
    unknown_categories = Counter()

    for idx, product in enumerate(products):
        barcode = product.get("barcode")
        standard = product.get("standardCategory", product.get("category"))
        categories = product.get("categories")

        if isinstance(standard, str) and standard.strip():
            normalized_standard = standard.strip().lower()
            category_counts[normalized_standard] += 1
            if normalized_standard not in ALLOWED_STANDARD_CATEGORIES:
                unknown_categories[normalized_standard] += 1
                issues.append(issue(idx, barcode, "standardCategory", f"unknown standard category: {standard}"))
        else:
            issues.append(issue(idx, barcode, "standardCategory", "standard category is missing or empty"))

        if not isinstance(categories, list):
            issues.append(issue(idx, barcode, "categories", "categories must be a list"))
            continue

        if not categories:
            issues.append(issue(idx, barcode, "categories", "categories list is empty"))

        for cat in categories:
            if not isinstance(cat, str) or not cat.strip():
                issues.append(issue(idx, barcode, "categories", "category values must be non-empty strings"))
                continue
            if LANG_PREFIX_RE.match(cat.strip()):
                issues.append(issue(idx, barcode, "categories", f"category still has language prefix: {cat}"))

    return {
        "ok": len(issues) == 0,
        "issue_count": len(issues),
        "standard_category_counts": dict(category_counts),
        "unknown_standard_categories": dict(unknown_categories),
        "issues": issues[:100],
    }


def check_inconsistencies(products: list[dict[str, Any]]) -> dict[str, Any]:
    issues = []
    barcodes = Counter(str(p.get("barcode", "")).strip() for p in products if not is_missing(p.get("barcode")))
    duplicated_barcodes = {barcode: count for barcode, count in barcodes.items() if count > 1}

    for idx, product in enumerate(products):
        barcode = product.get("barcode")
        barcode_str = str(barcode).strip() if barcode is not None else ""

        if barcode_str and not barcode_str.isdigit():
            issues.append(issue(idx, barcode, "barcode", "barcode should contain digits only"))

        grade = product.get("nutriscoreGrade")
        if not is_missing(grade) and str(grade).lower() not in ALLOWED_NUTRISCORE_GRADES:
            issues.append(issue(idx, barcode, "nutriscoreGrade", f"invalid nutriscore grade: {grade}"))

        completeness = product.get("completeness")
        if completeness is not None:
            if not isinstance(completeness, (int, float)):
                issues.append(issue(idx, barcode, "completeness", "completeness must be numeric"))
            elif not 0 <= completeness <= 1:
                issues.append(issue(idx, barcode, "completeness", "completeness must be between 0 and 1"))

        for field in ("productQuantity", "servingQuantity"):
            value = product.get(field)
            if value is None:
                continue
            if not isinstance(value, (int, float)):
                issues.append(issue(idx, barcode, field, f"{field} must be numeric"))
            elif value < 0:
                issues.append(issue(idx, barcode, field, f"{field} cannot be negative"))

        for field in ("productQuantityUnit", "servingQuantityUnit"):
            value = product.get(field)
            if not is_missing(value) and str(value).lower() not in ALLOWED_QUANTITY_UNITS:
                issues.append(issue(idx, barcode, field, f"invalid quantity unit: {value}"))

        nutriments = product.get("nutriments")
        if nutriments is not None and not isinstance(nutriments, dict):
            issues.append(issue(idx, barcode, "nutriments", "nutriments must be an object"))
        elif isinstance(nutriments, dict):
            for name, value in nutriments.items():
                if name.endswith(("_100g", "_serving")) and isinstance(value, (int, float)) and value < 0:
                    issues.append(issue(idx, barcode, f"nutriments.{name}", "nutriment value cannot be negative"))

        images = product.get("images")
        if images is not None:
            if not isinstance(images, dict):
                issues.append(issue(idx, barcode, "images", "images must be an object"))
            elif "root" not in images or is_missing(images.get("root")):
                issues.append(issue(idx, barcode, "images.root", "image root is missing"))

    for barcode, count in duplicated_barcodes.items():
        issues.append(issue(-1, barcode, "barcode", f"duplicate barcode appears {count} times"))

    grouped = defaultdict(int)
    for item in issues:
        grouped[item["field"]] += 1

    return {
        "ok": len(issues) == 0,
        "issue_count": len(issues),
        "field_counts": dict(grouped),
        "duplicate_barcodes": duplicated_barcodes,
        "issues": issues[:100],
    }


def validate(products: list[dict[str, Any]], source_path: Path) -> dict[str, Any]:
    checks = {
        "missing_product_fields": check_missing_fields(products),
        "category_validation": check_categories(products),
        "inconsistency_detection": check_inconsistencies(products),
    }
    return {
        "source": str(source_path),
        "total_records": len(products),
        "ok": all(check["ok"] for check in checks.values()),
        "checks": checks,
    }


def write_report(report: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False)


def print_summary(report: dict[str, Any], report_path: Path) -> None:
    status = "PASS" if report["ok"] else "FAIL"
    print(f"Cleaned dataset validation: {status}")
    print(f"Records checked: {report['total_records']}")

    for name, result in report["checks"].items():
        check_status = "ok" if result["ok"] and result["issue_count"] == 0 else "warnings" if result["ok"] else "issues"
        print(f"- {name}: {check_status} ({result['issue_count']} issues)")

    print(f"Report written to: {report_path}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate cleaned product dataset before integration")
    parser.add_argument("--input", "-i", type=Path, default=DEFAULT_INPUT, help="Cleaned product JSON/JSONL path")
    parser.add_argument("--report", "-r", type=Path, default=DEFAULT_REPORT, help="Output validation report path")
    parser.add_argument("--allow-issues", action="store_true", help="Exit 0 even when validation issues are found")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    products = load_products(args.input)
    report = validate(products, args.input)
    write_report(report, args.report)
    print_summary(report, args.report)
    return 0 if report["ok"] or args.allow_issues else 1


if __name__ == "__main__":
    raise SystemExit(main())
