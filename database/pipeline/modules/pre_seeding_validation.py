import json
import shutil
from typing import List, Dict, Any
import argparse
import time

def apply_fallbacks(record: Dict[str, Any]) -> List[str]:
    errors = []
    if not record.get("productName"):
        fallback = f"Product barcode {record.get('barcode', 'unknown')}"
        record["productName"] = fallback
        errors.append(f"productName missing; fallback applied: '{fallback}'")
    return errors

def validate_record(record: Dict[str, Any]) -> List[str]:
    """
    Validate a single enriched product record against Firestore schema requirements.
    Returns list of error messages (empty if valid).
    """
    errors = []

    # Apply fallbacks (modular) 
    fallback_errors = apply_fallbacks(record)
    errors.extend(fallback_errors)
    product_name_was_missing = bool(fallback_errors)

    # Required top-level fields
    for field in ["barcode", "productName"]:
        value = record.get(field)

        if value is None:
            errors.append(f"Missing required field: {field}")
            continue

        if field == "productName" and product_name_was_missing:
            continue

        if not isinstance(value, str) or not value.strip():
            errors.append(f"Invalid {field}: must be non-empty string")

    # Optional but type-sensitive fields
    if "brand" in record and not isinstance(record["brand"], (str, type(None))):
        errors.append("brand must be string or null")

    if "completeness" in record:
        if not isinstance(record["completeness"], (int, float)):
            errors.append("completeness must be a number")
        elif not 0 <= record["completeness"] <= 1:
            errors.append("completeness should be between 0 and 1")

    # nutriments: must be dict (can be empty)
    if "nutriments" in record:
        if not isinstance(record["nutriments"], dict):
            errors.append("nutriments must be a dictionary")
        else:
            # Optional: spot-check a few expected keys are numbers if present
            for key in ["energy-kcal_100g", "fat_100g", "carbohydrates_100g", "proteins_100g", "salt_100g"]:
                if key in record["nutriments"] and not isinstance(record["nutriments"][key], (int, float)):
                    errors.append(f"nutriments.{key} must be a number")

    # allergensDetected: inside enrichment, list of strings
    if "enrichment" in record and isinstance(record["enrichment"], dict):
        if "allergensDetected" in record["enrichment"]:
            ad = record["enrichment"]["allergensDetected"]
            if not isinstance(ad, list):
                errors.append("enrichment.allergensDetected must be a list")
            elif not all(isinstance(x, str) for x in ad):
                errors.append("allergensDetected items must all be strings")
        # Optional: check nutrition substructure
        if "nutrition" in record["enrichment"]:
            nut = record["enrichment"]["nutrition"]
            if not isinstance(nut, dict):
                errors.append("enrichment.nutrition must be a dictionary")
            if "compositeScore" in nut and nut["compositeScore"] is not None and not isinstance(
                nut["compositeScore"], (int, float)
            ):
                errors.append("compositeScore must be a number or null")
            if "healthScore" in nut and nut["healthScore"] is not None and not isinstance(
                nut["healthScore"], (int, float)
            ):
                errors.append("healthScore must be a number or null")
            if "provisionalCompositeScore" in nut and not isinstance(nut["provisionalCompositeScore"], (int, float)):
                errors.append("provisionalCompositeScore must be a number when present")

    # images: should have root if present
    if "images" in record and isinstance(record["images"], dict):
        if "root" not in record["images"] or not isinstance(record["images"]["root"], str):
            errors.append("images.root must exist and be a string if images present")

    return errors

def run(input_path: str, output_path: str, config: dict):
    """
    Run validation on all records from input_path.
    Copies input to output (pass-through) and generates report.
    """
    start = time.time()

    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if not data:
        print("Warning: input JSON is empty")
        return {
            "processed": 0,
            "failures": 0,
            "output": output_path,
            "report": config.get("report_path", "schema_validation_report.json")
        }

    report = {
        "total": len(data),
        "invalid": 0,
        "errors": []
    }

    for rec in data:
        errs = validate_record(rec)
        if errs:
            report["invalid"] += 1
            report["errors"].append({
                "barcode": rec.get("barcode", "unknown"),
                "errors": errs
            })

    # Timing info
    elapsed = time.time() - start 
    report["avg_time_s"] = elapsed / len(data) if data else 0
    
    # Save report
    report_path = config.get("report_path", "schema_validation_report.json")
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    # Write validated (and auto-fixed) data to output
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return {
        "processed": len(data),
        "failures": report["invalid"],
        "output": output_path,
        "report": report_path
    }

def validate_subset(input_path: str, limit: int = 50):
    """
    Validate a subset of records and print results to console.
    """
    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    subset = data[:limit]

    for i, record in enumerate(subset, start=1):
        errors = validate_record(record)
        #print(f"Record {i}:")
        if errors:
            print(f"Record {i}:")
            for e in errors:
                print("  -", e)
                #print(record)
        else:
            pass 
            #print("  OK")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pre-seeding validation for enriched products")
    parser.add_argument("--input", default="../../seeding/products_5k_enriched.json",
                        help="Path to enriched input JSON")
    parser.add_argument("--output", default="../../seeding/validated_enriched.json",
                        help="Path to pass-through validated output")
    parser.add_argument("--report", default="../../seeding/schema_validation_report.json",
                        help="Path to validation report")
    parser.add_argument("--subset", type=int, default=5000, # change to None for full run
                        help="Optional: limit to first N records for quick testing")
    args = parser.parse_args()

    config = {"report_path": args.report}

    print(f"Validating input: {args.input}")
    if args.subset:
        print(f"Limited to first {args.subset} records for quick test")

    result = run(args.input, args.output, config)

    print("\nValidation complete:")
    print(f"Processed: {result['processed']}")
    print(f"Invalid: {result['failures']}")
    print(f"Error rate: {result['failures']/result['processed']:.2%}" if result['processed'] > 0 else "N/A")
    print(f"Report: {result['report']}")
    print(f"Output: {result['output']}")