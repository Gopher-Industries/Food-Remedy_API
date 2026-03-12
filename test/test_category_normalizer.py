import unittest
from utils.category_normalizer import (
    normalize_category_value,
    normalize_categories,
    get_primary_category,
    normalize_category_fields
)


class TestNormalizeCategoryValue(unittest.TestCase):
    
    def test_remove_language_prefix(self):
        self.assertEqual(normalize_category_value("en:snacks"), "snacks")
        self.assertEqual(normalize_category_value("fr:boissons"), "boissons")
        self.assertEqual(normalize_category_value("en-US:beverages"), "beverages")
        self.assertEqual(normalize_category_value("en-GB:crisps"), "crisps")
    
    def test_trim_whitespace(self):
        self.assertEqual(normalize_category_value("  snacks  "), "snacks")
        self.assertEqual(normalize_category_value("\tsnacks\n"), "snacks")
        self.assertEqual(normalize_category_value("snacks"), "snacks")
    
    def test_combined_prefix_and_whitespace(self):
        self.assertEqual(normalize_category_value("  en:snacks  "), "snacks")
        self.assertEqual(normalize_category_value("en:  snacks"), "snacks")
    
    def test_empty_and_invalid_inputs(self):
        self.assertIsNone(normalize_category_value(""))
        self.assertIsNone(normalize_category_value("  "))
        self.assertIsNone(normalize_category_value("\t\n"))
        self.assertIsNone(normalize_category_value("en:"))
        self.assertIsNone(normalize_category_value("en:  "))
    
    def test_non_string_inputs(self):
        self.assertIsNone(normalize_category_value(None))
        self.assertIsNone(normalize_category_value(123))
        self.assertIsNone(normalize_category_value([]))
        self.assertIsNone(normalize_category_value({}))
    
    def test_no_prefix_categories(self):
        self.assertEqual(normalize_category_value("snacks"), "snacks")
        self.assertEqual(normalize_category_value("beverages"), "beverages")
        self.assertEqual(normalize_category_value("plant-based-foods"), "plant-based-foods")
    
    def test_special_characters(self):
        self.assertEqual(normalize_category_value("en:chips-and-fries"), "chips-and-fries")
        self.assertEqual(normalize_category_value("en:cheese_onion_crisps"), "cheese_onion_crisps")


class TestNormalizeCategories(unittest.TestCase):
    
    def test_basic_list_normalization(self):
        input_cats = ["en:snacks", "en:beverages", "en:plant-based-foods"]
        expected = ["beverages", "plant-based-foods", "snacks"]
        self.assertEqual(normalize_categories(input_cats), expected)
    
    def test_deduplication(self):
        input_cats = ["en:snacks", "snacks", "en:snacks", "fr:snacks"]
        expected = ["snacks"]
        self.assertEqual(normalize_categories(input_cats), expected)
    
    def test_filtering_empty_values(self):
        input_cats = ["en:snacks", "", "  ", "en:", "en:beverages"]
        expected = ["beverages", "snacks"]
        self.assertEqual(normalize_categories(input_cats), expected)
    
    def test_sorting_for_determinism(self):
        input_cats = ["en:zebra", "en:apple", "en:mango"]
        expected = ["apple", "mango", "zebra"]
        self.assertEqual(normalize_categories(input_cats), expected)
    
    def test_empty_list_input(self):
        self.assertEqual(normalize_categories([]), [])
    
    def test_none_input(self):
        self.assertEqual(normalize_categories(None), [])
    
    def test_string_input(self):
        self.assertEqual(normalize_categories("en:snacks"), ["snacks"])
    
    def test_invalid_input_types(self):
        self.assertEqual(normalize_categories(123), [])
        self.assertEqual(normalize_categories({}), [])
        self.assertEqual(normalize_categories(set()), [])
    
    def test_mixed_prefixed_and_unprefixed(self):
        input_cats = ["en:snacks", "beverages", "fr:chips"]
        expected = ["beverages", "chips", "snacks"]
        self.assertEqual(normalize_categories(input_cats), expected)
    
    def test_real_world_example(self):
        input_cats = [
            "plant-based-foods-and-beverages",
            "plant-based-foods",
            "snacks",
            "cereals-and-potatoes",
            "salty-snacks",
            "appetizers",
            "chips-and-fries",
            "crisps",
            "potato-crisps",
            "flavoured-potato-crisps",
            "cheese-and-onion-crisps",
            "cheese-onion-crisps"
        ]
        result = normalize_categories(input_cats)
        # Verify all categories are present and sorted
        self.assertEqual(len(result), len(input_cats))
        self.assertEqual(result, sorted(input_cats))
    
    def test_deterministic_output(self):
        input_cats = ["en:snacks", "en:beverages", "en:snacks"]
        result1 = normalize_categories(input_cats)
        result2 = normalize_categories(input_cats)
        result3 = normalize_categories(input_cats)
        self.assertEqual(result1, result2)
        self.assertEqual(result2, result3)


class TestGetPrimaryCategory(unittest.TestCase):
    
    def test_get_first_category(self):
        input_cats = ["en:snacks", "en:beverages"]
        self.assertEqual(get_primary_category(input_cats), "beverages")
    
    def test_single_category(self):
        self.assertEqual(get_primary_category(["en:snacks"]), "snacks")
        self.assertEqual(get_primary_category("en:snacks"), "snacks")
    
    def test_empty_list(self):
        self.assertIsNone(get_primary_category([]))
    
    def test_none_input(self):
        self.assertIsNone(get_primary_category(None))
    
    def test_all_empty_values(self):
        self.assertIsNone(get_primary_category(["", "  ", "en:"]))
    
    def test_first_valid_after_filtering(self):
        input_cats = ["", "  ", "en:snacks", "en:beverages"]
        # After filtering and sorting, "beverages" comes before "snacks"
        self.assertEqual(get_primary_category(input_cats), "beverages")


class TestNormalizeCategoryFields(unittest.TestCase):
    
    def test_basic_normalization(self):
        input_cats = ["en:snacks", "en:beverages"]
        result = normalize_category_fields(input_cats)
        self.assertEqual(result["category"], "beverages")
        self.assertEqual(result["categories"], ["beverages", "snacks"])
    
    def test_single_category(self):
        input_cats = ["en:snacks"]
        result = normalize_category_fields(input_cats)
        self.assertEqual(result["category"], "snacks")
        self.assertEqual(result["categories"], ["snacks"])
    
    def test_empty_input(self):
        result = normalize_category_fields([])
        self.assertIsNone(result["category"])
        self.assertEqual(result["categories"], [])
    
    def test_none_input(self):
        result = normalize_category_fields(None)
        self.assertIsNone(result["category"])
        self.assertEqual(result["categories"], [])
    
    def test_string_input(self):
        result = normalize_category_fields("en:snacks")
        self.assertEqual(result["category"], "snacks")
        self.assertEqual(result["categories"], ["snacks"])
    
    def test_with_duplicates_and_empty(self):
        input_cats = ["en:snacks", "", "snacks", "en:beverages", "  "]
        result = normalize_category_fields(input_cats)
        self.assertEqual(result["category"], "beverages")
        self.assertEqual(result["categories"], ["beverages", "snacks"])
    
    def test_return_structure(self):
        result = normalize_category_fields(["en:snacks"])
        self.assertIn("category", result)
        self.assertIn("categories", result)
        self.assertIsInstance(result["category"], (str, type(None)))
        self.assertIsInstance(result["categories"], list)


class TestDeterministicBehavior(unittest.TestCase):
    
    def test_deterministic_normalize_categories(self):
        input_cats = ["en:zebra", "en:apple", "en:mango", "en:apple"]
        results = [normalize_categories(input_cats) for _ in range(10)]
        # All results should be identical
        self.assertTrue(all(r == results[0] for r in results))
    
    def test_deterministic_normalize_category_fields(self):
        input_cats = ["en:snacks", "en:beverages", "en:snacks"]
        results = [normalize_category_fields(input_cats) for _ in range(10)]
        # All results should be identical
        self.assertTrue(all(
            r["category"] == results[0]["category"] and
            r["categories"] == results[0]["categories"]
            for r in results
        ))


class TestBackwardCompatibility(unittest.TestCase):
    
    def test_handles_old_format_gracefully(self):
        # Old format: just list of category strings
        old_format = ["snacks", "beverages", "plant-based-foods"]
        result = normalize_categories(old_format)
        # Should still work, just sorted
        self.assertEqual(result, sorted(old_format))
    
    def test_handles_mixed_old_new_format(self):
        mixed = ["snacks", "en:beverages", "plant-based-foods"]
        result = normalize_categories(mixed)
        expected = ["beverages", "plant-based-foods", "snacks"]
        self.assertEqual(result, expected)


if __name__ == '__main__':
    unittest.main()
