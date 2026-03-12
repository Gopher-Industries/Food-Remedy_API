#!/usr/bin/env python3
"""
Import OpenFoodFacts Australia JSONL into MongoDB (data-driven backend seed).

- Reads `openfoodfacts-australia.jsonl` line-by-line (JSONL = one JSON object per line)
- Normalizes fields needed for alternatives/recommendations:
  barcode, productName, brand, categories, allergens, nutriScore, nutriments, completeness
- Upserts into MongoDB collection `products`
- Creates indexes to support fast queries (barcode/category/allergen/nutriScore)
"""

import json
import os
import sys
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from pymongo import MongoClient, UpdateOne
from pymongo.errors import BulkWriteError


# ----------------------------
# Config (override via env vars)
# ----------------------------
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGODB_DB", "foodremedy")
COL_NAME = os.getenv("MONGODB_COL", "products")

JSONL_PATH = os.getenv("OFF_JSONL_PATH", "openfoodfacts-australia.jsonl")

BATCH_SIZE = int(os.getenv("BATCH_SIZE", "1000"))
MAX_LINES = int(os.getenv("MAX_LINES", "0"))  # 0 = no limit
LOG_EVERY = int(os.getenv("LOG_EVERY", str(BATCH_SIZE * 5)))  # progress log frequency


VALID_NUTRISCORE = {"A", "B", "C", "D", "E"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def clean_tag(tag: str) -> str:
    """
    Normalize taxonomy tags like 'en:milk' -> 'milk'
    """
    tag = (tag or "").strip().lower()
    if tag.startswith("en:"):
        tag = tag[3:]
    return tag


def normalize_record(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Convert a raw OpenFoodFacts JSON object into our minimal Product document.
    Returns None if record is missing a usable barcode.
    """
    barcode = str(raw.get("code") or "").strip()
    if not barcode:
        return None

    categories = [clean_tag(x) for x in (raw.get("categories_tags") or [])]
    categories = [x for x in categories if x]
    categories = list(dict.fromkeys(categories))[:25]  # dedupe + cap

    allergens = [clean_tag(x) for x in (raw.get("allergens_tags") or [])]
    allergens = [x for x in allergens if x]
    allergens = list(dict.fromkeys(allergens))

    nutri = raw.get("nutriscore_grade")
    nutri = (str(nutri).strip().upper() if nutri else None)
    if nutri not in VALID_NUTRISCORE:
        nutri = None

    brand = (raw.get("brands") or "").split(",")[0].strip()

    doc = {
        "barcode": barcode,
        "productName": (raw.get("product_name") or "").strip(),
        "brand": brand,
        "categories": categories,
        "allergens": allergens,
        "nutriScore": nutri,
        "ingredientsText": (raw.get("ingredients_text") or "").strip(),
        "nutriments": raw.get("nutriments") or {},
        "completeness": raw.get("completeness"),
        "source": "openfoodfacts-australia.jsonl",
        "fetchedAt": utc_now(),
    }

    return doc


def build_indexes(col) -> None:
    """
    Create indexes used by FE017 queries:
    - barcode: fast lookup for scanned product
    - categories: find same-category candidates
    - allergens: filter by avoid-allergens
    - nutriScore: ranking / sorting
    """
    col.create_index("barcode", unique=True)
    col.create_index("categories")
    col.create_index("allergens")
    col.create_index("nutriScore")


def flush_batch(col, ops: List[UpdateOne]) -> Dict[str, int]:
    """
    Execute a batch of bulk upserts.
    Returns counts: {"upserted": x, "modified": y, "matched": z}
    """
    if not ops:
        return {"upserted": 0, "modified": 0, "matched": 0}

    try:
        result = col.bulk_write(ops, ordered=False)
        return {
            "upserted": int(getattr(result, "upserted_count", 0)),
            "modified": int(getattr(result, "modified_count", 0)),
            "matched": int(getattr(result, "matched_count", 0)),
        }
    except BulkWriteError as e:
        # Bulk errors can happen for duplicates etc. We keep going.
        # Most common: index violations caused by malformed duplicates.
        # We report and continue.
        print(f"[WARN] BulkWriteError: {e.details.get('writeErrors', [])[:1]}")
        return {"upserted": 0, "modified": 0, "matched": 0}


def main() -> None:
    # Basic file check
    if not os.path.exists(JSONL_PATH):
        print(f"ERROR: Dataset file not found: {JSONL_PATH}")
        sys.exit(1)

    # Connect Mongo
    client = MongoClient(MONGODB_URI)
    db = client[DB_NAME]
    col = db[COL_NAME]

    build_indexes(col)

    total_lines = 0
    parsed_ok = 0
    skipped = 0

    sum_upserted = 0
    sum_modified = 0
    sum_matched = 0

    ops: List[UpdateOne] = []

    print(f"Importing JSONL: {JSONL_PATH}")
    print(f"Mongo: {MONGODB_URI} | DB={DB_NAME} | Collection={COL_NAME}")
    print(f"BATCH_SIZE={BATCH_SIZE} | MAX_LINES={MAX_LINES or 'ALL'}")

    with open(JSONL_PATH, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            if MAX_LINES and line_no > MAX_LINES:
                break

            total_lines += 1
            line = line.strip()
            if not line:
                skipped += 1
                continue

            try:
                raw = json.loads(line)
            except Exception:
                skipped += 1
                continue

            doc = normalize_record(raw)
            if not doc:
                skipped += 1
                continue

            parsed_ok += 1

            ops.append(
                UpdateOne(
                    {"barcode": doc["barcode"]},
                    {"$set": doc},
                    upsert=True,
                )
            )

            if len(ops) >= BATCH_SIZE:
                c = flush_batch(col, ops)
                sum_upserted += c["upserted"]
                sum_modified += c["modified"]
                sum_matched += c["matched"]
                ops = []

            if LOG_EVERY and (total_lines % LOG_EVERY == 0):
                print(
                    f"Processed: {total_lines:,} lines | Valid: {parsed_ok:,} | "
                    f"Skipped: {skipped:,} | Upserted: {sum_upserted:,} | Modified: {sum_modified:,}"
                )

    # Flush remaining ops
    if ops:
        c = flush_batch(col, ops)
        sum_upserted += c["upserted"]
        sum_modified += c["modified"]
        sum_matched += c["matched"]

    print("\nDONE")
    print(f"Total lines read: {total_lines:,}")
    print(f"Valid records:    {parsed_ok:,}")
    print(f"Skipped lines:    {skipped:,}")
    print(f"Upserted:         {sum_upserted:,}")
    print(f"Modified:         {sum_modified:,}")
    print(f"Mongo count:      {col.count_documents({}):,}")


if __name__ == "__main__":
    main()