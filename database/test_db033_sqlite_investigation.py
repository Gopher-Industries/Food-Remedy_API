"""
DB033 Unit and Integration Tests for SQLite Local Product Catalog Investigation
Verifies schema, storage, retrieval, barcode lookups, and dataset performance.
"""

import json
import os
import sqlite3
import time
import pytest

from database.sqlite_investigation.sqlite_product_catalog import SQLiteProductCatalog


TEST_DB_PATH = "database/sqlite_investigation/local_test_db033.db"
SAMPLE_JSON_PATH = "database/seeding/cleanTestSample.json"
SAMPLE_5K_PATH = "database/seeding/products_5k_test.json"


@pytest.fixture
def temp_db():
    """Provides a fresh isolated SQLite database instance for testing."""
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)
    catalog = SQLiteProductCatalog(TEST_DB_PATH)
    yield catalog
    catalog.close()
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)


def test_sqlite_catalog_init_and_schema(temp_db):
    """Verify table creation and index existence in local test DB."""
    conn = temp_db.conn
    cursor = conn.cursor()
    
    # Check table existence
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='local_products';")
    assert cursor.fetchone() is not None

    # Check indexes
    cursor.execute("SELECT name FROM sqlite_master WHERE type='index';")
    indexes = [row[0] for row in cursor.fetchall()]
    assert "idx_products_brand" in indexes
    assert "idx_products_category" in indexes
    assert "idx_products_nutriscore" in indexes


def test_import_and_retrieve_sample_products(temp_db):
    """Confirm products can be stored and retrieved accurately."""
    with open(SAMPLE_JSON_PATH, "r", encoding="utf-8") as f:
        sample_data = json.load(f)

    inserted_count = temp_db.bulk_insert(sample_data)
    assert inserted_count > 0
    assert temp_db.count_products() == inserted_count

    # Retrieve first product by barcode
    first_item = sample_data[0]
    raw_barcode = first_item["barcode"]
    retrieved = temp_db.get_by_barcode(raw_barcode)

    assert retrieved is not None
    assert retrieved["productName"] == first_item["productName"]
    assert isinstance(retrieved["allergens"], list)
    assert isinstance(retrieved["ingredients"], list)
    assert isinstance(retrieved["nutrientLevels"], dict)


def test_barcode_lookup_variations(temp_db):
    """Test basic barcode lookup across various format representations."""
    product = {
        "barcode": "9300633714437",
        "productName": "Woolworths Full Cream Milk 2L",
        "brand": "Woolworths",
        "allergens": ["Milk"],
        "categories": ["Dairy", "Milks"],
        "nutriments": {"energy_kj": 270, "fat_g": 3.4}
    }
    temp_db.insert_product(product)

    # Standard GTIN-14 normalized barcode
    res1 = temp_db.get_by_barcode("09300633714437")
    assert res1 is not None
    assert res1["productName"] == "Woolworths Full Cream Milk 2L"

    # Raw 13-digit string
    res2 = temp_db.get_by_barcode("9300633714437")
    assert res2 is not None
    assert res2["productName"] == "Woolworths Full Cream Milk 2L"

    # Formatted barcode with whitespace / hyphens
    res3 = temp_db.get_by_barcode(" 9300-6337-1443-7 ")
    assert res3 is not None
    assert res3["productName"] == "Woolworths Full Cream Milk 2L"

    # Non-existent barcode lookup returns None
    res_none = temp_db.get_by_barcode("99999999999999")
    assert res_none is None


def test_5k_sample_ingestion_and_performance(temp_db):
    """Import a 5,000 product sample dataset and measure lookup response times."""
    if not os.path.exists(SAMPLE_5K_PATH):
        pytest.skip(f"Sample file {SAMPLE_5K_PATH} not found.")

    with open(SAMPLE_5K_PATH, "r", encoding="utf-8") as f:
        sample_5k = json.load(f)

    start_time = time.time()
    count = temp_db.bulk_insert(sample_5k)
    ingest_time = time.time() - start_time

    valid_barcodes = [p for p in sample_5k if p.get("barcode")]
    assert count <= len(valid_barcodes)
    assert temp_db.count_products() == count

    # Measure lookup latency for valid barcode lookups
    sample_barcodes = [
        p.get("barcode") for p in sample_5k[:100]
        if temp_db.get_by_barcode(p.get("barcode")) is not None
    ]
    
    lookup_start = time.time()
    for b in sample_barcodes:
        item = temp_db.get_by_barcode(b)
        assert item is not None
    total_lookup_time = time.time() - lookup_start
    avg_lookup_ms = (total_lookup_time / len(sample_barcodes)) * 1000

    # Sub-millisecond barcode lookup expectation
    assert avg_lookup_ms < 5.0  # Average lookup under 5ms (typically <0.1ms)
    print(f"\nIngested {count} products in {ingest_time:.2f}s.")
    print(f"Average barcode lookup time: {avg_lookup_ms:.3f} ms over {len(sample_barcodes)} queries.")


def test_name_search_offline(temp_db):
    """Test offline keyword search capabilities."""
    products = [
        {"barcode": "11111111111111", "productName": "Organic Apple Juice"},
        {"barcode": "22222222222222", "productName": "Fresh Apple Pie"},
        {"barcode": "33333333333333", "productName": "Banana Smoothie"}
    ]
    temp_db.bulk_insert(products)

    results = temp_db.search_by_name("Apple")
    assert len(results) == 2
    barcodes = [r["barcode"] for r in results]
    assert "001111111111111" in barcodes or "11111111111111" in barcodes
