# DB060 – Run Final Release Dataset Validation

**Result: validation completed; the current candidate is BLOCKED for release.**

I ran the existing DB021 validation process against the candidate named in DB047
and added a report of the required fields as they are actually saved. The
existing checks reject three barcodes. The saved-data review also finds seven
null names and 259 names containing the literal string `nan`.

This ticket's validation and evidence are complete. Dataset approval is not:
the failures below need correction or an explicit reviewed exception before the
release workflow can proceed. No product records or Firestore data were changed.

## What was validated

- Candidate: `database/seeding/products_enriched.json`
- SHA-256: `203492101ee555cc2cc09fc52a215bc325e2878b72dc075f3980181b3bb17f23`
- Validation checkout: `5f717fb6364de6415c0d7f90a5c7d0021bc72a55`
- Criteria: `database/Release/RELEASE_DATASET_CRITERIA.md` (DB047).
- Agreed validator: `DB021Validator.run_all_validations()`; its full result is
  saved under `current_validation.result` in `release_validation.json`.
- Batch acceptance uses the same schema-and-barcode condition as
  `BatchValidator.validate_data()` in `database/Validation/db012_validator.py`.

The report records the validation timestamp, candidate hash, schema, validator,
category classifier and script hashes, observed pipeline config hash, and
configured source hash. The config is evidence of current settings, not proof of
how the committed file was generated. Generation date and final approved version
are not available, so the report explicitly labels this an unapproved candidate.

## Counts and their meaning

| Check | Result |
| --- | ---: |
| Total records | 5,000 |
| DB021 schema-valid records after its preprocessing | 5,000 |
| DB021 schema/barcode combined valid records | 4,997 |
| DB021 schema/barcode combined invalid records | 3 |
| Valid under combined DB021 + saved required-field checks | 4,731 |
| Invalid under combined checks | 269 |
| Invalid barcode formats | 3 |
| Missing barcodes | 0 |
| Duplicate barcodes | 0 |
| Null/missing/unusable saved names | 7 |
| Placeholder saved names (`nan`) | 259 |
| Missing ingredient text | 4,627 (92.54%) |
| Missing/empty stored allergens | 4,750 (95.00%) |
| Missing category tags | 4,523 (90.46%) |

Invalid counts use unique row indices, not the sum of error occurrences. Each
failed row includes its zero-based array index, original barcode, original name
and explicit reasons. Rows without a barcode remain traceable by index. No
failure list is truncated. A valid row is not automatically an approved release
row: dataset-wide review items remain separate.

## Why a schema pass is insufficient here

`DB021Validator.preprocess_record()` fills a missing name from generic name,
brand or barcode on a copy of the record. It does not repair the saved candidate.
It also accepts any non-empty string as a name, including `nan`. As a result,
`schema_validation.valid` is true for this candidate even though these source
name problems remain. The existing batch gate is still false because of barcodes.

The new report leaves DB021's behaviour intact and reports saved values
separately, in line with DB047's usable-name requirement. It flags the explicit
placeholder strings `nan`, `null`, `none` and `n/a`; only `nan` occurs here.
No approved fallback/exception list was supplied or applied. Any exception must
be documented and reviewed rather than inferred from the validator's fallback.

## Release blockers and suggested next actions

| Finding | Evidence | Suggested next action |
| --- | --- | --- |
| Unsupported 15-digit barcode | Index 31, `123456789101112`, Bakers Delight Hot Cross Buns | Database/source owner: verify the authoritative identifier or explicitly review exclusion; do not truncate digits. |
| Unsupported 21-digit barcode | Index 90, `793144417118850103601`, Double Brie | Same source verification; account for any downstream references if a record is replaced or excluded. |
| Unsupported 21-digit barcode | Index 107, `793251630047590107102`, Fortescue Bay | Same source verification. DB050 already measures these records; this report confirms they fail the current gate. |
| Seven null names | All seven barcodes are in `failed_records` with `stored_product_name_missing_or_unusable` | Database/Research: recover a usable name or agree and persist a reviewed fallback before rerunning. |
| 259 placeholder names | All rows listed with `stored_product_name_placeholder` | Database/Research: trace source/import handling and regenerate genuine names; do not silently substitute a barcode as a product name. |

The null-name barcodes are `0097744081372`, `9340784006708`, `9335695000204`,
`9337824003773`, `4078700218830`, `9340955001143` and `9329000009976`.

These are proposed coordination actions, not a claim that another team has
accepted ownership. This PR is the explicit escalation/evidence required by the
ticket; release approval should remain blocked while these items are unresolved.

## Reviews and limitations

- **Allergens:** 4,750 empty stored lists require confirmation of conservative
  unknown handling through enrichment and the API. An empty list alone neither
  proves allergen-free status nor proves that the API currently labels it safe.
  The report raises a review item instead of inventing 4,750 schema errors.
- **Ingredients/categories:** missing source information is measured and left
  unchanged. DB047 allows documented limitations where release-critical behaviour
  is unaffected; the relevant teams must confirm that assumption.
- **DB059 dependency:** this report was captured with the pre-DB059 classifier
  identified in its provenance. Category-rule replay therefore shows 249 mapped and 4,751 `other`.
  DB059's separate change improves rule coverage by 30 products. These baseline
  counts are not evidence that DB059 was applied to a regenerated candidate.
- **Regeneration/provenance:** release-critical fixes must be merged and the
  exact new candidate regenerated before final validation and versioning. Re-run
  this command on that artifact and retain its new hash. This run cannot certify
  reproducible pipeline generation, Firestore deployment or API behaviour.
- **Scope:** existing barcode validation covers supported lengths, ASCII digits
  and uniqueness; it does not check GTIN check digits. Nutrition values are not
  certified for plausibility by this run.

## Reproduce

From the repository root:

```bash
python scripts/db060_release_validation.py \
  --input database/seeding/products_enriched.json \
  --output /tmp/db060_release_validation.json
```

Expected output: `BLOCKED: total=5000, valid=4731, invalid=269` and **exit 1**.
That is a completed validation with a failing candidate, not a crashed run.
Exit 2 means input/execution failure. Exit 0 means automated checks pass pending
human release approval; the report never sets `release_approved` to true.
The runner captures DB021's report without replacing its default report file.
Its standard logger may write local logs, but it never seeds or edits the input.

## Tests

```bash
python -m pytest database/test_db060_release_validation.py \
  database/test_db040_validation_reporting.py -q
```

Result: **23 passed**. Coverage includes saved names versus in-memory fallback,
overlapping errors, duplicate-group traceability, supported barcode lengths and
leading zeros, integer identifiers, empty/malformed datasets, unknown allergens,
CLI exit codes, report provenance and input preservation. Review also verified
that failed DB021 nutrient/allergen structure diagnostics block release even
when its optional-field schema passes, and schema-load failures return exit 2.
The existing batch-gate result remains separately reported without changing it.

I also ran `database/test_db032_barcode.py` with those tests: **40 passed, 1
failed**. The failure is the existing
`test_none_barcode_is_silently_dropped_during_dedup` assertion at line 149. On
pandas 2.3.3, the row survives but that characterisation test expects zero rows.
It also fails when run alone, and neither that test nor the cleaner is changed
in this PR. Open DB050 PR #225 already addresses this test and the related
pandas-version behaviour; I have not duplicated its change here.
