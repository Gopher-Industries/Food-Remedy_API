"""DB074 - Seeded-data contract integration tests.

Seeds a small sample of the reviewed v1.1 candidate records (DB069 artifact),
maps each record through the ProductDetail contract mapper, and validates every
mapped document against the canonical ProductDetailV1 schema. Negative cases
verify that contract violations (missing productName, 'Unknown' mixed with
known allergens) are actually rejected, so DB066-style regressions cannot
silently pass through CI.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import jsonschema
import pytest

from mapping.map_enriched_to_product_detail import map_enriched_to_product_detail
from mapping.validate_product_contract import validate_product

CANONICAL_SCHEMA = REPO_ROOT / "contracts" / "product_detail_v1.schema.json"
DB069_CANDIDATE = REPO_ROOT / "database" / "Candidates" / "DB069" / "foodremedy_candidate_db069.json"

SAMPLE_SIZE = 25


@pytest.fixture(scope="module")
def contract_schema():
    with CANONICAL_SCHEMA.open("r", encoding="utf-8") as handle:
        return json.load(handle)


@pytest.fixture(scope="module")
def sample_records():
    """Reviewed v1.1 candidate records used as seeded-data fixtures."""
    with DB069_CANDIDATE.open("r", encoding="utf-8") as handle:
        records = json.load(handle)
    assert isinstance(records, list) and len(records) >= SAMPLE_SIZE, (
        "DB069 candidate file missing or too small"
    )
    return records[:SAMPLE_SIZE]


def _mapped_and_schema_ok(record, schema) -> dict:
    mapped = map_enriched_to_product_detail(record)
    jsonschema.validate(instance=mapped, schema=schema)
    return mapped


def test_seeded_sample_maps_and_validates_against_contract(contract_schema, sample_records):
    """Positive path: every seeded sample record must satisfy the contract."""
    assert sample_records, "no sample records loaded"
    checked = 0
    for record in sample_records:
        mapped = _mapped_and_schema_ok(record, contract_schema)
        assert validate_product(mapped) == [], (
            f"contract validator rejected seeded record barcode={mapped.get('barcode')}: "
            f"{validate_product(mapped)}"
        )
        checked += 1
    assert checked == SAMPLE_SIZE


def test_missing_product_name_is_rejected(contract_schema, sample_records):
    """Negative path: a record without productName must fail validation."""
    mapped = map_enriched_to_product_detail(sample_records[0])
    del mapped["productName"]

    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=mapped, schema=contract_schema)

    errors = validate_product(mapped)
    assert any("productName" in err for err in errors)


def test_unknown_allergen_mixed_with_known_is_rejected(contract_schema, sample_records):
    """Negative path: 'Unknown' sentinel cannot be mixed with known allergens."""
    mapped = map_enriched_to_product_detail(sample_records[0])
    mapped["allergens"] = ["Unknown", "milk"]

    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=mapped, schema=contract_schema)

    errors = validate_product(mapped)
    assert any("mix 'Unknown'" in err for err in errors)


def test_unknown_only_allergen_list_is_allowed(contract_schema):
    """Positive path: exactly ['Unknown'] is the legal 'missing info' shape."""
    minimal = {
        "barcode": "0000000000000",
        "productName": "Unknown Allergen Test Product",
        "allergens": [],
        "allergensDetected": [],
        "categories": [],
        "ingredients": [],
        "images": {"root": "https://images.example.com/products/000/000/000/0000"},
    }
    mapped = map_enriched_to_product_detail(minimal)
    assert mapped["allergens"] == ["Unknown"]
    jsonschema.validate(instance=mapped, schema=contract_schema)
    assert validate_product(mapped) == []
