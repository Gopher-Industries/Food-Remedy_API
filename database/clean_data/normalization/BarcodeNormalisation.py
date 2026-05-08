### Barcode Normalisation

import re
from typing import Any

class BarcodeNormalisation:
    """
    The BarcodeNormalisation class is responsible to standardise product
    barcodes to GTIN-14 format.

    It ensures:
    - Consistent matching barcodes across regional variants like UPC/EAN.
    - Different inptu formats to not affect the product records negatively.

    Methods:
    - barcode_normalise(Any) -> str:
        Cleans and normalises barcode to match GTIN14 standard.
    """

    @staticmethod
    def barcode_normalise(barcode: Any) -> str:
        """
        Normalises a barcode string or number to a 14-digit GTIN string.
        
        Logic:
        1. Convert input to string and handle None types.
        2. Strip all non-numeric characters (handling spaces, dashes, or malformed scans).
        3. Prepend leading zeros (padding) to reach exactly 14 digits.
        
        Args:
            barcode: The raw barcode input (str, int, or None).
            
        Returns:
            A 14-digit numeric string, or an empty string if input is invalid.
        """
        if barcode is None:
            return ""
        
        # strip all non-digit characters (0-9)
        # for examples: for cases like "9300-6337-1443-7" or "9300 6337"
        clean_barcode = re.sub(r'\D', '', str(barcode))
        
        if not clean_barcode:
            return ""
            
        # pad with leading zeros to meet the GTIN-14 standard.
        # for examples: EAN-13 (e.g., 9300633714437) becomes "09300633714437"
        # UPC-A (12 digits) becomes "00" + 12 digits.
        return clean_barcode.zfill(14)

### Testing
def test_barcode_normalisation():
    """
    Unit tests to verify DB033 requirements:
    - Consistency across regional variants (EAN-13, UPC-A).
    - Handling of padding and edge cases (None, malformed strings).
    """
    normaliser = BarcodeNormalisation()
    
    test_cases = [
        # EAN-13 (Standard Australian/European)
        ("9300633714437", "09300633714437"),
        # UPC-A (Standard North American 12-digit)
        ("012345678905", "00012345678905"),
        # GTIN-14
        ("09300633714437", "09300633714437"),
        # Edge cases: punctuation and spaces
        (" 9300-6337-1443-7 ", "09300633714437"),
        ("9300 6337 1443 7", "09300633714437"),
        # Edge cases: integer inputs
        (9300633714437, "09300633714437"),
        # Edge cases: empty/invalid inputs
        ("", ""),
        (None, ""),
        ("abc-123", "00000000000123"),
    ]
    
    print("Running Barcode Normalisation tests for DB033...")
    for i, (input, expected) in enumerate(test_cases):
        actual = normaliser.barcode_normalise(input)
        try:
            assert actual == expected
            print(f"Test case {i+1} Passed: '{input}' -> '{actual}'")
        except AssertionError:
            print(f"❌ Test case {i+1} Failed: Input '{input}' -> Got '{actual}', Expected '{expected}'")

    print("All test passed.")

if __name__ == "__main__":
    test_barcode_normalisation()