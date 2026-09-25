"""DB070 quality-first release generation regression tests."""

import hashlib
import json
from pathlib import Path

import pytest

from scripts.db070_generate_quality_release import (
    EXPECTED_CANDIDATE_SHA256,
    alternative_audit,
    assert_checkpoint_compatible,
    canonicalize_candidate,
    identity_audit,
    nutrition_audit,
    release_fingerprint,
)


ROOT = Path(__file__).resolve().parents[1]


def product(barcode="01234567", **updates):
    record = {
        "barcode": barcode,
        "productName": "Example oats",
        "ingredients": ["oats"],
        "ingredientsText": "Oats",
        "categories": ["breakfasts"],
        "allergens": ["gluten"],
        "allergensDetected": ["gluten"],
        "nutriments": {
            "energy-kcal_100g": 300,
            "fat_100g": 4,
            "sugars_100g": None,
        },
    }
    record.update(updates)
    return record


def enriched(record, sufficient=False):
    output = dict(record)
    output["enrichment"] = {
        "nutrition": {
            "sufficientDataForScore": sufficient,
            "compositeScore": 70 if sufficient else None,
            "healthScore": 70 if sufficient else None,
            "healthLabel": "Green" if sufficient else "InsufficientData",
        },
        "alternatives": {"similar": [], "healthier": []},
    }
    return output


def test_cleaning_preserves_leading_zero_and_missing_nutrient_semantics():
    source = product(
        productName="  Example oats  ",
        allergens=[],
        allergensDetected=[],
        enrichment={"old": True},
        dietTags=["old"],
    )

    cleaned, report = canonicalize_candidate([source])

    assert cleaned[0]["barcode"] == "01234567"
    assert cleaned[0]["nutriments"]["sugars_100g"] is None
    assert "fiber_100g" not in cleaned[0]["nutriments"]
    assert cleaned[0]["allergens"] == ["Unknown"]
    assert cleaned[0]["allergensDetected"] == ["Unknown"]
    assert "enrichment" not in cleaned[0]
    assert "dietTags" not in cleaned[0]
    assert report["leading_zero_barcodes_preserved"] == 1
    assert report["excluded_records"] == 0


def test_cleaning_rejects_duplicate_or_invalid_candidate_identity():
    with pytest.raises(ValueError, match="duplicate barcode"):
        canonicalize_candidate([product(), product()])
    with pytest.raises(ValueError, match="invalid barcode"):
        canonicalize_candidate([product(barcode="123")])
    with pytest.raises(ValueError, match="unusable productName"):
        canonicalize_candidate([product(productName="nan")])


def test_nutrition_audit_withholds_scores_and_never_turns_null_into_zero():
    candidate, _ = canonicalize_candidate([product()])
    release = [enriched(candidate[0], sufficient=False)]

    report = nutrition_audit(candidate, release)

    assert report["nutriment_objects_preserved"] == 1
    assert report["nutriment_preservation_failures"] == 0
    assert report["missing_field_counts"]["sugars"] == 1
    assert report["missing_field_counts"]["fibre"] == 1
    assert report["insufficient_data_records_with_scores_withheld"] == 1


def test_nutrition_audit_rejects_an_insufficient_derived_score():
    candidate, _ = canonicalize_candidate([product()])
    release = [enriched(candidate[0], sufficient=False)]
    release[0]["enrichment"]["nutrition"]["compositeScore"] = 50

    with pytest.raises(ValueError, match="insufficient data"):
        nutrition_audit(candidate, release)


def test_identity_and_alternative_audits_reject_drift_and_dangling_links():
    candidate, _ = canonicalize_candidate([product(), product("11234567")])
    release = [enriched(item, sufficient=True) for item in candidate]
    assert identity_audit(candidate, release)["leading_zero_barcodes"] == 1

    release[0]["enrichment"]["alternatives"]["similar"] = [
        {"barcode": "99999999"}
    ]
    with pytest.raises(ValueError, match="Dangling similar"):
        alternative_audit(release)


def test_release_fingerprint_blocks_incompatible_checkpoint_reuse():
    modules = [{
        "name": "example", "enabled": True, "sha256": "a" * 64,
        "config": {"seed": 1},
    }]
    fingerprint = release_fingerprint("b" * 64, "c" * 64, modules)

    assert_checkpoint_compatible({"release_fingerprint": fingerprint}, fingerprint)
    with pytest.raises(ValueError, match="incompatible"):
        assert_checkpoint_compatible({"release_fingerprint": "wrong"}, fingerprint)
    assert fingerprint != release_fingerprint("d" * 64, "c" * 64, modules)


def test_committed_release_is_bound_validated_reproducible_and_checksum_complete():
    release_dir = ROOT / "database/Release/v1.1"
    manifest = json.loads((release_dir / "validation_manifest.json").read_text())
    reproducibility = json.loads(
        (release_dir / "reproducibility_verification.json").read_text()
    )
    dataset = release_dir / manifest["dataset"]["file"]

    assert manifest["ticket"] == "DB070"
    assert manifest["release_version"] == "v1.1"
    assert manifest["source"]["candidate_sha256"] == EXPECTED_CANDIDATE_SHA256
    assert manifest["dataset"]["records"] == 5000
    assert manifest["validation"]["valid_records"] == 5000
    assert manifest["validation"]["invalid_records"] == 0
    assert manifest["workflow"]["inclusion_count"] == 5000
    assert manifest["workflow"]["exclusion_count"] == 0
    assert manifest["production_release_approved"] is False
    assert manifest["production_seeded"] is False
    assert reproducibility["status"] == "PASS_IDENTICAL_ARTIFACT_HASHES"
    assert reproducibility["isolated_builds"] == 2
    assert hashlib.sha256(dataset.read_bytes()).hexdigest() == manifest["dataset"]["sha256"]

    for line in (release_dir / "SHA256SUMS").read_text().splitlines():
        expected, name = line.split("  ", 1)
        assert hashlib.sha256((release_dir / name).read_bytes()).hexdigest() == expected
