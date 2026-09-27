"""
DB037 — Investigate Pipeline Error Handling & Recovery Test Suite.

Covers representative failure and recovery scenarios:
    1. Handling of missing/invalid input files in stage execution.
    2. Behavior of fail_on_error flag (True vs False) in runPipeline.
    3. Per-module exception trapping inside enrich_stage.
    4. Pipeline checkpoint state recording on failure.
    5. Stage recovery and restart behavior using the force flag.

Run with: pytest database/test_db037_pipeline_error_handling.py -v
"""

import os
import json
import tempfile
import pytest
from database.pipeline.stages.clean_stage import run_clean_stage
from database.pipeline.stages.enrich_stage import run_enrich_stage
from database.pipeline.run_pipeline import runPipeline


@pytest.fixture
def temp_dir():
    with tempfile.TemporaryDirectory() as tmp:
        yield tmp


def test_clean_stage_missing_input_file_raises(temp_dir):
    missing_path = os.path.join(temp_dir, "non_existent.json")
    out_path = os.path.join(temp_dir, "out.json")
    with pytest.raises(FileNotFoundError):
        run_clean_stage(input_path=missing_path, output_path=out_path)


def test_enrich_stage_captures_module_exceptions(temp_dir):
    # Create valid sample input
    input_file = os.path.join(temp_dir, "input.json")
    output_file = os.path.join(temp_dir, "output.json")
    with open(input_file, "w", encoding="utf-8") as f:
        json.dump([{"id": "123", "name": "Test Product"}], f)

    # Config with non-existent module path
    config = {
        "modules": [
            {
                "name": "non_existent_module",
                "path": os.path.join(temp_dir, "invalid_module.py"),
                "enabled": True
            }
        ]
    }

    result = run_enrich_stage(input_path=input_file, output_path=output_file, config=config)

    assert result["output"] == input_file  # Input not advanced due to missing module
    assert len(result["modules_run"]) == 1
    assert result["modules_run"][0]["status"] == "missing"


def test_pipeline_fail_on_error_behavior(temp_dir):
    # Create invalid config pointing to missing clean input file
    config_file = os.path.join(temp_dir, "invalid_config.json")
    ckpt_file = os.path.join(temp_dir, "checkpoints.json")
    meta_file = os.path.join(temp_dir, "metadata.json")

    pipeline_cfg = {
        "pipeline": {
            "fail_on_error": True,
            "outputs": {
                "checkpoints": ckpt_file,
                "metadata": meta_file
            },
            "clean": {
                "enabled": True,
                "input": os.path.join(temp_dir, "missing.json"),
                "output": os.path.join(temp_dir, "cleaned.json")
            },
            "enrich": {"enabled": False},
            "seed": {"enabled": False}
        }
    }

    with open(config_file, "w", encoding="utf-8") as f:
        json.dump(pipeline_cfg, f)

    # With fail_on_error=True, FileNotFoundError should be raised
    with pytest.raises(FileNotFoundError):
        runPipeline(config_path=config_file)

    # Checkpoint should record status: "failed"
    assert os.path.exists(ckpt_file)
    with open(ckpt_file, "r", encoding="utf-8") as cf:
        checkpoints = json.load(cf)
    assert checkpoints["clean"]["status"] == "failed"
    assert "missing.json" in checkpoints["clean"]["error"]


def test_pipeline_recovery_with_force_flag(temp_dir):
    # Setup initial successful clean output fixture
    valid_input = os.path.join(temp_dir, "valid_input.json")
    clean_out = os.path.join(temp_dir, "clean_out.json")
    ckpt_file = os.path.join(temp_dir, "checkpoints.json")
    meta_file = os.path.join(temp_dir, "metadata.json")

    sample_product = [{"id": "93006013", "product_name": "Test Milk"}]
    with open(valid_input, "w", encoding="utf-8") as f:
        json.dump(sample_product, f)

    # Simulate an existing completed checkpoint
    initial_checkpoints = {
        "clean": {
            "status": "completed",
            "finished": "2026-09-01T00:00:00Z",
            "result": {"processed": 1, "failures": 0, "output": clean_out}
        }
    }
    with open(ckpt_file, "w", encoding="utf-8") as cf:
        json.dump(initial_checkpoints, cf)

    pipeline_cfg = {
        "pipeline": {
            "fail_on_error": True,
            "outputs": {
                "checkpoints": ckpt_file,
                "metadata": meta_file
            },
            "clean": {
                "enabled": True,
                "input": valid_input,
                "output": clean_out
            },
            "enrich": {"enabled": False},
            "seed": {"enabled": False}
        }
    }

    config_file = os.path.join(temp_dir, "pipeline_config.json")
    with open(config_file, "w", encoding="utf-8") as f:
        json.dump(pipeline_cfg, f)

    # Run pipeline with force=True -> should re-execute clean stage despite checkpoint
    runPipeline(config_path=config_file, force=True)

    assert os.path.exists(clean_out)
    with open(clean_out, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert len(data) == 1
    assert data[0]["id"] == "93006013"
