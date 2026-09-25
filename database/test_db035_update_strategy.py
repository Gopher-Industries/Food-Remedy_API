"""
DB035 Unit and Integration Tests for Local Database Update Strategy Investigation
Verifies incremental updates, atomic replacement, versioning metadata, and transaction rollbacks.
"""

import json
import os
import sqlite3
import pytest

from database.sqlite_investigation.local_db_update_strategy import (
    VersionedProductCatalog,
    simulate_full_replacement,
)

TEST_DB_PATH = "database/sqlite_investigation/local_test_db035.db"
NEW_SNAPSHOT_PATH = "database/sqlite_investigation/new_snapshot_db035.db"


@pytest.fixture
def catalog():
    """Provides an isolated VersionedProductCatalog instance for testing."""
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)
    cat = VersionedProductCatalog(TEST_DB_PATH)
    yield cat
    cat.close()
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)


def test_version_metadata_initialization(catalog):
    """Verify version metadata table is properly seeded upon initialization."""
    schema_v, data_v = catalog.get_catalog_version()
    assert schema_v == 1
    assert data_v == 100

    catalog.set_metadata("data_version", "101")
    _, updated_v = catalog.get_catalog_version()
    assert updated_v == 101


def test_incremental_delta_add_update_delete(catalog):
    """Test adding new products, updating existing products, and deleting products via delta payload."""
    # Seed initial product
    prod_initial = {
        "barcode": "9300633714437",
        "productName": "Milk 2L Original",
        "brand": "Woolworths",
        "allergens": ["Milk"]
    }
    catalog.insert_product(prod_initial)
    assert catalog.count_products() == 1

    # Prepare Delta Payload (Version 100 -> 101)
    delta_payload = {
        "from_version": 100,
        "to_version": 101,
        "added_or_updated": [
            {
                "barcode": "9300633714437",
                "productName": "Milk 2L Updated Name",  # Updated product
                "brand": "Woolworths",
                "allergens": ["Milk"]
            },
            {
                "barcode": "9310063000001",
                "productName": "New Yoghurt 500g",       # New product
                "brand": "Chobani",
                "allergens": ["Milk"]
            }
        ],
        "deleted_barcodes": []
    }

    success = catalog.apply_incremental_delta(delta_payload)
    assert success is True

    _, current_data_v = catalog.get_catalog_version()
    assert current_data_v == 101
    assert catalog.count_products() == 2

    # Check updated record
    updated_item = catalog.get_by_barcode("9300633714437")
    assert updated_item is not None
    assert updated_item["productName"] == "Milk 2L Updated Name"

    # Now test deletion in Delta Payload (Version 101 -> 102)
    delta_delete = {
        "from_version": 101,
        "to_version": 102,
        "added_or_updated": [],
        "deleted_barcodes": ["9300633714437"]  # Remove Milk product
    }

    success_del = catalog.apply_incremental_delta(delta_delete)
    assert success_del is True
    assert catalog.count_products() == 1
    assert catalog.get_by_barcode("9300633714437") is None


def test_incremental_delta_version_mismatch(catalog):
    """Verify that delta payloads with mismatched version numbers are rejected."""
    _, current_v = catalog.get_catalog_version()
    assert current_v == 100

    invalid_delta = {
        "from_version": 95,  # Mismatched expected version
        "to_version": 96,
        "added_or_updated": [{"barcode": "11111111111111", "productName": "Test Product"}],
        "deleted_barcodes": []
    }

    success = catalog.apply_incremental_delta(invalid_delta)
    assert success is False

    # Verify version and product count remained unchanged
    _, end_v = catalog.get_catalog_version()
    assert end_v == 100
    assert catalog.count_products() == 0


def test_transaction_rollback_on_failure(catalog):
    """Confirm that an error during delta execution triggers an atomic rollback."""
    # Seed initial baseline
    prod = {"barcode": "9300633714437", "productName": "Baseline Product"}
    catalog.insert_product(prod)
    assert catalog.count_products() == 1

    corrupt_payload = {
        "valid_product": {"barcode": "99999999999999", "productName": "Should Be Rolled Back"},
        "trigger_fault": True
    }

    success = catalog.simulate_failed_delta_with_rollback(corrupt_payload)
    assert success is False

    # Assert baseline was preserved, corrupted insertion was rolled back
    assert catalog.count_products() == 1
    assert catalog.get_by_barcode("99999999999999") is None
    _, current_v = catalog.get_catalog_version()
    assert current_v == 100


def test_full_replacement_atomic_swap():
    """Verify atomic full database replacement and integrity checks."""
    active_path = "database/sqlite_investigation/active_test_db035.db"
    new_snapshot_path = "database/sqlite_investigation/snapshot_test_db035.db"

    # Cleanup prior files
    for p in (active_path, new_snapshot_path):
        if os.path.exists(p):
            os.remove(p)

    # 1. Create active database (Version 100, 1 product)
    db_active = VersionedProductCatalog(active_path)
    db_active.insert_product({"barcode": "11111111111111", "productName": "Old Active Product"})
    db_active.set_metadata("data_version", "100")
    db_active.close()

    # 2. Create new snapshot database (Version 105, 2 products)
    db_snapshot = VersionedProductCatalog(new_snapshot_path)
    db_snapshot.insert_product({"barcode": "22222222222222", "productName": "Snapshot Product A"})
    db_snapshot.insert_product({"barcode": "33333333333333", "productName": "Snapshot Product B"})
    db_snapshot.set_metadata("data_version", "105")
    db_snapshot.close()

    # Perform atomic replacement
    swap_success = simulate_full_replacement(active_path, new_snapshot_path)
    assert swap_success is True

    # Re-open active database and verify it contains updated content
    db_reopened = VersionedProductCatalog(active_path)
    assert db_reopened.count_products() == 2
    _, new_v = db_reopened.get_catalog_version()
    assert new_v == 105
    assert db_reopened.get_by_barcode("22222222222222") is not None
    db_reopened.close()

    # Cleanup
    if os.path.exists(active_path):
        os.remove(active_path)
