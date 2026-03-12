import json
import os
from typing import Any, Iterable, List


def load_json_records(path: str) -> Any:
    """
    Load JSON records from file.
    Supports list or dict JSON structures.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"Input JSON not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json_records(path: str, records: Any) -> None:
    """
    Write JSON records to file.
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)


def chunk_records(records: Any, size: int) -> Iterable[List[Any]]:
    """
    Yield records in chunks.

    FIXED:
    - Accepts list or dict
    - Dicts are chunked by values
    """

    if records is None:
        return

    # FIX: dict → list of values
    if isinstance(records, dict):
        records = list(records.values())

    if not isinstance(records, list):
        raise TypeError(
            f"chunk_records expected list or dict, got {type(records)}"
        )

    for i in range(0, len(records), size):
        yield records[i:i + size]




