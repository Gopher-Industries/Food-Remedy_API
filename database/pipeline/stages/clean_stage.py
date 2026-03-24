import os
import json
from database.pipeline.modules.missing_field_handler import handle_missing_fields, log_missing_fields


def run_clean_stage(input_path: str, output_path: str, config=None):
    

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError("Expected list of records")

    cleaned = []
    failures = []

    for record in data:
        if not isinstance(record, dict):
            failures.append(record)
            continue

        flat = {}
        for k, v in record.items():
            if isinstance(v, (list, dict)):
                flat[k] = json.dumps(v)
            else:
                flat[k] = v

        # DB007: handle missing fields
        flat = handle_missing_fields(flat)
        log_missing_fields(flat)

        cleaned.append(flat)

    # Save cleaned data
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2)

    print(f"[DB007] Cleaning complete: {output_path}")

    # ✅ RETURN dict expected by pipeline
    return {
        "processed": len(cleaned),
        "failures": len(failures),
        "output_path": output_path
    }