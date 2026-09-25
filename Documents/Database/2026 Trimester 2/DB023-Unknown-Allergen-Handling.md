# DB023 — Unknown Allergen Handling

**Implemented:** 2026-08-10
**Contract version:** Product Detail v1.0.1

## Decision

The canonical missing-allergen representation is `["Unknown"]`.

This preserves the existing `allergens: string[]` API shape while ensuring
missing data cannot be interpreted as a confirmed allergen-free product.
`"Unknown"` is a data-quality sentinel, not an allergen name and not a safety
claim.

## Behaviour

| Input or evidence | Contract output |
|---|---|
| Missing key, `null`, empty string/list, or placeholder | `["Unknown"]` |
| One or more known allergens | Known values, in their existing order |
| `Unknown` mixed with known values | Known values only |
| Empty primary field with known legacy `allergensDetected` | Detected values |
| Detection failure or no detected value | `["Unknown"]` |

The low-level detector still returns `[]` to mean that its keyword scan found no
matches. Cleaning, enrichment, mapping, and API boundaries convert that internal
result to `["Unknown"]`; therefore an empty allergen array is never exposed as
product information. Both `allergens` and the compatibility alias
`allergensDetected` use the same boundary representation.

Personalisation tagging ignores the sentinel as an allergen and does not infer
diet/allergen-safe tags when allergen information is unknown. Existing known
allergen lists continue through the pipeline unchanged by the new normalizer.

## Files reviewed and changed

- `utils/missing_value_utils.py` — canonical sentinel and normalizer.
- `database/clean_data/cleanProductData.py` — cleaning-stage output.
- `database/pipeline/modules/allergens_enrich.py` — enrichment and failure output.
- `database/pipeline/modules/db009_personalisation_tags.py` — sentinel-safe downstream tagging.
- `scripts/import_openfoodfacts_to_mongo.py` — standalone import path.
- `mapping/map_enriched_to_product_detail.py` — wire mapping and legacy fallback.
- `mapping/validate_product_contract.py` — empty/mixed-value validation.
- `mapping/contract_paths.py`, `api/contracts/CHANGELOG.md`, and `api/contracts/README.md` — v1.0.1 version and usage notes.
- `contracts/product_detail_v1.schema.json` and `api/contracts/product_v1.json` — v1.0.1 contract semantics.
- `api/contracts/examples/*.json` — known and unknown representative payloads.
- `Documents/Database/2026 Trimester 1/DB037-API-LOCK.md`, `DB038-Source-Data-Gaps-And-Limitations.md`, `Documents/Database/2025 Trimester 3/allergen-detection-engine.md`, and `FIRESTORE_STRUCTURE.md` — aligned contract/storage documentation.
- `mobile-app/services/utils/allergens.ts`, `productDetail.ts`, and `normaliseFirestoreProduct.ts` — API/Firestore response normalization.
- `test/test_missing_values.py`, `test/test_003_product_api_structure.py`, `test/test_validate_product_contract.py`, `test/test_db023_unknown_allergen_handling.py`, `test/test_db037_contract_lock.py`, and `mobile-app/__tests__/productDetail.test.ts` — regression coverage.

## Relevant files reviewed without behavioural changes

- `utils/detect_allergens.py` — detection remains responsible only for matches.
- `database/pipeline/modules/schema_validator.py` and `database/Validation/db021_validator.py` — existing list-type checks remain compatible.

## Verification

```bash
python -m pytest test/test_missing_values.py \
  test/test_003_product_api_structure.py \
  test/test_validate_product_contract.py \
  test/test_db023_unknown_allergen_handling.py \
  test/test_db037_contract_lock.py -q

npm --prefix mobile-app test -- --runInBand productDetail.test.ts
```
