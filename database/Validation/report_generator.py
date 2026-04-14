import json
import os
from datetime import datetime

def generate_report(results, output_path=None):
    if output_path is None:
        output_path = os.path.join(
            "database", "Validation", "schema_validation_report.json"
        )

    report = {
        "timestamp": datetime.utcnow().isoformat(),
        "total_records": results["total"],
        "valid_records": results["valid"],
        "invalid_records": results["invalid"],
        "errors": results["errors"]
    }

    with open(output_path, "w") as file:
        json.dump(report, file, indent=4)

    print(f"Validation report saved to {output_path}")