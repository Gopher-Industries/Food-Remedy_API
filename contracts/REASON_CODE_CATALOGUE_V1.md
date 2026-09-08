# Recommendation Reason-Code Catalogue (v1.0.0)

**Contract Version:** 1.0.0  
**Scope:** Machine-readable reason codes returned in `substitutions[].reasonCodes` for the Food Remedy API.

---

## 1. Overview

Reason codes provide standardized, language-agnostic machine tags explaining why a candidate product was recommended as a substitute. Mobile clients use these codes to render localized badge icons, filter suggestions, or generate formatted UI text.

---

## 2. Standard Reason Codes

### 2.1 Category Alignment Codes

| Code | Description |
| :--- | :--- |
| `MATCH_CATEGORY_EXACT` | Candidate product shares the exact primary category as the target product. |
| `MATCH_CATEGORY_SUBSTRING` | Candidate product belongs to a related sub-category or category hierarchy match. |

---

### 2.2 Safety & Dietary Alignment Codes

| Code | Description |
| :--- | :--- |
| `SAFE_ALLERGEN_FREE` | Candidate product is verified free from all allergens flagged in user profile/overrides. |
| `DIET_ALIGNED_VEGAN` | Candidate product is verified compliant with Vegan dietary restrictions. |
| `DIET_ALIGNED_VEGETARIAN` | Candidate product is verified compliant with Vegetarian dietary restrictions. |
| `DIET_ALIGNED_GLUTEN_FREE` | Candidate product is verified Gluten-Free. |

---

### 2.3 Nutritional Improvement Codes

| Code | Description |
| :--- | :--- |
| `BETTER_NUTRI_SCORE` | Candidate product has a superior Nutri-Score grade (e.g. Grade A vs Grade C). |
| `LOWER_SUGAR` | Candidate product contains significantly lower sugar per 100g. |
| `LOWER_SODIUM` | Candidate product contains significantly lower sodium/salt per 100g. |
| `LOWER_SATURATED_FAT` | Candidate product contains lower saturated fat per 100g. |
| `HIGHER_FIBER` | Candidate product contains higher dietary fiber per 100g. |
| `HIGHER_PROTEIN` | Candidate product contains higher protein per 100g. |

---

## 3. Example Usage in API Response Payload

```json
{
  "barcode": "9300601234567",
  "productName": "Oatly Barista Oat Milk 1L",
  "brand": "Oatly",
  "nutriscoreGrade": "a",
  "safetyRating": "green",
  "confidenceScore": 0.92,
  "reasonCodes": [
    "MATCH_CATEGORY_EXACT",
    "SAFE_ALLERGEN_FREE",
    "DIET_ALIGNED_VEGAN",
    "BETTER_NUTRI_SCORE"
  ],
  "reasons": [
    "Exact category match (Plant-based milk)",
    "Verified free from milk allergens",
    "Fully aligned with Vegan diet",
    "Nutri-Score A (Better than Grade C)"
  ]
}
```
