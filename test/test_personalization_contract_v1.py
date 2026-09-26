"""BE058 contract fixtures: provenance, bounds, safety separation and compatibility."""

import json
from pathlib import Path

from jsonschema import Draft7Validator, FormatChecker


ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / "contracts/personalization_v1.schema.json").read_text())
NOW = "2026-09-26T00:00:00Z"


def valid(definition, value):
    schema = {**SCHEMA, "$ref": f"#/definitions/{definition}"}
    return not list(Draft7Validator(schema, format_checker=FormatChecker()).iter_errors(value))


def profile():
    return {"schemaVersion": "1.0.0", "profileId": "child_1", "entries": [], "updatedAt": NOW}


def declaration():
    return {"dimension": "texture", "value": "crunchy", "sentiment": "like", "provenance": "explicit", "confidence": 1, "sourceVersion": "mobile-1", "updatedAt": NOW}


def test_schema_is_valid_and_reproducible():
    Draft7Validator.check_schema(SCHEMA)
    original = (ROOT / "contracts/personalization_v1.schema.json").read_text()
    import subprocess
    subprocess.run(["python3", str(ROOT / "scripts/generate_personalization_contract.py")], check=True, capture_output=True)
    assert (ROOT / "contracts/personalization_v1.schema.json").read_text() == original


def test_empty_and_explicit_profiles_are_valid():
    assert valid("FoodPreferenceProfile", profile())
    record = profile()
    record["entries"].append(declaration())
    assert valid("FoodPreferenceProfile", record)


def test_inferred_is_structurally_distinct_and_safety_fields_are_rejected():
    record = profile()
    entry = declaration()
    entry.update(provenance="inferred", confidence=0.7, observedAt=NOW)
    record["entries"] = [entry]
    assert not valid("FoodPreferenceProfile", record)
    assert valid("DerivedPreference", entry)
    record = profile()
    record["allergies"] = ["peanuts"]
    assert not valid("FoodPreferenceProfile", record)


def test_bad_values_lengths_and_unsaved_intent_are_rejected():
    record = profile()
    entry = declaration()
    entry["value"] = "very_crunchy"
    record["entries"] = [entry]
    assert not valid("FoodPreferenceProfile", record)
    record["entries"] = [declaration()] * 33
    assert not valid("FoodPreferenceProfile", record)
    intent = {"schemaVersion": "1.0.0", "intentId": "intent_1", "profileId": "child_1", "text": "Lunchbox snack", "provenance": "explicit", "createdAt": NOW, "updatedAt": NOW}
    assert valid("SavedShoppingIntent", intent)
    assert not valid("SavedShoppingIntent", {**intent, "text": "x" * 241})
    assert not valid("SavedShoppingIntent", {**intent, "text": "line\nbreak"})
    assert not valid("SavedShoppingIntent", {**intent, "provenance": "observed"})


def test_event_and_semantic_evidence_contracts():
    event = {"schemaVersion": "1.0.0", "eventId": "evt_1", "profileId": "child_1", "recommendationSessionId": "session_1", "originalBarcode": "12345678", "candidateBarcode": "87654321", "action": "thumbs_down", "rejectionReason": "messy", "occurredAt": NOW, "receivedAt": NOW}
    assert valid("RecommendationEvent", event)
    assert not valid("RecommendationEvent", {**event, "action": "shown", "rejectionReason": "messy"})
    assert not valid("RecommendationEvent", {**event, "rawIntention": "private"})
    attributes = {"schemaVersion": "1.0.0", "evidenceCompleteness": "partial", "texture": {"value": "crunchy", "source": "manual", "sourceVersion": "catalogue-1", "confidence": 0.9, "generatedAt": NOW}}
    assert valid("ProductSemanticAttributes", attributes)
    assert not valid("ProductSemanticAttributes", {**attributes, "texture": {"value": "crunchy"}})
