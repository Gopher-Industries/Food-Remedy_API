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


def test_integer_barcode_accepted(validator):
    """Integer-typed barcodes (e.g. from JSON numbers) are normalised and
    validated the same as string barcodes."""
    products = [{"barcode": 9337951006005}]
    result = validator.validate_barcodes(products)
    assert result["ok"] is True
    assert result["invalid_format"] == 0


def test_boolean_barcode_rejected(validator):
    """Booleans are a subclass of int in Python but are not valid
    barcodes and must be rejected explicitly, not stringified."""
    products = [{"barcode": True}, {"barcode": False}]
    result = validator.validate_barcodes(products)
    assert result["invalid_format"] == 2
    assert result["ok"] is False


def test_float_barcode_rejected(validator):
    """Float-typed barcodes are rejected rather than silently stringified,
    since floats risk precision loss on long digit sequences."""
    products = [{"barcode": 12345678.0}]
    result = validator.validate_barcodes(products)
    assert result["invalid_format"] == 1
    assert result["ok"] is False


def test_non_ascii_unicode_digits_rejected(validator):
    """Non-ASCII 'digit' characters (e.g. fullwidth digits) are rejected.
    str.isdigit() would otherwise accept these, so the check is restricted
    to ASCII 0-9 via regex instead."""
    fullwidth_barcode = "".join(
        chr(ord(ch) + 0xFF10 - 0x30) for ch in "9337951006005"
    )
    products = [{"barcode": fullwidth_barcode}]
    result = validator.validate_barcodes(products)
    assert result["invalid_format"] == 1
    assert result["ok"] is False


def test_whitespace_handling(validator):
    """Leading/trailing whitespace is stripped and still validates;
    internal whitespace is rejected."""
    products = [
        {"barcode": "  9337951006005  "},  # leading/trailing - should pass
        {"barcode": "9337 951006005"},      # internal - should fail
    ]
    result = validator.validate_barcodes(products)
    assert result["invalid_format"] == 1
    assert result["duplicates"] == 0