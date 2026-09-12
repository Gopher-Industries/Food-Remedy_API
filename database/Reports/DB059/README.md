# DB059 – Finalise Category Data Quality

I checked the release candidate named in DB047 and replayed the actual
`cleanProductData.standardise_category()` rules over all 5,000 products. There
is one safe gap we can close now: 30 products have an explicit `beverages` tag
but still fall into `other`. Most category gaps cannot be filled safely because
the source tags are missing.

## Dataset and evidence

- Candidate: `database/seeding/products_enriched.json`
- SHA-256: `203492101ee555cc2cc09fc52a215bc325e2878b72dc075f3980181b3bb17f23`
- Baseline: `07ac3f45178fe49fe7935351ae6610c61794fda2` (includes DB031 and DB051).
- `category_before.json`: captured by running the audit before changing the rule.
- `category_after.json`: same input bytes after the rule change; includes every
  changed product's zero-based index, barcode, before/after bucket and source tags.
- Both reports include classifier hashes and the classification of all 477
  products that have usable tags. The other 4,523 products map to `other`.

These are **rule-replay measurements**, not a claim that the committed candidate
or Firestore was rewritten. The cleaner integration test separately verifies
that a real raw JSONL record produces the new category in saved cleaner output.

## Measured result

| Measure | Before | After |
| --- | ---: | ---: |
| Total products | 5,000 | 5,000 |
| Missing category tags | 4,523 (90.46%) | 4,523 (90.46%) |
| Products with category tags | 477 | 477 |
| Products mapped to an established bucket | 249 | 279 |
| Tagged products still mapped to `other` | 228 | 198 |
| All products mapped to `other`, including missing tags | 4,751 | 4,721 |
| Products mapped to `beverages` | 23 | 53 |
| Previously mapped products whose bucket changed | — | 0 |
| Rows with duplicate category tags | 3 | 3 |
| Stored non-empty primary `category` fields | 0 | 0 |

The improvement is 30 products, or 0.60 percentage points of the whole dataset.
Coverage among products with tags increases from 52.20% to 58.49%. It does not
solve missing source coverage, and I have not presented it as doing so.

Examples moving from `other` to `beverages`:

| Barcode | Product | Existing source evidence |
| --- | --- | --- |
| `9348207001231` | Kombucha Apple Pear And Ginger | `beverages`, `fermented-drinks`, `kombuchas` |
| `4061459693577` | Flying Power Energy Drink Passionfruit | `beverages`, `energy-drinks` |
| `9315031211631` | Pure Harvest Oat Milk | `beverages`, `oat-based-drinks` |

## Why this change is safe

The existing rules already cover dairy (DB031) and condiments (DB051), so I did
not repeat those changes. I added an exact `beverages` fallback **after** all
existing rules. A recognised bread, cheese or condiment keeps its existing
bucket even if `beverages` is also present. Drinkable dairy with an existing
specific beverage match also keeps its classification.

Adding the bare word to the existing segment-matching keywords would risk
matching broader slugs. The fallback instead requires the complete cleaned tag
to equal `beverages`. Language-prefix and whitespace handling remain unchanged.
Neither umbrella tag alone is accepted as evidence of a drink.

The category remains a broad classification. Some source-tagged drinks are
alcoholic; this change does not establish dietary suitability or change the
recommendation safety policy. Source tags remain available to downstream rules.

## Remaining limitations and release handoff

1. **Missing source categories:** 4,523 rows have empty lists. Research/Database
   need authoritative source data to improve these. Product names are not a
   reliable substitute, especially with the placeholder names found by DB060.
2. **Unmapped but populated tags:** 198 rows remain outside the established
   buckets. The report lists their tag frequencies, including breakfast cereals,
   meals, supplements and eggs. New bucket definitions need agreement with
   Backend/Research; they are not automatically data corruption.
3. **Duplicate tags:** barcodes `0344643618384`, `4335646000005` and
   `3453669000015` each repeat the same category tag. The existing
   `utils.category_normalizer.normalize_categories()` deduplicates these during
   cleaning. Their current saved lists have not been silently rewritten here.
4. **Generation remains a separate release dependency:** the committed pipeline
   config has `clean.enabled: false`. Merging a cleaner rule does not refresh
   this already-enriched candidate. Database/Deployment must agree the full
   source and rerun cleaning plus downstream enrichment before the final freeze.
   Do not simply enable cleaning against the configured example input and assume
   it represents the 5,000-product release dataset.
5. **Recommendation regeneration matters:** DB019's `_category_key()` uses
   `category`, falling back to the first source tag. The current candidate has
   no primary `category` fields. Rebuilding those fields can change peer groups,
   so regenerate alternatives with the approved pipeline rather than patching
   category fields in place. This PR does not establish release approval.

There are no stored-primary conflicts to count on this candidate because the
primary field is absent everywhere. This is not proof that the two category
representations have been reconciled. The replay report keeps source-list
completeness separate from harmonised bucket coverage.

## Reproduce and test

Run from the repository root:

```bash
python scripts/db059_category_audit.py \
  --input database/seeding/products_enriched.json \
  --baseline database/Reports/DB059/category_before.json \
  --output /tmp/db059_category_after.json

python -m pytest database/test_db059_category_quality.py \
  database/test_db031_category_consistency.py database/test_db051_category_quality.py \
  test/test_category_harmonisation.py test/test_category_normalizer.py -q
```

Result: **74 passed**, including a real cleaner input/output test and comparison
of every tagged candidate record against the saved baseline. The comparison
rejects a changed input hash, so a different dataset cannot be presented as a
like-for-like improvement. The input file and raw category lists remain unchanged.

For a new release candidate, create a new report without `--baseline` first;
do not reuse the old counts. Rerun DB060 on the exact regenerated artifact.
