"""
Pipeline Enrichment Module for Product Search Normalization.

Populates productNameSearch and brandSearch on JSON datasets passing through the pipeline.
"""

import json
import os
import sys

# Ensure root path is accessible
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from database.clean_data.normalization.SearchNormalisation import add_search_fields_to_product


def run(input_path: str, output_path: str, config: dict = None):
    """
    Pipeline stage executor to normalize productNameSearch and brandSearch.
    Reads input JSON/JSONL, adds search normalization fields to every product record,
    and writes output JSON.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    with open(input_path, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            f.seek(0)
            data = [json.loads(line) for line in f if line.strip()]

    processed_count = 0
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                add_search_fields_to_product(item)
                processed_count += 1
    elif isinstance(data, dict):
        add_search_fields_to_product(data)
        processed_count = 1

    dry_run = bool(config.get("dry_run")) if config else False
    if not dry_run:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    return {
        "processed": processed_count,
        "failures": 0,
        "output": output_path if not dry_run else None,
        "module": "search_normalization_enrich",
    }
