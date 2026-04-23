import json
import os

def load_schema(schema_path=None):
    if schema_path is None:
        schema_path = os.path.join(
            "database", "seeding", "schema_definition.json"
        )

    try:
        with open(schema_path, "r") as file:
            schema = json.load(file)
        return schema
    except Exception as e:
        raise Exception(f"Error loading schema: {e}")