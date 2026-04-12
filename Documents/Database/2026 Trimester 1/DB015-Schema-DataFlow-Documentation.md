# Food Remedy Database — Schema, Data Flow & Deployment Documentation

**Ticket:** DB015  
**Author:** Vivan  
**Last Updated:** April 2026  
**Trimester:** 2026/T1

---

## Table of Contents
- [Product Schema](#product-schema)
- [Firestore Indexes](#firestore-indexes)
- [Data Flow](#data-flow)
- [Cart Dependencies](#cart-dependencies)
- [Recommendation Dependencies](#recommendation-dependencies)
- [USERS, PROFILES & SHOPPING_LISTS](#users-profiles--shopping_lists)
- [Deployment Checklist](#deployment-checklist)
- [Data Handover Notes](#data-handover-notes)
- [Related T1 2026 documentation](#related-t1-2026-documentation)

---

## Product Schema

**Firestore Collection:** `PRODUCTS`  
**Document ID:** `barcode` (13-digit GTIN)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `barcode` | string | Yes | Unique 13-digit product barcode |
| `productName` | string | Yes | Product name |
| `brand` | string | No | Brand name |
| `genericName` | string | No | Generic product name |
| `additives` | array | No | Additive codes (e.g. e202) |
| `allergens` | array | No | Detected allergens (e.g. Milk, Gluten) |
| `ingredients` | array | No | Ingredient tags |
| `ingredientsText` | string | No | Raw ingredients text |
| `ingredientsAnalysis` | array | No | Ingredient analysis tags |
| `categories` | array | No | Product categories |
| `labels` | array | No | Product labels |
| `nutrientLevels` | object | No | Qualitative levels e.g. `{ "fat": "moderate" }` |
| `nutriments` | object | No | Normalised nutrition values per 100g |
| `nutriscoreGrade` | string | No | Nutriscore grade (a/b/c/d/e/unknown) |
| `productQuantity` | number | No | Product quantity |
| `productQuantityUnit` | string | No | Unit for product quantity |
| `servingQuantity` | number | No | Serving size quantity |
| `servingQuantityUnit` | string | No | Unit for serving size |
| `traces` | string | No | Trace allergens |
| `tracesFromIngredients` | string | No | Traces from ingredients |
| `completeness` | number | No | Data completeness score (0 to 1) |
| `images` | object | No | Image URLs (root, primary, variants) |
| `enrichment` | object | No | Nutrition scores, tags, composite score |

### nutriments fields (per 100g)
Key fields inside the `nutriments` object:
- `energy-kcal_100g` — Energy in kcal
- `energy_100g` — Energy in kJ
- `fat_100g` — Total fat in grams
- `saturated-fat_100g` — Saturated fat in grams
- `carbohydrates_100g` — Carbohydrates in grams
- `sugars_100g` — Sugars in grams
- `proteins_100g` — Protein in grams
- `salt_100g` — Salt in grams
- `sodium_100g` — Sodium in grams

---

## Firestore Indexes

| Fields | Direction | Purpose |
|--------|-----------|---------|
| `categories`, `allergens` | - | Diet and allergen filtering |
| `enrichment.nutrition.compositeScore` | DESCENDING | Sort by nutrition quality |
| `nutriscoreGrade` | - | Quick grade filter |
| `enrichment.tags` | - | Array-contains for diet/lifestyle tags |
| `brand`, `nutriscoreGrade` | - | Brand and quality combo filter |

---

## Data Flow
```
Open Food Facts (raw)
        ↓
  Scraping (scraping/)
        ↓
  Cleaning (clean_data/cleanProductData.py)
  - Deduplication
  - Text normalisation
  - Nutrient unit normalisation (DB003)
  - Category harmonisation
  - Barcode validation
        ↓
  Enrichment (pipeline/modules/)
  - Nutrition scoring
  - Tags (high sugar, high protein etc.)
  - Category assignment
        ↓
  Seeding (seeding/seed_engine.py)
        ↓
  Firestore PRODUCTS collection
        ↓
  Mobile App (Food Remedy)
```

---

## Cart Dependencies

The shopping cart feature depends on the following product fields:

| Field | Why it's needed |
|-------|----------------|
| `barcode` | Unique product identifier in cart items |
| `productName` | Display name in cart |
| `brand` | Display brand in cart |
| `images` | Product image in cart |
| `productQuantity` | Default quantity for cart |
| `productQuantityUnit` | Unit displayed in cart |
| `nutriments` | Nutrition summary per cart item |
| `nutriscoreGrade` | Health indicator shown in cart |

**Important:** All cart items reference products by `barcode`. If a product is missing from Firestore, the cart item will fail to resolve. Ensure all products are seeded before deployment.

---

## Recommendation Dependencies

The recommendation system depends on the following fields:

| Field | Why it's needed |
|-------|----------------|
| `categories` | Match similar products by category |
| `nutriments` | Compare nutritional values for healthier alternatives |
| `enrichment.nutrition.compositeScore` | Rank products by overall nutrition quality |
| `enrichment.tags` | Filter by diet/lifestyle tags (e.g. vegan, low sugar) |
| `nutriscoreGrade` | Quick health grade comparison |
| `allergens` | Exclude products with user allergens |

**Note:** The recommendation engine uses `enrichment.nutrition.compositeScore` (DESCENDING index) to suggest healthier alternatives. Ensure all products are enriched before seeding.

---

## USERS, PROFILES & SHOPPING_LISTS

### USERS collection
- Stores user authentication data
- Each user has a profile stored in the PROFILES collection

### PROFILES collection
Stores user preferences that feed recommendations:

| Field | How it affects recommendations |
|-------|-------------------------------|
| `dietaryPreferences` | Filters products by tags (e.g. vegan) |
| `allergens` | Excludes products containing user allergens |
| `healthGoals` | Prioritises products by nutrient scores |

### SHOPPING_LISTS collection
- References products by `barcode`
- Depends on `PRODUCTS` collection being fully seeded
- Cart totals depend on `nutriments` being normalised and consistent

**Dependency order for deployment:**
```
PRODUCTS must be seeded first
        ↓
USERS and PROFILES can be created
        ↓
SHOPPING_LISTS can reference products
```

---

## Deployment Checklist

### Before deployment:
- [ ] All products scraped and saved to `openfoodfacts-australia.jsonl`
- [ ] Cleaning pipeline run successfully (`cleanProductData.py`)
- [ ] Nutrient units normalised (DB003)
- [ ] Categories harmonised (DB004)
- [ ] Barcodes validated (DB005)
- [ ] Duplicates removed (DB006)
- [ ] Enrichment pipeline run (`pipeline/run_pipeline.py`)
- [ ] Schema validation passed (`seeding/schema_definition.json`)
- [ ] Products seeded to Firestore in chunks of 500 via `seed_engine.py`
- [ ] Firestore indexes created (see indexes section above)
- [ ] `serviceAccountKey.json` configured (do not commit to repo)

### After deployment:
- [ ] Verify product count in Firestore matches seeded count
- [ ] Test cart feature with at least 5 products
- [ ] Test recommendation feature returns results
- [ ] Test allergen filtering works correctly
- [ ] Test nutriscore grade filtering works correctly

---

## Data Handover Notes

- **Raw data:** `openfoodfacts-australia.jsonl` in repo root — do not commit files over 100MB
- **Cleaned data:** `database/seeding/products_Xk_Yk.json` — chunked by 10k products
- **Enriched data:** `database/seeding/products_Xk_Yk_enriched.json`
- **Seeding script:** `database/seeding/seed_engine.py` — seeds products to Firestore PRODUCTS collection
- **Service account key:** Never commit `serviceAccountKey.json` — store securely and share privately with team leads only
- **Pipeline config:** `database/pipeline/pipeline.config.json` — update input/output paths before running
- **Firestore limits:** Max 20k writes/day on free plan — seed in chunks and spread over multiple days if needed
- **Schema changes:** Any changes to product schema must be updated in `seeding/schema_definition.json` and in this documentation file

---

## Related T1 2026 documentation

| Document | Purpose |
|----------|---------|
| [T1 2026 workflow and local development](../../Guides/General/t1-2026-workflow-and-local-development.md) | How to run the app locally, captcha and environment variables, database folder overview, and links to other guides |
| [Database progress and handover alignment](DATABASE_PROGRESS_AND_HANDOVER_ALIGNMENT.md) | How database work in this repo compares to the prior repo and the Trimester 3 handover |
| [Database README](../../../database/DATABASE-README.md) | Folder-by-folder map of `database/` and quick reference table |