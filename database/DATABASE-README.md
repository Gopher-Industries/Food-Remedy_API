# 🧠 Food Remedy Database Documentation

This document explains how the **Food Remedy** database is structured, processed, and seeded.  
It also describes the key scripts used to manage and clean product data for our **Food Remedy App**.

📄 Future students should save and update any new database documentation in:  
`Documents/Database/[Year-Trimester]`  


> For Firebase and Firestore access details, refer to the following document:  
> [Firebase Access](../Documents/Guides/Leadership/firebase-access.md)

<br/>


### 📚 Table of Contents
- [📁 Folder Overview](#-folder-overview)
- [🥄 Data Scraping](#-data-scraping)
- [🧹 Data Cleaning](#-data-cleaning)
- [🔎 Data Investigation](#-data-investigation)
- [🌱 Database Seeding](#-database-seeding)
- [⚙️ Pipeline Summary](#️-pipeline-summary)


<br />


## 📁 Folder Overview

The `database/` directory manages all product data used by the Food Remedy App.  
It contains scripts and data pipelines that prepare clean, structured product data for ingestion into **Firestore**.  

Each subfolder has a distinct role in the **data lifecycle** — from raw collection to production-ready ingestion.  


<br />


## 🥄 Data Scraping

**File:** `database\scraping\OpenFoodFacts-DataScrape.py`

This script streams and filters products from the **Open Food Facts** global dataset.  
It extracts only the relevant **Australian** products to build our local dataset.

### Main Functionality
- Streams `.jsonl.gz` data directly from Open Food Facts (no full download needed - saves RAM).  
- Filters products where `"countries_tags"` includes `"australia"`.  
- Keeps only essential fields to reduce file size and focus on nutrition data.  
- Saves results as `openfoodfacts-australia.jsonl`.

> Do not try to commit a full jsonl of the database as it cannot be housed on GitHub.  
> Instead, the file is broken down into 10k-product chunks so that it can also be uploaded to Firestore in smaller batches, since the maximum write usage is 20k per day.


<br />


## 🧹 Data Cleaning

**File:** `database\clean data\cleanProductData.py`

This script prepares the scraped data for database ingestion.  
It standardises, deduplicates, renames, and structures product information.

### Cleaning Steps
1. **Load & Deduplicate**  
   Reads the JSONL file and removes duplicate product entries by barcode.

2. **Text & Field Normalisation**  
   Cleans product names, brands, and ensures valid barcodes.

3. **Numeric Standardisation**  
   Converts numeric fields (e.g. product quantity, serving size) to consistent units (grams).

4. **Nutrient Filtering**  
   Keeps only essential nutrient fields such as:
   - Energy  
   - Fats  
   - Carbohydrates  
   - Proteins  
   - Salt / Sodium  

5. **Tag Cleaning**  
   Removes language prefixes like `"en:"` from tag lists (e.g. allergens, labels).

6. **Image Handling**  
   Generates image URLs using product barcodes for easy front-end use.

7. **Schema Refinement**  
   - Drops unwanted columns (`id`, `serving_size`, etc.)  
   - Renames key fields (`code` → `barcode`, `brands` → `brand`)  
   - Converts column names to `camelCase`.

8. **Save Cleaned Data**  
   Exports the cleaned dataset as a readable JSON file ready for Firestore.


<br />


## 🔎 Data Investigation

**Folder:** `database/data_investigation/`

This area is for exploratory data analysis (EDA) and validation.  
Here, the team can:
- Test different cleaning techniques.  
- Explore data distributions and outliers.  
- Compare cleaned versus raw data.  
- Validate field consistency before seeding.

> 💡 Use this folder for internal testing and reporting, not production scripts.


<br />



## 🌱 Database Seeding

**File:** `database/seeding/seed_firestore.py`

This script uploads cleaned product data into **Firebase Firestore** for app usage.  
It uses **batch operations** with retry logic to handle large uploads efficiently.

### 🔥 Main Process
1. **Initialise Firebase**  
   Connects using a `serviceAccountKey.json` credential file.

2. **Load Cleaned Data**  
   Loads the cleaned JSON file (for example, `products_XXk_XXk.json`) from the dataset.  
   The `XX` in the filename shows the batch range.  
   For example, the second batch from 10,000 to 20,000 products is saved as `products_10k_20k.json`.


3. **Batch Uploading**  
   - Writes in chunks of 500 (Firestore’s limit).  
   - Adds `dateAdded` and `lastUpdated` timestamps for each document.  
   - Uses exponential backoff to handle transient upload errors.

4. **Store in Firestore Collection**  
   Products are saved in the `PRODUCTS` collection using their barcode as the document ID.


<br />


## ⚙️ Pipeline Summary

Below is the full end-to-end data pipeline for Food Remedy:

Scraping → Cleaning → Investigation → Seeding


1. **Scrape:** Collect Australian food product data.  
2. **Clean:** Process and standardise it for consistent schema.  
3. **Investigate:** Validate quality and accuracy.  
4. **Seed:** Upload to Firestore for app integration.