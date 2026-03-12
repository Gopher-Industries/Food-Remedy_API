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


# Default target units for common nutrients. Keys are simplified nutrient base names as they appear in OpenFoodFacts (hyphens preserved).
DEFAULT_TARGETS = {
    "energy": "kJ",  # energy will output both kJ and kCal
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


def parse_numeric_and_unit(raw: Any) -> Tuple[Optional[float], Optional[str]]: # Parse a raw value which can be a number, or a string
    if raw is None:
        return None, None
    if isinstance(raw, (int, float)) and not (isinstance(raw, float) and math.isnan(raw)):
        return float(raw), None
    if not isinstance(raw, str):
        return None, None

    s = raw.strip()
    if not s:
        return None, None

    if s.endswith("%"):     # ignore percentage values
        return None, None

    m = UNIT_RE.match(s)
    if not m:
        return None, None

    try:
        num = float(m.group("number"))
    except Exception:
        return None, None

    unit = m.group("unit").strip() or None
    if unit: # normalise common micro symbol
        unit = unit.replace("µ", "u")
        unit = unit.replace("μ", "u")
        unit = unit.lower()

    return num, unit


def mass_to_grams(value: float, unit: Optional[str]) -> Optional[float]: # Convert mass-like unit to grams. If unit is unknown, assume grams.
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
    """Round to given decimals and clip negatives to zero. None stays None."""
    if v is None:
        return None
    try:
        rv = round(float(v), decimals)
        if rv < 0:
            return 0.0
        return rv
    except Exception:
        return None


def convert_energy(value: float, unit: Optional[str]) -> Tuple[Optional[float], Optional[float]]: # Return (kJ, kCal) given a numeric energy value and unit
    if value is None:
        return None, None
    if unit is None:
        return None, None
    u = unit.lower()
    kj = None
    kcal = None
    try:
        # Accept 'kj' and 'kJ' family; treat 'cal' as 'kcal' where appropriate (explicit assumption)
        # Note: on food labels "cal" is commonly used to mean kilocalorie; we accept that mapping here.
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


def get_preferred_value(nutriments: Dict[str, Any], base: str) -> Tuple[Optional[float], Optional[str]]: # Extract the best candidate numeric value and unit for a base nutrient.
    # Deterministic preference:
    # 1) <base>_100g (text or numeric), 2) <base>_value, 3) <base> numeric
    candidates = [f"{base}_100g", f"{base}_value", base]
    for key in candidates:
        if key in nutriments:
            raw = nutriments.get(key)
            if isinstance(raw, (int, float)) and not (isinstance(raw, float) and math.isnan(raw)):
                return float(raw), None
            vnum, vun = parse_numeric_and_unit(raw)
            if vnum is not None:
                return vnum, vun

    # fallback: explicit unit field alongside numeric base
    for unit_key in (f"{base}_unit", f"{base}_100g_unit", f"{base}_unit"):
        if unit_key in nutriments and nutriments.get(unit_key) is not None:
            unit = str(nutriments.get(unit_key)).strip()
            if base in nutriments and isinstance(nutriments[base], (int, float)):
                return float(nutriments[base]), unit

    return None, None


def normalize_nutriments_dict(nutriments: Dict[str, Any], targets: Optional[Dict[str, str]] = None) -> Dict[str, Optional[float]]: # Normalize a nutriments dict from OpenFoodFacts
    if targets is None:
        targets = DEFAULT_TARGETS

    out: Dict[str, Optional[float]] = {}

    val_kj, unit_kj = get_preferred_value(nutriments, "energy-kj") # Energy: handle both energy-kj and energy-kcal sources, and prefer 100g values try energy-kj first
    if val_kj is None:
        val_kj, unit_kj = get_preferred_value(nutriments, "energy")
    val_kcal, unit_kcal = get_preferred_value(nutriments, "energy-kcal")

    # Convert/compute energy
    if val_kj is not None:
        kj, kcal = convert_energy(val_kj, unit_kj or "kJ")
    elif val_kcal is not None:
        kj, kcal = convert_energy(val_kcal, unit_kcal or "kcal")
    else:
        kj, kcal = None, None

    out["energy_kj"] = kj
    out["energy_kcal"] = kcal

    # iterate through targets for mass nutrients
    for base, target in targets.items():
        if base in ("energy", "energy-kj", "energy-kcal"):
            continue
        value, unit = get_preferred_value(nutriments, base)
        if value is None:
            # also try keys with underscores or hyphens variants
            alt_base = base.replace('-', '_')
            value, unit = get_preferred_value(nutriments, alt_base)

        if value is None:
            out_key = f"{base.replace('-', '_')}_{target}"
            out[out_key] = None
            continue

        # Convert mass
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

    # Derive salt_g from sodium_mg if missing and reasonable
    try:
        sodium_mg = out.get('sodium_mg')
        salt_g = out.get('salt_g')
        if (sodium_mg is not None) and (salt_g is None):
            # Na (sodium) mass -> approximate salt (NaCl) using factor 2.5
            derived = (sodium_mg / 1000.0) * 2.5
            out['salt_g'] = derived
    except Exception:
        pass

    # Apply safe rounding and clip negatives
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
    # norms is a Series of dicts — create DataFrame from these dicts
    norm_df = pd.DataFrame(list(norms.values)) if len(norms) else pd.DataFrame()

    # prefix columns and join
    norm_df = norm_df.add_prefix(output_prefix)
    out_df = pd.concat([df.reset_index(drop=True), norm_df.reset_index(drop=True)], axis=1)
    return out_df


def map_normalized_to_scorer_fields(norm: Dict[str, Optional[float]]) -> Dict[str, Optional[float]]:
    """Map the flat normalized nutrient outputs to the field names expected by the mobile `nutritionScorer`.

    - Input: output of `normalize_nutriments_dict()` (flat keys like `sugars_g`, `sodium_mg`, `energy_kcal`, ...)
    - Output: dict with keys like `sugars_100g`, `sugars`, `sugars_value`, `proteins_100g`, `sodium_100g`,
      `energy-kcal_100g`, `energy-kcal_unit`, etc.

    Values are numeric and expressed per‑100g in grams (sodium converted from mg->g when needed).
    """
    out: Dict[str, Optional[float]] = {}

    # Helper to set variants (underscore and hyphen for bases containing '-')
    def set_variants(base: str, grams: Optional[float]):
        if grams is None:
            return
        base_underscore = base.replace('-', '_')
        base_hyphen = base

        # per-100g canonical keys
        out[f"{base_underscore}_100g"] = grams
        out[f"{base_underscore}"] = grams
        out[f"{base_underscore}_value"] = grams

        # also supply hyphenated variants because some code uses hyphen names
        if '-' in base:
            out[f"{base_hyphen}_100g"] = grams
            out[f"{base_hyphen}"] = grams
            out[f"{base_hyphen}_value"] = grams

    # Map mass nutrients according to DEFAULT_TARGETS
    for base, target in DEFAULT_TARGETS.items():
        if base in ("energy", "energy-kj", "energy-kcal"):
            continue
        key = f"{base.replace('-', '_')}_{target}"
        val = norm.get(key)
        if val is None:
            # fallback: try common suffixes
            for alt in ("_g", "_mg"):
                altk = f"{base.replace('-', '_')}{alt}"
                if altk in norm and norm.get(altk) is not None:
                    val = norm.get(altk)
                    break

        if val is None:
            continue

        # convert to grams per 100g
        try:
            if target == 'g':
                grams = float(val)
            elif target == 'mg':
                grams = float(val) / 1000.0
            else:
                # unknown target - attempt best-effort
                grams = float(val)
        except Exception:
            grams = None

        set_variants(base, grams)

    # Special: if salt present (salt_g), ensure salt fields exist
    if 'salt_g' in norm and norm.get('salt_g') is not None:
        try:
            salt = float(norm.get('salt_g'))
            out['salt_100g'] = salt
            out['salt'] = salt
            out['salt_value'] = salt
        except Exception:
            pass

    # Special: energy handling -> prefer kcal field for scorer
    # If energy_kcal present, emit energy-kcal_100g and units
    if 'energy_kcal' in norm and norm.get('energy_kcal') is not None:
        try:
            kcal = float(norm.get('energy_kcal'))
            out['energy-kcal_100g'] = kcal
            out['energy-kcal'] = kcal
            out['energy-kcal_unit'] = 'kcal'
        except Exception:
            pass

    # If energy_kj present, emit energy_100g and unit
    if 'energy_kj' in norm and norm.get('energy_kj') is not None:
        try:
            kj = float(norm.get('energy_kj'))
            out['energy_100g'] = kj
            out['energy_unit'] = 'kJ'
        except Exception:
            pass

    # If sodium was produced in mg (sodium_mg) convert to g and set sodium fields
    if 'sodium_mg' in norm and norm.get('sodium_mg') is not None:
        try:
            sodium_g = float(norm.get('sodium_mg')) / 1000.0
            out['sodium_100g'] = sodium_g
            out['sodium'] = sodium_g
            out['sodium_value'] = sodium_g
        except Exception:
            pass

    # If sodium already present in grams (sodium_g)
    if 'sodium_g' in norm and norm.get('sodium_g') is not None:
        try:
            sodium_g = float(norm.get('sodium_g'))
            out['sodium_100g'] = sodium_g
            out['sodium'] = sodium_g
            out['sodium_value'] = sodium_g
        except Exception:
            pass

    return out


# -----------------------------
# Basic test suite (runnable):
# -----------------------------

def _test_convert_energy():
    kj, kcal = convert_energy(418.4, 'kJ')
    assert round(kj, 1) == 418.4
    assert round(kcal, 3) == 100.0

    kj2, kcal2 = convert_energy(100, 'kcal')
    assert round(kcal2, 3) == 100.0
    assert round(kj2, 3) == 418.4


def _test_mass_to_grams():
    assert mass_to_grams(1000, 'mg') == 1.0
    assert mass_to_grams(1000000, 'ug') == 1.0
    assert mass_to_grams(0.002, 'kg') == 2.0


def _test_parse_numeric_and_unit():
    v, u = parse_numeric_and_unit('12.5 mg')
    assert v == 12.5 and u == 'mg'

    v2, u2 = parse_numeric_and_unit('250kJ')
    assert v2 == 250 and (u2 == 'kj' or u2 == 'kj')

    v3, u3 = parse_numeric_and_unit('10 µg')
    assert v3 == 10 and u3 == 'ug'

    v4, u4 = parse_numeric_and_unit('15%')
    assert v4 is None and u4 is None


def _test_normalize_nutriments_dict_keys():
    sample = {
        'sugars_100g': '10 g',
        'proteins_100g': '5 g',
        'sodium_100g': '200 mg',
        'energy-kcal_100g': '250 kcal'
    }
    out = normalize_nutriments_dict(sample)
    # Expect keys present and salt derived
    assert 'sugars_g' in out
    assert 'proteins_g' in out
    assert 'sodium_mg' in out
    assert 'salt_g' in out
    assert 'energy_kj' in out and 'energy_kcal' in out


def run_tests():
    _test_convert_energy()
    _test_mass_to_grams()
    _test_parse_numeric_and_unit()
    _test_normalize_nutriments_dict_keys()
    print('All tests passed')


if __name__ == '__main__':
    run_tests()