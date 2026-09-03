"""
Idempotent Backfill Migration Tool & Coverage Reporter for Food Remedy Search Fields.

Populates productNameSearch and brandSearch across product catalog seed files and collections.
Provides coverage statistics for products with searchable names, brands, and barcodes.
"""

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Tuple

# Ensure root path is accessible
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from database.clean_data.normalization.SearchNormalisation import (
    add_search_fields_to_product,
    normalize_search_text,
)


def compute_coverage_stats(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate data-coverage metrics across product records.
    """
    total = len(records)
    has_barcode = 0
    has_name = 0
    has_name_search = 0
    has_brand = 0
    has_brand_search = 0
    has_both_search = 0

    for r in records:
        if not isinstance(r, dict):
            continue

        barcode = str(r.get("barcode") or r.get("code") or "").strip()
        if barcode:
            has_barcode += 1

        name = r.get("productName") or r.get("product_name")
        if name and str(name).strip():
            has_name += 1

        name_search = r.get("productNameSearch")
        if name_search and str(name_search).strip():
            has_name_search += 1

        brand = r.get("brand") or r.get("brands")
        if brand and str(brand).strip():
            has_brand += 1

        brand_search = r.get("brandSearch")
        if brand_search and str(brand_search).strip():
            has_brand_search += 1

        if name_search and brand_search:
            has_both_search += 1

    return {
        "total_products": total,
        "has_barcode": has_barcode,
        "has_product_name": has_name,
        "has_product_name_search": has_name_search,
        "product_name_search_coverage_pct": round((has_name_search / total * 100), 2) if total else 0.0,
        "has_brand": has_brand,
        "has_brand_search": has_brand_search,
        "brand_search_coverage_pct": round((has_brand_search / total * 100), 2) if total else 0.0,
        "has_both_search": has_both_search,
        "both_search_coverage_pct": round((has_both_search / total * 100), 2) if total else 0.0,
        "missing_name_gaps": total - has_name_search,
        "missing_brand_gaps": total - has_brand_search,
    }


def backfill_records(records: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    """
    Idempotently backfill search fields for a list of product records.

    Returns:
        (updated_records, records_modified_count)
    """
    modified_count = 0
    updated_records = []

    for r in records:
        if not isinstance(r, dict):
            updated_records.append(r)
            continue

        r_copy = dict(r)
        orig_name_search = r_copy.get("productNameSearch")
        orig_brand_search = r_copy.get("brandSearch")

        # Derive expected search values
        name_val = r_copy.get("productName") or r_copy.get("product_name") or ""
        brand_val = r_copy.get("brand") or r_copy.get("brands") or ""

        expected_name_search = normalize_search_text(name_val)
        expected_brand_search = normalize_search_text(brand_val)

        # Check if modification is required
        if orig_name_search != expected_name_search or orig_brand_search != expected_brand_search:
            r_copy["productNameSearch"] = expected_name_search
            r_copy["brandSearch"] = expected_brand_search
            modified_count += 1
        else:
            # Ensure keys exist even if empty
            r_copy["productNameSearch"] = expected_name_search
            r_copy["brandSearch"] = expected_brand_search

        updated_records.append(r_copy)

    return updated_records, modified_count


def process_file(file_path: str, inplace: bool = False, output_path: str = None) -> Dict[str, Any]:
    """
    Process a single JSON catalog file for backfilling and report generation.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    is_list = isinstance(data, list)
    records = data if is_list else [data]

    before_stats = compute_coverage_stats(records)
    updated_records, modified_count = backfill_records(records)
    after_stats = compute_coverage_stats(updated_records)

    target_path = file_path if inplace else output_path

    if target_path:
        os.makedirs(os.path.dirname(target_path) or ".", exist_ok=True)
        out_data = updated_records if is_list else updated_records[0]
        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(out_data, f, indent=2, ensure_ascii=False)

    return {
        "file": file_path,
        "saved_to": target_path,
        "records_modified": modified_count,
        "before_stats": before_stats,
        "after_stats": after_stats,
    }


def generate_markdown_report(result: Dict[str, Any]) -> str:
    """
    Format backfill result into a clean markdown coverage report.
    """
    stats = result["after_stats"]
    report = f"""# Catalogue Search Fields Backfill & Coverage Report

**File Processed:** `{result['file']}`  
**Records Modified:** {result['records_modified']}  
**Destination:** `{result['saved_to'] or 'Dry Run (None)'}`  

## Data Coverage Summary

| Metric | Count | Coverage % |
| :--- | :--- | :--- |
| **Total Products** | {stats['total_products']} | 100.0% |
| **Has Barcode** | {stats['has_barcode']} | {round(stats['has_barcode']/stats['total_products']*100, 2) if stats['total_products'] else 0}% |
| **Has Product Name** | {stats['has_product_name']} | {round(stats['has_product_name']/stats['total_products']*100, 2) if stats['total_products'] else 0}% |
| **Has productNameSearch** | {stats['has_product_name_search']} | {stats['product_name_search_coverage_pct']}% |
| **Has Brand** | {stats['has_brand']} | {round(stats['has_brand']/stats['total_products']*100, 2) if stats['total_products'] else 0}% |
| **Has brandSearch** | {stats['has_brand_search']} | {stats['brand_search_coverage_pct']}% |
| **Has Both Search Fields** | {stats['has_both_search']} | {stats['both_search_coverage_pct']}% |

## Coverage Gaps

- **Missing productNameSearch Gaps:** {stats['missing_name_gaps']}
- **Missing brandSearch Gaps:** {stats['missing_brand_gaps']}
"""
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill productNameSearch and brandSearch fields.")
    parser.add_argument("input_file", help="Path to catalog JSON file")
    parser.add_argument("--inplace", action="store_true", help="Overwrite input file with backfilled content")
    parser.add_argument("--output", help="Path to write backfilled JSON file")
    parser.add_argument("--report", help="Path to write markdown coverage report")

    args = parser.parse_args()

    res = process_file(args.input_file, inplace=args.inplace, output_path=args.output)
    md_report = generate_markdown_report(res)
    print(md_report)

    if args.report:
        with open(args.report, "w", encoding="utf-8") as rf:
            rf.write(md_report)
        print(f"Report written to: {args.report}")
