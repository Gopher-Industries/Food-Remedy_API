import os
import json

def run_clean_stage(input_path: str, output_path: str, config=None):
    """
    Robust clean stage that never crashes on nested OFF data.
    """

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict):
        data = [data]
    elif not isinstance(data, list):
        raise ValueError("Expected list or dict")

    cleaned = []

    for record in data:
        if not isinstance(record, dict):
            continue

        flat = {}
        for k, v in record.items():
            if isinstance(v, (list, dict)):
                flat[k] = json.dumps(v)
            else:
                flat[k] = v

        cleaned.append(flat)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2)

    print(f"[DB018] Cleaning complete: {output_path}")

    return {
        "status": "completed",
        "processed": len(cleaned),
        "failures": 0,
        "output": output_path
    }




