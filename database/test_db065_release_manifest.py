"""DB065 final release manifest and seeding handoff tests."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from database.pipeline import run_pipeline
from database.pipeline.release_artifact import verify_approved_release_artifact


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "database/seeding/release_validation_manifest.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_final_manifest_matches_db064_artifact_and_evidence():
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    dataset = ROOT / manifest["dataset"]["path"]
    source = ROOT / manifest["source"]["candidate"]
    config = ROOT / manifest["source"]["pipeline_config"]
    generation_path = ROOT / manifest["source"]["generation_record"]
    generation = json.loads(generation_path.read_text(encoding="utf-8"))

    assert manifest["ticket"] == "DB065"
    assert manifest["release_status"] == "APPROVED_DATASET_ARTIFACT"
    assert manifest["release_approved"] is True
    assert manifest["deployment_status"] == "NOT_SEEDED_OR_READ_BACK"
    assert manifest["handover_status"] == "READY_FOR_DEPLOYMENT_CONTROLS"

    assert sha256(dataset) == manifest["dataset"]["sha256"]
    assert sha256(source) == manifest["source"]["candidate_sha256"]
    assert sha256(config) == manifest["source"]["pipeline_config_sha256"]
    assert sha256(generation_path) == manifest["source"]["generation_record_sha256"]

    records = json.loads(dataset.read_text(encoding="utf-8"))
    assert len(records) == manifest["dataset"]["record_count"] == 4731
    assert len({record["barcode"] for record in records}) == len(records)
    assert manifest["validation"] == {
        "status": "PASS",
        "total_records": 4731,
        "valid_records": 4731,
        "invalid_records": 0,
        "schema_validation": "PASS",
        "dataset_errors": [],
        "required_reviews": [],
    }

    quality = generation["quality"]
    assert manifest["barcode_status"]["missing_or_empty"] == quality["barcodes"][
        "missing"
    ]
    assert manifest["barcode_status"]["invalid_format"] == quality["barcodes"][
        "invalid_format"
    ]
    assert manifest["barcode_status"]["duplicates"] == quality["barcodes"][
        "duplicates"
    ]
    assert manifest["ingredient_status"]["missing_text_records"] == quality[
        "ingredients"
    ]["missing_text_records"]
    assert manifest["ingredient_status"]["records_with_data"] == (
        len(records) - quality["ingredients"]["missing_text_records"]
    )
    for field in (
        "known_evidence_records",
        "conservative_unknown_records",
        "empty_records",
        "allergens_detected_mismatches",
    ):
        assert manifest["allergen_status"][field] == quality["allergens"][field]
    for field in (
        "mapped_records",
        "missing_category_tags",
        "tagged_but_unmapped",
        "stored_primary_rule_conflicts_for_review",
    ):
        assert manifest["category_status"][field] == quality["categories"][field]
    assert manifest["alternative_status"]["references_checked"] == quality[
        "alternatives"
    ]["references_checked"]
    assert manifest["alternative_status"]["dangling_references"] == 0
    assert manifest["excluded_records"]["count"] == generation["excluded_records"][
        "count"
    ]
    assert manifest["excluded_records"]["reason_counts"] == generation[
        "excluded_records"
    ]["reason_counts"]

    for evidence in manifest["evidence"].values():
        assert (ROOT / evidence).is_file(), evidence
    release_dir = ROOT / "database/Release/v1.0"
    for line in (release_dir / "SHA256SUMS").read_text(encoding="utf-8").splitlines():
        expected, name = line.split("  ", maxsplit=1)
        assert sha256(release_dir / name) == expected


def test_current_pipeline_is_bound_to_approved_v1_release():
    pipeline = json.loads(
        (ROOT / "database/pipeline/pipeline.config.json").read_text(encoding="utf-8")
    )["pipeline"]
    verified = verify_approved_release_artifact(pipeline, ROOT)

    assert verified == {
        "seed_input": str(
            ROOT / "database/Release/v1.0/foodremedy_release_v1.0.json"
        ),
        "version": "v1.0",
        "dataset_sha256": "b36d25a591a923e69a472a64b402b34e5a4d51d1aaa3904f5b02caa92cf19d82",
        "source_sha256": "90170dac3f974f674cef13b37b08a44e34d516dc49a6cb1ef869bdf6e8352870",
        "manifest": "database/seeding/release_validation_manifest.json",
    }


def test_release_binding_detects_artifact_tampering(tmp_path):
    source = tmp_path / "candidate.json"
    dataset = tmp_path / "release.json"
    generation_path = tmp_path / "generation.json"
    manifest_path = tmp_path / "manifest.json"
    config_path = tmp_path / "database/pipeline/pipeline.config.json"
    config_path.parent.mkdir(parents=True)
    source.write_text('[{"barcode":"12345678"}]', encoding="utf-8")
    dataset.write_text('[{"barcode":"12345678"}]', encoding="utf-8")

    pipeline = {
        "enrich": {"output": "candidate.json"},
        "release": {
            "version": "v1.0",
            "source": "candidate.json",
            "dataset": "release.json",
            "manifest": "manifest.json",
            "sha256": sha256(dataset),
        },
        "seed": {"input": "release.json"},
    }
    config_path.write_text(json.dumps({"pipeline": pipeline}), encoding="utf-8")
    generation_path.write_text(
        json.dumps(
            {
                "generation_status": "CHECKS_PASSED_READY_FOR_VALIDATION_MANIFEST",
                "release_approved": False,
                "dataset": {
                    "version": "v1.0",
                    "file": "release.json",
                    "sha256": sha256(dataset),
                    "record_count": 1,
                },
                "source": {
                    "candidate": "candidate.json",
                    "candidate_sha256": sha256(source),
                },
            }
        ),
        encoding="utf-8",
    )
    manifest_path.write_text(
        json.dumps(
            {
                "release_status": "APPROVED_DATASET_ARTIFACT",
                "release_approved": True,
                "dataset": {
                    "version": "v1.0",
                    "file": "release.json",
                    "path": "release.json",
                    "sha256": sha256(dataset),
                    "record_count": 1,
                },
                "source": {
                    "candidate": "candidate.json",
                    "candidate_sha256": sha256(source),
                    "pipeline_config_sha256": sha256(config_path),
                    "generation_record": "generation.json",
                    "generation_record_sha256": sha256(generation_path),
                },
                "validation": {
                    "status": "PASS",
                    "total_records": 1,
                    "valid_records": 1,
                    "invalid_records": 0,
                    "dataset_errors": [],
                    "required_reviews": [],
                },
            }
        ),
        encoding="utf-8",
    )

    assert verify_approved_release_artifact(pipeline, tmp_path)["version"] == "v1.0"
    dataset.write_text('[{"barcode":"87654321"}]', encoding="utf-8")
    with pytest.raises(ValueError, match="dataset SHA-256"):
        verify_approved_release_artifact(pipeline, tmp_path)


def test_pipeline_prefers_verified_release_over_raw_enrichment(tmp_path, monkeypatch):
    actual_output = tmp_path / "candidate.json"
    approved_output = tmp_path / "release.json"
    observed = {}
    monkeypatch.setattr(
        run_pipeline,
        "run_enrich_stage",
        lambda **_kwargs: {
            "processed": 1,
            "failures": 0,
            "output": str(actual_output),
            "modules_run": [],
        },
    )
    monkeypatch.setattr(
        run_pipeline,
        "verify_approved_release_artifact",
        lambda *_args, **_kwargs: {
            "seed_input": str(approved_output),
            "version": "v1.0",
            "dataset_sha256": "a" * 64,
        },
    )

    def fake_seed(input_path, config):
        observed["input_path"] = input_path
        observed["config_input"] = config["input"]
        return {"processed": 1, "failures": 0, "output": str(approved_output)}

    monkeypatch.setattr(run_pipeline, "run_seed_stage", fake_seed)
    run_pipeline.runPipeline(
        config={
            "pipeline": {
                "fail_on_error": True,
                "outputs": {
                    "metadata": str(tmp_path / "metadata.json"),
                    "checkpoints": str(tmp_path / "checkpoints.json"),
                },
                "clean": {"enabled": False},
                "enrich": {
                    "enabled": True,
                    "input": str(tmp_path / "input.json"),
                    "output": str(actual_output),
                    "modules": [],
                },
                "release": {
                    "version": "v1.0",
                    "source": str(actual_output),
                    "dataset": str(approved_output),
                    "manifest": str(tmp_path / "manifest.json"),
                    "sha256": "a" * 64,
                },
                "seed": {"enabled": True, "input": str(approved_output)},
            }
        },
        dry_run=True,
    )
    assert observed == {
        "input_path": str(approved_output),
        "config_input": str(approved_output),
    }
