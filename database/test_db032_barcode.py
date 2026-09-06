"""
DB032 - Barcode & Product Lookup Consistency
Unit tests for the fixed validate_record() barcode check, plus
characterisation tests for deduplicate_products()/ensure_code_field()
that document current (not necessarily fixed) behaviour.

Run with:  python3 -m pytest tests/test_db032_barcode.py -v
"""
import sys
import os
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "database", "clean_data"))
import cleanProductData as cpd


def _record(barcode, **overrides):
    base = {
        "barcode": barcode,
        "nutriments": {},
        "productQuantity": 100,
        "servingQuantity": 30,
        "productQuantityUnit": "g",
        "servingQuantityUnit": "g",
        "completeness": 0.5,
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Test valid barcodes (all four standard retail lengths)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("barcode", [
    "96385074",         # EAN-8  (8 digits)
    "036000291452",     # UPC-A  (12 digits)
    "0009542005948",    # EAN-13 (13 digits, leading zero)
    "9337951006005",    # EAN-13 (13 digits, no leading zero)
    "10012345678902",   # GTIN-14 (14 digits)
])
def test_valid_barcode_lengths_pass(barcode):
    warnings = cpd.validate_record(_record(barcode))
    barcode_warnings = [w for w in warnings if "Barcode" in w]
    assert barcode_warnings == [], f"{barcode!r} should be valid, got {barcode_warnings}"


# ---------------------------------------------------------------------------
# Test missing and malformed barcodes
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("barcode,label", [
    ("", "empty string"),
    ("12345", "too short (5 digits)"),
    ("123456789012345678", "too long (18 digits)"),
    ("ABC123456789", "contains letters"),
    ("9542-0059-48123", "contains punctuation"),
    ("9542 0059 48123", "contains whitespace"),
    ("９５４２００５９４８１２３", "fullwidth digits (non-ASCII, previously passed via str.isdigit())"),
])
def test_malformed_barcodes_are_flagged(barcode, label):
    warnings = cpd.validate_record(_record(barcode))
    barcode_warnings = [w for w in warnings if "Barcode" in w]
    assert barcode_warnings, f"{label} ({barcode!r}) should be flagged invalid but wasn't"


def test_missing_barcode_raises_not_silently_ignored():
    # barcode key itself absent -> KeyError is the correct, loud failure mode
    # (validate_record is only ever called after rename_specific_columns,
    # where 'barcode' should always exist as a column; a genuinely missing
    # value should be an empty string by that point, not an absent key).
    with pytest.raises(KeyError):
        cpd.validate_record({
            "nutriments": {}, "productQuantity": 0, "servingQuantity": 0,
            "productQuantityUnit": "g", "servingQuantityUnit": "g", "completeness": 0.5,
        })


# ---------------------------------------------------------------------------
# Regression: real seed data should no longer produce false-positive
# "invalid barcode" warnings for legitimate EAN-8 / GTIN-14 codes.
# ---------------------------------------------------------------------------
def test_ean8_and_gtin14_no_longer_false_flagged():
    ean8 = _record("96385074")
    gtin14 = _record("10012345678902")
    assert not [w for w in cpd.validate_record(ean8) if "Barcode" in w]
    assert not [w for w in cpd.validate_record(gtin14) if "Barcode" in w]


def test_genuinely_invalid_lengths_still_flagged():
    # real anomalies found in database/seeding/products_enriched.json
    fifteen_digit = _record("123456789101112")
    twentyone_digit = _record("793144417118850103601")
    assert [w for w in cpd.validate_record(fifteen_digit) if "Barcode" in w]
    assert [w for w in cpd.validate_record(twentyone_digit) if "Barcode" in w]


# ---------------------------------------------------------------------------
# Test duplicate barcode cases
# ---------------------------------------------------------------------------
def test_exact_duplicate_barcodes_are_merged():
    df = pd.DataFrame([
        {"code": "0009542005948", "product_name": "Complete Record", "brands": "X", "completeness": 0.9},
        {"code": "0009542005948", "product_name": "Sparse Record", "brands": "X", "completeness": 0.2},
    ])
    result = cpd.deduplicate_products(df.copy())
    assert len(result) == 1
    assert result.iloc[0]["product_name"] == "Complete Record"


def test_punctuation_variant_duplicates_are_not_caught_by_final_value():
    """
    Characterisation test (documents CURRENT behaviour, not desired
    behaviour): deduplicate_products() strips non-digits when building the
    grouping key, so a dashed and a plain barcode with the same digits ARE
    recognised and merged as duplicates -- but the merged record keeps the
    winning row's RAW (unstripped) code value. If the winning row is the
    punctuated one, the punctuation survives into the final stored barcode
    despite being "deduplicated".
    """
    df = pd.DataFrame([
        {"code": "9542-0059-48123", "product_name": "Punctuated, higher completeness", "brands": "X", "completeness": 0.9},
        {"code": "9542005948123",   "product_name": "Plain, lower completeness", "brands": "X", "completeness": 0.2},
    ])
    result = cpd.deduplicate_products(df.copy())
    assert len(result) == 1, "same digits after stripping punctuation -> should merge to one record"
    survivor_code = result.iloc[0]["code"]
    assert survivor_code == "9542-0059-48123"  # punctuation NOT cleaned from the stored value
    assert "-" in survivor_code, (
        "Known issue (see DB032 writeup): duplicate detection strips "
        "punctuation for MATCHING purposes only; the surviving record's "
        "stored barcode can still contain punctuation."
    )


def test_none_barcode_is_silently_dropped_during_dedup():
    """
    Characterisation test for a KNOWN ISSUE flagged in the DB032 writeup,
    NOT fixed on this ticket (recommended as a follow-up). A None barcode
    produces a NaN dedup key rather than an empty string, so the row is
    excluded from BOTH the barcode-group path and the no-barcode name/brand
    fallback path, and disappears with no warning or log line. An empty
    string barcode does NOT have this problem -- it is correctly routed to
    the fallback path and survives.
    """
    df = pd.DataFrame([
        {"code": None, "product_name": "Should survive but currently vanishes", "brands": "X", "completeness": 0.5},
    ])
    result = cpd.deduplicate_products(df.copy())
    assert len(result) == 0  # documents current (buggy) behaviour

    df2 = pd.DataFrame([
        {"code": "", "product_name": "Empty string survives", "brands": "X", "completeness": 0.5},
    ])
    result2 = cpd.deduplicate_products(df2.copy())
    assert len(result2) == 1  # contrast case: this path works correctly


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
