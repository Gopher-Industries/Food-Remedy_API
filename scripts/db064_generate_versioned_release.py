#!/usr/bin/env python3
"""Generate an immutable, versioned Food Remedy release dataset and evidence.

The command is deliberately bound to a reviewed input SHA-256 and exclusion
count. It never overwrites a release directory. Invalid identity rows are
recorded in an exclusions ledger, alternatives are rebuilt against the exact
final catalogue, and DB060 is rerun before the artifact is handed to DB065 for
its final validation manifest and approval decision.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database.pipeline.modules.db019_alternative_product_mapping import (
    build_alternatives_for_catalog,
)
from scripts.db059_category_audit import audit as category_audit
from scripts.db060_release_validation import validate


EXCLUDABLE_REASONS = {
    "barcode_invalid_format",
    "stored_product_name_missing_or_unusable",
    "stored_product_name_placeholder",
}
VERSION_PATTERN = re.compile(r"^[1-9][0-9]*\.[0-9]+$")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def quiet_validate(records: list[dict[str, Any]]) -> dict[str, Any]:
    with contextlib.redirect_stdout(io.StringIO()):
        return validate(records)


def alternative_config(config: dict[str, Any]) -> dict[str, Any]:
    modules = config["pipeline"]["enrich"]["modules"]
    module = next(
        item for item in modules
        if item.get("name") == "db019_alternative_product_mapping"
    )
    values = module.get("config", {})
    return {
        "max_similar": int(values.get("max_similar", 5)),
        "max_healthier": int(values.get("max_healthier", 5)),
        "max_peers_scan": int(values.get("max_peers_scan", 400)),
        "healthier_min_score_delta": float(
            values.get("healthier_min_score_delta", 2)
        ),
        "max_nutrient_distance_healthier": float(
            values.get("max_nutrient_distance_healthier", 0.55)
        ),
        "healthier_allow_any_score_gain": bool(
            values.get("healthier_allow_any_score_gain", True)
        ),
        "healthier_use_sugar_proxy": bool(
            values.get("healthier_use_sugar_proxy", True)
        ),
        "healthier_use_fiber_proxy": bool(
            values.get("healthier_use_fiber_proxy", True)
        ),
        "rng_seed": int(values.get("rng_seed", 20260419)),
    }


def check_allergen_contract(records: list[dict[str, Any]]) -> dict[str, int]:
    known = unknown = 0
    for index, product in enumerate(records):
        allergens = product.get("allergens")
        detected = product.get("allergensDetected")
        if (
            not isinstance(allergens, list)
            or not allergens
            or any(not isinstance(item, str) or not item.strip() for item in allergens)
            or allergens != detected
        ):
            raise ValueError(
                f"Allergen contract failed at release row {index}: "
                "allergens must be a non-empty string list matching allergensDetected"
            )
        if "Unknown" in allergens:
            if allergens != ["Unknown"]:
                raise ValueError(
                    f"Ambiguous mixed Unknown allergen state at release row {index}"
                )
            unknown += 1
        else:
            known += 1
    return {
        "known_evidence_records": known,
        "conservative_unknown_records": unknown,
        "empty_records": 0,
        "allergens_detected_mismatches": 0,
    }


def check_alternative_references(records: list[dict[str, Any]]) -> dict[str, int]:
    barcodes = {str(product["barcode"]) for product in records}
    references = 0
    for index, product in enumerate(records):
        alternatives = (
            (product.get("enrichment") or {}).get("alternatives") or {}
        )
        for kind in ("similar", "healthier"):
            for peer in alternatives.get(kind, []):
                references += 1
                peer_barcode = str(peer.get("barcode"))
                if peer_barcode not in barcodes:
                    raise ValueError(
                        f"Dangling {kind} alternative {peer_barcode!r} "
                        f"at release row {index}"
                    )
                if peer_barcode == str(product["barcode"]):
                    raise ValueError(
                        f"Self-referencing {kind} alternative at release row {index}"
                    )
    return {"references_checked": references, "dangling_references": 0}


def build_sidecar(records: list[dict[str, Any]]) -> dict[str, Any]:
    result = {}
    for product in records:
        alternatives = (
            (product.get("enrichment") or {}).get("alternatives") or {}
        )
        result[str(product["barcode"])] = {
            "similar": alternatives.get("similar") or [],
            "healthier": alternatives.get("healthier") or [],
        }
    return result


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


def generation_report_markdown(record: dict[str, Any]) -> str:
    quality = record["quality"]
    exclusions = record["excluded_records"]
    return f"""# DB064 - Versioned Final Release Dataset

**Result:** CHECKS PASSED - READY FOR DB065 VALIDATION MANIFEST

**Dataset:** `{record['dataset']['file']}`

**Version:** `{record['dataset']['version']}`

**SHA-256:** `{record['dataset']['sha256']}`

**Generated:** {record['generated_at_utc']}

The versioned dataset was generated from the DB063-approved candidate. All
automated generation checks passed for its {record['dataset']['record_count']:,}
records. DB065 must produce the final validation manifest before the artifact is
approved for release or selected as the seeding input.

## Release checks

| Area | Result | Evidence |
| --- | --- | --- |
| Required fields | PASS | {quality['required_fields']['invalid_records']} invalid records |
| Barcodes | PASS | 0 missing, invalid, non-string or duplicate barcodes |
| Ingredients | PASS with limitation | {quality['ingredients']['missing_text_records']:,} records lack source ingredient text; processing remains null-safe |
| Allergens | PASS | {quality['allergens']['known_evidence_records']:,} known, {quality['allergens']['conservative_unknown_records']:,} conservatively Unknown, 0 empty/mismatched |
| Categories | PASS with limitation | {quality['categories']['mapped_records']:,} mapped; {quality['categories']['missing_category_tags']:,} missing source tags; {quality['categories']['tagged_but_unmapped']:,} tagged but unmapped |
| Alternative links | PASS | {quality['alternatives']['references_checked']:,} references checked; 0 dangling references |

## Release-critical resolution

The reviewed 5,000-record enriched candidate contained {exclusions['count']}
records that could not reliably identify a product. They were excluded rather
than repaired with guessed values. The exclusion ledger records each source row,
barcode, name and reason. Counts by reason: `{json.dumps(exclusions['reason_counts'], sort_keys=True)}`.

Alternatives were rebuilt after exclusion, against the exact final catalogue.
This prevents recommendations from referring to any excluded barcode.

## Known non-critical limitations

""" + "".join(
        f"- {item}\n" for item in record["known_limitations"]
    ) + """

## Handoff boundary

DB064 creates and preserves the immutable offline artifact with its source,
configuration, validation and checksum evidence. It does not grant final
release approval and does not claim that production has been seeded. DB065 owns
the final validation manifest and release handoff decision.
"""


def prepare_release(
    *,
    input_path: Path,
    output_dir: Path,
    version: str,
    expected_input_sha256: str,
    expected_exclusions: int,
    release_date: str,
    generated_at: str | None = None,
) -> dict[str, Any]:
    if not VERSION_PATTERN.fullmatch(version):
        raise ValueError("Version must use <major>.<minor>, for example 1.0")
    if output_dir.exists():
        raise FileExistsError(
            f"Release directory already exists and will not be overwritten: {output_dir}"
        )

    raw = input_path.read_bytes()
    input_digest = sha256_bytes(raw)
    if input_digest != expected_input_sha256:
        raise ValueError(
            f"Input SHA-256 changed: expected {expected_input_sha256}, got {input_digest}"
        )
    records = json.loads(raw)
    if not isinstance(records, list) or any(not isinstance(row, dict) for row in records):
        raise ValueError("Expected a JSON array of product objects")

    source_validation = quiet_validate(records)
    if source_validation["dataset_errors"]:
        raise ValueError(
            f"Dataset-wide validation errors cannot be excluded: "
            f"{source_validation['dataset_errors']}"
        )
    if source_validation["required_reviews"]:
        raise ValueError(
            f"Required reviews remain unresolved: {source_validation['required_reviews']}"
        )
    failed = source_validation["failed_records"]
    if len(failed) != expected_exclusions:
        raise ValueError(
            f"Exclusion count changed: expected {expected_exclusions}, got {len(failed)}"
        )
    unexpected = sorted({
        reason
        for item in failed
        for reason in item["reasons"]
        if reason not in EXCLUDABLE_REASONS
    })
    if unexpected:
        raise ValueError(
            f"Unreviewed validation reasons cannot be auto-excluded: {unexpected}"
        )

    excluded_indices = {item["index"] for item in failed}
    release_records = [
        product for index, product in enumerate(records)
        if index not in excluded_indices
    ]

    config_path = ROOT / "database/pipeline/pipeline.config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    release_records, alternative_stats = build_alternatives_for_catalog(
        release_records,
        **alternative_config(config),
    )
    allergen_metrics = check_allergen_contract(release_records)
    alternative_metrics = check_alternative_references(release_records)
    final_validation = quiet_validate(release_records)
    if final_validation["status"] != "CHECKS_PASSED_PENDING_APPROVAL":
        raise ValueError(
            f"Final DB060 validation did not pass: {final_validation['status']}"
        )

    output_dir = output_dir.resolve()
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{output_dir.name}-", dir=output_dir.parent))
    try:
        dataset_name = f"foodremedy_release_v{version}.json"
        sidecar_name = f"product_alternatives_v{version}.json"
        dataset_path = stage / dataset_name
        sidecar_path = stage / sidecar_name
        write_json(dataset_path, release_records)
        write_json(sidecar_path, build_sidecar(release_records))

        category_report = category_audit(dataset_path)
        write_json(stage / "category_audit.json", category_report)

        exclusions = [
            {
                "source_index": item["index"],
                "barcode": item.get("barcode"),
                "productName": item.get("productName"),
                "reasons": item["reasons"],
            }
            for item in failed
        ]
        exclusion_ledger = {
            "schema": "food-remedy-release-exclusions-v1",
            "source_dataset_sha256": input_digest,
            "release_version": version,
            "count": len(exclusions),
            "reason_counts": source_validation["reason_counts"],
            "records": exclusions,
        }
        write_json(stage / "exclusions.json", exclusion_ledger)

        final_validation["provenance"] = {
            "dataset": dataset_name,
            "dataset_sha256": sha256_file(dataset_path),
            "dataset_version": f"v{version}",
            "release_date": release_date,
            "generated_at_utc": generated_at
            or datetime.now(timezone.utc).isoformat(),
            "generation_base_commit": git_commit(),
            "source_candidate": display_path(input_path),
            "source_candidate_sha256": input_digest,
            "pipeline_config_sha256": sha256_file(config_path),
        }
        write_json(stage / "db060_validation.json", final_validation)

        generated = final_validation["provenance"]["generated_at_utc"]
        generation_record = {
            "schema": "food-remedy-versioned-dataset-generation-v1",
            "generation_status": "CHECKS_PASSED_READY_FOR_VALIDATION_MANIFEST",
            "release_approved": False,
            "deployment_status": "NOT_SEEDED_OR_READ_BACK",
            "generated_at_utc": generated,
            "release_date": release_date,
            "dataset": {
                "version": f"v{version}",
                "file": dataset_name,
                "sha256": sha256_file(dataset_path),
                "record_count": len(release_records),
            },
            "alternatives_sidecar": {
                "file": sidecar_name,
                "sha256": sha256_file(sidecar_path),
                "record_count": len(release_records),
            },
            "source": {
                "candidate": display_path(input_path),
                "candidate_sha256": input_digest,
                "candidate_record_count": len(records),
                "configured_enrichment_input": config["pipeline"]["enrich"]["input"],
                "configured_enrichment_input_sha256": sha256_file(
                    ROOT / config["pipeline"]["enrich"]["input"]
                ),
                "pipeline_config": "database/pipeline/pipeline.config.json",
                "pipeline_config_sha256": sha256_file(config_path),
                "generation_base_commit": git_commit(),
            },
            "validation": {
                "validator": "scripts/db060_release_validation.py",
                "status": final_validation["status"],
                "total_records": final_validation["total_records"],
                "valid_records": final_validation["valid_records"],
                "invalid_records": final_validation["invalid_records"],
                "dataset_errors": final_validation["dataset_errors"],
                "required_reviews": final_validation["required_reviews"],
            },
            "quality": {
                "required_fields": {
                    "status": "PASS",
                    "invalid_records": final_validation["invalid_records"],
                    **final_validation["stored_required_fields"],
                },
                "barcodes": {
                    "status": "PASS",
                    "missing": 0,
                    "invalid_format": 0,
                    "non_string": 0,
                    "duplicates": 0,
                    "validation_scope": "format and uniqueness; no GTIN check digit",
                },
                "ingredients": {
                    "status": "PASS_WITH_DOCUMENTED_SOURCE_LIMITATION",
                    "missing_text_records": final_validation["quality"]["missing_ingredient_text"],
                },
                "allergens": {"status": "PASS", **allergen_metrics},
                "categories": {
                    "status": "PASS_WITH_DOCUMENTED_SOURCE_LIMITATION",
                    "mapped_records": category_report["mapped_records"],
                    "missing_category_tags": category_report["missing_category_tags"],
                    "tagged_but_unmapped": category_report["tagged_but_unmapped"],
                    "stored_primary_rule_conflicts_for_review": category_report[
                        "stored_primary_rule_conflicts_for_review"
                    ],
                },
                "alternatives": {
                    "status": "PASS",
                    **alternative_metrics,
                    "generation_stats": alternative_stats,
                },
            },
            "excluded_records": {
                "count": len(exclusions),
                "reason_counts": source_validation["reason_counts"],
                "ledger": "exclusions.json",
                "decision": (
                    "Excluded because the product could not be reliably identified; "
                    "no barcode or product-name values were guessed."
                ),
            },
            "known_limitations": [
                f"{final_validation['quality']['missing_ingredient_text']} records lack source ingredient text; no replacement text was inferred.",
                f"{allergen_metrics['conservative_unknown_records']} records use the conservative Unknown allergen state and must not be presented as allergen-free.",
                f"{category_report['missing_category_tags']} records lack source category tags and {category_report['tagged_but_unmapped']} tagged records remain outside the current category rules.",
                "Barcode validation covers supported digit-only lengths and uniqueness, not GTIN check digits.",
                "The versioned dataset passed offline generation checks; DB065 approval, production seeding and Firestore application-path readback have not yet run.",
            ],
            "evidence": {
                "db060_validation": "db060_validation.json",
                "category_audit": "category_audit.json",
                "versioned_release_report": "DB064-versioned-release.md",
                "checksums": "SHA256SUMS",
            },
        }
        write_json(stage / "generation_record.json", generation_record)
        (stage / "DB064-versioned-release.md").write_text(
            generation_report_markdown(generation_record), encoding="utf-8"
        )

        checksum_files = [
            dataset_name,
            sidecar_name,
            "generation_record.json",
            "db060_validation.json",
            "category_audit.json",
            "exclusions.json",
            "DB064-versioned-release.md",
        ]
        (stage / "SHA256SUMS").write_text(
            "".join(f"{sha256_file(stage / name)}  {name}\n" for name in checksum_files),
            encoding="utf-8",
        )
        stage.rename(output_dir)
        return generation_record
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=ROOT / "database/seeding/products_enriched.json",
    )
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--release-date", required=True)
    parser.add_argument("--expected-input-sha256", required=True)
    parser.add_argument("--expected-exclusions", type=int, required=True)
    args = parser.parse_args()

    input_path = args.input if args.input.is_absolute() else ROOT / args.input
    output_dir = (
        args.output_dir if args.output_dir.is_absolute() else ROOT / args.output_dir
    )
    try:
        generation_record = prepare_release(
            input_path=input_path,
            output_dir=output_dir,
            version=args.version,
            expected_input_sha256=args.expected_input_sha256,
            expected_exclusions=args.expected_exclusions,
            release_date=args.release_date,
        )
    except Exception as exc:
        print(f"Release generation failed: {exc}", file=sys.stderr)
        return 1
    print(
        f"{generation_record['generation_status']}: "
        f"{generation_record['dataset']['record_count']} records; "
        f"sha256={generation_record['dataset']['sha256']}; output={output_dir}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
