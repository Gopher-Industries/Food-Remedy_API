import json
from typing import Any
from utils.detect_allergens import detect_allergens  # detection function built
from database.Allergens.load_allergens import load_allergens  # official config loader

def run(input_path: str, output_path: str, config: dict) -> dict:
    """
    Pipeline module entry point (required by enrich_stage.py).
    Reads input JSON, sets ``allergens`` (DB021 / API contract) and
    ``allergensDetected`` (same values; kept for older consumers), then writes output.
    """
    allergen_config = load_allergens()

    # Read input
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Enrich every product
    for product in data:
        allergens = detect_allergens(product=product, keyword_entries=allergen_config)
        product["allergens"] = allergens
        product["allergensDetected"] = allergens

    # Write output
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return {
        "processed": len(data),
        "failures": 0,
        "output": output_path
    }
