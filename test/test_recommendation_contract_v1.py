"""Validate the published substitution contract, not a test-only endpoint."""

import json
import unittest
from pathlib import Path

from jsonschema import Draft7Validator


ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads(
    (ROOT / "contracts/recommendation_substitutions_v1.schema.json").read_text(
        encoding="utf-8"
    )
)


def errors(definition, instance):
    validator = Draft7Validator(
        {
            "$schema": SCHEMA["$schema"],
            "definitions": SCHEMA["definitions"],
            "$ref": f"#/definitions/{definition}",
        }
    )
    return list(validator.iter_errors(instance))


class TestRecommendationContractV1(unittest.TestCase):
    def test_schema_is_valid_draft_07(self):
        Draft7Validator.check_schema(SCHEMA)
        self.assertEqual(SCHEMA["title"], "RecommendationSubstitutionsV1")

    def test_request_barcode_and_limit_bounds(self):
        self.assertFalse(errors("SubstitutionRequest", {"barcode": "9300601234567", "limit": 5}))
        for request in (
            {"barcode": "INVALID_BARCODE"},
            {"barcode": "123"},
            {"barcode": "9300601234567", "limit": 0},
            {"barcode": "9300601234567", "limit": 21},
            {"barcode": "9300601234567", "limit": True},
        ):
            with self.subTest(request=request):
                self.assertTrue(errors("SubstitutionRequest", request))

    def test_not_found_response_has_no_fabricated_product(self):
        response = {
            "version": "1.0.0",
            "status": "no_eligible_candidates",
            "targetProduct": None,
            "substitutions": [],
            "emptyStateReason": "PRODUCT_NOT_FOUND",
        }
        self.assertFalse(errors("SubstitutionResponse", response))

    def test_response_rejects_profile_fields(self):
        response = {
            "version": "1.0.0",
            "status": "no_eligible_candidates",
            "targetProduct": {
                "barcode": "9300601234567",
                "productName": "Chocolate",
                "userEmail": "private@example.invalid",
            },
            "substitutions": [],
            "emptyStateReason": "NO_SAFE_ALTERNATIVES_IN_CATEGORY",
        }
        self.assertTrue(errors("SubstitutionResponse", response))
        del response["targetProduct"]["userEmail"]
        response["avoidAllergens"] = ["peanut"]
        self.assertTrue(errors("SubstitutionResponse", response))

    def test_error_envelope_rejects_raw_error_fields(self):
        envelope = {
            "error": {
                "code": "INVALID_BARCODE",
                "message": "Barcode must be numeric.",
                "details": None,
            }
        }
        self.assertFalse(errors("ErrorEnvelope", envelope))
        envelope["error"]["details"] = {"stack": "internal trace"}
        self.assertTrue(errors("ErrorEnvelope", envelope))
        envelope["error"]["details"] = None
        envelope["error"]["stack"] = "internal trace"
        self.assertTrue(errors("ErrorEnvelope", envelope))


if __name__ == "__main__":
    unittest.main()
