"""Generate the BE058 Draft-07 schema from the bounded v1 vocabulary."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "1.0.0"
VALUES = {
    "texture": ["crunchy", "crispy", "soft", "chewy", "creamy", "smooth", "liquid"],
    "flavourFamily": ["sweet", "savoury", "salty", "sour", "bitter", "spicy", "neutral"],
    "flavourIntensity": ["mild", "medium", "strong"],
    "familiarity": ["familiar", "open_to_new", "adventurous"],
    "convenience": ["ready_to_eat", "minimal_prep", "requires_prep"],
    "occasion": ["breakfast", "lunchbox", "commute", "snack", "shared", "recipe", "other"],
}
REJECTION_REASONS = ["too_strong", "wrong_texture", "messy", "unfamiliar", "too_different", "other"]
ACTIONS = ["shown", "opened", "added_to_list", "dismissed", "thumbs_up", "thumbs_down", "purchased"]
DATE = {"type": "string", "format": "date-time", "maxLength": 35}
ID = {"type": "string", "pattern": "^[A-Za-z0-9_-]{1,128}$"}
VERSION_FIELD = {"const": VERSION}
SOURCE_VERSION = {"type": "string", "minLength": 1, "maxLength": 64, "pattern": "^[A-Za-z0-9._-]+$"}


def obj(properties, required, *, max_properties=None):
    result = {"type": "object", "properties": properties, "required": required, "additionalProperties": False}
    if max_properties is not None:
        result["maxProperties"] = max_properties
    return result


def explicit_preference(dimension, values):
    return obj({
        "dimension": {"const": dimension},
        "value": {"enum": values},
        "sentiment": {"enum": ["like", "avoid"]},
        "provenance": {"const": "explicit"},
        "confidence": {"const": 1},
        "sourceVersion": SOURCE_VERSION,
        "updatedAt": DATE,
    }, ["dimension", "value", "sentiment", "provenance", "confidence", "sourceVersion", "updatedAt"])


def semantic_attribute(values):
    return obj({
        "value": {"enum": [*values, "not_applicable"]},
        "source": {"enum": ["catalogue", "manual", "deterministic", "model_inferred"]},
        "sourceVersion": SOURCE_VERSION,
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "generatedAt": DATE,
    }, ["value", "source", "sourceVersion", "confidence", "generatedAt"])


definitions = {
    "ExplicitPreference": {"oneOf": [explicit_preference(dimension, values) for dimension, values in VALUES.items()]},
    "DerivedPreference": {"oneOf": [obj({
        "dimension": {"const": dimension},
        "value": {"enum": values},
        "sentiment": {"enum": ["like", "avoid"]},
        "provenance": {"enum": ["observed", "inferred"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "sourceVersion": SOURCE_VERSION,
        "observedAt": DATE,
        "updatedAt": DATE,
        "expiresAt": DATE,
    }, ["dimension", "value", "sentiment", "provenance", "confidence", "sourceVersion", "observedAt", "updatedAt"])
        for dimension, values in VALUES.items()]},
    "FoodPreferenceProfile": obj({
        "schemaVersion": VERSION_FIELD,
        "profileId": ID,
        "entries": {"type": "array", "items": {"$ref": "#/definitions/ExplicitPreference"}, "maxItems": 32, "uniqueItems": True},
        "updatedAt": DATE,
    }, ["schemaVersion", "profileId", "entries", "updatedAt"]),
    "SavedShoppingIntent": obj({
        "schemaVersion": VERSION_FIELD,
        "intentId": ID,
        "profileId": ID,
        "text": {"type": "string", "minLength": 1, "maxLength": 240, "pattern": "^[^\\u0000-\\u001F\\u007F]+$"},
        "occasion": {"enum": VALUES["occasion"]},
        "convenience": {"enum": VALUES["convenience"]},
        "provenance": {"const": "explicit"},
        "createdAt": DATE,
        "updatedAt": DATE,
    }, ["schemaVersion", "intentId", "profileId", "text", "provenance", "createdAt", "updatedAt"]),
    "RecommendationEvent": obj({
        "schemaVersion": VERSION_FIELD,
        "eventId": ID,
        "profileId": ID,
        "recommendationSessionId": ID,
        "originalBarcode": {"type": "string", "pattern": "^[0-9]{8,14}$"},
        "candidateBarcode": {"type": "string", "pattern": "^[0-9]{8,14}$"},
        "action": {"enum": ACTIONS},
        "rejectionReason": {"enum": REJECTION_REASONS},
        "occurredAt": DATE,
        "receivedAt": DATE,
    }, ["schemaVersion", "eventId", "profileId", "recommendationSessionId", "originalBarcode", "candidateBarcode", "action", "occurredAt", "receivedAt"]),
}
definitions["RecommendationEvent"]["allOf"] = [{
    "if": {"properties": {"action": {"enum": ["dismissed", "thumbs_down"]}}, "required": ["action"]},
    "else": {"not": {"required": ["rejectionReason"]}},
}]

semantic_values = {
    "texture": VALUES["texture"],
    "flavourFamily": VALUES["flavourFamily"],
    "flavourIntensity": VALUES["flavourIntensity"],
    "foodRole": ["main", "side", "treat", "ingredient", "drink"],
    "occasion": VALUES["occasion"],
    "portability": ["portable", "requires_container", "not_portable"],
    "shareability": ["single_serve", "shareable"],
    "preparation": VALUES["convenience"],
    "messRisk": ["low", "medium", "high"],
    "meltRisk": ["low", "medium", "high"],
    "servingFormat": ["single", "multi_pack", "bulk"],
}
definitions["ProductSemanticAttributes"] = obj({
    "schemaVersion": VERSION_FIELD,
    "evidenceCompleteness": {"enum": ["complete", "partial"]},
    **{name: semantic_attribute(values) for name, values in semantic_values.items()},
}, ["schemaVersion", "evidenceCompleteness"])

schema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://food-remedy.dev/schemas/personalization/v1",
    "title": "Food Remedy personalization contracts v1",
    "description": "Owner is the verified UID in the Firestore path. Medical restrictions are intentionally absent.",
    "definitions": definitions,
}

output = ROOT / "contracts" / "personalization_v1.schema.json"
output.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(output.relative_to(ROOT))
