# Advanced Dietary & Risk Enrichment

## Purpose
This guide explains how Food Remedy turns raw OpenFoodFacts inputs (ingredients, additive flags, allergen traces, nutrients, and labels) into dietary suitability and processing-risk signals. It captures the heuristics implemented in [database/clean_data](database/clean_data) and the mobile enrichment utilities so the system stays explainable, tuneable, and credible.

## Upstream Inputs
- **Clean product skeleton** – `cleanProductData.py` standardises names, splits tag arrays, and preserves `ingredients_text`, structured allergens, additives, and nutriments needed downstream ([database/clean_data/cleanProductData.py](database/clean_data/cleanProductData.py)).
- **Allergen inference** – `detect_allergens.py` fuses strict regexes, keyword dictionaries, negation handling, and nut butter suppression to emit reliable allergen hits when OFF data is messy ([utils/detect_allergens.py](utils/detect_allergens.py)).
- **Additive/intolerance normalisation** – `normaliseRestrictionsForProfileCheck` maps arbitrary OFF tags to the curated allergen/additive/intolerance vocab the app understands, including E-number decoding and noise filtering ([mobile-app/services/utils/normaliseRestrictionsForProfileCheck.ts](mobile-app/services/utils/normaliseRestrictionsForProfileCheck.ts)).
- **Nutrient thresholds** – `nutritionScorer` converts whatever nutrient fields are present into per-100g values, coerces units, and applies WHO/ADG-aligned cut points defined in [mobile-app/services/nutrition/nutritionThresholds.ts](mobile-app/services/nutrition/nutritionThresholds.ts).

## Dietary & Lifestyle Tagging
### Pipeline (dietLifestyleTagger)
1. **Data readiness** – Abort tagging when both `ingredients_text` and normalised nutrients are missing to avoid hallucinations; surface a `missing_data` reason so UI can explain why badges are absent.
2. **Text normalisation** – Lower-case the free-text ingredient block, merge allergen lists, and scan with curated keyword buckets for animal products, meat, dairy, gluten cereals, and wholegrain/low-GI hints ([mobile-app/services/nutrition/dietLifestyleTagger.js](mobile-app/services/nutrition/dietLifestyleTagger.js)).
3. **Dietary tags** – Vegan/vegetarian/halal/dairyFree/glutenFree come directly from presence/absence checks on the normalised text plus explicit OFF labels. Halal is intentionally conservative: it is only emitted when "halal" appears in the label or ingredient text.
4. **Lifestyle tags** – Keto, diabetic, and low-GI decisions combine nutrient thresholds with ingredient cues. Normalised carbs/sugars/fibre values (per 100g) keep rules unit-safe.
5. **Conflict resolution** – After provisional tags are assigned, a second pass removes tags that contradict detected allergens or existing risk chips (e.g., drop `diabeticFriendly` if `highSugar` already exists). Removal reasons are recorded for auditability.

### Tag Reference
| Tag | Data dependency | Rule (per 100g unless noted) | Conflict & fallback |
| --- | --- | --- | --- |
| `vegan` | ingredients text, allergen text | No animal keywords (meat, dairy, egg, gelatin, seafood) and no milk/egg/fish/crustacean allergen hits | Auto-removed if later dairy/milk evidence surfaces |
| `vegetarian` | ingredients text, allergen text | No meat/fish keywords or allergen hints | n/a |
| `halal` (optional) | labels, ingredients text | Requires explicit "halal" token (conservative default) | Not emitted without label, even if ingredients look compliant |
| `dairyFree` | ingredients text, allergen text | Absence of dairy keywords and no milk/dairy allergen flags | Removed if milk evidence exists |
| `glutenFree` | ingredients text, allergen text | No wheat/barley/rye/spelt/malt matches and no gluten allergen flag | Removed if gluten/wheat evidence exists |
| `ketoFriendly` | normalised nutrients | carbs ≤ 10g and sugars ≤ 5g; sugars may be missing | None; absence of data suppresses tag |
| `diabeticFriendly` | normalised nutrients, existing risk tags | sugars ≤ 5g and carbs ≤ 20g; suppressed if `highSugar` or explicit "not suitable" tag already exists | Removal reason stored as `diabeticFriendly_removed` |
| `lowGI` | ingredients text, fibre, sugars | Wholegrain/legume keywords **or** fibre ≥ 3g, combined with sugars ≤ 5g | None |

### Safe Defaults
- Missing ingredients + nutrients ⇒ no tags, with `reasons.missing_data` recorded.
- Unknown nutrient values default to `null`, preventing keto/diabetic/lowGI emission.
- When conflict removal happens, the `_removed` reason helps analysts understand divergences.

## Nutrient Risk Tagging (scoreProduct)
`scoreProduct` enriches products with interpretable nutrition risk tags consumed by `getProductTags` ([mobile-app/services/utils/productTags.ts](mobile-app/services/utils/productTags.ts)). Key behaviours:
- **Unit coercion** – Accepts `_100g`, `_serving`, or plain keys, converts sodium mg→g, and converts energy kJ→kcal when needed.
- **Inverse normalisation** – Detrimental nutrients (sugar, fat, saturated fat, sodium, energy density) map to a 0–1 quality score via linear interpolation between low and moderate thresholds. Missing values default to 0.5 (neutral) so incomplete data neither penalises nor rewards.
- **Composite score** – Weighted blend of protein, fibre, sugar, fat, sodium using `compositeWeights`. Result is scaled to 0–100, and a `balancedNutrition` tag appears when the score ≥ 60 **and** no `high*` penalties fire.
- **Tag emission** – For each nutrient, low/moderate/high tags are emitted according to the NutritionThresholds table (e.g., sugar: <5g low, 5–15g moderate, >15g high). These tags later power UI badges and feed into dietary conflict checks (e.g., blocking `diabeticFriendly`).

## Ingredient Risk & Processing Intelligence
### Ingredient Classification & Keyword Strategy
`ingredientQualityTagger` classifies each ingredient entry as `natural`, `minimallyProcessed`, `processed`, or `ultraProcessed` using keyword lexicons (hydrolysed, maltodextrin, emulsifier, etc.) and a catch-all natural hints list ([mobile-app/services/nutrition/ingredientQualityTagger.js](mobile-app/services/nutrition/ingredientQualityTagger.js)).

### Additive Detection Buckets
Additives are detected per ingredient via two channels:
1. **Keyword tables** – Category → keyword lookups (e.g., `high_intensity_sweetener` searches for sucralose/aspartame; `synthetic_colourant` looks for tartrazine, titanium dioxide, etc.). Each category carries a base weight.
2. **E-number parsing** – Normalised tags feed through `normaliseRestrictionsForProfileCheck`, which already maps E-number ranges to user-facing additive classes (`Food Dye`, `Artificial Phosphates`, `Sweeteners`, `Flavour Enhancers`, `Palm Oil`, `Yeast`). Applying both systems keeps classification consistent between backend ingestion and frontend chips.

### Ingredient-Level Risk Model
For each ingredient `i`:
- Assign a base score from processing level: natural 0.02, minimally processed 0.08, processed 0.25, ultra-processed 0.7.
- Detect additives, convert each category to a contribution (weight × 0.6), sort, sum the top three, and clamp to 0.6 so no single additive dominates.
- Apply a context multiplier (e.g., dairy products soften penalties for stabilisers; snacks amplify them).
- Clamp the final value to [0, 1].

Expressed formally:
$$score_i = \min\Bigl(1, base(cls_i) + \gamma_{context} \cdot \min\bigl(0.6, \sum_{k=1}^{3} c_k\bigr)\Bigr)$$
where $c_k$ are the top additive contributions for ingredient $i$.

### Product-Level Aggregation & Risk Bands
Given ingredient scores $score_i$:
1. Compute weights $w_i = 1 + 6 \cdot score_i^{1.2}$ to emphasise higher-risk items.
2. Aggregate:
$$productScore = \frac{\sum_i score_i \cdot w_i}{\sum_i w_i}$$
3. Map to bands: `< 0.25` ⇒ lowRisk, `0.25–0.54` ⇒ moderateRisk, `≥ 0.55` ⇒ highRisk.
4. Merge additive evidence across ingredients (counts + keyword witnesses) for explainability.

### Clamping & Defaults
- Empty or null ingredient lists short-circuit to `productScore = 0` and `lowRisk` to avoid false positives.
- Each ingredient’s score is rounded to three decimals, ensuring deterministic outputs for caching.
- Context multipliers default to 1.0 when category metadata is absent.

## Example Walkthroughs
| Scenario | Key inputs | Dietary/Lifestyle output | Processing risk output |
| --- | --- | --- | --- |
| Rolled oats ([dietLifestyleTagger.tests.js](mobile-app/services/nutrition/dietLifestyleTagger.tests.js)) | `ingredients_text = "Rolled oats"`, carbs 66g, sugars 1g, fibre 10g | `vegan`, `vegetarian`, `dairyFree`, `glutenFree`, `lowGI` (wholegrain + low sugar) | Single natural ingredient ⇒ `productScore ≈ 0.02` ⇒ `lowRisk` |
| Milk chocolate | Contains milk powder + lactose; sugars 50g | `glutenFree`, `vegetarian`; `dairyFree` and `vegan` removed; `diabeticFriendly` blocked via `highSugar` | Ingredients like sugar, cocoa butter, milk powder; sweetener additives absent but dairy fats marked processed ⇒ `moderateRisk` |
| Instant noodles ([ingredientQualityTagger.tests.js](mobile-app/services/nutrition/ingredientQualityTagger.tests.js)) | Wheat flour, palm oil, hydrolysed protein, MSG, maltodextrin | `vegetarian` only if no meat keywords; gluten and dairy present so `glutenFree`/`dairyFree` suppressed | Multiple ultra-processed cues + flavour enhancers push top-3 additive contributions to clamp, `productScore > 0.55` ⇒ `highRisk` |
| Zero-sugar cola | Sweetener (sucralose), zero carbs/sugars, no allergens | `vegan`, `vegetarian`, `dairyFree`, `glutenFree`, `ketoFriendly`, `diabeticFriendly` | Sweeteners detected as `high_intensity_sweetener`; base classification ultra-processed ⇒ `moderateRisk`, with additive summary flagging sweeteners |

## Operational Notes
- **Explainability hooks** – Each tagger returns `reasons` objects plus additive summaries so the app can justify badges in plain language.
- **Config tweaks** – All keyword lists, thresholds, and weights are centralised in the referenced files. Adjusting them will instantly flow through documentation tables above.
- **Testing** – Keep `dietLifestyleTagger.tests.js` and `ingredientQualityTagger.tests.js` updated when heuristics change; they double as executable examples for QA and this document.

## Configuration & Tuning Playbook
- **Ownership** – Default reviewers: data science lead for threshold changes, mobile lead for frontend chip behaviour, backend ingest owner for parsing tweaks. Capture approvals in PR description so future teams know why a knob moved.
- **Keyword lists** – Update dietary keywords in [mobile-app/services/nutrition/dietLifestyleTagger.js](mobile-app/services/nutrition/dietLifestyleTagger.js) and allergen/additive lexicons in [mobile-app/services/utils/normaliseRestrictionsForProfileCheck.ts](mobile-app/services/utils/normaliseRestrictionsForProfileCheck.ts). Add regression fixtures inside the companion `*.tests.js` files before merging.
- **Thresholds** – Nutrient cut points live in [mobile-app/services/nutrition/nutritionThresholds.ts](mobile-app/services/nutrition/nutritionThresholds.ts); ingredient risk weights live in [mobile-app/services/nutrition/ingredientQualityTagger.js](mobile-app/services/nutrition/ingredientQualityTagger.js). Use feature flags or environment-configured overrides when experimenting so production and experiments can diverge safely.
- **Versioning** – When a significant rule changes (e.g., new keto limits), snapshot the previous table inside `/Documents/Database/change-log.md` with date + rationale. This keeps historical reports reproducible.
- **Observation loop** – After tuning, re-run `dietLifestyleTagger.tests.js`, `ingredientQualityTagger.tests.js`, and affected Expo screens (`ProductDetails`, `ScanResult`) to visually confirm tag ordering.

## Data Freshness & Known Limitations
- **Source latency** – OpenFoodFacts pulls may lag retail packaging changes by weeks. If a product looks contradictory, prefer the most recent barcode scan photo over textual heuristics.
- **Sparse ingredients** – Many OFF entries omit `ingredients_text`. In those cases we only rely on tag arrays; expect `missing_data` reasons and consider prompting users to crowdsource ingredients.
- **Label noise** – Some labels include concatenated tokens (`"gluten-freehalal"`). The normalisers strip prefixes, but edge cases still slip through; add targeted regex to the lexicons when spotted.
- **Nutrient unit ambiguity** – Sodium and energy sometimes appear in mg/kJ. The scorers coerce units, but manual QA should inspect outliers (extremely high sodium) to ensure conversion logic still holds.
- **User overrides** – Profiles can explicitly mark allergens to avoid. If enrichment disagrees with the profile, profile rules win; document this in support playbooks so user-facing teams can explain discrepancies.

## Integration Overview
- **Pipeline summary** –
	1. `database/clean_data/cleanProductData.py` → canonical product JSON (barcode, ingredients, structured tags).
	2. Backend enrichment (`detect_allergens`, category harmonisers) persists derived tags to the DB.
	3. Mobile app fetches products, runs `nutritionScorer`, `dietLifestyleTagger`, and `ingredientQualityTagger` client-side for realtime badges.
	4. UI components (`NotificationManager`, `ProductDetails`, `ScanResult`) render chips and explanations using the returned `tags`, `reasons`, and additive summaries.
- **Failure visibility** – If any step cannot classify (missing data, parse errors), we propagate `reasons.missing_data` and hide only the affected badge group rather than the whole card.
- **Handover checklist** – When onboarding a new maintainer, walk them through: ingestion notebook → enrichment scripts → Expo screens. Keep this doc bookmarked so they can map a UI badge back to code within minutes.
