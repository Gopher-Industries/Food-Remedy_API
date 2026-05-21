# DB038 - Source data gaps and limitations (documentation)

**Ticket:** DB038  
**Status:** Documented for demos and QA (T1 2026)  
**Repo:** Food-Remedy_API  
**Audience:** Database, backend, frontend, and anyone running demos or QA on seeded product data

## Summary

Open Food Facts (OFF) and our cleaning/enrichment pipeline produce **usable but incomplete** product records. Many demo or QA failures (missing tags, neutral health scores, empty recommendations, sparse categories) come from **source data gaps**, not application bugs.

Use this document when:

- A barcode scan works but badges or scores look “wrong” or empty
- DB032 validation reports missing recommended fields on raw enriched files
- Recommendations return few or no “healthier” alternatives
- You need to explain behaviour to stakeholders without opening the codebase

**Expected outcome:** Teams treat thin or absent enrichment as **data limitations** until the underlying fields are improved or remediated-not as regressions in the mobile app alone.

---

## Quick reference: gap → what breaks → what to expect

| Gap / limitation | Affected features | Expected behaviour (not a pure bug) |
| ---------------- | ----------------- | ----------------------------------- |
| Sparse `ingredients_text` and thin `nutriments` | Diet/lifestyle tags, mood/health tags, ingredient-risk badges | Tags withheld; `reasons.missing_data` (client) or fewer pipeline tags |
| Fewer than 3 known nutrients per 100g | Health score, `balancedNutrition`, RAG label | `compositeScore` / `healthScore` = `null`; `provisionalCompositeScore` may still exist for ranking only |
| Missing or empty OFF `categories` | Category browse, similar/healthier peers | Remediation may set `standardCategory` to **`other`** (~93% on 5k sample); weak recommendation peers |
| Missing `brand`, images, or labels | Product detail polish, cart display | Empty or null fields; UI should show fallbacks |
| Barcode not in seeded Firestore set | Scan, cart, favourites | Lookup fails until product is seeded-**coverage gap**, not scanner logic |
| Non–Australian or stale OFF rows | Scan while travelling, label mismatch | Product missing or tags disagree with packaging |
| Allergen keyword / negation edge cases | Allergen list vs user profile | False negative/positive possible; profile rules override enrichment in app |
| Conflicting positive/negative tags | Tag chips after conflict resolution | Lower-priority tag moved to `tags.removed`-by design |

---

## Data sources and scope

| Topic | Detail |
| ----- | ------ |
| Primary source | [Open Food Facts](https://world.openfoodfacts.org/) - Australian filter in scrape (`database/scraping/OpenFoodFacts-DataScrape.py`) |
| Canonical cleaning | `database/clean_data/cleanProductData.py`, missing-value policy in DB007 (`Documents/Database/2025 Trimester 3/db024-data_foundations.md`) |
| Enrichment | `database/pipeline/modules/` (nutrition, allergens, categories, alternatives) |
| Demo / test corpora | `database/seeding/products_*_enriched.json` (e.g. 5k, 10k–20k slices)-**not** full Australian retail coverage |
| Serving contract | Product Detail v1 - `Documents/Database/2026 Trimester 1/DB037-API-LOCK.md` |

**Assumption:** Seeded barcodes in Firestore match the JSON batch used for that demo. Scanning a barcode that was never seeded will fail product resolution even when the app is healthy (`DB015-Schema-DataFlow-Documentation.md`).

---

## Measured gaps (5k enriched sample, T1 2026)

Figures from `scripts/reports/db032_before_5k.json` (pre-remediation) and `scripts/reports/db032_after_5k.json` (post-remediation). Counts are **issue rows**, not unique products-one product can contribute multiple field issues.

### Before DB032 remediation (`products_5k_enriched.json`)

| Field | Issue count (of 5000 records) | Notes |
| ----- | ------------------------------ | ----- |
| `standardCategory` | 5000 | No harmonised category on any row |
| `categories` | 4523 | Empty or missing OFF category lists |
| `brand` | 1085 | Missing brand string |
| `nutriments` | 1162 | Empty or missing nutrient panel |
| `productName` | 7 | Rare empty names |

Batch validation **failed** integration readiness until remediation (`ok: false`).

### After DB032 remediation (`products_5k_enriched_db032_remediated.json`)

| Check | Result |
| ----- | ------ |
| Required / recommended integration fields | Pass (`issue_count: 0`) |
| `standardCategory` distribution | **`other`: 4651**, `beverages`: 203, remaining buckets &lt; 100 each |

Remediation fills missing categories so validation and seeding can proceed; it does **not** invent accurate retail categories. Expect **weak category-based recommendations** when most peers sit in `other`.

Runbook: `Documents/Database/2026 Trimester 1/DB032-Validation-Runbook.md`.

---

## How gaps affect tags and scores

### Health score and nutrition tags (DB010)

**Module:** `database/pipeline/modules/nutrition_enrich.py`  
**Rule:** At least **3** of 7 normalised nutrients (`sugars`, `protein`, `fat`, `satFat`, `fibre`, `sodium`, `energyKcalPer100`) must be present (`MIN_NUTRIENTS_FOR_SCORE = 3`).

| Data situation | `compositeScore` / `healthScore` | `provisionalCompositeScore` | Tags |
| -------------- | ---------------------------------- | --------------------------- | ---- |
| `known_n` &lt; 3 | `null` | Still computed (neutral fill for missing dimensions) | Nutrient threshold tags only for **known** fields; no `balancedNutrition` |
| `known_n` ≥ 3 | 0–100 integer | Same as composite when sufficient | Full tag set including `balancedNutrition` when thresholds allow |

**Demo pitfall:** UI or API showing a number from `provisionalCompositeScore` while `sufficientDataForScore` is false looks like a “real” health score. Prefer `compositeScore` / `healthLabel` for user-facing badges.

**Client parity:** `mobile-app/services/nutrition/nutritionScorer.ts` treats unknown nutrients as **neutral (0.5)** in sub-scores-similar philosophy, not identical field names.

### Diet, lifestyle, mood, and ingredient-quality tags

| Layer | Behaviour when data is thin |
| ----- | ----------------------------- |
| Diet/lifestyle (`dietLifestyleTagger.js`) | If both `ingredients_text` and normalised nutrients are empty → **no tags**, `reasons.missing_data` |
| Mood/health / ingredient quality | Rules need ingredients and/or nutrients; missing inputs → **no new tags** (see `nutrition-mood-health-tagging.md`: tags are not invented from absence) |
| Conflict resolution | `utils/conflict_resolver.py` / mobile `conflictResolver.js` remove contradictory tags; does not fix missing source fields |

### Allergens

**Module:** `utils/detect_allergens.py` (keywords + regex + negation patterns).

| Limitation | Effect |
| ---------- | ------ |
| No `ingredients_text` / sparse ingredient tokens | Detection relies on OFF allergen tags only-may miss or under-detect |
| Keyword lists | New additives or label wording may not match until config is updated |
| “Free from” phrasing | Negation patterns suppress some false positives; not exhaustive |

Allergen output is **heuristic**, not laboratory analysis. User profile restrictions still take precedence in the app.

### Categories and recommendations (DB019)

| Gap | Effect on similar / healthier lists |
| --- | ----------------------------------- |
| Peers in `other` or `__uncategorized__` | Large buckets; distance and sampling caps reduce quality of matches |
| Missing nutrients on one or both products | Nutrient distance uses **overlap only**; no overlap → poor similarity |
| Flat health scores in a category | Strict “healthier” tier empty; fallbacks use sugar/fibre proxies or empty list |

See `Documents/Database/2026 Trimester 1/DB019_README.md` (edge cases).

### Product Detail mapping (DB037)

**Module:** `mapping/map_enriched_to_product_detail.py`

- Empty lists for allergens/ingredients/tags become `[]`, not invented values.
- Tag conflict resolution failure **logs and preserves** source tags rather than dropping data silently.
- Full `enrichment.alternatives` blob is **out of scope** for Product Detail v1-recommendation UIs must read enriched store fields separately.

---

## Demo and QA triage checklist

Use this order before filing an app bug:

1. **Barcode in seed set?** Confirm the barcode exists in the enriched JSON / Firestore batch for this environment.
2. **Which dataset?** Note file name (e.g. `products_5k_enriched` vs remediated `*_db032_remediated`). Behaviour differs on category fields.
3. **Inspect enrichment on the record:**
   - `enrichment.nutrition.sufficientDataForScore` (or client equivalent)
   - `enrichment.nutrition.compositeScore` vs `provisionalCompositeScore`
   - `standardCategory` / `categories`
   - `ingredientsText` length and `nutriments` / `nutriments_normalized` keys
4. **Tags empty?** Check for `reasons.missing_data` (client) or thin nutrient count-not a crash.
5. **Recommendations empty?** Often **no peer** with better score or nutrient overlap in `other`-see DB019.
6. **Still wrong after rich OFF data?** Consider stale OFF, unit conversion outlier, or heuristic tuning-not necessarily FE regression.

**Report template (for Planner / Teams):**

```text
Barcode:
Dataset / seed file:
sufficientDataForScore:
compositeScore / provisionalCompositeScore:
standardCategory:
ingredientsText: (present Y/N, approximate length)
nutriments_normalized keys:
Expected per DB038: (which row in quick reference table)
```

---

## Known upstream limitations (not fixed by validation alone)

Consolidated from architecture and enrichment docs; still true for T1 2026:

- **OFF lag** - Packaging and formulations change before OFF is updated.
- **Australian focus** - Non-AU products are filtered at scrape; travellers may see missing barcodes.
- **Sparse ingredients** - Many rows lack usable `ingredients_text`; vegan/halal/keto-style tags stay conservative.
- **Label noise** - Concatenated tokens (e.g. `gluten-freehalal`) may confuse keyword taggers until lexicons are patched.
- **Category ambiguity** - Vendor-specific category strings; harmonisation may map to `other`.
- **No user-feedback loop into data quality** - Scan outcomes do not yet retrain or correct source records automatically.

Broader context: `Documents/Database/2025 Trimester 3/data-architecture-overview.md` (§8).

---

## What DB032 remediation does and does not do

| Does | Does not |
| ---- | -------- |
| Fill missing `categories` / `standardCategory` for integration checks | Guarantee semantically correct aisle/category |
| Normalise systemic issues documented in DB032 reports | Add nutrients or ingredients from OFF |
| Enable passing batch validation on remediated 5k file | Replace need for better OFF contributions or scraping |

Always label demos: **“remediated seed”** vs **“raw enriched export”** when comparing behaviour.

---

## Related documentation

| Topic | Location |
| ----- | -------- |
| Schema and cart/recommendation field deps | `Documents/Database/2026 Trimester 1/DB015-Schema-DataFlow-Documentation.md` |
| Validation runbook | `Documents/Database/2026 Trimester 1/DB032-Validation-Runbook.md` |
| API contract lock | `Documents/Database/2026 Trimester 1/DB037-API-LOCK.md` |
| Alternatives / edge cases | `Documents/Database/2026 Trimester 1/DB019_README.md` |
| Diet/lifestyle and risk enrichment | `Documents/Database/2025 Trimester 3/dietary-lifestyle-risk-enrichment.md` |
| Missing value policy | `Documents/Database/2025 Trimester 3/db024-data_foundations.md` |
| Pipeline overview | `database/DATABASE-README.md` |
| Handover alignment | `Documents/Database/2026 Trimester 1/DATABASE_PROGRESS_AND_HANDOVER_ALIGNMENT.md` |

---

## Evidence commands (terminal)

Run from repo root (`Food-Remedy_API`). On PowerShell use `;` between commands (not `&&`).

### View the documentation

```powershell
Get-Content "Documents\Database/2026 Trimester 1/DB038-Source-Data-Gaps-And-Limitations.md" | more
# or open in editor:
code "Documents/Database/2026 Trimester 1/DB038-Source-Data-Gaps-And-Limitations.md"
```

### Generate gap statistics (DB038-specific)

```powershell
python scripts/db038_gap_evidence.py -i database/seeding/products_5k_enriched.json -o scripts/reports/db038_gap_stats_before_5k.json
python scripts/db038_gap_evidence.py -i database/seeding/products_5k_enriched_db032_remediated.json -o scripts/reports/db038_gap_stats_after_5k.json
```

Print a JSON summary in the terminal:

```powershell
python -c "import json; r=json.load(open('scripts/reports/db038_gap_stats_before_5k.json',encoding='utf-8')); print(json.dumps({k:r[k] for k in ('total_records','missing_field_percent','standard_category_distribution','health_score_gaps')}, indent=2))"
```

### Regenerate DB032 validation reports (integration readiness)

```powershell
python scripts/db032_validation_suite.py -i database/seeding/products_5k_enriched.json --sample-size 200 --report scripts/reports/db038_evidence_before_5k.json --allow-issues
python scripts/db032_validation_suite.py -i database/seeding/products_5k_enriched_db032_remediated.json --sample-size 200 --report scripts/reports/db038_evidence_after_5k.json --allow-issues
```

### Attach to Planner as evidence

| Artifact | Path |
| -------- | ---- |
| Gap stats (raw enriched) | `scripts/reports/db038_gap_stats_before_5k.json` |
| Gap stats (remediated) | `scripts/reports/db038_gap_stats_after_5k.json` |
| DB032 validation (raw) | `scripts/reports/db038_evidence_before_5k.json` |
| DB032 validation (remediated) | `scripts/reports/db038_evidence_after_5k.json` |
| This doc | `Documents/Database/2026 Trimester 1/DB038-Source-Data-Gaps-And-Limitations.md` |

---

## Maintenance

- Re-run DB032 before major demos and refresh the **Measured gaps** table if the canonical seed file changes.
- When heuristics or `MIN_NUTRIENTS_FOR_SCORE` change, update the **Health score** section and note the date here.
- Link this doc from Planner ticket DB038 when moving to **In Review**.
