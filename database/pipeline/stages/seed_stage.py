import logging
from typing import Any, List, Mapping, Tuple

logger = logging.getLogger(__name__)
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
    logger.addHandler(_h)
    logger.setLevel(logging.INFO)

# Canonical names (used in _missing lists) → possible keys on a record (OFF snake_case or cleaned camelCase).
CRITICAL_FIELD_ALIASES: List[Tuple[str, Tuple[str, ...]]] = [
    ("code", ("code", "barcode")),
    ("product_name", ("product_name", "productName")),
    ("ingredients_text", ("ingredients_text", "ingredientsText")),
    ("categories_tags", ("categories_tags", "categories")),
]

OPTIONAL_FIELD_ALIASES: List[Tuple[str, Tuple[str, ...]]] = [
    ("nutriments", ("nutriments",)),
    ("labels_tags", ("labels_tags", "labels")),
    ("brands", ("brands", "brand")),
    ("quantity", ("quantity", "product_quantity")),
    ("serving_size", ("serving_size", "serving_size_text")),
]


def _is_nonempty_scalar_or_collection(val: Any) -> bool:
    if val is None:
        return False
    if isinstance(val, str):
        return bool(val.strip())
    if isinstance(val, (list, tuple, set)):
        return len(val) > 0
    if isinstance(val, dict):
        return len(val) > 0
    return True


def _first_value_for_aliases(product: Mapping[str, Any], aliases: Tuple[str, ...]) -> Any:
    for key in aliases:
        if key in product:
            return product.get(key)
    return None


def _critical_missing(product: Mapping[str, Any]) -> List[str]:
    missing: List[str] = []
    for canonical, aliases in CRITICAL_FIELD_ALIASES:
        if not any(_is_nonempty_scalar_or_collection(product.get(k)) for k in aliases):
            missing.append(canonical)
    return missing


def _nutriments_is_missing(product: Mapping[str, Any]) -> bool:
    """True when there is no usable nutrient dict (missing key, None, or empty dict). Non-empty dict counts as present even if values are zero."""
    n = _first_value_for_aliases(product, ("nutriments",))
    if n is None:
        return True
    if not isinstance(n, dict):
        return True
    return len(n) == 0


def _optional_missing(product: Mapping[str, Any]) -> List[str]:
    missing: List[str] = []
    for canonical, aliases in OPTIONAL_FIELD_ALIASES:
        if canonical == "nutriments":
            if _nutriments_is_missing(product):
                missing.append(canonical)
            continue
        if not any(_is_nonempty_scalar_or_collection(product.get(k)) for k in aliases):
            missing.append(canonical)
    return missing


def _standardise_optional_placeholders(product: dict) -> None:
    """Explicit null for missing nutriments only (empty dict ≠ real zeros once keys exist)."""
    if _nutriments_is_missing(product):
        product["nutriments"] = None


def handle_missing_fields(product: dict) -> dict:
    """
    Annotate product with _missing and _status (DB007).
    Critical vs optional use alias-aware checks; nutriments {} is missing, nutriments with keys may include zeros.
    """
    missing_critical = _critical_missing(product)
    missing_optional = _optional_missing(product)
    _standardise_optional_placeholders(product)

    product["_missing"] = {
        "critical": missing_critical,
        "optional": missing_optional,
        "reason": (
            "Missing critical fields: " + ", ".join(missing_critical)
            if missing_critical
            else (
                "Optional fields missing or empty"
                if missing_optional
                else "All required fields present"
            )
        ),
    }

    if missing_critical:
        product["_status"] = "incomplete"
    else:
        product["_status"] = "valid"

    return product


def is_product_usable(product: dict) -> bool:
    """True when there are no missing critical fields (prefer running handle_missing_fields first)."""
    if "_missing" not in product:
        handle_missing_fields(product)
    return len(product.get("_missing", {}).get("critical", [])) == 0


def log_missing_fields(product: dict) -> None:
    if "_missing" not in product:
        handle_missing_fields(product)
    miss = product["_missing"]
    if miss["critical"]:
        logger.warning(
            "[DB007][CRITICAL MISSING] %s -> %s",
            product.get("code") or product.get("barcode"),
            miss["critical"],
        )
    if miss["optional"]:
        logger.info(
            "[DB007][OPTIONAL MISSING] %s -> %s",
            product.get("code") or product.get("barcode"),
            miss["optional"],
        )
