# DB012 - Validation & Integration Testing

This document describes what DB012 covers, how to run it, and what "done" looks like.

## Scope

DB012 deliverables:

1. Validate dataset quality before seeding (schema + barcodes + required fields).
2. Run integration checks against Firestore for:
   - product lookup by barcode
   - category query
   - recommendation candidate query
3. Run local cart / shopping-list integration (product snapshot persisted like the app).
4. Document test commands and coverage.

## Files

- `database/Validation/db012_validator.py` - DB012 batch validator wrapper.
- `database/Validation/db021_validator.py` - core schema and barcode checks used by DB012.
- `database/db012_integration_test.py` - Firestore integration test runner.
- `database/db012_cart_integration.js` - SQLite cart flow (add enriched item, list, snapshot assertions).
- `database/seeding/seed_firestore.py` - seeding engine with optional DB012 pre-seed validation.

## Validation before seeding

Run DB012 validation directly:

```bash
python database/Validation/db012_validator.py
```

Run full validation on a specific file:

```bash
python -c "from database.Validation.db012_validator import BatchValidator; import sys; print(BatchValidator().validate('database/seeding/products_enriched.json'))"
```

Run seeding with DB012 validation enabled:

```bash
python database/seeding/seed_firestore.py --input database/seeding/products_enriched.json --validate
```

The pipeline (`database/pipeline/pipeline.config.json`) sets `validate_before_seed: true` on the seed stage so a full `run_pipeline.py` run validates the same slice before writes.

Notes:

- `--validate` validates the loaded data slice before any Firestore writes.
- `--subset N` can be combined with `--validate` for faster smoke checks.

## Firestore integration tests

Run all DB012 integration checks:

```bash
python database/db012_integration_test.py
```

Optional environment variables:

- `DB012_SAMPLE_BARCODE` - optional; if omitted, a product that has `categories` is auto-selected from Firestore
- `DB012_SAMPLE_CATEGORY` - optional override; use a **slug** that exists in `categories` (e.g. `plant-based-foods-and-beverages`), not always a display name like `Snacks`
- `FIRESTORE_PRODUCTS_COLLECTION` - override collection name (default: `products`)
- `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_KEY` - path to service account JSON (same as seeding)

PowerShell example:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\foodremedy-deakin-firebase-adminsdk-....json"
$env:DB012_SAMPLE_BARCODE="9337951006005"
$env:DB012_SAMPLE_CATEGORY="plant-based-foods-and-beverages"
python database/db012_integration_test.py
```

## What the integration checks verify

- `test_product_lookup(barcode)`:
  - product document exists for barcode
- `test_category_query(category)`:
  - category filter returns at least one product
- `test_recommendation_candidates()`:
  - recommendation-style query returns candidate products using `nutriscoreGrade`
- `test_schema_fields(barcode)`:
  - required mobile/cart-facing fields exist: `productName`, `nutriments`, `nutriscoreGrade`

## Cart / shopping-list integration (local)

Simulates adding products shaped like Firestore documents into the SQLite layer used by the API (`persistenceLayer_BE03.js`): original vs lower-sugar “recommended” item, with snapshot JSON checks.

From repo root:

```bash
npm install
npm run test:db012:cart
```

Or:

```bash
node database/db012_cart_integration.js
```

## Barcode format validation (added)

`validate_barcodes()` now rejects barcodes that are non-numeric or outside
standard retail lengths (8, 12, 13, 14 digits — EAN-8/UPC-A/EAN-13/GTIN-14).
Previously this check existed only as an unused counter (`invalid_type`) and
never actually flagged anything.

**Known schema inconsistency:** `schema_definition.json` describes barcode
as "13 digits, no leading zeros" but real data
(`database/seeding/products_5k_test.json`, 5000 records) shows 111 valid
8-digit barcodes, 4 valid 14-digit barcodes, and 579 (~11.6%) with a
legitimate leading zero. This implementation follows real data over the
schema description. Recommend reconciling `schema_definition.json` in a
follow-up ticket.


## Expected result

DB012 is considered successful when:

- batch validation passes on the target dataset
- Firestore integration checks return PASS on the target Firebase project
- cart integration script exits 0
- this document stays up to date with command and coverage changes
