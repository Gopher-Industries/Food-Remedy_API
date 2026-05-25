import unittest
from pathlib import Path
from scripts.validate_cleaned_dataset import validate
 
class TestDatasetValidationTicket(unittest.TestCase):
    def test_invalid_food_data(self):
        # Various invalid cases: missing fields, wrong types, negative values, invalid categories
        invalid_products = [
            {},  # completely empty
            {"barcode": None, "productName": None},
            {"barcode": "abc", "productName": 123},
            {"barcode": "123", "productName": "Test", "completeness": -0.5},
            {"barcode": "123", "productName": "Test", "categories": [123]},
            {"barcode": "123", "productName": "Test", "standardCategory": "not_a_real_category"},
            {"barcode": "123", "productName": "Test", "nutriscoreGrade": "z"},
            {"barcode": "123", "productName": "Test", "nutriments": {"fat_100g": -1}},
        ]
        try:
            report = validate(invalid_products, Path("invalid.json"))
        except Exception as e:
            self.fail(f"Validation crashed on invalid data: {e}")
        self.assertFalse(report["ok"])
        total_issues = sum(check["issue_count"] for check in report["checks"].values())
        self.assertGreater(total_issues, 0)
 
    def test_incomplete_food_data(self):
        # Incomplete: only required fields, missing recommended
        incomplete_products = [
            {"barcode": "1234567890123", "productName": "Test"},
            {"barcode": "2345678901234", "productName": "Test2", "brand": ""},
        ]
        try:
            report = validate(incomplete_products, Path("incomplete.json"))
        except Exception as e:
            self.fail(f"Validation crashed on incomplete data: {e}")
        self.assertIn("ok", report)
        missing = report["checks"]["missing_product_fields"]
        self.assertGreaterEqual(missing["field_counts"].get("brand", 0), 1)
 
if __name__ == "__main__":
    unittest.main()
 