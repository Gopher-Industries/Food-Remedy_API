from utils.missing_value_utils import (
    normalize_string,
    normalize_list,
    normalize_dict,
    clean_numeric,
    normalize_quantity_with_unit,
    normalize_palm_oil_indicator
)
from database.clean_data.constants import MISSING_STRINGS, EMPTY_LIST, EMPTY_DICT


def test_normalize_string_handles_missing_markers():
    assert normalize_string("") is None
    assert normalize_string(" ") is None
    assert normalize_string("unknown") is None
    assert normalize_string("UNKNOWN") is None  # case-insensitive due to .lower()


def test_normalize_string_preserves_real_values():
    assert normalize_string("milk") == "milk"
    assert normalize_string("  eggs  ") == "eggs"
    assert normalize_string("Palm Oil") == "Palm Oil"


def test_normalize_list_handles_empty_and_missing():
    assert normalize_list([]) == EMPTY_LIST
    assert normalize_list(None) == EMPTY_LIST
    assert normalize_list("") == EMPTY_LIST
    assert normalize_list("unknown") == EMPTY_LIST
    assert normalize_list(["", "unknown"]) == EMPTY_LIST


def test_normalize_list_cleans_internal_missing_strings():
    assert normalize_list(["milk", "", "eggs", "unknown"]) == ["milk", "eggs"]
    assert normalize_list(["  sugar  ", "salt"]) == ["sugar", "salt"]


def test_normalize_dict_handles_empty_and_malformed():
    assert normalize_dict({}) == EMPTY_DICT
    assert normalize_dict(None) == EMPTY_DICT
    assert normalize_dict([]) == EMPTY_DICT  # malformed


def test_normalize_dict_recursive_cleans_nested_values():
    nested = {
        "fat_100g": "unknown",
        "sugars_100g": "",
        "proteins_100g": "25",
        "empty_subdict": {}
    }
    cleaned = normalize_dict(nested, default=0, recurse=True)
    assert cleaned == {
        "fat_100g": 0,
        "sugars_100g": 0,
        "proteins_100g": 25.0,  # clean_numeric applied
        "empty_subdict": EMPTY_DICT
    }


def test_clean_numeric():
    assert clean_numeric("25") == 25.0
    assert clean_numeric("25.5") == 25.5
    assert clean_numeric("unknown") is None
    assert clean_numeric(None) is None
    assert clean_numeric("", default=0) == 0


def test_normalize_quantity_with_unit():
    assert normalize_quantity_with_unit("5 g") == (5.0, "g")
    assert normalize_quantity_with_unit("750 ml") == (750.0, "ml")
    assert normalize_quantity_with_unit("1000") == (1000.0, "g")  # default unit
    assert normalize_quantity_with_unit("unknown") == ("unknown", None)