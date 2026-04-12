# Firestore Structure for Food Remedy

## Overview
This document defines the Firestore collections and document structure to fully support backend/frontend sync and align with the SQLite schema.

---

## Collections & Documents

### 1. Products
- **Collection:** `/products/{barcode}`
- **Fields:**
  - barcode, productName, brand, genericName, additives, allergens, ingredients, ingredientsText, category, categories, labels, nutrientLevels, nutriments, nutriments_normalized, nutriscoreGrade, productQuantity, productQuantityUnit, servingQuantity, servingQuantityUnit, traces, completeness, images
- **Example:**
```json
{
  "barcode": "9300695008826",
  "productName": "Example Product",
  "brand": "BrandName",
  "genericName": "Generic",
  "additives": ["E100", "E200"],
  "allergens": ["milk", "soy"],
  "ingredients": ["water", "sugar"],
  "ingredientsText": "Water, Sugar",
  "category": "Beverages",
  "categories": ["Beverages", "Soft Drinks"],
  "labels": ["vegan"],
  "nutrientLevels": { "fat": "low", "salt": "moderate" },
  "nutriments": { "energy_kj": 200, "fat_g": 0.1 },
  "nutriments_normalized": { "energy_kj": 200, "fat_g": 0.1 },
  "nutriscoreGrade": "A",
  "productQuantity": 500,
  "productQuantityUnit": "ml",
  "servingQuantity": 250,
  "servingQuantityUnit": "ml",
  "traces": null,
  "completeness": 0.95,
  "images": {
    "root": "https://images.openfoodfacts.org/images/products/930/069/500/8826",
    "primary": "front_en",
    "variants": { "front_en": 3 }
  }
}
```

### 2. Users
- **Collection:** `/users/{userId}`
- **Fields:**
  - id, firstName, lastName, userName, email, age, status, relationship, additives, allergies, avatarURL, intolerances, dietaryForm, createdAt

### 3. Favourites
- **Subcollection:** `/users/{userId}/favourites/{barcode}`
- **Fields:**
  - barcode, productName, brand, createdAt, updatedAt

### 4. Allergens
- **Collection:** `/allergens/{id}`
- **Fields:**
  - id, name, description

### 5. Additives
- **Collection:** `/additives/{id}`
- **Fields:**
  - id, name, description

### 6. Categories
- **Collection:** `/categories/{id}`
- **Fields:**
  - id, name, description

### 7. Labels
- **Collection:** `/labels/{id}`
- **Fields:**
  - id, name, description

---

## Notes
- All field types and names are aligned with the backend and frontend contracts.
- This structure supports efficient sync and querying for the mobile app and backend.
- Update/add seed scripts as needed to populate master data (allergens, additives, etc).

---

## Next Steps
- Implement Firestore rules and indexes as needed.
- Update backend/frontend code to use this structure for all Firestore operations.
- Keep this document updated with any schema changes.
