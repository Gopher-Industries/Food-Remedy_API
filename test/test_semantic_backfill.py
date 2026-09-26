import copy
import json
import unittest
from pathlib import Path

from database.pipeline.backfill_semantic_attributes import backfill


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "database" / "pipeline" / "fixtures"


class SemanticBackfillTest(unittest.TestCase):
    def test_curated_backfill_is_idempotent_and_preserves_safety_fields(self):
        products = json.loads((FIXTURES / "semantic_evaluation_products_v1.json").read_text())
        manifest = json.loads((FIXTURES / "semantic_evaluation_manifest_v1.json").read_text())
        before = copy.deepcopy(products)
        applied, report = backfill(products, manifest)
        self.assertEqual(applied, 2)
        self.assertEqual(report["missingBlocks"], 1)
        self.assertEqual(report["populatedAttributes"], 7)
        self.assertEqual(report["lowConfidenceAttributes"], 0)
        for old, new in zip(before, products):
            self.assertEqual(old["allergens"], new["allergens"])
            self.assertEqual(old["nutriments"], new["nutriments"])
        self.assertEqual(backfill(products, manifest)[0], 0)

    def test_invalid_and_conflicting_evidence_fails(self):
        products = json.loads((FIXTURES / "semantic_evaluation_products_v1.json").read_text())
        manifest = json.loads((FIXTURES / "semantic_evaluation_manifest_v1.json").read_text())
        bad = copy.deepcopy(manifest)
        bad[0]["semanticAttributes"]["texture"]["confidence"] = 2
        with self.assertRaises(ValueError):
            backfill(copy.deepcopy(products), bad)
        backfill(products, manifest)
        changed = copy.deepcopy(manifest)
        changed[0]["semanticAttributes"]["texture"]["value"] = "soft"
        with self.assertRaises(ValueError):
            backfill(products, changed)


if __name__ == "__main__":
    unittest.main()
