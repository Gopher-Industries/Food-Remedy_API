"""Offline, repeatable semantic backfill for a reviewed evaluation subset.

Only a curated manifest supplies values. This script never guesses from names or
touches Firestore; upload of reviewed output remains a trusted pipeline step.
"""

import argparse
import json
from pathlib import Path

from jsonschema import Draft7Validator, FormatChecker

FIELDS = (
    "texture", "flavourFamily", "flavourIntensity", "foodRole", "occasion",
    "portability", "shareability", "preparation", "messRisk", "meltRisk",
    "servingFormat",
)
SCHEMA = json.loads(
    (Path(__file__).resolve().parents[2] / "contracts" / "personalization_v1.schema.json").read_text()
)["definitions"]["ProductSemanticAttributes"]
VALIDATOR = Draft7Validator(SCHEMA, format_checker=FormatChecker())


def coverage(products):
    """Separate missing blocks/fields from low-confidence populated evidence."""
    report = {"products": len(products), "missingBlocks": 0, "populatedAttributes": 0,
              "missingAttributes": 0, "lowConfidenceAttributes": 0, "byField": {}}
    for field in FIELDS:
        report["byField"][field] = {"populated": 0, "missing": 0, "lowConfidence": 0}
    for product in products:
        block = product.get("semanticAttributes")
        if not block:
            report["missingBlocks"] += 1
        for field in FIELDS:
            attribute = (block or {}).get(field)
            if attribute is None:
                report["missingAttributes"] += 1
                report["byField"][field]["missing"] += 1
            else:
                report["populatedAttributes"] += 1
                report["byField"][field]["populated"] += 1
                if attribute["confidence"] < 0.7:
                    report["lowConfidenceAttributes"] += 1
                    report["byField"][field]["lowConfidence"] += 1
    return report


def backfill(products, manifest):
    by_barcode = {str(item["barcode"]): item for item in products}
    if len(by_barcode) != len(products):
        raise ValueError("Duplicate product barcode")
    applied = 0
    for entry in manifest:
        barcode = str(entry["barcode"])
        if barcode not in by_barcode:
            raise ValueError(f"Manifest barcode absent from evaluation catalogue: {barcode}")
        block = entry["semanticAttributes"]
        errors = list(VALIDATOR.iter_errors(block))
        if errors:
            raise ValueError(f"Invalid semantic block for {barcode}: {errors[0].message}")
        populated = sum(field in block for field in FIELDS)
        if not populated or (block["evidenceCompleteness"] == "complete" and populated != len(FIELDS)):
            raise ValueError(f"Incorrect evidence completeness for {barcode}")
        current = by_barcode[barcode].get("semanticAttributes")
        if current and current != block:
            raise ValueError(f"Existing semantic evidence differs for {barcode}; review explicitly")
        if not current:
            by_barcode[barcode]["semanticAttributes"] = block
            applied += 1
    return applied, coverage(products)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--products", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if args.output.resolve() == args.products.resolve():
        parser.error("Output must differ from input")
    products = json.loads(args.products.read_text())
    manifest = json.loads(args.manifest.read_text())
    if not isinstance(products, list) or not isinstance(manifest, list):
        parser.error("Inputs must be JSON arrays")
    applied, report = backfill(products, manifest)
    args.output.write_text(json.dumps(products, indent=2) + "\n")
    args.report.write_text(json.dumps({"applied": applied, **report}, indent=2) + "\n")
    print(json.dumps({"applied": applied, **report}))


if __name__ == "__main__":
    main()
