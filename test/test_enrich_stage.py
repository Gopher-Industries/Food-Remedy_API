import json

from database.pipeline.run_pipeline import runPipeline
from database.pipeline.stages.enrich_stage import run_enrich_stage


def _write_test_enrichment_modules(tmp_path):
    failing_module_path = tmp_path / "failing_module.py"
    recovery_module_path = tmp_path / "recovery_module.py"
    failing_module_path.write_text(
        "def run(input_path, output_path, config):\n"
        "    raise RuntimeError('simulated enrich failure')\n",
        encoding="utf-8",
    )
    recovery_module_path.write_text(
        "import json\n"
        "def run(input_path, output_path, config):\n"
        "    with open(input_path, encoding='utf-8') as source:\n"
        "        data = json.load(source)\n"
        "    with open(output_path, 'w', encoding='utf-8') as destination:\n"
        "        json.dump(data, destination)\n"
        "    return {'processed': len(data), 'failures': 0, 'output': output_path}\n",
        encoding="utf-8",
    )
    return failing_module_path, recovery_module_path


def test_enrich_stage_pass_through_is_unchanged_without_modules(tmp_path):
    """An empty module list retains the existing input-to-output behaviour."""
    input_path = tmp_path / "input.json"
    output_path = tmp_path / "output.json"
    records = [{"barcode": "9300633714437", "productName": "Milk"}]
    input_path.write_text(json.dumps(records), encoding="utf-8")

    result = run_enrich_stage(
        str(input_path), str(output_path), {"modules": []}
    )

    assert result == {
        "processed": None,
        "failures": None,
        "output": str(output_path),
        "modules_run": [],
    }
    assert json.loads(output_path.read_text(encoding="utf-8")) == records


def test_enrich_stage_counts_module_exception_and_continues(tmp_path):
    """A failed module is reported while a later module can still recover."""
    input_path = tmp_path / "input.json"
    output_path = tmp_path / "output.json"
    records = [{"barcode": "9300633714437", "productName": "Milk"}]
    input_path.write_text(json.dumps(records), encoding="utf-8")
    failing_module_path, recovery_module_path = _write_test_enrichment_modules(
        tmp_path
    )

    result = run_enrich_stage(
        str(input_path),
        str(output_path),
        {
            "modules": [
                {"name": "failing", "path": str(failing_module_path)},
                {"name": "recovery", "path": str(recovery_module_path)},
            ]
        },
    )

    assert result["failures"] == 1
    assert result["processed"] == 1
    assert result["output"] == str(output_path)
    assert [entry["status"] for entry in result["modules_run"]] == ["failed", "ok"]
    assert result["modules_run"][0]["error"] == "simulated enrich failure"
    assert "RuntimeError: simulated enrich failure" in result["modules_run"][0]["traceback"]
    assert json.loads(output_path.read_text(encoding="utf-8")) == records


def test_pipeline_metadata_records_recovered_enrichment_failure(tmp_path):
    """Pipeline metadata exposes a recovered module failure to operators."""
    input_path = tmp_path / "input.json"
    output_path = tmp_path / "output.json"
    checkpoint_path = tmp_path / "checkpoints.json"
    metadata_path = tmp_path / "metadata.json"
    records = [{"barcode": "9300633714437", "productName": "Milk"}]
    input_path.write_text(json.dumps(records), encoding="utf-8")
    failing_module_path, recovery_module_path = _write_test_enrichment_modules(
        tmp_path
    )

    runPipeline(
        config={
            "pipeline": {
                "fail_on_error": True,
                "outputs": {
                    "checkpoints": str(checkpoint_path),
                    "metadata": str(metadata_path),
                },
                "clean": {"enabled": False},
                "enrich": {
                    "enabled": True,
                    "input": str(input_path),
                    "output": str(output_path),
                    "modules": [
                        {"name": "failing", "path": str(failing_module_path)},
                        {"name": "recovery", "path": str(recovery_module_path)},
                    ],
                },
                "seed": {"enabled": False},
            }
        }
    )

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    enrich_result = metadata["stages"]["enrich"]
    assert enrich_result["failures"] == 1
    assert [entry["status"] for entry in enrich_result["modules_run"]] == [
        "failed",
        "ok",
    ]
    assert json.loads(output_path.read_text(encoding="utf-8")) == records
