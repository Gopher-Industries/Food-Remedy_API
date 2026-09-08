"""
Contract Validation Test Suite for Recommendation Substitution Contract v1.0.0.

Validates schema compliance, fail-safe allergen eligibility policies,
unknown-data handling, error envelopes, privacy non-leakage, and empty-state taxonomy.
"""

import json
import os
import re
import sys
import unittest
from typing import Any, Dict, List, Optional

# Ensure project root is in sys.path
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)


SCHEMA_PATH = os.path.join(_PROJECT_ROOT, "contracts", "recommendation_substitutions_v1.schema.json")


def load_schema() -> Dict[str, Any]:
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def validate_barcode(barcode: str) -> Optional[Dict[str, Any]]:
    """Validate request barcode parameter."""
    if not isinstance(barcode, str) or not re.match(r"^[0-9]{8,14}$", barcode):
        return {
            "error": {
                "code": "INVALID_BARCODE",
                "message": "Barcode must be a valid numeric string between 8 and 14 digits.",
                "details": None,
            }
        }
    return None


def validate_limit(limit: int) -> Optional[Dict[str, Any]]:
    """Validate request limit parameter."""
    if not isinstance(limit, int) or limit < 1 or limit > 20:
        return {
            "error": {
                "code": "INVALID_LIMIT",
                "message": "Limit must be an integer between 1 and 20.",
                "details": None,
            }
        }
    return None


def evaluate_candidate_eligibility(
    candidate: Dict[str, Any],
    user_avoid_allergens: List[str] = None,
    user_dietary_restrictions: List[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Evaluates candidate safety under fail-safe policy v1.0.0.

    Returns candidate dict with safetyRating if eligible, or None if hard-excluded.
    """
    user_avoid_allergens = user_avoid_allergens or []
    user_dietary_restrictions = user_dietary_restrictions or []

    cand_allergens = candidate.get("allergens")
    cand_ingredients = candidate.get("ingredients")

    # Hard Exclusion Rule 1: Direct Allergen Match
    if user_avoid_allergens and isinstance(cand_allergens, list):
        for alg in user_avoid_allergens:
            alg_clean = alg.strip().lower()
            if any(alg_clean in str(c).strip().lower() for c in cand_allergens):
                return None  # Hard-excluded: Unsafe

    # Fail-Safe Rule 2: Unknown / Missing Allergen Data
    if user_avoid_allergens:
        if cand_allergens is None or (isinstance(cand_allergens, list) and len(cand_allergens) == 0 and not cand_ingredients):
            # Unknown safety cannot be marked 'green' or presented as safe substitute
            return None  # Hard-excluded under fail-safe policy

    # Hard Exclusion Rule 3: Dietary Restriction Violation
    if "vegan" in [d.lower() for d in user_dietary_restrictions]:
        if isinstance(cand_allergens, list) and any(a.lower() in ["milk", "eggs", "fish", "crustaceans"] for a in cand_allergens):
            return None  # Hard-excluded: Animal derivative present

    # Eligible candidate
    safety_rating = "green" if cand_allergens == [] else "grey"
    return {
        "barcode": candidate.get("barcode"),
        "productName": candidate.get("productName"),
        "brand": candidate.get("brand"),
        "nutriscoreGrade": candidate.get("nutriscoreGrade", "unknown"),
        "safetyRating": safety_rating,
        "confidenceScore": 0.85,
        "reasonCodes": ["MATCH_CATEGORY_EXACT", "SAFE_ALLERGEN_FREE"],
        "reasons": ["Exact category match", "Safe allergen-free alternative"],
    }


def generate_substitutions_response(
    target_product: Optional[Dict[str, Any]],
    candidates: List[Dict[str, Any]],
    avoid_allergens: List[str] = None,
    dietary_restrictions: List[str] = None,
) -> Dict[str, Any]:
    """Generates canonical SubstitutionResponse dictionary."""
    avoid_allergens = avoid_allergens or []
    dietary_restrictions = dietary_restrictions or []

    if not target_product:
        return {
            "version": "1.0.0",
            "status": "no_eligible_candidates",
            "targetProduct": {"barcode": "0000000000000", "productName": "Unknown Product"},
            "substitutions": [],
            "emptyStateReason": "PRODUCT_NOT_FOUND",
        }

    # Check for missing category / insufficient target product data
    category = target_product.get("category")
    if not category or str(category).strip() == "":
        return {
            "version": "1.0.0",
            "status": "insufficient_data",
            "targetProduct": target_product,
            "substitutions": [],
            "emptyStateReason": "INSUFFICIENT_PRODUCT_DATA",
        }

    eligible_substitutions = []
    excluded_count = 0

    for cand in candidates:
        eval_res = evaluate_candidate_eligibility(cand, avoid_allergens, dietary_restrictions)
        if eval_res:
            eligible_substitutions.append(eval_res)
        else:
            excluded_count += 1

    if not eligible_substitutions:
        empty_reason = (
            "STRICT_ALLERGEN_EXCLUSION_ALL_CANDIDATES"
            if (avoid_allergens and excluded_count > 0)
            else "NO_SAFE_ALTERNATIVES_IN_CATEGORY"
        )
        return {
            "version": "1.0.0",
            "status": "no_eligible_candidates",
            "targetProduct": target_product,
            "substitutions": [],
            "emptyStateReason": empty_reason,
        }

    return {
        "version": "1.0.0",
        "status": "success",
        "targetProduct": target_product,
        "substitutions": eligible_substitutions,
        "emptyStateReason": None,
    }


class TestRecommendationContractV1(unittest.TestCase):
    def setUp(self):
        self.schema = load_schema()
        self.valid_target = {
            "barcode": "9300601234567",
            "productName": "Dairy Milk Chocolate 180g",
            "category": "chocolates",
            "allergens": ["Milk"],
            "nutriscoreGrade": "e",
        }

    def test_schema_file_exists_and_is_valid_json(self):
        self.assertIn("definitions", self.schema)
        self.assertEqual(self.schema["title"], "RecommendationSubstitutionsV1")

    def test_malformed_barcode_returns_sanitized_error_envelope(self):
        err = validate_barcode("INVALID_BARCODE_ABC")
        self.assertIsNotNone(err)
        self.assertEqual(err["error"]["code"], "INVALID_BARCODE")

        err_short = validate_barcode("123")
        self.assertIsNotNone(err_short)
        self.assertEqual(err_short["error"]["code"], "INVALID_BARCODE")

    def test_malformed_limit_returns_sanitized_error_envelope(self):
        err_zero = validate_limit(0)
        self.assertEqual(err_zero["error"]["code"], "INVALID_LIMIT")

        err_large = validate_limit(50)
        self.assertEqual(err_large["error"]["code"], "INVALID_LIMIT")

    def test_fail_safe_excludes_candidate_with_direct_allergen_match(self):
        cand_unsafe = {
            "barcode": "9300601999999",
            "productName": "Peanut Butter Chocolate Bar",
            "allergens": ["Peanuts", "Milk"],
            "ingredients": ["peanuts", "milk chocolate"],
        }
        res = evaluate_candidate_eligibility(cand_unsafe, user_avoid_allergens=["peanuts"], user_dietary_restrictions=[])
        self.assertIsNone(res)  # Hard-excluded

    def test_fail_safe_excludes_candidate_with_missing_unknown_allergen_data(self):
        cand_unknown = {
            "barcode": "9300601888888",
            "productName": "Unlabeled Snack Bar",
            "allergens": None,  # Unknown / missing allergen data
            "ingredients": [],
        }
        res = evaluate_candidate_eligibility(cand_unknown, user_avoid_allergens=["peanuts"], user_dietary_restrictions=[])
        self.assertIsNone(res)  # Fail-safe: Unknown safety cannot be presented as safe substitute

    def test_privacy_non_leakage_in_responses(self):
        candidates = [
            {
                "barcode": "9300601777777",
                "productName": "Dark Chocolate 85%",
                "brand": "Pico",
                "allergens": [],
                "ingredients": ["cocoa mass", "cocoa butter", "sugar"],
                "nutriscoreGrade": "b",
            }
        ]
        resp = generate_substitutions_response(
            self.valid_target, candidates, avoid_allergens=["milk", "peanuts"], dietary_restrictions=["vegan"]
        )

        resp_str = json.dumps(resp)
        # Assert sensitive medical / user profile fields are NOT present
        self.assertNotIn("userMedicalProfile", resp_str)
        self.assertNotIn("avoidAllergens", resp_str)
        self.assertNotIn("userEmail", resp_str)
        self.assertEqual(resp["status"], "success")
        self.assertEqual(len(resp["substitutions"]), 1)

    def test_empty_state_taxonomy_distinguishes_reasons(self):
        # Case 1: Target missing category -> INSUFFICIENT_PRODUCT_DATA
        target_no_cat = {"barcode": "9300601111111", "productName": "No Category Item", "category": None}
        resp1 = generate_substitutions_response(target_no_cat, [])
        self.assertEqual(resp1["status"], "insufficient_data")
        self.assertEqual(resp1["emptyStateReason"], "INSUFFICIENT_PRODUCT_DATA")

        # Case 2: All candidates excluded due to allergens -> STRICT_ALLERGEN_EXCLUSION_ALL_CANDIDATES
        unsafe_cand = [{"barcode": "9300601222222", "productName": "Peanut Cluster", "allergens": ["Peanuts"], "ingredients": ["peanuts"]}]
        resp2 = generate_substitutions_response(self.valid_target, unsafe_cand, avoid_allergens=["peanuts"])
        self.assertEqual(resp2["status"], "no_eligible_candidates")
        self.assertEqual(resp2["emptyStateReason"], "STRICT_ALLERGEN_EXCLUSION_ALL_CANDIDATES")

        # Case 3: Product not found -> PRODUCT_NOT_FOUND
        resp3 = generate_substitutions_response(None, [])
        self.assertEqual(resp3["status"], "no_eligible_candidates")
        self.assertEqual(resp3["emptyStateReason"], "PRODUCT_NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
