"""DB062: release pipeline configuration and clean/enrich stage contracts."""

import json
from pathlib import Path

from database.pipeline.stages.clean_stage import run_clean_stage
from database.pipeline.stages.enrich_stage import run_enrich_stage


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "database/pipeline/pipeline.config.json"


def test_clean_stage_accepts_single_product_and_returns_pipeline_contract(tmp_path):
    source = tmp_path / "single.json"
    output = tmp_path / "cleaned.json"
    source.write_text(json.dumps({
        "barcode": "12345678",
        "productName": "Example",
        "nutriments": {"sugars_100g": 4},
    }))

    result = run_clean_stage(str(source), str(output), config={})

    assert result == {
        "status": "completed",
        "processed": 1,
        "failures": 0,
        "output": str(output),
    }
    assert len(json.loads(output.read_text())) == 1


def test_every_enabled_enrichment_module_resolves_from_database_root():
    enrich = json.loads(CONFIG.read_text())["pipeline"]["enrich"]
    enabled = [module for module in enrich["modules"] if module.get("enabled", True)]

    assert enabled
    for module in enabled:
        path = Path(module["path"])
        if not path.is_absolute():
            path = ROOT / "database" / path
        assert path.is_file(), f"{module['name']} does not resolve: {path}"


def test_configured_nutrition_module_generates_expected_enrichment(tmp_path):
    enrich = json.loads(CONFIG.read_text())["pipeline"]["enrich"]
    nutrition = next(
        module for module in enrich["modules"]
        if module["name"] == "nutrition_enrich"
    )
    source = tmp_path / "input.json"
    output = tmp_path / "output.json"
    source.write_text(json.dumps([{
        "barcode": "12345678",
        "productName": "Example",
        "nutriments": {
            "sugars_100g": 4,
            "proteins_100g": 13,
            "fiber_100g": 7,
        },
    }]))

    result = run_enrich_stage(
        str(source),
        str(output),
        {"modules": [nutrition]},
    )

    records = json.loads(output.read_text())
    assert result["processed"] == 1
    assert result["failures"] in (None, 0)
    assert result["modules_run"][0]["status"] == "ok"
    assert records[0]["enrichment"]["nutrition"]["sufficientDataForScore"] is True
