import unittest

from utils.detect_allergens import detect_allergens


class TestDetectAllergens(unittest.TestCase):
    """Tests for allergen detection behaviour."""

    def test_almond_milk_does_not_detect_milk(self):
        """Almond milk should detect Tree Nuts, but not Milk."""
        product = {"ingredients_text": "almond milk"}
        result = detect_allergens(product)
        self.assertEqual(result, ["Tree Nuts"])

    def test_soy_milk_does_not_detect_milk(self):
        """Soy milk should detect Soy, but not Milk."""
        product = {"ingredients_text": "soy milk"}
        result = detect_allergens(product)
        self.assertEqual(result, ["Soy"])

    def test_oat_milk_does_not_detect_milk(self):
        """Oat milk should not be detected as Milk."""
        product = {"ingredients_text": "oat milk"}
        result = detect_allergens(product)
        self.assertEqual(result, [])

    def test_rice_milk_does_not_detect_milk(self):
        """Rice milk should not be detected as Milk."""
        product = {"ingredients_text": "rice milk"}
        result = detect_allergens(product)
        self.assertEqual(result, [])

    def test_real_milk_is_still_detected(self):
        """Real milk should still be detected as Milk."""
        product = {"ingredients_text": "milk"}
        result = detect_allergens(product)
        self.assertEqual(result, ["Milk"])

    def test_plant_milk_with_real_dairy_keeps_milk(self):
        """Milk should remain detected when plant milk and real dairy are both present."""
        product = {"ingredients_text": "almond milk, milk powder"}
        result = detect_allergens(product)
        self.assertEqual(result, ["Milk", "Tree Nuts"])


class DetectAllergensTrustedEvidenceTests(unittest.TestCase):
    def test_tuna_ingredient_detects_fish(self):
        self.assertIn("Fish", detect_allergens({"ingredientsText": "Tuna, water, salt"}))

    def test_product_name_alone_is_not_definitive_evidence(self):
        self.assertEqual(
            [],
            detect_allergens({"productName": "Tuna in springwater"}),
        )

    def test_category_and_label_alone_are_not_definitive_evidence(self):
        self.assertEqual(
            [],
            detect_allergens(
                {
                    "categories_tags": ["en:canned-tuna"],
                    "labels_tags": ["en:contains-fish"],
                }
            ),
        )

    def test_trace_fields_detect_seafood_groups(self):
        self.assertIn("Crustacea", detect_allergens({"traces": "May contain shrimp"}))
        self.assertIn(
            "Molluscs",
            detect_allergens({"tracesFromIngredients": "May contain squid"}),
        )


if __name__ == "__main__":
    unittest.main()
