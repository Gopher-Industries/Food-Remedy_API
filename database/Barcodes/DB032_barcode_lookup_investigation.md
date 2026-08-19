# DB032 – Investigate Barcode Lookup Failures

## Files Reviewed

- `mobile-app/app/(app)/(tabs)/scan.tsx`
- `mobile-app/components/providers/ProductProvider.tsx`
- `mobile-app/services/database/products/getProductById.ts`
- `database/seeding/seed_engine.py`
- `database/clean_data/normalization/BarcodeNormalisation.py`
- `mapping/map_enriched_to_product_detail.py`

## Investigation Findings

Product lookup is a Firestore document-ID get on collection `PRODUCTS`. The scanned string is used as the document ID with no format conversion on the live path.

### Missing barcodes

Seed files used for lookup (`products_5k_enriched.json`, `products_50k+_enriched.json`) contain no missing or empty barcode fields. `seed_engine.py` skips a row if `barcode` is absent, so those records would never be written. Missing barcodes in source data are therefore not a current cause of scan misses in the seeded catalog.

### Invalid barcode formats

All barcodes in those seed files are digit-only strings. The live scan path does not validate format. A camera payload with spaces, dashes, or non-digit characters is looked up as-is and will miss if the stored ID is digits only.

### Unexpected barcode lengths

Stored barcodes are not a single length. Most are EAN-13 (13 digits). A smaller set are EAN-8 (8 digits). A few are 14 digits. A handful are 15, 16, or 21 digits, which a retail scanner will not emit, so those documents cannot be reached by a normal scan.

Schema text in `database/seeding/schema_definition.json` still describes barcodes as “13 digits, no leading zeros”. The stored catalog does not follow that rule.

### Duplicate barcodes

No duplicate barcode values were found in the 5k or 50k+ seed slices. Duplicate document IDs are not contributing to lookup failures in this data.

### Current barcode normalisation behaviour

`BarcodeNormalisation.barcode_normalise()` strips non-digits, rejects values longer than 14 digits, and pads with leading zeros to GTIN-14. That logic is used when mapping enriched records to the Product Detail contract (`map_enriched_to_product_detail.py`).

It is **not** applied on the live scan path. `scan.tsx` passes camera `data` through unchanged. `ProductProvider.tsx` uses that same string. `getProductById.ts` calls `doc(fdb, "PRODUCTS", barcode)` with no trim, digit-strip, or GTIN-14 pad.

The important split is: GTIN-14 padding exists in Python mapping, but stored Firestore IDs and scan lookups both use the raw unpadded barcode (usually 13 digits). Applying padding on only one side would make current EAN-13 scans miss.

### Relationship between stored barcodes and product lookup

`seed_engine.py` writes `PRODUCTS/{barcode}` using the barcode field as the document ID. The app reads the same ID. Lookup succeeds only when the scanned string equals the stored ID exactly. `"9300633714437"` and `"09300633714437"` are different keys.

A second seeder, `database/seeding/seed_firestore.py`, writes collection `products` (lowercase). The app always reads `PRODUCTS`. If that seeder was used, every scan would miss even when the barcode string is correct.

### Examples of scans that return no result

The product screen does not use the words “No record”. A miss shows the toast “No product found for that barcode.” and EmptyState “Product Not Found”.

Examples that produce that outcome:

- Leading-zero EAN-8: stored `00221423`; a scanner that emits `221423` does not match.
- Overlong stored IDs such as `123456789101112` (15 digits) or `793144417118850103601` (21 digits): a normal EAN/UPC scan cannot equal the document ID.
- Collection mismatch: documents in `products` while the app queries `PRODUCTS`.
- Format mismatch: scanned value with spaces or dashes versus a digit-only stored ID (live path does not strip these).

For typical Australian EAN-13 scans, stored ID and camera data are already the same 13-digit string, so data quality is less likely to be the cause than catalog coverage or the mismatches above.

## Representative Testing

Barcode fields were counted in the seeding JSON used for lookup (not rewritten).

### `products_5k_enriched.json` (5,000 records)

- Missing / empty: 0
- Non-digit: 0
- Duplicates: 0
- Leading zero: 579 (~12%)
- Length 8: 111
- Length 12: 0
- Length 13: 4,882
- Length 14: 4
- Length 15: 1 (`123456789101112`)
- Length 21: 2 (e.g. `793144417118850103601`)
- EAN-8 with leading zeros: e.g. `00221423`

### `products_50k+_enriched.json` (11,367 records)

- Missing / empty: 0
- Non-digit: 0
- Duplicates: 0
- Leading zero: 1,652 (~15%)
- Length 8: 135
- Length 13: 11,216
- Length 14: 13
- Length 16: 1
- Length 21: 2

Padding every barcode to GTIN-14 does not merge distinct products in these files, but it would change almost every 13-digit document ID.

## Recommendation

Do not rewrite stored Firestore document IDs as a first step. The live path is internally consistent: raw barcode in seed JSON = document ID = raw scan string.

On a lookup miss, retry a small set of aliases of the scanned value without changing storage:

- trimmed
- digits only
- leading zeros stripped
- GTIN-14 padded (`zfill(14)`)

Use the first document that exists. That covers EAN-8 leading-zero misses and scan/storage length differences without migrating the catalog.

Treat the `products` vs `PRODUCTS` collection split as a separate seeding bug. Align seeders and integration tests on `PRODUCTS`, which is what the app already queries.

Do not apply `BarcodeNormalisation` to scans only, or to storage only. Both sides must stay aligned.

## Conclusion

The current lookup path does not clearly handle:

- Scanned barcodes that differ from the stored ID only by padding or leading zeros
- Overlong or non-retail stored IDs that a scanner cannot produce
- Documents written to `products` instead of `PRODUCTS`

Missing barcodes and duplicate barcodes are not present in the seeded slices reviewed here. GTIN-14 normalisation exists in mapping code but is not used between scan and Firestore get.

No existing functionality was changed as part of this investigation.
