# DB033 – Local Product Data SQLite Investigation Report

**Ticket ID:** DB033  
**Status:** Complete (Investigation Only)  
**Author:** ANJUM ASIYA  
**Target Application:** Food Remedy Mobile Application / Food Remedy API  
**Scope:** Feasibility analysis, SQLite schema design, performance benchmarking, offline capabilities, and cloud dependency evaluation for local product catalog storage.

---

## 1. Executive Summary

This investigation evaluates storing the Food Remedy product catalog locally on mobile devices using SQLite. The primary goal is to establish a lighter, offline-capable architecture that allows instantaneous barcode lookups and allergen/ingredient safety checks without relying on continuous internet connectivity or frequent Firestore reads.

### Key Investigation Takeaways
- **Catalog Size:** The project dataset comprises **61,373 product records**.
- **Storage Footprint:** A 5,000-product sample consumes **3.31 MB** of disk space (~695 bytes/record). The full catalog of 61,373 records extrapolates to **~40.68 MB**.
- **Lookup Performance:** Local SQLite barcode lookups execute with an average latency of **0.0450 ms** (45 microseconds, achieving >22,000 QPS), compared to 100–300 ms over cloud API calls.
- **Safety & Non-Interference:** All testing was conducted using isolated, local test databases (`database/sqlite_investigation/local_test_db033.db`). Production Firestore was not modified.

---

## 2. Detailed Findings

### 2.1 Current Number of Product Records
- **Raw Product Dataset:** 61,373 records distributed across JSON chunks in `database/seeding/` (`products_0k_10k.json` through `products_50k+.json`).
- **Enriched / Validated Dataset:** 57,369 records fully processed through the pipeline.
- **Test Sample Datasets:** 
  - `cleanTestSample.json`: 11 fully validated reference records.
  - `products_5k_test.json`: 5,000 test products (containing 4,997 valid deduplicated GTIN barcodes).

### 2.2 Product Fields Required by Mobile Application
The mobile application consumes product details conforming to `contracts/product_detail_v1.schema.json` and `FIRESTORE_STRUCTURE.md`:

| Field Category | Field Name | Data Type / Representation | Primary Usage |
| :--- | :--- | :--- | :--- |
| **Identifiers** | `barcode` | `TEXT` (GTIN-14 string) | Primary lookup key (Indexed) |
| **Product Names** | `productName`, `genericName`, `brand` | `TEXT` | Display, search, filtering |
| **Categorization** | `category`, `categories` | `TEXT` (Primary), `TEXT` (JSON array) | Taxonomy, alternative matching |
| **Nutrition & Health** | `nutriscoreGrade`, `completeness` | `TEXT`, `REAL` | Health rating display |
| **Quantities** | `productQuantity`, `productQuantityUnit`, `servingQuantity`, `servingQuantityUnit` | `REAL`, `TEXT` | Serving size calculations |
| **Ingredients & Allergens** | `ingredientsText`, `traces`, `ingredients`, `allergens`, `additives`, `labels` | `TEXT`, `TEXT` (JSON array for lists) | Allergen warning evaluation |
| **Structured Objects** | `nutrientLevels`, `nutriments`, `images`, `tags`, `metadata` | `TEXT` (JSON objects) | Detailed modal view & UI assets |

### 2.3 SQLite Product Catalogue Representation
A hybrid Relational/JSON schema was implemented to balance relational search performance with complex nested document structures:

```sql
CREATE TABLE IF NOT EXISTS local_products (
    barcode TEXT PRIMARY KEY,
    product_name TEXT NOT NULL,
    brand TEXT,
    generic_name TEXT,
    primary_category TEXT,
    nutriscore_grade TEXT,
    completeness REAL,
    ingredients_text TEXT,
    traces TEXT,
    product_quantity REAL,
    product_quantity_unit TEXT,
    serving_quantity REAL,
    serving_quantity_unit TEXT,
    categories_json TEXT,
    ingredients_json TEXT,
    allergens_json TEXT,
    additives_json TEXT,
    labels_json TEXT,
    nutrient_levels_json TEXT,
    nutriments_json TEXT,
    images_json TEXT,
    tags_json TEXT,
    metadata_json TEXT,
    date_added TEXT,
    last_updated TEXT
);

-- Performance B-Tree Indexes
CREATE INDEX IF NOT EXISTS idx_products_brand ON local_products(brand);
CREATE INDEX IF NOT EXISTS idx_products_category ON local_products(primary_category);
CREATE INDEX IF NOT EXISTS idx_products_nutriscore ON local_products(nutriscore_grade);
```

### 2.4 Advantages & Limitations of Local Product Storage

#### Advantages
1. **Offline-First Functionality:** Users can scan barcodes and view allergen warnings in supermarkets with poor or zero cellular coverage.
2. **Sub-Millisecond Speed:** Barcode lookup latency drops from ~200ms (network API) to **0.045ms** (local SQLite).
3. **Cost Reduction:** Drastically reduces Firestore read queries and API server traffic.
4. **Enhanced Privacy:** Barcode scanning and allergen analysis happen entirely on-device.

#### Limitations
1. **Device Storage Footprint:** Storing 61,373 products requires **~40.7 MB** of storage on the user's mobile device.
2. **Catalog Update Sync:** Devices require a background synchronization strategy (e.g., delta syncs) to receive new products and updated ingredient lists.
3. **Initial Hydration Overhead:** Downloading and populating 40 MB of product data during initial app installation requires battery and bandwidth.

### 2.5 Cloud & Firestore Service Dependencies
While product catalog lookups can move to SQLite, the following features **must remain on Firestore/Cloud backend**:

1. **User Authentication & Profiles:** `/USERS/{userId}/PROFILES` for managing account credentials and user allergen profile rules.
2. **Cloud Cart / Shopping List Sync:** Syncing shopping list items across multiple devices (`/users/{userId}/cart`).
3. **Crowd-Sourced Data & Product Edits:** User-submitted barcode corrections, new product submissions, and image uploads.
4. **Heavy AI Recommendation Models:** Machine learning models for finding complex substitute products.

### 2.6 Risks of Moving Product Data Locally

1. **Data Staleness & Allergen Safety:** If a local database update fails, users might scan a product with outdated allergen or ingredient data. *Mitigation: Store `lastUpdated` timestamps and enforce cloud fallback for critical allergen checks when data is stale.*
2. **Low-End Device Constraints:** Devices with under 1 GB free storage may face storage pressure. *Mitigation: Implement a hybrid local cache strategy (e.g. store top 10,000 frequent products locally, fetch long-tail products from Firestore).*
3. **Schema Migrations:** Database migrations on mobile clients require strict versioning and error handling.

---

## 3. Empirical Testing & Benchmarks

Empirical testing was executed via `database/sqlite_investigation/benchmark_db033.py` and `database/test_db033_sqlite_investigation.py`.

### Benchmark Results Summary

| Benchmark Metric | Result | Benchmark Conditions |
| :--- | :--- | :--- |
| **Sample Dataset Size** | 4,997 products | Ingested from `products_5k_test.json` |
| **Ingestion Speed** | 142.9 records/sec (34.98 s total) | Python SQLite transaction bulk insert |
| **Database File Size** | **3.31 MB** | 695.1 bytes per product record |
| **Extrapolated Full Size (61,373 rec)** | **40.68 MB** | Full catalog footprint estimate |
| **Barcode Lookup Latency** | **0.0450 ms** (45 µs) | Average over 1,000 queries |
| **Throughput (QPS)** | **22,208 queries/sec** | Single-threaded SQLite lookup |
| **Offline Name Search Latency** | **2.48 ms** | `LIKE '%Milk%'` over 5,000 records |

### Verification Test Suite Results
All **9 test cases** passed across `database/test_db033_sqlite_investigation.py` and `database/test_db033_mapping_correctness.py`:
- `test_sqlite_catalog_init_and_schema`: PASSED
- `test_import_and_retrieve_sample_products`: PASSED
- `test_barcode_lookup_variations`: PASSED (handles GTIN-14, 13-digit, hyphens, padded zeros)
- `test_5k_sample_ingestion_and_performance`: PASSED
- `test_name_search_offline`: PASSED
- `test_db033_reqs`: PASSED
- `test_db033_scan_to_seeded_record_resolution`: PASSED
- `test_db033_barcode_edge_cases`: PASSED
- `test_db033_mapper_missing_barcode_contract`: PASSED

---

## 4. Architectural Recommendations

1. **Adopt a Hybrid Cache Architecture:** Keep Firestore as the single source of truth while deploying SQLite as an on-device local cache in the mobile app (using `expo-sqlite` or React Native SQLite).
2. **Pre-pack Top 10k Products:** Bundle a compressed ~6 MB SQLite database containing the top 10,000 most frequently scanned Australian products inside the mobile app binary.
3. **Background Delta Sync:** Implement a lightweight REST/Firestore API endpoint that sends catalog delta updates (products added or modified in the last 7 days) to keep local SQLite databases updated efficiently.

---

*Report prepared for DB033 ticket completion.*
