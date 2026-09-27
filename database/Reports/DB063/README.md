# DB063 - Final Release Data Quality Check

## Decision

The combined review is complete. The regenerated 5,000-record enriched
candidate is **ready for DB064 versioning with 269 reviewed row exclusions**.
It must not be seeded directly because those rows cannot reliably identify a
product. DB064 is authorised to exclude exactly the records in
`release_validation.json`, rebuild alternative-product mappings against the
retained catalogue, and rerun DB060 before approving the versioned artifact.

No barcode or product name may be guessed. A changed candidate hash, changed
exclusion count, new validation reason, unresolved allergen review, or dangling
alternative reference must stop release generation.

## Candidate identity

- Dataset: `database/seeding/products_enriched.json`
- Records: 5,000
- SHA-256: `90170dac3f974f674cef13b37b08a44e34d516dc49a6cb1ef869bdf6e8352870`
- DB060 result: `BLOCKED` pending the reviewed exclusions
- Valid rows available for the release artifact: 4,731
- Invalid rows: 269

## Combined quality results

| Area | Result | Evidence |
| --- | --- | --- |
| Required fields | Action required | 259 placeholder product names and 7 missing/unusable names |
| Barcodes | Action required | 3 unsupported barcode formats; 0 missing, non-string or duplicate values |
| Ingredients | Documented limitation | 4,627 records lack source ingredient text; missing values remain measurable and pipeline-safe |
| Allergens | Pass | 268 records have known evidence, 4,732 use conservative `Unknown`, 0 are empty and 0 disagree with `allergensDetected` |
| Categories | Pass with limitation | 279 records map to established buckets, 4,523 lack source tags and 198 tagged records remain unmapped |
| Alternative links | Must be rebuilt by DB064 | A naive row exclusion leaves 1,265 links from retained products pointing at excluded barcodes |

The 269 invalid rows are unique even though validation reasons are counted by
type. Their exact source index, barcode, product name and reasons are retained
in `release_validation.json`.

## Release-critical resolution

The reviewed resolution is exclusion rather than fabrication:

- exclude 3 rows with invalid barcode formats;
- exclude 259 rows with placeholder product names;
- exclude 7 rows with missing or unusable product names;
- preserve every other product unchanged until DB064 recomputes alternatives;
- require DB064's final DB060 result to contain zero invalid records and no
  outstanding reviews.

This resolves the release decision without weakening DB021/DB060 or accepting
exceptions for unreliable identifiers.

## Known non-critical limitations

- Missing ingredient text is source incompleteness; no replacement text is
  inferred.
- `Unknown` allergen state means evidence is unavailable, not allergen-free.
- Missing and unmapped categories remain visible rather than being inferred
  from product names.
- Barcode validation checks supported digit-only lengths and uniqueness, not
  GTIN check digits.
- This is an offline candidate review. Production seeding and Firestore
  application-path readback are deployment controls.

## Evidence

- `release_validation.json` - complete DB060 result and failed-row traceability.
- `allergen_audit.json` - known, conservative unknown, empty and mismatch counts.
- `category_audit.json` - category completeness and rule-replay results.
- `alternative_reference_risk.json` - evidence that alternatives must be
  regenerated after exclusion.

Reproduce the main checks with:

```bash
python scripts/db060_release_validation.py \
  --input database/seeding/products_enriched.json \
  --output /tmp/db063-release-validation.json

python scripts/db059_category_audit.py \
  --input database/seeding/products_enriched.json \
  --output /tmp/db063-category-audit.json
```
