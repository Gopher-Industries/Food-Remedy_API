"""DB037 — Product Detail contract lock tests."""

from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft7Validator

from mapping.contract_paths import (
    CANONICAL_CONTRACT_PATH,
    CONTRACT_EXAMPLES_DIR,
    CONTRACT_VERSION,
    LEGACY_CONTRACT_PATH,
)
from mapping.validate_product_contract import validate_product

REPO_ROOT = Path(__file__).resolve().parents[1]


def _load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def test_canonical_and_legacy_schemas_are_identical():
    canonical = _load_json(CANONICAL_CONTRACT_PATH)
    legacy = _load_json(LEGACY_CONTRACT_PATH)
    assert canonical == legacy


def test_contract_version_documented_in_changelog():
    changelog = (REPO_ROOT / "api" / "contracts" / "CHANGELOG.md").read_text(encoding="utf-8")
    assert CONTRACT_VERSION in changelog


def test_allergen_schema_distinguishes_unknown_from_known_information():
    schema = _load_json(CANONICAL_CONTRACT_PATH)["properties"]["allergens"]
    validator = Draft7Validator(schema)

    assert validator.is_valid(["Unknown"])
    assert validator.is_valid(["Milk", "Egg"])
    assert not validator.is_valid([])
    assert not validator.is_valid(["Unknown", "Milk"])


def test_all_committed_examples_pass_validator():
    example_files = sorted(CONTRACT_EXAMPLES_DIR.glob("*.json"))
    assert example_files, "Expected at least one example under api/contracts/examples/"
    for path in example_files:
        payload = _load_json(path)
        errors = validate_product(payload)
        assert errors == [], f"{path.name}: {errors}"


def test_db037_lock_doc_exists():
    doc = REPO_ROOT / "Documents" / "Database" / "2026 Trimester 1" / "DB037-API-LOCK.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    assert "1.0.0" in text
    assert "map_enriched_to_product_detail" in text
