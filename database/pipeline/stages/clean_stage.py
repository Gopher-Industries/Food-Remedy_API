import os
import json
import sys
import logging

logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

# TODO: Remove sys.path workaround once NutrientUnitNormalisation is packaged as a proper module.
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "..", "clean_data", "normalization"))

from NutrientUnitNormalisation import normalize_nutriments_dict


def run_clean_stage(input_path: str, output_path: str, config=None):
    """
    Clean and normalise product data before later pipeline stages.

    The function loads product records from a JSON file, converts nested
    list and dictionary values into JSON strings, applies nutrient unit
    normalisation, and writes the cleaned records to the output file.

    Args:
        input_path: Path to the input JSON file containing product data.
        output_path: Path where the cleaned JSON data will be written.
        config: Optional configuration value reserved for pipeline compatibility.

    Returns:
        A dictionary containing the stage status, number of processed records,
        failure count, and output file path.
    """

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict):
        data = [data]
    elif not isinstance(data, list):
        raise ValueError(f"Expected list or dict, got {type(data)}")

    cleaned = []

    for record in data:
        if not isinstance(record, dict):
            continue

        flat = {}

        for key, value in record.items():
            if isinstance(value, (list, dict)):
                flat[key] = json.dumps(value)
            else:
                flat[key] = value

        nutriments = record.get("nutriments")
        if isinstance(nutriments, dict):
            normalised_nutrients = normalize_nutriments_dict(nutriments)
            for key, value in normalised_nutrients.items():
                flat[f"norm_{key}"] = value

        cleaned.append(flat)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2)

    logger.info("[DB018] Cleaning complete: %s", output_path)
    logger.info("[DB003] Nutrient unit normalisation applied to %s products", len(cleaned))

    return {
        "status": "completed",
        "processed": len(cleaned),
        "failures": 0,
        "output": output_path,
    }