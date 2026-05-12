"""
Legacy minimal batch uploader. For production and the pipeline, use
``seed_firestore.run`` (see ``seed_products.py`` and ``pipeline.config.json``).
"""

import json
import os
import sys
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core import retry

_BASE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.abspath(os.path.join(_BASE, "..", ".."))
if _REPO not in sys.path:
    sys.path.insert(0, _REPO)

from database.seeding.batch_limits import resolve_max_writes_per_run

PRODUCTS_COLLECTION = "products"


@retry.Retry(predicate=retry.if_exception_type(Exception), initial=1, maximum=16, multiplier=2, deadline=60)
def _commit_batch(batch):
    batch.commit()


class BatchSeeder:
    def __init__(self, key_path="serviceAccountKey.json"):
        if not firebase_admin._apps:
            cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(cred)
        self.db = firestore.client()

    def seed_data(self, json_file_path: str, max_writes_per_run: Optional[int] = None) -> None:
        max_cap = resolve_max_writes_per_run({"max_writes_per_run": max_writes_per_run})
        with open(json_file_path, "r", encoding="utf-8") as f:
            products = json.load(f)

        total_records = len(products)
        batch_size = 500
        total_written = 0
        print(f"Starting batch seed: {total_records} records (collection={PRODUCTS_COLLECTION}).")
        cap_msg = "unlimited" if max_cap is None else str(max_cap)
        print(f"max_writes_per_run: {cap_msg}")

        for i in range(0, total_records, batch_size):
            batch = self.db.batch()
            chunk = products[i : i + batch_size]

            for product in chunk:
                barcode = product.get("barcode")
                if not barcode:
                    continue

                doc_ref = self.db.collection(PRODUCTS_COLLECTION).document(str(barcode))
                batch.set(doc_ref, product, merge=True)

            try:
                _commit_batch(batch)
                total_written += len(chunk)
                progress = min(i + batch_size, total_records)
                pct = 100.0 * progress / total_records if total_records else 0.0
                print(f"Committed up to {progress}/{total_records} records ({pct:.1f}%).")
            except Exception as e:
                print(f"Error: batch starting at index {i} failed: {e}")
                raise

            if max_cap is not None and total_written >= max_cap:
                print(f"Stopped at max_writes_per_run ({max_cap}).")
                break

        print("Seeding completed successfully.")


if __name__ == "__main__":
    seeder = BatchSeeder()
    seeder.seed_data(os.path.join(_BASE, "products_enriched.json"))
