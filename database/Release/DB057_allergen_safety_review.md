# DB057 – Finalise Allergen Safety & Unknown Handling

## Objective

Review and finalise allergen handling for the release dataset, especially for products with missing or uncertain allergen information.

## Issue Identified

The current release candidate contained a large number of products with empty allergen values.

Before the fix:

- Total records: 5,000
- Known allergen records: 250
- Unknown records: 0
- Empty allergen records: 4,750 (95%)
- `allergensDetected` mismatches/missing: 5,000

## Root Cause

The allergen enrichment module incorrectly resolved relative output paths from the `database` directory instead of the repository root.

This caused allergen-enriched output to be written to:

`database/database/seeding/products_enriched.json`

instead of:

`database/seeding/products_enriched.json`

As a result, the main release dataset did not consistently receive the latest allergen safety handling.

## Fix Applied

Updated the output-path resolution in:

`database/pipeline/modules/allergens_enrich.py`

The module now resolves relative paths from the repository root.

The existing conservative allergen handling was preserved:

- Known allergen evidence is preserved.
- Missing or empty allergen information becomes `["Unknown"]`.
- `allergens` and `allergensDetected` remain consistent.

## Validation Results

The allergen enrichment process was tested against 5,000 products.

After the fix:

- Total records: 5,000
- Known allergen records: 268
- Unknown records: 4,732
- Empty allergen records: 0
- Missing allergen records: 0
- `allergens` / `allergensDetected` mismatches: 0
- Processing failures: 0

## Regression Testing

Four regression tests were added and all passed:

- Missing allergen data becomes `["Unknown"]`.
- Empty allergen data becomes `["Unknown"]`.
- Known allergen data is preserved.
- Allergen enrichment keeps `allergens` and `allergensDetected` consistent.

Test result:

`4 passed`

## Release Conclusion

The fix ensures that missing or uncertain allergen information is no longer represented as an empty allergen list.

Instead, it is represented conservatively as `["Unknown"]`, reducing the risk that missing allergen information could be interpreted as confirmed safe.

## Known Limitation

`Unknown` means reliable allergen evidence is not available.

It does not mean the product is allergen-free.

Final release validation should continue to report products with unknown allergen information as a documented dataset limitation.
