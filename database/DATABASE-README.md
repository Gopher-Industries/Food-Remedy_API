# 🧠 Food Remedy Database Documentation

This document is the **single place** for how the **database/** folder is organised, how data is processed (scrape → clean → enrich → seed), and where to find scripts and docs. No functionality is changed here—only documentation.

📄 **Future docs:** Save new database documentation in `Documents/Database/[Year-Trimester]`.

> **Firebase / Firestore:** [Firebase Access](../Documents/Guides/Leadership/firebase-access.md)

---

## 📚 Table of Contents

- [What the database folder is for](#what-the-database-folder-is-for)
- [How data flows](#how-data-flows)
- [Folder-by-folder](#folder-by-folder)
- [Scraping](#-scraping)
- [Cleaning](#-cleaning)
- [Data investigation](#-data-investigation)
- [Seeding](#-seeding)
- [Pipeline summary](#-pipeline-summary)
- [Root files in database/](#root-files-in-database)
- [Quick reference: “Where do I…?”](#quick-reference-where-do-i)

---

## What the database folder is for

The **database/** folder holds everything that **prepares product data** for the Food Remedy app:

1. **Getting** raw food product data (scraping).
2. **Cleaning** it so it is consistent and usable.
3. **Enriching** it with tags, scores, and categories.
4. **Uploading** it to Firestore (seeding).

So: **raw data in → scripts in these folders turn it into clean, structured data → that data is sent to Firestore for the mobile app.**

---

## How data flows

```
Scraping  →  Clean  →  Enrich  →  Seed
   ↓           ↓          ↓         ↓
scraping/  clean data/  pipeline/  seeding/
```

- **Scraping:** Get Australian products from Open Food Facts.
- **Clean:** Fix duplicates, names, units, and structure.
- **Enrich:** Add nutrition scores, tags, categories (done in pipeline).
- **Seed:** Upload the final data to Firestore.

The **pipeline/** folder runs clean → enrich → seed in one go using `pipeline.config.json`. Optional **Investigation** (e.g. `data_investigation/`) is for exploring and validating data outside the main pipeline.

---

## Folder-by-folder

| Folder | What it does | Key files |
|--------|--------------|-----------|
| **scraping/** | Gets raw Australian products from Open Food Facts. | `OpenFoodFacts-DataScrape.py` |
| **clean data/** | Cleans and normalises product data (one canonical cleaning folder). | `cleanProductData.py`, `constants.py`, `normalization/`, `IOExamples/` |
| **pipeline/** | Runs clean → enrich → seed from config. | `run_pipeline.py`, `pipeline.config.json`, `stages/`, `modules/` |
| **seeding/** | Uploads product JSON to Firestore in batches. | `seed_firestore.py`, `seed_engine.py`, `seed_products.py`, `schema_definition.json`, product chunk files |
| **Allergens/** | Allergen reference data and detection. | `allergens_config.json`, `load_allergens.py`, `seed_allergens_to_db.py`, `test_allergens.py` |
| **QA/** | Quality assurance for cleaned data. | `DB006_QA_cleaning.py`, `summary_report.txt`, `errors.json` |
| **Validation/** | Validates product schema/rules before use. | `db021_validator.py` |
| **Reports/** | Generates validation/pipeline reports. | `db021_report_generator.py` |
| **data_investigation/** | Exploratory analysis and samples (not production pipeline). | `exampleProductRaw.json`, `exampleProductCleaned.json`, `data_investigation.py` |
| **logging_system/** | Shared logging for pipeline/scripts. | `logger.py`, `pipeline_logger_demo.py` |
| **local_backend/** | Local scan/persistence helpers (Node/JS). | `scanPipeline.js`, `persistenceLayer.js`, `testScan.js`, `testPersistence.js` |
| **output/** | Output chunks from pipeline runs. | `chunk_0_raw.json`, `chunk_0_clean.json`, `chunk_0_enriched.json` |

---

## 🥄 Scraping

**File:** `database/scraping/OpenFoodFacts-DataScrape.py`

- Streams `.jsonl.gz` from Open Food Facts (no full download).
- Keeps only products where `countries_tags` includes `australia`.
- Saves as `openfoodfacts-australia.jsonl`.

> Do not commit a full jsonl to the repo. Use 10k-product chunks for Firestore (max 20k writes/day).

---

## 🧹 Cleaning

**File:** `database/clean data/cleanProductData.py`

Prepares scraped data for ingestion: standardises, deduplicates, renames, and structures.

1. **Load & deduplicate** — Remove duplicate product entries by barcode.
2. **Text & field normalisation** — Clean names, brands, valid barcodes.
3. **Numeric standardisation** — Consistent units (e.g. grams).
4. **Nutrient filtering** — Keep energy, fats, carbs, protein, salt/sodium, etc.
5. **Tag cleaning** — Remove language prefixes (e.g. `en:`) from tags.
6. **Image handling** — Generate image URLs from barcodes.
7. **Schema refinement** — Drop unwanted columns, rename `code` → `barcode`, `brands` → `brand`, camelCase.
8. **Save** — Export cleaned JSON for Firestore/pipeline.

**Note:** `clean data/` (with a space) is the **only** cleaning folder. All cleaning scripts and examples live there.

---

## 🔎 Data investigation

**Folder:** `database/data_investigation/`

Used for exploratory analysis and validation: test cleaning, compare raw vs cleaned, validate before seeding. For internal testing and reporting, not production pipeline scripts.

---

## 🌱 Seeding

**File:** `database/seeding/seed_firestore.py` (and `seed_engine.py`, `seed_products.py`)

1. **Initialise Firebase** — Use `serviceAccountKey.json`.
2. **Load cleaned data** — e.g. `products_XXk_XXk.json` (chunk range in filename).
3. **Batch upload** — Writes in chunks of 500, with retries and timestamps (`dateAdded`, `lastUpdated`).
4. **Store** — Products in Firestore `PRODUCTS` collection, keyed by barcode.

---

## ⚙️ Pipeline summary

End-to-end flow:

**Scraping → Cleaning → Enrichment → Seeding**

1. **Scrape** — Collect Australian food product data.
2. **Clean** — Process and standardise (consistent schema).
3. **Enrich** — Add tags, scores, categories (pipeline modules).
4. **Seed** — Upload to Firestore.

Optional **Investigation** (e.g. `data_investigation/`) validates quality and accuracy outside the main pipeline. Run the full flow via `pipeline/run_pipeline.py` and `pipeline/pipeline.config.json`.

---

## Root files in database/

| File | Purpose |
|------|--------|
| `DATABASE-README.md` | This file — structure, process, and quick reference. |
| `DB006_sample1.py` | Sample script for DB006 (QA). |
| `DB007-missing-values.md` | Notes on missing values (DB007). |
| `pipeline_checkpoints.json`, `pipeline_run_metadata.json` | Pipeline state and metadata (used by `run_pipeline.py`). |
| `__init__.py` | Makes `database` a Python package. |

---

## Quick reference: “Where do I…?”

| I want to… | Go to… |
|------------|--------|
| Get raw Australian products | `scraping/OpenFoodFacts-DataScrape.py` |
| Clean raw data | `clean data/cleanProductData.py` and `clean data/normalization/` |
| Run full flow (clean → enrich → seed) | `pipeline/run_pipeline.py` and `pipeline/pipeline.config.json` |
| Upload products to Firestore | `seeding/` (e.g. `seed_firestore.py`, `seed_engine.py`) |
| Work on allergens | `Allergens/` |
| Run or improve cleaning QA | `QA/DB006_QA_cleaning.py` |
| Validate schema/product shape | `Validation/`, `seeding/schema_definition.json` |
| Explore data or examples | `data_investigation/`, `clean data/IOExamples/` |
| Change pipeline logging | `logging_system/logger.py` |

---

**Summary:** One cleaning folder (`clean data/`). One doc (this file). Flow: Scraping → Clean → Enrich → Seed. New team members can use this README to find scraping scripts, cleaning scripts, enrichment (pipeline), seeding scripts, and QA/Reports.
