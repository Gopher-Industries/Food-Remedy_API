import unittest
from pathlib import Path

from scripts.db032_validation_suite import run_validation_suite


def product(
    barcode: str,
    name: str,
    categories: list[str],
    nutriments: dict | None = None,
):
    return {
        "barcode": barcode,
        "productName": name,
        "brand": "Demo",
        "categories": categories,
        "standardCategory": "snacks and confectionery",
        "nutriments": nutriments or {"energy_100g": 100},
        "images": {"root": "https://example.test/img", "variants": {}, "primary": None},
    }


class TestDB032ValidationSuite(unittest.TestCase):
    def test_suite_passes_for_valid_dataset(self):
        data = [
            product("111", "A", ["snacks"]),
            product("222", "B", ["snacks"]),
            product("333", "C", ["beverages"]),
            product("444", "D", ["beverages"]),
        ]
        report = run_validation_suite(data, source=Path("sample.json"), sample_size=4, seed=32)

        self.assertTrue(report["ok"])
        self.assertTrue(report["checks"]["integration_validation"]["barcode_lookup"]["ok"])
        self.assertTrue(report["checks"]["integration_validation"]["category_queries"]["ok"])
        self.assertTrue(report["checks"]["integration_validation"]["recommendation_candidates"]["ok"])

    def test_suite_fails_when_recommendation_candidates_missing_signals(self):
        weak_candidate_a = product("555", "E", ["snacks"], nutriments={})
        weak_candidate_a.pop("nutriments")
        weak_candidate_a["enrichment"] = {}
        weak_candidate_a["tags"] = {"final": [], "removed": []}

        weak_candidate_b = product("666", "F", ["snacks"], nutriments={})
        weak_candidate_b.pop("nutriments")
        weak_candidate_b["enrichment"] = {}
        weak_candidate_b["tags"] = {"final": [], "removed": []}

        data = [
            weak_candidate_a,
            weak_candidate_b,
            product("333", "C", ["beverages"]),
            product("444", "D", ["beverages"]),
        ]
        report = run_validation_suite(data, source=Path("sample.json"), sample_size=2, seed=32)

        self.assertFalse(report["ok"])
        recs = report["checks"]["integration_validation"]["recommendation_candidates"]
        self.assertFalse(recs["ok"])
        self.assertGreater(len(recs["issues"]), 0)

    def test_suite_fails_when_lookup_has_duplicate_barcodes(self):
        data = [
            product("111", "A", ["snacks"]),
            product("111", "B", ["snacks"]),
            product("333", "C", ["beverages"]),
            product("444", "D", ["beverages"]),
        ]
        report = run_validation_suite(data, source=Path("sample.json"), sample_size=2, seed=32)

        lookup = report["checks"]["integration_validation"]["barcode_lookup"]
        self.assertFalse(lookup["ok"])
        self.assertTrue(any("duplicate barcode" in i["message"] for i in lookup["issues"]))


if __name__ == "__main__":
    unittest.main()
