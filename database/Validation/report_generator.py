import json
import os
from datetime import datetime

def generate_report(results, output_path=None):
    if output_path is None:
        output_path = os.path.join(
            "database", "Validation", "schema_validation_report.json"
        )

    schema_result = results.get("schema_validation", {})
    barcode_result = results.get("barcode", {})
    total_records = results.get("total_records")
    if total_records is None:
        total_records = schema_result.get("invalid_count", 0) + (
            1 if schema_result.get("valid", False) else 0
        )
    invalid_records = schema_result.get("invalid_count", 0)

    report = {
        "timestamp": datetime.utcnow().isoformat(),
        "total_records": total_records,
        "valid_records": max(total_records - invalid_records, 0),
        "invalid_records": invalid_records,
        "errors": schema_result.get("errors", []),
        "summary": {
            "basic_schema": results.get("basic_schema", False),
            "nutrients": results.get("nutrients", False),
            "allergens": results.get("allergens", False),
            "barcode_ok": barcode_result.get("ok", False),
            "schema_valid": schema_result.get("valid", False),
        },
    }

    with open(output_path, "w") as file:
        json.dump(report, file, indent=4)

    print(f"Validation report saved to {output_path}")
