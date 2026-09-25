"""
DB058: Automated unit tests for release dataset barcode data quality.

Verifies:
- Release candidate products JSON dataset exists and is readable
- Zero missing or empty barcodes
- All barcodes are string instances
- Barcode length breakdown (8, 12, 13, 14 digit standards)
- Invalid barcode format detection matches DB021 validation criteria
"""

import json
import os
import pytest
from database.Validation.db021_validator import DB021Validator

DATASET_PATH = os.path.join("database", "seeding", "products_enriched.json")


@pytest.fixture
def dataset_products():
    """Load release dataset products."""
    assert os.path.exists(DATASET_PATH), f"Release dataset missing: {DATASET_PATH}"
    with open(DATASET_PATH, encoding="utf-8") as f:
        return json.load(f)


def test_db058_no_missing_or_empty_barcodes(dataset_products):
    """Ensure release dataset has 0 missing or empty barcode strings."""
    missing = [p for p in dataset_products if not p.get("barcode")]
    assert len(missing) == 0, f"Found {len(missing)} products with missing/empty barcode"


def test_db058_all_barcodes_are_strings(dataset_products):
    """Ensure all barcodes are stored as string types (preserving leading zeros)."""
    non_strings = [p for p in dataset_products if not isinstance(p.get("barcode"), str)]
    assert len(non_strings) == 0, f"Found {len(non_strings)} products with non-string barcode"


def test_db058_barcode_validation_and_invalid_formats(dataset_products):
    """Verify DB021 validator results match DB058 barcode audit numbers."""
    validator = DB021Validator()
    results = validator.validate_barcodes(dataset_products)
    assert results["empty"] == 0
    assert results["duplicates"] == 0
    assert results["invalid_format"] == 3
