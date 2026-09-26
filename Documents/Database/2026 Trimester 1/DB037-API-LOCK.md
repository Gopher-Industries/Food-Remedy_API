# DB037 — Cross-team API lock (BE + DB)

**Status:** Contract frozen at **v1.0.1** (DB023 patch, 2026-08-10; original v1.0.0 lock dated 2026-05-21)
**Repo:** Food-Remedy_API  
**Related tasks:** DB033 (mapping correctness), DB034 (contract validation)

## Goal

Establish a **single source of truth** for Product Detail JSON across Database, Backend, and Frontend:

1. DB enriches and stores products (`database/`).
2. DB maps enriched records to the wire shape (`mapping/map_enriched_to_product_detail.py`).
3. BE serves that shape on product detail (`mobile-app/app/api/products/[barcode]+api.ts`).
4. FE renders using the same field names (`mobile-app/services/utils/productDetail.ts`, `mobile-app/types/Product.d.ts`).

## Frozen artifacts (v1.0.x)

| Artifact | Path |
|----------|------|
| JSON Schema (canonical) | `contracts/product_detail_v1.schema.json` |
| JSON Schema (legacy alias) | `api/contracts/product_v1.json` |
| Mapper (DB → wire) | `mapping/map_enriched_to_product_detail.py` |
| Validator | `mapping/validate_product_contract.py` |
| Example payloads | `api/contracts/examples/*.json` |
| Changelog | `api/contracts/CHANGELOG.md` |

## Field list (ProductDetail v1)

| Field | Required | Type | Source / notes |
|-------|----------|------|----------------|
| `barcode` | yes | string | Normalised GTIN (`BarcodeNormalisation`) |
| `productName` | yes | string | Enriched record |
| `brand` | no | string \| null | |
| `genericName` | no | string \| null | |
| `additives` | no | string[] | Default `[]` |
| `allergens` | no | string[] | Known values or `["Unknown"]` when missing/empty |
| `ingredients` | no | string[] | Default `[]` |
| `ingredientsText` | no | string \| null | |
| `category` | no | string \| null | Primary category (`category_normalizer`) |
| `categories` | no | string[] | Sorted, deduped slugs |
| `labels` | no | string[] | |
| `nutrientLevels` | no | object | String values per nutrient |
| `nutriments` | no | object | Raw OFF-style keys |
| `nutriments_normalized` | no | object | Per-100g: `energy_kj`, `energy_kcal`, `fat_g`, … (10 keys) |
| `nutriscoreGrade` | no | string \| null | |
| `productQuantity` | no | number \| null | |
| `productQuantityUnit` | no | string \| null | |
| `servingQuantity` | no | number \| null | |
| `servingQuantityUnit` | no | string \| null | |
| `traces` | no | string \| null | |
| `completeness` | no | number \| null | |
| `images` | no | object | `root` required non-empty; `primary`, `variants` |
| `tags` | no | object | `{ final: string[], removed: string[] }` |
| `metadata` | no | object | Default `{ source: "local-enriched" }` when mapped |
| `enrichmentMetadata` | no | object | Optional; recommendations |
| `dateAdded` | no | string \| null | When present on enriched record |
| `lastUpdated` | no | string \| null | When present on enriched record |

**Out of scope for v1 (stored separately):** full `enrichment` blob (e.g. `enrichment.alternatives`) — see `DB019_README.md`.

## BE behaviour (locked)

- **Endpoint:** `GET /api/products/{barcode}`
- **Response body:** Single ProductDetail v1 object (200), or `{ error, message }` (400/404/500).
- **Builder:** `buildProductDetailResponse()` normalises Firestore docs to the same keys as the Python mapper output.

## How to verify locally

```bash
# Contract + examples
python -m pytest test/test_db037_contract_lock.py test/test_validate_product_contract.py -q

# Map + validate a seed file
python scripts/validate_db037_contract.py --input database/seeding/cleanTestSample.json

# Regenerate examples from cleanTestSample
python scripts/generate_contract_examples.py
```

## Cross-team sign-off

| Team | Owner | Sign-off (v1.0.0) | Date |
|------|-------|-------------------|------|
| Database | | ☐ | |
| Backend | | ☐ | |
| Frontend | | ☐ | |

**Checklist before checking the box:**

- [ ] Field list above matches your integration code.
- [ ] Reviewed at least one file in `api/contracts/examples/`.
- [ ] Agreed that contract changes require a version bump in `api/contracts/CHANGELOG.md`.
- [ ] No silent renames between Firestore fields and API response keys.

## Versioning

- Current: **1.0.1** (DB023 missing-allergen semantics; field shape unchanged)
- Patch documentation-only: no version bump.
- New optional field: minor version (1.1.0) + changelog + FE/BE review.
- Breaking rename/remove: **v2** schema file + migration plan.
