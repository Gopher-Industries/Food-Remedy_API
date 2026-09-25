import json

from utils.missing_value_utils import UNKNOWN_ALLERGEN


TAG_CONTRACT = {
    "dietTags": ["vegan", "vegetarian", "pescatarian", "gluten_free"],
    "lifestyleTags": ["fitness", "energy", "weight_management"],
    "riskTags": [
        "contains_allergens",
        "contains_additives",
        "high_sugar",
        "high_salt",
        "high_saturated_fat"
    ]
}


def safe_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _allergen_values(record):
    detected = safe_list(record.get("allergensDetected"))
    return detected or safe_list(record.get("allergens"))


def _known_allergens(record):
    return [
        value
        for value in _allergen_values(record)
        if isinstance(value, str)
        and value.strip().lower() != UNKNOWN_ALLERGEN.lower()
    ]


def _allergen_information_unknown(record):
    values = _allergen_values(record)
    return bool(values) and not _known_allergens(record) and any(
        isinstance(value, str)
        and value.strip().lower() == UNKNOWN_ALLERGEN.lower()
        for value in values
    )


def safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalise_tags(tags):
    """
    Ensure tags are:
    - lowercase
    - snake_case
    - unique
    - sorted for consistency
    """
    cleaned = []
    for tag in safe_list(tags):
        if not isinstance(tag, str):
            continue
        tag = tag.strip().lower().replace("-", "_").replace(" ", "_")
        if tag:
            cleaned.append(tag)
    return sorted(set(cleaned))


def get_text_blob(record):
    ingredients = safe_list(record.get("ingredients", []))
    allergens = _known_allergens(record)
    categories = safe_list(record.get("categories", []))

    combined = []
    for field in [ingredients, allergens, categories]:
        combined.extend([str(x).lower() for x in field])

    return " ".join(combined)


def get_diet_tags(record):
    tags = []
    if _allergen_information_unknown(record):
        return tags

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
        "gluten", "wheat", "barley", "rye", "malt",
        "semolina", "couscous", "triticale"
    ]

    if not any(term in text for term in non_vegan):
        tags.append("vegan")

    if not any(term in text for term in non_vegetarian):
        tags.append("vegetarian")

    if not any(term in text for term in non_pescatarian):
        tags.append("pescatarian")

    if not any(term in text for term in gluten_terms):
        tags.append("gluten_free")

    return normalise_tags(tags)


def get_lifestyle_tags(record):
    tags = []
    nutriments = record.get("nutriments", {}) or {}

    proteins = safe_float(nutriments.get("proteins_100g", 0))
    sugars = safe_float(nutriments.get("sugars_100g", 0))
    fat = safe_float(nutriments.get("fat_100g", 0))
    energy = safe_float(nutriments.get("energy-kcal_100g", 0))
    carbs = safe_float(nutriments.get("carbohydrates_100g", 0))

    if proteins >= 10 and sugars <= 10:
        tags.append("fitness")

    if energy >= 250 or carbs >= 25:
        tags.append("energy")

    if energy <= 150 and sugars <= 5 and fat <= 5:
        tags.append("weight_management")

    return normalise_tags(tags)


def get_risk_tags(record):
    tags = []

    additives = safe_list(record.get("additives", [])) or safe_list(record.get("additives_tags", []))
    allergens_detected = _known_allergens(record)
    nutrient_levels = record.get("nutrientLevels", {}) or record.get("nutrient_levels", {}) or {}
    nutriments = record.get("nutriments", {}) or {}

    sugars = safe_float(nutriments.get("sugars_100g", 0))
    salt = safe_float(nutriments.get("salt_100g", 0))
    sat_fat = safe_float(nutriments.get("saturated-fat_100g", 0))

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

    return normalise_tags(tags)


def enrich_record(record):
    record["dietTags"] = get_diet_tags(record)
    record["lifestyleTags"] = get_lifestyle_tags(record)
    record["riskTags"] = get_risk_tags(record)
    return record


def run(input_path, output_path, config):
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
        except Exception:
            failures += 1

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return {
        "processed": processed,
        "failures": failures,
        "tag_contract": TAG_CONTRACT
    }
