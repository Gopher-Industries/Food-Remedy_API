# Recommendation Substitution Eligibility & Missing-Data Policy (v1.0.0)

**Document Version:** 1.0.0  
**Effective Date:** September 2026  
**Applies To:** Backend API, Mobile Client, Scan Service Consumers  

---

## 1. Executive Summary

This policy governs the eligibility of food product candidates for substitution recommendations in the **Food Remedy API**. The primary directive of this system is **fail-safe consumer protection**: **under no circumstances may an unsafe or unverified product candidate be presented to a user as a safe substitute.**

---

## 2. Universal Eligibility Rules

### 2.1 Hard Exclusion Rules (Unsafe Candidates)
A candidate product is **hard-excluded** (dropped completely from substitution results) if any of the following apply:
1. **Direct Allergen Match**: The candidate contains any allergen listed in the user's active profile or request-level `avoidAllergens` overrides.
2. **Traces / Cross-Contamination Warning**: The candidate lists traces of an allergen flagged as severe in the user profile.
3. **Violated Dietary Restriction**: The user specifies a mandatory diet (e.g., `vegan`, `vegetarian`) and the candidate fails compliance (e.g. contains animal derivatives).

### 2.2 Fail-Safe Rule for Unknown or Insufficient Data
If evidence regarding a product's safety is missing, unparsed, or incomplete:
1. **Unknown Allergen Status**: If candidate product has `allergens = null` or `ingredients = []`, it **CANNOT** be classified as `"green"` (safe).
2. **Downgrade to Grey / Exclusion**:
   - If the user profile has active allergen restrictions, candidates with unknown allergen status are **hard-excluded**.
   - If the user has no severe allergen restrictions, the candidate is restricted to `"grey"` (Acceptable with Caution) and penalized in score.
3. **Missing Category Data**: If the original scanned product or candidate product lacks category tags, category similarity matching cannot be verified. Status is set to `INSUFFICIENT_PRODUCT_DATA`.

---

## 3. Privacy & Profile Non-Leakage

To prevent leaking sensitive user health data (e.g., specific medical allergies or dietary conditions) via network response logs:
- Profile matching is evaluated securely on the backend server.
- The API response payload **MUST NOT** echo back the user's full nutritional profile or sensitive allergen preferences.
- Only non-sensitive, machine-readable reason codes (e.g., `SAFE_ALLERGEN_FREE`, `DIET_ALIGNED_VEGAN`) are returned.

---

## 4. Empty-State Taxonomy

When an API call yields zero substitution candidates, the response MUST distinguish between data gaps and true absence of alternatives via `emptyStateReason`:

| Reason Code | Trigger Condition |
| :--- | :--- |
| `INSUFFICIENT_PRODUCT_DATA` | Scanned target product lacks necessary categories, nutrients, or ingredient tags to find substitutes. |
| `NO_SAFE_ALTERNATIVES_IN_CATEGORY` | Target product category is valid, but no higher-scoring alternatives exist in catalogue. |
| `STRICT_ALLERGEN_EXCLUSION_ALL_CANDIDATES` | Candidate alternatives exist, but 100% were excluded due to strict allergen safety rules. |
| `PRODUCT_NOT_FOUND` | Scanned barcode does not exist in product database. |

---

## 5. Sanitized Error Envelopes

All client validation errors (e.g., invalid barcodes, out-of-range limits) return standardized HTTP status codes and sanitized JSON envelopes:

```json
{
  "error": {
    "code": "INVALID_BARCODE",
    "message": "Barcode must be a valid numeric string between 8 and 14 digits.",
    "details": null
  }
}
```
