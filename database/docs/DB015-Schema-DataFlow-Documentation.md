# Food Remedy Database — Schema, Data Flow & Deployment Documentation

**Ticket:** DB015  
**Author:** Vivan  
**Last Updated:** March 2026

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

---

## Product Schema

**Firestore Collection:** `products`  
**Document ID:** `barcode` (13-digit GTIN)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `barcode` | string | ✅ | Unique 13-digit product barcode |
| `productName` | string | ✅ | Product name |
| `brand` | string | ❌ | Brand name |
| `genericName` | string | ❌ | Generic product name |
| `additives` | array | ❌ | Additive codes (e.g. e202) |
| `allergens` | array | ❌ | Detected allergens (e.g. Milk, Gluten) |
| `ingredients` | array | ❌ | Ingredient tags |
| `ingredientsText` | string | ❌ | Raw ingredients text |
| `ingredientsAnalysis` | array | ❌ | Ingredient analysis tags |
| `categories` | array | ❌ | Product categories |
| `labels` | array | ❌ | Product labels |
| `nutrientLevels` | object | ❌ | Qualitative levels e.g. `{ "fat": "moderate" }` |
| `nutriments` | object | ❌ | Normalised nutrition values per 100g |
| `nutriscoreGrade` | string | ❌ | Nutriscore grade (a/b/c/d/e/unknown) |
| `productQuantity` | number | ❌ | Product quantity |
| `productQuantityUnit` | string | ❌ | Unit for product quantity |
| `servingQuantity` | number | ❌ | Serving size quantity |
| `servingQuantityUnit` | string | ❌ | Unit for serving size |
| `traces` | string | ❌ | Trace allergens |
| `tracesFromIngredients` | string | ❌ | Traces from ingredients |
| `completeness` | number | ❌ | Data completeness score (0 to 1) |
| `images` | object | ❌ | Image URLs (root, primary, variants) |
| `enrichment` | object | ❌ | Nutrition scores, tags, composite score |

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
  Cleaning (clean data/cleanProductData.py)
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
  Seeding (seeding/seed_firestore.py)
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
- Links to PROFILES via `userId`

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
USERS/PROFILES can be created
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
- [ ] Products seeded to Firestore in chunks of 500
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
- **Service account key:** Never commit `serviceAccountKey.json` — store securely and share privately with team leads only
- **Pipeline config:** `database/pipeline/pipeline.config.json` — update input/output paths before running
- **Firestore limits:** Max 20k writes/day on free plan — seed in chunks and spread over multiple days if needed
- **Schema changes:** Any changes to product schema must be updated in `seeding/schema_definition.json` and this document