# DB070 – Quality-First Database Release v1.1

**Result:** CHECKS_PASSED_DATABASE_RELEASE_READY_FOR_HANDOFF

**Dataset:** `foodremedy_release_v1.1.json`  
**Records:** 5,000  
**SHA-256:** `43b955c6837eda262b5b9afba5e8227ae7a1db3538dab110b393b8e9920791e1`  
**Reproducibility:** PASS_IDENTICAL_ARTIFACT_HASHES

DB070 generated v1.1 only from the reviewed DB069 candidate, whose SHA-256 is
bound in `validation_manifest.json`. The workflow canonicalised the candidate,
ran all five configured enrichment modules, reran DB060 and semantic database
checks, rebuilt alternatives against the final catalogue, and reproduced every
core artifact in a second isolated build.

## Validation result

| Check | Result | Evidence |
| --- | --- | --- |
| DB060 | PASS | 5,000 valid, 0 invalid |
| Barcode and names | PASS | 5,000 unique supported barcodes; 5,000 usable names |
| Ingredients and nutrients | PASS | Source nutriment objects preserved for all 5,000 records; missing values were not converted to zero |
| Allergens | PASS | 4,055 with known evidence; 945 conservatively Unknown |
| Categories | PASS with report | 3,371 mapped; 1,629 tagged but unmapped |
| Alternatives | PASS | 47,127 references checked; no dangling/self references |

## Quality movement from v1.0

| Metric | v1.0 | v1.1 | Change |
| --- | ---: | ---: | ---: |
| Ingredient coverage | 7.19% | 100.00% | +92.81% |
| Full core nutrition | 51.17% | 94.38% | +43.21% |
| Category coverage | 8.14% | 100.00% | +91.86% |
| Brand coverage | 81.80% | 100.00% | +18.20% |
| Known allergen evidence | 5.22% | 81.10% | +75.88% |
| Image coverage | 100.00% | 100.00% | +0.00% |

The version delta contains 4,878 added, 113 updated,
4,609 removed, and 9 unchanged barcodes.

## Reproduction

Run:

```bash
python scripts/db070_generate_quality_release.py \
  --output-dir database/Release/v1.1 \
  --release-date 2026-09-21 \
  --generated-at 2026-09-21T12:30:00+00:00
```

The command refuses to overwrite an existing release directory. It rejects a
candidate whose SHA differs from DB069, records exact configuration and module
hashes, and builds twice without consuming checkpoints.

## Boundary

This is a database release and handoff package. It does not include Backend/API
changes, mobile changes, Firestore rule changes, production seeding, deployment,
or credentialed live readback.
