import os
import json
import sys
import logging

# -----------------------------
# LOGGING SETUP
# -----------------------------
logger = logging.getLogger(__name__)
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
    logger.addHandler(h)
    logger.setLevel(logging.INFO)

# -----------------------------
# DB003 IMPORT
# -----------------------------
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', 'clean data', 'normalization'))
from NutrientUnitNormalisation import normalize_nutriments_dict

# -----------------------------
# DB007 IMPORT
# -----------------------------
from database.pipeline.modules.missing_field_handler import (
    handle_missing_fields,
    log_missing_fields
)


def run_clean_stage(input_path: str, output_path: str, config: dict = None):

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict):
        data = [data]

    if not isinstance(data, list):
        raise ValueError("Expected list of records or a single record dict")

    cleaned = []
    failures = []

    for record in data:
        if not isinstance(record, dict):
            failures.append(record)
            continue

        # DB003: Nutrient Normalisation
        if 'nutriments' in record and isinstance(record['nutriments'], dict):
            try:
                record['nutriments'] = normalize_nutriments_dict(record['nutriments'])
                logger.info(f"Normalised nutriments for product: {record.get('code', 'unknown')}")
            except Exception as e:
                logger.warning(f"Failed to normalise nutriments for product {record.get('code', 'unknown')}: {e}")

        # Flatten
        flat = {}
        for k, v in record.items():
            if isinstance(v, (list, dict)):
                flat[k] = json.dumps(v)
            else:
                flat[k] = v

        # DB007: Missing field handling
        flat = handle_missing_fields(flat)
        log_missing_fields(flat)

        cleaned.append(flat)

    # Save safely
    output_dir = os.path.dirname(output_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2)

    logger.info(f"[DB018] Cleaning complete: {output_path}")
    logger.info(f"[DB003] Nutrient unit normalisation applied to {len(cleaned)} products")

    return {
        "processed": len(cleaned),
        "failures": len(failures),
        "output_path": output_path
    }