# Nutrient Unit Normalisation

from __future__ import annotations

from typing import Dict, Any, Optional, Tuple
import math
import re
import logging
import pandas as pd

logger = logging.getLogger(__name__)
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
    logger.addHandler(h)
    logger.setLevel(logging.INFO)


DEFAULT_TARGETS = {
    "energy": "kJ",
    "energy-kj": "kJ",
    "energy-kcal": "kCal",
    "fat": "g",
    "saturated-fat": "g",
    "carbohydrates": "g",
    "sugars": "g",
    "proteins": "g",
    "salt": "g",
    "sodium": "mg",
    "fiber": "g",
}

UNIT_RE = re.compile(r"^(?P<sign>[+-])?\s*(?P<number>[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)\s*(?P<unit>.*)$")


def parse_numeric_and_unit(raw: Any) -> Tuple[Optional[float], Optional[str]]:
    if raw is None:
        return None, None
    if isinstance(raw, (int, float)) and not (isinstance(raw, float) and math.isnan(raw)):
        return float(raw), None
    if not isinstance(raw, str):
        return None, None

    s = raw.strip()
    if not s:
        return None, None

    if s.endswith("%"):
        return None, None

    m = UNIT_RE.match(s)
    if not m:
        return None, None

    try:
        num = float(m.group("number"))
    except Exception:
        return None, None

    unit = m.group("unit").strip() or None
    if unit:
        unit = unit.replace("µ", "u")
        unit = unit.replace("μ", "u")
        unit = unit.lower()

    return num, unit


def mass_to_grams(value: float, unit: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    if unit is None or unit in {"g", "gram", "grams"}:
        return float(value)
    if unit in {"mg", "milligram", "milligrams"}:
        return float(value) / 1000.0
    if unit in {"ug", "mcg", "microgram", "micrograms"}:
        return float(value) / 1_000_000.0
    if unit in {"kg", "kilogram", "kilograms"}:
        return float(value) * 1000.0
    return None


def grams_to_mg(g: Optional[float]) -> Optional[float]:
    if g is None:
        return None
    return g * 1000.0


def safe_round(v: Optional[float], decimals: int = 3) -> Optional[float]:
    if v is None:
        return None
    try:
        rv = round(float(v), decimals)
        if rv < 0:
            return 0.0
        return rv
    except Exception:
        return None


def convert_energy(value: float, unit: Optional[str]) -> Tuple[Optional[float], Optional[float]]:
    if value is None:
        return None, None
    if unit is None:
        return None, None
    u = unit.lower()
    kj = None
    kcal = None
    try:
        if u in {"kj", "kilojoule", "kilojoules"}:
            kj = float(value)
            kcal = kj / 4.184
        elif u in {"j", "joule", "joules"}:
            kj = float(value) / 1000.0
            kcal = kj / 4.184
        elif u in {"kcal", "cal", "kilocalorie", "kilocalories"}:
            kcal = float(value)
            kj = kcal * 4.184
        else:
            return None, None
    except Exception:
        return None, None

    return safe_round(kj, 3), safe_round(kcal, 3)


def get_preferred_value(nutriments: Dict[str, Any], base: str) -> Tuple[Optional[float], Optional[str]]:
    candidates = [f"{base}_100g", f"{base}_value", base]
    for key in candidates:
        if key in nutriments:
            raw = nutriments.get(key)
            if isinstance(raw, (int, float)) and not (isinstance(raw, float) and math.isnan(raw)):
                return float(raw), None
            vnum, vun = parse_numeric_and_unit(raw)
            if vnum is not None:
                return vnum, vun

    for unit_key in (f"{base}_unit", f"{base}_100g_unit", f"{base}_unit"):
        if unit_key in nutriments and nutriments.get(unit_key) is not None:
            unit = str(nutriments.get(unit_key)).strip()
            if base in nutriments and isinstance(nutriments[base], (int, float)):
                return float(nutriments[base]), unit

    return None, None


def normalize_nutriments_dict(nutriments: Dict[str, Any], targets: Optional[Dict[str, str]] = None) -> Dict[str, Optional[float]]:
    if targets is None:
        targets = DEFAULT_TARGETS

    out: Dict[str, Optional[float]] = {}

    val_kj, unit_kj = get_preferred_value(nutriments, "energy-kj")
    if val_kj is None:
        val_kj, unit_kj = get_preferred_value(nutriments, "energy")
    val_kcal, unit_kcal = get_preferred_value(nutriments, "energy-kcal")

    if val_kj is not None:
        kj, kcal = convert_energy(val_kj, unit_kj or "kJ")
    elif val_kcal is not None:
        kj, kcal = convert_energy(val_kcal, unit_kcal or "kcal")
    else:
        kj, kcal = None, None

    out["energy_kj"] = kj
    out["energy_kcal"] = kcal

    for base, target in targets.items():
        if base in ("energy", "energy-kj", "energy-kcal"):
            continue
        value, unit = get_preferred_value(nutriments, base)
        if value is None:
            alt_base = base.replace('-', '_')
            value, unit = get_preferred_value(nutriments, alt_base)

        if value is None:
            out_key = f"{base.replace('-', '_')}_{target}"
            out[out_key] = None
            continue

        g = mass_to_grams(value, (unit or None))
        if g is None:
            out_key = f"{base.replace('-', '_')}_{target}"
            out[out_key] = None
            continue

        if target == "g":
            out_key = f"{base.replace('-', '_')}_g"
            out[out_key] = g
        elif target == "mg":
            out_key = f"{base.replace('-', '_')}_mg"
            out[out_key] = grams_to_mg(g)
        else:
            out_key = f"{base.replace('-', '_')}_{target}"
            out[out_key] = g

    try:
        sodium_mg = out.get('sodium_mg')
        salt_g = out.get('salt_g')
        if (sodium_mg is not None) and (salt_g is None):
            derived = (sodium_mg / 1000.0) * 2.5
            out['salt_g'] = derived
    except Exception:
        pass

    for k, v in list(out.items()):
        if isinstance(v, (int, float)):
            out[k] = safe_round(v, 3)

    return out


def normalize_nutrients_df(df: pd.DataFrame, nutriments_col: str = "nutriments", output_prefix: str = "norm_") -> pd.DataFrame:
    if nutriments_col not in df.columns:
        logger.warning(f"Column '{nutriments_col}' not found. Skipping normalization.")
        return df

    def _norm(row):
        nutr = row.get(nutriments_col) or {}
        if not isinstance(nutr, dict):
            return {}
        return normalize_nutriments_dict(nutr)

    logger.info(f"Normalising nutriments column '{nutriments_col}' for {len(df)} rows")
    norms = df.apply(_norm, axis=1)
    norm_df = pd.DataFrame(list(norms.values)) if len(norms) else pd.DataFrame()
    norm_df = norm_df.add_prefix(output_prefix)
    out_df = pd.concat([df.reset_index(drop=True), norm_df.reset_index(drop=True)], axis=1)
    return out_df


def map_normalized_to_scorer_fields(norm: Dict[str, Optional[float]]) -> Dict[str, Optional[float]]:
    out: Dict[str, Optional[float]] = {}
    def set_variants(base: str, grams: Optional[float]):
        if grams is None:
            return
        base_underscore = base.replace('-', '_')
        base_hyphen = base
        out[f"{base_underscore}_100g"] = grams
        out[f"{base_underscore}"] = grams
        out[f"{base_underscore}_value"] = grams
        if '-' in base:
            out[f"{base_hyphen}_100g"] = grams
            out[f"{base_hyphen}"] = grams
            out[f"{base_hyphen}_value"] = grams

    for base, target in DEFAULT_TARGETS.items():
        if base in ("energy", "energy-kj", "energy-kcal"):
            continue
        key = f"{base.replace('-', '_')}_{target}"
        val = norm.get(key)
        if val is None:
            for alt in ("_g", "_mg"):
                altk = f"{base.replace('-', '_')}{alt}"
                if altk in norm and norm.get(altk) is not None:
                    val = norm.get(altk)
                    break
        if val is None:
            continue
        try:
            if target == 'g':
                grams = float(val)
            elif target == 'mg':
                grams = float(val) / 1000.0
            else:
                grams = float(val)
        except Exception:
            grams = None
        set_variants(base, grams)

    if 'salt_g' in norm and norm.get('salt_g') is not None:
        try:
            salt = float(norm.get('salt_g'))
            out['salt_100g'] = salt
            out['salt'] = salt
            out['salt_value'] = salt
        except Exception:
            pass

    if 'energy_kcal' in norm and norm.get('energy_kcal') is not None:
        try:
            kcal = float(norm.get('energy_kcal'))
            out['energy-kcal_100g'] = kcal
            out['energy-kcal'] = kcal
            out['energy-kcal_unit'] = 'kcal'
        except Exception:
            pass

    if 'energy_kj' in norm and norm.get('energy_kj') is not None:
        try:
            kj = float(norm.get('energy_kj'))
            out['energy_100g'] = kj
            out['energy_unit'] = 'kJ'
        except Exception:
            pass

    if 'sodium_mg' in norm and norm.get('sodium_mg') is not None:
        try:
            sodium_g = float(norm.get('sodium_mg')) / 1000.0
            out['sodium_100g'] = sodium_g
            out['sodium'] = sodium_g
            out['sodium_value'] = sodium_g
        except Exception:
            pass

    if 'sodium_g' in norm and norm.get('sodium_g') is not None:
        try:
            sodium_g = float(norm.get('sodium_g'))
            out['sodium_100g'] = sodium_g
            out['sodium'] = sodium_g
            out['sodium_value'] = sodium_g
        except Exception:
            pass

    return out
