import json


def get_text_blob(record):
    ingredients = record.get("ingredients", []) or []
    allergens = record.get("allergensDetected", []) or record.get("allergens", []) or []
    categories = record.get("categories", []) or []

    combined = []
    for field in [ingredients, allergens, categories]:
        if isinstance(field, list):
            combined.extend([str(x).lower() for x in field])
        else:
            combined.append(str(field).lower())

    return " ".join(combined)


def get_diet_tags(record):
    tags = []
    text = get_text_blob(record)

    non_vegan = [
        "milk", "dairy", "egg", "honey", "gelatin",
        "fish", "meat", "chicken", "beef", "pork",
        "shrimp", "prawn", "crustacea", "mollusc", "molluscs"
    ]
    non_vegetarian = [
        "fish", "tuna", "shrimp", "prawn",
        "meat", "chicken", "beef", "pork", "gelatin",
        "crustacea", "mollusc", "molluscs"
    ]
    non_pescatarian = [
        "chicken", "beef", "pork", "lamb", "meat"
    ]
    gluten_terms = [
        "gluten", "wheat", "barley", "rye", "malt", "semolina", "couscous", "triticale"
    ]

    if not any(term in text for term in non_vegan):
        tags.append("vegan")

    if not any(term in text for term in non_vegetarian):
        tags.append("vegetarian")

    if not any(term in text for term in non_pescatarian):
        tags.append("pescatarian")

    if not any(term in text for term in gluten_terms):
        tags.append("gluten_free")

    return tags


def get_lifestyle_tags(record):
    tags = []
    nutriments = record.get("nutriments", {}) or {}

    proteins = nutriments.get("proteins_100g", 0) or 0
    sugars = nutriments.get("sugars_100g", 0) or 0
    fat = nutriments.get("fat_100g", 0) or 0
    energy = nutriments.get("energy-kcal_100g", 0) or 0
    carbs = nutriments.get("carbohydrates_100g", 0) or 0

    try:
        proteins = float(proteins)
    except Exception:
        proteins = 0

    try:
        sugars = float(sugars)
    except Exception:
        sugars = 0

    try:
        fat = float(fat)
    except Exception:
        fat = 0

    try:
        energy = float(energy)
    except Exception:
        energy = 0

    try:
        carbs = float(carbs)
    except Exception:
        carbs = 0

    if proteins >= 10 and sugars <= 10:
        tags.append("fitness")

    if energy >= 250 or carbs >= 25:
        tags.append("energy")

    if energy <= 150 and sugars <= 5 and fat <= 5:
        tags.append("weight_management")

    return tags


def get_risk_tags(record):
    tags = []

    additives = record.get("additives", []) or []
    allergens_detected = record.get("allergensDetected", []) or []
    nutrient_levels = record.get("nutrientLevels", {}) or {}
    nutriments = record.get("nutriments", {}) or {}

    sugars = nutriments.get("sugars_100g", 0) or 0
    salt = nutriments.get("salt_100g", 0) or 0
    sat_fat = nutriments.get("saturated-fat_100g", 0) or 0

    try:
        sugars = float(sugars)
    except Exception:
        sugars = 0

    try:
        salt = float(salt)
    except Exception:
        salt = 0

    try:
        sat_fat = float(sat_fat)
    except Exception:
        sat_fat = 0

    if allergens_detected:
        tags.append("contains_allergens")

    if additives:
        tags.append("contains_additives")

    if nutrient_levels.get("sugars") == "high" or sugars > 22.5:
        tags.append("high_sugar")

    if nutrient_levels.get("salt") == "high" or salt > 1.5:
        tags.append("high_salt")

    if nutrient_levels.get("saturated-fat") == "high" or sat_fat > 5:
        tags.append("high_saturated_fat")

    return tags


def run(input_path, output_path, config):
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    processed = 0
    failures = 0

    for record in data:
        try:
            record["dietTags"] = get_diet_tags(record)
            record["lifestyleTags"] = get_lifestyle_tags(record)
            record["riskTags"] = get_risk_tags(record)
            processed += 1
        except Exception:
            failures += 1

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return {
        "processed": processed,
        "failures": failures
    }