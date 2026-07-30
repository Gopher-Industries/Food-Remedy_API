import pytest
from database.Validation.db021_validator import DB021Validator


@pytest.fixture
def validator():
    return DB021Validator()


def test_standard_lengths_pass(validator):
    """Regression + coverage: EAN-8, UPC-A, EAN-13, GTIN-14 all pass."""
    products = [
        {"barcode": "12345678"},        # EAN-8 (8)
        {"barcode": "123456789012"},    # UPC-A (12)
        {"barcode": "9337951006005"},   # EAN-13 (13)
        {"barcode": "12345678901234"},  # GTIN-14 (14)
    ]
    result = validator.validate_barcodes(products)
    assert result["ok"] is True
    assert result["invalid_format"] == 0


def test_leading_zero_barcode_still_passes(validator):
    """Regression: leading-zero barcodes are legitimate real data (~11.6%
    of sample dataset) and must NOT be rejected."""
    products = [{"barcode": "0337951006005"}]
    result = validator.validate_barcodes(products)
    assert result["ok"] is True
    assert result["invalid_format"] == 0


def test_empty_barcode_still_flagged(validator):
    """Regression: existing empty-barcode detection is untouched."""
    products = [{"barcode": ""}, {"barcode": None}]
    result = validator.validate_barcodes(products)
    assert result["empty"] == 2
    assert result["ok"] is False


def test_duplicate_barcode_still_flagged(validator):
    """Regression: existing duplicate detection is untouched."""
    products = [
        {"barcode": "9337951006005"},
        {"barcode": "9337951006005"},
    ]
    result = validator.validate_barcodes(products)
    assert result["duplicates"] == 1
    assert result["ok"] is False


def test_non_numeric_barcode_now_detected(validator):
    """New: non-numeric barcodes are now caught."""
    products = [{"barcode": "abc1234567890"}]
    result = validator.validate_barcodes(products)
    assert result["invalid_format"] == 1
    assert result["ok"] is False


def test_non_standard_length_now_detected(validator):
    """New: barcodes at lengths outside 8/12/13/14 are now caught
    (matches the 3 anomalous records found in products_5k_test.json)."""
    products = [
        {"barcode": "123456789012345"},        # 15 digits
        {"barcode": "123456789012345678901"},  # 21 digits
    ]
    result = validator.validate_barcodes(products)
    assert result["invalid_format"] == 2
    assert result["ok"] is False