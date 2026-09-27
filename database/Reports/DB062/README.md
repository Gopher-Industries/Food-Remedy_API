# DB062 - Verify and Fix the Database Release Pipeline

## Result

The clean/enrich pipeline was reviewed against the current repository and a
full 5,000-record enrichment run completed with no module failures or record
loss. The configured pipeline now runs the repository-native
`nutrition_enrich.py` module directly before allergen, personalisation, mood
and alternative-product enrichment.

## Patch adaptation

Harshavardhan Boppi supplied the original DB062 patch. It was adapted during
integration because the checkout had moved forward:

- The proposed clean-stage contract (`config`, dict input, structured result)
  is already present on `main`, with logging and nutrient normalisation, so it
  was retained rather than replaced by the older patch body.
- The module-path base remains `database/`, matching every current relative
  path in `pipeline.config.json`. Moving the base to the repository root would
  make the allergen, personalisation, mood and alternative modules unresolved.
- The intended nutrition change was applied using the current convention:
  `pipeline/modules/nutrition_enrich.py`, enabled in the release configuration.

Regression tests now execute the clean-stage contract, verify every enabled
module resolves under the configured convention, and run the configured
nutrition module through the actual enrichment stage.

## Full candidate verification

Evidence is recorded in `pipeline_verification.json`.

- Input records: 5,000
- Output records: 5,000
- Record-order/barcode preservation: pass
- Enabled modules: 5
- Module failures: 0
- Records with nutrition enrichment: 5,000
- Empty allergen states: 0
- `allergens` / `allergensDetected` mismatches: 0
- Output SHA-256: `90170dac3f974f674cef13b37b08a44e34d516dc49a6cb1ef869bdf6e8352870`

DB060 still reports the already-known 269 identity-invalid source rows. DB062
does not weaken or bypass that result; DB063 owns the final combined quality
decision.

## Validation

```bash
python -m pytest \
  database/test_db062_release_pipeline.py \
  test/test_enrich_stage.py \
  test/test_nutrition_health_score.py \
  database/test_db037_pipeline_error_handling.py -q
```
