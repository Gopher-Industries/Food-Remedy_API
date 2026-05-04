"""
DB012 Firestore integration checks: barcode lookup, category filter, recommendation-style query.

Collection name matches seed_firestore (`products`) by default.
Override with env FIRESTORE_PRODUCTS_COLLECTION if your project uses another id (e.g. PRODUCTS).
"""
from __future__ import annotations

import os
import sys
from typing import Optional

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from database.logging_system.logger import PipelineLogger

logger = PipelineLogger("INTEGRATION_TEST")


def _resolve_service_account_path(explicit: Optional[str] = None) -> str:
    if explicit and os.path.isfile(explicit):
        return os.path.abspath(explicit)
    for env_key in ("GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_SERVICE_ACCOUNT_KEY"):
        env_path = os.environ.get(env_key)
        if env_path and os.path.isfile(env_path.strip().strip('"')):
            return os.path.abspath(env_path.strip().strip('"'))
    for candidate in (
        os.path.join(os.getcwd(), "serviceAccountKey.json"),
        os.path.join(REPO_ROOT, "serviceAccountKey.json"),
        os.path.join(REPO_ROOT, "database", "seeding", "serviceAccountKey.json"),
    ):
        if os.path.isfile(candidate):
            return candidate
    return os.path.join(REPO_ROOT, "serviceAccountKey.json")


def _firestore_client(cred_path: str):
    if not os.path.isfile(cred_path):
        raise FileNotFoundError(f"Service account JSON not found: {cred_path}")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(cred_path))
    return firestore.client()


class DB012IntegrationTest:
    """
    Integration tests against Firestore (live project).

    Methods return bool for use in CI/scripts; log details on failure.
    """

    COLLECTION_ENV = "FIRESTORE_PRODUCTS_COLLECTION"
    DEFAULT_COLLECTION = "products"

    def __init__(self, key_path: Optional[str] = None):
        self.logger = logger
        self.collection_name = os.environ.get(
            self.COLLECTION_ENV, self.DEFAULT_COLLECTION
        )
        self.db = None
        self._init_error: Optional[BaseException] = None
        cred_path = _resolve_service_account_path(key_path)
        try:
            self.db = _firestore_client(cred_path)
            self.logger.info(
                f"Firebase initialized; collection={self.collection_name!r}"
            )
        except Exception as e:
            self._init_error = e
            self.logger.error(f"Failed to initialize Firebase: {e}")

    def _collection(self):
        if not self.db:
            raise RuntimeError("Firestore client not available")
        return self.db.collection(self.collection_name)

    def test_product_lookup(self, barcode: str) -> bool:
        self.logger.info(f"Test: lookup by barcode {barcode!r}...")
        doc = self._collection().document(barcode).get()
        if doc.exists:
            data = doc.to_dict() or {}
            self.logger.info(
                f"OK — product: {data.get('productName', 'Unknown')!r}"
            )
            return True
        self.logger.error(f"FAIL — no document for barcode {barcode!r}")
        return False

    def test_category_query(self, category: str) -> bool:
        self.logger.info(f"Test: category array_contains {category!r}...")
        docs = (
            self._collection()
            .where(filter=FieldFilter("categories", "array_contains", category))
            .limit(5)
            .stream()
        )
        results = [d.id for d in docs]
        if results:
            self.logger.info(f"OK — {len(results)} doc(s): {results}")
            return True
        self.logger.error(f"FAIL — no products with category {category!r}")
        return False

    def test_recommendation_candidates(self, grades: Optional[list[str]] = None) -> bool:
        """
        Recommendation-style query: prefer better Nutri-Score grades, fall back until hits.
        """
        grades = grades or ["a", "b", "c", "d", "e", "unknown"]
        self.logger.info(f"Test: recommendation candidates (nutriscoreGrade in {grades})...")
        for grade in grades:
            docs = (
                self._collection()
                .where(filter=FieldFilter("nutriscoreGrade", "==", grade))
                .limit(5)
                .stream()
            )
            names: list[str] = []
            for d in docs:
                data = d.to_dict() or {}
                names.append(str(data.get("productName", d.id)))
            if names:
                self.logger.info(
                    f"OK — candidates for grade {grade!r}: {names}"
                )
                return True
        self.logger.error("FAIL — no products found for any tried nutriscoreGrade")
        return False

    def test_schema_fields(self, barcode: str) -> bool:
        """Fields commonly required by mobile / cart flows."""
        self.logger.info(f"Test: mandatory fields for barcode {barcode!r}...")
        doc = self._collection().document(barcode).get()
        if not doc.exists:
            self.logger.error(f"FAIL — document missing for {barcode!r}")
            return False
        data = doc.to_dict() or {}
        required = ["productName", "nutriments", "nutriscoreGrade"]
        missing = [f for f in required if f not in data]
        if missing:
            self.logger.error(f"FAIL — missing fields: {missing}")
            return False
        self.logger.info("OK — mandatory fields present")
        return True

    def pick_category_from_barcode(self, barcode: str) -> Optional[str]:
        """Return first category tag from a product doc, if any."""
        doc = self._collection().document(barcode).get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        cats = data.get("categories")
        if isinstance(cats, list) and cats:
            return str(cats[0])
        return None

    def find_sample_with_category(self, limit: int = 400) -> tuple[Optional[str], Optional[str]]:
        """Return (barcode, first_category) from the first doc that has categories, or (None, None)."""
        try:
            for d in self._collection().limit(limit).stream():
                data = d.to_dict() or {}
                cats = data.get("categories")
                if isinstance(cats, list) and cats:
                    return d.id, str(cats[0])
        except Exception as e:
            self.logger.error(f"Could not scan for sample product: {e}")
        return None, None

    def run_all(
        self,
        sample_barcode: Optional[str] = None,
        sample_category: Optional[str] = None,
    ) -> bool:
        if not self.db:
            self.logger.error(f"Cannot run tests: {self._init_error}")
            return False

        self.logger.info("== DB012 Firestore integration ==")
        results: list[bool] = []

        barcode = sample_barcode
        if not barcode:
            bc, _cat = self.find_sample_with_category()
            if bc:
                barcode = bc
                self.logger.info(f"Auto-selected sample barcode (has categories): {barcode!r}")
            else:
                barcode = "9337951006005"
                self.logger.info(f"Fallback sample barcode: {barcode!r}")

        category = sample_category or self.pick_category_from_barcode(barcode)
        if not category:
            _, cat2 = self.find_sample_with_category()
            category = cat2
            if category:
                self.logger.info(f"Auto-selected category from another product: {category!r}")

        results.append(self.test_product_lookup(barcode))

        if category:
            results.append(self.test_category_query(category))
        else:
            self.logger.info(
                "Skip category query — no category found (set DB012_SAMPLE_CATEGORY)."
            )

        results.append(self.test_recommendation_candidates())
        results.append(self.test_schema_fields(barcode))

        ok = all(results)
        self.logger.info(
            f"== complete — {'PASS' if ok else 'FAIL'} ({sum(results)}/{len(results)} checks) =="
        )
        return ok


def main() -> int:
    barcode = os.environ.get("DB012_SAMPLE_BARCODE") or None
    category = os.environ.get("DB012_SAMPLE_CATEGORY") or None
    tester = DB012IntegrationTest()
    return 0 if tester.run_all(barcode, category) else 1


if __name__ == "__main__":
    sys.exit(main())
