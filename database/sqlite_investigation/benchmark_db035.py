"""
DB035 Benchmark and Comparative Analysis Script for Local Database Update Strategies
Measures network payload size, execution duration, and resource consumption
for Full Database Replacement vs Incremental Delta Updates.
"""

import json
import os
import sqlite3
import time
from database.sqlite_investigation.local_db_update_strategy import (
    VersionedProductCatalog,
    simulate_full_replacement
)


def run_update_strategy_benchmark():
    print("=== DB035 Local Database Update Strategy Benchmark ===")

    # 1. Load sample dataset (5,000 products)
    sample_5k_path = "database/seeding/products_5k_test.json"
    if not os.path.exists(sample_5k_path):
        print(f"Sample 5k file missing: {sample_5k_path}")
        return

    with open(sample_5k_path, "r", encoding="utf-8") as f:
        products = json.load(f)

    db_active_path = "database/sqlite_investigation/benchmark_active_db035.db"
    db_snapshot_path = "database/sqlite_investigation/benchmark_snapshot_db035.db"

    for p in (db_active_path, db_snapshot_path):
        if os.path.exists(p):
            os.remove(p)

    # Initialize Active DB (Version 100)
    catalog = VersionedProductCatalog(db_active_path)
    catalog.bulk_insert(products[:4900])
    catalog.set_metadata("data_version", "100")
    active_size_bytes = os.path.getsize(db_active_path)
    print(f"Active DB Size (4,900 products, v100): {active_size_bytes / (1024 * 1024):.2f} MB")

    # -------------------------------------------------------------
    # Strategy A: Incremental (Delta) Update Simulation (v100 -> v101)
    # Updating 50 existing products + Adding 100 new products + Deleting 10 products
    # -------------------------------------------------------------
    delta_payload = {
        "from_version": 100,
        "to_version": 101,
        "added_or_updated": products[4850:5000],  # 50 updates + 100 new
        "deleted_barcodes": [p.get("barcode") for p in products[:10] if p.get("barcode")]
    }

    payload_json_bytes = len(json.dumps(delta_payload).encode("utf-8"))
    payload_json_kb = payload_json_bytes / 1024

    t0_delta = time.time()
    delta_success = catalog.apply_incremental_delta(delta_payload)
    t1_delta = time.time()
    delta_duration_ms = (t1_delta - t0_delta) * 1000

    print("\n--- Strategy A: Incremental (Delta) Update ---")
    print(f"Network Payload Size: {payload_json_kb:.2f} KB")
    print(f"Update Execution Time: {delta_duration_ms:.2f} ms")
    print(f"Update Success Status: {delta_success}")
    print(f"Updated Product Count: {catalog.count_products()} records")
    _, current_data_v = catalog.get_catalog_version()
    print(f"New Catalog Version: {current_data_v}")

    catalog.close()

    # -------------------------------------------------------------
    # Strategy B: Full Database Replacement Simulation (v100 -> v101)
    # -------------------------------------------------------------
    snapshot_catalog = VersionedProductCatalog(db_snapshot_path)
    snapshot_catalog.bulk_insert(products[:5000])
    snapshot_catalog.set_metadata("data_version", "101")
    snapshot_catalog.close()

    full_payload_bytes = os.path.getsize(db_snapshot_path)
    full_payload_mb = full_payload_bytes / (1024 * 1024)

    t0_swap = time.time()
    swap_success = simulate_full_replacement(db_active_path, db_snapshot_path)
    t1_swap = time.time()
    swap_duration_ms = (t1_swap - t0_swap) * 1000

    print("\n--- Strategy B: Full Database Replacement ---")
    print(f"Network Payload Size: {full_payload_mb:.2f} MB")
    print(f"Swap Execution Time: {swap_duration_ms:.2f} ms")
    print(f"Swap Success Status: {swap_success}")

    # Summary comparison
    size_reduction_ratio = (full_payload_bytes - payload_json_bytes) / full_payload_bytes * 100
    print("\n=== Comparative Summary ===")
    print(f"Incremental Update reduces network bandwidth by {size_reduction_ratio:.2f}% relative to full DB replacement.")

    # Cleanup
    for p in (db_active_path, db_snapshot_path):
        if os.path.exists(p):
            os.remove(p)


if __name__ == "__main__":
    run_update_strategy_benchmark()
