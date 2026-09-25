# Product Detail API contract

**Version:** 1.0.1 (DB037/DB023)

**Canonical schema:** [`contracts/product_detail_v1.schema.json`](../../contracts/product_detail_v1.schema.json)  
**Alias in this folder:** `product_v1.json` (must stay identical to the canonical file)

## Data flow

```
enriched DB record  →  map_enriched_to_product_detail()  →  ProductDetail v1 JSON
                              ↑                                    ↓
                    database/seeding/*.json              GET /api/products/{barcode}
                                                         buildProductDetailResponse() (FE/BE)
```

## Examples

Committed mapped payloads (from `database/seeding/cleanTestSample.json`):

| File | Notes |
|------|--------|
| `examples/minimal.json` | Synthetic QA record (allergen + tags) |
| `examples/tuna_tomato_onion.json` | Seafood, moderate fat, images |
| `examples/vegetable_oil.json` | Plant oils category |
| `examples/third_sample.json` | Additional real barcode |

Regenerate from enriched input:

```bash
python scripts/generate_contract_examples.py
```

## Validation

```bash
python -m pytest test/test_db037_contract_lock.py test/test_validate_product_contract.py
python scripts/validate_db037_contract.py
```

See [`Documents/Database/2026 Trimester 1/DB037-API-LOCK.md`](../../Documents/Database/2026%20Trimester%201/DB037-API-LOCK.md) for the cross-team sign-off checklist.

## Missing allergen information

`allergens` remains a `string[]`. Known values are returned unchanged; missing,
null, placeholder, or empty input is returned as `["Unknown"]`. The sentinel is
never mixed with known allergen names. See the
[DB023 implementation note](../../Documents/Database/2026%20Trimester%202/DB023-Unknown-Allergen-Handling.md)
for the pipeline and compatibility decisions.
