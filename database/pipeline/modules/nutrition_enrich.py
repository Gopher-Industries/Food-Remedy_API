"""Nutrition enrichment module (DB010).

Provides `run(input_path, output_path, config)` used by the pipeline.
No top-level side-effects; constants only. Honors `config['dry_run']`.
"""
import json
import os
from typing import Any, Dict, List, Optional


NutritionThresholds = {
    "sugar": {"low": 5, "moderate": 15},
    "protein": {"high": 12, "moderate": 6},
    "fat": {"low": 3, "moderate": 17.5},
    "saturatedFat": {"low": 1.5, "moderate": 5},
    "fibre": {"high": 6, "moderate": 3},
    "energyKcal": {"low": 150, "moderate": 300},
    "sodium": {"low": 0.12, "moderate": 0.6},
    "compositeWeights": {"protein": 0.3, "sugar": 0.25, "fibre": 0.2, "fat": 0.15, "sodium": 0.1},
}


def _to_number(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        if isinstance(v, (int, float)):
            f = float(v)
            if f != f:
                return None
            return f
        s = str(v).strip().replace(",", ".")
        return float(s)
    except Exception:
        return None


def _get_first_numeric(product: Dict[str, Any], keys: List[str]) -> Optional[float]:
    for k in keys:
        if k in product:
            n = _to_number(product.get(k))
            if n is not None:
                return n
    return None


def _normalize_sodium(product: Dict[str, Any]) -> Optional[float]:
    s = _get_first_numeric(product, ["sodium_100g", "sodium", "sodium_value"])
    if s is not None:
        sodium = s
        if sodium > 100:
            sodium = sodium / 1000.0
        return sodium

    salt = _get_first_numeric(product, ["salt_100g", "salt", "salt_value"])
    if salt is not None:
        salt_val = salt
        if salt_val > 100:
            salt_val = salt_val / 1000.0
        return salt_val * 0.393

    return None


def _get_energy_kcal(product: Dict[str, Any]) -> Optional[float]:
    direct = _get_first_numeric(product, ["energy-kcal_100g", "energy-kcal_100g_value", "energy-kcal"])
    if direct is not None:
        return direct
    energy_val = _get_first_numeric(product, ["energy_100g", "energy_100g_value", "energy"])
    if energy_val is None:
        return None
    unit = str(product.get("energy_unit") or product.get("energy-kcal_unit") or "").lower()
    if "kcal" in unit:
        return energy_val
    try:
        return energy_val / 4.184
    except Exception:
        return None


def _inv_normalize(value: Optional[float], low_cut: float, high_cut: float) -> float:
    if value is None:
        return 0.5
    if value <= low_cut:
        return 1.0
    if value >= high_cut:
        return 0.0
    return 1.0 - (value - low_cut) / (high_cut - low_cut)


def _compute_nutrition(product: Dict[str, Any]) -> Dict[str, Any]:
    sugars = _get_first_numeric(product, ["sugars_100g", "sugars", "sugars_value"])
    protein = _get_first_numeric(product, ["proteins_100g", "proteins", "proteins_value"])
    fat = _get_first_numeric(product, ["fat_100g", "fat", "fat_value"])
    sat_fat = _get_first_numeric(product, ["saturated-fat_100g", "saturated-fat", "saturated-fat_value", "saturated_fat_100g"])
    fibre = _get_first_numeric(product, ["fiber_100g", "fiber", "fiber_value", "fibre_100g", "fibre"])
    sodium = _normalize_sodium(product)
    energy = _get_energy_kcal(product)

    scores = {}
    scores["protein"] = 0 if protein is None else min(1.0, protein / max(1.0, NutritionThresholds["protein"]["high"]))
    scores["fibre"] = 0 if fibre is None else min(1.0, fibre / max(1.0, NutritionThresholds["fibre"]["high"]))

    scores["sugar"] = _inv_normalize(sugars, NutritionThresholds["sugar"]["low"], NutritionThresholds["sugar"]["moderate"])
    scores["fat"] = _inv_normalize(fat, NutritionThresholds["fat"]["low"], NutritionThresholds["fat"]["moderate"])
    scores["saturatedFat"] = _inv_normalize(sat_fat, NutritionThresholds["saturatedFat"]["low"], NutritionThresholds["saturatedFat"]["moderate"])
    scores["sodium"] = _inv_normalize(sodium, NutritionThresholds["sodium"]["low"], NutritionThresholds["sodium"]["moderate"])
    scores["energy"] = _inv_normalize(energy, NutritionThresholds["energyKcal"]["low"], NutritionThresholds["energyKcal"]["moderate"])

    weights = NutritionThresholds["compositeWeights"]
    composite = (
        (scores.get("protein", 0) * weights["protein"]) +
        (scores.get("fibre", 0) * weights["fibre"]) +
        (scores.get("sugar", 0) * weights["sugar"]) +
        (scores.get("fat", 0) * weights["fat"]) +
        (scores.get("sodium", 0) * weights["sodium"])
    )
    composite_score = round(composite * 100)

    tags: List[str] = []
    if protein is not None and protein >= NutritionThresholds["protein"]["high"]:
        tags.append("highProtein")
    elif protein is not None and protein >= NutritionThresholds["protein"]["moderate"]:
        tags.append("moderateProtein")

    if sugars is not None:
        if sugars <= NutritionThresholds["sugar"]["low"]:
            tags.append("lowSugar")
        elif sugars <= NutritionThresholds["sugar"]["moderate"]:
            tags.append("moderateSugar")
        else:
            tags.append("highSugar")

    if fat is not None:
        if fat <= NutritionThresholds["fat"]["low"]:
            tags.append("lowFat")
        elif fat <= NutritionThresholds["fat"]["moderate"]:
            tags.append("moderateFat")
        else:
            tags.append("highFat")

    if sat_fat is not None:
        if sat_fat <= NutritionThresholds["saturatedFat"]["low"]:
            tags.append("lowSaturatedFat")
        elif sat_fat <= NutritionThresholds["saturatedFat"]["moderate"]:
            tags.append("moderateSaturatedFat")
        else:
            tags.append("highSaturatedFat")

    if fibre is not None:
        if fibre >= NutritionThresholds["fibre"]["high"]:
            tags.append("highFibre")
        elif fibre >= NutritionThresholds["fibre"]["moderate"]:
            tags.append("moderateFibre")

    if sodium is not None:
        if sodium <= NutritionThresholds["sodium"]["low"]:
            tags.append("lowSodium")
        elif sodium <= NutritionThresholds["sodium"]["moderate"]:
            tags.append("moderateSodium")
        else:
            tags.append("highSodium")

    if energy is not None:
        if energy <= NutritionThresholds["energyKcal"]["low"]:
            tags.append("lowEnergyDensity")
        elif energy <= NutritionThresholds["energyKcal"]["moderate"]:
            tags.append("moderateEnergyDensity")
        else:
            tags.append("highEnergyDensity")

    has_high_sugar = "highSugar" in tags
    has_high_sodium = "highSodium" in tags
    has_high_fat = ("highFat" in tags) or ("highSaturatedFat" in tags)
    if composite_score >= 60 and not has_high_sugar and not has_high_sodium and not has_high_fat:
        tags.append("balancedNutrition")

    numeric_scores = {k: round(v * 100) for k, v in scores.items()}

    return {
        "tags": tags,
        "compositeScore": composite_score,
        "scores": numeric_scores,
        "raw": {
            "sugars": sugars,
            "protein": protein,
            "fat": fat,
            "satFat": sat_fat,
            "fibre": fibre,
            "sodium": sodium,
            "energyKcalPer100": energy,
        },
    }


def run(input_path: str, output_path: str, config: Dict[str, Any]):
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input not found: {input_path}")

    with open(input_path, "r", encoding="utf-8") as fh:
        data = json.load(fh)

    if isinstance(data, dict):
        iterable = list(data.values())
    elif isinstance(data, list):
        iterable = data
    else:
        raise RuntimeError("Unsupported input JSON format; expected list or dict")

    out_list: List[Dict[str, Any]] = []
    failures = 0
    for rec in iterable:
        try:
            nutrition = _compute_nutrition(rec or {})
            rec_out = dict(rec)
            rec_out.setdefault("enrichment", {})
            rec_out["enrichment"]["nutrition"] = nutrition
            out_list.append(rec_out)
        except Exception:
            failures += 1
            rec.setdefault("enrichment", {})
            rec["enrichment"]["nutrition_error"] = "failed to compute"
            out_list.append(rec)

    processed = len(out_list)
    dry = bool(config.get("dry_run")) if config and isinstance(config, dict) else False

    if not dry:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as of:
            json.dump(out_list, of, ensure_ascii=False)
    else:
        print(f"DRY-RUN: skipping write of enriched output to {output_path}; processed={processed}")

    return {"processed": processed, "failures": failures if failures else None, "output": output_path, "module": "nutrition_enrich"}
"""Nutrition enrichment module (DB010).

Exposes `run(input_path, output_path, config)` expected by pipeline.
Adds `enrichment.nutrition` to each product. Honors `config['dry_run']` by
skipping writes when True while still returning counts.
"""
import json
import os
from typing import Any, Dict, List, Optional


NutritionThresholds = {
    "sugar": {"low": 5, "moderate": 15},
    "protein": {"high": 12, "moderate": 6},
    "fat": {"low": 3, "moderate": 17.5},
    "saturatedFat": {"low": 1.5, "moderate": 5},
    "fibre": {"high": 6, "moderate": 3},
    "energyKcal": {"low": 150, "moderate": 300},
    "sodium": {"low": 0.12, "moderate": 0.6},
    "compositeWeights": {"protein": 0.3, "sugar": 0.25, "fibre": 0.2, "fat": 0.15, "sodium": 0.1},
}


def _to_number(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        if isinstance(v, (int, float)):
            f = float(v)
            if f != f:
                return None
            return f
        s = str(v).strip().replace(",", ".")
        return float(s)
    except Exception:
        return None


def _get_first_numeric(product: Dict[str, Any], keys: List[str]) -> Optional[float]:
    for k in keys:
        if k in product:
            n = _to_number(product.get(k))
            if n is not None:
                return n
    return None


def _normalize_sodium(product: Dict[str, Any]) -> Optional[float]:
    s = _get_first_numeric(product, ["sodium_100g", "sodium", "sodium_value"])
    if s is not None:
        sodium = s
        if sodium > 100:
            sodium = sodium / 1000.0
        return sodium

    salt = _get_first_numeric(product, ["salt_100g", "salt", "salt_value"])
    if salt is not None:
        salt_val = salt
        if salt_val > 100:
            salt_val = salt_val / 1000.0
        return salt_val * 0.393

    return None


def _get_energy_kcal(product: Dict[str, Any]) -> Optional[float]:
    direct = _get_first_numeric(product, ["energy-kcal_100g", "energy-kcal_100g_value", "energy-kcal"])
    if direct is not None:
        return direct
    energy_val = _get_first_numeric(product, ["energy_100g", "energy_100g_value", "energy"])
    if energy_val is None:
        return None
    unit = str(product.get("energy_unit") or product.get("energy-kcal_unit") or "").lower()
    if "kcal" in unit:
        return energy_val
    try:
        return energy_val / 4.184
    except Exception:
        return None


def _inv_normalize(value: Optional[float], low_cut: float, high_cut: float) -> float:
    if value is None:
        return 0.5
    if value <= low_cut:
        return 1.0
    if value >= high_cut:
        return 0.0
    return 1.0 - (value - low_cut) / (high_cut - low_cut)


def _compute_nutrition(product: Dict[str, Any]) -> Dict[str, Any]:
    sugars = _get_first_numeric(product, ["sugars_100g", "sugars", "sugars_value"])
    protein = _get_first_numeric(product, ["proteins_100g", "proteins", "proteins_value"])
    fat = _get_first_numeric(product, ["fat_100g", "fat", "fat_value"])
    sat_fat = _get_first_numeric(product, ["saturated-fat_100g", "saturated-fat", "saturated-fat_value", "saturated_fat_100g"])
    fibre = _get_first_numeric(product, ["fiber_100g", "fiber", "fiber_value", "fibre_100g", "fibre"])
    sodium = _normalize_sodium(product)
    energy = _get_energy_kcal(product)

    scores = {}
    scores["protein"] = 0 if protein is None else min(1.0, protein / max(1.0, NutritionThresholds["protein"]["high"]))
    scores["fibre"] = 0 if fibre is None else min(1.0, fibre / max(1.0, NutritionThresholds["fibre"]["high"]))

    scores["sugar"] = _inv_normalize(sugars, NutritionThresholds["sugar"]["low"], NutritionThresholds["sugar"]["moderate"])
    scores["fat"] = _inv_normalize(fat, NutritionThresholds["fat"]["low"], NutritionThresholds["fat"]["moderate"])
    scores["saturatedFat"] = _inv_normalize(sat_fat, NutritionThresholds["saturatedFat"]["low"], NutritionThresholds["saturatedFat"]["moderate"])
    scores["sodium"] = _inv_normalize(sodium, NutritionThresholds["sodium"]["low"], NutritionThresholds["sodium"]["moderate"])
    scores["energy"] = _inv_normalize(energy, NutritionThresholds["energyKcal"]["low"], NutritionThresholds["energyKcal"]["moderate"])

    weights = NutritionThresholds["compositeWeights"]
    composite = (
        (scores.get("protein", 0) * weights["protein"]) +
        (scores.get("fibre", 0) * weights["fibre"]) +
        (scores.get("sugar", 0) * weights["sugar"]) +
        (scores.get("fat", 0) * weights["fat"]) +
        (scores.get("sodium", 0) * weights["sodium"])
    )
    composite_score = round(composite * 100)

    tags: List[str] = []
    if protein is not None and protein >= NutritionThresholds["protein"]["high"]:
        tags.append("highProtein")
    elif protein is not None and protein >= NutritionThresholds["protein"]["moderate"]:
        tags.append("moderateProtein")

    if sugars is not None:
        if sugars <= NutritionThresholds["sugar"]["low"]:
            tags.append("lowSugar")
        elif sugars <= NutritionThresholds["sugar"]["moderate"]:
            tags.append("moderateSugar")
        else:
            tags.append("highSugar")

    if fat is not None:
        if fat <= NutritionThresholds["fat"]["low"]:
            tags.append("lowFat")
        elif fat <= NutritionThresholds["fat"]["moderate"]:
            tags.append("moderateFat")
        else:
            tags.append("highFat")

    if sat_fat is not None:
        if sat_fat <= NutritionThresholds["saturatedFat"]["low"]:
            tags.append("lowSaturatedFat")
        elif sat_fat <= NutritionThresholds["saturatedFat"]["moderate"]:
            tags.append("moderateSaturatedFat")
        else:
            tags.append("highSaturatedFat")

    if fibre is not None:
        if fibre >= NutritionThresholds["fibre"]["high"]:
            tags.append("highFibre")
        elif fibre >= NutritionThresholds["fibre"]["moderate"]:
            tags.append("moderateFibre")

    if sodium is not None:
        if sodium <= NutritionThresholds["sodium"]["low"]:
            tags.append("lowSodium")
        elif sodium <= NutritionThresholds["sodium"]["moderate"]:
            tags.append("moderateSodium")
        else:
            tags.append("highSodium")

    if energy is not None:
        if energy <= NutritionThresholds["energyKcal"]["low"]:
            tags.append("lowEnergyDensity")
        elif energy <= NutritionThresholds["energyKcal"]["moderate"]:
            tags.append("moderateEnergyDensity")
        else:
            tags.append("highEnergyDensity")

    has_high_sugar = "highSugar" in tags
    has_high_sodium = "highSodium" in tags
    has_high_fat = ("highFat" in tags) or ("highSaturatedFat" in tags)
    if composite_score >= 60 and not has_high_sugar and not has_high_sodium and not has_high_fat:
        tags.append("balancedNutrition")

    numeric_scores = {k: round(v * 100) for k, v in scores.items()}

    return {
        "tags": tags,
        "compositeScore": composite_score,
        "scores": numeric_scores,
        "raw": {
            "sugars": sugars,
            "protein": protein,
            "fat": fat,
            "satFat": sat_fat,
            "fibre": fibre,
            "sodium": sodium,
            "energyKcalPer100": energy,
        },
    }


def run(input_path: str, output_path: str, config: Dict[str, Any]):
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input not found: {input_path}")

    with open(input_path, "r", encoding="utf-8") as fh:
        data = json.load(fh)

    if isinstance(data, dict):
        iterable = list(data.values())
    elif isinstance(data, list):
        iterable = data
    else:
        raise RuntimeError("Unsupported input JSON format; expected list or dict")

    out_list: List[Dict[str, Any]] = []
    failures = 0
    for rec in iterable:
        try:
            nutrition = _compute_nutrition(rec or {})
            rec_out = dict(rec)
            rec_out.setdefault("enrichment", {})
            rec_out["enrichment"]["nutrition"] = nutrition
            out_list.append(rec_out)
        except Exception:
            failures += 1
            rec.setdefault("enrichment", {})
            rec["enrichment"]["nutrition_error"] = "failed to compute"
            out_list.append(rec)

    processed = len(out_list)
    dry = bool(config.get("dry_run")) if config and isinstance(config, dict) else False

    if not dry:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as of:
            json.dump(out_list, of, ensure_ascii=False)
    else:
        print(f"DRY-RUN: skipping write of enriched output to {output_path}; processed={processed}")

    return {"processed": processed, "failures": failures if failures else None, "output": output_path, "module": "nutrition_enrich"}
import json
import os
from typing import Any, Dict, List, Optional

# Nutrition thresholds (mirrors mobile-app thresholds)
NutritionThresholds = {
    "sugar": {"low": 5, "moderate": 15},
    "protein": {"high": 12, "moderate": 6},
    "fat": {"low": 3, "moderate": 17.5},
    "saturatedFat": {"low": 1.5, "moderate": 5},
    "fibre": {"high": 6, "moderate": 3},
    "energyKcal": {"low": 150, "moderate": 300},
    "sodium": {"low": 0.12, "moderate": 0.6},
    "compositeWeights": {"protein": 0.3, "sugar": 0.25, "fibre": 0.2, "fat": 0.15, "sodium": 0.1},
}


def to_number(v: Any) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        try:
            f = float(v)
            if f != f:
                return None
            return f
        except Exception:
            return None
    try:
        s = str(v).replace(',', '.')
        return float(s)
    except Exception:
        return None


def get_per_100g(product: Dict[str, Any], keys: List[str]) -> Optional[float]:
    for k in keys:
        if k in product:
            n = to_number(product.get(k))
            if n is not None:
                return n
    return None


def normalize_sodium(product: Dict[str, Any]) -> Optional[float]:
    s = get_per_100g(product, ['sodium_100g', 'sodium', 'sodium_value'])
    if s is not None:
        sodium = s
        if sodium > 100:  # likely mg -> g
            sodium = sodium / 1000.0
        return sodium

    salt = get_per_100g(product, ['salt_100g', 'salt', 'salt_value'])
    if salt is not None:
        salt_val = salt
        if salt_val > 100:
            salt_val = salt_val / 1000.0
        sodium_from_salt = salt_val * 0.393
        return sodium_from_salt

    return None


def get_energy_kcal(product: Dict[str, Any]) -> Optional[float]:
    direct = get_per_100g(product, ['energy-kcal_100g', 'energy-kcal_100g_value', 'energy-kcal'])
    if direct is not None:
        return direct
    energy_val = get_per_100g(product, ['energy_100g', 'energy_100g_value', 'energy'])
    if energy_val is None:
        return None
    unit = product.get('energy_unit') or product.get('energy-kcal_unit') or ''
    unit_str = str(unit).lower()
    if 'kcal' in unit_str:
        return energy_val
    # assume kJ otherwise
    try:
        return float(energy_val) / 4.184
    except Exception:
        return None


def inv_normalize(value: Optional[float], low_cut: float, high_cut: float) -> float:
    if value is None:
        return 0.5
    if value <= low_cut:
        return 1.0
    if value >= high_cut:
        return 0.0
    return 1.0 - (value - low_cut) / (high_cut - low_cut)


def run(input_path: str, output_path: str, config: Dict[str, Any]):
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input not found: {input_path}")

    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if isinstance(data, dict):
        iterable = list(data.values())
    elif isinstance(data, list):
        iterable = data
    else:
        raise RuntimeError('Unsupported input JSON format')

    out_list = []

    for rec in iterable:
        sugars = get_per_100g(rec, ['sugars_100g', 'sugars', 'sugars_value'])
        protein = get_per_100g(rec, ['proteins_100g', 'proteins', 'proteins_value'])
        fat = get_per_100g(rec, ['fat_100g', 'fat', 'fat_value'])
        sat_fat = get_per_100g(rec, ['saturated-fat_100g', 'saturated-fat', 'saturated-fat_value', 'saturated_fat_100g'])
        fibre = get_per_100g(rec, ['fiber_100g', 'fiber', 'fiber_value', 'fibre_100g', 'fibre'])
        sodium = normalize_sodium(rec)
        energy = get_energy_kcal(rec)

        scores = {}
        scores['protein'] = 0 if protein is None else min(1.0, protein / max(1.0, NutritionThresholds['protein']['high']))
        scores['fibre'] = 0 if fibre is None else min(1.0, fibre / max(1.0, NutritionThresholds['fibre']['high']))

        scores['sugar'] = inv_normalize(sugars, NutritionThresholds['sugar']['low'], NutritionThresholds['sugar']['moderate'])
        scores['fat'] = inv_normalize(fat, NutritionThresholds['fat']['low'], NutritionThresholds['fat']['moderate'])
        scores['saturatedFat'] = inv_normalize(sat_fat, NutritionThresholds['saturatedFat']['low'], NutritionThresholds['saturatedFat']['moderate'])
        scores['sodium'] = inv_normalize(sodium, NutritionThresholds['sodium']['low'], NutritionThresholds['sodium']['moderate'])
        scores['energy'] = inv_normalize(energy, NutritionThresholds['energyKcal']['low'], NutritionThresholds['energyKcal']['moderate'])

        weights = NutritionThresholds['compositeWeights']
        composite = (
            (scores['protein'] * weights['protein']) +
            (scores['fibre'] * weights['fibre']) +
            (scores['sugar'] * weights['sugar']) +
            (scores['fat'] * weights['fat']) +
            (scores['sodium'] * weights['sodium'])
        )

        composite_score = round(composite * 100)

        tags: List[str] = []
        if protein is not None and protein >= NutritionThresholds['protein']['high']:
            tags.append('highProtein')
        elif protein is not None and protein >= NutritionThresholds['protein']['moderate']:
            tags.append('moderateProtein')

        if sugars is not None:
            if sugars <= NutritionThresholds['sugar']['low']:
                tags.append('lowSugar')
            elif sugars <= NutritionThresholds['sugar']['moderate']:
                tags.append('moderateSugar')
            else:
                tags.append('highSugar')

        if fat is not None:
            if fat <= NutritionThresholds['fat']['low']:
                tags.append('lowFat')
            elif fat <= NutritionThresholds['fat']['moderate']:
                tags.append('moderateFat')
            else:
                tags.append('highFat')

        if sat_fat is not None:
            if sat_fat <= NutritionThresholds['saturatedFat']['low']:
                tags.append('lowSaturatedFat')
            elif sat_fat <= NutritionThresholds['saturatedFat']['moderate']:
                tags.append('moderateSaturatedFat')
            else:
                tags.append('highSaturatedFat')

        if fibre is not None:
            if fibre >= NutritionThresholds['fibre']['high']:
                tags.append('highFibre')
            elif fibre >= NutritionThresholds['fibre']['moderate']:
                tags.append('moderateFibre')

        if sodium is not None:
            if sodium <= NutritionThresholds['sodium']['low']:
                tags.append('lowSodium')
            elif sodium <= NutritionThresholds['sodium']['moderate']:
                tags.append('moderateSodium')
            else:
                tags.append('highSodium')

        if energy is not None:
            if energy <= NutritionThresholds['energyKcal']['low']:
                tags.append('lowEnergyDensity')
            elif energy <= NutritionThresholds['energyKcal']['moderate']:
                tags.append('moderateEnergyDensity')
            else:
                tags.append('highEnergyDensity')

        has_high_sugar = 'highSugar' in tags
        has_high_sodium = 'highSodium' in tags
        has_high_fat = ('highFat' in tags) or ('highSaturatedFat' in tags)
        if composite_score >= 60 and not has_high_sugar and not has_high_sodium and not has_high_fat:
            tags.append('balancedNutrition')

        numeric_scores = {k: round(v * 100) for k, v in scores.items()}

        nutrition_result = {
            'tags': tags,
            'compositeScore': composite_score,
            'scores': numeric_scores,
            'raw': {
                'sugars': sugars,
                'protein': protein,
                'fat': fat,
                'satFat': sat_fat,
                'fibre': fibre,
                'sodium': sodium,
                'energyKcalPer100': energy,
            },
        }

        # merge into record under 'enrichment'. Keep existing fields
        rec_out = dict(rec)
        rec_out.setdefault('enrichment', {})
        rec_out['enrichment']['nutrition'] = nutrition_result
        out_list.append(rec_out)

    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as outf:
        json.dump(out_list, outf, ensure_ascii=False)

    return {'processed': len(out_list), 'failures': 0, 'output': output_path}
