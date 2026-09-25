"""
DB035 Local Database Update Strategy Investigation Module

This module implements and simulates update mechanisms for on-device SQLite product catalog databases,
comparing Full Database Replacement vs Incremental (Delta) Updates, tracking versioning metadata,
and handling failure/rollback scenarios safely.
"""

import json
import os
import sqlite3
import time
from typing import Dict, Any, List, Optional, Tuple
from database.clean_data.normalization.BarcodeNormalisation import BarcodeNormalisation
from mapping.map_enriched_to_product_detail import map_enriched_to_product_detail
from database.sqlite_investigation.sqlite_product_catalog import SQLiteProductCatalog


class VersionedProductCatalog(SQLiteProductCatalog):
    """
    Extends SQLiteProductCatalog with version tracking and transactional update capabilities.
    """

    def __init__(self, db_path: str = ":memory:"):
        super().__init__(db_path)
        self._init_version_metadata()

    def _init_version_metadata(self) -> None:
        """Initialize metadata table for catalog versioning and sync state."""
        with self.conn:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS catalog_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)
            # Initialize defaults if not present
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            self.conn.execute("""
                INSERT OR IGNORE INTO catalog_metadata (key, value, updated_at)
                VALUES ('schema_version', '1', ?);
            """, (now,))
            self.conn.execute("""
                INSERT OR IGNORE INTO catalog_metadata (key, value, updated_at)
                VALUES ('data_version', '100', ?);
            """, (now,))
            self.conn.execute("""
                INSERT OR IGNORE INTO catalog_metadata (key, value, updated_at)
                VALUES ('last_sync_timestamp', ?, ?);
            """, (now, now))

    def get_metadata(self, key: str) -> Optional[str]:
        """Fetch metadata value for a given key."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT value FROM catalog_metadata WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row[0] if row else None

    def set_metadata(self, key: str, value: str) -> None:
        """Set metadata value for a given key."""
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with self.conn:
            self.conn.execute("""
                INSERT OR REPLACE INTO catalog_metadata (key, value, updated_at)
                VALUES (?, ?, ?);
            """, (key, str(value), now))

    def get_catalog_version(self) -> Tuple[int, int]:
        """Returns tuple of (schema_version, data_version)."""
        schema_v = int(self.get_metadata("schema_version") or "1")
        data_v = int(self.get_metadata("data_version") or "100")
        return schema_v, data_v

    def apply_incremental_delta(self, delta_payload: Dict[str, Any]) -> bool:
        """
        Applies an incremental update payload atomically using SQLite SAVEPOINT.
        Payload format:
        {
            "from_version": 100,
            "to_version": 101,
            "added_or_updated": [...product records...],
            "deleted_barcodes": [...list of barcodes...]
        }
        Returns True if update succeeded, False if version mismatch or failed.
        """
        current_schema_v, current_data_v = self.get_catalog_version()
        from_v = delta_payload.get("from_version")
        to_v = delta_payload.get("to_version")

        if from_v != current_data_v:
            # Version mismatch - incremental update cannot be safely applied
            return False

        self.conn.execute("SAVEPOINT delta_sp;")
        try:
            # 1. Upsert added/updated products
            for prod in delta_payload.get("added_or_updated", []):
                self.insert_product(prod)

            # 2. Process deletions/corrections
            for barcode in delta_payload.get("deleted_barcodes", []):
                norm = BarcodeNormalisation.barcode_normalise(barcode)
                target = norm if norm else str(barcode).strip()
                self.conn.execute("DELETE FROM local_products WHERE barcode = ?", (target,))

            # 3. Update version metadata
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            self.conn.execute(
                "INSERT OR REPLACE INTO catalog_metadata (key, value, updated_at) VALUES ('data_version', ?, ?);",
                (str(to_v), now)
            )
            self.conn.execute(
                "INSERT OR REPLACE INTO catalog_metadata (key, value, updated_at) VALUES ('last_sync_timestamp', ?, ?);",
                (now, now)
            )

            self.conn.execute("RELEASE delta_sp;")
            return True
        except Exception:
            self.conn.execute("ROLLBACK TO delta_sp;")
            self.conn.execute("RELEASE delta_sp;")
            return False

    def simulate_failed_delta_with_rollback(self, corrupt_payload: Dict[str, Any]) -> bool:
        """
        Simulates an invalid/corrupt delta application to demonstrate atomic transaction rollback.
        """
        _, initial_v = self.get_catalog_version()
        initial_count = self.count_products()

        self.conn.execute("SAVEPOINT test_sp;")
        try:
            # Insert valid record
            if corrupt_payload.get("valid_product"):
                self.insert_product(corrupt_payload["valid_product"])

            # Trigger intentional error (e.g. malformed constraint or syntax error)
            if corrupt_payload.get("trigger_fault"):
                self.conn.execute("INSERT INTO non_existent_table VALUES (1);")

            # Update version
            self.set_metadata("data_version", str(initial_v + 1))
            self.conn.execute("RELEASE test_sp;")
            return True
        except sqlite3.Error:
            self.conn.execute("ROLLBACK TO test_sp;")
            self.conn.execute("RELEASE test_sp;")

            _, end_v = self.get_catalog_version()
            end_count = self.count_products()

            # Confirm state was completely restored
            assert end_v == initial_v
            assert end_count == initial_count
            return False


def simulate_full_replacement(active_db_path: str, new_snapshot_path: str) -> bool:
    """
    Simulates atomic full database replacement on client storage.
    Uses temporary stage file and atomic file replace (os.replace).
    """
    if not os.path.exists(new_snapshot_path):
        return False

    # Integrity check on new database before replacing active database
    try:
        conn = sqlite3.connect(new_snapshot_path)
        cursor = conn.cursor()
        cursor.execute("PRAGMA quick_check;")
        res = cursor.fetchone()[0]
        conn.close()

        if res != "ok":
            return False

        # Atomic file replacement
        os.replace(new_snapshot_path, active_db_path)
        return True
    except Exception:
        return False
