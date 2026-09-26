"""DB023 regression coverage for unknown allergen handling."""

import json

from database.pipeline.modules.allergens_enrich import run
from database.pipeline.modules.db009_personalisation_tags import (
    get_diet_tags,
    get_risk_tags,
)


def test_allergen_enrichment_handles_known_missing_empty_and_detected_cases(tmp_path):
    products = [
        {
            "barcode": "1",
            "productName": "Known source",
            "allergens": ["Milk"],
        },
        {"barcode": "2", "productName": "Missing source"},
        {"barcode": "3", "productName": "Empty source", "allergens": []},
        {
            "barcode": "4",
            "productName": "Detected source",
            "ingredientsText": "Sugar, egg powder",
        },
    ]
    input_path = tmp_path / "input.json"
    output_path = tmp_path / "output.json"
    input_path.write_text(json.dumps(products), encoding="utf-8")

    result = run(str(input_path), str(output_path), {})
    enriched = json.loads(output_path.read_text(encoding="utf-8"))

    assert result["processed"] == 4
    assert result["failures"] == 0
    assert enriched[0]["allergens"] == ["Milk"]
    assert enriched[1]["allergens"] == ["Unknown"]
    assert enriched[2]["allergens"] == ["Unknown"]
    assert enriched[3]["allergens"] == ["Egg"]
    assert all(item["allergensDetected"] == item["allergens"] for item in enriched)


def test_unknown_sentinel_is_not_treated_as_a_known_allergen_or_safe_diet_evidence():
    product = {"allergens": ["Unknown"], "allergensDetected": ["Unknown"]}

    assert "contains_allergens" not in get_risk_tags(product)
    assert get_diet_tags(product) == []


def test_known_allergen_still_drives_existing_personalisation_tags():
    product = {"allergens": ["Milk"], "allergensDetected": ["Milk"]}

    assert "contains_allergens" in get_risk_tags(product)
    assert "vegan" not in get_diet_tags(product)
