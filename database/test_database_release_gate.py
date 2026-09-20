"""Failure-injection and contract tests for the database release gate."""

from __future__ import annotations

import json
import hashlib
from pathlib import Path

import pytest

from database.pipeline import run_pipeline
from database.pipeline.release_artifact import verify_approved_release_artifact
from database.pipeline.stages.enrich_stage import run_enrich_stage
from database.seeding import seed_firestore
from database.seeding.checkpoint_manager import (
    CheckpointCompatibilityError,
    CheckpointManager,
)
from database.seeding.data_contract import PRODUCTS_COLLECTION
from scripts import database_release_gate as gate


ROOT = Path(__file__).resolve().parents[1]


def test_structural_gate_passes_current_contracts():
    report = gate.run_gate(
        mode="structural",
        dataset=ROOT / "database/seeding/products_enriched.json",
    )
    assert report["status"] == "PASS"
    assert {item["check_id"] for item in report["checks"]} == {
        "firestore_collection_contract",
        "pipeline_artifact_handoff",
        "seed_checkpoint_safety",
        "sqlite_legacy_upgrade",
    }


def test_collection_scanner_exposes_case_sensitive_regression(tmp_path):
    app = tmp_path / "mobile-app/app/api/products"
    app.mkdir(parents=True)
    source = app / "route.ts"
    source.write_text('const ref = doc(fdb, "products", barcode);', encoding="utf-8")

    assert gate._typescript_product_collection_uses(tmp_path) == [
        {
            "path": "mobile-app/app/api/products/route.ts",
            "line": 1,
            "collection": "products",
        }
    ]


def test_enrichment_module_cannot_claim_a_missing_output(tmp_path):
    source = tmp_path / "input.json"
    target = tmp_path / "target.json"
    module = tmp_path / "missing_output.py"
    source.write_text('[{"barcode":"12345678"}]', encoding="utf-8")
    module.write_text(
        "def run(input_path, output_path, config):\n"
        "    return {'processed': 1, 'failures': 0, 'output': config['missing']}\n",
        encoding="utf-8",
    )

    result = run_enrich_stage(
        str(source),
        str(target),
        {
            "modules": [
                {
                    "name": "missing_output",
                    "path": str(module),
                    "config": {"missing": str(tmp_path / "never-created.json")},
                }
            ]
        },
    )

    assert result["failures"] == 1
    assert result["modules_run"][0]["status"] == "failed"
    assert "reported success" in result["modules_run"][0]["error"]


def test_checkpoint_refuses_gap_and_different_dataset(tmp_path):
    checkpoint = CheckpointManager(str(tmp_path / "checkpoint.json"))
    checkpoint.bind_run(
        dataset_sha256="a" * 64,
        total_records=30,
        batch_size=10,
        collection=PRODUCTS_COLLECTION,
    )
    checkpoint.mark_batch_success(0, 10)
    checkpoint.mark_batch_failure(1, "injected")

    with pytest.raises(ValueError, match="batch 1 must succeed first"):
        checkpoint.mark_batch_success(2, 10)
    assert checkpoint.get_resume_info()["next_batch_index"] == 1

    with pytest.raises(CheckpointCompatibilityError, match="different dataset"):
        checkpoint.bind_run(
            dataset_sha256="b" * 64,
            total_records=30,
            batch_size=10,
            collection=PRODUCTS_COLLECTION,
        )


def test_legacy_checkpoint_requires_explicit_reset(tmp_path):
    path = tmp_path / "checkpoint.json"
    path.write_text('{"last_batch_index": 10}', encoding="utf-8")
    checkpoint = CheckpointManager(str(path))

    with pytest.raises(CheckpointCompatibilityError, match="Legacy checkpoint"):
        checkpoint.bind_run(
            dataset_sha256="a" * 64,
            total_records=5000,
            batch_size=500,
            collection=PRODUCTS_COLLECTION,
        )

    checkpoint.reset()
    checkpoint.bind_run(
        dataset_sha256="a" * 64,
        total_records=5000,
        batch_size=500,
        collection=PRODUCTS_COLLECTION,
    )
    assert checkpoint.get_resume_info()["next_batch_index"] == 0


class _FakeDocument:
    def __init__(self, identifier: str):
        self.identifier = identifier


class _FakeCollection:
    def __init__(self, database, name: str):
        self.database = database
        self.name = name

    def document(self, identifier: str):
        self.database.document_requests.append((self.name, identifier))
        return _FakeDocument(identifier)


class _FakeBatch:
    def __init__(self, index: int):
        self.index = index
        self.writes = []

    def set(self, reference, product, merge=True):
        self.writes.append((reference.identifier, product, merge))


class _FakeFirestore:
    def __init__(self):
        self.batches = []
        self.document_requests = []

    def batch(self):
        batch = _FakeBatch(len(self.batches))
        self.batches.append(batch)
        return batch

    def collection(self, name: str):
        return _FakeCollection(self, name)


class _NoWaitRateLimiter:
    def __init__(self, _rate):
        pass

    def acquire(self, *_args, **_kwargs):
        pass

    def on_success(self):
        pass

    def on_quota_error(self):
        pass


def test_failed_middle_batch_stops_and_resumes_same_batch(tmp_path, monkeypatch):
    source = tmp_path / "candidate.json"
    output = tmp_path / "seeded.json"
    checkpoint_path = tmp_path / "checkpoint.json"
    records = [
        {"barcode": f"1234567{index}", "productName": f"Product {index}"}
        for index in range(6)
    ]
    source.write_text(json.dumps(records), encoding="utf-8")
    first_database = _FakeFirestore()

    monkeypatch.setattr(seed_firestore, "get_firestore_client", lambda: first_database)
    monkeypatch.setattr(seed_firestore, "AdaptiveRateLimiter", _NoWaitRateLimiter)
    monkeypatch.setattr(seed_firestore.DEFAULT_RETRY, "max_retries", 0)

    def fail_second_batch(batch):
        if batch.index == 1:
            raise RuntimeError("permission denied: injected failure")

    monkeypatch.setattr(seed_firestore, "commit_batch", fail_second_batch)
    config = {
        "batch_size": 2,
        "writes_per_second_limit": 100,
        "max_retries": 0,
        "validate_before_seed": False,
        "checkpoint_file": str(checkpoint_path),
    }
    failed = seed_firestore.run(str(source), str(output), config)

    assert failed["failures"] == 1
    assert failed["output"] is None
    assert not output.exists()
    assert len(first_database.batches) == 2
    assert {name for name, _ in first_database.document_requests} == {"PRODUCTS"}
    checkpoint = CheckpointManager(str(checkpoint_path))
    assert checkpoint.get_resume_info()["next_batch_index"] == 1

    resumed_database = _FakeFirestore()
    monkeypatch.setattr(seed_firestore, "get_firestore_client", lambda: resumed_database)
    monkeypatch.setattr(seed_firestore, "commit_batch", lambda _batch: None)
    completed = seed_firestore.run(str(source), str(output), config)

    assert completed["failures"] == 0
    assert output.exists()
    assert resumed_database.document_requests[0] == ("PRODUCTS", "12345672")
    assert [identifier for _, identifier in resumed_database.document_requests] == [
        "12345672",
        "12345673",
        "12345674",
        "12345675",
    ]
    assert CheckpointManager(str(checkpoint_path)).get_resume_info()["next_batch_index"] == 3


def test_pipeline_passes_reported_enrichment_output_to_seed(tmp_path, monkeypatch):
    actual_output = tmp_path / "actual.json"
    configured_output = tmp_path / "configured.json"
    metadata = tmp_path / "metadata.json"
    checkpoints = tmp_path / "checkpoints.json"
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

    def fake_seed(input_path, config):
        observed["input_path"] = input_path
        observed["config_input"] = config["input"]
        return {"processed": 1, "failures": 0, "output": str(actual_output)}

    monkeypatch.setattr(run_pipeline, "run_seed_stage", fake_seed)
    run_pipeline.runPipeline(
        config={
            "pipeline": {
                "fail_on_error": True,
                "outputs": {
                    "metadata": str(metadata),
                    "checkpoints": str(checkpoints),
                },
                "clean": {"enabled": False},
                "enrich": {
                    "enabled": True,
                    "input": str(tmp_path / "input.json"),
                    "output": str(configured_output),
                    "modules": [],
                },
                "seed": {
                    "enabled": True,
                    "input": str(configured_output),
                    "dry_run": True,
                },
            }
        },
        dry_run=True,
    )

    assert observed == {
        "input_path": str(actual_output),
        "config_input": str(actual_output),
    }


def test_pipeline_prefers_verified_versioned_release_over_raw_enrichment(
    tmp_path, monkeypatch
):
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


def test_release_binding_detects_artifact_tampering(tmp_path):
    source = tmp_path / "candidate.json"
    dataset = tmp_path / "release.json"
    manifest_path = tmp_path / "manifest.json"
    config_path = tmp_path / "database/pipeline/pipeline.config.json"
    config_path.parent.mkdir(parents=True)
    source.write_text('[{"barcode":"12345678"}]')
    dataset.write_text('[{"barcode":"12345678"}]')
    pipeline = {
        "enrich": {"output": "candidate.json"},
        "release": {
            "version": "v1.0",
            "source": "candidate.json",
            "dataset": "release.json",
            "manifest": "manifest.json",
            "sha256": hashlib.sha256(dataset.read_bytes()).hexdigest(),
        },
        "seed": {"input": "release.json"},
    }
    config_path.write_text(json.dumps({"pipeline": pipeline}))
    manifest_path.write_text(json.dumps({
        "release_status": "APPROVED_DATASET_ARTIFACT",
        "release_approved": True,
        "dataset": {
            "version": "v1.0",
            "file": "release.json",
            "sha256": hashlib.sha256(dataset.read_bytes()).hexdigest(),
        },
        "source": {
            "candidate": "candidate.json",
            "candidate_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "pipeline_config_sha256": hashlib.sha256(config_path.read_bytes()).hexdigest(),
        },
    }))

    verified = verify_approved_release_artifact(pipeline, tmp_path)
    assert verified["version"] == "v1.0"
    dataset.write_text('[{"barcode":"87654321"}]')
    with pytest.raises(ValueError, match="dataset SHA-256"):
        verify_approved_release_artifact(pipeline, tmp_path)


def test_partial_stage_result_is_rejected_before_completed_checkpoint():
    with pytest.raises(RuntimeError, match="reported 2 failure"):
        run_pipeline._require_successful_stage_result(
            "enrich", {"processed": 8, "failures": 2}
        )


def test_sqlite_upgrade_probe_preserves_legacy_history():
    result = gate.check_sqlite_legacy_upgrade()
    assert result.status == "PASS", result.evidence


def test_current_candidate_remains_honestly_blocked():
    result = gate.check_release_dataset(
        ROOT / "database/seeding/products_enriched.json"
    )
    assert result.status == "BLOCKED"
    assert any("invalid=269" in item for item in result.evidence)
