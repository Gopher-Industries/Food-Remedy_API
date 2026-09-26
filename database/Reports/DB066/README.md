# DB066 – Verify Final Dataset Ready for App Integration

**Status:** Complete (Verification)
**Dataset verified:** `database/Release/v1.1/foodremedy_release_v1.1.json` (5,000 records, from DB070)
**Scope:** Confirm the approved release dataset is suitable for use by the application and supports the core product journey (product browsing, product detail, allergen warnings, barcode lookup).

---

## 1. Summary

The v1.1 release dataset itself is clean and passes every data-quality check performed (required fields, allergen handling, barcode integrity). However, this verification found **one release-blocking integration gap**: the dataset is never passed through the project's own documented `ProductDetailV1` contract mapper before being written to Firestore, so the shape the app actually receives does not match the shape the app's code expects. This causes at least one confirmed, concrete downstream failure in the app (a nutrition "highlight" calculation on the checkout screen) and leaves warning-relevant enrichment data (`riskTags`, etc.) unused.

This is **not** a data-quality problem with the dataset — it is a pipeline wiring gap between the database release and the seeding step that hands data to the app.

---

## 2. Acceptance Criteria Results

| Criterion | Result | Evidence |
| --- | --- | --- |
| Representative products are checked | PASS | Sampled products across categories (peanut butter, protein powder, chocolate, hot sauce, ginger chews); all had real, usable names, brands, categories and nutrition data. |
| Required app-facing data is available | PASS | `barcode` / `productName`: 0 missing across 5,000 records. Other app-facing fields (`nutriments`, `images`, `allergens`, `categories`, `nutriscoreGrade`, `completeness`): 100% coverage. Optional fields (`genericName`, `traces`, `additives`, `labels`) vary as expected and are not required by the project's own `RELEASE_DATASET_CRITERIA.md`. |
| Allergen/unknown behaviour is checked | PASS | 4,055 known-allergen records, 945 conservative `["Unknown"]` records, 0 empty, 0 mixing `"Unknown"` with real allergens, 0 mismatches between `allergens` and `allergensDetected`. Matches DB057's fix. |
| Barcode/product lookup data is checked | PASS | 5,000/5,000 barcodes unique, digit-only, lengths 8 (EAN-8, 290 records) and 13 (EAN-13, 4,710 records). Doc-ID write path (`seed_firestore.py`) uses the same raw barcode string used for the read path — consistent. |
| Integration blockers are reported | **1 blocker found** | See Section 3. |

---

## 3. Integration Blocker: Release records are not mapped to the `ProductDetailV1` contract before seeding

### Root cause

`contracts/product_detail_v1.schema.json` documents the frozen API contract and states explicitly:

> "DB maps enriched records via `mapping/map_enriched_to_product_detail.py`; BE/FE consume this shape on `GET /api/products/{barcode}`."

This mapper adds fields the app's own code depends on: `nutriments_normalized`, `category` (singular), `tags`, and `metadata`.

However, none of the seeding entry points (`database/seeding/seed_firestore.py`, `seed_products.py`, `seed_engine.py`) call this mapper:



So Firestore documents will contain the raw release-dataset shape (`dietTags`, `riskTags`, `allergensDetected`, etc.) instead of the `ProductDetailV1` contract shape the app expects.

### Confirmed downstream effects

**1. `nutriments_normalized` is always empty for every real product.**

Both app-side consumers read it directly with no computation of their own:

- `mobile-app/services/utils/normaliseFirestoreProduct.ts:61` — `nutriments_normalized: raw.nutriments_normalized ?? {}`
- `mobile-app/services/utils/productDetail.ts:182` — `normalizeNutrimentsNormalized(rawProduct.nutriments_normalized)`

Since Firestore documents never have this field, both always resolve to an empty object, even though raw `nutriments` (OFF-style keys such as `sugars_100g`) is present and populated for effectively all products.

**2. This silently breaks a real UI calculation — the checkout "highlight" (sugar/fat warning).**

`mobile-app/app/(app)/checkout.tsx:40`:

`getHighlight()` therefore can never compute a sugar/fat-based highlight for any real product, even though the underlying nutrition data is 100% populated in the release dataset. This is a compounding bug — it needs both the missing-field mapping fix **and** a separate fix to use `??` instead of `||` (or an explicit empty-check) in `checkout.tsx`.

**3. Personalization/warning tags computed by the pipeline are unused by the app.**

`dietTags`, `lifestyleTags`, `riskTags` (e.g. `contains_allergens`, `high_sugar`, `high_saturated_fat`), and `moodTags` are fully populated in every v1.1 record (produced by pipeline modules DB009/DB021), but:

None of this warning-relevant data is currently read anywhere in the mobile app. Not a defect in the dataset, but a completeness gap for the "core product journey" this ticket is scoped to verify.

### What is *not* affected

- Allergen warnings (`allergens` field) — read and displayed correctly; both app consumers have working fallback/derivation logic independent of the mapper.
- Traces warnings (`traces`, `tracesFromIngredients`) — read directly by a dedicated `AccessibleTracesModal` component; pass through unmodified since these fields exist as-is on the raw record.
- Main nutrition table (`NutrientsTab.tsx`) — reads raw `product.nutriments` directly, not `nutriments_normalized`, so it is unaffected.
- `category` (singular) — both app consumers derive it from `categories[0]` when the mapped `category` field is absent, so this has a working fallback.
- Barcode lookup itself — works correctly; the doc-ID write and read paths agree on the same raw barcode string.

### Recommendation

- Either (a) have `seed_firestore.py` run each record through `mapping/map_enriched_to_product_detail.py` before `batch.set()`, or (b) have the backend/API layer run the mapping at read time consistently (currently `productDetail.ts` assumes the data is already mapped, so it doesn't do this either).
- Separately flag the `||` vs `??` issue in `checkout.tsx:40` as a small frontend fix, since fixing (a) alone would still leave that line fragile to any future field that resolves to an empty-but-present object.
- Decide with the team whether `riskTags`/`dietTags`/`lifestyleTags`/`moodTags` are in scope for the current app release, or explicitly deferred.

---

## 4. Known Limitations (carried forward from the v1.1 validation manifest)

- 945 records use conservative `Unknown` allergen evidence and must not be described as allergen-free.
- 1,629 records have category tags outside the current deterministic category rules.
- Barcode validation covers supported digit-only lengths and uniqueness, not GTIN check digits.
- This is an offline database artifact; production seeding and Firestore application-path readback are separate deployment controls not exercised by this ticket (`production_release_approved: false`, `production_seeded: false` in `validation_manifest.json`).

---

## 5. Conclusion

The v1.1 release dataset itself meets the project's release criteria and is safe to approve as a **database artifact**. It should **not** be seeded to production Firestore as-is without addressing the mapping gap in Section 3 — doing so would silently ship a nutrition-highlight defect and leave warning-relevant tag data unreachable by the app, even though the source data is correct.
