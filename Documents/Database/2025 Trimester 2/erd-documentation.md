# Food Remedy – Entity Relationship Diagram (ERD) Documentation

This document explains the purpose of the Food Remedy database design, describes the entities shown in the ERD, and clarifies how they relate to each other to support product lookup, dietary analysis, and personalisation.

**Visual reference:** `/database/Images/Update-ERD.png`

> Note: This write‑up follows the descriptive style used in `/Documents/Database/australia-food-data-pipeline.md`. It intentionally avoids schema DDL or table-by-table definitions and instead focuses on the “what” and “why.”

<br/>

📑 **Table of Contents**

* 🏗️ ERD Overview
* 👤 Users & Profiles
* 🥫 Products & Composition
* 🍽️ Nutrition & Serving Context
* 🏷️ Tags & Taxonomy (allergens, additives, categories, labels, ingredients)
* 📏 Dietary References & Rules
* 🔗 Relationships (how entities connect)
* 🚀 Summary

<br/>

## 🏗️ ERD Overview

The ERD captures how the Food Remedy platform stores **who** is using the app (users & profiles), **what** they scan or search (products), **what’s inside** those products (ingredients, additives, allergens, nutrients), and **how** the system interprets that information against dietary rules to return helpful guidance.

Design goals:

* **Reliability:** keep product and nutrient data structured, validated, and ready for analysis.
* **Personalisation:** allow profiles to declare preferences/allergies and compare intake to references.
* **Scalability:** support tens of thousands of products and frequent reads from mobile scanning.
* **Traceability:** preserve source/lineage so results are explainable.

<br/>

## 👤 Users & Profiles

**Users** represent account holders authenticated in the app.

**Profiles** extend a user with optional personal context used for guidance (e.g., age range, dietary goals, known allergies, preference tags). A single user can maintain multiple profiles (e.g., parent + child), enabling household use cases and side‑by‑side comparisons.

**Why it matters:** profiles localise recommendations and filtering. The same product can be “OK” for one profile and “flagged” for another depending on allergens or goals.

<br/>

## 🥫 Products & Composition

**Products** are the core items displayed in search and after barcode scans. Each product is uniquely identified (e.g., by barcode) and includes canonical descriptors (brand, name, quantity) and presentation metadata (images).

**Ingredients & Composition** represent the product’s makeup as plain text (for provenance) and as cleaned tags (for analysis). From the pipeline, free‑text ingredients are normalised into machine‑readable tags: e.g., `hazelnut`, `milk-powder`, `palm-oil`.

**Why it matters:** the composition layer powers fast filtering (e.g., “no peanuts”), enables rule checks (e.g., “contains palm oil”), and avoids re‑parsing raw text on each request.

<br/>

## 🍽️ Nutrition & Serving Context

**Nutriments** store per‑100g and per‑serving values for energy and macros (carbs, protein, fat) and, where available, micronutrients. Serving information (declared serving size and units) provides a consistent basis for on‑device calculations and comparison.

**Why it matters:** consistent units and validated structures enable reliable per‑serving views, Nutri‑score style summaries, and later features like daily intake calculations.

<br/>

## 🏷️ Tags & Taxonomy (allergens, additives, categories, labels, ingredients)

Allergens, additives, categories, labels, and ingredients are normalised reference lists linked to products via many-to-many relationships. The taxonomy ensures consistent tagging across products and unifies varied spellings or naming conventions (e.g., soya vs soy).

Examples:

* *Allergens:* gluten, milk, peanuts, soybeans.
* *Additives:* E‑codes (e.g., E322 lecithins).
* *Categories:* bread, noodles, chocolate spreads.
* *Labels:* organic, fair-trade, gluten-free.
* *Ingredients:* hazelnut, milk powder, palm oil.
  
**Why it matters:** normalisation makes search/filtering fast and predictable, and supports profile‑based warnings.

<br/>

## 📏 Dietary References & Rules

**Dietary reference data** contains configurable guidance (e.g., recommended intakes, threshold levels, traffic‑light bands). The API can compare a product’s nutriments or tags against these references to produce simple outcomes (e.g., badges, warnings, highlights) tailored to a profile.

**Why it matters:** separates policy/thresholds from products so guidance can evolve without reshaping core data.

<br/>

## 🔗 Relationships (how entities connect)

* **User → Profiles:** one‑to‑many. A user may create multiple profiles; each profile inherits the user’s account context but stores its own preferences.
* **User ↔ Favourites ↔ Product:** Many-to-many (users can favorite many products, products can be favorited by many users).
* **Profile ↔ Allergies/Preferences:** many‑to‑many via link entities. Profiles can record multiple allergies; each allergy can apply to many profiles.
* **Product ↔ (Allergen/Additive/Category/Ingrededient/IngredientAnalysis):** many‑to‑many. Products can hold multiple tags across sets; tags can apply to many products.
* **Product → Nutriments,Serving,Images/Media:** stored inline.

**Integrity:** Foreign keys enforce valid links; tag junctions prevent duplicates; indexes on barcode and tag links keep scans responsive.

<br/>

## 🚀 Summary

* The ERD organises **who** (users, profiles), **what** (products), **what’s inside** (ingredients, tags, nutrients), and **how to interpret** (references/rules) into a coherent, scalable structure.
* Normalised tags and structured nutriments enable fast filtering, safe warnings, and consistent calculations.