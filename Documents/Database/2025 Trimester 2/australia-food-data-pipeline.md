# Australia Food Data Pipeline

*OpenFoodFacts Australia Data Preparation.*  
This document explains how the OpenFoodFacts Australia dataset was sourced, filtered, and cleaned for use in the Food Remedy project.    
It covers scraping the raw JSONL dump, handling incomplete entries, and generating `cleanSample.jsonl` as a reliable input file.

> For specific information about the data itself, see:  
> [Product Data](./food-remedy-products.md)  


<br/>


## 📑 Table of Contents
1. 🌏 [Data Source](#-data-source)  
2. 🛠️ [Extracting Australian Products](#-extracting-australian-products)  
3. 🧹 [Cleaning the Dataset](#-cleaning-the-dataset)  
4. 🚀 [Summary](#-summary)  


<br/>


## 🌏 Data Source

**Official data site:** [OpenFoodFacts Data Portal](https://world.openfoodfacts.org/data)  

We sourced the dataset from the [OpenFoodFacts JSONL dump](https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz), which contains **millions of global product entries**.  

The file is:
- **Format:** JSON Lines (`.jsonl`) — each line is a standalone JSON object.  
- **Each line:** Represents a single product (food or drink), including descriptive, classification, nutritional, and allergen data.  
- **Compression:** Distributed as a `.gz` archive (gzip).  
- **Source:** Curated by **OpenFoodFacts**, then filtered and maintained internally by **Food Remedy** for our use case.  

### 🔍 Initial Exploration

Before building the extraction pipeline, we explored the raw dataset using [DuckDB](https://duckdb.org/) guided by the [OpenFoodFacts blog on large-scale data exploration](https://blog.openfoodfacts.org/en/news/food-transparency-in-the-palm-of-your-hand-explore-the-largest-open-food-database-using-duckdb-%F0%9F%A6%86x%F0%9F%8D%8A).

From this inspection:
- A **CSV sample** was exported containing hundreds of raw columns.  
- This was reduced to a **smaller, focused subset** of fields relevant to Food Remedy’s application.  
- These chosen fields were later used in the automated streaming filter.

<br/>


## 🛠️ Extracting Australian Products

To avoid loading the entire dataset into memory, data was streamed and filtered on the fly.  

The extraction is handled by:
  - [`OpenFoodFacts-DataScrape.py`](../../data/scraping/OpenFoodFacts-DataScrape.py) 

Which does the following:
- Streams the global JSONL dump **line by line** (no memory overload).
- Filters only products with `countries_tags` containing **Australia**.
- Keeps only the fields in the predefined `FIELDS` list.
- Saves results into `openfoodfacts-australia.jsonl`.  
  
> This creates a focused dataset of products available in Australia.


<br/>


## 🧹 Cleaning the Dataset

Raw data from OpenFoodFacts is powerful but messy — duplicates, inconsistent fields, missing values, and unstructured text make it unsuitable for direct use.  
To solve this, we built a **cleaning pipeline** that standardises and reshapes the dataset into a compact, reliable format.

The cleaning is handled by:  
- [`cleanproductData.py`](../../data/demo%20data/cleanproductData.py)  

This script ingests the **raw export** (`rawSample.jsonl`) and produces a **cleaned dataset** (`cleanSample.jsonl`) ready for downstream tasks such as analytics, machine learning, or database ingestion.


The script does the following:
1. Deduplication
   - Removes duplicate products by `code` (barcode).
   - Keeps only the first instance.

2. Field Validation
   - Ensures `code` exists and is non-empty.
   - Strips whitespace and drops invalid rows.

3. Text Normalisation
   - Cleans `product_name` and fills missing with `NA`.
   - Standardises `brand` names (title case).

4. Quantity and Serving Data
   - Converts `product_quantity` and `serving_quantity` to numbers.
   - Defaults units to `g` if missing.
   - Ensures consistent lowercase units.

5. Nutritional Data
   - Validates `nutriments` as dictionaries.
   - Filters to essential macros and nutrients (`NUTRIENTS_TO_KEEP`).

6. Tag and Trace Fields
   - Strips language prefixes like `en:` or `fr:`.
   - Standardises tags (`additives`, `allergens`, `categories`, etc).
   - Cleans `traces` into readable strings.

7. Images
   - Builds structured image specs with root path, variants, and primary image.
   - Adds convenience URL for 400px product images.

8. Column Renaming and Dropping
   - Drops irrelevant fields (`id`, `serving_size`, etc).
   - Renames for clarity (`code` → `barcode`, `brands` → `brand`).
   - Converts all columns to **camelCase**.

9. JSON Conversion
   - Converts JSON-encoded strings back into proper objects.
   - Saves the final dataset to `cleanSample.jsonl`.


<br/>


## 🚀 Summary

**Pipeline in a nutshell:**
1. Scrape --> `openfoodfacts-australia.jsonl`  
2. Clean  --> `cleanSample.jsonl`  
3. Use    --> structured dataset ready for database ingestion  

> This ensures only valid, structured, and Australian-relevant product data is kept.

