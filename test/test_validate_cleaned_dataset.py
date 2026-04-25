import unittest
from pathlib import Path

from scripts.validate_cleaned_dataset import load_products, validate


def valid_product(barcode="1234567890123"):
    return {
        "barcode": barcode,
        "productName": "Sample Product",
        "brand": "Sample Brand",
        "categories": ["snacks"],
        "standardCategory": "snacks and confectionery",
        "nutriments": {"fat_100g": 1.2},
        "nutriscoreGrade": "b",
        "productQuantity": 100,
        "productQuantityUnit": "g",
        "servingQuantity": 25,
        "servingQuantityUnit": "g",
        "completeness": 0.8,
        "images": {"root": "https://example.test/images", "variants": {}, "primary": None},
    }


class TestValidateCleanedDataset(unittest.TestCase):
    def test_validate_passes_clean_product(self):
        report = validate([valid_product()], Path("sample.json"))

        self.assertTrue(report["ok"])
        self.assertEqual(report["checks"]["missing_product_fields"]["issue_count"], 0)
        self.assertEqual(report["checks"]["category_validation"]["issue_count"], 0)
        self.assertEqual(report["checks"]["inconsistency_detection"]["issue_count"], 0)

    def test_validate_flags_missing_product_fields(self):
        product = valid_product()
        product["productName"] = ""
        product["brand"] = ""

        report = validate([product], Path("sample.json"))

        missing = report["checks"]["missing_product_fields"]
        self.assertFalse(report["ok"])
        self.assertEqual(missing["field_counts"]["productName"], 1)
        self.assertEqual(missing["field_counts"]["brand"], 1)

    def test_validate_flags_category_issues(self):
        product = valid_product()
        product["standardCategory"] = "mystery aisle"
        product["categories"] = ["en:snacks"]

        report = validate([product], Path("sample.json"))

        categories = report["checks"]["category_validation"]
        self.assertFalse(categories["ok"])
        self.assertEqual(categories["unknown_standard_categories"]["mystery aisle"], 1)
        self.assertTrue(any("language prefix" in item["message"] for item in categories["issues"]))

    def test_validate_flags_inconsistencies(self):
        product_a = valid_product("1234567890123")
        product_a["completeness"] = 1.2
        product_a["servingQuantity"] = -1
        product_a["nutriments"] = {"fat_100g": -0.1}
        product_b = valid_product("1234567890123")

        report = validate([product_a, product_b], Path("sample.json"))

        inconsistencies = report["checks"]["inconsistency_detection"]
        self.assertFalse(inconsistencies["ok"])
        self.assertEqual(inconsistencies["duplicate_barcodes"]["1234567890123"], 2)
        self.assertEqual(inconsistencies["field_counts"]["completeness"], 1)
        self.assertEqual(inconsistencies["field_counts"]["servingQuantity"], 1)
        self.assertEqual(inconsistencies["field_counts"]["nutriments.fat_100g"], 1)

    def test_load_products_accepts_json_array(self):
        path = Path(__file__).resolve().parents[1] / "database" / "clean_data" / "cleanSample.json"
        products = load_products(path)

        self.assertGreater(len(products), 0)
        self.assertIsInstance(products[0], dict)


if __name__ == "__main__":
    unittest.main()
