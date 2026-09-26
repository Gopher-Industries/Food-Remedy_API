import copy
import json
import unittest
from pathlib import Path

from jsonschema import Draft7Validator


ROOT = Path(__file__).resolve().parents[1] / "contracts"


class SubstitutionV2ContractTest(unittest.TestCase):
    def setUp(self):
        self.schema = json.loads((ROOT / "recommendation_substitutions_v2.schema.json").read_text())
        self.examples = json.loads((ROOT / "recommendation_substitutions_v2.examples.json").read_text())

    def validate(self, name, value):
        schema = {**self.schema, "$ref": f"#/definitions/{name}"}
        return list(Draft7Validator(schema).iter_errors(value))

    def test_examples_conform(self):
        self.assertEqual(self.validate("SubstitutionRequest", self.examples["request"]), [])
        self.assertEqual(self.validate("SubstitutionResponse", self.examples["response"]), [])

    def test_overrides_and_mixed_intent_are_not_contracts(self):
        for extra in ({"allergies": ["milk"]}, {"preferences": {}}, {"score": 1},
                      {"savedIntentId": "saved"}):
            request = {**self.examples["request"], **extra}
            self.assertTrue(self.validate("SubstitutionRequest", request))
        response = copy.deepcopy(self.examples["response"])
        response["substitutions"][0]["confidenceScore"] = 0.78
        self.assertTrue(self.validate("SubstitutionResponse", response))


if __name__ == "__main__":
    unittest.main()
