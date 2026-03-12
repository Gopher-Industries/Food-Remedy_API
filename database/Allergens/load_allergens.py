import json
from pathlib import Path

CONFIG_PATH = Path(__file__).with_name("allergens_config.json")

def load_allergens():
    with open(CONFIG_PATH, "r") as f:
        data = json.load(f)

    allergens = data.get("allergens", [])

    # ---- Mandatory validation rules ----
    if len(allergens) != 14:
        raise ValueError("Config must contain exactly 14 AU/NZ allergens")

    names = [a.get("name") for a in allergens]
    if len(names) != len(set(names)):
        raise ValueError("Allergen names must be unique")

    for a in allergens:
        if not a.get("name"):
            raise ValueError("Allergen entry missing 'name'")
        if not isinstance(a.get("keywords"), list) or len(a["keywords"]) == 0:
            raise ValueError(f"{a['name']} must include at least one keyword")

    return allergens

