# DB064 - Versioned Final Release Dataset

**Result:** CHECKS PASSED - READY FOR DB065 VALIDATION MANIFEST

**Dataset:** `foodremedy_release_v1.0.json`

**Version:** `v1.0`

**SHA-256:** `b36d25a591a923e69a472a64b402b34e5a4d51d1aaa3904f5b02caa92cf19d82`

**Generated:** 2026-09-21T09:34:17.390166+00:00

The versioned dataset was generated from the DB063-approved candidate. All
automated generation checks passed for its 4,731
records. DB065 must produce the final validation manifest before the artifact is
approved for release or selected as the seeding input.

## Release checks

| Area | Result | Evidence |
| --- | --- | --- |
| Required fields | PASS | 0 invalid records |
| Barcodes | PASS | 0 missing, invalid, non-string or duplicate barcodes |
| Ingredients | PASS with limitation | 4,391 records lack source ingredient text; processing remains null-safe |
| Allergens | PASS | 247 known, 4,484 conservatively Unknown, 0 empty/mismatched |
| Categories | PASS with limitation | 233 mapped; 4,346 missing source tags; 152 tagged but unmapped |
| Alternative links | PASS | 41,529 references checked; 0 dangling references |

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
- The versioned dataset passed offline generation checks; DB065 approval, production seeding and Firestore application-path readback have not yet run.


## Handoff boundary

DB064 creates and preserves the immutable offline artifact with its source,
configuration, validation and checksum evidence. It does not grant final
release approval and does not claim that production has been seeded. DB065 owns
the final validation manifest and release handoff decision.
