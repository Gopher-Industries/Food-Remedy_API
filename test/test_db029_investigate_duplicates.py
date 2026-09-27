"""
DB029: Unit tests for investigating duplicate product records in cleanProductData.py.

Verifies:
- Duplicate product codes/barcodes are detected and reported
- Duplicate product names are detected and reported
- Function is non-destructive (returns original DataFrame unmodified)
"""

import pandas as pd
from database.clean_data.cleanProductData import investigate_duplicates


def test_db029_investigate_duplicates_detection(capsys):
    """Verify investigate_duplicates identifies duplicate codes and names without modifying df."""
    data = [
        {"code": "9300633714437", "product_name": "Full Cream Milk"},
        {"code": "9300633714437", "product_name": "Full Cream Milk"},  # Duplicate code & name
        {"code": "9300633714438", "product_name": "full cream milk"},  # Duplicate name (case-insensitive)
        {"code": "9300633714439", "product_name": "Orange Juice"},
    ]
    df = pd.DataFrame(data)
    result = investigate_duplicates(df.copy())

    # Check non-destructive return
    assert len(result) == 4
    assert list(result.columns) == list(df.columns)

    # Check printed output counts
    captured = capsys.readouterr().out
    assert "DB029: Found 2 records with duplicate product codes." in captured
    assert "DB029: Found 3 records with matching product names." in captured


def test_db029_investigate_duplicates_no_duplicates(capsys):
    """Verify investigate_duplicates handles data with zero duplicates cleanly."""
    data = [
        {"code": "111", "product_name": "Product A"},
        {"code": "222", "product_name": "Product B"},
    ]
    df = pd.DataFrame(data)
    result = investigate_duplicates(df.copy())

    assert len(result) == 2
    captured = capsys.readouterr().out
    assert "DB029: Found 0 records with duplicate product codes." in captured
    assert "DB029: Found 0 records with matching product names." in captured
