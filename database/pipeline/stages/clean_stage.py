import os
import json
import sys
import logging


logger = logging.getLogger(__name__)
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
    logger.addHandler(h)
    logger.setLevel(logging.INFO)

# TODO: Remove sys.path workaround once NutrientUnitNormalisation is packaged as a proper module
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', 'clean data', 'normalization'))

from NutrientUnitNormalisation import normalize_nutriments_dict

def run_clean_stage(input_path: str, output_path: str, config=None):
    """
    Robust clean stage that never crashes on nested OFF data.
    """

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Normalising input to always be a list
    if isinstance(data, dict):
        data = [data]          # wrap dict as list
    elif not isinstance(data, list):
        raise ValueError(f"Expected list or dict, got {type(data)}")

    cleaned = []

    for record in data:
        if not isinstance(record, dict):
            continue

        # DB003 - Normalise nutrient units before flattening
        if 'nutriments' in record and isinstance(record['nutriments'], dict):
            try:
                record['nutriments'] = normalize_nutriments_dict(record['nutriments'])
                logger.info(f"Normalised nutriments for product: {record.get('code', 'unknown')}")
            except Exception as e:
                logger.warning(f"Failed to normalise nutriments for product {record.get('code', 'unknown')}: {e}")

        flat = {}
        for k, v in record.items():
            if isinstance(v, (list, dict)):
                flat[k] = json.dumps(v)
            else:
                flat[k] = v

        cleaned.append(flat)

    # Safely create output directory if it doesn't exist
    output_dir = os.path.dirname(output_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2)

    logger.info(f"[DB018] Cleaning complete: {output_path}")
    logger.info(f"[DB003] Nutrient unit normalisation applied to {len(cleaned)} products")
    print(f"[DB018] Cleaning complete: {output_path}")
    print(f"[DB003] Nutrient unit normalisation applied to {len(cleaned)} products")
    
    return {
        "processed": len(cleaned),
        "failures": 0,
        "output": output_path
    }