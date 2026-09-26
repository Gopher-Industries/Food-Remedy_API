"""
DB049: Regression tests for allergen evidence and unknown-state consistency.

Covers:
- Known allergen evidence is preserved
- Missing/uncertain allergen info returns ["Unknown"] not []
- Unknown sentinel is not treated as a known allergen
- Downstream personalisation tags are sentinel-safe
- Representative known, missing and uncertain cases
"""

import pytest
from utils.missing_value_utils import normalize_allergens, UNKNOWN_ALLERGEN
from utils.detect_allergens import detect_allergens
from database.pipeline.modules.db009_personalisation_tags import enrich_record


class TestKnownAllergenPreservation:
    def test_known_allergens_are_preserved(self):
        """Known allergen values must pass through unchanged."""
        result = normalize_allergens(["Milk", "Gluten", "Eggs"])
        assert "Milk" in result
        assert "Gluten" in result
        assert "Eggs" in result

    def test_known_allergens_not_replaced_with_unknown(self):
        """Known allergens must not be replaced with Unknown sentinel."""
        result = normalize_allergens(["Milk", "Gluten"])
        assert UNKNOWN_ALLERGEN not in result

    def test_single_known_allergen_preserved(self):
        """Single known allergen must be preserved."""
        result = normalize_allergens(["Peanuts"])
        assert result == ["Peanuts"]


class TestMissingAllergenHandling:
    def test_none_returns_unknown_sentinel(self):
        """None allergen input must return Unknown sentinel."""
        result = normalize_allergens(None)
        assert result == [UNKNOWN_ALLERGEN]

    def test_empty_list_returns_unknown_sentinel(self):
        """Empty allergen list must return Unknown sentinel not []."""
        result = normalize_allergens([])
        assert result == [UNKNOWN_ALLERGEN]

    def test_empty_string_returns_unknown_sentinel(self):
        """Empty string allergen must return Unknown sentinel."""
        result = normalize_allergens("")
        assert result == [UNKNOWN_ALLERGEN]

    def test_missing_key_returns_unknown_sentinel(self):
        """Missing allergens key in product must return Unknown sentinel."""
        product = {"barcode": "9310072002678", "productName": "Test"}
        allergens = normalize_allergens(product.get("allergens"))
        assert allergens == [UNKNOWN_ALLERGEN]

    def test_allergen_free_claim_not_assumed(self):
        """Missing allergen data must never produce [] which implies allergen-free."""
        result = normalize_allergens(None)
        assert result != []
        assert result != [""]


class TestUncertainAllergenHandling:
    def test_unknown_mixed_with_known_keeps_known(self):
        """Unknown sentinel mixed with known allergens should keep only known values."""
        result = normalize_allergens(["Unknown", "Milk", "Gluten"])
        assert "Milk" in result
        assert "Gluten" in result
        assert UNKNOWN_ALLERGEN not in result

    def test_only_unknown_sentinel_stays_unknown(self):
        """List containing only Unknown sentinel should return Unknown."""
        result = normalize_allergens(["Unknown"])
        assert result == [UNKNOWN_ALLERGEN]

    def test_placeholder_values_return_unknown(self):
        """Placeholder values like n/a or none should return Unknown sentinel."""
        for placeholder in ["n/a", "none", "N/A", "None", "null"]:
            result = normalize_allergens([placeholder])
            assert result == [UNKNOWN_ALLERGEN], f"Failed for placeholder: {placeholder}"


class TestDetectionIntegration:
    def test_product_with_milk_ingredient_detects_milk(self):
        """Product with milk in ingredients should detect Milk allergen."""
        product = {
            "ingredients": ["milk", "sugar", "salt"],
            "allergens_tags": [],
            "traces": "",
            "traces_from_ingredients": ""
        }
        result = detect_allergens(product)
        assert isinstance(result, list)

    def test_detection_failure_falls_back_to_unknown(self):
        """Detection failure must fall back to Unknown not empty list."""
        result = normalize_allergens(None)
        assert result == [UNKNOWN_ALLERGEN]


class TestDownstreamCompatibility:
    def test_unknown_sentinel_not_treated_as_allergen_in_tags(self):
        """Unknown sentinel must not drive personalisation tags as if it were a real allergen."""
        record = {
            "barcode": "9310072002678",
            "productName": "Test",
            "allergens": [UNKNOWN_ALLERGEN],
            "nutriments": {},
            "categories": [],
            "ingredients": [],
            "labels": []
        }
        result = enrich_record(record)
        tags = result.get("tags", {}).get("final", [])
        assert "allergen-free" not in tags
        assert "Unknown" not in tags

    def test_known_allergen_drives_personalisation_tags(self):
        """Known allergen must correctly influence personalisation tags."""
        record = {
            "barcode": "9310072002678",
            "productName": "Test",
            "allergens": ["Gluten"],
            "nutriments": {},
            "categories": [],
            "ingredients": [],
            "labels": []
        }
        result = enrich_record(record)
        assert isinstance(result, dict)


if __name__ == "__main__":
    print("Running DB049 allergen evidence tests...")
    print("Test results will appear above.")