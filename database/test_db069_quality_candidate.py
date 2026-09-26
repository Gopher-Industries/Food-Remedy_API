"""DB069 quality-first candidate generation regression tests."""

import hashlib
import gzip
import json
from pathlib import Path

from scripts.db069_build_quality_candidate import (
    build_bundle,
    candidate_record,
    deduplicate,
    evaluate_quality,
    select_candidate,
    verification_result,
    write_output,
)


def base_config(tmp_path: Path, source_files=None, candidate_size=2):
    baseline = tmp_path / "baseline.json"
    baseline.write_text("[]", encoding="utf-8")
    return {
        "ticket": "DB069",
        "source_files": source_files or [],
        "baseline_release": str(baseline),
        "valid_barcode_lengths": [8, 12, 13, 14],
        "quality_weights": {
            "barcode": 20,
            "product_name": 20,
            "ingredients": 18,
            "nutrition": 18,
            "categories": 10,
            "brand": 6,
            "allergens": 5,
            "image": 3,
        },
        "quality_tiers": [
            {"name": "Gold", "minimum_score": 80},
            {"name": "Silver", "minimum_score": 65},
            {"name": "Bronze", "minimum_score": 50},
            {"name": "Basic", "minimum_score": 0},
        ],
        "selection": {
            "candidate_size": candidate_size,
            "minimum_quality_score": 0,
            "max_brand_share": 1,
            "max_unbranded_share": 1,
            "max_primary_category_share": 1,
            "max_uncategorized_share": 1,
        },
        "allergen_bias_review_threshold": 0.1,
    }


def product(barcode, name, **updates):
    record = {
        "barcode": barcode,
        "productName": name,
        "brand": "Example",
        "ingredientsText": "Water, oats",
        "categories": ["foods", "breakfasts"],
        "allergens": [],
        "images": {"root": "https://images.example/product.jpg"},
        "nutriments": {
            "energy-kcal_100g": 0,
            "fat_100g": 0,
            "saturated-fat_100g": 0,
            "carbohydrates_100g": 12,
            "sugars_100g": 0,
            "proteins_100g": 4,
            "salt_100g": 0,
        },
        "completeness": 0.9,
    }
    record.update(updates)
    return record


def evaluated(record, config, file_name="source.json", row=0):
    raw = json.dumps(record, sort_keys=True).encode()
    return {
        "record": record,
        "record_sha256": hashlib.sha256(raw).hexdigest(),
        "barcode": record.get("barcode") if isinstance(record.get("barcode"), str) else None,
        "source": {
            "file": file_name,
            "file_sha256": "f" * 64,
            "row": row,
            "source_order": 0,
        },
        "quality": evaluate_quality(record, config),
    }


def test_quality_scoring_treats_real_zero_as_evidence_and_does_not_impute(tmp_path):
    config = base_config(tmp_path)
    record = product("0123456789012", "Zero sugar oats")

    quality = evaluate_quality(record, config)

    assert quality["features"]["core_nutrients_present"] == 7
    assert quality["tier"] == "Gold"
    assert record["nutriments"]["sugars_100g"] == 0
    assert "fiber_100g" not in record["nutriments"]


def test_deduplication_keeps_the_most_complete_source_record(tmp_path):
    config = base_config(tmp_path)
    sparse = product(
        "0123456789012",
        "Oats",
        ingredientsText=None,
        categories=[],
        allergens=[],
        nutriments={},
        completeness=0.2,
    )
    complete = product(
        "0123456789012",
        "Oats",
        allergens=["gluten"],
        completeness=0.95,
    )
    items = [
        evaluated(sparse, config, "a.json", 10),
        evaluated(complete, config, "b.json", 4),
    ]

    winners, duplicate_decisions, metrics = deduplicate(items)

    assert len(winners) == 1
    assert winners[0]["source"]["file"] == "b.json"
    assert duplicate_decisions[("a.json", 10)]["reasons"] == [
        "duplicate_barcode_less_complete"
    ]
    assert metrics["duplicate_barcode_groups"] == 1
    assert metrics["duplicate_rows_removed"] == 1


def test_missing_allergen_evidence_becomes_explicit_unknown(tmp_path):
    config = base_config(tmp_path)
    item = evaluated(product("0123456789012", "Oats", allergens=[]), config)

    candidate = candidate_record(item)

    assert candidate["allergens"] == ["Unknown"]
    assert candidate["allergensDetected"] == ["Unknown"]


def test_selection_enforces_brand_representation_cap(tmp_path):
    config = base_config(tmp_path, candidate_size=2)
    config["selection"]["max_brand_share"] = 0.5
    same_brand_a = evaluated(product("0123456789012", "A", brand="Dominant"), config, row=0)
    same_brand_b = evaluated(product("1123456789012", "B", brand="Dominant"), config, row=1)
    other_brand = evaluated(product("2123456789012", "C", brand="Other"), config, row=2)

    selected, decisions, report = select_candidate(
        [same_brand_a, same_brand_b, other_brand], config
    )

    assert {item["quality"]["primary_brand"] for item in selected} == {
        "dominant",
        "other",
    }
    excluded = decisions[("source.json", 1)]
    assert "brand_representation_cap_reached" in excluded["reasons"]
    assert report["brands"] == {"dominant": 1, "other": 1}


def test_end_to_end_artifacts_account_for_every_source_row_and_reproduce(tmp_path):
    source_one = tmp_path / "one.json"
    source_two = tmp_path / "two.json"
    baseline = tmp_path / "baseline.json"
    source_one.write_text(
        json.dumps([
            product("0123456789012", "A", brand="One"),
            product("1123456789012", "B", brand="Two", allergens=["milk"]),
            product("bad", "Invalid barcode"),
        ]),
        encoding="utf-8",
    )
    source_two.write_text(
        json.dumps([
            product("0123456789012", "A", brand="One", ingredientsText=None),
            product("2123456789012", "nan", brand="Three"),
            product("3123456789012", "C", brand="Four"),
        ]),
        encoding="utf-8",
    )
    baseline.write_text(json.dumps([product("4123456789012", "Old")]), encoding="utf-8")
    config = base_config(
        tmp_path,
        source_files=[str(source_one), str(source_two)],
        candidate_size=2,
    )
    config["baseline_release"] = str(baseline)
    config_path = tmp_path / "config.json"
    config_path.write_text(json.dumps(config), encoding="utf-8")
    generated_at = "2026-09-21T11:00:00+00:00"

    bundle, reproducibility = verification_result(config_path, generated_at)
    output = tmp_path / "output"
    generation = write_output(bundle, reproducibility, output)

    assert generation["candidate"]["records"] == 2
    assert reproducibility["status"] == "PASS"
    assert reproducibility["identical"] is True
    report = json.loads((output / "quality_report.json").read_text())
    assert report["source_profile"]["record_count"] == 6
    assert report["deduplication"]["duplicate_rows_removed"] == 1
    assert report["existing_database_validation"] == {
        "validator": "scripts/db060_release_validation.py",
        "status": "CHECKS_PASSED_PENDING_APPROVAL",
        "total_records": 2,
        "valid_records": 2,
        "invalid_records": 0,
        "dataset_errors": [],
        "required_reviews": [],
    }
    assert report["ledgers"] == {
        "complete_source_accounting": True,
        "excluded_source_records": 4,
        "included_records": 2,
    }
    included = (output / "inclusion_ledger.jsonl").read_text().splitlines()
    excluded = gzip.decompress(
        (output / "exclusion_ledger.jsonl.gz").read_bytes()
    ).decode("utf-8").splitlines()
    assert len(included) == 2
    assert len(excluded) == 4
    assert (output / "db060_validation.json").is_file()
    assert (output / "SHA256SUMS").is_file()


def test_committed_config_covers_every_australian_source_chunk():
    root = Path(__file__).resolve().parents[1]
    config = json.loads(
        (root / "database/Candidates/db069_candidate_config.json").read_text()
    )
    assert config["source_files"] == [
        "database/seeding/products_0k_10k.json",
        "database/seeding/products_10k_20k.json",
        "database/seeding/products_20k_30k.json",
        "database/seeding/products_30k_40k.json",
        "database/seeding/products_40k_50k.json",
        "database/seeding/products_50k+.json",
    ]
    assert all((root / path).is_file() for path in config["source_files"])
