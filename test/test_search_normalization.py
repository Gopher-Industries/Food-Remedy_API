"""
Unit Test Suite for Search Normalization, Idempotent Backfill, and Coverage Statistics.
"""

import json
import os
import sys
import tempfile
import unittest

# Ensure project root is in sys.path
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from database.clean_data.normalization.SearchNormalisation import (
    add_search_fields_to_product,
    normalize_search_text,
)
from database.seeding.backfill_search_fields import (
    backfill_records,
    compute_coverage_stats,
    process_file,
)


class TestSearchTextNormalization(unittest.TestCase):
    def test_mixed_case_and_whitespace_trimming(self):
        self.assertEqual(normalize_search_text("  Dairy Farmers  "), "dairy farmers")
        self.assertEqual(normalize_search_text("ORGANIC MILK"), "organic milk")

    def test_internal_repeated_whitespace_collapsing(self):
        self.assertEqual(normalize_search_text("Full   Cream   Milk"), "full cream milk")
        self.assertEqual(normalize_search_text("Brand  \t\n  Name"), "brand name")

    def test_unicode_nfc_normalization(self):
        # Café with decomposed e + accent -> NFC composed
        decomposed = "Cafe\u0301"
        normalized = normalize_search_text(decomposed)
        self.assertEqual(normalized, "café")

    def test_smart_apostrophes_and_quotes(self):
        self.assertEqual(normalize_search_text("M&M’s"), "m&m's")
        self.assertEqual(normalize_search_text("Mother‘s Choice"), "mother's choice")
        self.assertEqual(normalize_search_text("Baker`s Delight"), "baker's delight")

    def test_hyphens_and_punctuation_retention(self):
        self.assertEqual(normalize_search_text("Gluten-Free Oats"), "gluten-free oats")
        self.assertEqual(normalize_search_text("Coca-Cola (Zero)"), "coca-cola (zero)")

    def test_missing_and_none_values(self):
        self.assertEqual(normalize_search_text(None), "")
        self.assertEqual(normalize_search_text(""), "")
        self.assertEqual(normalize_search_text("   "), "")

    def test_non_string_input_handling(self):
        self.assertEqual(normalize_search_text(12345), "12345")
        self.assertEqual(normalize_search_text(99.9), "99.9")
        self.assertEqual(normalize_search_text(True), "true")

    def test_add_search_fields_to_product_preserves_display_values(self):
        product = {
            "barcode": "9300601234567",
            "productName": "  Devondale Full Cream Milk 2L  ",
            "brand": " Devondale ",
        }
        enriched = add_search_fields_to_product(product)

        # Source display values must remain untouched
        self.assertEqual(enriched["productName"], "  Devondale Full Cream Milk 2L  ")
        self.assertEqual(enriched["brand"], " Devondale ")

        # Normalized search fields must be correctly formatted
        self.assertEqual(enriched["productNameSearch"], "devondale full cream milk 2l")
        self.assertEqual(enriched["brandSearch"], "devondale")


class TestBackfillIdempotencyAndCoverage(unittest.TestCase):
    def setUp(self):
        self.sample_products = [
            {
                "barcode": "9300000000001",
                "productName": "  ALMOND MILK  ",
                "brand": "Sanitarium",
            },
            {
                "barcode": "9300000000002",
                "productName": "Oat-Milk Barista",
                "brand": "  Oatly’s  ",
                "productNameSearch": "oat-milk barista",
                "brandSearch": "oatly's",
            },
            {
                "barcode": "9300000000003",
                "productName": None,
                "brand": "",
            },
        ]

    def test_backfill_idempotency_runs_twice_with_zero_changes_on_second_pass(self):
        # Pass 1: backfill original sample products (adds fields to 2 records)
        pass1_records, pass1_modified = backfill_records(self.sample_products)
        self.assertEqual(pass1_modified, 2)

        # Pass 2: re-run backfill on pass1 output
        pass2_records, pass2_modified = backfill_records(pass1_records)
        self.assertEqual(pass2_modified, 0)  # Idempotent: 0 records modified on pass 2
        self.assertEqual(pass1_records, pass2_records)  # Content identical

    def test_coverage_stats_calculation(self):
        pass1_records, _ = backfill_records(self.sample_products)
        stats = compute_coverage_stats(pass1_records)

        self.assertEqual(stats["total_products"], 3)
        self.assertEqual(stats["has_barcode"], 3)
        self.assertEqual(stats["has_product_name_search"], 2)
        self.assertEqual(stats["has_brand_search"], 2)
        self.assertEqual(stats["missing_name_gaps"], 1)
        self.assertEqual(stats["missing_brand_gaps"], 1)

    def test_file_backfill_process_and_report(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_json = os.path.join(tmpdir, "test_products.json")
            with open(tmp_json, "w", encoding="utf-8") as f:
                json.dump(self.sample_products, f)

            res = process_file(tmp_json, inplace=True)
            self.assertEqual(res["records_modified"], 2)

            # Re-run file process inplace (0 modifications on second pass)
            res2 = process_file(tmp_json, inplace=True)
            self.assertEqual(res2["records_modified"], 0)


if __name__ == "__main__":
    unittest.main()
