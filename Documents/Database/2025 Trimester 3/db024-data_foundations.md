# Purpose & Scope
The Data Foundations layer (DB001-DB007) will ensure the conversion of raw product data into a clean, consistent and reliable set of data utilized in all downstream enrichment, scoring and tagging modules.

# The document is used as the authoritative source of:
Clean schema guarantees
Logic in data cleaning and normalisation.
Missing and unknown value treatment.
Control of quality assurance(QA)
Traceability between raw - clean records.
In the absence of clearly defined Data Foundations layer, downstream enrichment is unstable, non-transparent, and unsafe, especially health-related and nutrition-related, and allergen features.

# Architecture Overview (Raw → Clean)
Primary pipeline location: database/pipeline

Cleaning-related source modules:
database/clean_data/cleanProductData.py
database/clean_data/normalization/CategoryHarmonisation.py
database/clean_data/normalization/NutrientUnitNormalisation.py
database/clean_data/constants.py

Supporting utilities:
schema_definition.json
schema_validator.py
DB006_QA_cleaning.py
DB007-missing-values.md

# Pipeline Overview (DB001 → DB007)
The Data Foundations pipeline contains the following steps of processing raw product data:

Raw Product Data (OpenFoodFacts)
   ↓
DB001 – Clean Schema Definition & Validation
   ↓
DB002 – Ingredient Cleaning & Repair
   ↓
DB003 – Category Harmonisation
   ↓
DB004 – Nutrient Unit Normalisation
   ↓
DB007 – Missing & Unknown Value Handling
   ↓
DB006 – QA Validation (0–2k dataset)
   ↓
Clean, Validated Dataset

All stages enhance data consistency in a progressive manner with the ability to trace against the raw record.

# DB001 – Clean Schema Definition & Validation
Objective: Determine a canonical clean schema and impose a set of validation rules in order to be sure of consistent conversion of raw - clean data.
# Schema Diagram
RAW INPUT (DB001)
┌───────────────────────────────┐
│ raw_product_record (JSON)     │
│ • source_payload              │
│ • ingestion_metadata          │
└───────────────┬───────────────┘
                │
                ▼
STANDARDISATION & PARSING (DB002–DB003)
┌───────────────────────────────┐
│ ParsedProduct                 │
│ • product_id                  │
│ • name                        │
│ • brand                       │
│ • categories_raw              │
│ • ingredients_raw             │
│ • nutrients_raw               │
│ • allergens_raw               │
└───────────────┬───────────────┘
                │
                ▼
CLEANING & NORMALISATION (DB004–DB006)
┌───────────────────────────────┐
│ CleanProduct                  │
├───────────────────────────────┤
│ product_id : string (PK)      │
│ product_name : string         │
│ brand : string?               │
│ palm_oil : boolean?           │
│ categories : string[]         │
│ ingredients : string[]        │
│ traces : string[]?            │
│ raw_record : json?            │
├───────────────────────────────┤
│ nutrients : Nutrients         │◄──────────────┐
│ allergens : Allergens         │◄───────────┐  │
└───────────────────────────────┘            │  │
                                             │  │
        ┌────────────────────────┐           │  │
        │ Nutrients (Embedded)   │           │  │
        ├────────────────────────┤           │  │
        │ energy_kcal : float?   │           │  │
        │ energy_kj : float?     │           │  │
        │ fat_g : float?         │           │  │
        │ protein_g : float?     │           │  │
        │ carbs_g : float?       │           │  │
        │ salt_g : float?        │           │  │
        └────────────────────────┘           │  │
                                              │  │
        ┌────────────────────────┐            │
        │ Allergens (AU/NZ 14)   │            │
        ├────────────────────────┤            │
        │ gluten : boolean       │            │
        │ milk : boolean         │            │
        │ eggs : boolean         │            │
        │ peanuts : boolean      │            │
        │ tree_nuts : boolean    │            │
        │ soy : boolean          │            │
        │ sesame : boolean       │            │
        │ fish : boolean         │            │
        │ shellfish : boolean    │            │
        │ lupin : boolean        │            │
        │ celery : boolean       │            │
        │ mustard : boolean      │            │
        │ sulphites : boolean    │            │
        │ molluscs : boolean     │            │
        └────────────────────────┘            │
                                              │
                ▼                             ▼
QUALITY ASSURANCE & OUTPUT (DB007)
┌───────────────────────────────┐
│ Validated Clean Dataset       │
│ • schema validated            │
│ • units normalised            │
│ • null policy enforced        │
│ • audit-ready                 │
└───────────────────────────────┘

# Schema Table
| Field        | Data Type    | Required | Description                        |
| ------------ | ------------ | -------- | ---------------------------------- |
| product_id   | String       | Yes      | Unique product identifier          |
| product_name | String       | Yes      | Normalised lowercase name          |
| brand        | String       | No       | Cleaned brand name                 |
| categories   | List[String] | Yes      | Harmonised categories              |
| ingredients  | List[String] | Yes      | Cleaned ingredient tokens          |
| nutrients    | Object       | Yes      | Nutrition in SI units              |
| allergens    | Object       | Yes      | Boolean allergen flags             |
| traces       | List[String] | No       | Normalised trace allergens         |
| palm_oil     | Boolean      | No       | Canonical palm oil indicator       |
| raw_record   | JSON         | No       | Original raw data for traceability |

# Naming conventions
snake_case field names
Lowercase string values
Explicit unit suffixes (e.g. energy_kcal, fat_g)

# Validation Rules
Required fields must exist
Datatypes must match schema
List and object validation Structural validation Structural validation is validation on objects and lists.
Invalid records are not simply discarded, they are logged or flagged.

# DB002 – Ingredient Cleaning & Inconsistent Record Repair

Objective: Normalise ingredient related fields and fix damaged or inconsistent entries of raw ingredients.

# Cleaning Logic
Noise Removal: Stripe punctuations, emoticons, snippets of HTML. Placer values strip (n/a, unknown, empty strings)

String Normalisation: Lowercase conversion, Whitespace normalisation, Separating the tokens with the use of commas and semicolons.

Malformed Entry Repair: Combine disjointed ingredient strings. Fix mixed-format delimiters

Multi-language Handling: Preserve original tokens, Avoid deconstructive translation.

Corrupt Data Handling: An empty ingredient list or one that can not be recovered is normalised to []. Logged for QA review

Ingredient cleaning logic is a reusable module which is used by downstream tasks.

# DB003 – Category Harmonisation & Naming Consistency
Objective: Map raw category labels to one and managed category dictionary.

# Harmonisation Flow
Raw Categories
   │
   ├─ "snacks & sweets"
   ├─ "au:snacks"
   ├─ "sweet-snacks"
   │
   ▼
Normalisation Rules
   - lowercase
   - remove prefixes (au:, en:)
   - strip symbols
   - deduplicate
   │
   ▼
Unified Categories
   - snacks
   - drinks
   - dairy
   - frozen_foods

# Rules
Case-insensitive matching
Eradication of regional prefixes.
Removal of duplication of items.
Last category groups approved with Product and Research teams.

# DB004 – Nutrient Unit Normalisation
Objective: Convert all nutrition data to standard SI units to allow reliable downstream enrichment.

Standard Units
Mass: grams (g), milligrams (mg)
Energy: kilojoules (kJ), kilocalories (kCal)

# Normalisation Flow
Raw Nutrition Fields
   │
   ├─ "energy": "200 cal"
   ├─ "fat": "3,5 g"
   ├─ "protein": 2
   │
   ▼
Parsing & Unit Detection
   ▼
Unit Conversion Engine
   ▼
Standardised Nutrients Object
   ├─ energy_kcal: 200
   ├─ fat_g: 3.5
   ├─ protein_g: 2

# Validation
Negative and impossible values are rebuffed.
Nutrition values that are missing are passed to none.
Conversions follow documented nutrition unit standards used within the project.

# DB005 – Logging System
Objective: Get an insight into pipeline execution and failures.

# Logging Standards
Timestamped logs
Levels of severity: INFO, WARNING, ERROR.
Stage-level context (DB001-DB007)
Each pipeline stage may emit logs depending on execution path.

# DB006 – Quality Assurance (QA)
Objective: Test the accuracy of the cleaning pipeline with a 0-2k data set of products.

# QA Checks
Completeness of required fields.
Schema conformance
Ingredient integrity
Category consistency
Nutrient unit correctness

# Outputs
Error summaries
Validation reports
Known limitations documentation.

# Known limitations
Categories ambiguity that are vendor-specific.
Different rare malformed nutrition records that have to be reviewed manually.

# DB007 – Missing & Unknown Value Handling
Objective: All missing, null, malformed or unknown values must then be in a predictable canonical format.

# Canonical Missing Policy
| Raw Value        | Canonical Value |
| ---------------- | --------------- |
| "" / "   "       | None            |
| "unknown", "n/a" | None            |
| []               | []              |
| {}               | {}              |
| Missing numeric  | None            |

# Normalisation Pipeline
Raw Value
   │
   ▼
sanitize_unknown_markers()
   ▼
normalize_string / normalize_list
   ▼
Canonical Clean Value

# Utility Functions
normalize_string(value)
normalize_list(value)
clean_numeric_field(value)
sanitize_unknown_markers(value)
All downstream enrichment modules reuse these utilities.

# Schema Enforcement:
Fields that are required should be present after cleaning.
Datatypes have to correspond to DB001 schema.
Non-fatal gaps are logged

# Raw vs Clean Example
Raw Record:
{
  "product_name": "Choco Cookies ",
  "categories": ["snacks & sweets"],
  "ingredients": "Flour, sugar, cocoa, N/A",
  "energy": "200 cal"
}

Clean Record:
{
  "product_name": "choco cookies",
  "categories": ["snacks"],
  "ingredients": ["flour", "sugar", "cocoa"],
  "nutrients": {
    "energy_kcal": 200
  }
}

The reliability ceiling of the whole system is determined by the Data Foundations layer.
This will ensure:
Detection of allergens is harmless and foreseeable.
The enrichment of nutrition is mathematically consistent.
There is no silent failure of downstream logic.
The pipeline is available to audit and trust.
This report is the common agreement that renders all the downstream modules trustworthy.
