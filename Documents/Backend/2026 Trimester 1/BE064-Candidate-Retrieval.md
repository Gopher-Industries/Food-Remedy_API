# BE064 — Bounded hybrid candidate retrieval

V2 uses five optional Firestore branches. V1 keeps its old category-only query.
No branch starts from fallback categories such as `food`, `products`, `other` or
`unknown`. The v2 result is deduplicated by normalized, validated GTIN and
sorted by barcode before deterministic safety and ranking. A cheap semantic
shortlist then filters with the existing hard safety gate, ranks by category,
supported food role, controlled occasion, and explicit texture evidence, and
uses green-before-grey and barcode tie breaking. No model is called here.

| Branch | Query | Maximum document reads | Index |
| --- | --- | ---: | --- |
| Meaningful category | `categories array-contains-any` | 60 | automatic array field |
| Controlled occasion | `semanticAttributes.occasion.value ==` | 36 | nested field in `firestore.indexes.json` |
| Supported food role | `semanticAttributes.foodRole.value ==` | 36 | nested field in `firestore.indexes.json` |
| Normalized name prefix | `productNameSearch` ordered prefix | 24 | existing name index |
| Shared label | `labels array-contains` | 24 | automatic array field |

The aggregate maximum is 180 returned Firestore documents per request, with
200 candidates examined at most and a configurable shortlist size
`SUBSTITUTION_SEMANTIC_TOP_K` clamped to 1–20 (default 12). Only controlled
occasion words such as `lunchbox` or a saved occasion chip affect the semantic
branch. Query failures do not inject a candidate into the shortlist. The
branch list, read count and latency are internal to the v2 execution and not
logged with UID, barcode or raw intention.

The synthetic emulator fixture contains a same-category snack, a safe
cross-category rice cake with a reviewed lunchbox attribute, an allergen
conflict and an unrelated `other` product. The cross-category replacement is
retrieved and appears in the top-2 semantic shortlist (recall@2 = 1/1). The
allergen conflict does not appear in the shortlist; the unrelated fallback
product is never retrieved. Two repeated calls return the same barcode order.
The emulator test asserts at most 180 returned documents and less than 4 s
retrieval latency, consistent with the endpoint deadline. This small fixture
is a regression check, not a production recall estimate; BE069 expands the
approved evaluation set. Required indexes are committed but not deployed.

```sh
npm --prefix mobile-app test -- --runInBand --silent hybridCandidateRetrieval.test.ts
npx firebase emulators:exec --only firestore --project demo-food-remedy-be037 \
  'npm --prefix mobile-app test -- --runInBand --silent firestoreProductSubstitutionRepository.test.ts'
```
