# DB030 — Investigate Nutrition Data Consistency

**Ticket:** DB030 – Investigate Nutrition Data Consistency
**Repo:** Food-Remedy_API
**Type:** Investigation / documentation — **no application code changed**
**Author:** Barbie Mahajan (s223514755@deakin.edu.au)

No naming collision was found for DB030 before starting (checked `Documents/Database/` and the codebase for existing `DB030*` files).

---

## Summary

The repository has **two separate, non-integrated nutrition-cleaning code paths**, and neither one — nor the validators downstream of them — correctly handles all six data-quality categories the ticket asks about. The most significant finding: the script that actually produced the current cleaned/seed dataset (`cleanProductData.py`) silently converts **both missing (`null`) and unparseable/malformed nutrient values to `0`**, making bad data indistinguishable from a genuine zero. A second module (`NutrientUnitNormalisation.py`) handles missing values correctly (propagates `None`) and does real unit conversion, but it isn't the code path used to build the actual dataset — it's wired into a separate pipeline stage that's disabled in the committed config. A third, standalone QA script (`scripts/validate_cleaned_dataset.py`) does detect negative nutrient values, but only after the null-to-zero collapse has already happened, so it can't see the cases that matter most, and it isn't run automatically as part of the pipeline. No layer anywhere checks for unrealistic/suspicious magnitudes (e.g. an impossible >100g-per-100g value).

## Files reviewed

| File | Role |
|---|---|
| `database/clean_data/cleanProductData.py` | Standalone cleaning script (DB001/DB002/DB004/DB007/DB017/DB023 logic combined) — the actual source of the current `cleanSample.json` / seed dataset |
| `utils/missing_value_utils.py` | Shared helpers (`normalize_dict`, `clean_numeric`) used by `cleanProductData.py` for nutriment cleaning |
| `database/clean_data/normalization/NutrientUnitNormalisation.py` | Separate, more thorough unit-normalisation module (mass → g, sodium → mg, energy → kJ/kcal both ways) with its own negative-clipping and unit tests |
| `database/pipeline/stages/clean_stage.py` | The pipeline's orchestrated clean stage — calls `NutrientUnitNormalisation`, **not** `cleanProductData.py` |
| `database/pipeline/pipeline.config.json` | Committed config — `clean.enabled: false`, confirming the orchestrated clean stage (and therefore `NutrientUnitNormalisation`) is not part of the pipeline run that produced the current dataset |
| `database/pipeline/modules/missing_field_handler.py` | DB007 — flags `nutriments` as an optional-missing field when the dict is empty; does not look inside a non-empty dict |
| `database/pipeline/modules/pre_seeding_validation.py` | Pre-seed schema check — confirms a handful of nutrient keys are numeric *type*, does not check sign, magnitude, or nulls |
| `scripts/validate_cleaned_dataset.py` | Standalone QA script — flags negative `*_100g`/`*_serving` nutrient values in a report; not wired into `run_pipeline.py` |
| `test/test_validate_cleaned_dataset.py` | Existing test confirming the negative-value check in the script above (`fat_100g: -0.1` → flagged) |
| `test/test_clean_product_data.py` | Existing tests for `cleanProductData.py` (no nutrition-specific coverage currently) |
| `database/pipeline/modules/test_missing_field_handler.py` | Existing tests for DB007 missing-field handling, including an empty-`nutriments` case |
| `database/clean_data/IOExamples/rawSample.jsonl`, `cleanSample.json` | Real raw → cleaned sample pair used as evidence below |
| `database/Reports/dataset_quality_report.py` | DB018 — only checks `nutriments` presence rate as a core field, no per-nutrient quality checks |

---

## 1. Missing nutrition values

Real example found in the raw sample: product `9300633391645` ("vegetable oil", Woolworths) has a `nutriments` dict containing only Open Food Facts derived-estimate fields (`fruits-vegetables-*-estimate-from-ingredients_100g/serving`) — **no energy, fat, carbohydrate, sugar, protein, salt, or sodium values at all**, despite vegetable oil obviously being ~100% fat. After `cleanProductData.py`'s `reduce_nutriments()` step (which filters to a fixed macro-nutrient keep-list), this becomes `"nutriments": {}` in the cleaned output — confirmed directly in `cleanSample.json` (barcode `9300633391645`).

**Handled correctly:** yes, for this case. `missing_field_handler.py`'s `_nutriments_is_missing()` treats an empty dict as missing, so this product is correctly flagged `nutriments` under `_missing.optional`.

## 2. Null or empty nutrition fields

This is the ticket's most important finding. `cleanProductData.py`'s `main()` runs, per record:

```python
record["nutriments"] = normalize_dict(record.get("nutriments", {}), default=0, recurse=True)
```

Inside `normalize_dict` (`utils/missing_value_utils.py`), every non-dict, non-list value in the nutriments dict is passed through `clean_numeric(v, default)` with `default=0`:

```python
def clean_numeric(value, default=None):
    if value is None:
        return default          # None -> 0
    try:
        return float(value)
    except (ValueError, TypeError):
        return default          # unparseable string -> 0
```

So if a raw record has a nutrient **key present with an explicit `null` value** (common in Open Food Facts exports), or a non-numeric placeholder string (e.g. `"traces"`, `"unknown"`, `"< 0.5"`), that value is **silently rewritten to `0`** during cleaning. There is no flag, log line, or downstream signal distinguishing "we don't actually know this value" from "this product genuinely has zero of this nutrient." The current 11-record raw sample doesn't happen to contain an explicit-null nutrient key, so I traced this with a constructed example instead — see "Testing" below for the exact call and result, and the request to run it for confirmed evidence.

**Handled correctly: no.** This directly collapses two of the ticket's categories (missing values, null fields) into a third (zero values) in a way nothing downstream can undo or even detect.

## 3. Negative or unexpected values

Three different behaviours exist depending on which code path a value goes through:

- **`cleanProductData.py`'s actual path** (the one that built the current dataset): `clean_numeric()` simply does `float(value)` — a negative number passes straight through unchanged. No clipping, no flag.
- **`NutrientUnitNormalisation.py`** (used only by the orchestrated `clean_stage.py`, which is disabled in the committed pipeline config): `safe_round()` clips any negative result to `0.0` — silently. This "fixes" the symptom but destroys the evidence that the source data was bad, and produces the same ambiguous zero as Finding 2.
- **`scripts/validate_cleaned_dataset.py`** (a separate, manually-run QA script, not part of `run_pipeline.py`): does correctly detect negative values in any `*_100g`/`*_serving` key and lists them in its report — confirmed by the existing test `test_validate_flags_inconsistencies` (`nutriments.fat_100g: -0.1` is caught). But this script runs *after* `cleanProductData.py`, so any negative value that arrived as a null/malformed string would already have been collapsed to `0` by Finding 2 before this script ever sees it — it can only catch negatives that survived cleaning as literal negative numbers, which is a narrower set than the ticket's "negative or unexpected values" category implies.

**Handled correctly: partially, and inconsistently between code paths.** Depends entirely on which cleaning script produced the data and whether the separate QA script was remembered to be run.

## 4. Unusual zero values

No code anywhere distinguishes a genuine zero (a product that truly has 0g sugar) from a zero produced by Finding 2's null-collapse or Finding 3's negative-clipping. Once a value is `0` in the cleaned/seeded dataset, its origin is unrecoverable from the data alone.

**Handled correctly: no.**

## 5. Inconsistent nutrition units

`NutrientUnitNormalisation.py` does this well when it runs: it recognises `g/gram/grams`, `mg/milligram(s)`, `ug/mcg/microgram(s)`, `kg/kilogram(s)` for mass, and `kj/kilojoule(s)`, `j/joule(s)`, `kcal/cal/kilocalorie(s)` for energy, converting everything to a single target unit per nutrient (grams, or mg for sodium, or both kJ and kcal for energy). Its own bundled tests (`_test_convert_energy`, `_test_mass_to_grams`, `_test_parse_numeric_and_unit`) pass on direct code trace. An unrecognised unit returns `None` silently rather than logging a warning, so a genuinely-present-but-oddly-labelled value (e.g. a typo'd unit) disappears without trace.

However, **this module is not in the path that produced the actual dataset.** `cleanProductData.py` does not call it at all — it keeps whatever value is already under a `*_100g` key as-is, trusting that Open Food Facts' own `_100g` suffix already means "per 100g" in the implied unit (grams for mass, kcal/kJ for the matching energy key) without verifying it. If a source record ever has a mass nutrient value in the wrong unit under a `_100g` key (e.g. milligrams mislabeled as the `_100g` value), nothing in the actual cleaning path would catch or convert it.

**Handled correctly: only in the code path that isn't actually used for the real dataset.**

## 6. Unrealistic or suspicious nutrition values

No file reviewed contains any upper-bound or plausibility check — nothing rejects or flags, for example, `proteins_100g: 500` (impossible, since per-100g values cannot exceed 100 for a single macro in isolation, and combined macros can't exceed the product's own mass) or `energy-kcal_100g` far outside any realistic food range. `pre_seeding_validation.py`'s nutrient check only verifies the value is numeric, not that it's plausible.

**Handled correctly: no — not handled at all, anywhere.**

---

## Does the current cleaning/validation process handle these cases correctly? (Summary)

| Category | Handled correctly? | Why |
|---|---|---|
| Missing values (whole `nutriments` empty) | ✅ Yes | `missing_field_handler.py` correctly flags an empty dict |
| Null / empty individual fields | ❌ No | Silently collapsed to `0` by `cleanProductData.py`'s `normalize_dict(default=0)` |
| Negative values | ⚠️ Partial / inconsistent | Passed through unchanged, silently clipped to 0, or flagged-but-unfixed, depending on which of three code paths runs |
| Unusual zero values | ❌ No | Indistinguishable from collapsed nulls/negatives once cleaned |
| Inconsistent units | ⚠️ Partial | Handled well by `NutrientUnitNormalisation.py`, but that module isn't in the path used to build the actual dataset |
| Unrealistic/suspicious values | ❌ No | No plausibility/range checks exist anywhere in the reviewed code |

---

## Testing

**Valid data (no incorrect changes):** product `9300633714437` ("Tuna Tomato and Onion") has a full, realistic nutriments dict (`energy-kcal_100g: 155`, `fat_100g: 8.63`, `proteins_100g: 13.4`, `carbohydrates_100g: 5.89`, etc.). Tracing it through `cleanProductData.py`'s `normalize_dict(..., default=0, recurse=True)`: every value is already numeric, so `clean_numeric()` just does `float(value)` and returns it unchanged. **Confirmed: valid nutrition data is not altered by this step.**

**Missing nutrition values:** product `9300633391645` ("vegetable oil") — see Finding 1. Real evidence from the committed raw/clean sample pair; empty `nutriments: {}` is correctly flagged missing.

**Null / invalid values (constructed test case, not present in the current 11-row sample — traced by code reading, not executed, since no script-execution environment was available to me this session):**

```python
from utils.missing_value_utils import normalize_dict

sample = {
    "sugars_100g": None,          # explicit null, e.g. from an OFF export
    "fat_100g": "traces",         # non-numeric placeholder text
    "proteins_100g": -2.5,        # negative value
    "energy-kcal_100g": 155,      # valid value, for comparison
}

print(normalize_dict(sample, default=0, recurse=True))
# Traced result: {'sugars_100g': 0, 'fat_100g': 0, 'proteins_100g': -2.5, 'energy-kcal_100g': 155.0}
```

This traces out exactly as Findings 2 and 3 describe: the `None` and the unparseable string both become `0` (indistinguishable from real zero sugar/fat), the negative value passes through untouched (this specific code path doesn't clip), and the valid value is preserved unchanged. **To convert this from a traced result into executed evidence, please run the snippet above** (e.g. via `python -c "..."` from the repo root) and paste the output.

**Existing regression coverage worth (re)running for this ticket:**
```
pytest test/test_validate_cleaned_dataset.py -v
```
This exercises the one place in the repo that does catch a negative nutrient value (`test_validate_flags_inconsistencies`), confirming that check still works — while this investigation shows *why* it isn't sufficient on its own (it never sees values that were already collapsed to zero upstream).

```
python scripts/validate_cleaned_dataset.py --input database/clean_data/cleanSample.json
```
Run against the actual cleaned sample to get a live report of what this QA script currently catches (and, by omission, confirm it reports nothing about the vegetable-oil product's empty `nutriments`, since that check isn't in this script's scope — it's handled separately by `missing_field_handler.py`, which runs on a different data shape).

---

## Recommendations

1. **Stop defaulting missing/unparseable nutrient values to `0`.** Change `cleanProductData.py`'s `normalize_dict(nutriments, default=0, recurse=True)` call (or `clean_numeric`'s default) so a `None`/unparseable nutrient value becomes `None` in the cleaned output, not `0` — matching how `NutrientUnitNormalisation.py` already does it correctly. This is the single highest-impact fix; every other finding here is downstream of it.
2. **Reconcile the two nutrient-cleaning implementations.** Either wire `NutrientUnitNormalisation.py`'s unit conversion into `cleanProductData.py`'s actual pipeline, or retire one of the two — right now the more correct implementation isn't the one producing real data.
3. **Add a plausibility/range check** for the standard macro fields (e.g. `0 ≤ value ≤ 100` for `*_100g` percentages-of-mass, a sane upper bound for `energy-kcal_100g`) to `pre_seeding_validation.py` or `scripts/validate_cleaned_dataset.py`, so unrealistic values are actually caught somewhere.
4. **Run `scripts/validate_cleaned_dataset.py` as part of the pipeline**, not just manually, so its existing negative-value check (and the range check from #3) run on every dataset build rather than depending on someone remembering to invoke it.
5. **Distinguish a real zero from a defaulted zero** if recommendation #1 isn't adopted immediately — e.g. keep the value `None` and only substitute `0` at the point of use (mobile app scoring), never in the stored/cleaned record, so the ambiguity is confined to a single, well-understood boundary instead of being baked into the dataset.
6. **Log unrecognised units** in `NutrientUnitNormalisation.py` instead of silently returning `None`, so unusual/unexpected unit strings are visible for manual review rather than disappearing.

## Acceptance criteria checklist

| Criterion | Status |
|---|---|
| Missing nutrition values investigated | ✅ Section 1 |
| Null or empty nutrition fields investigated | ✅ Section 2 |
| Negative or unexpected values investigated | ✅ Section 3 |
| Unusual zero values investigated | ✅ Section 4 |
| Inconsistent nutrition units investigated | ✅ Section 5 |
| Unrealistic or suspicious values investigated | ✅ Section 6 |
| Determined whether current cleaning/validation handles these correctly | ✅ Summary table |
| Tested products with valid nutrition data | ✅ Tuna product, traced — unchanged |
| Tested products with missing nutrition values | ✅ Vegetable oil product, real evidence |
| Tested unusual/invalid values | ✅ Constructed case traced; runnable snippet provided for executed confirmation |
| Confirmed valid nutrition information is not incorrectly changed | ✅ Confirmed via trace |
| Ran applicable tests | ⚠️ Identified and traced; `pytest test/test_validate_cleaned_dataset.py -v` recommended to run for live confirmation (no script-execution environment available to me this session) |
| No existing functionality changed | ✅ Investigation only |

## Notes / limitations

- This was a documentation/investigation ticket; no application code was modified.
- The current 11-record raw sample (`rawSample.jsonl`) doesn't happen to contain an explicit-null or negative nutrient value, so Findings 2 and 3 are demonstrated with a small constructed example traced through the actual code, not pulled from the committed sample. The finding itself (what the code does with such input) is not in doubt — it's a direct read of `clean_numeric`'s `except` branch and `None` branch — but running the provided snippet would convert this from traced to executed evidence.
- I did not have a script-execution environment available in this session; all behaviour above was confirmed by direct code reading rather than running Python.
