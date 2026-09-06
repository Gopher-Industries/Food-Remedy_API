"""
DB033 Performance and Storage Benchmark Script for SQLite Local Product Database Investigation
"""

import glob
import json
import os
import sqlite3
import time
from database.sqlite_investigation.sqlite_product_catalog import SQLiteProductCatalog


def run_benchmark():
    print("=== DB033 SQLite Local Product Database Investigation Benchmark ===")
    
    # 1. Load sample dataset
    sample_5k_path = "database/seeding/products_5k_test.json"
    if not os.path.exists(sample_5k_path):
        print(f"Sample 5k file missing: {sample_5k_path}")
        return

    with open(sample_5k_path, "r", encoding="utf-8") as f:
        products = json.load(f)

    db_filename = "database/sqlite_investigation/benchmark_products.db"
    if os.path.exists(db_filename):
        os.remove(db_filename)

    catalog = SQLiteProductCatalog(db_filename)

    # 2. Measure insertion performance
    t0 = time.time()
    inserted_count = catalog.bulk_insert(products)
    t1 = time.time()
    insert_duration = t1 - t0
    records_per_sec = inserted_count / insert_duration if insert_duration > 0 else 0

    print(f"Ingested {inserted_count} records into SQLite in {insert_duration:.3f} s ({records_per_sec:.1f} rec/s)")

    # 3. Measure DB file size
    db_size_bytes = os.path.getsize(db_filename)
    db_size_mb = db_size_bytes / (1024 * 1024)
    bytes_per_rec = db_size_bytes / inserted_count if inserted_count > 0 else 0
    print(f"SQLite DB File Size for {inserted_count} products: {db_size_mb:.2f} MB ({bytes_per_rec:.1f} bytes/record)")

    # Extrapolate for full dataset (~61,373 products)
    full_dataset_est_mb = (db_size_bytes * 61373 / inserted_count) / (1024 * 1024)
    print(f"Estimated DB size for 61,373 products: {full_dataset_est_mb:.2f} MB")

    # 4. Measure Barcode Lookup Latency (1,000 lookups)
    sample_barcodes = [p.get("barcode") for p in products if catalog.get_by_barcode(p.get("barcode")) is not None][:1000]
    
    t_lookup_start = time.time()
    for b in sample_barcodes:
        res = catalog.get_by_barcode(b)
        assert res is not None
    t_lookup_end = time.time()

    total_lookup_ms = (t_lookup_end - t_lookup_start) * 1000
    avg_lookup_ms = total_lookup_ms / len(sample_barcodes)
    qps = len(sample_barcodes) / (t_lookup_end - t_lookup_start)

    print(f"Performed {len(sample_barcodes)} barcode lookups in {total_lookup_ms:.2f} ms")
    print(f"Average barcode lookup latency: {avg_lookup_ms:.4f} ms per lookup ({qps:.1f} queries/sec)")

    # 5. Offline Text Search Benchmark
    t_search_start = time.time()
    search_res = catalog.search_by_name("Milk", limit=50)
    t_search_end = time.time()
    search_ms = (t_search_end - t_search_start) * 1000
    print(f"Offline name search ('Milk') returned {len(search_res)} results in {search_ms:.2f} ms")

    catalog.close()

    if os.path.exists(db_filename):
        os.remove(db_filename)

if __name__ == "__main__":
    run_benchmark()
