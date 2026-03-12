## Category Harmonisation

from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Set, Union
from collections import Counter
import json
import logging
import math
import os
import re

import pandas as pd

# Logging Setup
logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


# CONFIG — Raw → Unified Mapping
@dataclass
class CategoryConfig:
    """
    Configuration for DB003 category harmonisation.

    Attributes
    ----------
    mapping_raw_to_unified:
        Dict mapping raw category labels (lowercased and normalised)
        to unified category labels.

    allowed_unified_categories:
        Optional set of allowed unified categories. If provided, unified
        categories not in the set will be dropped or mapped to fallback.

    fallback_category:
        Optional category to use when a mapping cannot be found or validated.
    """

    mapping_raw_to_unified: Dict[str, str]
    allowed_unified_categories: Optional[Set[str]] = None
    fallback_category: Optional[str] = None


# Mapping based on cleanSample data
RAW_TO_UNIFIED: Dict[str, str] = {
    # Tuna / canned fish
    "seafood": "Seafood",
    "fishes-and-their-products": "Seafood",
    "fishes": "Seafood",
    "fatty-fishes": "Seafood",
    "canned-foods": "Canned Foods",
    "canned-fishes": "Canned Fish",
    "tunas": "Canned Tuna",
    "canned-tunas": "Canned Tuna",

    # Oils & fats
    "fats": "Cooking Oils & Fats",
    "vegetable-fats": "Cooking Oils & Fats",
    "vegetable-oils": "Cooking Oils & Fats",

    # Meal kits
    "meal-kits": "Meal Kits",

    # Peanut butter / spreads
    "spreads": "Spreads",
    "plant-based-spreads": "Spreads",
    "nut-butters": "Nut & Seed Spreads",
    "peanut-butters": "Nut & Seed Spreads",

    # Sweet spreads (Nutella-like)
    "sweet-spreads": "Chocolate & Sweet Spreads",
    "hazelnut-spreads": "Chocolate & Sweet Spreads",
    "chocolate-spreads": "Chocolate & Sweet Spreads",

    # Prawns / shrimps
    "crustaceans": "Seafood – Prawns",
    "shrimps": "Seafood – Prawns",
    "prawns": "Seafood – Prawns",

    # Noodles / pasta
    "pastas": "Pasta & Noodles",
    "noodles": "Pasta & Noodles",
    "instant-noodles": "Instant Noodles",

    # Beverages / coffee drinks
    "beverages": "Beverages",
    "soft-drinks": "Soft Drinks",
    "carbonated-drinks": "Soft Drinks",
    "coffee-drinks": "Iced Coffee Drinks",
    "coffee-milks": "Iced Coffee Drinks",
    "iced-coffees": "Iced Coffee Drinks",

    # Bread
    "breads": "Bread",
    "wholemeal-breads": "Wholemeal Bread",

    # Chocolates & snacks
    "snacks": "Snacks",
    "sweet-snacks": "Sweet Snacks",
    "confectioneries": "Chocolates & Confectionery",
    "chocolates": "Chocolates & Confectionery",
    "chocolate-candies": "Chocolates & Confectionery",
}

# Allowed unified categories (used for validation)
ALLOWED_UNIFIED: Set[str] = {
    "Seafood",
    "Canned Foods",
    "Canned Fish",
    "Canned Tuna",
    "Cooking Oils & Fats",
    "Meal Kits",
    "Spreads",
    "Nut & Seed Spreads",
    "Chocolate & Sweet Spreads",
    "Seafood – Prawns",
    "Pasta & Noodles",
    "Instant Noodles",
    "Beverages",
    "Soft Drinks",
    "Iced Coffee Drinks",
    "Bread",
    "Wholemeal Bread",
    "Snacks",
    "Sweet Snacks",
    "Chocolates & Confectionery",
}

DEFAULT_CONFIG = CategoryConfig(
    mapping_raw_to_unified=RAW_TO_UNIFIED,
    allowed_unified_categories=ALLOWED_UNIFIED,
    fallback_category="Other",
)

# Helper Functions
# Accept language prefixes like 'en:', 'fr:', and region tags like 'en-GB:' (case-insensitive)
LANG_PREFIX_RE = re.compile(r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,6})?:")

def strip_lang_prefix(tag: str) -> str:
    """Removes language prefixes such as 'en:', 'fr:' from category strings."""
    if not isinstance(tag, str):
        return ""
    return LANG_PREFIX_RE.sub("", tag.strip())

def normalise_raw_label(label: str) -> str:
    """
    Normalises raw category labels before mapping:
    - Removes language prefixes.
    - Converts to lowercase.
    - Replaces symbols: '>', '/', '|' with spaces.
    - Collapses multiple spaces.
    """
    if not isinstance(label, str):
        return ""

    label = strip_lang_prefix(label)
    label = label.strip().lower()
    if not label:
        return ""

    label = (
        label.replace(">", " ")
             .replace("/", " ")
             .replace("|", " ")
    )
    label = re.sub(r"\s+", " ", label)

    return label

def apply_naming_rules(unified_label: str) -> str:
    """
    Applies standard naming rules to unified category labels:
    - Trim whitespace
    - Collapse spaces
    - Convert to Title Case
    - Replace " And " with " & "
    """
    if not unified_label:
        return ""

    unified_label = unified_label.strip()
    unified_label = re.sub(r"\s+", " ", unified_label)
    unified_label = unified_label.title()
    unified_label = unified_label.replace(" And ", " & ")

    return unified_label

def map_raw_to_unified(raw_label: str, config: CategoryConfig) -> Optional[str]: # Maps a single raw category label to a unified category label.
    norm = normalise_raw_label(raw_label)
    if not norm:
        return None

    mapped = config.mapping_raw_to_unified.get(norm)
    if mapped:
        unified = apply_naming_rules(mapped)
    else:
        unified = apply_naming_rules(norm)

    if config.allowed_unified_categories is not None:  # Normalise allowed categories to the same naming rules used for produced unified labels so comparisons are consistent.
        allowed_normalised = {apply_naming_rules(a) for a in config.allowed_unified_categories}
        if unified not in allowed_normalised:
            if config.fallback_category:
                return apply_naming_rules(config.fallback_category)
            return None

    return unified

# Apply to a Single Product
def harmonise_categories_for_product(
    raw_categories: Union[Iterable[str], str, float, None],
    config: CategoryConfig = DEFAULT_CONFIG,
) -> List[str]: #  Normalises category data for a single product.
    
    if raw_categories is None: # handle None / NaN
        return []
    if isinstance(raw_categories, float) and math.isnan(raw_categories):
        return []

    items: List[str] = []

    if isinstance(raw_categories, str):  # Split on common separators
        parts = [p for p in re.split(r"[,\|;/>]", raw_categories) if p.strip()]
        items.extend(parts)
    elif isinstance(raw_categories, Iterable):
        for v in raw_categories:
            if v is not None:
                items.append(str(v))
    else:
        return []

    unified_set: Set[str] = set()

    for raw in items:
        uni = map_raw_to_unified(raw, config)
        if uni:
            unified_set.add(uni)
        else:
            # record unknown raw categories for logging/analytics
            try:
                norm = normalise_raw_label(raw)
            except Exception:
                norm = str(raw)
            _record_unknown_category(norm)
            # if a fallback is configured, add it so downstream logic has at least one category
            if config.fallback_category:
                unified_set.add(apply_naming_rules(config.fallback_category))

    return sorted(unified_set)


# Apply to DataFrame
def harmonise_categories_df(
    df: pd.DataFrame,
    source_col: str = "categories",
    unified_col: str = "categoriesUnified",
    primary_col: str = "primaryCategory",
    config: CategoryConfig = DEFAULT_CONFIG,
) -> pd.DataFrame:  # Applies harmonisation to an entire DataFrame.
    if source_col not in df.columns:
        logger.warning(f"Column '{source_col}' not found. DB003 skipped.")
        return df

    logger.info(
        f"Running category harmonisation on column '{source_col}' "
        f"(rows={len(df)})")

    df[unified_col] = df[source_col].apply(
        lambda cats: harmonise_categories_for_product(cats, config=config))

    # Priority-based selection for primary category. Higher number = higher priority.
    CATEGORY_PRIORITY: Dict[str, int] = {
        # Assign priorities so more semantically meaningful categories are chosen as primary
        "Canned Tuna": 90,
        "Canned Fish": 85,
        "Seafood": 80,
        "Meal Kits": 70,
        "Pasta & Noodles": 60,
        "Instant Noodles": 60,
        "Beverages": 50,
        "Soft Drinks": 45,
        "Iced Coffee Drinks": 55,
        "Bread": 50,
        "Wholemeal Bread": 55,
        "Snacks": 40,
        "Sweet Snacks": 35,
        "Chocolates & Confectionery": 30,
        "Cooking Oils & Fats": 20,
        "Spreads": 25,
        "Nut & Seed Spreads": 25,
        "Chocolate & Sweet Spreads": 25,
    }

    def choose_primary(unified_list: List[str]) -> Optional[str]:
        if not unified_list:
            return apply_naming_rules(config.fallback_category) if config.fallback_category else None
        # pick highest priority unified label; default priority = 0
        best = None
        best_p = -1
        for u in unified_list:
            p = CATEGORY_PRIORITY.get(u, 0)
            if p > best_p:
                best_p = p
                best = u
        return best or unified_list[0]

    df[primary_col] = df[unified_col].apply(choose_primary)

    # Derive a higher-level nutrition profile type based on primaryCategory
    CATEGORY_TO_PROFILE: Dict[str, str] = {
        "Beverages": "Beverage",
        "Soft Drinks": "Beverage",
        "Iced Coffee Drinks": "Beverage",
        "Seafood": "Meal",
        "Canned Fish": "Meal",
        "Canned Tuna": "Meal",
        "Meal Kits": "Meal",
        "Pasta & Noodles": "Meal",
        "Instant Noodles": "Meal",
        "Bread": "Staple",
        "Wholemeal Bread": "Staple",
        "Snacks": "Snack",
        "Sweet Snacks": "Snack",
        "Chocolates & Confectionery": "Snack",
        "Cooking Oils & Fats": "Oil",
        "Spreads": "Staple",
        "Nut & Seed Spreads": "Staple",
        "Chocolate & Sweet Spreads": "Snack",
    }

    def map_primary_to_profile(primary: Optional[str]) -> str:
        if not primary:
            return "General"
        return CATEGORY_TO_PROFILE.get(primary, "General")

    df["nutritionProfileType"] = df[primary_col].apply(map_primary_to_profile)

    empty_count = df[unified_col].apply(lambda x: len(x) == 0).sum()
    logger.info(
        f"Empty unified categories: {empty_count}/{len(df)} "
        f"({100 * empty_count / max(len(df), 1):.2f}%)"
    )

    # Log top unknown raw categories for future mapping improvements
    top_unknowns = get_top_unknowns(20)
    if top_unknowns:
        logger.info(f"Top unknown raw categories (sample): {top_unknowns}")

    return df


# --- Unknown categories aggregation for continuous improvement ---
_unknown_counter: Counter = Counter()

def _record_unknown_category(norm_label: str) -> None:
    try:
        _unknown_counter.update([norm_label])
    except Exception:
        pass

def get_top_unknowns(n: int = 20):
    return _unknown_counter.most_common(n)

def dump_unknowns(path: str):
    try:
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(_unknown_counter.most_common(), fh, ensure_ascii=False, indent=2)
        logger.info(f"Wrote unknown categories to {path}")
    except Exception as e:
        logger.warning(f"Failed to write unknown categories to {path}: {e}")

    return df
