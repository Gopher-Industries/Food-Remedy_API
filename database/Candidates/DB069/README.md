# DB069 Quality First Product Dataset Candidate

**Result:** CHECKS_PASSED_CANDIDATE_READY_FOR_DB070

**Candidate:** `foodremedy_candidate_db069.json`

**Candidate SHA-256:** `ffc2d26e4cc1fdaa8e1754e209f0be0b7fe7b93784b743b47911180d52b67ced`

**Generated:** 2026-09-21T11:00:00+00:00

DB069 evaluates every configured Australian source chunk instead of selecting
an arbitrary slice. It records source hashes, deterministically resolves
duplicate barcodes, scores source completeness, applies brand and category
representation limits, and accounts for every source row in the inclusion or
exclusion ledger.

## Source and selection evidence

- Source files profiled: 6
- Source rows evaluated: 61,373
- Unique valid barcodes: 61,298
- Duplicate barcode groups: 8
- Duplicate rows resolved: 8
- Candidate records: 5,000
- Existing DB060 validator: 5,000 valid, 0 invalid
- Inclusion ledger rows: 5,000
- Exclusion ledger rows: 56,373
- Complete source accounting: TRUE

## v1.0 comparison

| Measure | v1.0 | DB069 candidate | Rate change |
| --- | ---: | ---: | ---: |
| Ingredient text | 340 (7.2%) | 5,000 (100.0%) | +92.8 pp |
| Any core nutrition | 3,707 (78.4%) | 5,000 (100.0%) | +21.6 pp |
| All core nutrition | 2,421 (51.2%) | 4,719 (94.4%) | +43.2 pp |
| Categories | 385 (8.1%) | 5,000 (100.0%) | +91.9 pp |
| Brand | 3,870 (81.8%) | 5,000 (100.0%) | +18.2 pp |
| Known allergen evidence | 247 (5.2%) | 3,969 (79.4%) | +74.2 pp |
| Images | 4,731 (100.0%) | 5,000 (100.0%) | +0.0 pp |

## Representation and safety

- Largest brand group: {'name': 'cadbury', 'count': 100, 'share': 0.02}
- Largest primary-category group: {'name': 'groceries', 'count': 150, 'share': 0.03}
- Allergen selection-bias review: REVIEW_REQUIRED
- Eligible known-allergen rate: 12.3%
- Candidate known-allergen rate: 79.4%
- Missing allergen evidence remains `Unknown`; it is never treated as allergen-free.
- Missing nutrient values are not converted to zero.

## Reproducibility

Two independent builds in isolated temporary directories produced identical
candidate, ledger, quality-report, and source-profile hashes. Status:
`PASS`.

## Artifacts

- `db060_validation.json` - SHA-256 `34e218c1b3748d72cc1a6b6cd46fe6466cf6bad932f98877a43809e461b84a89`
- `exclusion_ledger.jsonl.gz` - SHA-256 `b04183dae74ea35733d161a05cde8c232ab2426a777c1e8e341c7e12e8ad33dd`
- `foodremedy_candidate_db069.json` - SHA-256 `ffc2d26e4cc1fdaa8e1754e209f0be0b7fe7b93784b743b47911180d52b67ced`
- `inclusion_ledger.jsonl` - SHA-256 `7eb53815d8b939aa65823dcc276f9cf2fad2934c44efcad25ef721a47b6e8a2c`
- `quality_report.json` - SHA-256 `e25a67e9b2cd2166e9eb9930e1f451a6393fc43e46c91c1c3c22c1107dac8038`
- `reproducibility_verification.json` - SHA-256 `3d464ff2b25693753447133515a7365a874c902d05157f28d281c3da6fac4036`
- `source_profile.json` - SHA-256 `8b844e7fea7d1cc04be47a14d36ee9c0d8b9fdb94ce90976899e80e8da216fb4`
- `generation_record.json` - SHA-256 `4fc07ff6e8d7785a0c3efa36048f49eddec38f76b34c2daea7ac9a019708f35f`


## Scope boundary

This work contains database data processing, validation, provenance, and
reporting only. It does not change Backend/API code, mobile code, Firestore
rules, production seeding, or deployment configuration. DB070 owns enrichment,
versioned v1.1 release generation, and final release validation.
