import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Keys expected in the `results` dict passed to generate_report().
# Centralised here so callers/readers have a single source of truth
# instead of hunting for magic strings throughout the function body.
KEY_SCHEMA_VALIDATION = "schema_validation"
KEY_BARCODE = "barcode"

DEFAULT_OUTPUT_PATH = os.path.join(
    "database", "Validation", "schema_validation_report.json"
)


def generate_report(results: Dict[str, Any], output_path: Optional[str] = None) -> None:
    """Build a validation report from `results` and write it to disk as JSON.

    Args:
        results: Dict produced by the validation process. Expected (optional)
            keys include:
              - "schema_validation": dict with "valid", "invalid_count", "errors"
              - "barcode": dict with "ok"
              - "total_records": int, overrides the derived total if present
              - "basic_schema", "nutrients", "allergens": bool flags
            Missing keys are treated as falsy/empty rather than raising an
            error (see note below on total_records).
        output_path: Where to write the JSON report. Defaults to
            DEFAULT_OUTPUT_PATH if not provided.

    Note:
        `total_records`, when not explicitly provided, is derived from
        `schema_validation`'s invalid_count/valid fields. This fallback
        formula assumes a single-record validation run and should be
        reviewed before relying on it for multi-record batches — see PR
        notes for details. This behavior is unchanged from the original
        implementation.
    """
    if output_path is None:
        output_path = DEFAULT_OUTPUT_PATH

    schema_result = results.get(KEY_SCHEMA_VALIDATION, {})
    barcode_result = results.get(KEY_BARCODE, {})

    total_records = results.get("total_records")
    if total_records is None:
        # NOTE: see docstring — this formula only makes sense for a
        # single-record validation run. Flagged, not changed, in this pass.
        total_records = schema_result.get("invalid_count", 0) + (
            1 if schema_result.get("valid", False) else 0
        )
    invalid_records = schema_result.get("invalid_count", 0)

    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
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

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w") as file:
        json.dump(report, file, indent=4)

    logger.info("Validation report saved to %s", output_path)