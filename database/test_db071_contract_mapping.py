"""DB071: seeded output must satisfy the ProductDetail v1 contract.

Regression test for the integration blocker found in DB066: the seeding
pipeline must route every release record through
mapping/map_enriched_to_product_detail.py before upload, so seeded documents
match contracts/product_detail_v1.schema.json.

NOTE: the seeded documents are validated *directly* (no re-mapping), because
the app consumes what seeding actually writes. Validating after a fresh
mapping pass would mask the original bug.

Red before DB071 (seeded docs lack nutriments_normalized, category, tags),
green after. DB074 wires this into .github/workflows/database-release-integrity.yml.
"""
import json
import os
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from database.seeding.seed_firestore import run
from mapping.validate_product_contract import validate_product


def test_seeded_output_matches_contract(tmp_path):
    out = tmp_path / "seeded.json"
    result = run(
        "database/seeding/cleanTestSample.json",
        str(out),
        {"dry_run": True, "subset": 50},
    )
    assert not result.get("error"), result

    with open(out, encoding="utf-8") as f:
        seeded = json.load(f)
    assert seeded, "seeding produced no documents"

    failures = {
        str(rec.get("barcode")): errs
        for rec in seeded
        if (errs := validate_product(rec))
    }
    assert not failures, f"{len(failures)}/{len(seeded)} seeded docs violate contract: {dict(list(failures.items())[:3])}"
