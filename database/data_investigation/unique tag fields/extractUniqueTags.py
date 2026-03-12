#!/usr/bin/env python3
"""
Extract unique tags from an Open Food Facts JSONL file.
Writes a single combined JSON file with per-field unique lists.
"""

import json
import pathlib
from typing import Any, Dict, List, Set

# ==== CONFIG ====
INPUT_FILE = pathlib.Path(
    r"data\\data fields\\unique tag fields\\sample.jsonl")
OUTPUT_FILE = pathlib.Path(
    r"data\\data fields\\unique tag fields\\unique_tags_all.json")
STRIP_PREFIXES = True  # set False if you want to keep e.g. "en:milk"
# =================

LIST_TAG_COLS = (
    "additives_tags",
    "allergens_tags",
    "ingredients_analysis_tags",
    "labels_tags",
)
NUTRIENT_LEVELS_COL = "nutrient_levels"


def as_list(value: Any) -> List[str]:
    """Coerce a value to a list of strings."""
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        parts = [p.strip() for p in value.split(",")]
        return [p for p in parts if p]
    return []


def strip_prefix(tag: str) -> str:
    """Remove language or other prefixes like 'en:sugar' -> 'sugar'."""
    if not isinstance(tag, str):
        return ""
    tag = tag.strip()
    if not tag:
        return ""
    if ":" in tag:
        return tag.split(":", 1)[1].strip()
    return tag


def extract_unique_tags(input_path: pathlib.Path) -> Dict[str, List[str]]:
    uniques: Dict[str, Set[str]] = {col: set() for col in LIST_TAG_COLS}
    nl_keys: Set[str] = set()
    nl_values: Set[str] = set()
    nl_combined: Set[str] = set()

    with input_path.open("r", encoding="utf-8") as f:
        for idx, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                # skip bad lines quietly
                continue

            # List-like tag columns
            for col in LIST_TAG_COLS:
                if col in obj:
                    for tag in as_list(obj[col]):
                        tag_norm = strip_prefix(
                            tag) if STRIP_PREFIXES else tag.strip()
                        if tag_norm:
                            uniques[col].add(tag_norm)

            # Nutrient levels dict
            if NUTRIENT_LEVELS_COL in obj and isinstance(obj[NUTRIENT_LEVELS_COL], dict):
                for k, v in obj[NUTRIENT_LEVELS_COL].items():
                    k_s = str(k).strip()
                    v_s = str(v).strip()
                    if STRIP_PREFIXES and ":" in k_s:
                        k_s = k_s.split(":", 1)[1].strip()
                    if k_s:
                        nl_keys.add(k_s)
                    if v_s:
                        nl_values.add(v_s)
                    if k_s and v_s:
                        nl_combined.add(f"{k_s}:{v_s}")

    # Build one combined JSON object with sorted lists
    result: Dict[str, List[str]] = {col: sorted(
        vals) for col, vals in uniques.items()}
    result["nutrient_levels.keys"] = sorted(nl_keys)
    result["nutrient_levels.values"] = sorted(nl_values)
    result["nutrient_levels.combined"] = sorted(nl_combined)
    return result


def main():
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    result = extract_unique_tags(INPUT_FILE)
    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
