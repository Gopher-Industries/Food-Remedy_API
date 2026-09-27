"""DB059: exercise the real cleaner and compare every tagged release record."""

import json
from pathlib import Path

import pytest

from database.clean_data.cleanProductData import main, standardise_category
from scripts.db059_category_audit import audit

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("tags,expected", [
    (["en:beverages"], "beverages"),
    ([" EN:Beverages ", "en:energy-drinks"], "beverages"),
    (["en:plant-based-foods-and-beverages"], "other"),
    (["en:beverages-and-beverages-preparations"], "other"),
    (["en:beverages", "en:cheeses"], "dairy"),
    (["en:beverages", "en:condiments"], "condiments"),
    (["en:beverages", "en:breads"], "breads"),
])
def test_exact_membership_preserves_existing_priorities(tags, expected):
    assert standardise_category(tags) == expected


def test_cleaner_writes_category_and_preserves_source_tags(tmp_path):
    source = ROOT / "database/clean_data/IOExamples/rawSample.jsonl"
    raw = json.loads(source.read_text().splitlines()[0])
    raw["categories_tags"] = ["en:beverages", "en:energy-drinks"]
    raw["labels_tags"] = []
    input_path, output_path = tmp_path / "raw.jsonl", tmp_path / "clean.json"
    input_path.write_text(json.dumps(raw) + "\n")
    main(str(input_path), str(output_path))
    product = json.loads(output_path.read_text())[0]
    assert product["category"] == "beverages"
    assert product["standardCategory"] == "beverages"
    assert product["categories"] == ["beverages", "energy-drinks"]


def test_release_replay_preserves_every_previously_mapped_record():
    previous = json.loads(
        (ROOT / "database/Reports/DB059/category_after.json").read_text()
    )
    report = audit(ROOT / "database/seeding/products_enriched.json")
    previous_by_identity = {
        (item["index"], item["barcode"]): item["bucket"]
        for item in previous["classified_records"]
    }
    current_by_identity = {
        (item["index"], item["barcode"]): item["bucket"]
        for item in report["classified_records"]
    }
    # Regenerating allergen and personalisation fields changes the whole-file
    # hash, but must not change any category source evidence or classification.
    assert current_by_identity == previous_by_identity
    assert report["missing_category_tags"] == previous["missing_category_tags"] == 4523
    assert report["mapped_records"] == previous["mapped_records"] == 279


def test_audit_refuses_comparison_with_another_dataset(tmp_path):
    source = tmp_path / "data.json"
    source.write_text('[{"barcode": "12345678", "categories": []}]')
    before = audit(source)
    source.write_text('[{"barcode": "12345678", "categories": ["beverages"]}]')
    with pytest.raises(ValueError, match="identical dataset"):
        audit(source, before)
