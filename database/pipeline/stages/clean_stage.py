import os
import json
import sys

# Add the database/clean data path so we can import the normalisation module
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', 'clean data', 'normalization'))

from NutrientUnitNormalisation import normalize_nutriments_dict

def run_clean_stage(input_path: str, output_path: str, config: dict = None):
    """
    Robust clean stage that never crashes on nested OFF data.
    """

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError("Expected list of records")

    cleaned = []

    for record in data:
        if not isinstance(record, dict):
            continue

        # DB003 - Normalise nutrient units before flattening
        if 'nutriments' in record and isinstance(record['nutriments'], dict):
            record['nutriments'] = normalize_nutriments_dict(record['nutriments'])

        flat = {}
        for k, v in record.items():
            if isinstance(v, (list, dict)):
                flat[k] = json.dumps(v)
            else:
                flat[k] = v

        cleaned.append(flat)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2)

    print(f"[DB018] Cleaning complete: {output_path}")
    print(f"[DB003] Nutrient unit normalisation applied to {len(cleaned)} products")