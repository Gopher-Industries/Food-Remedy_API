#import sys
#sys.path.append("..") 
#from constants import MISSING_STRINGS, EMPTY_LIST, EMPTY_DICT

## use the above if the following does not work
from database.clean_data.constants import (
    MISSING_STRINGS,
    EMPTY_LIST,
    EMPTY_DICT
)


def normalize_string(value):
    """Convert missing string markers to None, otherwise strip."""
    if isinstance(value, str):
        stripped = value.strip().lower()
        return None if stripped in MISSING_STRINGS else value.strip()
    return None


def normalize_list(value):
    """Convert malformed/empty lists to canonical empty list."""
    if value is None or value in (EMPTY_LIST, []):
        return EMPTY_LIST
    
    if isinstance(value, str):
        # Handle comma-separated string case
        stripped = value.strip().lower()
        if stripped in MISSING_STRINGS:
            return EMPTY_LIST
        items = [item.strip() for item in value.split(",") if item.strip()]
        return EMPTY_LIST if not items else items
    
    if isinstance(value, list):
        # Filter out missing strings inside list
        cleaned = [normalize_string(item) for item in value if normalize_string(item) is not None]
        return cleaned if cleaned else EMPTY_LIST
    
    return EMPTY_LIST


def clean_numeric(value, default=None):
    """Convert string numbers or malformed to float, else default."""
    if value is None:
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default
    

def normalize_quantity_with_unit(value):
    """Handle cases like "5 g" → (5.0, "g") or just return cleaned value."""
    if isinstance(value, str):
        # Simple regex to extract number + unit
        import re
        match = re.match(r"(\d+\.?\d*)\s*([a-zA-Z]+)?", value.strip())
        if match:
            num = float(match.group(1))
            unit = match.group(2) or "g"
            return num, unit.lower()
    return value, None  # case of fallback


def normalize_dict(value, default=None, recurse=False):
    """Normalize dict: empty/malformed → EMPTY_DICT, optional recursive cleaning."""
    if value is None or value == {} or value == EMPTY_DICT:
        return EMPTY_DICT
    
    if not isinstance(value, dict):
        return EMPTY_DICT
    
    if not recurse:
        return dict(value)  # shallow copy
    
    # Recursive mode for nested structures like nutriments
    cleaned = {}
    for k, v in value.items():
        if isinstance(v, dict):
            cleaned[k] = normalize_dict(v, default, recurse=True)
        elif isinstance(v, list):
            cleaned[k] = normalize_list(v)
        elif isinstance(v, str):
            cleaned[k] = clean_numeric(v, default)
        else:
            cleaned[k] = clean_numeric(v, default)
    return cleaned


def normalize_palm_oil_indicator(value):
    """Special handling for palm-oil indicators: "0"/0/"no"/"none"/"n/a" → False, else True."""
    if value is None:
        return None
    normalized = normalize_string(str(value)).lower() if not isinstance(value, bool) else str(value)
    false_markers = {"0", "no", "none", "n/a", "false"}
    return False if normalized in false_markers else True