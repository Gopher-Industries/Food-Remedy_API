import json
from pathlib import Path
import re
from typing import Any, Optional

# -------------------------------
# Config Loading
# -------------------------------
CONFIG_PATH = Path(__file__).parent.parent / "database" / "Allergens" / "allergens_config.json"
try:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        ALLERGEN_CONFIG = json.load(f)["allergens"]
except FileNotFoundError:
    # temporary list
    ALLERGEN_CONFIG = [
        {"name": "Milk", "keywords": ["milk", "whey", "casein", "lactose"]},
        {"name": "Peanuts", "keywords": ["peanut", "groundnut", "arachis"]},
    ]

# -------------------------------
# Strict Regex Variations
# -------------------------------
VARIATIONS = {
    "Fish": r"\b(salmon|tuna|anchovy|cod|haddock|basa|sardine|fish oil|fish sauce)\b",
    "Crustacea": r"\b(crab|prawn|shrimp|lobster|crayfish|krill|yabby|shellfish)\b",
    "Tree Nuts": r"\b(almond|cashew|hazelnut|walnut|pecan|brazil nut|macadamia|pistachio|pine nut)\b",
    "Milk": r"\b(milk|dairy|whey|casein|lactose|cream|cheese|yoghurt|milk powder)\b",
}

# Use Milk variation for real dairy check
DAIRY_TERMS = VARIATIONS["Milk"]

# Capture the nut name for nut butter handling
NUT_BUTTER_PATTERN = r"\b(almond|cashew|hazelnut|walnut|pecan|macadamia|pistachio|pine nut|peanut) butter\b"

# -------------------------------
# Precise Negation Suppression (per allergen)
# -------------------------------
NEGATION_PATTERNS = {
    "Gluten": [r"\bno[- ]?gluten\b", r"\bgluten[- ]?free\b"],
    "Milk": [r"\bno[- ]?milk\b", r"\bdairy[- ]?free\b"],
    "Peanuts": [r"\bno[- ]?peanuts?\b", r"\bpeanut[- ]?free\b"],
    "Tree Nuts": [r"\bno[- ]?nuts?\b", r"\bnut[- ]?free\b"],
    "Soy": [r"\bno[- ]?soy\b", r"\bsoy[- ]?free\b"],
    # open to expansion
}

# -------------------------------
# Detection Function
# -------------------------------
def detect_allergens(
    product: dict,
    keyword_entries: Optional[list[dict[str, Any]]] = None,
) -> list[str]:
    """Detect allergens from trusted declarations and ingredient evidence.

    ``keyword_entries`` should match ``load_allergens()`` output (name + keywords).
    If omitted, uses module-level config from ``allergens_config.json``.

    Marketing metadata such as product names, categories and labels is excluded:
    it may support search, but is not reliable enough to create a safety result.
    """
    entries = keyword_entries if keyword_entries is not None else ALLERGEN_CONFIG
    
    # Trusted free-text evidence supplied by the product record.
    fields_to_check = [
        product.get("ingredientsText") or product.get("ingredients_text"),
        product.get("traces"),
        product.get("tracesFromIngredients") or product.get("traces_from_ingredients"),
    ]

    # Trusted structured evidence. Product/category/label names are intentionally
    # not authoritative allergen declarations.
    list_fields = [
        product.get("ingredients") or product.get("ingredients_tags"),
        product.get("allergens_tags"),
    ]

    # Flatten list fields into strings
    for lst in list_fields:
        if isinstance(lst, list):
            fields_to_check.append(" ".join(str(item) for item in lst if item))

    # Combine everything into one lowercase text blob
    combined_text = " ".join(
        f for f in fields_to_check if isinstance(f, str)
    ).lower()

    detected = set()

    # Regex variations
    for name, pattern in VARIATIONS.items():
        if re.search(pattern, combined_text):
            detected.add(name)

    # Keyword fallback with word boundaries
    for allergen in entries:
        for keyword in allergen["keywords"]:
            if re.search(r"\b" + re.escape(keyword.lower()) + r"\b", combined_text):
                detected.add(allergen["name"])
                break

    match = re.search(NUT_BUTTER_PATTERN, combined_text)
    if match:
        nut = match.group(1)

        if nut == "peanut":
            detected.add("Peanuts")
        else:
            detected.add("Tree Nuts")

    # Suppress false Milk detection caused by "butter" inside nut butters
    if "Milk" in detected and re.search(NUT_BUTTER_PATTERN, combined_text):
        # Check if any REAL dairy terms appear
        if not re.search(DAIRY_TERMS, combined_text):
            detected.remove("Milk")

    # Suppress plant milks (soy milk, almond milk, oat milk, etc.)
    if "Milk" in detected:
        if re.search(r"\b(soy|almond|oat|rice|coconut|hemp|cashew|hazelnut|walnut|pecan|macadamia|pistachio|pea) milk\b", combined_text):
            if not re.search(DAIRY_TERMS, combined_text):
                detected.remove("Milk")

    # Per-allergen negation suppression
    suppressed = set()
    for allergen, patterns in NEGATION_PATTERNS.items():
        if any(re.search(p, combined_text) for p in patterns):
            suppressed.add(allergen)

    detected -= suppressed

    return sorted(detected)

