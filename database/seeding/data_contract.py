"""Shared access to the persisted product data contract.

The Firestore collection name already belongs to ``schema_definition.json``.
Seeders and release checks load it here so a later merge cannot silently restore
a different collection name in one code path.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


SCHEMA_DEFINITION = Path(__file__).with_name("schema_definition.json")


@lru_cache(maxsize=1)
def load_product_contract() -> dict[str, Any]:
    """Load and minimally validate the committed product schema contract."""
    with SCHEMA_DEFINITION.open("r", encoding="utf-8") as handle:
        contract = json.load(handle)

    collection = contract.get("collection")
    document_id = contract.get("document_id")
    if not isinstance(collection, str) or not collection.strip():
        raise ValueError("schema_definition.json requires a non-empty collection")
    if not isinstance(document_id, str) or not document_id.strip():
        raise ValueError("schema_definition.json requires a non-empty document_id")
    return contract


PRODUCTS_COLLECTION = str(load_product_contract()["collection"])
PRODUCT_DOCUMENT_ID = str(load_product_contract()["document_id"])
