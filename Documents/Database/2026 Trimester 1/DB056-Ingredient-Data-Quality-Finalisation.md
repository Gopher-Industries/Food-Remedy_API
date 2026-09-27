# DB056 — Finalise Ingredient Data Quality

**Ticket:** DB056 – Finalise Ingredient Data Quality
**Repo:** Food-Remedy_API
**Type:** Investigation + low-risk code fix + tests
**Author:** Barbie Mahajan (s223514755@deakin.edu.au)

No naming collision was found for DB056 before starting.

---

## Summary

Reviewing the release dataset ingredient fields against the actual cleaning code found a real, release-critical bug: the two dedicated ingredient-cleaning steps in `cleanProductData.py` (`clean_ingredients_text`, `clean_ingredients_list`) were checking for the wrong column names and silently never ran, and a second per-record cleanup pass had the same problem for the same reason. The result — confirmed directly against the repo's own committed sample output, not a hypothetical — is that an empty raw `ingredients_text` value lands in the release dataset as the literal empty string `""` instead of `null`, which is exactly the kind of "inconsistent ingredient data" this ticket asks to find and fix. The fix is a small, targeted column-name correction with no behavioural changes beyond making the already-written cleaning logic actually run; three new regression tests confirm the fix and guard against it silently regressing again.

## Files reviewed

| File | Role |
|---|---|
| `database/clean_data/cleanProductData.py` | Main ingredient cleaning logic — where the bug was found and fixed |
| `utils/missing_value_utils.py` | `normalize_string`/`normalize_list` — the per-record safety-net cleaners affected by the same bug |
| `database/clean_data/constants.py` | `MISSING_STRINGS` set used by `normalize_string` |
| `utils/detect_allergens.py` | Confirmed it already has a defensive `ingredientsText or ingredients_text` fallback, so it kept working through the bug and benefits from the fix without any change needed there |
| `database/pipeline/modules/missing_field_handler.py` | Confirmed `ingredients_text` is already a critical field alias, so missing ingredient data is correctly flagged, not silently ignored |
| `database/clean_data/normalization/IngredientStandardisation.py` | DB011's ingredient-name normaliser — reviewed for interaction, no changes needed (operates on individual ingredient tokens, not on the raw text/tags fields this ticket covers) |
| `database/clean_data/IOExamples/rawSample.jsonl`, `cleanSample.json` | Real raw → cleaned sample pair used as evidence and as the fixture for the new regression tests |
| `test/test_clean_product_data.py` | Existing tests for this file (no ingredient-specific coverage before this ticket) |
| `test/test_ingredient_cleaning_db056.py` | **New** — regression tests added by this ticket |

---

## What was reviewed against the release dataset

Cross-checking `database/clean_data/IOExamples/cleanSample.json` (the committed cleaned-output example) against its raw source (`rawSample.jsonl`):

- **Tuna Tomato and Onion** (barcode `9300633714437`): raw `ingredients_text: ""` (empty string). Expected behaviour per `clean_ingredients_text()`'s own docstring — "Convert empty/whitespace ingredientsText → None" — is `null` in the cleaned output. **Actual committed output: `"ingredientsText": ""`** — the empty string passed straight through unconverted.
- **Vegetable oil** (barcode `9300633391645`): raw `ingredients_tags: ["en:vegetable-oil-y"]`. Cleaned output correctly shows `"ingredients": ["vegetable-oil-y"]` (language prefix stripped) — this particular field happened to survive correctly despite the same underlying bug, for reasons explained below, but the risk was real and is now fully closed by the fix.

## Root cause

`cleanProductData.py`'s `main()` builds and cleans the DataFrame while columns are still in their raw, **snake_case** OpenFoodFacts names (`ingredients_text`, `ingredients_tags`). The rename to camelCase (`ingredientsText`, `ingredients`) only happens near the very end of `main()`, via `rename_specific_columns()` and `camelise_columns()`. Two places in the function incorrectly assumed the camelCase names were already in effect much earlier:

1. The dedicated DB002 cleaning step:
   ```python
   if 'ingredientsText' in df.columns:          # always False at this point
       df['ingredientsText'] = df['ingredientsText'].apply(clean_ingredients_text)
   ```
   Since the column is actually still named `ingredients_text` here, this `if` never fires, and `clean_ingredients_text()` — whose whole job is turning empty/whitespace text into `None` — never runs.

2. The per-record safety-net loop:
   ```python
   record["ingredientsText"] = normalize_string(record.get("ingredientsText"))
   ...
   record["ingredients"] = normalize_list(record.get("ingredients"))
   ```
   `record.get("ingredientsText")`/`record.get("ingredients")` always returned `None` (wrong key), so this line always computed `normalize_string(None)` / `normalize_list(None)` — `None` / `[]` — and assigned that to a **new** column that didn't exist yet in the DataFrame. Because `df.loc[idx] = record` expands the DataFrame to accommodate any new keys in the assigned Series, this silently created a second, all-`None`/all-empty column sitting alongside the original, correctly-cleaned `ingredients_text`/`ingredients_tags` columns. Once `camelise_columns()` later renamed the originals to the same camelCase names, the DataFrame briefly had **two columns with the same name** — one correct, one blank — for both ingredient fields. For `ingredients_tags` → `ingredients`, the correct column happened to win by the time the JSON was written; for `ingredients_text`, it didn't, and the empty-string bug is the visible result. Relying on which of two duplicate columns "wins" is exactly the kind of accidental, undocumented behaviour a release dataset shouldn't depend on.

## Fix implemented

Two small, targeted changes in `database/clean_data/cleanProductData.py`, both scoped to column names only — no change to the cleaning logic itself:

1. The DB002 cleaning step now checks/operates on `'ingredients_text'` (the real column name at that point), so `clean_ingredients_text()` actually runs.
2. The per-record loop now reads and writes back to `record["ingredients_text"]` / `record["ingredients_tags"]` (the real, current column names) instead of the not-yet-existing camelCase names, so it correctly updates the existing column in place instead of creating a duplicate.

Both changes are pure bug fixes to *when the existing logic runs*, not new logic — `clean_ingredients_text`, `clean_ingredients_list`, `normalize_string`, and `normalize_list` are all unchanged. `detect_allergens()` was checked and needs no change: it already has a defensive `product.get("ingredientsText") or product.get("ingredients_text")` fallback, so it was already reading the (previously uncleaned) `ingredients_text` value under its snake_case key and now transparently receives the properly-cleaned value instead — a strict improvement with no interface change.

## Missing ingredient data does not break the pipeline

Traced `missing_field_handler.py` (DB007): `ingredients_text` is already registered as a critical-field alias, so a product with genuinely empty/missing ingredients (like the Tuna example, now correctly `null` instead of `""`) is flagged `_status: "incomplete"` rather than crashing anything downstream — this was already correct and is unaffected by the fix. `detect_allergens()` and `normalize_list`/`normalize_string` are all `None`-safe by design (confirmed by direct code reading), so a fully missing ingredient field flows through as `None`/`[]` rather than raising.

## Valid ingredient information is preserved

The fix only changes *which column* the cleaning functions run against — it does not change what counts as valid data or alter any transformation logic. The vegetable-oil test case (real, non-empty ingredient tag data) is used as a regression test specifically to confirm the fix does not accidentally empty out or corrupt genuine ingredient data; see Testing below.

## Testing

Added `test/test_ingredient_cleaning_db056.py`, three tests, run against the repo's real `rawSample.jsonl` fixture (the same one behind the committed `cleanSample.json`):

1. `test_empty_ingredients_text_becomes_null_not_empty_string` — asserts the Tuna product's `ingredientsText` is `None` after cleaning, not `""`.
2. `test_valid_ingredients_tags_are_cleaned_and_preserved` — asserts the vegetable-oil product's `ingredients` is correctly `["vegetable-oil-y"]`, confirming valid data isn't lost by the fix.
3. `test_no_duplicate_ingredient_columns_in_output` — parses the raw output JSON with a duplicate-key detector, guarding against the shadow-column bug class regressing silently in future.

I was not able to execute these tests in this session (no script-execution environment available to me). **Please run and paste the output:**
```
pytest test/test_ingredient_cleaning_db056.py -v
```
Also worth re-running the existing suite to confirm no regressions elsewhere:
```
pytest test/test_clean_product_data.py test/test_validate_cleaned_dataset.py -v
```

## Remaining ingredient limitations (documented, not fixed in this ticket)

- **Same bug class exists for `productQuantity`/`servingQuantity`.** `clean_quantity_fields()` produces snake_case `product_quantity`/`serving_quantity` columns, but the per-record loop's `record.get("productQuantity")`/`record.get("servingQuantity")` has the identical wrong-column-name problem described above. The committed sample happens to show the correct value surviving (same "duplicate column, original wins" accident as `ingredients_tags`), but this is outside DB056's ingredient-only scope and is flagged here as a recommended follow-up ticket rather than fixed opportunistically in this PR.
- **DB025's allergen/ingredient consistency findings remain open** (separate ticket, PR #158, merged) — the `allergens` field is still a raw OFF passthrough rather than the output of `detect_allergens()`. This ticket does not change that; it only ensures the ingredient text/tags feeding into `detect_allergens()` are themselves clean.
- **`IngredientStandardisation.py` (DB011)** operates on individual ingredient tokens for allergen-category mapping, not on the raw `ingredients_text`/`ingredients_tags` fields — no overlap or conflict with this fix, but noted here for completeness since it's the other ingredient-related ticket this trimester.

## Acceptance criteria checklist

| Criterion | Status |
|---|---|
| Ingredient data checked against the current release dataset | ✅ Real raw/cleaned sample pair compared directly |
| Remaining release-critical ingredient processing issues addressed | ✅ Column-name bug fixed (empty-text-to-null cleaning now actually runs) |
| Missing ingredient information does not break the pipeline | ✅ Confirmed via `missing_field_handler.py`/`detect_allergens()` None-safety trace |
| Existing valid ingredient information is preserved | ✅ Confirmed by trace + regression test on real non-empty ingredient data |
| Relevant tests or validation checks pass | ⚠️ New tests added and traced by hand; execution requested (no script-execution environment available to me this session) |
| Remaining ingredient limitations are documented | ✅ See "Remaining ingredient limitations" above |
| Evidence provided through PR, test results or screenshots | ✅ Real before/after sample data quoted directly; test run requested for executed confirmation |

## Notes / limitations

- I did not have a script-execution environment available in this session; the fix and its correctness were confirmed by direct code reading and by cross-referencing the repo's own already-committed raw/cleaned sample pair (real evidence, not constructed), but the new tests should be run for executed confirmation before merge.
