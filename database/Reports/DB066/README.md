# DB066 – Verify Final Dataset Ready for App Integration

**Status:** Complete (Verification)
**Dataset verified:** `database/Release/v1.1/foodremedy_release_v1.1.json` (5,000 records, from DB070)
**Scope:** Confirm the approved release dataset is suitable for use by the application and supports the core product journey (product browsing, product detail, allergen warnings, barcode lookup).

---

## 1. Summary

The v1.1 release dataset itself is clean and passes every data-quality check performed (required fields, allergen handling, barcode integrity). However, this verification found **one release-blocking integration gap**: the dataset is never passed through the project's own documented `ProductDetailV1` contract mapper before being written to Firestore, so the shape the app actually receives does not fully match the shape the app's code expects. This causes a confirmed, concrete downstream failure in the app (a nutrition "highlight" calculation on the checkout screen) and leaves warning-relevant personalization data unused.

This is **not** a data-quality problem with the dataset — it is a pipeline wiring gap between the database release and the seeding step that hands data to the app.

---

## 2. Acceptance Criteria Results

| Criterion | Result | Evidence |
| --- | --- | --- |
| Representative products are checked | PASS | Sampled products across categories (peanut butter, protein powder, chocolate, hot sauce, ginger chews); all had real, usable names, brands, categories and nutrition data. |
| Required app-facing data is available | PASS, with a documented completeness gap | `barcode` / `productName`: 0 missing across 5,000 records. The `nutriments` **object** is present on all 5,000 records (100%) — but this means the container is present, not that every field inside it is. Individual core nutrient fields have real gaps: `fibre` missing on 2,542 records, `energy_kcal` on 1,023, `sodium` on 146, `salt` on 146, `saturated_fat` on 52, `sugars` on 43, `protein` on 29, `carbohydrates` on 3, `fat` on 1 (source: `database/Release/v1.1/validation_manifest.json` → `validation.nutrition.missing_field_counts`, cross-checked directly against the dataset). `images`, `allergens`, `categories`, `nutriscoreGrade`, `completeness`: 100% coverage. Optional fields (`genericName`, `traces`, `additives`, `labels`) vary as expected and are not required by the project's own `RELEASE_DATASET_CRITERIA.md`. |
| Allergen/unknown behaviour is checked | PASS | 4,055 known-allergen records, 945 conservative `["Unknown"]` records, 0 empty, 0 mixing `"Unknown"` with real allergens, 0 mismatches between `allergens` and `allergensDetected`. Matches DB057's fix. |
| Barcode/product lookup data is checked | PASS | 5,000/5,000 barcodes unique, digit-only, lengths 8 (EAN-8, 290 records) and 13 (EAN-13, 4,710 records). Doc-ID write path (`seed_firestore.py`) uses the same raw barcode string used for the read path — consistent. |
| Integration blockers are reported | **1 blocker found** | See Section 3. |

---

## 3. Integration Blocker: Release records are not mapped to the `ProductDetailV1` contract before seeding

### Root cause

`contracts/product_detail_v1.schema.json` documents the frozen API contract and states explicitly:

> "DB maps enriched records via `mapping/map_enriched_to_product_detail.py`; BE/FE consume this shape on `GET /api/products/{barcode}`."

This mapper adds fields the app's own code depends on: `nutriments_normalized`, `category` (singular), `tags`, and `metadata`.

None of the seeding entry points (`database/seeding/seed_firestore.py`, `seed_products.py`, `seed_engine.py`) call this mapper:
