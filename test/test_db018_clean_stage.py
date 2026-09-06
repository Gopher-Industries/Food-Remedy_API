"""
Regression tests for the pipeline clean stage.

Added under DB018 (Investigate Automated Test Coverage). Prior to this,
database/pipeline/stages/clean_stage.py had no automated test coverage.
"""
import json
import os
import sys

import pytest

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from database.pipeline.stages.clean_stage import run_clean_stage


def _write_json(path, payload):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    return str(path)


def test_returns_expected_result_contract(tmp_path):
    """run_clean_stage must always return the documented result keys."""
    input_path = _write_json(tmp_path / "in.json", [{"code": "123", "name": "Test"}])
    output_path = str(tmp_path / "out" / "cleaned.json")

    result = run_clean_stage(input_path, output_path)

    assert set(result) == {"status", "processed", "failures", "output"}
    assert result["status"] == "completed"
    assert result["processed"] == 1
    assert result["output"] == output_path
    assert os.path.exists(output_path)


def test_single_dict_input_is_wrapped_in_a_list(tmp_path):
    """A single product object is accepted and treated as one record."""
    input_path = _write_json(tmp_path / "in.json", {"code": "123", "name": "Test"})
    output_path = str(tmp_path / "out" / "cleaned.json")

    result = run_clean_stage(input_path, output_path)

    with open(output_path, encoding="utf-8") as f:
        cleaned = json.load(f)

    assert result["processed"] == 1
    assert isinstance(cleaned, list)
    assert len(cleaned) == 1


def test_nested_values_are_flattened_to_json_strings(tmp_path):
    """List and dict field values are serialised to strings for downstream stages."""
    record = {"code": "123", "categories": ["dairy", "milk"], "meta": {"source": "off"}}
    input_path = _write_json(tmp_path / "in.json", record)
    output_path = str(tmp_path / "out" / "cleaned.json")

    run_clean_stage(input_path, output_path)

    with open(output_path, encoding="utf-8") as f:
        cleaned = json.load(f)[0]

    assert cleaned["categories"] == json.dumps(["dairy", "milk"])
    assert cleaned["meta"] == json.dumps({"source": "off"})
    assert cleaned["code"] == "123"


def test_non_dict_records_are_skipped_without_failing(tmp_path):
    """Malformed entries in the input list are dropped rather than aborting the stage."""
    payload = [{"code": "1"}, "not-a-record", None, {"code": "2"}]
    input_path = _write_json(tmp_path / "in.json", payload)
    output_path = str(tmp_path / "out" / "cleaned.json")

    result = run_clean_stage(input_path, output_path)

    assert result["processed"] == 2


def test_empty_input_list_produces_empty_output(tmp_path):
    """An empty dataset is valid input and yields an empty cleaned file."""
    input_path = _write_json(tmp_path / "in.json", [])
    output_path = str(tmp_path / "out" / "cleaned.json")

    result = run_clean_stage(input_path, output_path)

    with open(output_path, encoding="utf-8") as f:
        assert json.load(f) == []

    assert result["processed"] == 0


def test_unsupported_top_level_type_raises_value_error(tmp_path):
    """A JSON scalar at the top level is rejected explicitly."""
    input_path = _write_json(tmp_path / "in.json", "just-a-string")
    output_path = str(tmp_path / "out" / "cleaned.json")

    with pytest.raises(ValueError):
        run_clean_stage(input_path, output_path)


def test_records_without_nutriments_are_unaffected(tmp_path):
    """Records with no nutriments field pass through without normalisation keys added."""
    input_path = _write_json(tmp_path / "in.json", [{"code": "123", "name": "Test"}])
    output_path = str(tmp_path / "out" / "cleaned.json")

    run_clean_stage(input_path, output_path)

    with open(output_path, encoding="utf-8") as f:
        cleaned = json.load(f)[0]

    assert not any(key.startswith("norm_") for key in cleaned)