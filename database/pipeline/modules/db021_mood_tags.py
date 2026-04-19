"""
DB021 - Mood Nutrition Tags
Maps nutrient values to mood/energy categories for recommendations.
Mood tags: energy_boost, focus, relaxation, stress_relief, recovery
"""

import json
import logging

logger = logging.getLogger(__name__)

MOOD_TAG_CONTRACT = {
    "moodTags": [
        "energy_boost",
        "focus",
        "relaxation",
        "stress_relief",
        "recovery"
    ]
}


def safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalise_tags(tags):
    cleaned = []
    for tag in tags:
        if not isinstance(tag, str):
            continue
        tag = tag.strip().lower().replace("-", "_").replace(" ", "_")
        if tag:
            cleaned.append(tag)
    return sorted(set(cleaned))


def get_mood_tags(record):
    """
    Map nutrient values to mood categories:
    - energy_boost: high carbs or high energy
    - focus: high protein, low sugar
    - relaxation: low energy, low sugar, low caffeine indicators
    - stress_relief: high magnesium indicators (nuts, seeds, whole grains)
    - recovery: high protein, moderate carbs
    """
    tags = []
    nutriments = record.get("nutriments", {}) or {}
    categories = record.get("categories", []) or []
    ingredients = record.get("ingredients", []) or []

    # safely get nutrient values
    energy = safe_float(nutriments.get("energy-kcal_100g", 0))
    carbs = safe_float(nutriments.get("carbohydrates_100g", 0))
    sugars = safe_float(nutriments.get("sugars_100g", 0))
    proteins = safe_float(nutriments.get("proteins_100g", 0))
    fat = safe_float(nutriments.get("fat_100g", 0))
    fiber = safe_float(nutriments.get("fiber_100g", 0))

    # combine text for ingredient/category checks
    text = " ".join([
        str(c).lower() for c in categories
    ] + [
        str(i).lower() for i in ingredients
    ])

    # energy_boost: high carbs or high energy foods
    if energy >= 250 or carbs >= 30:
        tags.append("energy_boost")

    # focus: high protein, low sugar (supports concentration)
    if proteins >= 10 and sugars <= 10:
        tags.append("focus")

    # relaxation: low energy, low sugar foods
    # e.g. herbal teas, light snacks
    if energy <= 100 and sugars <= 5 and fat <= 3:
        tags.append("relaxation")

    # stress_relief: high fiber, nuts, seeds, whole grains
    stress_relief_terms = [
        "nut", "seed", "oat", "whole grain", "wholegrain",
        "almond", "walnut", "cashew", "pumpkin", "sunflower"
    ]
    if fiber >= 3 or any(term in text for term in stress_relief_terms):
        tags.append("stress_relief")

    # recovery: high protein, moderate carbs (post-workout)
    if proteins >= 15 and carbs >= 10 and carbs <= 40:
        tags.append("recovery")

    return normalise_tags(tags)


def enrich_record(record):
    """Add moodTags to a single product record."""
    try:
        record["moodTags"] = get_mood_tags(record)
    except Exception as e:
        logger.warning(f"Failed to assign mood tags for product "
                      f"{record.get('barcode', 'unknown')}: {e}")
        record["moodTags"] = []
    return record


def run(input_path, output_path, config):
    """Main entry point called by the pipeline."""
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict):
        data = [data]

    if not isinstance(data, list):
        raise ValueError("Expected input data to be a list of product records")

    processed = 0
    failures = 0

    for record in data:
        try:
            enrich_record(record)
            processed += 1
        except Exception as e:
            logger.warning(f"Failed to process record: {e}")
            failures += 1

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    logger.info(f"[DB021] Mood tags applied: {processed} processed, "
                f"{failures} failures")
    print(f"[DB021] Mood tags applied: {processed} processed, "
          f"{failures} failures")

    return {
        "processed": processed,
        "failures": failures,
        "mood_tag_contract": MOOD_TAG_CONTRACT
    }


# Quick test
if __name__ == "__main__":
    test_products = [
        {
            "barcode": "1234567890123",
            "productName": "Protein Bar",
            "nutriments": {
                "energy-kcal_100g": 350,
                "proteins_100g": 20,
                "carbohydrates_100g": 30,
                "sugars_100g": 8,
                "fat_100g": 10,
                "fiber_100g": 5
            },
            "categories": ["protein bars", "fitness"],
            "ingredients": ["oats", "whey protein", "almond"]
        },
        {
            "barcode": "9876543210987",
            "productName": "Herbal Tea",
            "nutriments": {
                "energy-kcal_100g": 5,
                "proteins_100g": 0,
                "carbohydrates_100g": 1,
                "sugars_100g": 0,
                "fat_100g": 0,
                "fiber_100g": 0
            },
            "categories": ["herbal tea", "beverages"],
            "ingredients": ["chamomile", "lavender"]
        },
        {
            "barcode": "1111111111111",
            "productName": "Energy Drink",
            "nutriments": {
                "energy-kcal_100g": 400,
                "proteins_100g": 2,
                "carbohydrates_100g": 50,
                "sugars_100g": 45,
                "fat_100g": 0,
                "fiber_100g": 0
            },
            "categories": ["energy drinks"],
            "ingredients": ["sugar", "caffeine"]
        }
    ]

    print("Testing mood tag assignment:\n")
    for product in test_products:
        result = get_mood_tags(product)
        print(f"{product['productName']}: {result}")
    print("\nAll tests completed!")