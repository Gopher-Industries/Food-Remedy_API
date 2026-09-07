"""
DB031 — Investigate Product Category Consistency.

Covers the testing bullets on the ticket:
    * Products with valid categories.
    * Missing and inconsistent categories.
    * Existing category harmonisation behaviour (DB004).
    * Valid categories are not incorrectly changed by the DB031 fix.

Run with: pytest database/test_db031_category_consistency.py -v
"""

from database.clean_data.cleanProductData import (
    standardise_category,
    clean_category_tags,
    CATEGORY_RULES_ORDERED,
)


# ---------------------------------------------------------------------------
# Valid categories: existing, already-covered buckets must keep working.
# ---------------------------------------------------------------------------

def test_valid_category_breads():
    assert standardise_category(["en:breads"]) == "breads"

def test_valid_category_seafood():
    assert standardise_category(["en:fishes", "en:seafood"]) == "seafood"

def test_valid_category_noodles_and_pasta():
    assert standardise_category(["en:pastas"]) == "noodles and pasta"

def test_valid_category_oils():
    assert standardise_category(["en:vegetable-oils"]) == "oils"

def test_valid_category_spreads():
    assert standardise_category(["en:nut-butters"]) == "spreads"

def test_valid_category_snacks_and_confectionery():
    assert standardise_category(["en:chocolates"]) == "snacks and confectionery"


# ---------------------------------------------------------------------------
# Missing / inconsistent categories.
# ---------------------------------------------------------------------------

def test_missing_categories_none():
    assert standardise_category(None) == "other"

def test_missing_categories_empty_list():
    assert standardise_category([]) == "other"

def test_missing_categories_empty_string():
    assert standardise_category("") == "other"

def test_inconsistent_category_unrecognised_tag():
    # A tag that exists but maps to nothing we currently harmonise.
    assert standardise_category(["en:random-unmapped-tag"]) == "other"

def test_inconsistent_category_non_string_entries_ignored():
    # Defensive: junk / non-string entries should not raise, just be skipped.
    cleaned = clean_category_tags(["en:breads", None, 123, ""])
    assert cleaned == ["breads"]
    assert standardise_category(["en:breads", None, 123, ""]) == "breads"


# ---------------------------------------------------------------------------
# Existing harmonisation behaviour (DB004) must be preserved.
# ---------------------------------------------------------------------------

def test_beverages_umbrella_denylist_still_holds():
    # The umbrella slug alone must NOT trigger the beverages bucket.
    assert standardise_category(["en:plant-based-foods-and-beverages"]) == "other"

def test_beverages_specific_subtype_still_matches():
    assert standardise_category(["en:teas"]) == "beverages"

def test_segment_safe_matching_not_substring():
    # "breads" segment must not match inside an unrelated slug that merely
    # contains the letters, e.g. a fabricated slug with "breads" embedded
    # but not as a whole hyphen segment.
    assert standardise_category(["en:sourdough-breadsticks"]) == "other"

def test_language_prefix_and_case_are_normalised():
    assert standardise_category(["EN:Breads"]) == "breads"
    assert standardise_category(["fr:breads"]) == "breads"


# ---------------------------------------------------------------------------
# DB031 fix: new "dairy" bucket.
# ---------------------------------------------------------------------------

def test_dairy_bucket_dairies_tag():
    assert standardise_category(["en:dairies"]) == "dairy"

def test_dairy_bucket_cheeses_tag():
    assert standardise_category(["en:cheeses"]) == "dairy"

def test_dairy_bucket_yogurts_tag():
    assert standardise_category(["en:yogurts"]) == "dairy"

def test_dairy_bucket_fermented_milk_products_tag():
    assert standardise_category(["en:fermented-milk-products"]) == "dairy"


# ---------------------------------------------------------------------------
# Confirm valid/existing categories are NOT incorrectly changed by the fix.
# ---------------------------------------------------------------------------

def test_drinkable_dairy_products_still_classify_as_beverages():
    # Products tagged as BOTH dairy and a specific beverage sub-type (e.g. a
    # milkshake, kefir, or iced coffee) already classified correctly as
    # "beverages" before DB031. The new dairy rule sits after "beverages" in
    # CATEGORY_RULES_ORDERED specifically so this does not regress.
    milkshake_tags = ["en:beverages", "en:dairies", "en:dairy-drinks", "en:flavoured-milks"]
    assert standardise_category(milkshake_tags) == "beverages"

    kefir_tags = [
        "en:beverages-and-beverages-preparations", "en:beverages", "en:dairies",
        "en:fermented-milk-products", "en:dairy-drinks", "en:yogurts",
    ]
    assert standardise_category(kefir_tags) == "beverages"

def test_rule_order_places_dairy_after_beverages():
    # Guard against a future edit accidentally moving "dairy" back above
    # "beverages", which would silently re-break the case above.
    names_in_order = [name for name, _ in CATEGORY_RULES_ORDERED]
    assert names_in_order.index("dairy") > names_in_order.index("beverages")

def test_pure_dairy_product_not_reclassified_as_beverage():
    # A plain cheese/yogurt with no beverage sub-type tags must land in dairy,
    # not fall through to "other".
    assert standardise_category(["en:dairies", "en:cheeses"]) == "dairy"