import unittest

from utils.detect_allergens import detect_allergens


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
