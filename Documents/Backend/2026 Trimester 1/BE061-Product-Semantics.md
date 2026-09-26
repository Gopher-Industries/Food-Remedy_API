# BE061 — Product semantic attributes

`semanticAttributes` is optional in old `PRODUCTS` documents and product-detail
responses. The v1 contract is embedded in
`contracts/product_detail_v1.schema.json` and matches BE058's canonical
`ProductSemanticAttributes` definition. The mobile and server normalizers
return the block only if every populated attribute has a controlled value,
source, source version, confidence in `[0,1]`, and timestamp. An invalid block
is omitted in its entirety; it never changes allergens, traces, labels,
nutrients or safety decisions. `complete` requires all 11 attributes; missing
fields under `partial` are unknown, while `not_applicable` is an evidenced
value. These attributes are ranking evidence only.

## Repeatable backfill and coverage

The offline backfill reads a curated manifest. It does not infer from product
names, modify its input, or write Firestore. It rejects invalid evidence and
refuses to overwrite a differing block without review. The bundled manifest
contains **synthetic evaluation products**, not production catalogue claims.
Catalogue owners and QA must approve a real subset before production upload.

```sh
python3 database/pipeline/backfill_semantic_attributes.py \
  --products database/pipeline/fixtures/semantic_evaluation_products_v1.json \
  --manifest database/pipeline/fixtures/semantic_evaluation_manifest_v1.json \
  --output /tmp/be061_semantic_products.json \
  --report /tmp/be061_semantic_coverage.json
python3 -m unittest -v test.test_semantic_backfill
npm --prefix mobile-app test -- --runInBand --silent productSemanticAttributes.test.ts productDetail.test.ts
npx firebase emulators:exec --only firestore --project demo-food-remedy-personalization \
  'node mobile-app/scripts/testPersonalizationRules.cjs'
```

The synthetic run populated 7 of 33 possible attributes across three
products, left 26 missing, and found no low-confidence populated values. One
product had no evidence block. Coverage separates absent and low-confidence
fields; no value is invented for a missing field. The backfill is idempotent
and preserves the safety/nutrition fields. Firestore rules permit product reads
and deny authenticated owner, other-account and guest writes; trusted Admin
SDK writes bypass client rules. The emulator test checks direct semantic-field
updates are denied.
