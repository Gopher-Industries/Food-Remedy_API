from database.clean_data.cleanProductData import standardise_category


def test_condiments_category():
    """DB051: Products tagged as condiments should classify as condiments."""
    assert standardise_category(["condiments"]) == "condiments"


def test_existing_category_still_has_priority():
    """DB051: Existing category matches should not be changed."""
    assert standardise_category(["dairy-drinks", "condiments"]) == "beverages"


def test_missing_category_still_returns_other():
    """DB051: Missing category data should still return other."""
    assert standardise_category([]) == "other"