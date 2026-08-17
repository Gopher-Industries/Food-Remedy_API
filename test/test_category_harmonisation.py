from database.clean_data.normalization.CategoryHarmonisation import (
    CATEGORY_PRIORITY,
    select_primary_category,
)


def test_specificity_still_wins_for_seafood_family():
    """Existing behaviour is unaffected: specific categories outrank broader parents."""
    assert select_primary_category(["Seafood", "Canned Tuna"]) == "Canned Tuna"
    assert select_primary_category(["Canned Foods", "Seafood"]) == "Seafood"


def test_specificity_still_wins_for_bread_family():
    """Existing behaviour is unaffected: Wholemeal Bread still outranks Bread."""
    assert select_primary_category(["Bread", "Wholemeal Bread"]) == "Wholemeal Bread"


def test_db021_chocolates_confectionery_outranks_its_broader_parents():
    """
    DB021 regression test.

    Before this fix, "Chocolates & Confectionery" (priority 34) was lower
    than its own broader parents "Snacks" (42) and "Sweet Snacks" (44), so a
    product tagged with both would resolve to the less specific label —
    inconsistent with the specificity-wins design used everywhere else in
    CATEGORY_PRIORITY (e.g. Canned Tuna > Seafood > Canned Foods). It should
    now consistently win.
    """
    assert (
        select_primary_category(["Sweet Snacks", "Chocolates & Confectionery"])
        == "Chocolates & Confectionery"
    )
    assert (
        select_primary_category(["Snacks", "Chocolates & Confectionery"])
        == "Chocolates & Confectionery"
    )


def test_category_priority_has_no_unexpected_ties():
    """
    Sanity check on the priority table: any two categories sharing a
    priority value should be an intentional, equally-specific pair, not an
    accidental collision. "Nut & Seed Spreads" and "Chocolate & Sweet
    Spreads" are documented siblings under "Spreads" and are excluded.
    """
    documented_ties = {
        frozenset({"Nut & Seed Spreads", "Chocolate & Sweet Spreads"}),
    }

    seen = {}
    unexpected_ties = []
    for category, priority in CATEGORY_PRIORITY.items():
        if priority in seen:
            pair = frozenset({category, seen[priority]})
            if pair not in documented_ties:
                unexpected_ties.append(pair)
        else:
            seen[priority] = category

    assert unexpected_ties == [], f"Unexpected priority ties: {unexpected_ties}"
