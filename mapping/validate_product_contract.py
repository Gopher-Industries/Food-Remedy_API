"""DB034 - Product Detail Contract Alignment.

Validates that enriched product documents, once mapped, match ProductDetail V1.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from mapping.map_enriched_to_product_detail import map_enriched_to_product_detail

logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Required fields per contract
REQUIRED_FIELDS = ("barcode", "productName")

# Expected field types per contract
FIELD_TYPES: dict[str, Any] = {
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

EXPECTED_NORM_KEYS = (
    "energy_kj",
    "energy_kcal",
    "fat_g",
    "saturated_fat_g",
    "carbohydrates_g",
    "sugars_g",
    "proteins_g",
    "salt_g",
    "sodium_mg",
    "fiber_g",
)


def validate_product(mapped: dict[str, Any]) -> list[str]:
    """Validate mapped product against ProductDetail V1 contract."""
    errors: list[str] = []

    # Check required fields (non-empty)
    for field in REQUIRED_FIELDS:
        if not mapped.get(field):
            errors.append(f"Missing required field: {field}")

    # Check field presence and types
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

    # Check images.root
    images = mapped.get("images", {})
    if not isinstance(images, dict) or not images.get("root"):
        errors.append("Field 'images.root' is missing or empty")

    # Check tags.final and tags.removed
    tags = mapped.get("tags", {})
    if not isinstance(tags, dict):
        errors.append("Field 'tags' must be an object")
    else:
        if "final" not in tags:
            errors.append("Field 'tags.final' is missing")
        if "removed" not in tags:
            errors.append("Field 'tags.removed' is missing")

    # Check normalised nutriments keys
    norm = mapped.get("nutriments_normalized", {})
    if not isinstance(norm, dict):
        errors.append("Field 'nutriments_normalized' must be an object")
    else:
        for key in EXPECTED_NORM_KEYS:
            if key not in norm:
                errors.append(f"Field 'nutriments_normalized.{key}' is missing")

    return errors


def validate_dataset(input_path: str | Path) -> dict[str, Any]:
    """Load enriched products, map to ProductDetail contract, and validate each one."""
    input_file = Path(input_path)
    logger.info("[DB034] Loading products from %s", input_file)

    with input_file.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        raise ValueError("Expected list of product records")

    total = len(data)
    valid_count = 0
    invalid_count = 0
    all_errors: list[dict[str, Any]] = []

    for record in data:
        barcode = record.get("barcode", "unknown") if isinstance(record, dict) else "unknown"
        try:
            mapped = map_enriched_to_product_detail(record)
            errors = validate_product(mapped)
            if errors:
                invalid_count += 1
                all_errors.append({"barcode": barcode, "errors": errors})
            else:
                valid_count += 1
        except Exception as exc:
            invalid_count += 1
            all_errors.append({"barcode": barcode, "errors": [f"Mapping failed: {exc}"]})

    logger.info(
        "[DB034] Validation complete: %s/%s valid, %s/%s invalid",
        valid_count,
        total,
        invalid_count,
        total,
    )
    return {"total": total, "valid": valid_count, "invalid": invalid_count, "errors": all_errors}

