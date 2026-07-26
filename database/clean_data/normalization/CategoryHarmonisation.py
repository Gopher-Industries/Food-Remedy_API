## Category Harmonisation (DB027 — Product Category Harmonisation)

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
    Configuration for DB027 category harmonisation (raw labels → unified taxonomy).

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
    "bonbons": "Chocolates & Confectionery",

    # Extra OFF-style tags (formerly covered by legacy keyword matching)
    "dairy-drinks": "Beverages",
    "sweetened-beverages": "Soft Drinks",
    "evaporated-milks": "Beverages",
    "cocoa-and-hazelnuts-spreads": "Chocolate & Sweet Spreads",
    "oilseed-purees": "Nut & Seed Spreads",
    "legume-butters": "Nut & Seed Spreads",
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

# Priority-based selection for primary category. Higher number = higher priority.
# Every ALLOWED_UNIFIED label has an explicit priority so specificity wins consistently.
CATEGORY_PRIORITY: Dict[str, int] = {
    "Canned Tuna": 90,
    "Canned Fish": 88,
    "Seafood – Prawns": 86,
    "Seafood": 80,
    "Canned Foods": 76,
    "Meal Kits": 72,
    "Instant Noodles": 65,
    "Pasta & Noodles": 62,
    "Iced Coffee Drinks": 58,
    "Wholemeal Bread": 56,
    "Beverages": 52,
    "Bread": 50,
    "Soft Drinks": 54,
    "Snacks": 42,
    "Sweet Snacks": 44,
    "Chocolates & Confectionery": 34,
    "Spreads": 28,
    "Nut & Seed Spreads": 30,
    "Chocolate & Sweet Spreads": 30,
    "Cooking Oils & Fats": 22,
    "Other": 0,
}

# Derive a higher-level nutrition profile type based on primaryCategory.
CATEGORY_TO_PROFILE: Dict[str, str] = {
    "Beverages": "Beverage",
    "Soft Drinks": "Beverage",
    "Iced Coffee Drinks": "Beverage",
    "Seafood": "Meal",
    "Seafood – Prawns": "Meal",
    "Canned Foods": "Meal",
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

def map_raw_to_unified(
    raw_label: str,
    config: CategoryConfig,
    allow_fallback: bool = True,
) -> Optional[str]: # Maps a single raw category label to a unified category label.
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
            if allow_fallback and config.fallback_category:
                return apply_naming_rules(config.fallback_category)
            return None

    return unified


def select_primary_category(unified_categories: List[str], config: CategoryConfig = DEFAULT_CONFIG) -> Optional[str]:
    """Pick exactly one canonical category from a harmonised category list."""
    if not unified_categories:
        return apply_naming_rules(config.fallback_category) if config.fallback_category else None

    best_category = None
    best_priority = -1

    for category in unified_categories:
        priority = CATEGORY_PRIORITY.get(category, 0)
        if priority > best_priority:
            best_priority = priority
            best_category = category

    return best_category or unified_categories[0]


def map_primary_to_profile(primary: Optional[str]) -> str:
    if not primary:
        return "General"
    return CATEGORY_TO_PROFILE.get(primary, "General")

# Apply to a Single Product
def harmonise_categories_for_product(
    raw_categories: Union[Iterable[str], str, float, None],
    config: CategoryConfig = DEFAULT_CONFIG,
) -> List[str]: #  Normalises category data for a single product.
    
    if raw_categories is None: # handle None / NaN
        return [apply_naming_rules(config.fallback_category)] if config.fallback_category else []
    if isinstance(raw_categories, float) and math.isnan(raw_categories):
        return [apply_naming_rules(config.fallback_category)] if config.fallback_category else []

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
        uni = map_raw_to_unified(raw, config, allow_fallback=False)
        if uni:
            unified_set.add(uni)
        else:
            # record unknown raw categories for logging/analytics
            try:
                norm = normalise_raw_label(raw)
            except Exception:
                norm = str(raw)
            _record_unknown_category(norm)

    if unified_set:
        return sorted(unified_set)

    if config.fallback_category:
        return [apply_naming_rules(config.fallback_category)]

    return []


# Apply to DataFrame
def harmonise_categories_df(
    df: pd.DataFrame,
    source_col: str = "categories",
    unified_col: str = "categoriesUnified",
    primary_col: str = "primaryCategory",
    config: CategoryConfig = DEFAULT_CONFIG,
) -> pd.DataFrame:  # Applies harmonisation to an entire DataFrame.
    if source_col not in df.columns:
        logger.warning(f"Column '{source_col}' not found. DB027 harmonisation skipped.")
        return df

    logger.info(
        f"Running category harmonisation on column '{source_col}' "
        f"(rows={len(df)})")

    df[unified_col] = df[source_col].apply(
        lambda cats: harmonise_categories_for_product(cats, config=config))

    df[primary_col] = df[unified_col].apply(lambda categories: select_primary_category(categories, config=config))

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

