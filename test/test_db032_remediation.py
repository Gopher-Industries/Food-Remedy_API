import unittest

from database.pipeline.modules.db032_remediation import remediate_record


class TestDB032Remediation(unittest.TestCase):
    def test_remediates_missing_critical_fields(self):
        record = {
            "barcode": "123",
            "genericName": "Fallback Name",
            "categories": [],
            "nutriments": None,
            "brand": "",
            "productName": "",
            "nutriscoreGrade": "not-applicable",
            "productQuantityUnit": "kj",
            "servingQuantityUnit": "%",
        }

        out = remediate_record(record)
        self.assertEqual(out["productName"], "Fallback Name")
        self.assertEqual(out["brand"], "Unknown Brand")
        self.assertEqual(out["categories"], ["other"])
        self.assertEqual(out["standardCategory"], "other")
        self.assertEqual(out["nutriscoreGrade"], "unknown")
        self.assertEqual(out["productQuantityUnit"], "g")
        self.assertEqual(out["servingQuantityUnit"], "g")
        self.assertIsInstance(out["nutriments"], dict)
        self.assertIn("tags", out)
        self.assertIn("enrichment", out)

    def test_uses_category_context_for_units_and_standard_category(self):
        record = {
            "barcode": "456",
            "productName": "Sparkling Water",
            "brand": "Acme",
            "categories": ["en:waters"],
            "nutriments": {},
            "productQuantityUnit": "mmol/l",
            "servingQuantityUnit": "kj",
            "nutriscoreGrade": "B",
        }

        out = remediate_record(record)
        self.assertEqual(out["categories"][0], "beverages")
        self.assertIn("waters", out["categories"])
        self.assertEqual(out["standardCategory"], "beverages")
        self.assertEqual(out["productQuantityUnit"], "ml")
        self.assertEqual(out["servingQuantityUnit"], "ml")
        self.assertEqual(out["nutriscoreGrade"], "b")


if __name__ == "__main__":
    unittest.main()
