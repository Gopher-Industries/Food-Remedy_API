# DB022 – Investigate Missing Allergen Information

## Files Reviewed

- `database/pipeline/modules/allergens_enrich.py`
- `utils/detect_allergens.py`
- `database/Allergens/allergens_config.json`

## Investigation Findings

The current allergen detection process scans multiple product fields, including ingredients, traces, product name, generic name, allergen tags, categories, and labels.

When an allergen is detected, the function returns a list of detected allergens.

However, the current logic returns an empty list `[]` in several different situations:

- No allergen is detected from the available product information.
- Allergen-related information is missing.
- Allergen-related fields are present but empty.
- Allergen detection fails during the enrichment process.

Because these cases currently use the same empty list result, the pipeline cannot clearly distinguish between a product with no detected allergens and a product where allergen information is unknown or insufficient.

## Representative Testing

The following cases were tested directly using `detect_allergens()`:

### Known allergen

Input:

`milk chocolate, sugar, cocoa`

Result:

`['Milk']`

### No allergen detected

Input:

`water, rice, salt`

Result:

`[]`

### Missing allergen information

Input:

`{}`

Result:

`[]`

### Empty allergen information

Input:

- Empty ingredients
- Empty traces
- Empty allergen tags

Result:

`[]`

## Recommendation

Missing or insufficient allergen information should be represented separately from an empty allergen result.

A clear `Unknown` state should be used when there is not enough source information to determine allergen status reliably.

This would prevent missing information from being interpreted in the same way as a product where no allergens were detected.

## Conclusion

The current pipeline does not clearly distinguish between:

- No allergen detected
- Missing or insufficient allergen information
- Detection failure

No existing functionality was changed as part of this investigation.git status