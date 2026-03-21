"""DB010 health score: nutriments merge, RAG label, insufficient-data handling."""

from database.pipeline.stages.enrich_stage import compute_product_health_score
from database.pipeline.modules.nutrition_enrich import compute_health_score_for_record


def test_nutriments_merged_for_per_100g():
    rec = {
        "barcode": "test",
        "nutriments": {
            "proteins_100g": 15,
            "sugars_100g": 4,
            "fiber_100g": 7,
            "fat_100g": 2,
            "saturated-fat_100g": 0.5,
            "sodium_100g": 0.05,
            "energy-kcal_100g": 120,
        },
    }
    out = compute_health_score_for_record(rec)
    assert out["raw"]["protein"] == 15
    assert out["sufficientDataForScore"] is True
    assert out["healthScore"] is not None
    assert out["healthLabel"] in ("Green", "Amber", "Red")
    assert isinstance(out["reasons"], list) and len(out["reasons"]) >= 1


def test_insufficient_data_empty_nutrients():
    out = compute_product_health_score({"barcode": "x", "nutriments": {}})
    assert out["healthLabel"] == "InsufficientData"
    assert out["healthScore"] is None
    assert out["compositeScore"] is None
    assert isinstance(out.get("provisionalCompositeScore"), int)
    assert "insufficient" in out["reasons"][0].lower()


def test_nutriments_normalized_fills_gaps():
    rec = {
        "barcode": "norm",
        "nutriments": {},
        "nutriments_normalized": {
            "sugars_g": 5.0,
            "proteins_g": 8.0,
            "fat_g": 4.0,
            "energy_kcal": 180.0,
        },
    }
    out = compute_health_score_for_record(rec)
    assert out["sufficientDataForScore"] is True
    assert out["healthScore"] is not None
    assert out["raw"]["protein"] == 8.0
    assert out["raw"]["sugars"] == 5.0


def test_enrich_stage_entry_matches_module():
    rec = {"nutriments": {"energy-kcal_100g": 200, "proteins_100g": 10, "fat_100g": 8}}
    assert compute_product_health_score(rec) == compute_health_score_for_record(rec)
