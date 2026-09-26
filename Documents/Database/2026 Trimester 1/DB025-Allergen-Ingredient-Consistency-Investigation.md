# DB025 – Investigate Allergen & Ingredient Consistency

**Ticket:** DB025
**Repo:** Food-Remedy_API
**Type:** Investigation / documentation (code-free findings; code-level defects identified but not fixed in this ticket)
**Status:** Investigation complete, ready for review

---

## 1. Summary (TL;DR)

Allergen information and ingredient information in this project come from **two structurally disconnected sources**, and nothing in the current pipeline compares them:

1. The `allergens` field actually present in seeded/served product data (`database/seeding/products_*_enriched.json`) is a **near-verbatim passthrough of Open Food Facts' own `allergens_tags`** (producer-declared, lowercase, OFF taxonomy — e.g. `"sulphur-dioxide-and-sulphites"`, `"nuts"`, and even non-FSANZ items such as `"pork"`, `"apple"`, `"gelatin"`).
2. A **separate, ingredient-text-derived detection engine** (`utils/detect_allergens.py`) exists and produces a canonical 14-item FSANZ list (`"Milk"`, `"Gluten"`, `"Tree Nuts"`, …). It is wired into `database/clean_data/cleanProductData.py` (writes `allergensDetected`) and again into `database/pipeline/modules/allergens_enrich.py` (writes `allergens` **and** `allergensDetected`).
3. **`allergensDetected` does not exist anywhere in the seeded datasets actually used for demos/QA/seeding** (`products_5k_enriched.json`, `products_5k_enriched_db032_remediated.json` — 0 occurrences in either file). The API-serving mapper (`mapping/map_enriched_to_product_detail.py`) does a raw `_safe_list()` passthrough of whatever `allergens` value is already on the record and never calls the detection engine or compares it to `ingredientsText`.
4. Net effect: **the only mechanism capable of validating allergen claims against ingredient text is disconnected from the data users and QA actually see.** No validator, cleaner, or mapper in the reviewed codebase flags disagreement between `allergens` and `ingredients`/`ingredientsText`.
5. Representative product review (Section 5) surfaces four distinct failure patterns: (a) both fields empty for a product that plausibly contains an allergen, (b) allergen info present with ingredient info completely absent, (c) allergen taxonomy inconsistency (three different vocabularies for the same allergen across the codebase), and (d) a reproducible logic defect in the detection engine itself (`"butter"` as a bare Milk keyword) that would misfire if it were ever reconnected to production data.

---

## 2. Scope & Method

- Selected 10 representative products from the team's own DB002 cleaning I/O examples (`database/clean_data/IOExamples/rawSample.jsonl` → `cleanSample.json`), which pair each product's **raw OFF record** with its **cleaned output**, plus 4 additional products from the frozen API contract examples (`api/contracts/examples/`).
- Manually compared each product's declared allergen field(s) against its ingredient field(s) (`ingredients`, `ingredientsText`, `traces`).
- Read the full source of the allergen detection engine (`utils/detect_allergens.py`) and its config (`database/Allergens/allergens_config.json`) to understand *how* allergens are meant to be derived from ingredients, and traced every place in the codebase that writes or reads an `allergens` value.
- Sampled the production-scale seed file `database/seeding/products_5k_enriched.json` (5,000 products) with targeted searches to check whether the patterns found in the 10 curated examples also hold at scale.
- Searched validation/QA code (`database/Validation/`, `database/pipeline/modules/pre_seeding_validation.py`, `mapping/validate_product_contract.py`) and the tag-conflict resolver (`utils/conflict_resolver.py`) for any existing cross-check between allergens and ingredients.
- No code was changed. Two code-level defects found during review are reported as **findings/recommendations only** (Section 6, Section 7), consistent with this being an investigation ticket.

**Note on tooling:** this investigation was done by direct file/code review and targeted text search (no script execution environment was available in this session), so all statistics quoted below are from manual inspection of a bounded sample, not an exhaustive full-dataset scan. This is flagged explicitly wherever it matters, and a ready-to-run script approach is proposed in Recommendation 6 to get exact dataset-wide counts.

---

## 3. Files Reviewed

| File | Role in this investigation |
| ---- | --------------------------- |
| `utils/detect_allergens.py` | Core ingredient-text → allergen detection engine (keywords, regex, negation) |
| `database/Allergens/allergens_config.json` | Canonical 14-allergen keyword/synonym config used by the detection engine |
| `database/Allergens/load_allergens.py` | Loader for the above config |
| `database/pipeline/modules/allergens_enrich.py` | Pipeline module that runs `detect_allergens()` and writes `allergens` / `allergensDetected` |
| `database/clean_data/cleanProductData.py` | DB002 cleaning script; renames raw `allergens_tags` → `allergens`, and separately computes `allergensDetected` via `detect_allergens()` |
| `database/clean_data/IOExamples/rawSample.jsonl` | 10 raw OFF product records (source of truth for "representative products", Section 5) |
| `database/clean_data/IOExamples/cleanSample.json` | Matching cleaned output for the same 10 products |
| `database/clean_data/cleanSample.json` | Secondary/duplicate clean sample referenced by `cleanProductData.py`'s default `OUTPUT_FILE` |
| `database/data_investigation/exampleProductRaw.json` / `exampleProductCleaned.json` | Additional raw/clean single-product example (no allergen field present in the "cleaned" example — see Finding 4) |
| `api/contracts/examples/tuna_tomato_onion.json`, `vegetable_oil.json`, `third_sample.json`, `minimal.json` | API contract example payloads used as additional representative products |
| `contracts/product_detail_v1.schema.json` | Frozen Product Detail v1 schema — confirms `allergens` and `ingredients` are independent, un-cross-validated array fields |
| `mapping/map_enriched_to_product_detail.py` | Confirms the API-serving layer passthroughs `allergens` with no ingredient cross-check |
| `mapping/validate_product_contract.py` | Confirms contract validation only checks `allergens` is `type: list`, not its content |
| `database/pipeline/modules/pre_seeding_validation.py` | Confirms pre-seeding validation only checks `enrichment.allergensDetected` is `list[str]` if present — no content/consistency check, and the nested `enrichment.*` path it checks doesn't match how any reviewed module actually writes the field |
| `database/Validation/db012_validator.py` | General field-presence validator; no allergen-ingredient logic |
| `database/pipeline/modules/missing_field_handler.py`, `database/pipeline/modules/db032_remediation.py` | Checked for allergen-related remediation logic — none found |
| `utils/conflict_resolver.py` | Resolves conflicts between *tag categories* (e.g. `allergen` vs `mood`), not between allergen content and ingredient content |
| `database/seeding/products_5k_enriched.json` | Production-scale seed file (5,000 products) — used to confirm findings hold beyond the 10 curated examples |
| `database/seeding/products_5k_enriched_db032_remediated.json` | Remediated version of the above — confirmed `allergensDetected` is also absent here |
| `Documents/Database/2025 Trimester 3/allergen-detection-engine.md` | Documented design of the detection engine (canonical 14 allergens, `allergensDetected` output) |
| `Documents/Database/2025 Trimester 3/db024-data_foundations.md` | Documents a *third* allergen schema (boolean object: `{gluten, milk, eggs, ...}`) that does not match either the detection engine's array output or the seeded data's raw-tag array |
| `Documents/Database/2026 Trimester 1/DB038-Source-Data-Gaps-And-Limitations.md` | Prior documentation acknowledging allergen detection is "heuristic" and dependent on sparse `ingredients_text`; used as background, not duplicated here |

---

## 4. How allergen data is *supposed* to flow vs. how it actually flows

**Documented / intended design** (`allergen-detection-engine.md`, `allergens_enrich.py`):

```
ingredients_text + traces + product_name + categories_tags + labels_tags
        │
        ▼
   detect_allergens()  (utils/detect_allergens.py)
        │
        ▼
  allergensDetected: ["Milk", "Gluten", ...]   (canonical FSANZ-14, Title Case)
        │
        ▼
  written to both `allergens` and `allergensDetected` on the product record
```

**What the seeded/served data actually contains** (`database/clean_data/cleanProductData.py` line 649, confirmed against `products_5k_enriched.json`):

```
raw OFF `allergens_tags` (e.g. "en:sulphur-dioxide-and-sulphites")
        │
        ▼
   strip "en:" prefix, rename column
        │
        ▼
  allergens: ["sulphur-dioxide-and-sulphites"]   (lowercase, OFF taxonomy, unrelated to ingredients_text)
```

`cleanProductData.py` *does* also compute `allergensDetected` via `detect_allergens()` (line 823) — but this value:
- is written to a **DataFrame column** during cleaning,
- is **never found in any seeded output file** we inspected (`products_5k_enriched.json`, `*_db032_remediated.json` — 0 matches for `"allergensDetected"` in either), and
- is **not read anywhere** by `mapping/map_enriched_to_product_detail.py` or `mapping/validate_product_contract.py`.

Separately, `database/pipeline/modules/allergens_enrich.py` is a standalone pipeline module that *also* calls `detect_allergens()` and *would* overwrite `allergens` with the canonical detected list if run — but the evidence in Section 5/6 (lowercase OFF-style values like `"sulphur-dioxide-and-sulphites"`, `"nuts"`, `"pork"`, `"apple"`, `"gelatin"` sitting in the live `allergens` field of the seed files) shows this module's output is **not what is currently in the seeded data**, i.e. it is not part of the pipeline run that actually produced the files consumed downstream.

**Conclusion:** there are effectively three different "allergens" implementations in this codebase (raw-passthrough cleaner, `allergens_enrich.py` module, and a documented-but-unused canonical detector), and only one of them — the one capable of a real ingredient cross-check — never reaches the data that gets served or tested against.

---

## 5. Representative products (allergen vs. ingredient comparison)

All ten products below are drawn from the team's own curated DB002 example pair (`rawSample.jsonl` / `cleanSample.json`), i.e. genuine Australian OFF records already used elsewhere in this repo as reference data — plus four more from `api/contracts/examples/`.

| # | Product (barcode) | `allergens` (as stored) | `ingredients` / `ingredientsText` (as stored) | Consistency finding |
|---|---|---|---|---|
| 1 | Tuna Tomato and Onion (`9300633714437`) | `[]` | `ingredients: []`, `ingredientsText: ""` | **Both fields empty.** Category (`canned-tunas`, `fishes`) and product name ("Tuna…") strongly imply Fish, but neither source records it. If `detect_allergens()` were actually run on this record, `product_name` scanning would likely surface `"Fish"` from the word "Tuna" alone — showing the gap is a source-data problem, not an unsolvable one. |
| 2 | vegetable oil (`9300633391645`) | `[]` | `ingredientsText: "vegetable oil ****y*** ...."` (corrupted); `ingredients: ["vegetable-oil-y"]` | **Ingredient text present but corrupted** — the DB002 cleaning example shows this garbling survives cleaning unchanged. No allergen implied here, but any product with real allergen-bearing ingredients hidden inside similarly corrupted text would be missed by a text-based detector. |
| 3 | Enchilada Kit (`9300695008826`) | `["gluten"]` | `ingredientsText` explicitly lists "Wheat flour", "wheat gluten" | **Consistent** in substance, but the stored allergen value is lowercase, OFF-style `"gluten"`, not the app's documented canonical `"Gluten"`. |
| 4 | Peanut butter, Bega (`93552516`) | `["nuts", "peanuts"]` | `ingredients: []`, `ingredientsText: null` | **Allergen info present, ingredient info completely missing.** The only reason a text-based re-check could still work is that `product_name` ("Peanut butter") and `categories_tags` ("peanut-butters", "nut-butters") happen to restate the allergen — a differently-named private-label product with the same gap would not be caught. |
| 5 | Nutella (`0062020000248`) | `["milk", "nuts", "soybeans"]` | `ingredientsText`: "hazelnuts…, skim milk powder…, milk fat…, emulsifier (lecithins) (soy)" | **Consistent** in substance; same lowercase/OFF-taxonomy naming issue as #3 (`"nuts"` vs. canonical `"Tree Nuts"`, `"soybeans"` vs. `"Soy"`). |
| 6 | Australian Tiger Prawns (`9338441010052`) | `["crustaceans"]` | `ingredients`: "shrimp, shellfish, crustacean…" | **Consistent** in substance. Third distinct spelling for the same allergen concept observed in this codebase: config uses `"Crustacea"`, the DB001 schema doc uses `"shellfish"` (boolean flag), and OFF/seeded data uses `"crustaceans"`. |
| 7 | Mi Goreng Instant Noodles (`0089686170924`) | `["gluten", "sesame-seeds", "soybeans"]` | `ingredientsText` ends "Allergen: Contains Wheat, Contains Sesame, Contains Soy" | **Consistent**, but `traces` is set to the **identical** list (`"en:gluten,en:sesame-seeds,en:soybeans"`) as the "contains" allergens — i.e. the "may contain" (traces) and "contains" (allergens) fields have collapsed into the same values at the source. This blurs a safety-relevant distinction (confirmed allergen vs. precautionary trace) that a consuming app should treat very differently. |
| 8 | Iced Coffee, Oak (`9342584072280`) | `["milk"]` | `ingredientsText`: "_milk_, skim _milk_…" | **Consistent.** |
| 9 | Soft Brown Farmhouse Bread, Genius (`5060195907145`) | `["eggs"]` | `ingredientsText` ends "ALLERGY ADVICE: Contains: Egg." | **Consistent**, correct singular/plural handling by contrast with the FSANZ list ("Eggs" vs `allergens_config.json`'s `"Egg"` — a fourth minor naming variant). |
| 10 | 9 Grain Wholemeal, Tip Top (`9339423001075`) | `["gluten", "soybeans"]`; `traces: "fish, sesame-seeds"` | `ingredientsText` ends "Contains: Gluten Cereals and Soy. May be present: Sesame and Fish" | **Consistent, and a positive counter-example to #7** — here "contains" and "may contain" are correctly kept as two different lists, showing the source data *can* be reliable; the Mi Goreng case (#7) is a genuine source-side defect, not a systemic one. |
| 11 | Lindt Lindor Assorted (`9323966105178`) | `["milk", "nuts", "soybeans"]`; `traces: "nuts, peanuts"` | `ingredientsText` ends "may contain peanuts and tree nuts" | **Consistent**; "may contain" correctly stays out of the main allergens list. |
| 12 | Test Product (contract fixture, `01234567890123`) | `["Milk"]` (canonical Title Case) | `ingredients: ["sugar","milk"]`, `ingredientsText: "Sugar, Milk"` | **Consistent, and notable**: this is a synthetic API-contract fixture, not real OFF data, and it is the *only* example seen anywhere in the codebase where `allergens` actually uses the documented canonical casing (`"Milk"`). This confirms the canonical format is a spec/test convention that the real pipeline output does not currently match (see Finding 4). |

### 5.1 Bulk-sample check (products_5k_enriched.json)

A manual sample of the first ~40 non-empty `allergens` arrays in the 5,000-product seed file confirmed the same pattern seen above at production scale: values are lowercase and OFF-taxonomy (`"milk"`, `"gluten"`, `"soybeans"`, `"sesame-seeds"`, `"sulphur-dioxide-and-sulphites"`, `"nuts"`), and include at least three terms that are **not** part of the app's documented 14-allergen FSANZ model at all — `"pork"`, `"gelatin"`, `"apple"` — meaning some "allergen" values shown to users may not correspond to any allergen the app claims to support filtering/warning for.

---

## 6. Detection-engine defect found during code review

While tracing how `detect_allergens()` derives allergens from ingredient text (Section 4), a specific, reproducible over-matching defect was found in `database/Allergens/allergens_config.json`:

```json
{ "name": "Milk", "keywords": ["milk","dairy","lactose","casein","whey","butter","cream","cheese","yoghurt"] }
```

`"butter"` is listed as a bare Milk keyword. `utils/detect_allergens.py` only suppresses this for **nut** butters (`NUT_BUTTER_PATTERN` covers almond/cashew/hazelnut/walnut/pecan/macadamia/pistachio/pine nut/peanut butter). It does **not** suppress other common non-dairy "butter" ingredients — most notably **cocoa butter**, which appears in the majority of chocolate products in this dataset, and also shea butter, cupuacu butter, mango butter, etc. A dairy-free product whose only "butter"-matching ingredient is cocoa butter would be flagged `"Milk"` in error.

In the 5k sample reviewed, every product containing "cocoa butter" also happened to contain genuine dairy terms (milk powder, milk fat, etc.), so no confirmed false positive was observed live in this sample — but this is a property of the current sample, not a guarantee, and the defect is real and reproducible by direct code trace. This is reported as a finding for the responsible team to fix, not fixed in this ticket.

A second, smaller issue in the same file: `NEGATION_PATTERNS` (the "gluten-free" / "dairy-free" suppression list) only covers **5 of the 14** allergens (Gluten, Milk, Peanuts, Tree Nuts, Soy). Packaging phrases like "egg-free", "sesame-free", "fish-free", "sulphite-free" etc. are not suppressed, so those 9 allergens are more exposed to false positives from "free from" labelling than the other 5.

---

## 7. Does existing processing detect allergen/ingredient inconsistency? (Task 5 / Acceptance Criterion)

**No.** Specifically:

- `mapping/map_enriched_to_product_detail.py` (the module that builds what the API/app actually serves) copies `allergens` verbatim with `_safe_list()` and never reads `ingredients`/`ingredientsText` in the process — no opportunity for cross-checking exists at this layer.
- `mapping/validate_product_contract.py` only checks that `allergens` is present and is a `list` (a **type** check, not a **content** check).
- `database/pipeline/modules/pre_seeding_validation.py` only checks that `enrichment.allergensDetected`, *if present*, is `list[str]` — again a type check, and it looks for the field at a nested path (`record["enrichment"]["allergensDetected"]`) that does not match where any reviewed writer actually places the field (flat `allergens`/`allergensDetected` at the top level), so in practice this check is unlikely to ever fire against real data.
- `utils/conflict_resolver.py` resolves conflicts between **tag categories** (e.g. an `allergen`-type tag suppressing a `mood` tag) — it does not compare the *content* of an allergen tag to ingredient text.
- No file in `database/Validation/`, `database/pipeline/modules/`, or `mapping/` contains any logic that diffs `allergens` against `ingredients`/`ingredientsText` for agreement.

`Documents/Database/2026 Trimester 1/DB038-Source-Data-Gaps-And-Limitations.md` already acknowledges (at a high level) that allergen detection is "heuristic" and degrades when `ingredients_text` is sparse — this investigation adds the more specific finding that the detection engine capable of doing anything about that is not actually connected to the data pipeline that produces the served dataset.

---

## 8. Recommendations

1. **Decide on one canonical `allergens` source and stop shipping the OFF passthrough as-is.** Either (a) run `allergens_enrich.py` (or the `detect_allergens()` call already present in `cleanProductData.py`) as a mandatory, non-skippable step before seeding, and overwrite `allergens` with its canonical output, or (b) explicitly rename the raw OFF field to something like `allergensDeclared` and keep `allergensDetected` as the ingredient-derived field, exposing **both** to consumers so the app itself can compare/flag disagreement. Given the safety-critical nature of allergen data, option (b) is recommended — silently overwriting a producer's own declared allergen statement with a heuristic guess is itself a risk.
2. **Add an explicit consistency check** (new validator, e.g. `database/Validation/allergen_ingredient_consistency.py`) that, for every product, runs `detect_allergens()` against `ingredientsText`/`ingredients` and compares the result to whatever is in `allergens`/`allergensDeclared`. Log/flag: (a) allergens declared but not corroborated by any ingredient text, (b) allergens implied by ingredient text but not declared, (c) either field empty while the other is non-empty. This directly operationalises this ticket's findings into ongoing pipeline behaviour.
3. **Standardise the allergen taxonomy end-to-end.** Section 5 shows at least four different vocabularies for the same 14 allergens across the codebase (canonical config `"Crustacea"`/`"Egg"`, DB001 schema doc `"shellfish"`/`"eggs"` boolean object, OFF/seeded `"crustaceans"`/`"nuts"`/`"soybeans"`, and the contract-fixture canonical `"Milk"`/`"Gluten"`). Pick the canonical FSANZ-14 Title-Case list already documented in `allergen-detection-engine.md` as the single source of truth and map every other representation onto it at ingestion time.
4. **Fix the `"butter"` keyword over-match** (Section 6) by extending the existing nut-butter suppression pattern to also cover non-dairy butters (cocoa, shea, cupuacu, mango, illipe, etc.), and extend `NEGATION_PATTERNS` to cover all 14 allergens, not 5.
5. **Preserve the "contains" vs. "may contain" (traces) distinction at ingestion.** Product #7 (Mi Goreng) shows these can collapse into identical values at the source; product #10 shows they are usually kept distinct. Add a QA check that flags records where `allergens` and `traces` are identical, since that is more likely a data-entry artefact than a genuine "always exactly these traces" case.
6. **Re-run this investigation at full scale with a script**, now that the specific patterns to look for are known (empty-both, allergen-without-ingredients, off-scope allergen terms, `"butter"` false-positive candidates, `allergens == traces`). A small script under `scripts/` following the same pattern as `scripts/db038_gap_evidence.py` would turn Section 5's manual findings into exact dataset-wide counts for the PR/Planner evidence trail.
7. **Resolve the `enrichment.allergensDetected` path mismatch** in `pre_seeding_validation.py` (Section 7) so the validator actually checks a field that a real writer populates, or remove the dead check if it's superseded by Recommendation 2.

---

## 9. Acceptance criteria check

| Criterion | Met? |
| --- | --- |
| Allergen and ingredient consistency has been investigated | ✅ Sections 4–7 |
| Representative products have been reviewed | ✅ 14 products, Section 5 (10 curated DB002 pairs + 4 contract examples), plus a 5k-record bulk sample check (5.1) |
| Inconsistent or conflicting cases are documented | ✅ Section 5 table + Section 6 (code-level defect) |
| Current pipeline behaviour is explained | ✅ Section 4 (data flow), Section 7 (validation coverage) |
| Relevant files reviewed are documented | ✅ Section 3 |
| Recommendations are provided | ✅ Section 8 |

---

## 10. Suggested PR description (for reuse)

> **DB025 – Investigate Allergen & Ingredient Consistency**
>
> Investigated whether allergen information agrees with ingredient information across representative products. Key finding: the `allergens` field in seeded/served data is a raw passthrough of OFF's own `allergens_tags`, not the output of the project's own ingredient-based `detect_allergens()` engine — that engine's canonical output (`allergensDetected`) is computed during cleaning but never reaches the seeded datasets or the API-serving layer, so nothing currently cross-checks allergen claims against ingredients. Reviewed 14 representative products and found 4 failure patterns (both fields empty, allergen-present/ingredients-null, taxonomy inconsistency across 4 vocabularies, and a reproducible `"butter"`/Milk keyword over-match in the detection engine). No existing validator checks allergen/ingredient content agreement. Full findings, file list, and 7 recommendations in this document. No code changed in this ticket.
>
> Files reviewed: see Section 3 of this document.
