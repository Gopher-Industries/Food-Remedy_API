# BE022: Canonical Allergen Matching and Active Scan Suitability

## Why this change was needed

The profile and product pipelines used different vocabularies. A profile stores
the selectable value `Seafood`, while enriched products commonly store `Fish`,
`Crustacea`, or `Molluscs`. The active product comparison also maintained a
small, separate exact-string map. It omitted selectable restrictions and did
not consistently read `tracesFromIngredients` or ingredient evidence.

Consequently, a user with `Seafood` selected could scan a tuna product and see
`No conflict found` or an overall `Good fit`. This is a safety defect: known
conflicts must be unsuitable, while incomplete evidence must retain the BE016
unknown/caution result.

## Existing data flow discovered

1. Profile options originate in
   `mobile-app/services/constants/NutritionalTags.ts`.
2. The enrichment pipeline calls `utils/detect_allergens.py` through
   `database/pipeline/modules/allergens_enrich.py` and stores canonical FSANZ
   groups such as `Fish`, `Crustacea`, and `Molluscs`.
3. Barcode loading in `ProductProvider` obtains a normalized `Product` through
   `getProductById` and `normaliseFirestoreProduct`.
4. The active `ForYouTab` previously reduced profile values through a partial
   local map, then `ProductCompareSection` compared exact strings.
5. The classification endpoint and recommendations called the BE016 evaluator,
   but previously supplied allergies only and lacked a shared grouped taxonomy.
6. `normaliseRestrictionsForProfileCheck` contained another independent
   allergen/intolerance lexicon.

`ProductProvider` remains responsible only for product retrieval and caching.
Suitability is profile-dependent, so the loaded product and active profile are
combined in the active tab using the shared pure evaluator. This avoids a
second network classification request while applying the same policy.

## Canonical policy

All TypeScript safety consumers now use
`mobile-app/services/constants/AllergenTaxonomy.ts` through
`mobile-app/services/allergenSafety.ts`.

| Profile restriction | Trusted product evidence | Resolution when no match |
| --- | --- | --- |
| Seafood | Fish, Crustacea, Molluscs; fish/crustacean/mollusc species and aliases | Safe only with complete allergen and trace declarations |
| Egg | Egg declarations and recognized egg aliases | Safe only with complete declarations |
| Soy | Soy declarations and recognized soy aliases | Safe only with complete declarations |
| Mustard | Mustard declarations and recognized aliases | Safe only with complete declarations |
| Tree Nuts | Tree-nut declarations and named tree nuts | Safe only with complete declarations |
| Peanuts | Peanut/groundnut declarations and aliases | Safe only with complete declarations |
| Garlic | Explicit ingredient/declaration evidence | Unknown without a positive match |
| Gluten | Gluten-containing cereals and aliases | Safe only with complete declarations |
| Lactose | Explicit lactose/dairy ingredient or declaration evidence | Unknown without a positive match |
| Caffeine | Explicit caffeine/coffee/guarana/mate evidence | Unknown without a positive match |
| Fructose, Glucose, Histamine, Low-FODMAP, Sorbitol, Salicylate | Explicit supported term only | Unknown without a positive match |

Legacy stored profile values `Milk`, `Fish`, `Crustacea`, and `Molluscs` also
have rules so existing records are not silently dropped.

The required Seafood expansion is:

- Fish: tuna, salmon, sardine, anchovy, cod, haddock, basa, and hoki.
- Crustacea: prawn, shrimp, crab, lobster, crayfish, krill, and yabby.
- Molluscs: oyster, mussel, clam, squid, octopus, scallop, and abalone.

Matching normalizes case, language prefixes, whitespace, punctuation, and
singular/plural aliases. Token boundaries prevent `Peanuts` from being treated
as `Tree Nuts` merely because both contain the word fragment `nut`.

## Evidence and safety decisions

Trusted positive evidence includes:

- `allergens`
- `traces`
- `tracesFromIngredients`
- structured `ingredients`
- `ingredientsText`

Product names, generic names, categories, and marketing labels are not treated
as definitive safety evidence. They can be descriptive or incorrect. For
example, `Tuna Tomato and Onion` with a trusted tuna ingredient is unsuitable
for `Seafood`; the same name with empty allergen and ingredient fields is
unknown/caution, not unsafe and not safe.

A known match takes precedence over incomplete declarations. If no match is
known, explicit safe is allowed only when the BE016 allergen and trace
declaration contract is complete and the selected restriction can be resolved
from declarations. Ingredient-dependent or unsupported negative inferences
remain unknown. Null, empty, missing, and malformed evidence never becomes an
explicit safe result.

## Implementation actions

- Added the reusable taxonomy and alias lookup in
  `mobile-app/services/constants/AllergenTaxonomy.ts`.
- Extended `mobile-app/services/allergenSafety.ts` to evaluate canonical
  restrictions across all trusted evidence fields and preserve BE016 behavior.
- Added `mobile-app/services/profileProductSuitability.ts` to combine allergies
  and intolerances and translate safe/unsafe/unknown into active-scan output.
- Connected `ForYouTab` and `ProductCompareSection` to the shared evaluator.
  Known conflicts render `Contains allergen` and force `Poor fit`; unknown data
  renders `Check allergen information` and cannot produce `Good fit`.
- Updated classification and recommendation paths to evaluate allergies and
  intolerances with the same matcher. Known allergen conflicts are red.
- Replaced the duplicate allergen/intolerance matching in
  `normaliseRestrictionsForProfileCheck` with the canonical matcher while
  retaining its additive-specific behavior.
- Restricted Python enrichment detection to trusted declaration and ingredient
  inputs. The pipeline no longer supplies product/category/label metadata as
  authoritative evidence.
- Added a Jest contract test against `allergens_config.json` so the TypeScript
  matcher remains aligned with enrichment keywords for supported declaration
  groups.

## Fixtures and expected outcomes

| Fixture | Profile | Trusted evidence | Outcome |
| --- | --- | --- | --- |
| Barcode `9300633714437` | Seafood | ingredient `tuna` | Unsafe/red; matched `Seafood` |
| Barcode `9300633714437` | Seafood | tuna in product name only; declarations empty | Unknown/caution |
| Seafood group fixtures | Seafood | Fish, Crustacea, or Molluscs | Unsafe/red |
| Trace fixture | Seafood | `PRAWNS` in traces | Unsafe/red |
| Derived trace fixture | Mustard | `mustard seed` in `tracesFromIngredients` | Unsafe/red |
| Intolerance fixture | Gluten | `wheat` declaration | Unsafe/red |

## User validation

The end-to-end phone test confirmed the original bug is no longer reproducible:

- scanning a tuna product while `Seafood` is selected no longer returns an explicit safe result
- the active scan and comparison paths now surface the conflict instead of reporting `Good fit`
- products with incomplete allergen data fall back to the conservative BE016 behavior rather than pretending to be safe

That manual validation matches the automated fixtures above and is the main user-facing win for BE022.

## Validation

- Canonical, active scan, recommendation, classification, and BE016 regression
  tests: 4 suites, 72 tests passed.
- Python trusted-evidence detector tests: 4 tests passed.
- Full mobile test run: 100 tests passed and 3 unrelated tests failed in
  `profileSync.test.ts` (one existing retry timeout and two existing call-count
  expectations). No BE022 suite failed.
- TypeScript project check was run. It remains blocked by pre-existing errors in
  authentication-related files, `membersEdit.tsx`, missing bootstrap JSON data,
  and `theme.ts`; it reported no errors in the BE022 files.
- Targeted ESLint was attempted but did not complete in the local environment
  and was stopped after producing no diagnostics.

## Exclusions and follow-up risks

- Nutrition scoring, product ranking, schema design, and unrelated UI styling
  were not changed.
- The branch did not introduce a new product lookup path, a new ranking source,
  or a schema redesign. The existing product, classification, and recommendation
  workflows were updated in place to use the same allergen matcher.
- This is deterministic label-data matching, not medical diagnosis. Ingredient-
  dependent restrictions deliberately remain caution when evidence is absent.
- The Python enrichment configuration and TypeScript runtime necessarily live
  in different language environments. Their relevant keyword alignment is
  guarded by a contract test; future taxonomy changes must update both sources
  when enrichment output changes.
- Previously enriched products that derived allergens only from a product name
  are not rewritten by this change. Re-enrichment/backfill policy is outside
  BE022 and should be assessed separately if those records exist.

## Workflow impact

The goal of BE022 was to make allergen detection more correct without changing
the rest of the app’s behavior. Based on the code audit and the validation we
runs, the change is narrowly scoped to the allergen/suitability pipeline:

- profile restrictions now resolve through one canonical matcher
- the active scan, product comparison, classification, and recommendation paths
  all call the same safety logic
- the enrichment pipeline was narrowed so it no longer treats product names,
  categories, or labels as authoritative allergen evidence

What we did not change:

- nutritional scoring
- general product retrieval
- ranking logic unrelated to allergen safety
- frontend navigation or visual behavior
- schema structure or stored product shape

So the honest answer is: we have strong evidence that the allergen workflow is
fixed without introducing known changes to the unrelated pipelines above, but
the broader app still contains pre-existing non-BE022 issues outside this work
that were not altered by this ticket.
