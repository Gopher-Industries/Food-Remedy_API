# DB026 — Investigate Missing Ingredient Information

**Investigated:** 2026-08-13
**Related ticket:** DB023 (reference — allergen handling precedent), DB007 (missing-value handling — see Patterns below)

## Summary

This investigation looked at how ingredient information (`ingredients_text` / `ingredients_tags` on raw OpenFoodFacts records, mapped to `ingredientsText` / `ingredients` in the Product Detail contract) is stored, cleaned, validated, and consumed downstream.

Using a 61-record OpenFoodFacts Australia sample (`rawSample.jsonl`), **24 of 61 records (39.3%) are missing ingredient information entirely** — both `ingredients_text` and `ingredients_tags` empty/null at the same time.

While tracing the cleaning code, I found and verified (by running the relevant functions in isolation) a column-naming bug in `cleanProductData.py` that causes the ingredient-specific cleaning step to silently no-op. The practical effect is that the final cleaned output can contain `"ingredients": null`, which is not valid against the `product_detail_v1` contract (`ingredients` is a non-nullable array, default `[]`). This is not caught by either validator reviewed (`schema_validator.py` or `db021_validator.py`), and creates a confirmed crash risk in `IngredientStandardisation.product_standardise()`.

Notably, DB007 ("Handle Missing & Unknown Values") reports itself 100% complete and states its normalisation utilities were "applied to all key fields in pipeline (ingredients, nutriments, categories, quantity, traces, palm-oil)." That fix is real and correctly coded — it just doesn't execute for `ingredients`/`ingredientsText` specifically, due to the naming-timing bug, and no existing test (DB007's or otherwise) exercises the pipeline at the level that would have caught it.

No code was changed as part of this investigation, per the ticket's acceptance criteria.

## Current Ingredient Storage

**Raw input (OpenFoodFacts, snake_case):**
- `ingredients_text` — free-text ingredient statement, as printed on the label (e.g. `"sugar, cocoa mass, milk fat"`)
- `ingredients_tags` — list of OFF-normalised slugs, usually language-prefixed (e.g. `"en:sugar"`, `"en:cocoa-paste"`)
- `ingredients_analysis_tags` — derived tags (`en:palm-oil-free`, `en:vegan`, etc.)
- `ingredients_from_palm_oil_n` — numeric indicator, largely unrelated to this ticket

**Intended contract output (camelCase, per `contracts/product_detail_v1.schema.json`, mirrored in `api/contracts/product_v1.json`):**
- `ingredients: string[]` — `"default": []`, **not nullable**
- `ingredientsText: string | null`

**Downstream consumer:** `database/normalization/IngredientStandardisation.py` reads the `ingredients` field and produces a derived `standardisedIngredients` field, mapping known variants to ~20 canonical categories (e.g. `sucrose → sugar`) via a fixed dictionary, with unrecognised tokens passed through unchanged as a "safe fallback."

**Contrast with allergens:** DB023 established `["Unknown"]` as an explicit, contract-level sentinel for missing allergen data, specifically because a silent `[]` could be misread as "confirmed allergen-free" (a safety issue). **Ingredients has no equivalent sentinel** — missing ingredient data has no single, deliberate representation (see Patterns below).

## Missing / Empty Cases Found

Analysed all 61 records in the supplied OpenFoodFacts Australia sample:

| Finding | Count | % |
|---|---|---|
| Both `ingredients_text` and `ingredients_tags` missing/empty | 24 / 61 | 39.3% |
| `ingredients_text` present but `ingredients_tags` empty (or vice versa) | 0 / 61 | 0% |

The two fields are **never missing independently** in this sample — they're always missing together, which suggests a shared upstream cause (e.g. both are populated, or not, from the same OCR/scrape step) rather than two independently-failing extraction paths.

`completeness` for the 24 fully-missing records ranges from **0.16 to 0.79**. Several records with a comparatively high completeness score (e.g. `0.7875`) are still completely missing ingredient data — **`completeness` alone is not a reliable signal for "has ingredient data."**

`db021_validator.py`'s barcode-validation docstring references a much larger dataset, `database/seeding/products_5k_test.json` (5,000 records). This investigation's 39.3% figure is based on the 61-record sample only — worth re-checking against the larger dataset before treating it as a firm baseline (see Recommendations).

Beyond outright-missing cases, a meaningful subset of *present* ingredient data is low quality: OCR character substitution, truncated/garbled text, and non-ingredient content (phone numbers, addresses, brewing instructions) embedded directly inside `ingredients_text` and mirrored into `ingredients_tags` as nonsense tokens.

## Representative Examples

**1. Fully missing, low completeness** — `0011210681101` (Tabasco, product name also blank): `ingredients_text: null`, `ingredients_tags: null`, `completeness: 0.26`.

**2. Fully missing, deceptively high completeness** — `0013409516003` (Sweet Baby Ray's, "Honey Teriyaki Marinade & Sauce"): `ingredients_text: ""`, `ingredients_tags: null`, `completeness: 0.79`. Same pattern in `0071567994767` (Jelly Belly, "BELLY FLOPS", completeness 0.79) and `0071570016852` (Arogant Frog wine, completeness 0.77).

**3. Blank shell record** — `0020662020154`: brand, product name, *and* ingredients all empty; only a barcode and category survive. Completeness 0.16.

**4. Non-ingredient content embedded in the field** — `0013409516072` (Sweet Baby Ray's, "Honey Barbecue Sauce"): `ingredients_text` ends with `"...natural smoke flavor, molasses, dried garlic, corn syrup, sugar, tamarind. rmation 0ml per 100 ml 1004kj (240 cal) imported by the food connection unit 207a, 12-14 solent circuit 60 baulkham hills nsw 2153, australia 60 ph: (02)8824 6522..."`. The address/phone text was also tokenised into `ingredients_tags` as `en:rmation-0ml-per-100-ml-1004kj`, `en:imported-by-the-food-connection-unit-207a`, `en:12-14-solent-circuit-60-baulkham-hills-nsw-2153`, etc.

**5. Truncated / garbled text with junk tags** — `0012524702117` (Tom Clark's, "Caramel Popcorn"): `"...CONTAINS: MILK & SOY May Contaln Cas can and Macadamia , Almond, Peanut, ge nstructions: Stored in a cool"` — cut off mid-sentence, with typos ("Contaln"). Produces junk tags `en:may-contaln-cas-can` and `en:ge-nstructions`.

**6. OCR character substitution (present but corrupted)** — `0038900013400` (Dole, "Pineapple slices in juice"): `"P|NEAPPLE (69%), PINEAPPLE JUICE (31%)"` — a pipe character in place of "I". Also `0009542005979` (Lindt): `"...CcOCoa butter..."`.

**7. Non-ingredient instruction text leaking in** — `0070177187804` (Twinings, "Lemon & Ginger"): ingredient list ends with `"...citric acid. 2-5 minutes"` — a brewing instruction, not an ingredient.

## Current Pipeline Handling

### `cleanProductData.py` — the ingredient-specific cleaning bug

Tracing `main()`, I found a concrete bug rather than just a gap, and reproduced it directly (isolated the relevant functions and ran them against sample-shaped data).

**The bug:** The "DB002 — Enhanced ingredient cleaning" block runs *before* the pipeline's camelCase rename step (`camelise_columns` / `rename_specific_columns` run at the very end of `main()`). At the point this block executes, the dataframe still has raw, snake_case column names:

```python
if 'ingredientsText' in df.columns:                 # never true at this point —
    df['ingredientsText'] = df['ingredientsText'].apply(clean_ingredients_text)   # real column is still 'ingredients_text'
if 'ingredients_tags' in df.columns:                 # true — this one does run
    df['ingredients_tags'] = df['ingredients_tags'].apply(clean_ingredients_list)
```

So `clean_ingredients_text` (whose own docstring says "Convert empty/whitespace ingredientsText → None") **never actually runs**. `clean_ingredients_list` **does** run correctly against `ingredients_tags` (dedup, lang-prefix strip, one hardcoded typo fix, empty → `None`).

The same mismatch repeats in the per-row loop further down (part of DB007's fix):
```python
record["ingredientsText"] = normalize_string(record.get("ingredientsText"))   # no-op, key doesn't exist yet
record["ingredients"] = normalize_list(record.get("ingredients"))             # no-op, key doesn't exist yet
```
I confirmed with a minimal pandas repro that `df.loc[idx] = record` **silently drops** any key in `record` that isn't already a DataFrame column — no error, no new column created. So these two normalisation calls (DB007's fields-covered list explicitly includes "ingredients") are complete no-ops.

**Net effect, confirmed by running the real sequence of operations on sample-shaped rows:**
- An empty raw `ingredients_text` (`""`) survives unmodified to `"ingredientsText": ""` — not `null` — contradicting the cleaning function's own intent (still schema-valid, since the contract allows `string | null`, but inconsistent).
- An empty raw `ingredients_tags` (`[]`) becomes `"ingredients": null` in final output (via `clean_ingredients_list`'s `if not tags: return None`) — and this **is** a contract violation, since `ingredients` is defined as a non-nullable array with `"default": []`.

### Two validators, same shape of gap

**`database/pipeline/modules/schema_validator.py`** checks `barcode`, `productName`, `nutriments` type, `allergens` type, `categories` type, and `completeness` range. No `ingredients`/`ingredientsText` check of any kind. Invalid records are logged to a report but the record still passes through to `output_path` unchanged.

**`database/Validation/db021_validator.py`** is a separate, more elaborate validator with the same pattern: dedicated, unconditional methods exist for `validate_nutrients()` and `validate_allergens()`, but there is **no `validate_ingredients()`**. The only path by which `ingredients` could be checked is the generic, schema-config-driven `validate_full_schema()` → `validate_record_schema()`, which depends on an external schema file (loaded via `schema_loader.load_schema()`) that wasn't supplied for this investigation, so I can't confirm whether `ingredients` is defined there at all.

More importantly, `validate_record_schema()` has a structural gap independent of that config:
```python
if value is None:
    continue          # skips the type check entirely for non-required fields
if not self.validate_type(value, rules["type"]):
    errors.append(f"{field_name} wrong type")
```
A field is only checked against `None` *before* this if it's marked `"required": True`. `ingredients` has a contract default of `[]`, implying it would be defined as optional — meaning even if a future schema config adds an `ingredients: {type: array}` entry, a `None` value would still silently skip the type check and pass validation. This is a real, verifiable blind spot in the validator's own logic, separate from whether the config currently includes the field.

**Downstream crash risk.** `IngredientStandardisation.product_standardise()` reads the field as `product.get("ingredients", [])`. This default only applies when the key is **absent**, not when it's present with value `None`. Reproduced directly: `product_standardise({"ingredients": None})` raises `TypeError: 'NoneType' object is not iterable`, while `product_standardise({})` (key absent) returns `[]` correctly. Given the bug above can produce `ingredients: null` in cleaned output, this is a reachable crash path.

### Test coverage doesn't protect against any of this

`test_clean_product_data.py` — despite its name — contains exactly two tests, both for `clean_completeness()` (imported directly from `missing_value_utils.py`). It does not test `cleanProductData.main()` end-to-end, and does not test `clean_ingredients_text()` or `clean_ingredients_list()` at all. `test_missing_values.py` (DB007's own test file) only exercises the utility functions in isolation with hand-picked inputs — never through `cleanProductData.py`'s actual pipeline. Neither test file would catch this bug.

**Two pipeline files reviewed with no ingredient-specific logic:**
- `database/pipeline/stages/clean_stage.py` — a separate flattening stage (JSON-stringifies list/dict fields, normalises nutrient units). I did not have access to a pipeline orchestrator/runner file, so I can't confirm whether this and `cleanProductData.py` run sequentially on the same data or are separate paths — worth clarifying with the team.

## Patterns & Likely Causes

1. **Missing text and missing tags always co-occur** (0/61 records had one without the other) — points to a single shared upstream cause (scrape/OCR extraction step), not two independently unreliable fields.
2. **DB007 believed it had resolved this exact problem, and its fix is correctly written — it just doesn't execute for this field.** DB007's completion notes explicitly list "ingredients" among the fields the missing-value utilities were applied to, and cite passing tests as evidence. The utilities themselves are correct; the integration point in `cleanProductData.py` silently fails to invoke them due to the naming-timing bug, and no test operates at the layer that would expose this (utility-level tests pass; there's no pipeline-integration-level test).
3. **No canonical "missing" representation for ingredients.** `clean_ingredients_list()` produces `None` for empty tags, while `missing_value_utils.normalize_list()` (the DB007 utility meant to be applied) produces `[]` for the same case — and due to the bug, only the `None`-producing path is actually reachable. Allergens avoided this ambiguity via DB023's single explicit `["Unknown"]` sentinel; ingredients has no equivalent.
4. **Two independent validators, same structural gap.** Both `schema_validator.py` and `db021_validator.py` give allergens and nutrients dedicated, unconditional checks, but neither has an equivalent for ingredients. `db021_validator.py`'s generic schema-driven path additionally skips type-checking on `None` for any field not marked `required` — a gap that would persist even if ingredients were added to the schema config later.
5. **OCR/scrape noise is never filtered**, only mechanically processed (lang-prefix stripped, lowercased, deduped). Address fragments, phone numbers, and brewing instructions become indistinguishable from real ingredient tokens once tokenised, and `IngredientStandardisation`'s "safe fallback" (return unmapped tokens unchanged) preserves this garbage verbatim into `standardisedIngredients`.

## Recommendations

*(For a future ticket — no changes made here.)*

- Fix the column-naming timing bug in `cleanProductData.py`: either move the camelCase/field rename earlier in `main()`, or have the DB002 block and per-row loop reference the raw snake_case names consistently until the rename actually happens. This alone would make DB007's existing (correct) fix actually take effect for this field.
- Decide and document one canonical representation for missing ingredients (most likely `[]` for `ingredients`, to match the existing contract default, plus `null` for `ingredientsText`) and confirm the reachable code path actually produces it.
- Consider whether ingredients needs an explicit missing-data signal at all, similar to allergens' `["Unknown"]` — worth a product discussion, since a silent `[]` could be misread as "this product has no ingredients" rather than "we don't have this data."
- Add a dedicated `validate_ingredients()` method to `db021_validator.py`, mirroring `validate_allergens`/`validate_nutrients`, rather than relying solely on the generic schema-driven path. If the schema-driven path is preferred instead, either mark `ingredients` as `required` in the schema config or adjust `validate_record_schema`'s `if value is None: continue` so optional-but-typed fields are still type-checked.
- Add the equivalent check to `schema_validator.py::_validate_record()`.
- Add integration-level tests that run `cleanProductData.main()` end-to-end on a small fixture and assert on the final `ingredients`/`ingredientsText` output — this is the layer where the current bug would actually be caught; existing tests only cover the utility functions in isolation.
- Make `IngredientStandardisation.product_standardise()` defensive against an explicit `None` value (e.g. `product.get("ingredients") or []`) as defense-in-depth, independent of the upstream fix.
- Consider a lightweight garbage-token heuristic before `ingredients_tags` reaches standardisation (e.g. flag tokens that are unusually long, numeric-heavy, or contain address/phone-like patterns).
- Re-run this investigation's missing/empty-ingredients frequency analysis against `database/seeding/products_5k_test.json` (5,000 records) rather than relying solely on the 61-record sample used here, for a statistically sturdier baseline.
- Clarify with the team whether `cleanProductData.py` and `database/pipeline/stages/clean_stage.py` are sequential stages of one pipeline or separate/legacy paths.

## Files reviewed

- `database/normalization/IngredientStandardisation.py` — standardisation logic and safe-fallback behaviour; confirmed crash on `ingredients: None` via direct reproduction. *(Note: the file content as provided is headed "IngridientStandardisation.py" (transposed vowels) — the folder structure screenshots don't show a `normalization/` directory directly under `database/`, so worth confirming the actual path/filename in the repo.)*
- `database/clean_data/cleanProductData.py` — main cleaning script; traced and reproduced the column-naming bug described above.
- `utils/missing_value_utils.py` — generic normalisation helpers (`normalize_string`, `normalize_list`, `normalize_allergens`, `normalize_dict`, `clean_numeric`, `clean_completeness`); the utilities DB007 built and believed were fully integrated.
- `test/test_missing_values.py` — DB007's regression coverage; confirms only the utility functions are tested in isolation, not their integration into `cleanProductData.py`.
- `test/test_clean_product_data.py` — confirmed this file, despite its name, only tests `clean_completeness()` and does not exercise ingredient-cleaning behaviour or `cleanProductData.main()`'s output at all.
- `contracts/product_detail_v1.schema.json` and `api/contracts/product_v1.json` — confirmed these are identical mirrors of the same v1.0.1 contract; used to confirm `ingredients` is a non-nullable array (`default: []`) and `ingredientsText` is nullable.
- `database/pipeline/modules/schema_validator.py` — confirmed no `ingredients`/`ingredientsText` validation exists; pass-through behaviour on invalid records.
- `database/Validation/db021_validator.py` — confirmed no dedicated ingredients validation method exists (unlike allergens/nutrients); confirmed a structural gap where `None` values bypass type-checking for non-required fields in `validate_record_schema()`.
- `database/pipeline/stages/clean_stage.py` — reviewed; no ingredient-specific logic, generic list/dict flattening + nutrient normalisation only.
- `database/Validation/DB007-missing-values.md` — completion notes for the ticket that intended to fix this exact issue; used to establish that the current bug represents a regression/gap against work believed complete, not an unaddressed area.
- `database/clean_data/IOExamples/rawSample.jsonl` (OpenFoodFacts Australia sample, 61 records) — used for the missing/empty-case analysis and representative examples above.

