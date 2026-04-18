from database.pipeline.modules.missing_field_handler import (
    handle_missing_fields,
    is_product_usable,
)


def test_missing_fields():
    product = {
        "code": "123",
        "product_name": "Test Product",
    }

    result = handle_missing_fields(product)

    assert result["_status"] == "incomplete"
    assert "ingredients_text" in result["_missing"]["critical"]
    assert "categories_tags" in result["_missing"]["critical"]
    assert not is_product_usable(result)


def test_valid_product():
    product = {
        "code": "123",
        "product_name": "Test Product",
        "ingredients_text": "Sugar",
        "categories_tags": ["snacks"],
    }

    result = handle_missing_fields(product)

    assert result["_status"] == "valid"
    assert is_product_usable(result)


def test_camel_case_critical_fields():
    product = {
        "barcode": "123",
        "productName": "Jam",
        "ingredientsText": "Berries",
        "categories": ["fruits"],
    }
    result = handle_missing_fields(product)
    assert result["_status"] == "valid"
    assert is_product_usable(result)


def test_is_product_usable_runs_handler_when_missing_metadata():
    product = {"code": "x", "product_name": "y"}
    assert not is_product_usable(product)
    assert "_missing" in product


def test_nutriments_empty_dict_is_optional_missing():
    product = {
        "code": "1",
        "product_name": "n",
        "ingredients_text": "i",
        "categories_tags": ["c"],
        "nutriments": {},
    }
    result = handle_missing_fields(product)
    assert "nutriments" in result["_missing"]["optional"]
    assert result["_status"] == "valid"


def test_nutriments_zero_values_count_as_present():
    product = {
        "code": "1",
        "product_name": "n",
        "ingredients_text": "i",
        "categories_tags": ["c"],
        "nutriments": {"salt_100g": 0.0},
    }
    result = handle_missing_fields(product)
    assert "nutriments" not in result["_missing"]["optional"]
