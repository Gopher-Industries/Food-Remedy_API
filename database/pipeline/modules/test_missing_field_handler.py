from database.pipeline.modules.missing_field_handler import handle_missing_fields, is_product_usable


def test_missing_fields():
    product = {
        "code": "123",
        "product_name": "Test Product"
        # Missing ingredients_text and categories_tags
    }

    result = handle_missing_fields(product)

    assert result["_status"] == "incomplete"
    assert "ingredients_text" in result["_missing"]["critical"]
    assert not is_product_usable(result)


def test_valid_product():
    product = {
        "code": "123",
        "product_name": "Test Product",
        "ingredients_text": "Sugar",
        "categories_tags": ["snacks"]
    }

    result = handle_missing_fields(product)

    assert result["_status"] == "valid"
    assert is_product_usable(result)