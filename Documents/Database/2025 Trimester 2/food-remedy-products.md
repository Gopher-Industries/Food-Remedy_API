# Food Remedy – Product Data Specification

This document defines the structure and content of product JSON objects used internally by the Food Remedy.  
Each object represents a packaged food or beverage product sold in Australia and is stored as a JSON line in our dataset.


<br/>


## 📚 Table of Contents
- [📄 Data Source](#-data-source)
- [🧩 JSON Object Structure](#-json-object-structure)
  - [1. Identifiers and Basic Details](#1-identifiers-and-basic-details)
  - [2. Classification and Labelling](#2-classification-and-labelling)
  - [3. Ingredients and Allergen Information](#3-ingredients-and-allergen-information)
  - [4. Quantity and Serving Details](#4-quantity-and-serving-details)
  - [5. Nutritional Information](#5-nutritional-information)
- [📦 Example JSON Object](#-example-json-object)


<br/>



## 🌍 Data Source

The following outlines the source of this dataset.  
This data was extracted from [Open Food Facts](https://world.openfoodfacts.org/data) using a Python script, filtered specifically for Food Remedy. Only fields relevant to our application were retained.  

The dataset is stored as a `.jsonl` file, where:
- **Format:** JSON Lines (`.jsonl`) – each line is a standalone JSON object.
- **Each Line Represents:** A single product (food or drink) with descriptive, classification, nutrition, and allergen data.
- **Source:** Now curated and maintained internally by Food Remedy, based on a filtered subset of Open Food Facts data.

This specification ensures developers, analysts, and systems using the dataset understand the structure, field definitions, and expected data types.


<br/>


## 🧩 JSON Object Structure

Each product JSON object may contain the following top-level fields.  
Empty or missing values are represented as:

- `null` – no value or not applicable
- `""` – empty string for text fields
- `[]` – empty list
- `{}` – empty dictionary


<br/>


### 1. Identifiers and Basic Details

| Field         | Type    | Required | Description                                                  | Example                          |
|---------------|---------|----------|--------------------------------------------------------------|----------------------------------|
| `id`          | String  | Yes      | Internal unique product ID. May match the barcode.           | `"0873006000370"`               |
| `code`        | String  | Yes      | Primary identifier (usually the barcode). Use as unique key. | `"9300633952631"`               |
| `product_name`| String  | Yes      | Full product name as sold.                                   | `"Vanilla cake mix"`            |
| `generic_name`| String  | No       | Simplified product description or common name.               | `"Chocolate Ice Cream"`         |
| `brands`      | String  | No       | Brand name(s).                                               | `"Maggie Beer"`                  |



### 2. Classification and Labelling

| Field             | Type              | Required | Description                                                 | Example                                 |
|-------------------|-------------------|----------|-------------------------------------------------------------|-----------------------------------------|
| `categories_tags` | Array of strings  | Yes      | Product categories (normalised English tags).               | `["en:desserts", "en:ice-creams"]`      |
| `labels_tags`     | Array of strings  | No       | Claims or certifications (e.g., organic, Australian-made).  | `["en:australian-made"]`                |
| `additives_tags`  | Array of strings  | No       | Food additive codes (e.g., E-numbers).                      | `["en:e330"]`                           |



### 3. Ingredients and Allergen Information

| Field                        | Type                | Required | Description                                                                 | Example                                             |
|------------------------------|---------------------|----------|-----------------------------------------------------------------------------|-----------------------------------------------------|
| `ingredients_text`           | String              | No       | Raw ingredients list as printed on packaging.                              | `"Milk, sugar, cocoa butter, emulsifier (soy lecithin)"` |
| `ingredients_tags`           | Array of strings or null | No | Normalised ingredient keywords. May be `null`.                              | `["en:milk", "en:sugar"]`                           |
| `ingredients_analysis_tags`  | Array of strings or null | No | Derived tags (e.g., vegetarian, vegan, palm-oil-free).                      | `["en:vegetarian"]`                                 |
| `ingredients_from_palm_oil_n`| Number or null      | No       | Count of ingredients derived from palm oil.                                 | `0`                                                 |
| `allergens`                  | String              | No       | Allergen declaration as printed (raw text).                                 | `"Contains milk, soy"`                              |
| `allergens_tags`             | Array of strings    | No       | Standardised allergen tags.                                                 | `["en:milk", "en:soy"]`                             |
| `traces`                     | String              | No       | “May contain” or cross-contamination statements (raw text).                 | `"May contain nuts"`                                |
| `traces_from_ingredients`    | String              | No       | Traces inferred from ingredient analysis.                                   | `""` (empty if none)                                |



### 4. Quantity and Serving Details

| Field                    | Type           | Required | Description                                                      | Example         |
|--------------------------|----------------|----------|------------------------------------------------------------------|-----------------|
| `quantity`               | String         | No       | Quantity as printed on packaging (includes unit).                | `"340 g"`       |
| `product_quantity`       | Number or null | No       | Numeric quantity value.                                          | `340`           |
| `product_quantity_unit`  | String or null | No       | Unit for `product_quantity` (e.g., `"g"`, `"ml"`).               | `"g"`           |
| `serving_size`           | String or null | No       | Serving size as listed on packaging.                             | `"30g"`         |
| `serving_quantity`       | Number or null | No       | Numeric serving amount.                                          | `30`            |
| `serving_quantity_unit`  | String or null | No       | Unit for serving amount.                                         | `"g"`           |



### 5. Nutritional Information

#### a) `nutriments` (Detailed Per-100g Values)

A dictionary containing detailed nutrient values. Common keys:

- `energy_100g`, `energy-kcal_100g` – energy (kJ and kcal)  
- `fat_100g`, `saturated-fat_100g`  
- `carbohydrates_100g`, `sugars_100g`  
- `fiber_100g`, `proteins_100g`  
- `salt_100g`, `sodium_100g`  

May include additional keys like `nutrition-score-fr_100g`.  
Values are usually numeric but may be strings; normalisation is recommended.

#### b) `nutrient_levels` (Simplified Ratings)

A dictionary of relative ratings for:

- `fat`, `saturated-fat`, `sugars`, `salt`  
- Values: `"low"`, `"moderate"`, `"high"`  
- Empty `{}` if data unavailable.

#### c) `nutriscore_grade`

- Single-letter Nutri-Score rating: `"a"` (healthiest) to `"e"` (least healthy)  
- `"unknown"` if unavailable.

---

## 📦 Example JSON Object

```json
{
  "id": "8801073141896",
  "code": "8801073141896",
  "brands": "Samyang",
  "product_name": "2× Spicy Hot Chicken Flavor Ramen",
  "generic_name": "",
  "additives_tags": [
    "en:e101",
    "en:e101i",
    "en:e322",
    "en:e322i",
    "en:e330",
    "en:e339",
    "en:e412",
    "en:e452",
    "en:e452i",
    "en:e500",
    "en:e500i",
    "en:e501",
    "en:e501i"
  ],
  "allergens": "en:gluten,en:soybeans",
  "allergens_tags": [
    "en:gluten",
    "en:soybeans"
  ],
  "categories_tags": [
    "en:plant-based-foods-and-beverages",
    "en:plant-based-foods",
    "en:cereals-and-potatoes",
    "en:cereals-and-their-products",
    "en:dried-products",
    "en:pastas",
    "en:dried-products-to-be-rehydrated",
    "en:noodles",
    "en:instant-noodles"
  ],
  "ingredients_tags": [
    "en:noodle",
    "en:dough",
    "en:tapioca",
    "en:starch",
    "en:palm-oil",
    "en:oil-and-fat",
    "en:vegetable-oil-and-fat",
    "en:palm-oil-and-fat",
    "en:wheat-gluten",
    "en:gluten",
    "en:salt",
    "en:soya-oil",
    "en:vegetable-oil",
    "en:water",
    "en:acidity-regulator",
    "en:thickener",
    "en:emulsifier",
    "en:colour",
    "en:soup",
    "en:artificial-chicken-flavor-powder",
    "en:white-sugar",
    "en:added-sugar",
    "en:disaccharide",
    "en:sugar",
    "en:soy-sauce",
    "en:sauce",
    "en:red-bell-pepper",
    "en:vegetable",
    "en:fruit-vegetable",
    "en:capsicum-annuum",
    "en:bell-pepper",
    "en:onion",
    "en:root-vegetable",
    "en:onion-family-vegetable",
    "en:chili-pepper",
    "en:garlic",
    "en:yeast-extract-powder",
    "en:yeast",
    "en:yeast-extract",
    "en:black-pepper",
    "en:seed",
    "en:pepper",
    "en:curry",
    "en:condiment",
    "en:spice",
    "en:flake",
    "en:laver",
    "en:algae",
    "en:seaweed",
    "en:wheat-flour",
    "en:cereal",
    "en:flour",
    "en:wheat",
    "en:cereal-flour",
    "en:e501i",
    "en:e501",
    "en:e500i",
    "en:e500",
    "en:sodium-phosphate-dibasic",
    "en:e452i",
    "en:e452",
    "en:e330",
    "en:e322i",
    "en:e322",
    "en:e101",
    "en:roast-sesame",
    "en:e339"
  ],
  "ingredients_text": "noodle(76,7%): wheat flour(52%), tapioca starch(12%), palm oil(11%), wheat gluten, salt, soybean oil, water, acidity regulator[potassium carbonate(e501), sodium carbonate(e500), sodium phosphate dibasic(e339), sodium polyphosphate(e452), citric acid(e330)], thickener [guar gum(e412)], emulsifier[lecithin(e322)], colour[riboflavin(e101)], soup(22,7%): water, artificial chicken flavor powder, white sugar, soy sauce,   red pepper powder, soybean oil , onion powder, chilli extract, salt, garlic powder, tapioca starch, yeast extract powder, black pepper powder, curry powder, flake(0,6%): roast sesame, roasted laver",
  "ingredients_from_palm_oil_n": 0,
  "ingredients_analysis_tags": [
    "en:palm-oil",
    "en:vegan-status-unknown",
    "en:vegetarian-status-unknown"
  ],
  "labels_tags": [
    "en:halal",
    "en:haccp"
  ],
  "nutrient_levels": {},
  "nutriments": {
    "calcium_value": 50,
    "carbon-footprint-from-known-ingredients_product": 4120,
    "sodium_value": 1360,
    "sugars_unit": "g",
    "proteins_serving": 13,
    "trans-fat_100g": 0,
    "cholesterol_serving": 0,
    "sodium": 1.36,
    "potassium_value": 230,
    "carbon-footprint-from-known-ingredients_100g": 588.51,
    "sugars_value": 7,
    "sodium_unit": "mg",
    "fruits-vegetables-legumes-estimate-from-ingredients_serving": 0,
    "carbohydrates_value": 60.71,
    "fiber_unit": "g",
    "nova-group_serving": 4,
    "cholesterol_100g": 0,
    "sugars": 7,
    "potassium": 0.23,
    "potassium_unit": "mg",
    "energy-kcal_value": 550,
    "calcium": 0.05,
    "fiber": 4,
    "fiber_value": 4,
    "sodium_100g": 0.971,
    "fruits-vegetables-legumes-estimate-from-ingredients_100g": 0,
    "fat_unit": "g",
    "energy-kcal": 550,
    "salt_unit": "mg",
    "nova-group": 4,
    "sugars_100g": 5,
    "salt_serving": 3.4,
    "trans-fat_value": 0,
    "trans-fat": 0,
    "potassium_100g": 0.164,
    "salt_value": 3400,
    "saturated-fat": 8,
    "proteins_100g": 9.29,
    "carbohydrates_100g": 43.4,
    "energy_serving": 2301,
    "saturated-fat_unit": "g",
    "salt_100g": 2.43,
    "fruits-vegetables-nuts-estimate-from-ingredients_100g": 0,
    "trans-fat_unit": "mg",
    "fat_serving": 17,
    "cholesterol_unit": "mg",
    "carbohydrates_serving": 60.71,
    "fruits-vegetables-nuts-estimate-from-ingredients_serving": 0,
    "salt": 3.4,
    "trans-fat_serving": 0,
    "cholesterol_value": 0,
    "iron_value": 0.8,
    "energy_100g": 1640,
    "iron_serving": 0.0008,
    "cholesterol": 0,
    "fiber_serving": 4,
    "saturated-fat_value": 8,
    "energy-kcal_serving": 550,
    "energy_unit": "kcal",
    "iron": 0.0008,
    "energy": 2301,
    "energy-kcal_100g": 393,
    "fat": 17,
    "iron_100g": 0.000571,
    "fat_100g": 12.1,
    "energy_value": 550,
    "sugars_serving": 7,
    "nova-group_100g": 4,
    "proteins_value": 13,
    "potassium_serving": 0.23,
    "proteins": 13,
    "energy-kcal_value_computed": 455.84000000000003,
    "carbohydrates": 60.71,
    "energy-kcal_unit": "kcal",
    "fiber_100g": 2.86,
    "sodium_serving": 1.36,
    "carbohydrates_unit": "g",
    "calcium_serving": 0.05,
    "saturated-fat_100g": 5.71,
    "iron_unit": "mg",
    "fat_value": 17,
    "saturated-fat_serving": 8,
    "calcium_unit": "mg",
    "proteins_unit": "g",
    "calcium_100g": 0.0357,
    "carbon-footprint-from-known-ingredients_serving": 824
  },
  "nutriscore_grade": "unknown",
  "product_quantity": 700.0,
  "product_quantity_unit": "g",
  "quantity": "5 x 140g",
  "serving_quantity": 140.0,
  "serving_quantity_unit": "g",
  "serving_size": "140g",
  "traces": "en:eggs,en:fish,en:milk",
  "traces_from_ingredients": ""
}
```
