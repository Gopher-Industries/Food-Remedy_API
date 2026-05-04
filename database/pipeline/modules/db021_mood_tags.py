"""
DB021 - Mood Nutrition Tags
Maps nutrient values (macros, select vitamins, minerals) to mood/energy categories
for recommendations. Aligns with DB enrichment scope (handover: mood + health tagging,
FE tag contracts).

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

# Open Food Facts-style bases (hyphenated); we resolve vitamin-c, vitamin_c, etc.
_NUTRIENT_ALIASES = {
    "vitamin_c": ("vitamin-c", "vitamin_c"),
    "vitamin_d": ("vitamin-d", "vitamin_d"),
    "vitamin_b6": ("vitamin-b6", "vitamin-b6a", "vitamin_b6"),
    "vitamin_b9": ("vitamin-b9", "folates", "vitamin-b9-mod", "vitamin_b9"),
    "vitamin_b12": ("vitamin-b12", "vitamin_b12"),
    "vitamin_b1": ("vitamin-b1", "thiamin", "vitamin_b1"),
    "iron": ("iron",),
    "magnesium": ("magnesium",),
}


def safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _nutrient_from_dict(nutriments, base_variants):
    """Best positive value for an OFF nutrient (tries *_100g, *_value, bare key)."""
    best = 0.0
    for base in base_variants:
        for key in (f"{base}_100g", f"{base}_value", base):
            if key not in nutriments:
                continue
            v = safe_float(nutriments.get(key))
            if v > best:
                best = v
    return best


def extract_micronutrients(nutriments):
    """Pull vitamin/mineral values used for mood rules (per 100 g when present)."""
    if not isinstance(nutriments, dict):
        nutriments = {}
    out = {}
    for logical, variants in _NUTRIENT_ALIASES.items():
        out[logical] = _nutrient_from_dict(nutriments, variants)
    return out


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
    - energy_boost: high carbs or high energy; iron/B1 support energy metabolism
    - focus: high protein + low sugar; B6/B9/B12 support cognitive/nerve function
    - relaxation: low energy density; optional magnesium-rich + not high-sugar
    - stress_relief: fiber; magnesium/vit C; nuts, seeds, whole grains
    - recovery: high protein, moderate carbs (post-exercise)
    """
    tags = []
    nutriments = record.get("nutriments", {}) or {}
    categories = record.get("categories", []) or []
    ingredients = record.get("ingredients", []) or []

    # safely get macro values (per 100 g)
    energy = safe_float(nutriments.get("energy-kcal_100g", 0))
    carbs = safe_float(nutriments.get("carbohydrates_100g", 0))
    sugars = safe_float(nutriments.get("sugars_100g", 0))
    proteins = safe_float(nutriments.get("proteins_100g", 0))
    fat = safe_float(nutriments.get("fat_100g", 0))
    fiber = safe_float(nutriments.get("fiber_100g", 0))

    micro = extract_micronutrients(nutriments)
    vit_c = micro["vitamin_c"]
    magnesium = micro["magnesium"]
    iron = micro["iron"]
    vit_b6 = micro["vitamin_b6"]
    vit_b9 = micro["vitamin_b9"]
    vit_b12 = micro["vitamin_b12"]
    vit_b1 = micro["vitamin_b1"]
    vit_d = micro["vitamin_d"]

    # combine text for ingredient/category checks
    text = " ".join([
        str(c).lower() for c in categories
    ] + [
        str(i).lower() for i in ingredients
    ])

    # energy_boost: high carbs or high energy foods
    macro_energy = energy >= 250 or carbs >= 30
    # Iron / thiamin contribute to reducing tiredness (label-style narrative)
    iron_energy = iron >= 0.0035
    b1_energy = vit_b1 >= 0.0002
    if macro_energy or iron_energy or b1_energy:
        tags.append("energy_boost")

    # focus: high protein, low sugar (supports concentration)
    macro_focus = proteins >= 10 and sugars <= 10
    # B vitamins often associated with mental fatigue / cognition when data exists
    b_focus = (
        proteins >= 6
        and (
            vit_b12 >= 1e-6
            or vit_b6 >= 5e-4
            or vit_b9 >= 1e-5
        )
    )
    if macro_focus or b_focus:
        tags.append("focus")

    # relaxation: low energy, low sugar foods (e.g. herbal teas, light snacks)
    light_meal = energy <= 100 and sugars <= 5 and fat <= 3
    # Magnesium often linked to relaxation; only tag when not a high-sugar hit
    mag_relax = magnesium >= 0.04 and sugars <= 12 and energy <= 220
    if light_meal or mag_relax:
        tags.append("relaxation")

    # stress_relief: high fiber, nuts, seeds, whole grains; vit C / magnesium
    stress_relief_terms = [
        "nut", "seed", "oat", "whole grain", "wholegrain",
        "almond", "walnut", "cashew", "pumpkin", "sunflower"
    ]
    stress_macro = fiber >= 3 or any(term in text for term in stress_relief_terms)
    # Vitamin D threshold: avoid noise from trace zeros; ~10 µg/100 g ≈ 1e-5 g
    stress_micro = vit_c >= 0.015 or magnesium >= 0.035 or vit_d >= 1e-5
    if stress_macro or stress_micro:
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
        },
        {
            "barcode": "2222222222222",
            "productName": "Fortified cereal (micronutrients)",
            "nutriments": {
                "energy-kcal_100g": 380,
                "proteins_100g": 8,
                "carbohydrates_100g": 75,
                "sugars_100g": 20,
                "fat_100g": 3,
                "fiber_100g": 6,
                "iron_100g": 0.004,
                "vitamin-b12_100g": 0.000005,
                "vitamin-b6_100g": 0.001,
            },
            "categories": ["breakfast cereals"],
            "ingredients": ["wheat", "sugar"]
        },
    ]

    print("Testing mood tag assignment:\n")
    for product in test_products:
        result = get_mood_tags(product)
        print(f"{product['productName']}: {result}")
    print("\nAll tests completed!")
