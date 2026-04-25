"""
DB034 - Product Detail Contract Alignment
Validates that enriched product documents match the ProductDetail V1 contract.
Location: mapping/validate_product_contract.py
"""

import json
import os
import logging
from typing import Any, Dict, List

from mapping.map_enriched_to_product_detail import map_enriched_to_product_detail
logger = logging.getLogger(__name__)
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
    logger.addHandler(h)
    logger.setLevel(logging.INFO)

# Required fields per contract
REQUIRED_FIELDS = ["barcode", "productName"]

# Expected field types per contract
FIELD_TYPES = {
    "barcode": str,
    "productName": str,
    "brand": (str, type(None)),
    "genericName": (str, type(None)),
    "additives": list,
    "allergens": list,
    "ingredients": list,
    "ingredientsText": (str, type(None)),
    "category": (str, type(None)),
    "categories": list,
    "labels": list,
    "nutrientLevels": dict,
    "nutriments": dict,
    "nutriments_normalized": dict,
    "nutriscoreGrade": (str, type(None)),
    "productQuantity": (int, float, type(None)),
    "productQuantityUnit": (str, type(None)),
    "servingQuantity": (int, float, type(None)),
    "servingQuantityUnit": (str, type(None)),
    "traces": (str, type(None)),
    "completeness": (int, float, type(None)),
    "images": dict,
    "tags": dict,
    "metadata": dict,
    
}


def validate_product(mapped: Dict[str, Any]) -> List[str]:
    """
    Validate a mapped product against the ProductDetail V1 contract.
    Returns a list of validation errors. Empty list means valid.
    """
    errors = []

    # Check required fields
    for field in REQUIRED_FIELDS:
        if not mapped.get(field):
            errors.append(f"Missing required field: {field}")

    # Check field types
    for field, expected_type in FIELD_TYPES.items():
        if field not in mapped:
            errors.append(f"Missing field: {field}")
            continue
        value = mapped[field]
        if not isinstance(value, expected_type):
            errors.append(
                f"Field '{field}' has wrong type. "
                f"Expected {expected_type}, got {type(value).__name__}"
            )

    # Check images has root field
    images = mapped.get("images", {})
    if not isinstance(images, dict) or not images.get("root"):
        errors.append("Field 'images.root' is missing or empty")

    # Check tags has final and removed
    tags = mapped.get("tags", {})
    if not isinstance(tags, dict):
        errors.append("Field 'tags' must be an object")
    else:
        if "final" not in tags:
            errors.append("Field 'tags.final' is missing")
        if "removed" not in tags:
            errors.append("Field 'tags.removed' is missing")

    # Check nutriments_normalized has expected keys
    norm = mapped.get("nutriments_normalized", {})
    expected_norm_keys = [
        "energy_kj", "energy_kcal", "fat_g", "saturated_fat_g",
        "carbohydrates_g", "sugars_g", "proteins_g",
        "salt_g", "sodium_mg", "fiber_g"
    ]
    for key in expected_norm_keys:
        if key not in norm:
            errors.append(f"Field 'nutriments_normalized.{key}' is missing")

    return errors


def validate_dataset(input_path: str) -> Dict[str, Any]:
    """
    Load enriched products, map them to ProductDetail contract
    and validate each one.
    """
    logger.info(f"[DB034] Loading products from {input_path}")

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict):
        data = [data]

    if not isinstance(data, list):
        raise ValueError("Expected list of product records")

    total = len(data)
    valid_count = 0
    invalid_count = 0
    all_errors = []

    for record in data:
        barcode = record.get("barcode", "unknown")
        try:
            mapped = map_enriched_to_product_detail(record)
            errors = validate_product(mapped)
            if errors:
                invalid_count += 1
                all_errors.append({
                    "barcode": barcode,
                    "errors": errors
                })
            else:
                valid_count += 1
        except Exception as e:
            invalid_count += 1
            all_errors.append({
                "barcode": barcode,
                "errors": [f"Mapping failed: {str(e)}"]
            })

    logger.info(f"[DB034] Validation complete: {valid_count}/{total} valid, "
                f"{invalid_count}/{total} invalid")

    return {
        "total": total,
        "valid": valid_count,
        "invalid": invalid_count,
        "errors": all_errors
    }


# Quick test
if __name__ == "__main__":
    test_product = {
        "barcode": "1234567890123",
        "productName": "Test Product",
        "brand": "Test Brand",
        "genericName": None,
        "additives": ["e202"],
        "allergens": ["Milk"],
        "ingredients": ["sugar", "milk"],
        "ingredientsText": "Sugar, Milk",
        "categories": ["Snacks"],
        "labels": ["organic"],
        "nutrientLevels": {"fat": "low"},
        "nutriments": {"energy-kcal_100g": 250, "proteins_100g": 5},
        "nutriscoreGrade": "b",
        "productQuantity": 100,
        "productQuantityUnit": "g",
        "servingQuantity": 30,
        "servingQuantityUnit": "g",
        "traces": None,
        "completeness": 0.8,
        "images": {
            "root": "https://images.openfoodfacts.org/images/products/123",
            "primary": "front_en",
            "variants": {"front_en": 1}
        },
        "tags": {"final": ["vegan"], "removed": []},
        "metadata": {"source": "local-enriched"}
    }

    print("Testing contract validation:\n")
    mapped = map_enriched_to_product_detail(test_product)
    errors = validate_product(mapped)

    if errors:
        print(f"Validation FAILED with {len(errors)} errors:")
        for e in errors:
            print(f"  - {e}")
    else:
        print("Validation PASSED - product matches contract!")

    print("\nMapped fields:")
    for key in mapped:
        print(f"  {key}: {type(mapped[key]).__name__}")