import json
from pathlib import Path

from database.pipeline.modules.allergens_enrich import run
from utils.missing_value_utils import normalize_allergens


def test_missing_allergen_becomes_unknown():
    assert normalize_allergens(None) == ["Unknown"]


def test_empty_allergen_becomes_unknown():
    assert normalize_allergens([]) == ["Unknown"]


def test_known_allergen_is_preserved():
    assert normalize_allergens(["Milk"]) == ["Milk"]


def test_allergen_enrichment_preserves_safe_unknown_state(tmp_path):
    input_path = tmp_path / "input.json"
    output_path = tmp_path / "output.json"

    products = [
        {
            "barcode": "100001",
            "productName": "Unknown Product",
            "ingredientsText": None,
        },
        {
            "barcode": "100002",
            "productName": "Milk Product",
            "ingredientsText": "Contains milk",
        },
    ]

    input_path.write_text(json.dumps(products), encoding="utf-8")

    result = run(str(input_path), str(output_path), {})

    output = json.loads(output_path.read_text(encoding="utf-8"))

    assert result["processed"] == 2
    assert result["failures"] == 0

    for product in output:
        assert product["allergens"]
        assert product["allergens"] == product["allergensDetected"]

    assert output[0]["allergens"] == ["Unknown"]
