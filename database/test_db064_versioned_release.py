"""DB064: versioned release generation and fail-closed evidence."""

import hashlib
import json
from pathlib import Path

import pytest

from scripts.db064_generate_versioned_release import prepare_release


ROOT = Path(__file__).resolve().parents[1]


def product(barcode, name, allergens=None, **extra):
    allergens = ["Unknown"] if allergens is None else allergens
    return {
        "barcode": barcode,
        "productName": name,
        "brand": "Example",
        "ingredientsText": None,
        "ingredients": [],
        "allergens": allergens,
        "allergensDetected": list(allergens),
        "categories": [],
        "nutriments": {},
        **extra,
    }


def source_file(tmp_path: Path, records):
    path = tmp_path / "candidate.json"
    path.write_text(json.dumps(records), encoding="utf-8")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return path, digest


def test_release_excludes_only_reviewed_rows_and_rebuilds_internal_links(tmp_path):
    source, digest = source_file(tmp_path, [
        product("12345678", "First"),
        product("12345679", "Second", ["Milk"]),
        product("12345670", "nan"),
    ])
    output = tmp_path / "v1.0"

    generation_record = prepare_release(
        input_path=source,
        output_dir=output,
        version="1.0",
        expected_input_sha256=digest,
        expected_exclusions=1,
        release_date="2026-09-21",
        generated_at="2026-09-20T14:00:00+00:00",
    )

    assert generation_record["generation_status"] == (
        "CHECKS_PASSED_READY_FOR_VALIDATION_MANIFEST"
    )
    assert generation_record["release_approved"] is False
    assert generation_record["dataset"]["record_count"] == 2
    assert generation_record["validation"]["invalid_records"] == 0
    assert generation_record["quality"]["alternatives"]["dangling_references"] == 0
    assert generation_record["excluded_records"]["reason_counts"] == {
        "stored_product_name_placeholder": 1
    }

    records = json.loads((output / "foodremedy_release_v1.0.json").read_text())
    assert [row["barcode"] for row in records] == ["12345678", "12345679"]
    allowed = {row["barcode"] for row in records}
    for row in records:
        alternatives = row["enrichment"]["alternatives"]
        for kind in ("similar", "healthier"):
            assert {peer["barcode"] for peer in alternatives[kind]} <= allowed

    sidecar = json.loads((output / "product_alternatives_v1.0.json").read_text())
    assert set(sidecar) == allowed
    assert (output / "generation_record.json").is_file()
    assert (output / "DB064-versioned-release.md").is_file()
    assert not (output / "validation_manifest.json").exists()
    assert (output / "SHA256SUMS").is_file()


def test_existing_release_directory_is_never_overwritten(tmp_path):
    source, digest = source_file(tmp_path, [product("12345678", "First")])
    output = tmp_path / "v1.0"
    output.mkdir()
    marker = output / "keep.txt"
    marker.write_text("approved artifact")

    with pytest.raises(FileExistsError, match="will not be overwritten"):
        prepare_release(
            input_path=source,
            output_dir=output,
            version="1.0",
            expected_input_sha256=digest,
            expected_exclusions=0,
            release_date="2026-09-21",
        )
    assert marker.read_text() == "approved artifact"


def test_release_is_bound_to_reviewed_input_hash(tmp_path):
    source, _ = source_file(tmp_path, [product("12345678", "First")])
    with pytest.raises(ValueError, match="Input SHA-256 changed"):
        prepare_release(
            input_path=source,
            output_dir=tmp_path / "v1.0",
            version="1.0",
            expected_input_sha256="0" * 64,
            expected_exclusions=0,
            release_date="2026-09-21",
        )


def test_allergen_contract_mismatch_blocks_release(tmp_path):
    record = product("12345678", "First")
    record["allergensDetected"] = []
    source, digest = source_file(tmp_path, [record])

    with pytest.raises(ValueError, match="Allergen contract failed"):
        prepare_release(
            input_path=source,
            output_dir=tmp_path / "v1.0",
            version="1.0",
            expected_input_sha256=digest,
            expected_exclusions=0,
            release_date="2026-09-21",
        )


def test_unreviewed_exclusion_count_change_blocks_release(tmp_path):
    source, digest = source_file(
        tmp_path,
        [product("123", "Invalid barcode")],
    )
    # The bad barcode is a reviewed reason, but the expected decision is still
    # hash- and count-bound so an unnoticed count change cannot pass.
    with pytest.raises(ValueError, match="Exclusion count changed"):
        prepare_release(
            input_path=source,
            output_dir=tmp_path / "v1.0",
            version="1.0",
            expected_input_sha256=digest,
            expected_exclusions=0,
            release_date="2026-09-21",
        )


def test_checked_in_v1_release_is_complete_and_checksum_bound():
    release_dir = ROOT / "database/Release/v1.0"
    generation_record = json.loads(
        (release_dir / "generation_record.json").read_text(encoding="utf-8")
    )
    dataset_path = release_dir / generation_record["dataset"]["file"]
    sidecar_path = release_dir / generation_record["alternatives_sidecar"]["file"]

    assert generation_record["generation_status"] == (
        "CHECKS_PASSED_READY_FOR_VALIDATION_MANIFEST"
    )
    assert generation_record["release_approved"] is False
    assert generation_record["validation"]["invalid_records"] == 0
    assert hashlib.sha256(dataset_path.read_bytes()).hexdigest() == (
        generation_record["dataset"]["sha256"]
    )
    assert hashlib.sha256(sidecar_path.read_bytes()).hexdigest() == (
        generation_record["alternatives_sidecar"]["sha256"]
    )

    records = json.loads(dataset_path.read_text(encoding="utf-8"))
    sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
    barcodes = {row["barcode"] for row in records}
    assert len(records) == generation_record["dataset"]["record_count"] == 4731
    assert len(barcodes) == len(records)
    assert set(sidecar) == barcodes

    for line in (release_dir / "SHA256SUMS").read_text(encoding="utf-8").splitlines():
        expected, name = line.split("  ", maxsplit=1)
        assert hashlib.sha256((release_dir / name).read_bytes()).hexdigest() == expected
