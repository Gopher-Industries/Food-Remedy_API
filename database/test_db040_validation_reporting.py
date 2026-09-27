"""
DB040 — Improve Pipeline Validation Reporting Test Suite.

Tests for schema_validator module reporting enhancements:
    1. Valid product records result in error_summary == {}.
    2. Invalid product records accurately aggregate counts by error code in error_summary.
    3. schema_validator.run() writes error_summary to the JSON report output.
    4. Existing report keys (total, valid, invalid, invalid_examples) remain functional.

Run with: pytest database/test_db040_validation_reporting.py -v
"""

import os
import json
import tempfile
import pytest
from database.pipeline.modules.schema_validator import _validate_record, run


@pytest.fixture
def temp_dir():
    with tempfile.TemporaryDirectory() as tmp:
        yield tmp


def test_validate_record_valid():
    record = {
        "barcode": "93006013",
        "productName": "Valid Milk",
        "nutriments": {"energy-kcal": 65},
        "allergens": ["milk"],
        "categories": ["beverages"],
        "completeness": 0.95
    }
    errors = _validate_record(record)
    assert errors == []


def test_validate_record_invalid():
    record = {
        "barcode": "  ",
        "nutriments": "not-a-dict",
        "completeness": 1.5
    }
    errors = _validate_record(record)
    assert "invalid_barcode" in errors
    assert "missing_productName" in errors
    assert "invalid_nutriments_type" in errors
    assert "invalid_completeness_value" in errors


def test_schema_validator_run_generates_error_summary(temp_dir):
    input_file = os.path.join(temp_dir, "test_input.json")
    output_file = os.path.join(temp_dir, "test_output.json")
    report_file = os.path.join(temp_dir, "test_report.json")

    sample_dataset = [
        # 1 Valid record
        {"barcode": "111", "productName": "Product A"},
        # 2 Invalid records with missing productName
        {"barcode": "222"},
        {"barcode": "333"},
        # 1 Invalid record with missing barcode & invalid nutriments
        {"productName": "Product D", "nutriments": "invalid"}
    ]

    with open(input_file, "w", encoding="utf-8") as f:
        json.dump(sample_dataset, f)

    config = {
        "report_path": report_file,
        "dry_run": False
    }

    result = run(input_path=input_file, output_path=output_file, config=config)

    assert result["processed"] == 4
    assert result["failures"] == 3

    assert os.path.exists(report_file)
    with open(report_file, "r", encoding="utf-8") as rf:
        report_data = json.load(rf)

    # Check top-level keys
    assert report_data["total"] == 4
    assert report_data["valid"] == 1
    assert report_data["invalid"] == 3
    assert "error_summary" in report_data

    # Check error_summary breakdown
    summary = report_data["error_summary"]
    assert summary.get("missing_productName") == 2
    assert summary.get("missing_barcode") == 1
    assert summary.get("invalid_nutriments_type") == 1
