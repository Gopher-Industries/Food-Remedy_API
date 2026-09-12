"""DB060: saved-data checks, traceability, counting and command exit behaviour."""

from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys

import pytest

from scripts.db060_release_validation import validate

ROOT = Path(__file__).resolve().parents[1]


def product(barcode="12345678", name="Example product"):
    return {"barcode": barcode, "productName": name, "allergens": ["Unknown"]}


def test_saved_names_are_checked_even_when_existing_validator_fills_them():
    records = [product(name=None), product("12345679", "nan"), product("12345670")]
    original = deepcopy(records)
    report = validate(records)
    assert report["current_validation"]["batch_gate_passed"] is True
    assert (report["total_records"], report["valid_records"], report["invalid_records"]) == (3, 1, 2)
    assert report["status"] == "BLOCKED"
    assert report["failed_records"][0]["index"] == 0
    assert report["failed_records"][0]["barcode"] == "12345678"
    assert "stored_product_name_missing_or_unusable" in report["failed_records"][0]["reasons"]
    assert records == original


def test_overlapping_errors_count_a_row_once_and_trace_missing_identifier():
    report = validate([product(None, None), product("123", "nan")])
    assert report["invalid_records"] == 2
    assert len(report["failed_records"][0]["reasons"]) >= 2
    assert report["failed_records"][0]["index"] == 0
    assert report["failed_records"][0]["barcode"] is None
    assert report["current_validation"]["invalid_records"] == 2


def test_duplicates_flag_all_members_without_rewriting_leading_zeros():
    records = [product("00123456"), product("00123456"), product("12345678")]
    report = validate(records)
    assert report["current_validation"]["result"]["barcode"]["duplicates"] == 1
    assert report["current_validation"]["invalid_records"] == 1
    assert report["invalid_records"] == 2
    assert [x["barcode"] for x in report["failed_records"]] == ["00123456", "00123456"]


def test_integer_identifier_is_distinguished_from_the_normalised_batch_result():
    report = validate([product(12345678)])
    assert report["current_validation"]["batch_gate_passed"] is True
    assert report["failed_records"][0]["reasons"] == ["stored_barcode_not_string"]


@pytest.mark.parametrize("barcode", ["00123456", "012345678901", "0123456789012", "00123456789012"])
def test_all_agreed_barcode_lengths_and_leading_zeros_pass(barcode):
    report = validate([product(barcode)])
    assert report["invalid_records"] == 0
    assert report["status"] == "CHECKS_PASSED_PENDING_APPROVAL"
    assert report["release_approved"] is False


def test_empty_dataset_cannot_pass_even_if_db021_accepts_it():
    report = validate([])
    assert report["status"] == "BLOCKED"
    assert report["dataset_errors"] == ["empty_dataset"]


def test_empty_allergens_require_review_without_claiming_confirmed_safety():
    report = validate([{**product(), "allergens": []}])
    assert report["invalid_records"] == 0
    assert report["status"] == "REVIEW_REQUIRED"
    assert report["required_reviews"][0]["records"] == 1


@pytest.mark.parametrize("records", [{}, [product(), None], [123]])
def test_malformed_rows_are_not_silently_dropped(records):
    with pytest.raises(ValueError, match="product objects"):
        validate(records)


@pytest.mark.parametrize("records,exit_code", [([product()], 0), ([product(name="nan")], 1), (None, 2)])
def test_cli_saves_traceable_result_and_does_not_overwrite_input(tmp_path, records, exit_code):
    source, output = tmp_path / "candidate.json", tmp_path / "report.json"
    source.write_text(json.dumps(records))
    original = source.read_bytes()
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts/db060_release_validation.py"),
         "--input", str(source), "--output", str(output)],
        cwd=tmp_path, capture_output=True, text=True,
    )
    assert result.returncode == exit_code, result.stderr
    assert source.read_bytes() == original
    if exit_code != 2:
        report = json.loads(output.read_text())
        assert len(report["provenance"]["dataset_sha256"]) == 64
        assert report["release_approved"] is False
    else:
        assert not output.exists()


def test_cli_refuses_to_overwrite_dataset(tmp_path):
    source = tmp_path / "candidate.json"
    source.write_text(json.dumps([product()]))
    original = source.read_bytes()
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts/db060_release_validation.py"),
         "--input", str(source), "--output", str(source)],
        cwd=tmp_path, capture_output=True, text=True,
    )
    assert result.returncode == 2
    assert source.read_bytes() == original
