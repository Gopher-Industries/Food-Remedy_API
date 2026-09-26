### Barcode Normalisation

import re
from typing import Any

class BarcodeNormalisation:
    """
    The BarcodeNormalisation class is responsible for standardising product
    barcode values to a 14-digit numeric string consistent with GTIN-14 format.

    It ensures:
    - Consistent matching of barcodes across formats such as UPC-A and EAN-13.
    - Different input formats do not negatively affect the product records.

    Methods:
    - barcode_normalise(barcode: Any) -> str:
        Cleans and normalises a barcode value to a 14-digit format consistent 
        with GTIN-14.
    """

    @staticmethod
    def barcode_normalise(barcode: Any) -> str:
        """
        Normalises a barcode string or integer to a 14-digit numeric string
        consistent with GTIN-14 format.
        
        Logic:
        1. Reject None and float inputs.
        2. Convert accepted inputs to a string.
        3. Strip all non-digit characters, including spaces and dashes.
        4. Reject values with no digits or more than 14 digits.
        5. Prepend leading zeros (padding) to reach exactly 14 digits.
        
        Args:
            barcode: The raw barcode input (str, int, float, or None).
                Strings and integers are normalised; floats and None return an empty string.
            
        Returns:
            A 14-digit numeric string, or an empty string if the input is rejected.
        """
        if barcode is None:
            return ""

        # reject floats because removing the decimal point can change the barcode
        if isinstance(barcode, float):
            return ""
        
        # strip all non-digit characters (0-9)
        # for example: for cases like "9300-6337-1443-7" or "9300 6337"
        clean_barcode = re.sub(r'\D', '', str(barcode))
        
        if not clean_barcode:
            return ""
            
        # reject values that exceed 14 digits.
        if len(clean_barcode) > 14:
            return ""

        # pad with leading zeros to reach 14 digits, consistent with GTIN-14 format
        # for example: EAN-13 (e.g., 9300633714437) becomes "09300633714437"
        # UPC-A (12 digits) becomes "00" + 12 digits.
        return clean_barcode.zfill(14)

### Testing
def test_barcode_normalisation():
    """
    Unit tests for barcode normalisation:
    - Consistency across barcode formats (EAN-13, UPC-A).
    - Handling of padding and edge cases, including empty strings, None,
    mixed-character strings, and overlong values.
    - Rejection of float inputs that could alter barcode digits.
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
        # Edge cases: empty, mixed-character, overlong, and float inputs
        ("", ""),
        (None, ""),
        ("abc-123", "00000000000123"),
        ("abc", ""),
        ("123456789012345", ""),
        (9300633714437.0, ""),
    ]
    
    print("Running Barcode Normalisation tests...")
    all_passed = True

    for i, (input, expected) in enumerate(test_cases):
        actual = normaliser.barcode_normalise(input)
        try:
            assert actual == expected
            print(f"Test case {i+1} Passed: '{input}' -> '{actual}'")
        except AssertionError:
            all_passed = False
            print(f"❌ Test case {i+1} Failed: Input '{input}' -> Got '{actual}', Expected '{expected}'")

    if all_passed:
        print("All tests passed.")
    else:
        print("One or more tests failed.")

if __name__ == "__main__":
    test_barcode_normalisation()
