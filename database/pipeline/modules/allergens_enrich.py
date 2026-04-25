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
    try:
        with open(input_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error reading input file: {e}")
        raise

    failures = 0

 # Enrich every product
    for product in data:
        try:
            # Map camelCase fields from enriched data
            detection_input = {
                "ingredients_text": product.get("ingredientsText") or product.get("ingredients_text", ""),
                "traces": product.get("traces", ""),
                "traces_from_ingredients": product.get("tracesFromIngredients") or product.get("traces_from_ingredients", ""),
                "product_name": product.get("productName") or product.get("product_name", ""),
                "generic_name": product.get("genericName") or product.get("generic_name", ""),
                "ingredients_tags": product.get("ingredients") or product.get("ingredients_tags"),
                "allergens_tags": product.get("allergens"),
                "categories_tags": product.get("categories"),
                "labels_tags": product.get("labels"),
            }

            allergens = detect_allergens(
                product=detection_input,
                keyword_entries=allergen_config
            )

            # Debug print with more useful info
            barcode = product.get("barcode", "N/A")
            product_name = product.get("productName") or product.get("product_name", "N/A")
            # print(f"Detected allergens for {barcode} ({product_name}): {allergens}") # testing line; can be uncommented for debugging

        except Exception as e:
            allergens = []
            failures += 1
            barcode = product.get("barcode", "N/A")
            print(f"Warning: Failed to detect allergens for product {barcode}: {e}")

        product["allergens"] = allergens
        product["allergensDetected"] = allergens

    # Write output
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return {
        "processed": len(data),
        "failures": failures,
        "output": output_path
    }
