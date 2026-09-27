"""
DB058: Check barcode quality in the release dataset.

Reviews barcode data in products_enriched.json and checks for
missing, invalid or unsupported barcode values.
"""

import json
import os
import sys

# Ensure project root is in sys.path so script can be run directly from anywhere
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Use the existing barcode validation rules from DB021.
from database.Validation.db021_validator import DB021Validator

# Check how invalid barcodes behave during normalisation.
from database.clean_data.normalization.BarcodeNormalisation import BarcodeNormalisation

DATASET_PATH = "database/seeding/products_enriched.json"

# Barcode lengths accepted by the current validator.
# These cover EAN-8, UPC-A, EAN-13 and GTIN-14.
SUPPORTED_LENGTHS = (8, 12, 13, 14)

# Load the release dataset.
with open(DATASET_PATH, encoding="utf-8") as file:
    products = json.load(file)

# Use the existing validator for barcode format checks.
validator = DB021Validator()

# Show how many product records are being checked.
print("Total products:", len(products))

# Check for missing or empty barcode values.
missing_barcodes = 0

for product in products:
    barcode = product.get("barcode")

    if barcode is None or barcode == "":
        missing_barcodes += 1

print("Missing or empty barcodes:", missing_barcodes)

# Check whether any barcodes are stored as something other than a string.
# Keeping them as strings also preserves leading zeroes.
non_string_barcodes = 0

for product in products:
    barcode = product.get("barcode")

    if barcode is not None and not isinstance(barcode, str):
        non_string_barcodes += 1

print("Non-string barcodes:", non_string_barcodes)

# Count how many barcodes use each supported length.
eight_digit = 0
twelve_digit = 0
thirteen_digit = 0
fourteen_digit = 0
other_length = 0

for product in products:
    barcode = product.get("barcode", "")

    # Skip non-string values here because they were already counted above.
    if not isinstance(barcode, str):
        continue

    if len(barcode) == 8:
        eight_digit += 1
    elif len(barcode) == 12:
        twelve_digit += 1
    elif len(barcode) == 13:
        thirteen_digit += 1
    elif len(barcode) == 14:
        fourteen_digit += 1
    else:
        other_length += 1

print("8-digit barcodes:", eight_digit)
print("12-digit barcodes:", twelve_digit)
print("13-digit barcodes:", thirteen_digit)
print("14-digit barcodes:", fourteen_digit)
print("Other barcode lengths:", other_length)

# Show records that fail the existing barcode format check.
print("\nProducts with invalid barcode formats:")

for product in products:
    barcode = product.get("barcode", "")

    if isinstance(barcode, str) and not validator._is_valid_barcode_format(barcode):
        print(
            "Barcode:", barcode,
            "| Length:", len(barcode),
            "| Product:", product.get("productName")
        )

# Run the existing barcode validator against the full release dataset.
barcode_results = validator.validate_barcodes(products)

print("\nExisting barcode validation results:")
print("Empty:", barcode_results["empty"])
print("Invalid format:", barcode_results["invalid_format"])
print("Duplicates:", barcode_results["duplicates"])
print("Total issues:", barcode_results["total_issues"])

# Check what normalisation does with the invalid barcode values.
print("\nNormalisation of invalid barcodes:")

for product in products:
    barcode = product.get("barcode", "")

    if isinstance(barcode, str) and not validator._is_valid_barcode_format(barcode):
        normalised = BarcodeNormalisation.barcode_normalise(barcode)

        print(
            "Barcode:", barcode,
            "| Normalised:", repr(normalised),
            "| Product:", product.get("productName")
        )

# Test what the dataset would look like if invalid barcode records were excluded.
# This only creates new lists in memory. It does not change the JSON file.
valid_products = []
excluded_products = []

for product in products:
    barcode = product.get("barcode", "")

    if isinstance(barcode, str) and validator._is_valid_barcode_format(barcode):
        valid_products.append(product)
    else:
        excluded_products.append(product)

print("\nAfter excluding invalid barcode records:")
print("Products remaining:", len(valid_products))
print("Products excluded:", len(excluded_products))

# Show which products would be excluded.
for product in excluded_products:
    print(
        "Excluded:",
        product.get("barcode"),
        "|",
        product.get("productName")
    )

# Run the validator again on the remaining records.
# This shows whether any barcode problems would still remain.
final_results = validator.validate_barcodes(valid_products)

print("\nValidation after exclusion:")
print("Empty:", final_results["empty"])
print("Invalid format:", final_results["invalid_format"])
print("Duplicates:", final_results["duplicates"])
print("Total issues:", final_results["total_issues"])