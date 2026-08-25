"""
DB033 SQLite Local Product Database Investigation Module

This module implements a safe, isolated local SQLite product catalog schema
and API to investigate moving product catalogue data to SQLite for offline capability.
"""

import json
import sqlite3
import time
from typing import Dict, Any, List, Optional
from database.clean_data.normalization.BarcodeNormalisation import BarcodeNormalisation
from mapping.map_enriched_to_product_detail import map_enriched_to_product_detail


class SQLiteProductCatalog:
    def __init__(self, db_path: str = ":memory:"):
        self.db_path = db_path
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        """Initialize local product catalog schema in SQLite."""
        with self.conn:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS local_products (
                    barcode TEXT PRIMARY KEY,
                    product_name TEXT NOT NULL,
                    brand TEXT,
                    generic_name TEXT,
                    primary_category TEXT,
                    nutriscore_grade TEXT,
                    completeness REAL,
                    ingredients_text TEXT,
                    traces TEXT,
                    product_quantity REAL,
                    product_quantity_unit TEXT,
                    serving_quantity REAL,
                    serving_quantity_unit TEXT,
                    categories_json TEXT,
                    ingredients_json TEXT,
                    allergens_json TEXT,
                    additives_json TEXT,
                    labels_json TEXT,
                    nutrient_levels_json TEXT,
                    nutriments_json TEXT,
                    images_json TEXT,
                    tags_json TEXT,
                    metadata_json TEXT,
                    date_added TEXT,
                    last_updated TEXT
                );
            """)

            # Create indexes for efficient offline lookup and filtering
            self.conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_products_brand ON local_products(brand);
            """)
            self.conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_products_category ON local_products(primary_category);
            """)
            self.conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_products_nutriscore ON local_products(nutriscore_grade);
            """)

    def insert_product(self, raw_or_enriched_product: Dict[str, Any]) -> Optional[str]:
        """
        Normalizes and maps raw/enriched product record to standard ProductDetail
        and inserts into SQLite. Returns normalized barcode or None.
        """
        mapped = map_enriched_to_product_detail(raw_or_enriched_product)
        barcode = mapped.get("barcode")
        if not barcode:
            return None

        primary_category = mapped.get("category")
        categories = mapped.get("categories", [])
        if not primary_category and categories:
            primary_category = categories[0]

        with self.conn:
            self.conn.execute("""
                INSERT OR REPLACE INTO local_products (
                    barcode, product_name, brand, generic_name, primary_category,
                    nutriscore_grade, completeness, ingredients_text, traces,
                    product_quantity, product_quantity_unit, serving_quantity, serving_quantity_unit,
                    categories_json, ingredients_json, allergens_json, additives_json, labels_json,
                    nutrient_levels_json, nutriments_json, images_json, tags_json, metadata_json,
                    date_added, last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                barcode,
                mapped.get("productName") or "Unknown Product",
                mapped.get("brand"),
                mapped.get("genericName"),
                primary_category,
                mapped.get("nutriscoreGrade"),
                mapped.get("completeness"),
                mapped.get("ingredientsText"),
                mapped.get("traces"),
                mapped.get("productQuantity"),
                mapped.get("productQuantityUnit"),
                mapped.get("servingQuantity"),
                mapped.get("servingQuantityUnit"),
                json.dumps(mapped.get("categories", [])),
                json.dumps(mapped.get("ingredients", [])),
                json.dumps(mapped.get("allergens", ["Unknown"])),
                json.dumps(mapped.get("additives", [])),
                json.dumps(mapped.get("labels", [])),
                json.dumps(mapped.get("nutrientLevels", {})),
                json.dumps(mapped.get("nutriments_normalized") or mapped.get("nutriments") or {}),
                json.dumps(mapped.get("images", {})),
                json.dumps(mapped.get("tags", {})),
                json.dumps(mapped.get("metadata", {})),
                mapped.get("dateAdded"),
                mapped.get("lastUpdated")
            ))
        return barcode

    def bulk_insert(self, products: List[Dict[str, Any]]) -> int:
        """Bulk insert product records inside a transaction for maximum speed."""
        inserted = 0
        with self.conn:
            for p in products:
                res = self.insert_product(p)
                if res:
                    inserted += 1
        return inserted

    def get_by_barcode(self, query_barcode: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves a product record by barcode, handling normalization
        (e.g., GTIN-14, padded zeros, hyphens).
        """
        normalized = BarcodeNormalisation.barcode_normalise(query_barcode)
        target_barcode = normalized if normalized else str(query_barcode).strip()

        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM local_products WHERE barcode = ?", (target_barcode,))
        row = cursor.fetchone()
        if not row:
            # Fallback: try raw barcode query
            cursor.execute("SELECT * FROM local_products WHERE barcode = ?", (str(query_barcode).strip(),))
            row = cursor.fetchone()

        if not row:
            return None

        return self._row_to_dict(row)

    def search_by_name(self, name_query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Search products by name offline."""
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT * FROM local_products WHERE product_name LIKE ? LIMIT ?",
            (f"%{name_query}%", limit)
        )
        rows = cursor.fetchall()
        return [self._row_to_dict(row) for row in rows]

    def count_products(self) -> int:
        """Returns total record count in SQLite catalog."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM local_products")
        return cursor.fetchone()[0]

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        """Converts an SQLite row back into standard ProductDetail shape."""
        d = dict(row)
        return {
            "barcode": d["barcode"],
            "productName": d["product_name"],
            "brand": d["brand"],
            "genericName": d["generic_name"],
            "category": d["primary_category"],
            "categories": json.loads(d["categories_json"] or "[]"),
            "nutriscoreGrade": d["nutriscore_grade"],
            "completeness": d["completeness"],
            "ingredientsText": d["ingredients_text"],
            "traces": d["traces"],
            "productQuantity": d["product_quantity"],
            "productQuantityUnit": d["product_quantity_unit"],
            "servingQuantity": d["serving_quantity"],
            "servingQuantityUnit": d["serving_quantity_unit"],
            "ingredients": json.loads(d["ingredients_json"] or "[]"),
            "allergens": json.loads(d["allergens_json"] or '["Unknown"]'),
            "additives": json.loads(d["additives_json"] or "[]"),
            "labels": json.loads(d["labels_json"] or "[]"),
            "nutrientLevels": json.loads(d["nutrient_levels_json"] or "{}"),
            "nutriments": json.loads(d["nutriments_json"] or "{}"),
            "images": json.loads(d["images_json"] or "{}"),
            "tags": json.loads(d["tags_json"] or "{}"),
            "metadata": json.loads(d["metadata_json"] or "{}"),
            "dateAdded": d["date_added"],
            "lastUpdated": d["last_updated"]
        }

    def close(self) -> None:
        self.conn.close()
