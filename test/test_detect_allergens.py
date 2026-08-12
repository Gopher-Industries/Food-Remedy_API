import unittest
from utils.detect_allergens import detect_allergens

class TestDetectAllergens(unittest.TestCase):
    """Tests for allergen detection behaviour."""

    def test_almond_milk_does_not_detect_milk(self):
        """Almond milk should detect Tree Nuts, but not Milk."""
        # Create a small test product containing only almond milk
        product = {"ingredients_text": "almond milk"}

        # Run the existing allergen detection function
        result = detect_allergens(product)

        # Almond should be detected as Tree Nuts, but Milk should be suppressed
        self.assertEqual(result, ["Tree Nuts"])

    def test_soy_milk_does_not_detect_milk(self):
        """Soy milk should detect Soy, but not Milk."""
        # Create a small test product containing only soy milk.
        product = {"ingredients_text": "soy milk"}

        # Run the allergen detection function.
        result = detect_allergens(product)

        # Soy should be detected, but Milk should be suppressed.
        self.assertEqual(result, ["Soy"])

    def test_oat_milk_does_not_detect_milk(self):
        """Oat milk should not be detected as Milk."""
        # Create a small test product containing only oat milk.
        product = {"ingredients_text": "oat milk"}

        # Run the allergen detection function.
        result = detect_allergens(product)

        # Oat milk should not trigger the Milk allergen.
        self.assertEqual(result, [])

    def test_rice_milk_does_not_detect_milk(self):
        """Rice milk should not be detected as Milk."""
        # Create a small test product containing only rice milk.
        product = {"ingredients_text": "rice milk"}

        # Run the allergen detection function.
        result = detect_allergens(product)

        # Rice milk should not trigger the Milk allergen.
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

if __name__ == "__main__":
    unittest.main()