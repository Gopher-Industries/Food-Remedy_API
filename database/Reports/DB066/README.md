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

    $ grep -rn "map_enriched_to_product_detail" database/seeding/
    # (no output)

The actual Firestore write in `seed_firestore.py` writes the **raw** release record directly:

    doc_ref = db.collection(PRODUCTS_COLLECTION).document(str(barcode))
    batch.set(doc_ref, product, merge=True)   # `product` is the raw dataset record, unmapped

So Firestore documents contain the raw release-dataset shape (`dietTags`, `riskTags`, `allergensDetected`, etc.) instead of the `ProductDetailV1` contract shape the app expects.

### Confirmed downstream effects

**1. `nutriments_normalized` — a separate, derived field — is always empty for every real product. This is distinct from the raw `nutriments` object, which is present and mostly (not fully) populated.**

To be precise about which field is affected:
- `nutriments` (raw, OFF-style keys like `sugars_100g`): present as a non-empty object on all 5,000 records; individual keys within it have the gaps listed in Section 2.
- `nutriments_normalized` (a *different*, derived field with keys like `sugars_g`): not present on any record, because nothing ever computes it before or during seeding.

Both app-side consumers read `nutriments_normalized` directly with no computation of their own — they don't derive it from raw `nutriments`, they just read the field and default to empty if it's missing:

- `mobile-app/services/utils/normaliseFirestoreProduct.ts:61` — `nutriments_normalized: raw.nutriments_normalized ?? {}`
- `mobile-app/services/utils/productDetail.ts:182` — `normalizeNutrimentsNormalized(rawProduct.nutriments_normalized)`

Since Firestore documents never have this field, both always resolve to an empty object.

**2. This silently breaks a real UI calculation — the checkout "highlight" (sugar/fat warning). Evidence traced end-to-end through the actual data flow:**

    ProductProvider.fetchRemote()
      -> services/getProductById()
        -> normaliseFirestoreProduct()      // sets nutriments_normalized: raw.nutriments_normalized ?? {}  ->  always {}
      -> currentProduct  (ProductProvider)
        -> AddToListModal: p = product ?? currentProduct
          -> addItem(listId, p, ...)         // shopping list item stores this product shape as JSON
            -> useShoppingList().currentItems[i].product   // read back unchanged at checkout
              -> checkout.tsx: item.product

`mobile-app/app/(app)/checkout.tsx:40`:

    const nutriments = product.nutriments_normalized || product.nutriments || {};

This line looks like a safe fallback to raw `nutriments`, but it is not: in JavaScript an empty object `{}` is truthy, so `product.nutriments_normalized || product.nutriments` evaluates to `{}` and never actually falls through to the raw data. As a result:

    const hasNutriments = Object.keys(nutriments).length > 0;   // always false
    ...
    const sugar = getNutrient(["sugars_g", "sugars_100g", "sugars"]);  // always null

`getHighlight()` therefore can never compute a sugar/fat-based highlight for any real product that reached checkout through the normal product-detail → add-to-list flow, even though the underlying raw nutrition data exists for the large majority of products. This is a compounding bug — it needs both the missing-field mapping fix **and** a separate fix to use `??` instead of `||` (or an explicit empty-check) in `checkout.tsx`.

**3. Personalization/warning tags computed by the pipeline are unused by the app — and are a genuinely separate field from the contract's `tags`, not something the mapper would fix.**

Two different things are involved here, and they should not be conflated:

- `tags` (`{final: [], removed: []}`) — the field the `ProductDetailV1` contract and `map_enriched_to_product_detail.py` deal with. The mapper's `_tags_to_wire()` reads `product.get("tags")` specifically — a field that does not exist anywhere on the release dataset records at all. So even after fixing the mapping gap in Section 3's root cause, `tags.final`/`tags.removed` would still come back empty, because there is no source `tags` field to map from. (Low practical impact today: no UI component currently reads `tags.final`/`tags.removed`.)
- `dietTags`, `lifestyleTags`, `riskTags` (e.g. `contains_allergens`, `high_sugar`, `high_saturated_fat`), `moodTags` — separate fields, fully populated in every v1.1 record by pipeline modules DB009/DB021. These are not read by the mapper at all, and not read anywhere in the mobile app:

    $ grep -rln "riskTags\|dietTags\|lifestyleTags\|moodTags" mobile-app --include="*.ts" --include="*.tsx"
    # (no output)

So: running the mapper fixes `nutriments_normalized` / `category` / `metadata`, but does **not** fix or surface `tags`, `dietTags`, `lifestyleTags`, `riskTags`, or `moodTags` — those would need either an extension to the mapper or a direct app-side read of those fields. Not a defect in the dataset, but a completeness gap for the "core product journey" this ticket is scoped to verify.

### What is *not* affected

- Allergen warnings (`allergens` field) — read and displayed correctly; both app consumers have working fallback/derivation logic independent of the mapper.
- Traces warnings (`traces`, `tracesFromIngredients`) — read directly by a dedicated `AccessibleTracesModal` component; pass through unmodified since these fields exist as-is on the raw record.
- Main nutrition table (`NutrientsTab.tsx`) — reads raw `product.nutriments` directly, not `nutriments_normalized`, so it is unaffected by the mapping gap (though it is still subject to the per-field gaps noted in Section 2, which is expected source-data sparsity, not a bug).
- `category` (singular) — both app consumers derive it from `categories[0]` when the mapped `category` field is absent, so this has a working fallback.
- Barcode lookup itself — works correctly; the doc-ID write and read paths agree on the same raw barcode string.

### Recommendation

- Either (a) have `seed_firestore.py` run each record through `mapping/map_enriched_to_product_detail.py` before `batch.set()`, or (b) have the backend/API layer run the mapping at read time consistently (currently `productDetail.ts` assumes the data is already mapped, so it doesn't do this either).
- Separately flag the `||` vs `??` issue in `checkout.tsx:40` as a small frontend fix, since fixing (a) alone would still leave that line fragile to any future field that resolves to an empty-but-present object.
- Decide with the team whether `riskTags`/`dietTags`/`lifestyleTags`/`moodTags` are in scope for the current app release; if so, the mapper needs to be extended to carry them through, or the app needs to read them directly — the current mapper won't surface them either way.

---

## 4. Known Limitations (carried forward from the v1.1 validation manifest)

- 945 records use conservative `Unknown` allergen evidence and must not be described as allergen-free.
- 1,629 records have category tags outside the current deterministic category rules.
- Barcode validation covers supported digit-only lengths and uniqueness, not GTIN check digits.
- Individual core nutrient fields (see Section 2) have source-data gaps even though the `nutriments` object itself is present on every record; this is documented sparsity in the underlying source data, not a processing defect.
- This is an offline database artifact; production seeding and Firestore application-path readback are separate deployment controls not exercised by this ticket (`production_release_approved: false`, `production_seeded: false` in `validation_manifest.json`).

---

## 5. Conclusion

The v1.1 release dataset itself meets the project's release criteria and is safe to approve as a **database artifact**. It should **not** be seeded to production Firestore as-is without addressing the mapping gap in Section 3 — doing so would silently ship a nutrition-highlight defect and leave warning-relevant tag data unreachable by the app, even though the source data is correct.
