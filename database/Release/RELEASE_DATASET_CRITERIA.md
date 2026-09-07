# Food Remedy Release Dataset Criteria

## 1. Purpose

This document defines the shared criteria for preparing and validating the final Food Remedy release dataset.

The purpose is to ensure that the remaining Database Team release work follows one consistent standard.

This document defines release criteria only. It does not modify production Firestore or existing pipeline functionality.

## 2. Release Dataset Candidate

Based on the current pipeline configuration, the enriched product output is:

`database/seeding/products_enriched.json`

The current enrichment stage uses:

`database/seeding/products_5k_enriched.json`

as input and produces `products_enriched.json`.

The seed stage then uses `products_enriched.json` as its input.

Therefore, `products_enriched.json` will be treated as the release dataset candidate before final validation and versioning.

The final approved release dataset should be generated only after release-critical Database fixes have been merged.

## 3. Required Product Fields

The current product schema identifies the following fields as required:

- `barcode`
- `productName`

A release product record must contain a usable barcode and product name unless an approved fallback or documented exception applies.

Other fields may be optional in the current schema but can still affect data quality and product safety.

## 4. Barcode Criteria

For release preparation:

- Barcode must be present.
- Barcode must be represented as a non-empty string.
- Barcode validation should follow the project's agreed barcode validation behaviour.
- Known legitimate supported barcode formats should not be incorrectly rejected.
- Invalid or unresolved barcode records must be reported in the validation manifest.

Barcode problems that prevent reliable product identification or lookup should be treated as release-critical data issues.

## 5. Ingredient Criteria

Ingredient information should be preserved and processed consistently where source information is available.

For release preparation:

- Missing ingredient information must not cause pipeline failure.
- Missing ingredient information must be measurable in final validation.
- Ingredient normalisation should not remove valid source information.
- Known ingredient-processing failures that affect downstream allergen or product behaviour should be resolved before dataset approval.

Missing source ingredient information that cannot be safely recovered may remain as a documented dataset limitation.

## 6. Allergen and Unknown-State Criteria

Allergen information is safety-sensitive.

For release preparation:

- Known allergen evidence must be preserved.
- Missing or uncertain allergen information must not be interpreted as confirmed allergen-free.
- Allergen handling should remain conservative when source evidence is unavailable or unclear.
- Allergen information should follow a consistent release data path where feasible.
- Known allergen-processing failures that could produce unsafe or misleading results should block dataset approval until resolved or explicitly reviewed.

The final validation manifest must document relevant allergen-data limitations.

## 7. Category Criteria

Categories should support reliable product classification and downstream product/recommendation behaviour.

For release preparation:

- Category values should use the project's established category rules.
- Known high-impact category inconsistencies should be addressed where feasible.
- Missing or generic categories should be measured during final validation.
- Category limitations that cannot be safely resolved before release must be documented.

A category issue should block dataset approval only when it materially affects a release-critical user journey or safety-related behaviour.

## 8. Release-Blocking Issues

The following should be treated as release-blocking or release-critical Database issues:

- Pipeline failures that prevent generation of the release dataset.
- Invalid required fields that prevent reliable product identification.
- Known allergen-processing behaviour that could incorrectly represent uncertain data as safe.
- Data corruption or output-path problems that cause the wrong dataset to be released.
- Validation failures that prevent the team from determining whether the dataset is suitable for release.

These issues should be resolved or explicitly reviewed before the final dataset is approved.

## 9. Known Limitations

Not every data-quality issue must block release.

Issues may be documented as known limitations when they do not prevent the agreed core release journey and cannot be safely resolved within the release timeframe.

Examples may include:

- Products not currently covered by the dataset.
- Missing optional brand information.
- Missing source ingredient information where no reliable replacement is available.
- Generic categories that do not affect release-critical behaviour.
- Other non-critical optional-field completeness issues.

Known limitations must be visible in the final validation manifest rather than left undocumented.

## 10. Dataset Versioning

The final release dataset must have a clear version identifier.

Recommended naming convention:

`foodremedy_release_v<major>.<minor>.json`

Example:

`foodremedy_release_v1.0.json`

A new version should be created when the approved release dataset changes. Existing approved release versions should not be silently overwritten.

The release record should identify the source dataset, generation date, pipeline/configuration used and validation result.

## 11. Validation Manifest Requirements

The final release dataset must be accompanied by a validation manifest.

At minimum, the manifest should record:

- Dataset version
- Generation/validation date
- Source/input dataset
- Pipeline/configuration used
- Total product count
- Valid and invalid record counts
- Required-field validation status
- Barcode validation status
- Ingredient completeness/status
- Allergen validation/status
- Category quality/status
- Validation errors or failure summary
- Known limitations
- Final release approval/status

Where possible, failed records should be traceable using barcode or another clear product identifier.

## 12. Relationship to Remaining Database Tickets

The remaining Database release tickets should follow the criteria defined in this document.

The intended workflow is:

1. Apply release-critical data and pipeline fixes.
2. Verify that the pipeline can reproducibly generate the candidate dataset.
3. Generate and version the release dataset.
4. Produce the validation manifest.
5. Perform final validation.
6. Freeze and hand over the approved release dataset.

Any new Database work should directly support release readiness, validation, safety or release evidence.
