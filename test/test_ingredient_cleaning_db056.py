"""
DB056 regression tests: ingredient text/tags must actually be cleaned by
cleanProductData.main(), not silently pass through uncleaned.

Bug found: main() checked for the camelCase column names ('ingredientsText',
'ingredients') before the camelCase rename step actually ran, so the DB002
cleaning functions (clean_ingredients_text / clean_ingredients_list) and the
per-record normalize_string/normalize_list safety net never touched the real
data. Confirmed against the repo's own committed sample: the Tuna product's
empty ingredients_text ("") was landing in cleanSample.json as
"ingredientsText": "" instead of null.

These tests run main() against the repo's real rawSample.jsonl (known-good
fixture, already used for IOExamples/cleanSample.json) and check the output.
"""

import json
import os
import sys
import unittest
import tempfile

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from database.clean_data.cleanProductData import main as clean_main

RAW_SAMPLE = os.path.join(
    _REPO_ROOT, "database", "clean_data", "IOExamples", "rawSample.jsonl"
)

TUNA_BARCODE = "9300633714437"          # raw ingredients_text: "" (empty string)
VEGETABLE_OIL_BARCODE = "9300633391645"  # raw ingredients_tags: ["en:vegetable-oil-y"]


class TestIngredientCleaningIsApplied(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.TemporaryDirectory()
        cls.output_path = os.path.join(cls.tmpdir.name, "cleanedForTest.json")
        clean_main(RAW_SAMPLE, cls.output_path)
        with open(cls.output_path, "r", encoding="utf-8") as f:
            cls.records = json.load(f)
        cls.by_barcode = {r["barcode"]: r for r in cls.records}

    @classmethod
    def tearDownClass(cls):
        cls.tmpdir.cleanup()

    def test_empty_ingredients_text_becomes_null_not_empty_string(self):
        """DB056: an empty raw ingredients_text must be cleaned to None/null,
        not left as the literal empty string it arrived as."""
        record = self.by_barcode[TUNA_BARCODE]
        self.assertIn("ingredientsText", record)
        self.assertIsNone(
            record["ingredientsText"],
            f"Expected null ingredientsText for an empty source value, "
            f"got {record['ingredientsText']!r} instead",
        )

    def test_valid_ingredients_tags_are_cleaned_and_preserved(self):
        """DB056: real ingredient tag data must survive cleaning (lang prefix
        stripped) and must not be lost/emptied by the fix."""
        record = self.by_barcode[VEGETABLE_OIL_BARCODE]
        self.assertIn("ingredients", record)
        self.assertEqual(record["ingredients"], ["vegetable-oil-y"])

    def test_no_duplicate_ingredient_columns_in_output(self):
        """DB056: the previous bug could create a shadow camelCase column
        alongside the real one; guard against that regressing by checking
        the raw JSON text has each ingredient key exactly once per record."""
        with open(self.output_path, "r", encoding="utf-8") as f:
            raw_text = f.read()
        # A crude but effective check: json.load already collapsed any
        # duplicate keys silently (last-wins), so cross-check by re-parsing
        # with an object_pairs_hook that fails on duplicates.
        def _no_dupes(pairs):
            seen = set()
            for k, _ in pairs:
                if k in seen:
                    raise AssertionError(f"Duplicate key '{k}' found in a cleaned record")
                seen.add(k)
            return dict(pairs)

        json.loads(raw_text, object_pairs_hook=_no_dupes)


if __name__ == "__main__":
    unittest.main()
