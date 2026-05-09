"""DB034 tests for ProductDetail contract validation."""

import json

from mapping.map_enriched_to_product_detail import map_enriched_to_product_detail
from mapping.validate_product_contract import validate_dataset, validate_product


def _sample_enriched() -> dict:
    return {
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
            "variants": {"front_en": 1},
        },
        "tags": {"final": ["vegan"], "removed": []},
        "metadata": {"source": "local-enriched"},
    }


def test_validate_product_passes_for_valid_mapped_record():
    mapped = map_enriched_to_product_detail(_sample_enriched())
    errors = validate_product(mapped)
    assert errors == []


def test_validate_product_reports_missing_images_root():
    mapped = map_enriched_to_product_detail(_sample_enriched())
    mapped["images"]["root"] = ""
    errors = validate_product(mapped)
    assert any("images.root" in err for err in errors)


def test_validate_dataset_counts_valid_and_invalid(tmp_path):
    valid = _sample_enriched()
    invalid = _sample_enriched()
    invalid["barcode"] = ""
    payload = [valid, invalid]

    input_file = tmp_path / "products.json"
    input_file.write_text(json.dumps(payload), encoding="utf-8")

    result = validate_dataset(str(input_file))
    assert result["total"] == 2
    assert result["valid"] == 1
    assert result["invalid"] == 1
    assert len(result["errors"]) == 1

