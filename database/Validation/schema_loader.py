"""Load Firestore product schema JSON for DB014 / DB021 validation."""

import json
import os


def default_schema_path():
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "seeding",
        "schema_definition.json",
    )


def load_schema(schema_path=None):
    path = schema_path or default_schema_path()
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
