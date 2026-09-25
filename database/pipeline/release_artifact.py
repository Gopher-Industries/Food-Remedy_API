"""Verify the immutable release artifact selected for the seed stage."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def _absolute(root: Path, value: str) -> Path:
    path = Path(value)
    return path.resolve() if path.is_absolute() else (root / path).resolve()


def _relative(root: Path, path: Path) -> str:
    try:
        return path.relative_to(root.resolve()).as_posix()
    except ValueError:
        return str(path)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_approved_release_artifact(
    pipeline: dict[str, Any],
    root: Path,
    actual_enrich_output: str | None = None,
) -> dict[str, Any]:
    """Return the approved seed path or raise when any provenance binding drifts."""
    release = pipeline.get("release")
    if not isinstance(release, dict):
        raise ValueError("Versioned seed input requires a pipeline.release binding")

    required = {"version", "source", "dataset", "manifest", "sha256"}
    missing = sorted(required - set(release))
    if missing:
        raise ValueError(f"pipeline.release is missing: {', '.join(missing)}")

    source = _absolute(root, release["source"])
    dataset = _absolute(root, release["dataset"])
    manifest_path = _absolute(root, release["manifest"])
    enrich_output = _absolute(root, pipeline["enrich"]["output"])
    seed_input = _absolute(root, pipeline["seed"]["input"])
    if source != enrich_output:
        raise ValueError("Release source does not match configured enrichment output")
    if actual_enrich_output and source != _absolute(root, actual_enrich_output):
        raise ValueError("Release source does not match the enrichment output just produced")
    if dataset != seed_input:
        raise ValueError("Approved release dataset does not match configured seed input")
    if not source.is_file() or not dataset.is_file() or not manifest_path.is_file():
        raise ValueError("Release source, dataset or manifest is missing")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (
        manifest.get("release_status") != "APPROVED_DATASET_ARTIFACT"
        or manifest.get("release_approved") is not True
    ):
        raise ValueError("Release manifest does not approve the dataset artifact")
    if manifest.get("dataset", {}).get("version") != release["version"]:
        raise ValueError("Release version does not match the manifest")
    if manifest.get("dataset", {}).get("file") != dataset.name:
        raise ValueError("Release dataset filename does not match the manifest")
    if manifest.get("dataset", {}).get("path") != _relative(root, dataset):
        raise ValueError("Release dataset path does not match the manifest")
    if manifest.get("source", {}).get("candidate") != _relative(root, source):
        raise ValueError("Release source path does not match the manifest")

    dataset_sha = _sha256(dataset)
    source_sha = _sha256(source)
    if dataset_sha != release["sha256"]:
        raise ValueError("Release dataset SHA-256 does not match pipeline configuration")
    if dataset_sha != manifest.get("dataset", {}).get("sha256"):
        raise ValueError("Release dataset SHA-256 does not match the manifest")
    if source_sha != manifest.get("source", {}).get("candidate_sha256"):
        raise ValueError("Enriched source SHA-256 does not match the approved manifest")

    generation_value = manifest.get("source", {}).get("generation_record")
    if not isinstance(generation_value, str):
        raise ValueError("Release manifest does not identify its DB064 generation record")
    generation_path = _absolute(root, generation_value)
    if not generation_path.is_file():
        raise ValueError("DB064 generation record is missing")
    if _sha256(generation_path) != manifest.get("source", {}).get(
        "generation_record_sha256"
    ):
        raise ValueError("DB064 generation record SHA-256 does not match the manifest")

    generation = json.loads(generation_path.read_text(encoding="utf-8"))
    if generation.get("generation_status") != (
        "CHECKS_PASSED_READY_FOR_VALIDATION_MANIFEST"
    ):
        raise ValueError("DB064 generation record is not ready for final validation")
    if generation.get("release_approved") is not False:
        raise ValueError("DB064 generation record crossed the DB065 approval boundary")
    for field in ("version", "file", "sha256", "record_count"):
        if generation.get("dataset", {}).get(field) != manifest.get("dataset", {}).get(
            field
        ):
            raise ValueError(f"Release dataset {field} does not match DB064 evidence")
    if generation.get("source", {}).get("candidate") != _relative(root, source):
        raise ValueError("Release source path does not match DB064 evidence")
    if generation.get("source", {}).get("candidate_sha256") != source_sha:
        raise ValueError("Release source SHA-256 does not match DB064 evidence")

    validation = manifest.get("validation", {})
    if (
        validation.get("status") != "PASS"
        or validation.get("total_records") != manifest.get("dataset", {}).get("record_count")
        or validation.get("valid_records") != manifest.get("dataset", {}).get("record_count")
        or validation.get("invalid_records") != 0
        or validation.get("dataset_errors")
        or validation.get("required_reviews")
    ):
        raise ValueError("Release validation result does not approve every artifact record")

    config_path = root / "database/pipeline/pipeline.config.json"
    if (
        config_path.is_file()
        and _sha256(config_path)
        != manifest.get("source", {}).get("pipeline_config_sha256")
    ):
        raise ValueError("Pipeline configuration SHA-256 does not match the manifest")

    return {
        "seed_input": str(dataset),
        "version": release["version"],
        "dataset_sha256": dataset_sha,
        "source_sha256": source_sha,
        "manifest": _relative(root, manifest_path),
    }
