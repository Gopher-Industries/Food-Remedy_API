# DB063 - Final Release Data Quality Check

**Result:** APPROVED DATASET ARTIFACT

**Dataset:** `foodremedy_release_v1.0.json`

**Version:** `v1.0`

**SHA-256:** `3e13e4be688c5ff2728857385547d2438052e41699221f34cc001a4939da0b72`

**Generated:** 2026-09-20T14:36:34.898340+00:00

The combined release check passed for all 4,731
records in the versioned artifact. The artifact is approved for release handoff;
production seeding and Firestore readback remain separate deployment controls.

## Release checks

| Area | Result | Evidence |
| --- | --- | --- |
| Required fields | PASS | 0 invalid records |
| Barcodes | PASS | 0 missing, invalid, non-string or duplicate barcodes |
| Ingredients | PASS with limitation | 4,391 records lack source ingredient text; processing remains null-safe |
| Allergens | PASS | 247 known, 4,484 conservatively Unknown, 0 empty/mismatched |
| Categories | PASS with limitation | 233 mapped; 4,346 missing source tags; 152 tagged but unmapped |
| Alternative links | PASS | 39,421 references checked; 0 dangling references |

## Release-critical resolution

The reviewed 5,000-record enriched candidate contained 269
records that could not reliably identify a product. They were excluded rather
than repaired with guessed values. The exclusion ledger records each source row,
barcode, name and reason. Counts by reason: `{"barcode_invalid_format": 3, "stored_product_name_missing_or_unusable": 7, "stored_product_name_placeholder": 259}`.

Alternatives were rebuilt after exclusion, against the exact final catalogue.
This prevents recommendations from referring to any excluded barcode.

## Known non-critical limitations

- 4391 records lack source ingredient text; no replacement text was inferred.
- 4484 records use the conservative Unknown allergen state and must not be presented as allergen-free.
- 4346 records lack source category tags and 152 tagged records remain outside the current category rules.
- Barcode validation covers supported digit-only lengths and uniqueness, not GTIN check digits.
- The dataset artifact is approved offline; production seeding and Firestore application-path readback have not yet run.


## Approval boundary

This approval covers the immutable offline dataset artifact and its recorded
configuration. It does not claim that production has been seeded. Run the live
database release gate with Firestore readback after deployment and retain that
evidence with the release record.
