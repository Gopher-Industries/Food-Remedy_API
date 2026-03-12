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
    mapping_raw_to_unified: Dict[str, str]
    allowed_unified_categories: Optional[Set[str]] = None
    fallback_category: Optional[str] = None


RAW_TO_UNIFIED: Dict[str, str] = {
    "seafood": "Seafood",
    "fishes-and-their-products": "Seafood",
    "fishes": "Seafood",
    "fatty-fishes": "Seafood",
    "canned-foods": "Canned Foods",
    "canned-fishes": "Canned Fish",
    "tunas": "Canned Tuna",
    "canned-tunas": "Canned Tuna",
    "fats": "Cooking Oils & Fats",
    "vegetable-fats": "Cooking Oils & Fats",
    "vegetable-oils": "Cooking Oils & Fats",
    "meal-kits": "Meal Kits",
    "spreads": "Spreads",
    "plant-based-spreads": "Spreads",
    "nut-butters": "Nut & Seed Spreads",
    "peanut-butters": "Nut & Seed Spreads",
    "sweet-spreads": "Chocolate & Sweet Spreads",
    "hazelnut-spreads": "Chocolate & Sweet Spreads",
    "chocolate-spreads": "Chocolate & Sweet Spreads",
    "crustaceans": "Seafood – Prawns",
    "shrimps": "Seafood – Prawns",
    "prawns": "Seafood – Prawns",
    "pastas": "Pasta & Noodles",
    "noodles": "Pasta & Noodles",
    "instant-noodles": "Instant Noodles",
    "beverages": "Beverages",
    "soft-drinks": "Soft Drinks",
    "carbonated-drinks": "Soft Drinks",
    "coffee-drinks": "Iced Coffee Drinks",
    "coffee-milks": "Iced Coffee Drinks",
    "iced-coffees": "Iced Coffee Drinks",
    "breads": "Bread",
    "wholemeal-breads": "Wholemeal Bread",
    "snacks": "Snacks",
    "sweet-snacks": "Sweet Snacks",
    "confectioneries": "Chocolates & Confectionery",
    "chocolates": "Chocolates & Confectionery",
    "chocolate-candies": "Chocolates & Confectionery",
}

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

LANG_PREFIX_RE = re.compile(r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,6})?:")

def strip_lang_prefix(tag: str) -> str:
    if not isinstance(tag, str):
        return ""
    return LANG_PREFIX_RE.sub("", tag.strip())

def normalise_raw_label(label: str) -> str:
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
    if not unified_label:
        return ""
    unified_label = unified_label.strip()
    unified_label = re.sub(r"\s+", " ", unified_label)
    unified_label = unified_label.title()
    unified_label = unified_label.replace(" And ", " & ")
    return unified_label

def map_raw_to_unified(raw_label: str, config: CategoryConfig) -> Optional[str]:
    norm = normalise_raw_label(raw_label)
    if not norm:
        return None
    mapped = config.mapping_raw_to_unified.get(norm)
    if mapped:
        unified = apply_naming_rules(mapped)
    else:
        unified = apply_naming_rules(norm)
    if config.allowed_unified_categories is not None:
        allowed_normalised = {apply_naming_rules(a) for a in config.allowed_unified_categories}
        if unified not in allowed_normalised:
            if config.fallback_category:
                return apply_naming_rules(config.fallback_category)
            return None
    return unified

def harmonise_categories_for_product(
    raw_categories: Union[Iterable[str], str, float, None],
    config: CategoryConfig = DEFAULT_CONFIG,
) -> List[str]:
    if raw_categories is None:
        return []
    if isinstance(raw_categories, float) and math.isnan(raw_categories):
        return []
    items: List[str] = []
    if isinstance(raw_categories, str):
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
            try:
                norm = normalise_raw_label(raw)
            except Exception:
                norm = str(raw)
            _record_unknown_category(norm)
            if config.fallback_category:
                unified_set.add(apply_naming_rules(config.fallback_category))
    return sorted(unified_set)

def harmonise_categories_df(
    df: pd.DataFrame,
    source_col: str = "categories",
    unified_col: str = "categoriesUnified",
    primary_col: str = "primaryCategory",
    config: CategoryConfig = DEFAULT_CONFIG,
) -> pd.DataFrame:
    if source_col not in df.columns:
        logger.warning(f"Column '{source_col}' not found. DB003 skipped.")
        return df
    logger.info(
        f"Running category harmonisation on column '{source_col}' "
        f"(rows={len(df)})")
    df[unified_col] = df[source_col].apply(
        lambda cats: harmonise_categories_for_product(cats, config=config))
    CATEGORY_PRIORITY: Dict[str, int] = {
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
        best = None
        best_p = -1
        for u in unified_list:
            p = CATEGORY_PRIORITY.get(u, 0)
            if p > best_p:
                best_p = p
                best = u
        return best or unified_list[0]
    df[primary_col] = df[unified_col].apply(choose_primary)
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
    top_unknowns = get_top_unknowns(20)
    if top_unknowns:
        logger.info(f"Top unknown raw categories (sample): {top_unknowns}")
    return df

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
