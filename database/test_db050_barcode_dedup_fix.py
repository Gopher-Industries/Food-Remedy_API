import sys
import pytest
import pandas as pd
import database.clean_data.cleanProductData as cpd


def test_exact_duplicate_barcodes_still_merge():
    """Regression: DB032's original guarantee -- exact-string duplicate
    barcodes merge into one record, keeping the higher-completeness values."""
    df = pd.DataFrame([
        {"code": "0009542005948", "product_name": "Lindt 85%", "brands": "Lindt", "completeness": 0.5, "allergens_tags": []},
        {"code": "0009542005948", "product_name": "Lindt 85%", "brands": "Lindt", "completeness": 0.9, "allergens_tags": ["en:milk"]},
    ])
    result = cpd.deduplicate_products(df.copy())
    assert len(result) == 1
    assert result.iloc[0]["allergens_tags"] == ["en:milk"]


def test_punctuation_variant_duplicates_still_merge():
    """Regression: punctuation-variant barcodes (same digits, different
    formatting) still get matched and merged via the digit-stripped key."""
    df = pd.DataFrame([
        {"code": "9542-0059-48123", "product_name": "X", "brands": "Y", "completeness": 0.9},
        {"code": "9542005948123", "product_name": "X", "brands": "Y", "completeness": 0.4},
    ])
    result = cpd.deduplicate_products(df.copy())
    assert len(result) == 1


def test_two_none_barcode_rows_same_name_brand_still_merge():
    """DB050: two None-barcode rows for the same product (matching name +
    brand) should still merge via the fallback path, same as before the fix."""
    df = pd.DataFrame([
        {"code": None, "product_name": "Generic Snack", "brands": "Acme", "completeness": 0.3},
        {"code": None, "product_name": "Generic Snack", "brands": "Acme", "completeness": 0.8},
    ])
    result = cpd.deduplicate_products(df.copy())
    assert len(result) == 1


def test_two_unrelated_none_barcode_rows_not_merged():
    """DB050: two unrelated None-barcode products (different name/brand)
    must NOT be merged into each other just because they share an empty key."""
    df = pd.DataFrame([
        {"code": None, "product_name": "Snack A", "brands": "Acme", "completeness": 0.3},
        {"code": None, "product_name": "Snack B", "brands": "Zenith", "completeness": 0.8},
    ])
    result = cpd.deduplicate_products(df.copy())
    assert len(result) == 2


def test_mixed_batch_real_barcodes_and_none_all_survive():
    """DB050: closest-to-production shape -- real barcodes and a single
    None-barcode row in the same batch should all survive independently."""
    df = pd.DataFrame([
        {"code": "0009542005948", "product_name": "Lindt 85%", "brands": "Lindt", "completeness": 0.9},
        {"code": None, "product_name": "Mystery Item", "brands": "Unbranded", "completeness": 0.1},
        {"code": "0011210006508", "product_name": "Tabasco Habanero", "brands": "TABASCO", "completeness": 0.6},
    ])
    result = cpd.deduplicate_products(df.copy())
    assert len(result) == 3


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))