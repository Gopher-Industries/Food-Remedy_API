#!/usr/bin/env python3
"""Generate and validate the DB070 quality-first database release v1.1.

The workflow is deliberately offline and database-only. It binds the release
to the reviewed DB069 candidate SHA-256, canonicalises that candidate without
inventing missing values, runs every configured enrichment module, performs
semantic and DB060 validation, writes provenance/delta ledgers, and repeats the
build in an isolated directory to prove deterministic output. It never calls
an API, changes Firestore rules, seeds production, or updates the application.
"""

from __future__ import annotations

import argparse
import contextlib
import copy
import hashlib
import io
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database.pipeline.stages.enrich_stage import run_enrich_stage
from scripts.db059_category_audit import audit as category_audit
from scripts.db060_release_validation import validate as db060_validate
from scripts.db069_build_quality_candidate import row_metrics


TICKET = "DB070"
VERSION = "v1.1"
EXPECTED_CANDIDATE_SHA256 = (
    "ffc2d26e4cc1fdaa8e1754e209f0be0b7fe7b93784b743b47911180d52b67ced"
)
DEFAULT_CANDIDATE = (
    ROOT / "database/Candidates/DB069/foodremedy_candidate_db069.json"
)
DEFAULT_CANDIDATE_RECORD = ROOT / "database/Candidates/DB069/generation_record.json"
DEFAULT_BASELINE = ROOT / "database/Release/v1.0/foodremedy_release_v1.0.json"
DEFAULT_CONFIG = ROOT / "database/pipeline/pipeline.config.json"
DEFAULT_QUALITY_CONFIG = ROOT / "database/Candidates/db069_candidate_config.json"
DEFAULT_OUTPUT = ROOT / "database/Release/v1.1"
BARCODE_PATTERN = re.compile(r"^[0-9]+$")
VALID_BARCODE_LENGTHS = {8, 12, 13, 14}
PLACEHOLDER_NAMES = {"", "nan", "null", "none", "n/a", "unknown"}
DERIVED_TOP_LEVEL_FIELDS = {"dietTags", "lifestyleTags", "moodTags", "riskTags"}
NUTRIENT_FIELDS = {
    "energy_kcal": ("energy-kcal_100g",),
    "fat": ("fat_100g",),
    "saturated_fat": ("saturated-fat_100g", "saturated_fat_100g"),
    "carbohydrates": ("carbohydrates_100g",),
    "sugars": ("sugars_100g",),
    "protein": ("proteins_100g", "protein_100g"),
    "fibre": ("fiber_100g", "fibre_100g"),
    "salt": ("salt_100g",),
    "sodium": ("sodium_100g",),
}


def canonical_json(value: Any, *, indent: int | None = 2) -> bytes:
    text = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        indent=indent,
        separators=None if indent is not None else (",", ":"),
    )
    return (text + "\n").encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def repo_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path.resolve())


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(canonical_json(value))


def jsonl_bytes(rows: Iterable[dict[str, Any]]) -> bytes:
    return b"".join(canonical_json(row, indent=None) for row in rows)


def git_commit() -> str | None:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except Exception:
        return None


def valid_barcode(value: Any) -> bool:
    return (
        isinstance(value, str)
        and BARCODE_PATTERN.fullmatch(value) is not None
        and len(value) in VALID_BARCODE_LENGTHS
    )


def usable_name(value: Any) -> bool:
    return isinstance(value, str) and value.strip().casefold() not in PLACEHOLDER_NAMES


def numeric_value(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def canonicalize_candidate(
    records: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Validate and canonicalise the DB069 handoff without fabricating data."""
    cleaned: list[dict[str, Any]] = []
    seen: set[str] = set()
    leading_zeroes = 0
    unknown_allergens = 0
    removed_derived_fields = Counter()

    for index, source in enumerate(records):
        if not isinstance(source, dict):
            raise ValueError(f"Candidate row {index} is not an object")
        record = copy.deepcopy(source)
        barcode = record.get("barcode")
        if not valid_barcode(barcode):
            raise ValueError(f"Candidate row {index} has invalid barcode {barcode!r}")
        if barcode in seen:
            raise ValueError(f"Candidate contains duplicate barcode {barcode!r}")
        seen.add(barcode)
        leading_zeroes += int(barcode.startswith("0"))

        name = record.get("productName")
        if not usable_name(name):
            raise ValueError(f"Candidate row {index} has unusable productName {name!r}")
        record["productName"] = name.strip()

        if not isinstance(record.get("nutriments"), dict):
            raise ValueError(f"Candidate row {index} has invalid nutriments structure")
        if not isinstance(record.get("ingredients"), list):
            raise ValueError(f"Candidate row {index} has invalid ingredients structure")
        if not isinstance(record.get("categories"), list):
            raise ValueError(f"Candidate row {index} has invalid categories structure")

        allergens = record.get("allergens")
        if allergens in (None, []):
            allergens = ["Unknown"]
        if (
            not isinstance(allergens, list)
            or not allergens
            or any(not isinstance(value, str) or not value.strip() for value in allergens)
        ):
            raise ValueError(f"Candidate row {index} has invalid allergen structure")
        allergens = [value.strip() for value in allergens]
        if any(value.casefold() == "unknown" for value in allergens):
            if len(allergens) != 1:
                raise ValueError(f"Candidate row {index} mixes Unknown with known allergens")
            allergens = ["Unknown"]
            unknown_allergens += 1
        record["allergens"] = allergens
        record["allergensDetected"] = list(allergens)

        if "enrichment" in record:
            record.pop("enrichment")
            removed_derived_fields["enrichment"] += 1
        for field in DERIVED_TOP_LEVEL_FIELDS:
            if field in record:
                record.pop(field)
                removed_derived_fields[field] += 1
        cleaned.append(record)

    return cleaned, {
        "status": "PASS",
        "input_records": len(records),
        "output_records": len(cleaned),
        "excluded_records": 0,
        "unique_valid_barcodes": len(seen),
        "leading_zero_barcodes_preserved": leading_zeroes,
        "conservative_unknown_allergen_records": unknown_allergens,
        "removed_stale_derived_fields": dict(sorted(removed_derived_fields.items())),
        "missing_value_policy": (
            "Source nulls and absent nutrient keys are preserved; numeric zero is never "
            "substituted for missing evidence. Only a genuinely absent allergen state may "
            "be normalised to the conservative ['Unknown'] value."
        ),
    }


def resolve_module_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ROOT / "database" / path


def effective_enrich_config(config: dict[str, Any], build_dir: Path) -> dict[str, Any]:
    enrich = copy.deepcopy(config["pipeline"]["enrich"])
    for module in enrich.get("modules", []):
        if module.get("name") == "db019_alternative_product_mapping":
            module.setdefault("config", {})["sidecar_index_path"] = str(
                build_dir / "product_alternatives_v1.1.json"
            )
    return enrich


def module_versions(config: dict[str, Any]) -> list[dict[str, Any]]:
    versions = []
    for module in config["pipeline"]["enrich"].get("modules", []):
        path = resolve_module_path(str(module["path"]))
        versions.append({
            "name": module.get("name"),
            "enabled": bool(module.get("enabled", True)),
            "path": repo_path(path),
            "sha256": sha256_file(path),
            "config": module.get("config", {}),
        })
    return versions


def release_fingerprint(
    candidate_sha256: str,
    config_sha256: str,
    modules: list[dict[str, Any]],
) -> str:
    stable_modules = [
        {"name": item["name"], "enabled": item["enabled"], "sha256": item["sha256"],
         "config": item["config"]}
        for item in modules
    ]
    return sha256_bytes(canonical_json({
        "ticket": TICKET,
        "version": VERSION,
        "candidate_sha256": candidate_sha256,
        "pipeline_config_sha256": config_sha256,
        "modules": stable_modules,
    }, indent=None))


def assert_checkpoint_compatible(checkpoint: dict[str, Any], fingerprint: str) -> None:
    if checkpoint.get("release_fingerprint") != fingerprint:
        raise ValueError("Checkpoint is incompatible with the bound DB070 release inputs")


def quiet_validate(records: list[dict[str, Any]]) -> dict[str, Any]:
    with contextlib.redirect_stdout(io.StringIO()):
        return db060_validate(records)


def allergen_audit(records: list[dict[str, Any]]) -> dict[str, Any]:
    known = unknown = 0
    for index, record in enumerate(records):
        allergens = record.get("allergens")
        if allergens != record.get("allergensDetected"):
            raise ValueError(f"Allergen compatibility fields differ at release row {index}")
        if not isinstance(allergens, list) or not allergens:
            raise ValueError(f"Empty allergen state at release row {index}")
        if "Unknown" in allergens:
            if allergens != ["Unknown"]:
                raise ValueError(f"Mixed Unknown allergen state at release row {index}")
            unknown += 1
        else:
            known += 1
    return {
        "status": "PASS",
        "known_evidence_records": known,
        "conservative_unknown_records": unknown,
        "empty_records": 0,
        "compatibility_field_mismatches": 0,
    }


def alternative_audit(records: list[dict[str, Any]]) -> dict[str, Any]:
    barcodes = {record["barcode"] for record in records}
    references = 0
    records_without_similar = 0
    records_without_healthier = 0
    for index, record in enumerate(records):
        alternatives = ((record.get("enrichment") or {}).get("alternatives") or {})
        records_without_similar += int(not alternatives.get("similar"))
        records_without_healthier += int(not alternatives.get("healthier"))
        for kind in ("similar", "healthier"):
            for peer in alternatives.get(kind, []):
                references += 1
                peer_barcode = peer.get("barcode")
                if peer_barcode not in barcodes:
                    raise ValueError(
                        f"Dangling {kind} reference {peer_barcode!r} at release row {index}"
                    )
                if peer_barcode == record["barcode"]:
                    raise ValueError(f"Self-referencing {kind} alternative at row {index}")
    return {
        "status": "PASS",
        "references_checked": references,
        "dangling_references": 0,
        "self_references": 0,
        "records_without_similar": records_without_similar,
        "records_without_healthier": records_without_healthier,
    }


def nutrition_audit(
    candidate: list[dict[str, Any]], release: list[dict[str, Any]]
) -> dict[str, Any]:
    candidate_by_barcode = {item["barcode"]: item for item in candidate}
    missing = Counter()
    known_counts = Counter()
    insufficient = 0
    negative_or_nonfinite = 0
    preservation_failures = 0
    for index, record in enumerate(release):
        original = candidate_by_barcode[record["barcode"]]
        nutriments = record.get("nutriments", {})
        if nutriments != original.get("nutriments", {}):
            preservation_failures += 1
        for value in nutriments.values():
            if (
                isinstance(value, (int, float))
                and not isinstance(value, bool)
                and (not math.isfinite(float(value)) or float(value) < 0)
            ):
                negative_or_nonfinite += 1
        known = 0
        for field, keys in NUTRIENT_FIELDS.items():
            if any(numeric_value(nutriments.get(key)) is not None for key in keys):
                known += 1
            else:
                missing[field] += 1
        known_counts[known] += 1

        nutrition = ((record.get("enrichment") or {}).get("nutrition") or {})
        if not nutrition.get("sufficientDataForScore"):
            insufficient += 1
            if nutrition.get("compositeScore") is not None or nutrition.get("healthScore") is not None:
                raise ValueError(f"Derived score was published with insufficient data at row {index}")
            if nutrition.get("healthLabel") != "InsufficientData":
                raise ValueError(f"Insufficient-data label missing at release row {index}")
    if preservation_failures:
        raise ValueError(f"Enrichment changed nutriments in {preservation_failures} records")
    if negative_or_nonfinite:
        raise ValueError("Release contains negative or non-finite nutrient values")
    return {
        "status": "PASS",
        "nutriment_objects_preserved": len(release),
        "nutriment_preservation_failures": 0,
        "negative_or_nonfinite_values": 0,
        "missing_field_counts": dict(sorted(missing.items())),
        "known_core_field_distribution": {
            str(key): value for key, value in sorted(known_counts.items())
        },
        "insufficient_data_records_with_scores_withheld": insufficient,
        "null_semantics": (
            "Candidate nutrient objects are byte-for-value preserved through enrichment; "
            "missing/null evidence is not converted to numeric zero."
        ),
    }


def identity_audit(
    candidate: list[dict[str, Any]], release: list[dict[str, Any]]
) -> dict[str, Any]:
    source_barcodes = [record["barcode"] for record in candidate]
    release_barcodes = [record.get("barcode") for record in release]
    if source_barcodes != release_barcodes:
        raise ValueError("Release record identity/order differs from the DB069 candidate")
    if len(set(release_barcodes)) != len(release_barcodes):
        raise ValueError("Release contains duplicate barcodes")
    if any(not valid_barcode(value) for value in release_barcodes):
        raise ValueError("Release contains an invalid barcode")
    if any(not usable_name(record.get("productName")) for record in release):
        raise ValueError("Release contains a missing or placeholder product name")
    return {
        "status": "PASS",
        "record_count": len(release),
        "valid_unique_barcodes": len(release_barcodes),
        "leading_zero_barcodes": sum(value.startswith("0") for value in release_barcodes),
        "usable_product_names": len(release),
        "candidate_identity_and_order_preserved": True,
    }


def stable_enrichment_report(result: dict[str, Any]) -> dict[str, Any]:
    modules = []
    for entry in result.get("modules_run", []):
        item = {
            "module": entry.get("module"),
            "status": entry.get("status"),
        }
        reported = entry.get("result")
        if isinstance(reported, dict):
            item["processed"] = reported.get("processed")
            item["failures"] = reported.get("failures") or 0
            if isinstance(reported.get("stats"), dict):
                item["stats"] = {
                    key: value for key, value in reported["stats"].items()
                    if key != "sidecar_index"
                }
        modules.append(item)
    return {
        "status": "PASS",
        "processed": result.get("processed"),
        "failures": result.get("failures") or 0,
        "modules": modules,
    }


def delta_report(
    baseline: list[dict[str, Any]], release: list[dict[str, Any]]
) -> dict[str, Any]:
    old = {item["barcode"]: item for item in baseline}
    new = {item["barcode"]: item for item in release}
    added = sorted(set(new) - set(old))
    removed = sorted(set(old) - set(new))
    updated: list[dict[str, Any]] = []
    unchanged: list[str] = []
    for barcode in sorted(set(old) & set(new)):
        old_hash = sha256_bytes(canonical_json(old[barcode], indent=None))
        new_hash = sha256_bytes(canonical_json(new[barcode], indent=None))
        if old_hash == new_hash:
            unchanged.append(barcode)
            continue
        fields = sorted(
            key for key in set(old[barcode]) | set(new[barcode])
            if old[barcode].get(key) != new[barcode].get(key)
        )
        updated.append({
            "barcode": barcode,
            "v1.0_record_sha256": old_hash,
            "v1.1_record_sha256": new_hash,
            "changed_top_level_fields": fields,
        })
    return {
        "schema": "food-remedy-release-delta-v1",
        "from_version": "v1.0",
        "to_version": VERSION,
        "summary": {
            "v1.0_records": len(baseline),
            "v1.1_records": len(release),
            "added": len(added),
            "updated": len(updated),
            "removed": len(removed),
            "unchanged": len(unchanged),
        },
        "added_barcodes": added,
        "removed_barcodes": removed,
        "updated_records": updated,
        "unchanged_barcodes": unchanged,
    }


def comparison_report(
    baseline: list[dict[str, Any]],
    release: list[dict[str, Any]],
    quality_config: dict[str, Any],
) -> dict[str, Any]:
    old = row_metrics(baseline, quality_config)
    new = row_metrics(release, quality_config)
    fields = (
        "valid_identity", "ingredients", "nutrition_any_core", "nutrition_all_core",
        "categories", "brands", "known_allergen_evidence", "images",
    )
    return {
        "schema": "food-remedy-quality-comparison-v1",
        "baseline": {"version": "v1.0", "records": len(baseline)},
        "release": {"version": VERSION, "records": len(release)},
        "metrics": {
            field: {
                "v1.0_count": old[field]["count"],
                "v1.0_rate": old[field]["rate"],
                "v1.1_count": new[field]["count"],
                "v1.1_rate": new[field]["rate"],
                "rate_delta": round(new[field]["rate"] - old[field]["rate"], 6),
            }
            for field in fields
        },
        "v1.0_quality_tiers": old["quality_tiers"],
        "v1.1_quality_tiers": new["quality_tiers"],
    }


def load_bound_inputs(
    candidate_path: Path,
    candidate_record_path: Path,
    baseline_path: Path,
    config_path: Path,
    quality_config_path: Path,
) -> dict[str, Any]:
    candidate_raw = candidate_path.read_bytes()
    candidate_sha = sha256_bytes(candidate_raw)
    if candidate_sha != EXPECTED_CANDIDATE_SHA256:
        raise ValueError(
            "DB069 candidate SHA-256 mismatch: "
            f"expected {EXPECTED_CANDIDATE_SHA256}, got {candidate_sha}"
        )
    candidate_generation_raw = candidate_record_path.read_bytes()
    generation = json.loads(candidate_generation_raw)
    if generation.get("ticket") != "DB069" or generation.get("candidate", {}).get("sha256") != candidate_sha:
        raise ValueError("DB069 generation record does not bind the supplied candidate")
    if generation.get("status") != "CHECKS_PASSED_CANDIDATE_READY_FOR_DB070":
        raise ValueError("DB069 candidate is not marked ready for DB070")

    candidate = json.loads(candidate_raw)
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    if not isinstance(candidate, list) or any(not isinstance(item, dict) for item in candidate):
        raise ValueError("DB069 candidate must be a JSON array of objects")
    if not isinstance(baseline, list) or any(not isinstance(item, dict) for item in baseline):
        raise ValueError("v1.0 baseline must be a JSON array of objects")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    quality_config = json.loads(quality_config_path.read_text(encoding="utf-8"))
    modules = module_versions(config)
    fingerprint = release_fingerprint(candidate_sha, sha256_file(config_path), modules)
    return {
        "candidate": candidate,
        "candidate_sha256": candidate_sha,
        "candidate_generation": generation,
        "candidate_generation_record_sha256": sha256_bytes(candidate_generation_raw),
        "baseline": baseline,
        "baseline_sha256": sha256_file(baseline_path),
        "config": config,
        "config_sha256": sha256_file(config_path),
        "quality_config": quality_config,
        "quality_config_sha256": sha256_file(quality_config_path),
        "modules": modules,
        "fingerprint": fingerprint,
    }


def build_once(
    *,
    build_dir: Path,
    inputs: dict[str, Any],
    generated_at: str,
    release_date: str,
    generation_base_commit: str | None,
) -> dict[str, str]:
    build_dir.mkdir(parents=True, exist_ok=False)
    cleaned, cleaning = canonicalize_candidate(inputs["candidate"])
    cleaned_path = build_dir / ".db070_cleaned_candidate.json"
    write_json(cleaned_path, cleaned)

    release_name = "foodremedy_release_v1.1.json"
    release_path = build_dir / release_name
    enrich_result = run_enrich_stage(
        str(cleaned_path),
        str(release_path),
        effective_enrich_config(inputs["config"], build_dir),
    )
    enrichment = stable_enrichment_report(enrich_result)
    if enrichment["processed"] != len(cleaned) or enrichment["failures"] != 0:
        raise ValueError(f"Enrichment did not complete cleanly: {enrichment}")
    if any(item["status"] != "ok" for item in enrichment["modules"]):
        raise ValueError(f"One or more enrichment modules did not run: {enrichment}")
    if not release_path.is_file():
        source = Path(str(enrich_result.get("output")))
        if not source.is_file():
            raise ValueError("Enrichment did not produce the v1.1 dataset")
        shutil.copyfile(source, release_path)
    release = json.loads(release_path.read_text(encoding="utf-8"))
    if not isinstance(release, list) or len(release) != len(cleaned):
        raise ValueError("Enriched release does not contain the full DB069 candidate")

    identity = identity_audit(cleaned, release)
    allergens = allergen_audit(release)
    nutrition = nutrition_audit(cleaned, release)
    alternatives = alternative_audit(release)
    validation = quiet_validate(release)
    if validation["status"] != "CHECKS_PASSED_PENDING_APPROVAL":
        raise ValueError(f"DB060 validation failed: {validation['status']}")

    category = category_audit(release_path)
    comparison = comparison_report(inputs["baseline"], release, inputs["quality_config"])
    delta = delta_report(inputs["baseline"], release)

    write_json(build_dir / "cleaning_report.json", cleaning)
    write_json(build_dir / "enrichment_report.json", enrichment)
    write_json(build_dir / "db060_validation.json", validation)
    write_json(build_dir / "category_audit.json", category)
    write_json(build_dir / "unmapped_categories.json", {
        "schema": "food-remedy-unmapped-category-report-v1",
        "release_version": VERSION,
        "tagged_but_unmapped_records": category["tagged_but_unmapped"],
        "missing_category_tag_records": category["missing_category_tags"],
        "unmapped_tag_counts": category["unmapped_tag_counts"],
    })
    write_json(build_dir / "nutrition_audit.json", nutrition)
    write_json(build_dir / "quality_comparison_v1.0_to_v1.1.json", comparison)
    write_json(build_dir / "delta_v1.0_to_v1.1.json", delta)

    inclusion_rows = []
    for index, (source, product) in enumerate(zip(cleaned, release)):
        inclusion_rows.append({
            "candidate_index": index,
            "barcode": product["barcode"],
            "decision": "included",
            "reason": "DB069-approved candidate identity passed DB070 release validation",
            "candidate_record_sha256": sha256_bytes(canonical_json(source, indent=None)),
            "release_record_sha256": sha256_bytes(canonical_json(product, indent=None)),
        })
    (build_dir / "inclusion_ledger.jsonl").write_bytes(jsonl_bytes(inclusion_rows))
    (build_dir / "exclusion_ledger.jsonl").write_bytes(b"")

    artifact_names = [
        release_name,
        "product_alternatives_v1.1.json",
        "cleaning_report.json",
        "enrichment_report.json",
        "db060_validation.json",
        "category_audit.json",
        "unmapped_categories.json",
        "nutrition_audit.json",
        "quality_comparison_v1.0_to_v1.1.json",
        "delta_v1.0_to_v1.1.json",
        "inclusion_ledger.jsonl",
        "exclusion_ledger.jsonl",
    ]
    artifact_hashes = {name: sha256_file(build_dir / name) for name in artifact_names}
    manifest = {
        "schema": "food-remedy-database-release-manifest-v1",
        "ticket": TICKET,
        "release_version": VERSION,
        "status": "CHECKS_PASSED_DATABASE_RELEASE_READY_FOR_HANDOFF",
        "database_release_validated": True,
        "production_release_approved": False,
        "production_seeded": False,
        "generated_at_utc": generated_at,
        "release_date": release_date,
        "generation_base_commit": generation_base_commit,
        "dataset": {
            "file": release_name,
            "sha256": artifact_hashes[release_name],
            "records": len(release),
        },
        "source": {
            "candidate": "database/Candidates/DB069/foodremedy_candidate_db069.json",
            "candidate_sha256": inputs["candidate_sha256"],
            "candidate_records": len(inputs["candidate"]),
            "candidate_generation_record_sha256": inputs[
                "candidate_generation_record_sha256"
            ],
            "baseline_release": "database/Release/v1.0/foodremedy_release_v1.0.json",
            "baseline_release_sha256": inputs["baseline_sha256"],
        },
        "configuration": {
            "pipeline_config": "database/pipeline/pipeline.config.json",
            "pipeline_config_sha256": inputs["config_sha256"],
            "quality_config": "database/Candidates/db069_candidate_config.json",
            "quality_config_sha256": inputs["quality_config_sha256"],
            "release_fingerprint": inputs["fingerprint"],
            "checkpoint_policy": "ISOLATED_BUILD_NO_CHECKPOINT_REUSE",
            "modules": inputs["modules"],
        },
        "validation": {
            "db060_status": validation["status"],
            "valid_records": validation["valid_records"],
            "invalid_records": validation["invalid_records"],
            "dataset_errors": validation["dataset_errors"],
            "required_reviews": validation["required_reviews"],
            "identity": identity,
            "allergens": allergens,
            "nutrition": nutrition,
            "categories": {
                "status": "PASS_WITH_REPORTED_UNMAPPED_VALUES",
                "mapped_records": category["mapped_records"],
                "tagged_but_unmapped": category["tagged_but_unmapped"],
                "missing_category_tags": category["missing_category_tags"],
            },
            "alternatives": alternatives,
        },
        "workflow": {
            "cleaning": cleaning,
            "enrichment": enrichment,
            "inclusion_count": len(inclusion_rows),
            "exclusion_count": 0,
        },
        "quality_comparison": comparison,
        "delta_summary": delta["summary"],
        "artifact_sha256": artifact_hashes,
        "known_limitations": [
            f"{allergens['conservative_unknown_records']} records use conservative Unknown allergen evidence and must not be described as allergen-free.",
            f"{category['tagged_but_unmapped']} records have category tags outside the current deterministic category rules; all tags are listed in unmapped_categories.json.",
            "Barcode validation covers supported digit-only lengths and uniqueness, not GTIN check digits.",
            "The release is an offline database artifact. Backend/API work, Firestore rules, production seeding, deployment, and credentialed live readback are outside DB070 and have not been claimed.",
        ],
    }
    write_json(build_dir / "validation_manifest.json", manifest)
    cleaned_path.unlink()
    return {
        **artifact_hashes,
        "validation_manifest.json": sha256_file(build_dir / "validation_manifest.json"),
    }


def report_markdown(manifest: dict[str, Any], reproducibility: dict[str, Any]) -> str:
    comparison = manifest["quality_comparison"]["metrics"]
    delta = manifest["delta_summary"]
    validation = manifest["validation"]
    return f"""# DB070 – Quality-First Database Release v1.1

**Result:** {manifest['status']}

**Dataset:** `foodremedy_release_v1.1.json`  
**Records:** {manifest['dataset']['records']:,}  
**SHA-256:** `{manifest['dataset']['sha256']}`  
**Reproducibility:** {reproducibility['status']}

DB070 generated v1.1 only from the reviewed DB069 candidate, whose SHA-256 is
bound in `validation_manifest.json`. The workflow canonicalised the candidate,
ran all five configured enrichment modules, reran DB060 and semantic database
checks, rebuilt alternatives against the final catalogue, and reproduced every
core artifact in a second isolated build.

## Validation result

| Check | Result | Evidence |
| --- | --- | --- |
| DB060 | PASS | {validation['valid_records']:,} valid, {validation['invalid_records']} invalid |
| Barcode and names | PASS | {validation['identity']['valid_unique_barcodes']:,} unique supported barcodes; {validation['identity']['usable_product_names']:,} usable names |
| Ingredients and nutrients | PASS | Source nutriment objects preserved for all {validation['nutrition']['nutriment_objects_preserved']:,} records; missing values were not converted to zero |
| Allergens | PASS | {validation['allergens']['known_evidence_records']:,} with known evidence; {validation['allergens']['conservative_unknown_records']:,} conservatively Unknown |
| Categories | PASS with report | {validation['categories']['mapped_records']:,} mapped; {validation['categories']['tagged_but_unmapped']:,} tagged but unmapped |
| Alternatives | PASS | {validation['alternatives']['references_checked']:,} references checked; no dangling/self references |

## Quality movement from v1.0

| Metric | v1.0 | v1.1 | Change |
| --- | ---: | ---: | ---: |
| Ingredient coverage | {comparison['ingredients']['v1.0_rate']:.2%} | {comparison['ingredients']['v1.1_rate']:.2%} | {comparison['ingredients']['rate_delta']:+.2%} |
| Full core nutrition | {comparison['nutrition_all_core']['v1.0_rate']:.2%} | {comparison['nutrition_all_core']['v1.1_rate']:.2%} | {comparison['nutrition_all_core']['rate_delta']:+.2%} |
| Category coverage | {comparison['categories']['v1.0_rate']:.2%} | {comparison['categories']['v1.1_rate']:.2%} | {comparison['categories']['rate_delta']:+.2%} |
| Brand coverage | {comparison['brands']['v1.0_rate']:.2%} | {comparison['brands']['v1.1_rate']:.2%} | {comparison['brands']['rate_delta']:+.2%} |
| Known allergen evidence | {comparison['known_allergen_evidence']['v1.0_rate']:.2%} | {comparison['known_allergen_evidence']['v1.1_rate']:.2%} | {comparison['known_allergen_evidence']['rate_delta']:+.2%} |
| Image coverage | {comparison['images']['v1.0_rate']:.2%} | {comparison['images']['v1.1_rate']:.2%} | {comparison['images']['rate_delta']:+.2%} |

The version delta contains {delta['added']:,} added, {delta['updated']:,} updated,
{delta['removed']:,} removed, and {delta['unchanged']:,} unchanged barcodes.

## Reproduction

Run:

```bash
python scripts/db070_generate_quality_release.py \\
  --output-dir database/Release/v1.1 \\
  --release-date {manifest['release_date']} \\
  --generated-at {manifest['generated_at_utc']}
```

The command refuses to overwrite an existing release directory. It rejects a
candidate whose SHA differs from DB069, records exact configuration and module
hashes, and builds twice without consuming checkpoints.

## Boundary

This is a database release and handoff package. It does not include Backend/API
changes, mobile changes, Firestore rule changes, production seeding, deployment,
or credentialed live readback.
"""


def generate_release(
    *,
    output_dir: Path,
    candidate_path: Path = DEFAULT_CANDIDATE,
    candidate_record_path: Path = DEFAULT_CANDIDATE_RECORD,
    baseline_path: Path = DEFAULT_BASELINE,
    config_path: Path = DEFAULT_CONFIG,
    quality_config_path: Path = DEFAULT_QUALITY_CONFIG,
    generated_at: str,
    release_date: str,
) -> dict[str, Any]:
    if output_dir.exists():
        raise FileExistsError(f"Release directory already exists: {output_dir}")
    inputs = load_bound_inputs(
        candidate_path, candidate_record_path, baseline_path, config_path,
        quality_config_path,
    )
    parent = output_dir.resolve().parent
    parent.mkdir(parents=True, exist_ok=True)
    workspace = Path(tempfile.mkdtemp(prefix=".db070-repro-", dir=parent))
    commit = git_commit()
    try:
        first = workspace / "run-1"
        second = workspace / "run-2"
        first_hashes = build_once(
            build_dir=first,
            inputs=inputs,
            generated_at=generated_at,
            release_date=release_date,
            generation_base_commit=commit,
        )
        second_hashes = build_once(
            build_dir=second,
            inputs=inputs,
            generated_at=generated_at,
            release_date=release_date,
            generation_base_commit=commit,
        )
        if first_hashes != second_hashes:
            differences = sorted(
                name for name in set(first_hashes) | set(second_hashes)
                if first_hashes.get(name) != second_hashes.get(name)
            )
            raise ValueError(f"Isolated builds were not reproducible: {differences}")
        reproducibility = {
            "schema": "food-remedy-release-reproducibility-v1",
            "ticket": TICKET,
            "release_version": VERSION,
            "status": "PASS_IDENTICAL_ARTIFACT_HASHES",
            "isolated_builds": 2,
            "checkpoint_policy": "ISOLATED_BUILD_NO_CHECKPOINT_REUSE",
            "release_fingerprint": inputs["fingerprint"],
            "candidate_sha256": inputs["candidate_sha256"],
            "artifact_sha256": first_hashes,
        }
        write_json(first / "reproducibility_verification.json", reproducibility)
        manifest = json.loads((first / "validation_manifest.json").read_text(encoding="utf-8"))
        (first / "DB070-quality-first-release-v1.1.md").write_text(
            report_markdown(manifest, reproducibility), encoding="utf-8"
        )
        checksum_names = sorted(
            path.name for path in first.iterdir()
            if path.is_file() and path.name != "SHA256SUMS"
        )
        (first / "SHA256SUMS").write_text(
            "".join(f"{sha256_file(first / name)}  {name}\n" for name in checksum_names),
            encoding="utf-8",
        )
        first.rename(output_dir.resolve())
        return {
            "manifest": manifest,
            "reproducibility": reproducibility,
            "output_dir": str(output_dir.resolve()),
        }
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


def parse_generated_at(value: str | None) -> str:
    if value is None:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("--generated-at must include a timezone")
    return parsed.isoformat()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--candidate", type=Path, default=DEFAULT_CANDIDATE)
    parser.add_argument("--candidate-record", type=Path, default=DEFAULT_CANDIDATE_RECORD)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    parser.add_argument("--pipeline-config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--quality-config", type=Path, default=DEFAULT_QUALITY_CONFIG)
    parser.add_argument("--release-date", required=True)
    parser.add_argument("--generated-at")
    args = parser.parse_args()

    def absolute(path: Path) -> Path:
        return path if path.is_absolute() else ROOT / path

    try:
        result = generate_release(
            output_dir=absolute(args.output_dir),
            candidate_path=absolute(args.candidate),
            candidate_record_path=absolute(args.candidate_record),
            baseline_path=absolute(args.baseline),
            config_path=absolute(args.pipeline_config),
            quality_config_path=absolute(args.quality_config),
            generated_at=parse_generated_at(args.generated_at),
            release_date=args.release_date,
        )
    except Exception as exc:
        print(f"DB070 release generation failed: {exc}", file=sys.stderr)
        return 1
    manifest = result["manifest"]
    print(
        f"{manifest['status']}: {manifest['dataset']['records']} records; "
        f"sha256={manifest['dataset']['sha256']}; output={result['output_dir']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
