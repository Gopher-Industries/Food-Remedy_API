"""Nutrition enrichment module (DB010).

Provides `run(input_path, output_path, config)` used by the pipeline.
Adds `enrichment.nutrition` with composite score, Nutri-style RAG label, and explainability reasons.

Nutrient inputs (per 100 g / 100 ml), in order of precedence:
  1. Top-level OFF-style keys (e.g. ``proteins_100g``)
  2. ``nutriments`` merged onto the record
  3. ``nutriments_normalized`` (same shape as Product Detail / ``map_enriched_to_product_detail``)
     on the record or under ``enrichment``, filling only missing fields
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
    # Ticket model: energy, sugar, sat fat, salt, protein, fibre (+ total fat for profiling). Weights sum to 1.
    "compositeWeights": {
        "protein": 0.20,
        "fibre": 0.14,
        "sugar": 0.18,
        "fat": 0.10,
        "saturatedFat": 0.12,
        "sodium": 0.10,
        "energy": 0.16,
    },
}

# Minimum number of distinct core nutrients required before we trust a 0–100 score
MIN_NUTRIENTS_FOR_SCORE = 3

TAG_TO_REASON = {
    "highProtein": "good protein content",
    "moderateProtein": "moderate protein",
    "lowSugar": "low sugar",
    "moderateSugar": "moderate sugar",
    "highSugar": "high sugar",
    "lowFat": "low total fat",
    "moderateFat": "moderate total fat",
    "highFat": "high total fat",
    "lowSaturatedFat": "low saturated fat",
    "moderateSaturatedFat": "moderate saturated fat",
    "highSaturatedFat": "high saturated fat",
    "highFibre": "good fibre content",
    "moderateFibre": "moderate fibre",
    "lowSodium": "low salt/sodium",
    "moderateSodium": "moderate salt/sodium",
    "highSodium": "high salt/sodium",
    "lowEnergyDensity": "lower energy density",
    "moderateEnergyDensity": "moderate energy density",
    "highEnergyDensity": "high energy density",
    "balancedNutrition": "balanced nutrient profile",
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


def _set_if_absent_numeric(base: Dict[str, Any], key: str, val: Any) -> None:
    if val is None:
        return
    if key not in base or _to_number(base.get(key)) is None:
        base[key] = val


def _merge_nutriments_normalized(record: Dict[str, Any], base: Dict[str, Any]) -> None:
    """Fill gaps from unit-normalised per-100g block (see ``map_enriched_to_product_detail``)."""
    norm = record.get("nutriments_normalized")
    if not isinstance(norm, dict):
        enr = record.get("enrichment") if record else None
        if isinstance(enr, dict):
            norm = enr.get("nutriments_normalized")
    if not isinstance(norm, dict):
        return

    _set_if_absent_numeric(base, "sugars_100g", norm.get("sugars_g"))
    _set_if_absent_numeric(base, "proteins_100g", norm.get("proteins_g"))
    _set_if_absent_numeric(base, "fat_100g", norm.get("fat_g"))
    _set_if_absent_numeric(base, "saturated-fat_100g", norm.get("saturated_fat_g"))
    _set_if_absent_numeric(base, "saturated_fat_100g", norm.get("saturated_fat_g"))
    _set_if_absent_numeric(base, "fiber_100g", norm.get("fiber_g"))
    _set_if_absent_numeric(base, "fibre_100g", norm.get("fiber_g"))
    _set_if_absent_numeric(base, "salt_100g", norm.get("salt_g"))
    sm = norm.get("sodium_mg")
    if sm is not None and _to_number(sm) is not None:
        _set_if_absent_numeric(base, "sodium_100g", float(sm) / 1000.0)
    _set_if_absent_numeric(base, "energy-kcal_100g", norm.get("energy_kcal"))
    kj = norm.get("energy_kj")
    if kj is not None and _to_number(kj) is not None:
        _set_if_absent_numeric(base, "energy_100g", float(kj))
        if not str(base.get("energy_unit") or "").strip():
            base["energy_unit"] = "kJ"


def _nutrient_view(record: Dict[str, Any]) -> Dict[str, Any]:
    """Merge top-level fields, ``nutriments``, then normalised nutriments for scoring."""
    base: Dict[str, Any] = dict(record) if record else {}
    nut = record.get("nutriments") if record else None
    if isinstance(nut, dict):
        for k, v in nut.items():
            base[k] = v
    _merge_nutriments_normalized(record or {}, base)
    return base


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


def _count_known_raw(raw: Dict[str, Any]) -> int:
    return sum(1 for v in raw.values() if v is not None)


def _rag_label(
    composite_score: int,
    tags: List[str],
    sufficient_data: bool,
) -> str:
    if not sufficient_data:
        return "InsufficientData"
    bad = {"highSugar", "highSodium", "highSaturatedFat"}
    if bad.intersection(tags):
        return "Red"
    if composite_score < 40:
        return "Red"
    if composite_score >= 60 and not bad.intersection(tags):
        return "Green"
    return "Amber"


def _reasons_from_tags(tags: List[str], sufficient_data: bool) -> List[str]:
    out: List[str] = []
    if not sufficient_data:
        out.append("insufficient nutrient data for a reliable score")
        return out
    priority = [
        "highSugar",
        "highSodium",
        "highSaturatedFat",
        "highFat",
        "highEnergyDensity",
        "lowFibre",
        "moderateFibre",
        "highFibre",
        "highProtein",
        "moderateProtein",
        "lowSugar",
        "balancedNutrition",
    ]
    seen = set()
    for t in priority:
        if t in tags and t in TAG_TO_REASON and t not in seen:
            out.append(TAG_TO_REASON[t])
            seen.add(t)
    for t in tags:
        if t not in seen and t in TAG_TO_REASON:
            out.append(TAG_TO_REASON[t])
            seen.add(t)
    if not out:
        out.append("nutrient profile within typical ranges")
    return out


def _compute_nutrition(product: Dict[str, Any]) -> Dict[str, Any]:
    sugars = _get_first_numeric(product, ["sugars_100g", "sugars", "sugars_value"])
    protein = _get_first_numeric(product, ["proteins_100g", "proteins", "proteins_value"])
    fat = _get_first_numeric(product, ["fat_100g", "fat", "fat_value"])
    sat_fat = _get_first_numeric(
        product,
        ["saturated-fat_100g", "saturated-fat", "saturated-fat_value", "saturated_fat_100g"],
    )
    fibre = _get_first_numeric(product, ["fiber_100g", "fiber", "fiber_value", "fibre_100g", "fibre"])
    sodium = _normalize_sodium(product)
    energy = _get_energy_kcal(product)

    raw = {
        "sugars": sugars,
        "protein": protein,
        "fat": fat,
        "satFat": sat_fat,
        "fibre": fibre,
        "sodium": sodium,
        "energyKcalPer100": energy,
    }
    known_n = _count_known_raw(raw)
    sufficient_data = known_n >= MIN_NUTRIENTS_FOR_SCORE

    scores: Dict[str, float] = {}
    scores["protein"] = 0 if protein is None else min(1.0, protein / max(1.0, NutritionThresholds["protein"]["high"]))
    scores["fibre"] = 0 if fibre is None else min(1.0, fibre / max(1.0, NutritionThresholds["fibre"]["high"]))

    scores["sugar"] = _inv_normalize(sugars, NutritionThresholds["sugar"]["low"], NutritionThresholds["sugar"]["moderate"])
    scores["fat"] = _inv_normalize(fat, NutritionThresholds["fat"]["low"], NutritionThresholds["fat"]["moderate"])
    scores["saturatedFat"] = _inv_normalize(
        sat_fat, NutritionThresholds["saturatedFat"]["low"], NutritionThresholds["saturatedFat"]["moderate"]
    )
    scores["sodium"] = _inv_normalize(sodium, NutritionThresholds["sodium"]["low"], NutritionThresholds["sodium"]["moderate"])
    scores["energy"] = _inv_normalize(energy, NutritionThresholds["energyKcal"]["low"], NutritionThresholds["energyKcal"]["moderate"])

    weights = NutritionThresholds["compositeWeights"]
    composite = (
        (scores.get("protein", 0) * weights["protein"])
        + (scores.get("fibre", 0) * weights["fibre"])
        + (scores.get("sugar", 0) * weights["sugar"])
        + (scores.get("fat", 0) * weights["fat"])
        + (scores.get("saturatedFat", 0) * weights["saturatedFat"])
        + (scores.get("sodium", 0) * weights["sodium"])
        + (scores.get("energy", 0) * weights["energy"])
    )
    composite_internal = round(composite * 100)

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
        else:
            tags.append("lowFibre")

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
    if sufficient_data and composite_internal >= 60 and not has_high_sugar and not has_high_sodium and not has_high_fat:
        tags.append("balancedNutrition")

    numeric_scores = {k: round(v * 100) for k, v in scores.items()}

    health_label = _rag_label(composite_internal, tags, sufficient_data)
    reasons = _reasons_from_tags(tags, sufficient_data)

    return {
        "tags": tags,
        "compositeScore": composite_internal if sufficient_data else None,
        "scores": numeric_scores,
        "raw": raw,
        "healthScore": composite_internal if sufficient_data else None,
        "healthLabel": health_label,
        "reasons": reasons,
        "nutrientsKnownCount": known_n,
        "nutrientsExpected": len(raw),
        "sufficientDataForScore": sufficient_data,
        # Neutral-filled 0–100 estimate when data is thin; do not use for UI badges when insufficient.
        "provisionalCompositeScore": composite_internal,
    }


def compute_health_score_for_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """DB010: Single-product health scoring for tests, API adapters, or `enrich_stage.compute_product_health_score`."""
    view = _nutrient_view(record or {})
    return _compute_nutrition(view)


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
            nutrition = compute_health_score_for_record(rec or {})
            rec_out = dict(rec)
            rec_out.setdefault("enrichment", {})
            rec_out["enrichment"]["nutrition"] = nutrition
            out_list.append(rec_out)
        except Exception:
            failures += 1
            rec = dict(rec or {})
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
